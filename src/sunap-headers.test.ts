import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../next.config'
import { buildCsp } from './lib/csp'

// 수납일지 구글 시트 틀(/sunap)만 CSP에 frame-src https://docs.google.com을 더하고, 모든 경로 connect-src에 구글 코드 두 origin을 더한다
// (specs/google-link REQ-8504, design.md 6절, ADR-054). 본보기는 location-headers.test.ts —
// next.config.ts headers()를 불러, Next가 하듯 경로에 맞는 줄을 차례대로 적용해 본다(같은 이름 머리는 뒤 줄이 덮는다).
// 줄 맞추기는 Next 자신의 path-to-regexp 맞추기(getPathMatch, Next 서버와 같은 strict)로 한다. 끝 '/'는 Next가 먼저 떼어 넘기므로 보지 않는다

const SUPABASE = 'https://abcd.supabase.co'
const GOOGLE_CONNECT = ['https://script.google.com', 'https://script.googleusercontent.com']

async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = await nextConfig.headers!()
  const out: Record<string, string> = {}
  for (const rule of rules) {
    const match = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true })
    if (match(path) === false) continue
    for (const h of rule.headers) out[h.key] = h.value
  }
  return out
}

// 'connect-src x y; ...' → { 'connect-src': ['x', 'y'], ... }
function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...values]) => [name, values]),
  )
}

const SUNAP = (isDev: boolean) => ({
  'Content-Security-Policy': buildCsp(isDev, SUPABASE, { sheetFrame: true }),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
})

const SUNAP_PATHS = ['/sunap', '/sunap/x', '/sunap/2026/11']
const OTHER_PATHS = [
  '/dashboard',
  '/worklog',
  '/calendar',
  '/calendar/x',
  '/settings',
  '/claim',
  '/staff',
  '/sunapx',
  '/sunap-x',
  '/x/sunap',
  '/location',
  '/location/report/1',
  '/api/ai/location/query',
  '/api/ai/notices/collect',
]
const ALL_PATHS = [...SUNAP_PATHS, ...OTHER_PATHS]

describe('AC-8504.2 /sunap 응답 머리', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(SUNAP_PATHS)('AC-8504.2 %s 은 frame-src https://docs.google.com을 더한 CSP, nosniff·no-referrer·DENY는 그대로', async (path) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    const h = await headersFor(path)
    expect(h).toEqual(SUNAP(false))
    expect(directives(h['Content-Security-Policy']!)['frame-src']).toEqual(['https://docs.google.com'])
  })

  it.each(OTHER_PATHS)("AC-8504.2 %s 에는 frame-src가 없다(default-src 'self'를 따름, 바깥 틀 금지)", async (path) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    const csp = (await headersFor(path))['Content-Security-Policy']!
    const d = directives(csp)
    expect(Object.keys(d)).not.toContain('frame-src')
    expect(Object.keys(d)).not.toContain('child-src')
    expect(d['default-src']).toEqual(["'self'"])
    expect(csp).not.toContain('docs.google.com')
  })

  it('AC-8504.2 개발 서버(NODE_ENV=development)도 /sunap에만 frame-src를 더한다', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    expect(await headersFor('/sunap/x')).toEqual(SUNAP(true))
    expect(directives((await headersFor('/dashboard'))['Content-Security-Policy']!)).not.toHaveProperty('frame-src')
  })

  it('AC-8504.2 /sunap 줄 둘은 전체 줄(/:path*) 뒤에 있고 CSP 머리 하나만 덮는다(Referrer는 전체 줄 no-referrer 그대로)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    const rules = await nextConfig.headers!()
    const sunap = rules.filter((r) => r.source.startsWith('/sunap'))
    expect(sunap.map((r) => r.source)).toEqual(['/sunap', '/sunap/:path*'])
    expect(rules[0]!.source).toBe('/:path*')
    for (const rule of sunap) {
      expect(rules.indexOf(rule)).toBeGreaterThan(0)
      expect(rule.headers).toEqual([{ key: 'Content-Security-Policy', value: buildCsp(false, SUPABASE, { sheetFrame: true }) }])
    }
  })

  it('AC-8504.2 Supabase 주소가 없어도 /sunap 머리는 붙는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined)
    const h = await headersFor('/sunap')
    expect(h['Content-Security-Policy']).toBe(buildCsp(false, '', { sheetFrame: true }))
    expect(h['X-Frame-Options']).toBe('DENY')
  })
})

describe('AC-8504.1 모든 경로 connect-src에 구글 코드 두 origin', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(ALL_PATHS)('AC-8504.1 %s 의 connect-src에 구글 두 origin이 한 번씩 있고 와일드카드·https:가 없다', async (path) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    const csp = (await headersFor(path))['Content-Security-Policy']!
    const connect = directives(csp)['connect-src']!
    expect(connect.slice(0, 4)).toEqual(["'self'", SUPABASE, ...GOOGLE_CONNECT])
    expect(connect.filter((v) => /google/.test(v))).toEqual(GOOGLE_CONNECT)
    expect(csp).not.toContain('*')
    expect(Object.values(directives(csp)).flat()).not.toContain('https:')
  })

  it.each(['/dashboard', '/sunap', '/sunap/x', '/settings'])(
    "AC-8504.1 카카오가 없는 경로(%s)의 connect-src는 'self'·Supabase·구글 두 origin뿐이다",
    async (path) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
      const csp = (await headersFor(path))['Content-Security-Policy']!
      expect(directives(csp)['connect-src']).toEqual(["'self'", SUPABASE, ...GOOGLE_CONNECT])
    },
  )
})

describe('AC-8504.3 /location 그대로 + 모든 경로 막기 머리 그대로', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['/location', '/location/x'])('AC-8504.3 %s 은 카카오 CSP·strict-origin-when-cross-origin 그대로이고 구글 두 origin도 들어 있다', async (path) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    const h = await headersFor(path)
    expect(h['Content-Security-Policy']).toBe(buildCsp(false, SUPABASE, { kakao: true }))
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    const connect = directives(h['Content-Security-Policy']!)['connect-src']!
    expect(connect).toEqual(expect.arrayContaining([...GOOGLE_CONNECT, 'https://dapi.kakao.com', 'https://rv.map.kakao.com']))
    expect(directives(h['Content-Security-Policy']!)).not.toHaveProperty('frame-src')
  })

  it.each(ALL_PATHS)("AC-8504.3 %s 은 frame-ancestors 'none'·object-src 'none'·base-uri 'self'·X-Frame-Options DENY·nosniff 그대로", async (path) => {
    for (const env of ['test', 'development']) {
      vi.stubEnv('NODE_ENV', env)
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
      const h = await headersFor(path)
      const d = directives(h['Content-Security-Policy']!)
      expect(d['frame-ancestors']).toEqual(["'none'"])
      expect(d['object-src']).toEqual(["'none'"])
      expect(d['base-uri']).toEqual(["'self'"])
      expect(h['X-Frame-Options']).toBe('DENY')
      expect(h['X-Content-Type-Options']).toBe('nosniff')
    }
  })
})
