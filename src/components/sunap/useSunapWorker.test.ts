// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import { SUNAP_TOTAL_KEYS, DEFAULT_RSV_KINDS, type DoctorBreakdown, type SunapRates, type SunapTotals } from '@/types/sunap'
import type { SunapWorkerMessage } from '@/workers/sunap/messages'
import { useSunapWorker, type SunapWorkerHandle } from './useSunapWorker'

// 수납일지 장부 Worker 훅(spec sunap-ilji design.md 'Worker 메시지'). 화면은 스트림을 열어 {id}·오류 번호만 Worker에 넘기고, 장부 보기·마감 숫자·오류 번호만 받는다

class FakeWorker implements SunapWorkerHandle {
  posted: unknown[] = []
  private listeners = new Map<string, Set<(event: Event) => void>>()
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }
  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener)
  }
  reply(message: SunapWorkerMessage) {
    act(() => {
      for (const listener of [...(this.listeners.get('message') ?? [])]) listener(new MessageEvent('message', { data: message }))
    })
  }
  fail() {
    act(() => {
      for (const listener of [...(this.listeners.get('error') ?? [])]) listener(new Event('error', { cancelable: true }))
    })
  }
}

const TOTALS = Object.fromEntries(SUNAP_TOTAL_KEYS.map((key) => [key, 0])) as SunapTotals
const ASK = { day: '2026-11-16', kinds: DEFAULT_RSV_KINDS, blockDef: { id: 'b', codes: ['MM110'] }, ptDef: null }
const ledger = (day = '2026-11-16', closedAt: string | null = null, doctors: DoctorBreakdown | null = null): SunapWorkerMessage => ({
  type: 'ledger',
  day,
  unsure: false,
  rows: [],
  paid: [],
  closedAt,
  late: false,
  totals: TOTALS,
  doctors,
})

function setup(stream = vi.fn(async (cmd: string) => ({ id: cmd === 'store.load' ? 's1' : 't1', count: 1 }))) {
  const worker = new FakeWorker()
  const hook = renderHook(() => useSunapWorker({ stream } as never, worker))
  return { worker, stream, hook }
}

describe('AC-4905.1 불러오기', () => {
  it('AC-4905.1: 두 스트림(contact.targets sunap·store.load 그 달)을 열고 {id}를 load에 실어 보낸다. 장부가 오면 보기·불러온 시각', async () => {
    const { worker, stream, hook } = setup()
    act(() => hook.result.current.load(ASK))
    expect(hook.result.current.loading).toBe(true)
    expect(stream).toHaveBeenCalledWith('contact.targets', { kind: 'sunap', from: '2026-11-16', to: '2026-11-16' })
    expect(stream).toHaveBeenCalledWith('store.load', { months: ['2026-11'] })
    await waitFor(() => expect(worker.posted).toHaveLength(1))
    expect(worker.posted[0]).toEqual({ type: 'load', ...ASK, targets: { id: 't1' }, store: { id: 's1' } })
    worker.reply(ledger())
    expect(hook.result.current.loading).toBe(false)
    expect(hook.result.current.view?.day).toBe('2026-11-16')
    expect(hook.result.current.loadedAt).toBeInstanceOf(Date)
  })

  it('AC-4905.1: 스트림이 거절되면 오류 번호를 load에 싣는다(Worker가 오류로 답한다)', async () => {
    const stream = vi.fn(async (cmd: string) => {
      if (cmd === 'contact.targets') throw new BridgeError('E-HELPER-BAD-MESSAGE')
      return { id: 's1', count: 1 }
    })
    const { worker, hook } = setup(stream)
    act(() => hook.result.current.load(ASK))
    await waitFor(() => expect(worker.posted).toHaveLength(1))
    expect(worker.posted[0]).toMatchObject({ targets: { code: 'E-HELPER-BAD-MESSAGE' }, store: { id: 's1' } })
    worker.reply({ type: 'error', op: 'load', code: 'E-HELPER-BAD-MESSAGE' })
    expect(hook.result.current.loading).toBe(false)
    expect(hook.result.current.error).toEqual({ op: 'load', code: 'E-HELPER-BAD-MESSAGE' })
  })

  it('AC-4905.1: 앞 불러오기의 스트림이 늦게 끝나면 보내지 않고, 다른 날 장부는 쓰지 않는다', async () => {
    let finish: (value: { id: string; count: number }) => void = () => {}
    const stream = vi.fn((cmd: string, args: { from?: string }) =>
      args.from === '2026-11-15' && cmd === 'contact.targets'
        ? new Promise<{ id: string; count: number }>((resolve) => (finish = resolve))
        : Promise.resolve({ id: `${cmd}-new`, count: 1 }),
    )
    const { worker, hook } = setup(stream as never)
    act(() => hook.result.current.load({ ...ASK, day: '2026-11-15' }))
    act(() => hook.result.current.load(ASK))
    await waitFor(() => expect(worker.posted).toHaveLength(1))
    finish({ id: 'old', count: 1 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(worker.posted).toHaveLength(1)
    expect(worker.posted[0]).toMatchObject({ day: '2026-11-16' })
    worker.reply(ledger('2026-11-15'))
    expect(hook.result.current.view).toBeNull()
    expect(hook.result.current.loading).toBe(true)
  })

  it('AC-4905.1: Worker 스크립트 오류는 E-ANALYZE-FAILED', () => {
    const { worker, hook } = setup()
    worker.fail()
    expect(hook.result.current.error).toEqual({ op: 'load', code: 'E-ANALYZE-FAILED' })
  })
})

describe('AC-4905.2 고치기', () => {
  it('AC-4905.2: edit를 보내고, 거절 오류는 보이고 다음 장부에서 지운다', async () => {
    const { worker, hook } = setup()
    act(() => hook.result.current.load(ASK))
    await waitFor(() => expect(worker.posted).toHaveLength(1))
    worker.reply(ledger())
    act(() => hook.result.current.edit('10231', { card: 20000 }))
    expect(worker.posted[1]).toEqual({ type: 'edit', chart: '10231', patch: { card: 20000 } })
    worker.reply({ type: 'error', op: 'edit', code: 'E-STORE-FAILED' })
    expect(hook.result.current.error).toEqual({ op: 'edit', code: 'E-STORE-FAILED' })
    worker.reply(ledger())
    expect(hook.result.current.error).toBeNull()
  })
})

describe('AC-4905.4 마감·마감 풀기', () => {
  it('AC-4905.4: close는 지금 시각을 보내고 closed 답(서버에 올릴 숫자)으로 풀린다', async () => {
    const { worker, hook } = setup()
    act(() => hook.result.current.load(ASK))
    await waitFor(() => expect(worker.posted).toHaveLength(1))
    worker.reply(ledger())
    let closing!: Promise<unknown>
    act(() => {
      closing = hook.result.current.close()
    })
    expect(worker.posted[1]).toEqual({ type: 'close', now: expect.any(Number) })
    worker.reply(ledger('2026-11-16', '2026-11-16T09:52:00.000Z'))
    worker.reply({ type: 'closed', day: '2026-11-16', totals: TOTALS, late: false })
    await expect(closing).resolves.toEqual({ day: '2026-11-16', totals: TOTALS, late: false })
    expect(hook.result.current.view?.closedAt).toBe('2026-11-16T09:52:00.000Z')
  })

  it('AC-4905.4: close가 거절되면 오류 번호로 풀린다', async () => {
    const { worker, hook } = setup()
    let closing!: Promise<unknown>
    act(() => {
      closing = hook.result.current.close()
    })
    worker.reply({ type: 'error', op: 'close', code: 'E-STORE-FAILED' })
    await expect(closing).resolves.toEqual({ code: 'E-STORE-FAILED' })
  })

  it('AC-4905.4: reopen은 다음 장부로 풀리고, 거절은 오류 번호로 풀린다', async () => {
    const { worker, hook } = setup()
    act(() => hook.result.current.load(ASK))
    await waitFor(() => expect(worker.posted).toHaveLength(1))
    worker.reply(ledger('2026-11-16', '2026-11-16T09:52:00.000Z'))
    let opening!: Promise<unknown>
    act(() => {
      opening = hook.result.current.reopen()
    })
    expect(worker.posted[1]).toEqual({ type: 'reopen' })
    worker.reply(ledger())
    await expect(opening).resolves.toEqual({ ok: true })
    act(() => {
      opening = hook.result.current.reopen()
    })
    worker.reply({ type: 'error', op: 'reopen', code: 'E-BRIDGE-DISCONNECTED' })
    await expect(opening).resolves.toEqual({ code: 'E-BRIDGE-DISCONNECTED' })
  })
})

describe('AC-5003.2 원장님별 수', () => {
  it('AC-5003.2: 장부 보기의 doctors(원장님별 수, 없으면 null)를 그대로 쥔다', async () => {
    const rates: SunapRates = { visits: 2, first_n: 1, d90_n: 0, ret_n: 1, block_n: 1, pt_n: 1, first_block: 1, d90_block: 0, ret_block: 0 }
    const doctors: DoctorBreakdown = {
      rows: [
        { code: 'D01', label: '가상원장가', rates },
        { code: 'D02', label: 'D02', rates },
      ],
      total: rates,
    }
    const { worker, hook } = setup()
    act(() => hook.result.current.load(ASK))
    await waitFor(() => expect(worker.posted).toHaveLength(1))
    worker.reply(ledger('2026-11-16', null, doctors))
    expect(hook.result.current.view?.doctors).toEqual(doctors)
    worker.reply(ledger())
    expect(hook.result.current.view?.doctors).toBeNull()
  })
})

describe('AC-5503.1 설정 종류 목록을 Worker로', () => {
  it('AC-5503.1: load 메시지는 words 대신 설정의 다음 예약 종류 목록(kinds)을 그대로 싣는다(spec sunap-kinds AC-5502.4)', async () => {
    const kinds = [...DEFAULT_RSV_KINDS, { id: 'kdosu01', label: '도수치료', counts: true, words: ['도수'] }]
    const { worker, hook } = setup()
    act(() => hook.result.current.load({ ...ASK, kinds }))
    await waitFor(() => expect(worker.posted).toHaveLength(1))
    expect(worker.posted[0]).toMatchObject({ type: 'load', kinds })
    expect(worker.posted[0]).not.toHaveProperty('words')
  })
})
