import { addMonthsToDay, isYmd } from '@/lib/analytics/dates'
import type { KeyKind, Query, QueryKind } from '@/types/location'
import { DEPTS } from './depts'

// 입지 분석 자료 종류와 몸통 검사(specs/location design.md 4절, AC-7903.2 · AC-7922.1). 화면과 서버 경로가 같이 쓴다(순수 함수).
// 종류마다 정해 둔 칸만(빠짐·더함 없음, 선택 칸은 빠져도 됨) · 칸마다 범위. 맞으면 정해 둔 칸만 담은 새 몸통, 아니면 null

// 종류 → 열쇠(design.md 4절 '열쇠' 칸). 카카오 넷, 나머지는 공공데이터포털
export const KIND_KEY: Readonly<Record<QueryKind, KeyKind>> = {
  'k-address': 'kakao',
  'k-point': 'kakao',
  'k-near': 'kakao',
  'k-keyword': 'kakao',
  'pop-age': 'data',
  household: 'data',
  'flow-volume': 'data',
  'flow-bus': 'data',
  'flow-rail': 'data',
  accident: 'data',
  'apt-list': 'data',
  'apt-info': 'data',
  presale: 'data',
  'apt-trade': 'data',
  'biz-trade': 'data',
  stores: 'data',
  'bld-title': 'data',
  'bld-floor': 'data',
  'hosp-list': 'data',
  'hosp-detail': 'data',
  'hosp-hours': 'data',
  nonpay: 'data',
  'clinic-license': 'data',
  gym: 'data',
  senior: 'data',
  market: 'data',
  school: 'data',
  welfare: 'data', // 의료급여·차상위(한국사회보장정보원, api.odcloud.kr) — 28개째
}

export const QUERY_KINDS: readonly QueryKind[] = Object.keys(KIND_KEY) as QueryKind[]

// ── 칸 검사 하나: 맞으면 담을 값, 아니면 BAD ─────────────
const BAD = Symbol('bad')
type Field = (v: unknown) => unknown

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
// 정해 둔 칸 이름과 꼭 같은 칸(빠짐·더함 없음)
const sameKeys = (o: Record<string, unknown>, names: readonly string[]) => {
  const keys = Object.keys(o)
  return keys.length === names.length && names.every((n) => Object.hasOwn(o, n))
}

const text =
  (re: RegExp): Field =>
  (v) =>
    typeof v === 'string' && re.test(v) ? v : BAD
const oneOf =
  (...values: readonly string[]): Field =>
  (v) =>
    typeof v === 'string' && values.includes(v) ? v : BAD
const intIn =
  (min: number, max: number): Field =>
  (v) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : BAD

// 좌표 한 칸: 범위 안 유한수, 소수 6자리까지(글자로 바꿔 자리 수를 센다 — 이 범위의 수는 지수 꼴이 아니다)
const SIX_DECIMALS = /^\d+(?:\.\d{1,6})?$/
const coord =
  (min: number, max: number): Field =>
  (v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && SIX_DECIMALS.test(String(v)) ? v : BAD
const LAT = coord(33, 39)
const LNG = coord(124, 132)
const point: Field = (v) => {
  if (!isPlain(v) || !sameKeys(v, ['lat', 'lng'])) return BAD
  const lat = LAT(v.lat)
  const lng = LNG(v.lng)
  return lat === BAD || lng === BAD ? BAD : { lat, lng }
}

// 주소 찾기 글: 앞뒤 공백을 빼고 2~100자, 줄바꿈·제어 글자 없음
const CONTROL = /[\u0000-\u001f\u007f]/
const address: Field = (v) => {
  if (typeof v !== 'string' || CONTROL.test(v)) return BAD
  const q = v.trim()
  return q.length >= 2 && q.length <= 100 ? q : BAD
}

// 행정동 코드 10자리 1~40개, 겹침 없음
const DONG = /^\d{10}$/
const dongs: Field = (v) => {
  if (!Array.isArray(v) || v.length < 1 || v.length > 40) return BAD
  if (!v.every((d) => typeof d === 'string' && DONG.test(d)) || new Set(v).size !== v.length) return BAD
  return [...v]
}

// 'YYYY-MM'(2000~2099년). from이 있으면 그 달부터
const MONTH = /^20\d\d-(?:0[1-9]|1[0-2])$/
const month =
  (from = '2000-01'): Field =>
  (v) =>
    typeof v === 'string' && MONTH.test(v) && v >= from ? v : BAD
// 있는 날 'YYYY-MM-DD'(2000~2099년)
const DAY = /^20\d\d-\d\d-\d\d$/
const day: Field = (v) => (typeof v === 'string' && DAY.test(v) && isYmd(v) ? v : BAD)

// 시도·시군구 이름: 한글·숫자 덩이를 공백 하나로 이음, 2~40자('종로구'·'수원시 장안구')
const NAME = /^(?=.{2,40}$)[가-힣0-9]+(?: [가-힣0-9]+)*$/
const name = text(NAME)
// 진료 시간·의료급여 판에서 찾는 이름: 같은 모양, 1~20자(동 경계 목록·옛 구 이름)
const shortName = text(/^(?=.{1,20}$)[가-힣0-9]+(?: [가-힣0-9]+)*$/)
// 의원 인허가 도로명 주소 앞부분 '{시도} {시군구}': 한글 덩이를 공백 하나로 이음, 2~40자(숫자·기호 없음 — LIKE 조건에 들어감)
const ADDR = text(/^(?=.{2,40}$)[가-힣]+(?: [가-힣]+)*$/)

// 글자 목록: min~max개, 칸마다 같은 검사, 되풀이 없음 → 새 배열
const listOf =
  (item: Field, min: number, max: number): Field =>
  (v) => {
    if (!Array.isArray(v) || v.length < min || v.length > max || new Set(v).size !== v.length) return BAD
    return v.every((x) => item(x) !== BAD) ? [...v] : BAD
  }
// 의원 목록 clinic의 과목: 의원 과목 열아홉(치과의원·한의원은 종별 목록) 가운데 1~19개
const CLINIC_DEPTS = DEPTS.filter((d) => d.dgsbjtCd !== null).map((d) => d.id)
const depts = listOf(oneOf(...CLINIC_DEPTS), 1, CLINIC_DEPTS.length)

const SGG = text(/^\d{5}$/)
const SIDO = text(/^\d{2}$/)
const BJD = text(/^\d{10}$/)
const CODE20 = text(/^[A-Za-z0-9]{1,20}$/)
const YKIHO = text(/^[A-Za-z0-9+/=]{1,200}$/)
const AT = point
const KAKAO_R = intIn(1, 20_000)
// 인구·세대·버스정류장·도시철도역 연월은 2022-10부터
const SINCE_2022_10 = month('2022-10')

const BUILDING = { sgg: SGG, bjdong: text(/^\d{5}$/), bun: text(/^\d{4}$/), ji: text(/^\d{4}$/), plat: oneOf('0', '1') }

// 종류마다 꼭 있는 칸(kind 빼고) · 빠져도 되는 칸(fill이 있으면 빠졌을 때 그 값) · 칸 사이 검사
type Spec = {
  fields: Readonly<Record<string, Field>>
  optional?: Readonly<Record<string, Field>>
  fill?: Readonly<Record<string, unknown>>
  also?: (q: Record<string, unknown>) => boolean
}
const str = (v: unknown) => v as string

const SPECS: Readonly<Record<QueryKind, Spec>> = {
  'k-address': { fields: { q: address } },
  'k-point': { fields: { at: AT } },
  'k-near': { fields: { at: AT, r: KAKAO_R, cat: oneOf('SW8', 'MT1', 'PM9', 'HP8', 'AG2') } },
  'k-keyword': { fields: { at: AT, r: KAKAO_R, q: oneOf('산업단지') } },
  'pop-age': { fields: { dongs, ym: SINCE_2022_10 } },
  household: { fields: { dongs, ym: SINCE_2022_10 } },
  // part = 10쪽(1만 줄) 묶음 차례 0~11 — 모으기가 답의 parts만큼 이어 부른다(TASK-47)
  'flow-volume': {
    fields: { sido: SIDO, sgg: SGG, ym: month() },
    optional: { part: intIn(0, 11) },
    fill: { part: 0 },
    also: (q) => str(q.sgg).startsWith(str(q.sido)),
  },
  'flow-bus': { fields: { sgg: SGG, ym: SINCE_2022_10 } },
  'flow-rail': { fields: { sgg: SGG, ym: SINCE_2022_10 } },
  accident: { fields: { sidoName: name, sggName: name } },
  'apt-list': { fields: { bjd: BJD } },
  'apt-info': { fields: { complex: CODE20 } },
  presale: { fields: { sidoName: name, from: month(), to: month() }, also: (q) => str(q.from) <= str(q.to) },
  'apt-trade': { fields: { sgg: SGG, ym: month() } },
  'biz-trade': { fields: { sgg: SGG, ym: month() } },
  stores: { fields: { at: AT, r: intIn(30, 2_000) } },
  'bld-title': { fields: BUILDING },
  'bld-floor': { fields: BUILDING },
  // 과목 depts는 의원(clinic)에만, 의원이면 꼭 있다
  'hosp-list': {
    fields: { at: AT, r: KAKAO_R, group: oneOf('clinic', 'dental', 'korean', 'big') },
    optional: { depts },
    also: (q) => (q.group === 'clinic') === Object.hasOwn(q, 'depts'),
  },
  'hosp-detail': { fields: { ykiho: YKIHO } },
  'hosp-hours': { fields: { sidoName: shortName, sggName: shortName } },
  nonpay: { fields: { ykiho: YKIHO, item: CODE20 } },
  // 기간은 최대 3년: 끝 ≤ 시작의 3년 뒤 같은 날(그 날이 없으면 그 달 말일)
  'clinic-license': {
    fields: { event: oneOf('open', 'close'), from: day, to: day },
    optional: { addr: ADDR },
    also: (q) => str(q.from) <= str(q.to) && str(q.to) <= addMonthsToDay(str(q.from), 36),
  },
  gym: { fields: { sggName: name }, optional: { sidoName: name } },
  senior: { fields: { sggName: name } },
  market: { fields: { sggName: name } },
  school: { fields: { sggName: name } },
  // 판에 코드 칸이 없어 이름으로 찾는다: 시도 1~2개(전남광주는 옛 둘) · 시군구 1~4개(옛 구 묶음이면 옛 이름들)
  welfare: { fields: { sgg: SGG, sidoNames: listOf(shortName, 1, 2), sggNames: listOf(shortName, 1, 4) } },
}

const isKind = (v: unknown): v is QueryKind => typeof v === 'string' && Object.hasOwn(SPECS, v)

/** 몸통이 정해 둔 종류·칸·범위면 그 칸만 담은 새 몸통(주소 찾기 글은 앞뒤 공백 뺌, 빠진 선택 칸은 정해 둔 값), 아니면 null */
export function checkQuery(body: unknown): Query | null {
  if (!isPlain(body) || !isKind(body.kind)) return null
  const spec = SPECS[body.kind]
  const optional = spec.optional ?? {}
  const names = Object.keys(spec.fields)
  const present = Object.keys(optional).filter((n) => Object.hasOwn(body, n))
  if (!sameKeys(body, ['kind', ...names, ...present])) return null
  const out: Record<string, unknown> = { kind: body.kind }
  for (const [n, check] of [...names.map((k) => [k, spec.fields[k]] as const), ...present.map((k) => [k, optional[k]] as const)]) {
    const value = check(body[n])
    if (value === BAD) return null
    out[n] = value
  }
  for (const [n, value] of Object.entries(spec.fill ?? {})) if (!Object.hasOwn(out, n)) out[n] = value
  if (spec.also && !spec.also(out)) return null
  return out as Query
}
