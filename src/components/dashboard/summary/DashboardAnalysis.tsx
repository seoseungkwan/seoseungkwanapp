'use client'

import { DailySection } from './DailySection'
import { FlowSection } from './FlowSection'
import type { SummarySource } from './source'

// 대시보드 분석 = 일별 현황(DailySection) → 기간별 흐름(FlowSection) (dashboard-ux AC-2707.4, 앞 tab-frame REQ-311).
// 두 구역은 따로 파일이고 이 부품은 차례만 정한다. 숫자가 있는 화면은 BitDashboard가 두 구역 사이에 AI 경영 리포트 요약을 끼워 직접 짠다(AC-2707.2).
// 연결 전·읽는 중에는 이 부품을 쓴다(숫자가 없으면 각 구역이 빈 모양을 그린다). 받는 값은 자료 모양(source)과 화면 글자·참거짓뿐이다(tab-frame AC-312.2)

// 숫자가 없을 때의 글(bit-dashboard design.md '### 화면'). 주지 않으면 각 구역의 연결 전 글이고, 숫자가 있으면 쓰지 않는다
export type DashboardAnalysisProps = {
  today: string
  source: SummarySource
  /** 고른 날(bit-dashboard AC-605.3). 없으면 오늘이다. 일별 현황만 바꾸고 기간별 흐름은 today로만 계산한다(AC-605.6) */
  day?: string
  emptyChip?: string
  emptyText?: string
  /** 숫자 줄 아래 안내 줄. null이면 없다 */
  emptyNote?: string | null
  gainsTitle?: string
  gainsNote?: string
  /** '신환 재방문율' 줄 설명 */
  gainsRevisitDesc?: string
  /** 읽었는데 자료가 없을 때: 목록 대신 빈 그래프 틀을 그린다 */
  emptyCharts?: boolean
}

export function DashboardAnalysis({ today, source, day, emptyChip, emptyText, emptyNote, gainsTitle, gainsNote, gainsRevisitDesc, emptyCharts }: DashboardAnalysisProps) {
  return (
    <>
      <DailySection today={today} source={source} day={day} emptyChip={emptyChip} emptyText={emptyText} emptyNote={emptyNote} />
      <FlowSection today={today} source={source} gainsTitle={gainsTitle} gainsNote={gainsNote} gainsRevisitDesc={gainsRevisitDesc} emptyCharts={emptyCharts} />
    </>
  )
}
