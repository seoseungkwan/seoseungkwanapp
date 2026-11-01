import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createBrowserClient } = vi.hoisted(() => ({ createBrowserClient: vi.fn(() => ({ auth: {} })) }))
vi.mock('@supabase/ssr', () => ({ createBrowserClient }))

// 한 번 만든 클라이언트를 모듈 안에 둔다 → 시험마다 새로 불러온다
async function load() {
  vi.resetModules()
  return (await import('./browser')).supabaseBrowser
}

beforeEach(() => {
  createBrowserClient.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// 브라우저가 연 페이지의 주소 흉내(이 시험 파일은 node 환경이라 window가 없다)
function openedOver(protocol: 'https:' | 'http:') {
  vi.stubGlobal('window', { location: { protocol } })
}

describe('supabaseBrowser()', () => {
  it('AC-001.2: 공개 주소·공개 열쇠로 한 번만 만들고 다시 쓴다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    const supabaseBrowser = await load()
    const first = supabaseBrowser()
    expect(supabaseBrowser()).toBe(first)
    expect(createBrowserClient).toHaveBeenCalledTimes(1)
    expect(createBrowserClient).toHaveBeenCalledWith('https://abcd.supabase.co', 'anon-key', {
      cookieOptions: { secure: false },
    })
  })

  it('AC-001.1: 열쇠가 없으면 만들지 않고 이유를 던진다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const supabaseBrowser = await load()
    expect(() => supabaseBrowser()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(createBrowserClient).not.toHaveBeenCalled()
  })

  it.each([
    ['https:', true],
    ['http:', false],
  ] as const)('AC-405.2: %s로 연 페이지면 cookieOptions.secure가 %s', async (protocol, secure) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    openedOver(protocol)
    const supabaseBrowser = await load()
    supabaseBrowser()
    expect(createBrowserClient).toHaveBeenCalledWith('https://abcd.supabase.co', 'anon-key', { cookieOptions: { secure } })
  })

  it('AC-405.2: window가 없으면(서버에서 그릴 때) cookieOptions.secure가 false', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    expect(typeof window).toBe('undefined')
    const supabaseBrowser = await load()
    supabaseBrowser()
    expect(createBrowserClient).toHaveBeenCalledWith('https://abcd.supabase.co', 'anon-key', {
      cookieOptions: { secure: false },
    })
  })
})
