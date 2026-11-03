import { formatCount } from '@/components/charts/format'
import type { BarBucket } from '@/components/charts/StackedBarChart'
import { periodRange, trendBuckets, weekdayBuckets, type Period, type PeriodRange } from '@/components/dashboard/summary/view'
import { compareNumbers } from '@/lib/analytics/compare'
import { isCovered } from '@/lib/analytics/coverage'
import { addDays, addMonths, compareYmd, eachDay, monthOf, monthRange } from '@/lib/analytics/dates'
import { buildTrend, comparisonRange } from '@/lib/analytics/rxTrend'
import type { Delta, TrendBucket, TrendPoint } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'

// 통계 화면의 숫자 (stats REQ-511, design.md TASK-11). 입력은 일 숫자와 덮은 기간뿐이고 저장된 달 줄은 읽지 않는다.
// 순수 함수다. 날짜는 lib/analytics/dates.ts, 증감은 compareNumbers, 처방 건수는 buildTrend, 대시보드 view의 함수는 불러 쓰기만 한다.
// 자료 없는 날·달을 0으로 채우지 않는다. 덮은 기간 안의 줄 없는 날은 휴진이고 달 칸과 처방 건수에 0을 더한다

export type StatsPeriod = '7d' | '30d' | '90d' | '12m'
export const DEFAULT_STATS_PERIOD: StatsPeriod = '30d'

export type StatsRange = {
  period: StatsPeriod
  current: PeriodRange
  previous: PeriodRange
  finishedCohort: DateRange | null // '30d'만: 오늘 − 60 ~ 오늘 − 31(previous와 같은 범위). 온 뒤 30일이 지난 가장 최근 신환
  load: DateRange // 비교 기간 첫날이 든 달의 1일 ~ 오늘
  grain: 'day' | 'month'
  label: string
}

// days·covered는 저장 모양과 readCoverage가 준 덮은 기간이다
export type StatsInput = { days: readonly DayPayload[]; covered: readonly DateRange[]; range: StatsRange }

// 값이 null이면 화면의 값 자리는 "–"이고 아래 글(note)이 까닭이다. partial = '일부 기간' 표시.
// 넷째 칸(compare)은 value가 늘 null이고 delta가 값이다(delta null = 비교할 자료가 없음)
export type SummaryCell = {
  key: 'average' | 'new' | 'returning' | 'compare'
  label: string
  value: number | null
  note: string
  partial: boolean
  delta: Delta | null
}

// kind 이름은 대시보드 RateCell과 같다. value 0~1. within·cohort = 비율을 낸 두 합, excluded = 값이 null이라 뺀 칸이 있음
export type StatsRateCell = { kind: 'rate'; value: number; within: number; cohort: number; excluded: boolean } | { kind: 'in-progress' } | { kind: 'none' }

// 원본 CohortMonthResult의 네 칸 + 아직 다시 안 옴. 다섯의 합 = cohort. from·to = 센 칸의 첫날·끝날
export type FirstRevisitKey = 'within7' | 'days8to14' | 'days15to30' | 'after30' | 'never'
export type FirstRevisit = { from: string; to: string; cohort: number; items: { key: FirstRevisitKey; label: string; count: number }[] }

export type RevisitRates = { d7: StatsRateCell; d14: StatsRateCell; d30: StatsRateCell; d30Cohort: DateRange | null; firstRevisit: FirstRevisit | null }

export type RxTrendRow = {
  code: string
  name: string // 가장 최근 날의 이름
  count: number // 순위 기준. 12개월은 덜 끝난 달도 넣는다
  newCount: number
  returningCount: number
  partial: boolean // '12m'에서 건수에 덜 끝난 달이 들면 true('일부 기간' 표시)
  comparable: { current: number; previous: number } | null // 어느 한쪽이라도 덜 끝난 짝을 뺀 합. 남은 짝이 없으면 null
  delta: Delta // comparable이 null이면 { kind: 'unavailable' }
}

export type RxLine = { code: string; name: string }
// 처방 골라 보기 표의 줄. gapCount(구분 없음) = 건수 − 신환 − 재진이고 저장 모양에는 없다. partial은 표에 쓰지 않는다
export type RxPickRow = RxTrendRow & { gapCount: number }

// covered = 그 칸의 날이 하나라도 덮은 기간 안에 있음. false인 비교 칸은 "0건"이 아니라 "–"
export type RxDetailPoint = TrendPoint & { covered: boolean }

type DayPeriod = Exclude<StatsPeriod, '12m'>
type Revisit = DayPayload['revisit']
type RevisitKey = 'within7' | 'within14' | 'within30'

const DAY_COUNT: Record<DayPeriod, Period> = { '7d': 7, '30d': 30, '90d': 90 }
export const COMPARE_NAME: Record<StatsPeriod, string> = { '7d': '지난 7일', '30d': '지난 30일', '90d': '지난 90일', '12m': '작년 같은 12달' }
// 짝을 빼고 견줄 때의 비교 쪽 이름. COMPARE_NAME은 칸 수를 말해서('작년 같은 12달') 남은 칸 수와 어긋난다
const PAIR_NAME: Record<StatsRange['grain'], string> = { day: '지난 기간', month: '작년' }
const AVERAGE_UNIT: Record<StatsRange['grain'], string> = { day: '하루', month: '한 달' }
const CELL_UNIT: Record<StatsRange['grain'], string> = { day: '일', month: '달' }
const DETAIL_BUCKET: Record<StatsPeriod, TrendBucket> = { '7d': 'day', '30d': 'day', '90d': 'week', '12m': 'month' }
const YEAR_MONTHS = 12
const TOP_RX = 5
const TREND_CODE_LIMIT = 200 // buildTrend가 한 번에 받는 코드 수(넘으면 RangeError)
// 점의 partial만 읽을 때 넘기는 코드. buildTrend는 코드가 0개면 RangeError이고 partial은 코드와 상관없다
const ANY_CODE = '-'

const NO_RATE: StatsRateCell = { kind: 'none' }
const IN_PROGRESS: StatsRateCell = { kind: 'in-progress' }
const UNAVAILABLE: Delta = { kind: 'unavailable' }
const NO_DATA = '자료 없음'
const NO_COMPARE = '비교할 자료가 없어요'

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sum = <T>(list: readonly T[], of: (item: T) => number) => list.reduce((total, item) => total + of(item), 0)
const monthName = (ymd: string) => `${Number(ymd.slice(0, 4))}년 ${Number(ymd.slice(5, 7))}월`
// 코드는 buildTrend처럼 대소문자를 가리지 않는다
export const codeKey = (code: string) => code.toUpperCase()

// 기간 안 일 줄, 날짜 순(같은 날은 뒤의 것, 대시보드·buildTrend와 같다)
function rowsIn(days: readonly DayPayload[], range: DateRange): DayPayload[] {
  const byDay = new Map<string, DayPayload>()
  for (const row of days) if (compareYmd(row.day, range.from) >= 0 && compareYmd(row.day, range.to) <= 0) byDay.set(row.day, row)
  return [...byDay.values()].sort((a, b) => compareYmd(a.day, b.day))
}

// ── 기간 ────────────────────────────────────────────────

function dayRanges(today: string, days: Period): Pick<StatsRange, 'current' | 'previous'> {
  const current = periodRange(today, days)
  const { from, to } = comparisonRange(current.from, current.to, 'PreviousEqualDays')
  return { current, previous: { from, to, label: periodRange(current.from, days).label } } // periodRange(첫날, N) = 그 앞 N일
}

function yearRanges(today: string): Pick<StatsRange, 'current' | 'previous'> {
  const thisMonth = monthOf(today)
  const from = monthRange(addMonths(thisMonth, 1 - YEAR_MONTHS)).from
  const to = monthRange(thisMonth).to
  const compared = comparisonRange(from, to, 'PreviousYear')
  // comparisonRange는 날짜를 옮기므로 작년 2월이 윤달이면 2월 28일에서 끝난다. 작년 같은 달 전체를 보려고 말일까지 넓힌다
  const previousTo = monthRange(monthOf(compared.to)).to
  return {
    current: { from, to, label: `${monthName(from)} – ${monthName(to)}` },
    previous: { from: compared.from, to: previousTo, label: `${monthName(compared.from)} – ${monthName(previousTo)}` },
  }
}

export function statsRange(today: string, period: StatsPeriod): StatsRange {
  const { current, previous } = period === '12m' ? yearRanges(today) : dayRanges(today, DAY_COUNT[period])
  return {
    period,
    current,
    previous,
    finishedCohort: period === '30d' ? { from: addDays(today, -60), to: addDays(today, -31) } : null,
    load: { from: monthRange(monthOf(previous.from)).from, to: today },
    grain: period === '12m' ? 'month' : 'day',
    label: current.label,
  }
}

// ── 칸(일 기간은 날, 12개월은 달) ─────────────────────────

type Cell = { key: string; patients: number; newPatients: number; returning: number; partial: boolean }

// 달마다 덜 끝났는지. buildTrend 달 점 그대로다(달이 끝나지 않았거나, 덮이지 않은 날이나 덜 끝난 일 줄이 있다)
function monthStates({ days, covered }: StatsInput, span: DateRange): { month: string; partial: boolean }[] {
  const { points } = buildTrend(days, covered, { from: span.from, to: span.to, bucket: 'month', codes: [ANY_CODE] })
  return points.map((point) => ({ month: monthOf(point.start), partial: point.partial }))
}

function cellOfRows(key: string, rows: readonly DayPayload[], partial: boolean): Cell {
  return {
    key,
    patients: sum(rows, (row) => row.totals.patients),
    newPatients: sum(rows, (row) => row.totals.newPatients),
    returning: sum(rows, (row) => row.totals.returning),
    partial,
  }
}

// 기간의 칸 자리 하나(일 기간은 날, 12개월은 달). cell은 자료 있는 칸이고, unfinished면 이 자리와 그 짝은 견주지 않는다.
// 날: 줄이 있으면 그 줄의 partial(trendBuckets 칸과 같다), 줄이 없으면 덮은 기간 밖일 때만 참이다(안이면 휴진).
// 달: buildTrend 달 점의 partial이고 줄이 없어도 같다. 칸은 그 달의 일 줄을 모두 더한다(덮이지 않은 날의 줄도 실제 숫자이고 칸에 '일부 기간'이 붙는다)
type Slot = { cell: Cell | null; unfinished: boolean }

function slotsOf(input: StatsInput, span: DateRange): Slot[] {
  const rows = rowsIn(input.days, span)
  if (input.range.grain === 'month') {
    return monthStates(input, span).map(({ month, partial }) => {
      const inMonth = rows.filter((row) => monthOf(row.day) === month)
      return { cell: inMonth.length === 0 ? null : cellOfRows(month, inMonth, partial), unfinished: partial }
    })
  }
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const merged = [...input.covered]
  return eachDay(span).map((day) => {
    const row = byDay.get(day)
    if (row === undefined) return { cell: null, unfinished: !isCovered({ from: day, to: day }, merged) }
    return { cell: cellOfRows(day, [row], row.partial), unfinished: row.partial }
  })
}

const cellsIn = (slots: readonly Slot[]) => slots.flatMap((slot) => (slot.cell === null ? [] : [slot.cell]))

const flooredAverage = (cells: readonly Cell[]) => (cells.length === 0 ? null : Math.floor(sum(cells, (cell) => cell.patients) / cells.length))

// ── 기간 요약 ────────────────────────────────────────────

function totalCell(key: 'new' | 'returning', label: string, cells: readonly Cell[], of: (cell: Cell) => number): SummaryCell {
  const none = cells.length === 0
  return { key, label, value: none ? null : sum(cells, of), note: none ? NO_DATA : '기간 합계', partial: cells.some((cell) => cell.partial), delta: null }
}

// 넷째 칸. finished는 평균 칸에 든 칸이고 comparedNow는 그 가운데 짝도 끝난 칸이라, 둘의 수가 다르면 평균 칸과 다른 칸으로 견준 것이다
function compareCell(range: StatsRange, finished: readonly Cell[], comparedNow: readonly Cell[], comparedBefore: readonly Cell[]): SummaryCell {
  const now = flooredAverage(comparedNow)
  const before = flooredAverage(comparedBefore)
  const label = '비교 기간보다'
  if (now === null || before === null) return { key: 'compare', label, value: null, note: NO_COMPARE, partial: false, delta: null }
  const note =
    comparedNow.length < finished.length
      ? `견준 ${formatCount(comparedNow.length)}${CELL_UNIT[range.grain]} 평균 · 이번 ${formatCount(now)}명 · ${PAIR_NAME[range.grain]} ${formatCount(before)}명`
      : `${COMPARE_NAME[range.period]} ${AVERAGE_UNIT[range.grain]} 평균 ${formatCount(before)}명`
  return { key: 'compare', label, value: null, note, partial: false, delta: compareNumbers(now, before) }
}

// 평균 칸은 끝난 칸 전체의 평균이다. 증감은 짝이 모두 끝난 칸끼리만 낸다(stats-core 007.1 '완전한 칸끼리만 증감', AC-511.6과 같은 규칙). 신환·재진 합에는 덜 끝난 칸도 넣는다.
// 두 기간의 자리 수는 같다(날 N개끼리, 달 12개끼리)
export function summaryCells(input: StatsInput): SummaryCell[] {
  const { range } = input
  const now = slotsOf(input, range.current)
  const before = slotsOf(input, range.previous)
  const paired = (_: Slot, i: number) => !now[i].unfinished && !before[i].unfinished
  const current = cellsIn(now)
  const finished = current.filter((cell) => !cell.partial)
  const average = flooredAverage(finished)
  const basis = range.grain === 'month' ? `끝난 달 ${formatCount(finished.length)}달 평균` : `진료한 날 ${formatCount(finished.length)}일 평균`
  return [
    { key: 'average', label: `${AVERAGE_UNIT[range.grain]} 평균 환자 수`, value: average, note: average === null ? NO_DATA : basis, partial: false, delta: null },
    totalCell('new', '신환', current, (cell) => cell.newPatients),
    totalCell('returning', '재진', current, (cell) => cell.returning),
    compareCell(range, finished, cellsIn(now.filter(paired)), cellsIn(before.filter(paired))),
  ]
}

// ── 환자 수 추이 ──────────────────────────────────────────

export function patientTrend(input: StatsInput): BarBucket[] | null {
  const { days, range } = input
  if (range.period !== '12m') return trendBuckets(days, range.current, DAY_COUNT[range.period])
  const cells = cellsIn(slotsOf(input, range.current))
  if (cells.length === 0) return null
  return cells.map((cell) => ({
    key: cell.key,
    label: `${Number(cell.key.slice(5))}월`,
    rangeLabel: monthName(cell.key),
    state: cell.partial ? 'partial' : 'complete',
    values: [cell.newPatients, cell.returning],
  }))
}

// ── 신환 재방문율 ─────────────────────────────────────────

// 재방문을 세는 단위. 일 기간은 날, 12개월은 달이고 단위 안 어느 날이든 N일 값이 null이면 그 단위 전체를 N일 셈에서 뺀다
type RevisitUnit = { from: string; to: string; rows: readonly DayPayload[] }

function revisitUnits(rows: readonly DayPayload[], grain: StatsRange['grain']): RevisitUnit[] {
  if (grain === 'day') return rows.map((row) => ({ from: row.day, to: row.day, rows: [row] }))
  const byMonth = new Map<string, DayPayload[]>()
  for (const row of rows) byMonth.set(monthOf(row.day), [...(byMonth.get(monthOf(row.day)) ?? []), row])
  return [...byMonth.entries()].map(([month, list]) => ({ ...monthRange(month), rows: list }))
}

// within30·after30은 선택 칸이라 빠진 칸은 null로 친다
const countedUnits = (units: readonly RevisitUnit[], key: RevisitKey) => units.filter((unit) => unit.rows.every((row) => (row.revisit[key] ?? null) !== null))
const revisitsIn = (units: readonly RevisitUnit[]) => units.flatMap((unit) => unit.rows.map((row) => row.revisit))
const sumOf = (revisits: readonly Revisit[], key: RevisitKey | 'after30') => sum(revisits, (revisit) => revisit[key] ?? 0)

function rateOf(units: readonly RevisitUnit[], key: RevisitKey): StatsRateCell {
  if (units.length === 0) return NO_RATE
  const counted = countedUnits(units, key)
  if (counted.length === 0) return IN_PROGRESS
  const revisits = revisitsIn(counted)
  const cohort = sum(revisits, (revisit) => revisit.cohort)
  if (cohort === 0) return NO_RATE
  const within = sumOf(revisits, key)
  return { kind: 'rate', value: within / cohort, within, cohort, excluded: counted.length < units.length }
}

// 30일 값이 숫자인 칸들로 센다. 그런 칸이 없거나 신환이 0명이면 null(30일 줄이 '집계 중'이거나 '자료 없음'이다)
function firstRevisitOf(units: readonly RevisitUnit[]): FirstRevisit | null {
  const counted = countedUnits(units, 'within30')
  const revisits = revisitsIn(counted)
  const cohort = sum(revisits, (revisit) => revisit.cohort)
  if (cohort === 0) return null
  const within7 = sumOf(revisits, 'within7')
  const within14 = sumOf(revisits, 'within14')
  const within30 = sumOf(revisits, 'within30')
  const after30 = sumOf(revisits, 'after30')
  return {
    from: counted[0].from,
    to: counted[counted.length - 1].to,
    cohort,
    items: [
      { key: 'within7', label: '7일 안', count: within7 },
      { key: 'days8to14', label: '8~14일', count: within14 - within7 },
      { key: 'days15to30', label: '15~30일', count: within30 - within14 },
      { key: 'after30', label: '30일 넘어 다시 옴', count: after30 },
      { key: 'never', label: '아직 다시 안 옴', count: cohort - within30 - after30 },
    ],
  }
}

// '30d'의 날은 모두 온 지 30일이 안 되어 늘 집계 중이므로, 30일 줄과 첫 재방문까지 날수만 finishedCohort의 날로 센다
export function revisitRates({ days, range }: StatsInput): RevisitRates {
  const units = revisitUnits(rowsIn(days, range.current), range.grain)
  const units30 = range.finishedCohort === null ? units : revisitUnits(rowsIn(days, range.finishedCohort), range.grain)
  const firstRevisit = firstRevisitOf(units30)
  return {
    d7: rateOf(units, 'within7'),
    d14: rateOf(units, 'within14'),
    d30: rateOf(units30, 'within30'),
    d30Cohort: range.finishedCohort !== null && firstRevisit !== null ? { from: firstRevisit.from, to: firstRevisit.to } : null,
    firstRevisit,
  }
}

// ── 요일별 ───────────────────────────────────────────────

export function weekdayBars(days: readonly DayPayload[], range: StatsRange): BarBucket[] | null {
  return weekdayBuckets(days, range.current)
}

// ── 처방 추세 ────────────────────────────────────────────

function chunks<T>(list: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))
}

function pointsByCode(points: readonly TrendPoint[]): Map<string, TrendPoint[]> {
  const byCode = new Map<string, TrendPoint[]>()
  for (const point of points) {
    const list = byCode.get(point.code)
    if (list === undefined) byCode.set(point.code, [point])
    else list.push(point)
  }
  return byCode
}

// 어느 한쪽이라도 partial인 짝을 뺀 나머지 짝. now와 before는 같은 칸 수다(날 N개끼리, 달 12개끼리)
function keptPairs(now: readonly TrendPoint[], before: readonly TrendPoint[]): { current: TrendPoint; previous: TrendPoint }[] {
  return now.flatMap((point, i) => (point.partial || before[i].partial ? [] : [{ current: point, previous: before[i] }]))
}

function comparableOf(now: readonly TrendPoint[], before: readonly TrendPoint[]): RxTrendRow['comparable'] {
  const pairs = keptPairs(now, before)
  if (pairs.length === 0) return null
  return { current: sum(pairs, (pair) => pair.current.count), previous: sum(pairs, (pair) => pair.previous.count) }
}

function rxRow(line: RxLine, now: readonly TrendPoint[], before: readonly TrendPoint[], period: StatsPeriod): RxTrendRow {
  const comparable = comparableOf(now, before)
  return {
    ...line,
    count: sum(now, (point) => point.count),
    newCount: sum(now, (point) => point.newCount),
    returningCount: sum(now, (point) => point.returningCount),
    partial: period === '12m' && now.some((point) => point.partial),
    comparable,
    // compareNumbers(0, 0)은 '변화 없음'이 되므로 견줄 짝이 없으면 부르지 않는다
    delta: comparable === null ? UNAVAILABLE : compareNumbers(comparable.current, comparable.previous),
  }
}

// 증감은 표시 칸과 상관없이 12개월은 달끼리, 일 기간은 날끼리 짝 짓는다. 코드는 대소문자를 합쳐서 받아 나눠 부른다(한 코드가 두 묶음에 들어가면 두 줄이 된다)
function trendRows({ days, covered, range }: StatsInput, lines: readonly RxLine[]): RxTrendRow[] {
  const bucket: TrendBucket = range.grain
  const pointsOf = (span: DateRange, codes: string[]) => pointsByCode(buildTrend(days, covered, { from: span.from, to: span.to, bucket, codes }).points)
  return chunks(lines, TREND_CODE_LIMIT).flatMap((part) => {
    const codes = part.map((line) => line.code)
    const now = pointsOf(range.current, codes)
    const before = pointsOf(range.previous, codes)
    return part.map((line) => rxRow(line, now.get(line.code) ?? [], before.get(line.code) ?? [], range.period))
  })
}

// 기간 안에 나온 처방의 가장 최근 날 글자·이름(대문자 코드 → 줄)
function latestLines({ days, range }: StatsInput): Map<string, RxLine> {
  const lines = new Map<string, RxLine>()
  for (const row of rowsIn(days, range.current)) for (const { code, name } of row.rx) lines.set(codeKey(code), { code, name }) // 뒤의 날이 덮어쓴다
  return lines
}

// 건수가 0인 처방(덮은 기간 밖의 날에만 나옴)은 줄이 아니다
export function rxList(input: StatsInput): RxTrendRow[] | null {
  const rows = trendRows(input, [...latestLines(input).values()])
  const ranked = rows.filter((row) => row.count > 0).sort((a, b) => b.count - a.count || compareText(codeKey(a.code), codeKey(b.code)))
  return ranked.length === 0 ? null : ranked.slice(0, TOP_RX)
}

// 처방 골라 보기 표 (rx-picker REQ-804). 처방 추세와 같은 셈이고 고른 차례 그대로이며 0건 줄도 남는다.
// 코드는 고른 글자 그대로(대소문자만 다른 코드는 처음 것 한 줄로, buildTrend가 뒤 코드의 점을 만들지 않으므로 부르기 전에 합친다)이고 이름은 이 기간 가장 최근 날의 이름, 없으면 저장해 둔 이름이다
export function rxPickRows(input: StatsInput, picks: readonly RxLine[]): RxPickRow[] {
  const latest = latestLines(input)
  const lines = new Map<string, RxLine>()
  for (const { code, name } of picks) if (!lines.has(codeKey(code))) lines.set(codeKey(code), { code, name: latest.get(codeKey(code))?.name ?? name })
  return trendRows(input, [...lines.values()]).map((row) => ({ ...row, gapCount: row.count - row.newCount - row.returningCount }))
}

// 증감을 견준 짝 수. partial은 처방과 상관없어 남은 짝은 모든 처방 줄에서 같으므로 줄마다 세지 않고 한 번만 센다
export function rxComparedCells({ days, covered, range }: StatsInput): { kept: number; dropped: boolean } {
  const pointsOf = (span: DateRange) => buildTrend(days, covered, { from: span.from, to: span.to, bucket: range.grain, codes: [ANY_CODE] }).points
  const now = pointsOf(range.current)
  const kept = keptPairs(now, pointsOf(range.previous)).length
  return { kept, dropped: kept < now.length }
}

const overlaps = (a: DateRange, start: string, end: string) => compareYmd(a.from, end) <= 0 && compareYmd(start, a.to) <= 0

// 칸: 7·30일 = 일, 90일 = 주(월~일), 12개월 = 달. buildTrend의 점 그대로이고, 90일은 두 기간의 칸 수가 달라도 채우거나 자르지 않는다
export function rxDetail({ days, covered, range }: StatsInput, code: string): { current: RxDetailPoint[]; previous: RxDetailPoint[] } {
  const pointsOf = (span: DateRange): RxDetailPoint[] =>
    buildTrend(days, covered, { from: span.from, to: span.to, bucket: DETAIL_BUCKET[range.period], codes: [code] }).points.map((point) => ({
      ...point,
      covered: covered.some((part) => overlaps(part, point.start, point.end)),
    }))
  return { current: pointsOf(range.current), previous: pointsOf(range.previous) }
}
