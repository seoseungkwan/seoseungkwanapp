import { weekdayOf } from '@/lib/analytics/dates'
import { calendarRange } from '@/lib/clinic/format'
import type { CalSettings, CalStaff } from '@/types/calendar'
import type { ClinicProfile, DayHours } from '@/types/clinicProfile'

// 예약이 병원 정보를 쓴다(spec clinic-profile REQ-6603, design.md 5절). 환자 자료 구역(lib/calendar)이라 형만 받는 순수 함수다:
// 병원 정보는 화면 훅(useCalendarData·useStatsCalendar)이 loadClinicProfile로 읽어 넘긴다(실패·없음은 null).
// 돌려주는 값은 새로 만든다(받은 예약 설정·병원 정보를 고치지 않는다)

const SUNDAY = 6 // hours·days 칸 차례: 월(0)~일(6)

const copyDay = (day: DayHours): DayHours => (day === null ? null : { ...day })

/** 병원 정보가 없을 때 요일 진료시간: 월~토(일요일 보기면 일요일도) openHour~closeHour·점심 없음, 나머지는 휴진 요일(null) */
export function plainDays(openHour: number, closeHour: number, sunday: boolean): DayHours[] {
  return Array.from({ length: 7 }, (_, i) => (i < SUNDAY || sunday ? { open: openHour * 60, close: closeHour * 60, lunchFrom: null, lunchTo: null } : null))
}

/** 그 요일(weekdayOf: 1=월 … 7=일)에 문을 여나. days가 없으면 지금처럼 월~토, 일요일은 일요일 보기일 때만 */
export function opensOn(settings: Pick<CalSettings, 'sunday' | 'days'>, weekday: number): boolean {
  if (settings.days) return (settings.days[weekday - 1] ?? null) !== null
  return weekday !== 7 || settings.sunday
}

/** 그날의 진료시간. days가 없으면 undefined(그리는 쪽은 회색 없이 그린다), 휴진 요일은 null */
export function hoursOn(settings: Pick<CalSettings, 'days'>, day: string): DayHours | undefined {
  return settings.days ? (settings.days[weekdayOf(day) - 1] ?? null) : undefined
}

/** 휴진일(closedDates)이거나 휴진 요일이면 참 — 머리에 '휴진', 열 전체 회색(예약은 넣을 수 있다) */
export function isClosedOn(settings: Pick<CalSettings, 'days' | 'closedDates'>, day: string): boolean {
  return (settings.closedDates ?? []).includes(day) || hoursOn(settings, day) === null
}

/**
 * 예약 설정 + 병원 정보. 병원 정보가 있으면 시행자 = '예약에 보이기'인 사람(병원 정보 차례)·시간 줄 = calendarRange·
 * 일요일 = 일요일이 문 여는 날·요일 진료시간과 휴진일 = 병원 정보. 없으면(null) 예약 설정 그대로 + plainDays·휴진일 없음. 종류는 늘 예약 설정이다
 */
export function mergeClinic(cal: CalSettings, profile: ClinicProfile | null): CalSettings {
  const kinds = cal.kinds.map((kind) => ({ ...kind }))
  if (profile === null) {
    return {
      kinds,
      staff: cal.staff.map((person) => ({ ...person })),
      openHour: cal.openHour,
      closeHour: cal.closeHour,
      sunday: cal.sunday,
      days: plainDays(cal.openHour, cal.closeHour, cal.sunday),
      closedDates: [],
    }
  }
  const staff: CalStaff[] = profile.staff.filter((person) => person.calendar).map(({ id, name, mark, color }) => ({ id, name, mark, color }))
  const { openHour, closeHour } = calendarRange(profile.hours)
  return {
    kinds,
    staff,
    openHour,
    closeHour,
    sunday: profile.hours[SUNDAY] !== null,
    days: profile.hours.map(copyDay),
    closedDates: [...profile.closedDates],
  }
}
