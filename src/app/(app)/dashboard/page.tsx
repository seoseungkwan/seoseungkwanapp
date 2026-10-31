import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { todayInKorea } from '@/lib/analytics/dates'

// /dashboard (tab-frame REQ-306, design.md '대시보드 페이지 조립'): 로그인·승인 뒤 도착하는 첫 화면. 문지기와 앱 틀은 (app)/layout이 준다.
// 지금은 연결 전 모양(1안 오늘 브리핑)만 — 숫자·자료는 읽지 않는다. 분석·보고 문장 끼우기는 통합 TASK(TASK-9)가 한다

// 날짜 줄의 "오늘"은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return <DashboardHome today={todayInKorea()} report={null} />
}
