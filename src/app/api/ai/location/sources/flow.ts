import 'server-only'
import { monthRange } from '@/lib/analytics/dates'
import type { FlowBusName, FlowMode, FlowRailName, FlowVolume, FlowVolumeRow } from '@/lib/location/flow'
import type { Adapter, Parsed, QueryKind, QueryOf, SiteRequest } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 사람 흐름(승하차 인원) 바깥 자료 읽기(specs/location REQ-7904, design.md 4절, 조사 4). 요청 만들기·답 읽기만 하는 순수 함수다.
// flow-volume = 국토교통부 정류장별 이용량(15142066) · flow-bus = 버스정류장(15142032) · flow-rail = 도시철도 노선별 경유역(15142034).
// 모두 공공데이터포털 열쇠(apis.data.go.kr), 열쇠는 fetchSource가 serviceKey 칸으로 넣는다(주소에 넣지 않음).
// TASK-47(2026-11-22 진짜 열쇠, 서울 종로구)로 주소·칸을 맞췄다:
//  - 답은 { Response: { header: { resultCode: '200' }, body: { items: { item }, totalCount } } }, 오류는 { Error: { code, message } }
//    (50 = 자료 없음 → 빈 쪽 · 51 틀린 칸 · 52 빠진 칸 → failed). 한 쪽 1,000줄이 한도다(5,000은 51)
//  - 이용량은 정류장 × 이용자 유형 × 시간대 줄이라 한 시군구 한 달이 수만 줄이다(종로구 2026-09 = 41,700줄. 2026-11-22에 2026-10 줄은 아직 없었다) →
//    한 묶음 = 10쪽(1만 줄), 몸통의 part(0부터)로 묶음을 고르고 답에 전체 줄 수(total)·묶음 수(parts)를 실어 모으기가 나머지 묶음을 부른다
//  - 정류장 목록은 운행 일자(opr_ymd, 그 달 1일)가 있어야 줄이 온다. 도시철도 목록은 시군구 칸이 없어 전국 목록(약 1,100역)이다

const HOST = 'https://apis.data.go.kr'
type FlowKind = Extract<QueryKind, 'flow-volume' | 'flow-bus' | 'flow-rail'>

/** 종류마다 부르는 경로(진짜 답으로 확인) */
export const FLOW_PATHS: Readonly<Record<FlowKind, string>> = {
  'flow-volume': '/1613000/TripVolumebyStop/getMonthlyTripVolumebyStop',
  'flow-bus': '/1613000/BusStop/getBusStop',
  'flow-rail': '/1613000/UrbanRailwayLinespecificStation/getUrbanRailwayLinespecificStation',
}
/** 종류마다 쪽 수(이용량은 한 묶음) · 쪽마다 줄 수(사이트 한도) */
export const FLOW_PAGES: Readonly<Record<FlowKind, number>> = { 'flow-volume': 10, 'flow-bus': 5, 'flow-rail': 3 }
export const FLOW_ROWS = 1000
/** 이용량 한 묶음의 줄 수 */
const PART_ROWS = FLOW_PAGES['flow-volume'] * FLOW_ROWS

// 요청 칸·답 칸 이름 한 곳
const PARAMS = { sido: 'ctpv_cd', sgg: 'sgg_cd', ym: 'opr_ym', day: 'opr_ymd' } as const
const FIELDS = {
  id: 'sttn_id', // 정류장(역) ID
  mode: 'trfc_mns_se_cd', // 교통수단 B 버스 · T 도시철도
  board: 'ride_nope', // 승차 인원
  alight: 'goff_nope', // 하차 인원
  name: 'sttn_nm', // 정류장 이름 · 역 이름('가람 [1호선]'처럼 뒤에 노선이 붙어 온다)
  ars: 'sttn_ars_no', // 버스 ARS 번호(없으면 '~' 또는 빈칸)
  line: 'rte_nm', // 도시철도 노선
} as const
const MODES: Readonly<Record<string, FlowMode>> = { B: 'bus', T: 'rail' }
const OK = '200'
const NO_DATA = '50'

// ── 요청 ──

// 몸통에 TASK-47이 더할 칸(query.ts가 아직 모르면 없는 것으로 본다): 이용량 묶음 번호 part · 목록 운행 연월 ym
const partOf = (q: QueryOf<'flow-volume'>): number | null => {
  const p = (q as { part?: unknown }).part
  return typeof p === 'number' && Number.isSafeInteger(p) && p >= 0 ? p : null
}
const ymOf = (q: object): string | null => {
  const ym = (q as { ym?: unknown }).ym
  return typeof ym === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(ym) ? ym : null
}
const firstDay = (q: object): Record<string, string> => {
  const ym = ymOf(q)
  return ym === null ? {} : { [PARAMS.day]: `${ym.replace('-', '')}01` }
}

function pageRequests(kind: FlowKind, params: Record<string, string>, firstPage = 1): SiteRequest[] {
  return Array.from({ length: FLOW_PAGES[kind] }, (_, i) => {
    const search = new URLSearchParams({ ...params, pageNo: String(firstPage + i), numOfRows: String(FLOW_ROWS), dataType: 'JSON' })
    return { url: `${HOST}${FLOW_PATHS[kind]}?${search}` }
  })
}

// ── 답 읽기 ──

type Item = Record<string, unknown>
const BAD = Symbol('bad')
type Bad = typeof BAD

const isPlain = (v: unknown): v is Item => typeof v === 'object' && v !== null && !Array.isArray(v)
// 글자 칸: 글자·숫자를 글자로(앞뒤 공백 뺌). 없거나 다른 모양이면 ''
const textOf = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
// 0 이상 정수: 숫자 또는 숫자 글자(쉼표 허용)
const DIGITS = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/
function countOf(v: unknown): number | Bad {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? v : BAD
  if (typeof v !== 'string' || !DIGITS.test(v.trim())) return BAD
  const n = Number(v.trim().replace(/,/g, ''))
  return Number.isSafeInteger(n) ? n : BAD
}
const ID = /^[0-9A-Za-z]{1,20}$/
const idOf = (v: unknown): string | Bad => {
  const id = textOf(v)
  return ID.test(id) ? id : BAD
}
const nameOf = (v: unknown): string | Bad => {
  const name = textOf(v)
  return name !== '' && name.length <= 100 ? name : BAD
}

type Page = { total: number; items: Item[] }

// 한 쪽: 정상 { Response: { header, body } } · 오류 { Error: { code } }(50 자료 없음은 빈 쪽)
function readPage(text: string): Page | Bad {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return BAD
  }
  if (!isPlain(json)) return BAD
  if (isPlain(json.Error)) return textOf(json.Error.code) === NO_DATA ? { total: 0, items: [] } : BAD
  const response = json.Response
  if (!isPlain(response) || !isPlain(response.header)) return BAD
  if (textOf(response.header.resultCode) !== OK || !isPlain(response.body)) return BAD
  const total = countOf(response.body.totalCount)
  if (total === BAD) return BAD
  const items = response.body.items
  if (items === undefined || items === null || items === '') return { total, items: [] }
  if (!isPlain(items)) return BAD
  const item = items.item
  if (item === undefined || item === null || item === '') return { total, items: [] }
  const list = Array.isArray(item) ? item : [item]
  return list.every(isPlain) ? { total, items: list } : BAD
}

// 요청한 쪽 수만큼 답을 읽어 줄과 전체 줄 수(쪽들 가운데 가장 큰 값)를 모은다. 미등록 열쇠 답이 하나라도 있으면 not-applied,
// 쪽 수가 다르거나 · 한 쪽이라도 모양이 틀리면 failed
function readPages(kind: FlowKind, texts: readonly string[]): Page | 'not-applied' | 'failed' {
  if (texts.some((t) => typeof t === 'string' && isNotRegistered(t))) return 'not-applied'
  if (texts.length !== FLOW_PAGES[kind]) return 'failed'
  const items: Item[] = []
  let total = 0
  for (const text of texts) {
    const page = typeof text === 'string' ? readPage(text) : BAD
    if (page === BAD) return 'failed'
    total = Math.max(total, page.total)
    items.push(...page.items)
  }
  return { total, items }
}

// 줄마다 읽고(하나라도 틀리면 failed, null은 뺄 줄) 다 읽은 줄로 값을 만든다. limit가 있으면 전체 줄 수가 넘을 때 failed(일부만 더하지 않는다)
function readAll<V, R>(
  kind: FlowKind,
  texts: readonly string[],
  asOf: string,
  rowOf: (item: Item) => V | null | Bad,
  done: (rows: V[], total: number) => R,
  limit: number | null = FLOW_PAGES[kind] * FLOW_ROWS,
): Parsed<R> {
  const page = readPages(kind, texts)
  if (typeof page === 'string') return { ok: false, code: page }
  if (limit !== null && page.total > limit) return { ok: false, code: 'failed' }
  const rows: V[] = []
  for (const item of page.items) {
    const row = rowOf(item)
    if (row === BAD) return { ok: false, code: 'failed' }
    if (row !== null) rows.push(row)
  }
  return { ok: true, value: done(rows, page.total), asOf }
}

// 그 달 날 수(2월은 윤년 29일)
const daysIn = (ym: string) => Number(monthRange(ym).to.slice(8, 10))

// 교통수단이 B·T가 아닌 줄은 뺀다(null). 승차·하차가 숫자가 아니면 틀린 답
function volumeRow(days: number) {
  return (item: Item): FlowVolumeRow | null | Bad => {
    const id = idOf(item[FIELDS.id])
    const board = countOf(item[FIELDS.board])
    const alight = countOf(item[FIELDS.alight])
    if (id === BAD || board === BAD || alight === BAD) return BAD
    const mode = MODES[textOf(item[FIELDS.mode])]
    return mode === undefined ? null : { id, mode, board, alight, days }
  }
}

// 같은 ID 줄이 여럿(이용자 유형·시간대)이면 승차·하차는 더하고 날 수는 가장 큰 값, 버스/지하철은 첫 줄 것. 차례는 처음 나온 차례
function mergeById(rows: readonly FlowVolumeRow[]): FlowVolumeRow[] {
  const byId = new Map<string, FlowVolumeRow>()
  for (const row of rows) {
    const seen = byId.get(row.id)
    if (seen) byId.set(row.id, { ...seen, board: seen.board + row.board, alight: seen.alight + row.alight, days: Math.max(seen.days, row.days) })
    else byId.set(row.id, { ...row })
  }
  return [...byId.values()]
}

/**
 * flow-volume: 시도·시군구 번호·연월(+ 묶음 번호 part) → 정류장(역) ID마다 한 달 승차·하차·날 수(그 달 날 수).
 * part가 없으면 첫 묶음이고 전체 줄 수가 한 묶음을 넘으면 failed, part가 있으면 그 묶음 줄만 돌려준다. 기준 날짜는 그 달 말일
 */
export const flowVolume: Adapter<'flow-volume', FlowVolume> = {
  kind: 'flow-volume',
  src: 'flow-volume',
  key: 'data',
  requests: (q) =>
    pageRequests(
      'flow-volume',
      { [PARAMS.sido]: q.sido, [PARAMS.sgg]: q.sgg, [PARAMS.ym]: q.ym.replace('-', '') },
      (partOf(q) ?? 0) * FLOW_PAGES['flow-volume'] + 1,
    ),
  parse: (texts, q) =>
    readAll(
      'flow-volume',
      texts,
      monthRange(q.ym).to,
      volumeRow(daysIn(q.ym)),
      (rows, total) => ({ ym: q.ym, total, parts: Math.ceil(total / PART_ROWS), rows: mergeById(rows) }),
      partOf(q) === null ? PART_ROWS : null,
    ),
}

// ARS 번호: 숫자(줄표 사이)만. '~'·빈칸 등은 없음
const ARS = /^\d+(?:-\d+)*$/
function busName(item: Item): FlowBusName | Bad {
  const id = idOf(item[FIELDS.id])
  const name = nameOf(item[FIELDS.name])
  if (id === BAD || name === BAD) return BAD
  const ars = textOf(item[FIELDS.ars])
  return { id, name, ars: ARS.test(ars) ? ars : null }
}

// 역 이름 뒤의 ' [노선]'은 뺀다
function railName(item: Item): FlowRailName | Bad {
  const id = idOf(item[FIELDS.id])
  const name = nameOf(textOf(item[FIELDS.name]).replace(/\s*\[[^\]]*\]\s*$/, ''))
  const line = nameOf(item[FIELDS.line])
  return id === BAD || name === BAD || line === BAD ? BAD : { id, name, line }
}

/** flow-bus: 시도·시군구 번호·운행 연월(그 달 1일) → 정류장 ID·이름·ARS 번호(숫자가 아니면 null). 기준 날짜는 받은 날 */
export const flowBus: Adapter<'flow-bus', FlowBusName[]> = {
  kind: 'flow-bus',
  src: 'flow-bus',
  key: 'data',
  requests: (q) => pageRequests('flow-bus', { [PARAMS.sido]: q.sgg.slice(0, 2), [PARAMS.sgg]: q.sgg, ...firstDay(q) }),
  parse: (texts, _q, today) => readAll('flow-bus', texts, today, busName, (rows) => rows),
}

/** flow-rail: 운행 연월(그 달 1일) → 전국 역 ID·역 이름·노선(시군구 칸이 없다). 기준 날짜는 받은 날 */
export const flowRail: Adapter<'flow-rail', FlowRailName[]> = {
  kind: 'flow-rail',
  src: 'flow-rail',
  key: 'data',
  requests: (q) => pageRequests('flow-rail', firstDay(q)),
  parse: (texts, _q, today) => readAll('flow-rail', texts, today, railName, (rows) => rows),
}
