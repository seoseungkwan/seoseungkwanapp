import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabaseEnv, supabaseOrigin } from './env'

const URL_NAME = 'NEXT_PUBLIC_SUPABASE_URL'
const KEY_NAME = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'

afterEach(() => {
  vi.unstubAllEnvs()
})

function stub(url: string | undefined, anonKey: string | undefined) {
  vi.stubEnv(URL_NAME, url)
  vi.stubEnv(KEY_NAME, anonKey)
}

describe('supabaseEnv()', () => {
  it('AC-001.1: 공개 주소·공개 열쇠를 돌려준다', () => {
    stub('https://abcd.supabase.co', 'anon-key')
    expect(supabaseEnv()).toEqual({ url: 'https://abcd.supabase.co', anonKey: 'anon-key' })
  })

  it('AC-001.1: 앞뒤 공백·줄바꿈은 뺀다', () => {
    stub(' https://abcd.supabase.co\n', ' anon-key\n')
    expect(supabaseEnv()).toEqual({ url: 'https://abcd.supabase.co', anonKey: 'anon-key' })
  })

  // 클라이언트가 붙는 주소와 CSP connect-src(supabaseOrigin)가 어긋나지 않게
  it.each(['https://abcd.supabase.co/', 'https://abcd.supabase.co/rest/v1?x=1'])(
    'AC-001.1: 끝의 /·경로가 붙은 %s도 origin만 돌려준다',
    (url) => {
      stub(url, 'anon-key')
      expect(supabaseEnv().url).toBe('https://abcd.supabase.co')
    },
  )

  it.each([undefined, '', '   '])('AC-001.1: 주소가 비었으면(%j) 그 이름을 말한다', (url) => {
    stub(url, 'anon-key')
    expect(() => supabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL.*비었/)
  })

  it.each([undefined, '', '   '])('AC-001.1: 공개 열쇠가 비었으면(%j) 그 이름을 말한다', (anonKey) => {
    stub('https://abcd.supabase.co', anonKey)
    expect(() => supabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY.*비었/)
  })

  it.each([
    'http://abcd.supabase.co',
    'http://localhost.evil.test',
    'ftp://abcd.supabase.co',
    'abcd.supabase.co',
    'not a url',
    'https://*.supabase.co',
  ])('AC-001.1: https가 아닌 주소 %s는 거부한다', (url) => {
    stub(url, 'anon-key')
    expect(() => supabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL.*https:\/\//)
  })

  // 오류 문구가 화면·로그에 나가도 주소·열쇠 값은 새지 않게
  it('AC-001.1: 거부한 주소와 열쇠 값은 오류 문구에 넣지 않는다', () => {
    stub('http://secret-ref.supabase.co', 'secret-anon-key')
    expect(() => supabaseEnv()).toThrow(expect.objectContaining({ message: expect.not.stringMatching(/secret/) }))
    stub('', 'secret-anon-key')
    expect(() => supabaseEnv()).toThrow(expect.objectContaining({ message: expect.not.stringMatching(/secret/) }))
  })

  it.each(['http://localhost:54321', 'http://127.0.0.1:54321'])('AC-001.1: 개발용 %s는 된다', (url) => {
    stub(url, 'anon-key')
    expect(supabaseEnv().url).toBe(url)
  })

  it('AC-001.1: 불러오기만 해서는 읽지 않는다(열쇠 없이도 build·test가 된다)', async () => {
    stub(undefined, undefined)
    vi.resetModules()
    await expect(import('./env')).resolves.toBeDefined()
  })
})

describe('supabaseOrigin()', () => {
  it('AC-001.1: 경로를 뺀 origin만 돌려준다', () => {
    expect(supabaseOrigin('https://abcd.supabase.co/rest/v1/?x=1')).toBe('https://abcd.supabase.co')
    expect(supabaseOrigin('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321')
  })

  // URL은 호스트의 *·; 를 받아 준다 → CSP에 와일드카드·지시어가 끼어들지 않게 따로 거른다
  it.each([
    undefined,
    '',
    'not a url',
    'http://abcd.supabase.co',
    'https://*.supabase.co',
    'https://abcd.supabase.co;script-src',
  ])('AC-001.1: 잘못된 주소 %j는 null', (url) => {
    expect(supabaseOrigin(url)).toBeNull()
  })
})
