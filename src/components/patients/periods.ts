import { addDays, isYmd, weekdayOf, weekStartOf } from '@/lib/analytics/dates'

// F/U 기간 단추와 날짜 글자(AC-611.1, 목업 fuRange·md·rangeLabel). 주는 월~일이다(docs/mockups/patients/README.md). '오늘'은 인자로 받는다
export type PeriodPreset = 'tomorrow' | 'thisWeek' | 'nextWeek' | 'custom'
export type Period = { from: string; to: string }

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

export function presetRange(p: Exclude<PeriodPreset, 'custom'>, today: string): Period {
  if (p === 'tomorrow') {
    const tomorrow = addDays(today, 1)
    return { from: tomorrow, to: tomorrow }
  }
  const monday = addDays(weekStartOf(today), p === 'thisWeek' ? 0 : 7)
  return { from: monday, to: addDays(monday, 6) }
}

/** 직접 기간. 끝이 시작보다 앞이면 시작 하루다 */
export function customRange(from: string, to: string): Period {
  return { from, to: to < from ? from : to }
}

/** '11월 5일 (목)'. 날짜가 아닌 값은 그대로 돌려준다: 그리면서 던지면 전체 오류 화면으로 간다 */
export function dayLabel(date: string): string {
  if (!isYmd(date)) return date
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${WEEKDAYS[weekdayOf(date) - 1]})`
}

export function rangeLabel({ from, to }: Period): string {
  return from === to ? dayLabel(from) : `${dayLabel(from)} ~ ${dayLabel(to)}`
}
