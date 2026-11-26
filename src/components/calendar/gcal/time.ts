import { weekdayOf } from '@/lib/analytics/dates'
import { toMs } from '@/lib/gcal/deps'

// 구글 띠·자세히·고쳐야 할 판의 때 글. DB 시각 글자('2026-11-26 05:35:10.123456+00')·ISO 모두 한국 시각으로 읽는다

const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf 1=월 … 7=일
const KST_MS = 9 * 60 * 60 * 1000
const pad = (n: number) => String(n).padStart(2, '0')

/** '11/26 (목)' */
export const shortDay = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} (${WEEKDAY[weekdayOf(day) - 1]})`
/** 분 → 'HH:mm' */
export const clock = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

/** 시각 글자 → 한국 날짜·'HH:mm'. 못 읽으면 null */
export function kst(stamp: string | null | undefined): { day: string; hm: string } | null {
  const ms = toMs(stamp)
  if (ms === null) return null
  const d = new Date(ms + KST_MS)
  return { day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, hm: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
}

/** 한국 'HH:mm'(못 읽으면 null) */
export const kstHm = (stamp: string | null | undefined) => kst(stamp)?.hm ?? null

/** '11/23 (월) 08:55' (못 읽으면 null) */
export function kstSlot(stamp: string | null | undefined): string | null {
  const at = kst(stamp)
  return at ? `${shortDay(at.day)} ${at.hm}` : null
}
