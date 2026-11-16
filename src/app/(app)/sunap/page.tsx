import type { Metadata } from 'next'
import { SunapScreen } from '@/components/sunap/SunapScreen'
import { todayInKorea } from '@/lib/analytics/dates'

// /sunap 수납일지 (specs/sunap-ilji REQ-4907). 문지기와 앱 틀은 (app)/layout이 준다.
// 병원 id는 넘기지 않는다: 저장은 RLS·DB 기본값이 내 병원으로 한다

// 첫 날짜는 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: '수납일지' }

export default function SunapPage() {
  return <SunapScreen initialToday={todayInKorea()} />
}
