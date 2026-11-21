import { addMonths, todayInKorea } from '@/lib/analytics/dates'

// 급여 화면 글자 모양 (staff REQ-7615, 시안 pay.html). 금액은 원 단위 정수, 쉼표 셋째 자리.
// 빼기 표시는 시안처럼 '−'(U+2212)다

export const MINUS = '−'

/** 2900000 → '2,900,000' (음수는 '−2,900,000') */
export function won(n: number): string {
  const text = Math.abs(n).toLocaleString('en-US')
  return n < 0 ? `${MINUS}${text}` : text
}

/** 늘고 준 금액: '+95,000' · '−40,000' · 0이면 '0' */
export function signedWon(n: number): string {
  return n > 0 ? `+${won(n)}` : won(n)
}

/** 'YYYY-MM' → 달 숫자(1~12) */
export const monthNumber = (month: string) => Number(month.slice(5, 7))
/** 'YYYY-MM' → '{YYYY}년 {M}월' */
export const monthTitle = (month: string) => `${month.slice(0, 4)}년 ${monthNumber(month)}월`
/** 'YYYY-MM-DD' → '{M}월 {d}일' */
export const monthDay = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`

/** 보는 달과 앞 n−1달(오래된 달부터) */
export function recentMonths(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(month, i - count + 1))
}

/** 더 일한 분 → 시간 칸 글자: 0은 '–', 나머지는 '2.5'·'4' */
export function hoursCell(minutes: number): string {
  return minutes === 0 ? '–' : String(Math.round((minutes / 60) * 100) / 100)
}

/** 매출 대비 %: 17.5 → '17.5%' (소수 첫째 자리) */
export const ratioText = (ratio: number) => `${ratio.toFixed(1)}%`

/** 금액 칸 글: 쉼표·빈칸·'원'은 빼고 읽는다. 빈 글 = null, 0 이상 정수(10자리까지)가 아니면 'bad' */
export function parseWon(text: string): number | null | 'bad' {
  const clean = text.replace(/[,\s원]/g, '')
  if (clean === '') return null
  return /^\d{1,10}$/.test(clean) ? Number(clean) : 'bad'
}

/** 받침이 있으면 '을', 없으면 '를'(한글이 아니면 '을') */
export function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return '을'
  return code % 28 === 0 ? '를' : '을'
}

/** 파일 크기: 1MB 밑은 '214KB', 그 위는 '1.3MB'(1,000 단위 — 한도 10MB와 같다) */
export function fileSize(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))}KB`
  return `${(bytes / 1_000_000).toFixed(1)}MB`
}

/** 파일 종류 글자(확장자, jpeg는 JPG) */
export function fileKind(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot < 0 ? '' : name.slice(dot + 1).toUpperCase()
  return ext === 'JPEG' ? 'JPG' : ext
}

/** 올린 때(ISO 시각) → 한국 날짜의 '{M}월 {d}일' */
export function uploadedDay(createdAt: string): string {
  const at = new Date(createdAt)
  return Number.isNaN(at.getTime()) ? '' : monthDay(todayInKorea(at))
}
