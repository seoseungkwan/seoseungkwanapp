import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// GET /api/ai/notices/collect — Vercel Cron이 부르는 고시·공지 모으기(specs/notices REQ-7416 AC-7416.1·AC-7416.2, design 4절·ADR-034, TASK-21).
// collectorClient·collectorStore·runCollector·규칙 색인·사이트·Claude·일괄은 모두 가짜다. 실제 사이트·Claude·Supabase에 붙지 않는다.
// node:crypto는 진짜를 쓰되 timingSafeEqual만 지켜본다(같은 시간 비교를 쓰는지)
const mocks = vi.hoisted(() => ({
  collectorClient: vi.fn(),
  collectorStore: vi.fn(),
  runCollector: vi.fn(),
  defaultRuleIndex: vi.fn(),
  fetchSite: vi.fn(),
  callClaude: vi.fn(),
  submitBatch: vi.fn(),
  readBatch: vi.fn(),
}))
vi.mock('../collectStore', () => ({ collectorClient: mocks.collectorClient, collectorStore: mocks.collectorStore }))
vi.mock('../collector', () => ({ runCollector: mocks.runCollector }))
vi.mock('../ruleMatch', () => ({ defaultRuleIndex: mocks.defaultRuleIndex }))
vi.mock('../fetchSite', () => ({ fetchSite: mocks.fetchSite }))
vi.mock('../../claude', () => ({ callClaude: mocks.callClaude }))
vi.mock('../batch', () => ({ submitBatch: mocks.submitBatch, readBatch: mocks.readBatch }))
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>()
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) }
})

import { timingSafeEqual } from 'node:crypto'
import * as route from './route'

const { GET } = route
const LOG = '[api/ai/notices/collect]'
const SECRET = 'cron-secret-abcdefghijklmnopqrstuvwxyz-0123456789'
const CLIENT = { tag: 'fake-collector-client' }
const STORE = { tag: 'fake-collector-store' }
const RULES = new Map([['2026-100', [{ id: 'R-01', title: '규칙 하나' }]]])
const REPORT = {
  new: { hira_notice: 3, hira_crtr: 1, mohw_rss: 0 },
  stopped: ['mohw_rss'],
  summarized: 2,
  batched: 5,
  collected: 4,
  failed: 1,
}

function get(authorization?: string): Request {
  const headers = new Headers()
  if (authorization !== undefined) headers.set('authorization', authorization)
  return new Request('http://localhost/api/ai/notices/collect', { method: 'GET', headers })
}

const authed = () => GET(get(`Bearer ${SECRET}`))

async function bodyOf(res: Response): Promise<unknown> {
  const text = await res.text()
  return text === '' ? null : JSON.parse(text)
}

// 사이트·DB·Claude 쪽 가짜가 하나도 불리지 않았다
function expectNothingCalled() {
  for (const m of Object.values(mocks)) expect(m).not.toHaveBeenCalled()
}

let errorSpy: ReturnType<typeof vi.spyOn>
let otherSpies: ReturnType<typeof vi.spyOn>[] = []
const savedSecret = process.env.CRON_SECRET

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  vi.mocked(timingSafeEqual).mockClear()
  process.env.CRON_SECRET = SECRET
  mocks.collectorClient.mockResolvedValue(CLIENT)
  mocks.collectorStore.mockReturnValue(STORE)
  mocks.defaultRuleIndex.mockResolvedValue(RULES)
  mocks.runCollector.mockResolvedValue(REPORT)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  otherSpies = (['log', 'warn', 'info', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
})

afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = savedSecret
  errorSpy.mockRestore()
  for (const s of otherSpies) s.mockRestore()
})

describe('경로 설정', () => {
  it('AC-7416.2 runtime은 nodejs, maxDuration은 300, dynamic은 force-dynamic, export는 Next가 아는 이름뿐이다', () => {
    expect(route.runtime).toBe('nodejs')
    expect(route.maxDuration).toBe(300)
    expect(route.dynamic).toBe('force-dynamic')
    expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic', 'maxDuration', 'runtime'])
  })

  it('AC-7416.2 maxDuration은 모으기 시간 표(마지막 Claude 부름 시작 + 부름 한도, 일괄 준비 끝 + 보내기 한도)를 담는다', async () => {
    const collector = await vi.importActual<typeof import('../collector')>('../collector')
    const claude = await vi.importActual<typeof import('../../claude')>('../../claude')
    const batch = await vi.importActual<typeof import('../batch')>('../batch')
    const limitMs = route.maxDuration * 1000
    expect(collector.DIRECT_UNTIL_MS + claude.CALL_TIMEOUT_MS).toBeLessThanOrEqual(limitMs)
    expect(collector.BATCH_PREP_UNTIL_MS + batch.BATCH_CALL_TIMEOUT_MS).toBeLessThanOrEqual(limitMs)
    expect(collector.BACKFILL_UNTIL_MS).toBeLessThan(limitMs)
    // 진짜 collector는 붙임 읽기 패키지(unpdf·fflate)까지 불러와 다른 시험과 함께 돌면 느리다
  }, 60_000)
})

describe('AC-7416.1 비밀 머리 검사', () => {
  it.each([
    ['머리 없음', undefined],
    ['빈 머리', ''],
    ['다른 비밀', 'Bearer wrong-secret'],
    ['Bearer 없이 비밀만', SECRET],
    ['소문자 bearer', `bearer ${SECRET}`],
    ['다른 방식', `Basic ${SECRET}`],
    ['비밀 앞부분만', `Bearer ${SECRET.slice(0, -1)}`],
    ['비밀 뒤에 더 붙음', `Bearer ${SECRET}x`],
    ['빈칸 둘', `Bearer  ${SECRET}`],
    ['Bearer만', 'Bearer '],
  ])('AC-7416.1 %s → 401(몸통 없음)이고 사이트·DB·Claude를 부르지 않는다', async (_name, authorization) => {
    const res = await GET(get(authorization))
    expect(res.status).toBe(401)
    expect(await bodyOf(res)).toBeNull()
    expectNothingCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['없음', undefined, 'Bearer undefined'],
    ['빈 글자', '', 'Bearer '],
    ['빈칸뿐', '   ', 'Bearer    '],
  ])('AC-7416.1 CRON_SECRET이 %s이면 어떤 머리도 401이다', async (_name, secret, authorization) => {
    if (secret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = secret
    for (const header of [authorization, 'Bearer ', 'Bearer', undefined]) {
      const res = await GET(get(header))
      expect(res.status).toBe(401)
      expect(await bodyOf(res)).toBeNull()
    }
    expectNothingCalled()
  })

  it('AC-7416.1 비교는 같은 시간 비교(timingSafeEqual)이고 길이가 달라도 같은 길이 값으로 비교한다', async () => {
    const short = await GET(get('Bearer x'))
    expect(short.status).toBe(401)
    expect(timingSafeEqual).toHaveBeenCalledTimes(1)
    const [a, b] = vi.mocked(timingSafeEqual).mock.calls[0]
    expect((a as Uint8Array).byteLength).toBe((b as Uint8Array).byteLength)

    vi.mocked(timingSafeEqual).mockClear()
    const ok = await authed()
    expect(ok.status).toBe(200)
    expect(timingSafeEqual).toHaveBeenCalledTimes(1)
  })

  it('AC-7416.1 비교하는 값에 비밀·머리 글자를 그대로 두지 않는다(해시끼리 비교)', async () => {
    await authed()
    const [a, b] = vi.mocked(timingSafeEqual).mock.calls[0]
    for (const v of [a, b]) {
      const text = Buffer.from(v as Uint8Array).toString('utf8')
      expect(text).not.toContain(SECRET)
    }
  })
})

describe('AC-7416.2 맞는 머리 → 모으기', () => {
  it('AC-7416.2 모으기 계정 클라이언트로 store를 만들어 runCollector를 한 번 돌리고 200 { ok: true, 숫자·출처 이름 }이다', async () => {
    const res = await authed()
    expect(res.status).toBe(200)
    expect(await bodyOf(res)).toEqual({ ok: true, ...REPORT })

    expect(mocks.collectorClient).toHaveBeenCalledTimes(1)
    expect(mocks.collectorStore).toHaveBeenCalledTimes(1)
    expect(mocks.collectorStore).toHaveBeenCalledWith(CLIENT)
    expect(mocks.runCollector).toHaveBeenCalledTimes(1)
    const deps = mocks.runCollector.mock.calls[0][0]
    expect(Object.keys(deps).sort()).toEqual(
      ['callClaude', 'fetchSite', 'now', 'nowMs', 'readBatch', 'ruleIndex', 'store', 'submitBatch'].sort(),
    )
    expect(deps.store).toBe(STORE)
    expect(deps.fetchSite).toBe(mocks.fetchSite)
    expect(deps.callClaude).toBe(mocks.callClaude)
    expect(deps.submitBatch).toBe(mocks.submitBatch)
    expect(deps.readBatch).toBe(mocks.readBatch)
    expect(deps.ruleIndex).toBe(RULES)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-7416.2 nowMs는 지금 ms 숫자, now는 지금 Date다', async () => {
    const before = Date.now()
    await authed()
    const deps = mocks.runCollector.mock.calls[0][0]
    const ms = deps.nowMs()
    const at = deps.now()
    const after = Date.now()
    expect(typeof ms).toBe('number')
    expect(ms).toBeGreaterThanOrEqual(before)
    expect(ms).toBeLessThanOrEqual(after)
    expect(at).toBeInstanceOf(Date)
    expect(at.getTime()).toBeGreaterThanOrEqual(before)
    expect(at.getTime()).toBeLessThanOrEqual(after)
  })

  it('AC-7416.2 규칙 색인을 못 불러오면(null) 그대로 null을 넘긴다(모으기가 요약만 미룬다)', async () => {
    mocks.defaultRuleIndex.mockResolvedValue(null)
    const res = await authed()
    expect(res.status).toBe(200)
    expect(mocks.runCollector.mock.calls[0][0].ruleIndex).toBeNull()
  })

  it('AC-7416.2 규칙 색인 불러오기가 던져도 null로 넘기고 모으기는 돈다', async () => {
    mocks.defaultRuleIndex.mockRejectedValue(new Error('rules.json at C:\\secret\\path'))
    const res = await authed()
    expect(res.status).toBe(200)
    expect(mocks.runCollector.mock.calls[0][0].ruleIndex).toBeNull()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-7416.2 응답은 실행 결과의 숫자 칸과 출처 이름만 담는다(다른 칸은 빼낸다)', async () => {
    mocks.runCollector.mockResolvedValue({ ...REPORT, title: '글 제목', url: 'https://www.hira.or.kr/x', error: 'boom' })
    const res = await authed()
    expect(await bodyOf(res)).toEqual({ ok: true, ...REPORT })
  })

  it("AC-7416.2 다른 실행이 돌면('busy') 200 { ok: true, busy: true }이고 로그가 없다", async () => {
    mocks.runCollector.mockResolvedValue('busy')
    const res = await authed()
    expect(res.status).toBe(200)
    expect(await bodyOf(res)).toEqual({ ok: true, busy: true })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("AC-7416.2 모으기 계정 로그인 실패(collectorClient null)면 500 { code: 'E-NOTICE-LOGIN' }이고 모으기를 돌리지 않는다", async () => {
    mocks.collectorClient.mockResolvedValue(null)
    const res = await authed()
    expect(res.status).toBe(500)
    expect(await bodyOf(res)).toEqual({ code: 'E-NOTICE-LOGIN' })
    expect(mocks.collectorStore).not.toHaveBeenCalled()
    expect(mocks.runCollector).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(LOG, 'E-NOTICE-LOGIN')
  })

  it("AC-7416.2 실행 줄을 못 열면('failed') 500 { code: 'E-NOTICE-RUN' }이다", async () => {
    mocks.runCollector.mockResolvedValue('failed')
    const res = await authed()
    expect(res.status).toBe(500)
    expect(await bodyOf(res)).toEqual({ code: 'E-NOTICE-RUN' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(LOG, 'E-NOTICE-RUN')
  })

  it("AC-7416.2 모으기가 던지면 500 { code: 'E-NOTICE-RUN' }이고 오류 내용은 응답·로그에 없다", async () => {
    mocks.runCollector.mockRejectedValue(new Error(`boom ${SECRET} https://www.hira.or.kr/x`))
    const res = await authed()
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ code: 'E-NOTICE-RUN' })
    expect(text).not.toContain('boom')
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(LOG, 'E-NOTICE-RUN')
  })

  it('AC-7416.2 로그는 console.error(경로, 번호) 한 줄뿐이고 비밀·머리·결과 숫자를 남기지 않는다', async () => {
    for (const setup of [
      () => mocks.runCollector.mockResolvedValue(REPORT),
      () => mocks.runCollector.mockResolvedValue('busy'),
      () => mocks.runCollector.mockResolvedValue('failed'),
      () => mocks.collectorClient.mockResolvedValue(null),
    ]) {
      setup()
      await authed()
      await GET(get('Bearer wrong'))
    }
    for (const call of errorSpy.mock.calls) {
      expect(call).toHaveLength(2)
      expect(call[0]).toBe(LOG)
      expect(['E-NOTICE-LOGIN', 'E-NOTICE-RUN']).toContain(call[1])
    }
    expect(errorSpy).toHaveBeenCalledTimes(2)
    for (const s of otherSpies) expect(s).not.toHaveBeenCalled()
  })
})
