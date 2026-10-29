import { todayInKorea, weekdayOf } from '@/lib/analytics/dates'

// 위쪽 띠 한국 시각: '2026년 10월 29일 (목) 09:42 (KST)' (AC-008.6).
// 날짜는 dates.ts 한 곳(todayInKorea·weekdayOf), 시각은 Asia/Seoul로 읽는다 → 서버·PC 시간대와 상관없다
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일

// h23: 자정을 '24:00'이 아니라 '00:00'으로
const KOREA_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function kstNow(now: Date): string {
  const ymd = todayInKorea(now)
  const [year, month, day] = ymd.split('-').map(Number)
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(now).map((p) => [p.type, p.value]))
  return `${year}년 ${month}월 ${day}일 (${WEEKDAYS[weekdayOf(ymd) - 1]}) ${parts.hour}:${parts.minute} (KST)`
}
