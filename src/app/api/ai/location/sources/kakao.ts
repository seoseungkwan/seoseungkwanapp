import 'server-only'
import { distM } from '@/lib/location/coords'
import type { Adapter, Parsed, Point, QueryOf, SiteRequest } from '@/types/location'

// 카카오 로컬 읽는 곳(specs/location REQ-7904, design.md 4절): 주소 찾기 k-address · 좌표→주소·지역 코드 k-point ·
// 카테고리 장소 k-near · 키워드 장소 k-keyword(산업단지). 요청 만들기·답 읽기만 하는 순수 함수다 — 열쇠는 fetchSource가
// Authorization 머리로 넣고, 받은 답은 어디에도 담아 두지 않는다(ADR-047, 카카오 운영정책 제5조). 그날 값에도 넣지 않는다.
// 카카오에는 활용신청이 없어 not-applied를 쓰지 않는다 — 오류 몸통·모양이 다른 답은 모두 failed다. 기준 날짜는 받은 한국 날짜

const BASE = 'https://dapi.kakao.com'
const SRC = 'kakao-local'

/** 장소 찾기 한 쪽에 받는 곳 수(카카오 최대 15) · 쪽 수 · 모두(카카오는 한 번 찾기에 45곳까지만 준다) */
export const KAKAO_PAGE_SIZE = 15
export const KAKAO_PAGES = 3
export const KAKAO_MAX_PLACES = KAKAO_PAGE_SIZE * KAKAO_PAGES
/** 주소 찾기에 받는 줄 수 */
export const KAKAO_ADDRESS_SIZE = 10

/** 지번 한 필지. lib/location/regions.ts landCodes에 그대로 넘겨 건축물대장 열쇠·PNU를 만든다 */
export type KakaoLot = { bcode: string; main: number; sub: number; san: boolean }
/** 주소 찾기 한 줄: 점 · 도로명 주소 · 지번 주소 · 법정동 코드(10자리) · 필지(번지가 없으면 null) */
export type KakaoAddress = { at: Point; road: string | null; jibun: string | null; bjd: string | null; lot: KakaoLot | null }
/** 점 하나의 주소·지역 코드: 도로명 · 지번 · 법정동 코드 · 행정동 코드 · 필지. 못 찾은 칸은 null */
export type KakaoSpot = { road: string | null; jibun: string | null; bjd: string | null; hjd: string | null; lot: KakaoLot | null }
/** 장소 하나: 이름 · 카카오 분류 글 · 점 · 거리(m 정수) */
export type KakaoPlace = { name: string; category: string; at: Point; distM: number }
/** 카테고리 장소(k-near) 하나: + 도로명 주소 글(없거나 빈 글자면 null). 약국 같은 건물·옆 건물 견주기에 화면이 볼 때만 쓰고
 * 저장하지 않는다(design.md 18절, ADR-047) */
export type KakaoNearPlace = KakaoPlace & { road: string | null }
/** 가까운 차례 45곳까지. 더 있으면 capped(화면: '{n}곳 넘게 있어요. 가까운 {n}곳만 셌어요.') */
export type KakaoPlaces<P extends KakaoPlace = KakaoPlace> = { places: P[]; capped: boolean }

// ── 요청 ────────────────────────────────────────────────

function siteRequest(path: string, params: readonly (readonly [string, string | number])[]): SiteRequest {
  const search = params.map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`).join('&')
  return { url: `${BASE}${path}?${search}` }
}

// 장소 찾기: 가까운 차례로 15곳씩 3쪽(끝 쪽 뒤 답은 parse가 읽지 않는다)
function placePages(path: string, first: readonly [string, string], at: Point, r: number): SiteRequest[] {
  return Array.from({ length: KAKAO_PAGES }, (_, i) =>
    siteRequest(path, [first, ['x', at.lng], ['y', at.lat], ['radius', r], ['sort', 'distance'], ['page', i + 1], ['size', KAKAO_PAGE_SIZE]]),
  )
}

// ── 답 읽기 도움 ────────────────────────────────────────

// 모양이 다르면 던지고 parse가 failed로 바꾼다(밖으로 나가지 않는다)
class Malformed extends Error {}
const bad = (): never => {
  throw new Malformed()
}
const FAILED = { ok: false, code: 'failed' } as const

type Row = Record<string, unknown>
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const row = (v: unknown): Row => (isRow(v) ? v : bad())
const rowOrNull = (v: unknown): Row | null => (v === null || v === undefined ? null : row(v))
const str = (v: unknown): string => (typeof v === 'string' ? v : bad())
// 글자 칸: 없거나 빈 글자면 null, 글자가 아니면 모양 틀림
const text = (v: unknown): string | null => (v === null || v === undefined ? null : str(v).trim() || null)

function json(raw: string): Row {
  try {
    return row(JSON.parse(raw))
  } catch {
    return bad()
  }
}
function documents(body: Row): Row[] {
  const docs = body.documents
  return Array.isArray(docs) ? docs.map(row) : bad()
}

// 점: 카카오 x = 경도, y = 위도(글자 또는 수). 우리나라 범위(lat 33~39 · lng 124~132) 안, 소수 6자리.
// 빈 글자는 Number가 0으로 읽어 범위 밖이 된다
const round6 = (v: number) => Math.round(v * 1e6) / 1e6
const num = (v: unknown): number => (typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN)
function pointOf(x: unknown, y: unknown): Point {
  const lng = num(x)
  const lat = num(y)
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132 ? { lat: round6(lat), lng: round6(lng) } : bad()
}

const CODE10 = /^\d{10}$/
const code10 = (v: unknown): string | null => {
  const t = text(v)
  return t !== null && CODE10.test(t) ? t : null
}

// 필지: 법정동 코드 + 본번(1~4자리) + 부번(없으면 0) + 산. 번지가 없는 줄(동 이름만 찾음)은 null
const LOT_NO = /^\d{1,4}$/
function lotOf(bcode: string | null, address: Row): KakaoLot | null {
  const main = text(address.main_address_no)
  const sub = text(address.sub_address_no) ?? '0'
  if (bcode === null || main === null || !LOT_NO.test(main) || !LOT_NO.test(sub)) return null
  return { bcode, main: Number(main), sub: Number(sub), san: address.mountain_yn === 'Y' }
}

// 거리: 카카오 distance(m 글자)를 버린 정수. 칸이 비면 하버사인(lib/location/coords.ts)으로 센다
const DISTANCE = /^\d+(?:\.\d+)?$/
function distanceOf(v: unknown, from: Point, to: Point): number {
  return typeof v === 'string' && DISTANCE.test(v.trim()) ? Math.floor(Number(v)) : distM(from, to)
}

// 답 수가 요청 수와 같을 때만 읽는다. 기준 날짜 = 받은 날(카카오 답에는 날짜가 없다)
function readAll<V>(texts: string[], count: number, today: string, read: (texts: string[]) => V): Parsed<V> {
  if (!Array.isArray(texts) || texts.length !== count) return FAILED
  try {
    return { ok: true, value: read(texts), asOf: today }
  } catch {
    return FAILED
  }
}

// 장소 찾기 쪽들: 끝 쪽(is_end) 뒤는 읽지 않고(카카오가 같은 쪽을 다시 줄 수 있다), 같은 곳(id)은 한 번만,
// 가까운 차례 45곳까지. 첫 쪽의 모두 수(total_count)가 받은 곳보다 많거나 45곳을 넘게 받으면 capped.
// more = 장소 줄에 더 담을 칸(k-near의 도로명 주소)
function readPlaces<P extends KakaoPlace>(texts: string[], at: Point, more: (doc: Row, place: KakaoPlace) => P): KakaoPlaces<P> {
  const seen = new Set<string>()
  const found: P[] = []
  let total = 0
  for (const [i, raw] of texts.entries()) {
    const body = json(raw)
    const meta = row(body.meta)
    const count = meta.total_count
    const end = meta.is_end
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || typeof end !== 'boolean') return bad()
    if (i === 0) total = count
    for (const doc of documents(body)) {
      const id = str(doc.id)
      const point = pointOf(doc.x, doc.y)
      const place = more(doc, {
        name: str(doc.place_name).trim(),
        category: str(doc.category_name).trim(),
        at: point,
        distM: distanceOf(doc.distance, at, point),
      })
      if (seen.has(id)) continue
      seen.add(id)
      found.push(place)
    }
    if (end) break
  }
  found.sort((a, b) => a.distM - b.distM)
  const places = found.slice(0, KAKAO_MAX_PLACES)
  return { places, capped: found.length > KAKAO_MAX_PLACES || total > places.length }
}

// ── 읽는 곳 넷 ──────────────────────────────────────────

/** k-address: 주소 찾기 한 번, 10줄까지 */
export const kakaoAddress: Adapter<'k-address', KakaoAddress[]> = {
  kind: 'k-address',
  src: SRC,
  key: 'kakao',
  requests: (q: QueryOf<'k-address'>) => [
    siteRequest('/v2/local/search/address.json', [
      ['query', q.q],
      ['analyze_type', 'similar'],
      ['page', 1],
      ['size', KAKAO_ADDRESS_SIZE],
    ]),
  ],
  parse: (texts, _q, today) =>
    readAll(texts, 1, today, ([raw]) =>
      documents(json(raw))
        .slice(0, KAKAO_ADDRESS_SIZE)
        .map((doc): KakaoAddress => {
          const at = pointOf(doc.x, doc.y)
          const address = rowOrNull(doc.address)
          const road = rowOrNull(doc.road_address)
          const bjd = address === null ? null : code10(address.b_code)
          return {
            at,
            road: road === null ? null : text(road.address_name),
            jibun: address === null ? null : text(address.address_name),
            bjd,
            lot: address === null ? null : lotOf(bjd, address),
          }
        }),
    ),
}

/** k-point: 좌표→주소(도로명·지번·번지)와 좌표→지역 코드(법정동 B·행정동 H) 두 번. 좌표→주소 답에는 법정동 코드가 없다 */
export const kakaoPoint: Adapter<'k-point', KakaoSpot> = {
  kind: 'k-point',
  src: SRC,
  key: 'kakao',
  requests: (q: QueryOf<'k-point'>) => {
    const at: [string, number][] = [
      ['x', q.at.lng],
      ['y', q.at.lat],
    ]
    return [
      siteRequest('/v2/local/geo/coord2address.json', [...at, ['input_coord', 'WGS84']]),
      siteRequest('/v2/local/geo/coord2regioncode.json', [...at, ['input_coord', 'WGS84']]),
    ]
  },
  parse: (texts, _q, today) =>
    readAll(texts, 2, today, ([addressRaw, regionRaw]): KakaoSpot => {
      const first = documents(json(addressRaw))[0]
      let bjd: string | null = null
      let hjd: string | null = null
      for (const region of documents(json(regionRaw))) {
        const type = str(region.region_type)
        const code = code10(str(region.code))
        if (type === 'B') bjd ??= code
        else if (type === 'H') hjd ??= code
      }
      const address = first === undefined ? null : rowOrNull(first.address)
      const road = first === undefined ? null : rowOrNull(first.road_address)
      return {
        road: road === null ? null : text(road.address_name),
        jibun: address === null ? null : text(address.address_name),
        bjd,
        hjd,
        lot: address === null ? null : lotOf(bjd, address),
      }
    }),
}

// 장소 줄 그대로(산업단지)
const plain = (_doc: Row, place: KakaoPlace): KakaoPlace => place
// + 도로명 주소(road_address_name: 없거나 빈 글자면 null, 글자가 아니면 모양 틀림 — 진짜 답에도 빈 글자가 있다, TASK-55)
const withRoad = (doc: Row, place: KakaoPlace): KakaoNearPlace => ({ ...place, road: text(doc.road_address_name) })

/** k-near: 카테고리 장소(지하철역·대형마트·약국·병원·중개업소), 15곳씩 3쪽. 장소마다 도로명 주소(road)도 담는다 */
export const kakaoNear: Adapter<'k-near', KakaoPlaces<KakaoNearPlace>> = {
  kind: 'k-near',
  src: SRC,
  key: 'kakao',
  requests: (q: QueryOf<'k-near'>) => placePages('/v2/local/search/category.json', ['category_group_code', q.cat], q.at, q.r),
  parse: (texts, q, today) => readAll(texts, KAKAO_PAGES, today, (all) => readPlaces(all, q.at, withRoad)),
}

/** k-keyword: 키워드 장소(찾는 말은 '산업단지'만), 15곳씩 3쪽. 분류 글은 카카오 그대로(거르기는 쓰는 쪽이) */
export const kakaoKeyword: Adapter<'k-keyword', KakaoPlaces> = {
  kind: 'k-keyword',
  src: SRC,
  key: 'kakao',
  requests: (q: QueryOf<'k-keyword'>) => placePages('/v2/local/search/keyword.json', ['query', q.q], q.at, q.r),
  parse: (texts, q, today) => readAll(texts, KAKAO_PAGES, today, (all) => readPlaces(all, q.at, plain)),
}
