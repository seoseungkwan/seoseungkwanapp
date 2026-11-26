// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { EXTENSION_ID } from '@/lib/bridge/extensionId'
import { BridgeError } from '@/lib/bridge/protocol'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import { borrowScreenCall, enterBackground } from './bitLane'
import { INPUT_QUIET_MS, useBridge } from './useBridge'

// 화면이 쓰는 통로 훅 (design.md 6-1, REQ-006). 진짜 connectScreenBridge·connectBridge에 가짜 chrome.runtime(Port)만 넣는다.
// "새 도우미가 있어요"를 시험하려고 웹이 아는 최신 도우미만 0.4.0으로 올린다(막는 기준 MIN_HELPER는 그대로 0.3.0)
vi.mock('@/lib/bridge/versions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/bridge/versions')>()
  return { ...real, LATEST_HELPER: '0.4.0', WEB_VERSIONS: { ...real.WEB_VERSIONS, latestHelper: '0.4.0' } }
})

class FakePort implements PortLike {
  sent: Record<string, unknown>[] = []
  disconnected = false
  private messageFns: ((m: unknown) => void)[] = []
  private disconnectFns: (() => void)[] = []
  onMessage = { addListener: (fn: (m: unknown) => void) => void this.messageFns.push(fn) }
  onDisconnect = { addListener: (fn: () => void) => void this.disconnectFns.push(fn) }
  postMessage(m: unknown) {
    if (this.disconnected) throw new Error('Attempting to use a disconnected port object')
    this.sent.push(m as Record<string, unknown>)
  }
  disconnect() {
    this.disconnected = true
  }
  reply(m: unknown) {
    for (const fn of this.messageFns) fn(m)
  }
  last() {
    return this.sent[this.sent.length - 1]
  }
  fireDisconnect() {
    this.disconnected = true
    for (const fn of this.disconnectFns) fn()
  }
}

function fakeChrome() {
  const ports: FakePort[] = []
  const ids: string[] = []
  const runtime: ChromeRuntimeLike = {
    connect(id: string) {
      ids.push(id)
      const port = new FakePort()
      ports.push(port)
      return port
    },
  }
  vi.stubGlobal('chrome', { runtime })
  return { ports, ids, port: () => ports[ports.length - 1] }
}

const HELLO = { helperVersion: '0.4.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }

/** 마지막으로 보낸 요청에 답한다(확장이 도우미 답을 그대로 넘긴 것처럼) */
function answer(port: FakePort, reply: Record<string, unknown>) {
  const id = port.last().id as string
  act(() => port.reply({ v: 1, id, ...reply }))
}
const helloOk = (port: FakePort, data: Record<string, unknown> = HELLO) => answer(port, { type: 'result', data })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useBridge', () => {
  it('AC-006.1: chrome.runtime이 없으면(확장 없는 브라우저·휴대폰) no-extension이고 아무 데도 붙지 않는다', async () => {
    vi.stubGlobal('chrome', undefined)
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(result.current.hello?.state).toBe('no-extension'))
    expect(result.current.state).toBe('no-extension')
    expect(result.current.helperUpdateAvailable).toBe(false)
  })

  it('AC-006.2: 정해 둔 확장 ID로 붙고 hello로 버전을 맞추면 ready(버전 칸과 함께)', async () => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    expect(result.current.state).toBe('connecting')
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    expect(fake.ids).toEqual([EXTENSION_ID])
    expect(fake.port().last()).toMatchObject({ v: 1, cmd: 'hello', args: {} })
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.hello).toEqual({
      state: 'ready',
      helperVersion: '0.4.0',
      extensionVersion: '0.1.0',
      helperUpdateAvailable: false,
    })
    expect(result.current.helperUpdateAvailable).toBe(false)
  })

  it('AC-006.3: 도우미가 웹이 아는 최신보다 낮으면(막을 만큼은 아님) ready이고 helperUpdateAvailable', async () => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    helloOk(fake.port(), { ...HELLO, helperVersion: '0.3.0' })
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.helperUpdateAvailable).toBe(true)
  })

  it.each([
    ['도우미 없음(E-HELPER-MISSING)', { type: 'error', code: 'E-HELPER-MISSING' }, 'no-helper'],
    ['도우미가 막을 만큼 낮음', { type: 'result', data: { ...HELLO, helperVersion: '0.0.9' } }, 'update-helper'],
    ['확장이 막을 만큼 낮음', { type: 'result', data: { ...HELLO, extensionVersion: '0.0.9' } }, 'update-extension'],
  ] as const)('AC-006.1: %s → %s', async (_name, reply, state) => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    answer(fake.port(), reply)
    await waitFor(() => expect(result.current.state).toBe(state))
  })

  it.each([
    ['모르는 칸이 붙은 hello 답', { type: 'result', data: { ...HELLO, extra: 'x' } }, 'E-BRIDGE-BAD-REPLY'],
    ['E-HELPER-MISSING 말고 다른 오류 답', { type: 'error', code: 'E-HELPER-BAD-MESSAGE' }, 'E-HELPER-BAD-MESSAGE'],
  ] as const)('AC-006.1·AC-006.6: hello가 상태를 바꾸지 않고 거절되면(%s) helloError에 그 번호, retry()는 새로 붙는다', async (_n, reply, code) => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    answer(fake.port(), reply)
    await waitFor(() => expect(result.current.helloError).toBe(code))
    expect(result.current.state).toBe('connecting')
    expect(result.current.hello).toBeNull()

    act(() => result.current.retry())
    await waitFor(() => expect(fake.ports).toHaveLength(2))
    expect(result.current.helloError).toBeNull()
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.helloError).toBeNull()
  })

  it('AC-006.1: 다른 창이 쓰는 중이면(확장이 E-BRIDGE-BUSY 후 끊음) busy', async () => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    act(() => {
      fake.port().reply({ v: 1, id: '', type: 'error', code: 'E-BRIDGE-BUSY' })
      fake.port().fireDisconnect()
    })
    await waitFor(() => expect(result.current.state).toBe('busy'))
  })

  it('AC-006.2: call(bit.check)은 Port로 보내고 모양을 검사한 답을 돌려준다', async () => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    let reply: Promise<unknown> = Promise.resolve()
    act(() => {
      reply = result.current.call('bit.check', {})
    })
    expect(fake.port().last()).toMatchObject({ cmd: 'bit.check', args: {} })
    const data = {
      steps: [
        { name: 'find', ok: true },
        { name: 'db', ok: true },
        { name: 'registration', ok: true },
      ],
      registered: true,
      institutionCode: '12345678',
    }
    answer(fake.port(), { type: 'result', data })
    await expect(reply).resolves.toEqual(data)
  })

  it('AC-006.2: 끊긴 뒤 retry()는 새 연결을 열어 hello부터 다시 한다(끊긴 통로의 hello는 E-BRIDGE-DISCONNECTED로 거절되므로)', async () => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    const first = fake.port()
    act(() => first.fireDisconnect())
    await waitFor(() => expect(result.current.state).toBe('disconnected'))

    act(() => result.current.retry())
    await waitFor(() => expect(fake.ports).toHaveLength(2))
    const second = fake.port()
    expect(second).not.toBe(first)
    await waitFor(() => expect(second.sent).toHaveLength(1))
    expect(second.last()).toMatchObject({ cmd: 'hello' })
    helloOk(second)
    await waitFor(() => expect(result.current.state).toBe('ready'))
  })

  it('AC-006.2: 붙어 있는(ready) 동안 retry()는 같은 연결로 hello를 다시 보내고(확장이 다른 창으로 보지 않게) 새 hello 답을 준다', async () => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    const before = result.current.hello

    act(() => result.current.retry())
    // 다시 확인하는 동안은 연결 중으로 보인다(단추를 막을 수 있게)
    expect(result.current.state).toBe('connecting')
    expect(fake.ports).toHaveLength(1)
    expect(fake.port().sent).toHaveLength(2)
    expect(fake.port().last()).toMatchObject({ cmd: 'hello' })
    helloOk(fake.port(), { ...HELLO, helperVersion: '0.3.0' })
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.hello).not.toBe(before)
    expect(result.current.helperUpdateAvailable).toBe(true)
  })

  it('AC-006.2: 화면을 떠나면(unmount) 연결을 닫는다(창 하나 규칙 때문에 남기지 않는다)', async () => {
    const fake = fakeChrome()
    const { unmount } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    unmount()
    expect(fake.port().disconnected).toBe(true)
  })

  it('AC-006.2: worker를 넘기면 통로 포트를 Worker에 한 번 넘긴다(없으면 조각은 울타리 안에서 버린다)', async () => {
    fakeChrome()
    const worker = { postMessage: vi.fn() }
    renderHook(() => useBridge({ worker }))
    await waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1))
    const [message, transfer] = worker.postMessage.mock.calls[0]
    expect(message).toEqual({ type: 'bridge-port' })
    expect(transfer).toHaveLength(1)
    expect(transfer[0]).toBeInstanceOf(MessagePort)
  })

  it('AC-006.2: ready 전에 부른 명령은 상태 번호로 거절된다(BridgeError 번호만)', async () => {
    vi.stubGlobal('chrome', undefined)
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(result.current.state).toBe('no-extension'))
    const error = await result.current.call('bit.check', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BridgeError)
    expect((error as BridgeError).code).toBe('E-EXT-MISSING')
  })

  it('AC-514.12: close를 부르면 기다리던 요청이 E-BRIDGE-DISCONNECTED로 끝나고 상태가 disconnected다', async () => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    let waiting: Promise<unknown> = Promise.resolve()
    act(() => {
      waiting = result.current.stream('stats.rows', { from: '2026-09-01', to: '2026-11-13' }).catch((e: unknown) => e)
    })
    expect(fake.port().disconnected).toBe(false)

    act(() => result.current.close())

    const error = await waiting
    expect(error).toBeInstanceOf(BridgeError)
    expect((error as BridgeError).code).toBe('E-BRIDGE-DISCONNECTED')
    expect(fake.port().disconnected).toBe(true)
    await waitFor(() => expect(result.current.state).toBe('disconnected'))
  })
})

// ── admin-view: 보는 중에는 이 PC 비트에 붙지 않는다(AC-8008.4) · 비트 통로 차례(AC-8021.8) ──
// 보는 의원은 지어낸 값이다. 통로 차례는 앱이 쓰는 bitLane 모듈 하나(useBridge와 같은 차례)를 시험이 저절로 올리기처럼 잡는다 — 시험마다 놓는다
const VIEWING: Viewing = { hospitalId: '00000000-0000-4000-8000-0000000000d2', name: '가짜다라의원' }
const inView = (viewing: Viewing | null) =>
  function Wrapper({ children }: { children: ReactNode }) {
    // 이 파일은 .ts라 JSX가 없다. ViewingProvider는 훅 없이 Provider 요소만 돌려주는 함수라 그대로 부른다
    return ViewingProvider({ viewing, children })
  }

/** chrome.runtime을 읽은 횟수를 센다(보는 중에는 건드리지도 않는다) */
function countedChrome() {
  const fake = fakeChrome()
  let touched = 0
  const runtime = (globalThis as unknown as { chrome: { runtime: ChromeRuntimeLike } }).chrome.runtime
  vi.stubGlobal('chrome', {
    get runtime() {
      touched += 1
      return runtime
    },
  })
  return { ...fake, touched: () => touched }
}

describe('useBridge: 보는 중 (admin-view AC-8008.4)', () => {
  it('AC-8008.4: 보는 중이면 chrome.runtime을 건드리지 않고 상태는 no-extension, call·stream은 보내지 않고 실패한다', async () => {
    const fake = countedChrome()
    const worker = { postMessage: vi.fn() }
    const { result } = renderHook(() => useBridge({ worker }), { wrapper: inView(VIEWING) })
    expect(result.current.state).toBe('no-extension')
    expect(result.current.hello).toEqual({ state: 'no-extension', helperUpdateAvailable: false })
    expect(result.current.helloError).toBeNull()
    expect(result.current.helperUpdateAvailable).toBe(false)
    const call = await result.current.call('bit.check', {}).catch((e: unknown) => e)
    const stream = await result.current.stream('stats.rows', { from: '2026-09-01', to: '2026-11-13' }).catch((e: unknown) => e)
    expect(call).toBeInstanceOf(BridgeError)
    expect(stream).toBeInstanceOf(BridgeError)
    act(() => result.current.retry())
    act(() => result.current.close())
    await act(async () => {})
    expect(fake.touched()).toBe(0)
    expect(fake.ports).toHaveLength(0)
    expect(worker.postMessage).not.toHaveBeenCalled() // Worker에 통로 포트도 넘기지 않는다
    expect(result.current.state).toBe('no-extension')
  })

  it('AC-8008.4: 보는 중 화면은 통로 차례에 들지 않는다(저절로 올리기를 막지도 끊지도 않는다)', () => {
    countedChrome()
    const stop = vi.fn()
    renderHook(() => useBridge(), { wrapper: inView(VIEWING) })
    const release = enterBackground(stop)
    expect(release).toEqual(expect.any(Function))
    expect(stop).not.toHaveBeenCalled()
    release!()
  })

  it('AC-8008.4: viewing={null}이면 지금과 같다(정해 둔 확장 ID로 붙고 hello로 ready)', async () => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge(), { wrapper: inView(null) })
    expect(result.current.state).toBe('connecting')
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    expect(fake.ids).toEqual([EXTENSION_ID])
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
  })
})

describe('useBridge: 비트 통로 차례 (admin-view AC-8021.8)', () => {
  it('AC-8021.8: 쥔 쪽이 없으면 지금처럼 바로 붙고, 붙어 있는 동안 저절로 올리기는 통로를 잡지 못하며, 떠나면 잡을 수 있다', async () => {
    const fake = fakeChrome()
    const { unmount } = renderHook(() => useBridge())
    expect(fake.ports).toHaveLength(1)
    expect(enterBackground(vi.fn())).toBeNull()
    unmount()
    const release = enterBackground(vi.fn())
    expect(release).toEqual(expect.any(Function))
    release!()
  })

  it('AC-8021.8: 저절로 올리기가 쥐고 있으면 그쪽에 끊기를 알리고(stop 한 번) 놓인 뒤에 붙는다(그동안 connecting)', async () => {
    const fake = fakeChrome()
    const stop = vi.fn()
    const release = enterBackground(stop)!
    const { result, unmount } = renderHook(() => useBridge())
    expect(stop).toHaveBeenCalledTimes(1)
    expect(fake.ports).toHaveLength(0)
    expect(result.current.state).toBe('connecting')

    act(() => release())
    expect(fake.ports).toHaveLength(1)
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    expect(fake.port().last()).toMatchObject({ cmd: 'hello' })
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(stop).toHaveBeenCalledTimes(1)
    unmount()
    expect(fake.port().disconnected).toBe(true)
  })

  it('AC-8021.8: 놓이기 전에 화면을 떠나면 붙지 않고, 차례에서도 빠진다', () => {
    const fake = fakeChrome()
    const release = enterBackground(vi.fn())!
    const { unmount } = renderHook(() => useBridge())
    unmount()
    act(() => release())
    expect(fake.ports).toHaveLength(0)
    const again = enterBackground(vi.fn())
    expect(again).toEqual(expect.any(Function))
    again!()
  })

  it('AC-8021.8: 기다리는 동안 retry()를 눌러도 한 번만 붙는다', async () => {
    const fake = fakeChrome()
    const release = enterBackground(vi.fn())!
    const { result, unmount } = renderHook(() => useBridge())
    act(() => result.current.retry())
    expect(fake.ports).toHaveLength(0)
    act(() => release())
    expect(fake.ports).toHaveLength(1)
    unmount()
  })
})

// ── google-link: 화면 통로 빌려주기(AC-8513.4, design.md 11절) ──
// ready일 때 화면이 쥔 통로의 call을 bitLane에 빌려주고(그 화면이 보내는 중인 요청·스트림이 있으면 busy), 닫거나 ready가 아니게 되면 거둔다.
// 빌린 부르기는 화면의 call·stream을 거치지 않는다(화면 busy로 세지 않음). 수납 명령 답은 도우미 오류 답으로 돌려 본다
describe('useBridge: 화면 통로 빌려주기 (google-link AC-8513.4)', () => {
  const ready = async () => {
    const fake = fakeChrome()
    const hook = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    helloOk(fake.port())
    await waitFor(() => expect(hook.result.current.state).toBe('ready'))
    return { fake, ...hook }
  }

  it('AC-8513.4: ready 전(hello 기다림)에는 빌려주지 않고, ready가 되면 그 화면 hello의 판 글자와 함께 빌려준다', async () => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    expect(borrowScreenCall()).toBeNull()
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(borrowScreenCall()).toMatchObject({ helperVersion: '0.4.0', extensionVersion: '0.1.0' })
  })

  it('AC-8513.4: 빌린 call은 화면이 쥔 같은 Port로 sheet.* 를 보내고 도우미 답(오류 번호)을 그대로 돌려준다', async () => {
    const { fake } = await ready()
    const borrowed = borrowScreenCall()!
    let reply: Promise<unknown> = Promise.resolve()
    act(() => {
      reply = borrowed.call('sheet.status', {}).catch((e: unknown) => e)
    })
    expect(fake.ports).toHaveLength(1)
    expect(fake.port().last()).toMatchObject({ cmd: 'sheet.status', args: {} })
    answer(fake.port(), { type: 'error', code: 'E-GSHEET-SECRET' })
    const error = await reply
    expect(error).toBeInstanceOf(BridgeError)
    expect((error as BridgeError).code).toBe('E-GSHEET-SECRET')
  })

  it('AC-8513.4: 청구 화면 스트림(claim.month)을 기다리는 동안에는 빌리지 않고, 끝나면 다시 빌려준다', async () => {
    const { fake, result } = await ready()
    let streaming: Promise<unknown> = Promise.resolve()
    act(() => {
      streaming = result.current.stream('claim.month', { from: '2026-11-01', to: '2026-11-26' })
    })
    expect(fake.port().last()).toMatchObject({ cmd: 'claim.month' })
    expect(borrowScreenCall()).toBeNull()
    answer(fake.port(), { type: 'end', count: 0, bytes: 0, sha256: '0'.repeat(64) })
    await streaming
    expect(borrowScreenCall()).not.toBeNull()
  })

  it('AC-8513.4: 화면 call(bit.check)을 기다리는 동안 빌린 call은 화면 Port로 보내지 않고 E-BRIDGE-BUSY로 끝난다', async () => {
    const { fake, result } = await ready()
    const borrowed = borrowScreenCall()!
    let checking: Promise<unknown> = Promise.resolve()
    act(() => {
      checking = result.current.call('bit.check', {}).catch((e: unknown) => e)
    })
    const sent = fake.port().sent.length
    const error = await borrowed.call('sheet.fill', { day: '2026-11-26', mode: 'fillEmpty', auto: true, settings: {} }).catch((e: unknown) => e)
    expect((error as { code?: string }).code).toBe('E-BRIDGE-BUSY')
    expect(fake.port().sent).toHaveLength(sent)
    answer(fake.port(), { type: 'error', code: 'E-BIT-NOT-FOUND' })
    await checking
    expect(borrowScreenCall()).not.toBeNull()
  })

  it('AC-8513.4: 빌린 부르기가 기다리는 동안은 화면 busy로 세지 않는다(넣기의 다음 부르기가 막히지 않게)', async () => {
    const { fake } = await ready()
    act(() => {
      void borrowScreenCall()!.call('sheet.status', {}).catch(() => undefined)
    })
    expect(fake.port().last()).toMatchObject({ cmd: 'sheet.status' })
    expect(borrowScreenCall()).not.toBeNull()
  })

  it('AC-8513.4: Worker가 보낸 청구 입력(bit.input) 진행 중에는 빌리지 않고, 다 넣었거나 진행 숫자가 오래 오지 않으면 다시 빌려준다', async () => {
    const fake = fakeChrome()
    const worker = { postMessage: vi.fn() }
    const { result } = renderHook(() => useBridge({ worker }))
    await waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    const workerPort = worker.postMessage.mock.calls[0][1][0] as MessagePort
    // Worker가 통로 포트로 bit.input을 보낸다(글자는 지어낸 빈 묶음)
    workerPort.postMessage({ type: 'send', ticket: 1, cmd: 'bit.input', payload: '{"items":[]}' })
    await waitFor(() => expect(fake.port().last()).toMatchObject({ cmd: 'bit.input' }))
    const id = fake.port().last().id as string
    act(() => fake.port().reply({ v: 1, id, type: 'progress', done: 1, total: 3 }))
    expect(borrowScreenCall()).toBeNull()
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + INPUT_QUIET_MS + 1)
    expect(borrowScreenCall()).not.toBeNull()
    clock.mockReturnValue(now)
    act(() => fake.port().reply({ v: 1, id, type: 'progress', done: 2, total: 3 }))
    expect(borrowScreenCall()).toBeNull()
    act(() => fake.port().reply({ v: 1, id, type: 'progress', done: 3, total: 3 }))
    expect(borrowScreenCall()).not.toBeNull()
    clock.mockRestore()
    workerPort.close()
  })

  it('AC-8513.4: 화면을 닫으면(unmount) 거두고, 이미 빌린 call은 E-BRIDGE-BUSY로 끝난다', async () => {
    const { unmount } = await ready()
    const borrowed = borrowScreenCall()!
    unmount()
    expect(borrowScreenCall()).toBeNull()
    const error = await borrowed.call('sheet.status', {}).catch((e: unknown) => e)
    expect((error as { code?: string }).code).toBe('E-BRIDGE-BUSY')
  })

  it('AC-8513.4: 끊기면(disconnected)·다시 확인(retry) 중에는 거두고, 다시 ready가 되면 빌려준다', async () => {
    const { fake, result } = await ready()
    act(() => result.current.retry())
    expect(borrowScreenCall()).toBeNull()
    helloOk(fake.port())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(borrowScreenCall()).not.toBeNull()
    act(() => fake.port().fireDisconnect())
    await waitFor(() => expect(result.current.state).toBe('disconnected'))
    expect(borrowScreenCall()).toBeNull()
  })

  it('AC-8513.4: 보는 중이면 빌려주지 않는다', async () => {
    countedChrome()
    renderHook(() => useBridge(), { wrapper: inView(VIEWING) })
    await act(async () => {})
    expect(borrowScreenCall()).toBeNull()
  })
})
