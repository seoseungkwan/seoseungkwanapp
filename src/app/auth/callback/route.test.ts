import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

// 실제 Supabase에 붙지 않는다. 코드 → 세션 바꾸기가 성공·실패했을 때 어디로 보내는지만 본다
const { exchangeCodeForSession, supabaseServer } = vi.hoisted(() => {
  const exchangeCodeForSession = vi.fn()
  return { exchangeCodeForSession, supabaseServer: vi.fn(async () => ({ auth: { exchangeCodeForSession } })) }
})
vi.mock('@/lib/supabase/server', () => ({ supabaseServer }))

const ORIGIN = 'http://localhost:3000'
const SECRET = 'invalid flow state, no valid flow state found: pkce-verifier-1234'

const call = (query: string) => GET(new NextRequest(`${ORIGIN}/auth/callback${query}`))

let logs: ReturnType<typeof vi.spyOn>[] = []

beforeEach(() => {
  exchangeCodeForSession.mockReset()
  exchangeCodeForSession.mockResolvedValue({ data: { session: {}, user: { id: 'user-1' } }, error: null })
  supabaseServer.mockClear()
  logs = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((level) => vi.spyOn(console, level))
})

afterEach(() => {
  // 먼저 기록을 꺼내고 spy를 푼다 → 검사가 실패해도 spy가 남지 않는다
  const calls = logs.map((log) => log.mock.calls.length)
  vi.restoreAllMocks()
  expect(calls).toEqual(logs.map(() => 0)) // 오류 내용을 로그에 남기지 않는다
})

describe('GET /auth/callback', () => {
  it('AC-003.3 code로 세션을 만들면 → 같은 origin의 /dashboard', async () => {
    const response = await call('?code=abc')
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
  })

  it.each([
    ['?code=abc&next=https://evil.example', `${ORIGIN}/dashboard`],
    ['?code=abc&next=//evil.example/x&redirect=https://evil.example&returnTo=/settings', `${ORIGIN}/dashboard`],
    ['?code=abc&next=/admin', `${ORIGIN}/dashboard`],
    ['?next=https://evil.example', `${ORIGIN}/login?error=1`],
  ])('AC-003.3 돌아갈 주소 쿼리(%s)는 무시하고 같은 origin의 고정 경로로만', async (query, location) => {
    const response = await call(query)
    expect(response.headers.get('location')).toBe(location)
  })

  it('AC-003.4 세션 만들기가 오류를 돌려주면 → /login?error=1', async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: null, user: null }, error: new Error(SECRET) })
    const response = await call('?code=abc')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login?error=1`)
  })

  it('AC-003.4 세션 만들기가 던지면(인터넷 끊김 등) → /login?error=1', async () => {
    exchangeCodeForSession.mockRejectedValue(new Error(SECRET))
    const response = await call('?code=abc')
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login?error=1`)
  })

  it('AC-003.4 Supabase 클라이언트를 못 만들면(열쇠 없음) → /login?error=1', async () => {
    supabaseServer.mockRejectedValueOnce(new Error('NEXT_PUBLIC_SUPABASE_URL이 비었어요'))
    const response = await call('?code=abc')
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login?error=1`)
  })

  it.each(['', '?code=', '?error=access_denied&error_description=' + encodeURIComponent(SECRET)])(
    'AC-003.4 code가 없으면(%s) 세션을 만들지 않고 → /login?error=1',
    async (query) => {
      const response = await call(query)
      expect(exchangeCodeForSession).not.toHaveBeenCalled()
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(`${ORIGIN}/login?error=1`)
    },
  )

  it.each([
    ['오류를 돌려줌', () => exchangeCodeForSession.mockResolvedValue({ data: { session: null, user: null }, error: new Error(SECRET) })],
    ['던짐', () => exchangeCodeForSession.mockRejectedValue(new Error(SECRET))],
  ])('AC-003.4 실패(%s)해도 오류 내용을 응답 본문·헤더에 싣지 않는다', async (_label, arrange) => {
    arrange()
    const response = await call('?code=abc')
    expect(await response.text()).not.toContain('flow state')
    expect([...response.headers.values()].join('\n')).not.toContain('flow state')
  })

  it('AC-003.4 공급자가 보낸 오류 설명도 redirect에 옮기지 않는다', async () => {
    const response = await call('?error=access_denied&error_description=' + encodeURIComponent(SECRET))
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login?error=1`)
    expect([...response.headers.values()].join('\n')).not.toContain('flow')
    expect(await response.text()).not.toContain('flow')
  })
})

describe('GET /auth/callback 움직임 쿠키·캐시 금지·Secure (ADR-023)', () => {
  // 실패하는 길 — code 없음·교환 오류·던짐·클라이언트를 못 만듦
  const failures: [string, string, () => void][] = [
    ['code 없음', '', () => {}],
    ['교환 오류', '?code=abc', () => exchangeCodeForSession.mockResolvedValue({ data: { session: null, user: null }, error: new Error(SECRET) })],
    ['교환이 던짐', '?code=abc', () => exchangeCodeForSession.mockRejectedValue(new Error(SECRET))],
    ['클라이언트를 못 만듦', '?code=abc', () => supabaseServer.mockRejectedValueOnce(new Error('NEXT_PUBLIC_SUPABASE_URL이 비었어요'))],
  ]

  it('AC-401.7: 코드 교환이 성공하면 /dashboard 응답에 app-active=1을 31분으로 쓴다', async () => {
    const response = await call('?code=abc')
    expect(response.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
    expect(response.cookies.get('app-active')).toMatchObject({
      value: '1',
      maxAge: 1860,
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    })
  })

  it.each(failures)('AC-401.7: 실패(%s)하면 app-active를 쓰지 않는다', async (_label, query, arrange) => {
    arrange()
    const response = await call(query)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login?error=1`)
    expect(response.cookies.get('app-active')).toBeUndefined()
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it('AC-405.3: 성공(/dashboard) 응답에 Cache-Control: private, no-store', async () => {
    const response = await call('?code=abc')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it.each(failures)('AC-405.3: 실패(%s, /login?error=1) 응답에도 Cache-Control: private, no-store', async (_label, query, arrange) => {
    arrange()
    const response = await call(query)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login?error=1`)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('AC-405.1: https 콜백이면 supabaseServer({ secure: true })로 만들고 app-active도 Secure', async () => {
    const response = await GET(new NextRequest('https://app.example.com/auth/callback?code=abc'))
    expect(supabaseServer).toHaveBeenCalledWith({ secure: true })
    expect(response.headers.get('location')).toBe('https://app.example.com/dashboard')
    expect(response.cookies.get('app-active')?.secure).toBe(true)
  })

  it.each(['http://localhost:3000', 'http://127.0.0.1:3100'])(
    'AC-405.1: http 콜백(%s)이면 supabaseServer({ secure: false })이고 app-active에 Secure가 없다',
    async (origin) => {
      const response = await GET(new NextRequest(`${origin}/auth/callback?code=abc`))
      expect(supabaseServer).toHaveBeenCalledWith({ secure: false })
      expect(response.cookies.get('app-active')?.secure).toBe(false)
    },
  )
})
