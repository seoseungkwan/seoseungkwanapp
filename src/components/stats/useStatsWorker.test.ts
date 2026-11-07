// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_HELPER } from '@/lib/bridge/versions'
import { createStatsWorker } from '@/workers/statsClient'
import type { RxGroupDef } from '@/types/analysis'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import type { BitSectionsView, RxSplitView, StatsLoaded, StatsWorkerMessage, StatsWorkerRequest } from '@/types/stats'
import { errorCodeOf, useStatsWorker } from './useStatsWorker'

// Worker 하나 + 통로 (stats REQ-514 AC-514.3·514.8, design.md TASK-14). 진짜 useBridge·requestLoad에 가짜 chrome.runtime·가짜 Worker만 넣는다.
// 넘기는 값은 모두 가짜다

vi.mock('@/workers/statsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/workers/statsClient')>()),
  createStatsWorker: vi.fn(),
}))

const RANGE = { from: '2026-09-01', to: '2026-11-13' }
const TODAY = '2026-11-13'
const SHA = '0'.repeat(64)
const HELLO = { helperVersion: MIN_HELPER, protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }
const VIEW: StatsLoaded = {
  range: RANGE,
  covered: { from: RANGE.from, to: '2026-11-12' },
  quality: 'valid',
  checks: { noChart: 0, duplicate: 0, noFirst: 0 },
  months: [],
  days: [],
  report: { daily: [], monthly: [] },
}
const SPLIT: RxSplitView = { kind: 'none' }

class FakePort implements PortLike {
  sent: Record<string, unknown>[] = []
  disconnected = false
  private messageFns: ((m: unknown) => void)[] = []
  onMessage = { addListener: (fn: (m: unknown) => void) => void this.messageFns.push(fn) }
  onDisconnect = { addListener: () => undefined }
  postMessage(m: unknown) {
    this.sent.push(m as Record<string, unknown>)
  }
  disconnect() {
    this.disconnected = true
  }
  reply(m: unknown) {
    for (const fn of this.messageFns) fn(m)
  }
  last() {
    return this.sent[this.sent.length - 1]!
  }
}

function fakeChrome() {
  const ports: FakePort[] = []
  const runtime: ChromeRuntimeLike = {
    connect() {
      const port = new FakePort()
      ports.push(port)
      return port
    },
  }
  vi.stubGlobal('chrome', { runtime })
  return { ports, port: () => ports[ports.length - 1]! }
}

function fakeWorker() {
  const sent: StatsWorkerRequest[] = []
  const transfers: Transferable[][] = []
  const worker = {
    onmessage: null as ((event: MessageEvent<StatsWorkerMessage>) => void) | null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage: vi.fn((message: StatsWorkerRequest, transfer: Transferable[] = []) => {
      sent.push(message)
      transfers.push(transfer)
    }),
  }
  vi.mocked(createStatsWorker).mockReturnValue(worker as unknown as Worker)
  return {
    worker,
    sent,
    transfers,
    reply: (data: StatsWorkerMessage) => worker.onmessage?.({ data } as MessageEvent<StatsWorkerMessage>),
  }
}

function drawReady() {
  const chrome = fakeChrome()
  const fake = fakeWorker()
  const view = renderHook(() => useStatsWorker())
  const port = chrome.port()
  act(() => port.reply({ v: 1, id: port.last().id, type: 'result', data: HELLO }))
  return { chrome, fake, view, port }
}

// 중괄호를 지우지 않는다: beforeEach가 함수를 돌려주면 시험 뒤 정리 함수로 불린다
beforeEach(() => {
  vi.mocked(createStatsWorker).mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AC-514.3 Worker 하나와 통로', () => {
  it('AC-514.3 Worker를 하나만 만들어 통로 포트를 넘기고, 통로는 한 번만 붙는다(다시 붙으면 다른 창으로 보일 수 있다)', async () => {
    const { chrome, fake, view } = drawReady()
    expect(createStatsWorker).toHaveBeenCalledTimes(1)
    expect(fake.sent[0]).toEqual({ type: 'bridge-port' })
    expect(fake.transfers[0]).toHaveLength(1)
    expect(chrome.ports).toHaveLength(1)
    await waitFor(() => expect(view.result.current.state).toBe('ready'))
    view.rerender()
    expect(createStatsWorker).toHaveBeenCalledTimes(1)
    expect(chrome.ports).toHaveLength(1)
  })

  it('AC-514.3 화면을 떠나면 Worker를 끝내고 통로를 닫는다', () => {
    const { fake, view, port } = drawReady()
    expect(fake.worker.terminate).not.toHaveBeenCalled()
    view.unmount()
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
    expect(port.disconnected).toBe(true)
  })

  it('AC-514.3 엄격 모드로 한 번 내렸다 다시 올려도 살아 있는 새 Worker에 포트가 간다', () => {
    const chrome = fakeChrome()
    const fake = fakeWorker()
    const view = renderHook(() => useStatsWorker(), { wrapper: StrictMode })
    expect(createStatsWorker).toHaveBeenCalledTimes(2)
    expect(fake.worker.terminate).toHaveBeenCalledTimes(1)
    expect(fake.sent.filter((message) => message.type === 'bridge-port')).toHaveLength(2)
    expect(chrome.ports).toHaveLength(2)
    view.unmount()
    expect(fake.worker.terminate).toHaveBeenCalledTimes(2)
  })

  it('AC-514.3 불러오기와 기간 바꿈이 통로 포트를 받은 그 Worker 하나를 쓴다', async () => {
    const { fake, view, port } = drawReady()
    act(() => {
      void view.result.current.load({ range: RANGE, today: TODAY, closeToday: false })
    })
    const request = port.last()
    act(() => port.reply({ v: 1, id: request.id, type: 'end', count: 0, bytes: 0, sha256: SHA }))
    await waitFor(() => expect(fake.sent.some((message) => message.type === 'load')).toBe(true))
    fake.reply({ type: 'loaded', streamId: request.id as string, view: VIEW })

    act(() => {
      void view.result.current.split({ from: '2026-10-14', to: '2026-11-12' })
    })
    expect(fake.sent.map((message) => message.type)).toEqual(['bridge-port', 'load', 'split'])
    expect(createStatsWorker).toHaveBeenCalledTimes(1)
  })

  it('AC-514.3 Worker를 못 만들어도 화면이 죽지 않고, 불러오기·기간 바꿈이 오류 번호로 끝나며 떠날 때 문제없다', async () => {
    const chrome = fakeChrome()
    vi.mocked(createStatsWorker).mockImplementation(() => {
      throw new Error('가짜 내용')
    })
    const view = renderHook(() => useStatsWorker())
    const port = chrome.port()
    act(() => port.reply({ v: 1, id: port.last().id, type: 'result', data: HELLO }))
    await waitFor(() => expect(view.result.current.state).toBe('ready'))

    let failure: unknown = null
    act(() => {
      void view.result.current.load({ range: RANGE, today: TODAY, closeToday: false }).catch((e: unknown) => (failure = e))
    })
    const request = port.last()
    act(() => port.reply({ v: 1, id: request.id, type: 'end', count: 0, bytes: 0, sha256: SHA }))
    await waitFor(() => expect(failure).not.toBeNull())
    expect(errorCodeOf(failure)).toBe('E-ANALYZE-FAILED')

    const splitFailure: unknown = await view.result.current.split({ from: '2026-10-14', to: '2026-11-12' }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(errorCodeOf(splitFailure)).toBe('E-ANALYZE-FAILED')
    view.unmount()
  })

  it('AC-514.5 확장이 없는 곳은 상태가 no-extension이다', async () => {
    fakeWorker()
    const view = renderHook(() => useStatsWorker())
    await waitFor(() => expect(view.result.current.state).toBe('no-extension'))
  })

  it('AC-514.3 불러오기 = stream(stats.rows) 끝난 뒤 그 요청 id로 Worker load, 답은 저장 모양뿐이다', async () => {
    const { fake, view, port } = drawReady()
    let answer: StatsLoaded | null = null
    act(() => {
      void view.result.current.load({ range: RANGE, today: TODAY, closeToday: false }).then((loaded) => (answer = loaded))
    })
    const request = port.last()
    expect(request.cmd).toBe('stats.rows')
    expect(request.args).toEqual(RANGE)
    expect(fake.sent.some((message) => message.type === 'load')).toBe(false)

    act(() => port.reply({ v: 1, id: request.id, type: 'end', count: 0, bytes: 0, sha256: SHA }))
    await waitFor(() => expect(fake.sent.some((message) => message.type === 'load')).toBe(true))
    const streamId = request.id as string
    expect(fake.sent.at(-1)).toEqual({ type: 'load', streamId, from: RANGE.from, to: RANGE.to, today: TODAY, closeToday: false, groups: [] })

    fake.reply({ type: 'loaded', streamId, view: VIEW })
    await waitFor(() => expect(answer).toEqual(VIEW))
  })

  it('AC-514.8 오늘 진료 끝 표시가 Worker load의 closeToday로 간다', async () => {
    const { fake, view, port } = drawReady()
    act(() => {
      void view.result.current.load({ range: RANGE, today: TODAY, closeToday: true })
    })
    const request = port.last()
    act(() => port.reply({ v: 1, id: request.id, type: 'end', count: 0, bytes: 0, sha256: SHA }))
    await waitFor(() => expect(fake.sent.at(-1)).toMatchObject({ type: 'load', closeToday: true }))
    fake.reply({ type: 'loaded', streamId: request.id as string, view: VIEW })
  })

  it('AC-514.3 조각은 Worker 포트로만 가고 화면 쪽 값에는 통로 명령이 없다', async () => {
    const { fake, view, port } = drawReady()
    const workerPort = fake.transfers[0]![0] as MessagePort
    const atWorker: unknown[] = []
    workerPort.onmessage = (event) => atWorker.push(event.data)

    act(() => {
      void view.result.current.load({ range: RANGE, today: TODAY, closeToday: false }).catch(() => undefined)
    })
    const request = port.last()
    act(() => port.reply({ v: 1, id: request.id, type: 'chunk', seq: 0, data: '가짜-차트번호-0001' }))
    await waitFor(() => expect(atWorker).toEqual([{ type: 'chunk', id: request.id, seq: 0, data: '가짜-차트번호-0001' }]))

    for (const name of ['stream', 'call', 'send', 'onProgress']) expect(view.result.current).not.toHaveProperty(name)
    expect(JSON.stringify(view.result.current)).not.toContain('가짜-차트번호')
    workerPort.close()
  })

  it('AC-514.2 기간 바꿈의 처방별 셈은 기간만 Worker로 보낸다', async () => {
    const { fake, view } = drawReady()
    let answer: RxSplitView | null = null
    act(() => {
      void view.result.current.split({ from: '2026-10-14', to: '2026-11-12' }).then((result) => (answer = result))
    })
    const message = fake.sent.at(-1)
    expect(message).toMatchObject({ type: 'split', from: '2026-10-14', to: '2026-11-12' })
    expect(Object.keys(message!).sort()).toEqual(['from', 'streamId', 'to', 'type'])
    fake.reply({ type: 'split-result', streamId: (message as { streamId: string }).streamId, view: SPLIT })
    await waitFor(() => expect(answer).toEqual(SPLIT))
  })
})

// treatment-trend TASK-14: load의 groups는 선택 Promise다. 비트 요청은 그것을 기다리지 않고, Worker load는 풀린 묶음을 싣는다(거절이면 [])
describe('AC-1205.4·AC-1205.7 묶음 넘기기', () => {
  const GROUPS: RxGroupDef[] = [
    { id: 't0123456789abcdef', codes: ['MM101', 'MM102'] },
    { id: 'tfedcba9876543210', codes: ['ESWT1'] },
  ]
  const end = (id: unknown) => ({ v: 1, id, type: 'end', count: 0, bytes: 0, sha256: SHA })
  // 진짜 시계로 한 번 쉬어, 이어 달린 약속을 모두 돌린다
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  const loads = (sent: StatsWorkerRequest[]) => sent.filter((message) => message.type === 'load')

  const unhandled = vi.fn()
  beforeEach(() => {
    unhandled.mockReset()
    process.on('unhandledRejection', unhandled)
  })
  afterEach(() => {
    process.off('unhandledRejection', unhandled)
  })

  it('AC-1205.7 묶음이 풀리기 전에 stats.rows 요청이 바로 나가고, Worker load는 비트 요청이 끝나고 묶음이 풀린 뒤에 그 묶음을 싣고 간다', async () => {
    const { fake, view, port } = drawReady()
    const groups = deferred<readonly RxGroupDef[]>()
    let answer: StatsLoaded | null = null
    const sentBefore = port.sent.length
    act(() => {
      void view.result.current
        .load({ range: RANGE, today: TODAY, closeToday: false, groups: groups.promise })
        .then((loaded) => (answer = loaded))
    })
    expect(port.sent).toHaveLength(sentBefore + 1)
    const request = port.last()
    expect(request.cmd).toBe('stats.rows')
    expect(request.args).toEqual(RANGE)

    act(() => port.reply(end(request.id)))
    await settle()
    expect(loads(fake.sent)).toEqual([]) // 비트 요청은 끝났지만 묶음이 아직이다

    groups.resolve(GROUPS)
    await waitFor(() => expect(loads(fake.sent)).toHaveLength(1))
    const streamId = request.id as string
    expect(fake.sent.at(-1)).toEqual({ type: 'load', streamId, from: RANGE.from, to: RANGE.to, today: TODAY, closeToday: false, groups: GROUPS })

    fake.reply({ type: 'loaded', streamId, view: VIEW })
    await waitFor(() => expect(answer).toEqual(VIEW))
  })

  it('AC-1205.4 묶음이 비트 요청보다 먼저 풀려도 Worker load에는 비트 요청이 끝난 뒤 [{ id, codes }]만 간다(이름 등 다른 칸 없음)', async () => {
    const { fake, view, port } = drawReady()
    const named = GROUPS.map((group) => ({ ...group, name: '가짜 묶음 이름', sortOrder: 0 })) as RxGroupDef[]
    act(() => {
      void view.result.current.load({ range: RANGE, today: TODAY, closeToday: true, groups: Promise.resolve(named) }).catch(() => undefined)
    })
    const request = port.last()
    expect(request.cmd).toBe('stats.rows')
    await settle()
    expect(loads(fake.sent)).toEqual([]) // 묶음은 풀렸지만 비트 요청이 아직이다

    act(() => port.reply(end(request.id)))
    await waitFor(() => expect(loads(fake.sent)).toHaveLength(1))
    const message = fake.sent.at(-1)!
    expect(message).toEqual({ type: 'load', streamId: request.id, from: RANGE.from, to: RANGE.to, today: TODAY, closeToday: true, groups: GROUPS })
    expect(JSON.stringify(message)).not.toContain('가짜 묶음 이름')
    fake.reply({ type: 'loaded', streamId: request.id as string, view: VIEW })
  })

  it('AC-1205.7 비트 요청이 끝난 뒤 묶음 읽기가 거절되면 groups: []로 불러오기가 이어진다', async () => {
    const { fake, view, port } = drawReady()
    const groups = deferred<readonly RxGroupDef[]>()
    let answer: StatsLoaded | null = null
    act(() => {
      void view.result.current
        .load({ range: RANGE, today: TODAY, closeToday: false, groups: groups.promise })
        .then((loaded) => (answer = loaded))
    })
    const request = port.last()
    act(() => port.reply(end(request.id)))
    await settle()

    groups.reject(new Error('가짜 내용'))
    await waitFor(() => expect(loads(fake.sent)).toHaveLength(1))
    expect(fake.sent.at(-1)).toEqual({ type: 'load', streamId: request.id, from: RANGE.from, to: RANGE.to, today: TODAY, closeToday: false, groups: [] })
    expect(JSON.stringify(fake.sent)).not.toContain('가짜 내용')

    fake.reply({ type: 'loaded', streamId: request.id as string, view: VIEW })
    await waitFor(() => expect(answer).toEqual(VIEW))
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('AC-1205.7 비트 요청이 끝나기 전에 묶음 읽기가 거절돼도 처리되지 않은 거절이 남지 않고, 비트 요청이 끝나면 groups: []로 간다', async () => {
    const { fake, view, port } = drawReady()
    const groups = deferred<readonly RxGroupDef[]>()
    act(() => {
      void view.result.current.load({ range: RANGE, today: TODAY, closeToday: false, groups: groups.promise }).catch(() => undefined)
    })
    const request = port.last()
    expect(request.cmd).toBe('stats.rows')

    groups.reject(new Error('가짜 내용'))
    await settle()
    expect(unhandled).not.toHaveBeenCalled()
    expect(loads(fake.sent)).toEqual([])

    act(() => port.reply(end(request.id)))
    await waitFor(() => expect(loads(fake.sent)).toHaveLength(1))
    expect(fake.sent.at(-1)).toMatchObject({ type: 'load', streamId: request.id, groups: [] })
    fake.reply({ type: 'loaded', streamId: request.id as string, view: VIEW })
  })

  it('AC-1205.7 비트 요청이 오류로 끝나면 묶음을 기다리지 않고 그 오류 번호로 끝나며, 묶음 거절도 남지 않는다', async () => {
    const { fake, view, port } = drawReady()
    const groups = deferred<readonly RxGroupDef[]>()
    let failure: unknown = null
    act(() => {
      void view.result.current
        .load({ range: RANGE, today: TODAY, closeToday: false, groups: groups.promise })
        .catch((e: unknown) => (failure = e))
    })
    act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code: 'E-STATS-TOO-BIG' }))
    await waitFor(() => expect(failure).not.toBeNull())
    expect(errorCodeOf(failure)).toBe('E-STATS-TOO-BIG')

    groups.reject(new Error('가짜 내용'))
    await settle()
    expect(unhandled).not.toHaveBeenCalled()
    expect(loads(fake.sent)).toEqual([])
  })
})

describe('AC-514.12 답 없이 멈춘 불러오기', () => {
  const LIMIT_MS = 1_200_000
  const CHART = '가짜-차트번호-0001'

  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })

  async function drawReadyWithClock() {
    const drawn = drawReady()
    await advance(0)
    expect(drawn.view.result.current.state).toBe('ready')
    return drawn
  }

  function startLoad(view: ReturnType<typeof drawReady>['view']) {
    const outcome: { answer: StatsLoaded | null; failure: unknown } = { answer: null, failure: null }
    act(() => {
      void view.result.current.load({ range: RANGE, today: TODAY, closeToday: false }).then(
        (loaded) => {
          outcome.answer = loaded
        },
        (error: unknown) => {
          outcome.failure = error
        },
      )
    })
    return outcome
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-514.12 1,199,999ms까지는 포트가 열려 있고 load가 끝나지 않는다. 1,200,000ms에 포트가 닫히고 load가 E-BRIDGE-DISCONNECTED로 거절되며 상태가 disconnected다', async () => {
    const { view, port } = await drawReadyWithClock()
    const outcome = startLoad(view)

    await advance(LIMIT_MS - 1)
    expect(port.disconnected).toBe(false)
    expect(outcome.answer).toBeNull()
    expect(outcome.failure).toBeNull()
    expect(view.result.current.state).toBe('ready')

    await advance(1)
    expect(port.disconnected).toBe(true)
    expect(outcome.answer).toBeNull()
    expect(errorCodeOf(outcome.failure)).toBe('E-BRIDGE-DISCONNECTED')
    expect(view.result.current.state).toBe('disconnected')
  })

  it('AC-514.12 조각이 와도 시계는 stream을 부른 때부터다', async () => {
    const { view, port } = await drawReadyWithClock()
    startLoad(view)
    const request = port.last()
    await advance(LIMIT_MS - 1)
    act(() => port.reply({ v: 1, id: request.id, type: 'chunk', seq: 0, data: CHART }))
    await advance(1)
    expect(port.disconnected).toBe(true)
  })

  it('AC-514.12 닫으면 Worker 포트에 abort가 가서 모으던 조각을 버린다', async () => {
    const { fake, view, port } = await drawReadyWithClock()
    const workerPort = fake.transfers[0]![0] as MessagePort
    const atWorker: unknown[] = []
    workerPort.onmessage = (event) => atWorker.push(event.data)
    startLoad(view)
    const request = port.last()

    await advance(LIMIT_MS)
    vi.useRealTimers()
    await waitFor(() => expect(atWorker).toContainEqual({ type: 'abort', id: request.id, code: 'E-BRIDGE-DISCONNECTED' }))
    workerPort.close()
  })

  it('AC-514.12 그 뒤 옛 포트로 chunk·end가 와도 Worker에 load 일이 가지 않는다', async () => {
    const { fake, view, port } = await drawReadyWithClock()
    const outcome = startLoad(view)
    const request = port.last()
    await advance(LIMIT_MS)
    expect(port.disconnected).toBe(true)

    act(() => {
      port.reply({ v: 1, id: request.id, type: 'chunk', seq: 0, data: CHART })
      port.reply({ v: 1, id: request.id, type: 'end', count: 1, bytes: 0, sha256: SHA })
    })
    await advance(0)

    expect(fake.sent.some((message) => message.type === 'load')).toBe(false)
    expect(outcome.answer).toBeNull()
    expect(errorCodeOf(outcome.failure)).toBe('E-BRIDGE-DISCONNECTED')
  })

  it('AC-514.12 한도 전에 end가 오면 시계가 멈춰 1,200,000ms가 지나도 포트가 닫히지 않는다', async () => {
    const { fake, view, port } = await drawReadyWithClock()
    const outcome = startLoad(view)
    const request = port.last()
    expect(vi.getTimerCount()).toBe(1)
    await advance(LIMIT_MS - 1)

    act(() => port.reply({ v: 1, id: request.id, type: 'end', count: 0, bytes: 0, sha256: SHA }))
    await advance(0)
    expect(fake.sent.at(-1)).toMatchObject({ type: 'load', streamId: request.id })
    fake.reply({ type: 'loaded', streamId: request.id as string, view: VIEW })
    await advance(0)
    expect(outcome.answer).toEqual(VIEW)
    expect(vi.getTimerCount()).toBe(0)

    await advance(LIMIT_MS)
    expect(port.disconnected).toBe(false)
    expect(view.result.current.state).toBe('ready')
  })

  it('AC-514.12 한도 전에 요청이 오류로 끝나면 시계가 멈춰, 다음 불러오기가 앞 시계에 닫히지 않는다', async () => {
    const { view, port } = await drawReadyWithClock()
    const first = startLoad(view)
    expect(vi.getTimerCount()).toBe(1)
    await advance(600_000)
    act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code: 'E-STATS-TOO-BIG' }))
    await advance(0)
    expect(errorCodeOf(first.failure)).toBe('E-STATS-TOO-BIG')
    expect(vi.getTimerCount()).toBe(0)

    startLoad(view)
    await advance(600_000) // 앞 시계가 남았다면 여기서 닫힌다
    expect(port.disconnected).toBe(false)
    await advance(599_999)
    expect(port.disconnected).toBe(false)
    await advance(1) // 다음 불러오기의 20분
    expect(port.disconnected).toBe(true)
  })

  it('AC-514.12 화면을 떠나면 20분 시계가 남지 않는다', async () => {
    const { view } = await drawReadyWithClock()
    startLoad(view)
    expect(vi.getTimerCount()).toBe(1)

    view.unmount()
    await advance(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-514.12 [다시 확인] → 포트가 하나 더 생기고 Worker는 그대로 하나다', async () => {
    const { chrome, fake, view, port } = await drawReadyWithClock()
    startLoad(view)
    await advance(LIMIT_MS)
    expect(view.result.current.state).toBe('disconnected')

    act(() => view.result.current.retry())

    expect(chrome.ports).toHaveLength(2)
    const second = chrome.port()
    expect(second).not.toBe(port)
    expect(createStatsWorker).toHaveBeenCalledTimes(1)
    expect(fake.worker.terminate).not.toHaveBeenCalled()
    expect(fake.sent.filter((message) => message.type === 'bridge-port')).toHaveLength(2)

    act(() => second.reply({ v: 1, id: second.last().id, type: 'result', data: HELLO }))
    await advance(0)
    expect(view.result.current.state).toBe('ready')
  })

  it('AC-514.12 한도로 닫힌 뒤 [다시 확인]하고 다시 불러오면 새 시계다', async () => {
    const { chrome, view, port } = await drawReadyWithClock()
    startLoad(view)
    await advance(LIMIT_MS)
    expect(port.disconnected).toBe(true)

    act(() => view.result.current.retry())
    const second = chrome.port()
    expect(second).not.toBe(port)
    act(() => second.reply({ v: 1, id: second.last().id, type: 'result', data: HELLO }))
    await advance(0)
    expect(view.result.current.state).toBe('ready')
    expect(vi.getTimerCount()).toBe(0) // 앞 시계가 남아 있지 않다

    const outcome = startLoad(view)
    expect(second.last().cmd).toBe('stats.rows')
    await advance(LIMIT_MS - 1)
    expect(second.disconnected).toBe(false)
    expect(outcome.failure).toBeNull()

    await advance(1)
    expect(second.disconnected).toBe(true)
    expect(errorCodeOf(outcome.failure)).toBe('E-BRIDGE-DISCONNECTED')
    expect(view.result.current.state).toBe('disconnected')
  })
})

describe('오류 번호', () => {
  it('AC-514.3 통로·Worker 오류의 번호를 그대로 쓴다', async () => {
    const { view, port } = drawReady()
    let failure: unknown = null
    act(() => {
      void view.result.current.load({ range: RANGE, today: TODAY, closeToday: false }).catch((e: unknown) => (failure = e))
    })
    act(() => port.reply({ v: 1, id: port.last().id, type: 'error', code: 'E-STATS-TOO-BIG' }))
    await waitFor(() => expect(failure).not.toBeNull())
    expect(errorCodeOf(failure)).toBe('E-STATS-TOO-BIG')
  })

  it('AC-514.3 표에 없는 글자나 다른 예외의 내용은 옮기지 않는다', () => {
    expect(errorCodeOf(new Error('가짜 내용'))).toBe('E-ANALYZE-FAILED')
    expect(errorCodeOf({ code: '가짜 내용' })).toBe('E-ANALYZE-FAILED')
    expect(errorCodeOf(null)).toBe('E-ANALYZE-FAILED')
  })
})

// stats-bit-sections: 고른 기간의 세 칸 보기(환자 구성·시간대별 접수·원장님별)는 Worker 메모리의 접수 줄로 센다
describe('AC-2702.3 세 칸 보기 묻기', () => {
  const PERIOD = { from: '2026-10-14', to: '2026-11-12' }
  const PREVIOUS = { from: '2026-09-14', to: '2026-10-13' }

  it('AC-2702.3 기간 바꿈의 세 칸 보기는 기간과 견줄 기간(from·to)만 Worker로 보내고 받은 보기를 돌려준다', async () => {
    const { fake, view } = drawReady()
    let answer: BitSectionsView | null = null
    const previous = { ...PREVIOUS, name: '지난 30일', why: '지난 30일', label: '가짜' }
    act(() => {
      void view.result.current.sections({ ...PERIOD, previous }).then((result) => (answer = result))
    })
    const message = fake.sent.at(-1)
    expect(message).toMatchObject({ type: 'sections', ...PERIOD, previous: PREVIOUS })
    expect(Object.keys(message!).sort()).toEqual(['from', 'previous', 'streamId', 'to', 'type'])
    fake.reply({ type: 'sections-result', streamId: (message as { streamId: string }).streamId, view: { kind: 'old-helper' } })
    await waitFor(() => expect(answer).toEqual({ kind: 'old-helper' }))
  })

  it('AC-2702.3 견줄 기간 없이 물으면 previous: null이 간다', () => {
    const { fake, view } = drawReady()
    act(() => {
      void view.result.current.sections(PERIOD).catch(() => undefined)
    })
    expect(fake.sent.at(-1)).toMatchObject({ type: 'sections', ...PERIOD, previous: null })
  })

  it('AC-2702.3 불러오기·처방별·세 칸이 통로 포트를 받은 그 Worker 하나를 쓴다', async () => {
    const { fake, view, port } = drawReady()
    act(() => {
      void view.result.current.load({ range: RANGE, today: TODAY, closeToday: false })
    })
    const request = port.last()
    act(() => port.reply({ v: 1, id: request.id, type: 'end', count: 0, bytes: 0, sha256: SHA }))
    await waitFor(() => expect(fake.sent.some((message) => message.type === 'load')).toBe(true))
    fake.reply({ type: 'loaded', streamId: request.id as string, view: VIEW })
    act(() => {
      void view.result.current.split(PERIOD)
      void view.result.current.sections({ ...PERIOD, previous: PREVIOUS })
    })
    expect(fake.sent.map((message) => message.type)).toEqual(['bridge-port', 'load', 'split', 'sections'])
    expect(createStatsWorker).toHaveBeenCalledTimes(1)
  })

  it('AC-2702.3 Worker를 못 만들어도 세 칸 묻기가 오류 번호로 끝난다', async () => {
    const chrome = fakeChrome()
    vi.mocked(createStatsWorker).mockImplementation(() => {
      throw new Error('가짜 내용')
    })
    const view = renderHook(() => useStatsWorker())
    const port = chrome.port()
    act(() => port.reply({ v: 1, id: port.last().id, type: 'result', data: HELLO }))
    await waitFor(() => expect(view.result.current.state).toBe('ready'))
    const failure: unknown = await view.result.current.sections(PERIOD).then(
      () => null,
      (e: unknown) => e,
    )
    expect(errorCodeOf(failure)).toBe('E-ANALYZE-FAILED')
    view.unmount()
  })

  it('AC-2702.3 sections는 다시 그려도 같은 함수다(화면 effect가 기간이 바뀔 때만 다시 묻게)', () => {
    const { view } = drawReady()
    const first = view.result.current.sections
    view.rerender()
    expect(view.result.current.sections).toBe(first)
  })
})
