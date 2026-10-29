// Supabase 공개 열쇠 둘. service role·비밀 열쇠는 어디에도 두지 않는다(CLAUDE.md)
// 부를 때 읽는다(모듈 맨 위에서 읽지 않는다) → 열쇠 없이도 build·test가 된다.
// process.env.NEXT_PUBLIC_…는 이름을 글자 그대로 쓴다. Next가 빌드 때 그 자리에 값을 넣는다(process.env[name]은 못 넣는다)

// 개발용 로컬 Supabase만 http를 허락한다
const LOCAL_HOSTS = ['localhost', '127.0.0.1']
// URL은 호스트의 *·; 같은 글자도 받아 준다. CSP에 와일드카드·지시어가 끼어들지 않게 이 글자만 허락한다
const HOST = /^[a-z0-9.-]+$/

// 허락하는 Supabase 주소면 경로를 뺀 origin('https://<ref>.supabase.co'), 아니면 null
export function supabaseOrigin(raw: string | undefined): string | null {
  let url: URL
  try {
    url = new URL((raw ?? '').trim())
  } catch {
    return null
  }
  if (!HOST.test(url.hostname)) return null
  const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname))
  return allowed ? url.origin : null
}

export function supabaseEnv(): { url: string; anonKey: string } {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  if (url === '') {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL이 비었어요. .env.local(배포는 Vercel 환경 변수)에 Supabase 프로젝트 주소를 넣어 주세요')
  }
  if (anonKey === '') {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY가 비었어요. .env.local(배포는 Vercel 환경 변수)에 Supabase 공개(anon) 열쇠를 넣어 주세요')
  }
  // 클라이언트도 CSP connect-src와 같은 origin으로 붙는다(끝의 /·경로가 붙어도 어긋나지 않게)
  const origin = supabaseOrigin(url)
  if (origin === null) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL이 올바른 https:// 주소가 아니에요(개발용 http://localhost·http://127.0.0.1만 예외). Supabase 프로젝트 주소(https://<ref>.supabase.co)를 넣어 주세요',
    )
  }
  return { url: origin, anonKey }
}
