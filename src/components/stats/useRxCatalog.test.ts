// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCoverage, readDays, readMonths, saveStats } from '@/lib/storage/stats'
import type { DayPayload } from '@/types/payload'
import { rxCatalog } from './rxPickView'
import { isSavableLine, useRxCatalog } from './useRxCatalog'
import { useStatsData, type SaveInput } from './useStatsData'
import { statsRange } from './view'

// 찾기 목록의 넓은 읽기 (rx-picker AC-802.5~802.7, design.md '훅'). 저장은 가짜다. 처방은 모두 지어낸 값이다.
// 일 줄 → 목록 줄 만들기는 rxCatalog의 일(TASK-3)이고, 여기서는 '언제 읽고 어느 답을 쓰는가'만 본다

vi.mock('@/lib/storage/stats', () => ({
  readDays: vi.fn(),
  readMonths: vi.fn(),
  readCoverage: vi.fn(),
  saveStats: vi.fn(),
}))

const TODAY = '2026-11-13'
const R30 = statsRange(TODAY, '30d')
const R12 = statsRange(TODAY, '12m')
const WIDEST = { from: R12.previous.from, to: R12.current.to }

function day(ymd: string, codes: string[] = []): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
    rx: codes.map((code) => ({ code, name: `가짜처방 ${code}`, type: '기타', patients: 3, newPatients: 1, returning: 2 })),
    groups: [],
    revisit: { cohort: 2, within7: 1, within14: 1 },
  }
}

type Read = Awaited<ReturnType<typeof readDays>>
const read = (rows: DayPayload[] = []): Read => ({ rows, dropped: 0, latest: null, fromFile: false })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const WIDE_ONE = read([day('2025-03-02', ['W100'])])
const WIDE_TWO = read([day('2025-03-02', ['W200'])])

const widestReads = () => vi.mocked(readDays).mock.calls.filter(([range]) => range.from === WIDEST.from && range.to === WIDEST.to)

const draw = (revision = 0, today = TODAY) =>
  renderHook(({ revision: number, today: date }) => useRxCatalog(date, number), { initialProps: { revision, today } })
type View = ReturnType<typeof draw>

const open = (view: View) => act(() => view.result.current.open())
const retry = (view: View) => act(() => view.result.current.retry())
const answered = (view: View) => waitFor(() => expect(view.result.current.state).toBe('ready'))
const settle = () => act(async () => void (await new Promise((done) => setTimeout(done))))

beforeEach(() => {
  vi.mocked(readDays).mockReset()
  vi.mocked(readMonths).mockReset()
  vi.mocked(readCoverage).mockReset()
  vi.mocked(saveStats).mockReset()
  vi.mocked(readDays).mockResolvedValue(WIDE_ONE)
  vi.mocked(readCoverage).mockResolvedValue([])
  vi.mocked(saveStats).mockResolvedValue({ saved: 1 })
})

afterEach(cleanup)

describe('AC-802.5 넓은 범위를 읽는 때', () => {
  it('AC-802.5 열기 전에는 읽지 않고 idle이다', async () => {
    const view = draw()
    await settle()
    expect(readDays).not.toHaveBeenCalled()
    expect(view.result.current.state).toBe('idle')
    expect(view.result.current.days).toEqual([])
  })

  it('AC-802.5 처음 열면 오늘 기준 최근 12개월 + 작년 범위를 한 번 읽어 일 줄을 준다', async () => {
    const view = draw()
    open(view)
    expect(view.result.current.state).toBe('reading')
    await answered(view)

    expect(vi.mocked(readDays).mock.calls).toEqual([[WIDEST]])
    expect(view.result.current.days).toEqual(WIDE_ONE.rows)
  })

  it('AC-802.5 닫았다 다시 열어도, 읽는 중에 또 열어도 더 부르지 않는다', async () => {
    const view = draw()
    act(() => {
      view.result.current.open()
      view.result.current.open()
    })
    open(view)
    expect(readDays).toHaveBeenCalledTimes(1)
    await answered(view)

    open(view)
    await settle()
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(view.result.current.state).toBe('ready')
  })

  it('AC-802.5 페이지 읽기와 함께: 열기 전 readDays 호출 수는 페이지 읽기 그대로이고, 열면 넓은 범위 한 번 더, 다시 열어도 그대로다', async () => {
    vi.mocked(readDays).mockImplementation(async (range) => (range.from === WIDEST.from ? WIDE_ONE : read([day(range.from, ['P100'])])))
    const view = renderHook(() => {
      const data = useStatsData('30d', TODAY)
      return { data, catalog: useRxCatalog(TODAY, data.revision) }
    })
    await waitFor(() => expect(view.result.current.data.reading).toBe(false))
    const page = [
      [{ from: R30.current.from, to: R30.current.to }],
      [{ from: R30.previous.from, to: R30.previous.to }],
    ]
    expect(vi.mocked(readDays).mock.calls).toEqual(page)

    act(() => view.result.current.catalog.open())
    await waitFor(() => expect(view.result.current.catalog.state).toBe('ready'))
    expect(vi.mocked(readDays).mock.calls).toEqual([...page, [WIDEST]])

    act(() => view.result.current.catalog.open())
    await settle()
    expect(vi.mocked(readDays).mock.calls).toEqual([...page, [WIDEST]])
  })

  it('AC-802.5 날이 바뀌면 새 오늘의 범위로 다음 열 때 다시 읽는다', async () => {
    const view = draw()
    open(view)
    await answered(view)

    const next = '2026-11-14'
    view.rerender({ revision: 0, today: next })
    expect(view.result.current.state).toBe('idle')
    open(view)
    await answered(view)

    const range = statsRange(next, '12m')
    expect(vi.mocked(readDays).mock.calls.at(-1)).toEqual([{ from: range.previous.from, to: range.current.to }])
    expect(readDays).toHaveBeenCalledTimes(2)
  })
})

describe('AC-802.6 읽는 중·읽기 실패', () => {
  it('AC-802.6 읽는 동안은 reading이고 일 줄이 없다(부르는 쪽은 화면의 줄·고른 처방을 먼저 보인다)', async () => {
    const hold = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(hold.promise)
    const view = draw()
    open(view)
    await settle()
    expect(view.result.current.state).toBe('reading')
    expect(view.result.current.days).toEqual([])

    await act(async () => hold.resolve(WIDE_ONE))
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.days).toEqual(WIDE_ONE.rows)
  })

  it('AC-802.6 실패하면 failed이고 일 줄이 없다. 다시 열어도 저절로 읽지 않고 retry가 다시 읽는다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    const view = draw()
    open(view)
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
    expect(view.result.current.days).toEqual([])

    open(view)
    await settle()
    expect(readDays).toHaveBeenCalledTimes(1)

    retry(view)
    expect(view.result.current.state).toBe('reading')
    await answered(view)
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(vi.mocked(readDays).mock.calls[1]).toEqual([WIDEST])
    expect(view.result.current.days).toEqual(WIDE_ONE.rows)
  })

  it('AC-802.6 revision 뒤 다시 읽는 동안과 그 읽기에 실패했을 때는 앞 답의 줄을 주지 않는다("지금 보는 기간의 처방만"이 참이게)', async () => {
    const view = draw(0)
    open(view)
    await answered(view)
    expect(view.result.current.days).toEqual(WIDE_ONE.rows)

    const again = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(again.promise)
    view.rerender({ revision: 1, today: TODAY })
    open(view)
    expect(view.result.current.state).toBe('reading')
    expect(view.result.current.days).toEqual([])

    await act(async () => again.reject(new Error('가짜 실패')))
    expect(view.result.current.state).toBe('failed')
    expect(view.result.current.days).toEqual([])
  })

  it('AC-802.6 다시 읽어도 실패하면 failed로 돌아오고 또 다시 읽을 수 있다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패')).mockRejectedValueOnce(new Error('가짜 실패'))
    const view = draw()
    open(view)
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
    retry(view)
    await settle()
    expect(view.result.current.state).toBe('failed')

    retry(view)
    await answered(view)
    expect(readDays).toHaveBeenCalledTimes(3)
  })

  it('AC-802.6 retry는 실패했을 때만 읽는다(열기 전·읽는 중·읽은 뒤에는 아무 일 없음)', async () => {
    const view = draw()
    retry(view)
    await settle()
    expect(readDays).not.toHaveBeenCalled()
    expect(view.result.current.state).toBe('idle')

    open(view)
    retry(view)
    expect(readDays).toHaveBeenCalledTimes(1)
    await answered(view)

    retry(view)
    await settle()
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-802.6 목록 읽기에 실패해도 페이지의 숫자는 그대로다', async () => {
    const rows = [day(R30.current.from, ['P100'])]
    vi.mocked(readDays).mockImplementation(async (range) => {
      if (range.from === WIDEST.from) throw new Error('가짜 실패')
      return read(range.from === R30.current.from ? rows : [])
    })
    const view = renderHook(() => {
      const data = useStatsData('30d', TODAY)
      return { data, catalog: useRxCatalog(TODAY, data.revision) }
    })
    await waitFor(() => expect(view.result.current.data.reading).toBe(false))
    const before = view.result.current.data.input

    act(() => view.result.current.catalog.open())
    await waitFor(() => expect(view.result.current.catalog.state).toBe('failed'))
    expect(view.result.current.data.readFailed).toBe(false)
    expect(view.result.current.data.input).toBe(before)
  })
})

describe('AC-802.7 새 숫자를 저장한 뒤', () => {
  it('AC-802.7 revision이 바뀌면 읽지 않고 idle로 돌아가 앞 줄을 내려놓고, 다음 열 때 다시 읽는다', async () => {
    const view = draw(0)
    open(view)
    await answered(view)

    vi.mocked(readDays).mockResolvedValueOnce(WIDE_TWO)
    view.rerender({ revision: 1, today: TODAY })
    await settle()
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(view.result.current.state).toBe('idle')
    expect(view.result.current.days).toEqual([])

    open(view)
    await answered(view)
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(view.result.current.days).toEqual(WIDE_TWO.rows)

    open(view)
    await settle()
    expect(readDays).toHaveBeenCalledTimes(2)
  })

  it('AC-802.7 답이 오기 전 revision이 바뀌면 늦게 온 첫 답을 버린다: 첫 답을 잡아 둔 채 새 답이 온 뒤 풀어도 새 답 그대로다', async () => {
    const first = deferred<Read>()
    const second = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const view = draw(0)
    open(view)

    view.rerender({ revision: 1, today: TODAY })
    open(view)
    expect(readDays).toHaveBeenCalledTimes(2)

    await act(async () => second.resolve(WIDE_TWO))
    expect(view.result.current.days).toEqual(WIDE_TWO.rows)

    await act(async () => first.resolve(WIDE_ONE))
    await settle()
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.days).toEqual(WIDE_TWO.rows)
  })

  it('AC-802.7 늦게 온 첫 실패도 버린다', async () => {
    const first = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(first.promise).mockResolvedValueOnce(WIDE_TWO)
    const view = draw(0)
    open(view)
    view.rerender({ revision: 1, today: TODAY })
    open(view)
    await answered(view)

    await act(async () => first.reject(new Error('가짜 실패')))
    await settle()
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.days).toEqual(WIDE_TWO.rows)
  })

  it('AC-802.7 새 답이 오기 전에 첫 답이 와도 읽는 중 그대로이고 첫 답을 쓰지 않는다', async () => {
    const first = deferred<Read>()
    const second = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const view = draw(0)
    open(view)
    view.rerender({ revision: 1, today: TODAY })
    open(view)

    await act(async () => first.resolve(WIDE_ONE))
    expect(view.result.current.state).toBe('reading')
    expect(view.result.current.days).toEqual([])

    await act(async () => second.resolve(WIDE_TWO))
    expect(view.result.current.days).toEqual(WIDE_TWO.rows)
  })

  it('AC-802.7 다시 열지 않은 채 첫 답이 와도 idle 그대로다', async () => {
    const first = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(first.promise)
    const view = draw(0)
    open(view)
    view.rerender({ revision: 1, today: TODAY })
    expect(view.result.current.state).toBe('idle')

    await act(async () => first.resolve(WIDE_ONE))
    await settle()
    expect(view.result.current.state).toBe('idle')
    expect(view.result.current.days).toEqual([])
  })

  it('AC-802.7 실패한 뒤 revision이 바뀌면 다음 열 때 다시 읽는다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패')).mockResolvedValueOnce(WIDE_TWO)
    const view = draw(0)
    open(view)
    await waitFor(() => expect(view.result.current.state).toBe('failed'))

    view.rerender({ revision: 1, today: TODAY })
    expect(view.result.current.state).toBe('idle')
    open(view)
    await answered(view)
    expect(view.result.current.days).toEqual(WIDE_TWO.rows)
  })

  it('AC-802.7 useStatsData로 저장하면 revision이 늘어 다음 열 때 넓은 범위를 다시 읽는다', async () => {
    const fresh: SaveInput = { months: [], days: [day('2026-11-05')], covered: { from: '2026-11-01', to: '2026-11-12' }, source: 'file' }
    vi.mocked(readDays).mockImplementation(async (range) => (range.from === WIDEST.from ? WIDE_ONE : read([day(range.from, ['P100'])])))
    const view = renderHook(() => {
      const data = useStatsData('30d', TODAY)
      return { data, catalog: useRxCatalog(TODAY, data.revision) }
    })
    await waitFor(() => expect(view.result.current.data.reading).toBe(false))
    act(() => view.result.current.catalog.open())
    await waitFor(() => expect(view.result.current.catalog.state).toBe('ready'))
    expect(widestReads()).toHaveLength(1)

    await act(async () => {
      await view.result.current.data.save(fresh)
    })
    await waitFor(() => expect(view.result.current.data.reading).toBe(false))
    expect(view.result.current.catalog.state).toBe('idle')
    expect(widestReads()).toHaveLength(1)

    act(() => view.result.current.catalog.open())
    await waitFor(() => expect(view.result.current.catalog.state).toBe('ready'))
    expect(widestReads()).toHaveLength(2)
  })
})

describe('AC-802.11 rxCatalog에 넘기는 검사', () => {
  it('AC-802.11 isSavableLine은 null이나 객체가 아니라 참·거짓을 돌려준다', () => {
    expect(isSavableLine({ code: 'A100', name: '가짜처방' })).toBe(true)
    expect(isSavableLine({ code: 'A\n100', name: '가짜처방' })).toBe(false)
    expect(isSavableLine({ code: '', name: '가짜처방' })).toBe(false)
    expect(isSavableLine({ code: '010-0000-0000', name: '가짜처방' })).toBe(false)
  })

  it('AC-802.11 rxCatalog에 넘기면 검사에 걸리는 줄이 목록에 없고 나머지는 그대로다', () => {
    const lines = rxCatalog([day('2026-11-01', ['A100', 'A\n100', '010-0000-0000'])], [{ code: 'B200', name: '가짜 고른 처방' }, { code: 'C\n300', name: '가짜' }], isSavableLine)
    expect(lines.map((line) => line.code).sort()).toEqual(['A100', 'B200'])
  })
})
