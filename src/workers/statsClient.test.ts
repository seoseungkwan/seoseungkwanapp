import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  BitSectionsView,
  PatientMix,
  RxSplitView,
  StatsLoaded,
  StatsSectionsRequest,
  StatsSplitRequest,
  StatsWorkerMessage,
} from '@/types/stats'
import { AnalyzeError } from './runAnalysis'
import { createStatsWorker, requestLoad, requestSections, requestSplit, STATS_TIMEOUT_MS, type WorkerLike } from './statsClient'

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
      { type: 'load', streamId: REQ.streamId, from: REQ.from, to: REQ.to, today: REQ.today, closeToday: REQ.closeToday, groups: [] },
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

describe('AC-1205.4·AC-1213.3 requestLoad — 묶음은 열쇠와 코드만 간다', () => {
  // 가짜 묶음 열쇠·코드. 이름·차례는 화면에만 있는 칸이다
  const GROUPS = [
    { id: 't00000000000000a1', codes: ['MM042', 'mm043'], name: '가짜 물리치료', sortOrder: 0 },
    { id: 't00000000000000b2', codes: ['B4001'], name: '가짜 검사', sortOrder: 1 },
  ]
  const loadIn = (fake: ReturnType<typeof fakeWorker>) => fake.sent.find((message) => (message as { type?: string }).type === 'load') as Record<string, unknown>

  it('AC-1205.4: 묶음을 주면 load 메시지에 groups 배열 [{ id, codes }]이 있고 이름 등 다른 칸은 없다', () => {
    const fake = fakeWorker()
    void requestLoad(fake.like, { ...REQ, groups: GROUPS })
    expect(fake.sent).toEqual([
      {
        type: 'load',
        streamId: REQ.streamId,
        from: REQ.from,
        to: REQ.to,
        today: REQ.today,
        closeToday: REQ.closeToday,
        groups: [
          { id: 't00000000000000a1', codes: ['MM042', 'mm043'] },
          { id: 't00000000000000b2', codes: ['B4001'] },
        ],
      },
    ])
    const groups = loadIn(fake).groups as { id: string; codes: string[] }[]
    for (const group of groups) expect(Object.keys(group).sort()).toEqual(['codes', 'id'])
    expect(JSON.stringify(fake.sent)).not.toContain('가짜 물리치료')
    fake.reply({ type: 'loaded', streamId: REQ.streamId, view: VIEW })
  })

  it('AC-1205.4: 묶음과 코드 목록은 새로 만든다(넘긴 배열을 그대로 보내지 않는다)', () => {
    const fake = fakeWorker()
    void requestLoad(fake.like, { ...REQ, groups: GROUPS })
    const groups = loadIn(fake).groups as { id: string; codes: string[] }[]
    expect(groups).not.toBe(GROUPS)
    expect(groups[0]).not.toBe(GROUPS[0])
    expect(groups[0].codes).not.toBe(GROUPS[0].codes)
    fake.reply({ type: 'loaded', streamId: REQ.streamId, view: VIEW })
  })

  it('AC-1205.4: 묶음을 주지 않으면 groups: []를 보낸다(늘 배열)', () => {
    const fake = fakeWorker()
    void requestLoad(fake.like, REQ)
    expect(loadIn(fake).groups).toEqual([])
    fake.reply({ type: 'loaded', streamId: REQ.streamId, view: VIEW })
  })
})

const RANGE = { from: '2026-10-01', to: '2026-10-31' }
const SPLIT_VIEW: RxSplitView = {
  kind: 'split',
  split: {
    from: RANGE.from,
    to: RANGE.to,
    visits: 2,
    patients: 2,
    newPatients: 1,
    returning: 1,
    invalidCodes: 0,
    lines: [{ code: 'MM042', label: '표층열치료', newPatients: 1, returning: 1, total: 2 }],
  },
  days: [],
  text: '가짜 글',
  headline: '가짜 머리',
}

// requestSplit이 정한 번호. 답은 이 번호로 돌아와야 받는다
const splitIdOf = (fake: ReturnType<typeof fakeWorker>, index = fake.sent.length - 1) => (fake.sent[index] as StatsSplitRequest).streamId

describe('AC-509.4 requestSplit — 가짜 Worker', () => {
  it('Worker에는 기간과 일 번호만 간다(다른 칸을 넘겨도)', () => {
    const fake = fakeWorker()
    void requestSplit(fake.like, { ...RANGE, rows: [['가짜']], hospitalName: '가짜의원' } as typeof RANGE)
    const streamId = splitIdOf(fake)
    expect(streamId).not.toBe('')
    expect(fake.sent).toEqual([{ type: 'split', streamId, ...RANGE }])
    fake.reply({ type: 'split-result', streamId, view: { kind: 'none' } })
  })

  it('부를 때마다 번호가 다르다', () => {
    const fake = fakeWorker()
    void requestSplit(fake.like, RANGE)
    void requestSplit(fake.like, RANGE)
    expect(splitIdOf(fake, 0)).not.toBe(splitIdOf(fake, 1))
    fake.reply({ type: 'split-result', streamId: splitIdOf(fake, 0), view: { kind: 'none' } })
    fake.reply({ type: 'split-result', streamId: splitIdOf(fake, 1), view: { kind: 'none' } })
  })

  it.each([
    ['결과', SPLIT_VIEW],
    ['none', { kind: 'none' } as RxSplitView],
  ])('split-result(%s) → 받은 모양으로 resolve, 듣기를 떼고 Worker는 끝내지 않는다', async (_name, view) => {
    const fake = fakeWorker()
    const running = requestSplit(fake.like, RANGE)
    fake.reply({ type: 'split-result', streamId: splitIdOf(fake), view })
    await expect(running).resolves.toEqual(view)
    expect(fake.worker.terminate).not.toHaveBeenCalled()
    expect(fake.worker.onmessage).toBeNull()
    expect(fake.worker.onerror).toBeNull()
    expect(fake.worker.onmessageerror).toBeNull()
  })

  it('정해 둔 시간은 120초다: 그 전에는 기다리고, 넘으면 E-ANALYZE-TIMEOUT', async () => {
    vi.useFakeTimers()
    const fake = fakeWorker()
    const failure = failureOf(requestSplit(fake.like, RANGE))
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
    const failure = failureOf(requestSplit(fakeWorker().like, RANGE, { timeoutMs: 50 }))
    await vi.advanceTimersByTimeAsync(50)
    expect((await failure).code).toBe('E-ANALYZE-TIMEOUT')
  })

  it('failed의 번호를 그대로 reject, 표에 없는 글자는 옮기지 않고 E-ANALYZE-FAILED', async () => {
    const fake = fakeWorker()
    const known = failureOf(requestSplit(fake.like, RANGE))
    fake.reply({ type: 'failed', streamId: splitIdOf(fake), code: 'E-BRIDGE-BAD-REPLY' })
    expect((await known).code).toBe('E-BRIDGE-BAD-REPLY')

    const leak = `차트 ${'9'}${'00001'}`
    const unknown = failureOf(requestSplit(fake.like, RANGE))
    fake.reply({ type: 'failed', streamId: splitIdOf(fake), code: leak })
    const error = await unknown
    expect(error.code).toBe('E-ANALYZE-FAILED')
    expect(error.message).not.toContain(leak)
  })

  it('Worker 오류·못 푼 답·보내기 실패 → E-ANALYZE-FAILED, 내용을 옮기지 않는다', async () => {
    vi.useFakeTimers()
    const fake = fakeWorker()
    const crashed = failureOf(requestSplit(fake.like, RANGE))
    const preventDefault = vi.fn()
    fake.worker.onerror?.({ preventDefault, message: `차트 ${'9'}${'00001'}` } as unknown as Event)
    expect((await crashed).message).toBe('E-ANALYZE-FAILED')
    expect(preventDefault).toHaveBeenCalled()

    const garbled = failureOf(requestSplit(fake.like, RANGE))
    fake.worker.onmessageerror?.({} as MessageEvent)
    expect((await garbled).code).toBe('E-ANALYZE-FAILED')

    fake.worker.postMessage.mockImplementation(() => {
      throw new Error(`차트 ${'9'}${'00001'}`)
    })
    const error = await failureOf(requestSplit(fake.like, RANGE))
    expect(error.message).toBe('E-ANALYZE-FAILED')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('시간이 지나 포기한 앞 일의 늦은 답을 다음 일의 답으로 받지 않는다', async () => {
    vi.useFakeTimers()
    const fake = fakeWorker()
    const first = failureOf(requestSplit(fake.like, RANGE, { timeoutMs: 50 }))
    const firstId = splitIdOf(fake)
    await vi.advanceTimersByTimeAsync(50)
    await first

    const next = requestSplit(fake.like, RANGE)
    fake.reply({ type: 'split-result', streamId: firstId, view: { kind: 'none' } })
    fake.reply({ type: 'failed', streamId: firstId, code: 'E-BRIDGE-BAD-REPLY' })
    fake.reply({ type: 'split-result', streamId: splitIdOf(fake), view: SPLIT_VIEW })
    await expect(next).resolves.toEqual(SPLIT_VIEW)
  })

  // 한 Worker를 불러오기와 기간 바꿈이 같이 쓴다. 듣는 자리가 하나라 겹치면 먼저 부른 일의 답이 사라지면 안 된다
  it('기간을 빨리 두 번 바꿔도 둘 다 제 답을 받는다', async () => {
    const fake = fakeWorker()
    const first = requestSplit(fake.like, RANGE)
    const firstId = splitIdOf(fake)
    const second = requestSplit(fake.like, RANGE)
    fake.reply({ type: 'split-result', streamId: firstId, view: { kind: 'none' } })
    fake.reply({ type: 'split-result', streamId: splitIdOf(fake), view: SPLIT_VIEW })
    await expect(first).resolves.toEqual({ kind: 'none' })
    await expect(second).resolves.toEqual(SPLIT_VIEW)
    expect(fake.worker.onmessage).toBeNull()
  })

  it('불러오는 동안 기간을 바꿔도 불러오기 답을 잃지 않는다', async () => {
    const fake = fakeWorker()
    const loading = requestLoad(fake.like, REQ)
    const splitting = requestSplit(fake.like, RANGE)
    fake.reply({ type: 'split-result', streamId: splitIdOf(fake), view: { kind: 'none' } })
    await expect(splitting).resolves.toEqual({ kind: 'none' })
    expect(fake.worker.onmessage).not.toBeNull()
    fake.reply({ type: 'loaded', streamId: REQ.streamId, view: VIEW })
    await expect(loading).resolves.toEqual(VIEW)
    expect(fake.worker.onmessage).toBeNull()
  })

  it('앞 일이 시간 초과로 끝나도 도는 일의 듣기를 떼지 않는다', async () => {
    vi.useFakeTimers()
    const fake = fakeWorker()
    const stale = failureOf(requestSplit(fake.like, RANGE, { timeoutMs: 50 }))
    const running = requestLoad(fake.like, REQ)
    await vi.advanceTimersByTimeAsync(50)
    expect((await stale).code).toBe('E-ANALYZE-TIMEOUT')
    fake.reply({ type: 'loaded', streamId: REQ.streamId, view: VIEW })
    await expect(running).resolves.toEqual(VIEW)
  })

  it('Worker 오류는 도는 일 모두를 끝낸다', async () => {
    const fake = fakeWorker()
    const loading = failureOf(requestLoad(fake.like, REQ))
    const splitting = failureOf(requestSplit(fake.like, RANGE))
    fake.worker.onerror?.({ preventDefault: vi.fn() } as unknown as Event)
    expect((await loading).code).toBe('E-ANALYZE-FAILED')
    expect((await splitting).code).toBe('E-ANALYZE-FAILED')
    expect(fake.worker.onmessage).toBeNull()
  })
})

// ── 비트 전용 세 칸(stats-bit-sections) ──
const PREVIOUS = { from: '2026-09-01', to: '2026-09-30' }
const EMPTY_MIX: PatientMix = { total: { people: 0, visits: 0 }, compared: false, age: [], insurance: [], city: [], town: [] }
const SECTIONS_VIEW: BitSectionsView = {
  kind: 'ready',
  mix: { all: EMPTY_MIX, new: { ...EMPTY_MIX, compared: true } },
  hours: { hours: [8, 9], rows: [], unknown: 0, peak: null },
  doctors: { kind: 'single' },
}

// requestSections가 정한 번호. 답은 이 번호로 돌아와야 받는다
const sectionsIdOf = (fake: ReturnType<typeof fakeWorker>, index = fake.sent.length - 1) => (fake.sent[index] as StatsSectionsRequest).streamId

describe('AC-2702.3 requestSections — 가짜 Worker', () => {
  it('AC-2702.3: Worker에는 기간·견줄 기간(from·to만)·일 번호만 간다(다른 칸을 넘겨도)', () => {
    const fake = fakeWorker()
    const previous = { ...PREVIOUS, name: '지난 30일', why: '지난 30일', label: '9월 1일 ~ 9월 30일' }
    void requestSections(fake.like, { ...RANGE, previous, rows: [['가짜']], hospitalName: '가짜의원' } as typeof RANGE)
    const streamId = sectionsIdOf(fake)
    expect(streamId).not.toBe('')
    expect(fake.sent).toEqual([{ type: 'sections', streamId, ...RANGE, previous: PREVIOUS }])
    fake.reply({ type: 'sections-result', streamId, view: { kind: 'none' } })
  })

  it('AC-2702.3: 견줄 기간을 주지 않거나 null이면 previous: null을 보낸다(늘 있는 칸)', () => {
    const fake = fakeWorker()
    void requestSections(fake.like, RANGE)
    void requestSections(fake.like, { ...RANGE, previous: null })
    expect(fake.sent).toEqual([
      { type: 'sections', streamId: sectionsIdOf(fake, 0), ...RANGE, previous: null },
      { type: 'sections', streamId: sectionsIdOf(fake, 1), ...RANGE, previous: null },
    ])
  })

  it('AC-2702.3: 부를 때마다 번호가 다르고 처방별(split) 번호와도 겹치지 않는다', () => {
    const fake = fakeWorker()
    void requestSections(fake.like, RANGE)
    void requestSplit(fake.like, RANGE)
    void requestSections(fake.like, RANGE)
    const ids = fake.sent.map((message) => (message as { streamId: string }).streamId)
    expect(new Set(ids).size).toBe(3)
  })

  it.each([
    ['ready', SECTIONS_VIEW],
    ['none', { kind: 'none' } as BitSectionsView],
    ['old-helper', { kind: 'old-helper' } as BitSectionsView],
  ])('AC-2702.3: sections-result(%s) → 받은 모양으로 resolve, 듣기를 떼고 Worker는 끝내지 않는다', async (_name, view) => {
    const fake = fakeWorker()
    const running = requestSections(fake.like, { ...RANGE, previous: PREVIOUS })
    fake.reply({ type: 'sections-result', streamId: sectionsIdOf(fake), view })
    await expect(running).resolves.toEqual(view)
    expect(fake.worker.terminate).not.toHaveBeenCalled()
    expect(fake.worker.onmessage).toBeNull()
    expect(fake.worker.onerror).toBeNull()
    expect(fake.worker.onmessageerror).toBeNull()
  })

  it('AC-2702.3: 같은 번호라도 다른 종류의 답(split-result)은 세 칸 답으로 받지 않는다', async () => {
    const fake = fakeWorker()
    const running = requestSections(fake.like, RANGE)
    const streamId = sectionsIdOf(fake)
    fake.reply({ type: 'split-result', streamId, view: { kind: 'none' } })
    expect(fake.worker.onmessage).not.toBeNull()
    fake.reply({ type: 'sections-result', streamId, view: SECTIONS_VIEW })
    await expect(running).resolves.toEqual(SECTIONS_VIEW)
  })

  it('AC-2702.3: 정해 둔 시간은 120초다. timeoutMs도 받는다', async () => {
    vi.useFakeTimers()
    const fake = fakeWorker()
    const failure = failureOf(requestSections(fake.like, RANGE))
    let settled = false
    void failure.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(STATS_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((await failure).code).toBe('E-ANALYZE-TIMEOUT')

    const short = failureOf(requestSections(fakeWorker().like, RANGE, { timeoutMs: 50 }))
    await vi.advanceTimersByTimeAsync(50)
    expect((await short).code).toBe('E-ANALYZE-TIMEOUT')
  })

  it('AC-2702.4: failed의 번호를 그대로 reject, 표에 없는 글자는 옮기지 않고 E-ANALYZE-FAILED', async () => {
    const fake = fakeWorker()
    const known = failureOf(requestSections(fake.like, RANGE))
    fake.reply({ type: 'failed', streamId: sectionsIdOf(fake), code: 'E-ANALYZE-FAILED' })
    expect((await known).code).toBe('E-ANALYZE-FAILED')

    const leak = `차트 ${'9'}${'00001'}`
    const unknown = failureOf(requestSections(fake.like, RANGE))
    fake.reply({ type: 'failed', streamId: sectionsIdOf(fake), code: leak })
    const error = await unknown
    expect(error.code).toBe('E-ANALYZE-FAILED')
    expect(error.message).not.toContain(leak)
  })

  it('AC-2702.3: 불러오기·처방별·세 칸을 함께 물어도 저마다 제 답을 받는다', async () => {
    const fake = fakeWorker()
    const loading = requestLoad(fake.like, REQ)
    const splitting = requestSplit(fake.like, RANGE)
    const splitId = splitIdOf(fake)
    const sectioning = requestSections(fake.like, RANGE)
    fake.reply({ type: 'sections-result', streamId: sectionsIdOf(fake), view: SECTIONS_VIEW })
    fake.reply({ type: 'split-result', streamId: splitId, view: SPLIT_VIEW })
    await expect(sectioning).resolves.toEqual(SECTIONS_VIEW)
    await expect(splitting).resolves.toEqual(SPLIT_VIEW)
    expect(fake.worker.onmessage).not.toBeNull()
    fake.reply({ type: 'loaded', streamId: REQ.streamId, view: VIEW })
    await expect(loading).resolves.toEqual(VIEW)
    expect(fake.worker.onmessage).toBeNull()
  })

  it('AC-2702.4: Worker 오류·보내기 실패 → E-ANALYZE-FAILED, 내용을 옮기지 않는다', async () => {
    vi.useFakeTimers()
    const fake = fakeWorker()
    const crashed = failureOf(requestSections(fake.like, RANGE))
    fake.worker.onerror?.({ preventDefault: vi.fn(), message: `차트 ${'9'}${'00001'}` } as unknown as Event)
    expect((await crashed).message).toBe('E-ANALYZE-FAILED')

    fake.worker.postMessage.mockImplementation(() => {
      throw new Error(`차트 ${'9'}${'00001'}`)
    })
    const error = await failureOf(requestSections(fake.like, RANGE))
    expect(error.message).toBe('E-ANALYZE-FAILED')
    expect(vi.getTimerCount()).toBe(0)
  })
})
