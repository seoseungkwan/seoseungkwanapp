import 'server-only'
import { monthRange } from '@/lib/analytics/dates'
import type { FlowBusName, FlowMode, FlowRailName, FlowVolume, FlowVolumeRow } from '@/lib/location/flow'
import type { Adapter, Parsed, QueryKind, SiteRequest } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 사람 흐름(승하차 인원) 바깥 자료 읽기(specs/location REQ-7904, design.md 4절, 조사 4). 요청 만들기·답 읽기만 하는 순수 함수다.
// flow-volume = 국토교통부 정류장별 이용량(15142066) · flow-bus = 버스정류장(15142032) · flow-rail = 도시철도 노선별 경유역(15142034).
// 모두 공공데이터포털 열쇠(apis.data.go.kr), 열쇠는 fetchSource가 serviceKey 칸으로 넣는다(주소에 넣지 않음).
// 주소·칸 이름은 확인할 것 6 — 열쇠 없이는 진짜 답을 못 봐서 지어 둔 이름이다. TASK-47이 진짜 답으로 아래 FLOW_PATHS·FIELDS와 견본을 함께 고친다

const HOST = 'https://apis.data.go.kr'
type FlowKind = Extract<QueryKind, 'flow-volume' | 'flow-bus' | 'flow-rail'>

/** 종류마다 부르는 경로(확인할 것 6) */
export const FLOW_PATHS: Readonly<Record<FlowKind, string>> = {
  'flow-volume': '/1613000/TripVolumebyStop/getTripVolumebyStopMonth',
  'flow-bus': '/1613000/BusStopInfo/getBusStopList',
  'flow-rail': '/1613000/SubwayRouteStation/getSubwayRouteStationList',
}
/** 종류마다 쪽 수(design.md 4절 '쪽') · 쪽마다 줄 수 */
export const FLOW_PAGES: Readonly<Record<FlowKind, number>> = { 'flow-volume': 30, 'flow-bus': 20, 'flow-rail': 5 }
export const FLOW_ROWS = 1000

// 요청 칸·답 칸 이름 한 곳(확인할 것 6)
const PARAMS = { sido: 'ctpvCd', sgg: 'sggCd', ym: 'crtrYm' } as const
const FIELDS = {
  id: 'sttnId', // 정류장(역) ID
  mode: 'tfcmnNm', // 버스 · 지하철
  board: 'rideNope', // 한 달 승차 인원
  alight: 'alghNope', // 한 달 하차 인원
  days: 'dayCnt', // 그 달 날 수
  name: 'sttnNm', // 정류장 이름 · 역 이름
  ars: 'arsNo', // 버스 ARS 번호
  line: 'lineNm', // 도시철도 노선
} as const
const MODES: Readonly<Record<string, FlowMode>> = { 버스: 'bus', 지하철: 'rail' }
// 공공데이터포털 답 머리: 정상 · 자료 없음(빈 답 — 실패가 아니다)
const OK = '00'
const NO_DATA = '03'

// ── 요청 ──

function pageRequests(kind: FlowKind, params: Record<string, string>): SiteRequest[] {
  return Array.from({ length: FLOW_PAGES[kind] }, (_, i) => {
    const search = new URLSearchParams({ ...params, pageNo: String(i + 1), numOfRows: String(FLOW_ROWS), _type: 'json' })
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

// 한 쪽: { response: { header: { resultCode }, body: { items: { item: [..] | {..} } | '', totalCount } } }
function readPage(text: string): Page | Bad {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return BAD
  }
  const response = isPlain(json) ? json.response : undefined
  if (!isPlain(response) || !isPlain(response.header)) return BAD
  const code = textOf(response.header.resultCode)
  if (code === NO_DATA) return { total: 0, items: [] }
  if (code !== OK || !isPlain(response.body)) return BAD
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

// 요청한 쪽 수만큼 답을 읽어 줄을 모은다. 미등록 열쇠 답이 하나라도 있으면 not-applied,
// 쪽 수가 다르거나 · 한 쪽이라도 모양이 틀리거나 · 전체 줄 수(첫 쪽 totalCount)가 쪽 한도를 넘으면 failed(일부만 더하지 않는다)
function readPages(kind: FlowKind, texts: readonly string[]): Item[] | 'not-applied' | 'failed' {
  if (texts.some((t) => typeof t === 'string' && isNotRegistered(t))) return 'not-applied'
  if (texts.length !== FLOW_PAGES[kind]) return 'failed'
  const items: Item[] = []
  let total = 0
  for (const [i, text] of texts.entries()) {
    const page = typeof text === 'string' ? readPage(text) : BAD
    if (page === BAD) return 'failed'
    if (i === 0) total = page.total
    items.push(...page.items)
  }
  if (total > FLOW_PAGES[kind] * FLOW_ROWS) return 'failed'
  return items
}

// 줄마다 읽고(하나라도 틀리면 failed) 다 읽은 줄로 값을 만든다
function readAll<V, R>(
  kind: FlowKind,
  texts: readonly string[],
  asOf: string,
  rowOf: (item: Item) => V | Bad,
  done: (rows: V[]) => R,
): Parsed<R> {
  const items = readPages(kind, texts)
  if (!Array.isArray(items)) return { ok: false, code: items }
  const rows: V[] = []
  for (const item of items) {
    const row = rowOf(item)
    if (row === BAD) return { ok: false, code: 'failed' }
    rows.push(row)
  }
  return { ok: true, value: done(rows), asOf }
}
const asIs = <V>(rows: V[]) => rows

function volumeRow(item: Item): FlowVolumeRow | Bad {
  const id = idOf(item[FIELDS.id])
  const mode = MODES[textOf(item[FIELDS.mode])]
  const board = countOf(item[FIELDS.board])
  const alight = countOf(item[FIELDS.alight])
  const days = countOf(item[FIELDS.days])
  if (id === BAD || mode === undefined || board === BAD || alight === BAD || days === BAD || days < 1 || days > 31) return BAD
  return { id, mode, board, alight, days }
}

// 같은 ID 줄이 여럿(시간대 칸)이면 승차·하차는 더하고 날 수는 가장 큰 값, 버스/지하철은 첫 줄 것. 차례는 처음 나온 차례
function mergeById(rows: readonly FlowVolumeRow[]): FlowVolumeRow[] {
  const byId = new Map<string, FlowVolumeRow>()
  for (const row of rows) {
    const seen = byId.get(row.id)
    if (seen) byId.set(row.id, { ...seen, board: seen.board + row.board, alight: seen.alight + row.alight, days: Math.max(seen.days, row.days) })
    else byId.set(row.id, { ...row })
  }
  return [...byId.values()]
}

/** flow-volume: 시도·시군구 번호·연월 → 정류장(역) ID마다 한 달 승차·하차·날 수. 기준 날짜는 그 달 말일 */
export const flowVolume: Adapter<'flow-volume', FlowVolume> = {
  kind: 'flow-volume',
  src: 'flow-volume',
  key: 'data',
  requests: (q) => pageRequests('flow-volume', { [PARAMS.sido]: q.sido, [PARAMS.sgg]: q.sgg, [PARAMS.ym]: q.ym.replace('-', '') }),
  parse: (texts, q) => readAll('flow-volume', texts, monthRange(q.ym).to, volumeRow, (rows) => ({ ym: q.ym, rows: mergeById(rows) })),
}

function busName(item: Item): FlowBusName | Bad {
  const id = idOf(item[FIELDS.id])
  const name = nameOf(item[FIELDS.name])
  if (id === BAD || name === BAD) return BAD
  const ars = textOf(item[FIELDS.ars])
  return { id, name, ars: ars === '' ? null : ars }
}

function railName(item: Item): FlowRailName | Bad {
  const id = idOf(item[FIELDS.id])
  const name = nameOf(item[FIELDS.name])
  const line = nameOf(item[FIELDS.line])
  return id === BAD || name === BAD || line === BAD ? BAD : { id, name, line }
}

/** flow-bus: 시군구 번호 → 정류장 ID·이름·ARS 번호(빈 칸은 null). 자료 안 날짜가 없어 기준 날짜는 받은 날 */
export const flowBus: Adapter<'flow-bus', FlowBusName[]> = {
  kind: 'flow-bus',
  src: 'flow-bus',
  key: 'data',
  requests: (q) => pageRequests('flow-bus', { [PARAMS.sgg]: q.sgg }),
  parse: (texts, _q, today) => readAll('flow-bus', texts, today, busName, asIs),
}

/** flow-rail: 시군구 번호 → 역 ID·역 이름·노선. 기준 날짜는 받은 날 */
export const flowRail: Adapter<'flow-rail', FlowRailName[]> = {
  kind: 'flow-rail',
  src: 'flow-rail',
  key: 'data',
  requests: (q) => pageRequests('flow-rail', { [PARAMS.sgg]: q.sgg }),
  parse: (texts, _q, today) => readAll('flow-rail', texts, today, railName, asIs),
}
