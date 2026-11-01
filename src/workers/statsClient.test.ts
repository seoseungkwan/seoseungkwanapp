import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StatsLoaded, StatsWorkerMessage } from '@/types/stats'
import { AnalyzeError } from './runAnalysis'
import { createStatsWorker, requestLoad, STATS_TIMEOUT_MS, type WorkerLike } from './statsClient'

const REQ = { streamId: 'stream-1', from: '2026-09-01', to: '2026-11-01', today: '2026-11-01', closeToday: true }
const VIEW: StatsLoaded = {
  range: { from: REQ.from, to: REQ.to },
  covered: { from: REQ.from, to: REQ.to },
  quality: 'valid',
  checks: { noChart: 0, duplicate: 0, noFirst: 0 },
  months: [],
  days: [],
  report: { daily: [], monthly: [] },
}

// 진짜 Worker 대신. 받은 것을 적어 두고, 시험이 reply로 답을 흘려보낸다
function fakeWorker() {
  const sent: unknown[] = []
  const worker = {
    onmessage: null as ((event: MessageEvent<StatsWorkerMessage>) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn((message: unknown) => {
      sent.push(message)
    }),
    terminate: vi.fn(),
  }
  return {
    worker,
    sent,
    like: worker as unknown as WorkerLike,
    reply: (data: StatsWorkerMessage) => worker.onmessage?.({ data } as MessageEvent<StatsWorkerMessage>),
  }
}

async function failureOf(promise: Promise<unknown>): Promise<AnalyzeError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(AnalyzeError)
  return error as AnalyzeError
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-505.7 statsClient — 가짜 Worker', () => {
  it('Worker에는 기간·오늘·오늘 진료 끝·통로 요청 id만 간다(다른 칸을 넘겨도)', () => {
    const fake = fakeWorker()
    const req = { ...REQ, rows: [['가짜']], hospitalName: '가짜의원' }
    void requestLoad(fake.like, req)
    expect(fake.sent).toEqual([
      { type: 'load', streamId: REQ.streamId, from: REQ.from, to: REQ.to, today: REQ.today, closeToday: REQ.closeToday },
    ])
    fake.reply({ type: 'loaded', streamId: REQ.streamId, view: VIEW })
  })

  it('loaded → 받은 모양으로 resolve. Worker는 끝내지 않는다(메모리가 Worker에 남는다)', async () => {
    const fake = fakeWorker()
    const running = requestLoad(fake.like, REQ)
    fake.reply({ type: 'loaded', streamId: REQ.streamId, view: VIEW })
    await expect(running).resolves.toEqual(VIEW)
    expect(fake.worker.terminate).not.toHaveBeenCalled()
    expect(fake.worker.onmessage).toBeNull() // 끝나면 듣기를 뗀다
  })

  it('정해 둔 시간은 120초다: 그 전에는 기다리고, 넘으면 E-ANALYZE-TIMEOUT', async () => {
    vi.useFakeTimers()
    expect(STATS_TIMEOUT_MS).toBe(120_000)
    const fake = fakeWorker()
    const failure = failureOf(requestLoad(fake.like, REQ))
    let settled = false
    void failure.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(STATS_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((await failure).code).toBe('E-ANALYZE-TIMEOUT')
    expect(fake.worker.onmessage).toBeNull()
  })

  it('timeoutMs를 받는다', async () => {
    vi.useFakeTimers()
    const failure = failureOf(requestLoad(fakeWorker().like, REQ, { timeoutMs: 50 }))
    await vi.advanceTimersByTimeAsync(50)
    expect((await failure).code).toBe('E-ANALYZE-TIMEOUT')
  })

  it('시간이 지나 포기한 앞 일의 늦은 답을 다음 일의 답으로 받지 않는다', async () => {
    vi.useFakeTimers()
    const fake = fakeWorker()
    const first = failureOf(requestLoad(fake.like, REQ, { timeoutMs: 50 }))
    await vi.advanceTimersByTimeAsync(50)
    await first

    const next = requestLoad(fake.like, { ...REQ, streamId: 'stream-2' })
    fake.reply({ type: 'loaded', streamId: REQ.streamId, view: { ...VIEW, quality: 'incomplete' } })
    fake.reply({ type: 'failed', streamId: REQ.streamId, code: 'E-BRIDGE-BAD-REPLY' })
    fake.reply({ type: 'loaded', streamId: 'stream-2', view: VIEW })
    await expect(next).resolves.toEqual(VIEW)
  })

  it.each([
    ['E-BRIDGE-BAD-REPLY', 'E-BRIDGE-BAD-REPLY'],
    ['E-ANALYZE-FAILED', 'E-ANALYZE-FAILED'],
    ['E-STATS-TOO-BIG', 'E-STATS-TOO-BIG'],
  ])('failed %s → 그 번호로 reject', async (code, expected) => {
    const fake = fakeWorker()
    const failure = failureOf(requestLoad(fake.like, REQ))
    fake.reply({ type: 'failed', streamId: REQ.streamId, code })
    expect((await failure).code).toBe(expected)
  })

  it('failed의 번호가 표에 없으면 옮기지 않고 E-ANALYZE-FAILED', async () => {
    const fake = fakeWorker()
    const failure = failureOf(requestLoad(fake.like, REQ))
    const leak = `차트 ${'9'}${'00001'}`
    fake.reply({ type: 'failed', streamId: REQ.streamId, code: leak })
    const error = await failure
    expect(error.code).toBe('E-ANALYZE-FAILED')
    expect(error.message).not.toContain(leak)
  })

  it('Worker 오류(스크립트·잡히지 않은 예외) → E-ANALYZE-FAILED, 내용이 콘솔에 찍히지 않게 막고 옮기지 않는다', async () => {
    const fake = fakeWorker()
    const failure = failureOf(requestLoad(fake.like, REQ))
    const preventDefault = vi.fn()
    fake.worker.onerror?.({ preventDefault, message: `차트 ${'9'}${'00001'}` } as unknown as Event)
    const error = await failure
    expect(error.code).toBe('E-ANALYZE-FAILED')
    expect(error.message).toBe('E-ANALYZE-FAILED')
    expect(preventDefault).toHaveBeenCalled()
  })

  it('답을 못 푼 경우(messageerror) → E-ANALYZE-FAILED', async () => {
    const fake = fakeWorker()
    const failure = failureOf(requestLoad(fake.like, REQ))
    fake.worker.onmessageerror?.({} as MessageEvent)
    expect((await failure).code).toBe('E-ANALYZE-FAILED')
  })

  it('보내기가 실패해도 예외 내용 없이 E-ANALYZE-FAILED, 시간 재기도 멈춘다', async () => {
    vi.useFakeTimers()
    const fake = fakeWorker()
    fake.worker.postMessage.mockImplementation(() => {
      throw new Error(`차트 ${'9'}${'00001'}`)
    })
    const error = await failureOf(requestLoad(fake.like, REQ))
    expect(error.code).toBe('E-ANALYZE-FAILED')
    expect(error.message).toBe('E-ANALYZE-FAILED')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('createStatsWorker: stats.worker.ts를 모듈 Worker로 만든다', () => {
    const made: { url: unknown; options: unknown }[] = []
    vi.stubGlobal(
      'Worker',
      class {
        constructor(url: unknown, options: unknown) {
          made.push({ url, options })
        }
      },
    )
    createStatsWorker()
    expect(made).toHaveLength(1)
    expect(String(made[0].url)).toMatch(/\/stats\.worker\.ts$/)
    expect(made[0].options).toEqual({ type: 'module' })
  })
})
