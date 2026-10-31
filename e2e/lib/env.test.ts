import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  E2E_ENV_NAMES,
  ROLES,
  ROLE_TAG,
  authSettingsProblems,
  checkSupabase,
  readE2eEnv,
  startProblemMessage,
  type E2eEnv,
} from './env'

// 가짜 값만 쓴다. 실제 .env.local은 읽지 않는다
const VALID: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fake-key-for-tests',
  E2E_ADMIN_EMAIL: 'owner+e2e-admin@example.com',
  E2E_ADMIN_PASSWORD: 'admin-password-123456',
  E2E_APPROVED_EMAIL: 'owner+e2e-approved@example.com',
  E2E_APPROVED_PASSWORD: 'approved-password-123',
  E2E_PENDING_EMAIL: 'owner+e2e-pending@example.com',
  E2E_PENDING_PASSWORD: 'pending-password-1234',
  E2E_NEW_EMAIL: 'owner.long.address+e2e-new-wrapping-check@example.com',
  E2E_NEW_PASSWORD: 'new-password-12345678',
}

function withEnv(changes: Record<string, string | undefined>): Record<string, string | undefined> {
  return { ...VALID, ...changes }
}

function problemsOf(env: Record<string, string | undefined>): string[] {
  const result = readE2eEnv(env)
  return result.ok ? [] : result.problems
}

// 이 글자가 문제 목록·메시지에 나오면 값이 샌 것이다
const LEAK = 'qzx'

function expectNoLeak(text: string, values: string[]) {
  expect(text.toLowerCase()).not.toContain(LEAK)
  for (const v of values) expect(text).not.toContain(v)
}

// 실제 프로젝트의 GET /auth/v1/settings 응답과 같은 모양(맨 위 칸 8개, external은 공급자별 참·거짓).
// GoTrue(supabase/auth) internal/api/settings.go와도 같다. 칸 이름이 바뀌면 이 가짜부터 고친다
function settingsResponse(changes: { external?: Record<string, unknown>; [key: string]: unknown } = {}) {
  const { external, ...rest } = changes
  return {
    external: {
      anonymous_users: false,
      apple: false,
      azure: false,
      bitbucket: false,
      discord: false,
      facebook: false,
      figma: false,
      fly: false,
      github: false,
      gitlab: false,
      google: false,
      keycloak: false,
      kakao: false,
      linkedin: false,
      linkedin_oidc: false,
      notion: false,
      spotify: false,
      slack: false,
      slack_oidc: false,
      workos: false,
      twitch: false,
      twitter: false,
      email: true,
      phone: false,
      zoom: false,
      ...external,
    },
    disable_signup: false,
    mailer_autoconfirm: false,
    phone_autoconfirm: false,
    sms_provider: '',
    saml_enabled: false,
    saml_private_key_next_configured: false,
    passkeys_enabled: false,
    ...rest,
  }
}

const ENV: E2eEnv = {
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  anonKey: 'sb_publishable_fake-key-for-tests',
  accounts: {
    admin: { email: VALID.E2E_ADMIN_EMAIL, password: VALID.E2E_ADMIN_PASSWORD },
    approved: { email: VALID.E2E_APPROVED_EMAIL, password: VALID.E2E_APPROVED_PASSWORD },
    pending: { email: VALID.E2E_PENDING_EMAIL, password: VALID.E2E_PENDING_PASSWORD },
    new: { email: VALID.E2E_NEW_EMAIL, password: VALID.E2E_NEW_PASSWORD },
  },
}

function jsonFetch(body: unknown, status = 200) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    void input
    void init
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  })
}

const asFetch = (fn: unknown) => fn as typeof fetch

describe('readE2eEnv — 값 묶기', () => {
  it('AC-002.1: 이름 10개(주소·공개 열쇠 + 역할 4개의 이메일·비밀번호)를 이 순서로 안다', () => {
    expect(E2E_ENV_NAMES).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'E2E_ADMIN_EMAIL',
      'E2E_ADMIN_PASSWORD',
      'E2E_APPROVED_EMAIL',
      'E2E_APPROVED_PASSWORD',
      'E2E_PENDING_EMAIL',
      'E2E_PENDING_PASSWORD',
      'E2E_NEW_EMAIL',
      'E2E_NEW_PASSWORD',
    ])
    expect(ROLES).toEqual(['admin', 'approved', 'pending', 'new'])
    expect(ROLE_TAG).toEqual({
      admin: 'e2e-admin',
      approved: 'e2e-approved',
      pending: 'e2e-pending',
      new: 'e2e-new',
    })
  })

  it('AC-002.1: 맞는 값이면 Supabase origin·공개 열쇠·역할 4개 계정을 묶어 돌려준다', () => {
    expect(readE2eEnv(VALID)).toEqual({ ok: true, value: ENV })
  })

  it('AC-002.1: 주소 끝의 /·경로는 떼고 origin만, 주소·열쇠·이메일의 앞뒤 빈칸은 뗀다', () => {
    const result = readE2eEnv(
      withEnv({
        NEXT_PUBLIC_SUPABASE_URL: ' https://abcdefghijklmnopqrst.supabase.co/rest/v1/ ',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ' sb_publishable_fake-key-for-tests\n',
        E2E_ADMIN_EMAIL: ' owner+e2e-admin@example.com ',
      }),
    )
    expect(result).toEqual({ ok: true, value: ENV })
  })

  it('AC-002.1: 비밀번호는 글자 그대로 쓴다(앞뒤를 자르지 않는다)', () => {
    const result = readE2eEnv(withEnv({ E2E_NEW_PASSWORD: ' spaced-password-12345 ' }))
    expect(result.ok && result.value.accounts.new.password).toBe(' spaced-password-12345 ')
  })
})

describe('readE2eEnv — 문제 목록', () => {
  it('AC-002.2: 값이 하나도 없으면 이름마다 "비었어요" 문제 하나씩(10개)', () => {
    const problems = problemsOf({})
    expect(problems).toHaveLength(10)
    E2E_ENV_NAMES.forEach((name, i) => {
      expect(problems[i].startsWith(`${name}:`)).toBe(true)
      expect(problems[i]).toContain('비었어요')
    })
  })

  it('AC-002.2: 빈칸·줄바꿈만 있는 값도 빈 값이다', () => {
    const problems = problemsOf(withEnv({ E2E_PENDING_PASSWORD: '   ', NEXT_PUBLIC_SUPABASE_ANON_KEY: '\n' }))
    expect(problems).toHaveLength(2)
    expect(problems.join('\n')).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY: ')
    expect(problems.join('\n')).toContain('E2E_PENDING_PASSWORD: ')
  })

  it.each([
    ['개발용 로컬 주소', 'http://127.0.0.1:54321'],
    ['http', 'http://abcdefghijklmnopqrst.supabase.co'],
    ['다른 도메인', 'https://example.com'],
    ['supabase.co를 흉내 낸 도메인', 'https://abc.supabase.co.example.com'],
    ['한 단계 더 깊은 호스트', 'https://a.abc.supabase.co'],
    ['포트가 붙음', 'https://abcdefghijklmnopqrst.supabase.co:8443'],
    ['와일드카드', 'https://*.supabase.co'],
    ['주소 아님', 'not a url'],
  ])('AC-002.2: 주소가 실제 https://<ref>.supabase.co가 아니면 문제 (%s)', (_label, url) => {
    const problems = problemsOf(withEnv({ NEXT_PUBLIC_SUPABASE_URL: url }))
    expect(problems).toHaveLength(1)
    expect(problems[0].startsWith('NEXT_PUBLIC_SUPABASE_URL:')).toBe(true)
    expect(problems[0]).toContain('https://<ref>.supabase.co')
  })

  it.each([
    ['새 비밀 열쇠', 'sb_secret_fake-secret-key'],
    [
      'legacy service_role',
      `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"iss":"supabase","role":"service_role"}').toString('base64url')}.c2ln`,
    ],
  ])('AC-002.2: 공개 열쇠 칸에 비밀 열쇠를 넣으면 문제 (%s)', (_label, key) => {
    const problems = problemsOf(withEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: key }))
    expect(problems).toHaveLength(1)
    expect(problems[0].startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY:')).toBe(true)
    expect(problems[0]).toContain('비밀 열쇠')
  })

  it('AC-002.2: legacy anon 열쇠(JWT, role anon)는 받는다', () => {
    const anon = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"iss":"supabase","role":"anon"}').toString('base64url')}.c2ln`
    expect(readE2eEnv(withEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: anon })).ok).toBe(true)
  })

  it.each([
    ['admin', 'E2E_ADMIN_EMAIL', 'e2e-admin'],
    ['approved', 'E2E_APPROVED_EMAIL', 'e2e-approved'],
    ['pending', 'E2E_PENDING_EMAIL', 'e2e-pending'],
    ['new', 'E2E_NEW_EMAIL', 'e2e-new'],
  ])('AC-002.2: %s 이메일 앞부분(@ 앞)에 역할 표시가 없으면 문제', (_role, name, tag) => {
    // 표시가 @ 뒤(도메인)에만 있으면 없는 것이다. 신청 전은 40자 규칙을 지켜 표시 문제만 보이게 한다
    const email = `someone.with.a.long.local.part@${tag}.example.com`
    const problems = problemsOf(withEnv({ [name]: email }))
    expect(problems).toHaveLength(1)
    expect(problems[0].startsWith(`${name}:`)).toBe(true)
    expect(problems[0]).toContain(tag)
  })

  it('AC-002.2: @가 없는 값도 역할 표시가 없는 것으로 본다', () => {
    const problems = problemsOf(withEnv({ E2E_ADMIN_EMAIL: 'owner+e2e-admin' }))
    expect(problems).toHaveLength(1)
    expect(problems[0].startsWith('E2E_ADMIN_EMAIL:')).toBe(true)
  })

  it('AC-002.2: 이메일 4개 가운데 같은 것이 있으면(대소문자 무시) 두 이름을 적은 문제', () => {
    // 두 표시를 다 가진 한 주소라 표시 규칙은 통과하고, 같은 이메일 문제만 남는다
    const problems = problemsOf(
      withEnv({
        E2E_ADMIN_EMAIL: 'owner+e2e-admin+e2e-approved@example.com',
        E2E_APPROVED_EMAIL: 'OWNER+e2e-admin+e2e-approved@EXAMPLE.COM',
      }),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('E2E_ADMIN_EMAIL')
    expect(problems[0]).toContain('E2E_APPROVED_EMAIL')
    expect(problems[0]).toContain('같은 이메일')
  })

  it('AC-002.2: 비밀번호는 16자 이상이어야 한다(15자는 문제, 16자는 통과)', () => {
    const problems = problemsOf(withEnv({ E2E_ADMIN_PASSWORD: 'a'.repeat(15) }))
    expect(problems).toHaveLength(1)
    expect(problems[0].startsWith('E2E_ADMIN_PASSWORD:')).toBe(true)
    expect(problems[0]).toContain('16자')
    expect(readE2eEnv(withEnv({ E2E_ADMIN_PASSWORD: 'a'.repeat(16) })).ok).toBe(true)
  })

  it('AC-002.2: 신청 전 계정 이메일은 40자 이상이어야 한다(39자는 문제, 40자는 통과)', () => {
    const email = (n: number) => `e2e-new${'x'.repeat(n - 19)}@example.com`
    expect(email(39)).toHaveLength(39)
    const problems = problemsOf(withEnv({ E2E_NEW_EMAIL: email(39) }))
    expect(problems).toHaveLength(1)
    expect(problems[0].startsWith('E2E_NEW_EMAIL:')).toBe(true)
    expect(problems[0]).toContain('40자')
    expect(readE2eEnv(withEnv({ E2E_NEW_EMAIL: email(40) })).ok).toBe(true)
  })

  it('AC-002.2: 다른 역할의 이메일은 40자보다 짧아도 된다', () => {
    expect(readE2eEnv(withEnv({ E2E_ADMIN_EMAIL: 'e2e-admin@x.io' })).ok).toBe(true)
  })

  it('AC-002.2: 문제 목록에는 넣은 값이 한 글자도 없다(이름과 무엇이 틀렸는지만)', () => {
    const bad: Record<string, string> = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://qzx-project.example.com/qzxpath',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_qzxsecretkey',
      E2E_ADMIN_EMAIL: 'qzx.admin@qzxmail.com',
      E2E_ADMIN_PASSWORD: 'qzxshort',
      E2E_APPROVED_EMAIL: 'qzx+e2e-approved@qzxmail.com',
      E2E_APPROVED_PASSWORD: 'qzxpw2',
      E2E_PENDING_EMAIL: 'QZX+e2e-approved@QZXMAIL.com',
      E2E_PENDING_PASSWORD: 'qzx3',
      E2E_NEW_EMAIL: 'qzx+e2e-new@qzxmail.com',
      E2E_NEW_PASSWORD: 'qzx-new',
    }
    const problems = problemsOf(bad)
    // 주소·열쇠·관리자 표시·비밀번호 4·대기 표시·같은 이메일·신청 전 40자
    expect(problems.length).toBeGreaterThanOrEqual(10)
    expectNoLeak(problems.join('\n'), Object.values(bad))
    expectNoLeak(startProblemMessage(problems), Object.values(bad))
  })
})

describe('authSettingsProblems — /auth/v1/settings 검사', () => {
  it('AC-002.3: 이메일 켬·확인 켬·익명 끔·새 가입 켬이면 문제 없음', () => {
    expect(authSettingsProblems(settingsResponse())).toEqual([])
  })

  it('AC-002.3: 이메일 로그인이 꺼져 있으면 문제(설정 이름 Email)', () => {
    const problems = authSettingsProblems(settingsResponse({ external: { email: false } }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('이메일 로그인')
    expect(problems[0]).toContain('Email')
  })

  it('AC-002.3: 이메일 확인이 꺼져 있으면(자동 확인) 문제(설정 이름 Confirm email)', () => {
    const problems = authSettingsProblems(settingsResponse({ mailer_autoconfirm: true }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Confirm email')
  })

  it('AC-002.3: 익명 로그인이 켜져 있으면 문제(설정 이름 Anonymous)', () => {
    const problems = authSettingsProblems(settingsResponse({ external: { anonymous_users: true } }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('익명 로그인')
    expect(problems[0]).toContain('Anonymous')
  })

  it('AC-002.3: 새 가입이 꺼져 있으면 문제(구글 새 사용자가 못 들어옴, 설정 이름 Allow new users to sign up)', () => {
    const problems = authSettingsProblems(settingsResponse({ disable_signup: true }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('새 가입')
    expect(problems[0]).toContain('Allow new users to sign up')
  })

  it('AC-002.3: 여럿이 틀리면 모두 돌려준다', () => {
    const problems = authSettingsProblems(
      settingsResponse({
        external: { email: false, anonymous_users: true },
        mailer_autoconfirm: true,
        disable_signup: true,
      }),
    )
    expect(problems).toHaveLength(4)
  })

  it('AC-002.3: 이번에 보지 않는 칸(구글·전화 등)과 모르는 새 칸은 문제로 삼지 않는다', () => {
    expect(authSettingsProblems(settingsResponse({ external: { google: true, phone: true }, phone_autoconfirm: true, extra_new_key: 1 }))).toEqual([])
  })

  it.each([
    ['null', null],
    ['글자', 'ok'],
    ['배열', []],
    ['빈 객체', {}],
    ['external 없음', { disable_signup: false, mailer_autoconfirm: false }],
    ['external이 객체 아님', { ...settingsResponse(), external: true }],
    ['external.email 없음', settingsResponse({ external: { email: undefined } })],
    ['external.anonymous_users가 글자', settingsResponse({ external: { anonymous_users: 'false' } })],
    ['disable_signup 없음', settingsResponse({ disable_signup: undefined })],
    ['mailer_autoconfirm이 숫자', settingsResponse({ mailer_autoconfirm: 0 })],
  ])('AC-002.3: 응답 모양이 다르면 "설정을 읽지 못했어요" 문제 하나 (%s)', (_label, settings) => {
    const problems = authSettingsProblems(JSON.parse(JSON.stringify(settings ?? null)))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('설정을 읽지 못했어요')
  })

  it('AC-002.3: 모양 문제에도 응답 값은 담지 않는다', () => {
    const problems = authSettingsProblems({ external: { email: 'qzx-value' }, disable_signup: 'qzx' })
    expect(problems).toHaveLength(1)
    expectNoLeak(problems.join('\n'), [])
  })
})

describe('checkSupabase — 공개 설정 받아 보기 (fetch 주입)', () => {
  it('AC-002.4: <주소>/auth/v1/settings를 GET + apikey 헤더 + 시간 제한으로 부르고, 설정이 맞으면 문제 없음', async () => {
    const fetchFn = jsonFetch(settingsResponse())
    expect(await checkSupabase(ENV, asFetch(fetchFn))).toEqual([])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [input, init] = fetchFn.mock.calls[0]
    expect(String(input)).toBe('https://abcdefghijklmnopqrst.supabase.co/auth/v1/settings')
    expect(init?.method ?? 'GET').toBe('GET')
    expect(new Headers(init?.headers).get('apikey')).toBe(ENV.anonKey)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('AC-002.4: 설정 문제는 그대로 돌려준다', async () => {
    const problems = await checkSupabase(ENV, asFetch(jsonFetch(settingsResponse({ disable_signup: true }))))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Allow new users to sign up')
  })

  it.each([
    ['연결 실패(주소 틀림)', new TypeError('fetch failed')],
    ['시간 초과(멈춤)', new DOMException('The operation was aborted due to timeout', 'TimeoutError')],
  ])('AC-002.4: 응답이 없으면 "Supabase가 응답하지 않아요" + 다시 켜기 안내 (%s)', async (_label, error) => {
    const fetchFn = vi.fn(async () => {
      throw error
    })
    const problems = await checkSupabase(ENV, asFetch(fetchFn))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Supabase가 응답하지 않아요')
    expect(problems[0]).toContain('다시 켜')
  })

  it('AC-002.4: 열쇠를 받지 않으면(401) 열쇠 이름과 npm run e2e:env 안내', async () => {
    const problems = await checkSupabase(ENV, asFetch(jsonFetch({ message: 'Invalid API key' }, 401)))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('401')
    expect(problems[0]).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    expect(problems[0]).toContain('npm run e2e:env')
  })

  it('AC-002.4: 다른 상태 코드(멈춘 프로젝트 등)는 코드와 다시 켜기 안내', async () => {
    const problems = await checkSupabase(ENV, asFetch(jsonFetch({ message: 'paused' }, 540)))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('540')
    expect(problems[0]).toContain('다시 켜')
  })

  it('AC-002.4: 200인데 JSON이 아니면 "설정을 읽지 못했어요"', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>qzx</html>', { status: 200 }))
    const problems = await checkSupabase(ENV, asFetch(fetchFn))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('설정을 읽지 못했어요')
  })

  it('AC-002.2: 오류·응답 내용과 주소·열쇠는 문제 목록에 담지 않는다', async () => {
    const env: E2eEnv = { ...ENV, supabaseUrl: 'https://qzxprojectref.supabase.co', anonKey: 'sb_publishable_qzxkey' }
    const errorFetch = vi.fn(async () => {
      throw new TypeError('fetch failed: getaddrinfo ENOTFOUND qzxprojectref.supabase.co sb_publishable_qzxkey')
    })
    const statusFetch = jsonFetch({ message: 'qzx bad key sb_publishable_qzxkey' }, 401)
    const otherFetch = jsonFetch({ message: 'qzx' }, 503)
    const all = [
      ...(await checkSupabase(env, asFetch(errorFetch))),
      ...(await checkSupabase(env, asFetch(statusFetch))),
      ...(await checkSupabase(env, asFetch(otherFetch))),
    ]
    expect(all).toHaveLength(3)
    expectNoLeak(all.join('\n'), [env.supabaseUrl, env.anonKey])
  })
})

describe('startProblemMessage — 멈출 때 보이는 글', () => {
  it('AC-002.4: "E2E를 시작하지 못했어요" + 문제 목록 + 고치는 법(npm run e2e:env·Supabase 다시 켜기·설정 이름)', () => {
    const problems = ['E2E_ADMIN_PASSWORD: 16자 이상이어야 해요', 'Supabase가 응답하지 않아요']
    const message = startProblemMessage(problems)
    expect(message.startsWith('E2E를 시작하지 못했어요')).toBe(true)
    for (const p of problems) expect(message).toContain(`- ${p}`)
    expect(message).toContain('npm run e2e:env')
    expect(message).toContain('다시 켜')
    expect(message).toContain('Authentication → Sign In / Providers')
  })

  it('AC-002.4: 빌드·시험을 돌리지 않았다고 말한다(건너뜀으로 통과처럼 보이지 않게)', () => {
    expect(startProblemMessage(['x: 비었어요'])).toContain('빌드와 시험은 돌리지 않았어요')
  })
})

describe('.env.example', () => {
  const text = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')
  const entries = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const eq = line.indexOf('=')
      return { name: line.slice(0, eq), value: line.slice(eq + 1) }
    })

  it('AC-002.5: E2E 값 이름 10개가 값 없이 있다', () => {
    expect(entries.map((e) => e.name).sort()).toEqual([...E2E_ENV_NAMES].sort())
    for (const e of entries) expect(e.value).toBe('')
  })

  it('AC-002.5: service role·비밀 열쇠 이름은 없다', () => {
    for (const e of entries) expect(e.name).not.toMatch(/SERVICE|SECRET/i)
  })
})
