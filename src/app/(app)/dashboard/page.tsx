import type { Metadata } from 'next'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { DashboardAnalysis } from '@/components/dashboard/summary/DashboardAnalysis'
import { ReportBlock } from '@/components/dashboard/summary/ReportBlock'
import { dashboardSummarySource, isConnected } from '@/components/dashboard/summary/source'
import { todayInKorea } from '@/lib/analytics/dates'

// /dashboard (tab-frame REQ-306·REQ-307, design.md '대시보드 페이지 조립'): 로그인·승인 뒤 도착하는 첫 화면. 문지기와 앱 틀은 (app)/layout이 준다.
// 자료 읽는 자리(dashboardSummarySource) 하나로 연결 전·뒤를 정해 브리핑(갈래 다)에 분석·보고 문장(갈래 라)을 끼운다.
// 지금 그 자리는 늘 자료 없음이라 화면은 연결 전 모양이다(지어낸 숫자 없음). 진짜 읽기는 다음 통계 명세가 그 자리에서 바꾼다

// 날짜 줄의 "오늘"은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '대시보드' }

export default function DashboardPage() {
  const today = todayInKorea()
  const source = dashboardSummarySource()
  return (
    <DashboardHome
      today={today}
      report={isConnected(source) ? <ReportBlock today={today} days={source.days} /> : null}
      analysis={<DashboardAnalysis today={today} source={source} />}
    />
  )
}
