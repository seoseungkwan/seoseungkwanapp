import type { Got, Rival, RivalsGot, Snapshot, SnapshotKey, SnapshotValue } from '@/types/location'
import { DEPTS } from './depts'

// 그날 값(specs/location design.md 6절, REQ-7908·7922): 모양 검사 · 크기 줄이기 · 다시 받은 값으로 덮기 · 의료급여 비율.
// 순수 함수만 둔다(부르기·저장·console 없음). 그날 값은 공공 자료로 만든 숫자와 공공 자료의 좌표·이름뿐이다 — 카카오 답은 넣지 않는다(ADR-044).
// 그래서 모양 검사는 정해 둔 칸만 받는다(칸이 더 있으면 틀린 모양): 다른 자료가 몰래 섞여 저장되지 않게.
// 점수 값 꺼내기는 lib/location/facts.ts scoreFactsOf 한 곳이 한다(TASK-59)

/** 그날 값 칸 24개(design.md 6절 차례) */
export const SNAPSHOT_KEYS = [
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
  'place',
  'sggAvg',
  'history',
  'station',
  'bus',
  'market',
  'building',
  'stores',
  'welfare',
] as const satisfies readonly SnapshotKey[]

/** 표 칸 location_candidates.snapshot 한도(octet_length(snapshot::text) ≤ 65,536, design.md 7절) */
export const SNAPSHOT_MAX_BYTES = 65_536

// ── 크기: 표가 재는 jsonb 글자(콜론·쉼표 뒤 빈칸 하나, UTF-8 바이트) ──

function jsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(', ')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${JSON.stringify(key)}: ${jsonbText(item)}`)
      .join(', ')}}`
  }
  return JSON.stringify(value)
}

const UTF8 = new TextEncoder()
/** jsonb::text 바이트 수(JSON.stringify로 재면 빈칸 때문에 약 10% 적게 나온다) */
export function snapshotBytes(value: unknown): number {
  return UTF8.encode(jsonbText(value)).length
}

// ── 모양 검사 ──────────────────────────────────────────────

type Check = (v: unknown) => boolean
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const int: Check = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0
const real: Check = (v) => typeof v === 'number' && Number.isFinite(v) // 음수도(인구 추세 %)
const str: Check = (v) => typeof v === 'string'
const code =
  (digits: number): Check =>
  (v) =>
    typeof v === 'string' && v.length === digits && /^\d+$/.test(v)
const bool: Check = (v) => typeof v === 'boolean'
const ymd: Check = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const ym: Check = (v) => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)
const orNull =
  (c: Check): Check =>
  (v) =>
    v === null || c(v)
const oneOf =
  (...values: readonly string[]): Check =>
  (v) =>
    typeof v === 'string' && values.includes(v)
const list =
  (c: Check, length?: number): Check =>
  (v) =>
    Array.isArray(v) && (length === undefined || v.length === length) && v.every(c)
const nonEmpty =
  (c: Check): Check =>
  (v) =>
    Array.isArray(v) && v.length > 0 && c(v)
// 정해 둔 칸만(빠짐·더함 없음). 고를 칸(?)은 없어도 된다
function shape(fields: Readonly<Record<string, Check>>, optional: readonly string[] = []): Check {
  const names = Object.keys(fields)
  return (v) => {
    if (!isObj(v)) return false
    for (const key of Object.keys(v)) if (!Object.hasOwn(fields, key)) return false
    return names.every((name) => (optional.includes(name) && !Object.hasOwn(v, name)) || fields[name](v[name]))
  }
}

const open: Check = list(int, 2)
const WEEK = orNull(list(orNull(open), 8)) // 월~일 + 공휴일 8칸, [열·닫] 분
const POINT = shape({ lat: real, lng: real }) // 심평원 좌표·좌표 파일 좌표(공공 자료)
// 찾은 과목(DEPTS id, 하나 이상)
const DEPT_IDS: readonly string[] = DEPTS.map((d) => d.id)
const DEPT_LIST = nonEmpty(list(oneOf(...DEPT_IDS)))
// 경쟁 과목 의원만 담는 자세한 칸(design.md 6절) — 없으면 '새로 경쟁에 넣은 과목'
const DETAIL = shape({
  therapists: orNull(int),
  mri: orNull(bool),
  ct: orNull(bool),
  week: WEEK,
  priced: bool,
  eswt: orNull(int),
  manual: orNull(int),
})
const RIVAL = shape(
  {
    name: str,
    depts: DEPT_LIST,
    at: POINT,
    distM: int,
    sameBuilding: bool,
    address: str,
    doctors: orNull(int),
    openedYear: orNull(int),
    detail: DETAIL,
  },
  ['detail'],
)

const VALUE: Readonly<Record<SnapshotKey, Check>> = {
  people: shape({ total: int, bands: list(int, 11), households: int, unmatched: int }),
  trend: list(shape({ ym, total: int })),
  flow: shape({
    ym,
    stations: list(shape({ name: str, line: str, distM: int, perDay: int })),
    stops: list(shape({ name: str, distM: int, perDay: int })),
    total: int,
    unmatched: int,
  }),
  // 시·도 평균 두 칸은 그 칸이 없는 옛 값도 받는다
  income: shape({ sggName: str, won: int, year: int, sidoName: orNull(str), sidoWon: orNull(int) }, ['sidoName', 'sidoWon']),
  aptPrice: shape({ perM2: int, deals: int }),
  bizPrice: shape({ perM2: int, deals: int }),
  apts: list(shape({ name: str, households: int, builtYear: orNull(int), bdongName: str })),
  presale: list(shape({ name: str, households: int, moveIn: ym })),
  seniors: int,
  gyms: int,
  schools: int,
  accidents: shape({ spots: int, cases: int }),
  industry: shape({ sggName: str, employees: int, parks: int, quarter: str }),
  pharmacies: int,
  rivals: list(RIVAL),
  place: shape({ sido: code(2), sidoName: str, sgg: code(5), sggName: str, dong: orNull(code(10)), dongName: orNull(str) }),
  sggAvg: shape({
    sggName: str,
    areaM2: num,
    total: int,
    bands: list(int, 11),
    trendPct: orNull(real),
    accidents: orNull(int),
    schools: orNull(int),
    seniors: orNull(int),
    gyms: orNull(int),
    stationM: orNull(int),
    stops: orNull(int),
  }),
  // 업태 글(type)은 그 칸이 없는 옛 줄도 받는다
  history: list(shape({ kind: oneOf('open', 'close'), name: str, dept: str, type: str, on: ymd, distM: int }, ['type'])),
  station: shape({ name: str, line: str, distM: int, at: POINT }),
  bus: int,
  market: shape({ name: str, distM: int }),
  building: shape({
    usage: str,
    structure: str,
    above: int,
    below: int,
    totalM2: num,
    approvedOn: orNull(ymd),
    elevators: orNull(int),
    parking: orNull(int),
    floors: list(shape({ label: str, usage: str, m2: num })),
  }),
  stores: list(shape({ floor: str, count: int })),
  welfare: shape({ sggName: str, ym, medical: int, basic: int, nearPoor: int, population: orNull(int), basis: orNull(str) }),
}

const WHY = oneOf('no-key', 'not-applied', 'failed', 'none', 'outside')

// 의원 목록만 잘림 표시(capped: true — 값·지난 값 모두, RivalsGot)를 받는다. 다른 칸이면 틀린 모양
const CAPPED: Check = (v) => v === true
function gotCheck(value: Check, cappable = false): Check {
  const capped = cappable ? ['capped'] : []
  const extra: Record<string, Check> = cappable ? { capped: CAPPED } : {}
  const good = shape({ ok: (v) => v === true, v: value, src: str, asOf: ymd, ...extra }, capped)
  const bad = shape({ ok: (v) => v === false, why: WHY, src: str, prev: shape({ v: value, asOf: ymd, ...extra }, capped) }, ['prev'])
  return (v) => good(v) || bad(v)
}

const SNAPSHOT: Check = shape({
  v: (v) => v === 1,
  at: str,
  radiusM: (v) => int(v) && (v as number) > 0,
  ...Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, gotCheck(VALUE[key], key === 'rivals')])),
})

/** 그날 값 모양 검사(DB에서 읽은 jsonb). 맞으면 그 값, 아니면 null */
export function checkSnapshot(raw: unknown): Snapshot | null {
  return SNAPSHOT(raw) ? (raw as Snapshot) : null
}

// ── 크기 줄이기 ──────────────────────────────────────────

// 줄일 수 있는 목록 하나(그날 값·지난 값 모두). keep = 처음에는 남기는 줄(의원 목록의 경쟁 과목 의원 — detail이 있음).
// 목록 안의 작은 배열(나이대·요일)은 줄이지 않는다
type Trim = { items: unknown[]; keep: (item: unknown) => boolean }
const NEVER = () => false
const hasDetail = (item: unknown) => (item as Rival).detail !== undefined

function trimsOf(s: Snapshot): Trim[] {
  const out: Trim[] = []
  const each = <K extends SnapshotKey>(key: K, pick: (v: SnapshotValue<K>) => Trim[]) => {
    const got = s[key] as Got<SnapshotValue<K>>
    if (got.ok) out.push(...pick(got.v))
    else if (got.prev) out.push(...pick(got.prev.v))
  }
  const plain = (items: unknown[]): Trim => ({ items, keep: NEVER })
  each('trend', (v) => [plain(v)])
  each('flow', (v) => [plain(v.stations), plain(v.stops)])
  each('apts', (v) => [plain(v)])
  each('presale', (v) => [plain(v)])
  each('rivals', (v) => [{ items: v, keep: hasDetail }])
  each('history', (v) => [plain(v)])
  each('building', (v) => [plain(v.floors)])
  each('stores', (v) => [plain(v)])
  return out
}

/** 지울 수 있는 줄 자리(뒤 = 먼·덜 중요한 줄부터). force면 남기는 줄도 */
const removable = (t: Trim, force: boolean) => t.items.flatMap((item, i) => (force || !t.keep(item) ? [i] : [])).reverse()

/** 가장 큰 목록의 뒤에서부터 줄여 한도 안에 넣는다(넘친 만큼을 한 줄 크기로 나눠 한 번에 여러 줄). 다 줄여도 넘치면 그대로 둔다 */
function shrink(out: Snapshot, force: boolean): number {
  const trims = trimsOf(out)
  let size = snapshotBytes(out)
  while (size > SNAPSHOT_MAX_BYTES) {
    let biggest: { trim: Trim; at: number[]; bytes: number } | null = null
    for (const trim of trims) {
      const at = removable(trim, force)
      if (at.length === 0) continue
      const bytes = snapshotBytes(at.map((i) => trim.items[i]))
      if (biggest === null || bytes > biggest.bytes) biggest = { trim, at, bytes }
    }
    if (biggest === null) break
    const perItem = biggest.bytes / biggest.at.length
    const drop = Math.min(biggest.at.length, Math.max(1, Math.ceil((size - SNAPSHOT_MAX_BYTES) / perItem)))
    // 자리는 뒤에서부터라 앞 자리가 밀리지 않는다
    for (const i of biggest.at.slice(0, drop)) biggest.trim.items.splice(i, 1)
    size = snapshotBytes(out)
  }
  return size
}

/**
 * 65,536바이트(jsonb 글자) 안에 넣는다(design.md 6절): 가장 큰 목록의 뒤에서부터 줄인다(목록은 가까운·중요한 차례라 앞이 남는다).
 * 의원 목록은 detail이 없는 먼 의원부터 줄이고 경쟁 과목 의원(detail 있음)은 남긴다. 그래도 넘치면 지난 값(prev)을 빼고,
 * 마지막으로 먼 경쟁 과목 의원까지 줄인다(저장이 늘 되게). 받은 값은 고치지 않고 새 값을 돌려준다
 */
export function fitSnapshot(s: Snapshot): Snapshot {
  if (snapshotBytes(s) <= SNAPSHOT_MAX_BYTES) return s
  const out = JSON.parse(JSON.stringify(s)) as Snapshot
  const rivalsBefore = rivalCount(out.rivals)
  if (shrink(out, false) > SNAPSHOT_MAX_BYTES) {
    for (const key of SNAPSHOT_KEYS) {
      const got = out[key] as { ok: boolean; prev?: unknown }
      if (!got.ok) delete got.prev
    }
    shrink(out, true)
  }
  // 의원 목록을 줄였으면 잘림을 남긴다(화면이 '200곳 넘게…'를 붙인다 — 조용히 적게 세지 않게)
  const r = out.rivals
  if (rivalCount(r) < rivalsBefore) {
    if (r.ok) r.capped = true
    else if (r.prev) r.prev.capped = true
  }
  return out
}

/** 의원 목록 칸의 의원 수(값, 실패면 지난 값, 없으면 0) */
const rivalCount = (r: RivalsGot) => (r.ok ? r.v.length : (r.prev?.v.length ?? 0))

// ── 다시 받은 값으로 덮기 ─────────────────────────────────

/**
 * [오늘 값으로 다시 받기]·범위 바꾸기(AC-7908.3): 새로 받은 칸은 새 값·새 기준 날짜로 덮고, 새로 실패한 칸은
 * 전 값을 prev로 둔다(전에도 실패였으면 그 prev를 이어 둔다). 받은 두 값은 고치지 않는다
 */
export function mergeSnapshot(next: Snapshot, old: Snapshot | null): Snapshot {
  const out = { ...next }
  for (const key of SNAPSHOT_KEYS) {
    const now = next[key] as Got<unknown>
    if (now.ok) continue
    const before = old?.[key] as (Got<unknown> & { capped?: true }) | undefined
    // 의원 목록의 잘림 표시(capped)는 지난 값에 이어 붙인다(RivalsGot)
    const prev =
      before === undefined ? undefined : before.ok ? { v: before.v, asOf: before.asOf, ...(before.capped ? { capped: true } : {}) } : before.prev
    const { prev: _drop, ...failed } = now
    void _drop
    ;(out as Record<SnapshotKey, Got<unknown>>)[key] = prev === undefined ? failed : { ...failed, prev }
  }
  return out
}

// ── 인허가 주소 앞부분(3년 개폐업 모으기·대시보드 알림 확인이 같이 쓴다) ──────────

/** 인허가 몸통 addr 모양(query.ts 검사와 같음): 한글 덩이를 공백 하나로, 2~40자 */
const LICENSE_ADDR = /^(?=.{2,40}$)[가-힣]+(?: [가-힣]+)*$/
const oneSpace = (s: string) => s.trim().replace(/\s+/g, ' ')

/**
 * 그날 값 place(또는 동 경계 목록)의 시도·시군구 이름 → clinic-license 주소 앞부분 '{시도} {시군구}'(design.md 4·12절).
 * 세종처럼 시도 이름과 시군구 이름이 같으면 하나만(도로명 주소가 '세종특별자치시 …'라 둘이면 늘 빈 답). 시군구가 비었거나 모양 밖이면 null
 */
export function placeAddr(place: { sidoName: string; sggName: string }): string | null {
  const sido = oneSpace(place.sidoName)
  const sgg = oneSpace(place.sggName)
  if (sido === '' || sgg === '') return null
  const addr = sido === sgg ? sido : `${sido} ${sgg}`
  return LICENSE_ADDR.test(addr) ? addr : null
}

// ── 의료급여 비율(화면 detail/people·점수 facts.ts가 부르는 한 곳) ──────────

/** 의료급여·차상위 비율 %: (기초 의료급여 + 차상위 3종) ÷ 주민등록 인구 × 100, 소수 첫째 자리 버림. 인구가 없으면 null */
export function welfareRate(v: { medical: number; nearPoor: number; population: number | null }): number | null {
  if (v.population === null || !(v.population > 0)) return null
  // 정수로만 센다(× 1,000 ÷ 인구를 버림 → 10으로 나눔): 소수 곱셈의 어긋남이 버림을 틀리게 하지 않는다
  return Math.floor(((v.medical + v.nearPoor) * 1000) / v.population) / 10
}
