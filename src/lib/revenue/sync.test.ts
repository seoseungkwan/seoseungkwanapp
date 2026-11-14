// 매출 가져오기 계획과 차례(TASK-7, REQ-007 · AC-007.1·AC-007.3). 숫자는 모두 가짜고, call·store도 가짜다
import { describe, expect, it, vi } from 'vitest'
import { addDays, addMonths, compareYmd, diffDays, eachDay, monthOf, monthRange } from '@/lib/analytics/dates'
import { BridgeError } from '@/lib/bridge/protocol'
import { RevenueStoreError, type RevenueStore } from '@/lib/storage/revenue'
import type { DateRange } from '@/types/dates'
import type { RevenueDaysResult } from '@/types/revenue'
import { ALL_FROM_MONTH, planFetch, planRevenue, spanMonths, syncRanges, syncRevenue } from './sync'

const NOTHING_SAVED: ReadonlySet<string> = new Set()
const daysOfMonth = (month: string) => eachDay(monthRange(month))
const NOV_1 = '2026-11-01'

// 2026-10부터 2025-10까지(오늘이 11월 1일일 때 가져올 13달)
const LATE_2026 = ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01']
const THIRTEEN = [...LATE_2026, '2025-12', '2025-11', '2025-10']

describe('AC-007.1 planFetch', () => {
  it('AC-007.1 오늘이 11월 1일이고 저장된 날이 없으면 2026-10부터 2025-10까지 13달을 최근 달부터, 달마다 1일~말일로 돌려준다', () => {
    expect(planFetch(NOV_1, NOTHING_SAVED)).toEqual(THIRTEEN.map((month) => monthRange(month)))
  })

  it('AC-007.1 와야 할 날이 다 저장된 달은 넣지 않는다', () => {
    const saved = new Set([...daysOfMonth('2026-10'), ...daysOfMonth('2026-08')])
    expect(planFetch(NOV_1, saved).map((range) => range.from.slice(0, 7))).toEqual(
      THIRTEEN.filter((month) => month !== '2026-10' && month !== '2026-08'),
    )
  })

  it('AC-007.1 13달이 모두 저장돼 있으면 빈 목록이다', () => {
    expect(planFetch(NOV_1, new Set(THIRTEEN.flatMap(daysOfMonth)))).toEqual([])
  })

  it('AC-007.1 13달보다 오래된 달은 저장돼 있지 않아도 가져오지 않는다', () => {
    const froms = planFetch(NOV_1, NOTHING_SAVED).map((range) => range.from)
    expect(froms).toHaveLength(13)
    expect(froms).not.toContain('2025-09-01')
  })

  it('AC-007.1 이번 달이 진행 중이면 그 달의 끝은 어제다', () => {
    const plan = planFetch('2026-11-15', NOTHING_SAVED)
    expect(plan).toHaveLength(13)
    expect(plan[0]).toEqual({ from: '2026-11-01', to: '2026-11-14' })
    expect(plan[1]).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(plan[12]).toEqual({ from: '2025-11-01', to: '2025-11-30' })
  })

  it('AC-007.1 진행 중인 달은 어제까지만 저장돼 있으면 다 저장된 달이다', () => {
    const saved = new Set(eachDay({ from: '2026-11-01', to: '2026-11-14' }))
    expect(planFetch('2026-11-15', saved)[0]).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('AC-007.1 진행 중인 달은 어제 하루만 빠져도 1일~어제를 가져온다', () => {
    const saved = new Set(eachDay({ from: '2026-11-01', to: '2026-11-13' }))
    expect(planFetch('2026-11-15', saved)[0]).toEqual({ from: '2026-11-01', to: '2026-11-14' })
  })

  it('AC-007.1 하루만 빠져도 그 달 전체를 다시 가져온다(코드 합계가 달 전체여야 해서)', () => {
    const saved = new Set(THIRTEEN.flatMap(daysOfMonth).filter((day) => day !== '2026-09-17'))
    expect(planFetch(NOV_1, saved)).toEqual([{ from: '2026-09-01', to: '2026-09-30' }])
  })

  it('AC-007.1 달의 첫날에는 지난달이 맨 앞이고, 해를 넘겨 13달을 센다', () => {
    const plan = planFetch('2026-01-01', NOTHING_SAVED)
    expect(plan[0]).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(plan[12]).toEqual({ from: '2024-12-01', to: '2024-12-31' })
  })

  it('AC-007.1 달마다 기간은 31일 이하다(윤달 2월 포함)', () => {
    const plan = planFetch('2028-03-05', NOTHING_SAVED)
    expect(plan).toContainEqual({ from: '2028-02-01', to: '2028-02-29' })
    for (const range of plan) expect(eachDay(range).length).toBeLessThanOrEqual(31)
  })
})

const reply = (from: string): RevenueDaysResult => ({ days: [{ date: from } as RevenueDaysResult['days'][number]], codes: [] })

type Failures = Record<string, unknown>

/** failures: 'YYYY-MM' → 그 달의 call이 던질 값. saveFailures: 그 달의 saveMonth가 던질 값 */
function fakes(failures: Failures = {}, saveFailures: Failures = {}) {
  const log: string[] = []
  const call = vi.fn(async (args: { from: string; to: string }) => {
    const month = args.from.slice(0, 7)
    log.push(`call ${month}`)
    if (month in failures) throw failures[month]
    return reply(args.from)
  })
  const saveMonth = vi.fn(async (month: string) => {
    log.push(`save ${month}`)
    if (month in saveFailures) throw saveFailures[month]
  })
  const store: RevenueStore = { saveMonth }
  const savedMonths = () => saveMonth.mock.calls.map(([month]) => month)
  return { call, store, saveMonth, savedMonths, log }
}

const THREE = ['2026-09', '2026-08', '2026-07']
const CLEAN = { stopped: null, failed: [], helperOld: false, extensionOld: false }

describe('AC-007.3 syncRevenue', () => {
  it('AC-007.3 달마다 가져오기 → 저장을 차례로 하고(동시에 돌지 않는다), 정리된 결과를 돌려준다', async () => {
    const { call, store, log } = fakes()
    const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
    expect(log).toEqual(['call 2026-09', 'save 2026-09', 'call 2026-08', 'save 2026-08', 'call 2026-07', 'save 2026-07'])
    expect(result).toEqual(CLEAN)
  })

  it('AC-007.3 앞 달의 저장이 끝나기 전에는 다음 달을 부르지 않는다', async () => {
    const { call } = fakes()
    let finishSave = () => {}
    const saveMonth = vi.fn(() => new Promise<void>((resolve) => void (finishSave = resolve)))
    const running = syncRevenue({ call, store: { saveMonth }, today: NOV_1, months: ['2026-09', '2026-08'] })
    await vi.waitFor(() => expect(saveMonth).toHaveBeenCalledTimes(1))
    expect(call).toHaveBeenCalledTimes(1)
    finishSave()
    await vi.waitFor(() => expect(saveMonth).toHaveBeenCalledTimes(2))
    finishSave()
    await running
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('AC-007.3 받은 답을 그 달 이름과 함께 그대로 저장소에 넘긴다', async () => {
    const { call, store, saveMonth } = fakes()
    await syncRevenue({ call, store, today: NOV_1, months: ['2026-09'] })
    expect(saveMonth).toHaveBeenCalledWith('2026-09', reply('2026-09-01'))
  })

  it('AC-007.3 달 셋 가운데 둘째가 E-BIT-READ-FAILED면 첫째·셋째는 저장하고 둘째만 failed에 넣는다', async () => {
    const { call, store, savedMonths } = fakes({ '2026-08': new BridgeError('E-BIT-READ-FAILED') })
    const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
    expect(savedMonths()).toEqual(['2026-09', '2026-07'])
    expect(result).toEqual({ ...CLEAN, failed: [{ month: '2026-08', code: 'E-BIT-READ-FAILED' }] })
  })

  it('AC-007.3 답 검사 실패(E-BRIDGE-BAD-REPLY)도 그 달만 failed에 넣고 계속한다', async () => {
    const { call, store, savedMonths } = fakes({ '2026-08': new BridgeError('E-BRIDGE-BAD-REPLY') })
    const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
    expect(savedMonths()).toEqual(['2026-09', '2026-07'])
    expect(result).toEqual({ ...CLEAN, failed: [{ month: '2026-08', code: 'E-BRIDGE-BAD-REPLY' }] })
  })

  it('AC-007.3 저장 실패(E-REVENUE-SAVE-FAILED)도 그 달만 failed에 넣고 다음 달을 가져온다', async () => {
    const { call, store } = fakes({}, { '2026-08': new RevenueStoreError('E-REVENUE-SAVE-FAILED') })
    const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
    expect(call).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ ...CLEAN, failed: [{ month: '2026-08', code: 'E-REVENUE-SAVE-FAILED' }] })
  })

  it('AC-007.3 둘째가 E-BRIDGE-DISCONNECTED면 거기서 stopped로 멈춘다(셋째는 부르지 않는다)', async () => {
    const { call, store, savedMonths } = fakes({ '2026-08': new BridgeError('E-BRIDGE-DISCONNECTED') })
    const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
    expect(call).toHaveBeenCalledTimes(2)
    expect(savedMonths()).toEqual(['2026-09'])
    expect(result).toEqual({ ...CLEAN, stopped: 'E-BRIDGE-DISCONNECTED' })
  })

  it.each(['E-HELPER-MISSING', 'E-EXT-MISSING', 'E-BIT-NOT-REGISTERED', 'E-BIT-HOSPITAL-MISMATCH', 'E-BIT-DB-FAILED', 'E-HELPER-OLD', 'E-SOMETHING-NEW'])(
    'AC-007.3 그 밖의 번호 %s는 stopped에 그대로 넣고 멈춘다(모르는 번호 포함)',
    async (code) => {
      const { call, store } = fakes({ '2026-09': new BridgeError(code) })
      const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
      expect(call).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ ...CLEAN, stopped: code })
    },
  )

  it('AC-007.3 멈추기 전에 실패한 달은 failed에 남는다', async () => {
    const { call, store } = fakes({
      '2026-09': new BridgeError('E-BIT-READ-FAILED'),
      '2026-08': new BridgeError('E-BRIDGE-DISCONNECTED'),
    })
    const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
    expect(result).toEqual({ ...CLEAN, stopped: 'E-BRIDGE-DISCONNECTED', failed: [{ month: '2026-09', code: 'E-BIT-READ-FAILED' }] })
  })

  it('AC-007.3 옛 도우미(E-HELPER-UNKNOWN-COMMAND)면 helperOld로 멈춘다(일반 오류로 보내지 않는다)', async () => {
    const { call, store, saveMonth } = fakes({ '2026-09': new BridgeError('E-HELPER-UNKNOWN-COMMAND') })
    const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
    expect(call).toHaveBeenCalledTimes(1)
    expect(saveMonth).not.toHaveBeenCalled()
    expect(result).toEqual({ ...CLEAN, helperOld: true })
  })

  it('AC-007.3 옛 확장(E-BRIDGE-REJECTED)이면 extensionOld로 멈춘다(일반 오류로 보내지 않는다)', async () => {
    const { call, store, saveMonth } = fakes({ '2026-09': new BridgeError('E-BRIDGE-REJECTED') })
    const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
    expect(call).toHaveBeenCalledTimes(1)
    expect(saveMonth).not.toHaveBeenCalled()
    expect(result).toEqual({ ...CLEAN, extensionOld: true })
  })

  it.each([
    ['E-HELPER-UNKNOWN-COMMAND', { helperOld: true }],
    ['E-BRIDGE-REJECTED', { extensionOld: true }],
  ])('AC-007.3 %s로 멈춰도 앞서 실패한 달은 failed에 남는다', async (code, flag) => {
    const { call, store } = fakes({ '2026-09': new BridgeError('E-BIT-READ-FAILED'), '2026-08': new BridgeError(code) })
    const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
    expect(call).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ ...CLEAN, ...flag, failed: [{ month: '2026-09', code: 'E-BIT-READ-FAILED' }] })
  })

  it.each([[new Error('화면에 나오면 안 되는 글')], [{ code: '42501', message: '화면에 나오면 안 되는 글' }], ['화면에 나오면 안 되는 글'], [undefined]])(
    'AC-007.3 번호가 없는 오류 %#은 글을 버리고 정해 둔 번호로 멈춘다',
    async (thrown) => {
      const { call, store } = fakes({ '2026-09': thrown })
      const result = await syncRevenue({ call, store, today: NOV_1, months: THREE })
      expect(call).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ ...CLEAN, stopped: 'E-PAGE-FAILED' })
    },
  )

  it('AC-007.3 onProgress는 달이 끝날 때마다 차례로 부른다(실패한 달도 끝난 달로 센다)', async () => {
    const onProgress = vi.fn()
    const { call, store } = fakes({ '2026-08': new BridgeError('E-BIT-READ-FAILED') })
    await syncRevenue({ call, store, today: NOV_1, months: THREE, onProgress })
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { done: 1, total: 3, month: '2026-09' },
      { done: 2, total: 3, month: '2026-08' },
      { done: 3, total: 3, month: '2026-07' },
    ])
  })

  it('AC-007.3 onProgress는 저장이 끝난 뒤에 부른다', async () => {
    const { call, store, log } = fakes()
    const onProgress = vi.fn((progress: { month: string }) => void log.push(`progress ${progress.month}`))
    await syncRevenue({ call, store, today: NOV_1, months: ['2026-09'], onProgress })
    expect(log).toEqual(['call 2026-09', 'save 2026-09', 'progress 2026-09'])
  })

  it('AC-007.3 멈춘 달은 onProgress로 알리지 않는다', async () => {
    const onProgress = vi.fn()
    const { call, store } = fakes({ '2026-08': new BridgeError('E-BRIDGE-DISCONNECTED') })
    await syncRevenue({ call, store, today: NOV_1, months: THREE, onProgress })
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([{ done: 1, total: 3, month: '2026-09' }])
  })

  it('AC-007.3 months를 주면 그 달 하나만 1일~말일로 다시 읽는다(저장돼 있어도)', async () => {
    const { call, store, savedMonths } = fakes()
    await syncRevenue({ call, store, today: NOV_1, months: ['2026-09'], savedDays: new Set(daysOfMonth('2026-09')) })
    expect(call.mock.calls).toEqual([[{ from: '2026-09-01', to: '2026-09-30' }]])
    expect(savedMonths()).toEqual(['2026-09'])
  })

  it('AC-007.3 months의 진행 중인 달은 planFetch와 같은 규칙으로 어제까지 읽는다', async () => {
    const { call, store } = fakes()
    await syncRevenue({ call, store, today: '2026-11-15', months: ['2026-11'] })
    expect(call.mock.calls).toEqual([[{ from: '2026-11-01', to: '2026-11-14' }]])
  })

  it('AC-007.3 months의 달에 아직 와야 할 날이 없으면 부르지 않는다(끝이 시작보다 앞인 기간은 도우미가 E-HELPER-BAD-MESSAGE로 막아 가져오기 전체가 멈춘다)', async () => {
    const onProgress = vi.fn()
    const { call, store } = fakes()
    const result = await syncRevenue({ call, store, today: NOV_1, months: ['2026-11', '2026-12'], onProgress })
    expect(call).not.toHaveBeenCalled()
    expect(onProgress).not.toHaveBeenCalled()
    expect(result).toEqual(CLEAN)
  })

  it('AC-007.3 months에 아직 와야 할 날이 없는 달이 섞여 있으면 그 달은 세지 않는다(진행 표시의 total)', async () => {
    const onProgress = vi.fn()
    const { call, store, savedMonths } = fakes()
    await syncRevenue({ call, store, today: NOV_1, months: ['2026-11', '2026-10'], onProgress })
    expect(call.mock.calls).toEqual([[{ from: '2026-10-01', to: '2026-10-31' }]])
    expect(savedMonths()).toEqual(['2026-10'])
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([{ done: 1, total: 1, month: '2026-10' }])
  })

  it('AC-007.3 months가 없으면 planFetch대로 빠진 달만 최근 달부터 가져온다', async () => {
    const savedDays = new Set(THIRTEEN.flatMap(daysOfMonth).filter((day) => day !== '2026-09-17' && day !== '2026-04-02'))
    const onProgress = vi.fn()
    const { call, store, savedMonths } = fakes()
    const result = await syncRevenue({ call, store, today: NOV_1, savedDays, onProgress })
    expect(call.mock.calls).toEqual([[{ from: '2026-09-01', to: '2026-09-30' }], [{ from: '2026-04-01', to: '2026-04-30' }]])
    expect(savedMonths()).toEqual(['2026-09', '2026-04'])
    expect(onProgress.mock.calls.at(-1)?.[0]).toEqual({ done: 2, total: 2, month: '2026-04' })
    expect(result).toEqual(CLEAN)
  })

  it('AC-007.3 빠진 달이 없으면 아무것도 부르지 않는다', async () => {
    const { call, store } = fakes()
    const result = await syncRevenue({ call, store, today: NOV_1, savedDays: new Set(THIRTEEN.flatMap(daysOfMonth)) })
    expect(call).not.toHaveBeenCalled()
    expect(result).toEqual(CLEAN)
  })
})

// 매출 가져올 기간(spec revenue-load-range TASK-1). 오늘 2026-11-10 → 최근 달 2026-11(어제 11월 9일까지)
const TODAY = '2026-11-10'
const monthsBack = (from: string, count: number) => Array.from({ length: count }, (_, back) => addMonths(from, -back))
const monthsOf = (ranges: { from: string }[]) => ranges.map((range) => monthOf(range.from))
// 최근 13달(2026-11 ~ 2025-11)이 다 저장된 날. 2026-11은 어제까지
const RECENT_13_SAVED = new Set([...eachDay({ from: '2026-11-01', to: '2026-11-09' }), ...monthsBack('2026-10', 12).flatMap(daysOfMonth)])

describe('AC-3501.3 planFetch 달 수 인자', () => {
  it('AC-3501.3 planFetch(today, saved, 25)는 2026-11 ~ 2024-11 25달 가운데 빠진 달만 새 달부터 돌려준다', () => {
    const saved = new Set([...daysOfMonth('2026-05'), ...daysOfMonth('2025-01')])
    const plan = planFetch(TODAY, saved, 25)
    expect(monthsOf(plan)).toEqual(monthsBack('2026-11', 25).filter((month) => month !== '2026-05' && month !== '2025-01'))
    expect(plan[0]).toEqual({ from: '2026-11-01', to: '2026-11-09' })
    expect(plan.at(-1)).toEqual({ from: '2024-11-01', to: '2024-11-30' })
  })

  it('AC-3501.3 셋째 인자가 없으면 지금처럼 최근 13달이다', () => {
    expect(planFetch(TODAY, NOTHING_SAVED)).toEqual(planFetch(TODAY, NOTHING_SAVED, 13))
    expect(monthsOf(planFetch(TODAY, NOTHING_SAVED))).toEqual(monthsBack('2026-11', 13))
  })

  it('AC-3501.3 날 줄이 다 있는 달은 빠지고, 최근 13달이 다 있으면 25달 가운데 남은 12달만이다', () => {
    expect(monthsOf(planFetch(TODAY, RECENT_13_SAVED, 25))).toEqual(monthsBack('2025-10', 12))
  })

  it('AC-3501.3 전체 기간(83달)이면 최근 13달이 다 있을 때 2025-10 ~ 2020-01 70달이 남는다', () => {
    const plan = planFetch(TODAY, RECENT_13_SAVED, spanMonths('all', TODAY))
    expect(plan).toHaveLength(70)
    expect(plan[0]).toEqual({ from: '2025-10-01', to: '2025-10-31' })
    expect(plan.at(-1)).toEqual({ from: '2020-01-01', to: '2020-01-31' })
  })
})

describe('AC-3501.2 spanMonths', () => {
  it('AC-3501.2 최근 1년 13달, 최근 2년 25달, 전체 기간은 2020-01 ~ 2026-11 83달이다', () => {
    expect(spanMonths('1y', TODAY)).toBe(13)
    expect(spanMonths('2y', TODAY)).toBe(25)
    expect(spanMonths('all', TODAY)).toBe(83)
  })

  it('AC-3501.2 전체 기간의 첫 달은 ALL_FROM_MONTH(2020-01)다', () => {
    expect(ALL_FROM_MONTH).toBe('2020-01')
    expect(monthsOf(planFetch(TODAY, NOTHING_SAVED, spanMonths('all', TODAY))).at(-1)).toBe(ALL_FROM_MONTH)
  })

  it('AC-3501.2 오늘이 1일이면 최근 달이 지난달이라 전체 기간은 2020-01 ~ 2026-10 82달이다', () => {
    expect(spanMonths('all', '2026-11-01')).toBe(82)
    expect(spanMonths('1y', '2026-11-01')).toBe(13)
    expect(spanMonths('2y', '2026-11-01')).toBe(25)
  })

  it('AC-3501.2 해의 첫날에도 지난해 12월까지 센다(2020-01 ~ 2025-12 = 72달)', () => {
    expect(spanMonths('all', '2026-01-01')).toBe(72)
  })
})

describe('AC-3502.1 고른 기간 가져오기', () => {
  it('AC-3502.1 planFetch로 고른 기간의 달 목록을 months로 주면 새 달부터 한 번씩 차례로 부르고, 달마다 1일 ~ 말일(어제를 넘지 않음)이다', async () => {
    const saved = new Set([...daysOfMonth('2026-10'), ...daysOfMonth('2025-06')])
    const months = monthsOf(planFetch(TODAY, saved, 25))
    const { call, store, log } = fakes()
    const result = await syncRevenue({ call, store, today: TODAY, months })
    const expected = monthsBack('2026-11', 25).filter((month) => month !== '2026-10' && month !== '2025-06')
    expect(log).toEqual(expected.flatMap((month) => [`call ${month}`, `save ${month}`]))
    expect(call.mock.calls[0]).toEqual([{ from: '2026-11-01', to: '2026-11-09' }])
    expect(call.mock.calls.slice(1).map(([args]) => args)).toEqual(expected.slice(1).map((month) => monthRange(month)))
    expect(result).toEqual(CLEAN)
  })

  it('AC-3502.1 이미 다 저장된 달은 부르지 않는다(최근 13달이 다 있으면 최근 2년은 2025-10 ~ 2024-11만)', async () => {
    const months = monthsOf(planFetch(TODAY, RECENT_13_SAVED, spanMonths('2y', TODAY)))
    const { call, store } = fakes()
    await syncRevenue({ call, store, today: TODAY, months })
    expect(call.mock.calls.map(([args]) => monthOf(args.from))).toEqual(monthsBack('2025-10', 12))
  })
})

describe('AC-3502.5 멈춘 뒤 다시 계획하기', () => {
  it('AC-3502.5 전체 기간 70달 가운데 앞 12달을 저장하고 멈췄다면, 다시 계획하면 남은 58달(2024-10 ~ 2020-01)만이다', async () => {
    const span = spanMonths('all', TODAY)
    const first = monthsOf(planFetch(TODAY, RECENT_13_SAVED, span))
    expect(first).toHaveLength(70)
    const { call, store, savedMonths } = fakes({ '2024-10': new BridgeError('E-BRIDGE-DISCONNECTED') })
    const result = await syncRevenue({ call, store, today: TODAY, months: first })
    expect(result.stopped).toBe('E-BRIDGE-DISCONNECTED')
    expect(savedMonths()).toEqual(monthsBack('2025-10', 12))

    const savedNow = new Set([...RECENT_13_SAVED, ...savedMonths().flatMap(daysOfMonth)])
    const again = monthsOf(planFetch(TODAY, savedNow, span))
    expect(again).toEqual(monthsBack('2024-10', 58))
    expect(again.at(-1)).toBe('2020-01')
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
