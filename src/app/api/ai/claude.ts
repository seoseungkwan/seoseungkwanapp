import 'server-only'
import Anthropic, {
  AnthropicError,
  APIConnectionError,
  APIError,
  APIUserAbortError,
  InternalServerError,
  RateLimitError,
} from '@anthropic-ai/sdk'
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageContentParam,
  BetaMessageStreamParams,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { AiErrorCode, AiUsage } from '@/types/aiReport'

// Claude 부르기(spec ai-report design.md 'Claude 부르기', ADR-024). SDK는 이 폴더에서만 쓴다(ADR-004)
// 열쇠는 서버 환경 변수 ANTHROPIC_API_KEY만. 열쇠·오류 내용·요청·답 글자는 로그·결과에 담지 않는다(이 파일은 console을 쓰지 않는다)

export const MODEL = 'claude-opus-5-5'
export const MAX_TOKENS = 16000
// 부르기 전체 시간 한도: 경로 maxDuration 120초에서 로그인 확인·숫자 읽기·저장 몫 20초를 남긴다
export const CALL_TIMEOUT_MS = 100_000

// 시험이 넣는 작은 모양. 진짜 Anthropic 클라이언트도 이 모양에 맞는다
export type AnthropicLike = {
  beta: {
    messages: {
      stream(params: BetaMessageStreamParams, options?: { signal?: AbortSignal }): { finalMessage(): Promise<BetaMessage> }
    }
  }
}

export type ClaudeResult =
  | { ok: true; text: string; usage: AiUsage }
  | { ok: false; code: AiErrorCode; usage: AiUsage | null }

// 조각 도중 온 오류(SSE error 이벤트)는 상태 없는 APIError로 온다 — error.type으로 429·5xx·529와 같게 본다
const BUSY_TYPES: ReadonlySet<string> = new Set(['rate_limit_error', 'overloaded_error', 'api_error', 'timeout_error'])
// SDK 1.3.0 lib/BetaMessageStream.js가 조각이 끝맺지 않고 닫혔을 때 던지는 글자. 시험이 진짜 SDK로 이 글자를 지킨다
const ENDED_EARLY: ReadonlySet<string> = new Set([
  'stream ended without producing a Message with role=assistant',
  'request ended without sending any chunks',
])

// 사진 한 장(base64 글자). 재고 탭 명세서 읽기만 쓴다(spec inventory design.md 5절)
export type ClaudeImage = { mediaType: 'image/jpeg'; data: string }

// effort: 생각 깊이. 없으면 medium(AI 리포트). 서식 정리처럼 짧은 글 뽑기는 low(spec forms), 점검 규칙 JSON 고치기는 high(spec rule-auto AC-7808.4)
// user: 글자 하나, 또는 내용 블록 배열(고시·공지 요약의 PDF document 블록 + 글 블록, spec notices AC-7412.1) — 받은 그대로 보낸다
// 일괄 처리(notices/batch.ts)도 같은 모양을 받는다
export type ClaudeRequest = { system: string; user: string | BetaContentBlockParam[]; schema: object; effort?: 'low' | 'medium' | 'high' }

// image: 있으면 user 내용이 [사진 블록, 글 블록]이고, 없으면 user 그대로다(재고 탭만. 일괄 처리는 사진을 받지 않는다)
export async function callClaude(
  req: ClaudeRequest & { image?: ClaudeImage },
  deps?: { client?: AnthropicLike; apiKey?: string; timeoutMs?: number },
): Promise<ClaudeResult> {
  const apiKey = deps?.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, code: 'E-AI-FAILED', usage: null }

  const client: AnthropicLike = deps?.client ?? new Anthropic({ apiKey, timeout: 100_000, maxRetries: 1, logLevel: 'off' })

  // SDK timeout은 시도 한 번의 응답 머리만 잰다. 재시도·조각 받기까지 덮는 신호 하나를 넣는다
  const signal = AbortSignal.timeout(deps?.timeoutMs ?? CALL_TIMEOUT_MS)

  let message: BetaMessage
  try {
    // 조각으로 받아 끝까지 모은다(긴 답의 HTTP 시간 초과를 피하려고). thinking은 보내지 않는다(Opus 5.5는 늘 adaptive)
    message = await client.beta.messages
      .stream(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: req.effort ?? 'medium', format: { type: 'json_schema', schema: req.schema as Record<string, unknown> } },
          system: req.system,
          messages: [{ role: 'user', content: userContent(req.user, req.image) }],
        },
        { signal },
      )
      .finalMessage()
  } catch (err) {
    return { ok: false, code: errorCode(err, signal), usage: null }
  }

  const usage = totalUsage(message)
  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
    return { ok: false, code: 'E-AI-FAILED', usage }
  }
  return { ok: true, text: answerText(message.content), usage }
}

// 사진은 글보다 앞에 둔다(사진 블록 하나 + 글 블록 하나, user가 블록 배열이면 그 블록들)
function userContent(user: ClaudeRequest['user'], image: ClaudeImage | undefined): BetaMessageContentParam {
  if (image === undefined) return user
  return [
    { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
    ...(typeof user === 'string' ? [{ type: 'text' as const, text: user }] : user),
  ]
}

// 맨 위 usage는 답을 만든 시도 몫만 담는다. 시도마다의 사용량(거절한 시도 + 대신 답한 시도)은 usage.iterations에 있다
function totalUsage(message: BetaMessage): AiUsage {
  const attempts: { input_tokens: number; output_tokens: number }[] = message.usage.iterations?.length
    ? message.usage.iterations
    : [message.usage]
  return {
    inputTokens: attempts.reduce((sum, a) => sum + a.input_tokens, 0),
    outputTokens: attempts.reduce((sum, a) => sum + a.output_tokens, 0),
    model: message.model,
  }
}

// 조각 도중 거절이 나면 [거절한 모델의 덜 쓴 글자, fallback 블록, 대신 답한 모델의 글자] 차례로 온다. 마지막 fallback 뒤만 답이다
function answerText(content: BetaContentBlock[]): string {
  const lastFallback = content.findLastIndex((block) => block.type === 'fallback')
  let text = ''
  for (const block of content.slice(lastFallback + 1)) {
    if (block.type === 'text') text += block.text
  }
  return text
}

// 위에서부터 처음 맞는 것(design '오류 나누기' 1~6). 신호를 가장 먼저 본다: APIUserAbortError는 상태·type이 없는 APIError다
// APIConnectionTimeoutError는 APIConnectionError의 하위 클래스다
function errorCode(err: unknown, signal: AbortSignal): AiErrorCode {
  if (signal.aborted || err instanceof APIUserAbortError) return 'E-AI-BUSY'
  if (err instanceof APIConnectionError || err instanceof RateLimitError || err instanceof InternalServerError) {
    return 'E-AI-BUSY'
  }
  if (err instanceof APIError) {
    if (err.status === 402) return 'E-AI-LIMIT'
    if (err.status === undefined && err.type === 'billing_error') return 'E-AI-LIMIT'
    if (err.status === undefined && err.type !== null && BUSY_TYPES.has(err.type)) return 'E-AI-BUSY'
    return 'E-AI-FAILED'
  }
  // SDK는 부르기 안의 모든 Error를 AnthropicError로 감싼다. 넓게 BUSY로 보면 열쇠·주소 설정 잘못과 코드 잘못까지 바쁘다고 말하니, 끊김과 끝맺지 않음만 본다
  if (err instanceof AnthropicError) {
    if (err.cause instanceof TypeError && err.cause.message === 'terminated') return 'E-AI-BUSY'
    if (ENDED_EARLY.has(err.message)) return 'E-AI-BUSY'
  }
  return 'E-AI-FAILED'
}
