import type { Metadata } from 'next'

// /staff 직원 — 명단 자리 (staff AC-7611.1·AC-7611.2). 제목 '직원'과 작은 메뉴는 staff/layout이 그린다.
// 명단 화면(시안 list.html)은 TASK-10이 이 파일에 넣는다. 그때까지는 빈 자리다

// "오늘"은 요청 때의 한국 날짜다(명단 화면이 받는다) → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '직원' }

export default function StaffPage() {
  return null
}
