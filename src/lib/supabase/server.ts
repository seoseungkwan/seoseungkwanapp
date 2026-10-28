import 'server-only'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { supabaseEnv } from './env'

// 서버(화면을 그리기 전 병원 상태 확인·auth/callback)에서 쓰는 Supabase 클라이언트. 요청마다 새로 만든다.
// 만들기만 한다 — DB 읽기·쓰기는 lib/auth가 한다. 사용자 확인은 auth.getUser()로(서버에서 getSession()은 믿지 않는다)
export async function supabaseServer(): Promise<SupabaseClient> {
  const { url, anonKey } = supabaseEnv()
  const cookieStore = await cookies()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Server Component에서는 쿠키를 쓸 수 없다. 세션 새로 고침은 middleware가 한다
        }
      },
    },
  })
}
