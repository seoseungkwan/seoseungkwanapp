// E2E 실행 틀(Playwright 설정·package.json·Vitest 범위·.gitignore)을 본다.
// 설정 값만 읽는다: Playwright·서버·브라우저를 띄우지 않고 .env.local도 읽지 않는다
import { readFileSync } from 'node:fs'
import { matchesGlob } from 'node:path'
import { describe, expect, it } from 'vitest'
import vitestConfig from '../vitest.config'

const root = new URL('../', import.meta.url)
const readText = (file: string) => readFileSync(new URL(file, root), 'utf8')
const readJson = (file: string) => JSON.parse(readText(file))

// 구현 전에도 시험마다 자기 이유로 실패하게 설정은 시험 안에서 불러온다
const loadConfig = () => import('./config')

const SPEC = 'e2e/auth-flow.spec.ts'
const UNIT_TESTS = ['e2e/config.test.ts', 'e2e/lib/env.test.ts']

describe('E2E 실행 틀', () => {
  it('AC-001.1: Vitest는 e2e/**/*.spec.ts를 찾지 않고 e2e 아래 *.test.ts만 돈다', () => {
    const include = vitestConfig.test?.include ?? []
    const caught = (file: string) => include.some((pattern) => matchesGlob(file, pattern))
    expect(caught(SPEC)).toBe(false)
    expect(caught('e2e/lib/session.spec.ts')).toBe(false)
    for (const file of UNIT_TESTS) expect(caught(file)).toBe(true)
  })

  it('AC-001.1: e2e/config.ts는 @playwright/test를 type import만 한다(Vitest에서 Playwright 런타임이 돌지 않게)', () => {
    const source = readText('e2e/config.ts')
    const imports = source.split('\n').filter((line) => /^\s*import\b/.test(line))
    const playwright = imports.filter((line) => line.includes('@playwright/test'))
    expect(playwright.length).toBeGreaterThan(0)
    for (const line of playwright) expect(line).toMatch(/^\s*import type\b/)
  })

  it('AC-001.2: Playwright는 e2e 폴더의 *.spec.ts만 고른다', async () => {
    const { e2eConfig } = await loadConfig()
    expect(e2eConfig.testDir).toBe('e2e')
    const match = e2eConfig.testMatch
    expect(match).toBeInstanceOf(RegExp)
    const pattern = match as RegExp
    expect(pattern.test(SPEC)).toBe(true)
    for (const file of UNIT_TESTS) expect(pattern.test(file)).toBe(false)
  })

  it('AC-001.2: next start를 127.0.0.1:3100에만 띄우고 baseURL이 같은 주소이며 떠 있는 서버를 다시 쓰지 않는다', async () => {
    const { APP_HOST, APP_PORT, APP_ORIGIN, e2eConfig } = await loadConfig()
    expect(APP_HOST).toBe('127.0.0.1')
    expect(APP_PORT).toBe(3100)
    expect(APP_ORIGIN).toBe('http://127.0.0.1:3100')
    expect(e2eConfig.use?.baseURL).toBe(APP_ORIGIN)
    expect(e2eConfig.webServer).toEqual({
      command: 'npx next start -H 127.0.0.1 -p 3100',
      url: 'http://127.0.0.1:3100/login',
      reuseExistingServer: false,
      timeout: 120_000,
    })
    expect(JSON.stringify(e2eConfig)).not.toContain('0.0.0.0')
  })

  it('AC-001.2: npm run e2e는 시작 전 검사 → next build → playwright test 순서이고 앞 단계가 실패하면 멈춘다', () => {
    const { scripts } = readJson('package.json')
    expect(scripts.e2e).toBe('tsx e2e/preflight.ts && next build && playwright test')
  })

  it('AC-001.3: trace·영상·스크린샷이 꺼져 있고 HAR 기록이 없다', async () => {
    const { e2eConfig } = await loadConfig()
    expect(e2eConfig.use).toMatchObject({ trace: 'off', video: 'off', screenshot: 'off' })
    const all = JSON.stringify(e2eConfig)
    expect(all).not.toMatch(/recordHar|recordVideo|contextOptions/)
    for (const project of e2eConfig.projects ?? []) {
      expect(project.use ?? {}).not.toHaveProperty('trace')
      expect(project.use ?? {}).not.toHaveProperty('video')
      expect(project.use ?? {}).not.toHaveProperty('screenshot')
    }
  })

  it('AC-001.3: 보고는 글자(list)만이고 한 줄로 차례대로 한 번씩 돈다', async () => {
    const { e2eConfig } = await loadConfig()
    expect(e2eConfig.reporter).toEqual([['list']])
    expect(e2eConfig.workers).toBe(1)
    expect(e2eConfig.fullyParallel).toBe(false)
    expect(e2eConfig.forbidOnly).toBe(true)
    expect(e2eConfig.retries).toBe(0)
    expect(e2eConfig.projects).toEqual([{ name: 'chromium', use: { browserName: 'chromium' } }])
  })

  it('AC-001.3: playwright.config.ts는 e2eConfig를 덮어쓰지 않고 그대로 쓴다', () => {
    const source = readText('playwright.config.ts')
    expect(source).toContain('export default defineConfig(e2eConfig)')
    expect(source).not.toMatch(/trace|video|screenshot|reporter|recordHar|webServer/)
  })

  it('AC-001.4: Playwright 산출물 폴더가 .gitignore에 있다', () => {
    const lines = readText('.gitignore')
      .split('\n')
      .map((line) => line.trim())
    for (const folder of ['test-results/', 'playwright-report/', 'blob-report/']) expect(lines).toContain(folder)
  })

  it('AC-001.5: @playwright/test가 devDependencies에 1.64.1로 고정이고 test 스크립트는 vitest run 그대로다', () => {
    const pkg = readJson('package.json')
    expect(pkg.devDependencies['@playwright/test']).toBe('1.64.1')
    expect(pkg.dependencies?.['@playwright/test']).toBeUndefined()
    expect(pkg.scripts.test).toBe('vitest run')
    expect(pkg.scripts.e2e).toBeDefined()
    const lock = readJson('package-lock.json')
    expect(lock.packages['node_modules/@playwright/test'].version).toBe('1.64.1')
  })
})
