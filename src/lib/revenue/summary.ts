import { addDays, addMonths, compareYmd, diffDays, monthOf, monthRange } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import { REVENUE_MONEY_KEYS, type RevenueDayRow } from '@/types/revenue'

// 금액 나눔·기간 합·비교(spec revenue design.md 7절, REQ-005). 순수 함수: 입력은 날 줄뿐이고 오늘은 인자로만 받는다.
// 매출 = total(총진료비) = 급여(insurer + copay) + 비급여 + 기타(나눔이 있는 날).

const SERIES_MONTHS = 13
// components/charts/format.ts와 같은 규칙: 부동소수 오차(28.999…)를 막으려고 아주 작은 값을 더한 뒤 자른다
const EPSILON = 1e-9
const NO_SPLIT = { covered: null, insurer: null, selfPay: null, noncovered: null, other: null, splitTotal: null }

/** null = 나눔 없음(unconfirmed·splitUnconfirmed, 또는 합이 맞지 않거나 음수인 날). 고쳐 맞추지 않는다 */
export type DaySplit = { covered: number; insurer: number; selfPay: number; noncovered: number; other: number; total: number } | null

/**
 * total = unconfirmed 아닌 날 전부(나눔을 못 한 날 포함). covered~splitTotal = 나눔이 있는 날만, 그 날들의 total 합이 0이면 null.
 * uncheckedDays = unconfirmed인 날만. days = unconfirmed 아닌 날 수(쉬는 날·나눔을 못 한 날 포함).
 * null = 자료 없음(줄이 없거나, 모두 0이고 확인 필요한 날도 나눔을 못 한 날도 없음)
 */
export type PeriodSum = {
  total: number
  covered: number | null
  insurer: number | null
  selfPay: number | null
  noncovered: number | null
  other: number | null
  splitTotal: number | null
  visits: number
  patients: number | null
  uncheckedDays: string[]
  noSplitDays: string[]
  days: number
} | null

/** 13달 한 칸. 자료 없는 달은 숫자 칸이 모두 null(0이 아님), partial = 아직 끝나지 않은 달 */
export type MonthPoint = {
  month: string
  partial: boolean
  total: number | null
  covered: number | null
  noncovered: number | null
  other: number | null
  visits: number | null
  patients: number | null
  perPatient: number | null
}

export function splitDay(row: RevenueDayRow): DaySplit {
  if (row.unconfirmed || row.splitUnconfirmed) return null
  const { total, insurer, copay, noncovered, otherTotal } = row
  if (total === null || insurer === null || copay === null || noncovered === null || otherTotal === null) return null
  if (total < 0 || insurer < 0 || copay < 0 || noncovered < 0 || otherTotal < 0) return null
  const covered = insurer + copay
  if (covered + noncovered + otherTotal !== total) return null
  return { covered, insurer, selfPay: copay, noncovered, other: otherTotal, total }
}

// 내원을 셀 수 없는 날(null)은 0이 아니다
const isAllZero = (row: RevenueDayRow) => row.visits === 0 && REVENUE_MONEY_KEYS.every((key) => row[key] === 0)

// 서로 다른 환자 수는 날마다 더할 수 없다(같은 환자가 두 번 세어진다). patientsToDate는 1일부터의 누적이라 마지막 날 값이 기간의 값이다
function patientsIn(inRange: RevenueDayRow[], range: DateRange): number | null {
  if (range.from !== `${monthOf(range.from)}-01`) return null
  return inRange.find((row) => row.date === range.to)?.patientsToDate ?? null
}

export function sumPeriod(rows: RevenueDayRow[], range: DateRange): PeriodSum {
  const inRange = rows
    .filter((row) => compareYmd(row.date, range.from) >= 0 && compareYmd(row.date, range.to) <= 0)
    .sort((a, b) => compareYmd(a.date, b.date))

  const uncheckedDays: string[] = []
  const noSplitDays: string[] = []
  const split = { covered: 0, insurer: 0, selfPay: 0, noncovered: 0, other: 0, splitTotal: 0 }
  let total = 0
  let visits = 0
  let days = 0
  for (const row of inRange) {
    visits += row.visits ?? 0 // 확인 필요한 날의 내원도 센다: 빠지는 것은 금액뿐이다
    if (row.unconfirmed) {
      uncheckedDays.push(row.date)
      continue
    }
    days += 1
    total += row.total ?? 0
    const day = splitDay(row)
    if (day === null) {
      noSplitDays.push(row.date)
      continue
    }
    split.covered += day.covered
    split.insurer += day.insurer
    split.selfPay += day.selfPay
    split.noncovered += day.noncovered
    split.other += day.other
    split.splitTotal += day.total
  }

  if (uncheckedDays.length === 0 && noSplitDays.length === 0 && inRange.every(isAllZero)) return null
  // 나눔이 있는 날이 쉬는 날뿐이어도 null이다. 날마다 비는 달에도 일요일이 있어 0원·빈 막대가 되지 않게
  return { total, ...(split.splitTotal === 0 ? NO_SPLIT : split), visits, patients: patientsIn(inRange, range), uncheckedDays, noSplitDays, days }
}

const yesterdayOf = (today: string) => addDays(today, -1)
const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)

// 그 달 1일 ~ (말일과 어제 가운데 이른 날)
function elapsedRange(month: string, today: string): DateRange {
  const { from, to } = monthRange(month)
  return { from, to: earlier(to, yesterdayOf(today)) }
}

// 그 달 1일 ~ 1일부터 offset일 뒤(그 달이 짧으면 말일)
function sameLengthIn(month: string, offset: number): DateRange {
  const { from, to } = monthRange(month)
  return { from, to: earlier(addDays(from, offset), to) }
}

/** 오늘이 1일이면 이번 달은 고를 수 없다(firstMonth가 지난달을 준다). 그래도 부르면 끝이 시작보다 앞인 빈 기간이다 */
export function periodsFor(month: string, today: string): { current: DateRange; lastMonth: DateRange; lastYear: DateRange } {
  const current = elapsedRange(month, today)
  const offset = diffDays(current.from, current.to)
  return {
    current,
    lastMonth: sameLengthIn(addMonths(month, -1), offset),
    lastYear: sameLengthIn(addMonths(month, -12), offset),
  }
}

/** 처음 고르는 달: 어제가 속한 달 */
export function firstMonth(today: string): string {
  return monthOf(yesterdayOf(today))
}

/** rate는 % 소수 첫째 자리 버림(0 쪽으로). before가 null·0이면 비교할 수 없어 null */
export function compare(now: number | null, before: number | null): { dir: 'up' | 'down' | 'same'; rate: number } | null {
  if (now === null || before === null || before === 0) return null
  const change = ((now - before) / before) * 100
  const rate = (Math.sign(change) * Math.trunc(Math.abs(change) * 10 + EPSILON)) / 10 || 0 // −0을 0으로
  return { dir: now > before ? 'up' : now < before ? 'down' : 'same', rate }
}

/** 13개, 오래된 달부터 */
export function monthSeries(rows: RevenueDayRow[], lastMonth: string, today: string): MonthPoint[] {
  return Array.from({ length: SERIES_MONTHS }, (_, index) => {
    const month = addMonths(lastMonth, index - SERIES_MONTHS + 1)
    const partial = compareYmd(monthRange(month).to, yesterdayOf(today)) > 0
    const sum = sumPeriod(rows, elapsedRange(month, today))
    if (sum === null) {
      return { month, partial, total: null, covered: null, noncovered: null, other: null, visits: null, patients: null, perPatient: null }
    }
    return {
      month,
      partial,
      total: sum.total,
      covered: sum.covered,
      noncovered: sum.noncovered,
      other: sum.other,
      visits: sum.visits,
      patients: sum.patients,
      perPatient: perPatient(sum)?.value ?? null,
    }
  })
}

/** 분자에 나눔을 못 한 날도 든다. lowered = 확인 필요한 날의 금액이 빠져 실제보다 낮을 수 있음 */
export function perPatient(sum: PeriodSum): { value: number; lowered: boolean } | null {
  if (sum === null || sum.patients === null || sum.patients === 0) return null
  return { value: Math.floor(sum.total / sum.patients), lowered: sum.uncheckedDays.length > 0 }
}
