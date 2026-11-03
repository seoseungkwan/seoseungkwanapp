// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rxCatalog, rxPeriodCounts } from '@/components/stats/rxPickView'
import { rxPickRows, statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { addRxPick, clearRxPicks, readRxPicks, removeRxPick } from '@/lib/storage/rxPicks'
import { readDays } from '@/lib/storage/stats'
import { nestedBoxes } from '@/testing/boxes'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { RxPick } from '@/types/rxPicks'
import { RxPickerSection } from './RxPickerSection'

// 조각을 잇는 칸 (rx-picker REQ-801·802·803·804·806·812). 저장은 가짜이고 메모리의 줄을 실제처럼 바꾼다. 처방·날 숫자는 모두 이 파일에서 지어낸 값이다

vi.mock('@/lib/storage/rxPicks', () => ({
  readRxPicks: vi.fn(),
  addRxPick: vi.fn(),
  removeRxPick: vi.fn(),
  clearRxPicks: vi.fn(),
}))
vi.mock('@/lib/storage/stats', () => ({
  readDays: vi.fn(),
  readCoverage: vi.fn(),
  readMonths: vi.fn(),
  saveStats: vi.fn(),
}))
// 어느 때 다시 세는지 본다. 셈은 진짜 그대로다
vi.mock('@/components/stats/rxPickView', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/stats/rxPickView')>()
  return { ...actual, rxCatalog: vi.fn(actual.rxCatalog), rxPeriodCounts: vi.fn(actual.rxPeriodCounts) }
})
vi.mock('@/components/stats/view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/stats/view')>()
  return { ...actual, rxPickRows: vi.fn(actual.rxPickRows) }
})

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]
const HOSPITAL = '가짜정형외과의원'
const TITLE = '처방 골라 보기'
const DESC = '고른 처방만 건수와 신환율·재진율을 봐요'
const EMPTY_LINE = '자료 없음 · 불러오면 처방을 골라 볼 수 있어요.'
const READING = '고른 처방을 읽는 중이에요'
const KEPT = '고른 처방은 이 화면에 그대로 있어요.'
const HINT = '아직 고른 처방이 없어요'
const NO_RANGE = '불러온 숫자에 이 기간 자료가 없어요.'
const MEANING = '신환율 = 신환 ÷ 건수 · 재진율 = 재진 ÷ 건수'
const MORE = '처방 목록을 더 읽는 중이에요'
const WIDE_FAILED = '전체 처방 목록을 읽지 못해 지금 보는 기간의 처방만 보여요.'

const A: RxPick = { code: 'A100', name: '가짜처방 가' }
const B: RxPick = { code: 'B200', name: '가짜처방 나' }
const C: RxPick = { code: 'C300', name: '가짜처방 다' }
const OLD: RxPick = { code: 'Z900', name: '가짜처방 옛날' }

type Line = [line: RxPick, patients: number, newPatients?: number, returning?: number]
function day(ymd: string, lines: Line[]): DayPayload {
  const rx = lines.map(([{ code, name }, patients, newPatients = 0, returning = patients - newPatients]) => ({ code, name, type: '', patients, newPatients, returning }))
  const patients = rx.reduce((sum, line) => sum + line.patients, 0)
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients, newPatients: 0, returning: patients, unknown: 0 },
    rx,
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}

const PAGE_DAYS = [
  day('2026-10-20', [[A, 3, 1, 2]]),
  day('2026-11-10', [
    [A, 10, 2, 8],
    [B, 5, 1, 4],
  ]),
]
const inputOf = (days: readonly DayPayload[] = PAGE_DAYS, period: StatsPeriod = '30d', covered: DateRange[] = WHOLE): StatsInput => ({ days, covered, range: statsRange(TODAY, period) })
const NO_DAYS = inputOf([], '30d', [])

type Read = Awaited<ReturnType<typeof readDays>>
const read = (rows: DayPayload[] = []): Read => ({ rows, dropped: 0, latest: null, fromFile: false })

let stored: RxPick[]

beforeEach(() => {
  stored = []
  vi.mocked(readRxPicks).mockReset().mockImplementation(async () => [...stored])
  vi.mocked(addRxPick)
    .mockReset()
    .mockImplementation(async (pick) => {
      if (stored.some((row) => row.code.toUpperCase() === pick.code.toUpperCase())) return 'already'
      stored.push(pick)
      return 'added'
    })
  vi.mocked(removeRxPick)
    .mockReset()
    .mockImplementation(async (code) => {
      stored = stored.filter((row) => row.code !== code)
    })
  vi.mocked(clearRxPicks)
    .mockReset()
    .mockImplementation(async () => {
      stored = []
    })
  vi.mocked(readDays).mockReset().mockResolvedValue(read())
})

afterEach(cleanup)

type Over = Partial<{ input: StatsInput; saved: boolean; revision: number; className: string }>
const sectionOf = ({ input = inputOf(), saved = true, revision = 0, className = 'col-span-12' }: Over = {}) => <RxPickerSection input={input} saved={saved} hospitalName={HOSPITAL} revision={revision} className={className} />
const draw = (over: Over = {}) => render(sectionOf(over))

const flush = () => act(async () => {})
const box = () => screen.getByRole('combobox')
const ready = () => waitFor(() => expect(box().getAttribute('aria-disabled')).toBeNull())
async function drawReady(over: Over = {}) {
  const view = draw(over)
  await ready()
  return view
}
const openList = () => fireEvent.click(box())
const option = (name: RegExp | string) => screen.getByRole('option', { name: typeof name === 'string' ? new RegExp(name) : name })
const optionNames = () => screen.queryAllByRole('option').map((node) => node.textContent ?? '')
const pressOption = async (name: string) => {
  fireEvent.click(option(name))
  await flush()
}
const chip = (name: string) => screen.getByRole('button', { name: `${name} 빼기` })
const chipNames = () => screen.queryAllByRole('button', { name: / 빼기$/ }).map((node) => (node.getAttribute('aria-label') ?? '').replace(/ 빼기$/, ''))
// 표 줄 단추: li 바로 아래다([자세히]는 열린 칸 안에 있다)
const rowButtons = () => screen.queryAllByRole('button').filter((node) => node.hasAttribute('aria-expanded') && node.parentElement?.tagName === 'LI')
const rowOf = (name: string) => rowButtons().find((node) => node.textContent?.startsWith(name))
const rowNames = () => rowButtons().map((node) => node.querySelector('.font-semibold')?.textContent)
const panelOf = (row: HTMLElement) => document.getElementById(row.getAttribute('aria-controls') ?? '')!
const modeOf = (row: HTMLElement) => within(panelOf(row)).getByRole('button', { name: '건수만' }).getAttribute('aria-pressed') === 'true' ? 'total' : 'split'
const pressRow = (name: string) => fireEvent.click(rowOf(name)!)
const pressSplit = (name: string) => fireEvent.click(within(panelOf(rowOf(name)!)).getByRole('button', { name: '신환·재진 나눠 보기' }))
const pageText = () => document.body.textContent ?? ''

describe('AC-801: 칸 틀', () => {
  it('AC-801.1: h2와 옆 설명이 있고 받은 자리(전체 폭)에 놓인다', async () => {
    await drawReady()
    const head = screen.getByRole('heading', { level: 2, name: TITLE })
    expect(head.closest('section')!.className).toMatch(/(^| )col-span-12( |$)/)
    expect(screen.getByText(DESC).parentElement).toBe(head.parentElement)
  })

  it('AC-801.3: 저장된 숫자가 없으면 그 한 줄뿐이고 찾기 칸·칩·표·설명이 없다', async () => {
    stored = [A]
    const { container } = draw({ saved: false, input: NO_DAYS })
    await flush()
    expect(container.querySelector('section')!.textContent).toBe(`${TITLE}${EMPTY_LINE}`)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-801.3: 읽기에 실패해도 저장된 숫자가 없으면 그 한 줄뿐이다', async () => {
    vi.mocked(readRxPicks).mockRejectedValue(new Error('가짜 실패'))
    const { container } = draw({ saved: false, input: NO_DAYS })
    await flush()
    expect(container.querySelector('section')!.textContent).toBe(`${TITLE}${EMPTY_LINE}`)
  })

  it('AC-801.4: 시안에서만 쓰는 표시가 어느 상태에도 없다', async () => {
    stored = [A, B]
    await drawReady()
    openList()
    pressRow(A.name)
    await flush()
    const text = pageText()
    for (const word of ['새 칸', '시안에서만 보이는 줄', '제가 정한 부분', '예시']) expect(text).not.toContain(word)
    expect(screen.queryByText('새 칸')).toBeNull()
  })
})

describe('AC-812: 저장 상태', () => {
  it('AC-812.1: 읽는 동안 찾기 칸이 막혀 있고 안내가 나오며 빈 안내를 먼저 보이지 않는다', () => {
    vi.mocked(readRxPicks).mockImplementation(() => new Promise(() => undefined))
    draw()
    expect(box().getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('status').textContent).toContain(READING)
    expect(pageText()).not.toContain(HINT)
    openList()
    expect(box().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('option')).toBeNull()
    expect(vi.mocked(readDays)).not.toHaveBeenCalled()
  })

  it('AC-812.2: 저장된 차례대로 칩과 표가 나오고, 내렸다가 같은 저장으로 다시 그리면(다른 기기) 같은 처방이 같은 차례다', async () => {
    stored = [B, A]
    const first = await drawReady()
    expect(pageText()).not.toContain(READING)
    expect(chipNames()).toEqual([B.name, A.name])
    expect(rowNames()).toEqual([B.name, A.name])

    first.unmount()

    await drawReady()
    expect(chipNames()).toEqual([B.name, A.name])
    expect(rowNames()).toEqual([B.name, A.name])
  })

  it('AC-812.2: 화면에서 고른 처방을 내렸다가 다시 그려도 고른 차례대로 나온다', async () => {
    const first = await drawReady()
    openList()
    await pressOption(B.name)
    await pressOption(A.name)
    await flush()
    expect(stored).toEqual([B, A])
    first.unmount()
    await drawReady()
    expect(chipNames()).toEqual([B.name, A.name])
    expect(rowNames()).toEqual([B.name, A.name])
  })

  it('AC-812.3: 읽기에 실패하면 오류 카드와 [다시 읽기]가 있고 찾기 칸은 막혀 있으며 "없다"로 보이지 않는다. 누르면 다시 읽는다', async () => {
    stored = [A]
    vi.mocked(readRxPicks).mockRejectedValueOnce(new Error('가짜 실패'))
    draw()
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('고른 처방을 읽지 못했어요')
    expect(card.textContent).toContain('오류 번호 E-STATS-PICK-READ-FAILED')
    expect(box().getAttribute('aria-disabled')).toBe('true')
    expect(pageText()).not.toContain(HINT)
    expect(chipNames()).toEqual([])
    openList()
    expect(box().getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(pageText()).toContain(READING)
    expect(screen.queryByRole('alert')).toBeNull()
    await ready()
    expect(chipNames()).toEqual([A.name])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-812.5: 저장에 실패해도 고른 처방이 그대로이고 오류 카드·[다시 저장]·안내가 있다. 누르면 다시 가고 성공하면 사라진다', async () => {
    vi.mocked(addRxPick).mockRejectedValueOnce(new Error('가짜 실패'))
    await drawReady()
    openList()
    await pressOption(A.name)
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('고른 처방을 저장하지 못했어요')
    expect(card.textContent).toContain('오류 번호 E-STATS-PICK-SAVE-FAILED')
    expect(screen.getByText(KEPT)).toBeTruthy()
    expect(chipNames()).toEqual([A.name])
    expect(rowNames()).toEqual([A.name])
    expect(stored).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.queryByText(KEPT)).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull()
    expect(stored).toEqual([A])
    expect(chipNames()).toEqual([A.name])
  })

  it('AC-812.5: 저장에 실패한 뒤 다음 고르기를 하면 멈춘 요청부터 차례대로 가고 모두 성공하면 카드가 사라진다', async () => {
    vi.mocked(addRxPick).mockRejectedValueOnce(new Error('가짜 실패'))
    await drawReady()
    openList()
    await pressOption(A.name)
    await screen.findByRole('alert')
    await pressOption(B.name)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(stored).toEqual([A, B])
    expect(chipNames()).toEqual([A.name, B.name])
  })

  it('AC-812.6: 이 기능의 파일은 브라우저 저장소·주소·lib/bridge/client를 쓰지 않는다', () => {
    const ROOT = process.cwd()
    const sections = 'src/components/stats/sections'
    const files = [
      'src/components/stats/useRxPicks.ts',
      'src/components/stats/useRxCatalog.ts',
      ...readdirSync(join(ROOT, sections))
        .filter((name) => /^RxPick.*\.tsx$/.test(name) && !name.includes('.test.'))
        .map((name) => `${sections}/${name}`),
    ]
    for (const name of ['RxPickSearch.tsx', 'RxPickTable.tsx', 'RxPickDetail.tsx', 'RxPickerSection.tsx']) expect(files).toContain(`${sections}/${name}`)
    for (const file of files) {
      const text = readFileSync(join(ROOT, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1')
      for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'history.', 'location.', 'useSearchParams', 'lib/bridge/client', 'fetch(']) {
        expect(text, `${file}: ${word}`).not.toContain(word)
      }
    }
  })
})

describe('AC-802: 찾기 칸과 목록을 잇기', () => {
  it('AC-802.2: 목록 줄의 건수는 이 기간 건수이고 고른 처방은 `고름`이다', async () => {
    stored = [A]
    await drawReady()
    openList()
    await flush()
    expect(option(A.name).textContent).toContain('13건')
    expect(option(A.name).getAttribute('aria-selected')).toBe('true')
    expect(option(A.name).textContent).toContain('고름')
    expect(option(B.name).textContent).toContain('5건')
    expect(option(B.name).getAttribute('aria-selected')).toBe('false')
  })

  it('AC-802.5: 열기 전에는 넓게 읽지 않고, 처음 열 때 한 번 읽어 기간 밖 처방도 0건으로 나오며 다시 열어도 더 읽지 않는다', async () => {
    vi.mocked(readDays).mockResolvedValue(read([day('2025-06-02', [[OLD, 9, 1, 8]])]))
    await drawReady()
    expect(readDays).not.toHaveBeenCalled()
    openList()
    await waitFor(() => expect(screen.queryByText(MORE)).toBeNull())
    const widest = statsRange(TODAY, '12m')
    expect(vi.mocked(readDays).mock.calls).toEqual([[{ from: widest.previous.from, to: widest.current.to }]])
    expect(option(OLD.name).textContent).toContain('0건')

    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    openList()
    await flush()
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-802.5: 같은 날이 넓은 읽기와 화면 숫자에 다 있으면 화면 숫자의 이름이다', async () => {
    const SAME_DAY = '2026-11-10'
    vi.mocked(readDays).mockResolvedValue(read([day(SAME_DAY, [[{ code: A.code, name: '가짜처방 넓은 읽기' }, 1]])]))
    await drawReady()
    openList()
    await waitFor(() => expect(screen.queryByText(MORE)).toBeNull())
    expect(screen.queryByRole('option', { name: /넓은 읽기/ })).toBeNull()
    expect(option(A.name)).toBeTruthy()
  })

  it('AC-802.5: 고르거나 줄을 열어도 일 줄을 다시 훑지 않는다(찾기 목록·표·건수 셈은 입력이 바뀔 때만)', async () => {
    vi.mocked(readDays).mockResolvedValue(read([day('2025-06-02', [[OLD, 9, 1, 8]])]))
    await drawReady()
    openList()
    await waitFor(() => expect(screen.queryByText(MORE)).toBeNull())
    vi.mocked(rxCatalog).mockClear()
    vi.mocked(rxPeriodCounts).mockClear()

    await pressOption(A.name)
    expect(vi.mocked(rxCatalog).mock.calls.length).toBeGreaterThan(0) // 고른 처방은 목록에 더해진다
    for (const [days] of vi.mocked(rxCatalog).mock.calls) expect(days).toEqual([])
    expect(rxPeriodCounts).not.toHaveBeenCalled()

    vi.mocked(rxCatalog).mockClear()
    vi.mocked(rxPickRows).mockClear()
    pressRow(A.name)
    expect(rowOf(A.name)!.getAttribute('aria-expanded')).toBe('true')
    expect(rxCatalog).not.toHaveBeenCalled()
    expect(rxPickRows).not.toHaveBeenCalled()
    expect(rxPeriodCounts).not.toHaveBeenCalled()
  })

  it('AC-802.6: 넓은 범위를 읽는 중이면 화면 숫자의 처방과 고른 처방이 먼저 나온다', async () => {
    stored = [OLD]
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    await drawReady()
    openList()
    expect(screen.getByText(MORE)).toBeTruthy()
    expect(optionNames().map((text) => text.slice(0, 6))).toEqual([A.name, B.name, OLD.name].map((name) => name.slice(0, 6)))
  })

  it('AC-802.6: 넓은 읽기에 실패해도 같은 줄이 나오고 [다시 읽기]로 다시 읽으며 표·칩은 그대로다', async () => {
    stored = [A]
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    await drawReady()
    openList()
    expect(await screen.findByText(WIDE_FAILED)).toBeTruthy()
    expect(option(B.name)).toBeTruthy()
    expect(chipNames()).toEqual([A.name])
    expect(rowNames()).toEqual([A.name])

    vi.mocked(readDays).mockResolvedValueOnce(read([day('2025-06-02', [[OLD, 9, 1, 8]])]))
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(await screen.findByRole('option', { name: new RegExp(OLD.name) })).toBeTruthy()
    expect(screen.queryByText(WIDE_FAILED)).toBeNull()
  })

  it('AC-802.7: revision이 바뀌면 닫힌 목록은 다음에 열 때 다시 읽는다. 그 전에도 화면 숫자의 처방은 나온다', async () => {
    const view = await drawReady()
    openList()
    await waitFor(() => expect(readDays).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    await flush()

    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    view.rerender(sectionOf({ revision: 1 }))
    await flush()
    expect(readDays).toHaveBeenCalledTimes(1)

    openList()
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(option(A.name)).toBeTruthy()
    expect(screen.getByText(MORE)).toBeTruthy()
  })

  it('AC-802.7: revision이 바뀔 때 목록이 열려 있으면 바로 다시 읽고, 늦게 온 앞 답은 쓰지 않는다', async () => {
    let answerFirst!: (value: Read) => void
    vi.mocked(readDays).mockImplementationOnce(() => new Promise((yes) => (answerFirst = yes)))
    const view = await drawReady()
    openList()
    await waitFor(() => expect(readDays).toHaveBeenCalledTimes(1))

    vi.mocked(readDays).mockResolvedValueOnce(read([day('2025-06-02', [[OLD, 9, 1, 8]])]))
    view.rerender(sectionOf({ revision: 1 }))
    await waitFor(() => expect(readDays).toHaveBeenCalledTimes(2))
    await screen.findByRole('option', { name: new RegExp(OLD.name) })

    await act(async () => answerFirst(read([day('2025-07-02', [[C, 4]])])))
    expect(screen.queryByRole('option', { name: new RegExp(C.name) })).toBeNull()
    expect(option(OLD.name)).toBeTruthy()
  })

  it('AC-802.11·AC-811.1: 저장 검사에 걸리는 처방 줄은 목록에 없다', async () => {
    const BAD: RxPick = { code: '010-1234-5678', name: '가짜 전화 모양' }
    await drawReady({ input: inputOf([day('2026-11-10', [[A, 3], [BAD, 1]])]) })
    openList()
    await flush()
    expect(option(A.name)).toBeTruthy()
    expect(screen.queryByRole('option', { name: /전화 모양/ })).toBeNull()
  })

  it('AC-802.11: 가장 최근 줄이 저장 검사에 걸려도 그 전 날의 이름으로 목록에 남는다', async () => {
    const LATER_BAD: RxPick = { code: A.code, name: '가짜 010-1234-5678' }
    await drawReady({
      input: inputOf([day('2026-10-20', [[A, 3]]), day('2026-11-10', [[LATER_BAD, 1]])]),
    })
    openList()
    await flush()
    expect(option(A.name)).toBeTruthy()
    expect(screen.queryByRole('option', { name: /010-1234-5678/ })).toBeNull()
  })

  it('AC-802.12: 저장 abc에 목록 줄 ABC는 고른 줄이고 누르면 저장된 코드로 뺀다', async () => {
    stored = [{ code: 'abc', name: '가짜처방 소문자' }]
    const UPPER: RxPick = { code: 'ABC', name: '가짜처방 대문자' }
    await drawReady({ input: inputOf([day('2026-11-10', [[UPPER, 7, 1, 6]])]) })
    openList()
    await flush()
    expect(optionNames()).toHaveLength(1)
    expect(option(UPPER.name).getAttribute('aria-selected')).toBe('true')
    await pressOption(UPPER.name)
    expect(removeRxPick).toHaveBeenCalledWith('abc')
    expect(addRxPick).not.toHaveBeenCalled()
    expect(chipNames()).toEqual([])
  })

  it('AC-802.8: 빼기·다시 고르기로 그래프 열림과 모양을 잊는다(목록 줄을 다시 누름). 글자가 지워지고 목록은 열린 채이고 초점은 칸에 있다', async () => {
    await drawReady()
    openList()
    fireEvent.change(box(), { target: { value: '가짜처방 가' } })
    await pressOption(A.name)
    expect((box() as HTMLInputElement).value).toBe('')
    expect(box().getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(box())
    expect(rowNames()).toEqual([A.name])

    pressRow(A.name)
    pressSplit(A.name)
    expect(modeOf(rowOf(A.name)!)).toBe('split')

    await pressOption(A.name) // 뺀다
    expect(rowOf(A.name)).toBeUndefined()
    expect(box().getAttribute('aria-expanded')).toBe('true')

    await pressOption(A.name) // 다시 고른다
    expect(rowOf(A.name)!.getAttribute('aria-expanded')).toBe('false')
    pressRow(A.name)
    expect(modeOf(rowOf(A.name)!)).toBe('total')
  })

  it('AC-802.8: 저장 abc를 표에서 열고 목록 줄 ABC로 빼도 그래프 열림을 잊는다', async () => {
    stored = [{ code: 'abc', name: '가짜처방 소문자' }]
    const UPPER: RxPick = { code: 'ABC', name: '가짜처방 대문자' }
    await drawReady({ input: inputOf([day('2026-11-10', [[UPPER, 7, 1, 6]])]) })
    pressRow(UPPER.name)
    pressSplit(UPPER.name)
    openList()
    await flush()
    await pressOption(UPPER.name) // 뺀다
    expect(removeRxPick).toHaveBeenCalledWith('abc')
    await pressOption(UPPER.name) // 다시 고른다
    expect(rowOf(UPPER.name)!.getAttribute('aria-expanded')).toBe('false')
    pressRow(UPPER.name)
    expect(modeOf(rowOf(UPPER.name)!)).toBe('total')
  })

  it('AC-802.8·AC-804.10: 250개를 골라도 칩과 표 줄이 모두 있다', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ code: `M${i}`, name: `가짜처방 ${i}` }))
    stored = many
    await drawReady()
    expect(chipNames()).toHaveLength(250)
    expect(rowButtons()).toHaveLength(250)
  })

  it('AC-802.9: ↓와 Enter로 고르면 표에 더해진다', async () => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true })
    try {
      await drawReady()
      fireEvent.keyDown(box(), { key: 'ArrowDown' })
      fireEvent.keyDown(box(), { key: 'ArrowDown' })
      fireEvent.keyDown(box(), { key: 'ArrowDown' })
      fireEvent.keyDown(box(), { key: 'Enter' })
      await flush()
      expect(rowNames()).toEqual([B.name])
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView
    }
  })
})

describe('AC-803: 칩을 잇기', () => {
  it('AC-803.1·AC-804.5: 칩 이름은 그 처방 표 줄의 이름이다(이 기간 가장 최근 이름, 없으면 저장해 둔 이름)', async () => {
    stored = [
      { code: A.code, name: '가짜처방 저장해 둔 옛 이름' },
      { code: OLD.code, name: OLD.name },
    ]
    await drawReady()
    expect(chipNames()).toEqual([A.name, OLD.name])
    expect(rowNames()).toEqual([A.name, OLD.name])
    expect(rowOf(OLD.name)!.textContent).toContain('0건')
  })

  it('AC-803.2: 칩 빼기로 칩과 표 줄이 사라지고 초점은 칸에 오며 목록은 닫혀 있다. 다시 고르면 맨 뒤이고 그래프는 닫힌 채다', async () => {
    stored = [A, B]
    await drawReady()
    pressRow(A.name)
    pressSplit(A.name)
    fireEvent.click(chip(A.name))
    await flush()
    expect(chipNames()).toEqual([B.name])
    expect(rowNames()).toEqual([B.name])
    expect(document.activeElement).toBe(box())
    expect(box().getAttribute('aria-expanded')).toBe('false')
    expect(removeRxPick).toHaveBeenCalledWith(A.code)

    openList()
    await pressOption(A.name)
    expect(chipNames()).toEqual([B.name, A.name])
    expect(rowNames()).toEqual([B.name, A.name])
    expect(rowOf(A.name)!.getAttribute('aria-expanded')).toBe('false')
    pressRow(A.name)
    expect(modeOf(rowOf(A.name)!)).toBe('total')
  })

  it('AC-803.3: [모두 지우기]로 묻지 않고 모두 빠지고 빈 안내가 나온다. 다시 고르면 그래프는 닫힌 채다', async () => {
    stored = [A, B]
    await drawReady()
    pressRow(A.name)
    pressSplit(A.name)
    pressRow(B.name)
    fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }))
    await flush()
    expect(stored).toEqual([])
    expect(rowButtons()).toEqual([])
    expect(chipNames()).toEqual([])
    expect(screen.getByText(HINT)).toBeTruthy()
    expect(document.activeElement).toBe(box())

    openList()
    await pressOption(A.name)
    await pressOption(B.name)
    expect(rowOf(A.name)!.getAttribute('aria-expanded')).toBe('false')
    expect(rowOf(B.name)!.getAttribute('aria-expanded')).toBe('false')
    pressRow(A.name)
    expect(modeOf(rowOf(A.name)!)).toBe('total')
  })

  it('AC-803.4: 고른 처방이 없으면 빈 안내만 한 번 있고 칩·표·[표 복사]·이 기간 자료 없음 안내가 없다', async () => {
    await drawReady()
    expect(screen.getAllByText(HINT)).toHaveLength(1)
    expect(chipNames()).toEqual([])
    expect(screen.queryByRole('button', { name: '표 복사' })).toBeNull()
    expect(pageText()).not.toContain(MEANING)
    expect(pageText()).not.toContain(NO_RANGE)
  })

  it('AC-803.4: 고른 처방도 이 기간 줄도 없으면 빈 안내만 있다', async () => {
    await drawReady({ input: NO_DAYS })
    expect(screen.getAllByText(HINT)).toHaveLength(1)
    expect(pageText()).not.toContain(NO_RANGE)
  })
})

describe('AC-804·AC-805: 표를 잇기', () => {
  it('AC-804.11: 고른 처방이 있고 이 기간 날 줄이 없으면 칩은 남고 표·[표 복사] 대신 안내가 나온다', async () => {
    stored = [A]
    await drawReady({ input: NO_DAYS })
    expect(chipNames()).toEqual([A.name])
    expect(screen.getByText(/불러온 숫자에 이 기간 자료가 없어요\./).textContent).toContain(`자료 없음 · ${NO_RANGE}`)
    expect(rowButtons()).toEqual([])
    expect(screen.queryByRole('button', { name: '표 복사' })).toBeNull()
    expect(pageText()).not.toContain(MEANING)
    expect(pageText()).not.toContain('0건')
  })

  it('AC-804.11: 이 기간에 없는 처방이어도 다른 처방의 날 줄이 있으면 0건 줄이다(자료 없음이 아니다)', async () => {
    stored = [OLD]
    await drawReady()
    expect(rowOf(OLD.name)!.textContent).toContain('0건')
    expect(pageText()).not.toContain(NO_RANGE)
  })

  it('AC-804.9: 둘 이상 고르면 합계가 있고 건수가 줄의 합이다. 하나면 없다', async () => {
    stored = [A, B]
    await drawReady()
    expect(screen.getByText('합계').closest('li')!.textContent).toContain('18건')
    expect(screen.getByText('2가지')).toBeTruthy()
    fireEvent.click(chip(B.name))
    await flush()
    expect(screen.queryByText('합계')).toBeNull()
  })

  it('AC-808.1: 복사 글의 첫 줄에 의원 이름이 있다', async () => {
    stored = [A]
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    try {
      await drawReady()
      fireEvent.click(screen.getByRole('button', { name: '표 복사' }))
      await flush()
      expect(writeText.mock.calls[0]![0].split('\n')[0]).toBe(`${HOSPITAL} 처방 골라 보기`)
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  it('AC-805.9: 표를 열고 오류 카드까지 보여도 상자 안 상자가 없다', async () => {
    stored = [A]
    vi.mocked(addRxPick).mockRejectedValueOnce(new Error('가짜 실패'))
    const { container } = await drawReady()
    pressRow(A.name)
    fireEvent.click(within(panelOf(rowOf(A.name)!)).getByRole('button', { name: '자세히' }))
    openList()
    await pressOption(B.name)
    await screen.findByRole('alert')
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('AC-806: 줄을 눌러 여는 그래프를 잇기', () => {
  it('AC-806.1: 줄을 누르면 바로 아래 칸이 열리고 다시 누르면 닫힌다', async () => {
    stored = [A, B]
    await drawReady()
    const row = rowOf(A.name)!
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(panelOf(row).hidden).toBe(true)
    pressRow(A.name)
    expect(rowOf(A.name)!.getAttribute('aria-expanded')).toBe('true')
    expect(panelOf(row).hidden).toBe(false)
    expect(row.nextElementSibling).toBe(panelOf(row))
    expect(within(panelOf(row)).getByText(`${A.name} · 일별 건수`)).toBeTruthy()
    expect(modeOf(row)).toBe('total')
    pressRow(A.name)
    expect(rowOf(A.name)!.getAttribute('aria-expanded')).toBe('false')
    expect(panelOf(row).hidden).toBe(true)
  })

  it('AC-806.1: 이름이 비어 있으면 머리에 코드가 나온다(빈 머리 ` · 일별 건수` 없음)', async () => {
    stored = [
      { code: 'E100', name: '' },
      { code: 'E200', name: '   ' },
    ]
    await drawReady()
    for (const code of ['E100', 'E200']) {
      const row = rowButtons().find((node) => node.textContent?.includes(code))!
      fireEvent.click(row)
      expect(within(panelOf(row)).getByText(`${code} · 일별 건수`)).toBeTruthy()
    }
    expect(screen.queryByText(/^\s*· 일별 건수/)).toBeNull()
  })

  it('AC-806.1: 저장 abc·날 줄 ABC이면 열린 칸의 숫자가 그 처방 것이다', async () => {
    stored = [{ code: 'abc', name: '가짜처방 소문자' }]
    const UPPER: RxPick = { code: 'ABC', name: '가짜처방 대문자' }
    await drawReady({ input: inputOf([day('2026-11-10', [[UPPER, 7, 1, 6]])]) })
    pressRow(UPPER.name)
    const panel = panelOf(rowOf(UPPER.name)!)
    fireEvent.click(within(panel).getByRole('button', { name: '자세히' }))
    expect(within(within(panel).getByRole('table', { name: `${UPPER.name} 일별 건수` })).getByText('7건')).toBeTruthy()
  })

  it('AC-806.5: 여러 줄을 같이 열고, 기간을 바꾸면 열린 줄·모양이 그대로이고 새 칸(일↔주↔달)으로 그린다', async () => {
    stored = [A, B, C]
    const view = await drawReady()
    pressRow(A.name)
    pressRow(B.name)
    pressSplit(A.name)
    expect(rowOf(A.name)!.getAttribute('aria-expanded')).toBe('true')
    expect(rowOf(B.name)!.getAttribute('aria-expanded')).toBe('true')
    expect(rowOf(C.name)!.getAttribute('aria-expanded')).toBe('false')

    for (const [period, grain] of [
      ['90d', '주'],
      ['12m', '달'],
      ['7d', '일'],
    ] as const) {
      view.rerender(sectionOf({ input: inputOf(PAGE_DAYS, period) }))
      expect(within(panelOf(rowOf(A.name)!)).getByText(`${A.name} · ${grain}별 건수`)).toBeTruthy()
      expect(within(panelOf(rowOf(B.name)!)).getByText(`${B.name} · ${grain}별 건수`)).toBeTruthy()
      expect(modeOf(rowOf(A.name)!)).toBe('split')
      expect(modeOf(rowOf(B.name)!)).toBe('total')
      expect(rowOf(C.name)!.getAttribute('aria-expanded')).toBe('false')
    }
  })

  it('AC-806.5: 줄을 닫았다 열어도(뺀 것이 아니면) 그래프 모양이 그대로다', async () => {
    stored = [A]
    await drawReady()
    pressRow(A.name)
    pressSplit(A.name)
    pressRow(A.name)
    pressRow(A.name)
    expect(modeOf(rowOf(A.name)!)).toBe('split')
  })
})
