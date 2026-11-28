import type { Metadata } from 'next'
import { phraseOpenOf, SettingsPage, type SettingsSearch } from '@/components/settings/SettingsPage'

// /settings 설정 (precheck REQ-012, 목업 화면 10). 문지기와 앱 틀은 (app)/layout이 준다.
// 설정 표는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다. 규칙 목록은 Worker에서 받는다. 새 서버 경로는 없다(ADR-004·021)
// 주소 ?ptab=&field= · ?ptab=learn&learn=(claim-learn AC-9306.2)은 정해진 키만 골라(phraseOpenOf) 병원 문구 칸에 넘긴다. 주소마다 달라서 미리 굽지 않는다

// 브라우저 탭 이름 (ui-90 AC-402.4)
export const metadata: Metadata = { title: '설정' }

export const dynamic = 'force-dynamic'

export default async function SettingsRoute({ searchParams }: { searchParams?: Promise<SettingsSearch> }) {
  return <SettingsPage open={phraseOpenOf((await searchParams) ?? {})} />
}
