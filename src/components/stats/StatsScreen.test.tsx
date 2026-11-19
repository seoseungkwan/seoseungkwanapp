// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, compareYmd, eachDay, weekdayOf } from '@/lib/analytics/dates'
import { MIN_HELPER } from '@/lib/bridge/versions'
import { listCalendarCounts, loadCalendarSettings } from '@/lib/storage/calendar'
import { loadGoal, saveGoal } from '@/lib/storage/goals'
import { readRxPicks } from '@/lib/storage/rxPicks'
import { readCoverage, readDays, readMonths, saveStats } from '@/lib/storage/stats'
import { listStatsRxGroups, saveStatsRxGroups } from '@/lib/storage/statsRxGroups'
import { listSunapDays, loadSunapSettings, type SunapDay } from '@/lib/storage/sunap'
import { toDayPayloads } from '@/lib/payload/toDayPayloads'
import { toMonthPayload } from '@/lib/payload/toMonthPayload'
import { nestedBoxes } from '@/testing/boxes'
import type { AnalysisResult, FileReport } from '@/types/analyze'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import { DEFAULT_CAL_SETTINGS, type CalCountRow } from '@/types/calendar'
import type { ClinicReportNumbers } from '@/types/clinicReport'
import type { DateRange } from '@/types/dates'
import type { DayPayload, MonthSections } from '@/types/payload'
import type { RevenueDayRow, RevenueDaysResult, SavedRevenueDay } from '@/types/revenue'
import type { RxGroup } from '@/types/rxGroups'
import type { BitSectionsView, PatientMix, RxSplitView, StatsLoaded, StatsLoadRequest, StatsSectionsRequest, StatsWorkerMessage, StatsWorkerRequest } from '@/types/stats'
import { DEFAULT_RSV_KINDS, SUNAP_TOTAL_KEYS, type SunapRates, type SunapTotals } from '@/types/sunap'
import { runAnalysis } from '@/workers/runAnalysis'
import { createStatsWorker } from '@/workers/statsClient'
import { planLoad, revenueProgressText } from './loadPlan'
import { StatsScreen } from './StatsScreen'
import { CALENDAR_DESC } from './sections/CalendarSection'
import { StatsSections } from './sections/StatsSections'
import { useStatsRevenue } from './useStatsRevenue'
import { groupKey } from './treatmentView'
import type { StatsRxGroupsView } from './useStatsRxGroups'
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
// 수납일지 서버 저장 가짜(sunap-ilji TASK-6). 기본은 묶음 안 고름 · 마감한 날 없음(beforeEach)
vi.mock('@/lib/storage/sunap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/sunap')>()),
  loadSunapSettings: vi.fn(),
  listSunapDays: vi.fn(),
}))
// 예약 탭 서버 저장 가짜(clinic-calendar TASK-9). 기본은 최근 12달 예약 없음 · 기본 설정(beforeEach)
vi.mock('@/lib/storage/calendar', () => ({
  listCalendarCounts: vi.fn(),
  loadCalendarSettings: vi.fn(),
  listCalendarSlots: vi.fn(async () => []),
  listAllDay: vi.fn(async () => []),
}))
// 이번 달 목표 서버 저장 가짜(stats-insights TASK-7). 기본은 목표 없음 · 저장 성공(beforeEach)
vi.mock('@/lib/storage/goals', () => ({ loadGoal: vi.fn(), saveGoal: vi.fn() }))

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
// 처방 카드의 탭(stats-pc-ux AC-4003.1). 넷째 '몇 번까지 받나'는 비트 칸이다(stats-insights AC-6103.2, 통계 화면은 늘 bit를 준다)
const RX_TABS = ['묶음별 추세', '처방별 신환·재진', '처방 골라 보기', '몇 번까지 받나'] as const
// 큰 카드 일곱(first90 AC-4411.1·AC-4411.3, 예약·전환은 sunap-ilji AC-4906.1, 예약은 clinic-calendar AC-5907.3): [바로가기 자리 id, 카드 h2]. 카드 안 작은 칸(h3)의 이름·글은 각 칸 시험이 본다
const CARDS = [
  ['stats-patients', '환자'],
  ['stats-revenue', '매출'],
  ['stats-sunap', '예약·전환'],
  ['stats-calendar', '예약'],
  ['stats-rx', '처방'],
  ['stats-ops', '진료 운영'],
  ['stats-report', '원장님 보고 문장'],
] as const
// 그린 화면의 바로가기 자리 차례: 요약 자리(환자 요약 카드, stats-summary) → 카드 여섯(AC-4411.1). 매출 요약 카드는 요약 자리 안이라 id가 없다(first90 AC-4408.2)
const PLACES = [['stats-summary', '환자 요약'], ...CARDS]
// 읽는 동안의 기다리는 자리: 같은 차례의 제목(h2) 여덟(환자 요약 · 매출 요약 · 카드 여섯)이고 자리마다 "불러오는 중" 한 줄, 바로가기 id는 없다
const WAITING_TITLES = ['환자 요약', '매출 요약', ...CARDS.map(([, title]) => title)]
// 바로가기 띠 링크 열과 그 자리 id(AC-4411.2)
const TOC = [
  ['요약', 'stats-summary'],
  ['환자', 'stats-patients'],
  ['매출', 'stats-revenue'],
  ['예약·전환', 'stats-sunap'],
  ['예약', 'stats-calendar'],
  ['처방', 'stats-rx'],
  ['진료 운영', 'stats-ops'],
  ['보고', 'stats-report'],
] as const
const TOC_NAME = '통계 바로가기'
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
// 바로가기 자리(요약 칸·카드 section). 그린 화면에만 id가 있다(기다리는 자리에는 없다)
const card = (id: string) => document.getElementById(id)!
// 자리 제목 = section의 aria-labelledby가 가리키는 h2
const titleOf = (el: Element) => document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ?? null
// 카드 머리 줄(h2 + 옆 글 + 오른쪽 자리)
const cardHead = (id: string) => document.getElementById(card(id).getAttribute('aria-labelledby')!)!.parentElement!
// 보이는 바로가기 자리 차례 [id, 제목]. 숨은 칸 묶음(hidden) 안은 세지 않는다
const placesShown = () =>
  [...document.querySelectorAll('section[id^="stats-"]')].filter((el) => el.closest('[hidden]') === null).map((el) => [el.id, titleOf(el)])
// 기다리는 자리(id 없음)는 h2로 찾는다
const waitingCard = (title: string) => heading(title)!.closest('section')!
// 처방 카드의 탭을 고르고(이미 골랐으면 그대로) 보이는 패널을 돌려준다. 고르지 않은 패널은 hidden이라 role로 찾지 못한다(stats-pc-ux AC-4003.2)
function rxPanel(name: (typeof RX_TABS)[number]) {
  const tab = within(card('stats-rx')).getByRole('tab', { name })
  if (tab.getAttribute('aria-selected') !== 'true') fireEvent.click(tab)
  return within(card('stats-rx')).getByRole('tabpanel')
}
// 기다리는 칸에도 같은 제목이 있어 "불러오는 중"이 없어질 때까지 본다
const sectionsShown = () =>
  waitFor(() => {
    expect(heading('환자 요약')).toBeTruthy()
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
  vi.mocked(loadSunapSettings).mockReset()
  vi.mocked(listSunapDays).mockReset()
  vi.mocked(loadSunapSettings).mockResolvedValue({ blockGroup: null, ptGroup: null, kinds: DEFAULT_RSV_KINDS })
  vi.mocked(listSunapDays).mockResolvedValue([])
  vi.mocked(listCalendarCounts).mockReset()
  vi.mocked(loadCalendarSettings).mockReset()
  vi.mocked(listCalendarCounts).mockResolvedValue([])
  vi.mocked(loadCalendarSettings).mockResolvedValue(DEFAULT_CAL_SETTINGS)
  vi.mocked(loadGoal).mockReset()
  vi.mocked(saveGoal).mockReset()
  vi.mocked(loadGoal).mockResolvedValue({ visits: null, newPatients: null, revenue: null })
  vi.mocked(saveGoal).mockResolvedValue(undefined)
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
  it('AC-514.1·AC-801.2·AC-1201.2·AC-4003.1·AC-4411.1·AC-4408.2 읽는 동안 기다리는 자리는 요약 + 카드 다섯 모두 "불러오는 중"이고 머리·기간은 먼저 보인다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    expect(screen.getByRole('heading', { name: '통계', level: 1 })).toBeTruthy()
    expect(screen.getByRole('group', { name: '기간' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(WAITING_TITLES)
    expect(screen.getAllByText('불러오는 중')).toHaveLength(WAITING_TITLES.length)
    expect(pageText()).not.toContain('아직 저장된 통계가 없어요')
  })

  it('AC-514.1·AC-513.1·AC-801.1·AC-1201.1·AC-4003.1·AC-4411.1·AC-4403.1 읽으면 요약 → 카드 다섯을 승인본 차례대로 그리고 readMonths를 쓰지 않는다', async () => {
    draw()
    await sectionsShown()
    expect(screen.queryByText('불러오는 중')).toBeNull()
    expect(placesShown()).toEqual(PLACES)
    expect(heading('처방 추세')).toBeNull()
    expect(pageText()).toContain('하루 평균 내원')
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

  it('AC-514.1·AC-4403.1 읽기 실패는 오류 카드 + [다시 읽기]이고 섹션을 그리지 않으며, 누르면 다시 읽어 그린다', async () => {
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    draw()
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-STATS-READ-FAILED')
    expect(card.textContent).toContain('저장된 통계를 읽지 못했어요')
    expect(heading('환자 요약')).toBeNull()
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

  it('AC-514.2·AC-4003.1·AC-4111.1·AC-4408.2 기간을 바꿔도 열어 둔 [자세히]는 열린 채다(notes §5)', async () => {
    const R90 = statsRange(TODAY, '90d')
    answers({ ...SAVED_NOW, [R90.current.from]: read([day('2026-11-01', 10), day('2026-11-02', 10)], { latest: BIT_AT }) })
    draw()
    await sectionsShown()
    const opened = () => screen.getAllByRole('button', { name: '접기' })
    fireEvent.click(screen.getAllByRole('button', { name: '자세히' })[0]!)
    expect(opened()).toHaveLength(1)

    pressPeriod('최근 90일')
    // 보이는 기다리는 칸 열이 모두 "불러오는 중"이다. 숨은 칸 묶음 안의 매출 읽는 중 글(기간 요약 둘째 줄·매출 칸)은 세지 않는다(stats-revenue AC-4111.1)
    expect(screen.getAllByText('불러오는 중').filter((node) => node.closest('[hidden]') === null)).toHaveLength(WAITING_TITLES.length)
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
  it('AC-514.5·AC-4001.5·AC-4403.1 확장이 없는 곳은 [불러오기 설정]을 펼치면 안내와 파일 길이고, 저장된 숫자만 보인다', async () => {
    draw()
    await sectionsShown()
    expect(screen.getByText('비트 PC의 크롬에서 불러올 수 있어요')).toBeTruthy()
    expect(screen.queryByRole('button', { name: LOAD })).toBeNull()
    openSettings()
    expect(screen.getByRole('button', { name: '파일 고르기' })).toBeTruthy()
    expect(pageText()).toContain('하루 평균 내원')
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
  it('AC-514.6·AC-4403.1 저장 실패 → 새 숫자를 그대로 두고 오류 카드 + [다시 저장], 누르면 같은 값을 보내고 카드가 사라진다', async () => {
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
    await waitFor(() => expect(pageText()).toContain('32건'))
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
  it('AC-514.6·AC-4403.1 읽기와 저장이 모두 실패하면 새 숫자로 섹션을 그리고 두 카드를 보인다', async () => {
    vi.mocked(readDays).mockRejectedValue(new Error('가짜 실패'))
    vi.mocked(saveStats).mockRejectedValue(new Error('가짜 실패'))
    const port = fakeChrome()
    fakeWorker()
    draw()
    sayHello(port)
    await screen.findByRole('button', { name: LOAD })
    await screen.findByRole('alert')
    expect(heading('환자 요약')).toBeNull()

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

  it('AC-514.6·AC-4403.1 확인 필요 뒤 기간을 바꾼 읽기가 실패하면 앞 기간 숫자 없이 처방별·보고만 지금 기간으로 그린다', async () => {
    const port = fakeChrome()
    fakeWorker(INCOMPLETE)
    draw()
    sayHello(port)
    await sectionsShown()
    expect(pageText()).toContain('하루 평균 내원')
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

  it('AC-514.1·AC-4001.4·AC-4403.1 파일 확인 필요는 방금 불러온 처방별·보고가 없어 읽기가 실패하면 섹션을 그리지 않는다(읽기 실패는 접힌 채라 펼쳐 본다)', async () => {
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
    expect(heading('환자 요약')).toBeNull()
  })

  it('AC-514.1·AC-514.3·AC-4403.1 저장에 성공했는데 다시 읽기가 실패하면 카드뿐이고, [다시 읽기]로 처방별·보고가 돌아온다', async () => {
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
    expect(heading('환자 요약')).toBeNull()
    expect(screen.queryByRole('group', { name: '보고 고르기' })).toBeNull()

    answers(SAVED_NOW)
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    await sectionsShown()
    expect(screen.getByText('가짜처방하나')).toBeTruthy()
    expect(screen.getByRole('group', { name: '보고 고르기' })).toBeTruthy()
    expect(hand.splits).toHaveLength(1)
  })

  it('AC-514.1·AC-4403.1 Worker를 못 만드는 브라우저에서도 저장된 숫자는 보인다', async () => {
    vi.mocked(createStatsWorker).mockImplementation(() => {
      throw new Error('가짜 실패')
    })
    draw()
    await sectionsShown()
    expect(pageText()).toContain('하루 평균 내원')
  })
})

describe('AC-514.1 기간을 바꾼 읽기 실패', () => {
  it('AC-514.1·AC-4403.1 앞 기간 숫자를 보이지 않고 오류 카드 + [다시 읽기]이며, 누르면 다시 그린다', async () => {
    draw()
    await sectionsShown()
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    pressPeriod('최근 90일')

    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-STATS-READ-FAILED')
    expect(heading('환자 요약')).toBeNull()
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
  it('AC-514.2·AC-4003.1·AC-4408.2 기간을 바꾸면 그 기간 답이 올 때까지 앞 기간 처방 숫자를 보이지 않고 기다린다', async () => {
    const { hand } = await loadedWithSplit()
    pressPeriod('최근 7일')
    await waitFor(() => expect(hand.splits).toHaveLength(2))
    await flush() // 저장된 숫자 읽기는 끝났고 처방별 답만 남았다

    expect(screen.getAllByText('불러오는 중')).toHaveLength(WAITING_TITLES.length)
    expect(screen.queryByText('가짜처방하나')).toBeNull()

    await hand.answerSplit(1, '가짜처방둘')
    await sectionsShown()
    expect(screen.getByText('가짜처방둘')).toBeTruthy()
  })

  it('AC-514.3·AC-4003.1·AC-4408.2 다시 불러오면 기간이 같아도 앞 불러오기의 처방 답을 쓰지 않고 새 답을 기다린다', async () => {
    const { port, hand } = await loadedWithSplit()
    pressLoad(port)
    await waitFor(() => expect(hand.splits).toHaveLength(2))
    await flush()

    expect(screen.queryByText('가짜처방하나')).toBeNull()
    expect(screen.getAllByText('불러오는 중').length).toBeGreaterThanOrEqual(WAITING_TITLES.length)

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

  it('AC-514.6·AC-4403.1 다시 저장하는 동안 "저장하는 중"이고 다시 눌러도 한 번만 보내며 새 숫자는 그대로 보인다', async () => {
    await saveFailedOnce()
    await waitFor(() => expect(pageText()).toContain('32건'))
    let finish: (answer: { saved: number }) => void = () => {}
    vi.mocked(saveStats).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))

    const busy = screen.getByRole('button', { name: '저장하는 중' })
    expect(busy.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(busy)
    expect(saveStats).toHaveBeenCalledTimes(2)
    expect(pageText()).toContain('32건')
    expect(heading('환자 요약')).toBeTruthy()

    await act(async () => finish({ saved: 1 }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('AC-514.6·AC-4403.1 다시 저장이 또 실패하면 카드와 새 숫자가 그대로이고 다시 누를 수 있다', async () => {
    await saveFailedOnce()
    vi.mocked(saveStats).mockRejectedValueOnce(new Error('가짜 실패'))
    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(2))
    await loadIsFree()
    const retry = await screen.findByRole('button', { name: '다시 저장' })
    expect(retry.getAttribute('aria-disabled')).toBeNull()
    expect(pageText()).toContain('32건')
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

  it('AC-514.10·AC-801.2·AC-4411.1·AC-4408.2 기다리는 자리는 그린 화면과 같은 차례의 요약 + 카드 다섯이고, 카드는 나란히 놓지 않고 한 줄씩 쌓는다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    const places = WAITING_TITLES.map(waitingCard)
    places.forEach((place, i) => {
      expect(place.textContent, WAITING_TITLES[i]).toContain('불러오는 중')
      expect(place.className, WAITING_TITLES[i]).not.toMatch(/col-span-/)
    })
    // 카드 다섯은 그린 카드와 같은 모양이다
    for (const place of places.slice(1)) expect(place.className.split(' ')).toEqual(expect.arrayContaining(['rounded-st', 'bg-surface', 'shadow-st-card']))
    expect(new Set(places.slice(1).map((place) => place.parentElement)).size).toBe(1)
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

  it('AC-801.1·AC-1201.1·AC-4003.1·AC-4411.1 처방 골라 보기는 처방 카드의 셋째 탭이고, 카드 차례는 그대로다', async () => {
    draw()
    await sectionsShown()
    expect(placesShown()).toEqual(PLACES)
    expect(within(card('stats-rx')).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(RX_TABS)
    expect(picker().getByRole('combobox', { name: '처방 찾기' })).toBeTruthy()
  })

  it('AC-801.2·AC-4003.1·AC-4411.1·AC-4408.2 기다리는 자리의 차례가 그린 자리와 같다(환자 요약 · 매출 요약 · 카드 다섯)', async () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(WAITING_TITLES)
    expect(waitingCard('처방').textContent).toContain('불러오는 중')
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

  it('AC-812.3·AC-4003.1·AC-4403.1 고른 처방을 읽지 못하면 오류 카드는 이 칸(셋째 탭)에만 있고 다른 칸·기간 단추·다른 오류 카드는 그대로다', async () => {
    vi.mocked(readRxPicks).mockRejectedValue(new Error('가짜 실패'))
    draw()
    await sectionsShown()
    const card = await picker().findByRole('alert')
    expect(card.textContent).toContain('오류 번호 E-STATS-PICK-READ-FAILED')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    const again = screen.getAllByRole('button', { name: '다시 읽기' })
    expect(again).toHaveLength(1)
    expect(rxPanel('처방 골라 보기').contains(again[0]!)).toBe(true)
    expect(placesShown()).toEqual(PLACES)
    expect(pageText()).toContain('하루 평균 내원')
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

  it('AC-1308.1·AC-4411.1 셋째 탭을 골라도 카드 차례는 그대로다(셋째 탭 설명 글은 RxPickerSection 시험이 본다)', async () => {
    draw()
    await sectionsShown()
    picker()
    expect(placesShown()).toEqual(PLACES)
    expect(within(card('stats-rx')).getByRole('tab', { name: '처방 골라 보기' }).getAttribute('aria-selected')).toBe('true')
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
    // 답은 처방 카드 둘째 탭에 있다(설명 글 끝 기간 이름은 RxSplitSection 시험이 본다)
    expect(within(rxPanel('처방별 신환·재진')).getAllByText('가짜처방').length).toBeGreaterThan(0)
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

  it('AC-1708.1·AC-4411.3 고른 기간이면 환자 카드 옆 글이 그 기간 이름 · 날짜이고, 빠른 단추로 돌아오면 빠른 기간이다(칸 설명 끝 이름은 각 칸 시험이 본다)', async () => {
    answers({ ...SAVED_NOW, ...OCTOBER })
    draw()
    await sectionsShown()
    pressUnit('주별')
    await sectionsShown()
    expect(within(cardHead('stats-patients')).getByText('2026년 10월 · 10월 1일 – 10월 31일')).toBeTruthy()
    pressPeriod('최근 30일')
    await sectionsShown()
    expect(within(cardHead('stats-patients')).getByText('최근 30일 · 10월 14일 – 11월 12일')).toBeTruthy()
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
  // 환자 구성은 환자 카드, 시간대별 접수·원장님별은 진료 운영 카드 안 작은 칸이다(first90 AC-4411.1). 작은 칸 이름·글은 각 칸 시험이 본다
  const BIT_NOTE = '비트 PC에서 불러오면 보여요'
  const countIn = (id: string, text: string) => (card(id).textContent ?? '').split(text).length - 1

  it('AC-2706.1·AC-2706.5·AC-4411.1 비트 전용 칸은 환자 카드·진료 운영 카드 안에 있고, 이 기기에서 불러오기 전에는 Worker에 묻지 않고 비트 PC 안내다', async () => {
    const { fake } = await drawReady()
    expect(countIn('stats-patients', BIT_NOTE)).toBe(1)
    expect(countIn('stats-ops', BIT_NOTE)).toBe(2)
    pressPeriod('최근 90일')
    await sectionsShown()
    expect(sectionsSent(fake.sent)).toEqual([])
  })

  it('AC-2706.1·AC-4411.1 읽는 동안 기다리는 환자·진료 운영 카드는 "불러오는 중"이다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    for (const title of ['환자', '진료 운영']) expect(waitingCard(title).textContent, title).toContain('불러오는 중')
  })

  it('AC-2706.1 불러오면 고른 기간과 견줄 기간(range.previous)으로 묻고 답을 세 칸에 넘긴다', async () => {
    const { fake } = await loadedWithBit((message) => ({ type: 'sections-result', streamId: message.streamId, view: BIT_READY }))
    expect(sectionsSent(fake.sent)).toEqual([
      { type: 'sections', streamId: expect.any(String), from: R30.current.from, to: R30.current.to, previous: { from: R30.previous.from, to: R30.previous.to } },
    ])
    await waitFor(() => expect(card('stats-ops').textContent).toContain('나가짜원장'))
    expect(card('stats-patients').textContent).toContain('30대')
    expect(countIn('stats-patients', BIT_NOTE)).toBe(0)
    expect(countIn('stats-ops', BIT_NOTE)).toBe(0)
  })

  it('AC-2706.1 기간을 바꾸면 다시 묻고 다시 불러오지 않는다. 12개월의 끝은 불러온 끝(오늘)에서 자른다', async () => {
    const { port, fake } = await loadedWithBit((message) => ({ type: 'sections-result', streamId: message.streamId, view: BIT_READY }))
    pressPeriod('최근 12개월')
    await waitFor(() =>
      expect(sectionsSent(fake.sent).at(-1)).toMatchObject({ from: R12.current.from, to: TODAY, previous: { from: R12.previous.from, to: R12.previous.to } }),
    )
    expect(sectionsSent(fake.sent)).toHaveLength(2)
    expect(port.sent.filter((message) => message.cmd === 'stats.rows')).toHaveLength(1)
    await waitFor(() => expect(within(cardHead('stats-patients')).getByText(/^최근 12개월 · /)).toBeTruthy())
    await waitFor(() => expect(card('stats-ops').textContent).toContain('나가짜원장'))
  })

  it.each<[string, BitSectionsView, string]>([
    ['none', { kind: 'none' }, '이 기간은 아직 불러오지 않았어요'],
    ['old-helper', { kind: 'old-helper' }, '도우미를 업데이트하면 보여요'],
  ])('AC-2706.5 Worker가 %s로 답하면 세 칸 모두 그 안내다', async (_name, view, title) => {
    await loadedWithBit((message) => ({ type: 'sections-result', streamId: message.streamId, view }))
    await waitFor(() => expect(countIn('stats-patients', title)).toBe(1))
    expect(countIn('stats-ops', title)).toBe(2)
  })

  it('AC-2706.1 세 칸 답을 기다리는 동안 다른 칸은 그대로 그리고 세 칸은 숫자·안내 없이 제목·설명만이다', async () => {
    await loadedWithBit(() => null)
    expect(screen.getByText('가짜처방')).toBeTruthy()
    expect(card('stats-patients').textContent).not.toContain('30대')
    expect(card('stats-ops').textContent).not.toContain('나가짜원장')
    expect(countIn('stats-patients', BIT_NOTE)).toBe(0)
    expect(countIn('stats-ops', BIT_NOTE)).toBe(0)
  })

  it('AC-2706.1 세 칸 답이 실패하면 오류 카드 하나(번호만)이고 세 칸은 숫자 없이 비트 PC 안내다', async () => {
    await loadedWithBit((message) => ({ type: 'failed', streamId: message.streamId, code: 'E-ANALYZE-FAILED' }))
    await waitFor(() => expect(screen.getAllByRole('alert').filter((card) => card.textContent?.includes('오류 번호 E-ANALYZE-FAILED'))).toHaveLength(1))
    expect(countIn('stats-patients', BIT_NOTE)).toBe(1)
    expect(countIn('stats-ops', BIT_NOTE)).toBe(2)
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
describe('REQ-4002·REQ-4003·REQ-4411: 바로가기 띠 · 처방 탭', () => {
  const toc = () => screen.queryByRole('navigation', { name: TOC_NAME })
  const tabsOf = () => within(card('stats-rx')).getAllByRole('tab')
  const selectedTab = () => tabsOf().find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent
  const editButton = () => screen.queryByRole('button', { name: '묶음 고치기' })

  it('AC-4411.1·AC-4003.1: 요약 → 카드 다섯 차례이고 처방 카드에 탭 셋이다. 탭 이름(처방별 추세 · 처방별 신환·재진 · 처방 골라 보기)은 제목이 아니다', async () => {
    draw()
    await sectionsShown()
    expect(placesShown()).toEqual(PLACES)
    expect(tabsOf().map((tab) => tab.textContent)).toEqual(RX_TABS)
    // 숨은 패널 안에도 탭 이름 제목이 없다
    const titles = within(card('stats-rx'))
      .queryAllByRole('heading', { hidden: true })
      .map((node) => node.textContent)
    for (const name of ['처방별 추세', ...RX_TABS]) expect(titles, name).not.toContain(name)
  })

  it('AC-4411.1·AC-4003.1·AC-4408.2: 불러오는 중 자리도 같은 차례의 제목이고 자리마다 "불러오는 중" 한 줄이다', () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    draw()
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(WAITING_TITLES)
    expect(screen.getAllByText('불러오는 중')).toHaveLength(WAITING_TITLES.length)
  })

  it('AC-4411.2·AC-4002.1·AC-4002.6·AC-4403.1: 바로가기 띠는 기간 줄 바로 다음이고 화면 바깥 div의 바로 아래 자식이며, 링크 여섯의 href가 그 자리 section의 id다', async () => {
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
    expect(nav.compareDocumentPosition(sectionOf('환자 요약')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(TOC.map(([name]) => name))
    TOC.forEach(([name, id], i) => {
      expect(links[i]!.getAttribute('href'), name).toBe(`#${id}`)
      const target = document.getElementById(id)
      expect(target?.tagName, name).toBe('SECTION')
      expect(titleOf(target!), name).toBe(PLACES[i]![1])
      expect(target!.className, name).toContain('scroll-mt-41') // 목차 띠에 가리지 않는 scroll-margin(AC-4002.6)
    })
    // 겹친 id가 없다: 칸 안쪽(탭 안 칸 포함)에는 목차 id가 없다
    expect(document.querySelectorAll('[id^="stats-"]')).toHaveLength(TOC.length)
  })

  it('AC-4411.2·AC-4002.1: 바로가기 링크를 누르면 그 카드 section으로 옮긴다', async () => {
    const moved: Element[] = []
    const scrollIntoView = vi.fn(function (this: Element) {
      moved.push(this)
    })
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView })
    try {
      draw()
      await sectionsShown()
      fireEvent.click(within(toc()!).getByRole('link', { name: '처방' }))
      fireEvent.click(within(toc()!).getByRole('link', { name: '진료 운영' }))
      expect(moved).toEqual([card('stats-rx'), card('stats-ops')])
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('AC-4002.1·AC-4002.6·AC-4408.2: 읽는 동안·읽기 실패에는 목차 띠가 없고, 불러오는 중 칸에는 id가 없다', async () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    const first = draw()
    expect(toc()).toBeNull()
    for (const title of WAITING_TITLES) expect(waitingCard(title).id, title).toBe('')
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
    for (const title of WAITING_TITLES) expect(waitingCard(title).id, title).toBe('')
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

  it('AC-4002.1(기본값 14)·AC-4403.1: 목차 띠 아래 첫 칸(기간 요약)의 위 여백만 줄인다(24px · 휴대폰 20px)', async () => {
    draw()
    await sectionsShown()
    const grid = sectionOf('환자 요약').parentElement!
    expect(grid.firstElementChild).toBe(sectionOf('환자 요약'))
    expect(grid.className.split(' ')).toEqual(expect.arrayContaining(['[&>:first-child]:mt-6', 'max-md:[&>:first-child]:mt-5']))
  })

  it('AC-4003.2: 탭 셋에 세 칸이 들고 [묶음 고치기]는 처방 카드 안에 있다(탭 칸 설명 글은 각 칸 시험이 본다)', async () => {
    draw()
    await sectionsShown()
    expect(within(card('stats-rx')).getByRole('tablist', { name: '처방 보기' })).toBeTruthy()
    expect(tabsOf().map((tab) => tab.textContent)).toEqual(RX_TABS)
    expect(selectedTab()).toBe('묶음별 추세')
    expect(within(card('stats-rx')).getAllByRole('tabpanel', { hidden: true })).toHaveLength(RX_TABS.length)

    // 첫 탭: 묶음별 추세 칸(저장된 묶음 줄) + [묶음 고치기]
    await waitFor(() => expect(within(rxPanel('묶음별 추세')).getByText(SAVED_GROUP.name)).toBeTruthy())
    expect(card('stats-rx').contains(editButton())).toBe(true)

    // 둘째 탭: 처방별 신환·재진 칸(이 기기에서 불러오기 전 안내)
    expect(within(rxPanel('처방별 신환·재진')).getByText('비트 PC에서 불러오면 보여요')).toBeTruthy()

    // 셋째 탭: 처방 골라 보기 칸(처방 찾기)
    expect(within(rxPanel('처방 골라 보기')).getByRole('combobox', { name: '처방 찾기' })).toBeTruthy()
  })

  it('AC-6103.5: 넷째 탭 몇 번까지 받나는 이 기기에서 불러오기 전이면 `비트에서 불러오면 볼 수 있어요`뿐이고 숫자가 없다', async () => {
    draw()
    await sectionsShown()
    const panel = rxPanel('몇 번까지 받나')
    expect(within(panel).getByText('비트에서 불러오면 볼 수 있어요')).toBeTruthy()
    expect(panel.textContent).not.toMatch(/\d/)
  })

  it('AC-4003.5: 저장된 숫자가 없으면 탭마다 지금 칸의 빈 상태다', async () => {
    answers({})
    draw()
    await screen.findByText('아직 저장된 통계가 없어요')
    for (const name of RX_TABS) expect(rxPanel(name).textContent, name).toMatch(/자료 없음|비트 PC에서 불러오면 보여요|비트에서 불러오면 볼 수 있어요/)
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

  it('AC-4003.6: [묶음 고치기]를 누르면 첫 탭 맨 위 h3 `묶음별 추세 · 묶음 고치기`에 초점이 가고 [묶음 고치기]가 없으며, [그만두기]면 [묶음 고치기]로 초점이 돌아온다', async () => {
    draw()
    await sectionsShown()
    await waitFor(() => expect(editButton()?.getAttribute('aria-disabled')).toBeNull())
    fireEvent.click(editButton()!)
    const title = await screen.findByRole('heading', { name: '묶음별 추세 · 묶음 고치기', level: 3 })
    await waitFor(() => expect(document.activeElement).toBe(title))
    expect(rxPanel('묶음별 추세').firstElementChild).toBe(title)
    expect(tabsOf().map((tab) => tab.textContent)).toEqual(RX_TABS) // 탭 줄은 그대로다(기본값 7)
    expect(editButton()).toBeNull()
    expect(heading('처방별 추세 · 묶음 고치기')).toBeNull()

    fireEvent.click(within(rxPanel('묶음별 추세')).getByRole('button', { name: '그만두기' }))
    await waitFor(() => expect(document.activeElement).toBe(editButton()))
    expect(screen.queryByRole('heading', { name: '묶음별 추세 · 묶음 고치기' })).toBeNull()
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
    expect(tabsOf().map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1])
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
describe('stats-revenue: 매출 카드 · 바로가기 여섯 · 불러오기 뒤 매출 · 매출만 실패 상자', () => {
  const ALL = '전체 기간'
  const RESUME = '이어서 불러오기'
  const RETRY = '매출만 다시 읽기'
  const FAIL_TITLE = '매출은 읽지 못했어요'
  const READING_LINE = '비트 PC에서 읽는 중이에요 (환자·처방 저장 끝 · 매출 읽는 중). 다 끝날 때까지 이 창을 닫지 마세요.'
  const OLD_HELPER = '도우미가 예전 판이라 치료별 매출은 읽지 못했어요.'
  const EMPTY_LINE = '자료 없음 · 불러오면 이 기간의 매출이 하루씩 막대로 그려져요.'
  // 매출 요약 칸 둘(bit-total AC-6904.1, 옛 first90 AC-4408.2의 칸 셋에서 '확인 필요한 날' 칸이 빠짐)
  const WORK_CELLS = ['총매출300만원비교할 자료가 없어요진료한 날 1일 · 하루 평균 300만 원', '건당 진료비매출 ÷ 접수 70건42,857원비교할 자료가 없어요']
  const BLANK_CELLS = ['총매출–자료 없음', '건당 진료비–자료 없음']
  const DONE_TODAY = '2020년 1월 1일 – 2026년 11월 13일을 저장했어요.'
  const WHOLE_ALL: DateRange = { from: '2020-01-01', to: TODAY }

  const revenueSent = (port: FakePort) => port.sent.filter((message) => message.cmd === 'revenue.days')
  const rowsSent = (port: FakePort) => port.sent.filter((message) => message.cmd === 'stats.rows')
  // 매출 요약 칸 = 매출 요약 카드 안 격자(first90 AC-4408.2, bit-total AC-6904.1)
  const revenueRow = () => (heading('매출 요약')?.closest('section')?.querySelector('.grid') ?? undefined) as HTMLElement | undefined
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

  it('AC-4109.1·AC-4107.1·AC-4411.1·AC-4408.2·AC-4906.1: 매출 카드는 환자 카드 다음 · 예약·전환 카드 앞이다. 불러오는 중 자리도 같은 차례다', async () => {
    vi.mocked(readDays).mockImplementation(() => new Promise(() => undefined))
    const first = draw()
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(WAITING_TITLES)
    expect(WAITING_TITLES.slice(2, 7)).toEqual(['환자', '매출', '예약·전환', '예약', '처방'])
    expect(screen.getAllByText('불러오는 중')).toHaveLength(WAITING_TITLES.length)
    expect(waitingCard('매출').id).toBe('')
    first.unmount()

    answers(SAVED_NOW)
    draw()
    await sectionsShown()
    expect(placesShown()).toEqual(PLACES)
    expect(placesShown().slice(1, 6).map(([id]) => id)).toEqual(['stats-patients', 'stats-revenue', 'stats-sunap', 'stats-calendar', 'stats-rx'])
  })

  it('AC-4109.1·AC-4411.2·AC-4906.1·AC-5907.3: 바로가기 링크는 여덟이고 `매출` 링크 href는 #stats-revenue = 매출 카드 section id다', async () => {
    draw()
    await sectionsShown()
    const links = within(screen.getByRole('navigation', { name: TOC_NAME })).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['요약', '환자', '매출', '예약·전환', '예약', '처방', '진료 운영', '보고'])
    const revenueLink = within(screen.getByRole('navigation', { name: TOC_NAME })).getByRole('link', { name: '매출' })
    expect(revenueLink.getAttribute('href')).toBe('#stats-revenue')
    expect(card('stats-revenue').tagName).toBe('SECTION')
    expect(titleOf(card('stats-revenue'))).toBe('매출')
  })

  it('AC-4108.2·AC-4106.1·AC-4408.2: 열면 저장된 매출로 기간 요약 둘째 줄과 매출 칸을 그리고, 열기만 해서는 비트에서 매출을 읽지 않는다', async () => {
    revenueDb.set('2026-11-02', { ...workDay('2026-11-02'), dayCodes: true })
    const { port } = await ready()
    await waitFor(() => expect(revenueCellsText()).toEqual(WORK_CELLS))
    expect(revenueStore.loadDays).toHaveBeenCalledWith(readSpan(R30))
    expect(within(card('stats-revenue')).getByRole('tablist', { name: '매출 보기' })).toBeTruthy()
    await flush()
    expect(revenueSent(port)).toEqual([])
    expect(revenueStore.saveRange).not.toHaveBeenCalled()
  })

  it('AC-4106.3·AC-4408.2: 저장된 매출이 없는 기간은 둘째 줄 네 칸이 `–` · `자료 없음`이고 매출 칸은 한 줄이다', async () => {
    await ready()
    expect(revenueCellsText()).toEqual(BLANK_CELLS)
    expect(card('stats-revenue').textContent).toBe(`매출${EMPTY_LINE}`)
  })

  it('AC-4108.7·AC-4408.2: 비트 PC가 아닌 기기(확장 없음)는 저장된 매출만 보이고 비트 매출 읽기·저장이 없다', async () => {
    revenueDb.set('2026-11-02', { ...workDay('2026-11-02'), dayCodes: true })
    draw()
    await sectionsShown()
    await waitFor(() => expect(revenueCellsText()).toEqual(WORK_CELLS))
    await flush()
    expect(revenueStore.saveRange).not.toHaveBeenCalled()
    // 이번 달 목표 칸의 하루 매출 읽기(오늘 앞 56일 ~ 어제, stats-insights AC-6102.4)는 같은 저장된 매출 읽기라 빼고 본다
    const goalSpan = { from: addDays(TODAY, -56), to: YESTERDAY }
    const spans = revenueStore.loadDays.mock.calls.map(([range]) => range).filter((range) => range.from !== goalSpan.from || range.to !== goalSpan.to)
    expect(spans.length).toBeGreaterThan(0)
    expect(spans).toEqual(spans.map(() => readSpan(R30)))
  })

  it('AC-4108.2·AC-4108.6·AC-4408.2: [비트에서 불러오기]는 통계 조각 저장이 끝난 뒤에만 같은 통로로 revenue.days를 묻고(두 번째 연결 없음), 저장한 뒤 다시 읽은 숫자로 둘째 줄과 매출 칸을 그린다', async () => {
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
    expect(within(card('stats-revenue')).getByRole('tablist', { name: '매출 보기' })).toBeTruthy()
    expect(within(card('stats-revenue')).queryByRole('note')).toBeNull() // 새 도우미 답이라 예전 판 줄이 없다
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
    await waitFor(() => expect(within(card('stats-revenue')).getByRole('note').textContent).toContain(OLD_HELPER))
    const note = within(card('stats-revenue')).getByRole('note')
    expect(within(note).getByRole('link', { name: '설정에서 새 도우미 받기' }).getAttribute('href')).toBe('/settings')
    expect(note.compareDocumentPosition(within(card('stats-revenue')).getByRole('tablist', { name: '매출 보기' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-4107.1·AC-4107.9·AC-4408.2: 매출 칸의 [다시 읽기]는 저장된 매출만 다시 읽는다(통계 숫자는 다시 읽지 않는다)', async () => {
    revenueStore.loadDays.mockRejectedValueOnce(new Error('가짜 실패'))
    draw()
    await sectionsShown()
    await waitFor(() => expect(within(card('stats-revenue')).getByRole('alert').textContent).toContain('E-STATS-READ-FAILED'))
    expect(revenueCellsText()).toEqual(BLANK_CELLS)
    const reads = vi.mocked(readDays).mock.calls.length
    fireEvent.click(within(card('stats-revenue')).getByRole('button', { name: '다시 읽기' }))
    await waitFor(() => expect(card('stats-revenue').textContent).toBe(`매출${EMPTY_LINE}`))
    expect(within(card('stats-revenue')).queryByRole('alert')).toBeNull()
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

  it('AC-6106.4·AC-6106.5: 매출 카드의 다섯째 탭 `신환 1명당`은 이 기기에서 불러오기 전이면 `비트에서 불러오면 볼 수 있어요`뿐이고 금액이 없다', async () => {
    revenueDb.set('2026-11-02', { ...workDay('2026-11-02'), dayCodes: true })
    draw()
    await sectionsShown()
    await waitFor(() => expect(within(card('stats-revenue')).getByRole('tablist', { name: '매출 보기' })).toBeTruthy())
    const revenueTabs = within(card('stats-revenue')).getAllByRole('tab')
    expect(revenueTabs.map((tab) => tab.textContent)).toEqual(['매출 추이', '급여·비급여·기타', '치료별 매출', '건당 진료비', '신환 1명당'])
    fireEvent.click(within(card('stats-revenue')).getByRole('tab', { name: '신환 1명당' }))
    const panel = within(card('stats-revenue')).getByRole('tabpanel')
    expect(panel.textContent).toBe('비트에서 불러오면 볼 수 있어요')
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

// ── 통계 틀: 큰 카드 · 바탕 (first90 REQ-4411 TASK-6, design.md 5-5, 시안 docs/mockups/first90/redesign.html) ──
// 이 파일은 카드 h2 · 옆 글 · 차례 · 바로가기만 본다. 카드 안 작은 칸(h3)의 이름 · 글은 각 칸 시험이 본다
describe('REQ-4411 first90: 큰 카드 · 바탕', () => {
  const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
  // 오늘 11월 13일 · 오늘 진료 끝 꺼짐 → 최근 30일은 10월 14일 – 11월 12일
  const CARD_DESCS = [
    ['stats-patients', '최근 30일 · 10월 14일 – 11월 12일'],
    ['stats-rx', '만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건'],
    ['stats-ops', '언제 붐비는지 · 원장님마다'],
    ['stats-report', '비트 PC에서 불러온 숫자로 만든 보고 글 · 환자 이름은 쓰지 않아요'],
  ] as const
  const GROUPS_VIEW: StatsRxGroupsView = {
    state: 'ready',
    groups: [],
    suggested: false,
    saving: false,
    saveFailed: false,
    reread: () => undefined,
    save: async () => true,
    forLoad: async () => [],
  }

  it('AC-4411.3: 카드마다 section(rounded-st bg-surface shadow-st-card, bg-white 없음) + h2이고 옆 글은 h2 옆 머리 줄에 있다', async () => {
    draw()
    await sectionsShown()
    for (const [id, title] of CARDS) {
      expect(titleOf(card(id)), id).toBe(title)
      expect(tokens(card(id)), id).toEqual(expect.arrayContaining(['rounded-st', 'bg-surface', 'shadow-st-card', 'scroll-mt-41']))
      expect(tokens(card(id)), id).not.toContain('bg-white')
    }
    // 처방 카드 옆 글은 첫 탭 칸 설명과 글이 같다 — 탭 칸이 카드 머리 자리를 써도 이 시험은 그대로다
    for (const [id, desc] of CARD_DESCS) expect(within(cardHead(id)).getAllByText(desc).length, id).toBeGreaterThan(0)
  })

  it('AC-4411.3: 최근 12개월이면 환자 카드 옆 글은 양 끝에 해를 붙이고 끝은 마지막 끝난 날이다', async () => {
    draw()
    await sectionsShown()
    pressPeriod('최근 12개월')
    await sectionsShown()
    await waitFor(() => expect(within(cardHead('stats-patients')).getByText('최근 12개월 · 2025년 12월 1일 – 2026년 11월 12일')).toBeTruthy())
  })

  it('AC-4411.3: 카드 안 작은 칸은 h3다 — 환자 · 진료 운영 카드 안 h2는 카드 제목 하나뿐이다', async () => {
    draw()
    await sectionsShown()
    for (const id of ['stats-patients', 'stats-ops']) {
      expect(within(card(id)).getAllByRole('heading', { level: 2 }).map((node) => node.textContent), id).toEqual([titleOf(card(id))])
      expect(within(card(id)).getAllByRole('heading', { level: 3 }).length, id).toBeGreaterThan(1)
    }
  })

  it('AC-4411.3: 칸 하나 · 같은 제목인 카드(매출 · 보고)는 제목이 한 번이다', async () => {
    draw()
    await sectionsShown()
    for (const id of ['stats-revenue', 'stats-report']) {
      expect(within(card(id)).getAllByRole('heading').map((node) => node.textContent), id).toEqual([titleOf(card(id))])
    }
  })

  it('AC-4411.1: 진료 운영 카드는 요일별 · 시간대별이 1200px 이상 한 줄(30% · 70%)이고 좁으면 쌓이며, 원장님별은 그 아래 전체 폭이다', async () => {
    draw()
    await sectionsShown()
    const row = [...card('stats-ops').querySelectorAll('*')].find((el) => tokens(el).includes('min-[1200px]:flex-row'))!
    expect(tokens(row)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'min-[1200px]:flex-row']))
    expect(row.children).toHaveLength(2)
    expect(tokens(row.children[0]!)).toContain('min-[1200px]:basis-3/10')
    expect(tokens(row.children[1]!)).toContain('min-[1200px]:basis-7/10')
    const below = row.nextElementSibling!
    expect(below.parentElement).toBe(row.parentElement)
    expect(tokens(below).filter((t) => t.includes('basis-'))).toEqual([])
    expect(row.nextElementSibling?.nextElementSibling ?? null).toBeNull()
  })

  it('AC-4411.1: 화면 바깥 div 하나에 data-st-canvas 표시가 있고(바탕은 globals.css #main:has([data-st-canvas])가 칠한다) 음수 여백·바탕 클래스로 덮지 않는다', async () => {
    draw()
    await sectionsShown()
    const outer = screen.getByRole('heading', { name: '통계', level: 1 }).parentElement!
    expect(outer.hasAttribute('data-st-canvas')).toBe(true)
    expect(document.querySelectorAll('[data-st-canvas]')).toHaveLength(1)
    expect(tokens(outer).filter((t) => /^(?:[\w-]+:)*-m[xytblr]?-/.test(t) || /(?:^|:)bg-/.test(t))).toEqual([])
    // 카드는 흰 바탕이다(바탕 회색은 카드 뒤에만)
    for (const [id] of CARDS) expect(tokens(card(id)), id).toContain('bg-surface')
  })

  it('AC-4411.4: [자세히]·비트 PC 안내 글은 카드(바로가기 자리) 안에 그대로 있다', async () => {
    draw()
    await sectionsShown()
    const details = screen.getAllByRole('button', { name: '자세히' })
    expect(details.length).toBeGreaterThan(0)
    const notes = screen.getAllByText('비트 PC에서 불러오면 보여요')
    expect(notes).toHaveLength(BIT_ONLY_COUNT)
    for (const node of [...details, ...notes]) expect(node.closest('section[id^="stats-"]'), node.textContent!).not.toBeNull()
  })

  it('AC-4411.1·AC-4411.2: 매출을 주지 않으면 매출 카드가 없고 나머지 차례는 그대로다', () => {
    render(
      <StatsSections
        input={{ days: [], covered: [], range: R30 }}
        saved={false}
        split={null}
        report={null}
        hospitalName={HOSPITAL}
        groups={GROUPS_VIEW}
        bit={null}
        sunap={{ closed: [], groups: 'none', onReread: () => undefined }}
        calendar={{ rows: [], today: TODAY, onReread: () => undefined }}
      />,
    )
    expect(placesShown()).toEqual(PLACES.filter(([id]) => id !== 'stats-revenue'))
    expect(document.getElementById('stats-revenue')).toBeNull()
  })
})

// ── 통계 '예약·전환' 칸 (spec sunap-ilji REQ-4906 TASK-6, 시안 docs/mockups/sunap-ilji ?s=stats). 숫자·묶음 이름은 지어낸 것이다 ──
describe('REQ-4906 sunap-ilji: 예약·전환 카드', () => {
  const SUNAP_CARD = 'stats-sunap'
  const NO_CLOSED = '수납일지를 마감한 날이 없어요'
  const NO_GROUPS = '수납일지 설정에서 Block·물리치료 묶음을 고르면 보여요'
  const PT_GROUP: RxGroup = { id: 'g1', name: '가짜 물리치료', codes: ['B200'], sortOrder: 1 }
  const ZERO = Object.fromEntries(SUNAP_TOTAL_KEYS.map((key) => [key, 0])) as SunapTotals
  const closed = (day: string, over: Partial<SunapTotals>, late = false): SunapDay => ({ day, closedAt: `${day}T09:50:00Z`, late, totals: { ...ZERO, ...over } })
  // 기간 전체를 비트에서 센 수(Worker가 세 칸 답에 싣는다)
  const RATES: SunapRates = { visits: 20, first_n: 4, d90_n: 2, ret_n: 14, block_n: 5, pt_n: 12, first_block: 1, d90_block: 1, ret_block: 3 }
  const sunapText = () => card(SUNAP_CARD).textContent ?? ''
  const rowsIn = (title: string) =>
    [...within(card(SUNAP_CARD)).getByRole('heading', { level: 3, name: title }).closest('section')!.querySelectorAll('dl > div')].map((row) =>
      [...row.children].map((el) => el.textContent),
    )
  const chooseGroups = (blockGroup: string, ptGroup: string) => {
    vi.mocked(listStatsRxGroups).mockResolvedValue([SAVED_GROUP, PT_GROUP])
    vi.mocked(loadSunapSettings).mockResolvedValue({ blockGroup, ptGroup, kinds: DEFAULT_RSV_KINDS })
  }
  const answerWithRates = (message: StatsSectionsRequest): StatsWorkerMessage => ({
    type: 'sections-result',
    streamId: message.streamId,
    view: message.sunap === undefined ? BIT_READY : { ...BIT_READY, sunap: RATES },
  })

  it('AC-4906.1 바로가기 띠의 "매출" 다음이 "예약·전환"(#stats-sunap)이고 그 자리는 h2 "예약·전환" 카드다. 비트 PC가 아니어도 카드가 있다', async () => {
    draw()
    await sectionsShown()
    const links = within(screen.getByRole('navigation', { name: TOC_NAME })).getAllByRole('link')
    const at = links.findIndex((link) => link.textContent === '매출')
    expect(links[at + 1]!.textContent).toBe('예약·전환')
    expect(links[at + 1]!.getAttribute('href')).toBe('#stats-sunap')
    expect(titleOf(card(SUNAP_CARD))).toBe('예약·전환')
    expect(card(SUNAP_CARD).previousElementSibling).toBe(card('stats-revenue'))
    expect(card(SUNAP_CARD).nextElementSibling).toBe(card('stats-calendar'))
  })

  it('AC-4906.2 열면 고른 기간(첫날 ~ 기간 끝과 오늘 가운데 이른 날)의 마감한 날을 읽어 합으로 예약률을 그리고, 기간을 바꾸면 다시 읽는다', async () => {
    vi.mocked(listSunapDays).mockResolvedValue([
      closed('2026-11-01', { first_n: 4, rsv_first: 3, d90_n: 2, rsv_d90: 1 }),
      closed('2026-11-02', { first_n: 6, rsv_first: 2, d90_n: 3, rsv_d90: 3 }, true),
    ])
    draw()
    await sectionsShown()
    await waitFor(() => expect(sunapText()).toContain('50.0%'))
    expect(listSunapDays).toHaveBeenLastCalledWith(expect.anything(), R30.current.from, R30.current.to)
    expect(rowsIn('신환 예약률')).toEqual([
      ['신환', '', '10명'],
      ['예약률 ○ 종류 예약', '', '5명'],
      ['마감한 날', '진료한 날 2일 중', '2일'],
      ['늦은 마감 섞임', '', '1일'],
    ])
    expect(sunapText()).toContain('80.0%')
    expect(rowsIn('90일 예약률')).toEqual([
      ['90일초진', '', '5명'],
      ['예약률 ○ 종류 예약', '', '4명'],
    ])

    pressPeriod('최근 12개월')
    await sectionsShown()
    await waitFor(() => expect(listSunapDays).toHaveBeenLastCalledWith(expect.anything(), R12.current.from, TODAY))
  })

  it('AC-4906.2 마감한 날이 없으면 두 예약률 칸 모두 "수납일지를 마감한 날이 없어요"다', async () => {
    draw()
    await sectionsShown()
    await waitFor(() => expect(within(card(SUNAP_CARD)).getAllByText(NO_CLOSED)).toHaveLength(2))
  })

  it('AC-4906.2 마감한 날을 읽지 못하면 카드 안 오류 카드와 [다시 읽기]이고, 누르면 다시 읽는다', async () => {
    vi.mocked(listSunapDays).mockRejectedValueOnce(new Error('가짜 실패'))
    draw()
    await sectionsShown()
    const alert = await within(card(SUNAP_CARD)).findByRole('alert')
    expect(alert.textContent).toContain('오류 번호 E-STATS-READ-FAILED')
    fireEvent.click(within(card(SUNAP_CARD)).getByRole('button', { name: '다시 읽기' }))
    await waitFor(() => expect(within(card(SUNAP_CARD)).getAllByText(NO_CLOSED)).toHaveLength(2))
    expect(within(card(SUNAP_CARD)).queryByRole('alert')).toBeNull()
  })

  it('AC-4906.3 수납일지 설정의 묶음 id로 통계 묶음 정의(열쇠·코드만)를 찾아 세 칸 묻기에 싣고, 답의 sunapRates로 Block 전환 비율을 그린다', async () => {
    chooseGroups('g0', 'g1')
    const { fake } = await loadedWithBit(answerWithRates)
    await waitFor(() => expect(rowsIn('Block 전환')).toHaveLength(5))
    const asked = sectionsSent(fake.sent)
    expect(asked.at(-1)).toEqual({
      type: 'sections',
      streamId: expect.any(String),
      from: R30.current.from,
      to: R30.current.to,
      previous: { from: R30.previous.from, to: R30.previous.to },
      sunap: { block: defsOf(SAVED_GROUP)[0], pt: defsOf(PT_GROUP)[0] },
    })
    expect(JSON.stringify(asked)).not.toContain('가짜 물리치료')
    expect(rowsIn('Block 전환')).toEqual([
      ['신환+Block', '1/4', '25.0%'],
      ['90일+Block', '1/2', '50.0%'],
      ['재진+Block (Block 중)', '3/5', '60.0%'],
      ['Block', '5/20', '25.0%'],
      ['물리치료', '12/20', '60.0%'],
    ])
    expect(sunapText()).not.toContain(NO_GROUPS)
  })

  it('AC-4906.3 묶음을 안 골랐거나 고른 묶음이 지워졌으면 세 칸 묻기에 싣지 않고 "수납일지 설정에서 Block·물리치료 묶음을 고르면 보여요"다', async () => {
    chooseGroups('g0', 'g9-지워짐')
    const { fake } = await loadedWithBit(answerWithRates)
    await waitFor(() => expect(sunapText()).toContain(NO_GROUPS))
    expect(sectionsSent(fake.sent).every((message) => !('sunap' in message))).toBe(true)
    expect(rowsIn('Block 전환')).toEqual([])
  })
})

// ── 통계 '예약' 칸 (spec clinic-calendar REQ-5907 TASK-9, 시안 docs/mockups/clinic-calendar ?s=stats). 예약 줄·시행자 이름은 지어낸 것이다 ──
describe('REQ-5907 clinic-calendar: 예약 카드', () => {
  const CAL_CARD = 'stats-calendar'
  const EMPTY = '예약 탭에 적은 예약이 없어요'
  const calRow = (day: string, over: Partial<CalCountRow> = {}): CalCountRow => ({
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
  // 10월: 4줄(취소 1 · 변경 1 · 안 옴 1). 설정의 시행자 'ga'는 표시 '(가)'
  const OCTOBER = [calRow('2026-10-02', { status: 'cancel' }), calRow('2026-10-06', { origDay: '2026-10-01' }), calRow('2026-10-07', { auto: 'noshow' }), calRow('2026-10-08')]
  const WITH_STAFF = { ...DEFAULT_CAL_SETTINGS, staff: [{ id: 'ga', name: '가짜○○', mark: '가', color: 'blue' as const }] }
  const calCard = () => within(card(CAL_CARD))
  const cellsOf = (tr: HTMLElement) => [...tr.querySelectorAll('th, td')].map((cell) => (cell.querySelector('[data-n]') ?? cell).textContent?.trim())
  const monthRow = (label: string) => {
    const table = calCard().getByRole('heading', { name: '월별 숫자' }).closest('section')!.querySelector('table')!
    return within(table)
      .getAllByRole('row')
      .map(cellsOf)
      .find((cells) => cells[0] === label)
  }
  const staffRows = () => {
    const part = calCard().getByRole('heading', { name: '2026년 10월 나눠 보기' }).closest('section')!
    return within(within(part).getAllByRole('table')[0]!)
      .getAllByRole('row')
      .map((tr) => cellsOf(tr).slice(0, 2))
  }

  it('AC-5907.3 바로가기 띠의 "예약·전환" 다음이 "예약"(#stats-calendar)이고 그 자리는 h2 "예약" 카드다(예약·전환 카드와 처방 카드 사이). 비트 PC가 아니어도 카드가 있다', async () => {
    draw()
    await sectionsShown()
    const links = within(screen.getByRole('navigation', { name: TOC_NAME })).getAllByRole('link')
    const at = links.findIndex((link) => link.textContent === '예약·전환')
    expect(links[at + 1]!.textContent).toBe('예약')
    expect(links[at + 1]!.getAttribute('href')).toBe('#stats-calendar')
    expect(titleOf(card(CAL_CARD))).toBe('예약')
    expect(card(CAL_CARD).previousElementSibling).toBe(card('stats-sunap'))
    expect(card(CAL_CARD).nextElementSibling).toBe(card('stats-rx'))
    await waitFor(() => expect(within(cardHead(CAL_CARD)).getByText(CALENDAR_DESC)).toBeTruthy())
  })

  it('AC-5907.3 열면 이번 달을 넣은 최근 12달(지난해 12월 1일 ~ 오늘)의 예약을 한 번 읽어 달마다 예약 수·세 비율과 고른 달 나눠 보기(설정 차례·표시 이름)를 그리고, 통계 기간을 바꿔도 다시 읽지 않는다', async () => {
    vi.mocked(listCalendarCounts).mockResolvedValue(OCTOBER)
    vi.mocked(loadCalendarSettings).mockResolvedValue(WITH_STAFF)
    draw()
    await sectionsShown()
    await waitFor(() => expect(monthRow('2026년 10월')).toEqual(['2026년 10월', '4', '1', '25.0%', '1', '25.0%', '1', '25.0%']))
    expect(listCalendarCounts).toHaveBeenCalledTimes(1)
    expect(listCalendarCounts).toHaveBeenCalledWith(expect.anything(), '2025-12-01', TODAY)
    expect(monthRow('2025년 12월')).toEqual(['2025년 12월', '0', '0', '–', '0', '–', '0', '–'])
    expect(staffRows()).toEqual([
      ['시행자', '예약'],
      ['(가) 가짜○○', '4'],
      ['합계', '4'],
    ])

    pressPeriod('최근 12개월')
    await sectionsShown()
    pressPeriod('최근 7일')
    await sectionsShown()
    expect(listCalendarCounts).toHaveBeenCalledTimes(1)
    expect(monthRow('2026년 10월')?.[1]).toBe('4')
  })

  it("AC-5907.3 최근 12달에 예약이 없으면 '예약 탭에 적은 예약이 없어요'다", async () => {
    draw()
    await sectionsShown()
    await waitFor(() => expect(calCard().getByText(EMPTY)).toBeTruthy())
    expect(calCard().queryByRole('table')).toBeNull()
  })

  it('AC-5907.3 설정을 읽지 못해도 예약 수는 그리고, 나눠 보기는 예약에 적힌 이름이다', async () => {
    vi.mocked(listCalendarCounts).mockResolvedValue(OCTOBER)
    vi.mocked(loadCalendarSettings).mockRejectedValue(new Error('가짜 실패'))
    draw()
    await sectionsShown()
    await waitFor(() => expect(monthRow('2026년 10월')?.[1]).toBe('4'))
    expect(staffRows()[1]).toEqual(['가짜○○', '4'])
    expect(calCard().queryByRole('alert')).toBeNull()
  })

  it('AC-5907.3 예약을 읽지 못하면 카드 안 오류 카드와 [다시 읽기]이고, 누르면 다시 읽는다', async () => {
    vi.mocked(listCalendarCounts).mockRejectedValueOnce(new Error('가짜 실패'))
    draw()
    await sectionsShown()
    const alert = await calCard().findByRole('alert')
    expect(alert.textContent).toContain('오류 번호 E-STATS-READ-FAILED')
    vi.mocked(listCalendarCounts).mockResolvedValueOnce(OCTOBER)
    fireEvent.click(calCard().getByRole('button', { name: '다시 읽기' }))
    await waitFor(() => expect(monthRow('2026년 10월')?.[1]).toBe('4'))
    expect(calCard().queryByRole('alert')).toBeNull()
    expect(listCalendarCounts).toHaveBeenCalledTimes(2)
    expect(listCalendarCounts).toHaveBeenLastCalledWith(expect.anything(), '2025-12-01', TODAY)
  })

  it('AC-5907.3 화면은 예약 줄을 useStatsCalendar(통계 기간과 따로, 오늘 기준)로만 읽는다 — 이름·차트번호를 읽는 listAppts는 쓰지 않는다', () => {
    const ROOT = process.cwd()
    for (const name of ['StatsScreen.tsx', 'sections/StatsSections.tsx', 'useStatsCalendar.ts']) {
      const text = readFileSync(join(ROOT, 'src/components/stats', name), 'utf8')
      expect(text, name).not.toContain('listAppts')
    }
    expect(readFileSync(join(ROOT, 'src/components/stats/StatsScreen.tsx'), 'utf8')).toContain('useStatsCalendar(today)')
  })
})

// ── 통계 더 보기(stats-insights TASK-7): 요약 자리의 '평소와 다른 것'·'이번 달 목표' 카드와 진료 운영 카드의 '휴일에 따라'. 숫자는 모두 지어낸 것이다 ──
describe('stats-insights TASK-7: 요약 자리 알림·목표 · 진료 운영 휴일', () => {
  const WIDE = { from: '2025-11-13', to: YESTERDAY } // 넓은 하루 읽기 = 오늘 12달 전 같은 날 ~ 어제(기간 고르기와 상관없음)
  const ALERTS = '평소와 다른 것'
  const GOAL = '이번 달 목표'
  const HOLIDAY = '휴일에 따라'
  const ALERT_NOTE = '이번 주(월~어제)를 지난 4주의 같은 요일과 견줘요. 15% 넘게 달라지고 평소 수가 10 이상일 때만 보여요.'
  const HOLIDAY_NOTE = '최근 12달, 같은 요일끼리 견줘요. 공휴일은 2025~2027년 것이 들어 있어요.'
  const NO_GOAL_LINE = '이번 달 목표를 적어 두면 달성률을 보여 줘요'
  const CARD_TITLES = CARDS.map(([, title]) => title)
  // 9월 1일 ~ 어제 월~토(추석·개천절·대체공휴일·한글날은 쉼) 내원 100명, 이번 주(11월 9일 월 ~ 12일 목)만 50명
  const CLOSED = new Set(['2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09'])
  const OPEN_ROWS = eachDay({ from: '2026-09-01', to: YESTERDAY })
    .filter((ymd) => weekdayOf(ymd) !== 7 && !CLOSED.has(ymd))
    .map((ymd) => day(ymd, compareYmd(ymd, '2026-11-09') >= 0 ? 50 : 100))
  // 오늘 앞 56일 ~ 어제 날마다 내원 10명(요일마다 하루 평균 10명)
  const TENS = eachDay({ from: addDays(TODAY, -56), to: YESTERDAY }).map((ymd) => day(ymd, 10))

  const wideCalls = () => vi.mocked(readDays).mock.calls.filter(([range]) => range.from === WIDE.from && range.to === WIDE.to).length
  const shownTitles = () => screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)
  const alertRows = () =>
    within(card('stats-summary'))
      .getAllByRole('listitem')
      .map((li) => [...li.children].map((el) => el.textContent))
  const goalCard = () => sectionOf(GOAL)
  const linesOf = (group: HTMLElement) => [...group.querySelectorAll('p')].map((p) => p.textContent)
  // 넓은 하루 읽기의 답(나머지 읽기는 SAVED_NOW). state.fails가 참이면 넓은 하루만 거절한다
  function wideAnswers(rows: DayPayload[], state = { fails: false }) {
    vi.mocked(readDays).mockImplementation(async (range) => {
      if (range.from === WIDE.from && range.to === WIDE.to) {
        if (state.fails) throw new Error('가짜 실패')
        return read(rows)
      }
      return SAVED_NOW[range.from] ?? read()
    })
    return state
  }

  it('AC-6101.5: 요약 자리 맨 위가 "평소와 다른 것" 카드(바로가기 요약 자리)이고, 넓은 하루로 센 알림 줄과 안내 글이 보인다. 차례는 평소와 다른 것 → 환자 요약 → 매출 요약 → 이번 달 목표 → 카드 일곱', async () => {
    wideAnswers(OPEN_ROWS)
    draw()
    await sectionsShown()
    await waitFor(() => expect(titleOf(card('stats-summary'))).toBe(ALERTS))
    expect(alertRows()).toEqual([['▼', '내원 · 이번 주 200명, 지난 4주 평균 400명보다 50% 적어요', '11/9~11/12']])
    expect(within(card('stats-summary')).getByText(ALERT_NOTE)).toBeTruthy()
    // 카드 제목이 칸 제목이라 h2 하나뿐이다(h3 '평소와 다른 것' 없음)
    expect(within(card('stats-summary')).getAllByRole('heading').map((node) => node.textContent)).toEqual([ALERTS])
    expect(placesShown()).toEqual([['stats-summary', ALERTS], ...CARDS])
    expect(shownTitles()).toEqual([ALERTS, '환자 요약', '매출 요약', GOAL, ...CARD_TITLES])
    expect(sectionOf('환자 요약').id).toBe('')
  })

  it('AC-6101.5: 알림은 기간 고르기와 상관없이 오늘 기준이다 — 기간을 바꿔도 넓은 하루를 다시 읽지 않고 같은 줄이다', async () => {
    wideAnswers(OPEN_ROWS)
    draw()
    await sectionsShown()
    await waitFor(() => expect(alertRows()).toHaveLength(1))
    const rows = alertRows()
    pressPeriod('최근 7일')
    await sectionsShown()
    pressPeriod('최근 12개월')
    await sectionsShown()
    expect(alertRows()).toEqual(rows)
    expect(wideCalls()).toBe(1)
  })

  it('AC-6101.5·AC-6107.3: 넓은 하루에 저장된 날이 없으면 "평소와 다른 것" 카드와 "휴일에 따라" 칸이 없고, 요약 자리는 환자 요약 카드 그대로다', async () => {
    draw()
    await sectionsShown()
    await waitFor(() => expect(wideCalls()).toBe(1))
    await flush()
    expect(heading(ALERTS)).toBeNull()
    expect(within(card('stats-ops')).queryByRole('heading', { name: HOLIDAY })).toBeNull()
    expect(placesShown()).toEqual(PLACES)
    expect(shownTitles()).toEqual(['환자 요약', '매출 요약', GOAL, ...CARD_TITLES])
  })

  it('AC-6101.5: 넓은 하루를 읽지 못하면 맨 위 카드에 오류 카드와 [다시 읽기]이고, 누르면 넓은 하루만 다시 읽어 알림 줄을 그린다. 저장에 성공하면 넓은 하루를 다시 읽는다', async () => {
    const state = wideAnswers(OPEN_ROWS, { fails: true })
    const port = fakeChrome()
    fakeWorker()
    draw()
    sayHello(port)
    await sectionsShown()
    await waitFor(() => expect(titleOf(card('stats-summary'))).toBe(ALERTS))
    expect(within(card('stats-summary')).getByRole('alert').textContent).toContain('오류 번호 E-STATS-READ-FAILED')
    state.fails = false
    const reads = vi.mocked(readDays).mock.calls.length
    fireEvent.click(within(card('stats-summary')).getByRole('button', { name: '다시 읽기' }))
    await waitFor(() => expect(alertRows()).toHaveLength(1))
    expect(within(card('stats-summary')).queryByRole('alert')).toBeNull()
    expect(vi.mocked(readDays).mock.calls.length).toBe(reads + 1)
    expect(wideCalls()).toBe(2)

    pressLoad(port)
    await waitFor(() => expect(saveStats).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(wideCalls()).toBe(3))
    await loadIsFree()
  })

  it('AC-6102.5·AC-6102.4: 목표가 없으면 매출 요약 바로 뒤 "이번 달 목표" 카드에 안내와 [목표 적기]이고, 내원 400명을 저장하면 이번 달(2026-11)로 보내고 넓은 하루 숫자로 센 줄과 [목표 고치기]가 보인다', async () => {
    wideAnswers(TENS)
    draw()
    await sectionsShown()
    await waitFor(() => expect(within(goalCard()).getByText(NO_GOAL_LINE)).toBeTruthy())
    expect(goalCard().previousElementSibling).toBe(sectionOf('매출 요약'))
    expect(goalCard().nextElementSibling).toBe(card('stats-patients'))
    expect(within(goalCard()).getAllByRole('heading').map((node) => node.textContent)).toEqual([GOAL])
    expect(loadGoal).toHaveBeenCalledWith(expect.anything(), '2026-11')

    fireEvent.click(within(goalCard()).getByRole('button', { name: '목표 적기' }))
    fireEvent.change(within(goalCard()).getByLabelText('내원 (명)'), { target: { value: '400' } })
    fireEvent.click(within(goalCard()).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(saveGoal).toHaveBeenCalledWith(expect.anything(), '2026-11', { visits: 400, newPatients: null, revenue: null }))
    // 지금까지 = 11월 1일 ~ 어제 12일 × 10명, 월말 예상 = 120명 + 오늘 ~ 30일 18일 × 10명
    const visits = await within(goalCard()).findByRole('group', { name: '내원' })
    expect(linesOf(visits)).toEqual(['내원120명 / 목표 400명 · 30%', '이 속도면 월말 300명 · 목표의 75% 100명 모자라요'])
    expect(within(goalCard()).getByRole('button', { name: '목표 고치기' })).toBeTruthy()
    // 견줄 날은 있는데 달라진 것이 없으면 맨 위 카드는 '평소와 비슷해요'
    expect(within(card('stats-summary')).getByText('평소와 비슷해요')).toBeTruthy()
  })

  it('AC-6102.4: 매출 목표 줄은 저장된 하루 매출(오늘 앞 56일 ~ 어제, 총액)로 센다', async () => {
    vi.mocked(loadGoal).mockResolvedValue({ visits: null, newPatients: null, revenue: 10_000_000 })
    revenueDb.set('2026-11-02', { ...workDay('2026-11-02'), dayCodes: true })
    revenueDb.set('2026-11-03', { ...workDay('2026-11-03'), dayCodes: true })
    draw()
    await sectionsShown()
    const sales = await within(goalCard()).findByRole('group', { name: '매출' })
    // 지금까지 300만 원 × 2일, 월말 예상 = 600만 원 + 남은 월요일 셋·화요일 둘 × (300만 원 ÷ 8주) = 787만 5,000원 → 78%
    const [top, pace] = linesOf(sales)
    expect(top).toBe('매출600만 원 / 목표 1,000만 원 · 60%')
    expect(pace).toContain('· 목표의 78%')
    expect(revenueStore.loadDays).toHaveBeenCalledWith({ from: addDays(TODAY, -56), to: YESTERDAY })
  })

  it('AC-6102.6: [비트에서 불러오기]가 통계 저장·매출 읽기를 마치면 이번 달 목표와 하루 매출을 다시 읽어 매출 줄이 새 총액이다', async () => {
    vi.mocked(loadGoal).mockResolvedValue({ visits: null, newPatients: null, revenue: 10_000_000 })
    revenueDb.set('2026-11-02', { ...workDay('2026-11-02'), dayCodes: true })
    const port = fakeChrome()
    fakeWorker()
    draw()
    sayHello(port)
    await sectionsShown()
    const sales = () => linesOf(within(goalCard()).getByRole('group', { name: '매출' }))[0]
    await within(goalCard()).findByRole('group', { name: '매출' })
    expect(sales()).toBe('매출300만 원 / 목표 1,000만 원 · 30%')
    // 이번 달 목표 읽기·이번 달 칸의 하루 매출 읽기만 센다(보고 카드 '월간 보고서'는 지난달을 따로 읽는다, AC-6108.2)
    const goalSpan = { from: addDays(TODAY, -56), to: YESTERDAY }
    const goalReads = () => vi.mocked(loadGoal).mock.calls.filter(([, month]) => month === '2026-11').length
    const salesReads = () => revenueStore.loadDays.mock.calls.filter(([range]) => range.from === goalSpan.from && range.to === goalSpan.to).length
    const before = { goal: goalReads(), sales: salesReads() }

    // 비트 매출 읽기가 어제(11월 12일) 하루를 진료한 날 300만 원으로 저장한다
    port.revenueReply = (range) => ({ type: 'result', data: revenueAnswer(range, workDay) })
    pressLoad(port)
    await waitFor(() => expect(revenueStore.saveRange).toHaveBeenCalledTimes(1))
    await loadIsFree()
    await waitFor(() => expect(sales()).toBe('매출600만 원 / 목표 1,000만 원 · 60%'))
    expect(goalReads()).toBeGreaterThan(before.goal)
    expect(salesReads()).toBeGreaterThan(before.sales)
    // 매출을 저장한 뒤의 읽기가 마지막이다(통계 저장 직후 읽기만으로는 새 매출을 못 본다)
    const lastSales = revenueStore.loadDays.mock.calls.map(([range]) => range).findLastIndex((range) => range.from === goalSpan.from && range.to === goalSpan.to)
    expect(revenueStore.loadDays.mock.invocationCallOrder[lastSales]!).toBeGreaterThan(revenueStore.saveRange.mock.invocationCallOrder[0]!)
  })

  it('AC-6102.4: 목표가 있는데 넓은 하루를 읽지 못하면 목표 카드도 오류 카드와 [다시 읽기]이고, 누르면 목표와 넓은 하루를 함께 다시 읽는다', async () => {
    vi.mocked(loadGoal).mockResolvedValue({ visits: 400, newPatients: null, revenue: null })
    const state = wideAnswers(TENS, { fails: true })
    draw()
    await sectionsShown()
    await waitFor(() => expect(within(goalCard()).getByRole('alert').textContent).toContain('오류 번호 E-STATS-READ-FAILED'))
    state.fails = false
    fireEvent.click(within(goalCard()).getByRole('button', { name: '다시 읽기' }))
    const visits = await within(goalCard()).findByRole('group', { name: '내원' })
    expect(linesOf(visits)[0]).toBe('내원120명 / 목표 400명 · 30%')
    // 이번 달 목표 읽기만 센다(넓은 하루를 읽은 뒤 보고 카드 '월간 보고서'가 지난달 목표를 따로 읽는다, AC-6108.2)
    expect(vi.mocked(loadGoal).mock.calls.filter(([, month]) => month === '2026-11')).toHaveLength(2)
    expect(wideCalls()).toBe(2)
  })

  it('AC-6107.3: 진료 운영 카드 맨 끝(원장님별 다음)에 h3 "휴일에 따라" 표(평소 · 연휴 전날 · 연휴 다음 날)와 안내 글이 보인다', async () => {
    wideAnswers(OPEN_ROWS)
    draw()
    await sectionsShown()
    const ops = within(card('stats-ops'))
    const part = (await ops.findByRole('heading', { name: HOLIDAY, level: 3 })).closest('section')!
    expect(part.parentElement!.lastElementChild).toBe(part)
    expect(part.previousElementSibling).toBe(ops.getByRole('heading', { name: '원장님별', level: 3 }).closest('section'))
    const rows = within(part)
      .getAllByRole('row')
      .map((tr) => [...tr.children].map((cell) => cell.textContent))
    expect(rows[0]).toEqual(['날', '날 수', '하루 평균 내원', '평소보다'])
    expect(rows.slice(1).map((cells) => cells[0])).toEqual(['평소', '연휴 전날', '연휴 다음 날'])
    expect(rows[1]![3]).toBe('—')
    // 연휴 전날 = 9월 23일 · 10월 2일 · 10월 8일, 다음 날 = 9월 28일 · 10월 6일 · 10월 10일(5일보다 적다)
    expect(rows[2]!.slice(1)).toEqual(['3일', '100명', '아직 적어요'])
    expect(rows[3]!.slice(1)).toEqual(['3일', '100명', '아직 적어요'])
    expect(within(part).getByText(HOLIDAY_NOTE)).toBeTruthy()
    expect(ops.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(['진료 운영'])
  })
})

// ── 월간 보고서 인쇄(stats-insights TASK-8): 보고 카드 안 '원장님 보고 문장' 다음 '월간 보고서'. 숫자는 모두 지어낸 것이다 ──
describe('stats-insights TASK-8: 보고 카드 월간 보고서', () => {
  const WIDE = { from: '2025-11-13', to: YESTERDAY }
  const MONTHLY = '월간 보고서'
  // 넓은 하루 읽기의 답: 9월 7일 · 10월 5일 · 11월 2일 내원 10명씩(나머지 읽기는 SAVED_NOW)
  function wideRows(rows: DayPayload[]) {
    vi.mocked(readDays).mockImplementation(async (range) => (range.from === WIDE.from && range.to === WIDE.to ? read(rows) : (SAVED_NOW[range.from] ?? read())))
  }
  const ROWS = [day('2026-09-07'), day('2026-10-05'), day('2026-11-02')]
  const monthly = () => within(card('stats-report')).queryByRole('heading', { level: 3, name: MONTHLY })

  it("AC-6108.1: 보고 카드에서 '원장님 보고 문장' 다음 h3 '월간 보고서' 칸에 달 고르기(저장된 달, 처음은 지난달)·[인쇄]·10월 보고서가 있다", async () => {
    wideRows(ROWS)
    draw()
    await sectionsShown()
    const part = (await waitFor(() => monthly()!)).closest('section')!
    // 바로 앞은 원장님 보고 문장 칸(이 기기에서 불러오지 않아 안내 한 줄)
    expect(part.previousElementSibling?.textContent).toContain('비트 PC에서 불러오면 보여요')
    expect(part.parentElement!.lastElementChild).toBe(part)
    expect(within(within(part).getByRole('group', { name: '달' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['2026년 11월', '10월', '9월'])
    expect(within(part).getByRole('heading', { level: 4 }).textContent).toBe('2026년 10월 통계 보고')
    expect(within(part).getByText(`${HOSPITAL} · 11월 13일 뽑음`)).toBeTruthy()
    await waitFor(() => expect(loadGoal).toHaveBeenCalledWith(expect.anything(), '2026-10'))
    expect(revenueStore.loadDays).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-10-31' })
    expect(within(card('stats-report')).getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(['원장님 보고 문장'])
  })

  it('AC-6108.1: [인쇄]는 window.print()를 부르고, 인쇄 표시(data-print-report)는 그 보고서 종이 하나뿐이며 바로가기 띠·다른 카드·단추는 종이 밖이다', async () => {
    const print = vi.fn()
    window.print = print
    wideRows(ROWS)
    draw()
    await sectionsShown()
    await waitFor(() => expect(monthly()).toBeTruthy())
    fireEvent.click(within(card('stats-report')).getByRole('button', { name: '인쇄' }))
    expect(print).toHaveBeenCalledTimes(1)
    const papers = document.querySelectorAll('[data-print-report]')
    expect(papers).toHaveLength(1)
    const paper = papers[0]!
    expect(card('stats-report').contains(paper)).toBe(true)
    for (const id of ['stats-summary', 'stats-patients', 'stats-rx', 'stats-ops']) expect(paper.contains(card(id))).toBe(false)
    expect(paper.contains(screen.getByRole('navigation', { name: TOC_NAME }))).toBe(false)
    expect(paper.querySelectorAll('button')).toHaveLength(0)
  })

  it('AC-6108.1: 최근 12달에 저장된 날이 없으면 월간 보고서 칸이 없고 보고 카드는 원장님 보고 문장뿐이다', async () => {
    wideRows([])
    draw()
    await sectionsShown()
    await waitFor(() => expect(wideCallsOf(WIDE)).toBeGreaterThan(0))
    expect(monthly()).toBeNull()
    expect(document.querySelector('[data-print-report]')).toBeNull()
  })

  it('AC-6108.3: 보고서 종이에는 차트번호·환자 이름 칸이 없다(비트에서 불러오지 않은 기기는 몇 번까지 받나·1명당 매출 칸도 없다)', async () => {
    wideRows(ROWS)
    draw()
    await sectionsShown()
    await waitFor(() => expect(monthly()).toBeTruthy())
    const titles = [...document.querySelectorAll('[data-print-report] h5')].map((h) => h.textContent)
    expect(titles).not.toContain('몇 번까지 받나')
    expect(titles).not.toContain('신환 1명당 매출')
    expect(titles.slice(0, 2)).toEqual(['한 달 요약', '달라진 것'])
  })

  // 보고서 종이 '한 달 요약'의 매출 칸 값(원 단위, bit-total AC-6902.1)
  const paperSales = () => {
    const name = [...document.querySelectorAll('[data-print-report] dt')].find((dt) => dt.textContent === '매출')
    return name?.nextElementSibling?.textContent ?? null
  }

  it('AC-6108.5·AC-6108.4·AC-6902.1: 이번 달 보고서의 매출(어제까지)은 [비트에서 불러오기]가 매출을 저장한 뒤 다시 읽어 새 총액이다', async () => {
    wideRows(ROWS)
    revenueDb.set('2026-11-02', { ...workDay('2026-11-02'), dayCodes: true })
    const port = fakeChrome()
    fakeWorker()
    draw()
    sayHello(port)
    await sectionsShown()
    const part = (await waitFor(() => monthly()!)).closest('section')!
    fireEvent.click(within(within(part).getByRole('group', { name: '달' })).getByRole('button', { name: '2026년 11월' }))
    await waitFor(() => expect(paperSales()).toBe('3,000,000원'))
    expect(revenueStore.loadDays).toHaveBeenCalledWith({ from: '2026-10-01', to: YESTERDAY })

    // 비트 매출 읽기가 어제(11월 12일) 하루를 진료한 날 300만 원으로 저장한다
    port.revenueReply = (range) => ({ type: 'result', data: revenueAnswer(range, workDay) })
    pressLoad(port)
    await waitFor(() => expect(revenueStore.saveRange).toHaveBeenCalledTimes(1))
    await loadIsFree()
    await waitFor(() => expect(paperSales()).toBe('6,000,000원'))
    expect(revenueStore.loadDays).not.toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-11-30' })
  })

  it('AC-6108.5·AC-6902.1: 통계는 저장되고 매출만 실패한 뒤 [매출만 다시 읽기]가 매출을 저장하면 이번 달 보고서도 매출을 다시 읽어 새 총액이고, 그동안 매출 칸은 앞 값 그대로다', async () => {
    wideRows(ROWS)
    revenueDb.set('2026-11-02', { ...workDay('2026-11-02'), dayCodes: true })
    const port = fakeChrome()
    fakeWorker()
    draw()
    sayHello(port)
    await sectionsShown()
    const part = (await waitFor(() => monthly()!)).closest('section')!
    fireEvent.click(within(within(part).getByRole('group', { name: '달' })).getByRole('button', { name: '2026년 11월' }))
    await waitFor(() => expect(paperSales()).toBe('3,000,000원'))

    // 통계 조각은 저장되고 매출 읽기만 실패한다 → 매출은 그대로 300만 원
    port.revenueReply = () => ({ type: 'error', code: 'E-BIT-READ-FAILED' })
    pressLoad(port)
    const failBox = () => (screen.queryByText('매출은 읽지 못했어요')?.closest('[role="status"]') ?? null) as HTMLElement | null
    await waitFor(() => expect(failBox()).not.toBeNull())
    await loadIsFree()
    expect(revenueStore.saveRange).not.toHaveBeenCalled()
    await waitFor(() => expect(paperSales()).toBe('3,000,000원'))

    // [매출만 다시 읽기]: 통계는 다시 저장하지 않고(data.revision 그대로) 매출만 어제(11월 12일) 진료한 날 300만 원으로 저장한다
    const saves = vi.mocked(saveStats).mock.calls.length
    port.revenueReply = (range) => ({ type: 'result', data: revenueAnswer(range, workDay) })
    fireEvent.click(within(failBox()!).getByRole('button', { name: '매출만 다시 읽기' }))
    // 화면이 바뀔 때마다 매출 칸 값을 적어 둔다 — 다시 읽는 동안 칸이 사라지면 null이 남는다
    const seen: (string | null)[] = []
    await waitFor(() => {
      seen.push(paperSales())
      expect(paperSales()).toBe('6,000,000원')
    })
    await loadIsFree()
    expect(revenueStore.saveRange).toHaveBeenCalledTimes(1)
    expect(seen.every((value) => value === '3,000,000원' || value === '6,000,000원')).toBe(true)
    expect(vi.mocked(saveStats).mock.calls.length).toBe(saves)
  })

  const wideCallsOf = (span: DateRange) => vi.mocked(readDays).mock.calls.filter(([range]) => range.from === span.from && range.to === span.to).length
})
