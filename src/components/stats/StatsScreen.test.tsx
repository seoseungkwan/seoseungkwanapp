// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCoverage, readDays, readMonths, saveStats } from '@/lib/storage/stats'
import { toDayPayloads } from '@/lib/payload/toDayPayloads'
import { toMonthPayload } from '@/lib/payload/toMonthPayload'
import { nestedBoxes } from '@/testing/boxes'
import type { AnalysisResult, FileReport } from '@/types/analyze'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import type { ClinicReportNumbers } from '@/types/clinicReport'
import type { DayPayload } from '@/types/payload'
import type { RxSplitView, StatsLoaded, StatsWorkerMessage, StatsWorkerRequest } from '@/types/stats'
import { runAnalysis } from '@/workers/runAnalysis'
import { createStatsWorker } from '@/workers/statsClient'
import { StatsScreen } from './StatsScreen'
import { statsRange } from './view'

// 통계 화면 (stats REQ-514, 시안 docs/mockups/stats/notes.md §2·§3). 가짜 Worker·가짜 chrome.runtime·가짜 저장으로 시험한다.
// 숫자·이름은 모두 가짜이고 이 파일 안에서만 만든다

vi.mock('@/lib/storage/stats', () => ({
  readDays: vi.fn(),
  readMonths: vi.fn(),
  readCoverage: vi.fn(),
  saveStats: vi.fn(),
}))
vi.mock('@/workers/statsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/workers/statsClient')>()),
  createStatsWorker: vi.fn(),
}))
vi.mock('@/workers/runAnalysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/workers/runAnalysis')>()),
  runAnalysis: vi.fn(),
}))
vi.mock('@/lib/payload/toMonthPayload', () => ({ toMonthPayload: vi.fn() }))
vi.mock('@/lib/payload/toDayPayloads', () => ({ toDayPayloads: vi.fn() }))

const TODAY = '2026-11-13' // 금요일
const HOSPITAL = '가짜정형외과의원'
const R30 = statsRange(TODAY, '30d')
const R12 = statsRange(TODAY, '12m')
const SHA = '0'.repeat(64)
const HELLO = { helperVersion: '0.1.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }
const LOAD = '비트에서 불러오기'
const FILE_NOTE = '파일 자료는 처방이 없는 접수와 같은 날 다시 접수한 건이 빠져 비트 PC 숫자보다 적을 수 있어요.'
const BIT_AT = { at: '2026-11-13T09:42:00Z', source: 'bit' as const } // 18:42
const FILE_AT = { at: '2026-11-12T09:30:00Z', source: 'file' as const } // 11월 12일 18:30
const SECTIONS = ['기간 요약', '환자 수 추이', '신환 재방문율', '처방 추세', '처방별 신환·재진', '원장님 보고 문장', '요일별 환자 수']

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

function numbers(period: string): ClinicReportNumbers {
  return {
    ok: true,
    period,
    totalVisits: 120,
    newPatients: 20,
    returnPatients: 100,
    totalAmount: 1000000,
    insurerAmount: 700000,
    noncoveredAmount: 300000,
    cashAmount: 100000,
    cardAmount: 200000,
    transferAmount: 0,
    treatments: { manual: 10, eswt: 5, carm: 3, sono: 2, cryo: 1 },
    laCodes: [],
    financeUnconfirmed: false,
    notes: [],
  }
}

const FRESH_ROW = day('2026-11-05', 77)
const LOADED: StatsLoaded = {
  range: R30.load,
  covered: { from: R30.load.from, to: '2026-11-12' },
  quality: 'valid',
  checks: { noChart: 0, duplicate: 0, noFirst: 0 },
  months: [],
  days: [FRESH_ROW],
  report: { daily: [numbers(TODAY)], monthly: [numbers('2026-11')] },
}
const INCOMPLETE: StatsLoaded = { ...LOADED, quality: 'incomplete', checks: { noChart: 3, duplicate: 1, noFirst: 2 }, months: null, days: null }
const SPLIT: RxSplitView = {
  kind: 'split',
  split: {
    from: R30.current.from,
    to: R30.current.to,
    visits: 3,
    patients: 2,
    newPatients: 1,
    returning: 1,
    lines: [{ code: 'R01', label: '가짜처방', newPatients: 1, returning: 1, total: 2 }],
    invalidCodes: 0,
  },
  days: [],
  text: '',
  headline: '가짜 머리 글',
}

class FakePort implements PortLike {
  sent: Record<string, unknown>[] = []
  private messageFns: ((m: unknown) => void)[] = []
  onMessage = { addListener: (fn: (m: unknown) => void) => void this.messageFns.push(fn) }
  onDisconnect = { addListener: () => undefined }
  postMessage(m: unknown) {
    this.sent.push(m as Record<string, unknown>)
  }
  disconnect() {}
  reply(m: unknown) {
    for (const fn of this.messageFns) fn(m)
  }
  last() {
    return this.sent[this.sent.length - 1]!
  }
}

function fakeChrome() {
  const port = new FakePort()
  const runtime: ChromeRuntimeLike = { connect: () => port }
  vi.stubGlobal('chrome', { runtime })
  return port
}

// 답을 바로 주는 가짜 Worker
function fakeWorker(view: StatsLoaded = LOADED, split: RxSplitView = SPLIT) {
  const sent: StatsWorkerRequest[] = []
  const worker = {
    onmessage: null as ((event: MessageEvent<StatsWorkerMessage>) => void) | null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage: vi.fn((message: StatsWorkerRequest) => {
      sent.push(message)
      const reply = (data: StatsWorkerMessage) => queueMicrotask(() => worker.onmessage?.({ data } as MessageEvent<StatsWorkerMessage>))
      if (message.type === 'load') reply({ type: 'loaded', streamId: message.streamId, view })
      if (message.type === 'split') reply({ type: 'split-result', streamId: message.streamId, view: split })
    }),
  }
  vi.mocked(createStatsWorker).mockReturnValue(worker as unknown as Worker)
  return { worker, sent }
}

type Read = Awaited<ReturnType<typeof readDays>>
const read = (rows: DayPayload[] = [], over: Partial<Read> = {}): Read => ({ rows, dropped: 0, latest: null, fromFile: false, ...over })
const answers = (byFrom: Record<string, Read>) => vi.mocked(readDays).mockImplementation(async (range) => byFrom[range.from] ?? read())
const SAVED_NOW = { [R30.current.from]: read([day('2026-11-01', 10), day('2026-11-02', 10)], { latest: BIT_AT }) }

const draw = () => render(<StatsScreen hospitalName={HOSPITAL} today={TODAY} />)
const pageText = () => document.body.textContent ?? ''
const heading = (name: string) => screen.queryByRole('heading', { name, level: 2 })
// 기다리는 칸에도 같은 제목이 있어 "불러오는 중"이 없어질 때까지 본다
const sectionsShown = () =>
  waitFor(() => {
    expect(heading('기간 요약')).toBeTruthy()
    expect(screen.queryByText('불러오는 중')).toBeNull()
  })
const periodButtons = () => within(screen.getByRole('group', { name: '기간' })).getAllByRole('button')
const pressPeriod = (name: string) => fireEvent.click(within(screen.getByRole('group', { name: '기간' })).getByRole('button', { name }))

function sayHello(port: FakePort) {
  act(() => port.reply({ v: 1, id: port.last().id, type: 'result', data: HELLO }))
}

// 통로에 온 stats.rows 요청을 끝낸다(조각은 Worker 포트로만 간다)
function finishStream(port: FakePort, chunks: string[] = []) {
  const request = port.last()
  expect(request.cmd).toBe('stats.rows')
  act(() => {
    chunks.forEach((data, seq) => port.reply({ v: 1, id: request.id, type: 'chunk', seq, data }))
    port.reply({ v: 1, id: request.id, type: 'end', count: chunks.length, bytes: 0, sha256: SHA })
  })
  return request
}

async function drawReady() {
  const port = fakeChrome()
  const fake = fakeWorker()
  draw()
  sayHello(port)
  await sectionsShown()
  return { port, fake }
}

function pressLoad(port: FakePort, chunks?: string[]) {
  fireEvent.click(screen.getByRole('button', { name: LOAD }))
  return finishStream(port, chunks)
}

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement
const fakeFile = (name = '가짜환자이름.xlsx') => new File(['가짜'], name)
const OK_REPORT: FileReport = {
  index: 0,
  ok: true,
  period: { from: '2026-11-01', to: '2026-11-10' },
  range: { from: '2026-11-01', to: '2026-11-10' },
  rowCount: 3,
  skippedSummaryRows: 0,
  invalidRows: 0,
  unknownVisitRows: 0,
  staleDays: null,
}

const splitNamed = (label: string): RxSplitView =>
  SPLIT.kind === 'split' ? { ...SPLIT, split: { ...SPLIT.split, lines: [{ code: 'R01', label, newPatients: 1, returning: 1, total: 2 }] } } : SPLIT

// 처방별 답을 시험이 손으로 주는 가짜 Worker(앞뒤가 바뀌어 오는 답을 본다). 불러오기 답도 바꿀 수 있다
function handWorker(first: StatsLoaded = LOADED) {
  let view = first
  const { worker } = fakeWorker()
  const splits: string[] = []
  const send = (data: StatsWorkerMessage) => worker.onmessage?.({ data } as MessageEvent<StatsWorkerMessage>)
  worker.postMessage.mockImplementation((message: StatsWorkerRequest) => {
    if (message.type === 'load') queueMicrotask(() => send({ type: 'loaded', streamId: message.streamId, view }))
    if (message.type === 'split') splits.push(message.streamId)
  })
  return {
    splits,
    nextLoad: (next: StatsLoaded) => {
      view = next
    },
    answerSplit: (at: number, label: string) =>
      act(async () => {
        send({ type: 'split-result', streamId: splits[at]!, view: splitNamed(label) })
      }),
    failSplit: (at: number) =>
      act(async () => {
        send({ type: 'failed', streamId: splits[at]!, code: 'E-ANALYZE-FAILED' })
      }),
  }
}

const loadIsFree = () => waitFor(() => expect(screen.getByRole('button', { name: LOAD }).getAttribute('aria-disabled')).toBeNull())
const flush = () => act(async () => {})

// 불러와 첫 처방별 답까지 받은 상태
async function loadedWithSplit() {
  const port = fakeChrome()
  const hand = handWorker()
  draw()
  sayHello(port)
  await sectionsShown()
  pressLoad(port)
  await waitFor(() => expect(hand.splits).toHaveLength(1))
  await hand.answerSplit(0, '가짜처방하나')
  await screen.findByText('가짜처방하나')
  await sectionsShown()
  await loadIsFree()
  return { port, hand }
}

// 첫 저장이 실패해 [다시 저장]이 보이는 상태(저장된 10·10명 + 방금 만든 77명 = 하루 평균 32명)
async function saveFailedOnce() {
  const { port, fake } = await drawReady()
  vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
  pressLoad(port)
  await screen.findByRole('button', { name: '다시 저장' })
  await loadIsFree()
  return { port, fake }
}

function fileGoesWell() {
  vi.mocked(runAnalysis).mockResolvedValue({ files: [OK_REPORT], result: { quality: 'valid', skippedInvalidRows: 0 } as AnalysisResult })
  vi.mocked(toMonthPayload).mockReturnValue([])
  vi.mocked(toDayPayloads).mockReturnValue([FRESH_ROW])
}

beforeEach(() => {
  for (const fn of [readDays, readMonths, readCoverage, saveStats, createStatsWorker, runAnalysis, toMonthPayload, toDayPayloads]) vi.mocked(fn).mockReset()
  answers(SAVED_NOW)
  vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-09-01', to: '2026-11-12' }])
  vi.mocked(saveStats).mockResolvedValue({ saved: 1 })
  fakeWorker()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AC-514.1 첫 그림', () => {
  it('AC-514.1 읽는 동안 섹션 자리는 일곱 칸 모두 "불러오는 중"이고 머리·기간은 먼저 보인다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    expect(screen.getByRole('heading', { name: '통계', level: 1 })).toBeTruthy()
    expect(screen.getByRole('group', { name: '기간' })).toBeTruthy()
    for (const name of SECTIONS) expect(heading(name)).toBeTruthy()
    expect(screen.getAllByText('불러오는 중')).toHaveLength(SECTIONS.length)
    expect(pageText()).not.toContain('아직 저장된 통계가 없어요')
  })

  it('AC-514.1·AC-513.1 읽으면 섹션을 승인본 차례대로 그리고 readMonths를 쓰지 않는다', async () => {
    draw()
    await sectionsShown()
    expect(screen.queryByText('불러오는 중')).toBeNull()
    const order = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)
    expect(order).toEqual(SECTIONS)
    expect(pageText()).toContain('하루 평균 환자 수')
    expect(readMonths).not.toHaveBeenCalled()
  })

  it('AC-514.1 저장된 숫자가 하나도 없으면 맨 위 안내와 빈 섹션이고, 처방별·보고는 비트 PC 안내다', async () => {
    answers({})
    draw()
    expect(await screen.findByText('아직 저장된 통계가 없어요')).toBeTruthy()
    expect(screen.getByText('비트 PC에서 [비트에서 불러오기]를 누르거나, 비트에서 내보낸 파일을 넣으면 숫자가 채워져요. 한 번 저장하면 휴대폰에서도 볼 수 있어요.')).toBeTruthy()
    expect(pageText()).toContain('숫자를 불러오면 이 기간의 평균 환자 수와 신환·재진이 보여요.')
    expect(screen.getAllByText('비트 PC에서 불러오면 보여요')).toHaveLength(2)
    expect(pageText()).toContain('자료: 아직 저장된 숫자가 없어요')
  })

  it('AC-513.4 저장된 숫자는 있는데 고른 기간에 자료가 없으면 맨 위 안내 없이 notes §4 글이다', async () => {
    answers({ [R12.previous.from]: read([day('2025-01-05')]) })
    draw()
    await sectionsShown()
    await waitFor(() => expect(pageText()).toContain('불러온 숫자에 이 기간 자료가 없어요.'))
    expect(pageText()).not.toContain('아직 저장된 통계가 없어요')
    expect(pageText()).not.toContain('숫자를 불러오면 이 기간의')
  })

  it('AC-514.1 읽기 실패는 오류 카드 + [다시 읽기]이고 섹션을 그리지 않으며, 누르면 다시 읽어 그린다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    draw()
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-STATS-READ-FAILED')
    expect(card.textContent).toContain('저장된 통계를 읽지 못했어요')
    expect(heading('기간 요약')).toBeNull()
    expect(screen.queryByRole('group', { name: '기간' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    await sectionsShown()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-514.2 기간 단추', () => {
  it('AC-514.2 네 단추 가운데 처음 30일만 눌림이다', async () => {
    draw()
    await sectionsShown()
    expect(periodButtons().map((button) => button.textContent)).toEqual(['최근 7일', '최근 30일', '최근 90일', '최근 12개월'])
    expect(periodButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
    expect(pageText()).toContain('10월 14일 – 11월 12일 (어제까지)')
    expect(pageText()).toContain('비교: 9월 14일 – 10월 13일 (지난 30일)')
  })

  it('AC-514.2 다른 단추를 누르면 그 단추만 눌림이 되고 기간 글자와 읽는 기간이 바뀐다', async () => {
    draw()
    await sectionsShown()
    pressPeriod('최근 12개월')
    expect(periodButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true'])
    expect(pageText()).toContain('2025년 12월 – 2026년 11월 (11월은 13일까지)')
    expect(pageText()).toContain('비교: 2024년 12월 – 2025년 11월 (작년 같은 12달)')
    await sectionsShown()
    expect(readDays).toHaveBeenCalledWith({ from: R12.current.from, to: R12.current.to })
    expect(readDays).toHaveBeenCalledWith({ from: R12.previous.from, to: R12.previous.to })
  })

  it('AC-514.2 불러온 적이 없으면 Worker에 다시 계산시키지 않는다', async () => {
    const { fake } = await drawReady()
    pressPeriod('최근 90일')
    await sectionsShown()
    expect(fake.sent.some((message) => message.type === 'split')).toBe(false)
  })

  it('AC-514.2 불러온 뒤 기간을 바꾸면 Worker에 다시 계산시키고 다시 불러오지 않는다. to는 불러온 끝을 넘지 않는다', async () => {
    const { port, fake } = await drawReady()
    pressLoad(port)
    await screen.findByText('가짜처방')
    const streams = () => port.sent.filter((message) => message.cmd === 'stats.rows').length
    expect(streams()).toBe(1)
    expect(fake.sent.at(-1)).toMatchObject({ type: 'split', from: R30.current.from, to: R30.current.to })

    pressPeriod('최근 12개월')
    await waitFor(() => expect(fake.sent.at(-1)).toMatchObject({ type: 'split', from: R12.current.from, to: TODAY }))
    expect(streams()).toBe(1)
  })

  it('AC-514.2 기간을 바꿔도 열어 둔 [자세히]는 열린 채다(notes §5)', async () => {
    const R90 = statsRange(TODAY, '90d')
    answers({ ...SAVED_NOW, [R90.current.from]: read([day('2026-11-01', 10), day('2026-11-02', 10)], { latest: BIT_AT }) })
    draw()
    await sectionsShown()
    const opened = () => screen.getAllByRole('button', { name: '접기' })
    fireEvent.click(screen.getAllByRole('button', { name: '자세히' })[0]!)
    expect(opened()).toHaveLength(1)

    pressPeriod('최근 90일')
    expect(screen.getAllByText('불러오는 중')).toHaveLength(SECTIONS.length)
    await sectionsShown()
    expect(screen.queryByText('불러오는 중')).toBeNull()
    expect(opened()).toHaveLength(1)
  })
})

describe('AC-514.3 비트에서 불러오기', () => {
  it('AC-514.3 불러올 범위로 통로 → Worker → 저장 → 표에서 다시 읽기, 그동안 단추는 막힌다', async () => {
    const { port, fake } = await drawReady()
    const reads = vi.mocked(readDays).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    const busy = screen.getByRole('button', { name: '불러오는 중' })
    expect(busy.getAttribute('aria-disabled')).toBe('true')
    expect(pageText()).toContain('비트 PC에서 읽는 중이에요.')
    fireEvent.click(busy)
    expect(port.sent.filter((message) => message.cmd === 'stats.rows')).toHaveLength(1)

    const request = finishStream(port)
    expect(request.args).toEqual({ from: R30.load.from, to: R30.load.to })

    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    expect(fake.sent.find((message) => message.type === 'load')).toEqual({
      type: 'load',
      streamId: request.id,
      from: R30.load.from,
      to: R30.load.to,
      today: TODAY,
      closeToday: false,
    })
    expect(saveStats).toHaveBeenCalledWith({ months: LOADED.months, days: LOADED.days, covered: LOADED.covered, source: 'bit' })
    await waitFor(() => expect(vi.mocked(readDays).mock.calls.length).toBeGreaterThan(reads))
    await waitFor(() => expect(screen.getByRole('button', { name: LOAD }).getAttribute('aria-disabled')).toBeNull())
  })

  it('AC-514.3 끝나면 처방별 신환·재진과 보고 문장이 생긴다', async () => {
    const { port } = await drawReady()
    expect(screen.getAllByText('비트 PC에서 불러오면 보여요')).toHaveLength(2)
    pressLoad(port)
    expect(await screen.findByText('가짜처방')).toBeTruthy()
    await sectionsShown()
    expect(screen.queryByText('비트 PC에서 불러오면 보여요')).toBeNull()
    expect(screen.getByRole('group', { name: '보고 고르기' })).toBeTruthy()
    expect(pageText()).toContain(HOSPITAL)
    expect(pageText()).toMatch(/\d\d:\d\d까지 불러온 숫자예요\(오늘은 진료 중\)/)
  })

  it('AC-514.3 화면과 서버로 가는 값에 조각의 가짜 차트번호 글자가 없다', async () => {
    const { port } = await drawReady()
    pressLoad(port, ['가짜차트번호-0001'])
    await waitFor(() => expect(saveStats).toHaveBeenCalled())
    await screen.findByText('가짜처방')
    expect(pageText()).not.toContain('가짜차트번호')
    expect(JSON.stringify(vi.mocked(saveStats).mock.calls)).not.toContain('가짜차트번호')
  })

  it('AC-514.3 안내가 보이던 기간에서 비트 저장 성공 → 다시 읽은 fromFile false → 안내가 사라진다', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01')], { latest: FILE_AT, fromFile: true }) })
    const port = fakeChrome()
    draw()
    sayHello(port)
    expect(await screen.findByText(FILE_NOTE)).toBeTruthy()

    answers({ [R30.current.from]: read([day('2026-11-01')], { latest: BIT_AT, fromFile: false }) })
    pressLoad(port)
    // 다시 읽는 동안에는 출처 줄이 통째로 없으니 다시 읽은 출처 줄을 먼저 기다린다
    await waitFor(() => expect(pageText()).toContain('자료: 비트 PC · 11월 13일 18:42 저장 · 방금'))
    expect(screen.queryByText(FILE_NOTE)).toBeNull()
  })

  it('AC-514.3 통로가 번호로 실패하면 오류 카드이고 저장하지 않으며 단추가 풀린다', async () => {
    const { port } = await drawReady()
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code: 'E-STATS-TOO-BIG' }))
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-STATS-TOO-BIG')
    expect(saveStats).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: LOAD }).getAttribute('aria-disabled')).toBeNull()
  })

  it('AC-514.3 처방별 계산이 실패하면 오류 카드이고 내용을 옮기지 않는다', async () => {
    const port = fakeChrome()
    const fake = fakeWorker()
    fake.worker.postMessage.mockImplementation((message: StatsWorkerRequest) => {
      const reply = (data: StatsWorkerMessage) => queueMicrotask(() => fake.worker.onmessage?.({ data } as MessageEvent<StatsWorkerMessage>))
      if (message.type === 'load') reply({ type: 'loaded', streamId: message.streamId, view: LOADED })
      if (message.type === 'split') reply({ type: 'failed', streamId: message.streamId, code: '가짜 내용' })
    })
    draw()
    sayHello(port)
    await sectionsShown()
    pressLoad(port)
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-ANALYZE-FAILED')
    expect(pageText()).not.toContain('가짜 내용')
  })

  it('AC-514.2 기간을 바꾼 계산이 실패하면 앞 기간 처방 숫자를 남기지 않고, 다음 기간이 성공하면 오류 카드가 사라진다', async () => {
    const port = fakeChrome()
    const fake = fakeWorker()
    let splitFails = false
    fake.worker.postMessage.mockImplementation((message: StatsWorkerRequest) => {
      const reply = (data: StatsWorkerMessage) => queueMicrotask(() => fake.worker.onmessage?.({ data } as MessageEvent<StatsWorkerMessage>))
      if (message.type === 'load') reply({ type: 'loaded', streamId: message.streamId, view: LOADED })
      if (message.type === 'split') reply(splitFails ? { type: 'failed', streamId: message.streamId, code: 'E-ANALYZE-FAILED' } : { type: 'split-result', streamId: message.streamId, view: SPLIT })
    })
    draw()
    sayHello(port)
    await sectionsShown()
    pressLoad(port)
    await screen.findByText('가짜처방')

    splitFails = true
    pressPeriod('최근 7일')
    await waitFor(() => expect(screen.queryByRole('alert')?.textContent).toContain('오류 번호 E-ANALYZE-FAILED'))
    await sectionsShown()
    expect(screen.queryByText('가짜처방')).toBeNull()

    splitFails = false
    pressPeriod('최근 90일')
    await sectionsShown()
    expect(await screen.findByText('가짜처방')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-514.6 확인 필요 안내가 있으면 앞서 저장한 "방금" 표시를 같이 쓰지 않는다', async () => {
    const port = fakeChrome()
    const fake = fakeWorker()
    let view: StatsLoaded = LOADED
    fake.worker.postMessage.mockImplementation((message: StatsWorkerRequest) => {
      const reply = (data: StatsWorkerMessage) => queueMicrotask(() => fake.worker.onmessage?.({ data } as MessageEvent<StatsWorkerMessage>))
      if (message.type === 'load') reply({ type: 'loaded', streamId: message.streamId, view })
      if (message.type === 'split') reply({ type: 'split-result', streamId: message.streamId, view: SPLIT })
    })
    draw()
    sayHello(port)
    await sectionsShown()
    pressLoad(port)
    await waitFor(() => expect(pageText()).toContain('18:42 저장 · 방금'))
    await waitFor(() => expect(screen.getByRole('button', { name: LOAD }).getAttribute('aria-disabled')).toBeNull())

    view = INCOMPLETE
    pressLoad(port)
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    await sectionsShown() // 출처 줄은 처방별 답까지 받은 뒤 보인다
    expect(pageText()).toContain('18:42 저장 · 방금 불러온 숫자는 저장하지 않았어요')
    expect(pageText()).not.toContain('저장 · 방금 · 방금')
  })
})

describe('AC-514.4 파일 길', () => {
  it('AC-514.4 파일을 넣으면 저장 후 readDays를 다시 불러 그 답으로 그린다(파일 숫자를 합치지 않는다)', async () => {
    fileGoesWell()
    answers({})
    draw()
    await screen.findByText('아직 저장된 통계가 없어요')

    answers({ [R30.current.from]: read([day('2026-11-05', 33)], { latest: FILE_AT, fromFile: true }) })
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })

    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    expect(saveStats).toHaveBeenCalledWith({ months: [], days: [FRESH_ROW], covered: { from: '2026-11-01', to: '2026-11-10' }, source: 'file' })
    await waitFor(() => expect(pageText()).toContain('33명'))
    expect(pageText()).not.toContain('77명')
    expect(pageText()).not.toContain('아직 저장된 통계가 없어요')
    expect(readMonths).not.toHaveBeenCalled()
  })

  it('AC-514.4 파일마다 실패는 파일 이름과 오류 카드(번호)로 보이고, 이름은 저장에도 가지 않는다', async () => {
    vi.mocked(runAnalysis).mockResolvedValue({
      files: [OK_REPORT, { index: 1, ok: false, code: 'E-PARSE-EMPTY' }],
      result: { quality: 'incomplete', skippedInvalidRows: 0 } as AnalysisResult,
    })
    vi.mocked(toMonthPayload).mockReturnValue(null)
    vi.mocked(toDayPayloads).mockReturnValue(null)
    draw()
    await sectionsShown()

    fireEvent.change(fileInput(), { target: { files: [fakeFile('가짜좋은파일.xlsx'), fakeFile('가짜나쁜파일.xlsx')] } })

    expect(await screen.findByText('가짜나쁜파일.xlsx')).toBeTruthy()
    expect(pageText()).toContain('오류 번호 E-PARSE-EMPTY')
    expect(pageText()).not.toContain('가짜좋은파일.xlsx')
    expect(saveStats).not.toHaveBeenCalled()
    expect(pageText()).toContain('일부 기록을 확인하지 못해 저장하지 않았어요')
    expect(pageText()).toContain('읽지 못한 파일 1건')
  })

  it('AC-514.4 분석 자체가 실패하면 번호만 보인다', async () => {
    const { AnalyzeError } = await vi.importActual<typeof import('@/workers/runAnalysis')>('@/workers/runAnalysis')
    vi.mocked(runAnalysis).mockRejectedValue(new AnalyzeError('E-ANALYZE-TIMEOUT'))
    draw()
    await sectionsShown()
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-ANALYZE-TIMEOUT')
  })

  it('AC-514.4 파일을 읽는 동안 불러오기·파일 고르기가 막히고, 끝나면 풀린다', async () => {
    let finish: (answer: Awaited<ReturnType<typeof runAnalysis>>) => void = () => {}
    vi.mocked(runAnalysis).mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    vi.mocked(toMonthPayload).mockReturnValue([])
    vi.mocked(toDayPayloads).mockReturnValue([])
    draw()
    await sectionsShown()
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    const button = screen.getByRole('button', { name: '파일 고르기' })
    expect(button.getAttribute('aria-disabled')).toBe('true')

    await act(async () => finish({ files: [OK_REPORT], result: { quality: 'valid', skippedInvalidRows: 0 } as AnalysisResult }))
    await waitFor(() => expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBeNull())
  })
})

describe('AC-514.5 연결 상태', () => {
  it('AC-514.5 확장이 없는 곳은 안내와 파일 길, 저장된 숫자만 보인다', async () => {
    draw()
    await sectionsShown()
    expect(screen.getByText('비트 PC의 크롬에서 불러올 수 있어요')).toBeTruthy()
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
    expect(screen.getByRole('button', { name: '파일 고르기' })).toBeTruthy()
    expect(pageText()).toContain('하루 평균 환자 수')
    expect(screen.getAllByText('비트 PC에서 불러오면 보여요')).toHaveLength(2)
  })

  it('AC-514.5 도우미가 없으면 안내와 /claim/setup 링크다', async () => {
    const port = fakeChrome()
    draw()
    act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code: 'E-HELPER-MISSING' }))
    await sectionsShown()
    expect(screen.getByText('이 PC에서는 아직 비트에서 불러올 수 없어요')).toBeTruthy()
    expect(screen.getByRole('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
  })

  it('AC-514.5 안심 줄이 늘 보인다', async () => {
    draw()
    await sectionsShown()
    expect(screen.getByText('환자 개인정보는 의원 PC 밖으로 나가지 않아요. 서버에는 숫자만 저장해요.')).toBeTruthy()
  })
})

describe('AC-514.6 저장 실패·확인 필요', () => {
  it('AC-514.6 저장 실패 → 새 숫자를 그대로 두고 오류 카드 + [다시 저장], 누르면 같은 값을 보내고 카드가 사라진다', async () => {
    const { port } = await drawReady()
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    const reads = vi.mocked(readDays).mock.calls.length
    pressLoad(port)

    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('통계 숫자를 저장하지 못했어요')
    expect(card.textContent).toContain('오류 번호 E-STATS-SAVE-FAILED')
    expect(pageText()).toContain('방금 불러온 숫자는 화면에 그대로 있어요.')
    await sectionsShown() // 출처 줄은 처방별 답까지 받은 뒤 보인다
    expect(pageText()).toContain('자료: 비트 PC · 방금 불러옴 · 아직 저장하지 못했어요')
    // 저장된 10·10명에 방금 만든 77명을 합친 하루 평균
    await waitFor(() => expect(pageText()).toContain('32명'))
    expect(vi.mocked(readDays).mock.calls.length).toBe(reads)

    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(2))
    const [first, second] = vi.mocked(saveStats).mock.calls
    expect(second?.[0]).toBe(first?.[0])
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await waitFor(() => expect(vi.mocked(readDays).mock.calls.length).toBeGreaterThan(reads))
  })

  it('AC-514.6 품질 incomplete면 저장하지 않고 안내와 확인 건수를 보이며, 처방별·보고는 생긴다', async () => {
    const port = fakeChrome()
    fakeWorker(INCOMPLETE)
    answers({ [R30.current.from]: read([day('2026-11-01')], { latest: { at: FILE_AT.at, source: 'bit' } }) })
    draw()
    sayHello(port)
    await sectionsShown()
    pressLoad(port)

    expect(await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')).toBeTruthy()
    await sectionsShown() // 출처 줄은 처방별 답까지 받은 뒤 보인다
    expect(saveStats).not.toHaveBeenCalled()
    expect(pageText()).toContain('차트번호 없는 내원 3건 · 중복 내원 1건 · 첫 내원을 못 찾은 환자 2명이 있어요. 비트에서 이 기록을 고친 뒤 다시 불러와 주세요.')
    expect(pageText()).toContain('아래 그래프는 전에 저장한 숫자(11월 12일 18:30 저장)예요. 처방별 신환·재진과 보고 문장은 방금 불러온 숫자예요.')
    expect(pageText()).toContain('자료: 비트 PC · 11월 12일 18:30 저장 · 방금 불러온 숫자는 저장하지 않았어요')
    expect(await screen.findByText('가짜처방')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull()
  })

  it('AC-514.6 확인 건수는 0인 항목을 빼고 보인다', async () => {
    const port = fakeChrome()
    fakeWorker({ ...INCOMPLETE, checks: { noChart: 0, duplicate: 4, noFirst: 0 } })
    draw()
    sayHello(port)
    await sectionsShown()
    pressLoad(port)
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    expect(pageText()).toContain('중복 내원 4건이 있어요.')
    expect(pageText()).not.toContain('차트번호 없는 내원 0건')
  })

  it('AC-514.6 저장된 숫자가 없을 때의 확인 필요는 "전에 저장한 숫자"라고 하지 않는다', async () => {
    const port = fakeChrome()
    fakeWorker(INCOMPLETE)
    answers({})
    draw()
    sayHello(port)
    await screen.findByText('아직 저장된 통계가 없어요')
    pressLoad(port)
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    expect(pageText()).not.toContain('전에 저장한 숫자')
    expect(pageText()).toContain('처방별 신환·재진과 보고 문장은 방금 불러온 숫자예요.')
  })

  it('AC-514.6 파일 품질 incomplete도 저장하지 않고 건수를 보인다', async () => {
    vi.mocked(runAnalysis).mockResolvedValue({ files: [OK_REPORT], result: { quality: 'incomplete', skippedInvalidRows: 5 } as AnalysisResult })
    vi.mocked(toMonthPayload).mockReturnValue(null)
    vi.mocked(toDayPayloads).mockReturnValue(null)
    draw()
    await sectionsShown()
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    expect(saveStats).not.toHaveBeenCalled()
    expect(pageText()).toContain('확인하지 못한 줄 5건이 있어요.')
    expect(pageText()).not.toContain('처방별 신환·재진과 보고 문장은 방금 불러온 숫자예요.')
  })
})

describe('AC-514.6 읽기가 실패해도 방금 불러온 숫자는 보인다', () => {
  it('AC-514.6 읽기와 저장이 모두 실패하면 새 숫자로 섹션을 그리고 두 카드를 보인다', async () => {
    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    vi.mocked(saveStats).mockRejectedValue(new Error('가짜 실패'))
    const port = fakeChrome()
    fakeWorker()
    draw()
    sayHello(port)
    await screen.findByRole('button', { name: LOAD })
    await screen.findByRole('alert')
    expect(heading('기간 요약')).toBeNull()

    pressLoad(port)
    await waitFor(() => expect(pageText()).toContain('오류 번호 E-STATS-SAVE-FAILED'))
    await sectionsShown()

    const cards = screen.getAllByRole('alert').map((card) => card.textContent ?? '')
    expect(cards.some((text) => text.includes('오류 번호 E-STATS-READ-FAILED'))).toBe(true)
    expect(cards.some((text) => text.includes('오류 번호 E-STATS-SAVE-FAILED'))).toBe(true)
    expect(pageText()).toContain('77명')
    expect(pageText()).toContain('자료: 비트 PC · 방금 불러옴 · 아직 저장하지 못했어요')
    expect(await screen.findByText('가짜처방')).toBeTruthy()
    expect(screen.getByRole('group', { name: '보고 고르기' })).toBeTruthy()
    expect(pageText()).not.toContain('아직 저장된 통계가 없어요')
  })

  it('AC-514.6 기간을 바꾼 읽기가 실패해도 저장하지 못한 숫자를 앞 기간이 아니라 지금 기간으로 그린다', async () => {
    const port = fakeChrome()
    fakeWorker({ ...LOADED, days: [day('2026-09-01', 55)] }) // 최근 30일과 그 비교 기간 밖, 최근 90일 안
    vi.mocked(saveStats).mockRejectedValue(new Error('가짜 실패'))
    answers({})
    draw()
    sayHello(port)
    await screen.findByText('아직 저장된 통계가 없어요')
    pressLoad(port)
    await waitFor(() => expect(pageText()).toContain('오류 번호 E-STATS-SAVE-FAILED'))
    await sectionsShown()
    expect(pageText()).not.toContain('55명')

    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    pressPeriod('최근 90일')
    await waitFor(() => expect(pageText()).toContain('오류 번호 E-STATS-READ-FAILED'))
    await sectionsShown()
    expect(pageText()).toContain('55명')
    expect(pageText()).toContain('오류 번호 E-STATS-SAVE-FAILED')
  })

  it('AC-514.6 확인 필요 불러오기는 읽기가 실패해도 처방별·보고를 그리고, "전에 저장한 숫자"나 "자료가 없어요"라고 하지 않는다', async () => {
    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    const port = fakeChrome()
    fakeWorker(INCOMPLETE)
    draw()
    sayHello(port)
    await screen.findByRole('button', { name: LOAD })
    await screen.findByRole('alert')

    pressLoad(port)
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    await sectionsShown()
    expect(await screen.findByText('가짜처방')).toBeTruthy()
    expect(screen.getByRole('group', { name: '보고 고르기' })).toBeTruthy()
    expect(pageText()).toContain('오류 번호 E-STATS-READ-FAILED')
    expect(pageText()).toContain('처방별 신환·재진과 보고 문장은 방금 불러온 숫자예요.')
    expect(pageText()).not.toContain('전에 저장한 숫자')
    expect(pageText()).not.toContain('아직 저장된 통계가 없어요')
    expect(pageText()).not.toContain('불러온 숫자에 이 기간 자료가 없어요.') // 못 읽었을 뿐 없다고 하지 않는다
    expect(pageText()).not.toContain('자료:')
  })

  it('AC-514.6 확인 필요 뒤 기간을 바꾼 읽기가 실패하면 앞 기간 숫자 없이 처방별·보고만 지금 기간으로 그린다', async () => {
    const port = fakeChrome()
    fakeWorker(INCOMPLETE)
    draw()
    sayHello(port)
    await sectionsShown()
    expect(pageText()).toContain('하루 평균 환자 수')
    pressLoad(port)
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    await sectionsShown()

    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    pressPeriod('최근 90일')
    await waitFor(() => expect(pageText()).toContain('오류 번호 E-STATS-READ-FAILED'))
    await sectionsShown()
    expect(pageText()).not.toContain('진료한 날') // 앞 기간 숫자의 기간 요약이 없다
    expect(pageText()).not.toContain('기간 합계')
    expect(pageText()).not.toContain('전에 저장한 숫자')
    expect(pageText()).not.toContain('자료:') // 앞 기간의 출처를 지금 기간 출처처럼 보이지 않는다
    expect(pageText()).not.toContain('불러온 숫자에 이 기간 자료가 없어요.')
    expect(screen.getByText('가짜처방')).toBeTruthy()
    expect(screen.getByRole('group', { name: '보고 고르기' })).toBeTruthy()
  })

  it('AC-514.1 파일 확인 필요는 방금 불러온 처방별·보고가 없어 읽기가 실패하면 섹션을 그리지 않는다', async () => {
    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    vi.mocked(runAnalysis).mockResolvedValue({ files: [OK_REPORT], result: { quality: 'incomplete', skippedInvalidRows: 5 } as AnalysisResult })
    vi.mocked(toMonthPayload).mockReturnValue(null)
    vi.mocked(toDayPayloads).mockReturnValue(null)
    draw()
    await screen.findByRole('alert')
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    await waitFor(() => expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBeNull())
    expect(heading('기간 요약')).toBeNull()
  })

  it('AC-514.1·AC-514.3 저장에 성공했는데 다시 읽기가 실패하면 카드뿐이고, [다시 읽기]로 처방별·보고가 돌아온다', async () => {
    const port = fakeChrome()
    const hand = handWorker()
    draw()
    sayHello(port)
    await sectionsShown()
    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    pressLoad(port)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(pageText()).toContain('오류 번호 E-STATS-READ-FAILED'))
    await loadIsFree()
    expect(screen.queryByText('불러오는 중')).toBeNull()
    await hand.answerSplit(0, '가짜처방하나')
    expect(heading('기간 요약')).toBeNull()
    expect(screen.queryByRole('group', { name: '보고 고르기' })).toBeNull()

    answers(SAVED_NOW)
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    await sectionsShown()
    expect(screen.getByText('가짜처방하나')).toBeTruthy()
    expect(screen.getByRole('group', { name: '보고 고르기' })).toBeTruthy()
    expect(hand.splits).toHaveLength(1)
  })

  it('AC-514.1 Worker를 못 만드는 브라우저에서도 저장된 숫자는 보인다', async () => {
    vi.mocked(createStatsWorker).mockImplementation(() => {
      throw new Error('가짜 실패')
    })
    draw()
    await sectionsShown()
    expect(pageText()).toContain('하루 평균 환자 수')
  })
})

describe('AC-514.1 기간을 바꾼 읽기 실패', () => {
  it('AC-514.1 앞 기간 숫자를 보이지 않고 오류 카드 + [다시 읽기]이며, 누르면 다시 그린다', async () => {
    draw()
    await sectionsShown()
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    pressPeriod('최근 90일')

    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-STATS-READ-FAILED')
    expect(heading('기간 요약')).toBeNull()
    expect(screen.queryByText('불러오는 중')).toBeNull()
    expect(pageText()).not.toContain('자료:')
    expect(pageText()).not.toContain('아직 저장된 통계가 없어요')
    expect(periodButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false'])

    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    await sectionsShown()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-514.2 처방별 답은 그 기간·그 불러오기의 것만 쓴다', () => {
  it('AC-514.2 기간을 바꾸면 그 기간 답이 올 때까지 앞 기간 처방 숫자를 보이지 않고 기다린다', async () => {
    const { hand } = await loadedWithSplit()
    pressPeriod('최근 7일')
    await waitFor(() => expect(hand.splits).toHaveLength(2))
    await flush() // 저장된 숫자 읽기는 끝났고 처방별 답만 남았다

    expect(screen.getAllByText('불러오는 중')).toHaveLength(SECTIONS.length)
    expect(screen.queryByText('가짜처방하나')).toBeNull()

    await hand.answerSplit(1, '가짜처방둘')
    await sectionsShown()
    expect(screen.getByText('가짜처방둘')).toBeTruthy()
  })

  it('AC-514.3 다시 불러오면 기간이 같아도 앞 불러오기의 처방 답을 쓰지 않고 새 답을 기다린다', async () => {
    const { port, hand } = await loadedWithSplit()
    pressLoad(port)
    await waitFor(() => expect(hand.splits).toHaveLength(2))
    await flush()

    expect(screen.queryByText('가짜처방하나')).toBeNull()
    expect(screen.getAllByText('불러오는 중').length).toBeGreaterThanOrEqual(SECTIONS.length)

    await hand.answerSplit(1, '가짜처방둘')
    await loadIsFree()
    await sectionsShown()
    expect(screen.getByText('가짜처방둘')).toBeTruthy()
  })

  it('AC-514.2 앞 기간의 늦은 처방 답은 버린다', async () => {
    const { hand } = await loadedWithSplit()
    pressPeriod('최근 7일')
    await waitFor(() => expect(hand.splits).toHaveLength(2))
    pressPeriod('최근 90일')
    await waitFor(() => expect(hand.splits).toHaveLength(3))

    await hand.answerSplit(2, '가짜처방셋')
    await sectionsShown()
    expect(screen.getByText('가짜처방셋')).toBeTruthy()

    await hand.answerSplit(1, '가짜처방늦음')
    await sectionsShown()
    expect(screen.getByText('가짜처방셋')).toBeTruthy()
    expect(screen.queryByText('가짜처방늦음')).toBeNull()
  })

  it('AC-514.2 앞 기간의 늦은 실패는 버린다', async () => {
    const { hand } = await loadedWithSplit()
    pressPeriod('최근 7일')
    await waitFor(() => expect(hand.splits).toHaveLength(2))
    pressPeriod('최근 90일')
    await waitFor(() => expect(hand.splits).toHaveLength(3))

    await hand.answerSplit(2, '가짜처방셋')
    await sectionsShown()

    await hand.failSplit(1)
    await sectionsShown()
    expect(screen.getByText('가짜처방셋')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-514.6 일은 한 번에 하나', () => {
  it('AC-514.6 불러오는 동안 [다시 저장]은 막히고 눌러도 보내지 않는다', async () => {
    const { port } = await saveFailedOnce()
    fireEvent.click(screen.getByRole('button', { name: LOAD }))

    const retry = screen.getByRole('button', { name: '다시 저장' })
    expect(retry.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(retry)
    expect(saveStats).toHaveBeenCalledTimes(1)

    finishStream(port)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(2))
    await loadIsFree()
  })

  it('AC-514.6 다시 저장하는 동안 불러오기·파일은 막혀 새 숫자가 옛 숫자에 덮이지 않는다', async () => {
    const { port } = await saveFailedOnce()
    fileGoesWell()
    let finish: (answer: { saved: number }) => void = () => {}
    vi.mocked(saveStats).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))

    const load = screen.getByRole('button', { name: LOAD })
    expect(load.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(load)
    expect(port.sent.filter((message) => message.cmd === 'stats.rows')).toHaveLength(1)

    expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    expect(runAnalysis).not.toHaveBeenCalled()
    expect(pageText()).not.toContain('비트 PC에서 읽는 중이에요.')
    expect(pageText()).not.toContain('파일을 이 PC 안에서 읽는 중이에요.')

    await act(async () => finish({ saved: 1 }))
    await loadIsFree()
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull()
  })

  it('AC-514.6 다시 저장하는 동안 "저장하는 중"이고 다시 눌러도 한 번만 보내며 새 숫자는 그대로 보인다', async () => {
    await saveFailedOnce()
    await waitFor(() => expect(pageText()).toContain('32명'))
    let finish: (answer: { saved: number }) => void = () => {}
    vi.mocked(saveStats).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))

    const busy = screen.getByRole('button', { name: '저장하는 중' })
    expect(busy.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(busy)
    expect(saveStats).toHaveBeenCalledTimes(2)
    expect(pageText()).toContain('32명')
    expect(heading('기간 요약')).toBeTruthy()

    await act(async () => finish({ saved: 1 }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('AC-514.6 다시 저장이 또 실패하면 카드와 새 숫자가 그대로이고 다시 누를 수 있다', async () => {
    await saveFailedOnce()
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(2))
    await loadIsFree()
    const retry = await screen.findByRole('button', { name: '다시 저장' })
    expect(retry.getAttribute('aria-disabled')).toBeNull()
    expect(pageText()).toContain('32명')
  })

  it('AC-514.6 저장하지 못한 숫자가 남아 있는 동안의 확인 필요는 "전에 저장한 숫자"라고 하지 않는다', async () => {
    const port = fakeChrome()
    const hand = handWorker()
    draw()
    sayHello(port)
    await sectionsShown()
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    pressLoad(port)
    await screen.findByRole('button', { name: '다시 저장' })
    await loadIsFree()

    hand.nextLoad(INCOMPLETE)
    pressLoad(port)
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    expect(pageText()).not.toContain('아래 그래프는 전에 저장한 숫자')
    expect(pageText()).toContain('처방별 신환·재진과 보고 문장은 방금 불러온 숫자예요.')
    expect(saveStats).toHaveBeenCalledTimes(1)
  })

  it('AC-514.6 [다시 저장]은 확인 필요 카드를 지우지 않는다', async () => {
    const port = fakeChrome()
    const hand = handWorker()
    draw()
    sayHello(port)
    await sectionsShown()
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    pressLoad(port)
    await screen.findByRole('button', { name: '다시 저장' })
    await loadIsFree()
    hand.nextLoad(INCOMPLETE)
    pressLoad(port)
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    await loadIsFree()
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))
    expect(screen.queryByText('일부 기록을 확인하지 못해 저장하지 않았어요')).toBeTruthy()
    await loadIsFree()
    expect(screen.queryByText('일부 기록을 확인하지 못해 저장하지 않았어요')).toBeTruthy()
  })

  it('AC-514.3 새로 불러오면 앞 일의 오류·파일 실패·확인 필요 카드를 지운다', async () => {
    const { port } = await drawReady()
    vi.mocked(runAnalysis).mockResolvedValue({
      files: [{ index: 0, ok: false, code: 'E-PARSE-EMPTY' }, { ...OK_REPORT, index: 1 }],
      result: { quality: 'incomplete', skippedInvalidRows: 0 } as AnalysisResult,
    })
    vi.mocked(toMonthPayload).mockReturnValue(null)
    vi.mocked(toDayPayloads).mockReturnValue(null)
    fireEvent.change(fileInput(), { target: { files: [fakeFile('가짜나쁜파일.xlsx'), fakeFile('가짜좋은파일.xlsx')] } })
    await screen.findByText('가짜나쁜파일.xlsx')
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    await loadIsFree()

    // 불러오기를 시작하면 파일 실패·확인 필요가 바로 사라진다
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(screen.queryByText('가짜나쁜파일.xlsx')).toBeNull()
    expect(screen.queryByText('일부 기록을 확인하지 못해 저장하지 않았어요')).toBeNull()
    expect(pageText()).not.toContain('오류 번호 E-PARSE-EMPTY')

    // 실패한 불러오기의 오류 카드는 다음 불러오기에서 사라진다
    act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code: 'E-STATS-TOO-BIG' }))
    await waitFor(() => expect(pageText()).toContain('오류 번호 E-STATS-TOO-BIG'))
    await loadIsFree()
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(pageText()).not.toContain('오류 번호 E-STATS-TOO-BIG')
  })
})

describe('AC-514.7 출처 줄과 파일 안내', () => {
  it('AC-514.7 비트 출처 줄: 가장 최근 시각(한국 시간)과 덮은 끝', async () => {
    draw()
    await sectionsShown()
    expect(pageText()).toContain('자료: 비트 PC · 11월 13일 18:42 저장 · 어제(11월 12일)까지 끝난 날로 저장했어요')
  })

  it('AC-514.7 파일 출처 줄', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01')], { latest: FILE_AT, fromFile: true }) })
    vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-09-01', to: '2026-11-05' }])
    draw()
    await sectionsShown()
    expect(pageText()).toContain('자료: 파일 · 11월 12일 18:30 저장 · 11월 5일까지 끝난 날로 저장했어요')
  })

  it('AC-514.8 오늘까지 덮었으면 오늘로 적는다', async () => {
    vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-09-01', to: TODAY }])
    draw()
    await sectionsShown()
    expect(pageText()).toContain(' · 오늘(11월 13일)까지 끝난 날로 저장했어요')
  })

  it('AC-514.7 latest.source가 bit이어도 fromFile이 true이면 문장이 글자 그대로 보인다', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01')], { latest: BIT_AT, fromFile: true }) })
    draw()
    expect(await screen.findByText(FILE_NOTE)).toBeTruthy()
    expect(pageText()).toContain('자료: 비트 PC')
  })

  it('AC-514.7 읽은 줄이 모두 비트이면(fromFile false) 보이지 않는다', async () => {
    draw()
    await sectionsShown()
    expect(screen.queryByText(FILE_NOTE)).toBeNull()
  })

  it('AC-514.7 비교 기간 읽기만 fromFile true여도 보인다', async () => {
    answers({
      [R30.current.from]: read([day('2026-11-01')], { latest: BIT_AT, fromFile: false }),
      [R30.previous.from]: read([day('2026-10-01')], { latest: FILE_AT, fromFile: true }),
    })
    draw()
    expect(await screen.findByText(FILE_NOTE)).toBeTruthy()
  })

  it('AC-514.7 파일 저장 실패로 방금 만든 숫자를 보이는 동안 보인다', async () => {
    fileGoesWell()
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    draw()
    await sectionsShown()
    expect(screen.queryByText(FILE_NOTE)).toBeNull()
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    expect(await screen.findByText(FILE_NOTE)).toBeTruthy()
    expect(pageText()).toContain('자료: 파일 · 방금 불러옴 · 아직 저장하지 못했어요')
  })

  it('AC-514.7 latest가 null이면 출처 줄만 숨기고, fromFile이 참이면 문장은 보인다', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01')], { latest: null, fromFile: true }) })
    draw()
    expect(await screen.findByText(FILE_NOTE)).toBeTruthy()
    expect(pageText()).not.toContain('자료:')
    expect(pageText()).not.toContain('아직 저장된 통계가 없어요')
  })
})

describe('AC-514.8 오늘 진료 끝', () => {
  it('AC-514.8 켜고 불러오면 closeToday true로 가고 보고 날짜 줄에 진료 중이 없다', async () => {
    const { port, fake } = await drawReady()
    fireEvent.click(screen.getByRole('checkbox', { name: '오늘 진료 끝' }))
    pressLoad(port)
    await waitFor(() => expect(fake.sent.find((message) => message.type === 'load')).toMatchObject({ closeToday: true }))
    await screen.findByText('가짜처방')
    expect(pageText()).toMatch(/\d\d:\d\d까지 불러온 숫자예요/)
    expect(pageText()).not.toContain('(오늘은 진료 중)')
  })
})

describe('AC-514.9 화면 상태는 메모리에만', () => {
  it('AC-514.9 불러오고 저장해도 저장소·주소·history.state에 아무것도 넣지 않는다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const pushState = vi.spyOn(window.history, 'pushState')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const search = window.location.search
    const pathname = window.location.pathname
    const state = window.history.state

    const { port } = await drawReady()
    pressPeriod('최근 90일')
    await sectionsShown()
    pressLoad(port)
    await screen.findByText('가짜처방')

    expect(setItem).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(window.location.search).toBe(search)
    expect(window.location.pathname).toBe(pathname)
    expect(window.history.state).toBe(state)
  })

  it('AC-514.9 화면 조립 파일은 브라우저 저장소·주소를 쓰지 않고 lib/bridge/client를 부르지 않는다', () => {
    const ROOT = process.cwd()
    for (const name of ['StatsScreen.tsx', 'SourcePicker.tsx', 'useStatsData.ts', 'useStatsWorker.ts']) {
      const text = readFileSync(join(ROOT, 'src/components/stats', name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1')
      for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'history.', 'location.', 'useSearchParams', 'lib/bridge/client', 'fetch(']) {
        expect(text, `${name}: ${word}`).not.toContain(word)
      }
    }
  })
})

describe('AC-514.10 폭별 배치', () => {
  it('AC-514.10 768px 미만에서 기간 단추는 44px·같은 폭이고 머리는 세로로 쌓인다', async () => {
    draw()
    await sectionsShown()
    const group = screen.getByRole('group', { name: '기간' })
    expect(group.className).toContain('max-md:grid-cols-4')
    expect(group.className).toContain('max-md:w-full')
    for (const button of periodButtons()) expect(button.className).toContain('max-md:h-11')
    expect(group.parentElement?.className).toContain('max-md:flex-col')
  })

  it('AC-514.10 기다리는 칸은 섹션과 같은 12칸 배치이고 좁으면 모두 12칸이다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    const place = (name: string) => heading(name)?.closest('section')?.className ?? ''
    expect(place('기간 요약')).toContain('col-span-12')
    expect(place('환자 수 추이')).toContain('lg:col-span-8')
    expect(place('신환 재방문율')).toContain('lg:col-span-4')
    expect(place('처방 추세')).toContain('lg:col-span-7')
    expect(place('처방별 신환·재진')).toContain('lg:col-span-5')
    expect(place('원장님 보고 문장')).toContain('lg:col-span-7')
    expect(place('요일별 환자 수')).toContain('lg:col-span-5')
    for (const name of SECTIONS) expect(place(name)).toMatch(/(^| )col-span-12( |$)/)
  })

  it('AC-514.10 상자 안 상자가 없다', async () => {
    const { port } = await drawReady()
    pressLoad(port)
    await screen.findByText('가짜처방')
    expect(nestedBoxes(document.body)).toEqual([])
  })
})
