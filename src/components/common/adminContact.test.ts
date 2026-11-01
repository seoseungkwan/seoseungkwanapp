import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminContactEmail } from './adminContact'

// ui-90 REQ-409: 오류·거절 화면의 관리자 메일은 설정값이다. 진짜 주소는 총괄이 환경 변수로 넣고, 코드에는 대체 주소 하나만 둔다
const NAME = 'NEXT_PUBLIC_ADMIN_CONTACT_EMAIL'
const FALLBACK = 'admin@example.com'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AC-409.2 adminContactEmail()', () => {
  it('AC-409.2: 설정값이 메일 모양이면 그 값을 돌려준다', () => {
    vi.stubEnv(NAME, 'office@clinic.example.com')
    expect(adminContactEmail()).toBe('office@clinic.example.com')
  })

  it.each([' office@clinic.example.com', 'office@clinic.example.com  ', '\toffice@clinic.example.com\n'])(
    'AC-409.2: 앞뒤 빈칸(%j)은 빼고 돌려준다',
    (value) => {
      vi.stubEnv(NAME, value)
      expect(adminContactEmail()).toBe('office@clinic.example.com')
    },
  )

  it('AC-409.2: 설정값이 없으면 대체 주소 admin@example.com이다', () => {
    vi.stubEnv(NAME, undefined)
    expect(adminContactEmail()).toBe(FALLBACK)
  })

  it.each(['', ' ', '\n\t '])('AC-409.2: 빈 글(%j)이면 대체 주소다', (value) => {
    vi.stubEnv(NAME, value)
    expect(adminContactEmail()).toBe(FALLBACK)
  })

  it.each([
    'office',
    'office@',
    '@clinic.example.com',
    'office@clinic',
    'office@clinic.',
    'of fice@clinic.example.com',
    'office@@clinic.example.com',
    'a@b@clinic.example.com',
    'office@clinic.example.com other@clinic.example.com',
    'mailto:office@clinic.example.com x',
  ])('AC-409.2: 메일 모양이 아니면(%j) 대체 주소다', (value) => {
    vi.stubEnv(NAME, value)
    expect(adminContactEmail()).toBe(FALLBACK)
  })

  it('AC-409.2: 254자는 그 값을, 255자는 대체 주소를 돌려준다(앞뒤 빈칸은 길이에 넣지 않는다)', () => {
    const at254 = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`
    const at255 = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`
    expect(at254).toHaveLength(254)
    expect(at255).toHaveLength(255)
    vi.stubEnv(NAME, at254)
    expect(adminContactEmail()).toBe(at254)
    vi.stubEnv(NAME, `  ${at254}  `)
    expect(adminContactEmail()).toBe(at254)
    vi.stubEnv(NAME, at255)
    expect(adminContactEmail()).toBe(FALLBACK)
  })
})

// 시험 파일(*.test.ts·*.test.tsx)은 가짜 메일을 써도 된다. 그 밖의 src/ 파일에는 대체 주소 하나만 있어야 한다
const SRC = fileURLToPath(new URL('../..', import.meta.url))
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const BINARY = new Set(['.woff2', '.woff', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico'])
const TEST_FILE = /\.test\.tsx?$/
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (TEST_FILE.test(entry.name) || BINARY.has(extname(entry.name).toLowerCase())) return []
    return [path]
  })
}

describe('AC-409.3 코드 속 메일 주소', () => {
  it('AC-409.3: 시험 파일 밖 src/ 소스의 메일 모양 글자는 adminContact.ts의 admin@example.com 하나뿐이다', () => {
    const found = sourceFiles(SRC).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(EMAIL)].map((m) => `${relative(SRC, file)}: ${m[0]}`),
    )
    expect(found).toEqual([`${join('components', 'common', 'adminContact.ts')}: ${FALLBACK}`])
  })

  it("AC-409.3: docs/UI_GUIDE.md '문구'에 설정값 이름과 대체 주소가 적혀 있다", () => {
    const guide = readFileSync(join(ROOT, 'docs', 'UI_GUIDE.md'), 'utf8')
    const section = guide.split(/^## /m).find((part) => part.startsWith('문구\n')) ?? ''
    expect(section).toContain(NAME)
    expect(section).toContain('adminContactEmail()')
    expect(section).toContain(FALLBACK)
  })
})
