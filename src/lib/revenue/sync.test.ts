// 매출 가져오기 계획과 차례(TASK-7, REQ-007 · AC-007.1·AC-007.3). 숫자는 모두 가짜고, call·store도 가짜다
import { describe, expect, it, vi } from 'vitest'
import { eachDay, monthRange } from '@/lib/analytics/dates'
import { BridgeError } from '@/lib/bridge/protocol'
import { RevenueStoreError, type RevenueStore } from '@/lib/storage/revenue'
import type { RevenueDaysResult } from '@/types/revenue'
import { planFetch, syncRevenue } from './sync'

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
