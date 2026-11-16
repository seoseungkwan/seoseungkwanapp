import { compareYmd } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { StatsRange } from './view'

// 통계 '예약·전환' 칸의 셈 도우미 (spec sunap-ilji REQ-4906, design.md '순수 규칙' 비율). 순수 함수다.
// 비율 글은 시안(docs/mockups/sunap-ilji ?s=stats pct)과 같이 소수 첫째 자리 반올림이고, 분모가 0이면 '–'다

export const NO_RATE = '–'

/** part ÷ whole → '63.4%'(소수 첫째 자리 반올림). whole이 0이면 '–' */
export function sunapPct(part: number, whole: number): string {
  if (whole === 0) return NO_RATE
  return `${(Math.round((part / whole) * 1000) / 10).toFixed(1)}%`
}

/** 마감한 날을 읽고 진료한 날을 세는 기간: 고른 기간 첫날 ~ 기간 끝과 오늘 가운데 이른 날(오늘 = 불러올 범위 끝) */
export function sunapSpan(range: StatsRange): DateRange {
  const { from, to } = range.current
  const today = range.load.to
  return { from, to: compareYmd(to, today) <= 0 ? to : today }
}

/** 진료한 날: 기간 안 저장된 날 숫자 가운데 환자가 있는 날. 같은 날은 한 번, 날짜 차례 */
export function workedDays(days: readonly DayPayload[], span: DateRange): string[] {
  const worked = new Set<string>()
  for (const row of days) {
    if (row.totals.patients > 0 && compareYmd(row.day, span.from) >= 0 && compareYmd(row.day, span.to) <= 0) worked.add(row.day)
  }
  return [...worked].sort(compareYmd)
}
