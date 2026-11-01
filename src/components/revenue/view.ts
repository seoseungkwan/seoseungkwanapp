import { formatCount, formatRate } from '@/components/charts/format'
import { niceScale } from '@/components/charts/scale'
import { addMonths, todayInKorea } from '@/lib/analytics/dates'
import { errorInfo } from '@/lib/errors'
import { compare, firstMonth, monthSeries, perVisit, periodsFor, sumPeriod, type MonthPoint, type PeriodSum } from '@/lib/revenue/summary'
import type { SyncResult } from '@/lib/revenue/sync'
import { groupTreatments, suggestGroups } from '@/lib/revenue/treatments'
import type { DateRange } from '@/types/dates'
import type { RevenueCodeRow, RevenueDayRow } from '@/types/revenue'
import type { RxGroup } from '@/types/rxGroups'
import { formatManWon, formatWon } from './money'

// 매출 화면의 보기 모양(spec revenue design.md 9절, REQ-008). 순수 함수다: React·네트워크·저장소 없음, 오늘은 인자로만 받는다.
// 글자는 승인된 시안 docs/mockups/revenue/gen.py 그대로다. 숫자는 받은 자료에서만 나온다(자료가 없으면 "–"와 "자료 없음", AC-008.4)

const DASH = '–'
const NO_DATA = '자료 없음'
const MINUS = '−'
// 그리는 위치 %를 자를 때 부동소수 오차(28.999…)를 막는다(components/charts/format.ts와 같은 규칙)
const EPSILON = 1e-9
const WON_PER_MAN = 10_000
const WON_PER_CHEON = 1_000
const TITLE = '매출'
const SAFE = '환자 이름·차트번호는 가져오지 않아요. 날짜별 합계 금액만 비트 PC에서 읽어 저장해요.'
const NO_CODE = 'E-PAGE-FAILED'
const GROUP_LOAD_FAILED = 'E-REVENUE-GROUP-LOAD-FAILED'

export type RevenueSync = {
  state: 'idle' | 'running' | 'error'
  done?: number
  total?: number
  /**
   * 'YYYY년 M월 읽는 중' 글자에 쓸 달 'YYYY-MM'. 주지 않으면 그 글자가 없다.
   * syncRevenue의 onProgress가 주는 month는 지금 읽는 달이 아니라 막 끝낸 달이라서 그대로 넘기면 글자가 틀린다
   */
  month?: string
  /** syncRevenue의 stopped */
  code?: string
} & Partial<Pick<SyncResult, 'failed' | 'helperOld' | 'extensionOld'>>

export type RevenueViewInput = {
  days: RevenueDayRow[]
  codes: (RevenueCodeRow & { month: string })[]
  /** listGroups() 결과(빈 목록이면 제안으로 센다) 또는 읽기 실패(제안으로 바꾸지 않는다) */
  groups: RxGroup[] | 'load-failed'
  fetchedAt: string | null
  /** 고른 달 'YYYY-MM' */
  month: string
  today: string
  bridge: 'ready' | 'none' | 'helper-old'
  sync: RevenueSync
}

export type Tone = 'ink' | 'warn' | 'up' | 'down' | 'flat' | 'none'
/** 숫자 칸. srText = 화면 읽기로 주는 방향("늘어남"·"줄어듦") */
export type Kpi = { name: string; value: string; sub: string | null; tone: Tone; srText: string }
export type DeltaText = { dir: 'up' | 'down' | 'flat' | 'none'; text: string; srText: string }
/** lead는 굵게, rest는 이어서 */
export type Notice = { lead: string; rest: string }
export type SrTable = { caption: string; head: string[]; rows: string[][] }
export type LegendItem = { key: string; label: string }
export type Axis = { unit: string; ticks: { label: string; bottom: number }[] }
export type BarKind = 'selected' | 'last-year' | 'other'
type Column = { month: string; label: string; year: string; kind: BarKind; partial: boolean }
export type BarColumn = Column & { bar: { height: number; value: string } | null }
export type StackSegment = { key: 'covered' | 'noncovered' | 'other'; height: number }
export type StackColumn = Column & { segments: StackSegment[] | null }
type Chart<C> = { title: string; legend: LegendItem[]; axis: Axis; columns: C[]; table: SrTable }
export type BarChart = Chart<BarColumn>
export type StackChart = Chart<StackColumn>

export type TrendView = { title: string; sub: string; kpis: Kpi[]; chart: BarChart | null }
export type SplitRow = { name: string; kind: 'main' | 'sub' | 'sum'; amount: string; share: string; delta: DeltaText }
export type SplitView = { title: string; sub: string; notice: Notice | null; head: string[]; rows: SplitRow[]; note: string; chart: StackChart | null }
export type TreatmentRow = { name: string; amount: string; share: string; detail: string; width: number; rest: boolean; missing: boolean }
type TreatmentsHead = { title: string; sub: string; editLabel: string; editDisabled: boolean }
export type TreatmentsView = TreatmentsHead &
  (
    | { kind: 'rows'; chip: string | null; rows: TreatmentRow[]; note: string }
    | { kind: 'none'; chip: string | null; text: string }
    | { kind: 'load-failed'; heading: string; body: string; retry: string; code: string }
  )
export type PerVisitView = { title: string; sub: string; kpis: Kpi[]; chart: BarChart | null; note: string; notice: Notice | null }
export type RevenueBlocks = { trend: TrendView; split: SplitView; treatments: TreatmentsView; perVisit: PerVisitView }

export type HeaderView = { title: string; meta: string | null; refresh: string | null }
export type PeriodView = { label: string; note: string }
export type EmptyMonth = { heading: string; kpis: Kpi[]; note: string }
export type FailedNotice = { lead: string; months: string; rest: string; retry: string; list: string[] }
export type Progress = { done: number; total: number; lead: string; strong: string; rest: string; reading: string | null; width: number }
type Upgrade = { title: string; heading: string; body: string; action: string; code: string }

export type RevenueView =
  | {
      state: 'connect-needed'
      title: string
      chip: string
      heading: string
      body: string
      action: string
      gainsTitle: string
      gains: { name: string; text: string }[]
      safe: string
    }
  | { state: 'fetching'; title: string; heading: string; body: string; progress: Progress | null; note: string; safe: string }
  | ({ state: 'helper-old' } & Upgrade)
  | ({ state: 'extension-old' } & Upgrade)
  | { state: 'error'; title: string; code: string }
  | { state: 'empty'; title: string; period: PeriodView; failed: FailedNotice | null; empty: EmptyMonth }
  | { state: 'ready'; header: HeaderView; period: PeriodView; failed: FailedNotice | null; blocks: RevenueBlocks; safe: string }
  | {
      state: 'saved-only'
      header: HeaderView
      period: PeriodView
      notice: Notice & { action: string }
      blocks: RevenueBlocks | null
      empty: EmptyMonth | null
      safe: string
    }

// ── 글자 ─────────────────────────────────────────────────

const monthName = (month: string) => `${Number(month.slice(5, 7))}월`
const fullMonthName = (month: string) => `${Number(month.slice(0, 4))}년 ${monthName(month)}`
const dayNumber = (ymd: string) => Number(ymd.slice(8, 10))
const countText = (n: number) => `${formatCount(n)}건`
const shareText = (part: number, whole: number) => (whole > 0 ? `${formatRate(part / whole)}%` : DASH)

// 그리는 위치 %: 0~100, 소수 둘째 자리까지 버림. max가 0 이하이면 0
function percent(value: number, max: number): number {
  if (!(max > 0)) return 0
  return Math.min(100, Math.max(0, Math.trunc((value / max) * 10_000 + EPSILON) / 100))
}

// 달을 앞에 한 번 쓰고 이어진 날을 묶는다: "10월 1일–3일·5일–10일". 받는 날짜는 한 달 안, 날짜 순이다(sumPeriod의 목록)
function dayList(dates: string[]): string {
  const runs: [number, number][] = []
  for (const date of dates) {
    const day = dayNumber(date)
    const last = runs.at(-1)
    if (last && last[1] + 1 === day) last[1] = day
    else runs.push([day, day])
  }
  const days = runs.map(([from, to]) => (from === to ? `${from}일` : `${from}일–${to}일`)).join('·')
  return `${monthName(dates[0]!)} ${days}`
}

// 달 목록: "2025년 11월·12월", 해가 바뀌면 해를 다시 쓴다
function monthList(months: string[]): string {
  return months.map((month, index) => (months[index - 1]?.slice(0, 4) === month.slice(0, 4) ? monthName(month) : fullMonthName(month))).join('·')
}

function dayNotice(dates: string[], rest: string): Notice | null {
  return dates.length === 0 ? null : { lead: `${dates.length}일(${dayList(dates)})`, rest }
}

const KOREA_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// "11월 1일 07:10". 날짜는 dates.ts, 시각은 Asia/Seoul로 읽는다(components/shell/kstNow.ts와 같은 방식) → PC 시간대와 상관없다
function fetchedText(iso: string): string {
  const at = new Date(iso)
  const ymd = todayInKorea(at)
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(at).map((p) => [p.type, p.value]))
  return `${monthName(ymd)} ${dayNumber(ymd)}일 ${parts.hour}:${parts.minute}`
}

const NO_DELTA: DeltaText = { dir: 'none', text: DASH, srText: '' }

// 버려서 0이 되면 시안처럼 "변화 없음"이다
function deltaText(now: number | null, before: number | null): DeltaText {
  const change = compare(now, before)
  if (change === null) return NO_DELTA
  if (change.rate === 0) return { dir: 'flat', text: '변화 없음', srText: '' }
  const size = Math.abs(change.rate).toFixed(1)
  return change.rate > 0 ? { dir: 'up', text: `+${size}%`, srText: '늘어남' } : { dir: 'down', text: `${MINUS}${size}%`, srText: '줄어듦' }
}

const blankKpi = (name: string): Kpi => ({ name, value: DASH, sub: NO_DATA, tone: 'none', srText: '' })

function deltaKpi(name: string, now: number | null, before: number | null, label: string, format: (n: number) => string): Kpi {
  const delta = deltaText(now, before)
  if (delta.dir === 'none' || before === null) return blankKpi(name)
  return { name, value: delta.text, sub: `${label} ${format(before)}`, tone: delta.dir, srText: delta.srText }
}

// ── 그림 ─────────────────────────────────────────────────

type Sum = NonNullable<PeriodSum>
/** 고른 달과 비교 기간, 13달. 덩어리들이 같이 쓴다 */
type Context = {
  month: string
  now: string
  before: string
  lastYearLabel: string
  sum: Sum
  prev: PeriodSum
  lastYear: PeriodSum
  series: MonthPoint[]
}

// 확인 필요한 날이 있는데 아는 금액 합이 0이면 세지 못한 것이지 0원이 아니다(AC-008.4).
// 쉬는 날은 unconfirmed가 아니라 sum.days에 들어서 days로는 가려낼 수 없다(일요일이 있는 달). 이 값이 null이 아니면 days는 1 이상이다
const knownTotal = (sum: Sum) => (sum.total === 0 && sum.uncheckedDays.length > 0 ? null : sum.total)

// 그런 달은 자료 없는 달처럼 그린다. 기간은 monthSeries와 같다(그 달 1일 ~ 말일과 어제 가운데 이른 날). 나눔 칸은 summary.ts가 이미 null로 준다
function seriesOf(days: RevenueDayRow[], today: string): MonthPoint[] {
  return monthSeries(days, firstMonth(today), today).map((point) => {
    const sum = sumPeriod(days, periodsFor(point.month, today).current)
    return sum && knownTotal(sum) === null ? { ...point, total: null } : point
  })
}

function columnOf(point: MonthPoint, index: number, month: string): Column {
  const kind: BarKind = point.month === month ? 'selected' : point.month === addMonths(month, -12) ? 'last-year' : 'other'
  const year = index === 0 || point.month.endsWith('-01') ? `${point.month.slice(0, 4)}년` : ''
  return { month: point.month, label: monthName(point.month), year, kind, partial: point.partial }
}

function axisOf(scale: ReturnType<typeof niceScale>, unit: string, divisor: number): Axis {
  return { unit, ticks: scale.ticks.map((tick) => ({ label: formatCount(tick / divisor), bottom: percent(tick, scale.max) })) }
}

const knownValues = (series: MonthPoint[], of: (point: MonthPoint) => number | null) => series.map(of).filter((value) => value !== null)

const wonOrDash = (value: number | null) => (value === null ? DASH : formatWon(value))
const countOrDash = (value: number | null) => (value === null ? DASH : countText(value))

type BarChartSpec = { title: string; legend: LegendItem[]; unit: string; divisor: number; value: (point: MonthPoint) => number | null; table: SrTable }

// 값이 하나도 없으면 그림이 없다(빈 그래프 틀 없음)
function barChart(context: Context, spec: BarChartSpec): BarChart | null {
  const known = knownValues(context.series, spec.value)
  if (known.length === 0) return null
  const scale = niceScale(Math.max(...known))
  const columns = context.series.map((point, index): BarColumn => {
    const value = spec.value(point)
    const bar = value === null ? null : { height: percent(value, scale.max), value: formatCount(Math.trunc(value / spec.divisor)) }
    return { ...columnOf(point, index, context.month), bar }
  })
  return { title: spec.title, legend: spec.legend, axis: axisOf(scale, spec.unit, spec.divisor), columns, table: spec.table }
}

const BAR_LEGEND: LegendItem[] = [
  { key: 'selected', label: '고른 달' },
  { key: 'last-year', label: '작년 같은 달' },
  { key: 'other', label: '다른 달' },
]
const STACK_LEGEND: LegendItem[] = [
  { key: 'other', label: '기타' },
  { key: 'noncovered', label: '비급여' },
  { key: 'covered', label: '급여' },
]

// ── 덩어리 ───────────────────────────────────────────────

function trendBlock(context: Context): TrendView {
  const { now, before, lastYearLabel, sum, prev, lastYear, series } = context
  const total = knownTotal(sum)
  const unchecked = sum.uncheckedDays
  return {
    title: '매출 추이',
    sub: '매출 = 총진료비 · 지난달 · 작년 같은 때와 견줘요',
    kpis: [
      {
        name: `${now} 매출`,
        value: total === null ? DASH : formatManWon(total),
        sub: `하루 평균 ${total === null ? DASH : formatManWon(Math.floor(total / sum.days))}`,
        tone: total === null ? 'none' : 'ink',
        srText: '',
      },
      deltaKpi(`${before}보다`, total, prev?.total ?? null, before, formatManWon),
      deltaKpi(`작년 ${now}보다`, total, lastYear?.total ?? null, lastYearLabel, formatManWon),
      unchecked.length === 0
        ? { name: '확인 필요한 날', value: '없음', sub: null, tone: 'ink', srText: '' }
        : {
            name: '확인 필요한 날',
            value: `${unchecked.length}일`,
            sub: `${dayList(unchecked)}. 그날 금액은 합계에 넣지 않았어요`,
            tone: 'warn',
            srText: '',
          },
    ],
    chart: barChart(context, {
      title: '달마다 매출 · 최근 13달',
      legend: BAR_LEGEND,
      unit: '(만 원)',
      divisor: WON_PER_MAN,
      value: (point) => point.total,
      table: { caption: '달마다 매출 (원)', head: ['달', '매출'], rows: series.map((point) => [point.month, wonOrDash(point.total)]) },
    }),
  }
}

const SPLIT_NOTE =
  '매출은 총진료비예요. 급여(요양비용총액)는 공단이 내는 몫과 환자가 내는 몫(본인부담)을 더한 금액, 비급여는 환자가 모두 내는 금액, 기타는 100/100 미만 항목과 전액 본인부담 금액이에요. '
const SPLIT_NOTE_FULL = '셋을 더하면 매출이에요.'
const SPLIT_NOTE_PARTIAL = '이 달은 나눔을 못 한 날이 빠져서 셋을 더해도 매출보다 작아요. 막대도 나눔이 있는 날만 더해요.'
const SPLIT_NONE_REST = '위 매출 추이와 아래 건당 진료비는 그대로 볼 수 있어요.'
const SPLIT_BLANK_ROWS: [string, SplitRow['kind']][] = [
  ['급여', 'main'],
  ['공단부담', 'sub'],
  ['본인부담', 'sub'],
  ['비급여', 'main'],
  ['기타', 'main'],
  ['합계', 'sum'],
]

// 쌓은 막대의 눈금 최대는 13달 total의 최대다. 나눔을 못 한 날이 있는 달은 매출 막대보다 낮다(AC-008.6)
function stackChart({ series, month }: Context): StackChart {
  const scale = niceScale(Math.max(0, ...knownValues(series, (point) => point.total)))
  const columns = series.map((point, index): StackColumn => {
    const { covered, noncovered, other } = point
    const segments: StackSegment[] | null =
      covered === null || noncovered === null || other === null
        ? null
        : [
            { key: 'covered', height: percent(covered, scale.max) },
            { key: 'noncovered', height: percent(noncovered, scale.max) },
            { key: 'other', height: percent(other, scale.max) },
          ]
    return { ...columnOf(point, index, month), segments }
  })
  return {
    title: '달마다 급여·비급여·기타',
    legend: STACK_LEGEND,
    axis: axisOf(scale, '(만 원)', WON_PER_MAN),
    columns,
    table: {
      caption: '달마다 급여·비급여·기타 (원)',
      head: ['달', '급여', '비급여', '기타'],
      rows: series.map((point) => [point.month, wonOrDash(point.covered), wonOrDash(point.noncovered), wonOrDash(point.other)]),
    },
  }
}

function splitBlock(context: Context): SplitView {
  const { now, before, sum, prev } = context
  const hasNoSplit = sum.noSplitDays.length > 0
  const shell = {
    title: '급여·비급여·기타',
    head: ['나눔', now, '몫', `${before}보다`],
    notice: dayNotice(sum.noSplitDays, '은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.'),
  }
  const { covered, insurer, selfPay, noncovered, other, splitTotal } = sum
  if (splitTotal === null || covered === null || insurer === null || selfPay === null || noncovered === null || other === null) {
    return {
      ...shell,
      sub: NO_DATA,
      rows: SPLIT_BLANK_ROWS.map(([name, kind]) => ({ name, kind, amount: DASH, share: DASH, delta: NO_DELTA })),
      note: hasNoSplit ? `${NO_DATA}. 이 달은 쉬는 날 말고는 모두 나눔을 못 해서 숫자를 지어 넣지 않았어요. ${SPLIT_NONE_REST}` : `${NO_DATA}. 숫자를 지어 넣지 않았어요.`,
      chart: null,
    }
  }
  // 고른 달이나 지난달 같은 기간에 나눔을 못 한 날이 있으면 견주지 않는다(AC-008.6)
  const comparable = !hasNoSplit && (prev?.noSplitDays.length ?? 0) === 0
  const delta = (value: number, previous: number | null) => (comparable ? deltaText(value, previous) : NO_DELTA)
  const row = (name: string, kind: SplitRow['kind'], value: number, rowDelta: DeltaText): SplitRow => ({
    name,
    kind,
    amount: formatManWon(value),
    share: shareText(value, splitTotal),
    delta: rowDelta,
  })
  return {
    ...shell,
    sub: `${now} 비급여 몫 ${shareText(noncovered, splitTotal)} · 기타 몫 ${shareText(other, splitTotal)}`,
    rows: [
      row('급여', 'main', covered, delta(covered, prev?.covered ?? null)),
      row('공단부담', 'sub', insurer, NO_DELTA),
      row('본인부담', 'sub', selfPay, NO_DELTA),
      row('비급여', 'main', noncovered, delta(noncovered, prev?.noncovered ?? null)),
      row('기타', 'main', other, delta(other, prev?.other ?? null)),
      { ...row(hasNoSplit ? '합계' : '합계 · 매출', 'sum', splitTotal, delta(sum.total, prev?.total ?? null)), share: '100%' },
    ],
    note: `${SPLIT_NOTE}${hasNoSplit ? SPLIT_NOTE_PARTIAL : SPLIT_NOTE_FULL}`,
    chart: stackChart(context),
  }
}

function treatmentsBlock(input: RevenueViewInput, now: string): TreatmentsView {
  const { codes, groups, month } = input
  const head = { title: '치료별 매출', editLabel: '묶음 고치기' }
  const basis = `${now} · 처방한 날 기준`
  if (groups === 'load-failed') {
    return {
      ...head,
      sub: basis,
      editDisabled: true,
      kind: 'load-failed',
      heading: errorInfo(GROUP_LOAD_FAILED).what,
      body: '인터넷 연결을 확인하고 다시 불러와 주세요. 묶음 없이 제안으로 바꿔 보이지 않아요.',
      retry: '다시 불러오기',
      code: GROUP_LOAD_FAILED,
    }
  }
  const suggested = groups.length === 0
  const used = suggested ? suggestGroups(codes.map((row) => row.code)) : groups
  const totals = groupTreatments(
    codes.filter((row) => row.month === month),
    used,
  )
  const common = {
    ...head,
    editDisabled: false,
    sub: suggested ? basis : `${basis} · 내가 만든 묶음`,
    chip: suggested ? '제안 묶음 · 아직 저장 안 함' : null,
  }
  if (totals.length === 0) return { ...common, kind: 'none', text: NO_DATA }
  const whole = totals.reduce((sum, item) => sum + item.amount, 0)
  const max = Math.max(0, ...totals.filter((item) => !item.rest).map((item) => item.amount))
  return {
    ...common,
    kind: 'rows',
    rows: totals.map((item) => {
      const unknown = item.missing && item.amount === 0 // 금액을 모르는 코드뿐이면 0원이 아니다
      return {
        name: item.name,
        amount: unknown ? DASH : formatManWon(item.amount),
        share: unknown ? DASH : shareText(item.amount, whole),
        detail: item.rest ? '진찰료·약·검사 등' : countText(item.count),
        width: percent(item.amount, max),
        rest: item.rest,
        missing: item.missing,
      }
    }),
    note: "처방 금액(단가 × 수량 × 일수)으로 세요. 환불·할인이 빠지지 않아 위 매출 합계와 조금 달라요. 어느 묶음에도 넣지 않은 처방은 '그 밖 처방'으로 세요.",
  }
}

function perVisitBlock(context: Context): PerVisitView {
  const { now, before, lastYearLabel, sum, prev, lastYear, series } = context
  const nowValue = perVisit(sum)
  return {
    title: '건당 진료비',
    sub: '접수 한 건 기준 · 접수취소는 세지 않아요',
    kpis: [
      nowValue === null
        ? blankKpi(`${now} 건당 진료비`)
        : { name: `${now} 건당 진료비`, value: formatWon(nowValue), sub: `매출 ÷ 접수 ${countText(sum.perVisitCount)}`, tone: 'ink', srText: '' },
      deltaKpi(`${before}보다`, nowValue, perVisit(prev), before, formatWon),
      deltaKpi(`작년 ${now}보다`, nowValue, perVisit(lastYear), lastYearLabel, formatWon),
      sum.visits === null
        ? blankKpi(`${now} 접수 건수`)
        : { name: `${now} 접수 건수`, value: countText(sum.visits), sub: `${before} ${countOrDash(prev?.visits ?? null)}`, tone: 'ink', srText: '' },
    ],
    chart: barChart(context, {
      title: '달마다 건당 진료비 · 최근 13달',
      legend: [],
      unit: '(천 원)',
      divisor: WON_PER_CHEON,
      value: (point) => point.perVisit,
      table: {
        caption: '달마다 건당 진료비 (원)',
        head: ['달', '건당 진료비', '접수 건수'],
        rows: series.map((point) => [point.month, wonOrDash(point.perVisit), countOrDash(point.visits)]),
      },
    }),
    note: '매출을 그 기간의 접수 건수로 나눠요. 같은 분이 한 달에 다섯 번 오면 다섯 건으로 세요. 통계 탭 보고의 건당진료비와 같은 식이고, 원 아래는 버려요. 확인 필요한 날은 금액을 알 수 없어서 그날 접수 건수도 함께 빼고 나눠요.',
    notice: dayNotice(sum.noVisitDays, '은 접수 건수를 확인하지 못해 건당 진료비에서 빠졌어요. 매출 합계에는 들어 있어요.'),
  }
}

// ── 상태 ─────────────────────────────────────────────────

const HELPER_OLD: RevenueView = {
  state: 'helper-old',
  title: TITLE,
  heading: '매출을 읽으려면 도우미를 새로 깔아야 해요',
  body: '지금 이 PC의 도우미는 매출 읽기를 아직 몰라요. 설정 탭에서 새 도우미를 받아 다시 깔면 바로 읽어요.',
  action: '설정에서 새 도우미 받기',
  code: 'E-HELPER-UNKNOWN-COMMAND',
}

const EXTENSION_OLD: RevenueView = {
  state: 'extension-old',
  title: TITLE,
  heading: '매출을 읽으려면 확장 프로그램을 새 버전으로 바꿔야 해요',
  body: '지금 이 PC의 크롬 확장 프로그램은 매출 읽기를 아직 몰라요. 설정 탭에서 확장 프로그램 새 버전을 받으면 바로 읽어요. 청구 점검은 지금 그대로 쓸 수 있어요.',
  action: '설정에서 확인',
  code: 'E-BRIDGE-REJECTED',
}

const CONNECT_NEEDED: RevenueView = {
  state: 'connect-needed',
  title: TITLE,
  chip: '비트 PC 연결 전',
  heading: '비트 PC를 연결하면 매출이 여기에 채워져요',
  body: '매출은 비트 PC에서 날짜별 합계 금액을 읽어 와요. 연결은 설정 탭에서 처음 한 번만 하면 돼요.',
  action: '비트 PC 연결',
  gainsTitle: '연결하면 생기는 것 4가지',
  gains: [
    { name: '매출 추이', text: '달마다 매출을 막대로, 지난달·작년 같은 때와 견줘요.' },
    { name: '급여·비급여·기타', text: '급여(공단부담·본인부담)·비급여·기타 셋으로 나눠 봐요.' },
    { name: '치료별 매출', text: '도수치료·체외충격파 같은 치료마다 금액과 건수예요.' },
    { name: '건당 진료비', text: '매출을 접수 건수로 나눈 값이에요(다섯 번 오면 다섯 건).' },
  ],
  safe: SAFE,
}

function fetchingView({ done, total, month }: RevenueSync): RevenueView {
  const count = done ?? 0
  return {
    state: 'fetching',
    title: TITLE,
    heading: '비트에서 매출을 가져오고 있어요',
    body: '처음 한 번은 최근 13달을 읽느라 몇 분 걸려요. 이 창을 닫지 말아 주세요. 다음부터는 새로 생긴 날만 읽어요.',
    // 몇 달을 읽을지 아직 모르면 숫자를 지어내지 않는다
    progress: total
      ? {
          done: count,
          total,
          lead: `${total}달 가운데 `,
          strong: `${count}달`,
          rest: '을 가져왔어요',
          reading: month ? `${fullMonthName(month)} 읽는 중` : null,
          width: percent(count, total),
        }
      : null,
    note: '다 가져오면 그래프 4가지가 한 번에 그려져요.',
    safe: SAFE,
  }
}

function periodOf(month: string, { from, to }: DateRange): PeriodView {
  return { label: fullMonthName(month), note: `${monthName(month)} ${dayNumber(from)}일 – ${dayNumber(to)}일 · 수납한 날 기준` }
}

function failedOf(failed: SyncResult['failed'] | undefined): FailedNotice | null {
  if (!failed || failed.length === 0) return null
  const list = failed.map((item) => item.month).sort()
  return {
    lead: `${list.length}달을 가져오지 못했어요.`,
    months: monthList(list),
    rest: '나머지 달은 그대로 볼 수 있어요.',
    retry: '다시 가져오기',
    list,
  }
}

const EMPTY_NOTE = '그래프는 자료가 있는 달만 그려요. 숫자를 지어 넣지 않아요.'

function emptyMonth(month: string, note: string): EmptyMonth {
  const now = monthName(month)
  return {
    heading: NO_DATA,
    kpis: [`${now} 매출`, `${monthName(addMonths(month, -1))}보다`, `작년 ${now}보다`, '건당 진료비'].map(blankKpi),
    note,
  }
}

function blocksOf(input: RevenueViewInput, periods: ReturnType<typeof periodsFor>, sum: Sum): RevenueBlocks {
  const { days, month, today } = input
  const now = monthName(month)
  const context: Context = {
    month,
    now,
    before: monthName(addMonths(month, -1)),
    lastYearLabel: fullMonthName(addMonths(month, -12)),
    sum,
    prev: sumPeriod(days, periods.lastMonth),
    lastYear: sumPeriod(days, periods.lastYear),
    series: seriesOf(days, today),
  }
  return { trend: trendBlock(context), split: splitBlock(context), treatments: treatmentsBlock(input, now), perVisit: perVisitBlock(context) }
}

/** AC-008.2 차례: 옛 도우미 → 옛 확장 → 가져오는 중 → 오류 → 연결 안 됨 → 고른 달 자료 없음 → 준비됨 */
export function buildRevenueView(input: RevenueViewInput): RevenueView {
  const { bridge, sync, days, month, today, fetchedAt } = input
  if (bridge === 'helper-old' || sync.helperOld) return HELPER_OLD
  if (sync.extensionOld) return EXTENSION_OLD
  if (sync.state === 'running') return fetchingView(sync)
  if (sync.state === 'error') return { state: 'error', title: TITLE, code: sync.code ?? NO_CODE }
  if (bridge === 'none' && days.length === 0) return CONNECT_NEEDED

  const periods = periodsFor(month, today)
  const period = periodOf(month, periods.current)
  const sum = sumPeriod(days, periods.current)
  const blocks = sum && blocksOf(input, periods, sum)
  const at = fetchedAt === null ? null : fetchedText(fetchedAt)

  if (bridge === 'none') {
    return {
      state: 'saved-only',
      header: { title: TITLE, meta: at && `의원 PC에서 ${at}에 가져온 숫자예요`, refresh: null },
      period,
      notice: {
        lead: '이 PC는 비트와 연결되어 있지 않아요.',
        rest: at ? `의원 PC에서 ${at}에 가져온 숫자를 보여 드려요.` : '의원 PC에서 가져온 숫자를 보여 드려요.',
        action: '비트 PC 연결',
      },
      blocks,
      empty: blocks ? null : emptyMonth(month, EMPTY_NOTE),
      safe: SAFE,
    }
  }

  const failed = failedOf(sync.failed)
  if (blocks === null) {
    // 이 PC가 방금 읽은 달이라 "기록이 없어요"라고 말할 수 있다. 읽지 못한 달은 그렇게 말하지 않는다
    const note = failed?.list.includes(month) ? '이 달은 가져오지 못했어요. 숫자를 지어 넣지 않아요.' : `이 달에는 비트에 수납 기록이 없어요. ${EMPTY_NOTE}`
    return { state: 'empty', title: TITLE, period, failed, empty: emptyMonth(month, note) }
  }
  return {
    state: 'ready',
    header: { title: TITLE, meta: at && `${at}에 비트에서 가져왔어요`, refresh: '다시 가져오기' },
    period,
    failed,
    blocks,
    safe: SAFE,
  }
}
