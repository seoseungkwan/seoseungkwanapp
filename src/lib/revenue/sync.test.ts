// 통계 매출의 빈 날 읽기 계획과 차례(stats-revenue TASK-3, REQ-4104 · AC-4104.1·AC-4104.2). 숫자는 모두 가짜고, call·store도 가짜다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { addDays, compareYmd, diffDays, eachDay } from '@/lib/analytics/dates'
import { BridgeError } from '@/lib/bridge/protocol'
import { RevenueStoreError } from '@/lib/storage/revenue'
import type { DateRange } from '@/types/dates'
import type { RevenueDaysResult } from '@/types/revenue'
import { planRevenue, syncRanges } from './sync'

type Failures = Record<string, unknown>

// 옛 매출 탭의 달 가져오기(planFetch·spanMonths·syncRevenue·ALL_FROM_MONTH·FetchSpan)와 그 시험은 지웠다(stats-revenue TASK-8, AC-4110.4)
describe('AC-4110.4 옛 달 가져오기 함수가 없다', () => {
  it('AC-4110.4 sync.ts는 planRevenue·syncRanges만 내보낸다', async () => {
    expect(Object.keys(await import('./sync')).sort()).toEqual(['planRevenue', 'syncRanges'])
  })

  it('AC-4110.4 소스에 옛 이름(planFetch·spanMonths·syncRevenue·ALL_FROM_MONTH·FetchSpan·saveMonth·RevenueStore)이 없다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/revenue/sync.ts'), 'utf8')
    for (const name of ['planFetch', 'spanMonths', 'syncRevenue', 'ALL_FROM_MONTH', 'FetchSpan', 'saveMonth', 'RevenueStore']) {
      expect(source, name).not.toMatch(new RegExp(`\\b${name}\\b`))
    }
  })
})

// ── 통계 매출의 빈 날 읽기(stats-revenue TASK-3, REQ-4104 · AC-4104.1·AC-4104.2). 오늘 2026-11-14(어제 11월 13일) ──

const NOV_14 = '2026-11-14'
const WHOLE = { from: '2026-09-01', to: NOV_14 }
const NONE: ReadonlyMap<string, boolean> = new Map()

/** range의 날마다 저장 줄이 있고, 날 단위 처방 금액이 있는지(dayCodes)는 flag */
const savedOver = (range: DateRange, flag = true): Map<string, boolean> => new Map(eachDay(range).map((d) => [d, flag]))
/** saved에서 days를 지운 것(저장 줄 없는 날) */
const without = (saved: Map<string, boolean>, ...days: string[]) => {
  const copy = new Map(saved)
  for (const d of days) copy.delete(d)
  return copy
}
const dr = (from: string, to: string): DateRange => ({ from, to })
const lengthOf = (range: DateRange) => diffDays(range.from, range.to) + 1

describe('AC-4104.1 planRevenue', () => {
  it('AC-4104.1 저장된 날이 없으면 기간 첫날~어제를 31일 덩어리로 묶어 새것부터 준다(오늘은 진료 중이라 뺀다)', () => {
    expect(planRevenue(WHOLE, NOV_14, false, NONE)).toEqual([
      dr('2026-10-14', '2026-11-13'),
      dr('2026-09-13', '2026-10-13'),
      dr('2026-09-01', '2026-09-12'),
    ])
  })

  it('AC-4104.1 오늘 진료 끝이면 마지막 끝난 날이 오늘이라 오늘까지 읽는다', () => {
    expect(planRevenue(WHOLE, NOV_14, true, NONE)).toEqual([
      dr('2026-10-15', '2026-11-14'),
      dr('2026-09-14', '2026-10-14'),
      dr('2026-09-01', '2026-09-13'),
    ])
  })

  it('AC-4104.1 모두 날 단위 처방 금액까지 저장돼 있어도 어제는 다시 읽는다(진료 중에 읽었을 수 있어서)', () => {
    expect(planRevenue(WHOLE, NOV_14, false, savedOver(WHOLE))).toEqual([dr('2026-11-13', '2026-11-13')])
  })

  it('AC-4104.1 오늘 진료 끝이면 어제와 오늘을 한 덩어리로 다시 읽는다', () => {
    expect(planRevenue(WHOLE, NOV_14, true, savedOver(WHOLE))).toEqual([dr('2026-11-13', '2026-11-14')])
  })

  it('AC-4104.1 저장 줄이 없는 날만 골라 이어진 날끼리 묶는다(새것부터)', () => {
    const saved = without(savedOver(WHOLE), '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-20')
    expect(planRevenue(WHOLE, NOV_14, false, saved)).toEqual([
      dr('2026-11-13', '2026-11-13'),
      dr('2026-10-20', '2026-10-20'),
      dr('2026-10-01', '2026-10-03'),
    ])
  })

  it('AC-4104.1 저장 줄은 있지만 날 단위 처방 금액이 없는 날(day_codes 거짓, 옛 도우미로 읽은 날)도 고른다', () => {
    const saved = savedOver(WHOLE)
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-09-30']) saved.set(d, false)
    expect(planRevenue(WHOLE, NOV_14, false, saved)).toEqual([
      dr('2026-11-13', '2026-11-13'),
      dr('2026-10-05', '2026-10-07'),
      dr('2026-09-30', '2026-09-30'),
    ])
  })

  it('AC-4104.1 저장 안 한 날과 day_codes 거짓인 날이 붙어 있으면 한 덩어리다', () => {
    const saved = without(savedOver(WHOLE), '2026-10-06')
    saved.set('2026-10-05', false)
    saved.set('2026-10-07', false)
    expect(planRevenue(WHOLE, NOV_14, false, saved)).toEqual([dr('2026-11-13', '2026-11-13'), dr('2026-10-05', '2026-10-07')])
  })

  it('AC-4104.1 어제가 빈 날과 붙어 있으면 한 덩어리다', () => {
    const saved = without(savedOver(WHOLE), '2026-11-11', '2026-11-12')
    expect(planRevenue(WHOLE, NOV_14, false, saved)).toEqual([dr('2026-11-11', '2026-11-13')])
  })

  it('AC-4104.1 마지막 끝난 날 뒤는 고르지 않는다(기간 끝이 그 뒤여도)', () => {
    const later = { from: '2026-11-01', to: '2026-11-30' }
    expect(planRevenue(later, NOV_14, false, NONE)).toEqual([dr('2026-11-01', '2026-11-13')])
    expect(planRevenue(later, NOV_14, true, NONE)).toEqual([dr('2026-11-01', '2026-11-14')])
  })

  it('AC-4104.1 오늘 진료 끝이 아니면 오늘은 저장 줄이 없어도 고르지 않는다', () => {
    const plan = planRevenue(WHOLE, NOV_14, false, NONE)
    for (const range of plan) expect(compareYmd(range.to, '2026-11-13')).toBeLessThanOrEqual(0)
  })

  it('AC-4104.1 기간 첫날보다 앞은 고르지 않는다(저장 줄이 없어도)', () => {
    const plan = planRevenue({ from: '2026-11-10', to: NOV_14 }, NOV_14, false, NONE)
    expect(plan).toEqual([dr('2026-11-10', '2026-11-13')])
  })

  it('AC-4104.1 고를 날이 없으면 빈 목록이다(어제가 기간 밖이고 모두 저장됨)', () => {
    const past = { from: '2026-09-01', to: '2026-10-31' }
    expect(planRevenue(past, NOV_14, false, savedOver(past))).toEqual([])
    expect(planRevenue(past, NOV_14, true, savedOver(past))).toEqual([])
  })

  it('AC-4104.1 지난 기간에서는 빈 날만 고른다(어제·오늘은 기간 밖)', () => {
    const past = { from: '2026-09-01', to: '2026-10-31' }
    expect(planRevenue(past, NOV_14, true, without(savedOver(past), '2026-10-31'))).toEqual([dr('2026-10-31', '2026-10-31')])
  })

  it('AC-4104.1 기간이 오늘 하루면 진료 끝이 아닐 때 빈 목록, 진료 끝이면 오늘 하나다', () => {
    const today = { from: NOV_14, to: NOV_14 }
    expect(planRevenue(today, NOV_14, false, NONE)).toEqual([])
    expect(planRevenue(today, NOV_14, true, NONE)).toEqual([dr(NOV_14, NOV_14)])
  })

  it('AC-4104.1 기간 첫날이 마지막 끝난 날보다 뒤면 빈 목록이다', () => {
    expect(planRevenue({ from: '2026-11-15', to: '2026-11-30' }, NOV_14, true, NONE)).toEqual([])
    expect(planRevenue({ from: NOV_14, to: '2026-11-30' }, NOV_14, false, NONE)).toEqual([])
  })

  it('AC-4104.1 이어진 31일은 한 덩어리, 32일은 두 덩어리(새 31일 + 앞 하루)다', () => {
    const saved = savedOver(WHOLE)
    const thirtyOne = without(saved, ...eachDay(dr('2026-10-01', '2026-10-31')))
    expect(planRevenue(WHOLE, NOV_14, false, thirtyOne)).toEqual([dr('2026-11-13', '2026-11-13'), dr('2026-10-01', '2026-10-31')])
    const thirtyTwo = without(saved, ...eachDay(dr('2026-09-30', '2026-10-31')))
    expect(planRevenue(WHOLE, NOV_14, false, thirtyTwo)).toEqual([
      dr('2026-11-13', '2026-11-13'),
      dr('2026-10-01', '2026-10-31'),
      dr('2026-09-30', '2026-09-30'),
    ])
  })

  it('AC-4104.1 전체 기간(2020-01-01부터)도 덩어리마다 31일 이하이고, 겹치지 않고 빠짐없이 새것부터다', () => {
    const all = { from: '2020-01-01', to: NOV_14 }
    const plan = planRevenue(all, NOV_14, false, NONE)
    expect(plan[0]).toEqual(dr('2026-10-14', '2026-11-13'))
    expect(plan.at(-1)?.from).toBe('2020-01-01')
    for (const range of plan) {
      expect(lengthOf(range)).toBeGreaterThanOrEqual(1)
      expect(lengthOf(range)).toBeLessThanOrEqual(31)
    }
    // 바로 앞(더 새) 덩어리의 첫날 전날이 이 덩어리의 끝날이다
    for (let i = 1; i < plan.length; i++) expect(plan[i].to).toBe(addDays(plan[i - 1].from, -1))
    const days = plan.flatMap(eachDay)
    expect(days).toHaveLength(eachDay({ from: '2020-01-01', to: '2026-11-13' }).length)
    expect(plan).toHaveLength(Math.ceil(days.length / 31))
  })
})

const answerFor = (range: DateRange, withDayCodes = true): RevenueDaysResult => ({
  days: [{ date: range.from } as RevenueDaysResult['days'][number]],
  codes: [],
  ...(withDayCodes ? { dayCodes: [] } : {}),
})

/** failures: 덩어리 첫날 → 그 덩어리 call이 던질 값. saveFailures: saveRange가 던질 값. old: 옛 도우미 답(dayCodes 없음)을 줄 덩어리 첫날 */
function rangeFakes(failures: Failures = {}, saveFailures: Failures = {}, old: string[] = []) {
  const log: string[] = []
  const call = vi.fn(async (range: DateRange) => {
    log.push(`call ${range.from}`)
    if (range.from in failures) throw failures[range.from]
    return answerFor(range, !old.includes(range.from))
  })
  const saveRange = vi.fn(async (range: DateRange) => {
    log.push(`save ${range.from}`)
    if (range.from in saveFailures) throw saveFailures[range.from]
  })
  const savedFroms = () => saveRange.mock.calls.map(([range]) => range.from)
  return { call, store: { saveRange }, saveRange, savedFroms, log }
}

const R3 = [dr('2026-10-14', '2026-11-13'), dr('2026-09-13', '2026-10-13'), dr('2026-09-01', '2026-09-12')]
const [FIRST, SECOND, THIRD] = R3.map((range) => range.from)
const CLEAN_RANGES = { stopped: null, failed: [], noDayCodes: false }

describe('AC-4104.2 syncRanges', () => {
  it('AC-4104.2 덩어리마다 revenue.days → 저장을 차례로 한다(한 번에 하나)', async () => {
    const { call, store, log } = rangeFakes()
    const result = await syncRanges({ call, store, ranges: R3 })
    expect(log).toEqual([`call ${FIRST}`, `save ${FIRST}`, `call ${SECOND}`, `save ${SECOND}`, `call ${THIRD}`, `save ${THIRD}`])
    expect(call.mock.calls.map(([range]) => range)).toEqual(R3)
    expect(result).toEqual(CLEAN_RANGES)
  })

  it('AC-4104.2 앞 덩어리 저장이 끝나기 전에는 다음 덩어리를 부르지 않는다', async () => {
    const { call } = rangeFakes()
    let finishSave = () => {}
    const saveRange = vi.fn(() => new Promise<void>((resolve) => void (finishSave = resolve)))
    const running = syncRanges({ call, store: { saveRange }, ranges: R3.slice(0, 2) })
    await vi.waitFor(() => expect(saveRange).toHaveBeenCalledTimes(1))
    expect(call).toHaveBeenCalledTimes(1)
    finishSave()
    await vi.waitFor(() => expect(saveRange).toHaveBeenCalledTimes(2))
    finishSave()
    await running
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('AC-4104.2 받은 답을 그 덩어리 범위와 함께 그대로 저장소에 넘긴다', async () => {
    const { call, store, saveRange } = rangeFakes()
    await syncRanges({ call, store, ranges: [R3[1]] })
    expect(saveRange).toHaveBeenCalledWith(R3[1], answerFor(R3[1]))
  })

  it.each(['E-BIT-READ-FAILED', 'E-BRIDGE-BAD-REPLY'])('AC-4104.2 둘째 덩어리 읽기가 %s면 그 덩어리만 실패로 적고 다음 덩어리를 읽는다', async (code) => {
    const { call, store, savedFroms } = rangeFakes({ [SECOND]: new BridgeError(code) })
    const result = await syncRanges({ call, store, ranges: R3 })
    expect(call).toHaveBeenCalledTimes(3)
    expect(savedFroms()).toEqual([FIRST, THIRD])
    expect(result).toEqual({ ...CLEAN_RANGES, failed: [{ range: R3[1], code }] })
  })

  it('AC-4104.2 저장 실패(E-REVENUE-SAVE-FAILED)도 그 덩어리만 실패로 적고 계속한다', async () => {
    const { call, store } = rangeFakes({}, { [SECOND]: new RevenueStoreError('E-REVENUE-SAVE-FAILED') })
    const result = await syncRanges({ call, store, ranges: R3 })
    expect(call).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ ...CLEAN_RANGES, failed: [{ range: R3[1], code: 'E-REVENUE-SAVE-FAILED' }] })
  })

  it('AC-4104.2 실패한 덩어리가 여럿이면 차례대로 모두 적는다', async () => {
    const { call, store } = rangeFakes({ [FIRST]: new BridgeError('E-BIT-READ-FAILED'), [THIRD]: new BridgeError('E-BRIDGE-BAD-REPLY') })
    const result = await syncRanges({ call, store, ranges: R3 })
    expect(result.failed).toEqual([
      { range: R3[0], code: 'E-BIT-READ-FAILED' },
      { range: R3[2], code: 'E-BRIDGE-BAD-REPLY' },
    ])
    expect(result.stopped).toBeNull()
  })

  it.each([
    'E-BRIDGE-DISCONNECTED',
    'E-BRIDGE-BUSY',
    'E-HELPER-UNKNOWN-COMMAND',
    'E-BRIDGE-REJECTED',
    'E-HELPER-MISSING',
    'E-BIT-DB-FAILED',
    'E-BIT-HOSPITAL-MISMATCH',
    'E-STATS-READ-FAILED',
    'E-SOMETHING-NEW',
  ])('AC-4104.2 그 밖 번호 %s는 거기서 멈추고 남은 덩어리를 부르지 않는다', async (code) => {
    const { call, store, savedFroms } = rangeFakes({ [SECOND]: new BridgeError(code) })
    const result = await syncRanges({ call, store, ranges: R3 })
    expect(call).toHaveBeenCalledTimes(2)
    expect(savedFroms()).toEqual([FIRST])
    expect(result).toEqual({ ...CLEAN_RANGES, stopped: code })
  })

  it('AC-4104.2 저장소가 덩어리만 실패 번호 밖의 번호를 던져도 멈춘다', async () => {
    const { call, store } = rangeFakes({}, { [FIRST]: new RevenueStoreError('E-PAGE-FAILED') })
    const result = await syncRanges({ call, store, ranges: R3 })
    expect(call).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ...CLEAN_RANGES, stopped: 'E-PAGE-FAILED' })
  })

  it('AC-4104.2 멈추기 전에 실패한 덩어리는 failed에 남는다', async () => {
    const { call, store } = rangeFakes({ [FIRST]: new BridgeError('E-BIT-READ-FAILED'), [SECOND]: new BridgeError('E-BRIDGE-DISCONNECTED') })
    const result = await syncRanges({ call, store, ranges: R3 })
    expect(call).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ stopped: 'E-BRIDGE-DISCONNECTED', failed: [{ range: R3[0], code: 'E-BIT-READ-FAILED' }], noDayCodes: false })
  })

  it('AC-4104.2 답에 dayCodes가 없으면(도우미 예전 판) noDayCodes이고, 그 답도 저장하고 다음 덩어리를 계속한다', async () => {
    const { call, store, savedFroms } = rangeFakes({}, {}, [SECOND])
    const result = await syncRanges({ call, store, ranges: R3 })
    expect(savedFroms()).toEqual([FIRST, SECOND, THIRD])
    expect(result).toEqual({ ...CLEAN_RANGES, noDayCodes: true })
  })

  it('AC-4104.2 dayCodes가 빈 목록이면 새 도우미라 noDayCodes가 아니다', async () => {
    const { call, store } = rangeFakes()
    const result = await syncRanges({ call, store, ranges: [R3[0]] })
    expect(result.noDayCodes).toBe(false)
  })

  it('AC-4104.2 예전 판 답 뒤에 멈춰도 noDayCodes는 남는다', async () => {
    const { call, store } = rangeFakes({ [SECOND]: new BridgeError('E-BRIDGE-DISCONNECTED') }, {}, [FIRST])
    const result = await syncRanges({ call, store, ranges: R3 })
    expect(result).toEqual({ stopped: 'E-BRIDGE-DISCONNECTED', failed: [], noDayCodes: true })
  })

  it('AC-4104.2 덩어리가 끝날 때마다 진행(한 것/모두)을 알린다(실패한 덩어리도 끝난 것으로 센다)', async () => {
    const onProgress = vi.fn()
    const { call, store } = rangeFakes({ [SECOND]: new BridgeError('E-BIT-READ-FAILED') })
    await syncRanges({ call, store, ranges: R3, onProgress })
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ])
  })

  it('AC-4104.2 진행은 저장이 끝난 뒤에 알린다', async () => {
    const { call, store, log } = rangeFakes()
    const onProgress = vi.fn((progress: { done: number }) => void log.push(`progress ${progress.done}`))
    await syncRanges({ call, store, ranges: R3.slice(0, 2), onProgress })
    expect(log).toEqual([`call ${FIRST}`, `save ${FIRST}`, 'progress 1', `call ${SECOND}`, `save ${SECOND}`, 'progress 2'])
  })

  it('AC-4104.2 멈춘 덩어리는 진행으로 알리지 않는다', async () => {
    const onProgress = vi.fn()
    const { call, store } = rangeFakes({ [SECOND]: new BridgeError('E-BRIDGE-DISCONNECTED') })
    await syncRanges({ call, store, ranges: R3, onProgress })
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([{ done: 1, total: 3 }])
  })

  it.each([
    [new Error('화면에 나오면 안 되는 글')],
    [{ code: '42501', message: '화면에 나오면 안 되는 글' }],
    [Object.assign(new Error('화면에 나오면 안 되는 글'), { code: 'not a code 화면에 나오면 안 되는 글' })],
    ['화면에 나오면 안 되는 글'],
    [undefined],
  ])('AC-4104.2 번호 없는 오류 %#은 글을 옮기지 않고 정해 둔 번호(E-PAGE-FAILED)로 멈춘다', async (thrown) => {
    const { call, store } = rangeFakes({ [FIRST]: thrown })
    const result = await syncRanges({ call, store, ranges: R3 })
    expect(call).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ...CLEAN_RANGES, stopped: 'E-PAGE-FAILED' })
    expect(JSON.stringify(result)).not.toContain('화면에 나오면 안 되는 글')
  })

  it('AC-4104.2 덩어리가 없으면 아무것도 부르지 않고 진행도 알리지 않는다', async () => {
    const onProgress = vi.fn()
    const { call, store, saveRange } = rangeFakes()
    const result = await syncRanges({ call, store, ranges: [], onProgress })
    expect(call).not.toHaveBeenCalled()
    expect(saveRange).not.toHaveBeenCalled()
    expect(onProgress).not.toHaveBeenCalled()
    expect(result).toEqual(CLEAN_RANGES)
  })

  it('AC-4104.1·AC-4104.2 planRevenue의 덩어리를 그대로 주면 새것부터 차례로 읽는다', async () => {
    const saved = without(savedOver(WHOLE), '2026-10-01', '2026-10-02')
    const ranges = planRevenue(WHOLE, NOV_14, true, saved)
    const { call, store } = rangeFakes()
    await syncRanges({ call, store, ranges })
    expect(call.mock.calls.map(([range]) => range)).toEqual([dr('2026-11-13', '2026-11-14'), dr('2026-10-01', '2026-10-02')])
  })
})
