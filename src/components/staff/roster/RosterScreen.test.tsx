// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StaffPage from '@/app/(app)/staff/page'
import type { ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { useStaffBase, type StaffBase } from '@/components/staff/useStaffBase'
import { defaultProfile } from '@/lib/storage/clinicProfile'
import { defaultStaffSettings, StaffStoreError, type StaffStore } from '@/lib/storage/staff'
import type { StaffFileStore } from '@/lib/storage/staffFiles'
import { readRoster, ROSTER_HEADERS, RosterExcelError, type RosterContext, type RosterRead, type RosterRow } from '@/lib/staff/rosterExcel'
import type { ClinicStaff } from '@/types/clinicProfile'
import type { Leave, StaffFile, StaffMember, WeekPlan } from '@/types/staff'

// 직원 탭 명단 화면 (staff TASK-10 · REQ-7612, 시안 docs/mockups/staff/list.html ①~⑥ — 폰 장면 ⑦은 만들지 않는다).
// 진짜 /staff 페이지를 그린다(페이지 → 명단 화면). 오늘은 2026-11-21(토)로 고정(Date만 가짜 — 기다림 타이머는 진짜).
// 공용 읽기 훅(useStaffBase)·저장 층·엑셀 읽기(readRoster)는 가짜고, 셈(연차·근속·알림·보관·기본 근무 요약)은 진짜 lib/staff를 쓴다.
// 사람·숫자는 지어낸 보기 자료(requirements.md 머리 '보기 자료', AC-7604.8)다

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))
vi.mock('@/lib/staff/rosterExcel', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/staff/rosterExcel')>()
  return { ...real, readRoster: vi.fn() }
})

const TODAY = '2026-11-21'

function person(over: Partial<StaffMember> & Pick<StaffMember, 'id' | 'name' | 'job' | 'hiredOn'>): StaffMember {
  return {
    jobOther: null,
    employment: 'regular',
    weeklyHours: 40,
    leftOn: null,
    phone: null,
    birthday: null,
    address: null,
    bank: null,
    accountNo: null,
    calendarStaffId: null,
    memo: null,
    usedBefore: 0,
    usedBeforeFrom: null,
    ...over,
  }
}

// 저장 층이 주는 차례(입사일·이름). 남은 연차는 '올해 이미 쓴 연차'(그 기간 시작일)와 이도윤 휴가 줄로 맞춘다(AC-7604.8)
const MOON = person({ id: 'm-moon', name: '문태호', job: '물리치료사', hiredOn: '2018-04-02', leftOn: '2022-12-31' })
const CHOI = person({ id: 'm-choi', name: '최민준', job: '방사선사', hiredOn: '2019-11-25', phone: '01000002075', usedBefore: 14, usedBeforeFrom: '2025-11-25' })
const OH = person({ id: 'm-oh', name: '오세린', job: '간호조무사', hiredOn: '2020-03-02', leftOn: '2024-05-31' })
const KIM = person({ id: 'm-kim', name: '김하늘', job: '간호조무사', hiredOn: '2021-03-02', phone: '01000003812', usedBefore: 9.5, usedBeforeFrom: '2026-03-02' })
const LEE = person({
  id: 'm-lee',
  name: '이도윤',
  job: '물리치료사',
  hiredOn: '2023-07-17',
  phone: '01000005247',
  birthday: '1996-04-12',
  address: '○○시 ○○구 ○○로 123, 4층',
  bank: '○○은행',
  accountNo: '123-456-789012',
  calendarStaffId: 'c-lee',
  memo: '도수치료 담당',
})
const JUNG = person({
  id: 'm-jung',
  name: '정유나',
  job: '원무',
  employment: 'part',
  weeklyHours: 24,
  hiredOn: '2024-09-02',
  phone: '01000004418',
  birthday: '1999-11-24',
  usedBefore: 2,
  usedBeforeFrom: '2026-09-02',
})
const PARK = person({ id: 'm-park', name: '박서연', job: '물리치료사', hiredOn: '2025-01-06', phone: '01000006190', calendarStaffId: 'c-park', usedBefore: 3, usedBeforeFrom: '2026-01-06' })
const HAN = person({ id: 'm-han', name: '한지우', job: '원무', employment: 'contract', hiredOn: '2026-02-02', phone: '01000007733', usedBefore: 4, usedBeforeFrom: '2026-02-02' })
const MEMBERS = [MOON, CHOI, OH, KIM, LEE, JUNG, PARK, HAN]

// 이도윤 이번 기간(2026-07-17~) 연차 6일
const LEAVES: Leave[] = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-10-02'].map((day, i) => ({
  id: `l${i}`,
  groupId: i < 5 ? 'g1' : 'g2',
  staffId: 'm-lee',
  day,
  kind: 'annual',
  part: null,
  paid: true,
  memo: null,
}))

const WEEKDAY = { start: 540, end: 1080, lunchFrom: 780, lunchTo: 840 }
const SATURDAY = { start: 540, end: 780, lunchFrom: null, lunchTo: null }
const PLANS: WeekPlan[] = [{ id: 'p-lee', staffId: 'm-lee', from: '2023-07-17', week: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, SATURDAY, null], sat: '2-4' }]

const CLINIC_STAFF: ClinicStaff[] = [
  { id: 'c-won', name: '원장님', role: 'doctor', mark: '원', color: 'gray', calendar: false },
  { id: 'c-lee', name: '이도윤', role: 'staff', mark: '이', color: 'teal', calendar: true },
  { id: 'c-park', name: '박서연', role: 'staff', mark: '박', color: 'purple', calendar: true },
  { id: 'c-yoon', name: '윤가람', role: 'staff', mark: '윤', color: 'orange', calendar: true },
]
const CLINIC: ClinicProfileView = {
  state: 'ready',
  profile: { ...defaultProfile(), staff: CLINIC_STAFF },
  saved: true,
  signupName: '가짜의원',
  signupPhone: null,
  name: '가짜의원',
  logoDataUrl: null,
  reload: () => {},
}

const doc = (id: string, name: string, createdAt: string, size: number, mime: string, staffId = 'm-lee'): StaffFile => ({
  id,
  kind: 'doc',
  staffId,
  month: null,
  name,
  path: `h/doc/${staffId}/${id}`,
  size,
  mime,
  createdAt,
})
const DOCS: StaffFile[] = [
  doc('f1', '근로계약서 2023.pdf', '2023-07-17T01:00:00Z', 240_000, 'application/pdf'),
  doc('f2', '연봉계약서 2025.pdf', '2025-07-21T01:00:00Z', 198_000, 'application/pdf'),
  doc('f3', '면허증 사본.jpg', '2023-07-17T02:00:00Z', 1_100_000, 'image/jpeg'),
  doc('f4', '통장 사본.pdf', '2023-07-20T01:00:00Z', 180_000, 'application/pdf'),
  doc('f9', '다른 사람 서류.pdf', '2024-01-02T01:00:00Z', 1_000, 'application/pdf', 'm-kim'),
]

const listLeaves = vi.fn<StaffStore['listLeaves']>()
const saveMember = vi.fn<StaffStore['saveMember']>()
const purgeMember = vi.fn<StaffStore['purgeMember']>()
const importRoster = vi.fn<StaffStore['importRoster']>()
const STORE = { listLeaves, saveMember, purgeMember, importRoster } as unknown as StaffStore
const listFiles = vi.fn<StaffFileStore['listFiles']>()
const uploadFile = vi.fn<StaffFileStore['uploadFile']>()
const deleteFile = vi.fn<StaffFileStore['deleteFile']>()
const downloadFile = vi.fn<StaffFileStore['downloadFile']>()
const FILES = { listFiles, uploadFile, deleteFile, downloadFile } as unknown as StaffFileStore
const reload = vi.fn()

function base(over: Partial<StaffBase> = {}): StaffBase {
  return { state: 'ready', members: MEMBERS, settings: defaultStaffSettings(), plans: PLANS, clinic: CLINIC, store: STORE, files: FILES, reload, ...over }
}

function show(over: Partial<StaffBase> = {}) {
  vi.mocked(useStaffBase).mockReturnValue(base(over))
  const user = userEvent.setup({ applyAccept: false })
  render(<StaffPage />)
  return user
}

const cellsOf = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))
const headsOf = (table: HTMLElement) => within(table).getAllByRole('columnheader').map((th) => th.textContent)
const alertCode = () => screen.getAllByRole('alert').map((el) => el.textContent ?? '').join('\n')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-21T03:00:00Z')) // 한국 2026-11-21(토) 12:00
  for (const fn of [listLeaves, saveMember, purgeMember, importRoster, listFiles, uploadFile, deleteFile, downloadFile, reload, vi.mocked(readRoster)]) fn.mockReset()
  listLeaves.mockResolvedValue(LEAVES)
  listFiles.mockResolvedValue(DOCS)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-7612.1: 명단 첫 화면 — 알림 줄 · 재직/퇴사 고르기 · 단추 셋 · 재직 표', () => {
  it('AC-7612.1: 페이지는 명단 화면을 오늘(한국 날짜)로 그린다 — 앞으로 7일 알림은 셈한 요일(정유나 11-24 화요일 · 최민준 입사 7주년 11-25 수요일)', async () => {
    show()
    const alerts = await screen.findByRole('list', { name: '앞으로 7일' })
    expect(screen.getByText('앞으로 7일')).toBeTruthy()
    expect(within(alerts).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['🎂 생일 정유나 11-24 화요일', '🎉 입사 7주년 최민준 11-25 수요일'])
  })

  it('AC-7612.1: 앞으로 7일에 생일·입사 기념일이 없으면 알림 줄이 없다', async () => {
    show({ members: [KIM, LEE] })
    await screen.findByRole('table', { name: '재직 직원' })
    expect(screen.queryByText('앞으로 7일')).toBeNull()
  })

  it("AC-7612.1: '재직 {n}'·'퇴사 {n}' 고르기(처음 재직), [＋ 직원 더하기]·[엑셀 양식 받기]·[엑셀 올리기]", async () => {
    show()
    const active = await screen.findByRole('button', { name: '재직 6' })
    expect(active.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '퇴사 2' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: '＋ 직원 더하기' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '엑셀 양식 받기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '엑셀 올리기' })).toBeTruthy()
  })

  it("AC-7612.1: 재직 표 — 머리 여덟 칸, 입사일 빠른 사람부터, 근무 형태 '{정규직} · 주 {n}시간'·근속·남은 연차·연락처·예약 시행자 '({표시}) {이름}' 또는 '없음'", async () => {
    show()
    const table = await screen.findByRole('table', { name: '재직 직원' })
    expect(headsOf(table)).toEqual(['이름', '직종', '근무 형태 (주 시간)', '입사일', '근속', '남은 연차', '연락처', '예약 시행자'])
    await waitFor(() => expect(cellsOf(table)[0]![5]).toBe('3일'))
    expect(cellsOf(table)).toEqual([
      ['최민준', '방사선사', '정규직 · 주 40시간', '2019-11-25', '6년 11개월', '3일', '010-0000-2075', '없음'],
      ['김하늘', '간호조무사', '정규직 · 주 40시간', '2021-03-02', '5년 8개월', '7.5일', '010-0000-3812', '없음'],
      ['이도윤', '물리치료사', '정규직 · 주 40시간', '2023-07-17', '3년 4개월', '10일', '010-0000-5247', '(이) 이도윤'],
      ['정유나', '원무', '파트타임 · 주 24시간', '2024-09-02', '2년 2개월', '7일', '010-0000-4418', '없음'],
      ['박서연', '물리치료사', '정규직 · 주 40시간', '2025-01-06', '1년 10개월', '12일', '010-0000-6190', '(박) 박서연'],
      ['한지우', '원무', '계약직 · 주 40시간', '2026-02-02', '9개월', '5일', '010-0000-7733', '없음'],
    ])
  })

  it('AC-7612.1: 남은 연차는 지금 연차 기간 휴가를 읽어 센다(가장 이른 입사일부터 앞날까지 한 번)', async () => {
    show()
    await waitFor(() => expect(listLeaves).toHaveBeenCalledTimes(1))
    const range = listLeaves.mock.calls[0]![0]
    expect(range.from <= '2018-04-02').toBe(true)
    expect(range.to >= '2027-07-16').toBe(true)
  })

  it("AC-7612.1: 휴가를 못 읽으면 남은 연차는 '–'이고 E-STAFF-READ-FAILED와 [다시 불러오기]가 보인다", async () => {
    listLeaves.mockRejectedValueOnce(new StaffStoreError('E-STAFF-READ-FAILED'))
    const user = show()
    await waitFor(() => expect(alertCode()).toContain('E-STAFF-READ-FAILED'))
    expect(cellsOf(screen.getByRole('table', { name: '재직 직원' }))[0]![5]).toBe('–')
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await waitFor(() => expect(listLeaves).toHaveBeenCalledTimes(2))
  })

  it('AC-7612.1: 직원 자료를 못 읽으면 E-STAFF-READ-FAILED와 [다시 불러오기](다시 읽기)', async () => {
    const user = show({ state: 'failed', members: [] })
    expect(alertCode()).toContain('E-STAFF-READ-FAILED')
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('AC-7612.1: 줄을 누르면 그 사람 직원 카드가 열린다', async () => {
    const user = show()
    const table = await screen.findByRole('table', { name: '재직 직원' })
    await user.click(within(table).getByText('박서연'))
    expect(screen.getByRole('heading', { name: '박서연' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '← 명단으로' })).toBeTruthy()
    expect(screen.queryByRole('table', { name: '재직 직원' })).toBeNull()
  })
})

describe('AC-7612.2: 직원 카드', () => {
  async function openLee() {
    const user = show()
    await user.click(within(await screen.findByRole('table', { name: '재직 직원' })).getByText('이도윤'))
    return user
  }

  it("AC-7612.2: 머리 — '← 명단으로', 이름·직종·'{근무 형태} · 주 {n}시간'·'재직 {근속}'·[고치기]", async () => {
    await openLee()
    expect(screen.getByRole('heading', { name: '이도윤' })).toBeTruthy()
    for (const text of ['물리치료사', '정규직 · 주 40시간', '재직 3년 4개월']) expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '고치기' })).toBeTruthy()
  })

  it("AC-7612.2: '직원 정보' — 이름~메모 모든 칸(계좌도 그대로, 퇴사일 없으면 '없음'), 예약 시행자 옆 '휴가가 예약 달력에 '휴무'로 보여요'", async () => {
    await openLee()
    const info = screen.getByRole('region', { name: '직원 정보' })
    const pairs = [...info.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent])
    expect(pairs).toEqual([
      ['이름', '이도윤'],
      ['직종', '물리치료사'],
      ['근무 형태', '정규직'],
      ['주 근무시간', '40시간'],
      ['입사일', '2023-07-17'],
      ['퇴사일', '없음'],
      ['연락처', '010-0000-5247'],
      ['생일', '1996-04-12'],
      ['주소', '○○시 ○○구 ○○로 123, 4층'],
      ['은행', '○○은행'],
      ['계좌번호', '123-456-789012'],
      ['예약 시행자', "(이) 이도윤휴가가 예약 달력에 '휴무'로 보여요"],
      ['메모', '도수치료 담당'],
    ])
  })

  it("AC-7612.2: 연차 요약 — '{시작} ~ {끝} · 입사일 기준', 생긴 16·쓴 6·남은 10, [휴가 보기]", async () => {
    await openLee()
    const leave = screen.getByRole('region', { name: '연차' })
    expect(within(leave).getByText('2026-07-17 ~ 2027-07-16 · 입사일 기준')).toBeTruthy()
    await waitFor(() => expect(within(leave).getByText('생긴 연차').parentElement?.textContent).toBe('생긴 연차16일'))
    expect(within(leave).getByText('쓴 연차').parentElement?.textContent).toBe('쓴 연차6일')
    expect(within(leave).getByText('남은 연차').parentElement?.textContent).toBe('남은 연차10일')
    expect(within(leave).getByRole('link', { name: '휴가 보기' }).getAttribute('href')).toBe('/staff/leave')
  })

  it("AC-7612.2: 다음 해로 넘김이면 '생긴 연차'는 그 기간에 생긴 일수만이고 그 아래 '넘어옴 {n}일'(휴가 표와 같다)", async () => {
    const user = show({ settings: { ...defaultStaffSettings(), leftover: 'carry' } })
    await user.click(within(await screen.findByRole('table', { name: '재직 직원' })).getByText('이도윤'))
    const leave = screen.getByRole('region', { name: '연차' })
    // 이도윤 앞 기간들(11 → 15 + 11 → 15 + 26)에 쓴 휴가가 없어 41일이 넘어왔다: 남은 = 16 + 41 − 6
    await waitFor(() => expect(within(leave).getByText('생긴 연차').parentElement?.textContent).toBe('생긴 연차16일넘어옴 41일'))
    expect(within(leave).getByText('넘어옴 41일')).toBeTruthy()
    expect(within(leave).getByText('쓴 연차').parentElement?.textContent).toBe('쓴 연차6일')
    expect(within(leave).getByText('남은 연차').parentElement?.textContent).toBe('남은 연차51일')
  })

  it("AC-7612.2: 수당으로 정산이면 '넘어옴' 줄이 없다", async () => {
    await openLee()
    const leave = screen.getByRole('region', { name: '연차' })
    await waitFor(() => expect(within(leave).getByText('생긴 연차').parentElement?.textContent).toBe('생긴 연차16일'))
    expect(within(leave).queryByText(/넘어옴/)).toBeNull()
  })

  it("AC-7612.2: 1월 1일 기준 병원이면 연차 머리가 '· 1월 1일 기준'이다", async () => {
    const user = show({ settings: { ...defaultStaffSettings(), leaveBasis: 'jan1' } })
    await user.click(within(await screen.findByRole('table', { name: '재직 직원' })).getByText('김하늘'))
    expect(within(screen.getByRole('region', { name: '연차' })).getByText('2026-01-01 ~ 2026-12-31 · 1월 1일 기준')).toBeTruthy()
  })

  it("AC-7612.2: 기본 근무 요약 — '월~금 09:00~18:00 (점심 13:00~14:00)'·'토 09:00~13:00 격주 — 둘째·넷째 주'·'일 쉬는 날', [근무표 보기]", async () => {
    await openLee()
    const work = screen.getByRole('region', { name: '기본 근무' })
    expect(within(work).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '월~금 09:00~18:00 (점심 13:00~14:00)',
      '토 09:00~13:00 격주 — 둘째·넷째 주',
      '일 쉬는 날',
    ])
    expect(within(work).getByRole('link', { name: '근무표 보기' }).getAttribute('href')).toBe('/staff/schedule')
  })

  it("AC-7612.2: '서류 파일 {n}개'·[파일 올리기], 그 사람 파일 줄 '{이름} {YYYY-MM-DD} 올림 · {크기}'·[받기]·[지우기], 올릴 수 있는 파일 안내", async () => {
    await openLee()
    const files = screen.getByRole('region', { name: /^서류 파일/ })
    await waitFor(() => expect(within(files).getByRole('heading', { name: '서류 파일 4개' })).toBeTruthy())
    expect(within(files).getByRole('button', { name: '파일 올리기' })).toBeTruthy()
    const rows = within(files).getAllByRole('listitem')
    expect(rows.map((li) => [within(li).getByText(/\.(pdf|jpg)$/).textContent, within(li).getByText(/올림/).textContent])).toEqual([
      ['근로계약서 2023.pdf', '2023-07-17 올림 · 240KB'],
      ['연봉계약서 2025.pdf', '2025-07-21 올림 · 198KB'],
      ['면허증 사본.jpg', '2023-07-17 올림 · 1.1MB'],
      ['통장 사본.pdf', '2023-07-20 올림 · 180KB'],
    ])
    for (const li of rows) {
      expect(within(li).getByRole('button', { name: '받기' })).toBeTruthy()
      expect(within(li).getByRole('button', { name: '지우기' })).toBeTruthy()
    }
    expect(within(files).getByText('PDF·그림 파일(jpg·png)을 올릴 수 있어요. 한 개에 10MB까지예요.')).toBeTruthy()
  })

  it('AC-7612.2: [받기]는 그 파일을 받는다', async () => {
    const user = await openLee()
    const li = (await screen.findByText('연봉계약서 2025.pdf')).closest('li')!
    await user.click(within(li).getByRole('button', { name: '받기' }))
    expect(downloadFile).toHaveBeenCalledWith(DOCS[1])
  })

  it("AC-7612.2: [지우기]는 '이 파일을 지울까요?'를 한 번 묻고 지운 뒤 목록을 다시 읽는다([취소]면 그대로)", async () => {
    deleteFile.mockResolvedValue(undefined)
    const user = await openLee()
    const li = (await screen.findByText('통장 사본.pdf')).closest('li')!
    await user.click(within(li).getByRole('button', { name: '지우기' }))
    let dialog = screen.getByRole('dialog', { name: '이 파일을 지울까요?' })
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(deleteFile).not.toHaveBeenCalled()

    await user.click(within(li).getByRole('button', { name: '지우기' }))
    dialog = screen.getByRole('dialog', { name: '이 파일을 지울까요?' })
    const before = listFiles.mock.calls.length
    await user.click(within(dialog).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(deleteFile).toHaveBeenCalledWith(DOCS[3]))
    await waitFor(() => expect(listFiles.mock.calls.length).toBe(before + 1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('AC-7612.2: [파일 올리기]로 고른 파일을 그 직원 서류로 올리고, 받지 않는 종류·10MB 넘는 파일은 올리지 않고 E-STAFF-FILE-FAILED', async () => {
    uploadFile.mockImplementation(async (input) => doc('f5', input.file.name, '2026-11-21T03:00:00Z', input.file.size, 'application/pdf'))
    const user = await openLee()
    await screen.findByRole('heading', { name: '서류 파일 4개' })
    const input = screen.getByLabelText('서류 파일 고르기') as HTMLInputElement
    expect(input.accept).toBe('.pdf,.jpg,.jpeg,.png')
    const good = new File(['%PDF'], '새 계약서.pdf', { type: 'application/pdf' })
    await user.upload(input, good)
    await waitFor(() => expect(uploadFile).toHaveBeenCalledWith({ kind: 'doc', staffId: 'm-lee', file: good }))

    uploadFile.mockClear()
    await user.upload(input, new File(['x'], '메모.docx'))
    await waitFor(() => expect(alertCode()).toContain('E-STAFF-FILE-FAILED'))
    const big = new File(['x'], '큰 파일.pdf')
    Object.defineProperty(big, 'size', { value: 10_000_001 })
    await user.upload(input, big)
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it("AC-7612.2: '← 명단으로'를 누르면 명단 표로 돌아간다", async () => {
    const user = await openLee()
    await user.click(screen.getByRole('button', { name: '← 명단으로' }))
    expect(await screen.findByRole('table', { name: '재직 직원' })).toBeTruthy()
  })
})

describe('AC-7612.3: 직원 더하기 · 고치기 칸', () => {
  async function openAdd() {
    const user = show()
    await user.click(await screen.findByRole('button', { name: '＋ 직원 더하기' }))
    return user
  }

  it("AC-7612.3: 제목 '직원 더하기', 구역 '기본'·'연락 · 급여 계좌'·'예약 · 연차 · 메모', 칸·도움말·[저장]·[취소]", async () => {
    await openAdd()
    expect(screen.getByRole('heading', { name: '직원 더하기' })).toBeTruthy()
    for (const name of ['기본', '연락 · 급여 계좌', '예약 · 연차 · 메모']) expect(screen.getByRole('region', { name })).toBeTruthy()
    // 꼭 적을 칸은 이름·입사일 둘
    expect(screen.getAllByText('꼭').length).toBe(2)
    for (const label of ['이름', '주 근무시간', '입사일', '퇴사일', '연락처', '생일', '주소', '은행', '계좌번호', '올해 이미 쓴 연차', '메모']) {
      expect(screen.getByLabelText(label), label).toBeTruthy()
    }
    const employment = screen.getByRole('group', { name: '근무 형태' })
    expect(within(employment).getAllByRole('button').map((b) => b.textContent)).toEqual(['정규직', '계약직', '파트타임'])
    const job = screen.getByRole('group', { name: '직종' })
    expect(within(job).getAllByRole('button').map((b) => b.textContent)).toEqual(['간호사', '간호조무사', '물리치료사', '방사선사', '원무', '기타'])
    for (const help of [
      '연차를 셀 때 써요. 주 15시간 안 되면 연차가 없어요.',
      "넣으면 '퇴사' 목록으로 옮겨요.",
      "고르면 휴가가 예약 달력에 '휴무'로 보여요. 목록은 설정 → 병원 정보 '원장님·직원'에서 고쳐요.",
      '처음 넣을 때만 적어요. 웹앱을 쓰기 전에 이번 연차 기간에 이미 쓴 날수예요. 반차는 0.5로 적어요.',
    ]) {
      expect(screen.getByText(help)).toBeTruthy()
    }
    expect((screen.getByLabelText('계좌번호') as HTMLInputElement).placeholder).toBe('숫자와 - 만')
    expect((screen.getByLabelText('은행') as HTMLSelectElement).options[0]!.textContent).toBe('고르기')
    expect(screen.getByRole('button', { name: '저장' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy()
  })

  it("AC-7612.3: 직종 '기타'를 고르면 '직종 직접 적기' 칸이 나온다", async () => {
    const user = await openAdd()
    expect(screen.queryByLabelText('직종 직접 적기')).toBeNull()
    await user.click(within(screen.getByRole('group', { name: '직종' })).getByRole('button', { name: '기타' }))
    expect(screen.getByLabelText('직종 직접 적기')).toBeTruthy()
    expect(screen.getByText("'기타'를 고르면 나오는 칸이에요.")).toBeTruthy()
  })

  it("AC-7612.3: 예약 시행자 — '없음' + 병원 정보에서 '예약에 보이기'인 사람, 다른 직원과 이어진 사람은 '{이름} 님과 이어짐'으로 못 고른다", async () => {
    await openAdd()
    const pick = screen.getByRole('group', { name: '예약 시행자' })
    const options = within(pick).getAllByRole('button') as HTMLButtonElement[]
    expect(options.map((b) => b.textContent)).toEqual(['없음', '(이) 이도윤이도윤 님과 이어짐', '(박) 박서연박서연 님과 이어짐', '(윤) 윤가람'])
    expect(options.map((b) => b.disabled)).toEqual([false, true, true, false])
    expect(options[0]!.getAttribute('aria-pressed')).toBe('true')
  })

  it("AC-7612.3: 입사일 없이 저장하면 칸 아래 '입사일을 적어 주세요.', 이름이 없으면 '이름을 적어 주세요.' — 저장하지 않는다", async () => {
    const user = await openAdd()
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByText('이름을 적어 주세요.')).toBeTruthy()
    expect(screen.getByText(/^입사일을 적어 주세요\./)).toBeTruthy()
    expect(screen.getByLabelText('입사일').getAttribute('aria-invalid')).toBe('true')
    expect(saveMember).not.toHaveBeenCalled()
  })

  it('AC-7612.3: 다른 칸 규칙(AC-7601.4)도 칸 아래 까닭으로 막는다 — 연락처 9~11자리·계좌번호 숫자와 -·퇴사일 ≥ 입사일·주 근무시간 0~80', async () => {
    const user = await openAdd()
    await user.type(screen.getByLabelText('이름'), '윤가람')
    fireEvent.change(screen.getByLabelText('입사일'), { target: { value: '2026-11-02' } })
    fireEvent.change(screen.getByLabelText('퇴사일'), { target: { value: '2026-10-01' } })
    await user.type(screen.getByLabelText('연락처'), '010-12')
    await user.type(screen.getByLabelText('계좌번호'), '농협 123')
    await user.clear(screen.getByLabelText('주 근무시간'))
    await user.type(screen.getByLabelText('주 근무시간'), '81')
    await user.click(screen.getByRole('button', { name: '저장' }))
    for (const label of ['퇴사일', '연락처', '계좌번호', '주 근무시간']) expect(screen.getByLabelText(label).getAttribute('aria-invalid'), label).toBe('true')
    expect(saveMember).not.toHaveBeenCalled()
  })

  it("AC-7612.3: 입사일 까닭은 '입사일을 적어 주세요. 연차와 근속을 셀 때 써요.' 그대로다", async () => {
    const user = await openAdd()
    await user.type(screen.getByLabelText('이름'), '강다은')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByText('입사일을 적어 주세요. 연차와 근속을 셀 때 써요.')).toBeTruthy()
    expect(saveMember).not.toHaveBeenCalled()
  })

  it("AC-7612.3: 칸 아래 까닭은 '화면 글 기본값' 글 그대로다", async () => {
    const user = await openAdd()
    const put = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
    put('이름', '가'.repeat(21))
    put('입사일', '2026-11-02')
    put('퇴사일', '2026-10-01')
    put('주 근무시간', '40.3')
    put('연락처', '010-12')
    put('주소', '다'.repeat(101))
    put('계좌번호', '농협 123')
    put('올해 이미 쓴 연차', '51')
    put('메모', '마'.repeat(501))
    await user.click(within(screen.getByRole('group', { name: '직종' })).getByRole('button', { name: '기타' }))
    put('직종 직접 적기', '나'.repeat(21))
    await user.selectOptions(screen.getByLabelText('은행'), '그 밖의 은행')
    put('은행 이름', '라'.repeat(21))
    await user.click(screen.getByRole('button', { name: '저장' }))
    const reasonOf = (label: string) => document.getElementById(`${screen.getByLabelText(label).id}-error`)?.textContent
    expect(
      ['이름', '직종 직접 적기', '주 근무시간', '퇴사일', '연락처', '주소', '은행 이름', '계좌번호', '올해 이미 쓴 연차', '메모'].map((label) => [label, reasonOf(label)]),
    ).toEqual([
      ['이름', '이름은 20자까지예요.'],
      ['직종 직접 적기', '직종은 20자까지예요.'],
      ['주 근무시간', '주 근무시간은 0~80시간, 0.5시간 단위로 적어 주세요.'],
      ['퇴사일', '퇴사일은 입사일보다 앞일 수 없어요.'],
      ['연락처', '연락처는 숫자 9~11자리로 적어 주세요.'],
      ['주소', '주소는 100자까지예요.'],
      ['은행 이름', '은행 이름은 20자까지예요.'],
      ['계좌번호', '계좌번호는 숫자와 - 만, 6~30자로 적어 주세요.'],
      ['올해 이미 쓴 연차', '0~50일, 0.5일 단위로 적어 주세요.'],
      ['메모', '메모는 500자까지예요.'],
    ])
    expect(saveMember).not.toHaveBeenCalled()
  })

  it('AC-7612.3: 같은 이름 + 입사일인 직원이 이미 있으면 저장하지 않는다', async () => {
    const user = await openAdd()
    await user.type(screen.getByLabelText('이름'), '김하늘')
    fireEvent.change(screen.getByLabelText('입사일'), { target: { value: '2021-03-02' } })
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByLabelText('이름').getAttribute('aria-invalid')).toBe('true')
    expect(saveMember).not.toHaveBeenCalled()
  })

  it("AC-7612.3: 다 채워 저장하면 열여섯 칸으로 저장하고('올해 이미 쓴 연차'는 이번 연차 기간 시작일과 함께) 그 사람 카드로 간다", async () => {
    saveMember.mockImplementation(async (m) => ({ id: 'm-new', ...m }))
    const user = await openAdd()
    await user.type(screen.getByLabelText('이름'), ' 윤가람 ')
    await user.click(within(screen.getByRole('group', { name: '근무 형태' })).getByRole('button', { name: '파트타임' }))
    await user.click(within(screen.getByRole('group', { name: '직종' })).getByRole('button', { name: '기타' }))
    await user.type(screen.getByLabelText('직종 직접 적기'), '운동처방사')
    await user.clear(screen.getByLabelText('주 근무시간'))
    await user.type(screen.getByLabelText('주 근무시간'), '20')
    fireEvent.change(screen.getByLabelText('입사일'), { target: { value: '2026-11-02' } })
    await user.type(screen.getByLabelText('연락처'), '010-0000-8456')
    fireEvent.change(screen.getByLabelText('생일'), { target: { value: '2000-05-03' } })
    await user.type(screen.getByLabelText('주소'), '○○시 ○○구 ○○로')
    await user.selectOptions(screen.getByLabelText('은행'), 'KB국민은행')
    await user.type(screen.getByLabelText('계좌번호'), '123-45-6789')
    await user.click(within(screen.getByRole('group', { name: '예약 시행자' })).getByRole('button', { name: '(윤) 윤가람' }))
    await user.clear(screen.getByLabelText('올해 이미 쓴 연차'))
    await user.type(screen.getByLabelText('올해 이미 쓴 연차'), '1.5')
    await user.type(screen.getByLabelText('메모'), '오후만')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(saveMember).toHaveBeenCalledTimes(1))
    expect(saveMember).toHaveBeenCalledWith(
      {
        name: '윤가람',
        job: '기타',
        jobOther: '운동처방사',
        employment: 'part',
        weeklyHours: 20,
        hiredOn: '2026-11-02',
        leftOn: null,
        phone: '01000008456',
        birthday: '2000-05-03',
        address: '○○시 ○○구 ○○로',
        bank: 'KB국민은행',
        accountNo: '123-45-6789',
        calendarStaffId: 'c-yoon',
        memo: '오후만',
        usedBefore: 1.5,
        usedBeforeFrom: '2026-11-02',
      },
      undefined,
    )
    expect(await screen.findByRole('heading', { name: '윤가람' })).toBeTruthy()
    expect(reload).toHaveBeenCalled()
  })

  it("AC-7612.3: 직종을 고르지 않고 이름·입사일만 적어도 저장된다(직종 '기타', 직접 적은 직종 없음, 올해 쓴 연차 0)", async () => {
    saveMember.mockImplementation(async (m) => ({ id: 'm-new', ...m }))
    const user = await openAdd()
    await user.type(screen.getByLabelText('이름'), '강다은')
    fireEvent.change(screen.getByLabelText('입사일'), { target: { value: '2026-03-02' } })
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(saveMember).toHaveBeenCalledTimes(1))
    expect(saveMember.mock.calls[0]![0]).toMatchObject({ name: '강다은', job: '기타', jobOther: null, employment: 'regular', weeklyHours: 40, usedBefore: 0, usedBeforeFrom: null, calendarStaffId: null })
  })

  it('AC-7612.3: 저장이 실패하면 적은 값은 그대로이고 E-STAFF-SAVE-FAILED가 보인다', async () => {
    saveMember.mockRejectedValue(new StaffStoreError('E-STAFF-SAVE-FAILED'))
    const user = await openAdd()
    await user.type(screen.getByLabelText('이름'), '강다은')
    fireEvent.change(screen.getByLabelText('입사일'), { target: { value: '2026-03-02' } })
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(alertCode()).toContain('E-STAFF-SAVE-FAILED'))
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('강다은')
    expect(screen.getByRole('heading', { name: '직원 더하기' })).toBeTruthy()
  })

  it("AC-7612.7: 주소·메모에 주민번호 모양이 든 채 [저장]하면 그 칸 아래 '주민번호는 저장하지 않아요. 지우고 다시 저장해 주세요.'이고 저장하지 않는다(적은 값은 그대로)", async () => {
    const user = await openAdd()
    const put = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
    put('이름', '강다은')
    put('입사일', '2026-03-02')
    put('주소', '○○시 900101-1234567')
    put('메모', '주민 9001011234567')
    await user.click(screen.getByRole('button', { name: '저장' }))
    const reasonOf = (label: string) => document.getElementById(`${screen.getByLabelText(label).id}-error`)?.textContent
    expect(reasonOf('주소')).toBe('주민번호는 저장하지 않아요. 지우고 다시 저장해 주세요.')
    expect(reasonOf('메모')).toBe('주민번호는 저장하지 않아요. 지우고 다시 저장해 주세요.')
    expect(screen.getByLabelText('메모').getAttribute('aria-invalid')).toBe('true')
    expect((screen.getByLabelText('주소') as HTMLInputElement).value).toBe('○○시 900101-1234567')
    expect((screen.getByLabelText('메모') as HTMLTextAreaElement).value).toBe('주민 9001011234567')
    expect(saveMember).not.toHaveBeenCalled()

    // 고치기에서도 같다(전각 숫자·긴 줄표도 같은 모양)
    cleanup()
    const again = show()
    await again.click(within(await screen.findByRole('table', { name: '재직 직원' })).getByText('이도윤'))
    await again.click(screen.getByRole('button', { name: '고치기' }))
    put('메모', '９００１０１—１２３４５６７')
    await again.click(screen.getByRole('button', { name: '저장' }))
    expect(reasonOf('메모')).toBe('주민번호는 저장하지 않아요. 지우고 다시 저장해 주세요.')
    expect(saveMember).not.toHaveBeenCalled()
  })

  it("AC-7612.7: 반례 — 전화번호('010-1234-5678')·계좌번호('110-123-456789') 모양이 든 주소·메모는 막지 않고 저장된다", async () => {
    saveMember.mockImplementation(async (m) => ({ id: 'm-new', ...m }))
    const user = await openAdd()
    const put = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
    put('이름', '강다은')
    put('입사일', '2026-03-02')
    put('주소', '○○시 ○○로 1 (010-1234-5678)')
    put('메모', '월급 계좌 110-123-456789 · 1990-01-01 · 3,200,000원')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(saveMember).toHaveBeenCalledTimes(1))
    expect(saveMember.mock.calls[0]![0]).toMatchObject({ address: '○○시 ○○로 1 (010-1234-5678)', memo: '월급 계좌 110-123-456789 · 1990-01-01 · 3,200,000원' })
    expect(screen.queryByText('주민번호는 저장하지 않아요. 지우고 다시 저장해 주세요.')).toBeNull()
  })

  it('AC-7612.3: [취소]는 저장하지 않고 명단으로 돌아간다', async () => {
    const user = await openAdd()
    await user.type(screen.getByLabelText('이름'), '강다은')
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(await screen.findByRole('table', { name: '재직 직원' })).toBeTruthy()
    expect(saveMember).not.toHaveBeenCalled()
  })

  it("AC-7612.3: 카드 [고치기] — 제목 '{이름} 님 고치기', 지금 값이 들어 있고 '올해 이미 쓴 연차' 칸은 없다, 저장하면 그 사람 줄을 고친다", async () => {
    saveMember.mockImplementation(async (m, id) => ({ id: id!, ...m }))
    const user = show()
    await user.click(within(await screen.findByRole('table', { name: '재직 직원' })).getByText('이도윤'))
    await user.click(screen.getByRole('button', { name: '고치기' }))
    expect(screen.getByRole('heading', { name: '이도윤 님 고치기' })).toBeTruthy()
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe('이도윤')
    expect((screen.getByLabelText('입사일') as HTMLInputElement).value).toBe('2023-07-17')
    expect((screen.getByLabelText('연락처') as HTMLInputElement).value).toBe('010-0000-5247')
    expect((screen.getByLabelText('계좌번호') as HTMLInputElement).value).toBe('123-456-789012')
    expect(within(screen.getByRole('group', { name: '직종' })).getByRole('button', { name: '물리치료사' }).getAttribute('aria-pressed')).toBe('true')
    // 자기와 이어진 시행자는 고른 채로 보이고, 다른 직원과 이어진 사람만 막힌다
    const own = within(screen.getByRole('group', { name: '예약 시행자' })).getByRole('button', { name: '(이) 이도윤' }) as HTMLButtonElement
    expect([own.disabled, own.getAttribute('aria-pressed')]).toEqual([false, 'true'])
    // 지금 목록에 없는 은행은 '그 밖의 은행' + 직접 적은 이름
    expect((screen.getByLabelText('은행') as HTMLSelectElement).value).toBe('그 밖의 은행')
    expect((screen.getByLabelText('은행 이름') as HTMLInputElement).value).toBe('○○은행')
    expect(screen.queryByLabelText('올해 이미 쓴 연차')).toBeNull()

    await user.clear(screen.getByLabelText('메모'))
    await user.type(screen.getByLabelText('메모'), '도수치료·체외충격파')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(saveMember).toHaveBeenCalledTimes(1))
    const [member, id] = saveMember.mock.calls[0]!
    expect(id).toBe('m-lee')
    expect({ id: 'm-lee', ...member }).toEqual({ ...LEE, memo: '도수치료·체외충격파' })
    expect(await screen.findByRole('heading', { name: '이도윤' })).toBeTruthy()
  })
})

describe('AC-7612.4: 엑셀 양식 받기 · 엑셀 올리기 미리 보기', () => {
  const raw = (cells: Partial<Record<(typeof ROSTER_HEADERS)[number], string>>) =>
    Object.fromEntries(ROSTER_HEADERS.map((h) => [h, cells[h] ?? ''])) as RosterRow['raw']
  const fresh = (line: number, m: Pick<StaffMember, 'name' | 'job' | 'employment' | 'weeklyHours' | 'hiredOn' | 'usedBefore'>, usedBeforeFrom: string | null): RosterRow => ({
    line,
    action: 'new',
    reason: null,
    changed: [],
    member: { jobOther: null, leftOn: null, phone: null, birthday: null, address: null, bank: null, accountNo: null, memo: null, usedBeforeFrom, ...m },
    plan: null,
    raw: raw({ '이름*': m.name, '입사일*': m.hiredOn }),
  })
  const READ: RosterRead = {
    problem: null,
    rows: [
      fresh(2, { name: '최민준', job: '방사선사', employment: 'regular', weeklyHours: 40, hiredOn: '2019-11-25', usedBefore: 14 }, '2025-11-25'),
      {
        line: 3,
        action: 'update',
        reason: null,
        changed: ['연락처', '주소'],
        member: { id: 'm-kim', name: '김하늘', hiredOn: '2021-03-02', phone: '01000003899', address: '새 주소' },
        plan: null,
        raw: raw({ '이름*': '김하늘', '입사일*': '2021-03-02', 연락처: '010-0000-3899', 주소: '새 주소' }),
      },
      fresh(4, { name: '이도윤', job: '물리치료사', employment: 'regular', weeklyHours: 40, hiredOn: '2023-07-17', usedBefore: 6 }, '2026-07-17'),
      fresh(5, { name: '정유나', job: '원무', employment: 'part', weeklyHours: 24, hiredOn: '2024-09-02', usedBefore: 2 }, '2026-09-02'),
      fresh(6, { name: '박서연', job: '물리치료사', employment: 'regular', weeklyHours: 40, hiredOn: '2025-01-06', usedBefore: 3 }, '2026-01-06'),
      fresh(7, { name: '한지우', job: '원무', employment: 'contract', weeklyHours: 40, hiredOn: '2026-02-02', usedBefore: 4 }, '2026-02-02'),
      {
        line: 8,
        action: 'problem',
        reason: '입사일 모양이 틀렸어요. 2026-03-02처럼 적어 주세요.',
        changed: [],
        member: { name: '강다은', job: '간호사', employment: 'regular', weeklyHours: 40, usedBefore: 1 },
        plan: null,
        raw: raw({ '이름*': '강다은', 직종: '간호사', '근무 형태': '정규직', '주 근무시간': '40', '입사일*': '26년 3월', '올해 이미 쓴 연차(일)': '1' }),
      },
    ],
  }
  const XLSX_FILE = () => new File([new Uint8Array([80, 75, 3, 4, 1, 2])], '직원명단.xlsx')

  async function upload(read: RosterRead | Error = READ, over: Partial<StaffBase> = { members: [KIM] }) {
    let ctx: RosterContext | null = null
    vi.mocked(readRoster).mockImplementation((_buffer, _existing, given) => {
      ctx = given
      if (read instanceof Error) throw read
      return read
    })
    const user = show(over)
    await user.click(await screen.findByRole('button', { name: '엑셀 올리기' }))
    await user.upload(screen.getByLabelText('엑셀 파일 고르기'), XLSX_FILE())
    return { user, ctx: () => ctx! }
  }

  it("AC-7612.4: [엑셀 양식 받기]는 public/staff/staff-template.xlsx를 '직원명단-양식.xlsx'로 내려받는다", async () => {
    show()
    const link = await screen.findByRole('link', { name: '엑셀 양식 받기' })
    expect(link.getAttribute('href')).toBe('/staff/staff-template.xlsx')
    expect(link.getAttribute('download')).toBe('직원명단-양식.xlsx')
  })

  it('AC-7612.4: 고른 파일을 지금 직원·기본 근무·병원 진료시간·오늘로 읽고, 올해 쓴 연차의 기간 시작일은 그 사람 지금 연차 기간 시작일이다', async () => {
    await upload()
    await screen.findByRole('dialog', { name: '엑셀 올리기 — 미리 보기' })
    const [buffer, existing] = vi.mocked(readRoster).mock.calls[0]!
    expect((buffer as ArrayBuffer).byteLength).toBe(6)
    expect(existing).toEqual([KIM])
    const ctx = vi.mocked(readRoster).mock.calls[0]![2]
    expect(ctx.today).toBe(TODAY)
    expect(ctx.hours).toEqual(CLINIC.profile.hours)
    expect(ctx.plans).toEqual(PLANS)
    expect(ctx.periodStart({ employment: 'regular', weeklyHours: 40, hiredOn: '2025-01-06', leftOn: null })).toBe('2026-01-06')
    expect(ctx.periodStart({ employment: 'regular', weeklyHours: 40, hiredOn: '2026-02-02', leftOn: null })).toBe('2026-02-02')
  })

  it("AC-7612.4: 미리 보기 — 제목·'{파일 이름} · {n}줄'·'새 직원 {n}'·'고침 {n}'·'문제 {n}'·표·안내 넷·[넣기]·[취소]", async () => {
    await upload()
    const dialog = await screen.findByRole('dialog', { name: '엑셀 올리기 — 미리 보기' })
    expect(within(dialog).getByText('직원명단.xlsx · 7줄')).toBeTruthy()
    for (const chip of ['새 직원 5', '고침 1', '문제 1']) expect(within(dialog).getByText(chip)).toBeTruthy()
    const table = within(dialog).getByRole('table', { name: '엑셀 미리 보기' })
    expect(headsOf(table)).toEqual(['엑셀 줄', '이름', '직종', '근무 형태', '입사일', '올해 쓴 연차', '어떻게 넣나'])
    expect(cellsOf(table)).toEqual([
      ['2', '최민준', '방사선사', '정규직 · 40', '2019-11-25', '14', '새 직원'],
      ['3', '김하늘', '간호조무사', '정규직 · 40', '2021-03-02', '—', '고침 연락처·주소가 바뀌어요'],
      ['4', '이도윤', '물리치료사', '정규직 · 40', '2023-07-17', '6', '새 직원'],
      ['5', '정유나', '원무', '파트타임 · 24', '2024-09-02', '2', '새 직원'],
      ['6', '박서연', '물리치료사', '정규직 · 40', '2025-01-06', '3', '새 직원'],
      ['7', '한지우', '원무', '계약직 · 40', '2026-02-02', '4', '새 직원'],
      ['8', '강다은', '간호사', '정규직 · 40', '26년 3월', '1', '문제 입사일 모양이 틀렸어요. 2026-03-02처럼 적어 주세요.'],
    ])
    for (const note of [
      "이름과 입사일이 같은 직원이 이미 있으면 '고침'으로 보고 엑셀 값으로 바꿔요.",
      "'올해 쓴 연차'는 새 직원 줄에만 넣어요.",
      '연락처·생일·주소·은행·계좌번호·메모 칸도 함께 들어가요.',
    ]) {
      expect(within(dialog).getByText(note)).toBeTruthy()
    }
    expect(within(dialog).getByText('문제 줄은 빼고 넣어요.').parentElement?.textContent).toBe('문제 줄은 빼고 넣어요. 엑셀을 고쳐 다시 올리면 그 줄도 들어가요.')
    expect(within(dialog).getByRole('button', { name: '넣기' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeTruthy()
  })

  it("AC-7612.4: 고침 줄의 칸 이름은 받침에 따라 '이'·'가'로 잇는다(생일이 · 계좌번호가), 바뀐 칸이 없으면 '고침'만", async () => {
    const rows: RosterRow[] = [
      { ...READ.rows[1]!, line: 2, changed: ['생일'] },
      { ...READ.rows[1]!, line: 3, changed: ['은행', '계좌번호'] },
      { ...READ.rows[1]!, line: 4, changed: [] },
    ]
    await upload({ problem: null, rows })
    const table = within(await screen.findByRole('dialog')).getByRole('table', { name: '엑셀 미리 보기' })
    expect(cellsOf(table).map((cells) => cells[6])).toEqual(['고침 생일이 바뀌어요', '고침 은행·계좌번호가 바뀌어요', '고침'])
  })

  it('AC-7612.4: [넣기]는 문제 줄을 빼고 오늘로 넣은 뒤 창을 닫고 다시 읽는다', async () => {
    importRoster.mockResolvedValue({ added: 5, updated: 1 })
    const { user } = await upload()
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '넣기' }))
    await waitFor(() => expect(importRoster).toHaveBeenCalledWith(READ.rows.filter((row) => row.action !== 'problem'), TODAY))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(reload).toHaveBeenCalled()
  })

  it("AC-7612.4: 넣다가 실패하면 E-STAFF-SAVE-FAILED와 '같은 파일을 다시 올리면 들어간 사람은 고침으로 봐요.'가 보이고, 들어간 사람을 보게 다시 읽는다", async () => {
    importRoster.mockRejectedValue(new StaffStoreError('E-STAFF-SAVE-FAILED'))
    const { user } = await upload()
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '넣기' }))
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('E-STAFF-SAVE-FAILED'))
    expect(within(dialog).getByText('같은 파일을 다시 올리면 들어간 사람은 고침으로 봐요.')).toBeTruthy()
    expect(reload).toHaveBeenCalled()
  })

  it('AC-7612.4: [취소]는 넣지 않고 창을 닫는다', async () => {
    const { user } = await upload()
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(importRoster).not.toHaveBeenCalled()
  })

  it("AC-7612.4: 양식이 다르면 줄 없이 '양식이 달라요. …'만 보이고 [넣기]가 없다", async () => {
    await upload({ problem: '양식이 달라요. [엑셀 양식 받기]로 받은 파일에 적어 주세요.', rows: [] })
    const dialog = await screen.findByRole('dialog', { name: '엑셀 올리기 — 미리 보기' })
    expect(within(dialog).getByText('양식이 달라요. [엑셀 양식 받기]로 받은 파일에 적어 주세요.')).toBeTruthy()
    expect(within(dialog).queryByRole('table')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '넣기' })).toBeNull()
  })

  it('AC-7612.4: 엑셀로 열 수 없는 파일이면 E-STAFF-EXCEL-FAILED가 보이고 미리 보기는 열리지 않는다', async () => {
    await upload(new RosterExcelError())
    await waitFor(() => expect(alertCode()).toContain('E-STAFF-EXCEL-FAILED'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('AC-7612.5: 퇴사 목록 · 지우기', () => {
  async function openLeft() {
    const user = show()
    await user.click(await screen.findByRole('button', { name: '퇴사 2' }))
    return user
  }

  it("AC-7612.5: '퇴사 {n}'을 누르면 표 '이름 · 직종 · 입사일 · 퇴사일 · 보관' — '{YYYY-MM-DD}까지 보관' 또는 '지울 때가 됐어요' + [지우기]", async () => {
    await openLeft()
    expect(screen.getByRole('button', { name: '퇴사 2' }).getAttribute('aria-pressed')).toBe('true')
    const table = screen.getByRole('table', { name: '퇴사 직원' })
    expect(headsOf(table).slice(0, 5)).toEqual(['이름', '직종', '입사일', '퇴사일', '보관'])
    expect(cellsOf(table)).toEqual([
      ['오세린', '간호조무사', '2020-03-02', '2024-05-31', '2027-05-31까지 보관', ''],
      ['문태호', '물리치료사', '2018-04-02', '2022-12-31', '지울 때가 됐어요', '지우기'],
    ])
    expect(screen.queryByRole('table', { name: '재직 직원' })).toBeNull()
  })

  it("AC-7612.5: [지우기]는 '{이름} 님을 지울까요?'·'… 되돌릴 수 없어요.'·[지우기]·[취소]를 묻고, 지우면 그 사람을 지운 뒤 다시 읽는다", async () => {
    purgeMember.mockResolvedValue(undefined)
    const user = await openLeft()
    await user.click(within(screen.getByRole('table', { name: '퇴사 직원' })).getByRole('button', { name: '지우기' }))
    let dialog = screen.getByRole('dialog', { name: '문태호 님을 지울까요?' })
    expect(within(dialog).getByText('문태호 님 정보와 서류 파일을 모두 지워요. 되돌릴 수 없어요.')).toBeTruthy()
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['지우기', '취소'])
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(purgeMember).not.toHaveBeenCalled()

    await user.click(within(screen.getByRole('table', { name: '퇴사 직원' })).getByRole('button', { name: '지우기' }))
    dialog = screen.getByRole('dialog', { name: '문태호 님을 지울까요?' })
    await user.click(within(dialog).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(purgeMember).toHaveBeenCalledWith(MOON, TODAY))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(reload).toHaveBeenCalled()
  })

  it('AC-7612.5: 지우기가 실패하면 그 번호(서류 파일을 못 지움 E-STAFF-FILE-FAILED)가 보인다', async () => {
    purgeMember.mockRejectedValue(new StaffStoreError('E-STAFF-FILE-FAILED'))
    const user = await openLeft()
    await user.click(within(screen.getByRole('table', { name: '퇴사 직원' })).getByRole('button', { name: '지우기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(alertCode()).toContain('E-STAFF-FILE-FAILED'))
  })

  it('AC-7612.5: 퇴사자 줄을 누르면 카드와 서류를 그대로 본다', async () => {
    const user = await openLeft()
    await user.click(within(screen.getByRole('table', { name: '퇴사 직원' })).getByText('오세린'))
    expect(screen.getByRole('heading', { name: '오세린' })).toBeTruthy()
    const info = screen.getByRole('region', { name: '직원 정보' })
    const pairs = Object.fromEntries([...info.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]))
    expect(pairs['퇴사일']).toBe('2024-05-31')
    expect(await screen.findByRole('heading', { name: '서류 파일 0개' })).toBeTruthy()
  })
})

describe('AC-7612.6: 직원이 아직 없을 때', () => {
  it('AC-7612.6: 알림 줄·재직/퇴사 고르기 없이 처음 안내 — 엑셀로 한꺼번에(세 줄 + 두 단추)·한 명씩(+ [＋ 직원 더하기])·예약 시행자 안내', async () => {
    show({ members: [] })
    expect(await screen.findByText('아직 직원이 없어요')).toBeTruthy()
    expect(screen.getByText('엑셀 양식에 여러 명을 한꺼번에 적어 올리거나, 한 명씩 더할 수 있어요.')).toBeTruthy()
    const excel = screen.getByRole('region', { name: '엑셀로 한꺼번에' })
    expect(within(excel).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '[엑셀 양식 받기]로 양식을 받아요.',
      "한 줄에 한 명씩 채워요. '올해 이미 쓴 연차' 칸도 있어요.",
      '[엑셀 올리기] → 미리 보고 [넣기].',
    ])
    expect(within(excel).getByRole('link', { name: '엑셀 양식 받기' }).getAttribute('download')).toBe('직원명단-양식.xlsx')
    expect(within(excel).getByRole('button', { name: '엑셀 올리기' })).toBeTruthy()
    const one = screen.getByRole('region', { name: '한 명씩' })
    expect(within(one).getByText('칸을 채우고 저장해요. 이름과 입사일만 꼭 적으면 돼요.')).toBeTruthy()
    expect(within(one).getByRole('button', { name: '＋ 직원 더하기' })).toBeTruthy()
    expect(screen.getByText('예약 시행자 목록(설정 → 병원 정보)과는 따로예요. 직원 카드에서 이어 줄 수 있어요.')).toBeTruthy()
    expect(screen.queryByText('앞으로 7일')).toBeNull()
    expect(screen.queryByRole('button', { name: /^재직/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^퇴사/ })).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-7612.6: 처음 화면의 [＋ 직원 더하기]는 더하기 칸을 연다', async () => {
    const user = show({ members: [] })
    await user.click(await screen.findByRole('button', { name: '＋ 직원 더하기' }))
    expect(screen.getByRole('heading', { name: '직원 더하기' })).toBeTruthy()
  })
})
