import type { Metadata } from 'next'
import { FirstRunScreen } from '@/components/settings/firstRun/FirstRunScreen'

// /settings/first-run 처음 질문 (clinic-profile REQ-6614 AC-6614.1, design.md 16절). 들어오는 곳: 설정 → 병원 문구의 [처음 질문 하기]·[처음 질문 다시 하기].
// 문지기는 /settings와 같다: (app)/layout이 승인된 원장·데스크만 앱 틀에 들이고, 데스크는 앱 틀의 DeskGate가 막힌 화면으로 바꾼다(세 탭 밖 주소).
// 병원 문구는 브라우저(FirstRunScreen)가 Supabase(RLS)에 바로 읽고 쓴다. 새 서버 경로는 없다(ADR-004·021)

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '처음 질문' }

export default function FirstRunRoute() {
  return <FirstRunScreen />
}
