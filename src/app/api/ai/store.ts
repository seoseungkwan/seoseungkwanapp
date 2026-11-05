import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseSavedReport } from '@/lib/ai/savedReport'
import type { AiUsage, AiUsageView, SavedReport } from '@/types/aiReport'

// AI 리포트의 DB 쪽(spec ai-report design.md '저장', spec ai-report-screen design.md '서버'). 숫자 읽는 자리·리포트 저장·사용량 기록·저장된 값 읽기.
// 사용자 세션 클라이언트(경로 route.ts가 만든다)를 인자로 받기만 한다 — 새 클라이언트·service role 키를 만들지 않는다.
// 쓰기는 DB 함수(save_ai_report·add_ai_usage, security definer)로만 한다. 승인 확인·한국 달·모양 검사는 함수와 표 제약이 한다.
// 읽기는 달 조건 하나뿐이다. 병원을 고르는 조건은 넣지 않는다 — RLS가 내 병원 줄만 보여 준다.
// 오류 내용은 버린다(숫자·글자가 섞일 수 있다). 쓰기 실패는 false로만 알리고 흐름(generate.ts)이 E-AI-FAILED로 바꾼다. 읽기 실패는 'failed'로만 알린다

// 세 달은 unknown이다 — DB에서 읽은 것도 믿지 않는다. 검사는 generate.ts가 validateMonthPayload로 한다
export type ReportMonths = {
  selected: unknown | null
  prev: unknown | null
  lastYear: unknown | null
  groupNames: Record<string, string>
}

// 지금은 DB를 읽지 않고 늘 세 달 모두 "없음"이다 — 앱 경로에 지어낸 숫자를 넣지 않는다(ADR-024, AC-511.6).
// 통계 명세가 months 표 읽기로 바꾼다. 그때 쓸 인자(supabase·month)는 타입에만 두고 지금은 받지 않는다.
// 부를 때마다 새 값을 돌려준다(groupNames를 고쳐도 다음 부름에 번지지 않게)
export const loadReportMonths: (supabase: SupabaseClient, month: string) => Promise<ReportMonths> = async () => ({
  selected: null,
  prev: null,
  lastYear: null,
  groupNames: {},
})

// 그 달 리포트 저장(같은 달은 DB가 덮어쓴다). 넣는 JSON은 { partial, summary, cards }만 —
// 달·지문·모델은 따로 칸이고, createdAt은 DB created_at이 따로 남긴다
export async function saveReport(supabase: SupabaseClient, r: SavedReport): Promise<boolean> {
  return rpcOk(supabase, 'save_ai_report', {
    p_month: r.month,
    p_report: { partial: r.partial, summary: r.summary, cards: r.cards },
    p_input_hash: r.inputHash,
    p_model: r.model,
  })
}

// 이번 달 사용량에 한 번의 부름을 더한다. 달은 DB가 한국 날짜로 정한다(보내지 않는다). 비용은 lib/ai/cost.ts costMicroUsd 값
export async function addUsage(supabase: SupabaseClient, u: AiUsage & { costMicroUsd: number }): Promise<boolean> {
  return rpcOk(supabase, 'add_ai_usage', {
    p_input: u.inputTokens,
    p_output: u.outputTokens,
    p_cost: u.costMicroUsd,
  })
}

// 그 달 저장된 리포트. 줄이 없으면 null. 읽기 오류·던짐·검사를 못 넘는 줄·다른 달 줄은 'failed'
export async function readSavedReport(supabase: SupabaseClient, month: string): Promise<SavedReport | null | 'failed'> {
  try {
    const { data, error } = await supabase
      .from('ai_reports')
      .select('month, report, input_hash, model, created_at')
      .eq('month', month)
      .maybeSingle()
    if (error) return 'failed'
    if (data === null) return null
    const report = parseSavedReport(data)
    return report !== null && report.month === month ? report : 'failed'
  } catch {
    return 'failed'
  }
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

// 이번 달 사용량. 이번 달은 경로가 한국 날짜로 구해 넘긴다. 줄이 없으면 모두 0, tokens는 입력+출력.
// 읽기 오류·던짐·칸이 0 이상 유한한 숫자가 아닌 줄은 'failed'(모양이 틀린 값을 화면에 보내지 않는다)
export async function readUsage(supabase: SupabaseClient, thisMonth: string): Promise<AiUsageView | 'failed'> {
  try {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('calls, input_tokens, output_tokens, cost_micro_usd')
      .eq('month', thisMonth)
      .maybeSingle()
    if (error) return 'failed'
    if (data === null) return { calls: 0, tokens: 0, costMicroUsd: 0 }
    const { calls, input_tokens: input, output_tokens: output, cost_micro_usd: cost } = data as Record<string, unknown>
    if (!isCount(calls) || !isCount(input) || !isCount(output) || !isCount(cost)) return 'failed'
    return { calls, tokens: input + output, costMicroUsd: cost }
  } catch {
    return 'failed'
  }
}

// error가 없으면 true. error가 있거나 부름이 던지면 false(오류 내용은 밖에 내지 않는다)
async function rpcOk(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await supabase.rpc(fn, args)
    return !error
  } catch {
    return false
  }
}
