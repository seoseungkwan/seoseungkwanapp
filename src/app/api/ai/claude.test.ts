import {
  AnthropicError,
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
  BetaContentBlockParam,
  BetaFallbackBlock,
  BetaFallbackMessageIterationUsage,
  BetaIterationsUsage,
  BetaMessage,
  BetaMessageIterationUsage,
  BetaMessageStreamParams,
  BetaStopReason,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { ErrorType } from '@anthropic-ai/sdk/resources/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CALL_TIMEOUT_MS, MAX_TOKENS, MODEL, callClaude, type AnthropicLike, type ClaudeRequest } from './claude'

// Claude 부르기(spec ai-report design.md 'Claude 부르기'). 네트워크·진짜 Claude는 쓰지 않는다
// 보통은 가짜 클라이언트를 넣고, SDK 안쪽 사실(끊김·끝맺지 않음의 오류 모양과 글자, logLevel)은 진짜 SDK 클래스 + 가짜 fetch로 본다
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
  vi.unstubAllGlobals()
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

// 서식 탭 AI 정리(specs/forms TASK-8): 짧은 글 뽑기라 effort low로 부른다. 칸이 없으면 지금처럼 medium
describe('AC-3509.3 effort 칸', () => {
  it("AC-3509.3 effort 'low'를 주면 output_config.effort가 low이고, 나머지 칸은 그대로다", async () => {
    const { client, calls } = fakeClient(message())
    await callClaude({ ...REQ, effort: 'low' }, { client, apiKey: FAKE_KEY })
    const p = calls[0]
    expect(p.output_config?.effort).toBe('low')
    expect(p.model).toBe('claude-opus-5-5')
    expect(p.fallbacks).toBe('default')
    expect(p.output_config?.format?.schema).toEqual(REQ.schema)
    expect(p).not.toHaveProperty('thinking')
  })

  it("AC-3509.3 effort 'medium'을 주거나 칸이 없으면 medium", async () => {
    const { client, calls } = fakeClient(message())
    await callClaude({ ...REQ, effort: 'medium' }, { client, apiKey: FAKE_KEY })
    await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(calls.map((p) => p.output_config?.effort)).toEqual(['medium', 'medium'])
  })
})

// 재고 탭 명세서 읽기(specs/inventory TASK-6): 사진을 주면 user 내용이 [사진 블록, 글 블록]이다. 칸이 없으면 지금처럼 글자 하나
describe('AC-7505.2 사진 칸', () => {
  const IMAGE = { mediaType: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQ==' } as const

  it('AC-7505.2 image를 주면 user 내용이 [base64 사진 블록, 글 블록] 차례이고, 나머지 칸은 그대로다', async () => {
    const { client, calls } = fakeClient(message())
    await callClaude({ ...REQ, image: IMAGE }, { client, apiKey: FAKE_KEY })
    expect(calls).toHaveLength(1)
    const p = calls[0]
    expect(p.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQ==' } },
          { type: 'text', text: '{"month":"2026-10"}' },
        ],
      },
    ])
    expect(p.model).toBe('claude-opus-5-5')
    expect(p.max_tokens).toBe(16000)
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(p.fallbacks).toBe('default')
    expect(p.output_config?.effort).toBe('medium')
    expect(p.output_config?.format?.schema).toEqual(REQ.schema)
    expect(p.system).toBe('지시문')
    expect(p).not.toHaveProperty('thinking')
  })

  it('AC-7505.2 image 칸이 없거나 undefined이면 user 내용은 글자 하나 그대로다', async () => {
    const { client, calls } = fakeClient(message())
    await callClaude(REQ, { client, apiKey: FAKE_KEY })
    await callClaude({ ...REQ, image: undefined }, { client, apiKey: FAKE_KEY })
    expect(calls.map((p) => p.messages)).toEqual([
      [{ role: 'user', content: '{"month":"2026-10"}' }],
      [{ role: 'user', content: '{"month":"2026-10"}' }],
    ])
  })

  it('AC-7505.2 사진을 보내도 답·사용량은 글자만 보낼 때와 같은 모양이다', async () => {
    const { client } = fakeClient(message({ content: [text('{"lines":[]}')], input: 2500, output: 120 }))
    expect(await callClaude({ ...REQ, image: IMAGE }, { client, apiKey: FAKE_KEY })).toEqual({
      ok: true,
      text: '{"lines":[]}',
      usage: { inputTokens: 2500, outputTokens: 120, model: 'claude-opus-5-5' },
    })
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

  for (const type of ['rate_limit_error', 'overloaded_error', 'api_error', 'timeout_error'] as const) {
    it(`AC-510.7 상태 없는 APIError type ${type} → E-AI-BUSY, 사용량 없음`, async () => {
      const err = midStreamError(type)
      expect(err.status).toBeUndefined()
      const { client } = fakeClient(err)
      expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-BUSY', usage: null })
    })
  }

  it('AC-510.7 상태 없는 APIError type billing_error → E-AI-LIMIT, 사용량 없음', async () => {
    const err = midStreamError('billing_error')
    expect(err.status).toBeUndefined()
    const { client } = fakeClient(err)
    expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, code: 'E-AI-LIMIT', usage: null })
  })

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

  it('AC-510.7 상태가 있는 APIError(400)는 type이 billing_error여도 E-AI-FAILED, 사용량 없음', async () => {
    const err = new APIError(400, errorBody('billing_error'), undefined, new Headers(), 'billing_error')
    expect(err.status).toBe(400)
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

// 고시·공지 요약(specs/notices AC-7412.1): user에 내용 블록 배열(PDF document 블록 + 글 블록)을 넣는다. 글자 user는 지금 그대로다
describe('AC-7412.1 user에 내용 블록 배열', () => {
  const BLOCKS: BetaContentBlockParam[] = [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQKJcfsj6IK' } },
    { type: 'text', text: '<notice>본문</notice>' },
    { type: 'text', text: '<attachment name="붙임.hwpx">붙임 글</attachment>' },
  ]
  const BLOCK_REQ: ClaudeRequest = { ...REQ, user: BLOCKS }

  it('AC-7412.1 배열을 그대로 messages[0].content로 보내고, 나머지 칸(모델·fallbacks·effort·schema·지시문)은 글자 user와 같다', async () => {
    const blocksBefore = structuredClone(BLOCKS)
    const { client, calls } = fakeClient(message())
    await callClaude(BLOCK_REQ, { client, apiKey: FAKE_KEY })
    await callClaude(REQ, { client, apiKey: FAKE_KEY })

    const [withBlocks, withText] = calls
    expect(withBlocks.messages).toEqual([{ role: 'user', content: BLOCKS }])
    expect(withBlocks.messages[0].content).toBe(BLOCKS)
    expect(BLOCKS).toEqual(blocksBefore)
    // messages만 다르고 나머지 칸은 모두 같다
    expect(withBlocks).toEqual({ ...withText, messages: withBlocks.messages })
    expect(withBlocks).toMatchObject({ model: MODEL, max_tokens: MAX_TOKENS, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    expect(withBlocks).not.toHaveProperty('thinking')
  })

  it("AC-7412.1 배열 user에 effort 'low'를 주면 low, 없으면 medium", async () => {
    const { client, calls } = fakeClient(message())
    await callClaude({ ...BLOCK_REQ, effort: 'low' }, { client, apiKey: FAKE_KEY })
    await callClaude(BLOCK_REQ, { client, apiKey: FAKE_KEY })
    expect(calls.map((p) => p.output_config?.effort)).toEqual(['low', 'medium'])
  })

  it('AC-7412.1 글자 user는 지금처럼 글자로 보낸다', async () => {
    const { client, calls } = fakeClient(message())
    await callClaude(REQ, { client, apiKey: FAKE_KEY })
    expect(calls[0].messages).toEqual([{ role: 'user', content: '{"month":"2026-10"}' }])
  })

  const errors: [string, () => Error, string][] = [
    ['429', () => APIError.generate(429, errorBody('rate_limit_error'), undefined, new Headers()), 'E-AI-BUSY'],
    ['402', () => APIError.generate(402, errorBody('billing_error'), undefined, new Headers()), 'E-AI-LIMIT'],
    ['400', () => APIError.generate(400, errorBody('invalid_request_error'), undefined, new Headers()), 'E-AI-FAILED'],
    ['조각 도중 overloaded_error', () => new APIError(undefined, errorBody('overloaded_error'), undefined, new Headers(), 'overloaded_error'), 'E-AI-BUSY'],
  ]

  for (const [name, make, code] of errors) {
    it(`AC-7412.1 배열 user에서도 오류 나누기가 같다: ${name} → ${code}`, async () => {
      const withBlocks = await callClaude(BLOCK_REQ, { client: fakeClient(make()).client, apiKey: FAKE_KEY })
      const withText = await callClaude(REQ, { client: fakeClient(make()).client, apiKey: FAKE_KEY })
      expect(withBlocks).toEqual({ ok: false, code, usage: null })
      expect(withBlocks).toEqual(withText)
    })
  }

  it('AC-7412.1 배열 user에서도 refusal·max_tokens는 E-AI-FAILED이고 모든 시도의 사용량을 돌려준다', async () => {
    const iterations = [attempt('message', 'claude-opus-5-5', 900, 40), attempt('fallback_message', 'claude-opus-5', 1000, 200)]
    for (const stop_reason of ['refusal', 'max_tokens'] as const) {
      const { client } = fakeClient(message({ model: 'claude-opus-5', iterations, stop_reason, content: [] }))
      expect(await callClaude(BLOCK_REQ, { client, apiKey: FAKE_KEY })).toEqual({
        ok: false,
        code: 'E-AI-FAILED',
        usage: { inputTokens: 1900, outputTokens: 240, model: 'claude-opus-5' },
      })
    }
  })

  it('AC-7412.1 배열 user에서도 글자는 마지막 fallback 뒤 text만, 사용량은 모든 시도의 합이다', async () => {
    const { client } = fakeClient(
      message({
        model: 'claude-opus-5',
        iterations: [attempt('message', 'claude-opus-5-5', 900, 40), attempt('fallback_message', 'claude-opus-5', 1000, 200)],
        content: [text('{"rel'), fallback('claude-opus-5-5', 'claude-opus-5'), text('{"related":'), text('true}')],
      }),
    )
    expect(await callClaude(BLOCK_REQ, { client, apiKey: FAKE_KEY })).toEqual({
      ok: true,
      text: '{"related":true}',
      usage: { inputTokens: 1900, outputTokens: 240, model: 'claude-opus-5' },
    })
  })
})

// 아래는 deps.client 없이 진짜 SDK 클래스 + 가짜 fetch로 돈다. SDK 판이 바뀌어 오류 모양·글자가 달라지면 여기서 잡힌다
const enc = new TextEncoder()
const sse = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
const sseError = (type: string) => sse('error', errorBody(type))
const START = sse('message_start', {
  type: 'message_start',
  message: {
    id: 'msg_fake',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 1 },
  },
})
const BLOCK = sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: null } })
const DELTA = sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"summary":"ok"}' } })
const BLOCK_STOP = sse('content_block_stop', { type: 'content_block_stop', index: 0 })
const MSG_DELTA = sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } })
const MSG_STOP = sse('message_stop', { type: 'message_stop' })
const WHOLE_ANSWER = [START, BLOCK, DELTA, BLOCK_STOP, MSG_DELTA, MSG_STOP]
const MALFORMED = 'event: content_block_delta\ndata: {"type":"content_block_delta" 비밀조각\n\n'

// pull로 하나씩 준다: controller.error()는 쌓여 있던 조각을 버려서, start에서 넣고 바로 error하면 앞 조각이 전해지지 않는다
function sseResponse(chunks: string[], end: 'close' | Error = 'close'): Response {
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) return c.enqueue(enc.encode(chunks[i++]))
      if (end === 'close') c.close()
      else c.error(end)
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

// retry-after-ms: SDK 재시도를 기다리지 않게
function jsonError(status: number, type: string): Response {
  return new Response(JSON.stringify(errorBody(type)), { status, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' } })
}

function fakeFetch(make: () => Response) {
  const f = vi.fn(async () => make())
  vi.stubGlobal('fetch', f)
  return f
}

// SDK는 로거를 console 객체별로 캐시하고 그때의 함수를 묶어 둔다. spy는 앞 시험이 만든 캐시 때문에 호출을 놓치니, 시험마다 새 객체를 넣는다
function freshConsole() {
  const c = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  vi.stubGlobal('console', c)
  return c
}

function expectSilent(c: ReturnType<typeof freshConsole>) {
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) expect(c[m]).not.toHaveBeenCalled()
}

// undici의 fetch가 몸통을 읽는 도중 연결이 깨졌을 때 내는 모양
const terminated = () => new TypeError('terminated', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })

const BUSY = { ok: false, code: 'E-AI-BUSY', usage: null }
const LIMIT = { ok: false, code: 'E-AI-LIMIT', usage: null }
const FAILED = { ok: false, code: 'E-AI-FAILED', usage: null }

describe('진짜 SDK 클래스 + 가짜 fetch', () => {
  beforeEach(() => {
    // 가짜 fetch를 빠뜨려도 네트워크로 나가지 않게 막는다
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('가짜 fetch를 먼저 넣어야 한다'))))
    // 시험 밖 환경 변수에 흔들리지 않게 비운다
    vi.stubEnv('ANTHROPIC_BASE_URL', undefined)
    vi.stubEnv('ANTHROPIC_LOG', undefined)
  })

  // BUSY를 기대하는 시험은 fetch가 불린 횟수도 함께 본다: 막아 둔 fetch에 걸리면 APIConnectionError → BUSY로 헛통과한다
  describe('AC-510.7 조각 도중 온 오류', () => {
    const midStream = [
      ['timeout_error', BUSY],
      ['api_error', BUSY],
      ['billing_error', LIMIT],
      ['invalid_request_error', FAILED],
      ['authentication_error', FAILED],
      ['some_new_error', FAILED],
    ] as const

    for (const [type, want] of midStream) {
      it(`AC-510.7 SSE error 이벤트 ${type} → ${want.code}, 사용량 없음`, async () => {
        const f = fakeFetch(() => sseResponse([START, BLOCK, DELTA, sseError(type)]))
        expect(await callClaude(REQ, { apiKey: FAKE_KEY })).toEqual(want)
        expect(f).toHaveBeenCalledTimes(1)
      })
    }

    const twoRoads = [
      [504, 'timeout_error', BUSY, 2], // 5xx는 SDK가 한 번 더 시도한다(maxRetries: 1)
      [402, 'billing_error', LIMIT, 1],
    ] as const

    for (const [status, type, want, attempts] of twoRoads) {
      it(`AC-510.7 같은 오류의 두 길: HTTP ${status} ${type}와 조각 도중 ${type}는 둘 다 ${want.code}, 사용량 없음`, async () => {
        const byStatusFetch = fakeFetch(() => jsonError(status, type))
        const byStatus = await callClaude(REQ, { apiKey: FAKE_KEY })
        expect(byStatusFetch).toHaveBeenCalledTimes(attempts)

        const midStreamFetch = fakeFetch(() => sseResponse([START, sseError(type)]))
        const inStream = await callClaude(REQ, { apiKey: FAKE_KEY })
        expect(midStreamFetch).toHaveBeenCalledTimes(1)

        expect({ byStatus, inStream }).toEqual({ byStatus: want, inStream: want })
      })
    }
  })

  describe('AC-510.9 끊김·끝맺지 않음', () => {
    const cases: [string, () => Response][] = [
      ['글자를 받다가 연결이 끊김', () => sseResponse([START, BLOCK, DELTA], terminated())],
      ['첫 조각 전에 연결이 끊김', () => sseResponse([], terminated())],
      ['글자를 받다가 message_stop 없이 닫힘', () => sseResponse([START, BLOCK, DELTA])],
      ['message_delta까지 받고 message_stop 없이 닫힘', () => sseResponse([START, BLOCK, DELTA, BLOCK_STOP, MSG_DELTA])],
      ['조각 하나 없이 닫힘', () => sseResponse([])],
    ]

    for (const [name, make] of cases) {
      it(`AC-510.9 ${name} → E-AI-BUSY, 사용량 없음`, async () => {
        const f = fakeFetch(make)
        expect(await callClaude(REQ, { apiKey: FAKE_KEY })).toEqual(BUSY)
        expect(f).toHaveBeenCalledTimes(1)
      })
    }

    it('AC-510.9 message_stop까지 받은 답은 그대로 성공이다', async () => {
      fakeFetch(() => sseResponse(WHOLE_ANSWER))
      expect(await callClaude(REQ, { apiKey: FAKE_KEY })).toEqual({
        ok: true,
        text: '{"summary":"ok"}',
        usage: { inputTokens: 10, outputTokens: 5, model: 'claude-opus-5-5' },
      })
    })

    it('AC-510.9 SDK가 감싼 모양(cause에 TypeError: terminated)이면 가짜 클라이언트로도 E-AI-BUSY, 사용량 없음', async () => {
      const { client } = fakeClient(Object.assign(new AnthropicError('terminated'), { cause: terminated() }))
      expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual(BUSY)
    })
  })

  // 지금 코드로도 통과한다. "APIError가 아닌 AnthropicError면 BUSY"나 "cause가 TypeError면 BUSY" 같은 넓은 규칙을 막는 시험이다
  describe('AC-510.10 설정·코드 잘못은 바쁘다고 말하지 않는다', () => {
    // 부르기 전에 실패하는 것들. 가짜 fetch는 온전한 답을 주므로, 닿았다면 성공으로 나와 시험이 실패한다
    const badKeys = [
      ['헤더에 못 쓰는 글자(한글)', 'sk-ant-fake-키'],
      ['가운데 줄바꿈', 'sk-ant-fake\nX-Evil: 1'],
    ] as const

    for (const [name, apiKey] of badKeys) {
      it(`AC-510.10 열쇠에 ${name} → E-AI-FAILED, 사용량 없음, 결과에 열쇠 글자 없음`, async () => {
        const f = fakeFetch(() => sseResponse(WHOLE_ANSWER))
        const result = await callClaude(REQ, { apiKey })
        expect(result).toEqual(FAILED)
        expect(JSON.stringify(result)).not.toContain('sk-ant-fake')
        expect(f).not.toHaveBeenCalled()
      })
    }

    it('AC-510.10 ANTHROPIC_BASE_URL이 주소 모양이 아님 → E-AI-FAILED, 사용량 없음', async () => {
      vi.stubEnv('ANTHROPIC_BASE_URL', 'not a url')
      const f = fakeFetch(() => sseResponse(WHOLE_ANSWER))
      expect(await callClaude(REQ, { apiKey: FAKE_KEY })).toEqual(FAILED)
      expect(f).not.toHaveBeenCalled()
    })

    it('AC-510.10 JSON으로 못 바꾸는 요청(자기를 가리키는 스키마) → E-AI-FAILED, 사용량 없음', async () => {
      const schema: Record<string, unknown> = {}
      schema.self = schema
      const f = fakeFetch(() => sseResponse(WHOLE_ANSWER))
      expect(await callClaude({ ...REQ, schema }, { apiKey: FAKE_KEY })).toEqual(FAILED)
      expect(f).not.toHaveBeenCalled()
    })

    // 응답을 받은 뒤 실패하는 것들
    const badResponses: [string, () => Response][] = [
      ['깨진 조각', () => sseResponse([START, MALFORMED])],
      ['모양이 틀린 조각', () => sseResponse([START, sse('message_delta', { type: 'message_delta' })])],
      ['순서가 틀린 조각(message_start 둘)', () => sseResponse([START, START])],
      ['몸통 없는 응답', () => new Response(null, { status: 200 })],
      ['terminated가 아닌 TypeError', () => sseResponse([START], new TypeError('Cannot read properties of undefined'))],
    ]

    for (const [name, make] of badResponses) {
      it(`AC-510.10 ${name} → E-AI-FAILED, 사용량 없음`, async () => {
        const f = fakeFetch(make)
        expect(await callClaude(REQ, { apiKey: FAKE_KEY })).toEqual(FAILED)
        expect(f).toHaveBeenCalledTimes(1)
      })
    }

    // 끊김 규칙은 cause의 TypeError 글자를, 끝맺지 않음 규칙은 AnthropicError의 글자 전체를 본다
    const nearMisses: [string, () => Error][] = [
      ['cause 없이 글자만 terminated인 AnthropicError', () => new AnthropicError('terminated')],
      ['감싸지 않은 TypeError: terminated', () => terminated()],
      ['cause가 TypeError가 아닌 AnthropicError', () => Object.assign(new AnthropicError('terminated'), { cause: new Error('terminated') })],
      ['정해 둔 글자와 앞부분만 같은 AnthropicError', () => new AnthropicError('stream ended without producing a content block with type=text')],
      ['글자는 같지만 AnthropicError가 아닌 오류', () => new Error('request ended without sending any chunks')],
    ]

    for (const [name, make] of nearMisses) {
      it(`AC-510.10 ${name} → E-AI-FAILED, 사용량 없음`, async () => {
        const { client } = fakeClient(make())
        expect(await callClaude(REQ, { client, apiKey: FAKE_KEY })).toEqual(FAILED)
      })
    }
  })

  // 진짜 SDK가 사진 블록을 HTTP 몸통에 그대로 싣는지 본다(가짜 클라이언트로는 SDK의 직렬화를 못 본다)
  describe('AC-7505.2 사진을 담은 HTTP 몸통', () => {
    it('AC-7505.2 messages[0].content가 [base64 사진, 글] 차례이고 답은 그대로 성공이다', async () => {
      const bodies: unknown[] = []
      const f = vi.fn(async (...args: unknown[]) => {
        bodies.push((args[1] as RequestInit | undefined)?.body)
        return sseResponse(WHOLE_ANSWER)
      })
      vi.stubGlobal('fetch', f)
      const result = await callClaude({ ...REQ, image: { mediaType: 'image/jpeg', data: '/9j/AAAA' } }, { apiKey: FAKE_KEY })
      expect(result).toMatchObject({ ok: true, text: '{"summary":"ok"}' })
      expect(f).toHaveBeenCalledTimes(1)
      const sent = JSON.parse(String(bodies[0])) as { messages: unknown; output_config: unknown }
      expect(sent.messages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/AAAA' } },
            { type: 'text', text: '{"month":"2026-10"}' },
          ],
        },
      ])
      expect(sent.output_config).toEqual({ effort: 'medium', format: { type: 'json_schema', schema: REQ.schema } })
    })
  })

  describe('AC-510.11 SDK 로그 끄기', () => {
    it('AC-510.11 깨진 조각이 와도 console의 어느 함수도 불리지 않는다(결과는 E-AI-FAILED)', async () => {
      const c = freshConsole()
      const f = fakeFetch(() => sseResponse([START, MALFORMED]))
      expect(await callClaude(REQ, { apiKey: FAKE_KEY })).toEqual(FAILED)
      expect(f).toHaveBeenCalledTimes(1)
      expectSilent(c)
    })

    it('AC-510.11 ANTHROPIC_LOG=debug로 끝까지 받아도 console의 어느 함수도 불리지 않는다', async () => {
      vi.stubEnv('ANTHROPIC_LOG', 'debug')
      const c = freshConsole()
      fakeFetch(() => sseResponse(WHOLE_ANSWER))
      expect(await callClaude(REQ, { apiKey: FAKE_KEY })).toMatchObject({ ok: true, text: '{"summary":"ok"}' })
      expectSilent(c)
    })

    it('AC-510.11 ANTHROPIC_LOG=debug로 재시도되는 HTTP 500이 와도 console의 어느 함수도 불리지 않고, 재시도는 그대로 한 번이다(결과는 E-AI-BUSY)', async () => {
      vi.stubEnv('ANTHROPIC_LOG', 'debug')
      const c = freshConsole()
      const f = fakeFetch(() => jsonError(500, 'api_error'))
      expect(await callClaude(REQ, { apiKey: FAKE_KEY })).toEqual(BUSY)
      expect(f).toHaveBeenCalledTimes(2)
      expectSilent(c)
    })
  })
})
