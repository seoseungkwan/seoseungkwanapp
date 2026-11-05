// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCoverage, readDays, readMonths, saveStats } from '@/lib/storage/stats'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { useStatsData, type SaveInput } from './useStatsData'
import { statsRange, type StatsPeriod } from './view'

// 저장된 숫자 읽기·저장·다시 읽기 (stats REQ-514, design.md TASK-14). 저장은 가짜다. 가짜 일 줄은 이 파일 안에서만 만든다

vi.mock('@/lib/storage/stats', () => ({
  readDays: vi.fn(),
  readMonths: vi.fn(),
  readCoverage: vi.fn(),
  saveStats: vi.fn(),
}))

const TODAY = '2026-11-13'
const R30 = statsRange(TODAY, '30d')
const R7 = statsRange(TODAY, '7d')
const R12 = statsRange(TODAY, '12m')
const WIDEST = { from: R12.previous.from, to: R12.current.to }
const BIT_AT = { at: '2026-11-13T09:42:00Z', source: 'bit' as const }
const FILE_AT = { at: '2026-11-12T09:30:00Z', source: 'file' as const }

function day(ymd: string, patients = 10): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients, newPatients: 2, returning: patients - 2, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 2, within7: 1, within14: 1 },
  }
}

type Read = Awaited<ReturnType<typeof readDays>>
const read = (rows: DayPayload[] = [], over: Partial<Read> = {}): Read => ({ rows, dropped: 0, latest: null, fromFile: false, ...over })

// readDays 답을 기간 첫날로 고른다. 없는 기간은 빈 답이다
const answers = (byFrom: Record<string, Read>) => vi.mocked(readDays).mockImplementation(async (range) => byFrom[range.from] ?? read())
const readRanges = () => vi.mocked(readDays).mock.calls.map(([range]) => range)

const draw = (period: StatsPeriod = '30d') => renderHook(({ period: chosen }) => useStatsData(chosen, TODAY), { initialProps: { period } })
type View = ReturnType<typeof draw>
const settled = (view: View) => waitFor(() => expect(view.result.current.reading).toBe(false))

const FRESH = day('2026-11-05', 77)
const SAVE_BIT: SaveInput = { months: [], days: [FRESH], covered: { from: '2026-11-01', to: '2026-11-12' }, source: 'bit' }
const SAVE_FILE: SaveInput = { ...SAVE_BIT, source: 'file' }

beforeEach(() => {
  vi.mocked(readDays).mockReset()
  vi.mocked(readMonths).mockReset()
  vi.mocked(readCoverage).mockReset()
  vi.mocked(saveStats).mockReset()
  answers({})
  vi.mocked(readCoverage).mockResolvedValue([])
  vi.mocked(saveStats).mockResolvedValue({ saved: 1 })
})

afterEach(cleanup)

describe('AC-514.1 저장된 숫자 읽기', () => {
  it('AC-514.1 고른 기간과 비교 기간만 readDays·readCoverage로 읽고 readMonths는 부르지 않는다', async () => {
    const covered: DateRange[] = [{ from: '2026-09-01', to: '2026-11-12' }]
    answers({ [R30.current.from]: read([day('2026-11-01')]), [R30.previous.from]: read([day('2026-10-01')]) })
    vi.mocked(readCoverage).mockResolvedValue(covered)

    const view = draw()
    expect(view.result.current.reading).toBe(true)
    expect(view.result.current.input).toBeNull()
    await settled(view)

    expect(readRanges()).toEqual([
      { from: R30.current.from, to: R30.current.to },
      { from: R30.previous.from, to: R30.previous.to },
    ])
    expect(readCoverage).toHaveBeenCalledWith({ from: R30.previous.from, to: R30.current.to })
    expect(readMonths).not.toHaveBeenCalled()

    const { input, saved } = view.result.current
    expect(saved).toBe(true)
    expect(input?.range.period).toBe('30d')
    expect(input?.covered).toEqual(covered)
    expect(input?.days.map((row) => row.day).sort()).toEqual(['2026-10-01', '2026-11-01'])
  })

  it('AC-514.1 어디에도 저장된 줄이 없으면 saved가 false다', async () => {
    const view = draw()
    await settled(view)
    expect(view.result.current.saved).toBe(false)
    expect(view.result.current.latest).toBeNull()
    expect(view.result.current.input?.days).toEqual([])
  })

  it('AC-513.4 고른 기간에 줄이 없어도 화면이 읽는 가장 넓은 범위에 있으면 saved다. 그 줄로 그리지 않고 파일 안내도 정하지 않는다', async () => {
    answers({ [WIDEST.from]: read([day('2025-01-05')], { fromFile: true, latest: FILE_AT }) })
    const view = draw()
    await settled(view)

    expect(readRanges()).toContainEqual(WIDEST)
    const { saved, input, fromFile, latest } = view.result.current
    expect(saved).toBe(true)
    expect(input?.days).toEqual([])
    expect(fromFile).toBe(false)
    expect(latest).toBeNull()
  })

  it('AC-513.4 한 번 saved임을 알면 빈 기간으로 바꿔도 넓게 다시 읽지 않는다', async () => {
    answers({ [WIDEST.from]: read([day('2025-01-05')]) })
    const view = draw()
    await settled(view)
    vi.mocked(readDays).mockClear()

    view.rerender({ period: '7d' })
    await settled(view)

    expect(readRanges()).toEqual([
      { from: R7.current.from, to: R7.current.to },
      { from: R7.previous.from, to: R7.previous.to },
    ])
    expect(view.result.current.saved).toBe(true)
  })

  it('AC-514.1 최근 12개월은 읽는 범위가 이미 가장 넓어 더 읽지 않는다', async () => {
    const view = draw('12m')
    await settled(view)
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(view.result.current.saved).toBe(false)
  })

  it('AC-514.1 latest가 null이어도 줄이 있으면 saved다(시각을 못 읽는 브라우저)', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01')], { latest: null }) })
    const view = draw()
    await settled(view)
    expect(view.result.current.saved).toBe(true)
    expect(view.result.current.latest).toBeNull()
  })

  it('AC-514.1 읽기 실패는 readFailed이고 reread로 다시 읽는다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    const view = draw()
    await waitFor(() => expect(view.result.current.readFailed).toBe(true))
    expect(view.result.current.reading).toBe(false)
    expect(view.result.current.input).toBeNull()

    answers({ [R30.current.from]: read([day('2026-11-01')]) })
    act(() => view.result.current.reread())
    expect(view.result.current.reading).toBe(true)
    expect(view.result.current.readFailed).toBe(false)
    await settled(view)
    expect(view.result.current.readFailed).toBe(false)
    expect(view.result.current.input?.days).toHaveLength(1)
  })

  it('AC-514.1 덮은 기간을 못 읽어도 읽기 실패다', async () => {
    vi.mocked(readCoverage).mockRejectedValueOnce(new Error('가짜 실패'))
    const view = draw()
    await waitFor(() => expect(view.result.current.readFailed).toBe(true))
  })
})

describe('AC-514.2 기간 바꿈', () => {
  it('AC-514.2 기간을 바꾸면 읽는 동안 reading이고 앞 그림은 앞 기간 그대로이며, 그 기간과 비교 기간을 읽는다', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01')]) })
    const view = draw()
    await settled(view)

    view.rerender({ period: '7d' })
    expect(view.result.current.reading).toBe(true)
    expect(view.result.current.input?.range.period).toBe('30d')

    await settled(view)
    expect(view.result.current.input?.range.period).toBe('7d')
    expect(readRanges()).toContainEqual({ from: R7.current.from, to: R7.current.to })
    expect(readRanges()).toContainEqual({ from: R7.previous.from, to: R7.previous.to })
  })

  it('AC-514.2 앞 기간의 늦은 답은 버린다', async () => {
    let finishOld: (answer: Read) => void = () => {}
    vi.mocked(readDays).mockImplementation((range) =>
      range.from === R30.current.from ? new Promise<Read>((resolve) => (finishOld = resolve)) : Promise.resolve(read(range.from === R7.current.from ? [day('2026-11-10')] : [])),
    )
    const view = draw()
    view.rerender({ period: '7d' })
    await settled(view)
    expect(view.result.current.input?.range.period).toBe('7d')

    await act(async () => finishOld(read([day('2026-11-01')])))
    expect(view.result.current.input?.range.period).toBe('7d')
    expect(view.result.current.input?.days.map((row) => row.day)).toEqual(['2026-11-10'])
  })
})

describe('AC-514.3·514.4 저장에 성공하면 표에서 다시 읽어 그린다', () => {
  it('AC-514.4·AC-506.4 파일 저장 성공 → readDays를 다시 부르고 그 답으로 그린다(트리거가 옛 줄을 남겼을 수 있어 방금 만든 숫자를 합치지 않는다). readMonths를 부르지 않는다', async () => {
    const view = draw()
    await settled(view)
    const before = vi.mocked(readDays).mock.calls.length

    answers({ [R30.current.from]: read([day('2026-11-05', 33)], { fromFile: true, latest: FILE_AT }) })
    await act(async () => {
      expect(await view.result.current.save(SAVE_FILE)).toBe(true)
    })
    await settled(view)

    expect(saveStats).toHaveBeenCalledWith(SAVE_FILE)
    expect(vi.mocked(readDays).mock.calls.length).toBeGreaterThan(before)
    expect(readMonths).not.toHaveBeenCalled()
    expect(view.result.current.input?.days).toEqual([day('2026-11-05', 33)])
    expect(view.result.current.fromFile).toBe(true)
    expect(view.result.current.unsaved).toBeNull()
  })

  it('AC-514.3 안내가 보이던 기간에서 비트 저장 성공 → 다시 읽은 fromFile false → 안내가 사라진다', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01')], { fromFile: true, latest: FILE_AT }) })
    const view = draw()
    await settled(view)
    expect(view.result.current.fromFile).toBe(true)
    expect(view.result.current.justSaved).toBe(false)

    answers({ [R30.current.from]: read([day('2026-11-01')], { fromFile: false, latest: BIT_AT }) })
    await act(async () => {
      await view.result.current.save(SAVE_BIT)
    })
    await settled(view)

    expect(view.result.current.fromFile).toBe(false)
    expect(view.result.current.latest).toEqual(BIT_AT)
    expect(view.result.current.justSaved).toBe(true)
  })

  it('AC-514.3 방금 저장했다는 표시는 기간을 바꾸면 없어진다', async () => {
    const view = draw()
    await settled(view)
    await act(async () => {
      await view.result.current.save(SAVE_BIT)
    })
    await settled(view)
    expect(view.result.current.justSaved).toBe(true)

    view.rerender({ period: '7d' })
    await settled(view)
    expect(view.result.current.justSaved).toBe(false)
  })

  it('AC-514.3 저장한 기간으로 돌아와도 방금 저장했다는 표시는 다시 켜지지 않는다', async () => {
    const view = draw()
    await settled(view)
    await act(async () => {
      await view.result.current.save(SAVE_BIT)
    })
    await settled(view)

    view.rerender({ period: '7d' })
    await settled(view)
    view.rerender({ period: '30d' })
    await settled(view)
    expect(view.result.current.justSaved).toBe(false)
  })
})

describe('AC-514.6 읽기가 실패해도 저장하지 못한 숫자', () => {
  it('AC-514.6 지금 고른 기간의 그림이고, 앞 읽기의 줄·출처·파일 표시를 쓰지 않는다', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01', 10)], { fromFile: true, latest: FILE_AT }) })
    const view = draw()
    await settled(view)
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    await act(async () => {
      await view.result.current.save(SAVE_BIT)
    })

    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    view.rerender({ period: '90d' })
    await waitFor(() => expect(view.result.current.readFailed).toBe(true))

    const { input, latest, fromFile, saved, unsaved } = view.result.current
    expect(unsaved).toBe('bit')
    expect(input?.range.period).toBe('90d')
    expect(input?.days).toEqual([FRESH])
    expect(input?.covered).toEqual([SAVE_BIT.covered])
    expect(latest).toBeNull()
    expect(fromFile).toBe(false)
    expect(saved).toBe(true)
  })

  it('AC-514.6 처음 읽기부터 실패해도 저장하지 못한 숫자로 그림이 생기고, 파일이면 안내가 켜진다', async () => {
    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    const view = draw()
    await waitFor(() => expect(view.result.current.readFailed).toBe(true))
    expect(view.result.current.input).toBeNull()

    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    await act(async () => {
      await view.result.current.save(SAVE_FILE)
    })
    expect(view.result.current.input?.range.period).toBe('30d')
    expect(view.result.current.input?.days).toEqual([FRESH])
    expect(view.result.current.fromFile).toBe(true)
  })

  it('AC-514.7 저장하지 못한 숫자가 없으면 읽기 실패 때 앞 읽기의 출처·파일 표시를 내놓지 않는다', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01', 10)], { fromFile: true, latest: FILE_AT }) })
    const view = draw()
    await settled(view)
    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    view.rerender({ period: '7d' })
    await waitFor(() => expect(view.result.current.readFailed).toBe(true))
    expect(view.result.current.latest).toBeNull()
    expect(view.result.current.fromFile).toBe(false)
  })
})

describe('AC-514.6 저장 실패', () => {
  it('AC-514.6 저장 실패 → 다시 읽지 않고 방금 만든 숫자를 합쳐 보인다(같은 날은 방금 만든 숫자, 덮은 기간도 합친다)', async () => {
    answers({ [R30.current.from]: read([day('2026-11-05', 10), day('2026-11-06', 11)]) })
    vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-10-01', to: '2026-10-31' }])
    const view = draw()
    await settled(view)
    const before = vi.mocked(readDays).mock.calls.length

    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    await act(async () => {
      expect(await view.result.current.save(SAVE_BIT)).toBe(false)
    })

    expect(vi.mocked(readDays).mock.calls.length).toBe(before)
    expect(view.result.current.reading).toBe(false)
    expect(view.result.current.unsaved).toBe('bit')
    const { input } = view.result.current
    const fresh = input?.days.filter((row) => row.day === '2026-11-05')
    expect(fresh?.at(-1)?.totals.patients).toBe(77)
    expect(input?.days.some((row) => row.day === '2026-11-06')).toBe(true)
    expect(input?.covered).toEqual([{ from: '2026-10-01', to: '2026-11-12' }])
  })

  it('AC-514.6 저장된 줄이 하나도 없어도 방금 만든 숫자를 보이는 동안은 saved다(처음 안내를 보이지 않는다)', async () => {
    const view = draw()
    await settled(view)
    expect(view.result.current.saved).toBe(false)

    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    await act(async () => {
      await view.result.current.save(SAVE_BIT)
    })
    expect(view.result.current.saved).toBe(true)
  })

  it('AC-514.6 기간 밖의 방금 만든 숫자는 그 기간 그림에 넣지 않는다', async () => {
    const view = draw('7d')
    await settled(view)
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    await act(async () => {
      await view.result.current.save({ ...SAVE_BIT, days: [day('2026-01-02', 77), day('2026-11-10', 78)] })
    })
    expect(view.result.current.input?.days.map((row) => row.day)).toEqual(['2026-11-10'])
  })

  it('AC-514.6 다시 저장은 같은 값을 다시 보내고, 성공하면 표에서 다시 읽는다', async () => {
    const view = draw()
    await settled(view)
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    await act(async () => {
      await view.result.current.save(SAVE_BIT)
    })
    const before = vi.mocked(readDays).mock.calls.length

    await act(async () => {
      expect(await view.result.current.retrySave()).toBe(true)
    })
    await settled(view)

    expect(vi.mocked(saveStats).mock.calls.map(([input]) => input)).toEqual([SAVE_BIT, SAVE_BIT])
    expect(vi.mocked(saveStats).mock.calls[1]?.[0]).toBe(vi.mocked(saveStats).mock.calls[0]?.[0])
    expect(view.result.current.unsaved).toBeNull()
    expect(vi.mocked(readDays).mock.calls.length).toBeGreaterThan(before)
  })

  it('AC-514.6 저장하는 동안 saving이 켜진다', async () => {
    const view = draw()
    await settled(view)
    let finish: (answer: { saved: number }) => void = () => {}
    vi.mocked(saveStats).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))

    let pending: Promise<boolean> = Promise.resolve(false)
    act(() => {
      pending = view.result.current.save(SAVE_BIT)
    })
    expect(view.result.current.saving).toBe(true)

    await act(async () => {
      finish({ saved: 1 })
      await pending
    })
    expect(view.result.current.saving).toBe(false)
  })
})

describe('AC-514.7 파일 안내를 정하는 값', () => {
  it('AC-514.7 latest.source가 bit이어도 읽은 줄에 파일 줄이 있으면 fromFile이다', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01')], { fromFile: true, latest: BIT_AT }) })
    const view = draw()
    await settled(view)
    expect(view.result.current.latest?.source).toBe('bit')
    expect(view.result.current.fromFile).toBe(true)
  })

  it('AC-514.7 비교 기간 읽기만 fromFile이어도 fromFile이다', async () => {
    answers({
      [R30.current.from]: read([day('2026-11-01')], { fromFile: false, latest: BIT_AT }),
      [R30.previous.from]: read([day('2026-10-01')], { fromFile: true, latest: FILE_AT }),
    })
    const view = draw()
    await settled(view)
    expect(view.result.current.fromFile).toBe(true)
  })

  it('AC-514.7 읽은 줄이 모두 비트이면 fromFile이 아니다. latest는 두 읽기 가운데 가장 최근이다', async () => {
    answers({
      [R30.current.from]: read([day('2026-11-01')], { latest: { at: '2026-11-01T00:00:00Z', source: 'bit' } }),
      [R30.previous.from]: read([day('2026-10-01')], { latest: BIT_AT }),
    })
    const view = draw()
    await settled(view)
    expect(view.result.current.fromFile).toBe(false)
    expect(view.result.current.latest).toEqual(BIT_AT)
  })

  it('AC-514.7 저장하지 못한 방금 만든 파일 숫자를 보이는 동안은 fromFile이다', async () => {
    const view = draw()
    await settled(view)
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    await act(async () => {
      await view.result.current.save(SAVE_FILE)
    })
    expect(view.result.current.unsaved).toBe('file')
    expect(view.result.current.fromFile).toBe(true)
  })

  it('AC-514.7 저장하지 못한 비트 숫자는 fromFile을 켜지 않는다', async () => {
    const view = draw()
    await settled(view)
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    await act(async () => {
      await view.result.current.save(SAVE_BIT)
    })
    expect(view.result.current.fromFile).toBe(false)
  })
})

describe('AC-802.7 revision', () => {
  it('AC-802.7 처음에는 0이고 저장에 성공하면 는다', async () => {
    const view = draw()
    await settled(view)
    expect(view.result.current.revision).toBe(0)

    await act(async () => {
      await view.result.current.save(SAVE_BIT)
    })
    expect(view.result.current.revision).toBe(1)
  })

  it('AC-802.7 저장에 실패하면 늘지 않고, 다시 저장해 성공하면 는다', async () => {
    const view = draw()
    await settled(view)
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    await act(async () => {
      await view.result.current.save(SAVE_FILE)
    })
    expect(view.result.current.revision).toBe(0)

    await act(async () => {
      await view.result.current.retrySave()
    })
    expect(view.result.current.revision).toBe(1)
  })

  it('AC-802.7 [다시 읽기]를 누르면 는다', async () => {
    const view = draw()
    await settled(view)
    act(() => view.result.current.reread())
    expect(view.result.current.revision).toBe(1)
    await settled(view)
    expect(view.result.current.revision).toBe(1)
  })

  it('AC-802.7 기간을 바꾸는 것만으로는 늘지 않는다', async () => {
    const view = draw()
    await settled(view)
    view.rerender({ period: '7d' })
    await settled(view)
    expect(view.result.current.revision).toBe(0)
  })
})
