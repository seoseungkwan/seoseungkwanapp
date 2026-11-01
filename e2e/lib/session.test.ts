import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { createServerClient } from '@supabase/ssr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTIVE_COOKIE, ACTIVE_MAX_AGE_SEC, activeCookieOptions } from '../../src/lib/auth/activity'
import { ROLES, type E2eEnv, type Role } from './env'
import {
  EXPECTED_STATE,
  accountProblem,
  activeBrowserCookie,
  authCookiePattern,
  passwordSession,
  signInCookies,
  toBrowserCookies,
  type AccountState,
  type CookieToSet,
} from './session'

// 가짜 값만 쓴다. 실제 .env.local·실제 Supabase에는 닿지 않는다(전역 fetch도 막아 둔다)
const REF = 'abcdefghijklmnopqrst'
const SUPABASE_URL = `https://${REF}.supabase.co`
const COOKIE = `sb-${REF}-auth-token`
const ANON_KEY = 'sb_publishable_fake-key-for-tests'
const USER_ID = '6f1c2a4e-1b7d-4c55-9a0e-3d2b8f7e9c10'

// 이 글자가 메시지에 나오면 비밀번호·토큰이 샌 것이다
const LEAK = 'qzx'

const ENV: E2eEnv = {
  supabaseUrl: SUPABASE_URL,
  anonKey: ANON_KEY,
  accounts: {
    admin: { email: 'owner+e2e-admin@example.com', password: 'admin-password-qzx-1234' },
    approved: { email: 'owner+e2e-approved@example.com', password: 'approved-password-qzx-12' },
    pending: { email: 'owner+e2e-pending@example.com', password: 'pending-password-qzx-12' },
    new: { email: 'owner.long.address+e2e-new-wrapping-check@example.com', password: 'new-password-qzx-123456' },
  },
}

const REFRESH_TOKEN = 'refresh-qzx-token-abc123'
const b64url = (value: string) => Buffer.from(value, 'utf8').toString('base64url')
// 이만큼 늘이면 세션 쿠키 값이 3180자 조각 두 개(.0·.1)가 된다(값은 base64가 두 번 겹쳐 늘어난다)
const LONG = 2000
// JWT 모양 가짜 access token. padding으로 길이를 정한다(길면 쿠키가 조각난다)
function fakeJwt(padding = 0): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ sub: USER_ID, role: 'authenticated', pad: `${LEAK}${'x'.repeat(padding)}` }))
  return `${header}.${payload}.sig-${LEAK}`
}

// 실제 POST /auth/v1/token?grant_type=password 성공 응답과 같은 모양
function tokenBody(accessToken: string, email: string) {
  const now = Math.floor(Date.now() / 1000)
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: REFRESH_TOKEN,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      email_confirmed_at: '2026-10-29T00:00:00Z',
      phone: '',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: '2026-10-29T00:00:00Z',
      updated_at: '2026-10-29T00:00:00Z',
      is_anonymous: false,
    },
  }
}

type Call = { url: string; method: string; headers: Headers; body: unknown }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    return respond(call)
  }
  return { fetch: fn as typeof fetch, calls }
}

const signInOk = (accessToken: string, role: Role = 'admin') =>
  fakeFetch(() => json(200, tokenBody(accessToken, ENV.accounts[role].email)))

// 라이브러리가 쓴 쿠키 값을 앱(createServerClient)이 읽는 방식 그대로 읽는다. 네트워크는 쓰지 않는다
async function readBackSession(cookies: CookieToSet[]) {
  const noNetwork = fakeFetch(() => {
    throw new Error('읽어 보기에서 네트워크를 쓰면 안 된다')
  })
  const app = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: { getAll: () => cookies.map(({ name, value }) => ({ name, value })), setAll: () => {} },
    global: { fetch: noNetwork.fetch },
  })
  const { data } = await app.auth.getSession()
  return { accessToken: data.session?.access_token ?? null, calls: noNetwork.calls }
}

// 조각을 이름 끝 번호 순서로 이어 붙인다
function joinChunks(cookies: CookieToSet[]): string {
  return [...cookies]
    .sort((a, b) => Number(a.name.split('.').pop()) - Number(b.name.split('.').pop()))
    .map((c) => c.value)
    .join('')
}

function decodeValue(value: string): { access_token?: string; refresh_token?: string; user?: { id?: string } } {
  expect(value.startsWith('base64-')).toBe(true)
  return JSON.parse(Buffer.from(value.slice('base64-'.length), 'base64url').toString('utf8'))
}

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('단위 시험에서 실제 네트워크를 쓰면 안 된다')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// @supabase/ssr 0.12.7 기본 쿠키 옵션(dist/main/utils/constants.js). 판을 올려 바뀌면 이 시험이 알린다
const LIBRARY_OPTIONS = { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 * 24 * 60 * 60 }

describe('passwordSession (AC-003.1)', () => {
  it('AC-003.1: 짧은 세션 — 라이브러리가 쓴 쿠키 sb-<ref>-auth-token 하나, 값은 base64-로 시작하고 옵션은 라이브러리 기본값', async () => {
    const token = fakeJwt()
    const auth = signInOk(token)
    const result = await passwordSession({ env: ENV, role: 'admin', fetch: auth.fetch })

    expect(result.userId).toBe(USER_ID)
    expect(result.cookies.map((c) => c.name)).toEqual([COOKIE])
    const [cookie] = result.cookies
    expect(cookie.options).toEqual(LIBRARY_OPTIONS)
    const stored = decodeValue(cookie.value)
    expect(stored.access_token).toBe(token)
    expect(stored.refresh_token).toBe(REFRESH_TOKEN)
    expect(stored.user?.id).toBe(USER_ID)
  })

  it('AC-003.1: 긴 세션 — 라이브러리가 .0·.1 조각으로 나누고, 이어 붙이면 base64- 값', async () => {
    const token = fakeJwt(LONG)
    const result = await passwordSession({ env: ENV, role: 'approved', fetch: signInOk(token, 'approved').fetch })

    expect(result.cookies.map((c) => c.name)).toEqual([`${COOKIE}.0`, `${COOKIE}.1`])
    for (const c of result.cookies) {
      expect(c.options).toEqual(LIBRARY_OPTIONS)
      // 조각 크기 3180(dist/main/utils/chunker.js)
      expect(encodeURIComponent(c.value).length).toBeLessThanOrEqual(3180)
    }
    expect(result.cookies[0].value.startsWith('base64-')).toBe(true)
    expect(decodeValue(joinChunks(result.cookies)).access_token).toBe(token)
  })

  it('AC-003.1: 모은 쿠키를 앱과 같은 createServerClient가 읽으면 같은 세션이다(짧은·긴 세션)', async () => {
    for (const padding of [0, LONG]) {
      const token = fakeJwt(padding)
      const result = await passwordSession({ env: ENV, role: 'pending', fetch: signInOk(token, 'pending').fetch })
      const readBack = await readBackSession(result.cookies)
      expect(readBack.accessToken).toBe(token)
      expect(readBack.calls).toHaveLength(0)
    }
  })

  it('AC-003.1: 그 역할의 이메일·비밀번호로 Supabase 토큰 주소 한 곳에만 묻는다(앱 경로 없음)', async () => {
    const auth = signInOk(fakeJwt(), 'new')
    await passwordSession({ env: ENV, role: 'new', fetch: auth.fetch })

    expect(auth.calls).toHaveLength(1)
    const [call] = auth.calls
    expect(call.url).toBe(`${SUPABASE_URL}/auth/v1/token?grant_type=password`)
    expect(call.method).toBe('POST')
    expect(call.headers.get('apikey')).toBe(ANON_KEY)
    expect(call.body).toMatchObject({ email: ENV.accounts.new.email, password: ENV.accounts.new.password })
  })

  it('AC-003.1: 돌려준 client는 같은 세션을 들고 있다(RLS 확인용, 네트워크 없이)', async () => {
    const token = fakeJwt()
    const auth = signInOk(token)
    const result = await passwordSession({ env: ENV, role: 'admin', fetch: auth.fetch })
    const { data } = await result.client.auth.getSession()
    expect(data.session?.access_token).toBe(token)
    expect(auth.calls).toHaveLength(1)
  })

  it('AC-003.1: fetch를 주지 않으면 전역 fetch를 쓴다', async () => {
    const auth = signInOk(fakeJwt())
    vi.stubGlobal('fetch', auth.fetch)
    const result = await passwordSession({ env: ENV, role: 'admin' })
    expect(result.userId).toBe(USER_ID)
    expect(auth.calls).toHaveLength(1)
  })

  it('AC-003.1: session.ts는 앱 코드(src/)를 import하지 않고 @supabase/ssr createServerClient를 쓴다', () => {
    const source = readFileSync(new URL('./session.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(imports.filter((path) => path.includes('src/') || path.startsWith('@/'))).toEqual([])
    expect(imports).toContain('@supabase/ssr')
    expect(source).toMatch(/createServerClient\(/)
  })
})

describe('authCookiePattern (AC-003.1)', () => {
  it('AC-003.1: sb-<ref>-auth-token과 .0·.1… 조각만 맞는다', () => {
    const pattern = authCookiePattern(SUPABASE_URL)
    for (const name of [COOKIE, `${COOKIE}.0`, `${COOKIE}.1`, `${COOKIE}.12`]) expect(pattern.test(name)).toBe(true)
    for (const name of [
      'sb-otherprojectref-auth-token',
      `${COOKIE}-code-verifier`,
      `x${COOKIE}`,
      `${COOKIE}.a`,
      `${COOKIE}.`,
      `${COOKIE}.0.1`,
    ]) {
      expect(pattern.test(name)).toBe(false)
    }
  })

  it('AC-003.1: 끝에 /·경로가 붙은 주소도 같은 이름', () => {
    expect(authCookiePattern(`${SUPABASE_URL}/`).test(COOKIE)).toBe(true)
    expect(authCookiePattern(`${SUPABASE_URL}/rest/v1`).test(`${COOKIE}.0`)).toBe(true)
  })
})

describe('toBrowserCookies (AC-003.2)', () => {
  const NOW = 1_800_000_000

  it('AC-003.2: 빈 값(지우기 표시)은 버리고 domain·path·httpOnly·secure·sameSite·expires로 옮긴다', () => {
    const cookies: CookieToSet[] = [
      { name: `${COOKIE}.2`, value: '', options: { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 0 } },
      { name: `${COOKIE}.0`, value: 'base64-aaa', options: { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 100 } },
      { name: 'b', value: 'v-b', options: { path: '/sub', sameSite: 'strict', httpOnly: true, secure: true } },
      { name: 'c', value: 'v-c', options: { sameSite: 'none', secure: true } },
      { name: 'd', value: 'v-d', options: { sameSite: true } },
      { name: 'e', value: 'v-e', options: { sameSite: false } },
      { name: 'f', value: 'v-f', options: {} },
    ]
    expect(toBrowserCookies(cookies, '127.0.0.1', NOW)).toEqual([
      {
        name: `${COOKIE}.0`,
        value: 'base64-aaa',
        domain: '127.0.0.1',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
        expires: NOW + 100,
      },
      { name: 'b', value: 'v-b', domain: '127.0.0.1', path: '/sub', httpOnly: true, secure: true, sameSite: 'Strict', expires: -1 },
      { name: 'c', value: 'v-c', domain: '127.0.0.1', path: '/', httpOnly: false, secure: true, sameSite: 'None', expires: -1 },
      { name: 'd', value: 'v-d', domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Strict', expires: -1 },
      { name: 'e', value: 'v-e', domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax', expires: -1 },
      { name: 'f', value: 'v-f', domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax', expires: -1 },
    ])
  })

  it('AC-003.2: 라이브러리가 준 세션 쿠키는 http://127.0.0.1에서 앱이 쓸 모양(path /·Lax·httpOnly 아님·secure 아님·400일)', async () => {
    const result = await passwordSession({ env: ENV, role: 'admin', fetch: signInOk(fakeJwt(LONG)).fetch })
    const browser = toBrowserCookies(result.cookies, '127.0.0.1', NOW)
    expect(browser.map((c) => c.name)).toEqual([`${COOKIE}.0`, `${COOKIE}.1`])
    for (const [i, c] of browser.entries()) {
      expect(c).toEqual({
        name: result.cookies[i].name,
        value: result.cookies[i].value,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
        expires: NOW + 400 * 24 * 60 * 60,
      })
    }
  })
})

// 움직임 쿠키(auth-hardening ADR-023): 로그인했는데 app-active가 없으면 middleware가 로그인을 끊는다 → 시험 로그인도 넣는다.
// session.ts는 앱 코드를 부르지 않고 값을 직접 둔다. 시험 파일은 src/를 불러도 되니 여기서 앱 값과 같은지 본다
describe('activeBrowserCookie (AC-406.1)', () => {
  const NOW = 1_800_000_000

  it('AC-406.1: app-active=1을 http://127.0.0.1에서 앱이 쓸 모양(path /·Lax·httpOnly 아님·secure 아님·31분)으로 돌려준다', () => {
    expect(activeBrowserCookie('127.0.0.1', NOW)).toEqual({
      name: 'app-active',
      value: '1',
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
      expires: NOW + 1860,
    })
  })

  it('AC-406.1: domain은 받은 호스트, expires는 받은 시각 + 1860초(부를 때마다 새로 센다)', () => {
    expect(activeBrowserCookie('localhost', 1000)).toMatchObject({ domain: 'localhost', expires: 2860 })
    expect(activeBrowserCookie('127.0.0.1', NOW + 60)).toMatchObject({ domain: '127.0.0.1', expires: NOW + 60 + 1860 })
  })

  it('AC-406.1: 이름·초는 앱(src/lib/auth/activity)의 ACTIVE_COOKIE·ACTIVE_MAX_AGE_SEC와 같고, 옵션은 http에서 앱이 쓰는 activeCookieOptions(false)와 같다', () => {
    const cookie = activeBrowserCookie('127.0.0.1', NOW)
    expect(cookie.name).toBe(ACTIVE_COOKIE)
    expect(cookie.expires - NOW).toBe(ACTIVE_MAX_AGE_SEC)
    const app = activeCookieOptions(false)
    expect({ path: cookie.path, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite.toLowerCase() }).toEqual({
      path: app.path,
      httpOnly: app.httpOnly,
      secure: app.secure,
      sameSite: app.sameSite,
    })
  })

  it('AC-406.1: session.ts는 그 값을 앱 코드에서 불러오지 않고 직접 둔다(src/ import 없음)', () => {
    const source = readFileSync(new URL('./session.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(imports.filter((path) => path.includes('src/') || path.startsWith('@/') || path.includes('activity'))).toEqual([])
    expect(source).toContain("'app-active'")
    expect(source).toMatch(/\b1860\b/)
  })
})

describe('signInCookies (AC-406.2)', () => {
  const NOW = 1_800_000_000

  it('AC-406.2: 라이브러리가 준 세션 쿠키(.0·.1 조각)를 toBrowserCookies로 옮긴 것 전부(순서 그대로) + 움직임 쿠키 하나', async () => {
    const result = await passwordSession({ env: ENV, role: 'admin', fetch: signInOk(fakeJwt(LONG)).fetch })
    const cookies = signInCookies(result.cookies, '127.0.0.1', NOW)
    expect(cookies).toEqual([...toBrowserCookies(result.cookies, '127.0.0.1', NOW), activeBrowserCookie('127.0.0.1', NOW)])
    expect(cookies.map((c) => c.name)).toEqual([`${COOKIE}.0`, `${COOKIE}.1`, 'app-active'])
  })

  it('AC-406.2: 지우기 표시(빈 값)는 toBrowserCookies처럼 버리고, 움직임 쿠키는 늘 하나(받은 쿠키가 없어도)', () => {
    const cookies: CookieToSet[] = [
      { name: `${COOKIE}.1`, value: '', options: { path: '/', maxAge: 0 } },
      { name: COOKIE, value: 'base64-aaa', options: { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 100 } },
    ]
    expect(signInCookies(cookies, 'localhost', NOW)).toEqual([
      ...toBrowserCookies(cookies, 'localhost', NOW),
      activeBrowserCookie('localhost', NOW),
    ])
    expect(signInCookies(cookies, 'localhost', NOW).filter((c) => c.name === 'app-active')).toHaveLength(1)
    expect(signInCookies([], 'localhost', NOW)).toEqual([activeBrowserCookie('localhost', NOW)])
  })

  it('AC-406.2: support.ts의 signIn은 signInCookies의 결과를 넣는다(toBrowserCookies를 직접 부르지 않는다)', () => {
    const source = readFileSync(new URL('../support.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/addCookies\(\s*signInCookies\(/)
    expect(source).not.toMatch(/toBrowserCookies\(/)
  })
})

describe('passwordSession 실패 (AC-003.3)', () => {
  const SECRETS = [ENV.accounts.admin.email, ENV.accounts.admin.password, REFRESH_TOKEN, fakeJwt(), USER_ID]

  async function failure(fetchFn: typeof fetch, role: Role = 'admin'): Promise<Error> {
    const error = await passwordSession({ env: ENV, role, fetch: fetchFn }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(Error)
    return error as Error
  }

  function expectNoSecret(error: Error) {
    // Vitest·Playwright가 보이는 모든 글자(메시지·stack·cause·덧붙은 칸)
    const shown = `${error.message}\n${error.stack ?? ''}\n${inspect(error, { depth: 10 })}`
    expect(shown.toLowerCase()).not.toContain(LEAK)
    for (const secret of SECRETS) expect(shown).not.toContain(secret)
    expect(error.cause).toBeUndefined()
  }

  it('AC-003.3: 비밀번호 틀림(400) — 역할 이름·HTTP 상태·오류 코드만, 응답에 든 이메일·비밀번호·토큰은 없다', async () => {
    const auth = fakeFetch(() =>
      json(400, {
        code: 400,
        error_code: 'invalid_credentials',
        msg: `Invalid login credentials for ${ENV.accounts.admin.email} / ${ENV.accounts.admin.password} ${REFRESH_TOKEN}`,
      }),
    )
    const error = await failure(auth.fetch)
    expect(error.message).toContain('admin')
    expect(error.message).toContain('관리자')
    expect(error.message).toContain('HTTP 400')
    expect(error.message).toContain('invalid_credentials')
    expectNoSecret(error)
  })

  it('AC-003.3: 이메일 확인 안 됨 — 그 역할 이름과 코드', async () => {
    const auth = fakeFetch(() => json(400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }))
    const error = await failure(auth.fetch, 'pending')
    expect(error.message).toContain('pending')
    expect(error.message).toContain('email_not_confirmed')
    expectNoSecret(error)
  })

  it('AC-003.3: 오류 코드 칸에 코드가 아닌 글자(이메일 등)가 오면 담지 않는다', async () => {
    const auth = fakeFetch(() => json(400, { code: 400, error_code: `bad ${ENV.accounts.admin.email}`, msg: 'x' }))
    const error = await failure(auth.fetch)
    expect(error.message).toContain('HTTP 400')
    expectNoSecret(error)
  })

  it('AC-003.3: 서버 오류(500) — 본문에 토큰이 있어도 상태만', async () => {
    const auth = fakeFetch(() => json(500, { msg: `boom ${fakeJwt()} ${ENV.accounts.admin.password}` }))
    const error = await failure(auth.fetch)
    expect(error.message).toContain('HTTP 500')
    expectNoSecret(error)
  })

  it('AC-003.3: 응답 없음(fetch가 던짐) — 오류 내용(주소·이메일)을 담지 않는다', async () => {
    const auth = fakeFetch(() => {
      throw new TypeError(`fetch failed ${SUPABASE_URL} ${ENV.accounts.admin.email} ${ENV.accounts.admin.password}`)
    })
    const error = await failure(auth.fetch)
    expect(error.message).toContain('admin')
    expect(error.message).not.toContain(SUPABASE_URL)
    expectNoSecret(error)
  })

  it('AC-003.3: 200인데 세션 모양이 아님(refresh_token 없음) — 토큰을 담지 않는다', async () => {
    const body: Record<string, unknown> = tokenBody(fakeJwt(), ENV.accounts.admin.email)
    delete body.refresh_token
    const error = await failure(fakeFetch(() => json(200, body)).fetch)
    expect(error.message).toContain('admin')
    expectNoSecret(error)
  })
})

describe('accountProblem (AC-003.4)', () => {
  it('AC-003.4: 기대 상태 — 관리자 = approved + admins, 승인됨 = approved, 승인 대기 = pending, 신청 전 = 병원 줄 없음', () => {
    expect(EXPECTED_STATE).toEqual({
      admin: { hospitalStatus: 'approved', isAdmin: true },
      approved: { hospitalStatus: 'approved', isAdmin: false },
      pending: { hospitalStatus: 'pending', isAdmin: false },
      new: { hospitalStatus: null, isAdmin: false },
    })
  })

  it('AC-003.4: 기대와 같으면 null, 다르면 역할 이름과 e2e-accounts.sql 다시 실행 안내(모든 역할 × 모든 상태)', () => {
    const statuses: AccountState['hospitalStatus'][] = ['pending', 'approved', 'rejected', null]
    for (const role of ROLES) {
      for (const hospitalStatus of statuses) {
        for (const isAdmin of [true, false]) {
          const state: AccountState = { hospitalStatus, isAdmin }
          const problem = accountProblem(role, state)
          const expected = EXPECTED_STATE[role]
          if (hospitalStatus === expected.hospitalStatus && isAdmin === expected.isAdmin) {
            expect(problem).toBeNull()
          } else {
            expect(problem).toContain(role)
            expect(problem).toContain('`supabase/e2e-accounts.sql`을 다시 실행')
          }
        }
      }
    }
  })

  it('AC-003.4: 역할 이름은 한국어 이름도 같이 보인다', () => {
    expect(accountProblem('admin', { hospitalStatus: 'approved', isAdmin: false })).toContain('관리자')
    expect(accountProblem('approved', { hospitalStatus: 'rejected', isAdmin: false })).toContain('승인됨')
    expect(accountProblem('pending', { hospitalStatus: 'approved', isAdmin: false })).toContain('승인 대기')
    expect(accountProblem('new', { hospitalStatus: 'pending', isAdmin: false })).toContain('신청 전')
  })
})

describe('앱 코드에 시험용 로그인 길 없음 (AC-003.5)', () => {
  const SRC = fileURLToPath(new URL('../../src', import.meta.url)) // .pathname은 윈도우에서 /C:/…가 된다

  function filesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? filesUnder(path) : [path]
    })
  }

  const files = filesUnder(SRC)

  it('AC-003.5: src/ 파일을 실제로 읽는다', () => {
    expect(files.length).toBeGreaterThan(50)
    expect(files.some((f) => f.endsWith('LoginCard.tsx'))).toBe(true)
  })

  it('AC-003.5: src/ 어디에도 signInWithPassword·E2E_가 없다', () => {
    const found = files.filter((f) => {
      const text = readFileSync(f, 'utf8')
      return text.includes('signInWithPassword') || text.includes('E2E_')
    })
    expect(found.map((f) => relative(SRC, f))).toEqual([])
  })

  it('AC-003.5: 로그인은 구글 OAuth뿐 — 다른 로그인·가입 호출과 시험용 로그인 경로가 없다', () => {
    const OTHER_SIGN_IN = /\b(signInWith(?!OAuth\b)\w+|signInAnonymously|signUp|verifyOtp)\b/
    const found = files.filter((f) => OTHER_SIGN_IN.test(readFileSync(f, 'utf8')))
    expect(found.map((f) => relative(SRC, f))).toEqual([])
    const testRoutes = files.map((f) => relative(SRC, f)).filter((p) => /(^|\/)(e2e|test-?login|dev-?login)/i.test(p))
    expect(testRoutes).toEqual([])
  })
})
