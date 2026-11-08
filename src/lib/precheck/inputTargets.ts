import { compareYmd, isYmd } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { CodeChip, InputSelection, InputTargets, LeftReason, TargetRow, TargetVisit } from '@/types/precheck'
import { inputPlan, isBlankMemo } from './memoCompare'

// 입력 대상 고르기(AC-018.8~AC-018.13·AC-018.20·AC-018.23·AC-018.26, design.md 19-1) [환자 자료 구역]. 순수 함수이고 부르는 곳은 Worker(jobs.ts)다.
// 고를 때마다 입력할 사람과 빠지는 사람(까닭 하나씩)을 돌려주고, [비트에 입력]의 묶음은 이 결과 그대로다. 사람마다 넣고 빼는 체크는 없다.
// 다른 메모·확인 표시·조회 못함의 판단은 inputPlan(AC-016.3) 하나로 하고, 여기서는 그것이 모르는 완료 표시·직접 입력·지난번 건너뜀과 범위만 더한다.

export type { TargetVisit } from '@/types/precheck'

/** AC-017.1이 받는 묶음 크기. 넘으면 묶음 전체가 거절되므로 보내지 않는다 */
export const MAX_BATCH = 500

/** AC-036.1의 코드 모양(commands.json과 같다) */
const CODE_SHAPE = /^[0-9A-Z][0-9A-Z.-]{0,19}$/

export type TargetContext = {
  /** 마지막 [자료 불러오기]의 고른 기간. claim.memos가 이 기간만 읽어 그 밖은 비교할 수 없다(AC-018.9) */
  visible: DateRange
  /** store.load의 완료 표시와 이번 입력에서 끝난 사람(글 없는 표시 포함) */
  done: ReadonlySet<string>
  /** 지난번 건너뛴 사람: 내원번호 → 그때 글(AC-018.20) */
  held: ReadonlyMap<string, string>
  /** 도우미가 같은 날 내원이 여럿이라 돌려준 사람(AC-018.13) */
  foundByPc: ReadonlySet<string>
  /** 처방코드 사전(CODEMAP) 찾기. 코드 단추는 k가 proc인 코드만 보인다 */
  codeInfo(code: string): { k: string; n: string } | null
  /** 자리를 지킬 사람: 이 불러오기에서 복사로 새로 완료했다. 완료가 아닌 것처럼 묶음을 정하고 done만 켠다(AC-3104.4) */
  keep?: ReadonlySet<string>
}

const GROUP_ORDER: readonly LeftReason[] = ['done', 'nomemo', 'mark', 'manual', 'diff', 'unread', 'held']

const norm = (code: string) => code.trim().toUpperCase()
const short = (ymd: string) => `${ymd.slice(5, 7)}/${ymd.slice(8)}`
const inRange = (date: string, { from, to }: DateRange) => compareYmd(date, from) >= 0 && compareYmd(date, to) <= 0
const spanText = ({ from, to }: DateRange) => `${short(from)} ~ ${short(to)}`

/** 날짜 칸 안내(AC-018.9). 이 차례로 본다 */
function dateProblem(from: string, to: string, visible: DateRange): string | null {
  if (!from || !to || !isYmd(from) || !isYmd(to)) return '날짜를 골라 주세요'
  if (!inRange(from, visible) || !inRange(to, visible)) return '불러온 기간 안에서 골라 주세요'
  if (compareYmd(from, to) > 0) return '기간의 시작일이 종료일보다 늦습니다.'
  return null
}

/**
 * 빠지는 까닭 하나(AC-018.26의 차례: 완료 > 메모 없음 > 직접 입력 > 확인 표시 > 조회 못함 > 다른 메모 > 지난번 건너뜀). 없으면 입력할 사람이다.
 * done은 완료인가(AC-3104.4). 자리를 지킬 사람(keep)은 완료여도 완료를 빼고 까닭을 본다
 */
function reasonOf(visit: TargetVisit, sameDay: number, context: TargetContext): { reason: LeftReason | null; replaces?: string; done: boolean } {
  const plan = inputPlan([visit])
  const done = context.done.has(visit.key) || plan.done.length > 0
  if (done && !context.keep?.has(visit.key)) return { reason: 'done', done }
  const found = reasonAfterDone(visit, sameDay, context, plan)
  return { ...found, done }
}

function reasonAfterDone(visit: TargetVisit, sameDay: number, context: TargetContext, plan: ReturnType<typeof inputPlan>): { reason: LeftReason | null; replaces?: string } {
  const skipped = plan.skipped[0]?.reason
  if (skipped === '메모 없음') return { reason: 'nomemo' }
  if (sameDay > 1 || context.foundByPc.has(visit.key)) return { reason: 'manual' }
  if (skipped === '확인 표시') return { reason: 'mark' }
  if (skipped === '조회 못함') return { reason: 'unread' }
  if (skipped === '이미 있음') return { reason: 'diff' }
  if (context.held.get(visit.key) === visit.text) return { reason: 'held' }
  return { reason: null, replaces: plan.batch[0]?.replaces }
}

/** 메모가 넣을 수 있는가(아직 안 된 진료의 '메모 없음'이 아닌가) */
const hasText = (visit: TargetVisit) => visit.hasMemo && !isBlankMemo(visit.text)

/** 코드 단추(AC-018.10): 불러온 기간 전체의 아직 안 된 진료에 있는 시술 코드를 많은 차례로 */
function chipsOf(visits: readonly TargetVisit[], context: TargetContext): CodeChip[] {
  const counts = new Map<string, CodeChip>()
  for (const visit of visits) {
    if (!inRange(visit.date, context.visible) || !hasText(visit) || visit.compare === '같음' || context.done.has(visit.key)) continue
    for (const code of new Set(visit.rx.map(norm))) {
      const info = context.codeInfo(code)
      if (info?.k !== 'proc') continue
      const chip = counts.get(code) ?? { code, name: info.n, count: 0 }
      chip.count += 1
      counts.set(code, chip)
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

export function inputTargets(visits: readonly TargetVisit[], selection: InputSelection, context: TargetContext): InputTargets {
  const typed = norm(selection.typed)
  const empty = (problem: string, range: DateRange | null = null): InputTargets => ({ problem, range, code: null, batch: [], left: [], chips: chipsOf(visits, context), typedOverChip: typed !== '' && selection.chip !== '', replacing: 0 })
  const range: DateRange = selection.mode === 'code' ? { from: selection.from, to: selection.to } : selection.kind === 'day' ? { from: selection.day, to: selection.day } : { from: selection.rangeFrom, to: selection.rangeTo }
  const wrong = dateProblem(range.from, range.to, context.visible)
  if (wrong) return empty(wrong)

  let code: string | null = null
  if (selection.mode === 'code') {
    code = typed || selection.chip
    if (!code) return empty('코드 단추를 고르거나 처방코드를 넣어 주세요', range)
    if (!CODE_SHAPE.test(code)) return empty('처방코드 하나만 넣어 주세요. (예: LA358)', range)
  }

  const sameDay = new Map<string, number>()
  for (const visit of visits) sameDay.set(`${visit.chart}|${visit.date}`, (sameDay.get(`${visit.chart}|${visit.date}`) ?? 0) + 1)

  // 날짜 순서, 같은 날은 목록 차례(Array.prototype.sort는 안정 정렬이다)
  const pool = visits.filter((visit) => inRange(visit.date, range) && (code === null || visit.rx.some((rx) => norm(rx) === code))).sort((a, b) => compareYmd(a.date, b.date))
  const batch: TargetRow[] = []
  const groups = new Map<LeftReason, TargetRow[]>()
  for (const visit of pool) {
    const count = sameDay.get(`${visit.chart}|${visit.date}`) ?? 1
    const { reason, replaces, done } = reasonOf(visit, count, context)
    const row: TargetRow = { ...visit, sameDay: count, foundByPc: context.foundByPc.has(visit.key), chip: null, done }
    if (reason) {
      groups.set(reason, [...(groups.get(reason) ?? []), row])
      continue
    }
    if (replaces !== undefined) row.replaces = replaces
    row.chip = visit.compare !== '다름' ? '새 메모' : '메모 바꿈'
    batch.push(row)
  }
  const left = GROUP_ORDER.flatMap((reason) => {
    const rows = groups.get(reason)
    return rows ? [{ reason, rows }] : []
  })

  // 넣을 사람은 입력할 사람 가운데 완료가 아닌 줄이다: 자리를 지키는 완료 줄은 세지 않는다(AC-3104.5)
  const sendable = batch.filter((row) => !row.done)
  const result: InputTargets = { problem: null, range, code, batch, left, chips: chipsOf(visits, context), typedOverChip: typed !== '' && selection.chip !== '', replacing: sendable.filter((row) => row.compare === '다름').length }
  if (sendable.length > MAX_BATCH) return { ...result, problem: `한 번에 ${MAX_BATCH}명까지만 넣을 수 있어요. 기간을 줄여 주세요.`, batch: [], replacing: 0 }
  if (sendable.length > 0) return result

  // 0명일 때 안내(AC-018.23). 자리를 지키는 완료 줄도 완료로 친다(AC-3104.5)
  const doneHere = new Set(batch.filter((row) => row.done).map((row) => row.key))
  const open = pool.filter((visit) => {
    const reason = doneHere.has(visit.key) || groups.get('done')?.some((row) => row.key === visit.key) || groups.get('nomemo')?.some((row) => row.key === visit.key)
    return !reason
  })
  const span = range.from === range.to ? short(range.from) : spanText(range)
  if (open.length === 0) return { ...result, problem: code ? `${spanText(range)}에 처방코드 ${code}로 입력할 환자가 없습니다. (완료한 환자와 메모가 없는 환자는 뺍니다)` : `${span}에 입력할 환자가 없습니다. (완료한 환자와 메모가 없는 환자는 뺍니다)` }
  const held = groups.get('held')?.length ?? 0
  if (held === open.length) return { ...result, problem: `${spanText(range)}에 남은 ${held}건은 모두 지난 입력에서 건너뛴 환자입니다. 메모를 고치거나 [다시 하기]를 눌러 주세요` }
  if (groups.has('mark')) return result // 안내 줄 없이 누를 때 알림(AC-018.12)
  return { ...result, problem: '지금 입력할 수 있는 사람이 없어요. 아래 빠지는 이유를 확인해 주세요.' }
}

// 도우미 결과 이유의 글자로 사람을 가른다(끝 답의 줄에는 입력 기록 상태가 없다). 도우미 글과 같은지는 inputTargets.test.ts가 C# 원본을 읽어 본다.
// 배포한 뒤 문장을 바꾸려면 옛 도우미와 새 화면이 어긋나므로 MIN_HELPER(lib/bridge/versions.ts)를 올려야 한다

/** 차례가 오지 않았거나 쓰기 전에 멈춘 사람(helper InputRunner.NotDone) */
export const NOT_DONE = '미처리'
/** 아무것도 쓰이지 않은 사람의 앞부분(AC-036.5, helper InputRunner.NotAccepted) */
export const NOT_ACCEPTED = '메모 칸이 입력을 받지 않아'

/** 도우미 결과 이유의 앞부분으로 가른다(AC-035.8). 뒤 글(' · 직접 확인해 입력 멈춤을 풀었습니다')이 붙어도 같다 */
export type ReasonKind = 'manual' | 'nomemo' | 'mark' | 'novisit' | 'already' | 'changed' | 'other'
export function reasonKind(reason: string): ReasonKind {
  const text = reason.replace(/^건너뜀:\s*/, '')
  if (text.startsWith('같은 날 내원이 여러 건')) return 'manual'
  if (text.startsWith('넣을 메모가 없어')) return 'nomemo'
  if (text.startsWith('확인 표시가 남아')) return 'mark'
  if (text.startsWith('내원일 없음')) return 'novisit'
  if (text.startsWith('이미 있음')) return 'already'
  if (text.startsWith('입력 직전')) return 'changed'
  return 'other'
}

/** 줄이 모두 뒤 글 없는 빠지는 까닭이면 [확인]이 없던 묶음이다(AC-016.3): AC-035.8의 네 앞부분 뿐이다 */
export function isPlainExclusion(reason: string): boolean {
  const text = reason.replace(/^건너뜀:\s*/, '')
  return text === '같은 날 내원이 여러 건이라 직접 입력해 주세요' || text === '내원일 없음' || text === '확인 표시가 남아 입력하지 않았습니다' || text === '넣을 메모가 없어 입력하지 않았습니다'
}

/**
 * 결과 줄이 쓰다 멈춘 사람인가(AC-018.16). 끝 답의 줄에는 입력 기록 상태가 없다(helper InputOutcome.ToJson): 확인 필요 가운데 '미처리'(차례가 오지 않음·쓰기 전 멈춤)와
 * '메모 칸이 입력을 받지 않아'(아무것도 쓰이지 않음, AC-036.5)를 뺀 나머지가 쓰기를 시작해 저장을 확인하지 못한 사람이다(helper InputRunner.StopAfterWrite).
 * 틀려도 안전한 쪽이다: 띠가 한 번 더 뜰 뿐이고 도우미는 자기 기록으로 판단한다
 */
export function isWriteStuck(result: string, reason: string): boolean {
  return result === '확인 필요' && !reason.startsWith(NOT_DONE) && !reason.startsWith(NOT_ACCEPTED)
}
