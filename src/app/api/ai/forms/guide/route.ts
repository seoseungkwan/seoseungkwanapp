import { NotSignedInError, readMe } from '@/lib/auth/hospital.server'
import { costMicroUsd } from '@/lib/ai/cost'
import { formsUser, memoProblem } from '@/lib/forms/ai'
import { GUIDE_SCHEMA, guideFromAnswer, guideSystem } from '@/lib/forms/guideAi'
import { supabaseServer } from '@/lib/supabase/server'
import { MAX_MEMO } from '@/types/forms'
import type { AiUsage } from '@/types/aiReport'
import { callClaude } from '../../claude'
import { addUsage } from '../../store'

// POST /api/ai/forms/guide (spec forms-guide REQ-4505, design.md 8절). 서식 탭 환자 안내문의 대충 적은 글을 안내문 칸으로 정리한다.
// 집계만 보낸다는 규칙의 예외: 사용자가 적은 글(500자까지, 개인정보 모양 거부, 저장 안 함)을 Claude로 보낸다(ADR-028).
// 흐름은 휴진 안내 경로(app/api/ai/forms/route.ts)와 같다. 답의 숫자는 guideFromAnswer가 메모의 숫자와 맞춰 본다.
// 400·401·403은 상태만(몸통·로그 없음). { code }로 답하는 모든 경우에 console.error('[api/ai/forms/guide]', code) 한 줄만 — 글·답·숫자는 남기지 않는다.
// 이 파일은 Next가 아는 이름(POST·runtime·maxDuration)만 export한다
export const runtime = 'nodejs'
export const maxDuration = 60

const CALL_TIMEOUT_MS = 45_000 // maxDuration 60초에서 로그인 확인·사용량 몫을 남긴다

type GuideErrorCode = 'E-FORMS-PRIVATE' | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED'
const STATUS: Record<GuideErrorCode, number> = {
  'E-FORMS-PRIVATE': 422,
  'E-AI-LIMIT': 402,
  'E-AI-BUSY': 503,
  'E-AI-FAILED': 502,
}

function status(code: number): Response {
  return new Response(null, { status: code })
}

function fail(code: GuideErrorCode): Response {
  console.error('[api/ai/forms/guide]', code)
  return Response.json({ code }, { status: STATUS[code] })
}

// { text } 하나이고 1~500자(앞뒤 공백을 뗀 길이 1 이상)이면 그 글, 아니면 null(휴진 안내 경로와 같다)
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
  if (typeof text !== 'string' || text.trim() === '' || Array.from(text).length > MAX_MEMO) return null
  return text
}

// 이번 달 사용량에 더한다. 실패해도 답은 그대로다(오류 내용은 남기지 않는다)
async function recordUsage(usage: AiUsage): Promise<void> {
  try {
    await addUsage(await supabaseServer(), { ...usage, costMicroUsd: costMicroUsd(usage) })
  } catch {
    // 사용량을 못 더해도 정리한 안내문은 돌려준다
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

  // 전화·주민번호·메일 모양이나 제어 문자(줄바꿈·탭 밖)가 있으면 Claude로 보내지 않는다
  if (memoProblem(text)) return fail('E-FORMS-PRIVATE')

  try {
    const result = await callClaude(
      { system: guideSystem(), user: formsUser(text), schema: GUIDE_SCHEMA, effort: 'low' },
      { timeoutMs: CALL_TIMEOUT_MS },
    )
    if (result.usage !== null) await recordUsage(result.usage)
    if (!result.ok) return fail(result.code === 'E-AI-BUSY' || result.code === 'E-AI-LIMIT' ? result.code : 'E-AI-FAILED')

    const answer = guideFromAnswer(result.text, text)
    if (!answer.ok) return fail(answer.code)
    return Response.json({ guide: answer.guide, truncated: answer.truncated }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return fail('E-AI-FAILED')
  }
}
