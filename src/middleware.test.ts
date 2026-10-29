import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { config, middleware } from './middleware'

// 세션 새로 고침(updateSession)은 TASK-2가 시험했다. 여기서는 그 결과로 어디로 보내는지만 본다
const { updateSession } = vi.hoisted(() => ({ updateSession: vi.fn() }))
vi.mock('@/lib/supabase/middleware', () => ({ updateSession }))

const ORIGIN = 'http://localhost:3000'
const COOKIE = 'sb-abcd-auth-token'
const NO_STORE = 'private, no-cache, no-store, must-revalidate, max-age=0'

// updateSession이 세션을 새로 고쳤다고 치고(새 쿠키 + 캐시 금지 헤더) 그 응답을 돌려준다
function session(userId: string | null, refreshed = true) {
  updateSession.mockImplementation(async (request: NextRequest) => {
    const response = NextResponse.next({ request })
    if (refreshed) {
      response.cookies.set(COOKIE, 'new', { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 })
      response.headers.set('Cache-Control', NO_STORE)
      response.headers.set('Expires', '0')
      response.headers.set('Pragma', 'no-cache')
    }
    return { response, userId }
  })
}

const request = (path: string) => new NextRequest(`${ORIGIN}${path}`, { headers: { cookie: `${COOKIE}=old` } })

beforeEach(() => {
  updateSession.mockReset()
})

describe('middleware', () => {
  it('AC-002.1 요청을 updateSession에 넘겨 세션을 새로 고친다', async () => {
    session('user-1')
    const req = request('/dashboard')
    await middleware(req)
    expect(updateSession).toHaveBeenCalledWith(req)
  })

  it.each(['/dashboard', '/admin', '/admin/x', '/signup', '/pending', '/settings', '/dashboard?tab=1'])(
    'AC-002.1 로그인 안 함 + %s → /login으로 redirect',
    async (path) => {
      session(null)
      const response = await middleware(request(path))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(`${ORIGIN}/login`)
    },
  )

  it.each(['/login', '/auth/callback?code=abc', '/auth/callback'])('AC-002.1 로그인 안 함 + %s는 그대로', async (path) => {
    session(null)
    const response = await middleware(request(path))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('AC-002.1 로그인 안 함 + /login?error=1은 그대로(경로만 보고 쿼리는 보지 않는다 → 돌림 고리·오류 표시 사라짐 방지)', async () => {
    session(null)
    const response = await middleware(request('/login?error=1'))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it.each([null, 'user-1'])('AC-002.6 랜딩 /는 로그인 여부와 상관없이 그대로(userId %s)', async (userId) => {
    session(userId)
    const response = await middleware(request('/'))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it.each(['/login', '/login?error=1'])('AC-002.4 로그인 함(병원 상태 unknown) + %s → /dashboard로 redirect', async (path) => {
    session('user-1')
    const response = await middleware(request(path))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
  })

  it.each(['/dashboard', '/admin', '/signup', '/pending', '/auth/callback?code=abc'])(
    'AC-002.4 로그인 함 + %s는 그대로(병원 상태는 페이지 guard가 본다)',
    async (path) => {
      session('user-1')
      const response = await middleware(request(path))
      expect(response.headers.get('location')).toBeNull()
      expect(response.headers.get('x-middleware-next')).toBe('1')
    },
  )

  it('AC-002.1 그대로 갈 때는 updateSession의 응답(새 세션 쿠키 포함)을 돌려준다', async () => {
    session('user-1')
    const response = await middleware(request('/dashboard'))
    expect(response.cookies.get(COOKIE)?.value).toBe('new')
    expect(response.headers.get('Cache-Control')).toBe(NO_STORE)
  })

  it.each([
    [null, '/dashboard'],
    ['user-1', '/login'],
  ])('AC-002.1 redirect 응답에도 세션 쿠키와 캐시 금지 헤더가 실린다(userId %s, %s)', async (userId, path) => {
    session(userId)
    const response = await middleware(request(path))
    expect(response.headers.get('location')).not.toBeNull()
    expect(response.cookies.get(COOKIE)).toMatchObject({ value: 'new', path: '/', sameSite: 'lax', maxAge: 400 })
    expect(response.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(response.headers.get('Expires')).toBe('0')
    expect(response.headers.get('Pragma')).toBe('no-cache')
    // 그대로 가라는 Next 내부 표시는 옮기지 않는다
    expect(response.headers.get('x-middleware-next')).toBeNull()
  })

  it('AC-002.1 세션을 새로 고치지 않았으면 redirect에 쿠키·캐시 헤더를 지어내지 않는다', async () => {
    session(null, false)
    const response = await middleware(request('/dashboard'))
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login`)
    expect(response.cookies.getAll()).toEqual([])
    expect(response.headers.get('Cache-Control')).toBeNull()
  })

  it('AC-002.1 redirect는 같은 origin의 고정 경로뿐(돌아갈 주소 쿼리를 붙이지도 따르지도 않는다)', async () => {
    session(null)
    const response = await middleware(request('/dashboard?next=https://evil.example&redirect=//evil.example'))
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login`)
    session('user-1')
    const signedIn = await middleware(request('/login?next=https://evil.example&returnTo=https://evil.example'))
    expect(signedIn.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
  })
})

describe('config.matcher', () => {
  // Next가 실제로 쓰는 판정(앞뒤에 _next/data·.json 등을 붙이고, 대소문자를 가린다)으로 본다
  const matches = (path: string) => unstable_doesMiddlewareMatch({ config, url: `${ORIGIN}${path}` })

  it.each([
    '/',
    '/login',
    '/auth/callback',
    '/signup',
    '/pending',
    '/dashboard',
    '/admin',
    '/admin/x',
    '/settings',
    '/landing',
    '/landingx/a',
    '/fake-sample',
    '/api/ai/analyze',
    // Next는 _next/data 요청을 matcher 앞에 붙여 늘 거치게 한다
    '/_next/data/build/x.json',
    // 확장자는 대소문자를 가린다(소문자만 거치지 않는다)
    '/A.PNG',
  ])('AC-002.7 %s는 middleware를 거친다', (path) => {
    expect(matches(path)).toBe(true)
  })

  it.each([
    '/_next/static/chunks/main.js',
    '/_next/static/media/analyze.worker.0a1b2c.js',
    '/_next/image',
    '/favicon.ico',
    '/landing/feature-stats.jpg',
    '/landing/hero.json',
    '/fake-sample/bit-sample.csv',
    '/logo.svg',
    '/images/a.png',
    '/a.jpg',
    '/a.jpeg',
    '/a.gif',
    '/a.webp',
    '/a.avif',
    '/icon.ico',
    '/landing/intro.mp4',
    '/video/intro.mp4',
    '/video/intro.webm',
  ])('AC-002.7 %s는 middleware를 거치지 않는다', (path) => {
    expect(matches(path)).toBe(false)
  })
})
