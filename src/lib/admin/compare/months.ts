import { addMonths, isMonth, monthOf } from '@/lib/analytics/dates'

// 의원 비교 고를 수 있는 달(spec admin-view REQ-8023 AC-8023.1·AC-8023.2, design.md '의원 비교 달 10년'). 순수 함수.
// 저장된 가장 이른 달(모든 승인된 의원 기준, TASK-15가 넘긴다) ~ 지난달. 이번 달 − 120달보다 앞은 안 되고 이번 달은 늘 뺀다.
// 첫 달이 없거나(null·달 모양 아님) 지난달보다 늦으면 지난달 하나

/** 해마다 그 해에 고를 수 있는 달(1~12, 오름차순). 해는 최근 해가 먼저 */
export type MonthYears = readonly { year: number; months: readonly number[] }[]
export type CompareMonths = { first: string; last: string; years: MonthYears }

const TEN_YEARS = 120

const monthKey = (year: number, month: number) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`

/** today = 한국 날짜 'YYYY-MM-DD' */
export function compareMonths(first: string | null, today: string): CompareMonths {
  const now = monthOf(today)
  const last = addMonths(now, -1)
  const floor = addMonths(now, -TEN_YEARS)
  const start = first === null || !isMonth(first) || first > last ? last : first < floor ? floor : first
  const years: { year: number; months: number[] }[] = []
  for (let month = last; month >= start; month = addMonths(month, -1)) {
    const year = Number(month.slice(0, 4))
    let entry = years.at(-1)
    if (entry?.year !== year) {
      entry = { year, months: [] }
      years.push(entry)
    }
    entry.months.unshift(Number(month.slice(5, 7)))
  }
  return { first: start, last, years }
}

/**
 * 연도를 바꿀 때: 그 해에 고를 수 있는 달 가운데 month와 가장 가까운 달(거리가 같으면 앞 달).
 * 그 해가 목록에 없으면 모든 달 가운데 그 해·달과 가장 가까운 달. 목록이 비면 그 해·달 그대로
 */
export function nearestMonth(years: MonthYears, year: number, month: number): string {
  const target = year * 12 + month
  const inYear = years.find((entry) => entry.year === year)
  const pool = inYear ? [inYear] : years
  let best: number | null = null
  for (const entry of pool) {
    for (const value of entry.months) {
      const index = entry.year * 12 + value
      if (best === null || Math.abs(index - target) < Math.abs(best - target) || (Math.abs(index - target) === Math.abs(best - target) && index < best)) best = index
    }
  }
  if (best === null) return monthKey(year, month)
  const bestYear = Math.floor((best - 1) / 12)
  return monthKey(bestYear, best - bestYear * 12)
}
