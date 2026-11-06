import type { Metadata } from 'next'
import { LiveDashboard } from '@/components/dashboard/summary/LiveDashboard'
import { todayInKorea } from '@/lib/analytics/dates'

// /dashboard (tab-frame REQ-306·REQ-307, design.md '대시보드 페이지 조립'): 로그인·승인 뒤 도착하는 첫 화면. 문지기와 앱 틀은 (app)/layout이 준다.
// 오늘 한국 날짜만 LiveDashboard에 넘긴다. 저장 숫자는 브라우저가 읽어 BitDashboard의 처음 자료로 넘기고, 그 화면이 비트 PC에서 숫자를 읽어 모양을 고른다
// (bit-dashboard AC-601.14, stats AC-516.1). 서버 코드인 이 페이지는 통계 표를 읽지 않아 서버 그림은 늘 연결 전 모양이다(지어낸 숫자 없음)

// 날짜 줄의 "오늘"은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '대시보드' }

export default function DashboardPage() {
  return <LiveDashboard today={todayInKorea()} />
}
