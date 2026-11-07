import type { readDays } from '@/lib/storage/stats'
import type { DayPayload } from '@/types/payload'

// 대시보드 자료 모양 한 곳 (tab-frame REQ-312, stats REQ-516, stats design.md 'TASK-16 대시보드 읽기').
// 지어낸 숫자를 주지 않는다. days는 이미 있는 저장 모양 DayPayload(stats-core REQ-008)를 그대로 쓴다(다시 정의하지 않는다)

/** 통계 탭 처방별 추세 묶음 하나(bit-dashboard REQ-606). key = 그 묶음 처방 코드 모음의 groupKey(treatment-trend), 일 줄 groups[].id와 견준다 */
export type RxGroupLine = { name: string; key: string }

/**
 * 옛 기간 읽기(dashboard-period REQ-1804). from = 손에 든 숫자의 첫날(오늘 − LOOKBACK_DAYS), 고른 기간의 첫날이 이보다 앞일 때만 읽는다.
 * read = 그 기간의 저장 숫자 한 번(받아 오기만 한다, 10초 한도). null = 실패·한도. 읽는 코드는 LiveDashboard 한 곳이 만든다
 */
export type OlderDays = { from: string; read: (range: { from: string; to: string }) => Promise<readonly DayPayload[] | null> }

/**
 * groups: 처방 든 묶음(통계 탭 차례). [] = 묶음 없음, null = 묶음을 읽지 못함, 'pending' = 묶음을 아직 읽는 중(dashboard-ux AC-2701.2:
 * 저장 숫자로 먼저 그리고 처방 상위만 "묶음을 읽는 중"이다). 주지 않으면 []과 같다(toSummarySource는 넣지 않는다).
 * older: 옛 기간 읽기. 주지 않으면 손에 든 숫자만 쓴다. 새 prop이 아니라 이 모양 안으로 온다(groups와 같은 길, tab-frame AC-312.2)
 */
export type SummarySource = { kind: 'none' } | { kind: 'data'; days: readonly DayPayload[]; groups?: readonly RxGroupLine[] | null | 'pending'; older?: OlderDays }

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
