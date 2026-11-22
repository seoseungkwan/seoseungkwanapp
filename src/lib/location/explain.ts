import type { Listing, ScoreFacts, SggAvg } from '@/types/location'
import { distText } from './coords'
import { compareListings, MIN_LISTINGS_TO_COMPARE } from './listings'
import { commaText, manText, wonText } from './money'
import { fillScoreRule, SCORE_GROUPS, scoreItems, type ScoreItemRule, type ScoreResult, type ScoreRule, type SubId } from './score'

// 점수 풀이(specs/location design.md 19절, AC-7920.3·AC-7920.4). 순수 함수 — 읽기·저장·시계 없음.
// 후보: 세부 항목마다 몫 = 항목 무게 ÷ (값 있는 항목 무게 합) × 세부 무게 ÷ (값 있고 무게 > 0인 세부 무게 합) × 100,
//   올린 점수 = 세부 점수 × 몫 ÷ 100 · 내린 점수 = (100 − 세부 점수) × 몫 ÷ 100. 세부 50점 이상은 올린 것, 아래는 내린 것에서 큰 차례 셋.
// 동네 훑기: 동마다 (그 동 세부 점수 − 값 있는 동의 평균 세부 점수) × 몫 ÷ 100이 가장 큰 것(0.5 이상)·가장 작은 것(−0.5 이하).
// 셈은 정수 분자·분모로 해서 버림·0.5 경계가 소수 어긋남에 흔들리지 않게 한다.
// 값 글·만점 기준 글·견줄 값 글은 requirements '화면 글 기본값' 점수 풀이 표 그대로(거리 distText, 원 wonText, 만 원 manText).
// 세부 항목 이름은 score.ts label, 항목 이름은 score.ts name 한 곳을 쓴다

const MINUS = '−' // U+2212(돈 글자 money.ts와 같음)
const TOP = 3
const SAME_PCT_TENTHS = 10 // 차이가 1% 아래면 '같아요'

/** 저장한 매물 평균(견줄 값 — 2개 미만이면 null). 평당 월세는 listings.ts 평균, 보증금·권리금은 금액 평균(버림) */
export type ListingAvg = { rentPerPy: number | null; deposit: number | null; premium: number | null }
/** 견줄 값: 후보 시군구 전체(그날 값 sggAvg) · 저장한 매물 평균 */
export type ExplainAvg = { sgg: SggAvg | null; listings: ListingAvg | null }

/** 점수 풀이 한 줄. points = 보이는 점수(버림 정수), pointsText = 칩 글(`+12점`·`−6점`·`1점 아래`) */
export type ExplainRow = {
  id: SubId
  label: string // 세부 항목 이름
  valueText: string // 값 글
  groupLabel: string // 항목 이름
  sub: number // 세부 점수 0~100
  fullText: string // 만점 기준 글
  compareText: string | null // 견줄 값 글(셀 수 있는 세부 항목만)
  points: number
  pointsText: string
}
/** up = 점수를 올린 것(종합 점수에 보탠 점수) · down = 점수를 내린 것(만점이었다면 더 받았을 점수), 셋까지 큰 차례 */
export type CandidateExplain = { up: ExplainRow[]; down: ExplainRow[] }

/** 동네 훑기 순위 한 동의 올린 것·내린 것 하나씩. text = `{이름} {값 글}` */
export type ScanPick = { id: SubId; label: string; valueText: string; text: string }
export type ScanExplain = { up: ScanPick | null; down: ScanPick | null }

// ── 숫자 글 ──────────────────────────────────────────────

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const signOf = (n: number) => (n < 0 ? MINUS : '')
/** 정수 글: 0 쪽으로 버리고 쉼표, 음수는 − */
const intText = (n: number) => `${signOf(n)}${commaText(Math.floor(Math.abs(n)))}`
/** 0.1 단위 정수 → `5.2`·`5`·`−0.3` */
function tenthsText(tenths: number): string {
  const abs = Math.abs(tenths)
  const frac = abs % 10
  return `${signOf(tenths)}${commaText(Math.floor(abs / 10))}${frac === 0 ? '' : `.${frac}`}`
}
/** 소수 값 → 0.1 단위 정수(0 쪽으로 버림). 이미 0.1 단위인 값(welfareRate·trendPct)이 곱셈 어긋남으로 한 칸 덜 되지 않게 아주 작은 값을 더한다 */
const tenthsOf = (v: number) => Math.sign(v) * Math.floor(Math.abs(v) * 10 + 1e-9)
/** `+5.2%`·`−5%` */
const signedPct = (tenths: number) => `${tenths < 0 ? MINUS : '+'}${tenthsText(Math.abs(tenths))}%`

/** 단위 뒤 '면'·'이면'(받침 있으면 이면) */
function myeon(text: string): string {
  const code = text.charCodeAt(text.length - 1) - 0xac00
  return code >= 0 && code < 11172 && code % 28 !== 0 ? '이면' : '면'
}

// ── 점수가 0에서 멈추는 값의 본래 값(후보 값이 있을 때만) ─────────────

/** 가장 이른 10월 → 가장 늦은 10월 인구 변화(0.1% 단위 정수, 0 쪽으로 버림). 셀 수 없으면 null */
function trendTenths(f: ScoreFacts | undefined): number | null {
  const rows = (f?.trend ?? []).filter((r) => typeof r.ym === 'string' && num(r.total) !== null)
  if (rows.length < 2) return null
  const sorted = [...rows].sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0))
  const base = sorted[0]!.total
  if (base <= 0) return null
  return Math.trunc(((sorted[sorted.length - 1]!.total - base) * 1000) / base) + 0
}

/** (경쟁 평균 체외충격파 값 − 지금 의원 값) ÷ 지금 의원 값(0.1% 단위 정수). 셀 수 없으면 null */
function priceTenths(f: ScoreFacts | undefined): number | null {
  const rival = num(f?.rivalEswt)
  const home = num(f?.homeEswt)
  if (rival === null || home === null || home <= 0) return null
  return Math.trunc(((rival - home) * 1000) / home) + 0
}

// ── 세부 항목 글 한 곳(requirements '화면 글 기본값' 점수 풀이 표) ─────────

type SubText = {
  unit: string
  /** 많을수록 좋음 기준 글 앞말(`1km²에`) */
  pre?: string
  /** 많을수록 좋음 기준 글의 단위 + 면(`% 늘면`). 없으면 단위 + 면·이면 */
  more?: string
  /** 고른 값의 좋은 쪽 */
  pick?: string
  /** 돈: 원(wonText) · 만 원 칸에서 온 원(manText) */
  money?: 'won' | 'man'
  value: (v: number, f: ScoreFacts | undefined) => string
}

const count = (unit: string) => (v: number) => `${intText(v)}${unit}`

const SUB_TEXT: Readonly<Record<string, SubText>> = {
  'p-density': { unit: '명', pre: '1km²에', value: (v) => `1km²에 ${intText(v)}명` },
  'p-senior': { unit: '%', value: count('%') },
  'p-households': { unit: '세대', value: count('세대') },
  'p-apts': { unit: '세대', value: count('세대') },
  'p-trend': { unit: '%', pre: '4년 사이', more: '% 늘면', value: (v, f) => `4년 사이 ${signedPct(trendTenths(f) ?? tenthsOf(v))}` },
  'p-accidents': { unit: '곳', value: count('곳') },
  'p-industry': { unit: '명', value: count('명') },
  'p-schools': { unit: '곳', value: count('곳') },
  'p-facilities': { unit: '곳', value: count('곳') },
  'p-welfare': { unit: '%', value: (v) => `${tenthsText(tenthsOf(v))}%` },
  'c-count': { unit: '곳', value: count('곳') },
  'c-perRival': { unit: '명', value: count('명') },
  'c-newOpen': { unit: '곳', value: count('곳') },
  'c-gaps': { unit: '칸', value: count('칸') },
  'c-price': {
    unit: '%',
    pre: '둘레 평균이',
    more: '% 비싸면',
    value: (v, f) => {
      const t = priceTenths(f) ?? tenthsOf(v)
      if (Math.abs(t) < SAME_PCT_TENTHS) return '둘레 평균과 지금 의원 값이 같아요'
      return `둘레 평균이 ${tenthsText(Math.abs(t))}% ${t > 0 ? '비싸요' : '싸요'}`
    },
  },
  't-station': { unit: 'm', value: (v) => distText(v) },
  't-stops': { unit: '곳', value: count('곳') },
  't-flow': { unit: '명', value: (v) => `하루 ${intText(v)}명` },
  's-floor': { unit: '층', value: (v) => (v < 0 ? `지하 ${intText(-v)}층` : `${intText(v)}층`) },
  's-elevator': { unit: '대', value: count('대') },
  's-parking': { unit: '대', value: count('대') },
  's-age': { unit: '년', value: count('년') },
  's-neighbors': { unit: '곳', value: count('곳') },
  's-sign': { unit: '', pick: '보여요', value: (v) => (v === 1 ? '보여요' : '가려요') },
  's-violation': { unit: '', pick: '없음', value: (v) => (v === 1 ? '없음' : '있음') },
  's-clinics': { unit: '곳', value: count('곳') },
  'k-rentPy': { unit: '원', money: 'won', value: (v) => `평당 ${wonText(Math.floor(v))}` },
  'k-deposit': { unit: '', money: 'man', value: (v) => manText(Math.floor(v)) },
  'k-premium': { unit: '', money: 'man', value: (v) => manText(Math.floor(v)) },
  'k-vsAvg': {
    unit: '%',
    value: (v) => (Math.abs(v) < 1 ? '저장한 매물 평균과 같아요' : `저장한 매물 평균보다 ${commaText(Math.abs(Math.trunc(v)))}% ${v > 0 ? '비싸요' : '싸요'}`),
  },
}

type SubInfo = { label: string; unit: string; groupLabel: string }
const SUBS: ReadonlyMap<string, SubInfo> = new Map(
  SCORE_GROUPS.flatMap((g) => g.subs.map((s) => [s.id as string, { label: s.label, unit: s.unit, groupLabel: g.name }] as const)),
)

const textOf = (id: string): SubText => SUB_TEXT[id] ?? { unit: SUBS.get(id)?.unit ?? '', value: count(SUBS.get(id)?.unit ?? '') }

/** 값 글. facts(후보·동 값)를 주면 점수가 0에서 멈추는 인구 추세·진료비 차이도 준 쪽을 쓴다 */
export function subValueText(id: string, value: number, facts?: ScoreFacts): string {
  return textOf(id).value(value, facts)
}

function amountText(n: number, t: SubText): string {
  if (t.money === 'man') return manText(n)
  if (t.money === 'won') return wonText(n)
  return `${intText(n)}${t.unit}`
}

/** 만점 기준 글: 많을수록 `{앞 글} {기준}{단위}면 100점` · 적을수록 `{좋은 값} 이하면 100점 · {나쁜 값} 이상이면 0점`
 * (좋은 값이 0이면 `0곳이면`·만 원은 `없으면`) · 고른 값 `'{좋은 쪽}'이면 100점`. 음수는 − */
export function subFullText(id: string, item: ScoreItemRule): string {
  const t = textOf(id)
  if (t.pick) return `'${t.pick}'이면 100점`
  if ('full' in item) {
    const head = t.more ? `${intText(item.full)}${t.more}` : `${amountText(item.full, t)}${myeon(amountText(item.full, t))}`
    return `${t.pre ? `${t.pre} ` : ''}${head} 100점`
  }
  const zero = amountText(0, t)
  const best = item.best === 0 ? (t.money === 'man' ? '없으면' : `${zero}${myeon(zero)}`) : `${amountText(item.best, t)} 이하면`
  return `${best} 100점 · ${amountText(item.worst, t)} 이상이면 0점`
}

// ── 견줄 값(design.md 19절) ───────────────────────────────

type CompareCtx = { facts: ScoreFacts; bands: readonly number[]; sgg: SggAvg | null; listings: ListingAvg | null }

const SENIOR_BANDS = [6, 7, 8, 9, 10] // 60세 이상
const bandSum = (bands: readonly number[], idx: readonly number[]) => idx.reduce((a, i) => a + (num(bands[i]) ?? 0), 0)
function sumPresent(...vs: (number | null | undefined)[]): number | null {
  const got = vs.map(num).filter((v): v is number => v !== null)
  return got.length === 0 ? null : got.reduce((a, b) => a + b, 0)
}

/** 시군구 목록 수 ÷ 시군구 넓이 × 범위 넓이(버림) */
function perArea(ctx: CompareCtx, n: number | null | undefined): string | null {
  const g = ctx.sgg
  const area = num(ctx.facts.areaM2)
  const value = num(n)
  if (!g || value === null || area === null || area <= 0 || !(g.areaM2 > 0)) return null
  return `${g.sggName} 평균 밀도면 ${intText((value * area) / g.areaM2)}곳`
}

function listingText(v: number | null | undefined, text: (n: number) => string): string | null {
  const n = num(v)
  return n === null ? null : `저장한 매물 평균 ${text(Math.floor(n))}`
}

const COMPARE: Readonly<Record<string, (ctx: CompareCtx) => string | null>> = {
  'p-density': ({ sgg, bands }) =>
    sgg && sgg.areaM2 > 0 ? `${sgg.sggName} 전체 1km²에 ${intText((bandSum(sgg.bands, bands) * 1_000_000) / sgg.areaM2)}명` : null,
  'p-senior': ({ sgg }) => (sgg && sgg.total > 0 ? `${sgg.sggName} 전체 ${intText((bandSum(sgg.bands, SENIOR_BANDS) * 100) / sgg.total)}%` : null),
  'p-trend': ({ sgg }) => (sgg && num(sgg.trendPct) !== null ? `${sgg.sggName} 전체 4년 사이 ${signedPct(tenthsOf(sgg.trendPct!))}` : null),
  'p-accidents': (ctx) => perArea(ctx, ctx.sgg?.accidents),
  'p-schools': (ctx) => perArea(ctx, ctx.sgg?.schools),
  'p-facilities': (ctx) => perArea(ctx, sumPresent(ctx.sgg?.seniors, ctx.sgg?.gyms)),
  't-station': ({ sgg }) => (sgg && num(sgg.stationM) !== null ? `${sgg.sggName} 행정동 가운데 평균 ${distText(sgg.stationM!)}` : null),
  't-stops': ({ sgg }) => (sgg && num(sgg.stops) !== null ? `${sgg.sggName} 행정동 가운데 평균 ${intText(sgg.stops!)}곳` : null),
  'k-rentPy': ({ listings }) => listingText(listings?.rentPerPy, (n) => `평당 ${wonText(n)}`),
  'k-deposit': ({ listings }) => listingText(listings?.deposit, manText),
  'k-premium': ({ listings }) => listingText(listings?.premium, manText),
}

/** 견줄 값 글 — 셀 수 있는 세부 항목만, 나머지·자료 없음은 null. 고른 나이대는 설정(rule.bands)을 따른다 */
export function subCompareText(id: string, facts: ScoreFacts, rule: ScoreRule, avg: ExplainAvg): string | null {
  const fn = COMPARE[id]
  if (!fn) return null
  return fn({ facts, bands: fillScoreRule(rule).bands, sgg: avg.sgg, listings: avg.listings })
}

/** 저장한 매물 평균(견줄 값). 그 값이 있는 매물이 2개 미만이면 그 칸은 null */
export function listingAverages(listings: readonly Listing[]): ListingAvg {
  const mean = (vs: readonly (number | null)[]): number | null => {
    const got = vs.filter((v): v is number => num(v) !== null)
    return got.length < MIN_LISTINGS_TO_COMPARE ? null : Math.floor(got.reduce((a, b) => a + b, 0) / got.length)
  }
  return {
    rentPerPy: compareListings(listings).rentAvg,
    deposit: mean(listings.map((l) => l.deposit)),
    premium: mean(listings.map((l) => l.premium)),
  }
}

// ── 몫 ───────────────────────────────────────────────────

/** 값 있고 무게 > 0인 세부 항목 하나. 몫 × 100 = shareNum ÷ shareDen(= 항목 무게 × 세부 무게 ÷ (항목 무게 합 × 세부 무게 합)) */
type Part = { id: SubId; value: number; score: number; shareNum: number; shareDen: number }

function partsOf(result: ScoreResult, r: ScoreRule): Part[] {
  const groupSum = result.groups.reduce((a, g) => (g.score === null ? a : a + r.weights[g.id]), 0)
  if (groupSum <= 0) return []
  return result.groups.flatMap((g) => {
    const wg = r.weights[g.id]
    if (g.score === null || wg <= 0) return []
    const subs = g.subs.flatMap((s) =>
      s.score !== null && s.value !== null && r.items[s.id].w > 0 ? [{ id: s.id, value: s.value, score: s.score, w: r.items[s.id].w }] : [],
    )
    const subSum = subs.reduce((a, s) => a + s.w, 0)
    if (subSum <= 0) return []
    return subs.map((s) => ({ id: s.id, value: s.value, score: s.score, shareNum: wg * s.w, shareDen: groupSum * subSum }))
  })
}

/** 후보 점수 풀이. facts = facts.ts scoreFactsOf 결과, rule = 점수 설정, avg = 견줄 값 */
export function explainCandidate(facts: ScoreFacts, rule: ScoreRule, avg: ExplainAvg): CandidateExplain {
  const r = fillScoreRule(rule)
  const parts = partsOf(scoreItems(facts, r, 'candidate'), r).map((p) => {
    const up = p.score >= 50
    const raw = ((up ? p.score : 100 - p.score) * p.shareNum) / p.shareDen
    return { p, up, raw }
  })
  const rowOf = ({ p, up, raw }: (typeof parts)[number]): ExplainRow => {
    const info = SUBS.get(p.id)
    const points = Math.floor(raw)
    return {
      id: p.id,
      label: info?.label ?? p.id,
      valueText: subValueText(p.id, p.value, facts),
      groupLabel: info?.groupLabel ?? '',
      sub: p.score,
      fullText: subFullText(p.id, r.items[p.id]),
      compareText: subCompareText(p.id, facts, r, avg),
      points,
      pointsText: raw < 1 ? '1점 아래' : `${up ? '+' : MINUS}${points}점`,
    }
  }
  const top = (side: boolean) =>
    parts
      .filter((x) => x.up === side)
      .sort((a, b) => b.raw - a.raw)
      .slice(0, TOP)
      .map(rowOf)
  return { up: top(true), down: top(false) }
}

/** 동네 훑기 순위 풀이. dongs = 동마다 scoreItems(그 동 값, 설정, 'scan') 결과, facts = (있으면) 같은 차례의 동 값 — 값 글에만 쓴다 */
export function explainScan(dongs: readonly ScoreResult[], rule: ScoreRule, facts?: readonly (ScoreFacts | null | undefined)[]): ScanExplain[] {
  const r = fillScoreRule(rule)
  // 세부 항목마다 값 있는 동의 세부 점수 합·수
  const stats = new Map<SubId, { sum: number; n: number }>()
  for (const d of dongs)
    for (const g of d.groups)
      for (const s of g.subs) {
        if (s.score === null) continue
        const st = stats.get(s.id) ?? { sum: 0, n: 0 }
        stats.set(s.id, { sum: st.sum + s.score, n: st.n + 1 })
      }
  return dongs.map((d, i) => {
    const diffs = partsOf(d, r).map((p) => {
      const { sum, n } = stats.get(p.id)!
      // 차이 = (세부 점수 − 평균) × 몫 ÷ 100 = num ÷ den
      return { p, num: (p.score * n - sum) * p.shareNum, den: n * p.shareDen }
    })
    let up: (typeof diffs)[number] | null = null
    let down: (typeof diffs)[number] | null = null
    for (const x of diffs) {
      if (2 * x.num >= x.den && (up === null || x.num / x.den > up.num / up.den)) up = x
      if (2 * x.num <= -x.den && (down === null || x.num / x.den < down.num / down.den)) down = x
    }
    const pickOf = (x: (typeof diffs)[number] | null): ScanPick | null => {
      if (x === null) return null
      const label = SUBS.get(x.p.id)?.label ?? x.p.id
      const valueText = subValueText(x.p.id, x.p.value, facts?.[i] ?? undefined)
      return { id: x.p.id, label, valueText, text: `${label} ${valueText}` }
    }
    return { up: pickOf(up), down: pickOf(down) }
  })
}
