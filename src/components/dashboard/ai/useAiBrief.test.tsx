// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiErrorCode, ReportView, ShownReport } from '@/types/aiReport'
import { useAiBrief } from './useAiBrief'

// 대시보드 AI 요약의 상태와 부르기(dashboard-ux REQ-2704, design.md §5). 유료 AI는 부르지 않는다:
// fetch만 가짜로 바꿔 지어낸 답(리포트·오류 번호)을 준다. reportClient는 진짜를 지난다. 시계도 가짜다

const TODAY = '2026-11-07'
const NOW = new Date('2026-11-07T01:00:00.000Z')
const OCT = '2026-10' // firstMonth(TODAY) = 지난달
const NOV = '2026-11'

const reportFor = (month: string, over: Partial<ShownReport> = {}): ShownReport => ({
  month,
  partial: false,
  summary: `가짜 요약: ${month}`,
  cards: [{ tag: 'up', text: '가짜 문장: 신환이 늘었어요', metric: 'total.newPatients', basis: '근거 · 가짜 신환 10명 → 12명' }],
  model: 'claude-opus-5-5',
  createdAt: '2026-11-02T00:12:00.000Z',
  ...over,
})
const OCT_REPORT = reportFor(OCT)
const NEW_REPORT = reportFor(OCT, { summary: '가짜 요약: 새로 만든 리포트', createdAt: NOW.toISOString() })
const viewOf = (report: ShownReport | null, stale = false): ReportView => ({ report, stale, usage: { calls: 1, tokens: 10, costMicroUsd: 0 } })

// ── 가짜 fetch ───────────────────────────────────────────

type Answer = Response | Promise<Response>
const answerGet = vi.fn<(month: string) => Answer>()
const answerPost = vi.fn<(month: string) => Answer>()
const fetchSpy = vi.fn<typeof fetch>()
const reload = vi.fn()

const jsonAnswer = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const codeAnswer = (code: AiErrorCode) => jsonAnswer({ code }, 503)
const redirected = () => ({ type: 'opaqueredirect', status: 0 }) as unknown as Response

function later() {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const callsOf = (method: string) => fetchSpy.mock.calls.filter(([, init]) => init?.method === method)
const gets = () => callsOf('GET').map(([url]) => String(url))
const posts = () => callsOf('POST').map(([url, init]) => [String(url), String(init?.body)])
const urlOf = (month: string) => `/api/ai/report?month=${month}`

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

async function mount(today = TODAY, wrapper?: ({ children }: { children: ReactNode }) => ReactNode) {
  const hook = renderHook(({ day }) => useAiBrief(day), { initialProps: { day: today }, wrapper })
  await settle()
  return hook
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  reload.mockReset()
  answerGet.mockReset()
  answerPost.mockReset()
  fetchSpy.mockReset()
  fetchSpy.mockImplementation(async (input, init) => {
    if (init?.method === 'POST') return answerPost((JSON.parse(String(init.body)) as { month: string }).month)
    return answerGet(new URLSearchParams(String(input).split('?')[1]).get('month') ?? '')
  })
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/dashboard', reload })
  answerGet.mockImplementation(() => jsonAnswer(viewOf(null)))
  answerPost.mockImplementation(() => jsonAnswer({ report: NEW_REPORT }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('열 때 한 번 읽기 (AC-2704.1)', () => {
  it('AC-2704.1: 처음은 loading이고 지난달을 GET으로 한 번 읽는다. 저장 리포트가 있으면 report(stale 그대로), 시간이 흘러도 다시 읽거나 POST하지 않는다', async () => {
    const get = later()
    answerGet.mockReturnValueOnce(get.promise)
    const hook = renderHook(() => useAiBrief(TODAY))
    expect(hook.result.current.month).toBe(OCT)
    expect(hook.result.current.state).toEqual({ kind: 'loading' })
    await settle()
    get.resolve(jsonAnswer(viewOf(OCT_REPORT, true)))
    await settle()
    expect(hook.result.current.state).toEqual({ kind: 'report', report: OCT_REPORT, stale: true })
    hook.rerender()
    await advance(10 * 60_000)
    expect(gets()).toEqual([urlOf(OCT)])
    expect(posts()).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-2704.4: 저장 리포트가 없으면(report null) none이고 저절로 만들지 않는다', async () => {
    const hook = await mount()
    expect(hook.result.current.state).toEqual({ kind: 'none' })
    await advance(10 * 60_000)
    expect(posts()).toEqual([])
    expect(gets()).toHaveLength(1)
  })

  it('AC-2704.1: StrictMode에서 effect가 두 번 돌아도 늦은 첫 답은 버려지고 report가 되며, 만들기는 POST 하나다', async () => {
    answerGet.mockImplementation(() => jsonAnswer(viewOf(null)))
    const hook = await mount(TODAY, ({ children }) => <StrictMode>{children}</StrictMode>)
    expect(hook.result.current.state).toEqual({ kind: 'none' })
    act(() => hook.result.current.create())
    await settle()
    expect(posts()).toHaveLength(1)
    expect(hook.result.current.state).toEqual({ kind: 'report', report: NEW_REPORT, stale: false })
  })
})

describe('만들기 (AC-2704.5·AC-2704.6·AC-2704.8)', () => {
  it('AC-2704.5·AC-2704.8: none → create() → busy(0) → 1초마다 오름 → 받은 리포트로 report(stale false). 요청 몸통은 달 하나뿐이고 타이머가 남지 않는다', async () => {
    const post = later()
    answerPost.mockReturnValueOnce(post.promise)
    const hook = await mount()
    act(() => hook.result.current.create())
    expect(hook.result.current.state).toEqual({ kind: 'busy', seconds: 0 })
    await advance(1000)
    expect(hook.result.current.state).toEqual({ kind: 'busy', seconds: 1 })
    await advance(2000)
    expect(hook.result.current.state).toEqual({ kind: 'busy', seconds: 3 })
    post.resolve(jsonAnswer({ report: NEW_REPORT }))
    await settle()
    expect(hook.result.current.state).toEqual({ kind: 'report', report: NEW_REPORT, stale: false })
    expect(vi.getTimerCount()).toBe(0)
    expect(posts()).toEqual([['/api/ai/report', JSON.stringify({ month: OCT })]])
    // 요청은 GET ?month= 와 POST {month} 두 가지뿐이다. GET에는 몸통이 없다
    expect(fetchSpy.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'POST'])
    expect(callsOf('GET')[0]![1]?.body).toBeUndefined()
    // 성공 뒤에도 저절로 다시 읽거나 부르지 않는다
    await advance(10 * 60_000)
    expect(gets()).toHaveLength(1)
    expect(posts()).toHaveLength(1)
  })

  it('AC-2704.5: 같은 틱에 두 번, 기다리는 동안 또 눌러도 POST는 하나다', async () => {
    const post = later()
    answerPost.mockReturnValueOnce(post.promise)
    const hook = await mount()
    act(() => {
      hook.result.current.create()
      hook.result.current.create()
    })
    await advance(1500)
    act(() => hook.result.current.create())
    await settle()
    expect(posts()).toHaveLength(1)
    post.resolve(jsonAnswer({ report: NEW_REPORT }))
    await settle()
    expect(posts()).toHaveLength(1)
  })

  it.each(['E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'] as const)(
    'AC-2704.5: %s면 failed(그 번호, 리포트 없음)이고 누르기 전에는 다시 부르지 않는다. 다시 누르면 그때 POST 하나',
    async (code) => {
      answerPost.mockImplementationOnce(() => codeAnswer(code))
      const hook = await mount()
      act(() => hook.result.current.create())
      await settle()
      expect(hook.result.current.state).toEqual({ kind: 'failed', code, report: null })
      expect(vi.getTimerCount()).toBe(0)
      await advance(10 * 60_000)
      expect(posts()).toHaveLength(1)
      act(() => hook.result.current.create())
      await settle()
      expect(posts()).toHaveLength(2)
      expect(hook.result.current.state).toEqual({ kind: 'report', report: NEW_REPORT, stale: false })
    },
  )

  it('AC-2704.5: 그려 둔 리포트가 있으면 만들기가 실패해도 그 리포트를 지우지 않는다', async () => {
    answerGet.mockImplementation(() => jsonAnswer(viewOf(OCT_REPORT, true)))
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-BUSY'))
    const hook = await mount()
    act(() => hook.result.current.create())
    await settle()
    expect(hook.result.current.state).toEqual({ kind: 'failed', code: 'E-AI-BUSY', report: OCT_REPORT })
  })

  it('AC-2704.6: 답이 E-AI-NO-DATA면 noData다', async () => {
    answerPost.mockImplementationOnce(() => codeAnswer('E-AI-NO-DATA'))
    const hook = await mount()
    act(() => hook.result.current.create())
    await settle()
    expect(hook.result.current.state).toEqual({ kind: 'noData' })
  })
})

describe('읽기 실패·로그인 끊김 (AC-2704.7)', () => {
  it('AC-2704.7: 읽기 실패면 readError이고 저절로 다시 읽지 않는다. retryRead()를 부를 때만 loading → GET 한 번 더', async () => {
    answerGet.mockImplementationOnce(() => jsonAnswer({}, 500))
    answerGet.mockImplementationOnce(() => jsonAnswer(viewOf(OCT_REPORT)))
    const hook = await mount()
    expect(hook.result.current.state).toEqual({ kind: 'readError' })
    await advance(10 * 60_000)
    expect(gets()).toHaveLength(1)
    act(() => hook.result.current.retryRead())
    expect(hook.result.current.state).toEqual({ kind: 'loading' })
    await settle()
    expect(gets()).toEqual([urlOf(OCT), urlOf(OCT)])
    expect(hook.result.current.state).toEqual({ kind: 'report', report: OCT_REPORT, stale: false })
    expect(posts()).toEqual([])
  })

  it('AC-2704.7: 읽기 답이 로그인 끊김(돌려보냄)이면 페이지를 한 번 다시 읽는다', async () => {
    answerGet.mockImplementationOnce(() => redirected())
    await mount()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('AC-2704.7: 만들기 답이 로그인 끊김(401)이면 페이지를 한 번 다시 읽고, 그 뒤 눌러도 POST하지 않는다', async () => {
    answerPost.mockImplementationOnce(() => new Response('', { status: 401 }))
    const hook = await mount()
    act(() => hook.result.current.create())
    await settle()
    expect(reload).toHaveBeenCalledTimes(1)
    act(() => hook.result.current.create())
    await settle()
    expect(posts()).toHaveLength(1)
  })
})

describe('늦은 답 (AC-2704.1)', () => {
  it('AC-2704.1: 읽는 중·만드는 중에 화면을 떠나면 늦은 답(로그인 끊김 포함)은 버리고 타이머를 남기지 않는다', async () => {
    const get = later()
    answerGet.mockReturnValueOnce(get.promise)
    const reading = renderHook(() => useAiBrief(TODAY))
    await settle()
    reading.unmount()
    get.resolve(redirected())
    await settle()
    expect(reload).not.toHaveBeenCalled()

    const post = later()
    answerPost.mockReturnValueOnce(post.promise)
    const making = await mount()
    act(() => making.result.current.create())
    await advance(1000)
    making.unmount()
    expect(vi.getTimerCount()).toBe(0)
    post.resolve(redirected())
    await settle()
    expect(reload).not.toHaveBeenCalled()
  })

  it('AC-2704.1: 오늘이 다음 달로 넘어가면 새 지난달을 읽고, 그 전 달의 늦은 답은 버린다', async () => {
    const oct = later()
    answerGet.mockReturnValueOnce(oct.promise)
    answerGet.mockImplementationOnce(() => jsonAnswer(viewOf(reportFor(NOV))))
    const hook = await mount()
    hook.rerender({ day: '2026-12-01' })
    expect(hook.result.current.month).toBe(NOV)
    expect(hook.result.current.state).toEqual({ kind: 'loading' })
    await settle()
    expect(hook.result.current.state).toEqual({ kind: 'report', report: reportFor(NOV), stale: false })
    oct.resolve(jsonAnswer(viewOf(OCT_REPORT)))
    await settle()
    expect(hook.result.current.state).toEqual({ kind: 'report', report: reportFor(NOV), stale: false })
    expect(gets()).toEqual([urlOf(OCT), urlOf(NOV)])
  })
})
