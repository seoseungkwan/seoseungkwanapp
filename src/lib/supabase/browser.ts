import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'

// 브라우저(화면)에서 쓰는 Supabase 클라이언트. 만들기만 한다 — DB 읽기·쓰기는 lib/storage·lib/auth가 한다.
// 세션은 쿠키에 두어 서버(middleware·화면을 그리기 전 확인)와 나눠 쓴다
let client: SupabaseClient | undefined

export function supabaseBrowser(): SupabaseClient {
  if (client === undefined) {
    const { url, anonKey } = supabaseEnv()
    client = createBrowserClient(url, anonKey)
  }
  return client
}
