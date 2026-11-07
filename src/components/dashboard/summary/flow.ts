import { formatCount } from '@/components/charts/format'
import type { BarBucket } from '@/components/charts/StackedBarChart'
import { lastDayOf, pickRange, type StatsChoice, type StatsPick } from '@/components/stats/periodPick'
import { patientTrend, type StatsPeriod, type StatsRange } from '@/components/stats/view'
import { diffDays, monthOf, monthRange } from '@/lib/analytics/dates'
import type { TrendBucket } from '@/types/analysis'
import type { DayPayload } from '@/types/payload'
import { longDate, periodRange, tickLabels, todayView, trendBuckets, type Period, type PeriodRange } from './view'

// 대시보드 기간별 흐름의 고른 것 → 그릴 기간 (dashboard-period REQ-1801·REQ-1802·REQ-1803, design.md 'summary/flow.ts').
// 순수 모듈이다. 통계는 여기와 DashboardAnalysis.tsx에서만 부른다: periodPick(pickRange·lastDayOf·타입), view(patientTrend·타입).
// summary/view.ts는 통계를 부르지 않는다(통계 view.ts가 그 파일을 불러 고리가 생긴다). 날짜는 lib/analytics/dates.ts만 쓴다.
// 빠른 단추 갈래는 지금 함수(periodRange·trendBuckets·tickLabels)를 그대로 불러 지금과 한 글자도 같다

/** 빠른 단추(7·30·90일) 또는 통계 탭 기간 고르기의 고른 기간 */
export type FlowChoice = Period | StatsPick

type FlowCommon = {
  current: PeriodRange // 그래프 넷이 세는 기간(빠른 단추 = periodRange, 고른 기간 = pickRange(…).current)
  head: string // 머리 줄 기간 글. 빠른 단추는 지금 periodRange label 그대로
  span: string // 처방 상위 날짜 줄 앞부분. 빠른 단추 = head + ' (어제까지)', 고른 기간 = head
  bucket: TrendBucket // 막대 칸: 빠른 단추 'day', 고른 기간은 pickRange의 bucket
  lastDay: string // 끝난 마지막 날(lastDayOf) → PeriodPicker lastDay
  picker: StatsChoice // PeriodPicker choice. 빠른 단추는 QUICK_CHOICE
}
/** period: 빠른 단추면 일 수(range null), 고른 기간이면 null(range = 통계 범위, patientTrend에 넘긴다) */
export type Flow = FlowCommon & ({ period: Period; range: null } | { period: null; range: StatsRange })

export const QUICK_CHOICE: Record<Period, StatsPeriod> = { 7: '7d', 30: '30d', 90: '90d' }

const YESTERDAY = ' (어제까지)' // 빠른 단추는 늘 어제에서 끝난다
const TICK_DAYS = 31 // 고른 기간 일별 눈금: 31일 이하는 7일마다(30일 기간 눈금), 넘으면 21일마다(90일 기간 눈금). 통계 dayBars와 같다
const DENSE_OVER = 7 // 고른 기간 막대 위 합계는 칸 7개 이하일 때만(빠른 단추는 지금처럼 7일만)

const yearOf = (ymd: string) => ymd.slice(0, 4)
const yearName = (ymd: string) => `${Number(yearOf(ymd))}년`

// 기간 글. periodPick의 비교 글 규칙(spanLabel, 내보내지 않는다)과 같다: 오늘과 해가 같으면 해 없음, 다르면 첫날 앞에, 해를 넘으면 양 끝에, 같은 달이면 끝은 'N일'
// '10월 1일 – 31일' · '9월 3일 – 10월 2일' · '2025년 10월 1일 – 31일' · '2025년 12월 20일 – 2026년 1월 10일'
function spanText({ from, to }: { from: string; to: string }, today: string): string {
  if (yearOf(from) !== yearOf(to)) return `${yearName(from)} ${longDate(from)} – ${yearName(to)} ${longDate(to)}`
  const head = `${yearOf(from) === yearOf(today) ? '' : `${yearName(from)} `}${longDate(from)}`
  if (from === to) return head
  return `${head} – ${monthOf(from) === monthOf(to) ? `${Number(to.slice(8, 10))}일` : longDate(to)}`
}

// 끝나지 않은 달·해(끝난 날에서 잘림). 직접 날짜는 끝난 날까지만 고를 수 있어 늘 끝난 기간이다
function isOpen(pick: StatsPick, current: { to: string }): boolean {
  if (pick.kind === 'custom') return false
  const end = pick.kind === 'month' ? monthRange(pick.month).to : `${pick.year}-12-31`
  return current.to !== end
}

// 오늘 진료 끝 = 손에 든 오늘 줄이 있고 partial false(오늘 하루 분석의 closed와 같다). 비트 숫자는 오늘이 늘 partial이라 어제까지다
export function todayFinished(today: string, held: readonly DayPayload[]): boolean {
  return todayView(today, held).state === 'closed'
}

export function flowOf(today: string, choice: FlowChoice, todayDone: boolean): Flow {
  const lastDay = lastDayOf(today, todayDone)
  if (typeof choice === 'number') {
    const current = periodRange(today, choice)
    return { period: choice, range: null, current, head: current.label, span: `${current.label}${YESTERDAY}`, bucket: 'day', lastDay, picker: QUICK_CHOICE[choice] }
  }
  const range = pickRange(today, choice, todayDone)
  const head = `${spanText(range.current, today)}${isOpen(choice, range.current) ? ` (${todayDone ? '오늘' : '어제'}까지)` : ''}`
  return { period: null, range, current: range.current, head, span: head, bucket: range.bucket, lastDay, picker: choice }
}

// 환자 수 추이 칸. 고른 기간은 통계 patientTrend를 빌린다(주·달 칸·잘린 주·앞으로 올 달 규칙을 두 벌 두지 않는다).
// 대시보드는 덮은 기간을 읽지 않으므로 고른 기간 하나를 덮은 것으로 넘긴다: 줄 없는 날은 칸이 없고(지금 대시보드 규칙),
// 주·달의 '일부 기간'은 기간에 잘림·끝나지 않음·partial 줄로만 정해지며, 줄 없는 주·달은 '–'(no-data), 해 고르기의 앞으로 올 달은 빈 칸(future)이다
export function flowTrend(days: readonly DayPayload[], flow: Flow): BarBucket[] | null {
  if (flow.period !== null) return trendBuckets(days, flow.current, flow.period)
  return patientTrend({ days, covered: [{ from: flow.current.from, to: flow.current.to }], range: flow.range })
}

// 환자 수 추이 빈 틀의 날짜 눈금. 고른 기간의 주·달 칸은 눈금이 없다
export function flowTicks(flow: Flow): { day: string; label: string }[] {
  if (flow.period !== null) return tickLabels(flow.current, flow.period)
  if (flow.bucket !== 'day') return []
  return tickLabels(flow.current, diffDays(flow.current.from, flow.current.to) + 1 <= TICK_DAYS ? 30 : 90)
}

// 막대 위 합계를 뺄지(StackedBarChart dense). 빠른 단추는 지금처럼 7일만 합계가 있다
export function flowDense(flow: Flow, buckets: readonly BarBucket[]): boolean {
  return flow.period !== null ? flow.period !== 7 : buckets.length > DENSE_OVER
}

// 그래프 설명 줄·보이는 표 캡션의 기간 기준(dashboard-ux AC-2706.3): 빠른 단추는 '최근 N일', 고른 기간은 머리 줄 기간 글 그대로
export function flowBasis(flow: Flow): string {
  return flow.period !== null ? `최근 ${flow.period}일` : flow.head
}

// 처방 상위 설명 아래 날짜 줄. count = 기간 안 자료 있는 날 수(dayCount). 0·null(줄 없음·읽는 중·실패)이면 기간 글뿐이다
export function rankLine(flow: Flow, count: number | null): string {
  return count !== null && count >= 1 ? `${flow.span} · 자료 있는 ${formatCount(count)}일` : flow.span
}
