// 입지 분석 점수(specs/location design.md 8절 · REQ-7911·REQ-7919). 순수 함수 — 바깥 부르기·저장·시계·console 없음
//
// 세부 항목은 아래 GROUPS 한 곳에만 적는다. 새 세부 항목(예: 의료급여·차상위 비율)을 더하려면
//   1) ScoreFacts(types/location.ts)에 값 칸 하나  2) GROUPS의 그 항목 subs에 줄 하나(id·값 설명·방향·처음 기준·무게·까닭·훑기·read)
// 만 고치면 처음 설정(DEFAULT_SCORE_RULE)·칸 검사(checkScoreRule)·채우기(fillScoreRule)·매기기(scoreItems)가 모두 따라온다.
// 예전에 저장한 설정에 새 세부 항목이 없으면 fillScoreRule이 처음 값으로 채운다
//
// 식(버림 = Math.floor, 모두 0 이상이라 내림과 같다)
//   많을수록 좋음: 버림(min(100, max(0, 값) × 100 ÷ full))
//   적을수록 좋음: 값 ≤ best → 100, 값 ≥ worst → 0, 사이 → 버림((worst − 값) × 100 ÷ (worst − best))
//   항목 점수 = Σ 버림(세부 점수 × 세부 무게 ÷ 값 있는 세부 무게 합) · 종합 = Σ 버림(항목 점수 × 무게 ÷ 값 있는 항목 무게 합)
//   값이 없는 세부 항목·항목은 빼고 남은 무게로 다시 나눈다. 다 없거나 무게 합이 0이면 null('값 없음'·'점수 없음')

import type { ScoreFacts, YesNo } from '@/types/location'

// 점수에 쓰는 값(ScoreFacts)과 고르는 값(YesNo)은 types/location.ts 한 곳에 둔다(예전 import 길을 위해 여기서도 내보낸다)
export type { ScoreFacts, YesNo }

type Reader = (f: ScoreFacts, bands: readonly number[]) => number | null
type SubBase = {
  id: string
  /** 값 — '근거와 출처'·무게 판이 그대로 그린다 */
  label: string
  unit: string
  /** 처음 무게 */
  w: number
  /** 까닭 */
  why: string
  /** 동네 훑기(동 단위)에서도 쓰나. false면 화면에 '후보에서만' */
  scan: boolean
  read: Reader
  /** 이 값이면 기준과 상관없이 0점(지하층) */
  zero?: (v: number) => boolean
  /** 방향을 고를 수 있는 세부 항목만(p-welfare): 적을수록 좋음으로 바꿀 때의 처음 기준. 설정은 {w, full}·{w, best, worst} 둘 다 받는다 */
  flip?: { best: number; worst: number }
}
type SubDefRaw = SubBase & ({ dir: 'more'; full: number } | { dir: 'less'; best: number; worst: number })
type GroupDefRaw = { id: string; name: string; w: number; scan: boolean; note: string; subs: readonly SubDefRaw[] }

const SENIOR_BAND = 6 // 60세 이상 = 6~10칸
const BAND_COUNT = 11

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** 있는 것만 더한다(Claude 판단: 한쪽 자료만 못 받아도 세부 항목을 통째로 빼지 않음). 다 없으면 null */
function sumPresent(...vs: unknown[]): number | null {
  const got = vs.map(num).filter((v): v is number => v !== null)
  return got.length === 0 ? null : got.reduce((a, b) => a + b, 0)
}
const picked = (bands: readonly number[], idx: readonly number[]) => idx.reduce((a, i) => a + (num(bands[i]) ?? 0), 0)
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

function peopleOf(f: ScoreFacts): { total: number | null; bands: readonly number[] } | null {
  const p = f.people
  if (!p || !Array.isArray(p.bands)) return null
  return { total: num(p.total), bands: p.bands }
}

function density(f: ScoreFacts, bands: readonly number[]): number | null {
  const p = peopleOf(f)
  const area = num(f.areaM2)
  if (!p || area === null || area <= 0) return null
  return (picked(p.bands, bands) * 1_000_000) / area
}

function seniorShare(f: ScoreFacts): number | null {
  const p = peopleOf(f)
  if (!p || p.total === null || p.total <= 0) return null
  return (picked(p.bands, range(SENIOR_BAND, BAND_COUNT - 1)) * 100) / p.total
}

/** 가장 이른 10월 대비 최근 10월 %(줄면 0). 두 해가 없으면 null */
function trendRate(f: ScoreFacts): number | null {
  const rows = (f.trend ?? []).filter((r) => typeof r.ym === 'string' && num(r.total) !== null)
  if (rows.length < 2) return null
  const sorted = [...rows].sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0))
  const base = sorted[0].total
  if (base <= 0) return null
  return Math.max(0, ((sorted[sorted.length - 1].total - base) * 100) / base)
}

function perRival(f: ScoreFacts): number | null {
  const total = peopleOf(f)?.total ?? null
  const n = num(f.rivals)
  if (total === null || n === null || n < 0) return null
  return total / (n + 1)
}

function priceGap(f: ScoreFacts): number | null {
  const rival = num(f.rivalEswt)
  const home = num(f.homeEswt)
  if (rival === null || home === null || home <= 0) return null
  return Math.max(0, ((rival - home) * 100) / home)
}

/** 층 글의 숫자. 지하('지'로 시작, '지상'은 빼고 · 'B1'도)는 음수(숫자가 없으면 −1), 숫자가 없으면 null.
 * 점수(s-floor)와 위험 신호(flags.ts barrier)가 같이 쓴다 */
export function floorNumber(label: string | null | undefined): number | null {
  if (typeof label !== 'string') return null
  const text = label.trim()
  const digits = /\d+/.exec(text)
  const n = digits ? Number(digits[0]) : null
  const basement = (text.startsWith('지') && !text.startsWith('지상')) || /^b\s*\d/i.test(text)
  if (basement) return -(n ?? 1)
  return n
}

function vsAverage(f: ScoreFacts): number | null {
  const mine = num(f.rentPerPy)
  const all = (f.savedRentsPerPy ?? []).map(num).filter((v): v is number => v !== null)
  if (mine === null || all.length < 2) return null
  const avg = Math.floor(all.reduce((a, b) => a + b, 0) / all.length)
  if (avg <= 0) return null
  return ((mine - avg) * 100) / avg
}

const pick = (v: YesNo | null | undefined, good: 'yes' | 'no'): number | null => (v === good ? 1 : v === 'yes' || v === 'no' ? 0 : null)

// ── 세부 항목 목록(한 곳) — design.md 8절 표 그대로. 처음 기준·무게·까닭은 Claude 판단(사용자가 화면에서 고친다) ──
const GROUPS = [
  {
    id: 'people',
    name: '사는 사람·수요',
    w: 30,
    scan: true,
    note: '나이대: 10세 11칸에서 고름, 처음 40세 이상(정형외과 환자는 40대부터 크게 는다)',
    subs: [
      { id: 'p-density', label: '고른 나이대 인구 ÷ 범위 km²', unit: '명/km²', dir: 'more', full: 10000, w: 40, why: '진료권은 사는 인구가 가장 잘 맞는다(진료권 연구)', scan: true, read: density },
      { id: 'p-senior', label: '60세 이상 ÷ 전체 × 100(%)', unit: '%', dir: 'more', full: 25, w: 15, why: '무릎·허리 등 오래 다니는 환자가 많은 나이(사용자 예시 값)', scan: true, read: seniorShare },
      { id: 'p-households', label: '범위 안 세대 수', unit: '세대', dir: 'more', full: 20000, w: 5, why: '인구 밀도와 많이 겹쳐 낮게. 1km에 2만 세대 = 큰 도시 주거지', scan: true, read: (f) => num(f.people?.households) },
      { id: 'p-apts', label: '범위 안 아파트 세대 + 입주 예정 세대', unit: '세대', dir: 'more', full: 10000, w: 10, why: '홍보가 닿기 쉽고 입주 예정은 앞으로의 수요. 1,000세대 단지 열 곳쯤', scan: false, read: (f) => sumPresent(f.apartments, f.presale) },
      { id: 'p-trend', label: '(최근 10월 − 2022-10) ÷ 2022-10 × 100(%), 줄면 0', unit: '%', dir: 'more', full: 5, w: 10, why: '4년에 5% 넘게 느는 곳은 새 아파트가 드는 곳', scan: true, read: trendRate },
      { id: 'p-accidents', label: '범위 안 교통사고 다발 지점 수', unit: '곳', dir: 'more', full: 3, w: 5, why: '자동차보험 환자. 다발 지점은 시군구에 몇 곳뿐이라 1km 안 3곳이면 많다', scan: true, read: (f) => num(f.accidentSpots) },
      { id: 'p-industry', label: '후보 시군구의 산업단지 고용 인원 합(단지 위치가 없어 시군구 단위)', unit: '명', dir: 'more', full: 20000, w: 5, why: '일하다 다치는 환자. 시군구 단위라 거칠어 낮게', scan: true, read: (f) => num(f.industryEmployees) },
      { id: 'p-schools', label: '범위 안 초·중·고 수', unit: '곳', dir: 'more', full: 5, w: 5, why: '학생 운동 손상·학부모', scan: true, read: (f) => num(f.schools) },
      { id: 'p-facilities', label: '범위 안 경로당 + 체력단련장', unit: '곳', dir: 'more', full: 30, w: 5, why: '노년·운동하는 사람 신호. 경로당은 단지마다 있어 흔하다', scan: true, read: (f) => sumPresent(f.seniorCenters, f.gyms) },
      { id: 'p-welfare', label: '후보 시군구 (기초 의료급여 + 차상위 3종) ÷ 주민등록 인구 × 100(%)', unit: '%', dir: 'more', full: 5, w: 0, why: '의료급여·차상위가 많으면 근골격 진료 수요가 많을 수도, 비급여를 덜 쓸 수도 있어 방향과 무게는 사용자가 정한다. 전국 어림 3.5%쯤', scan: false, read: (f) => num(f.welfareRate), flip: { best: 1, worst: 5 } },
    ],
  },
  {
    id: 'rivals',
    name: '경쟁',
    w: 25,
    scan: true,
    note: 'n = 범위 안 정형외과·마취통증의학과·재활의학과(한의원 뺌)',
    subs: [
      { id: 'c-count', label: '범위 안 경쟁 의원 수(n)', unit: '곳', dir: 'less', best: 0, worst: 6, w: 30, why: "시안 위험 신호 '경쟁 5곳 이상'보다 조금 넉넉하게", scan: true, read: (f) => num(f.rivals) },
      { id: 'c-perRival', label: '범위 인구 ÷ (n + 1)', unit: '명', dir: 'more', full: 20000, w: 35, why: '의원 하나가 버티는 인구 어림(앞 판 그대로)', scan: true, read: perRival },
      { id: 'c-newOpen', label: '개설일이 3년 안인 경쟁 의원 수', unit: '곳', dir: 'less', best: 0, worst: 3, w: 15, why: '새로 여는 곳이 많으면 이미 붐비는 동네', scan: true, read: (f) => num(f.newRivals) },
      { id: 'c-gaps', label: '진료 시간 빈틈 칸 수(월~토)', unit: '칸', dir: 'more', full: 10, w: 10, why: '야간·주말 빈틈은 새 의원이 파고들 자리', scan: false, read: (f) => num(f.gapCells) },
      { id: 'c-price', label: '(경쟁 평균 체외충격파 값 − 지금 의원 값) ÷ 지금 의원 값 × 100(%), 0 아래는 0', unit: '%', dir: 'more', full: 20, w: 10, why: '둘레가 비싸게 받으면 값으로 견줄 수 있다. 지금 의원 값을 안 적으면 값 없음', scan: false, read: priceGap },
    ],
  },
  {
    id: 'transit',
    name: '교통·흐름',
    w: 20,
    scan: true,
    note: '',
    subs: [
      { id: 't-station', label: '가장 가까운 역까지 m(훑기는 동 가운데에서)', unit: 'm', dir: 'less', best: 200, worst: 1500, w: 40, why: '앞 판 그대로', scan: true, read: (f) => num(f.stationM) },
      { id: 't-stops', label: '400m 안 버스 정류장 수(훑기는 동 가운데에서)', unit: '곳', dir: 'more', full: 10, w: 20, why: '앞 판 그대로', scan: true, read: (f) => num(f.stops) },
      { id: 't-flow', label: '범위 안 하루 평균 승하차 합(교통카드 기준)', unit: '명', dir: 'more', full: 30000, w: 40, why: '사람이 실제로 지나는 양. 군 지역은 값 없음 → 남은 무게로', scan: false, read: (f) => num(f.flow) },
    ],
  },
  {
    id: 'site',
    name: '자리',
    w: 15,
    scan: false,
    note: '후보만',
    subs: [
      { id: 's-floor', label: "후보 층(층 글의 숫자, '지'로 시작하면 지하 = 0점)", unit: '층', dir: 'less', best: 1, worst: 5, w: 25, why: '무릎·허리 아픈 환자는 낮은 층', scan: false, read: (f) => floorNumber(f.floorLabel), zero: (v) => v < 0 },
      { id: 's-elevator', label: '건물 승강기 수', unit: '대', dir: 'more', full: 1, w: 20, why: '2층 이상이면 꼭 필요', scan: false, read: (f) => num(f.elevators) },
      { id: 's-parking', label: '건물 주차 대수(건축물대장)', unit: '대', dir: 'more', full: 30, w: 15, why: '노년 환자는 차로 온다', scan: false, read: (f) => num(f.parking) },
      { id: 's-age', label: '사용승인 뒤 햇수', unit: '년', dir: 'less', best: 5, worst: 30, w: 10, why: '오래된 건물은 전기·방사선 공사가 어렵다', scan: false, read: (f) => num(f.buildingAge) },
      { id: 's-neighbors', label: '후보 30m 안 약국 수(상가정보 업종)', unit: '곳', dir: 'more', full: 1, w: 10, why: '1층 약국은 처방 환자 동선', scan: false, read: (f) => num(f.pharmacies) },
      { id: 's-sign', label: '간판 보임(보여요 1 · 가려요 0 · 모름 값 없음)', unit: '', dir: 'more', full: 1, w: 10, why: '사용자가 거리 사진으로 고름', scan: false, read: (f) => pick(f.sign, 'yes') },
      { id: 's-violation', label: '위반 건축물(없음 1 · 있음 0 · 모름 값 없음)', unit: '', dir: 'more', full: 1, w: 10, why: '있으면 개설 신고가 막힐 수 있다', scan: false, read: (f) => pick(f.violation, 'no') },
    ],
  },
  {
    id: 'cost',
    name: '비용',
    w: 10,
    scan: false,
    note: '후보만, 후보 매물',
    subs: [
      { id: 'k-rentPy', label: '평당 월세(원)', unit: '원', dir: 'less', best: 50000, worst: 200000, w: 35, why: '지방 주거지 ~ 서울 역세권 폭', scan: false, read: (f) => num(f.rentPerPy) },
      { id: 'k-deposit', label: '보증금(원)', unit: '원', dir: 'less', best: 30_000_000, worst: 200_000_000, w: 15, why: '처음 드는 돈', scan: false, read: (f) => num(f.deposit) },
      { id: 'k-premium', label: '권리금(원)', unit: '원', dir: 'less', best: 0, worst: 100_000_000, w: 20, why: '돌려받지 못하는 돈', scan: false, read: (f) => num(f.premium) },
      { id: 'k-vsAvg', label: '평당 월세가 저장한 매물 평균보다 몇 % 비싼지(2개 미만이면 값 없음)', unit: '%', dir: 'less', best: -20, worst: 20, w: 30, why: '같은 눈높이로 고른 매물끼리 견줌', scan: false, read: vsAverage },
    ],
  },
] as const satisfies readonly GroupDefRaw[]

export type GroupId = (typeof GROUPS)[number]['id']
export type SubId = (typeof GROUPS)[number]['subs'][number]['id']
export type ScoreSubDef = SubDefRaw & { id: SubId }
export type ScoreGroupDef = Omit<GroupDefRaw, 'id' | 'subs'> & { id: GroupId; subs: readonly ScoreSubDef[] }
export type ScoreScope = 'candidate' | 'scan'

/** 항목 다섯과 세부 항목(차례 그대로). 무게 판·'근거와 출처'가 이 목록을 그린다 */
export const SCORE_GROUPS: readonly ScoreGroupDef[] = GROUPS

/** 10세 나이대 11칸(ScoreRule.bands는 이 칸 번호 0~10) */
export const AGE_BANDS: readonly string[] = [...range(0, 9).map((i) => `${i * 10}~${i * 10 + 9}세`), '100세 이상']

export type ScoreItemRule = { w: number; full: number } | { w: number; best: number; worst: number }
/** location_settings.score_rule 모양 */
export type ScoreRule = { v: 1; weights: Record<GroupId, number>; bands: number[]; items: Record<SubId, ScoreItemRule> }
/** 무게 판이 고치는 중인 설정(빈칸 = null·NaN) */
export type ScoreRuleDraft = {
  weights?: Partial<Record<GroupId, number | null>>
  bands?: readonly number[]
  items?: Partial<Record<SubId, { w?: number | null; full?: number | null; best?: number | null; worst?: number | null }>>
}

const itemOf = (s: SubDefRaw): ScoreItemRule => (s.dir === 'more' ? { w: s.w, full: s.full } : { w: s.w, best: s.best, worst: s.worst })
const ALL_SUBS: readonly ScoreSubDef[] = SCORE_GROUPS.flatMap((g) => g.subs)

function buildDefault(): ScoreRule {
  return {
    v: 1,
    weights: Object.fromEntries(SCORE_GROUPS.map((g) => [g.id, g.w])) as Record<GroupId, number>,
    bands: range(4, BAND_COUNT - 1),
    items: Object.fromEntries(ALL_SUBS.map((s) => [s.id, itemOf(s)])) as Record<SubId, ScoreItemRule>,
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}

/** 처음 설정(사용자 [기본값으로]·DB 기본값). 고칠 수 없게 얼려 둔다 — 고쳐 쓰려면 structuredClone 또는 fillScoreRule */
export const DEFAULT_SCORE_RULE: ScoreRule = deepFreeze(buildDefault())

/** 칸 아래 안내 글(design.md 8절). blank·weight는 Claude 판단 — 적을수록 좋음 기준은 0·음수도 되고, 무게는 막대라 보통 안 보인다 */
export const RULE_TEXT = {
  full: '0보다 큰 숫자를 적어 주세요. 비우면 저장되지 않아요.',
  order: "'100점' 값이 '0점' 값보다 작아야 해요.",
  bands: '나이대를 하나 이상 골라 주세요.',
  blank: '숫자를 적어 주세요. 비우면 저장되지 않아요.',
  weight: '무게는 0부터 100까지 정수로 정해 주세요.',
} as const

export type RuleProblem = { at: 'bands' | GroupId | SubId; field?: 'w' | 'full' | 'best' | 'worst'; text: string }

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
const isWeight = (v: unknown): v is number => isInt(v) && v >= 0 && v <= 100
const isBand = (v: unknown): v is number => isInt(v) && v >= 0 && v < BAND_COUNT
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function bandsOk(bands: unknown): boolean {
  return Array.isArray(bands) && bands.length > 0 && bands.length <= BAND_COUNT && bands.every(isBand) && new Set(bands).size === bands.length
}

/** 방향을 고르는 세부 항목(flip)에서 적을수록 모양인가: full 칸이 없고 best·worst 칸 중 하나라도 있으면 */
const lessShape = (item: Record<string, unknown>) => !('full' in item) && ('best' in item || 'worst' in item)

/** 저장해도 되는지 칸마다 본다(빈 배열 = 저장해도 됨). 무게 판은 문제가 하나라도 있으면 저장 콜백을 부르지 않는다.
 * 방향을 고르는 세부 항목(p-welfare)만 {w, full}·{w, best, worst} 둘 다 받는다 */
export function checkScoreRule(rule: ScoreRuleDraft): RuleProblem[] {
  const out: RuleProblem[] = []
  const weights: Record<string, unknown> = isRecord(rule.weights) ? rule.weights : {}
  const items: Record<string, unknown> = isRecord(rule.items) ? rule.items : {}
  if (!bandsOk(rule.bands)) out.push({ at: 'bands', text: RULE_TEXT.bands })
  for (const g of SCORE_GROUPS) {
    if (!isWeight(weights[g.id])) out.push({ at: g.id, field: 'w', text: RULE_TEXT.weight })
    for (const s of g.subs) {
      const raw = items[s.id]
      const item: Record<string, unknown> = isRecord(raw) ? raw : {}
      if (!isWeight(item.w)) out.push({ at: s.id, field: 'w', text: RULE_TEXT.weight })
      if (s.dir === 'more' && !(s.flip && lessShape(item))) {
        if (!(isInt(item.full) && item.full > 0)) out.push({ at: s.id, field: 'full', text: RULE_TEXT.full })
        continue
      }
      const { best, worst } = item
      if (!isInt(best)) out.push({ at: s.id, field: 'best', text: RULE_TEXT.blank })
      if (!isInt(worst)) out.push({ at: s.id, field: 'worst', text: RULE_TEXT.blank })
      if (isInt(best) && isInt(worst) && best >= worst) out.push({ at: s.id, text: RULE_TEXT.order })
    }
  }
  return out
}

/** 저장된 설정(DB jsonb)을 다 갖춘 설정으로: 맞는 칸은 남기고, 빠지거나 틀린 칸·나중에 더한 세부 항목은 처음 값, 모르는 id는 버린다.
 * 방향을 고르는 세부 항목은 저장된 모양(많을수록·적을수록)을 따르고, 기준이 틀리면 그 모양의 처음 기준이다 */
export function fillScoreRule(raw: unknown): ScoreRule {
  const rule = buildDefault()
  if (!isRecord(raw)) return rule
  const weights = isRecord(raw.weights) ? raw.weights : {}
  for (const g of SCORE_GROUPS) {
    const w = weights[g.id]
    if (isWeight(w)) rule.weights[g.id] = w
  }
  if (Array.isArray(raw.bands)) {
    const bands = [...new Set(raw.bands.filter(isBand))].sort((a, b) => a - b)
    if (bands.length > 0) rule.bands = bands
  }
  const items = isRecord(raw.items) ? raw.items : {}
  for (const s of ALL_SUBS) {
    const item = items[s.id]
    if (!isRecord(item)) continue
    const w = isWeight(item.w) ? item.w : s.w
    if (s.flip && lessShape(item)) {
      const ok = isInt(item.best) && isInt(item.worst) && item.best < item.worst
      rule.items[s.id] = ok ? { w, best: item.best as number, worst: item.worst as number } : { w, best: s.flip.best, worst: s.flip.worst }
    } else if (s.dir === 'more') rule.items[s.id] = { w, full: isInt(item.full) && item.full > 0 ? item.full : s.full }
    else if (isInt(item.best) && isInt(item.worst) && item.best < item.worst) rule.items[s.id] = { w, best: item.best, worst: item.worst }
    else rule.items[s.id] = { w, best: s.best, worst: s.worst }
  }
  return rule
}

/** 세부 점수 0~100(버림) */
export function subScore(value: number, item: ScoreItemRule): number {
  if ('full' in item) return item.full > 0 ? Math.floor(Math.min(100, (Math.max(0, value) * 100) / item.full)) : 0
  if (value <= item.best) return 100
  if (value >= item.worst) return 0
  return Math.floor(((item.worst - value) * 100) / (item.worst - item.best))
}

export type SubScore = { id: SubId; value: number | null; score: number | null }
/** score = 항목 점수 0~100, points = 종합에 보탠 점수(버림(항목 점수 × 무게 ÷ 값 있는 항목 무게 합)) */
export type GroupScore = { id: GroupId; score: number | null; points: number | null; subs: SubScore[] }
/** total = 종합(null = 점수 없음), used = 값이 있어 매긴 항목 수(훑기는 셋 가운데, 후보는 다섯 가운데) */
export type ScoreResult = { total: number | null; groups: GroupScore[]; used: number }

/** 버림(점수 × 무게 ÷ 값 있는 무게 합)을 칸마다. 값 있는 무게 합이 0이면 null */
function weigh(parts: readonly { score: number | null; w: number }[]): (number | null)[] | null {
  const sum = parts.reduce((a, p) => (p.score === null ? a : a + p.w), 0)
  if (sum <= 0) return null
  return parts.map((p) => (p.score === null ? null : Math.floor((p.score * p.w) / sum)))
}
const total = (pts: readonly (number | null)[]) => pts.reduce<number>((a, p) => a + (p ?? 0), 0)

/** 점수 매기기. 후보 = 항목 다섯·세부 항목 모두, 동네 훑기(scan) = 훑기 ○ 항목·세부 항목만. 설정의 틀린 칸은 처음 값으로 본다 */
export function scoreItems(values: ScoreFacts, rule: ScoreRule, scope: ScoreScope = 'candidate'): ScoreResult {
  const r = fillScoreRule(rule)
  const inScope = (x: { scan: boolean }) => scope === 'candidate' || x.scan
  const groups = SCORE_GROUPS.filter(inScope).map((g) => {
    const subs: SubScore[] = g.subs.filter(inScope).map((s) => {
      const value = num(s.read(values, r.bands))
      const score = value === null ? null : s.zero?.(value) ? 0 : subScore(value, r.items[s.id])
      return { id: s.id, value, score }
    })
    const pts = weigh(subs.map((s) => ({ score: s.score, w: r.items[s.id].w })))
    return { id: g.id, score: pts === null ? null : total(pts), subs }
  })
  const pts = weigh(groups.map((g) => ({ score: g.score, w: r.weights[g.id] })))
  return {
    total: pts === null ? null : total(pts),
    groups: groups.map((g, i) => ({ id: g.id, score: g.score, points: pts?.[i] ?? null, subs: g.subs })),
    used: groups.filter((g) => g.score !== null).length,
  }
}
