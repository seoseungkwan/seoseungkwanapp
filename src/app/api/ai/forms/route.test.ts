import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FORMS_SCHEMA, formsUser } from '@/lib/forms/ai'

// POST /api/ai/forms — 서식 탭 AI 정리 (specs/forms REQ-3509, design.md 9절, TASK-8).
// report/route.test.ts와 같은 흉내: readMe·supabaseServer·callClaude·addUsage는 모두 가짜. 실제 Claude·Supabase에 붙지 않는다
const mocks = vi.hoisted(() => ({
  readMe: vi.fn(),
  supabaseServer: vi.fn(),
  callClaude: vi.fn(),
  addUsage: vi.fn(),
}))
vi.mock('@/lib/auth/hospital.server', () => {
  class NotSignedInError extends Error {}
  class HospitalReadError extends Error {}
  return { readMe: mocks.readMe, NotSignedInError, HospitalReadError }
})
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: mocks.supabaseServer }))
vi.mock('../claude', () => ({ callClaude: mocks.callClaude }))
vi.mock('../store', () => ({ addUsage: mocks.addUsage }))

import { HospitalReadError, NotSignedInError } from '@/lib/auth/hospital.server'
import * as route from './route'

const { POST } = route
const SB = { tag: 'fake-supabase-client' }
const USAGE = { inputTokens: 1200, outputTokens: 300, model: 'claude-opus-5-5' }
const APPROVED = { email: 'a@b.c', isAdmin: false, hospital: { id: 'h1', status: 'approved' } }
const MEMO = '5/5 어린이날 휴진'
const ANSWER = JSON.stringify({ cards: [{ year: null, month: 5, day: 5, endMonth: null, endDay: null, name: '어린이날', status: '휴진' }] })
const CARD = { start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }

function post(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/ai/forms', {
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
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-09T16:00:00Z')) // 한국 2026-11-10 01:00 — UTC로는 아직 11-09
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.readMe.mockResolvedValue(APPROVED)
  mocks.supabaseServer.mockResolvedValue(SB)
  mocks.callClaude.mockResolvedValue({ ok: true, text: ANSWER, usage: USAGE })
  mocks.addUsage.mockResolvedValue(true)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  otherSpies = (['log', 'warn', 'info', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
})
afterEach(() => {
  // error 밖의 console은 어떤 시험에서도 불리지 않는다
  for (const spy of otherSpies) expect(spy).not.toHaveBeenCalled()
  for (const spy of otherSpies) spy.mockRestore()
  errorSpy.mockRestore()
  vi.useRealTimers()
})

describe('AC-3509.1 경로 설정·몸통·로그인', () => {
  it('AC-3509.1 runtime은 nodejs, maxDuration은 60, export는 Next가 아는 이름뿐이다', () => {
    expect(route.runtime).toBe('nodejs')
    expect(route.maxDuration).toBe(60)
    expect(Object.keys(route).sort()).toEqual(['POST', 'maxDuration', 'runtime'])
  })

  it.each([
    ['JSON 아님', '5/5 휴진', true],
    ['배열', [MEMO], false],
    ['빈 객체', {}, false],
    ['글자 아님', { text: 5 }, false],
    ['빈 글', { text: '' }, false],
    ['공백뿐', { text: ' \n\t ' }, false],
    ['500자 넘음', { text: '가'.repeat(501) }, false],
    ['다른 열쇠', { text: MEMO, memo: 'x' }, false],
  ])('AC-3509.1 몸통이 %s이면 400, 몸통 없음, 로그인 확인·Claude 부르기·로그 없음', async (_, body, raw) => {
    const res = await POST(post(body, raw))
    expect(res.status).toBe(400)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.readMe).not.toHaveBeenCalled()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-3509.1 500자 글은 받는다', async () => {
    const res = await POST(post({ text: `5/5 ${'가'.repeat(496)}` }))
    expect(res.status).toBe(200)
  })

  it('AC-3509.1 로그인 안 함이면 401, 몸통 없음, Claude·supabaseServer를 부르지 않고 로그도 없다', async () => {
    mocks.readMe.mockRejectedValue(new NotSignedInError('x'))
    const res = await POST(post({ text: MEMO }))
    expect(res.status).toBe(401)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['병원 없음', { ...APPROVED, hospital: null }],
    ['승인 대기', { ...APPROVED, hospital: { id: 'h1', status: 'pending' } }],
    ['거절', { ...APPROVED, hospital: { id: 'h1', status: 'rejected' } }],
  ])('AC-3509.1 %s이면 403, 몸통 없음, Claude를 부르지 않는다', async (_, me) => {
    mocks.readMe.mockResolvedValue(me)
    const res = await POST(post({ text: MEMO }))
    expect(res.status).toBe(403)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  // desk-feedback AC-6305.5: AI 경로는 원장(승인된 내 병원 줄)만 연다. 데스크는 내 병원 줄이 없어 코드 그대로 403이다
  it.each([
    ['데스크', { email: 'desk@b.c', isAdmin: false, hospital: null, desk: { hospitalId: 'h1', hospitalName: '가나정형외과의원' } }],
    ['admins에도 있는 데스크', { email: 'desk@b.c', isAdmin: true, hospital: null, desk: { hospitalId: 'h1', hospitalName: '가나정형외과의원' } }],
  ])('AC-6305.5 %s이면 403, 몸통 없음, Claude·supabaseServer·사용량을 부르지 않는다', async (_, me) => {
    mocks.readMe.mockResolvedValue(me)
    const res = await POST(post({ text: MEMO }))
    expect(res.status).toBe(403)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(mocks.addUsage).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-3509.7 로그인 정보를 읽지 못하면 502 E-AI-FAILED', async () => {
    mocks.readMe.mockRejectedValue(new HospitalReadError('db down'))
    const res = await POST(post({ text: MEMO }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
    expect(mocks.callClaude).not.toHaveBeenCalled()
  })
})

describe('AC-3509.2 개인정보 모양·제어 문자', () => {
  it.each([
    ['전화', '5/5 휴진, 문의 010-1234-5678'],
    ['주민번호', '900101-1234567 환자 5/5 예약 옮김'],
    ['붙여 쓴 13자리', '9001011234567'],
    ['메일', 'a@b.kr 5/5 휴진'],
    ['제어 문자', '5/5\u0007 휴진'],
  ])('AC-3509.2 %s가 있으면 Claude를 부르지 않고 422 E-FORMS-PRIVATE', async (_, text) => {
    const res = await POST(post({ text }))
    expect(res.status).toBe(422)
    expect(await bodyOf(res)).toEqual({ code: 'E-FORMS-PRIVATE' })
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([['[api/ai/forms]', 'E-FORMS-PRIVATE']])
  })

  it('AC-3509.2 줄바꿈·탭은 괜찮다', async () => {
    const res = await POST(post({ text: '5/5 어린이날\n\t휴진\r\n' }))
    expect(res.status).toBe(200)
    expect(mocks.callClaude).toHaveBeenCalledTimes(1)
  })
})

describe('AC-3509.3 Claude 부르기', () => {
  it("AC-3509.3 오늘(한국 날짜)을 넣은 시스템 글·<memo> 사용자 글·스키마·effort 'low'·시간 한도 45초로 한 번 부른다", async () => {
    await POST(post({ text: MEMO }))
    expect(mocks.callClaude).toHaveBeenCalledTimes(1)
    const [req, deps] = mocks.callClaude.mock.calls[0]
    expect(req.system).toContain('오늘은 2026-11-10')
    expect(req.user).toBe(formsUser(MEMO))
    expect(req.schema).toBe(FORMS_SCHEMA)
    expect(req.effort).toBe('low')
    expect(Object.keys(req).sort()).toEqual(['effort', 'schema', 'system', 'user'])
    expect(deps).toEqual({ timeoutMs: 45_000 })
  })
})

describe('AC-3509.5 성공', () => {
  it('AC-3509.5 200 { cards, truncated }이고 카드마다 start·end·name·status뿐이다', async () => {
    const res = await POST(post({ text: MEMO }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = (await bodyOf(res)) as { cards: Record<string, unknown>[]; truncated: boolean }
    expect(body).toEqual({ cards: [CARD], truncated: false })
    expect(Object.keys(body).sort()).toEqual(['cards', 'truncated'])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-3509.5 카드가 4장을 넘으면 앞 4장과 truncated: true', async () => {
    const cards = [1, 2, 3, 4, 5].map((day) => ({ year: null, month: 12, day, endMonth: null, endDay: null, name: '학회', status: '휴진' }))
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify({ cards }), usage: USAGE })
    const body = (await bodyOf(await POST(post({ text: '12/1~12/5 학회' })))) as { cards: unknown[]; truncated: boolean }
    expect(body.cards).toHaveLength(4)
    expect(body.truncated).toBe(true)
  })
})

describe('AC-3509.4 답 검사 결과', () => {
  it('AC-3509.4 남는 카드가 없으면 422 E-FORMS-NO-DATE', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify({ cards: [] }), usage: USAGE })
    const res = await POST(post({ text: '다음 주 쉬어요' }))
    expect(res.status).toBe(422)
    expect(await bodyOf(res)).toEqual({ code: 'E-FORMS-NO-DATE' })
    expect(errorSpy.mock.calls).toEqual([['[api/ai/forms]', 'E-FORMS-NO-DATE']])
  })

  it('AC-3509.4 답이 JSON 모양이 아니면 502 E-AI-FAILED', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: '5월 5일 어린이날', usage: USAGE })
    const res = await POST(post({ text: MEMO }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
  })

  it('AC-3509.4 답 카드에 개인정보 모양이 있으면 502 E-AI-FAILED', async () => {
    const cards = [{ year: null, month: 5, day: 5, endMonth: null, endDay: null, name: '010-1234-5678', status: '휴진' }]
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify({ cards }), usage: USAGE })
    const res = await POST(post({ text: MEMO }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
  })
})

describe('AC-3509.6 사용량', () => {
  it('AC-3509.6 성공하면 이번 달 사용량에 토큰과 비용을 더한다', async () => {
    await POST(post({ text: MEMO }))
    expect(mocks.supabaseServer).toHaveBeenCalledTimes(1)
    expect(mocks.addUsage).toHaveBeenCalledTimes(1)
    const [sb, usage] = mocks.addUsage.mock.calls[0]
    expect(sb).toBe(SB)
    expect(usage).toMatchObject(USAGE)
    expect(Number.isSafeInteger(usage.costMicroUsd) && usage.costMicroUsd > 0).toBe(true)
  })

  it('AC-3509.6 Claude가 실패해도 사용량이 있으면 더한다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: false, code: 'E-AI-FAILED', usage: USAGE })
    await POST(post({ text: MEMO }))
    expect(mocks.addUsage).toHaveBeenCalledTimes(1)
  })

  it('AC-3509.6 답 검사가 NO-DATE여도 사용량은 더한다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify({ cards: [] }), usage: USAGE })
    await POST(post({ text: MEMO }))
    expect(mocks.addUsage).toHaveBeenCalledTimes(1)
  })

  it('AC-3509.6 사용량이 없으면 더하지 않는다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: false, code: 'E-AI-BUSY', usage: null })
    await POST(post({ text: MEMO }))
    expect(mocks.addUsage).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
  })

  it.each([
    ['false', () => mocks.addUsage.mockResolvedValue(false)],
    ['던짐', () => mocks.addUsage.mockRejectedValue(new Error('rpc down'))],
    ['클라이언트 못 만듦', () => mocks.supabaseServer.mockRejectedValue(new Error('cookies'))],
  ])('AC-3509.6 사용량 더하기가 실패해도(%s) 답은 그대로', async (_, arrange) => {
    arrange()
    const res = await POST(post({ text: MEMO }))
    expect(res.status).toBe(200)
    expect(await bodyOf(res)).toEqual({ cards: [CARD], truncated: false })
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('AC-3509.7 Claude 오류와 로그', () => {
  it.each([
    ['E-AI-BUSY', 503],
    ['E-AI-LIMIT', 402],
    ['E-AI-FAILED', 502],
  ])('AC-3509.7 %s는 %i, 로그는 경로와 번호 한 줄뿐', async (code, statusCode) => {
    mocks.callClaude.mockResolvedValue({ ok: false, code, usage: null })
    const res = await POST(post({ text: MEMO }))
    expect(res.status).toBe(statusCode)
    expect(await bodyOf(res)).toEqual({ code })
    expect(errorSpy.mock.calls).toEqual([['[api/ai/forms]', code]])
  })

  it('AC-3509.7 Claude 부르기가 던지면 502 E-AI-FAILED', async () => {
    mocks.callClaude.mockRejectedValue(new Error('boom 010-1234-5678'))
    const res = await POST(post({ text: MEMO }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
    expect(errorSpy.mock.calls).toEqual([['[api/ai/forms]', 'E-AI-FAILED']])
  })

  it('AC-3509.7 로그에 적은 글·답 글·숫자가 없다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: '답 글자 아님', usage: USAGE })
    await POST(post({ text: '비밀 메모 5/5' }))
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain('비밀 메모')
    expect(logged).not.toContain('답 글자')
    expect(logged).not.toMatch(/1200|300/)
  })
})
