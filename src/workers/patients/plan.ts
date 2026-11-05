import { addDays, addMonthsToDay, compareYmd, monthOf, monthRange } from '@/lib/analytics/dates'
import { KEEP_MONTHS, type RecallHistory, type RecallRule } from '@/lib/patients/recall'
import type { PatientsRange } from '@/types/patients'

// 도우미에 나눠 물을 기간 정하기(AC-604.2) [환자 자료 구역]. 오늘은 인자로만 받는다

export type Range = PatientsRange

export const FOLLOWUP_DAYS = 120
export const MAX_PIECE_DAYS = 31

const firstOfMonth = (ymd: string) => monthRange(monthOf(ymd)).from

// 오늘까지 120일을 31일 이하 조각으로, 오래된 것부터
export function followupPlan(today: string): Range[] {
  const plan: Range[] = []
  let from = addDays(today, 1 - FOLLOWUP_DAYS)
  while (compareYmd(from, today) <= 0) {
    const end = addDays(from, MAX_PIECE_DAYS - 1)
    const to = compareYmd(end, today) < 0 ? end : today
    plan.push({ from, to })
    from = addDays(to, 1)
  }
  return plan
}

// 처음 읽을 달의 1일: 켠 규칙 중 가장 긴 간격 + 1개월 전 달. 켠 규칙이 없으면 null
function firstRead(rules: readonly RecallRule[], today: string): string | null {
  const months = rules.filter((rule) => rule.enabled).map((rule) => rule.months)
  return months.length ? firstOfMonth(addMonthsToDay(today, -(Math.max(...months) + 1))) : null
}

// 이어 읽을 달의 1일: 마지막으로 읽은 날이 든 달(다시 읽어 정정을 반영한다, 원본 ingest와 같은 뜻).
// PC 시계가 바뀌어 오늘보다 뒤면 오늘이 든 달, 쌓아 두는 36개월보다 앞이면 그 달까지만(앞은 ingest가 어차피 지운다)
function nextRead(readThrough: string, today: string): string {
  const oldest = firstOfMonth(addMonthsToDay(today, -KEEP_MONTHS))
  const latest = compareYmd(readThrough, today) > 0 ? today : readThrough
  const start = firstOfMonth(latest)
  return compareYmd(start, oldest) < 0 ? oldest : start
}

// 달 조각(1일~말일, 마지막은 오늘까지)
export function recallPlan(history: RecallHistory, rules: readonly RecallRule[], today: string): Range[] {
  let from = history.readThrough === null ? firstRead(rules, today) : nextRead(history.readThrough, today)
  const plan: Range[] = []
  while (from !== null && compareYmd(from, today) <= 0) {
    const end = monthRange(monthOf(from)).to
    plan.push({ from, to: compareYmd(end, today) < 0 ? end : today })
    from = addDays(end, 1)
  }
  return plan
}
