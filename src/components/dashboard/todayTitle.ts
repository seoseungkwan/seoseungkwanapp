import { weekdayOf } from '@/lib/analytics/dates'

// 대시보드 제목의 날짜 글자: '2026-10-28' → '2026년 10월 28일 (수)' (AC-009.1). 화면 제목은 "오늘" + 이 값.
// 요일·날짜 검사는 dates.ts 한 곳(weekdayOf가 'YYYY-MM-DD'가 아니거나 없는 날이면 RangeError)
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일

export function koreanDateTitle(ymd: string): string {
  const weekday = WEEKDAYS[weekdayOf(ymd) - 1]
  const [year, month, day] = ymd.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일 (${weekday})`
}
