// @vitest-environment jsdom
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayInKorea } from '@/lib/analytics/dates'
import { BridgeError } from '@/lib/bridge/protocol'
import type { PatientsWorkerMessage } from '@/types/patients'
import { createHandler } from '@/workers/patients/handler'
import type { StoreFile, TargetsFile, TargetsReply } from '../../../fixtures/patients/make-fake-patients'
import { usePatientsWorker, usePatientsWorkerObject, type PatientsBridge, type PatientsWorkerHandle } from './usePatientsWorker'

// 화면 쪽 흐름(design.md '데이터 흐름', AC-604.3·604.8, AC-610). 가짜 통로·가짜 Worker로 부르는 순서를 보고,
// 옛 흐름 막기는 진짜 handler에 이어서도 본다(handler는 옛 흐름을 가려내지 못한다). 자료는 fixtures의 지어낸 값뿐이다

const R1 = { from: '2026-07-06', to: '2026-08-05' }
const R2 = { from: '2026-08-06', to: '2026-09-05' }
const M1 = { from: '2026-10-01', to: '2026-10-31' }
const M2 = { from: '2026-11-01', to: '2026-11-02' }
const FOLLOWUP_VIEW = { read: R1, base: '2026-11-02', rows: [], undecided: [], phoneLoaded: true, marksLoaded: true }
const RECALL_VIEW = { rows: [], coverage: { records: 0, from: null, short: [], trimmed: 0 } }

type Call = { cmd: string; args: Record<string, unknown>; ok(id: string): void; fail(code: string): void }

function fakeBridge() {
  const calls: Call[] = []
  const stream = vi.fn(
    (cmd: string, args: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        calls.push({
          cmd,
          args,
          ok: (id) => resolve({ id, count: 1 }),
          fail: (code) => reject(new BridgeError(code)),
        })
      }),
  )
  return { calls, stream: stream as unknown as PatientsBridge['stream'], spy: stream }
}

function fakeWorker() {
  const posted: { type: string; [key: string]: unknown }[] = []
  const listeners = new Set<(event: MessageEvent) => void>()
  const worker: PatientsWorkerHandle = {
    postMessage: (message) => void posted.push(message as (typeof posted)[number]),
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
  }
  const emit = (message: PatientsWorkerMessage) => {
    for (const listener of [...listeners]) listener({ data: message } as MessageEvent)
  }
  return { worker, posted, emit, listeners }
}

// 다음 일로 넘어갈 때까지(약속이 다 풀릴 때까지) 기다린다
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

function setup(wrapper?: typeof StrictMode) {
  const bridge = fakeBridge()
  const worker = fakeWorker()
  const hook = renderHook(() => usePatientsWorker({ stream: bridge.stream }, worker.worker), wrapper ? { wrapper } : undefined)
  const answer = async (call: Call, id: string) => {
    call.ok(id)
    await flush()
  }
  const refuse = async (call: Call, code: string) => {
    call.fail(code)
    await flush()
  }
  const reply = async (message: PatientsWorkerMessage) => {
    worker.emit(message)
    await flush()
  }
  const types = () => worker.posted.map((m) => m.type)
  const lastCall = () => bridge.calls[bridge.calls.length - 1]!
  const storeLoads = () => bridge.calls.filter((c) => c.cmd === 'store.load').length
  // store.load → stored → plan까지
  const toPlan = async (plan: { followup: { from: string; to: string }[]; recall: { from: string; to: string }[] | null; code?: string }) => {
    await answer(lastCall(), 'store-1')
    await reply({ type: 'stored', ok: true, recall: plan.recall ?? [] })
    await reply({ type: 'plan', ...plan })
  }
  return { ...hook, bridge, worker, answer, refuse, reply, types, lastCall, storeLoads, toPlan }
}

const TODAY = '2026-11-02'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${TODAY}T09:00:00+09:00`) })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('usePatientsWorker: 부르는 순서 · 진행', () => {
  it('AC-610.4: 들어오면 store.load {contact:true} → stored → plan → F/U 조각 차례로 → 정기 주사 조각 → build → views', async () => {
    const t = setup()
    expect(t.bridge.calls.map((c) => [c.cmd, c.args])).toEqual([['store.load', { contact: true }]])
    expect(t.worker.posted).toEqual([])
    expect(t.result.current.status).toBe('loading')

    await t.answer(t.bridge.calls[0]!, 'store-1')
    expect(t.worker.posted).toEqual([{ type: 'stored', id: 'store-1' }])

    await t.reply({ type: 'stored', ok: true, recall: [M1, M2] })
    expect(t.worker.posted[1]).toEqual({ type: 'plan', today: TODAY })

    await t.reply({ type: 'plan', followup: [R1, R2], recall: [M1, M2] })
    expect(t.result.current.progress).toEqual({ followup: { done: 0, total: 2 }, recall: { done: 0, total: 2 } })
    // 조각은 차례로: 앞 조각의 답이 오기 전에는 다음 조각을 부르지 않는다
    expect(t.bridge.calls.slice(1).map((c) => c.args)).toEqual([{ kind: 'followup', ...R1 }])

    await t.answer(t.lastCall(), 'f1')
    expect(t.worker.posted[2]).toEqual({ type: 'piece', id: 'f1', kind: 'followup', ...R1 })
    expect(t.bridge.calls).toHaveLength(2)

    await t.reply({ type: 'piece', id: 'f1', ok: true })
    expect(t.result.current.progress.followup).toEqual({ done: 1, total: 2 })
    expect(t.lastCall().args).toEqual({ kind: 'followup', ...R2 })

    await t.answer(t.lastCall(), 'f2')
    await t.reply({ type: 'piece', id: 'f2', ok: true })
    expect(t.result.current.progress.followup).toEqual({ done: 2, total: 2 })
    expect(t.lastCall().args).toEqual({ kind: 'injection', ...M1 })

    await t.answer(t.lastCall(), 'r1')
    expect(t.worker.posted[t.worker.posted.length - 1]).toEqual({ type: 'piece', id: 'r1', kind: 'injection', ...M1 })
    await t.reply({ type: 'piece', id: 'r1', ok: true })
    expect(t.result.current.progress.recall).toEqual({ done: 1, total: 2 })
    expect(t.lastCall().args).toEqual({ kind: 'injection', ...M2 })

    await t.answer(t.lastCall(), 'r2')
    expect(t.types().includes('build')).toBe(false)
    await t.reply({ type: 'piece', id: 'r2', ok: true })
    expect(t.worker.posted[t.worker.posted.length - 1]).toEqual({ type: 'build', today: TODAY })
    expect(t.result.current.status).toBe('loading')

    const codes = {}
    await t.reply({ type: 'views', followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, counts: { followup_left: 1, injection_left: 2 }, codes })
    expect(t.result.current.status).toBe('done')
    expect(t.result.current.views).toEqual({ followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, codes })
    expect(t.result.current.counts).toEqual({ followup_left: 1, injection_left: 2 })
    expect(t.bridge.calls).toHaveLength(5)
  })

  it('AC-610.4: plan과 build는 같은 날로 보낸다(읽는 사이 자정이 지나도)', async () => {
    const t = setup()
    await t.toPlan({ followup: [], recall: [] })
    expect(t.worker.posted.find((m) => m.type === 'build')).toEqual({ type: 'build', today: TODAY })

    const u = setup()
    await u.answer(u.lastCall(), 'store-1')
    vi.setSystemTime(new Date(`${addDays(TODAY, 1)}T00:00:01+09:00`))
    await u.reply({ type: 'stored', ok: true, recall: [] })
    await u.reply({ type: 'plan', followup: [], recall: [] })
    expect(u.worker.posted.filter((m) => m.type === 'plan' || m.type === 'build').map((m) => m.today)).toEqual([TODAY, TODAY])
    expect(todayInKorea()).toBe(addDays(TODAY, 1))
  })

  it('AC-610.4: plan이 번호로 끝나면 읽지 않고 build로 간다(번호는 views로 온다)', async () => {
    const t = setup()
    await t.toPlan({ followup: [], recall: null, code: 'E-BRIDGE-BAD-REPLY' })
    expect(t.bridge.calls.map((c) => c.cmd)).toEqual(['store.load'])
    expect(t.types()).toEqual(['stored', 'plan', 'build'])
  })
})

describe('usePatientsWorker: 종류마다 따로 (AC-604.3)', () => {
  it('AC-604.3: F/U 조각의 통로가 거절되면 번호를 알리고 F/U만 멈춘다. 정기 주사는 끝까지 읽고 build', async () => {
    const t = setup()
    await t.toPlan({ followup: [R1, R2], recall: [M1] })
    await t.refuse(t.lastCall(), 'E-BIT-READ-FAILED')
    expect(t.worker.posted[t.worker.posted.length - 1]).toEqual({ type: 'piece', kind: 'followup', ...R1, code: 'E-BIT-READ-FAILED' })
    // 다음 F/U 조각(R2)은 부르지 않고 정기 주사로
    expect(t.bridge.calls.slice(1).map((c) => c.args)).toEqual([{ kind: 'followup', ...R1 }, { kind: 'injection', ...M1 }])
    await t.answer(t.lastCall(), 'r1')
    await t.reply({ type: 'piece', id: 'r1', ok: true })
    expect(t.types()).toContain('build')
    await t.reply({ type: 'views', followup: null, recall: RECALL_VIEW, counts: null, codes: { followup: 'E-BIT-READ-FAILED' } })
    expect(t.result.current.views).toEqual({ followup: null, recall: RECALL_VIEW, codes: { followup: 'E-BIT-READ-FAILED' } })
    expect(t.result.current.counts).toBeNull()
  })

  it('AC-604.3: Worker가 F/U 조각을 못 쓴다고 답해도(ok:false) F/U만 멈춘다', async () => {
    const t = setup()
    await t.toPlan({ followup: [R1, R2], recall: [M1] })
    await t.answer(t.lastCall(), 'f1')
    await t.reply({ type: 'piece', id: 'f1', ok: false, code: 'E-BRIDGE-BAD-REPLY' })
    expect(t.lastCall().args).toEqual({ kind: 'injection', ...M1 })
    expect(t.result.current.progress.followup).toEqual({ done: 0, total: 2 })
  })

  it('AC-604.3: 반대도 같다 — 정기 주사가 실패해도 F/U는 다 읽었고 build가 나간다', async () => {
    const t = setup()
    await t.toPlan({ followup: [R1], recall: [M1, M2] })
    await t.answer(t.lastCall(), 'f1')
    await t.reply({ type: 'piece', id: 'f1', ok: true })
    await t.refuse(t.lastCall(), 'E-BIT-READ-FAILED')
    expect(t.worker.posted[t.worker.posted.length - 2]).toEqual({ type: 'piece', kind: 'injection', ...M1, code: 'E-BIT-READ-FAILED' })
    expect(t.worker.posted[t.worker.posted.length - 1]).toEqual({ type: 'build', today: TODAY })
    // 다음 정기 주사 조각(M2)은 부르지 않는다
    expect(t.bridge.calls.map((c) => c.args)).toEqual([{ contact: true }, { kind: 'followup', ...R1 }, { kind: 'injection', ...M1 }])
    await t.reply({ type: 'views', followup: FOLLOWUP_VIEW, recall: null, counts: null, codes: { recall: 'E-BIT-READ-FAILED' } })
    expect(t.result.current.views?.codes).toEqual({ recall: 'E-BIT-READ-FAILED' })
    expect(t.result.current.views?.followup).toEqual(FOLLOWUP_VIEW)
  })

  it('AC-604.8: store.load가 거절되면 번호를 알리고 F/U만 읽어 build한다(정기 주사 조각 없음)', async () => {
    const t = setup()
    await t.refuse(t.bridge.calls[0]!, 'E-STORE-BROKEN')
    expect(t.worker.posted).toEqual([{ type: 'stored', code: 'E-STORE-BROKEN' }])
    await t.reply({ type: 'stored', ok: false, code: 'E-STORE-BROKEN', recall: [] })
    await t.reply({ type: 'plan', followup: [R1], recall: null })
    await t.answer(t.lastCall(), 'f1')
    await t.reply({ type: 'piece', id: 'f1', ok: true })
    expect(t.bridge.calls.map((c) => c.cmd)).toEqual(['store.load', 'contact.targets'])
    expect(t.types()).toContain('build')
    expect(t.result.current.progress.recall).toEqual({ done: 0, total: 0 })
  })

  it('AC-604.8: 저장을 못 불러와도 Worker가 준 그대로 — F/U는 연락 표시 없이 있고 정기 주사만 번호다', async () => {
    const t = setup()
    await t.refuse(t.bridge.calls[0]!, 'E-STORE-BROKEN')
    await t.reply({ type: 'stored', ok: false, code: 'E-STORE-BROKEN', recall: [] })
    await t.reply({ type: 'plan', followup: [], recall: null })
    const followup = { ...FOLLOWUP_VIEW, marksLoaded: false }
    await t.reply({ type: 'views', followup, recall: null, counts: null, codes: { recall: 'E-STORE-BROKEN' } })
    expect(t.result.current.views).toEqual({ followup, recall: null, codes: { recall: 'E-STORE-BROKEN' } })
    expect(t.result.current.counts).toBeNull()
  })

  it('AC-604.3: 통로 오류가 번호 없는 값이면 번호 하나(E-BRIDGE-REJECTED)로 알리고 글자는 싣지 않는다', async () => {
    const stream = vi.fn(() => Promise.reject(new Error('가상환자01 010-0000-0101')))
    const worker = fakeWorker()
    renderHook(() => usePatientsWorker({ stream: stream as unknown as PatientsBridge['stream'] }, worker.worker))
    await flush()
    expect(worker.posted).toEqual([{ type: 'stored', code: 'E-BRIDGE-REJECTED' }])
  })
})

describe('usePatientsWorker: store.load는 저절로 다시 부르지 않는다 (E-STORE-BROKEN 뒤 다음 읽기는 빈 값이다)', () => {
  it('AC-604.8: 한 번 들어오면 store.load는 한 번이다 — 다시 그려도, 통로 객체가 바뀌어도', async () => {
    const bridge = fakeBridge()
    const worker = fakeWorker()
    const { rerender } = renderHook((props: { stream: PatientsBridge['stream'] }) => usePatientsWorker(props, worker.worker), {
      initialProps: { stream: bridge.stream },
    })
    expect(bridge.calls.filter((c) => c.cmd === 'store.load')).toHaveLength(1)
    for (let i = 0; i < 3; i++) rerender({ stream: bridge.stream })
    // effect가 다시 돌게(deps가 바뀌게) 다른 함수를 줘도 부르지 않는다
    const another = vi.fn(() => new Promise(() => {}))
    rerender({ stream: another as unknown as PatientsBridge['stream'] })
    await flush()
    expect(another).not.toHaveBeenCalled()
    expect(bridge.calls.filter((c) => c.cmd === 'store.load')).toHaveLength(1)
  })

  it('AC-604.8: effect를 두 번 돌리는 StrictMode에서도 store.load는 한 번이고 흐름은 살아 있다', async () => {
    const t = setup(StrictMode)
    expect(t.storeLoads()).toBe(1)
    await t.answer(t.bridge.calls[0]!, 'store-1')
    expect(t.worker.posted).toEqual([{ type: 'stored', id: 'store-1' }])
    await t.reply({ type: 'stored', ok: true, recall: [] })
    expect(t.types()).toEqual(['stored', 'plan'])
    expect(t.storeLoads()).toBe(1)
  })

  it('AC-604.8: E-STORE-BROKEN이 나도 다시 부르지 않고 번호를 그대로 둔다. reload를 불러야만 두 번째 store.load가 나간다', async () => {
    const t = setup()
    await t.refuse(t.bridge.calls[0]!, 'E-STORE-BROKEN')
    await t.reply({ type: 'stored', ok: false, code: 'E-STORE-BROKEN', recall: [] })
    await t.reply({ type: 'plan', followup: [], recall: null })
    await t.reply({ type: 'views', followup: FOLLOWUP_VIEW, recall: null, counts: null, codes: { recall: 'E-STORE-BROKEN' } })
    t.rerender()
    t.rerender()
    await flush()
    expect(t.storeLoads()).toBe(1)
    expect(t.result.current.views?.codes.recall).toBe('E-STORE-BROKEN')

    act(() => t.result.current.reload())
    expect(t.storeLoads()).toBe(2)
    await flush()
    expect(t.storeLoads()).toBe(2)
  })

  it('AC-604.8: 조각·저장이 실패해도 store.load를 다시 부르지 않는다', async () => {
    const t = setup()
    await t.toPlan({ followup: [R1], recall: [M1] })
    await t.refuse(t.lastCall(), 'E-BIT-READ-FAILED')
    await t.refuse(t.lastCall(), 'E-BIT-READ-FAILED')
    await t.reply({ type: 'views', followup: null, recall: null, counts: null, codes: { followup: 'E-BIT-READ-FAILED', recall: 'E-BIT-READ-FAILED', store: 'E-STORE-FAILED' } })
    await flush()
    expect(t.storeLoads()).toBe(1)
    expect(t.bridge.calls).toHaveLength(3)
  })
})

describe('usePatientsWorker: [다시 불러오기] (AC-604.8, 옛 흐름 막기)', () => {
  it('AC-604.8: reload는 Worker에 {type:"reload"}를 먼저 보낸 뒤 새 store.load를 부르고, 보던 것을 비운다', async () => {
    const t = setup()
    await t.toPlan({ followup: [], recall: [] })
    await t.reply({ type: 'views', followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, counts: { followup_left: 1, injection_left: 1 }, codes: {} })
    expect(t.result.current.status).toBe('done')
    t.worker.posted.length = 0
    const order: string[] = []
    const post = t.worker.worker.postMessage
    t.worker.worker.postMessage = (message, transfer) => {
      order.push(`post:${(message as { type: string }).type}`)
      post(message, transfer)
    }
    t.bridge.spy.mockImplementationOnce(((cmd: string) => {
      order.push(`stream:${cmd}`)
      return new Promise(() => {})
    }) as never)

    act(() => t.result.current.reload())
    expect(order).toEqual(['post:reload', 'stream:store.load'])
    expect(t.result.current.status).toBe('loading')
    expect(t.result.current.views).toBeNull()
    expect(t.result.current.counts).toBeNull()
    expect(t.result.current.progress).toEqual({ followup: { done: 0, total: 0 }, recall: { done: 0, total: 0 } })
  })

  it('AC-604.8: reload 뒤에 끝난 옛 조각 스트림은 Worker에 보내지 않고, 옛 흐름의 다음 조각도 부르지 않는다', async () => {
    const t = setup()
    await t.toPlan({ followup: [R1, R2], recall: [M1] })
    const oldPiece = t.lastCall()
    act(() => t.result.current.reload())
    const callsAfterReload = t.bridge.calls.length
    t.worker.posted.length = 0

    await t.answer(oldPiece, 'old-f1')
    expect(t.worker.posted).toEqual([])
    expect(t.bridge.calls).toHaveLength(callsAfterReload)
  })

  it('AC-604.8: reload 뒤에 거절된 옛 조각 스트림도 번호를 보내지 않는다', async () => {
    const t = setup()
    await t.toPlan({ followup: [R1], recall: [] })
    const oldPiece = t.lastCall()
    act(() => t.result.current.reload())
    t.worker.posted.length = 0
    await t.refuse(oldPiece, 'E-BRIDGE-DISCONNECTED')
    expect(t.worker.posted).toEqual([])
  })

  it('AC-604.8: reload 뒤에 끝나거나 거절된 옛 store.load는 Worker에 보내지 않는다', async () => {
    for (const end of ['ok', 'fail'] as const) {
      const t = setup()
      const oldLoad = t.bridge.calls[0]!
      act(() => t.result.current.reload())
      t.worker.posted.length = 0
      if (end === 'ok') await t.answer(oldLoad, 'old-store')
      else await t.refuse(oldLoad, 'E-BRIDGE-DISCONNECTED')
      expect(t.worker.posted).toEqual([])
      cleanup()
    }
  })

  it('AC-604.8: reload 뒤에 오는 옛 답(piece·stored·plan·views)은 새 흐름을 움직이지 않는다', async () => {
    const t = setup()
    await t.toPlan({ followup: [R1], recall: [M1] })
    await t.answer(t.lastCall(), 'old-f1')
    act(() => t.result.current.reload())
    t.worker.posted.length = 0
    const calls = t.bridge.calls.length

    await t.reply({ type: 'piece', id: 'old-f1', ok: true })
    await t.reply({ type: 'stored', ok: true, recall: [] })
    await t.reply({ type: 'plan', followup: [R2], recall: [] })
    await t.reply({ type: 'views', followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, counts: { followup_left: 9, injection_left: 9 }, codes: {} })

    expect(t.worker.posted).toEqual([])
    expect(t.bridge.calls).toHaveLength(calls)
    expect(t.result.current.status).toBe('loading')
    expect(t.result.current.views).toBeNull()
    expect(t.result.current.counts).toBeNull()
    expect(t.result.current.progress).toEqual({ followup: { done: 0, total: 0 }, recall: { done: 0, total: 0 } })
  })

  it('AC-604.8: 새 흐름은 처음부터 끝까지 그대로 돈다', async () => {
    const t = setup()
    await t.toPlan({ followup: [R1], recall: [] })
    act(() => t.result.current.reload())
    await t.answer(t.lastCall(), 'store-2')
    expect(t.worker.posted[t.worker.posted.length - 1]).toEqual({ type: 'stored', id: 'store-2' })
    await t.reply({ type: 'stored', ok: true, recall: [] })
    await t.reply({ type: 'plan', followup: [R2], recall: [] })
    await t.answer(t.lastCall(), 'f2')
    await t.reply({ type: 'piece', id: 'f2', ok: true })
    await t.reply({ type: 'views', followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, counts: null, codes: {} })
    expect(t.result.current.status).toBe('done')
  })
})

describe('usePatientsWorker: 진짜 handler에 이어서 (옛 흐름이 새 읽기를 망치지 않는다)', () => {
  const ROOT = process.cwd()
  const fake = <T>(name: string): T => JSON.parse(readFileSync(join(ROOT, 'fixtures/patients/fake', name), 'utf8')) as T
  const FOLLOWUP = fake<TargetsFile>('targets-followup.json')
  const INJECTION = fake<TargetsFile>('targets-injection.json')
  const FIRST = fake<StoreFile>('store-first.json').contact

  type Held = { cmd: string; id: string; deliver(): void; resolve(): void }

  // 진짜 handler를 Worker 자리에, 조각은 진짜처럼 포트로 넣는다. shouldHold가 true인 스트림은 release 때까지 끝나지 않는다
  function realSetup(shouldHold: (cmd: string, nth: number) => boolean) {
    const listeners = new Set<(event: MessageEvent) => void>()
    const toWorker: { type: string; id?: string }[] = []
    const saves: unknown[] = []
    const handler = createHandler({
      post: (message) => {
        for (const listener of [...listeners]) listener({ data: message } as MessageEvent)
      },
    })
    handler.setPort({
      postMessage: (message) => {
        const sent = message as { ticket: number }
        saves.push(message)
        setTimeout(() => handler.onPort({ type: 'sent', ticket: sent.ticket, ok: true }), 0)
      },
    })
    const worker: PatientsWorkerHandle = {
      postMessage: (message) => {
        toWorker.push(message as (typeof toWorker)[number])
        handler.onScreen(message)
      },
      addEventListener: (_type, listener) => void listeners.add(listener),
      removeEventListener: (_type, listener) => void listeners.delete(listener),
    }
    const deliver = (id: string, value: unknown) => {
      const text = JSON.stringify(value)
      handler.onPort({ type: 'chunk', id, seq: 0, data: text })
      handler.onPort({ type: 'end', id, count: 1, bytes: Buffer.byteLength(text, 'utf8'), sha256: createHash('sha256').update(text, 'utf8').digest('hex') })
    }
    const pieceFor = (args: { kind?: string; from?: string; to?: string }): TargetsReply => {
      const file = args.kind === 'followup' ? FOLLOWUP : INJECTION
      const found = file.pieces.find((p) => p.from === args.from && p.to === args.to)
      if (!found) throw new Error(`fixtures에 없는 조각 ${args.kind} ${args.from}`)
      return found
    }
    const held: Held[] = []
    let n = 0
    const counts = new Map<string, number>()
    const stream = (cmd: string, args: Record<string, unknown>) =>
      new Promise((resolve) => {
        const id = `req-${++n}`
        const nth = (counts.get(cmd) ?? 0) + 1
        counts.set(cmd, nth)
        const value = cmd === 'store.load' ? { contact: FIRST } : pieceFor(args)
        const finish = () => resolve({ id, count: 1 })
        if (shouldHold(cmd, nth)) held.push({ cmd, id, deliver: () => deliver(id, value), resolve: finish })
        else {
          deliver(id, value)
          finish()
        }
      })
    return { worker, toWorker, saves, held, stream: stream as unknown as PatientsBridge['stream'], counts }
  }

  // 큰 자료의 SHA-256은 스레드에서 돈다. 진짜 시계로 기다린다
  const settled = (check: () => void) => waitFor(check, { timeout: 15_000, interval: 5 })

  it('AC-604.3·AC-604.8: reload 전 F/U 스트림이 다음 plan 뒤에 끝나도 Worker에 가지 않아 F/U가 E-BRIDGE-BAD-REPLY로 실패하지 않는다', { timeout: 30_000 }, async () => {
    // 첫 F/U 조각(옛 흐름)과 reload 뒤 첫 F/U 조각(새 흐름, plan이 지난 시점)을 잡아 둔다
    const r = realSetup((cmd, nth) => cmd === 'contact.targets' && (nth === 1 || nth === 2))
    const { result } = renderHook(() => usePatientsWorker({ stream: r.stream }, r.worker))
    await settled(() => expect(r.held).toHaveLength(1))
    const old = r.held[0]!

    act(() => result.current.reload())
    await settled(() => expect(r.held).toHaveLength(2))
    const fresh = r.held[1]!

    // 옛 답이 지금(다음 plan 뒤) 도착한다
    old.deliver()
    old.resolve()
    await flush()
    expect(r.toWorker.filter((m) => m.type === 'piece' && m.id === old.id)).toEqual([])

    fresh.deliver()
    fresh.resolve()
    await settled(() => expect(result.current.status).toBe('done'))
    expect(result.current.views?.codes.followup).toBeUndefined()
    expect(result.current.views?.followup).not.toBeNull()
    expect(result.current.views?.recall).not.toBeNull()
    expect(result.current.counts).not.toBeNull()
  })

  it('AC-604.8: reload 전 store.load가 새 읽기 도중에 끝나도 Worker에 가지 않아 저장이 막히지 않는다([연락함]이 저장된다)', { timeout: 30_000 }, async () => {
    // 첫 store.load(옛 흐름)와 새 흐름의 첫 F/U 조각을 잡아 둔다
    const r = realSetup((cmd, nth) => (cmd === 'store.load' && nth === 1) || (cmd === 'contact.targets' && nth === 1))
    const { result } = renderHook(() => usePatientsWorker({ stream: r.stream }, r.worker))
    await settled(() => expect(r.held).toHaveLength(1))
    const old = r.held[0]!

    act(() => result.current.reload())
    await settled(() => expect(r.held).toHaveLength(2))
    const piece = r.held[1]!

    old.deliver()
    old.resolve()
    await flush()
    expect(r.toWorker.filter((m) => m.type === 'stored').map((m) => m.id)).toEqual(['req-2'])

    piece.deliver()
    piece.resolve()
    await settled(() => expect(result.current.status).toBe('done'))
    const views = result.current.views!
    expect(views.codes).toEqual({})
    expect(views.followup?.marksLoaded).toBe(true)

    const replies: unknown[] = []
    result.current.listen((message) => replies.push(message))
    const key = views.followup!.rows[0]!.key
    const savesBefore = r.saves.length
    act(() => result.current.post({ type: 'mark', key, on: true, today: TODAY }))
    await settled(() => expect(replies).toContainEqual(expect.objectContaining({ type: 'marked', key, ok: true })))
    expect(r.saves.length).toBe(savesBefore + 1)
  })
})

describe('usePatientsWorker: 도구로 가는 길(TASK-11~14가 쓴다)', () => {
  it('AC-610.4: post는 filter·mark를 Worker에 보내고, listen은 filtered·marked를 받는다. 그만 받기도 된다', async () => {
    const t = setup()
    const filters = { kind: '' as const, includeCond: false, includePast: false }
    act(() => t.result.current.post({ type: 'filter', tool: 'followup', filters }))
    expect(t.worker.posted[t.worker.posted.length - 1]).toEqual({ type: 'filter', tool: 'followup', filters })

    const got: unknown[] = []
    const stop = t.result.current.listen((message) => got.push(message))
    const filtered = { type: 'filtered' as const, tool: 'followup' as const, rows: [], undecided: [], copy: { list: '', listWithDate: '' } }
    const marked = { type: 'marked' as const, key: 'f|a', ok: true, counts: { followup_left: 3, injection_left: 4 } }
    await t.reply(filtered)
    await t.reply(marked)
    expect(got).toEqual([filtered, marked])
    stop()
    await t.reply(filtered)
    expect(got).toHaveLength(2)
  })

  it('AC-610.4: 건수는 views와 marked의 것 중 나중 것이다', async () => {
    const t = setup()
    await t.toPlan({ followup: [], recall: [] })
    await t.reply({ type: 'views', followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, counts: { followup_left: 1, injection_left: 1 }, codes: {} })
    await t.reply({ type: 'marked', key: 'f|a', ok: true, counts: { followup_left: 0, injection_left: 1 } })
    expect(t.result.current.counts).toEqual({ followup_left: 0, injection_left: 1 })
  })

  it('AC-610.4: 다 읽은 뒤 연락함으로 바뀐 views는 그대로 받는다', async () => {
    const t = setup()
    await t.toPlan({ followup: [], recall: [] })
    await t.reply({ type: 'views', followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, counts: null, codes: {} })
    const changed = { ...FOLLOWUP_VIEW, base: '2026-11-03' }
    await t.reply({ type: 'views', followup: changed, recall: RECALL_VIEW, counts: null, codes: {} })
    expect(t.result.current.views?.followup).toEqual(changed)
  })

  it('AC-610.4: 화면을 떠나면 Worker 듣기를 멈추고, 끝난 스트림으로 다음 일을 하지 않는다', async () => {
    const t = setup()
    const load = t.bridge.calls[0]!
    t.unmount()
    expect(t.worker.listeners.size).toBe(0)
    load.ok('store-1')
    await flush()
    expect(t.worker.posted).toEqual([])
  })
})

describe('usePatientsWorkerObject: Worker 한 개 (AC-610.4)', () => {
  function stubWorker() {
    const made: { url: unknown; options: unknown; terminate: ReturnType<typeof vi.fn> }[] = []
    vi.stubGlobal(
      'Worker',
      class {
        terminate = vi.fn()
        constructor(url: unknown, options: unknown) {
          made.push({ url, options, terminate: this.terminate })
        }
      },
    )
    return made
  }

  it('AC-610.4: 한 번 만들고 다시 그려도 그대로이며, 화면을 떠나면 끝낸다', async () => {
    const made = stubWorker()
    const { result, rerender, unmount } = renderHook(() => usePatientsWorkerObject())
    expect(made).toHaveLength(1)
    expect(String(made[0]!.url)).toMatch(/workers\/patients\.worker\.ts/)
    const first = result.current
    expect(first).not.toBeNull()
    rerender()
    expect(result.current).toBe(first)
    expect(made).toHaveLength(1)
    unmount()
    expect(made[0]!.terminate).toHaveBeenCalledTimes(1)
  })

  it('AC-610.4: StrictMode의 두 번째 effect 뒤에는 끝내지 않은 Worker 하나만 쓴다', () => {
    const made = stubWorker()
    const { result } = renderHook(() => usePatientsWorkerObject(), { wrapper: StrictMode })
    expect(made).toHaveLength(2)
    expect(made[0]!.terminate).toHaveBeenCalledTimes(1)
    expect(made[1]!.terminate).not.toHaveBeenCalled()
    expect((result.current as unknown as { terminate: unknown }).terminate).toBe(made[1]!.terminate)
  })
})
