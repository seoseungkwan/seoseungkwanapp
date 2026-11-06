// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveWorklogDay, WorklogStorageError } from '@/lib/storage/worklogDays'
import {
  emptyWorklogCash,
  emptyWorklogDay,
  type MemoFontPt,
  type WorklogCash,
  type WorklogCellKey,
  type WorklogDay,
  type WorklogNumberKey,
  type WorklogSavedDay,
} from '@/types/worklog'
import { useWorklogDay } from './useWorklogDay'
import { worklogAutosave } from './worklogSession'

// 날짜별 화면 값과 읽기 상태. 값은 둥근 가짜 숫자와 "가상" 글자다
const client = vi.hoisted(() => ({ auth: { onAuthStateChange: vi.fn() } }))

vi.mock('@/lib/storage/worklogDays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/worklogDays')>()),
  loadWorklogDay: vi.fn(),
  saveWorklogDay: vi.fn(),
}))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => client }))

const DAY = '2026-10-28'
const OTHER = '2026-10-27'
const save = vi.mocked(saveWorklogDay)
const load = vi.fn<(ymd: string) => Promise<WorklogSavedDay | null>>()
let focused: WorklogCellKey | null = null
const focusKey = () => focused

const dayWith = (cells: Partial<WorklogDay> = {}): WorklogDay => ({ ...emptyWorklogDay(), ...cells })
// 읽기가 돌려주는 모양(AC-016.1). 비트 칸 목록은 비트 표시 전(TASK-17)까지 화면 값에 섞이지 않는다
const saved = (cells: Partial<WorklogDay> = {}, bitFields: WorklogNumberKey[] = []): WorklogSavedDay => ({
  day: dayWith(cells),
  bitFields,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(ymd = DAY) {
  return renderHook((props: { ymd: string }) => useWorklogDay(props.ymd, load, focusKey), { initialProps: { ymd } })
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function ready(ymd = DAY, cells: Partial<WorklogDay> = {}) {
  load.mockResolvedValueOnce(saved(cells))
  const view = setup(ymd)
  await settle()
  expect(view.result.current.status).toBe('ready')
  return view
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  focused = null
  load.mockReset()
  load.mockResolvedValue(null)
  save.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  worklogAutosave().dispose()
  vi.useRealTimers()
})

describe('AC-010.1 처음 읽기', () => {
  it('AC-010.1: 읽는 동안 loading이고 빈 하루이며, 다 읽으면 ready이고 서버 값이다', async () => {
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    const { result } = setup()
    expect(result.current.status).toBe('loading')
    expect(result.current.day).toEqual(emptyWorklogDay())
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(DAY)

    await act(async () => reply.resolve(saved({ cashIn: '100000', memo: '가상 글' })))

    expect(result.current.status).toBe('ready')
    expect(result.current.day).toEqual(dayWith({ cashIn: '100000', memo: '가상 글' }))
  })

  it('AC-010.2: 서버 줄이 없는 날은 빈 하루이고 저장을 부르지 않는다', async () => {
    const { result } = setup()
    await settle(60_000)
    expect(result.current.status).toBe('ready')
    expect(result.current.day).toEqual(emptyWorklogDay())
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-010.1: StrictMode로 효과가 두 번 돌아도 마지막 응답으로 열린다', async () => {
    const first = deferred<WorklogSavedDay | null>()
    const second = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useWorklogDay(DAY, load, focusKey), { wrapper: StrictMode })
    expect(load).toHaveBeenCalledTimes(2)

    await act(async () => first.resolve(saved({ cashIn: '100000' })))
    expect(result.current.status).toBe('loading')

    await act(async () => second.resolve(saved({ cashIn: '200000' })))
    expect(result.current.status).toBe('ready')
    expect(result.current.day.cashIn).toBe('200000')
  })

  it('AC-010.4: 자동 저장에 저장 안 된 값이 있으면 읽기 전에 그 값을 먼저 보인다', async () => {
    worklogAutosave().change(DAY, dayWith({ cashIn: '100000' }))
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    const { result } = setup()
    expect(result.current.status).toBe('loading')
    expect(result.current.day.cashIn).toBe('100000')

    await act(async () => reply.resolve(saved({ memo: '가상 글' })))

    expect(result.current.status).toBe('ready')
    expect(result.current.day.cashIn).toBe('100000')
    expect(result.current.day.memo).toBe('가상 글')
  })

  it('AC-010.11: 읽는 동안 저장이 끝나 저장 안 된 값이 없어져도 보이던 값이 비지 않는다', async () => {
    const autosave = worklogAutosave()
    autosave.change(DAY, dayWith({ cashIn: '100000' }))
    autosave.flush()
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    const { result, rerender } = setup()

    await settle()
    expect(autosave.pendingDay(DAY)).toBeNull()
    rerender({ ymd: DAY })

    expect(result.current.status).toBe('loading')
    expect(result.current.day.cashIn).toBe('100000')
  })
})

describe('AC-010.16 첫 읽기 중 저장', () => {
  it('AC-010.16: 첫 읽기 중 그 날 저장이 오가면 응답을 버리고 잠근 채 다시 읽는다', async () => {
    const autosave = worklogAutosave()
    const finish = deferred<void>()
    save.mockReturnValueOnce(finish.promise)
    autosave.change(DAY, dayWith({ cashIn: '100000' }))
    autosave.flush()

    const old = deferred<WorklogSavedDay | null>()
    const fresh = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    const serverDay = vi.spyOn(autosave, 'serverDay')
    const { result } = setup()

    await act(async () => finish.resolve())
    await act(async () => old.resolve(null))

    expect(serverDay).not.toHaveBeenCalled()
    expect(result.current.status).toBe('loading')
    expect(load).toHaveBeenCalledTimes(2)

    await act(async () => fresh.resolve(saved({ cashIn: '100000' })))

    expect(result.current.status).toBe('ready')
    expect(result.current.day.cashIn).toBe('100000')
    serverDay.mockRestore()
  })

  it('AC-010.16: 다시 읽는 중 또 저장이 오가면 또 다시 읽는다(갇히지 않는다)', async () => {
    const autosave = worklogAutosave()
    const firstSave = deferred<void>()
    save.mockReturnValueOnce(firstSave.promise)
    autosave.change(DAY, dayWith({ cashIn: '100000' }))
    autosave.flush()

    const one = deferred<WorklogSavedDay | null>()
    const two = deferred<WorklogSavedDay | null>()
    const three = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise).mockReturnValueOnce(three.promise)
    const { result } = setup()

    await act(async () => firstSave.resolve())
    await act(async () => one.resolve(null))
    expect(load).toHaveBeenCalledTimes(2)

    const secondSave = deferred<void>()
    save.mockReturnValueOnce(secondSave.promise)
    autosave.change(DAY, dayWith({ cashIn: '200000' }))
    autosave.flush()
    await act(async () => secondSave.resolve())
    await act(async () => two.resolve(saved({ cashIn: '100000' })))
    expect(load).toHaveBeenCalledTimes(3)
    expect(result.current.status).toBe('loading')

    await act(async () => three.resolve(saved({ cashIn: '200000' })))
    expect(result.current.status).toBe('ready')
    expect(result.current.day.cashIn).toBe('200000')
  })
})

describe('AC-010.8 읽기 실패', () => {
  it('AC-010.8: 실패하면 error이고 reload로 다시 읽는다', async () => {
    load.mockRejectedValueOnce(new WorklogStorageError('failed'))
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('error')

    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    act(() => result.current.reload())
    expect(result.current.status).toBe('loading')
    await act(async () => reply.resolve(saved({ cashIn: '100000' })))
    expect(result.current.status).toBe('ready')
    expect(result.current.day.cashIn).toBe('100000')
  })

  it('AC-010.8: 실패한 날을 떠났다 돌아오면 카드 없이 잠근 채 다시 읽는다', async () => {
    load.mockRejectedValueOnce(new WorklogStorageError('failed'))
    const { result, rerender } = setup()
    await settle()
    expect(result.current.status).toBe('error')

    rerender({ ymd: OTHER })
    await settle()
    expect(result.current.status).toBe('ready')

    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    rerender({ ymd: DAY })
    expect(result.current.status).toBe('loading')
    await act(async () => reply.resolve(null))
    expect(result.current.status).toBe('ready')
  })

  it('AC-010.8: 실패한 날에는 refresh가 읽지 않는다(ready인 날만)', async () => {
    load.mockRejectedValueOnce(new WorklogStorageError('failed'))
    const { result } = setup()
    await settle()
    act(() => result.current.refresh())
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('error')
  })

  it('AC-010.8: 읽는 중에는 refresh가 읽지 않는다(ready인 날만)', () => {
    load.mockReturnValueOnce(deferred<WorklogSavedDay | null>().promise)
    const { result } = setup()
    act(() => result.current.refresh())
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('loading')
  })
})

describe('AC-010.3 칸 바꾸기', () => {
  it('AC-010.3: setCell은 그 칸이 바뀐 하루를 돌려주고 화면 값도 바꾸며, 저장은 부르지 않는다', async () => {
    const { result } = await ready(DAY, { cashIn: '100000' })
    const change = vi.spyOn(worklogAutosave(), 'change')

    let returned: { day: WorklogDay } | undefined
    act(() => {
      returned = result.current.setCell('memo', '가상 글')
    })

    expect(returned?.day).toEqual(dayWith({ cashIn: '100000', memo: '가상 글' }))
    expect(result.current.day).toEqual(dayWith({ cashIn: '100000', memo: '가상 글' }))
    expect(change).not.toHaveBeenCalled()
    change.mockRestore()
  })

  it('AC-010.3: 같은 때 두 칸을 바꿔도 앞 칸을 잃지 않는다', async () => {
    const { result } = await ready()
    let last: { day: WorklogDay } | undefined
    act(() => {
      result.current.setCell('cashIn', '100000')
      last = result.current.setCell('cardIn', '200000')
    })
    expect(last?.day).toEqual(dayWith({ cashIn: '100000', cardIn: '200000' }))
    expect(result.current.day).toEqual(dayWith({ cashIn: '100000', cardIn: '200000' }))
  })
})

describe('AC-010.4 날짜 옮김', () => {
  it('AC-010.4: 처음 여는 날은 읽는 동안 loading이고 옛 날짜의 값이 보이지 않는다', async () => {
    const { result, rerender } = await ready(DAY, { cashIn: '100000' })
    load.mockReturnValueOnce(deferred<WorklogSavedDay | null>().promise)
    rerender({ ymd: OTHER })
    expect(result.current.status).toBe('loading')
    expect(result.current.day).toEqual(emptyWorklogDay())
  })

  it('AC-010.4: 늦게 온 옛 읽기 응답은 버린다', async () => {
    const late = deferred<WorklogSavedDay | null>()
    const now = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(late.promise).mockReturnValueOnce(now.promise)
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')
    const { result, rerender } = setup(DAY)
    rerender({ ymd: OTHER })

    await act(async () => now.resolve(saved({ cashIn: '200000' })))
    await act(async () => late.resolve(saved({ cashIn: '100000' })))

    expect(result.current.day.cashIn).toBe('200000')
    expect(serverDay).toHaveBeenCalledTimes(1)
    expect(serverDay.mock.calls[0][0]).toBe(OTHER)
    serverDay.mockRestore()
  })

  it('AC-010.4: 응답 전에 떠난 날로 돌아오면 다시 읽고, 옛 응답은 버린다', async () => {
    const first = deferred<WorklogSavedDay | null>()
    const other = deferred<WorklogSavedDay | null>()
    const again = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(first.promise).mockReturnValueOnce(other.promise).mockReturnValueOnce(again.promise)
    const { result, rerender } = setup(DAY)
    rerender({ ymd: OTHER })
    rerender({ ymd: DAY })
    expect(load).toHaveBeenCalledTimes(3)
    expect(result.current.status).toBe('loading')

    await act(async () => first.resolve(saved({ cashIn: '100000' })))
    expect(result.current.status).toBe('loading')

    await act(async () => again.resolve(saved({ cashIn: '200000' })))
    expect(result.current.status).toBe('ready')
    expect(result.current.day.cashIn).toBe('200000')
  })

  it('AC-010.4: 이미 연 날로 돌아오면 화면 값을 바로 보이고 잠그지 않은 채 다시 읽는다', async () => {
    const { result, rerender } = await ready(DAY, { cashIn: '100000' })
    rerender({ ymd: OTHER })
    await settle()

    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    rerender({ ymd: DAY })

    expect(result.current.status).toBe('ready')
    expect(result.current.day.cashIn).toBe('100000')
    expect(load).toHaveBeenLastCalledWith(DAY)

    await act(async () => reply.resolve(saved({ cashIn: '200000' })))
    expect(result.current.status).toBe('ready')
    expect(result.current.day.cashIn).toBe('200000')
  })

  it('AC-010.4: 다시 읽기 중 다른 날로 옮기면 그 응답은 지금 날에 들어가지 않는다', async () => {
    const { result, rerender } = await ready(DAY, { cashIn: '100000' })
    const late = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(late.promise)
    act(() => result.current.refresh())
    load.mockResolvedValueOnce(saved({ cashIn: '300000' }))
    rerender({ ymd: OTHER })
    await settle()
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')

    await act(async () => late.resolve(saved({ cashIn: '200000' })))

    expect(result.current.day.cashIn).toBe('300000')
    expect(serverDay).not.toHaveBeenCalled()
    serverDay.mockRestore()
  })
})

describe('AC-010.13 다시 읽기', () => {
  it('AC-010.13·AC-017.7: 받은 값은 serverDay(날짜, 값, 초점 칸, 읽은 목록)의 결과로 화면 값을 바꾸고 저장을 부르지 않는다', async () => {
    const { result } = await ready(DAY, { cashIn: '100000', cardIn: '100000' })
    const autosave = worklogAutosave()
    const serverDay = vi.spyOn(autosave, 'serverDay')
    const change = vi.spyOn(autosave, 'change')
    focused = 'cardIn'
    const server = dayWith({ cashIn: '200000', cardIn: '200000' })
    load.mockResolvedValueOnce({ day: server, bitFields: ['cashIn'] })

    act(() => result.current.refresh())
    await settle(60_000)

    expect(serverDay).toHaveBeenCalledWith(DAY, server, 'cardIn', ['cashIn'], 11, emptyWorklogCash())
    expect(result.current.day.cashIn).toBe('200000')
    expect(result.current.day.cardIn).toBe('100000')
    expect(change).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    serverDay.mockRestore()
    change.mockRestore()
  })

  it('AC-010.13: 저장 안 된 칸은 그대로 두고 나머지만 반영한다', async () => {
    const { result } = await ready(DAY, { cashIn: '100000' })
    let day: WorklogDay | undefined
    act(() => {
      day = result.current.setCell('cardIn', '300000').day
    })
    worklogAutosave().change(DAY, day as WorklogDay)
    load.mockResolvedValueOnce(saved({ cashIn: '200000', cardIn: '200000' }))

    act(() => result.current.refresh())
    await settle()

    expect(result.current.day.cashIn).toBe('200000')
    expect(result.current.day.cardIn).toBe('300000')
  })

  it('AC-010.13: 겹친 다시 읽기는 마지막 요청의 응답만 쓴다', async () => {
    const { result } = await ready(DAY, { cashIn: '100000' })
    const older = deferred<WorklogSavedDay | null>()
    const newer = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    act(() => result.current.refresh())
    act(() => result.current.refresh())

    await act(async () => newer.resolve(saved({ cashIn: '300000' })))
    await act(async () => older.resolve(saved({ cashIn: '200000' })))

    expect(result.current.day.cashIn).toBe('300000')
  })

  it.each([
    ['failed', new WorklogStorageError('failed')],
    ['offline', new WorklogStorageError('offline')],
  ])('AC-010.14: 다시 읽기 실패(%s)는 상태와 값을 그대로 두고 다음에 다시 한다', async (_kind, error) => {
    const { result } = await ready(DAY, { cashIn: '100000' })
    load.mockRejectedValueOnce(error)
    act(() => result.current.refresh())
    await settle()
    expect(result.current.status).toBe('ready')
    expect(result.current.day.cashIn).toBe('100000')

    load.mockResolvedValueOnce(saved({ cashIn: '200000' }))
    act(() => result.current.refresh())
    await settle()
    expect(result.current.day.cashIn).toBe('200000')
  })

  it('AC-010.14: 읽기를 시작한 뒤 그 날 저장이 오갔으면 응답을 버린다', async () => {
    const { result } = await ready(DAY, { cashIn: '100000' })
    const autosave = worklogAutosave()
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    act(() => result.current.refresh())

    let day: WorklogDay | undefined
    act(() => {
      day = result.current.setCell('cashIn', '200000').day
    })
    autosave.change(DAY, day as WorklogDay)
    autosave.flush()
    await settle()

    const serverDay = vi.spyOn(autosave, 'serverDay')
    await act(async () => reply.resolve(saved({ cashIn: '100000', memo: '가상 옛 글' })))

    expect(serverDay).not.toHaveBeenCalled()
    expect(result.current.day.cashIn).toBe('200000')
    expect(result.current.day.memo).toBe('')
    expect(load).toHaveBeenCalledTimes(2)
    serverDay.mockRestore()
  })
})

describe('AC-010.12 지우기', () => {
  it('AC-010.12: clear하면 값이 비고 잠기며, 그 뒤 온 읽기 응답은 버린다', async () => {
    const { result } = await ready(DAY, { cashIn: '100000', memo: '가상 글' })
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    act(() => result.current.refresh())
    const autosave = worklogAutosave()
    autosave.dispose()

    act(() => result.current.clear())
    expect(result.current.status).toBe('loading')
    expect(result.current.day).toEqual(emptyWorklogDay())

    const serverDay = vi.spyOn(autosave, 'serverDay')
    await act(async () => reply.resolve(saved({ cashIn: '100000', memo: '가상 글' })))
    expect(result.current.day).toEqual(emptyWorklogDay())
    expect(serverDay).not.toHaveBeenCalled()
    serverDay.mockRestore()
  })

  it('AC-010.12: 첫 읽기 중 clear해도 응답이 칸을 채우지 않는다', async () => {
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    const { result } = setup()

    act(() => result.current.clear())
    await act(async () => reply.resolve(saved({ cashIn: '100000' })))

    expect(result.current.status).toBe('loading')
    expect(result.current.day).toEqual(emptyWorklogDay())
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('AC-010.12: 첫 읽기가 실패해도 clear 뒤에는 오류 상태가 되지 않는다', async () => {
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    const { result } = setup()

    act(() => result.current.clear())
    await act(async () => reply.reject(new WorklogStorageError('failed')))

    expect(result.current.status).toBe('loading')
  })

  it('AC-010.12: clear 뒤에는 날짜를 옮기거나 다시 읽어도 읽지 않는다', async () => {
    const { result, rerender } = await ready(DAY, { cashIn: '100000' })
    expect(load).toHaveBeenCalledTimes(1)
    act(() => result.current.clear())

    act(() => result.current.refresh())
    act(() => result.current.reload())
    rerender({ ymd: OTHER })
    await settle()

    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('loading')
    expect(result.current.day).toEqual(emptyWorklogDay())
  })

  it('AC-010.12: clear하면 다른 날에 둔 화면 값도 지운다', async () => {
    const { result, rerender } = await ready(DAY, { cashIn: '100000' })
    load.mockResolvedValueOnce(null)
    rerender({ ymd: OTHER })
    await settle()
    worklogAutosave().dispose()

    act(() => result.current.clear())
    rerender({ ymd: DAY })

    expect(result.current.day).toEqual(emptyWorklogDay())
  })
})

describe('AC-010.11 화면이 내려감', () => {
  it('AC-010.11: 내려간 뒤 온 읽기 응답은 자동 저장 제어에 넘기지 않는다', async () => {
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')
    const { unmount } = setup()

    unmount()
    await act(async () => reply.resolve(saved({ cashIn: '100000' })))

    expect(serverDay).not.toHaveBeenCalled()
    serverDay.mockRestore()
  })

  it('AC-010.11: 내려간 뒤 끝난 다시 읽기도 넘기지 않는다', async () => {
    const { result, unmount } = await ready(DAY, { cashIn: '100000' })
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    act(() => result.current.refresh())
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')

    unmount()
    await act(async () => reply.resolve(saved({ cashIn: '200000' })))

    expect(serverDay).not.toHaveBeenCalled()
    serverDay.mockRestore()
  })
})

describe('AC-016.1 읽기 모양 { day, bitFields }', () => {
  it('AC-016.1·AC-017.7: 처음 읽기는 읽은 day와 목록을 따로 serverDay에 넘기고, 화면 값(day)에 비트 칸 목록이 섞이지 않는다', async () => {
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')
    load.mockResolvedValueOnce(saved({ cashIn: '100000', memo: '가상 글' }, ['cashIn', 'newPatients']))
    const { result } = setup()
    await settle()

    expect(result.current.status).toBe('ready')
    expect(serverDay).toHaveBeenCalledWith(DAY, dayWith({ cashIn: '100000', memo: '가상 글' }), null, ['cashIn', 'newPatients'], 11, emptyWorklogCash())
    expect(result.current.day).toEqual(dayWith({ cashIn: '100000', memo: '가상 글' }))
    expect(result.current.day).not.toHaveProperty('bitFields')
    expect(result.current.bitFields).toEqual(['cashIn', 'newPatients'])
    expect(save).not.toHaveBeenCalled()
    serverDay.mockRestore()
  })

  it('AC-016.1·AC-017.7: 줄이 없는 날(null)은 serverDay에 null과 빈 목록을 넘겨 빈 하루·빈 목록이다', async () => {
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')
    load.mockResolvedValueOnce(null)
    const { result } = setup()
    await settle()

    expect(serverDay).toHaveBeenCalledWith(DAY, null, null, [], 11, emptyWorklogCash())
    expect(result.current.day).toEqual(emptyWorklogDay())
    expect(result.current.bitFields).toEqual([])
    serverDay.mockRestore()
  })

  it('AC-016.1·AC-017.7: 다시 읽기도 읽은 day와 목록을 따로 serverDay에 넘기고, 돌려받은 목록으로 표시를 그린다', async () => {
    const { result } = await ready(DAY, { cashIn: '100000' })
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')
    load.mockResolvedValueOnce(saved({ cashIn: '200000' }, ['cashIn']))

    act(() => result.current.refresh())
    await settle()

    expect(serverDay).toHaveBeenCalledWith(DAY, dayWith({ cashIn: '200000' }), null, ['cashIn'], 11, emptyWorklogCash())
    expect(result.current.day).toEqual(dayWith({ cashIn: '200000' }))
    expect(result.current.bitFields).toEqual(['cashIn'])
    serverDay.mockRestore()
  })
})

// ── 비트 칸 목록(worklog REQ-017, design.md 20-4·20-5절): 날짜별 화면 값이 목록도 든다. 사람이 숫자 칸을 고치면 그 칸을 뺀다(dropBitField).
// 맞춤(mergeBit·takeBitValue)은 화면이 editBit로 그날 최신 값에 바로 적용한다(ready인 날만). 저장은 부르지 않는다
describe('AC-017.7 날짜별 비트 칸 목록', () => {
  it('AC-017.7: 사람이 비트 칸을 고치면 setCell이 그 칸을 뺀 목록을 돌려주고 화면 목록도 줄며, 저장은 부르지 않는다', async () => {
    load.mockResolvedValueOnce(saved({ newPatients: '10', cashIn: '100000' }, ['newPatients', 'cashIn']))
    const { result } = setup()
    await settle()
    const change = vi.spyOn(worklogAutosave(), 'change')

    let edited: { day: WorklogDay; bitFields?: WorklogNumberKey[] } | undefined
    act(() => {
      edited = result.current.setCell('cashIn', '120000')
    })

    expect(edited).toEqual({ day: dayWith({ newPatients: '10', cashIn: '120000' }), bitFields: ['newPatients'] })
    expect(result.current.bitFields).toEqual(['newPatients'])
    expect(change).not.toHaveBeenCalled()
    change.mockRestore()
  })

  it('AC-017.7: 비트 칸 밖 칸을 고치면 목록은 그대로다', async () => {
    load.mockResolvedValueOnce(saved({ cashIn: '100000' }, ['cashIn']))
    const { result } = setup()
    await settle()
    let edited: { day: WorklogDay; bitFields?: WorklogNumberKey[] } | undefined
    act(() => {
      edited = result.current.setCell('spendCash', '20000')
      result.current.setCell('memo', '가상 글')
    })
    expect(edited?.bitFields).toEqual(['cashIn'])
    expect(result.current.bitFields).toEqual(['cashIn'])
  })

  it('AC-017.7: 목록을 모르는 날(자동 저장에도 없음)은 setCell이 목록을 돌려주지 않는다', () => {
    load.mockReturnValueOnce(deferred<WorklogSavedDay | null>().promise)
    const { result } = setup()
    let edited: { day: WorklogDay; bitFields?: WorklogNumberKey[] } | undefined
    act(() => {
      edited = result.current.setCell('cashIn', '100000')
    })
    expect(edited).not.toHaveProperty('bitFields')
    expect(result.current.bitFields).toBeUndefined()
  })

  it('AC-017.7: 앱 안 이동 뒤 돌아오면 자동 저장에 남은 목록을 읽기 전에 먼저 보인다', async () => {
    worklogAutosave().change(DAY, dayWith({ cashIn: '100000' }), ['cashIn'])
    load.mockReturnValueOnce(deferred<WorklogSavedDay | null>().promise)
    const { result } = setup()
    expect(result.current.status).toBe('loading')
    expect(result.current.bitFields).toEqual(['cashIn'])
  })

  it('AC-017.7: 다시 읽은 목록은 표시로 보이고, 저장 안 된 목록은 그대로다', async () => {
    load.mockResolvedValueOnce(saved({ cashIn: '100000' }, []))
    const { result } = setup()
    await settle()

    load.mockResolvedValueOnce(saved({ cashIn: '100000', cardIn: '200000' }, ['cardIn']))
    act(() => result.current.refresh())
    await settle()
    expect(result.current.bitFields).toEqual(['cardIn'])

    let edited: { day: WorklogDay; bitFields?: WorklogNumberKey[] } | undefined
    act(() => {
      edited = result.current.setCell('cardIn', '250000')
    })
    worklogAutosave().change(DAY, edited!.day, edited!.bitFields)
    load.mockResolvedValueOnce(saved({ cashIn: '100000', cardIn: '200000' }, ['cardIn', 'cashIn']))
    act(() => result.current.refresh())
    await settle()
    expect(result.current.bitFields).toEqual([])
    expect(result.current.day.cardIn).toBe('250000')
  })

  it('AC-017.8: editBit은 ready인 날의 최신 값·목록으로 맞춤을 돌려 화면 값·목록을 바꾸고 결과를 돌려준다(저장은 부르지 않는다)', async () => {
    load.mockResolvedValueOnce(saved({ cashIn: '100000' }, []))
    const { result } = setup()
    await settle()
    const change = vi.spyOn(worklogAutosave(), 'change')
    const seen: Array<[WorklogDay, readonly WorklogNumberKey[]]> = []

    let applied: { day: WorklogDay; bitFields: WorklogNumberKey[] } | null = null
    act(() => {
      result.current.setCell('memo', '가상 글')
      applied = result.current.editBit((day, fields) => {
        seen.push([day, fields])
        return { day: { ...day, cardIn: '200000' }, bitFields: [...fields, 'cardIn'] }
      })
    })

    expect(seen).toEqual([[dayWith({ cashIn: '100000', memo: '가상 글' }), []]])
    expect(applied).toEqual({ day: dayWith({ cashIn: '100000', memo: '가상 글', cardIn: '200000' }), bitFields: ['cardIn'] })
    expect(result.current.day.cardIn).toBe('200000')
    expect(result.current.bitFields).toEqual(['cardIn'])
    expect(change).not.toHaveBeenCalled()
    change.mockRestore()
  })

  it('AC-017.8: editBit은 맞춤이 null을 돌려주면 아무것도 바꾸지 않는다', async () => {
    load.mockResolvedValueOnce(saved({ cashIn: '100000' }, ['cashIn']))
    const { result } = setup()
    await settle()
    let applied: unknown = 'not-called'
    act(() => {
      applied = result.current.editBit(() => null)
    })
    expect(applied).toBeNull()
    expect(result.current.day).toEqual(dayWith({ cashIn: '100000' }))
    expect(result.current.bitFields).toEqual(['cashIn'])
  })

  it.each([
    ['읽는 중', () => load.mockReturnValueOnce(deferred<WorklogSavedDay | null>().promise)],
    ['불러오기 실패', () => load.mockRejectedValueOnce(new WorklogStorageError('failed'))],
  ])('AC-017.8: %s인 날에는 editBit이 맞춤을 부르지 않고 null이다(합치지 않는다)', async (_name, arrange) => {
    arrange()
    const { result } = setup()
    await settle()
    const edit = vi.fn(() => ({ day: dayWith({ cashIn: '100000' }), bitFields: ['cashIn'] as WorklogNumberKey[] }))
    let applied: unknown = 'not-called'
    act(() => {
      applied = result.current.editBit(edit)
    })
    expect(edit).not.toHaveBeenCalled()
    expect(applied).toBeNull()
    expect(result.current.day.cashIn).toBe('')
  })
})

// ── 업무사항 글씨 크기(worklog-memo-font REQ-1508, design.md '화면 잇기'): 날짜 칸이 크기도 든다. 읽은 크기는 serverDay 다섯째 인자로 넘기고(줄 없음·크기 없음 → 11)
// 돌려받은 크기를 그린다. setMemoFont는 그날이 ready일 때만 화면 크기를 바꾼다(저장은 화면이 부른다). 칸 고치기·비트 맞춤은 크기를 떨어뜨리지 않는다
describe('AC-1508 날짜별 업무사항 글씨 크기', () => {
  const withFont = (memoFontPt: MemoFontPt, cells: Partial<WorklogDay> = {}, bitFields: WorklogNumberKey[] = []): WorklogSavedDay => ({
    ...saved(cells, bitFields),
    memoFontPt,
  })

  it('AC-1508.1·AC-1508.4: 저장된 크기 14는 serverDay 다섯째 인자로 넘기고, 읽는 동안은 11·다 읽으면 14다', async () => {
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    const { result } = setup()
    expect(result.current.memoFontPt).toBe(11)

    await act(async () => reply.resolve(withFont(14, { memo: '가상 글' })))

    expect(serverDay).toHaveBeenCalledWith(DAY, dayWith({ memo: '가상 글' }), null, [], 14, emptyWorklogCash())
    expect(result.current.status).toBe('ready')
    expect(result.current.memoFontPt).toBe(14)
    expect(save).not.toHaveBeenCalled()
    serverDay.mockRestore()
  })

  it.each([
    ['줄이 없는 날(null)', null],
    ['memoFontPt가 없는 응답', saved({ cashIn: '100000' })],
  ])('AC-1508.1: %s은 11이다', async (_name, reply) => {
    load.mockResolvedValueOnce(reply)
    const { result } = setup()
    await settle()
    expect(result.current.status).toBe('ready')
    expect(result.current.memoFontPt).toBe(11)
  })

  it('AC-1508.1: 전날이 14여도 처음 여는 다음 날은 11이다(이어받지 않는다)', async () => {
    load.mockResolvedValueOnce(withFont(14))
    const { result, rerender } = setup(OTHER)
    await settle()
    expect(result.current.memoFontPt).toBe(14)

    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    rerender({ ymd: DAY })
    expect(result.current.memoFontPt).toBe(11)
    await act(async () => reply.resolve(null))
    expect(result.current.memoFontPt).toBe(11)
  })

  it('AC-1508.2: setMemoFont는 ready인 날의 화면 크기를 바로 바꾸고 참이며, 자동 저장·저장을 부르지 않는다', async () => {
    const { result } = await ready(DAY, { memo: '가상 글' })
    const autosave = worklogAutosave()
    const changeMemoFont = vi.spyOn(autosave, 'changeMemoFont')
    const change = vi.spyOn(autosave, 'change')

    let done: boolean | undefined
    act(() => {
      done = result.current.setMemoFont(12)
    })

    expect(done).toBe(true)
    expect(result.current.memoFontPt).toBe(12)
    expect(result.current.day).toEqual(dayWith({ memo: '가상 글' }))
    expect(changeMemoFont).not.toHaveBeenCalled()
    expect(change).not.toHaveBeenCalled()
    await settle(5000)
    expect(save).not.toHaveBeenCalled()
    changeMemoFont.mockRestore()
    change.mockRestore()
  })

  it.each([
    ['읽는 중', () => load.mockReturnValueOnce(deferred<WorklogSavedDay | null>().promise)],
    ['불러오기 실패', () => load.mockRejectedValueOnce(new WorklogStorageError('failed'))],
  ])('AC-1508.2: %s인 날에는 setMemoFont가 거짓이고 크기가 11 그대로다', async (_name, arrange) => {
    arrange()
    const { result } = setup()
    await settle()
    let done: boolean | undefined
    act(() => {
      done = result.current.setMemoFont(12)
    })
    expect(done).toBe(false)
    expect(result.current.memoFontPt).toBe(11)
  })

  it('AC-1508.3: 다른 날로 옮겼다 돌아오면 저장 안 된 크기가 그대로이고, 옮겨 간 날은 그날 크기다', async () => {
    const { result, rerender } = await ready()
    act(() => {
      result.current.setMemoFont(12)
    })
    worklogAutosave().changeMemoFont(DAY, 12)

    load.mockResolvedValueOnce(withFont(16))
    rerender({ ymd: OTHER })
    await settle()
    expect(result.current.memoFontPt).toBe(16)

    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    rerender({ ymd: DAY })
    expect(result.current.memoFontPt).toBe(12)
    await act(async () => reply.resolve(null))
    expect(result.current.memoFontPt).toBe(12)
  })

  it('AC-1508.3: 앱 안 이동 뒤 다시 열면 자동 저장에 남은 크기를 읽기 전에 먼저 보이고, 읽은 뒤에도 그대로다', async () => {
    const autosave = worklogAutosave()
    autosave.serverDay(DAY, null, null, [], 11)
    autosave.changeMemoFont(DAY, 14)
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)

    const { result } = setup()
    expect(result.current.status).toBe('loading')
    expect(result.current.memoFontPt).toBe(14)

    await act(async () => reply.resolve(null))
    expect(result.current.status).toBe('ready')
    expect(result.current.memoFontPt).toBe(14)
  })

  it('AC-1508.4: 다시 읽기가 다른 PC가 바꾼 크기를 serverDay 다섯째 인자로 넘겨 반영하고, 저장을 부르지 않는다', async () => {
    const { result } = await ready()
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')
    load.mockResolvedValueOnce(withFont(16))

    act(() => result.current.refresh())
    await settle(60_000)

    expect(serverDay).toHaveBeenCalledWith(DAY, dayWith(), null, [], 16, emptyWorklogCash())
    expect(result.current.memoFontPt).toBe(16)
    expect(save).not.toHaveBeenCalled()
    serverDay.mockRestore()
  })

  it('AC-1508.4: 저장 안 된 크기는 다시 읽어도 그대로다', async () => {
    const { result } = await ready()
    act(() => {
      result.current.setMemoFont(12)
    })
    worklogAutosave().changeMemoFont(DAY, 12)
    load.mockResolvedValueOnce(withFont(16))

    act(() => result.current.refresh())
    await settle()

    expect(result.current.memoFontPt).toBe(12)
  })

  it('AC-1508.5: 칸 고치기(setCell)는 크기를 이어 가고, 돌려주는 하루·목록에는 크기가 없다', async () => {
    load.mockResolvedValueOnce(withFont(14, { cashIn: '100000' }, ['cashIn']))
    const { result } = setup()
    await settle()

    let edited: { day: WorklogDay; bitFields?: WorklogNumberKey[] } | undefined
    act(() => {
      edited = result.current.setCell('cashIn', '120000')
      result.current.setCell('memo', '가상 글')
    })

    expect(edited).toEqual({ day: dayWith({ cashIn: '120000' }), bitFields: [] })
    expect(edited).not.toHaveProperty('memoFontPt')
    expect(result.current.memoFontPt).toBe(14)
  })

  it('AC-1508.5: 비트 맞춤(editBit)도 크기를 이어 간다', async () => {
    load.mockResolvedValueOnce(withFont(14))
    const { result } = setup()
    await settle()

    act(() => {
      result.current.editBit((day, fields) => ({ day: { ...day, cardIn: '200000' }, bitFields: [...fields, 'cardIn'] }))
    })

    expect(result.current.day.cardIn).toBe('200000')
    expect(result.current.bitFields).toEqual(['cardIn'])
    expect(result.current.memoFontPt).toBe(14)
  })

  it('AC-1508.9: clear(로그아웃)하면 크기도 지워져 11이다', async () => {
    load.mockResolvedValueOnce(withFont(14))
    const { result } = setup()
    await settle()
    expect(result.current.memoFontPt).toBe(14)
    worklogAutosave().dispose()

    act(() => result.current.clear())

    expect(result.current.memoFontPt).toBe(11)
  })
})

// ── 현금 시재(worklog-cash-float REQ-1609, design.md '화면 잇기'): 날짜 칸이 시재도 든다. 읽은 시재는 serverDay 여섯째 인자로 넘기고(줄 없음·cash 없음 → 빈 시재)
// 돌려받은 시재를 그린다. setCash는 그날이 ready일 때만 화면 시재를 바꾼다(저장은 화면이 부른다). 칸 고치기·글씨 크기·비트 맞춤은 시재를 떨어뜨리지 않는다
describe('AC-1609 날짜별 현금 시재', () => {
  // 지어낸 시재: 5만원권 6장·1만원권 12장, 그날 시재 300,000
  const counted = (over: Partial<WorklogCash> = {}): WorklogCash => ({ ...emptyWorklogCash(), count50000: 6, count10000: 12, floatWon: 300000, ...over })
  const withCash = (cash: WorklogCash, cells: Partial<WorklogDay> = {}, bitFields: WorklogNumberKey[] = []): WorklogSavedDay => ({
    ...saved(cells, bitFields),
    cash,
  })

  it('AC-1609.1: 저장된 시재는 serverDay 여섯째 인자로 넘기고, 읽는 동안은 빈 시재·다 읽으면 그 시재다', async () => {
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    const { result } = setup()
    expect(result.current.cash).toEqual(emptyWorklogCash())

    await act(async () => reply.resolve(withCash(counted({ unpaidCash: true, reason: '가상 이유' }), { cashIn: '100000' })))

    expect(serverDay).toHaveBeenCalledWith(DAY, dayWith({ cashIn: '100000' }), null, [], 11, counted({ unpaidCash: true, reason: '가상 이유' }))
    expect(result.current.status).toBe('ready')
    expect(result.current.cash).toEqual(counted({ unpaidCash: true, reason: '가상 이유' }))
    expect(result.current.day).toEqual(dayWith({ cashIn: '100000' }))
    expect(save).not.toHaveBeenCalled()
    serverDay.mockRestore()
  })

  it.each([
    ['줄이 없는 날(null)', null],
    ['cash가 없는 응답', saved({ cashIn: '100000' })],
  ])('AC-1609.1: %s은 serverDay 여섯째 인자가 빈 시재이고 화면도 빈 시재다', async (_name, reply) => {
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')
    load.mockResolvedValueOnce(reply)
    const { result } = setup()
    await settle()

    expect(serverDay).toHaveBeenCalledTimes(1)
    expect(serverDay.mock.calls[0]).toHaveLength(6)
    expect(serverDay.mock.calls[0][5]).toEqual(emptyWorklogCash())
    expect(result.current.status).toBe('ready')
    expect(result.current.cash).toEqual(emptyWorklogCash())
    serverDay.mockRestore()
  })

  it('AC-1609.2: setCash는 ready인 날의 화면 시재를 바로 바꾸고 참이며, 자동 저장·저장을 부르지 않는다', async () => {
    const { result } = await ready(DAY, { cashIn: '100000' })
    const autosave = worklogAutosave()
    const changeCash = vi.spyOn(autosave, 'changeCash')
    const change = vi.spyOn(autosave, 'change')

    let done: boolean | undefined
    act(() => {
      done = result.current.setCash(counted({ floatWon: 250000 }))
    })

    expect(done).toBe(true)
    expect(result.current.cash).toEqual(counted({ floatWon: 250000 }))
    expect(result.current.day).toEqual(dayWith({ cashIn: '100000' }))
    expect(changeCash).not.toHaveBeenCalled()
    expect(change).not.toHaveBeenCalled()
    await settle(5000)
    expect(save).not.toHaveBeenCalled()
    changeCash.mockRestore()
    change.mockRestore()
  })

  it.each([
    ['읽는 중', () => load.mockReturnValueOnce(deferred<WorklogSavedDay | null>().promise)],
    ['불러오기 실패', () => load.mockRejectedValueOnce(new WorklogStorageError('failed'))],
  ])('AC-1609.2: %s인 날에는 setCash가 거짓이고 시재가 빈 시재 그대로다', async (_name, arrange) => {
    arrange()
    const { result } = setup()
    await settle()
    let done: boolean | undefined
    act(() => {
      done = result.current.setCash(counted())
    })
    expect(done).toBe(false)
    expect(result.current.cash).toEqual(emptyWorklogCash())
  })

  it('AC-1609.4: 칸 고치기(setCell)·글씨 크기(setMemoFont)·비트 맞춤(editBit) 뒤에도 시재가 남고, setCell·editBit이 돌려주는 모양에는 시재가 없다', async () => {
    load.mockResolvedValueOnce(withCash(counted(), { cashIn: '100000' }, ['cashIn']))
    const { result } = setup()
    await settle()

    let edited: { day: WorklogDay; bitFields?: WorklogNumberKey[] } | undefined
    act(() => {
      edited = result.current.setCell('cashIn', '120000')
    })
    expect(edited).toEqual({ day: dayWith({ cashIn: '120000' }), bitFields: [] })
    expect(result.current.cash).toEqual(counted())

    act(() => {
      result.current.setMemoFont(14)
    })
    expect(result.current.memoFontPt).toBe(14)
    expect(result.current.cash).toEqual(counted())

    let applied: { day: WorklogDay; bitFields: WorklogNumberKey[] } | null = null
    act(() => {
      applied = result.current.editBit((day, fields) => ({ day: { ...day, cardIn: '200000' }, bitFields: [...fields, 'cardIn'] }))
    })
    expect(applied).toEqual({ day: dayWith({ cashIn: '120000', cardIn: '200000' }), bitFields: ['cardIn'] })
    expect(result.current.day.cardIn).toBe('200000')
    expect(result.current.cash).toEqual(counted())
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-1609.3: 다른 날로 옮겼다 돌아오면 저장 안 된 시재가 그대로이고, 옮겨 간 날은 그날 시재다', async () => {
    const { result, rerender } = await ready()
    act(() => {
      result.current.setCash(counted())
    })
    worklogAutosave().changeCash(DAY, counted())

    load.mockResolvedValueOnce(withCash(counted({ count50000: 1, floatWon: 250000 })))
    rerender({ ymd: OTHER })
    await settle()
    expect(result.current.cash).toEqual(counted({ count50000: 1, floatWon: 250000 }))

    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)
    rerender({ ymd: DAY })
    expect(result.current.cash).toEqual(counted())
    await act(async () => reply.resolve(null))
    expect(result.current.cash).toEqual(counted())
  })

  it('AC-1609.3: 앱 안 이동 뒤 다시 열면 자동 저장에 남은 시재를 읽기 전에 먼저 보이고, 읽은 뒤에도 그대로다', async () => {
    const autosave = worklogAutosave()
    autosave.serverDay(DAY, null, null, [], 11, emptyWorklogCash())
    autosave.changeCash(DAY, counted())
    const reply = deferred<WorklogSavedDay | null>()
    load.mockReturnValueOnce(reply.promise)

    const { result } = setup()
    expect(result.current.status).toBe('loading')
    expect(result.current.cash).toEqual(counted())

    await act(async () => reply.resolve(null))
    expect(result.current.status).toBe('ready')
    expect(result.current.cash).toEqual(counted())
  })

  it('AC-1609.3: 다시 읽기가 다른 PC가 바꾼 시재를 serverDay 여섯째 인자로 넘겨 반영하고, 저장 안 된 시재 칸은 그대로이며 저장을 부르지 않는다', async () => {
    load.mockResolvedValueOnce(withCash(counted()))
    const { result } = setup()
    await settle()
    act(() => {
      result.current.setCash(counted({ count1000: 3 }))
    })
    worklogAutosave().changeCash(DAY, counted({ count1000: 3 }))
    const serverDay = vi.spyOn(worklogAutosave(), 'serverDay')
    load.mockResolvedValueOnce(withCash(counted({ count10000: 13 })))

    act(() => result.current.refresh())
    await settle()

    expect(serverDay).toHaveBeenCalledWith(DAY, dayWith(), null, [], 11, counted({ count10000: 13 }))
    expect(result.current.cash).toEqual(counted({ count10000: 13, count1000: 3 }))
    expect(save).not.toHaveBeenCalled()
    serverDay.mockRestore()
  })

  it('AC-1609.7: clear(로그아웃)하면 시재도 지워져 빈 시재다', async () => {
    load.mockResolvedValueOnce(withCash(counted({ reason: '가상 이유' })))
    const { result } = setup()
    await settle()
    expect(result.current.cash).toEqual(counted({ reason: '가상 이유' }))
    worklogAutosave().dispose()

    act(() => result.current.clear())

    expect(result.current.cash).toEqual(emptyWorklogCash())
  })
})
