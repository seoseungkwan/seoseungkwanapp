import 'server-only'
import { parseDateCell } from '@/lib/analytics/dates'
import { toStoredM2 } from '@/lib/location/area'
import type { Adapter, Parsed, QueryOf, SiteRequest } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 바깥 자료 — 건축물대장 표제부·층별개요(specs/location TASK-20, REQ-7904, design.md 4·5절).
// 국토교통부 건축HUB 건축물대장정보 서비스(15134735, 공공데이터포털 열쇠, 출처 id `building`).
// 요청 칸은 design.md 5절 코드 규칙(시군구 5 · 법정동 뒤 5 · 번 4 · 지 4 · 대지 구분 산 1/아님 0 — regions.ts landCodes가 만든다).
// 위반 건축물 칸은 읽지 않는다(공개 자료가 아니라 사용자가 고른다). 기준 날짜는 받은 날이다: 대장은 늘 고쳐지는 자료이고
// 줄마다 있는 생성일자(crtnDay)는 그 줄을 만든 날이라 자료 기준일이 아니다.
// 한 지번에 건물(동)이 여럿일 수 있어 둘 다 목록을 돌려준다. 표제부는 주건축물·큰 연면적 차례(첫째가 본 건물),
// 층별개요 줄은 건물 열쇠 pk를 달아 모으는 쪽(lib/location/collect.ts)이 첫째 건물 줄만 고른다. 순수 함수다

export type BuildingTitle = {
  pk: string // 관리건축물대장 PK — 층별개요 줄을 이 건물로 고를 때만 쓴다
  usage: string // 주용도(기타 용도)
  structure: string
  above: number
  below: number
  totalM2: number // 연면적 ㎡ 소수 2자리 버림
  approvedOn: string | null // 사용승인일 'YYYY-MM-DD'
  elevators: number | null // 승용 + 비상용, 칸이 다 없으면 null(확인할 것 4)
  parking: number | null // 옥내·옥외 기계식·자주식 합, 칸이 다 없으면 null
}
export type BuildingTitles = { buildings: BuildingTitle[]; capped: boolean }
export type BuildingFloor = { pk: string; label: string; usage: string; m2: number } // label: '지1'·'1'·'옥탑'
export type BuildingFloors = { floors: BuildingFloor[]; capped: boolean }

const BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService'
const ROWS = 100
const FLOOR_PAGES = 3 // design.md 4절 '쪽'
const UNKNOWN_FLOOR = '층 모름'

type BuildingQuery = QueryOf<'bld-title'> | QueryOf<'bld-floor'>
type Row = Record<string, unknown>

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)

function requestsFor(op: string, q: BuildingQuery, pages: number): SiteRequest[] {
  const ok =
    /^\d{5}$/.test(q.sgg) && /^\d{5}$/.test(q.bjdong) && /^\d{4}$/.test(q.bun) && /^\d{4}$/.test(q.ji) && (q.plat === '0' || q.plat === '1')
  if (!ok) throw new Error('건축물대장 열쇠 모양이 틀렸어요')
  return Array.from({ length: pages }, (_, i) => {
    const params = new URLSearchParams({
      sigunguCd: q.sgg,
      bjdongCd: q.bjdong,
      platGbCd: q.plat,
      bun: q.bun,
      ji: q.ji,
      numOfRows: String(ROWS),
      pageNo: String(i + 1),
      _type: 'json',
    })
    return { url: `${BASE}/${op}?${params}` }
  })
}

// ── 칸 읽기 ──

const textOf = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')

function numberOf(v: unknown): number | null {
  const s = textOf(v)
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** 0 이상 정수(버림). 칸이 없거나 비었거나 음수면 null */
function countOf(v: unknown): number | null {
  const n = numberOf(v)
  return n === null || n < 0 ? null : Math.floor(n)
}

/** 칸 여럿의 합. 값 있는 칸이 하나도 없으면 null */
function sumOf(row: Row, names: readonly string[]): number | null {
  const got = names.map((name) => countOf(row[name])).filter((n): n is number => n !== null)
  return got.length === 0 ? null : got.reduce((a, b) => a + b, 0)
}

/** ㎡ 소수 2자리 버림(area.ts). 없거나 0 이하면 0, 저장 칸보다 큰 건물은 ㎡ 정수 */
function m2Of(v: unknown): number {
  const n = numberOf(v)
  if (n === null || n <= 0) return 0
  return toStoredM2(n, 'm2') ?? Math.floor(n)
}

/** 주용도(기타 용도). 하나만 있으면 그것, 같거나 기타 용도가 주용도를 품으면(진짜 답 '제1종근린생활시설(지역자치센터)') 기타 용도 */
function usageOf(row: Row): string {
  const main = textOf(row.mainPurpsCdNm)
  const etc = textOf(row.etcPurps)
  if (main === '' || etc === '' || etc.includes(main)) return etc || main
  return `${main}(${etc})`
}

// ── 공공데이터포털 JSON 쪽 답 ──

type Page = { rows: Row[]; total: number }
type Fail = 'not-applied' | 'failed'

function readPage(text: string): Page | Fail {
  if (isNotRegistered(text)) return 'not-applied'
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return 'failed'
  }
  const response = isRow(data) ? data.response : undefined
  const header = isRow(response) ? response.header : undefined
  if (!isRow(response) || !isRow(header)) return 'failed'
  const code = textOf(header.resultCode)
  if (code === '03') return { rows: [], total: 0 } // NODATA_ERROR
  if (code !== '00') return 'failed'
  const body = response.body
  if (!isRow(body)) return 'failed'
  const total = countOf(body.totalCount)
  if (total === null) return 'failed'
  const items = body.items
  if (items === undefined || items === null || items === '') return { rows: [], total }
  if (!isRow(items)) return 'failed'
  if (items.item === undefined) return { rows: [], total }
  // 한 줄이면 배열이 아니라 객체 하나로 온다
  const list: unknown[] = Array.isArray(items.item) ? items.item : [items.item]
  return list.every(isRow) ? { rows: list, total } : 'failed'
}

/** 쪽 답을 차례로 이어 읽는다. 한 쪽이라도 틀리면 그 까닭 */
function readPages(texts: string[]): Page | Fail {
  if (texts.length === 0) return 'failed'
  const rows: Row[] = []
  let total = 0
  for (const text of texts) {
    const page = readPage(text)
    if (typeof page === 'string') return page
    rows.push(...page.rows)
    total = Math.max(total, page.total)
  }
  return { rows, total }
}

// ── 표제부 ──

function titleOf(row: Row): BuildingTitle {
  return {
    pk: textOf(row.mgmBldrgstPk),
    usage: usageOf(row),
    structure: textOf(row.strctCdNm) || textOf(row.etcStrct),
    above: countOf(row.grndFlrCnt) ?? 0,
    below: countOf(row.ugrndFlrCnt) ?? 0,
    totalM2: m2Of(row.totArea),
    approvedOn: parseDateCell(textOf(row.useAprDay)),
    elevators: sumOf(row, ['rideUseElvtCnt', 'emgenUseElvtCnt']),
    parking: sumOf(row, ['indrMechUtcnt', 'oudrMechUtcnt', 'indrAutoUtcnt', 'oudrAutoUtcnt']),
  }
}

export const bldTitle: Adapter<'bld-title', BuildingTitles> = {
  kind: 'bld-title',
  src: 'building',
  key: 'data',
  requests: (q) => requestsFor('getBrTitleInfo', q, 1),
  parse(texts, _q, today): Parsed<BuildingTitles> {
    const got = readPages(texts)
    if (typeof got === 'string') return { ok: false, code: got }
    // 주건축물(부속 '1'이 아님) 먼저, 그다음 큰 연면적
    const buildings = got.rows
      .map((row) => ({ annex: textOf(row.mainAtchGbCd) === '1', title: titleOf(row) }))
      .sort((a, b) => Number(a.annex) - Number(b.annex) || b.title.totalM2 - a.title.totalM2)
      .map((b) => b.title)
    return { ok: true, value: { buildings, capped: got.total > got.rows.length }, asOf: today }
  },
}

// ── 층별개요 ──

// 층 구분: 지하 → 지상 → 옥탑 → 모름. 지하는 깊은 층부터(아래층부터 차례)
type FloorPlace = { label: string; rank: number; at: number }

function placeOf(row: Row): FloorPlace {
  const code = textOf(row.flrGbCd)
  const name = textOf(row.flrGbCdNm)
  const no = countOf(row.flrNo)
  const kind = code === '10' || (code === '' && name === '지하') ? 'below'
    : code === '20' || (code === '' && name === '지상') ? 'above'
    : code === '30' || (code === '' && name === '옥탑') ? 'roof'
    : null
  if (kind === 'roof') return { label: no !== null && no > 1 ? `옥탑${no}` : '옥탑', rank: 2, at: no ?? 1 }
  if (kind !== null && no !== null && no > 0) {
    return kind === 'below' ? { label: `지${no}`, rank: 0, at: -no } : { label: String(no), rank: 1, at: no }
  }
  const label = textOf(row.flrNoNm).replace(/층$/, '').trim()
  return { label: label || UNKNOWN_FLOOR, rank: 3, at: 0 }
}

export const bldFloor: Adapter<'bld-floor', BuildingFloors> = {
  kind: 'bld-floor',
  src: 'building',
  key: 'data',
  requests: (q) => requestsFor('getBrFlrOulnInfo', q, FLOOR_PAGES),
  parse(texts, _q, today): Parsed<BuildingFloors> {
    const got = readPages(texts)
    if (typeof got === 'string') return { ok: false, code: got }
    // 같은 층은 답 차례 그대로(sort는 안정 정렬)
    const floors = got.rows
      .map((row) => ({ place: placeOf(row), floor: { pk: textOf(row.mgmBldrgstPk), usage: usageOf(row), m2: m2Of(row.area) } }))
      .sort((a, b) => a.place.rank - b.place.rank || a.place.at - b.place.at)
      .map(({ place, floor }) => ({ pk: floor.pk, label: place.label, usage: floor.usage, m2: floor.m2 }))
    return { ok: true, value: { floors, capped: got.total > got.rows.length }, asOf: today }
  },
}
