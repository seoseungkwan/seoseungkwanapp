// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BIT_FILL_KEYS, bitValuesFrom } from '@/lib/worklog/bitFill'
import type { RevenueDayRow, RevenueDaysResult } from '@/types/revenue'
import { useBitFill } from './useBitFill'

// 업무일지 비트 읽기 훅 (worklog REQ-017, design.md 20-1·20-5절). 통로(useBridge)는 가짜이고 revenue.days 답은 둥근 가짜 숫자다.
// 실제 비트·도우미·확장을 부르지 않는다
const bridge = vi.hoisted(() => ({
  state: 'ready' as string,
  helloError: null as string | null,
  call: vi.fn<(cmd: string, args: { from: string; to: string }) => Promise<RevenueDaysResult>>(),
}))
vi.mock('@/components/claim/useBridge', () => ({
  useBridge: () => ({ state: bridge.state, helloError: bridge.helloError, call: bridge.call }),
}))

const TODAY = '2026-11-05'
const PAST = '2026-11-03'
const NOW = new Date('2026-11-05T05:20:00Z') // 한국 시각 14:20
const MINUTE = 60_000

const row = (date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow => ({
  date,
  visits: 60,
  newPatients: 12,
  returnVisits: 48,
  total: 1000000,
  insurer: 600000,
  noncovered: 200000,
  copay: 100000,
  otherTotal: 100000,
  cash: 100000,
  card: 300000,
  transfer: 50000,
  receivableIn: 10000,
  unconfirmed: false,
  splitUnconfirmed: false,
  ...over,
})
const answer = (date: string, over: Partial<RevenueDayRow> = {}): RevenueDaysResult => ({ days: [row(date, over)], codes: [] })
// 금액을 세지 못한 날: 금액 아홉 칸이 모두 null
const UNCONFIRMED: Partial<RevenueDayRow> = {
  unconfirmed: true,
  total: null,
  insurer: null,
  noncovered: null,
  copay: null,
  otherTotal: null,
  cash: null,
  card: null,
  transfer: null,
  receivableIn: null,
}
const bridgeError = (code: string) => Object.assign(new Error(code), { code })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Props = { ymd: string; today: string; readOnly: boolean }
const setup = (props: Partial<Props> = {}) =>
  renderHook((p: Props) => useBitFill(p), { initialProps: { ymd: TODAY, today: TODAY, readOnly: false, ...props } })

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  bridge.state = 'ready'
  bridge.helloError = null
  bridge.call.mockReset()
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(document, 'visibilityState')
  vi.useRealTimers()
})

describe('AC-017.1 열면 읽기', () => {
  it('AC-017.1: 연결됨(ready)이면 그날 revenue.days를 { from, to } 그날로 한 번 부르고, 답 전에는 reading, 답 뒤 ready·values·lastReadAt이다', async () => {
    const reply = deferred<RevenueDaysResult>()
    bridge.call.mockReturnValueOnce(reply.promise)
    const { result } = setup()

    expect(bridge.call).toHaveBeenCalledTimes(1)
    expect(bridge.call).toHaveBeenCalledWith('revenue.days', { from: TODAY, to: TODAY })
    expect(result.current.status).toBe('reading')
    expect(result.current.lastReadAt).toBeNull()

    await act(async () => reply.resolve(answer(TODAY)))

    expect(result.current.status).toBe('ready')
    expect(result.current.ymd).toBe(TODAY)
    expect(result.current.values).toEqual(bitValuesFrom(row(TODAY)).values)
    expect(result.current.lastReadAt).toEqual(NOW)
  })

  it('AC-017.1: 답에 그날 줄이 없으면 비트 값 없이 ready다(지어내지 않는다)', async () => {
    bridge.call.mockResolvedValueOnce({ days: [], codes: [] })
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('ready')
    expect(result.current.values).toEqual({})
  })

  it('AC-017.1: 오늘이면 보이는 동안 10분마다 다시 읽고, 안 보일 때는 읽지 않는다', async () => {
    bridge.call.mockResolvedValue(answer(TODAY))
    setup()
    await settle()
    expect(bridge.call).toHaveBeenCalledTimes(1)

    await settle(10 * MINUTE - 1)
    expect(bridge.call).toHaveBeenCalledTimes(1)
    await settle(1)
    expect(bridge.call).toHaveBeenCalledTimes(2)
    expect(bridge.call).toHaveBeenLastCalledWith('revenue.days', { from: TODAY, to: TODAY })

    setVisibility('hidden')
    await settle(10 * MINUTE)
    expect(bridge.call).toHaveBeenCalledTimes(2)
    setVisibility('visible')
    await settle(10 * MINUTE)
    expect(bridge.call).toHaveBeenCalledTimes(3)
  })

  it('AC-017.1: 지난 날은 열 때 한 번만 읽고 10분 타이머가 없다', async () => {
    bridge.call.mockResolvedValue(answer(PAST))
    setup({ ymd: PAST })
    await settle(30 * MINUTE)
    expect(bridge.call).toHaveBeenCalledTimes(1)
    expect(bridge.call).toHaveBeenCalledWith('revenue.days', { from: PAST, to: PAST })
  })

  it('AC-017.1: 다른 날로 옮기면 그날을 바로 읽는다', async () => {
    bridge.call.mockResolvedValueOnce(answer(TODAY)).mockResolvedValueOnce(answer(PAST, { cash: 70000 }))
    const { result, rerender } = setup()
    await settle()
    rerender({ ymd: PAST, today: TODAY, readOnly: false })
    await settle()
    expect(bridge.call).toHaveBeenLastCalledWith('revenue.days', { from: PAST, to: PAST })
    expect(result.current.ymd).toBe(PAST)
    expect(result.current.values.cashIn).toBe(70000)
  })

  it('AC-017.1: 연결이 늦게 ready가 되면 그때 읽는다', async () => {
    bridge.state = 'connecting'
    bridge.call.mockResolvedValue(answer(TODAY))
    const { result, rerender } = setup()
    expect(bridge.call).not.toHaveBeenCalled()
    bridge.state = 'ready'
    rerender({ ymd: TODAY, today: TODAY, readOnly: false })
    await settle()
    expect(bridge.call).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('ready')
  })
})

describe('AC-017.4 읽을 수 없을 때의 상태', () => {
  it.each([
    ['connecting', null, 'reading'],
    ['connecting', 'E-BRIDGE-BAD-REPLY', 'setup-needed'],
    ['busy', null, 'not-connected'],
    ['disconnected', null, 'not-connected'],
    ['no-extension', null, 'setup-needed'],
    ['no-helper', null, 'setup-needed'],
    ['update-helper', null, 'setup-needed'],
    ['update-extension', null, 'setup-needed'],
  ])('AC-017.4: useBridge %s(helloError %s)는 %s이고 비트를 읽지 않는다', async (state, helloError, status) => {
    bridge.state = state
    bridge.helloError = helloError
    const { result } = setup()
    await settle(30 * MINUTE)
    expect(result.current.status).toBe(status)
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it.each(['E-BRIDGE-REJECTED', 'E-HELPER-UNKNOWN-COMMAND'])('AC-017.4: 통로 오류 %s는 읽기 실패가 아니라 setup-needed(확장/도우미 새 버전)다', async (code) => {
    bridge.call.mockRejectedValueOnce(bridgeError(code))
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('setup-needed')
  })

  it.each([
    ['E-BIT-READ-FAILED', bridgeError('E-BIT-READ-FAILED')],
    ['E-BRIDGE-BAD-REPLY', bridgeError('E-BRIDGE-BAD-REPLY')],
    ['E-BRIDGE-DISCONNECTED', bridgeError('E-BRIDGE-DISCONNECTED')],
    ['번호 없는 오류', new Error('가상 오류')],
  ])('AC-017.4: 그 밖의 읽기 오류(%s)는 failed다', async (_name, error) => {
    bridge.call.mockRejectedValueOnce(error)
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('failed')
    expect(result.current.values).toEqual({})
  })

  it('AC-017.4: 금액 확인이 필요한 날은 unconfirmed이고 values는 신환·재진뿐이다', async () => {
    bridge.call.mockResolvedValueOnce(answer(TODAY, UNCONFIRMED))
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('unconfirmed')
    expect(result.current.values).toEqual({ newPatients: 12, returnPatients: 48 })
  })

  it('AC-017.4: 나눔만 못 센 날(splitUnconfirmed)은 ready이고 조합청구액만 없다', async () => {
    bridge.call.mockResolvedValueOnce(
      answer(TODAY, { splitUnconfirmed: true, insurer: null, noncovered: null, copay: null, otherTotal: null }),
    )
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('ready')
    expect(result.current.values).not.toHaveProperty('claimAmount')
    expect(result.current.values.cashIn).toBe(100000)
  })
})

describe('AC-017.5 터치 기기', () => {
  it('AC-017.5: 터치 기기(readOnly)면 off이고 연결돼 있어도 읽지 않으며 10분 타이머도 없다', async () => {
    const { result } = setup({ readOnly: true })
    await settle(30 * MINUTE)
    expect(result.current.status).toBe('off')
    expect(bridge.call).not.toHaveBeenCalled()
  })
})

describe('AC-017.6 오는 것은 숫자뿐', () => {
  it('AC-017.6: 통로에는 revenue.days 숫자 명령만 부르고, values는 채우는 여덟 칸의 숫자뿐이다', async () => {
    bridge.call.mockResolvedValue(answer(TODAY))
    const { result } = setup()
    await settle(25 * MINUTE)
    expect(bridge.call.mock.calls.every(([cmd]) => cmd === 'revenue.days')).toBe(true)
    const entries = Object.entries(result.current.values)
    expect(entries.length).toBeGreaterThan(0)
    for (const [key, value] of entries) {
      expect(BIT_FILL_KEYS, key).toContain(key)
      expect(typeof value, key).toBe('number')
    }
  })
})

describe('AC-017.8 늦게 온 답', () => {
  it('AC-017.8: 날짜를 옮긴 뒤 온 옛 날짜 답은 버리고 새 날의 답만 쓴다', async () => {
    const old = deferred<RevenueDaysResult>()
    const fresh = deferred<RevenueDaysResult>()
    bridge.call.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    const { result, rerender } = setup()
    rerender({ ymd: PAST, today: TODAY, readOnly: false })

    await act(async () => old.resolve(answer(TODAY, { cash: 999000 })))
    expect(result.current).toMatchObject({ status: 'reading', ymd: PAST, values: {}, lastReadAt: null })

    await act(async () => fresh.resolve(answer(PAST, { cash: 70000 })))
    expect(result.current.status).toBe('ready')
    expect(result.current.ymd).toBe(PAST)
    expect(result.current.values.cashIn).toBe(70000)
  })

  it('AC-017.8: 날짜를 옮기면 새 날을 읽는 동안 옛 날의 값·시각을 새 날 것으로 보이지 않는다', async () => {
    bridge.call.mockResolvedValueOnce(answer(TODAY)).mockReturnValueOnce(deferred<RevenueDaysResult>().promise)
    const { result, rerender } = setup()
    await settle()
    expect(result.current.status).toBe('ready')
    rerender({ ymd: PAST, today: TODAY, readOnly: false })
    expect(result.current).toMatchObject({ status: 'reading', ymd: PAST, values: {}, lastReadAt: null })
  })

  it('AC-017.8: 연결이 끊기면 그 뒤 온 답을 쓰지 않는다', async () => {
    const reply = deferred<RevenueDaysResult>()
    bridge.call.mockReturnValueOnce(reply.promise)
    const { result, rerender } = setup()
    bridge.state = 'disconnected'
    rerender({ ymd: TODAY, today: TODAY, readOnly: false })
    await act(async () => reply.resolve(answer(TODAY)))
    expect(result.current.status).toBe('not-connected')
    expect(result.current.values).toEqual({})
  })
})

describe('AC-017.9 [지금 불러오기] (reload)', () => {
  it('AC-017.9: reload는 같은 { from, to }로 바로 다시 읽고, 읽는 동안 reading이며 앞 values·lastReadAt은 그대로이고, 답 뒤 새 값·새 시각이다', async () => {
    bridge.call.mockResolvedValueOnce(answer(TODAY))
    const { result } = setup()
    await settle()
    const first = result.current.values
    await settle(5 * MINUTE)

    const again = deferred<RevenueDaysResult>()
    bridge.call.mockReturnValueOnce(again.promise)
    act(() => result.current.reload())

    expect(bridge.call).toHaveBeenCalledTimes(2)
    expect(bridge.call).toHaveBeenLastCalledWith('revenue.days', { from: TODAY, to: TODAY })
    expect(result.current.status).toBe('reading')
    expect(result.current.values).toBe(first)
    expect(result.current.lastReadAt).toEqual(NOW)

    await act(async () => again.resolve(answer(TODAY, { card: 320000 })))
    expect(result.current.status).toBe('ready')
    expect(result.current.values.cardIn).toBe(320000)
    expect(result.current.lastReadAt).toEqual(new Date(NOW.getTime() + 5 * MINUTE))
  })

  it('AC-017.9: 오늘이면 10분 타이머를 누른 때부터 다시 센다(누르기 전 타이머로는 읽지 않는다)', async () => {
    bridge.call.mockResolvedValue(answer(TODAY))
    const { result } = setup()
    await settle(4 * MINUTE)
    act(() => result.current.reload())
    await settle()
    expect(bridge.call).toHaveBeenCalledTimes(2)

    await settle(6 * MINUTE)
    expect(bridge.call).toHaveBeenCalledTimes(2)
    await settle(4 * MINUTE)
    expect(bridge.call).toHaveBeenCalledTimes(3)
  })

  it('AC-017.9: 지난 날은 눌러도 10분 타이머를 걸지 않는다', async () => {
    bridge.call.mockResolvedValue(answer(PAST))
    const { result } = setup({ ymd: PAST })
    await settle()
    act(() => result.current.reload())
    await settle(30 * MINUTE)
    expect(bridge.call).toHaveBeenCalledTimes(2)
  })

  it('AC-017.9: 읽기 실패한 날에 누른 읽기가 성공하면 ready가 된다', async () => {
    bridge.call.mockRejectedValueOnce(bridgeError('E-BIT-READ-FAILED')).mockResolvedValueOnce(answer(TODAY))
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('failed')
    act(() => result.current.reload())
    await settle()
    expect(result.current.status).toBe('ready')
    expect(result.current.lastReadAt).toEqual(NOW)
  })

  it('AC-017.9: 확인 필요 날에도 누르면 다시 읽는다', async () => {
    bridge.call.mockResolvedValueOnce(answer(TODAY, UNCONFIRMED)).mockResolvedValueOnce(answer(TODAY))
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('unconfirmed')
    act(() => result.current.reload())
    await settle()
    expect(bridge.call).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('ready')
  })

  it('AC-017.9: 읽는 중(reading)에는 reload가 다시 부르지 않는다', () => {
    bridge.call.mockReturnValueOnce(deferred<RevenueDaysResult>().promise)
    const { result } = setup()
    act(() => result.current.reload())
    expect(bridge.call).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['not-connected', { state: 'disconnected' }, false],
    ['setup-needed', { state: 'no-helper' }, false],
    ['off', { state: 'ready' }, true],
  ] as const)('AC-017.9: %s에서는 reload가 아무것도 하지 않는다', async (_status, { state }, readOnly) => {
    bridge.state = state
    const { result } = setup({ readOnly })
    act(() => result.current.reload())
    await settle()
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-017.9: 통로 오류로 setup-needed가 된 날에는 reload가 다시 부르지 않는다', async () => {
    bridge.call.mockRejectedValueOnce(bridgeError('E-HELPER-UNKNOWN-COMMAND'))
    const { result } = setup()
    await settle()
    act(() => result.current.reload())
    await settle()
    expect(bridge.call).toHaveBeenCalledTimes(1)
  })
})
