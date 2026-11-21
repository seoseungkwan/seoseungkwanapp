import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INVOICE_SCHEMA, invoiceSystem, invoiceUser } from '@/lib/inventory/ai'

// POST /api/ai/inventory/invoice — 재고 탭 명세서 사진 읽기 (specs/inventory REQ-7505, design.md 5절, TASK-6).
// forms/route.test.ts와 같은 흉내: readMe·supabaseServer·callClaude·addUsage는 모두 가짜. 실제 Claude·Supabase에 붙지 않는다
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
vi.mock('../../claude', () => ({ callClaude: mocks.callClaude }))
vi.mock('../../store', () => ({ addUsage: mocks.addUsage }))

import { HospitalReadError, NotSignedInError } from '@/lib/auth/hospital.server'
import * as route from './route'

const { POST } = route
const LOG = '[api/ai/inventory/invoice]'
const USAGE = { inputTokens: 2400, outputTokens: 310, model: 'claude-opus-5-5' }
const HOSPITAL = {
  id: 'hosp-7f3a',
  name: '가나정형외과의원',
  applicantName: '김원장',
  phone: '02-555-1234',
  email: 'clinic@ga.na',
  status: 'approved',
  createdAt: '2026-10-01T00:00:00Z',
}
const APPROVED = { email: 'owner@ga.na', isAdmin: false, hospital: HOSPITAL }
// 지어낸 사진 글자(JPEG base64는 /9j/로 시작)
const IMAGE = '/9j/4AAQSkZJRgABAQAAAQABAAD'

// DB에서 읽는 물품 줄(지어낸 물품)
const ROWS = [
  { id: 'item-aaa-1', name: '알코올 솜', unit: '박스' },
  { id: 'item-bbb-2', name: '주사기 3cc', unit: '개' },
  { id: 'item-ccc-3', name: '손목 보조기 M', unit: '개' },
]
const ANSWER = JSON.stringify({
  date: '2026-11-10',
  vendor: '다라메디칼',
  lines: [
    { name: '주사기 3cc 100입', qty: 2, unitPrice: 9000, amount: 18000, item: 2, unsure: false },
    { name: '탄력붕대 4인치', qty: 10, unitPrice: 1200, amount: 13200, item: null, unsure: true },
  ],
})
const LINES = [
  { name: '주사기 3cc 100입', qty: 2, unitPrice: 9000, amount: 18000, itemId: 'item-bbb-2', unsure: false },
  { name: '탄력붕대 4인치', qty: 10, unitPrice: 1200, amount: 13200, itemId: null, unsure: true },
]

// 물품 읽기 흉내: from → select → eq → order → limit 차례로 부른 것을 적고, 기다리면 정해 둔 결과를 준다
type ReadResult = { data: unknown; error: unknown } | Error
function fakeSupabase(result: ReadResult) {
  const calls: unknown[][] = []
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'order', 'limit']) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, ...args])
      return builder
    }
  }
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject)
  const sb = {
    tag: 'fake-supabase-client',
    from: (table: string) => {
      calls.push(['from', table])
      return builder
    },
  }
  return { sb, calls }
}

let fake: ReturnType<typeof fakeSupabase>

function post(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/ai/inventory/invoice', {
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
  fake = fakeSupabase({ data: ROWS, error: null })
  mocks.readMe.mockResolvedValue(APPROVED)
  mocks.supabaseServer.mockImplementation(async () => fake.sb)
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

describe('AC-7505.1 경로 설정·몸통·로그인', () => {
  it('AC-7505.1 runtime은 nodejs, maxDuration은 120, export는 Next가 아는 이름뿐이다', () => {
    expect(route.runtime).toBe('nodejs')
    expect(route.maxDuration).toBe(120)
    expect(Object.keys(route).sort()).toEqual(['POST', 'maxDuration', 'runtime'])
  })

  it.each([
    ['JSON 아님', '/9j/AAAA', true],
    ['배열', [IMAGE], false],
    ['null', null, false],
    ['빈 객체', {}, false],
    ['글자 아님', { image: 5 }, false],
    ['빈 글', { image: '' }, false],
    ['/9j/뿐', { image: '/9j/' }, false],
    ['JPEG가 아닌 base64(PNG)', { image: 'iVBORw0KGgoAAAANSUhEUgAA' }, false],
    ['data: 주소 앞머리', { image: `data:image/jpeg;base64,${IMAGE}` }, false],
    ['줄바꿈', { image: '/9j/AAAA\nBBBB' }, false],
    ['빈칸', { image: '/9j/AAAA BBBB' }, false],
    ['가운데 =', { image: '/9j/AA=A' }, false],
    ['= 셋', { image: '/9j/AAAA===' }, false],
    ['base64 밖 글자(-·_)', { image: '/9j/AA-_' }, false],
    ['4,000,000자 넘음', { image: `/9j/${'A'.repeat(3_999_997)}` }, false],
    ['다른 열쇠', { image: IMAGE, name: '명세서' }, false],
  ])('AC-7505.1 몸통이 %s이면 400, 몸통 없음, 로그인 확인·물품 읽기·Claude 부르기·로그 없음', async (_, body, raw) => {
    const res = await POST(post(body, raw))
    expect(res.status).toBe(400)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.readMe).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['딱 4,000,000자', `/9j/${'A'.repeat(3_999_996)}`],
    ['끝에 = 둘', '/9j/AAAAAA=='],
    ['+·/ 섞임', '/9j/4A+Q/kZJ'],
  ])('AC-7505.1 %s 사진은 받는다', async (_, image) => {
    const res = await POST(post({ image }))
    expect(res.status).toBe(200)
    expect(mocks.callClaude).toHaveBeenCalledTimes(1)
  })

  it('AC-7505.1 로그인 안 함이면 401, 몸통 없음, 물품 읽기·Claude를 부르지 않고 로그도 없다', async () => {
    mocks.readMe.mockRejectedValue(new NotSignedInError('x'))
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(401)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['병원 없음', { ...APPROVED, hospital: null }],
    ['승인 대기', { ...APPROVED, hospital: { ...HOSPITAL, status: 'pending' } }],
    ['거절', { ...APPROVED, hospital: { ...HOSPITAL, status: 'rejected' } }],
    ['데스크', { email: 'desk@ga.na', isAdmin: false, hospital: null, desk: { hospitalId: 'hosp-7f3a', hospitalName: '가나정형외과의원' } }],
    ['admins에도 있는 데스크', { email: 'desk@ga.na', isAdmin: true, hospital: null, desk: { hospitalId: 'hosp-7f3a', hospitalName: '가나정형외과의원' } }],
  ])('AC-7505.1 %s이면 403, 몸통 없음, 물품 읽기·Claude·사용량을 부르지 않는다', async (_, me) => {
    mocks.readMe.mockResolvedValue(me)
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(403)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(mocks.addUsage).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-7505.6 로그인 정보를 읽지 못하면 502 E-AI-FAILED, 물품 읽기·Claude를 부르지 않는다', async () => {
    mocks.readMe.mockRejectedValue(new HospitalReadError('db down'))
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-AI-FAILED']])
  })
})

describe('AC-7505.2 물품 읽기', () => {
  it('AC-7505.2 inventory_items에서 id·name·unit을 숨기지 않은 것만, sort_order 차례로 500개까지 읽는다(병원 조건은 RLS)', async () => {
    await POST(post({ image: IMAGE }))
    expect(mocks.supabaseServer).toHaveBeenCalledTimes(1)
    const { calls } = fake
    expect(calls.filter((c) => c[0] === 'from')).toEqual([['from', 'inventory_items']])
    expect(calls).toContainEqual(['select', 'id, name, unit'])
    expect(calls.filter((c) => c[0] === 'eq')).toEqual([['eq', 'hidden', false]])
    const orders = calls.filter((c) => c[0] === 'order')
    expect(orders[0]?.[1]).toBe('sort_order')
    expect((orders[0]?.[2] as { ascending?: boolean } | undefined)?.ascending).not.toBe(false)
    expect(calls.filter((c) => c[0] === 'limit')).toEqual([['limit', 500]])
  })

  it.each([
    ['error를 돌려줌', () => fakeSupabase({ data: null, error: { message: 'permission denied 42501' } })],
    ['던짐', () => fakeSupabase(new Error('fetch failed'))],
    ['data가 배열이 아님', () => fakeSupabase({ data: { id: 'x' }, error: null })],
    ['줄 모양이 틀림(unit 없음)', () => fakeSupabase({ data: [{ id: 'item-aaa-1', name: '알코올 솜' }], error: null })],
    ['줄 모양이 틀림(이름이 글자 아님)', () => fakeSupabase({ data: [{ id: 'item-aaa-1', name: 7, unit: '개' }], error: null })],
  ])('AC-7505.2 물품 읽기가 %s이면 502 E-INV-READ-FAILED, Claude를 부르지 않는다', async (_, make) => {
    fake = make()
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-INV-READ-FAILED' })
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(mocks.addUsage).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-INV-READ-FAILED']])
  })

  it('AC-7505.2 클라이언트를 만들지 못해도 502 E-INV-READ-FAILED, Claude를 부르지 않는다', async () => {
    mocks.supabaseServer.mockRejectedValue(new Error('cookies'))
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-INV-READ-FAILED' })
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-INV-READ-FAILED']])
  })

  it('AC-7505.2 물품이 하나도 없어도 빈 <items>로 부르고, 모든 줄은 itemId null이다', async () => {
    fake = fakeSupabase({ data: [], error: null })
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(200)
    const [req] = mocks.callClaude.mock.calls[0]
    expect(req.user).toBe(invoiceUser([]))
    const body = (await bodyOf(res)) as { lines: { itemId: string | null }[] }
    expect(body.lines.map((l) => l.itemId)).toEqual([null, null])
  })
})

describe('AC-7505.2 Claude 부르기', () => {
  it("AC-7505.2 시스템 글·번호 붙인 <items> 글·명세서 스키마·effort 'medium'·사진(image/jpeg, 받은 글자 그대로)으로 한 번 부르고 시간 한도는 기본값이다", async () => {
    await POST(post({ image: IMAGE }))
    expect(mocks.callClaude).toHaveBeenCalledTimes(1)
    const [req, deps] = mocks.callClaude.mock.calls[0]
    expect(req.system).toBe(invoiceSystem())
    expect(req.user).toBe(invoiceUser(ROWS.map(({ name, unit }) => ({ name, unit }))))
    expect(req.user).toContain('1. 알코올 솜 (박스)')
    expect(req.user).toContain('3. 손목 보조기 M (개)')
    expect(req.schema).toBe(INVOICE_SCHEMA)
    expect(req.effort).toBe('medium')
    expect(req.image).toEqual({ mediaType: 'image/jpeg', data: IMAGE })
    expect(Object.keys(req).sort()).toEqual(['effort', 'image', 'schema', 'system', 'user'])
    expect(deps).toBeUndefined()
  })

  it('AC-7505.2 Claude에 간 값에는 사진·<items> 말고 병원·사용자·물품 id·쿠키 값이 없다', async () => {
    await POST(post({ image: IMAGE }))
    const sent = JSON.stringify(mocks.callClaude.mock.calls[0])
    for (const secret of [
      HOSPITAL.id,
      HOSPITAL.name,
      HOSPITAL.applicantName,
      HOSPITAL.phone,
      HOSPITAL.email,
      APPROVED.email,
      'SECRET-COOKIE',
      ...ROWS.map((r) => r.id),
    ]) {
      expect(sent).not.toContain(secret)
    }
  })
})

describe('AC-7505.3 답', () => {
  it('AC-7505.3 200 { date, vendor, lines }이고 번호는 그 차례 물품 id로 바뀐다(줄 칸은 name·qty·unitPrice·amount·itemId·unsure)', async () => {
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = (await bodyOf(res)) as { lines: Record<string, unknown>[] }
    // 날짜는 한국 오늘(2026-11-10)까지 받는다 — UTC로 보면 아직 11-09라 지워진다
    expect(body).toEqual({ date: '2026-11-10', vendor: '다라메디칼', lines: LINES })
    expect(Object.keys(body).sort()).toEqual(['date', 'lines', 'vendor'])
    for (const line of body.lines) expect(Object.keys(line).sort()).toEqual(['amount', 'itemId', 'name', 'qty', 'unitPrice', 'unsure'])
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-7505.3 목록 밖 번호(0·n+1)는 itemId null, 1번·n번은 첫·끝 물품이다', async () => {
    const line = (item: number | null) => ({ name: '거즈', qty: 1, unitPrice: null, amount: null, item, unsure: false })
    mocks.callClaude.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ date: null, vendor: null, lines: [line(1), line(3), line(0), line(4)] }),
      usage: USAGE,
    })
    const body = (await bodyOf(await POST(post({ image: IMAGE })))) as { date: unknown; vendor: unknown; lines: { itemId: unknown }[] }
    expect(body.date).toBeNull()
    expect(body.vendor).toBeNull()
    expect(body.lines.map((l) => l.itemId)).toEqual(['item-aaa-1', 'item-ccc-3', null, null])
  })

  it('AC-7505.3 남는 줄이 없으면 422 E-INV-NO-LINES', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify({ date: null, vendor: null, lines: [] }), usage: USAGE })
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(422)
    expect(await bodyOf(res)).toEqual({ code: 'E-INV-NO-LINES' })
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-INV-NO-LINES']])
  })

  it.each([
    ['JSON이 아님', '주사기 2개'],
    ['lines가 배열이 아님', JSON.stringify({ date: null, vendor: null, lines: 'x' })],
  ])('AC-7505.3 답 모양이 틀리면(%s) 502 E-AI-FAILED', async (_, text) => {
    mocks.callClaude.mockResolvedValue({ ok: true, text, usage: USAGE })
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-AI-FAILED']])
  })
})

describe('AC-7505.6 사용량과 Claude 오류', () => {
  it('AC-7505.6 성공하면 물품을 읽은 같은 클라이언트로 이번 달 사용량에 토큰과 비용을 더한다', async () => {
    await POST(post({ image: IMAGE }))
    expect(mocks.addUsage).toHaveBeenCalledTimes(1)
    const [sb, usage] = mocks.addUsage.mock.calls[0]
    expect(sb).toBe(fake.sb)
    expect(usage).toMatchObject(USAGE)
    expect(Number.isSafeInteger(usage.costMicroUsd) && usage.costMicroUsd > 0).toBe(true)
    expect(JSON.stringify(usage)).not.toContain(IMAGE)
  })

  it('AC-7505.6 Claude가 실패해도 사용량이 있으면 더한다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: false, code: 'E-AI-FAILED', usage: USAGE })
    await POST(post({ image: IMAGE }))
    expect(mocks.addUsage).toHaveBeenCalledTimes(1)
  })

  it('AC-7505.6 답 검사가 NO-LINES여도 사용량은 더한다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify({ date: null, vendor: null, lines: [] }), usage: USAGE })
    await POST(post({ image: IMAGE }))
    expect(mocks.addUsage).toHaveBeenCalledTimes(1)
  })

  it('AC-7505.6 사용량이 없으면 더하지 않는다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: false, code: 'E-AI-BUSY', usage: null })
    await POST(post({ image: IMAGE }))
    expect(mocks.addUsage).not.toHaveBeenCalled()
  })

  it.each([
    ['false', () => mocks.addUsage.mockResolvedValue(false)],
    ['던짐', () => mocks.addUsage.mockRejectedValue(new Error('rpc down'))],
  ])('AC-7505.6 사용량 더하기가 실패해도(%s) 답은 그대로', async (_, arrange) => {
    arrange()
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(200)
    expect(await bodyOf(res)).toEqual({ date: '2026-11-10', vendor: '다라메디칼', lines: LINES })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['E-AI-BUSY', 'E-AI-BUSY', 503],
    ['E-AI-LIMIT', 'E-AI-LIMIT', 402],
    ['E-AI-FAILED', 'E-AI-FAILED', 502],
    ['E-AI-NO-DATA', 'E-AI-FAILED', 502],
  ])('AC-7505.6 Claude 오류 %s는 %s %i, 로그는 경로와 번호 한 줄뿐', async (from, code, statusCode) => {
    mocks.callClaude.mockResolvedValue({ ok: false, code: from, usage: null })
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(statusCode)
    expect(await bodyOf(res)).toEqual({ code })
    expect(errorSpy.mock.calls).toEqual([[LOG, code]])
  })

  it('AC-7505.6 Claude 부르기가 던지면 502 E-AI-FAILED', async () => {
    mocks.callClaude.mockRejectedValue(new Error('boom 010-1234-5678'))
    const res = await POST(post({ image: IMAGE }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-AI-FAILED']])
  })
})

describe('AC-7505.7 로그와 저장', () => {
  it('AC-7505.7 로그에 사진·물품 이름·답 글·숫자가 없다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: '비밀 답 글자 탄력붕대', usage: USAGE })
    await POST(post({ image: IMAGE }))
    expect(errorSpy.mock.calls).toEqual([[LOG, 'E-AI-FAILED']])
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain(IMAGE)
    expect(logged).not.toContain('알코올 솜')
    expect(logged).not.toContain('비밀 답')
    expect(logged).not.toMatch(/2400|310/)
  })

  it('AC-7505.7 성공하면 로그가 없고, DB는 물품 읽기 한 번뿐이다(사진을 저장하지 않는다)', async () => {
    await POST(post({ image: IMAGE }))
    expect(errorSpy).not.toHaveBeenCalled()
    // 가짜 클라이언트에는 from(읽기 칸)만 있다. storage·insert·rpc를 부르면 이 시험이 실패한다
    expect(fake.calls.filter((c) => c[0] === 'from')).toHaveLength(1)
    expect(fake.calls.map((c) => c[0])).not.toContain('insert')
  })
})
