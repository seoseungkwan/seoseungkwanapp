import { compareYmd } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import { REVENUE_MONEY_KEYS, type RevenueDayRow } from '@/types/revenue'

// 금액 나눔·기간 합·비교(spec revenue design.md 7절, REQ-005). 순수 함수: 입력은 날 줄뿐이다. 기간은 부르는 쪽(통계 매출 칸)이 정한다.
// 매출 = total(총진료비) = 급여(insurer + copay) + 비급여 + 기타(나눔이 있는 날).
// 옛 매출 탭의 달 기간·13달 셈은 지웠다(stats-revenue AC-4110.4).
// bit-total(REQ-6904·REQ-6906, design.md 2절): 기간 합은 그날 매출(dayRevenue = total ?? roughTotal)로 센다. 참고 금액 포함 셈(withRough)은 없다.
// 확인 필요로 저장되고 roughTotal이 있는 날은 보통 날처럼 들고(나눔은 없어 나눔을 못 한 날), 금액을 모르는 날(dayRevenue null)은 줄이 없는 날처럼 건너뛴다

// components/charts/format.ts와 같은 규칙: 부동소수 오차(28.999…)를 막으려고 아주 작은 값을 더한 뒤 자른다
const EPSILON = 1e-9
const NO_SPLIT = { covered: null, insurer: null, selfPay: null, noncovered: null, other: null, splitTotal: null }

/** null = 나눔 없음(unconfirmed·splitUnconfirmed, 또는 합이 맞지 않거나 음수인 날). 고쳐 맞추지 않는다 */
export type DaySplit = { covered: number; insurer: number; selfPay: number; noncovered: number; other: number; total: number } | null

/**
 * 센 날 = 그날 매출(dayRevenue)이 숫자인 날. 금액을 모르는 날(확인 필요 + roughTotal 없음)은 어디에도 넣지 않는다(내원도 세지 않음, bit-total AC-6906.1).
 * total = 센 날의 dayRevenue 합(0·음수 그대로). covered~splitTotal = 나눔이 있는 날만, 그 날들의 total 합이 0이면 null.
 * visits = 센 날 가운데 아는 접수 건수 전부(null인 날만 건너뜀), 아는 날이 하나도 없으면 null(진짜 0건과 다르다).
 * perVisitTotal·perVisitCount = 짝이 맞는 날(센 날 가운데 visits가 null 아닌 날)의 dayRevenue 합·visits 합.
 * noSplitDays = 센 날 가운데 splitDay가 null인 날(확인 필요로 저장된 옛 날은 늘 여기에 든다). noVisitDays = 센 날 가운데 visits가 null인 날.
 * days = 센 날 수(쉬는 날·나눔을 못 한 날 포함). workDays = 진료한 날 수(isWorkDay, stats-revenue AC-4105.1, 하루 평균의 분모).
 * null = 자료 없음(센 날이 없거나, 나눔을 못 한 날 없이 모두 쉬는 날)
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
  noSplitDays: string[]
  noVisitDays: string[]
  days: number
  workDays: number
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

/** 진료한 날: 그날 매출(dayRevenue)이 있고 쉬는 날(접수 0건·금액 아홉 칸 모두 0)이 아닌 날(stats-revenue AC-4105.1, bit-total AC-6904.2). workDays가 세는 날이다 */
export const isWorkDay = (row: RevenueDayRow) => dayRevenue(row) !== null && !isAllZero(row)

export function sumPeriod(rows: readonly RevenueDayRow[], range: DateRange): PeriodSum {
  const inRange = rows
    .filter((row) => compareYmd(row.date, range.from) >= 0 && compareYmd(row.date, range.to) <= 0)
    .sort((a, b) => compareYmd(a.date, b.date))

  const counted: RevenueDayRow[] = []
  const noSplitDays: string[] = []
  const noVisitDays: string[] = []
  const split = { covered: 0, insurer: 0, selfPay: 0, noncovered: 0, other: 0, splitTotal: 0 }
  let total = 0
  let visits: number | null = null
  let perVisitTotal = 0
  let perVisitCount = 0
  let workDays = 0
  for (const row of inRange) {
    const revenue = dayRevenue(row)
    if (revenue === null) continue // 금액을 모르는 날: 줄이 없는 날처럼 건너뛴다(내원도 세지 않음)
    counted.push(row)
    if (row.visits !== null) visits = (visits ?? 0) + row.visits
    if (isWorkDay(row)) workDays += 1
    total += revenue
    // 건수를 모르는 날의 금액만 남기면 분모가 모자라 건당 진료비가 부푼다. 금액과 건수를 함께 뺀다
    if (row.visits === null) {
      noVisitDays.push(row.date)
    } else {
      perVisitTotal += revenue
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

  // 센 날이 없으면 every가 참이라 null이다
  if (noSplitDays.length === 0 && counted.every(isAllZero)) return null
  // 나눔이 있는 날이 쉬는 날뿐이어도 null이다. 날마다 비는 달에도 일요일이 있어 0원·빈 막대가 되지 않게
  return { total, ...(split.splitTotal === 0 ? NO_SPLIT : split), visits, perVisitTotal, perVisitCount, noSplitDays, noVisitDays, days: counted.length, workDays }
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
