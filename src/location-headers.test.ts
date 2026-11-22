import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../next.config'
import { buildCsp } from './lib/csp'

// 입지 분석(/location)만 카카오 지도 CSP·Referrer를 넓힌다(specs/location REQ-7916 AC-7916.2, design.md 13절, ADR-043).
// next.config.ts headers()를 불러, Next가 하듯 경로에 맞는 줄을 차례대로 적용해 본다(같은 이름 머리는 뒤 줄이 덮는다).
// 줄 맞추기는 Next 자신의 path-to-regexp 맞추기(getPathMatch, Next 서버와 같은 strict)로 한다. 끝 '/'는 Next가 먼저 떼어 넘기므로 보지 않는다

const SUPABASE = 'https://abcd.supabase.co'

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

const OLD = (isDev: boolean) => ({
  'Content-Security-Policy': buildCsp(isDev, SUPABASE),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
})
const LOCATION = (isDev: boolean) => ({
  'Content-Security-Policy': buildCsp(isDev, SUPABASE, { kakao: true }),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
})

describe('AC-7916.2 /location 응답 머리', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['/location', '/location/x', '/location/report/1'])(
    'AC-7916.2 %s 은 카카오 origin CSP + strict-origin-when-cross-origin, nosniff·DENY는 그대로',
    async (path) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
      expect(await headersFor(path)).toEqual(LOCATION(false))
    },
  )

  it.each(['/dashboard', '/settings', '/locations', '/location-x', '/api/ai/location/query', '/api/ai/location/keys'])(
    'AC-7916.2 %s 은 옛 머리 그대로(카카오 origin 없음, no-referrer)',
    async (path) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
      const h = await headersFor(path)
      expect(h).toEqual(OLD(false))
      expect(h['Content-Security-Policy']).not.toContain('kakao')
      expect(h['Content-Security-Policy']).not.toContain('daumcdn')
    },
  )

  it('AC-7916.2 개발 서버(NODE_ENV=development)는 /location에도 개발 CSP에 카카오 origin을 더한다', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    expect(await headersFor('/location/x')).toEqual(LOCATION(true))
    expect(await headersFor('/dashboard')).toEqual(OLD(true))
  })

  it('AC-7916.2 /location 줄은 전체 줄(/:path*) 뒤에 있고, CSP·Referrer-Policy 두 머리만 덮는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    const rules = await nextConfig.headers!()
    expect(rules.map((r) => r.source)).toEqual(['/:path*', '/location', '/location/:path*'])
    for (const rule of rules.slice(1)) {
      expect(rule.headers.map((h) => h.key)).toEqual(['Content-Security-Policy', 'Referrer-Policy'])
    }
  })

  it('AC-7916.2 Supabase 주소가 없어도 /location 머리는 붙는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined)
    const h = await headersFor('/location')
    expect(h['Content-Security-Policy']).toBe(buildCsp(false, '', { kakao: true }))
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })
})
