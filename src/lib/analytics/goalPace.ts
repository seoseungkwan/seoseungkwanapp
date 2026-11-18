import { addDays, compareYmd, eachDay, monthOf, monthRange, weekdayOf } from './dates'

// 이번 달 목표의 셈 (stats-insights REQ-6102 AC-6102.3, design.md '목표'). 순수 함수: 하루 값 목록과 오늘만 받는다.
// 내원·신환은 저장된 하루 숫자(stats_days totals), 매출은 저장된 하루 매출(sales_days 총액)을 하루 값으로 바꿔 넣는다.
// 지금까지 = 이번 달 1일 ~ 어제의 합. 월말 예상 = 지금까지 + 오늘~월말 날마다 '지난 8주(오늘 앞 56일) 같은 요일의 저장된 날 평균'의 합
// (저장된 날이 없는 요일은 0 — 일요일·쉬는 날은 저절로 빠진다). 원 미만은 남은 날 합을 한 번 버린다(평균 하나하나를 버리면 남은 날만큼 적게 나온다).
// 달성률·예상률은 목표로 나눈 % 정수(버림, 100을 넘을 수 있음). 목표 0은 나눌 수 없어 100%로 본다. 지나간 만큼 = (오늘 날짜 − 1) ÷ 그 달 날 수

/** 하루 값 하나(날 'YYYY-MM-DD', 그날 숫자) */
export type DayValue = { day: string; value: number }
/** 저장된 하루 숫자 가운데 이 셈이 쓰는 칸(DayPayload가 그대로 맞는다) */
export type StatsDayTotals = { day: string; totals: { patients: number; newPatients: number } }

export type GoalPace = {
  soFar: number // 이번 달 1일 ~ 어제의 합
  forecast: number // 월말 예상(원 미만 버림)
  donePct: number // 지금까지 ÷ 목표, % 정수(버림)
  forecastPct: number // 예상 ÷ 목표, % 정수(버림)
  elapsed: number // 이번 달이 지나간 만큼(0~1)
}

const AVERAGE_DAYS = 56
// 평균의 합을 버릴 때 부동소수 오차(9.999…)를 막는 아주 작은 값(charts/format과 같은 방법)
const EPSILON = 1e-6

const pctOf = (value: number, goal: number) => (goal > 0 ? Math.floor((value * 100) / goal) : 100)
const inRange = (day: string, from: string, to: string) => compareYmd(day, from) >= 0 && compareYmd(day, to) <= 0

export function goalPace({ today, goal, days }: { today: string; goal: number; days: readonly DayValue[] }): GoalPace {
  const { from: first, to: last } = monthRange(monthOf(today))
  const yesterday = addDays(today, -1)
  const windowFrom = addDays(today, -AVERAGE_DAYS)

  let soFar = 0
  const sums = new Map<number, { total: number; count: number }>()
  for (const { day, value } of days) {
    if (inRange(day, first, yesterday)) soFar += value
    if (inRange(day, windowFrom, yesterday)) {
      const weekday = weekdayOf(day)
      const sum = sums.get(weekday) ?? { total: 0, count: 0 }
      sums.set(weekday, { total: sum.total + value, count: sum.count + 1 })
    }
  }

  let rest = 0
  for (const day of eachDay({ from: today, to: last })) {
    const sum = sums.get(weekdayOf(day))
    if (sum) rest += sum.total / sum.count
  }
  const forecast = soFar + Math.floor(rest + EPSILON)
  const daysInMonth = eachDay({ from: first, to: last }).length

  return {
    soFar,
    forecast,
    donePct: pctOf(soFar, goal),
    forecastPct: pctOf(forecast, goal),
    elapsed: (Number(today.slice(8, 10)) - 1) / daysInMonth,
  }
}

/** 저장된 하루 숫자 → 내원(totals.patients) 또는 신환(totals.newPatients) 하루 값 */
export function statsDayValues(days: readonly StatsDayTotals[], key: 'visits' | 'newPatients'): DayValue[] {
  return days.map((row) => ({ day: row.day, value: key === 'visits' ? row.totals.patients : row.totals.newPatients }))
}
