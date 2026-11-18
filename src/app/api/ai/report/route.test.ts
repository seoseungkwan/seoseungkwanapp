import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SavedReport } from '@/types/aiReport'
import type { GenerateDeps } from '../generate'

// readMe·supabaseServer·generateReport·store는 모두 가짜. 오류 클래스는 시험과 경로가 같은 것을 쓴다
const mocks = vi.hoisted(() => ({
  readMe: vi.fn(),
  supabaseServer: vi.fn(),
  generateReport: vi.fn(),
  loadReportMonths: vi.fn(),
  loadHonorific: vi.fn(),
  saveReport: vi.fn(),
  addUsage: vi.fn(),
  callClaude: vi.fn(),
  readSavedReport: vi.fn(),
  readUsage: vi.fn(),
  isReportStale: vi.fn(),
}))
vi.mock('@/lib/auth/hospital.server', () => {
  class NotSignedInError extends Error {}
  class HospitalReadError extends Error {}
  return { readMe: mocks.readMe, NotSignedInError, HospitalReadError }
})
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: mocks.supabaseServer }))
vi.mock('../generate', () => ({ generateReport: mocks.generateReport, isReportStale: mocks.isReportStale }))
vi.mock('../claude', () => ({ callClaude: mocks.callClaude }))
vi.mock('../store', () => ({
  loadReportMonths: mocks.loadReportMonths,
  loadHonorific: mocks.loadHonorific,
  saveReport: mocks.saveReport,
  addUsage: mocks.addUsage,
  readSavedReport: mocks.readSavedReport,
  readUsage: mocks.readUsage,
}))

import { HospitalReadError, NotSignedInError } from '@/lib/auth/hospital.server'
import * as route from './route'

const { POST } = route
const SB = { tag: 'fake-supabase-client' }
const REPORT: SavedReport = {
  month: '2026-10',
  partial: false,
  summary: '요약 글자',
  cards: [{ tag: 'up', text: '문장', metric: 'total.newPatients', basis: '근거 줄' }],
  model: 'claude-opus-5-5',
  inputHash: 'a'.repeat(64),
  createdAt: '2026-11-02T01:02:03.000Z',
} as unknown as SavedReport
const USAGE = { inputTokens: 1, outputTokens: 2, model: 'claude-opus-5-5' }
const APPROVED = { email: 'a@b.c', isAdmin: false, hospital: { id: 'h1', status: 'approved' } }

function post(body: unknown, raw = false): Request {
  return new Request('http://localhost/api/ai/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'sb-token=SECRET-COOKIE' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

let errorSpy: ReturnType<typeof vi.spyOn>
let otherSpies: ReturnType<typeof vi.spyOn>[] = []

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-15T03:00:00Z')) // 한국 2026-11-15
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.readMe.mockResolvedValue(APPROVED)
  mocks.supabaseServer.mockResolvedValue(SB)
  mocks.generateReport.mockResolvedValue({ ok: true, report: REPORT, usage: USAGE })
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  errorSpy.mockClear()
  otherSpies = (['log', 'warn', 'info', 'debug'] as const).map((k) => {
    const spy = vi.spyOn(console, k).mockImplementation(() => {})
    spy.mockClear()
    return spy
  })
})
afterEach(() => {
  // error 밖의 console(log·warn·info·debug)은 어떤 시험에서도 불리지 않아야 한다
  for (const spy of otherSpies) expect(spy).not.toHaveBeenCalled()
  for (const spy of otherSpies) spy.mockRestore()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  errorSpy.mockRestore()
})

async function bodyOf(res: Response): Promise<unknown> {
  const text = await res.text()
  return text === '' ? null : JSON.parse(text)
}

describe('AC-512.5 경로 설정', () => {
  it('AC-512.5 runtime은 nodejs, maxDuration은 120, export는 Next가 아는 이름뿐이다', () => {
    expect(route.runtime).toBe('nodejs')
    expect(route.maxDuration).toBe(120)
    expect(Object.keys(route).sort()).toEqual(['GET', 'POST', 'maxDuration', 'runtime'])
  })
})

describe('AC-512.1 로그인·승인 확인', () => {
  it('AC-512.1 로그인 안 함이면 401, 몸통 없음, 흐름·supabaseServer를 부르지 않고 로그도 없다', async () => {
    mocks.readMe.mockRejectedValue(new NotSignedInError('x'))
    const res = await POST(post({ month: '2026-10' }))
    expect(res.status).toBe(401)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.generateReport).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['병원 없음', { email: 'a@b.c', isAdmin: false, hospital: null }],
    ['pending', { email: 'a@b.c', isAdmin: false, hospital: { id: 'h1', status: 'pending' } }],
    ['rejected', { email: 'a@b.c', isAdmin: false, hospital: { id: 'h1', status: 'rejected' } }],
    ['관리자여도 병원 없음', { email: 'a@b.c', isAdmin: true, hospital: null }],
    ['관리자여도 pending', { email: 'a@b.c', isAdmin: true, hospital: { id: 'h1', status: 'pending' } }],
    ['관리자여도 rejected', { email: 'a@b.c', isAdmin: true, hospital: { id: 'h1', status: 'rejected' } }],
  ])('AC-512.1 %s이면 403, 몸통 없음, 흐름을 부르지 않는다', async (_n, me) => {
    mocks.readMe.mockResolvedValue(me)
    const res = await POST(post({ month: '2026-10' }))
    expect(res.status).toBe(403)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.generateReport).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-512.1 병원 읽기 실패(HospitalReadError)는 502 { code: E-AI-FAILED }이고 흐름을 부르지 않는다', async () => {
    mocks.readMe.mockRejectedValue(new HospitalReadError('db 내용 SECRET'))
    const res = await POST(post({ month: '2026-10' }))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
    expect(mocks.generateReport).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith('[api/ai/report]', 'E-AI-FAILED')
  })

  it('AC-512.1 readMe가 그 밖의 오류를 던져도 502 { code: E-AI-FAILED }, 오류 내용은 응답·로그에 없다', async () => {
    mocks.readMe.mockRejectedValue(new Error('내부 SECRET 내용'))
    const res = await POST(post({ month: '2026-10' }))
    expect(res.status).toBe(502)
    expect(await res.text()).toBe(JSON.stringify({ code: 'E-AI-FAILED' }))
    expect(mocks.generateReport).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([['[api/ai/report]', 'E-AI-FAILED']])
  })
})

describe('AC-512.2 몸통 검사', () => {
  it.each([
    ['JSON 아님', 'not json{', true],
    ['빈 몸통', '', true],
    ['빈 객체', {}, false],
    ['남는 칸', { month: '2026-10', x: 1 }, false],
    ['month 없이 다른 칸', { months: '2026-10' }, false],
    ['숫자 month', { month: 202610 }, false],
    ['null month', { month: null }, false],
    ['배열 month', { month: ['2026-10'] }, false],
    ['13월', { month: '2026-13' }, false],
    ['13월(윗 경계 아래 해)', { month: '2025-13' }, false],
    ['00월', { month: '2026-00' }, false],
    ['날짜 모양', { month: '2026-10-01' }, false],
    ['한 자리 월', { month: '2026-1' }, false],
    ['다음 달', { month: '2026-12' }, false],
    ['먼 미래', { month: '2030-01' }, false],
    ['배열 몸통', ['2026-10'], false],
    ['문자열 몸통', '2026-10', false],
    ['null 몸통', null, false],
    ['__proto__ 칸', JSON.parse('{"month":"2026-10","__proto__":{"a":1}}'), false],
  ])('AC-512.2 %s이면 400이고 로그인 확인·흐름을 부르지 않는다', async (_n, body, raw) => {
    const res = await POST(post(body, raw))
    expect(res.status).toBe(400)
    expect(await bodyOf(res)).toBeNull()
    expect(mocks.readMe).not.toHaveBeenCalled()
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(mocks.generateReport).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('AC-512.2 이번 달(한국 날짜)보다 뒤 달은 400, 이번 달과 지난 달은 통과한다', async () => {
    vi.setSystemTime(new Date('2026-10-31T15:30:00Z')) // 한국 2026-11-01 00:30, UTC로는 아직 10월
    expect((await POST(post({ month: '2026-12' }))).status).toBe(400)
    expect((await POST(post({ month: '2026-11' }))).status).toBe(200)
    expect(mocks.generateReport).toHaveBeenCalledTimes(1)
    expect(mocks.generateReport.mock.calls[0][0]).toBe('2026-11')
    expect((await POST(post({ month: '2026-10' }))).status).toBe(200)
    expect((await POST(post({ month: '2025-01' }))).status).toBe(200)
  })

  it('AC-512.2 한국 날짜로 새 달이 된 뒤(UTC로는 아직 전달)에는 새 달이 통과하고 그 다음 달은 400이다', async () => {
    vi.setSystemTime(new Date('2026-11-30T15:30:00Z')) // 한국 2026-12-01, UTC로는 11월
    expect((await POST(post({ month: '2026-12' }))).status).toBe(200)
    expect((await POST(post({ month: '2027-01' }))).status).toBe(400)
  })

  it('AC-512.2 달 끝 경계: 한국 날짜 10월 31일 23:59:59에는 11월이 400, 10월은 200이다', async () => {
    vi.setSystemTime(new Date('2026-10-31T14:59:59Z')) // 한국 2026-10-31 23:59:59
    expect((await POST(post({ month: '2026-11' }))).status).toBe(400)
    expect((await POST(post({ month: '2026-10' }))).status).toBe(200)
    vi.setSystemTime(new Date('2026-10-31T15:00:00Z')) // 한국 2026-11-01 00:00:00
    expect((await POST(post({ month: '2026-11' }))).status).toBe(200)
  })

  it('AC-512.2 PC 시간대가 UTC여도 한국 날짜로 본다', async () => {
    vi.stubEnv('TZ', 'UTC')
    vi.setSystemTime(new Date('2026-10-31T15:30:00Z')) // 한국 2026-11-01 00:30
    expect((await POST(post({ month: '2026-11' }))).status).toBe(200)
    expect((await POST(post({ month: '2026-12' }))).status).toBe(400)
  })
})

describe('AC-512.3 흐름 부르기와 응답', () => {
  it('AC-512.3·AC-6606.4 성공이면 200 { report }뿐이고 usage는 싣지 않으며, 흐름에 달과 정해진 deps(호칭 읽기 포함)를 넘긴다', async () => {
    const res = await POST(post({ month: '2026-10' }))
    expect(res.status).toBe(200)
    expect(await bodyOf(res)).toEqual({ report: REPORT })
    expect(errorSpy).not.toHaveBeenCalled()
    expect(mocks.readMe).toHaveBeenCalledTimes(1)
    expect(mocks.supabaseServer).toHaveBeenCalledTimes(1)
    expect(mocks.generateReport).toHaveBeenCalledTimes(1)
    const [month, deps] = mocks.generateReport.mock.calls[0] as [string, GenerateDeps]
    expect(month).toBe('2026-10')
    expect(Object.keys(deps).sort()).toEqual(['addUsage', 'callClaude', 'loadHonorific', 'loadMonths', 'now', 'saveReport'])
    expect(deps.callClaude).toBe(mocks.callClaude)
  })

  it('AC-512.3·AC-6606.4 deps는 사용자 세션 클라이언트와 정확한 인자로 store를 부른다(호칭도 같은 세션으로 서버가 읽는다)', async () => {
    await POST(post({ month: '2026-10' }))
    const deps = mocks.generateReport.mock.calls[0][1] as GenerateDeps

    const months = { selected: 1 }
    mocks.loadReportMonths.mockResolvedValue(months)
    expect(await deps.loadMonths('2026-09')).toBe(months)
    expect(mocks.loadReportMonths).toHaveBeenCalledWith(SB, '2026-09')

    mocks.saveReport.mockResolvedValue(true)
    expect(await deps.saveReport(REPORT)).toBe(true)
    expect(mocks.saveReport).toHaveBeenCalledWith(SB, REPORT)

    mocks.addUsage.mockResolvedValue(true)
    const usage = { ...USAGE, costMicroUsd: 77 }
    expect(await deps.addUsage(usage)).toBe(true)
    expect(mocks.addUsage).toHaveBeenCalledWith(SB, usage)

    mocks.loadHonorific.mockResolvedValue('대표원장님')
    expect(await deps.loadHonorific?.()).toBe('대표원장님')
    expect(mocks.loadHonorific).toHaveBeenCalledWith(SB)

    expect(deps.now()).toEqual(new Date('2026-11-15T03:00:00Z'))
  })

  it.each([
    ['E-AI-NO-DATA', 404],
    ['E-AI-LIMIT', 402],
    ['E-AI-BUSY', 503],
    ['E-AI-FAILED', 502],
  ])('AC-512.3 흐름 오류 %s는 %i와 { code }뿐이다', async (code, status) => {
    mocks.generateReport.mockResolvedValue({ ok: false, code })
    const res = await POST(post({ month: '2026-10' }))
    expect(res.status).toBe(status)
    expect(await res.text()).toBe(JSON.stringify({ code }))
  })

  it('AC-512.3 흐름이 던지면 502 { code: E-AI-FAILED }, 예외 내용은 응답에 없다', async () => {
    mocks.generateReport.mockRejectedValue(new Error('내부 SECRET 내용'))
    const res = await POST(post({ month: '2026-10' }))
    expect(res.status).toBe(502)
    expect(await res.text()).toBe(JSON.stringify({ code: 'E-AI-FAILED' }))
  })

  it('AC-512.3 supabaseServer가 던지면 502 { code: E-AI-FAILED }이고 흐름을 부르지 않는다', async () => {
    mocks.supabaseServer.mockRejectedValue(new Error('내부 SECRET 내용'))
    const res = await POST(post({ month: '2026-10' }))
    expect(res.status).toBe(502)
    expect(await res.text()).toBe(JSON.stringify({ code: 'E-AI-FAILED' }))
    expect(mocks.generateReport).not.toHaveBeenCalled()
  })

  it('AC-512.3 승인 확인은 supabaseServer·흐름보다 먼저다', async () => {
    const order: string[] = []
    mocks.readMe.mockImplementation(async () => {
      order.push('readMe')
      return APPROVED
    })
    mocks.supabaseServer.mockImplementation(async () => {
      order.push('supabaseServer')
      return SB
    })
    mocks.generateReport.mockImplementation(async () => {
      order.push('generateReport')
      return { ok: true, report: REPORT, usage: USAGE }
    })
    await POST(post({ month: '2026-10' }))
    expect(order).toEqual(['readMe', 'supabaseServer', 'generateReport'])
  })
})

describe('AC-512.4 로그', () => {
  it.each([
    ['E-AI-NO-DATA'],
    ['E-AI-LIMIT'],
    ['E-AI-BUSY'],
    ['E-AI-FAILED'],
  ])('AC-512.4 오류 %s이면 console.error가 한 번, 인자는 경로와 번호뿐이다', async (code) => {
    mocks.generateReport.mockResolvedValue({ ok: false, code })
    await POST(post({ month: '2026-10' }))
    expect(errorSpy.mock.calls).toEqual([['[api/ai/report]', code]])
  })

  it('AC-512.4 흐름이 던져도 로그는 경로와 E-AI-FAILED뿐이다(예외·달·쿠키 없음)', async () => {
    mocks.generateReport.mockRejectedValue(new Error('SECRET 2026-10 내용'))
    await POST(post({ month: '2026-10' }))
    expect(errorSpy.mock.calls).toEqual([['[api/ai/report]', 'E-AI-FAILED']])
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/SECRET|2026|cookie/i)
  })

  it('AC-512.4 성공 때는 어떤 console도 부르지 않는다', async () => {
    await POST(post({ month: '2026-10' }))
    expect(errorSpy).not.toHaveBeenCalled()
    for (const spy of otherSpies) expect(spy).not.toHaveBeenCalled()
  })
})

// GET /api/ai/report (spec ai-report-screen REQ-706). 시계는 위 beforeEach의 한국 2026-11-15, 이번 달은 2026-11이다
describe('GET /api/ai/report', () => {
  const { GET } = route
  const USAGE_VIEW = { calls: 3, tokens: 1234, costMicroUsd: 5678 }
  // 화면으로 나가는 칸. inputHash 말고 REPORT의 칸을 모두 적었다
  const SHOWN = {
    month: '2026-10',
    partial: false,
    summary: '요약 글자',
    cards: [{ tag: 'up', text: '문장', metric: 'total.newPatients', basis: '근거 줄' }],
    model: 'claude-opus-5-5',
    createdAt: '2026-11-02T01:02:03.000Z',
  }

  function get(query: string): Request {
    return new Request(`http://localhost/api/ai/report${query}`, {
      method: 'GET',
      headers: { cookie: 'sb-token=SECRET-COOKIE' },
    })
  }

  function expectNoReads(): void {
    expect(mocks.supabaseServer).not.toHaveBeenCalled()
    expect(mocks.readSavedReport).not.toHaveBeenCalled()
    expect(mocks.readUsage).not.toHaveBeenCalled()
    expect(mocks.isReportStale).not.toHaveBeenCalled()
    expect(mocks.loadReportMonths).not.toHaveBeenCalled()
  }

  async function expectReadFailed(res: Response): Promise<void> {
    expect(res.status).toBe(502)
    expect(await res.text()).toBe(JSON.stringify({ code: 'E-AI-READ' }))
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]).toEqual(['[api/ai/report]', 'E-AI-READ'])
  }

  beforeEach(() => {
    mocks.readSavedReport.mockResolvedValue(REPORT)
    mocks.readUsage.mockResolvedValue(USAGE_VIEW)
    mocks.isReportStale.mockResolvedValue(false)
  })

  describe('AC-706.1 로그인·승인 확인', () => {
    it('AC-706.1 로그인 안 함이면 401, 몸통 없음, supabaseServer를 부르지 않고 로그도 없다', async () => {
      mocks.readMe.mockRejectedValue(new NotSignedInError('x'))
      const res = await GET(get('?month=2026-10'))
      expect(res.status).toBe(401)
      expect(await bodyOf(res)).toBeNull()
      expectNoReads()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it.each([
      ['병원 없음', { email: 'a@b.c', isAdmin: false, hospital: null }],
      ['승인 대기', { email: 'a@b.c', isAdmin: false, hospital: { id: 'h1', status: 'pending' } }],
      ['거절됨', { email: 'a@b.c', isAdmin: false, hospital: { id: 'h1', status: 'rejected' } }],
      ['관리자여도 병원 없음', { email: 'a@b.c', isAdmin: true, hospital: null }],
      ['관리자여도 승인 대기', { email: 'a@b.c', isAdmin: true, hospital: { id: 'h1', status: 'pending' } }],
    ])('AC-706.1 %s이면 403, 몸통 없음, supabaseServer를 부르지 않고 로그도 없다', async (_n, me) => {
      mocks.readMe.mockResolvedValue(me)
      const res = await GET(get('?month=2026-10'))
      expect(res.status).toBe(403)
      expect(await bodyOf(res)).toBeNull()
      expectNoReads()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it.each([
      ['HospitalReadError', () => new HospitalReadError('db 내용 SECRET')],
      ['그 밖의 오류', () => new Error('내부 SECRET 내용')],
    ])('AC-706.1 readMe의 %s는 502 E-AI-READ이고 오류 내용은 응답·로그에 없다', async (_n, makeError) => {
      mocks.readMe.mockRejectedValue(makeError())
      await expectReadFailed(await GET(get('?month=2026-10')))
      expectNoReads()
    })

    it('AC-706.1 승인 확인은 supabaseServer·읽기보다 먼저다', async () => {
      const order: string[] = []
      mocks.readMe.mockImplementation(async () => {
        order.push('readMe')
        return APPROVED
      })
      mocks.supabaseServer.mockImplementation(async () => {
        order.push('supabaseServer')
        return SB
      })
      mocks.readSavedReport.mockImplementation(async () => {
        order.push('read')
        return REPORT
      })
      await GET(get('?month=2026-10'))
      expect(order).toEqual(['readMe', 'supabaseServer', 'read'])
    })
  })

  describe('AC-706.1·706.2 로그인과 달 검사의 순서', () => {
    it.each([
      ['값 없음', ''],
      ['13월', '?month=2026-13'],
      ['다음 달', '?month=2026-12'],
    ])('AC-706.1·706.2 로그인 안 함 + 잘못된 달(%s)이면 400이 아니라 401이다', async (_n, query) => {
      mocks.readMe.mockRejectedValue(new NotSignedInError('x'))
      const res = await GET(get(query))
      expect(res.status).toBe(401)
      expect(await bodyOf(res)).toBeNull()
      expectNoReads()
    })

    it('AC-706.1·706.2 승인 안 됨 + 잘못된 달이면 400이 아니라 403이다', async () => {
      mocks.readMe.mockResolvedValue({ email: 'a@b.c', isAdmin: false, hospital: { id: 'h1', status: 'pending' } })
      const res = await GET(get('?month=2026-13'))
      expect(res.status).toBe(403)
      expectNoReads()
    })
  })

  describe('AC-706.2 달 검사', () => {
    it.each([
      ['값 없음', ''],
      ['다른 칸만 있음', '?months=2026-10'],
      ['빈 글자', '?month='],
      ['13월', '?month=2026-13'],
      ['00월', '?month=2026-00'],
      ['한 자리 월', '?month=2026-1'],
      ['날짜 모양', '?month=2026-10-01'],
      ['글자', '?month=abc'],
      ['이번 달 다음 달', '?month=2026-12'],
      ['다음 해', '?month=2027-01'],
    ])('AC-706.2 %s이면 400, 몸통 없음, DB를 읽지 않고 로그도 없다', async (_n, query) => {
      const res = await GET(get(query))
      expect(res.status).toBe(400)
      expect(await bodyOf(res)).toBeNull()
      expect(mocks.readMe).toHaveBeenCalledTimes(1)
      expectNoReads()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('AC-706.2 이번 달 자체와 지난달은 통과한다', async () => {
      expect((await GET(get('?month=2026-11'))).status).toBe(200)
      expect(mocks.readSavedReport).toHaveBeenLastCalledWith(SB, '2026-11')
      expect((await GET(get('?month=2026-10'))).status).toBe(200)
      expect((await GET(get('?month=2025-01'))).status).toBe(200)
    })

    it('AC-706.2 달 끝 경계는 한국 날짜로 본다', async () => {
      vi.setSystemTime(new Date('2026-10-31T14:59:59Z')) // 한국 2026-10-31 23:59:59
      expect((await GET(get('?month=2026-11'))).status).toBe(400)
      expect((await GET(get('?month=2026-10'))).status).toBe(200)
      expect(mocks.readUsage).toHaveBeenLastCalledWith(SB, '2026-10')
      vi.setSystemTime(new Date('2026-10-31T15:00:00Z')) // 한국 2026-11-01 00:00:00, UTC로는 아직 10월
      expect((await GET(get('?month=2026-11'))).status).toBe(200)
      expect(mocks.readUsage).toHaveBeenLastCalledWith(SB, '2026-11')
      expect((await GET(get('?month=2026-12'))).status).toBe(400)
    })

    it('AC-706.2 PC 시간대가 UTC여도 한국 날짜로 본다', async () => {
      vi.stubEnv('TZ', 'UTC')
      vi.setSystemTime(new Date('2026-10-31T15:30:00Z')) // 한국 2026-11-01 00:30
      expect((await GET(get('?month=2026-11'))).status).toBe(200)
      expect((await GET(get('?month=2026-12'))).status).toBe(400)
    })
  })

  describe('AC-706.3 리포트가 있는 달', () => {
    it.each([
      ['거짓', false],
      ['참', true],
    ])('AC-706.3 stale이 %s이면 200이고 칸은 report·stale·usage 셋이다', async (_n, stale) => {
      mocks.isReportStale.mockResolvedValue(stale)
      const res = await GET(get('?month=2026-10'))
      expect(res.status).toBe(200)
      const body = (await bodyOf(res)) as Record<string, unknown>
      expect(Object.keys(body).sort()).toEqual(['report', 'stale', 'usage'])
      expect(body.report).toEqual(SHOWN)
      expect(body.stale).toBe(stale)
      expect(body.usage).toEqual(USAGE_VIEW)
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('AC-706.3 report에 inputHash 칸이 없고 응답 글자 전체에 지문 값이 없다', async () => {
      const text = await (await GET(get('?month=2026-10'))).text()
      const { report } = JSON.parse(text) as { report: Record<string, unknown> }
      expect(Object.keys(report).sort()).toEqual(['cards', 'createdAt', 'model', 'month', 'partial', 'summary'])
      expect(text).not.toContain('inputHash')
      expect(text).not.toContain(REPORT.inputHash)
    })

    it('AC-706.3 응답 머리 Cache-Control이 no-store다', async () => {
      const res = await GET(get('?month=2026-10'))
      expect(res.headers.get('Cache-Control')).toBe('no-store')
    })

    it('AC-706.3 바뀜은 고른 달·저장 지문과 사용자 세션으로 읽는 함수로 본다', async () => {
      await GET(get('?month=2026-10'))
      expect(mocks.isReportStale).toHaveBeenCalledTimes(1)
      const [month, hash, loadMonths] = mocks.isReportStale.mock.calls[0] as [
        string,
        string,
        (m: string) => Promise<unknown>,
      ]
      expect(month).toBe('2026-10')
      expect(hash).toBe(REPORT.inputHash)

      const months = { selected: 1 }
      mocks.loadReportMonths.mockResolvedValue(months)
      expect(await loadMonths('2026-09')).toBe(months)
      expect(mocks.loadReportMonths).toHaveBeenCalledWith(SB, '2026-09')
    })

    it('AC-706.3 readSavedReport는 고른 달, readUsage는 이번 달을 받는다(지난달을 고른 경우)', async () => {
      await GET(get('?month=2026-10'))
      expect(mocks.readSavedReport.mock.calls).toEqual([[SB, '2026-10']])
      expect(mocks.readUsage.mock.calls).toEqual([[SB, '2026-11']])
    })

    it('AC-706.3 리포트와 사용량은 앞 읽기가 끝나기를 기다리지 않고 함께 부른다', async () => {
      let finishReport: (value: unknown) => void = () => {}
      let finishUsage: (value: unknown) => void = () => {}
      mocks.readSavedReport.mockReturnValue(new Promise((resolve) => (finishReport = resolve)))
      mocks.readUsage.mockReturnValue(new Promise((resolve) => (finishUsage = resolve)))
      const pending = GET(get('?month=2026-10'))
      for (let i = 0; i < 20; i += 1) await Promise.resolve()
      expect(mocks.readSavedReport).toHaveBeenCalledTimes(1)
      expect(mocks.readUsage).toHaveBeenCalledTimes(1)
      finishReport(REPORT)
      finishUsage(USAGE_VIEW)
      expect((await pending).status).toBe(200)
    })

    it('AC-706.3 읽기만 한다: 흐름·Claude·저장·사용량 기록을 부르지 않는다', async () => {
      await GET(get('?month=2026-10'))
      expect(mocks.generateReport).not.toHaveBeenCalled()
      expect(mocks.callClaude).not.toHaveBeenCalled()
      expect(mocks.saveReport).not.toHaveBeenCalled()
      expect(mocks.addUsage).not.toHaveBeenCalled()
    })
  })

  describe('AC-706.4 리포트가 없는 달', () => {
    it('AC-706.4 { report: null, stale: false, usage }이고 바뀜·숫자 읽기를 부르지 않으며 no-store다', async () => {
      mocks.readSavedReport.mockResolvedValue(null)
      const res = await GET(get('?month=2026-10'))
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(await bodyOf(res)).toEqual({ report: null, stale: false, usage: USAGE_VIEW })
      expect(mocks.isReportStale).not.toHaveBeenCalled()
      expect(mocks.loadReportMonths).not.toHaveBeenCalled()
      // 리포트가 없다고 읽는 길에서 만들면 안 된다(Claude 비용이 든다)
      expect(mocks.generateReport).not.toHaveBeenCalled()
      expect(mocks.callClaude).not.toHaveBeenCalled()
      expect(mocks.saveReport).not.toHaveBeenCalled()
      expect(mocks.addUsage).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })

  describe('AC-706.5 읽기 실패', () => {
    it('AC-706.5 리포트가 failed면 502 E-AI-READ, 로그는 경로와 번호 한 줄뿐이다', async () => {
      mocks.readSavedReport.mockResolvedValue('failed')
      await expectReadFailed(await GET(get('?month=2026-10')))
      expect(mocks.isReportStale).not.toHaveBeenCalled()
    })

    it('AC-706.5 사용량이 failed면 502 E-AI-READ, 로그는 경로와 번호 한 줄뿐이다', async () => {
      mocks.readUsage.mockResolvedValue('failed')
      await expectReadFailed(await GET(get('?month=2026-10')))
      expect(mocks.isReportStale).not.toHaveBeenCalled()
    })

    it('AC-706.5 둘 다 failed여도 로그는 한 줄이다', async () => {
      mocks.readSavedReport.mockResolvedValue('failed')
      mocks.readUsage.mockResolvedValue('failed')
      await expectReadFailed(await GET(get('?month=2026-10')))
    })

    it.each([
      ['readSavedReport', mocks.readSavedReport],
      ['readUsage', mocks.readUsage],
      ['supabaseServer', mocks.supabaseServer],
      ['isReportStale', mocks.isReportStale],
    ])('AC-706.5 %s가 던지면 502 E-AI-READ, 예외 내용·달은 응답·로그에 없다', async (_n, mock) => {
      mock.mockRejectedValue(new Error('내부 SECRET 2026-10 내용'))
      const res = await GET(get('?month=2026-10'))
      await expectReadFailed(res)
      expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/SECRET|2026|cookie/i)
    })
  })

  describe('AC-706.6 POST는 그대로', () => {
    it('AC-706.6 runtime·maxDuration이 그대로다', () => {
      expect(route.runtime).toBe('nodejs')
      expect(route.maxDuration).toBe(120)
    })

    it('AC-706.6 POST는 읽기·바뀜 함수를 부르지 않고 답도 그대로다', async () => {
      const res = await POST(post({ month: '2026-10' }))
      expect(res.status).toBe(200)
      expect(await bodyOf(res)).toEqual({ report: REPORT })
      expect(mocks.readSavedReport).not.toHaveBeenCalled()
      expect(mocks.readUsage).not.toHaveBeenCalled()
      expect(mocks.isReportStale).not.toHaveBeenCalled()
    })

    it('AC-706.6 POST의 오류 번호는 E-AI-READ로 바뀌지 않는다', async () => {
      mocks.readMe.mockRejectedValue(new Error('내부'))
      const res = await POST(post({ month: '2026-10' }))
      expect(res.status).toBe(502)
      expect(await bodyOf(res)).toEqual({ code: 'E-AI-FAILED' })
    })
  })
})
