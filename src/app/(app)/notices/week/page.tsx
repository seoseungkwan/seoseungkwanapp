import type { Metadata } from 'next'
import { WeekScreen } from '@/components/notices/week/WeekScreen'
import { todayInKorea } from '@/lib/analytics/dates'
import { currentMe } from '../../currentMe.server'

// /notices/week 고시·공지 주간 모음 (specs/notices REQ-7421, design 10절). 문지기와 앱 틀은 (app)/layout이 준다.
// 모음은 브라우저(WeekScreen)가 Supabase(RLS, 승인된 원장만)에서 바로 읽는다. 이 페이지는 고시·공지 표를 읽지 않는다(ADR-004)

// "오늘"(가장 최근 주)은 요청 때의 한국 날짜다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '고시·공지 주간 모음' }

export default async function NoticesWeekPage({ searchParams }: { searchParams: Promise<{ w?: string | string[] }> }) {
  // 병원 이름은 문지기가 이미 읽은 내 병원 줄에서 꺼낸다(요청 안에서 한 번만 읽는다)
  const { hospital, desk } = await currentMe()
  if (hospital === null) {
    // 데스크(requirements 배경: 데스크 계정은 못 본다): 막힌 화면은 앱 틀(DeskGate)이 그린다. 던지면 앱 틀 대신 오류 화면이 뜬다 → 아무것도 그리지 않는다
    if (desk) return null
    // 문지기는 승인된 병원 줄이 있을 때만 앱 경로를 연다 → 아니면 여기 올 수 없다. 던지면 오류 화면(app/error.tsx)이 내용 없이 안내한다
    throw new Error('승인된 병원 줄이 없어요')
  }
  if (hospital.status !== 'approved') throw new Error('승인된 병원 줄이 없어요')
  // ?w는 글자 하나일 때만 넘긴다. 그릴 수 있는 월요일 날짜인지는 화면이 본다(아니면 가장 최근 모음, 기본값 24)
  const { w } = await searchParams
  return <WeekScreen hospitalName={hospital.name} today={todayInKorea()} week={typeof w === 'string' ? w : undefined} />
}
