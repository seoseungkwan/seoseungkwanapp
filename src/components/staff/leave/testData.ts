import { vi } from 'vitest'
import { eachDay } from '@/lib/analytics/dates'
import { defaultProfile } from '@/lib/storage/clinicProfile'
import { defaultStaffSettings, type LeaveDraft } from '@/lib/storage/staff'
import type { ClinicProfile } from '@/types/clinicProfile'
import type { DayChange, DayShift, Leave, LeaveKind, StaffMember, StaffSettings, WeekPlan } from '@/types/staff'

// 휴가 화면 시험이 같이 쓰는 보기 자료(staff requirements.md '보기 자료', 지어낸 사람). 시험만 불러온다 — 화면 코드는 이 파일을 쓰지 않는다.
// 오늘 2026-11-21(토), 입사일 기준 · 못 쓴 연차는 수당으로 정산. 휴가 목록은 lib/staff/leave.test.ts의 AC-7604.8 보기와 같다
// (이도윤 이번 기간은 시안 휴가 ④ 목록 그대로, 11-28은 넣기 전). 예약 시행자와 이어진 사람은 이도윤 (이)·박서연 (박)

export const TODAY = '2026-11-21'

export function member(id: string, name: string, over: Partial<StaffMember> = {}): StaffMember {
  return {
    id,
    name,
    job: '물리치료사',
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
    carryStart: 0,
    registeredOn: '2000-01-01', // 웹앱 등록일 — 가장 이른 입사일보다 앞이라 연차 셈은 지금 숫자 그대로(AC-7604.9)
    ...over,
  }
}

export const KIM = member('m-kim', '김하늘', { job: '간호조무사', hiredOn: '2021-03-02' })
export const LEE = member('m-lee', '이도윤', { hiredOn: '2023-07-17', calendarStaffId: 'cal-lee' })
export const PARK = member('m-park', '박서연', { hiredOn: '2025-01-06', calendarStaffId: 'cal-park' })
export const CHOI = member('m-choi', '최민준', { job: '방사선사', hiredOn: '2019-11-25', usedBefore: 10, usedBeforeFrom: '2025-11-25' })
export const JUNG = member('m-jung', '정유나', { job: '원무', employment: 'part', weeklyHours: 24, hiredOn: '2024-09-02' })
export const HAN = member('m-han', '한지우', { job: '원무', employment: 'contract', hiredOn: '2026-02-02' })
export const OH = member('m-oh', '오세린', { job: '간호사', hiredOn: '2020-03-02', leftOn: '2024-05-31' })
export const MOON = member('m-moon', '문태호', { job: '원무', hiredOn: '2019-04-01', leftOn: '2022-12-31' })

/** useStaffBase 차례(입사일 빠른 사람부터, 퇴사자 포함) */
export const MEMBERS: StaffMember[] = [MOON, CHOI, OH, KIM, LEE, JUNG, PARK, HAN]

let seq = 0
type LeaveOver = { part?: 'am' | 'pm'; paid?: boolean; memo?: string; groupId?: string }
export function leave(staffId: string, day: string, kind: LeaveKind = 'annual', over: LeaveOver = {}): Leave {
  seq += 1
  return {
    id: `lv-${seq}`,
    groupId: over.groupId ?? `g-${seq}`,
    staffId,
    day,
    kind,
    part: kind === 'half' ? (over.part ?? 'am') : null,
    paid: kind === 'sick' ? (over.paid ?? true) : kind !== 'unpaid',
    memo: over.memo ?? null,
  }
}
/** 여러 날 한 묶음(묶음 id = run-{직원}-{시작}) */
export function run(staffId: string, from: string, to: string, kind: LeaveKind = 'annual', memo?: string): Leave[] {
  const groupId = `run-${staffId}-${from}`
  return eachDay({ from, to }).map((day) => leave(staffId, day, kind, { groupId, memo }))
}

export const LEAVES: Leave[] = [
  // 김하늘 17/9.5/7.5
  leave('m-kim', '2026-02-20'),
  leave('m-kim', '2026-03-20'),
  leave('m-kim', '2026-05-04'),
  leave('m-kim', '2026-05-06'),
  leave('m-kim', '2026-06-01', 'sick'),
  leave('m-kim', '2026-06-15', 'half', { part: 'am' }),
  ...run('m-kim', '2026-08-10', '2026-08-12'),
  leave('m-kim', '2026-09-25', 'half', { part: 'pm' }),
  leave('m-kim', '2026-10-02'),
  leave('m-kim', '2026-10-16', 'half', { part: 'am' }),
  leave('m-kim', '2026-11-07'),
  // 이도윤 지난 기간 13일
  ...run('m-lee', '2025-08-04', '2025-08-08'),
  leave('m-lee', '2025-10-10'),
  leave('m-lee', '2025-12-24'),
  leave('m-lee', '2025-12-26'),
  ...run('m-lee', '2026-02-16', '2026-02-18'),
  leave('m-lee', '2026-05-25'),
  leave('m-lee', '2026-07-15', 'half', { part: 'am' }),
  leave('m-lee', '2026-07-16', 'half', { part: 'pm' }),
  // 이도윤 이번 기간(시안 ④): 연차·반차 6일 + 경조사 1일
  leave('m-lee', '2026-07-31'),
  ...run('m-lee', '2026-08-03', '2026-08-05', 'annual', '여름 휴가'),
  leave('m-lee', '2026-09-07', 'annual', { memo: '이사' }),
  leave('m-lee', '2026-09-18', 'family', { memo: '형 결혼' }),
  leave('m-lee', '2026-10-12', 'half', { part: 'am', memo: '병원 진료' }),
  leave('m-lee', '2026-10-23', 'half', { part: 'pm' }),
  // 박서연 15/3/12
  leave('m-park', '2025-08-01'),
  leave('m-park', '2026-03-09'),
  leave('m-park', '2026-07-20'),
  leave('m-park', '2026-09-14', 'half', { part: 'am' }),
  leave('m-park', '2026-11-13', 'half', { part: 'pm' }),
  // 최민준 17/14/3 (올해 이미 쓴 10 + 4)
  leave('m-choi', '2026-03-03'),
  leave('m-choi', '2026-06-08'),
  leave('m-choi', '2026-09-21', 'half', { part: 'am' }),
  leave('m-choi', '2026-10-05', 'half', { part: 'pm' }),
  leave('m-choi', '2026-11-10'),
  // 정유나 9/2/7
  leave('m-jung', '2026-10-08'),
  leave('m-jung', '2026-11-05', 'half', { part: 'am' }),
  leave('m-jung', '2026-11-06', 'half', { part: 'pm' }),
  leave('m-jung', '2026-11-18', 'sick'),
  // 한지우 9/4/5
  leave('m-han', '2026-05-15'),
  leave('m-han', '2026-07-27'),
  leave('m-han', '2026-07-28'),
  leave('m-han', '2026-10-30', 'half', { part: 'am' }),
  leave('m-han', '2026-11-20', 'half', { part: 'pm' }),
]

const DAY: DayShift = { start: 540, end: 1080, lunchFrom: 780, lunchTo: 840 }
const SAT: DayShift = { start: 540, end: 780, lunchFrom: null, lunchTo: null }
const plan = (staffId: string, from: string, sat: WeekPlan['sat']): WeekPlan => ({
  id: `plan-${staffId}`,
  staffId,
  from,
  week: [DAY, DAY, DAY, DAY, DAY, SAT, null],
  sat,
})
/** 기본 근무: 월~금 09–18, 토 09–13(김하늘 매주 · 이도윤 2·4주 · 나머지 1·3주), 일 쉼 */
export const PLANS: WeekPlan[] = [
  plan('m-kim', KIM.hiredOn, 'every'),
  plan('m-lee', LEE.hiredOn, '2-4'),
  plan('m-park', PARK.hiredOn, '1-3'),
  plan('m-choi', CHOI.hiredOn, '1-3'),
  plan('m-jung', JUNG.hiredOn, '1-3'),
  plan('m-han', HAN.hiredOn, '1-3'),
]

/** 병원 정보: 기본 진료시간(일요일 휴진) + 예약 시행자 둘 */
export function clinicProfile(over: Partial<ClinicProfile> = {}): ClinicProfile {
  return {
    ...defaultProfile(),
    staff: [
      { id: 'cal-lee', name: '이도윤', role: 'staff', mark: '이', color: 'blue', calendar: true },
      { id: 'cal-park', name: '박서연', role: 'staff', mark: '박', color: 'teal', calendar: true },
    ],
    ...over,
  }
}

/** 가짜 저장 층(휴가 화면이 부르는 것만). 넣기는 받은 줄에 id·묶음 id를 붙여 돌려준다 */
export function fakeStore() {
  const saved = (rows: readonly LeaveDraft[], groupId = 'g-new'): Leave[] => rows.map((row, i) => ({ ...row, id: `new-${i}`, groupId }))
  return {
    listLeaves: vi.fn(async (): Promise<Leave[]> => LEAVES),
    listChanges: vi.fn(async (): Promise<DayChange[]> => []),
    addLeaveGroup: vi.fn(async (rows: readonly LeaveDraft[]) => saved(rows)),
    replaceLeaveGroup: vi.fn(async (groupId: string, rows: readonly LeaveDraft[]) => saved(rows, groupId)),
    deleteLeaveGroup: vi.fn(async (): Promise<void> => undefined),
    countAppts: vi.fn(async (): Promise<{ day: string; count: number }[]> => []),
    saveSettings: vi.fn(async (settings: StaffSettings) => settings),
  }
}

/** useStaffBase가 주는 값의 가짜(읽기 끝남). 시험마다 칸을 바꿔 쓴다 */
export function makeBase() {
  return {
    state: 'ready' as 'loading' | 'ready' | 'failed',
    members: MEMBERS,
    settings: defaultStaffSettings(),
    plans: PLANS,
    clinic: {
      state: 'ready' as const,
      profile: clinicProfile(),
      saved: true,
      signupName: '가나 정형외과의원',
      signupPhone: null,
      name: '가나 정형외과의원',
      logoDataUrl: null,
      reload: vi.fn(),
    },
    store: fakeStore(),
    files: {},
    reload: vi.fn(),
  }
}
