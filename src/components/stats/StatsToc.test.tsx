// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as tocModule from './StatsToc'
import { StatsToc, TOC_LINKS, activeTocIndex } from './StatsToc'

// 바로가기 띠 (first90 REQ-4411 AC-4411.2, design.md 5-0 '바로가기 띠', 시안 docs/mockups/first90/redesign.html .s-nav).
// 지금 칸 고르기·누름·모션 줄이기는 stats-pc-ux REQ-4002 그대로다.
// jsdom은 배치를 계산하지 않는다 → 카드 위끝·띠 자리는 getBoundingClientRect를 가짜로 바꿔 주고, scrollIntoView·matchMedia도 가짜를 넣는다

// 카드 여덟(AC-4411.1 차례: 요약 → 환자 → 매출 → 예약·전환(sunap-ilji AC-4906.1) → 예약(clinic-calendar AC-5907.3) → 처방 → 진료 운영 → 보고)
const NAMES = ['요약', '환자', '매출', '예약·전환', '예약', '처방', '진료 운영', '보고']
const IDS = ['stats-summary', 'stats-patients', 'stats-revenue', 'stats-sunap', 'stats-calendar', 'stats-rx', 'stats-ops', 'stats-report']
const NAV_NAME = '통계 바로가기'

const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const rect = (top: number, height = 40) => ({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

// 띠 + 카드 자리(빈 section)를 그린다. 카드 자리는 tops로 바꾼다. revenue false = 매출 카드가 없는 화면
function draw(revenue?: boolean) {
  const ids = revenue === false ? IDS.filter((id) => id !== 'stats-revenue') : IDS
  const view = render(
    <div>
      {revenue === undefined ? <StatsToc /> : <StatsToc revenue={revenue} />}
      {ids.map((id) => (
        <section key={id} id={id} />
      ))}
    </div>,
  )
  const nav = screen.getByRole('navigation', { name: NAV_NAME })
  const links = within(nav).getAllByRole('link')
  const sections = ids.map((id) => document.getElementById(id)!)
  return { ...view, nav, links, sections }
}

function placeSections(sections: HTMLElement[], tops: readonly number[]) {
  sections.forEach((section, i) => vi.spyOn(section, 'getBoundingClientRect').mockReturnValue(rect(tops[i]!)))
}

const currentNames = (links: HTMLElement[]) => links.filter((a) => a.getAttribute('aria-current') === 'true').map((a) => a.textContent)

// 내려간 자리(쪽 맨 아래인지)를 바꾼다. 끝나면 원래대로
const restores: Array<() => void> = []
function setScroll({ y, height }: { y: number; height: number }) {
  const root = document.documentElement
  const yBefore = Object.getOwnPropertyDescriptor(window, 'scrollY')
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
  Object.defineProperty(root, 'scrollHeight', { configurable: true, value: height })
  restores.push(() => {
    if (yBefore) Object.defineProperty(window, 'scrollY', yBefore)
    else delete (window as { scrollY?: number }).scrollY
    delete (root as { scrollHeight?: number }).scrollHeight
  })
}

let scrollIntoView: ReturnType<typeof vi.fn>
beforeEach(() => {
  scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView']
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  while (restores.length > 0) restores.pop()!()
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  delete (window as { matchMedia?: unknown }).matchMedia
  window.location.hash = ''
})

describe('AC-4002.5: 지금 칸 고르기 activeTocIndex', () => {
  it('AC-4002.5: 위끝이 기준선 이하인 칸 가운데 마지막이다(기준선과 같은 위끝도 든다)', () => {
    expect(activeTocIndex([-900, -500, -100, 120, 600, 900, 1300, 1700, 2100], 194, false)).toBe(3)
    expect(activeTocIndex([-900, -500, -100, 194, 600, 900, 1300, 1700, 2100], 194, false)).toBe(3)
    expect(activeTocIndex([-900, -500, -100, 195, 600, 900, 1300, 1700, 2100], 194, false)).toBe(2)
  })

  it('AC-4002.5: 위끝이 같은(2px 안) 나란한 칸은 왼쪽(앞) 칸이다', () => {
    expect(activeTocIndex([-900, 100, 100, 600, 900, 900, 1300, 1700, 2100], 194, false)).toBe(1)
    expect(activeTocIndex([-900, 100, 101.5, 600, 900, 900, 1300, 1700, 2100], 194, false)).toBe(1)
    expect(activeTocIndex([-2000, -1500, -1500, -900, 150, 150, 1300, 1700, 2100], 194, false)).toBe(4)
  })

  it('AC-4002.5: 위끝이 뚜렷이 다르면 나란한 칸으로 보지 않는다', () => {
    expect(activeTocIndex([-900, 100, 140, 600, 900, 900, 1300, 1700, 2100], 194, false)).toBe(2)
  })

  it('AC-4002.5: 쪽 맨 아래면 마지막 칸이다', () => {
    expect(activeTocIndex([-3000, -2500, -2500, -2000, -1500, -1500, -900, 300, 600], 194, true)).toBe(8)
  })

  it('AC-4002.5: 기준선 위 칸이 없으면 고른 칸이 없다(-1)', () => {
    expect(activeTocIndex([300, 700, 700, 1100, 1500, 1500, 1900, 2300, 2700], 194, false)).toBe(-1)
    expect(activeTocIndex([], 194, false)).toBe(-1)
    expect(activeTocIndex([], 194, true)).toBe(-1)
  })
})

describe('AC-4411.2: 바로가기 띠 마크업', () => {
  it('AC-4411.2·AC-4906.1·AC-5907.3: nav "통계 바로가기" 안에 링크 여덟 "요약"·"환자"·"매출"·"예약·전환"·"예약"·"처방"·"진료 운영"·"보고"가 차례로 있고 href가 카드 id다', () => {
    const { nav, links } = draw()
    expect(nav.tagName).toBe('NAV')
    expect(TOC_LINKS.map((link) => link.name)).toEqual(NAMES)
    expect(TOC_LINKS.map((link) => link.id)).toEqual(IDS)
    expect(links.map((a) => a.textContent)).toEqual(NAMES)
    expect(links.map((a) => a.getAttribute('href'))).toEqual(IDS.map((id) => `#${id}`))
  })

  it('AC-4411.2: 띠 왼쪽 기간 글이 없다 — 띠 글은 링크 이름뿐이고 tocRangeText도 없다', () => {
    const { nav } = draw()
    expect(nav.textContent).toBe(NAMES.join(''))
    expect('tocRangeText' in tocModule).toBe(false)
  })

  it('AC-4411.2·AC-4906.1·AC-5907.3: 매출 카드가 없으면(revenue false) "매출" 링크도 없고 나머지 일곱은 차례 그대로다', () => {
    const { links } = draw(false)
    expect(links.map((a) => a.textContent)).toEqual(['요약', '환자', '예약·전환', '예약', '처방', '진료 운영', '보고'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#stats-summary', '#stats-patients', '#stats-sunap', '#stats-calendar', '#stats-rx', '#stats-ops', '#stats-report'])
  })
})

describe('AC-4411.2·AC-4002.3: 붙는 자리·넘침·모양(design.md 5-5 바로가기 띠 모양, 시안 .s-nav)', () => {
  // 그림자 클래스(shadow-*·drop-shadow-*·inset-shadow-*)와 흐림·반투명 바탕
  const SHADOW = /(?:^|:)(?:inset-|drop-)?shadow(?:-|$)/
  const SEE_THROUGH = /(?:^|:)(?:backdrop-|blur(?:-|$)|opacity-|bg-[\w-]+\/\d+)/

  it('AC-4411.2·AC-4002.3: 띠는 앱 머리 바로 아래에 붙는다(sticky top-25.5, 휴대폰 max-md:top-23.5, 머리줄 z-10 아래 z-9)', () => {
    const { nav } = draw()
    for (const cls of ['sticky', 'top-25.5', 'max-md:top-23.5', 'z-9']) expect(tokens(nav), cls).toContain(cls)
  })

  it('AC-4411.2: 띠 바탕은 불투명 회색 bg-st-canvas이고 흐림·반투명이 없다. 아래 1px st-line 줄은 붙기 전후 늘 같고 그림자는 없다', () => {
    const { nav } = draw()
    expect(tokens(nav)).toEqual(expect.arrayContaining(['bg-st-canvas', 'border-b', 'border-st-line']))
    expect(tokens(nav)).not.toContain('bg-surface')
    expect(tokens(nav)).not.toContain('border-y')
    expect(tokens(nav).filter((t) => SEE_THROUGH.test(t) || SHADOW.test(t))).toEqual([])

    // 머리줄 아래에 붙어도(띠 위끝 102px) 모양이 바뀌지 않는다
    const before = tokens(nav)
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 53))
    fireEvent.scroll(window)
    expect(tokens(nav)).toEqual(before)
  })

  it('AC-4002.3: 링크 줄은 띠 안에서만 옆으로 밀리고, 링크는 넓은 화면 36px(h-9)·휴대폰 44px(max-md:h-11)이다', () => {
    const { nav, links } = draw()
    const strip = links[0]!.parentElement!
    expect(nav.contains(strip)).toBe(true)
    expect(tokens(strip)).toContain('overflow-x-auto')
    expect(tokens(strip)).toContain('min-w-0')
    for (const a of links) {
      expect(tokens(a), a.textContent!).toContain('h-9')
      expect(tokens(a), a.textContent!).toContain('max-md:h-11')
      expect(tokens(a), a.textContent!).toContain('shrink-0')
    }
  })

  it('AC-4411.2: 링크는 알약 모양(rounded-full)·14px 600(text-body font-semibold)이고 밑줄 막대(after:)가 없다. 초점 고리는 안쪽 2px accent 그대로다', () => {
    const { links } = draw()
    for (const a of links) {
      const own = tokens(a)
      expect(own, a.textContent!).toEqual(
        expect.arrayContaining(['rounded-full', 'text-body', 'font-semibold', 'focus-visible:outline-2', 'focus-visible:-outline-offset-2', 'focus-visible:outline-accent']),
      )
      expect(own.filter((t) => t.startsWith('after:') || t === 'underline'), a.textContent!).toEqual([])
      expect(own.filter((t) => SHADOW.test(t)), a.textContent!).toEqual([])
    }
  })

  it('AC-4411.2: 지금 카드 링크(aria-current="true")는 bg-st-ink 흰 글자(text-surface)이고, 다른 링크는 st-ink-2 글자에 올리면 bg-st-line이다', () => {
    const { links } = draw()
    fireEvent.click(links[3]!)
    const current = links[3]!
    expect(current.getAttribute('aria-current')).toBe('true')
    expect(tokens(current)).toEqual(expect.arrayContaining(['bg-st-ink', 'text-surface']))
    // 지금 링크는 올려도 같은 바탕이다(시안 a[aria-current]:hover)
    expect(tokens(current).filter((t) => t.startsWith('hover:'))).toEqual([])
    for (const a of links.filter((link) => link !== current)) {
      expect(tokens(a), a.textContent!).toEqual(expect.arrayContaining(['text-st-ink-2', 'hover:bg-st-line']))
      expect(tokens(a), a.textContent!).not.toContain('bg-st-ink')
    }
  })

  it('AC-4002.3: 지금 칸 링크가 링크 줄 밖이면 링크 줄만 옆으로 밀어 가운데로 오게 하고 쪽은 움직이지 않는다', () => {
    const { links } = draw()
    const strip = links[0]!.parentElement!
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 560 })
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 300 })
    Object.defineProperty(links[4]!, 'offsetLeft', { configurable: true, value: 400 })
    Object.defineProperty(links[4]!, 'offsetWidth', { configurable: true, value: 80 })
    const stripScroll = vi.fn()
    strip.scrollTo = stripScroll as unknown as HTMLElement['scrollTo']
    const pageScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    fireEvent.click(links[4]!)
    expect(stripScroll).toHaveBeenLastCalledWith({ left: 290, behavior: 'smooth' })
    expect(pageScroll).not.toHaveBeenCalled()
  })
})

describe('AC-4411.2·AC-4002.4: 링크 누름', () => {
  it('AC-4411.2·AC-4002.4: 누르면 주소는 그대로이고 그 카드로 부드럽게 옮기며 누른 링크만 aria-current="true"다', () => {
    window.location.hash = '#before'
    const pushState = vi.spyOn(window.history, 'pushState')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { links, sections } = draw()

    fireEvent.click(links[5]!)
    expect(window.location.hash).toBe('#before')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(sections[5])
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'smooth' })
    expect(currentNames(links)).toEqual(['처방'])

    fireEvent.click(links[1]!)
    expect(window.location.hash).toBe('#before')
    expect(scrollIntoView.mock.contexts[1]).toBe(sections[1])
    expect(currentNames(links)).toEqual(['환자'])
    for (const a of links.filter((link) => link !== links[1])) expect(a.hasAttribute('aria-current'), a.textContent!).toBe(false)
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('AC-4411.2: 매출 카드가 없을 때도 누른 링크의 카드로 간다(처방 → stats-rx)', () => {
    const { links, sections } = draw(false)
    fireEvent.click(links[4]!)
    expect(scrollIntoView.mock.contexts[0]).toBe(sections[4])
    expect(sections[4]!.id).toBe('stats-rx')
    expect(currentNames(links)).toEqual(['처방'])
  })

  it('AC-4411.2·AC-4002.4: 모션 줄이기를 켠 기기는 부드럽게 움직이지 않고 바로 간다(behavior auto)', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }))
    window.matchMedia = matchMedia as unknown as typeof window.matchMedia
    const { links } = draw()

    fireEvent.click(links[7]!)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' })
    expect(currentNames(links)).toEqual(['보고'])
  })

  it('AC-4002.4: scrollIntoView·matchMedia가 없는 브라우저에서도 던지지 않고 누른 링크를 강조한다', () => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    delete (window as { matchMedia?: unknown }).matchMedia
    const { links } = draw()
    expect(() => fireEvent.click(links[6]!)).not.toThrow()
    expect(currentNames(links)).toEqual(['진료 운영'])
  })

  it('AC-4002.4: 대상 카드가 아직 없어도 던지지 않는다', () => {
    render(<StatsToc />)
    const links = within(screen.getByRole('navigation', { name: NAV_NAME })).getAllByRole('link')
    expect(() => fireEvent.click(links[0]!)).not.toThrow()
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(currentNames(links)).toEqual(['요약'])
  })

  it('AC-4002.4: 주소(location·history)와 브라우저 저장소를 쓰지 않는다', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { links, sections } = draw()
    placeSections(sections, [-900, -500, 120, 400, 500, 600, 1300, 2100])
    fireEvent.scroll(window)
    fireEvent.click(links[3]!)
    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)

    const text = readFileSync(join(process.cwd(), 'src/components/stats/StatsToc.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
    for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'history.', 'location.', 'useSearchParams', 'useRouter', 'fetch(']) {
      expect(text, word).not.toContain(word)
    }
  })
})

describe('AC-4411.2·AC-4002.5: 내릴 때 지금 카드 따라가기', () => {
  it('AC-4411.2·AC-4002.5: 내리면 띠 아래끝 + 48px 기준선 위 마지막 카드가 강조된다', () => {
    const { nav, links, sections } = draw()
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44)) // 기준선 = 146 + 48 = 194

    placeSections(sections, [-900, -500, -350, -200, -50, 120, 600, 1300])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['처방'])

    placeSections(sections, [-900, 100, 350, 500, 550, 600, 900, 1300])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['환자'])

    placeSections(sections, [-900, -500, 150, 400, 500, 600, 900, 1300])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['매출'])

    placeSections(sections, [-900, -500, -200, 150, 400, 600, 900, 1300])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['예약·전환'])

    placeSections(sections, [-3000, -2500, -2000, -1700, -1600, -1500, 150, 900])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['진료 운영'])

    placeSections(sections, [300, 700, 900, 1000, 1050, 1100, 1500, 1900])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual([])
  })

  it('AC-4411.2: 매출 카드가 없으면 나머지 일곱 카드로 따라간다', () => {
    const { nav, links, sections } = draw(false)
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44))
    placeSections(sections, [-900, -500, -200, -50, 120, 600, 1300])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['처방'])
  })

  it('AC-4002.5: 쪽 맨 아래까지 내리면 마지막 카드(보고)다', () => {
    const { nav, links, sections } = draw()
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44))
    placeSections(sections, [-3000, -2500, -2000, -1700, -1600, -1500, -900, 300])
    setScroll({ y: 5000 - window.innerHeight, height: 5000 })
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['보고'])

    setScroll({ y: 1000, height: 5000 })
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['진료 운영'])
  })

  it('AC-4002.5: 크기가 바뀌어도 다시 고른다', () => {
    const { nav, links, sections } = draw()
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44))
    placeSections(sections, [-900, -500, -350, -200, -50, 120, 600, 1300])
    fireEvent(window, new Event('resize'))
    expect(currentNames(links)).toEqual(['처방'])
  })

  it('AC-4002.4·AC-4002.5: 누른 뒤 스크롤이 끝날 때(scrollend)까지는 누른 링크가 그대로이고, 끝나면 다시 따라간다', () => {
    const { nav, links, sections } = draw()
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44))
    placeSections(sections, [-900, 150, 400, 500, 550, 600, 900, 1300])

    fireEvent.click(links[2]!)
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['매출'])

    fireEvent(window, new Event('scrollend'))
    expect(currentNames(links)).toEqual(['매출']) // 끝났다고 바로 바꾸지 않는다: 누른 쪽이 남는다
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['환자'])
  })

  it('AC-4002.4·AC-4002.5: scrollend가 오지 않으면 1.5초 뒤 다시 따라간다', () => {
    vi.useFakeTimers()
    const { nav, links, sections } = draw()
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44))
    placeSections(sections, [-900, 150, 400, 500, 550, 600, 900, 1300])

    fireEvent.click(links[2]!)
    vi.advanceTimersByTime(1400)
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['매출'])

    vi.advanceTimersByTime(100)
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['환자'])
  })
})
