import { NotSignedInError, readMe } from '@/lib/auth/hospital.server'
import { imageCostMicroUsd } from '@/lib/ai/cost'
import { backgroundPrompt, wordsOf, wordsProblem } from '@/lib/forms/background'
import { supabaseServer } from '@/lib/supabase/server'
import { IMAGE_MODEL, callImage, type ImageCode } from '../../openaiImage'
import { addUsage, takeAiImage } from '../../store'

// POST /api/ai/forms/background (specs/forms-themes REQ-4606, design.md 4-4절). 휴진 안내 배경 그림을 OpenAI 그림 AI로 만든다.
// 집계만 보낸다는 규칙의 예외: 사람이 적은 짧은 말(30자까지, 개인정보 모양 거부)만 고정 프롬프트에 넣어 보낸다(ADR-029).
// 하루 한도(take_ai_image)는 보내기 전에 센다. 개인정보 모양이면 세지 않는다.
// 400·401·403은 상태만(몸통·로그 없음). { code }로 답하는 모든 경우에 console.error('[api/ai/forms/background]', code) 한 줄만 —
// 적은 말·프롬프트·그림 글·오류 글은 남기지 않는다. 이 파일은 Next가 아는 이름(POST·runtime·maxDuration)만 export한다
export const runtime = 'nodejs'
export const maxDuration = 60

type BackgroundErrorCode = 'E-FORMS-PRIVATE' | 'E-FORMS-BG-LIMIT' | ImageCode
const STATUS: Record<BackgroundErrorCode, number> = {
  'E-FORMS-PRIVATE': 422,
  'E-FORMS-BG-LIMIT': 429,
  'E-FORMS-BG-QUOTA': 402,
  'E-AI-BUSY': 503,
  'E-FORMS-BG-FAILED': 502,
}

function status(code: number): Response {
  return new Response(null, { status: code })
}

function fail(code: BackgroundErrorCode): Response {
  console.error('[api/ai/forms/background]', code)
  return Response.json({ code }, { status: STATUS[code] })
}

// { text } 하나이고 wordsOf를 넘으면(앞뒤 공백을 뗀 1~30자) 받은 글 그대로, 아니면 null
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
  return wordsOf(text) === null ? null : (text as string)
}

// 이번 달 사용량에 한 장을 더한다. 사용량이 없으면 토큰 0·값 60,000. 실패해도 답은 그대로다(오류 내용은 남기지 않는다)
async function recordUsage(supabase: Awaited<ReturnType<typeof supabaseServer>>, usage: { inputTokens: number; outputTokens: number } | null) {
  try {
    await addUsage(supabase, {
      model: IMAGE_MODEL,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costMicroUsd: imageCostMicroUsd(usage),
    })
  } catch {
    // 사용량을 못 더해도 만든 그림은 돌려준다
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
    return fail('E-FORMS-BG-FAILED')
  }
  if (!approved) return status(403)

  // 제어 문자(줄바꿈·탭 포함)나 전화·주민번호·메일 모양이 있으면 보내지 않고 한도도 세지 않는다(떼기 전 글로 본다)
  if (wordsProblem(text)) return fail('E-FORMS-PRIVATE')
  // OpenAI에는 앞뒤 공백을 뗀 30자까지만 간다
  const words = wordsOf(text) as string

  try {
    const supabase = await supabaseServer()
    const taken = await takeAiImage(supabase)
    if (taken === false) return fail('E-FORMS-BG-LIMIT')
    if (taken !== true) return fail('E-FORMS-BG-FAILED')

    const result = await callImage(backgroundPrompt(words))
    if (!result.ok) return fail(result.code)
    await recordUsage(supabase, result.usage)
    return Response.json({ image: result.jpeg }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return fail('E-FORMS-BG-FAILED')
  }
}
