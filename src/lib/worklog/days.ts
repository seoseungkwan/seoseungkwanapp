import { addDays, compareYmd, isYmd, weekdayOf } from '@/lib/analytics/dates'

// 업무일지 날짜 이동·자정 넘김·날짜 칸 글자. 날짜 계산은 dates.ts만 쓴다(Date로 더하거나 빼지 않는다)

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일

// h23: 자정을 '24:00'이 아니라 '00:00'으로
const KOREA_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function previousDay(ymd: string): string {
  return addDays(ymd, -1)
}

// 오늘을 넘지 않는다. 오늘이면 null
export function nextDay(ymd: string, today: string): string | null {
  return compareYmd(ymd, today) < 0 ? addDays(ymd, 1) : null
}

// 날짜 모양이 아니거나 오늘보다 뒤면 오늘
export function clampToToday(input: string, today: string): string {
  return isYmd(input) && compareYmd(input, today) <= 0 ? input : today
}

// 화면을 연 채 한국 날짜가 바뀔 때: 옛 오늘을 보고 있었으면 새 오늘, 지난 날을 보고 있었으면 그대로
export function dayAfterRollover(selected: string, oldToday: string, newToday: string): string {
  return selected === oldToday ? newToday : selected
}

// 엑셀 서식 yyyy/mm/dd aaa: '2026/10/28 수'
export function sheetDateText(ymd: string): string {
  return `${ymd.replace(/-/g, '/')} ${WEEKDAYS[weekdayOf(ymd) - 1]}`
}

// '14:05'. PC 시간대와 상관없이 한국 시각
export function savedTimeText(at: Date): string {
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(at).map((p) => [p.type, p.value]))
  return `${parts.hour}:${parts.minute}`
}
