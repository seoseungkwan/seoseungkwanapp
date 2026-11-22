import 'server-only'
import { isYmd } from '@/lib/analytics/dates'
import { from5174 } from '@/lib/location/coords'
import type { Adapter, Parsed, SiteRequest } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 바깥 자료 — 시설·사고(specs/location REQ-7904, design.md 4절, TASK-22). 요청 만들기·답 읽기만 하는 순수 읽는 곳이다.
//   market   전국전통시장표준데이터 15012894            → 이름·점 (3쪽)
//   senior   전국마을회관및경로당표준데이터 15114136     → 이름·점 (5쪽)
//   school   전국초중등학교위치표준데이터 15021148       → 이름·급(초·중·고)·점 (5쪽)
//   accident 전국교통사고다발지역표준데이터 15029185     → 기준 연도의 지점 이름·사고 수·점 (5쪽)
//   gym      행정안전부 생활_체력단련장업 15155077        → 이름·영업 상태·점(EPSG:5174 → WGS84, 폐업 뺌) (5쪽)
// 역·정류장은 부르지 않는다(좌표 파일에서 센다, TASK-30). 모두 공공데이터포털 열쇠이고, 열쇠는 fetchSource가 싣는다.
// 시군구 이름으로 요청 칸에서 한 번 거르고, 받은 줄의 주소(낱말 단위)에서 한 번 더 거른다(다른 시군구 줄·길 이름만 같은 줄을 뺀다).
// 좌표가 비었거나 (0,0)이거나 한국 밖인 줄, 이름이 빈 줄은 뺀다. 빈 답(NODATA·빈 items)은 빈 목록이다.
// TASK-47(2026-11-22 진짜 열쇠): gym은 진짜 답으로 맞췄다(주소 fitness_centers/info · 대문자 칸 · 결과 코드 '0' · 한 쪽 100줄 ·
// 조건 칸 cond[ROAD_NM_ADDR::LIKE]·cond[SALS_STTS_CD::EQ]). 표준데이터 넷(market·senior·school·accident)은 열쇠가 활용신청 전이라
// (미등록 답, HTTP 403) 줄 모양을 못 봤다 — senior 주소만 포털 문서(tn_pubr_public_vill_hall_sen_cent_api)로 고쳤고 칸 이름은 확인 전이다

/** 한 쪽에 받는 줄 수(체력단련장은 사이트 한도 100줄) */
export const FACILITY_ROWS = 1000
const ROWS_OF = { market: FACILITY_ROWS, senior: FACILITY_ROWS, school: FACILITY_ROWS, accident: FACILITY_ROWS, gym: 100 } as const
/** 종류마다 받는 쪽 수(design.md 4절 표 '쪽'). 전체 건수가 쪽 수 × 줄 수를 넘으면 capped */
export const FACILITY_PAGES = { market: 3, senior: 5, school: 5, accident: 5, gym: 5 } as const

type FacilityKind = keyof typeof FACILITY_PAGES

const STD = 'https://api.data.go.kr/openapi'
const URLS: Readonly<Record<FacilityKind, string>> = {
  market: `${STD}/tn_pubr_public_trdit_mrkt_api`,
  senior: `${STD}/tn_pubr_public_vill_hall_sen_cent_api`,
  school: `${STD}/tn_pubr_public_elesch_mskul_lc_api`,
  accident: `${STD}/tn_pubr_public_acdnt_area_api`,
  gym: 'https://apis.data.go.kr/1741000/fitness_centers/info',
}

// ── 돌려주는 값 ─────────────────────────────────────────

/** 시설 하나: 이름 · WGS84 점(소수 6자리) */
export type Place = { name: string; lat: number; lng: number }
/** 받은 목록. capped = 정해 둔 쪽 수를 넘어 다 받지 못함 */
export type PlaceList<T extends Place = Place> = { items: T[]; capped: boolean }
export type SchoolLevel = '초' | '중' | '고'
export type SchoolPlace = Place & { level: SchoolLevel }
/** 영업 = open · 휴업 = paused(폐업·취소는 뺀다) */
export type GymStatus = 'open' | 'paused'
export type GymPlace = Place & { status: GymStatus }
export type AccidentSpot = Place & { cases: number }
/** 기준 연도(받은 줄 가운데 가장 새 사고 연도)의 지점만. 줄이 없으면 year는 null */
export type AccidentList = PlaceList<AccidentSpot> & { year: number | null }

// ── 글자·숫자·날짜·점 ───────────────────────────────────

type Row = Record<string, unknown>
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)

const textOf = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''

function numberOf(v: unknown): number | null {
  const s = textOf(v)
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// 0 이상 정수(사고 수·연도). 아니면 null
function countOf(v: unknown): number | null {
  const n = numberOf(v)
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null
}

// 'YYYY-MM-DD'·'YYYYMMDD'로 시작하는 글자(뒤에 시각이 붙어도 됨) → 한국 날짜. 아니면 null
function dayOf(v: unknown): string | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(textOf(v))
  if (m === null) return null
  const day = `${m[1]}-${m[2]}-${m[3]}`
  return isYmd(day) ? day : null
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6
type LatLng = { lat: number; lng: number }

// 위도·경도 칸(WGS84). 비었거나 (0,0)이거나 한국 밖(위도 33~39·경도 124~132)이면 null
function wgsPoint(lat: unknown, lng: unknown): LatLng | null {
  const a = numberOf(lat)
  const b = numberOf(lng)
  if (a === null || b === null || (a === 0 && b === 0)) return null
  if (!(a >= 33 && a <= 39 && b >= 124 && b <= 132)) return null
  return { lat: round6(a), lng: round6(b) }
}

// EPSG:5174 x·y 칸 → WGS84(coords.ts). 비었거나 (0,0)이거나 한국 밖이면 null
function tmPoint(x: unknown, y: unknown): LatLng | null {
  const a = numberOf(x)
  const b = numberOf(y)
  if (a === null || b === null || (a === 0 && b === 0)) return null
  return from5174(a, b)
}

function placeOf(name: unknown, at: LatLng | null): Place | null {
  const n = textOf(name)
  return n === '' || at === null ? null : { name: n, lat: at.lat, lng: at.lng }
}

const wordsOf = (s: string) => s.split(/\s+/).filter((w) => w !== '')

/** 주소 글자 가운데 하나라도 시군구 이름의 낱말을 차례대로 품으면 true('가람구'는 '가람구로'와 다르다, '수원시 영통구'처럼 두 낱말도 됨) */
export function inSgg(sggName: string, ...addresses: unknown[]): boolean {
  const want = wordsOf(sggName)
  if (want.length === 0) return false
  return addresses.some((address) => {
    const got = wordsOf(textOf(address))
    for (let i = 0; i + want.length <= got.length; i++) if (want.every((w, j) => got[i + j] === w)) return true
    return false
  })
}

// ── 요청 · 답 쪽 읽기 ─────────────────────────────────────

// 표준데이터는 type=json, 행정안전부 새 조회(gym)는 returnType=json
function pageRequests(kind: FacilityKind, filter: Record<string, string>): SiteRequest[] {
  const typeKey = kind === 'gym' ? 'returnType' : 'type'
  return Array.from({ length: FACILITY_PAGES[kind] }, (_, i) => {
    const params = new URLSearchParams({ pageNo: String(i + 1), numOfRows: String(ROWS_OF[kind]), [typeKey]: 'json', ...filter })
    return { url: `${URLS[kind]}?${params.toString()}` }
  })
}

type Page = { rows: Row[]; total: number }
type PageFail = 'not-applied' | 'failed'

// items: 줄 배열 · { item: 줄 배열 | 줄 하나 } · 빈 값. 그 밖의 모양은 null
function rowsOf(items: unknown): Row[] | null {
  if (items === undefined || items === null || items === '') return []
  let list: unknown[]
  if (Array.isArray(items)) list = items
  else if (isRow(items)) {
    const item = items.item
    list = item === undefined || item === null || item === '' ? [] : Array.isArray(item) ? item : [item]
  } else return null
  return list.every(isRow) ? list : null
}

// 공공데이터포털 답 한 쪽: { response: { header: { resultCode }, body: { items, totalCount } } }.
// 미등록 열쇠(30·20) = not-applied, NODATA(03) = 빈 쪽, 정상(00 · 새 조회는 0) 밖의 번호·JSON 아님·모양 틀림 = failed
function readPage(text: string): Page | PageFail {
  if (isNotRegistered(text)) return 'not-applied'
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return 'failed'
  }
  const response = isRow(json) ? json.response : undefined
  if (!isRow(response) || !isRow(response.header)) return 'failed'
  const code = textOf(response.header.resultCode)
  if (code === '03') return { rows: [], total: 0 }
  if ((code !== '00' && code !== '0') || !isRow(response.body)) return 'failed'
  const rows = rowsOf(response.body.items)
  if (rows === null) return 'failed'
  return { rows, total: countOf(response.body.totalCount) ?? 0 }
}

// 모든 쪽을 읽어 줄을 잇는다. 한 쪽이라도 미등록 열쇠면 not-applied, 그다음 하나라도 틀리면 failed
function readPages(texts: string[]): Page | PageFail {
  if (texts.length === 0) return 'failed'
  const pages = texts.map(readPage)
  if (pages.includes('not-applied')) return 'not-applied'
  const rows: Row[] = []
  let total = 0
  for (const page of pages) {
    if (page === 'failed' || page === 'not-applied') return 'failed'
    rows.push(...page.rows)
    total = Math.max(total, page.total)
  }
  return { rows, total }
}

type Kept<T> = { item: T; day: string | null }

// 쪽을 읽고 줄마다 값으로 바꾼다(null인 줄은 뺀다). capped = 전체 건수가 받은 한도를 넘음
function readKept<T>(kind: FacilityKind, texts: string[], toItem: (row: Row) => Kept<T> | null) {
  const got = readPages(texts)
  if (got === 'failed' || got === 'not-applied') return got
  const kept = got.rows.flatMap((row) => {
    const one = toItem(row)
    return one === null ? [] : [one]
  })
  return { kept, capped: got.total > FACILITY_PAGES[kind] * ROWS_OF[kind] }
}

// 기준 날짜 = 남긴 줄의 자료 안 날짜 가운데 가장 새 날, 없으면 받은 한국 날짜
function latestDay(kept: Kept<unknown>[], today: string): string {
  let latest: string | null = null
  for (const { day } of kept) if (day !== null && (latest === null || day > latest)) latest = day
  return latest ?? today
}

function placeList<T extends Place>(
  kind: FacilityKind,
  texts: string[],
  today: string,
  toItem: (row: Row) => Kept<T> | null,
): Parsed<PlaceList<T>> {
  const got = readKept(kind, texts, toItem)
  if (typeof got === 'string') return { ok: false, code: got }
  return { ok: true, value: { items: got.kept.map((k) => k.item), capped: got.capped }, asOf: latestDay(got.kept, today) }
}

// ── 종류마다 ─────────────────────────────────────────────

// 표준데이터 줄(도로명 rdnmadr · 지번 lnmadr · 위도 latitude · 경도 longitude · 데이터기준일자 referenceDate)
function stdPlace(row: Row, sggName: string, name: unknown): Kept<Place> | null {
  if (!inSgg(sggName, row.rdnmadr, row.lnmadr)) return null
  const place = placeOf(name, wgsPoint(row.latitude, row.longitude))
  return place === null ? null : { item: place, day: dayOf(row.referenceDate) }
}

export const marketAdapter: Adapter<'market', PlaceList> = {
  kind: 'market',
  src: 'market',
  key: 'data',
  requests: (q) => pageRequests('market', { rdnmadr: q.sggName }),
  parse: (texts, q, today) => placeList('market', texts, today, (row) => stdPlace(row, q.sggName, row.mrktNm)),
}

export const seniorAdapter: Adapter<'senior', PlaceList> = {
  kind: 'senior',
  src: 'senior',
  key: 'data',
  requests: (q) => pageRequests('senior', { rdnmadr: q.sggName }),
  parse: (texts, q, today) => placeList('senior', texts, today, (row) => stdPlace(row, q.sggName, row.fcltyNm)),
}

// 학교급 글자 → 초·중·고. 특수학교·각종학교 등은 뺀다
const LEVELS: Readonly<Record<string, SchoolLevel>> = { 초등학교: '초', 중학교: '중', 고등학교: '고' }

export const schoolAdapter: Adapter<'school', PlaceList<SchoolPlace>> = {
  kind: 'school',
  src: 'school',
  key: 'data',
  requests: (q) => pageRequests('school', { rdnmadr: q.sggName }),
  parse: (texts, q, today) =>
    placeList('school', texts, today, (row) => {
      const se = textOf(row.schoolSe)
      const status = textOf(row.operSttus)
      // 운영 상태 칸이 있으면 '운영'만(폐교·휴교 뺌)
      if (!Object.hasOwn(LEVELS, se) || (status !== '' && status !== '운영')) return null
      const kept = stdPlace(row, q.sggName, row.schoolNm)
      return kept === null ? null : { item: { ...kept.item, level: LEVELS[se] }, day: kept.day }
    }),
}

export const accidentAdapter: Adapter<'accident', AccidentList> = {
  kind: 'accident',
  src: 'accident',
  key: 'data',
  requests: (q) => pageRequests('accident', { sidoSggNm: `${q.sidoName} ${q.sggName}` }),
  parse: (texts, q, today) => {
    const got = readKept('accident', texts, (row) => {
      if (!inSgg(q.sggName, row.sidoSggNm, row.spotNm)) return null
      const place = placeOf(row.spotNm, wgsPoint(row.latitude, row.longitude))
      const year = countOf(row.acdntYear)
      const cases = countOf(row.occrrncCnt)
      if (place === null || year === null || year < 2000 || cases === null) return null
      return { item: { spot: { ...place, cases }, year }, day: dayOf(row.referenceDate) }
    })
    if (typeof got === 'string') return { ok: false, code: got }
    // 기준 연도: 여러 해 지점이 섞여 오면 가장 새 해만 센다(같은 지점을 두 번 세지 않게)
    const year = got.kept.reduce<number | null>((max, k) => (max === null || k.item.year > max ? k.item.year : max), null)
    const kept = got.kept.filter((k) => k.item.year === year)
    return {
      ok: true,
      value: { year, items: kept.map((k) => k.item.spot), capped: got.capped },
      asOf: latestDay(kept, today),
    }
  },
}

// 영업 상태 번호(SALS_STTS_CD): 01 영업/정상 · 02 휴업 · 그 밖(03 폐업 등)은 뺀다. 요청은 01만 거른다(휴업 줄은 진짜 답에서 못 봤다)
const GYM_STATUS: Readonly<Record<string, GymStatus>> = { '01': 'open', '02': 'paused' }
const GYM_OPEN = '01'

// 몸통에 시도 이름이 있으면 '시도 시군구'로 거른다('중구'처럼 여러 시도에 있는 이름). query.ts에 칸을 더해야 한다(TASK-47 보고)
const sidoOf = (q: object): string => {
  const v = (q as { sidoName?: unknown }).sidoName
  return typeof v === 'string' ? v.trim() : ''
}

export const gymAdapter: Adapter<'gym', PlaceList<GymPlace>> = {
  kind: 'gym',
  src: 'gym',
  key: 'data',
  requests: (q) =>
    pageRequests('gym', {
      'cond[ROAD_NM_ADDR::LIKE]': [sidoOf(q), q.sggName].filter((w) => w !== '').join(' '),
      'cond[SALS_STTS_CD::EQ]': GYM_OPEN,
    }),
  parse: (texts, q, today) =>
    placeList('gym', texts, today, (row) => {
      const code = textOf(row.SALS_STTS_CD)
      if (!Object.hasOwn(GYM_STATUS, code) || !inSgg(q.sggName, row.ROAD_NM_ADDR, row.LOTNO_ADDR)) return null
      const place = placeOf(row.BPLC_NM, tmPoint(row.CRD_INFO_X, row.CRD_INFO_Y))
      return place === null ? null : { item: { ...place, status: GYM_STATUS[code] }, day: dayOf(row.DAT_UPDT_PNT) }
    }),
}

/** 이 묶음의 읽는 곳(TASK-45가 registry.ts에 잇는다) */
export const FACILITY_ADAPTERS: { readonly [K in FacilityKind]: Adapter<K> } = {
  market: marketAdapter,
  senior: seniorAdapter,
  school: schoolAdapter,
  accident: accidentAdapter,
  gym: gymAdapter,
}
