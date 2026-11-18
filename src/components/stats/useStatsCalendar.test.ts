// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listAllDay, listCalendarCounts, listCalendarSlots, loadCalendarSettings } from '@/lib/storage/calendar'
import { DEFAULT_CAL_SETTINGS, type CalAllDay, type CalCountRow, type CalSettings, type CalSlotRow } from '@/types/calendar'
import { useStatsCalendar } from './useStatsCalendar'

// 통계 '예약' 칸 읽기 훅 (spec clinic-calendar REQ-5907 AC-5907.3, design.md '화면' 통계 칸, tasks.md TASK-9).
// 저장 코드는 가짜다. 예약 줄·시행자 이름은 모두 지어낸 값이다(이름·차트번호·메모 칸은 원래 없다)

vi.mock('@/lib/storage/calendar', () => ({
  listCalendarCounts: vi.fn(),
  listCalendarSlots: vi.fn(),
  listAllDay: vi.fn(),
  loadCalendarSettings: vi.fn(),
}))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))

const TODAY = '2026-11-17'
const row = (day: string, over: Partial<CalCountRow> = {}): CalCountRow => ({
  day,
  staffId: 'ga',
  staffName: '가짜○○',
  kindId: 'dosu',
  kindName: '도수',
  status: 'auto',
  auto: null,
  origDay: null,
  ...over,
})
const ROWS_A = [row('2026-10-02'), row('2026-11-03', { status: 'cancel' })]
const ROWS_B = [row('2026-09-10')]
const SETTINGS: CalSettings = { ...DEFAULT_CAL_SETTINGS, staff: [{ id: 'ga', name: '가짜○○', mark: '가', color: 'blue' }] }
// 다시 예약·빈자리 줄(stats-insights AC-6104.1·AC-6105.1, 이름·메모 칸 없음)과 휴무
const SLOTS: CalSlotRow[] = [
  { day: '2026-10-02', staffId: 'ga', staffName: '가짜○○', kindId: 'dosu', kindName: '도수', status: 'came', auto: null, start: 600, len: 30, chart: '90001' },
]
const OFFS: CalAllDay[] = [{ id: 'off-1', day: '2026-11-02', type: 'off', memo: null, staffId: 'ga', staffName: '가짜○○' }]

// 다음 예약 줄 읽기의 답을 잡아 둔다(열 때까지 끝나지 않음)
type Gate = { resolve(rows: CalCountRow[]): void; reject(): void }
function hold(): Gate {
  let resolve!: (rows: CalCountRow[]) => void
  let reject!: () => void
  const wait = new Promise<CalCountRow[]>((yes, no) => {
    resolve = yes
    reject = () => no(new Error('가짜 실패'))
  })
  vi.mocked(listCalendarCounts).mockImplementationOnce(() => wait)
  return { resolve, reject }
}

beforeEach(() => {
  vi.mocked(listCalendarCounts).mockReset()
  vi.mocked(listCalendarSlots).mockReset()
  vi.mocked(listAllDay).mockReset()
  vi.mocked(loadCalendarSettings).mockReset()
  vi.mocked(listCalendarCounts).mockResolvedValue(ROWS_A)
  vi.mocked(listCalendarSlots).mockResolvedValue(SLOTS)
  vi.mocked(listAllDay).mockResolvedValue(OFFS)
  vi.mocked(loadCalendarSettings).mockResolvedValue(SETTINGS)
})

afterEach(cleanup)

describe('AC-5907.3: 통계 예약 칸 읽기 useStatsCalendar', () => {
  it('AC-5907.3: 이번 달 1일 −11달 ~ 오늘을 listCalendarCounts로 읽고, 읽는 동안은 reading, 다 읽으면 줄·오늘·설정을 준다', async () => {
    const { result } = renderHook(() => useStatsCalendar(TODAY))
    expect(result.current.rows).toBe('reading')
    expect(result.current.today).toBe(TODAY)
    await waitFor(() => expect(result.current.rows).toEqual(ROWS_A))
    expect(listCalendarCounts).toHaveBeenCalledTimes(1)
    expect(listCalendarCounts).toHaveBeenCalledWith(expect.anything(), '2025-12-01', TODAY)
    expect(result.current.settings).toEqual(SETTINGS)
    expect(result.current.today).toBe(TODAY)
  })

  it('AC-5907.3: 해를 넘는 기간도 이번 달을 넣은 12달의 첫날부터다(1월 31일 → 지난해 2월 1일, 12월 1일 → 1월 1일)', async () => {
    const { rerender } = renderHook(({ today }) => useStatsCalendar(today), { initialProps: { today: '2027-01-31' } })
    await waitFor(() => expect(listCalendarCounts).toHaveBeenLastCalledWith(expect.anything(), '2026-02-01', '2027-01-31'))
    rerender({ today: '2026-12-01' })
    await waitFor(() => expect(listCalendarCounts).toHaveBeenLastCalledWith(expect.anything(), '2026-01-01', '2026-12-01'))
  })

  it('AC-5907.3: 예약 줄을 읽지 못하면 failed이고, [다시 읽기](onReread)를 누르면 다시 읽는다', async () => {
    vi.mocked(listCalendarCounts).mockRejectedValueOnce(new Error('가짜 실패'))
    const { result } = renderHook(() => useStatsCalendar(TODAY))
    await waitFor(() => expect(result.current.rows).toBe('failed'))
    vi.mocked(listCalendarCounts).mockResolvedValueOnce(ROWS_B)
    act(() => result.current.onReread())
    expect(result.current.rows).toBe('reading')
    await waitFor(() => expect(result.current.rows).toEqual(ROWS_B))
    expect(listCalendarCounts).toHaveBeenCalledTimes(2)
    expect(loadCalendarSettings).toHaveBeenCalledTimes(2)
  })

  it('AC-5907.3: 설정을 읽지 못해도 예약 줄은 그대로 그리고 설정만 없다(나눠 보기는 저장된 이름 차례)', async () => {
    vi.mocked(loadCalendarSettings).mockRejectedValueOnce(new Error('가짜 실패'))
    const { result } = renderHook(() => useStatsCalendar(TODAY))
    await waitFor(() => expect(result.current.rows).toEqual(ROWS_A))
    expect(result.current.settings).toBeUndefined()
    expect('settings' in result.current).toBe(false)
  })

  it('AC-5907.3: 서버 클라이언트를 만들다 던져도 failed다', async () => {
    const { supabaseBrowser } = await import('@/lib/supabase/browser')
    vi.mocked(supabaseBrowser).mockImplementationOnce(() => {
      throw new Error('가짜 설정 없음')
    })
    const { result } = renderHook(() => useStatsCalendar(TODAY))
    await waitFor(() => expect(result.current.rows).toBe('failed'))
  })

  it('AC-5907.3: [다시 읽기] 뒤 늦게 온 앞 답은 버린다(앞 답이 먼저 와도, 나중에 와도)', async () => {
    const first = hold()
    const second = hold()
    const { result } = renderHook(() => useStatsCalendar(TODAY))
    await waitFor(() => expect(listCalendarCounts).toHaveBeenCalledTimes(1))
    act(() => result.current.onReread())
    await waitFor(() => expect(listCalendarCounts).toHaveBeenCalledTimes(2))

    await act(async () => first.resolve(ROWS_A))
    expect(result.current.rows).toBe('reading')
    await act(async () => second.resolve(ROWS_B))
    await waitFor(() => expect(result.current.rows).toEqual(ROWS_B))

    // 셋째 읽기가 실패로 끝난 뒤 앞 답이 와도 실패 그대로다
    const third = hold()
    const fourth = hold()
    act(() => result.current.onReread())
    await waitFor(() => expect(listCalendarCounts).toHaveBeenCalledTimes(3))
    act(() => result.current.onReread())
    await waitFor(() => expect(listCalendarCounts).toHaveBeenCalledTimes(4))
    await act(async () => fourth.reject())
    await waitFor(() => expect(result.current.rows).toBe('failed'))
    await act(async () => third.resolve(ROWS_A))
    expect(result.current.rows).toBe('failed')
  })

  it('AC-5907.3: 오늘이 바뀌면 새 기간을 읽고 앞 기간의 늦은 답은 버린다', async () => {
    const old = hold()
    const { result, rerender } = renderHook(({ today }) => useStatsCalendar(today), { initialProps: { today: TODAY } })
    await waitFor(() => expect(listCalendarCounts).toHaveBeenCalledTimes(1))
    vi.mocked(listCalendarCounts).mockResolvedValueOnce(ROWS_B)
    rerender({ today: '2026-12-01' })
    await waitFor(() => expect(result.current.rows).toEqual(ROWS_B))
    expect(result.current.today).toBe('2026-12-01')
    await act(async () => old.resolve(ROWS_A))
    expect(result.current.rows).toEqual(ROWS_B)
  })

  it('AC-5907.3: 읽은 줄은 React 상태에만 둔다 — 브라우저 저장소·주소·네트워크 직접 호출이 없다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/stats/useStatsCalendar.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
    for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'history.', 'location.', 'fetch(', 'console.', 'listAppts']) {
      expect(text, word).not.toContain(word)
    }
  })
})

describe('AC-6104.1·AC-6105.1: 다시 예약·빈자리 줄 읽기', () => {
  it('AC-6104.1·AC-6105.1: 같은 12달을 listCalendarSlots로, 휴무를 오늘 앞 56일(어제까지) listAllDay로 읽어 slots로 준다. 읽는 동안은 reading', async () => {
    const { result } = renderHook(() => useStatsCalendar(TODAY))
    expect(result.current.slots).toBe('reading')
    await waitFor(() => expect(result.current.slots).toEqual({ rows: SLOTS, offs: OFFS }))
    expect(listCalendarSlots).toHaveBeenCalledTimes(1)
    expect(listCalendarSlots).toHaveBeenCalledWith(expect.anything(), '2025-12-01', TODAY)
    expect(listAllDay).toHaveBeenCalledTimes(1)
    expect(listAllDay).toHaveBeenCalledWith(expect.anything(), '2026-09-22', '2026-11-16')
    expect(result.current.rows).toEqual(ROWS_A)
  })

  it.each<[string, () => void]>([
    ['예약 줄', () => vi.mocked(listCalendarSlots).mockRejectedValueOnce(new Error('가짜 실패'))],
    ['휴무', () => vi.mocked(listAllDay).mockRejectedValueOnce(new Error('가짜 실패'))],
    [
      '없는 읽기(던짐)',
      () =>
        vi.mocked(listCalendarSlots).mockImplementationOnce(() => {
          throw new Error('가짜 던짐')
        }),
    ],
  ])('AC-6104.1·AC-6105.1: %s를 읽지 못하면 slots만 failed이고 예약 수 줄·설정은 그대로다', async (_name, fail) => {
    fail()
    const { result } = renderHook(() => useStatsCalendar(TODAY))
    await waitFor(() => expect(result.current.slots).toBe('failed'))
    expect(result.current.rows).toEqual(ROWS_A)
    expect(result.current.settings).toEqual(SETTINGS)
  })

  it('AC-6104.1·AC-6105.1: [다시 읽기]는 slots도 다시 읽고, 예약 수 줄을 읽지 못하면 slots도 failed다', async () => {
    vi.mocked(listCalendarCounts).mockRejectedValueOnce(new Error('가짜 실패'))
    const { result } = renderHook(() => useStatsCalendar(TODAY))
    await waitFor(() => expect(result.current.rows).toBe('failed'))
    expect(result.current.slots).toBe('failed')
    act(() => result.current.onReread())
    expect(result.current.slots).toBe('reading')
    await waitFor(() => expect(result.current.slots).toEqual({ rows: SLOTS, offs: OFFS }))
    expect(listCalendarSlots).toHaveBeenCalledTimes(2)
    expect(listAllDay).toHaveBeenCalledTimes(2)
  })

  it('AC-6105.1: 오늘이 바뀌면 휴무 기간도 새 오늘 앞 56일이다', async () => {
    const { rerender } = renderHook(({ today }) => useStatsCalendar(today), { initialProps: { today: TODAY } })
    await waitFor(() => expect(listAllDay).toHaveBeenCalledTimes(1))
    rerender({ today: '2027-01-01' })
    await waitFor(() => expect(listAllDay).toHaveBeenLastCalledWith(expect.anything(), '2026-11-06', '2026-12-31'))
    expect(listCalendarSlots).toHaveBeenLastCalledWith(expect.anything(), '2026-02-01', '2027-01-01')
  })
})
