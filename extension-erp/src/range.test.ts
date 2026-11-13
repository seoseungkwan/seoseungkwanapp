// TASK-4 (spec erp-closing-range design.md 3절): 기간 흐름(range.ts)을 가짜 부품(deps)으로 시험한다. DOM이 없다.
// 날짜 'd1'~ 대신 실제 날짜 모양을 쓰고, 도우미 답은 시험용 가짜 숫자(환자 정보 없음)다
import { describe, expect, it } from 'vitest'
import { sampleDay } from './__tests__/erpPage'
import { rangeDays, runRange, scanRange, type RangeDeps } from './range'
import type { Block, FailWhy, JournalState, LoadResult, RunSummary, SaveResult } from './rangeTypes'
import type { ClosingDay } from './types'

/** 가짜 그날: 불러오기 결과(차례대로, 끝나면 마지막 값) · 멈출 일 · 되살린 입력 띠 · 마감일지 · 진료 수 · 함께 있는 진료 · 도우미 오류 · 두 저장 결과 */
type Fake = {
  load?: LoadResult[]
  block?: Block | null
  draft?: boolean
  journal?: JournalState
  total?: number
  overlap?: number
  helper?: string
  w1?: SaveResult
  w2?: SaveResult
}

function bitDay(date: string, total: number, overlap?: number): ClosingDay {
  const day = sampleDay()
  return { ...day, date, patients: { ...day.patients, total }, overlap: overlap ? { visits: overlap, carm: 10, sono: 20 } : null }
}

function fakeDeps(days: Record<string, Fake> = {}) {
  const calls: string[] = []
  let current = ''
  const loads = new Map<string, number>()
  const flags = { gone: false }
  /** 부품을 부를 때마다 끼어들 일(멈추기 누름·화면 떠남 흉내) */
  const hooks: Record<string, () => void> = {}
  const note = (call: string) => {
    calls.push(call)
    hooks[call]?.()
  }
  const deps: RangeDeps = {
    async setDate(date) {
      current = date
      note(`setDate ${date}`)
    },
    async waitLoaded(date) {
      note(`waitLoaded ${date}`)
      const list = days[date]?.load ?? ['ok']
      const n = loads.get(date) ?? 0
      loads.set(date, n + 1)
      return list[Math.min(n, list.length - 1)]
    },
    blocker() {
      note('blocker')
      return days[current]?.block ?? null
    },
    draftNotice() {
      note('draftNotice')
      return days[current]?.draft ?? false
    },
    readJournal() {
      note('readJournal')
      return days[current]?.journal ?? { exists: false, status: null }
    },
    async askDay(date) {
      note(`askDay ${date}`)
      const fake = days[date]
      if (fake?.helper) return { block: { kind: 'helper', code: fake.helper } }
      return { day: bitDay(date, fake?.total ?? 30, fake?.overlap) }
    },
    async fill(day, choice) {
      note(`fill ${day.date} ${choice ?? '-'}`)
    },
    async save(which) {
      note(`save ${which}`)
      return days[current]?.[which] ?? 'ok'
    },
    gone: () => flags.gone,
  }
  return { deps, calls, flags, hooks }
}

const D = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']
/** 하루를 다 채우고 저장한 차례 */
const fullDay = (date: string, choice = '-') => [
  `setDate ${date}`,
  `waitLoaded ${date}`,
  'blocker',
  'draftNotice',
  `askDay ${date}`,
  `fill ${date} ${choice}`,
  'save w1',
  'save w2',
  `waitLoaded ${date}`,
]
const never = () => false

describe('AC-3702.1 rangeDays: 기간 안 날(옛날부터, 양 끝 포함)', () => {
  it('AC-3702.1: 양 끝을 넣고 달을 넘어간다', () => {
    expect(rangeDays('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })

  it('AC-3702.1: 하루면 그날 하나, 윤년 2월·해 넘김도 맞다', () => {
    expect(rangeDays('2026-11-13', '2026-11-13')).toEqual(['2026-11-13'])
    expect(rangeDays('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
    expect(rangeDays('2026-02-28', '2026-03-01')).toEqual(['2026-02-28', '2026-03-01'])
    expect(rangeDays('2025-12-31', '2026-01-01')).toEqual(['2025-12-31', '2026-01-01'])
  })

  it('AC-3702.1: 31일짜리 달 하나는 31일이고, 시작일 > 끝일이거나 날짜가 아니면 없다', () => {
    expect(rangeDays('2026-10-01', '2026-10-31')).toHaveLength(31)
    expect(rangeDays('2026-11-05', '2026-11-04')).toEqual([])
    expect(rangeDays('', '2026-11-04')).toEqual([])
    expect(rangeDays('2026-11-01', 'abc')).toEqual([])
  })
})

describe('AC-3702.1 scanRange: 살펴보기(칸을 바꾸지 않고 탭 말고는 누르지 않음)', () => {
  it('AC-3702.1: 날마다 setDate → waitLoaded → blocker → readJournal → askDay 차례이고 fill·save·draftNotice는 부르지 않는다', async () => {
    const f = fakeDeps()
    const progress: number[] = []
    const out = await scanRange(D.slice(0, 2), f.deps, (done) => progress.push(done), never)
    expect(f.calls).toEqual([
      `setDate ${D[0]}`,
      `waitLoaded ${D[0]}`,
      'blocker',
      'readJournal',
      `askDay ${D[0]}`,
      `setDate ${D[1]}`,
      `waitLoaded ${D[1]}`,
      'blocker',
      'readJournal',
      `askDay ${D[1]}`,
    ])
    expect(progress).toEqual([1, 2])
    expect(out).toEqual({
      scan: { from: D[0], to: D[1], fill: [D[0], D[1]], fresh: [D[0], D[1]], written: [], zero: [], unloaded: [], overlapVisits: 0 },
    })
  })

  it('AC-3702.1: 새로·작성중·확정·진료 0건(마감일지가 있어도)·못 불러온 날(도우미 안 부름)로 나누고 함께 있는 진료 수를 더한다', async () => {
    const f = fakeDeps({
      [D[0]]: { overlap: 2 },
      [D[1]]: { journal: { exists: true, status: 'draft' }, overlap: 3 },
      [D[2]]: { journal: { exists: true, status: 'confirmed' } },
      [D[3]]: { journal: { exists: true, status: 'confirmed' }, total: 0 },
      [D[4]]: { load: ['timeout'] },
      [D[5]]: { load: ['error'] },
    })
    const out = await scanRange(D, f.deps, () => {}, never)
    expect(out).toEqual({
      scan: {
        from: D[0],
        to: D[5],
        fill: [D[0], D[1], D[2], D[4], D[5]],
        fresh: [D[0]],
        written: [
          { date: D[1], status: 'draft' },
          { date: D[2], status: 'confirmed' },
        ],
        zero: [D[3]],
        unloaded: [D[4], D[5]],
        overlapVisits: 5,
      },
    })
    expect(f.calls.filter((c) => c.startsWith('askDay'))).toEqual([0, 1, 2, 3].map((i) => `askDay ${D[i]}`))
    expect(f.calls.some((c) => c.startsWith('fill') || c.startsWith('save'))).toBe(false)
  })

  it('AC-3702.5 AC-3705.2: 다 불러온 뒤 멈출 일이 있으면 그 까닭으로 끝나고 도우미는 부르지 않으며 다음 날로 가지 않는다', async () => {
    const f = fakeDeps({ [D[1]]: { block: { kind: 'dialog' } } })
    const out = await scanRange(D.slice(0, 3), f.deps, () => {}, never)
    expect(out).toEqual({ block: { kind: 'dialog' } })
    expect(f.calls.slice(5)).toEqual([`setDate ${D[1]}`, `waitLoaded ${D[1]}`, 'blocker'])
  })

  it('AC-3702.5 AC-3705.2: 도우미 오류면 { kind: helper, code }로 끝난다', async () => {
    const f = fakeDeps({ [D[0]]: { helper: 'E-BIT-READ-FAILED' } })
    const out = await scanRange(D.slice(0, 2), f.deps, () => {}, never)
    expect(out).toEqual({ block: { kind: 'helper', code: 'E-BIT-READ-FAILED' } })
    expect(f.calls).not.toContain(`setDate ${D[1]}`)
  })

  it('AC-3702.1: [그만두기]면 지금 날을 끝낸 뒤 그만두고 다음 날로 가지 않는다', async () => {
    const f = fakeDeps()
    let cancel = false
    f.hooks[`waitLoaded ${D[0]}`] = () => {
      cancel = true
    }
    const out = await scanRange(D.slice(0, 3), f.deps, () => {}, () => cancel)
    expect(out).toEqual({ cancelled: true })
    expect(f.calls).toContain(`askDay ${D[0]}`)
    expect(f.calls).not.toContain(`setDate ${D[1]}`)
  })

  it('AC-3704.3: 화면을 떠났으면(gone) 곧바로 조용히 끝나고 더 부르지 않는다', async () => {
    const f = fakeDeps()
    f.hooks[`setDate ${D[0]}`] = () => {
      f.flags.gone = true
    }
    const out = await scanRange(D.slice(0, 2), f.deps, () => {}, never)
    expect(out).toEqual({ gone: true })
    expect(f.calls).toEqual([`setDate ${D[0]}`])
  })
})

describe('AC-3703.1 runRange: 하루씩 채우고 저장', () => {
  it('AC-3703.1 AC-3703.2: 날마다 setDate → waitLoaded → blocker → draftNotice → askDay → fill(고른 것) → w1 → w2 → waitLoaded, 한 번에 하나씩', async () => {
    const f = fakeDeps()
    const progress: [number, string][] = []
    const out = await runRange(D.slice(0, 2), f.deps, 'sono', (saved, current) => progress.push([saved, current]), never)
    expect(f.calls).toEqual([...fullDay(D[0], 'sono'), ...fullDay(D[1], 'sono')])
    expect(progress).toEqual([
      [0, D[0]],
      [1, D[1]],
    ])
    expect(out).toEqual({
      run: { from: D[0], to: D[1], total: 2, saved: [D[0], D[1]], skipped: [], failed: [], remaining: [] },
      outcome: 'end',
    })
  })

  it('AC-3703.4: 되살린 입력 띠가 있으면 도우미도 부르지 않고 건너뛰고(draft), 진료 0건이면 채우지 않고 건너뛴다(zero)', async () => {
    const f = fakeDeps({ [D[0]]: { draft: true }, [D[1]]: { total: 0 } })
    const out = await runRange(D.slice(0, 3), f.deps, undefined, () => {}, never)
    expect(f.calls.slice(0, 4)).toEqual([`setDate ${D[0]}`, `waitLoaded ${D[0]}`, 'blocker', 'draftNotice'])
    expect(f.calls).not.toContain(`askDay ${D[0]}`)
    expect(f.calls).not.toContain(`fill ${D[1]} -`)
    expect(f.calls.slice(-9)).toEqual(fullDay(D[2]))
    expect(out).toMatchObject({
      run: {
        saved: [D[2]],
        skipped: [
          { date: D[0], why: 'draft' },
          { date: D[1], why: 'zero' },
        ],
        failed: [],
      },
      outcome: 'end',
    })
  })

  it.each<[string, Fake, FailWhy]>([
    ['load error', { load: ['error'] }, 'load'],
    ['load timeout', { load: ['timeout'] }, 'load'],
    ['w1 error', { w1: 'error' }, 'w1Error'],
    ['w1 missing', { w1: 'missing' }, 'w1Error'],
    ['w1 timeout', { w1: 'timeout' }, 'w1Timeout'],
    ['w2 error', { w2: 'error' }, 'w2Error'],
    ['w2 missing', { w2: 'missing' }, 'w2Error'],
    ['w2 timeout', { w2: 'timeout' }, 'w2Timeout'],
  ])('AC-3703.3 AC-3703.4: %s 이면 그날은 저장 못 한 날(%s)이고 다음 날로 간다', async (_name, fake, why) => {
    const f = fakeDeps({ [D[0]]: fake })
    const out = await runRange(D.slice(0, 2), f.deps, undefined, () => {}, never)
    expect(out).toMatchObject({ run: { saved: [D[1]], failed: [{ date: D[0], why }], remaining: [] }, outcome: 'end' })
    expect(f.calls.slice(-9)).toEqual(fullDay(D[1]))
  })

  it('AC-3703.3: 업무일지 1 저장이 안 되면 일일 상세 저장은 누르지 않는다', async () => {
    const f = fakeDeps({ [D[0]]: { w1: 'error' } })
    await runRange(D.slice(0, 1), f.deps, undefined, () => {}, never)
    expect(f.calls.filter((c) => c.startsWith('save'))).toEqual(['save w1'])
  })

  it('AC-3703.4: 불러오지 못한 날은 멈출 일·도우미를 보지 않는다', async () => {
    const f = fakeDeps({ [D[0]]: { load: ['timeout'] } })
    await runRange(D.slice(0, 1), f.deps, undefined, () => {}, never)
    expect(f.calls).toEqual([`setDate ${D[0]}`, `waitLoaded ${D[0]}`])
  })

  it.each<[string, Fake, Block]>([
    ['ERP 창', { block: { kind: 'dialog' } }, { kind: 'dialog' }],
    ['날짜 칸 없음', { block: { kind: 'todayOnly' } }, { kind: 'todayOnly' }],
    ['저장 줄 없음', { block: { kind: 'noSaveBar' } }, { kind: 'noSaveBar' }],
    ['읽기 전용', { block: { kind: 'readOnly' } }, { kind: 'readOnly' }],
    ['도우미 오류', { helper: 'E-HELPER-TIMEOUT' }, { kind: 'helper', code: 'E-HELPER-TIMEOUT' }],
  ])('AC-3705.2: %s 이면 다음 날로 가지 않고 멈추며 그날은 남은 날 맨 앞에 남는다', async (_name, fake, block) => {
    const f = fakeDeps({ [D[1]]: fake })
    const out = await runRange(D.slice(0, 3), f.deps, undefined, () => {}, never)
    expect(out).toEqual({
      run: { from: D[0], to: D[2], total: 3, saved: [D[0]], skipped: [], failed: [], remaining: [D[1], D[2]] },
      outcome: 'blocked',
      block,
    })
    expect(f.calls).not.toContain(`fill ${D[1]} -`)
    expect(f.calls).not.toContain(`setDate ${D[2]}`)
  })

  it('AC-3704.2: [멈추기]는 날짜를 바꾸기 전에 본다 — 지금 날은 저장 확인까지 끝내고 멈추며 남은 날을 남긴다', async () => {
    const f = fakeDeps()
    let stop = false
    f.hooks[`fill ${D[0]} -`] = () => {
      stop = true
    }
    const out = await runRange(D.slice(0, 3), f.deps, undefined, () => {}, () => stop)
    expect(f.calls).toEqual(fullDay(D[0]))
    expect(out).toEqual({
      run: { from: D[0], to: D[2], total: 3, saved: [D[0]], skipped: [], failed: [], remaining: [D[1], D[2]] },
      outcome: 'stopped',
    })
  })

  it('AC-3704.2: 이어서 하기(prior)는 앞 결과에 더하고 total·기간은 처음 승인 그대로다', async () => {
    const prior: RunSummary = {
      from: '2026-09-28',
      to: D[2],
      total: 5,
      saved: ['2026-09-28'],
      skipped: [{ date: '2026-09-29', why: 'zero' }],
      failed: [{ date: '2026-09-30', why: 'w1Timeout' }],
      remaining: [D[0], D[1], D[2]],
    }
    const f = fakeDeps({ [D[1]]: { draft: true }, [D[2]]: { w2: 'error' } })
    const out = await runRange(prior.remaining, f.deps, 'both', () => {}, never, prior)
    expect(out).toEqual({
      run: {
        from: '2026-09-28',
        to: D[2],
        total: 5,
        saved: ['2026-09-28', D[0]],
        skipped: [
          { date: '2026-09-29', why: 'zero' },
          { date: D[1], why: 'draft' },
        ],
        failed: [
          { date: '2026-09-30', why: 'w1Timeout' },
          { date: D[2], why: 'w2Error' },
        ],
        remaining: [],
      },
      outcome: 'end',
    })
    // 앞 결과는 고치지 않는다
    expect(prior.saved).toEqual(['2026-09-28'])
    expect(prior.remaining).toEqual([D[0], D[1], D[2]])
  })

  it('AC-3704.2: 이어서 하기의 진행은 앞에서 저장한 날 수부터 센다', async () => {
    const prior: RunSummary = { from: D[0], to: D[2], total: 3, saved: [D[0]], skipped: [], failed: [], remaining: [D[1], D[2]] }
    const progress: [number, string][] = []
    await runRange(prior.remaining, fakeDeps().deps, undefined, (saved, current) => progress.push([saved, current]), never, prior)
    expect(progress).toEqual([
      [1, D[1]],
      [2, D[2]],
    ])
  })

  it('AC-3704.3: 화면을 떠났으면(gone) 곧바로 조용히 끝나고 다음 저장을 누르지 않는다', async () => {
    const f = fakeDeps()
    f.hooks['save w1'] = () => {
      f.flags.gone = true
    }
    const out = await runRange(D.slice(0, 2), f.deps, undefined, () => {}, never)
    expect(out).toEqual({ gone: true })
    expect(f.calls.at(-1)).toBe('save w1')
  })

  it('AC-3704.3: 날짜를 바꾸기 전에도 gone을 본다', async () => {
    const f = fakeDeps()
    f.flags.gone = true
    const out = await runRange(D.slice(0, 2), f.deps, undefined, () => {}, never)
    expect(out).toEqual({ gone: true })
    expect(f.calls).toEqual([])
  })
})
