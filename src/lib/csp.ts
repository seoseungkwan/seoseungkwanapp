import { supabaseOrigin } from './supabase/env'

// 브라우저가 쓸 수 있는 주소 목록(파일럿 그대로 + media-src). next.config.ts가 불러 쓴다
// 연결 주소는 자기 자신('self')과 Supabase(로그인·병원) origin뿐이다. 주소가 없거나 잘못되면 'self'만(빌드는 된다)
// 구글 로그인은 페이지 이동이라 connect-src가 필요 없다. 글꼴은 next/font가 우리 쪽에서 낸다
export function buildCsp(isDev: boolean, supabaseUrl: string): string {
  const supabase = supabaseOrigin(supabaseUrl)
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Next 개발 서버만 eval이 필요하다
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    // 랜딩 영상·이미지는 public/에 둔다(plan.md §6-1)
    'media-src': ["'self'"],
    // 개발 서버의 새로 고침(HMR) 연결
    'connect-src': ["'self'", ...(supabase ? [supabase] : []), ...(isDev ? ['ws:'] : [])],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}
