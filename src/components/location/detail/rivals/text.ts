// 경쟁 의원 묶음 셋(경쟁 의원 · 진료비 · 진료 시간 빈틈)의 글 만들기 — 순수 함수(spec location AC-7909.3).
// 글은 requirements '화면 글 기본값'이 먼저, 거기 없는 글은 승인된 시안(docs/mockups/location ?s=candidate) 그대로.
// 거리는 coords.distText, 돈은 money.wonText, 빈틈 표는 hours.gapTable만 쓴다(design.md 11절 '타입 한 곳')
import { GAP_DAYS, GAP_SLOTS } from '@/lib/location/hours'
import { vsAverage } from '@/lib/location/listings'
import type { Got, Rival, RivalKind } from '@/types/location'

export const KIND_LABEL: Readonly<Record<RivalKind, string>> = {
  ortho: '정형외과',
  pain: '마취통증의학과',
  rehab: '재활의학과',
  korean: '한의원',
}
/** 과목 거르기 단추 차례(시안): 경쟁 의원 셋 다음 한의원 */
export const KIND_ORDER: readonly RivalKind[] = ['ortho', 'pain', 'rehab', 'korean']

/** 경쟁 의원 = 정형외과·마취통증의학과·재활의학과. 한의원은 수·빈틈·진료비에서 뺀다(시안 승인 '한의원 따로') */
export const isRival = (r: Pick<Rival, 'kind'>) => r.kind !== 'korean'

/** 살필 범위 안(거리 ≤ 범위). 위험 신호(flags.ts many-rivals)와 같은 셈 */
export const inRange = <T extends { distM: number }>(rows: readonly T[], radiusM: number): T[] => rows.filter((r) => r.distM <= radiusM)

/** 보일 그날 값: 되면 그 값, 못 됐으면 옛 값(prev), 둘 다 없으면 null */
export function shownOf<T>(got: Got<T>): { v: T; asOf: string } | null {
  if (got.ok) return { v: got.v, asOf: got.asOf }
  return got.prev ?? null
}

// ── 진료 시간 글(시안 '평일 9~18:30 · 수 ~20시 · 토 9~13시') ──

type Span = readonly [number, number]

/** 분 → `9` · `18:30` */
function clockText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, '0')}`
}
/** 닫는 시각: 정각이면 끝에 `시`(시안 `9~18시`·`9~18:30`) */
const endText = (min: number) => `${clockText(min)}${min % 60 === 0 ? '시' : ''}`
const spanText = (s: Span) => `${clockText(s[0])}~${endText(s[1])}`
const spanKey = (s: Span | null) => (s ? `${s[0]}-${s[1]}` : '')

/** 요일 7칸(월~일, 공휴일 칸은 안 봄) → 진료 시간 한 줄. 자료가 없으면(week null) null, 모든 날 닫으면 `–` */
export function weekText(week: Rival['week']): string | null {
  if (!week) return null
  const days = GAP_DAYS.map((_, d) => week[d] ?? null)
  // 평일 기준 시간: 문 연 평일에서 가장 많은 시간(같으면 앞 요일)
  const tally = new Map<string, number>()
  for (const s of days.slice(0, 5)) if (s) tally.set(spanKey(s), (tally.get(spanKey(s)) ?? 0) + 1)
  let base: Span | null = null
  for (const s of days.slice(0, 5)) if (s && (base === null || tally.get(spanKey(s))! > tally.get(spanKey(base))!)) base = s
  const parts: string[] = []
  if (base) {
    parts.push(`평일 ${spanText(base)}`)
    const others = new Map<string, string[]>() // 글 → 요일들
    days.slice(0, 5).forEach((s, d) => {
      if (spanKey(s) === spanKey(base)) return
      const t = s === null ? '휴진' : s[0] === base[0] ? `~${endText(s[1])}` : spanText(s)
      others.set(t, [...(others.get(t) ?? []), GAP_DAYS[d]!])
    })
    for (const [t, ds] of others) parts.push(`${ds.join('·')} ${t}`)
  }
  const [sat, sun] = [days[5], days[6]]
  if (sat && sun && spanKey(sat) === spanKey(sun)) parts.push(`토·일 ${spanText(sat)}`)
  else {
    if (sat) parts.push(`토 ${spanText(sat)}`)
    if (sun) parts.push(`일 ${spanText(sun)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '–'
}

// ── 빈틈 한 줄(시안 gapText) ──

const slotIndex = (id: string) => GAP_SLOTS.findIndex((s) => s.id === id)
const WEEKDAYS = [0, 1, 2, 3, 4]
const SAT = 5
const SUN = 6

/** counts[칸][요일](hours.gapTable) → 빈 시간 글들. 평일 아침·점심·저녁 19~20·밤은 요일로, 토요일 오후·일요일(오전)은 따로 */
export function gapSummary(counts: readonly (readonly number[])[]): string[] {
  const parts: string[] = []
  for (const id of ['early', 'lunch', 'late', 'night']) {
    const si = slotIndex(id)
    const zero = WEEKDAYS.filter((d) => counts[si]?.[d] === 0)
    const label = GAP_SLOTS[si]!.label
    if (zero.length === WEEKDAYS.length) parts.push(`평일 ${label}`)
    else if (zero.length > 0) parts.push(`${zero.map((d) => GAP_DAYS[d]).join('·')}요일 ${label}`)
  }
  if (counts[slotIndex('afternoon')]?.[SAT] === 0) parts.push('토요일 오후')
  if (counts[slotIndex('morning')]?.[SUN] === 0) parts.push('일요일')
  return parts
}

// ── 진료비(체외충격파) ──

export type PriceStats = { count: number; lo: number; avg: number; hi: number }

/** 올린 값들(원 정수) → 가장 싼 곳·평균(버림)·가장 비싼 곳. 값이 없으면 null */
export function priceStats(values: readonly number[]): PriceStats | null {
  if (values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return { count: values.length, lo: Math.min(...values), avg: Math.floor(sum / values.length), hi: Math.max(...values) }
}

/** 지금 의원 값 vs 평균 → `평균과 같아요` · `평균보다 {n}% 비싸요/싸요`(차이 % 버림, listings.vsAverage와 같은 셈) */
export function homeVsAvgText(home: number, avg: number): string {
  const pct = vsAverage(home, avg)?.pct ?? 0
  if (pct === 0) return '평균과 같아요'
  return `평균보다 ${Math.abs(pct)}% ${pct > 0 ? '비싸요' : '싸요'}`
}

/** 값 띠 눈금: 값을 담는 범위(만 원 단위로 넓힘)와 6개 이하 눈금 */
export function priceScale(values: readonly number[]): { from: number; to: number; ticks: number[] } {
  const TEN = 10_000
  const from = Math.max(0, Math.floor(Math.min(...values) / TEN) * TEN - TEN)
  const to = Math.ceil(Math.max(...values) / TEN) * TEN + TEN
  const step = [TEN, 50_000, 100_000, 500_000, 1_000_000].find((s) => (to - from) / s <= 6) ?? 5_000_000
  const ticks: number[] = []
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) ticks.push(t)
  return { from, to, ticks }
}
