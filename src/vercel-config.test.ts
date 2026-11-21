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

describe('vercel.json', () => {
  it('AC-009.1: framework는 nextjs, 함수 지역은 icn1 하나, 깃 자동 배포는 꺼져 있다', () => {
    const config = JSON.parse(readText('vercel.json'))
    expect(config.framework).toBe('nextjs')
    expect(config.regions).toEqual(['icn1'])
    expect(config.git?.deploymentEnabled).toBe(false)
  })

  // specs/notices REQ-7416, design 1절·ADR-034: 무료판 Cron은 식마다 하루 한 번(그 시간 안 아무 때). 같은 경로를 아홉 식으로 건다
  const COLLECT = '/api/ai/notices/collect'
  const SCHEDULES = ['0 22 * * *', '0 0 * * *', '0 2 * * *', '0 4 * * *', '0 6 * * *', '0 8 * * *', '0 10 * * *', '0 12 * * *', '0 14 * * *']

  it('AC-7416.4: crons는 모으기 경로 아홉 개(한국 07시대 아침 0 22 + 09~23시대 두 시간마다)다', () => {
    const config = JSON.parse(readText('vercel.json'))
    expect(config.crons).toEqual(SCHEDULES.map((schedule) => ({ path: COLLECT, schedule })))
  })

  it('AC-7416.4: 식마다 하루 한 번(분·시가 숫자 하나, 나머지 *)이고 겹치는 시각이 없다', () => {
    const config = JSON.parse(readText('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const hours = config.crons.map(({ schedule }) => {
      const m = /^0 (\d{1,2}) \* \* \*$/.exec(schedule)
      expect(m, schedule).not.toBeNull()
      const hour = Number(m![1])
      expect(hour).toBeGreaterThanOrEqual(0)
      expect(hour).toBeLessThanOrEqual(23)
      return hour
    })
    expect(new Set(hours).size).toBe(hours.length)
    // 첫 식(아침)은 한국 07시 = UTC 전날 22시
    expect((hours[0] + 9) % 24).toBe(7)
  })

  it('AC-7416.4: 모으기 경로 파일이 있고, 설정 칸은 $schema·framework·regions·git·crons뿐이다', () => {
    expect(readText('src/app/api/ai/notices/collect/route.ts')).toMatch(/export async function GET\b/)
    const config = JSON.parse(readText('vercel.json'))
    expect(Object.keys(config).sort()).toEqual(['$schema', 'crons', 'framework', 'git', 'regions'])
    expect(config.$schema).toBe('https://openapi.vercel.sh/vercel.json')
    expect(config.git).toEqual({ deploymentEnabled: false })
  })
})

describe('.vercelignore', () => {
  it('AC-009.2: 비밀값·시험 산출물·개발 전용 파일·실제 EMR 파일 모양을 올리지 않는다', () => {
    expect(ignoreLines()).toEqual([
      '.env*',
      ...EMR_PATTERNS,
      '!public/fake-sample/bit-sample.csv',
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

  it('AC-009.2: 되살리기는 가짜 파일 폴더의 파일 이름 하나하나뿐이고 확장자 줄보다 뒤에 있다', () => {
    const lines = ignoreLines()
    const lastEmr = Math.max(...EMR_PATTERNS.map((pattern) => lines.indexOf(pattern)))
    const reincludes = lines.flatMap((line, index) => (line.startsWith('!') ? [{ line, index }] : []))
    expect(reincludes.length).toBeGreaterThan(0)
    for (const { line, index } of reincludes) {
      const path = line.slice(1)
      expect(FAKE_FOLDERS.some((folder) => path.startsWith(folder))).toBe(true)
      expect(path).not.toMatch(/[*?[\]]/)
      expect(index).toBeGreaterThan(lastEmr)
    }
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
