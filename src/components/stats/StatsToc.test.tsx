// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pickRange } from './periodPick'
import { StatsToc, TOC_LINKS, activeTocIndex, tocRangeText } from './StatsToc'
import { statsRange } from './view'

// 목차 띠 (stats-pc-ux REQ-4002, design.md 'StatsToc.tsx', 시안 docs/mockups/stats-pc-ux/notes.md 3번).
// jsdom은 배치를 계산하지 않는다 → 칸 위끝·띠 자리는 getBoundingClientRect를 가짜로 바꿔 주고, scrollIntoView·matchMedia도 가짜를 넣는다

const TODAY = '2026-11-14'
const YESTERDAY = '2026-11-13'
const RANGE = statsRange(TODAY, '30d')
// 열 칸(stats-revenue AC-4109.1: `매출`은 재방문율 다음 · 처방 앞)
const NAMES = ['기간 요약', '환자 수', '재방문율', '매출', '처방', '보고 문장', '요일별', '환자 구성', '시간대별', '원장님별']
const IDS = ['stats-summary', 'stats-trend', 'stats-revisit', 'stats-revenue', 'stats-rx', 'stats-report', 'stats-weekday', 'stats-mix', 'stats-hours', 'stats-doctors']

const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const rect = (top: number, height = 40) => ({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

// 띠 + 열 칸(빈 section)을 그린다. 칸 자리는 tops로 바꾼다
function draw(range = RANGE, lastDay = YESTERDAY) {
  const view = render(
    <div>
      <StatsToc range={range} lastDay={lastDay} />
      {IDS.map((id) => (
        <section key={id} id={id} />
      ))}
    </div>,
  )
  const nav = screen.getByRole('navigation', { name: '칸 바로 가기' })
  const links = within(nav).getAllByRole('link')
  const sections = IDS.map((id) => document.getElementById(id)!)
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

describe('AC-4002.2: 목차 띠 왼쪽 글 tocRangeText', () => {
  it('AC-4002.2: 최근 30일은 기간 이름 · 시작 월.일–끝 월.일이다', () => {
    expect(tocRangeText(RANGE, YESTERDAY)).toBe('최근 30일 · 10.15–11.13')
  })

  it('AC-4002.2: 오늘 진료 끝이어도 빠른 기간의 끝(어제)보다 늦어지지 않는다', () => {
    expect(tocRangeText(RANGE, TODAY)).toBe('최근 30일 · 10.15–11.13')
  })

  it('AC-4002.2: 고른 달은 그 달 이름 · 1일–말일이다', () => {
    const range = pickRange(TODAY, { kind: 'month', unit: 'day', month: '2026-10' }, false)
    expect(tocRangeText(range, YESTERDAY)).toBe('2026년 10월 · 10.1–10.31')
  })

  it('AC-4002.2: 끝나지 않은 이번 달은 마지막 끝난 날까지다(오늘 진료 끝이면 오늘)', () => {
    const month = { kind: 'month', unit: 'day', month: '2026-11' } as const
    expect(tocRangeText(pickRange(TODAY, month, false), YESTERDAY)).toBe('2026년 11월 · 11.1–11.13')
    expect(tocRangeText(pickRange(TODAY, month, true), TODAY)).toBe('2026년 11월 · 11.1–11.14')
  })

  it('AC-4002.2: 최근 12개월은 이번 달 말일 대신 마지막 끝난 날에서 끊고, 해가 달라 양 끝에 해를 붙인다', () => {
    expect(tocRangeText(statsRange(TODAY, '12m'), YESTERDAY)).toBe('최근 12개월 · 2025.12.1–2026.11.13')
  })

  it('AC-4002.2: 해를 넘는 고른 기간은 해.월.일–해.월.일이다', () => {
    const range = pickRange(TODAY, { kind: 'custom', unit: 'month', from: '2025-11-15', to: '2026-11-13' }, false)
    expect(tocRangeText(range, YESTERDAY)).toBe('직접 고른 기간 · 2025.11.15–2026.11.13')
  })

  it('AC-4002.2: 한 해 안의 고른 해는 해를 붙이지 않는다', () => {
    expect(tocRangeText(pickRange(TODAY, { kind: 'year', year: '2025' }, false), YESTERDAY)).toBe('2025년 · 1.1–12.31')
    expect(tocRangeText(pickRange(TODAY, { kind: 'year', year: '2026' }, false), YESTERDAY)).toBe('2026년 · 1.1–11.13')
  })
})

describe('AC-4002.5: 지금 칸 고르기 activeTocIndex', () => {
  it('AC-4002.5: 위끝이 기준선 이하인 칸 가운데 마지막이다(기준선과 같은 위끝도 든다)', () => {
    expect(activeTocIndex([-900, -500, -100, 120, 600, 900, 1300, 1700, 2100], 194, false)).toBe(3)
    expect(activeTocIndex([-900, -500, -100, 194, 600, 900, 1300, 1700, 2100], 194, false)).toBe(3)
    expect(activeTocIndex([-900, -500, -100, 195, 600, 900, 1300, 1700, 2100], 194, false)).toBe(2)
  })

  it('AC-4002.5: 위끝이 같은(2px 안) 나란한 칸은 왼쪽(앞) 칸이다 — 환자 수·재방문율, 보고 문장·요일별', () => {
    expect(activeTocIndex([-900, 100, 100, 600, 900, 900, 1300, 1700, 2100], 194, false)).toBe(1)
    expect(activeTocIndex([-900, 100, 101.5, 600, 900, 900, 1300, 1700, 2100], 194, false)).toBe(1)
    expect(activeTocIndex([-2000, -1500, -1500, -900, 150, 150, 1300, 1700, 2100], 194, false)).toBe(4)
  })

  it('AC-4002.5: 위끝이 뚜렷이 다르면 나란한 칸으로 보지 않는다', () => {
    expect(activeTocIndex([-900, 100, 140, 600, 900, 900, 1300, 1700, 2100], 194, false)).toBe(2)
  })

  it('AC-4002.5: 쪽 맨 아래면 마지막 칸(원장님별)이다', () => {
    expect(activeTocIndex([-3000, -2500, -2500, -2000, -1500, -1500, -900, 300, 600], 194, true)).toBe(8)
  })

  it('AC-4002.5: 기준선 위 칸이 없으면 고른 칸이 없다(-1)', () => {
    expect(activeTocIndex([300, 700, 700, 1100, 1500, 1500, 1900, 2300, 2700], 194, false)).toBe(-1)
    expect(activeTocIndex([], 194, false)).toBe(-1)
    expect(activeTocIndex([], 194, true)).toBe(-1)
  })
})

describe('AC-4002.1·AC-4002.2: 목차 띠 마크업', () => {
  it('AC-4002.1·AC-4002.2·AC-4109.1: nav "칸 바로 가기" 안에 왼쪽 기간 글과 링크 열이 차례대로 있고 href가 칸 id다', () => {
    const { nav, links } = draw()
    expect(nav.tagName).toBe('NAV')
    expect(TOC_LINKS.map((link) => link.name)).toEqual(NAMES)
    expect(TOC_LINKS.map((link) => link.id)).toEqual(IDS)
    expect(links.map((a) => a.textContent)).toEqual(NAMES)
    expect(links.map((a) => a.getAttribute('href'))).toEqual(IDS.map((id) => `#${id}`))
    const range = within(nav).getByText('최근 30일 · 10.15–11.13')
    expect(range.compareDocumentPosition(links[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-4002.2: 고른 기간이면 왼쪽 글이 그 기간 이름과 날짜다', () => {
    const { nav } = draw(statsRange(TODAY, '12m'), YESTERDAY)
    expect(within(nav).getByText('최근 12개월 · 2025.12.1–2026.11.13')).toBeTruthy()
  })
})

describe('AC-4002.3: 붙는 자리·넘침·높이', () => {
  it('AC-4002.3: 띠는 머리줄 바로 아래에 붙는다(sticky top-25.5, 휴대폰 max-md:top-23.5, 바탕 bg-surface, 머리줄 z-10 아래)', () => {
    const { nav } = draw()
    for (const cls of ['sticky', 'top-25.5', 'max-md:top-23.5', 'bg-surface', 'z-9']) expect(tokens(nav), cls).toContain(cls)
  })

  it('AC-4002.3: 링크 줄은 띠 안에서만 옆으로 밀리고, 링크는 휴대폰 44px(max-md:h-11)·넓은 화면 42px이다', () => {
    const { nav, links } = draw()
    const strip = links[0]!.parentElement!
    expect(nav.contains(strip)).toBe(true)
    expect(tokens(strip)).toContain('overflow-x-auto')
    expect(tokens(strip)).toContain('min-w-0')
    for (const a of links) {
      expect(tokens(a), a.textContent!).toContain('max-md:h-11')
      expect(tokens(a), a.textContent!).toContain('h-10.5')
      expect(tokens(a), a.textContent!).toContain('shrink-0')
    }
  })

  it('AC-4002.3: 붙기 전에는 위 1px 줄, 머리줄 아래에 붙으면 아래 1px 줄만 있고 그림자는 없다(기본값 5)', () => {
    const { nav } = draw()
    const computed = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      const style = computed(el, pseudo)
      return el === nav ? ({ ...style, top: '102px' } as CSSStyleDeclaration) : style
    })
    const navRect = vi.spyOn(nav, 'getBoundingClientRect')

    navRect.mockReturnValue(rect(320, 44))
    fireEvent.scroll(window)
    expect(tokens(nav)).toEqual(expect.arrayContaining(['border-y', 'border-t-line', 'border-b-transparent']))

    navRect.mockReturnValue(rect(102, 44))
    fireEvent.scroll(window)
    expect(tokens(nav)).toEqual(expect.arrayContaining(['border-y', 'border-t-transparent', 'border-b-line']))
    expect(tokens(nav)).not.toContain('border-t-line')
    expect(tokens(nav).filter((t) => /(?:^|:)(?:inset-|drop-)?shadow(?:-|$)/.test(t))).toEqual([])
  })

  it('AC-4002.3: 지금 칸 링크가 링크 줄 밖이면 링크 줄만 옆으로 밀어 가운데로 오게 하고 쪽은 움직이지 않는다', () => {
    const { links } = draw()
    const strip = links[0]!.parentElement!
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 760 })
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 300 })
    Object.defineProperty(links[6]!, 'offsetLeft', { configurable: true, value: 500 })
    Object.defineProperty(links[6]!, 'offsetWidth', { configurable: true, value: 80 })
    const stripScroll = vi.fn()
    strip.scrollTo = stripScroll as unknown as HTMLElement['scrollTo']
    const pageScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    fireEvent.click(links[6]!)
    expect(stripScroll).toHaveBeenLastCalledWith({ left: 390, behavior: 'smooth' })
    expect(pageScroll).not.toHaveBeenCalled()
  })
})

describe('AC-4002.4: 링크 누름', () => {
  it('AC-4002.4: 누르면 주소는 그대로이고 그 칸으로 부드럽게 옮기며 누른 링크만 aria-current="true"다', () => {
    window.location.hash = '#before'
    const pushState = vi.spyOn(window.history, 'pushState')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { links, sections } = draw()

    fireEvent.click(links[4]!)
    expect(window.location.hash).toBe('#before')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(sections[4])
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'smooth' })
    expect(currentNames(links)).toEqual(['처방'])

    fireEvent.click(links[2]!)
    expect(window.location.hash).toBe('#before')
    expect(scrollIntoView.mock.contexts[1]).toBe(sections[2])
    expect(currentNames(links)).toEqual(['재방문율'])
    for (const a of links.filter((link) => link !== links[2])) expect(a.hasAttribute('aria-current'), a.textContent!).toBe(false)
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('AC-4002.4: 모션 줄이기를 켠 기기는 부드럽게 움직이지 않고 바로 간다(behavior auto)', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }))
    window.matchMedia = matchMedia as unknown as typeof window.matchMedia
    const { links } = draw()

    fireEvent.click(links[9]!)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' })
    expect(currentNames(links)).toEqual(['원장님별'])
  })

  it('AC-4002.4: scrollIntoView·matchMedia가 없는 브라우저에서도 던지지 않고 누른 링크를 강조한다', () => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    delete (window as { matchMedia?: unknown }).matchMedia
    const { links } = draw()
    expect(() => fireEvent.click(links[6]!)).not.toThrow()
    expect(currentNames(links)).toEqual(['요일별'])
  })

  it('AC-4002.4: 대상 칸이 아직 없어도 던지지 않는다', () => {
    render(<StatsToc range={RANGE} lastDay={YESTERDAY} />)
    const links = within(screen.getByRole('navigation', { name: '칸 바로 가기' })).getAllByRole('link')
    expect(() => fireEvent.click(links[0]!)).not.toThrow()
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(currentNames(links)).toEqual(['기간 요약'])
  })

  it('AC-4002.4: 주소(location·history)와 브라우저 저장소를 쓰지 않는다', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { links, sections } = draw()
    placeSections(sections, [-900, -500, -500, 120, 600, 600, 1300, 1700, 2100])
    fireEvent.scroll(window)
    fireEvent.click(links[4]!)
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

describe('AC-4002.5: 내릴 때 지금 칸 따라가기', () => {
  it('AC-4002.5·AC-4109.1: 내리면 띠 아래끝 + 48px 기준선 위 마지막 칸이 강조되고, 나란한 칸은 왼쪽이다', () => {
    const { nav, links, sections } = draw()
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44)) // 기준선 = 146 + 48 = 194

    placeSections(sections, [-900, -500, -500, -200, 120, 600, 600, 1300, 1700, 2100])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['처방'])

    placeSections(sections, [-900, 100, 100, 350, 600, 900, 900, 1300, 1700, 2100])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['환자 수'])

    placeSections(sections, [-900, -500, -500, 150, 600, 900, 900, 1300, 1700, 2100])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['매출'])

    placeSections(sections, [-3000, -2500, -2500, -2300, -2000, 150, 150, 900, 1300, 1700])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['보고 문장'])

    placeSections(sections, [300, 700, 700, 900, 1100, 1500, 1500, 1900, 2300, 2700])
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual([])
  })

  it('AC-4002.5: 쪽 맨 아래까지 내리면 원장님별이다', () => {
    const { nav, links, sections } = draw()
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44))
    placeSections(sections, [-3000, -2500, -2500, -2300, -2000, -1500, -1500, -900, 300, 600])
    setScroll({ y: 5000 - window.innerHeight, height: 5000 })
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['원장님별'])

    setScroll({ y: 1000, height: 5000 })
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['환자 구성'])
  })

  it('AC-4002.5: 크기가 바뀌어도 다시 고른다', () => {
    const { nav, links, sections } = draw()
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44))
    placeSections(sections, [-900, -500, -500, -200, 120, 600, 600, 1300, 1700, 2100])
    fireEvent(window, new Event('resize'))
    expect(currentNames(links)).toEqual(['처방'])
  })

  it('AC-4002.4·AC-4002.5: 누른 뒤 스크롤이 끝날 때(scrollend)까지는 누른 링크(나란한 오른쪽 칸이어도)가 그대로이고, 끝나면 다시 따라간다', () => {
    const { nav, links, sections } = draw()
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44))
    placeSections(sections, [-900, 150, 150, 400, 600, 900, 900, 1300, 1700, 2100])

    fireEvent.click(links[2]!)
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['재방문율'])

    fireEvent(window, new Event('scrollend'))
    expect(currentNames(links)).toEqual(['재방문율']) // 끝났다고 바로 바꾸지 않는다: 누른 쪽이 남는다
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['환자 수'])
  })

  it('AC-4002.4·AC-4002.5: scrollend가 오지 않으면 1.5초 뒤 다시 따라간다', () => {
    vi.useFakeTimers()
    const { nav, links, sections } = draw()
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(rect(102, 44))
    placeSections(sections, [-900, 150, 150, 400, 600, 900, 900, 1300, 1700, 2100])

    fireEvent.click(links[2]!)
    vi.advanceTimersByTime(1400)
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['재방문율'])

    vi.advanceTimersByTime(100)
    fireEvent.scroll(window)
    expect(currentNames(links)).toEqual(['환자 수'])
  })
})
