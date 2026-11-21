import { NotSignedInError, readMe } from '@/lib/auth/hospital.server'
import { costMicroUsd } from '@/lib/ai/cost'
import { checkQuestion } from '@/lib/notices/askCheck'
import { supabaseServer } from '@/lib/supabase/server'
import type { AiUsage } from '@/types/aiReport'
import { callClaude } from '../../claude'
import { addUsage } from '../../store'
import { askRequest, parseAnswer, type AskNotice } from './askPrompt'

// POST /api/ai/notices/ask (specs/notices REQ-7417, design 8절 '묻기'). 고시·공지 글 하나에 사용자가 적은 질문을 Claude로 묻는다.
// 집계만 보낸다는 규칙의 예외(ADR-037): 질문(1~300자, 환자 정보 모양 거부, 저장 안 함)과 서버가 DB에서 읽은 공개 글을 보낸다.
// 차례: 몸통 → 로그인·승인 → 질문 검사 → 표 받기(병원마다 하루 20번) → 글 읽기 → Claude → 남은 수 → 표 끝내기.
// 표를 받은 뒤 실패하면 end_notice_ask(표, false)로 횟수를 돌려준다. 질문 검사를 못 넘으면 표를 받지 않는다.
// 400(몸통·질문 모양)·401·403은 상태만(몸통·로그 없음). { code }로 답하는 모든 경우에 console.error('[api/ai/notices/ask]', code) 한 줄만 —
// 질문·답·글 id·종류는 남기지 않는다. 이 파일은 Next가 아는 이름(POST·runtime·maxDuration)만 export한다
export const runtime = 'nodejs'
export const maxDuration = 120

type AskErrorCode = 'E-NOTICE-PRIVATE' | 'E-NOTICE-ASK-LIMIT' | 'E-NOTICE-READ' | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED'
const STATUS: Record<AskErrorCode, number> = {
  'E-NOTICE-PRIVATE': 400,
  'E-NOTICE-ASK-LIMIT': 429,
  'E-NOTICE-READ': 404,
  'E-AI-LIMIT': 402,
  'E-AI-BUSY': 503,
  'E-AI-FAILED': 502,
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ASK_LIMIT = 20

type Server = Awaited<ReturnType<typeof supabaseServer>>
type Outcome = { ok: true; answer: string; left: number } | { ok: false; code: AskErrorCode }

function status(code: number): Response {
  return new Response(null, { status: code })
}

function fail(code: AskErrorCode, extra?: Record<string, unknown>): Response {
  console.error('[api/ai/notices/ask]', code)
  return Response.json({ code, ...extra }, { status: STATUS[code] })
}

// 몸통이 정확히 { noticeId: uuid, question: 글자 }이면 그 값, 아니면 null. 질문 내용 검사는 로그인 확인 뒤 checkQuestion이 한다
async function readBody(request: Request): Promise<{ noticeId: string; question: string } | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const keys = Object.keys(body).sort()
  if (keys.length !== 2 || keys[0] !== 'noticeId' || keys[1] !== 'question') return null
  const { noticeId, question } = body as Record<string, unknown>
  if (typeof noticeId !== 'string' || !UUID.test(noticeId) || typeof question !== 'string') return null
  return { noticeId, question }
}

// 오늘 묻기 표 하나. 표(uuid) · null = 오늘 20번을 다 씀 · 'failed' = 오류(승인 안 됨 42501 등)·던짐·답 모양이 다름.
// 병원·날짜는 DB가 정한다(보내지 않는다)
async function takeAsk(sb: Server): Promise<string | null | 'failed'> {
  try {
    const { data, error } = await sb.rpc('take_notice_ask')
    if (error) return 'failed'
    if (data === null) return null
    return typeof data === 'string' && UUID.test(data) ? data : 'failed'
  } catch {
    return 'failed'
  }
}

// 표 끝내기. ok가 거짓이면 DB가 그날 수를 1 되돌린다. 실패해도 답은 그대로다(오류 내용은 남기지 않는다)
async function endAsk(sb: Server, token: string, ok: boolean): Promise<void> {
  try {
    await sb.rpc('end_notice_ask', { p_token: token, p_ok: ok })
  } catch {
    // 못 끝낸 표는 다음 날 take_notice_ask가 지운다
  }
}

// 오늘 남은 묻기 수(0~20 정수). 읽지 못하거나 모양이 다르면 null
async function askLeft(sb: Server): Promise<number | null> {
  try {
    const { data, error } = await sb.rpc('notice_ask_left')
    if (error) return null
    return Number.isInteger(data) && (data as number) >= 0 && (data as number) <= ASK_LIMIT ? (data as number) : null
  } catch {
    return null
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// 요약 jsonb에서 화면에 보이는 네 칸. 모양이 다르면 요약 없이 묻는다
function summaryOf(value: unknown): AskNotice['summary'] {
  if (!isObject(value)) return null
  const { what, when, who, forUs } = value
  if (typeof what !== 'string' || typeof when !== 'string' || typeof who !== 'string' || typeof forUs !== 'string') return null
  return { what, when, who, forUs }
}

// 그 글 한 줄(사용자 세션, RLS: 승인된 원장만 읽는다). 줄 없음·읽기 오류·던짐·모양이 다르면 null
async function readNotice(sb: Server, noticeId: string): Promise<AskNotice | null> {
  try {
    const { data, error } = await sb.from('notices').select('title, summary, body, attach_text').eq('id', noticeId).maybeSingle()
    if (error || !isObject(data)) return null
    const { title, summary, body, attach_text: attachText } = data
    if (typeof title !== 'string' || typeof body !== 'string' || typeof attachText !== 'string') return null
    return { title, summary: summaryOf(summary), body, attachText }
  } catch {
    return null
  }
}

// 이번 달 사용량에 한 번의 부름을 더한다(add_ai_usage, 숫자만). 실패해도 답은 그대로다(오류 내용은 남기지 않는다)
async function recordUsage(sb: Server, usage: AiUsage): Promise<void> {
  try {
    await addUsage(sb, { ...usage, costMicroUsd: costMicroUsd(usage) })
  } catch {
    // 사용량을 못 더해도 답은 돌려준다
  }
}

// 표를 받은 뒤의 흐름. 남은 수는 표 끝내기 전에 읽는다(끝내기는 수를 바꾸지 않는다) — 못 읽으면 답을 보내지 않고 표를 돌려준다
async function answerWith(sb: Server, noticeId: string, question: string): Promise<Outcome> {
  const notice = await readNotice(sb, noticeId)
  if (notice === null) return { ok: false, code: 'E-NOTICE-READ' }

  const result = await callClaude(askRequest(notice, question))
  if (result.usage !== null) await recordUsage(sb, result.usage)
  if (!result.ok) return { ok: false, code: result.code === 'E-AI-BUSY' || result.code === 'E-AI-LIMIT' ? result.code : 'E-AI-FAILED' }

  const answer = parseAnswer(result.text)
  if (answer === null) return { ok: false, code: 'E-AI-FAILED' }
  const left = await askLeft(sb)
  if (left === null) return { ok: false, code: 'E-AI-FAILED' }
  return { ok: true, answer, left }
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request)
  if (body === null) return status(400)

  let approved: boolean
  try {
    const me = await readMe()
    // 데스크 계정은 내 병원 줄이 없어(hospital null) 여기서 403이다
    approved = me.hospital !== null && me.hospital.status === 'approved'
  } catch (err) {
    if (err instanceof NotSignedInError) return status(401)
    return fail('E-AI-FAILED')
  }
  if (!approved) return status(403)

  // 서버도 같은 검사를 한다. 못 넘으면 표를 받지 않고 Claude로 보내지 않는다
  const check = checkQuestion(body.question)
  if (typeof check === 'object') return fail('E-NOTICE-PRIVATE', { kinds: check.private })
  if (check !== 'ok') return status(400)

  let sb: Server
  try {
    sb = await supabaseServer()
  } catch {
    return fail('E-AI-FAILED')
  }
  const token = await takeAsk(sb)
  if (token === null) return fail('E-NOTICE-ASK-LIMIT')
  if (token === 'failed') return fail('E-AI-FAILED')

  let outcome: Outcome
  try {
    outcome = await answerWith(sb, body.noticeId, body.question)
  } catch {
    outcome = { ok: false, code: 'E-AI-FAILED' }
  }
  await endAsk(sb, token, outcome.ok)
  if (!outcome.ok) return fail(outcome.code)
  return Response.json({ answer: outcome.answer, left: outcome.left }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
