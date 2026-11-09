import { formatCount, formatRate } from '@/components/charts/format'
import type { PeriodRange } from '@/components/dashboard/summary/view'
import { addDays, addMonths, addMonthsToDay, compareYmd, diffDays, isYmd, monthOf, monthRange } from '@/lib/analytics/dates'
import { comparisonRange } from '@/lib/analytics/rxTrend'
import type { Delta, TrendBucket } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { CompareRange, StatsPeriod, StatsRange, SummaryCell } from './view'

// 통계 기간 고르기의 날짜·이름 셈 (stats-period REQ-1701·REQ-1702·REQ-1707, design.md periodPick.ts).
// 순수 모듈이다. view.ts에서는 타입만 불러온다(view.ts의 rangeOf가 이 파일을 부르므로 실행 순환을 만들지 않는다).
// 날짜는 lib/analytics/dates.ts와 comparisonRange만 쓴다. 고른 기간의 grain은 늘 'day'(일 줄로 센다)이고 칸은 bucket이 정한다

export type PickUnit = 'day' | 'week' | 'month'
export type StatsPick = { kind: 'month'; unit: 'day' | 'week'; month: string } | { kind: 'year'; year: string } | { kind: 'custom'; unit: PickUnit; from: string; to: string }
// 빠른 단추(글자 그대로) 또는 고른 기간
export type StatsChoice = StatsPeriod | StatsPick
export type CustomCheck = { kind: 'ok'; days: number } | { kind: 'error' | 'warn'; text: string; days?: number }
export type ReportRx = { name: string; count: number }

const DAY_LIMIT = 92 // 직접 날짜 일별로 볼 수 있는 날 수
const SPAN_LIMIT = 1827 // 직접 날짜 한 번에 볼 수 있는 날 수(5년)
// 고를 수 있는 첫날(1월 1일). ◀는 이 날이 든 달·해까지, 직접 날짜는 이 날부터다. 판의 날짜 칸 min도 이 값이다
export const FIRST_DAY = '2020-01-01'
const CUSTOM_NAME = '직접 고른 기간'
const LAST_YEAR_DATES = '작년 같은 날짜'
const REPORT_RX = 2

const yearOf = (ymd: string) => ymd.slice(0, 4)
const yearName = (year: string) => `${Number(year)}년`
const monthNumber = (ymd: string) => Number(ymd.slice(5, 7))
const dayNumber = (ymd: string) => Number(ymd.slice(8, 10))
const longDate = (ymd: string) => `${monthNumber(ymd)}월 ${dayNumber(ymd)}일`
const monthName = (month: string) => `${yearName(yearOf(month))} ${monthNumber(month)}월`

// 기간 글. withYear면 첫날 앞에 해를 붙이고, 해를 넘는 기간은 늘 양 끝에 붙인다.
// '2026년 10월 1일 – 31일' · '9월 3일 – 10월 2일' · '2025년 12월 20일 – 2026년 1월 10일'
export function spanLabel({ from, to }: DateRange, withYear: boolean): string {
  if (yearOf(from) !== yearOf(to)) return `${yearName(yearOf(from))} ${longDate(from)} – ${yearName(yearOf(to))} ${longDate(to)}`
  const head = `${withYear ? `${yearName(yearOf(from))} ` : ''}${longDate(from)}`
  if (from === to) return head
  return `${head} – ${monthOf(from) === monthOf(to) ? `${dayNumber(to)}일` : longDate(to)}`
}

const currentOf = (span: DateRange): PeriodRange => ({ ...span, label: spanLabel(span, true) })
// 비교 글은 오늘과 해가 다를 때만 해를 붙인다
const compareOf = (today: string, span: DateRange, name: string, why: string): CompareRange => ({
  ...span,
  label: spanLabel(span, yearOf(span.from) !== yearOf(today)),
  name,
  why,
})

export function lastDayOf(today: string, todayDone: boolean): string {
  return todayDone ? today : addDays(today, -1)
}

// 불러올 범위는 지금 규칙(비교 첫날이 든 달 1일 ~ 오늘)을 가장 앞 비교로 넓힌 것이다
function rangeWith(today: string, o: { name: string; current: DateRange; previous: CompareRange; lastYear: CompareRange | null; bucket: TrendBucket }): StatsRange {
  const first = o.lastYear !== null && compareYmd(o.lastYear.from, o.previous.from) < 0 ? o.lastYear.from : o.previous.from
  const current = currentOf(o.current)
  return {
    period: null,
    name: o.name,
    current,
    previous: o.previous,
    lastYear: o.lastYear,
    finishedCohort: null,
    load: { from: monthRange(monthOf(first)).from, to: today },
    grain: 'day',
    bucket: o.bucket,
    label: current.label,
  }
}

// 끝나지 않은 달은 끝난 마지막 날까지이고, 비교도 같은 일까지다(그 달에 그 날이 없으면 말일, addMonthsToDay)
function monthPickRange(today: string, pick: Extract<StatsPick, { kind: 'month' }>, lastDay: string): StatsRange {
  const whole = monthRange(pick.month)
  const open = compareYmd(lastDay, whole.to) < 0
  const to = open ? lastDay : whole.to
  const before = addMonths(pick.month, -1)
  const yearAgo = addMonths(pick.month, -12)
  const previousSpan = open ? { from: monthRange(before).from, to: addMonthsToDay(to, -1) } : monthRange(before)
  const lastYearSpan = open ? { from: monthRange(yearAgo).from, to: addMonthsToDay(to, -12) } : monthRange(yearAgo)
  const previousName = yearOf(before) === yearOf(pick.month) ? `${monthNumber(before)}월` : monthName(before)
  return rangeWith(today, {
    name: monthName(pick.month),
    current: { from: whole.from, to },
    previous: compareOf(today, previousSpan, previousName, open ? '바로 전 달 같은 날까지' : '바로 전 달'),
    lastYear: compareOf(today, lastYearSpan, `작년 ${monthNumber(pick.month)}월`, open ? '작년 같은 날까지' : '작년 같은 달'),
    bucket: pick.unit,
  })
}

// 해는 비교가 하나(작년)다. 끝나지 않은 해는 작년 같은 월·일까지
function yearPickRange(today: string, pick: Extract<StatsPick, { kind: 'year' }>, lastDay: string): StatsRange {
  const whole = { from: `${pick.year}-01-01`, to: `${pick.year}-12-31` }
  const open = compareYmd(lastDay, whole.to) < 0
  const to = open ? lastDay : whole.to
  const before = yearOf(addMonths(`${pick.year}-01`, -12))
  const previousSpan = { from: `${before}-01-01`, to: open ? addMonthsToDay(to, -12) : `${before}-12-31` }
  const range = rangeWith(today, {
    name: yearName(pick.year),
    current: { from: whole.from, to },
    previous: compareOf(today, previousSpan, yearName(before), open ? '작년 같은 날까지' : '작년'),
    lastYear: null,
    bucket: 'month',
  })
  // 월별 막대가 12월까지 앞으로 올 달을 잇도록 자르지 않은 해를 넘긴다(해 고르기만)
  return { ...range, whole }
}

// 바로 전 N일과 작년 같은 날짜(2월 29일 → 28일). 작년 기간이 고른 기간과 하루라도 겹치면 작년 비교는 뺀다
function customPickRange(today: string, pick: Extract<StatsPick, { kind: 'custom' }>): StatsRange {
  const current = { from: pick.from, to: pick.to }
  const days = diffDays(pick.from, pick.to) + 1
  const { from, to } = comparisonRange(pick.from, pick.to, 'PreviousEqualDays')
  const previousName = `바로 전 ${formatCount(days)}일`
  const yearAgo = { from: addMonthsToDay(pick.from, -12), to: addMonthsToDay(pick.to, -12) }
  const overlaps = compareYmd(yearAgo.to, pick.from) >= 0
  return rangeWith(today, {
    name: CUSTOM_NAME,
    current,
    previous: compareOf(today, { from, to }, previousName, previousName),
    lastYear: overlaps ? null : compareOf(today, yearAgo, LAST_YEAR_DATES, LAST_YEAR_DATES),
    bucket: pick.unit,
  })
}

export function pickRange(today: string, pick: StatsPick, todayDone: boolean): StatsRange {
  if (pick.kind === 'custom') return customPickRange(today, pick)
  const lastDay = lastDayOf(today, todayDone)
  return pick.kind === 'month' ? monthPickRange(today, pick, lastDay) : yearPickRange(today, pick, lastDay)
}

// 일별·주별은 끝난 날이 든 달의 앞 달(지난달), 월별은 끝난 날의 해
export function defaultPick(unit: PickUnit, lastDay: string): StatsPick {
  if (unit === 'month') return { kind: 'year', year: yearOf(lastDay) }
  return { kind: 'month', unit, month: addMonths(monthOf(lastDay), -1) }
}

// ◀▶ 한 칸(null = 못 감, ◀▶ disabled). ▶는 첫날이 끝난 날보다 뒤인 달·해로, ◀는 FIRST_DAY가 든 달·해(2020년 1월·2020년)보다 앞으로 못 간다.
// 직접 날짜는 옮기지 않는다
export function stepPick(pick: StatsPick, dir: -1 | 1, lastDay: string): StatsPick | null {
  if (pick.kind === 'custom') return null
  const blocked = (first: string) => (dir === 1 ? compareYmd(first, lastDay) > 0 : compareYmd(first, FIRST_DAY) < 0)
  if (pick.kind === 'month') {
    const month = addMonths(pick.month, dir)
    return blocked(`${month}-01`) ? null : { ...pick, month }
  }
  const year = yearOf(addMonths(`${pick.year}-01`, dir * 12))
  return blocked(`${year}-01-01`) ? null : { kind: 'year', year }
}

// 직접 날짜 판의 검사. error·warn이면 볼 수 없다. todayDone = 끝난 날(lastDay)이 오늘이다(글의 '오늘'·'어제')
export function checkCustom(from: string, to: string, unit: PickUnit, lastDay: string, todayDone = false): CustomCheck {
  if (!isYmd(from) || !isYmd(to)) return { kind: 'error', text: '시작 날짜와 끝 날짜를 모두 골라 주세요.' }
  if (compareYmd(to, from) < 0) return { kind: 'error', text: '끝 날짜가 시작 날짜보다 앞이에요.' }
  if (compareYmd(to, lastDay) > 0) return { kind: 'error', text: `${todayDone ? '오늘' : '어제'}(${longDate(lastDay)})까지만 고를 수 있어요.` }
  if (compareYmd(from, FIRST_DAY) < 0) return { kind: 'error', text: '2020년 1월 1일부터 고를 수 있어요.' }
  const days = diffDays(from, to) + 1
  if (days > SPAN_LIMIT) return { kind: 'error', text: '한 번에 5년까지 볼 수 있어요.' }
  if (unit === 'day' && days > DAY_LIMIT) {
    return { kind: 'warn', text: `일별은 ${DAY_LIMIT}일까지 볼 수 있어요. 고른 기간이 ${formatCount(days)}일이라 주별이나 월별로 보면 한눈에 보여요.`, days }
  }
  return { kind: 'ok', days }
}

// ── 고른 기간 보고 ────────────────────────────────────────

// 끝 글자에 받침이 있는지(조사 '은/는'·'과/와'). 한글이 아니면 받침이 있다고 본다
export function hasFinal(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code < 0 || code > 11171 || code % 28 !== 0
}

const canCompare = (delta: Delta | null | undefined): delta is Extract<Delta, { kind: 'change' | 'new' }> => delta?.kind === 'change' || delta?.kind === 'new'

// 하루 평균을 견준 마디 하나. 둘째 마디는 '…보다는'·'…과는'이다. 'new'(이전 0명)는 늘어난 수가 지금 평균이다
function compareClause(name: string, delta: Extract<Delta, { kind: 'change' | 'new' }>, average: number, second: boolean): string {
  const also = second ? '는' : ''
  if (delta.kind === 'new') return `${name}보다${also} ${formatCount(average)}명 늘었`
  if (delta.diff === 0) return `${name}${hasFinal(name) ? '과' : '와'}${also} 같았`
  const pct = delta.pct === null ? '' : `(${formatRate(Math.abs(delta.pct) / 100)}%)`
  return `${name}보다${also} ${formatCount(Math.abs(delta.diff))}명${pct} ${delta.diff > 0 ? '늘었' : '줄었'}`
}

function rxSentence(top: readonly ReportRx[]): string | null {
  const [first, second] = top.filter((rx) => rx.count > 0).slice(0, REPORT_RX)
  if (first === undefined) return null
  if (second === undefined) return `처방은 ${first.name} ${formatCount(first.count)}건이 가장 많았습니다.`
  return `처방은 ${first.name} ${formatCount(first.count)}건, ${second.name} ${formatCount(second.count)}건 순으로 많았습니다.`
}

// [고른 기간 보고] 글. cells = summaryCells(고른 기간), top = 처방별 추세 준비된 줄 건수 1·2위.
// 하루 평균이 없으면(current 자료 없음) null이다. 견줄 수 없는 비교는 '…은 자료가 없어 비교하지 않았습니다.'로 대신한다
export function pickReportText(range: StatsRange, cells: readonly SummaryCell[], top: readonly ReportRx[]): string | null {
  const valueOf = (key: SummaryCell['key']) => cells.find((cell) => cell.key === key)?.value ?? null
  const average = valueOf('average')
  const newCount = valueOf('new')
  const returning = valueOf('returning')
  if (average === null || newCount === null || returning === null) return null
  const compares = [
    { name: range.previous.name, delta: cells.find((cell) => cell.key === 'compare')?.delta },
    ...(range.lastYear === null ? [] : [{ name: range.lastYear.name, delta: cells.find((cell) => cell.key === 'lastYear')?.delta }]),
  ]
  const clauses = compares.flatMap(({ name, delta }) => (canCompare(delta) ? [{ name, delta }] : []))
  const rx = rxSentence(top)
  const sentences = [
    `${range.label} 환자는 하루 평균 ${formatCount(average)}명, 신환 ${formatCount(newCount)}명·재진 ${formatCount(returning)}명입니다.`,
    ...(clauses.length === 0 ? [] : [`하루 평균은 ${clauses.map(({ name, delta }, i) => compareClause(name, delta, average, i > 0)).join('고, ')}습니다.`]),
    ...compares.filter(({ delta }) => !canCompare(delta)).map(({ name }) => `${name}${hasFinal(name) ? '은' : '는'} 자료가 없어 비교하지 않았습니다.`),
    ...(rx === null ? [] : [rx]),
  ]
  return sentences.join(' ')
}
