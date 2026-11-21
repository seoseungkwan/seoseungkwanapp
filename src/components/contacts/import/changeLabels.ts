import type { CompanyChange, ImportPlan } from '@/lib/contacts/plan'

// 미리 보기 이름표·새 업체 줄·숫자(requirements.md '화면 글자' 엑셀 미리 보기, 시안 기본값 21). 바뀌기 전·뒤 값은 없고 칸 이름만 쓴다

/** 바뀌는 업체 이름표: 칸 이름 → 담당자 {n}명 더함 → 장비 {n}대 더함 → 담당자 '{이름}' {칸} → 장비 '{이름}' {칸} */
export function changeLabels(c: CompanyChange): string[] {
  return [
    ...c.fields,
    ...(c.peopleAdded > 0 ? [`담당자 ${c.peopleAdded}명 더함`] : []),
    ...(c.equipmentAdded > 0 ? [`장비 ${c.equipmentAdded}대 더함`] : []),
    ...c.peopleChanged.flatMap((p) => p.fields.map((field) => `담당자 '${p.name}' ${field}`)),
    ...c.equipmentChanged.flatMap((e) => e.fields.map((field) => `장비 '${e.name}' ${field}`)),
  ]
}

/** 새로 더할 업체 줄: {하는 일·품목} · 담당자 {n}명 · 장비 {n}대(빈 것·0은 뺌) */
export function newCompanyLine(c: CompanyChange): string {
  return [c.work, c.peopleAdded > 0 ? `담당자 ${c.peopleAdded}명` : '', c.equipmentAdded > 0 ? `장비 ${c.equipmentAdded}대` : '']
    .filter((part) => part !== '')
    .join(' · ')
}

/** 미리 보기·넣은 뒤 알림 숫자: 새로·바뀜·그대로 업체 수, 넣지 않는 줄 수 */
export function planCounts(plan: ImportPlan): { added: number; changed: number; same: number; skipped: number } {
  const count = (status: CompanyChange['status']) => plan.changes.filter((c) => c.status === status).length
  return { added: count('new'), changed: count('changed'), same: count('same'), skipped: plan.problems.length }
}
