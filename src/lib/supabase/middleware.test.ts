import type { CookieMethodsServer } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateSession } from './middleware'

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient }))

const COOKIE = 'sb-abcd-auth-token'
const ACTIVE = 'app-active=1'
const getSession = vi.fn()
const signOut = vi.fn()

// getUser()가 불리면 (세션을 새로 고쳤다면) setAll로 새 쿠키를 넘기는 가짜 Supabase.
// signOut은 시험마다 정한다(기본: 성공, 쿠키를 건드리지 않음)
function fakeSupabase(user: { id: string } | null, refreshed: boolean) {
  createServerClient.mockImplementation((_url: string, _key: string, options: { cookies: CookieMethodsServer }) => ({
    auth: {
      getSession,
      signOut: (...args: unknown[]) => signOut(options, ...args),
      getUser: async () => {
        if (refreshed) {
          await options.cookies.setAll!([{ name: COOKIE, value: 'new', options: { path: '/', sameSite: 'lax' } }], {
            'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
          })
        }
        return user ? { data: { user }, error: null } : { data: { user: null }, error: new Error('no session') }
      },
    },
  }))
}

function request() {
  return new NextRequest('http://localhost:3000/dashboard', { headers: { cookie: `${COOKIE}=old` } })
}

// 로그인해서 쓰고 있는 사람의 요청(움직임 쿠키가 살아 있음, ADR-023)
function activeRequest(url = 'http://localhost:3000/dashboard', cookie = `${COOKIE}=old; ${ACTIVE}`) {
  return new NextRequest(url, { headers: { cookie } })
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  createServerClient.mockReset()
  getSession.mockReset()
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('updateSession()', () => {
  it('AC-001.3: 공개 열쇠로 만들고, 요청 쿠키를 Supabase에 넘긴다', async () => {
    fakeSupabase({ id: 'user-1' }, false)
    await updateSession(request())
    const [url, key, options] = createServerClient.mock.calls[0]
    expect([url, key]).toEqual(['https://abcd.supabase.co', 'anon-key'])
    expect(await options.cookies.getAll()).toEqual([{ name: COOKIE, value: 'old' }])
  })

  it('AC-001.3: getUser()로 확인한 사용자 id를 돌려준다(getSession은 믿지 않는다)', async () => {
    fakeSupabase({ id: 'user-1' }, false)
    const { userId } = await updateSession(activeRequest())
    expect(userId).toBe('user-1')
    expect(getSession).not.toHaveBeenCalled()
  })

  it('AC-001.3: 로그인 안 했거나 확인에 실패하면 userId는 null', async () => {
    fakeSupabase(null, false)
    const { userId, response } = await updateSession(request())
    expect(userId).toBeNull()
    expect(response.cookies.getAll()).toEqual([])
  })

  it('AC-001.3: 새로 고친 세션 쿠키를 요청(뒤 서버 코드용)과 응답(브라우저용) 둘 다에 옮긴다', async () => {
    fakeSupabase({ id: 'user-1' }, true)
    const req = activeRequest()
    const { response } = await updateSession(req)
    expect(req.cookies.get(COOKIE)?.value).toBe('new')
    expect(response.cookies.get(COOKIE)).toMatchObject({ value: 'new', path: '/', sameSite: 'lax' })
  })

  it('AC-001.3: 세션 쿠키가 든 응답에 캐시 금지 헤더를 붙인다(남의 세션이 CDN에 남지 않게)', async () => {
    fakeSupabase({ id: 'user-1' }, true)
    const { response } = await updateSession(activeRequest())
    const cacheControl = response.headers.get('Cache-Control')
    expect(cacheControl).toContain('private')
    expect(cacheControl).toContain('no-store')
  })
})

describe('updateSession() 움직임 쿠키 (ADR-023)', () => {
  const CHUNKED = `${COOKIE}.0=a; ${COOKIE}.1=b; ${COOKIE}-code-verifier=v; theme=dark`

  it('AC-401.1: 움직임 쿠키가 있으면 사용자 id를 돌려주고 app-active를 31분으로 다시 쓴다', async () => {
    fakeSupabase({ id: 'user-1' }, false)
    const { userId, response } = await updateSession(activeRequest())
    expect(userId).toBe('user-1')
    expect(signOut).not.toHaveBeenCalled()
    expect(response.cookies.get('app-active')).toMatchObject({
      value: '1',
      maxAge: 1860,
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    })
  })

  it('AC-401.1: 세션을 새로 고쳐 응답을 바꿔 끼워도 app-active는 마지막 응답에 실린다', async () => {
    fakeSupabase({ id: 'user-1' }, true)
    const { response } = await updateSession(activeRequest())
    expect(response.cookies.get(COOKIE)?.value).toBe('new')
    expect(response.cookies.get('app-active')?.value).toBe('1')
  })

  it('AC-401.2: 로그인했는데 움직임 쿠키가 없으면 이 브라우저만 signOut하고 세션 쿠키를 지운 뒤 null', async () => {
    fakeSupabase({ id: 'user-1' }, false)
    const { userId, response } = await updateSession(activeRequest(undefined, CHUNKED))
    expect(userId).toBeNull()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut.mock.calls[0][1]).toEqual({ scope: 'local' })
    for (const name of [`${COOKIE}.0`, `${COOKIE}.1`]) {
      expect(response.cookies.get(name)).toMatchObject({ value: '', maxAge: 0, path: '/' })
    }
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('AC-401.2: 직접 지우는 것은 세션 쿠키뿐 — 코드 검증값·다른 쿠키는 건드리지 않고 app-active도 쓰지 않는다', async () => {
    fakeSupabase({ id: 'user-1' }, false)
    const { response } = await updateSession(activeRequest(undefined, CHUNKED))
    expect(response.cookies.get(`${COOKIE}-code-verifier`)).toBeUndefined()
    expect(response.cookies.get('theme')).toBeUndefined()
    expect(response.cookies.get('app-active')).toBeUndefined()
  })

  it('AC-401.2: signOut이 setAll로 응답을 바꿔 끼워도 지우기·캐시 금지는 마지막 응답에 실린다', async () => {
    fakeSupabase({ id: 'user-1' }, false)
    signOut.mockImplementation(async (options: { cookies: CookieMethodsServer }) => {
      await options.cookies.setAll!([{ name: `${COOKIE}.0`, value: '', options: { path: '/', maxAge: 0 } }], {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
      })
      return { error: null }
    })
    const { userId, response } = await updateSession(activeRequest(undefined, CHUNKED))
    expect(userId).toBeNull()
    expect(response.cookies.get(`${COOKIE}.0`)).toMatchObject({ value: '', maxAge: 0 })
    expect(response.cookies.get(`${COOKIE}.1`)).toMatchObject({ value: '', maxAge: 0 })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it.each([
    ['오류를 돌려줌', () => signOut.mockResolvedValue({ error: new Error('logout failed: secret-detail') })],
    ['던짐', () => signOut.mockRejectedValue(new Error('network down: secret-detail'))],
  ])('AC-401.3: signOut이 %s — 그래도 세션 쿠키를 지우고 null, 로그를 남기지 않는다', async (_label, arrange) => {
    fakeSupabase({ id: 'user-1' }, false)
    arrange()
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level))
    try {
      const { userId, response } = await updateSession(activeRequest(undefined, CHUNKED))
      expect(userId).toBeNull()
      expect(response.cookies.get(`${COOKIE}.0`)).toMatchObject({ value: '', maxAge: 0 })
      expect(JSON.stringify([...response.headers.entries()])).not.toContain('secret-detail')
      expect(logs.map((log) => log.mock.calls.length)).toEqual(logs.map(() => 0))
    } finally {
      for (const log of logs) log.mockRestore()
    }
  })

  it('AC-401.4: 로그인하지 않은 요청은 app-active를 쓰지도 지우지도 않고 signOut을 부르지 않는다', async () => {
    fakeSupabase(null, false)
    const { userId, response } = await updateSession(activeRequest(undefined, `${COOKIE}=old; ${ACTIVE}`))
    expect(userId).toBeNull()
    expect(signOut).not.toHaveBeenCalled()
    expect(response.cookies.get('app-active')).toBeUndefined()
    expect(response.cookies.get(COOKIE)).toBeUndefined()
  })

  it('AC-401.5: /auth/callback은 움직임 쿠키가 없어도 로그인을 끊지 않는다', async () => {
    fakeSupabase({ id: 'user-1' }, false)
    const { userId, response } = await updateSession(
      activeRequest('http://localhost:3000/auth/callback?code=abc', `${COOKIE}=old`),
    )
    expect(userId).toBe('user-1')
    expect(signOut).not.toHaveBeenCalled()
    expect(response.cookies.get(COOKIE)).toBeUndefined()
  })

  it('AC-405.1: https 요청이면 Supabase 쿠키 옵션과 app-active에 Secure', async () => {
    fakeSupabase({ id: 'user-1' }, false)
    const { response } = await updateSession(activeRequest('https://app.example.com/dashboard'))
    expect(createServerClient.mock.calls[0][2].cookieOptions).toEqual({ secure: true })
    expect(response.cookies.get('app-active')?.secure).toBe(true)
  })

  it('AC-405.1: http 요청(개발 localhost·E2E 127.0.0.1)이면 Secure를 붙이지 않는다', async () => {
    fakeSupabase({ id: 'user-1' }, false)
    const { response } = await updateSession(activeRequest('http://127.0.0.1:3100/dashboard'))
    expect(createServerClient.mock.calls[0][2].cookieOptions).toEqual({ secure: false })
    expect(response.cookies.get('app-active')?.secure).toBe(false)
  })
})
