// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { nestedBoxes } from '@/testing/boxes'
import { Stepper } from './Stepper'

// 가입 단계 (b2b-redesign REQ-215 AC-215.1 — 승인 대기 AC-216.1도 같은 모양). 시안 docs/mockups/b2b-redesign/screens.mjs의 stepper

const LABELS = ['구글 로그인', '가입 신청', '관리자 승인']
// 시안 parts.mjs의 체크 아이콘(Icon check)
const CHECK_D = 'm3.5 8.25 2.9 2.9 6.1-6.65'

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(el ? classesOf(el) : []).toEqual(expect.arrayContaining(wanted))
// a가 문서에서 b보다 앞에 있다
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
const ARBITRARY_COLOR = /\[#|rgba?\(|hsla?\(|color-mix\(/

// 화면 읽기가 읽는 글자: aria-hidden="true" 안쪽을 뺀 글자(빈칸은 하나로)
function spoken(node: Node): string {
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? ''
    if (n instanceof Element && n.getAttribute('aria-hidden') === 'true') return ''
    return Array.from(n.childNodes).map(walk).join('')
  }
  return walk(node).replace(/\s+/g, ' ').trim()
}

const list = () => screen.getByRole('list', { name: '가입 단계' })
// 단계 <li> 3개(연결선은 <li> 안의 aria-hidden 선이라 <li>가 늘지 않는다)
const steps = () => Array.from(list().querySelectorAll(':scope > li'))
// 단계 칸(20px 사각형): <li>의 aria-hidden 칸 가운데 선이 아닌 것
const squareOf = (li: Element) => li.querySelector(':scope > [aria-hidden="true"]:not(.h-px)') as HTMLElement
const labelOf = (li: Element) => within(li as HTMLElement).getByText(LABELS.find((t) => li.textContent?.includes(t)) ?? '')
const lines = () => Array.from(list().querySelectorAll('[aria-hidden="true"].h-px'))

afterEach(cleanup)

describe('Stepper: 단계 틀', () => {
  it.each([2, 3] as const)('AC-215.1: current %s — <ol aria-label="가입 단계">(위 24px, small) 안에 <li> 3개: 구글 로그인 · 가입 신청 · 관리자 승인', (current) => {
    const { container } = render(<Stepper current={current} />)
    const ol = list()
    expect(ol.tagName).toBe('OL')
    expect(container.firstElementChild).toBe(ol)
    expectClasses(ol, 'mt-6', 'text-small', 'flex', 'items-center')
    expect(ol.children).toHaveLength(3)
    expect(steps()).toHaveLength(3)
    expect(within(ol).getAllByRole('listitem')).toHaveLength(3)
    expect(steps().map((li) => labelOf(li).textContent)).toEqual(LABELS)
  })

  it.each([2, 3] as const)('AC-215.1: current %s — 단계 사이 aria-hidden 연결선 2개(24px·1px line-strong, 768px 미만 10px)', (current) => {
    render(<Stepper current={current} />)
    const [first, second, third] = steps()
    expect(lines()).toHaveLength(2)
    for (const line of lines()) {
      expect(line.tagName).toBe('SPAN')
      expectClasses(line, 'h-px', 'w-6', 'bg-line-strong', 'shrink-0', 'max-md:w-2.5')
      expect(line.textContent).toBe('')
    }
    // 선은 앞 단계 글자와 다음 단계 칸 사이에 있다
    const [a, b] = lines()
    expect(isBefore(labelOf(first), a)).toBe(true)
    expect(isBefore(a, squareOf(second))).toBe(true)
    expect(isBefore(labelOf(second), b)).toBe(true)
    expect(isBefore(b, squareOf(third))).toBe(true)
    expect(first.querySelector('.h-px')).toBeNull()
  })

  it.each([2, 3] as const)('AC-215.1: current %s — 단계 칸은 20px·4px·1px 테두리·caption 600 가운데, 상자 안 상자·임의 색이 없다', (current) => {
    const { container } = render(<Stepper current={current} />)
    for (const li of steps()) {
      const square = squareOf(li)
      expect(square.tagName).toBe('SPAN')
      expectClasses(square, 'size-5', 'rounded-control', 'border', 'text-caption', 'font-semibold', 'grid', 'place-items-center', 'shrink-0')
      expectClasses(li, 'flex', 'items-center', 'whitespace-nowrap')
    }
    expect(nestedBoxes(container)).toEqual([])
    for (const el of container.querySelectorAll('[class]')) expect(el.getAttribute('class') ?? '').not.toMatch(ARBITRARY_COLOR)
  })
})

describe('Stepper: 단계 모양과 화면 읽기 글자', () => {
  const expectDone = (li: Element) => {
    const square = squareOf(li)
    expectClasses(li, 'text-ink-2')
    expect(classesOf(li)).not.toContain('font-semibold')
    expect(li.getAttribute('aria-current')).toBeNull()
    // accent-soft 칸 + accent 체크 12px(번호 대신)
    expectClasses(square, 'bg-accent-soft', 'text-accent', 'border-transparent')
    const check = square.querySelector('svg') as SVGElement
    expect(check.querySelector(`path[d="${CHECK_D}"]`)).not.toBeNull()
    expect(check.getAttribute('width')).toBe('12')
    expect(check.getAttribute('height')).toBe('12')
    expect(square.textContent).toBe('')
    // 화면 읽기 "끝남"(눈에는 안 보인다)
    const done = within(li as HTMLElement).getByText('끝남')
    expectClasses(done, 'sr-only')
  }
  const expectNow = (li: Element, n: string) => {
    const square = squareOf(li)
    expectClasses(li, 'text-ink', 'font-semibold')
    expect(li.getAttribute('aria-current')).toBe('step')
    expectClasses(square, 'bg-accent', 'border-accent', 'text-surface')
    expect(square.textContent).toBe(n)
    expect(square.querySelector('svg')).toBeNull()
    expect(within(li as HTMLElement).queryByText('끝남')).toBeNull()
  }
  const expectNext = (li: Element, n: string) => {
    const square = squareOf(li)
    expectClasses(li, 'text-muted')
    expect(classesOf(li)).not.toContain('font-semibold')
    expect(li.getAttribute('aria-current')).toBeNull()
    expectClasses(square, 'border-line-strong', 'text-muted')
    expect(classesOf(square).filter((c) => c.startsWith('bg-'))).toEqual([])
    expect(square.textContent).toBe(n)
    expect(within(li as HTMLElement).queryByText('끝남')).toBeNull()
  }

  it('AC-215.1: current 2(가입 신청) — 1 끝남(accent-soft 칸 + accent 체크, ink-2) · 2 지금(accent 바탕 흰 "2", ink 600, aria-current="step") · 3 다음(line-strong 테두리 muted "3", muted)', () => {
    render(<Stepper current={2} />)
    const [first, second, third] = steps()
    expectDone(first)
    expectNow(second, '2')
    expectNext(third, '3')
  })

  it('AC-215.1·AC-216.1: current 3(승인 대기) — 1·2 끝남, 3 관리자 승인 지금', () => {
    render(<Stepper current={3} />)
    const [first, second, third] = steps()
    expectDone(first)
    expectDone(second)
    expectNow(third, '3')
  })

  it.each([
    [2, ['구글 로그인 끝남', '가입 신청', '관리자 승인']],
    [3, ['구글 로그인 끝남', '가입 신청 끝남', '관리자 승인']],
  ] as const)('AC-215.1: current %s — 화면 읽기 글자는 단계 이름(+ 끝남)뿐이다(칸·선·체크는 aria-hidden)', (current, expected) => {
    render(<Stepper current={current} />)
    expect(steps().map(spoken)).toEqual(expected)
    for (const li of steps()) expect(squareOf(li).getAttribute('aria-hidden')).toBe('true')
    // <ol> 바로 안에는 <li> 말고 글자가 없다(단계는 항목마다 따로 읽힌다)
    expect(Array.from(list().childNodes).filter((n) => !(n instanceof HTMLLIElement))).toEqual([])
  })
})
