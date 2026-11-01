import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from '@anthropic-ai/sdk'
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageStreamParams,
  BetaStopReason,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_TOKENS, MODEL, callClaude, type AnthropicLike } from './claude'

// Claude 부르기(spec ai-report design.md 'Claude 부르기'). 진짜 SDK 네트워크는 부르지 않는다 — 가짜 클라이언트만 넣는다
// 열쇠는 늘 가짜 글자(sk-ant-fake-…)다

const FAKE_KEY = 'sk-ant-fake-test-key'
const REQ = { system: '지시문', user: '{"month":"2026-10"}', schema: { type: 'object', properties: {} } }

function text(t: string): BetaContentBlock {
  return { type: 'text', text: t, citations: null }
}

function message(
  over: { content?: BetaContentBlock[]; stop_reason?: BetaStopReason; model?: string; input?: number; output?: number } = {},
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
      iterations: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      speed: null,
    },
  }
}

// stream이 받은 인자를 기록하고, finalMessage()가 정해 둔 답을 돌려주거나 던진다
function fakeClient(result: BetaMessage | Error) {
  const calls: BetaMessageStreamParams[] = []
  const client: AnthropicLike = {
    beta: {
      messages: {
        stream(params) {
          calls.push(params)
          return {
            finalMessage: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
          }
        },
      },
    },
  }
  return { client, calls }
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
