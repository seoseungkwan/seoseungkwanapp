// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdleLogout } from './IdleLogout'

const MIN = 60 * 1000
const TIMEOUT = 30 * MIN

// 로그아웃은 signOutAndLeave() 한 곳이 한다(AC-403.4). signOut 기다림·오류·던짐·5초·쿠키 지우기·/login 이동은
// leave.test.ts(AC-403.1·403.2·403.5)가 본다 → 여기서는 IdleLogout이 그것을 부르는지만 본다
const { signOutAndLeave, isLeaving } = vi.hoisted(() => ({ signOutAndLeave: vi.fn(), isLeaving: vi.fn() }))
vi.mock('@/lib/auth/leave', () => ({
  signOutAndLeave,
  isLeaving,
  SIGNOUT_CHANNEL: 'auth-signout',
  SIGNOUT_MESSAGE: 'signout',
}))

// 실제 Supabase에 붙지 않는다. IdleLogout이 signOut을 직접 부르지 않는지 본다
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }))

// jsdom의 location.assign은 바꿔 끼울 수 없다 → location을 통째로 가짜로
const assign = vi.fn()
const replace = vi.fn()
function openedOver(protocol: 'http:' | 'https:') {
  const origin = `${protocol}//localhost:3000`
  vi.stubGlobal('location', { protocol, origin, href: `${origin}/dashboard`, assign, replace })
}

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

// IdleLogout은 idle-logout('움직였다')·auth-signout(다른 탭 로그아웃) 두 채널을 연다 → 순서가 아니라 이름으로 찾는다
function onlyChannel(name: string) {
  const found = channels.filter((c) => c.name === name)
  expect(found).toHaveLength(1)
  return found[0]
}

// jsdom 문서에 실제로 남은 움직임 쿠키 값(없으면 undefined)
const activeCookie = () =>
  document.cookie
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === 'app-active')?.[1]
const clearActiveCookie = () => {
  document.cookie = 'app-active=; Max-Age=0; Path=/'
}

// document.cookie에 쓰는 글자를 엿본다(쓰기는 그대로 jsdom에 넘긴다)
function spyCookieWrites() {
  const writes: string[] = []
  const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!
  vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(function (this: Document, value: string) {
    writes.push(value)
    original.set!.call(this, value)
  })
  return writes
}

beforeEach(() => {
  vi.useFakeTimers()
  channels = []
  signOutAndLeave.mockReset()
  signOutAndLeave.mockResolvedValue(undefined)
  isLeaving.mockReset()
  isLeaving.mockReturnValue(false)
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  assign.mockReset()
  replace.mockReset()
  openedOver('http:')
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  clearActiveCookie() // jsdom 문서는 시험끼리 이어진다
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('IdleLogout', () => {
  it('AC-010.1: 30분 동안 움직임이 없으면 signOutAndLeave()로 signOut()을 한 번 부르고, 끝나기를 기다린 뒤 /login을 새로 연다', async () => {
    let finish: () => void = () => {}
    signOutAndLeave.mockReturnValue(new Promise<void>((resolve) => (finish = resolve))) // 기다리는 일은 signOutAndLeave가 한다
    const { container } = render(<IdleLogout />)
    expect(container.innerHTML).toBe('') // 화면에는 아무것도 그리지 않는다

    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(signOutAndLeave).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
    expect(signOutAndLeave).toHaveBeenCalledWith()

    finish()
    await vi.waitFor(() => expect(signOutAndLeave).toHaveBeenCalledWith())
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it('AC-010.1: signOutAndLeave()로 signOut()이 던져도 /login으로 간다', async () => {
    render(<IdleLogout />)
    vi.advanceTimersByTime(TIMEOUT)
    await vi.waitFor(() => expect(signOutAndLeave).toHaveBeenCalledWith())
    expect(document.body.textContent).toBe('') // 오류 내용을 그리지 않는다
  })

  it('AC-010.1: 로그아웃이 시작된 뒤 더 움직이거나 시간이 지나도 signOutAndLeave()로 signOut()은 한 번만', async () => {
    render(<IdleLogout />)
    vi.advanceTimersByTime(TIMEOUT)
    window.dispatchEvent(new Event('keydown'))
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(3 * TIMEOUT)
    await vi.waitFor(() => expect(signOutAndLeave).toHaveBeenCalledWith())
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
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
    expect(signOutAndLeave).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
  })

  it('AC-010.2: 이 탭의 움직임을 BroadcastChannel로 알리고, 같은 브라우저 다른 탭의 소식을 받으면 다시 센다', () => {
    render(<IdleLogout />)
    const mine = onlyChannel('idle-logout')
    window.dispatchEvent(new Event('keydown'))
    expect(mine.posted).toHaveLength(1)

    const otherTab = new FakeBroadcastChannel(mine.name) // 같은 이름 = 같은 브라우저의 다른 탭
    vi.advanceTimersByTime(29 * MIN)
    otherTab.postMessage(mine.posted[0]) // 다른 탭도 같은 IdleLogout이 같은 소식을 보낸다
    expect(mine.posted).toHaveLength(1) // 받은 소식은 다시 보내지 않는다
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(signOutAndLeave).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
  })

  it('AC-010.2: 브라우저 저장소(localStorage·sessionStorage)를 쓰지 않는다', async () => {
    const touched = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map((m) => vi.spyOn(Storage.prototype, m))
    render(<IdleLogout />)
    window.dispatchEvent(new Event('pointerdown'))
    document.dispatchEvent(new Event('visibilitychange'))
    const mine = onlyChannel('idle-logout')
    new FakeBroadcastChannel(mine.name).postMessage(mine.posted[0])
    vi.advanceTimersByTime(TIMEOUT)
    await vi.waitFor(() => expect(signOutAndLeave).toHaveBeenCalledWith())
    for (const spy of touched) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-010.2: BroadcastChannel이 없는 브라우저에서도 이 탭의 움직임만으로 30분 뒤 로그아웃한다', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    render(<IdleLogout />)
    vi.advanceTimersByTime(20 * MIN)
    window.dispatchEvent(new Event('keydown'))
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(signOutAndLeave).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(signOutAndLeave).toHaveBeenCalledWith())
  })

  it('AC-010.3: 화면을 떠나면(unmount) 타이머·이벤트·채널이 풀려 시간이 지나도 로그아웃하지 않는다', () => {
    const { unmount } = render(<IdleLogout />)
    const mine = onlyChannel('idle-logout')
    vi.advanceTimersByTime(10 * MIN)
    unmount()
    expect(mine.closed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)

    window.dispatchEvent(new Event('keydown'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(mine.posted).toHaveLength(0)
    vi.advanceTimersByTime(5 * TIMEOUT)
    expect(signOutAndLeave).not.toHaveBeenCalled()
  })

  it('AC-401.8: 이 탭에서 움직이면 document.cookie에 움직임 쿠키 app-active=1을 쓴다', () => {
    render(<IdleLogout />)
    expect(activeCookie()).toBeUndefined() // 그리기만 해서는 쓰지 않는다
    window.dispatchEvent(new Event('keydown'))
    expect(activeCookie()).toBe('1')
  })

  it('AC-401.8: 60초 안의 두 번째 움직임은 다시 쓰지 않는다(쿠키를 지워 두고 확인)', () => {
    render(<IdleLogout />)
    window.dispatchEvent(new Event('keydown'))
    expect(activeCookie()).toBe('1')
    clearActiveCookie()
    vi.advanceTimersByTime(60_000 - 1)
    window.dispatchEvent(new Event('pointerdown'))
    expect(activeCookie()).toBeUndefined()
  })

  it('AC-401.8: 마지막으로 쓴 뒤 60초가 지난 움직임은 다시 쓴다', () => {
    render(<IdleLogout />)
    window.dispatchEvent(new Event('keydown'))
    clearActiveCookie()
    vi.advanceTimersByTime(60_000)
    window.dispatchEvent(new Event('pointerdown'))
    expect(activeCookie()).toBe('1')
  })

  it('AC-401.8: 다른 탭의 움직임 소식으로는 쓰지 않는다(그 탭이 쓴다)', () => {
    render(<IdleLogout />)
    const mine = onlyChannel('idle-logout')
    new FakeBroadcastChannel(mine.name).postMessage('activity')
    expect(activeCookie()).toBeUndefined()
  })

  it.each([
    ['https:', true],
    ['http:', false],
  ] as const)('AC-405.2: %s로 연 페이지면 IdleLogout이 쓰는 움직임 쿠키 글자에 Secure가 붙는다: %s', (protocol, secure) => {
    openedOver(protocol)
    const writes = spyCookieWrites()
    render(<IdleLogout />)
    window.dispatchEvent(new Event('keydown'))
    expect(writes).toEqual([`app-active=1; Max-Age=1860; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`])
  })

  it('AC-403.4: 30분 동안 움직임이 없으면 [로그아웃] 단추와 같은 signOutAndLeave()(lib/auth/leave)를 한 번 부른다', () => {
    render(<IdleLogout />)
    vi.advanceTimersByTime(TIMEOUT - 1)
    expect(signOutAndLeave).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
    expect(signOutAndLeave).toHaveBeenCalledWith()
    expect(signOut).not.toHaveBeenCalled() // Supabase를 직접 부르는 따로 된 길이 없다
  })

  it('AC-403.3: 다른 탭의 auth-signout 채널 signout 소식을 받으면 signOut을 다시 부르지 않고 /login을 새로 연다', () => {
    render(<IdleLogout />)
    onlyChannel('auth-signout') // 이 탭이 듣는 채널
    new FakeBroadcastChannel('auth-signout').postMessage('signout') // 다른 탭의 signOutAndLeave()가 보낸다
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('/login')
    expect(replace).not.toHaveBeenCalled()
    expect(signOutAndLeave).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })

  it.each([['activity'], ['SIGNOUT'], ['signout '], ['logout'], [{ type: 'signout' }], [null]])(
    'AC-403.3: auth-signout 채널의 다른 글자(%j)는 무시한다',
    (message) => {
      render(<IdleLogout />)
      new FakeBroadcastChannel('auth-signout').postMessage(message)
      expect(assign).not.toHaveBeenCalled()
      expect(signOutAndLeave).not.toHaveBeenCalled()
    },
  )

  it('AC-403.3: 이 탭이 이미 signOutAndLeave()로 나가는 중이면(isLeaving() 참) signout 소식을 무시한다', () => {
    render(<IdleLogout />)
    isLeaving.mockReturnValue(true) // 소식을 받을 때 본다(이 탭이 signOut을 기다리는 동안에는 다른 탭의 signout 소식을 무시한다)
    new FakeBroadcastChannel('auth-signout').postMessage('signout')
    expect(isLeaving).toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
    expect(signOutAndLeave).not.toHaveBeenCalled()
  })

  it('AC-403.3: 화면을 떠나면(unmount) idle-logout·auth-signout 두 채널을 닫고, 그 뒤 signout 소식에도 /login으로 가지 않는다', () => {
    const { unmount } = render(<IdleLogout />)
    const activity = onlyChannel('idle-logout')
    const signout = onlyChannel('auth-signout')
    unmount()
    expect(activity.closed).toBe(true)
    expect(signout.closed).toBe(true)

    new FakeBroadcastChannel('auth-signout').postMessage('signout')
    expect(assign).not.toHaveBeenCalled()
  })
})
