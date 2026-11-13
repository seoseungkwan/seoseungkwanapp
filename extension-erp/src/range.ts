// 기간 채우기 흐름(spec erp-closing-range design.md 3절). DOM을 모른다: 부품(deps)을 받아 차례만 정한다
// - scanRange(살펴보기): 날마다 날짜 바꾸기 → 다 불러옴 → 멈출 일 → 마감일지 있음·상태 → closing.day. 칸을 바꾸지 않고 저장도 누르지 않는다
// - runRange(채우기): 날마다 날짜 바꾸기 → 다 불러옴 → 멈출 일 → 되살린 입력 띠 → closing.day 다시 → 진료 0건 → 채움 →
//   업무일지 1 '전체 저장' → 업무일지 2 '일일 상세 저장' → 다시 불러오기 기다림. 한 번에 하나씩
// - [멈추기]·화면 떠남(gone)은 날짜를 바꾸기 전에 본다. 화면을 떠났으면 아무 안내 없이 곧바로 끝낸다
// - 결과는 돌려주기만 하고 어디에도 저장하지 않는다(AC-3703.5)
import type { Block, FailWhy, JournalState, LoadResult, RunSummary, SaveResult, ScanSummary } from './rangeTypes.js'
import type { ClosingDay, OverlapChoice } from './types.js'

export type RangeDeps = {
  setDate(date: string): Promise<void>
  waitLoaded(date: string): Promise<LoadResult>
  blocker(): Block | null
  draftNotice(): boolean
  readJournal(): JournalState
  /** closing.day. 도우미 오류는 { block: { kind: 'helper', code } } */
  askDay(date: string): Promise<{ day: ClosingDay } | { block: Block }>
  /** planCells(day, settings, choice) + fillAll(doc, plan, 'all') */
  fill(day: ClosingDay, choice: OverlapChoice | undefined): Promise<void>
  save(which: 'w1' | 'w2'): Promise<SaveResult>
  /** 화면을 떠났으면 true: 곧바로 조용히 끝낸다(아무 안내 없음) */
  gone(): boolean
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' 기간 안 날, 옛날부터 양 끝 포함. 시작일 > 끝일이거나 날짜가 아니면 없다 */
export function rangeDays(from: string, to: string): string[] {
  if (!DAY.test(from) || !DAY.test(to)) return []
  const days: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let at = new Date(`${from}T00:00:00Z`); at.getTime() <= end; at.setUTCDate(at.getUTCDate() + 1)) {
    days.push(at.toISOString().slice(0, 10))
  }
  return days
}

/**
 * 살펴보기(AC-3702.1): 날마다 불러온 뒤 그날 마감일지·상태와 도우미 진료 수를 읽어 나눈다.
 * 다 불러오지 못한 날은 도우미를 부르지 않고 unloaded에 넣는다(채울 때 다시 불러옴). 멈출 일·도우미 오류면 { block }.
 * cancel()이면 지금 날을 끝낸 뒤 그만둔다
 */
export async function scanRange(
  days: string[],
  deps: RangeDeps,
  onProgress: (done: number) => void,
  cancel: () => boolean,
): Promise<{ scan: ScanSummary } | { block: Block } | { cancelled: true } | { gone: true }> {
  const scan: ScanSummary = {
    from: days[0] ?? '',
    to: days[days.length - 1] ?? '',
    fill: [],
    fresh: [],
    written: [],
    zero: [],
    unloaded: [],
    overlapVisits: 0,
  }
  for (const [i, date] of days.entries()) {
    if (deps.gone()) return { gone: true }
    await deps.setDate(date)
    if (deps.gone()) return { gone: true }
    const loaded = await deps.waitLoaded(date)
    if (deps.gone()) return { gone: true }
    if (loaded !== 'ok') {
      scan.unloaded.push(date)
      scan.fill.push(date)
    } else {
      const block = deps.blocker()
      if (block) return { block }
      const journal = deps.readJournal()
      const asked = await deps.askDay(date)
      if (deps.gone()) return { gone: true }
      if ('block' in asked) return { block: asked.block }
      const { day } = asked
      // 진료 0건인 날은 마감일지가 있어도 건너뛸 날에만 센다(AC-3702.2)
      if (day.patients.total === 0) scan.zero.push(date)
      else {
        if (journal.exists) scan.written.push({ date, status: journal.status })
        else scan.fresh.push(date)
        scan.fill.push(date)
      }
      scan.overlapVisits += day.overlap?.visits ?? 0
    }
    onProgress(i + 1)
    if (cancel()) return { cancelled: true }
  }
  return { scan }
}

const failWhy = (which: 'w1' | 'w2', result: SaveResult): FailWhy =>
  result === 'timeout' ? (which === 'w1' ? 'w1Timeout' : 'w2Timeout') : which === 'w1' ? 'w1Error' : 'w2Error'

/**
 * 채우기(AC-3703.1): 날마다 채우고 두 저장을 확인한다. 불러오지 못함·저장 실패는 그날만 failed에 넣고 다음 날로,
 * 되살린 입력 띠·진료 0건은 skipped. 멈출 일·도우미 오류면 그날을 남은 날 맨 앞에 두고 'blocked'.
 * stop()은 날짜를 바꾸기 전에 본다(지금 날은 저장 확인까지 끝냄). prior(이어서 하기)가 있으면 그 결과에 더하고 total·기간은 그대로.
 * onProgress(저장한 날 수, 지금 날)는 날마다 시작할 때 부른다
 */
export async function runRange(
  days: string[],
  deps: RangeDeps,
  choice: OverlapChoice | undefined,
  onProgress: (saved: number, current: string) => void,
  stop: () => boolean,
  prior?: RunSummary,
): Promise<{ run: RunSummary; outcome: 'end' | 'stopped' | 'blocked'; block?: Block } | { gone: true }> {
  const run: RunSummary = {
    from: prior?.from ?? days[0] ?? '',
    to: prior?.to ?? days[days.length - 1] ?? '',
    total: prior?.total ?? days.length,
    saved: [...(prior?.saved ?? [])],
    skipped: [...(prior?.skipped ?? [])],
    failed: [...(prior?.failed ?? [])],
    remaining: [...days],
  }
  /** 그날 차례가 끝났다(남은 날에서 뺀다) */
  const done = () => {
    run.remaining.shift()
  }
  for (const date of days) {
    if (deps.gone()) return { gone: true }
    if (stop()) return { run, outcome: 'stopped' }
    onProgress(run.saved.length, date)
    await deps.setDate(date)
    if (deps.gone()) return { gone: true }
    if ((await deps.waitLoaded(date)) !== 'ok') {
      if (deps.gone()) return { gone: true }
      run.failed.push({ date, why: 'load' })
      done()
      continue
    }
    if (deps.gone()) return { gone: true }
    const block = deps.blocker()
    if (block) return { run, outcome: 'blocked', block }
    if (deps.draftNotice()) {
      run.skipped.push({ date, why: 'draft' })
      done()
      continue
    }
    const asked = await deps.askDay(date)
    if (deps.gone()) return { gone: true }
    if ('block' in asked) return { run, outcome: 'blocked', block: asked.block }
    if (asked.day.patients.total === 0) {
      run.skipped.push({ date, why: 'zero' })
      done()
      continue
    }
    await deps.fill(asked.day, choice)
    if (deps.gone()) return { gone: true }
    const w1 = await deps.save('w1')
    if (deps.gone()) return { gone: true }
    if (w1 !== 'ok') {
      run.failed.push({ date, why: failWhy('w1', w1) })
      done()
      continue
    }
    const w2 = await deps.save('w2')
    if (deps.gone()) return { gone: true }
    if (w2 !== 'ok') {
      run.failed.push({ date, why: failWhy('w2', w2) })
      done()
      continue
    }
    run.saved.push(date)
    done()
    // 2 저장 뒤 ERP가 그날을 다시 불러온다: 다음 날 날짜를 바꾸기 전에 끝나게 기다린다(결과는 보지 않음)
    await deps.waitLoaded(date)
  }
  if (deps.gone()) return { gone: true }
  return { run, outcome: 'end' }
}
