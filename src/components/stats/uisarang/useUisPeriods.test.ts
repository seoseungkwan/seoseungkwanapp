// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readUisPeriods } from '@/lib/storage/uisarang'
import type { DateRange } from '@/types/dates'
import type { UisAgePayload, UisPeriodRow, UisRxPayload } from '@/types/uisarang'
import { useUisPeriods } from './useUisPeriods'

// 통계 탭 의사랑 처방·나이대 읽기 훅(specs/uisarang-upload design.md §10-3 useUisPeriods). 저장 읽기 함수(readUisPeriods)는 가짜다.
// 처방 코드·숫자는 모두 이 파일에서 지어낸 값이다

vi.mock('@/lib/storage/uisarang', () => ({ readUisPeriods: vi.fn() }))

const WEEK: DateRange = { from: '2026-11-20', to: '2026-11-26' }
const MONTH: DateRange = { from: '2026-10-28', to: '2026-11-26' }
const RX: UisPeriodRow<UisRxPayload> = {
  kind: 'rx',
  from: '2026-11-20',
  to: '2026-11-20',
  payload: { v: 1, rows: [{ code: 'MT30', name: '가짜 도수 30분', qty: 3, amount: 240000 }], total: 240000 },
  updatedAt: '2026-11-26T10:05:00Z',
}
const AGE: UisPeriodRow<UisAgePayload> = {
  kind: 'age',
  from: '2026-11-20',
  to: '2026-11-20',
  payload: { v: 1, patients: 2, newPatients: 1, bands: [0, 0, 0, 1, 1, 0, 0, 0, 0, 0], newBands: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0] },
  updatedAt: '2026-11-26T10:05:00Z',
}

const read = vi.mocked(readUisPeriods)
const calls = () => read.mock.calls.map(([kind, range]) => [kind, range.from, range.to])

beforeEach(() => {
  read.mockReset()
  read.mockImplementation((async (kind: 'rx' | 'age') => (kind === 'rx' ? [RX] : [AGE])) as typeof readUisPeriods)
})

afterEach(() => cleanup())

describe('useUisPeriods (AC-8812.3·AC-8812.5)', () => {
  it('AC-8812.3·AC-8812.5: 지금 기간으로 처방·나이대 줄을 함께 읽고, 읽는 동안은 reading · 다 읽으면 두 줄 묶음이다', async () => {
    const { result } = renderHook(() => useUisPeriods(WEEK, 0))
    expect(result.current).toEqual({ state: 'reading' })
    await waitFor(() => expect(result.current).toEqual({ state: 'ready', rx: [RX], age: [AGE] }))
    expect(calls()).toEqual([
      ['rx', '2026-11-20', '2026-11-26'],
      ['age', '2026-11-20', '2026-11-26'],
    ])
  })

  it('AC-8812.5·AC-8810.9: revision(data.revision)이 오르면 두 읽기를 다시 부른다', async () => {
    const { result, rerender } = renderHook(({ revision }) => useUisPeriods(WEEK, revision), { initialProps: { revision: 0 } })
    await waitFor(() => expect(result.current?.state).toBe('ready'))
    expect(read).toHaveBeenCalledTimes(2)
    rerender({ revision: 1 })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(4))
    expect(calls().slice(2)).toEqual([
      ['rx', '2026-11-20', '2026-11-26'],
      ['age', '2026-11-20', '2026-11-26'],
    ])
    await waitFor(() => expect(result.current?.state).toBe('ready'))
  })

  it('AC-8812.5: 같은 기간·같은 revision으로 다시 그려도 다시 읽지 않는다', async () => {
    const { result, rerender } = renderHook(({ range }) => useUisPeriods(range, 0), { initialProps: { range: WEEK } })
    await waitFor(() => expect(result.current?.state).toBe('ready'))
    rerender({ range: { ...WEEK } })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('AC-8812.9: 기간이 null(의사랑 의원이 아님)이면 읽지 않고 null이다', () => {
    const { result } = renderHook(() => useUisPeriods(null, 0))
    expect(result.current).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })

  it('AC-8812.3: 하나라도 읽지 못하면 failed다(그 자리 E-UIS-READ-FAILED 카드)', async () => {
    read.mockImplementation((async (kind: 'rx' | 'age') => {
      if (kind === 'age') throw new Error('E-UIS-READ-FAILED')
      return [RX]
    }) as typeof readUisPeriods)
    const { result } = renderHook(() => useUisPeriods(WEEK, 0))
    await waitFor(() => expect(result.current).toEqual({ state: 'failed' }))
  })

  it('AC-8812.5: 기간을 바꾸면 앞 기간의 늦은 답은 버리고 새 기간 답을 쓴다', async () => {
    let finishOld: (rows: UisPeriodRow<UisRxPayload>[]) => void = () => undefined
    read.mockImplementation(((kind: 'rx' | 'age', range: DateRange) => {
      if (range.from === WEEK.from && kind === 'rx') return new Promise<UisPeriodRow<UisRxPayload>[]>((resolve) => (finishOld = resolve))
      return Promise.resolve(kind === 'rx' ? [] : [AGE])
    }) as unknown as typeof readUisPeriods)
    const { result, rerender } = renderHook(({ range }) => useUisPeriods(range, 0), { initialProps: { range: WEEK } })
    rerender({ range: MONTH })
    await waitFor(() => expect(result.current).toEqual({ state: 'ready', rx: [], age: [AGE] }))
    await act(async () => finishOld([RX]))
    expect(result.current).toEqual({ state: 'ready', rx: [], age: [AGE] })
  })
})
