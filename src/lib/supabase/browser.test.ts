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
})

describe('supabaseBrowser()', () => {
  it('AC-001.2: 공개 주소·공개 열쇠로 한 번만 만들고 다시 쓴다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    const supabaseBrowser = await load()
    const first = supabaseBrowser()
    expect(supabaseBrowser()).toBe(first)
    expect(createBrowserClient).toHaveBeenCalledTimes(1)
    expect(createBrowserClient).toHaveBeenCalledWith('https://abcd.supabase.co', 'anon-key')
  })

  it('AC-001.1: 열쇠가 없으면 만들지 않고 이유를 던진다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const supabaseBrowser = await load()
    expect(() => supabaseBrowser()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(createBrowserClient).not.toHaveBeenCalled()
  })
})
