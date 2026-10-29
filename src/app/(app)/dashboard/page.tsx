import { DashboardEmpty } from '@/components/dashboard/DashboardEmpty'
import { koreanDateTitle } from '@/components/dashboard/todayTitle'
import { todayInKorea } from '@/lib/analytics/dates'

// /dashboard (REQ-009): 로그인·승인 뒤 도착하는 첫 화면. 문지기와 앱 틀은 (app)/layout이 준다.
// 지금은 빈 자리(제목 + 준비 중 안내)만 — 숫자·자료는 읽지 않는다(대시보드 내용은 별도 명세)

// 제목의 "오늘"은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return <DashboardEmpty title={koreanDateTitle(todayInKorea())} />
}
