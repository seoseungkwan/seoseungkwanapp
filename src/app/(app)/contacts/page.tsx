import type { Metadata } from 'next'
import { ContactsScreen } from '@/components/contacts/ContactsScreen'

// /contacts 주소록 (spec contacts REQ-6505·AC-6508.2). 문지기와 앱 틀은 (app)/layout이 준다(데스크는 DeskGate가 막는다, AC-6508.3).
// 주소에서 읽는 것은 ?c=(처음 고를 업체 id, 대시보드 무상 수리 알림 링크) 하나이고 글자 하나일 때만 넘긴다(없는 id는 화면이 무시한다).
// 병원 id는 넘기지 않는다: 읽기·저장은 RLS·DB 기본값이 내 병원으로 한다
export const metadata: Metadata = { title: '주소록' }

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const { c } = await searchParams
  return typeof c === 'string' && c !== '' ? <ContactsScreen initialCompanyId={c} /> : <ContactsScreen />
}
