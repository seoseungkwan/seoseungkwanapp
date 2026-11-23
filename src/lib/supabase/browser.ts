import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'
import { VIEW_HEADER, readOnlyFetch, readViewKey } from './viewKey'

// 브라우저(화면)에서 쓰는 Supabase 클라이언트. 만들기만 한다 — DB 읽기·쓰기는 lib/storage·lib/auth가 한다.
// 세션은 쿠키에 두어 서버(middleware·화면을 그리기 전 확인)와 나눠 쓴다.
// 관리자가 다른 의원을 보는 중(보기 쿠키 ssk_view)이면 모든 요청에 머리 x-ssk-view를 붙이고 쓰기를 거른다
// (admin-view AC-8004.2). 쿠키는 처음 만들 때 한 번만 본다 — 보기를 시작·끝낼 때는 페이지를 새로 연다
let client: SupabaseClient | undefined

export function supabaseBrowser(): SupabaseClient {
  if (client === undefined) {
    const { url, anonKey } = supabaseEnv()
    const key = typeof document === 'undefined' ? null : readViewKey(document.cookie)
    client =
      key === null
        ? createBrowserClient(url, anonKey)
        : createBrowserClient(url, anonKey, { global: { headers: { [VIEW_HEADER]: key }, fetch: readOnlyFetch(fetch) } })
  }
  return client
}
