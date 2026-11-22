// 한 장 보고서 종이 두 장에 적을 글(specs/location TASK-40·TASK-75 · AC-7914.2·AC-7920.5·AC-7905.7, 시안 ?s=report 자리 그대로). 순수 함수 — 읽기·저장·부르기 없음.
// 첫 장: 점수 값·위험 신호 입력은 lib/location/facts.ts(scoreFactsOf·flagInputOf, 과목 고르기 설정 포함)를 부르고 점수는 score.ts scoreItems(받은 설정),
// 위험 신호는 flags.ts pickFlags, 비용은 costs.ts calcCosts, 평당 월세는 listings.ts, 빈 층은 빈 칸 짐작 묶음과 같은 vacancyOf,
// 진료 시간 빈틈은 hours.ts gapTable을 그대로 부른다(따로 세지 않음). 경쟁 줄은 고른 과목(depts.ts, 대표 과목으로 셈)을 따른다.
// 둘째 장 '이렇게 분석했어요': 글은 method.ts(REPORT·reportHead·reportRows·fillWeights) 한 곳 — 이 파일에 새로 적지 않는다.
// 돈은 만 원 칸 금액(보증금·월세·관리비·권리금·처음에 드는 돈)이 manText, 원 칸·평당 값은 wonText, 거리는 distText, 넓이는 areaText,
// 날짜는 asOfText 한 곳씩만 쓴다. 숫자는 버림(CLAUDE.md).
// 그날 값 칸은 받았으면 그 값, 못 받았으면 지난 값(prev), 그것도 없으면 그 칸에 자료 없음 글(design.md 15절)이다.
// 예상 환자 줄은 없다(사용자 2026-11-22) — 손익분기(비용 칸과 직접 적은 환자 1명당 평균 수입)만 적는다

import { asOfText, sourceText, whyText } from '@/components/location/common/text'
import { vacancyOf } from '@/components/location/detail/site/floors'
import { todayInKorea } from '@/lib/analytics/dates'
import { areaText } from '@/lib/location/area'
import { distText } from '@/lib/location/coords'
import { calcCosts, checkCosts } from '@/lib/location/costs'
import { deptOf, deptOfText, deptRole, rivalShortText } from '@/lib/location/depts'
import { candidateListing, flagInputOf, rivalCount, scoreFactsOf, shownAsOf, shownValue, sourceAsOf } from '@/lib/location/facts'
import { pickFlags } from '@/lib/location/flags'
import { GAP_DAYS, GAP_SLOTS, gapTable } from '@/lib/location/hours'
import { compareListings, perPyeongOf } from '@/lib/location/listings'
import { fillWeights, REPORT, reportHead, reportRows, type HowCtx, type ReportRow } from '@/lib/location/method'
import { commaText, manText, wonText } from '@/lib/location/money'
import { AGE_BANDS, fillScoreRule, SCORE_GROUPS, scoreItems, type ScoreRule } from '@/lib/location/score'
import type {
  Candidate,
  CandidateStatus,
  DeptRule,
  Got,
  Listing,
  LocationNote,
  Rival,
  ScoreFacts,
  Snapshot,
  SnapshotKey,
  SnapshotValue,
  SourceId,
  YesNo,
} from '@/types/location'

export type SheetInput = {
  candidate: Candidate
  /** 후보 글자(후보 고르기 줄과 같은 A·B·C…) — 두 장 머리에 쓴다. 비면 그 조각을 뺀다 */
  letter: string
  /** 저장한 매물 모두(후보 매물 = 이 후보에 이어진 매물 가운데 마지막으로 고친 것, 평당 월세 평균 견주기) */
  listings: readonly Listing[]
  notes: readonly LocationNote[]
  /** 점수 설정(location_settings.score_rule) */
  rule: ScoreRule
  /** 의원 과목 고르기(location_settings.dept_rule, fillDeptRule을 거친 값) */
  deptRule: DeptRule
  /** 지금 의원 체외충격파 값(원, location_settings.home_eswt) */
  homeEswt: number | null
  /** 한국 날짜 'YYYY-MM-DD' */
  today: string
  hospitalName?: string
}

export type SheetRow = { label: string; value: string }
export type SheetItem = { name: string; points: number | null; max: number | null; empty: string }
/** 둘째 장 '이렇게 분석했어요' */
export type Basis = {
  head: { kicker: string; title: string; sub: string }
  scoringTitle: string
  scoring: SheetRow[]
  tableTitle: string
  columns: readonly string[]
  rows: ReportRow[]
  always: string
}
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
  basis: Basis
}

/** 보고서 위 도움말(requirements 승인 3 · 시안 .rbar .help) — 둘째 장 제목은 method.ts REPORT에서 */
export const HELP = `A4 한 장 + 둘째 장 '${REPORT.head.title}' · 인쇄하면 앱 틀은 빠지고 종이만 나와요`
export const EMPTY = '–'
export const NO_SCORE = '점수 없음'
const NO_VALUE = '값 없음'
const NO_LISTING = '매물 없음'
// 경쟁 과목이 0개일 때(requirements '고른 과목을 따르는 글' 하나도 안 고름 · design.md 18절)
const NO_DEPT = '과목 없음'
const NO_DEPT_GAPS = '경쟁 의원 과목을 고르면 보여요.'
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

// 비급여(체외충격파 값)·진료 시간은 모을 때 의원 목록(rivals) 칸의 의원마다 detail로 담긴다 — 그날 값에 따로 칸이 없어
// 둘째 장 기준 날짜는 그 값이 든 rivals 칸의 기준 날짜를 쓴다
const IN_RIVALS: ReadonlySet<SourceId> = new Set(['nonpay', 'hosp-hours'])

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

const isWon = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isSafeInteger(n)
/** 만 원 칸 금액(매물·개원 비용, AC-7905.7) */
const man = (n: number | null | undefined) => (isWon(n) ? manText(n) : EMPTY)
const count = (n: number | null, unit: string) => (n === null ? EMPTY : `${commaText(n)}${unit}`)

/** 소수 첫째 자리까지 버린 수(0.1 수 → 글자, 끝 .0 뺌) */
function tenthsText(tenths: number): string {
  const int = commaText(Math.floor(tenths / 10))
  return tenths % 10 === 0 ? int : `${int}.${tenths % 10}`
}

/** ISO 시각 → 한국 날짜 'YYYY-MM-DD'. 틀린 시각이면 null */
function isoDay(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') return null
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? null : todayInKorea(at)
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

// ── 경쟁(과목 고르기 설정, design.md 18절) ───────────────

/** 그날 값을 받은 범위(그날 값이 없으면 후보 줄의 범위) — facts.ts와 같다 */
const radiusOf = (c: Candidate) => c.snapshot?.radiusM ?? c.radiusM

/** 범위 안에서 대표 과목이 경쟁 과목인 의원 */
function competitorsOf(rivals: readonly Rival[], radiusM: number, rule: DeptRule): Rival[] {
  return rivals.filter((r) => {
    if (r.distM > radiusM) return false
    const dept = deptOf(r, rule)
    return dept !== null && deptRole(dept, rule) === 'rival'
  })
}

/** 3년 개폐업 줄이 경쟁 과목인가(인허가 줄 대표 과목, watch.ts와 같은 셈 — 업태 칸이 없어 비워 둔다) */
function isRivalEvent(row: SnapshotValue<'history'>[number], rule: DeptRule): boolean {
  const dept = deptOfText({ name: row.name, subjects: row.dept, type: '' }, rule)
  return dept !== null && deptRole(dept, rule) === 'rival'
}

// 진료 시간 빈틈 글(시안 gapText): 평일 아침·점심·저녁 19~20시·밤, 토요일 오후, 일요일
const WEEKDAYS = [0, 1, 2, 3, 4]
const SAT = 5
const SUN = 6
const slotAt = (id: string) => GAP_SLOTS.findIndex((s) => s.id === id)
/** 경쟁 의원 가운데 모을 때 진료 시간을 받은(detail) 곳으로 센 빈틈. 경쟁 의원이 있는데 진료 시간을 하나도 모르면 – */
function gapsText(comps: readonly Rival[]): string {
  const table = gapTable(comps.map((r) => r.detail ?? {}))
  if (comps.length > 0 && table.counted === 0) return EMPTY
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

/** 체외충격파 평균(원 칸 → wonText): facts.ts가 비급여를 받은 경쟁 의원으로 낸 평균 + 지금 의원 값 */
function eswtText(avg: number | null | undefined, home: number | null | undefined): string {
  if (!isWon(avg)) return EMPTY
  const mine = isWon(home) && home > 0 ? ` (지금 의원 ${wonText(home)})` : ''
  return `${wonText(avg)}${mine}`
}

function buildingText(b: SnapshotValue<'building'>): string {
  const parts = [b.approvedOn ? `${b.approvedOn.slice(0, 4)}년` : null, b.below > 0 ? `지하 ${commaText(b.below)}층` : null, `지상 ${commaText(b.above)}층`]
  return parts.filter((p) => p !== null).join(' · ')
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

/** 경쟁 묶음: `경쟁 의원({짧은 이름})` · (한의원이 둘레로 보기면) `한의원(따로)` · 3년 개폐업(경쟁 과목만) · 진료 시간 빈틈 · 체외충격파 평균 */
function rivalRows(c: Candidate, rule: DeptRule, facts: ScoreFacts): SheetRow[] {
  const s = c.snapshot
  const got = field(s, 'rivals')
  const all = shownOf(got)?.v ?? null
  const r = radiusOf(c)
  const none = rule.rival.length === 0
  const total = valueOf(s, 'people')?.total ?? null
  const n = rivalCount(c, rule)
  const rows: SheetRow[] = [
    {
      label: `경쟁 의원(${rivalShortText(rule)})`,
      value: none
        ? EMPTY
        : n === null
          ? missText(got)
          : `${commaText(n)}곳 · 1곳당 ${n > 0 && total !== null ? `${commaText(Math.floor(total / n))}명` : EMPTY}`,
    },
  ]
  if (deptRole('korean', rule) === 'around') {
    const korean = all === null ? null : all.filter((x) => x.distM <= r && deptOf(x, rule) === 'korean').length
    rows.push({ label: '한의원(따로)', value: korean === null ? missText(got) : `${commaText(korean)}곳` })
  }
  rows.push(
    {
      label: '3년 개폐업',
      value: none
        ? EMPTY
        : cell(s, 'history', (h) => {
            const mine = h.filter((x) => isRivalEvent(x, rule))
            return `문 엶 ${mine.filter((x) => x.kind === 'open').length} · 문 닫음 ${mine.filter((x) => x.kind === 'close').length}`
          }),
    },
    { label: '진료 시간 빈틈', value: none ? NO_DEPT_GAPS : all === null ? missText(got) : gapsText(competitorsOf(all, r, rule)) },
    { label: '체외충격파 평균', value: !none && all === null ? missText(got) : eswtText(facts.rivalEswt, facts.homeEswt) },
  )
  return rows
}

function siteRows(c: Candidate): SheetRow[] {
  const s = c.snapshot
  const building = valueOf(s, 'building')
  const stores = valueOf(s, 'stores')
  return [
    { label: '역', value: cell(s, 'station', (st) => `${st.name} · ${distText(st.distM)}`) },
    { label: '버스', value: cell(s, 'bus', (n) => `400m 안 정류장 ${commaText(n)}곳`) },
    { label: '사람 흐름', value: cell(s, 'flow', (f) => `하루 ${commaText(f.total)}명 타고 내림(교통카드)`) },
    { label: '건물', value: cell(s, 'building', buildingText) },
    { label: '엘리베이터·주차', value: cell(s, 'building', (b) => `엘리베이터 ${count(b.elevators, '대')} · 주차 ${count(b.parking, '대')}`) },
    { label: '위반 건축물', value: c.violation ? VIOLATION_TEXT[c.violation] : VIOLATION_UNPICKED },
    {
      label: '빈 층',
      value:
        building && stores
          ? `${vacancyOf(building.floors, stores, c.floorLabel).empty}개 층(짐작)`
          : building
            ? missText(field(s, 'stores'))
            : missText(field(s, 'building')),
    },
  ]
}

function moneyRows(input: SheetInput, l: Listing | null): SheetRow[] {
  const c = input.candidate
  const floor = c.floorLabel.trim() || l?.floorLabel.trim() || EMPTY
  const area = c.areaM2 ?? l?.areaM2 ?? null
  const perPy = l ? perPyeongOf(l.rent, l.areaM2) : null
  const avg = compareListings(input.listings).rentAvg
  const costs = calcCosts(checkCosts(c.costs), area)
  return [
    { label: '층 · 전용', value: `${floor} · ${area !== null ? areaText(area) : EMPTY}` },
    { label: '보증금 / 월세', value: l ? `${man(l.deposit)} / ${man(l.rent)}` : EMPTY },
    { label: '관리비 · 권리금', value: l ? `${man(l.mgmt)} · ${man(l.premium)}` : EMPTY },
    { label: '평당 월세', value: perPy !== null ? `${wonText(perPy)}${avg !== null ? ` (저장한 매물 평균 ${wonText(avg)})` : ''}` : EMPTY },
    { label: '처음에 드는 돈', value: man(costs.startTotal) },
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

/** 첫 장 맨 아래: 출처 줄 + 끝 문장 + `어떻게 분석했는지는 둘째 장에 있어요.`(REPORT.firstPageEnd) */
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
  return `출처: ${lines.join(' / ')}. ${FOOT_END} ${REPORT.firstPageEnd}`
}

/** 둘째 장 '이렇게 분석했어요': 머리·점수 매기는 법(지금 무게)·묶음마다 본 자료 표(그 후보 그날 값의 출처별 기준 날짜, {경쟁})·늘 못 보는 셋 */
function basisOf(input: SheetInput, rule: ScoreRule, saved: string | null): Basis {
  const c = input.candidate
  const s = c.snapshot
  const ctx: HowCtx = {
    asOf: (src) => sourceAsOf(s, src) ?? (IN_RIVALS.has(src) ? shownAsOf(s?.rivals) : null),
    radiusM: c.radiusM,
    sggName: shownValue(s?.place)?.sggName ?? null,
    rivalShort: rivalShortText(input.deptRule),
  }
  const head = reportHead({ id: input.letter.trim(), name: c.name, saved, radiusM: c.radiusM })
  return {
    // 글자가 비면 `후보  {이름}`의 빈 칸을 하나로
    head: { ...head, kicker: head.kicker.replace(/ {2,}/g, ' ') },
    scoringTitle: REPORT.scoringTitle,
    scoring: REPORT.scoring.map((x) => ({ label: x.label, value: fillWeights(x.text, rule.weights) })),
    tableTitle: REPORT.tableTitle,
    columns: REPORT.columns,
    rows: reportRows(ctx),
    always: REPORT.always,
  }
}

/** 보고서 두 장의 글을 모두 만든다 */
export function buildSheet(input: SheetInput): Sheet {
  const { candidate: c, today, deptRule } = input
  const s = c.snapshot
  const rule = fillScoreRule(input.rule)
  const listing = candidateListing(c.id, input.listings)
  const facts = scoreFactsOf({ candidate: c, listings: input.listings, homeEswt: input.homeEswt, today, deptRule })
  const score = scoreItems(facts, rule, 'candidate')
  const scored = score.groups.reduce((sum, g) => (g.score === null ? sum : sum + rule.weights[g.id]), 0)
  const items = SCORE_GROUPS.map((g) => {
    const got = score.groups.find((x) => x.id === g.id)
    const points = got?.points ?? null
    const empty = g.id === 'cost' && listing === null ? NO_LISTING : g.id === 'rivals' && deptRule.rival.length === 0 ? NO_DEPT : NO_VALUE
    return { name: g.name, points, max: points !== null && scored > 0 ? Math.floor((rule.weights[g.id] * 100) / scored) : null, empty }
  })
  const density = score.groups.find((g) => g.id === 'people')?.subs.find((x) => x.id === 'p-density')?.value ?? null

  const flags = pickFlags(flagInputOf({ candidate: c, listings: input.listings, today, deptRule })).map((f) => ({
    title: `${f.title}${f.level === 'check' ? ' (확인 필요)' : ''}`,
    detail: f.detail,
  }))

  const saved = isoDay(s?.at)
  const made = [
    `${asOfText(today)} 뽑음`,
    saved ? `자료는 ${asOfText(saved)}(저장한 날) 값` : null,
    `살필 범위 ${distText(c.radiusM)}`,
    input.hospitalName?.trim() || null,
  ]
    .filter((p) => p !== null)
    .join(' · ')

  const letter = input.letter.trim()
  const termRows = TERMS.map(([key, label]) => ({ label, value: termText(c.terms[key]) }))

  return {
    kicker: ['입지 분석 보고서', letter ? `후보 ${letter}` : null, STATUS_TEXT[c.status]].filter((p) => p !== null).join(' · '),
    name: c.name,
    address: c.addressNote.trim(),
    made,
    total: score.total,
    items,
    flags,
    people: peopleRows(s, rule, density),
    rivals: rivalRows(c, deptRule, facts),
    site: siteRows(c),
    money: moneyRows(input, listing),
    terms: [termRows.slice(0, 3), termRows.slice(3)],
    notes: noteRows(c.id, input.notes),
    foot: footText(s),
    basis: basisOf(input, rule, saved),
  }
}
