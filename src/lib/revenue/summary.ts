import { compareYmd } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import { REVENUE_MONEY_KEYS, type RevenueDayRow } from '@/types/revenue'

// 금액 나눔·기간 합·비교(spec revenue design.md 7절, REQ-005). 순수 함수: 입력은 날 줄뿐이다. 기간은 부르는 쪽(통계 매출 칸)이 정한다.
// 매출 = total(총진료비) = 급여(insurer + copay) + 비급여 + 기타(나눔이 있는 날).
// 옛 매출 탭의 달 기간·13달 셈은 지웠다(stats-revenue AC-4110.4)

// components/charts/format.ts와 같은 규칙: 부동소수 오차(28.999…)를 막으려고 아주 작은 값을 더한 뒤 자른다
const EPSILON = 1e-9
const NO_SPLIT = { covered: null, insurer: null, selfPay: null, noncovered: null, other: null, splitTotal: null }

/** null = 나눔 없음(unconfirmed·splitUnconfirmed, 또는 합이 맞지 않거나 음수인 날). 고쳐 맞추지 않는다 */
export type DaySplit = { covered: number; insurer: number; selfPay: number; noncovered: number; other: number; total: number } | null

/**
 * total = unconfirmed 아닌 날 전부(나눔을 못 한 날 포함). covered~splitTotal = 나눔이 있는 날만, 그 날들의 total 합이 0이면 null.
 * visits = 아는 접수 건수 전부(null인 날만 건너뜀, unconfirmed인 날도 든다), 아는 날이 하나도 없으면 null(진짜 0건과 다르다).
 * perVisitTotal·perVisitCount = 짝이 맞는 날(unconfirmed 아니고 visits가 null 아닌 날)의 total 합·visits 합.
 * uncheckedDays = unconfirmed인 날만. noVisitDays = unconfirmed 아니고 visits가 null인 날. days = unconfirmed 아닌 날 수(쉬는 날·나눔을 못 한 날 포함).
 * workDays = 진료한 날 수: unconfirmed도 쉬는 날(접수 0건·금액 아홉 칸 모두 0)도 아닌 날(stats-revenue AC-4105.1, 하루 평균의 분모).
 * null = 자료 없음(줄이 없거나, 모두 0이고 확인 필요한 날도 나눔을 못 한 날도 없음)
 * roughDays·roughSum = 참고 금액 포함(withRough)으로 셀 때만 있는 열쇠(first90 AC-4408.2): 더한 확인 필요한 날(참고 금액이 숫자인 날)과 그 금액 합
 */
export type PeriodSum = {
  total: number
  covered: number | null
  insurer: number | null
  selfPay: number | null
  noncovered: number | null
  other: number | null
  splitTotal: number | null
  visits: number | null
  perVisitTotal: number
  perVisitCount: number
  uncheckedDays: string[]
  noSplitDays: string[]
  noVisitDays: string[]
  days: number
  workDays: number
  roughDays?: string[]
  roughSum?: number
} | null

/**
 * 그날 매출(bit-total AC-6901.1): total이 숫자면 total, 아니면 roughTotal(그날 비트 총진료비, 0·음수 그대로), 둘 다 없으면(null·열쇠 없음) null.
 * 줄은 저장된 그대로 두고 세는 곳이 이 규칙을 부른다(design.md 1절)
 */
export function dayRevenue(row: Pick<RevenueDayRow, 'total' | 'roughTotal'>): number | null {
  if (typeof row.total === 'number') return row.total
  return typeof row.roughTotal === 'number' ? row.roughTotal : null
}

/** dayRevenue가 숫자인 날만 { day, value }로 받은 차례 그대로(goalPace의 DayValue와 같은 모양, bit-total AC-6901.2) */
export function revenueDayValues(rows: readonly Pick<RevenueDayRow, 'date' | 'total' | 'roughTotal'>[]): { day: string; value: number }[] {
  return rows.flatMap((row) => {
    const value = dayRevenue(row)
    return value === null ? [] : [{ day: row.date, value }]
  })
}

/** withRough = 확인 필요한 날 가운데 참고 금액(roughTotal)이 숫자인 날(0·음수 포함)을 매출·접수 건수 짝·진료한 날에 더한다(first90 AC-4408.2). 나눔(급여·비급여·기타)에는 넣지 않는다 */
type SumOptions = { withRough?: boolean }

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

/** 진료한 날: 확인 필요한 날도 쉬는 날(접수 0건·금액 아홉 칸 모두 0)도 아닌 날(stats-revenue AC-4105.1). workDays가 세는 날이다 */
export const isWorkDay = (row: RevenueDayRow) => !row.unconfirmed && !isAllZero(row)

export function sumPeriod(rows: readonly RevenueDayRow[], range: DateRange, options: SumOptions = {}): PeriodSum {
  const withRough = options.withRough === true
  const inRange = rows
    .filter((row) => compareYmd(row.date, range.from) >= 0 && compareYmd(row.date, range.to) <= 0)
    .sort((a, b) => compareYmd(a.date, b.date))

  const uncheckedDays: string[] = []
  const noSplitDays: string[] = []
  const noVisitDays: string[] = []
  const split = { covered: 0, insurer: 0, selfPay: 0, noncovered: 0, other: 0, splitTotal: 0 }
  let total = 0
  let visits: number | null = null
  let perVisitTotal = 0
  let perVisitCount = 0
  let days = 0
  let workDays = 0
  const roughDays: string[] = []
  let roughSum = 0
  for (const row of inRange) {
    if (row.visits !== null) visits = (visits ?? 0) + row.visits // 확인 필요한 날의 내원도 이 합에는 센다. perVisitCount에서는 금액과 함께 빠진다
    if (row.unconfirmed) {
      uncheckedDays.push(row.date)
      // 참고 금액 포함: 그날은 확인 필요한 날 그대로이고(days에 넣지 않음) 금액만 참고 금액으로 더한다. 나눔은 없다
      if (withRough && typeof row.roughTotal === 'number') {
        roughDays.push(row.date)
        roughSum += row.roughTotal
        total += row.roughTotal
        workDays += 1
        if (row.visits === null) {
          noVisitDays.push(row.date)
        } else {
          perVisitTotal += row.roughTotal
          perVisitCount += row.visits
        }
      }
      continue
    }
    days += 1
    if (isWorkDay(row)) workDays += 1
    total += row.total ?? 0
    // 건수를 모르는 날의 금액만 남기면 분모가 모자라 건당 진료비가 부푼다. 금액과 건수를 함께 뺀다
    if (row.visits === null) {
      noVisitDays.push(row.date)
    } else {
      perVisitTotal += row.total ?? 0
      perVisitCount += row.visits
    }
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
  const sum = { total, ...(split.splitTotal === 0 ? NO_SPLIT : split), visits, perVisitTotal, perVisitCount, uncheckedDays, noSplitDays, noVisitDays, days, workDays }
  return withRough ? { ...sum, roughDays, roughSum } : sum
}

/** rate는 % 소수 첫째 자리 버림(0 쪽으로). before가 null·0이면 비교할 수 없어 null */
export function compare(now: number | null, before: number | null): { dir: 'up' | 'down' | 'same'; rate: number } | null {
  if (now === null || before === null || before === 0) return null
  const change = ((now - before) / before) * 100
  const rate = (Math.sign(change) * Math.trunc(Math.abs(change) * 10 + EPSILON)) / 10 || 0 // −0을 0으로
  return { dir: now > before ? 'up' : now < before ? 'down' : 'same', rate }
}

/** 건당 진료비: 짝이 맞는 날의 total 합 ÷ visits 합, 원 미만 버림. 나눔을 못 한 날도 보통 날처럼 든다 */
export function perVisit(sum: PeriodSum): number | null {
  if (sum === null || sum.perVisitCount === 0) return null
  return Math.floor(sum.perVisitTotal / sum.perVisitCount)
}
