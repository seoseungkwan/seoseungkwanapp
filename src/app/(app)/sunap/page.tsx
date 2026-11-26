import type { Metadata } from 'next'
import { SunapTab } from '@/components/gsheet/SunapTab'
import { todayInKorea } from '@/lib/analytics/dates'

// /sunap 수납일지 (specs/sunap-ilji REQ-4907, google-link REQ-8514). 문지기와 앱 틀은 (app)/layout이 준다.
// 탭 머리 [구글 시트] [웹앱 수납일지] 묶음(SunapTab)을 그린다 — [웹앱 수납일지]는 지금 수납일지 화면 그대로.
// 병원 id는 넘기지 않는다: 저장은 RLS·DB 기본값이 내 병원으로 한다

// 첫 날짜는 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: '수납일지' }

export default function SunapPage() {
  return <SunapTab initialToday={todayInKorea()} />
}
