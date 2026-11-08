import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { groupKey } from '@/components/stats/treatmentView'
import { parseSavedReport } from '@/lib/ai/savedReport'
import { addMonths } from '@/lib/analytics/dates'
import { isText } from '@/lib/payload/validate'
import type { AiUsage, AiUsageView, SavedReport } from '@/types/aiReport'

// AI 리포트의 DB 쪽(spec ai-report design.md '저장', spec ai-report-screen design.md '서버', spec ai-report-stats). 숫자 읽는 자리·리포트 저장·사용량 기록·저장된 값 읽기.
// 사용자 세션 클라이언트(경로 route.ts가 만든다)를 인자로 받기만 한다 — 새 클라이언트·service role 키를 만들지 않는다.
// 쓰기는 DB 함수(save_ai_report·add_ai_usage, security definer)로만 한다. 승인 확인·한국 달·모양 검사는 함수와 표 제약이 한다.
// 읽기 조건은 달뿐이다(묶음 표는 조건 없이 읽는다). 병원을 고르는 조건은 넣지 않는다 — RLS가 내 병원 줄만 보여 준다.
// 오류 내용은 버린다(숫자·글자가 섞일 수 있다). 쓰기 실패는 false로만 알리고 흐름(generate.ts)이 E-AI-FAILED로 바꾼다.
// 리포트·사용량 읽기 실패는 'failed'로만, 통계 숫자 읽기 실패는 고정 글의 던짐으로만 알린다

// 세 달은 unknown이다 — DB에서 읽은 것도 믿지 않는다. 검사는 generate.ts가 validateMonthPayload로 한다.
// sections(세 칸 달 합계, spec stats-bit-ai AC-2903.1)도 unknown 그대로 넘기고 generate.ts가 validateMonthSections로 검사한다.
// loadReportMonths는 sections를 늘 채운다(없는 달은 null). 타입만 선택 칸이다 — 이 칸이 없는 값은 세 달 모두 없음으로 본다
export type ReportMonths = {
  selected: unknown | null
  prev: unknown | null
  lastYear: unknown | null
  groupNames: Record<string, string>
  sections?: { selected: unknown | null; prev: unknown | null; lastYear: unknown | null }
}

// 고정 오류 글. 받은 오류 내용은 담지 않는다
const STATS_READ_FAILED = 'stats read failed'
const GROUPS_SHAPE_FAILED = 'stats groups shape failed'

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// 통계 탭이 저장한 숫자(spec ai-report-stats REQ-2001·2002). 읽기 둘을 함께 보낸다:
// ① stats_months의 고른 달·지난달·작년 같은 달 줄(payload·sections는 검사하지 않고 그대로 넘긴다 — generate.ts가 검사한다)
// ② stats_rx_groups의 처방별 추세 묶음 → groupKey(codes) → 이름(처방 코드는 여기서 버린다)
// 읽기가 error를 돌려주거나 던지거나 답 모양이 다르면 고정 글로 던진다(generateReport는 E-AI-FAILED, isReportStale은 false로 바꾼다).
// 달 계산은 addMonths만 쓴다(오늘 날짜를 구하지 않는다). 부를 때마다 새 값을 돌려준다(groupNames를 고쳐도 다음 부름에 번지지 않게)
export async function loadReportMonths(supabase: SupabaseClient, month: string): Promise<ReportMonths> {
  const wanted = [month, addMonths(month, -1), addMonths(month, -12)]
  let monthRows: unknown
  let groupRows: unknown
  try {
    const [months, groups] = await Promise.all([
      supabase.from('stats_months').select('month, payload, sections').in('month', wanted),
      supabase.from('stats_rx_groups').select('name, codes, sort_order'),
    ])
    if (months.error || groups.error) throw new Error(STATS_READ_FAILED)
    monthRows = months.data
    groupRows = groups.data
  } catch {
    throw new Error(STATS_READ_FAILED)
  }
  const [selected, prev, lastYear] = monthsIn(monthRows, wanted)
  return {
    selected: selected.payload,
    prev: prev.payload,
    lastYear: lastYear.payload,
    groupNames: groupNamesOf(groupRows),
    sections: { selected: selected.sections, prev: prev.sections, lastYear: lastYear.sections },
  }
}

type MonthCells = { payload: unknown; sections: unknown }
const NO_MONTH: MonthCells = { payload: null, sections: null }

// 달 줄 → 세 칸(wanted 차례). month가 세 달 가운데 하나인 글자인 줄만 그 달 칸에 넣고, 같은 달이 둘이면 앞 줄을 쓴다.
// 없는 달은 payload·sections 모두 null, 줄에 칸이 없거나 null이면 그 칸만 null
function monthsIn(rows: unknown, wanted: readonly string[]): MonthCells[] {
  if (!Array.isArray(rows)) throw new Error(STATS_READ_FAILED)
  const found = new Map<string, MonthCells>()
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const { month, payload, sections } = row as Record<string, unknown>
    if (typeof month === 'string' && wanted.includes(month) && !found.has(month)) found.set(month, { payload: payload ?? null, sections: sections ?? null })
  }
  return wanted.map((m) => found.get(m) ?? NO_MONTH)
}

type GroupRow = { name: string; codes: string[]; sortOrder: number }

function groupRowOf(row: unknown): GroupRow {
  if (typeof row !== 'object' || row === null) throw new Error(GROUPS_SHAPE_FAILED)
  const { name, codes, sort_order: sortOrder } = row as Record<string, unknown>
  const codesOk = Array.isArray(codes) && codes.every((code) => typeof code === 'string')
  if (typeof name !== 'string' || !codesOk || !Number.isInteger(sortOrder)) throw new Error(GROUPS_SHAPE_FAILED)
  return { name, codes: codes as string[], sortOrder: sortOrder as number }
}

// 묶음 줄 → 열쇠 → 이름. sort_order 작은 차례, 같으면 이름 글자 코드 차례(localeCompare를 쓰지 않는다)로 보고 열쇠마다 처음 이름을 쓴다.
// 처방이 빈 묶음과, 이름이 처방명·동네 이름과 같은 글자 검사(isText)를 못 넘는 묶음(연락처·식별 번호 모양)은 건너뛴다
function groupNamesOf(rows: unknown): Record<string, string> {
  if (!Array.isArray(rows)) throw new Error(GROUPS_SHAPE_FAILED)
  const groups = rows.map(groupRowOf).sort((a, b) => a.sortOrder - b.sortOrder || byText(a.name, b.name))
  const names: Record<string, string> = {}
  for (const group of groups) {
    if (group.codes.length === 0 || !isText(group.name, true)) continue
    const key = groupKey(group.codes)
    if (!Object.hasOwn(names, key)) names[key] = group.name
  }
  return names
}

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
