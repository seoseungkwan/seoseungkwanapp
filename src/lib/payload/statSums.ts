import { addMonths, compareYmd, monthOf, monthRange } from '@/lib/analytics/dates'
import { codesByDay, dropoffLines, type DropoffInput } from '@/lib/analytics/dropoff'
import { addVisit, eachVisit, emptyRates, type SunapRatesInput } from '@/lib/analytics/sunapRates'
import type { DateRange } from '@/types/dates'
import type { DayPayload, MonthDropoff, MonthPayload } from '@/types/payload'
import type { SunapRates } from '@/types/sunap'

// 통계 합계 저장 [환자 자료 구역] (admin-view REQ-8018, design.md '통계 합계 저장').
// 의원이 통계를 불러올 때 날 저장 줄에 그날 Block 전환 아홉 칸(sunap), 달 저장 줄에 첫 진료가 그달인 신환의 몇 번까지 받나(dropoff)를 붙인다.
// 셈은 통계 탭과 같다: sunap = sunapRates를 날마다 나눈 것(eachVisit), dropoff = dropoff()의 대상 환자를 첫 진료 달로 나눈 것(codesByDay·dropoffLines).
// 환자 번호·날 목록·처방 코드는 세는 데만 쓰고 결과에는 수와 묶음 열쇠·자료 끝 날만 남긴다

/** 날(YYYY-MM-DD) → 그날 Block 전환 아홉 칸. 기간 안 환자·날이 있는 날만, 날 차례 */
export function sunapByDay(input: SunapRatesInput): Map<string, SunapRates> {
  const byDay = new Map<string, SunapRates>()
  eachVisit(input, ({ date, kind, block, pt }) => {
    let rates = byDay.get(date)
    if (rates === undefined) {
      rates = emptyRates()
      byDay.set(date, rates)
    }
    addVisit(rates, kind, block, pt)
  })
  return new Map([...byDay].sort(([a], [b]) => compareYmd(a, b)))
}

/** 날 저장 줄마다 그날 아홉 칸을 새 객체로 붙인다. 그날 센 환자·날이 없으면 모두 0. 넣은 줄은 고치지 않는다 */
export function withDaySunap(days: readonly DayPayload[], byDay: ReadonlyMap<string, SunapRates>): DayPayload[] {
  return days.map((day) => ({ ...day, sunap: { ...(byDay.get(day.day) ?? emptyRates()) } }))
}

// 달 전체가 기간 안인 달들(첫 달·끝 달이 기간 중간에서 시작하거나 끝나면 뺀다: 그달 신환을 다 보지 못했다)
function wholeMonths(range: DateRange): string[] {
  const months: string[] = []
  for (let month = monthOf(range.from); month <= monthOf(range.to); month = addMonths(month, 1)) {
    const span = monthRange(month)
    if (compareYmd(span.from, range.from) >= 0 && compareYmd(span.to, range.to) <= 0) months.push(month)
  }
  return months
}

/**
 * 달(YYYY-MM) → 첫 진료(first)가 그달인 신환의 몇 번까지 받나. 달 전체가 기간(range) 안인 달만 있고, 대상이 없는 달은 빈 목록이다.
 * asOf = 기간 끝 날(통계 탭 몇 번까지 받나와 같은 자료 끝 날). 모든 달 줄을 묶음마다 더하면(대상·k회 이상·10회 이상·1회만) 통계 탭 줄과 같다
 */
export function dropoffByMonth(input: DropoffInput): Map<string, MonthDropoff> {
  const { first, groups, range } = input
  const byMonth = new Map<string, ReadonlyMap<string, readonly string[]>[]>()
  for (const [patient, days] of codesByDay(input)) {
    const month = monthOf(first.get(patient)!) // codesByDay는 첫 내원일이 기간 안인 환자만 준다
    const list = byMonth.get(month)
    if (list === undefined) byMonth.set(month, [days])
    else list.push(days)
  }
  return new Map(wholeMonths(range).map((month) => [month, { asOf: range.to, lines: dropoffLines(byMonth.get(month) ?? [], groups, range.to) }]))
}

/** 그 달 값이 있는 달 저장 줄에만 dropoff를 새 객체로 붙인다(없는 달은 그대로, 열쇠 없음). 넣은 줄은 고치지 않는다 */
export function withMonthDropoff(months: readonly MonthPayload[], byMonth: ReadonlyMap<string, MonthDropoff>): MonthPayload[] {
  return months.map((month) => {
    const sums = byMonth.get(month.month)
    if (sums === undefined) return month
    const lines = sums.lines.map((line) => ({ ...line, atLeast: [...line.atLeast] as typeof line.atLeast }))
    return { ...month, dropoff: { asOf: sums.asOf, lines } }
  })
}
