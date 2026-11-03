import type { ClaimVisitView, Grade } from '@/types/precheck'
import { topGrade } from './rows/grade'

// 점검 결과 거르기(AC-013.3, 목업 화면 3 '.filters'). 그 화면 메모리 안에서만 돈다(주소·저장소에 두지 않는다).
// 등급 수는 진료의 가장 높은 등급으로 센다(목업: 확인 필요 + 알림 + 참고 = 규칙 경고가 있는 환자).
// 상병 경고만 있는 진료도 '경고 있는 환자'다: 처음 목록에서 사라지면 경고가 없는 것처럼 보인다

export type VisitFilter = 'warned' | Grade | 'dx' | 'clean'

const warned = (visit: ClaimVisitView) => visit.findings.length > 0 || visit.dx.needsCheck

function matches(visit: ClaimVisitView, filter: VisitFilter): boolean {
  if (filter === 'warned') return warned(visit)
  if (filter === 'clean') return !warned(visit)
  if (filter === 'dx') return visit.dx.needsCheck
  return topGrade(visit.findings) === filter
}

export function filterCount(visits: readonly ClaimVisitView[], filter: VisitFilter): number {
  return visits.filter((visit) => matches(visit, filter)).length
}

export function filterVisits(visits: readonly ClaimVisitView[], filter: VisitFilter, ruleId: string, query: string): ClaimVisitView[] {
  const word = query.trim().toLowerCase()
  return visits.filter(
    (visit) =>
      matches(visit, filter) &&
      (!ruleId || visit.findings.some((finding) => finding.ruleId === ruleId)) &&
      (!word || visit.name.toLowerCase().includes(word) || visit.chart.toLowerCase().includes(word)),
  )
}
