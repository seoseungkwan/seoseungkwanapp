// TASK-7 REQ-3609 AC-3609.6: 새 확장 서비스 워커(도우미 통로)를 가짜 chrome(runtime.onMessage·connectNative)으로 시험한다.
// TASK-17 AC-3614.2: 연결이 끊길 때 크롬 lastError 글로 '도우미 없음'(E-HELPER-MISSING)과 '도중 멈춤'(E-HELPER-STOPPED)을 나눈다.
// 자료는 모두 가짜다(환자 정보 없음)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMMANDS, PROTOCOL, REPLY_TIMEOUT_MS, startBackground, type BackgroundChrome, type NativePortLike } from './background'
import { HOST_NAME } from './types'

const OUR_ID = 'lkancaiekmoieooheifdimahhkejfmjc'
const ERP_TABLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'helper-erp', 'commands.json')

/** ERP 도우미 명령 표(helper-erp/commands.json, TASK-11). 없으면 그 시험만 실패하게 시험 안에서 읽는다 */
const erpTable = () =>
  JSON.parse(readFileSync(ERP_TABLE, 'utf8')) as { protocol: number; hostName: string; commands: Record<string, unknown> }
const ID_SHAPE = /^[A-Za-z0-9-]{1,64}$/
const DAY_ARGS = { date: '2026-11-09', groups: [{ key: 'carm', codes: ['CARM1'] }] }

/** 도우미 연결 흉내. disconnect()는 크롬처럼 제 onDisconnect를 부르지 않는다 */
class FakePort implements NativePortLike {
  posted: unknown[] = []
  disconnected = false
  private messageFns: ((m: unknown) => void)[] = []
  private disconnectFns: (() => void)[] = []
  onMessage = { addListener: (fn: (m: unknown) => void) => void this.messageFns.push(fn) }
  onDisconnect = { addListener: (fn: () => void) => void this.disconnectFns.push(fn) }

  constructor(private readonly chrome: { runtime: { lastError?: { message?: string } } }) {}

  postMessage(m: unknown) {
    if (this.disconnected) throw new Error('Attempting to use a disconnected port object')
    this.posted.push(m)
  }

  disconnect() {
    this.disconnected = true
  }

  /** 도우미가 보낸 답 */
  emit(m: unknown) {
    for (const fn of this.messageFns) fn(m)
  }

  /** 도우미가 없거나(이름 없음) 도중에 끝남. 크롬처럼 lastError를 콜백 동안만 채운다. null이면 lastError 없이 끊긴다 */
  drop(message: string | null = 'Specified native messaging host not found.') {
    this.dropWith(message === null ? undefined : { message })
  }

  /** lastError 모양을 그대로 주고 끊는다(message 칸이 없는 빈 객체 등) */
  dropWith(lastError: { message?: string } | undefined) {
    if (this.disconnected) return
    this.disconnected = true
    this.chrome.runtime.lastError = lastError
    for (const fn of this.disconnectFns) fn()
    this.chrome.runtime.lastError = undefined
  }
}

type Listener = (msg: unknown, sender: { id?: string }, sendResponse: (r: unknown) => void) => boolean | undefined

function setup(options: { connectThrows?: boolean } = {}) {
  const natives: FakePort[] = []
  let listener: Listener | undefined
  let lastError: { message?: string } | undefined
  let lastErrorReads = 0
  const runtime = {
    id: OUR_ID,
    get lastError() {
      lastErrorReads += 1
      return lastError
    },
    set lastError(v: { message?: string } | undefined) {
      lastError = v
    },
    connectNative: vi.fn((host: string) => {
      void host
      if (options.connectThrows) throw new Error('Access to the specified native messaging host is forbidden.')
      const port = new FakePort(chrome)
      natives.push(port)
      return port
    }),
    openOptionsPage: vi.fn(async () => {}),
    onMessage: {
      addListener: (fn: Listener) => {
        listener = fn
      },
    },
  }
  const chrome = { runtime }
  startBackground(chrome as unknown as BackgroundChrome)

  /** 내용 스크립트·설정 화면이 보낸 메시지 하나. 받은 답(sendResponse)을 모은다 */
  function send(msg: unknown, sender: { id?: string } = { id: OUR_ID }) {
    if (!listener) throw new Error('onMessage 듣는 함수가 없다')
    const replies: unknown[] = []
    const keep = listener(msg, sender, (r) => replies.push(r))
    return { replies, keep }
  }
  return { chrome, runtime, natives, send, lastErrorReads: () => lastErrorReads }
}

const envelope = (port: FakePort) => port.posted[0] as { v: number; id: string; cmd: string; args: unknown }

afterEach(() => {
  vi.useRealTimers()
})

describe('AC-3609.6 도우미 통로: 이름표·명령', () => {
  it('AC-3609.6: 도우미 이름은 ERP 명령 표(helper-erp/commands.json) hostName, 봉투 판(v)은 그 표 protocol이다', () => {
    const table = erpTable()
    expect(HOST_NAME).toBe(table.hostName)
    expect(PROTOCOL).toBe(table.protocol)
  })

  // REQ-3708(TASK-10·11): 도우미 새 명령 closing.findCodes가 더해져 셋이다(명령 표도 셋)
  // spec erp-uisarang AC-4210.1(design.md 8-9·12-4): 의사랑 명령 둘이 배열 끝에 더해져 다섯이다(명령 표와 같은지 보는 시험은 그대로)
  it('AC-3609.6 AC-3708.2 AC-4210.1: 받는 명령은 closing.codes·closing.day·closing.findCodes·closing.source·closing.uisCodes 다섯뿐이고 ERP 명령 표의 명령과 같다', () => {
    expect([...COMMANDS]).toEqual(['closing.codes', 'closing.day', 'closing.findCodes', 'closing.source', 'closing.uisCodes'])
    expect(Object.keys(erpTable().commands).sort()).toEqual([...COMMANDS].sort())
  })

  it('AC-4210.1: 명령 차례도 ERP 명령 표 차례와 같다(새 둘은 끝)', () => {
    expect(Object.keys(erpTable().commands)).toEqual([...COMMANDS])
  })

  it('AC-3609.6: 답 기다리는 시간은 120초다', () => {
    expect(REPLY_TIMEOUT_MS).toBe(120_000)
  })
})

describe('AC-3609.6 요청마다 연결 하나', () => {
  it('AC-3609.6: closing.day를 받으면 도우미 연결을 하나 열어 { v: 1, id, cmd, args }를 보낸다', () => {
    const t = setup()
    const { keep, replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    expect(keep).toBe(true) // 답은 나중에 보낸다
    expect(replies).toEqual([])
    expect(t.runtime.connectNative).toHaveBeenCalledTimes(1)
    expect(t.runtime.connectNative).toHaveBeenCalledWith(HOST_NAME)
    expect(t.natives).toHaveLength(1)
    const sent = envelope(t.natives[0])
    expect(t.natives[0].posted).toHaveLength(1)
    expect(Object.keys(sent).sort()).toEqual(['args', 'cmd', 'id', 'v'])
    expect(sent.v).toBe(1)
    expect(sent.cmd).toBe('closing.day')
    expect(sent.args).toEqual(DAY_ARGS)
    expect(sent.id).toMatch(ID_SHAPE)
  })

  it('AC-3609.6: result 하나를 받으면 { type: result, data }로 답하고 연결을 닫는다', () => {
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    const port = t.natives[0]
    const data = { date: '2026-11-09', inpatientVisits: 0 }
    port.emit({ v: 1, id: envelope(port).id, type: 'result', data })
    expect(replies).toEqual([{ type: 'result', data }])
    expect(port.disconnected).toBe(true)
  })

  it('AC-3609.6: closing.codes도 같은 길이다. error 하나를 받으면 { type: error, code }로 답하고 닫는다', () => {
    const t = setup()
    const { replies, keep } = t.send({ cmd: 'closing.codes', args: {} })
    expect(keep).toBe(true)
    const port = t.natives[0]
    expect(envelope(port)).toMatchObject({ v: 1, cmd: 'closing.codes', args: {} })
    port.emit({ v: 1, id: envelope(port).id, type: 'error', code: 'E-BIT-READ-FAILED' })
    expect(replies).toEqual([{ type: 'error', code: 'E-BIT-READ-FAILED' }])
    expect(port.disconnected).toBe(true)
  })

  it('AC-3708.2: closing.findCodes { text }도 같은 길로 도우미에 넘기고 받은 답을 고치지 않고 돌려준다', () => {
    const t = setup()
    const { replies, keep } = t.send({ cmd: 'closing.findCodes', args: { text: 'LA35' } })
    expect(keep).toBe(true)
    expect(t.runtime.connectNative).toHaveBeenCalledWith(HOST_NAME)
    const port = t.natives[0]
    expect(envelope(port)).toMatchObject({ v: 1, cmd: 'closing.findCodes', args: { text: 'LA35' } })
    const data = { codes: [{ code: 'LA357', name: '주사 (예시)' }, { code: 'LA358', name: null }] }
    port.emit({ v: 1, id: envelope(port).id, type: 'result', data })
    expect(replies).toEqual([{ type: 'result', data }])
    expect(port.disconnected).toBe(true)
  })

  it.each([['closing.source'], ['closing.uisCodes']])('AC-4210.1: %s { }도 같은 길로 도우미에 넘기고 받은 답을 고치지 않고 돌려준다', (cmd) => {
    const t = setup()
    const { replies, keep } = t.send({ cmd, args: {} })
    expect(keep).toBe(true)
    expect(t.runtime.connectNative).toHaveBeenCalledWith(HOST_NAME)
    const port = t.natives[0]
    expect(envelope(port)).toMatchObject({ v: 1, cmd, args: {} })
    const data = cmd === 'closing.source' ? { source: 'uisarang' } : { state: 'missing', from: null, to: null, value: null, codes: [] }
    port.emit({ v: 1, id: envelope(port).id, type: 'result', data })
    expect(replies).toEqual([{ type: 'result', data }])
    expect(port.disconnected).toBe(true)
  })

  it('AC-4210.1: 옛 도우미가 closing.source를 모르면 그 오류 번호(E-HELPER-UNKNOWN-COMMAND)를 그대로 돌려준다', () => {
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.source', args: {} })
    const port = t.natives[0]
    port.emit({ v: 1, id: envelope(port).id, type: 'error', code: 'E-HELPER-UNKNOWN-COMMAND' })
    expect(replies).toEqual([{ type: 'error', code: 'E-HELPER-UNKNOWN-COMMAND' }])
  })

  it('AC-4210.1: closing.day args의 선택 칸 sales는 고치지 않고 그대로 도우미에 넘긴다', () => {
    const t = setup()
    const args = { ...DAY_ARGS, sales: [{ key: 'manual', codes: ['MM300', 'PROLO C'] }, { key: 'eswt', codes: ['ES100'] }] }
    t.send({ cmd: 'closing.day', args })
    expect(envelope(t.natives[0]).args).toEqual(args)
  })

  it('AC-3708.3: 옛 도우미가 closing.findCodes를 모르면 그 오류 번호(E-HELPER-UNKNOWN-COMMAND)를 그대로 돌려준다', () => {
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.findCodes', args: { text: 'LA35' } })
    const port = t.natives[0]
    port.emit({ v: 1, id: envelope(port).id, type: 'error', code: 'E-HELPER-UNKNOWN-COMMAND' })
    expect(replies).toEqual([{ type: 'error', code: 'E-HELPER-UNKNOWN-COMMAND' }])
  })

  it('AC-3609.6: 요청 둘은 연결도 둘이고 id가 다르며, 답은 제 요청에만 간다', () => {
    const t = setup()
    const a = t.send({ cmd: 'closing.codes', args: {} })
    const b = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    expect(t.natives).toHaveLength(2)
    const [pa, pb] = t.natives
    expect(envelope(pa).id).not.toBe(envelope(pb).id)
    pb.emit({ v: 1, id: envelope(pb).id, type: 'result', data: { n: 2 } })
    expect(b.replies).toEqual([{ type: 'result', data: { n: 2 } }])
    expect(a.replies).toEqual([])
    expect(pa.disconnected).toBe(false)
    pa.emit({ v: 1, id: envelope(pa).id, type: 'result', data: { n: 1 } })
    expect(a.replies).toEqual([{ type: 'result', data: { n: 1 } }])
  })

  it('AC-3609.6: 다른 id·끝이 아닌 답(progress 등)은 넘기지 않고 계속 기다린다', () => {
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    const port = t.natives[0]
    const id = envelope(port).id
    port.emit({ v: 1, id: 'someone-else', type: 'result', data: {} })
    port.emit({ v: 1, id, type: 'progress', data: {} })
    port.emit('not an object')
    port.emit(null)
    expect(replies).toEqual([])
    expect(port.disconnected).toBe(false)
    port.emit({ v: 1, id, type: 'result', data: { ok: true } })
    expect(replies).toEqual([{ type: 'result', data: { ok: true } }])
  })

  it('AC-3609.6: 봉투를 읽지 못한 도우미의 오류(id 빈 글자)도 그 요청의 답으로 넘긴다', () => {
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    t.natives[0].emit({ v: 1, id: '', type: 'error', code: 'E-HELPER-BAD-MESSAGE' })
    expect(replies).toEqual([{ type: 'error', code: 'E-HELPER-BAD-MESSAGE' }])
    expect(t.natives[0].disconnected).toBe(true)
  })

  it('AC-3609.6: 답한 뒤에 온 메시지·끊김은 두 번 답하지 않는다', () => {
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    const port = t.natives[0]
    const id = envelope(port).id
    port.emit({ v: 1, id, type: 'result', data: 1 })
    port.emit({ v: 1, id, type: 'result', data: 2 })
    port.emit({ v: 1, id, type: 'error', code: 'E-X' })
    expect(replies).toEqual([{ type: 'result', data: 1 }])
  })
})

describe('AC-3609.6 도우미 없음·거절·120초', () => {
  it('AC-3609.6: 도우미가 없어 연결이 끊기면 E-HELPER-MISSING으로 답하고 lastError를 읽는다', () => {
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    const before = t.lastErrorReads()
    t.natives[0].drop()
    expect(replies).toEqual([{ type: 'error', code: 'E-HELPER-MISSING' }])
    expect(t.lastErrorReads()).toBeGreaterThan(before)
  })

  it.each([
    ['Specified native messaging host not found.'],
    ['Access to the specified native messaging host is forbidden.'],
    ['NATIVE MESSAGING HOST NOT FOUND'],
    ['Forbidden'],
  ])("AC-3614.2: lastError 글에 'not found'·'forbidden'(대소문자 무시)이 있으면(%s) E-HELPER-MISSING이다", (message) => {
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.codes', args: {} })
    t.natives[0].drop(message)
    expect(replies).toEqual([{ type: 'error', code: 'E-HELPER-MISSING' }])
  })

  it.each<[string, string | null]>([
    ['도우미가 끝남', 'Native host has exited.'],
    ['다른 글', 'Error when communicating with the native messaging host.'],
    ['빈 글자', ''],
    ['lastError 없음', null],
  ])('AC-3614.2: 그 밖(%s)이면 읽는 도중 멈춤 E-HELPER-STOPPED이고 연결은 다시 쓰지 않는다', (_name, message) => {
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    const port = t.natives[0]
    port.drop(message)
    expect(replies).toEqual([{ type: 'error', code: 'E-HELPER-STOPPED' }])
    // 끊긴 뒤 온 답·120초는 두 번 답하지 않는다
    port.emit({ v: 1, id: envelope(port).id, type: 'result', data: {} })
    expect(replies).toHaveLength(1)
  })

  it('AC-3614.2: lastError에 message 칸이 없어도(크롬이 빈 객체를 줌) E-HELPER-STOPPED다', () => {
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    t.natives[0].dropWith({})
    expect(replies).toEqual([{ type: 'error', code: 'E-HELPER-STOPPED' }])
  })

  it('AC-3609.6 AC-3614.2: connectNative가 던지면(연결 자체를 못 엶) 지금처럼 E-HELPER-MISSING으로 바로 답한다', () => {
    const t = setup({ connectThrows: true })
    const { replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    expect(replies).toEqual([{ type: 'error', code: 'E-HELPER-MISSING' }])
  })

  it('AC-3609.6: 120초 안에 답이 없으면 E-HELPER-TIMEOUT으로 답하고 연결을 닫는다. 늦은 답은 넘기지 않는다', () => {
    vi.useFakeTimers()
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    const port = t.natives[0]
    vi.advanceTimersByTime(REPLY_TIMEOUT_MS - 1)
    expect(replies).toEqual([])
    expect(port.disconnected).toBe(false)
    vi.advanceTimersByTime(1)
    expect(replies).toEqual([{ type: 'error', code: 'E-HELPER-TIMEOUT' }])
    expect(port.disconnected).toBe(true)
    port.emit({ v: 1, id: envelope(port).id, type: 'result', data: {} })
    expect(replies).toHaveLength(1)
  })

  it('AC-3609.6: 답을 받은 요청은 120초가 지나도 다시 답하지 않는다', () => {
    vi.useFakeTimers()
    const t = setup()
    const { replies } = t.send({ cmd: 'closing.day', args: DAY_ARGS })
    const port = t.natives[0]
    port.emit({ v: 1, id: envelope(port).id, type: 'result', data: {} })
    vi.advanceTimersByTime(REPLY_TIMEOUT_MS * 2)
    expect(replies).toHaveLength(1)
  })
})

describe('AC-3609.6 같은 확장이 보낸 두 명령만', () => {
  it('AC-3609.6: 다른 확장(또는 id 없음)이 보낸 메시지는 답하지 않고 도우미를 켜지 않는다', () => {
    const t = setup()
    for (const sender of [{ id: 'aaaabbbbccccddddeeeeffffgggghhhh' }, {}, { id: '' }]) {
      const { replies, keep } = t.send({ cmd: 'closing.day', args: DAY_ARGS }, sender)
      expect(replies).toEqual([])
      expect(keep).not.toBe(true)
    }
    expect(t.runtime.connectNative).not.toHaveBeenCalled()
  })

  it.each([
    ['hello', { cmd: 'hello', args: {} }],
    ['claim.month', { cmd: 'claim.month', args: {} }],
    ['revenue.days', { cmd: 'revenue.days', args: {} }],
    ['bit.input', { cmd: 'bit.input', args: {} }],
    ['빈 cmd', { cmd: '', args: {} }],
    ['args 없음', { cmd: 'closing.day' }],
    ['args가 배열', { cmd: 'closing.day', args: [] }],
    ['args가 null', { cmd: 'closing.codes', args: null }],
    ['칸이 더 있음', { cmd: 'closing.day', args: DAY_ARGS, id: 'x' }],
    ['글자', 'closing.day'],
    ['null', null],
  ])('AC-3609.6: 같은 확장이어도 %s 이면 도우미를 켜지 않고 E-BRIDGE-REJECTED로 답한다', (_name, msg) => {
    const t = setup()
    const { replies } = t.send(msg)
    expect(replies).toEqual([{ type: 'error', code: 'E-BRIDGE-REJECTED' }])
    expect(t.runtime.connectNative).not.toHaveBeenCalled()
  })

  it('AC-3609.2: 같은 확장의 { open: options }는 도우미를 켜지 않고 설정 화면만 연다(내용 스크립트는 직접 못 연다)', async () => {
    const t = setup()
    const { replies, keep } = t.send({ open: 'options' })
    expect(keep).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(t.runtime.openOptionsPage).toHaveBeenCalledTimes(1)
    expect(t.runtime.connectNative).not.toHaveBeenCalled()
    expect(replies).toEqual([{ type: 'result', data: null }])
  })

  it('AC-3609.2: 다른 확장의 { open: options }는 열지 않는다', () => {
    const t = setup()
    t.send({ open: 'options' }, { id: 'aaaabbbbccccddddeeeeffffgggghhhh' })
    expect(t.runtime.openOptionsPage).not.toHaveBeenCalled()
  })
})
