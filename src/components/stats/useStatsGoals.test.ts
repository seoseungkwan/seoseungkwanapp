// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGoal, saveGoal } from '@/lib/storage/goals'
import { createRevenueStore, type RevenueRangeStore } from '@/lib/storage/revenue'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { Goal } from '@/types/goals'
import type { SavedRevenueDay } from '@/types/revenue'
import { useStatsGoals } from './useStatsGoals'

// 통계 요약 '이번 달 목표'의 서버 읽기·저장 훅 (stats-insights REQ-6102 AC-6102.2·AC-6102.4·AC-6102.5, design.md '목표', TASK-1).
// 저장 코드는 가짜다. 숫자는 지어낸 값이다. 내원·신환 하루 숫자는 넓은 하루 읽기(TASK-2)가 주므로 이 훅은 목표와 하루 매출만 읽는다

vi.mock('@/lib/storage/goals', () => ({ loadGoal: vi.fn(), saveGoal: vi.fn() }))
vi.mock('@/lib/storage/revenue', () => ({ createRevenueStore: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))
const CLIENT = { fake: 'client' } as unknown as ReturnType<typeof supabaseBrowser>

const TODAY = '2026-11-18'
const GOAL: Goal = { visits: 3200, newPatients: 180, revenue: 120_000_000 }
const EMPTY: Goal = { visits: null, newPatients: null, revenue: null }

const salesDay = (date: string, total: number | null): SavedRevenueDay => ({
  date,
  visits: 0,
  newPatients: 0,
  returnVisits: 0,
  total,
  insurer: total,
  noncovered: total === null ? null : 0,
  copay: total === null ? null : 0,
  otherTotal: total === null ? null : 0,
  cash: total === null ? null : 0,
  card: total === null ? null : 0,
  transfer: total === null ? null : 0,
  receivableIn: total === null ? null : 0,
  unconfirmed: total === null,
  splitUnconfirmed: false,
  dayCodes: true,
  roughTotal: null,
})
// 확인 필요한 날(총액 null)은 하루 매출 값에서 뺀다
const SALES = [salesDay('2026-11-16', 5_000_000), salesDay('2026-11-17', null), salesDay('2026-10-20', 3_000_000)]

const loadDays = vi.fn<RevenueRangeStore['loadDays']>()

beforeEach(() => {
  vi.mocked(supabaseBrowser).mockReset()
  vi.mocked(supabaseBrowser).mockReturnValue(CLIENT)
  vi.mocked(loadGoal).mockReset()
  vi.mocked(saveGoal).mockReset()
  loadDays.mockReset()
  vi.mocked(createRevenueStore).mockReset()
  vi.mocked(createRevenueStore).mockReturnValue({ loadDays } as unknown as RevenueRangeStore)
  vi.mocked(loadGoal).mockResolvedValue(GOAL)
  vi.mocked(saveGoal).mockResolvedValue()
  loadDays.mockResolvedValue(SALES)
})

afterEach(cleanup)

describe('AC-6102.2·AC-6102.4 useStatsGoals: 이번 달 목표·하루 매출 읽기', () => {
  it('AC-6102.2: 오늘이 든 달의 목표를 loadGoal(client, YYYY-MM)로 읽고, 읽는 동안은 reading이다', async () => {
    const { result } = renderHook(() => useStatsGoals(TODAY))
    expect(result.current.goal).toBe('reading')
    expect(result.current.revenue).toBe('reading')
    expect(result.current.today).toBe(TODAY)
    await waitFor(() => expect(result.current.goal).toEqual(GOAL))
    expect(loadGoal).toHaveBeenCalledTimes(1)
    expect(loadGoal).toHaveBeenCalledWith(CLIENT, '2026-11')
  })

  it('AC-6102.4: 하루 매출은 오늘 앞 56일 ~ 어제의 sales_days 총액이고, 총액이 빈 날(확인 필요)은 뺀다', async () => {
    const { result } = renderHook(() => useStatsGoals(TODAY))
    await waitFor(() => expect(result.current.revenue).not.toBe('reading'))
    expect(createRevenueStore).toHaveBeenCalledWith(CLIENT)
    expect(loadDays).toHaveBeenCalledWith({ from: '2026-09-23', to: '2026-11-17' })
    expect(result.current.revenue).toEqual([
      { day: '2026-11-16', value: 5_000_000 },
      { day: '2026-10-20', value: 3_000_000 },
    ])
  })

  it('AC-6102.2: 목표를 읽지 못하면 goal은 failed이고 매출은 그대로 보인다. [다시 읽기](onReread)로 둘 다 다시 읽는다', async () => {
    vi.mocked(loadGoal).mockRejectedValueOnce(new Error('가짜 실패'))
    const { result } = renderHook(() => useStatsGoals(TODAY))
    await waitFor(() => expect(result.current.goal).toBe('failed'))
    expect(Array.isArray(result.current.revenue)).toBe(true)
    act(() => result.current.onReread())
    await waitFor(() => expect(result.current.goal).toEqual(GOAL))
    expect(loadGoal).toHaveBeenCalledTimes(2)
    expect(loadDays).toHaveBeenCalledTimes(2)
  })

  it('AC-6102.4: 하루 매출을 읽지 못하면 revenue만 failed다', async () => {
    loadDays.mockRejectedValueOnce(new Error('가짜 실패'))
    const { result } = renderHook(() => useStatsGoals(TODAY))
    await waitFor(() => expect(result.current.revenue).toBe('failed'))
    expect(result.current.goal).toEqual(GOAL)
  })

  it('AC-6102.2: 서버 클라이언트를 만들다 던져도 둘 다 failed다', async () => {
    vi.mocked(supabaseBrowser).mockImplementation(() => {
      throw new Error('설정 없음')
    })
    const { result } = renderHook(() => useStatsGoals(TODAY))
    await waitFor(() => expect(result.current.goal).toBe('failed'))
    await waitFor(() => expect(result.current.revenue).toBe('failed'))
  })

  it('AC-6102.4: 오늘이 다음 달로 바뀌면 새 달 목표와 새 기간 매출을 다시 읽고, 늦게 온 앞 답은 버린다', async () => {
    let finishOld!: (goal: Goal) => void
    vi.mocked(loadGoal).mockImplementationOnce(() => new Promise((resolve) => (finishOld = resolve)))
    const next: Goal = { visits: 3000, newPatients: null, revenue: null }
    vi.mocked(loadGoal).mockResolvedValueOnce(next)
    const { result, rerender } = renderHook(({ today }) => useStatsGoals(today), { initialProps: { today: '2026-11-30' } })
    rerender({ today: '2026-12-01' })
    await waitFor(() => expect(result.current.goal).toEqual(next))
    expect(loadGoal).toHaveBeenLastCalledWith(CLIENT, '2026-12')
    expect(loadDays).toHaveBeenLastCalledWith({ from: '2026-10-06', to: '2026-11-30' })
    await act(async () => finishOld(GOAL))
    expect(result.current.goal).toEqual(next)
  })
})

describe('AC-6102.2·AC-6102.5 useStatsGoals: 저장(onSave)', () => {
  it('AC-6102.2: onSave(goal)은 saveGoal(client, 이번 달, goal)을 부르고 끝나면 목표가 그 값이 된다(다시 읽지 않는다)', async () => {
    const { result } = renderHook(() => useStatsGoals(TODAY))
    await waitFor(() => expect(result.current.goal).toEqual(GOAL))
    const changed: Goal = { visits: 3300, newPatients: null, revenue: 130_000_000 }
    await act(() => result.current.onSave(changed))
    expect(saveGoal).toHaveBeenCalledWith(CLIENT, '2026-11', changed)
    expect(result.current.goal).toEqual(changed)
    expect(loadGoal).toHaveBeenCalledTimes(1)
  })

  it('AC-6102.2: 셋 다 비워 저장하면 목표 없음(세 값 null)이 된다', async () => {
    const { result } = renderHook(() => useStatsGoals(TODAY))
    await waitFor(() => expect(result.current.goal).toEqual(GOAL))
    await act(() => result.current.onSave(EMPTY))
    expect(result.current.goal).toEqual(EMPTY)
  })

  it('AC-6102.5: 저장이 실패하면 onSave가 거절되고 목표는 그대로다', async () => {
    vi.mocked(saveGoal).mockRejectedValueOnce(new Error('가짜 실패'))
    const { result } = renderHook(() => useStatsGoals(TODAY))
    await waitFor(() => expect(result.current.goal).toEqual(GOAL))
    let failed = false
    await act(async () => {
      await result.current.onSave({ visits: 1, newPatients: null, revenue: null }).catch(() => (failed = true))
    })
    expect(failed).toBe(true)
    expect(result.current.goal).toEqual(GOAL)
  })
})
