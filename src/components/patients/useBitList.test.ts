// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import { LIST_HELPER } from '@/lib/bridge/versions'
import type { ListViewMessage, PatientsWorkerMessage } from '@/types/patients'
import type { PatientsTool } from './tools'
import { readAtText, useBitList } from './useBitList'
import type { PatientsBridge, PatientsWorkerHandle } from './usePatientsWorker'

// 비트 명단 두 도구의 읽기(AC-2802.2~2802.6, design.md useBitList). 가짜 통로·가짜 Worker로 부르는 차례만 본다.
// 오늘은 2026-11-06(금) 한국 오후 6:20으로 둔다(시안과 같은 날)

const NOW = Date.UTC(2026, 10, 6, 9, 20) // 한국 2026-11-06 18:20
const TODAY = '2026-11-06'
const RESERVATION_ARGS = { kind: 'reservation', from: '2026-10-07', to: '2026-11-20' }
const LAPSED_ARGS = { kind: 'lapsed', from: '2024-11-07', to: '2026-10-06' }
const PICK = { preset: 'tomorrow' as const, day: '2026-11-07', note: null }

type Call = { cmd: string; args: Record<string, unknown>; ok(id: string): void; fail(error: unknown): void }

function fakeBridge() {
  const calls: Call[] = []
  const stream = vi.fn(
    (cmd: string, args: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        calls.push({ cmd, args, ok: (id) => resolve({ id, count: 1 }), fail: reject })
      }),
  )
  return { calls, stream: stream as unknown as PatientsBridge['stream'] }
}

function fakeWorker() {
  const posted: Record<string, unknown>[] = []
  const byType = new Map<string, Set<(event: Event) => void>>()
  const of = (type: string) => {
    let set = byType.get(type)
    if (!set) byType.set(type, (set = new Set()))
    return set
  }
  const worker: PatientsWorkerHandle = {
    postMessage: (message) => void posted.push(message as Record<string, unknown>),
    addEventListener: (type, listener) => void of(type).add(listener),
    removeEventListener: (type, listener) => void of(type).delete(listener),
  }
  const fire = (event: Event) =>
    act(() => {
      for (const listener of [...of(event.type)]) listener(event)
    })
  return {
    posted,
    worker,
    emit: (message: PatientsWorkerMessage) => fire(new MessageEvent('message', { data: message })),
    emitError: () => fire(new Event('error', { cancelable: true })),
    emitMessageError: () => fire(new MessageEvent('messageerror')),
    listeners: () => [...byType.values()].reduce((n, set) => n + set.size, 0),
  }
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

function setup(options: { tool?: PatientsTool; helperVersion?: string | null; strict?: boolean } = {}) {
  const bridge = fakeBridge()
  const w = fakeWorker()
  const renew = vi.fn()
  const helperVersion = options.helperVersion === null ? undefined : (options.helperVersion ?? LIST_HELPER)
  const hook = renderHook((props: { tool: PatientsTool }) => useBitList({ stream: bridge.stream, worker: w.worker, tool: props.tool, helperVersion, renew }), {
    initialProps: { tool: options.tool ?? 'followup' },
    wrapper: options.strict ? StrictMode : undefined,
  })
  const open = (tool: PatientsTool) => hook.rerender({ tool })
  const targets = () => bridge.calls.filter((call) => call.cmd === 'contact.targets').map((call) => call.args)
  const lists = () => w.posted.filter((message) => message.type === 'list')
  return { ...hook, ...w, bridge, renew, open, targets, lists }
}

const okReservations = (over: Partial<Extract<ListViewMessage, { tool: 'reservations'; ok: true }>> = {}): ListViewMessage => ({
  type: 'list-view',
  tool: 'reservations',
  ok: true,
  readAt: NOW,
  total: 9,
  pick: PICK,
  dayCounts: { tomorrow: 9, after: 0 },
  ...over,
})
const okLapsed = (total = 128): ListViewMessage => ({ type: 'list-view', tool: 'lapsed', ok: true, readAt: NOW, total })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('처음 열 때 한 번 읽기 (AC-2802.2)', () => {
  it('AC-2802.2: 들어올 때(다른 도구)는 읽지 않는다. 예약 문자 명단을 처음 열면 그때 오늘−30일 ~ 오늘+14일을 한 번 읽는다', () => {
    const t = setup({ tool: 'followup' })
    expect(t.targets()).toEqual([])
    expect(t.result.current.reservations.phase).toBe('idle')
    expect(t.result.current.lapsed.phase).toBe('idle')

    t.open('reservations')
    expect(t.targets()).toEqual([RESERVATION_ARGS])
    expect(t.result.current.reservations.phase).toBe('reading')
    // 다른 도구는 그대로 읽지 않았다
    expect(t.result.current.lapsed.phase).toBe('idle')
  })

  it('AC-2802.2: 장기 미방문 명단은 오늘에서 24달 전 다음 날 ~ 1달 전을 읽는다', () => {
    const t = setup({ tool: 'lapsed' })
    expect(t.targets()).toEqual([LAPSED_ARGS])
    expect(t.result.current.lapsed.phase).toBe('reading')
    expect(t.result.current.reservations.phase).toBe('idle')
  })

  it('AC-2802.2: 다른 도구로 갔다 와도 다시 읽지 않는다(읽는 중에도, 다 읽은 뒤에도)', async () => {
    const t = setup({ tool: 'reservations' })
    t.open('recall')
    t.open('reservations')
    expect(t.targets()).toHaveLength(1)
    t.bridge.calls[0]!.ok('s1')
    await flush()
    t.emit(okReservations())
    t.open('messages')
    t.open('reservations')
    expect(t.targets()).toHaveLength(1)
  })

  it('AC-2802.2: StrictMode에서도 한 번만 읽고 list도 한 번 보낸다', async () => {
    const t = setup({ tool: 'reservations', strict: true })
    expect(t.targets()).toEqual([RESERVATION_ARGS])
    t.bridge.calls[0]!.ok('s1')
    await flush()
    expect(t.lists()).toHaveLength(1)
  })

  it('AC-2802.2: 스트림이 열리면 바로 Worker에 {list, 도구, 그 기간을 정한 오늘, id}를 보낸다', async () => {
    const t = setup({ tool: 'reservations' })
    expect(t.posted).toEqual([])
    t.bridge.calls[0]!.ok('s1')
    await flush()
    expect(t.posted).toEqual([{ type: 'list', tool: 'reservations', today: TODAY, id: 's1' }])
  })

  it('AC-2802.6: 스트림이 거절되면 번호를 list로 알린다. 번호 없는 오류는 E-BRIDGE-REJECTED(글은 싣지 않는다)', async () => {
    const t = setup({ tool: 'reservations' })
    t.bridge.calls[0]!.fail(new BridgeError('E-BIT-READ-FAILED'))
    t.open('lapsed')
    t.bridge.calls[1]!.fail(new Error('가상환자 010-0000-0000'))
    await flush()
    expect(t.posted).toEqual([
      { type: 'list', tool: 'reservations', today: TODAY, code: 'E-BIT-READ-FAILED' },
      { type: 'list', tool: 'lapsed', today: TODAY, code: 'E-BRIDGE-REJECTED' },
    ])
  })

  it('AC-2802.2: 화면을 떠난 뒤 열린 스트림은 Worker에 알리지 않고 듣기도 모두 뗀다', async () => {
    const t = setup({ tool: 'reservations' })
    expect(t.listeners()).toBeGreaterThan(0)
    t.unmount()
    t.bridge.calls[0]!.ok('s1')
    await flush()
    expect(t.posted).toEqual([])
    expect(t.listeners()).toBe(0)
  })
})

describe('읽은 뒤·다시 불러오기 (AC-2802.4)', () => {
  it('AC-2802.4: list-view(ok)가 오면 ready이고 읽은 때·줄 수·처음 고를 날·인원수·그 오늘을 지닌다', async () => {
    const t = setup({ tool: 'reservations' })
    t.bridge.calls[0]!.ok('s1')
    await flush()
    t.emit(okReservations())
    expect(t.result.current.reservations).toEqual({
      phase: 'ready',
      ready: { today: TODAY, readAt: NOW, total: 9, pick: PICK, dayCounts: { tomorrow: 9, after: 0 } },
    })
  })

  it('AC-2802.4: 장기 미방문 ready는 읽은 때·줄 수·그 오늘', async () => {
    const t = setup({ tool: 'lapsed' })
    t.bridge.calls[0]!.ok('l1')
    await flush()
    t.emit(okLapsed(128))
    expect(t.result.current.lapsed).toEqual({ phase: 'ready', ready: { today: TODAY, readAt: NOW, total: 128 } })
  })

  it('AC-2802.4: 다른 도구의 list-view나 다른 메시지로는 바뀌지 않는다', async () => {
    const t = setup({ tool: 'reservations' })
    t.emit(okLapsed())
    t.emit({ type: 'marked', key: 's|1|202611070900', ok: true, counts: null })
    expect(t.result.current.reservations.phase).toBe('reading')
    expect(t.result.current.lapsed.phase).toBe('idle')
  })

  it('AC-2802.4: readAtText는 한국 시각으로 M월 D일 오전|오후 h:mm에 읽음이다(12시는 오후 12:00)', () => {
    expect(readAtText(NOW)).toBe('11월 6일 오후 6:20에 읽음')
    expect(readAtText(Date.UTC(2026, 10, 6, 0, 5))).toBe('11월 6일 오전 9:05에 읽음')
    expect(readAtText(Date.UTC(2026, 10, 6, 3, 0))).toBe('11월 6일 오후 12:00에 읽음')
    // 한국은 벌써 다음 날 0시 5분
    expect(readAtText(Date.UTC(2026, 10, 6, 15, 5))).toBe('11월 7일 오전 0:05에 읽음')
  })

  it('AC-2802.4: [다시 불러오기]는 그 도구만 다시 읽고, 읽는 동안 앞 결과를 지닌다. 새 답이 오면 그 답이다', async () => {
    const t = setup({ tool: 'reservations' })
    t.bridge.calls[0]!.ok('s1')
    await flush()
    t.emit(okReservations())
    const first = t.result.current.reservations.ready

    act(() => t.result.current.reload('reservations'))
    expect(t.targets()).toEqual([RESERVATION_ARGS, RESERVATION_ARGS])
    expect(t.result.current.reservations.phase).toBe('reading')
    expect(t.result.current.reservations.ready).toEqual(first)
    expect(t.result.current.lapsed.phase).toBe('idle')

    t.bridge.calls[1]!.ok('s2')
    await flush()
    expect(t.lists().at(-1)).toEqual({ type: 'list', tool: 'reservations', today: TODAY, id: 's2' })
    t.emit(okReservations({ readAt: NOW + 60_000, total: 12 }))
    expect(t.result.current.reservations).toMatchObject({ phase: 'ready', ready: { readAt: NOW + 60_000, total: 12 } })
  })
})

describe('도우미 버전 (AC-2802.5)', () => {
  it.each([
    ['낮은 버전', '0.0.1'],
    ['읽을 수 없는 버전', 'x'],
    ['버전 없음', null],
  ])('AC-2802.5: 도우미가 LIST_HELPER보다 낮으면(%s) 읽지 않고 old-helper다. [다시 불러오기]도 읽지 않는다', (_name, version) => {
    const t = setup({ tool: 'reservations', helperVersion: version })
    t.open('lapsed')
    act(() => t.result.current.reload('reservations'))
    expect(t.targets()).toEqual([])
    expect(t.result.current.reservations.phase).toBe('old-helper')
    expect(t.result.current.lapsed.phase).toBe('old-helper')
    expect(t.posted).toEqual([])
  })

  it.each([LIST_HELPER, '99.0.0'])('AC-2802.5: 도우미가 %s면 읽는다', (version) => {
    const t = setup({ tool: 'reservations', helperVersion: version })
    expect(t.targets()).toEqual([RESERVATION_ARGS])
  })
})

describe('읽기 실패 (AC-2802.6)', () => {
  it('AC-2802.6: list-view 실패는 그 도구만 실패(번호)이고 다른 도구는 그대로다', async () => {
    const t = setup({ tool: 'reservations' })
    t.open('lapsed')
    t.emit({ type: 'list-view', tool: 'lapsed', ok: false, code: 'E-BIT-READ-FAILED' })
    expect(t.result.current.lapsed).toEqual({ phase: 'failed', code: 'E-BIT-READ-FAILED', ready: null })
    expect(t.result.current.reservations.phase).toBe('reading')
  })

  it('AC-2802.6: 읽은 뒤에 실패가 와도(보기 모양을 못 만듦) 실패이고 앞 결과는 지닌다. [다시 불러오기]로 다시 읽는다', async () => {
    const t = setup({ tool: 'reservations' })
    t.bridge.calls[0]!.ok('s1')
    await flush()
    t.emit(okReservations())
    t.emit({ type: 'list-view', tool: 'reservations', ok: false, code: 'E-BRIDGE-BAD-REPLY' })
    expect(t.result.current.reservations).toMatchObject({ phase: 'failed', code: 'E-BRIDGE-BAD-REPLY', ready: { total: 9 } })
    act(() => t.result.current.reload('reservations'))
    expect(t.targets()).toHaveLength(2)
    expect(t.result.current.reservations.phase).toBe('reading')
  })

  it.each(['error', 'messageerror'] as const)('AC-2802.6: Worker가 %s를 내면 연 도구는 E-ANALYZE-FAILED이고, [다시 불러오기]는 같은 Worker로 읽지 않고 renew를 부른다', async (kind) => {
    const t = setup({ tool: 'reservations' })
    if (kind === 'error') t.emitError()
    else t.emitMessageError()
    expect(t.result.current.reservations).toMatchObject({ phase: 'failed', code: 'E-ANALYZE-FAILED' })
    // 그 뒤 처음 여는 도구도 읽지 않고 같은 카드다
    t.open('lapsed')
    expect(t.result.current.lapsed).toMatchObject({ phase: 'failed', code: 'E-ANALYZE-FAILED' })
    act(() => t.result.current.reload('lapsed'))
    expect(t.renew).toHaveBeenCalledTimes(1)
    t.bridge.calls[0]!.ok('s1')
    await flush()
    expect(t.targets()).toHaveLength(1)
    expect(t.posted).toEqual([])
  })
})

describe('보냄 표시 (AC-2803.8)', () => {
  it('AC-2803.8: markMany는 mark-many(열쇠·켬·오늘)를 Worker에 바로 보낸다', () => {
    const t = setup({ tool: 'reservations' })
    act(() => t.result.current.markMany(['s|1|202611070900', 's|2|202611070930'], TODAY))
    expect(t.posted).toEqual([{ type: 'mark-many', keys: ['s|1|202611070900', 's|2|202611070930'], on: true, today: TODAY }])
  })

  it('AC-2803.8: 저장 불러오기 답(stored)으로 표시를 쓸 수 있는지 안다: 모름 → 실패 번호 → 됨', () => {
    const t = setup({ tool: 'followup' })
    expect(t.result.current.storeCode).toBeUndefined()
    t.emit({ type: 'stored', ok: false, code: 'E-STORE-BROKEN', recall: [] })
    expect(t.result.current.storeCode).toBe('E-STORE-BROKEN')
    t.emit({ type: 'stored', ok: false, recall: [] })
    expect(t.result.current.storeCode).toBe('E-STORE-FAILED')
    t.emit({ type: 'stored', ok: true, recall: [] })
    expect(t.result.current.storeCode).toBeNull()
  })
})

describe('통로 타입 (AC-2801.5)', () => {
  const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

  it('AC-2801.5: bridge 타입의 contact.targets kind에 lapsed·reservation이 있고, useBitList는 타입을 속이지 않고 부른다', () => {
    const kinds = source('src/types/bridge.ts').match(/'contact\.targets':\s*Period\s*&\s*\{\s*kind:\s*([^}]+)\}/)
    expect(kinds?.[1]).toMatch(/'lapsed'/)
    expect(kinds?.[1]).toMatch(/'reservation'/)
    expect(source('src/components/patients/useBitList.ts')).not.toMatch(/as unknown as/)
  })
})
