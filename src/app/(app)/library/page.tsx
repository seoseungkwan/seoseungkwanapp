import type { Metadata } from 'next'
import { LibraryScreen } from '@/components/library/LibraryScreen'
import { currentMe } from '../currentMe.server'

// /library 자료실 (spec library REQ-8105·REQ-8106·REQ-8107, design.md '화면' page.tsx). 승인된 사람 모두(원장·데스크·관리자)가 연다.
// 문지기와 앱 틀은 (app)/layout이 준다(데스크는 DeskGate가 자료실을 연다 — library TASK-4). 이 페이지는 관리자인지 하나만 화면에 넘긴다:
// 앱 틀이 같은 요청에서 이미 읽은 문지기 값(currentMe — 요청마다 한 번, 새 DB 읽기 없음)의 isAdmin이고, 승인된 병원 줄이 있을 때만 참이다
// (데스크·관리자가 아닌 원장은 거짓). 보는 중(admin-view)이면 화면이 useReadOnly()로 [파일 올리기]·[지우기]를 숨긴다.
// 목록·받기·올리기·지우기는 브라우저 + RLS·Storage 규칙이 한다(lib/storage/library). 병원 id는 넘기지 않는다 — 자료실은 모든 의원이 같은 하나다

// 요청의 로그인 세션으로만 그릴 수 있다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: '자료실' }

export default async function LibraryPage() {
  const me = await currentMe()
  return <LibraryScreen isAdmin={me.isAdmin && me.hospital?.status === 'approved'} />
}
