import { AuthFrame } from '@/components/auth/AuthFrame'
import { LoginAside } from '@/components/auth/LoginAside'
import { LoginCard } from '@/components/auth/LoginCard'

// 로그인(목업 로그인·로그인 실패). 로그인한 사람이 오면 middleware가 /dashboard로 보낸다.
// 틀은 두 칸 AuthFrame: 왼쪽 로그인 폼, 오른쪽 aside에 소개 문장 + 대시보드 미리보기(b2b-redesign AC-213.3·AC-214.3)
// ?error=1(구글에서 돌아왔는데 세션을 못 만듦)이면 E-AUTH-CALLBACK 카드. error 값은 '1'인지만 보고 화면에 찍지 않는다
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { error } = await searchParams
  return (
    <AuthFrame aside={<LoginAside />}>
      <LoginCard failed={error === '1'} />
    </AuthFrame>
  )
}
