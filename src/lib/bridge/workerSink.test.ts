import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { Bridge, ChromeRuntimeLike, PortLike } from '@/types/bridge'
import { connectScreenBridge, type ScreenBridge, type WorkerLike } from './workerSink'

// 확장 쪽 가짜 Port(client.test.ts와 같은 모양)
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
}

const SHA = 'b'.repeat(64)
const HELLO_DATA = { helperVersion: '0.2.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }
const FAKE_NAME = '가상환자01'
const CHUNK_0 = `{"visits":[{"chart":"000123","name":"${FAKE_NAME.slice(0, 3)}`
const CHUNK_1 = `${FAKE_NAME.slice(3)}","memo":"가짜"}]}`
const SAVE_PAYLOAD = `{"month":"2026-10","drafts":{"v1":{"name":"${FAKE_NAME}","memo":"가짜 메모"}}}`
const INPUT_PAYLOAD = `{"items":[{"visitKey":"v1","chart":"000123","name":"${FAKE_NAME}","date":"2026-10-01","memo":"가짜"}]}`

const opened: MessagePort[] = []

afterEach(() => {
  for (const port of opened.splice(0)) port.close()
})

// 가짜 Worker: workerSink가 넘긴 포트를 시험이 쥐고, Worker 쪽에 온 메시지를 모은다
function fakeWorker() {
  const posted: { message: unknown; transfer: Transferable[] }[] = []
  const inbox: Record<string, unknown>[] = []
  let port: MessagePort | undefined
  const worker: WorkerLike = {
    postMessage(message, transfer) {
      posted.push({ message, transfer })
      port = transfer[0] as MessagePort
      opened.push(port)
      port.onmessage = (e: MessageEvent) => void inbox.push(e.data as Record<string, unknown>)
    },
  }
  const toBridge = (m: unknown) => port!.postMessage(m)
  return { worker, posted, inbox, toBridge }
}

function setup(withWorker = true) {
  const ports: FakePort[] = []
  const runtime: ChromeRuntimeLike = {
    connect() {
      const p = new FakePort()
      ports.push(p)
      return p
    },
  }
  const w = fakeWorker()
  let n = 0
  const screen = connectScreenBridge({ runtime, worker: withWorker ? w.worker : undefined, newId: () => `req-${++n}` })
  // 화면 쪽에 온 것은 모두 여기에 모은다(콜백 인자·약속 값·거절 값)
  const seenByScreen: unknown[] = []
  screen.onState((s) => seenByScreen.push(s))
  screen.onProgress((p) => seenByScreen.push(p))
  const track = <T>(p: Promise<T>) =>
    p.then(
      (v) => {
        seenByScreen.push(v)
        return v
      },
      (e: unknown) => {
        seenByScreen.push(e, (e as { code?: unknown }).code, (e as { message?: unknown }).message)
        throw e
      },
    )
  return { screen, port: ports[0], ...w, seenByScreen, track }
}

async function ready(withWorker = true) {
  const t = setup(withWorker)
  const hello = t.track(t.screen.hello())
  t.port.reply({ v: 1, id: 'req-1', type: 'result', data: HELLO_DATA })
  await hello
  return t
}

describe('AC-004.11 화면 입구 connectScreenBridge: 조각·보낼 글자는 Worker 전용 포트로만', () => {
  it('AC-004.11 MessageChannel 포트 하나를 Worker에 한 번 넘긴다({type: bridge-port})', async () => {
    const t = await ready()
    expect(t.posted).toHaveLength(1)
    expect(t.posted[0].message).toEqual({ type: 'bridge-port' })
    expect(t.posted[0].transfer).toHaveLength(1)
    expect(t.posted[0].transfer[0]).toBeInstanceOf(MessagePort)
  })

  it('AC-004.11 환자 자료 조각·end는 포트로만 가고 화면에는 {id, count}만 간다', async () => {
    const t = await ready()
    const p = t.track(t.screen.stream('claim.month', { from: '2026-10-01', to: '2026-10-31' }))
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: CHUNK_0 })
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 1, data: CHUNK_1 })
    t.port.reply({ v: 1, id: 'req-2', type: 'end', count: 2, bytes: 90, sha256: SHA })
    await expect(p).resolves.toEqual({ id: 'req-2', count: 2 })
    await vi.waitFor(() => expect(t.inbox).toHaveLength(3))
    expect(t.inbox).toEqual([
      { type: 'chunk', id: 'req-2', seq: 0, data: CHUNK_0 },
      { type: 'chunk', id: 'req-2', seq: 1, data: CHUNK_1 },
      { type: 'end', id: 'req-2', count: 2, bytes: 90, sha256: SHA },
    ])
    expect(JSON.stringify(t.seenByScreen)).not.toContain(FAKE_NAME)
    expect(JSON.stringify(t.seenByScreen)).not.toContain(CHUNK_0)
  })

  it('AC-004.11 도우미 오류·끊김이면 포트로 {type: abort, id, code}를 보내고 화면에는 번호만', async () => {
    const t = await ready()
    const p = t.track(t.screen.stream('claim.memos', { from: '2026-10-01', to: '2026-10-31' }))
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: CHUNK_0 })
    t.port.reply({ v: 1, id: 'req-2', type: 'error', code: 'E-BIT-READ-FAILED' })
    await expect(p).rejects.toMatchObject({ code: 'E-BIT-READ-FAILED' })
    await vi.waitFor(() => expect(t.inbox).toHaveLength(2))
    expect(t.inbox[1]).toEqual({ type: 'abort', id: 'req-2', code: 'E-BIT-READ-FAILED' })
    expect(JSON.stringify(t.seenByScreen)).not.toContain(FAKE_NAME)
  })

  it('AC-004.11·AC-004.9 Worker가 보낸 store.save 글자는 봉투 args.payload에 글자 그대로, 결과는 포트로 sent', async () => {
    const t = await ready()
    t.toBridge({ type: 'send', ticket: 't1', cmd: 'store.save', payload: SAVE_PAYLOAD })
    await vi.waitFor(() => expect(t.port.sent).toHaveLength(2))
    const sent = t.port.last()
    expect(sent).toEqual({ v: 1, id: 'req-2', cmd: 'store.save', args: { payload: SAVE_PAYLOAD } })
    expect((sent.args as { payload: string }).payload).toBe(SAVE_PAYLOAD)
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { saved: true } })
    await vi.waitFor(() => expect(t.inbox).toHaveLength(1))
    expect(t.inbox[0]).toEqual({ type: 'sent', ticket: 't1', ok: true })
    expect(JSON.stringify(t.seenByScreen)).not.toContain(FAKE_NAME)
  })

  it('AC-004.11·AC-004.10 Worker가 보낸 bit.input: 진행 숫자는 화면에, 결과 조각은 포트로, 끝은 sent {id, count}', async () => {
    const t = await ready()
    t.toBridge({ type: 'send', ticket: 7, cmd: 'bit.input', payload: INPUT_PAYLOAD })
    await vi.waitFor(() => expect(t.port.sent).toHaveLength(2))
    expect(t.port.last()).toEqual({ v: 1, id: 'req-2', cmd: 'bit.input', args: { payload: INPUT_PAYLOAD } })
    const result = `[{"visitKey":"v1","name":"${FAKE_NAME}","result":"입력함"}]`
    t.port.reply({ v: 1, id: 'req-2', type: 'progress', done: 0, total: 1 })
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: result })
    t.port.reply({ v: 1, id: 'req-2', type: 'progress', done: 1, total: 1 })
    t.port.reply({ v: 1, id: 'req-2', type: 'end', count: 1, bytes: 60, sha256: SHA })
    await vi.waitFor(() => expect(t.inbox).toHaveLength(3))
    expect(t.inbox).toEqual([
      { type: 'chunk', id: 'req-2', seq: 0, data: result },
      { type: 'end', id: 'req-2', count: 1, bytes: 60, sha256: SHA },
      { type: 'sent', ticket: 7, ok: true, id: 'req-2', count: 1 },
    ])
    expect(t.seenByScreen).toContainEqual({ id: 'req-2', done: 0, total: 1 })
    expect(t.seenByScreen).toContainEqual({ id: 'req-2', done: 1, total: 1 })
    expect(JSON.stringify(t.seenByScreen)).not.toContain(FAKE_NAME)
  })

  it.each([
    { type: 'send', ticket: 't2', cmd: 'claim.month', payload: '{}' },
    { type: 'send', ticket: 't2', cmd: 'hello', payload: '{}' },
    { type: 'send', ticket: 't2', cmd: 'store.save', payload: { name: FAKE_NAME } },
  ])('AC-004.11·AC-004.9 Worker의 틀린 send %j는 보내지 않고 sent {ok: false, E-BRIDGE-REJECTED}', async (msg) => {
    const t = await ready()
    t.toBridge(msg)
    await vi.waitFor(() => expect(t.inbox).toHaveLength(1))
    expect(t.inbox[0]).toEqual({ type: 'sent', ticket: 't2', ok: false, code: 'E-BRIDGE-REJECTED' })
    expect(t.port.sent).toHaveLength(1)
  })

  it('AC-004.11 store.save가 실패하면 sent {ok: false, code}로 번호만 돌려준다', async () => {
    const t = await ready()
    t.toBridge({ type: 'send', ticket: 't3', cmd: 'store.save', payload: SAVE_PAYLOAD })
    await vi.waitFor(() => expect(t.port.sent).toHaveLength(2))
    t.port.reply({ v: 1, id: 'req-2', type: 'error', code: 'E-STORE-FAILED' })
    await vi.waitFor(() => expect(t.inbox).toHaveLength(1))
    expect(t.inbox[0]).toEqual({ type: 'sent', ticket: 't3', ok: false, code: 'E-STORE-FAILED' })
  })

  it('AC-004.11 표 모양이 아닌 Worker 메시지(ticket 없음 등)는 버린다', async () => {
    const t = await ready()
    t.toBridge({ type: 'send', cmd: 'store.save', payload: SAVE_PAYLOAD })
    t.toBridge({ type: 'other' })
    t.toBridge('x')
    // 뒤에 보낸 맞는 요청만 처리된다(메시지 순서는 지켜진다)
    t.toBridge({ type: 'send', ticket: 't4', cmd: 'store.save', payload: SAVE_PAYLOAD })
    await vi.waitFor(() => expect(t.port.sent).toHaveLength(2))
    expect(t.inbox).toEqual([])
  })

  it('AC-004.11 화면 쪽 ScreenBridge에는 send가 없다(타입·값 모두)', async () => {
    const t = await ready()
    expect('send' in t.screen).toBe(false)
    expectTypeOf<ScreenBridge>().not.toHaveProperty('send')
    expectTypeOf<ScreenBridge>().toEqualTypeOf<Omit<Bridge, 'send'>>()
  })

  it('AC-004.11 화면이 받는 숫자·상태 명령 답은 검사한 답이다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('claim.dates', { from: '2026-10-01', to: '2026-10-02' }))
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { days: [{ date: '2026-10-01', visits: 3, memoInBit: 1 }] } })
    await expect(p).resolves.toEqual({ days: [{ date: '2026-10-01', visits: 3, memoInBit: 1 }] })
    const bad = t.track(t.screen.call('claim.dates', { from: '2026-10-01', to: '2026-10-02' }))
    t.port.reply({ v: 1, id: 'req-3', type: 'result', data: { days: [{ date: '2026-10-01', visits: 3, memoInBit: 1, name: FAKE_NAME }] } })
    await expect(bad).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
    expect(JSON.stringify(t.seenByScreen)).not.toContain(FAKE_NAME)
  })

  it('AC-004.11 worker가 없으면(설치 화면) 조각은 울타리 안에서 버리고 화면에는 {id, count}만', async () => {
    const t = await ready(false)
    expect(t.posted).toEqual([])
    const p = t.track(t.screen.stream('sam.latest', {}))
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: CHUNK_0 })
    t.port.reply({ v: 1, id: 'req-2', type: 'end', count: 1, bytes: 10, sha256: SHA })
    await expect(p).resolves.toEqual({ id: 'req-2', count: 1 })
    expect(JSON.stringify(t.seenByScreen)).not.toContain(FAKE_NAME)
  })

  it('AC-004.11 close()는 확장 연결과 Worker 포트를 함께 닫는다', async () => {
    const t = await ready()
    t.screen.close()
    expect(t.port.disconnected).toBe(true)
    expect(t.screen.state()).toBe('disconnected')
  })
})
