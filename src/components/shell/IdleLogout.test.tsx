// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
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
  it('AC-010.1 · AC-418.3: 30분 동안 움직임이 없으면 signOut()을 한 번 부르고, 끝나기를 기다린 뒤 /login을 새로 연다(처음에는 안내 글이 없다)', async () => {
    let finish: (value: { error: null }) => void = () => {}
    signOut.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { container } = render(<IdleLogout />)
    expect(screen.queryByRole('alert')).toBeNull() // 처음에는 안내가 없다. 비어 있는 role="status" 자리만 있다(AC-418.3)
    expect(container.textContent).toBe('')

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

// ── 1분 전 안내(ui-90 REQ-418). 문구는 시안 docs/mockups/ui-90/app/gen.py idle_state 그대로
const WARN_AT = 29 * MIN
const EXTENDED_MS = 3000
const TITLE = '1분 뒤 자동으로 로그아웃돼요'
const BODY = '30분 동안 아무것도 누르지 않았어요. 환자 정보를 지키려고 곧 로그아웃해요.'
const EXTENDED = '다시 30분 동안 쓸 수 있어요.'
// 폰: 좌우·아래 12px / 768px 이상: 오른쪽 아래 24px·폭 360px
const PLACE = 'fixed left-3 right-3 bottom-3 md:left-auto md:right-6 md:bottom-6 md:w-90'
const IDLE_EVENTS = ['pointerdown', 'keydown', 'scroll', 'visibilitychange']

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => classes.split(/\s+/).every((c) => classesOf(el).includes(c))
const continueButton = () => screen.getByRole('button', { name: '계속 쓰기' })
// 진짜 누름처럼: 누름 시작(pointerdown) 뒤 click
function press(el: Element) {
  fireEvent.pointerDown(el)
  fireEvent.click(el)
}

describe('IdleLogout — 1분 전 안내', () => {
  it('AC-418.2: 29분 동안 움직임이 없으면 안내(role="alert", ds.layer)에 시계 아이콘(warning) + 제목(subtitle 600) · 안내(small ink-2) · [계속 쓰기](주, 폰 전체 폭)가 있다', () => {
    render(<IdleLogout />)
    tick(WARN_AT - 1)
    expect(screen.queryByRole('alert')).toBeNull()
    tick(1)
    const alert = screen.getByRole('alert')
    expect(hasAll(alert, `${ds.layer} p-4`)).toBe(true)
    // 앱 틀(.app-ui) 밖 형제라 자기 뿌리에 앱 초기화(app-ui)를 둔다 — 문단 기본 여백·단추 기본 글꼴이 남지 않는다
    expect(hasAll(alert, 'app-ui')).toBe(true)
    expect(alert.textContent).toBe(`${TITLE}${BODY}계속 쓰기`)

    const [title, body] = Array.from(alert.querySelectorAll('p'))
    expect(title.textContent).toBe(TITLE)
    expect(hasAll(title, 'flex items-center gap-2 text-subtitle font-semibold text-ink')).toBe(true)
    const icon = title.querySelector('svg')!
    expect(title.firstElementChild).toBe(icon)
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(hasAll(icon, 'shrink-0 text-warning')).toBe(true)
    const clock = render(<Icon name="clock" />).container.querySelector('svg')!
    expect(icon.innerHTML).toBe(clock.innerHTML)

    expect(body.textContent).toBe(BODY)
    expect(hasAll(body, 'mt-1 text-small text-ink-2')).toBe(true)

    const button = within(alert).getByRole('button', { name: '계속 쓰기' })
    expect(button.getAttribute('type')).toBe('button')
    expect(hasAll(button, `${ds.button.primary} mt-3 max-md:w-full`)).toBe(true)
  })

  it('AC-418.2: 자리 — 화면 아래에 붙는다(폰 좌우·아래 12px, 768px 이상 오른쪽 아래 24px·폭 360px), 위쪽 띠보다 위 층', () => {
    render(<IdleLogout />)
    tick(WARN_AT)
    const alert = screen.getByRole('alert')
    expect(hasAll(alert, PLACE)).toBe(true)
    expect(classesOf(alert).some((c) => /^z-\d+$/.test(c) && Number(c.slice(2)) > 10)).toBe(true) // 위쪽 띠(sticky z-10) 위
  })

  it('AC-418.2: 안내가 나타나도 초점을 옮기지 않는다', () => {
    const input = document.body.appendChild(document.createElement('input'))
    input.focus()
    render(<IdleLogout />)
    tick(WARN_AT)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(document.activeElement).toBe(input)
    expect(continueButton().hasAttribute('autofocus')).toBe(false)
    input.remove()
  })

  it('AC-418.3: [계속 쓰기]를 누르면 안내가 사라지고, 처음부터 있던 role="status" 자리에 "다시 30분 동안 쓸 수 있어요."가 3초 보였다가 사라진다', () => {
    render(<IdleLogout />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
    tick(WARN_AT)
    expect(status.textContent).toBe('')
    press(continueButton())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toBe(EXTENDED)
    expect(hasAll(status, `${ds.layer} ${PLACE} p-4 text-small text-ink-2`)).toBe(true)
    tick(EXTENDED_MS - 1)
    expect(status.textContent).toBe(EXTENDED)
    tick(1)
    expect(status.textContent).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-418.3: [계속 쓰기]를 누른 때부터 다시 센다 — 처음 30분에는 로그아웃하지 않고, 누른 뒤 29분에 다시 안내, 30분에 로그아웃', async () => {
    render(<IdleLogout />)
    tick(WARN_AT)
    press(continueButton())
    expect(channels[0].posted).toHaveLength(1) // 다른 탭도 다시 센다
    tick(WARN_AT - 1)
    expect(signOut).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    tick(1)
    expect(screen.getByRole('alert')).toBeTruthy()
    tick(MIN)
    expect(signOut).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
  })

  it.each([
    ['단추 위 Enter 키', () => fireEvent.keyDown(continueButton(), { key: 'Enter' })],
    ['click만(화면 읽기 프로그램)', () => fireEvent.click(continueButton())],
  ])('AC-418.3: [계속 쓰기]를 %s로 눌러도 안내가 닫히고 "다시 30분…" 글이 나오며 다시 센다', (_label, act_) => {
    render(<IdleLogout />)
    tick(WARN_AT)
    act_()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe(EXTENDED)
    tick(MIN)
    expect(signOut).not.toHaveBeenCalled()
  })

  it.each([
    ['안내 밖 누름', () => fireEvent.pointerDown(document.body)],
    ['키(keydown)', () => fireEvent.keyDown(document.body, { key: 'Tab' })],
    ['스크롤', () => fireEvent.scroll(window)],
    ['다른 탭 소식', () => new FakeBroadcastChannel(channels[0].name).postMessage('activity')],
  ])('AC-418.3: 안내가 보일 때 %s이 오면 안내가 사라지고 "다시 30분…" 글은 나오지 않는다', (_label, act_) => {
    render(<IdleLogout />)
    tick(WARN_AT)
    expect(screen.getByRole('alert')).toBeTruthy()
    act(() => act_())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
    tick(MIN)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('AC-418.3: 안내를 두고 30분이 되면 지금처럼 signOut 뒤 /login으로 간다', async () => {
    render(<IdleLogout />)
    tick(WARN_AT)
    expect(screen.getByRole('alert')).toBeTruthy()
    tick(MIN - 1)
    expect(signOut).not.toHaveBeenCalled()
    tick(1)
    expect(signOut).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(assign).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['안내가 보일 때', false],
    ['"다시 30분…" 글이 보일 때', true],
  ])('AC-418.4: %s 떠나면(unmount) 시계·이벤트·채널이 모두 풀린다', (_label, extended) => {
    const spies = [window, document].map((t) => ({
      add: vi.spyOn(t, 'addEventListener'),
      remove: vi.spyOn(t, 'removeEventListener'),
    }))
    const { unmount } = render(<IdleLogout />)
    const mine = channels[0]
    tick(WARN_AT)
    if (extended) {
      press(continueButton())
      expect(screen.getByRole('status').textContent).toBe(EXTENDED)
    }
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(mine.closed).toBe(true)
    const capture = (o: unknown) => (typeof o === 'boolean' ? o : Boolean((o as { capture?: boolean } | undefined)?.capture))
    for (const s of spies) {
      const added = s.add.mock.calls.filter(([type]) => IDLE_EVENTS.includes(type))
      for (const [type, fn, opts] of added) {
        expect(s.remove.mock.calls.some(([t, f, o]) => t === type && f === fn && capture(o) === capture(opts))).toBe(true)
      }
    }
    expect(spies[0].add.mock.calls.some(([type]) => type === 'pointerdown')).toBe(true)

    const before = mine.posted.length
    window.dispatchEvent(new Event('keydown'))
    expect(mine.posted).toHaveLength(before)
    vi.advanceTimersByTime(5 * TIMEOUT)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('AC-418.4: 안내 → [계속 쓰기] → 3초 → 다시 안내 → 로그아웃까지 브라우저 저장소를 쓰지 않는다', async () => {
    const touched = (['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const).map((m) => vi.spyOn(Storage.prototype, m))
    render(<IdleLogout />)
    tick(WARN_AT)
    press(continueButton())
    tick(EXTENDED_MS)
    tick(WARN_AT)
    fireEvent.keyDown(document.body, { key: 'Tab' })
    tick(TIMEOUT)
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    for (const spy of touched) expect(spy).not.toHaveBeenCalled()
  })
})
