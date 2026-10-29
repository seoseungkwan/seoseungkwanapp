import { NextResponse, type NextRequest } from 'next/server'
import { decideRoute } from '@/lib/auth/gate'
import { updateSession } from '@/lib/supabase/middleware'

// 세션 새로 고침 + 로그인 여부만 본다. 병원 상태는 DB를 읽지 않고 'unknown'으로 두고 페이지 guard가 정한다.
// 열쇠가 없으면 supabaseEnv가 던진다 — 그대로 둔다(열쇠 없이 앱을 열 수 없다)
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { response, userId } = await updateSession(request)
  // 경로만 넘긴다(쿼리 없이). '/login?error=1'도 '/login'으로 본다
  const to = decideRoute({ path: request.nextUrl.pathname, signedIn: userId !== null, hospital: 'unknown', isAdmin: false })
  if (to === null) return response

  // to는 gate가 정한 고정 경로뿐이라 같은 origin으로만 간다.
  // 새 응답을 만들면 updateSession이 정한 세션 쿠키와 캐시 금지 헤더를 옮긴다(안 옮기면 세션이 끊긴다)
  const redirect = NextResponse.redirect(new URL(to, request.url))
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
  for (const name of ['Cache-Control', 'Expires', 'Pragma']) {
    const value = response.headers.get(name)
    if (value !== null) redirect.headers.set(name, value)
  }
  return redirect
}

export const config = {
  // _next/·favicon.ico·랜딩 그림(public/landing/)·가짜 견본(public/fake-sample/)·그림·영상 파일은 거치지 않는다
  matcher: [
    '/((?!_next/|favicon\\.ico|landing/|fake-sample/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm)$).*)',
  ],
}
