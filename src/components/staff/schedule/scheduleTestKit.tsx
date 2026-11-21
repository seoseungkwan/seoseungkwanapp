import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import type { ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { useStaffBase, type StaffBase } from '@/components/staff/useStaffBase'
import { defaultProfile } from '@/lib/storage/clinicProfile'
import { defaultStaffSettings, type StaffStore } from '@/lib/storage/staff'
import type { StaffFileStore } from '@/lib/storage/staffFiles'
import type { DateRange } from '@/types/dates'
import type { DayChange, DayShift, Leave, Overtime, StaffMember, WeekPlan } from '@/types/staff'
import { ScheduleScreen } from './ScheduleScreen'

// 근무표 화면 시험(*.test.tsx 넷)이 같이 쓰는 보기 자료와 도구 — 시험 파일이 아니다(앱이 불러오지 않는다).
// 공용 읽기 훅(useStaffBase)은 시험 파일마다 vi.mock하고 resetKit()이 가짜 값을 물린다. 저장 층도 가짜 함수다. 셈은 진짜 lib/staff/schedule.ts를 쓴다.
// 보기 자료(지어낸 사람, 요구사항 머리말): 오늘 2026-11-21(토), 병원 정보는 기본값(월~금 09~18 점심 13~14, 토 09~13, 일 휴진)

export const TODAY = '2026-11-21'
export const W: DayShift = { start: 540, end: 1080, lunchFrom: 780, lunchTo: 840 } // 09:00~18:00 · 점심 13:00~14:00
export const S: DayShift = { start: 540, end: 780, lunchFrom: null, lunchTo: null } // 토 09:00~13:00

export const BLANK: StaffMember = {
  id: '',
  name: '',
  job: '간호사',
  jobOther: null,
  employment: 'regular',
  weeklyHours: 40,
  hiredOn: '2020-01-01',
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
}
export const person = (id: string, name: string, job: StaffMember['job'], hiredOn: string, extra: Partial<StaffMember> = {}): StaffMember => ({
  ...BLANK,
  id,
  name,
  job,
  hiredOn,
  ...extra,
})

// 명단 차례(입사일 빠른 사람부터 — useStaffBase가 주는 차례 그대로 그린다)
export const MEMBERS: StaffMember[] = [
  person('m4', '최민준', '방사선사', '2019-11-25'),
  person('m1', '김하늘', '간호조무사', '2021-03-02'),
  person('m7', '문태호', '간호사', '2020-01-01', { leftOn: '2022-12-31' }), // 퇴사자 — 근무표에 없다
  person('m2', '이도윤', '물리치료사', '2023-07-17'),
  person('m5', '정유나', '원무', '2024-09-02', { employment: 'part', weeklyHours: 24 }),
  person('m3', '박서연', '물리치료사', '2025-01-06'),
  person('m6', '한지우', '원무', '2026-02-02'),
]
export const plan = (staffId: string, week: DayShift[], sat: WeekPlan['sat']): WeekPlan => ({
  id: `p-${staffId}`,
  staffId,
  from: MEMBERS.find((m) => m.id === staffId)!.hiredOn,
  week,
  sat,
})
export const PLANS: WeekPlan[] = [
  plan('m1', [W, W, W, W, W, S, null], '1-3'),
  plan('m2', [W, W, W, W, W, S, null], '2-4'),
  plan('m3', [W, W, W, W, W, S, null], '2-4'),
  plan('m4', [W, W, W, W, W, S, null], '1-3'),
  plan('m5', [W, null, W, null, W, null, null], 'every'),
  plan('m6', [W, W, W, W, W, null, null], 'every'),
  plan('m7', [W, W, W, W, W, null, null], 'every'),
]
export const CHANGES: DayChange[] = [
  { staffId: 'm4', day: '2026-11-15', shift: { start: 540, end: 780, lunchFrom: null, lunchTo: null }, memo: null }, // 휴진일 근무
  { staffId: 'm3', day: '2026-11-19', shift: { start: 600, end: 1140, lunchFrom: 780, lunchTo: 840 }, memo: null },
  { staffId: 'm6', day: '2026-11-20', shift: { start: 540, end: 900, lunchFrom: 780, lunchTo: 840 }, memo: '병원 일찍 나감' },
]
export const OVERTIME: Overtime[] = [
  { staffId: 'm1', day: '2026-11-10', kind: 'night', minutes: 60 },
  { staffId: 'm2', day: '2026-11-11', kind: 'extended', minutes: 120 },
  { staffId: 'm3', day: '2026-11-12', kind: 'extended', minutes: 60 },
  { staffId: 'm4', day: '2026-11-15', kind: 'holiday', minutes: 240 },
  { staffId: 'm2', day: '2026-11-18', kind: 'extended', minutes: 120 },
  { staffId: 'm3', day: '2026-11-20', kind: 'extended', minutes: 90 },
]
export const leave = (staffId: string, day: string, kind: Leave['kind'], part: Leave['part'] = null): Leave => ({
  id: `l-${staffId}-${day}`,
  groupId: `g-${staffId}-${day}`,
  staffId,
  day,
  kind,
  part,
  paid: kind !== 'unpaid',
  memo: null,
})
export const LEAVES: Leave[] = [leave('m1', '2026-11-07', 'annual'), leave('m3', '2026-11-13', 'half', 'pm'), leave('m5', '2026-11-18', 'sick'), leave('m2', '2026-11-28', 'annual')]

export const inRange = <T extends { day: string }>(rows: readonly T[], range: DateRange) => rows.filter((r) => r.day >= range.from && r.day <= range.to)

type FakeStore = {
  listChanges: ReturnType<typeof vi.fn<StaffStore['listChanges']>>
  listOvertime: ReturnType<typeof vi.fn<StaffStore['listOvertime']>>
  listLeaves: ReturnType<typeof vi.fn<StaffStore['listLeaves']>>
  saveChange: ReturnType<typeof vi.fn<StaffStore['saveChange']>>
  saveOvertime: ReturnType<typeof vi.fn<StaffStore['saveOvertime']>>
  resetDay: ReturnType<typeof vi.fn<StaffStore['resetDay']>>
  savePlan: ReturnType<typeof vi.fn<StaffStore['savePlan']>>
}

/** 시험마다 새로 만드는 가짜 저장 층·공용 읽기 값. 시험은 kit.store·kit.base를 보고 바꾼다 */
export const kit = { store: {} as FakeStore, base: {} as StaffBase }

export function makeBase(state: StaffBase['state'] = 'ready'): StaffBase {
  const clinic: ClinicProfileView = {
    state: 'ready',
    profile: defaultProfile(),
    saved: true,
    signupName: '가짜의원',
    signupPhone: null,
    name: '가짜의원',
    logoDataUrl: null,
    reload: vi.fn(),
  }
  return {
    state,
    members: state === 'ready' ? MEMBERS : [],
    settings: defaultStaffSettings(),
    plans: state === 'ready' ? PLANS : [],
    clinic,
    store: kit.store as unknown as StaffStore,
    files: {} as StaffFileStore,
    reload: vi.fn(),
  }
}

/** beforeEach에서 부른다: 가짜 저장 층·공용 읽기 값을 새로 만들고 useStaffBase(시험 파일이 vi.mock한 것)가 kit.base를 주게 한다 */
export function resetKit() {
  kit.store = {
    listChanges: vi.fn(async (range: DateRange) => inRange(CHANGES, range)),
    listOvertime: vi.fn(async (range: DateRange) => inRange(OVERTIME, range)),
    listLeaves: vi.fn(async (range: DateRange) => inRange(LEAVES, range)),
    saveChange: vi.fn(async (change: DayChange) => change),
    saveOvertime: vi.fn(async () => undefined),
    resetDay: vi.fn(async () => undefined),
    savePlan: vi.fn(async (staffId: string, from: string, week: readonly DayShift[], sat: WeekPlan['sat']) => ({ id: 'new', staffId, from, week: [...week], sat })),
  }
  kit.base = makeBase()
  vi.mocked(useStaffBase).mockReset()
  vi.mocked(useStaffBase).mockImplementation(() => kit.base)
}

export const esc = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** 주 보기 칸 단추: 이름표가 '{이름} {M}월 {d}일 ({요일})'로 시작한다 */
export const cell = (name: string, day: string) => screen.getByRole('button', { name: new RegExp(`^${esc(`${name} ${day}`)}( |$)`) })
export const table = () => screen.getByRole('table', { name: '주 근무표' })

export async function renderWeek(today = TODAY) {
  render(<ScheduleScreen today={today} />)
  await screen.findByRole('table', { name: '주 근무표' })
}

export async function openMonth() {
  await renderWeek()
  fireEvent.click(within(screen.getByRole('group', { name: '보기' })).getByRole('button', { name: '달' }))
  await screen.findByRole('heading', { name: '11월 더 일한 시간' })
}

export async function openDialog(name: string, day: string) {
  fireEvent.click(cell(name, day))
  return screen.findByRole('dialog')
}

export async function openPlan(nameLabel = '김하늘 간호조무사 · 토 1·3주') {
  await renderWeek()
  fireEvent.click(screen.getByRole('button', { name: nameLabel }))
  return screen.getByRole('region', { name: '김하늘 — 기본 근무' })
}
export const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement
export const pressed = (group: HTMLElement) =>
  within(group)
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent)

export const stepper = (dialog: HTMLElement, kind: string) => within(dialog).getByRole('group', { name: kind })
export const shown = (dialog: HTMLElement, kind: string) => within(stepper(dialog, kind)).getByRole('status').textContent

