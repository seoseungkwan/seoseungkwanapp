import type {
  Aggregates,
  BucketRef,
  BucketStats,
  DayView,
  Delta,
  FollowUp,
  Grain,
  GrainView,
  GroupCompare,
  GroupStats,
  Rates,
  RevisitCounts,
  RevisitView,
  RxCompare,
  RxStats,
  Summary,
  Totals,
  TotalsDelta,
} from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import { bucketState, isCovered, mergeRanges } from './coverage'
import { addDays, addMonths, monthOf, monthRange, weekRange, weekStartOf } from './dates'

// 센 숫자(Aggregates) → 화면이 바로 쓸 요약과 증감. 증감을 만드는 곳은 여기 한 곳이다.
// 지금·이전 칸이 모두 완전하고 집계 품질이 정상일 때만 증감을 낸다(진행 중·부분 칸끼리, 일평균으로 채우지 않는다).
// today는 '진행 중' 판정에만 쓴다 — 맨 위 날은 PC 시계가 아니라 덮은 기간으로 정한다.
// 비율(신환율·재진율·재방문율)도 여기서 나눈다. 재방문 '집계 중'은 덮은 기간을 아는 이곳에서 정한다

export type { Delta }

type Quality = Summary['quality']

const UNAVAILABLE: Delta = { kind: 'unavailable' }
const IN_PROGRESS: Delta = { kind: 'in-progress' }
const ALL_UNAVAILABLE: TotalsDelta = { patients: UNAVAILABLE, newPatients: UNAVAILABLE, returning: UNAVAILABLE }
const ZERO: Totals = { patients: 0, newPatients: 0, returning: 0, unknown: 0 }
const NO_REVISIT: RevisitCounts = { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 }

const RISING_MIN_PREVIOUS = 5 // 급증감은 이전 5명 이상인 처방만(0→1 '신규'가 목록을 채우지 않게)
const TOP_COUNT = 5

// 칸 key·처방코드 모두 글자 순서(aggregate와 같게 localeCompare는 쓰지 않는다)
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// 갈래마다 칸 이름·덮는 날·n칸 옮기기
const CALENDAR: Record<Grain, { keyOf(date: string): string; rangeOf(key: string): DateRange; step(key: string, n: number): string }> = {
  day: { keyOf: (date) => date, rangeOf: (key) => ({ from: key, to: key }), step: (key, n) => addDays(key, n) },
  week: { keyOf: weekStartOf, rangeOf: weekRange, step: (key, n) => addDays(key, 7 * n) },
  month: { keyOf: monthOf, rangeOf: monthRange, step: (key, n) => addMonths(key, n) },
}

type Context = { grain: Grain; byKey: Map<string, BucketStats>; merged: DateRange[]; today: string }

function lastWhere<T>(list: readonly T[], test: (item: T) => boolean): T | null {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return list[i]
  return null
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null)

// ── 증감 하나 ─────────────────────────────────────────────

// 둘 다 유효할 때만 부른다. pct는 퍼센트
export function compareNumbers(current: number, previous: number): Delta {
  if (previous === 0) return current > 0 ? { kind: 'new' } : { kind: 'change', diff: 0, pct: null }
  const diff = current - previous
  return { kind: 'change', diff, pct: (diff / previous) * 100 }
}

// 증감을 낼 수 없으면 그 까닭(Delta), 낼 수 있으면 null
function blocked(current: BucketRef, previous: BucketRef | null, quality: Quality): Delta | null {
  if (quality === 'incomplete') return UNAVAILABLE
  if (current.state === 'in-progress') return IN_PROGRESS
  if (current.state !== 'complete' || previous?.state !== 'complete') return UNAVAILABLE
  return null
}

function totalsDelta(current: BucketRef, previous: BucketRef | null, quality: Quality): TotalsDelta {
  const block = blocked(current, previous, quality)
  if (block !== null || previous === null) {
    const delta = block ?? UNAVAILABLE // previous === null이면 blocked가 이미 UNAVAILABLE(타입 좁히기용)
    return { patients: delta, newPatients: delta, returning: delta }
  }
  return {
    patients: compareNumbers(current.totals.patients, previous.totals.patients),
    newPatients: compareNumbers(current.totals.newPatients, previous.totals.newPatients),
    returning: compareNumbers(current.totals.returning, previous.totals.returning),
  }
}

// ── 칸 ───────────────────────────────────────────────────

const ratesOf = (totals: Totals): Rates => ({
  newRate: ratio(totals.newPatients, totals.patients),
  returningRate: ratio(totals.returning, totals.patients),
})

// N일 재방문은 '칸 첫날 ~ 칸 끝날 + N일'이 다 덮이고 끝났을 때만 숫자다(칸 집단이 다 모였고 창도 다 지났다).
// 긴 창이 숫자면 짧은 창도 숫자다(30 → 14 → 7). after30은 30일과 같이 숫자이거나 null이다
function revisitView(range: DateRange, counts: RevisitCounts, ctx: Context): RevisitView {
  const ready = (days: number) => bucketState({ from: range.from, to: addDays(range.to, days) }, ctx.merged, ctx.today) === 'complete'
  const rateOf = (within: number | null) => (within === null ? null : ratio(within, counts.cohort))
  const within7 = ready(7) ? counts.within7 : null
  const within14 = ready(14) ? counts.within14 : null
  const ready30 = ready(30)
  const within30 = ready30 ? counts.within30 : null
  return {
    cohort: counts.cohort,
    within7,
    within14,
    within30,
    after30: ready30 ? counts.after30 : null,
    rate7: rateOf(within7),
    rate14: rateOf(within14),
    rate30: rateOf(within30),
  }
}

// 덮였지만 줄이 없는 칸은 0명인 칸
function refAt(ctx: Context, key: string): BucketRef {
  const range = CALENDAR[ctx.grain].rangeOf(key)
  const bucket = ctx.byKey.get(key)
  const totals = { ...(bucket?.totals ?? ZERO) }
  return {
    key,
    range,
    state: bucketState(range, ctx.merged, ctx.today),
    totals,
    rates: ratesOf(totals),
    revisit: revisitView(range, bucket?.revisit ?? NO_REVISIT, ctx),
  }
}

// 줄이 있는 칸 + 덮은 구간에 걸친 칸(휴진한 날·주도 0명으로 보이게). 안 덮였고 줄도 없는 칸은 넣지 않는다.
// 기간이 오늘 뒤까지 적힌 파일도 있어 빈 칸은 오늘이 든 칸까지만 채운다(오지 않은 주가 '이번 주'가 되지 않게)
function seriesOf(ctx: Context): BucketRef[] {
  const { keyOf, step } = CALENDAR[ctx.grain]
  const keys = new Set(ctx.byKey.keys())
  for (const { from, to } of ctx.merged) {
    const last = keyOf(compareText(to, ctx.today) < 0 ? to : ctx.today)
    for (let key = keyOf(from); compareText(key, last) <= 0; key = step(key, 1)) keys.add(key)
  }
  return [...keys].sort(compareText).map((key) => refAt(ctx, key))
}

// ── 처방·그룹 ────────────────────────────────────────────

type Counted = { patients: number; newPatients: number; returning: number; followup: FollowUp }

// 처방·그룹 하나의 지금 수·이전 수·증감·비율. stats는 지금 칸 숫자(없으면 0명)
function compareCounted(stats: Counted | undefined, previous: number | null, block: Delta | null) {
  const current = stats?.patients ?? 0
  const repeat = stats === undefined ? 0 : stats.followup[1] + stats.followup[2] + stats.followup[3]
  return {
    current,
    previous,
    delta: block ?? (previous === null ? UNAVAILABLE : compareNumbers(current, previous)),
    newRate: ratio(stats?.newPatients ?? 0, current),
    returningRate: ratio(stats?.returning ?? 0, current),
    followupRate: ratio(repeat, current),
  }
}

// 지금 칸에 있는 처방 + 이전 칸에만 있던 처방(지금 0명). 이전 칸이 완전하지 않으면 이전 숫자는 null
function compareRx(ctx: Context, current: BucketRef, previous: BucketRef | null, quality: Quality) {
  const block = blocked(current, previous, quality)
  const now = ctx.byKey.get(current.key)?.rx ?? []
  const before = previous?.state === 'complete' ? (ctx.byKey.get(previous.key)?.rx ?? []) : null
  const nowByCode = new Map(now.map((x) => [x.code, x]))
  const beforeByCode = new Map((before ?? []).map((x) => [x.code, x]))
  const info = new Map<string, RxStats>([...beforeByCode, ...nowByCode]) // 이름·유형은 지금 칸 것이 먼저

  const rx = [...info.values()]
    .sort((a, b) => compareText(a.code, b.code))
    .map(({ code, name, type }): RxCompare => {
      const previousCount = before === null ? null : (beforeByCode.get(code)?.patients ?? 0)
      return { code, name, type, ...compareCounted(nowByCode.get(code), previousCount, block) }
    })

  // 증감이 있는(change) 처방만 고르므로 품질 incomplete면 저절로 빈 배열
  const movers = rx.flatMap((x) =>
    x.delta.kind === 'change' && x.previous !== null && x.previous >= RISING_MIN_PREVIOUS ? [{ x, diff: x.delta.diff }] : [],
  )
  const topRising = movers
    .filter((m) => m.diff > 0)
    .sort((a, b) => b.diff - a.diff || compareText(a.x.code, b.x.code))
    .slice(0, TOP_COUNT)
    .map((m) => m.x)
  const topFalling = movers
    .filter((m) => m.diff < 0)
    .sort((a, b) => a.diff - b.diff || compareText(a.x.code, b.x.code))
    .slice(0, TOP_COUNT)
    .map((m) => m.x)
  return { rx, topRising, topFalling, groups: compareGroups(ctx, current, previous, quality) }
}

// 지금 칸에 있는 그룹 + 이전 칸에만 있던 그룹(지금 0명). 처방 비교와 같은 규칙, id 순. 급증감은 고르지 않는다
function compareGroups(ctx: Context, current: BucketRef, previous: BucketRef | null, quality: Quality): GroupCompare[] {
  const block = blocked(current, previous, quality)
  const nowById = new Map((ctx.byKey.get(current.key)?.groups ?? []).map((g) => [g.id, g]))
  const before = previous?.state === 'complete' ? (ctx.byKey.get(previous.key)?.groups ?? []) : null
  const beforeById = new Map<string, GroupStats>((before ?? []).map((g) => [g.id, g]))
  return [...new Set([...nowById.keys(), ...beforeById.keys()])].sort(compareText).map((id) => ({
    id,
    ...compareCounted(nowById.get(id), before === null ? null : (beforeById.get(id)?.patients ?? 0), block),
  }))
}

// ── [일]·[주]·[월] ────────────────────────────────────────

function dayView(ctx: Context, series: BucketRef[], quality: Quality): DayView {
  // 맨 위 날: 완전(덮였고 오늘보다 앞)하고 환자가 1명 이상인 가장 늦은 날
  const day = lastWhere(series, (ref) => ref.state === 'complete' && ref.totals.patients > 0)
  if (day === null) {
    return {
      day: null,
      prevClinicDay: null,
      vsPrevClinicDay: ALL_UNAVAILABLE,
      sameWeekdayLastWeek: null,
      vsSameWeekdayLastWeek: ALL_UNAVAILABLE,
      rx: [],
      topRising: [],
      topFalling: [],
      groups: [],
    }
  }
  // 직전 진료일: 그 앞 환자 1명 이상인 날. 두 날 사이가 다 덮이지 않으면 공백 속에 진짜 진료일이 있을 수 있어 모른다
  const before = lastWhere(series, (ref) => compareText(ref.key, day.key) < 0 && ref.totals.patients > 0)
  const prevClinicDay = before !== null && isCovered({ from: before.key, to: day.key }, ctx.merged) ? before : null
  const sameWeekdayLastWeek = refAt(ctx, addDays(day.key, -7))
  return {
    day,
    prevClinicDay,
    vsPrevClinicDay: totalsDelta(day, prevClinicDay, quality),
    sameWeekdayLastWeek,
    vsSameWeekdayLastWeek: totalsDelta(day, sameWeekdayLastWeek, quality),
    ...compareRx(ctx, day, prevClinicDay, quality),
  }
}

function grainView(ctx: Context, series: BucketRef[], quality: Quality): GrainView {
  const current = series.at(-1) ?? null
  const lastComplete = lastWhere(series, (ref) => ref.state === 'complete')
  if (lastComplete === null) {
    return { current, lastComplete: null, previous: null, vsPrevious: ALL_UNAVAILABLE, rx: [], topRising: [], topFalling: [], groups: [] }
  }
  const previous = refAt(ctx, CALENDAR[ctx.grain].step(lastComplete.key, -1))
  return {
    current,
    lastComplete,
    previous,
    vsPrevious: totalsDelta(lastComplete, previous, quality),
    ...compareRx(ctx, lastComplete, previous, quality),
  }
}

export function buildSummary(input: {
  aggregates: Aggregates
  covered: DateRange[] // 파일마다 (머리의 기간 ?? 줄 날짜 최소~최대)
  quality: Quality
  today: string // todayInKorea()
}): Summary {
  const { aggregates, quality, today } = input
  const merged = mergeRanges(input.covered)
  const contextOf = (grain: Grain): Context => ({
    grain,
    byKey: new Map(aggregates[grain].map((bucket) => [bucket.key, bucket])),
    merged,
    today,
  })
  const day = contextOf('day')
  const week = contextOf('week')
  const month = contextOf('month')
  const series = { day: seriesOf(day), week: seriesOf(week), month: seriesOf(month) }
  return {
    quality,
    today,
    covered: merged,
    day: dayView(day, series.day, quality),
    week: grainView(week, series.week, quality),
    month: grainView(month, series.month, quality),
    series,
  }
}

// 처방 하나의 칸별 환자 수(추세선용). 그 갈래의 칸마다 하나, 그 처방이 없는 칸은 0
export function rxSeries(aggregates: Aggregates, grain: Grain, code: string): { key: string; patients: number; newPatients: number }[] {
  return aggregates[grain].map((bucket) => {
    const rx = bucket.rx.find((x) => x.code === code)
    return { key: bucket.key, patients: rx?.patients ?? 0, newPatients: rx?.newPatients ?? 0 }
  })
}
