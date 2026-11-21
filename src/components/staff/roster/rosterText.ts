import { weekdayOf } from '@/lib/analytics/dates'
import { leaveStatus, type LeaveStatus } from '@/lib/staff/leave'
import { StaffStoreError } from '@/lib/storage/staff'
import type { ErrorCode } from '@/types/errors'
import type { Employment, Leave, StaffMember, StaffSettings } from '@/types/staff'

// 명단 화면 글자·셈 도우미(staff REQ-7612). 셈은 lib/staff를 부르고, 여기서는 화면 글자로만 바꾼다

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf 1=월 … 7=일

/** 요일 한 글자 */
export const weekdayName = (ymd: string) => WEEKDAYS[weekdayOf(ymd) - 1]!

/** 일수 '3일'·'7.5일' */
export const daysText = (days: number) => `${days}일`

/** 1,000,000바이트 이상은 소수 한 자리 MB, 아래는 KB(1,000바이트, 1KB 밑은 1KB). 둘 다 버린다 */
export function sizeText(bytes: number): string {
  if (bytes >= 1_000_000) return `${Math.floor(bytes / 1_000_000)}.${Math.floor(bytes / 100_000) % 10}MB`
  return `${Math.max(1, Math.floor(bytes / 1_000))}KB`
}

/** 받침이 있으면 '이', 없으면 '가'를 붙인다('주소가'·'생일이'). 한글이 아니면 '가' */
export function withSubject(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  const hangul = code >= 0xac00 && code <= 0xd7a3
  return `${word}${hangul && (code - 0xac00) % 28 !== 0 ? '이' : '가'}`
}

/** 재직 = 퇴사일이 없거나 오늘(포함) 이후(lib/staff/roster.ts와 같다) */
export const isActive = (member: Pick<StaffMember, 'leftOn'>, today: string) => member.leftOn === null || member.leftOn >= today

/** 그 사람 지금 연차(lib/staff/leave.ts). 셈이 던지면 null */
export function statusOf(member: StaffMember, leaves: readonly Leave[], settings: StaffSettings, today: string): LeaveStatus | null {
  try {
    return leaveStatus({ person: member, leaves, basis: settings.leaveBasis, leftover: settings.leftover, today })
  } catch {
    return null
  }
}

type PeriodPerson = { employment: Employment; weeklyHours: number; hiredOn: string; leftOn: string | null }

/** 오늘이 든 연차 기간 시작일 — '올해 이미 쓴 연차'를 이 날과 함께 저장한다(AC-7608.5) */
export function periodStartOf(person: PeriodPerson, settings: StaffSettings, today: string): string {
  return leaveStatus({ person: { ...person, usedBefore: 0, usedBeforeFrom: null }, leaves: [], basis: settings.leaveBasis, leftover: settings.leftover, today }).period.from
}

/** 저장 층이 던진 번호(아니면 fallback). 오류 글은 보이지 않는다 */
export function codeOf(error: unknown, fallback: ErrorCode): ErrorCode {
  return error instanceof StaffStoreError ? error.code : fallback
}
