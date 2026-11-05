// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCoverage, readDays, readMonths, saveStats } from '@/lib/storage/stats'
import type { DateRange } from '@/types/dates'
import type { AgainWindow, DayPayload } from '@/types/payload'
import { useAgainDays } from './useAgainDays'
import { statsRange, type StatsInput, type StatsPeriod } from './view'

// 같은 처방 재방문의 넓은 날 줄 읽기 (fu-rate REQ-1306, design.md '훅'). 저장은 가짜다. 날 줄·처방은 모두 지어낸 값이다.
// 답은 잡아 두었다(deferred) 푼다(useRxPicks.test.ts와 같은 방법). '언제 읽고 어느 답을 쓰는가'만 보고, 숫자는 againView의 일이다

vi.mock('@/lib/storage/stats', () => ({
  readDays: vi.fn(),
  readMonths: vi.fn(),
  readCoverage: vi.fn(),
  saveStats: vi.fn(),
}))

const TODAY = '2026-11-05'
const NEXT_DAY = '2026-11-06'
// 최근 7일(오늘 11-05): 페이지 읽기는 10-22 ~ 11-04, 넓은 읽기는 30일 창으로 옮긴 첫날 09-29 ~ 비교 기간 첫날 − 1 10-21
const EXTRA: DateRange = { from: '2026-09-29', to: '2026-10-21' }
const EXTRA_NEXT: DateRange = { from: '2026-09-30', to: '2026-10-22' }

function day(ymd: string, code = 'T100'): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
    rx: [{ code, name: `가짜처방 ${code}`, type: '기타', patients: 3, newPatients: 1, returning: 2 }],
    groups: [],
    revisit: { cohort: 2, within7: 1, within14: 1 },
    again: { ready: [true, true, true], rx: [{ code, starts: 1, back: [1, 1, 1], more: [2, 2, 2] }] },
  }
}

const inputOf = (period: StatsPeriod, today = TODAY): StatsInput => ({
  days: [day('2026-10-22'), day('2026-11-04')],
  covered: [{ from: '2026-10-22', to: '2026-11-04' }],
  range: statsRange(today, period),
})

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

const EXTRA_ROWS = [day('2026-09-29', 'W100'), day('2026-10-21', 'W100')]
const EXTRA_COVERED: DateRange[] = [{ from: '2026-09-01', to: '2026-10-21' }]

type Props = { input: StatsInput; win: AgainWindow; revision: number; enabled: boolean }
const draw = (props: Partial<Props> = {}, wrapper?: typeof StrictMode) =>
  renderHook((p: Props) => useAgainDays(p.input, p.win, p.revision, p.enabled), {
    initialProps: { input: inputOf('7d'), win: 30, revision: 0, enabled: true, ...props },
    wrapper,
  })
type View = ReturnType<typeof draw>

const settle = () => act(async () => void (await new Promise((done) => setTimeout(done))))
const answered = (view: View) => waitFor(() => expect(view.result.current.state).toBe('ready'))
const retry = (view: View) => act(() => view.result.current.retry())
const dayReads = () => vi.mocked(readDays).mock.calls.map(([range]) => range)
const coverageReads = () => vi.mocked(readCoverage).mock.calls.map(([range]) => range)
const shownDays = (view: View) => view.result.current.input.days.map((row) => `${row.day} ${row.rx[0].code}`)

beforeEach(() => {
  vi.mocked(readDays).mockReset().mockResolvedValue(read(EXTRA_ROWS))
  vi.mocked(readCoverage).mockReset().mockResolvedValue(EXTRA_COVERED)
  vi.mocked(readMonths).mockReset()
  vi.mocked(saveStats).mockReset()
})

afterEach(cleanup)

describe('AC-1306.1 읽지 않는 때: input 그대로·ready', () => {
  it.each<[string, StatsPeriod, AgainWindow, boolean]>([
    ['최근 7일 + 7일(needsExtra 거짓)', '7d', 7, true],
    ['최근 30일 + 30일', '30d', 30, true],
    ['최근 90일 + 14일', '90d', 14, true],
    ['최근 12개월 + 30일', '12m', 30, true],
    ['고른 처방이 없음(enabled 거짓) + 최근 7일 + 30일', '7d', 30, false],
    ['고른 처방이 없음(enabled 거짓) + 최근 7일 + 14일', '7d', 14, false],
  ])('AC-1306.1 %s이면 읽지 않고 input을 그대로 낸다', async (_why, period, win, enabled) => {
    const input = inputOf(period)
    const view = draw({ input, win, enabled })
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.input).toBe(input)
    await settle()
    expect(readDays).not.toHaveBeenCalled()
    expect(readCoverage).not.toHaveBeenCalled()
    expect(view.result.current.input).toBe(input)
  })

  it('AC-1306.1 읽지 않는 때 retry()도 읽지 않는다', async () => {
    const view = draw({ win: 7 })
    retry(view)
    await settle()
    expect(readDays).not.toHaveBeenCalled()
    expect(view.result.current.state).toBe('ready')
  })
})

describe('AC-1306.1 최근 7일 + 14·30일: 넓은 범위를 한 번 읽는다', () => {
  it('AC-1306.1 readDays·readCoverage를 againExtraSpan(09-29 ~ 10-21)으로 한 번씩 부르고 그동안 reading이다', async () => {
    const days = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(days.promise)
    const input = inputOf('7d')
    const view = draw({ input, win: 30 })
    expect(view.result.current.state).toBe('reading')
    await settle()
    expect(dayReads()).toEqual([EXTRA])
    expect(coverageReads()).toEqual([EXTRA])
    expect(view.result.current.state).toBe('reading')
    expect(view.result.current.input).toBe(input) // 받기 전에는 더한 줄이 없다

    await act(async () => days.resolve(read(EXTRA_ROWS)))
    await answered(view)
    expect(dayReads()).toEqual([EXTRA])
    expect(coverageReads()).toEqual([EXTRA])
  })

  it('AC-1306.1 받은 줄을 앞에, input.days를 뒤에 두고 덮은 기간은 mergeRanges로 합친다. 기간(range)은 그대로다', async () => {
    const input = inputOf('7d')
    const view = draw({ input, win: 30 })
    await answered(view)
    const out = view.result.current.input
    expect(shownDays(view)).toEqual(['2026-09-29 W100', '2026-10-21 W100', '2026-10-22 T100', '2026-11-04 T100'])
    expect(out.covered).toEqual([{ from: '2026-09-01', to: '2026-11-04' }]) // 09-01 ~ 10-21 과 10-22 ~ 11-04 가 이어져 하나
    expect(out.range).toBe(input.range)
    expect(input.days).toHaveLength(2) // 받은 input은 고치지 않는다
    expect(input.covered).toEqual([{ from: '2026-10-22', to: '2026-11-04' }])
  })

  it('AC-1306.1 떨어진 덮은 기간은 따로 남고 시작 순이다', async () => {
    vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-09-29', to: '2026-10-05' }])
    const view = draw({ win: 14 })
    await answered(view)
    expect(view.result.current.input.covered).toEqual([
      { from: '2026-09-29', to: '2026-10-05' },
      { from: '2026-10-22', to: '2026-11-04' },
    ])
  })

  it('AC-1306.1 14일도 30일 창에 맞춘 같은 넓은 범위를 읽는다', async () => {
    const view = draw({ win: 14 })
    await answered(view)
    expect(dayReads()).toEqual([EXTRA])
    expect(coverageReads()).toEqual([EXTRA])
  })

  it('AC-1306.1 14일 ↔ 30일을 오가도, 7일로 갔다 와도 다시 읽지 않는다', async () => {
    const view = draw({ win: 7 })
    await settle()
    expect(readDays).not.toHaveBeenCalled()

    view.rerender({ input: inputOf('7d'), win: 30, revision: 0, enabled: true })
    await answered(view)
    for (const win of [14, 30, 7, 14, 30] as AgainWindow[]) {
      view.rerender({ input: inputOf('7d'), win, revision: 0, enabled: true })
      await settle()
      expect(view.result.current.state).toBe('ready')
      expect(view.result.current.input.days).toHaveLength(win === 7 ? 2 : 4)
    }
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(readCoverage).toHaveBeenCalledTimes(1)
  })

  it('AC-1306.1 읽는 중에 14일로 바꿔도 두 번 읽지 않고 같은 답을 쓴다', async () => {
    const days = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(days.promise)
    const view = draw({ win: 30 })
    await settle()
    view.rerender({ input: inputOf('7d'), win: 14, revision: 0, enabled: true })
    await settle()
    expect(view.result.current.state).toBe('reading')
    await act(async () => days.resolve(read(EXTRA_ROWS)))
    await answered(view)
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(view.result.current.input.days).toHaveLength(4)
  })

  it('AC-1306.1 다른 기간에 갔다가 최근 7일로 돌아와도 같은 오늘·revision이면 다시 읽지 않는다', async () => {
    const view = draw({ win: 30 })
    await answered(view)
    view.rerender({ input: inputOf('30d'), win: 30, revision: 0, enabled: true })
    await settle()
    view.rerender({ input: inputOf('7d'), win: 30, revision: 0, enabled: true })
    await settle()
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.input.days).toHaveLength(4)
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-1306.1 새 input이 오면 받은 줄은 그대로 두고 새 input.days·덮은 기간과 합친다', async () => {
    const view = draw({ win: 30 })
    await answered(view)
    const next: StatsInput = { ...inputOf('7d'), days: [day('2026-11-03', 'N100')], covered: [{ from: '2026-11-03', to: '2026-11-03' }] }
    view.rerender({ input: next, win: 30, revision: 0, enabled: true })
    await settle()
    expect(shownDays(view)).toEqual(['2026-09-29 W100', '2026-10-21 W100', '2026-11-03 N100'])
    expect(view.result.current.input.covered).toEqual([
      { from: '2026-09-01', to: '2026-10-21' },
      { from: '2026-11-03', to: '2026-11-03' },
    ])
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-1306.1 StrictMode로 두 번 그려도 한 번만 읽는다', async () => {
    const view = draw({ win: 30 }, StrictMode)
    await answered(view)
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(readCoverage).toHaveBeenCalledTimes(1)
    expect(view.result.current.input.days).toHaveLength(4)
  })
})

describe('AC-1306.1 revision·오늘이 바뀌면 다음에 필요할 때 다시 읽는다', () => {
  it('AC-1306.1 필요한 동안 revision이 바뀌면 바로 다시 읽고 새 답을 쓴다', async () => {
    const view = draw({ win: 30 })
    await answered(view)
    vi.mocked(readDays).mockResolvedValueOnce(read([day('2026-10-01', 'R100')]))
    view.rerender({ input: inputOf('7d'), win: 30, revision: 1, enabled: true })
    expect(view.result.current.state).toBe('reading') // 앞 revision의 답을 쓰지 않는다
    await answered(view)
    expect(dayReads()).toEqual([EXTRA, EXTRA])
    expect(shownDays(view)).toEqual(['2026-10-01 R100', '2026-10-22 T100', '2026-11-04 T100'])
  })

  it('AC-1306.1 필요 없는 동안 revision이 바뀌면 읽지 않고, 다시 필요할 때 읽는다', async () => {
    const view = draw({ win: 30 })
    await answered(view)
    view.rerender({ input: inputOf('7d'), win: 7, revision: 1, enabled: true })
    await settle()
    view.rerender({ input: inputOf('30d'), win: 30, revision: 2, enabled: true })
    await settle()
    expect(readDays).toHaveBeenCalledTimes(1)

    view.rerender({ input: inputOf('7d'), win: 14, revision: 2, enabled: true })
    expect(view.result.current.state).toBe('reading')
    await answered(view)
    expect(dayReads()).toEqual([EXTRA, EXTRA])
  })

  it('AC-1306.1 고른 처방이 없다가 생기면(enabled 참) 그때 읽는다', async () => {
    const view = draw({ win: 30, enabled: false })
    await settle()
    expect(readDays).not.toHaveBeenCalled()
    view.rerender({ input: inputOf('7d'), win: 30, revision: 0, enabled: true })
    expect(view.result.current.state).toBe('reading')
    await answered(view)
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-1306.1 오늘이 바뀌면 새 오늘의 넓은 범위를 다시 읽는다', async () => {
    const view = draw({ win: 30 })
    await answered(view)
    view.rerender({ input: inputOf('7d', NEXT_DAY), win: 30, revision: 0, enabled: true })
    expect(view.result.current.state).toBe('reading')
    await answered(view)
    expect(dayReads()).toEqual([EXTRA, EXTRA_NEXT])
    expect(coverageReads()).toEqual([EXTRA, EXTRA_NEXT])
  })

  it('AC-1306.1 늦게 온 앞 답은 버린다: 앞 읽기가 뒤 읽기보다 늦게 와도 뒤 답이 남는다', async () => {
    const first = deferred<Read>()
    const second = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const view = draw({ win: 30 })
    await settle()
    view.rerender({ input: inputOf('7d'), win: 30, revision: 1, enabled: true })
    await settle()
    expect(readDays).toHaveBeenCalledTimes(2)

    await act(async () => second.resolve(read([day('2026-10-02', 'NEW1')])))
    await answered(view)
    await act(async () => first.resolve(read([day('2026-10-01', 'OLD1')])))
    await settle()
    expect(view.result.current.state).toBe('ready')
    expect(shownDays(view)).toEqual(['2026-10-02 NEW1', '2026-10-22 T100', '2026-11-04 T100'])
  })

  it('AC-1306.1 늦게 온 앞 답은 버린다: 뒤 읽기가 끝나기 전에 앞 답이 와도 reading 그대로이고 앞 답을 쓰지 않는다', async () => {
    const first = deferred<Read>()
    const second = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const view = draw({ win: 30 })
    await settle()
    view.rerender({ input: inputOf('7d', NEXT_DAY), win: 30, revision: 0, enabled: true })
    await settle()

    await act(async () => first.resolve(read([day('2026-10-01', 'OLD1')])))
    await settle()
    expect(view.result.current.state).toBe('reading')
    expect(shownDays(view)).not.toContain('2026-10-01 OLD1')

    await act(async () => second.resolve(read([day('2026-10-02', 'NEW1')])))
    await answered(view)
    expect(shownDays(view)).toEqual(['2026-10-02 NEW1', '2026-10-22 T100', '2026-11-04 T100'])
  })

  it('AC-1306.1 늦게 온 앞 실패도 버린다: 뒤 읽기는 failed가 되지 않는다', async () => {
    const first = deferred<Read>()
    const second = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const view = draw({ win: 30 })
    await settle()
    view.rerender({ input: inputOf('7d'), win: 30, revision: 1, enabled: true })
    await settle()

    await act(async () => first.reject(new Error('가짜 실패')))
    await settle()
    expect(view.result.current.state).toBe('reading')
    await act(async () => second.resolve(read(EXTRA_ROWS)))
    await answered(view)
  })
})

describe('AC-1306.1 실패하면 failed, retry()가 다시 읽는다', () => {
  it('AC-1306.1 readDays가 실패하면 failed이고 받은 줄이 없다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    const input = inputOf('7d')
    const view = draw({ input, win: 30 })
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
    expect(view.result.current.input).toBe(input)
  })

  it('AC-1306.1 readCoverage만 실패해도 failed다', async () => {
    vi.mocked(readCoverage).mockRejectedValueOnce(new Error('가짜 실패'))
    const view = draw({ win: 14 })
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
  })

  it('AC-1306.1 retry()는 reading을 거쳐 다시 읽고 답을 쓴다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    const view = draw({ win: 30 })
    await waitFor(() => expect(view.result.current.state).toBe('failed'))

    const days = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(days.promise)
    retry(view)
    expect(view.result.current.state).toBe('reading')
    await settle()
    expect(dayReads()).toEqual([EXTRA, EXTRA])
    expect(coverageReads()).toEqual([EXTRA, EXTRA])

    await act(async () => days.resolve(read(EXTRA_ROWS)))
    await answered(view)
    expect(view.result.current.input.days).toHaveLength(4)
  })

  it('AC-1306.1 다시 읽어도 실패하면 failed로 돌아온다', async () => {
    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    const view = draw({ win: 30 })
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
    retry(view)
    expect(view.result.current.state).toBe('reading')
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
    expect(readDays).toHaveBeenCalledTimes(2)
  })

  it('AC-1306.1 실패한 뒤 14일 ↔ 30일을 오가도 저절로 다시 읽지 않는다(retry만 읽는다)', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    const view = draw({ win: 30 })
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
    view.rerender({ input: inputOf('7d'), win: 14, revision: 0, enabled: true })
    await settle()
    expect(view.result.current.state).toBe('failed')
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-1306.1 실패한 채 7일을 누르면 읽지 않아도 되니 ready다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    const view = draw({ win: 30 })
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
    const input = inputOf('7d')
    view.rerender({ input, win: 7, revision: 0, enabled: true })
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.input).toBe(input)
  })

  it('AC-1306.1 실패한 뒤 revision이 바뀌면 다음에 필요할 때 새로 읽는다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    const view = draw({ win: 30 })
    await waitFor(() => expect(view.result.current.state).toBe('failed'))
    view.rerender({ input: inputOf('7d'), win: 30, revision: 1, enabled: true })
    expect(view.result.current.state).toBe('reading')
    await answered(view)
    expect(readDays).toHaveBeenCalledTimes(2)
  })

  it('AC-1306.1 다 읽은 뒤의 retry()는 다시 읽지 않는다', async () => {
    const view = draw({ win: 30 })
    await answered(view)
    retry(view)
    await settle()
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(view.result.current.state).toBe('ready')
  })

  it('AC-1306.1 읽는 중의 retry()는 두 번 읽지 않는다', async () => {
    const days = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(days.promise)
    const view = draw({ win: 30 })
    await settle()
    retry(view)
    await settle()
    expect(readDays).toHaveBeenCalledTimes(1)
    await act(async () => days.resolve(read(EXTRA_ROWS)))
    await answered(view)
  })
})

describe('AC-1306.1 내려간 뒤', () => {
  const unhandled = vi.fn()
  beforeEach(() => {
    unhandled.mockReset()
    process.on('unhandledRejection', unhandled)
  })
  afterEach(() => {
    process.off('unhandledRejection', unhandled)
  })

  it('AC-1306.1 읽는 중에 내려가면 늦은 답·실패 어느 쪽도 오류를 남기지 않는다', async () => {
    const answeredLate = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(answeredLate.promise)
    const first = draw({ win: 30 })
    await settle()
    first.unmount()
    await act(async () => answeredLate.resolve(read(EXTRA_ROWS)))

    const failedLate = deferred<Read>()
    vi.mocked(readDays).mockReturnValueOnce(failedLate.promise)
    const second = draw({ win: 30 })
    await settle()
    second.unmount()
    await act(async () => failedLate.reject(new Error('가짜 실패')))
    await settle()

    expect(unhandled).not.toHaveBeenCalled()
  })
})

describe('AC-1306.2 소스 글자', () => {
  it('AC-1306.2: useAgainDays.ts·againView.ts는 브라우저 저장소·주소·lib/bridge/client·fetch(를 쓰지 않는다', () => {
    const ROOT = process.cwd()
    for (const file of ['src/components/stats/useAgainDays.ts', 'src/components/stats/againView.ts']) {
      const text = readFileSync(join(ROOT, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1')
      expect(text.length, `${file}: 빈 파일`).toBeGreaterThan(0)
      for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'history.', 'location.', 'useSearchParams', 'lib/bridge/client', 'fetch(']) {
        expect(text, `${file}: ${word}`).not.toContain(word)
      }
    }
  })
})
