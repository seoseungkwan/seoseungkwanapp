// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMemoDrafts } from './useMemoDrafts'

// 메모 고치기(AC-018.2): 1초 동안 더 고치지 않으면 Worker에 보낸다. 글은 Worker가 도우미에 저장한다. 브라우저 저장소는 쓰지 않는다

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const setup = () => {
  const send = vi.fn()
  const hook = renderHook(() => useMemoDrafts(send))
  return { send, ...hook }
}

describe('AC-018.2 저장 때', () => {
  it('AC-018.2: 고친 뒤 1초 동안 더 고치지 않으면 한 번 보낸다', () => {
    const { send, result } = setup()
    act(() => result.current.change('v1', '글'))
    act(() => void vi.advanceTimersByTime(999))
    expect(send).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('v1', '글')
  })

  it('AC-018.2: 계속 고치면 미루고 마지막 글만 보낸다', () => {
    const { send, result } = setup()
    act(() => result.current.change('v1', '가'))
    act(() => void vi.advanceTimersByTime(800))
    act(() => result.current.change('v1', '가나'))
    act(() => void vi.advanceTimersByTime(800))
    expect(send).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(200))
    expect(send.mock.calls).toEqual([['v1', '가나']])
  })

  it('AC-018.26: 칸 밖을 누르면 바로 보낸다. 타이머가 또 보내지 않는다', () => {
    const { send, result } = setup()
    act(() => result.current.change('v1', '글'))
    act(() => result.current.flush('v1'))
    expect(send.mock.calls).toEqual([['v1', '글']])
    act(() => void vi.advanceTimersByTime(2000))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('AC-018.2: 사람마다 따로 센다', () => {
    const { send, result } = setup()
    act(() => result.current.change('v1', '가'))
    act(() => void vi.advanceTimersByTime(500))
    act(() => result.current.change('v2', '나'))
    act(() => void vi.advanceTimersByTime(500))
    expect(send.mock.calls).toEqual([['v1', '가']])
    act(() => void vi.advanceTimersByTime(500))
    expect(send.mock.calls).toEqual([['v1', '가'], ['v2', '나']])
  })

  it('AC-018.2: 입력을 시작하기 전·다시 점검 전에는 남은 글을 모두 보낸다', () => {
    const { send, result } = setup()
    act(() => result.current.change('v1', '가'))
    act(() => result.current.change('v2', '나'))
    act(() => result.current.flushAll())
    expect(send.mock.calls).toEqual([['v1', '가'], ['v2', '나']])
  })

  it('AC-013.6: 화면을 내리면 남은 글을 보낸다(떠나도 고친 메모가 남는다)', () => {
    const { send, result, unmount } = setup()
    act(() => result.current.change('v1', '글'))
    unmount()
    expect(send.mock.calls).toEqual([['v1', '글']])
  })

  it('AC-018.2: 칸에는 고친 글이 바로 보이고, 고치지 않은 줄은 받은 글이다', () => {
    const { result } = setup()
    expect(result.current.valueOf('v1', '받은 글')).toBe('받은 글')
    act(() => result.current.change('v1', '고친 글'))
    expect(result.current.valueOf('v1', '받은 글')).toBe('고친 글')
  })

  it('AC-018.2: 보낸 뒤에도 칸 값은 그대로다(저장에 실패해도 값을 지우지 않는다. [다시 저장]은 MemoPanel 시험)', () => {
    const { send, result } = setup()
    act(() => result.current.change('v1', '고친 글'))
    act(() => void vi.advanceTimersByTime(1000))
    expect(send).toHaveBeenCalledTimes(1)
    expect(result.current.valueOf('v1', '받은 글')).toBe('고친 글')
  })

  it('AC-014.11: resetSettled는 보낸 글만 지운다: 아직 보내지 않은 글은 남아 때가 되면 보낸다', () => {
    const { send, result } = setup()
    act(() => result.current.change('sent', '보낸 글'))
    act(() => result.current.flush('sent'))
    act(() => result.current.change('waiting', '기다리는 글'))
    act(() => result.current.resetSettled())
    expect(result.current.valueOf('sent', '새 자동 메모')).toBe('새 자동 메모')
    expect(result.current.valueOf('waiting', '새 자동 메모')).toBe('기다리는 글')
    act(() => void vi.advanceTimersByTime(1000))
    expect(send.mock.calls).toEqual([['sent', '보낸 글'], ['waiting', '기다리는 글']])
  })

  it('AC-018.2: 브라우저 저장소를 쓰지 않는다', () => {
    const local = vi.fn()
    vi.stubGlobal('localStorage', { setItem: local, getItem: local })
    vi.stubGlobal('sessionStorage', { setItem: local, getItem: local })
    const { result } = setup()
    act(() => result.current.change('v1', '글'))
    act(() => void vi.advanceTimersByTime(1000))
    expect(local).not.toHaveBeenCalled()
  })
})
