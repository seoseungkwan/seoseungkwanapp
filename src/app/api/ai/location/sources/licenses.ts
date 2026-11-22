import 'server-only'
import { addDays, compareYmd, diffDays, isYmd } from '@/lib/analytics/dates'
import { from5174 } from '@/lib/location/coords'
import type { Adapter, Parsed, Point, QueryOf, SiteRequest } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 의원 개업·폐업(specs/location REQ-7904 AC-7904.1~4, design.md 4절 `clinic-license`, 조사 3).
// 행정안전부 건강_의원 조회서비스(data.go.kr 15154874, 공공데이터포털 열쇠). 의원·치과의원·한의원을 개업(open)은 인허가일 기간으로,
// 폐업(close)은 영업 상태 03(폐업) + 갱신 시각(기간 첫날 이상)으로 찾고 폐업일은 답에서 거른다 — 사이트 조건 칸은
// LCPMT_YMD(GTE·LT)·SALS_STTS_CD(EQ)·DAT_UPDT_PNT(GTE·LT)·ROAD_NM_ADDR(LIKE)·BPLC_NM·MDLCR_INST_BTP_NM뿐이고 폐업일 칸이 없다(TASK-47 진짜 답).
// 몸통에 주소 앞부분 addr('시도 시군구')가 있으면 도로명 주소로 거른다(없으면 전국 — 전국 3년은 쪽 한도를 넘는다).
// 기간은 최대 3년(checkQuery가 본다). 쪽은 기간 37일마다 하나, 30쪽까지(3년 = 30쪽), 한 쪽 100줄(사이트 한도). 전체 수가 받은 줄보다 많으면 capped.
// 좌표 EPSG:5174 → WGS84(coords.from5174). 좌표가 비었거나 0·글자·한국 밖인 줄, 이름이 빈 줄, 그 날짜가 기간 밖인 줄은 뺀다
// (from5174(0, 0)은 바다 위 점을 내놓아 0은 따로 뺀다). 자료 안에 기준 날짜가 없어 기준 날짜는 받은 한국 날짜다.
// 답 칸 이름은 대·소문자·밑줄을 가리지 않고, 표준 이름(BPLC_NM·LCPMT_YMD…)과 옛 인허가 자료 이름(BPLCNM·APVPERMYMD·DCBYMD…) 둘 다 읽는다

export const LICENSE_URL = 'https://apis.data.go.kr/1741000/clinics/info'
export const LICENSE_PAGE_ROWS = 100
export const LICENSE_MAX_PAGES = 30
export const LICENSE_DAYS_PER_PAGE = 37

// 요청 조건 칸: 개업 = 인허가일 기간 · 폐업 = 영업 상태 03 + 갱신 시각 · 주소 = 도로명 주소 부분 일치
const OPENED_ON = 'LCPMT_YMD'
const STATUS = 'SALS_STTS_CD'
const CLOSED = '03'
const UPDATED_AT = 'DAT_UPDT_PNT'
const ROAD = 'ROAD_NM_ADDR'

// 답 칸(대문자·밑줄 뺀 이름). 앞 이름이 있으면 그것을 쓴다
const FIELDS = {
  name: ['BPLCNM'], // 사업장명
  dept: ['MDEXMSBJCTCNNM', 'DGSBJTCNNM', 'TREATSBJTCNTNNM'], // 진료과목내용명
  openedOn: ['LCPMTYMD', 'APVPERMYMD'], // 인허가일자
  closedOn: ['CLSBIZYMD', 'DCBYMD'], // 폐업일자
  road: ['ROADNMADDR', 'RDNWHLADDR'], // 도로명 주소
  lot: ['LOTNOADDR', 'SITEWHLADDR'], // 지번 주소
  x: ['CRDINFOX', 'X'], // 좌표 x(EPSG:5174)
  y: ['CRDINFOY', 'Y'], // 좌표 y(EPSG:5174)
} as const
type Field = keyof typeof FIELDS

/** 의원 한 줄 — watch.ts LicenseRow로 그대로 넘긴다(점은 늘 있음) */
export type LicenseItem = {
  name: string
  dept: string
  openedOn: string | null
  closedOn: string | null
  address: string
  point: Point
}
export type LicenseValue = { rows: LicenseItem[]; capped: boolean }

type Q = QueryOf<'clinic-license'>
type Row = Record<string, unknown>

const pageCount = (q: Q) =>
  Math.min(LICENSE_MAX_PAGES, Math.max(1, Math.ceil((diffDays(q.from, q.to) + 1) / LICENSE_DAYS_PER_PAGE)))

const compact = (ymd: string) => ymd.replaceAll('-', '')
// 몸통에 TASK-47이 더할 칸(query.ts가 아직 모르면 없는 것으로 본다): 주소 앞부분 '시도 시군구'
const addrOf = (q: Q): string => {
  const v = (q as { addr?: unknown }).addr
  return typeof v === 'string' ? v.trim() : ''
}

function requests(q: Q): SiteRequest[] {
  const addr = addrOf(q)
  return Array.from({ length: pageCount(q) }, (_, i) => {
    const params = new URLSearchParams({ pageNo: String(i + 1), numOfRows: String(LICENSE_PAGE_ROWS), returnType: 'json' })
    if (q.event === 'open') {
      params.append(`cond[${OPENED_ON}::GTE]`, compact(q.from))
      params.append(`cond[${OPENED_ON}::LT]`, compact(addDays(q.to, 1)))
    } else {
      // 폐업한 날 뒤에야 갱신되므로 갱신 시각이 기간 첫날 앞인 줄은 기간 안에 폐업했을 수 없다
      params.append(`cond[${STATUS}::EQ]`, CLOSED)
      params.append(`cond[${UPDATED_AT}::GTE]`, `${compact(q.from)}000000`)
    }
    if (addr !== '') params.append(`cond[${ROAD}::LIKE]`, addr)
    return { url: `${LICENSE_URL}?${params}` }
  })
}

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const isBlank = (v: unknown) => v === undefined || v === null || v === ''

// 한 쪽: 줄(모양만 본 것)과 전체 수(없으면 null). 모양이 틀리거나 오류 코드면 null
type Page = { rows: Row[]; total: number | null }

function listOf(items: unknown): Row[] | null {
  if (isBlank(items)) return []
  let list: unknown[]
  if (Array.isArray(items)) list = items
  else if (isRow(items)) list = isBlank(items.item) ? [] : Array.isArray(items.item) ? items.item : [items.item]
  else return null
  return list.every(isRow) ? list : null
}

function countOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
  return Number.isInteger(n) && n >= 0 ? n : null
}

function readPage(text: string): Page | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  const res = isRow(data) ? data.response : undefined
  if (!isRow(res)) return null
  // 결과 코드: 0 = 정상 · 3 = 자료 없음(빈 목록) · 그 밖 = 실패. 머리가 없으면 정상으로 본다
  const header = res.header
  const code = isRow(header) && !isBlank(header.resultCode) ? Number(header.resultCode) : 0
  if (code === 3) return { rows: [], total: 0 }
  if (code !== 0) return null
  const body = res.body
  if (!isRow(body)) return null
  const rows = listOf(body.items)
  return rows === null ? null : { rows, total: countOf(body.totalCount) }
}

// 칸 이름은 대·소문자·밑줄을 가리지 않는다
function picker(row: Row): (field: Field) => unknown {
  const byName = new Map(Object.entries(row).map(([k, v]) => [k.replaceAll('_', '').toUpperCase(), v]))
  return (field) => {
    for (const name of FIELDS[field]) if (!isBlank(byName.get(name))) return byName.get(name)
    return undefined
  }
}

const textOf = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')

// 'YYYYMMDD' · 'YYYY-MM-DD'(뒤에 시각이 붙어도) → 'YYYY-MM-DD', 아니면 null
function dayOf(v: unknown): string | null {
  const m = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/.exec(textOf(v))
  if (m === null) return null
  const day = `${m[1]}-${m[2]}-${m[3]}`
  return isYmd(day) ? day : null
}

// 좌표 칸 하나: 빈칸·글자·0은 없음
function coordOf(v: unknown): number | null {
  const s = textOf(v)
  const n = s === '' ? Number.NaN : Number(s)
  return Number.isFinite(n) && n !== 0 ? n : null
}

function itemOf(row: Row, q: Q): LicenseItem | null {
  const get = picker(row)
  const name = textOf(get('name'))
  if (name === '') return null
  const openedOn = dayOf(get('openedOn'))
  const closedOn = dayOf(get('closedOn'))
  const on = q.event === 'open' ? openedOn : closedOn
  if (on === null || compareYmd(on, q.from) < 0 || compareYmd(on, q.to) > 0) return null
  const x = coordOf(get('x'))
  const y = coordOf(get('y'))
  const point = x === null || y === null ? null : from5174(x, y)
  if (point === null) return null
  const road = textOf(get('road'))
  return { name, dept: textOf(get('dept')), openedOn, closedOn, address: road !== '' ? road : textOf(get('lot')), point }
}

function parse(texts: string[], q: Q, today: string): Parsed<LicenseValue> {
  if (texts.length !== pageCount(q)) return { ok: false, code: 'failed' }
  if (texts.some(isNotRegistered)) return { ok: false, code: 'not-applied' }
  const rows: LicenseItem[] = []
  const seen = new Set<string>()
  let received = 0
  let lastPage = 0
  let total: number | null = null
  for (const text of texts) {
    const page = readPage(text)
    if (page === null) return { ok: false, code: 'failed' }
    received += page.rows.length
    lastPage = page.rows.length
    if (page.total !== null) total = Math.max(total ?? 0, page.total)
    for (const row of page.rows) {
      const item = itemOf(row, q)
      if (item === null) continue
      const key = [item.name, item.openedOn, item.closedOn, item.point.lat, item.point.lng].join('\n')
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(item)
    }
  }
  // 전체 수 칸이 없으면 마지막 쪽이 꽉 찼을 때 더 있다고 본다
  const capped = total !== null ? total > received : lastPage >= LICENSE_PAGE_ROWS
  return { ok: true, value: { rows, capped }, asOf: today }
}

export const clinicLicense: Adapter<'clinic-license', LicenseValue> = {
  kind: 'clinic-license',
  src: 'clinic-license',
  key: 'data',
  requests,
  parse,
}
