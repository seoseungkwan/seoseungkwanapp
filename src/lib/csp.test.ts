import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../../next.config'
import { EXTENSION_ID } from './bridge/extensionId'
import { buildCsp } from './csp'

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

const SUPABASE = 'https://abcd.supabase.co'

// google-link AC-8504.1: 모든 경로 connect-src에 더하는 구글 코드 두 origin(구글 웹 앱은 302로 googleusercontent에서 답한다, ADR-054)
const GOOGLE_CONNECT = ['https://script.google.com', 'https://script.googleusercontent.com']

// AC-011.1이 정한 지시어(이 순서, 이것만)
const DIRECTIVE_NAMES = [
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'media-src',
  'connect-src',
  'worker-src',
  'object-src',
  'base-uri',
  'form-action',
  'frame-ancestors',
]

describe('buildCsp(운영)', () => {
  const csp = buildCsp(false, SUPABASE)
  const d = directives(csp)

  it('AC-011.1 지시어는 정해 둔 12개뿐이다', () => {
    expect(Object.keys(d)).toEqual(DIRECTIVE_NAMES)
  })

  // google-link AC-8504.1: 구글 코드 두 origin이 더해졌다
  it('AC-011.1·AC-8504.1 연결은 자기 서버·Supabase origin·구글 코드 두 origin만', () => {
    expect(d['connect-src']).toEqual(["'self'", SUPABASE, ...GOOGLE_CONNECT])
  })

  it('AC-011.1 영상은 자기 서버에서만(media-src)', () => {
    expect(d['media-src']).toEqual(["'self'"])
  })

  it('AC-011.1 끼워 넣기·플러그인·base·form을 막는다', () => {
    expect(d['frame-ancestors']).toEqual(["'none'"])
    expect(d['object-src']).toEqual(["'none'"])
    expect(d['base-uri']).toEqual(["'self'"])
    expect(d['form-action']).toEqual(["'self'"])
  })

  it('AC-011.1 나머지 지시어', () => {
    expect(d['default-src']).toEqual(["'self'"])
    expect(d['script-src']).toEqual(["'self'", "'unsafe-inline'"])
    expect(d['style-src']).toEqual(["'self'", "'unsafe-inline'"])
    expect(d['img-src']).toEqual(["'self'", 'data:', 'blob:'])
    expect(d['font-src']).toEqual(["'self'"])
    expect(d['worker-src']).toEqual(["'self'", 'blob:'])
  })

  it('AC-011.1 운영에는 unsafe-eval·ws:·https:(모든 https)·와일드카드가 없다', () => {
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toContain('ws:')
    expect(csp).not.toContain('*')
    expect(Object.values(d).flat()).not.toContain('https:')
  })
})

describe('buildCsp(개발)', () => {
  const dev = directives(buildCsp(true, SUPABASE))
  const prod = directives(buildCsp(false, SUPABASE))

  it("AC-011.1 개발에만 'unsafe-eval'(Next 개발 서버)과 ws:(새로 고침)를 더한다", () => {
    expect(dev['script-src']).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"])
    expect(dev['connect-src']).toEqual(["'self'", SUPABASE, ...GOOGLE_CONNECT, 'ws:']) // google-link AC-8504.1
  })

  it('AC-011.1 개발도 그 둘 말고는 운영과 같다(와일드카드 없음)', () => {
    const others = (d: Record<string, string[]>) =>
      Object.entries(d).filter(([name]) => name !== 'script-src' && name !== 'connect-src')
    expect(others(dev)).toEqual(others(prod))
    expect(buildCsp(true, SUPABASE)).not.toContain('*')
  })
})

describe('buildCsp connect-src의 Supabase 주소', () => {
  it('AC-011.1 경로·검색어가 붙어도 origin만 더한다', () => {
    const csp = buildCsp(false, `${SUPABASE}/rest/v1/?apikey=x`)
    expect(directives(csp)['connect-src']).toEqual(["'self'", SUPABASE, ...GOOGLE_CONNECT]) // google-link AC-8504.1
    expect(csp).not.toContain('/rest')
    expect(csp).not.toContain('apikey')
  })

  it('AC-011.1 Supabase 주소는 connect-src에만 들어간다', () => {
    const others = (csp: string) => Object.entries(directives(csp)).filter(([name]) => name !== 'connect-src')
    expect(others(buildCsp(false, SUPABASE))).toEqual(others(buildCsp(false, '')))
    expect(others(buildCsp(true, SUPABASE))).toEqual(others(buildCsp(true, '')))
  })

  it.each(['', '   ', 'not a url', 'http://abcd.supabase.co', 'https://*.supabase.co', `${SUPABASE};script-src`, `${SUPABASE} https:`])(
    "AC-011.1·AC-8504.1 주소가 없거나 잘못되면(%j) 'self'와 구글 코드 두 origin만 있다",
    (url) => {
      const csp = buildCsp(false, url)
      expect(directives(csp)['connect-src']).toEqual(["'self'", ...GOOGLE_CONNECT]) // google-link AC-8504.1
      expect(Object.keys(directives(csp))).toEqual(DIRECTIVE_NAMES)
      expect(csp).not.toContain('*')
    },
  )
})

describe('next.config headers()', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function headers() {
    const rules = await nextConfig.headers!()
    const all = rules.find((r) => r.source === '/:path*')
    expect(all).toBeDefined()
    return Object.fromEntries(all!.headers.map((h) => [h.key, h.value]))
  }

  it('AC-011.2 모든 경로에 CSP·nosniff·no-referrer·DENY를 붙인다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    const h = await headers()
    // 시험은 NODE_ENV=test → 운영 CSP
    expect(h['Content-Security-Policy']).toBe(buildCsp(false, SUPABASE))
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Referrer-Policy']).toBe('no-referrer')
    expect(h['X-Frame-Options']).toBe('DENY')
  })

  it('AC-011.2 NEXT_PUBLIC_SUPABASE_URL을 CSP connect-src에 넘긴다', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    const h = await headers()
    expect(directives(h['Content-Security-Policy'])['connect-src']).toEqual(["'self'", SUPABASE, ...GOOGLE_CONNECT]) // google-link AC-8504.1
  })

  it("AC-011.2 주소가 없어도 헤더는 붙고 connect-src는 'self'만", async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined)
    const h = await headers()
    expect(h['Content-Security-Policy']).toBe(buildCsp(false, ''))
    expect(h['X-Frame-Options']).toBe('DENY')
  })

  it('AC-011.2 개발 서버(NODE_ENV=development)에는 개발 CSP를 붙인다', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE)
    const h = await headers()
    expect(h['Content-Security-Policy']).toBe(buildCsp(true, SUPABASE))
  })
})

// 청구 사전점검 전(TASK-4 전) 값을 글자 그대로 적어 둔다. 네이티브 메시징은 connect-src와 상관없다(ADR-020)
const BEFORE_GOOGLE_PROD_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self'; media-src 'self'; connect-src 'self' https://abcd.supabase.co; worker-src 'self' blob:; " +
  "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
const BEFORE_GOOGLE_DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self'; media-src 'self'; connect-src 'self' https://abcd.supabase.co ws:; worker-src 'self' blob:; " +
  "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
// google-link AC-8504.1: 위 값에서 connect-src의 Supabase 뒤에 구글 코드 두 origin만 더한 지금 값(글자 그대로)
const PROD_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self'; media-src 'self'; connect-src 'self' https://abcd.supabase.co https://script.google.com https://script.googleusercontent.com; " +
  "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self'; media-src 'self'; connect-src 'self' https://abcd.supabase.co https://script.google.com https://script.googleusercontent.com ws:; " +
  "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

// 입지 분석(/location)만 더하는 카카오 지도 origin(specs/location design.md 13절 처음 목록, 와일드카드 없음)
// + 진짜 브라우저 CSP 위반 기록으로 찾은 kakaocdn.net·rv.map.kakao.com(TASK-48 확인 7 — 지금 지도 본체는 kakaocdn.net에서 온다)
const KAKAO_SCRIPT = ['https://dapi.kakao.com', 'https://t1.daumcdn.net', 'https://t1.kakaocdn.net']
const KAKAO_IMG = [
  'https://t1.daumcdn.net',
  'https://map0.daumcdn.net',
  'https://map1.daumcdn.net',
  'https://map2.daumcdn.net',
  'https://map3.daumcdn.net',
  'https://mts.daumcdn.net',
  'https://s1.daumcdn.net',
  'https://mts.kakaocdn.net',
  'https://map.kakaocdn.net',
  'https://t1.kakaocdn.net',
  'https://ssl.kakaocdn.net',
]
// 로드뷰 설정 자료는 t1.kakaocdn.net에서도 읽는다(TASK-48 운영 흉내 다시 확인)
const KAKAO_CONNECT = ['https://dapi.kakao.com', 'https://rv.map.kakao.com', 'https://ssl.kakaocdn.net', 'https://t1.kakaocdn.net']

describe('AC-7916.2 buildCsp 셋째 인자 { kakao: true }', () => {
  const kakao = directives(buildCsp(false, SUPABASE, { kakao: true }))
  const plain = directives(buildCsp(false, SUPABASE))

  it('AC-7916.2 지시어 12개와 차례는 그대로다', () => {
    expect(Object.keys(kakao)).toEqual(DIRECTIVE_NAMES)
  })

  it('AC-7916.2 script-src·img-src·connect-src 끝에 정해 둔 카카오 origin만 더한다', () => {
    expect(kakao['script-src']).toEqual([...plain['script-src']!, ...KAKAO_SCRIPT])
    expect(kakao['img-src']).toEqual([...plain['img-src']!, ...KAKAO_IMG])
    expect(kakao['connect-src']).toEqual([...plain['connect-src']!, ...KAKAO_CONNECT])
  })

  it('AC-7916.2 나머지 아홉 지시어는 옛 값과 같다(object-src none·frame-ancestors none·base-uri self 그대로)', () => {
    const others = (d: Record<string, string[]>) =>
      Object.entries(d).filter(([name]) => !['script-src', 'img-src', 'connect-src'].includes(name))
    expect(others(kakao)).toEqual(others(plain))
    expect(kakao['object-src']).toEqual(["'none'"])
    expect(kakao['frame-ancestors']).toEqual(["'none'"])
    expect(kakao['base-uri']).toEqual(["'self'"])
  })

  it('AC-7916.2 와일드카드·모든 https(https:)가 없고, 더한 값은 모두 https origin 그대로다(경로·검색어 없음)', () => {
    for (const isDev of [false, true]) {
      const csp = buildCsp(isDev, SUPABASE, { kakao: true })
      expect(csp).not.toContain('*')
      expect(Object.values(directives(csp)).flat()).not.toContain('https:')
    }
    for (const origin of [...KAKAO_SCRIPT, ...KAKAO_IMG, ...KAKAO_CONNECT]) {
      expect(new URL(origin).origin).toBe(origin)
      expect(origin.startsWith('https://')).toBe(true)
    }
  })

  it('AC-7916.2 지금 카카오 지도 본체·조각 그림·로드뷰 주소(kakaocdn.net·rv.map.kakao.com)를 하나씩 더하고, 있던 dapi.kakao.com·t1.daumcdn.net은 그대로다', () => {
    expect(kakao['script-src']).toEqual(expect.arrayContaining(['https://dapi.kakao.com', 'https://t1.daumcdn.net', 'https://t1.kakaocdn.net']))
    expect(kakao['img-src']).toEqual(
      expect.arrayContaining(['https://t1.daumcdn.net', 'https://mts.kakaocdn.net', 'https://map.kakaocdn.net', 'https://t1.kakaocdn.net', 'https://ssl.kakaocdn.net']),
    )
    expect(kakao['connect-src']).toEqual(expect.arrayContaining(['https://dapi.kakao.com', 'https://rv.map.kakao.com', 'https://ssl.kakaocdn.net']))
    // 같은 지시어 안에 같은 값이 두 번 들지 않는다
    for (const name of ['script-src', 'img-src', 'connect-src']) expect(new Set(kakao[name]).size, name).toBe(kakao[name]!.length)
    // /location이 아닌 경로(셋째 인자 없음)에는 카카오 주소가 하나도 없다
    for (const isDev of [false, true]) expect(buildCsp(isDev, SUPABASE)).not.toMatch(/kakao|daumcdn/)
  })

  it("AC-7916.2 개발에도 같은 origin을 더하고 'unsafe-eval'·ws:는 개발 그대로다", () => {
    const dev = directives(buildCsp(true, SUPABASE, { kakao: true }))
    const devPlain = directives(buildCsp(true, SUPABASE))
    expect(dev['script-src']).toEqual([...devPlain['script-src']!, ...KAKAO_SCRIPT])
    expect(dev['connect-src']).toEqual([...devPlain['connect-src']!, ...KAKAO_CONNECT])
    expect(dev['script-src']).toContain("'unsafe-eval'")
    expect(dev['connect-src']).toContain('ws:')
  })

  it("AC-7916.2 Supabase 주소가 없어도 카카오 origin은 더하고 connect-src의 Supabase만 빠진다", () => {
    // google-link AC-8504.1: 구글 코드 두 origin은 모든 경로라 카카오 앞에 있다
    expect(directives(buildCsp(false, '', { kakao: true }))['connect-src']).toEqual(["'self'", ...GOOGLE_CONNECT, ...KAKAO_CONNECT])
  })

  it('AC-7916.2 셋째 인자가 없거나 kakao가 false면 옛 결과와 글자까지 같다', () => {
    expect(buildCsp(false, SUPABASE)).toBe(PROD_CSP)
    expect(buildCsp(true, SUPABASE)).toBe(DEV_CSP)
    expect(buildCsp(false, SUPABASE, {})).toBe(PROD_CSP)
    expect(buildCsp(false, SUPABASE, { kakao: false })).toBe(PROD_CSP)
    expect(buildCsp(true, SUPABASE, { kakao: false })).toBe(DEV_CSP)
  })
})

// google-link AC-8504.1: 청구 사전점검 전 값(BEFORE_GOOGLE_*)에서 connect-src에 구글 코드 두 origin만 더한 값과 글자까지 같다
describe('AC-004.8 CSP는 청구 사전점검 전과 글자까지 같다(구글 코드 두 origin만 더함)', () => {
  it('AC-004.8 운영 값', () => {
    expect(buildCsp(false, SUPABASE)).toBe(PROD_CSP)
  })

  it('AC-004.8 개발 값', () => {
    expect(buildCsp(true, SUPABASE)).toBe(DEV_CSP)
  })

  it('AC-004.8·AC-8504.1 지금 값은 사전점검 전 값의 connect-src Supabase 뒤에 구글 코드 두 origin만 끼운 것이다', () => {
    const google = ` ${GOOGLE_CONNECT.join(' ')}`
    expect(PROD_CSP).toBe(BEFORE_GOOGLE_PROD_CSP.replace(' https://abcd.supabase.co;', ` https://abcd.supabase.co${google};`))
    expect(DEV_CSP).toBe(BEFORE_GOOGLE_DEV_CSP.replace(' https://abcd.supabase.co ws:;', ` https://abcd.supabase.co${google} ws:;`))
  })

  it("AC-004.8 Supabase 주소가 없을 때는 connect-src에 Supabase가 없는 것 말고 같다", () => {
    expect(buildCsp(false, '')).toBe(PROD_CSP.replace(' https://abcd.supabase.co https://script.google.com', ' https://script.google.com'))
    expect(buildCsp(true, '')).toBe(DEV_CSP.replace(' https://abcd.supabase.co https://script.google.com', ' https://script.google.com'))
  })

  it.each([false, true])('AC-004.8 chrome-extension:·확장 ID가 없다(개발=%s)', (isDev) => {
    for (const csp of [buildCsp(isDev, SUPABASE), buildCsp(isDev, '')]) {
      expect(csp).not.toContain('chrome-extension')
      expect(EXTENSION_ID).toMatch(/^[a-p]{32}$/)
      expect(csp).not.toContain(EXTENSION_ID)
    }
  })
})

// google-link REQ-8504(design.md 6절, ADR-054): 모든 경로 connect-src에 구글 코드 두 origin, { sheetFrame: true }(/sunap 머리만)에만 frame-src
const SHEET_FRAME = ['https://docs.google.com']
const OPTS = [{}, { kakao: true }, { sheetFrame: true }, { sheetFrame: false }, { kakao: true, sheetFrame: false }] as const

describe('AC-8504.1 buildCsp connect-src의 구글 코드 두 origin', () => {
  it.each(OPTS.flatMap((opts) => [false, true].flatMap((isDev) => [SUPABASE, ''].map((url) => [opts, isDev, url] as const))))(
    'AC-8504.1 셋째 인자 %j·개발=%s·Supabase %j: connect-src에 구글 두 origin이 한 번씩, 와일드카드·https: 없음',
    (opts, isDev, url) => {
      const csp = buildCsp(isDev, url, opts)
      const connect = directives(csp)['connect-src']!
      for (const origin of GOOGLE_CONNECT) expect(connect.filter((v) => v === origin), origin).toHaveLength(1)
      expect(csp).not.toContain('*')
      expect(Object.values(directives(csp)).flat()).not.toContain('https:')
      // 구글은 이 두 origin만 — 다른 google 이름은 connect-src에 없다(docs.google.com은 /sunap의 frame-src에만)
      expect(connect.filter((v) => /google/.test(v))).toEqual(GOOGLE_CONNECT)
    },
  )

  it('AC-8504.1 더한 값은 https origin 그대로다(경로·검색어 없음)', () => {
    for (const origin of [...GOOGLE_CONNECT, ...SHEET_FRAME]) {
      expect(new URL(origin).origin).toBe(origin)
      expect(origin.startsWith('https://')).toBe(true)
    }
  })

  it('AC-8504.1 connect-src 밖 지시어는 사전점검 전 값과 같고, connect-src는 구글 두 origin을 빼면 사전점검 전과 같다', () => {
    for (const [isDev, before] of [
      [false, BEFORE_GOOGLE_PROD_CSP],
      [true, BEFORE_GOOGLE_DEV_CSP],
    ] as const) {
      const now = directives(buildCsp(isDev, SUPABASE))
      const old = directives(before)
      expect(Object.keys(now)).toEqual(DIRECTIVE_NAMES)
      expect(Object.entries(now).filter(([n]) => n !== 'connect-src')).toEqual(Object.entries(old).filter(([n]) => n !== 'connect-src'))
      expect(now['connect-src']!.filter((v) => !GOOGLE_CONNECT.includes(v))).toEqual(old['connect-src'])
      expect(now['connect-src']).toHaveLength(old['connect-src']!.length + 2)
    }
  })
})

describe('AC-8504.2 buildCsp 셋째 인자 { sheetFrame: true }', () => {
  it.each([false, true])('AC-8504.2 frame-src https://docs.google.com 한 줄만 끝에 더하고 나머지 12개 지시어는 그대로다(개발=%s)', (isDev) => {
    const sheet = directives(buildCsp(isDev, SUPABASE, { sheetFrame: true }))
    const plain = directives(buildCsp(isDev, SUPABASE))
    expect(Object.keys(sheet)).toEqual([...DIRECTIVE_NAMES, 'frame-src'])
    expect(sheet['frame-src']).toEqual(SHEET_FRAME)
    expect(Object.entries(sheet).filter(([n]) => n !== 'frame-src')).toEqual(Object.entries(plain))
    expect(buildCsp(isDev, SUPABASE, { sheetFrame: true })).toBe(`${buildCsp(isDev, SUPABASE)}; frame-src https://docs.google.com`)
  })

  it.each([false, true])("AC-8504.2 sheetFrame이어도 frame-ancestors 'none'·object-src 'none'·base-uri 'self'·default-src 'self' 그대로(개발=%s)", (isDev) => {
    const sheet = directives(buildCsp(isDev, SUPABASE, { sheetFrame: true }))
    expect(sheet['frame-ancestors']).toEqual(["'none'"])
    expect(sheet['object-src']).toEqual(["'none'"])
    expect(sheet['base-uri']).toEqual(["'self'"])
    expect(sheet['default-src']).toEqual(["'self'"])
  })

  it.each([{}, { sheetFrame: false }, { kakao: true }, { kakao: false, sheetFrame: false }])(
    'AC-8504.2 셋째 인자 %j 에는 frame-src가 없고 docs.google.com도 없다(default-src self를 따름)',
    (opts) => {
      for (const isDev of [false, true]) {
        const csp = buildCsp(isDev, SUPABASE, opts)
        expect(Object.keys(directives(csp))).not.toContain('frame-src')
        expect(csp).not.toContain('docs.google.com')
      }
    },
  )

  it('AC-8504.2 Supabase 주소가 없어도 sheetFrame이면 frame-src를 더한다', () => {
    expect(directives(buildCsp(false, '', { sheetFrame: true }))['frame-src']).toEqual(SHEET_FRAME)
  })
})

describe('AC-8504.3 /location 카카오 CSP에도 구글 두 origin', () => {
  it.each([false, true])('AC-8504.3 { kakao: true }의 connect-src는 지금 값 + 구글 두 origin + 카카오 넷이고 frame-src는 없다(개발=%s)', (isDev) => {
    const kakao = directives(buildCsp(isDev, SUPABASE, { kakao: true }))
    expect(kakao['connect-src']).toEqual(["'self'", SUPABASE, ...GOOGLE_CONNECT, ...(isDev ? ['ws:'] : []), ...KAKAO_CONNECT])
    expect(kakao['script-src']).toEqual([...directives(buildCsp(isDev, SUPABASE))['script-src']!, ...KAKAO_SCRIPT])
    expect(kakao['img-src']).toEqual(["'self'", 'data:', 'blob:', ...KAKAO_IMG])
    expect(Object.keys(kakao)).toEqual(DIRECTIVE_NAMES)
    expect(kakao['frame-ancestors']).toEqual(["'none'"])
    expect(kakao['object-src']).toEqual(["'none'"])
  })
})
