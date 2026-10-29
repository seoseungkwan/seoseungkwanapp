// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdleLogout } from './IdleLogout'

const MIN = 60 * 1000
const TIMEOUT = 30 * MIN

// 실제 Supabase에 붙지 않는다. signOut을 부르는지와 그 뒤 어디로 가는지만 본다
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }))

// jsdom의 location.assign은 바꿔 끼울 수 없다 → location을 통째로 가짜로
const assign = vi.fn()
const replace = vi.fn()

// 같은 이름끼리 이어지는 가짜 BroadcastChannel(다른 탭 흉내). 보낸 것은 자기 말고 같은 이름의 다른 채널에 { data }로 간다
let channels: FakeBroadcastChannel[] = []
class FakeBroadcastChannel {
  onmessage: ((e: { data: unknown }) => void) | null = null
  closed = false
  posted: unknown[] = []
  constructor(public name: string) {
    channels.push(this)
  }
  postMessage(m: unknown) {
    this.posted.push(m)
    for (const other of channels) {
      if (other !== this && other.name === this.name && !other.closed) other.onmessage?.({ data: m })
    }
  }
  close() {
    this.closed = true
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  channels = []
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  assign.mockReset()
  replace.mockReset()
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/dashboard', assign, replace })
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('IdleLogout', () => {
  it('AC-010.1: 30분 동안 움직임이 없으면 signOut()을 한 번 부르고, 끝나기를 기다린 뒤 /login을 새로 연다', async () => {
    let finish: (value: { error: null }) => void = () => {}
    signOut.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { container } = render(<IdleLogout />)
    expect(container.innerHTML).toBe('') // 화면에는 아무것도 그리지 않는다

    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(signOut).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledWith() // 기본(전역) 로그아웃
    expect(assign).not.toHaveBeenCalled() // signOut을 기다린 뒤에 간다

    finish({ error: null })
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(assign).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it('AC-010.1: signOut()이 던져도 /login으로 간다', async () => {
    signOut.mockRejectedValue(new Error('network'))
    render(<IdleLogout />)
    vi.advanceTimersByTime(TIMEOUT)
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(document.body.textContent).not.toContain('network')
  })

  it('AC-010.1: 로그아웃이 시작된 뒤 더 움직이거나 시간이 지나도 signOut()은 한 번만', async () => {
    render(<IdleLogout />)
    vi.advanceTimersByTime(TIMEOUT)
    window.dispatchEvent(new Event('keydown'))
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(3 * TIMEOUT)
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['누름(단추 위 pointerdown)', () => document.body.appendChild(document.createElement('button')).dispatchEvent(new Event('pointerdown', { bubbles: true }))],
    ['키(keydown)', () => document.body.dispatchEvent(new Event('keydown', { bubbles: true }))],
    ['스크롤(안쪽 상자 scroll — 거품이 오르지 않는다)', () => document.body.appendChild(document.createElement('div')).dispatchEvent(new Event('scroll'))],
    ['화면 보이기 바뀜(document visibilitychange)', () => document.dispatchEvent(new Event('visibilitychange'))],
  ])('AC-010.2: %s이 있으면 그때부터 다시 30분을 센다', (_label, act) => {
    render(<IdleLogout />)
    vi.advanceTimersByTime(29 * MIN)
    act()
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(signOut).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('AC-010.2: 이 탭의 움직임을 BroadcastChannel로 알리고, 같은 브라우저 다른 탭의 소식을 받으면 다시 센다', () => {
    render(<IdleLogout />)
    expect(channels).toHaveLength(1)
    const mine = channels[0]
    window.dispatchEvent(new Event('keydown'))
    expect(mine.posted).toHaveLength(1)

    const otherTab = new FakeBroadcastChannel(mine.name) // 같은 이름 = 같은 브라우저의 다른 탭
    vi.advanceTimersByTime(29 * MIN)
    otherTab.postMessage(mine.posted[0]) // 다른 탭도 같은 IdleLogout이 같은 소식을 보낸다
    expect(mine.posted).toHaveLength(1) // 받은 소식은 다시 보내지 않는다
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(signOut).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('AC-010.2: 브라우저 저장소(localStorage·sessionStorage)를 쓰지 않는다', async () => {
    const touched = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map((m) => vi.spyOn(Storage.prototype, m))
    render(<IdleLogout />)
    window.dispatchEvent(new Event('pointerdown'))
    document.dispatchEvent(new Event('visibilitychange'))
    new FakeBroadcastChannel(channels[0].name).postMessage(channels[0].posted[0])
    vi.advanceTimersByTime(TIMEOUT)
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    for (const spy of touched) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-010.2: BroadcastChannel이 없는 브라우저에서도 이 탭의 움직임만으로 30분 뒤 로그아웃한다', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    render(<IdleLogout />)
    vi.advanceTimersByTime(20 * MIN)
    window.dispatchEvent(new Event('keydown'))
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(signOut).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(signOut).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
  })

  it('AC-010.3: 화면을 떠나면(unmount) 타이머·이벤트·채널이 풀려 시간이 지나도 로그아웃하지 않는다', () => {
    const { unmount } = render(<IdleLogout />)
    const mine = channels[0]
    vi.advanceTimersByTime(10 * MIN)
    unmount()
    expect(mine.closed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    window.dispatchEvent(new Event('keydown'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(mine.posted).toHaveLength(0)
    vi.advanceTimersByTime(5 * TIMEOUT)
    expect(signOut).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })
})
