// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compareYmd, eachDay } from '@/lib/analytics/dates'
import { BridgeError } from '@/lib/bridge/protocol'
import type { DateRange } from '@/types/dates'
import type { RevenueCodeTotal, RevenueDayRow, RevenueDaysResult, RevenueMonthCode, SavedRevenueDay } from '@/types/revenue'
import { useStatsRevenue } from './useStatsRevenue'
import { readSpan, statsRange, type StatsRange } from './view'

// 통계 매출 훅 (stats-revenue REQ-4104 AC-4104.4 · REQ-4108, design.md '매출 훅'). 저장소는 가짜(createRevenueStore를 바꿈), 비트 call도 가짜다.
// 계획(planRevenue)·차례(syncRanges)는 진짜를 쓴다. 날 줄·처방·금액은 모두 지어낸 값이다

const store = vi.hoisted(() => ({
  saveRange: vi.fn(),
  loadDays: vi.fn(),
  codeTotals: vi.fn(),
  monthCodes: vi.fn(),
}))
vi.mock('@/lib/storage/revenue', () => ({ createRevenueStore: vi.fn(() => store) }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))

// 오늘 11월 14일(토) · 오늘 진료 끝 꺼짐 → 마지막 끝난 날 11월 13일
const TODAY = '2026-11-14'
const LAST_DAY = '2026-11-13'
const RECENT30 = statsRange(TODAY, '30d') // 보는 기간 10-15 ~ 11-13, 바로 전 09-15 ~ 10-14, 불러올 범위 09-01 ~ 11-14
const RECENT7 = statsRange(TODAY, '7d') // 보는 기간 11-07 ~ 11-13, 바로 전 10-31 ~ 11-06
const SPAN30: DateRange = { from: '2026-09-15', to: '2026-11-13' }
const SPAN7: DateRange = { from: '2026-10-31', to: '2026-11-13' }
const WHOLE = RECENT30.load

const CODES: RevenueCodeTotal[] = [
  { code: 'MM101', count: 120, amount: 5_400_000, missing: false },
  { code: 'ESWT1', count: 30, amount: 1_800_000, missing: true },
]
const MONTH_CODES: RevenueMonthCode[] = [{ month: '2026-10', code: 'MM101', name: '가짜처방', count: 400, amount: 18_000_000 }]

function dayRow(date: string): RevenueDayRow {
  return {
    date,
    visits: 70,
    newPatients: 5,
    returnVisits: 65,
    total: 3_000_000,
    insurer: 1_500_000,
    noncovered: 900_000,
    copay: 450_000,
    otherTotal: 150_000,
    cash: 200_000,
    card: 1_100_000,
    transfer: 50_000,
    receivableIn: 0,
    unconfirmed: false,
    splitUnconfirmed: false,
  }
}
const saved = (date: string, dayCodes = true): SavedRevenueDay => ({ ...dayRow(date), dayCodes })

/** 도우미 답. withDayCodes가 거짓이면 옛 도우미(dayCodes 열쇠 없음) */
function answer(range: DateRange, withDayCodes = true): RevenueDaysResult {
  const days = eachDay(range).map(dayRow)
  return withDayCodes ? { days, codes: [], dayCodes: days.map((row) => [row.date, 'MM101', 3, 135_000] as const) } : { days, codes: [] }
}

// 가짜 서버: 저장하면 그 날 줄이 생기고(dayCodes = 답에 날 단위 처방 줄이 있었는지), 읽으면 범위 안 줄을 날짜 차례로 준다
let db = new Map<string, SavedRevenueDay>()
const seed = (rows: SavedRevenueDay[]) => (db = new Map(rows.map((row) => [row.date, row])))
const rowsIn = ({ from, to }: DateRange) =>
  [...db.values()].filter((row) => compareYmd(row.date, from) >= 0 && compareYmd(row.date, to) <= 0).sort((a, b) => compareYmd(a.date, b.date))

// 09-01 ~ 11-12 저장, 그 가운데 10-01 ~ 10-03은 줄 없음, 10-20은 날 단위 처방 금액 없음. 11-13(어제)은 아직 없음
// → 읽을 덩어리(새것부터): 11-13 · 10-20 · 10-01 ~ 10-03
function seedWithGaps() {
  seed(
    eachDay({ from: '2026-09-01', to: '2026-11-12' })
      .filter((day) => !['2026-10-01', '2026-10-02', '2026-10-03'].includes(day))
      .map((day) => saved(day, day !== '2026-10-20')),
  )
}
const CHUNKS: DateRange[] = [
  { from: '2026-11-13', to: '2026-11-13' },
  { from: '2026-10-20', to: '2026-10-20' },
  { from: '2026-10-01', to: '2026-10-03' },
]

const fail = (code: string) => Object.assign(new Error(code), { code })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

type Call = (range: DateRange) => Promise<RevenueDaysResult>
// helperVersion: 연결된 도우미 판(first90 AC-4407.1). 주지 않으면 모름
type Props = { range: StatsRange; today: string; lastDay: string; call: Call | null; helperVersion?: string | null }
const props = (over: Partial<Props> = {}): Props => ({ range: RECENT30, today: TODAY, lastDay: LAST_DAY, call: null, ...over })
const draw = (over: Partial<Props> = {}) => renderHook((p: Props) => useStatsRevenue(p), { initialProps: props(over) })
type View = ReturnType<typeof draw>

const ready = (view: View) => waitFor(() => expect(view.result.current.state).toBe('ready'))
const settle = () =>
  act(async () => {
    await new Promise((done) => setTimeout(done, 0))
  })
const dates = (view: View) => view.result.current.days.map((row) => row.date)
const asked = (fn: { mock: { calls: unknown[][] } }) => fn.mock.calls.map(([range]) => range)

/** 답하는 가짜 call. reply가 Error를 주면 그것으로 거절 */
function answering(reply: (range: DateRange) => RevenueDaysResult | Error = (range) => answer(range)) {
  return vi.fn<Call>(async (range) => {
    const value = reply(range)
    if (value instanceof Error) throw value
    return value
  })
}

async function syncOnce(view: View, closeToday = false, whole: DateRange = WHOLE) {
  await act(async () => {
    await view.result.current.sync({ whole, closeToday })
  })
}

beforeEach(() => {
  db = new Map()
  store.loadDays.mockReset().mockImplementation(async (range: DateRange) => rowsIn(range))
  store.codeTotals.mockReset().mockResolvedValue(CODES)
  store.monthCodes.mockReset().mockResolvedValue(MONTH_CODES)
  store.saveRange.mockReset().mockImplementation(async (_range: DateRange, result: RevenueDaysResult) => {
    for (const row of result.days) db.set(row.date, { ...row, dayCodes: result.dayCodes !== undefined })
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AC-4104.4 저장된 매출 읽기(훅이 읽는 범위)', () => {
  it('AC-4104.4: 열면 readSpan 날 줄 · 보는 기간(끝 = 마지막 끝난 날) 코드별 합 · 그 달들의 옛 달 합계를 한 번씩 읽어 ready이고, 비트는 부르지 않는다', async () => {
    seedWithGaps()
    expect(readSpan(RECENT30)).toEqual(SPAN30)
    const call = answering()
    const view = draw({ call })
    expect(view.result.current.state).toBe('reading')
    await ready(view)

    expect(asked(store.loadDays)).toEqual([SPAN30])
    expect(asked(store.codeTotals)).toEqual([{ from: '2026-10-15', to: '2026-11-13' }])
    expect(store.monthCodes.mock.calls).toEqual([['2026-10', '2026-11']])
    expect(view.result.current.days).toEqual(rowsIn(SPAN30))
    expect(view.result.current.codes).toEqual(CODES)
    expect(view.result.current.monthCodes).toEqual(MONTH_CODES)
    expect(view.result.current).toMatchObject({ noDayCodes: false, progress: null, failure: null })
    expect(call).not.toHaveBeenCalled()
    expect(store.saveRange).not.toHaveBeenCalled()
  })

  it('AC-4104.4: 보는 기간 끝은 기간 끝과 마지막 끝난 날 가운데 이른 날이다(최근 12개월 · 오늘 진료 끝)', async () => {
    const range = statsRange(TODAY, '12m') // 2025-12-01 ~ 2026-11-30, 작년 2024-12-01 ~ 2025-11-30
    const view = draw({ range, lastDay: TODAY })
    await ready(view)
    expect(asked(store.loadDays)).toEqual([{ from: '2024-12-01', to: '2026-11-30' }])
    expect(asked(store.codeTotals)).toEqual([{ from: '2025-12-01', to: TODAY }])
    expect(store.monthCodes.mock.calls).toEqual([['2025-12', '2026-11']])
  })

  it('AC-4104.4: 마지막 끝난 날이 바뀌면(오늘 진료 끝으로 저장) 보는 기간 합계를 다시 읽는다', async () => {
    const range = statsRange(TODAY, '12m')
    const view = draw({ range })
    await ready(view)
    view.rerender(props({ range, lastDay: TODAY }))
    await waitFor(() => expect(store.codeTotals).toHaveBeenCalledTimes(2))
    await ready(view)
    expect(asked(store.codeTotals)).toEqual([
      { from: '2025-12-01', to: LAST_DAY },
      { from: '2025-12-01', to: TODAY },
    ])
  })

  it('AC-4104.4: 기간을 바꾸면 그동안 reading이고 새 범위로 다시 읽으며, 늦게 온 앞 기간 답은 버린다', async () => {
    seedWithGaps()
    const late = deferred<SavedRevenueDay[]>()
    store.loadDays.mockImplementationOnce(() => late.promise)
    const view = draw()
    expect(view.result.current.state).toBe('reading')

    view.rerender(props({ range: RECENT7 }))
    expect(view.result.current.state).toBe('reading')
    await ready(view)
    expect(asked(store.loadDays)).toEqual([SPAN30, SPAN7])
    expect(asked(store.codeTotals).at(-1)).toEqual({ from: '2026-11-07', to: '2026-11-13' })
    expect(store.monthCodes.mock.calls.at(-1)).toEqual(['2026-11', '2026-11'])
    expect(view.result.current.days).toEqual(rowsIn(SPAN7))

    late.resolve([saved('2026-09-20')])
    await settle()
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.days).toEqual(rowsIn(SPAN7))
  })

  it('AC-4104.4: 같은 기간을 새 객체로 다시 그려도 다시 읽지 않는다', async () => {
    const view = draw()
    await ready(view)
    view.rerender(props({ range: statsRange(TODAY, '30d') }))
    await settle()
    expect(store.loadDays).toHaveBeenCalledTimes(1)
    expect(store.codeTotals).toHaveBeenCalledTimes(1)
    expect(store.monthCodes).toHaveBeenCalledTimes(1)
  })

  it.each(['loadDays', 'codeTotals', 'monthCodes'] as const)(
    'AC-4104.4: %s가 실패하면 read-failed이고 빈 목록을 보이지 않으며, reread()로 다시 읽어 ready가 된다',
    async (name) => {
      seedWithGaps()
      store[name].mockRejectedValueOnce(fail('E-STATS-READ-FAILED'))
      const view = draw()
      await waitFor(() => expect(view.result.current.state).toBe('read-failed'))
      expect(view.result.current).toMatchObject({ days: [], codes: [], monthCodes: [] })

      act(() => view.result.current.reread())
      expect(view.result.current.state).toBe('reading')
      await ready(view)
      expect(view.result.current.days).toEqual(rowsIn(SPAN30))
      expect(store[name]).toHaveBeenCalledTimes(2)
    },
  )
})

describe('AC-4108.2 [비트에서 불러오기] 뒤 매출 빈 날 읽기(sync)', () => {
  it('AC-4108.2: 불러올 기간의 저장 표시를 읽어 빈 날·날 단위 처방 없는 날·어제를 새것부터 덩어리로 하나씩 call → 저장하고, 끝나면 다시 읽어 새 숫자다', async () => {
    seedWithGaps()
    const call = answering()
    const view = draw({ call })
    await ready(view)
    expect(dates(view)).not.toContain('2026-11-13')

    await syncOnce(view)
    expect(asked(call)).toEqual(CHUNKS)
    expect(asked(store.saveRange)).toEqual(CHUNKS)
    expect(store.saveRange.mock.calls[0]?.[1]).toEqual(answer(CHUNKS[0]!))
    await waitFor(() => expect(store.loadDays).toHaveBeenCalledTimes(3))
    expect(asked(store.loadDays)).toEqual([SPAN30, WHOLE, SPAN30])
    await ready(view)
    expect(dates(view)).toContain('2026-11-13')
    expect(view.result.current.days.find((row) => row.date === '2026-10-20')?.dayCodes).toBe(true)
    expect(view.result.current).toMatchObject({ noDayCodes: false, progress: null, failure: null })
  })

  it('AC-4108.2·AC-4108.3: 한 번에 한 덩어리씩이고, progress는 차례를 세는 동안 0/0 · 덩어리를 읽는 동안 1/3 · 2/3 · 3/3, 끝나면 null', async () => {
    seedWithGaps()
    const pending: { range: DateRange; resolve(value: RevenueDaysResult): void }[] = []
    const call = vi.fn<Call>((range) => new Promise((resolve) => pending.push({ range, resolve })))
    const view = draw({ call })
    await ready(view)

    const plan = deferred<SavedRevenueDay[]>()
    store.loadDays.mockImplementationOnce(() => plan.promise)
    let finished = false
    act(() => {
      void view.result.current.sync({ whole: WHOLE, closeToday: false }).then(() => (finished = true))
    })
    expect(view.result.current.progress).toEqual({ done: 0, total: 0 })
    expect(call).not.toHaveBeenCalled()

    plan.resolve(rowsIn(WHOLE))
    for (const [i, chunk] of CHUNKS.entries()) {
      await waitFor(() => expect(pending).toHaveLength(i + 1))
      expect(pending[i]?.range).toEqual(chunk)
      expect(view.result.current.progress).toEqual({ done: i + 1, total: 3 })
      await settle()
      expect(pending).toHaveLength(i + 1) // 앞 덩어리가 끝나기 전에는 다음을 부르지 않는다
      expect(store.saveRange).toHaveBeenCalledTimes(i)
      pending[i]?.resolve(answer(chunk))
    }
    await waitFor(() => expect(finished).toBe(true))
    expect(store.saveRange).toHaveBeenCalledTimes(3)
    expect(view.result.current.progress).toBeNull()
  })

  it('AC-4108.2: 오늘 진료 끝이면 오늘까지 읽는다(어제·오늘이 한 덩어리)', async () => {
    seedWithGaps()
    const call = answering()
    const view = draw({ call })
    await ready(view)
    await syncOnce(view, true)
    expect(asked(call)[0]).toEqual({ from: '2026-11-13', to: TODAY })
  })

  it('AC-4108.2: 저장된 매출이 하나도 없으면 불러올 기간 첫날 ~ 어제를 31일 덩어리로 새것부터 읽는다', async () => {
    const call = answering()
    const view = draw({ call })
    await ready(view)
    await syncOnce(view)
    expect(asked(call)).toEqual([
      { from: '2026-10-14', to: '2026-11-13' },
      { from: '2026-09-13', to: '2026-10-13' },
      { from: '2026-09-01', to: '2026-09-12' },
    ])
  })

  it('AC-4108.2: sync가 도는 동안 다시 부르면 두 번째는 아무것도 하지 않는다(한 번에 하나)', async () => {
    seedWithGaps()
    const first = deferred<RevenueDaysResult>()
    const call = vi.fn<Call>().mockImplementationOnce(() => first.promise).mockImplementation(async (range) => answer(range))
    const view = draw({ call })
    await ready(view)
    let one = false
    let two = false
    act(() => {
      void view.result.current.sync({ whole: WHOLE, closeToday: false }).then(() => (one = true))
    })
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1))
    await act(async () => {
      await view.result.current.sync({ whole: WHOLE, closeToday: true }).then(() => (two = true))
    })
    expect(two).toBe(true)
    expect(one).toBe(false)
    expect(store.loadDays).toHaveBeenCalledTimes(2) // 열 때 하나 + 첫 sync 계획 하나

    first.resolve(answer(CHUNKS[0]!))
    await waitFor(() => expect(one).toBe(true))
    expect(asked(call)).toEqual(CHUNKS)
  })
})

describe('AC-4108.5 매출만 실패 상태 값', () => {
  it('AC-4108.5: 덩어리 하나가 읽기 실패면 그 덩어리만 실패로 적고 다음을 읽으며, failure = 처음 번호 · 전에 저장한 끝날(11월 12일)', async () => {
    seedWithGaps()
    const call = answering((range) => (range.to === '2026-11-13' ? new BridgeError('E-BIT-READ-FAILED') : answer(range)))
    const view = draw({ call })
    await ready(view)
    await syncOnce(view)
    expect(asked(call)).toEqual(CHUNKS)
    expect(view.result.current.failure).toEqual({ code: 'E-BIT-READ-FAILED', savedTo: '2026-11-12' })
    expect(view.result.current.progress).toBeNull()
    // 그래도 다시 읽는다(다른 덩어리는 저장됐다)
    await waitFor(() => expect(store.loadDays).toHaveBeenCalledTimes(3))
  })

  it('AC-4108.5: 멈추는 번호면 남은 덩어리를 부르지 않고 failure는 그 번호 · 이번에 저장한 날까지 넣은 끝날이다', async () => {
    seedWithGaps()
    const call = answering((range) => (range.to === '2026-10-20' ? new BridgeError('E-BRIDGE-DISCONNECTED') : answer(range)))
    const view = draw({ call })
    await ready(view)
    await syncOnce(view)
    expect(asked(call)).toEqual(CHUNKS.slice(0, 2))
    expect(view.result.current.failure).toEqual({ code: 'E-BRIDGE-DISCONNECTED', savedTo: '2026-11-13' })
  })

  it('AC-4108.5: 앞 덩어리가 저장에 실패한 뒤 다른 번호로 멈추면 처음 난 번호다', async () => {
    seedWithGaps()
    store.saveRange.mockRejectedValueOnce(fail('E-REVENUE-SAVE-FAILED'))
    const call = answering((range) => (range.to === '2026-10-20' ? new BridgeError('E-HELPER-UNKNOWN-COMMAND') : answer(range)))
    const view = draw({ call })
    await ready(view)
    await syncOnce(view)
    expect(asked(call)).toEqual(CHUNKS.slice(0, 2))
    expect(view.result.current.failure).toEqual({ code: 'E-REVENUE-SAVE-FAILED', savedTo: '2026-11-12' })
  })

  it('AC-4108.5: 전에 저장한 매출이 하나도 없고 모두 실패하면 savedTo는 null이다', async () => {
    const call = answering(() => new BridgeError('E-BIT-READ-FAILED'))
    const view = draw({ call })
    await ready(view)
    await syncOnce(view)
    expect(call).toHaveBeenCalledTimes(3)
    expect(view.result.current.failure).toEqual({ code: 'E-BIT-READ-FAILED', savedTo: null })
  })

  it('AC-4108.5: 다시 sync하는 동안은 앞 failure 그대로이고, 성공하면 failure를 지운다', async () => {
    seedWithGaps()
    let broken = true
    const pending: (() => void)[] = []
    const call = vi.fn<Call>(
      (range) =>
        new Promise((resolve, reject) => {
          pending.push(() => (broken ? reject(new BridgeError('E-BIT-READ-FAILED')) : resolve(answer(range))))
          if (broken) pending.shift()?.()
        }),
    )
    const view = draw({ call })
    await ready(view)
    await syncOnce(view)
    const before = view.result.current.failure
    expect(before).toEqual({ code: 'E-BIT-READ-FAILED', savedTo: '2026-11-12' })

    broken = false
    let finished = false
    act(() => {
      void view.result.current.sync({ whole: WHOLE, closeToday: false }).then(() => (finished = true))
    })
    await waitFor(() => expect(pending).toHaveLength(1))
    expect(view.result.current.failure).toBe(before)
    while (!finished) {
      pending.shift()?.()
      await settle()
    }
    expect(view.result.current.failure).toBeNull()
  })

  it('AC-4108.5: 계획 읽기(불러올 기간 저장 표시)가 실패해도 거절하지 않고 비트를 부르지 않으며, failure = E-STATS-READ-FAILED · 화면에 보이던 저장 끝날', async () => {
    seedWithGaps()
    const call = answering()
    const view = draw({ call })
    await ready(view)
    store.loadDays.mockRejectedValueOnce(fail('E-STATS-READ-FAILED'))
    await syncOnce(view)
    expect(call).not.toHaveBeenCalled()
    expect(store.saveRange).not.toHaveBeenCalled()
    expect(view.result.current.failure).toEqual({ code: 'E-STATS-READ-FAILED', savedTo: '2026-11-12' })
    expect(view.result.current.progress).toBeNull()
  })

  it('AC-4108.5: 번호 없는 오류의 글은 failure에 옮기지 않는다', async () => {
    seedWithGaps()
    const call = answering((range) => (range.to === '2026-11-13' ? new Error('가짜-차트번호-0001') : answer(range)))
    const view = draw({ call })
    await ready(view)
    await syncOnce(view)
    expect(view.result.current.failure?.code).toMatch(/^E-[A-Z0-9-]+$/)
    expect(JSON.stringify(view.result.current)).not.toContain('가짜-차트번호')
  })
})

describe('AC-4108.6 저장 뒤 새 숫자 · 도우미 예전 판 표시', () => {
  it('AC-4108.6: 답에 dayCodes가 없으면 noDayCodes가 켜지고, 저장 뒤 다시 읽은 날은 날 단위 처방 금액 없음이다', async () => {
    seedWithGaps()
    const call = answering((range) => answer(range, false))
    const view = draw({ call })
    await ready(view)
    await syncOnce(view)
    expect(view.result.current.noDayCodes).toBe(true)
    await waitFor(() => expect(store.loadDays).toHaveBeenCalledTimes(3))
    await ready(view)
    expect(view.result.current.days.find((row) => row.date === '2026-11-13')?.dayCodes).toBe(false)
    expect(view.result.current.failure).toBeNull()
  })

  it('AC-4108.6: 다음 답에 dayCodes가 있으면 꺼지고, 답이 하나도 없던 sync(모두 실패)는 그대로 둔다', async () => {
    seedWithGaps()
    let mode: 'old' | 'none' | 'new' = 'old'
    const call = answering((range) => (mode === 'none' ? new BridgeError('E-BIT-READ-FAILED') : answer(range, mode === 'new')))
    const view = draw({ call })
    await ready(view)
    await syncOnce(view)
    expect(view.result.current.noDayCodes).toBe(true)
    mode = 'none'
    await syncOnce(view)
    expect(view.result.current.noDayCodes).toBe(true)
    mode = 'new'
    await syncOnce(view)
    expect(view.result.current.noDayCodes).toBe(false)
  })

  it('AC-4108.6: 도우미 예전 판 표시는 기억하지 않는다(다시 열면 꺼진 채)', async () => {
    seedWithGaps()
    const call = answering((range) => answer(range, false))
    const first = draw({ call })
    await ready(first)
    await syncOnce(first)
    expect(first.result.current.noDayCodes).toBe(true)
    first.unmount()

    const again = draw({ call })
    await ready(again)
    expect(again.result.current.noDayCodes).toBe(false)
  })
})

describe('AC-4108.7 비트 PC가 아닌 기기', () => {
  it('AC-4108.7: call이 null이면 저장된 숫자만 읽고, sync는 저장소도 비트도 부르지 않고 상태를 바꾸지 않는다', async () => {
    seedWithGaps()
    const view = draw({ call: null })
    await ready(view)
    const before = view.result.current
    await syncOnce(view)
    await settle()
    expect(store.loadDays).toHaveBeenCalledTimes(1)
    expect(store.saveRange).not.toHaveBeenCalled()
    expect(view.result.current).toMatchObject({ state: 'ready', progress: null, failure: null, noDayCodes: false })
    expect(view.result.current.days).toBe(before.days)
  })
})

describe('AC-4108.2 같은 연결 · 저장소', () => {
  it('AC-4108.2: sync를 해도 브라우저 저장소에 아무것도 쓰지 않는다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    seedWithGaps()
    const call = answering((range) => (range.to === '2026-11-13' ? new BridgeError('E-BIT-READ-FAILED') : answer(range, false)))
    const view = draw({ call })
    await ready(view)
    await syncOnce(view)
    await ready(view)
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('AC-4108.2: 훅 소스는 받은 call로만 비트에 묻고(useBridge·통로를 직접 쓰지 않음) 브라우저 저장소·주소를 쓰지 않는다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/stats/useStatsRevenue.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
    for (const word of ['useBridge', 'lib/bridge', 'chrome.', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'history.', 'location.', 'fetch(']) {
      expect(text, word).not.toContain(word)
    }
    expect(text).toContain('createRevenueStore(supabaseBrowser())')
  })
})

describe('AC-4407.1·AC-4407.2 참고 금액이 없는 확인 필요한 날을 한 번 다시 읽는다(sync의 저장 표시)', () => {
  /** 저장된 확인 필요한 날(금액 아홉 칸 null). roughTotal = 참고 금액(null = 모름) */
  const unchecked = (date: string, roughTotal: number | null): SavedRevenueDay => ({
    ...dayRow(date),
    total: null,
    insurer: null,
    noncovered: null,
    copay: null,
    otherTotal: null,
    cash: null,
    card: null,
    transfer: null,
    receivableIn: null,
    unconfirmed: true,
    dayCodes: true,
    roughTotal,
  })
  // seedWithGaps 위에: 10-25·10-26은 참고 금액을 모르는 확인 필요한 날, 10-27은 참고 금액이 있는 확인 필요한 날
  function seedUnchecked() {
    seedWithGaps()
    db.set('2026-10-25', unchecked('2026-10-25', null))
    db.set('2026-10-26', unchecked('2026-10-26', null))
    db.set('2026-10-27', unchecked('2026-10-27', -52_000))
  }

  it.each(['0.7.0', '0.8.1'])('AC-4407.1: 도우미 %s면 참고 금액을 모르는 확인 필요한 날(10-25 ~ 10-26)도 새것부터 덩어리로 다시 읽는다', async (helperVersion) => {
    seedUnchecked()
    const call = answering()
    const view = draw({ call, helperVersion })
    await ready(view)
    await syncOnce(view)
    expect(asked(call)).toEqual([CHUNKS[0], { from: '2026-10-25', to: '2026-10-26' }, CHUNKS[1], CHUNKS[2]])
    expect(asked(store.saveRange)).toEqual(asked(call))
  })

  it.each([['0.6.0'], ['0.5.1'], [null], [undefined]])('AC-4407.2: 도우미 %j(0.7.0 미만·모름)면 그런 날도 다시 읽지 않는다(지금 그대로)', async (helperVersion) => {
    seedUnchecked()
    const call = answering()
    const view = draw({ call, helperVersion })
    await ready(view)
    await syncOnce(view)
    expect(asked(call)).toEqual(CHUNKS)
  })

  it('AC-4407.1: 같은 화면에서 도우미 판이 바뀌면(새 도우미로 다시 연결) 다음 sync부터 바뀐 판으로 고른다', async () => {
    seedUnchecked()
    const call = answering()
    const view = draw({ call, helperVersion: '0.6.0' })
    await ready(view)
    view.rerender(props({ call, helperVersion: '0.7.0' }))
    await syncOnce(view)
    expect(asked(call)).toContainEqual({ from: '2026-10-25', to: '2026-10-26' })
  })
})
