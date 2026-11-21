import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COLUMNS_SCHEMA, FIELDS, columnsSystem, columnsUser } from '@/lib/inventory/ai'

// POST /api/ai/inventory/columns — 재고 탭 엑셀 칸 맞춤 (specs/inventory REQ-7505, design.md 5절, TASK-7).
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
// 사용량 더하기 밖에서 DB를 쓰면(읽기·저장·사진) 이 가짜의 함수가 불린다
const SB = { tag: 'fake-supabase-client', from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } }
const USAGE = { inputTokens: 1200, outputTokens: 300, model: 'claude-opus-5-5' }
const APPROVED = { email: 'owner@hanbit.kr', isAdmin: false, hospital: { id: 'hospital-uuid-1', name: '가나정형외과의원', status: 'approved' } }
const HEADER = ['구분', '품명', '단위', '현재고', '비고']
const ROWS = [
  ['약품', '리도카인 주사', '앰플', '12', ''],
  ['치료 소모품', '거즈 4x4', '봉', '30', '창고 위 칸'],
]
const MAPPING = { category: 0, name: 1, unit: 2, minQty: null, qty: 3, expiry: null, vendor: null, unitPrice: null }
const ANSWER = JSON.stringify(MAPPING)

function post(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/ai/inventory/columns', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'sb-token=SECRET-COOKIE' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

async function bodyOf(res: Response): Promise<unknown> {
  const text = await res.text()
  return text === '' ? null : JSON.parse(text)
}

const row = (n: number, value = '가') => Array.from({ length: n }, () => value)

let errorSpy: ReturnType<typeof vi.spyOn>
let otherSpies: ReturnType<typeof vi.spyOn>[] = []

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  SB.from.mockReset()
  SB.rpc.mockReset()
  SB.storage.from.mockReset()
  mocks.readMe.mockResolvedValue(APPROVED)
  mocks.supabaseServer.mockResolvedValue(SB)
  mocks.callClaude.mockResolvedValue({ ok: true, text: ANSWER, usage: USAGE })
  mocks.addUsage.mockResolvedValue(true)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  otherSpies = (['log', 'warn', 'info', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
})
afterEach(() => {
  // error 밖의 console은 어떤 시험에서도 불리지 않는다(AC-7505.7)
  for (const spy of otherSpies) expect(spy).not.toHaveBeenCalled()
  for (const spy of otherSpies) spy.mockRestore()
  errorSpy.mockRestore()
  // 서버는 사용량 더하기 말고 DB·Storage를 쓰지 않는다(읽지도 저장하지도 않는다)
  expect(SB.from).not.toHaveBeenCalled()
  expect(SB.rpc).not.toHaveBeenCalled()
  expect(SB.storage.from).not.toHaveBeenCalled()
})

describe('AC-7505.4 경로 설정·몸통·로그인', () => {
  it('AC-7505.4 runtime은 nodejs, maxDuration은 60, export는 Next가 아는 이름뿐이다', () => {
    expect(route.runtime).toBe('nodejs')
    expect(route.maxDuration).toBe(60)
    expect(Object.keys(route).sort()).toEqual(['POST', 'maxDuration', 'runtime'])
  })

  it.each([
    ['JSON 아님', '{ header: [', true],
    ['배열', [HEADER, ROWS], false],
    ['null', null, false],
    ['빈 객체', {}, false],
    ['header 없음', { rows: ROWS }, false],
    ['rows 없음', { header: HEADER }, false],
    ['다른 열쇠', { header: HEADER, rows: ROWS, hospital: 'x' }, false],
    ['header가 배열 아님', { header: '구분\t품명', rows: [] }, false],
    ['header 0칸', { header: [], rows: [] }, false],
    ['header 31칸', { header: row(31), rows: [] }, false],
    ['header 칸이 글자 아님', { header: ['구분', 3], rows: [] }, false],
    ['header 칸이 null', { header: ['구분', null], rows: [] }, false],
    ['header 칸 41자', { header: ['구분', '가'.repeat(41)], rows: [] }, false],
    ['rows가 배열 아님', { header: HEADER, rows: { 0: ROWS[0] } }, false],
    ['rows 6줄', { header: ['품명'], rows: [['a'], ['b'], ['c'], ['d'], ['e'], ['f']] }, false],
    ['줄이 배열 아님', { header: ['품명'], rows: ['거즈'] }, false],
    ['줄 칸 수가 머리보다 적음', { header: HEADER, rows: [['약품', '거즈']] }, false],
    ['줄 칸 수가 머리보다 많음', { header: ['품명'], rows: [['거즈', '봉']] }, false],
    ['줄 칸이 숫자', { header: ['품명', '현재고'], rows: [['거즈', 12]] }, false],
    ['줄 칸이 null', { header: ['품명', '현재고'], rows: [['거즈', null]] }, false],
    ['줄 칸 41자', { header: ['품명'], rows: [['가'.repeat(41)]] }, false],
    // 40자는 UTF-16 길이로도 센다(lib/inventory/ai.ts clipText와 같다): 질문을 만들 때 잘려 검사를 지난 뒤 모양이 바뀌지 않게
    ['줄 칸 이모지 21개(UTF-16 42)', { header: ['품명'], rows: [['😀'.repeat(21)]] }, false],
  ])('AC-7505.4 몸통이 %s이면 400, 몸통 없음, 로그인 확인·Claude 부르기·로그 없음', async (_, body, raw) => {
    const res = await POST(post(body, raw))
    expect(res.status).toBe(400)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.readMe).not.toHaveBeenCalled()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['머리 1칸·줄 0개', { header: ['품명'], rows: [] }],
    ['머리 30칸·줄 5개', { header: row(30, '칸'), rows: [row(30), row(30), row(30), row(30), row(30)] }],
    ['칸 40자', { header: ['가'.repeat(40)], rows: [['나'.repeat(40)]] }],
    ['이모지 20개(UTF-16 40)', { header: ['품명'], rows: [['😀'.repeat(20)]] }],
    ['빈 칸', { header: ['품명', ''], rows: [['', '']] }],
  ])('AC-7505.4 %s은 받는다', async (_, body) => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify({ ...MAPPING, category: null, unit: null, qty: null, name: 0 }), usage: USAGE })
    const res = await POST(post(body))
    expect(res.status).toBe(200)
    expect(mocks.callClaude).toHaveBeenCalledTimes(1)
  })

  it('AC-7505.4 로그인 안 함이면 401, 몸통 없음, Claude·supabaseServer를 부르지 않고 로그도 없다', async () => {
    mocks.readMe.mockRejectedValue(new NotSignedInError('x'))
    const res = await POST(post({ header: HEADER, rows: ROWS }))
    expect(res.status).toBe(401)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['병원 없음', { ...APPROVED, hospital: null }],
    ['승인 대기', { ...APPROVED, hospital: { ...APPROVED.hospital, status: 'pending' } }],
    ['거절', { ...APPROVED, hospital: { ...APPROVED.hospital, status: 'rejected' } }],
    ['데스크', { email: 'desk@hanbit.kr', isAdmin: false, hospital: null, desk: { hospitalId: 'hospital-uuid-1', hospitalName: '가나정형외과의원' } }],
    ['admins에도 있는 데스크', { email: 'desk@hanbit.kr', isAdmin: true, hospital: null, desk: { hospitalId: 'hospital-uuid-1', hospitalName: '가나정형외과의원' } }],
  ])('AC-7505.4 %s이면 403, 몸통 없음, Claude·supabaseServer·사용량을 부르지 않는다', async (_, me) => {
    mocks.readMe.mockResolvedValue(me)
    const res = await POST(post({ header: HEADER, rows: ROWS }))
    expect(res.status).toBe(403)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(mocks.addUsage).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-7505.6 로그인 정보를 읽지 못하면 502 E-AI-FAILED, Claude를 부르지 않는다', async () => {
    mocks.readMe.mockRejectedValue(new HospitalReadError('db down'))
    const res = await POST(post({ header: HEADER, rows: ROWS }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([['[api/ai/inventory/columns]', 'E-AI-FAILED']])
  })
})

describe('AC-7505.4 개인정보 모양·제어 문자 (서버에서 다시 본다)', () => {
  it.each([
    ['머리 줄에 전화', { header: ['품명', '010-1234-5678'], rows: [] }],
    ['줄에 전화', { header: ['품명', '담당'], rows: [['거즈', '02-123-4567']] }],
    ['붙여 쓴 휴대폰', { header: ['품명', '연락처'], rows: [['거즈', '01012345678']] }],
    ['주민번호', { header: ['품명', '비고'], rows: [['거즈', '900101-1234567']] }],
    ['붙여 쓴 13자리', { header: ['품명', '비고'], rows: [['거즈', '9001011234567']] }],
    ['메일', { header: ['품명', '비고'], rows: [['거즈', 'sales@hanbit.kr']] }],
    ['다섯째 줄에만 메일', { header: ['품명'], rows: [['a'], ['b'], ['c'], ['d'], ['e@hanbit.kr']] }],
    ['탭', { header: ['품명', '비고'], rows: [['거즈\t봉', '']] }],
    ['줄바꿈', { header: ['최소\n수량', '품명'], rows: [] }],
    ['제어 문자', { header: ['품명'], rows: [['거즈\u0007']] }],
  ])('AC-7505.4 %s가 있으면 Claude를 부르지 않고 422 E-INV-PRIVATE', async (_, body) => {
    const res = await POST(post(body))
    expect(res.status).toBe(422)
    expect(await bodyOf(res)).toEqual({ code: 'E-INV-PRIVATE' })
    expect(mocks.callClaude).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(mocks.addUsage).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([['[api/ai/inventory/columns]', 'E-INV-PRIVATE']])
  })

  it('AC-7505.4 개인정보 모양 검사는 로그인 확인 뒤다(로그인 안 했으면 401)', async () => {
    mocks.readMe.mockRejectedValue(new NotSignedInError('x'))
    const res = await POST(post({ header: ['품명', '010-1234-5678'], rows: [] }))
    expect(res.status).toBe(401)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-7505.4 날짜·숫자·< > 글자는 개인정보 모양이 아니다', async () => {
    const res = await POST(post({ header: ['품명', '기한', '단가'], rows: [['<거즈>', '2027-03-01', '12,000']] }))
    expect(res.status).toBe(200)
  })
})

describe('AC-7505.5 Claude 부르기', () => {
  it("AC-7505.5 칸 맞춤 시스템 글·머리 줄과 앞 줄만 담은 <sheet>·스키마·effort 'low'·시간 한도 45초로 한 번 부른다", async () => {
    await POST(post({ header: HEADER, rows: ROWS }))
    expect(mocks.callClaude).toHaveBeenCalledTimes(1)
    const [req, deps] = mocks.callClaude.mock.calls[0]
    expect(req.system).toBe(columnsSystem())
    expect(req.user).toBe(columnsUser(HEADER, ROWS))
    expect(req.schema).toBe(COLUMNS_SCHEMA)
    expect(req.effort).toBe('low')
    expect(Object.keys(req).sort()).toEqual(['effort', 'schema', 'system', 'user'])
    expect(deps).toEqual({ timeoutMs: 45_000 })
  })

  it('AC-7505.5 Claude에 간 몸통에 병원·사용자 값(병원 id·이름·메일·쿠키)이 없다', async () => {
    await POST(post({ header: HEADER, rows: ROWS }))
    const sent = JSON.stringify(mocks.callClaude.mock.calls[0])
    for (const secret of ['hospital-uuid-1', '가나정형외과의원', 'owner@hanbit.kr', 'SECRET-COOKIE', 'sb-token']) {
      expect(sent).not.toContain(secret)
    }
  })

  it('AC-7505.5 Claude를 부르기 전에 DB에서 아무것도 읽지 않는다(supabaseServer는 사용량 몫뿐)', async () => {
    mocks.callClaude.mockResolvedValue({ ok: false, code: 'E-AI-BUSY', usage: null })
    await POST(post({ header: HEADER, rows: ROWS }))
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
  })
})

describe('AC-7505.5 답', () => {
  it('AC-7505.5 200 { mapping }이고 여덟 칸마다 칸 번호 또는 null, Cache-Control no-store, 로그 없음', async () => {
    const res = await POST(post({ header: HEADER, rows: ROWS }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = (await bodyOf(res)) as { mapping: Record<string, unknown> }
    expect(body).toEqual({ mapping: MAPPING })
    expect(Object.keys(body)).toEqual(['mapping'])
    expect(Object.keys(body.mapping).sort()).toEqual([...FIELDS].sort())
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-7505.5 칸 번호는 받은 머리 줄 칸 수 안에서만 본다(범위 밖·두 칸이 같은 번호면 null)', async () => {
    const answer = { category: 1, name: 0, unit: 1, minQty: 2, qty: -1, expiry: 1.5, vendor: '1', unitPrice: null }
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify(answer), usage: USAGE })
    const res = await POST(post({ header: ['품명', '구분'], rows: [] }))
    expect(res.status).toBe(200)
    expect(await bodyOf(res)).toEqual({
      mapping: { category: null, name: 0, unit: null, minQty: null, qty: null, expiry: null, vendor: null, unitPrice: null },
    })
  })

  it('AC-7505.5 물품 이름 칸이 null이면 422 E-INV-NO-NAME', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify({ ...MAPPING, name: null }), usage: USAGE })
    const res = await POST(post({ header: HEADER, rows: ROWS }))
    expect(res.status).toBe(422)
    expect(await bodyOf(res)).toEqual({ code: 'E-INV-NO-NAME' })
    expect(errorSpy.mock.calls).toEqual([['[api/ai/inventory/columns]', 'E-INV-NO-NAME']])
  })

  it('AC-7505.5 물품 이름 칸 번호가 머리 줄 칸 수 밖이면 422 E-INV-NO-NAME', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify({ ...MAPPING, name: 5 }), usage: USAGE })
    const res = await POST(post({ header: HEADER, rows: ROWS }))
    expect(res.status).toBe(422)
    expect(await bodyOf(res)).toEqual({ code: 'E-INV-NO-NAME' })
  })

  it.each([
    ['JSON 아님', '품명은 둘째 칸이에요'],
    ['배열', '[1, 2]'],
  ])('AC-7505.5 답 모양이 틀리면(%s) 502 E-AI-FAILED', async (_, text) => {
    mocks.callClaude.mockResolvedValue({ ok: true, text, usage: USAGE })
    const res = await POST(post({ header: HEADER, rows: ROWS }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
    expect(errorSpy.mock.calls).toEqual([['[api/ai/inventory/columns]', 'E-AI-FAILED']])
  })
})

describe('AC-7505.6 사용량', () => {
  it('AC-7505.6 성공하면 이번 달 사용량에 토큰과 비용을 더한다', async () => {
    await POST(post({ header: HEADER, rows: ROWS }))
    expect(mocks.supabaseServer).toHaveBeenCalledTimes(1)
    expect(mocks.addUsage).toHaveBeenCalledTimes(1)
    const [sb, usage] = mocks.addUsage.mock.calls[0]
    expect(sb).toBe(SB)
    expect(usage).toMatchObject(USAGE)
    expect(Number.isSafeInteger(usage.costMicroUsd) && usage.costMicroUsd > 0).toBe(true)
  })

  it('AC-7505.6 Claude가 실패해도 사용량이 있으면 더한다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: false, code: 'E-AI-FAILED', usage: USAGE })
    await POST(post({ header: HEADER, rows: ROWS }))
    expect(mocks.addUsage).toHaveBeenCalledTimes(1)
  })

  it('AC-7505.6 답 검사가 NO-NAME여도 사용량은 더한다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: JSON.stringify({ ...MAPPING, name: null }), usage: USAGE })
    await POST(post({ header: HEADER, rows: ROWS }))
    expect(mocks.addUsage).toHaveBeenCalledTimes(1)
  })

  it('AC-7505.6 사용량이 없으면 더하지 않는다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: false, code: 'E-AI-BUSY', usage: null })
    await POST(post({ header: HEADER, rows: ROWS }))
    expect(mocks.addUsage).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
  })

  it.each([
    ['false', () => mocks.addUsage.mockResolvedValue(false)],
    ['던짐', () => mocks.addUsage.mockRejectedValue(new Error('rpc down'))],
    ['클라이언트 못 만듦', () => mocks.supabaseServer.mockRejectedValue(new Error('cookies'))],
  ])('AC-7505.6 사용량 더하기가 실패해도(%s) 답은 그대로', async (_, arrange) => {
    arrange()
    const res = await POST(post({ header: HEADER, rows: ROWS }))
    expect(res.status).toBe(200)
    expect(await bodyOf(res)).toEqual({ mapping: MAPPING })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['E-AI-BUSY', 503],
    ['E-AI-LIMIT', 402],
    ['E-AI-FAILED', 502],
  ])('AC-7505.6 Claude 오류 %s는 %i, 로그는 경로와 번호 한 줄뿐', async (code, statusCode) => {
    mocks.callClaude.mockResolvedValue({ ok: false, code, usage: null })
    const res = await POST(post({ header: HEADER, rows: ROWS }))
    expect(res.status).toBe(statusCode)
    expect(await bodyOf(res)).toEqual({ code })
    expect(errorSpy.mock.calls).toEqual([['[api/ai/inventory/columns]', code]])
  })

  it('AC-7505.6 Claude 부르기가 던지면 502 E-AI-FAILED', async () => {
    mocks.callClaude.mockRejectedValue(new Error('boom 010-1234-5678'))
    const res = await POST(post({ header: HEADER, rows: ROWS }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
    expect(errorSpy.mock.calls).toEqual([['[api/ai/inventory/columns]', 'E-AI-FAILED']])
  })
})

describe('AC-7505.7 로그', () => {
  it('AC-7505.7 { code } 로그에 머리 줄·줄 글자·답 글·숫자가 없다', async () => {
    mocks.callClaude.mockResolvedValue({ ok: true, text: '비밀 답 글자 7번 칸', usage: USAGE })
    await POST(post({ header: ['비밀 머리', '품명'], rows: [['비밀 줄 글자', '거즈']] }))
    expect(errorSpy.mock.calls).toEqual([['[api/ai/inventory/columns]', 'E-AI-FAILED']])
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain('비밀')
    expect(logged).not.toContain('거즈')
    expect(logged).not.toMatch(/1200|300/)
  })

  it('AC-7505.7 개인정보 모양으로 거절해도 그 글자는 로그에 없다', async () => {
    await POST(post({ header: ['품명', '비고'], rows: [['거즈', 'sales@hanbit.kr']] }))
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain('hanbit')
    expect(logged).not.toContain('거즈')
  })
})
