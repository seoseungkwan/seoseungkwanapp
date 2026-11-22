import type { Got, ScoreFacts, Snapshot, SnapshotKey, SnapshotValue } from '@/types/location'
import { gapTable } from './hours'

// 그날 값(specs/location design.md 6절, REQ-7908): 모양 검사 · 크기 줄이기 · 다시 받은 값으로 덮기 · 점수 세부 값 꺼내기.
// 순수 함수만 둔다(부르기·저장·console 없음). 그날 값은 공공 자료로 만든 숫자뿐이다 — 카카오 답은 넣지 않는다(ADR-044).
// 그래서 모양 검사는 정해 둔 칸만 받는다(칸이 더 있으면 틀린 모양): 다른 자료가 몰래 섞여 저장되지 않게

/** 그날 값 칸 22개(design.md 6절 차례) */
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
const str: Check = (v) => typeof v === 'string'
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
  income: shape({ sggName: str, won: int, year: int }),
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
  rivals: list(
    shape({
      name: str,
      kind: oneOf('ortho', 'pain', 'rehab', 'korean'),
      doctors: orNull(int),
      therapists: orNull(int),
      mri: orNull(bool),
      ct: orNull(bool),
      openedYear: orNull(int),
      distM: int,
      sameBuilding: bool,
      week: WEEK,
      eswt: orNull(int),
    }),
  ),
  history: list(shape({ kind: oneOf('open', 'close'), name: str, dept: str, on: ymd, distM: int })),
  station: shape({ name: str, line: str, distM: int }),
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
  welfare: shape({ sggName: str, ym, medical: int, basic: int, nearPoor: int, population: orNull(int) }),
}

const WHY = oneOf('no-key', 'not-applied', 'failed', 'none', 'outside')

function gotCheck(value: Check): Check {
  const good = shape({ ok: (v) => v === true, v: value, src: str, asOf: ymd })
  const bad = shape({ ok: (v) => v === false, why: WHY, src: str, prev: shape({ v: value, asOf: ymd }) }, ['prev'])
  return (v) => good(v) || bad(v)
}

const SNAPSHOT: Check = shape({
  v: (v) => v === 1,
  at: str,
  radiusM: (v) => int(v) && (v as number) > 0,
  ...Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, gotCheck(VALUE[key])])),
})

/** 그날 값 모양 검사(DB에서 읽은 jsonb). 맞으면 그 값, 아니면 null */
export function checkSnapshot(raw: unknown): Snapshot | null {
  return SNAPSHOT(raw) ? (raw as Snapshot) : null
}

// ── 크기 줄이기 ──────────────────────────────────────────

// 줄일 수 있는 목록(그날 값·지난 값 모두). 목록 안의 작은 배열(나이대·요일)은 줄이지 않는다
function listsOf(s: Snapshot): unknown[][] {
  const out: unknown[][] = []
  const each = <K extends SnapshotKey>(key: K, pick: (v: SnapshotValue<K>) => unknown[][]) => {
    const got = s[key] as Got<SnapshotValue<K>>
    if (got.ok) out.push(...pick(got.v))
    else if (got.prev) out.push(...pick(got.prev.v))
  }
  each('trend', (v) => [v])
  each('flow', (v) => [v.stations, v.stops])
  each('apts', (v) => [v])
  each('presale', (v) => [v])
  each('rivals', (v) => [v])
  each('history', (v) => [v])
  each('building', (v) => [v.floors])
  each('stores', (v) => [v])
  return out
}

/**
 * 65,536바이트(jsonb 글자) 안에 넣는다: 가장 큰 목록의 뒤에서부터 줄인다(목록은 가까운·중요한 차례라 앞이 남는다).
 * 받은 값은 고치지 않고 새 값을 돌려준다. 목록을 다 비워도 넘치면 지난 값(prev)을 뺀다
 */
export function fitSnapshot(s: Snapshot): Snapshot {
  if (snapshotBytes(s) <= SNAPSHOT_MAX_BYTES) return s
  const out = JSON.parse(JSON.stringify(s)) as Snapshot
  const lists = listsOf(out)
  let size = snapshotBytes(out)
  while (size > SNAPSHOT_MAX_BYTES) {
    let biggest: unknown[] | null = null
    let biggestBytes = 0
    for (const items of lists) {
      if (items.length === 0) continue
      const bytes = snapshotBytes(items)
      if (bytes > biggestBytes) [biggest, biggestBytes] = [items, bytes]
    }
    if (biggest === null) break
    // 넘친 만큼을 한 줄 크기로 나눠 한 번에 여러 줄을 뺀다(한 줄씩 빼면 느리다). 모자라면 다음 바퀴에 더 뺀다
    const perItem = biggestBytes / biggest.length
    const drop = Math.min(biggest.length, Math.max(1, Math.ceil((size - SNAPSHOT_MAX_BYTES) / perItem)))
    biggest.splice(biggest.length - drop, drop)
    size = snapshotBytes(out)
  }
  if (size > SNAPSHOT_MAX_BYTES) {
    for (const key of SNAPSHOT_KEYS) {
      const got = out[key] as { ok: boolean; prev?: unknown }
      if (!got.ok) delete got.prev
    }
  }
  return out
}

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
    const before = old?.[key] as Got<unknown> | undefined
    const prev = before === undefined ? undefined : before.ok ? { v: before.v, asOf: before.asOf } : before.prev
    const { prev: _drop, ...failed } = now
    void _drop
    ;(out as Record<SnapshotKey, Got<unknown>>)[key] = prev === undefined ? failed : { ...failed, prev }
  }
  return out
}

// ── 점수 세부 값 꺼내기(score.ts ScoreFacts, design.md 8절) ──────────

/** 의료급여·차상위 비율 %: (기초 의료급여 + 차상위 3종) ÷ 주민등록 인구 × 100, 소수 첫째 자리 버림. 인구가 없으면 null */
export function welfareRate(v: { medical: number; nearPoor: number; population: number | null }): number | null {
  if (v.population === null || !(v.population > 0)) return null
  // 정수로만 센다(× 1,000 ÷ 인구를 버림 → 10으로 나눔): 소수 곱셈의 어긋남이 버림을 틀리게 하지 않는다
  return Math.floor(((v.medical + v.nearPoor) * 1000) / v.population) / 10
}

// 그 칸 값: 받았으면 그 값, 못 받았으면 화면에 '지난 값'으로 보이는 prev, 그것도 없으면 null
function valueOf<K extends SnapshotKey>(s: Snapshot, key: K): SnapshotValue<K> | null {
  const got = s[key] as Got<SnapshotValue<K>>
  if (got.ok) return got.v
  return got.prev ? got.prev.v : null
}

const yearOf = (day: string) => Number(day.slice(0, 4))
/** 사용승인 뒤 꽉 찬 햇수(오늘이 그해 승인일 앞이면 하나 덜) */
function fullYears(from: string, today: string): number {
  const years = yearOf(today) - yearOf(from) - (today.slice(5) < from.slice(5) ? 1 : 0)
  return Math.max(0, years)
}

/** 새로 연 경쟁 의원으로 보는 해: 그날 값에는 개설 연도만 있어 올해 − 3년부터 센다(그해가 일부만 3년 안이어도 센다) */
const NEW_OPEN_YEARS = 3
const GAP_WEEKDAYS = 6 // 월~토

/**
 * 그날 값에서 점수 세부 값(ScoreFacts)을 꺼낸다. 후보 줄(층·간판·위반)·매물·지금 의원 체외충격파 값은 부르는 쪽이 더한다
 */
export function snapshotFacts(s: Snapshot, today: string): ScoreFacts {
  const people = valueOf(s, 'people')
  const apts = valueOf(s, 'apts')
  const presale = valueOf(s, 'presale')
  const accidents = valueOf(s, 'accidents')
  const industry = valueOf(s, 'industry')
  const welfare = valueOf(s, 'welfare')
  const rivals = valueOf(s, 'rivals')
  const station = valueOf(s, 'station')
  const flow = valueOf(s, 'flow')
  const building = valueOf(s, 'building')

  const clinics = rivals?.filter((r) => r.kind !== 'korean') ?? null
  const eswt = clinics?.map((r) => r.eswt).filter((v): v is number => v !== null) ?? []
  let gapCells: number | null = null
  if (rivals) {
    const table = gapTable(rivals)
    if (table.counted > 0) gapCells = table.counts.reduce((n, row) => n + row.slice(0, GAP_WEEKDAYS).filter((c) => c === 0).length, 0)
  }

  return {
    areaM2: Math.PI * s.radiusM * s.radiusM,
    people: people ? { total: people.total, bands: people.bands, households: people.households } : null,
    apartments: apts ? apts.reduce((n, a) => n + a.households, 0) : null,
    presale: presale ? presale.reduce((n, p) => n + p.households, 0) : null,
    trend: valueOf(s, 'trend'),
    accidentSpots: accidents?.spots ?? null,
    industryEmployees: industry?.employees ?? null,
    schools: valueOf(s, 'schools'),
    seniorCenters: valueOf(s, 'seniors'),
    gyms: valueOf(s, 'gyms'),
    welfareRate: welfare ? welfareRate(welfare) : null,
    rivals: clinics?.length ?? null,
    newRivals: clinics ? clinics.filter((r) => r.openedYear !== null && r.openedYear >= yearOf(today) - NEW_OPEN_YEARS).length : null,
    gapCells,
    rivalEswt: eswt.length > 0 ? Math.floor(eswt.reduce((a, b) => a + b, 0) / eswt.length) : null,
    stationM: station?.distM ?? null,
    stops: valueOf(s, 'bus'),
    flow: flow?.total ?? null,
    elevators: building?.elevators ?? null,
    parking: building?.parking ?? null,
    buildingAge: building?.approvedOn ? fullYears(building.approvedOn, today) : null,
    pharmacies: valueOf(s, 'pharmacies'),
  }
}
