import 'server-only'
import { buildReportInput, reportFingerprint } from '@/lib/ai/input'
import { costMicroUsd } from '@/lib/ai/cost'
import { parseAiReport } from '@/lib/ai/output'
import { reportJsonSchema, systemPrompt, userMessage } from '@/lib/ai/prompt'
import { addMonths } from '@/lib/analytics/dates'
import { validateMonthPayload } from '@/lib/payload/validate'
import type { AiErrorCode, AiUsage, SavedReport } from '@/types/aiReport'
import type { callClaude } from './claude'
import type { ReportMonths } from './store'

// 리포트 만들기 흐름(spec ai-report design.md '만들기 흐름', REQ-511).
// DB·Claude·시각은 모두 deps로만 받는다. 오류 내용은 버리고 번호만 돌려준다(이 파일은 console을 쓰지 않는다)

export type GenerateDeps = {
  loadMonths(month: string): Promise<ReportMonths>
  callClaude: typeof callClaude
  saveReport(r: SavedReport): Promise<boolean>
  addUsage(u: AiUsage & { costMicroUsd: number }): Promise<boolean>
  now(): Date
}

export type GenerateResult = { ok: true; report: SavedReport; usage: AiUsage } | { ok: false; code: AiErrorCode }

const FAILED: GenerateResult = { ok: false, code: 'E-AI-FAILED' }

// deps 호출이 던지면 false(실패)로 본다
async function attempt(run: () => Promise<boolean>): Promise<boolean> {
  try {
    return (await run()) === true
  } catch {
    return false
  }
}

// 세 달 읽기 → 검사 → 입력 → 지문. 리포트 만들기와 숫자 바뀜 비교가 함께 쓴다(따로 만들면 지문이 어긋난다, spec ai-report-screen design.md).
// 받은 자료의 month가 요청한 달·한 달 전·12달 전과 맞는 것만 쓴다(안 맞는 비교 달은 없는 달). 고른 달을 못 쓰면 null, 던지는 것은 부르는 쪽이 받는다
async function currentInput(month: string, loadMonths: GenerateDeps['loadMonths']) {
  const checked = (value: unknown, expected: string) => {
    const payload = validateMonthPayload(value)
    return payload !== null && payload.month === expected ? payload : null
  }
  const months = await loadMonths(month)
  const selected = checked(months.selected, month)
  if (selected === null) return null
  const input = buildReportInput({
    selected,
    prev: checked(months.prev, addMonths(month, -1)),
    lastYear: checked(months.lastYear, addMonths(month, -12)),
    groupNames: months.groupNames,
  })
  return { input, inputHash: await reportFingerprint(input) }
}

// 저장한 리포트의 숫자가 지금 숫자와 다른지 본다(REQ-705). 모르면 false — "바뀌었어요"라고 하지 않고 리포트 보기를 막지 않는다
export async function isReportStale(
  month: string,
  savedHash: string,
  loadMonths: (month: string) => Promise<ReportMonths>,
): Promise<boolean> {
  try {
    const current = await currentInput(month, loadMonths)
    return current !== null && current.inputHash !== savedHash
  } catch {
    return false
  }
}

export async function generateReport(month: string, deps: GenerateDeps): Promise<GenerateResult> {
  // 1~3. 숫자 읽기와 검사 → 입력 → 지시문 → Claude. Claude를 부르기 전 단계에서 던지면 부르지 않고 FAILED
  let current
  let res
  try {
    current = await currentInput(month, (m) => deps.loadMonths(m))
    if (current === null) return { ok: false, code: 'E-AI-NO-DATA' }
    res = await deps.callClaude({ system: systemPrompt(), user: userMessage(current.input), schema: reportJsonSchema() })
  } catch {
    return FAILED
  }
  const { input, inputHash } = current

  // 4. Claude 오류: 사용량이 있으면 기록(실패하면 FAILED), 없으면 기록 없이 그 번호
  if (!res.ok) {
    const usage = res.usage
    if (usage !== null && !(await attempt(() => deps.addUsage({ ...usage, costMicroUsd: costMicroUsd(usage) })))) {
      return FAILED
    }
    return { ok: false, code: res.code }
  }

  const usage = res.usage
  const recordUsage = () => attempt(() => deps.addUsage({ ...usage, costMicroUsd: costMicroUsd(usage) }))

  // 5. 답 검사: null이면 저장하지 않고 사용량만 기록
  let parsed
  try {
    parsed = parseAiReport(res.text, input)
  } catch {
    parsed = null
  }
  if (parsed === null) {
    await recordUsage()
    return FAILED
  }

  // 6~7. 저장 → 사용량 기록(저장이 실패해도 비용은 기록한다)
  let createdAt: string
  try {
    createdAt = deps.now().toISOString()
  } catch {
    await recordUsage()
    return FAILED
  }
  const report: SavedReport = {
    month,
    partial: input.partial,
    summary: parsed.summary,
    cards: parsed.cards,
    model: usage.model,
    inputHash,
    createdAt,
  }
  const saved = await attempt(() => deps.saveReport(report))
  const recorded = await recordUsage()
  if (!saved || !recorded) return FAILED

  // 8.
  return { ok: true, report, usage }
}
