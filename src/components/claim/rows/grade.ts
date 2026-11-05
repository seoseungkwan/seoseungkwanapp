import { ds } from '@/components/ui/classes'
import type { Finding, Grade } from '@/types/precheck'

// 등급의 글자·칩(AC-013.3). 색만으로 구분하지 않는다: 칩마다 글자가 있다

export const GRADES: readonly Grade[] = ['확인필요', '알림', '참고']

export const GRADE_LABEL: Record<Grade, string> = { 확인필요: '확인 필요', 알림: '알림', 참고: '참고' }

const CHIPS: Record<Grade, string> = { 확인필요: ds.chip.negative, 알림: ds.chip.warning, 참고: ds.chip.neutral }

export const gradeChip = (grade: Grade): string => CHIPS[grade]

const EDGES: Record<Grade, string> = { 확인필요: 'border-negative', 알림: 'border-warning', 참고: 'border-line' }

/** 경고 줄 왼쪽 선 색(목업 .warn-item). 패널 안이라 네 변 상자를 두지 않는다(UI_GUIDE '상자 안 상자 금지') */
export const gradeEdge = (grade: Grade): string => EDGES[grade]

/** 진료의 가장 높은 등급. 걸린 규칙이 없으면 null */
export function topGrade(findings: readonly Pick<Finding, 'grade'>[]): Grade | null {
  return GRADES.find((grade) => findings.some((finding) => finding.grade === grade)) ?? null
}
