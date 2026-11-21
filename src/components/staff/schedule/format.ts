import { weekdayOf } from '@/lib/analytics/dates'
import type { DayKind } from '@/lib/staff/schedule'
import type { DayHours } from '@/types/clinicProfile'
import type { DayShift, SatRotation } from '@/types/staff'

// 근무표 화면 글자 (staff REQ-7613, 시안 docs/mockups/staff/schedule.html). 셈 파일(lib/staff/schedule.ts)에 없는 화면 글만 둔다.
// 시간은 0시부터 분, 날짜는 'YYYY-MM-DD', 요일 칸은 월(0)~일(6)

export type Shift = NonNullable<DayShift>
/** 병원 정보의 요일 진료시간(점심 포함)과 휴진일 — lib/staff/schedule.ts DayCtx로 그대로 넘긴다 */
export type ClinicCtx = { hours: readonly DayHours[]; closedDates: readonly string[] }

/** 병원 진료시간 하루 → 근무 칸(휴진 요일은 null) */
export const clinicShift = (hours: DayHours): DayShift =>
  hours === null ? null : { start: hours.open, end: hours.close, lunchFrom: hours.lunchFrom, lunchTo: hours.lunchTo }

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
const SATURDAY_INDEX = 5

const pad = (n: number) => String(n).padStart(2, '0')
const monthNum = (day: string) => Number(day.slice(5, 7))
export const dateNum = (day: string) => Number(day.slice(8, 10))
/** 요일 한 글자 */
export const weekdayName = (day: string) => WEEKDAYS[weekdayOf(day) - 1]!

/** 분 → 'HH:MM' */
export const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
// 칸 글의 시각: 정각은 '09', 아니면 '09:30'
const short = (minutes: number) => (minutes % 60 === 0 ? pad(minutes / 60) : clock(minutes))
/** 칸 글 '09–18' · '09:30–18' */
export const cellTime = (start: number, end: number) => `${short(start)}–${short(end)}`

/** '11월 18일 (수)' */
export const dayTitle = (day: string) => `${monthNum(day)}월 ${dateNum(day)}일 (${weekdayName(day)})`
/** '18일 (수)' */
export const shortDay = (day: string) => `${dateNum(day)}일 (${weekdayName(day)})`
/** 'YYYY-MM' → '2026년 11월' */
export const monthTitle = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`
/** 'YYYY-MM' → '11월' */
export const monthName = (month: string) => `${Number(month.slice(5, 7))}월`

/** 주 기간 '11월 16일 (월) ~ 22일 (일)'(달이 바뀌면 끝에도 달) */
export function weekRangeText(from: string, to: string): string {
  return monthNum(from) === monthNum(to) ? `${dayTitle(from)} ~ ${shortDay(to)}` : `${dayTitle(from)} ~ ${dayTitle(to)}`
}

/** 쉬는 날 이름: 휴진(병원 휴진일·휴진 요일)이 먼저, 그다음 공휴일. 보통 날은 null */
export function restName(kind: DayKind): '휴진' | '공휴일' | null {
  return kind.closed ? '휴진' : kind.holiday ? '공휴일' : null
}

// 요일 칸 번호들 → '월~금' · '월·수·금' · '월~수·금'(이어진 세 요일부터 ~)
function dayNames(indexes: readonly number[]): string {
  const parts: string[] = []
  let i = 0
  while (i < indexes.length) {
    let j = i
    while (j + 1 < indexes.length && indexes[j + 1] === indexes[j]! + 1) j++
    if (j - i >= 2) parts.push(`${WEEKDAYS[indexes[i]!]}~${WEEKDAYS[indexes[j]!]}`)
    else for (let k = i; k <= j; k++) parts.push(WEEKDAYS[indexes[k]!]!)
    i = j + 1
  }
  return parts.join('·')
}

const SAT_SHORT: Record<Exclude<SatRotation, 'every'>, string> = { '1-3': '토 1·3주', '2-4': '토 2·4주' }

/**
 * 주 보기 이름 아래 일하는 요일(시안 ①): 격주 토요일이 있으면 '토 1·3주'·'토 2·4주'(평일이 월~금이면 그것만, 아니면 '월·수·금 · 토 1·3주'),
 * 없으면 일하는 요일 '월·수·금'·'월~금'·'월~토'. 기본 근무가 없거나 일하는 요일이 없으면 null
 */
export function workDaysText(plan: { week: readonly DayShift[]; sat: SatRotation } | null): string | null {
  if (plan === null) return null
  const worked = plan.week.flatMap((shift, index) => (shift !== null ? [index] : []))
  const rotation = worked.includes(SATURDAY_INDEX) && plan.sat !== 'every' ? SAT_SHORT[plan.sat] : null
  if (rotation === null) return worked.length > 0 ? dayNames(worked) : null
  const others = worked.filter((index) => index !== SATURDAY_INDEX)
  if (others.join() === '0,1,2,3,4' || others.length === 0) return rotation
  return `${dayNames(others)} · ${rotation}`
}

/** 창 머리 아래 '기본 근무 09:00~18:00 · 점심 13:00~14:00'(점심 없으면 '· 점심 없음', 쉬는 날은 '기본 근무 쉼') */
export function baseShiftText(shift: DayShift): string {
  if (shift === null) return '기본 근무 쉼'
  const lunch = shift.lunchFrom !== null && shift.lunchTo !== null ? `${clock(shift.lunchFrom)}~${clock(shift.lunchTo)}` : '없음'
  return `기본 근무 ${clock(shift.start)}~${clock(shift.end)} · 점심 ${lunch}`
}

/**
 * 반차인 날 일한 반나절(시안 ① '09–13' + 칩): 오후 반차는 시작 ~ 점심 시작, 오전 반차는 점심 끝 ~ 끝.
 * 점심이 없으면 13:00(Claude가 정한 것 7과 같은 경계). 남는 시간이 없으면 null
 */
export function halfWorked(shift: Shift, part: 'am' | 'pm' | null): { start: number; end: number } | null {
  const noon = 13 * 60
  const start = part === 'am' ? Math.max(shift.start, shift.lunchTo ?? noon) : shift.start
  const end = part === 'am' ? shift.end : Math.min(shift.end, shift.lunchFrom ?? noon)
  return start < end ? { start, end } : null
}
