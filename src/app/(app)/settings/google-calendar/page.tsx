import type { Metadata } from 'next'
import { GcalSettingsScreen } from '@/components/gcalSettings/GcalSettingsScreen'
import type { GcalTab } from '@/components/gcalSettings/frame/GcalFrame'

// /settings/google-calendar 설정 › 구글 캘린더 (spec google-link REQ-8528·REQ-8540 AC-8540.3·AC-8540.4, design.md 15절).
// 문지기·앱 틀은 (app)/layout이 준다(데스크도 이 주소만 설정에서 연다 — DeskGate). 원장·데스크 모두 같은 페이지이고,
// 연결·예약 설정은 브라우저(GcalSettingsScreen)가 RLS로 읽는다. 여기서는 주소 ?tab=만 골라 넘긴다(모르는 값·여럿이면 null — 화면이 처음 칸을 고른다)

// 주소(?tab=)로 칸을 고른다 → 요청마다 그린다
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: '구글 캘린더' }

const TABS: readonly GcalTab[] = ['connect', 'colors', 'import', 'rules']
const tabOf = (value: string | string[] | undefined): GcalTab | null => TABS.find((tab) => tab === value) ?? null

export default async function GoogleCalendarPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams
  return <GcalSettingsScreen initialTab={tabOf(tab)} />
}
