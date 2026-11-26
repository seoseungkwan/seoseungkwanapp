import { todayInKorea, weekdayOf } from '@/lib/analytics/dates'

// 설정 › 구글 캘린더 화면의 날짜·시각 글(한국 시각). 날짜 계산은 lib/analytics/dates 한 곳, 시각은 Asia/Seoul로 읽는다 → PC 시간대와 상관없다
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일

// h23: 자정을 '24:00'이 아니라 '00:00'으로
const KOREA_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// DB(PostgREST) 시각 글자 '2026-11-26 14:35:00.123456+09'와 구글 RFC3339 '2026-11-26T05:35:00.000Z'
const STAMP = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)$/

/** '08:41'(한국 시각) */
export function hmOf(at: Date): string {
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(at).map((p) => [p.type, p.value]))
  return `${parts.hour}:${parts.minute}`
}

/** '11/23 (월)' */
export function mdwOf(ymd: string): string {
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))} (${WEEKDAYS[weekdayOf(ymd) - 1]})`
}

/** '11/23 (월) 08:41'(한국 시각) */
export function mdwHmOf(at: Date): string {
  return `${mdwOf(todayInKorea(at))} ${hmOf(at)}`
}

/** 시각 글자 → Date. 읽지 못하면 null (DB 글자는 마이크로초·'+09' 꼴이라 Date가 바로 읽지 못한다) */
export function parseStamp(stamp: string): Date | null {
  const m = STAMP.exec(stamp)
  if (m === null) return null
  const [, day, hm, sec = '00', frac = '', zone] = m
  const tz = zone === 'Z' ? 'Z' : `${zone.slice(0, 3)}:${zone.slice(3).replace(':', '') || '00'}`
  const at = new Date(`${day}T${hm}:${sec}.${frac.padEnd(3, '0').slice(0, 3)}${tz}`)
  return Number.isNaN(at.getTime()) ? null : at
}

/** '4,188' */
export const countText = (n: number) => n.toLocaleString('ko-KR')
