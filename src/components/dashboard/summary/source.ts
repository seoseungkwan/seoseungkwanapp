import type { readDays } from '@/lib/storage/stats'
import type { DayPayload } from '@/types/payload'

// 대시보드 자료 모양 한 곳 (tab-frame REQ-312, stats REQ-516, stats design.md 'TASK-16 대시보드 읽기').
// 지어낸 숫자를 주지 않는다. days는 이미 있는 저장 모양 DayPayload(stats-core REQ-008)를 그대로 쓴다(다시 정의하지 않는다)

export type SummarySource = { kind: 'none' } | { kind: 'data'; days: readonly DayPayload[] }

// 처음 자료 자리: 늘 '자료 없음'(none)이다. dashboard/page.tsx가 브라우저 읽기(bit-dashboard TASK-8 LiveDashboard)로 바뀔 때까지 쓴다
export function dashboardSummarySource(): SummarySource {
  return { kind: 'none' }
}

// 브라우저가 읽은 저장 숫자(readDays 결과) → 자료 모양. null = 아직 읽은 결과가 없음. 줄이 없으면 연결 전과 같다. 순수 함수다
export function toSummarySource(result: Awaited<ReturnType<typeof readDays>> | null): SummarySource {
  if (result === null || result.rows.length === 0) return { kind: 'none' }
  return { kind: 'data', days: result.rows }
}

// 연결 뒤 = 날짜 자료가 하나 이상. 빈 days는 연결 전과 같다(design.md '연결 판정과 "오늘 진료 끝"')
export function isConnected(source: SummarySource): source is { kind: 'data'; days: readonly DayPayload[] } {
  return source.kind === 'data' && source.days.length > 0
}
