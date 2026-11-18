// 서비스 워커 흐름(TASK-3 REQ-003, TASK-38 REQ-038)을 가짜 chrome으로 시험한다. 자료는 모두 가짜다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import commands from '../../src/lib/bridge/commands.json'
import { startBackground } from './background'
import type { ChromeLike, PortLike } from './chromeLike'

const ORIGIN = commands.origin
const VERSION = '0.1.0'
const P = commands.protocol
const MINUTE = 60 * 1000
const WINDOW = 7
const OTHER_WINDOW = 8

/** 크롬 Port 흉내. disconnect()는 크롬처럼 제 onDisconnect를 부르지 않고, 끊긴 포트에 보내면 던진다 */
class FakePort implements PortLike {
  sender?: { origin?: string; tab?: { windowId?: number } }
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

/** 탭·창의 제목과 주소를 읽으면 시험이 깨지는 가짜 객체(AC-038.3) */
function withoutText<T extends object>(view: T): T {
  for (const key of ['title', 'url', 'pendingUrl', 'favIconUrl']) {
    Object.defineProperty(view, key, {
      get() {
        throw new Error(`${key}를 읽으면 안 된다`)
      },
    })
  }
  return view
}

function setup(options: { connectNativeThrows?: boolean } = {}) {
  const natives: FakePort[] = []
  let onConnect: ((p: PortLike) => void) | undefined
  let lastError: { message?: string } | undefined
  let lastErrorRead = false
  /** 창 번호 → 지금 상태. 없으면 닫힌 창이다. 상태가 undefined면 크롬이 state를 주지 않은 창이다 */
  const open = new Map<number, string | undefined>([
    [WINDOW, 'maximized'],
    [OTHER_WINDOW, 'normal'],
  ])
  const fail = { get: false, update: false }
  const waiting: (() => void)[] = []
  /** 콜백이 읽지 않고 넘어간 오류. 크롬이면 'Unchecked runtime.lastError'로 남는다 */
  const unchecked: string[] = []

  /** 크롬처럼 답은 나중에(flush) 온다. 실패하면 인자 없이 부르고 lastError는 콜백 동안만 채운다 */
  function answer(windowId: number, call: keyof typeof fail, ok: () => void, failed: () => void) {
    waiting.push(() => {
      if (!fail[call] && open.has(windowId)) {
        ok()
        return
      }
      const message = `No window with id: ${windowId}.`
      lastError = { message }
      lastErrorRead = false
      failed()
      if (!lastErrorRead) unchecked.push(message)
      lastError = undefined
    })
  }

  const windows = {
    get: vi.fn((windowId: number, callback: (win?: { state?: string }) => void) => {
      answer(
        windowId,
        'get',
        () => callback(withoutText({ state: open.get(windowId) })),
        () => callback(undefined),
      )
    }),
    update: vi.fn((windowId: number, info: { state: string }, callback?: () => void) => {
      answer(
        windowId,
        'update',
        () => {
          open.set(windowId, info.state)
          callback?.()
        },
        () => callback?.(),
      )
    }),
  }

  function flush() {
    for (let run = waiting.shift(); run; run = waiting.shift()) run()
  }

  /** 기다리는 크롬 답 하나만 오게 한다 */
  function step() {
    waiting.shift()?.()
  }

  /** update 호출을 [창 번호, 상태]로 */
  function updates() {
    return windows.update.mock.calls.map(([windowId, info]) => [windowId, info.state])
  }

  const runtime = {
    get lastError() {
      lastErrorRead = true
      return lastError
    },
    set lastError(value: { message?: string } | undefined) {
      lastError = value
    },
    onConnectExternal: { addListener: (fn: (p: PortLike) => void) => void (onConnect = fn) },
    connectNative: vi.fn((host: string) => {
      void host
      if (options.connectNativeThrows) throw new Error('Access to native messaging requires nativeMessaging permission.')
      const port = new FakePort()
      natives.push(port)
      return port
    }),
  }
  const chrome = { runtime, windows } as unknown as ChromeLike
  startBackground(chrome, { version: VERSION })

  /** 인자가 없으면 우리 origin. undefined를 주면 sender.origin이 없는 연결 */
  function connectWeb(...args: [] | [string | undefined]) {
    const port = new FakePort(args.length === 0 ? ORIGIN : args[0])
    if (!onConnect) throw new Error('onConnectExternal에 듣는 함수가 없다')
    onConnect(port)
    return port
  }

  /** 그 창의 탭에서 연 우리 사이트의 웹 연결 */
  function connectTab(windowId = WINDOW) {
    const port = new FakePort(ORIGIN)
    port.sender = { origin: ORIGIN, tab: withoutText({ windowId }) }
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

  return { chrome, runtime, natives, connectWeb, connectTab, helperGone, windows, open, fail, unchecked, flush, step, updates }
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

function progress(id: string, done = 0, total = 3) {
  return { v: P, id, type: 'progress', done, total }
}

function ended(id: string) {
  return { v: P, id, type: 'end', count: 1, bytes: 2, sha256: '0'.repeat(64) }
}

function stopped(id: string) {
  return { v: P, id, type: 'error', code: 'E-INPUT-STOPPED' }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AC-6401.1 새 주소·옛 주소 연결', () => {
  it.each([
    ['새 주소', 'https://n-medi.vercel.app'],
    ['옛 주소', 'https://seoseungkwanapp.vercel.app'],
  ])('AC-6401.1: %s(%s)에서 온 연결은 받아 첫 정상 메시지를 도우미로 넘긴다', (_name, origin) => {
    const t = setup()
    const web = t.connectWeb(origin)
    expect(web.disconnected).toBe(false)
    const hello = req('hello')
    web.emit(hello)
    expect(t.runtime.connectNative).toHaveBeenCalledTimes(1)
    expect(t.natives[0].posted).toEqual([hello])
  })
})

describe('AC-003.2 AC-6401.1 남의 origin', () => {
  it.each([
    undefined,
    'https://evil.example',
    'http://seoseungkwanapp.vercel.app',
    'http://n-medi.vercel.app',
    'https://n-medi.vercel.app/',
    'https://evil.n-medi.vercel.app',
    'https://other-app.vercel.app',
  ])(
    'AC-6401.1: %s 에서 온 연결은 바로 끊고 아무것도 보내지 않으며 도우미를 켜지 않는다',
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

/** 그 창의 탭에서 bit.input을 보낸 상태(아직 PC 확인 창 단계) */
function started(windowId = WINDOW) {
  const t = setup()
  const web = t.connectTab(windowId)
  const input = inputReq()
  web.emit(input)
  return { ...t, web, input, native: t.natives[0] }
}

type Started = ReturnType<typeof started>

/** 첫 progress가 와서 창을 내린 상태 */
function lowered(state = 'maximized') {
  const t = started()
  t.open.set(WINDOW, state)
  t.native.emit(progress(t.input.id))
  t.flush()
  return t
}

const FINISHES: [string, (t: Started) => void][] = [
  ['end', (t) => t.native.emit(ended(t.input.id))],
  ['error', (t) => t.native.emit(stopped(t.input.id))],
  ['도우미 연결 끊김', (t) => t.helperGone(t.native, 'Native host has exited.')],
]

describe('AC-038.1 첫 progress에 크롬 창을 내린다', () => {
  it('AC-038.1: 확인을 지나기 전(첫 progress 전)에는 창을 건드리지 않는다', () => {
    const t = started()
    t.flush()
    expect(t.windows.get).not.toHaveBeenCalled()
    expect(t.windows.update).not.toHaveBeenCalled()
  })

  it('AC-038.1: 첫 progress에 그 탭의 창 상태를 읽은 뒤 그 창만 minimized로 내린다(탭 목록을 달라지 않는다)', () => {
    const t = started()
    t.native.emit(progress(t.input.id))
    expect(t.windows.get).toHaveBeenCalledTimes(1)
    expect(t.windows.get).toHaveBeenCalledWith(WINDOW, expect.any(Function))
    // 상태를 읽기 전에는 내리지 않는다: 내린 뒤 읽으면 되돌릴 상태가 'minimized'가 된다
    expect(t.windows.update).not.toHaveBeenCalled()
    t.flush()
    expect(t.windows.update).toHaveBeenCalledTimes(1)
    expect(t.windows.update.mock.calls[0].slice(0, 2)).toEqual([WINDOW, { state: 'minimized' }])
    expect(t.open.get(WINDOW)).toBe('minimized')
    expect(t.open.get(OTHER_WINDOW)).toBe('normal')
    expect(t.unchecked).toEqual([])
  })

  it('AC-038.1·AC-003.4: progress는 고치지 않고 창의 답을 기다리지 않고 같은 객체로 넘긴다', () => {
    const t = started()
    const reply = progress(t.input.id)
    const copy = structuredClone(reply)
    t.native.emit(reply)
    expect(t.web.posted).toHaveLength(1)
    expect(t.web.posted[0]).toBe(reply)
    t.flush()
    expect(t.web.posted).toHaveLength(1)
    expect(reply).toEqual(copy)
  })

  it('AC-038.1: 같은 요청에서 두 번 내리지 않는다(직원이 창을 다시 올려도 그대로 둔다)', () => {
    const t = lowered()
    t.open.set(WINDOW, 'normal')
    t.native.emit(progress(t.input.id, 1))
    t.native.emit(progress(t.input.id, 2))
    t.flush()
    expect(t.windows.get).toHaveBeenCalledTimes(1)
    expect(t.windows.update).toHaveBeenCalledTimes(1)
    expect(t.open.get(WINDOW)).toBe('normal')
    expect(t.web.posted).toHaveLength(3)
  })

  it('AC-038.1: 상태를 읽는 사이 다음 progress가 와도 한 번만 내린다', () => {
    const t = started()
    t.native.emit(progress(t.input.id))
    t.native.emit(progress(t.input.id, 1))
    t.flush()
    expect(t.windows.get).toHaveBeenCalledTimes(1)
    expect(t.updates()).toEqual([[WINDOW, 'minimized']])
  })

  it('AC-038.1: bit.input이 아닌 명령의 progress·답에는 창을 건드리지 않는다', () => {
    const t = setup()
    const web = t.connectTab()
    const month = req('claim.month', { from: '2026-10-01', to: '2026-10-31' })
    web.emit(month)
    t.natives[0].emit(progress(month.id))
    t.natives[0].emit(ended(month.id))
    t.flush()
    expect(t.windows.get).not.toHaveBeenCalled()
    expect(t.windows.update).not.toHaveBeenCalled()
    expect(web.posted).toHaveLength(2)
  })

  it('AC-038.1: 기다리지 않던 id의 progress, 이미 끝난 bit.input의 늦은 progress에는 내리지 않는다', () => {
    const t = started()
    t.native.emit(progress('0f8fad5b-d9cb-469f-a165-ffffffffffff'))
    t.native.emit(ended(t.input.id))
    t.native.emit(progress(t.input.id, 3))
    t.flush()
    expect(t.windows.get).not.toHaveBeenCalled()
    expect(t.windows.update).not.toHaveBeenCalled()
  })

  it('AC-038.1: sender.tab이 없으면 창을 건드리지 않고 넘기기만 한다', () => {
    const t = setup()
    const web = t.connectWeb()
    const input = inputReq()
    web.emit(input)
    const reply = progress(input.id)
    t.natives[0].emit(reply)
    t.natives[0].emit(ended(input.id))
    t.flush()
    expect(t.windows.get).not.toHaveBeenCalled()
    expect(t.windows.update).not.toHaveBeenCalled()
    expect(web.posted[0]).toBe(reply)
    expect(web.posted).toHaveLength(2)
  })

  it('AC-038.1: 상태를 읽지 못하면(lastError) 내리지 않고 넘기기만 한다. 오류를 읽고, 다음 progress에 다시 하지 않고, 끝에도 건드리지 않는다', () => {
    const t = started()
    t.fail.get = true
    const reply = progress(t.input.id)
    t.native.emit(reply)
    t.flush()
    t.fail.get = false
    t.native.emit(progress(t.input.id, 1))
    t.flush()
    t.native.emit(ended(t.input.id))
    t.flush()
    expect(t.windows.get).toHaveBeenCalledTimes(1)
    expect(t.windows.update).not.toHaveBeenCalled()
    expect(t.unchecked).toEqual([])
    expect(t.web.posted[0]).toBe(reply)
    expect(t.web.posted).toHaveLength(3)
  })

  it('AC-038.1: lastError가 있으면 창 정보가 함께 와도 내리지 않는다', () => {
    const t = started()
    t.windows.get.mockImplementationOnce((_windowId, callback) => {
      t.runtime.lastError = { message: '가짜 실패' }
      callback({ state: 'normal' })
      t.runtime.lastError = undefined
    })
    t.native.emit(progress(t.input.id))
    t.flush()
    expect(t.windows.update).not.toHaveBeenCalled()
  })

  it('AC-038.1: 크롬이 상태를 주지 않으면 되돌릴 수 없으니 내리지 않는다', () => {
    const t = started()
    t.open.set(WINDOW, undefined)
    t.native.emit(progress(t.input.id))
    t.flush()
    t.native.emit(ended(t.input.id))
    t.flush()
    expect(t.windows.update).not.toHaveBeenCalled()
  })

  it('AC-038.1: 내리기가 실패하면(lastError) 넘기기만 한다. 오류를 읽고, 다시 내리지 않고, 끝에 되돌리지도 않는다', () => {
    const t = started()
    t.fail.update = true
    const reply = progress(t.input.id)
    t.native.emit(reply)
    t.flush()
    t.fail.update = false
    t.native.emit(progress(t.input.id, 1))
    t.flush()
    t.native.emit(ended(t.input.id))
    t.flush()
    expect(t.windows.get).toHaveBeenCalledTimes(1)
    expect(t.updates()).toEqual([[WINDOW, 'minimized']])
    expect(t.unchecked).toEqual([])
    expect(t.web.posted[0]).toBe(reply)
    expect(t.web.posted).toHaveLength(3)
  })

  it.each<[string, (t: Started) => void]>([
    [
      'windows.get이 던짐',
      (t) =>
        t.windows.get.mockImplementation(() => {
          throw new Error('가짜 실패')
        }),
    ],
    [
      'windows.update가 던짐',
      (t) =>
        t.windows.update.mockImplementation(() => {
          throw new Error('가짜 실패')
        }),
    ],
    ['chrome.windows가 없음', (t) => delete (t.chrome as { windows?: unknown }).windows],
  ])('AC-038.1: %s 이어도 입력을 막지 않고 답을 그대로 넘긴다', (_name, breakIt) => {
    const t = started()
    breakIt(t)
    const first = progress(t.input.id)
    const last = ended(t.input.id)
    t.native.emit(first)
    t.flush()
    t.native.emit(last)
    t.flush()
    expect(t.web.posted[0]).toBe(first)
    expect(t.web.posted[1]).toBe(last)
    expect(t.web.posted).toHaveLength(2)
  })

  it('AC-038.1: 웹 연결이 끊긴 뒤 온 첫 progress에도 그 연결의 창을 내린다(끝까지 붙잡는 입력, AC-003.7)', () => {
    const t = started()
    t.web.drop()
    t.native.emit(progress(t.input.id))
    t.flush()
    expect(t.updates()).toEqual([[WINDOW, 'minimized']])
    expect(t.web.posted).toEqual([])
  })

  it('AC-038.1: 입력하는 동안 거절된 새 연결의 창이 아니라 입력을 보낸 연결의 창을 내린다', () => {
    const t = started()
    const second = t.connectTab(OTHER_WINDOW)
    expect(second.disconnected).toBe(true)
    t.web.drop()
    const third = t.connectTab(OTHER_WINDOW)
    expect(third.disconnected).toBe(true)
    t.native.emit(progress(t.input.id))
    t.flush()
    expect(t.updates()).toEqual([[WINDOW, 'minimized']])
  })

  it('AC-038.1: 다음 웹 연결은 제 창을 내린다. 창이 없는 다음 연결은 전 연결의 창을 쓰지 않는다', () => {
    const t = setup()
    t.connectTab(WINDOW).drop()

    const next = t.connectTab(OTHER_WINDOW)
    const input = inputReq()
    next.emit(input)
    t.natives[0].emit(progress(input.id))
    t.flush()
    expect(t.windows.update.mock.calls[0].slice(0, 2)).toEqual([OTHER_WINDOW, { state: 'minimized' }])
    t.natives[0].emit(ended(input.id))
    t.flush()
    next.drop()
    t.windows.get.mockClear()
    t.windows.update.mockClear()

    const noTab = t.connectWeb()
    const another = inputReq()
    noTab.emit(another)
    t.natives[1].emit(progress(another.id))
    t.flush()
    expect(t.windows.get).not.toHaveBeenCalled()
    expect(t.windows.update).not.toHaveBeenCalled()
  })
})

describe('AC-038.2 끝나면 전 상태로 되돌린다', () => {
  it.each(['normal', 'maximized', 'fullscreen', 'minimized'])(
    'AC-038.2: 내리기 전이 %s 이면 end에 그 상태로 한 번만 되돌리고 end는 그대로 넘긴다',
    (state) => {
      const t = lowered(state)
      const last = ended(t.input.id)
      t.native.emit(last)
      t.flush()
      expect(t.updates()).toEqual([
        [WINDOW, 'minimized'],
        [WINDOW, state],
      ])
      expect(t.open.get(WINDOW)).toBe(state)
      expect(t.web.posted.at(-1)).toBe(last)
      expect(t.unchecked).toEqual([])
    },
  )

  it('AC-038.2: error로 끝나도 되돌리고 error는 그대로 넘긴다', () => {
    const t = lowered('normal')
    const last = stopped(t.input.id)
    t.native.emit(last)
    t.flush()
    expect(t.open.get(WINDOW)).toBe('normal')
    expect(t.updates()).toHaveLength(2)
    expect(t.web.posted.at(-1)).toBe(last)
  })

  it('AC-038.2: 도우미 연결이 끊기면 되돌리고, 기다리던 요청에는 지금처럼 E-HELPER-MISSING을 보낸다', () => {
    const t = lowered('normal')
    t.helperGone(t.native, 'Native host has exited.')
    t.flush()
    expect(t.open.get(WINDOW)).toBe('normal')
    expect(t.updates()).toHaveLength(2)
    expect(t.web.posted.at(-1)).toEqual({ v: P, id: t.input.id, type: 'error', code: 'E-HELPER-MISSING' })
  })

  it('AC-038.2: 웹이 끊긴 뒤 end가 오면 되돌리고 도우미 연결을 닫는다. 닫으면서 다시 되돌리지 않는다', () => {
    const t = lowered('normal')
    t.web.drop()
    t.flush()
    expect(t.updates()).toHaveLength(1)
    t.native.emit(ended(t.input.id))
    t.flush()
    expect(t.native.disconnected).toBe(true)
    expect(t.updates()).toEqual([
      [WINDOW, 'minimized'],
      [WINDOW, 'normal'],
    ])
  })

  it('AC-038.2: 웹이 끊긴 뒤 끝이 오지 않아 30분 만에 도우미 연결을 닫을 때도 되돌린다', () => {
    const t = lowered('normal')
    t.web.drop()
    vi.advanceTimersByTime(30 * MINUTE)
    t.flush()
    expect(t.native.disconnected).toBe(true)
    expect(t.updates()).toEqual([
      [WINDOW, 'minimized'],
      [WINDOW, 'normal'],
    ])
  })

  it('AC-038.2: end 뒤에 도우미가 끝나거나 웹이 끊겨도 다시 되돌리지 않는다', () => {
    const t = lowered('normal')
    t.native.emit(ended(t.input.id))
    t.flush()
    t.web.drop()
    t.helperGone(t.native, 'Native host has exited.')
    t.flush()
    expect(t.updates()).toHaveLength(2)
  })

  it('AC-038.2: 입력 중 다른 요청의 끝으로는 되돌리지 않는다', () => {
    const t = lowered('normal')
    const check = req('bit.check')
    const secondInput = inputReq()
    t.web.emit(check)
    t.web.emit(secondInput)
    t.native.emit({ v: P, id: check.id, type: 'result', data: { steps: [], registered: true } })
    t.native.emit({ v: P, id: secondInput.id, type: 'error', code: 'E-BRIDGE-BUSY' })
    t.flush()
    expect(t.updates()).toEqual([[WINDOW, 'minimized']])
    expect(t.open.get(WINDOW)).toBe('minimized')

    t.native.emit(ended(t.input.id))
    t.flush()
    expect(t.open.get(WINDOW)).toBe('normal')
  })

  it('AC-038.2: 입력 중 다른 bit.input의 progress가 와도 상태를 다시 읽지 않는다(내린 상태를 기억하면 되돌리지 못한다)', () => {
    const t = lowered('normal')
    const secondInput = inputReq()
    t.web.emit(secondInput)
    t.native.emit(progress(secondInput.id))
    t.flush()
    expect(t.windows.get).toHaveBeenCalledTimes(1)
    expect(t.windows.update).toHaveBeenCalledTimes(1)
    t.native.emit(ended(t.input.id))
    t.flush()
    expect(t.open.get(WINDOW)).toBe('normal')
  })

  it('AC-038.2: 창이 이미 닫혔으면 오류를 읽고 넘어가고, 답을 그대로 넘기며, 다시 시도하지 않는다', () => {
    const t = lowered('normal')
    t.open.delete(WINDOW)
    const last = ended(t.input.id)
    t.native.emit(last)
    t.flush()
    expect(t.unchecked).toEqual([])
    expect(t.web.posted.at(-1)).toBe(last)
    expect(t.updates()).toHaveLength(2)
    t.helperGone(t.native, 'Native host has exited.')
    t.flush()
    expect(t.updates()).toHaveLength(2)
  })

  it('AC-038.2: 되돌리기가 던져도 답을 그대로 넘긴다', () => {
    const t = lowered('normal')
    t.windows.update.mockImplementation(() => {
      throw new Error('가짜 실패')
    })
    const last = ended(t.input.id)
    t.native.emit(last)
    t.flush()
    expect(t.web.posted.at(-1)).toBe(last)
  })

  it.each(FINISHES)('AC-038.2: 내리지 않은 요청은 %s 에 창을 건드리지 않는다', (_name, finish) => {
    const t = started()
    finish(t)
    t.flush()
    expect(t.windows.get).not.toHaveBeenCalled()
    expect(t.windows.update).not.toHaveBeenCalled()
  })

  it.each(FINISHES)('AC-038.2: 상태를 읽는 사이 %s 가 오면 내리지 않는다', (_name, finish) => {
    const t = started()
    t.native.emit(progress(t.input.id))
    finish(t)
    t.flush()
    expect(t.windows.update).not.toHaveBeenCalled()
    expect(t.open.get(WINDOW)).toBe('maximized')
    expect(t.unchecked).toEqual([])
  })

  it.each(FINISHES)('AC-038.2: 내리는 사이 %s 가 오면 내려간 뒤 한 번만 되돌린다', (_name, finish) => {
    const t = started()
    t.native.emit(progress(t.input.id))
    t.step()
    expect(t.updates()).toEqual([[WINDOW, 'minimized']])
    finish(t)
    t.flush()
    expect(t.updates()).toEqual([
      [WINDOW, 'minimized'],
      [WINDOW, 'maximized'],
    ])
    expect(t.open.get(WINDOW)).toBe('maximized')
  })

  it.each(FINISHES)('AC-038.2: 내리는 사이 %s 가 왔는데 내리기가 실패했으면 되돌리지 않는다', (_name, finish) => {
    const t = started()
    t.native.emit(progress(t.input.id))
    t.step()
    t.fail.update = true
    finish(t)
    t.flush()
    expect(t.updates()).toEqual([[WINDOW, 'minimized']])
    expect(t.unchecked).toEqual([])
  })

  it('AC-038.2: 다음 bit.input은 그때 상태를 새로 읽어 다시 내리고 그 상태로 되돌린다', () => {
    const t = lowered('maximized')
    t.native.emit(ended(t.input.id))
    t.flush()
    t.open.set(WINDOW, 'normal')

    const next = inputReq()
    t.web.emit(next)
    t.native.emit(progress(next.id))
    t.flush()
    expect(t.open.get(WINDOW)).toBe('minimized')
    t.native.emit(ended(next.id))
    t.flush()
    expect(t.open.get(WINDOW)).toBe('normal')
    expect(t.updates()).toEqual([
      [WINDOW, 'minimized'],
      [WINDOW, 'maximized'],
      [WINDOW, 'minimized'],
      [WINDOW, 'normal'],
    ])
  })
})
