import { addDays, addMonths, addMonthsToDay, monthOf, todayInKorea } from '@/lib/analytics/dates'
import type {
  Point,
  Query,
  QueryReply,
  Rival,
  RivalKind,
  ScoreFacts,
  Snapshot,
  SnapshotKey,
  SnapshotValue,
  SourceId,
  Why,
} from '@/types/location'
import { distM, samplePoints, type LatLng } from './coords'
import { joinFlow, type BusFile, type FlowBusName, type FlowRailName, type FlowVolume, type RailFile, type TransitIndex } from './flow'
import { dongOf, dongShares, landCodes, rangeValue, sggsTouching, type Dong, type DongFile, type DongIndex, type DongIndexSgg, type DongShare } from './regions'
import { SNAPSHOT_KEYS } from './snapshot'

// 자료 모으기(specs/location TASK-25, design.md 4·5·6·8절, REQ-7908). 부르는 함수·파일 읽기를 밖에서 받는 순수 흐름이다 —
// 이 파일은 바깥을 직접 부르지 않는다(부르기는 deps.ask = POST /api/ai/location/query, 파일은 public/location/의 정적 파일).
//   collect(점, 범위, deps)   → 후보 그날 값(Snapshot 22칸). 저장 전에 mergeSnapshot(새 값, 옛 값) → fitSnapshot으로 줄인다(snapshot.ts)
//   collectScan(시군구, deps) → 동네 훑기 동마다 '훑기 ○' 세부 값(score.ts ScoreFacts). 저장하지 않는다
// 카카오 답은 그날 값에 넣지 않는다(ADR-044): k-point는 범위 법정동 코드·이름과 후보 지번(건축물대장 열쇠)을 알려고만 부르고
// 주소 글·좌표는 버린다. 장소 찾기(k-near·k-keyword)·주소 찾기(k-address)는 부르지 않는다(화면이 볼 때 부른다).
// 실패는 그 칸만 { ok: false, why }다: 열쇠 없음·활용신청 안 됨·바깥 실패는 답 코드 그대로, 던진 오류·틀린 답 모양은 failed,
// 좌표·정류장 파일이 없는 지역은 outside, 받았지만 자료가 없으면 none

// ── 정한 값(design.md 4·6절, '(Claude 판단)'은 고쳐도 된다) ─────────

/** 바깥 부르기·파일 읽기를 동시에 이만큼까지(design.md 14절 '동시에 4개') */
export const COLLECT_LIMIT = 4
/** 체외충격파 비급여 항목 코드 — app/api/ai/location/sources/nonpay.ts의 ESWT_ITEM과 같은 값(서버 전용 파일이라 불러오지 못해 여기 둔다, 확인할 것 2) */
export const ESWT_ITEM = 'MM045'
/** 법정동을 알려고 k-point를 부르는 표본 점 수(가운데부터, design.md 5절) */
export const KPOINT_MAX = 19
/** 이 거리 안 경쟁 의원은 같은 건물로 본다(flags.ts 위험 신호와 같은 30m) */
export const SAME_BUILDING_M = 30
/** 진료 시간 자료를 심평원 목록 의원에 맞추는 거리(app/api/ai/location/sources/clinicHours.ts MATCH_M과 같은 값) */
export const HOURS_MATCH_M = 50
/** 정류장 수를 세는 거리 */
export const BUS_NEAR_M = 400
/** 후보 건물 가게·약국을 보는 거리(상가정보) */
export const SHOP_NEAR_M = 30
/** 목록 한도(design.md 6절) */
export const APT_MAX = 60
export const PRESALE_MAX = 30
export const RIVAL_MAX = 80
export const HISTORY_MAX = 60
/** 실거래 ㎡당 평균은 지난 6달(이번 달은 아직 신고가 덜 들어와 뺀다) */
export const TRADE_MONTHS = 6
/** 입주 예정: 모집공고가 이 달 수 안인 단지에서 입주 연월이 이번 달 이후인 곳(Claude 판단 — 공고에서 입주까지 보통 2~3년) */
export const PRESALE_BACK_MONTHS = 36
/** 행정동 인구는 한 번에 40개 동까지(몸통 한도, design.md 4절) */
export const POP_DONGS_PER_ASK = 40
/** 인구 추세 첫 달(design.md 6절 '2022-10~ 해마다 10월') */
export const TREND_FIRST_YEAR = 2022
/** 개폐업은 3년, 자료가 이틀 늦다(watch.ts WATCH_LAG_DAYS와 같은 값) */
export const HISTORY_MONTHS = 36
export const HISTORY_LAG_DAYS = 2
/** 훑기 의원 찾기 반경 한도(hosp-list 몸통 r ≤ 20,000) */
export const SCAN_MAX_R = 20_000

// ── 받는 것 ──────────────────────────────────────────────

/** POST /api/ai/location/query 한 번(components/location/clients.ts). 던지면 그 칸은 failed */
export type Ask = (q: Query) => Promise<QueryReply>
/** 앱에 둔 파일 값 한 줄(소득·산업단지 고용, lib/location/data — TASK-30)과 그 기준 날짜 */
export type FileValue<T> = { v: T; asOf: string }
/** 진행: 끝난 칸 수 / 모든 칸 수(화면 `자료 {n}/{m}`) */
export type CollectProgress = { done: number; total: number }

export type CollectDeps = {
  ask: Ask
  /** /location/dongs/index.json */
  dongIndex: () => Promise<DongIndex>
  /** /location/dongs/<시군구 5자리>.json — 없으면 null */
  dongFile: (sgg: string) => Promise<DongFile | null>
  /** /location/transit/index.json */
  transitIndex: () => Promise<TransitIndex>
  /** /location/transit/bus/<시군구 5자리>.json — 없으면 null */
  busFile: (sgg: string) => Promise<BusFile | null>
  /** /location/transit/rail.json */
  railFile: () => Promise<RailFile>
  /** 시군구 평균 소득(lib/location/data income.json) — 그 시군구 줄이 없으면 null */
  income: (sgg: string) => Promise<FileValue<SnapshotValue<'income'>> | null>
  /** 시군구 산업단지 고용 인원(lib/location/data industry.json) — 없으면 null */
  industry: (sgg: string) => Promise<FileValue<SnapshotValue<'industry'>> | null>
  /** 받은 시각(ISO). Snapshot.at이고 한국 날짜(오늘)도 여기서 센다 */
  now: string
  onProgress?: (p: CollectProgress) => void
}

// ── 작은 도구 ────────────────────────────────────────────

type Res<T> = { ok: true; v: T; asOf: string } | { ok: false; why: Why }
const got = <T>(v: T, asOf: string): Res<T> => ({ ok: true, v, asOf })
const no = (why: Why): { ok: false; why: Why } => ({ ok: false, why })
const REPLY_CODES: readonly Why[] = ['no-key', 'not-applied', 'failed']

const round6 = (v: number) => Math.round(v * 1e6) / 1e6
const at6 = (p: LatLng): Point => ({ lat: round6(p.lat), lng: round6(p.lng) })
const centerOf = (d: Pick<Dong, 'center'>): LatLng => ({ lat: d.center[1], lng: d.center[0] })
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
/** 날짜 글자 가운데 가장 늦은 것('YYYY-MM-DD'는 글자 차례가 날짜 차례) */
const latest = (days: readonly string[]) => days.reduce((a, b) => (b > a ? b : a), '')
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 동시에 max개까지. 끝난 자리는 기다리던 일에 바로 넘긴다(넘기는 사이에 새 일이 끼어들어 max를 넘지 않게) */
function limiter(max: number) {
  let active = 0
  const waiting: (() => void)[] = []
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active < max) active += 1
    else await new Promise<void>((resolve) => waiting.push(resolve))
    try {
      return await work()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active -= 1
    }
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const words = (s: string) => s.split(/\s+/).filter((w) => w !== '')
/** 글자에 phrase의 낱말이 차례대로 붙어 있나('나래시 다솜구'는 '… 나래시 다솜구 …'에만 맞는다) */
function hasPhrase(text: string, phrase: string): boolean {
  const want = words(phrase)
  const got = words(text)
  if (want.length === 0) return false
  for (let i = 0; i + want.length <= got.length; i++) if (want.every((w, j) => got[i + j] === w)) return true
  return false
}
const lastWord = (s: string) => words(s).at(-1) ?? ''

/** 카카오 지번 주소 글 → 법정동(리) 이름: 끝의 번지·'산'을 떼고 남은 끝 낱말이 동·리·가·로로 끝나면 그것. 주소 글은 버린다 */
function bdongNameOf(jibun: string | null): string | null {
  const parts = words(jibun ?? '')
  while (parts.length > 0 && /^(?:산|산?\d+(?:-\d+)?)$/.test(parts[parts.length - 1])) parts.pop()
  const last = parts.at(-1)
  return parts.length >= 2 && last !== undefined && /[동리가로]$/.test(last) ? last : null
}

// ── 답 값 읽기(app/api/ai/location/sources/*.ts가 돌려주는 모양 — 서버 전용 파일이라 타입을 불러오지 않고 여기서 본다) ──

const BAD = Symbol('bad')
type Bad = typeof BAD
type Is = (v: unknown) => boolean
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr: Is = (v) => typeof v === 'string'
const isNum: Is = (v) => typeof v === 'number' && Number.isFinite(v)
const isInt: Is = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const isBool: Is = (v) => typeof v === 'boolean'
const orNull =
  (is: Is): Is =>
  (v) =>
    v === null || is(v)
const isPoint: Is = (v) => isObj(v) && isNum(v.lat) && isNum(v.lng)
const isWeek: Is = (v) =>
  v === null || (Array.isArray(v) && v.length === 8 && v.every((x) => x === null || (Array.isArray(x) && x.length === 2 && x.every(isInt))))

/** 정해 둔 칸만 골라 담는다(다른 칸은 버린다). 칸 하나라도 틀리면 BAD */
function rec<T>(v: unknown, spec: Readonly<Record<string, Is>>): T | Bad {
  if (!isObj(v)) return BAD
  const out: Record<string, unknown> = {}
  for (const [key, is] of Object.entries(spec)) {
    if (!is(v[key])) return BAD
    out[key] = v[key]
  }
  return out as T
}
function listOf<T>(v: unknown, item: (x: unknown) => T | Bad): T[] | Bad {
  if (!Array.isArray(v)) return BAD
  const out: T[] = []
  for (const x of v) {
    const y = item(x)
    if (y === BAD) return BAD
    out.push(y)
  }
  return out
}
const inside = (v: unknown, key: string): unknown => (isObj(v) ? v[key] : undefined)

type Lot = { bcode: string; main: number; sub: number; san: boolean }
type Spot = { jibun: string | null; bjd: string | null; lot: Lot | null }
type Bands = { dong: string; bands: number[] }
type Households = { dong: string; households: number }
type Deal = { bdongName: string; m2: number; won: number }
type Complex = { code: string; name: string }
type AptInfo = { name: string; households: number | null; builtYear: number | null } | null
type PresaleItem = { name: string; households: number | null; moveIn: string | null; address: string }
type Place = { name: string; lat: number; lng: number }
type GymPlace = Place & { status: string }
type AccidentSpot = Place & { cases: number }
type HospItem = { ykiho: string; name: string; kind: string; doctors: number | null; openedOn: string | null; at: Point; distM: number }
type HospDetail = { mri: boolean; ct: boolean; therapists: number | null }
type ClinicHours = { name: string; at: Point; week: Rival['week'] }
type LicenseItem = { name: string; dept: string; openedOn: string | null; closedOn: string | null; point: Point }
type Title = Omit<SnapshotValue<'building'>, 'floors'> & { pk: string }
type Floor = { pk: string; label: string; usage: string; m2: number }
type Welfare = { sggName: string; ym: string; medical: number; basic: number; nearPoor: number } | null

const LOT = (v: unknown) => v === null || rec<Lot>(v, { bcode: isStr, main: isInt, sub: isInt, san: isBool }) !== BAD
const READ = {
  spot: (v: unknown) => rec<Spot>(v, { jibun: orNull(isStr), bjd: orNull(isStr), lot: LOT }),
  bands: (v: unknown) => listOf(v, (x) => rec<Bands>(x, { dong: isStr, bands: (b) => Array.isArray(b) && b.length === 11 && b.every(isInt) })),
  households: (v: unknown) => listOf(v, (x) => rec<Households>(x, { dong: isStr, households: isInt })),
  volume: (v: unknown): FlowVolume | Bad => {
    const rows = listOf(inside(v, 'rows'), (x) =>
      rec<FlowVolume['rows'][number]>(x, { id: isStr, mode: (m) => m === 'bus' || m === 'rail', board: isInt, alight: isInt, days: isInt }),
    )
    const ym = inside(v, 'ym')
    if (rows === BAD || typeof ym !== 'string') return BAD
    return { ym, rows: rows.filter((r) => r.days > 0) } // 날 수 0인 줄은 하루 평균을 낼 수 없어 뺀다
  },
  busNames: (v: unknown) => listOf(v, (x) => rec<FlowBusName>(x, { id: isStr, name: isStr, ars: orNull(isStr) })),
  railNames: (v: unknown) => listOf(v, (x) => rec<FlowRailName>(x, { id: isStr, name: isStr, line: isStr })),
  deals: (v: unknown) => listOf(inside(v, 'deals'), (x) => rec<Deal>(x, { bdongName: isStr, m2: isNum, won: isNum })),
  complexes: (v: unknown) => listOf(inside(v, 'complexes'), (x) => rec<Complex>(x, { code: isStr, name: isStr })),
  aptInfo: (v: unknown): AptInfo | Bad => (v === null ? null : rec<NonNullable<AptInfo>>(v, { name: isStr, households: orNull(isInt), builtYear: orNull(isInt) })),
  presale: (v: unknown) =>
    listOf(inside(v, 'items'), (x) => rec<PresaleItem>(x, { name: isStr, households: orNull(isInt), moveIn: orNull(isStr), address: isStr })),
  places: (v: unknown) => listOf(inside(v, 'items'), (x) => rec<Place>(x, { name: isStr, lat: isNum, lng: isNum })),
  gyms: (v: unknown) => listOf(inside(v, 'items'), (x) => rec<GymPlace>(x, { name: isStr, lat: isNum, lng: isNum, status: isStr })),
  accidents: (v: unknown) => listOf(inside(v, 'items'), (x) => rec<AccidentSpot>(x, { name: isStr, lat: isNum, lng: isNum, cases: isInt })),
  stores: (v: unknown): { floors: string[]; pharmacies: number } | Bad => {
    const floors = listOf(inside(v, 'stores'), (x) => (isObj(x) && isStr(x.floor) ? (x.floor as string) : BAD))
    const pharmacies = inside(v, 'pharmacies')
    return floors === BAD || !isInt(pharmacies) ? BAD : { floors, pharmacies: pharmacies as number }
  },
  hospList: (v: unknown) =>
    listOf(inside(v, 'items'), (x) =>
      rec<HospItem>(x, { ykiho: isStr, name: isStr, kind: isStr, doctors: orNull(isInt), openedOn: orNull(isStr), at: isPoint, distM: isInt }),
    ),
  hospDetail: (v: unknown) => rec<HospDetail>(v, { mri: isBool, ct: isBool, therapists: orNull(isInt) }),
  nonpay: (v: unknown) => listOf(inside(v, 'rows'), (x) => rec<{ name: string; won: number }>(x, { name: isStr, won: isInt })),
  hours: (v: unknown) => listOf(v, (x) => rec<ClinicHours>(x, { name: isStr, at: isPoint, week: isWeek })),
  license: (v: unknown) =>
    listOf(inside(v, 'rows'), (x) =>
      rec<LicenseItem>(x, { name: isStr, dept: isStr, openedOn: orNull(isStr), closedOn: orNull(isStr), point: isPoint }),
    ),
  titles: (v: unknown) =>
    listOf(inside(v, 'buildings'), (x) =>
      rec<Title>(x, {
        pk: isStr,
        usage: isStr,
        structure: isStr,
        above: isInt,
        below: isInt,
        totalM2: isNum,
        approvedOn: orNull(isStr),
        elevators: orNull(isInt),
        parking: orNull(isInt),
      }),
    ),
  floors: (v: unknown) => listOf(inside(v, 'floors'), (x) => rec<Floor>(x, { pk: isStr, label: isStr, usage: isStr, m2: isNum })),
  welfare: (v: unknown): Welfare | Bad =>
    v === null ? null : rec<NonNullable<Welfare>>(v, { sggName: isStr, ym: isStr, medical: isInt, basic: isInt, nearPoor: isInt }),
  fileValue: (v: unknown): FileValue<unknown> | null | Bad => (v === null ? null : isObj(v) && isStr(v.asOf) && 'v' in v ? (v as FileValue<unknown>) : BAD),
}

// ── 한 번 모으기의 바탕: 동시에 4개 · 같은 몸통·파일은 한 번 ───────

type Sido = { code2: string; name: string }
type Sgg = DongIndexSgg & { sido: Sido }
type Loaded<T> = { ok: true; v: T } | { ok: false }

function base(deps: CollectDeps) {
  const limit = limiter(COLLECT_LIMIT)
  const memo = new Map<string, Promise<unknown>>()
  const once = <T>(key: string, make: () => Promise<T>): Promise<T> => {
    let p = memo.get(key) as Promise<T> | undefined
    if (!p) {
      p = make()
      memo.set(key, p)
    }
    return p
  }

  /** 바깥 자료 하나. 같은 몸통은 한 번만 부른다. 틀린 답 모양·던짐은 failed */
  const ask = <T>(q: Query, read: (v: unknown) => T | Bad): Promise<Res<T>> =>
    once(`q ${JSON.stringify(q)}`, async (): Promise<Res<T>> => {
      let reply: QueryReply
      try {
        reply = await limit(() => deps.ask(q))
      } catch {
        return no('failed')
      }
      if (!isObj(reply)) return no('failed')
      if (!reply.ok) return no(REPLY_CODES.includes(reply.code) ? reply.code : 'failed')
      if (typeof reply.asOf !== 'string') return no('failed')
      let value: T | Bad
      try {
        value = read(reply.value)
      } catch {
        value = BAD
      }
      return value === BAD ? no('failed') : got(value, reply.asOf)
    })

  /** 파일 하나(없으면 v: null). 던지면 ok: false */
  const load = <T>(key: string, read: () => Promise<T | null>): Promise<Loaded<T | null>> =>
    once(`f ${key}`, async (): Promise<Loaded<T | null>> => {
      try {
        return { ok: true, v: (await limit(read)) ?? null }
      } catch {
        return { ok: false }
      }
    })

  const index = async (): Promise<Loaded<DongIndex>> => {
    const f = await load('dongs/index', deps.dongIndex)
    return f.ok && f.v !== null && isObj(f.v) && Array.isArray(f.v.sidos) ? { ok: true, v: f.v } : { ok: false }
  }
  const dongFile = (sgg: string) => load(`dongs/${sgg}`, () => deps.dongFile(sgg))
  const transit = async (): Promise<Loaded<TransitIndex>> => {
    const f = await load('transit/index', deps.transitIndex)
    return f.ok && f.v !== null && Array.isArray(f.v.sggs) ? { ok: true, v: f.v } : { ok: false }
  }
  const busFile = (sgg: string) => load(`transit/bus/${sgg}`, () => deps.busFile(sgg))
  const rail = async (): Promise<Loaded<RailFile>> => {
    const f = await load('transit/rail', deps.railFile)
    return f.ok && f.v !== null && Array.isArray(f.v.stations) ? { ok: true, v: f.v } : { ok: false }
  }
  const fileRow = async <T>(key: string, read: () => Promise<FileValue<T> | null>): Promise<Res<T>> => {
    const f = await load(key, read)
    if (!f.ok) return no('failed')
    const row = READ.fileValue(f.v)
    if (row === BAD) return no('failed')
    return row === null ? no('none') : got(row.v as T, row.asOf)
  }

  /** 행정동 10세 나이대(40개씩 나눠 부름). 받은 동만 담는다 */
  const popAge = async (codes: readonly string[], ym: string): Promise<Res<Map<string, number[]>>> => {
    const parts = await Promise.all(chunks(codes, POP_DONGS_PER_ASK).map((dongs) => ask({ kind: 'pop-age', dongs, ym }, READ.bands)))
    const out = new Map<string, number[]>()
    for (const part of parts) {
      if (!part.ok) return part
      for (const row of part.v) if (!out.has(row.dong)) out.set(row.dong, row.bands)
    }
    return got(out, latest(parts.map((p) => (p.ok ? p.asOf : ''))))
  }
  const households = async (codes: readonly string[], ym: string): Promise<Res<Map<string, number>>> => {
    const parts = await Promise.all(chunks(codes, POP_DONGS_PER_ASK).map((dongs) => ask({ kind: 'household', dongs, ym }, READ.households)))
    const out = new Map<string, number>()
    for (const part of parts) {
      if (!part.ok) return part
      for (const row of part.v) if (!out.has(row.dong)) out.set(row.dong, row.households)
    }
    return got(out, latest(parts.map((p) => (p.ok ? p.asOf : ''))))
  }

  const today = todayInKorea(new Date(deps.now))
  const thisMonth = monthOf(today)
  const lastMonth = addMonths(thisMonth, -1)

  /** 가장 새 인구 달: 지난달, 그 달 줄이 하나도 없으면 두 달 전 */
  const latestPop = (codes: readonly string[]) =>
    once(`latest ${codes.join(',')}`, async (): Promise<Res<{ ym: string; bands: Map<string, number[]> }>> => {
      for (const ym of [lastMonth, addMonths(lastMonth, -1)]) {
        const pop = await popAge(codes, ym)
        if (!pop.ok) return pop
        if (pop.v.size > 0) return got({ ym, bands: pop.v }, pop.asOf)
      }
      return no('none')
    })

  /** 2022-10부터 upTo까지 해마다 10월 */
  const octobers = (upTo: string) => {
    const out: string[] = []
    for (let y = TREND_FIRST_YEAR; `${y}-10` <= upTo; y++) out.push(`${y}-10`)
    return out
  }

  const sggList = (idx: DongIndex): Sgg[] =>
    idx.sidos.flatMap((sido) => sido.sggs.map((s) => ({ ...s, sido: { code2: sido.code2, name: sido.name } })))
  const sggOfIndex = (idx: DongIndex, code5: string): Sgg | null => sggList(idx).find((s) => s.code5 === code5) ?? null
  const touching = (idx: DongIndex, c: LatLng, r: number): Sgg[] => {
    const all = sggList(idx)
    return sggsTouching(idx, c, r).flatMap((s) => all.filter((x) => x.code5 === s.code5).slice(0, 1))
  }

  const progress = (total: number) => {
    let done = 0
    return () => {
      done += 1
      deps.onProgress?.({ done, total })
    }
  }

  return { ask, index, dongFile, transit, busFile, rail, fileRow, popAge, households, latestPop, octobers, sggOfIndex, touching, today, thisMonth, lastMonth, progress }
}

type Base = ReturnType<typeof base>

/** 이을 수 있는 행정동 코드(못 이은 동·코드 모양이 틀린 동은 부르지 않는다) */
const codeOk = (d: Dong) => d.unmatched !== true && /^\d{10}$/.test(d.code10)

// 범위 안 정류장 수: 400m 네모에 닿는 시군구 가운데 정류장 파일이 있는 곳(이웃 시군구 포함), 같은 정류장 번호는 한 번
async function stopsNear(b: Base, idx: DongIndex, transit: TransitIndex, c: LatLng): Promise<Res<number> | null> {
  const sggs = b.touching(idx, c, BUS_NEAR_M).filter((s) => transit.sggs.includes(s.code5))
  if (sggs.length === 0) return null
  const files = await Promise.all(sggs.map((s) => b.busFile(s.code5)))
  const seen = new Set<string>()
  const days: string[] = []
  let count = 0
  for (const f of files) {
    if (!f.ok) return no('failed')
    if (f.v === null) continue
    days.push(f.v.asOf)
    for (const stop of f.v.stops) {
      if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng) || seen.has(stop.no)) continue
      if (distM(c, stop) > BUS_NEAR_M) continue
      seen.add(stop.no)
      count += 1
    }
  }
  return days.length === 0 ? null : got(count, latest(days))
}

function nearestStation(rail: RailFile, c: LatLng): { name: string; line: string; distM: number } | null {
  let best: { name: string; line: string; distM: number } | null = null
  for (const s of rail.stations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue
    const m = distM(c, s)
    if (best === null || m < best.distM) best = { name: s.name, line: s.line, distM: m }
  }
  return best
}

const RIVAL_KINDS: readonly RivalKind[] = ['ortho', 'pain', 'rehab', 'korean']
const isRivalKind = (k: string): k is RivalKind => (RIVAL_KINDS as readonly string[]).includes(k)
const hoursKey = (name: string) => name.replace(/\s+/g, '').replaceAll('의원', '')

/** 진료 시간 자료를 의원에 맞춘다: 이름(공백·'의원' 뺌)이 같고 50m 안, 여럿이면 가장 가까운 곳 */
function weekFor(item: { name: string; at: Point }, rows: readonly ClinicHours[]): Rival['week'] {
  const key = hoursKey(item.name)
  if (key === '') return null
  let best: ClinicHours | null = null
  let bestM = Infinity
  for (const row of rows) {
    if (hoursKey(row.name) !== key) continue
    const m = distM(item.at, row.at)
    if (m <= HOURS_MATCH_M && m < bestM) [best, bestM] = [row, m]
  }
  return best?.week ?? null
}

// 가게 층 차례: 지하 깊은 층 → 지상 낮은 층 → 옥탑 → 층 모름(건축물대장 층별개요와 같은 차례)
function floorRank(label: string): [number, number] {
  const below = /^지(\d+)$/.exec(label)
  if (below) return [0, -Number(below[1])]
  if (/^\d+$/.test(label)) return [1, Number(label)]
  const roof = /^옥탑(\d*)$/.exec(label)
  if (roof) return [2, Number(roof[1] || 1)]
  return [3, 0]
}

// ── collect ─────────────────────────────────────────────

const SRC: Readonly<Record<SnapshotKey, SourceId>> = {
  people: 'pop-age',
  trend: 'pop-age',
  flow: 'flow-volume',
  income: 'income',
  aptPrice: 'apt-trade',
  bizPrice: 'biz-trade',
  apts: 'apt-list',
  presale: 'presale',
  seniors: 'senior',
  gyms: 'gym',
  schools: 'school',
  accidents: 'accident',
  industry: 'industry',
  pharmacies: 'stores',
  rivals: 'hosp-list',
  history: 'clinic-license',
  station: 'rail-stations',
  bus: 'bus-stops',
  market: 'market',
  building: 'building',
  stores: 'stores',
  welfare: 'welfare',
}

type Region = {
  idx: DongIndex
  touching: Sgg[]
  home: Sgg | null
  homeDongs: Dong[]
  shares: DongShare[]
  codes: string[] // 범위 안 이을 수 있는 행정동
  unmatched: number // 범위 안 못 이은 동 수
}
type Bdong = { bjd: string; sgg: string; name: string | null }

/**
 * 후보 그날 값(design.md 6절)을 모은다. 칸마다 따로 받고(동시에 4개), 못 받은 칸은 { ok: false, why }다. 던지지 않는다
 * (잘못된 now만 던진다). 진행은 칸 하나가 끝날 때마다 { done, total: 22 }
 */
export async function collect(point: Point, radiusM: number, deps: CollectDeps): Promise<Snapshot> {
  const b = base(deps)
  const at = at6(point)
  const once = <T>(make: () => Promise<T>) => {
    let p: Promise<T> | undefined
    return () => (p ??= make())
  }

  const region = once(async (): Promise<Res<Region>> => {
    const idx = await b.index()
    if (!idx.ok) return no('failed')
    const touching = b.touching(idx.v, at, radiusM)
    const files = await Promise.all(touching.map((s) => b.dongFile(s.code5)))
    const bySgg = new Map<string, Dong[]>()
    for (const [i, f] of files.entries()) {
      if (!f.ok) return no('failed')
      bySgg.set(touching[i].code5, f.v?.dongs ?? [])
    }
    const all = [...bySgg.values()].flat()
    const homeDong = dongOf(at, all)
    const home =
      (homeDong && touching.find((s) => bySgg.get(s.code5)?.includes(homeDong))) ||
      touching.find(({ bbox: [w, s, e, n] }) => at.lng >= w && at.lng <= e && at.lat >= s && at.lat <= n) ||
      null
    const shares = dongShares(samplePoints(at, radiusM), all, radiusM)
    const byCode = new Map(all.map((d) => [d.code10, d] as const))
    const inRange = shares.map((s) => byCode.get(s.code10)).filter((d): d is Dong => d !== undefined)
    return got(
      {
        idx: idx.v,
        touching,
        home,
        homeDongs: home ? (bySgg.get(home.code5) ?? []) : [],
        shares,
        codes: inRange.filter(codeOk).map((d) => d.code10),
        unmatched: inRange.filter((d) => !codeOk(d)).length,
      },
      idx.v.asOf,
    )
  })

  // 범위 법정동: 표본 점 가운데 19개까지 k-point(주소 글·좌표는 버리고 법정동 코드·이름·후보 지번만 쓴다)
  const spots = once(async (): Promise<Res<Spot[]>> => {
    const replies = await Promise.all(samplePoints(at, radiusM).slice(0, KPOINT_MAX).map((p) => b.ask({ kind: 'k-point', at: at6(p) }, READ.spot)))
    const out: Spot[] = []
    for (const r of replies) {
      if (!r.ok) return r
      out.push(r.v)
    }
    return got(out, b.today)
  })
  const bdongs = once(async (): Promise<Res<Bdong[]>> => {
    const sp = await spots()
    if (!sp.ok) return sp
    const seen = new Set<string>()
    const out: Bdong[] = []
    for (const s of sp.v) {
      if (s.bjd === null || !/^\d{10}$/.test(s.bjd) || seen.has(s.bjd)) continue
      seen.add(s.bjd)
      out.push({ bjd: s.bjd, sgg: s.bjd.slice(0, 5), name: bdongNameOf(s.jibun) })
    }
    return got(out, sp.asOf)
  })
  // 시군구마다 범위 법정동 이름(실거래·입주 예정 거르기)
  const namesBySgg = (list: readonly Bdong[]) => {
    const out = new Map<string, Set<string>>()
    for (const x of list) {
      if (x.name === null) continue
      const set = out.get(x.sgg) ?? new Set<string>()
      set.add(x.name)
      out.set(x.sgg, set)
    }
    return out
  }

  const withRegion = async <T>(make: (r: Region) => Promise<Res<T>>): Promise<Res<T>> => {
    const r = await region()
    return r.ok ? make(r.v) : r
  }
  const withHome = <T>(make: (r: Region, home: Sgg) => Promise<Res<T>>) =>
    withRegion((r) => (r.home ? make(r, r.home) : Promise.resolve(no('outside'))))

  const trades = (kind: 'apt-trade' | 'biz-trade') => async (): Promise<Res<{ perM2: number; deals: number }>> => {
    const ld = await bdongs()
    if (!ld.ok) return ld
    const names = namesBySgg(ld.v)
    if (names.size === 0) return no('none')
    const months = Array.from({ length: TRADE_MONTHS }, (_, i) => addMonths(b.thisMonth, i - TRADE_MONTHS))
    const asks = [...names.keys()].flatMap((sgg) => months.map((ym) => ({ sgg, reply: b.ask({ kind, sgg, ym }, READ.deals) })))
    const replies = await Promise.all(asks.map((a) => a.reply))
    const perM2: number[] = []
    for (const [i, r] of replies.entries()) {
      if (!r.ok) return r
      const want = names.get(asks[i].sgg) ?? new Set<string>()
      for (const deal of r.v) if (deal.m2 > 0 && want.has(lastWord(deal.bdongName))) perM2.push(deal.won / deal.m2)
    }
    if (perM2.length === 0) return no('none')
    return got({ perM2: Math.floor(sum(perM2) / perM2.length), deals: perM2.length }, latest(replies.map((r) => (r.ok ? r.asOf : ''))))
  }

  // 시군구 이름으로 받는 시설: 범위 네모에 닿는 시군구마다 받아 같은 곳(이름·점)은 한 번
  const facility = async <P extends Place>(make: (s: Sgg) => Promise<Res<P[]>>): Promise<Res<P[]>> =>
    withRegion(async (r) => {
      const replies = await Promise.all(r.touching.map(make))
      const seen = new Set<string>()
      const out: P[] = []
      for (const reply of replies) {
        if (!reply.ok) return reply
        for (const p of reply.v) {
          const key = `${p.name}|${p.lat}|${p.lng}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push(p)
        }
      }
      return got(out, latest(replies.map((x) => (x.ok ? x.asOf : ''))))
    })
  const within = (p: LatLng) => distM(at, p) <= radiusM
  const count = async <P extends Place>(list: Res<P[]>, keep: (p: P) => boolean = () => true): Promise<Res<number>> =>
    list.ok ? got(list.v.filter((p) => keep(p) && within(p)).length, list.asOf) : list

  const seniors = once(() => facility((s) => b.ask({ kind: 'senior', sggName: s.name }, READ.places)))
  const gyms = once(() => facility((s) => b.ask({ kind: 'gym', sggName: s.name }, READ.gyms)))
  const schools = once(() => facility((s) => b.ask({ kind: 'school', sggName: s.name }, READ.places)))
  const markets = once(() => facility((s) => b.ask({ kind: 'market', sggName: s.name }, READ.places)))
  const accidents = once(() => facility((s) => b.ask({ kind: 'accident', sidoName: s.sido.name, sggName: s.name }, READ.accidents)))
  const shops = once(() => b.ask({ kind: 'stores', at, r: SHOP_NEAR_M }, READ.stores))

  const fields: { [K in SnapshotKey]: () => Promise<Res<SnapshotValue<K>>> } = {
    people: () =>
      withRegion(async (r) => {
        if (r.shares.length === 0) return no('outside')
        if (r.codes.length === 0) return no('none')
        const pop = await b.latestPop(r.codes)
        if (!pop.ok) return pop
        const hh = await b.households(r.codes, pop.v.ym)
        if (!hh.ok) return hh
        const bands = pop.v.bands
        const of = (value: (code: string) => number | undefined) => rangeValue(r.shares, Object.fromEntries(r.codes.map((c) => [c, value(c)])))
        return got(
          {
            total: of((c) => {
              const x = bands.get(c)
              return x ? sum(x) : undefined
            }),
            bands: Array.from({ length: 11 }, (_, i) => of((c) => bands.get(c)?.[i])),
            households: of((c) => hh.v.get(c)),
            unmatched: r.unmatched,
          },
          pop.asOf,
        )
      }),

    trend: () =>
      withRegion(async (r) => {
        if (r.codes.length === 0) return no(r.shares.length === 0 ? 'outside' : 'none')
        const pop = await b.latestPop(r.codes)
        const months = b.octobers(pop.ok ? pop.v.ym : b.lastMonth)
        const years = await Promise.all(months.map((ym) => b.popAge(r.codes, ym)))
        const out: { ym: string; total: number }[] = []
        for (const [i, y] of years.entries()) {
          if (!y.ok) return y
          if (y.v.size === 0) continue
          out.push({ ym: months[i], total: rangeValue(r.shares, Object.fromEntries([...y.v].map(([c, bands]) => [c, sum(bands)]))) })
        }
        return out.length === 0 ? no('none') : got(out, latest(years.map((y) => (y.ok ? y.asOf : ''))))
      }),

    // 사람 흐름: 후보 시군구 지난달(그 달 줄이 없으면 두 달 전) → flow-bus·flow-rail로 이름 → 좌표 파일로 잇기(flow.ts)
    flow: () =>
      withHome(async (_r, home) => {
        const transit = await b.transit()
        if (!transit.ok) return no('failed')
        if (!transit.v.sggs.includes(home.code5)) return no('outside')
        const bus = await b.busFile(home.code5)
        if (!bus.ok) return no('failed')
        if (bus.v === null) return no('outside')
        if (!home.code5.startsWith(home.sido.code2)) return no('failed')
        const [busNames, railNames, rail] = await Promise.all([
          b.ask({ kind: 'flow-bus', sgg: home.code5 }, READ.busNames),
          b.ask({ kind: 'flow-rail', sgg: home.code5 }, READ.railNames),
          b.rail(),
        ])
        if (!busNames.ok) return busNames
        if (!railNames.ok) return railNames
        for (const ym of [b.lastMonth, addMonths(b.lastMonth, -1)]) {
          const volume = await b.ask({ kind: 'flow-volume', sido: home.sido.code2, sgg: home.code5, ym }, READ.volume)
          if (!volume.ok) return volume
          const joined = joinFlow({
            at,
            radiusM,
            volume: volume.v,
            busNames: busNames.v,
            railNames: railNames.v,
            bus: bus.v,
            rail: rail.ok ? rail.v : null,
          })
          if (joined.ok) return got(joined.v, volume.asOf)
          if (joined.why === 'outside') return no('outside')
        }
        return no('none')
      }),

    income: () => withHome((_r, home) => b.fileRow(`income/${home.code5}`, () => deps.income(home.code5))),
    industry: () => withHome((_r, home) => b.fileRow(`industry/${home.code5}`, () => deps.industry(home.code5))),
    aptPrice: trades('apt-trade'),
    bizPrice: trades('biz-trade'),

    // 아파트: 범위 법정동마다 단지 목록 → 단지마다 기본 정보(가까운 법정동부터 60곳까지). 세대 수가 없는 단지는 거른다
    apts: async () => {
      const ld = await bdongs()
      if (!ld.ok) return ld
      const lists = await Promise.all(ld.v.map((x) => b.ask({ kind: 'apt-list', bjd: x.bjd }, READ.complexes)))
      const seen = new Set<string>()
      const complexes: (Complex & { bdongName: string })[] = []
      for (const [i, list] of lists.entries()) {
        if (!list.ok) return list
        for (const c of list.v) {
          if (seen.has(c.code) || !/^[A-Za-z0-9]{1,20}$/.test(c.code)) continue
          seen.add(c.code)
          complexes.push({ ...c, bdongName: ld.v[i].name ?? '' })
        }
      }
      const picked = complexes.slice(0, APT_MAX)
      const infos = await Promise.all(picked.map((c) => b.ask({ kind: 'apt-info', complex: c.code }, READ.aptInfo)))
      const out: SnapshotValue<'apts'> = []
      for (const [i, info] of infos.entries()) {
        if (!info.ok) return info
        const v = info.v
        if (v === null || v.households === null || v.households <= 0) continue
        out.push({ name: v.name || picked[i].name, households: v.households, builtYear: v.builtYear, bdongName: picked[i].bdongName })
      }
      return got(out, latest([...lists, ...infos].map((x) => (x.ok ? x.asOf : ''))))
    },

    // 입주 예정: 후보 시도의 모집공고(지난 3년~이번 달) 가운데 입주 연월이 이번 달 이후이고, 주소가 범위 법정동(그 시군구)인 단지
    presale: () =>
      withHome(async (r, home) => {
        const ld = await bdongs()
        if (!ld.ok) return ld
        const names = namesBySgg(ld.v)
        const reply = await b.ask({ kind: 'presale', sidoName: home.sido.name, from: addMonths(b.thisMonth, -PRESALE_BACK_MONTHS), to: b.thisMonth }, READ.presale)
        if (!reply.ok) return reply
        const places = [...names].flatMap(([sgg, set]) => {
          const sggName = b.sggOfIndex(r.idx, sgg)?.name
          return sggName ? [{ sggName, set }] : []
        })
        const inRange = (address: string) => {
          const ws = words(address)
          return places.some((p) => hasPhrase(address, p.sggName) && ws.some((w) => p.set.has(w)))
        }
        const out = reply.v
          .filter((x): x is PresaleItem & { households: number; moveIn: string } =>
            x.households !== null && x.households > 0 && x.moveIn !== null && /^\d{4}-\d{2}$/.test(x.moveIn) && x.moveIn >= b.thisMonth && inRange(x.address),
          )
          .sort((x, y) => byName(x.moveIn, y.moveIn) || byName(x.name, y.name))
          .slice(0, PRESALE_MAX)
          .map((x) => ({ name: x.name, households: x.households, moveIn: x.moveIn }))
        return got(out, reply.asOf)
      }),

    seniors: async () => count(await seniors()),
    gyms: async () => count(await gyms(), (g) => g.status === 'open'), // 휴업 중인 곳은 세지 않는다
    schools: async () => count(await schools()),
    accidents: async () => {
      const list = await accidents()
      if (!list.ok) return list
      const kept = list.v.filter(within)
      return got({ spots: kept.length, cases: sum(kept.map((x) => x.cases)) }, list.asOf)
    },
    pharmacies: async () => {
      const s = await shops()
      return s.ok ? got(s.v.pharmacies, s.asOf) : s
    },

    // 경쟁 의원: 정형외과·마취통증·재활(의원) + 한의원, 가까운 차례 80곳. 의원은 상세(MRI·CT·물리치료사)·체외충격파 값을 붙인다
    // (한의원은 상세를 부르지 않는다). 상세·값·진료 시간은 못 받아도 그 칸만 null(목록은 그대로)
    rivals: async () => {
      const [clinic, korean] = await Promise.all([
        b.ask({ kind: 'hosp-list', at, r: radiusM, group: 'clinic' }, READ.hospList),
        b.ask({ kind: 'hosp-list', at, r: radiusM, group: 'korean' }, READ.hospList),
      ])
      if (!clinic.ok) return clinic
      if (!korean.ok) return korean
      // 같은 기관 기호는 한 번(의원 목록이 먼저)
      const byYkiho = new Map<string, HospItem & { kind: RivalKind }>()
      for (const x of [...clinic.v, ...korean.v]) {
        if (isRivalKind(x.kind) && x.distM <= radiusM && !byYkiho.has(x.ykiho)) byYkiho.set(x.ykiho, { ...x, kind: x.kind })
      }
      const items = [...byYkiho.values()].sort((x, y) => x.distM - y.distM || byName(x.name, y.name)).slice(0, RIVAL_MAX)
      const hours = await b.ask({ kind: 'hosp-hours', at }, READ.hours)
      const hourRows = hours.ok ? hours.v : []
      const out = await Promise.all(
        items.map(async (x): Promise<Rival> => {
          const korean = x.kind === 'korean'
          const [detail, price] = korean
            ? [null, null]
            : await Promise.all([b.ask({ kind: 'hosp-detail', ykiho: x.ykiho }, READ.hospDetail), b.ask({ kind: 'nonpay', ykiho: x.ykiho, item: ESWT_ITEM }, READ.nonpay)])
          const d = detail?.ok ? detail.v : null
          const prices = price?.ok ? price.v.map((p) => p.won) : []
          const year = x.openedOn !== null && /^\d{4}/.test(x.openedOn) ? Number(x.openedOn.slice(0, 4)) : null
          return {
            name: x.name,
            kind: x.kind,
            doctors: x.doctors,
            therapists: d?.therapists ?? null,
            mri: d?.mri ?? null,
            ct: d?.ct ?? null,
            openedYear: year,
            distM: x.distM,
            sameBuilding: x.distM <= SAME_BUILDING_M,
            week: weekFor(x, hourRows),
            eswt: prices.length > 0 ? Math.min(...prices) : null, // 한 의원이 여러 줄이면 가장 싼 값(1회 기본 값)
          }
        }),
      )
      return got(out, latest([clinic.asOf, korean.asOf]))
    },

    // 3년 개폐업: 이틀 전까지 3년 기간을 개업·폐업 한 번씩, 범위 안 의원(과목 상관없음)
    history: async () => {
      const to = addDays(b.today, -HISTORY_LAG_DAYS)
      const from = addDays(addMonthsToDay(to, -HISTORY_MONTHS), 1)
      const [opened, closed] = await Promise.all([
        b.ask({ kind: 'clinic-license', event: 'open', from, to }, READ.license),
        b.ask({ kind: 'clinic-license', event: 'close', from, to }, READ.license),
      ])
      if (!opened.ok) return opened
      if (!closed.ok) return closed
      const rows = [
        ...opened.v.map((x) => ({ kind: 'open' as const, x, on: x.openedOn })),
        ...closed.v.map((x) => ({ kind: 'close' as const, x, on: x.closedOn })),
      ].flatMap(({ kind, x, on }) => {
        if (on === null) return []
        const m = distM(at, x.point)
        return m <= radiusM ? [{ kind, name: x.name, dept: x.dept, on, distM: m }] : []
      })
      rows.sort((x, y) => x.distM - y.distM || byName(y.on, x.on))
      return got(rows.slice(0, HISTORY_MAX), latest([opened.asOf, closed.asOf]))
    },

    station: async () => {
      const rail = await b.rail()
      if (!rail.ok) return no('failed')
      const best = nearestStation(rail.v, at)
      return best ? got(best, rail.v.asOf) : no('none')
    },
    bus: async () => {
      const [idx, transit] = await Promise.all([b.index(), b.transit()])
      if (!idx.ok || !transit.ok) return no('failed')
      return (await stopsNear(b, idx.v, transit.v, at)) ?? no('outside')
    },
    market: async () => {
      const list = await markets()
      if (!list.ok) return list
      let best: { name: string; distM: number } | null = null
      for (const p of list.v) {
        const m = distM(at, p)
        if (best === null || m < best.distM) best = { name: p.name, distM: m }
      }
      return best ? got(best, list.asOf) : no('none')
    },

    // 건축물대장: 후보 점의 지번 → 열쇠(regions.ts landCodes) → 표제부 첫째 건물(주건축물·큰 연면적) + 그 건물 pk의 층만
    building: async () => {
      const sp = await spots()
      if (!sp.ok) return sp
      const lot = sp.v[0]?.lot ?? null
      const codes = lot ? landCodes(lot) : null
      if (codes === null) return no('none')
      const key = { sgg: codes.sigunguCd, bjdong: codes.bjdongCd, bun: codes.bun, ji: codes.ji, plat: codes.platGbCd }
      const [titles, floors] = await Promise.all([b.ask({ kind: 'bld-title', ...key }, READ.titles), b.ask({ kind: 'bld-floor', ...key }, READ.floors)])
      if (!titles.ok) return titles
      if (!floors.ok) return floors
      const first = titles.v[0]
      if (!first) return no('none')
      const { pk, ...title } = first
      return got(
        { ...title, floors: floors.v.filter((f) => f.pk === pk).map((f) => ({ label: f.label, usage: f.usage, m2: f.m2 })) },
        latest([titles.asOf, floors.asOf]),
      )
    },

    stores: async () => {
      const s = await shops()
      if (!s.ok) return s
      const counts = new Map<string, number>()
      for (const floor of s.v.floors) counts.set(floor, (counts.get(floor) ?? 0) + 1)
      const out = [...counts].map(([floor, n]) => ({ floor, count: n }))
      out.sort((x, y) => {
        const [a, c] = [floorRank(x.floor), floorRank(y.floor)]
        return a[0] - c[0] || a[1] - c[1]
      })
      return got(out, s.asOf)
    },

    // 의료급여·차상위: 후보 시군구 한 줄 + 비율 인구(그 판 연월 pop-age를 그 시군구 모든 행정동에 40개씩, 못 받으면 null)
    welfare: () =>
      withHome(async (r, home) => {
        const reply = await b.ask({ kind: 'welfare', sgg: home.code5 }, READ.welfare)
        if (!reply.ok) return reply
        const w = reply.v
        if (w === null) return no('none')
        const codes = r.homeDongs.filter(codeOk).map((d) => d.code10)
        const pop = codes.length > 0 && /^\d{4}-\d{2}$/.test(w.ym) ? await b.popAge(codes, w.ym) : no('none')
        const population = pop.ok && pop.v.size > 0 ? sum([...pop.v.values()].map(sum)) : null
        return got({ sggName: w.sggName, ym: w.ym, medical: w.medical, basic: w.basic, nearPoor: w.nearPoor, population }, reply.asOf)
      }),
  }

  const tick = b.progress(SNAPSHOT_KEYS.length)
  const entries = await Promise.all(
    SNAPSHOT_KEYS.map(async (key) => {
      let res: Res<unknown>
      try {
        res = await fields[key]()
      } catch {
        res = no('failed')
      }
      tick()
      const src = SRC[key]
      return [key, res.ok ? { ok: true, v: res.v, src, asOf: res.asOf } : { ok: false, why: res.why, src }] as const
    }),
  )
  return { v: 1, at: deps.now, radiusM, ...Object.fromEntries(entries) } as Snapshot
}

// ── 카카오 산업단지 찾기 결과 거르기(볼 때만 — 그날 값에 넣지 않는다) ──

/** 카카오 장소 하나(k-keyword 답의 places 한 줄 모양) */
export type KakaoPlaceLike = { name: string; category: string; at: Point; distM: number }

const PARK_WORD = /산업단지|농공단지|공업단지/
const PARK_NAME = /(?:산업단지|농공단지|공업단지|산단)$/
const NOT_PARK_CATEGORY = /^(?:교통|음식점|카페|편의점)/

/**
 * '산업단지' 키워드 찾기 결과에서 단지만 남긴다: 카카오 분류에 산업·농공·공업단지가 들었거나, 이름(괄호 뺌)이 단지 이름으로 끝나고
 * 분류가 교통·음식점·카페가 아닌 곳. 같은 이름은 처음(가까운) 것 하나. 분류 글 모양은 진짜 답으로 다시 본다(TASK-47)
 */
export function industryParks<T extends KakaoPlaceLike>(places: readonly T[]): T[] {
  const seen = new Set<string>()
  return places.filter((p) => {
    const name = p.name.replace(/\([^)]*\)/g, '').replace(/\s+/g, '')
    const segments = p.category.split('>').map((s) => s.trim())
    const isPark = segments.some((s) => PARK_WORD.test(s)) || (PARK_NAME.test(name) && !NOT_PARK_CATEGORY.test(segments[0] ?? ''))
    if (!isPark || seen.has(name)) return false
    seen.add(name)
    return true
  })
}

// ── collectScan(동네 훑기) ─────────────────────────────────

/** 훑기에서 받는 자료(design.md 8절 '훑기 ○'에 쓰는 것) */
export type ScanPart = 'people' | 'trend' | 'accidents' | 'schools' | 'seniors' | 'gyms' | 'industry' | 'rivals' | 'station' | 'bus'
export type ScanPartState = { ok: true; src: SourceId; asOf: string } | { ok: false; src: SourceId; why: Why }
/** 동 하나: 못 이은 동(unmatched)은 인구 값이 없다. facts는 score.ts scoreItems(facts, rule, 'scan')에 그대로 넣는다 */
export type ScanDong = { code10: string; name: string; unmatched: boolean; facts: ScoreFacts }
export type ScanResult =
  | { ok: true; at: string; sgg: string; sggName: string; sidoName: string; dongs: ScanDong[]; parts: Record<ScanPart, ScanPartState> }
  | { ok: false; why: 'outside' | 'failed' }

const SCAN_SRC: Readonly<Record<ScanPart, SourceId>> = {
  people: 'pop-age',
  trend: 'pop-age',
  accidents: 'accident',
  schools: 'school',
  seniors: 'senior',
  gyms: 'gym',
  industry: 'industry',
  rivals: 'hosp-list',
  station: 'rail-stations',
  bus: 'bus-stops',
}
const SCAN_PARTS = Object.keys(SCAN_SRC) as ScanPart[]

type ByDong<T> = Map<string, T>

/**
 * 동네 훑기 값: 그 시군구 동마다 범위 = 그 동(넓이·인구·동 안 의원·동 안 시설), 산업단지 고용은 그 시군구, 역·정류장은 동 가운데에서.
 * 흐름·의료급여·아파트·진료 시간·건물·카카오는 부르지 않는다(후보에서만). 자료 하나가 실패하면 그 값만 null, parts에 까닭
 */
export async function collectScan(sgg: string, deps: CollectDeps): Promise<ScanResult> {
  const b = base(deps)
  const idx = await b.index()
  if (!idx.ok) return { ok: false, why: 'failed' }
  const info = b.sggOfIndex(idx.v, sgg)
  if (!info) return { ok: false, why: 'outside' }
  const file = await b.dongFile(sgg)
  if (!file.ok) return { ok: false, why: 'failed' }
  if (file.v === null) return { ok: false, why: 'outside' }
  const dongs = file.v.dongs
  const codes = dongs.filter(codeOk).map((d) => d.code10)
  const polygons = dongs.filter((d) => d.rings !== null)
  const today = b.today

  // 점을 동에 넣어 센다(경계가 있는 동만, 경계 밖 점은 버림)
  const countIn = <P extends Place>(list: readonly P[], keep: (p: P) => boolean = () => true): ByDong<number> => {
    const out = new Map<string, number>(polygons.map((d) => [d.code10, 0]))
    for (const p of list) {
      if (!keep(p)) continue
      const d = dongOf(p, polygons)
      if (d) out.set(d.code10, (out.get(d.code10) ?? 0) + 1)
    }
    return out
  }
  const placeCount = async <P extends Place>(reply: Promise<Res<P[]>>, keep?: (p: P) => boolean): Promise<Res<ByDong<number>>> => {
    const r = await reply
    return r.ok ? got(countIn(r.v, keep), r.asOf) : r
  }

  const parts: { [K in ScanPart]: () => Promise<Res<unknown>> } = {
    people: async (): Promise<Res<ByDong<{ total: number; bands: number[]; households: number }>>> => {
      if (codes.length === 0) return no('none')
      const pop = await b.latestPop(codes)
      if (!pop.ok) return pop
      const hh = await b.households(codes, pop.v.ym)
      if (!hh.ok) return hh
      const out = new Map<string, { total: number; bands: number[]; households: number }>()
      for (const [code, bands] of pop.v.bands) {
        const households = hh.v.get(code)
        if (households !== undefined) out.set(code, { total: sum(bands), bands, households })
      }
      return got(out, pop.asOf)
    },
    trend: async (): Promise<Res<ByDong<{ ym: string; total: number }[]>>> => {
      if (codes.length === 0) return no('none')
      const pop = await b.latestPop(codes)
      const months = b.octobers(pop.ok ? pop.v.ym : b.lastMonth)
      const years = await Promise.all(months.map((ym) => b.popAge(codes, ym)))
      const out = new Map<string, { ym: string; total: number }[]>()
      for (const [i, y] of years.entries()) {
        if (!y.ok) return y
        for (const [code, bands] of y.v) out.set(code, [...(out.get(code) ?? []), { ym: months[i], total: sum(bands) }])
      }
      return out.size === 0 ? no('none') : got(out, latest(years.map((y) => (y.ok ? y.asOf : ''))))
    },
    accidents: () => placeCount(b.ask({ kind: 'accident', sidoName: info.sido.name, sggName: info.name }, READ.accidents)),
    schools: () => placeCount(b.ask({ kind: 'school', sggName: info.name }, READ.places)),
    seniors: () => placeCount(b.ask({ kind: 'senior', sggName: info.name }, READ.places)),
    gyms: () => placeCount(b.ask({ kind: 'gym', sggName: info.name }, READ.gyms), (g) => g.status === 'open'),
    industry: () => b.fileRow(`industry/${sgg}`, () => deps.industry(sgg)),
    // 시군구 네모 가운데에서 네모 모서리까지(20km 한도)로 한 번 찾아 동에 넣는다. 새 의원 = 개설일이 3년 안
    rivals: async (): Promise<Res<ByDong<{ rivals: number; newRivals: number }>>> => {
      const [w, s, e, n] = info.bbox
      const c = at6({ lat: (s + n) / 2, lng: (w + e) / 2 })
      const corner = Math.max(...[[w, s], [w, n], [e, s], [e, n]].map(([lng, lat]) => distM(c, { lat, lng })))
      const r = Math.max(1, Math.min(SCAN_MAX_R, Math.ceil(corner)))
      const list = await b.ask({ kind: 'hosp-list', at: c, r, group: 'clinic' }, READ.hospList)
      if (!list.ok) return list
      const since = addMonthsToDay(today, -HISTORY_MONTHS)
      const out = new Map<string, { rivals: number; newRivals: number }>(polygons.map((d) => [d.code10, { rivals: 0, newRivals: 0 }]))
      const seen = new Set<string>()
      for (const x of list.v) {
        if (x.kind === 'korean' || !isRivalKind(x.kind) || seen.has(x.ykiho)) continue
        seen.add(x.ykiho)
        const d = dongOf(x.at, polygons)
        const row = d ? out.get(d.code10) : undefined
        if (!row) continue
        row.rivals += 1
        if (x.openedOn !== null && x.openedOn >= since) row.newRivals += 1
      }
      return got(out, list.asOf)
    },
    station: async (): Promise<Res<ByDong<number>>> => {
      const rail = await b.rail()
      if (!rail.ok) return no('failed')
      const out = new Map<string, number>()
      for (const d of dongs) {
        const best = nearestStation(rail.v, centerOf(d))
        if (best) out.set(d.code10, best.distM)
      }
      return out.size === 0 ? no('none') : got(out, rail.v.asOf)
    },
    bus: async (): Promise<Res<ByDong<number>>> => {
      const transit = await b.transit()
      if (!transit.ok) return no('failed')
      const counted = await Promise.all(dongs.map((d) => stopsNear(b, idx.v, transit.v, centerOf(d))))
      const out = new Map<string, number>()
      const days: string[] = []
      for (const [i, c] of counted.entries()) {
        if (c === null) continue
        if (!c.ok) return c
        out.set(dongs[i].code10, c.v)
        days.push(c.asOf)
      }
      return out.size === 0 ? no('outside') : got(out, latest(days))
    },
  }

  const tick = b.progress(SCAN_PARTS.length)
  const results = Object.fromEntries(
    await Promise.all(
      SCAN_PARTS.map(async (part) => {
        let res: Res<unknown>
        try {
          res = await parts[part]()
        } catch {
          res = no('failed')
        }
        tick()
        return [part, res] as const
      }),
    ),
  ) as Record<ScanPart, Res<unknown>>

  const map = <T>(part: ScanPart) => {
    const r = results[part]
    return r.ok ? (r.v as ByDong<T>) : null
  }
  const people = map<{ total: number; bands: number[]; households: number }>('people')
  const trend = map<{ ym: string; total: number }[]>('trend')
  const rivals = map<{ rivals: number; newRivals: number }>('rivals')
  const station = map<number>('station')
  const bus = map<number>('bus')
  const industry = results.industry.ok ? (results.industry.v as SnapshotValue<'industry'>).employees : null
  const inPolygon = (part: ScanPart, d: Dong) => (d.rings === null ? null : (map<number>(part)?.get(d.code10) ?? null))

  const out: ScanDong[] = dongs.map((d) => {
    const linked = codeOk(d)
    const r = d.rings === null ? null : (rivals?.get(d.code10) ?? null)
    return {
      code10: d.code10,
      name: d.name,
      unmatched: !linked,
      facts: {
        areaM2: d.areaM2,
        people: linked ? (people?.get(d.code10) ?? null) : null,
        trend: linked ? (trend?.get(d.code10) ?? null) : null,
        accidentSpots: inPolygon('accidents', d),
        industryEmployees: industry,
        schools: inPolygon('schools', d),
        seniorCenters: inPolygon('seniors', d),
        gyms: inPolygon('gyms', d),
        rivals: r?.rivals ?? null,
        newRivals: r?.newRivals ?? null,
        stationM: station?.get(d.code10) ?? null,
        stops: bus?.get(d.code10) ?? null,
      },
    }
  })

  const partStates = Object.fromEntries(
    SCAN_PARTS.map((part) => {
      const r = results[part]
      const src = SCAN_SRC[part]
      return [part, r.ok ? { ok: true, src, asOf: r.asOf } : { ok: false, src, why: r.why }]
    }),
  ) as Record<ScanPart, ScanPartState>

  return { ok: true, at: deps.now, sgg, sggName: info.name, sidoName: info.sido.name, dongs: out, parts: partStates }
}
