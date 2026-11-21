// Vercel 설정 파일(vercel.json·.vercelignore)을 읽어 본다. Vercel CLI는 돌리지 않는다.
// CLI 배포는 내 폴더 파일을 그대로 올리므로 .vercelignore가 비밀값·실제 EMR 파일을 막는 마지막 울타리다
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const readText = (file: string) => readFileSync(new URL(file, root), 'utf8')

// 주석·빈 줄을 뺀 실제 규칙 줄
const ignoreLines = () =>
  readText('.vercelignore')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))

// 실제 EMR 파일 모양. .gitignore처럼 확장자 대소문자를 가리지 않는다(Windows에서 온 REAL.XLS 등)
const EMR_PATTERNS = ['*.[cC][sS][vV]', '*.[xX][lL][sS]', '*.[xX][lL][sS][xX]']

// 가짜 파일 폴더. 되살리기(!)는 이 안의 파일 이름 하나하나만 된다
const FAKE_FOLDERS = ['fixtures/fake-', 'public/fake-sample/']
// 가짜 파일 폴더 밖에서 되살리는 것은 직원 탭 엑셀 양식 파일 하나뿐이다(지어낸 보기 줄만, 운영 사이트에서 내려받음 — spec staff AC-7612.4)
const STAFF_TEMPLATE = 'public/staff/staff-template.xlsx'

describe('vercel.json', () => {
  it('AC-009.1: framework는 nextjs, 함수 지역은 icn1 하나, 깃 자동 배포는 꺼져 있다', () => {
    const config = JSON.parse(readText('vercel.json'))
    expect(config.framework).toBe('nextjs')
    expect(config.regions).toEqual(['icn1'])
    expect(config.git?.deploymentEnabled).toBe(false)
  })
})

describe('.vercelignore', () => {
  it('AC-009.2·AC-7612.4: 비밀값·시험 산출물·개발 전용 파일·실제 EMR 파일 모양을 올리지 않는다(직원 엑셀 양식 파일 하나만 되살림)', () => {
    expect(ignoreLines()).toEqual([
      '.env*',
      ...EMR_PATTERNS,
      '!public/fake-sample/bit-sample.csv',
      `!${STAFF_TEMPLATE}`,
      '.harness/',
      '.claude/',
      'specs/',
      'phases/',
      'scripts/',
      'plan*.md',
      'e2e/',
      'playwright.config.ts',
      '__pycache__/',
      '.pytest_cache/',
      '.vercel/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      'blob-report/',
    ])
  })

  it('AC-009.2: .env를 되살리는 줄(!.env…)이 없다', () => {
    const lines = ignoreLines()
    expect(lines).toContain('.env*')
    expect(lines.filter((line) => /^!\s*\/?\.env/.test(line))).toEqual([])
  })

  it('AC-009.2·AC-7612.4: 되살리기는 가짜 파일 폴더의 파일 이름 하나하나와 직원 엑셀 양식 파일 하나뿐이고 확장자 줄보다 뒤에 있다(환자 엑셀 막기는 그대로)', () => {
    const lines = ignoreLines()
    for (const pattern of EMR_PATTERNS) expect(lines).toContain(pattern)
    const lastEmr = Math.max(...EMR_PATTERNS.map((pattern) => lines.indexOf(pattern)))
    const reincludes = lines.flatMap((line, index) => (line.startsWith('!') ? [{ line, index }] : []))
    expect(reincludes.length).toBeGreaterThan(0)
    for (const { line, index } of reincludes) {
      const path = line.slice(1)
      expect(path === STAFF_TEMPLATE || FAKE_FOLDERS.some((folder) => path.startsWith(folder)), path).toBe(true)
      expect(path).not.toMatch(/[*?[\]]/)
      expect(index).toBeGreaterThan(lastEmr)
    }
    // 가짜 파일 폴더 밖 되살리기 = 양식 파일 이름 그대로 한 줄(폴더·글롭으로 넓히지 않는다)
    const outside = reincludes.map(({ line }) => line.slice(1)).filter((path) => !FAKE_FOLDERS.some((folder) => path.startsWith(folder)))
    expect(outside).toEqual([STAFF_TEMPLATE])
  })

  it('AC-009.2: e2e/를 빼면 그것을 import하는 playwright.config.ts도 함께 뺀다(Vercel 빌드 타입 검사가 깨지지 않게)', () => {
    const lines = ignoreLines()
    expect(lines).toContain('e2e/')
    expect(lines).toContain('playwright.config.ts')
  })

  it('next build에 필요한 파일·폴더는 빼지 않는다', () => {
    const lines = ignoreLines().map((line) => line.replace(/^\//, '').replace(/\/$/, ''))
    for (const needed of [
      'src',
      'public',
      'package.json',
      'package-lock.json',
      'next.config.ts',
      'postcss.config.mjs',
      'tsconfig.json',
      'next-env.d.ts',
      'vercel.json',
      '*.ts',
      '*.tsx',
      '*.json',
    ]) {
      expect(lines).not.toContain(needed)
    }
  })
})
