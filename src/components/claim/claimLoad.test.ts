import { afterEach, describe, expect, it, vi } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import type { CheckSettings, ClaimView, PrecheckFromScreen, PrecheckToScreen } from '@/types/precheck'
import { claimChannel, runClaimCheck, runClaimExcel, runClaimLoad, type KeptClaim, type LoadStep } from './claimLoad'

// 화면이 Worker에 보내는 차례(약속 전문: types/precheck.ts PrecheckFromScreen, design.md 6-2). 가짜 통로·가짜 Worker로 본다

type Listener = (event: Event) => void

function fakeWorker() {
  const listeners = new Map<string, Set<Listener>>()
  const posted: PrecheckFromScreen[] = []
  const log: string[] = []
  return {
    posted,
    log,
    postMessage(message: unknown) {
      posted.push(message as PrecheckFromScreen)
      log.push(`post ${(message as { type: string }).type}`)
    },
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    emit(data: PrecheckToScreen) {
      for (const fn of listeners.get('message') ?? []) fn({ data } as unknown as Event)
    },
    fire(type: 'error' | 'messageerror') {
      for (const fn of listeners.get(type) ?? []) fn(new Event(type))
    },
  }
}
type Fake = ReturnType<typeof fakeWorker>

/** 부를 때마다 약속을 하나 만들어 시험이 끝낸다 */
function fakeStream(worker: Fake) {
  const calls: { cmd: string; args: unknown; resolve(id: string): void; reject(code: string): void }[] = []
  const stream = vi.fn((cmd: string, args: unknown) => {
    worker.log.push(`stream ${cmd}`)
    return new Promise<{ id: string; count: number }>((resolve, reject) => {
      calls.push({ cmd, args, resolve: (id) => resolve({ id, count: 1 }), reject: (code) => reject(new BridgeError(code)) })
    })
  })
  return { stream: stream as unknown as Parameters<typeof runClaimLoad>[1], calls }
}

const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}
const DAY = { from: '2026-10-28', to: '2026-10-28' }
const SETTINGS: CheckSettings = { rules: { schema: 1, off: [], on: [], grade: [] }, phrases: null, dxLinks: [] }
const VIEW = { visits: [] } as unknown as ClaimView

/** 불러오기를 시작하고 차례대로 답을 줄 도구 */
function start(worker = fakeWorker(), visible = DAY) {
  const channel = claimChannel(worker)
  const { stream, calls } = fakeStream(worker)
  const steps: LoadStep[] = []
  const result = runClaimLoad(channel, stream, visible, (step) => steps.push(step))
  return { worker, channel, stream, calls, steps, result }
}
const posted = (worker: Fake, type: string) => worker.posted.filter((m) => m.type === type)
const monthOk = (id: string, load: number): PrecheckToScreen => ({ type: 'month', id, load, ok: true, visits: 3, months: ['2026-10'] })
const partOk = (part: 'memos' | 'store', id: string, load: number): PrecheckToScreen => ({ type: 'loadPart', part, id, load, ok: true })

describe('AC-013.12 번호는 Worker 하나에 하나', () => {
  it('AC-013.12: 같은 Worker면 같은 번호 칸이라 화면을 다시 그려도 번호가 되풀이되지 않는다', () => {
    const worker = fakeWorker()
    const first = claimChannel(worker).startLoad()
    const again = claimChannel(worker).startLoad()
    expect(claimChannel(worker)).toBe(claimChannel(worker))
    expect(again).toBeGreaterThan(first)
    expect(worker.posted).toEqual([
      { type: 'loadStart', load: first },
      { type: 'loadStart', load: again },
    ])
  })

  it('AC-013.12: 다른 Worker는 따로 센다', () => {
    const a = claimChannel(fakeWorker()).startLoad()
    const b = claimChannel(fakeWorker()).startLoad()
    expect(a).toBe(b)
  })

  it('AC-013.12: load는 1씩 오른다', () => {
    const channel = claimChannel(fakeWorker())
    const first = channel.startLoad()
    expect(channel.startLoad()).toBe(first + 1)
  })
})

describe('AC-013.10 claim.month 차례', () => {
  it('AC-013.10: loadStart가 stream(claim.month) 바로 앞에 간다. 읽는 기간은 AC-013.13이다', async () => {
    const { worker, calls } = start()
    expect(worker.log).toEqual(['post loadStart', 'stream claim.month'])
    expect(calls[0].args).toEqual({ from: '2026-09-28', to: '2026-10-28' })
    await tick()
    expect(posted(worker, 'month')).toEqual([])
  })

  it('AC-013.10: stream이 끝나면 id와 번호로 month를 보낸다', async () => {
    const { worker, calls } = start()
    calls[0].resolve('m1')
    await tick()
    expect(posted(worker, 'month')).toEqual([{ type: 'month', id: 'm1', load: 1 }])
  })

  it('AC-013.10: stream 거절이면 month를 보내지 않고 그 번호로 실패한다', async () => {
    const { worker, calls, result } = start()
    calls[0].reject('E-BIT-READ-FAILED')
    await expect(result).resolves.toEqual({ status: 'failed', code: 'E-BIT-READ-FAILED' })
    expect(posted(worker, 'month')).toEqual([])
  })

  it('AC-013.10: BridgeError가 아닌 거절은 원래 글 없이 E-BRIDGE-REJECTED다', async () => {
    const worker = fakeWorker()
    const stream = (() => Promise.reject(new Error('환자 글자'))) as unknown as Parameters<typeof runClaimLoad>[1]
    await expect(runClaimLoad(claimChannel(worker), stream, DAY)).resolves.toEqual({ status: 'failed', code: 'E-BRIDGE-REJECTED' })
  })

  it('AC-013.10: 옛 번호의 거절은 보이지 않고 버린다', async () => {
    const worker = fakeWorker()
    const first = start(worker)
    const second = start(worker)
    first.calls[0].reject('E-BIT-READ-FAILED')
    await expect(first.result).resolves.toEqual({ status: 'replaced' })
    second.calls[0].reject('E-BIT-READ-FAILED')
    await expect(second.result).resolves.toEqual({ status: 'failed', code: 'E-BIT-READ-FAILED' })
  })

  it('AC-013.10: 불러오기 둘이 겹쳐도 옛 stream이 끝나면 month를 보내(글자를 찾아 가게) 하고 옛 답으로 점검으로 가지 않는다', async () => {
    const worker = fakeWorker()
    const first = start(worker)
    const second = start(worker)
    first.calls[0].resolve('old')
    await tick()
    expect(posted(worker, 'month')).toEqual([{ type: 'month', id: 'old', load: 1 }])
    worker.emit(monthOk('old', 1))
    await expect(first.result).resolves.toEqual({ status: 'replaced' })
    expect(first.calls.map((c) => c.cmd)).toEqual(['claim.month'])
    expect(second.calls.map((c) => c.cmd)).toEqual(['claim.month'])
  })

  it('AC-013.10: 답의 load가 마지막 번호와 다르면 ok와 상관없이 버린다(id로 견주지 않는다)', async () => {
    const worker = fakeWorker()
    const first = start(worker)
    const second = start(worker)
    second.calls[0].resolve('new')
    await tick()
    // 옛 번호의 ok:true가 먼저 와도 새 불러오기는 그대로 기다린다
    worker.emit({ type: 'month', id: 'new', load: 1, ok: true, visits: 1, months: [] })
    await tick()
    expect(second.calls.map((c) => c.cmd)).toEqual(['claim.month'])
    worker.emit(monthOk('new', 2))
    await tick()
    expect(second.calls.map((c) => c.cmd)).toEqual(['claim.month', 'claim.memos'])
    void first
  })

  it('AC-013.10: SHA-256이 달라 month가 ok:false면 stream이 끝났어도 점검으로 가지 않는다', async () => {
    const { worker, calls, result } = start()
    calls[0].resolve('m1')
    await tick()
    worker.emit({ type: 'month', id: 'm1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
    await expect(result).resolves.toEqual({ status: 'failed', code: 'E-CLAIM-PARTIAL' })
    expect(calls.map((c) => c.cmd)).toEqual(['claim.month'])
  })

  it('AC-013.10: partial로 판단하지 않는다', async () => {
    const { worker, calls, result } = start()
    calls[0].resolve('m1')
    await tick()
    worker.emit({ type: 'partial', id: 'm1', code: 'E-CLAIM-PARTIAL' })
    await tick()
    worker.emit(monthOk('m1', 1))
    await tick()
    expect(calls.map((c) => c.cmd)).toEqual(['claim.month', 'claim.memos'])
    for (const index of [1, 2, 3]) {
      calls[index].reject('E-HELPER-UNKNOWN-COMMAND')
      await tick()
    }
    await expect(result).resolves.toMatchObject({ status: 'ok' })
  })
})

describe('AC-013.11 claim.memos·store.load 차례', () => {
  async function toMemos() {
    const made = start()
    made.calls[0].resolve('m1')
    await tick()
    made.worker.emit(monthOk('m1', 1))
    await tick()
    return made
  }

  it('AC-013.11·AC-013.13: 고른 기간으로 두 자료를 부르고 끝난 id마다 loadPart로 물어 ok:true를 받아야 끝난다', async () => {
    const { worker, calls, steps, result } = await toMemos()
    expect(calls[1]).toMatchObject({ cmd: 'claim.memos', args: DAY })
    calls[1].resolve('memos1')
    await tick()
    expect(posted(worker, 'loadPart')).toEqual([{ type: 'loadPart', part: 'memos', id: 'memos1', load: 1 }])
    worker.emit(partOk('memos', 'memos1', 1))
    await tick()
    expect(calls[2]).toMatchObject({ cmd: 'store.load', args: { months: ['2026-10'] } })
    calls[2].resolve('store1')
    await tick()
    expect(posted(worker, 'loadPart')[1]).toEqual({ type: 'loadPart', part: 'store', id: 'store1', load: 1 })
    worker.emit(partOk('store', 'store1', 1))
    await tick()
    expect(calls[3]).toMatchObject({ cmd: 'store.load', args: { settings: true } })
    calls[3].resolve('copy1')
    await tick()
    expect(posted(worker, 'loadPart')[2]).toEqual({ type: 'loadPart', part: 'store', id: 'copy1', load: 1 })
    worker.emit(partOk('store', 'copy1', 1))
    await expect(result).resolves.toEqual({ status: 'ok', load: 1 })
    expect(steps).toEqual(['month', 'memos', 'store'])
  })

  /** 달 저장까지 끝내 설정 사본 호출 앞에 선다 */
  async function toCopy() {
    const made = await toMemos()
    made.calls[1].resolve('memos1')
    await tick()
    made.worker.emit(partOk('memos', 'memos1', 1))
    await tick()
    made.calls[2].resolve('store1')
    await tick()
    made.worker.emit(partOk('store', 'store1', 1))
    await tick()
    return made
  }

  it('AC-013.9: store.load 한 호출에 달과 설정 사본이 함께 없다(도우미는 파일 하나만 막혀도 호출 전체를 같은 번호로 거절한다)', async () => {
    const { calls } = await toCopy()
    const stores = calls.filter((call) => call.cmd === 'store.load').map((call) => call.args as Record<string, unknown>)
    expect(stores).toEqual([{ months: ['2026-10'] }, { settings: true }])
    for (const args of stores) {
      expect('months' in args && ('settings' in args || 'contact' in args)).toBe(false)
    }
  })

  it('AC-013.9: 설정 사본 호출이 E-BIT-HOSPITAL-MISMATCH면 사본 없이 계속한다(달 자료는 받아 두었다)', async () => {
    const { calls, result } = await toCopy()
    calls[3].reject('E-BIT-HOSPITAL-MISMATCH')
    await expect(result).resolves.toEqual({ status: 'ok', load: 1 })
  })

  it('AC-013.2: 설정 사본 호출이 E-HELPER-UNKNOWN-COMMAND면 사본 없이 계속한다', async () => {
    const { calls, result } = await toCopy()
    calls[3].reject('E-HELPER-UNKNOWN-COMMAND')
    await expect(result).resolves.toEqual({ status: 'ok', load: 1 })
  })

  it('AC-013.11: 설정 사본 호출의 다른 번호는 멈춘다', async () => {
    const { calls, result } = await toCopy()
    calls[3].reject('E-STORE-BROKEN')
    await expect(result).resolves.toEqual({ status: 'failed', code: 'E-STORE-BROKEN' })
  })

  it('AC-013.2·AC-013.11: 달 호출의 E-BIT-HOSPITAL-MISMATCH는 멈춘다(저장 막힘 안내는 TASK-18의 AC-018.17). 설정 사본을 묻지 않는다', async () => {
    const { calls, worker, result } = await toMemos()
    calls[1].resolve('memos1')
    await tick()
    worker.emit(partOk('memos', 'memos1', 1))
    await tick()
    calls[2].reject('E-BIT-HOSPITAL-MISMATCH')
    await expect(result).resolves.toEqual({ status: 'failed', code: 'E-BIT-HOSPITAL-MISMATCH', stuckMonth: true })
    expect(calls.map((call) => call.cmd)).toEqual(['claim.month', 'claim.memos', 'store.load'])
  })

  it('AC-013.11: 설정 사본 호출의 옛 번호 거절은 버린다', async () => {
    const { channel, calls, result } = await toCopy()
    channel.startLoad()
    calls[3].reject('E-STORE-BROKEN')
    await expect(result).resolves.toEqual({ status: 'replaced' })
  })

  it('AC-013.11: stream이 끝난 것만으로는 끝나지 않는다', async () => {
    const { calls, result } = await toMemos()
    calls[1].resolve('memos1')
    await tick()
    let done = false
    void result.then(() => (done = true))
    await tick()
    expect(done).toBe(false)
  })

  it.each(['memos', 'store'] as const)('AC-013.11: %s 답이 ok:false면 멈춘다', async (part) => {
    const { worker, calls, result } = await toMemos()
    calls[1].resolve('memos1')
    await tick()
    if (part === 'memos') {
      worker.emit({ type: 'loadPart', part, id: 'memos1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
    } else {
      worker.emit(partOk('memos', 'memos1', 1))
      await tick()
      calls[2].resolve('store1')
      await tick()
      worker.emit({ type: 'loadPart', part, id: 'store1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
    }
    await expect(result).resolves.toEqual({ status: 'failed', code: 'E-CLAIM-PARTIAL' })
  })

  it('AC-013.2: E-HELPER-UNKNOWN-COMMAND면 그 자료 없이 계속한다(loadPart를 보내지 않는다)', async () => {
    const { worker, calls, result } = await toMemos()
    for (const index of [1, 2, 3]) {
      calls[index].reject('E-HELPER-UNKNOWN-COMMAND')
      await tick()
    }
    await expect(result).resolves.toEqual({ status: 'ok', load: 1 })
    expect(posted(worker, 'loadPart')).toEqual([])
  })

  it('AC-013.2·AC-013.11: 다른 번호의 거절은 멈춘다', async () => {
    const { calls, result } = await toMemos()
    calls[1].reject('E-BIT-READ-FAILED')
    await expect(result).resolves.toEqual({ status: 'failed', code: 'E-BIT-READ-FAILED' })
    expect(calls.map((c) => c.cmd)).toEqual(['claim.month', 'claim.memos'])
  })

  it('AC-013.11: 옛 번호의 거절은 버린다', async () => {
    const { channel, calls, result } = await toMemos()
    channel.startLoad()
    calls[1].reject('E-BIT-READ-FAILED')
    await expect(result).resolves.toEqual({ status: 'replaced' })
  })

  it('AC-013.11: 옛 불러오기도 끝난 id는 loadPart로 찾아 가게 보낸다', async () => {
    const { worker, channel, calls, result } = await toMemos()
    channel.startLoad()
    calls[1].resolve('memos1')
    await tick()
    expect(posted(worker, 'loadPart')).toEqual([{ type: 'loadPart', part: 'memos', id: 'memos1', load: 1 }])
    worker.emit({ type: 'loadPart', part: 'memos', id: 'memos1', load: 1, ok: false, code: 'E-CLAIM-PARTIAL' })
    await expect(result).resolves.toEqual({ status: 'replaced' })
    expect(calls.map((c) => c.cmd)).toEqual(['claim.month', 'claim.memos'])
  })

  it('AC-016.7: run을 실은 다시 불러오기 답은 이 불러오기의 답으로 치지 않는다', async () => {
    const { worker, calls } = await toMemos()
    calls[1].resolve('memos1')
    await tick()
    worker.emit({ type: 'loadPart', part: 'memos', id: 'other', load: 1, run: 5, ok: false, code: 'E-CLAIM-PARTIAL' })
    await tick()
    worker.emit(partOk('memos', 'memos1', 1))
    await tick()
    expect(calls.map((c) => c.cmd)).toEqual(['claim.month', 'claim.memos', 'store.load'])
  })
})

describe('Worker가 죽어도 화면이 기다리다 멈추지 않는다', () => {
  it.each(['error', 'messageerror'] as const)('%s면 기다리던 답을 E-CLAIM-PARTIAL로 끝낸다', async (type) => {
    const { worker, calls, result } = start()
    calls[0].resolve('m1')
    await tick()
    worker.fire(type)
    await expect(result).resolves.toEqual({ status: 'failed', code: 'E-CLAIM-PARTIAL' })
  })

  it('AC-013.4: 기다리는 답이 없을 때 error가 와도(Worker가 시작하지 못함) 다음 엑셀은 보내지 않고 바로 실패한다', async () => {
    const worker = fakeWorker()
    const channel = claimChannel(worker)
    worker.fire('error')
    await expect(runClaimExcel(channel, 7)).resolves.toEqual({ ok: false, code: 'E-CLAIM-PARTIAL' })
    expect(posted(worker, 'excel')).toEqual([])
  })

  it('AC-013.2: 그 뒤 불러오기도 Worker 답을 기다리다 멈추지 않고 번호로 실패한다', async () => {
    const worker = fakeWorker()
    claimChannel(worker)
    worker.fire('error')
    const { calls, result } = start(worker)
    calls[0].resolve('m1')
    await expect(result).resolves.toEqual({ status: 'failed', code: 'E-CLAIM-PARTIAL' })
    expect(posted(worker, 'month')).toEqual([])
  })

  it('AC-013.14: 그 뒤 점검도 바로 실패한다', async () => {
    const worker = fakeWorker()
    const channel = claimChannel(worker)
    const load = channel.startLoad()
    worker.fire('error')
    await expect(runClaimCheck(channel, load, DAY, SETTINGS)).resolves.toEqual({ status: 'failed', code: 'E-CLAIM-PARTIAL' })
    expect(posted(worker, 'check')).toEqual([])
  })

  it('messageerror는 그 답 하나만 잃은 것이다: Worker는 살아 있어 다음 물음을 보낸다', async () => {
    const worker = fakeWorker()
    const channel = claimChannel(worker)
    worker.fire('messageerror')
    void runClaimExcel(channel, 7)
    expect(posted(worker, 'excel')).toEqual([{ type: 'excel', check: 7 }])
  })
})

describe('AC-013.2·AC-013.14 점검 차례', () => {
  it('AC-013.2: 마지막 번호로 check를 보내고 답을 돌려준다', async () => {
    const worker = fakeWorker()
    const channel = claimChannel(worker)
    const load = channel.startLoad()
    const result = runClaimCheck(channel, load, DAY, SETTINGS)
    await tick()
    const sent = posted(worker, 'check')[0] as Extract<PrecheckFromScreen, { type: 'check' }>
    expect(sent).toMatchObject({ type: 'check', load, visible: DAY, settings: SETTINGS })
    worker.emit({ type: 'check', check: sent.check, load, ok: true, view: VIEW, usedCopy: null })
    await expect(result).resolves.toEqual({ status: 'ok', check: sent.check, view: VIEW, usedCopy: null })
  })

  it('AC-013.14: ok:false면 번호로 실패한다', async () => {
    const worker = fakeWorker()
    const channel = claimChannel(worker)
    const load = channel.startLoad()
    const result = runClaimCheck(channel, load, DAY, SETTINGS)
    await tick()
    const { check } = posted(worker, 'check')[0] as { check: number }
    worker.emit({ type: 'check', check, load, ok: false, code: 'E-SETTINGS-FAILED' })
    await expect(result).resolves.toEqual({ status: 'failed', code: 'E-SETTINGS-FAILED' })
  })

  it('AC-013.10: 그새 새 불러오기를 시작했으면 보내지 않는다', async () => {
    const worker = fakeWorker()
    const channel = claimChannel(worker)
    const load = channel.startLoad()
    channel.startLoad()
    await expect(runClaimCheck(channel, load, DAY, SETTINGS)).resolves.toEqual({ status: 'replaced' })
    expect(posted(worker, 'check')).toEqual([])
  })

  it('AC-013.10: 답을 기다리는 사이 새 불러오기를 시작했으면 ok여도 버린다', async () => {
    const worker = fakeWorker()
    const channel = claimChannel(worker)
    const load = channel.startLoad()
    const result = runClaimCheck(channel, load, DAY, SETTINGS)
    await tick()
    const { check } = posted(worker, 'check')[0] as { check: number }
    channel.startLoad()
    worker.emit({ type: 'check', check, load, ok: true, view: VIEW, usedCopy: null })
    await expect(result).resolves.toEqual({ status: 'replaced' })
  })

  it('AC-013.6: [다시 점검]이 겹치면 마지막 번호의 답만 쓴다', async () => {
    const worker = fakeWorker()
    const channel = claimChannel(worker)
    const load = channel.startLoad()
    const first = runClaimCheck(channel, load, DAY, SETTINGS)
    const second = runClaimCheck(channel, load, DAY, SETTINGS)
    await tick()
    const [a, b] = posted(worker, 'check') as { check: number }[]
    expect(b.check).toBeGreaterThan(a.check)
    worker.emit({ type: 'check', check: a.check, load, ok: true, view: VIEW, usedCopy: null })
    await expect(first).resolves.toEqual({ status: 'replaced' })
    worker.emit({ type: 'check', check: b.check, load, ok: true, view: VIEW, usedCopy: null })
    await expect(second).resolves.toMatchObject({ status: 'ok', check: b.check })
  })
})

describe('AC-013.4 엑셀 차례', () => {
  it('AC-013.4: 그 점검 번호로 묻고 바이트를 돌려준다', async () => {
    const worker = fakeWorker()
    const result = runClaimExcel(claimChannel(worker), 7)
    await tick()
    expect(posted(worker, 'excel')).toEqual([{ type: 'excel', check: 7 }])
    const bytes = new ArrayBuffer(2)
    worker.emit({ type: 'excel', check: 7, ok: true, bytes, fileName: '사전점검.xlsx' })
    await expect(result).resolves.toEqual({ type: 'excel', check: 7, ok: true, bytes, fileName: '사전점검.xlsx' })
  })
})

describe('AC-013.6 떠났다 돌아올 결과는 그 탭 메모리에만 있다', () => {
  const KEPT = { owner: { user: 'u1', institution: '12345678' }, period: DAY, page: 'result', stale: false } as unknown as KeptClaim

  it('AC-013.6: 맡긴 것을 그대로 돌려주고, 처음에는 없다', () => {
    const channel = claimChannel(fakeWorker())
    expect(channel.kept()).toBeNull()
    channel.keep(KEPT)
    expect(channel.kept()).toBe(KEPT)
    channel.keep(null)
    expect(channel.kept()).toBeNull()
  })

  it('AC-013.6: 새 불러오기·drop은 맡긴 것을 지운다(Worker의 달이 비므로 다시 점검할 수 없다)', () => {
    const channel = claimChannel(fakeWorker())
    channel.keep(KEPT)
    channel.startLoad()
    expect(channel.kept()).toBeNull()
    channel.keep(KEPT)
    channel.drop()
    expect(channel.kept()).toBeNull()
  })
})

describe('화면을 떠나면 달을 버린다', () => {
  it('drop: 새 번호의 loadStart로 Worker의 달을 비우고 진행 중인 불러오기를 버린다', async () => {
    const { worker, channel, calls, result } = start()
    channel.drop()
    expect(posted(worker, 'loadStart')).toEqual([
      { type: 'loadStart', load: 1 },
      { type: 'loadStart', load: 2 },
    ])
    calls[0].reject('E-BRIDGE-DISCONNECTED')
    await expect(result).resolves.toEqual({ status: 'replaced' })
  })
})

describe('openClaimChannel: 확장이 있는 PC 크롬에서만 Worker를 만든다', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  class FakeWorkerClass {
    static made = 0
    constructor() {
      FakeWorkerClass.made++
    }
    postMessage() {}
    addEventListener() {}
  }
  /** 탭 하나 범위의 Worker를 비운 새 모듈(새 탭과 같다) */
  const freshTab = async () => {
    vi.resetModules()
    FakeWorkerClass.made = 0
    return (await import('./claimLoad')).openClaimChannel
  }

  it('AC-013.8: chrome.runtime이 없으면(휴대폰·확장 없는 곳) Worker를 만들지 않는다', async () => {
    const open = await freshTab()
    vi.stubGlobal('Worker', FakeWorkerClass)
    expect(open()).toBeNull()
    expect(FakeWorkerClass.made).toBe(0)
  })

  it('AC-013.12: 같은 탭에서는 Worker 하나를 계속 쓴다', async () => {
    const open = await freshTab()
    vi.stubGlobal('Worker', FakeWorkerClass)
    vi.stubGlobal('chrome', { runtime: {} })
    const first = open()
    expect(first).not.toBeNull()
    expect(open()).toBe(first)
    expect(FakeWorkerClass.made).toBe(1)
  })

  it('AC-013.6: 로그아웃의 전체 페이지 이동(새 모듈)에는 맡긴 결과가 남지 않고 Worker도 새것이다', async () => {
    const open = await freshTab()
    vi.stubGlobal('Worker', FakeWorkerClass)
    vi.stubGlobal('chrome', { runtime: {} })
    open()!.keep({ page: 'result' } as unknown as KeptClaim)
    const reopened = await freshTab()
    expect(reopened()!.kept()).toBeNull()
    expect(FakeWorkerClass.made).toBe(1)
  })

  it('Worker를 만들지 못하면 null이다', async () => {
    const open = await freshTab()
    vi.stubGlobal('chrome', { runtime: {} })
    vi.stubGlobal('Worker', class {
      constructor() {
        throw new Error('막힘')
      }
    })
    expect(open()).toBeNull()
  })

  it('서버에서 그릴 때(Worker 없음) null이다', async () => {
    const open = await freshTab()
    vi.stubGlobal('chrome', { runtime: {} })
    vi.stubGlobal('Worker', undefined)
    expect(open()).toBeNull()
  })
})
