import type { DrugInfo, DrugInfoEntry, HospitalCatalog } from '@/types/precheck'

// 약 역할(REQ-6608, design.md 10절) [환자 자료 구역]. 처방코드마다 스테로이드·마취약·연골주사 중 무엇인지 정한다.
// 병원이 처방코드 탭에서 고른 역할이 먼저이고, 없으면 비트 처방 목록 보험코드의 약제급여목록 성분으로 정한다.
// 병원마다 코드가 달라서 코드 글자나 약 상품 이름으로 정하지 않는다

export type DrugRole = 'steroid' | 'localAnesthetic' | 'cartilage'
/** 처방코드 탭(CODEMAP 줄)의 역할 깃발: 켜진 것 → 그 역할, 셋 다 꺼짐 → [아님], 없음 → [자동] */
export type RoleFlags = { steroid?: boolean; localAnesthetic?: boolean; cartilage?: boolean }

const ROLE_NAMES: readonly DrugRole[] = ['steroid', 'localAnesthetic', 'cartilage']
/** 성분 이름(약제급여목록 주성분명) → 역할. 차례가 먼저 맞는 역할을 정한다 */
const BY_INGREDIENT: readonly [DrugRole, RegExp][] = [
  ['steroid', /triamcinolone|dexamethasone|methylprednisolone|betamethasone|hydrocortisone|prednisolone/i],
  ['localAnesthetic', /lidocaine|bupivacaine|ropivacaine|mepivacaine/i], // bupivacaine이 levobupivacaine도 덮는다
  ['cartilage', /hyaluron(?!idase)/i], // 효소 hyaluronidase는 연골주사가 아니다
]
/** 눈 약(131 안과용제·132 이비과용제)은 성분이 같아도 정형외과 주사가 아니다 */
const EYE_CLASSES = new Set(['131', '132'])

/** 약 표 한 줄 → 역할. 주사(주성분코드 7번째 글자 B)이고 눈 약이 아닐 때만 성분 이름으로 정한다. 분류번호만으로는 정하지 않는다(245에 에피네프린도 있다) */
export function drugRole(info: DrugInfoEntry | null | undefined): DrugRole | null {
  if (!info) return null
  const [group, ingredient, name] = info.map((value) => String(value ?? '').trim())
  if (ingredient.charAt(6).toUpperCase() !== 'B' || EYE_CLASSES.has(group)) return null
  return BY_INGREDIENT.find(([, pattern]) => pattern.test(name))?.[0] ?? null
}

/** 처방코드 탭에서 고른 역할: 켜진 깃발 → 그 역할, 셋 다 false → 'none'([아님]), 그 밖 → null([자동]) */
export function chosenRole(entry: RoleFlags | null | undefined): DrugRole | 'none' | null {
  if (!entry) return null
  const on = ROLE_NAMES.find((role) => entry[role] === true)
  if (on) return on
  return ROLE_NAMES.every((role) => entry[role] === false) ? 'none' : null
}

/**
 * 처방코드(대문자) → 역할. 처방코드 탭에서 고른 역할 → 비트 처방 목록 보험코드의 성분 역할 차례다.
 * 역할이 없는 코드는 넣지 않는다. 처방 목록에 없는 코드도 처방코드 탭에서 고른 역할은 남긴다
 */
export function drugRoles(
  catalog: Pick<HospitalCatalog, 'codes'>,
  drugInfo: Pick<DrugInfo, 'map'>,
  codemap: Readonly<Record<string, RoleFlags>>,
): Map<string, DrugRole | 'none'> {
  const out = new Map<string, DrugRole | 'none'>()
  for (const [code, entry] of Object.entries(codemap)) {
    const role = chosenRole(entry)
    if (role) out.set(code.toUpperCase(), role)
  }
  for (const row of catalog.codes) {
    const code = row.code.toUpperCase()
    if (out.has(code)) continue
    const role = Object.hasOwn(drugInfo.map, row.standardCode) ? drugRole(drugInfo.map[row.standardCode]) : null
    if (role) out.set(code, role)
  }
  return out
}
