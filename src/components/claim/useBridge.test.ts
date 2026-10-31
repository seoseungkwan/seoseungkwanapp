// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXTENSION_ID } from '@/lib/bridge/extensionId'
import { BridgeError } from '@/lib/bridge/protocol'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import { useBridge } from './useBridge'

// 화면이 쓰는 통로 훅 (design.md 6-1, REQ-006). 진짜 connectScreenBridge·connectBridge에 가짜 chrome.runtime(Port)만 넣는다.
// "새 도우미가 있어요"를 시험하려고 웹이 아는 최신 도우미만 0.2.0으로 올린다(막는 기준 MIN_HELPER는 그대로 0.1.0)
vi.mock('@/lib/bridge/versions', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/bridge/versions')>()
  return { ...real, LATEST_HELPER: '0.2.0', WEB_VERSIONS: { ...real.WEB_VERSIONS, latestHelper: '0.2.0' } }
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

const HELLO = { helperVersion: '0.2.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }

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
      helperVersion: '0.2.0',
      extensionVersion: '0.1.0',
      helperUpdateAvailable: false,
    })
    expect(result.current.helperUpdateAvailable).toBe(false)
  })

  it('AC-006.3: 도우미가 웹이 아는 최신보다 낮으면(막을 만큼은 아님) ready이고 helperUpdateAvailable', async () => {
    const fake = fakeChrome()
    const { result } = renderHook(() => useBridge())
    await waitFor(() => expect(fake.port().sent).toHaveLength(1))
    helloOk(fake.port(), { ...HELLO, helperVersion: '0.1.0' })
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
    helloOk(fake.port(), { ...HELLO, helperVersion: '0.1.0' })
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
})
