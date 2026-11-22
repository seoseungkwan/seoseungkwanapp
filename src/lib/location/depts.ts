import type { DeptId, DeptRule } from '@/types/location'

// 의원 과목 고르기(specs/location design.md 18절) 한 곳: 과목 스물하나 · 처음 설정 · 검사 · 대표 과목 · 짧은 이름 글.
// 이 차례가 '목록 차례'다(판·요약·거르기·대표 과목이 모두 이 차례). 순수 함수만

export type DeptRole = 'rival' | 'around' | 'hide'

export type Dept = {
  id: DeptId
  name: string // 이름
  short: string // 짧은 이름(요약·글)
  clCd: '31' | '51' | '93' // 심평원 종별(getHospBasisList clCd): 의원 · 치과의원 · 한의원
  dgsbjtCd: string | null // 심평원 진료과목 코드(dgsbjtCd) — 의원 과목만, 치과의원·한의원은 종별로 찾아 null
  words: readonly string[] // 이름 낱말(대표 과목에 씀)
  checked: boolean // 진짜 답으로 코드를 확인했나(18절 표 '확인' 칸, 확인할 것 10)
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}

const clinic = (id: DeptId, name: string, short: string, code: string, words: string[], checked = false): Dept => ({
  id,
  name,
  short,
  clCd: '31',
  dgsbjtCd: code,
  words,
  checked,
})

/** 과목 스물하나(design.md 18절 표 차례): 심평원 의원 진료과목 열아홉 + 치과의원 · 한의원 */
export const DEPTS: readonly Dept[] = deepFreeze([
  clinic('im', '내과', '내과', '01', ['내과']),
  clinic('neuro', '신경과', '신경과', '02', ['신경과']),
  clinic('psy', '정신건강의학과', '정신건강의학과', '03', ['정신건강의학', '정신과']),
  clinic('gs', '외과', '외과', '04', ['외과']),
  clinic('ortho', '정형외과', '정형외과', '05', ['정형외과'], true),
  clinic('ns', '신경외과', '신경외과', '06', ['신경외과']),
  clinic('cs', '흉부외과', '흉부외과', '07', ['흉부외과']),
  clinic('plastic', '성형외과', '성형외과', '08', ['성형외과']),
  clinic('pain', '마취통증의학과', '마취통증', '09', ['마취통증', '통증의학'], true),
  clinic('obgy', '산부인과', '산부인과', '10', ['산부인과', '여성의원']),
  clinic('ped', '소아청소년과', '소아청소년과', '11', ['소아청소년', '소아과']),
  clinic('eye', '안과', '안과', '12', ['안과']),
  clinic('ent', '이비인후과', '이비인후과', '13', ['이비인후과']),
  clinic('derm', '피부과', '피부과', '14', ['피부과']),
  clinic('uro', '비뇨의학과', '비뇨의학과', '15', ['비뇨의학', '비뇨기과']),
  clinic('rad', '영상의학과', '영상의학과', '16', ['영상의학']),
  clinic('rehab', '재활의학과', '재활', '21', ['재활의학'], true),
  clinic('fm', '가정의학과', '가정의학과', '23', ['가정의학']),
  clinic('oem', '직업환경의학과', '직업환경의학과', '25', ['직업환경의학']),
  { id: 'dental', name: '치과의원', short: '치과', clCd: '51', dgsbjtCd: null, words: ['치과'], checked: false },
  { id: 'korean', name: '한의원', short: '한의원', clCd: '93', dgsbjtCd: null, words: ['한의원'], checked: true },
])

const ORDER: ReadonlyMap<string, number> = new Map(DEPTS.map((d, i) => [d.id, i]))
const isDeptId = (v: unknown): v is DeptId => typeof v === 'string' && ORDER.has(v)
const byOrder = (a: DeptId, b: DeptId) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0)
// 종별 목록·인허가 업태로만 가르는 과목(이름 낱말만으로는 정하지 않음 — '대한의원'의 '한의원'처럼)
const BY_TYPE: ReadonlySet<DeptId> = new Set(['dental', 'korean'])

/** 처음 설정(사용자 [기본값으로]·DB 기본값 — JSON 글자가 SQL 처음 값과 같다). 얼려 두었으니 고쳐 쓰려면 fillDeptRule */
export const DEFAULT_DEPT_RULE: DeptRule = deepFreeze({ v: 1, rival: ['ortho', 'ns', 'pain', 'rehab'], hide: [] })

export type DeptRuleProblem = { code: 'shape' } | { code: 'unknown' | 'both' | 'repeat'; id: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const RULE_KEYS = ['v', 'rival', 'hide']

/** 저장해도 되는지(빈 배열 = 됨): 모양(객체 · v 1 · 배열 둘 · 다른 칸 없음) → 모르는 id · 같은 목록에 두 번 · 경쟁과 안 보기 겹침 */
export function checkDeptRule(raw: unknown): DeptRuleProblem[] {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.rival) || !Array.isArray(raw.hide)) return [{ code: 'shape' }]
  if (Object.keys(raw).some((k) => !RULE_KEYS.includes(k))) return [{ code: 'shape' }]
  const out: DeptRuleProblem[] = []
  for (const list of [raw.rival, raw.hide] as unknown[][])
    for (const v of list) if (!isDeptId(v)) out.push({ code: 'unknown', id: String(v) })
  for (const list of [raw.rival, raw.hide] as unknown[][]) {
    const seen = new Set<unknown>()
    for (const v of list) {
      if (isDeptId(v) && seen.has(v) && !out.some((p) => p.code === 'repeat' && p.id === v)) out.push({ code: 'repeat', id: v })
      seen.add(v)
    }
  }
  const rival = new Set(raw.rival)
  for (const v of new Set(raw.hide)) if (isDeptId(v) && rival.has(v)) out.push({ code: 'both', id: v })
  return out
}

const knownIds = (list: unknown[]): DeptId[] => [...new Set(list.filter(isDeptId))].sort(byOrder)

/** 저장된 설정(DB jsonb)을 쓸 수 있는 설정으로: 못 읽으면 처음 값, 모르는 id는 버리고 되풀이는 하나로, 차례는 목록 차례.
 * 경쟁 칸이 없으면 처음 경쟁, 안 보기 칸이 없으면 없음, 둘에 겹친 과목은 경쟁으로 둔다. 늘 새 객체 */
export function fillDeptRule(raw: unknown): DeptRule {
  const fallback = (): DeptRule => ({ v: 1, rival: [...DEFAULT_DEPT_RULE.rival], hide: [...DEFAULT_DEPT_RULE.hide] })
  if (!isRecord(raw) || raw.v !== 1) return fallback()
  const hasRival = Object.hasOwn(raw, 'rival')
  const hasHide = Object.hasOwn(raw, 'hide')
  if ((hasRival && !Array.isArray(raw.rival)) || (hasHide && !Array.isArray(raw.hide))) return fallback()
  const rival = Array.isArray(raw.rival) ? knownIds(raw.rival) : [...DEFAULT_DEPT_RULE.rival]
  const hide = (Array.isArray(raw.hide) ? knownIds(raw.hide) : []).filter((id) => !rival.includes(id))
  return { v: 1, rival, hide }
}

/** 과목 하나가 설정에서 어디에 드나: 경쟁 · 안 보기 · 둘 다 아니면 둘레로 보기 */
export function deptRole(id: DeptId, rule: DeptRule): DeptRole {
  if (rule.rival.includes(id)) return 'rival'
  if (rule.hide.includes(id)) return 'hide'
  return 'around'
}

/** 경쟁 과목 짧은 이름을 목록 차례로 ·로 이음(요약·글의 {짧은 이름}). 없으면 '고른 과목 없음' */
export function rivalShortText(rule: DeptRule): string {
  const names = DEPTS.filter((d) => rule.rival.includes(d.id)).map((d) => d.short)
  return names.length > 0 ? names.join('·') : '고른 과목 없음'
}

// 이름 낱말 모두를 긴 것부터(같은 길이는 목록 차례) — '신경외과'가 '외과'·'신경과'보다 먼저
const WORDS: readonly { word: string; id: DeptId }[] = DEPTS.flatMap((d) => d.words.map((word) => ({ word, id: d.id }))).sort(
  (a, b) => b.word.length - a.word.length,
)
const MASK = '\u0000'

/** 글에 든 과목(이름 낱말)을 글에서 앞에 나온 차례로. 긴 낱말이 잡은 자리는 지워 짧은 낱말이 다시 잡지 않는다 */
function namedDepts(text: string): DeptId[] {
  let rest = text
  const found: { at: number; id: DeptId }[] = []
  for (const { word, id } of WORDS) {
    let at = rest.indexOf(word)
    while (at !== -1) {
      found.push({ at, id })
      rest = rest.slice(0, at) + MASK.repeat(word.length) + rest.slice(at + word.length)
      at = rest.indexOf(word, at + word.length)
    }
  }
  const out: DeptId[] = []
  for (const { id } of found.sort((a, b) => a.at - b.at)) if (!out.includes(id)) out.push(id)
  return out
}

/** 찾은 과목 가운데 경쟁(목록 차례 첫째) → 둘레로 보기(목록 차례 첫째) → null */
function pickByRole(ids: ReadonlySet<DeptId>, rule: DeptRule): DeptId | null {
  for (const role of ['rival', 'around'] as const) {
    const hit = DEPTS.find((d) => ids.has(d.id) && deptRole(d.id, rule) === role)
    if (hit) return hit.id
  }
  return null
}

/** 대표 과목(심평원 의원 목록 한 줄): (1) 이름에 든 과목이 찾은 과목에 있고 안 보기가 아니면 그 과목(이름에서 앞에 나온 것)
 * (2) 찾은 과목 가운데 경쟁 과목 (3) 둘레로 보기 과목 (4) 없으면 null(어디에도 안 셈). 치과의원·한의원은 depts가 ['dental']·['korean'] */
export function deptOf(clinic: { name: string; depts: readonly DeptId[] }, rule: DeptRule): DeptId | null {
  const ids = new Set(clinic.depts.filter(isDeptId))
  const named = namedDepts(clinic.name).find((id) => ids.has(id) && deptRole(id, rule) !== 'hide')
  return named ?? pickByRole(ids, rule)
}

/** 대표 과목(행안부 의원 인허가 한 줄): 업태 글에 '치과' → dental, '한의' → korean(안 보기면 null). 아니면 deptOf와 같은 차례로
 * 이름 낱말(과목 글에 있는 과목만, 과목 글이 비면 이름만으로 — 치과·한의원은 업태로만) → 과목 글(쉼표·공백으로 나눔) 가운데 경쟁 → 둘레로 보기 → null */
export function deptOfText(row: { name: string; subjects: string; type: string }, rule: DeptRule): DeptId | null {
  const byType: DeptId | null = row.type.includes('치과') ? 'dental' : row.type.includes('한의') ? 'korean' : null
  if (byType !== null) return deptRole(byType, rule) === 'hide' ? null : byType
  const ids = new Set(
    row.subjects
      .split(/[,\s]+/)
      .filter((s) => s !== '')
      .flatMap((s) => namedDepts(s).slice(0, 1)),
  )
  const named = namedDepts(row.name).find(
    (id) => !BY_TYPE.has(id) && (ids.size === 0 || ids.has(id)) && deptRole(id, rule) !== 'hide',
  )
  return named ?? pickByRole(ids, rule)
}
