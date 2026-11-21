// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClinicProfile, type ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { AppShell } from '@/components/shell/AppShell'
import { currentMenuLabel } from '@/components/shell/menu'
import { LEAVES as LEAVE_BOOK, MEMBERS as LEAVE_MEMBERS, clinicProfile, leave } from '@/components/staff/leave/testData'
import { LINES, OVERTIME, PAY_MONTHS, REVENUE, RULES, SETTINGS } from '@/components/staff/pay/payTestKit'
import { CHANGES as SCHEDULE_CHANGES, MEMBERS as SCHEDULE_MEMBERS, PLANS as SCHEDULE_PLANS } from '@/components/staff/schedule/scheduleTestKit'
import type { Hospital, Me } from '@/lib/auth/hospital.server'
import type { TaxSheet } from '@/lib/staff/taxExcel'
import { createStaffStore, type StaffStore } from '@/lib/storage/staff'
import { createStaffFileStore, type StaffFileStore } from '@/lib/storage/staffFiles'
import type { DateRange } from '@/types/dates'
import type { DayChange, Leave, StaffMember, WeekPlan } from '@/types/staff'
import StaffLayout from './layout'
import StaffLeavePage from './leave/page'
import StaffPage from './page'
import StaffPayPage from './pay/page'
import StaffSchedulePage from './schedule/page'

// 직원 탭 합치기 통합 시험 (staff TASK-14 · REQ-7611 AC-7611.2·AC-7611.3·AC-7611.4).
// 진짜 네 페이지(page.tsx) → 진짜 staff/layout → 진짜 앱 틀(AppShell·DeskGate)을 함께 그린다. 화면들은 진짜 공용 읽기 훅(useStaffBase)으로 읽고,
// 그 아래 저장 층(createStaffStore·createStaffFileStore)·병원 정보(useClinicProfile)·매출 읽기(createRevenueStore)만 메모리 안 가짜 하나로 바꾼다 —
// 네 화면이 같은 보기 자료(requirements.md 머리말, 지어낸 사람)를 읽어 같은 숫자를 보이는지 본다:
// 이도윤 남은 연차 9일(11-28 연차 넣은 뒤 16/7/9, AC-7604.8) · 11월 더 일한 시간(연장 390·야간 60·휴일 240분, AC-7605.5) ·
// 11월 지급 합계 18,615,000원(AC-7606.2) · 예약 시행자와 이어진 사람 휴가 → '예약 휴무' 표시 · 재직자 여섯 명의 차례.
// 오늘은 2026-11-21(토)로 고정한다(페이지가 부르는 todayInKorea). 실제 Supabase에는 붙지 않는다

const h = vi.hoisted(() => ({
  currentMe: vi.fn(),
  pathname: vi.fn(() => '/staff'),
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  store: null as StaffStore | null,
  files: null as StaffFileStore | null,
  clinic: null as ClinicProfileView | null,
  loadDays: vi.fn(),
  sheets: [] as TaxSheet[],
}))
vi.mock('../currentMe.server', () => ({ currentMe: h.currentMe }))
vi.mock('next/navigation', () => ({ usePathname: h.pathname, useRouter: () => h.router }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/lib/analytics/dates', async (load) => ({ ...(await load<typeof import('@/lib/analytics/dates')>()), todayInKorea: () => '2026-11-21' }))
vi.mock('@/lib/storage/staff', async (load) => ({ ...(await load<typeof import('@/lib/storage/staff')>()), createStaffStore: vi.fn(() => h.store) }))
vi.mock('@/lib/storage/staffFiles', async (load) => ({
  ...(await load<typeof import('@/lib/storage/staffFiles')>()),
  createStaffFileStore: vi.fn(() => h.files),
}))
vi.mock('@/components/clinic/useClinicProfile', async (load) => ({
  ...(await load<typeof import('@/components/clinic/useClinicProfile')>()),
  useClinicProfile: vi.fn(() => h.clinic),
}))
vi.mock('@/lib/storage/revenue', async (load) => ({
  ...(await load<typeof import('@/lib/storage/revenue')>()),
  createRevenueStore: () => ({ loadDays: h.loadDays }),
}))
// 세무사 엑셀 내려받기는 만든 줄만 받아 둔다
vi.mock('@/lib/staff/taxExcel', async (load) => ({
  ...(await load<typeof import('@/lib/staff/taxExcel')>()),
  downloadTaxExcel: (sheet: TaxSheet) => h.sheets.push(sheet),
}))

// ── 보기 자료 하나(세 화면 시험 도구의 지어낸 자료를 같은 직원 id로 맞춰 모은다) ───────────────────

const HOSPITAL_NAME = '가나 정형외과의원'
/** 휴가 시험 자료의 id('m-kim') → 급여 시험 자료의 id('kim') */
const idOf = (leaveId: string) => leaveId.replace(/^m-/, '')
/** 직원 여덟(퇴사 오세린·문태호 포함), 입사일 차례 — 연차 셈 자료(휴가 시험)와 같다. 이도윤 (이)·박서연 (박)은 예약 시행자와 이어져 있다 */
const MEMBERS: StaffMember[] = LEAVE_MEMBERS.map((m) => ({ ...m, id: idOf(m.id) }))
const hiredOn = (id: string) => MEMBERS.find((m) => m.id === id)!.hiredOn
/** 근무표 시험 자료의 id('m1') → 이름 → 이 자료의 id */
const idFromSchedule = (scheduleId: string) => {
  const name = SCHEDULE_MEMBERS.find((m) => m.id === scheduleId)!.name
  return MEMBERS.find((m) => m.name === name)!.id
}
/** 기본 근무(근무표 시험 자료): 월~금 09–18, 토 09–13(김하늘·최민준 1·3주, 이도윤·박서연 2·4주), 정유나 월·수·금, 한지우 토 쉼 — AC-7605.7 보기 */
const PLANS: WeekPlan[] = SCHEDULE_PLANS.map((p) => {
  const staffId = idFromSchedule(p.staffId)
  return { ...p, id: `p-${staffId}`, staffId, from: hiredOn(staffId) }
})
/** 바뀐 날: 최민준 11-15(일, 휴진일) 09–13 근무 등 */
const CHANGES: DayChange[] = SCHEDULE_CHANGES.map((c) => ({ ...c, staffId: idFromSchedule(c.staffId) }))
/** 휴가: AC-7604.8 보기 목록(휴가 시험 자료) + 이도윤 11-28(토) 연차 */
const LEAVES: Leave[] = [...LEAVE_BOOK.map((l) => ({ ...l, staffId: idOf(l.staffId) })), { ...leave('m-lee', '2026-11-28'), staffId: 'lee' }]

const inRange = <T extends { day: string }>(rows: readonly T[], range: DateRange) => rows.filter((r) => r.day >= range.from && r.day <= range.to)
const clone = <T,>(value: T): T => structuredClone(value)

/** 부른 저장 층·파일 함수 이름(데스크면 비어야 한다) */
let calls: string[] = []

function fakeStore(): StaffStore {
  const read = <T,>(name: string, value: () => T): Promise<T> => {
    calls.push(name)
    return Promise.resolve(clone(value()))
  }
  // 이 시험은 읽기만 본다 — 저장을 부르면 실패로 드러난다
  const unused = (name: string) => () => {
    calls.push(name)
    return Promise.reject(new Error(`${name}: 통합 시험은 저장하지 않는다`))
  }
  return {
    listMembers: () => read('listMembers', () => MEMBERS),
    saveMember: unused('saveMember'),
    purgeMember: unused('purgeMember'),
    importRoster: unused('importRoster'),
    listPlans: () => read('listPlans', () => PLANS),
    savePlan: unused('savePlan'),
    listChanges: (range) => read('listChanges', () => inRange(CHANGES, range)),
    saveChange: unused('saveChange'),
    resetDay: unused('resetDay'),
    listOvertime: (range) => read('listOvertime', () => inRange(OVERTIME, range)),
    saveOvertime: unused('saveOvertime'),
    listLeaves: (range) => read('listLeaves', () => inRange(LEAVES, range)),
    addLeaveGroup: unused('addLeaveGroup'),
    replaceLeaveGroup: unused('replaceLeaveGroup'),
    deleteLeaveGroup: unused('deleteLeaveGroup'),
    countAppts: () => read('countAppts', () => []),
    loadSettings: () => read('loadSettings', () => SETTINGS),
    saveSettings: unused('saveSettings'),
    listRules: () => read('listRules', () => RULES),
    saveRules: unused('saveRules'),
    listPayLines: (fromMonth, toMonth) => read('listPayLines', () => LINES.filter((l) => l.month >= fromMonth && l.month <= toMonth)),
    savePayLine: unused('savePayLine'),
    listPayMonths: (fromMonth, toMonth) => read('listPayMonths', () => PAY_MONTHS.filter((m) => m.month >= fromMonth && m.month <= toMonth)),
    savePayMonth: unused('savePayMonth'),
  }
}

function fakeFiles(): StaffFileStore {
  return {
    listFiles: (kind) => {
      calls.push('listFiles')
      return Promise.resolve(kind === 'tax' ? [] : [])
    },
    uploadFile: () => Promise.reject(new Error('uploadFile')),
    deleteFile: () => Promise.reject(new Error('deleteFile')),
    downloadFile: () => Promise.reject(new Error('downloadFile')),
  }
}

const CLINIC: ClinicProfileView = {
  state: 'ready',
  profile: clinicProfile(),
  saved: true,
  signupName: HOSPITAL_NAME,
  signupPhone: null,
  name: HOSPITAL_NAME,
  logoDataUrl: null,
  reload: () => {},
}

// ── 사람(문지기가 읽은 나) ───────────────────

const HOSPITAL: Hospital = {
  id: 'h1',
  name: HOSPITAL_NAME,
  applicantName: '홍길동',
  phone: null,
  email: 'manager@example.com',
  status: 'approved',
  createdAt: '2026-10-28T01:23:45+00:00',
}
const OWNER: Me = { email: 'manager@example.com', hospital: HOSPITAL, isAdmin: false }
const DESK: Me = { email: 'desk@example.com', hospital: null, isAdmin: false, desk: { hospitalId: 'h1', hospitalName: HOSPITAL_NAME } }

// ── 그리기 도구 ───────────────────

const PATHS = ['/staff', '/staff/schedule', '/staff/leave', '/staff/pay'] as const
type StaffPath = (typeof PATHS)[number]
const NAV_LABEL: Record<StaffPath, string> = { '/staff': '명단', '/staff/schedule': '근무표', '/staff/leave': '휴가', '/staff/pay': '급여' }

/** 그 주소의 진짜 페이지(급여는 주소의 ?part=를 받는 async 페이지) */
async function pageOf(path: StaffPath): Promise<ReactNode> {
  if (path === '/staff') return <StaffPage />
  if (path === '/staff/schedule') return <StaffSchedulePage />
  if (path === '/staff/leave') return <StaffLeavePage />
  return StaffPayPage({ searchParams: Promise.resolve({}) })
}

/** 앱 틀(AppShell) 안에 staff/layout과 그 주소의 페이지를 그린다 — Next가 그리는 차례 그대로 */
async function openPage(path: StaffPath, me: Me = OWNER) {
  h.pathname.mockReturnValue(path)
  h.currentMe.mockResolvedValue(me)
  window.history.replaceState(null, '', path)
  const tree = await StaffLayout({ children: await pageOf(path) })
  return render(
    <AppShell hospitalName={HOSPITAL_NAME} email={me.email} isAdmin={false} desk={me.desk !== undefined}>
      {tree}
    </AppShell>,
  )
}

const staffNav = () => screen.getByRole('navigation', { name: '직원 안 메뉴' })
const currentNav = () =>
  within(staffNav())
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent)
/** 제목 '직원'·작은 메뉴·페이지를 감싼 staff/layout 바깥 칸 */
const layoutRoot = () => screen.getByRole('heading', { level: 1, name: '직원' }).parentElement!.parentElement!
const cellTexts = (tr: Element) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent?.trim() ?? '')
const bodyRows = (table: HTMLElement) => [...table.querySelectorAll('tbody tr')]
const headIndex = (table: HTMLElement, head: string) => [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim()).indexOf(head)
/** 표의 한 칸: 첫 칸에 이름이 든 줄의 그 머리 칸 */
const cellOf = (table: HTMLElement, name: string, head: string) => cellTexts(bodyRows(table).find((tr) => cellTexts(tr)[0]?.startsWith(name))!)[headIndex(table, head)]
/** '6시간 30분' → 6.5, '–' → 0 */
const hoursOf = (text: string) => {
  const hours = /(\d+)시간/.exec(text)
  const minutes = /(\d+)분/.exec(text)
  return (hours ? Number(hours[1]) : 0) + (minutes ? Number(minutes[1]) / 60 : 0)
}

/** 재직자 여섯 — 명단 차례(입사일 빠른 사람부터) */
const ACTIVE = ['최민준', '김하늘', '이도윤', '정유나', '박서연', '한지우']
/** 오늘(11-21) 남은 연차(AC-7604.8 + 이도윤 11-28 연차) */
const REMAINING = ['3일', '7.5일', '9일', '7일', '12일', '5일']

async function rosterTable() {
  const table = await screen.findByRole('table', { name: '재직 직원' })
  // 남은 연차는 휴가를 읽은 뒤에 채워진다
  await waitFor(() => expect(cellOf(table, '이도윤', '남은 연차')).toBe('9일'))
  return table
}
const leaveTable = () => screen.findByRole('table', { name: '연차 현황' })
async function scheduleMonth() {
  await screen.findByRole('table', { name: '주 근무표' })
  fireEvent.click(within(screen.getByRole('group', { name: '보기' })).getByRole('button', { name: '달' }))
  return screen.findByRole('table', { name: '11월 더 일한 시간' })
}
const payTable = () => screen.findByRole('table', { name: '이달 급여 표' })
const payPart = (label: string) => fireEvent.click(within(screen.getByRole('group', { name: '급여 안 메뉴' })).getByRole('button', { name: label }))

beforeEach(() => {
  calls = []
  h.sheets = []
  h.store = fakeStore()
  h.files = fakeFiles()
  h.clinic = CLINIC
  h.router.replace.mockReset()
  h.loadDays.mockReset()
  h.loadDays.mockImplementation(async (range: DateRange) => REVENUE.filter((d) => d.date >= range.from && d.date <= range.to))
  vi.mocked(createStaffStore).mockClear()
  vi.mocked(createStaffFileStore).mockClear()
  vi.mocked(useClinicProfile).mockClear()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true })
})

afterEach(() => {
  cleanup()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

// ── AC-7611.2 ───────────────────

describe('AC-7611.2: 원장 — 네 주소에서 탭 "직원"·제목·작은 메뉴, 작은 메뉴로 옮겨 다닌다', () => {
  it('AC-7611.2: /staff에서 작은 메뉴 링크를 따라 근무표 → 휴가 → 급여 → 명단으로 옮기면 주소마다 탭 "직원"이 켜지고 지금 칸과 그 화면이 바뀐다', async () => {
    let path: StaffPath = '/staff'
    for (const next of ['/staff/schedule', '/staff/leave', '/staff/pay', '/staff'] as const) {
      await openPage(path)
      expect(currentMenuLabel(path)).toBe('직원')
      expect(screen.getByRole('button', { name: /^더보기/ }).textContent).toContain('직원')
      expect(screen.getAllByRole('heading', { level: 1 }).map((x) => x.textContent)).toEqual(['직원'])
      expect(within(staffNav()).getAllByRole('link').map((a) => a.textContent)).toEqual(['명단', '근무표', '휴가', '급여'])
      expect(currentNav()).toEqual([NAV_LABEL[path]])
      // 그 주소의 화면이 같은 보기 자료를 읽어 그린다
      if (path === '/staff') await rosterTable()
      if (path === '/staff/schedule') expect(await screen.findByRole('table', { name: '주 근무표' })).toBeTruthy()
      if (path === '/staff/leave') expect(await leaveTable()).toBeTruthy()
      if (path === '/staff/pay') expect(await payTable()).toBeTruthy()
      // 다음 칸 = 작은 메뉴 링크의 주소
      const link = within(staffNav()).getByRole('link', { name: NAV_LABEL[next] })
      expect(link.getAttribute('href')).toBe(next)
      cleanup()
      path = next
    }
  })

  it('AC-7611.2: 네 화면 모두 재직자 여섯 명을 같은 차례(입사일 빠른 사람부터)로 보이고 퇴사자(오세린·문태호)는 없다 — 명단은 "재직 6"·"퇴사 2"', async () => {
    await openPage('/staff')
    const roster = await rosterTable()
    expect(bodyRows(roster).map((tr) => cellTexts(tr)[0])).toEqual(ACTIVE)
    expect(screen.getByRole('button', { name: '재직 6' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '퇴사 2' })).toBeTruthy()
    cleanup()

    await openPage('/staff/schedule')
    const week = await screen.findByRole('table', { name: '주 근무표' })
    const weekNames = bodyRows(week).map((tr) => tr.querySelector('th')?.textContent ?? '')
    expect(ACTIVE.map((name) => weekNames.findIndex((text) => text.startsWith(name)))).toEqual([0, 1, 2, 3, 4, 5])
    expect(weekNames).toHaveLength(6)
    cleanup()

    await openPage('/staff/leave')
    const status = await leaveTable()
    expect(bodyRows(status).map((tr) => within(tr as HTMLElement).getAllByRole('button')[0]!.textContent)).toEqual(ACTIVE)
    cleanup()

    await openPage('/staff/pay')
    const pay = await payTable()
    expect(bodyRows(pay).map((tr) => tr.querySelector('b')?.textContent)).toEqual(ACTIVE)
    expect(cellTexts(pay.querySelector('tfoot tr')!)[0]).toBe('합계 (6명)')
  })

  it('AC-7611.2: 남은 연차 — 명단의 "남은 연차"와 휴가 연차 현황의 "남은"이 사람마다 같고, 이도윤은 생긴 16 · 쓴 7 · 남은 9일이다. 급여 명세서·세무사 엑셀의 이도윤 남은 연차도 9다', async () => {
    await openPage('/staff')
    const roster = await rosterTable()
    const fromRoster = ACTIVE.map((name) => cellOf(roster, name, '남은 연차'))
    expect(fromRoster).toEqual(REMAINING)
    cleanup()

    await openPage('/staff/leave')
    const status = await leaveTable()
    expect(ACTIVE.map((name) => cellOf(status, name, '남은'))).toEqual(fromRoster)
    expect([cellOf(status, '이도윤', '생긴'), cellOf(status, '이도윤', '쓴'), cellOf(status, '이도윤', '남은')]).toEqual(['16일', '7일', '9일'])
    cleanup()

    await openPage('/staff/pay')
    await payTable()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '엑셀 받기' }))
    })
    expect(h.sheets).toHaveLength(1)
    const sheet = h.sheets[0]!
    const head = sheet.rows[1] as string[]
    expect(sheet.rows.find((row) => row[0] === '이도윤')![head.indexOf('남은 연차 (일)')]).toBe(9)
    payPart('명세서')
    await waitFor(() => expect(within(screen.getByRole('group', { name: '사람 고르기' })).getAllByRole('button')).toHaveLength(6))
    fireEvent.click(within(screen.getByRole('group', { name: '사람 고르기' })).getByRole('button', { name: /^이도윤/ }))
    const slip = [...screen.getByRole('img', { name: '이도윤 2026년 11월 급여 명세' }).querySelectorAll('text')].map((t) => t.textContent)
    expect(slip[slip.indexOf('남은 연차') + 1]).toBe('9일')
    expect(slip).toContain('연차 1일 (11월 28일)')
  })

  it('AC-7611.2: 이번 달 끝나는 연차 — 휴가 화면 최민준 "11-24에 끝나요 — 남은 3일은 수당으로 정산"이 세무사 엑셀 최민준 메모 "연차 기간 끝 11-24 · 3일 정산"과 같다', async () => {
    await openPage('/staff/leave')
    const status = await leaveTable()
    expect(cellOf(status, '최민준', '이번 연차 기간')).toContain('11-24에 끝나요 — 남은 3일은 수당으로 정산')
    expect(screen.getByText('이번 달 연차 기간이 끝나는 직원 1명 — 11월 세무사 자료에 일수가 들어가요.')).toBeTruthy()
    cleanup()

    await openPage('/staff/pay')
    await payTable()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '엑셀 받기' }))
    })
    const sheet = h.sheets[0]!
    const head = sheet.rows[1] as string[]
    expect(String(sheet.rows.find((row) => row[0] === '최민준')![head.indexOf('메모')])).toContain('연차 기간 끝 11-24 · 3일 정산')
  })

  it('AC-7611.2: 11월 더 일한 시간 — 근무표 달 보기 "모두"(연장 6시간 30분 · 야간 1시간 · 휴일 4시간 · 합계 11시간 30분)와 사람별 시간이 급여 표의 회색 시간(연장·야간·휴일)·세무사 엑셀 합계 줄과 같다', async () => {
    await openPage('/staff/schedule')
    const sum = await scheduleMonth()
    const all = cellTexts(sum.querySelector('tfoot tr')!)
    expect(all).toEqual(['모두', '6시간 30분', '1시간', '4시간', '11시간 30분'])
    const perPerson = Object.fromEntries(
      ACTIVE.map((name) => [name, ['연장', '야간', '휴일'].map((kind) => hoursOf(cellOf(sum, name, kind)))]),
    )
    expect(perPerson['이도윤']).toEqual([4, 0, 0])
    expect(perPerson['최민준']).toEqual([0, 0, 4])
    cleanup()

    await openPage('/staff/pay')
    const pay = await payTable()
    // 머리 둘째 줄: 지급 항목 여섯 뒤 연장·야간·휴일(첫 칸은 이름이라 한 칸 밀린다)
    const items = cellTexts(pay.querySelectorAll('thead tr')[1]!)
    const at = (kind: string) => items.indexOf(kind) + 1
    const asHours = (text: string) => (text === '–' ? 0 : Number(text))
    const foot = cellTexts(pay.querySelector('tfoot tr')!)
    expect(['연장', '야간', '휴일'].map((kind) => asHours(foot[at(kind)]!))).toEqual(all.slice(1, 4).map(hoursOf))
    for (const name of ACTIVE) {
      const row = cellTexts(bodyRows(pay).find((tr) => tr.querySelector('b')?.textContent === name)!)
      expect(['연장', '야간', '휴일'].map((kind) => asHours(row[at(kind)]!)), name).toEqual(perPerson[name])
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '엑셀 받기' }))
    })
    const sheet = h.sheets[0]!
    const head = sheet.rows[1] as string[]
    const total = sheet.rows[sheet.rows.length - 1]!
    expect(['연장 (시간)', '야간 (시간)', '휴일 (시간)'].map((col) => total[head.indexOf(col)])).toEqual(all.slice(1, 4).map(hoursOf))
    // 최민준 휴일 4시간은 근무표의 휴진일(11-15 일) 근무다
    expect(String(sheet.rows.find((row) => row[0] === '최민준')![head.indexOf('메모')])).toContain('11-15(일) 휴진일 근무')
  })

  it('AC-7611.2: 11월 지급 합계 18,615,000원 — 이달 급여 표 합계 줄 = 인건비 "지급 합계" 칸 = 세무사 엑셀 합계 줄', async () => {
    await openPage('/staff/pay')
    const pay = await payTable()
    expect(cellTexts(pay.querySelector('tfoot tr')!).at(-1)).toBe('18,615,000')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '엑셀 받기' }))
    })
    const sheet = h.sheets[0]!
    const head = sheet.rows[1] as string[]
    expect(sheet.rows[sheet.rows.length - 1]![head.indexOf('지급 합계')]).toBe(18_615_000)
    payPart('인건비')
    await screen.findByRole('table', { name: '사람별 지급 합계 표' })
    expect(within(screen.getByRole('group', { name: '지급 합계' })).getByText('18,615,000원')).toBeTruthy()
    await waitFor(() => expect(within(screen.getByRole('group', { name: '매출 대비 인건비' })).getByText('17.5%')).toBeTruthy())
  })

  it('AC-7611.2: 일한 사람 수 — 근무표 주·달 보기 칸이 AC-7605.7 보기(7일 1 · 13일 6 · 14일 2 · 15일 휴진 1 · 16일 6 · 17일 5 · 18일 5 · 21일 2 · 28일 1명)와 같다', async () => {
    await openPage('/staff/schedule')
    const week = await screen.findByRole('table', { name: '주 근무표' })
    // 이번 주 11-16(월) ~ 11-22(일)
    expect(cellTexts(week.querySelector('tfoot tr')!)).toEqual(['일한 사람', '6명', '5명', '5명', '5명', '6명', '2명', '0명'])
    await scheduleMonth()
    const day = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}( |$)`) }).textContent
    expect(day('11월 7일 (토)')).toMatch(/^71명/)
    expect(day('11월 13일 (금)')).toMatch(/^136명/)
    expect(day('11월 14일 (토)')).toMatch(/^142명/)
    expect(day('11월 15일 (일)')).toMatch(/^15휴진 1명/)
    expect(day('11월 28일 (토)')).toMatch(/^281명/)
  })

  it('AC-7611.2: 휴가 → 예약 휴무 — 예약 시행자와 이어진 사람은 명단 "(이) 이도윤"·"(박) 박서연", 휴가 현황 "예약 (이)"·"예약 (박)"이고, 그 사람 휴가 칩에만 "예약 휴무"(반차는 "· 오후")가 붙는다. 근무표 이달 휴가 목록과 휴가 달력 칩은 같은 휴가다', async () => {
    await openPage('/staff')
    const roster = await rosterTable()
    expect(ACTIVE.map((name) => cellOf(roster, name, '예약 시행자'))).toEqual(['없음', '없음', '(이) 이도윤', '없음', '(박) 박서연', '없음'])
    cleanup()

    await openPage('/staff/leave')
    const status = await leaveTable()
    const tags = ACTIVE.map((name) => /예약 \((.)\)/.exec(cellOf(status, name, '이름 · 직종') ?? '')?.[0] ?? null)
    expect(tags).toEqual([null, null, '예약 (이)', null, '예약 (박)', null])
    const calendarDay = (day: string) => document.querySelector(`td[data-day="${day}"]`)!.textContent ?? ''
    expect(calendarDay('2026-11-28')).toContain('이도윤 연차')
    expect(calendarDay('2026-11-28')).toContain('예약 휴무')
    expect(calendarDay('2026-11-13')).toContain('박서연 오후 반차')
    expect(calendarDay('2026-11-13')).toContain('예약 휴무 · 오후')
    expect(calendarDay('2026-11-07')).toContain('김하늘 연차')
    expect(calendarDay('2026-11-07')).not.toContain('예약 휴무')
    // 11월 칸의 휴가 칩(날 · 이름 종류)
    const novemberChips = [...document.querySelectorAll('td[data-day^="2026-11"]:not([data-out])')].flatMap((td) => {
      const date = Number(td.getAttribute('data-day')!.slice(8))
      // 칸 단추(td 바로 아래)는 빼고 칩만
      return [...td.querySelectorAll(':scope > div button')].map((chip) => `${date} ${chip.textContent}`)
    })
    expect(novemberChips).toContain('28 이도윤 연차')
    cleanup()

    await openPage('/staff/schedule')
    await scheduleMonth()
    // 근무표 이달 휴가 '{d}일 ({요일}) {종류} {이름}' → '{d} {이름} {종류}'
    const scheduleLeaves = within(screen.getByRole('list', { name: '이달 휴가' }))
      .getAllByRole('listitem')
      .map((li) => /^(\d+)일 \(.\) (.+) (\S+)$/.exec(li.textContent ?? '')!)
      .map(([, date, kind, name]) => `${date} ${name} ${kind}`)
    expect([...scheduleLeaves].sort()).toEqual([...novemberChips].sort())
  })
})

// ── AC-7611.3 ───────────────────

describe('AC-7611.3: 데스크 — 네 주소 모두 막힌 화면만, 직원 자료는 읽지 않는다', () => {
  it.each(PATHS)('AC-7611.3: 데스크가 %s를 열면 DeskGate 막힌 화면이 보이고, 제목·작은 메뉴·화면이 없으며 저장 층·병원 정보·매출을 하나도 부르지 않는다', async (path) => {
    await openPage(path, DESK)
    expect(screen.getByRole('heading', { level: 1, name: '데스크 계정은 볼 수 없는 화면이에요' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1, name: '직원' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: '직원 안 메뉴' })).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    // 한 박자 기다려도 읽기가 없다
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(calls).toEqual([])
    expect(vi.mocked(createStaffStore)).not.toHaveBeenCalled()
    expect(vi.mocked(createStaffFileStore)).not.toHaveBeenCalled()
    expect(vi.mocked(useClinicProfile)).not.toHaveBeenCalled()
    expect(h.loadDays).not.toHaveBeenCalled()
    // 데스크 탭 띠에는 직원 탭이 없다
    expect(within(screen.getByRole('navigation', { name: '메뉴' })).queryByRole('link', { name: /직원/ })).toBeNull()
  })

  it('AC-7611.3: 같은 주소를 원장이 열면 그때는 저장 층을 읽는다(위 시험이 헛돌지 않는다)', async () => {
    await openPage('/staff')
    await rosterTable()
    expect(calls).toEqual(expect.arrayContaining(['listMembers', 'loadSettings', 'listPlans', 'listLeaves']))
    expect(vi.mocked(createStaffStore)).toHaveBeenCalled()
  })
})

// ── AC-7611.4 ───────────────────

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
/** 폰 너비(360px)에서 페이지를 늘릴 만큼 넓은 너비 칸: 최소·고정 너비 320px(Tailwind 80) 이상 */
const isWideClass = (cls: string) => {
  const scale = /^(?:min-)?w-(\d+(?:\.\d+)?)$/.exec(cls)
  if (scale) return Number(scale[1]) * 4 >= 320
  const px = /^(?:min-)?w-\[(\d+)px\]$/.exec(cls)
  return px ? Number(px[1]) >= 320 : false
}
const describeEl = (el: Element) => `<${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? ''} class="${el.getAttribute('class') ?? ''}">`

/** 바깥 칸은 min-w-0이고, 표와 넓은 칸은 모두 TableScroll(옆으로 밀리는 이름 있는 칸, min-w-0·max-w-full·overflow-x-auto) 안이다. 넓은 칸 수를 돌려준다 */
function expectOnlyBoxesScroll(): number {
  const root = layoutRoot()
  expect(classesOf(root)).toContain('min-w-0')
  const wide = [...root.querySelectorAll('*')].filter((el) => el.tagName === 'TABLE' || classesOf(el).some(isWideClass))
  for (const el of wide) {
    const box = el.parentElement?.closest('[role="region"]') ?? null
    expect(box, describeEl(el)).not.toBeNull()
    expect(root.contains(box), describeEl(el)).toBe(true)
    expect(classesOf(box!), describeEl(el)).toEqual(expect.arrayContaining(['min-w-0', 'max-w-full', 'overflow-x-auto']))
    expect(box!.getAttribute('aria-label'), describeEl(el)).toBeTruthy()
  }
  // 바깥 칸과 그 위(앱 틀 본문)는 스스로 옆으로 밀리지 않는다
  for (let el: Element | null = root; el !== null && el.tagName !== 'BODY'; el = el.parentElement) {
    expect(classesOf(el), describeEl(el)).not.toContain('overflow-x-auto')
    expect(classesOf(el).some(isWideClass), describeEl(el)).toBe(false)
  }
  return wide.length
}

describe('AC-7611.4: 폰 너비 — PC 화면 그대로, 넓은 표·달력은 그 칸만 옆으로 밀린다(페이지는 안 밀림)', () => {
  it('AC-7611.4: 명단 — 재직 직원 표는 밀리는 칸 안이다', async () => {
    await openPage('/staff')
    await rosterTable()
    expect(expectOnlyBoxesScroll()).toBeGreaterThan(0)
  })

  it('AC-7611.4: 근무표 — 주 근무표(min-w-240)와 달 보기의 더 일한 시간 표는 밀리는 칸 안이다', async () => {
    await openPage('/staff/schedule')
    await screen.findByRole('table', { name: '주 근무표' })
    expect(expectOnlyBoxesScroll()).toBeGreaterThan(0)
    await scheduleMonth()
    expect(expectOnlyBoxesScroll()).toBeGreaterThan(0)
  })

  it('AC-7611.4: 휴가 — 연차 현황 표(min-w-225)와 휴가 달력(min-w-190)은 밀리는 칸 안이다', async () => {
    await openPage('/staff/leave')
    await leaveTable()
    expect(screen.getByRole('region', { name: '연차 현황 표' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '휴가 달력 칸' })).toBeTruthy()
    expect(expectOnlyBoxesScroll()).toBeGreaterThanOrEqual(2)
  })

  it('AC-7611.4: 급여 — 이달 급여·인센티브 실적·인건비 표와 그림은 밀리는 칸 안이다', async () => {
    await openPage('/staff/pay')
    await payTable()
    expect(expectOnlyBoxesScroll()).toBeGreaterThan(0)
    payPart('인센티브')
    await screen.findByRole('table', { name: '인센티브 실적 표' })
    expect(expectOnlyBoxesScroll()).toBeGreaterThan(0)
    payPart('인건비')
    await screen.findByRole('table', { name: '사람별 지급 합계 표' })
    expect(screen.getByRole('region', { name: '인건비 막대 그림 (옆으로 밀어 보기)' })).toBeTruthy()
    expect(expectOnlyBoxesScroll()).toBeGreaterThan(0)
  })
})
