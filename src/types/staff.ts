// 직원 탭 형(spec staff design.md 3절). DB 표 staff_*(design.md 1절)의 칸을 앱 이름(camelCase)으로 옮긴 것이다.
// 시간은 하루 0시부터의 분(10분 단위), 날짜는 'YYYY-MM-DD', 달은 'YYYY-MM', 금액은 원 단위 정수다. 주민번호 칸은 어디에도 없다(ADR-039).
// lib/staff/* 순수 함수는 이 파일을 불러오지 않고 같은 칸 이름의 자기 입력 형을 둔다(design.md 3절)

export const STAFF_JOBS = ['간호사', '간호조무사', '물리치료사', '방사선사', '원무', '기타'] as const
export type StaffJob = (typeof STAFF_JOBS)[number]
export type Employment = 'regular' | 'contract' | 'part'
export type DayShift = { start: number; end: number; lunchFrom: number | null; lunchTo: number | null } | null // 분, 10분 단위, null = 쉼
export type SatRotation = 'every' | '1-3' | '2-4'
export type WeekPlan = { id: string; staffId: string; from: string; week: DayShift[] /* 7칸 월~일 */; sat: SatRotation }
export type StaffMember = {
  id: string
  name: string
  job: StaffJob
  jobOther: string | null
  employment: Employment
  weeklyHours: number
  hiredOn: string
  leftOn: string | null
  phone: string | null
  birthday: string | null
  address: string | null
  bank: string | null
  accountNo: string | null
  calendarStaffId: string | null
  memo: string | null
  usedBefore: number
  usedBeforeFrom: string | null
  carryStart: number // 넘어온 연차 시작 값 −30~100, 0.5 단위('carry' 병원 셈의 시작 기간 넘어옴, AC-7604.9)
  registeredOn: string // 웹앱에 처음 넣은 날 — DB가 정한다(읽기만, 보내지 않는다 AC-7610.7)
}
export type DayChange = { staffId: string; day: string; shift: DayShift; memo: string | null }
export type OvertimeKind = 'extended' | 'night' | 'holiday'
export type Overtime = { staffId: string; day: string; kind: OvertimeKind; minutes: number }
export type LeaveKind = 'annual' | 'half' | 'family' | 'sick' | 'maternity' | 'unpaid'
export type Leave = { id: string; groupId: string; staffId: string; day: string; kind: LeaveKind; part: 'am' | 'pm' | null; paid: boolean; memo: string | null }
export type LeaveBasis = 'hire' | 'jan1'
export type Leftover = 'pay' | 'carry'
export type PayItem = { id: string; name: string; kind: 'amount' | 'incentive'; base: boolean; removedFrom: string | null }
export type StaffSettings = { leaveBasis: LeaveBasis; leftover: Leftover; payItems: PayItem[] }
export type IncentiveMethod = 'per_case' | 'percent' | 'fixed'
export type IncentiveRule = { id: string; staffId: string; name: string; method: IncentiveMethod; unitAmount: number | null; percent: number | null; sort: number }
export type IncentiveEntry = {
  ruleId: string | null
  name: string
  method: IncentiveMethod
  unitAmount: number | null
  percent: number | null
  count: number | null
  sales: number | null
}
export type AdjustReason = 'prorate' | 'deduct' | 'other'
export type PayLine = {
  id: string | null
  month: string
  staffId: string | null
  amounts: Record<string, number>
  incentives: IncentiveEntry[]
  adjust: number
  adjustReason: AdjustReason | null
  adjustMemo: string | null
}
export type PayMonth = { month: string; employerCost: number | null; costSavedOn: string | null; copiedOn: string | null }
export type StaffFile = {
  id: string
  kind: 'doc' | 'tax'
  staffId: string | null
  month: string | null
  name: string
  path: string
  size: number
  mime: string
  createdAt: string
}

// ── 값 목록(DB check와 같다) ────────────────────────────────

export const EMPLOYMENTS: readonly Employment[] = ['regular', 'contract', 'part']
export const SAT_ROTATIONS: readonly SatRotation[] = ['every', '1-3', '2-4']
export const OVERTIME_KINDS: readonly OvertimeKind[] = ['extended', 'night', 'holiday']
export const LEAVE_KINDS: readonly LeaveKind[] = ['annual', 'half', 'family', 'sick', 'maternity', 'unpaid']
export const INCENTIVE_METHODS: readonly IncentiveMethod[] = ['per_case', 'percent', 'fixed']
export const ADJUST_REASONS: readonly AdjustReason[] = ['prorate', 'deduct', 'other']

/** 설정 줄이 없을 때의 급여 항목(design.md 1절 pay_items 기본값과 같다). 쓰는 쪽은 복사해 쓴다 */
export const DEFAULT_PAY_ITEMS: readonly PayItem[] = [
  { id: 'base', name: '기본급', kind: 'amount', base: true, removedFrom: null },
  { id: 'overtime', name: '연장수당', kind: 'amount', base: true, removedFrom: null },
  { id: 'meal', name: '식대', kind: 'amount', base: true, removedFrom: null },
  { id: 'incentive', name: '인센티브', kind: 'incentive', base: true, removedFrom: null },
  { id: 'bonus', name: '상여', kind: 'amount', base: true, removedFrom: null },
]

/** 직원 서류·세무사 파일 비공개 바구니(design.md 1절 '바구니') */
export const STAFF_FILES_BUCKET = 'staff-files'

/**
 * 직원 탭 오류 번호(AC-7610.1). 문구는 lib/errors.ts에 있다.
 * 번호 타입 ErrorCode(src/types/errors.ts)는 이 TASK의 고칠 파일 밖이라, 그쪽에 더해질 때까지 이 형으로 함께 받는다(lib/errors.ts KnownErrorCode)
 */
export const STAFF_ERROR_CODES = ['E-STAFF-READ-FAILED', 'E-STAFF-SAVE-FAILED', 'E-STAFF-FILE-FAILED', 'E-STAFF-EXCEL-FAILED', 'E-STAFF-IMAGE-FAILED'] as const
export type StaffErrorCode = (typeof STAFF_ERROR_CODES)[number]
