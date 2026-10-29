import { AuthFrame } from '@/components/auth/AuthFrame'
import { SignupForm } from '@/components/auth/SignupForm'
import { guardPage } from '@/lib/auth/guard.server'

// 가입 신청(목업 Signup). 그리기 전에 guard가 병원 상태를 본다: 병원 줄이 없을 때만 열리고, 아니면 맞는 곳으로 보낸다.
// 이메일은 로그인한 구글 계정(Me) — 폼은 보이기만 한다

// 요청의 로그인 세션으로만 그릴 수 있다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

export default async function SignupPage() {
  const me = await guardPage('/signup')
  return (
    <AuthFrame>
      <SignupForm email={me.email} />
    </AuthFrame>
  )
}
