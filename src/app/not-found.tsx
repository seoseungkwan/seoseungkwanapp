import type { Metadata } from 'next'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { NotFoundScreen } from '@/components/common/NotFoundScreen'

// 없는 주소 — 밖 모양 (ui-90 AC-410.2·AC-410.4). Next 영어 기본 화면 대신 쓰는 안전망이다:
// 로그인 안 한 사람의 없는 주소는 middleware가 /login으로 보내고, 로그인한 사람은 (app)/[...rest]가 앱 틀 안에서 받는다.
// 모양은 NotFoundScreen이 정한다(여기는 클래스 없음). 자료를 읽지 않는다

// 탭 이름: 뿌리 template으로 "찾는 화면이 없어요 · 병원 업무 도구"
export const metadata: Metadata = { title: '찾는 화면이 없어요' }

export default function NotFound() {
  return (
    <AuthFrame>
      <NotFoundScreen where="outside" />
    </AuthFrame>
  )
}
