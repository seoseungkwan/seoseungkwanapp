// 서비스 워커 흐름(TASK-3, REQ-003)을 가짜 chrome으로 시험한다. 자료는 모두 가짜다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import commands from '../../src/lib/bridge/commands.json'
import { startBackground } from './background'
import type { ChromeLike, PortLike } from './chromeLike'

const ORIGIN = commands.origin
const VERSION = '0.1.0'
const P = commands.protocol
const MINUTE = 60 * 1000

/** 크롬 Port 흉내. disconnect()는 크롬처럼 제 onDisconnect를 부르지 않고, 끊긴 포트에 보내면 던진다 */
class FakePort implements PortLike {
  sender?: { origin?: string }
  posted: unknown[] = []
  disconnected = false
  private messageFns: ((m: unknown) => void)[] = []
  private disconnectFns: (() => void)[] = []
  onMessage = { addListener: (fn: (m: unknown) => void) => void this.messageFns.push(fn) }
  onDisconnect = { addListener: (fn: () => void) => void this.disconnectFns.push(fn) }

  constructor(origin?: string) {
    if (origin !== undefined) this.sender = { origin }
  }

  postMessage(m: unknown) {
    if (this.disconnected) throw new Error('Attempting to use a disconnected port object')
    this.posted.push(m)
  }

  disconnect() {
    this.disconnected = true
  }

  /** 건너편이 보낸 메시지. 끊긴 포트에도 전한다: 확장이 거절·닫은 포트의 메시지를 크롬에 기대지 않고 스스로 무시하는지 본다 */
  emit(m: unknown) {
    for (const fn of this.messageFns) fn(m)
  }

  /** 건너편이 끊음 */
  drop() {
    if (this.disconnected) return
    this.disconnected = true
    for (const fn of this.disconnectFns) fn()
  }
}

function setup(options: { connectNativeThrows?: boolean } = {}) {
  const natives: FakePort[] = []
  let onConnect: ((p: PortLike) => void) | undefined
  const runtime = {
    lastError: undefined as { message?: string } | undefined,
    onConnectExternal: { addListener: (fn: (p: PortLike) => void) => void (onConnect = fn) },
    connectNative: vi.fn((host: string) => {
      void host
      if (options.connectNativeThrows) throw new Error('Access to native messaging requires nativeMessaging permission.')
      const port = new FakePort()
      natives.push(port)
      return port
    }),
  }
  const chrome: ChromeLike = { runtime }
  startBackground(chrome, { version: VERSION })

  /** 인자가 없으면 우리 origin. undefined를 주면 sender.origin이 없는 연결 */
  function connectWeb(...args: [] | [string | undefined]) {
    const port = new FakePort(args.length === 0 ? ORIGIN : args[0])
    if (!onConnect) throw new Error('onConnectExternal에 듣는 함수가 없다')
    onConnect(port)
    return port
  }

  /** 도우미를 켜지 못함·도우미가 끝남: 크롬은 onDisconnect 동안 lastError를 채운다 */
  function helperGone(native: FakePort, message = 'Specified native messaging host not found.') {
    runtime.lastError = { message }
    native.drop()
    runtime.lastError = undefined
  }

  return { runtime, natives, connectWeb, helperGone }
}

let seq = 0
function newId() {
  seq += 1
  return `0f8fad5b-d9cb-469f-a165-${String(seq).padStart(12, '0')}`
}

function req(cmd: string, args: Record<string, unknown> = {}) {
  return { v: P, id: newId(), cmd, args }
}

function inputReq() {
  return req('bit.input', { payload: '{"items":[{"visitKey":"가상-01","memo":"가상 메모"}]}' })
}

const busy = { v: P, id: '', type: 'error', code: 'E-BRIDGE-BUSY' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AC-003.2 남의 origin', () => {
  it.each([undefined, 'https://evil.example', 'http://seoseungkwanapp.vercel.app', 'https://other-app.vercel.app'])(
    '%s 에서 온 연결은 바로 끊고 아무것도 보내지 않으며 도우미를 켜지 않는다',
    (origin) => {
      const t = setup()
      const web = t.connectWeb(origin)
      expect(web.disconnected).toBe(true)
      expect(web.posted).toEqual([])
      web.emit(req('hello'))
      expect(t.runtime.connectNative).not.toHaveBeenCalled()
    },
  )

  it('남의 origin 연결은 우리 연결 자리를 차지하지 않는다', () => {
    const t = setup()
    t.connectWeb('https://evil.example')
    const web = t.connectWeb()
    expect(web.disconnected).toBe(false)
    expect(web.posted).toEqual([])
  })
})

describe('AC-003.3 우리 origin의 메시지 검사', () => {
  it('연결만으로는 도우미를 켜지 않고, 첫 정상 메시지 때 hostName으로 한 번만 켠다', () => {
    const t = setup()
    const web = t.connectWeb()
    expect(t.runtime.connectNative).not.toHaveBeenCalled()
    const first = req('hello')
    const second = req('bit.check')
    web.emit(first)
    web.emit(second)
    expect(t.runtime.connectNative).toHaveBeenCalledTimes(1)
    expect(t.runtime.connectNative).toHaveBeenCalledWith(commands.hostName)
    // 그대로(같은 객체) 넘긴다
    expect(t.natives[0].posted).toHaveLength(2)
    expect(t.natives[0].posted[0]).toBe(first)
    expect(t.natives[0].posted[1]).toBe(second)
  })

  it('명령 표에 없는 cmd는 E-BRIDGE-REJECTED로 답하고 넘기지 않는다(도우미도 켜지 않는다)', () => {
    const t = setup()
    const web = t.connectWeb()
    const bad = req('bit.delete')
    web.emit(bad)
    expect(web.posted).toEqual([{ v: P, id: bad.id, type: 'error', code: 'E-BRIDGE-REJECTED' }])
    expect(t.runtime.connectNative).not.toHaveBeenCalled()
  })

  it('봉투 모양이 틀린 메시지는 도우미가 켜진 뒤에도 넘기지 않는다', () => {
    const t = setup()
    const web = t.connectWeb()
    web.emit(req('hello'))
    const bad = { ...req('hello'), extra: true }
    web.emit(bad)
    web.emit('{"v":1}')
    expect(t.natives[0].posted).toHaveLength(1)
    expect(web.posted).toEqual([
      { v: P, id: bad.id, type: 'error', code: 'E-BRIDGE-REJECTED' },
      { v: P, id: '', type: 'error', code: 'E-BRIDGE-REJECTED' },
    ])
  })
})

describe('AC-003.4 도우미 답은 그대로 그 웹 연결에', () => {
  it('조각·진행·끝 답을 고치거나 모으지 않고 온 순서대로 같은 객체로 넘긴다', () => {
    const t = setup()
    const web = t.connectWeb()
    const month = req('claim.month', { from: '2026-10-01', to: '2026-10-31' })
    web.emit(month)
    const replies = [
      { v: P, id: month.id, type: 'chunk', seq: 0, data: '{"rows":[{"name":"가상환자01"' },
      { v: P, id: month.id, type: 'chunk', seq: 1, data: '}]}' },
      { v: P, id: month.id, type: 'end', count: 2, bytes: 31, sha256: '0'.repeat(64) },
    ]
    const copies = structuredClone(replies)
    for (const r of replies) t.natives[0].emit(r)
    expect(web.posted).toHaveLength(3)
    replies.forEach((r, i) => expect(web.posted[i]).toBe(r))
    expect(replies).toEqual(copies)
  })

  it('hello가 아닌 result, 기다리지 않던 id의 답도 그대로 넘긴다', () => {
    const t = setup()
    const web = t.connectWeb()
    const check = req('bit.check')
    web.emit(check)
    const result = { v: P, id: check.id, type: 'result', data: { steps: [], registered: false } }
    const stray = { v: P, id: '', type: 'error', code: 'E-HELPER-BAD-MESSAGE' }
    t.natives[0].emit(result)
    t.natives[0].emit(stray)
    expect(web.posted[0]).toBe(result)
    expect(web.posted[1]).toBe(stray)
  })
})

describe('AC-003.5 웹 연결은 하나', () => {
  it('두 번째 연결은 E-BRIDGE-BUSY로 답하고 끊는다. 첫 연결은 그대로 쓴다', () => {
    const t = setup()
    const first = t.connectWeb()
    const second = t.connectWeb()
    expect(second.posted).toEqual([busy])
    expect(second.disconnected).toBe(true)
    expect(first.disconnected).toBe(false)

    const hello = req('hello')
    first.emit(hello)
    expect(t.natives[0].posted).toEqual([hello])
    second.emit(req('hello'))
    expect(t.natives[0].posted).toEqual([hello])
  })

  it('첫 연결이 끊기면 다시 받는다', () => {
    const t = setup()
    const first = t.connectWeb()
    t.connectWeb()
    first.drop()
    const third = t.connectWeb()
    expect(third.disconnected).toBe(false)
    expect(third.posted).toEqual([])
    third.emit(req('hello'))
    expect(t.runtime.connectNative).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['답을 받기 전', false],
    ['답을 받은 뒤', true],
  ])('도우미를 켠 첫 연결이 hello %s 끊겨도 다시 받고, 새 연결은 도우미를 새로 켠다', (_name, answered) => {
    const t = setup()
    const first = t.connectWeb()
    const firstHello = req('hello')
    first.emit(firstHello)
    expect(t.natives).toHaveLength(1)
    if (answered) {
      t.natives[0].emit({ v: P, id: firstHello.id, type: 'result', data: { helperVersion: '0.1.0', protocol: P } })
    }
    first.drop()
    expect(t.natives[0].disconnected).toBe(true)

    const next = t.connectWeb()
    expect(next.disconnected).toBe(false)
    expect(next.posted).toEqual([])
    const hello = req('hello')
    next.emit(hello)
    expect(t.runtime.connectNative).toHaveBeenCalledTimes(2)
    expect(t.natives[1].posted).toEqual([hello])
  })
})

describe('AC-003.6 hello · 도우미 없음', () => {
  it('hello result에 확장 버전(manifest.version)과 확장 protocol을 붙여 돌려준다', () => {
    const t = setup()
    const web = t.connectWeb()
    const hello = req('hello')
    web.emit(hello)
    t.natives[0].emit({ v: P, id: hello.id, type: 'result', data: { helperVersion: '0.1.0', protocol: P } })
    expect(web.posted).toEqual([
      {
        v: P,
        id: hello.id,
        type: 'result',
        data: { helperVersion: '0.1.0', protocol: P, extensionVersion: VERSION, extensionProtocol: P },
      },
    ])
  })

  it('hello가 아닌 명령의 result에는 붙이지 않는다', () => {
    const t = setup()
    const web = t.connectWeb()
    const dates = req('claim.dates', { from: '2026-10-01', to: '2026-10-31' })
    web.emit(dates)
    const reply = { v: P, id: dates.id, type: 'result', data: { days: [] } }
    t.natives[0].emit(reply)
    expect(web.posted).toEqual([{ v: P, id: dates.id, type: 'result', data: { days: [] } }])
  })

  it('도우미를 켜지 못하면(connectNative 끊김 + lastError) 기다리던 요청마다 E-HELPER-MISSING', () => {
    const t = setup()
    const web = t.connectWeb()
    const hello = req('hello')
    const check = req('bit.check')
    web.emit(hello)
    web.emit(check)
    t.helperGone(t.natives[0])
    expect(web.posted).toEqual([
      { v: P, id: hello.id, type: 'error', code: 'E-HELPER-MISSING' },
      { v: P, id: check.id, type: 'error', code: 'E-HELPER-MISSING' },
    ])
    expect(web.disconnected).toBe(false)
  })

  it('끝난 요청에는 E-HELPER-MISSING을 다시 보내지 않는다', () => {
    const t = setup()
    const web = t.connectWeb()
    const hello = req('hello')
    web.emit(hello)
    t.natives[0].emit({ v: P, id: hello.id, type: 'result', data: { helperVersion: '0.1.0', protocol: P } })
    t.helperGone(t.natives[0], 'Native host has exited.')
    expect(web.posted).toHaveLength(1)
  })

  it('도우미가 끊긴 뒤 다음 메시지는 도우미를 새로 켠다(설치 뒤 다시 확인)', () => {
    const t = setup()
    const web = t.connectWeb()
    web.emit(req('hello'))
    t.helperGone(t.natives[0])
    const again = req('hello')
    web.emit(again)
    expect(t.runtime.connectNative).toHaveBeenCalledTimes(2)
    expect(t.natives[1].posted).toEqual([again])
  })

  it('connectNative가 던지면 그 요청은 E-HELPER-MISSING', () => {
    const t = setup({ connectNativeThrows: true })
    const web = t.connectWeb()
    const hello = req('hello')
    web.emit(hello)
    expect(web.posted).toEqual([{ v: P, id: hello.id, type: 'error', code: 'E-HELPER-MISSING' }])
  })
})

describe('AC-003.7 웹 연결이 끊길 때', () => {
  it('bit.input 진행 중이면 도우미 연결을 그 요청의 end가 올 때까지 두었다가 닫는다', () => {
    const t = setup()
    const web = t.connectWeb()
    const input = inputReq()
    web.emit(input)
    const native = t.natives[0]
    native.emit({ v: P, id: input.id, type: 'progress', done: 1, total: 3 })
    web.drop()
    expect(native.disconnected).toBe(false)

    // 웹이 없는 동안 온 답은 아무 데도 보내지 않는다(끊긴 포트에 보내면 가짜 포트가 던진다)
    native.emit({ v: P, id: input.id, type: 'progress', done: 2, total: 3 })
    native.emit({ v: P, id: input.id, type: 'chunk', seq: 0, data: '[]' })
    vi.advanceTimersByTime(29 * MINUTE)
    expect(native.disconnected).toBe(false)
    native.emit({ v: P, id: input.id, type: 'end', count: 1, bytes: 2, sha256: '0'.repeat(64) })
    expect(native.disconnected).toBe(true)
    expect(web.posted).toHaveLength(1)
  })

  it('bit.input 진행 중이면 error가 와도 닫는다', () => {
    const t = setup()
    const web = t.connectWeb()
    const input = inputReq()
    web.emit(input)
    web.drop()
    expect(t.natives[0].disconnected).toBe(false)
    t.natives[0].emit({ v: P, id: input.id, type: 'error', code: 'E-INPUT-STOPPED' })
    expect(t.natives[0].disconnected).toBe(true)
  })

  it('bit.input의 end·error가 오지 않아도 30분이 지나면 닫는다', () => {
    const t = setup()
    const web = t.connectWeb()
    web.emit(inputReq())
    web.drop()
    vi.advanceTimersByTime(30 * MINUTE - 1)
    expect(t.natives[0].disconnected).toBe(false)
    vi.advanceTimersByTime(1)
    expect(t.natives[0].disconnected).toBe(true)
  })

  it('다른 요청의 끝은 붙잡은 연결을 닫지 않는다', () => {
    const t = setup()
    const web = t.connectWeb()
    const input = inputReq()
    const check = req('bit.check')
    web.emit(input)
    web.emit(check)
    web.drop()
    t.natives[0].emit({ v: P, id: check.id, type: 'result', data: { steps: [], registered: true } })
    expect(t.natives[0].disconnected).toBe(false)
  })

  it.each([
    ['hello', () => req('hello')],
    ['claim.month', () => req('claim.month', { from: '2026-10-01', to: '2026-10-31' })],
    ['store.save', () => req('store.save', { payload: '{}' })],
  ])('그 밖의 명령(%s) 중에 끊기면 도우미 연결도 바로 닫는다', (_name, make) => {
    const t = setup()
    const web = t.connectWeb()
    web.emit(make())
    web.drop()
    expect(t.natives[0].disconnected).toBe(true)
  })

  it('bit.input이 이미 끝났으면 바로 닫는다', () => {
    const t = setup()
    const web = t.connectWeb()
    const input = inputReq()
    web.emit(input)
    t.natives[0].emit({ v: P, id: input.id, type: 'end', count: 0, bytes: 2, sha256: '0'.repeat(64) })
    web.drop()
    expect(t.natives[0].disconnected).toBe(true)
  })

  it('도우미를 켜기 전에 끊기면 아무것도 켜지 않는다', () => {
    const t = setup()
    t.connectWeb().drop()
    expect(t.runtime.connectNative).not.toHaveBeenCalled()
  })
})

describe('AC-003.9 bit.input을 붙잡은 동안 새 웹 연결', () => {
  function holding() {
    const t = setup()
    const web = t.connectWeb()
    const input = inputReq()
    web.emit(input)
    web.drop()
    return { ...t, input, native: t.natives[0] }
  }

  it('E-BRIDGE-BUSY로 답하고 끊는다. 새 도우미를 켜지 않고 붙잡은 연결에도 넘기지 않는다', () => {
    const t = holding()
    const next = t.connectWeb()
    expect(next.posted).toEqual([busy])
    expect(next.disconnected).toBe(true)
    next.emit(req('hello'))
    expect(t.runtime.connectNative).toHaveBeenCalledTimes(1)
    expect(t.native.posted).toEqual([t.input])
    expect(t.native.disconnected).toBe(false)
  })

  it('end로 붙잡은 연결을 닫은 뒤에는 다시 받고, 도우미를 새로 켠다', () => {
    const t = holding()
    t.connectWeb()
    t.native.emit({ v: P, id: t.input.id, type: 'end', count: 1, bytes: 2, sha256: '0'.repeat(64) })
    const next = t.connectWeb()
    expect(next.disconnected).toBe(false)
    expect(next.posted).toEqual([])
    const hello = req('hello')
    next.emit(hello)
    expect(t.runtime.connectNative).toHaveBeenCalledTimes(2)
    expect(t.natives[1].posted).toEqual([hello])
    expect(t.native.posted).toEqual([t.input])
  })

  it('30분이 지나 닫은 뒤에도 다시 받는다', () => {
    const t = holding()
    vi.advanceTimersByTime(30 * MINUTE)
    const next = t.connectWeb()
    expect(next.disconnected).toBe(false)
    expect(next.posted).toEqual([])
  })

  it('붙잡은 도우미가 스스로 끝나도 다시 받는다', () => {
    const t = holding()
    t.helperGone(t.native, 'Native host has exited.')
    const next = t.connectWeb()
    expect(next.disconnected).toBe(false)
    expect(next.posted).toEqual([])
  })

  it.each([
    ['end', (t: ReturnType<typeof holding>) => t.native.emit({ v: P, id: t.input.id, type: 'end', count: 1, bytes: 2, sha256: '0'.repeat(64) })],
    ['error', (t: ReturnType<typeof holding>) => t.native.emit({ v: P, id: t.input.id, type: 'error', code: 'E-INPUT-STOPPED' })],
    ['도우미 끝남', (t: ReturnType<typeof holding>) => t.helperGone(t.native, 'Native host has exited.')],
  ])('%s 로 붙잡기가 끝나면 30분 타이머도 지워져, 새 웹 연결의 새 도우미를 닫지 않는다', (_name, endHold) => {
    const t = holding()
    vi.advanceTimersByTime(10 * MINUTE)
    endHold(t)
    const next = t.connectWeb()
    const hello = req('hello')
    next.emit(hello)
    expect(t.natives).toHaveLength(2)

    vi.advanceTimersByTime(30 * MINUTE)
    expect(t.natives[1].disconnected).toBe(false)
    t.natives[1].emit({ v: P, id: hello.id, type: 'result', data: { helperVersion: '0.1.0', protocol: P } })
    expect(next.posted).toEqual([
      {
        v: P,
        id: hello.id,
        type: 'result',
        data: { helperVersion: '0.1.0', protocol: P, extensionVersion: VERSION, extensionProtocol: P },
      },
    ])
  })
})
