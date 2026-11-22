import { addMonthsToDay, isYmd } from '@/lib/analytics/dates'
import type { KeyKind, Query, QueryKind } from '@/types/location'

// 입지 분석 자료 종류와 몸통 검사(specs/location design.md 4절, AC-7903.2). 화면과 서버 경로가 같이 쓴다(순수 함수).
// 종류마다 정해 둔 칸만(빠짐·더함 없음) · 칸마다 범위. 맞으면 정해 둔 칸만 담은 새 몸통, 아니면 null

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

const SGG = text(/^\d{5}$/)
const SIDO = text(/^\d{2}$/)
const BJD = text(/^\d{10}$/)
const CODE20 = text(/^[A-Za-z0-9]{1,20}$/)
const YKIHO = text(/^[A-Za-z0-9+/=]{1,200}$/)
const AT = point
const KAKAO_R = intIn(1, 20_000)
const POP_MONTH = month('2022-10')

const BUILDING = { sgg: SGG, bjdong: text(/^\d{5}$/), bun: text(/^\d{4}$/), ji: text(/^\d{4}$/), plat: oneOf('0', '1') }

// 종류마다 칸(kind 빼고) · 칸 사이 검사
type Spec = { fields: Readonly<Record<string, Field>>; also?: (q: Record<string, unknown>) => boolean }
const str = (v: unknown) => v as string

const SPECS: Readonly<Record<QueryKind, Spec>> = {
  'k-address': { fields: { q: address } },
  'k-point': { fields: { at: AT } },
  'k-near': { fields: { at: AT, r: KAKAO_R, cat: oneOf('SW8', 'MT1', 'PM9', 'HP8', 'AG2') } },
  'k-keyword': { fields: { at: AT, r: KAKAO_R, q: oneOf('산업단지') } },
  'pop-age': { fields: { dongs, ym: POP_MONTH } },
  household: { fields: { dongs, ym: POP_MONTH } },
  'flow-volume': { fields: { sido: SIDO, sgg: SGG, ym: month() }, also: (q) => str(q.sgg).startsWith(str(q.sido)) },
  'flow-bus': { fields: { sgg: SGG } },
  'flow-rail': { fields: { sgg: SGG } },
  accident: { fields: { sidoName: name, sggName: name } },
  'apt-list': { fields: { bjd: BJD } },
  'apt-info': { fields: { complex: CODE20 } },
  presale: { fields: { sidoName: name, from: month(), to: month() }, also: (q) => str(q.from) <= str(q.to) },
  'apt-trade': { fields: { sgg: SGG, ym: month() } },
  'biz-trade': { fields: { sgg: SGG, ym: month() } },
  stores: { fields: { at: AT, r: intIn(30, 2_000) } },
  'bld-title': { fields: BUILDING },
  'bld-floor': { fields: BUILDING },
  'hosp-list': { fields: { at: AT, r: KAKAO_R, group: oneOf('clinic', 'korean', 'big') } },
  'hosp-detail': { fields: { ykiho: YKIHO } },
  'hosp-hours': { fields: { at: AT } },
  nonpay: { fields: { ykiho: YKIHO, item: CODE20 } },
  // 기간은 최대 3년: 끝 ≤ 시작의 3년 뒤 같은 날(그 날이 없으면 그 달 말일)
  'clinic-license': {
    fields: { event: oneOf('open', 'close'), from: day, to: day },
    also: (q) => str(q.from) <= str(q.to) && str(q.to) <= addMonthsToDay(str(q.from), 36),
  },
  gym: { fields: { sggName: name } },
  senior: { fields: { sggName: name } },
  market: { fields: { sggName: name } },
  school: { fields: { sggName: name } },
}

const isKind = (v: unknown): v is QueryKind => typeof v === 'string' && Object.hasOwn(SPECS, v)

/** 몸통이 정해 둔 종류·칸·범위면 그 칸만 담은 새 몸통(주소 찾기 글은 앞뒤 공백 뺌), 아니면 null */
export function checkQuery(body: unknown): Query | null {
  if (!isPlain(body) || !isKind(body.kind)) return null
  const spec = SPECS[body.kind]
  const names = Object.keys(spec.fields)
  if (!sameKeys(body, ['kind', ...names])) return null
  const out: Record<string, unknown> = { kind: body.kind }
  for (const n of names) {
    const value = spec.fields[n](body[n])
    if (value === BAD) return null
    out[n] = value
  }
  if (spec.also && !spec.also(out)) return null
  return out as Query
}
