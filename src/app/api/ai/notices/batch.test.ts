import { APIError } from '@anthropic-ai/sdk'
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { BatchCreateParams, MessageBatch, MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches'
import type { ContentBlock, Message, StopReason } from '@anthropic-ai/sdk/resources/messages/messages'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { costMicroUsd } from '@/lib/ai/cost'
import { MAX_TOKENS, MODEL, type ClaudeRequest } from '../claude'
import {
  BATCH_MAX_BYTES,
  BATCH_MAX_COUNT,
  batchCostMicroUsd,
  readBatch,
  submitBatch,
  type BatchClientLike,
  type BatchItem,
} from './batch'

// 고시·공지 일괄 요약(specs/notices AC-7412.2·AC-7412.3). 네트워크·진짜 Claude는 쓰지 않는다
// 보통은 가짜 클라이언트를 넣고, 맨 끝 묶음만 진짜 SDK 클래스 + 가짜 fetch로 SDK 이름·주소·몸통 모양을 지킨다. 열쇠는 늘 가짜 글자다

const FAKE_KEY = 'sk-ant-fake-test-key'
const SCHEMA = {
  type: 'object',
  properties: { related: { type: 'boolean' } },
  required: ['related'],
  additionalProperties: false,
}
const BLOCKS: BetaContentBlockParam[] = [
  { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQKJcfsj6IK' } },
  { type: 'text', text: '<notice>본문</notice>' },
]

function noticeId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

function item(n: number, user: ClaudeRequest['user'] = BLOCKS, over: Partial<ClaudeRequest> = {}): BatchItem {
  return { id: noticeId(n), req: { system: '지시문', user, schema: SCHEMA, effort: 'medium', ...over } }
}

function text(t: string): ContentBlock {
  return { type: 'text', text: t, citations: null }
}

function message(
  over: { content?: ContentBlock[]; stop_reason?: StopReason | null; model?: string; input?: number; output?: number } = {},
): Message {
  return {
    id: 'msg_fake',
    type: 'message',
    role: 'assistant',
    model: over.model ?? 'claude-opus-5-5',
    content: over.content ?? [text('{"related":true}')],
    stop_reason: over.stop_reason === undefined ? 'end_turn' : over.stop_reason,
    stop_sequence: null,
    stop_details: null,
    container: null,
    diagnostics: null,
    usage: {
      input_tokens: over.input ?? 1000,
      output_tokens: over.output ?? 200,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: 'batch',
      speed: null,
    },
  }
}

function succeeded(id: string, m: Message): MessageBatchIndividualResponse {
  return { custom_id: id, result: { type: 'succeeded', message: m } }
}

function errored(id: string): MessageBatchIndividualResponse {
  return {
    custom_id: id,
    result: { type: 'errored', error: { type: 'error', request_id: null, error: { type: 'invalid_request_error', message: '가짜 오류' } } },
  }
}

function errorBody(type: string) {
  return { type: 'error', error: { type, message: `가짜 ${type}` } }
}

type FakeOptions = {
  create?: { id: string } | Error
  status?: MessageBatch['processing_status'] | Error
  results?: MessageBatchIndividualResponse[] | Error
  // 몇 줄을 준 뒤 읽기가 깨진다
  breakAfter?: number
}

// create·retrieve·results가 받은 인자를 적고, 정해 둔 답을 주거나 던진다
function fakeBatchClient(opts: FakeOptions = {}) {
  const created: BatchCreateParams[] = []
  const createOptions: ({ signal?: AbortSignal } | undefined)[] = []
  const retrieved: string[] = []
  const resultsAsked: string[] = []
  const client: BatchClientLike = {
    messages: {
      batches: {
        async create(params, options) {
          created.push(params)
          createOptions.push(options)
          if (opts.create instanceof Error) throw opts.create
          return opts.create ?? { id: 'msgbatch_fake01' }
        },
        async retrieve(id) {
          retrieved.push(id)
          if (opts.status instanceof Error) throw opts.status
          return { processing_status: opts.status ?? 'ended' }
        },
        async results(id) {
          resultsAsked.push(id)
          if (opts.results instanceof Error) throw opts.results
          const rows = opts.results ?? []
          const breakAfter = opts.breakAfter
          return (async function* () {
            for (const [i, row] of rows.entries()) {
              if (breakAfter !== undefined && i === breakAfter) throw new Error('가짜 끊김')
              yield row
            }
          })()
        },
      },
    },
  }
  return { client, created, createOptions, retrieved, resultsAsked }
}

function silentConsole() {
  return (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AC-7412.2 submitBatch 요청 모양', () => {
  it('AC-7412.2 한도 상수: 몸통 합 50,000,000바이트 · 200개', () => {
    expect(BATCH_MAX_BYTES).toBe(50_000_000)
    expect(BATCH_MAX_COUNT).toBe(200)
  })

  it('AC-7412.2 messages.batches.create를 한 번 부르고 custom_id는 글 id, params는 model·max_tokens·output_config·system·messages만이다', async () => {
    const { client, created } = fakeBatchClient()
    await submitBatch([item(1), item(2)], { client, apiKey: FAKE_KEY })

    expect(created).toHaveLength(1)
    expect(Object.keys(created[0])).toEqual(['requests'])
    const reqs = created[0].requests
    expect(reqs.map((r) => r.custom_id)).toEqual([noticeId(1), noticeId(2)])
    for (const r of reqs) {
      expect(Object.keys(r).sort()).toEqual(['custom_id', 'params'])
      expect(Object.keys(r.params).sort()).toEqual(['max_tokens', 'messages', 'model', 'output_config', 'system'])
      expect(r.params).toEqual({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        system: '지시문',
        messages: [{ role: 'user', content: BLOCKS }],
      })
    }
  })

  it('AC-7412.2 stream·fallbacks·betas·thinking 칸은 어디에도 없다', async () => {
    const { client, created } = fakeBatchClient()
    await submitBatch([item(1)], { client, apiKey: FAKE_KEY })
    const p = created[0].requests[0].params
    for (const key of ['stream', 'fallbacks', 'betas', 'thinking']) {
      expect(p).not.toHaveProperty(key)
      expect(created[0]).not.toHaveProperty(key)
    }
  })

  it("AC-7412.2 effort는 요청 것을 쓰고(low) 없으면 medium, 글자 user도 그대로 보낸다", async () => {
    const { client, created } = fakeBatchClient()
    const noEffort: BatchItem = { id: noticeId(2), req: { system: 's', user: '<notice>글</notice>', schema: SCHEMA } }
    await submitBatch([item(1, BLOCKS, { effort: 'low' }), noEffort], { client, apiKey: FAKE_KEY })
    const [low, none] = created[0].requests
    expect(low.params.output_config?.effort).toBe('low')
    expect(none.params.output_config?.effort).toBe('medium')
    expect(none.params.messages).toEqual([{ role: 'user', content: '<notice>글</notice>' }])
  })

  it('AC-7412.2 성공하면 일괄 id·보낸 글 id(차례대로)·못 담은 것(없음)을 돌려준다', async () => {
    const { client } = fakeBatchClient({ create: { id: 'msgbatch_01abc' } })
    expect(await submitBatch([item(1), item(2), item(3)], { client, apiKey: FAKE_KEY })).toEqual({
      ok: true,
      batchId: 'msgbatch_01abc',
      sent: [noticeId(1), noticeId(2), noticeId(3)],
      left: [],
    })
  })

  it('AC-7412.2 부를 때 끊기 신호를 넣는다', async () => {
    const { client, createOptions } = fakeBatchClient()
    await submitBatch([item(1)], { client, apiKey: FAKE_KEY })
    expect(createOptions[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(createOptions[0]?.signal?.aborted).toBe(false)
  })
})

describe('AC-7412.2 submitBatch 담기 한도', () => {
  it('AC-7412.2 205개면 앞의 200개만 담고 뒤의 5개는 돌려준다', async () => {
    const items = Array.from({ length: 205 }, (_, i) => item(i))
    const { client, created } = fakeBatchClient()
    const result = await submitBatch(items, { client, apiKey: FAKE_KEY })

    expect(created[0].requests).toHaveLength(200)
    expect(created[0].requests.map((r) => r.custom_id)).toEqual(items.slice(0, 200).map((x) => x.id))
    expect(result).toEqual({ ok: true, batchId: 'msgbatch_fake01', sent: items.slice(0, 200).map((x) => x.id), left: items.slice(200) })
    if (!result.ok) throw new Error('성공이어야 한다')
    expect(result.left[0]).toBe(items[200])
  })

  // 한 줄 몸통 = JSON.stringify({ custom_id, params })의 UTF-8 바이트. 빈 글자 user로 붙는 몫을 재고 'a'로 채워 정확히 맞춘다
  async function overheadBytes(n: number): Promise<number> {
    const { client, created } = fakeBatchClient()
    await submitBatch([item(n, '')], { client, apiKey: FAKE_KEY })
    return Buffer.byteLength(JSON.stringify(created[0].requests[0]), 'utf8')
  }

  it('AC-7412.2 몸통 합이 정확히 50,000,000바이트면 담는다', async () => {
    const filler = 'a'.repeat(BATCH_MAX_BYTES - (await overheadBytes(1)))
    const { client, created } = fakeBatchClient()
    const result = await submitBatch([item(1, filler)], { client, apiKey: FAKE_KEY })
    expect(Buffer.byteLength(JSON.stringify(created[0].requests[0]), 'utf8')).toBe(BATCH_MAX_BYTES)
    expect(result).toMatchObject({ ok: true, sent: [noticeId(1)], left: [] })
  })

  it('AC-7412.2 꽉 찬 뒤의 작은 요청은 담지 않고 돌려준다', async () => {
    const full = item(1, 'a'.repeat(BATCH_MAX_BYTES - (await overheadBytes(1))))
    const small = item(2, '작은 글')
    const { client, created } = fakeBatchClient()
    const result = await submitBatch([full, small], { client, apiKey: FAKE_KEY })
    expect(created[0].requests.map((r) => r.custom_id)).toEqual([noticeId(1)])
    expect(result).toMatchObject({ ok: true, sent: [noticeId(1)] })
    if (!result.ok) throw new Error('성공이어야 한다')
    expect(result.left).toEqual([small])
  })

  it('AC-7412.2 혼자서 1바이트 넘는 요청은 담지 않고 돌려주되, 뒤의 담을 수 있는 것은 담는다', async () => {
    const over = item(1, 'a'.repeat(BATCH_MAX_BYTES - (await overheadBytes(1)) + 1))
    const small = item(2, '작은 글')
    const { client, created } = fakeBatchClient()
    const result = await submitBatch([over, small], { client, apiKey: FAKE_KEY })
    expect(created[0].requests.map((r) => r.custom_id)).toEqual([noticeId(2)])
    expect(result).toMatchObject({ ok: true, sent: [noticeId(2)] })
    if (!result.ok) throw new Error('성공이어야 한다')
    expect(result.left).toEqual([over])
  })

  it('AC-7412.2 글자 수가 아니라 바이트로 센다(한글 한 글자 = 3바이트)', async () => {
    // 900만 자 × 3바이트 = 2,700만 바이트. 글자 수 합(1,800만)은 한도 안이지만 바이트 합(5,400만)은 넘는다
    const first = item(1, '가'.repeat(9_000_000))
    const second = item(2, '가'.repeat(9_000_000))
    const { client, created } = fakeBatchClient()
    const result = await submitBatch([first, second], { client, apiKey: FAKE_KEY })
    expect(created[0].requests.map((r) => r.custom_id)).toEqual([noticeId(1)])
    if (!result.ok) throw new Error('성공이어야 한다')
    expect(result.left).toEqual([second])
  })

  it('AC-7412.2 담을 것이 하나도 없으면 부르지 않고 모두 돌려준다', async () => {
    const over = item(1, 'a'.repeat(BATCH_MAX_BYTES))
    const { client, created } = fakeBatchClient()
    expect(await submitBatch([over], { client, apiKey: FAKE_KEY })).toEqual({ ok: false, left: [over] })
    expect(created).toHaveLength(0)
  })

  it('AC-7412.2 빈 목록이면 부르지 않는다', async () => {
    const { client, created } = fakeBatchClient()
    expect(await submitBatch([], { client, apiKey: FAKE_KEY })).toEqual({ ok: false, left: [] })
    expect(created).toHaveLength(0)
  })
})

describe('AC-7412.2 submitBatch 실패', () => {
  it('AC-7412.2 create가 던지면(500) 모두 돌려주고 console에 쓰지 않는다', async () => {
    const spies = silentConsole()
    const items = [item(1), item(2)]
    const { client } = fakeBatchClient({ create: APIError.generate(500, errorBody('api_error'), undefined, new Headers()) })
    expect(await submitBatch(items, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, left: items })
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })

  it('AC-7412.2 한도를 넘어 못 담은 것도 함께 돌려준다', async () => {
    const items = Array.from({ length: 201 }, (_, i) => item(i))
    const { client } = fakeBatchClient({ create: new Error('boom') })
    expect(await submitBatch(items, { client, apiKey: FAKE_KEY })).toEqual({ ok: false, left: items })
  })

  it('AC-7412.2 열쇠가 없으면 부르지 않고 모두 돌려준다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { client, created } = fakeBatchClient()
    expect(await submitBatch([item(1)], { client })).toEqual({ ok: false, left: [item(1)] })
    expect(created).toHaveLength(0)
  })

  it('AC-7412.2 deps.apiKey가 없으면 ANTHROPIC_API_KEY 환경 변수를 쓴다', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-fake-env-key')
    const { client, created } = fakeBatchClient()
    expect((await submitBatch([item(1)], { client })).ok).toBe(true)
    expect(created).toHaveLength(1)
  })
})

describe('AC-7412.3 readBatch', () => {
  it("AC-7412.3 끝나지 않았으면(in_progress·canceling) 'processing'이고 결과는 읽지 않는다", async () => {
    for (const status of ['in_progress', 'canceling'] as const) {
      const { client, retrieved, resultsAsked } = fakeBatchClient({ status })
      expect(await readBatch('msgbatch_01abc', { client, apiKey: FAKE_KEY })).toBe('processing')
      expect(retrieved).toEqual(['msgbatch_01abc'])
      expect(resultsAsked).toEqual([])
    }
  })

  it('AC-7412.3 끝났으면 custom_id마다 결과다 — 차례가 섞여 와도 id로 맞춘다', async () => {
    const ok1 = message({ content: [{ type: 'thinking', thinking: '', signature: 'sig' }, text('{"related":'), text('true}')], input: 3000, output: 150 })
    const ok2 = message({ content: [text('{"related":false}')], input: 1200, output: 90 })
    const { client, resultsAsked } = fakeBatchClient({
      results: [succeeded(noticeId(2), ok2), errored(noticeId(9)), succeeded(noticeId(1), ok1)],
    })
    const result = await readBatch('msgbatch_01abc', { client, apiKey: FAKE_KEY })

    expect(resultsAsked).toEqual(['msgbatch_01abc'])
    if (!(result instanceof Map)) throw new Error('Map이어야 한다')
    expect([...result.keys()].sort()).toEqual([noticeId(1), noticeId(2), noticeId(9)])
    expect(result.get(noticeId(1))).toEqual({ ok: true, text: '{"related":true}', usage: { inputTokens: 3000, outputTokens: 150, model: 'claude-opus-5-5' } })
    expect(result.get(noticeId(2))).toEqual({ ok: true, text: '{"related":false}', usage: { inputTokens: 1200, outputTokens: 90, model: 'claude-opus-5-5' } })
    expect(result.get(noticeId(9))).toEqual({ ok: false })
  })

  it('AC-7412.3 errored·expired·canceled는 { ok: false }다', async () => {
    const { client } = fakeBatchClient({
      results: [
        errored(noticeId(1)),
        { custom_id: noticeId(2), result: { type: 'expired' } },
        { custom_id: noticeId(3), result: { type: 'canceled' } },
      ],
    })
    const result = await readBatch('msgbatch_01abc', { client, apiKey: FAKE_KEY })
    if (!(result instanceof Map)) throw new Error('Map이어야 한다')
    expect(Object.fromEntries(result)).toEqual({ [noticeId(1)]: { ok: false }, [noticeId(2)]: { ok: false }, [noticeId(3)]: { ok: false } })
  })

  it('AC-7412.3 succeeded라도 refusal·max_tokens로 끝났으면 실패이고, 비용을 세게 사용량은 함께 준다', async () => {
    const { client } = fakeBatchClient({
      results: [
        succeeded(noticeId(1), message({ stop_reason: 'refusal', content: [], input: 900, output: 0 })),
        succeeded(noticeId(2), message({ stop_reason: 'max_tokens', content: [text('{"rel')], input: 1500, output: 16000 })),
      ],
    })
    const result = await readBatch('msgbatch_01abc', { client, apiKey: FAKE_KEY })
    if (!(result instanceof Map)) throw new Error('Map이어야 한다')
    expect(result.get(noticeId(1))).toEqual({ ok: false, usage: { inputTokens: 900, outputTokens: 0, model: 'claude-opus-5-5' } })
    expect(result.get(noticeId(2))).toEqual({ ok: false, usage: { inputTokens: 1500, outputTokens: 16000, model: 'claude-opus-5-5' } })
  })

  it('AC-7412.3 model_context_window_exceeded도 max_tokens처럼 답이 잘린 것이라 실패다', async () => {
    const { client } = fakeBatchClient({
      results: [succeeded(noticeId(1), message({ stop_reason: 'model_context_window_exceeded', content: [text('{"rel')], input: 990_000, output: 10 }))],
    })
    const result = await readBatch('msgbatch_01abc', { client, apiKey: FAKE_KEY })
    if (!(result instanceof Map)) throw new Error('Map이어야 한다')
    expect(result.get(noticeId(1))).toEqual({ ok: false, usage: { inputTokens: 990_000, outputTokens: 10, model: 'claude-opus-5-5' } })
  })

  it('AC-7412.3 끝난 일괄에 결과 줄이 없으면 빈 Map이다', async () => {
    const { client } = fakeBatchClient({ results: [] })
    const result = await readBatch('msgbatch_01abc', { client, apiKey: FAKE_KEY })
    expect(result).toBeInstanceOf(Map)
    expect((result as Map<string, unknown>).size).toBe(0)
  })

  it("AC-7412.3 상태 읽기·결과 읽기가 던지거나 도중에 끊기면 'failed'(반쪽 결과를 주지 않는다), console에 쓰지 않는다", async () => {
    const spies = silentConsole()
    const rows = [succeeded(noticeId(1), message()), succeeded(noticeId(2), message())]
    const cases: FakeOptions[] = [
      { status: APIError.generate(404, errorBody('not_found_error'), undefined, new Headers()) },
      { results: APIError.generate(500, errorBody('api_error'), undefined, new Headers()) },
      { results: rows, breakAfter: 1 },
    ]
    for (const opts of cases) {
      const { client } = fakeBatchClient(opts)
      expect(await readBatch('msgbatch_01abc', { client, apiKey: FAKE_KEY })).toBe('failed')
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })

  it("AC-7412.3 열쇠가 없으면 부르지 않고 'failed'", async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const { client, retrieved } = fakeBatchClient()
    expect(await readBatch('msgbatch_01abc', { client })).toBe('failed')
    expect(retrieved).toEqual([])
  })
})

describe('AC-7412.3 일괄 비용', () => {
  it('AC-7412.3 costMicroUsd의 절반이다', () => {
    const u = { model: 'claude-opus-5-5', inputTokens: 3000, outputTokens: 150 }
    expect(costMicroUsd(u)).toBe(15_000)
    expect(batchCostMicroUsd(u)).toBe(7_500)
  })

  it('AC-7412.3 홀수면 버린다(모르는 모델 단가 5·25)', () => {
    const u = { model: 'claude-unknown', inputTokens: 1, outputTokens: 0 }
    expect(costMicroUsd(u)).toBe(5)
    expect(batchCostMicroUsd(u)).toBe(2)
    expect(batchCostMicroUsd({ model: 'claude-unknown', inputTokens: 3, outputTokens: 1 })).toBe(20)
  })

  it('AC-7412.3 사용량 0이면 0', () => {
    expect(batchCostMicroUsd({ model: 'claude-opus-5-5', inputTokens: 0, outputTokens: 0 })).toBe(0)
  })
})

// 진짜 SDK 클래스 + 가짜 fetch: 메서드 이름·주소·몸통·머리 모양이 SDK 판과 맞는지 본다
describe('AC-7412.2·AC-7412.3 진짜 SDK 클래스 + 가짜 fetch', () => {
  const BATCH_JSON = {
    id: 'msgbatch_01real',
    type: 'message_batch',
    processing_status: 'ended',
    request_counts: { processing: 0, succeeded: 1, errored: 1, canceled: 0, expired: 0 },
    created_at: '2026-11-21T00:00:00Z',
    ended_at: '2026-11-21T00:30:00Z',
    expires_at: '2026-11-22T00:00:00Z',
    archived_at: null,
    cancel_initiated_at: null,
    results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_01real/results',
  }

  type Seen = { url: string; method: string; headers: Headers; body: string | null }

  function fakeFetch(respond: (seen: Seen) => Response) {
    const seen: Seen[] = []
    const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const s: Seen = {
        url: String(input instanceof Request ? input.url : input),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: typeof init?.body === 'string' ? init.body : null,
      }
      seen.push(s)
      return respond(s)
    })
    vi.stubGlobal('fetch', f)
    return seen
  }

  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('가짜 fetch를 먼저 넣어야 한다'))))
    vi.stubEnv('ANTHROPIC_BASE_URL', undefined)
    vi.stubEnv('ANTHROPIC_LOG', undefined)
  })

  it('AC-7412.2 POST /v1/messages/batches에 { requests }만 보내고 anthropic-beta 머리가 없다', async () => {
    const seen = fakeFetch(() => json({ ...BATCH_JSON, processing_status: 'in_progress', results_url: null }))
    const result = await submitBatch([item(1)], { apiKey: FAKE_KEY })

    expect(result).toEqual({ ok: true, batchId: 'msgbatch_01real', sent: [noticeId(1)], left: [] })
    expect(seen).toHaveLength(1)
    expect(seen[0].method).toBe('POST')
    expect(seen[0].url).toBe('https://api.anthropic.com/v1/messages/batches')
    expect(seen[0].headers.has('anthropic-beta')).toBe(false)
    const body = JSON.parse(seen[0].body ?? 'null')
    expect(Object.keys(body)).toEqual(['requests'])
    expect(body.requests).toEqual([
      {
        custom_id: noticeId(1),
        params: {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
          system: '지시문',
          messages: [{ role: 'user', content: BLOCKS }],
        },
      },
    ])
  })

  it('AC-7412.3 상태를 읽고 results_url의 JSONL을 줄마다 읽는다', async () => {
    const lines = [succeeded(noticeId(1), message({ content: [text('{"related":true}')] })), errored(noticeId(2))]
    const seen = fakeFetch((s) => {
      if (s.url === BATCH_JSON.results_url) {
        return new Response(lines.map((l) => JSON.stringify(l)).join('\n') + '\n', { status: 200, headers: { 'content-type': 'application/binary' } })
      }
      return json(BATCH_JSON)
    })
    const result = await readBatch('msgbatch_01real', { apiKey: FAKE_KEY })

    if (!(result instanceof Map)) throw new Error('Map이어야 한다')
    expect(Object.fromEntries(result)).toEqual({
      [noticeId(1)]: { ok: true, text: '{"related":true}', usage: { inputTokens: 1000, outputTokens: 200, model: 'claude-opus-5-5' } },
      [noticeId(2)]: { ok: false },
    })
    expect(seen.every((s) => s.method === 'GET')).toBe(true)
    expect(seen[0].url).toBe('https://api.anthropic.com/v1/messages/batches/msgbatch_01real')
    expect(seen.at(-1)?.url).toBe(BATCH_JSON.results_url)
    expect(seen.some((s) => s.headers.has('anthropic-beta'))).toBe(false)
  })

  it("AC-7412.3 진행 중이면 결과 주소를 부르지 않고 'processing'", async () => {
    const seen = fakeFetch(() => json({ ...BATCH_JSON, processing_status: 'in_progress', results_url: null }))
    expect(await readBatch('msgbatch_01real', { apiKey: FAKE_KEY })).toBe('processing')
    expect(seen).toHaveLength(1)
  })

  it('AC-7412.2 ANTHROPIC_LOG=debug여도 console에 쓰지 않는다', async () => {
    vi.stubEnv('ANTHROPIC_LOG', 'debug')
    const c = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    vi.stubGlobal('console', c)
    fakeFetch(() => json({ ...BATCH_JSON, processing_status: 'in_progress', results_url: null }))
    expect((await submitBatch([item(1)], { apiKey: FAKE_KEY })).ok).toBe(true)
    expect((await readBatch('msgbatch_01real', { apiKey: FAKE_KEY }))).toBe('processing')
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) expect(c[m]).not.toHaveBeenCalled()
  })
})
