// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStatsWorker } from '@/workers/statsClient'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import type { RxSplitView, StatsLoaded, StatsWorkerMessage, StatsWorkerRequest } from '@/types/stats'
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
const HELLO = { helperVersion: '0.1.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }
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
    expect(fake.sent.at(-1)).toEqual({ type: 'load', streamId, from: RANGE.from, to: RANGE.to, today: TODAY, closeToday: false })

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
