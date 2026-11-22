// 후보 자세히 — 사는 사람·소득·앞으로 바뀔 것의 계산과 글자(spec location AC-7909.2·AC-7909.7, 순수 함수).
// 숫자 글자는 money.ts(commaText)·common/text.ts(asOfText)를 불러 쓴다. %는 정수로만 센다(× 100 또는 × 1,000 ÷ 값의 버림)
import { commaText } from '@/lib/location/money'
import type { Got, SnapshotValue } from '@/types/location'

// ── 그날 값 칸 ──

/** 보일 값: 받았으면 그 값, 못 받았으면 지난 값(prev), 그것도 없으면 null */
export function shownOf<T>(got: Got<T>): { v: T; asOf: string } | null {
  if (got.ok) return { v: got.v, asOf: got.asOf }
  return got.prev ?? null
}

// ── 소수 첫째 자리 ──

/** 0.1 단위 정수(52 = 5.2) → '5.2' · 끝 .0은 뺌('4') · 부호는 떼고 쉼표 */
export function tenthsText(tenths: number): string {
  const a = Math.abs(Math.trunc(tenths))
  const frac = a % 10
  const whole = commaText((a - frac) / 10)
  return frac === 0 ? whole : `${whole}.${frac}`
}

/** 늘어난 비율 글자: '+5.2%' · '−2.3%'(U+2212) · '+0%' */
export function changeText(tenths: number): string {
  return `${tenths < 0 ? '−' : '+'}${tenthsText(tenths)}%`
}

/** 비율 글자: '2.3%' · 비율이 없으면 '–' */
export function rateText(tenths: number | null): string {
  return tenths === null ? '–' : `${tenthsText(tenths)}%`
}

/** 막대 위 숫자: 1만 이상이면 0.1만 버림 '1.8만', 아니면 쉼표 '9,999' */
export function countShort(n: number): string {
  return n >= 10_000 ? `${tenthsText(Math.floor(n / 1000))}만` : commaText(n)
}

// ── 나이대 넷 ──

const BAND_COUNT = 11 // 10세 나이대 11칸(100세 이상 포함, score.ts AGE_BANDS 차례)
const AGE_GROUPS: readonly { label: string; from: number; to: number }[] = [
  { label: '0~19세', from: 0, to: 2 },
  { label: '20~39세', from: 2, to: 4 },
  { label: '40~59세', from: 4, to: 6 },
  { label: '60세 이상', from: 6, to: BAND_COUNT },
]

export type AgeGroup = { label: string; count: number; pct: number | null }

/** 사는 사람 대비 % 버림 정수. 사는 사람이 0이면 null */
export function floorPct(n: number, total: number): number | null {
  return total > 0 ? Math.floor((n * 100) / total) : null
}

/** 나이대 넷(0~19·20~39·40~59·60세 이상) 사람 수와 % — 11칸이 아니면 null. 60세 이상 비율은 마지막 칸 */
export function ageGroups(people: { total: number; bands: readonly number[] }): AgeGroup[] | null {
  if (people.bands.length !== BAND_COUNT) return null
  return AGE_GROUPS.map(({ label, from, to }) => {
    const count = people.bands.slice(from, to).reduce((s, n) => s + n, 0)
    return { label, count, pct: floorPct(count, people.total) }
  })
}

// ── 4년 추세 ──

export type TrendChange = { fromYm: string; toYm: string; years: number; tenths: number }

/** 처음 해 → 마지막 해 늘어난 비율(0.1% 단위, 0 쪽으로 버림). 해가 둘 미만이거나 처음 값이 0 이하면 null */
export function trendChange(rows: readonly { ym: string; total: number }[]): TrendChange | null {
  const sorted = [...rows].sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0))
  if (sorted.length < 2) return null
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!(first.total > 0)) return null
  return {
    fromYm: first.ym,
    toYm: last.ym,
    years: Number(last.ym.slice(0, 4)) - Number(first.ym.slice(0, 4)),
    tenths: Math.trunc(((last.total - first.total) * 1000) / first.total),
  }
}

// ── 홍보할 아파트 차례 ──

type Apt = SnapshotValue<'apts'>[number]
export type PromoRow = { apt: Apt; why: string }

const MANY_HOUSEHOLDS = 1500 // 이보다 많으면 '세대가 많아요'(시안 aptWhy)
const OLD_BUILT_YEAR = 2005 // 이 해까지 지었으면 '오래돼 어르신이 오래 살아요'(시안 aptWhy)
const NO_YEAR = 9999 // 지은 해 모름은 뒤로

/**
 * 홍보할 차례: 가까운 법정동(그날 값 목록에 처음 나온 차례 — 모으기가 후보 가운데 점부터 법정동을 찾아 그 차례로 넣는다)
 * → 세대가 많은 차례 → 오래된 차례. 단지에 좌표가 없어 거리 대신 법정동 차례로 가까움을 본다
 */
export function promoOrder(apts: readonly Apt[]): PromoRow[] {
  const near = new Map<string, number>()
  for (const a of apts) if (!near.has(a.bdongName)) near.set(a.bdongName, near.size)
  const rank = (a: Apt) => near.get(a.bdongName) ?? 0
  return apts
    .map((apt, i) => ({ apt, i }))
    .sort(
      (x, y) =>
        rank(x.apt) - rank(y.apt) ||
        y.apt.households - x.apt.households ||
        (x.apt.builtYear ?? NO_YEAR) - (y.apt.builtYear ?? NO_YEAR) ||
        x.i - y.i,
    )
    .map(({ apt }) => {
      const why = [
        rank(apt) === 0 ? '가까워요' : '',
        apt.households >= MANY_HOUSEHOLDS ? '세대가 많아요' : '',
        apt.builtYear !== null && apt.builtYear <= OLD_BUILT_YEAR ? '오래돼 어르신이 오래 살아요' : '',
      ]
        .filter(Boolean)
        .slice(0, 2)
        .join(' · ')
      return { apt, why: why || '범위 안 단지' }
    })
}

// ── 의료급여·차상위 ──

export type WelfareLine = { label: string; count: number; tenths: number | null }

/** 세 줄: 수와 그 시군구 주민등록 인구 대비 비율(0.1% 단위 버림, 인구가 없으면 null) */
export function welfareLines(v: SnapshotValue<'welfare'>): WelfareLine[] {
  const rate = (n: number) => (v.population !== null && v.population > 0 ? Math.floor((n * 1000) / v.population) : null)
  return [
    { label: '의료급여(기초) 수급권자', count: v.medical, tenths: rate(v.medical) },
    { label: '기초생활보장 수급권자 합계', count: v.basic, tenths: rate(v.basic) },
    { label: '차상위 3종 합계', count: v.nearPoor, tenths: rate(v.nearPoor) },
  ]
}
