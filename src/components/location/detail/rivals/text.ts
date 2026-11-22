// 경쟁 의원 묶음 넷(경쟁 의원 · 둘레 다른 과 의원 · 진료비 · 진료 시간 빈틈)의 셈·글 만들기 — 순수 함수(spec location AC-7909.3·AC-7921.5·AC-7921.6·AC-7922.2).
// 글은 requirements '화면 글 기본값'이 먼저, 거기 없는 글은 승인된 시안(docs/mockups/location ?s=candidate) 그대로.
// 대표 과목은 depts.ts deptOf/deptOfText, 거리는 coords.distText, 빈틈 표는 hours.gapTable, 30m·200곳·비급여 20곳은 collect.ts 값만 쓴다
import { NONPAY_MAX, RIVAL_MAX, SAME_BUILDING_M } from '@/lib/location/collect'
import { DEPTS, deptOf, deptOfText, deptRole } from '@/lib/location/depts'
import { GAP_DAYS, GAP_SLOTS } from '@/lib/location/hours'
import { vsAverage } from '@/lib/location/listings'
import type { DeptId, DeptRule, Got, Rival, RivalsGot, SnapshotValue } from '@/types/location'

export { NONPAY_MAX, RIVAL_MAX, SAME_BUILDING_M }

const DEPT_OF: ReadonlyMap<DeptId, (typeof DEPTS)[number]> = new Map(DEPTS.map((d) => [d.id, d]))
/** 과목 이름(표·거르기 단추) */
export const deptName = (id: DeptId) => DEPT_OF.get(id)?.name ?? id
/** 과목 짧은 이름(30m 안 첫 줄) */
export const deptShort = (id: DeptId) => DEPT_OF.get(id)?.short ?? id

/** 살필 범위 안(거리 ≤ 범위). 위험 신호(flags.ts many-rivals)와 같은 셈 */
export const inRange = <T extends { distM: number }>(rows: readonly T[], radiusM: number): T[] => rows.filter((r) => r.distM <= radiusM)

/** 보일 그날 값: 되면 그 값, 못 됐으면 옛 값(prev), 둘 다 없으면 null */
export function shownOf<T>(got: Got<T>): { v: T; asOf: string } | null {
  if (got.ok) return { v: got.v, asOf: got.asOf }
  return got.prev ?? null
}

// ── 대표 과목으로 나누기(design.md 18절) ──

/** 의원 하나와 대표 과목 · 설정에서의 자리(안 보기·대표 과목 없음은 빠진다) */
export type Placed = { r: Rival; dept: DeptId; role: 'rival' | 'around' }

/** 의원들 → 대표 과목이 경쟁·둘레로 보기인 것만, 가까운 차례(같은 거리는 받은 차례) */
export function placeAll(rows: readonly Rival[], rule: DeptRule): Placed[] {
  const out: Placed[] = []
  for (const r of [...rows].sort((a, b) => a.distM - b.distM)) {
    const dept = deptOf(r, rule)
    if (dept === null) continue
    const role = deptRole(dept, rule)
    if (role !== 'hide') out.push({ r, dept, role })
  }
  return out
}

/** 고른 경쟁 과목(목록 차례) */
export const rivalDepts = (rule: DeptRule): DeptId[] => DEPTS.filter((d) => rule.rival.includes(d.id)).map((d) => d.id)

/** 둘레 다른 과 의원으로 보는 과목(둘레로 보기, 한의원 뺌 — 한의원은 경쟁 묶음의 따로 한 줄) */
export const aroundDepts = (rule: DeptRule): DeptId[] => DEPTS.filter((d) => d.id !== 'korean' && deptRole(d.id, rule) === 'around').map((d) => d.id)

// ── 같은 건물·옆 건물(design.md 18절 — 화면에서만 견주고 카카오 주소는 저장하지 않는다) ──

/** 주소 → '도로명 + 건물 번호'(괄호·쉼표 뒤를 버리고, 시·도 이름 차이·층·호는 보지 않음). 도로명 주소가 아니면 null */
export function buildingKey(address: string): string | null {
  const front = address.split(/[(,]/)[0]!.trim()
  const words = front.split(/\s+/).filter((w) => w !== '')
  for (let i = 0; i < words.length - 1; i += 1) {
    if (!/(로|길)$/.test(words[i]!)) continue
    const under = words[i + 1] === '지하'
    const num = words[under ? i + 2 : i + 1]
    if (num !== undefined && /^\d+(-\d+)?$/.test(num)) return `${words[i]} ${under ? '지하 ' : ''}${num}`
  }
  return null
}

/** 30m 안 한 곳의 자리: 같은 건물 · 옆 건물 · 30m 안(후보 도로명을 못 받아 나누지 못함) */
export type Spot = 'same' | 'next' | 'near'

export const SPOT_TEXT: Readonly<Record<Spot, string>> = { same: '같은 건물', next: '옆 건물', near: '30m 안' }

/** 후보 도로명(카카오 k-point, 볼 때만) → 견주는 열쇠. 없거나 못 읽으면 null(같은 건물·옆 건물을 나누지 않음) */
export const roadKeyOf = (kakaoRoad: string | null | undefined): string | null => (kakaoRoad ? buildingKey(kakaoRoad) : null)

/** 30m 안 의원·약국의 주소를 후보 도로명과 견줌 */
export function spotOf(address: string | null | undefined, roadKey: string | null): Spot {
  if (roadKey === null) return 'near'
  return address && buildingKey(address) === roadKey ? 'same' : 'next'
}

/** 의원 목록이 잘렸을 수 있으면(design.md 6절): 보일 값(되면 그 값, 못 됐으면 지난 값)에 capped: true가 있거나(TASK-81) 받은 목록이 200곳 */
export const CAP_TEXT = `${RIVAL_MAX}곳 넘게 있을 수 있어요. 가까운 ${RIVAL_MAX}곳만 셌어요.`
export function isCapped(rivals: RivalsGot): boolean {
  const shown = rivals.ok ? rivals : rivals.prev
  return shown !== undefined && (shown.capped === true || shown.v.length >= RIVAL_MAX)
}

// ── 3년 개폐업(경쟁 과목만 + 이 자리 폐업은 과목과 상관없이) ──

export type HistoryRow = SnapshotValue<'history'>[number] & { here: boolean; rival: boolean }

/** 범위 안 개폐업 가운데 경쟁 과목(인허가 업태·과목 글로 대표 과목 — 업태 칸이 없는 옛 줄은 빈 글자) 또는 이 자리(30m 안) 폐업, 새 날짜부터 */
export function historyRows(list: SnapshotValue<'history'>, radiusM: number, rule: DeptRule): HistoryRow[] {
  return inRange(list, radiusM)
    .map((e) => {
      const dept = deptOfText({ name: e.name, subjects: e.dept, type: e.type ?? '' }, rule)
      return { ...e, here: e.kind === 'close' && e.distM <= SAME_BUILDING_M, rival: dept !== null && deptRole(dept, rule) === 'rival' }
    })
    .filter((e) => e.rival || e.here)
    .sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0))
}

// ── 진료비: 비급여는 모을 때 가까운 경쟁 의원 20곳만 부른다(collect.ts NONPAY_MAX) ──

/** priced = 값을 받음 · failed = 20곳 안인데 못 받음('지금 받지 못했어요') · skipped = 20곳 밖이라 부르지 않음 */
export type PriceState = 'priced' | 'failed' | 'skipped'
export type PriceRow = { r: Rival; state: PriceState }

/** 범위 안 지금 경쟁 의원 가운데 detail이 있는 곳과 그 값 상태. 20곳 차례는 모을 때 detail이 있던 의원 모두의 가까운 차례다 */
export function priceRows(all: readonly Rival[], radiusM: number, rule: DeptRule): PriceRow[] {
  const ranked = all
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.detail !== undefined)
    .sort((a, b) => a.r.distM - b.r.distM || a.i - b.i)
  const rank = new Map(ranked.map((x, k) => [x.r, k]))
  return placeAll(inRange(all, radiusM), rule)
    .filter((p) => p.role === 'rival' && p.r.detail !== undefined)
    .map(({ r }) => ({ r, state: r.detail!.priced ? 'priced' : (rank.get(r) ?? 0) < NONPAY_MAX ? 'failed' : 'skipped' }))
}

/** 값 받은 의원의 한 항목 값(원 0 이상 정수만) */
export const pricesOf = (rows: readonly PriceRow[], pick: (d: NonNullable<Rival['detail']>) => number | null): number[] =>
  rows
    .filter((x) => x.state === 'priced')
    .map((x) => pick(x.r.detail!))
    .filter((v): v is number => v !== null && Number.isSafeInteger(v) && v >= 0)

export const SKIPPED_TEXT = `가까운 경쟁 의원 ${NONPAY_MAX}곳만 값을 봤어요.`

// ── 진료 시간 글(시안 '평일 9~18:30 · 수 ~20시 · 토 9~13시') ──

type Span = readonly [number, number]
type Week = NonNullable<Rival['detail']>['week']

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
export function weekText(week: Week): string | null {
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

// ── 진료비 값 셈 ──

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
