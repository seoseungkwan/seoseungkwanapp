import 'server-only'
import { monthRange } from '@/lib/analytics/dates'
import type { Adapter, Parsed, SiteRequest } from '@/types/location'

// 입지 분석 바깥 자료 — 의료급여·기초생활·차상위 인원(specs/location TASK-50, design.md 4절, 조사 5).
// 한국사회보장정보원 복지사업 시군구별 수급권자 현황(data.go.kr 15062448)을 api.odcloud.kr에서 공공데이터포털 열쇠로 받는다(이용 제한 없음).
// 판은 해마다 하나이고 한 쪽에 전국 줄이 다 온다. TASK-47(2026-11-22 진짜 열쇠)로 본 진짜 판은 '긴 모양'이다:
// 줄 하나 = 시도·시군구·사업명 하나(칸: 기준년월·사업명·수급가구수·수급권자수·시군구·시도, 약 2,600줄), 시군구 코드 칸은 없다.
// → 시도+시군구 이름으로 그 지역 줄들을 골라 기초의료급여·기초생활보장(맞춤형급여)·차상위 3종(본인부담경감·자활·장애인)의 수급권자 수를 돌려준다.
// 차상위 사업 줄이 없는 지역(옹진군 차상위자활 등)은 그 사업 0명이다. 비율의 인구는 모으기(TASK-25)가 그 판 연월 pop-age로 더한다.
// 판 이름은 2026 행정 개편 전이라(광주광역시·전라남도·인천 중구…) 새 시도 이름은 옛 시도 이름들로도 찾는다. 순수 함수다(부르기·담아 두기·console 없음)

/** 해마다 판 하나. 판이 바뀌면 이 한 곳만 고친다: uddi = api.odcloud.kr 주소의 판 이름, ym = 그 판의 기준 연월(줄에 기준년월이 없을 때) */
export const WELFARE_EDITION = { uddi: 'uddi:b4960581-6aa1-4317-a2a6-d3f947573f24', ym: '2025-12' } as const
export const WELFARE_URL = `https://api.odcloud.kr/api/15062448/v1/${WELFARE_EDITION.uddi}`
// 한 쪽에 전국 줄(약 2,600줄)이 다 오도록
const PER_PAGE = 3000

/** 후보 시군구 한 줄(수급권자 수, 명). 차상위 3종 합은 겹칠 수 있다 */
export type WelfareValue = {
  sggName: string
  ym: string
  /** 기초생활보장 의료급여 수급권자(다른 법 의료급여는 빠짐) */
  medical: number
  /** 기초생활보장 수급권자 합계(맞춤형급여) */
  basic: number
  /** 차상위 3종 합 */
  nearPoor: number
  nearPoorBy: { copay: number; selfSupport: number; disabled: number }
}

/** 고를 시군구: 코드 5자리(판에 코드 칸이 없어 쓰지 않음) + 시도·시군구 이름(시군구 이름은 꼭 있어야 한다) */
export type WelfareAsk = { sgg: string; sidoName?: string; sggName?: string }

type Row = Record<string, unknown>
type CountKey = 'medical' | 'basic' | 'copay' | 'selfSupport' | 'disabled'

// 칸·이름은 빈칸·_·괄호·가운뎃점을 빼고 견준다
const norm = (s: string) => s.replace(/[\s_()·]/g, '')

// 사업명(norm) → 돌려줄 칸. 기초의료급여·기초생활보장은 꼭 있어야 하고, 차상위 3종은 줄이 없으면 0
const PROJECTS: Readonly<Record<CountKey, string>> = {
  medical: '기초의료급여',
  basic: '기초생활보장맞춤형급여',
  copay: '차상위본인부담경감대상자',
  selfSupport: '차상위자활',
  disabled: '차상위장애인',
}
const REQUIRED: readonly CountKey[] = ['medical', 'basic']
const COLUMNS = { project: '사업명', count: '수급권자수', sido: '시도', sgg: '시군구', ym: '기준년월' } as const

// 같은 시도로 볼 이름들: 특별자치도로 바뀐 둘(옛 이름) · 2026 개편으로 합친 전남광주통합특별시(판은 옛 두 시도)
const SIDO_ALIASES: readonly (readonly string[])[] = [
  ['전북특별자치도', '전라북도'],
  ['강원특별자치도', '강원도'],
  ['전남광주통합특별시', '광주광역시', '전라남도'],
]

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

const textOf = (row: Row, key: string): string => {
  const v = row[key]
  return typeof v === 'string' ? v.trim() : ''
}

// 같은 시도로 볼 이름들(빈칸 뺌)
function sidoNames(name: string): Set<string> {
  const n = norm(name)
  return new Set((SIDO_ALIASES.find((group) => group.includes(n)) ?? [n]).map(norm))
}

// 기준 연월 'YYYY-MM' · 'YYYYMM'. 아니면 null
function ymOf(v: string): string | null {
  const m = /^(\d{4})-?(0[1-9]|1[0-2])$/.exec(v)
  return m ? `${m[1]}-${m[2]}` : null
}

// 고른 지역의 줄들 → 값. 같은 사업 줄이 둘이거나 숫자가 틀리거나 꼭 있어야 할 사업이 없으면 null(failed)
function valueOf(rows: Row[]): WelfareValue | null {
  const byProject = new Map<string, Row>()
  for (const row of rows) {
    const project = norm(textOf(row, COLUMNS.project))
    if (byProject.has(project)) return null
    byProject.set(project, row)
  }
  const counts = {} as Record<CountKey, number>
  for (const [key, project] of Object.entries(PROJECTS) as [CountKey, string][]) {
    const row = byProject.get(project)
    if (row === undefined) {
      if (REQUIRED.includes(key)) return null
      counts[key] = 0
      continue
    }
    const n = countOf(row[COLUMNS.count])
    if (n === null) return null
    counts[key] = n
  }
  const first = rows[0]
  return {
    sggName: textOf(first, COLUMNS.sgg),
    ym: ymOf(textOf(first, COLUMNS.ym)) ?? WELFARE_EDITION.ym,
    medical: counts.medical,
    basic: counts.basic,
    nearPoor: counts.copay + counts.selfSupport + counts.disabled,
    nearPoorBy: { copay: counts.copay, selfSupport: counts.selfSupport, disabled: counts.disabled },
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

/** 답 읽기: 고른 시군구의 값, 자료에 없으면 null(빈 값). 기준 날짜 = 기준 연월의 말일 */
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
  // 전국 줄이 한 쪽에 다 오지 않았으면 못 찾은 것을 '없음'이라 하지 않는다
  const partial = typeof json.totalCount === 'number' && json.totalCount > rows.length
  const none = (): Parsed<WelfareValue | null> => (partial ? FAILED : { ok: true, value: null, asOf: monthRange(WELFARE_EDITION.ym).to })
  if (rows.length === 0) return none()

  // 모양: 사업명·수급권자수·시군구 칸이 있어야 한다(넓은 모양 판·다른 판이면 failed)
  const first = rows[0]
  if (!(COLUMNS.project in first) || !(COLUMNS.count in first) || !(COLUMNS.sgg in first)) return FAILED
  const sggName = ask.sggName?.trim() ?? ''
  if (sggName === '') return FAILED

  const want = sggKey(sggName)
  const sidos = ask.sidoName?.trim() ? sidoNames(ask.sidoName) : null
  const picked = rows.filter((r) => {
    if (sggKey(textOf(r, COLUMNS.sgg)) !== want) return false
    return sidos === null || sidos.has(norm(textOf(r, COLUMNS.sido)))
  })
  if (picked.length === 0) return none()
  // 고른 줄이 두 지역 이상(시도 이름 없이 같은 구 이름 등)이면 어느 쪽인지 모른다
  const regions = new Set(picked.map((r) => `${norm(textOf(r, COLUMNS.sido))}|${norm(textOf(r, COLUMNS.sgg))}`))
  if (regions.size > 1) return FAILED
  const value = valueOf(picked)
  return value === null ? FAILED : { ok: true, value, asOf: monthRange(value.ym).to }
}

/** 읽는 곳: 종류 welfare(TASK-51이 종류 목록·몸통에 더함) · 출처 welfare · 공공데이터포털 열쇠 */
export const welfare: Adapter<'welfare', WelfareValue | null> = {
  kind: 'welfare',
  src: 'welfare',
  key: 'data',
  requests: () => welfareRequests(),
  // 몸통은 sgg + 시도·시군구 이름을 읽는다 — 판에 코드 칸이 없어 이름(sggName)이 꼭 있어야 한다(query.ts에 칸을 더해야 한다, TASK-47 보고)
  parse: (texts, q: WelfareAsk) => parseWelfare(texts, q),
}
