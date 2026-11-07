import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// 대시보드가 불러오는 코드의 울타리(dashboard-ux AC-2707.6). 공통으로 뽑아 쓰다가 통계 화면·AI 리포트 화면 코드가 대시보드에 딸려 오지 않게 한다.
// AI 요약은 브라우저 부르기(reportClient)와 순수 글자 함수(lib/ai/reportScreen·markdown)만 쓰고, AI 리포트 화면 부품은 쓰지 않는다

const ROOT = process.cwd()
const DIR = join(ROOT, 'src/components/dashboard')
const sources = () =>
  readdirSync(DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => f.split(sep).join('/'))
const code = (file: string) =>
  readFileSync(join(DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
const importsOf = (file: string) => [...code(file).matchAll(/^import\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!)

const HEAVY = [
  /^@\/components\/stats\/sections(?:\/|$)/,
  /^@\/components\/stats\/StatsScreen$/,
  /^@\/components\/ai-report\/(?:AiReportScreen|ReportBody|RedoDialog|UsageAside)$/,
]

describe('대시보드 불러오기 울타리 (AC-2707.6)', () => {
  it('AC-2707.6: 검사할 파일이 있다(AI 요약·분석 두 구역 포함)', () => {
    const files = sources()
    for (const file of ['ai/AiBrief.tsx', 'ai/useAiBrief.ts', 'summary/DailySection.tsx', 'summary/FlowSection.tsx', 'live/BitDashboard.tsx']) expect(files).toContain(file)
  })

  it('AC-2707.6: components/dashboard/**는 통계 화면 구역(stats/sections·StatsScreen)과 AI 리포트 화면 부품(AiReportScreen·ReportBody·RedoDialog·UsageAside)을 불러오지 않는다', () => {
    const found = sources().flatMap((file) => importsOf(file).filter((from) => HEAVY.some((rule) => rule.test(from))).map((from) => `${file}: ${from}`))
    expect(found).toEqual([])
  })

  it('AC-2707.6: AI 쪽은 reportClient · lib/ai/reportScreen · lib/ai/markdown만 불러온다', () => {
    const ai = sources().flatMap((file) =>
      importsOf(file)
        .filter((from) => from.startsWith('@/components/ai-report') || from.startsWith('@/lib/ai/'))
        .map((from) => from),
    )
    expect(ai.length).toBeGreaterThan(0)
    expect([...new Set(ai)].sort()).toEqual(expect.arrayContaining(['@/components/ai-report/reportClient']))
    for (const from of ai) expect(['@/components/ai-report/reportClient', '@/lib/ai/reportScreen', '@/lib/ai/markdown']).toContain(from)
  })
})
