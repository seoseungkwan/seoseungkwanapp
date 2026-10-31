import { addDays, monthOf, weekdayOf } from '@/lib/analytics/dates'

// 대시보드 맨 위 날짜 줄 글자 (tab-frame AC-306.1, design.md '대시보드 짜임', 메모 §3 '날짜 줄').
// '2026-10-31' → { date: '10월 31일 토요일', note: '이번 달 마지막 날' } · '2026-10-29' → { date: '10월 29일 목요일', note: null }
// 날짜 검사·요일·다음 날은 dates.ts 한 곳(weekdayOf는 'YYYY-MM-DD'가 아니거나 없는 날이면 RangeError)
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일

export function dateLine(today: string): { date: string; note: string | null } {
  const weekday = WEEKDAYS[weekdayOf(today) - 1]
  const month = Number(today.slice(5, 7))
  const day = Number(today.slice(8, 10))
  // 다음 날이 다른 달이면 오늘이 그 달 마지막 날(2월 28·29일, 12월 31일 포함)
  const lastDay = monthOf(addDays(today, 1)) !== monthOf(today)
  return { date: `${month}월 ${day}일 ${weekday}요일`, note: lastDay ? '이번 달 마지막 날' : null }
}
