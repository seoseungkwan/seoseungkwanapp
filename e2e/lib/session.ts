// 시험 코드 로그인: Node에서 시험 계정 비밀번호로 로그인하고, @supabase/ssr가 응답에 쓰려던 세션 쿠키를 모은다.
// e2e/support.ts가 그 쿠키를 브라우저에 넣는다. 앱에는 이메일 로그인 길이 없다(로그인은 구글 OAuth뿐, AC-003.5).
// 쿠키 이름·조각(.0·.1)·값 인코딩(base64-)은 앱과 같은 판의 라이브러리가 정한다 — 손으로 흉내 내지 않는다(AC-003.1).
// CRITICAL: 던지는 메시지에는 역할 이름·HTTP 상태·오류 코드만 담는다. 이메일·비밀번호·토큰·응답 내용·원래 오류(cause)는 담지 않는다
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { isAuthError, type SupabaseClient } from '@supabase/supabase-js'
import type { E2eEnv, Role } from './env'

// @supabase/ssr setAll이 주는 것 그대로
export type CookieToSet = { name: string; value: string; options: CookieOptions }
// Playwright context.addCookies가 받는 모양
export type BrowserCookie = {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
  expires: number
}

const ROLE_LABEL: Record<Role, string> = { admin: '관리자', approved: '승인됨', pending: '승인 대기', new: '신청 전' }
const roleName = (role: Role) => `${ROLE_LABEL[role]}(${role})`

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// supabase-js 기본 저장 이름 sb-<ref>-auth-token(ref = 호스트 첫 칸)과 라이브러리가 길면 나누는 조각 .0·.1…
export function authCookiePattern(supabaseUrl: string): RegExp {
  const ref = new URL(supabaseUrl).hostname.split('.')[0]
  return new RegExp(`^sb-${escapeRegExp(ref)}-auth-token(\\.\\d+)?$`)
}

// cookie 패키지 규칙: sameSite true = Strict. 없거나 false면 브라우저 기본 Lax
function sameSiteOf(value: CookieOptions['sameSite']): BrowserCookie['sameSite'] {
  if (value === true || value === 'strict') return 'Strict'
  if (value === 'none') return 'None'
  return 'Lax'
}

// 빈 값은 라이브러리의 지우기 표시라 버린다. 앱이 http://127.0.0.1에서 쓸 때처럼 domain만 그 호스트로 정하고 나머지 옵션은 그대로
export function toBrowserCookies(cookies: CookieToSet[], host: string, nowSec: number): BrowserCookie[] {
  return cookies
    .filter((cookie) => cookie.value !== '')
    .map(({ name, value, options }) => ({
      name,
      value,
      domain: host,
      path: options.path ?? '/',
      httpOnly: options.httpOnly ?? false,
      secure: options.secure ?? false,
      sameSite: sameSiteOf(options.sameSite),
      // Playwright expires는 초 단위 시각, -1 = 브라우저를 닫으면 사라지는 쿠키
      expires: typeof options.maxAge === 'number' ? nowSec + options.maxAge : -1,
    }))
}

// Supabase 오류 코드는 invalid_credentials처럼 정해 둔 이름이다. 그 모양이 아니면 담지 않는다
const SAFE_CODE = /^[a-z0-9_]{1,64}$/

function signInFailure(role: Role, error: unknown): Error {
  const status = isAuthError(error) && typeof error.status === 'number' && error.status > 0 ? `HTTP ${error.status}` : 'HTTP 응답 없음'
  const code = isAuthError(error) && typeof error.code === 'string' && SAFE_CODE.test(error.code) ? error.code : '오류 코드 없음'
  return new Error(
    `${roleName(role)} 시험 계정으로 로그인하지 못했어요(${status}, ${code}) — ` +
      'Supabase Authentication → Users에 그 계정이 있는지(Auto Confirm), .env.local 값이 맞는지(따로 연 터미널에서 npm run e2e:env) 확인해 주세요',
  )
}

export async function passwordSession(input: {
  env: E2eEnv
  role: Role
  fetch?: typeof fetch
}): Promise<{ client: SupabaseClient; userId: string; cookies: CookieToSet[] }> {
  const { env, role } = input
  // 전역 fetch는 부를 때 찾는다(시험이 바꿔 끼울 수 있게)
  const fetchFn: typeof fetch = input.fetch ?? ((...args) => globalThis.fetch(...args))
  // 메모리 쿠키 저장소: 라이브러리가 읽고(getAll) 쓴다(setAll). 로그인 때 쓴 쿠키를 그대로 모은다
  const jar = new Map<string, string>()
  const written: CookieToSet[] = []
  const client = createServerClient(env.supabaseUrl, env.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          written.push({ name, value, options: { ...options } })
          if (value === '') jar.delete(name)
          else jar.set(name, value)
        }
      },
    },
    global: { fetch: fetchFn },
  })

  const { email, password } = env.accounts[role]
  let result: Awaited<ReturnType<typeof client.auth.signInWithPassword>>
  try {
    result = await client.auth.signInWithPassword({ email, password })
  } catch {
    throw signInFailure(role, null)
  }
  if (result.error !== null || result.data.user === null) throw signInFailure(role, result.error)

  const cookies = [...written]
  const pattern = authCookiePattern(env.supabaseUrl)
  if (!cookies.some((cookie) => cookie.value !== '' && pattern.test(cookie.name))) {
    throw new Error(
      `${roleName(role)} 시험 계정 로그인은 됐는데 세션 쿠키를 받지 못했어요 — @supabase/ssr 판이 바뀌었을 수 있으니 Claude에게 알려 주세요`,
    )
  }
  return { client, userId: result.data.user.id, cookies }
}

export type AccountState = { hospitalStatus: 'pending' | 'approved' | 'rejected' | null; isAdmin: boolean }

// supabase/e2e-accounts.sql이 만드는 상태
export const EXPECTED_STATE: Record<Role, AccountState> = {
  admin: { hospitalStatus: 'approved', isAdmin: true },
  approved: { hospitalStatus: 'approved', isAdmin: false },
  pending: { hospitalStatus: 'pending', isAdmin: false },
  new: { hospitalStatus: null, isAdmin: false },
}

const describeState = (state: AccountState) =>
  `병원 ${state.hospitalStatus ?? '줄 없음'}·관리자 ${state.isAdmin ? '맞음' : '아님'}`

export function accountProblem(role: Role, actual: AccountState): string | null {
  const expected = EXPECTED_STATE[role]
  if (actual.hospitalStatus === expected.hospitalStatus && actual.isAdmin === expected.isAdmin) return null
  return (
    `${roleName(role)} 시험 계정 상태가 달라요: 지금 ${describeState(actual)}, 기대 ${describeState(expected)} — ` +
    'Supabase SQL 편집기에서 `supabase/e2e-accounts.sql`을 다시 실행해 주세요'
  )
}
