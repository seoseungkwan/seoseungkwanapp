// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { StickyConnect } from './StickyConnect'

// 휴대폰 아래 단추 (tab-frame REQ-306 AC-306.4, design.md '대시보드 짜임' 휴대폰 아래 단추, 메모 §3·§7).
// 위의 [비트 PC 연결 시작](id로 찾는다)이 화면 밖이면 아래에서 올라와 보이고(200ms), 다시 보이면 숨는다.
// jsdom에는 IntersectionObserver가 없다 → 가짜를 넣어 화면 안/밖을 알린다. 모양은 정해 둔 클래스로 본다

const TARGET = 'dashboard-connect-start'
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(classesOf(el), t).not.toContain(t)
}
const iconInner = (name: 'arrow') => renderToStaticMarkup(<Icon name={name} />).replace(/^<svg\b[^>]*>|<\/svg>$/g, '')

// 가짜 IntersectionObserver: 만든 것·지켜보는 요소·끊기를 기록하고, 시험이 화면 안/밖을 알린다
type Callback = (entries: Array<Partial<IntersectionObserverEntry>>, observer: unknown) => void
const made: FakeObserver[] = []
class FakeObserver {
  observed: Element[] = []
  disconnect = vi.fn()
  unobserve = vi.fn()
  takeRecords = () => []
  constructor(public callback: Callback) {
    made.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  tell(isIntersecting: boolean) {
    act(() => this.callback([{ isIntersecting, target: this.observed[0] }], this))
  }
}

// 페이지처럼 위 주 단추(id)와 아래 단추를 함께 그린다
const renderWithTarget = () =>
  render(
    <>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 시험에서 위 단추 자리만 흉내 낸다. 모든 주소를 받는 (app)/[...rest] 때문에 규칙이 모든 주소를 페이지로 본다 */}
      <a id={TARGET} href="/claim/setup">
        위 단추
      </a>
      <StickyConnect targetId={TARGET} />
    </>,
  )
const dockOf = (container: HTMLElement) => {
  const dock = container.querySelector('.sticky')
  expect(dock).not.toBeNull()
  return dock as HTMLElement
}
const linkOf = (dock: Element) => {
  const links = dock.querySelectorAll('a')
  expect(links).toHaveLength(1)
  return links[0]
}
const expectHidden = (dock: HTMLElement) => {
  expect(dock.getAttribute('aria-hidden')).toBe('true')
  hasAll(dock, 'invisible translate-y-full')
  hasNone(dock, 'visible translate-y-0')
  expect(linkOf(dock).getAttribute('tabindex')).toBe('-1')
}
const expectShown = (dock: HTMLElement) => {
  expect(dock.hasAttribute('aria-hidden')).toBe(false)
  hasAll(dock, 'visible translate-y-0')
  hasNone(dock, 'invisible translate-y-full')
  expect(linkOf(dock).hasAttribute('tabindex')).toBe(false)
}

beforeEach(() => {
  made.length = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StickyConnect: 휴대폰 아래 단추 (AC-306.4)', () => {
  it('AC-306.4: 처음 그림(서버)은 숨김 — invisible·aria-hidden="true"·링크 tabIndex -1', () => {
    const html = renderToStaticMarkup(<StickyConnect targetId={TARGET} />)
    const host = document.createElement('div')
    host.innerHTML = html
    expectHidden(dockOf(host))
  })

  it('AC-306.4: 위 주 단추를 id로 찾아 IntersectionObserver로 지켜본다', () => {
    const { container } = renderWithTarget()
    expect(made).toHaveLength(1)
    expect(made[0].observed).toEqual([document.getElementById(TARGET)])
    expectHidden(dockOf(container))
  })

  it('AC-306.4: 위 단추가 화면 밖으로 나가면 보이고, 다시 화면 안에 오면 숨는다', () => {
    const { container } = renderWithTarget()
    const dock = dockOf(container)
    made[0].tell(false)
    expectShown(dock)
    made[0].tell(true)
    expectHidden(dock)
    made[0].tell(false)
    expectShown(dock)
  })

  it('AC-306.4: IntersectionObserver가 없는 브라우저에서는 숨긴 채 둔다(오류 없음)', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = renderWithTarget()
    expectHidden(dockOf(container))
  })

  it('AC-306.4: 위 단추가 없으면 지켜보지 않고 숨긴 채 둔다', () => {
    const { container } = render(<StickyConnect targetId={TARGET} />)
    expect(made).toHaveLength(0)
    expectHidden(dockOf(container))
  })

  it('AC-306.4: 언마운트하면 지켜보기를 끊는다(disconnect)', () => {
    const { unmount } = renderWithTarget()
    const observer = made[0]
    expect(observer.disconnect).not.toHaveBeenCalled()
    unmount()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })

  it('AC-306.4: 아래에 붙는 줄 — sticky bottom-0, surface, 위 1px line, 안쪽 12·16, 768px 이상 없음(md:hidden), 올라옴 200ms', () => {
    const { container } = renderWithTarget()
    const dock = dockOf(container)
    hasAll(dock, 'sticky bottom-0 md:hidden bg-surface border-t border-line px-4 py-3 transition duration-200')
    // 본문 좌우 16px·아래 32px(앱 틀 안쪽 여백)까지 덮어 화면 끝에서 끝까지 붙는다
    hasAll(dock, '-mx-4 -mb-8')
  })

  it('AC-306.4·AC-603.1: 안의 [비트 PC 연결 시작]은 /claim/setup?next=dashboard 주 큰 단추, 전체 폭, 오른쪽 꾸밈 화살표 16', () => {
    const { container } = renderWithTarget()
    const link = linkOf(dockOf(container))
    expect(link.getAttribute('href')).toBe('/claim/setup?next=dashboard')
    expect(link.textContent).toBe('비트 PC 연결 시작')
    hasAll(link, `${ds.button.primaryLarge} w-full group transition not-disabled:active:translate-y-px`)
    const svg = link.lastElementChild as SVGElement
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.innerHTML).toBe(iconInner('arrow'))
    hasAll(svg, 'transition group-hover:translate-x-0.5')
  })
})
