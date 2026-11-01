import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'

// 브라우저(화면)에서 쓰는 Supabase 클라이언트. 만들기만 한다 — DB 읽기·쓰기는 lib/storage·lib/auth가 한다.
// 세션은 쿠키에 두어 서버(middleware·화면을 그리기 전 확인)와 나눠 쓴다
let client: SupabaseClient | undefined

// https로 연 페이지면 세션 쿠키에 Secure를 붙인다(운영 Vercel). 개발 localhost·E2E 127.0.0.1은 http라 붙이지 않는다.
// 서버에서 그릴 때는 window가 없다 → 붙이지 않는다(그때는 쿠키를 쓰지 않는다)
const isHttps = () => typeof window !== 'undefined' && window.location.protocol === 'https:'

export function supabaseBrowser(): SupabaseClient {
  if (client === undefined) {
    const { url, anonKey } = supabaseEnv()
    client = createBrowserClient(url, anonKey, { cookieOptions: { secure: isHttps() } })
  }
  return client
}
