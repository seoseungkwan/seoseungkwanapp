import 'server-only'
import { isJpegBase64 } from '@/lib/forms/background'

// OpenAI 그림 부르기(specs/forms-themes design.md 4-3절, ADR-029). 꾸러미 없이 fetch만 쓴다.
// 열쇠는 서버 환경 변수 OPENAI_API_KEY만. 열쇠·오류 내용·요청·답 글자는 로그·결과에 담지 않는다(이 파일은 console을 쓰지 않는다)

export const IMAGE_MODEL = 'gpt-image-2.6-flare'
export const IMAGE_URL = 'https://api.openai.com/v1/images/generations'
export const IMAGE_TIMEOUT_MS = 50_000 // maxDuration 60초에서 로그인 확인·한도·사용량 몫을 남긴다

export type ImageCode = 'E-AI-BUSY' | 'E-FORMS-BG-QUOTA' | 'E-FORMS-BG-FAILED'
export type ImageResult =
  | { ok: true; jpeg: string; usage: { inputTokens: number; outputTokens: number } | null } // jpeg = base64 글
  | { ok: false; code: ImageCode }

const fail = (code: ImageCode): ImageResult => ({ ok: false, code })

export async function callImage(
  prompt: string,
  deps?: { fetchImpl?: typeof fetch; apiKey?: string; timeoutMs?: number },
): Promise<ImageResult> {
  const apiKey = deps?.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) return fail('E-FORMS-BG-FAILED')
  const fetchImpl = deps?.fetchImpl ?? fetch

  // 몸통은 정확히 일곱 열쇠. user 같은 식별 칸은 넣지 않는다
  const body = { model: IMAGE_MODEL, prompt, size: '1584x2240', quality: 'medium', n: 1, output_format: 'jpeg', output_compression: 88 }
  let status: number
  let text: string
  try {
    const res = await fetchImpl(IMAGE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(deps?.timeoutMs ?? IMAGE_TIMEOUT_MS),
    })
    status = res.status
    text = await res.text()
  } catch {
    // 연결 끊김·시간 넘김(받는 도중 끊김 포함)
    return fail('E-AI-BUSY')
  }

  const answer = parseJson(text)
  if (status < 200 || status > 299) return fail(errorCodeOf(status, answer))
  const b64 = firstImage(answer)
  if (!isJpegBase64(b64)) return fail('E-FORMS-BG-FAILED')
  return { ok: true, jpeg: b64, usage: usageOf(answer) }
}

// 2xx 아닌 답(design.md 4-3절 표, 위에서부터 처음 맞는 것)
function errorCodeOf(status: number, answer: unknown): ImageCode {
  const code = field(field(answer, 'error'), 'code')
  if ((status === 429 && code === 'insufficient_quota') || (status === 400 && code === 'billing_hard_limit_reached')) return 'E-FORMS-BG-QUOTA'
  if (status === 429 || (status >= 500 && status <= 599)) return 'E-AI-BUSY'
  return 'E-FORMS-BG-FAILED'
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined
}

// data[0].b64_json
function firstImage(answer: unknown): unknown {
  const data = field(answer, 'data')
  return Array.isArray(data) ? field(data[0], 'b64_json') : undefined
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

// usage.input_tokens·output_tokens가 둘 다 0 이상 정수면 그 값, 아니면 null
function usageOf(answer: unknown): { inputTokens: number; outputTokens: number } | null {
  const usage = field(answer, 'usage')
  const inputTokens = field(usage, 'input_tokens')
  const outputTokens = field(usage, 'output_tokens')
  return isCount(inputTokens) && isCount(outputTokens) ? { inputTokens, outputTokens } : null
}
