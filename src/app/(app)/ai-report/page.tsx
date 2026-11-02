import type { Metadata } from 'next'
import { AiReportScreen } from '@/components/ai-report/AiReportScreen'
import { todayInKorea } from '@/lib/analytics/dates'

// /ai-report AI 리포트 (ai-report-screen REQ-714). 문지기와 앱 틀(여백 포함)은 (app)/layout이 준다 — 여기서 여백 틀을 더 씌우지 않는다

// 화면의 "오늘"은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름
export const metadata: Metadata = { title: 'AI 리포트' }

export default function AiReportPage() {
  return <AiReportScreen today={todayInKorea()} />
}
