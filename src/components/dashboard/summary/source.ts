import type { DayPayload } from '@/types/payload'

// 대시보드 자료 읽는 자리 한 곳 (tab-frame REQ-312, design.md '오늘 하루 분석 · 기간별 흐름 · 보고 문장').
// 서버에는 아직 저장된 숫자가 없다 → 지금은 늘 '자료 없음'(none)이고 화면은 연결 전 모양이다. 지어낸 숫자를 주지 않는다.
// 다음 통계 명세가 저장 표·RLS를 만든 뒤 이 함수 하나를 브라우저 읽기로 바꿔 { kind: 'data', days }를 준다.
// days는 이미 있는 저장 모양 DayPayload(stats-core REQ-008)를 그대로 쓴다(다시 정의하지 않는다)

export type SummarySource = { kind: 'none' } | { kind: 'data'; days: readonly DayPayload[] }

export function dashboardSummarySource(): SummarySource {
  return { kind: 'none' }
}

// 연결 뒤 = 날짜 자료가 하나 이상. 빈 days는 연결 전과 같다(design.md '연결 판정과 "오늘 진료 끝"')
export function isConnected(source: SummarySource): source is { kind: 'data'; days: readonly DayPayload[] } {
  return source.kind === 'data' && source.days.length > 0
}
