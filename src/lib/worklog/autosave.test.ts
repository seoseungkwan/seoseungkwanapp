import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorklogStorageError } from '@/lib/storage/worklogDays'
import { emptyWorklogDay, type WorklogChanges, type WorklogDay, type WorklogNumberKey } from '@/types/worklog'
import { createAutosave, type AutosaveOptions, type AutosaveSnapshot } from './autosave'

// 자동 저장 제어 (REQ-006, design.md 10절). 숫자와 글자는 모두 지어낸 것이다

const YMD = '2026-10-05'
const OTHER = '2026-10-06'
const PHONE = '010-0000-1234' // notes.test.ts와 같은 지어낸 번호

const dayWith = (cells: WorklogChanges): WorklogDay => ({ ...emptyWorklogDay(), ...cells })
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms)
const failedError = () => new WorklogStorageError('failed')
const offlineError = () => new WorklogStorageError('offline')

type SaveCall = {
  ymd: string
  changes: WorklogChanges
  bitFields: readonly WorklogNumberKey[] | undefined // 받지 않았으면 undefined(AC-017.7)
  args: number // save가 받은 인자 수
  succeed: () => Promise<void>
  fail: (err: unknown) => Promise<void>
}

// 가짜 save는 응답을 시험이 정할 때까지 기다린다(동시 저장이 없는지 보려고)
function harness(options: Partial<AutosaveOptions> = {}) {
  const calls: SaveCall[] = []
  const save = vi.fn<AutosaveOptions['save']>(
    (...args: Parameters<AutosaveOptions['save']>) =>
      new Promise<void>((resolve, reject) => {
        const [ymd, changes, bitFields] = args
        calls.push({
          ymd,
          changes,
          bitFields,
          args: args.length,
          succeed: async () => {
            resolve()
            await wait(0)
          },
          fail: async (err) => {
            reject(err)
            await wait(0)
          },
        })
      }),
  )
  return { autosave: createAutosave({ save, ...options }), save, calls }
}

type Harness = ReturnType<typeof harness>
type DayKind = 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked'

// 날짜 하나를 원하는 상태로 만든다. retryDelaysMs: [] 하네스에서 failed가 바로 멈춘다
async function put({ autosave, calls }: Harness, ymd: string, kind: DayKind) {
  if (kind === 'idle') {
    autosave.serverDay(ymd, null)
    return
  }
  autosave.change(ymd, dayWith(kind === 'blocked' ? { memo: PHONE } : { cashIn: '100000' }))
  if (kind === 'pending') return
  await wait(800)
  if (kind === 'saved') await calls[calls.length - 1].succeed()
  if (kind === 'offline') await calls[calls.length - 1].fail(offlineError())
  if (kind === 'failed') await calls[calls.length - 1].fail(failedError())
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createAutosave 묶기와 바뀐 칸', () => {
  it('AC-006.1: 마지막 바뀜 뒤 800ms 조용하면 한 번만 저장한다(700ms에 또 바뀌면 그 뒤 800ms)', async () => {
    const { autosave, save } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    await wait(700)
    autosave.change(YMD, dayWith({ cashIn: '200000' }))
    await wait(799)
    expect(save).not.toHaveBeenCalled()
    await wait(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(YMD, { cashIn: '200000' })
  })

  it('AC-006.1: 칸 하나만 바꾸면 그 칸만 save에 간다', async () => {
    const { autosave, save } = harness()
    const server = dayWith({ cashIn: '100000', cardIn: '200000', memo: '가상 메모', nameCashIn: '가상 항목' })
    autosave.serverDay(YMD, server)
    autosave.change(YMD, { ...server, cardIn: '300000' })
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { cardIn: '300000' })
  })

  it('AC-006.1: 처음 읽기 전이면 아는 값은 빈 하루라 적은 칸만 간다', async () => {
    const { autosave, save } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { memo: '가상 메모' })
  })

  it('AC-006.1: 기다리는 동안 전체 상태는 saving으로 보인다', () => {
    const { autosave } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    expect(autosave.snapshot().state).toBe('saving')
  })

  it('AC-006.1: 주입한 간격과 타이머를 쓴다', async () => {
    const setTimeoutSpy = vi.fn(setTimeout)
    const clearTimeoutSpy = vi.fn(clearTimeout)
    const { autosave, save } = harness({
      delayMs: 100,
      timers: { setTimeout: setTimeoutSpy as unknown as typeof setTimeout, clearTimeout: clearTimeoutSpy as unknown as typeof clearTimeout },
    })
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    autosave.change(YMD, dayWith({ memo: '가상 메모 둘' }))
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2)
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
    await wait(100)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('AC-006.2: 저장 중 또 바뀌면 끝난 뒤 남은 차이만 한 번 더, 같은 날 동시 저장은 없다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    await wait(800)
    autosave.change(YMD, dayWith({ cashIn: '100000', memo: '가상 메모' }))
    await wait(60_000)
    expect(save).toHaveBeenCalledTimes(1) // 앞 저장이 안 끝났으니 둘째를 시작하지 않는다
    await calls[0].succeed()
    expect(save).toHaveBeenCalledTimes(2)
    expect(calls[1].changes).toEqual({ memo: '가상 메모' })
    expect(autosave.snapshot().state).toBe('saving')
    await calls[1].succeed()
    expect(save).toHaveBeenCalledTimes(2)
    expect(autosave.snapshot().state).toBe('saved')
  })

  it('AC-006.2: 보내는 중인 칸을 되돌리면 끝난 뒤 되돌린 값을 보낸다', async () => {
    const { autosave, calls } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    await wait(800)
    autosave.change(YMD, dayWith({}))
    await calls[0].succeed()
    expect(calls[1].changes).toEqual({ cashIn: '' })
  })

  it('AC-006.3: 저장에 성공하면 saved와 저장한 시각이다', async () => {
    const at = new Date('2026-11-01T05:00:00.000Z')
    const { autosave, calls } = harness({ now: () => at })
    expect(autosave.snapshot().savedAt).toBeNull()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    expect(autosave.snapshot().savedAt).toBeNull()
    await calls[0].succeed()
    expect(autosave.snapshot()).toEqual({ state: 'saved', savedAt: at, blocked: null })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-006.3: savedAt은 가장 최근 성공 시각이고 뒤의 실패로 지워지지 않는다', async () => {
    let clock = new Date('2026-11-01T05:00:00.000Z')
    const h = harness({ now: () => clock, retryDelaysMs: [] })
    const { autosave, calls } = h
    await put(h, YMD, 'saved')
    const first = clock
    clock = new Date('2026-11-01T06:00:00.000Z')
    expect(autosave.snapshot().savedAt).toEqual(first)
    autosave.change(YMD, dayWith({ cashIn: '200000' }))
    await wait(800)
    await calls[1].fail(failedError())
    expect(autosave.snapshot().savedAt).toEqual(first)
    autosave.retry()
    await calls[2].succeed()
    expect(autosave.snapshot().savedAt).toEqual(clock)
  })
})

describe('createAutosave 실패와 다시 하기', () => {
  it('AC-006.4: 실패하면 2초·5초·15초 뒤 다시 하고, 그래도 안 되면 failed로 멈춘다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    await calls[0].fail(failedError())
    for (const [index, delay] of [2000, 5000, 15000].entries()) {
      await wait(delay - 1)
      expect(save).toHaveBeenCalledTimes(index + 1)
      expect(autosave.snapshot().state).toBe('saving') // 다시 할 일이 남았으니 아직 failed로 보이지 않는다
      await wait(1)
      expect(save).toHaveBeenCalledTimes(index + 2)
      expect(calls[index + 1].changes).toEqual({ memo: '가상 메모' })
      await calls[index + 1].fail(failedError())
    }
    expect(autosave.snapshot().state).toBe('failed')
    expect(autosave.hasUnsaved()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    await wait(3_600_000)
    expect(save).toHaveBeenCalledTimes(4)
  })

  it('AC-006.4: retry()는 failed인 날을 바로 저장하고 성공하면 saved다', async () => {
    const h = harness({ retryDelaysMs: [] })
    const { autosave, calls } = h
    await put(h, YMD, 'failed')
    expect(autosave.snapshot().state).toBe('failed')
    autosave.retry()
    expect(calls).toHaveLength(2)
    expect(autosave.snapshot().state).toBe('saving')
    await calls[1].succeed()
    expect(autosave.snapshot().state).toBe('saved')
    expect(autosave.hasUnsaved()).toBe(false)
  })

  it('AC-006.4: failed에서 retry()가 또 실패하면 2초부터 다시 센다', async () => {
    const { autosave, save, calls } = harness({ retryDelaysMs: [2000] })
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    await calls[0].fail(failedError())
    await wait(2000)
    await calls[1].fail(failedError())
    expect(autosave.snapshot().state).toBe('failed')
    autosave.retry()
    await calls[2].fail(failedError())
    expect(autosave.snapshot().state).toBe('saving')
    await wait(2000)
    expect(save).toHaveBeenCalledTimes(4)
  })

  it('AC-006.4: retry()는 기다리는 날·끊긴 날도 바로 저장하고, 저장 끝난 날·막힌 날은 부르지 않는다', async () => {
    const pendingCase = harness()
    pendingCase.autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    pendingCase.autosave.retry()
    expect(pendingCase.save).toHaveBeenCalledTimes(1)
    await pendingCase.calls[0].succeed()
    pendingCase.autosave.retry()
    expect(pendingCase.save).toHaveBeenCalledTimes(1)

    const offlineCase = harness()
    await put(offlineCase, YMD, 'offline')
    offlineCase.autosave.retry()
    expect(offlineCase.save).toHaveBeenCalledTimes(2)
    await offlineCase.calls[1].succeed()

    const blockedCase = harness()
    await put(blockedCase, YMD, 'blocked')
    blockedCase.autosave.retry()
    expect(blockedCase.save).not.toHaveBeenCalled()
  })

  it('AC-006.4: 다시 하기 전에 칸이 또 바뀌면 그때의 차이를 보낸다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    await wait(800)
    await calls[0].fail(failedError())
    await wait(1000)
    autosave.change(YMD, dayWith({ memo: '가상 메모' })) // 금액은 되돌리고 업무사항을 적음
    await wait(799)
    expect(save).toHaveBeenCalledTimes(1) // 옛 2초 타이머는 없어졌다
    await wait(1)
    expect(save).toHaveBeenCalledTimes(2)
    expect(calls[1].changes).toEqual({ memo: '가상 메모' })
  })

  it('AC-006.4: 실패해도 아는 값이 그대로라 다음 시도가 같은 차이를 보낸다', async () => {
    const { autosave, calls } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000', memo: '가상 메모' }))
    await wait(800)
    await calls[0].fail(failedError())
    await wait(2000)
    expect(calls[1].changes).toEqual({ cashIn: '100000', memo: '가상 메모' })
  })

  it('AC-006.4: 멈춘 뒤 칸을 고치면 800ms 뒤 저장하고 실패하면 2초부터 다시 센다', async () => {
    const { autosave, save, calls } = harness({ retryDelaysMs: [2000] })
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    await calls[0].fail(failedError())
    await wait(2000)
    await calls[1].fail(failedError())
    expect(autosave.snapshot().state).toBe('failed')
    autosave.change(YMD, dayWith({ memo: '가상 메모 둘' }))
    expect(autosave.snapshot().state).toBe('saving')
    await wait(800)
    await calls[2].fail(failedError())
    await wait(2000)
    expect(save).toHaveBeenCalledTimes(4)
  })

  it('AC-006.4: 다시 해서 성공한 뒤의 실패는 2초부터 다시 센다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    await calls[0].fail(failedError())
    await wait(2000)
    await calls[1].succeed()
    autosave.change(YMD, dayWith({ memo: '가상 메모 둘' }))
    await wait(800)
    await calls[2].fail(failedError())
    await wait(1999)
    expect(save).toHaveBeenCalledTimes(3)
    await wait(1)
    expect(save).toHaveBeenCalledTimes(4)
  })

  it.each([
    ['WorklogStorageError가 아닌 오류', () => new Error('가상 오류')],
    ['오류 객체가 아닌 값', () => '가상 오류'],
  ])('AC-006.4: %s도 failed로 다룬다', async (_name, makeError) => {
    const { autosave, calls } = harness({ retryDelaysMs: [] })
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    await calls[0].fail(makeError())
    expect(autosave.snapshot().state).toBe('failed')
  })

  it('AC-006.4: save가 바로 던져도 실패로 다룬다', async () => {
    const save = vi.fn<AutosaveOptions['save']>(() => {
      throw new Error('가상 오류')
    })
    const autosave = createAutosave({ save, retryDelaysMs: [] })
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    expect(autosave.snapshot().state).toBe('failed')
    expect(autosave.hasUnsaved()).toBe(true)
  })

  it('AC-006.5: offline이면 15초마다 차이만 다시 하고, 멈추지 않는다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    await calls[0].fail(offlineError())
    for (let round = 1; round <= 6; round += 1) {
      expect(autosave.snapshot().state).toBe('offline')
      expect(autosave.hasUnsaved()).toBe(true)
      await wait(14_999)
      expect(save).toHaveBeenCalledTimes(round)
      await wait(1)
      expect(save).toHaveBeenCalledTimes(round + 1)
      expect(calls[round].changes).toEqual({ memo: '가상 메모' })
      await calls[round].fail(offlineError())
    }
  })

  it('AC-006.5: online()이면 끊긴 날을 바로 저장하고 15초 타이머는 없어진다', async () => {
    const h = harness()
    const { autosave, save, calls } = h
    await put(h, YMD, 'offline')
    autosave.online()
    expect(save).toHaveBeenCalledTimes(2)
    await calls[1].succeed()
    expect(autosave.snapshot().state).toBe('saved')
    expect(vi.getTimerCount()).toBe(0)
    await wait(60_000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('AC-006.5: online()은 끊기지 않은 날을 부르지 않는다', async () => {
    const h = harness({ retryDelaysMs: [] })
    await put(h, YMD, 'saved')
    await put(h, OTHER, 'failed')
    const before = h.save.mock.calls.length
    h.autosave.online()
    expect(h.save).toHaveBeenCalledTimes(before)
  })

  it('AC-006.5: 끊겨 있는 동안 고치면 그때의 차이를 보낸다', async () => {
    const h = harness()
    const { autosave, calls } = h
    await put(h, YMD, 'offline')
    autosave.change(YMD, dayWith({ cashIn: '100000', memo: '가상 메모' }))
    await wait(800)
    expect(calls[1].changes).toEqual({ cashIn: '100000', memo: '가상 메모' })
  })
})

describe('createAutosave 막힌 칸', () => {
  it('AC-006.6: 막는 모양 칸 + 보통 칸이면 보통 칸만 저장하고 blocked이며 시간이 지나도 다시 하지 않는다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ memo: PHONE, cashIn: '100000' }))
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { cashIn: '100000' })
    await calls[0].succeed()
    expect(autosave.snapshot().state).toBe('blocked')
    expect(autosave.snapshot().blocked).toEqual({ ymd: YMD, fields: ['memo'] })
    expect(autosave.hasUnsaved()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    await wait(3_600_000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('AC-006.6: 막힌 칸뿐이면 save를 부르지 않고 blocked다', async () => {
    const { autosave, save } = harness()
    autosave.change(YMD, dayWith({ memo: PHONE, noteCash: 'a@b.co' }))
    await wait(800)
    expect(save).not.toHaveBeenCalled()
    expect(autosave.snapshot()).toEqual({
      state: 'blocked',
      savedAt: null,
      blocked: { ymd: YMD, fields: ['noteCash', 'memo'] },
    })
    expect(autosave.hasUnsaved()).toBe(true)
  })

  it('AC-006.6: 숫자 칸·항목 이름 칸도 막는 모양이면 뺀다', async () => {
    const { autosave, save } = harness()
    autosave.change(YMD, dayWith({ cashIn: PHONE, nameCashIn: PHONE, cardIn: '100000' }))
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { cardIn: '100000' })
    expect(autosave.snapshot().blocked?.fields).toEqual(['cashIn', 'nameCashIn'])
  })

  it('AC-006.6: 그 칸을 고쳐 모양이 없어지면 그 칸도 저장되고 풀린다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ memo: PHONE, cashIn: '100000' }))
    await wait(800)
    await calls[0].succeed()
    autosave.change(YMD, dayWith({ memo: '가상 메모', cashIn: '100000' }))
    await wait(800)
    expect(save).toHaveBeenCalledTimes(2)
    expect(calls[1].changes).toEqual({ memo: '가상 메모' })
    await calls[1].succeed()
    expect(autosave.snapshot()).toMatchObject({ state: 'saved', blocked: null })
    expect(autosave.hasUnsaved()).toBe(false)
  })

  it('AC-006.6: 막힌 칸을 아는 값으로 되돌리면 저장 없이 풀린다', async () => {
    const { autosave, save } = harness()
    autosave.serverDay(YMD, dayWith({ memo: '가상 메모' }))
    autosave.change(YMD, dayWith({ memo: PHONE }))
    await wait(800)
    expect(autosave.snapshot().state).toBe('blocked')
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    expect(save).not.toHaveBeenCalled()
    expect(autosave.snapshot()).toMatchObject({ state: 'idle', blocked: null })
    expect(autosave.hasUnsaved()).toBe(false)
  })

  it('AC-006.6: 막힌 칸이 있는 채 다른 칸을 고치면 다른 칸만 저장하고 계속 막혀 있다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ memo: PHONE }))
    await wait(800)
    autosave.change(YMD, dayWith({ memo: PHONE, cashIn: '100000' }))
    await wait(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(calls[0].changes).toEqual({ cashIn: '100000' })
    await calls[0].succeed()
    expect(autosave.snapshot().state).toBe('blocked')
    expect(autosave.snapshot().blocked).toEqual({ ymd: YMD, fields: ['memo'] })
    expect(autosave.snapshot().savedAt).not.toBeNull()
  })

  it('AC-006.6: 저장이 실패·끊겨도 막힌 칸은 빠진 채 다시 하고 막힌 칸 목록은 계속 보인다', async () => {
    const { autosave, calls } = harness()
    autosave.change(YMD, dayWith({ memo: PHONE, cashIn: '100000' }))
    await wait(800)
    await calls[0].fail(offlineError())
    expect(autosave.snapshot()).toMatchObject({ state: 'offline', blocked: { ymd: YMD, fields: ['memo'] } })
    await wait(15_000)
    expect(calls[1].changes).toEqual({ cashIn: '100000' })
    await calls[1].fail(failedError())
    expect(autosave.snapshot().blocked).toEqual({ ymd: YMD, fields: ['memo'] })
    await wait(2000)
    expect(calls[2].changes).toEqual({ cashIn: '100000' })
    await calls[2].succeed()
    expect(autosave.snapshot().state).toBe('blocked')
  })

  it('AC-006.6: 저장 중에 막는 모양으로 고치면 끝난 뒤 그 칸은 보내지 않고 blocked다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    await wait(800)
    autosave.change(YMD, dayWith({ cashIn: '100000', memo: PHONE }))
    await calls[0].succeed()
    expect(save).toHaveBeenCalledTimes(1)
    expect(autosave.snapshot().state).toBe('blocked')
  })

  it('AC-006.6: 서버에 이미 있는 칸은 바뀌지 않았으면 막힌 칸이 아니다', async () => {
    const { autosave, save, calls } = harness()
    const server = dayWith({ memo: PHONE })
    autosave.serverDay(YMD, server)
    autosave.change(YMD, { ...server, cashIn: '100000' })
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { cashIn: '100000' })
    await calls[0].succeed()
    expect(autosave.snapshot()).toMatchObject({ state: 'saved', blocked: null })
  })

  it('AC-006.6: blocked 목록은 막힌 칸이 있는 가장 이른 날이다', async () => {
    const { autosave } = harness()
    autosave.change(OTHER, dayWith({ memo: PHONE }))
    await wait(800)
    expect(autosave.snapshot().blocked).toEqual({ ymd: OTHER, fields: ['memo'] })
    autosave.change(YMD, dayWith({ noteCash: PHONE }))
    await wait(800)
    expect(autosave.snapshot().blocked).toEqual({ ymd: YMD, fields: ['noteCash'] })
  })

  it('AC-006.7: flush()는 기다리지 않고 바로 저장을 시작하고 그 타이머는 없어진다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    autosave.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    await calls[0].succeed()
    await wait(60_000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('AC-006.7: flush()는 다시 하기를 기다리는 날도 바로 시작한다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    await calls[0].fail(failedError())
    autosave.flush()
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('AC-006.7: flush()는 저장 중·막힌 날·저장 끝난 날을 부르지 않는다', async () => {
    const h = harness()
    await put(h, YMD, 'saving')
    await put(h, OTHER, 'blocked')
    await put(h, '2026-10-07', 'saved')
    const before = h.save.mock.calls.length
    h.autosave.flush()
    expect(h.save).toHaveBeenCalledTimes(before)
  })
})

describe('createAutosave 날짜 여러 개', () => {
  it('AC-006.8: 날짜마다 따로 저장하고 묶어 보내지 않는다', async () => {
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    autosave.change(OTHER, dayWith({ cardIn: '200000' }))
    await wait(800)
    expect(save).toHaveBeenCalledTimes(2)
    expect(calls.map(({ ymd, changes }) => [ymd, changes])).toEqual([
      [YMD, { cashIn: '100000' }],
      [OTHER, { cardIn: '200000' }],
    ])
    await calls[0].succeed()
    expect(autosave.snapshot().state).toBe('saving') // 다른 날이 아직 저장 중
    expect(autosave.hasUnsaved()).toBe(true)
    expect(autosave.pendingDay(YMD)).toBeNull()
    await calls[1].succeed()
    expect(autosave.snapshot().state).toBe('saved')
    expect(autosave.hasUnsaved()).toBe(false)
  })

  // 느린 상태를 먼저 만든다(pending은 다음 800ms에 끝나 버리니 맨 뒤)
  it.each<[DayKind, DayKind, string]>([
    ['saved', 'failed', 'failed'],
    ['offline', 'failed', 'failed'],
    ['saving', 'offline', 'offline'],
    ['blocked', 'offline', 'offline'],
    ['saving', 'blocked', 'saving'],
    ['blocked', 'pending', 'saving'],
    ['saved', 'blocked', 'blocked'],
    ['idle', 'saved', 'saved'],
    ['idle', 'idle', 'idle'],
  ])('AC-006.8: 날짜 하나 %s + 날짜 하나 %s → 전체 %s', async (first, second, expected) => {
    const h = harness({ retryDelaysMs: [] })
    await put(h, YMD, first)
    await put(h, OTHER, second)
    expect(h.autosave.snapshot().state).toBe(expected)
  })

  it.each<[DayKind, boolean]>([
    ['idle', false],
    ['saved', false],
    ['pending', true],
    ['saving', true],
    ['offline', true],
    ['failed', true],
    ['blocked', true],
  ])('AC-006.8: 날짜 하나가 %s이면 hasUnsaved()는 %s다', async (kind, expected) => {
    const h = harness({ retryDelaysMs: [] })
    await put(h, YMD, kind)
    expect(h.autosave.hasUnsaved()).toBe(expected)
  })

  it('AC-006.8: 막힌 날이 있어도 다른 날이 끊기면 막힌 칸 목록은 계속 보인다', async () => {
    const h = harness()
    await put(h, YMD, 'blocked')
    await put(h, OTHER, 'offline')
    expect(h.autosave.snapshot()).toMatchObject({ state: 'offline', blocked: { ymd: YMD, fields: ['memo'] } })
  })

  it('AC-006.8: 아무 날도 없으면 idle이고 저장 안 된 값이 없다', () => {
    const { autosave } = harness()
    expect(autosave.snapshot()).toEqual({ state: 'idle', savedAt: null, blocked: null })
    expect(autosave.hasUnsaved()).toBe(false)
  })

  it('AC-006.8: subscribe 둘이 같은 상태를 받고, 떼면 더 받지 않는다', async () => {
    const first: AutosaveSnapshot[] = []
    const second: AutosaveSnapshot[] = []
    const fromOption: AutosaveSnapshot[] = []
    const { autosave, calls } = harness({ onChange: (snapshot) => fromOption.push(snapshot) })
    const unsubscribeFirst = autosave.subscribe((snapshot) => first.push(snapshot))
    autosave.subscribe((snapshot) => second.push(snapshot))
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    autosave.change(YMD, dayWith({ memo: '가상 메모 둘' })) // 상태가 그대로면 다시 부르지 않는다
    await wait(800)
    await calls[0].succeed()
    expect(first.map(({ state }) => state)).toEqual(['saving', 'saved'])
    expect(second).toEqual(first)
    expect(fromOption).toEqual(first)
    unsubscribeFirst()
    autosave.change(YMD, dayWith({ memo: '가상 메모 셋' }))
    expect(first).toHaveLength(2)
    expect(second).toHaveLength(3)
  })

  it('AC-006.8: 막힌 칸 목록이 바뀌면 전체 상태가 같아도 듣는 쪽에 알린다', async () => {
    const snapshots: AutosaveSnapshot[] = []
    const { autosave } = harness()
    autosave.change(YMD, dayWith({ memo: PHONE }))
    await wait(800)
    autosave.subscribe((snapshot) => snapshots.push(snapshot))
    autosave.change(YMD, dayWith({ memo: PHONE, noteCash: PHONE }))
    await wait(800)
    expect(snapshots[snapshots.length - 1]).toMatchObject({
      state: 'blocked',
      blocked: { ymd: YMD, fields: ['noteCash', 'memo'] },
    })
  })
})

describe('createAutosave dispose', () => {
  it('AC-006.9: 타이머를 모두 멈추고 날짜 상태를 비운다', async () => {
    const h = harness({ retryDelaysMs: [] })
    await put(h, YMD, 'offline')
    await put(h, OTHER, 'pending')
    expect(vi.getTimerCount()).toBe(2)
    h.autosave.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(h.autosave.pendingDay(YMD)).toBeNull()
    expect(h.autosave.pendingDay(OTHER)).toBeNull()
    expect(h.autosave.hasUnsaved()).toBe(false)
    expect(h.autosave.snapshot()).toEqual({ state: 'idle', savedAt: null, blocked: null })
    const before = h.save.mock.calls.length
    await wait(60_000)
    expect(h.save).toHaveBeenCalledTimes(before)
  })

  it('AC-006.9: 막힌 날·실패한 날·저장 시각도 함께 비운다', async () => {
    const h = harness({ retryDelaysMs: [] })
    await put(h, YMD, 'blocked')
    await put(h, OTHER, 'failed')
    await put(h, '2026-10-07', 'saved')
    h.autosave.dispose()
    expect(h.autosave.pendingDay(YMD)).toBeNull()
    expect(h.autosave.hasUnsaved()).toBe(false)
    expect(h.autosave.snapshot()).toEqual({ state: 'idle', savedAt: null, blocked: null })
  })

  it('AC-006.9: 듣는 쪽은 비워진 상태를 받는다', async () => {
    const snapshots: AutosaveSnapshot[] = []
    const { autosave } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    autosave.subscribe((snapshot) => snapshots.push(snapshot))
    autosave.dispose()
    expect(snapshots).toEqual([{ state: 'idle', savedAt: null, blocked: null }])
  })

  it.each<[string, (call: SaveCall) => Promise<void>]>([
    ['성공', (call) => call.succeed()],
    ['실패', (call) => call.fail(failedError())],
    ['끊김', (call) => call.fail(offlineError())],
  ])('AC-006.9: 저장 중 dispose() 뒤 응답이 %s여도 타이머·상태가 되살아나지 않는다', async (_name, reply) => {
    const snapshots: AutosaveSnapshot[] = []
    const { autosave, save, calls } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    autosave.change(YMD, dayWith({ memo: '가상 메모 둘' })) // 응답 뒤 다시 저장할 값이 남아 있어도
    autosave.dispose()
    autosave.subscribe((snapshot) => snapshots.push(snapshot))
    await reply(calls[0])
    expect(vi.getTimerCount()).toBe(0)
    expect(autosave.pendingDay(YMD)).toBeNull()
    expect(autosave.hasUnsaved()).toBe(false)
    expect(autosave.snapshot()).toEqual({ state: 'idle', savedAt: null, blocked: null })
    expect(autosave.revision(YMD)).toBe(0)
    expect(snapshots).toEqual([])
    await wait(60_000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('AC-006.9: dispose() 전의 응답은 그 뒤 새로 적은 날을 건드리지 않는다', async () => {
    const { autosave, calls } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    autosave.dispose()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    await calls[0].succeed()
    expect(autosave.snapshot()).toMatchObject({ state: 'saving', savedAt: null })
    expect(calls).toHaveLength(2)
    expect(calls[1].changes).toEqual({ memo: '가상 메모' })
  })

  it('AC-006.10: pendingDay는 저장 전까지 최신 값이고 저장 뒤 null이다', async () => {
    const { autosave, calls } = harness()
    expect(autosave.pendingDay(YMD)).toBeNull()
    const first = dayWith({ memo: '가상 메모' })
    autosave.change(YMD, first)
    expect(autosave.pendingDay(YMD)?.day).toEqual(first)
    await wait(800)
    expect(autosave.pendingDay(YMD)?.day).toEqual(first) // 저장 중
    const second = dayWith({ memo: '가상 메모 둘' })
    autosave.change(YMD, second)
    expect(autosave.pendingDay(YMD)?.day).toEqual(second)
    await calls[0].succeed()
    expect(autosave.pendingDay(YMD)?.day).toEqual(second) // 남은 차이를 저장 중
    await calls[1].succeed()
    expect(autosave.pendingDay(YMD)).toBeNull()
  })

  it.each<[DayKind, WorklogChanges]>([
    ['pending', { cashIn: '100000' }],
    ['saving', { cashIn: '100000' }],
    ['offline', { cashIn: '100000' }],
    ['failed', { cashIn: '100000' }],
    ['blocked', { memo: PHONE }],
  ])('AC-006.10: %s인 날은 pendingDay가 최신 값이다', async (kind, cells) => {
    const h = harness({ retryDelaysMs: [] })
    await put(h, YMD, kind)
    expect(h.autosave.pendingDay(YMD)?.day).toEqual(dayWith(cells))
  })

  it('AC-006.10: 읽기만 한 날과 저장 끝난 날은 null이다', async () => {
    const h = harness()
    await put(h, YMD, 'idle')
    await put(h, OTHER, 'saved')
    expect(h.autosave.pendingDay(YMD)).toBeNull()
    expect(h.autosave.pendingDay(OTHER)).toBeNull()
  })

  it('AC-006.10: 받은 값·돌려준 값을 밖에서 고쳐도 안쪽 값은 바뀌지 않는다', async () => {
    const { autosave, save } = harness()
    const day = dayWith({ memo: '가상 메모' })
    autosave.change(YMD, day)
    day.memo = '가상 메모 밖에서 고침'
    const pending = autosave.pendingDay(YMD)
    expect(pending?.day.memo).toBe('가상 메모')
    if (pending) pending.day.memo = '가상 메모 또 고침'
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { memo: '가상 메모' })
  })
})

describe('createAutosave 되돌림', () => {
  it('AC-006.11: 고쳤다 되돌리면 save 0번이고 읽기만 한 날은 idle로 돌아간다', async () => {
    const { autosave, save } = harness()
    const server = dayWith({ cashIn: '100000' })
    autosave.serverDay(YMD, server)
    autosave.change(YMD, { ...server, cashIn: '200000' })
    autosave.change(YMD, server)
    await wait(800)
    expect(save).not.toHaveBeenCalled()
    expect(autosave.snapshot().state).toBe('idle')
    expect(autosave.hasUnsaved()).toBe(false)
    expect(autosave.pendingDay(YMD)).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-006.11: 저장한 적 있는 날은 되돌리면 saved로 돌아가고 저장 시각은 그대로다', async () => {
    const at = new Date('2026-11-01T05:00:00.000Z')
    const h = harness({ now: () => at })
    await put(h, YMD, 'saved')
    h.autosave.change(YMD, dayWith({ cashIn: '200000' }))
    h.autosave.change(YMD, dayWith({ cashIn: '100000' }))
    await wait(800)
    expect(h.save).toHaveBeenCalledTimes(1)
    expect(h.autosave.snapshot()).toEqual({ state: 'saved', savedAt: at, blocked: null })
  })

  it.each<[string, WorklogChanges, WorklogChanges]>([
    ['숫자 칸 끝 공백', { cashIn: '100000' }, { cashIn: '100000 ' }],
    ['숫자 칸 앞 공백', { cashIn: '100000' }, { cashIn: ' 100000' }],
    ['항목 이름을 기본 이름으로 적음', { nameCashIn: '' }, { nameCashIn: '현금수납' }],
  ])('AC-006.11: %s만 다르면 save 0번이다', async (_name, known, typed) => {
    const { autosave, save } = harness()
    autosave.serverDay(YMD, dayWith(known))
    autosave.change(YMD, dayWith(typed))
    await wait(800)
    expect(save).not.toHaveBeenCalled()
    expect(autosave.snapshot().state).toBe('idle')
  })

  it('AC-006.11: 업무사항은 친 그대로라 끝 공백도 차이다', async () => {
    const { autosave, save } = harness()
    autosave.serverDay(YMD, dayWith({ memo: '가상 메모' }))
    autosave.change(YMD, dayWith({ memo: '가상 메모 ' }))
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { memo: '가상 메모 ' })
  })

  it('AC-006.11: 저장 뒤 저장한 값은 차이가 아니고 빈 칸으로 지우면 차이다', async () => {
    const h = harness()
    await put(h, YMD, 'saved')
    h.autosave.change(YMD, dayWith({ cashIn: '100000' }))
    await wait(800)
    expect(h.save).toHaveBeenCalledTimes(1)
    h.autosave.change(YMD, dayWith({}))
    await wait(800)
    expect(h.calls[1].changes).toEqual({ cashIn: '' })
  })
})

describe('createAutosave serverDay', () => {
  it('AC-006.12: 처음 읽으면 서버 값 그대로이고 저장·타이머를 부르지 않는다', () => {
    const { autosave, save } = harness()
    const server = dayWith({ cashIn: '100000', memo: '가상 메모' })
    expect(autosave.serverDay(YMD, server, 'memo').day).toEqual(server)
    expect(save).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(autosave.snapshot().state).toBe('idle')
    expect(autosave.hasUnsaved()).toBe(false)
    expect(autosave.pendingDay(YMD)).toBeNull()
  })

  it('AC-006.12: 서버 줄이 없으면 빈 하루다', () => {
    const { autosave } = harness()
    expect(autosave.serverDay(YMD, null).day).toEqual(emptyWorklogDay())
  })

  it('AC-006.12: 저장 안 된 칸·초점 칸은 그대로이고 나머지는 서버 값으로 바뀐다', () => {
    const { autosave } = harness()
    const read = dayWith({ cashIn: '100000', cardIn: '100000', transferIn: '100000' })
    autosave.serverDay(YMD, read)
    autosave.change(YMD, { ...read, cashIn: '200000' })
    const server = dayWith({ cashIn: '900000', cardIn: '900000', transferIn: '900000' })
    expect(autosave.serverDay(YMD, server, 'cardIn').day).toEqual(
      dayWith({ cashIn: '200000', cardIn: '100000', transferIn: '900000' }),
    )
  })

  it('AC-006.12: 반영한 칸은 다음 저장에서 차이가 아니라 저장으로 가지 않는다', async () => {
    const { autosave, save } = harness()
    autosave.serverDay(YMD, dayWith({ cashIn: '100000' }))
    const merged = autosave.serverDay(YMD, dayWith({ cashIn: '900000' })).day
    autosave.change(YMD, { ...merged, memo: '가상 메모' })
    await wait(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(YMD, { memo: '가상 메모' })
  })

  it('AC-006.12: 저장 안 된 칸은 그대로 남아 저장으로 간다', async () => {
    const { autosave, save } = harness()
    autosave.serverDay(YMD, dayWith({ cashIn: '100000' }))
    autosave.change(YMD, dayWith({ cashIn: '200000' }))
    autosave.serverDay(YMD, dayWith({ cashIn: '900000', cardIn: '900000' }))
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { cashIn: '200000' })
  })

  it('AC-006.12: 초점 칸의 옛 값이 다른 PC 값을 덮지 않고, 초점이 나간 뒤 읽으면 서버 값이 된다', async () => {
    const { autosave, save } = harness()
    autosave.serverDay(YMD, dayWith({ memo: '가상 옛 메모' }))
    const merged = autosave.serverDay(YMD, dayWith({ memo: '가상 다른 PC 메모' }), 'memo').day
    expect(merged.memo).toBe('가상 옛 메모')
    autosave.change(YMD, { ...merged, cashIn: '100000' })
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { cashIn: '100000' })
    const later = autosave.serverDay(YMD, dayWith({ memo: '가상 다른 PC 메모', cashIn: '100000' })).day
    expect(later.memo).toBe('가상 다른 PC 메모')
  })

  it('AC-006.12: 막힌 칸은 그대로이고 계속 막혀 있다', async () => {
    const { autosave, save } = harness()
    autosave.serverDay(YMD, dayWith({ memo: '가상 옛 메모' }))
    autosave.change(YMD, dayWith({ memo: PHONE }))
    await wait(800)
    const merged = autosave.serverDay(YMD, dayWith({ memo: '가상 다른 PC 메모', cashIn: '900000' })).day
    expect(merged).toEqual(dayWith({ memo: PHONE, cashIn: '900000' }))
    expect(autosave.snapshot().blocked).toEqual({ ymd: YMD, fields: ['memo'] })
    expect(autosave.snapshot().state).toBe('blocked')
    await wait(60_000)
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-006.12: 보내는 중인 칸은 저장 안 된 칸이라 그대로다', async () => {
    const { autosave, calls } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    await wait(800)
    autosave.change(YMD, dayWith({})) // 보내는 중에 되돌림: 아는 값과 같지만 서버에는 곧 100000이 들어간다
    expect(autosave.serverDay(YMD, dayWith({ cashIn: '100000' })).day.cashIn).toBe('')
    await calls[0].succeed()
    expect(calls[1].changes).toEqual({ cashIn: '' })
  })

  it('AC-006.12: 타이머·저장을 건드리지 않는다(기다리던 저장은 제때 돈다)', async () => {
    const { autosave, save } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    await wait(500)
    autosave.serverDay(YMD, dayWith({ cardIn: '900000' }))
    expect(vi.getTimerCount()).toBe(1)
    expect(autosave.snapshot().state).toBe('saving')
    await wait(299)
    expect(save).not.toHaveBeenCalled()
    await wait(1)
    expect(save).toHaveBeenCalledWith(YMD, { cashIn: '100000' })
  })

  it('AC-006.12: 끊긴 날의 다시 하기 타이머·상태도 그대로다', async () => {
    const h = harness()
    await put(h, YMD, 'offline')
    h.autosave.serverDay(YMD, dayWith({ cardIn: '900000' }))
    expect(h.autosave.snapshot().state).toBe('offline')
    expect(vi.getTimerCount()).toBe(1)
    await wait(15_000)
    expect(h.calls[1].changes).toEqual({ cashIn: '100000' })
  })

  it('AC-006.12: 돌려준 값을 밖에서 고쳐도 안쪽 값은 바뀌지 않는다', async () => {
    const { autosave, save } = harness()
    const server = dayWith({ cashIn: '100000' })
    const merged = autosave.serverDay(YMD, server).day
    merged.cashIn = '200000'
    server.cashIn = '300000'
    autosave.change(YMD, dayWith({ cashIn: '100000', memo: '가상 메모' }))
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { memo: '가상 메모' })
  })
})

describe('createAutosave revision', () => {
  it('AC-006.13: 처음 0이고 저장이 시작·끝날 때마다 는다', async () => {
    const { autosave, calls } = harness()
    expect(autosave.revision(YMD)).toBe(0)
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    expect(autosave.revision(YMD)).toBe(0) // 기다리는 동안은 저장이 아니다
    await wait(800)
    expect(autosave.revision(YMD)).toBe(1)
    await calls[0].succeed()
    expect(autosave.revision(YMD)).toBe(2)
  })

  it('AC-006.13: 실패로 끝나도, 다시 해도 는다', async () => {
    const { autosave, calls } = harness()
    autosave.change(YMD, dayWith({ memo: '가상 메모' }))
    await wait(800)
    await calls[0].fail(failedError())
    expect(autosave.revision(YMD)).toBe(2)
    await wait(2000)
    expect(autosave.revision(YMD)).toBe(3)
    await calls[1].fail(offlineError())
    expect(autosave.revision(YMD)).toBe(4)
  })

  it('AC-006.13: 날짜마다 따로 세고, 저장을 부르지 않으면 늘지 않는다', async () => {
    const { autosave } = harness()
    autosave.serverDay(YMD, dayWith({ cashIn: '100000' }))
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    autosave.change(OTHER, dayWith({ memo: PHONE }))
    await wait(800)
    expect(autosave.revision(YMD)).toBe(0)
    expect(autosave.revision(OTHER)).toBe(0)
    autosave.change(YMD, dayWith({ cashIn: '200000' }))
    await wait(800)
    expect(autosave.revision(YMD)).toBe(1)
    expect(autosave.revision(OTHER)).toBe(0)
  })

  it('AC-006.13: 서버 값을 읽어도 늘지 않는다', () => {
    const { autosave } = harness()
    autosave.serverDay(YMD, dayWith({ cashIn: '100000' }))
    autosave.serverDay(YMD, dayWith({ cashIn: '200000' }))
    expect(autosave.revision(YMD)).toBe(0)
  })
})

// ── 비트 칸 목록(bitFields, worklog REQ-017 · design.md 20-4절) ─────────────
// 자동 저장은 칸처럼 목록의 아는 값·최신 값을 들고, 목록이 바뀌었을 때만(차례는 보지 않는다) save에 셋째 인자로 넘긴다.
// 목록을 모르거나 안 바뀌었으면 인자 둘로 부른다 → 저장이 bit_fields를 보내지 않아 저장된 표시가 지워지지 않는다(AC-017.7)
describe('AC-017.7 비트 칸 목록은 바뀌었을 때만 save에 간다', () => {
  it('AC-017.7: 목록을 받지 않은 change는 save를 인자 둘로 부른다(표시가 저장된 날에 비트 칸 밖 칸을 고침)', async () => {
    const { autosave, save } = harness()
    const server = dayWith({ cashIn: '100000' })
    autosave.serverDay(YMD, server, null, ['cashIn'])
    autosave.change(YMD, { ...server, spendCash: '20000' })
    await wait(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(YMD, { spendCash: '20000' })
    expect(save.mock.calls[0]).toHaveLength(2)
  })

  it('AC-017.7: 아는 목록과 같은 목록(차례만 다름)을 주면 목록을 보내지 않는다', async () => {
    const { autosave, save } = harness()
    const server = dayWith({ newPatients: '10', cashIn: '100000' })
    autosave.serverDay(YMD, server, null, ['newPatients', 'cashIn'])
    autosave.change(YMD, { ...server, spendCash: '20000' }, ['cashIn', 'newPatients'])
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { spendCash: '20000' })
    expect(save.mock.calls[0]).toHaveLength(2)
  })

  it('AC-017.7: 비트 칸을 손으로 고쳐 목록이 줄면 바뀐 칸과 줄어든 목록을 보낸다', async () => {
    const { autosave, save } = harness()
    autosave.serverDay(YMD, dayWith({ newPatients: '10', cashIn: '100000' }), null, ['newPatients', 'cashIn'])
    autosave.change(YMD, dayWith({ newPatients: '10', cashIn: '120000' }), ['newPatients'])
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { cashIn: '120000' }, ['newPatients'])
  })

  it('AC-017.7: 칸은 그대로이고 목록만 바뀌어도 목록만 보낸다(바뀐 칸 없음)', async () => {
    const { autosave, save } = harness()
    const server = dayWith({ cashIn: '100000' })
    autosave.serverDay(YMD, server, null, [])
    autosave.change(YMD, server, ['cashIn'])
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, {}, ['cashIn'])
  })

  it('AC-017.7: 보낸 목록은 저장 뒤 아는 목록이 되어 다음 저장에 다시 가지 않는다', async () => {
    const { autosave, calls } = harness()
    autosave.serverDay(YMD, null, null, [])
    autosave.change(YMD, dayWith({ cashIn: '100000' }), ['cashIn'])
    await wait(800)
    expect(calls[0]).toMatchObject({ changes: { cashIn: '100000' }, bitFields: ['cashIn'], args: 3 })
    await calls[0].succeed()
    autosave.change(YMD, dayWith({ cashIn: '100000', cardIn: '200000' }), ['cashIn'])
    await wait(800)
    expect(calls[1]).toMatchObject({ changes: { cardIn: '200000' }, bitFields: undefined, args: 2 })
  })

  it('AC-017.7: 저장 중에 목록이 또 바뀌면 끝난 뒤 남은 목록을 보낸다', async () => {
    const { autosave, calls } = harness()
    autosave.serverDay(YMD, null, null, [])
    autosave.change(YMD, dayWith({ cashIn: '100000' }), ['cashIn'])
    await wait(800)
    autosave.change(YMD, dayWith({ cashIn: '100000', cardIn: '200000' }), ['cashIn', 'cardIn'])
    await calls[0].succeed()
    expect(calls[1]).toMatchObject({ changes: { cardIn: '200000' }, bitFields: ['cashIn', 'cardIn'], args: 3 })
  })

  it('AC-017.7: 실패하면 다시 할 때 그 목록을 다시 보낸다', async () => {
    const { autosave, calls } = harness()
    autosave.serverDay(YMD, null, null, [])
    autosave.change(YMD, dayWith({ cashIn: '100000' }), ['cashIn'])
    await wait(800)
    await calls[0].fail(failedError())
    await wait(2000)
    expect(calls[1]).toMatchObject({ changes: { cashIn: '100000' }, bitFields: ['cashIn'], args: 3 })
  })

  it('AC-017.7: 아는 목록이 없는 날(읽기 전)에 받은 목록은 보낸다', async () => {
    const { autosave, save } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }), ['cashIn'])
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { cashIn: '100000' }, ['cashIn'])
  })

  it('AC-017.7: 막힌 칸만 남아도 바뀐 목록은 보내고, 그 뒤 막힌 상태다', async () => {
    const { autosave, calls } = harness()
    autosave.serverDay(YMD, dayWith({ cashIn: '100000' }), null, [])
    autosave.change(YMD, dayWith({ cashIn: '100000', memo: PHONE }), ['cashIn'])
    await wait(800)
    expect(calls[0]).toMatchObject({ changes: {}, bitFields: ['cashIn'], args: 3 })
    await calls[0].succeed()
    expect(calls).toHaveLength(1)
    expect(autosave.snapshot().state).toBe('blocked')
  })

  it('AC-017.7: 넘긴 목록을 밖에서 고쳐도 안쪽 목록은 바뀌지 않는다', async () => {
    const { autosave, save } = harness()
    autosave.serverDay(YMD, null, null, [])
    const fields: WorklogNumberKey[] = ['cashIn']
    autosave.change(YMD, dayWith({ cashIn: '100000' }), fields)
    fields.push('cardIn')
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, { cashIn: '100000' }, ['cashIn'])
  })
})

describe('AC-017.7 serverDay·pendingDay가 나르는 비트 칸 목록', () => {
  it('AC-017.7: serverDay는 { day, bitFields }를 돌려준다. 처음 읽으면 받은 목록 그대로이고, 목록을 받지 않으면 bitFields가 없다', () => {
    const { autosave } = harness()
    const server = dayWith({ cashIn: '100000' })
    expect(autosave.serverDay(YMD, server, null, ['cashIn'])).toEqual({ day: server, bitFields: ['cashIn'] })
    const plain = autosave.serverDay(OTHER, server)
    expect(plain.day).toEqual(server)
    expect(plain).not.toHaveProperty('bitFields')
  })

  it('AC-017.7: 다시 읽은 목록은 저장 안 된 목록이 아니면 아는 목록·최신 목록이 되고, 같은 목록을 주면 저장하지 않는다', async () => {
    const { autosave, save } = harness()
    const server = dayWith({ cashIn: '100000', cardIn: '200000' })
    autosave.serverDay(YMD, server, null, ['cashIn'])
    expect(autosave.serverDay(YMD, server, null, ['cashIn', 'cardIn']).bitFields).toEqual(['cashIn', 'cardIn'])
    autosave.change(YMD, server, ['cardIn', 'cashIn'])
    await wait(800)
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-017.7: 저장 안 된 목록은 다시 읽어도 그대로이고(돌려준 목록) 저장으로 간다', async () => {
    const { autosave, save } = harness()
    const server = dayWith({ cashIn: '100000' })
    autosave.serverDay(YMD, server, null, [])
    autosave.change(YMD, server, ['cashIn'])
    expect(autosave.serverDay(YMD, server, null, ['cardIn']).bitFields).toEqual(['cashIn'])
    await wait(800)
    expect(save).toHaveBeenCalledWith(YMD, {}, ['cashIn'])
  })

  it('AC-017.7: 보내는 중인 목록은 다시 읽어도 그대로다', async () => {
    const { autosave, calls } = harness()
    const server = dayWith({ cashIn: '100000' })
    autosave.serverDay(YMD, server, null, [])
    autosave.change(YMD, server, ['cashIn'])
    await wait(800)
    expect(autosave.serverDay(YMD, server, null, []).bitFields).toEqual(['cashIn'])
    await calls[0].succeed()
    expect(calls).toHaveLength(1)
    expect(autosave.serverDay(YMD, server, null, ['cashIn']).bitFields).toEqual(['cashIn'])
  })

  it('AC-017.7: 다시 읽을 때 목록을 받지 않으면 아는 목록을 그대로 둔다', () => {
    const { autosave } = harness()
    autosave.serverDay(YMD, null, null, ['cashIn'])
    expect(autosave.serverDay(YMD, dayWith({ cashIn: '100000' })).bitFields).toEqual(['cashIn'])
  })

  it('AC-017.7: pendingDay는 최신 목록도 돌려주고, 목록을 모르는 날은 bitFields가 없다', () => {
    const { autosave } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }), ['cashIn'])
    expect(autosave.pendingDay(YMD)).toEqual({ day: dayWith({ cashIn: '100000' }), bitFields: ['cashIn'] })
    autosave.change(OTHER, dayWith({ memo: '가상 메모' }))
    expect(autosave.pendingDay(OTHER)?.day).toEqual(dayWith({ memo: '가상 메모' }))
    expect(autosave.pendingDay(OTHER)).not.toHaveProperty('bitFields')
  })

  it('AC-017.7: 돌려준 목록을 밖에서 고쳐도 안쪽 목록은 바뀌지 않는다', () => {
    const { autosave } = harness()
    const read = autosave.serverDay(YMD, null, null, ['cashIn'])
    read.bitFields?.push('cardIn')
    autosave.change(YMD, dayWith({ cashIn: '100000' }), ['cashIn'])
    const pending = autosave.pendingDay(YMD)
    pending?.bitFields?.push('cardIn')
    expect(autosave.pendingDay(YMD)?.bitFields).toEqual(['cashIn'])
  })

  it('AC-017.7: dispose하면 목록도 비운다', () => {
    const { autosave } = harness()
    autosave.change(YMD, dayWith({ cashIn: '100000' }), ['cashIn'])
    autosave.dispose()
    expect(autosave.pendingDay(YMD)).toBeNull()
    expect(autosave.serverDay(YMD, null)).not.toHaveProperty('bitFields')
  })
})
