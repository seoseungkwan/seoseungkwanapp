import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { CookieMethodsServer } from '@supabase/ssr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseServer } from './server'

// next/headers의 cookies()가 돌려주는 쿠키 저장소 흉내 (server-only는 vitest.config.ts가 빈 모듈로 바꾼다)
const { createServerClient, cookies, store } = vi.hoisted(() => {
  const store = { getAll: vi.fn(), set: vi.fn() }
  return { createServerClient: vi.fn(() => ({ auth: {} })), cookies: vi.fn(async () => store), store }
})
vi.mock('next/headers', () => ({ cookies }))
vi.mock('@supabase/ssr', () => ({ createServerClient }))

const COOKIE = 'sb-abcd-auth-token'
const NEW_COOKIE = [{ name: COOKIE, value: 'new', options: { path: '/', sameSite: 'lax' as const } }]
const NO_STORE = { 'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0' }

// supabaseServer()가 createServerClient에 넘긴 쿠키 다루기
async function cookieMethods(): Promise<CookieMethodsServer> {
  await supabaseServer()
  const calls = createServerClient.mock.calls as unknown as [string, string, { cookies: CookieMethodsServer }][]
  return calls[0][2].cookies
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  createServerClient.mockClear()
  cookies.mockClear()
  store.getAll.mockReset()
  store.set.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('supabaseServer()', () => {
  it('AC-001.2: 맨 첫 줄에서 server-only를 불러온다(브라우저 묶음에 섞이면 빌드가 실패한다)', () => {
    const source = readFileSync(fileURLToPath(new URL('./server.ts', import.meta.url)), 'utf-8')
    expect(source.split('\n')[0]).toBe("import 'server-only'")
  })

  it('AC-001.2: 공개 주소·공개 열쇠로 만든다', async () => {
    await supabaseServer()
    expect(createServerClient).toHaveBeenCalledTimes(1)
    expect(createServerClient).toHaveBeenCalledWith('https://abcd.supabase.co', 'anon-key', expect.anything())
  })

  // 모듈에 두면 다른 사람의 요청 쿠키로 만든 클라이언트를 다시 쓰게 된다
  it('AC-001.2: 부를 때마다 cookies()를 다시 읽어 새로 만든다', async () => {
    const first = await supabaseServer()
    const second = await supabaseServer()
    expect(second).not.toBe(first)
    expect(createServerClient).toHaveBeenCalledTimes(2)
    expect(cookies).toHaveBeenCalledTimes(2)
  })

  it('AC-001.2: getAll은 요청 쿠키(cookies().getAll())를 그대로 돌려준다', async () => {
    store.getAll.mockReturnValue([{ name: COOKIE, value: 'old' }])
    const methods = await cookieMethods()
    expect(await methods.getAll()).toEqual([{ name: COOKIE, value: 'old' }])
  })

  it('AC-001.2: setAll은 새 세션 쿠키를 cookies()에 쓴다(auth/callback에서 세션을 만든다)', async () => {
    const methods = await cookieMethods()
    await methods.setAll!(NEW_COOKIE, NO_STORE)
    expect(store.set).toHaveBeenCalledWith(COOKIE, 'new', { path: '/', sameSite: 'lax' })
  })

  it('AC-001.2: Server Component라 쿠키를 쓰다 던져도 setAll은 던지지 않는다(세션 새로 고침은 middleware가 한다)', async () => {
    store.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler.')
    })
    const methods = await cookieMethods()
    expect(() => methods.setAll!(NEW_COOKIE, NO_STORE)).not.toThrow()
    expect(store.set).toHaveBeenCalled()
  })

  // 쿠키를 쓰는 곳은 로그인 콜백뿐이다 — https 콜백이면 세션 쿠키에 Secure를 붙인다
  it('AC-405.1: supabaseServer({ secure: true })면 cookieOptions.secure가 true', async () => {
    await supabaseServer({ secure: true })
    const calls = createServerClient.mock.calls as unknown as [string, string, { cookieOptions?: unknown }][]
    expect(calls[0][2].cookieOptions).toEqual({ secure: true })
  })

  it.each([
    ['인자를 주지 않음', () => supabaseServer()],
    ['secure: false를 줌', () => supabaseServer({ secure: false })],
  ])('AC-405.1: %s → cookieOptions.secure가 false(개발 localhost·E2E http, Server Component)', async (_label, make) => {
    await make()
    const calls = createServerClient.mock.calls as unknown as [string, string, { cookieOptions?: unknown }][]
    expect(calls[0][2].cookieOptions).toEqual({ secure: false })
  })

  it('AC-001.1: 열쇠가 없으면 만들지 않고 이유를 던진다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    await expect(supabaseServer()).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(createServerClient).not.toHaveBeenCalled()
  })
})
