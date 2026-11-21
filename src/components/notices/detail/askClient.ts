import type { AskReply, PrivateKind } from '@/types/notices'

// 브라우저에서 POST /api/ai/notices/ask 부르기(specs/notices design 10절, REQ-7417 답 모양). 던지지 않고 AskReply로 돌려준다.
// 같은 origin, 몸통은 { noticeId, question } 둘뿐이다. redirect: 'error' — 로그인이 끊겨 돌려보내는 답은 따라가지 않고 던져져 실패가 된다.
// 질문·답은 어디에도 남기지 않는다(저장·console 없음). 답은 화면이 글자로만 그린다

const ASK_PATH = '/api/ai/notices/ask'
const KINDS: readonly PrivateKind[] = ['rrn', 'tel', 'chart', 'digits']
const FAILED: AskReply = { ok: false, kind: 'failed' }
const LIMIT: AskReply = { ok: false, kind: 'limit' }

type Fields = Record<string, unknown>

const fieldsOf = (value: unknown): Fields | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : null

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const isLeft = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

// 200 { answer, left } · 400 { code: 'E-NOTICE-PRIVATE', kinds } · 429 → 다 씀 · 나머지(AI 바쁨·한도·글 없음·로그인·모양 틀림) → 실패
function replyOf(status: number, body: unknown): AskReply {
  const fields = fieldsOf(body)
  if (status === 200) {
    const answer = fields?.answer
    const left = fields?.left
    return typeof answer === 'string' && answer !== '' && isLeft(left) ? { ok: true, answer, left } : FAILED
  }
  if (status === 429) return LIMIT
  if (status === 400 && fields?.code === 'E-NOTICE-PRIVATE' && Array.isArray(fields.kinds)) {
    const kinds = KINDS.filter((kind) => (fields.kinds as unknown[]).includes(kind))
    return kinds.length > 0 ? { ok: false, kind: 'private', kinds } : FAILED
  }
  return FAILED
}

export async function askNotice(noticeId: string, question: string): Promise<AskReply> {
  try {
    const response = await fetch(ASK_PATH, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noticeId, question }),
    })
    return replyOf(response.status, jsonOf(await response.text()))
  } catch {
    return FAILED
  }
}
