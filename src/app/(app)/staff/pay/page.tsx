import type { Metadata } from 'next'
import { PayScreen } from '@/components/staff/pay/PayScreen'
import { todayInKorea } from '@/lib/analytics/dates'

// /staff/pay 직원 — 급여 (staff REQ-7615, 시안 docs/mockups/staff/pay.html). 제목 '직원'과 작은 메뉴는 staff/layout이 그린다.
// 고른 칸(?part=)과 오늘(한국 날짜)을 화면에 넘긴다. 급여 자료는 화면이 브라우저에서 읽는다

// "오늘"은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '직원' }

export default async function StaffPayPage({ searchParams }: { searchParams: Promise<{ part?: string | string[] }> }) {
  const { part } = await searchParams
  return <PayScreen today={todayInKorea()} initialPart={typeof part === 'string' ? part : null} />
}
