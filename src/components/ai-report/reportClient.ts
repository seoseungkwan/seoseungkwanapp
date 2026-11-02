import { parseShownReport } from '@/lib/ai/savedReport'
import type { AiErrorCode, AiUsageView, ReportView, ShownReport } from '@/types/aiReport'

// 브라우저에서 /api/ai/report 부르기(spec ai-report-screen design.md '브라우저'). 두 함수는 던지지 않고 결과를 값으로 돌려준다.
// redirect: 'manual' — 로그인이 끊겨 middleware가 /login으로 보내는 답을 따라가지 않고 reauth로 돌려준다. 페이지 다시 읽기는 화면의 일이다

export type Reauth = { kind: 'reauth' }
export type LoadResult = { kind: 'ok'; view: ReportView } | { kind: 'error'; code: 'E-AI-READ' } | Reauth
export type AnalyzeResult = { kind: 'ok'; report: ShownReport } | { kind: 'error'; code: AiErrorCode } | Reauth

type Fields = Record<string, unknown>

const REPORT_PATH = '/api/ai/report'
const AI_CODES: readonly unknown[] = ['E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED', 'E-AI-NO-DATA'] satisfies AiErrorCode[]

const REAUTH: Reauth = { kind: 'reauth' }
const READ_FAILED: LoadResult = { kind: 'error', code: 'E-AI-READ' }
const BUSY: AnalyzeResult = { kind: 'error', code: 'E-AI-BUSY' }
const FAILED: AnalyzeResult = { kind: 'error', code: 'E-AI-FAILED' }

const isAiCode = (value: unknown): value is AiErrorCode => AI_CODES.includes(value)

const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

// 진짜 브라우저는 redirect: 'manual'의 돌려보내는 답을 type: 'opaqueredirect', status: 0으로 준다. 3xx 숫자만 보면 놓친다. 몸통을 읽기 전에 본다
const needsReauth = ({ type, status }: Response): boolean =>
  type === 'opaqueredirect' || status === 401 || status === 403 || (status >= 300 && status < 400)

// 배열·null이 아닌 객체
function fieldsOf(value: unknown): Fields | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : null
}

// JSON.parse는 undefined를 돌려주는 일이 없으니 undefined = JSON이 아님. JSON null과 가른다
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function usageOf(value: unknown): AiUsageView | null {
  const o = fieldsOf(value)
  if (o === null) return null
  const { calls, tokens, costMicroUsd } = o
  return isAmount(calls) && isAmount(tokens) && isAmount(costMicroUsd) ? { calls, tokens, costMicroUsd } : null
}

function viewOf(body: unknown): ReportView | null {
  const o = fieldsOf(body)
  if (o === null || typeof o.stale !== 'boolean') return null
  const usage = usageOf(o.usage)
  if (usage === null) return null
  if (o.report === null) return { report: null, stale: o.stale, usage }
  const report = parseShownReport(o.report)
  return report === null ? null : { report, stale: o.stale, usage }
}

export async function loadMonth(month: string): Promise<LoadResult> {
  try {
    const response = await fetch(`${REPORT_PATH}?month=${encodeURIComponent(month)}`, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
    })
    if (needsReauth(response)) return REAUTH
    if (response.status !== 200) return READ_FAILED
    const view = viewOf(await response.json())
    return view === null ? READ_FAILED : { kind: 'ok', view }
  } catch {
    return READ_FAILED
  }
}

// 판정 순서(spec step 2): 끊김은 부른 쪽 catch → AI 번호 → 200 리포트 → 5xx의 빈·JSON 아닌 몸통 → 나머지
function analyzeResultOf(status: number, text: string): AnalyzeResult {
  const body = jsonOf(text)
  const fields = fieldsOf(body)
  const code = fields?.code
  if (isAiCode(code)) return { kind: 'error', code }
  if (status === 200) {
    const report = parseShownReport(fields?.report)
    if (report !== null) return { kind: 'ok', report }
  }
  return status >= 500 && status < 600 && body === undefined ? BUSY : FAILED
}

export async function analyzeMonth(month: string): Promise<AnalyzeResult> {
  try {
    const response = await fetch(REPORT_PATH, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month }),
    })
    if (needsReauth(response)) return REAUTH
    return analyzeResultOf(response.status, await response.text())
  } catch {
    return BUSY
  }
}
