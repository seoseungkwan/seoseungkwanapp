import { formatCount } from '@/components/charts/format'
import type { BarBucket } from '@/components/charts/StackedBarChart'
import { longDate, periodRange, tickLabels, trendBuckets, weekdayBuckets, type Period, type PeriodRange } from '@/components/dashboard/summary/view'
import { compareNumbers } from '@/lib/analytics/compare'
import { isCovered } from '@/lib/analytics/coverage'
import { addDays, addMonths, compareYmd, eachDay, monthOf, monthRange, weekStartOf } from '@/lib/analytics/dates'
import { buildTrend, comparisonRange } from '@/lib/analytics/rxTrend'
import type { Delta, TrendBucket, TrendPoint } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { hasFinal, pickRange, type StatsChoice } from './periodPick'

// 통계 화면의 숫자 (stats REQ-511, design.md TASK-11). 입력은 일 숫자와 덮은 기간뿐이고 저장된 달 줄은 읽지 않는다.
// 순수 함수다. 날짜는 lib/analytics/dates.ts, 증감은 compareNumbers, 처방 건수는 buildTrend, 대시보드 view의 함수는 불러 쓰기만 한다.
// 자료 없는 날·달을 0으로 채우지 않는다. 덮은 기간 안의 줄 없는 날은 휴진이고 달 칸과 처방 건수에 0을 더한다

export type StatsPeriod = '7d' | '30d' | '90d' | '12m'
export const DEFAULT_STATS_PERIOD: StatsPeriod = '30d'

// 비교 기간 하나. name = 칸 머리·글에 쓰는 이름('9월'·'지난 30일'), why = 괄호 안 까닭('바로 전 달'·빠른 단추는 name과 같다)
export type CompareRange = PeriodRange & { name: string; why: string }

// period null = 고른 기간(stats-period, periodPick.ts의 pickRange). 섹션은 기간 이름 표 대신 name·previous.name·bucket을 읽는다
export type StatsRange = {
  period: StatsPeriod | null
  name: string // '최근 30일' · '2026년 10월'
  current: PeriodRange
  previous: CompareRange
  lastYear: CompareRange | null // 작년 같은 기간(고른 기간만). 빠른 단추·해 고르기는 null
  finishedCohort: DateRange | null // '30d'만: 오늘 − 60 ~ 오늘 − 31(previous와 같은 범위). 온 뒤 30일이 지난 가장 최근 신환
  load: DateRange // 가장 앞 비교 기간 첫날이 든 달의 1일 ~ 오늘
  grain: 'day' | 'month'
  bucket: TrendBucket // 막대·처방 그래프 칸: 7·30일 = 일, 90일 = 주, 12개월 = 달
  label: string
  // 해 고르기만: 자르지 않은 그 해(1월 1일 ~ 12월 31일). 월별 막대는 끝 달 뒤로 이 끝 달까지 앞으로 올 달을 빈 칸으로 잇는다.
  // 빠른 단추·달 고르기·직접 날짜는 없다(직접 날짜 월별은 고른 기간 밖 달을 잇지 않는다)
  whole?: DateRange
}

// days·covered는 저장 모양과 readCoverage가 준 덮은 기간이다
export type StatsInput = { days: readonly DayPayload[]; covered: readonly DateRange[]; range: StatsRange }

// 환자 요약 칸 넷(first90 REQ-4403): 하루(한 달) 평균 내원 · 신환 · 90일초진 · 재진.
// value가 null이면 화면의 값 자리는 "–"이고 note가 까닭이다('자료 없음', 90일초진 확인 불가는 옛 도우미 글). 값이 있으면 note는 ''이다.
// hint = 이름 옆 옅은 글(값이 null이면 null), unit = 값 뒤 작은 단위, partial = '일부 기간' 표시.
// delta = 칸 안 증감 줄(견줄 수 없으면 unavailable, 고른 기간의 신환·90일초진·재진은 null), delta2 = 고른 기간 평균 칸의 작년 비교 둘째 줄(없으면 null).
// unknown = 90일초진을 셀 수 없음(보는 기간에 first90이 없는 날이 있음, AC-4403.3). 그때 재진 값은 90일초진 포함이다
export type SummaryCell = {
  key: 'average' | 'new' | 'first90' | 'returning'
  label: string
  hint: string | null
  value: number | null
  unit: '건' | '명'
  note: string
  partial: boolean
  delta: Delta | null
  delta2: { label: string; delta: Delta } | null
  unknown: boolean
}

// kind 이름은 대시보드 RateCell과 같다. value 0~1. within·cohort = 비율을 낸 두 합, excluded = 값이 null이라 뺀 칸이 있음
export type StatsRateCell = { kind: 'rate'; value: number; within: number; cohort: number; excluded: boolean } | { kind: 'in-progress' } | { kind: 'none' }

// 원본 CohortMonthResult의 네 칸 + 아직 다시 안 옴. 다섯의 합 = cohort. from·to = 센 칸의 첫날·끝날
// after30을 셀 수 없는 줄이 들면 뒤 둘을 after30OrNever 하나로 합친 넷이다(stats-load-range AC-3306.1). 넷의 합도 cohort
export type FirstRevisitKey = 'within7' | 'days8to14' | 'days15to30' | 'after30' | 'never' | 'after30OrNever'
export type FirstRevisit = { from: string; to: string; cohort: number; items: { key: FirstRevisitKey; label: string; count: number }[] }

// spans = 줄마다 실제로 센 날(센 칸의 처음 ~ 끝, 12개월은 달 첫날 ~ 끝날). 비율이 아닌 줄(집계 중·자료 없음)은 null이다(first90 AC-4412.3 '대상: … 에 온 신환')
export type RevisitSpans = { d7: DateRange | null; d14: DateRange | null; d30: DateRange | null }
export type RevisitRates = {
  d7: StatsRateCell
  d14: StatsRateCell
  d30: StatsRateCell
  d30Cohort: DateRange | null
  firstRevisit: FirstRevisit | null
  spans: RevisitSpans
}

// 일별 내원 칸 (first90 AC-4412.2). known = 보는 기간 모든 날에 first90이 있음 → 칸 값 [신환, 90일초진, 재진], 아니면 [신환, 재진(90일초진 포함)]
export type VisitTrend = { buckets: BarBucket[]; known: boolean }
// 내원 구성 도넛 (first90 AC-4412.1). share = 누적 내원 대비 %, 소수 첫째 자리 아래 버림. known이 아니면 신환 · 재진(90일초진 포함) 두 조각이다
export type VisitSlice = { key: 'new' | 'first90' | 'returning'; name: string; tone: 'accent' | 'f90' | 'ret'; value: number; share: number }
export type VisitMix = { total: number; known: boolean; slices: VisitSlice[] }

// 고른 기간의 작년 비교 하나(바로 전은 comparable·delta). previous null = 견줄 수 없음(delta unavailable)
export type YearCompare = { previous: number | null; delta: Delta }

export type RxTrendRow = {
  code: string
  name: string // 가장 최근 날의 이름
  count: number // 순위 기준. 12개월은 덜 끝난 달도 넣는다
  newCount: number
  returningCount: number
  partial: boolean // '12m'에서 건수에 덜 끝난 달이 들면 true('일부 기간' 표시)
  comparable: { current: number; previous: number } | null // 어느 한쪽이라도 덜 끝난 짝을 뺀 합. 남은 짝이 없으면 null
  delta: Delta // comparable이 null이면 { kind: 'unavailable' }
  lastYear?: YearCompare // 고른 기간 + 작년 비교일 때만
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
export const PERIOD_NAME: Record<StatsPeriod, string> = { '7d': '최근 7일', '30d': '최근 30일', '90d': '최근 90일', '12m': '최근 12개월' }
export const COMPARE_NAME: Record<StatsPeriod, string> = { '7d': '지난 7일', '30d': '지난 30일', '90d': '지난 90일', '12m': '작년 같은 12달' }
const AVERAGE_UNIT: Record<StatsRange['grain'], string> = { day: '하루', month: '한 달' }
const DETAIL_BUCKET: Record<StatsPeriod, TrendBucket> = { '7d': 'day', '30d': 'day', '90d': 'week', '12m': 'month' }
const YEAR_MONTHS = 12
const TICK_DAYS = 31 // 고른 기간 일별 눈금: 31일 이하는 30일 기간의 눈금(7일마다), 넘으면 90일 기간의 눈금(21일마다)
const WEEK_LABEL_ALL = 6 // 주 칸이 이보다 많으면 날짜 글자를 세 칸마다(처방 그래프의 주 칸과 같다)
const WEEK_LABEL_STEP = 3
const TOP_RX = 5
const TREND_CODE_LIMIT = 200 // buildTrend가 한 번에 받는 코드 수(넘으면 RangeError)
// 점의 partial만 읽을 때 넘기는 코드. buildTrend는 코드가 0개면 RangeError이고 partial은 코드와 상관없다
const ANY_CODE = '-'

const NO_RATE: StatsRateCell = { kind: 'none' }
const IN_PROGRESS: StatsRateCell = { kind: 'in-progress' }
const UNAVAILABLE: Delta = { kind: 'unavailable' }
const NO_DATA = '자료 없음'

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

type QuickRanges = { current: PeriodRange; previous: PeriodRange }

function dayRanges(today: string, days: Period): QuickRanges {
  const current = periodRange(today, days)
  const { from, to } = comparisonRange(current.from, current.to, 'PreviousEqualDays')
  return { current, previous: { from, to, label: periodRange(current.from, days).label } } // periodRange(첫날, N) = 그 앞 N일
}

function yearRanges(today: string): QuickRanges {
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
    name: PERIOD_NAME[period],
    current,
    previous: { ...previous, name: COMPARE_NAME[period], why: COMPARE_NAME[period] },
    lastYear: null,
    finishedCohort: period === '30d' ? { from: addDays(today, -60), to: addDays(today, -31) } : null,
    load: { from: monthRange(monthOf(previous.from)).from, to: today },
    grain: period === '12m' ? 'month' : 'day',
    bucket: DETAIL_BUCKET[period],
    label: current.label,
  }
}

// 빠른 단추는 statsRange, 고른 기간은 pickRange(periodPick.ts는 이 파일에서 타입만 불러와 실행 순환이 없다)
export function rangeOf(today: string, choice: StatsChoice, todayDone: boolean): StatsRange {
  return typeof choice === 'string' ? statsRange(today, choice) : pickRange(today, choice, todayDone)
}

// 가장 앞 비교 첫날 ~ current 끝(저장하지 못한 숫자를 얹는 날, AC-1706.3)
export function readSpan(range: StatsRange): DateRange {
  const first = range.lastYear !== null && compareYmd(range.lastYear.from, range.previous.from) < 0 ? range.lastYear.from : range.previous.from
  return { from: first, to: range.current.to }
}

// 섹션 설명. 고른 기간이면 끝에 ' · {name}', 빠른 단추면 그대로(AC-1704.4)
export function periodDesc(desc: string, range: StatsRange): string {
  return range.period === null ? `${desc} · ${range.name}` : desc
}

// ── 칸(일 기간은 날, 12개월은 달) ─────────────────────────

// first90 = 칸의 모든 줄에 first90이 있을 때만 그 합(아니면 null). returningWith90 = 줄마다 returning + (first90 ?? 0)의 합(옛 도우미 날의 재진과 같은 셈)
type Cell = { key: string; patients: number; newPatients: number; returning: number; first90: number | null; returningWith90: number; partial: boolean }

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
    first90: rows.every((row) => typeof row.totals.first90 === 'number') ? sum(rows, (row) => row.totals.first90 ?? 0) : null,
    returningWith90: sum(rows, (row) => row.totals.returning + (row.totals.first90 ?? 0)),
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

// ── 환자 요약 (first90 REQ-4403) ──────────────────────────

const SUMMARY_DESC = '접수 기준 · 같은 분이 여러 번 오면 여러 건'
const OLD_FIRST90 = '예전 도우미(0.6.0)는 90일초진을 따로 세지 못해요. 지금은 재진에 들어 있어요.'

/** 환자 요약 옆 글(AC-4403.1): '접수 기준 · 같은 분이 여러 번 오면 여러 건 · 증감은 {비교 이름}과/와 비교' */
export function summaryDesc(range: StatsRange): string {
  const name = range.previous.name
  return `${SUMMARY_DESC} · 증감은 ${name}${hasFinal(name) ? '과' : '와'} 비교`
}

// 보는 기간의 모든 날 줄에 first90이 있는지(도우미 v4). 줄이 없으면 참이다(확인 불가가 아니라 '자료 없음')
const knowsFirst90 = (input: StatsInput) => rowsIn(input.days, input.range.current).every((row) => typeof row.totals.first90 === 'number')

// 짝이 끝난 칸끼리(빠르게 보기의 증감). 고른 기간은 짝 짓지 않아 null이다
type Paired = { now: readonly Cell[]; before: readonly Cell[] }

const averageDelta = (now: number | null, before: number | null): Delta => (now === null || before === null ? UNAVAILABLE : compareNumbers(now, before))

// 합 증감: 짝이 끝난 칸끼리의 합을 견준다. 어느 쪽이든 칸이 없거나, 셀 수 없는 칸(of가 null)이 있으면 견줄 수 없다
function sumDelta(paired: Paired, of: (cell: Cell) => number | null): Delta {
  if (paired.now.length === 0 || paired.before.length === 0) return UNAVAILABLE
  const total = (cells: readonly Cell[]) => {
    let n = 0
    for (const cell of cells) {
      const value = of(cell)
      if (value === null) return null
      n += value
    }
    return n
  }
  return averageDelta(total(paired.now), total(paired.before))
}

function averageCell(label: string, value: number | null, basis: string, delta: Delta, delta2: SummaryCell['delta2']): SummaryCell {
  return { key: 'average', label, hint: value === null ? null : basis, value, unit: '건', note: value === null ? NO_DATA : '', partial: false, delta, delta2, unknown: false }
}

function countCell(key: 'new' | 'first90' | 'returning', label: string, hint: string, unit: SummaryCell['unit'], cells: readonly Cell[], of: (cell: Cell) => number, delta: Delta | null): SummaryCell {
  const none = cells.length === 0
  return { key, label, hint: none ? null : hint, value: none ? null : sum(cells, of), unit, note: none ? NO_DATA : '', partial: cells.some((cell) => cell.partial), delta, delta2: null, unknown: false }
}

// 신환·90일초진·재진. 합에는 덜 끝난 칸도 넣는다(일부 기간 표시). 90일초진을 셀 수 있으면 재진 = returning이고, 증감은 짝 칸 모두에 first90이 있을 때만 낸다
// (비교 쪽 재진에 90일초진이 섞이면 지어낸 줄어듦이 된다). 셀 수 없으면 90일초진은 확인 불가이고 재진 = returning + first90(양쪽 같은 셈)이다(AC-4403.3)
function countCells(current: readonly Cell[], known: boolean, paired: Paired | null): SummaryCell[] {
  const delta = (of: (cell: Cell) => number | null) => (paired === null ? null : sumDelta(paired, of))
  const first90: SummaryCell = known
    ? countCell('first90', '90일초진', '90일 넘어 다시 온 내원', '건', current, (cell) => cell.first90 ?? 0, delta((cell) => cell.first90))
    : { key: 'first90', label: '90일초진', hint: null, value: null, unit: '건', note: OLD_FIRST90, partial: false, delta: null, delta2: null, unknown: true }
  const returning = known
    ? countCell('returning', '재진', '그 밖의 내원', '건', current, (cell) => cell.returning, delta((cell) => (cell.first90 === null ? null : cell.returning)))
    : countCell('returning', '재진', '90일초진 포함', '건', current, (cell) => cell.returningWith90, delta((cell) => cell.returningWith90))
  return [countCell('new', '신환', '처음 온 환자', '명', current, (cell) => cell.newPatients, delta((cell) => cell.newPatients)), first90, returning]
}

// 평균 칸은 끝난 칸 전체의 평균이다. 증감은 짝이 모두 끝난 칸끼리만 낸다(stats-core 007.1 '완전한 칸끼리만 증감', AC-511.6과 같은 규칙):
// 평균은 그 칸들의 버린 평균끼리, 신환·90일초진·재진은 그 칸들의 합끼리. 두 기간의 자리 수는 같다(날 N개끼리, 달 12개끼리)
export function summaryCells(input: StatsInput): SummaryCell[] {
  const { range } = input
  if (range.period === null) return pickSummaryCells(input)
  const now = slotsOf(input, range.current)
  const before = slotsOf(input, range.previous)
  const isPaired = (_: Slot, i: number) => !now[i].unfinished && !before[i].unfinished
  const paired: Paired = { now: cellsIn(now.filter(isPaired)), before: cellsIn(before.filter(isPaired)) }
  const current = cellsIn(now)
  const finished = current.filter((cell) => !cell.partial)
  const average = flooredAverage(finished)
  const basis = range.grain === 'month' ? `끝난 달 ${formatCount(finished.length)}달 평균` : `진료한 날 ${formatCount(finished.length)}일 평균`
  return [
    averageCell(`${AVERAGE_UNIT[range.grain]} 평균 내원`, average, basis, averageDelta(flooredAverage(paired.now), flooredAverage(paired.before)), null),
    ...countCells(current, knowsFirst90(input), paired),
  ]
}

// 고른 기간의 비교 하나. 날 수가 달라 짝 짓지 않고 기간마다 끝난 날 평균(버림)을 낸다.
// 비교 기간에 끝나지 않은 날(줄 없고 덮지 않음, partial 줄)이 하루라도 있거나 진료한 날이 없으면 견주지 않는다(0이 아니다)
function pickDelta(input: StatsInput, span: CompareRange, average: number | null): Delta {
  const slots = slotsOf(input, span)
  return averageDelta(average, slots.some((slot) => slot.unfinished) ? null : flooredAverage(cellsIn(slots)))
}

// 고른 기간(AC-1704.1·AC-1704.2, first90 AC-4403.2): 평균 칸에만 증감이 있다(delta = 바로 전, delta2 = 작년 같은 기간). 고른 기간은 늘 일 칸이다
function pickSummaryCells(input: StatsInput): SummaryCell[] {
  const { range } = input
  const current = cellsIn(slotsOf(input, range.current))
  const finished = current.filter((cell) => !cell.partial)
  const average = flooredAverage(finished)
  const delta2 = range.lastYear === null ? null : { label: `${range.lastYear.name}보다`, delta: pickDelta(input, range.lastYear, average) }
  return [
    averageCell('하루 평균 내원', average, `진료한 날 ${formatCount(finished.length)}일 평균`, pickDelta(input, range.previous, average), delta2),
    ...countCells(current, knowsFirst90(input), null),
  ]
}

// 고른 기간에서 평균에 넣지 못한 끝나지 않은 날 수(줄 없고 덮지 않음, partial 줄). 빠른 단추는 0이다(기간 요약 설명 ' · 자료 없는 날 N일은 빼고 셌어요', AC-1704.2)
export function missingDays(input: StatsInput): number {
  if (input.range.period !== null) return 0
  return slotsOf(input, input.range.current).filter((slot) => slot.unfinished).length
}

// ── 환자 수 추이 ──────────────────────────────────────────

export function patientTrend(input: StatsInput): BarBucket[] | null {
  const { days, range } = input
  if (range.period === null) return pickTrend(input)
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

// 줄의 신환·재진 값만 바꾼다(칸·상태 셈은 patientTrend 그대로 빌린다, 대시보드 flow.ts와 같은 방법)
const withCounts = (input: StatsInput, counts: (totals: DayPayload['totals']) => { newPatients: number; returning: number }): StatsInput => ({
  ...input,
  days: input.days.map((row) => ({ ...row, totals: { ...row.totals, ...counts(row.totals) } })),
})

// 일별 내원 (first90 AC-4412.2). 칸·글·상태·빈 칸은 patientTrend 그대로이고 값만 세 갈래(또는 90일초진을 재진에 되돌린 두 갈래)다.
// 빈 칸(blank)은 patientTrend가 값 0으로 두므로 세 갈래도 [0, 0, 0]이다. 보는 기간에 줄이 없으면 null
export function visitTrend(input: StatsInput): VisitTrend | null {
  const known = knowsFirst90(input)
  if (!known) {
    const buckets = patientTrend(withCounts(input, (t) => ({ newPatients: t.newPatients, returning: t.returning + (t.first90 ?? 0) })))
    return buckets === null ? null : { buckets, known }
  }
  const base = patientTrend(input)
  const first90 = patientTrend(withCounts(input, (t) => ({ newPatients: t.first90 ?? 0, returning: 0 })))
  if (base === null || first90 === null) return null
  return { known, buckets: base.map((bucket, i) => ({ ...bucket, values: [bucket.values[0] ?? 0, first90[i]?.values[0] ?? 0, bucket.values[1] ?? 0] })) }
}

const shareOf = (value: number, total: number) => (total === 0 ? 0 : Math.floor((value * 1000) / total) / 10)

// 내원 구성 (first90 AC-4412.1): 보는 기간 일 줄의 누적 내원(같은 분이 여러 번 오면 여러 건). 줄이 없으면 null
export function visitMix(input: StatsInput): VisitMix | null {
  const rows = rowsIn(input.days, input.range.current)
  if (rows.length === 0) return null
  const known = knowsFirst90(input)
  const newPatients = sum(rows, (row) => row.totals.newPatients)
  const first90 = sum(rows, (row) => row.totals.first90 ?? 0)
  const returning = sum(rows, (row) => row.totals.returning) + (known ? 0 : first90)
  const parts: Omit<VisitSlice, 'share'>[] = known
    ? [
        { key: 'new', name: '신환', tone: 'accent', value: newPatients },
        { key: 'first90', name: '90일초진', tone: 'f90', value: first90 },
        { key: 'returning', name: '재진', tone: 'ret', value: returning },
      ]
    : [
        { key: 'new', name: '신환', tone: 'accent', value: newPatients },
        { key: 'returning', name: '재진', tone: 'ret', value: returning },
      ]
  const total = sum(parts, (part) => part.value)
  return { total, known, slices: parts.map((part) => ({ ...part, share: shareOf(part.value, total) })) }
}

// 고른 기간의 막대(AC-1704.3). 칸을 모두 만든다: 일별은 날마다(휴진한 날 = 줄 없고 덮은 날만 칸 없음), 주별은 월–일을 기간으로 자름,
// 월별은 달마다(해 고르기는 1월~12월). 자료 없는 칸은 blank 'no-data'(0이 아니다), 해 고르기의 앞으로 올 달은 blank 'future'다. 기간에 줄이 없으면 null
function pickTrend({ days, covered, range }: StatsInput): BarBucket[] | null {
  const rows = rowsIn(days, range.current)
  if (rows.length === 0) return null
  const merged = [...covered]
  const lookup: DayLookup = { byDay: new Map(rows.map((row) => [row.day, row])), isIn: (day) => isCovered({ from: day, to: day }, merged) }
  if (range.bucket === 'day') return dayBars(range.current, lookup)
  return range.bucket === 'week' ? weekBars(range.current, lookup) : monthBars(range, lookup)
}

// 고른 기간 안 일 줄(날 → 줄)과 덮은 날인지
type DayLookup = { byDay: ReadonlyMap<string, DayPayload>; isIn: (day: string) => boolean }

function dayBars(current: PeriodRange, { byDay, isIn }: DayLookup): BarBucket[] {
  const all = eachDay(current)
  const ticks = new Map(tickLabels(current, all.length <= TICK_DAYS ? 30 : 90).map((tick) => [tick.day, tick.label]))
  return all.flatMap((day): BarBucket[] => {
    const row = byDay.get(day)
    const head = { key: day, label: ticks.get(day) ?? '', rangeLabel: longDate(day) }
    if (row === undefined) return isIn(day) ? [] : [{ ...head, state: 'partial', values: [0, 0], blank: 'no-data' }]
    return [{ ...head, state: row.partial ? 'partial' : 'complete', values: [row.totals.newPatients, row.totals.returning] }]
  })
}

// 칸 하나(주·달). 기간에 잘렸거나 덮지 않은 날·partial 줄이 들면 일부 기간이고, 줄이 하나도 없으면 자료 없음이다. 합에는 칸 안 줄을 모두 넣는다
function spanBar(head: Pick<BarBucket, 'key' | 'label' | 'rangeLabel'>, clipped: DateRange, whole: DateRange, { byDay, isIn }: DayLookup): BarBucket {
  const inside = eachDay(clipped)
  const rows = inside.flatMap((day) => byDay.get(day) ?? [])
  const cut = clipped.from !== whole.from || clipped.to !== whole.to
  const settled = inside.every((day) => isIn(day) && byDay.get(day)?.partial !== true)
  const state = cut || !settled ? 'partial' : 'complete'
  if (rows.length === 0) return { ...head, state, values: [0, 0], blank: 'no-data' }
  return { ...head, state, values: [sum(rows, (row) => row.totals.newPatients), sum(rows, (row) => row.totals.returning)] }
}

const later = (a: string, b: string) => (compareYmd(a, b) >= 0 ? a : b)
const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)
const shortDate = (ymd: string) => `${Number(ymd.slice(5, 7))}.${Number(ymd.slice(8, 10))}`

// '10월 1일 – 4일' · '9월 28일 – 10월 4일' · 하루면 '10월 1일'
function spanText({ from, to }: DateRange): string {
  if (from === to) return longDate(from)
  return `${longDate(from)} – ${monthOf(from) === monthOf(to) ? `${Number(to.slice(8, 10))}일` : longDate(to)}`
}

function weekBars(current: PeriodRange, lookup: DayLookup): BarBucket[] {
  const weeks: DateRange[] = []
  for (let start = weekStartOf(current.from); compareYmd(start, current.to) <= 0; start = addDays(start, 7)) weeks.push({ from: start, to: addDays(start, 6) })
  const step = weeks.length <= WEEK_LABEL_ALL ? 1 : WEEK_LABEL_STEP
  return weeks.map((whole, i) => {
    const clipped = { from: later(whole.from, current.from), to: earlier(whole.to, current.to) }
    const head = { key: clipped.from, label: i % step === 0 ? shortDate(clipped.from) : '', rangeLabel: spanText(clipped) }
    return spanBar(head, clipped, whole, lookup)
  })
}

// 달 칸: 기간 첫 달 ~ 끝 달. 해 고르기(range.whole)만 끝 달 뒤로 그 해 12월까지, 앞으로 올 달(첫날이 오늘 이후)일 때 빈 칸으로 잇는다(1월~12월).
// 직접 날짜 월별은 이번 달에서 끝나도 고른 기간 밖 달을 붙이지 않는다
function monthBars(range: StatsRange, lookup: DayLookup): BarBucket[] {
  const { current } = range
  const head = (month: string) => ({ key: month, label: `${Number(month.slice(5))}월`, rangeLabel: monthName(month) })
  const bars: BarBucket[] = []
  for (let month = monthOf(current.from); compareYmd(`${month}-01`, current.to) <= 0; month = addMonths(month, 1)) {
    const whole = monthRange(month)
    bars.push(spanBar(head(month), { from: later(whole.from, current.from), to: earlier(whole.to, current.to) }, whole, lookup))
  }
  if (range.whole === undefined) return bars
  const lastMonth = monthOf(range.whole.to)
  for (let month = addMonths(monthOf(current.to), 1); compareYmd(month, lastMonth) <= 0 && compareYmd(`${month}-01`, range.load.to) >= 0; month = addMonths(month, 1)) {
    bars.push({ ...head(month), state: 'partial', values: [0, 0], blank: 'future' })
  }
  return bars
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

// 30일 값이 숫자인 칸들로 센다. 그런 칸이 없거나 신환이 0명이면 null(30일 줄이 '집계 중'이거나 '자료 없음'이다).
// 센 칸에 after30이 null(없음 포함)인 줄이 하나라도 들면 — 나눠 읽기의 옛 조각(stats-load-range AC-3302.7) — '30일 넘어 다시 옴'과
// '아직 다시 안 옴'을 나눌 수 없어 '30일 넘어 다시 왔거나 아직 안 옴'(집단 − 30일 안) 하나로 합친다(AC-3306.1). null을 0으로 치지 않는다
function firstRevisitOf(units: readonly RevisitUnit[]): FirstRevisit | null {
  const counted = countedUnits(units, 'within30')
  const revisits = revisitsIn(counted)
  const cohort = sum(revisits, (revisit) => revisit.cohort)
  if (cohort === 0) return null
  const within7 = sumOf(revisits, 'within7')
  const within14 = sumOf(revisits, 'within14')
  const within30 = sumOf(revisits, 'within30')
  const head: FirstRevisit['items'] = [
    { key: 'within7', label: '7일 안', count: within7 },
    { key: 'days8to14', label: '8~14일', count: within14 - within7 },
    { key: 'days15to30', label: '15~30일', count: within30 - within14 },
  ]
  const range = { from: counted[0].from, to: counted[counted.length - 1].to, cohort }
  if (revisits.some((revisit) => (revisit.after30 ?? null) === null)) {
    return { ...range, items: [...head, { key: 'after30OrNever', label: '30일 넘어 다시 왔거나 아직 안 옴', count: cohort - within30 }] }
  }
  const after30 = sumOf(revisits, 'after30')
  return {
    ...range,
    items: [...head, { key: 'after30', label: '30일 넘어 다시 옴', count: after30 }, { key: 'never', label: '아직 다시 안 옴', count: cohort - within30 - after30 }],
  }
}

// 비율 줄이 실제로 센 칸의 처음 ~ 끝(비율이 아니면 null)
function spanOf(units: readonly RevisitUnit[], key: RevisitKey, cell: StatsRateCell): DateRange | null {
  if (cell.kind !== 'rate') return null
  const counted = countedUnits(units, key)
  return { from: counted[0]!.from, to: counted[counted.length - 1]!.to }
}

// '30d'의 날은 모두 온 지 30일이 안 되어 늘 집계 중이므로, 30일 줄과 첫 재방문까지 날수만 finishedCohort의 날로 센다
export function revisitRates({ days, range }: StatsInput): RevisitRates {
  const units = revisitUnits(rowsIn(days, range.current), range.grain)
  const units30 = range.finishedCohort === null ? units : revisitUnits(rowsIn(days, range.finishedCohort), range.grain)
  const firstRevisit = firstRevisitOf(units30)
  const d7 = rateOf(units, 'within7')
  const d14 = rateOf(units, 'within14')
  const d30 = rateOf(units30, 'within30')
  return {
    d7,
    d14,
    d30,
    d30Cohort: range.finishedCohort !== null && firstRevisit !== null ? { from: firstRevisit.from, to: firstRevisit.to } : null,
    firstRevisit,
    spans: { d7: spanOf(units, 'within7', d7), d14: spanOf(units, 'within14', d14), d30: spanOf(units30, 'within30', d30) },
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

function rxRow(line: RxLine, now: readonly TrendPoint[], before: readonly TrendPoint[], period: StatsPeriod | null): RxTrendRow {
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

const finishedPoints = (points: readonly TrendPoint[]) => points.every((point) => !point.partial)

// 고른 기간의 비교 하나: 두 기간의 점이 모두 끝났을 때만 비교 기간 전체 합과 견준다(AC-1705.1)
function wholeCompare(count: number, nowDone: boolean, points: readonly TrendPoint[]): YearCompare {
  if (!nowDone || !finishedPoints(points)) return { previous: null, delta: UNAVAILABLE }
  const previous = sum(points, (point) => point.count)
  return { previous, delta: compareNumbers(count, previous) }
}

// 고른 기간의 처방 줄. 짝을 짓지 않는다(날 수가 다르다). 바로 전은 comparable·delta, 작년은 lastYear(작년 비교가 있을 때만)
function pickRxRow(line: RxLine, now: readonly TrendPoint[], before: readonly TrendPoint[], yearAgo: readonly TrendPoint[] | null): RxTrendRow {
  const count = sum(now, (point) => point.count)
  const nowDone = finishedPoints(now)
  const previous = wholeCompare(count, nowDone, before)
  return {
    ...line,
    count,
    newCount: sum(now, (point) => point.newCount),
    returningCount: sum(now, (point) => point.returningCount),
    partial: false,
    comparable: previous.previous === null ? null : { current: count, previous: previous.previous },
    delta: previous.delta,
    ...(yearAgo === null ? {} : { lastYear: wholeCompare(count, nowDone, yearAgo) }),
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
    if (range.period !== null) return part.map((line) => rxRow(line, now.get(line.code) ?? [], before.get(line.code) ?? [], range.period))
    const yearAgo = range.lastYear === null ? null : pointsOf(range.lastYear, codes)
    return part.map((line) => pickRxRow(line, now.get(line.code) ?? [], before.get(line.code) ?? [], yearAgo === null ? null : (yearAgo.get(line.code) ?? [])))
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
// 고른 기간은 짝을 짓지 않아 '짝만 견줘요' 안내가 없다
export function rxComparedCells({ days, covered, range }: StatsInput): { kept: number; dropped: boolean } {
  if (range.period === null) return { kept: 0, dropped: false }
  const pointsOf = (span: DateRange) => buildTrend(days, covered, { from: span.from, to: span.to, bucket: range.grain, codes: [ANY_CODE] }).points
  const now = pointsOf(range.current)
  const kept = keptPairs(now, pointsOf(range.previous)).length
  return { kept, dropped: kept < now.length }
}

const overlaps = (a: DateRange, start: string, end: string) => compareYmd(a.from, end) <= 0 && compareYmd(start, a.to) <= 0

// 칸: 7·30일 = 일, 90일 = 주(월~일), 12개월 = 달. buildTrend의 점 그대로이고, 90일은 두 기간의 칸 수가 달라도 채우거나 자르지 않는다
export function rxDetail({ days, covered, range }: StatsInput, code: string): { current: RxDetailPoint[]; previous: RxDetailPoint[] } {
  const pointsOf = (span: DateRange): RxDetailPoint[] =>
    buildTrend(days, covered, { from: span.from, to: span.to, bucket: range.bucket, codes: [code] }).points.map((point) => ({
      ...point,
      covered: covered.some((part) => overlaps(part, point.start, point.end)),
    }))
  return { current: pointsOf(range.current), previous: pointsOf(range.previous) }
}
