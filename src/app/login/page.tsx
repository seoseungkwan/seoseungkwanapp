import { AuthFrame } from '@/components/auth/AuthFrame'
import { LoginCard } from '@/components/auth/LoginCard'

// 로그인(목업 로그인·로그인 실패). 로그인한 사람이 오면 middleware가 /dashboard로 보낸다.
// ?error=1(구글에서 돌아왔는데 세션을 못 만듦)이면 E-AUTH-CALLBACK 카드. error 값은 '1'인지만 보고 화면에 찍지 않는다
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { error } = await searchParams
  return (
    <AuthFrame>
      <LoginCard failed={error === '1'} />
    </AuthFrame>
  )
}
