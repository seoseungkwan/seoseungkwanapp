import 'server-only'
import { compareYmd, isMonth, isYmd, monthRange } from '@/lib/analytics/dates'
import type { Adapter, Parsed, SiteRequest } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 아파트 단지·입주 예정 읽는 곳(specs/location REQ-7904, design.md 4절 homes 묶음 — TASK-14). 요청 만들기·답 읽기만 둔 순수 함수다.
// - apt-list: 국토교통부 공동주택 단지 목록(15057332) — 법정동 코드 → 단지 코드·이름 (3쪽)
// - apt-info: 국토교통부 공동주택 기본 정보(15058453) — 단지 코드 → 세대 수·지은 해(사용승인일의 해)·동 수
// - presale: 한국부동산원 청약홈 분양정보(15098547, api.odcloud.kr) — 시·도 + 모집공고 기간 → 단지 이름·세대·입주 연월·주소 (3쪽)
// 세 자료 모두 좌표가 없어 점을 돌려주지 않는다(조사 1). 자료 안에 기준 날짜가 없어 기준 날짜는 받은 날(today)이다.
// 주소·칸 이름은 포털 문서 모양으로 정했다. 진짜 열쇠로 맞추는 것은 TASK-47이다(바뀌면 아래 상수만 고친다)

export const APT_LIST_URL = 'https://apis.data.go.kr/1613000/AptListService3/getLegaldongAptList3'
export const APT_INFO_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4'
export const PRESALE_URL = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail'

// 쪽 수(design.md 4절 표 '쪽')와 한 쪽 줄 수. 요청은 답을 보기 전에 다 만들므로 정해 둔 쪽을 늘 다 부른다
export const APT_LIST_PAGES = 3
export const APT_LIST_ROWS = 100
export const PRESALE_PAGES = 3
export const PRESALE_ROWS = 200

// 청약홈 공급지역 이름(SUBSCRPT_AREA_CODE_NM)은 짧은 이름이다. 시·도 정식 이름(옛 이름 포함)을 바꿔 보내고, 표에 없는 이름은 그대로 보낸다
export const PRESALE_AREA: Readonly<Record<string, string>> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원특별자치도: '강원',
  강원도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라북도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
}
const areaOf = (sidoName: string) => (Object.hasOwn(PRESALE_AREA, sidoName) ? PRESALE_AREA[sidoName] : sidoName)

export type Complex = { code: string; name: string }
export type AptList = { complexes: Complex[]; capped: boolean }
/** 단지 기본 정보. 그 단지 자료가 없으면(빈 답) null */
export type AptInfo = { code: string; name: string; households: number | null; builtYear: number | null; buildings: number | null } | null
/** moveIn = 입주 예정 'YYYY-MM'(모양이 틀리면 null). 세대는 공급 세대 수 */
export type PresaleItem = { name: string; households: number | null; moveIn: string | null; address: string }
export type Presale = { items: PresaleItem[]; capped: boolean }

// ── 글자·숫자 칸 ─────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const FAILED = { ok: false, code: 'failed' } as const
const NOT_APPLIED = { ok: false, code: 'not-applied' } as const

function readJson(text: string): { ok: true; doc: unknown } | { ok: false } {
  try {
    return { ok: true, doc: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

const textOf = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')

// 0 이상 정수(숫자 · 숫자 글자 · 쉼표 글자). 아니면 null
const WHOLE = /^(?:\d+|\d{1,3}(?:,\d{3})+)$/
function wholeOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? v : null
  const s = textOf(v)
  if (!WHOLE.test(s)) return null
  const n = Number(s.replaceAll(',', ''))
  return Number.isSafeInteger(n) ? n : null
}

// 사용승인일(YYYYMMDD · YYYY-MM-DD) → 지은 해. 없는 날·오늘 뒤·다른 모양은 null
const USE_DATE = /^(\d{4})-?(\d{2})-?(\d{2})$/
function builtYearOf(v: unknown, today: string): number | null {
  const m = USE_DATE.exec(textOf(v))
  if (!m) return null
  const ymd = `${m[1]}-${m[2]}-${m[3]}`
  return isYmd(ymd) && compareYmd(ymd, today) <= 0 ? Number(m[1]) : null
}

// 입주 예정 연월(YYYYMM · YYYY-MM · YYYY.MM) → 'YYYY-MM'. 없는 달·다른 모양은 null
const MOVE_IN = /^(\d{4})[-.]?(\d{2})$/
function moveInOf(v: unknown): string | null {
  const m = MOVE_IN.exec(textOf(v))
  if (!m) return null
  const ym = `${m[1]}-${m[2]}`
  return isMonth(ym) ? ym : null
}

const pageNumbers = (pages: number) => Array.from({ length: pages }, (_, i) => i + 1)
const withParams = (base: string, params: Record<string, string>): SiteRequest => {
  const url = new URL(base)
  url.search = new URLSearchParams(params).toString()
  return { url: url.href }
}

// ── 공공데이터포털 답(response.header · body) ─────────────

// 정상이면 body, 자료 없음(03 NODATA_ERROR·빈 body)이면 'nodata', 다른 오류 번호·모양 틀림은 'failed'
function portalBody(text: string): Obj | 'nodata' | 'failed' {
  const got = readJson(text)
  if (!got.ok || !isObj(got.doc) || !isObj(got.doc.response) || !isObj(got.doc.response.header)) return 'failed'
  const { header, body } = got.doc.response
  const code = header.resultCode
  if (typeof code !== 'string' && typeof code !== 'number') return 'failed'
  if (String(code) === '03') return 'nodata'
  if (!/^0+$/.test(String(code))) return 'failed'
  if (body === undefined || body === null || body === '') return 'nodata'
  return isObj(body) ? body : 'failed'
}

// 목록 칸: [..] · {item: [..]} · {item: {..}} · 빈 글자. 목록이 아니면 null(모양 틀림). 줄 아닌 것은 뺀다
function rowsOf(items: unknown): Obj[] | null {
  if (items === undefined || items === null || items === '') return []
  if (Array.isArray(items)) return items.filter(isObj)
  if (!isObj(items)) return null
  const item = items.item
  if (item === undefined || item === null || item === '') return []
  if (Array.isArray(item)) return item.filter(isObj)
  return isObj(item) ? [item] : null
}

// ── apt-list ─────────────────────────────────────────────

const COMPLEX_CODE = /^[A-Za-z0-9]{1,20}$/ // apt-info 몸통 검사(checkQuery)와 같은 모양만 넘긴다

export const aptListAdapter: Adapter<'apt-list', AptList> = {
  kind: 'apt-list',
  src: 'apt-list',
  key: 'data',
  requests: (q) =>
    pageNumbers(APT_LIST_PAGES).map((page) =>
      withParams(APT_LIST_URL, { bjdCode: q.bjd, pageNo: String(page), numOfRows: String(APT_LIST_ROWS), _type: 'json' }),
    ),
  parse(texts, _q, today): Parsed<AptList> {
    if (texts.length !== APT_LIST_PAGES) return FAILED
    if (texts.some(isNotRegistered)) return NOT_APPLIED
    const complexes: Complex[] = []
    const seen = new Set<string>()
    let total = 0
    for (const text of texts) {
      const body = portalBody(text)
      if (body === 'failed') return FAILED
      if (body === 'nodata') continue
      const rows = rowsOf(body.items)
      if (rows === null) return FAILED
      total = Math.max(total, wholeOf(body.totalCount) ?? 0)
      for (const row of rows) {
        const code = textOf(row.kaptCode)
        const name = textOf(row.kaptName)
        if (!COMPLEX_CODE.test(code) || name === '' || seen.has(code)) continue
        seen.add(code)
        complexes.push({ code, name })
      }
    }
    return { ok: true, value: { complexes, capped: total > APT_LIST_PAGES * APT_LIST_ROWS }, asOf: today }
  },
}

// ── apt-info ─────────────────────────────────────────────

export const aptInfoAdapter: Adapter<'apt-info', AptInfo> = {
  kind: 'apt-info',
  src: 'apt-info',
  key: 'data',
  requests: (q) => [withParams(APT_INFO_URL, { kaptCode: q.complex, _type: 'json' })],
  parse(texts, q, today): Parsed<AptInfo> {
    if (texts.length !== 1) return FAILED
    if (isNotRegistered(texts[0])) return NOT_APPLIED
    const body = portalBody(texts[0])
    if (body === 'failed') return FAILED
    const item: unknown = body === 'nodata' ? undefined : Array.isArray(body.item) ? body.item[0] : body.item
    if (item === undefined || item === null || item === '' || (isObj(item) && Object.keys(item).length === 0))
      return { ok: true, value: null, asOf: today }
    if (!isObj(item)) return FAILED
    return {
      ok: true,
      value: {
        code: q.complex,
        name: textOf(item.kaptName),
        households: wholeOf(item.kaptdaCnt),
        builtYear: builtYearOf(item.kaptUsedate, today),
        buildings: wholeOf(item.kaptDongCnt),
      },
      asOf: today,
    }
  },
}

// ── presale ──────────────────────────────────────────────

// odcloud 열쇠 오류 답 { code: -4, msg: '등록되지 않은 인증키…' } — 활용신청 전이다(확인할 것 5, TASK-47이 진짜 답으로 맞춤)
const ODCLOUD_NOT_REGISTERED = -4

export const presaleAdapter: Adapter<'presale', Presale> = {
  kind: 'presale',
  src: 'presale',
  key: 'data',
  // 기간 = 모집공고일 연월(from 1일 ~ to 말일). 입주 연월로는 거르지 않는다(입주 연월은 답 칸이라 모으기가 고른다)
  requests: (q) =>
    pageNumbers(PRESALE_PAGES).map((page) =>
      withParams(PRESALE_URL, {
        page: String(page),
        perPage: String(PRESALE_ROWS),
        returnType: 'JSON',
        'cond[SUBSCRPT_AREA_CODE_NM::EQ]': areaOf(q.sidoName),
        'cond[RCRIT_PBLANC_DE::GTE]': monthRange(q.from).from,
        'cond[RCRIT_PBLANC_DE::LTE]': monthRange(q.to).to,
      }),
    ),
  parse(texts, q, today): Parsed<Presale> {
    if (texts.length !== PRESALE_PAGES) return FAILED
    if (texts.some(isNotRegistered)) return NOT_APPLIED
    const area = areaOf(q.sidoName)
    const items: PresaleItem[] = []
    const seen = new Set<string>()
    let matched = 0
    for (const text of texts) {
      const got = readJson(text)
      if (!got.ok || !isObj(got.doc)) return FAILED
      const doc = got.doc
      if (!Array.isArray(doc.data)) return doc.code === ODCLOUD_NOT_REGISTERED ? NOT_APPLIED : FAILED
      matched = Math.max(matched, wholeOf(doc.matchCount) ?? wholeOf(doc.totalCount) ?? 0)
      for (const row of doc.data.filter(isObj)) {
        // 다른 공급지역 줄은 뺀다(조건이 듣지 않아도 그 시·도만)
        if (textOf(row.SUBSCRPT_AREA_CODE_NM) !== area) continue
        const name = textOf(row.HOUSE_NM)
        if (name === '') continue
        const address = textOf(row.HSSPLY_ADRES)
        const id = textOf(row.HOUSE_MANAGE_NO) || textOf(row.PBLANC_NO) || `${name}\u0000${address}`
        if (seen.has(id)) continue
        seen.add(id)
        items.push({ name, households: wholeOf(row.TOT_SUPLY_HSHLDCO), moveIn: moveInOf(row.MVN_PREARNGE_YM), address })
      }
    }
    return { ok: true, value: { items, capped: matched > PRESALE_PAGES * PRESALE_ROWS }, asOf: today }
  },
}
