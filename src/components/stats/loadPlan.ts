import { addMonths, compareYmd, diffDays, monthOf, monthRange } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { StatsLoaded } from '@/types/stats'
import { FIRST_DAY, hasFinal, spanLabel } from './periodPick'
import type { SaveInput } from './useStatsData'
import type { StatsRange } from './view'

// 통계 비트 '불러올 기간'의 나눠 읽기 계획과 글 (stats-load-range REQ-3301·REQ-3302·REQ-3303, design.md loadPlan.ts).
// 순수 모듈이다. 날짜는 lib/analytics/dates.ts만 쓰고, 날짜 글·받침 조사는 periodPick.ts의 것을 쓴다(두 곳에 두지 않는다).
// 한 번 읽기는 MAX_READ_DAYS 이하(도우미 stats.rows maxDays). 넘으면 오늘이 든 달부터 거꾸로 24달씩 잘라 새것부터 읽는다.
// 조각은 달 1일 ~ 말일이다(가장 새 조각만 오늘에 끝나고 가장 옛 조각만 whole 첫날에 시작): 달 줄은 달마다 덮어쓰므로 반쪽 달로 덮지 않는다

export type LoadSpan = 'view' | '1y' | '2y' | 'all'
export const LOAD_SPANS: readonly { span: LoadSpan; name: string }[] = [
  { span: 'view', name: '지금 보는 기간' },
  { span: '1y', name: '최근 1년' },
  { span: '2y', name: '최근 2년' },
  { span: 'all', name: '2020년부터 전부' },
]

// src/lib/bridge/commands.json stats.rows maxDays · stats_coverage 덮은 기간 제약과 같다(AC-3305.1 시험이 묶는다)
export const MAX_READ_DAYS = 800
const PART_MONTHS = 24 // 한 조각(731일 이하). 이웃 달 하나씩 더 읽어도 26달(793일 이하)이라 한도 안이다
const SPAN_MONTHS: Record<'1y' | '2y', number> = { '1y': 12, '2y': 24 }
const SPAN_TAG: Record<'1y' | '2y', string> = { '1y': '(1년)', '2y': '(2년)' }
const QUICK_DAYS = 100 // 이 날 수 이하 한 번 읽기는 '빨리 끝나요'
const HALF_MINUTE_DAYS = 400 // 이 날 수 이하는 '30초쯤', 그 위는 '1분쯤'. 나눠 읽으면 조각당 1분으로 친다(어림)

// save = 저장할 날들(달 1일 ~ 말일), read = 도우미에 묻는 범위(save에 이웃 조각 쪽으로 한 달씩 더함)
export type LoadPart = { save: DateRange; read: DateRange }
// parts는 새것부터. keepAt = Worker 메모리에 남길 조각(지금 보는 기간을 다 담는 가장 새 조각, 없으면 0)
export type LoadPlan = { span: LoadSpan; whole: DateRange; parts: LoadPart[]; keepAt: number }

const later = (a: string, b: string) => (compareYmd(a, b) >= 0 ? a : b)
const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)
const firstOf = (month: string) => monthRange(month).from
const lastOf = (month: string) => monthRange(month).to
const yearName = (ymd: string) => `${Number(ymd.slice(0, 4))}년`
const monthName = (ymd: string) => `${yearName(ymd)} ${Number(ymd.slice(5, 7))}월`

// 단추 첫날. 지금 보는 기간은 없음(range.load 그대로), 최근 1년·2년은 오늘이 든 달의 11·23달 전 달 1일
function spanFirst(today: string, span: LoadSpan): string | null {
  if (span === 'view') return null
  if (span === 'all') return FIRST_DAY
  return firstOf(addMonths(monthOf(today), 1 - SPAN_MONTHS[span]))
}

// whole이 MAX_READ_DAYS를 넘을 때. 오늘이 든 달부터 거꾸로 24달씩, 새것부터
function splitParts(whole: DateRange): LoadPart[] {
  const saves: DateRange[] = []
  for (let end = monthOf(whole.to); ; end = addMonths(end, -PART_MONTHS)) {
    const from = later(firstOf(addMonths(end, 1 - PART_MONTHS)), whole.from)
    saves.push({ from, to: saves.length === 0 ? whole.to : lastOf(end) })
    if (from === whole.from) break
  }
  const oldest = saves.length - 1
  return saves.map((save, i) => ({
    save,
    read: {
      from: i === oldest ? save.from : firstOf(addMonths(monthOf(save.from), -1)),
      to: i === 0 ? save.to : lastOf(addMonths(monthOf(save.to), 1)),
    },
  }))
}

// 지금 보는 기간(끝은 오늘까지, StatsScreen splitSpan과 같은 범위)을 다 담는 가장 새 조각
function keepIndex(today: string, range: StatsRange, parts: readonly LoadPart[]): number {
  const to = earlier(range.current.to, today)
  const at = parts.findIndex(({ read }) => compareYmd(read.from, range.current.from) <= 0 && compareYmd(read.to, to) >= 0)
  return at < 0 ? 0 : at
}

export function planLoad(today: string, range: StatsRange, span: LoadSpan): LoadPlan {
  const first = spanFirst(today, span)
  const whole = { from: first === null ? range.load.from : earlier(range.load.from, first), to: today }
  const parts = diffDays(whole.from, whole.to) + 1 <= MAX_READ_DAYS ? [{ save: whole, read: whole }] : splitParts(whole)
  return { span, whole, parts, keepAt: keepIndex(today, range, parts) }
}

// Worker 답에서 이 조각이 저장할 것만. 이웃 조각 쪽으로 더 읽은 달은 버린다(그 달은 이웃 조각이 저장한다).
// 조각이 하나(save = read)면 거르는 것이 없어 Worker 값 그대로다. sections 열쇠가 없으면(옛 도우미) 넘기지 않는다
export function partSave(view: StatsLoaded, { save }: LoadPart): SaveInput {
  const firstMonth = monthOf(save.from)
  const lastMonth = monthOf(save.to)
  const inMonths = (month: string) => month >= firstMonth && month <= lastMonth
  const inDays = (day: string) => compareYmd(day, save.from) >= 0 && compareYmd(day, save.to) <= 0
  const sections = view.sections === undefined ? {} : { sections: view.sections === null ? null : view.sections.filter((row) => inMonths(row.month)) }
  return {
    months: (view.months ?? []).filter((row) => inMonths(row.month)),
    days: (view.days ?? []).filter((row) => inDays(row.day)),
    covered: overlapOf(view.covered, save),
    source: 'bit',
    ...sections,
  }
}

function overlapOf(covered: DateRange | null, save: DateRange): DateRange | null {
  if (covered === null) return null
  const from = later(covered.from, save.from)
  const to = earlier(covered.to, save.to)
  return compareYmd(from, to) <= 0 ? { from, to } : null
}

// ── 글 ──────────────────────────────────────────────────

function timeText(plan: LoadPlan): string {
  if (plan.parts.length > 1) return `${plan.parts.length}분쯤 걸려요.`
  const days = diffDays(plan.whole.from, plan.whole.to) + 1
  if (days <= QUICK_DAYS) return '빨리 끝나요.'
  return days <= HALF_MINUTE_DAYS ? '30초쯤 걸려요.' : '1분쯤 걸려요.'
}

// 단추 아래 안내 줄(AC-3301.3·AC-3301.4). 날짜 글은 비교 글처럼 해가 같으면 해 없이, 넘으면 양 끝에 해
export function loadHint(today: string, range: StatsRange, plan: LoadPlan): string {
  const dates = spanLabel(plan.whole, false)
  const { span } = plan
  let head: string
  if (span === 'view') {
    const names = [range.previous.name, ...(range.lastYear === null ? [] : [range.lastYear.name])].join('·')
    head = `지금 보는 기간(${range.name})과 비교할 ${names}${hasFinal(names) ? '이' : '가'} 든 ${dates}`
  } else {
    head = (span === '1y' || span === '2y') && plan.whole.from === spanFirst(today, span) ? `${dates}${SPAN_TAG[span]}` : dates
  }
  const read = plan.parts.length > 1 ? `을 2년씩 ${plan.parts.length}번에 나눠 읽어요.` : '을 읽어요.'
  const once = span === 'all' ? ' 한 번 저장한 달은 남으니 처음 한 번만 하면 돼요.' : ''
  return `${head}${read} ${timeText(plan)}${once}`
}

// '2022년 12월 – 2024년 11월' · 한 달이면 '2020년 1월'
export function monthsLabel({ from, to }: DateRange): string {
  return monthOf(from) === monthOf(to) ? monthName(from) : `${monthName(from)} – ${monthName(to)}`
}

// 나눠 읽는 중 줄(조각이 둘 이상). at = 읽는 조각의 차례(0부터)
export function progressText(plan: LoadPlan, at: number): string {
  return `비트 PC에서 읽는 중이에요 (${at + 1}/${plan.parts.length} · ${monthsLabel(plan.parts[at].save)}). 다 끝날 때까지 이 창을 닫지 마세요.`
}

// 다 저장한 상자. savedTo = 저장한 끝날(오늘 진료 끝이면 오늘, 아니면 어제)
export function doneText(plan: LoadPlan, savedTo: string): [string, string] {
  const { from } = plan.whole
  const since = from.slice(5) === '01-01' ? yearName(from) : monthName(from)
  return [`${spanLabel({ from, to: savedTo }, false)}을 저장했어요.`, `이제 위쪽 기간 고르기에서 ${since}부터 어느 달·해든 볼 수 있어요.`]
}

// 멈춘 상자. done = 저장한 조각 수(1 이상, done번째 다음 조각에서 멈춤), reason = '(오류 번호 …)' 또는 확인 건수 글
export function stoppedText(plan: LoadPlan, done: number, reason: string): [string, string] {
  const saved = { from: plan.parts[done - 1].save.from, to: plan.parts[0].save.to }
  const left = { from: plan.whole.from, to: plan.parts[done].save.to }
  return [
    `${plan.parts.length}번 가운데 ${done}번째까지 저장하고 멈췄어요.`,
    `${monthsLabel(saved)}은 저장됐어요. 남은 ${monthsLabel(left)}은 [이어서 불러오기]로 읽어요. ${reason}`,
  ]
}
