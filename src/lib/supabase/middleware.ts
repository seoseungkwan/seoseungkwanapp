import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseEnv } from './env'

// middleware에서 세션을 새로 고친다(@supabase/ssr 공식 Next.js 방식). 실제 src/middleware.ts가 부른다.
// 새 세션 쿠키는 요청(뒤따르는 서버 코드가 읽음)과 응답(브라우저에 저장) 둘 다에 옮긴다
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; userId: string | null }> {
  const { url, anonKey } = supabaseEnv()
  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, anonKey, {
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
  return { response, userId: data.user?.id ?? null }
}
