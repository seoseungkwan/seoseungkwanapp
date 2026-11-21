import type { Metadata } from 'next'
import { RosterScreen } from '@/components/staff/roster/RosterScreen'
import { todayInKorea } from '@/lib/analytics/dates'

// /staff 직원 — 명단 (staff REQ-7612, 시안 docs/mockups/staff/list.html). 제목 '직원'과 작은 메뉴는 staff/layout이 그린다.
// 직원 자료는 명단 화면이 브라우저에서 읽는다(RLS가 내 병원 원장 줄만 준다). 병원 id는 넘기지 않는다

// "오늘"은 요청 때의 한국 날짜다(근속·알림·연차를 센다) → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '직원' }

export default function StaffPage() {
  return <RosterScreen today={todayInKorea()} />
}
