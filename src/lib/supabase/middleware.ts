import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ACTIVE_COOKIE, activeCookieOptions, isSessionCookie } from '@/lib/auth/activity'
import { supabaseEnv } from './env'

// middleware에서 세션을 새로 고친다(@supabase/ssr 공식 Next.js 방식). 실제 src/middleware.ts가 부른다.
// 새 세션 쿠키는 요청(뒤따르는 서버 코드가 읽음)과 응답(브라우저에 저장) 둘 다에 옮긴다.
// 로그인했는데 움직임 쿠키(app-active)가 없으면 31분 넘게 비운 브라우저다 → 이 브라우저의 로그인을 끊는다(ADR-023)
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; userId: string | null }> {
  const { url, anonKey } = supabaseEnv()
  // 운영(Vercel)은 https라 Secure를 붙이고, 개발 localhost·E2E 127.0.0.1은 http라 붙이지 않는다
  const secure = request.nextUrl.protocol === 'https:'
  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: { secure },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        // 세션 쿠키가 든 응답을 CDN이 저장해 다른 사람에게 주지 않게(Cache-Control: no-store 등)
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })
  // createServerClient와 getUser() 사이에 다른 코드를 두지 않는다(공식 안내).
  // getUser()는 Supabase 서버에 물어 확인한다. getSession()은 쿠키를 그대로 믿어 서버에서는 쓰지 않는다
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id ?? null
  if (userId === null) return { response, userId }
  // 콜백이 새 세션과 움직임 쿠키를 만든다. 여기서 끊으면 코드 검증값까지 지워져 코드 교환이 실패한다
  if (request.nextUrl.pathname === '/auth/callback') return { response, userId }

  if (!request.cookies.has(ACTIVE_COOKIE)) {
    // 이 브라우저의 세션만 서버에서 폐기한다(다른 기기는 그대로). 오류 내용은 남기지 않는다
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // 실패해도 아래에서 세션 쿠키를 직접 지운다
    }
    // response는 setAll이 바꿔 끼웠을 수 있다 → signOut 뒤의 response에 지우기를 싣는다.
    // 직접 지우는 것은 세션 쿠키뿐이다(코드 검증값·app-active·다른 쿠키는 건드리지 않는다)
    for (const { name } of request.cookies.getAll()) {
      if (isSessionCookie(name)) response.cookies.set(name, '', { path: '/', maxAge: 0 })
    }
    response.headers.set('Cache-Control', 'private, no-store')
    return { response, userId: null }
  }

  response.cookies.set(ACTIVE_COOKIE, '1', activeCookieOptions(secure))
  return { response, userId }
}
