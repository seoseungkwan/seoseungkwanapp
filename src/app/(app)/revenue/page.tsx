import type { Metadata } from 'next'
import { RevenueScreen } from '@/components/revenue/RevenueScreen'

// /revenue 매출 (spec revenue REQ-010). 문지기와 앱 틀은 (app)/layout이 준다. 자료는 브라우저(RevenueScreen)가 도우미와 Supabase에서 가져온다

// 브라우저 탭 이름: 레이아웃이 "매출 · 의원 이름"으로 만든다 (AC-010.2)
export const metadata: Metadata = { title: '매출' }

export default function RevenuePage() {
  return <RevenueScreen />
}
