// 직원 탭 화면이 함께 쓰는 글자와 휴가 색 (staff design.md 6절 '공용'). 글자는 요구사항·시안 글자 그대로다.
// 같은 Phase의 형 파일(types/staff.ts)을 기다리지 않게 열쇠 형을 여기 따로 적는다 — 이름·값은 design.md 3절과 같아 그대로 넘긴다.
// 휴가 색은 예약 달력 색 토큰(globals.css --cal-*)을 빌린다(시안 leave.html '휴가 종류 색'). Tailwind가 찾게 클래스 이름은 통째로 적는다

type EmploymentKey = 'regular' | 'contract' | 'part'
type LeaveKindKey = 'annual' | 'half' | 'family' | 'sick' | 'maternity' | 'unpaid'
type IncentiveMethodKey = 'per_case' | 'percent' | 'fixed'
type OvertimeKindKey = 'extended' | 'night' | 'holiday'

/** 근무 형태(AC-7612.3) */
export const EMPLOYMENT_LABEL: Record<EmploymentKey, string> = { regular: '정규직', contract: '계약직', part: '파트타임' }

/** 직종 글자: '기타'면 직접 적은 직종(비면 '기타') */
export function jobLabel({ job, jobOther }: { job: string; jobOther: string | null }): string {
  return job === '기타' && jobOther ? jobOther : job
}

/** 휴가 종류(AC-7614.2·AC-7614.3) */
export const LEAVE_KIND_LABEL: Record<LeaveKindKey, string> = {
  annual: '연차',
  half: '반차',
  family: '경조사',
  sick: '병가',
  maternity: '출산·육아휴직',
  unpaid: '무급(결근)',
}

/** 휴가 한 줄의 글자: 반차는 '오전 반차'·'오후 반차'(AC-7614.2) */
export function leaveLabel(kind: LeaveKindKey, part: 'am' | 'pm' | null): string {
  if (kind === 'half' && part !== null) return part === 'am' ? '오전 반차' : '오후 반차'
  return LEAVE_KIND_LABEL[kind]
}

/** 인센티브 방식(AC-7615.5) */
export const INCENTIVE_METHOD_LABEL: Record<IncentiveMethodKey, string> = { per_case: '건당 정액', percent: '매출의 %', fixed: '고정 수당' }

/** 더 일한 시간 종류(AC-7613.4) — 근무표·급여·명세서가 같이 쓴다 */
export const OVERTIME_KIND_LABEL: Record<OvertimeKindKey, string> = { extended: '연장', night: '야간', holiday: '휴일' }

// 휴가 칩: 옅은 바탕 + 진한 글자 + 왼쪽 3px 띠(시안 .lv), 칸보다 길면 말줄임
const leaveChip = 'inline-block max-w-full truncate rounded-control border-l-3 px-1.5 align-middle text-caption font-semibold'

/** 휴가 종류 칩 클래스(AC-7614.2): 연차 파랑·반차 청록·경조사 보라·병가 분홍·출산·육아휴직 초록·무급(결근) 회색 점선 */
export const LEAVE_CHIP: Record<LeaveKindKey, string> = {
  annual: `${leaveChip} border-cal-blue bg-cal-blue-soft text-cal-blue`,
  half: `${leaveChip} border-cal-teal bg-cal-teal-soft text-cal-teal`,
  family: `${leaveChip} border-cal-purple bg-cal-purple-soft text-cal-purple`,
  sick: `${leaveChip} border-cal-pink bg-cal-pink-soft text-cal-pink`,
  maternity: `${leaveChip} border-cal-forest bg-cal-forest-soft text-cal-forest`,
  unpaid: `${leaveChip} border border-dashed border-cal-gray bg-cal-gray-soft text-cal-gray`,
}
