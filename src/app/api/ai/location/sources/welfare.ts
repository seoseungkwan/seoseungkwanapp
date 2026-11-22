import 'server-only'
import { monthRange } from '@/lib/analytics/dates'
import type { Adapter, Parsed, SiteRequest } from '@/types/location'

// 입지 분석 바깥 자료 — 의료급여·기초생활·차상위 인원(specs/location TASK-50, design.md 4절, 조사 5).
// 한국사회보장정보원 복지사업 시군구별 수급권자 현황(data.go.kr 15062448)을 api.odcloud.kr에서 공공데이터포털 열쇠로 받는다(이용 제한 없음).
// 판은 해마다 하나이고 한 쪽에 전국 시군구 줄(일반구까지)이 다 온다 → 후보 시군구 한 줄을 골라 기초 의료급여·기초생활보장 합계·
// 차상위 3종(본인부담경감·자활·장애인) 합을 돌려준다. 비율의 인구는 모으기(TASK-25)가 그 판 연월 pop-age로 더한다.
// 줄 고르기: 시군구 코드 칸(5·10자리)이 있으면 코드로, 못 찾거나 칸이 없으면 시도+시군구 이름으로(전라북도·전북특별자치도 둘 다, 일반구까지).
// 순수 함수다(부르기·담아 두기·console 없음). 진짜 칸 이름·판 주소는 확인할 것 9 — 고칠 곳은 아래 상수 몇 개뿐이다

/** 해마다 판 하나. 판이 바뀌면 이 한 곳만 고친다: uddi = api.odcloud.kr 주소의 판 이름, ym = 그 판의 기준 연월.
 *  uddi는 아직 자리만 잡은 값이다(확인할 것 9) — TASK-47이 공공데이터포털 화면에서 최신 판 주소를 확인해 넣는다 */
export const WELFARE_EDITION = { uddi: 'uddi:00000000-0000-0000-0000-000000000000', ym: '2025-12' } as const
export const WELFARE_URL = `https://api.odcloud.kr/api/15062448/v1/${WELFARE_EDITION.uddi}`
// 한 쪽에 전국 줄(시군구·일반구 약 260줄 + 합계 줄)이 다 오도록
const PER_PAGE = 1000

/** 후보 시군구 한 줄(수급권자 수, 명). 차상위 3종 합은 겹칠 수 있다 */
export type WelfareValue = {
  sggName: string
  ym: string
  /** 기초생활보장 의료급여 수급권자(다른 법 의료급여는 빠짐) */
  medical: number
  /** 기초생활보장 수급권자 합계 */
  basic: number
  /** 차상위 3종 합 */
  nearPoor: number
  nearPoorBy: { copay: number; selfSupport: number; disabled: number }
}

/** 고를 시군구: 코드 5자리 + (몸통에 있으면) 시도·시군구 이름 */
export type WelfareAsk = { sgg: string; sidoName?: string; sggName?: string }

type Row = Record<string, unknown>
type CountKey = 'medical' | 'basic' | 'copay' | 'selfSupport' | 'disabled'

// 칸 이름은 빈칸·_·괄호·가운뎃점을 빼고 견준다
const norm = (s: string) => s.replace(/[\s_()·]/g, '')

// 숫자 칸: 사람 수 칸('수급'이 들고 '가구'가 없음) 가운데 이 낱말이 모두 들고 none 낱말이 없는 칸 하나
const COUNT_COLUMNS: Readonly<Record<CountKey, { all: readonly string[]; none: readonly string[] }>> = {
  medical: { all: ['의료'], none: ['차상위'] },
  basic: { all: ['기초생활', '합계'], none: [] },
  copay: { all: ['차상위', '본인부담'], none: [] },
  selfSupport: { all: ['차상위', '자활'], none: [] },
  disabled: { all: ['차상위', '장애'], none: [] },
}
const isPersonCount = (key: string) => key.includes('수급') && !key.includes('가구')
const SIDO_COLUMNS = ['시도', '시도명']
const SGG_COLUMNS = ['시군구', '시군구명']
const isCodeColumn = (key: string) => key.includes('코드') && (key.includes('시군구') || key.includes('행정'))
// 시군구 코드 모양(5자리 또는 행정구역 코드 10자리). 행정기관 코드(7자리) 같은 다른 코드는 코드로 쓰지 않는다
const SGG_CODE = /^(?:\d{5}|\d{10})$/

// 특별자치도로 바뀐 두 시도: 옛 이름·옛 코드도 같은 시도로 본다(시군구 코드 뒤 세 자리는 그대로)
const SIDO_ALIASES: readonly (readonly string[])[] = [
  ['전북특별자치도', '전라북도'],
  ['강원특별자치도', '강원도'],
]
const RENAMED_SIDO_CODE: Readonly<Record<string, string>> = { '52': '45', '45': '52', '51': '42', '42': '51' }

// 일반구 '○○시 ○○구'는 구 이름으로 견준다(빈칸 없이 적은 줄·구 이름만 적은 줄도 같은 구). 시 합계 줄('○○시')은 그대로
const sggKey = (name: string) => norm(name).replace(/^[가-힣]+?시(?=[가-힣]+구$)/, '')

const FAILED = { ok: false, code: 'failed' } as const
const isPlain = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)

// 수급권자 수: 0 이상 정수, 쉼표 든 글자, '-'(0). 그 밖은 null
function countOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (t === '-') return 0
  if (!/^\d{1,3}(?:,\d{3})*$|^\d+$/.test(t)) return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isSafeInteger(n) ? n : null
}

const textOf = (row: Row, keys: readonly string[]) => {
  for (const key of keys) if (typeof row[key] === 'string') return row[key]
  return null
}

// 첫 줄의 칸 이름으로 읽을 칸을 정한다. 숫자 칸이 없거나 둘 이상이면 모양이 다른 답이다
function columnsOf(first: Row) {
  const keys = Object.keys(first)
  const named = (names: readonly string[]) => keys.filter((k) => names.includes(norm(k)))
  const counts = {} as Record<CountKey, string>
  for (const [count, rule] of Object.entries(COUNT_COLUMNS) as [CountKey, (typeof COUNT_COLUMNS)[CountKey]][]) {
    const found = keys.filter((k) => {
      const n = norm(k)
      return isPersonCount(n) && rule.all.every((w) => n.includes(w)) && !rule.none.some((w) => n.includes(w))
    })
    if (found.length !== 1) return null
    counts[count] = found[0]
  }
  return { counts, sido: named(SIDO_COLUMNS), sgg: named(SGG_COLUMNS), code: keys.filter((k) => isCodeColumn(norm(k))) }
}
type Columns = NonNullable<ReturnType<typeof columnsOf>>

const codeOf = (row: Row, columns: Columns) => {
  for (const key of columns.code) {
    const v = row[key]
    const t = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : ''
    if (SGG_CODE.test(t)) return t.slice(0, 5)
  }
  return null
}

// 같은 시도로 볼 이름들(빈칸 뺌)
function sidoNames(name: string): Set<string> {
  const n = norm(name)
  return new Set((SIDO_ALIASES.find((group) => group.includes(n)) ?? [n]).map(norm))
}

// 고른 줄들: 하나면 그 줄, 없으면 null, 둘 이상이면 'many'
const one = (rows: Row[]): Row | null | 'many' => (rows.length > 1 ? 'many' : (rows[0] ?? null))

function byCode(rows: Row[], columns: Columns, sgg: string): Row | null | 'many' {
  const exact = rows.filter((r) => codeOf(r, columns) === sgg)
  if (exact.length > 0) return one(exact)
  const renamed = RENAMED_SIDO_CODE[sgg.slice(0, 2)]
  return renamed === undefined ? null : one(rows.filter((r) => codeOf(r, columns) === `${renamed}${sgg.slice(2)}`))
}

function byName(rows: Row[], columns: Columns, ask: WelfareAsk, sggName: string): Row | null | 'many' {
  const want = sggKey(sggName)
  const sidos = ask.sidoName?.trim() ? sidoNames(ask.sidoName) : null
  return one(
    rows.filter((r) => {
      const name = textOf(r, columns.sgg)
      if (name === null || sggKey(name) !== want) return false
      if (sidos === null || columns.sido.length === 0) return true
      const sido = textOf(r, columns.sido)
      return sido !== null && sidos.has(norm(sido))
    }),
  )
}

function valueOf(row: Row, columns: Columns, ask: WelfareAsk): WelfareValue | null {
  const [medical, basic, copay, selfSupport, disabled] = (['medical', 'basic', 'copay', 'selfSupport', 'disabled'] as const).map((k) =>
    countOf(row[columns.counts[k]]),
  )
  if (medical === null || basic === null || copay === null || selfSupport === null || disabled === null) return null
  return {
    sggName: (textOf(row, columns.sgg) ?? ask.sggName ?? '').trim(),
    ym: WELFARE_EDITION.ym,
    medical,
    basic,
    nearPoor: copay + selfSupport + disabled,
    nearPoorBy: { copay, selfSupport, disabled },
  }
}

// 미등록 열쇠 답(활용신청 안 됨): { code: -4, msg: '등록되지 않은 인증키 입니다.' }. 다른 오류 답(유효하지 않은 열쇠 -401 등)은 failed
const isNotRegistered = (json: Row) =>
  json.code === -4 || (typeof json.msg === 'string' && json.msg.includes('등록되지 않은 인증키'))

/** 요청: 판 주소로 전국 한 쪽(시군구와 상관없이 같다). 열쇠는 fetchSource가 serviceKey로 싣는다 */
export function welfareRequests(): SiteRequest[] {
  const params = new URLSearchParams({ page: '1', perPage: String(PER_PAGE), returnType: 'JSON' })
  return [{ url: `${WELFARE_URL}?${params}` }]
}

/** 답 읽기: 고른 시군구 한 줄, 자료에 없으면 null(빈 값). 기준 날짜 = 판 기준 연월의 말일 */
export function parseWelfare(texts: string[], ask: WelfareAsk): Parsed<WelfareValue | null> {
  if (texts.length !== 1) return FAILED
  let json: unknown
  try {
    json = JSON.parse(texts[0])
  } catch {
    return FAILED
  }
  if (!isPlain(json)) return FAILED
  if (!Array.isArray(json.data)) return isNotRegistered(json) ? { ok: false, code: 'not-applied' } : FAILED
  const rows = json.data
  if (!rows.every(isPlain)) return FAILED
  const asOf = monthRange(WELFARE_EDITION.ym).to
  // 전국 줄이 한 쪽에 다 오지 않았으면 못 찾은 것을 '없음'이라 하지 않는다
  const partial = typeof json.totalCount === 'number' && json.totalCount > rows.length
  if (rows.length === 0) return partial ? FAILED : { ok: true, value: null, asOf }

  const columns = columnsOf(rows[0])
  if (columns === null) return FAILED
  const hasCode = rows.some((r) => codeOf(r, columns) !== null)
  const sggName = ask.sggName?.trim() ?? ''
  if (!hasCode && sggName === '') return FAILED

  let row = hasCode ? byCode(rows, columns, ask.sgg) : null
  if (row === null && sggName !== '') row = byName(rows, columns, ask, sggName)
  if (row === 'many') return FAILED
  if (row === null) return partial ? FAILED : { ok: true, value: null, asOf }
  const value = valueOf(row, columns, ask)
  return value === null ? FAILED : { ok: true, value, asOf }
}

/** 읽는 곳: 종류 welfare(TASK-51이 종류 목록·몸통에 더함) · 출처 welfare · 공공데이터포털 열쇠 */
export const welfare: Adapter<'welfare', WelfareValue | null> = {
  kind: 'welfare',
  src: 'welfare',
  key: 'data',
  requests: () => welfareRequests(),
  // 몸통은 sgg(+ 이름이 있으면 이름)만 읽는다 — TASK-51이 더하는 welfare 몸통이 WelfareAsk에 맞는지는 합친 뒤 tsc가 본다
  parse: (texts, q: WelfareAsk) => parseWelfare(texts, q),
}
