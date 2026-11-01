import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { callClaude } from '../src/app/api/ai/claude'
import { generateReport } from '../src/app/api/ai/generate'
import { costMicroUsd } from '../src/lib/ai/cost'
import { reportMarkdown } from '../src/lib/ai/markdown'
import { isMonth } from '../src/lib/analytics/dates'
import { errorInfo } from '../src/lib/errors'
import type { AiUsage, SavedReport } from '../src/types/aiReport'
import { fakeMonthsLoader, missingKeyMessage, resultFileName } from './aiTry'

// npm run ai:try — 가짜 숫자로 진짜 Claude를 불러 리포트를 .ai-try/에 Markdown으로 쓴다(TASK-15).
// DB·Supabase에 닿지 않는다(저장·사용량은 메모리 배열). 열쇠는 있는지만 보고 찍지 않는다

async function main(): Promise<number> {
  const at = process.argv.indexOf('--month')
  const month = at >= 0 ? (process.argv[at + 1] ?? '') : '2026-10'
  if (!isMonth(month)) {
    console.log('달은 YYYY-MM 모양으로 적어 주세요. 예: npm run ai:try -- --month 2026-10')
    return 1
  }

  const missing = missingKeyMessage(process.env)
  if (missing !== null) {
    console.log(missing)
    return 1
  }

  const saved: SavedReport[] = []
  const used: Array<AiUsage & { costMicroUsd: number }> = []
  const result = await generateReport(month, {
    loadMonths: fakeMonthsLoader('fixtures/fake-ai'),
    callClaude,
    saveReport: async (r) => (saved.push(r), true),
    addUsage: async (u) => (used.push(u), true),
    now: () => new Date(),
  })

  if (!result.ok) {
    const info = errorInfo(result.code)
    console.log(`${info.what} (${result.code})`)
    console.log(info.fix)
    return 1
  }

  const dir = '.ai-try'
  mkdirSync(dir, { recursive: true })
  const file = join(dir, resultFileName(month, new Date()))
  writeFileSync(file, reportMarkdown(result.report, result.usage), 'utf8')
  const micro = costMicroUsd(result.usage)
  console.log(`리포트를 썼어요: ${file}`)
  console.log(`비용 약 $${(micro / 1_000_000).toFixed(6)}`)
  return 0
}

main().then(
  (code) => {
    process.exitCode = code
  },
  () => {
    console.log('예상하지 못한 오류로 끝났어요. 다시 시도해 주세요.')
    process.exitCode = 1
  },
)
