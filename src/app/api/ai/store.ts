import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { groupKey } from '@/components/stats/treatmentView'
import { parseSavedReport } from '@/lib/ai/savedReport'
import type { UisReportRaw } from '@/lib/ai/uisInput'
import { addMonths, monthRange } from '@/lib/analytics/dates'
import { isText } from '@/lib/payload/validate'
import type { AiUsage, AiUsageView, SavedReport } from '@/types/aiReport'
import { DEFAULT_HONORIFIC, HONORIFICS, type Honorific } from '@/types/clinicProfile'
import type { RxCond } from '@/types/rxGroups'

// AI 리포트의 DB 쪽(spec ai-report design.md '저장', spec ai-report-screen design.md '서버', spec ai-report-stats). 숫자 읽는 자리·리포트 저장·사용량 기록·저장된 값 읽기.
// 사용자 세션 클라이언트(경로 route.ts가 만든다)를 인자로 받기만 한다 — 새 클라이언트·service role 키를 만들지 않는다.
// 쓰기는 DB 함수(save_ai_report·add_ai_usage, security definer)로만 한다. 승인 확인·한국 달·모양 검사는 함수와 표 제약이 한다.
// 읽기 조건은 달뿐이다(묶음 표는 조건 없이 읽는다). 병원을 고르는 조건은 넣지 않는다 — RLS가 내 병원 줄만 보여 준다.
// 오류 내용은 버린다(숫자·글자가 섞일 수 있다). 쓰기 실패는 false로만 알리고 흐름(generate.ts)이 E-AI-FAILED로 바꾼다.
// 리포트·사용량 읽기 실패는 'failed'로만, 통계 숫자 읽기 실패는 고정 글의 던짐으로만 알린다.
// 의사랑 의원(specs/uisarang-upload REQ-8816, design.md §10-5): 고른 달 stats_months 줄이 없을 때만 의사랑 날 줄을 먼저 보고, 있으면 세 달 의사랑 표를 읽어 uis에 둔다.
// 판정은 EMR이 아니라 자료로 한다 — 비트 의원의 빈 달은 stats_days를 한 번 더 읽고 지금처럼 '자료 없음'이다

export type { UisReportRaw }

// 세 달은 unknown이다 — DB에서 읽은 것도 믿지 않는다. 검사는 generate.ts가 validateMonthPayload로 한다.
// sections(세 칸 달 합계, spec stats-bit-ai AC-2903.1)도 unknown 그대로 넘기고 generate.ts가 validateMonthSections로 검사한다.
// loadReportMonths는 sections를 늘 채운다(없는 달은 null). 타입만 선택 칸이다 — 이 칸이 없는 값은 세 달 모두 없음으로 본다
// uis(의사랑 세 달 줄, 검사 전)는 고른 달 stats_months 줄이 없고 그 달 의사랑 날 줄이 있을 때만 있다. 검사는 generate.ts가 validateUisReportMonths로 한다
export type ReportMonths = {
  selected: unknown | null
  prev: unknown | null
  lastYear: unknown | null
  groupNames: Record<string, string>
  sections?: { selected: unknown | null; prev: unknown | null; lastYear: unknown | null }
  uis?: UisReportRaw
}

// 고정 오류 글. 받은 오류 내용은 담지 않는다
const STATS_READ_FAILED = 'stats read failed'
const GROUPS_SHAPE_FAILED = 'stats groups shape failed'

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// 통계 탭이 저장한 숫자(spec ai-report-stats REQ-2001·2002). 읽기 둘을 함께 보낸다:
// ① stats_months의 고른 달·지난달·작년 같은 달 줄(payload·sections는 검사하지 않고 그대로 넘긴다 — generate.ts가 검사한다)
// ② stats_rx_groups의 처방별 추세 묶음 → groupKey(codes, { out, cond }) → 이름(넣는·빼는·조건 처방 코드는 여기서 버린다, spec group-exclude AC-3702.4)
// 읽기가 error를 돌려주거나 던지거나 답 모양이 다르면 고정 글로 던진다(generateReport는 E-AI-FAILED, isReportStale은 false로 바꾼다).
// 달 계산은 addMonths만 쓴다(오늘 날짜를 구하지 않는다). 부를 때마다 새 값을 돌려준다(groupNames를 고쳐도 다음 부름에 번지지 않게)
export async function loadReportMonths(supabase: SupabaseClient, month: string): Promise<ReportMonths> {
  const wanted = [month, addMonths(month, -1), addMonths(month, -12)]
  let monthRows: unknown
  let groupRows: unknown
  try {
    const [months, groups] = await Promise.all([
      supabase.from('stats_months').select('month, payload, sections').in('month', wanted),
      supabase.from('stats_rx_groups').select('name, codes, out_codes, cond, sort_order'),
    ])
    if (months.error || groups.error) throw new Error(STATS_READ_FAILED)
    monthRows = months.data
    groupRows = groups.data
  } catch {
    throw new Error(STATS_READ_FAILED)
  }
  const [selected, prev, lastYear] = monthsIn(monthRows, wanted)
  const months: ReportMonths = {
    selected: selected.payload,
    prev: prev.payload,
    lastYear: lastYear.payload,
    groupNames: groupNamesOf(groupRows),
    sections: { selected: selected.sections, prev: prev.sections, lastYear: lastYear.sections },
  }
  // 고른 달 달 줄이 있으면 비트 길만(의사랑으로 바꾼 의원의 옛 비트 달도 비트 리포트 그대로). 없으면 그 달 의사랑 날 줄이 있을 때만 의사랑 표를 읽는다
  if (selected.payload !== null || !(await hasUisDays(supabase, month))) return months
  return { ...months, uis: await loadUisReportRaw(supabase, month, groupDefsOf(groupRows)) }
}

const UIS_SOURCE = 'uisarang'
const PAGE_ROWS = 1000

type DayRange = { from: string; to: string }
type Page = PromiseLike<{ data: unknown; error: unknown }>

// 의사랑 날 줄(stats_days · 출처 uisarang · 그 기간 날). 먼저 보기(한 줄)와 세 달 읽기가 같은 거르기를 쓴다
const uisDaysOf = (supabase: SupabaseClient, columns: string, range: DayRange) =>
  supabase.from('stats_days').select(columns).eq('source', UIS_SOURCE).gte('day', range.from).lte('day', range.to)

// 의사랑 처방(그 기간과 겹치는 줄)·나이대(하루 줄이라 그 기간 안 줄)
function uisPeriodsOf(supabase: SupabaseClient, kind: 'rx' | 'age', range: DayRange) {
  const rows = supabase.from('uis_periods').select('from_day, to_day, payload, updated_at').eq('kind', kind)
  const inRange = kind === 'rx' ? rows.lte('from_day', range.to).gte('to_day', range.from) : rows.gte('from_day', range.from).lte('to_day', range.to)
  return inRange.order('from_day').order('to_day')
}

// 고른 달에 의사랑 날 줄이 하나라도 있나(design.md §10-5). 읽기 오류·던짐·모양이 다른 답은 '없음'이다 —
// 이 읽기가 실패해도 비트 의원의 빈 달은 지금처럼 '자료 없음'(E-AI-NO-DATA)이고 '실패'(E-AI-FAILED)로 바뀌지 않는다
async function hasUisDays(supabase: SupabaseClient, month: string): Promise<boolean> {
  try {
    const { data, error } = await uisDaysOf(supabase, 'day', monthRange(month)).limit(1)
    return !error && Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

// 1,000줄씩 끝까지(받은 줄이 1,000보다 적으면 끝). error가 있거나 답이 배열이 아니면 고정 글로 던진다
async function allPages(page: (first: number, last: number) => Page): Promise<unknown[]> {
  const rows: unknown[] = []
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_ROWS - 1)
    if (error || !Array.isArray(data)) throw new Error(STATS_READ_FAILED)
    rows.push(...(data as unknown[]))
    if (data.length < PAGE_ROWS) return rows
  }
}

// 의사랑 세 달(고른 달·지난달·작년 같은 달, 달마다 1일~말일) 읽기(design.md §10-5 loadUisReportRaw). 줄은 검사하지 않고 고른 칸만 넘긴다.
// 표마다 세 달 차례로 이어 붙인다. 병원 조건은 넣지 않는다(RLS가 내 병원 · 보는 중이면 보는 의원 줄만 준다). 하나라도 실패하면 고정 글로 던진다
async function loadUisReportRaw(supabase: SupabaseClient, month: string, groups: UisReportRaw['groups']): Promise<UisReportRaw> {
  const ranges = [month, addMonths(month, -1), addMonths(month, -12)].map(monthRange)
  const everyMonth = async (pageOf: (range: DayRange) => (first: number, last: number) => Page) =>
    (await Promise.all(ranges.map((range) => allPages(pageOf(range))))).flat()
  try {
    const [days, coverage, sales, rx, age] = await Promise.all([
      everyMonth((range) => (first, last) => uisDaysOf(supabase, 'day, payload', range).order('day').range(first, last)),
      everyMonth(
        (range) => (first, last) =>
          supabase
            .from('stats_coverage')
            .select('from_day, to_day')
            .eq('source', UIS_SOURCE)
            .lte('from_day', range.to)
            .gte('to_day', range.from)
            .order('from_day')
            .order('to_day')
            .range(first, last),
      ),
      everyMonth(
        (range) => (first, last) =>
          supabase.from('sales_days').select('day, total, rough_total').gte('day', range.from).lte('day', range.to).order('day').range(first, last),
      ),
      everyMonth((range) => (first, last) => uisPeriodsOf(supabase, 'rx', range).range(first, last)),
      everyMonth((range) => (first, last) => uisPeriodsOf(supabase, 'age', range).range(first, last)),
    ])
    return { days, coverage, sales, rx, age, groups }
  } catch {
    throw new Error(STATS_READ_FAILED)
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

type GroupRow = { name: string; codes: string[]; out: string[]; cond: RxCond[]; sortOrder: number }

const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
const isCond = (value: unknown): value is RxCond => {
  if (typeof value !== 'object' || value === null) return false
  const { code, unless } = value as Record<string, unknown>
  return typeof code === 'string' && isTextList(unless)
}

// out_codes는 글자 배열, cond는 { code: 글자, unless: 글자 배열 } 배열이어야 한다. 두 칸이 null(또는 없음)이면 빈 것으로 본다
function groupRowOf(row: unknown): GroupRow {
  if (typeof row !== 'object' || row === null) throw new Error(GROUPS_SHAPE_FAILED)
  const { name, codes, out_codes: outCodes, cond: condItems, sort_order: sortOrder } = row as Record<string, unknown>
  const out = outCodes ?? []
  const cond = condItems ?? []
  if (typeof name !== 'string' || !isTextList(codes) || !isTextList(out) || !Array.isArray(cond) || !cond.every(isCond) || !Number.isInteger(sortOrder)) {
    throw new Error(GROUPS_SHAPE_FAILED)
  }
  return { name, codes, out, cond, sortOrder: sortOrder as number }
}

// 지금 묶음. sort_order 작은 차례, 같으면 이름 글자 코드 차례(localeCompare를 쓰지 않는다)로 보고 열쇠마다 처음 묶음만 남긴다.
// 처방이 빈 묶음과, 이름이 처방명·동네 이름과 같은 글자 검사(isText)를 못 넘는 묶음(연락처·식별 번호 모양)은 건너뛴다. 모양이 틀리면 GROUPS_SHAPE_FAILED로 던진다
function currentGroups(rows: unknown): Array<GroupRow & { key: string }> {
  if (!Array.isArray(rows)) throw new Error(GROUPS_SHAPE_FAILED)
  const groups = rows.map(groupRowOf).sort((a, b) => a.sortOrder - b.sortOrder || byText(a.name, b.name))
  const seen = new Set<string>()
  const kept: Array<GroupRow & { key: string }> = []
  for (const group of groups) {
    if (group.codes.length === 0 || !isText(group.name, true)) continue
    const key = groupKey(group.codes, { out: group.out, cond: group.cond })
    if (seen.has(key)) continue
    seen.add(key)
    kept.push({ ...group, key })
  }
  return kept
}

// 묶음 줄 → 열쇠 → 이름(넣는·빼는·조건 처방 코드는 여기서 버린다)
function groupNamesOf(rows: unknown): Record<string, string> {
  const names: Record<string, string> = {}
  for (const group of currentGroups(rows)) names[group.key] = group.name
  return names
}

// 의사랑 묶음 정의(design.md §10-5 groupDefsOf): groupNamesOf와 같은 거르기·차례·열쇠에 이름·넣는·빼는·조건 처방을 남긴다(서버 셈에만 쓰고 Claude에는 열쇠·이름만 간다)
function groupDefsOf(rows: unknown): UisReportRaw['groups'] {
  return currentGroups(rows).map(({ key, name, codes, out, cond }) => ({
    key,
    name,
    codes: [...codes],
    out: [...out],
    cond: cond.map((item) => ({ code: item.code, unless: [...item.unless] })),
  }))
}

const isHonorific = (value: unknown): value is Honorific => typeof value === 'string' && (HONORIFICS as readonly string[]).includes(value)

// AI 시스템 글의 받는 사람(spec clinic-profile AC-6606.4, design.md 8절). 사용자 세션(RLS 내 병원 줄)으로 clinic_profiles의 honorific 한 칸만 읽는다.
// 브라우저가 보낸 값은 쓰지 않는다(POST 몸통은 { month } 그대로). 줄 없음·세 가지 밖·읽기 오류(표가 아직 없음 등)·던짐은 모두 '원장님'이고
// 던지지 않는다 — 호칭을 못 읽어도 리포트는 만든다. 오류 내용은 버린다(로그도 남기지 않는다)
export async function loadHonorific(supabase: SupabaseClient): Promise<Honorific> {
  try {
    const { data, error } = await supabase.from('clinic_profiles').select('honorific').maybeSingle()
    if (error || typeof data !== 'object' || data === null) return DEFAULT_HONORIFIC
    const { honorific } = data as Record<string, unknown>
    return isHonorific(honorific) ? honorific : DEFAULT_HONORIFIC
  } catch {
    return DEFAULT_HONORIFIC
  }
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

// 휴진 안내 AI 배경의 하루 한도(specs/forms-themes design.md 4-5절). take_ai_image()가 오늘(한국 날짜) 한 장을 센다:
// true = 셌음, false = 한도, 'failed' = 오류(승인 안 됨 42501 등)·던짐·답이 불리언이 아님. 병원·날짜는 DB가 정한다(보내지 않는다)
export async function takeAiImage(supabase: SupabaseClient): Promise<boolean | 'failed'> {
  try {
    const { data, error } = await supabase.rpc('take_ai_image')
    if (error || typeof data !== 'boolean') return 'failed'
    return data
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
