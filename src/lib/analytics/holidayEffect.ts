import type { DayPayload } from '@/types/payload'
import { addDays, addMonthsToDay, compareYmd, eachDay, weekdayOf } from './dates'
import { HOLIDAYS } from './holidays'

// 휴일에 따라 (stats-insights REQ-6107 AC-6107.2). 순수 함수다. 받는 것은 저장된 하루 숫자(내원 수만 쓴다)뿐이다.
// 기간 = 최근 12달(오늘 12달 전 같은 날 ~ 어제). 저장된 날 = 그 기간의 끝난(partial 아닌) 줄, 같은 날이 둘이면 뒤의 것.
// 연 날 = 내원 1 이상인 저장된 날. 연휴 = 연 날이 없는 이어진 날들 가운데 공휴일이 하나 이상 든 묶음이다.
// 첫 연 날 앞·마지막 연 날 뒤는 저장되지 않은 날일 수 있어 연휴로 보지 않는다(첫 연 날 ~ 마지막 연 날 안에서만 찾는다).
// 연휴 바로 앞 날이 연휴 전날, 바로 뒤 날이 연휴 다음 날(둘 다면 두 줄에 모두 든다), 나머지 연 날이 평소다.
// 평소보다 = (그 날들 내원 합 ÷ 그 날들 요일의 평소 평균 합 − 1). 평소 날이 없는 요일의 날은 양쪽에서 뺀다

export type HolidayRowKey = 'usual' | 'before' | 'after'
// days = 날 수, average = 하루 평균 내원(반올림 정수, 날이 없으면 null), vsUsual = 평소보다(반올림 정수 %, 평소 줄·셀 수 없으면 null)
export type HolidayRow = { key: HolidayRowKey; name: string; days: number; average: number | null; vsUsual: number | null }

const NAMES: Record<HolidayRowKey, string> = { usual: '평소', before: '연휴 전날', after: '연휴 다음 날' }
const HOLIDAY = new Set(HOLIDAYS)

// 0에서 먼 쪽으로 반올림(−7.5 → −8). Math.round는 음수에서 0 쪽으로 간다
const roundAway = (n: number) => Math.sign(n) * Math.round(Math.abs(n))
const sum = (values: readonly number[]) => values.reduce((total, n) => total + n, 0)

/** 최근 12달: 오늘 12달 전 같은 날 ~ 어제 */
function recentSpan(today: string): { from: string; to: string } {
  return { from: addMonthsToDay(today, -12), to: addDays(today, -1) }
}

// 기간 안 연 날 → 내원 수. 같은 날의 뒤 줄이 덜 끝났으면 그날은 저장되지 않은 날이다(alerts.ts와 같다)
function openDays(days: readonly DayPayload[], today: string): Map<string, number> {
  const { from, to } = recentSpan(today)
  const stored = new Map<string, number>()
  for (const row of days) {
    if (compareYmd(row.day, from) < 0 || compareYmd(row.day, to) > 0) continue
    if (row.partial) stored.delete(row.day)
    else stored.set(row.day, row.totals.patients)
  }
  return new Map([...stored].filter(([, visits]) => visits >= 1))
}

// 연휴 앞뒤 날. 첫 연 날 ~ 마지막 연 날 안의 연 날 없는 이어진 날들(run)마다 공휴일이 들었으면 앞뒤 연 날을 적는다
function aroundHolidays(open: ReadonlyMap<string, number>): { before: Set<string>; after: Set<string> } {
  const sorted = [...open.keys()].sort(compareYmd)
  const before = new Set<string>()
  const after = new Set<string>()
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const next = sorted[i]!
    const gap = eachDay({ from: addDays(prev, 1), to: addDays(next, -1) })
    if (gap.some((ymd) => HOLIDAY.has(ymd))) {
      before.add(prev)
      after.add(next)
    }
  }
  return { before, after }
}

function rowOf(key: HolidayRowKey, days: readonly string[], open: ReadonlyMap<string, number>, usualAverage: ReadonlyMap<number, number>): HolidayRow {
  const visits = days.map((ymd) => open.get(ymd)!)
  const average = days.length === 0 ? null : Math.round(sum(visits) / days.length)
  if (key === 'usual') return { key, name: NAMES[key], days: days.length, average, vsUsual: null }
  const comparable = days.filter((ymd) => usualAverage.has(weekdayOf(ymd)))
  const expected = sum(comparable.map((ymd) => usualAverage.get(weekdayOf(ymd))!))
  const actual = sum(comparable.map((ymd) => open.get(ymd)!))
  const vsUsual = expected > 0 ? roundAway((actual / expected - 1) * 100) : null
  return { key, name: NAMES[key], days: days.length, average, vsUsual }
}

/** 평소 · 연휴 전날 · 연휴 다음 날 세 줄. 최근 12달에 연 날이 하루도 없으면 null(칸을 그리지 않는다) */
export function holidayEffect({ today, days }: { today: string; days: readonly DayPayload[] }): HolidayRow[] | null {
  const open = openDays(days, today)
  if (open.size === 0) return null
  const { before, after } = aroundHolidays(open)
  const sorted = [...open.keys()].sort(compareYmd)
  const usual = sorted.filter((ymd) => !before.has(ymd) && !after.has(ymd))

  // 요일마다 평소 평균
  const byWeekday = new Map<number, number[]>()
  for (const ymd of usual) {
    const weekday = weekdayOf(ymd)
    byWeekday.set(weekday, [...(byWeekday.get(weekday) ?? []), open.get(ymd)!])
  }
  const usualAverage = new Map([...byWeekday].map(([weekday, values]) => [weekday, sum(values) / values.length]))

  return [
    rowOf('usual', usual, open, usualAverage),
    rowOf('before', sorted.filter((ymd) => before.has(ymd)), open, usualAverage),
    rowOf('after', sorted.filter((ymd) => after.has(ymd)), open, usualAverage),
  ]
}
