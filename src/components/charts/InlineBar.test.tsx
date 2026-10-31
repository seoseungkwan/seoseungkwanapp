// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { InlineBar } from './InlineBar'

// 표 줄 안 작은 막대 (b2b-redesign REQ-205 AC-205.7, design.md '차트 부품'(HTML 막대), UI_GUIDE '차트').
// 서버에서 그대로 그리는 부품 → renderToStaticMarkup으로 그린 마크업을 jsdom에 넣어 짜임·클래스·inline style을 본다(보이는 모양은 Phase 끝 사진).
// 예시 값은 시안 docs/mockups/b2b-redesign/parts.mjs의 RX '도수치료 30분'(이번 86 · 지난 74, 최대 402)이다

const mount = (element: ReactElement) => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(element)
  return root
}
const inline = (current: number, previous: number | null, max: number) =>
  mount(<InlineBar current={current} previous={previous} max={max} />)

const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted))
const all = (root: Element) => Array.from(root.querySelectorAll('*'))

// 감싸개: 그린 마크업의 맨 바깥 요소 하나
const wrapperOf = (root: Element) => {
  expect(root.children).toHaveLength(1)
  return root.firstElementChild!
}
const barOf = (root: Element) => all(root).filter((el) => classesOf(el).includes('bg-accent'))
const tickOf = (root: Element) => all(root).filter((el) => classesOf(el).includes('bg-faint'))
const styleOf = (el: Element | undefined) => el?.getAttribute('style') ?? null

describe('AC-205.7: InlineBar — aria-hidden 감싸개(140×12) 안에 이번 막대(accent)와 지난 기간 눈금(faint)', () => {
  it('AC-205.7: 감싸개는 aria-hidden이고 폭 140px(w-35)·높이 12px(h-3)이며 안의 위치 기준이다(relative)', () => {
    const wrapper = wrapperOf(inline(86, 74, 402))
    expect(wrapper.getAttribute('aria-hidden')).toBe('true')
    expectClasses(wrapper, 'relative', 'w-35', 'h-3', 'shrink-0')
    expect(wrapper.hasAttribute('style')).toBe(false)
    expect(wrapper.children).toHaveLength(2)
  })

  it('AC-205.7: 86/74/402 — 이번 막대는 accent·높이 8px(h-2)·위 2px(top-0.5)·폭 21.39%다', () => {
    const root = inline(86, 74, 402)
    const bars = barOf(root)
    expect(bars).toHaveLength(1)
    expectClasses(bars[0], 'absolute', 'left-0', 'top-0.5', 'h-2', 'bg-accent')
    expect(styleOf(bars[0])).toBe('width:21.39%') // 86/402 = 21.393…
  })

  it('AC-205.7: 86/74/402 — 지난 기간 눈금은 faint·2×12px(w-0.5·h-3)·left 18.41%·가운데 맞춤(-translate-x-1/2)이다', () => {
    const root = inline(86, 74, 402)
    const ticks = tickOf(root)
    expect(ticks).toHaveLength(1)
    expectClasses(ticks[0], 'absolute', 'top-0', 'w-0.5', 'h-3', '-translate-x-1/2', 'bg-faint')
    expect(styleOf(ticks[0])).toBe('left:18.41%') // 74/402 = 18.407…
  })

  it('AC-205.7: 눈금은 막대 뒤(위에 겹쳐 보인다)에 그린다', () => {
    const wrapper = wrapperOf(inline(86, 74, 402))
    expect(classesOf(wrapper.children[0])).toContain('bg-accent')
    expect(classesOf(wrapper.children[1])).toContain('bg-faint')
  })

  it('AC-205.7: 값은 0~max로 자른다 — current > max면 100%, 음수면 0%, previous > max면 left 100%', () => {
    expect(styleOf(barOf(inline(500, 74, 402))[0])).toBe('width:100%')
    expect(styleOf(barOf(inline(-5, 74, 402))[0])).toBe('width:0%')
    expect(styleOf(tickOf(inline(86, 900, 402))[0])).toBe('left:100%')
    expect(styleOf(tickOf(inline(86, -1, 402))[0])).toBe('left:0%')
    expect(styleOf(barOf(inline(402, 402, 402))[0])).toBe('width:100%')
  })

  it('AC-205.7: % 값은 Number(v.toFixed(2))다(끝 0 없음)', () => {
    expect(styleOf(barOf(inline(1, 0, 8))[0])).toBe('width:12.5%')
    expect(styleOf(tickOf(inline(1, 0, 8))[0])).toBe('left:0%')
    expect(styleOf(barOf(inline(1, 2, 3))[0])).toBe('width:33.33%')
    expect(styleOf(tickOf(inline(1, 2, 3))[0])).toBe('left:66.67%')
  })

  it('AC-205.7: previous가 null이면 눈금이 없고 막대만 있다', () => {
    const root = inline(86, null, 402)
    expect(tickOf(root)).toHaveLength(0)
    expect(barOf(root)).toHaveLength(1)
    expect(wrapperOf(root).children).toHaveLength(1)
  })

  it.each([0, -10])('AC-205.7: max가 0 이하(%d)이면 막대·눈금이 없다(빈 감싸개만 자리를 지킨다)', (max) => {
    const root = inline(86, 74, max)
    const wrapper = wrapperOf(root)
    expect(wrapper.getAttribute('aria-hidden')).toBe('true')
    expectClasses(wrapper, 'w-35', 'h-3')
    expect(wrapper.children).toHaveLength(0)
    expect(barOf(root)).toHaveLength(0)
    expect(tickOf(root)).toHaveLength(0)
  })

  it('AC-205.7: inline style은 막대 width %와 눈금 left %뿐이다', () => {
    for (const root of [inline(86, 74, 402), inline(500, null, 402), inline(0, 0, 402)]) {
      for (const el of all(root).filter((e) => e.hasAttribute('style'))) {
        expect(el.getAttribute('style')).toMatch(/^(?:width|left):\d+(?:\.\d{1,2})?%$/)
      }
    }
  })

  it('AC-205.7: 막대는 HTML이다(svg 없음)', () => {
    expect(inline(86, 74, 402).querySelectorAll('svg')).toHaveLength(0)
  })
})
