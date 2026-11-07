// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { Delta } from '@/types/analysis'
import { DeltaText } from './DeltaText'

// 증감 글 한 부품 (dashboard-ux REQ-2706 AC-2706.4, design.md §7): 화살표(꾸밈) · 화면 읽기 글 · 증감 글, 같은 색 규칙.
// KpiStat 증감 줄과 대시보드 "지난주 같은 요일보다" 칸이 같이 쓴다. 서버에서 그대로 그린다 → renderToStaticMarkup으로 본다

const mount = (element: ReactElement) => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(element)
  expect(root.children).toHaveLength(1)
  return root.firstElementChild!
}
const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const visibleText = (el: Element) => {
  const copy = el.cloneNode(true) as Element
  for (const sr of Array.from(copy.querySelectorAll('.sr-only'))) sr.remove()
  return (copy.textContent ?? '').trim()
}
const UP: Delta = { kind: 'change', diff: 3, pct: 30 }
const DOWN: Delta = { kind: 'change', diff: -5, pct: -50 }

describe('AC-2706.4: DeltaText — 화살표 꾸밈 · 화면 읽기 글 · 증감 글', () => {
  it('AC-2706.4: 늘어남은 positive · 위 화살표(aria-hidden) · 화면 읽기 "늘어남" · 빈칸 · 증감 글이고, 놓는 쪽 클래스 뒤에 색이 붙는다', () => {
    const line = mount(<DeltaText delta={UP} unit="명" className="flex gap-1" />)
    expect(line.tagName).toBe('P')
    expect(classesOf(line)).toEqual(['flex', 'gap-1', 'text-positive'])
    const svg = line.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect([svg.getAttribute('width'), svg.getAttribute('height'), svg.getAttribute('viewBox')]).toEqual(['8', '8', '0 0 8 8'])
    expect(line.querySelector('.sr-only')!.textContent).toBe('늘어남')
    // 화면 읽기는 붙여 읽지 않는다("늘어남 3명 …")
    expect(line.textContent).toBe('늘어남 3명 (+30.0%)')
    expect(visibleText(line)).toBe('3명 (+30.0%)')
  })

  it('AC-2706.4: 줄어듦은 negative · 아래 화살표 · "줄어듦"이고, arrow로 화살표 크기만 바꾼다(그림 칸 8 그대로)', () => {
    const line = mount(<DeltaText delta={DOWN} unit="명" className="x" arrow={12} />)
    expect(classesOf(line)).toEqual(['x', 'text-negative'])
    const svg = line.querySelector('svg')!
    expect([svg.getAttribute('width'), svg.getAttribute('height'), svg.getAttribute('viewBox')]).toEqual(['12', '12', '0 0 8 8'])
    expect(svg.innerHTML).not.toBe(mount(<DeltaText delta={UP} unit="명" className="x" />).querySelector('svg')!.innerHTML)
    expect(line.textContent).toBe('줄어듦 5명 (−50.0%)')
  })

  it.each<[string, Delta, string]>([
    ['flat', { kind: 'change', diff: 0, pct: 0 }, '변화 없음'],
    ['new', { kind: 'new' }, '새로 생김'],
    ['in-progress', { kind: 'in-progress' }, '집계 중'],
    ['unavailable', { kind: 'unavailable' }, '비교할 수 없음'],
  ])('AC-2706.4: %s는 화살표·화면 읽기 글 없이 muted "%s"', (_name, delta, text) => {
    const line = mount(<DeltaText delta={delta} unit="명" className="x" />)
    expect(classesOf(line)).toEqual(['x', 'text-muted'])
    expect(line.querySelector('svg')).toBeNull()
    expect(line.querySelector('.sr-only')).toBeNull()
    expect(visibleText(line)).toBe(text)
  })

  it('AC-2706.4: 단위 %p는 비율 차이 글이고, children은 증감 글 뒤에 붙는다', () => {
    const line = mount(
      <DeltaText delta={{ kind: 'change', diff: 0.002, pct: null }} unit="%p" className="x">
        <span>뒤</span>
      </DeltaText>,
    )
    expect(visibleText(line)).toBe('0.2%p뒤')
    expect(line.lastElementChild!.textContent).toBe('뒤')
  })
})
