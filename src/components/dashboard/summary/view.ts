import { formatCount } from '@/components/charts/format'
import type { RankedItem } from '@/components/charts/RankedBars'
import type { BarBucket } from '@/components/charts/StackedBarChart'
import { compareNumbers } from '@/lib/analytics/compare'
import { addDays, compareYmd, eachDay, weekdayOf } from '@/lib/analytics/dates'
import type { Delta } from '@/types/analysis'
import type { DayPayload } from '@/types/payload'

// 대시보드 오늘 하루 분석 · 기간별 흐름 · 원장님 보고 문장의 계산 (tab-frame REQ-311·REQ-317, design.md '오늘 하루 분석 · 기간별 흐름 · 보고 문장').
// 순수 함수다(React 없음). 날짜는 lib/analytics/dates.ts, 증감은 compareNumbers, 숫자 글자는 charts/format만 쓴다.
// 자료가 없는 날을 0으로 채우지 않는다 — 칸·평균·비율·증감은 있는 날짜 자료로만 만든다(AC-311.6)

export type Period = 7 | 30 | 90
export const PERIODS: readonly Period[] = [7, 30, 90]
export const DEFAULT_PERIOD: Period = 30

export type DayState = 'none' | 'open' | 'closed' // 오늘 줄 없음 · 덜 끝남(partial true) · 끝남(partial false)
export type TodayCounts = { patients: number; newPatients: number; returning: number }
export type TodayCompare =
  | { kind: 'wait' } // 오늘이 끝나지 않음 → "오늘 진료가 끝나면 비교해요"
  | { kind: 'no-last-week' } // 7일 전 줄 없음·덜 끝남 → "지난주 자료가 없어요"
  | { kind: 'delta'; delta: Delta; weekday: string } // weekday '토' → "지난주 토요일"
export type TodayView = { state: DayState; counts: TodayCounts | null; compare: TodayCompare }

export type PeriodRange = { from: string; to: string; label: string } // to = 어제
export type RateCell = { kind: 'rate'; value: number } | { kind: 'in-progress' } | { kind: 'none' } // value는 0~1
// 30일 기간의 30일 줄이 센 신환: 30일 값이 숫자인 첫날·끝날과 그 날들의 합
export type RevisitCohort = { from: string; to: string; within: number; cohort: number }
export type RevisitCells = { d7: RateCell; d14: RateCell; d30: RateCell; d30Cohort: RevisitCohort | null }
type RevisitKey = 'within7' | 'within14' | 'within30'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const // weekdayOf 1=월 … 7=일
const TOP_RX = 5
// 날짜 눈금 간격: 7일은 날마다, 30일은 기간 첫날부터 7일마다, 90일은 21일마다(다섯 개)
const TICK_STEP: Record<Period, number> = { 7: 1, 30: 7, 90: 21 }

const WAIT: TodayCompare = { kind: 'wait' }
const NO_RATE: RateCell = { kind: 'none' }
const IN_PROGRESS: RateCell = { kind: 'in-progress' }

const weekdayName = (ymd: string) => WEEKDAYS[weekdayOf(ymd) - 1]!
// 'YYYY-MM-DD' 글자의 달·날(앞 0 없이)
const monthDay = (ymd: string) => [Number(ymd.slice(5, 7)), Number(ymd.slice(8, 10))] as const
export const longDate = (ymd: string) => {
  const [m, d] = monthDay(ymd)
  return `${m}월 ${d}일`
}
const shortDate = (ymd: string) => {
  const [m, d] = monthDay(ymd)
  return `${m}.${d}`
}
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sum = <T>(list: readonly T[], of: (item: T) => number) => list.reduce((total, item) => total + of(item), 0)

// 그 날의 줄(같은 날이 둘이면 뒤의 것)
const rowOn = (days: readonly DayPayload[], ymd: string) => days.findLast((d) => d.day === ymd) ?? null

// 기간 안 날짜 자료만, 날짜 순(같은 날은 뒤의 것)
function daysIn(days: readonly DayPayload[], range: { from: string; to: string }): DayPayload[] {
  const byDay = new Map<string, DayPayload>()
  for (const d of days) if (compareYmd(d.day, range.from) >= 0 && compareYmd(d.day, range.to) <= 0) byDay.set(d.day, d)
  return [...byDay.values()].sort((a, b) => compareYmd(a.day, b.day))
}

// ── 오늘 하루 분석 ────────────────────────────────────────

// 오늘 끝남 = 오늘 줄 partial false. "지난주 같은 요일보다"는 오늘과 7일 전이 모두 끝났을 때만 숫자다
export function todayView(today: string, days: readonly DayPayload[]): TodayView {
  const row = rowOn(days, today)
  if (row === null) return { state: 'none', counts: null, compare: WAIT }
  const { patients, newPatients, returning } = row.totals
  const counts = { patients, newPatients, returning }
  if (row.partial) return { state: 'open', counts, compare: WAIT }
  const lastWeek = rowOn(days, addDays(today, -7))
  if (lastWeek === null || lastWeek.partial) return { state: 'closed', counts, compare: { kind: 'no-last-week' } }
  return {
    state: 'closed',
    counts,
    compare: { kind: 'delta', delta: compareNumbers(patients, lastWeek.totals.patients), weekday: weekdayName(today) },
  }
}

// ── 기간별 흐름 ──────────────────────────────────────────

// 어제까지 N일. 오늘은 숫자 줄과 보고 문장이 맡는다
export function periodRange(today: string, period: Period): PeriodRange {
  const from = addDays(today, -period)
  const to = addDays(today, -1)
  return { from, to, label: `${longDate(from)} – ${longDate(to)}` }
}

// 아래 날짜 글자 "{월}.{일}". 연결 전 빈 틀과 연결 뒤 막대 아래 글자가 같은 날짜다
export function tickLabels(range: PeriodRange, period: Period): { day: string; label: string }[] {
  return eachDay(range)
    .filter((_, i) => i % TICK_STEP[period] === 0)
    .map((day) => ({ day, label: shortDate(day) }))
}

// 환자 수 추이: 기간 안 자료가 있는 날 하나씩(빈 날은 칸이 없다). 없으면 null
export function trendBuckets(days: readonly DayPayload[], range: PeriodRange, period: Period): BarBucket[] | null {
  const rows = daysIn(days, range)
  if (rows.length === 0) return null
  const ticks = new Map(tickLabels(range, period).map((t) => [t.day, t.label]))
  return rows.map((row) => ({
    key: row.day,
    label: ticks.get(row.day) ?? '',
    rangeLabel: longDate(row.day),
    state: row.partial ? 'partial' : 'complete',
    values: [row.totals.newPatients, row.totals.returning],
  }))
}

// N일 값이 숫자인 날. within30은 선택 칸이라 빠진 칸(undefined)도 null처럼 뺀다
const countedRows = (rows: readonly DayPayload[], key: RevisitKey) => rows.filter((row) => (row.revisit[key] ?? null) !== null)

// 신환 재방문율 N일 = Σwithin ÷ Σcohort. 그 값이 null(집계 중)인 날은 분자·분모 모두에서 뺀다
function rateOf(rows: readonly DayPayload[], key: RevisitKey): RateCell {
  if (rows.length === 0) return NO_RATE
  const counted = countedRows(rows, key)
  if (counted.length === 0) return IN_PROGRESS
  const cohort = sum(counted, (row) => row.revisit.cohort)
  if (cohort === 0) return NO_RATE
  return { kind: 'rate', value: sum(counted, (row) => row.revisit[key] ?? 0) / cohort }
}

// 30일 기간의 날은 모두 온 지 30일이 안 되어 늘 집계 중이므로, 그 기간에서는 30일 줄만 오늘 − 60 ~ 오늘 − 31의 날로 센다(AC-516.2, 통계 탭 AC-511.4와 같은 규칙).
// period를 주지 않거나 7·90이면 30일 줄도 고른 기간 그대로다. 7·14일 줄은 늘 고른 기간이다
export function revisitView(days: readonly DayPayload[], range: PeriodRange, period?: Period): RevisitCells {
  const rows = daysIn(days, range)
  const rows30 = period === 30 ? daysIn(days, { from: addDays(range.from, -30), to: addDays(range.from, -1) }) : rows
  const d30 = rateOf(rows30, 'within30')
  return {
    d7: rateOf(rows, 'within7'),
    d14: rateOf(rows, 'within14'),
    d30,
    d30Cohort: period === 30 && d30.kind === 'rate' ? cohortOf(rows30) : null,
  }
}

// 30일 값이 숫자인 날이 하나 이상일 때만 부른다(30일 줄이 비율일 때). rows는 날짜 순이다(daysIn)
function cohortOf(rows: readonly DayPayload[]): RevisitCohort {
  const counted = countedRows(rows, 'within30')
  return {
    from: counted[0]!.day,
    to: counted.at(-1)!.day,
    within: sum(counted, (row) => row.revisit.within30 ?? 0),
    cohort: sum(counted, (row) => row.revisit.cohort),
  }
}

// 30일 줄 아래 글(AC-516.2)
export function revisitCohortCaption({ from, to, within, cohort }: RevisitCohort): string {
  return `${longDate(from)} – ${longDate(to)}에 온 신환 ${formatCount(cohort)}명 가운데 ${formatCount(within)}명 · 온 뒤 30일이 지난 가장 최근 신환이에요`
}

// 요일별 환자 수: 월 → 일 가운데 자료 있는 요일만. 값 = 그 요일 자료 있는 날의 환자 수 평균(버림)
export function weekdayBuckets(days: readonly DayPayload[], range: PeriodRange): BarBucket[] | null {
  const rows = daysIn(days, range)
  if (rows.length === 0) return null
  const byWeekday = new Map<number, DayPayload[]>()
  for (const row of rows) {
    const w = weekdayOf(row.day)
    byWeekday.set(w, [...(byWeekday.get(w) ?? []), row])
  }
  return WEEKDAYS.flatMap((name, i) => {
    const list = byWeekday.get(i + 1)
    if (list === undefined) return []
    return [
      {
        key: String(i + 1),
        label: name,
        rangeLabel: `${name}요일`,
        state: list.some((row) => row.partial) ? 'partial' : 'complete',
        values: [Math.floor(sum(list, (row) => row.totals.patients) / list.length)],
      } satisfies BarBucket,
    ]
  })
}

// 처방 상위: 기간 안 처방코드별 patients 합(받은 날마다의 환자 수 합) 큰 5개, 같으면 코드 순.
// 이름은 그 코드가 나온 가장 최근 날의 이름(daysIn이 날짜 순이라 뒤의 날이 덮어쓴다)
export function topRx(days: readonly DayPayload[], range: PeriodRange): RankedItem[] | null {
  const rows = daysIn(days, range)
  if (rows.length === 0) return null
  const byCode = new Map<string, RankedItem>()
  for (const row of rows) {
    for (const item of row.rx) byCode.set(item.code, { name: item.name, value: (byCode.get(item.code)?.value ?? 0) + item.patients })
  }
  return [...byCode.entries()]
    .sort(([codeA, a], [codeB, b]) => b.value - a.value || compareText(codeA, codeB))
    .slice(0, TOP_RX)
    .map(([, item]) => item)
}

// ── 원장님 보고 문장 ──────────────────────────────────────

// 지난주 같은 요일과 견준 문장. 이전 0명(새로 생김)이면 차이 = 오늘 환자 수
function lastWeekSentence(compare: TodayCompare, patients: number): string | null {
  if (compare.kind !== 'delta') return null
  const { delta, weekday } = compare
  const diff = delta.kind === 'change' ? delta.diff : delta.kind === 'new' ? patients : null
  if (diff === null) return null
  if (diff === 0) return `지난주 ${weekday}요일과 같습니다.`
  return `지난주 ${weekday}요일보다 ${formatCount(Math.abs(diff))}명 ${diff > 0 ? '많습니다.' : '적습니다.'}`
}

// 오늘 줄의 totals(와 끝난 날이면 7일 전 비교)만으로 만든다 — 환자 이름·차트번호·처방 이름은 쓰지 않는다.
// first = 처음 "다."까지(h1), rest = 그 뒤(앞뒤 빈칸 뺌), full = 둘을 빈칸 하나로 이은 글([복사]).
// dayLabel('10월 31일')을 주면 지난 날짜 문장이다: 시작의 "오늘"만 그 글자로 바꾼다(bit-dashboard AC-605.2)
export function reportSentence(view: TodayView, dayLabel?: string): { first: string; rest: string; full: string } | null {
  if (view.counts === null) return null
  const { patients, newPatients, returning } = view.counts
  const when = dayLabel ?? (view.state === 'open' ? '오늘 지금까지' : '오늘')
  const sentences = [
    `${when} 환자 ${formatCount(patients)}명이 왔습니다.`,
    `신환 ${formatCount(newPatients)}명, 재진 ${formatCount(returning)}명입니다.`,
    view.state === 'closed' ? lastWeekSentence(view.compare, patients) : null,
  ]
  const text = sentences.filter((s) => s !== null).join(' ')
  const cut = text.indexOf('다.')
  const first = cut < 0 ? text : text.slice(0, cut + 2)
  const rest = cut < 0 ? '' : text.slice(cut + 2).trim()
  return { first, rest, full: rest === '' ? first : `${first} ${rest}` }
}
