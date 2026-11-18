import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { BridgeState, ChromeRuntimeLike, ChunkSink, PortLike, ResultOf } from '@/types/bridge'
import { connectBridge } from './client'
import { EXTENSION_ID } from './extensionId'
import { BridgeError } from './protocol'

// 가짜 Port: 웹이 보낸 것을 모으고, 시험이 확장의 답·끊김을 흉내 낸다
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
  /** 다른 쪽(확장·크롬)이 끊었다 */
  fireDisconnect() {
    this.disconnected = true
    for (const fn of this.disconnectFns) fn()
  }
}

function fakeRuntime(opts: { throws?: boolean } = {}) {
  const ports: FakePort[] = []
  const ids: string[] = []
  const runtime: ChromeRuntimeLike = {
    lastError: undefined,
    connect(id: string) {
      ids.push(id)
      if (opts.throws) throw new Error('Invalid extension id')
      const port = new FakePort()
      ports.push(port)
      return port
    },
  }
  // 크롬은 onDisconnect를 부르는 동안에만 lastError를 채운다
  const drop = (port: FakePort, lastError?: string) => {
    runtime.lastError = lastError === undefined ? undefined : { message: lastError }
    port.fireDisconnect()
    runtime.lastError = undefined
  }
  return { runtime, ports, ids, drop }
}

function fakeSink() {
  const calls: unknown[][] = []
  const sink: ChunkSink = {
    chunk: (id, seq, data) => void calls.push(['chunk', id, seq, data]),
    end: (id, count, bytes, sha256) => void calls.push(['end', id, count, bytes, sha256]),
    abort: (id, code) => void calls.push(['abort', id, code]),
  }
  return { sink, calls }
}

const SHA = 'a'.repeat(64)
// 도우미는 웹이 아는 최신(LATEST_HELPER)과 같은 판: "새 도우미가 있어요"가 뜨지 않는다
const HELLO_DATA = { helperVersion: '0.12.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }
const PATIENT_JSON_PART1 = '{"visits":[{"chart":"000123","name":"가상'
const PATIENT_JSON_PART2 = '환자01","memo":"가짜 메모"}]}'

function setup() {
  const fake = fakeRuntime()
  const { sink, calls } = fakeSink()
  let n = 0
  const bridge = connectBridge({ runtime: fake.runtime, sink, newId: () => `req-${++n}` })
  const states: BridgeState[] = []
  bridge.onState((s) => states.push(s))
  const port = fake.ports[0]
  return { ...fake, bridge, sink, calls, states, port }
}

async function ready() {
  const t = setup()
  const hello = t.bridge.hello()
  t.port.reply({ v: 1, id: t.port.last().id, type: 'result', data: HELLO_DATA })
  await hello
  return t
}

async function rejectCode(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(BridgeError)
    return (e as BridgeError).code
  }
  throw new Error('거절되지 않았다')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AC-004.3 연결과 상태', () => {
  it('AC-004.3 chrome.runtime이 없으면 no-extension이 되고 던지지 않는다', async () => {
    const { sink } = fakeSink()
    const bridge = connectBridge({ runtime: undefined, sink })
    expect(bridge.state()).toBe('no-extension')
    await expect(bridge.hello()).resolves.toEqual({ state: 'no-extension', helperUpdateAvailable: false })
    expect(await rejectCode(bridge.call('bit.check', {}))).toBe('E-EXT-MISSING')
    expect(() => bridge.close()).not.toThrow()
  })

  it('AC-004.3 connect가 던져도 no-extension이 되고 던지지 않는다', () => {
    const fake = fakeRuntime({ throws: true })
    const bridge = connectBridge({ runtime: fake.runtime, sink: fakeSink().sink })
    expect(bridge.state()).toBe('no-extension')
  })

  it('AC-004.3 확장에는 EXTENSION_ID로 한 번 연결하고, 처음 상태는 connecting', () => {
    const t = setup()
    expect(t.ids).toEqual([EXTENSION_ID])
    expect(t.bridge.state()).toBe('connecting')
  })

  it('AC-004.3 연결이 곧바로 끊기면(lastError) no-extension, 기다리던 hello도 no-extension으로 끝난다', async () => {
    const t = setup()
    const hello = t.bridge.hello()
    t.drop(t.port, 'Could not establish connection. Receiving end does not exist.')
    await expect(hello).resolves.toEqual({ state: 'no-extension', helperUpdateAvailable: false })
    expect(t.bridge.state()).toBe('no-extension')
    expect(t.states).toEqual(['no-extension'])
  })

  it('AC-004.3 hello가 E-HELPER-MISSING이면 no-helper', async () => {
    const t = setup()
    const hello = t.bridge.hello()
    t.port.reply({ v: 1, id: t.port.last().id, type: 'error', code: 'E-HELPER-MISSING' })
    await expect(hello).resolves.toEqual({ state: 'no-helper', helperUpdateAvailable: false })
    expect(t.bridge.state()).toBe('no-helper')
  })

  it('AC-004.3 확장이 E-BRIDGE-BUSY(id 빈 글자)를 주고 끊으면 busy이고, 끊긴 뒤에도 busy다', async () => {
    const t = setup()
    const hello = t.bridge.hello()
    t.port.reply({ v: 1, id: '', type: 'error', code: 'E-BRIDGE-BUSY' })
    t.drop(t.port)
    await expect(hello).resolves.toEqual({ state: 'busy', helperUpdateAvailable: false })
    expect(t.bridge.state()).toBe('busy')
    expect(await rejectCode(t.bridge.call('bit.check', {}))).toBe('E-BRIDGE-BUSY')
  })

  it('AC-004.3·AC-012.1·AC-3402.2·AC-4101.5·AC-4405.3·AC-4902.6·AC-5401.3·AC-5903.5·AC-6106.1·AC-6611.1 hello가 맞으면 ready이고 버전을 돌려준다(도우미가 새 판 0.12.0이면 새 도우미 알림 없음)', async () => {
    const t = setup()
    const hello = t.bridge.hello()
    expect(t.port.last()).toEqual({ v: 1, id: 'req-1', cmd: 'hello', args: {} })
    t.port.reply({ v: 1, id: 'req-1', type: 'result', data: HELLO_DATA })
    await expect(hello).resolves.toEqual({
      state: 'ready',
      helperVersion: '0.12.0',
      extensionVersion: '0.1.0',
      helperUpdateAvailable: false,
    })
    expect(t.bridge.state()).toBe('ready')
    expect(t.states).toEqual(['ready'])
  })

  it('AC-4405.3 예전 판 0.6.0 도우미는 막지 않고 ready이지만 새 도우미 알림이 뜬다(MIN 0.3.0 그대로, LATEST 0.12.0)', async () => {
    const t = setup()
    const hello = t.bridge.hello()
    t.port.reply({ v: 1, id: 'req-1', type: 'result', data: { ...HELLO_DATA, helperVersion: '0.6.0' } })
    await expect(hello).resolves.toEqual({
      state: 'ready',
      helperVersion: '0.6.0',
      extensionVersion: '0.1.0',
      helperUpdateAvailable: true,
    })
    expect(t.bridge.state()).toBe('ready')
  })

  it('AC-004.3·AC-004.4 도우미가 낮으면 update-helper, 그 상태에서 명령은 보내지 않고 E-HELPER-OLD', async () => {
    const t = setup()
    const hello = t.bridge.hello()
    t.port.reply({ v: 1, id: 'req-1', type: 'result', data: { ...HELLO_DATA, helperVersion: '0.0.9' } })
    expect((await hello).state).toBe('update-helper')
    expect(t.bridge.state()).toBe('update-helper')
    const before = t.port.sent.length
    expect(await rejectCode(t.bridge.call('bit.check', {}))).toBe('E-HELPER-OLD')
    expect(t.port.sent.length).toBe(before)
  })

  it('AC-004.3·AC-004.4 확장 protocol이 다르면 update-extension, 명령은 E-EXT-OLD', async () => {
    const t = setup()
    const hello = t.bridge.hello()
    t.port.reply({ v: 1, id: 'req-1', type: 'result', data: { ...HELLO_DATA, extensionProtocol: 2 } })
    expect((await hello).state).toBe('update-extension')
    expect(await rejectCode(t.bridge.stream('claim.month', { from: '2026-10-01', to: '2026-10-31' }))).toBe('E-EXT-OLD')
  })

  it('AC-004.3 hello 전(connecting)에는 명령을 보내지 않는다', async () => {
    const t = setup()
    expect(await rejectCode(t.bridge.call('bit.check', {}))).toBe('E-BRIDGE-REJECTED')
    expect(t.port.sent).toEqual([])
  })

  it.each([
    { ...HELLO_DATA, extra: 1 },
    { helperVersion: '0.1.0', protocol: 1 },
    { ...HELLO_DATA, helperVersion: 1 },
    { ...HELLO_DATA, protocol: '1' },
    { ...HELLO_DATA, extensionVersion: '가상환자01' },
    null,
  ])('AC-004.3·AC-004.6 hello 답 모양이 틀리면(%j) E-BRIDGE-BAD-REPLY', async (data) => {
    const t = setup()
    const hello = t.bridge.hello()
    t.port.reply({ v: 1, id: 'req-1', type: 'result', data })
    expect(await rejectCode(hello)).toBe('E-BRIDGE-BAD-REPLY')
    expect(t.bridge.state()).not.toBe('ready')
  })

  it('AC-004.3 onState는 바뀔 때만 알리고, 끊은 뒤에는 알리지 않는다', async () => {
    const t = setup()
    const seen: BridgeState[] = []
    const off = t.bridge.onState((s) => seen.push(s))
    const hello = t.bridge.hello()
    t.port.reply({ v: 1, id: 'req-1', type: 'result', data: HELLO_DATA })
    await hello
    off()
    t.drop(t.port)
    expect(seen).toEqual(['ready'])
    expect(t.states).toEqual(['ready', 'disconnected'])
  })

  it('AC-004.3 진짜 chrome.runtime 모양이 ChromeRuntimeLike에 맞는다(타입)', () => {
    expectTypeOf<typeof chrome.runtime>().toExtend<ChromeRuntimeLike>()
  })
})

describe('AC-004.5 환자 자료 명령: 조각은 풀지 않고 sink로', () => {
  it('AC-004.5 chunk·end를 JSON.parse 없이 sink로 넘기고 부른 쪽에는 {id, count}만 준다', async () => {
    const t = await ready()
    const parse = vi.spyOn(JSON, 'parse')
    const p = t.bridge.stream('claim.month', { from: '2026-10-01', to: '2026-10-31' })
    expect(t.port.last()).toEqual({ v: 1, id: 'req-2', cmd: 'claim.month', args: { from: '2026-10-01', to: '2026-10-31' } })
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: PATIENT_JSON_PART1 })
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 1, data: PATIENT_JSON_PART2 })
    t.port.reply({ v: 1, id: 'req-2', type: 'end', count: 2, bytes: 120, sha256: SHA })
    const result = await p
    expect(result).toEqual({ id: 'req-2', count: 2 })
    expect(Object.keys(result).sort()).toEqual(['count', 'id'])
    expect(JSON.stringify(result)).not.toContain('가상환자01')
    expect(t.calls).toEqual([
      ['chunk', 'req-2', 0, PATIENT_JSON_PART1],
      ['chunk', 'req-2', 1, PATIENT_JSON_PART2],
      ['end', 'req-2', 2, 120, SHA],
    ])
    expect(parse).not.toHaveBeenCalled()
  })

  it('AC-004.5 작은 답도 chunk 하나 + end로 온다', async () => {
    const t = await ready()
    const p = t.bridge.stream('sam.latest', {})
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: '[]' })
    t.port.reply({ v: 1, id: 'req-2', type: 'end', count: 1, bytes: 2, sha256: SHA })
    await expect(p).resolves.toEqual({ id: 'req-2', count: 1 })
  })

  it('AC-004.5 stream은 환자 자료 명령만, call은 숫자·상태 명령만 보낸다(다르면 E-BRIDGE-REJECTED)', async () => {
    const t = await ready()
    const before = t.port.sent.length
    // 타입이 막는 것을 실행 중에도 막는다
    const bridge = t.bridge as unknown as {
      stream(c: string, a: unknown): Promise<unknown>
      call(c: string, a: unknown): Promise<unknown>
    }
    expect(await rejectCode(bridge.stream('claim.dates', { from: '2026-10-01', to: '2026-10-02' }))).toBe('E-BRIDGE-REJECTED')
    expect(await rejectCode(bridge.stream('store.save', {}))).toBe('E-BRIDGE-REJECTED')
    expect(await rejectCode(bridge.call('claim.month', { from: '2026-10-01', to: '2026-10-02' }))).toBe('E-BRIDGE-REJECTED')
    expect(await rejectCode(bridge.call('hello', {}))).toBe('E-BRIDGE-REJECTED')
    expect(await rejectCode(bridge.call('nope', {}))).toBe('E-BRIDGE-REJECTED')
    expect(await rejectCode(bridge.call('bit.check', null))).toBe('E-BRIDGE-REJECTED')
    expect(await rejectCode(bridge.call('bit.check', []))).toBe('E-BRIDGE-REJECTED')
    expect(t.port.sent.length).toBe(before)
  })

  it.each([
    { why: '순서가 0부터가 아니다', reply: { v: 1, id: 'req-2', type: 'chunk', seq: 1, data: 'x' } },
    { why: 'data가 글자가 아니다', reply: { v: 1, id: 'req-2', type: 'chunk', seq: 0, data: 5 } },
    { why: '모르는 칸', reply: { v: 1, id: 'req-2', type: 'chunk', seq: 0, data: 'x', extra: 1 } },
    { why: 'v가 다르다', reply: { v: 2, id: 'req-2', type: 'chunk', seq: 0, data: 'x' } },
    { why: '받은 조각 수와 count가 다르다', reply: { v: 1, id: 'req-2', type: 'end', count: 1, bytes: 1, sha256: SHA } },
    { why: 'sha256 모양', reply: { v: 1, id: 'req-2', type: 'end', count: 0, bytes: 0, sha256: 'A'.repeat(64) } },
    { why: '모르는 type', reply: { v: 1, id: 'req-2', type: 'nope' } },
  ])('AC-004.5·AC-004.6 틀린 답($why)은 E-BRIDGE-BAD-REPLY, 조각을 버리게 sink.abort', async ({ reply }) => {
    const t = await ready()
    const p = t.bridge.stream('claim.memos', { from: '2026-10-01', to: '2026-10-31' })
    t.port.reply(reply)
    expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
    expect(t.calls).toEqual([['abort', 'req-2', 'E-BRIDGE-BAD-REPLY']])
  })

  it('AC-004.5 도우미가 오류를 주면 sink.abort 뒤 그 번호로 거절한다', async () => {
    const t = await ready()
    const p = t.bridge.stream('claim.month', { from: '2026-10-01', to: '2026-10-31' })
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: PATIENT_JSON_PART1 })
    t.port.reply({ v: 1, id: 'req-2', type: 'error', code: 'E-BIT-READ-FAILED' })
    expect(await rejectCode(p)).toBe('E-BIT-READ-FAILED')
    expect(t.calls).toEqual([
      ['chunk', 'req-2', 0, PATIENT_JSON_PART1],
      ['abort', 'req-2', 'E-BIT-READ-FAILED'],
    ])
  })

  it('AC-004.5 끝난 요청·모르는 id의 답은 버린다', async () => {
    const t = await ready()
    const p = t.bridge.stream('sam.latest', {})
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: '[]' })
    t.port.reply({ v: 1, id: 'req-2', type: 'end', count: 1, bytes: 2, sha256: SHA })
    await p
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 1, data: 'late' })
    t.port.reply({ v: 1, id: 'other', type: 'chunk', seq: 0, data: 'x' })
    t.port.reply('not an object')
    expect(t.calls).toHaveLength(2)
  })
})

describe('AC-004.6 숫자·상태 명령의 답 모양 검사', () => {
  async function callWith(cmd: 'bit.check' | 'bit.register' | 'claim.dates', data: unknown) {
    const t = await ready()
    const args = cmd === 'claim.dates' ? { from: '2026-10-01', to: '2026-10-31' } : {}
    const p = t.bridge.call(cmd as 'claim.dates', args as { from: string; to: string })
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data })
    return { t, p }
  }

  const DATES = { days: [{ date: '2026-10-01', visits: 52, memoInBit: 3 }, { date: '2026-10-02', visits: 1, memoInBit: 0 }] }
  const CHECK = {
    steps: [
      { name: 'find', ok: true },
      { name: 'db', ok: true },
      { name: 'registration', ok: true },
    ],
    registered: true,
    institutionCode: '12345678',
  }
  const CHECK_FAILED = {
    steps: [
      { name: 'find', ok: true },
      { name: 'db', ok: false, code: 'E-BIT-DB-FAILED' },
      { name: 'registration', ok: false, code: 'E-BIT-DB-FAILED' },
    ],
    registered: false,
  }

  it.each([
    ['claim.dates', DATES],
    ['claim.dates', { days: [] }],
    ['bit.check', CHECK],
    ['bit.check', CHECK_FAILED],
    ['bit.register', { registered: true }],
    ['bit.register', { registered: false }],
  ] as const)('AC-004.6 %s의 맞는 답 %j는 그대로 돌려준다', async (cmd, data) => {
    const { p } = await callWith(cmd, data)
    await expect(p).resolves.toEqual(data)
  })

  it('AC-004.6 call은 봉투 {v: 1, id, cmd, args}로 보낸다', async () => {
    const { t } = await callWith('claim.dates', DATES)
    expect(t.port.sent[1]).toEqual({ v: 1, id: 'req-2', cmd: 'claim.dates', args: { from: '2026-10-01', to: '2026-10-31' } })
  })

  it.each([
    ['claim.dates', null],
    ['claim.dates', { days: {} }],
    ['claim.dates', { days: [], extra: 1 }],
    ['claim.dates', { days: [{ date: '2026-13-01', visits: 1, memoInBit: 0 }] }],
    ['claim.dates', { days: [{ date: '2026-02-30', visits: 1, memoInBit: 0 }] }],
    ['claim.dates', { days: [{ date: '20261001', visits: 1, memoInBit: 0 }] }],
    ['claim.dates', { days: [{ date: '2026-10-01', visits: -1, memoInBit: 0 }] }],
    ['claim.dates', { days: [{ date: '2026-10-01', visits: 1.5, memoInBit: 0 }] }],
    ['claim.dates', { days: [{ date: '2026-10-01', visits: '3', memoInBit: 0 }] }],
    ['claim.dates', { days: [{ date: '2026-10-01', visits: 1 }] }],
    ['claim.dates', { days: [{ date: '2026-10-01', visits: 1, memoInBit: 0, name: '가상환자01' }] }],
    ['claim.dates', { days: Array.from({ length: 401 }, () => ({ date: '2026-10-01', visits: 1, memoInBit: 0 })) }],
    ['bit.check', { ...CHECK, registered: 'yes' }],
    ['bit.check', { ...CHECK, institutionCode: '1234567' }],
    ['bit.check', { ...CHECK, institutionCode: 12345678 }],
    ['bit.check', { ...CHECK, steps: [{ name: 'other', ok: true }] }],
    ['bit.check', { ...CHECK, steps: CHECK.steps.slice(0, 2) }],
    ['bit.check', { ...CHECK, steps: [CHECK.steps[1], CHECK.steps[0], CHECK.steps[2]] }],
    ['bit.check', { ...CHECK, steps: [{ name: 'find', ok: 1 }, CHECK.steps[1], CHECK.steps[2]] }],
    ['bit.check', { ...CHECK, steps: [{ name: 'find', ok: false, code: '가상환자01' }, CHECK.steps[1], CHECK.steps[2]] }],
    ['bit.check', { ...CHECK, steps: [{ name: 'find', ok: true, note: 'x' }, CHECK.steps[1], CHECK.steps[2]] }],
    ['bit.check', { ...CHECK, patient: '가상환자01' }],
    ['bit.register', { registered: 1 }],
    ['bit.register', {}],
    ['bit.register', { registered: true, hospitalName: '가짜' }],
  ] as const)('AC-004.6 %s의 틀린 답 %j는 E-BRIDGE-BAD-REPLY', async (cmd, data) => {
    const { p, t } = await callWith(cmd, data)
    expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
    // 숫자 명령은 sink를 쓰지 않는다
    expect(t.calls).toEqual([])
  })

  it.each([
    ['가짜정형외과의원'],
    [''],
    ['x'.repeat(101)],
    [null],
    [12345678],
  ] as const)('AC-005.10 bit.check 답에 hospitalName(%j)이 있으면 값과 상관없이 E-BRIDGE-BAD-REPLY', async (hospitalName) => {
    const { p, t } = await callWith('bit.check', { ...CHECK, hospitalName })
    expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
    expect(t.calls).toEqual([])
  })

  it('AC-005.10 등록 안 된 bit.check 답에 hospitalName이 있어도 E-BRIDGE-BAD-REPLY', async () => {
    const { p } = await callWith('bit.check', { ...CHECK_FAILED, hospitalName: '가짜정형외과의원' })
    expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
  })

  it('AC-005.10 ResultOf<bit.check> 타입은 {steps, registered, institutionCode?}이고 hospitalName이 없다', () => {
    // 타입 검사(tsc·next build)에서 확인한다
    expectTypeOf<keyof ResultOf<'bit.check'>>().toEqualTypeOf<'steps' | 'registered' | 'institutionCode'>()
    expectTypeOf<ResultOf<'bit.check'>['institutionCode']>().toEqualTypeOf<string | undefined>()
  })

  it('AC-004.6 result 봉투에 모르는 칸이 있으면 E-BRIDGE-BAD-REPLY', async () => {
    const t = await ready()
    const p = t.bridge.call('bit.register', {})
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { registered: true }, extra: '가상환자01' })
    expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
  })

  it('AC-004.6 숫자 명령에 chunk·end·progress가 오면 E-BRIDGE-BAD-REPLY이고 sink에 넘기지 않는다', async () => {
    for (const reply of [
      { type: 'chunk', seq: 0, data: '{"name":"가상환자01"}' },
      { type: 'end', count: 0, bytes: 0, sha256: SHA },
      { type: 'progress', done: 0, total: 1 },
    ]) {
      const t = await ready()
      const p = t.bridge.call('claim.dates', { from: '2026-10-01', to: '2026-10-31' })
      t.port.reply({ v: 1, id: 'req-2', ...reply })
      expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
      expect(t.calls).toEqual([])
    }
  })

  it('AC-004.6 환자 자료 명령에 result가 오면 E-BRIDGE-BAD-REPLY이고 sink.abort', async () => {
    const t = await ready()
    const p = t.bridge.stream('stats.rows', { from: '2026-10-01', to: '2026-10-31' })
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { rows: [{ name: '가상환자01' }] } })
    expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
    expect(t.calls).toEqual([['abort', 'req-2', 'E-BRIDGE-BAD-REPLY']])
  })

  it('AC-004.6 예외: store.save는 보내는 쪽만 환자 자료이고 답은 result {saved: true}다', async () => {
    const t = await ready()
    const p = t.bridge.send('store.save', '{"month":"2026-10"}')
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { saved: true } })
    await expect(p).resolves.toEqual({ saved: true })
  })

  it.each([{ saved: false }, { saved: true, extra: 1 }, {}, null])(
    'AC-004.6·AC-004.9 store.save 답이 %j이면 E-BRIDGE-BAD-REPLY',
    async (data) => {
      const t = await ready()
      const p = t.bridge.send('store.save', '{}')
      t.port.reply({ v: 1, id: 'req-2', type: 'result', data })
      expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
    },
  )

  it('AC-004.6 store.save에 chunk가 오면 E-BRIDGE-BAD-REPLY이고 sink에 넘기지 않는다', async () => {
    const t = await ready()
    const p = t.bridge.send('store.save', '{}')
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: '가상환자01' })
    expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
    expect(JSON.stringify(t.calls)).not.toContain('가상환자01')
  })

  it('AC-004.6 도우미 오류 번호는 그대로, 번호 모양이 아니면 E-BRIDGE-BAD-REPLY', async () => {
    const t = await ready()
    const p1 = t.bridge.call('bit.check', {})
    t.port.reply({ v: 1, id: 'req-2', type: 'error', code: 'E-BIT-NOT-FOUND' })
    expect(await rejectCode(p1)).toBe('E-BIT-NOT-FOUND')
    const p2 = t.bridge.call('bit.check', {})
    t.port.reply({ v: 1, id: 'req-3', type: 'error', code: 'System.Exception: 가상환자01' })
    expect(await rejectCode(p2)).toBe('E-BRIDGE-BAD-REPLY')
    const p3 = t.bridge.call('bit.check', {})
    t.port.reply({ v: 1, id: 'req-4', type: 'error', code: 'E-BIT-NOT-FOUND', message: '가상환자01' })
    expect(await rejectCode(p3)).toBe('E-BRIDGE-BAD-REPLY')
  })

  it('AC-004.3·AC-004.6 쓰는 중 도우미가 사라지면(E-HELPER-MISSING) 그 번호로 끝나고 no-helper', async () => {
    const t = await ready()
    const p = t.bridge.call('bit.check', {})
    t.port.reply({ v: 1, id: 'req-2', type: 'error', code: 'E-HELPER-MISSING' })
    expect(await rejectCode(p)).toBe('E-HELPER-MISSING')
    expect(t.bridge.state()).toBe('no-helper')
  })
})

describe('AC-004.7 끊김', () => {
  it('AC-004.7 끊기면 기다리던 요청은 E-BRIDGE-DISCONNECTED, 환자 자료 요청만 sink.abort', async () => {
    const t = await ready()
    const small = t.bridge.call('bit.check', {})
    const big = t.bridge.stream('claim.month', { from: '2026-10-01', to: '2026-10-31' })
    const save = t.bridge.send('store.save', '{}')
    const input = t.bridge.send('bit.input', '{"items":[]}')
    t.port.reply({ v: 1, id: 'req-3', type: 'chunk', seq: 0, data: PATIENT_JSON_PART1 })
    t.drop(t.port)
    expect(await rejectCode(small)).toBe('E-BRIDGE-DISCONNECTED')
    expect(await rejectCode(big)).toBe('E-BRIDGE-DISCONNECTED')
    expect(await rejectCode(save)).toBe('E-BRIDGE-DISCONNECTED')
    expect(await rejectCode(input)).toBe('E-BRIDGE-DISCONNECTED')
    expect(t.calls).toEqual([
      ['chunk', 'req-3', 0, PATIENT_JSON_PART1],
      ['abort', 'req-3', 'E-BRIDGE-DISCONNECTED'],
      ['abort', 'req-5', 'E-BRIDGE-DISCONNECTED'],
    ])
    expect(t.bridge.state()).toBe('disconnected')
  })

  it('AC-004.7 끊긴 뒤의 요청은 보내지 않고 E-BRIDGE-DISCONNECTED', async () => {
    const t = await ready()
    t.drop(t.port)
    expect(await rejectCode(t.bridge.call('bit.check', {}))).toBe('E-BRIDGE-DISCONNECTED')
    expect(await rejectCode(t.bridge.hello())).toBe('E-BRIDGE-DISCONNECTED')
    expect(await rejectCode(t.bridge.send('store.save', '{}'))).toBe('E-BRIDGE-DISCONNECTED')
  })

  it('AC-004.7 ready 뒤에 lastError로 끊겨도 no-extension이 아니라 disconnected', async () => {
    const t = await ready()
    t.drop(t.port, 'Extension context invalidated.')
    expect(t.bridge.state()).toBe('disconnected')
  })

  it('AC-004.7 close()는 Port를 끊고 기다리던 요청을 같은 방법으로 끝낸다', async () => {
    const t = await ready()
    const big = t.bridge.stream('claim.memos', { from: '2026-10-01', to: '2026-10-31' })
    t.bridge.close()
    expect(t.port.disconnected).toBe(true)
    expect(await rejectCode(big)).toBe('E-BRIDGE-DISCONNECTED')
    expect(t.calls).toEqual([['abort', 'req-2', 'E-BRIDGE-DISCONNECTED']])
    expect(t.bridge.state()).toBe('disconnected')
  })

  it('AC-004.7 Port에 보내다 던지면(이미 끊김) 그 요청은 E-BRIDGE-DISCONNECTED', async () => {
    const t = await ready()
    t.port.disconnected = true
    expect(await rejectCode(t.bridge.stream('sam.latest', {}))).toBe('E-BRIDGE-DISCONNECTED')
    expect(t.calls).toEqual([['abort', 'req-2', 'E-BRIDGE-DISCONNECTED']])
    expect(t.bridge.state()).toBe('disconnected')
  })
})

describe('AC-004.9 send: Worker가 만든 글자를 그대로 봉투에', () => {
  const PAYLOAD = '{"items":[{"visitKey":"v1","chart":"000123","name":"가상환자01","date":"2026-10-01","memo":"가짜"}]}'

  it('AC-004.9 payload를 풀거나 고치지 않고 {v: 1, id, cmd, args: {payload}}에 글자 그대로 넣는다', async () => {
    const t = await ready()
    const parse = vi.spyOn(JSON, 'parse')
    const stringify = vi.spyOn(JSON, 'stringify')
    void t.bridge.send('bit.input', PAYLOAD)
    const parsed = parse.mock.calls.length
    const stringified = stringify.mock.calls.length
    vi.restoreAllMocks()
    expect(parsed).toBe(0)
    expect(stringified).toBe(0)
    const sent = t.port.last()
    expect(sent).toEqual({ v: 1, id: 'req-2', cmd: 'bit.input', args: { payload: PAYLOAD } })
    expect(Object.keys(sent).sort()).toEqual(['args', 'cmd', 'id', 'v'])
    expect((sent.args as { payload: string }).payload).toBe(PAYLOAD)
  })

  it('AC-004.9 JSON이 아닌 글자도 풀지 않으니 그대로 넘긴다(검사는 도우미가 한다)', async () => {
    const t = await ready()
    void t.bridge.send('store.save', '{"month":')
    expect(t.port.last().args).toEqual({ payload: '{"month":' })
  })

  it.each([
    ['claim.month', '{}'],
    ['hello', '{}'],
    ['bit.check', '{}'],
    ['nope', '{}'],
    ['store.save', { month: '2026-10' }],
    ['bit.input', undefined],
    ['bit.input', 5],
  ])('AC-004.9 send(%s, %j)는 보내지 않고 E-BRIDGE-REJECTED', async (cmd, payload) => {
    const t = await ready()
    const before = t.port.sent.length
    const bridge = t.bridge as unknown as { send(c: string, p: unknown): Promise<unknown> }
    expect(await rejectCode(bridge.send(cmd, payload))).toBe('E-BRIDGE-REJECTED')
    expect(t.port.sent.length).toBe(before)
  })

  it('AC-004.9 bit.input은 결과 조각을 sink로 넘기고 {id, count}로 끝난다', async () => {
    const t = await ready()
    const p = t.bridge.send('bit.input', PAYLOAD)
    t.port.reply({ v: 1, id: 'req-2', type: 'progress', done: 0, total: 1 })
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: '[{"visitKey":"v1","result":"입력함"}]' })
    t.port.reply({ v: 1, id: 'req-2', type: 'progress', done: 1, total: 1 })
    t.port.reply({ v: 1, id: 'req-2', type: 'end', count: 1, bytes: 40, sha256: SHA })
    await expect(p).resolves.toEqual({ id: 'req-2', count: 1 })
    expect(t.calls).toEqual([
      ['chunk', 'req-2', 0, '[{"visitKey":"v1","result":"입력함"}]'],
      ['end', 'req-2', 1, 40, SHA],
    ])
  })

  it('AC-004.9 bit.input에 result가 오면 E-BRIDGE-BAD-REPLY이고 sink.abort', async () => {
    const t = await ready()
    const p = t.bridge.send('bit.input', PAYLOAD)
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { saved: true } })
    expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
    expect(t.calls).toEqual([['abort', 'req-2', 'E-BRIDGE-BAD-REPLY']])
  })
})

describe('AC-004.10 bit.input 진행 숫자', () => {
  it('AC-004.10 {v, id, type, done, total}이고 0 ≤ done ≤ total ≤ 500 정수면 onProgress({id, done, total})', async () => {
    const t = await ready()
    const seen: unknown[] = []
    t.bridge.onProgress((p) => seen.push(p))
    void t.bridge.send('bit.input', '{}')
    t.port.reply({ v: 1, id: 'req-2', type: 'progress', done: 0, total: 500 })
    t.port.reply({ v: 1, id: 'req-2', type: 'progress', done: 500, total: 500 })
    expect(seen).toEqual([
      { id: 'req-2', done: 0, total: 500 },
      { id: 'req-2', done: 500, total: 500 },
    ])
  })

  it('AC-004.10 onProgress가 돌려준 함수로 그만 듣는다', async () => {
    const t = await ready()
    const seen: unknown[] = []
    const off = t.bridge.onProgress((p) => seen.push(p))
    void t.bridge.send('bit.input', '{}')
    off()
    t.port.reply({ v: 1, id: 'req-2', type: 'progress', done: 1, total: 2 })
    expect(seen).toEqual([])
  })

  it.each([
    { done: 1, total: 2, name: '가상환자01' },
    { done: 3, total: 2 },
    { done: -1, total: 2 },
    { done: 1.5, total: 2 },
    { done: '1', total: 2 },
    { done: 1, total: 501 },
    { done: 1 },
    { done: Number.NaN, total: 2 },
  ])('AC-004.10 틀린 진행 %j은 E-BRIDGE-BAD-REPLY로 그 요청을 끝내고 sink.abort', async (fields) => {
    const t = await ready()
    const seen: unknown[] = []
    t.bridge.onProgress((p) => seen.push(p))
    const p = t.bridge.send('bit.input', '{}')
    t.port.reply({ v: 1, id: 'req-2', type: 'progress', ...fields })
    expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
    expect(seen).toEqual([])
    expect(t.calls).toEqual([['abort', 'req-2', 'E-BRIDGE-BAD-REPLY']])
  })

  it('AC-004.10 bit.input이 아닌 환자 자료 요청에 progress가 오면 E-BRIDGE-BAD-REPLY, sink.abort', async () => {
    const t = await ready()
    const seen: unknown[] = []
    t.bridge.onProgress((p) => seen.push(p))
    const p = t.bridge.stream('claim.month', { from: '2026-10-01', to: '2026-10-31' })
    t.port.reply({ v: 1, id: 'req-2', type: 'progress', done: 0, total: 1 })
    expect(await rejectCode(p)).toBe('E-BRIDGE-BAD-REPLY')
    expect(seen).toEqual([])
    expect(t.calls).toEqual([['abort', 'req-2', 'E-BRIDGE-BAD-REPLY']])
  })

  it('AC-004.10 숫자 명령·store.save에 progress가 와도 E-BRIDGE-BAD-REPLY', async () => {
    const t = await ready()
    const seen: unknown[] = []
    t.bridge.onProgress((p) => seen.push(p))
    const p1 = t.bridge.call('bit.register', {})
    t.port.reply({ v: 1, id: 'req-2', type: 'progress', done: 0, total: 1 })
    expect(await rejectCode(p1)).toBe('E-BRIDGE-BAD-REPLY')
    const p2 = t.bridge.send('store.save', '{}')
    t.port.reply({ v: 1, id: 'req-3', type: 'progress', done: 0, total: 1 })
    expect(await rejectCode(p2)).toBe('E-BRIDGE-BAD-REPLY')
    expect(seen).toEqual([])
  })
})
