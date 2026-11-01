import type { Metadata } from 'next'
import { BitDashboard } from '@/components/dashboard/live/BitDashboard'
import { dashboardSummarySource } from '@/components/dashboard/summary/source'
import { todayInKorea } from '@/lib/analytics/dates'

// /dashboard (tab-frame REQ-306·REQ-307, design.md '대시보드 페이지 조립'): 로그인·승인 뒤 도착하는 첫 화면. 문지기와 앱 틀은 (app)/layout이 준다.
// 자료 읽는 자리(dashboardSummarySource)의 값을 처음 자료로 BitDashboard에 넘긴다. 그 화면이 비트 PC에서 숫자를 읽어 모양을 고른다(bit-dashboard REQ-601).
// 지금 그 자리는 늘 자료 없음이라 서버 그림은 연결 전 모양이다(지어낸 숫자 없음). 저장 숫자 읽기와 잇는 일은 bit-dashboard TASK-8이다

// 날짜 줄의 "오늘"은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '대시보드' }

export default function DashboardPage() {
  return <BitDashboard today={todayInKorea()} initial={dashboardSummarySource()} />
}
