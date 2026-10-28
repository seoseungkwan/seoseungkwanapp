import type { CookieMethodsServer } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateSession } from './middleware'

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }))
vi.mock('@supabase/ssr', () => ({ createServerClient }))

const COOKIE = 'sb-abcd-auth-token'
const getSession = vi.fn()

// getUser()가 불리면 (세션을 새로 고쳤다면) setAll로 새 쿠키를 넘기는 가짜 Supabase
function fakeSupabase(user: { id: string } | null, refreshed: boolean) {
  createServerClient.mockImplementation((_url: string, _key: string, options: { cookies: CookieMethodsServer }) => ({
    auth: {
      getSession,
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

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  createServerClient.mockReset()
  getSession.mockReset()
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
    const { userId } = await updateSession(request())
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
    const req = request()
    const { response } = await updateSession(req)
    expect(req.cookies.get(COOKIE)?.value).toBe('new')
    expect(response.cookies.get(COOKIE)).toMatchObject({ value: 'new', path: '/', sameSite: 'lax' })
  })

  it('AC-001.3: 세션 쿠키가 든 응답에 캐시 금지 헤더를 붙인다(남의 세션이 CDN에 남지 않게)', async () => {
    fakeSupabase({ id: 'user-1' }, true)
    const { response } = await updateSession(request())
    const cacheControl = response.headers.get('Cache-Control')
    expect(cacheControl).toContain('private')
    expect(cacheControl).toContain('no-store')
  })
})
