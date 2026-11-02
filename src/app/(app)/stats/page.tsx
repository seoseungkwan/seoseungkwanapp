import type { Metadata } from 'next'
import { StatsScreen } from '@/components/stats/StatsScreen'
import { todayInKorea } from '@/lib/analytics/dates'
import { currentMe } from '../currentMe.server'

// /stats 통계 (stats REQ-515, design.md 'TASK-15 탭 연결'). 문지기와 앱 틀은 (app)/layout이 준다.
// 통계 숫자는 브라우저(StatsScreen)가 Supabase(RLS)에 바로 읽고 쓴다. 이 페이지는 통계 표를 읽지 않는다(ADR-004)

// "오늘"은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '통계' }

export default async function StatsPage() {
  // 병원 이름은 문지기가 이미 읽은 내 병원 줄에서 꺼낸다(요청 안에서 한 번만 읽는다)
  const { hospital } = await currentMe()
  // 문지기는 승인된 병원 줄이 있을 때만 앱 경로를 연다 → 아니면 여기 올 수 없다. 던지면 오류 화면(app/error.tsx)이 내용 없이 안내한다
  if (hospital === null) throw new Error('승인된 병원 줄이 없어요')
  return <StatsScreen hospitalName={hospital.name} today={todayInKorea()} />
}
