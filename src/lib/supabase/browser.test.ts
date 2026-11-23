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

// 보기 쿠키가 있으면 머리 x-ssk-view + 쓰기 거르는 fetch (admin-view AC-8004.2, design.md '보기 열쇠 · 브라우저 쓰기 막기')
describe('AC-8004.2 supabaseBrowser() — 보기 쿠키', () => {
  const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e'
  type Options = { global: { headers: Record<string, string>; fetch: typeof fetch } }
  const calls = () => createBrowserClient.mock.calls as unknown as unknown[][]

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcd.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['쿠키 없음', ''],
    ['다른 쿠키만', 'sb-abcd-auth-token=base64-abc; theme=dark'],
    ['uuid 모양 아님', 'ssk_view=not-a-uuid'],
  ])('AC-8004.2: %s이면 지금과 같이 (주소, 열쇠) 둘만 넘겨 만든다(머리·거르기 없음)', async (_, cookie) => {
    vi.stubGlobal('document', { cookie })
    const supabaseBrowser = await load()
    supabaseBrowser()
    expect(calls()).toEqual([['https://abcd.supabase.co', 'anon-key']])
  })

  it('AC-8004.2: 문서가 없으면(서버에서 그리기) 지금과 같이 만든다', async () => {
    const supabaseBrowser = await load()
    supabaseBrowser()
    expect(calls()).toEqual([['https://abcd.supabase.co', 'anon-key']])
  })

  it('AC-8004.2: 보기 쿠키가 있으면 모든 요청에 머리 x-ssk-view(소문자 열쇠)와 거르는 fetch를 넘긴다', async () => {
    vi.stubGlobal('document', { cookie: `sb-abcd-auth-token=base64-abc; ssk_view=${KEY.toUpperCase()}` })
    const supabaseBrowser = await load()
    supabaseBrowser()
    expect(calls()).toEqual([
      ['https://abcd.supabase.co', 'anon-key', { global: { headers: { 'x-ssk-view': KEY }, fetch: expect.any(Function) } }],
    ])
  })

  it('AC-8004.2: 넘긴 fetch는 쓰기를 막고(진짜 fetch를 부르지 않음) 읽기는 진짜 fetch로 보낸다', async () => {
    const realFetch = vi.fn(async () => new Response('[]', { status: 200 }))
    vi.stubGlobal('fetch', realFetch)
    vi.stubGlobal('document', { cookie: `ssk_view=${KEY}` })
    const supabaseBrowser = await load()
    supabaseBrowser()
    const options = calls()[0][2] as Options

    const blocked = await options.global.fetch('https://abcd.supabase.co/rest/v1/tasks', { method: 'POST', body: '{}' })
    expect(blocked.status).toBe(403)
    expect(await blocked.text()).toBe('{"code":"E-VIEW-READONLY"}')
    expect(realFetch).not.toHaveBeenCalled()

    const init = { method: 'GET' }
    await options.global.fetch('https://abcd.supabase.co/rest/v1/tasks?select=*', init)
    expect(realFetch).toHaveBeenCalledExactlyOnceWith('https://abcd.supabase.co/rest/v1/tasks?select=*', init)
  })

  it('AC-8004.2: 쿠키는 처음 만들 때 한 번만 본다(보기를 시작·끝낼 때는 페이지를 새로 연다)', async () => {
    const doc = { cookie: '' }
    vi.stubGlobal('document', doc)
    const supabaseBrowser = await load()
    const first = supabaseBrowser()
    doc.cookie = `ssk_view=${KEY}`
    expect(supabaseBrowser()).toBe(first)
    expect(calls()).toEqual([['https://abcd.supabase.co', 'anon-key']])
  })
})
