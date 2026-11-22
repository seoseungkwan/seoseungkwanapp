// 한 장 보고서 종이에 적을 글(specs/location TASK-40 · AC-7914.2, 시안 ?s=report 자리 그대로). 순수 함수 — 읽기·저장·부르기 없음.
// 점수는 score.ts scoreItems(받은 설정), 위험 신호는 flags.ts pickFlags, 비용은 costs.ts calcCosts, 평당 월세는 listings.ts를 그대로 부른다.
// 돈은 wonText, 거리는 distText, 넓이는 areaText, 날짜는 asOfText 한 곳씩만 쓴다. 숫자는 버림(CLAUDE.md).
// 그날 값 칸은 받았으면 그 값, 못 받았으면 지난 값(prev), 그것도 없으면 그 칸에 자료 없음 글(design.md 15절)이다.
// 예상 환자 줄은 없다(사용자 2026-11-22) — 손익분기(비용 칸과 직접 적은 환자 1명당 평균 수입)만 적는다

import { asOfText, sourceText, whyText } from '@/components/location/common/text'
import { todayInKorea } from '@/lib/analytics/dates'
import { areaText } from '@/lib/location/area'
import { distText } from '@/lib/location/coords'
import { calcCosts, checkCosts } from '@/lib/location/costs'
import { pickFlags } from '@/lib/location/flags'
import { GAP_DAYS, GAP_SLOTS, gapTable } from '@/lib/location/hours'
import { compareListings, perPyeongOf } from '@/lib/location/listings'
import { commaText, wonText } from '@/lib/location/money'
import { AGE_BANDS, fillScoreRule, SCORE_GROUPS, scoreItems, type ScoreRule } from '@/lib/location/score'
import type {
  Candidate,
  CandidateStatus,
  Got,
  Listing,
  LocationNote,
  Rival,
  ScoreFacts,
  Snapshot,
  SnapshotKey,
  SnapshotValue,
  YesNo,
} from '@/types/location'

export type SheetInput = {
  candidate: Candidate
  listing: Listing | null
  listings: readonly Listing[]
  notes: readonly LocationNote[]
  facts: ScoreFacts
  rule: ScoreRule
  today: string
  hospitalName?: string
}

export type SheetRow = { label: string; value: string }
export type SheetItem = { name: string; points: number | null; max: number | null; empty: string }
export type Sheet = {
  kicker: string
  name: string
  address: string
  made: string
  total: number | null
  items: SheetItem[]
  flags: { title: string; detail: string }[]
  people: SheetRow[]
  rivals: SheetRow[]
  site: SheetRow[]
  money: SheetRow[]
  terms: [SheetRow[], SheetRow[]]
  notes: SheetRow[]
  foot: string
}

export const EMPTY = '–'
export const NO_SCORE = '점수 없음'
const NO_VALUE = '값 없음'
const NO_LISTING = '매물 없음'
const MINUS = '−'
const FOOT_END = '숫자는 저장한 날 값이고 버림으로 적었어요.'
const PRESALE_SHOWN = 3
const NOTES_SHOWN = 2
const SENIOR_BAND = 6 // 60세 이상 = 10세 나이대 11칸의 6~10칸

// 진행 상태 다섯(requirements 배경 11 · 시안 STEPS)
const STATUS_TEXT: Record<CandidateStatus, string> = {
  watching: '보는 중',
  contacted: '중개사 연락',
  visited: '보러 감',
  reviewing: '계약 검토',
  dropped: '내려놓음',
}

// 협상표 열쇠 여섯(design.md 11절)과 시안 NEGO 이름
const TERMS: readonly [string, string][] = [
  ['freeRent', '무상 기간'],
  ['mgmt', '관리비'],
  ['raise', '월세 올리는 비율'],
  ['restore', '원상 복구'],
  ['period', '계약 기간'],
  ['premium', '권리금'],
]

// 출처 줄을 모을 그날 값 칸(design.md 6절 차례)
const SNAPSHOT_FIELDS = [
  'people',
  'trend',
  'flow',
  'income',
  'aptPrice',
  'bizPrice',
  'apts',
  'presale',
  'seniors',
  'gyms',
  'schools',
  'accidents',
  'industry',
  'pharmacies',
  'rivals',
  'history',
  'station',
  'bus',
  'market',
  'building',
  'stores',
  'welfare',
] as const satisfies readonly SnapshotKey[]

const VIOLATION_TEXT: Record<YesNo, string> = {
  yes: '있음',
  no: '없음',
  unknown: '모름 — 건축물대장을 떼어 확인하세요',
}
const VIOLATION_UNPICKED = '안 고름 — 건축물대장을 떼어 확인하세요'

// ── 그날 값 칸 읽기 ─────────────────────────────────────

type Shown<T> = { v: T; asOf: string }

function shownOf<T>(got: Got<T> | undefined): Shown<T> | null {
  if (!got) return null
  if (got.ok) return { v: got.v, asOf: got.asOf }
  return got.prev ?? null
}

function field<K extends SnapshotKey>(s: Snapshot | null, key: K): Got<SnapshotValue<K>> | undefined {
  return s ? (s[key] as Got<SnapshotValue<K>> | undefined) : undefined
}

const valueOf = <K extends SnapshotKey>(s: Snapshot | null, key: K): SnapshotValue<K> | null => shownOf(field(s, key))?.v ?? null

/** 값이 없는 칸 글: 받지 못한 까닭(design.md 15절), 칸이 아예 없으면 – */
function missText(got: Got<unknown> | undefined): string {
  if (!got || got.ok) return EMPTY
  return whyText(got.why, got.src) ?? EMPTY
}

/** 칸 하나: 값이 있으면 글로, 없으면 자료 없음 글 */
function cell<K extends SnapshotKey>(s: Snapshot | null, key: K, make: (v: SnapshotValue<K>) => string): string {
  const got = field(s, key)
  const shown = shownOf(got)
  return shown ? make(shown.v) : missText(got)
}

// ── 글자 조각 ───────────────────────────────────────────

const won = (n: number | null | undefined) => (typeof n === 'number' && Number.isSafeInteger(n) ? wonText(n) : EMPTY)
const count = (n: number | null, unit: string) => (n === null ? EMPTY : `${commaText(n)}${unit}`)

/** 소수 첫째 자리까지 버린 수(0.1 수 → 글자, 끝 .0 뺌) */
function tenthsText(tenths: number): string {
  const int = commaText(Math.floor(tenths / 10))
  return tenths % 10 === 0 ? int : `${int}.${tenths % 10}`
}

/** ISO 시각 → 한국 날짜 글자. 틀린 시각이면 null */
function isoDayText(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') return null
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? null : asOfText(todayInKorea(at))
}

/** 고른 나이대 이름: 끝(100세 이상)까지 이어진 나이대면 `{n}세 이상`, 아니면 `고른 나이대` */
function bandsName(bands: readonly number[]): string {
  const s = [...bands].sort((a, b) => a - b)
  const tail = s.length > 0 && s[s.length - 1] === AGE_BANDS.length - 1 && s.every((b, i) => b === s[0] + i)
  return tail && s[0] > 0 ? `${s[0] * 10}세 이상` : '고른 나이대'
}

function trendText(rows: SnapshotValue<'trend'>): string {
  const sorted = rows.filter((r) => typeof r.ym === 'string' && Number.isFinite(r.total)).sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0))
  if (sorted.length < 2 || !(sorted[0].total > 0)) return EMPTY
  const first = sorted[0]
  const diff = sorted[sorted.length - 1].total - first.total
  const tenths = Math.floor((Math.abs(diff) * 1000) / first.total)
  return `${diff < 0 ? MINUS : '+'}${tenthsText(tenths)}% (${asOfText(first.ym)}부터)`
}

function presaleText(rows: SnapshotValue<'presale'>): string {
  if (rows.length === 0) return '없음'
  const sorted = [...rows].sort((a, b) => (a.moveIn < b.moveIn ? -1 : a.moveIn > b.moveIn ? 1 : 0))
  const shown = sorted.slice(0, PRESALE_SHOWN).map((p) => `${asOfText(p.moveIn)} ${commaText(p.households)}세대`)
  const more = sorted.length - PRESALE_SHOWN
  return `${shown.join(', ')}${more > 0 ? ` 외 ${commaText(more)}곳` : ''}`
}

const clinicsOf = (rivals: readonly Rival[]) => rivals.filter((r) => r.kind !== 'korean')

// 진료 시간 빈틈 글(시안 gapText): 평일 아침·점심·저녁 19~20시·밤, 토요일 오후, 일요일
const WEEKDAYS = [0, 1, 2, 3, 4]
const SAT = 5
const SUN = 6
const slotAt = (id: string) => GAP_SLOTS.findIndex((s) => s.id === id)
function gapsText(rivals: readonly Rival[]): string {
  const table = gapTable(rivals)
  if (clinicsOf(rivals).length > 0 && table.counted === 0) return EMPTY
  const parts: string[] = []
  for (const id of ['early', 'lunch', 'late', 'night']) {
    const si = slotAt(id)
    const gaps = WEEKDAYS.filter((d) => table.counts[si][d] === 0)
    if (gaps.length === WEEKDAYS.length) parts.push(`평일 ${GAP_SLOTS[si].label}`)
    else if (gaps.length > 0) parts.push(`${gaps.map((d) => GAP_DAYS[d]).join('·')}요일 ${GAP_SLOTS[si].label}`)
  }
  if (table.counts[slotAt('afternoon')][SAT] === 0) parts.push('토요일 오후')
  if (table.counts[slotAt('morning')][SUN] === 0) parts.push('일요일')
  return parts.length > 0 ? parts.join(', ') : '없음'
}

function eswtText(rivals: readonly Rival[], home: number | null | undefined): string {
  const prices = clinicsOf(rivals)
    .map((r) => r.eswt)
    .filter((v): v is number => typeof v === 'number' && Number.isSafeInteger(v))
  if (prices.length === 0) return EMPTY
  const avg = Math.floor(prices.reduce((a, b) => a + b, 0) / prices.length)
  const mine = typeof home === 'number' && Number.isSafeInteger(home) && home > 0 ? ` (지금 의원 ${wonText(home)})` : ''
  return `${wonText(avg)}${mine}`
}

function buildingText(b: SnapshotValue<'building'>): string {
  const parts = [b.approvedOn ? `${b.approvedOn.slice(0, 4)}년` : null, b.below > 0 ? `지하 ${commaText(b.below)}층` : null, `지상 ${commaText(b.above)}층`]
  return parts.filter((p) => p !== null).join(' · ')
}

/** 빈 층 짐작: 건축물대장 층 가운데(주차장 뺌) 30m 안 가게가 하나도 없는 층 수(상가정보만, 공실률 아님) */
function emptyFloors(b: SnapshotValue<'building'>, stores: SnapshotValue<'stores'>): number {
  const busy = new Set(stores.filter((s) => s.count > 0).map((s) => s.floor.trim()))
  const floors = new Set(b.floors.filter((f) => !f.usage.includes('주차장')).map((f) => f.label.trim()))
  return [...floors].filter((label) => !busy.has(label)).length
}

function termText(raw: unknown): string {
  const row = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const now = typeof row.now === 'string' ? row.now.trim() : ''
  const want = typeof row.want === 'string' ? row.want.trim() : ''
  return `${now || EMPTY}${want ? ` → ${want}` : ''}`
}

// ── 묶음 ─────────────────────────────────────────────────

function peopleRows(s: Snapshot | null, rule: ScoreRule, density: number | null): SheetRow[] {
  const people = field(s, 'people')
  return [
    { label: '사는 사람', value: cell(s, 'people', (p) => `${commaText(p.total)}명 · ${commaText(p.households)}세대`) },
    {
      label: '60세 이상',
      value: cell(s, 'people', (p) => {
        const seniors = p.bands.slice(SENIOR_BAND).reduce((a, b) => a + b, 0)
        return p.total > 0 ? `${commaText(seniors)}명 (${Math.floor((seniors * 100) / p.total)}%)` : `${commaText(seniors)}명`
      }),
    },
    { label: `${bandsName(rule.bands)} 밀도`, value: density !== null ? `1km²당 ${commaText(Math.floor(density))}명` : missText(people) },
    { label: '4년 추세', value: cell(s, 'trend', trendText) },
    { label: '입주 예정', value: cell(s, 'presale', presaleText) },
    { label: '교통사고 다발', value: cell(s, 'accidents', (a) => (a.spots > 0 ? `${commaText(a.spots)}곳 · 사고 ${commaText(a.cases)}건` : '없음')) },
  ]
}

function rivalRows(s: Snapshot | null, home: number | null | undefined): SheetRow[] {
  const total = valueOf(s, 'people')?.total ?? null
  return [
    {
      label: '정형외과·통증·재활',
      value: cell(s, 'rivals', (rivals) => {
        const n = clinicsOf(rivals).length
        const per = n > 0 && total !== null ? `${commaText(Math.floor(total / n))}명` : EMPTY
        return `${commaText(n)}곳 · 1곳당 ${per}`
      }),
    },
    { label: '한의원', value: cell(s, 'rivals', (rivals) => `${commaText(rivals.length - clinicsOf(rivals).length)}곳`) },
    {
      label: '3년 개폐업',
      value: cell(s, 'history', (h) => `문 엶 ${h.filter((x) => x.kind === 'open').length} · 문 닫음 ${h.filter((x) => x.kind === 'close').length}`),
    },
    { label: '진료 시간 빈틈', value: cell(s, 'rivals', gapsText) },
    { label: '체외충격파 평균', value: cell(s, 'rivals', (rivals) => eswtText(rivals, home)) },
  ]
}

function siteRows(s: Snapshot | null, violation: YesNo | null): SheetRow[] {
  const building = valueOf(s, 'building')
  const stores = valueOf(s, 'stores')
  return [
    { label: '역', value: cell(s, 'station', (st) => `${st.name} · ${distText(st.distM)}`) },
    { label: '버스', value: cell(s, 'bus', (n) => `400m 안 정류장 ${commaText(n)}곳`) },
    { label: '사람 흐름', value: cell(s, 'flow', (f) => `하루 ${commaText(f.total)}명 타고 내림(교통카드)`) },
    { label: '건물', value: cell(s, 'building', buildingText) },
    { label: '엘리베이터·주차', value: cell(s, 'building', (b) => `엘리베이터 ${count(b.elevators, '대')} · 주차 ${count(b.parking, '대')}`) },
    { label: '위반 건축물', value: violation ? VIOLATION_TEXT[violation] : VIOLATION_UNPICKED },
    {
      label: '빈 층',
      value: building && stores ? `${emptyFloors(building, stores)}개 층(짐작)` : building ? missText(field(s, 'stores')) : missText(field(s, 'building')),
    },
  ]
}

function moneyRows(input: SheetInput): SheetRow[] {
  const { candidate: c, listing: l } = input
  const floor = c.floorLabel.trim() || l?.floorLabel.trim() || EMPTY
  const area = c.areaM2 ?? l?.areaM2 ?? null
  const perPy = l ? perPyeongOf(l.rent, l.areaM2) : null
  const avg = compareListings(input.listings).rentAvg
  const costs = calcCosts(checkCosts(c.costs), area)
  return [
    { label: '층 · 전용', value: `${floor} · ${area !== null ? areaText(area) : EMPTY}` },
    { label: '보증금 / 월세', value: l ? `${won(l.deposit)} / ${won(l.rent)}` : EMPTY },
    { label: '관리비 · 권리금', value: l ? `${won(l.mgmt)} · ${won(l.premium)}` : EMPTY },
    { label: '평당 월세', value: perPy !== null ? `${wonText(perPy)}${avg !== null ? ` (저장한 매물 평균 ${wonText(avg)})` : ''}` : EMPTY },
    { label: '처음에 드는 돈', value: won(costs.startTotal) },
    { label: '손익분기', value: costs.breakEven !== null ? `하루 ${tenthsText(Math.round(costs.breakEven * 10))}명` : EMPTY },
    { label: '중개사', value: l?.brokerNote.trim() || EMPTY },
  ]
}

function noteRows(candidateId: string, notes: readonly LocationNote[]): SheetRow[] {
  return notes
    .filter((n) => n.candidateId === candidateId)
    .sort((a, b) => (a.day !== b.day ? (a.day < b.day ? 1 : -1) : a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, NOTES_SHOWN)
    .map((n) => ({ label: asOfText(n.day), value: n.body }))
}

function footText(s: Snapshot | null): string {
  const lines: string[] = []
  for (const key of SNAPSHOT_FIELDS) {
    const got = field(s, key)
    const shown = shownOf(got)
    if (!got || !shown) continue
    const line = sourceText(got.src, shown.asOf)
    if (line !== null && !lines.includes(line)) lines.push(line)
  }
  const user = sourceText('user')
  if (user !== null) lines.push(user)
  return `출처: ${lines.join(' / ')}. ${FOOT_END}`
}

/** 보고서 한 장의 글을 모두 만든다 */
export function buildSheet(input: SheetInput): Sheet {
  const { candidate: c, listing, today } = input
  const s = c.snapshot
  const rule = fillScoreRule(input.rule)
  const score = scoreItems(input.facts, rule, 'candidate')
  const scored = score.groups.reduce((sum, g) => (g.score === null ? sum : sum + rule.weights[g.id]), 0)
  const items = SCORE_GROUPS.map((g) => {
    const got = score.groups.find((x) => x.id === g.id)
    const points = got?.points ?? null
    return {
      name: g.name,
      points,
      max: points !== null && scored > 0 ? Math.floor((rule.weights[g.id] * 100) / scored) : null,
      empty: g.id === 'cost' && listing === null ? NO_LISTING : NO_VALUE,
    }
  })
  const density = score.groups.find((g) => g.id === 'people')?.subs.find((x) => x.id === 'p-density')?.value ?? null

  const flags = pickFlags({
    rivals: valueOf(s, 'rivals'),
    history: valueOf(s, 'history'),
    building: valueOf(s, 'building'),
    people: valueOf(s, 'people'),
    station: valueOf(s, 'station'),
    bus: valueOf(s, 'bus'),
    today,
    radiusM: c.radiusM,
    violation: c.violation,
    floorLabel: c.floorLabel.trim() || null,
    listing,
    listings: [...input.listings],
  }).map((f) => ({ title: `${f.title}${f.level === 'check' ? ' (확인 필요)' : ''}`, detail: f.detail }))

  const saved = isoDayText(s?.at)
  const made = [
    `${asOfText(today)} 뽑음`,
    saved ? `자료는 ${saved}(저장한 날) 값` : null,
    `살필 범위 ${distText(c.radiusM)}`,
    input.hospitalName?.trim() || null,
  ]
    .filter((p) => p !== null)
    .join(' · ')

  const termRows = TERMS.map(([key, label]) => ({ label, value: termText(c.terms[key]) }))

  return {
    kicker: `입지 분석 보고서 · ${STATUS_TEXT[c.status]}`,
    name: c.name,
    address: c.addressNote.trim(),
    made,
    total: score.total,
    items,
    flags,
    people: peopleRows(s, rule, density),
    rivals: rivalRows(s, input.facts.homeEswt),
    site: siteRows(s, c.violation),
    money: moneyRows(input),
    terms: [termRows.slice(0, 3), termRows.slice(3)],
    notes: noteRows(c.id, input.notes),
    foot: footText(s),
  }
}
