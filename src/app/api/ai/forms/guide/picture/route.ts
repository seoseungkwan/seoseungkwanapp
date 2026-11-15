import { NotSignedInError, readMe } from '@/lib/auth/hospital.server'
import { costMicroUsd } from '@/lib/ai/cost'
import { formsUser } from '@/lib/forms/ai'
import { DRAWING_SCHEMA, drawingFromAnswer, drawingSystem, subjectProblem } from '@/lib/forms/guideDrawing'
import { supabaseServer } from '@/lib/supabase/server'
import { DRAWING_LIMITS } from '@/types/formGuide'
import type { AiUsage } from '@/types/aiReport'
import { callClaude } from '../../../claude'
import { addUsage } from '../../../store'

// POST /api/ai/forms/guide/picture (spec forms-guide REQ-4512, design.md 8-1절). 환자 안내문에 넣을 그림을 AI가 도형으로 그린다.
// 집계만 보낸다는 규칙의 예외: 사람이 적은 '그릴 것'(20자까지, 개인정보 모양 거부)만 Claude로 보낸다(ADR-028).
// 답은 SVG 글로 받지 않는다: 도형·색 이름·숫자만 받아 drawingFromAnswer가 검사하고, 그림 요소는 화면이 만든다.
// 400·401·403은 상태만(몸통·로그 없음). { code }로 답하는 모든 경우에 console.error('[api/ai/forms/guide/picture]', code) 한 줄만 — 글·답·숫자는 남기지 않는다.
// 이 파일은 Next가 아는 이름(POST·runtime·maxDuration)만 export한다
export const runtime = 'nodejs'
export const maxDuration = 60

const CALL_TIMEOUT_MS = 50_000 // 생각 깊이 medium. maxDuration 60초에서 로그인 확인·사용량 몫을 남긴다

type PictureErrorCode = 'E-FORMS-PRIVATE' | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED'
const STATUS: Record<PictureErrorCode, number> = {
  'E-FORMS-PRIVATE': 422,
  'E-AI-LIMIT': 402,
  'E-AI-BUSY': 503,
  'E-AI-FAILED': 502,
}

function status(code: number): Response {
  return new Response(null, { status: code })
}

function fail(code: PictureErrorCode): Response {
  console.error('[api/ai/forms/guide/picture]', code)
  return Response.json({ code }, { status: STATUS[code] })
}

// { text } 하나이고 앞뒤 공백을 뗀 1~20자(유니코드 글자 수)이면 그 글(떼기 전 그대로), 아니면 null
async function readText(request: Request): Promise<string | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const keys = Object.keys(body)
  if (keys.length !== 1 || keys[0] !== 'text') return null
  const text = (body as { text: unknown }).text
  if (typeof text !== 'string') return null
  const length = Array.from(text.trim()).length
  return length >= 1 && length <= DRAWING_LIMITS.subject ? text : null
}

// 이번 달 사용량에 더한다. 실패해도 답은 그대로다(오류 내용은 남기지 않는다)
async function recordUsage(usage: AiUsage): Promise<void> {
  try {
    await addUsage(await supabaseServer(), { ...usage, costMicroUsd: costMicroUsd(usage) })
  } catch {
    // 사용량을 못 더해도 그린 그림은 돌려준다
  }
}

export async function POST(request: Request): Promise<Response> {
  const text = await readText(request)
  if (text === null) return status(400)

  let approved: boolean
  try {
    const me = await readMe()
    approved = me.hospital !== null && me.hospital.status === 'approved'
  } catch (err) {
    if (err instanceof NotSignedInError) return status(401)
    return fail('E-AI-FAILED')
  }
  if (!approved) return status(403)

  // 제어 문자(줄바꿈 포함)나 전화·주민번호·메일 모양이 있으면 Claude로 보내지 않는다
  if (subjectProblem(text)) return fail('E-FORMS-PRIVATE')

  try {
    const result = await callClaude(
      { system: drawingSystem(), user: formsUser(text), schema: DRAWING_SCHEMA, effort: 'medium' },
      { timeoutMs: CALL_TIMEOUT_MS },
    )
    if (result.usage !== null) await recordUsage(result.usage)
    if (!result.ok) return fail(result.code === 'E-AI-BUSY' || result.code === 'E-AI-LIMIT' ? result.code : 'E-AI-FAILED')

    const answer = drawingFromAnswer(result.text, text.trim())
    if (!answer.ok) return fail(answer.code)
    return Response.json({ drawing: answer.drawing }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return fail('E-AI-FAILED')
  }
}
