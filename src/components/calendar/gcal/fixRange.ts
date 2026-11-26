import { isYmd } from '@/lib/analytics/dates'
import type { GcalFix } from '@/types/gcal'
import { shortDay } from './time'

// 고쳐야 할 판의 기간(spec google-link REQ-8550, design.md 21-8, 시안 calendar.html ?s=fix-range · 기본값 2차-1~2차-3).
// 고른 기간은 이 브라우저 저장소(localStorage) 한 칸에만 기억한다(PC마다 따로, 서버에 두지 않음). 읽기·쓰기는 try/catch — 실패해도 처음 값(오늘 ~ 비움)으로 그린다.
// 기간은 구글 일정 날짜로 거르고(두 날 포함, 끝 비움 = 앞으로 전부), 하루 종일 여러 날 일정(날마다 따로 든 같은 일정 id의 하루 종일 줄)은 시작 날로 본다

export const FIX_RANGE_KEY = 'ssk-gcal-fix-range'

/** 날짜는 'YYYY-MM-DD', '' = 비움 */
export type FixRange = { from: string; to: string }

const isRangeDay = (value: unknown): value is string => value === '' || (typeof value === 'string' && isYmd(value))

/** 이 브라우저에 기억한 기간. 없거나 날짜 꼴이 아니거나 읽기가 던지면 오늘 ~ 비움 */
export function readFixRange(today: string): FixRange {
  const fallback = { from: today, to: '' }
  try {
    const raw = globalThis.localStorage?.getItem(FIX_RANGE_KEY)
    if (raw === null || raw === undefined) return fallback
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return fallback
    const { from, to } = value as Record<string, unknown>
    return isRangeDay(from) && isRangeDay(to) ? { from, to } : fallback
  } catch {
    return fallback
  }
}

/** 고른 기간을 기억한다. 저장소가 막혀도 조용히(이 화면에서만 쓴다) */
export function writeFixRange(range: FixRange): void {
  try {
    globalThis.localStorage?.setItem(FIX_RANGE_KEY, JSON.stringify({ from: range.from, to: range.to }))
  } catch {
    // 저장소가 막히면 기억하지 않는다
  }
}

/** 기간 오류: 시작 비움 · 끝이 시작보다 앞 */
export function rangeProblem(range: FixRange): 'no-from' | 'end-before' | null {
  if (range.from === '') return 'no-from'
  if (range.to !== '' && range.to < range.from) return 'end-before'
  return null
}

/** 그 줄의 구글 일정 날짜. 하루 종일 여러 날(같은 일정 id의 하루 종일 줄들)은 가장 이른 날 */
export function fixDay(fix: GcalFix, all: readonly GcalFix[]): string {
  if (!fix.allDay) return fix.day
  let first = fix.day
  for (const other of all) {
    if (other.allDay && other.gEventId === fix.gEventId && other.day < first) first = other.day
  }
  return first
}

/** 기간에 드는 줄(두 날 포함, 끝 비움 = 끝 없음). 기간 오류면 거짓 */
export function inFixRange(fix: GcalFix, all: readonly GcalFix[], range: FixRange): boolean {
  if (rangeProblem(range) !== null) return false
  const day = fixDay(fix, all)
  return day >= range.from && (range.to === '' || day <= range.to)
}

/** '11/26 (목)', 올해가 아니면 '2025. 11/24 (월)' */
export function dayWithYear(day: string, today: string): string {
  const year = day.slice(0, 4)
  return year === today.slice(0, 4) ? shortDay(day) : `${year}. ${shortDay(day)}`
}
