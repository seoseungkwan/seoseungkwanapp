import 'server-only'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { supabaseEnv } from './env'
import { VIEW_COOKIE, VIEW_HEADER, viewKeyOf } from './viewKey'

// 서버(화면을 그리기 전 병원 상태 확인·auth/callback)에서 쓰는 Supabase 클라이언트. 요청마다 새로 만든다.
// 만들기만 한다 — DB 읽기·쓰기는 lib/auth가 한다. 사용자 확인은 auth.getUser()로(서버에서 getSession()은 믿지 않는다).
// 요청 쿠키에 보기 열쇠(ssk_view, uuid 모양)가 있으면 같은 머리 x-ssk-view를 붙인다(거르는 fetch는 없음, admin-view AC-8004.4)
export async function supabaseServer(): Promise<SupabaseClient> {
  const { url, anonKey } = supabaseEnv()
  const cookieStore = await cookies()
  const key = viewKeyOf(cookieStore.get(VIEW_COOKIE)?.value)
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
    ...(key === null ? {} : { global: { headers: { [VIEW_HEADER]: key } } }),
  })
}
