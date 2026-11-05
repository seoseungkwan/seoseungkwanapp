import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiErrorCode } from '@/types/aiReport'
import { analyzeMonth, loadMonth } from './reportClient'

// 시험 값은 모두 손으로 만든 가짜다. 진짜 네트워크는 쓰지 않는다

const CARD = { tag: 'up', text: '신환이 늘었어요', metric: 'total.newPatients', basis: '가짜 근거 줄' }
const REPORT = {
  month: '2026-10',
  partial: false,
  summary: '가짜 요약',
  cards: [CARD],
  model: 'claude-fake',
  createdAt: '2026-11-02T00:12:34.123456+00:00',
}
const USAGE = { calls: 3, tokens: 1200, costMicroUsd: 4500 }
const VIEW = { report: REPORT, stale: false, usage: USAGE }
const AI_CODES: AiErrorCode[] = ['E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED', 'E-AI-NO-DATA']

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const jsonAnswer = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

const rawAnswer = (body: string | null, status: number): Response => new Response(body, { status })

const htmlAnswer = (status: number): Response =>
  new Response('<html><body>Bad Gateway</body></html>', { status, headers: { 'Content-Type': 'text/html' } })

// 머리는 받았는데 몸통을 읽다 끊긴 응답. text·json 어느 쪽으로 읽어도 던진다
const cutAnswer = (status: number): Response =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.error(new Error('가짜 끊김'))
      },
    }),
    { status },
  )

// 진짜 브라우저가 redirect: 'manual'에서 주는 모양을 흉내 낸다. Response 생성자로는 status 0을 못 만든다.
// 숫자 판정·몸통 읽기를 함께 보려고 다른 경우에도 쓴다
function watchedAnswer(status: number, type: ResponseType = 'basic') {
  const json = vi.fn(async () => ({ code: 'E-AI-LIMIT' }))
  const text = vi.fn(async () => '{"code":"E-AI-LIMIT"}')
  return { response: { status, type, ok: false, json, text } as unknown as Response, json, text }
}

const answerWith = (make: () => Response): void => {
  fetchMock.mockImplementation(async () => make())
}

// 응답을 아예 못 받는 경우
const NO_ANSWER: Array<[string, () => void]> = [
  ['fetch가 거절함', () => fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))],
  ['fetch가 바로 던짐', () => fetchMock.mockImplementation(() => { throw new Error('가짜 바로 던짐') })],
  ['오류 객체가 아닌 값으로 거절함', () => fetchMock.mockRejectedValue('가짜 끊김')],
]

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (call === undefined) throw new Error('fetch를 부르지 않았어요')
  const [input, init] = call
  return { url: String(input), init: init ?? {} }
}

describe('analyzeMonth 보내기 (AC-707.1)', () => {
  beforeEach(() => answerWith(() => jsonAnswer({ report: REPORT })))

  it('AC-707.1: 주소가 정확히 /api/ai/report다(http로 시작하지 않음)', async () => {
    await analyzeMonth('2026-10')
    expect(lastCall().url).toBe('/api/ai/report')
  })

  it('AC-707.1: POST로 보낸다', async () => {
    await analyzeMonth('2026-10')
    expect(lastCall().init.method).toBe('POST')
  })

  it('AC-707.1: 몸통 글자가 정확히 {"month":"2026-10"}이다(숫자도 다른 칸도 없음)', async () => {
    await analyzeMonth('2026-10')
    expect(lastCall().init.body).toBe('{"month":"2026-10"}')
  })

  it('AC-707.1: 돌려보내는 응답을 따라가지 않는다(redirect: manual)', async () => {
    await analyzeMonth('2026-10')
    expect(lastCall().init.redirect).toBe('manual')
  })

  it('AC-707.1: 머리 Content-Type이 application/json이다', async () => {
    await analyzeMonth('2026-10')
    expect(new Headers(lastCall().init.headers).get('content-type')).toBe('application/json')
  })
})

describe('loadMonth 보내기 (AC-707.3)', () => {
  beforeEach(() => answerWith(() => jsonAnswer(VIEW)))

  it('AC-707.3: 주소에 달이 들어가고 같은 origin의 상대 경로다', async () => {
    await loadMonth('2026-10')
    expect(lastCall().url).toBe('/api/ai/report?month=2026-10')
  })

  it('AC-707.3: 달 글자를 주소에 넣을 때 인코딩한다', async () => {
    await loadMonth('2026 10&x=1')
    expect(lastCall().url).toBe('/api/ai/report?month=2026%2010%26x%3D1')
  })

  it('AC-707.3: GET이고 몸통이 없으며 redirect: manual, cache: no-store다', async () => {
    await loadMonth('2026-10')
    const { init } = lastCall()
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.redirect).toBe('manual')
    expect(init.cache).toBe('no-store')
  })
})

describe('analyzeMonth 답 판정 (AC-707.2)', () => {
  it('AC-707.2: 200 { report } → 그 리포트', async () => {
    answerWith(() => jsonAnswer({ report: REPORT }))
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'ok', report: REPORT })
  })

  it('AC-707.2: 답의 inputHash와 남는 칸은 리포트에 남지 않는다', async () => {
    answerWith(() => jsonAnswer({ report: { ...REPORT, inputHash: 'a'.repeat(64), extra: 1 }, extra: 2 }))
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'ok', report: REPORT })
  })

  it.each(AI_CODES)('AC-707.2: 몸통의 번호 %s → 그 번호', async (code) => {
    answerWith(() => jsonAnswer({ code }, 502))
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code })
  })

  it.each([200, 400, 402, 404, 500, 503])('AC-707.2: 상태 %i여도 몸통의 AI 번호가 그대로 쓰인다', async (status) => {
    answerWith(() => jsonAnswer({ code: 'E-AI-LIMIT' }, status))
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-LIMIT' })
  })

  it('AC-707.2: 200에 리포트와 AI 번호가 함께 오면 번호가 먼저다', async () => {
    answerWith(() => jsonAnswer({ code: 'E-AI-NO-DATA', report: REPORT }))
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-NO-DATA' })
  })

  it('AC-707.2: E-AI-READ 번호를 담은 502 JSON → E-AI-FAILED(읽기 번호는 AI 번호가 아님)', async () => {
    answerWith(() => jsonAnswer({ code: 'E-AI-READ' }, 502))
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })

  it('AC-707.2: E-AI-READ 번호와 정상 리포트가 함께 온 200은 번호를 지나쳐 리포트다', async () => {
    answerWith(() => jsonAnswer({ code: 'E-AI-READ', report: REPORT }))
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'ok', report: REPORT })
  })

  it.each<[string, unknown]>([
    ['모르는 번호', 'E-AI-WHAT'],
    ['다른 기능의 번호', 'E-PARSE-001'],
    ['소문자', 'e-ai-limit'],
    ['__proto__', '__proto__'],
    ['constructor', 'constructor'],
    ['toString', 'toString'],
    ['숫자', 1],
    ['null', null],
    ['참', true],
    ['번호 하나를 담은 배열', ['E-AI-LIMIT']],
    ['객체', { code: 'E-AI-LIMIT' }],
  ])('AC-707.2: code가 %s면 AI 번호가 아니라 E-AI-FAILED다', async (_name, code) => {
    answerWith(() => jsonAnswer({ code }, 500))
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })

  it('AC-707.2: 몸통의 __proto__ 칸에 번호를 숨겨도 그 번호로 읽지 않는다', async () => {
    answerWith(() => rawAnswer('{"__proto__":{"code":"E-AI-LIMIT"}}', 500))
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })

  it.each(NO_ANSWER)('AC-707.2: %s → E-AI-BUSY', async (_name, arrange) => {
    arrange()
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-BUSY' })
  })

  it.each([200, 400, 500])('AC-707.2: 상태 %i에서 몸통을 읽다 끊김 → E-AI-BUSY', async (status) => {
    answerWith(() => cutAnswer(status))
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-BUSY' })
  })

  it.each<[string, () => Response]>([
    ['몸통 없는 503', () => rawAnswer(null, 503)],
    ['빈 글자 503', () => rawAnswer('', 503)],
    ['공백뿐인 503', () => rawAnswer('  \n', 503)],
    ['몸통 없는 500', () => rawAnswer(null, 500)],
    ['몸통 없는 599', () => rawAnswer(null, 599)],
    ['HTML 502', () => htmlAnswer(502)],
    ['반쯤 잘린 JSON 500', () => rawAnswer('{"code":"E-AI-LIM', 500)],
  ])('AC-707.2: %s → E-AI-BUSY', async (_name, make) => {
    answerWith(make)
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-BUSY' })
  })

  it.each<[string, () => Response]>([
    ['번호 없는 JSON 500', () => jsonAnswer({ message: '가짜' }, 500)],
    ['JSON null 500', () => rawAnswer('null', 500)],
    ['JSON 배열 500', () => jsonAnswer([], 500)],
    ['JSON 글자 500', () => jsonAnswer('가짜', 500)],
    ['JSON 숫자 500', () => jsonAnswer(1, 500)],
    ['리포트가 있어도 500', () => jsonAnswer({ report: REPORT }, 500)],
    ['모양 틀린 리포트 200', () => jsonAnswer({ report: { ...REPORT, month: 'x' } })],
    ['리포트 칸 없는 200', () => jsonAnswer({})],
    ['report가 null인 200', () => jsonAnswer({ report: null })],
    ['JSON null 200', () => rawAnswer('null', 200)],
    ['JSON 배열 200', () => jsonAnswer([])],
    ['JSON 아닌 200', () => rawAnswer('가짜', 200)],
    ['빈 200', () => rawAnswer('', 200)],
    ['HTML 200', () => htmlAnswer(200)],
    ['정상 리포트 201', () => jsonAnswer({ report: REPORT }, 201)],
    ['몸통 없는 400', () => rawAnswer(null, 400)],
    ['JSON 아닌 400', () => rawAnswer('가짜', 400)],
    ['몸통 없는 404', () => rawAnswer(null, 404)],
    ['HTML 499', () => htmlAnswer(499)],
  ])('AC-707.2: %s → E-AI-FAILED', async (_name, make) => {
    answerWith(make)
    await expect(analyzeMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })
})

describe('loadMonth 답 판정 (AC-707.3)', () => {
  it('AC-707.3: 정상 리포트 → ok', async () => {
    answerWith(() => jsonAnswer(VIEW))
    await expect(loadMonth('2026-10')).resolves.toStrictEqual({ kind: 'ok', view: VIEW })
  })

  it('AC-707.3: report: null → ok', async () => {
    const view = { report: null, stale: false, usage: USAGE }
    answerWith(() => jsonAnswer(view))
    await expect(loadMonth('2026-10')).resolves.toStrictEqual({ kind: 'ok', view })
  })

  it('AC-707.3: stale: true가 그대로 온다', async () => {
    const view = { ...VIEW, stale: true }
    answerWith(() => jsonAnswer(view))
    await expect(loadMonth('2026-10')).resolves.toStrictEqual({ kind: 'ok', view })
  })

  it('AC-707.3: 사용량이 모두 0이어도 맞는 모양이다', async () => {
    const view = { ...VIEW, usage: { calls: 0, tokens: 0, costMicroUsd: 0 } }
    answerWith(() => jsonAnswer(view))
    await expect(loadMonth('2026-10')).resolves.toStrictEqual({ kind: 'ok', view })
  })

  it('AC-707.3: 응답에 inputHash가 더 와도 view.report에 남지 않는다', async () => {
    answerWith(() => jsonAnswer({ ...VIEW, report: { ...REPORT, inputHash: 'a'.repeat(64) } }))
    const result = await loadMonth('2026-10')
    expect(result).toStrictEqual({ kind: 'ok', view: VIEW })
    if (result.kind !== 'ok' || result.view.report === null) throw new Error('리포트가 있어야 해요')
    expect(result.view.report).not.toHaveProperty('inputHash')
  })

  it('AC-707.3: 정해 둔 칸만 남는다(리포트·사용량·바깥의 남는 칸을 버림)', async () => {
    answerWith(() =>
      jsonAnswer({
        report: { ...REPORT, extra: 1, cards: [{ ...CARD, extra: 2 }] },
        stale: false,
        usage: { ...USAGE, extra: 3 },
        extra: 4,
      }),
    )
    await expect(loadMonth('2026-10')).resolves.toStrictEqual({ kind: 'ok', view: VIEW })
  })

  it.each<[string, unknown]>([
    ['report 칸이 없음', { stale: false, usage: USAGE }],
    ['report 모양이 틀림', { ...VIEW, report: { ...REPORT, month: 'x' } }],
    ['report가 글자', { ...VIEW, report: '가짜' }],
    ['report가 배열', { ...VIEW, report: [] }],
    ['report가 0', { ...VIEW, report: 0 }],
    ['report가 false', { ...VIEW, report: false }],
    ['stale 칸이 없음', { report: REPORT, usage: USAGE }],
    ['stale이 글자', { ...VIEW, stale: 'false' }],
    ['stale이 숫자', { ...VIEW, stale: 0 }],
    ['stale이 null', { ...VIEW, stale: null }],
    ['usage 칸이 없음', { report: REPORT, stale: false }],
    ['usage가 null', { ...VIEW, usage: null }],
    ['usage가 배열', { ...VIEW, usage: [] }],
    ['usage가 숫자', { ...VIEW, usage: 1 }],
    ['calls가 없음', { ...VIEW, usage: { tokens: 1, costMicroUsd: 1 } }],
    ['tokens가 없음', { ...VIEW, usage: { calls: 1, costMicroUsd: 1 } }],
    ['costMicroUsd가 없음', { ...VIEW, usage: { calls: 1, tokens: 1 } }],
    ['calls가 음수', { ...VIEW, usage: { ...USAGE, calls: -1 } }],
    ['tokens가 음수', { ...VIEW, usage: { ...USAGE, tokens: -1 } }],
    ['costMicroUsd가 음수', { ...VIEW, usage: { ...USAGE, costMicroUsd: -0.5 } }],
    ['calls가 문자', { ...VIEW, usage: { ...USAGE, calls: '3' } }],
    ['tokens가 문자', { ...VIEW, usage: { ...USAGE, tokens: '1200' } }],
    ['costMicroUsd가 null', { ...VIEW, usage: { ...USAGE, costMicroUsd: null } }],
    ['몸통이 null', null],
    ['몸통이 배열', []],
    ['몸통이 글자', '가짜'],
    ['몸통이 숫자', 1],
  ])('AC-707.3: %s → E-AI-READ', async (_name, body) => {
    answerWith(() => jsonAnswer(body))
    await expect(loadMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-READ' })
  })

  it.each(['calls', 'tokens', 'costMicroUsd'])('AC-707.3: %s가 무한대(JSON의 1e999) → E-AI-READ', async (field) => {
    const body = JSON.stringify({ ...VIEW, usage: { ...USAGE, [field]: 999 } }).replace(`"${field}":999`, `"${field}":1e999`)
    answerWith(() => rawAnswer(body, 200))
    await expect(loadMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-READ' })
  })

  it.each(NO_ANSWER)('AC-707.3: %s → E-AI-READ', async (_name, arrange) => {
    arrange()
    await expect(loadMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-READ' })
  })

  it.each<[string, () => Response]>([
    ['몸통을 읽다 끊김', () => cutAnswer(200)],
    ['JSON 아닌 200', () => rawAnswer('가짜', 200)],
    ['빈 200', () => rawAnswer('', 200)],
    ['HTML 200', () => htmlAnswer(200)],
    ['500', () => rawAnswer(null, 500)],
    ['맞는 몸통이 와도 500', () => jsonAnswer(VIEW, 500)],
    ['맞는 몸통이 와도 201', () => jsonAnswer(VIEW, 201)],
    ['400', () => rawAnswer(null, 400)],
    ['404', () => rawAnswer(null, 404)],
    ['AI 번호를 담은 502', () => jsonAnswer({ code: 'E-AI-LIMIT' }, 502)],
  ])('AC-707.3: %s → E-AI-READ', async (_name, make) => {
    answerWith(make)
    await expect(loadMonth('2026-10')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-READ' })
  })
})

const CALLERS: Array<[string, () => Promise<unknown>]> = [
  ['loadMonth', () => loadMonth('2026-10')],
  ['analyzeMonth', () => analyzeMonth('2026-10')],
]

describe.each(CALLERS)('%s 로그인 확인 필요 (AC-707.4)', (_name, call) => {
  it.each<[string, number, ResponseType]>([
    ['401', 401, 'basic'],
    ['403', 403, 'basic'],
    ['302', 302, 'basic'],
    ['300', 300, 'basic'],
    ['399', 399, 'basic'],
    ['opaqueredirect(status 0)', 0, 'opaqueredirect'],
  ])('AC-707.4: %s → reauth이고 몸통을 읽지 않는다', async (_label, status, type) => {
    const { response, json, text } = watchedAnswer(status, type)
    fetchMock.mockResolvedValue(response)
    await expect(call()).resolves.toStrictEqual({ kind: 'reauth' })
    expect(json).not.toHaveBeenCalled()
    expect(text).not.toHaveBeenCalled()
  })

  it.each([401, 403, 302])('AC-707.4: 진짜 Response %i도 AI 번호 몸통을 읽지 않고 reauth다', async (status) => {
    const response = jsonAnswer({ code: 'E-AI-LIMIT' }, status)
    fetchMock.mockResolvedValue(response)
    await expect(call()).resolves.toStrictEqual({ kind: 'reauth' })
    expect(response.bodyUsed).toBe(false)
  })
})

describe.each(CALLERS)('%s 부르는 방식', (_name, call) => {
  it('AC-707.2·AC-707.3: 실패해도 다시 시도하지 않는다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await call()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('AC-707.2·AC-707.3: 5xx여도 다시 시도하지 않는다', async () => {
    answerWith(() => rawAnswer(null, 503))
    await call()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('AC-707.2·AC-707.3: 시간 한도를 새로 두지 않는다', async () => {
    answerWith(() => rawAnswer(null, 503))
    await call()
    expect(lastCall().init.signal).toBeUndefined()
  })

  it('AC-707.2·AC-707.3: 실패해도 console에 남기지 않는다', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    )
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await call()
    answerWith(() => htmlAnswer(502))
    await call()
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it.each<[string, () => void]>([
    ...NO_ANSWER,
    ['fetch가 undefined를 줌', () => fetchMock.mockResolvedValue(undefined as unknown as Response)],
    ['몸통을 읽다 끊김', () => answerWith(() => cutAnswer(200))],
    ['HTML 200', () => answerWith(() => htmlAnswer(200))],
    ['JSON null', () => answerWith(() => rawAnswer('null', 200))],
    ['몸통 없는 500', () => answerWith(() => rawAnswer(null, 500))],
    ['opaqueredirect', () => fetchMock.mockResolvedValue(watchedAnswer(0, 'opaqueredirect').response)],
  ])('AC-707.2·AC-707.3: %s여도 reject하지 않고 값을 돌려준다', async (_label, arrange) => {
    arrange()
    await expect(call()).resolves.toMatchObject({ kind: expect.stringMatching(/^(error|reauth)$/) })
  })
})

describe('달 값이 이상해도 던지지 않는다', () => {
  it('AC-707.3: 주소로 못 바꾸는 달 글자 → reject 없이 E-AI-READ', async () => {
    await expect(loadMonth('\uD800')).resolves.toStrictEqual({ kind: 'error', code: 'E-AI-READ' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC-707.2: JSON으로 못 바꾸는 달 값 → reject 없이 오류 값', async () => {
    const result = analyzeMonth(BigInt(1) as unknown as string)
    await expect(result).resolves.toMatchObject({ kind: 'error' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
