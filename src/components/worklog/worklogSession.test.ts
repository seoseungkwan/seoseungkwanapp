// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveWorklogDay, WorklogStorageError } from '@/lib/storage/worklogDays'
import { emptyWorklogCash, emptyWorklogDay, type WorklogDay } from '@/types/worklog'
import { onWorklogSignedOut, startWorklogSession, worklogAutosave } from './worklogSession'

// 자동 저장 제어 한 벌과 창 이벤트를 화면 없이 시험한다. 값은 둥근 가짜 숫자와 "가상" 글자다
const client = vi.hoisted(() => ({ auth: { onAuthStateChange: vi.fn() } }))

vi.mock('@/lib/storage/worklogDays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/worklogDays')>()),
  loadWorklogDay: vi.fn(),
  saveWorklogDay: vi.fn(),
}))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => client }))

const YMD = '2026-10-28'
const save = vi.mocked(saveWorklogDay)
const unsubscribe = vi.fn()
let emitAuth: (event: string) => void

const dayWith = (cells: Partial<WorklogDay> = {}): WorklogDay => ({ ...emptyWorklogDay(), ...cells })

// 떠나려 할 때 기본 동작이 막혔는지(= 브라우저가 떠나기 확인을 묻는지)
function leaveIsBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  save.mockResolvedValue(undefined)
  client.auth.onAuthStateChange.mockImplementation((callback: (event: string, session: null) => void) => {
    emitAuth = (event) => callback(event, null)
    return { data: { subscription: { unsubscribe } } }
  })
})

afterEach(() => {
  startWorklogSession()()
  worklogAutosave().dispose()
  vi.useRealTimers()
})

describe('worklogAutosave', () => {
  it('AC-010.11: 모듈에 한 벌만 있어 여러 번 불러도 같은 제어다', () => {
    expect(worklogAutosave()).toBe(worklogAutosave())
  })

  it('AC-010.3: 저장은 saveWorklogDay(supabaseBrowser(), 날짜, 바뀐 칸) 길로만 간다', async () => {
    worklogAutosave().change(YMD, dayWith({ cashIn: '100000' }))
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, YMD, { cashIn: '100000' })
  })

  it('AC-017.7: 비트 칸 목록이 바뀌었으면 saveWorklogDay(supabaseBrowser(), 날짜, 바뀐 칸, 목록)으로 간다', async () => {
    const autosave = worklogAutosave()
    autosave.serverDay(YMD, null, null, [])
    autosave.change(YMD, dayWith({ cashIn: '100000' }), ['cashIn'])
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, YMD, { cashIn: '100000' }, ['cashIn'])
  })

  it('AC-017.7: 목록을 모르거나 안 바뀐 저장은 넷째 인자 없이 불러 bit_fields를 보내지 않는다', async () => {
    const autosave = worklogAutosave()
    autosave.serverDay(YMD, dayWith({ cashIn: '100000' }), null, ['cashIn'])
    autosave.change(YMD, dayWith({ cashIn: '100000', spendCash: '20000' }), ['cashIn'])
    autosave.change('2026-10-27', dayWith({ memo: '가상 메모' }))
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledWith(client, YMD, { spendCash: '20000' })
    expect(save).toHaveBeenCalledWith(client, '2026-10-27', { memo: '가상 메모' })
    for (const call of save.mock.calls) expect(call).toHaveLength(3)
  })

  it('AC-1508.8: 자동 저장이 업무사항 글씨 크기를 넘기면 saveWorklogDay(supabaseBrowser(), 날짜, 바뀐 칸, undefined, 크기) 다섯 인자로 간다', async () => {
    const autosave = worklogAutosave()
    autosave.serverDay(YMD, null, null, [], 11)
    autosave.changeMemoFont(YMD, 12)
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, YMD, {}, undefined, 12)
    expect(save.mock.calls[0]).toHaveLength(5)
  })

  it('AC-1508.8: 크기와 비트 칸 목록이 함께 바뀌면 saveWorklogDay(supabaseBrowser(), 날짜, 바뀐 칸, 목록, 크기)다', async () => {
    const autosave = worklogAutosave()
    autosave.serverDay(YMD, null, null, [], 11)
    autosave.change(YMD, dayWith({ cashIn: '100000' }), ['cashIn'])
    autosave.changeMemoFont(YMD, 14)
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, YMD, { cashIn: '100000' }, ['cashIn'], 14)
  })

  it('AC-1508.8: 크기를 넘기지 않는 저장은 지금처럼 인자 셋(목록 없음)·넷(목록 있음)이다', async () => {
    const autosave = worklogAutosave()
    autosave.serverDay(YMD, null, null, [], 11)
    autosave.serverDay('2026-10-27', null, null, [], 11)
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    autosave.change('2026-10-27', dayWith({ cashIn: '100000' }), ['cashIn'])
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledWith(client, YMD, { cashIn: '100000' })
    expect(save).toHaveBeenCalledWith(client, '2026-10-27', { cashIn: '100000' }, ['cashIn'])
    expect(save.mock.calls.map((call) => call.length).sort()).toEqual([3, 4])
  })

  // 현금 시재(worklog-cash-float AC-1609.6): 자동 저장이 시재를 넘길 때만 여섯째 인자로 보낸다(목록·크기가 없으면 넷째·다섯째는 undefined)
  it('AC-1609.6: 자동 저장이 시재를 넘기면 saveWorklogDay(supabaseBrowser(), 날짜, 바뀐 칸, undefined, undefined, 시재) 여섯 인자로 간다', async () => {
    const autosave = worklogAutosave()
    autosave.serverDay(YMD, null, null, [], 11, emptyWorklogCash())
    autosave.changeCash(YMD, { ...emptyWorklogCash(), count5000: 2, floatWon: 300000 })
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, YMD, {}, undefined, undefined, { count5000: 2, floatWon: 300000 })
    expect(save.mock.calls[0]).toHaveLength(6)
  })

  it('AC-1609.6: 시재와 칸·목록·크기가 함께 바뀌면 saveWorklogDay(supabaseBrowser(), 날짜, 바뀐 칸, 목록, 크기, 시재)다', async () => {
    const autosave = worklogAutosave()
    autosave.serverDay(YMD, null, null, [], 11, emptyWorklogCash())
    autosave.change(YMD, dayWith({ cashIn: '100000' }), ['cashIn'])
    autosave.changeMemoFont(YMD, 14)
    autosave.changeCash(YMD, { ...emptyWorklogCash(), count1000: 3, floatWon: 300000 })
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(client, YMD, { cashIn: '100000' }, ['cashIn'], 14, { count1000: 3, floatWon: 300000 })
  })

  it('AC-1609.6: 시재를 넘기지 않는 저장은 지금 인자 수 그대로다(셋·넷·다섯)', async () => {
    const autosave = worklogAutosave()
    for (const ymd of [YMD, '2026-10-27', '2026-10-26']) autosave.serverDay(ymd, null, null, [], 11, { ...emptyWorklogCash(), count5000: 2, floatWon: 300000 })
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    autosave.change('2026-10-27', dayWith({ cashIn: '100000' }), ['cashIn'])
    autosave.changeMemoFont('2026-10-26', 12)
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledTimes(3)
    expect(save).toHaveBeenCalledWith(client, YMD, { cashIn: '100000' })
    expect(save).toHaveBeenCalledWith(client, '2026-10-27', { cashIn: '100000' }, ['cashIn'])
    expect(save).toHaveBeenCalledWith(client, '2026-10-26', {}, undefined, 12)
    expect(save.mock.calls.map((call) => call.length).sort()).toEqual([3, 4, 5])
  })

  it('AC-010.11: 화면이 없어도 실패한 저장을 2초 뒤 다시 한다', async () => {
    save.mockRejectedValueOnce(new WorklogStorageError('failed'))
    const autosave = worklogAutosave()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    autosave.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(autosave.hasUnsaved()).toBe(false)
  })
})

describe('startWorklogSession', () => {
  it('AC-010.6: 두 번 불러도 듣기는 한 번만 건다', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const first = startWorklogSession()
    const second = startWorklogSession()
    expect(second).toBe(first)
    expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
    expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1)
    expect(add.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1)
    add.mockRestore()
  })

  it('AC-010.6: 저장 안 된 값이 있으면 떠나기 확인을 묻는다', () => {
    startWorklogSession()
    worklogAutosave().change(YMD, dayWith({ cashIn: '100000' }))
    expect(leaveIsBlocked()).toBe(true)
  })

  it('AC-010.6: 저장 안 된 값이 없으면 떠나기 확인을 묻지 않는다', async () => {
    startWorklogSession()
    expect(leaveIsBlocked()).toBe(false)
    worklogAutosave().change(YMD, dayWith({ cashIn: '100000' }))
    await vi.advanceTimersByTimeAsync(800)
    expect(leaveIsBlocked()).toBe(false)
  })

  it('AC-010.6: 인터넷이 다시 연결되면 끊겨 기다리던 저장을 바로 한다', async () => {
    startWorklogSession()
    save.mockRejectedValueOnce(new WorklogStorageError('offline'))
    const autosave = worklogAutosave()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    await vi.advanceTimersByTimeAsync(800)
    expect(autosave.snapshot().state).toBe('offline')
    expect(save).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('online'))
    expect(save).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(0)
    expect(autosave.snapshot().state).toBe('saved')
  })

  it('AC-010.11: 돌려준 함수를 부르기 전까지는 듣기가 남고, 부르면 모두 뗀다', () => {
    const stop = startWorklogSession()
    worklogAutosave().change(YMD, dayWith({ cashIn: '100000' }))
    expect(leaveIsBlocked()).toBe(true)
    stop()
    expect(leaveIsBlocked()).toBe(false)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('AC-010.11: 이미 끝난 세션의 정리 함수는 새 세션을 떼지 않는다', () => {
    const old = startWorklogSession()
    old()
    startWorklogSession()
    old()
    worklogAutosave().change(YMD, dayWith({ cashIn: '100000' }))
    expect(leaveIsBlocked()).toBe(true)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

describe('AC-010.12 로그아웃', () => {
  it('AC-010.12: SIGNED_OUT이면 떠나기 확인을 떼고 자동 저장 제어를 비운다', async () => {
    startWorklogSession()
    const autosave = worklogAutosave()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    expect(leaveIsBlocked()).toBe(true)

    emitAuth('SIGNED_OUT')

    expect(leaveIsBlocked()).toBe(false)
    expect(autosave.hasUnsaved()).toBe(false)
    expect(autosave.pendingDay(YMD)).toBeNull()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-010.12: 걸어 둔 화면 지우기는 떠나기 확인을 떼고 제어를 비운 뒤에 불린다', () => {
    startWorklogSession()
    const autosave = worklogAutosave()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    const seen: Array<{ blocked: boolean; pending: { day: WorklogDay } | null }> = []
    const off = onWorklogSignedOut(() => seen.push({ blocked: leaveIsBlocked(), pending: autosave.pendingDay(YMD) }))

    emitAuth('SIGNED_OUT')

    expect(seen).toEqual([{ blocked: false, pending: null }])
    off()
  })

  it('AC-010.12: 뗀 화면 지우기는 불리지 않는다', () => {
    startWorklogSession()
    const listener = vi.fn()
    const off = onWorklogSignedOut(listener)
    off()
    emitAuth('SIGNED_OUT')
    expect(listener).not.toHaveBeenCalled()
  })

  it.each(['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'])(
    'AC-010.12: %s에는 아무것도 지우지 않는다',
    (event) => {
      startWorklogSession()
      const listener = vi.fn()
      const off = onWorklogSignedOut(listener)
      const autosave = worklogAutosave()
      autosave.change(YMD, dayWith({ cashIn: '100000' }))

      emitAuth(event)

      expect(listener).not.toHaveBeenCalled()
      expect(autosave.hasUnsaved()).toBe(true)
      expect(leaveIsBlocked()).toBe(true)
      off()
    },
  )

  it('AC-010.12: 로그아웃 뒤 나간 저장의 응답이 와도 제어가 되살아나지 않는다', async () => {
    startWorklogSession()
    let finish!: () => void
    save.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
    const autosave = worklogAutosave()
    autosave.change(YMD, dayWith({ cashIn: '100000' }))
    autosave.flush()

    emitAuth('SIGNED_OUT')
    finish()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(autosave.snapshot().savedAt).toBeNull()
    expect(autosave.hasUnsaved()).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('AC-010.6·AC-010.12: 로그아웃 뒤 다시 들어와 화면을 열면 떠나기 확인이 다시 걸린다', () => {
    startWorklogSession()
    emitAuth('SIGNED_OUT')
    startWorklogSession()
    worklogAutosave().change(YMD, dayWith({ cashIn: '100000' }))
    expect(leaveIsBlocked()).toBe(true)
    expect(client.auth.onAuthStateChange).toHaveBeenCalledTimes(2)
  })
})
