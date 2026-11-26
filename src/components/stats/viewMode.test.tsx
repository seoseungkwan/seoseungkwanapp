// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { readAdminRows } from '@/lib/storage/adminRows'
import { listAllDay, listCalendarCounts, listCalendarSlots, loadCalendarSettings } from '@/lib/storage/calendar'
import { loadGoal, saveGoal } from '@/lib/storage/goals'
import { addRxPick, clearRxPicks, readRxPicks, removeRxPick } from '@/lib/storage/rxPicks'
import { readCoverage, readDays, saveStats } from '@/lib/storage/stats'
import { listStatsRxGroups, saveStatsRxGroups } from '@/lib/storage/statsRxGroups'
import { listSunapDays, loadSunapSettings } from '@/lib/storage/sunap'
import type { ChromeRuntimeLike } from '@/types/bridge'
import { DEFAULT_CAL_SETTINGS, type CalCountRow } from '@/types/calendar'
import type { DayPayload } from '@/types/payload'
import type { RxGroup } from '@/types/rxGroups'
import { DEFAULT_RSV_KINDS, type SunapRates } from '@/types/sunap'
import { createStatsWorker } from '@/workers/statsClient'
import { calendarCountRows } from './calendarCounts'
import { StatsScreen } from './StatsScreen'
import { StatsSections } from './sections/StatsSections'
import { groupKey } from './treatmentView'
import { statsRange } from './view'

// 다른 의원 보기 중 통계 탭 (admin-view REQ-8008 AC-8008.1·AC-8008.2, design.md '탭마다 읽기만', 시안 docs/mockups/admin-view ?s=viewing&p=stats).
// 화면을 ViewingProvider viewing={가짜 의원} 안에서 그려 쓰기 단추·칸이 없고 저장·비트 읽기 흉내가 불리지 않는지, viewing={null}이면 지금과 같은지 본다.
// 저장 코드·Worker·chrome.runtime은 모두 가짜다. 의원·시행자·처방 이름은 모두 지어낸 값이다. 진짜 Supabase에 붙지 않는다

vi.mock('@/lib/storage/stats', () => ({ readDays: vi.fn(), readMonths: vi.fn(), readCoverage: vi.fn(), saveStats: vi.fn() }))
vi.mock('@/lib/storage/rxPicks', () => ({ readRxPicks: vi.fn(), addRxPick: vi.fn(), removeRxPick: vi.fn(), clearRxPicks: vi.fn() }))
vi.mock('@/lib/storage/statsRxGroups', () => ({ listStatsRxGroups: vi.fn(), saveStatsRxGroups: vi.fn(), StatsRxGroupStoreError: class extends Error {} }))
vi.mock('@/workers/statsClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/workers/statsClient')>()), createStatsWorker: vi.fn() }))
const revenueStore = vi.hoisted(() => ({ saveRange: vi.fn(), loadDays: vi.fn(), codeTotals: vi.fn(), monthCodes: vi.fn() }))
vi.mock('@/lib/storage/revenue', () => ({ createRevenueStore: vi.fn(() => revenueStore) }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))
vi.mock('@/lib/storage/sunap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/sunap')>()),
  loadSunapSettings: vi.fn(),
  listSunapDays: vi.fn(),
}))
vi.mock('@/lib/storage/calendar', () => ({ listCalendarCounts: vi.fn(), loadCalendarSettings: vi.fn(), listCalendarSlots: vi.fn(), listAllDay: vi.fn() }))
vi.mock('@/lib/storage/adminRows', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/storage/adminRows')>()), readAdminRows: vi.fn() }))
vi.mock('@/lib/storage/goals', () => ({ loadGoal: vi.fn(), saveGoal: vi.fn() }))
// 통계 화면이 칸에 넘기는 의원 이름을 보려고 진짜 StatsSections를 그대로 감싼다(하는 일은 바뀌지 않는다)
vi.mock('./sections/StatsSections', async (importOriginal) => {
  const real = await importOriginal<typeof import('./sections/StatsSections')>()
  return { ...real, StatsSections: vi.fn(real.StatsSections) }
})

const TODAY = '2026-11-13'
const MINE = '가짜내의원'
const VIEWING: Viewing = { hospitalId: '00000000-0000-4000-8000-0000000000d2', name: '가짜다라정형외과의원' }
const R30 = statsRange(TODAY, '30d')
const CAL_FROM = '2025-12-01' // 이번 달을 넣은 최근 12달 첫날
const SAVED_GROUP: RxGroup = { id: 'g0', name: '가짜 묶음', codes: ['A100'], sortOrder: 0 }
const PICK = { code: 'A100', name: '가짜처방' }

const day = (ymd: string, patients = 10): DayPayload => ({
  schemaVersion: 2,
  quality: 'valid',
  day: ymd,
  partial: false,
  totals: { patients, newPatients: 2, returning: patients - 2, unknown: 0 },
  rx: [{ code: 'A100', name: '가짜처방', type: '3', patients: 3, newPatients: 1, returning: 2 }],
  groups: [],
  revisit: { cohort: 2, within7: 1, within14: 1 },
})
type Read = Awaited<ReturnType<typeof readDays>>
const read = (rows: DayPayload[] = []): Read => ({ rows, dropped: 0, latest: rows.length > 0 ? { at: '2026-11-13T09:42:00Z', source: 'bit' } : null, fromFile: false })
const SAVED = { [R30.current.from]: read([day('2026-11-01'), day('2026-11-02')]) }

// 예약 숫자: admin_rows('calendar_counts')가 주는 DB 칸 모양(이름·차트번호·메모 없음)과 같은 줄의 CalCountRow
const DB_ROWS = [
  { day: '2026-10-02', staff_id: 'ga', staff_name: '가짜○○', kind_id: 'dosu', kind_name: '도수', status: 'auto', auto: 'came', orig_day: null },
  { day: '2026-10-05', staff_id: 'ga', staff_name: '가짜○○', kind_id: 'dosu', kind_name: '도수', status: 'cancel', auto: null, orig_day: '2026-10-03' },
  { day: '2026-11-03', staff_id: 'na', staff_name: '가짜△△', kind_id: 'eswt', kind_name: '충격파', status: 'noshow', auto: null, orig_day: null },
]
const COUNT_ROWS: CalCountRow[] = DB_ROWS.map((r) => ({
  day: r.day,
  staffId: r.staff_id,
  staffName: r.staff_name,
  kindId: r.kind_id,
  kindName: r.kind_name,
  status: r.status as CalCountRow['status'],
  auto: r.auto as CalCountRow['auto'],
  origDay: r.orig_day,
  gMoved: false, // admin_rows·DB_ROWS에 g_moved 칸이 없으면 거짓(google-link AC-8503.4)
}))
const adminAnswer = (rows: readonly Record<string, unknown>[] = DB_ROWS) => rows.map((row) => ({ hospitalId: VIEWING.hospitalId, row: { ...row } }))

/** chrome.runtime을 읽은 횟수를 센다. 붙으면 connect 횟수도 센다 */
function countedChrome() {
  let touched = 0
  const connect = vi.fn(() => ({
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
  }))
  const runtime = { connect } as unknown as ChromeRuntimeLike
  vi.stubGlobal('chrome', {
    get runtime() {
      touched += 1
      return runtime
    },
  })
  return { connect, touched: () => touched }
}

const draw = (viewing: Viewing | null) =>
  render(
    <ViewingProvider viewing={viewing}>
      <StatsScreen hospitalName={MINE} today={TODAY} />
    </ViewingProvider>,
  )
const pageText = () => document.body.textContent ?? ''
const card = (id: string) => document.getElementById(id)!
const sectionsShown = () =>
  waitFor(() => {
    expect(screen.queryByRole('heading', { name: '환자 요약', level: 2 })).toBeTruthy()
    expect(screen.queryByText('불러오는 중')).toBeNull()
  })
const calendarShown = () => waitFor(() => expect(within(card('stats-calendar')).queryByText(/나눠 보기$/)).toBeTruthy())
function rxPanel(name: string) {
  const tab = within(card('stats-rx')).getByRole('tab', { name })
  if (tab.getAttribute('aria-selected') !== 'true') fireEvent.click(tab)
  return within(card('stats-rx')).getByRole('tabpanel')
}
const staffHead = () =>
  within(card('stats-calendar'))
    .getByText('시행자별')
    .parentElement!.querySelectorAll('thead th')
const button = (name: string | RegExp) => screen.queryByRole('button', { name })

// 지금 화면이 저장하는 길 모두(불리면 안 된다)
const WRITES = [saveStats, saveGoal, saveStatsRxGroups, addRxPick, removeRxPick, clearRxPicks] as const

beforeEach(() => {
  for (const fn of [readDays, readCoverage, saveStats, readRxPicks, listStatsRxGroups, saveStatsRxGroups, addRxPick, removeRxPick, clearRxPicks, createStatsWorker])
    vi.mocked(fn).mockReset()
  vi.mocked(readDays).mockImplementation(async (range) => SAVED[range.from] ?? read())
  vi.mocked(readCoverage).mockResolvedValue([{ from: '2026-09-01', to: '2026-11-12' }])
  vi.mocked(readRxPicks).mockResolvedValue([PICK])
  vi.mocked(listStatsRxGroups).mockResolvedValue([SAVED_GROUP])
  vi.mocked(loadSunapSettings).mockReset()
  vi.mocked(loadSunapSettings).mockResolvedValue({ blockGroup: null, ptGroup: null, kinds: DEFAULT_RSV_KINDS })
  vi.mocked(listSunapDays).mockReset()
  vi.mocked(listSunapDays).mockResolvedValue([])
  for (const fn of [listCalendarCounts, loadCalendarSettings, listCalendarSlots, listAllDay, readAdminRows]) vi.mocked(fn).mockReset()
  vi.mocked(listCalendarCounts).mockResolvedValue(COUNT_ROWS)
  vi.mocked(loadCalendarSettings).mockResolvedValue(DEFAULT_CAL_SETTINGS)
  vi.mocked(listCalendarSlots).mockResolvedValue([])
  vi.mocked(listAllDay).mockResolvedValue([])
  vi.mocked(readAdminRows).mockImplementation(async () => adminAnswer())
  vi.mocked(loadGoal).mockReset()
  vi.mocked(loadGoal).mockResolvedValue({ visits: 300, newPatients: null, revenue: null })
  vi.mocked(saveGoal).mockReset()
  for (const fn of Object.values(revenueStore)) fn.mockReset()
  revenueStore.loadDays.mockResolvedValue([])
  revenueStore.codeTotals.mockResolvedValue([])
  revenueStore.monthCodes.mockResolvedValue([])
  vi.mocked(StatsSections).mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('통계: 다른 의원 보는 중은 읽기만 (AC-8008.1)', () => {
  it('AC-8008.1: 불러오기 상자 전체(비트에서 불러오기·파일·불러오기 설정·개인정보 줄)가 없고, chrome.runtime을 건드리지 않으며 Worker도 만들지 않는다', async () => {
    const chrome = countedChrome()
    draw(VIEWING)
    await sectionsShown()
    expect(button('비트에서 불러오기')).toBeNull()
    expect(button('불러오기 설정')).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(pageText()).not.toContain('환자 개인정보는 의원 PC 밖으로 나가지 않아요')
    expect(button('이어서 불러오기')).toBeNull()
    expect(button('매출만 다시 읽기')).toBeNull()
    expect(button('다시 저장')).toBeNull()
    expect(chrome.touched()).toBe(0)
    expect(chrome.connect).not.toHaveBeenCalled()
    expect(createStatsWorker).not.toHaveBeenCalled()
  })

  it('AC-8008.1: 저장 숫자 카드·기간 단추·바로가기·탭은 그대로이고, 기간을 바꾸면 저장 숫자만 다시 읽는다', async () => {
    countedChrome()
    draw(VIEWING)
    await sectionsShown()
    expect(screen.getByRole('heading', { name: '통계', level: 1 })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '기간' })).getAllByRole('button').length).toBeGreaterThan(1)
    expect(screen.getByRole('navigation', { name: '통계 바로가기' })).toBeTruthy()
    expect(within(card('stats-rx')).getAllByRole('tab').length).toBeGreaterThan(1)
    const before = vi.mocked(readDays).mock.calls.length
    fireEvent.click(within(screen.getByRole('group', { name: '기간' })).getByRole('button', { name: '최근 7일' }))
    await waitFor(() => expect(vi.mocked(readDays).mock.calls.length).toBeGreaterThan(before))
    await sectionsShown()
    for (const fn of WRITES) expect(fn).not.toHaveBeenCalled()
  })

  it('AC-8008.1: 바로가기 띠는 보는 중 띠(data-view-band)가 있으면 그만큼 내려 147px에 붙는다(없으면 지금처럼 102px)', async () => {
    countedChrome()
    draw(VIEWING)
    await sectionsShown()
    const nav = screen.getByRole('navigation', { name: '통계 바로가기' })
    const tokens = (nav.getAttribute('class') ?? '').split(/\s+/)
    expect(tokens).toEqual(expect.arrayContaining(['sticky', 'top-25.5', 'group-has-[[data-view-band]]/app:top-36.75']))
  })

  it('AC-8008.1: 이번 달 목표에 [목표 고치기]가 없다(목표가 없을 때 [목표 적기]도 없다)', async () => {
    countedChrome()
    const { unmount } = draw(VIEWING)
    await sectionsShown()
    await waitFor(() => expect(pageText()).toContain('이번 달 목표'))
    expect(button('목표 고치기')).toBeNull()
    unmount()
    vi.mocked(loadGoal).mockResolvedValue({ visits: null, newPatients: null, revenue: null })
    draw(VIEWING)
    await sectionsShown()
    await waitFor(() => expect(pageText()).toContain('이번 달 목표'))
    expect(button('목표 적기')).toBeNull()
    expect(saveGoal).not.toHaveBeenCalled()
  })

  it('AC-8008.1: 처방 카드 묶음별 추세에 [묶음 고치기]가 없고, 처방 골라 보기는 고른 처방 표만 있고 넣기·빼기·비우기가 없다', async () => {
    countedChrome()
    draw(VIEWING)
    await sectionsShown()
    await waitFor(() => expect(within(rxPanel('묶음별 추세')).getByText('가짜 묶음')).toBeTruthy())
    expect(button('묶음 고치기')).toBeNull()
    const picker = rxPanel('처방 골라 보기')
    await waitFor(() => expect(within(picker).getAllByText('가짜처방').length).toBeGreaterThan(0))
    expect(within(picker).queryByRole('combobox')).toBeNull()
    expect(within(picker).queryByPlaceholderText('이름이나 코드를 적어 주세요')).toBeNull()
    expect(within(picker).queryByRole('button', { name: /빼기$/ })).toBeNull()
    expect(within(picker).queryByRole('button', { name: '모두 지우기' })).toBeNull()
    for (const fn of WRITES) expect(fn).not.toHaveBeenCalled()
  })

  it('AC-8008.1: 의원 이름은 보는 의원 이름이다(칸 복사 글·보고 문장에 쓰는 이름)', async () => {
    countedChrome()
    draw(VIEWING)
    await sectionsShown()
    const names = vi.mocked(StatsSections).mock.calls.map(([props]) => props.hospitalName)
    expect(names.length).toBeGreaterThan(0)
    expect(new Set(names)).toEqual(new Set([VIEWING.name]))
  })

  it('AC-8008.1: 저장 숫자 읽기가 실패하면 [다시 읽기](서버 다시 읽기)는 그대로 있고 누르면 저장 숫자만 다시 읽는다', async () => {
    countedChrome()
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    draw(VIEWING)
    const again = await screen.findByRole('button', { name: '다시 읽기' })
    vi.mocked(readDays).mockImplementation(async (range) => SAVED[range.from] ?? read())
    fireEvent.click(again)
    await sectionsShown()
    for (const fn of WRITES) expect(fn).not.toHaveBeenCalled()
  })
})

describe('통계: 보는 중 예약 칸 (AC-8008.2)', () => {
  it("AC-8008.2: 예약 숫자는 readAdminRows('calendar_counts', [보는 의원], 12달 첫날, 오늘)로 읽고 calendar_appts 읽기(listCalendarCounts·listCalendarSlots·listAllDay)는 부르지 않는다", async () => {
    countedChrome()
    draw(VIEWING)
    await sectionsShown()
    await calendarShown()
    expect(vi.mocked(readAdminRows).mock.calls).toEqual([['calendar_counts', [VIEWING.hospitalId], CAL_FROM, TODAY]])
    expect(listCalendarCounts).not.toHaveBeenCalled()
    expect(listCalendarSlots).not.toHaveBeenCalled()
    expect(listAllDay).not.toHaveBeenCalled()
    // 받은 줄로 그린다: 10월 나눠 보기 시행자 '가짜○○'
    expect(within(card('stats-calendar')).getAllByText('가짜○○').length).toBeGreaterThan(0)
  })

  it("AC-8008.2: '다시 예약' 칸·그 설명과 '예약 빈자리' 칸을 그리지 않고 새 글을 더하지 않는다", async () => {
    countedChrome()
    draw(VIEWING)
    await sectionsShown()
    await calendarShown()
    const heads = [...staffHead()].map((th) => th.textContent)
    expect(heads).toEqual(['시행자', '예약', '취소', '취소율', '변경', '변경율', '안 옴', '안 옴율', '12달 예약 수'])
    const text = card('stats-calendar').textContent ?? ''
    expect(text).not.toContain('다시 예약')
    expect(text).not.toContain('예약 빈자리')
  })

  it('AC-8008.2: 예약 줄 읽기가 실패하면 지금과 같은 오류·[다시 읽기]이고, 누르면 readAdminRows만 다시 부른다', async () => {
    countedChrome()
    vi.mocked(readAdminRows).mockRejectedValueOnce(new Error('가짜 실패'))
    draw(VIEWING)
    await sectionsShown()
    const box = within(card('stats-calendar'))
    fireEvent.click(await box.findByRole('button', { name: '다시 읽기' }))
    await calendarShown()
    expect(readAdminRows).toHaveBeenCalledTimes(2)
    expect(listCalendarCounts).not.toHaveBeenCalled()
  })

  it('AC-8008.2: admin_rows 줄은 지금 예약 줄 검사(listCalendarCounts의 toCount)와 같은 줄만 같은 모양으로 받는다', async () => {
    const real = await vi.importActual<typeof import('@/lib/storage/calendar')>('@/lib/storage/calendar')
    const bad: Record<string, unknown>[] = [
      { ...DB_ROWS[0]!, day: '2026-13-40' },
      { ...DB_ROWS[0]!, staff_id: '' },
      { ...DB_ROWS[0]!, staff_name: '가'.repeat(11) },
      { ...DB_ROWS[0]!, kind_id: 'k'.repeat(41) },
      { ...DB_ROWS[0]!, kind_name: 7 },
      { ...DB_ROWS[0]!, status: 'gone' },
      { ...DB_ROWS[0]!, auto: 'cancel' },
      { ...DB_ROWS[0]!, orig_day: '어제' },
      { ...DB_ROWS[0]!, staff_name: '가'.repeat(10), kind_name: '😀'.repeat(10) }, // 글자 수는 코드 포인트로 센다
      { ...DB_ROWS[0]!, name: '가짜환자', chart: '000123', memo: '가짜 메모' }, // 다른 칸은 옮기지 않는다
    ]
    const all = [...DB_ROWS, ...bad]
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'gte', 'lte', 'order']) chain[method] = () => chain
    chain.range = async () => ({ data: all.map((row) => ({ ...row })), error: null, status: 200 })
    const client = { from: () => chain } as unknown as Parameters<typeof real.listCalendarCounts>[0]
    const expected = await real.listCalendarCounts(client, CAL_FROM, TODAY)
    expect(expected.length).toBe(DB_ROWS.length + 2)
    expect(calendarCountRows(adminAnswer(all))).toEqual(expected)
    expect(JSON.stringify(calendarCountRows(adminAnswer(all)))).not.toMatch(/가짜환자|000123|가짜 메모/)
  })
})

describe('통계: 보는 중 비트 전용 칸은 저장 합계로 (AC-8025.1·AC-8025.2)', () => {
  // 수납일지 Block·물리치료 묶음(둘 다 통계 처방 묶음에 있음 → Block 전환 칸이 묶음 안내 없이 숫자 자리)
  const BLOCK_GROUP: RxGroup = { id: 'g1', name: '가짜 블록', codes: ['B100'], sortOrder: 1 }
  const RATES: SunapRates = { visits: 10, first_n: 2, d90_n: 1, ret_n: 7, block_n: 3, pt_n: 6, first_block: 1, d90_block: 0, ret_block: 2 }
  const withSunap = (row: DayPayload): DayPayload => ({ ...row, sunap: { ...RATES } })
  const NOT_HERE = '비트 PC에서 불러오면 보여요'
  const DROPOFF_NOT_HERE = '비트에서 불러오면 볼 수 있어요'
  const KEY = groupKey(SAVED_GROUP.codes)
  // 날 줄 둘씩: 최근 30일(11월 1·2일), 10월(5·6일). 덮은 기간 9월 1일 ~ 11월 12일(beforeEach)
  const DAYS_30 = [withSunap(day('2026-11-01')), withSunap(day('2026-11-02'))]
  const DAYS_OCT = [withSunap(day('2026-10-05')), withSunap(day('2026-10-06'))]
  // 10월 달 줄(admin_rows 'stats_months' 모양). 저장된 평균 9.9·빠지는 곳 5는 일부러 수와 맞지 않는다(다시 세면 3회 → 4회)
  const OCT_ROW = {
    month: '2026-10',
    partial: false,
    rx: [{ code: 'A100', name: '가짜처방', type: '3', patients: 3, newPatients: 1, returning: 2, followup: [1, 1, 1, 0] }],
    groups: [{ id: KEY, patients: 3, newPatients: 1, returning: 2, followup: [1, 1, 1, 0] }],
    dropoff: { asOf: '2026-11-12', lines: [{ group: KEY, n: 8, atLeast: [8, 5, 5, 1, 0, 0], ten: 0, once: 3, average: 9.9, drop: 5 }] },
    sections: null,
  }
  const monthCalls = () => vi.mocked(readAdminRows).mock.calls.filter(([kind]) => kind === 'stats_months')
  const blockCell = () => within(within(card('stats-sunap')).getByRole('heading', { name: 'Block 전환' }).closest('section')!)
  const pressDayUnit = () => fireEvent.click(within(screen.getAllByRole('group', { name: '보는 단위' })[0]!).getByRole('button', { name: '일별' }))

  function serve({ days30 = DAYS_30, daysOct = DAYS_OCT, month = OCT_ROW as Record<string, unknown> } = {}) {
    vi.mocked(readDays).mockImplementation(async (range) => (range.from === R30.current.from ? read(days30) : range.from === '2026-10-01' ? read(daysOct) : read()))
    vi.mocked(readAdminRows).mockImplementation(async (kind) => (kind === 'stats_months' ? [{ hospitalId: VIEWING.hospitalId, row: { ...month } }] : adminAnswer()))
  }

  beforeEach(() => {
    vi.mocked(listStatsRxGroups).mockResolvedValue([SAVED_GROUP, BLOCK_GROUP])
    vi.mocked(loadSunapSettings).mockResolvedValue({ blockGroup: 'g1', ptGroup: 'g0', kinds: DEFAULT_RSV_KINDS })
  })

  it('AC-8025.1: 최근 30일 — Block 전환은 고른 기간 날 줄 sunap 합으로 그리고, 온전한 달이 아니라 달 줄은 읽지 않으며 몇 번까지 받나·처방별 신환·재진은 안내 글이다', async () => {
    countedChrome()
    serve()
    draw(VIEWING)
    await sectionsShown()
    // 두 날 합: 신환 4명 중 Block 2명 · 90일초진 2명 중 0명 · Block 6명 중 재진 4명 · 내원 20건 중 Block 6·물리치료 12
    await waitFor(() => expect(blockCell().queryByText('2/4')).toBeTruthy())
    expect(blockCell().getByText('0/2')).toBeTruthy()
    expect(blockCell().getByText('4/6')).toBeTruthy()
    expect(blockCell().getByText('6/20')).toBeTruthy()
    expect(blockCell().getByText('12/20')).toBeTruthy()
    expect(blockCell().queryByText(NOT_HERE)).toBeNull()
    expect(monthCalls()).toEqual([])
    expect(within(rxPanel('몇 번까지 받나')).getByText(DROPOFF_NOT_HERE)).toBeTruthy()
    expect(within(rxPanel('처방별 신환·재진')).getByText(NOT_HERE)).toBeTruthy()
    for (const fn of WRITES) expect(fn).not.toHaveBeenCalled()
  })

  it("AC-8025.1: 지난달(일별 → 10월) — readAdminRows('stats_months', [보는 의원], 10월 1일, 31일)로 읽어 몇 번까지 받나(수에서 다시 셈, 평균 –)·처방별 신환·재진·Block 전환을 그린다", async () => {
    countedChrome()
    serve()
    draw(VIEWING)
    await sectionsShown()
    pressDayUnit()
    await waitFor(() => expect(monthCalls()).toEqual([['stats_months', [VIEWING.hospitalId], '2026-10-01', '2026-10-31']]))
    await sectionsShown()
    await waitFor(() => expect(within(rxPanel('몇 번까지 받나')).queryByText('가짜 묶음 처음 받은 신환 8명')).toBeTruthy())
    const dropoff = within(rxPanel('몇 번까지 받나'))
    expect(dropoff.getByText('38%')).toBeTruthy() // 1회만 3/8
    expect(dropoff.getByText('3회 → 4회')).toBeTruthy() // 더한 수에서 다시 셈(저장된 5회가 아니다)
    expect(dropoff.queryByText('5회 → 6회')).toBeNull()
    expect(dropoff.queryByText('9.9회')).toBeNull()
    expect(dropoff.getByText('–')).toBeTruthy() // 평균은 저장된 수로 다시 셀 수 없다
    expect(dropoff.queryByText(DROPOFF_NOT_HERE)).toBeNull()
    const split = within(rxPanel('처방별 신환·재진'))
    expect(split.getByText('2026-10-01 ~ 2026-10-31 (31일) · 외래 환자 20명 (신환 4명 · 재진 16명) · 내원 20건')).toBeTruthy()
    expect(split.getByRole('row', { name: /가짜처방/ })).toBeTruthy()
    expect(split.queryByText(NOT_HERE)).toBeNull()
    expect(blockCell().getByText('2/4')).toBeTruthy()
    for (const fn of WRITES) expect(fn).not.toHaveBeenCalled()
  })

  it('AC-8025.2: 환자 구성·시간대별 접수·원장님별은 저장 합계에 없는 숫자(건수·요일×시간 칸·원장님별 내원)를 써서 보는 중에도 지금처럼 안내 글이다', async () => {
    countedChrome()
    serve()
    draw(VIEWING)
    await sectionsShown()
    pressDayUnit()
    await waitFor(() => expect(monthCalls().length).toBe(1))
    await sectionsShown()
    await waitFor(() => expect(within(rxPanel('처방별 신환·재진')).queryByText(NOT_HERE)).toBeNull())
    const titled = (id: string, title: string) => within(within(card(id)).getByRole('heading', { name: title }).closest('section')!)
    expect(titled('stats-patients', '환자 구성').getByText(NOT_HERE)).toBeTruthy()
    expect(titled('stats-ops', '시간대별 접수').getByText(NOT_HERE)).toBeTruthy()
    expect(titled('stats-ops', '원장님별').getByText(NOT_HERE)).toBeTruthy()
  })

  it('AC-8025.2: 고른 기간 날 줄 하나라도 sunap이 없으면 Block 전환은 안내 글이고, 그달 줄에 dropoff가 없으면 몇 번까지 받나만 안내 글이다', async () => {
    countedChrome()
    serve({ days30: [DAYS_30[0]!, day('2026-11-02')], month: { ...OCT_ROW, dropoff: null } })
    draw(VIEWING)
    await sectionsShown()
    await waitFor(() => expect(blockCell().queryByText(NOT_HERE)).toBeTruthy())
    expect(blockCell().queryByText('신환+Block')).toBeNull()
    pressDayUnit()
    await waitFor(() => expect(monthCalls().length).toBe(1))
    await sectionsShown()
    await waitFor(() => expect(within(rxPanel('처방별 신환·재진')).queryByText(NOT_HERE)).toBeNull())
    expect(within(rxPanel('몇 번까지 받나')).getByText(DROPOFF_NOT_HERE)).toBeTruthy()
    expect(blockCell().getByText('2/4')).toBeTruthy() // 10월 날 줄은 모두 sunap이 있다
  })

  it('AC-8025.2: 그달 줄이 덜 된 달(partial)이거나 달 줄 읽기가 실패하면 몇 번까지 받나·처방별 신환·재진은 안내 글이다', async () => {
    countedChrome()
    serve({ month: { ...OCT_ROW, partial: true } })
    const { unmount } = draw(VIEWING)
    await sectionsShown()
    pressDayUnit()
    await waitFor(() => expect(monthCalls().length).toBe(1))
    await sectionsShown()
    expect(within(rxPanel('처방별 신환·재진')).getByText(NOT_HERE)).toBeTruthy()
    expect(within(rxPanel('몇 번까지 받나')).getByText(DROPOFF_NOT_HERE)).toBeTruthy()
    unmount()
    vi.mocked(readAdminRows).mockImplementation(async (kind) => {
      if (kind === 'stats_months') throw new Error('가짜 실패')
      return adminAnswer()
    })
    draw(VIEWING)
    await sectionsShown()
    pressDayUnit()
    await waitFor(() => expect(monthCalls().length).toBe(2))
    await sectionsShown()
    expect(within(rxPanel('처방별 신환·재진')).getByText(NOT_HERE)).toBeTruthy()
    expect(within(rxPanel('몇 번까지 받나')).getByText(DROPOFF_NOT_HERE)).toBeTruthy()
  })

  it('AC-8025.2: viewing={null}이면 날 줄에 sunap이 있어도 Block 전환·처방별·몇 번까지 받나는 지금처럼 안내 글이고 readAdminRows를 부르지 않는다', async () => {
    countedChrome()
    serve()
    draw(null)
    await sectionsShown()
    await waitFor(() => expect(blockCell().queryByText(NOT_HERE)).toBeTruthy())
    pressDayUnit()
    await sectionsShown()
    await waitFor(() => expect(blockCell().queryByText(NOT_HERE)).toBeTruthy())
    expect(blockCell().queryByText('2/4')).toBeNull()
    expect(within(rxPanel('처방별 신환·재진')).getByText(NOT_HERE)).toBeTruthy()
    expect(within(rxPanel('몇 번까지 받나')).getByText(DROPOFF_NOT_HERE)).toBeTruthy()
    expect(readAdminRows).not.toHaveBeenCalled()
    await act(async () => {})
  })
})

describe('통계: viewing={null}이면 지금과 같다 (AC-8008.1·AC-8008.2)', () => {
  it('AC-8008.1·AC-8008.2: 불러오기 상자·[목표 고치기]·[묶음 고치기]·처방 찾기 칸이 있고, 예약은 listCalendarCounts·listCalendarSlots로 읽어 다시 예약·예약 빈자리를 그리며, 이름은 내 의원이다', async () => {
    const chrome = countedChrome()
    draw(null)
    await sectionsShown()
    expect(button('불러오기 설정')).toBeTruthy()
    expect(document.querySelector('input[type="file"]')).toBeTruthy()
    expect(chrome.touched()).toBeGreaterThan(0)
    await waitFor(() => expect(button('목표 고치기')).toBeTruthy())
    rxPanel('묶음별 추세')
    await waitFor(() => expect(button('묶음 고치기')).toBeTruthy()) // 카드 머리 줄 오른쪽 자리
    expect(within(rxPanel('처방 골라 보기')).getByPlaceholderText('이름이나 코드를 적어 주세요')).toBeTruthy()
    await calendarShown()
    expect(readAdminRows).not.toHaveBeenCalled()
    expect(listCalendarCounts).toHaveBeenCalledWith(expect.anything(), CAL_FROM, TODAY)
    expect(listCalendarSlots).toHaveBeenCalledWith(expect.anything(), CAL_FROM, TODAY)
    expect([...staffHead()].map((th) => th.textContent)).toContain('다시 예약')
    await waitFor(() => expect(card('stats-calendar').textContent).toContain('예약 빈자리'))
    expect(new Set(vi.mocked(StatsSections).mock.calls.map(([props]) => props.hospitalName))).toEqual(new Set([MINE]))
    await act(async () => {})
  })
})
