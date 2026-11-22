import type { SupabaseClient } from '@supabase/supabase-js'
import { isYmd } from '@/lib/analytics/dates'
import { checkDeptRule, DEFAULT_DEPT_RULE, fillDeptRule } from '@/lib/location/depts'
import { checkScoreRule, fillScoreRule, DEFAULT_SCORE_RULE, type ScoreRule } from '@/lib/location/score'
import type { ErrorCode } from '@/types/errors'
import type {
  Candidate,
  CandidateStatus,
  DeptRule,
  Listing,
  LocationEvent,
  LocationNote,
  LocationPhoto,
  LocationSettings,
  RadiusM,
  Snapshot,
  SnapshotKey,
  WatchCandidate,
  WatchEvent,
  Why,
  YesNo,
} from '@/types/location'

// 입지 분석 저장 (specs/location REQ-7908·REQ-7913·REQ-7915·REQ-7919·REQ-7921, design.md 6·7·12·18절, ADR-047). 브라우저 → Supabase, 권한은 RLS가 막는다(ADR-004).
// 표 여섯 location_settings·location_candidates·location_listings·location_notes·location_photos·location_events와
// 비공개 사진 저장소 location-photos('<병원 id>/<후보 id>/<uuid>.jpg') (migration 20261122000000_location.sql).
// 보내는 몸통은 칸 권한에 있는 칸만 골라 새로 만든다({ ...받은 값 } 금지). id·hospital_id·시각은 DB가 정하고 어느 병원 줄인지는 RLS가 고른다.
// 카카오에서 받은 주소 글·좌표·장소·거리는 저장하지 않는다: 후보 몸통은 고른 점·적은 이름·적은 주소 글·범위·그날 값뿐이고,
// 그날 값은 정해 둔 칸 스물넷(행정동 place·견줄 값 sggAvg 포함)만 새로 담으며 카카오 출처(kakao-*) 칸이 있으면 보내지 않는다.
// 설정 줄의 과목 고르기(dept_rule)는 읽을 때 fillDeptRule을 거친다(칸이 없던 옛 줄·못 읽는 값은 처음 값).
// jsonb 칸 크기는 DB처럼 jsonb 글자(::text — 열쇠 뒤 ': '·항목 사이 ', ')의 바이트로 잰다(보통 범위의 숫자는 JSON과 글자가 같다).
// 받은 값이 DB 규칙을 어기면 보내지 않고 실패다. 읽은 줄은 모양을 믿지 않는다: 틀린 줄은 빼고(그날 값만 틀리면 그 칸만 비움),
// 목록은 1,000줄씩 끝까지 읽는다(쪽 하나라도 실패하면 반쪽 대신 실패).
// 실패는 LocationStorageError(번호만: 읽기 E-LOC-READ-FAILED · 저장·지우기 E-LOC-SAVE-FAILED · 사진 올리기 E-LOC-PHOTO)다.
// Supabase 오류 글·입력값은 담지 않는다(console도 없음)

export type LocationClient = Pick<SupabaseClient, 'from' | 'rpc' | 'storage'>
export type LocationStorageCode = Extract<ErrorCode, 'E-LOC-READ-FAILED' | 'E-LOC-SAVE-FAILED' | 'E-LOC-PHOTO'>

/** 오류에는 번호만 담는다 */
export class LocationStorageError extends Error {
  readonly code: LocationStorageCode

  constructor(code: LocationStorageCode) {
    super(code)
    this.name = 'LocationStorageError'
    this.code = code
  }
}

/** 설정 줄(점수 설정은 fillScoreRule, 과목 고르기는 fillDeptRule로 다 갖춘 모양). 줄이 없으면 처음 설정·updatedAt null */
export type SavedSettings = Omit<LocationSettings, 'scoreRule'> & { scoreRule: ScoreRule }
export type LocationData = {
  settings: SavedSettings
  candidates: Candidate[]
  listings: Listing[]
  notes: LocationNote[]
  photos: LocationPhoto[]
  events: LocationEvent[]
}
/** 후보 넣기: 고른 점·적은 이름·적은 주소 글·범위와 (있으면) 모은 그날 값. 받은 시각은 그날 값의 at */
export type CandidateNew = Pick<Candidate, 'name' | 'addressNote' | 'lat' | 'lng' | 'radiusM'> & { snapshot?: Snapshot | null }
/** 후보 고치기: 준 칸만 보낸다. snapshot을 주면 받은 시각(snapshot_at)도 그 at으로(null이면 둘 다 비움) */
export type CandidateChanges = Partial<Pick<Candidate, CandidateKey | 'snapshot'>>
export type ListingFields = Omit<Listing, 'id' | 'createdAt' | 'updatedAt'>
export type NoteFields = Pick<LocationNote, 'day' | 'body'>
export type PhotoFields = { label: string; takenOn: string }

export const LOCATION_PHOTO_BUCKET = 'location-photos'
export const LOCATION_PHOTO_MAX_BYTES = 3_000_000

const SETTINGS = 'location_settings'
const CANDIDATES = 'location_candidates'
const LISTINGS = 'location_listings'
const NOTES = 'location_notes'
const PHOTOS = 'location_photos'
const EVENTS = 'location_events'

const SETTINGS_COLUMNS = 'score_rule, dept_rule, home_eswt, updated_at'
const CANDIDATE_COLUMNS =
  'id, name, address_note, lat, lng, radius_m, status, floor_label, area_m2, sign_visible, violation, costs, terms, checks, open_on, tasks_done, snapshot, snapshot_at, watch_checked_on, created_at, updated_at'
const LISTING_COLUMNS =
  'id, candidate_id, title, url, area_m2, floor_label, deposit, rent, premium, mgmt, broker_id, broker_note, memo, lat, lng, created_at, updated_at'
const NOTE_COLUMNS = 'id, candidate_id, day, body, created_at'
const PHOTO_COLUMNS = 'id, candidate_id, path, label, taken_on, created_at'
const EVENT_COLUMNS = 'id, candidate_id, kind, clinic_name, dept, event_on, dist_m, seen_at, created_at'
// 알림 확인: 이름은 알림 아래 줄에, 그날 값은 place 칸 하나만(시도·시군구 이름 → 인허가 주소 앞부분, design.md 12절)
const WATCH_COLUMNS = 'id, name, status, lat, lng, radius_m, watch_checked_on, created_at, place:snapshot->place'
const EVENT_UNIQUE = 'candidate_id,kind,clinic_name,event_on' // 같은 줄은 한 번(on conflict do nothing — 넣기 권한만 씀)

const READ: LocationStorageCode = 'E-LOC-READ-FAILED'
const SAVE: LocationStorageCode = 'E-LOC-SAVE-FAILED'
const PHOTO: LocationStorageCode = 'E-LOC-PHOTO'

const PAGE_ROWS = 1000 // Supabase가 한 번에 주는 줄 수 기본값. 넘는 줄은 알리지 않고 잘라 주므로 쪽으로 나눠 다 읽는다
const ASC = { ascending: true }
const DESC = { ascending: false }
const JPEG_TYPE = 'image/jpeg'

// DB 제약(design.md 7절)
const RADII: readonly RadiusM[] = [300, 500, 700, 1000, 1500, 2000, 3000]
const STATUSES: readonly CandidateStatus[] = ['watching', 'contacted', 'visited', 'reviewing', 'dropped']
const YES_NO: readonly YesNo[] = ['yes', 'no', 'unknown']
const WHYS: readonly Why[] = ['no-key', 'not-applied', 'failed', 'none', 'outside']
const WON_MAX = 9_999_999_999
const AREA_MAX = 999_999.99 // numeric(8, 2)
const SNAPSHOT_MAX = 65_536
const COSTS_MAX = 2_000
const TERMS_MAX = 6_000
const CHECKS_MAX = 4_000
const TASKS_MAX = 2_000
const DIST_MAX = 3_000

// 그날 값 칸(design.md 6절). 빠지거나 더한 칸이 있으면 타입 검사가 막는다
const SNAPSHOT_KEYS = Object.keys({
  people: 1, trend: 1, flow: 1, income: 1, aptPrice: 1, bizPrice: 1, apts: 1, presale: 1, seniors: 1, gyms: 1, schools: 1, accidents: 1,
  industry: 1, pharmacies: 1, rivals: 1, place: 1, sggAvg: 1, history: 1, station: 1, bus: 1, market: 1, building: 1, stores: 1, welfare: 1,
} satisfies Record<SnapshotKey, 1>) as SnapshotKey[]
// 카카오 출처(SOURCES의 kakao-local·kakao-map). 카카오 답은 그날 값에 넣지 않는다(ADR-047)
const KAKAO_SOURCE = /^kakao-/

const UUID_TEXT = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID = new RegExp(`^${UUID_TEXT}$`) // DB가 만든 id·사진 자리 검사는 소문자만 받는다
const PHOTO_PATH = new RegExp(`^${UUID_TEXT}/(${UUID_TEXT})/${UUID_TEXT}\\.jpg$`)
const TIME = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/
const CONTROL = /\p{Cc}/u
const CONTROL_BUT_LINES = /(?![\n\r\t])\p{Cc}/u
const HTTPS = /^https:\/\/[^\s\p{Cc}]+$/u

type Row = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다
type Reply = { data?: unknown; error: unknown }

const stop = (code: LocationStorageCode): never => {
  throw new LocationStorageError(code)
}

/** 한 번 부르고 data를 준다. 오류 답·예외(연결 실패·빌더 실패)는 그 번호로 멈춘다 */
async function send(code: LocationStorageCode, request: () => PromiseLike<Reply>): Promise<unknown> {
  let reply: Reply
  try {
    reply = await request()
  } catch {
    return stop(code)
  }
  if (reply.error) return stop(code)
  return reply.data
}

/** 1,000줄씩 끝까지 읽는다. 쪽 하나라도 실패하거나 목록이 아니면 반쪽 목록 대신 실패 */
async function readAll(code: LocationStorageCode, page: (first: number, last: number) => PromiseLike<Reply>): Promise<unknown[]> {
  const rows: unknown[] = []
  for (;;) {
    const data = await send(code, () => page(rows.length, rows.length + PAGE_ROWS - 1))
    if (!Array.isArray(data)) return stop(code)
    rows.push(...data)
    if (data.length < PAGE_ROWS) return rows
  }
}

// 뒷정리(사진 파일 지우기)는 실패해도 결과를 바꾸지 않는다
async function quietly(work: () => Promise<unknown>): Promise<void> {
  try {
    await work()
  } catch {
    // 알리지 않는다
  }
}

// ── 값 검사 ────────────────────────────────────────────────

const BAD = Symbol('bad')
type Field = (value: unknown) => unknown // 맞으면 보낼 값, 아니면 BAD

const isRecord = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isFilled = (v: unknown): v is string => typeof v === 'string' && v !== ''
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const isDay = (v: unknown): v is string => typeof v === 'string' && isYmd(v)
const isTime = (v: unknown): v is string => typeof v === 'string' && TIME.test(v) && !Number.isNaN(Date.parse(v))
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const inRange = (v: unknown, min: number, max: number): v is number => isNumber(v) && v >= min && v <= max
const isWon = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= WON_MAX
const isOneOf = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T)
const orNull = (v: unknown, ok: (v: unknown) => boolean) => v === null || ok(v)

/** 앞뒤 빈칸을 빼고 NFC로 맞춘 min~max자 글(글자 수 = DB char_length). 한 줄 글은 제어 문자 없음, 여러 줄 글은 줄바꿈·탭만 됨 */
const text =
  (min: number, max: number, lines = false): Field =>
  (v) => {
    if (!isString(v)) return BAD
    const t = v.normalize('NFC').trim()
    const n = [...t].length
    return n >= min && n <= max && !(lines ? CONTROL_BUT_LINES : CONTROL).test(t) ? t : BAD
  }
const oneOf =
  <T>(list: readonly T[]): Field =>
  (v) =>
    isOneOf(list, v) ? v : BAD
const nullable =
  (field: Field): Field =>
  (v) =>
    v === null ? null : field(v)
const coord =
  (min: number, max: number): Field =>
  (v) =>
    inRange(v, min, max) ? v : BAD
const LAT = coord(33, 39)
const LNG = coord(124, 132)
const day: Field = (v) => (isDay(v) ? v : BAD)
const won: Field = (v) => (isWon(v) ? v : BAD)
const uuid: Field = (v) => (isUuid(v) ? v : BAD)
// ㎡ numeric(8, 2): 0보다 크고 소수 2자리까지(DB가 반올림하지 않게 더 긴 소수는 받지 않는다 — 버림은 area.ts가 한다)
const area: Field = (v) => (inRange(v, 0.01, AREA_MAX) && Number(v.toFixed(2)) === v ? v : BAD)
const httpsUrl: Field = (v) => {
  const t = text(0, 500)(v)
  return t === '' || (isString(t) && HTTPS.test(t)) ? t : BAD
}

/** jsonb 글자(::text)의 바이트 수. JSON으로 한 번 옮긴 값(undefined·함수 없음)을 받는다 */
function jsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(', ')}]`
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .map(([key, v]) => `${JSON.stringify(key)}: ${jsonbText(v)}`)
      .join(', ')}}`
  }
  return JSON.stringify(value)
}
const jsonbBytes = (value: unknown) => new TextEncoder().encode(jsonbText(value)).length

/** JSON으로 옮길 수 있는 값을 새로 만든다(못 옮기면 BAD) */
function jsonCopy(value: unknown): unknown {
  try {
    const t = JSON.stringify(value)
    return t === undefined ? BAD : (JSON.parse(t) as unknown)
  } catch {
    return BAD
  }
}
const jsonObject =
  (max: number): Field =>
  (v) => {
    const copy = isRecord(v) ? jsonCopy(v) : BAD
    return isRecord(copy) && jsonbBytes(copy) <= max ? copy : BAD
  }
const taskIds: Field = (v) => (Array.isArray(v) && v.every(isString) && jsonbBytes(v) <= TASKS_MAX ? [...v] : BAD)

// ── 그날 값 ────────────────────────────────────────────────

/** 그날 값 칸 하나(Got): 정해 둔 칸만 새로 담는다. 카카오 출처면 BAD */
function gotOf(raw: unknown): Row | typeof BAD {
  if (!isRecord(raw) || !isFilled(raw.src) || KAKAO_SOURCE.test(raw.src)) return BAD
  if (raw.ok === true) return raw.v !== undefined && isString(raw.asOf) ? { ok: true, v: raw.v, src: raw.src, asOf: raw.asOf } : BAD
  if (raw.ok !== false || !isOneOf(WHYS, raw.why)) return BAD
  if (raw.prev === undefined) return { ok: false, why: raw.why, src: raw.src }
  const prev = raw.prev
  if (!isRecord(prev) || prev.v === undefined || !isString(prev.asOf)) return BAD
  return { ok: false, why: raw.why, src: raw.src, prev: { v: prev.v, asOf: prev.asOf } }
}

/** 그날 값(design.md 6절): 판 1·받은 시각·범위와 칸 스물넷만 새로 담는다. 모양이 틀리거나 65,536바이트를 넘으면 BAD.
 * 칸 안 값의 모양은 모으기(lib/location/snapshot.ts checkSnapshot)가 본다 */
function snapshotOf(raw: unknown): Snapshot | typeof BAD {
  if (!isRecord(raw) || raw.v !== 1 || !isTime(raw.at) || !isOneOf(RADII, raw.radiusM)) return BAD
  const out: Row = { v: 1, at: raw.at, radiusM: raw.radiusM }
  for (const key of SNAPSHOT_KEYS) {
    const got = gotOf(raw[key])
    if (got === BAD) return BAD
    out[key] = got
  }
  const copy = jsonCopy(out)
  return isRecord(copy) && jsonbBytes(copy) <= SNAPSHOT_MAX ? (copy as Snapshot) : BAD
}

// ── 줄 읽기(읽기·넣기·고치기 답 같은 검사) ─────────────────

function toSettings(row: unknown): SavedSettings | null {
  if (!isRecord(row) || !isRecord(row.score_rule) || !orNull(row.home_eswt, isWon) || !isString(row.updated_at)) return null
  return {
    scoreRule: fillScoreRule(row.score_rule),
    deptRule: fillDeptRule(row.dept_rule),
    homeEswt: row.home_eswt as number | null,
    updatedAt: row.updated_at,
  }
}

function toCandidate(row: unknown): Candidate | null {
  if (!isRecord(row) || !isFilled(row.id)) return null
  const r = row
  const ok =
    isFilled(r.name) &&
    isString(r.address_note) &&
    inRange(r.lat, 33, 39) &&
    inRange(r.lng, 124, 132) &&
    isOneOf(RADII, r.radius_m) &&
    isOneOf(STATUSES, r.status) &&
    isString(r.floor_label) &&
    orNull(r.area_m2, isNumber) &&
    orNull(r.sign_visible, (v) => isOneOf(YES_NO, v)) &&
    orNull(r.violation, (v) => isOneOf(YES_NO, v)) &&
    isRecord(r.costs) &&
    isRecord(r.terms) &&
    isRecord(r.checks) &&
    orNull(r.open_on, isDay) &&
    Array.isArray(r.tasks_done) &&
    orNull(r.snapshot_at, isString) &&
    orNull(r.watch_checked_on, isDay) &&
    isString(r.created_at) &&
    isString(r.updated_at)
  if (!ok) return null
  const snapshot = r.snapshot === null ? null : snapshotOf(r.snapshot)
  return {
    id: row.id,
    name: r.name as string,
    addressNote: r.address_note as string,
    lat: r.lat as number,
    lng: r.lng as number,
    radiusM: r.radius_m as RadiusM,
    status: r.status as CandidateStatus,
    floorLabel: r.floor_label as string,
    areaM2: r.area_m2 as number | null,
    signVisible: r.sign_visible as YesNo | null,
    violation: r.violation as YesNo | null,
    costs: r.costs as Row,
    terms: r.terms as Row,
    checks: r.checks as Row,
    openOn: r.open_on as string | null,
    tasksDone: (r.tasks_done as unknown[]).filter(isString),
    snapshot: snapshot === BAD ? null : snapshot,
    snapshotAt: r.snapshot_at as string | null,
    watchCheckedOn: r.watch_checked_on as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

function toListing(row: unknown): Listing | null {
  if (!isRecord(row) || !isFilled(row.id)) return null
  const r = row
  const ok =
    orNull(r.candidate_id, isFilled) &&
    isFilled(r.title) &&
    isString(r.url) &&
    orNull(r.area_m2, isNumber) &&
    isString(r.floor_label) &&
    [r.deposit, r.rent, r.premium, r.mgmt].every((v) => orNull(v, isWon)) &&
    orNull(r.broker_id, isFilled) &&
    isString(r.broker_note) &&
    isString(r.memo) &&
    orNull(r.lat, isNumber) &&
    orNull(r.lng, isNumber) &&
    isString(r.created_at) &&
    isString(r.updated_at)
  if (!ok) return null
  return {
    id: row.id,
    candidateId: r.candidate_id as string | null,
    title: r.title as string,
    url: r.url as string,
    areaM2: r.area_m2 as number | null,
    floorLabel: r.floor_label as string,
    deposit: r.deposit as number | null,
    rent: r.rent as number | null,
    premium: r.premium as number | null,
    mgmt: r.mgmt as number | null,
    brokerId: r.broker_id as string | null,
    brokerNote: r.broker_note as string,
    memo: r.memo as string,
    lat: r.lat as number | null,
    lng: r.lng as number | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

function toNote(row: unknown): LocationNote | null {
  if (!isRecord(row)) return null
  const { id, candidate_id: candidateId, day: noteDay, body, created_at: createdAt } = row
  if (!isFilled(id) || !isFilled(candidateId) || !isDay(noteDay) || !isFilled(body) || !isString(createdAt)) return null
  return { id, candidateId, day: noteDay, body, createdAt }
}

/** 사진 줄: 자리의 둘째 폴더가 그 줄의 후보여야 한다 */
function toPhoto(row: unknown): LocationPhoto | null {
  if (!isRecord(row)) return null
  const { id, candidate_id: candidateId, path, label, taken_on: takenOn, created_at: createdAt } = row
  if (!isFilled(id) || !isFilled(candidateId) || !isString(path) || !isString(label) || !orNull(takenOn, isDay) || !isString(createdAt)) return null
  if (PHOTO_PATH.exec(path)?.[1] !== candidateId) return null
  return { id, candidateId, path, label, takenOn: takenOn as string | null, createdAt }
}

function toEvent(row: unknown): LocationEvent | null {
  if (!isRecord(row)) return null
  const r = row
  const ok =
    isFilled(r.id) &&
    isFilled(r.candidate_id) &&
    (r.kind === 'open' || r.kind === 'close') &&
    isFilled(r.clinic_name) &&
    isString(r.dept) &&
    isDay(r.event_on) &&
    Number.isSafeInteger(r.dist_m) &&
    orNull(r.seen_at, isString) &&
    isString(r.created_at)
  if (!ok) return null
  return {
    id: r.id as string,
    candidateId: r.candidate_id as string,
    kind: r.kind as 'open' | 'close',
    clinicName: r.clinic_name as string,
    dept: r.dept as string,
    eventOn: r.event_on as string,
    distM: r.dist_m as number,
    seenAt: r.seen_at as string | null,
    createdAt: r.created_at as string,
  }
}

/** 그날 값 place 칸(받은 값, 실패면 지난 값)의 시도·시군구 이름. 없거나 이름이 빈 글자·글자가 아니면 null */
function placeOf(got: unknown): WatchCandidate['place'] {
  if (!isRecord(got)) return null
  const v = got.ok === true ? got.v : isRecord(got.prev) ? got.prev.v : undefined
  if (!isRecord(v) || !isFilled(v.sidoName) || !isFilled(v.sggName)) return null
  return { sidoName: v.sidoName, sggName: v.sggName }
}

function toWatch(row: unknown): WatchCandidate | null {
  if (!isRecord(row)) return null
  const { id, name, status, lat, lng, radius_m: radiusM, watch_checked_on: watchCheckedOn, created_at: createdAt } = row
  if (!isFilled(id) || !isFilled(name) || !isOneOf(STATUSES, status)) return null
  if (!inRange(lat, 33, 39) || !inRange(lng, 124, 132) || !isOneOf(RADII, radiusM)) return null
  if (!orNull(watchCheckedOn, isDay) || !isString(createdAt)) return null
  return { id, name, status, lat, lng, radiusM, watchCheckedOn: watchCheckedOn as string | null, createdAt, place: placeOf(row.place) }
}

/** 넣기·고치기 답 줄 하나를 읽기와 같은 검사로 바꾼다(틀리면 그 번호로 실패) */
const saved = <T>(code: LocationStorageCode, row: T | null): T => row ?? stop(code)

// ── 읽기 ─────────────────────────────────────────────────────

/** 표 여섯을 모두 읽는다(설정 한 줄, 나머지는 1,000줄씩). 모양이 틀린 줄은 뺀다. 한 표라도 실패하면 E-LOC-READ-FAILED */
export async function loadLocation(client: LocationClient): Promise<LocationData> {
  const list = (table: string, columns: string, orders: [string, typeof ASC][]) =>
    readAll(READ, (first, last) => {
      let query = client.from(table).select(columns)
      for (const [column, direction] of orders) query = query.order(column, direction)
      return query.range(first, last)
    })
  const [settingsRow, candidates, listings, notes, photos, events] = await Promise.all([
    send(READ, () => client.from(SETTINGS).select(SETTINGS_COLUMNS).maybeSingle()),
    list(CANDIDATES, CANDIDATE_COLUMNS, [['created_at', ASC], ['id', ASC]]),
    list(LISTINGS, LISTING_COLUMNS, [['created_at', ASC], ['id', ASC]]),
    list(NOTES, NOTE_COLUMNS, [['day', ASC], ['created_at', ASC], ['id', ASC]]),
    list(PHOTOS, PHOTO_COLUMNS, [['created_at', ASC], ['id', ASC]]),
    list(EVENTS, EVENT_COLUMNS, [['event_on', DESC], ['created_at', DESC], ['id', DESC]]),
  ])
  return {
    settings: toSettings(settingsRow) ?? { scoreRule: fillScoreRule(null), deptRule: fillDeptRule(null), homeEswt: null, updatedAt: null },
    candidates: candidates.flatMap((row) => toCandidate(row) ?? []),
    listings: listings.flatMap((row) => toListing(row) ?? []),
    notes: notes.flatMap((row) => toNote(row) ?? []),
    photos: photos.flatMap((row) => toPhoto(row) ?? []),
    events: events.flatMap((row) => toEvent(row) ?? []),
  }
}

// ── 설정 (병원마다 한 줄, on conflict (hospital_id) upsert. 준 칸 하나만 넣고 고친다) ──

async function upsertSettings(client: LocationClient, body: Row): Promise<SavedSettings> {
  const data = await send(SAVE, () => client.from(SETTINGS).upsert(body, { onConflict: 'hospital_id' }).select(SETTINGS_COLUMNS).single())
  return saved(SAVE, toSettings(data))
}

/** 점수 설정 저장. checkScoreRule을 못 지나면(기준 0·빈칸·100점 값 ≥ 0점 값·나이대 0개·무게 밖) 보내지 않고 실패.
 * 보내는 설정은 fillScoreRule로 정해 둔 칸만 새로 만든다(모르는 칸·세부 id는 빠지고 나이대는 차례대로). 크기는 이 모양이라 4,000바이트 안이다 */
export async function saveScoreRule(client: LocationClient, rule: ScoreRule): Promise<SavedSettings> {
  if (!isRecord(rule) || checkScoreRule(rule).length > 0) return stop(SAVE)
  return upsertSettings(client, { score_rule: fillScoreRule(rule) })
}

/** [기본값으로 되돌리기]: 처음 설정(DEFAULT_SCORE_RULE)을 저장한다 */
export async function resetScoreRule(client: LocationClient): Promise<SavedSettings> {
  return saveScoreRule(client, DEFAULT_SCORE_RULE)
}

/** 의원 과목 고르기 저장(AC-7921.2). checkDeptRule을 못 지나면(모르는 id·경쟁과 안 보기 겹침·되풀이·모양) 보내지 않고 실패.
 * 보내는 설정은 fillDeptRule로 새로 만든다(목록 차례). id 스물하나를 다 넣어도 1,000바이트 안이다. 경쟁 0개(rival: [])도 된다 */
export async function saveDeptRule(client: LocationClient, rule: DeptRule): Promise<SavedSettings> {
  if (checkDeptRule(rule).length > 0) return stop(SAVE)
  return upsertSettings(client, { dept_rule: fillDeptRule(rule) })
}

/** 과목 고르기 [기본값으로]: 처음 값(DEFAULT_DEPT_RULE — 경쟁 정형외과·신경외과·마취통증·재활, 안 보기 없음)을 저장한다 */
export async function resetDeptRule(client: LocationClient): Promise<SavedSettings> {
  return saveDeptRule(client, DEFAULT_DEPT_RULE)
}

/** 알림 쪽(대시보드 useLocationWatch)이 과목 고르기만 읽는다(dept_rule 칸 하나). 줄이 없거나 그 칸이 없으면(예전 줄) 처음 값,
 * 못 읽으면(오류 답·예외·줄 아닌 답) 던지지 않고 null — 알림 확인이 처음 값으로 확인하고 확인 날을 고치지 않게(design.md 12절) */
export async function readDeptRule(client: LocationClient): Promise<DeptRule | null> {
  try {
    const row = await send(READ, () => client.from(SETTINGS).select('dept_rule').maybeSingle())
    if (row === null) return fillDeptRule(null)
    return isRecord(row) ? fillDeptRule(row.dept_rule) : null
  } catch {
    return null
  }
}

/** 지금 의원 체외충격파 1회 값(원 정수 0~9,999,999,999, 비움 null) */
export async function saveHomeEswt(client: LocationClient, won: number | null): Promise<SavedSettings> {
  if (!orNull(won, isWon)) return stop(SAVE)
  return upsertSettings(client, { home_eswt: won })
}

// ── 후보 ─────────────────────────────────────────────────────

type CandidateKey =
  | 'name' | 'addressNote' | 'lat' | 'lng' | 'radiusM' | 'status' | 'floorLabel' | 'areaM2' | 'signVisible' | 'violation'
  | 'costs' | 'terms' | 'checks' | 'openOn' | 'tasksDone' | 'watchCheckedOn'

// 앱 칸 → DB 칸(칸 권한에 있는 것)·검사. snapshot은 snapshot_at과 함께 따로 본다
const CANDIDATE_FIELDS: Readonly<Record<CandidateKey, [column: string, field: Field]>> = {
  name: ['name', text(1, 40)],
  addressNote: ['address_note', text(0, 100)],
  lat: ['lat', LAT],
  lng: ['lng', LNG],
  radiusM: ['radius_m', oneOf(RADII)],
  status: ['status', oneOf(STATUSES)],
  floorLabel: ['floor_label', text(0, 20)],
  areaM2: ['area_m2', nullable(area)],
  signVisible: ['sign_visible', nullable(oneOf(YES_NO))],
  violation: ['violation', nullable(oneOf(YES_NO))],
  costs: ['costs', jsonObject(COSTS_MAX)],
  terms: ['terms', jsonObject(TERMS_MAX)],
  checks: ['checks', jsonObject(CHECKS_MAX)],
  openOn: ['open_on', nullable(day)],
  tasksDone: ['tasks_done', taskIds],
  watchCheckedOn: ['watch_checked_on', nullable(day)],
}
const NEW_KEYS: readonly CandidateKey[] = ['name', 'addressNote', 'lat', 'lng', 'radiusM'] // 넣을 때 꼭 있는 칸(그 밖 칸은 받지 않음)
const CHANGE_KEYS = Object.keys(CANDIDATE_FIELDS) as CandidateKey[]

/** 정해 둔 칸만 골라 DB 몸통을 새로 만든다. required = 빠지면 안 되는 칸. 틀린 칸이 있으면 보내지 않고 실패 */
function candidateBody(input: unknown, keys: readonly CandidateKey[], required: boolean): Row {
  if (!isRecord(input)) return stop(SAVE)
  const body: Row = {}
  for (const key of keys) {
    const [column, field] = CANDIDATE_FIELDS[key]
    if (input[key] === undefined) {
      if (required) return stop(SAVE)
      continue
    }
    const value = field(input[key])
    if (value === BAD) return stop(SAVE)
    body[column] = value
  }
  if (input.snapshot !== undefined) {
    const snapshot = input.snapshot === null ? null : snapshotOf(input.snapshot)
    if (snapshot === BAD) return stop(SAVE)
    body.snapshot = snapshot
    body.snapshot_at = snapshot === null ? null : snapshot.at
  }
  return body
}

/** 후보 하나 넣기(AC-7908.1·7908.2). 진행 상태는 DB 처음 값(watching) */
export async function addCandidate(client: LocationClient, fields: CandidateNew): Promise<Candidate> {
  const body = candidateBody(fields, NEW_KEYS, true)
  const data = await send(SAVE, () => client.from(CANDIDATES).insert(body).select(CANDIDATE_COLUMNS).single())
  return saved(SAVE, toCandidate(data))
}

/** 그 id 후보의 준 칸만 고친다(빈 고치기는 보내지 않고 실패) */
export async function updateCandidate(client: LocationClient, id: string, changes: CandidateChanges): Promise<Candidate> {
  if (!isUuid(id)) return stop(SAVE)
  const body = candidateBody(changes, CHANGE_KEYS, false)
  if (Object.keys(body).length === 0) return stop(SAVE)
  const data = await send(SAVE, () => client.from(CANDIDATES).update(body).eq('id', id).select(CANDIDATE_COLUMNS).single())
  return saved(SAVE, toCandidate(data))
}

/** 알림 확인 뒤 그 후보의 마지막 확인 날(한국 날짜)만 고친다 */
export async function setWatchChecked(client: LocationClient, id: string, checkedOn: string): Promise<void> {
  if (!isUuid(id) || !isDay(checkedOn)) return stop(SAVE)
  await send(SAVE, () => client.from(CANDIDATES).update({ watch_checked_on: checkedOn }).eq('id', id))
}

/**
 * 후보 지우기. 메모·사진 줄·알림 줄은 DB가 함께 지우고(매물은 후보 칸만 빔), 사진 파일은 여기서 지운다:
 * 사진 자리 읽기 → 후보 지우기 → 파일 지우기(실패해도 알리지 않음 — 남은 파일은 내 병원 폴더 안 쓰레기일 뿐). 자리를 못 읽으면 지우지 않는다
 */
export async function deleteCandidate(client: LocationClient, id: string): Promise<void> {
  if (!isUuid(id)) return stop(SAVE)
  const rows = await readAll(SAVE, (first, last) => client.from(PHOTOS).select('path').eq('candidate_id', id).order('id', ASC).range(first, last))
  const paths = rows.flatMap((row) => (isRecord(row) && isString(row.path) ? [row.path] : []))
  await send(SAVE, () => client.from(CANDIDATES).delete().eq('id', id))
  await quietly(() => removePhotos(client, paths))
}

/** 그 id 줄 하나 지우기. id가 틀리면 보내지 않는다(조건 없는 지우기를 보내지 않으려고) */
async function deleteRow(client: LocationClient, table: string, id: string): Promise<void> {
  if (!isUuid(id)) return stop(SAVE)
  await send(SAVE, () => client.from(table).delete().eq('id', id))
}

// ── 매물 ─────────────────────────────────────────────────────

const LISTING_FIELDS: readonly [key: keyof ListingFields, column: string, field: Field][] = [
  ['candidateId', 'candidate_id', nullable(uuid)],
  ['title', 'title', text(1, 40)],
  ['url', 'url', httpsUrl],
  ['areaM2', 'area_m2', nullable(area)],
  ['floorLabel', 'floor_label', text(0, 20)],
  ['deposit', 'deposit', nullable(won)],
  ['rent', 'rent', nullable(won)],
  ['premium', 'premium', nullable(won)],
  ['mgmt', 'mgmt', nullable(won)],
  ['brokerId', 'broker_id', nullable(uuid)],
  ['brokerNote', 'broker_note', text(0, 40)],
  ['memo', 'memo', text(0, 500, true)],
  ['lat', 'lat', nullable(LAT)],
  ['lng', 'lng', nullable(LNG)],
]

/** 매물 몸통: 칸 열넷 모두(빠지면 실패), 점은 둘 다 있거나 둘 다 비움 */
function listingBody(input: unknown): Row {
  if (!isRecord(input)) return stop(SAVE)
  const body: Row = {}
  for (const [key, column, field] of LISTING_FIELDS) {
    const value = input[key] === undefined ? BAD : field(input[key])
    if (value === BAD) return stop(SAVE)
    body[column] = value
  }
  if ((body.lat === null) !== (body.lng === null)) return stop(SAVE)
  return body
}

export async function addListing(client: LocationClient, fields: ListingFields): Promise<Listing> {
  const body = listingBody(fields)
  const data = await send(SAVE, () => client.from(LISTINGS).insert(body).select(LISTING_COLUMNS).single())
  return saved(SAVE, toListing(data))
}

export async function updateListing(client: LocationClient, id: string, fields: ListingFields): Promise<Listing> {
  if (!isUuid(id)) return stop(SAVE)
  const body = listingBody(fields)
  const data = await send(SAVE, () => client.from(LISTINGS).update(body).eq('id', id).select(LISTING_COLUMNS).single())
  return saved(SAVE, toListing(data))
}

export async function deleteListing(client: LocationClient, id: string): Promise<void> {
  await deleteRow(client, LISTINGS, id)
}

// ── 메모 ─────────────────────────────────────────────────────

/** 그 후보에 날짜별 메모 하나(1~500자, 앞뒤 빈칸 뺌, 줄바꿈 됨) */
export async function addNote(client: LocationClient, candidateId: string, fields: NoteFields): Promise<LocationNote> {
  if (!isUuid(candidateId) || !isRecord(fields)) return stop(SAVE)
  const noteDay = day(fields.day)
  const body = text(1, 500, true)(fields.body)
  if (noteDay === BAD || body === BAD) return stop(SAVE)
  const row = { candidate_id: candidateId, day: noteDay, body }
  const data = await send(SAVE, () => client.from(NOTES).insert(row).select(NOTE_COLUMNS).single())
  return saved(SAVE, toNote(data))
}

export async function deleteNote(client: LocationClient, id: string): Promise<void> {
  await deleteRow(client, NOTES, id)
}

// ── 사진 ─────────────────────────────────────────────────────

/** 1~3,000,000바이트 JPEG(FF D8 FF)만 */
async function isJpeg(photo: unknown): Promise<boolean> {
  if (!(photo instanceof Blob) || photo.size < 3 || photo.size > LOCATION_PHOTO_MAX_BYTES) return false
  const head = new Uint8Array(await photo.slice(0, 3).arrayBuffer())
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
}

/**
 * 사진 하나(브라우저가 줄인 JPEG) 올리기: <병원 id>/<후보 id>/<새 uuid>.jpg로 먼저 올리고 그 자리로 줄을 넣는다.
 * 줄 넣기가 실패하면(후보마다 30장 트리거 23514 등) 올린 파일을 지운다. 실패는 모두 E-LOC-PHOTO.
 * 30장은 화면이 먼저 보고(사진 줄 수), DB 트리거가 마지막에 막는다
 */
export async function addPhoto(client: LocationClient, candidateId: string, photo: Blob, fields: PhotoFields): Promise<LocationPhoto> {
  if (!isUuid(candidateId) || !isRecord(fields)) return stop(PHOTO)
  const label = text(0, 40)(fields.label)
  const takenOn = day(fields.takenOn)
  if (label === BAD || takenOn === BAD || !(await isJpeg(photo))) return stop(PHOTO)
  const hospital = await send(PHOTO, () => client.rpc('my_hospital_id'))
  if (!isUuid(hospital)) return stop(PHOTO)
  const path = `${hospital}/${candidateId}/${crypto.randomUUID()}.jpg`
  await send(PHOTO, () => client.storage.from(LOCATION_PHOTO_BUCKET).upload(path, photo, { contentType: JPEG_TYPE, upsert: false }))
  const row = { candidate_id: candidateId, path, label, taken_on: takenOn }
  let data: unknown
  try {
    data = await send(PHOTO, () => client.from(PHOTOS).insert(row).select(PHOTO_COLUMNS).single())
  } catch (error) {
    await quietly(() => removePhotos(client, [path]))
    throw error
  }
  return saved(PHOTO, toPhoto(data))
}

/** 사진 지우기: 그 줄을 지우고 DB가 돌려준 자리의 파일을 지운다(파일 지우기 실패는 알리지 않음) */
export async function deletePhoto(client: LocationClient, id: string): Promise<void> {
  if (!isUuid(id)) return stop(SAVE)
  const data = await send(SAVE, () => client.from(PHOTOS).delete().eq('id', id).select('path'))
  const paths = Array.isArray(data) ? data.flatMap((row) => (isRecord(row) && isString(row.path) ? [row.path] : [])) : []
  await quietly(() => removePhotos(client, paths))
}

/** 사진 파일 여럿을 한 번에 지운다. 자리 모양(<병원>/<후보>/<uuid>.jpg)이 틀린 것은 빼고, 없으면 부르지 않는다 */
export async function removePhotos(client: LocationClient, paths: readonly string[]): Promise<void> {
  const valid = [...new Set(paths.filter((path) => isString(path) && PHOTO_PATH.test(path)))]
  if (valid.length === 0) return
  await send(SAVE, () => client.storage.from(LOCATION_PHOTO_BUCKET).remove(valid))
}

/** 사진 하나(Blob). 자리 모양이 틀리거나 실패면 null(던지지 않음) */
export async function readPhoto(client: LocationClient, path: string): Promise<Blob | null> {
  if (!isString(path) || !PHOTO_PATH.test(path)) return null
  try {
    const { data, error } = await client.storage.from(LOCATION_PHOTO_BUCKET).download(path)
    return !error && data instanceof Blob ? data : null
  } catch {
    return null
  }
}

// ── 새 경쟁 의원 알림 (대시보드 useLocationWatch · 후보 화면) ──

/** 알림을 확인할 후보: 알림에 쓰는 칸만(그날 값은 place의 시도·시군구 이름만 — 후보 이름은 알림 아래 줄, AC-7915.2), 만든 차례 */
export async function listWatchCandidates(client: LocationClient): Promise<WatchCandidate[]> {
  const rows = await readAll(READ, (first, last) =>
    client.from(CANDIDATES).select(WATCH_COLUMNS).order('created_at', ASC).order('id', ASC).range(first, last),
  )
  return rows.flatMap((row) => toWatch(row) ?? [])
}

function eventBody(event: unknown): Row[] {
  if (!isRecord(event) || !isUuid(event.candidateId) || (event.kind !== 'open' && event.kind !== 'close')) return []
  const clinicName = text(1, 100)(event.clinicName)
  const dept = text(0, 50)(event.dept)
  const { eventOn, distM } = event
  if (clinicName === BAD || dept === BAD || !isDay(eventOn) || !Number.isSafeInteger(distM) || !inRange(distM, 0, DIST_MAX)) return []
  return [{ candidate_id: event.candidateId, kind: event.kind, clinic_name: clinicName, dept, event_on: eventOn, dist_m: distM }]
}

/** 알림 줄 넣기. 같은 줄은 건너뛴다(on conflict do nothing). 공공 자료에서 온 줄이라 모양이 틀린 줄은 빼고 넣는다 */
export async function addEvents(client: LocationClient, events: readonly WatchEvent[]): Promise<void> {
  if (!Array.isArray(events)) return stop(SAVE)
  const rows = events.flatMap(eventBody)
  if (rows.length === 0) return
  await send(SAVE, () => client.from(EVENTS).upsert(rows, { onConflict: EVENT_UNIQUE, ignoreDuplicates: true }))
}

/** 안 본 알림 줄(seen_at 비어 있음), 최근 차례 */
export async function listUnseenEvents(client: LocationClient): Promise<LocationEvent[]> {
  const rows = await readAll(READ, (first, last) =>
    client
      .from(EVENTS)
      .select(EVENT_COLUMNS)
      .is('seen_at', null)
      .order('event_on', DESC)
      .order('created_at', DESC)
      .order('id', DESC)
      .range(first, last),
  )
  return rows.flatMap((row) => toEvent(row) ?? [])
}

/** [닫기]: 보이던 줄들의 seen_at을 지금 시각으로(이미 본 줄은 그대로) */
export async function markEventsSeen(client: LocationClient, ids: readonly string[]): Promise<void> {
  const valid = [...new Set(ids.filter(isUuid))]
  if (valid.length === 0) return
  const seenAt = new Date().toISOString()
  await send(SAVE, () => client.from(EVENTS).update({ seen_at: seenAt }).in('id', valid).is('seen_at', null))
}

/** 후보 화면을 열면: 그 후보 알림 줄의 seen_at을 지금 시각으로(이미 본 줄은 그대로) */
export async function markCandidateEventsSeen(client: LocationClient, candidateId: string): Promise<void> {
  if (!isUuid(candidateId)) return stop(SAVE)
  const seenAt = new Date().toISOString()
  await send(SAVE, () => client.from(EVENTS).update({ seen_at: seenAt }).eq('candidate_id', candidateId).is('seen_at', null))
}
