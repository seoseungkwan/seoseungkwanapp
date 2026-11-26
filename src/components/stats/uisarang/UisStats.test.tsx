// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { MonthlyReportSection } from '@/components/stats/sections/ReportSection'
import { StatsSections, type StatsRevenueShown } from '@/components/stats/sections/StatsSections'
import { StatsScreen } from '@/components/stats/StatsScreen'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import { statsRange, type StatsInput } from '@/components/stats/view'
import { eachDay } from '@/lib/analytics/dates'
import { VISIT_HOURS } from '@/lib/analytics/visitHours'
import { loadGoal } from '@/lib/storage/goals'
import { readCoverage, readDays } from '@/lib/storage/stats'
import { listStatsRxGroups } from '@/lib/storage/statsRxGroups'
import { listSunapDays, loadSunapSettings } from '@/lib/storage/sunap'
import { listCalendarCounts, loadCalendarSettings } from '@/lib/storage/calendar'
import { readUisPeriods } from '@/lib/storage/uisarang'
import { DEFAULT_CAL_SETTINGS } from '@/types/calendar'
import { DEFAULT_HOURS, type EmrKind } from '@/types/clinicProfile'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { SavedRevenueDay } from '@/types/revenue'
import type { BitSectionsView, PatientMix } from '@/types/stats'
import { DEFAULT_RSV_KINDS } from '@/types/sunap'
import type { UisAgePayload, UisPeriodRow, UisRxPayload } from '@/types/uisarang'

// 통계 탭 의사랑 의원 화면 잇기(specs/uisarang-upload REQ-8812, 시안 docs/mockups/uisarang-upload ?s=stats·?s=stats-gap).
// 통계 틀(StatsSections)·통계 화면(StatsScreen)을 그려 '셀 수 없음 안내' 자리마다의 글, 카드 옆 글, 자료 줄·빈 글을 본다.
// 비트 의원은 지금 그대로임(AC-8812.9)도 같은 그림으로 본다. 저장 읽기는 모두 가짜이고 숫자·이름·코드는 이 파일에서 지어낸 값이다

const clinic = vi.hoisted(() => ({ view: null as unknown }))
vi.mock('@/components/clinic/useClinicProfile', () => ({ useClinicProfile: () => clinic.view }))
vi.mock('@/lib/storage/uisarang', () => ({ readUisPeriods: vi.fn() }))
vi.mock('@/lib/storage/stats', () => ({ readDays: vi.fn(), readMonths: vi.fn(), readCoverage: vi.fn(), saveStats: vi.fn() }))
vi.mock('@/lib/storage/rxPicks', () => ({ readRxPicks: vi.fn(() => new Promise(() => undefined)), addRxPick: vi.fn(), removeRxPick: vi.fn(), clearRxPicks: vi.fn() }))
vi.mock('@/lib/storage/statsRxGroups', () => ({ listStatsRxGroups: vi.fn(), saveStatsRxGroups: vi.fn(), StatsRxGroupStoreError: class extends Error {} }))
const revenueStore = vi.hoisted(() => ({ saveRange: vi.fn(), loadDays: vi.fn(), codeTotals: vi.fn(), monthCodes: vi.fn() }))
vi.mock('@/lib/storage/revenue', () => ({ createRevenueStore: vi.fn(() => revenueStore) }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))
vi.mock('@/lib/storage/sunap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/sunap')>()),
  loadSunapSettings: vi.fn(),
  listSunapDays: vi.fn(),
}))
vi.mock('@/lib/storage/calendar', () => ({ listCalendarCounts: vi.fn(), loadCalendarSettings: vi.fn(), listCalendarSlots: vi.fn(async () => []), listAllDay: vi.fn(async () => []) }))
vi.mock('@/lib/storage/goals', () => ({ loadGoal: vi.fn(), saveGoal: vi.fn() }))
vi.mock('@/workers/statsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/workers/statsClient')>()),
  createStatsWorker: vi.fn(() => ({ postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null, onmessageerror: null })),
}))
// 월간 보고서는 진짜를 그리고 받은 값만 본다(AC-8817.5: StatsSections가 uis를 넘긴다)
vi.mock('@/components/stats/sections/ReportSection', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/stats/sections/ReportSection')>()
  return { ...real, MonthlyReportSection: vi.fn(real.MonthlyReportSection) }
})

const TODAY = '2026-11-27' // 금요일
const HOSPITAL = '가짜가나의원'
const R7 = statsRange(TODAY, '7d') // 11월 20일 ~ 11월 26일
const CLOSED = '2026-11-22' // 일요일 휴진
const WORKED = eachDay(R7.current).filter((ymd) => ymd !== CLOSED)
const NA = '의사랑 엑셀로는 셀 수 없어요'
const UIS_RX_DESC = '처방량은 환자 수가 아니라 의사랑 총투여량의 합이에요'
const BIT_RX_DESC = '만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건'
const UIS_REPORT_DESC = '저장된 숫자로 만든 보고 글 · 환자 이름은 쓰지 않아요'
const BIT_REPORT_DESC = '비트 PC에서 불러온 숫자로 만든 보고 글 · 환자 이름은 쓰지 않아요'
const OLD_HELPER = '도우미가 예전 판이라'
const HELPER_90 = '90일초진은 새 도우미(0.7.0)가 있어야 보여요.'
// '셀 수 없음 안내' 표의 통계 탭 자리마다 까닭(requirements '화면 글자')
const WHY = {
  revisit: '환자마다 다시 온 날을 알 수 없어요.',
  rxSplit: '처방을 환자마다 나눌 수 없어요.',
  block: '환자마다 받은 처방을 알 수 없어요.',
  hours: '접수 시각이 엑셀에 없어요.',
  doctors: '원장님마다 나눈 숫자가 엑셀에 없어요.',
  treat: '처방 카드의 묶음별 총액에서 볼 수 있어요.',
  mix: '아래쪽 표에서는 나이대만 세요.',
  report: '기간을 직접 고르면 저장된 숫자로 보고 글을 만들어요.',
} as const

// 의사랑 날 줄: 90일초진(first90)이 없다 — 비트 길이면 '확인 불가'와 도우미 안내가 뜨는 모양이다
const day = (ymd: string): DayPayload => ({
  schemaVersion: 2,
  quality: 'valid',
  day: ymd,
  partial: false,
  totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
  rx: [],
  groups: [],
  revisit: { cohort: 0, within7: null, within14: null },
})
const INPUT: StatsInput = { days: WORKED.map(day), covered: [{ from: '2026-11-01', to: '2026-11-26' }], range: R7 }

const rxRow = (ymd: string): UisPeriodRow<UisRxPayload> => ({
  kind: 'rx',
  from: ymd,
  to: ymd,
  payload: { v: 1, rows: [{ code: 'MT30', name: '가짜 도수 30분', qty: 2, amount: 160000 }], total: 160000 },
  updatedAt: '2026-11-26T10:05:00Z',
})
const ageRow = (ymd: string): UisPeriodRow<UisAgePayload> => ({
  kind: 'age',
  from: ymd,
  to: ymd,
  payload: { v: 1, patients: 10, newPatients: 2, bands: [0, 1, 1, 1, 1, 2, 2, 1, 1, 0], newBands: [0, 0, 0, 1, 0, 1, 0, 0, 0, 0] },
  updatedAt: '2026-11-26T10:05:00Z',
})

const MIX: PatientMix = { total: { people: 10, visits: 12 }, compared: false, age: [], insurance: [], city: [], town: [] }
const filled = (...values: number[]) => [...values, ...Array<number>(VISIT_HOURS.length - values.length).fill(0)]
const BIT: BitSectionsView = {
  kind: 'ready',
  mix: { all: MIX, new: MIX },
  hours: { hours: [...VISIT_HOURS], rows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, openDays: 1, cells: filled(2, 3) })), unknown: 0, peak: { weekday: 1, hour: 9, average: 3 } },
  doctors: { kind: 'single' },
}
const GROUPS: StatsRxGroupsView = {
  state: 'ready',
  groups: [{ id: 'g1', name: '가짜 도수', codes: ['MT30'], sortOrder: 0 }],
  suggested: false,
  saving: false,
  saveFailed: false,
  reread: () => undefined,
  save: async () => true,
  forLoad: async () => [],
}
const revenueDay = (date: string): SavedRevenueDay => ({
  date,
  visits: 10,
  newPatients: 2,
  returnVisits: 8,
  total: 1_000_000,
  insurer: 500_000,
  noncovered: 300_000,
  copay: 150_000,
  otherTotal: 50_000,
  cash: 100_000,
  card: 800_000,
  transfer: 100_000,
  receivableIn: 0,
  unconfirmed: false,
  splitUnconfirmed: false,
  dayCodes: false, // 의사랑 날은 늘 날 단위 처방 줄이 없다
})
// noDayCodes 참: 비트 길이면 옛 도우미 안내가 뜨는 값이다(AC-8812.8은 의사랑이면 뜨지 않음을 본다)
const REVENUE: StatsRevenueShown = {
  state: 'ready',
  days: eachDay(R7.load).map(revenueDay),
  codes: [],
  monthCodes: [],
  noDayCodes: true,
  lastDay: '2026-11-26',
  onReread: () => undefined,
}

const profileView = (emr: EmrKind, state: ClinicProfileView['state'] = 'ready'): ClinicProfileView => ({
  state,
  profile: { displayName: null, phone: null, address: null, honorific: '원장님', hours: [...DEFAULT_HOURS], closedDates: [], staff: [], logoPath: null, emr },
  saved: true,
  signupName: HOSPITAL,
  signupPhone: null,
  name: HOSPITAL,
  logoDataUrl: null,
  reload: () => undefined,
})

const drawSections = () =>
  render(
    <StatsSections
      input={INPUT}
      saved
      split={null}
      report={null}
      hospitalName={HOSPITAL}
      groups={GROUPS}
      revision={3}
      bit={BIT}
      revenue={REVENUE}
      sunap={{ closed: [], groups: 'chosen', onReread: () => undefined }}
      wide={{ state: 'reading', days: [], retry: vi.fn() }}
    />,
  )
const card = (id: string) => document.getElementById(id)!
const headOf = (id: string) => document.getElementById(card(id).getAttribute('aria-labelledby')!)!.parentElement!
const textsIn = (element: HTMLElement) => [...element.querySelectorAll('p')].map((p) => p.textContent)
const note = (why: string) => `${NA} · ${why}`
// 칸(h3) 이름으로 그 칸
const sub = (within_: HTMLElement, name: string) => within(within_).getByRole('heading', { level: 3, name }).closest('section')!
function tabPanel(id: string, name: string) {
  fireEvent.click(within(card(id)).getByRole('tab', { name }))
  return within(card(id)).getByRole('tabpanel')
}
const tabNames = (id: string) => within(card(id)).getAllByRole('tab').map((tab) => tab.textContent)

beforeEach(() => {
  vi.mocked(readUisPeriods).mockReset()
  vi.mocked(readUisPeriods).mockImplementation((async (kind: 'rx' | 'age') => (kind === 'rx' ? WORKED.map(rxRow) : WORKED.map(ageRow))) as typeof readUisPeriods)
  vi.mocked(loadGoal).mockReset()
  vi.mocked(loadGoal).mockResolvedValue({ visits: null, newPatients: null, revenue: null })
  for (const fn of Object.values(revenueStore)) fn.mockReset()
  revenueStore.loadDays.mockResolvedValue([])
  revenueStore.codeTotals.mockResolvedValue([])
  revenueStore.monthCodes.mockResolvedValue([])
  vi.mocked(MonthlyReportSection).mockClear()
})

afterEach(() => cleanup())

describe('통계 틀 · 의사랑 의원 (AC-8812.2·AC-8812.3·AC-8812.4·AC-8812.8)', () => {
  beforeEach(() => {
    clinic.view = profileView('uisarang')
  })

  it('AC-8812.2: 환자 요약 90일초진 칸은 – + 의사랑 엑셀로는 셀 수 없어요이고 확인 불가·도우미 안내 줄이 없다', () => {
    drawSections()
    const summary = card('stats-summary')
    const cell = within(summary).getByText('90일초진').closest('div')!
    expect(textsIn(cell)).toEqual(['90일초진', '–', NA])
    expect(summary.textContent).not.toContain('확인 불가')
    expect(summary.textContent).not.toContain(HELPER_90)
  })

  it('AC-8812.2: 환자 카드 신환 재방문율 · 예약·전환 Block 전환 · 진료 운영 시간대별 접수·원장님별 자리에 그 안내가 있다', () => {
    drawSections()
    expect(textsIn(sub(card('stats-patients'), '신환 재방문율'))).toEqual([note(WHY.revisit)])
    const block = sub(card('stats-sunap'), 'Block 전환')
    expect(textsIn(block)).toEqual([note(WHY.block)])
    expect(block.textContent).not.toContain('비트에서 바로')
    expect(textsIn(sub(card('stats-ops'), '시간대별 접수'))).toEqual([note(WHY.hours)])
    expect(textsIn(sub(card('stats-ops'), '원장님별'))).toEqual([note(WHY.doctors)])
    // 요일별·휴일은 그대로, 신환 예약률·90일 예약률도 그대로다
    expect(within(card('stats-ops')).getByRole('heading', { level: 3, name: '요일별 내원' })).toBeTruthy()
    expect(within(card('stats-sunap')).getByRole('heading', { level: 3, name: '신환 예약률' })).toBeTruthy()
    expect(within(card('stats-sunap')).getByRole('heading', { level: 3, name: '90일 예약률' })).toBeTruthy()
  })

  it('AC-8812.2: 진료 운영 윗줄은 요일별 · 시간대별 · 원장님별 세 칸이 한 줄이다(폰 폭 클래스 없음)', () => {
    drawSections()
    const hours = sub(card('stats-ops'), '시간대별 접수')
    const row = hours.parentElement!
    expect([...row.children].map((child) => child.querySelector('h3')?.textContent)).toEqual(['요일별 내원', '시간대별 접수', '원장님별'])
    expect(row.className).toContain('flex')
    expect(row.className).not.toMatch(/max-md:|flex-col/)
  })

  it('AC-8812.3: 환자 카드의 비트 환자 구성 자리에 의사랑 환자 구성 표가 있고, 지금 기간으로 처방·나이대 줄을 읽는다', async () => {
    drawSections()
    await waitFor(() => expect(within(card('stats-patients')).getByRole('table', { name: '나이대별 내원·신환' })).toBeTruthy())
    expect(within(card('stats-patients')).getByText('내원한 날마다 센 수 · 아래쪽 표를 올린 날 6일')).toBeTruthy()
    expect(textsIn(card('stats-patients'))).toContain(note(WHY.mix))
    expect(vi.mocked(readUisPeriods).mock.calls.map(([kind, range]) => [kind, range.from, range.to])).toEqual([
      ['rx', R7.current.from, R7.current.to],
      ['age', R7.current.from, R7.current.to],
    ])
  })

  it('AC-8812.4·AC-8812.2: 처방 카드 옆 글은 의사랑 글이고 탭 넷, 처방별 신환·재진 · 몇 번까지 받나는 안내다', async () => {
    drawSections()
    expect(headOf('stats-rx').textContent).toContain(UIS_RX_DESC)
    expect(headOf('stats-rx').textContent).not.toContain(BIT_RX_DESC)
    expect(tabNames('stats-rx')).toEqual(['묶음별 처방량', '처방 코드별', '처방별 신환·재진', '몇 번까지 받나'])
    expect(textsIn(tabPanel('stats-rx', '처방별 신환·재진'))).toContain(note(WHY.rxSplit))
    expect(textsIn(tabPanel('stats-rx', '몇 번까지 받나'))).toContain(note(WHY.revisit))
    await waitFor(() => expect(within(tabPanel('stats-rx', '묶음별 처방량')).getByRole('table', { name: '묶음별 처방량' })).toBeTruthy())
  })

  it('AC-8812.8: 매출 카드는 탭 넷(신환 1명당 없음)이고 치료별 매출 탭만 안내, 옛 도우미 안내는 없다', () => {
    drawSections()
    expect(tabNames('stats-revenue')).toEqual(['매출 추이', '급여·비급여·기타', '치료별 매출', '건당 진료비'])
    expect(card('stats-revenue').textContent).not.toContain(OLD_HELPER)
    expect(textsIn(tabPanel('stats-revenue', '치료별 매출'))).toEqual([note(WHY.treat)])
    expect(textsIn(tabPanel('stats-revenue', '매출 추이')).join(' ')).not.toContain(NA)
  })

  it('AC-8812.8·AC-8812.2: 보고 카드 옆 글은 의사랑 글이고 비트 보고 자리는 안내다', () => {
    drawSections()
    expect(headOf('stats-report').textContent).toContain(UIS_REPORT_DESC)
    expect(headOf('stats-report').textContent).not.toContain(BIT_REPORT_DESC)
    expect(textsIn(card('stats-report'))).toContain(note(WHY.report))
    expect(card('stats-report').textContent).not.toContain('비트 PC에서 불러오면 보여요')
  })

  it('AC-8817.5: StatsSections가 월간 보고서에 uis 참을 넘긴다', () => {
    drawSections()
    expect(vi.mocked(MonthlyReportSection)).toHaveBeenCalled()
    for (const [props] of vi.mocked(MonthlyReportSection).mock.calls) expect(props.uis).toBe(true)
  })

  it('AC-8812.2: 새로 그린 의사랑 칸에 폰 폭 클래스가 없다(PC 화면만)', async () => {
    drawSections()
    await waitFor(() => expect(screen.getByRole('table', { name: '나이대별 내원·신환' })).toBeTruthy())
    for (const name of ['신환 재방문율', '환자 구성']) expect(sub(card('stats-patients'), name).outerHTML).not.toMatch(/max-md:|max-sm:/)
    for (const name of ['시간대별 접수', '원장님별']) expect(sub(card('stats-ops'), name).outerHTML).not.toMatch(/max-md:|max-sm:/)
  })
})

describe('통계 틀 · 비트 의원은 지금 그대로 (AC-8812.9)', () => {
  it.each<[string, ClinicProfileView]>([
    ['비트 의원', profileView('bit')],
    ['병원 정보 읽는 중', profileView('uisarang', 'loading')],
    ['병원 정보 읽기 실패', profileView('uisarang', 'failed')],
  ])('AC-8812.9: %s이면 의사랑 안내·읽기가 없고 비트 칸·탭·옆 글이 지금과 같다', (_name, view) => {
    clinic.view = view
    drawSections()
    expect(document.body.textContent).not.toContain(NA)
    expect(readUisPeriods).not.toHaveBeenCalled()
    expect(headOf('stats-rx').textContent).toContain(BIT_RX_DESC)
    expect(headOf('stats-report').textContent).toContain(BIT_REPORT_DESC)
    expect(tabNames('stats-rx')).toEqual(['묶음별 추세', '처방별 신환·재진', '처방 골라 보기', '몇 번까지 받나'])
    expect(tabNames('stats-revenue')).toEqual(['매출 추이', '급여·비급여·기타', '치료별 매출', '건당 진료비', '신환 1명당'])
    expect(card('stats-revenue').textContent).toContain(OLD_HELPER)
    expect(within(card('stats-patients')).queryByRole('table', { name: '나이대별 내원·신환' })).toBeNull()
    expect(card('stats-summary').textContent).toContain('확인 불가')
    expect(card('stats-summary').textContent).toContain(HELPER_90)
    for (const [props] of vi.mocked(MonthlyReportSection).mock.calls) expect(props.uis).toBe(false)
  })
})

// ── 통계 화면(StatsScreen): 자료 줄 · 고르기 칸 자리 · 빈 글 (AC-8812.1·AC-8812.9) ──
const SAVED_AT = { at: '2026-11-26T10:05:00Z', source: 'uisarang' as const } // 19:05
type Read = Awaited<ReturnType<typeof readDays>>
const readOf = (rows: DayPayload[], latest: Read['latest']): Read => ({ rows, dropped: 0, latest, fromFile: false })

function screenReads(saved: boolean, source: 'uisarang' | 'bit' = 'uisarang') {
  vi.mocked(readDays).mockReset()
  vi.mocked(readDays).mockImplementation(async (range: DateRange) => (saved && range.from === statsRange(TODAY, '30d').current.from ? readOf(WORKED.map(day), { ...SAVED_AT, source }) : readOf([], null)))
  vi.mocked(readCoverage).mockReset()
  vi.mocked(readCoverage).mockResolvedValue(saved ? [{ from: '2026-11-01', to: '2026-11-26' }] : [])
  vi.mocked(listStatsRxGroups).mockReset()
  vi.mocked(listStatsRxGroups).mockResolvedValue([])
  vi.mocked(loadSunapSettings).mockReset()
  vi.mocked(loadSunapSettings).mockResolvedValue({ blockGroup: null, ptGroup: null, kinds: DEFAULT_RSV_KINDS })
  vi.mocked(listSunapDays).mockReset()
  vi.mocked(listSunapDays).mockResolvedValue([])
  vi.mocked(listCalendarCounts).mockReset()
  vi.mocked(listCalendarCounts).mockResolvedValue([])
  vi.mocked(loadCalendarSettings).mockReset()
  vi.mocked(loadCalendarSettings).mockResolvedValue(DEFAULT_CAL_SETTINGS)
}
const drawScreen = () => render(<StatsScreen hospitalName={HOSPITAL} today={TODAY} />)
const shown = () =>
  waitFor(() => {
    expect(screen.queryByRole('heading', { name: '환자 요약', level: 2 })).toBeTruthy()
    expect(screen.queryByText('불러오는 중')).toBeNull()
  })
const pickerShown = () => screen.queryByRole('button', { name: '불러오기 설정' }) !== null || document.querySelector('input[type="file"]') !== null

describe('통계 화면 · 의사랑 의원 (AC-8812.1)', () => {
  beforeEach(() => {
    clinic.view = profileView('uisarang')
  })

  it('AC-8812.1: 자료 줄 출처 이름은 의사랑 엑셀이고 비트·파일 고르기 칸(불러오기 설정·파일 칸)이 없다', async () => {
    screenReads(true)
    drawScreen()
    await shown()
    await waitFor(() => expect(screen.getByText(/^자료: 의사랑 엑셀 · .+ 저장/)).toBeTruthy())
    expect(pickerShown()).toBe(false)
    expect(screen.queryByRole('button', { name: '비트에서 불러오기' })).toBeNull()
    expect(document.body.textContent).not.toContain('아직 올린 의사랑 엑셀이 없어요')
  })

  it('AC-8812.1: 저장된 숫자가 없으면 화면 글자 빈 글 둘이고 비트 빈 글은 없다', async () => {
    screenReads(false)
    drawScreen()
    await shown()
    expect(screen.getByText('아직 올린 의사랑 엑셀이 없어요')).toBeTruthy()
    expect(screen.getByText('위 칸에 의사랑 통계 엑셀을 넣으면 숫자가 채워져요.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('아직 저장된 통계가 없어요')
    expect(pickerShown()).toBe(false)
  })
})

describe('통계 화면 · 비트 의원은 지금 그대로 (AC-8812.9)', () => {
  it('AC-8812.9: 비트 의원은 고르기 칸이 있고 빈 글은 지금 글이다', async () => {
    clinic.view = profileView('bit')
    screenReads(false)
    drawScreen()
    await shown()
    expect(pickerShown()).toBe(true)
    expect(screen.getByText('아직 저장된 통계가 없어요')).toBeTruthy()
    expect(document.body.textContent).not.toContain('아직 올린 의사랑 엑셀이 없어요')
    expect(readUisPeriods).not.toHaveBeenCalled()
  })
})
