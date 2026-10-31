import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { E2E_ENV_NAMES } from './env'
import {
  checkEnvValue,
  hiddenKeys,
  runEnvSetup,
  upsertEnvText,
  valueSummary,
  writePrivateFile,
  type EnvSetupDeps,
} from './envFile'

// 가짜 값만 쓴다. 실제 .env.local은 읽지도 쓰지도 않는다.
// 값마다 LEAK 글자를 넣어 두었다 → 출력·질문에 이 글자가 나오면 값이 샌 것이다
const LEAK = 'qzx'
const VALID: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://qzxabcdefghijklmnop.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_qzx-fake-key-for-tests',
  E2E_ADMIN_EMAIL: 'owner+e2e-admin-qzx@example.com',
  E2E_ADMIN_PASSWORD: 'qzx-admin-pass-$#1234',
  E2E_APPROVED_EMAIL: 'owner+e2e-approved-qzx@example.com',
  E2E_APPROVED_PASSWORD: 'qzx-approved-pass-123',
  E2E_PENDING_EMAIL: 'owner+e2e-pending-qzx@example.com',
  E2E_PENDING_PASSWORD: 'qzx-pending-pass-1234',
  E2E_NEW_EMAIL: 'owner.long.address+e2e-new-qzx-wrap@example.com',
  E2E_NEW_PASSWORD: 'qzx-new-pass-12345678',
}
const ALL_ANSWERS = E2E_ENV_NAMES.map((name) => VALID[name])
// 가짜 legacy service_role JWT(서명 없음). 모양만 진짜와 같다
const jwtPart = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const SERVICE_ROLE_JWT = `${jwtPart({ alg: 'HS256', typ: 'JWT' })}.${jwtPart({ role: 'service_role', ref: 'qzx' })}.qzx-fake-signature`
const length = (s: string) => Array.from(s).length

function expectNoLeak(text: string, values: string[] = Object.values(VALID)) {
  expect(text.toLowerCase()).not.toContain(LEAK)
  for (const v of values) expect(text).not.toContain(v)
}

// ask는 준비한 답을 차례로 돌려주고, 다 쓰면 빈 답(= 그대로)을 준다
function fakeDeps(answers: string[], file: string | null, overrides: Partial<EnvSetupDeps> = {}) {
  const asked: string[] = []
  const printed: string[] = []
  const writes: string[] = []
  const queue = [...answers]
  const deps: EnvSetupDeps = {
    ask: async (name) => {
      asked.push(name)
      return queue.shift() ?? ''
    },
    read: () => file,
    write: (text) => {
      writes.push(text)
    },
    print: (line) => {
      printed.push(line)
    },
    ...overrides,
  }
  return { deps, asked, printed, writes, output: () => printed.join('\n') }
}

describe('upsertEnvText', () => {
  it("AC-005.1: 같은 이름 줄만 NAME='값'으로 바꾸고 다른 줄·주석·빈 줄·순서는 그대로 둔다", () => {
    const before = [
      '# 맨 위 주석',
      'OTHER_SETTING=keep-me',
      'NEXT_PUBLIC_SUPABASE_URL=',
      '',
      '# E2E_ADMIN_EMAIL=commented-out',
      'E2E_ADMIN_EMAIL=old@example.com',
      'E2E_ADMIN_EMAIL_OLD=similar-name',
      'XE2E_ADMIN_EMAIL=similar-name',
      'LAST=1',
      '',
    ].join('\n')
    const after = upsertEnvText(before, {
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      E2E_ADMIN_EMAIL: 'new+e2e-admin@example.com',
    })
    expect(after).toBe(
      [
        '# 맨 위 주석',
        'OTHER_SETTING=keep-me',
        "NEXT_PUBLIC_SUPABASE_URL='https://abc.supabase.co'",
        '',
        '# E2E_ADMIN_EMAIL=commented-out',
        "E2E_ADMIN_EMAIL='new+e2e-admin@example.com'",
        'E2E_ADMIN_EMAIL_OLD=similar-name',
        'XE2E_ADMIN_EMAIL=similar-name',
        'LAST=1',
        '',
      ].join('\n'),
    )
  })

  it('AC-005.1: 없는 이름은 넣은 순서대로 끝에 더한다(빈 글·끝 줄바꿈 없는 글도)', () => {
    expect(upsertEnvText('', { A: '1', B: '2' })).toBe("A='1'\nB='2'\n")
    expect(upsertEnvText('X=1', { A: '1' })).toBe("X=1\nA='1'\n")
    expect(upsertEnvText('# c\nX=1\n', { A: '1' })).toBe("# c\nX=1\nA='1'\n")
  })

  it('AC-005.1: 같은 이름 줄이 여럿이면 모두 바꾸고, `export NAME=`·앞뒤 빈칸 줄도 같은 이름으로 본다', () => {
    const before = 'A=old\nexport A=older\n  A = oldest\nB=keep\n'
    expect(upsertEnvText(before, { A: 'new' })).toBe("A='new'\nA='new'\nA='new'\nB=keep\n")
  })

  it('AC-005.1: CRLF 줄 끝은 그대로 두고, 더하는 줄도 같은 줄 끝을 쓴다', () => {
    const before = 'X=1\r\nA=old\r\n'
    expect(upsertEnvText(before, { A: 'new', B: '2' })).toBe("X=1\r\nA='new'\r\nB='2'\r\n")
  })

  it('AC-005.1: 바꿀 것이 없으면 글을 그대로 돌려준다', () => {
    const before = '# c\nX=1\n\nY=2'
    expect(upsertEnvText(before, {})).toBe(before)
  })

  it("AC-005.3: 저장하는 줄은 NAME='값' 꼴이고 process.loadEnvFile과 같은 해석기(parseEnv)로 읽으면 넣은 값 그대로다", () => {
    const value = 'a#b$c"d`e\\n=f 가 😀  inner  space \\ end'
    const text = upsertEnvText('OTHER=1\n', { E2E_ADMIN_PASSWORD: value })
    expect(text).toBe(`OTHER=1\nE2E_ADMIN_PASSWORD='${value}'\n`)
    expect(parseEnv(text)).toEqual({ OTHER: '1', E2E_ADMIN_PASSWORD: value })
  })
})

describe('checkEnvValue', () => {
  it('AC-005.3: 작은따옴표가 들면 quote', () => {
    expect(checkEnvValue("it's")).toBe('quote')
    expect(checkEnvValue("'")).toBe('quote')
  })

  it('AC-005.3: 줄바꿈(\\n·\\r)이 들면 newline', () => {
    expect(checkEnvValue('a\nb')).toBe('newline')
    expect(checkEnvValue('a\rb')).toBe('newline')
    expect(checkEnvValue('a\r\n')).toBe('newline')
  })

  it('AC-005.3: 앞뒤에 빈칸(스페이스·탭)이 있으면 space', () => {
    expect(checkEnvValue(' a')).toBe('space')
    expect(checkEnvValue('a ')).toBe('space')
    expect(checkEnvValue('\ta')).toBe('space')
    expect(checkEnvValue('   ')).toBe('space')
  })

  it('AC-005.3: $·#·큰따옴표·백틱·안쪽 빈칸·한글은 ok', () => {
    expect(checkEnvValue('a$b#c"d`e f 가')).toBe('ok')
    expect(checkEnvValue(VALID.E2E_NEW_EMAIL)).toBe('ok')
  })
})

describe('valueSummary', () => {
  it('AC-005.2: 넣은 이메일은 이름·넣음·글자 수·역할 표시 여부만 보인다', () => {
    const email = VALID.E2E_NEW_EMAIL
    const line = valueSummary('E2E_NEW_EMAIL', email)
    expect(line).toBe(`E2E_NEW_EMAIL: 넣음 (${length(email)}자, e2e-new 표시 있음)`)
    expectNoLeak(line)
  })

  it('AC-005.2: 역할 표시가 @ 앞에 없으면 "표시 없음"(@ 뒤에만 있어도 없음)', () => {
    expect(valueSummary('E2E_ADMIN_EMAIL', 'owner@e2e-admin.example.com')).toBe(
      `E2E_ADMIN_EMAIL: 넣음 (${length('owner@e2e-admin.example.com')}자, e2e-admin 표시 없음)`,
    )
    expect(valueSummary('E2E_PENDING_EMAIL', 'no-at-sign-e2e-pending')).toBe(
      `E2E_PENDING_EMAIL: 넣음 (${length('no-at-sign-e2e-pending')}자, e2e-pending 표시 없음)`,
    )
  })

  it('AC-005.2: 비밀번호·주소·열쇠는 글자 수만 보인다(한글·이모지도 한 글자)', () => {
    expect(valueSummary('E2E_ADMIN_PASSWORD', VALID.E2E_ADMIN_PASSWORD)).toBe(
      `E2E_ADMIN_PASSWORD: 넣음 (${length(VALID.E2E_ADMIN_PASSWORD)}자)`,
    )
    expect(valueSummary('E2E_NEW_PASSWORD', '가나다😀')).toBe('E2E_NEW_PASSWORD: 넣음 (4자)')
    expect(valueSummary('NEXT_PUBLIC_SUPABASE_URL', VALID.NEXT_PUBLIC_SUPABASE_URL)).toBe(
      `NEXT_PUBLIC_SUPABASE_URL: 넣음 (${length(VALID.NEXT_PUBLIC_SUPABASE_URL)}자)`,
    )
    expect(valueSummary('NEXT_PUBLIC_SUPABASE_ANON_KEY', VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY)).toBe(
      `NEXT_PUBLIC_SUPABASE_ANON_KEY: 넣음 (${length(VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY)}자)`,
    )
  })

  it('AC-005.2: 넣지 않은 이름은 "그대로", 원래도 비었으면 "비어 있음"', () => {
    expect(valueSummary('E2E_ADMIN_EMAIL', null)).toBe('E2E_ADMIN_EMAIL: 그대로')
    expect(valueSummary('E2E_ADMIN_EMAIL', null, true)).toBe('E2E_ADMIN_EMAIL: 비어 있음')
  })

  it('AC-005.2: 어떤 값을 넣어도 요약에 값이 나오지 않는다', () => {
    for (const name of E2E_ENV_NAMES) expectNoLeak(valueSummary(name, VALID[name]))
  })
})

describe('hiddenKeys (숨김 입력의 글자 처리)', () => {
  it('AC-005.1: 글자를 모으고 Enter(\\r·\\n)에서 끝난다', () => {
    expect(hiddenKeys('', 'abc')).toMatchObject({ value: 'abc', end: null })
    expect(hiddenKeys('abc', 'de\r')).toMatchObject({ value: 'abcde', end: 'enter' })
    expect(hiddenKeys('', 'x\n')).toMatchObject({ value: 'x', end: 'enter' })
    expect(hiddenKeys('', '\r')).toMatchObject({ value: '', end: 'enter' })
  })

  it('AC-005.1: Enter 뒤 글자는 버린다(여러 줄을 붙여 넣어도 다음 질문으로 넘어가지 않는다)', () => {
    expect(hiddenKeys('', 'first\r\nsecond\nthird')).toMatchObject({ value: 'first', end: 'enter' })
  })

  it('AC-005.1: 지우기는 마지막 한 글자(한글·이모지도 한 글자), Ctrl+U는 모두 지운다', () => {
    expect(hiddenKeys('ab가😀', '\u007f')).toMatchObject({ value: 'ab가', end: null })
    expect(hiddenKeys('ab', '\b\b\b')).toMatchObject({ value: '', end: null })
    expect(hiddenKeys('secret', '\u0015new')).toMatchObject({ value: 'new', end: null })
  })

  it('AC-005.1: Ctrl+C·Ctrl+D는 멈춤(cancel)이고 모은 글자를 돌려주지 않는다', () => {
    expect(hiddenKeys('secret', '\u0003')).toMatchObject({ value: '', end: 'cancel' })
    expect(hiddenKeys('', 'ab\u0004cd')).toMatchObject({ value: '', end: 'cancel' })
  })

  it('AC-005.1: Enter가 \\r\\n으로 나뉘어 오면(폰 SSH 앱) 다음 질문 첫 덩어리 맨 앞 \\n은 버린다', () => {
    // \r이 덩어리 끝이면 afterCr: true → 다음 질문에 넘긴다
    expect(hiddenKeys('', 'abc\r')).toEqual({ value: 'abc', end: 'enter', afterCr: true })
    // \r\n이 한 덩어리로 오면 \n은 이미 버렸으니 넘길 것이 없다
    expect(hiddenKeys('', 'abc\r\n')).toEqual({ value: 'abc', end: 'enter', afterCr: false })
    expect(hiddenKeys('', 'abc\rdef')).toEqual({ value: 'abc', end: 'enter', afterCr: false })
    expect(hiddenKeys('', 'abc\n')).toEqual({ value: 'abc', end: 'enter', afterCr: false })
    // 다음 질문: 맨 앞 \n은 앞 Enter의 나머지 → 빈 답(그대로)이 되지 않는다
    expect(hiddenKeys('', '\n', true)).toEqual({ value: '', end: null, afterCr: false })
    expect(hiddenKeys('', '\nxyz\r', true)).toEqual({ value: 'xyz', end: 'enter', afterCr: true })
    // 앞 답이 \r로 끝나지 않았으면 \n은 그대로 Enter(빈 답 = 그대로)
    expect(hiddenKeys('', '\n', false)).toEqual({ value: '', end: 'enter', afterCr: false })
    // 맨 앞이 아닌 \n은 Enter
    expect(hiddenKeys('', 'x\n', true)).toEqual({ value: 'x', end: 'enter', afterCr: false })
  })

  it('AC-005.1: 방향키 같은 ESC 순서·제어 글자는 값에 들어가지 않는다', () => {
    expect(hiddenKeys('', 'a\u001b[Ab\u001b[1;5Cc\u001bOD\td\u0000')).toMatchObject({ value: 'abcd', end: null })
    expect(hiddenKeys('', '\u001b[200~pasted\u001b[201~')).toMatchObject({ value: 'pasted', end: null })
  })
})

describe('writePrivateFile', () => {
  let dir: string | null = null
  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('AC-005.2: 새 파일을 권한 600으로 만든다', () => {
    dir = mkdtempSync(join(tmpdir(), 'envfile-test-'))
    const path = join(dir, '.env.local')
    writePrivateFile(path, "A='1'\n")
    expect(readFileSync(path, 'utf8')).toBe("A='1'\n")
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readdirSync(dir)).toEqual(['.env.local'])
  })

  it('AC-005.2: 이미 있는 644 파일도 내용을 바꾸고 권한을 600으로 만든다(임시 파일이 남지 않는다)', () => {
    dir = mkdtempSync(join(tmpdir(), 'envfile-test-'))
    const path = join(dir, '.env.local')
    writeFileSync(path, 'OLD=1\n')
    chmodSync(path, 0o644)
    writePrivateFile(path, "NEW='2'\n")
    expect(readFileSync(path, 'utf8')).toBe("NEW='2'\n")
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readdirSync(dir)).toEqual(['.env.local'])
  })

  it('AC-005.2: 바꿔 끼우기에 실패하면 오류를 던지고 임시 파일을 지운다', () => {
    dir = mkdtempSync(join(tmpdir(), 'envfile-test-'))
    // 같은 이름의 비지 않은 폴더가 있으면 rename이 실패한다
    const path = join(dir, '.env.local')
    mkdirSync(path)
    writeFileSync(join(path, 'keep'), 'x')
    expect(() => writePrivateFile(path, "A='1'\n")).toThrow()
    expect(readdirSync(dir)).toEqual(['.env.local'])
    expect(readdirSync(path)).toEqual(['keep'])
  })
})

describe('runEnvSetup', () => {
  it('AC-005.1: REQ-002의 10개 이름을 차례로 묻고, 넣은 값을 .env.local 글에 넣는다', async () => {
    const f = fakeDeps(ALL_ANSWERS, null)
    const code = await runEnvSetup(f.deps)
    expect(f.asked).toEqual([...E2E_ENV_NAMES])
    expect(f.writes).toHaveLength(1)
    expect(parseEnv(f.writes[0])).toEqual(VALID)
    for (const name of E2E_ENV_NAMES) expect(f.writes[0]).toContain(`${name}='${VALID[name]}'\n`)
    expect(code).toBe(0)
  })

  it('AC-005.1: 빈 답이면 그 이름은 그대로 두고, 다른 줄·주석·순서도 그대로다', async () => {
    const before = [
      '# 주석은 남는다',
      ...E2E_ENV_NAMES.map((name) => `${name}='${VALID[name]}'`),
      'OTHER=keep',
      '',
    ].join('\n')
    const newPassword = 'qzx-changed-pass-0001'
    const answers = E2E_ENV_NAMES.map((name) => (name === 'E2E_ADMIN_PASSWORD' ? newPassword : ''))
    const f = fakeDeps(answers, before)
    const code = await runEnvSetup(f.deps)
    expect(f.writes).toEqual([upsertEnvText(before, { E2E_ADMIN_PASSWORD: newPassword })])
    expect(parseEnv(f.writes[0])).toEqual({ ...VALID, E2E_ADMIN_PASSWORD: newPassword, OTHER: 'keep' })
    expect(f.printed).toContain(valueSummary('E2E_ADMIN_PASSWORD', newPassword))
    expect(f.printed).toContain(valueSummary('E2E_ADMIN_EMAIL', null))
    expect(code).toBe(0)
    expectNoLeak(f.output(), [...Object.values(VALID), newPassword])
  })

  it('AC-005.1: 질문 앞에 무엇을 넣는지(공개 열쇠·역할 표시·글자 수 규칙)와 입력이 보이지 않는다는 안내가 나온다', async () => {
    const f = fakeDeps([], null)
    await runEnvSetup(f.deps)
    const out = f.output()
    expect(out).toContain('보이지 않')
    expect(out).toContain('sb_publishable_')
    for (const tag of ['e2e-admin', 'e2e-approved', 'e2e-pending', 'e2e-new']) expect(out).toContain(tag)
    expect(out).toContain('40자')
    expect(out).toContain('16자')
  })

  it('AC-005.3: 작은따옴표·줄바꿈·앞뒤 빈칸 값은 저장하지 않고 이유(값 없이)를 보인 뒤 다시 묻는다', async () => {
    const url = VALID.NEXT_PUBLIC_SUPABASE_URL
    const answers = [`${url}'`, `${url}\nqzx`, ` ${url}`, url]
    const f = fakeDeps(answers, null)
    await runEnvSetup(f.deps)
    expect(f.asked.slice(0, 5)).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ])
    const out = f.output()
    expect(out).toContain('작은따옴표')
    expect(out).toContain('줄바꿈')
    expect(out).toContain('빈칸')
    expect(parseEnv(f.writes[0]).NEXT_PUBLIC_SUPABASE_URL).toBe(url)
    expect(f.writes[0]).not.toContain("'\n'")
    expectNoLeak(out, [...Object.values(VALID), ...answers])
  })

  it('AC-005.2: 결과는 이름마다 넣음·그대로·비어 있음과 글자 수·표시 여부만 보이고 값은 출력하지 않는다', async () => {
    const before = `E2E_ADMIN_EMAIL='${VALID.E2E_ADMIN_EMAIL}'\n`
    const answers = E2E_ENV_NAMES.map((name) =>
      name === 'E2E_ADMIN_EMAIL' || name === 'E2E_ADMIN_PASSWORD' ? '' : VALID[name],
    )
    const f = fakeDeps(answers, before)
    await runEnvSetup(f.deps)
    expect(f.printed).toContain(valueSummary('E2E_ADMIN_EMAIL', null))
    expect(f.printed).toContain(valueSummary('E2E_ADMIN_PASSWORD', null, true))
    expect(f.printed).toContain(valueSummary('E2E_NEW_EMAIL', VALID.E2E_NEW_EMAIL))
    expect(f.printed).toContain(valueSummary('NEXT_PUBLIC_SUPABASE_URL', VALID.NEXT_PUBLIC_SUPABASE_URL))
    expectNoLeak(f.output())
    for (const name of f.asked) expectNoLeak(name)
  })

  it('AC-005.2: 파일이 있으면 바꿀 값이 없어도 다시 써서(권한 600) 두고, 파일도 답도 없으면 만들지 않는다', async () => {
    const before = `OTHER=1\n`
    const kept = fakeDeps([], before)
    await runEnvSetup(kept.deps)
    expect(kept.writes).toEqual([before])

    const none = fakeDeps([], null)
    await runEnvSetup(none.deps)
    expect(none.writes).toEqual([])
  })

  it('AC-005.3: 공개 열쇠 칸에 비밀 열쇠(sb_secret_…·service_role JWT)를 넣으면 저장하지 않고 이유(값 없이)를 보인 뒤 다시 묻는다', async () => {
    const secret = 'sb_secret_qzx-fake-secret-key'
    const answers = E2E_ENV_NAMES.flatMap((name) =>
      name === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' ? [secret, SERVICE_ROLE_JWT, VALID[name]] : [VALID[name]],
    )
    const f = fakeDeps(answers, null)
    const code = await runEnvSetup(f.deps)
    expect(f.asked.filter((name) => name === 'NEXT_PUBLIC_SUPABASE_ANON_KEY')).toHaveLength(3)
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0]).not.toContain(secret)
    expect(f.writes[0]).not.toContain(SERVICE_ROLE_JWT)
    expect(parseEnv(f.writes[0]).NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    expect(f.output()).toContain('비밀 열쇠')
    expect(code).toBe(0)
    expectNoLeak(f.output(), [...Object.values(VALID), secret, SERVICE_ROLE_JWT])
  })

  it('AC-005.3: 비밀 열쇠를 넣었다가 Enter로 넘겨도 비밀 열쇠는 파일에 가지 않는다', async () => {
    const answers = ['', SERVICE_ROLE_JWT, '']
    const f = fakeDeps(answers, `OTHER=1\n`)
    const code = await runEnvSetup(f.deps)
    expect(f.writes).toEqual([`OTHER=1\n`])
    expect(code).not.toBe(0)
    expectNoLeak(f.output(), [SERVICE_ROLE_JWT])
  })

  it('AC-005.3: 프로젝트 주소가 https://<ref>.supabase.co가 아니면 저장하지 않고 다시 묻는다', async () => {
    const bad = ['http://qzxabcdefghij.supabase.co', 'https://qzx.example.com', 'https://qzx.supabase.co:8443']
    const answers = [...bad, ...ALL_ANSWERS]
    const f = fakeDeps(answers, null)
    const code = await runEnvSetup(f.deps)
    expect(f.asked.filter((name) => name === 'NEXT_PUBLIC_SUPABASE_URL')).toHaveLength(4)
    for (const value of bad) expect(f.writes[0]).not.toContain(value)
    expect(parseEnv(f.writes[0]).NEXT_PUBLIC_SUPABASE_URL).toBe(VALID.NEXT_PUBLIC_SUPABASE_URL)
    expect(f.output()).toContain('프로젝트 주소')
    expect(code).toBe(0)
    expectNoLeak(f.output(), [...Object.values(VALID), ...bad])
  })

  it('AC-005.3: 이메일 역할 표시·길이, 비밀번호 길이가 readE2eEnv 규칙에 맞지 않으면 바로 다시 묻는다(이유에 값 없음)', async () => {
    const noTag = 'owner-qzx@example.com'
    const shortNew = 'qzx+e2e-new@example.com' // 40자 미만
    const shortPassword = 'qzx-short'
    const answers = E2E_ENV_NAMES.flatMap((name) => {
      if (name === 'E2E_ADMIN_EMAIL') return [noTag, VALID[name]]
      if (name === 'E2E_NEW_EMAIL') return [shortNew, VALID[name]]
      if (name === 'E2E_ADMIN_PASSWORD') return [shortPassword, VALID[name]]
      return [VALID[name]]
    })
    const f = fakeDeps(answers, null)
    const code = await runEnvSetup(f.deps)
    for (const name of ['E2E_ADMIN_EMAIL', 'E2E_NEW_EMAIL', 'E2E_ADMIN_PASSWORD']) {
      expect(f.asked.filter((asked) => asked === name)).toHaveLength(2)
    }
    expect(parseEnv(f.writes[0])).toEqual(VALID)
    const out = f.output()
    expect(out).toContain('e2e-admin` 표시가 없어요')
    expect(out).toContain('40자 이상')
    expect(out).toContain('16자 이상')
    expect(code).toBe(0)
    expectNoLeak(out, [...Object.values(VALID), noTag, shortNew, shortPassword])
  })

  it('AC-005.4: 다 넣은 뒤 readE2eEnv로 검사해 남은 문제(이름만)를 보이고 0이 아닌 코드로 끝난다', async () => {
    // 남는 문제: 원래 파일의 틀린 값을 그대로 둠 · 비어 있음 · 두 역할에 같은 이메일
    const before = "E2E_ADMIN_EMAIL='owner-qzx@example.com'\n"
    const both = 'owner+e2e-approved-e2e-pending-qzx@example.com'
    const answers = E2E_ENV_NAMES.map((name) => {
      if (name === 'E2E_ADMIN_EMAIL' || name === 'E2E_NEW_PASSWORD') return ''
      if (name === 'E2E_APPROVED_EMAIL' || name === 'E2E_PENDING_EMAIL') return both
      return VALID[name]
    })
    const f = fakeDeps(answers, before)
    const code = await runEnvSetup(f.deps)
    expect(code).not.toBe(0)
    const out = f.output()
    expect(out).toMatch(/E2E_ADMIN_EMAIL: 이메일 앞부분\(@ 앞\)에 `e2e-admin` 표시가 없어요/)
    expect(out).toMatch(/E2E_NEW_PASSWORD: 비었어요/)
    expect(out).toMatch(/E2E_APPROVED_EMAIL·E2E_PENDING_EMAIL: 같은 이메일이에요/)
    expect(out).toContain('npm run e2e:env')
    expectNoLeak(out, [...Object.values(VALID), 'owner-qzx@example.com', both])
  })

  it('AC-005.1: 묻는 중에 멈추면(ask 실패·Ctrl+C) 파일을 쓰지 않는다', async () => {
    let calls = 0
    const f = fakeDeps([], null, {
      ask: async () => {
        calls += 1
        if (calls === 3) throw new Error('cancelled')
        return VALID.NEXT_PUBLIC_SUPABASE_URL
      },
    })
    await expect(runEnvSetup(f.deps)).rejects.toThrow()
    expect(f.writes).toEqual([])
  })

  it('AC-005.4: 문제가 없으면 0으로 끝나고 다 됐다고 알린다', async () => {
    const f = fakeDeps(ALL_ANSWERS, null)
    expect(await runEnvSetup(f.deps)).toBe(0)
    expect(f.output()).toContain('남은 문제 없음')
    expectNoLeak(f.output())
  })

  it('AC-005.2: 저장하지 못하면 오류 내용(값이 섞일 수 있음) 없이 알리고 0이 아닌 코드로 끝난다', async () => {
    const f = fakeDeps(ALL_ANSWERS, null, {
      write: () => {
        throw new Error(`EACCES ${VALID.E2E_ADMIN_PASSWORD}`)
      },
    })
    const code = await runEnvSetup(f.deps)
    expect(code).not.toBe(0)
    expect(f.output()).toContain('저장하지 못했어요')
    expectNoLeak(f.output())
  })

  it('AC-005.1: .env.local을 읽지 못하면 묻지 않고 오류 내용 없이 멈춘다', async () => {
    const f = fakeDeps(ALL_ANSWERS, null, {
      read: () => {
        throw new Error(`EACCES ${VALID.E2E_ADMIN_PASSWORD}`)
      },
    })
    const code = await runEnvSetup(f.deps)
    expect(code).not.toBe(0)
    expect(f.asked).toEqual([])
    expect(f.writes).toEqual([])
    expect(f.output()).toContain('읽지 못했어요')
    expectNoLeak(f.output())
  })

  it('AC-005.1: 바꾸면 다른 이름의 값까지 달라지는 모양(여러 줄 값 안의 같은 이름 줄)이면 저장하지 않는다', async () => {
    const before = 'OTHER="first line\nE2E_ADMIN_EMAIL=inside-quoted-value"\n'
    const answers = E2E_ENV_NAMES.map((name) => (name === 'E2E_ADMIN_EMAIL' ? VALID.E2E_ADMIN_EMAIL : ''))
    const f = fakeDeps(answers, before)
    const code = await runEnvSetup(f.deps)
    expect(code).not.toBe(0)
    expect(f.writes).toEqual([])
    expect(f.output()).toContain('저장하지 않았어요')
    expectNoLeak(f.output())
  })
})
