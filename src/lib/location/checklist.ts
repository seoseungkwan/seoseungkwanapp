// 개원 준비 점검 셋(design.md 11절, AC-7913.3·AC-7913.5). 줄 글·차례는 design.md 11절 그대로(승인된 시안 · 조사 3 B 법 기준).
// 세 목록의 id는 후보 줄의 checks 칸(jsonb 하나)에 같이 담기므로 서로 다르다. law = LAW_BASIS(sources.ts) id, 없으면 null.
// 건물 요건 줄마다 '어떻게 알았나' 글은 checks.how[id](40자까지, 빈칸 허용)에 둔다

export type CheckValue = 'yes' | 'no' | 'unknown'
export type CheckItem = { id: string; label: string; law: string | null }
export type BuildingCheck = CheckItem & { need: string }

export const CHECK_VALUES = ['yes', 'no', 'unknown'] as const satisfies readonly CheckValue[]

/** '어떻게 알았나' 글 최대 글자 수(코드포인트) */
export const HOW_MAX = 40

/** 저장할 checks 모양: 줄 id → 값, how = 건물 요건 id → '어떻게 알았나' 글(남는 글이 없으면 칸 없음) */
export type CleanChecks = { [id: string]: CheckValue | Record<string, string> | undefined; how?: Record<string, string> }

/** 법 근거(law)가 null인 줄에 보이는 글 */
export const NO_LAW_TEXT = '법 기준 없음 — 관리사무소에 물어요'

// 위반 건축물은 후보 줄 violation 칸에서 따로 고른다(건물 서류 묶음 AC-7909.4, 위험 신호) — 여기 줄로 두 번 두지 않는다
export const BUILDING_CHECKS: readonly BuildingCheck[] = [
  { id: 'b-xray', label: '엑스레이실 방사선 막는 벽', need: '벽·문에 납을 넣는 공사, 설치 뒤 검사', law: 'xray' },
  { id: 'b-power', label: '전기 용량', need: '엑스레이·물리치료 기계를 함께 켤 만큼(장비 업체에 물어 정해요)', law: null },
  { id: 'b-ceiling', label: '천장 높이', need: '엑스레이 기계를 달 높이(장비 업체 기준)', law: null },
  { id: 'b-load', label: '바닥이 견디는 무게', need: '엑스레이·견인 치료기 무게', law: null },
  { id: 'b-ramp', label: '장애인 경사로·출입구', need: '건물 입구에 턱이 없거나 경사로', law: 'bf' },
  { id: 'b-bf-toilet', label: '장애인 화장실', need: '의원 넓이가 500㎡ 이상이면 꼭 있어야 해요', law: 'bf' },
  { id: 'b-toilet', label: '화장실', need: '층 안에 남녀 따로', law: null },
  { id: 'b-elevator', label: '엘리베이터', need: '휠체어·들것이 들어가는 크기', law: null },
  { id: 'b-use', label: '건물 용도', need: '제1종 근린생활시설(의원) 또는 의료시설', law: 'use' },
  { id: 'b-report', label: '보건소 신고 조건', need: '시설 기준대로 방을 나눔 · 위반 건축물이면 막힐 수 있어요', law: 'open' },
]

// 계약 전 위험 › 계약서에 꼭 넣을 것(시안). 등기부 다섯 단계는 고르는 칸이 아닌 안내 글이라 여기 두지 않는다
export const RISK_CHECKS: readonly CheckItem[] = [
  { id: 'r-cancel', label: '의원 개설 신고가 안 되면 계약을 없던 일로 해요(특약)', law: 'open' },
  { id: 'r-free-rent', label: '무상 기간이 공사 기간과 장비 설치까지 들어가요', law: null },
  { id: 'r-restore', label: '나갈 때 원상 복구 범위(방사선 벽·바닥)를 적어요', law: null },
  { id: 'r-premium', label: '권리금 계약서를 따로 써요', law: null },
  { id: 'r-power', label: '전기 용량 늘리는 공사를 누가 하고 누가 내는지 적어요', law: null },
]

export const VISIT_CHECKS: readonly CheckItem[] = [
  { id: 'v-sign', label: '길 건너에서 간판 자리가 보여요', law: null },
  { id: 'v-entrance', label: '1층 입구에 턱이 없거나 경사로가 있어요', law: 'bf' },
  { id: 'v-elevator', label: '엘리베이터에 휠체어·들것이 들어가요', law: null },
  { id: 'v-toilet', label: '층 안에 남녀 화장실이 따로 있어요', law: null },
  { id: 'v-ceiling', label: '천장 높이를 쟀어요(엑스레이 기계)', law: null },
  { id: 'v-panel', label: '배전반 사진을 찍었어요(전기 용량)', law: null },
  { id: 'v-window', label: '창문 방향·햇빛·바깥 소리를 봤어요', law: null },
  { id: 'v-parking', label: '주차장 들어가는 길이 어르신에게 쉬워요', law: null },
  { id: 'v-passers', label: '평일 낮과 저녁에 지나가는 사람을 봤어요', law: null },
  { id: 'v-mgmt', label: '같은 건물 가게에 관리비·관리 상태를 물어봤어요', law: null },
]

const ALL_IDS: ReadonlySet<string> = new Set([...BUILDING_CHECKS, ...RISK_CHECKS, ...VISIT_CHECKS].map((c) => c.id))
const BUILDING_IDS: ReadonlySet<string> = new Set(BUILDING_CHECKS.map((c) => c.id))

/** '어떻게 알았나' 글로 둘 수 있나: 빈 글이 아닌 40자(코드포인트, DB char_length와 같게)까지의 글 */
const isHowText = (v: unknown): v is string => typeof v === 'string' && v !== '' && Array.from(v).length <= HOW_MAX

function isCheckValue(v: unknown): v is CheckValue {
  return typeof v === 'string' && (CHECK_VALUES as readonly string[]).includes(v)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 저장된 checks에서 한 줄 값. 안 고른 줄·틀린 값은 'unknown'(모름) */
export function checkOf(checks: unknown, id: string): CheckValue {
  if (!isPlainObject(checks) || !Object.hasOwn(checks, id)) return 'unknown'
  const v = checks[id]
  return isCheckValue(v) ? v : 'unknown'
}

/** 저장된 checks에서 건물 요건 한 줄의 '어떻게 알았나' 글. 없거나 틀리면 빈 글 */
export function howOf(checks: unknown, id: string): string {
  if (!isPlainObject(checks) || !BUILDING_IDS.has(id) || !isPlainObject(checks.how) || !Object.hasOwn(checks.how, id)) return ''
  const v = checks.how[id]
  return isHowText(v) ? v : ''
}

/** 칸을 누를 때 다음 값: 모름 → ○ → ✕ → 모름(시안) */
export function nextCheck(v: CheckValue): CheckValue {
  return v === 'unknown' ? 'yes' : v === 'yes' ? 'no' : 'unknown'
}

/** 저장할 checks: 세 목록에 있는 id와 세 값, 그리고 how(건물 요건 id의 40자까지 글)만 남긴다 */
export function cleanChecks(raw: unknown): CleanChecks {
  const out: CleanChecks = {}
  if (!isPlainObject(raw)) return out
  for (const [id, v] of Object.entries(raw)) {
    if (ALL_IDS.has(id) && isCheckValue(v)) out[id] = v
  }
  if (isPlainObject(raw.how)) {
    const how: Record<string, string> = {}
    for (const [id, v] of Object.entries(raw.how)) {
      if (BUILDING_IDS.has(id) && isHowText(v)) how[id] = v
    }
    if (Object.keys(how).length > 0) out.how = how
  }
  return out
}

/** 목록 하나의 ○ · ✕ · 모름 개수 */
export function countChecks(checks: unknown, items: readonly CheckItem[]): Record<CheckValue, number> {
  const n: Record<CheckValue, number> = { yes: 0, no: 0, unknown: 0 }
  for (const item of items) n[checkOf(checks, item.id)] += 1
  return n
}
