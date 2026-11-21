import type { Metadata } from 'next'
import { LeaveScreen } from '@/components/staff/leave/LeaveScreen'
import { todayInKorea } from '@/lib/analytics/dates'

// /staff/leave 직원 — 휴가 (staff REQ-7614, design.md 6절). 제목 '직원'과 작은 메뉴는 staff/layout이 그린다(데스크면 아무것도 그리지 않는다).
// 병원 id는 넘기지 않는다: 읽기·저장은 RLS·DB 기본값이 내 병원으로 한다

// "오늘"은 요청 때의 한국 날짜다(연차 기간·이번 달 안내·달력의 기준) → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '직원' }

export default function StaffLeavePage() {
  return <LeaveScreen today={todayInKorea()} />
}
