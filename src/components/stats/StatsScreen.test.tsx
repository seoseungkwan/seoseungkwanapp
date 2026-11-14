// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, compareYmd, eachDay } from '@/lib/analytics/dates'
import { MIN_HELPER } from '@/lib/bridge/versions'
import { readRxPicks } from '@/lib/storage/rxPicks'
import { readCoverage, readDays, readMonths, saveStats } from '@/lib/storage/stats'
import { listStatsRxGroups, saveStatsRxGroups } from '@/lib/storage/statsRxGroups'
import { toDayPayloads } from '@/lib/payload/toDayPayloads'
import { toMonthPayload } from '@/lib/payload/toMonthPayload'
import { nestedBoxes } from '@/testing/boxes'
import type { AnalysisResult, FileReport } from '@/types/analyze'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import type { ClinicReportNumbers } from '@/types/clinicReport'
import type { DateRange } from '@/types/dates'
import type { DayPayload, MonthSections } from '@/types/payload'
import type { RevenueDayRow, RevenueDaysResult, SavedRevenueDay } from '@/types/revenue'
import type { RxGroup } from '@/types/rxGroups'
import type { BitSectionsView, PatientMix, RxSplitView, StatsLoaded, StatsLoadRequest, StatsSectionsRequest, StatsWorkerMessage, StatsWorkerRequest } from '@/types/stats'
import { runAnalysis } from '@/workers/runAnalysis'
import { createStatsWorker } from '@/workers/statsClient'
import { planLoad, revenueProgressText } from './loadPlan'
import { StatsScreen } from './StatsScreen'
import { useStatsRevenue } from './useStatsRevenue'
import { groupKey } from './treatmentView'
import { readSpan, statsRange } from './view'

// 통계 화면 (stats REQ-514, 시안 docs/mockups/stats/notes.md §2·§3). 가짜 Worker·가짜 chrome.runtime·가짜 저장으로 시험한다.
// 숫자·이름은 모두 가짜이고 이 파일 안에서만 만든다

vi.mock('@/lib/storage/stats', () => ({
  readDays: vi.fn(),
  readMonths: vi.fn(),
  readCoverage: vi.fn(),
  saveStats: vi.fn(),
}))
vi.mock('@/lib/storage/rxPicks', () => ({
  readRxPicks: vi.fn(),
  addRxPick: vi.fn(),
  removeRxPick: vi.fn(),
  clearRxPicks: vi.fn(),
}))
// 처방별 추세 묶음 저장 코드(treatment-trend). 기본은 저장된 묶음 하나다(beforeEach)
vi.mock('@/lib/storage/statsRxGroups', () => ({
  listStatsRxGroups: vi.fn(),
  saveStatsRxGroups: vi.fn(),
  StatsRxGroupStoreError: class extends Error {},
}))
vi.mock('@/workers/statsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/workers/statsClient')>()),
  createStatsWorker: vi.fn(),
}))
vi.mock('@/workers/runAnalysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/workers/runAnalysis')>()),
  runAnalysis: vi.fn(),
}))
// 파일 길의 묶음 0줄 채우기(fillGroupCounts)가 이 파일의 compareText를 쓰므로 나머지는 진짜다
vi.mock('@/lib/payload/toMonthPayload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/payload/toMonthPayload')>()),
  toMonthPayload: vi.fn(),
}))
vi.mock('@/lib/payload/toDayPayloads', () => ({ toDayPayloads: vi.fn() }))
// 매출 저장소 가짜(stats-revenue TASK-7). 기본 동작은 beforeEach: 어제까지 쉬는 날 줄이 저장돼 있고(금액 0 · 날 단위 처방 금액 있음), 저장하면 그 날 줄이 바뀐다
const revenueStore = vi.hoisted(() => ({ saveRange: vi.fn(), loadDays: vi.fn(), codeTotals: vi.fn(), monthCodes: vi.fn() }))
vi.mock('@/lib/storage/revenue', () => ({ createRevenueStore: vi.fn(() => revenueStore) }))
// 진짜 useStatsRevenue를 그대로 돌리고 받은 인자만 본다(first90 AC-4407.1: 도우미 판을 넘긴다)
vi.mock('./useStatsRevenue', async (importOriginal) => {
  const real = await importOriginal<typeof import('./useStatsRevenue')>()
  return { ...real, useStatsRevenue: vi.fn(real.useStatsRevenue) }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))

const TODAY = '2026-11-13' // 금요일
const HOSPITAL = '가짜정형외과의원'
const R30 = statsRange(TODAY, '30d')
const R12 = statsRange(TODAY, '12m')
const SHA = '0'.repeat(64)
const HELLO = { helperVersion: MIN_HELPER, protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }
const LOAD = '비트에서 불러오기'
const FILE_NOTE = '파일 자료는 처방이 없는 접수와 같은 날 다시 접수한 건이 빠져 비트 PC 숫자보다 적을 수 있어요.'
const SETTINGS = '불러오기 설정' // 불러오기 띠의 접는 단추(stats-pc-ux AC-4001.1)
const PRIVACY_LINE = '환자 개인정보는 의원 PC 밖으로 나가지 않아요. 서버에는 숫자만 저장해요.'
const BIT_AT = { at: '2026-11-13T09:42:00Z', source: 'bit' as const } // 18:42
const FILE_AT = { at: '2026-11-12T09:30:00Z', source: 'file' as const } // 11월 12일 18:30
// 처방 세 칸은 한 칸 `처방` + 탭 셋이다(stats-pc-ux AC-4003.1). 여섯 칸 뒤에 비트 전용 세 칸(stats-bit-sections AC-2706.1).
// `매출`은 신환 재방문율 다음 · 처방 앞이다(stats-revenue AC-4109.1)
const SECTIONS = ['기간 요약', '환자 수 추이', '신환 재방문율', '매출', '처방', '원장님 보고 문장', '요일별 환자 수', '환자 구성', '시간대별 접수', '원장님별']
const RX_TABS = ['묶음별 추세', '처방별 신환·재진', '처방 골라 보기'] as const
// 목차 띠 링크 열과 그 칸 id(stats-pc-ux AC-4002.1·AC-4002.6, stats-revenue AC-4109.1). 칸 차례는 SECTIONS와 같다
const TOC = [
  ['기간 요약', 'stats-summary'],
  ['환자 수', 'stats-trend'],
  ['재방문율', 'stats-revisit'],
  ['매출', 'stats-revenue'],
  ['처방', 'stats-rx'],
  ['보고 문장', 'stats-report'],
  ['요일별', 'stats-weekday'],
  ['환자 구성', 'stats-mix'],
  ['시간대별', 'stats-hours'],
  ['원장님별', 'stats-doctors'],
] as const
const TOC_NAME = '칸 바로 가기'
// 이 기기에서 불러오기 전 "비트 PC에서 불러오면 보여요" 칸: 처방별 신환·재진 · 보고 문장 + 비트 전용 세 칸(AC-2706.5)
const BIT_ONLY_COUNT = 5
// 서버에 저장된 처방별 추세 묶음 하나(지어낸 이름·코드)와 Worker로 가는 그 정의(열쇠·코드만)
const SAVED_GROUP: RxGroup = { id: 'g0', name: '가짜 묶음', codes: ['A100'], sortOrder: 0 }
const defsOf = (group: RxGroup) => [{ id: groupKey(group.codes), codes: group.codes }]

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

// ── 매출(stats-revenue TASK-7) 가짜 자료. 금액·건수는 모두 지어낸 값이다 ──
const YESTERDAY = '2026-11-12'
const REVENUE_ZERO: Omit<RevenueDayRow, 'date'> = {
  visits: 0,
  newPatients: 0,
  returnVisits: 0,
  total: 0,
  insurer: 0,
  noncovered: 0,
  copay: 0,
  otherTotal: 0,
  cash: 0,
  card: 0,
  transfer: 0,
  receivableIn: 0,
  unconfirmed: false,
  splitUnconfirmed: false,
}
// 쉬는 날(접수 0건 · 금액 모두 0) 줄
const closedDay = (date: string): RevenueDayRow => ({ date, ...REVENUE_ZERO })
// 진료한 날 줄: 접수 70건 · 매출 300만 원(공단부담 150만 + 본인부담 45만 + 비급여 90만 + 기타 15만)
const workDay = (date: string): RevenueDayRow => ({
  ...closedDay(date),
  visits: 70,
  newPatients: 5,
  returnVisits: 65,
  total: 3_000_000,
  insurer: 1_500_000,
  noncovered: 900_000,
  copay: 450_000,
  otherTotal: 150_000,
  cash: 200_000,
  card: 1_100_000,
  transfer: 50_000,
})
/** 도우미 revenue.days 답: 범위의 날마다 줄 하나. withDayCodes가 거짓이면 옛 도우미(dayCodes 열쇠 없음) */
function revenueAnswer(range: DateRange, row: (date: string) => RevenueDayRow = closedDay, withDayCodes = true): RevenueDaysResult {
  const days = eachDay(range).map(row)
  return withDayCodes ? { days, codes: [], dayCodes: [] } : { days, codes: [] }
}
// 가짜 서버의 매출: 저장한 날 줄 + revenueSavedTo까지는 쉬는 날 줄(날 단위 처방 금액 있음). null이면 저장된 매출이 없다
let revenueDb = new Map<string, SavedRevenueDay>()
let revenueSavedTo: string | null = YESTERDAY
const savedRevenue = (range: DateRange): SavedRevenueDay[] =>
  eachDay(range).flatMap((date) => {
    const row = revenueDb.get(date)
    if (row !== undefined) return [row]
    return revenueSavedTo !== null && compareYmd(date, revenueSavedTo) <= 0 ? [{ ...closedDay(date), dayCodes: true }] : []
  })

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

// 매출 빈 날 읽기(revenue.days)의 답(stats-revenue TASK-7). 통계 조각을 모두 저장하면 화면이 같은 통로로 묻는다.
// null이면 답을 들고 있다(시험이 port.reply로 직접 답한다). 기본은 쉬는 날 줄로 바로 답한다
type RevenueReply = (range: DateRange) => { type: 'result'; data: unknown } | { type: 'error'; code: string } | null

class FakePort implements PortLike {
  sent: Record<string, unknown>[] = []
  revenueReply: RevenueReply = (range) => ({ type: 'result', data: revenueAnswer(range) })
  private messageFns: ((m: unknown) => void)[] = []
  private disconnectFns: (() => void)[] = []
  onMessage = { addListener: (fn: (m: unknown) => void) => void this.messageFns.push(fn) }
  onDisconnect = { addListener: (fn: () => void) => void this.disconnectFns.push(fn) }
  postMessage(m: unknown) {
    this.sent.push(m as Record<string, unknown>)
    const { id, cmd, args } = m as { id?: unknown; cmd?: unknown; args?: unknown }
    if (cmd !== 'revenue.days') return
    const answer = this.revenueReply(args as DateRange)
    if (answer !== null) queueMicrotask(() => this.reply({ v: 1, id, ...answer }))
  }
  disconnect() {}
  reply(m: unknown) {
    for (const fn of this.messageFns) fn(m)
  }
  last() {
    return this.sent[this.sent.length - 1]!
  }
  fireDisconnect() {
    for (const fn of this.disconnectFns) fn()
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
const sectionOf = (name: string) => heading(name)!.closest('section')!
// 처방 칸의 탭을 고르고(이미 골랐으면 그대로) 보이는 패널을 돌려준다. 고르지 않은 패널은 hidden이라 role로 찾지 못한다(stats-pc-ux AC-4003.2)
function rxPanel(name: (typeof RX_TABS)[number]) {
  const tab = within(sectionOf('처방')).getByRole('tab', { name })
  if (tab.getAttribute('aria-selected') !== 'true') fireEvent.click(tab)
  return within(sectionOf('처방')).getByRole('tabpanel')
}
// 처방 칸 머리 줄(h2 `처방` + 고른 탭 칸의 설명·단추 자리)
const rxHead = () => heading('처방')!.parentElement!
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
// 저장된 숫자가 있는 화면은 불러오기 상자가 접힌 채다(stats-pc-ux AC-4001.4). 펼칠 칸 안 단추를 role로 찾기 전에 펼친다(이미 펼쳤으면 그대로)
function openSettings() {
  const toggle = screen.getByRole('button', { name: SETTINGS })
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
}
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
  for (const fn of [readDays, readMonths, readCoverage, saveStats, createStatsWorker, runAnalysis, toMonthPayload, toDayPayloads, readRxPicks, listStatsRxGroups, saveStatsRxGroups])
    vi.mocked(fn).mockReset()
  vi.mocked(listStatsRxGroups).mockResolvedValue([SAVED_GROUP])
  vi.mocked(saveStatsRxGroups).mockImplementation(async (after) => after.map((group, i) => ({ ...group, id: group.id ?? `saved${i}` })))
  answers(SAVED_NOW)
  vi.mocked(readRxPicks).mockResolvedValue([])
  vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-09-01', to: '2026-11-12' }])
  vi.mocked(saveStats).mockResolvedValue({ saved: 1 })
  for (const fn of Object.values(revenueStore)) fn.mockReset()
  revenueDb = new Map()
  revenueSavedTo = YESTERDAY
  revenueStore.loadDays.mockImplementation(async (range: DateRange) => savedRevenue(range))
  revenueStore.codeTotals.mockResolvedValue([])
  revenueStore.monthCodes.mockResolvedValue([])
  revenueStore.saveRange.mockImplementation(async (_range: DateRange, result: RevenueDaysResult) => {
    for (const row of result.days) revenueDb.set(row.date, { ...row, dayCodes: result.dayCodes !== undefined })
  })
  fakeWorker()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AC-514.1 첫 그림', () => {
  it('AC-514.1·AC-801.2·AC-1201.2·AC-4003.1·AC-4109.1 읽는 동안 섹션 자리는 열 칸 모두 "불러오는 중"이고 머리·기간은 먼저 보인다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    expect(screen.getByRole('heading', { name: '통계', level: 1 })).toBeTruthy()
    expect(screen.getByRole('group', { name: '기간' })).toBeTruthy()
    for (const name of SECTIONS) expect(heading(name)).toBeTruthy()
    expect(screen.getAllByText('불러오는 중')).toHaveLength(SECTIONS.length)
    expect(pageText()).not.toContain('아직 저장된 통계가 없어요')
  })

  it('AC-514.1·AC-513.1·AC-801.1·AC-1201.1·AC-4003.1 읽으면 섹션을 승인본 차례대로 그리고 readMonths를 쓰지 않는다', async () => {
    draw()
    await sectionsShown()
    expect(screen.queryByText('불러오는 중')).toBeNull()
    const order = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)
    expect(order).toEqual(SECTIONS)
    expect(heading('처방 추세')).toBeNull()
    expect(pageText()).toContain('하루 평균 환자 수')
    expect(readMonths).not.toHaveBeenCalled()
  })

  it('AC-514.1 저장된 숫자가 하나도 없으면 맨 위 안내와 빈 섹션이고, 처방별·보고는 비트 PC 안내다', async () => {
    answers({})
    draw()
    expect(await screen.findByText('아직 저장된 통계가 없어요')).toBeTruthy()
    expect(screen.getByText('비트 PC에서 [비트에서 불러오기]를 누르거나, 비트에서 내보낸 파일을 넣으면 숫자가 채워져요. 한 번 저장하면 휴대폰에서도 볼 수 있어요.')).toBeTruthy()
    expect(pageText()).toContain('숫자를 불러오면 이 기간의 평균 환자 수와 신환·재진이 보여요.')
    expect(screen.getAllByText('비트 PC에서 불러오면 보여요')).toHaveLength(BIT_ONLY_COUNT)
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

  it('AC-514.2·AC-4003.1·AC-4111.1 기간을 바꿔도 열어 둔 [자세히]는 열린 채다(notes §5)', async () => {
    const R90 = statsRange(TODAY, '90d')
    answers({ ...SAVED_NOW, [R90.current.from]: read([day('2026-11-01', 10), day('2026-11-02', 10)], { latest: BIT_AT }) })
    draw()
    await sectionsShown()
    const opened = () => screen.getAllByRole('button', { name: '접기' })
    fireEvent.click(screen.getAllByRole('button', { name: '자세히' })[0]!)
    expect(opened()).toHaveLength(1)

    pressPeriod('최근 90일')
    // 보이는 기다리는 칸 열이 모두 "불러오는 중"이다. 숨은 칸 묶음 안의 매출 읽는 중 글(기간 요약 둘째 줄·매출 칸)은 세지 않는다(stats-revenue AC-4111.1)
    expect(screen.getAllByText('불러오는 중').filter((node) => node.closest('[hidden]') === null)).toHaveLength(SECTIONS.length)
    await sectionsShown()
    expect(screen.queryByText('불러오는 중')).toBeNull()
    expect(opened()).toHaveLength(1)
  })
})

describe('AC-514.3 비트에서 불러오기', () => {
  it('AC-514.3·AC-3305.2 불러올 범위로 통로 → Worker → 저장 → 표에서 다시 읽기, 그동안 단추는 막힌다', async () => {
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
      groups: defsOf(SAVED_GROUP),
    })
    expect(saveStats).toHaveBeenCalledWith({ months: LOADED.months, days: LOADED.days, covered: LOADED.covered, source: 'bit' })
    await waitFor(() => expect(vi.mocked(readDays).mock.calls.length).toBeGreaterThan(reads))
    await waitFor(() => expect(screen.getByRole('button', { name: LOAD }).getAttribute('aria-disabled')).toBeNull())
  })

  it('AC-514.3 끝나면 처방별 신환·재진과 보고 문장이 생긴다', async () => {
    const { port } = await drawReady()
    expect(screen.getAllByText('비트 PC에서 불러오면 보여요')).toHaveLength(BIT_ONLY_COUNT)
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
    expect(saveStats).toHaveBeenCalledWith({ months: [], days: [{ ...FRESH_ROW, groups: [{ id: groupKey(SAVED_GROUP.codes), patients: 0, newPatients: 0, returning: 0 }] }], covered: { from: '2026-11-01', to: '2026-11-10' }, source: 'file' })
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

  it('AC-514.4·AC-4001.2 파일을 읽는 동안 불러오기·파일 고르기가 막히고, 끝나면 풀린다([불러오기 설정]을 펼쳐 본다)', async () => {
    let finish: (answer: Awaited<ReturnType<typeof runAnalysis>>) => void = () => {}
    vi.mocked(runAnalysis).mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    vi.mocked(toMonthPayload).mockReturnValue([])
    vi.mocked(toDayPayloads).mockReturnValue([])
    draw()
    await sectionsShown()
    openSettings()
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    const button = screen.getByRole('button', { name: '파일 고르기' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    await waitFor(() => expect(runAnalysis).toHaveBeenCalledTimes(1))

    await act(async () => finish({ files: [OK_REPORT], result: { quality: 'valid', skippedInvalidRows: 0 } as AnalysisResult }))
    await waitFor(() => expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBeNull())
  })
})

describe('AC-514.5 연결 상태', () => {
  it('AC-514.5·AC-4001.5 확장이 없는 곳은 [불러오기 설정]을 펼치면 안내와 파일 길이고, 저장된 숫자만 보인다', async () => {
    draw()
    await sectionsShown()
    expect(screen.getByText('비트 PC의 크롬에서 불러올 수 있어요')).toBeTruthy()
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
    openSettings()
    expect(screen.getByRole('button', { name: '파일 고르기' })).toBeTruthy()
    expect(pageText()).toContain('하루 평균 환자 수')
    expect(screen.getAllByText('비트 PC에서 불러오면 보여요')).toHaveLength(BIT_ONLY_COUNT)
  })

  it('AC-514.5 도우미가 없으면 안내와 /claim/setup 링크다', async () => {
    const port = fakeChrome()
    draw()
    act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code: 'E-HELPER-MISSING' }))
    await sectionsShown()
    expect(screen.getByText('이 PC에서는 아직 비트에서 불러올 수 없어요')).toBeTruthy()
    expect(screen.getByRole('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
  })

  it('AC-514.5·AC-4001.1 안심 줄은 하나이고 [불러오기 설정] 펼칠 칸 안에 늘 있다', async () => {
    draw()
    await sectionsShown()
    expect(screen.getAllByText(PRIVACY_LINE)).toHaveLength(1)
    const panel = document.getElementById(screen.getByRole('button', { name: SETTINGS }).getAttribute('aria-controls') ?? '')
    expect(panel?.contains(screen.getByText(PRIVACY_LINE))).toBe(true)
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

  it('AC-514.1·AC-4001.4 파일 확인 필요는 방금 불러온 처방별·보고가 없어 읽기가 실패하면 섹션을 그리지 않는다(읽기 실패는 접힌 채라 펼쳐 본다)', async () => {
    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    vi.mocked(runAnalysis).mockResolvedValue({ files: [OK_REPORT], result: { quality: 'incomplete', skippedInvalidRows: 5 } as AnalysisResult })
    vi.mocked(toMonthPayload).mockReturnValue(null)
    vi.mocked(toDayPayloads).mockReturnValue(null)
    draw()
    await screen.findByRole('alert')
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    openSettings()
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
  it('AC-514.2·AC-4003.1 기간을 바꾸면 그 기간 답이 올 때까지 앞 기간 처방 숫자를 보이지 않고 기다린다', async () => {
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

  it('AC-514.3·AC-4003.1 다시 불러오면 기간이 같아도 앞 불러오기의 처방 답을 쓰지 않고 새 답을 기다린다', async () => {
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

  it('AC-514.6·AC-4001.2 다시 저장하는 동안 불러오기·파일은 막혀 새 숫자가 옛 숫자에 덮이지 않는다', async () => {
    const { port } = await saveFailedOnce()
    fileGoesWell()
    let finish: (answer: { saved: number }) => void = () => {}
    vi.mocked(saveStats).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))

    const load = screen.getByRole('button', { name: LOAD })
    expect(load.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(load)
    expect(port.sent.filter((message) => message.cmd === 'stats.rows')).toHaveLength(1)

    openSettings()
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
  it('AC-514.7·AC-4001.6 비트 출처 줄: 가장 최근 시각(한국 시간)과 덮은 끝(짧은 끝 글)', async () => {
    draw()
    await sectionsShown()
    expect(pageText()).toContain('자료: 비트 PC · 11월 13일 18:42 저장 · 어제(11월 12일)까지')
    expect(pageText()).not.toContain('끝난 날로 저장했어요')
  })

  it('AC-514.7·AC-4001.6 파일 출처 줄', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01')], { latest: FILE_AT, fromFile: true }) })
    vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-09-01', to: '2026-11-05' }])
    draw()
    await sectionsShown()
    expect(pageText()).toContain('자료: 파일 · 11월 12일 18:30 저장 · 11월 5일까지')
    expect(pageText()).not.toContain('끝난 날로 저장했어요')
  })

  it('AC-514.8·AC-4001.6 오늘까지 덮었으면 오늘로 적는다', async () => {
    vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-09-01', to: TODAY }])
    draw()
    await sectionsShown()
    expect(pageText()).toContain('18:42 저장 · 오늘(11월 13일)까지')
    expect(pageText()).not.toContain('끝난 날로 저장했어요')
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
  it('AC-514.8·AC-4001.3 켜고 불러오면 closeToday true로 가고 보고 날짜 줄에 진료 중이 없다', async () => {
    const { port, fake } = await drawReady()
    openSettings()
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

  it('AC-514.10·AC-801.2·AC-1201.2·AC-4003.1·AC-4107.1 기다리는 칸은 섹션과 같은 12칸 배치이고 좁으면 모두 12칸이다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    const place = (name: string) => heading(name)?.closest('section')?.className ?? ''
    expect(place('기간 요약')).toContain('col-span-12')
    expect(place('환자 수 추이')).toContain('lg:col-span-8')
    expect(place('신환 재방문율')).toContain('lg:col-span-4')
    expect(place('처방')).not.toContain('lg:')
    expect(place('매출')).not.toContain('lg:')
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

describe('AC-514.11 저장했는데 읽지 못했을 때의 안내', () => {
  const SAVED_NOTE = '방금 불러온 숫자는 저장했어요.'
  const KEPT_NOTE = '방금 불러온 숫자는 화면에 그대로 있어요.'
  const READ_FAILED = '오류 번호 E-STATS-READ-FAILED'
  const readFails = () => vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
  const readFailedShown = () => waitFor(() => expect(pageText()).toContain(READ_FAILED))
  const noteShown = () => expect(screen.getByText(SAVED_NOTE)).toBeTruthy()
  const noNote = () => expect(screen.queryByText(SAVED_NOTE)).toBeNull()
  const rereadButton = () => screen.getByRole('button', { name: '다시 읽기' })

  // 비트 저장에 성공했는데 다시 읽기가 실패한 상태
  async function savedButReadFailed() {
    const { port } = await drawReady()
    readFails()
    pressLoad(port)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    await readFailedShown()
    await loadIsFree()
    return { port }
  }

  it('AC-514.11 비트 저장 성공 뒤 읽기 실패 → 카드·[다시 읽기]·이 글', async () => {
    await savedButReadFailed()
    const card = screen.getByRole('alert')
    expect(card.textContent).toContain(READ_FAILED)
    const note = screen.getByText(SAVED_NOTE)
    expect(note.parentElement).toBe(rereadButton().parentElement)
    expect(pageText()).not.toContain(KEPT_NOTE)
  })

  it('AC-514.11 파일 저장 성공 뒤 읽기 실패 → 이 글', async () => {
    fileGoesWell()
    draw()
    await sectionsShown()
    readFails()
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    await readFailedShown()
    noteShown()
  })

  it('AC-514.11 [다시 저장] 성공 뒤 읽기 실패 → 이 글이고, 저장 실패 때의 안내와 같은 자리·같은 모양이다', async () => {
    await saveFailedOnce()
    const kept = screen.getByText(KEPT_NOTE)
    const keptTag = kept.tagName
    const keptClass = kept.className
    expect(kept.parentElement).toBe(screen.getByRole('button', { name: '다시 저장' }).parentElement)

    readFails()
    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(2))
    await readFailedShown()

    const note = await screen.findByText(SAVED_NOTE)
    expect(note.tagName).toBe(keptTag)
    expect(note.className).toBe(keptClass)
    expect(note.parentElement).toBe(rereadButton().parentElement)
    expect(screen.queryByText(KEPT_NOTE)).toBeNull()
  })

  it('AC-514.11 저장 없이 처음 열 때 읽기 실패 → 이 글이 없다', async () => {
    readFails()
    draw()
    await readFailedShown()
    expect(rereadButton()).toBeTruthy()
    noNote()
  })

  it('AC-514.11 저장 실패와 읽기 실패가 함께 → "화면에 그대로 있어요"만 있고 이 글이 없다', async () => {
    readFails()
    vi.mocked(saveStats).mockRejectedValue(new Error('가짜 실패'))
    const port = fakeChrome()
    fakeWorker()
    draw()
    sayHello(port)
    await readFailedShown()
    pressLoad(port)
    expect(await screen.findByText(KEPT_NOTE)).toBeTruthy()
    await loadIsFree()
    expect(pageText()).toContain(READ_FAILED)
    noNote()
  })

  it('AC-514.11 [다시 읽기] 성공 → 없어지고, 그 뒤 다른 기간 읽기가 실패해도 없다', async () => {
    await savedButReadFailed()
    noteShown()

    answers(SAVED_NOW)
    fireEvent.click(rereadButton())
    await sectionsShown()
    noNote()

    readFails()
    pressPeriod('최근 90일')
    await readFailedShown()
    noNote()
  })

  it('AC-514.11 다른 기간 읽기에 성공해도 없어지고, 뒤의 읽기 실패에 돌아오지 않는다', async () => {
    await savedButReadFailed()
    noteShown()

    answers(SAVED_NOW)
    pressPeriod('최근 90일')
    await sectionsShown()
    noNote()

    readFails()
    pressPeriod('최근 30일')
    await readFailedShown()
    noNote()
  })

  it('AC-514.11 [다시 읽기]도 실패 → 읽는 동안은 카드와 함께 없고, 실패하면 카드와 함께 그대로 있다', async () => {
    await savedButReadFailed()
    noteShown()

    const rejects: ((error: Error) => void)[] = []
    vi.mocked(readDays).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejects.push(reject)
        }),
    )
    fireEvent.click(rereadButton())
    expect(pageText()).not.toContain(READ_FAILED)
    noNote()

    await act(async () => rejects.forEach((reject) => reject(new Error('가짜 실패'))))
    await readFailedShown()
    noteShown()
  })

  it('AC-514.11 기간을 바꿔 읽기가 실패 → 그대로 있다', async () => {
    await savedButReadFailed()
    noteShown()

    pressPeriod('최근 90일')
    await waitFor(() => expect(vi.mocked(readDays).mock.calls.some(([range]) => range.from === statsRange(TODAY, '90d').current.from)).toBe(true))
    await flush()
    await readFailedShown()
    expect(periodButtons()[2]?.getAttribute('aria-pressed')).toBe('true')
    noteShown()
  })

  it('AC-514.11 다음 [비트에서 불러오기]를 시작 → 없어지고, 그 불러오기가 실패해도 없다', async () => {
    const { port } = await savedButReadFailed()
    noteShown()

    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    noNote()

    act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code: 'E-STATS-TOO-BIG' }))
    await waitFor(() => expect(pageText()).toContain('오류 번호 E-STATS-TOO-BIG'))
    await loadIsFree()
    expect(pageText()).toContain(READ_FAILED)
    noNote()
  })

  it('AC-514.11 다음 불러오기의 저장이 실패해도 돌아오지 않고 "화면에 그대로 있어요"만 있다', async () => {
    const { port } = await savedButReadFailed()
    noteShown()

    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    pressLoad(port)
    expect(await screen.findByText(KEPT_NOTE)).toBeTruthy()
    await loadIsFree()
    expect(pageText()).toContain(READ_FAILED)
    noNote()
  })

  it('AC-514.11 파일 넣기를 시작 → 없어지고, 그 일이 실패해도 없다', async () => {
    await savedButReadFailed()
    noteShown()

    const { AnalyzeError } = await vi.importActual<typeof import('@/workers/runAnalysis')>('@/workers/runAnalysis')
    vi.mocked(runAnalysis).mockRejectedValue(new AnalyzeError('E-ANALYZE-TIMEOUT'))
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    noNote()

    await waitFor(() => expect(pageText()).toContain('오류 번호 E-ANALYZE-TIMEOUT'))
    await loadIsFree()
    expect(pageText()).toContain(READ_FAILED)
    noNote()
  })
})

describe('AC-514.12 답 없이 멈춘 불러오기', () => {
  const LIMIT_MS = 1_200_000
  const CARD = '오류 번호 E-BRIDGE-DISCONNECTED'
  const cards = () => screen.queryAllByRole('alert').map((card) => card.textContent ?? '')
  const hasCard = () => cards().some((text) => text.includes(CARD))
  const pressRetry = () => fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))

  // 불러오기를 눌러 답 없이 20분을 보낸다. 이 동안만 시계가 가짜다(findBy·waitFor는 진짜 시계로 돈다)
  async function stallLoad() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIMIT_MS)
    })
    vi.useRealTimers()
  }

  it('AC-514.12 멈춘 뒤 카드에 "오류 번호 E-BRIDGE-DISCONNECTED"가 있고 [다시 확인]이 보이며 [파일 고르기]에 aria-disabled가 없다', async () => {
    await drawReady()
    await stallLoad()

    expect(hasCard()).toBe(true)
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBeNull()
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
    expect(saveStats).not.toHaveBeenCalled()
  })

  it('AC-514.12 멈춘 뒤 [다시 확인]을 누르면 그 오류 카드가 없고, ready가 되면 [비트에서 불러오기]가 보인다', async () => {
    const { port } = await drawReady()
    await stallLoad()
    expect(hasCard()).toBe(true)

    pressRetry()
    expect(hasCard()).toBe(false)
    expect(pageText()).not.toContain(CARD)
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()

    sayHello(port)
    expect(await screen.findByRole('button', { name: LOAD })).toBeTruthy()
    expect(hasCard()).toBe(false)
  })

  it('AC-514.12 [다시 확인]으로 붙은 뒤 다시 끊겨도 앞 일의 오류 카드가 돌아오지 않고 비트 칸 안내만 있다', async () => {
    const { port } = await drawReady()
    await stallLoad()
    expect(hasCard()).toBe(true)
    pressRetry()
    sayHello(port)
    await screen.findByRole('button', { name: LOAD })

    act(() => port.fireDisconnect())

    expect(await screen.findByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(pageText()).toContain(CARD)
    expect(hasCard()).toBe(false)
  })

  it('AC-514.12 다시 붙은 뒤 다음 불러오기도 멈추면 그 일의 오류 카드가 보인다', async () => {
    const { port } = await drawReady()
    await stallLoad()
    expect(hasCard()).toBe(true)
    pressRetry()
    sayHello(port) // 가짜 크롬은 다시 붙어도 같은 포트를 준다
    await screen.findByRole('button', { name: LOAD })
    expect(hasCard()).toBe(false) // 지금부터 보이는 카드는 앞 일의 것이 아니다

    await stallLoad()

    expect(port.sent.filter((message) => message.cmd === 'stats.rows')).toHaveLength(2)
    expect(hasCard()).toBe(true)
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy()
  })

  it('AC-514.12 멈춘 뒤 늦은 조각·end가 와도 load 일을 시키지 않고 저장하지 않으며 오류 카드가 그대로다', async () => {
    const { port, fake } = await drawReady()
    await stallLoad()
    expect(hasCard()).toBe(true)
    expect(fake.sent.some((message) => message.type === 'bridge-port')).toBe(true) // 이 Worker가 화면이 쓰는 그 Worker다

    finishStream(port, ['가짜'])
    await flush()

    expect(fake.sent.some((message) => message.type === 'load')).toBe(false)
    expect(saveStats).not.toHaveBeenCalled()
    expect(hasCard()).toBe(true)
  })

  it('AC-514.12 [다시 확인]은 Worker를 그대로 두어 앞 불러오기의 처방별 표가 그대로다', async () => {
    const { port, hand } = await loadedWithSplit()
    await stallLoad()
    expect(hasCard()).toBe(true)

    pressRetry()
    sayHello(port)
    await screen.findByRole('button', { name: LOAD })

    expect(screen.getByText('가짜처방하나')).toBeTruthy()
    expect(hand.splits).toHaveLength(1)
    expect(createStatsWorker).toHaveBeenCalledTimes(1)
  })
})

describe('AC-514.13 저장하지 않은 불러오기의 안내 줄', () => {
  function fileIncomplete(failedFile: boolean, skippedInvalidRows: number) {
    vi.mocked(runAnalysis).mockResolvedValue({
      files: failedFile ? [OK_REPORT, { index: 1, ok: false, code: 'E-PARSE-EMPTY' }] : [OK_REPORT],
      result: { quality: 'incomplete', skippedInvalidRows } as AnalysisResult,
    })
    vi.mocked(toMonthPayload).mockReturnValue(null)
    vi.mocked(toDayPayloads).mockReturnValue(null)
  }

  async function dropFiles(...files: File[]) {
    draw()
    await sectionsShown()
    fireEvent.change(fileInput(), { target: { files } })
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
  }

  it('AC-514.13 파일 1건·줄 3건 → "읽지 못한 파일 1건 · 확인하지 못한 줄 3건이 있어요. 파일을 확인한 뒤 다시 넣어 주세요."', async () => {
    fileIncomplete(true, 3)
    await dropFiles(fakeFile('가짜좋은파일.xlsx'), fakeFile('가짜나쁜파일.xlsx'))
    expect(screen.getByText('읽지 못한 파일 1건 · 확인하지 못한 줄 3건이 있어요. 파일을 확인한 뒤 다시 넣어 주세요.')).toBeTruthy()
  })

  it('AC-514.13 줄 5건만 → "확인하지 못한 줄 5건이 있어요. 파일을 확인한 뒤 다시 넣어 주세요."', async () => {
    fileIncomplete(false, 5)
    await dropFiles(fakeFile())
    expect(screen.getByText('확인하지 못한 줄 5건이 있어요. 파일을 확인한 뒤 다시 넣어 주세요.')).toBeTruthy()
  })

  it('AC-514.13 파일 쪽 줄에 "비트에서 이 기록을 고친 뒤"가 없고 비트 쪽 줄은 그대로다', async () => {
    fileIncomplete(false, 5)
    await dropFiles(fakeFile())
    expect(pageText()).toContain('파일을 확인한 뒤 다시 넣어 주세요.')
    expect(pageText()).not.toContain('비트에서 이 기록을 고친 뒤')
    cleanup()

    const port = fakeChrome()
    fakeWorker(INCOMPLETE)
    draw()
    sayHello(port)
    await sectionsShown()
    pressLoad(port)
    await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
    expect(screen.getByText('차트번호 없는 내원 3건 · 중복 내원 1건 · 첫 내원을 못 찾은 환자 2명이 있어요. 비트에서 이 기록을 고친 뒤 다시 불러와 주세요.')).toBeTruthy()
    expect(pageText()).not.toContain('파일을 확인한 뒤')
  })
})

describe('처방 골라 보기를 통계 탭에 넣기 (rx-picker)', () => {
  const R7 = statsRange(TODAY, '7d')
  const R90 = statsRange(TODAY, '90d')
  const NAME = '가짜 고른 처방'
  const PICK = { code: 'A100', name: NAME }
  const withRx = (ymd: string): DayPayload => ({ ...day(ymd, 10), rx: [{ code: PICK.code, name: NAME, type: '', patients: 5, newPatients: 1, returning: 4 }] })
  const RX_DAYS = {
    [R30.current.from]: read([withRx('2026-11-10')], { latest: BIT_AT }),
    [R7.current.from]: read([withRx('2026-11-10')], { latest: BIT_AT }),
    [R90.current.from]: read([withRx('2026-11-10')], { latest: BIT_AT }),
  }
  // 처방 골라 보기는 처방 칸 셋째 탭이다(stats-pc-ux AC-4003.2): 탭을 고르고 그 패널 안에서 찾는다. 칸 설명은 처방 칸 머리 줄에 있다(AC-4003.4)
  const picker = () => within(rxPanel('처방 골라 보기'))
  const rowIn = (section: HTMLElement, expanded: boolean) => within(section).getByRole('button', { name: new RegExp(NAME), expanded })
  const WIDEST = { from: R12.previous.from, to: R12.current.to }
  const wideReads = () => vi.mocked(readDays).mock.calls.filter(([range]) => range.from === WIDEST.from && range.to === WIDEST.to).length

  it('AC-801.1·AC-1201.1·AC-4003.1 처방 골라 보기는 전체 폭 처방 칸의 셋째 탭이고, 다른 다섯 칸의 배치는 그대로다', async () => {
    draw()
    await sectionsShown()
    const place = (name: string) => sectionOf(name).className
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(SECTIONS)
    expect(place('처방')).toMatch(/(^| )col-span-12( |$)/)
    expect(place('처방')).not.toContain('lg:')
    expect(within(sectionOf('처방')).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(RX_TABS)
    picker()
    expect(within(rxHead()).getByText('고른 처방만 건수와 신환율·재진율, 같은 처방 재방문을 봐요')).toBeTruthy()
    const KEEP: [string, string[]][] = [
      ['기간 요약', ['col-span-12']],
      ['환자 수 추이', ['col-span-12', 'lg:col-span-8']],
      ['신환 재방문율', ['col-span-12', 'lg:col-span-4', 'lg:border-l', 'lg:border-line', 'lg:pl-6']],
      ['원장님 보고 문장', ['col-span-12', 'lg:col-span-7']],
      ['요일별 환자 수', ['col-span-12', 'lg:col-span-5', 'lg:border-l', 'lg:border-line', 'lg:pl-6']],
    ]
    for (const [name, classes] of KEEP) for (const one of classes) expect(place(name).split(' ')).toContain(one)
  })

  it('AC-801.2·AC-4003.1 기다리는 칸의 차례·자리가 그린 칸과 같다', async () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    const order = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)
    expect(order).toEqual(SECTIONS)
    expect(sectionOf('처방').textContent).toContain('불러오는 중')
    expect(sectionOf('처방').className).toMatch(/(^| )col-span-12( |$)/)
    expect(sectionOf('처방').className).not.toContain('lg:')
  })

  it('AC-801.3·AC-4003.5 저장된 숫자가 없으면 새 칸(셋째 탭)은 한 줄뿐이다', async () => {
    vi.mocked(readRxPicks).mockResolvedValue([PICK])
    answers({})
    draw()
    await sectionsShown()
    expect(rxPanel('처방 골라 보기').textContent).toContain('자료 없음 · 불러오면 처방을 골라 볼 수 있어요.')
    expect(picker().queryByRole('combobox')).toBeNull()
    expect(picker().queryByRole('button')).toBeNull()
  })

  it('AC-806.5·AC-1201.1·AC-4003.5 기간을 바꿔도 열린 줄과 그래프 모양이 그대로이고 새 칸(일→주)으로 그린다. 묶음별 추세 탭 줄 열림과 서로 상관없고 탭을 옮겨도 그대로다', async () => {
    vi.mocked(readRxPicks).mockResolvedValue([PICK])
    // 고른 처방 줄과 같은 날에 저장된 묶음의 열쇠 줄도 있다(처방별 추세 줄이 열 수 있는 줄이 된다)
    const counted = (ymd: string): DayPayload => ({ ...withRx(ymd), groups: [{ id: groupKey(SAVED_GROUP.codes), patients: 5, newPatients: 1, returning: 4 }] })
    answers({
      [R30.current.from]: read([counted('2026-11-10')], { latest: BIT_AT }),
      [R90.current.from]: read([counted('2026-11-10')], { latest: BIT_AT }),
    })
    const treatment = (expanded: boolean) => within(rxPanel('묶음별 추세')).getByRole('button', { name: new RegExp(SAVED_GROUP.name), expanded })
    draw()
    await sectionsShown()
    const row = await picker().findByRole('button', { name: new RegExp(NAME), expanded: false })
    fireEvent.click(row)
    fireEvent.click(picker().getByRole('button', { name: '신환·재진 나눠 보기' }))
    expect(picker().getByText(`${NAME} · 일별 건수`)).toBeTruthy()

    pressPeriod('최근 90일')
    await sectionsShown()
    await waitFor(() => expect(picker().getByText(`${NAME} · 주별 건수`)).toBeTruthy())
    expect(rowIn(rxPanel('처방 골라 보기'), true)).toBeTruthy()
    expect(picker().getByRole('button', { name: '신환·재진 나눠 보기' }).getAttribute('aria-pressed')).toBe('true')
    expect(picker().getByRole('button', { name: '건수만' }).getAttribute('aria-pressed')).toBe('false')
    // 처방별 추세 줄은 닫혀 있고, 열어도 새 칸이 그대로다
    expect(await waitFor(() => treatment(false))).toBeTruthy()
    fireEvent.click(treatment(false))
    expect(treatment(true)).toBeTruthy()
    expect(rowIn(rxPanel('처방 골라 보기'), true)).toBeTruthy()
    fireEvent.click(rowIn(rxPanel('처방 골라 보기'), true))
    expect(rowIn(rxPanel('처방 골라 보기'), false)).toBeTruthy()
    expect(treatment(true)).toBeTruthy()
  })

  it('AC-806.5·AC-4003.5 기간을 읽지 못했다가 [다시 읽기]로 돌아와도 열린 줄과 그래프 모양이 그대로다', async () => {
    vi.mocked(readRxPicks).mockResolvedValue([PICK])
    answers(RX_DAYS)
    draw()
    await sectionsShown()
    fireEvent.click(await picker().findByRole('button', { name: new RegExp(NAME), expanded: false }))
    fireEvent.click(picker().getByRole('button', { name: '신환·재진 나눠 보기' }))

    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    pressPeriod('최근 7일')
    const again = await screen.findByRole('button', { name: '다시 읽기' })
    answers(RX_DAYS)
    fireEvent.click(again)
    await sectionsShown()
    await waitFor(() => expect(rowIn(rxPanel('처방 골라 보기'), true)).toBeTruthy())
    expect(picker().getByRole('button', { name: '신환·재진 나눠 보기' }).getAttribute('aria-pressed')).toBe('true')
    expect(readRxPicks).toHaveBeenCalledTimes(1)
  })

  it('AC-802.5 찾기 칸을 열기 전에는 넓은 범위를 읽지 않는다', async () => {
    draw()
    await sectionsShown()
    await waitFor(() => expect(picker().getByRole('combobox').getAttribute('aria-disabled')).toBeNull())
    expect(wideReads()).toBe(0)
    fireEvent.click(picker().getByRole('combobox'))
    await waitFor(() => expect(wideReads()).toBe(1))
  })

  it('AC-802.7 새 숫자를 저장하면 열려 있는 찾기 목록이 넓은 범위를 바로 다시 읽는다', async () => {
    const { port } = await drawReady()
    await waitFor(() => expect(picker().getByRole('combobox').getAttribute('aria-disabled')).toBeNull())
    fireEvent.click(picker().getByRole('combobox'))
    await waitFor(() => expect(wideReads()).toBe(1))
    pressLoad(port)
    await waitFor(() => expect(wideReads()).toBe(2))
  })

  it('AC-812.3·AC-4003.1 고른 처방을 읽지 못하면 오류 카드는 이 칸(셋째 탭)에만 있고 다른 칸·기간 단추·다른 오류 카드는 그대로다', async () => {
    vi.mocked(readRxPicks).mockRejectedValue(new Error('가짜 실패'))
    draw()
    await sectionsShown()
    const card = await picker().findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-STATS-PICK-READ-FAILED')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    const again = screen.getAllByRole('button', { name: '다시 읽기' })
    expect(again).toHaveLength(1)
    expect(rxPanel('처방 골라 보기').contains(again[0]!)).toBe(true)
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(SECTIONS)
    expect(pageText()).toContain('하루 평균 환자 수')
    expect(pageText()).not.toContain('아직 고른 처방이 없어요')
    pressPeriod('최근 7일')
    await sectionsShown()
    expect(periodButtons().find((button) => button.textContent === '최근 7일')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('AC-812.6 고른 처방은 주소·브라우저 저장소에 남지 않는다', async () => {
    vi.mocked(readRxPicks).mockResolvedValue([PICK])
    answers(RX_DAYS)
    const { search, pathname } = window.location
    const state = window.history.state
    draw()
    await sectionsShown()
    fireEvent.click(await picker().findByRole('button', { name: new RegExp(NAME), expanded: false }))
    expect(window.location.search).toBe(search)
    expect(window.location.pathname).toBe(pathname)
    expect(window.history.state).toBe(state)
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  // fu-rate REQ-1308: 같은 처방 재방문 묶음. 고른 날 수는 RxPickerSection의 React 상태에만 있다
  const winIn = (w: 7 | 14 | 30, pressed?: boolean) => picker().getByRole('button', { name: `${w}일 안`, ...(pressed === undefined ? {} : { pressed }) })
  const EXTRA7 = { from: '2026-10-07', to: '2026-10-29' } // 오늘 11-13의 최근 7일 + 30일 창으로 옮긴 첫날 ~ 비교 기간 첫날 − 1
  const extraReads = () => vi.mocked(readDays).mock.calls.filter(([range]) => range.from === EXTRA7.from && range.to === EXTRA7.to).length

  it('AC-1308.1·AC-4003.4 새 설명 글(셋째 탭을 고르면 처방 칸 머리 줄)이고 칸 차례·자리(전체 폭)는 그대로다', async () => {
    draw()
    await sectionsShown()
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(SECTIONS)
    picker()
    expect(within(rxHead()).getByText('고른 처방만 건수와 신환율·재진율, 같은 처방 재방문을 봐요')).toBeTruthy()
    expect(sectionOf('처방').className).toMatch(/(^| )col-span-12( |$)/)
  })

  it('AC-1308.3 고른 날 수는 기간을 바꿔도 남고 다른 탭에 갔다 오면 `7일 안`이다. 누를 때 읽기·저장·저장소·주소를 부르지 않는다', async () => {
    vi.mocked(readRxPicks).mockResolvedValue([PICK])
    answers(RX_DAYS)
    const first = draw()
    await sectionsShown()
    expect(await picker().findByRole('button', { name: '7일 안', pressed: true })).toBeTruthy()

    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const pushState = vi.spyOn(window.history, 'pushState')
    const fakes = [readDays, readCoverage, saveStats, readRxPicks] as const
    const before = fakes.map((fn) => vi.mocked(fn).mock.calls.length)
    fireEvent.click(winIn(14))
    fireEvent.click(winIn(30))
    await flush()
    expect(winIn(30, true)).toBeTruthy()
    expect(fakes.map((fn) => vi.mocked(fn).mock.calls.length)).toEqual(before)

    pressPeriod('최근 90일')
    await sectionsShown()
    await waitFor(() => expect(winIn(30, true)).toBeTruthy())
    expect(winIn(7, false)).toBeTruthy()
    expect(setItem).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()

    first.unmount()
    draw()
    await sectionsShown()
    expect(await picker().findByRole('button', { name: '7일 안', pressed: true })).toBeTruthy()
  })

  it('AC-1308.4 최근 7일에서 30일을 누를 때만 넓은 날 줄을 한 번 더 읽고, 페이지 읽기와 찾기 목록 읽기 셈은 그대로다', async () => {
    vi.mocked(readRxPicks).mockResolvedValue([PICK])
    answers(RX_DAYS)
    draw()
    await sectionsShown()
    await picker().findByRole('button', { name: '7일 안', pressed: true })
    pressPeriod('최근 7일')
    await sectionsShown()
    await waitFor(() => expect(winIn(7, true)).toBeTruthy())
    await flush()
    expect(extraReads()).toBe(0) // 최근 7일 + 7일은 페이지 읽기 그대로다
    const before = vi.mocked(readDays).mock.calls.length

    fireEvent.click(winIn(30))
    await waitFor(() => expect(extraReads()).toBe(1))
    expect(vi.mocked(readCoverage).mock.calls.filter(([range]) => range.from === EXTRA7.from && range.to === EXTRA7.to)).toHaveLength(1)
    fireEvent.click(winIn(14))
    await flush()
    expect(vi.mocked(readDays).mock.calls.length).toBe(before + 1)
    expect(wideReads()).toBe(0)
  })
})

describe('AC-1205.7 불러올 때 묶음을 서버에서 다시 읽어 센다 (treatment-trend)', () => {
  // 다른 기기에서 고친 묶음(지어낸 이름·코드)
  const OTHER: RxGroup = { id: 'g1', name: '가짜 다른 기기 묶음', codes: ['B200', 'B201'], sortOrder: 0 }
  const loadMessage = (sent: StatsWorkerRequest[]) => sent.find((message) => message.type === 'load')
  // 처음 읽기가 상태에 들어가 칸에 저장된 묶음이 보일 때까지
  // 묶음별 추세는 처방 칸 첫 탭이다(stats-pc-ux AC-4003.2)
  const groupsShown = () => waitFor(() => expect(within(rxPanel('묶음별 추세')).getByText(SAVED_GROUP.name)).toBeTruthy())

  it('AC-1205.7 [비트에서 불러오기]는 묶음 다시 읽기를 비트 요청과 함께 시작하고 비트 요청을 늦추지 않으며, 다시 읽은 묶음을 Worker에 넘긴다', async () => {
    const { port, fake } = await drawReady()
    await groupsShown()
    expect(listStatsRxGroups).toHaveBeenCalledTimes(1)
    let answer: (rows: RxGroup[]) => void = () => undefined
    vi.mocked(listStatsRxGroups).mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))

    fireEvent.click(screen.getByRole('button', { name: LOAD }))
    expect(listStatsRxGroups).toHaveBeenCalledTimes(2)
    const request = finishStream(port) // 다시 읽기 답을 기다리지 않고 stats.rows가 이미 나갔다
    await flush()
    expect(loadMessage(fake.sent)).toBeUndefined()

    await act(async () => answer([OTHER]))
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    expect(loadMessage(fake.sent)).toEqual({ type: 'load', streamId: request.id, from: R30.load.from, to: R30.load.to, today: TODAY, closeToday: false, groups: defsOf(OTHER) })
  })

  it('AC-1205.7 비트 길: 다시 읽기가 실패하면 화면에 있는 묶음으로 세고 불러오기를 막지 않는다', async () => {
    const { port, fake } = await drawReady()
    await groupsShown()
    vi.mocked(listStatsRxGroups).mockRejectedValueOnce(new Error('가짜 실패'))
    const request = pressLoad(port)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    expect(listStatsRxGroups).toHaveBeenCalledTimes(2)
    expect(loadMessage(fake.sent)).toMatchObject({ type: 'load', streamId: request.id, groups: defsOf(SAVED_GROUP) })
    await loadIsFree()
  })

  it('AC-1205.7 파일을 넣으면 묶음을 서버에서 다시 읽어 그 묶음을 readFiles 셋째 인자로 넘긴다(Worker에는 열쇠·코드만)', async () => {
    fileGoesWell()
    draw()
    await sectionsShown()
    await groupsShown()
    vi.mocked(listStatsRxGroups).mockResolvedValueOnce([OTHER])
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    expect(listStatsRxGroups).toHaveBeenCalledTimes(2)
    expect(runAnalysis).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runAnalysis).mock.calls[0]![1]).toEqual({ today: TODAY, groups: defsOf(OTHER) })
    // 저장하는 일 줄에는 그 묶음 열쇠 줄이 있다(그날 없으면 0줄, AC-1205.3)
    expect(vi.mocked(saveStats).mock.calls[0]![0].days).toEqual([{ ...FRESH_ROW, groups: [{ id: groupKey(OTHER.codes), patients: 0, newPatients: 0, returning: 0 }] }])
  })

  it('AC-1205.7·AC-4001.2 파일 길: 다시 읽기가 실패하면 화면에 있는 묶음으로 세고 파일 넣기를 막지 않는다', async () => {
    fileGoesWell()
    draw()
    await sectionsShown()
    await groupsShown()
    vi.mocked(listStatsRxGroups).mockRejectedValueOnce(new Error('가짜 실패'))
    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    expect(vi.mocked(runAnalysis).mock.calls[0]![1]).toEqual({ today: TODAY, groups: defsOf(SAVED_GROUP) })
    openSettings()
    await waitFor(() => expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBeNull())
  })
})

describe('통계 화면에 기간 고르기 잇기 (stats-period TASK-8)', () => {
  const unitGroup = () => screen.getAllByRole('group', { name: '보는 단위' })[0]!
  const pressUnit = (name: '일별' | '주별' | '월별') => fireEvent.click(within(unitGroup()).getByRole('button', { name }))
  const unitPressed = () => within(unitGroup()).getAllByRole('button').map((button) => button.getAttribute('aria-pressed'))
  const customButton = () => within(screen.getByRole('group', { name: '기간 골라 보기' })).getByRole('button', { name: /^직접 날짜/ })
  const reportButtons = () => within(screen.getByRole('group', { name: '보고 고르기' })).getAllByRole('button')
  const KEY = groupKey(SAVED_GROUP.codes)
  const withGroup = (row: DayPayload, patients: number): DayPayload => ({ ...row, groups: [{ id: KEY, patients, newPatients: 1, returning: patients - 1 }] })
  // 10월: 하루 평균 42명(40·44명)·신환 4명·재진 80명, 9월: 39명, 작년 10월: 덮지 않음(자료 없음). 묶음 31건씩
  const OCTOBER = {
    '2026-10-01': read([withGroup(day('2026-10-05', 40), 31), withGroup(day('2026-10-06', 44), 31)], { latest: BIT_AT }),
    '2026-09-01': read([withGroup(day('2026-09-10', 39), 20)], { latest: BIT_AT }),
  }

  it('AC-1703.1·AC-1708.1 처음 열면 [최근 30일]만 눌려 있고 [일별][주별][월별]·[직접 날짜]는 안 눌려 있으며 글은 지금과 같다', async () => {
    draw()
    await sectionsShown()
    expect(screen.getByText('빠르게 보기')).toBeTruthy()
    expect(screen.getByRole('group', { name: '기간 골라 보기' })).toBeTruthy()
    expect(periodButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
    expect(unitPressed()).toEqual(['false', 'false', 'false'])
    expect(customButton().getAttribute('aria-pressed')).toBe('false')
    expect(pageText()).toContain('10월 14일 – 11월 12일 (어제까지)')
    expect(pageText()).toContain('비교: 9월 14일 – 10월 13일 (지난 30일)')
    expect(readDays).toHaveBeenCalledWith({ from: R30.current.from, to: R30.current.to })
    expect(readDays).toHaveBeenCalledWith({ from: R30.previous.from, to: R30.previous.to })
  })

  it('AC-1703.1 고른 것은 브라우저 저장소·주소·서버에 쓰지 않는다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const pushState = vi.spyOn(window.history, 'pushState')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    draw()
    await sectionsShown()
    pressUnit('일별')
    await sectionsShown()
    pressUnit('월별')
    await sectionsShown()
    fireEvent.click(screen.getByRole('button', { name: '이전 해' }))
    await sectionsShown()
    expect(setItem).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(saveStats).not.toHaveBeenCalled()
    expect(saveStatsRxGroups).not.toHaveBeenCalled()
  })

  it('AC-1703.1·AC-1708.1 고르기에서 [최근 30일]로 돌아오면 고르기가 모두 풀리고 글이 지금과 같다', async () => {
    draw()
    await sectionsShown()
    pressUnit('주별')
    await sectionsShown()
    expect(periodButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'false'])
    expect(unitPressed()).toEqual(['false', 'true', 'false'])
    pressPeriod('최근 30일')
    await sectionsShown()
    expect(periodButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
    expect(unitPressed()).toEqual(['false', 'false', 'false'])
    expect(pageText()).toContain('10월 14일 – 11월 12일 (어제까지)')
    expect(pageText()).toContain('비교: 9월 14일 – 10월 13일 (지난 30일)')
    expect(pageText()).not.toContain('(바로 전 달)')
  })

  it('AC-1703.4 2026년 10월 일별은 기간 글 하나와 비교 둘이다', async () => {
    draw()
    await sectionsShown()
    pressUnit('일별')
    expect(pageText()).toContain('2026년 10월 1일 – 31일 · 일별')
    expect(pageText()).toContain('비교: 9월 1일 – 30일 (바로 전 달) · 2025년 10월 1일 – 31일 (작년 같은 달)')
    expect(pageText()).not.toContain('(지난 30일)')
    await sectionsShown()
    pressUnit('주별')
    expect(pageText()).toContain('2026년 10월 1일 – 31일 · 주별')
  })

  it('AC-1703.4 끝나지 않은 달은 뒤에 (어제까지)이고 비교도 같은 날까지다', async () => {
    draw()
    await sectionsShown()
    pressUnit('일별')
    await sectionsShown()
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(pageText()).toContain('2026년 11월 1일 – 12일 · 일별 (어제까지)')
    expect(pageText()).toContain('비교: 10월 1일 – 12일 (바로 전 달 같은 날까지) · 2025년 11월 1일 – 12일 (작년 같은 날까지)')
  })

  it('AC-1703.4 해는 비교 하나이고, 끝나지 않은 해는 (어제까지)다', async () => {
    draw()
    await sectionsShown()
    pressUnit('월별')
    expect(pageText()).toContain('2026년 1월 1일 – 11월 12일 · 월별 (어제까지)')
    expect(pageText()).toContain('비교: 2025년 1월 1일 – 11월 12일 (작년 같은 날까지)')
    expect(pageText()).not.toContain('(작년 같은 날까지) ·')
    await sectionsShown()
    fireEvent.click(screen.getByRole('button', { name: '이전 해' }))
    expect(pageText()).toContain('2025년 1월 1일 – 12월 31일 · 월별')
    expect(pageText()).not.toContain('12월 31일 · 월별 (어제까지)')
    expect(pageText()).toContain('비교: 2024년 1월 1일 – 12월 31일 (작년)')
  })

  it('AC-1703.4 오늘 진료 끝으로 저장했으면(덮은 기간에 오늘이 듦) 끝나지 않은 기간은 (오늘까지)다', async () => {
    vi.mocked(readCoverage).mockResolvedValue([{ from: '2024-01-01', to: TODAY }])
    draw()
    await sectionsShown()
    pressUnit('월별')
    await sectionsShown()
    expect(pageText()).toContain('2026년 1월 1일 – 11월 13일 · 월별 (오늘까지)')
    expect(pageText()).toContain('비교: 2025년 1월 1일 – 11월 13일 (작년 같은 날까지)')
  })

  it('AC-1703.4 직접 날짜는 고른 날짜 그대로이고 비교 둘이다', async () => {
    draw()
    await sectionsShown()
    fireEvent.click(customButton())
    const panel = screen.getByRole('dialog', { name: '직접 날짜 고르기' })
    fireEvent.change(within(panel).getByLabelText('시작 날짜'), { target: { value: '2026-10-03' } })
    fireEvent.change(within(panel).getByLabelText('끝 날짜'), { target: { value: '2026-11-01' } })
    fireEvent.click(within(panel).getByRole('button', { name: '주별' }))
    fireEvent.click(within(panel).getByRole('button', { name: '이 기간 보기' }))
    expect(customButton().getAttribute('aria-pressed')).toBe('true')
    expect(pageText()).toContain('2026년 10월 3일 – 11월 1일 · 주별')
    expect(pageText()).toContain('비교: 9월 3일 – 10월 2일 (바로 전 30일) · 2025년 10월 3일 – 11월 1일 (작년 같은 날짜)')
    expect(pageText()).not.toContain('11월 1일 · 주별 (어제까지)')
  })

  it('AC-1703.6·AC-4003.4 고른 기간에서 [비트에서 불러오기]는 range.load 범위이고 처방별 신환·재진은 고른 기간(current)으로 묻는다', async () => {
    const { port, fake } = await drawReady()
    pressUnit('일별')
    await sectionsShown()
    const request = pressLoad(port)
    expect(request.args).toEqual({ from: '2025-10-01', to: TODAY })
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    expect(fake.sent.find((message) => message.type === 'load')).toMatchObject({ type: 'load', from: '2025-10-01', to: TODAY, today: TODAY })
    await waitFor(() => expect(fake.sent.at(-1)).toMatchObject({ type: 'split', from: '2026-10-01', to: '2026-10-31' }))
    await screen.findByText('가짜처방')
    await sectionsShown()
    // 설명은 둘째 탭을 고르면 처방 칸 머리 줄에 있다(stats-pc-ux AC-4003.4)
    rxPanel('처방별 신환·재진')
    expect(rxHead().textContent).toContain('처방마다 서로 다른 환자 수 · 2026년 10월')
  })

  it('AC-1703.6·AC-4003.4 빠른 단추의 처방별 신환·재진 설명은 지금과 같다(이름을 붙이지 않는다)', async () => {
    const { port } = await drawReady()
    pressLoad(port)
    await screen.findByText('가짜처방')
    await sectionsShown()
    rxPanel('처방별 신환·재진')
    expect(rxHead().textContent).toContain('처방마다 서로 다른 환자 수')
    expect(rxHead().textContent).not.toContain('처방마다 서로 다른 환자 수 · ')
  })

  it('AC-4003.4 고른 기간이면 탭마다 머리 줄 설명 끝에 기간 이름이 붙는다(지금 규칙 그대로)', async () => {
    answers({ ...SAVED_NOW, ...OCTOBER })
    draw()
    await sectionsShown()
    pressUnit('일별')
    await sectionsShown()
    const DESCS = {
      '묶음별 추세': '만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건 · 2026년 10월',
      '처방별 신환·재진': '처방마다 서로 다른 환자 수 · 2026년 10월',
      '처방 골라 보기': '고른 처방만 건수와 신환율·재진율, 같은 처방 재방문을 봐요 · 2026년 10월',
    } as const
    for (const name of RX_TABS) {
      rxPanel(name)
      expect(within(rxHead()).getByText(DESCS[name]), name).toBeTruthy()
    }
  })

  it('AC-1706.5·AC-4001.6 고른 기간의 출처 줄은 자르지 않은 덮은 기간의 끝(data.coveredTo)으로 쓴다', async () => {
    vi.mocked(readCoverage).mockResolvedValue([{ from: '2025-01-01', to: '2026-11-12' }])
    answers({ ...SAVED_NOW, ...OCTOBER })
    draw()
    await sectionsShown()
    pressUnit('일별')
    await sectionsShown()
    expect(pageText()).toContain('2026년 10월 1일 – 31일 · 일별')
    expect(pageText()).toContain('자료: 비트 PC · 11월 13일 18:42 저장 · 어제(11월 12일)까지')
    expect(pageText()).not.toContain('10월 31일까지')
  })

  it('AC-1707.1 고르기에 들어오면 [고른 기간 보고]가 맨 앞에 눌리고 저장된 숫자로 만든 글이며, 빠른 단추로 돌아오면 지금과 같다', async () => {
    answers({ ...SAVED_NOW, ...OCTOBER })
    draw()
    await sectionsShown()
    expect(screen.queryByRole('group', { name: '보고 고르기' })).toBeNull()
    pressUnit('일별')
    await sectionsShown()
    await waitFor(() => expect(reportButtons().map((button) => button.textContent)).toEqual(['고른 기간 보고', '오늘 일일보고', '어제 일일보고', '이번 달 월말보고', '지난달 월말보고']))
    expect(reportButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false'])
    const report = heading('원장님 보고 문장')!.closest('section')!
    await waitFor(() =>
      expect(report.textContent).toContain(
        '2026년 10월 1일 – 31일 환자는 하루 평균 42명, 신환 4명·재진 80명입니다. 하루 평균은 9월보다 3명(7.6%) 늘었습니다. 작년 10월은 자료가 없어 비교하지 않았습니다. 처방은 가짜 묶음 62건이 가장 많았습니다.',
      ),
    )

    pressPeriod('최근 30일')
    await sectionsShown()
    expect(screen.queryByRole('group', { name: '보고 고르기' })).toBeNull()
    expect(screen.getAllByText('비트 PC에서 불러오면 보여요')).toHaveLength(BIT_ONLY_COUNT)
  })

  it('AC-1707.1 보고 칸은 고르기에 들어오고 나갈 때 다시 그린다: 옛 넷에서 고른 것이 남지 않는다', async () => {
    const { port } = await drawReady()
    pressLoad(port)
    await screen.findByText('가짜처방')
    expect(reportButtons().map((button) => button.textContent)).toEqual(['오늘 일일보고', '어제 일일보고', '이번 달 월말보고', '지난달 월말보고'])
    fireEvent.click(within(screen.getByRole('group', { name: '보고 고르기' })).getByRole('button', { name: '어제 일일보고' }))

    pressUnit('일별')
    await sectionsShown()
    await waitFor(() => expect(reportButtons()[0]!.textContent).toBe('고른 기간 보고'))
    expect(reportButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false'])

    fireEvent.click(within(screen.getByRole('group', { name: '보고 고르기' })).getByRole('button', { name: '지난달 월말보고' }))
    pressPeriod('최근 7일')
    await sectionsShown()
    await waitFor(() => expect(reportButtons()).toHaveLength(4))
    expect(reportButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
  })

  it('AC-1708.1 고른 기간이면 섹션 설명 끝에 이름이 붙고, 빠른 단추로 돌아오면 붙지 않는다', async () => {
    answers({ ...SAVED_NOW, ...OCTOBER })
    draw()
    await sectionsShown()
    pressUnit('주별')
    await sectionsShown()
    expect(heading('환자 수 추이')!.closest('section')!.textContent).toContain(' · 2026년 10월')
    pressPeriod('최근 30일')
    await sectionsShown()
    expect(heading('환자 수 추이')!.closest('section')!.textContent).not.toContain(' · 2026년 10월')
  })

  it('AC-1706.4 고른 기간으로 읽고 불러와도 서버로 가는 것은 지금의 저장 모양뿐이고, 기간 고르기 파일은 서버·네트워크를 부르지 않는다', async () => {
    const { port } = await drawReady()
    pressUnit('일별')
    await sectionsShown()
    pressLoad(port)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(saveStats).mock.calls[0]![0]
    expect(Object.keys(sent).sort()).toEqual(['covered', 'days', 'months', 'source'])
    expect(sent).toEqual({ months: LOADED.months, days: LOADED.days, covered: LOADED.covered, source: 'bit' })
    expect(readMonths).not.toHaveBeenCalled()
    for (const [range] of vi.mocked(readDays).mock.calls) expect(Object.keys(range).sort()).toEqual(['from', 'to'])
    for (const [range] of vi.mocked(readCoverage).mock.calls) expect(Object.keys(range).sort()).toEqual(['from', 'to'])

    const ROOT = process.cwd()
    for (const name of ['StatsScreen.tsx', 'PeriodPicker.tsx', 'periodPick.ts', 'useStatsData.ts', 'view.ts', 'sections/StatsSections.tsx']) {
      const text = readFileSync(join(ROOT, 'src/components/stats', name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1')
      for (const word of ['supabase', 'fetch(', '.rpc(', '/api/', 'localStorage', 'sessionStorage']) expect(text, `${name}: ${word}`).not.toContain(word)
    }
  })
})

// ── stats-bit-sections: 비트 전용 세 칸(환자 구성·시간대별 접수·원장님별)을 묻고 넘긴다. 이름·숫자는 지어낸 것이다 ──
const BIT_TITLES = ['환자 구성', '시간대별 접수', '원장님별']
const BIT_ROW = { label: '30대', people: 2, visits: 3, share: 1, kind: 'row' as const, previous: 1 }
const BIT_MIX: PatientMix = {
  total: { people: 2, visits: 3 },
  compared: true,
  age: [BIT_ROW],
  insurance: [{ ...BIT_ROW, label: '가짜보험' }],
  city: [{ ...BIT_ROW, label: '가짜구' }],
  town: [{ ...BIT_ROW, label: '가짜동' }],
}
const BIT_HOURS = {
  hours: Array.from({ length: 13 }, (_, i) => 8 + i),
  rows: Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, openDays: i === 0 ? 1 : 0, cells: Array.from({ length: 13 }, (_, h) => (i === 0 && h === 1 ? 3 : 0)) })),
  unknown: 0,
  peak: { weekday: 1, hour: 9, average: 3 },
}
const BIT_DOCTOR = { label: '가짜원장', patients: 1, newPatients: 1, visits: 2, amount: 30000, perVisit: 15000, share: 0.6 }
const BIT_READY: BitSectionsView = {
  kind: 'ready',
  mix: { all: BIT_MIX, new: BIT_MIX },
  hours: BIT_HOURS,
  doctors: {
    kind: 'table',
    rows: [BIT_DOCTOR, { ...BIT_DOCTOR, label: '나가짜원장', newPatients: 0, visits: 1, amount: 20000, perVisit: 20000, share: 0.4 }],
    total: { ...BIT_DOCTOR, label: '합계', patients: 2, visits: 3, amount: 50000, perVisit: 16666, share: 1 },
  },
}

// fakeWorker에 세 칸 답을 더한다. answer가 null이면 답하지 않는다(기다리는 중)
function bitWorker(answer: (message: StatsSectionsRequest) => StatsWorkerMessage | null) {
  const fake = fakeWorker()
  const base = fake.worker.postMessage.getMockImplementation()!
  fake.worker.postMessage.mockImplementation((message: StatsWorkerRequest) => {
    base(message)
    if (message.type !== 'sections') return
    const data = answer(message)
    if (data !== null) queueMicrotask(() => fake.worker.onmessage?.({ data } as MessageEvent<StatsWorkerMessage>))
  })
  return fake
}
const sectionsSent = (sent: StatsWorkerRequest[]) => sent.filter((message) => message.type === 'sections')
const bitSection = (name: string) => heading(name)!.closest('section')!

async function loadedWithBit(answer: (message: StatsSectionsRequest) => StatsWorkerMessage | null) {
  const port = fakeChrome()
  const fake = bitWorker(answer)
  draw()
  sayHello(port)
  await sectionsShown()
  pressLoad(port)
  await screen.findByText('가짜처방')
  await sectionsShown()
  return { port, fake }
}

describe('AC-2706.1 stats-bit-sections: 통계 화면이 세 칸을 묻고 넘긴다', () => {
  it('AC-2706.1·AC-2706.5 여덟 칸 뒤에 환자 구성·시간대별 접수·원장님별이 12칸 폭이고, 이 기기에서 불러오기 전에는 Worker에 묻지 않고 비트 PC 안내다', async () => {
    const { fake } = await drawReady()
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((node) => node.textContent)
        .slice(-3),
    ).toEqual(BIT_TITLES)
    for (const name of BIT_TITLES) {
      expect(bitSection(name).className, name).toMatch(/(^| )col-span-12( |$)/)
      expect(bitSection(name).className, name).not.toContain('lg:')
      expect(bitSection(name).textContent, name).toContain('비트 PC에서 불러오면 보여요')
    }
    pressPeriod('최근 90일')
    await sectionsShown()
    expect(sectionsSent(fake.sent)).toEqual([])
  })

  it('AC-2706.1 읽는 동안 기다리는 칸에도 세 칸이 같은 자리에 있다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    for (const name of BIT_TITLES) {
      expect(bitSection(name).textContent, name).toContain('불러오는 중')
      expect(bitSection(name).className, name).toMatch(/(^| )col-span-12( |$)/)
    }
  })

  it('AC-2706.1 불러오면 고른 기간과 견줄 기간(range.previous)으로 묻고 답을 세 칸에 넘긴다', async () => {
    const { fake } = await loadedWithBit((message) => ({ type: 'sections-result', streamId: message.streamId, view: BIT_READY }))
    expect(sectionsSent(fake.sent)).toEqual([
      { type: 'sections', streamId: expect.any(String), from: R30.current.from, to: R30.current.to, previous: { from: R30.previous.from, to: R30.previous.to } },
    ])
    expect(await screen.findByText('명 = 서로 다른 환자 · 건 = 접수 건수 · 전체 2명')).toBeTruthy()
    expect(bitSection('환자 구성').textContent).toContain('어떤 분들이 오시는지 · 최근 30일')
    expect(bitSection('시간대별 접수').textContent).toContain('가장 붐비는 때는 월요일 오전 9시예요 · 하루 평균 3.0건')
    expect(within(bitSection('원장님별')).getByRole('table').textContent).toContain('나가짜원장')
  })

  it('AC-2706.1 기간을 바꾸면 다시 묻고 다시 불러오지 않는다. 12개월의 끝은 불러온 끝(오늘)에서 자른다', async () => {
    const { port, fake } = await loadedWithBit((message) => ({ type: 'sections-result', streamId: message.streamId, view: BIT_READY }))
    pressPeriod('최근 12개월')
    await waitFor(() =>
      expect(sectionsSent(fake.sent).at(-1)).toMatchObject({ from: R12.current.from, to: TODAY, previous: { from: R12.previous.from, to: R12.previous.to } }),
    )
    expect(sectionsSent(fake.sent)).toHaveLength(2)
    expect(port.sent.filter((message) => message.cmd === 'stats.rows')).toHaveLength(1)
    expect(await screen.findByText('어떤 분들이 오시는지 · 최근 12개월')).toBeTruthy()
  })

  it.each<[string, BitSectionsView, string]>([
    ['none', { kind: 'none' }, '이 기간은 아직 불러오지 않았어요'],
    ['old-helper', { kind: 'old-helper' }, '도우미를 업데이트하면 보여요'],
  ])('AC-2706.5 Worker가 %s로 답하면 세 칸 모두 그 안내다', async (_name, view, title) => {
    await loadedWithBit((message) => ({ type: 'sections-result', streamId: message.streamId, view }))
    await waitFor(() => expect(bitSection('환자 구성').textContent).toContain(title))
    for (const name of BIT_TITLES) expect(bitSection(name).textContent, name).toContain(title)
  })

  it('AC-2706.1 세 칸 답을 기다리는 동안 다른 칸은 그대로 그리고 세 칸은 제목·설명만이다', async () => {
    await loadedWithBit(() => null)
    expect(screen.getByText('가짜처방')).toBeTruthy()
    expect(bitSection('환자 구성').textContent).toBe('환자 구성어떤 분들이 오시는지 · 최근 30일')
    expect(bitSection('원장님별').textContent).toBe('원장님별원장님마다 환자·신환·매출 · 최근 30일')
  })

  it('AC-2706.1 세 칸 답이 실패하면 오류 카드 하나(번호만)이고 세 칸은 숫자 없이 비트 PC 안내다', async () => {
    await loadedWithBit((message) => ({ type: 'failed', streamId: message.streamId, code: 'E-ANALYZE-FAILED' }))
    await waitFor(() => expect(screen.getAllByRole('alert').filter((card) => card.textContent?.includes('오류 번호 E-ANALYZE-FAILED'))).toHaveLength(1))
    expect(bitSection('환자 구성').textContent).toContain('비트 PC에서 불러오면 보여요')
  })
})

// ── 비트 저장에 세 칸 합계(sections)를 싣기 (spec stats-bit-ai AC-2902.2) ──
describe('AC-2902.2 통계 화면 비트 저장', () => {
  const SECTIONS: MonthSections[] = [
    {
      v: 1,
      month: '2026-11',
      partial: true,
      mix: { people: 0, age: [], insurance: [], town: [] },
      hours: { openDays: [0, 0, 0, 0, 0, 0, 0], weekdays: [0, 0, 0, 0, 0, 0, 0], hours: Array(13).fill(0), unknown: 0 },
      doctors: [{ name: '김가상', patients: 0, newPatients: 0, amount: 0 }],
    },
  ]

  it('AC-2902.2 비트에서 불러오면 Worker가 준 sections를 달·일 숫자와 함께 저장에 그대로 넘긴다(화면 모양은 그대로)', async () => {
    const port = fakeChrome()
    fakeWorker({ ...LOADED, sections: SECTIONS })
    draw()
    sayHello(port)
    await sectionsShown()
    pressLoad(port)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    expect(vi.mocked(saveStats).mock.calls[0][0]).toStrictEqual({
      months: LOADED.months,
      days: LOADED.days,
      covered: LOADED.covered,
      source: 'bit',
      sections: SECTIONS,
    })
  })
})

// ── 불러올 기간을 나눠 차례로 읽고 저장·멈춤·이어서 (stats-load-range TASK-5, REQ-3303) ──
// 오늘은 이 파일의 TODAY(2026-11-13)이고 '최근 30일'을 보는 중이다. 전체 기간은 2년씩 넷(keepAt 0)이다(loadPlan.ts planLoad)
describe('REQ-3303 stats-load-range: 차례대로 읽고 저장·멈춤·이어서', () => {
  const YESTERDAY = '2026-11-12'
  const ALL = '전체 기간'
  const RESUME = '이어서 불러오기'
  const OTHER_VISITS = 4321 // 첫 불러오기 말고 다른 답의 보고 숫자(보고 문장은 첫 조각 답으로만 정한다)
  // 넷의 read(새것부터, 이웃 조각 쪽으로 31일씩 더 읽는다)
  const ALL_READS: DateRange[] = [
    { from: '2024-10-31', to: TODAY },
    { from: '2022-10-31', to: '2024-12-31' },
    { from: '2020-10-31', to: '2022-12-31' },
    { from: '2020-01-01', to: '2020-12-31' },
  ]
  // 넷이 저장할 것(partSave): 아래 답의 날 줄(read 첫날·40일 뒤·끝날) 가운데 save 안의 날, 덮은 기간은 save와 겹친 곳.
  // 둘째 ~ 넷째(가장 새 조각이 아님)는 날 줄의 after30이 null이다(AC-3302.7)
  const ALL_SAVES = [
    { days: ['2024-12-10', TODAY], covered: { from: '2024-12-01', to: YESTERDAY } },
    { days: ['2022-12-10'], covered: { from: '2022-12-01', to: '2024-11-30' } },
    { days: ['2020-12-10'], covered: { from: '2020-12-01', to: '2022-11-30' } },
    { days: ['2020-01-01', '2020-02-10'], covered: { from: '2020-01-01', to: '2020-11-30' } },
  ]
  const ALL_MONTHS = ['2024년 12월 – 2026년 11월', '2022년 12월 – 2024년 11월', '2020년 12월 – 2022년 11월', '2020년 1월 – 2020년 11월']
  const progress = (k: number, n: number, months: string) => `비트 PC에서 읽는 중이에요 (${k}/${n} · ${months}). 다 끝날 때까지 이 창을 닫지 마세요.`
  const DONE = ['2020년 1월 1일 – 2026년 11월 12일을 저장했어요.', '이제 위쪽 기간 고르기에서 2020년부터 어느 달·해든 볼 수 있어요.']
  const PRIVACY = '환자 개인정보는 의원 PC 밖으로 나가지 않아요. 서버에는 숫자만 저장해요.'

  type Answer = (nth: number, message: StatsLoadRequest) => StatsWorkerMessage | null

  const todayReport = (visits: number): ClinicReportNumbers => {
    const base = numbers(TODAY)
    return base.ok ? { ...base, totalVisits: visits } : base
  }

  // 읽은 범위로 만든 답: 날 줄은 read 첫날·40일 뒤·끝날, 덮은 기간은 끝난 마지막 날(어제)까지. 보고 숫자는 첫 불러오기만 120명
  function viewOf({ from, to }: DateRange, nth: number): StatsLoaded {
    return {
      range: { from, to },
      covered: { from, to: compareYmd(to, YESTERDAY) > 0 ? YESTERDAY : to },
      quality: 'valid',
      checks: { noChart: 0, duplicate: 0, noFirst: 0 },
      months: [],
      days: [day(from), day(addDays(from, 40)), day(to)],
      report: { daily: [todayReport(nth === 0 ? 120 : OTHER_VISITS)], monthly: [numbers('2026-11')] },
    }
  }
  const incompleteOf = (message: StatsLoadRequest, nth: number): StatsWorkerMessage => ({
    type: 'loaded',
    streamId: message.streamId,
    view: { ...viewOf(message, nth), quality: 'incomplete', checks: { noChart: 2, duplicate: 0, noFirst: 0 }, months: null, days: null },
  })

  // 불러오기 답을 몇 번째 불러오기(nth, 0부터)인지로 고르는 가짜 Worker. answer가 null이면 읽은 범위의 기본 답이다
  function partsWorker(answer: Answer = () => null) {
    const fake = fakeWorker()
    let nth = 0
    fake.worker.postMessage.mockImplementation((message: StatsWorkerRequest) => {
      fake.sent.push(message)
      const reply = (data: StatsWorkerMessage) => queueMicrotask(() => fake.worker.onmessage?.({ data } as MessageEvent<StatsWorkerMessage>))
      if (message.type === 'load') {
        const at = nth++
        reply(answer(at, message) ?? { type: 'loaded', streamId: message.streamId, view: viewOf(message, at) })
      }
      if (message.type === 'split') reply({ type: 'split-result', streamId: message.streamId, view: SPLIT })
    })
    return fake
  }

  async function readyWith(answer?: Answer) {
    const port = fakeChrome()
    const fake = partsWorker(answer)
    draw()
    sayHello(port)
    await sectionsShown()
    return { port, fake }
  }

  const rowsSent = (port: FakePort) => port.sent.filter((message) => message.cmd === 'stats.rows')
  const loadsSent = (sent: StatsWorkerRequest[]) => sent.filter((message): message is StatsLoadRequest => message.type === 'load')
  const splitsSent = (sent: StatsWorkerRequest[]) => sent.filter((message) => message.type === 'split')
  // 불러올 기간·오늘 진료 끝은 [불러오기 설정] 펼칠 칸 안이다(stats-pc-ux AC-4001.1). [비트에서 불러오기]는 띠에 있다
  const pickSpan = (name: string) => {
    openSettings()
    fireEvent.click(within(screen.getByRole('group', { name: '불러올 기간' })).getByRole('button', { name }))
  }
  const pressStart = () => fireEvent.click(screen.getByRole('button', { name: LOAD }))
  const closeToday = () => {
    openSettings()
    fireEvent.click(screen.getByRole('checkbox', { name: '오늘 진료 끝' }))
  }
  const reportText = () => heading('원장님 보고 문장')!.closest('section')!.textContent ?? ''
  const boxOf = (text: string) => screen.getByText(text).closest('[role="status"]') as HTMLElement
  const failRows = (port: FakePort, code = 'E-STATS-TOO-BIG') => act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code }))
  const cardsWith = (code: string) => screen.queryAllByRole('alert').filter((card) => card.textContent?.includes(code))

  // k번째(1부터) 요청이 나오기를 기다려 끝낸다. 요청은 앞 조각 저장이 끝난 뒤에 나온다
  async function finishPart(port: FakePort, k: number) {
    await waitFor(() => expect(rowsSent(port)).toHaveLength(k))
    return finishStream(port)
  }

  async function finishAll(port: FakePort, from = 1, to = ALL_READS.length) {
    for (let k = from; k <= to; k++) await finishPart(port, k)
  }

  // 2024년(월별)을 고른다: 월별(올해) → 이전 해 두 번
  async function pickYear2024() {
    fireEvent.click(within(screen.getAllByRole('group', { name: '보는 단위' })[0]!).getByRole('button', { name: '월별' }))
    await sectionsShown()
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('button', { name: '이전 해' }))
      await sectionsShown()
    }
    expect(pageText()).toContain('2024년 1월 1일 – 12월 31일 · 월별')
  }

  it('AC-3303.1 지금 보는 기간(처음 값)은 지금과 같다: 요청 하나 · keep 칸 없음 · 누른 closeToday · Worker 값 그대로 저장 · 끝난 상자 없음', async () => {
    const { port, fake } = await drawReady()
    closeToday()
    pressStart()
    expect(pageText()).toContain('비트 PC에서 읽는 중이에요. 기간이 길면 1분쯤 걸려요.')
    const request = finishStream(port)
    expect(request.args).toEqual({ from: R30.load.from, to: TODAY })
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    const loads = loadsSent(fake.sent)
    expect(loads).toEqual([{ type: 'load', streamId: request.id, from: R30.load.from, to: TODAY, today: TODAY, closeToday: true, groups: defsOf(SAVED_GROUP) }])
    expect('keep' in loads[0]!).toBe(false)
    expect(vi.mocked(saveStats).mock.calls[0]![0]).toStrictEqual({ months: LOADED.months, days: LOADED.days, covered: LOADED.covered, source: 'bit' })
    await loadIsFree()
    await sectionsShown()
    await waitFor(() => expect(pageText()).toContain('18:42 저장 · 방금'))
    expect(rowsSent(port)).toHaveLength(1)
    expect(pageText()).not.toContain('을 저장했어요.')
    expect(screen.queryByRole('button', { name: RESUME })).toBeNull()
  })

  it.each([
    ['최근 1년', '2025-12-01'],
    ['최근 2년', '2024-12-01'],
  ])('AC-3303.1 %s도 한 번에 읽는 길이면 요청 하나 · keep 칸 없음 · 끝난 상자 없음', async (name, from) => {
    const { port, fake } = await drawReady()
    pickSpan(name)
    const request = pressLoad(port)
    expect(request.args).toEqual({ from, to: TODAY })
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    await loadIsFree()
    const loads = loadsSent(fake.sent)
    expect(loads).toHaveLength(1)
    expect('keep' in loads[0]!).toBe(false)
    expect(loads[0]).toMatchObject({ from, to: TODAY, closeToday: false })
    expect(rowsSent(port)).toHaveLength(1)
    expect(pageText()).not.toContain('을 저장했어요.')
  })

  it('AC-3303.2 전체 기간은 넷을 새것부터 읽고, 다음 요청은 앞 조각의 저장이 끝난 뒤에야 보낸다', async () => {
    const { port } = await readyWith()
    const saves: (() => void)[] = []
    vi.mocked(saveStats).mockImplementation(() => new Promise((resolve) => void saves.push(() => resolve({ saved: 1 }))))
    pickSpan(ALL)
    pressStart()
    for (const [k, read] of ALL_READS.entries()) {
      await waitFor(() => expect(rowsSent(port)).toHaveLength(k + 1))
      expect(finishStream(port).args).toEqual(read)
      await waitFor(() => expect(saves).toHaveLength(k + 1))
      await flush()
      expect(rowsSent(port)).toHaveLength(k + 1) // 이 조각의 저장이 끝나기 전에는 다음 조각을 묻지 않는다
      await act(async () => saves[k]!())
    }
    await loadIsFree()
    expect(rowsSent(port)).toHaveLength(ALL_READS.length)
  })

  it('AC-3303.2 closeToday는 첫 조각만 누른 값, keep은 keepAt(첫) 조각만 칸이 없고 나머지는 false, 조각마다 partSave 값으로 한 번씩 저장하고 묶음은 누를 때 한 번 읽는다', async () => {
    const { port, fake } = await readyWith()
    await waitFor(() => expect(listStatsRxGroups).toHaveBeenCalledTimes(1))
    closeToday()
    pickSpan(ALL)
    pressStart()
    const ids: unknown[] = []
    for (let k = 1; k <= ALL_READS.length; k++) ids.push((await finishPart(port, k)).id)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(ALL_READS.length))
    await loadIsFree()

    const loads = loadsSent(fake.sent)
    expect(loads).toEqual(
      ALL_READS.map((read, k) => ({ type: 'load', streamId: ids[k], ...read, today: TODAY, closeToday: k === 0, groups: defsOf(SAVED_GROUP), ...(k === 0 ? {} : { keep: false }) })),
    )
    expect('keep' in loads[0]!).toBe(false)
    expect(vi.mocked(saveStats).mock.calls.map(([input]) => input)).toStrictEqual(
      ALL_SAVES.map(({ days, covered }, k) => ({
        months: [],
        days: days.map((ymd) => (k === 0 ? day(ymd) : { ...day(ymd), revisit: { ...day(ymd).revisit, after30: null } })),
        covered,
        source: 'bit',
      })),
    )
    expect(listStatsRxGroups).toHaveBeenCalledTimes(2)
    // 오늘 진료 끝으로 눌렀으니 저장한 끝날은 오늘이다(AC-3303.5)
    expect(await screen.findByText('2020년 1월 1일 – 2026년 11월 13일을 저장했어요.')).toBeTruthy()
  })

  it('AC-3303.3 최근 30일 + 전체 기간: 보고 문장은 첫 조각 답이고, 처방별 신환·재진과 세 칸은 첫 조각(keepAt) 뒤 한 번만 최근 30일로 묻는다', async () => {
    const { port, fake } = await readyWith()
    pickSpan(ALL)
    pressStart()
    await finishAll(port)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(ALL_READS.length))
    await loadIsFree()
    await sectionsShown()
    expect(await screen.findByText('가짜처방')).toBeTruthy()

    const splits = splitsSent(fake.sent)
    expect(splits).toHaveLength(1)
    expect(splits[0]).toMatchObject({ from: R30.current.from, to: R30.current.to })
    expect(sectionsSent(fake.sent)).toHaveLength(1)
    expect(sectionsSent(fake.sent)[0]).toMatchObject({ from: R30.current.from, to: R30.current.to })
    expect(fake.sent.indexOf(splits[0]!)).toBeGreaterThan(fake.sent.indexOf(loadsSent(fake.sent)[0]!))
    expect(reportText()).toContain('120명')
    expect(reportText()).not.toContain('4,321')
  })

  it('AC-3303.3 2024년(월별) + 지금 보는 기간: 조각 둘이고 keep은 둘째만 칸이 없으며, 처방별·세 칸은 둘째 조각을 읽은 뒤 2024년으로 묻는다', async () => {
    const { port, fake } = await readyWith()
    await pickYear2024()
    pressStart()
    expect((await finishPart(port, 1)).args).toEqual({ from: '2024-10-31', to: TODAY })
    await waitFor(() => expect(rowsSent(port)).toHaveLength(2))
    expect(splitsSent(fake.sent)).toEqual([]) // 첫 조각(keep: false)을 읽은 뒤에는 묻지 않는다
    expect(sectionsSent(fake.sent)).toEqual([])
    expect(finishStream(port).args).toEqual({ from: '2023-01-01', to: '2024-12-31' })
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(2))
    await loadIsFree()

    const loads = loadsSent(fake.sent)
    expect(loads.map((message) => ('keep' in message ? message.keep : '칸 없음'))).toEqual([false, '칸 없음'])
    await waitFor(() => expect(splitsSent(fake.sent)).toHaveLength(1))
    const split = splitsSent(fake.sent)[0]!
    expect(split).toMatchObject({ from: '2024-01-01', to: '2024-12-31' })
    expect(sectionsSent(fake.sent)[0]).toMatchObject({ from: '2024-01-01', to: '2024-12-31' })
    expect(fake.sent.indexOf(split)).toBeGreaterThan(fake.sent.indexOf(loads[1]!))
    expect(await screen.findByText('가짜처방')).toBeTruthy()
    await sectionsShown()
    // 고른 기간이면 보고 칸은 [고른 기간 보고]가 먼저다(AC-1707.1). 불러온 보고 문장은 [오늘 일일보고]에 있다
    fireEvent.click(within(screen.getByRole('group', { name: '보고 고르기' })).getByRole('button', { name: '오늘 일일보고' }))
    expect(reportText()).toContain('120명')
    expect(reportText()).not.toContain('4,321')
    expect(boxOf('2023년 1월 1일 – 2026년 11월 12일을 저장했어요.').textContent).toContain('이제 위쪽 기간 고르기에서 2023년부터 어느 달·해든 볼 수 있어요.')
  })

  it('AC-3303.4 나눠 읽는 동안 읽는 중 줄은 (k/N · 그 조각의 달)이고, 다 끝날 때까지 불러오기·파일·불러올 기간 단추가 막힌다', async () => {
    const { port } = await readyWith()
    pickSpan(ALL)
    pressStart()
    for (const [k, months] of ALL_MONTHS.entries()) {
      await waitFor(() => expect(rowsSent(port)).toHaveLength(k + 1))
      expect(pageText()).toContain(progress(k + 1, 4, months))
      expect(pageText()).not.toContain('기간이 길면 1분쯤 걸려요.')
      expect(screen.getByRole('button', { name: '불러오는 중' }).getAttribute('aria-disabled')).toBe('true')
      expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBe('true')
      for (const button of within(screen.getByRole('group', { name: '불러올 기간' })).getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true)
      finishStream(port)
    }
    await loadIsFree()
    expect(pageText()).not.toContain('비트 PC에서 읽는 중이에요')
  })

  it('AC-3303.5·AC-4001.7 넷을 다 저장하면 불러오기 상자(개인정보 안내 줄이 든 펼칠 칸 포함) 바로 아래 상자(role=status)에 저장한 날짜(해를 넘으면 양 끝에 해)와 볼 수 있는 해가 있다', async () => {
    const { port } = await readyWith()
    pickSpan(ALL)
    pressStart()
    await finishAll(port)
    const first = await screen.findByText(DONE[0]!)
    const box = boxOf(DONE[0]!)
    expect(box.textContent).toBe(DONE.join(''))
    expect(first.className).toContain('font-semibold')
    expect(screen.getByText(DONE[1]!).className).toContain('text-small')
    expect(screen.getByRole('button', { name: '파일 고르기' }).compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(PRIVACY).compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: RESUME })).toBeNull()
    await loadIsFree()
  })

  it('AC-3303.6·AC-4001.7 셋째 조각에서 통로가 끊기면 앞 둘은 저장된 채 멈추고, 불러오기 상자 아래 상자에 번호와 [이어서 불러오기]가 있으며 오류 카드·넷째 요청은 없다', async () => {
    const { port } = await readyWith()
    pickSpan(ALL)
    pressStart()
    await finishAll(port, 1, 2)
    await waitFor(() => expect(rowsSent(port)).toHaveLength(3))
    act(() => port.fireDisconnect())

    const box = await waitFor(() => boxOf('4번 가운데 2번째까지 저장하고 멈췄어요.'))
    expect(box.textContent).toContain('2022년 12월 – 2026년 11월은 저장됐어요. 남은 2020년 1월 – 2022년 11월은 [이어서 불러오기]로 읽어요. (오류 번호 E-BRIDGE-DISCONNECTED)')
    expect(within(box).getByRole('button', { name: RESUME })).toBeTruthy()
    expect(screen.getByText('4번 가운데 2번째까지 저장하고 멈췄어요.').className).toContain('font-semibold')
    expect(screen.getByText(PRIVACY).compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await flush()
    expect(saveStats).toHaveBeenCalledTimes(2)
    expect(rowsSent(port)).toHaveLength(3)
    expect(cardsWith('E-BRIDGE-DISCONNECTED')).toEqual([])
    expect(pageText()).not.toContain('을 저장했어요.')
  })

  it.each<[string, string, Answer, (port: FakePort) => unknown]>([
    ['통로', 'E-STATS-TOO-BIG', () => null, (port) => failRows(port)],
    ['Worker', 'E-ANALYZE-FAILED', (nth, message) => (nth === 2 ? { type: 'failed', streamId: message.streamId, code: 'E-ANALYZE-FAILED' } : null), (port) => finishStream(port)],
  ])('AC-3303.6 셋째 조각의 %s 오류 번호(%s)는 멈춤 상자에만 있고 오류 카드가 없으며 넷째를 읽지 않는다', async (_name, code, answer, failThird) => {
    const { port } = await readyWith(answer)
    pickSpan(ALL)
    pressStart()
    await finishAll(port, 1, 2)
    await waitFor(() => expect(rowsSent(port)).toHaveLength(3))
    failThird(port)

    const box = await waitFor(() => boxOf('4번 가운데 2번째까지 저장하고 멈췄어요.'))
    expect(box.textContent).toContain(`남은 2020년 1월 – 2022년 11월은 [이어서 불러오기]로 읽어요. (오류 번호 ${code})`)
    await loadIsFree()
    await flush()
    expect(saveStats).toHaveBeenCalledTimes(2)
    expect(rowsSent(port)).toHaveLength(3)
    expect(cardsWith(code)).toEqual([])
  })

  it('AC-3303.6 둘째 조각 저장이 실패하면 멈춤 상자(E-STATS-SAVE-FAILED)와 [다시 저장] 카드가 함께 있고 셋째를 읽지 않는다', async () => {
    vi.mocked(saveStats).mockResolvedValueOnce({ saved: 1 }).mockRejectedValueOnce(new Error('가짜 실패'))
    const { port } = await readyWith()
    pickSpan(ALL)
    pressStart()
    await finishAll(port, 1, 2)

    const box = await waitFor(() => boxOf('4번 가운데 1번째까지 저장하고 멈췄어요.'))
    expect(box.textContent).toContain('2024년 12월 – 2026년 11월은 저장됐어요. 남은 2020년 1월 – 2024년 11월은 [이어서 불러오기]로 읽어요. (오류 번호 E-STATS-SAVE-FAILED)')
    expect(within(box).getByRole('button', { name: RESUME })).toBeTruthy()
    expect(await screen.findByRole('button', { name: '다시 저장' })).toBeTruthy()
    expect(cardsWith('E-STATS-SAVE-FAILED')).toHaveLength(1)
    await loadIsFree()
    await flush()
    expect(saveStats).toHaveBeenCalledTimes(2)
    expect(rowsSent(port)).toHaveLength(2)
  })

  it('AC-3303.7 둘째 조각이 확인 필요면 저장하지 않고 멈추며, 상자에 확인 건수 글이 있고 확인 카드·"저장하지 않았어요" 출처 줄은 없다', async () => {
    const { port } = await readyWith((nth, message) => (nth === 1 ? incompleteOf(message, nth) : null))
    pickSpan(ALL)
    pressStart()
    await finishAll(port, 1, 2)

    const box = await waitFor(() => boxOf('4번 가운데 1번째까지 저장하고 멈췄어요.'))
    expect(box.textContent).toContain(
      '2024년 12월 – 2026년 11월은 저장됐어요. 남은 2020년 1월 – 2024년 11월은 [이어서 불러오기]로 읽어요. 차트번호 없는 내원 2건이 있어요. 비트에서 이 기록을 고친 뒤 다시 불러와 주세요.',
    )
    expect(box.textContent).not.toContain('오류 번호')
    await loadIsFree()
    await sectionsShown()
    expect(pageText()).not.toContain('일부 기록을 확인하지 못해 저장하지 않았어요')
    expect(pageText()).not.toContain('방금 불러온 숫자는 저장하지 않았어요')
    expect(saveStats).toHaveBeenCalledTimes(1)
    expect(rowsSent(port)).toHaveLength(2)
  })

  it.each<[string, { answer?: Answer; before?: () => void; fail?: (port: FakePort) => unknown; shown: () => Promise<unknown> }]>([
    ['읽기 실패', { fail: (port) => failRows(port), shown: async () => expect(cardsWith('오류 번호 E-STATS-TOO-BIG')).toHaveLength(1) }],
    [
      '확인 필요',
      {
        answer: (nth, message) => (nth === 0 ? incompleteOf(message, nth) : null),
        shown: async () => {
          await screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')
          expect(pageText()).toContain('처방별 신환·재진과 보고 문장은 방금 불러온 숫자예요.')
          expect(pageText()).toContain('차트번호 없는 내원 2건이 있어요. 비트에서 이 기록을 고친 뒤 다시 불러와 주세요.')
        },
      },
    ],
    ['저장 실패', { before: () => vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패')), shown: () => screen.findByRole('button', { name: '다시 저장' }) }],
  ])('AC-3303.8 첫 조각의 %s는 지금과 같은 카드이고 다음 조각을 읽지 않으며 멈춘 상자·[이어서 불러오기]가 없다', async (_name, { answer, before, fail, shown }) => {
    before?.()
    const { port } = await readyWith(answer)
    pickSpan(ALL)
    pressStart()
    await waitFor(() => expect(rowsSent(port)).toHaveLength(1))
    if (fail) fail(port)
    else finishStream(port)
    await waitFor(shown)
    await loadIsFree()
    await flush()
    expect(rowsSent(port)).toHaveLength(1)
    expect(pageText()).not.toContain('저장하고 멈췄어요')
    expect(screen.queryByRole('button', { name: RESUME })).toBeNull()
  })

  it('AC-3303.9 [이어서 불러오기]는 남은 조각(셋째부터)만 같은 차례·keep false·closeToday false로 읽고, 보고 문장은 그대로이며 끝나면 처음 누를 때의 끝날로 다 끝난 상자다', async () => {
    const { port, fake } = await readyWith()
    closeToday()
    pickSpan(ALL)
    pressStart()
    await finishAll(port, 1, 2)
    await waitFor(() => expect(rowsSent(port)).toHaveLength(3))
    failRows(port)
    await waitFor(() => boxOf('4번 가운데 2번째까지 저장하고 멈췄어요.'))
    await loadIsFree()
    await sectionsShown()
    expect(reportText()).toContain('120명')
    const splits = splitsSent(fake.sent).length
    const loadsBefore = loadsSent(fake.sent).length

    fireEvent.click(screen.getByRole('button', { name: RESUME }))
    await waitFor(() => expect(rowsSent(port)).toHaveLength(4))
    expect(pageText()).toContain(progress(3, 4, ALL_MONTHS[2]!))
    expect(screen.queryByRole('button', { name: RESUME })).toBeNull()
    expect(screen.getByRole('button', { name: '불러오는 중' }).getAttribute('aria-disabled')).toBe('true')
    expect(finishStream(port).args).toEqual(ALL_READS[2])
    expect((await finishPart(port, 5)).args).toEqual(ALL_READS[3])

    expect(await screen.findByText('2020년 1월 1일 – 2026년 11월 13일을 저장했어요.')).toBeTruthy()
    await loadIsFree()
    const resumed = loadsSent(fake.sent).slice(loadsBefore)
    expect(resumed.map(({ from, to, closeToday: close, keep }) => ({ from, to, closeToday: close, keep }))).toEqual([
      { ...ALL_READS[2], closeToday: false, keep: false },
      { ...ALL_READS[3], closeToday: false, keep: false },
    ])
    expect(vi.mocked(saveStats).mock.calls.map(([input]) => input.covered)).toEqual(ALL_SAVES.map(({ covered }) => covered))
    expect(rowsSent(port)).toHaveLength(5)
    await sectionsShown()
    expect(reportText()).toContain('120명')
    expect(reportText()).not.toContain('4,321')
    expect(splitsSent(fake.sent)).toHaveLength(splits)
    expect(screen.queryByRole('button', { name: RESUME })).toBeNull()
  })

  it('AC-3303.9 이어서 읽다 또 멈추면 새 수로 멈춤 상자이고, 다시 [이어서 불러오기]로 남은 하나만 읽는다', async () => {
    const { port } = await readyWith()
    pickSpan(ALL)
    pressStart()
    await finishAll(port, 1, 2)
    await waitFor(() => expect(rowsSent(port)).toHaveLength(3))
    failRows(port)
    await waitFor(() => boxOf('4번 가운데 2번째까지 저장하고 멈췄어요.'))
    await loadIsFree()

    fireEvent.click(screen.getByRole('button', { name: RESUME }))
    await finishPart(port, 4)
    await waitFor(() => expect(rowsSent(port)).toHaveLength(5))
    failRows(port, 'E-BIT-READ-FAILED')
    const box = await waitFor(() => boxOf('4번 가운데 3번째까지 저장하고 멈췄어요.'))
    expect(box.textContent).toContain('2020년 12월 – 2026년 11월은 저장됐어요. 남은 2020년 1월 – 2020년 11월은 [이어서 불러오기]로 읽어요. (오류 번호 E-BIT-READ-FAILED)')
    expect(pageText()).not.toContain('2번째까지 저장하고 멈췄어요')
    await loadIsFree()

    fireEvent.click(screen.getByRole('button', { name: RESUME }))
    expect((await finishPart(port, 6)).args).toEqual(ALL_READS[3])
    expect(await screen.findByText(DONE[0]!)).toBeTruthy()
    await loadIsFree()
    expect(saveStats).toHaveBeenCalledTimes(4)
    expect(rowsSent(port)).toHaveLength(6)
  })

  it('AC-3303.9 다른 일([다시 저장])을 하는 동안 [이어서 불러오기]는 aria-disabled이고 눌러도 읽지 않으며, 끝나면 다시 누를 수 있다', async () => {
    vi.mocked(saveStats).mockResolvedValueOnce({ saved: 1 }).mockRejectedValueOnce(new Error('가짜 실패'))
    const { port } = await readyWith()
    pickSpan(ALL)
    pressStart()
    await finishAll(port, 1, 2)
    await waitFor(() => boxOf('4번 가운데 1번째까지 저장하고 멈췄어요.'))
    await loadIsFree()

    let finishSave: () => void = () => undefined
    vi.mocked(saveStats).mockImplementationOnce(() => new Promise((resolve) => (finishSave = () => resolve({ saved: 1 }))))
    fireEvent.click(await screen.findByRole('button', { name: '다시 저장' }))
    const resume = screen.getByRole('button', { name: RESUME })
    expect(resume.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(resume)
    await flush()
    expect(rowsSent(port)).toHaveLength(2)

    await act(async () => finishSave())
    await waitFor(() => expect(screen.getByRole('button', { name: RESUME }).getAttribute('aria-disabled')).toBeNull())
    expect(boxOf('4번 가운데 1번째까지 저장하고 멈췄어요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: RESUME }))
    expect((await finishPart(port, 3)).args).toEqual(ALL_READS[1])
  })

  it('AC-3303.10 셋째 조각에서 끊겨 멈춘 뒤 연결이 ready가 아니면 [이어서 불러오기]는 aria-disabled이고 눌러도 읽지 않으며, [다시 확인]으로 ready가 되면 남은 셋째부터 읽는다', async () => {
    const { port, fake } = await readyWith()
    pickSpan(ALL)
    pressStart()
    await finishAll(port, 1, 2)
    await waitFor(() => expect(rowsSent(port)).toHaveLength(3))
    act(() => port.fireDisconnect())
    const STOPPED = '4번 가운데 2번째까지 저장하고 멈췄어요.'
    await waitFor(() => boxOf(STOPPED))
    await waitFor(() => expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBeNull())
    const loadsBefore = loadsSent(fake.sent).length
    const boxText = boxOf(STOPPED).textContent

    // 끊김('disconnected'): 막혀 있고 눌러도 요청·일이 없으며 상자 글은 그대로다
    const resume = screen.getByRole('button', { name: RESUME })
    expect(resume.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(resume)
    await flush()
    expect(rowsSent(port)).toHaveLength(3)
    expect(loadsSent(fake.sent)).toHaveLength(loadsBefore)
    expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBeNull()
    expect(boxOf(STOPPED).textContent).toBe(boxText)

    // 연결 확인 중('connecting')도 막혀 있다
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))
    expect(screen.getByRole('button', { name: RESUME }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: RESUME }))
    await flush()
    expect(rowsSent(port)).toHaveLength(3)

    // 'ready'가 되면 풀리고, 누르면 넷째 요청이 셋째 조각의 read다
    sayHello(port)
    await screen.findByRole('button', { name: LOAD })
    await waitFor(() => expect(screen.getByRole('button', { name: RESUME }).getAttribute('aria-disabled')).toBeNull())
    expect(boxOf(STOPPED).textContent).toBe(boxText)
    fireEvent.click(screen.getByRole('button', { name: RESUME }))
    expect((await finishPart(port, 4)).args).toEqual(ALL_READS[2])
  })

  it('AC-3303.9 끝난 상자는 다음 [비트에서 불러오기]를 시작할 때 사라진다', async () => {
    const { port } = await readyWith()
    pickSpan(ALL)
    pressStart()
    await finishAll(port)
    await screen.findByText(DONE[0]!)
    await loadIsFree()

    pickSpan('지금 보는 기간')
    pressStart()
    expect(screen.queryByText(DONE[0]!)).toBeNull()
    finishStream(port)
    await loadIsFree()
    expect(screen.queryByText(DONE[0]!)).toBeNull()
  })

  it('AC-3303.9 멈춘 상자는 파일 읽기를 시작할 때 사라진다', async () => {
    fileGoesWell()
    const { port } = await readyWith()
    pickSpan(ALL)
    pressStart()
    await finishAll(port, 1, 2)
    await waitFor(() => expect(rowsSent(port)).toHaveLength(3))
    failRows(port)
    await waitFor(() => boxOf('4번 가운데 2번째까지 저장하고 멈췄어요.'))
    await loadIsFree()

    fireEvent.change(fileInput(), { target: { files: [fakeFile()] } })
    expect(screen.queryByText('4번 가운데 2번째까지 저장하고 멈췄어요.')).toBeNull()
    expect(screen.queryByRole('button', { name: RESUME })).toBeNull()
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(3))
    await loadIsFree()
    expect(screen.queryByText('4번 가운데 2번째까지 저장하고 멈췄어요.')).toBeNull()
  })

  it('AC-3303.9·AC-4001.8 화면을 다시 열면 멈춘 상자는 없다(기억하지 않는다)', async () => {
    const { port } = await readyWith()
    pickSpan(ALL)
    pressStart()
    await finishAll(port, 1, 2)
    await waitFor(() => expect(rowsSent(port)).toHaveLength(3))
    failRows(port)
    await waitFor(() => boxOf('4번 가운데 2번째까지 저장하고 멈췄어요.'))
    await loadIsFree()
    cleanup()

    const again = fakeChrome()
    partsWorker()
    draw()
    sayHello(again)
    await sectionsShown()
    expect(pageText()).not.toContain('저장하고 멈췄어요')
    expect(screen.queryByRole('button', { name: RESUME })).toBeNull()
    expect(screen.getByRole('button', { name: SETTINGS }).getAttribute('aria-expanded')).toBe('false')
    openSettings()
    expect(within(screen.getByRole('group', { name: '불러올 기간' })).getByRole('button', { name: '지금 보는 기간' }).getAttribute('aria-pressed')).toBe('true')
  })
})

// ── 불러오기 띠 · 자료 글 · 접힘 (stats-pc-ux REQ-4001 TASK-4, 시안 docs/mockups/stats-pc-ux notes.md §1, design.md 'StatsScreen.tsx 바뀜') ──
describe('REQ-4001 stats-pc-ux: 불러오기 띠 · 자료 글 · 접힘', () => {
  const settings = () => screen.getByRole('button', { name: SETTINGS })
  const foldPanel = () => document.getElementById(settings().getAttribute('aria-controls') ?? '') as HTMLElement
  const band = () => foldPanel().previousElementSibling as HTMLElement
  const expanded = () => settings().getAttribute('aria-expanded')
  // 띠 왼쪽 자료 글(앞 글 + 뒤 muted span). 화면에 '자료:'로 시작하는 줄은 이것 하나뿐이다(기간 글 아래 따로 있던 자료 줄이 없다)
  const sourceLine = () => {
    const lines = screen.getAllByText(/^자료:/)
    expect(lines).toHaveLength(1)
    return lines[0]!
  }

  it('AC-4001.6: 띠 왼쪽 자료 글은 지금 자료 줄과 같은 글·색(앞 ink-2, 뒤 muted)이되 끝 글이 ` · 어제(…)까지`로 짧고 `끝난 날로 저장했어요`가 없다', async () => {
    draw()
    await sectionsShown()
    const line = sourceLine()
    expect(band().contains(line)).toBe(true)
    expect(line.textContent).toBe('자료: 비트 PC · 11월 13일 18:42 저장 · 어제(11월 12일)까지')
    const rest = line.querySelector('span')
    expect(rest?.textContent).toBe(' · 어제(11월 12일)까지')
    expect(rest?.className).toContain('text-muted')
    expect(line.closest('.text-ink-2')).toBeTruthy()
    expect(line.compareDocumentPosition(settings()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pageText()).not.toContain('끝난 날로 저장했어요')
  })

  it('AC-4001.6: 오늘 진료 끝으로 덮었으면 ` · 오늘(11월 13일)까지`, 어제가 아닌 날이면 ` · 11월 5일까지`다', async () => {
    vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-09-01', to: TODAY }])
    const first = draw()
    await sectionsShown()
    expect(sourceLine().textContent).toBe('자료: 비트 PC · 11월 13일 18:42 저장 · 오늘(11월 13일)까지')
    first.unmount()

    vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-09-01', to: '2026-11-05' }])
    draw()
    await sectionsShown()
    expect(sourceLine().textContent).toBe('자료: 비트 PC · 11월 13일 18:42 저장 · 11월 5일까지')
  })

  it('AC-4001.6: 방금 불러와 저장하면 띠 글에도 ` · 방금`이 같은 규칙으로 붙는다', async () => {
    const { port } = await drawReady()
    pressLoad(port)
    await waitFor(() => expect(pageText()).toContain('자료: 비트 PC · 11월 13일 18:42 저장 · 방금 · 어제(11월 12일)까지'))
    await sectionsShown()
    expect(band().contains(sourceLine())).toBe(true)
  })

  it('AC-4001.6: 파일 자료 안내 글은 띠 안 자료 글 바로 아래 줄이고, 기간 줄 뒤에는 자료 글이 없다', async () => {
    answers({ [R30.current.from]: read([day('2026-11-01')], { latest: FILE_AT, fromFile: true }) })
    draw()
    const note = await screen.findByText(FILE_NOTE)
    await sectionsShown()
    expect(band().contains(note)).toBe(true)
    expect(note.previousElementSibling).toBe(sourceLine())
    expect(sourceLine().compareDocumentPosition(screen.getByRole('group', { name: '기간' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("AC-4001.4: 저장된 숫자를 다 읽었는데 없으면('아직 저장된 통계가 없어요') 펼친 채 시작하고 자료 글은 `자료: 아직 저장된 숫자가 없어요`다", async () => {
    answers({})
    draw()
    await screen.findByText('아직 저장된 통계가 없어요')
    expect(expanded()).toBe('true')
    expect(foldPanel().hidden).toBe(false)
    expect(sourceLine().textContent).toBe('자료: 아직 저장된 숫자가 없어요')
    expect(screen.getByRole('button', { name: '파일 고르기' })).toBeTruthy()
  })

  it('AC-4001.4: 저장된 숫자가 있으면 접힌 채이고 띠에 [비트에서 불러오기]가 있다', async () => {
    await drawReady()
    expect(expanded()).toBe('false')
    expect(foldPanel().hidden).toBe(true)
    expect(band().contains(screen.getByRole('button', { name: LOAD }))).toBe(true)
    expect(screen.queryByRole('button', { name: '파일 고르기' })).toBeNull()
  })

  it('AC-4001.4: 저장된 숫자를 읽는 동안은 접힌 채이고 자료 글이 없다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    expect(expanded()).toBe('false')
    expect(pageText()).not.toContain('자료:')
  })

  it('AC-4001.4: 읽기 실패는 접힌 채다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    draw()
    await screen.findByRole('alert')
    expect(expanded()).toBe('false')
    expect(foldPanel().hidden).toBe(true)
  })

  it('AC-4001.4: 펼친 채 시작해 [불러오기 설정]을 누르지 않았으면 불러와 저장된 숫자가 생길 때 저절로 접힌다', async () => {
    answers({})
    const port = fakeChrome()
    draw()
    sayHello(port)
    await screen.findByText('아직 저장된 통계가 없어요')
    expect(expanded()).toBe('true')

    answers(SAVED_NOW)
    pressLoad(port)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(pageText()).toContain('18:42 저장 · 방금'))
    expect(pageText()).not.toContain('아직 저장된 통계가 없어요')
    expect(expanded()).toBe('false')
    expect(foldPanel().hidden).toBe(true)
  })

  it('AC-4001.4: 사용자가 [불러오기 설정]을 눌러 펼쳐 두었으면 저장된 뒤에도 펼친 채다', async () => {
    answers({})
    const port = fakeChrome()
    draw()
    sayHello(port)
    await screen.findByText('아직 저장된 통계가 없어요')
    fireEvent.click(settings())
    fireEvent.click(settings())
    expect(expanded()).toBe('true')

    answers(SAVED_NOW)
    pressLoad(port)
    await waitFor(() => expect(pageText()).toContain('18:42 저장 · 방금'))
    expect(expanded()).toBe('true')
  })

  it('AC-4001.4: 저장된 숫자가 없는 화면은 기간을 바꿔 다시 읽는 동안에도 펼친 채다(접혔다 펼쳐지며 깜박이지 않는다)', async () => {
    answers({})
    draw()
    await screen.findByText('아직 저장된 통계가 없어요')
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    pressPeriod('최근 90일')
    expect(screen.getAllByText('불러오는 중').length).toBeGreaterThan(0)
    expect(expanded()).toBe('true')
  })

  it('AC-4001.5: 저장된 숫자가 있어도 도우미가 없으면 펼친 채다', async () => {
    const port = fakeChrome()
    draw()
    act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code: 'E-HELPER-MISSING' }))
    await sectionsShown()
    expect(expanded()).toBe('true')
    expect(screen.getByRole('link', { name: '비트 PC 연결' })).toBeTruthy()
  })

  it('AC-4001.3: 펼쳐 고른 불러올 기간은 접은 뒤 띠의 [비트에서 불러오기]로 그대로 읽는다', async () => {
    const { port } = await drawReady()
    fireEvent.click(settings())
    fireEvent.click(within(screen.getByRole('group', { name: '불러올 기간' })).getByRole('button', { name: '최근 1년' }))
    fireEvent.click(settings())
    expect(foldPanel().hidden).toBe(true)
    const request = pressLoad(port)
    expect(request.args).toEqual(planLoad(TODAY, R30, '1y').parts[0]!.read)
  })

  it('AC-4001.8: 펼쳐 둔 화면을 다시 열면 접힌 채이고 브라우저 저장소에 쓰지 않는다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const first = draw()
    await sectionsShown()
    fireEvent.click(settings())
    expect(expanded()).toBe('true')
    first.unmount()

    draw()
    await sectionsShown()
    expect(expanded()).toBe('false')
    expect(setItem).not.toHaveBeenCalled()
  })
})

// ── 화면 잇기: 목차 띠 · 처방 탭 · 칸 차례 (stats-pc-ux REQ-4002·REQ-4003 TASK-6, 시안 docs/mockups/stats-pc-ux notes.md §3·§4, design.md 'StatsScreen.tsx 바뀜'·'StatsSections.tsx 바뀜') ──
describe('REQ-4002·REQ-4003 stats-pc-ux: 목차 띠 · 처방 탭', () => {
  const toc = () => screen.queryByRole('navigation', { name: TOC_NAME })
  const tabsOf = () => within(sectionOf('처방')).getAllByRole('tab')
  const selectedTab = () => tabsOf().find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent
  const editButton = () => screen.queryByRole('button', { name: '묶음 고치기' })
  // 처방 칸 머리 줄의 회색 설명(고른 탭 칸의 것 하나만 있다)
  const headDescs = () => [...rxHead().querySelectorAll('.text-muted')].map((node) => node.textContent)

  it('AC-4003.1·AC-4109.1: h2 열이 승인본 차례이고 `처방` 칸은 12칸 폭(lg: 없음)이다. 처방별 추세 · 처방별 신환·재진 · 처방 골라 보기 h2는 없다', async () => {
    draw()
    await sectionsShown()
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(SECTIONS)
    expect(sectionOf('처방').className.split(' ')).toContain('col-span-12')
    expect(sectionOf('처방').className).not.toContain('lg:')
    for (const name of ['처방별 추세', '처방별 신환·재진', '처방 골라 보기']) expect(heading(name), name).toBeNull()
    // 숨은 패널 안에도 옛 h2가 없다
    expect(within(sectionOf('처방')).queryAllByRole('heading', { level: 2, hidden: true }).map((node) => node.textContent)).toEqual(['처방'])
  })

  it('AC-4003.1·AC-4109.1: 불러오는 중 칸도 같은 열 제목이고 `처방` 칸은 12칸 폭이다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(SECTIONS)
    expect(screen.getAllByText('불러오는 중')).toHaveLength(10)
    expect(sectionOf('처방').className.split(' ')).toContain('col-span-12')
    expect(sectionOf('처방').className).not.toContain('lg:')
  })

  it('AC-4002.1·AC-4002.6·AC-4109.1: 목차 띠는 기간 줄 바로 다음이고 화면 바깥 div의 바로 아래 자식이며, 링크 열의 href가 그 칸 section의 id다', async () => {
    draw()
    await sectionsShown()
    const nav = toc()!
    expect(nav).toBeTruthy()
    // 붙는 띠는 화면 바깥 div의 자식이어야 끝까지 붙는다(design.md 'StatsScreen.tsx 바뀜')
    const outer = screen.getByRole('heading', { name: '통계', level: 1 }).parentElement!
    expect(nav.parentElement).toBe(outer)
    // 기간 줄 = 빠르게 보기 · 기간 골라 보기 · 기간 글 · 비교 글을 담은 div(비교 글 p > 기간 글 div > 기간 줄)
    const periodLine = screen.getByText(/^비교: /).parentElement!.parentElement!
    expect(periodLine.contains(screen.getByRole('group', { name: '기간' }))).toBe(true)
    expect(periodLine.contains(screen.getByRole('group', { name: '기간 골라 보기' }))).toBe(true)
    expect(periodLine.parentElement).toBe(outer)
    expect(nav.previousElementSibling).toBe(periodLine)
    expect(nav.compareDocumentPosition(sectionOf('기간 요약')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(TOC.map(([name]) => name))
    TOC.forEach(([name, id], i) => {
      expect(links[i]!.getAttribute('href'), name).toBe(`#${id}`)
      const target = document.getElementById(id)
      expect(target?.tagName, name).toBe('SECTION')
      expect(target, name).toBe(sectionOf(SECTIONS[i]!))
      expect(target!.className, name).toContain('scroll-mt-36.25') // 목차 띠에 가리지 않는 scroll-margin(AC-4002.6)
    })
    // 겹친 id가 없다: 칸 안쪽(탭 안 칸 포함)에는 목차 id가 없다
    expect(document.querySelectorAll('[id^="stats-"]')).toHaveLength(TOC.length)
  })

  it('AC-4002.1: 목차 링크를 누르면 그 칸 section으로 옮긴다', async () => {
    const moved: Element[] = []
    const scrollIntoView = vi.fn(function (this: Element) {
      moved.push(this)
    })
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView })
    try {
      draw()
      await sectionsShown()
      fireEvent.click(within(toc()!).getByRole('link', { name: '처방' }))
      fireEvent.click(within(toc()!).getByRole('link', { name: '원장님별' }))
      expect(moved).toEqual([sectionOf('처방'), sectionOf('원장님별')])
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('AC-4002.1·AC-4002.6: 읽는 동안·읽기 실패에는 목차 띠가 없고, 불러오는 중 칸에는 id가 없다', async () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    const first = draw()
    expect(toc()).toBeNull()
    for (const name of SECTIONS) expect(sectionOf(name).id, name).toBe('')
    first.unmount()

    // 그린 뒤 기간을 바꿔 다시 읽는 동안: 보이는 칸은 불러오는 중 칸이고 id가 없다(숨은 칸 묶음만 id를 가진다)
    answers(SAVED_NOW)
    const second = draw()
    await sectionsShown()
    expect(toc()).toBeTruthy()
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    pressPeriod('최근 90일')
    expect(screen.getAllByText('불러오는 중').length).toBeGreaterThan(0)
    expect(toc()).toBeNull()
    for (const name of SECTIONS) expect(sectionOf(name).id, name).toBe('')
    second.unmount()

    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    draw()
    await screen.findByRole('alert')
    expect(toc()).toBeNull()
  })

  it('AC-4002.1: 저장된 숫자가 없는 화면도 칸을 그리므로 목차 띠가 있다', async () => {
    answers({})
    draw()
    await screen.findByText('아직 저장된 통계가 없어요')
    expect(within(toc()!).getAllByRole('link')).toHaveLength(TOC.length)
  })

  it('AC-4002.1(기본값 14): 목차 띠 아래 첫 칸(기간 요약)의 위 여백만 줄인다(24px · 휴대폰 20px)', async () => {
    draw()
    await sectionsShown()
    const grid = sectionOf('기간 요약').parentElement!
    expect(grid.firstElementChild).toBe(sectionOf('기간 요약'))
    expect(grid.className.split(' ')).toEqual(expect.arrayContaining(['[&>:first-child]:mt-6', 'max-md:[&>:first-child]:mt-5']))
  })

  it('AC-4003.2·AC-4003.4: 탭 셋에 세 칸이 들고, 머리 줄 설명은 고른 탭 칸의 설명 하나이며 [묶음 고치기]는 첫 탭에만 있다', async () => {
    draw()
    await sectionsShown()
    expect(within(sectionOf('처방')).getByRole('tablist', { name: '처방 보기' })).toBeTruthy()
    expect(tabsOf().map((tab) => tab.textContent)).toEqual(RX_TABS)
    expect(selectedTab()).toBe('묶음별 추세')
    expect(within(sectionOf('처방')).getAllByRole('tabpanel', { hidden: true })).toHaveLength(3)

    // 첫 탭: 묶음별 추세 칸(저장된 묶음 줄) + 그 설명 + [묶음 고치기]
    await waitFor(() => expect(within(rxPanel('묶음별 추세')).getByText(SAVED_GROUP.name)).toBeTruthy())
    expect(headDescs()).toEqual(['만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건'])
    expect(rxHead().contains(editButton())).toBe(true)

    // 둘째 탭: 처방별 신환·재진 칸(이 기기에서 불러오기 전 안내) + 그 설명, [묶음 고치기] 없음
    expect(within(rxPanel('처방별 신환·재진')).getByText('비트 PC에서 불러오면 보여요')).toBeTruthy()
    expect(headDescs()).toEqual(['처방마다 서로 다른 환자 수'])
    expect(editButton()).toBeNull()

    // 셋째 탭: 처방 골라 보기 칸(처방 찾기) + 그 설명
    expect(within(rxPanel('처방 골라 보기')).getByRole('combobox', { name: '처방 찾기' })).toBeTruthy()
    expect(headDescs()).toEqual(['고른 처방만 건수와 신환율·재진율, 같은 처방 재방문을 봐요'])
    expect(editButton()).toBeNull()

    rxPanel('묶음별 추세')
    expect(headDescs()).toEqual(['만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건'])
    expect(editButton()).toBeTruthy()
  })

  it('AC-4003.4·AC-4003.5: 저장된 숫자가 없으면 탭마다 지금 칸의 빈 상태이고 머리 줄 설명·[묶음 고치기]가 없다', async () => {
    answers({})
    draw()
    await screen.findByText('아직 저장된 통계가 없어요')
    for (const name of RX_TABS) {
      const panel = rxPanel(name)
      expect(panel.textContent, name).toMatch(/자료 없음|비트 PC에서 불러오면 보여요/)
      expect(headDescs(), name).toEqual([])
      expect(editButton(), name).toBeNull()
    }
  })

  it('AC-4003.5: 묶음별 추세 줄을 연 채 둘째 탭에 갔다 오면 열린 채이고, 처방 골라 보기의 고른 날 수도 그대로다', async () => {
    const PICK = { code: 'A100', name: '가짜 고른 처방' }
    vi.mocked(readRxPicks).mockResolvedValue([PICK])
    const counted: DayPayload = {
      ...day('2026-11-10', 10),
      rx: [{ code: PICK.code, name: PICK.name, type: '', patients: 5, newPatients: 1, returning: 4 }],
      groups: [{ id: groupKey(SAVED_GROUP.codes), patients: 5, newPatients: 1, returning: 4 }],
    }
    answers({ [R30.current.from]: read([counted], { latest: BIT_AT }) })
    const treatment = (expanded: boolean) => within(rxPanel('묶음별 추세')).getByRole('button', { name: new RegExp(SAVED_GROUP.name), expanded })
    const win = (w: 7 | 14, pressed: boolean) => within(rxPanel('처방 골라 보기')).getByRole('button', { name: `${w}일 안`, pressed })
    draw()
    await sectionsShown()
    fireEvent.click(await waitFor(() => treatment(false)))
    expect(treatment(true)).toBeTruthy()

    rxPanel('처방별 신환·재진')
    expect(selectedTab()).toBe('처방별 신환·재진')
    expect(treatment(true)).toBeTruthy()

    fireEvent.click(await waitFor(() => win(14, false)))
    expect(win(14, true)).toBeTruthy()
    rxPanel('묶음별 추세')
    rxPanel('처방별 신환·재진')
    expect(win(14, true)).toBeTruthy()
    expect(win(7, false)).toBeTruthy()
    expect(treatment(true)).toBeTruthy()
  })

  it('AC-4003.6: [묶음 고치기]를 누르면 첫 탭 맨 위 h3 `묶음별 추세 · 묶음 고치기`에 초점이 가고 머리 줄 설명·단추가 없으며, [그만두기]면 [묶음 고치기]로 초점이 돌아온다', async () => {
    draw()
    await sectionsShown()
    await waitFor(() => expect(editButton()?.getAttribute('aria-disabled')).toBeNull())
    fireEvent.click(editButton()!)
    const title = await screen.findByRole('heading', { name: '묶음별 추세 · 묶음 고치기', level: 3 })
    await waitFor(() => expect(document.activeElement).toBe(title))
    expect(rxPanel('묶음별 추세').firstElementChild).toBe(title)
    expect(tabsOf().map((tab) => tab.textContent)).toEqual(RX_TABS) // 탭 줄은 그대로다(기본값 7)
    expect(headDescs()).toEqual([])
    expect(editButton()).toBeNull()
    expect(heading('처방별 추세 · 묶음 고치기')).toBeNull()

    fireEvent.click(within(rxPanel('묶음별 추세')).getByRole('button', { name: '그만두기' }))
    await waitFor(() => expect(document.activeElement).toBe(editButton()))
    expect(screen.queryByRole('heading', { name: '묶음별 추세 · 묶음 고치기' })).toBeNull()
    expect(headDescs()).toEqual(['만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건'])
  })

  it('AC-4003.7: 둘째·셋째 탭을 고른 화면을 다시 그리면 첫 탭이고, 고른 탭을 브라우저 저장소·주소·서버에 쓰지 않는다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const pushState = vi.spyOn(window.history, 'pushState')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { hash, search } = window.location
    const first = draw()
    await sectionsShown()
    rxPanel('처방별 신환·재진')
    rxPanel('처방 골라 보기')
    expect(selectedTab()).toBe('처방 골라 보기')
    first.unmount()

    draw()
    await sectionsShown()
    expect(selectedTab()).toBe('묶음별 추세')
    expect(tabsOf().map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
    expect(setItem).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(window.location.hash).toBe(hash)
    expect(window.location.search).toBe(search)
    expect(saveStats).not.toHaveBeenCalled()
    expect(saveStatsRxGroups).not.toHaveBeenCalled()
  })
})

// ── 매출을 통계에 잇기 (stats-revenue REQ-4107·REQ-4108·REQ-4109 TASK-7, 시안 docs/mockups/stats-revenue, design.md '화면 잇기') ──
// 매출 저장소는 가짜(revenueStore), 비트 매출 읽기는 통계와 같은 가짜 통로(FakePort.revenueReply)다. 금액·건수는 모두 지어낸 값이다.
// 오늘 11월 13일 · 오늘 진료 끝 꺼짐 → 마지막 끝난 날 11월 12일. 기본 가짜 서버는 11월 12일까지 쉬는 날 줄이 저장돼 있어 매출 읽기 계획은 어제 하루다
describe('stats-revenue: 매출 칸 · 목차 열 개 · 불러오기 뒤 매출 · 매출만 실패 상자', () => {
  const ALL = '전체 기간'
  const RESUME = '이어서 불러오기'
  const RETRY = '매출만 다시 읽기'
  const FAIL_TITLE = '매출은 읽지 못했어요'
  const READING_LINE = '비트 PC에서 읽는 중이에요 (환자·처방 저장 끝 · 매출 읽는 중). 다 끝날 때까지 이 창을 닫지 마세요.'
  const OLD_HELPER = '도우미가 예전 판이라 치료별 매출은 읽지 못했어요.'
  const EMPTY_LINE = '자료 없음 · 불러오면 이 기간의 매출이 하루씩 막대로 그려져요.'
  const WORK_CELLS = ['매출300만원진료한 날 1일 평균 300만 원', '건당 진료비42,857원매출 ÷ 접수 70건', '확인 필요한 날없음', '비교 기간보다–비교할 자료가 없어요']
  const BLANK_CELLS = ['매출–자료 없음', '건당 진료비–자료 없음', '확인 필요한 날–자료 없음', '비교 기간보다–자료 없음']
  const DONE_TODAY = '2020년 1월 1일 – 2026년 11월 13일을 저장했어요.'
  const WHOLE_ALL: DateRange = { from: '2020-01-01', to: TODAY }

  const revenueSent = (port: FakePort) => port.sent.filter((message) => message.cmd === 'revenue.days')
  const rowsSent = (port: FakePort) => port.sent.filter((message) => message.cmd === 'stats.rows')
  // 기간 요약 둘째 줄(매출 네 칸) = 기간 요약 칸 안 둘째 격자
  const revenueRow = () => sectionOf('기간 요약').querySelectorAll('.grid')[1] as HTMLElement | undefined
  const revenueCellsText = () => [...(revenueRow()?.children ?? [])].map((cell) => cell.textContent)
  const failBox = () => (screen.queryByText(FAIL_TITLE)?.closest('[role="status"]') ?? null) as HTMLElement | null
  const wholeReads = (whole: DateRange) => revenueStore.loadDays.mock.calls.filter(([range]) => range.from === whole.from && range.to === whole.to).length
  const pickSpan = (name: string) => {
    openSettings()
    fireEvent.click(within(screen.getByRole('group', { name: '불러올 기간' })).getByRole('button', { name }))
  }
  const closeToday = () => {
    openSettings()
    fireEvent.click(screen.getByRole('checkbox', { name: '오늘 진료 끝' }))
  }
  const pressStart = () => fireEvent.click(screen.getByRole('button', { name: LOAD }))
  const failRowsReply = (port: FakePort) => act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code: 'E-STATS-TOO-BIG' }))
  async function finishPart(port: FakePort, k: number) {
    await waitFor(() => expect(rowsSent(port)).toHaveLength(k))
    return finishStream(port)
  }

  // 확장 연결 수를 세는 가짜 chrome.runtime(두 번째 연결이 없는지 본다)
  function countedChrome() {
    const port = new FakePort()
    const connect = vi.fn(() => port)
    vi.stubGlobal('chrome', { runtime: { connect } })
    return { port, connect }
  }

  async function ready() {
    const { port, connect } = countedChrome()
    draw()
    sayHello(port)
    await sectionsShown()
    return { port, connect }
  }

  it('AC-4109.1·AC-4107.1: h2 열이 승인본 차례이고 `매출`은 재방문율 다음 · 처방 앞 전체 폭(col-span-12, lg: 없음)이다. 불러오는 중 칸도 같은 열 제목·자리다', async () => {
    expect(SECTIONS).toEqual(['기간 요약', '환자 수 추이', '신환 재방문율', '매출', '처방', '원장님 보고 문장', '요일별 환자 수', '환자 구성', '시간대별 접수', '원장님별'])
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    const first = draw()
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(SECTIONS)
    expect(screen.getAllByText('불러오는 중')).toHaveLength(10)
    expect(sectionOf('매출').className.split(' ')).toContain('col-span-12')
    expect(sectionOf('매출').className).not.toContain('lg:')
    expect(sectionOf('매출').id).toBe('')
    first.unmount()

    answers(SAVED_NOW)
    draw()
    await sectionsShown()
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(SECTIONS)
    expect(sectionOf('매출').className.split(' ')).toContain('col-span-12')
    expect(sectionOf('매출').className).not.toContain('lg:')
    expect(sectionOf('신환 재방문율').compareDocumentPosition(sectionOf('매출')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sectionOf('매출').compareDocumentPosition(sectionOf('처방')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-4109.1: 목차 띠 링크는 열 개이고 `매출` 링크 href는 #stats-revenue = 매출 칸 section id다', async () => {
    draw()
    await sectionsShown()
    const links = within(screen.getByRole('navigation', { name: TOC_NAME })).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['기간 요약', '환자 수', '재방문율', '매출', '처방', '보고 문장', '요일별', '환자 구성', '시간대별', '원장님별'])
    const revenueLink = within(screen.getByRole('navigation', { name: TOC_NAME })).getByRole('link', { name: '매출' })
    expect(revenueLink.getAttribute('href')).toBe('#stats-revenue')
    expect(sectionOf('매출').id).toBe('stats-revenue')
    expect(document.getElementById('stats-revenue')).toBe(sectionOf('매출'))
  })

  it('AC-4108.2·AC-4106.1: 열면 저장된 매출로 기간 요약 둘째 줄과 매출 칸을 그리고, 열기만 해서는 비트에서 매출을 읽지 않는다', async () => {
    revenueDb.set('2026-11-02', { ...workDay('2026-11-02'), dayCodes: true })
    const { port } = await ready()
    await waitFor(() => expect(revenueCellsText()).toEqual(WORK_CELLS))
    expect(revenueStore.loadDays).toHaveBeenCalledWith(readSpan(R30))
    expect(within(sectionOf('매출')).getByRole('tablist', { name: '매출 보기' })).toBeTruthy()
    await flush()
    expect(revenueSent(port)).toEqual([])
    expect(revenueStore.saveRange).not.toHaveBeenCalled()
  })

  it('AC-4106.3: 저장된 매출이 없는 기간은 둘째 줄 네 칸이 `–` · `자료 없음`이고 매출 칸은 한 줄이다', async () => {
    await ready()
    expect(revenueCellsText()).toEqual(BLANK_CELLS)
    expect(sectionOf('매출').textContent).toBe(`매출${EMPTY_LINE}`)
  })

  it('AC-4108.7: 비트 PC가 아닌 기기(확장 없음)는 저장된 매출만 보이고 비트 매출 읽기·저장이 없다', async () => {
    revenueDb.set('2026-11-02', { ...workDay('2026-11-02'), dayCodes: true })
    draw()
    await sectionsShown()
    await waitFor(() => expect(revenueCellsText()).toEqual(WORK_CELLS))
    await flush()
    expect(revenueStore.saveRange).not.toHaveBeenCalled()
    expect(revenueStore.loadDays.mock.calls.map(([range]) => range)).toEqual(revenueStore.loadDays.mock.calls.map(() => readSpan(R30)))
  })

  it('AC-4108.2·AC-4108.6: [비트에서 불러오기]는 통계 조각 저장이 끝난 뒤에만 같은 통로로 revenue.days를 묻고(두 번째 연결 없음), 저장한 뒤 다시 읽은 숫자로 둘째 줄과 매출 칸을 그린다', async () => {
    const { port, connect } = await ready()
    port.revenueReply = (range) => ({ type: 'result', data: revenueAnswer(range, workDay) })
    expect(revenueCellsText()).toEqual(BLANK_CELLS)
    let finishSave: () => void = () => undefined
    vi.mocked(saveStats).mockImplementationOnce(() => new Promise((resolve) => (finishSave = () => resolve({ saved: 1 }))))

    pressLoad(port)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    await flush()
    expect(revenueSent(port)).toEqual([]) // 통계 조각 저장이 끝나기 전에는 묻지 않는다
    await act(async () => finishSave())

    await waitFor(() => expect(revenueSent(port)).toHaveLength(1))
    expect(revenueSent(port)[0]!.args).toEqual({ from: YESTERDAY, to: YESTERDAY })
    expect(wholeReads(R30.load)).toBe(1) // 불러올 기간 전체의 저장 표시로 계획한다
    await waitFor(() => expect(revenueStore.saveRange).toHaveBeenCalledTimes(1))
    expect(revenueStore.saveRange.mock.calls[0]![0]).toEqual({ from: YESTERDAY, to: YESTERDAY })
    await loadIsFree()
    await waitFor(() => expect(revenueCellsText()).toEqual(WORK_CELLS))
    expect(within(sectionOf('매출')).getByRole('tablist', { name: '매출 보기' })).toBeTruthy()
    expect(within(sectionOf('매출')).queryByRole('note')).toBeNull() // 새 도우미 답이라 예전 판 줄이 없다
    expect(connect).toHaveBeenCalledTimes(1)
    expect(rowsSent(port)).toHaveLength(1)
  })

  it('AC-4108.3: 매출을 읽는 동안 불러오는 중 줄은 시안 글이고 불러오기·파일 고르기가 막히며, 끝나면 풀린다', async () => {
    const { port } = await ready()
    port.revenueReply = () => null
    pressLoad(port)
    await waitFor(() => expect(revenueSent(port)).toHaveLength(1))
    expect(pageText()).toContain(READING_LINE)
    expect(revenueProgressText(1, 1)).toBe(READING_LINE)
    expect(screen.getByRole('button', { name: '불러오는 중' }).getAttribute('aria-disabled')).toBe('true')
    openSettings()
    expect(screen.getByRole('button', { name: '파일 고르기' }).getAttribute('aria-disabled')).toBe('true')

    act(() => port.reply({ v: 1, id: revenueSent(port)[0]!.id, type: 'result', data: revenueAnswer({ from: YESTERDAY, to: YESTERDAY }) }))
    await loadIsFree()
    expect(pageText()).not.toContain('매출 읽는 중')
  })

  it('AC-4108.3: 매출 덩어리가 둘 이상이면 불러오는 중 줄에 차례(k/n)가 붙고 덩어리를 새것부터 하나씩 읽는다', async () => {
    revenueSavedTo = null
    const { port } = await ready()
    port.revenueReply = () => null
    pressLoad(port)
    const CHUNKS: DateRange[] = [
      { from: '2026-10-13', to: YESTERDAY },
      { from: '2026-09-12', to: '2026-10-12' },
      { from: '2026-09-01', to: '2026-09-11' },
    ]
    for (const [i, range] of CHUNKS.entries()) {
      await waitFor(() => expect(revenueSent(port)).toHaveLength(i + 1))
      const request = revenueSent(port)[i]!
      expect(request.args).toEqual(range)
      expect(pageText()).toContain(`비트 PC에서 읽는 중이에요 (환자·처방 저장 끝 · 매출 읽는 중 ${i + 1}/3). 다 끝날 때까지 이 창을 닫지 마세요.`)
      act(() => port.reply({ v: 1, id: request.id, type: 'result', data: revenueAnswer(range) }))
    }
    await loadIsFree()
    expect(revenueSent(port)).toHaveLength(3)
    expect(revenueStore.saveRange.mock.calls.map(([range]) => range)).toEqual(CHUNKS)
  })

  it.each<[string, () => void, (port: FakePort) => unknown, () => Promise<unknown>]>([
    [
      '첫 조각 읽기 실패',
      () => undefined,
      (port) => failRowsReply(port),
      () => waitFor(() => expect(screen.getAllByRole('alert').some((card) => card.textContent?.includes('E-STATS-TOO-BIG'))).toBe(true)),
    ],
    ['확인이 필요한 기록', () => void fakeWorker(INCOMPLETE), (port) => finishStream(port), () => screen.findByText('일부 기록을 확인하지 못해 저장하지 않았어요')],
    ['저장 실패', () => void vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패')), (port) => finishStream(port), () => screen.findByRole('button', { name: '다시 저장' })],
  ])('AC-4108.4: 통계 %s면 매출은 읽지 않는다', async (_name, before, finish, shown) => {
    before()
    const { port } = await ready()
    pressStart()
    finish(port)
    await shown()
    await loadIsFree()
    await flush()
    expect(revenueSent(port)).toEqual([])
    expect(wholeReads(R30.load)).toBe(0)
    expect(revenueStore.saveRange).not.toHaveBeenCalled()
  })

  it('AC-4108.4: 나눠 읽기가 멈추면 매출을 읽지 않고, [이어서 불러오기]로 남은 조각이 모두 저장되면 처음 누를 때의 오늘 진료 끝으로 불러올 기간 전체의 매출을 읽는다', async () => {
    const { port } = await ready()
    closeToday()
    pickSpan(ALL)
    pressStart()
    await finishPart(port, 1)
    await finishPart(port, 2)
    await waitFor(() => expect(rowsSent(port)).toHaveLength(3))
    failRowsReply(port)
    await screen.findByText('4번 가운데 2번째까지 저장하고 멈췄어요.')
    await loadIsFree()
    await flush()
    expect(revenueSent(port)).toEqual([])
    expect(wholeReads(WHOLE_ALL)).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: RESUME }))
    await finishPart(port, 4)
    await finishPart(port, 5)
    await waitFor(() => expect(revenueSent(port)).toHaveLength(1))
    expect(wholeReads(WHOLE_ALL)).toBe(1)
    // 처음 누를 때 오늘 진료 끝이었다 → 어제와 오늘을 읽는다
    expect(revenueSent(port)[0]!.args).toEqual({ from: YESTERDAY, to: TODAY })
    await loadIsFree()
    expect(await screen.findByText(DONE_TODAY)).toBeTruthy()
  })

  it('AC-4108.5: 매출 덩어리가 실패하면 띠 바로 아래 상자에 시안 글과 [매출만 다시 읽기]가 있고 오류 카드는 없다(통계는 저장됐다)', async () => {
    const { port } = await ready()
    port.revenueReply = () => ({ type: 'error', code: 'E-BIT-READ-FAILED' })
    pressLoad(port)
    await waitFor(() => expect(failBox()).not.toBeNull())
    const box = failBox()!
    expect(box.textContent).toBe(`${FAIL_TITLE}환자·처방은 방금 저장했어요. 매출 칸은 전에 저장한 숫자(11월 12일까지)예요. (오류 번호 E-BIT-READ-FAILED)${RETRY}`)
    expect(screen.getByText(FAIL_TITLE).className.split(' ')).toEqual(expect.arrayContaining(['font-semibold', 'text-warning']))
    expect(box.className.split(' ')).toEqual(expect.arrayContaining(['bg-warning-soft', 'rounded-control']))
    expect(within(box).getByRole('button', { name: RETRY })).toBeTruthy()
    // 띠 바로 아래: 불러오기 상자(개인정보 줄이 든 펼칠 칸) 다음, 기간 단추 앞
    expect(screen.getByText(PRIVACY_LINE).compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(box.compareDocumentPosition(screen.getByRole('group', { name: '기간' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryAllByRole('alert').filter((card) => card.textContent?.includes('E-BIT-READ-FAILED'))).toEqual([])
    await loadIsFree()
    expect(saveStats).toHaveBeenCalledTimes(1)
    expect(revenueStore.saveRange).not.toHaveBeenCalled()
  })

  it('AC-4108.5: [매출만 다시 읽기]는 같은 불러올 기간·같은 오늘 진료 끝으로 매출만 다시 읽고 다른 안내를 지우지 않으며, 그동안 불러오기가 막히고, 성공하면 상자가 없어진다', async () => {
    const { port } = await ready()
    closeToday()
    pickSpan(ALL)
    port.revenueReply = () => ({ type: 'error', code: 'E-BIT-READ-FAILED' })
    pressStart()
    for (let k = 1; k <= 4; k++) await finishPart(port, k)
    await waitFor(() => expect(failBox()).not.toBeNull())
    await loadIsFree()
    expect(screen.getByText(DONE_TODAY)).toBeTruthy()
    expect(revenueSent(port)).toHaveLength(1)
    expect(revenueSent(port)[0]!.args).toEqual({ from: YESTERDAY, to: TODAY })
    const loads = vi.mocked(readDays).mock.calls.length

    port.revenueReply = () => null
    fireEvent.click(within(failBox()!).getByRole('button', { name: RETRY }))
    await waitFor(() => expect(revenueSent(port)).toHaveLength(2))
    expect(revenueSent(port)[1]!.args).toEqual({ from: YESTERDAY, to: TODAY })
    expect(wholeReads(WHOLE_ALL)).toBe(2)
    expect(rowsSent(port)).toHaveLength(4)
    expect(screen.getByText(DONE_TODAY)).toBeTruthy()
    expect(pageText()).toContain(READING_LINE)
    expect(screen.getByRole('button', { name: '불러오는 중' }).getAttribute('aria-disabled')).toBe('true')
    expect(within(failBox()!).getByRole('button', { name: RETRY }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(within(failBox()!).getByRole('button', { name: RETRY }))
    await flush()
    expect(revenueSent(port)).toHaveLength(2)

    act(() => port.reply({ v: 1, id: revenueSent(port)[1]!.id, type: 'result', data: revenueAnswer({ from: YESTERDAY, to: TODAY }) }))
    await loadIsFree()
    await waitFor(() => expect(failBox()).toBeNull())
    expect(screen.getByText(DONE_TODAY)).toBeTruthy()
    expect(rowsSent(port)).toHaveLength(4)
    expect(vi.mocked(saveStats)).toHaveBeenCalledTimes(4)
    expect(revenueStore.saveRange).toHaveBeenCalledTimes(1)
    expect(vi.mocked(readDays).mock.calls.length).toBeGreaterThanOrEqual(loads)
  })

  it('AC-4108.5: 전에 저장한 매출이 없으면 둘째 문장이 `매출은 아직 저장된 숫자가 없어요.`이고, [비트에서 불러오기]를 다시 누르면 상자가 없어진다', async () => {
    revenueSavedTo = null
    const { port } = await ready()
    port.revenueReply = () => ({ type: 'error', code: 'E-BIT-READ-FAILED' })
    pressLoad(port)
    await waitFor(() => expect(failBox()).not.toBeNull())
    expect(failBox()!.textContent).toBe(`${FAIL_TITLE}환자·처방은 방금 저장했어요. 매출은 아직 저장된 숫자가 없어요. (오류 번호 E-BIT-READ-FAILED)${RETRY}`)
    await loadIsFree()

    port.revenueReply = () => null
    pressLoad(port)
    expect(failBox()).toBeNull()
  })

  it('AC-4108.6: 답에 날 단위 처방 금액(dayCodes)이 없으면 매출 칸 제목과 탭 사이에 도우미 예전 판 줄이 켜진다', async () => {
    const { port } = await ready()
    port.revenueReply = (range) => ({ type: 'result', data: revenueAnswer(range, workDay, false) })
    pressLoad(port)
    await loadIsFree()
    await waitFor(() => expect(within(sectionOf('매출')).getByRole('note').textContent).toContain(OLD_HELPER))
    const note = within(sectionOf('매출')).getByRole('note')
    expect(within(note).getByRole('link', { name: '설정에서 새 도우미 받기' }).getAttribute('href')).toBe('/settings')
    expect(note.compareDocumentPosition(within(sectionOf('매출')).getByRole('tablist', { name: '매출 보기' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-4107.1·AC-4107.9: 매출 칸의 [다시 읽기]는 저장된 매출만 다시 읽는다(통계 숫자는 다시 읽지 않는다)', async () => {
    revenueStore.loadDays.mockRejectedValueOnce(new Error('가짜 실패'))
    draw()
    await sectionsShown()
    await waitFor(() => expect(within(sectionOf('매출')).getByRole('alert').textContent).toContain('E-STATS-READ-FAILED'))
    expect(revenueCellsText()).toEqual(BLANK_CELLS)
    const reads = vi.mocked(readDays).mock.calls.length
    fireEvent.click(within(sectionOf('매출')).getByRole('button', { name: '다시 읽기' }))
    await waitFor(() => expect(sectionOf('매출').textContent).toBe(`매출${EMPTY_LINE}`))
    expect(within(sectionOf('매출')).queryByRole('alert')).toBeNull()
    expect(vi.mocked(readDays).mock.calls.length).toBe(reads)
  })

  it('AC-4111.1: 매출 답은 Worker로 가지 않고 통계 저장 줄 모양은 그대로다', async () => {
    const { port } = countedChrome()
    const fake = fakeWorker()
    draw()
    sayHello(port)
    await sectionsShown()
    port.revenueReply = (range) => ({ type: 'result', data: revenueAnswer(range, workDay) })
    pressLoad(port)
    await waitFor(() => expect(revenueStore.saveRange).toHaveBeenCalledTimes(1))
    await loadIsFree()
    expect(fake.sent.some((message) => JSON.stringify(message).includes('revenue'))).toBe(false)
    expect(Object.keys(vi.mocked(saveStats).mock.calls[0]![0]).sort()).toEqual(['covered', 'days', 'months', 'source'])
  })
})

describe('first90 AC-4407.1: 연결된 도우미 판을 매출 훅에 넘긴다', () => {
  it('AC-4407.1 연결 전에는 helperVersion이 null이고, hello 뒤에는 hello의 도우미 판을 useStatsRevenue에 넘긴다', async () => {
    vi.mocked(useStatsRevenue).mockClear()
    await drawReady()
    const calls = vi.mocked(useStatsRevenue).mock.calls
    expect(calls[0]![0].helperVersion).toBeNull()
    expect(calls.at(-1)![0].helperVersion).toBe(MIN_HELPER)
  })
})
