import { NextResponse, type NextRequest } from 'next/server'
import { ACTIVE_COOKIE, activeCookieOptions } from '@/lib/auth/activity'
import { supabaseServer } from '@/lib/supabase/server'

// 구글 로그인에서 돌아오는 곳. code로 세션을 만들고 늘 같은 origin의 /dashboard로 보낸다.
// 돌아갈 주소 쿼리(next·redirect·returnTo 등)는 읽지 않는다(열린 리디렉트 금지).
// 실패하면 /login?error=1 — 오류 내용은 응답·로그에 남기지 않는다.
// origin은 request.url에서 얻는다(Vercel·localhost에서는 공개 origin과 같다. 다른 프록시 뒤에 두면 다시 본다)
// 성공하면 움직임 쿠키(app-active)를 함께 쓴다 — 없으면 다음 요청에서 middleware가 로그인을 끊는다(ADR-023).
// 성공·실패 모두 세션이 걸린 응답이라 캐시하지 않는다
export async function GET(request: NextRequest): Promise<NextResponse> {
  // 운영(Vercel)은 https라 Secure를 붙이고, 개발 localhost·E2E 127.0.0.1은 http라 붙이지 않는다
  const secure = request.nextUrl.protocol === 'https:'
  const code = request.nextUrl.searchParams.get('code')
  if (code) {
    try {
      const supabase = await supabaseServer({ secure })
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        const response = noStore(NextResponse.redirect(new URL('/dashboard', request.url)))
        response.cookies.set(ACTIVE_COOKIE, '1', activeCookieOptions(secure))
        return response
      }
    } catch {
      // 열쇠 없음·인터넷 끊김 등. 아래 /login?error=1(E-AUTH-CALLBACK)로 알린다
    }
  }
  return noStore(NextResponse.redirect(new URL('/login?error=1', request.url)))
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
