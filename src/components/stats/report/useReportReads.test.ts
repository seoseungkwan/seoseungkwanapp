// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGoal } from '@/lib/storage/goals'
import { readCoverage } from '@/lib/storage/stats'
import { readUisPeriods } from '@/lib/storage/uisarang'
import type { DateRange } from '@/types/dates'
import type { UisAgePayload, UisPeriodKind, UisPeriodRow, UisRxPayload } from '@/types/uisarang'
import { useReportReads } from './useReportReads'

// 월간 보고서 서버 읽기의 의사랑 갈래(uisarang-upload AC-8817.5·AC-8817.6, design.md §10-6).
// uis 참이면 고른 달 범위(1일 ~ 그 달 끝, 이번 달이면 어제)의 처방 줄·나이대 줄·덮은 날을 매출·목표와 같은 열쇠로 함께 읽는다.
// 저장 읽기는 모두 가짜이고 숫자·코드는 이 파일에서 지어낸 값이다

vi.mock('@/lib/storage/uisarang', () => ({ readUisPeriods: vi.fn() }))
vi.mock('@/lib/storage/stats', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/storage/stats')>()), readCoverage: vi.fn() }))
vi.mock('@/lib/storage/goals', () => ({ loadGoal: vi.fn() }))
const revenueStore = vi.hoisted(() => ({ loadDays: vi.fn() }))
vi.mock('@/lib/storage/revenue', () => ({ createRevenueStore: vi.fn(() => revenueStore) }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))

const TODAY = '2026-11-13'

const rxRow = (from: string, to: string, qty: number): UisPeriodRow<UisRxPayload> => ({
  kind: 'rx',
  from,
  to,
  payload: { v: 1, rows: [{ code: 'MM01', name: '가짜 처방', qty, amount: qty * 1000 }], total: null },
  updatedAt: '2026-11-01T00:00:00Z',
})
const ageRow = (ymd: string): UisPeriodRow<UisAgePayload> => ({
  kind: 'age',
  from: ymd,
  to: ymd,
  payload: { v: 1, patients: 3, newPatients: 1, bands: [0, 0, 0, 0, 3, 0, 0, 0, 0, 0], newBands: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
  updatedAt: '2026-11-01T00:00:00Z',
})

// 범위마다 다른 가짜 줄: 처방 줄 = 그 범위 한 줄(처방량 = 끝 날짜의 날), 나이대 줄 = 범위 첫날, 덮은 날 = 범위 그대로
const rxOf = (range: DateRange) => [rxRow(range.from, range.to, Number(range.to.slice(8, 10)))]
const ageOf = (range: DateRange) => [ageRow(range.from)]
function answerAll() {
  vi.mocked(readUisPeriods).mockImplementation((async (kind: UisPeriodKind, range: DateRange) => (kind === 'rx' ? rxOf(range) : ageOf(range))) as typeof readUisPeriods)
  vi.mocked(readCoverage).mockImplementation(async (range) => [{ from: range.from, to: range.to }])
}
const uisCalls = () => vi.mocked(readUisPeriods).mock.calls.map(([kind, range]) => [kind, range.from, range.to])
const coverCalls = () => vi.mocked(readCoverage).mock.calls.map(([range]) => [range.from, range.to])
const settle = () => act(async () => void (await new Promise((done) => setTimeout(done))))

type Props = { month: string | null; revision?: number; uis?: boolean }
const hook = (first: Props) => renderHook((props: Props) => useReportReads(props.month, TODAY, { revision: props.revision ?? 0, uis: props.uis }), { initialProps: first })

beforeEach(() => {
  vi.mocked(readUisPeriods).mockReset()
  vi.mocked(readCoverage).mockReset()
  answerAll()
  vi.mocked(loadGoal).mockReset()
  vi.mocked(loadGoal).mockResolvedValue({ visits: 100, newPatients: null, revenue: null })
  revenueStore.loadDays.mockReset()
  revenueStore.loadDays.mockResolvedValue([])
})

afterEach(cleanup)

describe('AC-8817.5: 의사랑 의원 — 고른 달 처방·나이대·덮은 날 읽기', () => {
  it('AC-8817.5: uis 참이면 고른 달 1일~말일의 처방 줄·나이대 줄·덮은 날을 매출·목표와 함께 읽어 uis로 준다', async () => {
    const { result } = hook({ month: '2026-10', uis: true })
    expect(result.current.uis).toBe('reading')
    await waitFor(() => expect(typeof result.current.uis).toBe('object'))
    expect(uisCalls()).toEqual([
      ['rx', '2026-10-01', '2026-10-31'],
      ['age', '2026-10-01', '2026-10-31'],
    ])
    expect(coverCalls()).toEqual([['2026-10-01', '2026-10-31']])
    expect(result.current.uis).toEqual({ rx: rxOf({ from: '2026-10-01', to: '2026-10-31' }), age: ageOf({ from: '2026-10-01', to: '2026-10-31' }), covered: [{ from: '2026-10-01', to: '2026-10-31' }] })
    expect(revenueStore.loadDays).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-10-31' })
    expect(loadGoal).toHaveBeenCalledWith(expect.anything(), '2026-10')
  })

  it('AC-8817.5: 이번 달이면 1일~어제까지만 읽는다(오늘은 진료 중이라 세지 않는다)', async () => {
    const { result } = hook({ month: '2026-11', uis: true })
    await waitFor(() => expect(typeof result.current.uis).toBe('object'))
    expect(uisCalls()).toEqual([
      ['rx', '2026-11-01', '2026-11-12'],
      ['age', '2026-11-01', '2026-11-12'],
    ])
    expect(coverCalls()).toEqual([['2026-11-01', '2026-11-12']])
  })

  it('AC-8817.5: 고른 달이 바뀌면 새 달 범위로 다시 읽고, 늦게 온 앞 달 답은 버린다(새 달은 읽는 중)', async () => {
    let finishOld!: (rows: UisPeriodRow<UisRxPayload>[]) => void
    vi.mocked(readUisPeriods).mockImplementationOnce((() => new Promise((resolve) => (finishOld = resolve))) as unknown as typeof readUisPeriods)
    const { result, rerender } = hook({ month: '2026-10', uis: true })
    rerender({ month: '2026-09', uis: true })
    expect(result.current.uis).toBe('reading')
    await waitFor(() => expect(typeof result.current.uis).toBe('object'))
    const september = result.current.uis
    await act(async () => finishOld([rxRow('2026-10-01', '2026-10-31', 999)]))
    await settle()
    expect(result.current.uis).toBe(september)
    expect(uisCalls()).toContainEqual(['rx', '2026-09-01', '2026-09-30'])
    expect(coverCalls()).toEqual([
      ['2026-10-01', '2026-10-31'],
      ['2026-09-01', '2026-09-30'],
    ])
  })

  it('AC-8817.5: revision이 오르면 세 읽기를 다시 부르고, 다시 읽는 동안 같은 달 앞 값을 그대로 둔다', async () => {
    const { result, rerender } = hook({ month: '2026-10', uis: true })
    await waitFor(() => expect(typeof result.current.uis).toBe('object'))
    const before = result.current.uis
    let finish!: (rows: UisPeriodRow<UisRxPayload>[]) => void
    vi.mocked(readUisPeriods).mockImplementationOnce((() => new Promise((resolve) => (finish = resolve))) as unknown as typeof readUisPeriods)
    rerender({ month: '2026-10', revision: 1, uis: true })
    expect(result.current.uis).toBe(before)
    await settle()
    expect(vi.mocked(readUisPeriods)).toHaveBeenCalledTimes(4)
    expect(vi.mocked(readCoverage)).toHaveBeenCalledTimes(2)
    expect(result.current.uis).toBe(before)
    const fresh = [rxRow('2026-10-01', '2026-10-31', 7)]
    await act(async () => finish(fresh))
    await waitFor(() => expect(result.current.uis).not.toBe(before))
    expect(result.current.uis).toMatchObject({ rx: fresh })
  })

  it('AC-8817.5: 하나라도 읽지 못하면 uis는 failed(매출·목표는 그대로)이고, [다시 읽기](retry)로 세 읽기를 다시 부른다', async () => {
    vi.mocked(readCoverage).mockRejectedValueOnce(new Error('가짜 실패'))
    const { result } = hook({ month: '2026-10', uis: true })
    await waitFor(() => expect(result.current.uis).toBe('failed'))
    await waitFor(() => expect(typeof result.current.sales).toBe('object'))
    expect(typeof result.current.goal).toBe('object')
    act(() => result.current.retry())
    expect(result.current.uis).toBe('reading')
    await waitFor(() => expect(typeof result.current.uis).toBe('object'))
    expect(vi.mocked(readCoverage)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(readUisPeriods)).toHaveBeenCalledTimes(4)
  })

  it('AC-8817.5: 처방 줄 읽기가 실패해도 failed다', async () => {
    vi.mocked(readUisPeriods).mockRejectedValueOnce(new Error('가짜 실패'))
    const { result } = hook({ month: '2026-10', uis: true })
    await waitFor(() => expect(result.current.uis).toBe('failed'))
  })
})

describe('AC-8817.6: 비트 의원 — 의사랑 읽기가 없다', () => {
  it('AC-8817.6: uis를 주지 않거나 거짓이면 처방·나이대·덮은 날을 읽지 않고 uis는 null, 매출·목표 읽기는 지금 그대로다', async () => {
    for (const uis of [undefined, false]) {
      const { result, unmount } = hook({ month: '2026-10', uis })
      await waitFor(() => expect(typeof result.current.sales).toBe('object'))
      expect(result.current.uis).toBeNull()
      unmount()
    }
    expect(readUisPeriods).not.toHaveBeenCalled()
    expect(readCoverage).not.toHaveBeenCalled()
    expect(revenueStore.loadDays).toHaveBeenCalledTimes(2)
  })

  it('AC-8817.6: 고른 달이 없으면(month null) 아무것도 읽지 않는다', async () => {
    hook({ month: null, uis: true })
    await settle()
    expect(readUisPeriods).not.toHaveBeenCalled()
    expect(readCoverage).not.toHaveBeenCalled()
    expect(revenueStore.loadDays).not.toHaveBeenCalled()
  })
})
