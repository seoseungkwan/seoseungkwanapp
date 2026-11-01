import { addDays, weekdayOf } from '@/lib/analytics/dates'

// 문자 문구에 날짜를 채운다. 옮겨 온 곳: 원본 assets/message_templates.html의 DATE_LINE·dateLine·withDate.
// 환자 정보가 없어 환자 자료 구역 밖이다. [*1*](받는 분 이름)·[*2*](부위)는 문자 발송 프로그램이 채우므로 건드리지 않는다.
// 날짜는 dates.ts의 isYmd가 참인 값만 받고, 그 밖에는 RangeError로 멈춘다. 빈 값·없는 날뿐 아니라 모양이 맞는 0~99년('0002-11-02')도 그렇다.
// 그래서 부르는 쪽(화면)은 먼저 isYmd(date)로 보고, 거짓이면 마지막으로 맞았던 날짜를 그대로 둔다.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] // 원본 WD

export const DATE_LINE = /^\s*\*\s*\d+월\s*\d+일\s*[월화수목금토일]요일\s*\*\s*$/

export function dateLine(date: string): string {
  const weekday = WEEKDAYS[weekdayOf(date) % 7] // weekdayOf의 일요일 7 → 0. 없는 날이면 여기서 멈춘다
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return `* ${month}월 ${day}일 ${weekday}요일 *`
}

// 줄마다 <<DATE>>가 있거나 이미 날짜 줄이면 그 줄 전체를 날짜 줄로 바꾼다. 저장한 문구를 다시 채워도 날짜만 바뀐다
export function fillTemplate(body: string, date: string): string {
  const line = dateLine(date)
  return body
    .split('\n')
    .map((text) => (text.includes('<<DATE>>') || DATE_LINE.test(text) ? line : text))
    .join('\n')
}

// 전날 보내는 안내라 내일이 기본이다. 오늘은 부르는 쪽이 준다(todayInKorea)
export function defaultSendDate(today: string): string {
  return addDays(today, 1)
}
