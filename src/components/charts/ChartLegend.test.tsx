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

// 구분 없음 표시 (rx-picker AC-805.3 범례 모양·AC-806.4, design.md '차트 부품', 시안 docs/mockups/rx-picker/index.html의 .s-gap). 지금 시험은 고치지 않고 여기에 더한다
describe('AC-805.3: ChartLegend hatch-warning — 구분 없음 표시(10×10, text-warning 빗금)', () => {
  const GAP: LegendItem[] = [
    { label: '신환', mark: 'accent' },
    { label: '재진', mark: 'chart-3' },
    { label: '구분 없음', mark: 'hatch-warning' },
  ]
  const gapMark = () => markOf(itemsOf(render(GAP).root)[2]!)

  it('AC-805.3: 구분 없음 표시는 10×10 aria-hidden svg이고 text-warning 선, bg-warning-soft 바탕이며 줄어들지 않는다', () => {
    const mark = gapMark()
    expect(mark.tagName.toLowerCase()).toBe('svg')
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(mark.getAttribute('width')).toBe('10')
    expect(mark.getAttribute('height')).toBe('10')
    expect(mark.getAttribute('viewBox')).toBe('0 0 10 10')
    expectClasses(mark, 'shrink-0', 'text-warning', 'bg-warning-soft')
    expect(classesOf(mark)).not.toContain('text-accent')
  })

  it('AC-806.4: 그림은 집계 중 빗금(테두리 + 선 세 개)과 같고 색 클래스만 다르다', () => {
    const hatch = markOf(itemsOf(render([{ label: '집계 중', mark: 'hatch' }]).root)[0]!)
    expect(gapMark().innerHTML).toBe(hatch.innerHTML)
    for (const el of Array.from(gapMark().querySelectorAll('*'))) {
      for (const attr of ['fill', 'stroke']) {
        const value = el.getAttribute(attr)
        if (value !== null) expect(['currentColor', 'none'], `${el.tagName} ${attr}`).toContain(value)
      }
    }
  })

  it('AC-805.3: 패턴·id·그라데이션·inline style이 없다', () => {
    const { root, html } = render(GAP)
    expect(html).not.toMatch(/<pattern|gradient/i)
    expect(html).not.toContain('url(#')
    expect(root.querySelectorAll('[id]')).toHaveLength(0)
    expect(root.querySelectorAll('[style]')).toHaveLength(0)
  })

  it('AC-805.3: 범례는 신환·재진·구분 없음 차례이고 이름은 small ink-2다', () => {
    const items = itemsOf(render(GAP).root)
    expect(items.map(textOf)).toEqual(['신환', '재진', '구분 없음'])
    expectClasses(nameOf(items[2]!), 'text-small', 'text-ink-2')
  })

  it('AC-805.3: 새 값을 쓰지 않으면 지금 마크업과 한 글자도 다르지 않다', () => {
    const li = (mark: string, label: string) => `<li class="flex items-center gap-1.5 whitespace-nowrap">${mark}<span class="text-small text-ink-2">${label}</span></li>`
    const fill = (classes: string) => `<span aria-hidden="true" class="shrink-0 ${classes}"></span>`
    const hatch =
      '<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" class="shrink-0 text-accent">' +
      '<rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"></rect>' +
      '<path d="M0 6 L6 0 M0 10 L10 0 M4 10 L10 4" fill="none" stroke="currentColor" stroke-width="1"></path></svg>'
    expect(render().html).toBe(
      '<ul class="flex flex-wrap items-center gap-x-4 gap-y-1">' +
        li(fill('size-2.5 bg-accent'), '신환') +
        li(fill('size-2.5 bg-chart-3'), '재진') +
        li(hatch, '집계 중') +
        li(fill('h-3 w-0.5 bg-faint'), '그 전 주') +
        '</ul>',
    )
  })
})

// 추세선·꺾은선 표시 (group-exclude REQ-3709 AC-3709.3·AC-3709.4, design.md '그래프 부품'). 시안 docs/mockups/group-exclude/index.html의 .sw i.ln(점선)·.sw i.pl(선).
// trend = 가로 12px 점선(ink, 패턴 없이 svg 선 하나), line = 가로 12px · 2px accent 선. 지금 시험은 고치지 않고 여기에 더한다. 예시 이름은 시안 범례 글이다
describe('AC-3709.3·AC-3709.4: ChartLegend trend·line — 추세선(12px 점선 ink)·총환자 대비(12px 2px accent 선)', () => {
  const COUNT: LegendItem[] = [
    { label: '신환', mark: 'accent' },
    { label: '재진', mark: 'chart-3' },
    { label: '비교 기간', mark: 'prev' },
    { label: '추세선', mark: 'trend' },
  ]
  const PCT: LegendItem[] = [
    { label: '총환자 대비 %', mark: 'line' },
    { label: '추세선', mark: 'trend' },
  ]

  it('AC-3709.3: [건수] 범례는 신환·재진·비교 기간 뒤 끝에 추세선이 있고 이름은 small ink-2다', () => {
    const items = itemsOf(render(COUNT).root)
    expect(items.map(textOf)).toEqual(['신환', '재진', '비교 기간', '추세선'])
    expectClasses(nameOf(items[3]!), 'text-small', 'text-ink-2')
  })

  it('AC-3709.3: 추세선 표시는 가로 12px aria-hidden svg 점선 하나다(ink, currentColor, 2px, stroke-dasharray)', () => {
    const mark = markOf(itemsOf(render(COUNT).root)[3]!)
    expect(mark.tagName.toLowerCase()).toBe('svg')
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(mark.getAttribute('width')).toBe('12')
    expect(mark.getAttribute('height')).toBe('2')
    expect(mark.getAttribute('viewBox')).toBe('0 0 12 2')
    expectClasses(mark, 'shrink-0', 'text-ink')
    expect(mark.children).toHaveLength(1)
    const line = mark.firstElementChild!
    expect(line.tagName.toLowerCase()).toBe('line')
    // 가운데 높이(y 1)에서 왼쪽 끝부터 오른쪽 끝까지
    expect(['x1', 'y1', 'x2', 'y2'].map((a) => Number(line.getAttribute(a)))).toEqual([0, 1, 12, 1])
    expect(line.getAttribute('stroke')).toBe('currentColor')
    expect(line.getAttribute('stroke-width')).toBe('2')
    const dash = (line.getAttribute('stroke-dasharray') ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
    expect(dash.length).toBeGreaterThanOrEqual(2)
    for (const n of dash) expect(n).toBeGreaterThan(0)
  })

  it('AC-3709.4: [총환자 대비 %] 범례는 총환자 대비 %·추세선 차례이고, 꺾은선 표시는 가로 12px · 2px accent 선(h-0.5 w-3)이다', () => {
    const items = itemsOf(render(PCT).root)
    expect(items.map(textOf)).toEqual(['총환자 대비 %', '추세선'])
    const line = markOf(items[0]!)
    expect(line.tagName).toBe('SPAN')
    expect(line.getAttribute('aria-hidden')).toBe('true')
    expect(textOf(line)).toBe('')
    expectClasses(line, 'shrink-0', 'h-0.5', 'w-3', 'bg-accent')
    expect(markOf(items[1]!).tagName.toLowerCase()).toBe('svg')
  })

  it('AC-3709.3·AC-3709.4: 새 표시도 색은 토큰 클래스·currentColor뿐이고 pattern·id·inline style이 없다', () => {
    const { root, html } = render([...COUNT, ...PCT])
    for (const el of Array.from(root.querySelectorAll('svg *'))) {
      for (const attr of ['fill', 'stroke']) {
        const value = el.getAttribute(attr)
        if (value !== null) expect(['currentColor', 'none'], `${el.tagName} ${attr}`).toContain(value)
      }
    }
    expect(html).not.toMatch(/<pattern|gradient/i)
    expect(html).not.toContain('url(#')
    expect(root.querySelectorAll('[id]')).toHaveLength(0)
    expect(root.querySelectorAll('[style]')).toHaveLength(0)
    expect(nestedBoxes(root)).toEqual([])
  })

  it('AC-3709.3: 새 표시도 항목 짜임은 같다 — 표시(aria-hidden) 먼저, 이름 뒤, 같은 줄 가운데', () => {
    for (const li of itemsOf(render([...COUNT, ...PCT]).root)) {
      expect(li.children).toHaveLength(2)
      expect(markOf(li).getAttribute('aria-hidden')).toBe('true')
      expectClasses(li, 'flex', 'items-center')
      expectClasses(markOf(li), 'shrink-0')
    }
  })
})
