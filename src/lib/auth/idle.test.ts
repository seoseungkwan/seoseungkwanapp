import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startIdleLogout } from './idle'

const MIN = 60 * 1000
const TIMEOUT = 30 * MIN

// BroadcastChannel처럼: 한 채널이 보낸 것은 같은 버스의 다른 채널에만 { data }로 간다(자기에게는 안 간다)
type FakeChannel = {
  postMessage: (m: unknown) => void
  onmessage: ((e: unknown) => void) | null
  close: () => void
  closed: boolean
}
function channelBus() {
  const all: FakeChannel[] = []
  return function open(): FakeChannel {
    const ch: FakeChannel = {
      onmessage: null,
      closed: false,
      postMessage: vi.fn((m: unknown) => {
        for (const other of all) if (other !== ch && !other.closed) other.onmessage?.({ data: m })
      }),
      close: vi.fn(() => {
        ch.closed = true
      }),
    }
    all.push(ch)
    return ch
  }
}

// 화면 시험이 아니다 → 창·문서는 이벤트만 오가는 가짜로
function fakeTab() {
  return { target: new EventTarget(), doc: new EventTarget() as unknown as Document }
}

function fire(t: EventTarget, type: string) {
  t.dispatchEvent(new Event(type))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startIdleLogout', () => {
  it('AC-010.1: 30분 동안 움직임이 없으면 onIdle을 부른다(30분이 차기 전에는 부르지 않는다)', () => {
    const onIdle = vi.fn()
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle, ...fakeTab() })
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('AC-010.1: onIdle은 한 번만 — 그 뒤 움직이거나 시간이 더 지나도 다시 부르지 않는다', () => {
    const onIdle = vi.fn()
    const tab = fakeTab()
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle, ...tab })
    vi.advanceTimersByTime(TIMEOUT)
    fire(tab.target, 'keydown')
    fire(tab.doc, 'visibilitychange')
    vi.advanceTimersByTime(3 * TIMEOUT)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('AC-010.1: 잠자기 등으로 타이머가 밀려 30분이 넘게 지난 뒤 첫 움직임(화면 다시 보임)은 다시 세지 않고 onIdle을 부른다', () => {
    const onIdle = vi.fn()
    const tab = fakeTab()
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle, ...tab })
    vi.setSystemTime(Date.now() + TIMEOUT + MIN) // 시계만 가고 타이머는 아직 안 돌았다
    expect(onIdle).not.toHaveBeenCalled()
    fire(tab.doc, 'visibilitychange')
    expect(onIdle).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3 * TIMEOUT)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['누름', 'target', 'pointerdown'],
    ['키', 'target', 'keydown'],
    ['스크롤', 'target', 'scroll'],
    ['화면 보이기 바뀜', 'doc', 'visibilitychange'],
  ] as const)('AC-010.1 · AC-010.2: %s(%s %s)이 있으면 그때부터 다시 30분을 센다', (_label, where, type) => {
    const onIdle = vi.fn()
    const tab = fakeTab()
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle, ...tab })
    vi.advanceTimersByTime(20 * MIN)
    fire(tab[where], type)
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('AC-010.2: 20분마다 움직이면 2시간이 지나도 로그아웃하지 않고, 그 뒤 30분 멈추면 한 번 로그아웃한다', () => {
    const open = channelBus()
    const tab = { ...fakeTab(), channel: open() }
    const otherTab = open()
    const onIdle = vi.fn()
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle, ...tab })
    const acts = [
      () => fire(tab.target, 'pointerdown'),
      () => fire(tab.target, 'keydown'),
      () => otherTab.postMessage('activity'), // 다른 탭에서 움직였다
      () => fire(tab.target, 'scroll'),
      () => fire(tab.doc, 'visibilitychange'),
      () => otherTab.postMessage('activity'),
    ]
    const start = Date.now()
    for (const act of acts) {
      vi.advanceTimersByTime(20 * MIN) // fake timers가 Date도 함께 옮긴다
      act()
    }
    expect(Date.now() - start).toBe(120 * MIN) // 시작에서 30분이 넘게 지난 뒤에도 움직임을 셌다
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('AC-010.1: 목록에 없는 이벤트(마우스 움직임 등)는 시간을 다시 세지 않는다', () => {
    const onIdle = vi.fn()
    const tab = fakeTab()
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle, ...tab })
    vi.advanceTimersByTime(20 * MIN)
    fire(tab.target, 'mousemove')
    fire(tab.target, 'focus')
    vi.advanceTimersByTime(10 * MIN)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('AC-010.2: 이 탭에서 움직이면 채널로 알리고, 같은 브라우저의 다른 탭은 그 소식으로 다시 센다', () => {
    const open = channelBus()
    const tabA = { ...fakeTab(), channel: open() }
    const tabB = { ...fakeTab(), channel: open() }
    const idleA = vi.fn()
    const idleB = vi.fn()
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle: idleA, ...tabA })
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle: idleB, ...tabB })

    vi.advanceTimersByTime(20 * MIN)
    fire(tabA.target, 'keydown') // A에서만 움직였다
    expect(tabA.channel.postMessage).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(idleA).not.toHaveBeenCalled()
    expect(idleB).not.toHaveBeenCalled() // B도 A의 움직임부터 다시 셌다
    vi.advanceTimersByTime(1)
    expect(idleA).toHaveBeenCalledTimes(1)
    expect(idleB).toHaveBeenCalledTimes(1)
  })

  it('AC-010.2: 다른 탭에서 받은 소식은 다시 보내지 않는다(탭끼리 메아리 없음)', () => {
    const open = channelBus()
    const tabA = { ...fakeTab(), channel: open() }
    const tabB = { ...fakeTab(), channel: open() }
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle: vi.fn(), ...tabA })
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle: vi.fn(), ...tabB })
    fire(tabA.target, 'pointerdown')
    expect(tabA.channel.postMessage).toHaveBeenCalledTimes(1)
    expect(tabB.channel.postMessage).not.toHaveBeenCalled()
  })

  it('AC-010.2: 채널을 주지 않아도 이 탭의 움직임만으로 같은 규칙으로 동작한다', () => {
    const onIdle = vi.fn()
    const tab = fakeTab()
    startIdleLogout({ timeoutMs: TIMEOUT, onIdle, ...tab, channel: undefined })
    vi.advanceTimersByTime(29 * MIN)
    fire(tab.target, 'scroll')
    vi.advanceTimersByTime(29 * MIN)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(MIN)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('AC-010.3: 정리하면 시간이 지나도·움직여도·소식이 와도 onIdle을 부르지 않고, 타이머가 남지 않고, 채널을 닫는다', () => {
    const open = channelBus()
    const tab = { ...fakeTab(), channel: open() }
    const otherTab = open()
    const onIdle = vi.fn()
    const stop = startIdleLogout({ timeoutMs: TIMEOUT, onIdle, ...tab })
    vi.advanceTimersByTime(10 * MIN)
    stop()
    expect(vi.getTimerCount()).toBe(0)
    expect(tab.channel.close).toHaveBeenCalledTimes(1)
    expect(tab.channel.onmessage).toBeNull()

    fire(tab.target, 'keydown')
    fire(tab.doc, 'visibilitychange')
    otherTab.postMessage('activity')
    expect(tab.channel.postMessage).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5 * TIMEOUT)
    expect(onIdle).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-010.3: 정리하면 붙였던 이벤트를 모두 같은 모양(종류·함수·capture)으로 뗀다', () => {
    const tab = fakeTab()
    const spies = [tab.target, tab.doc].map((t) => ({
      add: vi.spyOn(t, 'addEventListener'),
      remove: vi.spyOn(t, 'removeEventListener'),
    }))
    const stop = startIdleLogout({ timeoutMs: TIMEOUT, onIdle: vi.fn(), ...tab })
    const capture = (o: unknown) => (typeof o === 'boolean' ? o : Boolean((o as { capture?: boolean } | undefined)?.capture))
    for (const s of spies) expect(s.remove).not.toHaveBeenCalled()
    expect(spies[0].add.mock.calls.map((c) => c[0]).sort()).toEqual(['keydown', 'pointerdown', 'scroll'])
    expect(spies[1].add.mock.calls.map((c) => c[0])).toEqual(['visibilitychange'])

    stop()
    for (const s of spies) {
      expect(s.remove).toHaveBeenCalledTimes(s.add.mock.calls.length)
      for (const [type, fn, opts] of s.add.mock.calls) {
        expect(s.remove.mock.calls.some(([t, f, o]) => t === type && f === fn && capture(o) === capture(opts))).toBe(true)
      }
    }
  })

  it('AC-010.3: onIdle 뒤에도 타이머·이벤트·채널이 풀리고, 그 뒤 정리를 또 불러도 안전하다', () => {
    const open = channelBus()
    const tab = { ...fakeTab(), channel: open() }
    const onIdle = vi.fn()
    const stop = startIdleLogout({ timeoutMs: TIMEOUT, onIdle, ...tab })
    vi.advanceTimersByTime(TIMEOUT)
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    fire(tab.target, 'keydown')
    expect(tab.channel.postMessage).not.toHaveBeenCalled()
    expect(() => {
      stop()
      stop()
    }).not.toThrow()
    expect(tab.channel.close).toHaveBeenCalledTimes(1)
  })
})
