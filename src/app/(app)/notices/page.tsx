import type { Metadata } from 'next'
import { NoticeDetail } from '@/components/notices/detail/NoticeDetail'
import { KeywordsControl } from '@/components/notices/keywords/KeywordsControl'
import { NoticesScreen } from '@/components/notices/list/NoticesScreen'
import { currentMe } from '../currentMe.server'

// /notices 고시·공지 (specs/notices REQ-7423 AC-7423.2 · AC-7424.13, design 10절·15절). 문지기와 앱 틀은 (app)/layout이 준다.
// ?id=<uuid>면 그 글 화면(NoticeDetail), 아니면 글 목록(NoticesScreen)이다. 목록의 keywords 자리에는 내 낱말 단추·칸(KeywordsControl)을
// 이 쪽 파일이 넣는다(목록과 낱말 부품은 서로 import하지 않는다). 글 화면에는 낱말 칸이 없다.
// 글·낱말은 브라우저(화면 부품)가 Supabase(RLS, 승인된 원장만)에서 바로 읽는다. 이 페이지는 고시·공지 표를 읽지 않는다(ADR-004)

// 요청의 로그인 세션과 주소(?id=)로 고른다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

// 브라우저 탭 이름 (ui-90 AC-402.4). 글 화면(?id=)도 같은 쪽이라 같은 이름이다
export const metadata: Metadata = { title: '고시·공지' }

// 글 id 모양(Postgres uuid 글자, 대소문자 모두). 아니면 글 목록을 연다
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const { hospital, desk } = await currentMe()
  if (hospital === null) {
    // 데스크(requirements 배경: 데스크 계정은 못 본다): 막힌 화면은 앱 틀(DeskGate)이 그린다. 던지면 앱 틀 대신 오류 화면이 뜬다 → 아무것도 그리지 않는다
    if (desk) return null
    // 문지기는 승인된 병원 줄이 있을 때만 앱 경로를 연다 → 아니면 여기 올 수 없다. 던지면 오류 화면(app/error.tsx)이 내용 없이 안내한다
    throw new Error('승인된 병원 줄이 없어요')
  }
  if (hospital.status !== 'approved') throw new Error('승인된 병원 줄이 없어요')
  // ?id는 글자 하나이고 uuid 모양일 때만 글 화면이다. 글마다 새로 그려 앞 글의 읽은 상태·메모가 남지 않게 한다
  const { id } = await searchParams
  if (typeof id === 'string' && UUID.test(id)) return <NoticeDetail key={id} id={id} />
  return <NoticesScreen keywords={<KeywordsControl />} />
}
