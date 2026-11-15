import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backgroundPrompt } from '@/lib/forms/background'

// POST /api/ai/forms/background — 휴진 안내 AI 배경 (specs/forms-themes REQ-4606 AC-4606.1~4606.7, design.md 4-4절, TASK-8).
// 그림 경로 시험(../guide/picture/route.test.ts)과 같은 흉내: readMe·supabaseServer·takeAiImage·callImage·addUsage는 모두 가짜.
// 실제 OpenAI·Supabase에 붙지 않는다. 적은 말·그림 글은 모두 지어낸 값이다
const mocks = vi.hoisted(() => ({
  readMe: vi.fn(),
  supabaseServer: vi.fn(),
  takeAiImage: vi.fn(),
  callImage: vi.fn(),
  addUsage: vi.fn(),
}))
vi.mock('@/lib/auth/hospital.server', () => {
  class NotSignedInError extends Error {}
  class HospitalReadError extends Error {}
  return { readMe: mocks.readMe, NotSignedInError, HospitalReadError }
})
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: mocks.supabaseServer }))
vi.mock('../../store', () => ({ addUsage: mocks.addUsage, takeAiImage: mocks.takeAiImage }))
vi.mock('../../openaiImage', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../openaiImage')>()), callImage: mocks.callImage }))

import { HospitalReadError, NotSignedInError } from '@/lib/auth/hospital.server'
import * as route from './route'

const { POST } = route
const LOG = '[api/ai/forms/background]'
const SB = { tag: 'fake-supabase-client' }
const APPROVED = { email: 'a@b.c', isAdmin: false, hospital: { id: 'h1', status: 'approved' } }
const WORDS = '봄 벚꽃'
// 그림 base64 글(모양만). 로그·다른 답 칸에 새어 나오면 안 된다
const JPEG = `/9j/${'Q'.repeat(60)}`
const USAGE = { inputTokens: 200, outputTokens: 1868 }

function post(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/ai/forms/background', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'sb-token=SECRET-COOKIE' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

async function bodyOf(res: Response): Promise<unknown> {
  const text = await res.text()
  return text === '' ? null : JSON.parse(text)
}

let errorSpy: ReturnType<typeof vi.spyOn>
let otherSpies: ReturnType<typeof vi.spyOn>[] = []

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.readMe.mockResolvedValue(APPROVED)
  mocks.supabaseServer.mockResolvedValue(SB)
  mocks.takeAiImage.mockResolvedValue(true)
  mocks.callImage.mockResolvedValue({ ok: true, jpeg: JPEG, usage: USAGE })
  mocks.addUsage.mockResolvedValue(true)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  otherSpies = (['log', 'warn', 'info', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
})
afterEach(() => {
  // error 밖의 console은 어떤 시험에서도 불리지 않는다
  for (const spy of otherSpies) expect(spy).not.toHaveBeenCalled()
  for (const spy of otherSpies) spy.mockRestore()
  errorSpy.mockRestore()
})

const expectNothingCalled = () => {
  expect(mocks.takeAiImage).not.toHaveBeenCalled()
  expect(mocks.callImage).not.toHaveBeenCalled()
  expect(mocks.addUsage).not.toHaveBeenCalled()
}

describe('AC-4606.1 경로 설정·몸통·로그인', () => {
  it('AC-4606.1 runtime은 nodejs, maxDuration은 60, export는 Next가 아는 이름뿐이다', () => {
    expect(route.runtime).toBe('nodejs')
    expect(route.maxDuration).toBe(60)
    expect(Object.keys(route).sort()).toEqual(['POST', 'maxDuration', 'runtime'])
  })

  it.each([
    ['JSON 아님', WORDS, true],
    ['몸통 없음(빈 글)', '', true],
    ['배열', [WORDS], false],
    ['null', null, false],
    ['글자 하나', WORDS, false],
    ['빈 객체', {}, false],
    ['글자 아님', { text: 5 }, false],
    ['빈 글', { text: '' }, false],
    ['공백뿐', { text: '   ' }, false],
    ['31자', { text: '가'.repeat(31) }, false],
    ['앞뒤 공백을 떼도 31자', { text: ` ${'가'.repeat(31)} ` }, false],
    ['31자(그림 문자, 유니코드 글자 수)', { text: '🌸'.repeat(31) }, false],
    ['열쇠를 더함', { text: WORDS, size: '1024x1024' }, false],
    ['열쇠 이름이 다름', { words: WORDS }, false],
  ])('AC-4606.1 몸통이 %s이면 400, 몸통 없음, 로그인 확인·한도·OpenAI 부르기·로그 없음', async (_, body, raw) => {
    const res = await POST(post(body, raw))
    expect(res.status).toBe(400)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.readMe).not.toHaveBeenCalled()
    expectNothingCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['30자', '가'.repeat(30)],
    ['앞뒤 공백을 떼면 30자', `  ${'가'.repeat(30)} `],
    ['30자(그림 문자, UTF-16으로는 60칸)', '🌸'.repeat(30)],
    ['1자', '봄'],
  ])('AC-4606.1 %s 말은 받는다', async (_, text) => {
    const res = await POST(post({ text }))
    expect(res.status).toBe(200)
    expect(mocks.callImage).toHaveBeenCalledTimes(1)
  })

  it('AC-4606.1 로그인 안 함이면 401, 몸통 없음, supabaseServer·한도·OpenAI를 부르지 않고 로그도 없다', async () => {
    mocks.readMe.mockRejectedValue(new NotSignedInError('x'))
    const res = await POST(post({ text: WORDS }))
    expect(res.status).toBe(401)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expectNothingCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['병원 없음', { ...APPROVED, hospital: null }],
    ['승인 대기', { ...APPROVED, hospital: { id: 'h1', status: 'pending' } }],
    ['거절', { ...APPROVED, hospital: { id: 'h1', status: 'rejected' } }],
  ])('AC-4606.1 %s이면 403, 몸통 없음, 한도·OpenAI를 부르지 않고 로그도 없다', async (_, me) => {
    mocks.readMe.mockResolvedValue(me)
    const res = await POST(post({ text: WORDS }))
    expect(res.status).toBe(403)
    expect(await bodyOf(res)).toBeNull()
    expectNothingCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-4606.5 로그인 정보를 읽지 못하면 502 E-FORMS-BG-FAILED, 한도·OpenAI를 부르지 않는다', async () => {
    mocks.readMe.mockRejectedValue(new HospitalReadError('db down'))
    const res = await POST(post({ text: WORDS }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-FORMS-BG-FAILED' })
    expectNothingCalled()
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-FORMS-BG-FAILED']])
  })
})

describe('AC-4606.2 개인정보 모양·제어 문자', () => {
  it.each([
    ['전화', '010-1234-5678'],
    ['주민번호', '900101-1234567'],
    ['메일', 'a@b.kr 봄'],
    ['제어 문자', '봄\u0007벚꽃'],
    ['줄바꿈', '봄\n벚꽃'],
    ['앞의 줄바꿈(떼면 사라져도 막는다)', '\n봄 벚꽃'],
    ['탭', '봄\t벚꽃'],
  ])('AC-4606.2 %s가 있으면 422 E-FORMS-PRIVATE이고 한도를 세지 않고 OpenAI를 부르지 않는다', async (_, text) => {
    const res = await POST(post({ text }))
    expect(res.status).toBe(422)
    expect(await bodyOf(res)).toEqual({ code: 'E-FORMS-PRIVATE' })
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expectNothingCalled()
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-FORMS-PRIVATE']])
  })
})

describe('AC-4606.3 하루 한도', () => {
  it('AC-4606.3 내 세션 클라이언트로 takeAiImage를 한 번, OpenAI보다 먼저 부른다', async () => {
    await POST(post({ text: WORDS }))
    expect(mocks.takeAiImage).toHaveBeenCalledTimes(1)
    expect(mocks.takeAiImage).toHaveBeenCalledWith(SB)
    expect(mocks.takeAiImage.mock.invocationCallOrder[0]).toBeLessThan(mocks.callImage.mock.invocationCallOrder[0])
  })

  it('AC-4606.3 한도를 넘었으면(false) 429 E-FORMS-BG-LIMIT이고 OpenAI·사용량을 부르지 않는다', async () => {
    mocks.takeAiImage.mockResolvedValue(false)
    const res = await POST(post({ text: WORDS }))
    expect(res.status).toBe(429)
    expect(await bodyOf(res)).toEqual({ code: 'E-FORMS-BG-LIMIT' })
    expect(mocks.callImage).not.toHaveBeenCalled()
    expect(mocks.addUsage).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-FORMS-BG-LIMIT']])
  })

  it("AC-4606.3 한도 함수가 오류면('failed') 502 E-FORMS-BG-FAILED이고 OpenAI를 부르지 않는다", async () => {
    mocks.takeAiImage.mockResolvedValue('failed')
    const res = await POST(post({ text: WORDS }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-FORMS-BG-FAILED' })
    expect(mocks.callImage).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-FORMS-BG-FAILED']])
  })

  it('AC-4606.3 세션 클라이언트를 만들지 못하면(던짐) 502 E-FORMS-BG-FAILED이고 OpenAI를 부르지 않는다', async () => {
    mocks.supabaseServer.mockRejectedValue(new Error('cookies 봄 벚꽃'))
    const res = await POST(post({ text: WORDS }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-FORMS-BG-FAILED' })
    expectNothingCalled()
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-FORMS-BG-FAILED']])
  })
})

describe('AC-4606.4 OpenAI 부르기', () => {
  it('AC-4606.4 backgroundPrompt(앞뒤 공백을 뗀 말) 하나만 넘겨 한 번 부른다(병원·사용자 정보 없음)', async () => {
    await POST(post({ text: `  ${WORDS}  ` }))
    expect(mocks.callImage).toHaveBeenCalledTimes(1)
    expect(mocks.callImage.mock.calls[0]).toEqual([backgroundPrompt(WORDS)])
    const sent = JSON.stringify(mocks.callImage.mock.calls)
    for (const word of ['h1', 'a@b.c', 'SECRET-COOKIE']) expect(sent).not.toContain(word)
  })
})

describe('AC-4606.5 OpenAI 답', () => {
  it('AC-4606.5 성공이면 200 { image }(받은 base64 글 그대로)이고 Cache-Control: no-store', async () => {
    const res = await POST(post({ text: WORDS }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await bodyOf(res)).toEqual({ image: JPEG })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['E-AI-BUSY', 503],
    ['E-FORMS-BG-QUOTA', 402],
    ['E-FORMS-BG-FAILED', 502],
  ] as const)('AC-4606.5 OpenAI가 %s면 %i { code }', async (code, status) => {
    mocks.callImage.mockResolvedValue({ ok: false, code })
    const res = await POST(post({ text: WORDS }))
    expect(res.status).toBe(status)
    expect(await bodyOf(res)).toEqual({ code })
    expect(errorSpy.mock.calls).toEqual([[LOG, code]])
  })

  it('AC-4606.5 OpenAI 부르기가 던지면 502 E-FORMS-BG-FAILED', async () => {
    mocks.callImage.mockRejectedValue(new Error(`boom ${WORDS}`))
    const res = await POST(post({ text: WORDS }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-FORMS-BG-FAILED' })
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-FORMS-BG-FAILED']])
  })
})

describe('AC-4606.6 사용량', () => {
  it('AC-4606.6 그림을 받으면 add_ai_usage를 한 번, 그림 모델·토큰·imageCostMicroUsd 값으로 더한다', async () => {
    await POST(post({ text: WORDS }))
    expect(mocks.addUsage).toHaveBeenCalledTimes(1)
    expect(mocks.addUsage).toHaveBeenCalledWith(SB, { model: 'gpt-image-2.6-flare', inputTokens: 200, outputTokens: 1868, costMicroUsd: 57_040 })
  })

  it('AC-4606.6 사용량이 없으면(null) 토큰 0·0, 값 60,000으로 더한다', async () => {
    mocks.callImage.mockResolvedValue({ ok: true, jpeg: JPEG, usage: null })
    await POST(post({ text: WORDS }))
    expect(mocks.addUsage).toHaveBeenCalledWith(SB, { model: 'gpt-image-2.6-flare', inputTokens: 0, outputTokens: 0, costMicroUsd: 60_000 })
  })

  it('AC-4606.6 사용량 더하기가 실패해도(false·던짐) 답은 200 { image } 그대로이고 로그가 없다', async () => {
    for (const fail of [() => mocks.addUsage.mockResolvedValue(false), () => mocks.addUsage.mockRejectedValue(new Error('rpc down'))]) {
      fail()
      const res = await POST(post({ text: WORDS }))
      expect(res.status).toBe(200)
      expect(await bodyOf(res)).toEqual({ image: JPEG })
    }
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['한도 넘음', () => mocks.takeAiImage.mockResolvedValue(false)],
    ['OpenAI 바쁨', () => mocks.callImage.mockResolvedValue({ ok: false, code: 'E-AI-BUSY' })],
    ['OpenAI 한도', () => mocks.callImage.mockResolvedValue({ ok: false, code: 'E-FORMS-BG-QUOTA' })],
    ['OpenAI 실패', () => mocks.callImage.mockResolvedValue({ ok: false, code: 'E-FORMS-BG-FAILED' })],
    ['OpenAI 던짐', () => mocks.callImage.mockRejectedValue(new Error('x'))],
  ])('AC-4606.6 그림을 못 받았으면(%s) 사용량을 더하지 않는다', async (_, arrange) => {
    arrange()
    await POST(post({ text: WORDS }))
    expect(mocks.addUsage).not.toHaveBeenCalled()
  })
})

describe('AC-4606.7 로그', () => {
  it('AC-4606.7 { code }로 답할 때 console.error(경로, 번호) 한 줄뿐이고 적은 말·프롬프트·그림 글·오류 글이 어떤 로그에도 없다', async () => {
    const secretWords = '비밀 말 가을'
    const cases: Array<[string, () => void]> = [
      ['E-FORMS-BG-LIMIT', () => mocks.takeAiImage.mockResolvedValue(false)],
      ['E-FORMS-BG-FAILED', () => mocks.takeAiImage.mockResolvedValue('failed')],
      ['E-AI-BUSY', () => mocks.callImage.mockResolvedValue({ ok: false, code: 'E-AI-BUSY' })],
      ['E-FORMS-BG-FAILED', () => mocks.callImage.mockRejectedValue(new Error(`boom ${secretWords} ${JPEG}`))],
    ]
    for (const [code, arrange] of cases) {
      errorSpy.mockClear()
      mocks.takeAiImage.mockResolvedValue(true)
      mocks.callImage.mockResolvedValue({ ok: true, jpeg: JPEG, usage: USAGE })
      arrange()
      await POST(post({ text: secretWords }))
      expect(errorSpy.mock.calls).toEqual([[LOG, code]])
    }
    // 성공 답에도 로그가 없고, 어떤 로그에도 말·프롬프트·그림 글이 없다
    mocks.takeAiImage.mockResolvedValue(true)
    mocks.callImage.mockResolvedValue({ ok: true, jpeg: JPEG, usage: USAGE })
    errorSpy.mockClear()
    await POST(post({ text: secretWords }))
    expect(errorSpy).not.toHaveBeenCalled()
    const logged = JSON.stringify([errorSpy.mock.calls, ...otherSpies.map((s) => s.mock.calls)])
    for (const word of [secretWords, 'Vertical background', JPEG, 'boom', 'test-key']) expect(logged).not.toContain(word)
  })

  it('AC-4606.7 개인정보 모양 거부 로그에도 적은 말이 없다', async () => {
    await POST(post({ text: '010-1234-5678 봄' }))
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-FORMS-PRIVATE']])
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('010-1234-5678')
  })
})
