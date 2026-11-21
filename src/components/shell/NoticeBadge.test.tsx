// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unreadCount } from '@/lib/storage/notices'
import { NoticeBadge } from './NoticeBadge'

// 탭 띠 '고시·공지' 옆 안 읽은 관련 글 수 (specs/notices REQ-7423 AC-7423.3, 기본값 10, design 10절 '탭 숫자', 시안 .badge).
// 저장소만 가짜다(실제 Supabase에 붙지 않는다). 글자(99+·화면 읽기 글)는 진짜 lib/notices/view의 badgeText·badgeLabel이 만든다
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  unreadCount: vi.fn(),
}))

const count = vi.mocked(unreadCount)

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// 그린 감싸개 안의 숫자 동그라미(aria-hidden)와 화면 읽기 글
const dot = (root: HTMLElement) => root.querySelector<HTMLElement>('[aria-hidden="true"]')
const srText = (root: HTMLElement) => root.querySelector<HTMLElement>('.sr-only')?.textContent ?? null
const mount = () => render(<span data-testid="tab">고시·공지<NoticeBadge /></span>)
const tabEl = () => screen.getByTestId('tab')

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  count.mockReset()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})

afterEach(() => {
  cleanup()
})

const changed = () => act(() => void window.dispatchEvent(new Event('notices:changed')))
const showWindow = (state: DocumentVisibilityState) =>
  act(() => {
    visibility = state
    document.dispatchEvent(new Event('visibilitychange'))
  })

describe('NoticeBadge (AC-7423.3)', () => {
  it('AC-7423.3: 열 때 unreadCount를 한 번 읽고, 3이면 파란 동그라미 "3"(aria-hidden)과 화면 읽기 "안 읽은 관련 글 3건"이 있다', async () => {
    count.mockResolvedValue(3)
    mount()
    await waitFor(() => expect(dot(tabEl())?.textContent).toBe('3'))
    expect(count).toHaveBeenCalledTimes(1)
    expect(srText(tabEl())).toBe('안 읽은 관련 글 3건')
    // 시안 .badge: 18px 높이·최소 18px 폭의 accent 바탕, 흰 글자 600, 가운데. 모서리·간격은 앱 토큰(classes.test.ts AC-204.6)으로 —
    // 모서리 rounded-control(칩·키 표시와 같다, rounded-full 아님), 좌우 4px(px-1, 간격 단계 안)
    const circle = dot(tabEl())!
    expect(circle.tagName).toBe('SPAN')
    const classes = (circle.getAttribute('class') ?? '').split(/\s+/)
    expect(classes).toEqual(expect.arrayContaining(['rounded-control', 'px-1', 'bg-accent', 'text-surface', 'font-semibold', 'h-4.5', 'min-w-4.5', 'tabular-nums']))
    expect(classes.filter((c) => c.startsWith('rounded-') && c !== 'rounded-control')).toEqual([])
    // 화면 읽기 글은 보이지 않는다(sr-only) — 보이는 숫자는 읽지 않는다(aria-hidden)
    expect(tabEl().textContent).toBe('고시·공지3안 읽은 관련 글 3건')
  })

  it.each([
    [0, '0건'],
    ['failed' as const, '실패'],
  ])('AC-7423.3: %s(%s)이면 아무것도 그리지 않는다', async (value, why) => {
    count.mockResolvedValue(value)
    mount()
    await waitFor(() => expect(count).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(tabEl().textContent, why).toBe('고시·공지')
    expect(tabEl().children).toHaveLength(0)
  })

  it('AC-7423.3: 읽는 동안에는 아무것도 그리지 않는다', () => {
    count.mockReturnValue(new Promise(() => {}))
    mount()
    expect(tabEl().textContent).toBe('고시·공지')
  })

  it.each([
    [99, '99'],
    [100, '99+'],
    [150, '99+'],
  ])('AC-7423.3·기본값 10: %i이면 동그라미는 "%s"이고 화면 읽기 글은 실제 수다', async (n, shown) => {
    count.mockResolvedValue(n)
    mount()
    await waitFor(() => expect(dot(tabEl())?.textContent).toBe(shown))
    expect(srText(tabEl())).toBe(`안 읽은 관련 글 ${n}건`)
  })

  it('AC-7423.3: 창에 notices:changed가 오면 다시 읽어 숫자를 바꾼다(0이 되면 없어진다)', async () => {
    count.mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(0)
    mount()
    await waitFor(() => expect(dot(tabEl())?.textContent).toBe('2'))
    changed()
    await waitFor(() => expect(dot(tabEl())?.textContent).toBe('1'))
    expect(srText(tabEl())).toBe('안 읽은 관련 글 1건')
    changed()
    await waitFor(() => expect(tabEl().textContent).toBe('고시·공지'))
    expect(count).toHaveBeenCalledTimes(3)
  })

  it('AC-7423.3: 다시 읽기가 실패하면 앞 숫자를 남기지 않고 없앤다', async () => {
    count.mockResolvedValueOnce(4).mockResolvedValueOnce('failed')
    mount()
    await waitFor(() => expect(dot(tabEl())?.textContent).toBe('4'))
    changed()
    await waitFor(() => expect(tabEl().textContent).toBe('고시·공지'))
  })

  it('AC-7423.3: 창이 다시 보이면(visibilitychange → visible) 다시 읽고, 숨을 때는 읽지 않는다', async () => {
    count.mockResolvedValueOnce(1).mockResolvedValueOnce(5)
    mount()
    await waitFor(() => expect(dot(tabEl())?.textContent).toBe('1'))
    showWindow('hidden')
    expect(count).toHaveBeenCalledTimes(1)
    showWindow('visible')
    await waitFor(() => expect(dot(tabEl())?.textContent).toBe('5'))
    expect(count).toHaveBeenCalledTimes(2)
  })

  it('AC-7423.3: 늦게 온 앞 읽기의 답은 버린다(마지막 읽기의 숫자만 보인다)', async () => {
    const first = deferred<number | 'failed'>()
    const second = deferred<number | 'failed'>()
    count.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    mount()
    changed()
    await act(async () => second.resolve(7))
    await waitFor(() => expect(dot(tabEl())?.textContent).toBe('7'))
    await act(async () => first.resolve(3))
    expect(dot(tabEl())?.textContent).toBe('7')
  })

  it('AC-7423.3: 지운 뒤에는 알림·창 보임을 듣지 않는다(다시 읽지 않는다)', async () => {
    count.mockResolvedValue(2)
    const view = mount()
    await waitFor(() => expect(dot(tabEl())?.textContent).toBe('2'))
    view.unmount()
    window.dispatchEvent(new Event('notices:changed'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(count).toHaveBeenCalledTimes(1)
  })
})
