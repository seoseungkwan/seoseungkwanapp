import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from '@anthropic-ai/sdk'
import type {
  BetaContentBlock,
  BetaFallbackBlock,
  BetaFallbackMessageIterationUsage,
  BetaIterationsUsage,
  BetaMessage,
  BetaMessageIterationUsage,
  BetaMessageStreamParams,
  BetaStopReason,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { ErrorType } from '@anthropic-ai/sdk/resources/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CALL_TIMEOUT_MS, MAX_TOKENS, MODEL, callClaude, type AnthropicLike } from './claude'

// Claude 부르기(spec ai-report design.md 'Claude 부르기'). 진짜 SDK 네트워크는 부르지 않는다 — 가짜 클라이언트만 넣는다
// 열쇠는 늘 가짜 글자(sk-ant-fake-…)다

const FAKE_KEY = 'sk-ant-fake-test-key'
const REQ = { system: '지시문', user: '{"month":"2026-10"}', schema: { type: 'object', properties: {} } }

function text(t: string): BetaContentBlock {
  return { type: 'text', text: t, citations: null }
}

function fallback(from: string, to: string): BetaFallbackBlock {
  return { type: 'fallback', from: { model: from }, to: { model: to }, trigger: { type: 'refusal', category: null } }
}

// usage.iterations 한 줄. 캐시 칸은 이 부름에서 쓰지 않는다
function attempt(
  type: 'message' | 'fallback_message',
  model: string,
  input: number,
  output: number,
): BetaMessageIterationUsage | BetaFallbackMessageIterationUsage {
  const common = { cache_creation: null, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  return { ...common, type, model, input_tokens: input, output_tokens: output }
}

function message(
  over: {
    content?: BetaContentBlock[]
    stop_reason?: BetaStopReason
    model?: string
    input?: number
    output?: number
    iterations?: BetaIterationsUsage | null
  } = {},
): BetaMessage {
  return {
    id: 'msg_fake',
    type: 'message',
    role: 'assistant',
    model: over.model ?? 'claude-opus-5-5',
    content: over.content ?? [text('{"summary":"요약","cards":[]}')],
    stop_reason: over.stop_reason ?? 'end_turn',
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    diagnostics: null,
    usage: {
      input_tokens: over.input ?? 1000,
      output_tokens: over.output ?? 200,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      fallback_credit: null,
      inference_geo: null,
      iterations: over.iterations ?? null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      speed: null,
    },
  }
}

// stream이 받은 인자(요청 칸·옵션)를 기록하고, finalMessage()가 정해 둔 답을 돌려주거나 던진다
function fakeClient(result: BetaMessage | Error) {
  const calls: BetaMessageStreamParams[] = []
  const options: ({ signal?: AbortSignal } | undefined)[] = []
  const abortedAtCall: (boolean | undefined)[] = []
  const client: AnthropicLike = {
    beta: {
      messages: {
        stream(params, opts) {
          calls.push(params)
          options.push(opts)
          abortedAtCall.push(opts?.signal?.aborted)
          return {
            finalMessage: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
          }
        },
      },
    },
  }
  return { client, calls, options, abortedAtCall }
}

// 신호가 끊길 때 정해 둔 오류로 실패하는 가짜. 신호를 안 주면 끊길 일이 없으니(기다리면 시험이 멈춘다) 바로 실패한다
function clientFailingOnAbort(makeError: () => Error): AnthropicLike {
  return {
    beta: {
      messages: {
        stream(_params, opts) {
          const signal = opts?.signal
          return {
            finalMessage: () =>
              new Promise<BetaMessage>((_resolve, reject) => {
                if (!signal) return reject(new Error('신호를 받지 못함'))
                signal.addEventListener('abort', () => reject(makeError()), { once: true })
              }),
          }
        },
      },
    },
  }
}

function errorBody(type: string) {
  return { type: 'error', error: { type, message: `가짜 ${type}` } }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('AC-510.1 SDK에 넣는 값', () => {
  it('AC-510.1 모델 claude-opus-5-5 · max_tokens 16000 상수', () => {
    expect(MODEL).toBe('claude-opus-5-5')
    expect(MAX_TOKENS).toBe(16000)
  })

  it('AC-510.1 beta 스트림에 모델·max_tokens·effort medium·JSON 스키마·fallbacks default·지시문·입력을 넣는다', async () => {
    const { client, calls } = fakeClient(message())
    await callClaude(REQ, { client, apiKey: FAKE_KEY })

    expect(calls).toHaveLength(1)
    const p = calls[0]
    expect(p.model).toBe('claude-opus-5-5')
    expect(p.max_tokens).toBe(16000)
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(p.fallbacks).toBe('default')
    expect(p.output_config?.effort).toBe('medium')
    expect(p.output_config?.format?.type).toBe('json_schema')
    expect(p.output_config?.format?.schema).toEqual(REQ.schema)
    expect(p.system).toBe('지시문')
    expect(p.messages).toEqual([{ role: 'user', content: '{"month":"2026-10"}' }])
  })

  it('AC-510.1 thinking 칸은 보내지 않는다(Opus 5.5는 늘 adaptive)', async () => {
    const { client, calls } = fakeClient(message())
    await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(calls[0]).not.toHaveProperty('thinking')
  })
})

describe('AC-510.2 정상 답', () => {
  it('AC-510.2 text 블록 둘을 이어 붙인 글자와 사용량(입력·출력 토큰, 답한 모델)을 돌려준다', async () => {
    const { client } = fakeClient(message({ content: [text('{"summary":'), text('"요약","cards":[]}')], input: 1234, output: 567 }))
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result).toEqual({
      ok: true,
      text: '{"summary":"요약","cards":[]}',
      usage: { inputTokens: 1234, outputTokens: 567, model: 'claude-opus-5-5' },
    })
  })

  it('AC-510.2 text가 아닌 블록(생각·fallback 표시)은 글자에 넣지 않고, 사용량의 모델은 답한 모델이다', async () => {
    const { client } = fakeClient(
      message({
        model: 'claude-opus-5',
        content: [
          { type: 'thinking', thinking: '', signature: 'sig-fake' },
          { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' }, trigger: { type: 'refusal' } },
          text('{"summary":"s","cards":[]}'),
        ] as BetaContentBlock[],
      }),
    )
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result).toEqual({
      ok: true,
      text: '{"summary":"s","cards":[]}',
      usage: { inputTokens: 1000, outputTokens: 200, model: 'claude-opus-5' },
    })
  })
})

describe('AC-510.3 SDK 오류와 끝난 까닭', () => {
  const busy: [string, () => Error, (new (...args: never[]) => Error) | null][] = [
    ['429 RateLimitError', () => APIError.generate(429, errorBody('rate_limit_error'), undefined, new Headers()), RateLimitError],
    ['529 InternalServerError(overloaded)', () => APIError.generate(529, errorBody('overloaded_error'), undefined, new Headers()), InternalServerError],
    ['500 InternalServerError', () => APIError.generate(500, errorBody('api_error'), undefined, new Headers()), InternalServerError],
    ['연결 끊김 APIConnectionError', () => new APIConnectionError({ message: 'Connection error.' }), APIConnectionError],
    ['시간 초과 APIConnectionTimeoutError', () => new APIConnectionTimeoutError(), APIConnectionTimeoutError],
    [
      '조각 도중 온 overloaded_error(상태 없음)',
      () => new APIError(undefined, errorBody('overloaded_error'), undefined, new Headers(), 'overloaded_error'),
      null,
    ],
  ]

  for (const [name, make, cls] of busy) {
    it(`AC-510.3 ${name} → E-AI-BUSY, 사용량 없음`, async () => {
      const err = make()
      if (cls) expect(err).toBeInstanceOf(cls)
      const { client } = fakeClient(err)
      expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-BUSY', usage: null })
    })
  }

  it('AC-510.3 402 billing_error → E-AI-LIMIT, 사용량 없음', async () => {
    const err = APIError.generate(402, errorBody('billing_error'), undefined, new Headers())
    expect(err.status).toBe(402)
    const { client } = fakeClient(err)
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-LIMIT', usage: null })
  })

  const failed: [string, () => Error, (new (...args: never[]) => Error) | null][] = [
    ['400 BadRequestError', () => APIError.generate(400, errorBody('invalid_request_error'), undefined, new Headers()), BadRequestError],
    ['401 AuthenticationError', () => APIError.generate(401, errorBody('authentication_error'), undefined, new Headers()), AuthenticationError],
    ['SDK 밖의 오류', () => new Error('boom'), null],
  ]

  for (const [name, make, cls] of failed) {
    it(`AC-510.3 ${name} → E-AI-FAILED, 사용량 없음`, async () => {
      const err = make()
      if (cls) expect(err).toBeInstanceOf(cls)
      const { client } = fakeClient(err)
      expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-FAILED', usage: null })
    })
  }

  it('AC-510.3 stream()이 바로 던져도 오류 번호로 바꾼다', async () => {
    const client: AnthropicLike = {
      beta: {
        messages: {
          stream() {
            throw APIError.generate(429, errorBody('rate_limit_error'), undefined, new Headers())
          },
        },
      },
    }
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-BUSY', usage: null })
  })

  it('AC-510.3 답이 refusal로 끝나면 E-AI-FAILED이고 사용량은 그대로 돌려준다', async () => {
    const { client } = fakeClient(message({ stop_reason: 'refusal', content: [], input: 900, output: 0 }))
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({
      ok: false,
      code: 'E-AI-FAILED',
      usage: { inputTokens: 900, outputTokens: 0, model: 'claude-opus-5-5' },
    })
  })

  it('AC-510.3 답이 max_tokens로 끝나면 E-AI-FAILED이고 사용량은 그대로 돌려준다', async () => {
    const { client } = fakeClient(message({ stop_reason: 'max_tokens', content: [text('{"summary":"잘')], input: 1500, output: 16000 }))
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({
      ok: false,
      code: 'E-AI-FAILED',
      usage: { inputTokens: 1500, outputTokens: 16000, model: 'claude-opus-5-5' },
    })
  })

  it('AC-510.3 오류 내용을 console에 쓰지 않는다', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const { client } = fakeClient(APIError.generate(500, errorBody('api_error'), undefined, new Headers()))
    await callClaude(REQ, { client, apiKey: FAKE_KEY })
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})

describe('AC-510.4 열쇠', () => {
  it('AC-510.4 열쇠가 빈 글자면 SDK를 부르지 않고 E-AI-FAILED', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { client, calls } = fakeClient(message())
    expect(await callClaude(REQ, { client, apiKey: '' })).toEqual({ ok: false, code: 'E-AI-FAILED', usage: null })
    expect(calls).toHaveLength(0)
  })

  it('AC-510.4 deps.apiKey도 환경 변수도 없으면 SDK를 부르지 않고 E-AI-FAILED', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { client, calls } = fakeClient(message())
    expect(await callClaude(REQ, { client })).toEqual({ ok: false, code: 'E-AI-FAILED', usage: null })
    expect(calls).toHaveLength(0)
  })

  it('AC-510.4 deps.apiKey가 없으면 ANTHROPIC_API_KEY 환경 변수를 쓴다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-fake-env-key')
    const { client, calls } = fakeClient(message())
    const result = await callClaude(REQ, { client })
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('AC-510.4 열쇠 글자는 결과에 담기지 않는다', async () => {
    const { client } = fakeClient(APIError.generate(401, errorBody('authentication_error'), undefined, new Headers()))
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(JSON.stringify(result)).not.toContain('sk-ant-fake')
  })
})

describe('AC-510.5 모든 시도의 사용량', () => {
  // 거절한 시도 + 대신 답한 시도. 맨 위 usage는 답을 만든 시도 몫만 담는다
  const twoAttempts = {
    model: 'claude-opus-5',
    input: 1000,
    output: 200,
    iterations: [
      attempt('message', 'claude-opus-5-5', 900, 40),
      attempt('fallback_message', 'claude-opus-5', 1000, 200),
    ],
  }
  const summed = { inputTokens: 1900, outputTokens: 240, model: 'claude-opus-5' }

  it('AC-510.5 iterations가 여럿이면 입력·출력 토큰은 모든 항목의 합이고 모델은 답의 model이다', async () => {
    const { client } = fakeClient(message({ ...twoAttempts, content: [text('{"summary":"ok"}')] }))
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: true, text: '{"summary":"ok"}', usage: summed })
  })

  it('AC-510.5 iterations가 null이면 맨 위 usage 값이다', async () => {
    const { client } = fakeClient(message({ input: 1234, output: 56, iterations: null }))
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result.usage).toEqual({ inputTokens: 1234, outputTokens: 56, model: 'claude-opus-5-5' })
  })

  it('AC-510.5 iterations가 빈 배열이면 맨 위 usage 값이다', async () => {
    const { client } = fakeClient(message({ input: 1234, output: 56, iterations: [] }))
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result.usage).toEqual({ inputTokens: 1234, outputTokens: 56, model: 'claude-opus-5-5' })
  })

  it('AC-510.5 iterations 칸이 아예 없어도 맨 위 usage 값이다', async () => {
    const answer = message({ input: 1234, output: 56 })
    delete (answer.usage as { iterations?: unknown }).iterations
    const { client } = fakeClient(answer)
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result.usage).toEqual({ inputTokens: 1234, outputTokens: 56, model: 'claude-opus-5-5' })
  })

  it('AC-510.5 마지막 시도가 다른 모델을 적어도 모델은 답의 model이다', async () => {
    const iterations = [attempt('message', 'claude-opus-5-5', 900, 40), attempt('fallback_message', 'claude-opus-4-8', 1000, 200)]
    const { client } = fakeClient(message({ model: 'claude-opus-5', iterations }))
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result.usage).toEqual({ inputTokens: 1900, outputTokens: 240, model: 'claude-opus-5' })
  })

  it('AC-510.5 refusal로 끝난 답도 모든 시도의 합을 돌려준다', async () => {
    const { client } = fakeClient(message({ ...twoAttempts, stop_reason: 'refusal', content: [] }))
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-FAILED', usage: summed })
  })

  it('AC-510.5 max_tokens로 끝난 답도 모든 시도의 합을 돌려준다', async () => {
    const { client } = fakeClient(message({ ...twoAttempts, stop_reason: 'max_tokens', content: [text('{"summary":"잘')] }))
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-FAILED', usage: summed })
  })
})

describe('AC-510.6 부르기 전체 시간 한도', () => {
  it('AC-510.6 CALL_TIMEOUT_MS는 100초다', () => {
    expect(CALL_TIMEOUT_MS).toBe(100_000)
  })

  it('AC-510.6 요청 옵션에 끊기 신호를 넣고, 부를 때는 아직 끊기지 않았다', async () => {
    const { client, options, abortedAtCall } = fakeClient(message())
    await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(options[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(abortedAtCall[0]).toBe(false)
  })

  it('AC-510.6 신호 시간은 기본 CALL_TIMEOUT_MS이고 deps.timeoutMs로 바꿀 수 있다', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const { client } = fakeClient(message())
    await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(timeout).toHaveBeenCalledTimes(1)
    expect(timeout).toHaveBeenLastCalledWith(100_000)

    await callClaude(REQ, { client, apiKey: FAKE_KEY, timeoutMs: 20 })
    expect(timeout).toHaveBeenCalledTimes(2)
    expect(timeout).toHaveBeenLastCalledWith(20)
  })

  it('AC-510.6 신호가 끊겨 SDK가 APIUserAbortError를 던지면 E-AI-BUSY, 사용량 없음', async () => {
    const client = clientFailingOnAbort(() => new APIUserAbortError())
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY, timeoutMs: 20 })).toEqual({ ok: false, code: 'E-AI-BUSY', usage: null })
  })

  it('AC-510.6 신호가 끊긴 뒤 온 SDK 밖 오류도 E-AI-BUSY, 사용량 없음', async () => {
    const client = clientFailingOnAbort(() => new Error('boom'))
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY, timeoutMs: 20 })).toEqual({ ok: false, code: 'E-AI-BUSY', usage: null })
  })

  it('AC-510.6 신호가 끊긴 뒤 온 다른 오류(400)도 E-AI-BUSY — 신호를 가장 먼저 본다', async () => {
    const client = clientFailingOnAbort(() => APIError.generate(400, errorBody('invalid_request_error'), undefined, new Headers()))
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY, timeoutMs: 20 })).toEqual({ ok: false, code: 'E-AI-BUSY', usage: null })
  })

  it('AC-510.6 APIUserAbortError를 바로 던져도 E-AI-BUSY, 사용량 없음', async () => {
    const { client } = fakeClient(new APIUserAbortError())
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-BUSY', usage: null })
  })

  it('AC-510.6 신호가 끊긴 뒤 온 402도 E-AI-BUSY, 사용량 없음 — 신호를 402보다 먼저 본다', async () => {
    const client = clientFailingOnAbort(() => APIError.generate(402, errorBody('billing_error'), undefined, new Headers()))
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY, timeoutMs: 20 })).toEqual({ ok: false, code: 'E-AI-BUSY', usage: null })
  })

  it('AC-510.6 신호가 끊긴 뒤에 정상 답이 오면 그 답을 그대로 돌려준다(성공 뒤에는 신호를 보지 않는다)', async () => {
    const answer = message({ content: [text('{"summary":"ok"}')] })
    const client: AnthropicLike = {
      beta: {
        messages: {
          stream(_params, opts) {
            const signal = opts?.signal
            return {
              finalMessage: () =>
                new Promise<BetaMessage>((resolve, reject) => {
                  if (!signal) return reject(new Error('신호를 받지 못함'))
                  signal.addEventListener('abort', () => resolve(answer), { once: true })
                }),
            }
          },
        },
      },
    }
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY, timeoutMs: 20 })).toEqual({
      ok: true,
      text: '{"summary":"ok"}',
      usage: { inputTokens: 1000, outputTokens: 200, model: 'claude-opus-5-5' },
    })
  })
})

describe('AC-510.7 조각 받는 도중 온 오류', () => {
  function midStreamError(type: ErrorType) {
    return new APIError(undefined, errorBody(type), undefined, new Headers(), type)
  }

  for (const type of ['rate_limit_error', 'overloaded_error', 'api_error'] as const) {
    it(`AC-510.7 상태 없는 APIError type ${type} → E-AI-BUSY, 사용량 없음`, async () => {
      const err = midStreamError(type)
      expect(err.status).toBeUndefined()
      const { client } = fakeClient(err)
      expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-BUSY', usage: null })
    })
  }

  for (const type of ['invalid_request_error', 'authentication_error'] as const) {
    it(`AC-510.7 상태 없는 APIError type ${type} → E-AI-FAILED, 사용량 없음`, async () => {
      const err = midStreamError(type)
      expect(err.status).toBeUndefined()
      const { client } = fakeClient(err)
      expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-FAILED', usage: null })
    })
  }

  it('AC-510.7 상태도 type도 없는 APIError → E-AI-FAILED, 사용량 없음', async () => {
    const { client } = fakeClient(new APIError(undefined, undefined, '가짜 오류', undefined))
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-FAILED', usage: null })
  })

  it('AC-510.7 상태 없는 APIError의 모르는 type(some_new_error) → E-AI-FAILED, 사용량 없음', async () => {
    // SDK 타입에 없는 새 type을 일부러 넣는다
    const unknownType: string = 'some_new_error'
    const err = midStreamError(unknownType as ErrorType)
    expect(err.status).toBeUndefined()
    expect(err.type).toBe('some_new_error')
    const { client } = fakeClient(err)
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-FAILED', usage: null })
  })

  it('AC-510.7 상태가 있는 APIError(400)는 type이 api_error여도 E-AI-FAILED, 사용량 없음', async () => {
    const err = new APIError(400, errorBody('api_error'), undefined, new Headers(), 'api_error')
    expect(err.status).toBe(400)
    expect(err.type).toBe('api_error')
    const { client } = fakeClient(err)
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-FAILED', usage: null })
  })
})

describe('AC-510.8 대신 답한 글자만', () => {
  it('AC-510.8 fallback 블록 뒤의 text만 쓴다 — 거절한 모델의 덜 쓴 글자는 버린다', async () => {
    const { client } = fakeClient(
      message({
        model: 'claude-opus-5',
        content: [text('{"summ'), fallback('claude-opus-5-5', 'claude-opus-5'), text('{"summary":"ok"}')],
      }),
    )
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result).toMatchObject({ ok: true, text: '{"summary":"ok"}' })
  })

  it('AC-510.8 fallback이 둘이면 마지막 것 뒤의 text만 쓴다', async () => {
    const { client } = fakeClient(
      message({
        model: 'claude-opus-4-8',
        content: [
          text('{"summ'),
          fallback('claude-opus-5-5', 'claude-opus-5'),
          text('{"cards'),
          fallback('claude-opus-5', 'claude-opus-4-8'),
          text('{"summary":"ok"}'),
        ],
      }),
    )
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result).toMatchObject({ ok: true, text: '{"summary":"ok"}' })
  })

  it('AC-510.8 마지막 fallback 뒤의 text가 여럿이면 이어 붙이고, text 아닌 블록은 넣지 않는다', async () => {
    const { client } = fakeClient(
      message({
        content: [
          text('덜 쓴 글자'),
          fallback('claude-opus-5-5', 'claude-opus-5'),
          { type: 'thinking', thinking: '', signature: 'sig-fake' },
          text('{"summary":'),
          text('"ok"}'),
        ],
      }),
    )
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result).toMatchObject({ ok: true, text: '{"summary":"ok"}' })
  })

  it('AC-510.8 마지막 fallback 뒤에 아무것도 없으면 글자는 빈 글자다 — 거절한 모델의 글자를 쓰지 않는다', async () => {
    const { client } = fakeClient(message({ content: [text('{"summ'), fallback('claude-opus-5-5', 'claude-opus-5')] }))
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result).toMatchObject({ ok: true, text: '' })
  })

  it('AC-510.8 fallback 블록이 없으면 모든 text를 이어 붙인다', async () => {
    const { client } = fakeClient(message({ content: [text('{"summary":'), text('"ok"}')] }))
    const result = await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(result).toMatchObject({ ok: true, text: '{"summary":"ok"}' })
  })

  it('AC-510.8 글자는 대신 답한 것만이어도 사용량은 AC-510.5대로 모든 시도의 합이다', async () => {
    const { client } = fakeClient(
      message({
        model: 'claude-opus-5',
        input: 1000,
        output: 200,
        iterations: [
          attempt('message', 'claude-opus-5-5', 900, 40),
          attempt('fallback_message', 'claude-opus-5', 1000, 200),
        ],
        content: [text('{"summ'), fallback('claude-opus-5-5', 'claude-opus-5'), text('{"summary":"ok"}')],
      }),
    )
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({
      ok: true,
      text: '{"summary":"ok"}',
      usage: { inputTokens: 1900, outputTokens: 240, model: 'claude-opus-5' },
    })
  })
})
