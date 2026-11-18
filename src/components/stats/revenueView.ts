import type { LegendItem as ChartLegendItem } from '@/components/charts/ChartLegend'
import { formatCount, formatRate } from '@/components/charts/format'
import { niceScale } from '@/components/charts/scale'
import type { BarBucket, BarSeries } from '@/components/charts/StackedBarChart'
import { longDate, tickLabels, type Period } from '@/components/dashboard/summary/view'
import { formatManWon, formatWon } from '@/components/revenue/money'
import type { DeltaText, Kpi, LegendItem, Notice, SplitRow, StackChart, StackColumn, StackSegment, TreatmentRow } from '@/components/revenue/types'
import { addDays, addMonths, compareYmd, diffDays, eachDay, monthOf, monthRange, weekdayOf, weekStartOf } from '@/lib/analytics/dates'
import { compare, isWorkDay, perVisit, sumPeriod, type PeriodSum } from '@/lib/revenue/summary'
import { groupTreatments } from '@/lib/revenue/treatments'
import type { BucketState } from '@/types/analysis'
import { DEFAULT_HONORIFIC, type Honorific } from '@/types/clinicProfile'
import type { DateRange } from '@/types/dates'
import type { RevenueCodeRow, RevenueDayRow } from '@/types/revenue'
import type { RxGroup } from '@/types/rxGroups'
import type { StatsRange } from './view'

// 통계 매출 칸의 셈 (stats-revenue REQ-4105 · AC-4105.1~AC-4105.6, design.md '매출 보기').
// 순수 모듈이다: 통로·서버·브라우저 저장소·화면 부품을 쓰지 않는다. 오늘·마지막 끝난 날은 인자(range.load.to · lastDay)로만 받는다.
// 날짜는 lib/analytics/dates.ts, 매출 숫자의 뜻은 lib/revenue/summary.ts·treatments.ts, 금액 글은 components/revenue/money.ts다.
// 글자는 승인 시안 docs/mockups/stats-revenue(index.html·notes.md)와 requirements.md 기본값 그대로다. 자료가 없으면 숫자를 지어내지 않는다('–'·'자료 없음')

// ── 입력·출력 ────────────────────────────────────────────

// 입력 모양은 types/revenue.ts(TASK-3)의 새 이름 대신 같은 모양을 풀어 적는다(구조 타입이라 그대로 맞는다)
/** 저장된 날 줄 + 그날 날 단위 처방 금액이 있는지(SavedRevenueDay) */
type SavedDay = RevenueDayRow & { dayCodes: boolean }
/** 보는 기간 날 단위 코드별 합(sales_code_totals, RevenueCodeTotal). amount = 값 있는 줄의 합, missing = 금액이 빠진 줄이 있었음 */
type CodeTotal = { code: string; count: number; amount: number; missing: boolean }
/** 옛 달 합계(sales_codes, RevenueMonthCode). month = 'YYYY-MM' */
type MonthCode = RevenueCodeRow & { month: string }

export type RevenueInput = {
  range: StatsRange
  /** 마지막 끝난 날(어제, 오늘 진료 끝이면 오늘) */
  lastDay: string
  /** readSpan(range) 안 저장된 날 */
  days: readonly SavedDay[]
  codes: readonly CodeTotal[]
  /** 보는 기간에 걸친 달의 옛 달 합계 */
  monthCodes: readonly MonthCode[]
  /** 통계 처방 묶음(저장된 것 또는 제안). 넣는 처방(codes)만 쓰고 빼는 처방·조건은 쓰지 않는다 */
  groups: readonly RxGroup[] | 'reading' | 'read-failed'
  /** 도우미 예전 판 표시(기본값 9) */
  noDayCodes: boolean
}

/**
 * 매출 요약 한 칸(first90 AC-4408.2, 시안 docs/mockups/first90/redesign.html #s-sum-rev). value = 큰 글(작은 단위는 unit: '1억 3,261만' + '원'), 값이 없으면 '–'.
 * hint = 이름 옆 옅은 글(건당 진료비 '매출 ÷ 접수 n건'), tag = "참고 포함" 꼬리표(켜짐에서 참고 금액이 든 칸).
 * delta = 증감 줄(총매출·건당 진료비. 화살표 ▲·▼는 dir로 그리는 쪽이 붙이고, srText = 줄 끝 옅은 글), notes = 아래 글 줄들
 */
export type RevenueCell = {
  key: 'total' | 'perVisit' | 'unchecked'
  label: string
  hint: string | null
  tag: boolean
  value: string
  unit: string | null
  tone: 'ink' | 'warn' | 'none'
  delta: DeltaText | null
  notes: string[]
}
/** 참고 금액 포함 스위치(first90 AC-4408.1): out = 확인 필요한 날을 뺌(처음), in = 그 가운데 참고 금액이 있는 날을 더함 */
export type RevenueMode = 'out' | 'in'
/** 스위치에 줄 날 수: days = 보는 기간의 확인 필요한 날, roughDays = 그 가운데 참고 금액(roughTotal)이 숫자인 날 */
export type RoughInfo = { days: number; roughDays: number }

/** 탭 첫 줄: text + 굵은 amount + 회색 rest(없으면 null). 사이 빈칸은 그리는 쪽이 둔다 */
export type Lead = { text: string; amount: string; rest: string | null }
/** 막대를 누르면(PC는 올리기도) 막대 아래 줄에 보일 글(first90 AC-4408.3): 칸 키 → 글. 값이 없는 칸('–')은 글이 없다 */
export type BarTips = Readonly<Record<string, string>>
/**
 * 매출 추이·건당 진료비 탭의 막대(first90 AC-4408.3): series = 계열(첫째가 맨 위), legend = 막대 위 범례(그릴 것이 없으면 빈 배열),
 * tips = 막대 아래 줄 글, note = 막대 아래 글(없으면 null). 꺼짐은 확인 필요한 날이 점선 칸(mark 'unchecked'), 켜짐은 참고 금액이 빗금(rough) 계열이다
 */
export type BarsView = { series: BarSeries[]; buckets: BarBucket[]; legend: ChartLegendItem[]; tips: BarTips; dense: boolean; note: string | null }
/** tag = 머리 글 "참고 포함" 꼬리표(켜짐) · how = [어떻게 세나요?] 문단 */
export type TrendTab = BarsView & { desc: string; lead: Lead; tag: boolean; how: string[] }
/** lastYear = '작년 같은 때보다' 칸(작년 비교가 있는 고른 기간만, 없으면 null) */
export type RevenueSplitRow = SplitRow & { lastYear: DeltaText | null }
export type SplitTab = { desc: string; notice: Notice | null; head: string[]; rows: RevenueSplitRow[]; how: string[]; chart: StackChart | null }
/** lines = rows가 아닐 때 보이는 줄(읽는 중·읽기 실패·셀 날 없음) */
export type TreatmentsTab = {
  desc: string
  state: 'rows' | 'reading' | 'read-failed' | 'none'
  lead: Lead | null
  rows: TreatmentRow[]
  notice: Notice | null
  lines: string[]
  how: string[]
}
export type PerVisitTab = BarsView & { desc: string; kpis: Kpi[]; notice: Notice | null; how: string[] }
/**
 * 참고 금액 포함(켜짐)으로 센 두 탭(first90 AC-4408.3). 숫자 칸·설명은 꺼짐과 같고 막대·범례·아래 글·머리 글만 다르다.
 * outside = 켜짐일 때 급여·비급여·기타·치료별 매출 탭 맨 위 안내 글(AC-4408.4, 두 탭은 참고 금액을 넣지 않아 합이 총매출과 다르다)
 */
export type RoughTabs = { trend: TrendTab; perVisit: PerVisitTab; outside: string }
/**
 * rough = 켜짐 두 탭. 보는 기간에 참고 금액이 있는 확인 필요한 날이 없으면 null(켜도 꺼짐과 같다).
 * 급여·비급여·기타·치료별 매출은 스위치와 상관없이 하나다(AC-4408.4)
 */
export type RevenueTabs = { kind: 'empty' } | { kind: 'ready'; trend: TrendTab; split: SplitTab; treatments: TreatmentsTab; perVisit: PerVisitTab; rough: RoughTabs | null }

// ── 글자 ─────────────────────────────────────────────────

const DASH = '–'
const MINUS = '−'
const NO_DATA = '자료 없음'
const READING = '불러오는 중'
const NO_COMPARE = '비교할 자료가 없어요'
const WON_PER_MAN = 10_000
const WON_PER_CHEON = 1_000
// 그리는 위치 %를 자를 때 부동소수 오차(28.999…)를 막는다(components/charts/format.ts와 같은 규칙)
const EPSILON = 1e-9
const DENSE_OVER = 31 // 막대 위 숫자는 칸 31개 이하일 때만(환자 수 추이와 같다)
const TICK_DAYS = 31 // 고른 기간 일별 눈금: 31일 이하는 7일마다, 넘으면 21일마다(환자 수 추이와 같다)
const WEEK_LABEL_ALL = 6
const WEEK_LABEL_STEP = 3
const RUNS_MAX = 5 // 날짜 글 묶음이 이보다 많으면 앞 넷 + ' 외 n일'(기본값 10)
const RUNS_SHOWN = 4
const YEAR_MONTHS = 12
const QUICK_DAYS: Record<'7d' | '30d' | '90d', Period> = { '7d': 7, '30d': 30, '90d': 90 }

type Unit = 'day' | 'week' | 'month'
const EACH: Record<Unit, string> = { day: '하루씩', week: '한 주씩', month: '한 달씩' }
const EVERY: Record<Unit, string> = { day: '날마다', week: '주마다', month: '달마다' }
const TABLE_HEAD: Record<Unit, string> = { day: '날짜', week: '주', month: '달' }

const LABELS: Record<RevenueCell['key'], string> = { total: '총매출', perVisit: '건당 진료비', unchecked: '확인 필요한 날' }

// '…보고 문장'의 받는 사람은 병원 호칭이다(clinic-profile AC-6606.3). '원장님별'(표 이름)은 그대로다
const trendHow = (honorific: Honorific) => [
  '매출은 수납한 날(회계일)의 총진료비예요. 총진료비 = 공단부담 + 본인부담 + 비급여 + 기타이고, 그날 정상 수납한 것과 미수금으로 들어온 것을 더해요.',
  "환불·변경수납·예치금이 있거나 수납 연결이 겹친 날은 '확인 필요한 날'로 두고 그날 금액을 매출에 넣지 않아요. 비트 외래환자경영통계에서 그날을 직접 확인해 주세요.",
  `그래서 아래 '원장님별'의 매출 합계(그런 날도 더해요)나 '${honorific} 보고 문장'의 총진료비(그런 날이 든 날·달은 '확인 필요')와 다를 수 있어요.`,
  '막대 칸은 환자 수 추이와 같아요: 최근 7일·30일·90일은 하루씩, 최근 12개월은 한 달씩, 기간 골라 보기는 고른 단위(일별·주별·월별)예요.',
]
// 켜짐 둘째 문단(first90 AC-4408.3, 2026-11-15 검토 보완). 다른 문단은 꺼짐 그대로다
const trendHowRough = (honorific: Honorific) => {
  const off = trendHow(honorific)
  return [
    off[0]!,
    "환불·변경수납·예치금이 있거나 수납 연결이 겹친 날은 '확인 필요한 날'로 둬요. '참고 금액 포함'을 켜면 참고 금액이 있는 날은 그 금액을 더하고, 없는 날은 빼요. 비트 외래환자경영통계에서 그날을 직접 확인해 주세요.",
    off[2]!,
    off[3]!,
  ]
}
const CLOSED_NOTE = '휴진한 날은 칸이 없어요.'
const CLOSED_OR_UNSAVED_NOTE = '휴진한 날과 아직 불러오지 않은 날은 칸이 없어요.'
// 확인 필요한 날 막대(first90 AC-4408.3): 꺼짐 점선 칸 · 켜짐 빗금 막대의 아래 글과 범례
const dashedNote = (dates: readonly string[]) => `점선 칸은 확인 필요한 날(${daysText(dates)})이에요. 0원이 아니라 금액이 확실하지 않아 합계에서 뺀 날이에요.`
const roughNote = (dates: readonly string[]) =>
  `빗금 막대는 확인 필요한 날(${daysText(dates)})의 참고 금액이에요. 원장님별 표와 같은 기준(그날 수납한 줄의 총진료비 합, 환불은 빼기)으로 셌어요. 비트 외래환자경영통계와 조금 다를 수 있어요.`
const ROUGH_LEGEND: ChartLegendItem = { label: '참고 금액(확인 필요한 날)', mark: 'rough' }
const UNCHECKED_LEGEND: ChartLegendItem = { label: '확인 필요한 날(뺌)', mark: 'unchecked' }
const UNCHECKED_TIP = '확인 필요한 날 · 금액을 빼고 셌어요'
const WEEKDAY_NAMES = '월화수목금토일'
// 켜짐 급여·비급여·기타·치료별 매출 탭 맨 위 안내(first90 AC-4408.4, 2026-11-15 검토 보완)
const outsideNote = (sum: number, days: number) => `참고 금액 ${formatManWon(sum)}(확인 필요한 날 ${formatCount(days)}일)은 이 탭에 넣지 않아 합이 총매출과 달라요.`
// 총매출 아래 비교 기간 빠진 날 줄(first90 AC-4408.2, 2026-11-15 검토 보완)
const comparedNote = (name: string, days: number) => `${name}도 확인 필요한 날 ${formatCount(days)}일을 빼고 견줬어요`

const SPLIT_NOTE =
  '매출은 총진료비예요. 급여(요양비용총액)는 공단이 내는 몫과 환자가 내는 몫(본인부담)을 더한 금액, 비급여는 환자가 모두 내는 금액, 기타는 100/100 미만 항목과 전액 본인부담 금액이에요. '
const SPLIT_FULL = '셋을 더하면 매출이에요.'
const SPLIT_PARTIAL = '이 기간은 나눔을 못 한 날이 빠져서 셋을 더해도 매출보다 작아요. 막대도 나눔이 있는 날만 더해요.'
const SPLIT_NONE_PARTIAL = '자료 없음. 이 기간은 쉬는 날 말고는 모두 나눔을 못 해서 숫자를 지어 넣지 않았어요. 매출 추이와 건당 진료비 탭은 그대로 볼 수 있어요.'
const SPLIT_NONE = '자료 없음. 숫자를 지어 넣지 않았어요.'
const SPLIT_DAY_BARS = '막대는 날마다 아래부터 급여·비급여·기타예요. 확인 필요한 날과 나눔을 못 한 날은 막대가 없어요.'
const splitSpanBars = (unit: Unit) => `막대는 ${EVERY[unit]} 아래부터 급여·비급여·기타예요. 확인 필요한 날과 나눔을 못 한 날은 더하지 않아요.`
const NO_SPLIT_REST = '은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.'
const SPLIT_BLANK_ROWS: [string, SplitRow['kind']][] = [
  ['급여', 'main'],
  ['공단부담', 'sub'],
  ['본인부담', 'sub'],
  ['비급여', 'main'],
  ['기타', 'main'],
  ['합계', 'sum'],
]
const STACK_LEGEND: LegendItem[] = [
  { key: 'other', label: '기타' },
  { key: 'noncovered', label: '비급여' },
  { key: 'covered', label: '급여' },
]

const TREAT_HOW = [
  "처방 금액(단가 × 수량 × 일수)으로 세요. 처방한 날 기준이고 환불·할인이 빠지지 않아 매출과 조금 달라요. 어느 묶음에도 넣지 않은 처방은 '그 밖 처방'으로 세요.",
  '묶음은 처방 칸 [묶음 고치기]에서 고쳐요. 처방 하나는 한 묶음에만 들어가서 금액을 두 번 세지 않아요. 묶음의 빼는 처방·조건은 매출에는 쓰지 않아요(넣는 처방 금액을 모두 더해요).',
  "'처방 n번'은 그 기간에 그 묶음 처방을 낸 횟수예요. 처방 칸의 '건'(같은 날 같은 환자는 1건)과 세는 법이 달라요.",
]
const TREAT_NONE = '자료 없음 · 새 도우미로 [비트에서 불러오기]를 하면 이 기간의 치료별 매출이 채워져요.'
const TREAT_OLD_HELPER = '치료별 매출은 날마다 나눠 저장한 날부터 볼 수 있어요. 지금 도우미는 달 합계만 읽어요.'
const GROUPS_FAILED = '처방별 추세 묶음을 읽지 못했어요'
const NO_CODES_REST = '은 치료별로 나눠 저장하지 않아 이 표에서 빠졌어요.'
const REST_DETAIL = '진찰료·약·검사 등'

const PER_VISIT_DESC = '접수 한 건 기준 · 접수취소는 세지 않아요'
const perVisitFirst = (honorific: Honorific) =>
  `매출을 그 기간의 접수 건수로 나눠요. 같은 분이 다섯 번 오면 다섯 건으로 세요. ${honorific} 보고 문장의 건당진료비와 같은 식이고, 원 아래는 버려요.`
const perVisitHow = (honorific: Honorific) => [
  perVisitFirst(honorific),
  "확인 필요한 날은 금액을 알 수 없어서 그날 접수 건수도 함께 빼고 나눠요. 그래서 '원장님별'의 건당 진료비(그런 날도 더해요)와 조금 다를 수 있어요.",
]
// 켜짐 둘째 문단(first90 AC-4408.3). 첫 문단은 꺼짐 그대로다
const perVisitHowRough = (honorific: Honorific) => [
  perVisitFirst(honorific),
  '참고 금액 포함을 켜면 참고 금액이 있는 확인 필요한 날은 그 참고 금액과 그날 접수 건수를 더해 나눠요. 참고 금액이 없는 날은 금액과 접수 건수를 함께 빼요.',
]
const ROUGH_SUB = ' · 참고 금액 포함'
const NO_VISIT_REST = '은 접수 건수를 확인하지 못해 건당 진료비에서 빠졌어요. 매출 합계에는 들어 있어요.'

const monthNumber = (ymd: string) => Number(ymd.slice(5, 7))
const dayNumber = (ymd: string) => Number(ymd.slice(8, 10))
const shortDate = (ymd: string) => `${monthNumber(ymd)}.${dayNumber(ymd)}`
const yearMonth = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`
const monthLabel = (month: string) => `${Number(month.slice(5, 7))}월`
const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)
const later = (a: string, b: string) => (compareYmd(a, b) >= 0 ? a : b)
const countText = (n: number) => `${formatCount(n)}건`
const shareText = (part: number, whole: number) => (whole > 0 ? `${formatRate(part / whole)}%` : DASH)
/** '1억 3,261만 원' → '1억 3,261만', '5,000원' → '5,000'(작은 '원'은 unit) */
const manValue = (n: number) => formatManWon(n).replace(/ ?원$/, '')

// 그리는 위치 %: 0~100, 소수 둘째 자리까지 버림. max가 0 이하이면 0
function percent(value: number, max: number): number {
  if (!(max > 0)) return 0
  return Math.min(100, Math.max(0, Math.trunc((value / max) * 10_000 + EPSILON) / 100))
}

// '10월 1일 – 4일' · '9월 28일 – 10월 4일' · 하루면 '10월 1일'(환자 수 추이 주 칸과 같다)
function spanText({ from, to }: DateRange): string {
  if (from === to) return longDate(from)
  return `${longDate(from)} – ${monthOf(from) === monthOf(to) ? `${dayNumber(to)}일` : longDate(to)}`
}

/**
 * 날짜 글(기본값 10): 달이 바뀔 때마다 달을 쓰고 이어진 날은 묶는다('10월 28일·11월 3일–4일').
 * 묶음이 다섯을 넘으면 앞 넷 뒤에 ' 외 {남은 날 수}일'. 받는 날짜는 날짜 차례다(sumPeriod의 목록)
 */
function daysText(dates: readonly string[]): string {
  const runs: [string, string][] = []
  for (const date of dates) {
    const last = runs.at(-1)
    if (last !== undefined && addDays(last[1], 1) === date) last[1] = date
    else runs.push([date, date])
  }
  const shown = runs.length > RUNS_MAX ? runs.slice(0, RUNS_SHOWN) : runs
  const parts: string[] = []
  let month = ''
  for (const [from, to] of shown) {
    const head = monthOf(from) === month ? `${dayNumber(from)}일` : longDate(from)
    parts.push(from === to ? head : `${head}–${monthOf(from) === monthOf(to) ? `${dayNumber(to)}일` : longDate(to)}`)
    month = monthOf(to)
  }
  const hidden = runs.slice(shown.length).reduce((n, [from, to]) => n + diffDays(from, to) + 1, 0)
  return `${parts.join('·')}${hidden > 0 ? ` 외 ${formatCount(hidden)}일` : ''}`
}

function dayNotice(dates: readonly string[], rest: string): Notice | null {
  return dates.length === 0 ? null : { lead: `${formatCount(dates.length)}일(${daysText(dates)})`, rest }
}

const NO_DELTA: DeltaText = { dir: 'none', text: DASH, srText: '' }

// 비율은 소수 첫째 자리에서 0 쪽으로 버리고(summary.ts compare), 버려서 0이면 '변화 없음'이다
function deltaText(now: number | null, before: number | null): DeltaText {
  const change = compare(now, before)
  if (change === null) return NO_DELTA
  if (change.rate === 0) return { dir: 'flat', text: '변화 없음', srText: '' }
  const size = Math.abs(change.rate).toFixed(1)
  return change.rate > 0 ? { dir: 'up', text: `+${size}%`, srText: '늘어남' } : { dir: 'down', text: `${MINUS}${size}%`, srText: '줄어듦' }
}

const blankKpi = (name: string, sub: string): Kpi => ({ name, value: DASH, sub, tone: 'none', srText: '' })

// ── 기간·비교·칸 ─────────────────────────────────────────

type Sum = NonNullable<PeriodSum>
type Compared = { now: Sum; before: Sum }
type Slot = { key: string; label: string; rangeLabel: string; tableName: string; span: DateRange; cut: boolean }
type SlotSum = { slot: Slot; sum: PeriodSum; state: BucketState }

type Ctx = {
  input: RevenueInput
  unit: Unit
  /** 보는 기간: 기간 첫날 ~ (기간 끝과 마지막 끝난 날 가운데 이른 날) */
  view: DateRange
  byDay: ReadonlyMap<string, SavedDay>
  sum: Sum
  /** 비교 쪽 이름('지난 30일' · '9월' · '작년 같은 11달') */
  name: string
  /** 바로 전 기간과 견줄 두 합(견주지 않으면 null, 기본값 5) */
  main: Compared | null
  /** 작년 같은 때(작년 비교가 있는 고른 기간만) */
  lastYear: Compared | null
  slots: SlotSum[]
}

// 막대 칸: 빠른 단추 7·30·90일은 하루씩, 12개월은 한 달씩, 고른 기간은 고른 단위(AC-4105.3)
const unitOf = (range: StatsRange): Unit => (range.period === null ? range.bucket : range.period === '12m' ? 'month' : 'day')

const rowsIn = (byDay: ReadonlyMap<string, SavedDay>, span: DateRange) => eachDay(span).flatMap((day) => byDay.get(day) ?? [])
// withRough = 참고 금액 포함(first90 AC-4408.2): 확인 필요한 날 가운데 참고 금액이 숫자인 날을 더한다(lib/revenue/summary.ts)
const sumIn = (byDay: ReadonlyMap<string, SavedDay>, span: DateRange, withRough = false) => sumPeriod(rowsIn(byDay, span), span, { withRough })
const savedAll = (byDay: ReadonlyMap<string, SavedDay>, span: DateRange) => eachDay(span).every((day) => byDay.has(day))

type Pair = { now: DateRange; before: DateRange; name: string }

// 바로 전 기간. 12개월은 끝나지 않은 달(말일이 마지막 끝난 날보다 뒤)과 작년 같은 달을 양쪽에서 뺀다
function mainPair({ range, lastDay }: RevenueInput, view: DateRange): Pair | null {
  if (range.period !== '12m') return { now: view, before: { from: range.previous.from, to: range.previous.to }, name: range.previous.name }
  const months = Array.from({ length: YEAR_MONTHS }, (_, i) => addMonths(monthOf(range.current.from), i))
  const kept = months.filter((month) => compareYmd(monthRange(month).to, lastDay) <= 0)
  const last = kept.at(-1)
  if (last === undefined) return null
  return {
    now: { from: range.current.from, to: monthRange(last).to },
    before: { from: range.previous.from, to: monthRange(addMonths(last, -YEAR_MONTHS)).to },
    name: kept.length === YEAR_MONTHS ? range.previous.name : `작년 같은 ${kept.length}달`,
  }
}

// 두 기간 가운데 마지막 끝난 날까지 저장하지 않은 날이 하루라도 있거나 진료한 날이 없으면 견주지 않는다(기본값 5)
function comparedOf(byDay: ReadonlyMap<string, SavedDay>, now: DateRange, before: DateRange, withRough = false): Compared | null {
  if (!savedAll(byDay, now) || !savedAll(byDay, before)) return null
  const a = sumIn(byDay, now, withRough)
  const b = sumIn(byDay, before, withRough)
  if (a === null || b === null || a.workDays === 0 || b.workDays === 0) return null
  return { now: a, before: b }
}

function daySlots(range: StatsRange, view: DateRange): Slot[] {
  const tickPeriod: Period = range.period !== null && range.period !== '12m' ? QUICK_DAYS[range.period] : eachDay(range.current).length <= TICK_DAYS ? 30 : 90
  const ticks = new Map(tickLabels(range.current, tickPeriod).map((tick) => [tick.day, tick.label]))
  return eachDay(view).map((day) => ({ key: day, label: ticks.get(day) ?? '', rangeLabel: longDate(day), tableName: day, span: { from: day, to: day }, cut: false }))
}

// 주는 월–일을 기간(과 마지막 끝난 날)으로 자른다. 잘린 칸은 일부 기간이다
function weekSlots(range: StatsRange, view: DateRange): Slot[] {
  const { current } = range
  const weeks: DateRange[] = []
  for (let start = weekStartOf(current.from); compareYmd(start, current.to) <= 0; start = addDays(start, 7)) weeks.push({ from: start, to: addDays(start, 6) })
  const step = weeks.length <= WEEK_LABEL_ALL ? 1 : WEEK_LABEL_STEP
  return weeks.flatMap((whole, i): Slot[] => {
    const span = { from: later(whole.from, current.from), to: earlier(whole.to, view.to) }
    if (compareYmd(span.from, span.to) > 0) return []
    const text = spanText(span)
    return [{ key: span.from, label: i % step === 0 ? shortDate(span.from) : '', rangeLabel: text, tableName: text, span, cut: span.from !== whole.from || span.to !== whole.to }]
  })
}

function monthSlots(range: StatsRange, view: DateRange): Slot[] {
  const { current } = range
  const slots: Slot[] = []
  for (let month = monthOf(current.from); compareYmd(`${month}-01`, view.to) <= 0; month = addMonths(month, 1)) {
    const whole = monthRange(month)
    const span = { from: later(whole.from, current.from), to: earlier(whole.to, view.to) }
    slots.push({ key: month, label: monthLabel(month), rangeLabel: yearMonth(month), tableName: yearMonth(month), span, cut: span.from !== whole.from || span.to !== whole.to })
  }
  return slots
}

// 해 고르기의 앞으로 올 달(첫날이 오늘 이후)은 빈 칸으로 잇는다(환자 수 추이와 같다). values = 계열 수만큼의 0
function futureBuckets(range: StatsRange, values: number[]): BarBucket[] {
  if (range.whole === undefined) return []
  const lastMonth = monthOf(range.whole.to)
  const bars: BarBucket[] = []
  for (let month = addMonths(monthOf(range.current.to), 1); compareYmd(month, lastMonth) <= 0 && compareYmd(`${month}-01`, range.load.to) >= 0; month = addMonths(month, 1)) {
    bars.push({ key: month, label: monthLabel(month), rangeLabel: yearMonth(month), state: 'partial', values, blank: 'future' })
  }
  return bars
}

// withRough(기본 꺼짐): 보는 기간·비교 두 기간·막대 칸을 모두 같은 방식으로 센다(first90 AC-4408.2)
function contextOf(input: RevenueInput, withRough = false): Ctx | null {
  const { range, lastDay } = input
  const view = { from: range.current.from, to: earlier(range.current.to, lastDay) }
  const byDay = new Map(input.days.map((row) => [row.date, row]))
  const sum = sumIn(byDay, view, withRough)
  if (sum === null) return null
  const unit = unitOf(range)
  const slots = unit === 'day' ? daySlots(range, view) : unit === 'week' ? weekSlots(range, view) : monthSlots(range, view)
  const pair = mainPair(input, view)
  return {
    input,
    unit,
    view,
    byDay,
    sum,
    name: pair?.name ?? range.previous.name,
    main: pair === null ? null : comparedOf(byDay, pair.now, pair.before, withRough),
    lastYear: range.lastYear === null ? null : comparedOf(byDay, view, range.lastYear, withRough),
    // 칸 안 저장된 날이 없거나 모두 쉬는 날이면 sum이 null이고 칸이 없다. 저장하지 않은 날이 든 칸·잘린 칸은 일부 기간이다
    slots: slots.map((slot) => ({ slot, sum: sumIn(byDay, slot.span, withRough), state: slot.cut || !savedAll(byDay, slot.span) ? 'partial' : 'complete' })),
  }
}

const filled = (slots: readonly SlotSum[]) => slots.flatMap(({ slot, sum, state }) => (sum === null ? [] : [{ slot, sum, state }]))

// ── 매출 추이·건당 진료비 막대 (first90 AC-4408.3) ────────────

/**
 * 칸 하나의 막대 값. main = 확인된 날 몫, rough = 참고 금액 몫(꺼짐이면 늘 0).
 * 'unchecked' = 칸의 날이 확인 필요한 날(켜짐에서는 참고 금액이 없는 날)과 쉬는 날뿐이라 0원 막대가 아니라 점선 칸이다. null = 셀 수 없는 칸('–')
 */
type BarValue = { main: number; rough: number } | 'unchecked' | null
/** 탭마다 다른 것: 계열 이름 · 막대 값 · 아래 줄 글('매출 530만 원'), roughDay = 하루 칸이 참고 금액 날일 때의 글 */
type BarKind = { main: string; rough: string; value(sum: Sum): BarValue; text(sum: Sum): string; roughDay(sum: Sum): string }

const roughDaysOf = (sum: Sum) => sum.roughDays ?? []
const onlyUnchecked = (sum: Sum) => sum.workDays === 0 && sum.uncheckedDays.length > 0
// 칸의 진료한 날이 모두 참고 금액 날(켜짐)
const onlyRough = (sum: Sum) => roughDaysOf(sum).length > 0 && roughDaysOf(sum).length === sum.workDays
// 막대 값은 0 쪽으로 버린다(음수 참고 금액도, first90 AC-4408.3). −0은 0으로(칸 위 숫자·화면 읽기 표에 '−0'이 없게)
const toZero = (x: number) => Math.trunc(x) || 0

// 매출 막대(만 원 아래 0 쪽 버림). 참고 금액 몫은 칸 매출 안에서 자른다(두 몫의 합 = 칸 매출을 버린 값).
// 음수 참고 금액: 하루 칸(진료한 날이 참고 금액 날뿐)은 참고 금액 계열, 확인된 날과 섞인 칸은 칸 매출 합을 매출 계열로 그린다(높이 0은 차트가 자른다)
function totalValue(sum: Sum): BarValue {
  if (sum.workDays === 0) return onlyUnchecked(sum) ? 'unchecked' : null
  const whole = toZero(sum.total / WON_PER_MAN)
  const roughSum = sum.roughSum ?? 0
  if (roughSum < 0) return onlyRough(sum) ? { main: 0, rough: whole } : { main: whole, rough: 0 }
  const rough = Math.max(0, Math.min(whole, toZero(roughSum / WON_PER_MAN)))
  return { main: whole - rough, rough }
}

// 건당 진료비 막대(천 원 아래 0 쪽 버림)는 나눌 수 없어서, 칸의 진료한 날이 모두 참고 금액 날일 때만 빗금 계열이다
function perVisitValue(sum: Sum): BarValue {
  const value = perVisit(sum)
  if (value === null) return onlyUnchecked(sum) ? 'unchecked' : null
  const bar = toZero(value / WON_PER_CHEON)
  return onlyRough(sum) ? { main: 0, rough: bar } : { main: bar, rough: 0 }
}

const perVisitText = (sum: Sum) => `건당 진료비 ${formatWon(perVisit(sum) ?? 0)}`
const TREND_KIND: BarKind = {
  main: '매출',
  rough: '참고 금액',
  value: totalValue,
  text: (sum) => `매출 ${formatManWon(sum.total)}`,
  roughDay: (sum) => `참고 금액 ${formatManWon(sum.roughSum ?? 0)} · 확인 필요한 날`,
}
const PER_VISIT_KIND: BarKind = {
  main: '건당 진료비',
  rough: '건당 진료비(참고 금액)',
  value: perVisitValue,
  text: perVisitText,
  roughDay: (sum) => `${perVisitText(sum)} · 참고 금액 · 확인 필요한 날`,
}

// 막대 아래 줄 글 앞말: 하루 칸은 '10.28(수)', 주·달 칸은 칸 이름('10월 5일 – 11일' · '2026년 10월')
const whenOf = (unit: Unit, slot: Slot) => (unit === 'day' ? `${shortDate(slot.key)}(${WEEKDAY_NAMES[weekdayOf(slot.key) - 1]})` : slot.rangeLabel)

// 칸 글: 점선 칸 · 하루 참고 금액 날 · 그 밖(주·달 칸에 참고 금액이 들었으면 ' · 참고 {금액} 포함')
function tipOf(ctx: Ctx, kind: BarKind, slot: Slot, sum: Sum, value: Exclude<BarValue, null>): string {
  const when = whenOf(ctx.unit, slot)
  if (value === 'unchecked') return `${when} ${UNCHECKED_TIP}`
  const rough = roughDaysOf(sum)
  if (rough.length === 0) return `${when} ${kind.text(sum)}`
  return ctx.unit === 'day' ? `${when} ${kind.roughDay(sum)}` : `${when} ${kind.text(sum)} · 참고 ${formatManWon(sum.roughSum ?? 0)} 포함`
}

// 막대 칸 · 계열 · 범례 · 아래 줄 글 · 아래 글. withRough(켜짐)이면 계열이 둘(참고 금액 빗금이 맨 위)이다
function barsView(ctx: Ctx, kind: BarKind, withRough: boolean): BarsView {
  const zeros = () => (withRough ? [0, 0] : [0])
  const tips: Record<string, string> = {}
  const bars = filled(ctx.slots).map(({ slot, sum, state }): BarBucket => {
    const head = { key: slot.key, label: slot.label, rangeLabel: slot.rangeLabel, state }
    const value = kind.value(sum)
    if (value === null) return { ...head, values: zeros(), blank: 'no-data' }
    tips[slot.key] = tipOf(ctx, kind, slot, sum, value)
    if (value === 'unchecked') return { ...head, values: zeros(), mark: 'unchecked' }
    return { ...head, values: withRough ? [value.rough, value.main] : [value.main] }
  })
  const buckets = ctx.unit === 'month' ? [...bars, ...futureBuckets(ctx.input.range, zeros())] : bars
  const main: BarSeries = { name: kind.main, tone: 'accent' }
  const extra = [...(withRough ? [ROUGH_LEGEND] : []), ...(buckets.some((bucket) => bucket.mark === 'unchecked') ? [UNCHECKED_LEGEND] : [])]
  return {
    series: withRough ? [{ name: kind.rough, tone: 'rough' }, main] : [main],
    buckets,
    legend: extra.length === 0 ? [] : [{ label: kind.main, mark: 'accent' }, ...extra],
    tips,
    dense: buckets.length > DENSE_OVER,
    note: barNote(ctx),
  }
}

// 막대 아래 글(기본값 7, first90 AC-4408.3). 켜짐(ctx가 참고 금액을 더해 셈)이면 참고 금액 날은 빗금 글, 남은 확인 필요한 날은 꺼짐 글이다.
// 날 칸: 휴진(+ 저장 안 한 날) 문장 + 빗금 글 + 점선 글. 주·달 칸: 빗금 글 + 확인 필요한 날 + 12개월의 끝나지 않은 달 빗금
function barNote(ctx: Ctx): string | null {
  const rough = roughDaysOf(ctx.sum)
  const left = ctx.sum.uncheckedDays.filter((date) => !rough.includes(date))
  const roughPart = rough.length === 0 ? [] : [roughNote(rough)]
  if (ctx.unit === 'day') {
    const first = savedAll(ctx.byDay, ctx.view) ? CLOSED_NOTE : CLOSED_OR_UNSAVED_NOTE
    return [first, ...roughPart, ...(left.length === 0 ? [] : [dashedNote(left)])].join(' ')
  }
  const { lastDay, range } = ctx.input
  const open = range.period === '12m' && filled(ctx.slots).some(({ slot }) => slot.cut && slot.key === monthOf(lastDay))
  const parts = [
    ...roughPart,
    ...(left.length === 0 ? [] : [`확인 필요한 날(${daysText(left)})은 금액을 합계에 넣지 않았어요.`]),
    ...(open ? [`빗금 칸은 아직 끝나지 않은 달이에요(${monthNumber(lastDay)}월은 ${dayNumber(lastDay)}일까지).`] : []),
  ]
  return parts.length === 0 ? null : parts.join(' ')
}

// ── 매출 요약 칸 셋 (first90 AC-4408.1·AC-4408.2) ───────────

const NO_COMPARE_DELTA: DeltaText = { dir: 'none', text: NO_COMPARE, srText: '' }
const FLAT_DELTA: DeltaText = { dir: 'flat', text: '변화 없음', srText: '' }

const blankCell = (key: RevenueCell['key'], note: string): RevenueCell => ({ key, label: LABELS[key], hint: null, tag: false, value: DASH, unit: null, tone: 'none', delta: null, notes: [note] })
const blankCells = (note: string): RevenueCell[] => [blankCell('total', note), blankCell('perVisit', note), blankCell('unchecked', note)]

/** 확인 필요한 날 가운데 참고 금액(roughTotal)이 숫자인 날(0·음수 포함)과 그 합. 받는 날짜 차례 그대로다 */
function roughOf(byDay: ReadonlyMap<string, SavedDay>, dates: readonly string[]): { dates: string[]; sum: number } {
  const found: string[] = []
  let sum = 0
  for (const date of dates) {
    const rough = byDay.get(date)?.roughTotal
    if (typeof rough !== 'number') continue
    found.push(date)
    sum += rough
  }
  return { dates: found, sum }
}

// 총매출 증감: 금액 차 + 비율('60만 원 (+0.4%)'), 줄 끝 글 = '{비교 이름}보다 늘어남·줄어듦'. 견줄 수 없으면 '비교할 자료가 없어요'(기본값 5)
function totalDelta(ctx: Ctx): DeltaText {
  if (ctx.main === null) return NO_COMPARE_DELTA
  const { now, before } = ctx.main
  const change = compare(now.total, before.total)
  if (change === null) return NO_COMPARE_DELTA
  if (change.rate === 0) return FLAT_DELTA
  const rising = change.rate > 0
  const text = `${formatManWon(Math.abs(now.total - before.total))} (${rising ? '+' : MINUS}${Math.abs(change.rate).toFixed(1)}%)`
  return { dir: rising ? 'up' : 'down', text, srText: `${ctx.name}보다 ${rising ? '늘어남' : '줄어듦'}` }
}

// 비교 기간에서 빠진 확인 필요한 날 수(AC-4408.2): 꺼짐은 그 기간 확인 필요한 날 모두, 켜짐(참고 금액을 더해 센 ctx)은 그 가운데 참고 금액이 없는 날
function comparedMissing({ before }: Compared): number {
  const rough = roughDaysOf(before)
  return before.uncheckedDays.filter((date) => !rough.includes(date)).length
}

// 총매출 아래 글 줄들: 진료한 날·하루 평균(켜짐이면 참고 금액 포함) + 견준 비교 기간에 빠진 날이 있으면 '{비교 이름}도 확인 필요한 날 {k}일을 빼고 견줬어요'
function totalNotes(ctx: Ctx, delta: DeltaText, roughNote: string): string[] {
  const { sum, main, name } = ctx
  const missing = main === null || delta.dir === 'none' ? 0 : comparedMissing(main)
  return [`진료한 날 ${formatCount(sum.workDays)}일 · 하루 평균 ${formatManWon(Math.floor(sum.total / sum.workDays))}${roughNote}`, ...(missing === 0 ? [] : [comparedNote(name, missing)])]
}

// 건당 진료비 증감: 비율만('+2.9%'), 줄 끝 글 없음. 같은 두 기간의 건당 진료비끼리 견준다
function perVisitDelta(ctx: Ctx): DeltaText {
  if (ctx.main === null) return NO_COMPARE_DELTA
  const change = deltaText(perVisit(ctx.main.now), perVisit(ctx.main.before))
  return change.dir === 'none' ? NO_COMPARE_DELTA : { ...change, srText: '' }
}

// 확인 필요한 날 아래 글: 참고 금액이 있는 날과 없는 날을 한 줄씩. 있는 날은 켜짐이면 '참고 금액 {합} 포함', 꺼짐이면 '금액이 확실하지 않아 뺐어요'
function uncheckedNotes(unchecked: readonly string[], rough: { dates: string[]; sum: number }, withRough: boolean): string[] {
  const unknown = unchecked.filter((date) => !rough.dates.includes(date))
  return [
    ...(rough.dates.length === 0 ? [] : [`${daysText(rough.dates)} · ${withRough ? `참고 금액 ${formatManWon(rough.sum)} 포함` : '금액이 확실하지 않아 뺐어요'}`]),
    ...(unknown.length === 0 ? [] : [`${daysText(unknown)} · 금액을 알 수 없어 뺐어요`]),
  ]
}

/**
 * 매출 요약 칸 셋(AC-4105.1·AC-4105.2·AC-4408.2): 총매출(+ 증감 줄) · 건당 진료비(+ 비율 증감 줄) · 확인 필요한 날.
 * mode 'in'(참고 금액 포함)은 보는 기간에 참고 금액이 있는 날이 있을 때만 셈을 바꾸고(비교 기간도 같은 방식), 없으면 'out'과 같다
 */
export function revenueCells(input: RevenueInput | 'reading' | 'read-failed', mode: RevenueMode = 'out'): RevenueCell[] {
  if (input === 'reading') return blankCells(READING)
  if (input === 'read-failed') return blankCells(NO_DATA)
  const plain = contextOf(input)
  if (plain === null) return blankCells(NO_DATA)
  const rough = roughOf(plain.byDay, plain.sum.uncheckedDays)
  const withRough = mode === 'in' && rough.dates.length > 0
  const ctx = withRough ? (contextOf(input, true) ?? plain) : plain
  const { sum } = ctx
  const value = perVisit(sum)
  const unchecked = sum.uncheckedDays
  const roughNote = withRough ? ` · 참고 ${formatManWon(rough.sum)} 포함` : ''
  const delta = totalDelta(ctx)
  return [
    sum.workDays === 0
      ? blankCell('total', NO_DATA)
      : {
          key: 'total',
          label: LABELS.total,
          hint: null,
          tag: withRough,
          value: manValue(sum.total),
          unit: '원',
          tone: 'ink',
          delta,
          notes: totalNotes(ctx, delta, roughNote),
        },
    value === null
      ? blankCell('perVisit', NO_DATA)
      : {
          key: 'perVisit',
          label: LABELS.perVisit,
          hint: `매출 ÷ 접수 ${countText(sum.perVisitCount)}`,
          tag: withRough,
          value: formatCount(value),
          unit: '원',
          tone: 'ink',
          delta: perVisitDelta(ctx),
          notes: [],
        },
    unchecked.length === 0
      ? { key: 'unchecked', label: LABELS.unchecked, hint: null, tag: false, value: '없음', unit: null, tone: 'ink', delta: null, notes: [] }
      : {
          key: 'unchecked',
          label: LABELS.unchecked,
          hint: null,
          tag: false,
          value: formatCount(unchecked.length),
          unit: '일',
          tone: 'warn',
          delta: null,
          notes: uncheckedNotes(unchecked, rough, withRough),
        },
  ]
}

/** 참고 금액 포함 스위치에 줄 날 수(AC-4408.1). 보는 기간만 센다. 읽는 중·읽기 실패·저장된 매출 없음이면 null(스위치 없음) */
export function roughInfo(input: RevenueInput | 'reading' | 'read-failed'): RoughInfo | null {
  if (input === 'reading' || input === 'read-failed') return null
  const ctx = contextOf(input)
  if (ctx === null) return null
  return { days: ctx.sum.uncheckedDays.length, roughDays: roughOf(ctx.byDay, ctx.sum.uncheckedDays).dates.length }
}

// ── 탭 넷 ────────────────────────────────────────────────

// withRough(켜짐): ctx가 참고 금액을 더해 센 것이고, 머리 글 금액·비교 금액도 그 셈이다(first90 AC-4408.3)
function trendTab(ctx: Ctx, honorific: Honorific, withRough = false): TrendTab {
  const { sum, main, name, unit } = ctx
  return {
    desc: `매출 = 총진료비 · 수납한 날 기준, ${EACH[unit]}`,
    lead: { text: '이 기간 매출', amount: sum.workDays === 0 ? DASH : formatManWon(sum.total), rest: main === null ? null : `· ${name} ${formatManWon(main.before.total)}` },
    tag: withRough,
    ...barsView(ctx, TREND_KIND, withRough),
    how: withRough ? trendHowRough(honorific) : trendHow(honorific),
  }
}

// 그림 칸마다 아래부터 급여·비급여·기타. 나눔이 없는 칸(확인 필요한 날·나눔을 못 한 날뿐)은 겹이 없다. 눈금은 칸 매출의 최대(매출 추이와 같다)
function stackChart(ctx: Ctx): StackChart | null {
  const cells = filled(ctx.slots)
  const scale = niceScale(Math.max(0, ...cells.map(({ sum }) => (sum.workDays === 0 ? 0 : sum.total))))
  const won = (value: number | null) => (value === null ? DASH : formatWon(value))
  const columns = cells.map(({ slot, sum, state }): StackColumn => {
    const { covered, noncovered, other } = sum
    const segments: StackSegment[] | null =
      covered === null || noncovered === null || other === null
        ? null
        : [
            { key: 'covered', height: percent(covered, scale.max) },
            { key: 'noncovered', height: percent(noncovered, scale.max) },
            { key: 'other', height: percent(other, scale.max) },
          ]
    return { month: slot.key, label: slot.label, year: '', kind: 'other', partial: state === 'partial', segments }
  })
  if (columns.every((column) => column.segments === null)) return null
  const title = `${EVERY[ctx.unit]} 급여·비급여·기타`
  return {
    title,
    legend: STACK_LEGEND,
    axis: { unit: '(만 원)', ticks: scale.ticks.map((tick) => ({ label: formatCount(tick / WON_PER_MAN), bottom: percent(tick, scale.max) })) },
    columns,
    table: {
      caption: `${title} (원)`,
      head: [TABLE_HEAD[ctx.unit], '급여', '비급여', '기타'],
      rows: cells.map(({ slot, sum }) => [slot.tableName, won(sum.covered), won(sum.noncovered), won(sum.other)]),
    },
  }
}

function splitTab(ctx: Ctx): SplitTab {
  const { sum, input, name } = ctx
  const { range } = input
  const hasNoSplit = sum.noSplitDays.length > 0
  const withYear = range.lastYear !== null
  const head = ['나눔', range.name, '몫', `${name}보다`, ...(withYear ? ['작년 같은 때보다'] : [])]
  const notice = dayNotice(sum.noSplitDays, NO_SPLIT_REST)
  const { covered, insurer, selfPay, noncovered, other, splitTotal } = sum
  if (splitTotal === null || covered === null || insurer === null || selfPay === null || noncovered === null || other === null) {
    return {
      desc: NO_DATA,
      notice,
      head,
      rows: SPLIT_BLANK_ROWS.map(([rowName, kind]) => ({ name: rowName, kind, amount: DASH, share: DASH, delta: NO_DELTA, lastYear: withYear ? NO_DELTA : null })),
      how: [hasNoSplit ? SPLIT_NONE_PARTIAL : SPLIT_NONE],
      chart: null,
    }
  }
  // 이 기간이나 비교 기간에 나눔을 못 한 날이 있으면 견주지 않는다(AC-4105.4)
  const deltaOf = (pair: Compared | null, pick: (s: Sum) => number | null) =>
    hasNoSplit || pair === null || pair.now.noSplitDays.length > 0 || pair.before.noSplitDays.length > 0 ? NO_DELTA : deltaText(pick(pair.now), pick(pair.before))
  const row = (rowName: string, kind: SplitRow['kind'], value: number, pick: ((s: Sum) => number | null) | null): RevenueSplitRow => ({
    name: rowName,
    kind,
    amount: formatManWon(value),
    share: shareText(value, splitTotal),
    delta: pick === null ? NO_DELTA : deltaOf(ctx.main, pick),
    lastYear: withYear ? (pick === null ? NO_DELTA : deltaOf(ctx.lastYear, pick)) : null,
  })
  return {
    desc: `${range.name} 비급여 몫 ${shareText(noncovered, splitTotal)} · 기타 몫 ${shareText(other, splitTotal)}`,
    notice,
    head,
    rows: [
      row('급여', 'main', covered, (s) => s.covered),
      row('공단부담', 'sub', insurer, null),
      row('본인부담', 'sub', selfPay, null),
      row('비급여', 'main', noncovered, (s) => s.noncovered),
      row('기타', 'main', other, (s) => s.other),
      { ...row(hasNoSplit ? '합계' : '합계 · 매출', 'sum', splitTotal, (s) => s.total), share: '100%' },
    ],
    how: [`${SPLIT_NOTE}${hasNoSplit ? SPLIT_PARTIAL : SPLIT_FULL}`, ctx.unit === 'day' ? SPLIT_DAY_BARS : splitSpanBars(ctx.unit)],
    chart: stackChart(ctx),
  }
}

// 보는 기간에 통째로 든 달 가운데 날 단위 처방 금액이 하루도 없고 옛 달 합계가 있는 달(기본값 4)
function oldMonthsOf({ input, view, byDay }: Ctx): Set<string> {
  const withTotals = new Set(input.monthCodes.map((row) => row.month))
  const months = new Set<string>()
  for (let month = monthOf(view.from); compareYmd(`${month}-01`, view.to) <= 0; month = addMonths(month, 1)) {
    const whole = monthRange(month)
    const inside = compareYmd(whole.from, view.from) >= 0 && compareYmd(whole.to, view.to) <= 0
    if (inside && withTotals.has(month) && !eachDay(whole).some((day) => byDay.get(day)?.dayCodes === true)) months.add(month)
  }
  return months
}

// 금액이 빠진 줄이 섞인 코드 합은 아는 금액 + 금액 없는 빈 줄로 넘긴다(groupTreatments가 missing을 단다)
function codeRows(codes: readonly CodeTotal[]): RevenueCodeRow[] {
  return codes.flatMap(({ code, count, amount, missing }) => {
    const known: RevenueCodeRow = { code, name: null, count, amount }
    return missing ? [known, { code, name: null, count: 0, amount: null }] : [known]
  })
}

function treatmentsTab(ctx: Ctx): TreatmentsTab {
  const { input, view, byDay } = ctx
  const empty = { desc: `${input.range.name} · 처방한 날 기준 · 처방 칸의 묶음으로 세요`, lead: null, rows: [] as TreatmentRow[], notice: null, how: TREAT_HOW }
  if (input.groups === 'reading') return { ...empty, state: 'reading', lines: [READING] }
  if (input.groups === 'read-failed') return { ...empty, state: 'read-failed', lines: [GROUPS_FAILED] }
  const oldMonths = oldMonthsOf(ctx)
  const totals = groupTreatments([...codeRows(input.codes), ...input.monthCodes.filter((row) => oldMonths.has(row.month))], input.groups)
  if (totals.length === 0) return { ...empty, state: 'none', lines: input.noDayCodes ? [TREAT_NONE, TREAT_OLD_HELPER] : [TREAT_NONE] }
  // 날 단위 처방 금액도 옛 달 합계도 없는 진료한 날은 표에서 빠진다
  const missing = rowsIn(byDay, view)
    .filter((row) => isWorkDay(row) && !row.dayCodes && !oldMonths.has(monthOf(row.date)))
    .map((row) => row.date)
  const whole = totals.reduce((n, item) => n + item.amount, 0)
  const max = Math.max(0, ...totals.filter((item) => !item.rest).map((item) => item.amount))
  const unknown = (item: (typeof totals)[number]) => item.missing && item.amount === 0 // 금액을 모르는 코드뿐이면 0원이 아니다
  return {
    ...empty,
    state: 'rows',
    lead: { text: '이 기간 처방 금액', amount: totals.every(unknown) ? DASH : formatManWon(whole), rest: '· 묶음은 처방 칸의 묶음 그대로예요' },
    rows: totals.map((item) => ({
      name: item.name,
      amount: unknown(item) ? DASH : formatManWon(item.amount),
      share: unknown(item) ? DASH : shareText(item.amount, whole),
      detail: item.rest ? REST_DETAIL : `처방 ${formatCount(item.count)}번`,
      width: percent(item.amount, max),
      rest: item.rest,
      missing: item.missing,
    })),
    notice: dayNotice(missing, NO_CODES_REST),
    lines: [],
  }
}

// withRough(켜짐): ctx가 참고 금액을 더해 센 것이라 숫자 칸 셋·안내 줄이 매출 요약 켜짐 건당 진료비와 같은 셈이다(first90 AC-4408.3)
function perVisitTab(ctx: Ctx, honorific: Honorific, withRough = false): PerVisitTab {
  const { sum, main, name, input } = ctx
  const now = input.range.name
  const value = perVisit(sum)
  const before = main === null ? null : perVisit(main.before)
  const delta = main === null ? NO_DELTA : deltaText(perVisit(main.now), before)
  return {
    desc: PER_VISIT_DESC,
    kpis: [
      value === null
        ? blankKpi(`${now} 건당 진료비`, NO_DATA)
        : { name: `${now} 건당 진료비`, value: formatWon(value), sub: `매출 ÷ 접수 ${countText(sum.perVisitCount)}${withRough ? ROUGH_SUB : ''}`, tone: 'ink', srText: '' },
      delta.dir === 'none' || before === null
        ? blankKpi(`${name}보다`, NO_COMPARE)
        : { name: `${name}보다`, value: delta.text, sub: `${name} ${formatWon(before)}`, tone: delta.dir, srText: delta.srText },
      sum.visits === null
        ? blankKpi(`${now} 접수 건수`, NO_DATA)
        : {
            name: `${now} 접수 건수`,
            value: countText(sum.visits),
            sub: main !== null && main.before.visits !== null ? `${name} ${countText(main.before.visits)}` : NO_COMPARE,
            tone: 'ink',
            srText: '',
          },
    ],
    ...barsView(ctx, PER_VISIT_KIND, withRough),
    notice: dayNotice(sum.noVisitDays, NO_VISIT_REST),
    how: withRough ? perVisitHowRough(honorific) : perVisitHow(honorific),
  }
}

/**
 * 매출 칸 탭 넷(AC-4107.2~AC-4107.8의 숫자·글). 보는 기간에 저장된 매출이 없거나 모두 쉬는 날이면 empty(AC-4107.7).
 * 참고 금액 포함 스위치(first90 AC-4408.3): 보는 기간에 참고 금액이 있는 확인 필요한 날이 있으면 rough에 켜짐 두 탭(매출 추이·건당 진료비)을 더 센다.
 * 켜짐 건당 진료비 탭은 막대·숫자 칸 셋·안내 줄 모두 켜짐 셈이라 매출 요약 켜짐 건당 진료비와 같다(설명 줄·첫 문단은 꺼짐 그대로). 급여·비급여·기타·치료별 매출은 켜짐에도 이 하나다(AC-4408.4).
 * 켜짐이면 그 두 탭 맨 위에 rough.outside(보는 기간 참고 금액 합·날 수, 그 탭에는 넣지 않음)를 그린다
 * honorific: [어떻게 세나요?] 글의 '{호칭} 보고 문장'(clinic-profile AC-6606.3, 통계 틀이 병원 정보에서 읽어 넘김). 주지 않으면 '원장님'
 */
export function revenueTabs(input: RevenueInput, honorific: Honorific = DEFAULT_HONORIFIC): RevenueTabs {
  const ctx = contextOf(input)
  if (ctx === null) return { kind: 'empty' }
  const found = roughOf(ctx.byDay, ctx.sum.uncheckedDays)
  const roughCtx = found.dates.length > 0 ? contextOf(input, true) : null
  return {
    kind: 'ready',
    trend: trendTab(ctx, honorific),
    split: splitTab(ctx),
    treatments: treatmentsTab(ctx),
    perVisit: perVisitTab(ctx, honorific),
    rough: roughCtx === null ? null : { trend: trendTab(roughCtx, honorific, true), perVisit: perVisitTab(roughCtx, honorific, true), outside: outsideNote(found.sum, found.dates.length) },
  }
}
