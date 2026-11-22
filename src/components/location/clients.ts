import type { BusFile, RailFile, TransitIndex } from '@/lib/location/flow'
import { checkQuery } from '@/lib/location/query'
import type { DongFile, DongIndex } from '@/lib/location/regions'
import type { KeyKind, KeyState, KeysReply, Query, QueryReply, ReplyCode } from '@/types/location'

// 입지 분석 화면의 부르기(specs/location design.md 1·3·5절, ADR-042). 던지지 않는다.
// 바깥 자료는 같은 origin 서버 경로(POST /api/ai/location/query)로만 부른다 — 몸통은 checkQuery를 지난 칸만(못 지나면 보내지 않음).
// 열쇠 상태는 GET /api/ai/location/keys. 동 경계·정류장·역 좌표는 같은 origin 정적 파일(/location/dongs·/location/transit)이다.
// 모두 redirect: 'error'(로그인이 끊겨 돌려보내는 답은 따라가지 않고 실패) · 10초 넘으면 끊는다.
// 답은 정해 둔 칸만 새로 담는다. 바깥 오류 글은 담지 않고 어디에도 남기지 않는다(저장·console 없음)

const QUERY_PATH = '/api/ai/location/query'
const KEYS_PATH = '/api/ai/location/keys'
const DONGS_DIR = '/location/dongs'
const TRANSIT_DIR = '/location/transit'
export const CLIENT_TIMEOUT_MS = 10_000

const REPLY_CODES: readonly ReplyCode[] = ['no-key', 'not-applied', 'failed']
const KEY_KINDS: readonly KeyKind[] = ['data', 'kakao']
const KEY_STATES: readonly KeyState[] = ['ok', 'missing', 'rejected', 'failed']
const SGG = /^\d{5}$/
const SIDO = /^\d{2}$/
const DONG = /^\d{10}$/

type Row = Record<string, unknown>
type Got = { status: number; body: unknown }

const failed = (): QueryReply<never> => ({ ok: false, code: 'failed' })

const isRecord = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isOneOf = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T)
const isCode = (re: RegExp, v: unknown): v is string => typeof v === 'string' && re.test(v)
const isLngLat = (v: unknown) => Array.isArray(v) && v.length === 2 && isNumber(v[0]) && isNumber(v[1])

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** 같은 origin 경로 하나를 부르고 상태·JSON을 받는다. redirect는 따라가지 않고, 10초 넘으면 끊는다. 실패는 null */
async function call(path: string, init: RequestInit): Promise<Got | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
  try {
    const response = await fetch(path, { ...init, redirect: 'error', signal: controller.signal })
    const text = await response.text()
    return { status: response.status, body: jsonOf(text) }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── 바깥 자료 ────────────────────────────────────────────────

// 200 { ok: true, value, src, asOf } · { ok: false, code, key? } 그대로. 400·401·403·500(몸통 없음)·틀린 모양 → failed
function replyOf<V>(got: Got | null): QueryReply<V> {
  if (got === null || got.status !== 200 || !isRecord(got.body)) return failed()
  const b = got.body
  if (b.ok === true) {
    return b.value !== undefined && isString(b.src) && b.src !== '' && isString(b.asOf)
      ? { ok: true, value: b.value as V, src: b.src, asOf: b.asOf }
      : failed()
  }
  if (b.ok !== false || !isOneOf(REPLY_CODES, b.code)) return failed()
  if (b.code === 'no-key') return isOneOf(KEY_KINDS, b.key) ? { ok: false, code: 'no-key', key: b.key } : failed()
  return { ok: false, code: b.code }
}

/** 바깥 자료 하나(종류마다 몸통 칸은 checkQuery). 못 지나는 몸통(정해 두지 않은 칸 포함)은 보내지 않고 failed */
export async function queryLocation<V = unknown>(q: Query): Promise<QueryReply<V>> {
  const body = checkQuery(q)
  if (body === null) return failed()
  const got = await call(QUERY_PATH, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return replyOf<V>(got)
}

/** 열쇠 둘의 상태. 못 받거나 모양이 틀리면 둘 다 failed */
export async function readKeys(): Promise<KeysReply> {
  const got = await call(KEYS_PATH, { method: 'GET', cache: 'no-store' })
  const b = got !== null && got.status === 200 && isRecord(got.body) ? got.body : null
  if (b === null || !isOneOf(KEY_STATES, b.data) || !isOneOf(KEY_STATES, b.kakao)) return { data: 'failed', kakao: 'failed' }
  return { data: b.data, kakao: b.kakao }
}

// ── 정적 파일 (design.md 5절 모양. 머리 모양이 틀리면 null, 줄 모양이 틀린 줄은 뺀다) ──

async function readFile<T>(path: string, read: (body: Row) => T | null): Promise<T | null> {
  const got = await call(path, { method: 'GET' })
  if (got === null || got.status !== 200 || !isRecord(got.body)) return null
  return read(got.body)
}

const isSggRow = (v: unknown) =>
  isRecord(v) && isCode(SGG, v.code5) && isString(v.name) && Array.isArray(v.bbox) && v.bbox.length === 4 && v.bbox.every(isNumber)
const isRing = (v: unknown) => Array.isArray(v) && v.every(isLngLat)
const isDongRow = (v: unknown) =>
  isRecord(v) &&
  isCode(DONG, v.code10) &&
  isString(v.name) &&
  isNumber(v.areaM2) &&
  v.areaM2 > 0 &&
  isLngLat(v.center) &&
  (v.rings === null || (Array.isArray(v.rings) && v.rings.every(isRing))) &&
  (v.unmatched === undefined || v.unmatched === true)
const isStop = (v: unknown) =>
  isRecord(v) && isString(v.no) && isString(v.name) && (v.ars === null || isString(v.ars)) && isNumber(v.lng) && isNumber(v.lat)
const isStation = (v: unknown) => isRecord(v) && isString(v.name) && isString(v.line) && isNumber(v.lng) && isNumber(v.lat)

/** 동 경계 목록(시도·시군구·네모 범위) */
export async function readDongIndex(): Promise<DongIndex | null> {
  return readFile(`${DONGS_DIR}/index.json`, (b) => {
    if (!isString(b.asOf) || !Array.isArray(b.sidos)) return null
    const sidos = b.sidos.flatMap((s: unknown) =>
      isRecord(s) && isCode(SIDO, s.code2) && isString(s.name) && Array.isArray(s.sggs)
        ? [{ code2: s.code2, name: s.name, sggs: s.sggs.filter(isSggRow) as DongIndex['sidos'][number]['sggs'] }]
        : [],
    )
    return { asOf: b.asOf, sidos }
  })
}

/** 시군구 하나의 동 경계. 코드가 5자리 숫자가 아니면 부르지 않는다 */
export async function readDongs(code5: string): Promise<DongFile | null> {
  if (!isCode(SGG, code5)) return null
  return readFile(`${DONGS_DIR}/${code5}.json`, (b) =>
    isString(b.asOf) && Array.isArray(b.dongs) ? { asOf: b.asOf, dongs: b.dongs.filter(isDongRow) as DongFile['dongs'] } : null,
  )
}

/** 정류장 좌표 파일이 있는 시군구 목록 */
export async function readTransitIndex(): Promise<TransitIndex | null> {
  return readFile(`${TRANSIT_DIR}/index.json`, (b) =>
    isString(b.asOf) && Array.isArray(b.sggs) ? { asOf: b.asOf, sggs: b.sggs.filter((v: unknown) => isCode(SGG, v)) as string[] } : null,
  )
}

/** 도시철도역 좌표 */
export async function readRail(): Promise<RailFile | null> {
  return readFile(`${TRANSIT_DIR}/rail.json`, (b) =>
    isString(b.asOf) && isString(b.src) && Array.isArray(b.stations)
      ? { asOf: b.asOf, src: b.src, stations: b.stations.filter(isStation) as RailFile['stations'] }
      : null,
  )
}

/** 시군구 하나의 버스 정류장 좌표. 코드가 5자리 숫자가 아니면 부르지 않는다 */
export async function readBus(code5: string): Promise<BusFile | null> {
  if (!isCode(SGG, code5)) return null
  return readFile(`${TRANSIT_DIR}/bus/${code5}.json`, (b) =>
    isString(b.asOf) && isString(b.src) && Array.isArray(b.stops)
      ? { asOf: b.asOf, src: b.src, stops: b.stops.filter(isStop) as BusFile['stops'] }
      : null,
  )
}
