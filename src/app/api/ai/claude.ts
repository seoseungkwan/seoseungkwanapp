import 'server-only'
import Anthropic, {
  APIConnectionError,
  APIError,
  InternalServerError,
  RateLimitError,
} from '@anthropic-ai/sdk'
import type { BetaMessage, BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { AiErrorCode, AiUsage } from '@/types/aiReport'

// Claude 부르기(spec ai-report design.md 'Claude 부르기', ADR-024). SDK는 이 폴더에서만 쓴다(ADR-004)
// 열쇠는 서버 환경 변수 ANTHROPIC_API_KEY만. 열쇠·오류 내용·요청·답 글자는 로그·결과에 담지 않는다(이 파일은 console을 쓰지 않는다)

export const MODEL = 'claude-opus-5-5'
export const MAX_TOKENS = 16000

// 시험이 넣는 작은 모양. 진짜 Anthropic 클라이언트도 이 모양에 맞는다
export type AnthropicLike = {
  beta: { messages: { stream(params: BetaMessageStreamParams): { finalMessage(): Promise<BetaMessage> } } }
}

export type ClaudeResult =
  | { ok: true; text: string; usage: AiUsage }
  | { ok: false; code: AiErrorCode; usage: AiUsage | null }

// 조각 도중 온 오류(SSE error 이벤트)는 상태 없는 APIError로 온다 — error.type으로 429·5xx·529와 같게 본다
const BUSY_TYPES: ReadonlySet<string> = new Set(['rate_limit_error', 'overloaded_error', 'api_error'])

export async function callClaude(
  req: { system: string; user: string; schema: object },
  deps?: { client?: AnthropicLike; apiKey?: string },
): Promise<ClaudeResult> {
  const apiKey = deps?.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, code: 'E-AI-FAILED', usage: null }

  const client: AnthropicLike = deps?.client ?? new Anthropic({ apiKey, timeout: 100_000, maxRetries: 1 })

  let message: BetaMessage
  try {
    // 조각으로 받아 끝까지 모은다(긴 답의 HTTP 시간 초과를 피하려고). thinking은 보내지 않는다(Opus 5.5는 늘 adaptive)
    message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: req.schema as Record<string, unknown> } },
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      })
      .finalMessage()
  } catch (err) {
    return { ok: false, code: errorCode(err), usage: null }
  }

  const usage: AiUsage = {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    model: message.model,
  }
  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
    return { ok: false, code: 'E-AI-FAILED', usage }
  }

  let text = ''
  for (const block of message.content) {
    if (block.type === 'text') text += block.text
  }
  return { ok: true, text, usage }
}

// 가장 좁은 것부터. APIConnectionTimeoutError는 APIConnectionError의 하위 클래스다
function errorCode(err: unknown): AiErrorCode {
  if (err instanceof APIConnectionError || err instanceof RateLimitError || err instanceof InternalServerError) {
    return 'E-AI-BUSY'
  }
  if (err instanceof APIError) {
    if (err.status === 402) return 'E-AI-LIMIT'
    if (err.status === undefined && err.type !== null && BUSY_TYPES.has(err.type)) return 'E-AI-BUSY'
  }
  return 'E-AI-FAILED'
}
