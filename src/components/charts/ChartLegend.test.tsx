// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { nestedBoxes } from '@/testing/boxes'
import { ChartLegend, type LegendItem } from './ChartLegend'

// 범례 (b2b-redesign REQ-205 AC-205.5, design.md '차트 부품', UI_GUIDE '차트').
// <ul> 안에 항목마다 10×10 색 표시(aria-hidden) + 이름(small ink-2), 항목 사이 16px.
// 표시: accent 면 · chart-3 면 · 빗금(패턴 없이 선 세 개를 그린 svg) · 지난 기간 세로 막대 2×12 faint

const ITEMS: LegendItem[] = [
  { label: '신환', mark: 'accent' },
  { label: '재진', mark: 'chart-3' },
  { label: '집계 중', mark: 'hatch' },
  { label: '그 전 주', mark: 'prev' },
]

const render = (items: LegendItem[] = ITEMS) => {
  const html = renderToStaticMarkup(<ChartLegend items={items} />)
  const root = document.createElement('div')
  root.innerHTML = html
  return { root, html }
}
const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted))
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const itemsOf = (root: Element) => {
  const list = root.firstElementChild
  expect(list?.tagName).toBe('UL')
  return Array.from(list!.children)
}
const markOf = (li: Element) => li.firstElementChild!
const nameOf = (li: Element) => li.lastElementChild!

describe('AC-205.5: ChartLegend — <ul> 안에 항목마다 10×10 색 표시(aria-hidden) + 이름(small ink-2), 사이 16px', () => {
  it('AC-205.5: <ul> 하나 안에 <li>가 받은 순서대로 있고 항목 사이는 16px(gap-x-4)이다', () => {
    const { root } = render()
    expect(root.children).toHaveLength(1)
    const list = root.firstElementChild!
    expect(list.tagName).toBe('UL')
    expectClasses(list, 'flex', 'gap-x-4')
    const items = itemsOf(root)
    expect(items.map((li) => li.tagName)).toEqual(['LI', 'LI', 'LI', 'LI'])
    expect(items.map(textOf)).toEqual(['신환', '재진', '집계 중', '그 전 주'])
  })

  it('AC-205.5: 항목마다 색 표시(aria-hidden="true")가 먼저, 이름(small ink-2)이 뒤에 있다', () => {
    for (const li of itemsOf(render().root)) {
      expect(li.children).toHaveLength(2)
      expect(markOf(li).getAttribute('aria-hidden')).toBe('true')
      expect(textOf(markOf(li))).toBe('')
      const name = nameOf(li)
      expect(name.getAttribute('aria-hidden')).toBeNull()
      expectClasses(name, 'text-small', 'text-ink-2')
    }
  })

  it('AC-205.5: accent 면 · chart-3 면은 10×10(size-2.5) 칸이다', () => {
    const [accent, chart3] = itemsOf(render().root)
    expectClasses(markOf(accent!), 'size-2.5', 'bg-accent')
    expectClasses(markOf(chart3!), 'size-2.5', 'bg-chart-3')
    expect(markOf(accent!).tagName).toBe('SPAN')
    expect(markOf(chart3!).tagName).toBe('SPAN')
  })

  it('AC-205.5: 빗금은 패턴 없이 선 세 개를 그린 10×10 aria-hidden svg다(accent, currentColor)', () => {
    const { root, html } = render()
    const mark = markOf(itemsOf(root)[2]!)
    expect(mark.tagName.toLowerCase()).toBe('svg')
    expect(mark.getAttribute('width')).toBe('10')
    expect(mark.getAttribute('height')).toBe('10')
    expect(mark.getAttribute('viewBox')).toBe('0 0 10 10')
    expect(mark.closest('.text-accent')).toBeTruthy()
    // 빗금 선: M x y L x y 세 조각(45° — 오른쪽 위로)
    const hatch = Array.from(mark.querySelectorAll('path')).filter((p) => p.getAttribute('stroke') === 'currentColor')
    expect(hatch).toHaveLength(1)
    const lines = [...(hatch[0]!.getAttribute('d') ?? '').matchAll(/M\s*([\d.]+)[\s,]+([\d.]+)\s*L\s*([\d.]+)[\s,]+([\d.]+)/g)]
    expect(lines).toHaveLength(3)
    for (const [, x1, y1, x2, y2] of lines) {
      expect(Number(x2) - Number(x1)).toBe(Number(y1) - Number(y2))
      expect(Number(x2)).toBeGreaterThan(Number(x1))
    }
    expect(html).not.toMatch(/<pattern/i)
    expect(html).not.toContain('url(#')
    expect(root.querySelectorAll('[id]')).toHaveLength(0)
    for (const el of Array.from(mark.querySelectorAll('*'))) {
      for (const attr of ['fill', 'stroke']) {
        const value = el.getAttribute(attr)
        if (value !== null) expect(['currentColor', 'none'], `${el.tagName} ${attr}`).toContain(value)
      }
    }
  })

  it('AC-205.5: 지난 기간 표시는 세로 막대 2×12(w-0.5 h-3) faint다', () => {
    const mark = markOf(itemsOf(render().root)[3]!)
    expect(mark.tagName).toBe('SPAN')
    expectClasses(mark, 'w-0.5', 'h-3', 'bg-faint')
  })

  it('AC-205.5: 색 표시는 줄어들지 않고(shrink-0) 이름과 같은 줄에 가운데 맞춘다', () => {
    for (const li of itemsOf(render().root)) {
      expectClasses(li, 'flex', 'items-center')
      expectClasses(markOf(li), 'shrink-0')
    }
  })

  it('AC-205.5: 상자가 아니다(테두리 없음)·inline style이 없다', () => {
    const { root } = render()
    expect(nestedBoxes(root)).toEqual([])
    expect(classesOf(root.firstElementChild).some((c) => c.startsWith('border'))).toBe(false)
    expect(root.querySelectorAll('[style]')).toHaveLength(0)
  })

  it('AC-205.5: 같은 표시를 여러 번 써도 되고 항목이 없으면 빈 <ul>이다', () => {
    const { root } = render([
      { label: '지난주', mark: 'accent' },
      { label: '그 전 주', mark: 'prev' },
      { label: '이번 주', mark: 'accent' },
    ])
    expect(itemsOf(root).map(textOf)).toEqual(['지난주', '그 전 주', '이번 주'])
    expect(itemsOf(render([]).root)).toHaveLength(0)
  })
})
