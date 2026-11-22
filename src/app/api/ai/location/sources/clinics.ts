import 'server-only'
import { isYmd } from '@/lib/analytics/dates'
import { distM } from '@/lib/location/coords'
import { DEPTS } from '@/lib/location/depts'
import type { Adapter, DeptId, Parsed, Point, QueryOf, SiteRequest } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 바깥 자료 — 심평원 의원 목록·상세(specs/location REQ-7904, design.md 4·17·18절, TASK-16 · TASK-55). 요청 만들기·답 읽기만 하는 순수 읽는 곳.
// hosp-list: 병원정보서비스(15001698) getHospBasisList — 점·반경·종별·진료과목으로 찾는다.
// hosp-detail: 의료기관별상세정보서비스(15001699) — 의료장비(MRI·CT)·기타인력(물리치료사).
// 답은 JSON(_type=json, data.go.kr 모양 response.header·body.items.item — 항목 하나면 객체로 온다). 자료 안에 기준 날짜가 없어 받은 날이 기준이다.
// TASK-47(2026-11-22 진짜 열쇠): 목록 칸·종별·과목 코드(05 정형외과 · 09 마취통증 · 21 재활 · 31 의원 · 93 한의원 · 11 종합병원)는 진짜 답과 맞았다.
// 상세 2.7판은 '서비스가 없거나 폐기됨'(12)이라 2.8판으로 바꿨고, 기타인력 칸은 dtlGnlNopCdNm(인력 이름)·gnlNopCnt(수)다.
// TASK-55(2026-11-22 진짜 열쇠): 의원 과목 코드 열아홉(depts.ts DEPTS, 진료과목정보 getDgsbjtInfo2.8의 코드 ↔ 이름으로 확인)·치과의원 51·
// 상급종합 01도 맞았다. 과목 목록 검색은 부과목까지 찾는다(한 의원이 여러 과목 목록에 온다 → 기호로 합쳐 depts에 모은다).
// 줄은 가까운 차례가 아니라 이름 차례로 온다 — 한 목록이 LIST_ROWS를 넘으면(capped) 빠지는 의원은 먼 곳이 아니라 이름 뒤쪽이다

// ── 코드 (한 곳) ──────────────────────────────────────

// 심평원 종별 코드: 의원 · 치과의원 · 한의원 · 종합병원 이상(상급종합 · 종합병원). 의원 진료과목 코드는 depts.ts DEPTS의 dgsbjtCd
export const TYPE_CODE = { clinic: '31', dental: '51', korean: '93', big: ['01', '11'] } as const

// 한 목록에서 받는 줄 수(Claude 판단). 부르기는 미리 다 만들어 두므로 목록마다 첫 쪽 하나만 넉넉히 받고, 남으면 capped다
export const LIST_ROWS = 500
const DETAIL_ROWS = 100

const LIST_URL = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList'
const DETAIL_URL = 'https://apis.data.go.kr/B551182/MadmDtlInfoService2.8'
// 상세 두 가지: 의료장비 · 기타인력(이 차례로 답을 읽는다)
const DETAIL_OPS = ['getMedOftInfo2.8', 'getEtcHstInfo2.8'] as const

// 의료장비 줄: 장비 이름·대수. 기타인력 줄: 인력 이름·수
const EQUIP = { name: 'oftCdNm', count: 'oftCnt' } as const
const STAFF = { name: 'dtlGnlNopCdNm', count: 'gnlNopCnt' } as const
const MRI = /MRI|자기공명/
const CT = /CT|전산화단층/
const THERAPIST = '물리치료사'

// 결과 코드: 정상 · 자료 없음(빈 목록, 실패 아님)
const OK_CODES = new Set(['00', '0'])
const NO_DATA = '03'

// ── 내놓는 값 ─────────────────────────────────────────

// 둘레 의료기관 하나. depts = 찾은 과목(그 기관이 나온 목록의 과목, DEPTS 차례) — 치과의원 ['dental'] · 한의원 ['korean'] ·
// 종합병원 이상 [](과목 목록이 아님). 대표 과목은 고르지 않는다(늘 depts.ts deptOf가 설정으로 센다). 거리는 찾은 점에서 m(버림)
export type HospItem = {
  ykiho: string
  name: string
  typeName: string
  depts: DeptId[]
  doctors: number | null
  openedOn: string | null // 'YYYY-MM-DD'
  at: Point // 심평원 XPos·YPos(공공 자료, 카카오 아님)
  address: string
  distM: number
}
// 가까운 차례. capped = 어느 목록이든 받은 줄보다 자료가 더 있음
export type HospList = { items: HospItem[]; capped: boolean }
// 물리치료사 수는 줄·칸이 없거나 0이면 null(의원이 올리지 않음 → 화면 '자료 없음')
export type HospDetail = { mri: boolean; ct: boolean; therapists: number | null }

// ── 답 한 쪽 읽기 ─────────────────────────────────────

type Row = Record<string, unknown>
type Page = { rows: Row[]; total: number | null }
const FAILED = { ok: false, code: 'failed' } as const
const NOT_APPLIED = { ok: false, code: 'not-applied' } as const

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const blank = (v: unknown) => v === undefined || v === null || v === ''

// 숫자 또는 숫자 글자
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(v)) return Number(v)
  return null
}
function count(v: unknown): number | null {
  const n = num(v)
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null
}
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

// 'YYYYMMDD'(숫자로 와도) → 있는 날 'YYYY-MM-DD', 아니면 null(날 검사는 lib/analytics/dates.ts)
function dayOf(v: unknown): string | null {
  const s = text(v)
  if (!/^\d{8}$/.test(s)) return null
  const day = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return isYmd(day) ? day : null
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

// XPos = 경도 · YPos = 위도. 한국 범위 밖이거나 없으면 null
function pointOf(row: Row): Point | null {
  const lng = num(row.XPos)
  const lat = num(row.YPos)
  if (lat === null || lng === null || !(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132)) return null
  return { lat: round6(lat), lng: round6(lng) }
}

// 정상이면 줄들과 전체 수, 자료 없음(03)은 빈 쪽, 그 밖은 failed
function readPage(raw: string): Page | 'failed' {
  let root: unknown
  try {
    root = JSON.parse(raw)
  } catch {
    return 'failed'
  }
  const response = isRow(root) ? root.response : undefined
  if (!isRow(response) || !isRow(response.header)) return 'failed'
  const code = text(response.header.resultCode)
  if (code === NO_DATA) return { rows: [], total: 0 }
  if (!OK_CODES.has(code) || !isRow(response.body)) return 'failed'
  const { items, totalCount } = response.body
  const total = count(totalCount)
  if (blank(items)) return { rows: [], total }
  if (!isRow(items)) return 'failed'
  const item = items.item
  if (blank(item)) return { rows: [], total }
  const rows = Array.isArray(item) ? item : [item]
  if (!rows.every(isRow)) return 'failed'
  return { rows, total }
}

// 답마다 쪽을 읽는다. 미등록 열쇠 답이 하나라도 있으면 not-applied(모양 틀림보다 앞선다)
function readPages(texts: string[], expected: number): Page[] | 'not-applied' | 'failed' {
  if (!Array.isArray(texts) || texts.length !== expected) return 'failed'
  if (texts.some((t) => typeof t !== 'string')) return 'failed'
  if (texts.some(isNotRegistered)) return 'not-applied'
  const pages: Page[] = []
  for (const t of texts) {
    const page = readPage(t)
    if (page === 'failed') return 'failed'
    pages.push(page)
  }
  return pages
}

// ── hosp-list ─────────────────────────────────────────

// 목록 하나: 그 목록에서 찾은 기관에 붙일 과목(없으면 종합병원 이상) · 종별 · 진료과목 코드(의원 과목 목록만)
type ListPlan = { dept: DeptId | null; clCd: string; dgsbjtCd?: string }

// 무리 → 목록(이 차례로 요청하고 답을 읽는다). 의원은 고른 과목마다 하나, DEPTS 차례(몸통 차례와 상관없음)
function plansOf(q: QueryOf<'hosp-list'>): ListPlan[] {
  if (q.group === 'clinic') {
    const asked = new Set<DeptId>(q.depts)
    return DEPTS.flatMap((d) =>
      d.dgsbjtCd !== null && asked.has(d.id) ? [{ dept: d.id, clCd: TYPE_CODE.clinic, dgsbjtCd: d.dgsbjtCd }] : [],
    )
  }
  if (q.group === 'dental') return [{ dept: 'dental', clCd: TYPE_CODE.dental }]
  if (q.group === 'korean') return [{ dept: 'korean', clCd: TYPE_CODE.korean }]
  return TYPE_CODE.big.map((clCd) => ({ dept: null, clCd }))
}

const ORDER: ReadonlyMap<DeptId, number> = new Map(DEPTS.map((d, i) => [d.id, i]))
const byOrder = (a: DeptId, b: DeptId) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0)

function listUrl(q: QueryOf<'hosp-list'>, plan: ListPlan): string {
  const params = new URLSearchParams({
    pageNo: '1',
    numOfRows: String(LIST_ROWS),
    _type: 'json',
    xPos: String(q.at.lng),
    yPos: String(q.at.lat),
    radius: String(q.r),
    clCd: plan.clCd,
  })
  if (plan.dgsbjtCd !== undefined) params.set('dgsbjtCd', plan.dgsbjtCd)
  return `${LIST_URL}?${params}`
}

// 기호·이름·점이 없거나 범위(r) 밖이면 null. 찾은 과목은 그 목록의 과목 하나(합칠 때 모은다)
function itemOf(row: Row, q: QueryOf<'hosp-list'>, dept: DeptId | null): HospItem | null {
  const ykiho = text(row.ykiho)
  const name = text(row.yadmNm)
  const at = pointOf(row)
  if (ykiho === '' || name === '' || at === null) return null
  const dist = distM(q.at, at)
  if (dist > q.r) return null
  return {
    ykiho,
    name,
    typeName: text(row.clCdNm),
    depts: dept === null ? [] : [dept],
    doctors: count(row.drTotCnt),
    openedOn: dayOf(row.estbDd),
    at,
    address: text(row.addr),
    distM: dist,
  }
}

function readList(texts: string[], q: QueryOf<'hosp-list'>, today: string): Parsed<HospList> {
  const plans = plansOf(q)
  const pages = readPages(texts, plans.length)
  if (pages === 'not-applied') return NOT_APPLIED
  if (pages === 'failed') return FAILED
  // 같은 기관 기호는 한 줄: 칸은 먼저 나온 목록(DEPTS 차례) 것, 과목은 나온 목록 모두
  const found = new Map<string, HospItem>()
  let capped = false
  pages.forEach((page, i) => {
    const got = page.rows.length
    if (page.total === null ? got >= LIST_ROWS : page.total > got) capped = true
    for (const row of page.rows) {
      const item = itemOf(row, q, plans[i].dept)
      if (item === null) continue
      const seen = found.get(item.ykiho)
      if (seen === undefined) found.set(item.ykiho, item)
      else for (const d of item.depts) if (!seen.depts.includes(d)) seen.depts.push(d)
    }
  })
  const items = [...found.values()]
    .map((item) => ({ ...item, depts: [...item.depts].sort(byOrder) }))
    .sort((a, b) => a.distM - b.distM || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { ok: true, value: { items, capped }, asOf: today }
}

export const hospList: Adapter<'hosp-list', HospList> = {
  kind: 'hosp-list',
  src: 'hosp-list',
  key: 'data',
  requests: (q): SiteRequest[] => plansOf(q).map((plan) => ({ url: listUrl(q, plan) })),
  parse: readList,
}

// ── hosp-detail ───────────────────────────────────────

function detailUrl(op: string, ykiho: string): string {
  const params = new URLSearchParams({ ykiho, pageNo: '1', numOfRows: String(DETAIL_ROWS), _type: 'json' })
  return `${DETAIL_URL}/${op}?${params}`
}

// 장비 줄이 있고 대수가 0이 아님(대수 칸이 없으면 줄이 있는 것으로 본다)
function hasEquip(rows: Row[], pattern: RegExp): boolean {
  return rows.some((row) => pattern.test(text(row[EQUIP.name])) && count(row[EQUIP.count]) !== 0)
}

// 물리치료사 줄의 수를 더한다. 줄·수 칸이 없거나 합이 0이면 null
function therapistsOf(rows: Row[]): number | null {
  let sum = 0
  for (const row of rows) {
    if (!text(row[STAFF.name]).includes(THERAPIST)) continue
    sum += count(row[STAFF.count]) ?? 0
  }
  return sum > 0 ? sum : null
}

function readDetail(texts: string[], _q: QueryOf<'hosp-detail'>, today: string): Parsed<HospDetail> {
  const pages = readPages(texts, DETAIL_OPS.length)
  if (pages === 'not-applied') return NOT_APPLIED
  if (pages === 'failed') return FAILED
  const [equip, staff] = pages
  return {
    ok: true,
    value: { mri: hasEquip(equip.rows, MRI), ct: hasEquip(equip.rows, CT), therapists: therapistsOf(staff.rows) },
    asOf: today,
  }
}

export const hospDetail: Adapter<'hosp-detail', HospDetail> = {
  kind: 'hosp-detail',
  src: 'hosp-detail',
  key: 'data',
  requests: (q): SiteRequest[] => DETAIL_OPS.map((op) => ({ url: detailUrl(op, q.ykiho) })),
  parse: readDetail,
}
