import { NotSignedInError, readMe } from '@/lib/auth/hospital.server'
import { costMicroUsd } from '@/lib/ai/cost'
import { COLUMNS_SCHEMA, columnsFromAnswer, columnsSystem, columnsUser, sheetProblem } from '@/lib/inventory/ai'
import { supabaseServer } from '@/lib/supabase/server'
import type { AiUsage } from '@/types/aiReport'
import { callClaude } from '../../claude'
import { addUsage } from '../../store'

// POST /api/ai/inventory/columns (spec inventory REQ-7505, design.md 5절). 재고 탭 엑셀(양식이 아닌 파일)의 머리 줄 + 앞 줄로 칸을 맞춘다.
// 집계만 보낸다는 규칙의 예외: 엑셀 머리 줄과 앞 줄 5개까지(칸마다 40자, 개인정보 모양 거부, 저장 안 함)를 Claude로 보낸다(ADR-034).
// 흐름은 서식 AI 정리 경로(app/api/ai/forms/route.ts)와 같다. 서버는 DB에서 읽지 않는다(사용량 더하기만).
// 400·401·403은 상태만(몸통·로그 없음). { code }로 답하는 모든 경우에 console.error('[api/ai/inventory/columns]', code) 한 줄만 — 칸 글자·답·숫자는 남기지 않는다.
// 이 파일은 Next가 아는 이름(POST·runtime·maxDuration)만 export한다
export const runtime = 'nodejs'
export const maxDuration = 60

const CALL_TIMEOUT_MS = 45_000 // maxDuration 60초에서 로그인 확인·사용량 몫을 남긴다

// 몸통 한도(lib/inventory/excel.ts sampleForAi가 만드는 모양과 같다)
const MAX_HEADER = 30
const MAX_ROWS = 5
// UTF-16 길이로 센다(lib/inventory/ai.ts clipText와 같다): 그래야 columnsUser가 칸을 더 자르지 않아 검사한 글자 그대로 간다
const MAX_CELL = 40

type ColumnsErrorCode = 'E-INV-PRIVATE' | 'E-INV-NO-NAME' | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED'
const STATUS: Record<ColumnsErrorCode, number> = {
  'E-INV-PRIVATE': 422,
  'E-INV-NO-NAME': 422,
  'E-AI-LIMIT': 402,
  'E-AI-BUSY': 503,
  'E-AI-FAILED': 502,
}

function status(code: number): Response {
  return new Response(null, { status: code })
}

function fail(code: ColumnsErrorCode): Response {
  console.error('[api/ai/inventory/columns]', code)
  return Response.json({ code }, { status: STATUS[code] })
}

const isCells = (value: unknown, length: number | null): value is string[] =>
  Array.isArray(value) &&
  (length === null ? value.length >= 1 && value.length <= MAX_HEADER : value.length === length) &&
  value.every((cell) => typeof cell === 'string' && cell.length <= MAX_CELL)

// { header, rows } 둘뿐이고 머리 1~30칸, 줄 0~5개, 줄마다 머리와 같은 칸 수, 칸마다 40자까지 글자이면 그 값, 아니면 null(AC-7505.4)
async function readSheet(request: Request): Promise<{ header: string[]; rows: string[][] } | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const keys = Object.keys(body).sort()
  if (keys.length !== 2 || keys[0] !== 'header' || keys[1] !== 'rows') return null
  const { header, rows } = body as { header: unknown; rows: unknown }
  if (!isCells(header, null)) return null
  if (!Array.isArray(rows) || rows.length > MAX_ROWS || !rows.every((row) => isCells(row, header.length))) return null
  return { header, rows: rows as string[][] }
}

// 이번 달 사용량에 더한다. 실패해도 답은 그대로다(오류 내용은 남기지 않는다)
async function recordUsage(usage: AiUsage): Promise<void> {
  try {
    await addUsage(await supabaseServer(), { ...usage, costMicroUsd: costMicroUsd(usage) })
  } catch {
    // 사용량을 못 더해도 맞춘 칸은 돌려준다
  }
}

export async function POST(request: Request): Promise<Response> {
  const sheet = await readSheet(request)
  if (sheet === null) return status(400)

  let approved: boolean
  try {
    const me = await readMe()
    approved = me.hospital !== null && me.hospital.status === 'approved'
  } catch (err) {
    if (err instanceof NotSignedInError) return status(401)
    return fail('E-AI-FAILED')
  }
  if (!approved) return status(403)

  // 브라우저도 보기 전에 보지만 서버에서 다시 본다: 칸 하나라도 제어 문자나 전화·주민번호·메일 모양이면 Claude로 보내지 않는다
  if (sheetProblem(sheet.header, sheet.rows)) return fail('E-INV-PRIVATE')

  try {
    const result = await callClaude(
      { system: columnsSystem(), user: columnsUser(sheet.header, sheet.rows), schema: COLUMNS_SCHEMA, effort: 'low' },
      { timeoutMs: CALL_TIMEOUT_MS },
    )
    if (result.usage !== null) await recordUsage(result.usage)
    if (!result.ok) return fail(result.code === 'E-AI-BUSY' || result.code === 'E-AI-LIMIT' ? result.code : 'E-AI-FAILED')

    const answer = columnsFromAnswer(result.text, sheet.header.length)
    if (!answer.ok) return fail(answer.code)
    return Response.json({ mapping: answer.mapping }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return fail('E-AI-FAILED')
  }
}
