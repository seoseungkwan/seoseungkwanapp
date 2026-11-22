import 'server-only'
import { monthRange } from '@/lib/analytics/dates'
import type { Adapter, Parsed, QueryOf, SiteRequest } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 입지 분석 바깥 자료 — 사는 사람(specs/location REQ-7904, design.md 4절, TASK-13). 행정안전부 주민등록 인구 API 둘(공공데이터포털 열쇠).
//   pop-age   15108072 행정동별(통반단위) 성/연령별 주민등록 인구수 → 동마다 10세 나이대 11칸(0~9세 … 90~99세 · 100세 이상, 남+여)
//   household 15108071 법정동별(행정동 통반단위) 인구 및 세대현황 → 동마다 세대 수(한 행정동이 법정동 여럿에 걸친 줄은 더함)
// 몸통은 행정동 코드 1~40개 · 연월 하나. 서버 경로가 한 요청에 30번까지만 부르므로 동마다가 아니라 시군구마다 한 번 부르고
// (시군구 코드 = 행정동 코드 앞 5자리 + 00000, 읍면동 단위 줄) 물은 동만 골라 물은 차례로 돌려준다.
// 기준 날짜는 그 연월 말일(자료 안의 연월). 그 달 줄이 하나도 없으면 받은 한국 날짜다.
// 주소·칸 이름은 공개 문서 기준이고 진짜 답 모양은 TASK-47이 열쇠로 확인한다(requirements 확인할 것 5 — 15108071 조회 열쇠)

const BASE = 'https://apis.data.go.kr/1741000'
const POP_AGE_PATH = `${BASE}/admmSexdAgePpltn/selectAdmmSexdAgePpltn`
const HOUSEHOLD_PATH = `${BASE}/stdgPpltnHhStus/selectStdgPpltnHhStus`
// 읍면동 단위(3) · 등록 구분 전체(1: 거주자 + 거주불명자 + 재외국민) · 한 쪽 1,000줄(시군구 하나의 동은 이 안)
const LEVEL_DONG = '3'
const REG_ALL = '1'
const ROWS = '1000'
const AGES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const

// 동 하나의 10세 나이대 11칸(사람 수)
export type DongBands = { dong: string; bands: number[] }
// 동 하나의 세대 수
export type DongHouseholds = { dong: string; households: number }

type Row = Record<string, unknown>
type PeopleQuery = QueryOf<'pop-age'> | QueryOf<'household'>

const FAILED = { ok: false, code: 'failed' } as const
const NOT_APPLIED = { ok: false, code: 'not-applied' } as const

const isObject = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)

// 물은 동들의 시군구(앞 5자리), 처음 나온 차례
function sggsOf(dongs: readonly string[]): string[] {
  return [...new Set(dongs.map((d) => d.slice(0, 5)))]
}

function requestsFor(path: string, codeField: 'admmCd' | 'stdgCd', q: PeopleQuery): SiteRequest[] {
  const ym = q.ym.replace('-', '')
  return sggsOf(q.dongs).map((sgg) => {
    const params = new URLSearchParams({
      [codeField]: `${sgg}00000`,
      srchFrYm: ym,
      srchToYm: ym,
      lv: LEVEL_DONG,
      regSeCd: REG_ALL,
      type: 'JSON',
      numOfRows: ROWS,
      pageNo: '1',
    })
    return { url: `${path}?${params.toString()}` }
  })
}

// 답 하나의 줄들. 빈 답(0건 · 자료 없음 03)은 빈 목록, 모양이 다르면 null
function rowsOf(text: string): unknown[] | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(json)) return null
  const root = json.Response ?? json.response
  if (!isObject(root) || !isObject(root.head)) return null
  const code = String(root.head.resultCode ?? '')
  if (code === '03') return []
  if (code !== '0' && code !== '00') return null
  const items = root.items
  if (items === undefined || items === null || items === '') return []
  if (!isObject(items)) return null
  const item = items.item
  if (item === undefined || item === null || item === '') return []
  return Array.isArray(item) ? item : [item]
}

// 0 이상 정수(숫자 또는 숫자 글자), 아니면 null
function count(v: unknown): number | null {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? v : null
  if (typeof v === 'string' && /^\d{1,12}$/.test(v.trim())) return Number(v.trim())
  return null
}

// 코드 칸(글자 또는 숫자)
const codeText = (v: unknown): string | null =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : null

// 답들을 읽어 물은 동 줄마다 read를 부른다. read가 false면 모양 틀림. 그 달 줄이 있었는지를 돌려준다
function eachDongRow(
  texts: readonly string[],
  q: PeopleQuery,
  read: (dong: string, row: Row) => boolean,
): { ok: true; seen: boolean } | typeof FAILED | typeof NOT_APPLIED {
  if (texts.some(isNotRegistered)) return NOT_APPLIED
  const ym = q.ym.replace('-', '')
  const wanted = new Set(q.dongs)
  let seen = false
  for (const text of texts) {
    const rows = rowsOf(text)
    if (rows === null) return FAILED
    for (const row of rows) {
      if (!isObject(row)) return FAILED
      const statsYm = codeText(row.statsYm)
      const dong = codeText(row.admmCd)
      if (statsYm === null || !/^\d{6}$/.test(statsYm) || dong === null) return FAILED
      if (statsYm !== ym) continue
      seen = true
      if (wanted.has(dong) && !read(dong, row)) return FAILED
    }
  }
  return { ok: true, seen }
}

const asOfFor = (q: PeopleQuery, seen: boolean, today: string) => (seen ? monthRange(q.ym).to : today)

// 물은 차례로, 답에 있던 동만
const inAskedOrder = <T, R>(q: PeopleQuery, byDong: ReadonlyMap<string, T>, make: (dong: string, v: T) => R): R[] =>
  q.dongs.flatMap((dong) => {
    const v = byDong.get(dong)
    return v === undefined ? [] : [make(dong, v)]
  })

function parsePopAge(texts: string[], q: QueryOf<'pop-age'>, today: string): Parsed<DongBands[]> {
  const byDong = new Map<string, number[]>()
  const got = eachDongRow(texts, q, (dong, row) => {
    if (byDong.has(dong)) return false // 같은 달 같은 동이 두 줄: 읍면동 단위가 아니다
    const bands: number[] = []
    for (const age of AGES) {
      const male = count(row[`male${age}AgeNmprCnt`])
      const female = count(row[`feml${age}AgeNmprCnt`])
      if (male === null || female === null) return false
      bands.push(male + female)
    }
    byDong.set(dong, bands)
    return true
  })
  if (!got.ok) return got
  const value = inAskedOrder(q, byDong, (dong, bands): DongBands => ({ dong, bands }))
  return { ok: true, value, asOf: asOfFor(q, got.seen, today) }
}

function parseHousehold(texts: string[], q: QueryOf<'household'>, today: string): Parsed<DongHouseholds[]> {
  const byDong = new Map<string, number>()
  const got = eachDongRow(texts, q, (dong, row) => {
    const households = count(row.hhCnt)
    if (households === null) return false
    byDong.set(dong, (byDong.get(dong) ?? 0) + households)
    return true
  })
  if (!got.ok) return got
  const value = inAskedOrder(q, byDong, (dong, households): DongHouseholds => ({ dong, households }))
  return { ok: true, value, asOf: asOfFor(q, got.seen, today) }
}

export const popAgeAdapter: Adapter<'pop-age', DongBands[]> = {
  kind: 'pop-age',
  src: 'pop-age',
  key: 'data',
  requests: (q) => requestsFor(POP_AGE_PATH, 'admmCd', q),
  parse: parsePopAge,
}

export const householdAdapter: Adapter<'household', DongHouseholds[]> = {
  kind: 'household',
  src: 'household',
  key: 'data',
  requests: (q) => requestsFor(HOUSEHOLD_PATH, 'stdgCd', q),
  parse: parseHousehold,
}
