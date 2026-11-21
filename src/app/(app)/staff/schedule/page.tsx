import type { Metadata } from 'next'
import { ScheduleScreen } from '@/components/staff/schedule/ScheduleScreen'
import { todayInKorea } from '@/lib/analytics/dates'

// /staff/schedule 직원 — 근무표 (staff REQ-7613, 시안 docs/mockups/staff/schedule.html). 제목 '직원'과 작은 메뉴는 staff/layout이 그린다.
// 직원 자료는 화면이 브라우저에서 읽는다(RLS가 내 병원으로). 병원 id는 넘기지 않는다

// "오늘"은 요청 때의 한국 날짜다(이번 주·이번 달·오늘 칸) → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '직원' }

export default function StaffSchedulePage() {
  return <ScheduleScreen today={todayInKorea()} />
}
