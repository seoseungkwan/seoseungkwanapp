import { dayRevenue } from '@/lib/revenue/summary'
import type { RevenueDayRow } from '@/types/revenue'

// 의원 비교 매출·환자 수 한 줄(spec admin-view REQ-8014 AC-8014.1, design.md '의원 비교 — 계산'). 순수 함수.
// 총진료비는 통계 '총매출'과 같은 그날 매출(lib/revenue/summary.ts dayRevenue = total ?? roughTotal)의 합이다. 새 공식을 두지 않는다.
// 줄은 부르는 쪽이 지금 줄 검사 함수로 고른 그 의원 그달 sales_days 줄이다(기간은 부르는 쪽이 정한다)

/** 이 셈이 쓰는 칸만(RevenueDayRow) */
export type SalesDay = Pick<RevenueDayRow, 'visits' | 'newPatients' | 'returnVisits' | 'total' | 'roughTotal'>
/** 의사랑 의원의 날 숫자 한 날(stats_days totals, spec uisarang-upload AC-8813.2): 내원 = patients · 신환 = newPatients · 재진 = returning */
export type VisitDay = { patients: number; newPatients: number; returning: number }

/**
 * 칸마다 null = 그 칸을 아는 날이 하나도 없음(진짜 0과 다르다).
 * dayAvg = visits ÷ days(소수 첫째 자리까지, 그 아래 버림), days = 내원이 1 이상인 날 수(0이면 dayAvg null)
 */
export type SalesRow = {
  total: number | null
  visits: number | null
  newPatients: number | null
  returnVisits: number | null
  dayAvg: number | null
  days: number
}

// 빈 칸(null·열쇠 없음)은 합에서 뺀다. 아는 날이 없으면 null
function sumKnown(values: readonly (number | null | undefined)[]): number | null {
  let sum: number | null = null
  for (const value of values) if (typeof value === 'number') sum = (sum ?? 0) + value
  return sum
}

/**
 * 날이 하나도 없으면 null(모두 –).
 * visitDays를 넘기면(의사랑 의원, AC-8813.2) 총진료비만 매출 날 줄에서 세고 내원·신환·재진·하루 평균·날 수는 그 날 숫자로 센다
 * (일일수입통계의 초진수는 신환과 달라 매출 날 줄의 신환·재진은 비어 있다). 둘 다 비면 null
 */
export function salesRow(days: readonly SalesDay[], visitDays?: readonly VisitDay[]): SalesRow | null {
  const counts =
    visitDays === undefined
      ? days.map((day) => ({ visits: day.visits, newPatients: day.newPatients, returnVisits: day.returnVisits }))
      : visitDays.map((day) => ({ visits: day.patients, newPatients: day.newPatients, returnVisits: day.returning }))
  if (days.length === 0 && counts.length === 0) return null
  const visits = sumKnown(counts.map((day) => day.visits))
  const worked = counts.filter((day) => typeof day.visits === 'number' && day.visits >= 1).length
  // 정수 ÷ 정수의 내림이라 부동소수 찌꺼기가 없다(136.48 → 136.4)
  const dayAvg = visits === null || worked === 0 ? null : Math.floor((visits * 10) / worked) / 10
  return {
    total: sumKnown(days.map(dayRevenue)),
    visits,
    newPatients: sumKnown(counts.map((day) => day.newPatients)),
    returnVisits: sumKnown(counts.map((day) => day.returnVisits)),
    dayAvg,
    days: worked,
  }
}
