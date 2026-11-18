// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCoverage, readDays, readMonths, saveStats } from '@/lib/storage/stats'
import type { DayPayload } from '@/types/payload'
import { useWideDays, wideSpan } from './useWideDays'

// 넓은 하루 읽기 (stats-insights design.md '넓은 하루 읽기', REQ-6101 AC-6101.5 · REQ-6107 AC-6107.3).
// 기간 고르기와 상관없이 오늘 앞 12달 stats_days를 한 번 읽는다. 저장은 가짜이고 일 줄은 지어낸 값이다

vi.mock('@/lib/storage/stats', () => ({
  readDays: vi.fn(),
  readMonths: vi.fn(),
  readCoverage: vi.fn(),
  saveStats: vi.fn(),
}))

const TODAY = '2026-11-18'
const NEXT_DAY = '2026-11-19'

function day(ymd: string, patients = 10): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients, newPatients: 1, returning: patients - 1, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 1, within7: null, within14: null },
  }
}

type Read = Awaited<ReturnType<typeof readDays>>
const read = (rows: DayPayload[]): Read => ({ rows, dropped: 0, latest: null, fromFile: false })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const ROWS = [day('2026-11-16'), day('2026-11-17')]

type Props = { today: string; revision: number }
const draw = (props: Partial<Props> = {}, wrapper?: typeof StrictMode) =>
  renderHook((p: Props) => useWideDays(p.today, p.revision), { initialProps: { today: TODAY, revision: 0, ...props }, wrapper })

const settle = () => act(async () => void (await new Promise((done) => setTimeout(done))))
const reads = () => vi.mocked(readDays).mock.calls.map(([range]) => range)

beforeEach(() => {
  vi.mocked(readDays).mockReset().mockResolvedValue(read(ROWS))
  vi.mocked(readCoverage).mockReset()
  vi.mocked(readMonths).mockReset()
  vi.mocked(saveStats).mockReset()
})

afterEach(cleanup)

describe('AC-6101.5·AC-6107.3 오늘 앞 12달을 한 번 읽는다', () => {
  it('AC-6101.5·AC-6107.3: 읽는 범위는 오늘 12달 전 같은 날 ~ 어제다(기간 고르기와 상관없음)', () => {
    expect(wideSpan(TODAY)).toEqual({ from: '2025-11-18', to: '2026-11-17' })
    expect(wideSpan('2026-03-31')).toEqual({ from: '2025-03-31', to: '2026-03-30' })
    expect(wideSpan('2028-02-29')).toEqual({ from: '2027-02-28', to: '2028-02-28' })
  })

  it('AC-6101.5·AC-6107.3: readDays를 그 범위로 한 번 부르고, 답이 오기 전에는 reading(빈 줄), 오면 ready와 받은 줄이다', async () => {
    const days = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(days.promise)
    const view = draw()
    expect(view.result.current.state).toBe('reading')
    expect(view.result.current.days).toEqual([])
    expect(reads()).toEqual([{ from: '2025-11-18', to: '2026-11-17' }])
    await act(async () => days.resolve(read(ROWS)))
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.days).toEqual(ROWS)
    expect(readCoverage).not.toHaveBeenCalled()
  })

  it('AC-6101.5·AC-6107.3: 다시 그려도 열쇠(오늘·revision)가 같으면 다시 읽지 않는다 — StrictMode에서도 한 번', async () => {
    const view = draw({}, StrictMode)
    await waitFor(() => expect(view.result.current.state).toBe('ready'))
    view.rerender({ today: TODAY, revision: 0 })
    await settle()
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-6101.5·AC-6107.3: 오늘이 바뀌거나 revision이 늘면 다시 읽는다', async () => {
    const view = draw()
    await waitFor(() => expect(view.result.current.state).toBe('ready'))
    view.rerender({ today: NEXT_DAY, revision: 0 })
    await waitFor(() => expect(reads()).toHaveLength(2))
    view.rerender({ today: NEXT_DAY, revision: 1 })
    await waitFor(() => expect(reads()).toHaveLength(3))
    expect(reads()).toEqual([
      { from: '2025-11-18', to: '2026-11-17' },
      { from: '2025-11-19', to: '2026-11-18' },
      { from: '2025-11-19', to: '2026-11-18' },
    ])
  })

  it('AC-6101.5·AC-6107.3: 늦게 온 앞 답은 버리고 마지막 읽기의 답만 쓴다', async () => {
    const first = deferred<Read>()
    const second = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const view = draw()
    view.rerender({ today: NEXT_DAY, revision: 0 })
    await act(async () => second.resolve(read([day('2026-11-18', 30)])))
    await act(async () => first.resolve(read([day('2026-11-17', 99)])))
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.days.map((row) => row.totals.patients)).toEqual([30])
  })

  it('AC-6101.5·AC-6107.3: 읽기에 실패하면 failed(빈 줄)이고 retry()가 다시 읽는다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('E-STATS-READ-FAILED'))
    const view = draw()
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
    expect(view.result.current.days).toEqual([])
    act(() => view.result.current.retry())
    expect(view.result.current.state).toBe('reading')
    await waitFor(() => expect(view.result.current.state).toBe('ready'))
    expect(view.result.current.days).toEqual(ROWS)
    expect(readDays).toHaveBeenCalledTimes(2)
  })

  it('AC-6101.5·AC-6107.3: 실패하지 않았으면 retry()는 다시 읽지 않는다', async () => {
    const view = draw()
    await waitFor(() => expect(view.result.current.state).toBe('ready'))
    act(() => view.result.current.retry())
    await settle()
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-6101.6: 저장·[다시 읽기]로 revision이 늘어 다시 읽는 동안 앞서 읽은 숫자(ready)를 그대로 주고, 다 읽으면 새 숫자로 바꾼다', async () => {
    const view = draw()
    await waitFor(() => expect(view.result.current.state).toBe('ready'))
    const again = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(again.promise)
    view.rerender({ today: TODAY, revision: 1 })
    // 다시 그린 바로 그때부터(읽기가 끝나기 전) 앞 숫자다 — 칸이 사라지거나 비지 않는다
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.days).toEqual(ROWS)
    await settle()
    expect(reads()).toHaveLength(2)
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.days).toEqual(ROWS)
    const fresh = [day('2026-11-16', 40), day('2026-11-17', 50)]
    await act(async () => again.resolve(read(fresh)))
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.days).toEqual(fresh)
  })

  it('AC-6101.6: 다시 읽는 동안 revision이 또 늘면 늦게 온 앞 답은 버리고, 그동안에도 처음 읽은 숫자를 준다', async () => {
    const view = draw()
    await waitFor(() => expect(view.result.current.state).toBe('ready'))
    const second = deferred<Read>()
    const third = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise)
    view.rerender({ today: TODAY, revision: 1 })
    view.rerender({ today: TODAY, revision: 2 })
    await settle()
    expect(reads()).toHaveLength(3)
    expect(view.result.current.days).toEqual(ROWS)
    await act(async () => third.resolve(read([day('2026-11-17', 70)])))
    await act(async () => second.resolve(read([day('2026-11-17', 60)])))
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.days.map((row) => row.totals.patients)).toEqual([70])
  })

  it('AC-6101.6: 다시 읽기가 실패하면 failed(빈 줄)이고 retry()로 다시 읽는다', async () => {
    const view = draw()
    await waitFor(() => expect(view.result.current.state).toBe('ready'))
    vi.mocked(readDays).mockRejectedValueOnce(new Error('E-STATS-READ-FAILED'))
    view.rerender({ today: TODAY, revision: 1 })
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
    expect(view.result.current.days).toEqual([])
    act(() => view.result.current.retry())
    await waitFor(() => expect(view.result.current.state).toBe('ready'))
    expect(readDays).toHaveBeenCalledTimes(3)
  })

  it('AC-6101.5·AC-6107.3: useWideDays.ts는 브라우저 저장소·fetch·lib/bridge를 쓰지 않는다(받은 줄은 React 상태에만)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/stats/useWideDays.ts'), 'utf8')
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(|@\/lib\/bridge/)
  })
})
