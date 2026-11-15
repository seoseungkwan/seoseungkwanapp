import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_MODEL, IMAGE_TIMEOUT_MS, IMAGE_URL, callImage } from './openaiImage'

// OpenAI 그림 부르기 (specs/forms-themes REQ-4606 AC-4606.4·AC-4606.5, design.md 4-3절, TASK-7).
// 진짜 OpenAI·네트워크는 쓰지 않는다: 가짜 fetch만 넣고, 열쇠는 가짜 글 'test-key'뿐이다(.env.local을 읽지 않는다)

const KEY = 'test-key'
const PROMPT = '시험 프롬프트 글'
// '/9j/'로 시작하는 작은 JPEG base64 글(모양만, 28자)
const JPEG_OK = '/9j/4AAQSkZJRgABAQAAAQABAAD/'
// 오류 답·던진 오류에 든 글자. 결과·로그에 새어 나오면 안 된다
const SECRET = '비밀 글자 sk-live-xyz'

type Call = { url: string; init: RequestInit }

// 정해 둔 답을 돌려주는 가짜 fetch. 부른 주소와 init을 남긴다
function fakeFetch(answer: (init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return answer(init ?? {})
  }) as unknown as typeof fetch
  return { impl, calls }
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const okAnswer = (b64: unknown, usage?: unknown) => json(200, { created: 1, data: [{ b64_json: b64 }], ...(usage === undefined ? {} : { usage }) })
const errorAnswer = (status: number, code: string | null) =>
  json(status, { error: { message: `${SECRET} ${PROMPT}`, type: 'invalid_request_error', param: null, code } })

const call = (impl: typeof fetch, extra: { apiKey?: string; timeoutMs?: number } = {}) => callImage(PROMPT, { fetchImpl: impl, apiKey: KEY, ...extra })

let consoleSpies: ReturnType<typeof vi.spyOn>[] = []
beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
})
afterEach(() => {
  for (const s of consoleSpies) s.mockRestore()
  vi.unstubAllEnvs()
})
function expectNoConsole() {
  for (const s of consoleSpies) expect(s).not.toHaveBeenCalled()
}

describe('AC-4606.4: OpenAI 그림 부르기의 주소·머리·몸통', () => {
  it('AC-4606.4: 정해 둔 값 — 모델 gpt-image-2.6-flare, 주소 images/generations, 시간 한도 50초', () => {
    expect(IMAGE_MODEL).toBe('gpt-image-2.6-flare')
    expect(IMAGE_URL).toBe('https://api.openai.com/v1/images/generations')
    expect(IMAGE_TIMEOUT_MS).toBe(50_000)
  })

  it('AC-4606.4: POST 한 번, 머리는 Authorization: Bearer <열쇠>·Content-Type: application/json 둘뿐이고 시간 신호를 넣는다', async () => {
    const { impl, calls } = fakeFetch(() => okAnswer(JPEG_OK))
    await call(impl)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.openai.com/v1/images/generations')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers).toEqual({ Authorization: 'Bearer test-key', 'Content-Type': 'application/json' })
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it('AC-4606.4: 몸통 열쇠는 일곱 개뿐이고 값은 정해 둔 그대로다(병원·사용자 칸 없음)', async () => {
    const { impl, calls } = fakeFetch(() => okAnswer(JPEG_OK))
    await call(impl)
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>
    expect(body).toEqual({
      model: 'gpt-image-2.6-flare',
      prompt: PROMPT,
      size: '1584x2240',
      quality: 'medium',
      n: 1,
      output_format: 'jpeg',
      output_compression: 88,
    })
    expect(Object.keys(body)).toHaveLength(7)
    for (const key of ['user', 'hospital', 'hospital_id', 'metadata']) expect(body).not.toHaveProperty(key)
  })

  it('AC-4606.4: 열쇠를 주지 않으면 서버 환경 변수 OPENAI_API_KEY를 쓴다', async () => {
    vi.stubEnv('OPENAI_API_KEY', KEY)
    const { impl, calls } = fakeFetch(() => okAnswer(JPEG_OK))
    await callImage(PROMPT, { fetchImpl: impl })
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
  })

  it('AC-4606.5: 열쇠가 없으면(환경 변수 없음·빈 글) 부르지 않고 E-FORMS-BG-FAILED', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const { impl, calls } = fakeFetch(() => okAnswer(JPEG_OK))
    await expect(callImage(PROMPT, { fetchImpl: impl })).resolves.toEqual({ ok: false, code: 'E-FORMS-BG-FAILED' })
    await expect(callImage(PROMPT, { fetchImpl: impl, apiKey: '' })).resolves.toEqual({ ok: false, code: 'E-FORMS-BG-FAILED' })
    expect(calls).toHaveLength(0)
  })
})

describe('AC-4606.5: 답 나누기', () => {
  it('AC-4606.5: fetch가 던지면(연결 끊김) E-AI-BUSY', async () => {
    const rejecting = fakeFetch(() => Promise.reject(new TypeError(`fetch failed ${SECRET}`)))
    await expect(call(rejecting.impl)).resolves.toEqual({ ok: false, code: 'E-AI-BUSY' })
    const throwing = (() => {
      throw new Error(SECRET)
    }) as unknown as typeof fetch
    await expect(call(throwing)).resolves.toEqual({ ok: false, code: 'E-AI-BUSY' })
    expectNoConsole()
  })

  it('AC-4606.5: 시간을 넘기면(짧은 timeoutMs) 신호가 끊고 E-AI-BUSY', async () => {
    const hanging = fakeFetch(
      (init) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    await expect(call(hanging.impl, { timeoutMs: 20 })).resolves.toEqual({ ok: false, code: 'E-AI-BUSY' })
    expect(hanging.calls[0].init.signal?.aborted).toBe(true)
  })

  it('AC-4606.5: 429 insufficient_quota·400 billing_hard_limit_reached는 E-FORMS-BG-QUOTA', async () => {
    for (const [status, code] of [
      [429, 'insufficient_quota'],
      [400, 'billing_hard_limit_reached'],
    ] as const) {
      const { impl } = fakeFetch(() => errorAnswer(status, code))
      await expect(call(impl), `${status} ${code}`).resolves.toEqual({ ok: false, code: 'E-FORMS-BG-QUOTA' })
    }
  })

  it('AC-4606.5: 그 밖의 429·500·503(JSON 아닌 몸통 포함)은 E-AI-BUSY', async () => {
    const answers = [
      () => errorAnswer(429, 'rate_limit_exceeded'),
      () => errorAnswer(429, null),
      () => new Response('Too Many Requests', { status: 429 }),
      () => errorAnswer(500, 'server_error'),
      () => new Response('<html>503</html>', { status: 503 }),
      () => errorAnswer(503, null),
      // 400 billing 글자가 429가 아닌 곳에 오거나, 429 quota 글자가 400에 오면 한도가 아니다
      () => errorAnswer(429, 'billing_hard_limit_reached'),
    ]
    for (const answer of answers) {
      const { impl } = fakeFetch(answer)
      await expect(call(impl)).resolves.toEqual({ ok: false, code: 'E-AI-BUSY' })
    }
  })

  it('AC-4606.5: 400 moderation_blocked·401 열쇠 틀림·그 밖의 2xx 아닌 답은 E-FORMS-BG-FAILED', async () => {
    const answers = [
      () => errorAnswer(400, 'moderation_blocked'),
      () => errorAnswer(400, 'insufficient_quota'),
      () => errorAnswer(401, 'invalid_api_key'),
      () => errorAnswer(403, null),
      () => new Response('not found', { status: 404 }),
      () => new Response('bad', { status: 400 }),
    ]
    for (const answer of answers) {
      const { impl } = fakeFetch(answer)
      await expect(call(impl)).resolves.toEqual({ ok: false, code: 'E-FORMS-BG-FAILED' })
    }
  })

  it('AC-4606.5: 200인데 JSON 아님·data 없음·b64_json 없음·PNG base64·3,000,001바이트면 E-FORMS-BG-FAILED', async () => {
    const big = `/9j/${'A'.repeat(4_000_000 - 4)}` // 4,000,000자 = 3,000,000바이트(한도 그대로)
    const over = `/9j/${'A'.repeat(4_000_004 - 6)}==` // 4,000,004자 = ⌊3,000,003⌋ − '=' 둘 = 3,000,001바이트
    expect([JPEG_OK.length % 4, big.length, over.length]).toEqual([0, 4_000_000, 4_000_004])
    const answers = [
      () => new Response('<html>ok</html>', { status: 200 }),
      () => json(200, { created: 1 }),
      () => json(200, { data: [] }),
      () => json(200, { data: [{ url: 'https://example.com/a.jpg' }] }),
      () => json(200, { data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAE=' }] }),
      () => json(200, { data: [{ b64_json: 42 }] }),
      () => okAnswer(over),
    ]
    for (const answer of answers) {
      const { impl } = fakeFetch(answer)
      await expect(call(impl)).resolves.toEqual({ ok: false, code: 'E-FORMS-BG-FAILED' })
    }
    // 3,000,000바이트 이하면 받는다(한도 바로 아래)
    const { impl } = fakeFetch(() => okAnswer(big))
    await expect(call(impl)).resolves.toMatchObject({ ok: true, jpeg: big })
  })

  it('AC-4606.5: 정상 답이면 base64 글을 그대로, 사용량은 input_tokens·output_tokens로 돌려준다', async () => {
    const { impl } = fakeFetch(() => okAnswer(JPEG_OK, { input_tokens: 200, output_tokens: 1868, total_tokens: 2068 }))
    await expect(call(impl)).resolves.toEqual({ ok: true, jpeg: JPEG_OK, usage: { inputTokens: 200, outputTokens: 1868 } })
    const zero = fakeFetch(() => okAnswer(JPEG_OK, { input_tokens: 0, output_tokens: 0 }))
    await expect(call(zero.impl)).resolves.toEqual({ ok: true, jpeg: JPEG_OK, usage: { inputTokens: 0, outputTokens: 0 } })
  })

  it('AC-4606.5: 사용량 칸이 없거나 음수·정수 아님·글자면 사용량은 null(그림은 그대로)', async () => {
    const usages = [
      undefined,
      null,
      {},
      { input_tokens: 200 },
      { output_tokens: 1868 },
      { input_tokens: -1, output_tokens: 1868 },
      { input_tokens: 200, output_tokens: -5 },
      { input_tokens: 1.5, output_tokens: 1868 },
      { input_tokens: '200', output_tokens: 1868 },
    ]
    for (const usage of usages) {
      const { impl } = fakeFetch(() => (usage === undefined ? okAnswer(JPEG_OK) : okAnswer(JPEG_OK, usage)))
      await expect(call(impl), JSON.stringify(usage)).resolves.toEqual({ ok: true, jpeg: JPEG_OK, usage: null })
    }
  })

  it('AC-4606.5: 결과에는 번호만 있고 OpenAI 오류 글·프롬프트·열쇠가 없으며 console을 쓰지 않는다', async () => {
    const results = []
    for (const answer of [() => errorAnswer(400, 'moderation_blocked'), () => errorAnswer(429, 'insufficient_quota'), () => errorAnswer(500, null)]) {
      const { impl } = fakeFetch(answer)
      results.push(await call(impl))
    }
    const rejecting = fakeFetch(() => Promise.reject(new Error(SECRET)))
    results.push(await call(rejecting.impl))
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual(['code', 'ok'])
      const text = JSON.stringify(result)
      for (const word of [SECRET, PROMPT, KEY, 'moderation_blocked', 'insufficient_quota']) expect(text).not.toContain(word)
    }
    expectNoConsole()
  })
})

describe('AC-4606.4: openaiImage.ts 소스', () => {
  const source = () => readFileSync(fileURLToPath(new URL('./openaiImage.ts', import.meta.url)), 'utf8')

  it('AC-4606.4: 첫 줄이 server-only이고, console·SDK 꾸러미·Anthropic 열쇠가 없다(fetch만)', () => {
    const text = source()
    expect(text.split(/\r?\n/)[0]).toBe("import 'server-only'")
    expect(text).not.toMatch(/console\./)
    expect(text).not.toMatch(/from\s+['"]openai['"]|require\(\s*['"]openai['"]\s*\)/)
    expect(text).not.toMatch(/@anthropic-ai|ANTHROPIC_API_KEY|NEXT_PUBLIC_/)
    expect(text).toContain('OPENAI_API_KEY')
  })
})
