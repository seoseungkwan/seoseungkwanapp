// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DonutChart, type DonutSlice } from './DonutChart'

// 도넛 (first90 REQ-4412 AC-4412.1·REQ-4417 AC-4417.1·AC-4417.2, design.md 5-4, 시안 docs/mockups/first90/redesign.html '.s-donut').
// 서버에서 그대로 그리는 부품 → renderToStaticMarkup으로 그린 마크업을 jsdom에 넣어 짜임·클래스·속성을 본다(보이는 모양은 Phase 끝 사진).
// 그림 전체는 꾸밈(aria-hidden)이고 화면 읽기용 값은 부르는 쪽의 범례 글이 준다. 둘레 100(r = 50/π)이라 조각 길이 = 비율(%)이다.
// 예시 값은 시안의 누적 내원 2,408건(신환 238 · 90일초진 293 · 재진 1,877)이다

const VISITS: DonutSlice[] = [
  { name: '신환', value: 238, tone: 'accent' },
  { name: '90일초진', value: 293, tone: 'f90' },
  { name: '재진', value: 1877, tone: 'ret' },
]
const CENTER: [string, string] = ['누적 내원', '2,408건']

const draw = (props: Partial<Parameters<typeof DonutChart>[0]> = {}) => {
  const html = renderToStaticMarkup(<DonutChart slices={VISITS} center={CENTER} {...props} />)
  const root = document.createElement('div')
  root.innerHTML = html
  return { root, html }
}
const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) => expect(classesOf(el)).toEqual(expect.arrayContaining(wanted))
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const svgOf = (root: Element) => {
  const svgs = root.querySelectorAll('svg')
  expect(svgs).toHaveLength(1)
  return svgs[0]!
}
// 바탕 고리(첫 circle)와 조각들(g 안 circle)
const ringOf = (root: Element) => svgOf(root).querySelector(':scope > circle')!
const arcsOf = (root: Element) => Array.from(svgOf(root).querySelectorAll('g > circle'))
const dash = (arc: Element) => [arc.getAttribute('stroke-dasharray'), arc.getAttribute('stroke-dashoffset')]

describe('AC-4412.1: DonutChart — aria-hidden 그림 하나, 원 조각 비율, 가운데 두 줄', () => {
  it('AC-4412.1: 감싸개와 svg가 모두 aria-hidden이고 svg는 viewBox 0 0 42 42 하나다(role·글자 이름 없음)', () => {
    const { root } = draw()
    expect(root.children).toHaveLength(1)
    const wrapper = root.firstElementChild!
    expect(wrapper.getAttribute('aria-hidden')).toBe('true')
    expectClasses(wrapper, 'relative', 'shrink-0')
    const svg = svgOf(root)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('viewBox')).toBe('0 0 42 42')
    expect(svg.hasAttribute('role')).toBe(false)
    expect(svg.hasAttribute('aria-label')).toBe(false)
  })

  it('AC-4412.1: 바탕 고리는 st-h0 색(currentColor) 원 하나이고 조각은 위(12시)부터 시계 방향이다(g rotate -90)', () => {
    const { root } = draw()
    const ring = ringOf(root)
    for (const [name, value] of [['cx', '21'], ['cy', '21'], ['fill', 'none'], ['stroke', 'currentColor']]) expect(ring.getAttribute(name), name).toBe(value)
    expectClasses(ring, 'text-st-h0')
    expect(Number(ring.getAttribute('r'))).toBeCloseTo(50 / Math.PI, 3)
    expect(svgOf(root).querySelector('g')!.getAttribute('transform')).toBe('rotate(-90 21 21)')
  })

  it('AC-4412.1: 조각은 차례대로 accent·st-f90·st-ret 색이고 길이 = 비율 − 사이 0.6, 시작 = 앞 조각 비율 합(소수 둘째 자리)이다', () => {
    const arcs = arcsOf(draw().root)
    expect(arcs).toHaveLength(3)
    expectClasses(arcs[0], 'text-accent')
    expectClasses(arcs[1], 'text-st-f90')
    expectClasses(arcs[2], 'text-st-ret')
    // 238/2408 = 9.88% · 293/2408 = 12.17% · 1877/2408 = 77.95%
    expect(arcs.map(dash)).toEqual([
      ['9.28 90.72', '0'],
      ['11.57 88.43', '-9.88'],
      ['77.35 22.65', '-22.05'],
    ])
    for (const arc of arcs) {
      expect(arc.getAttribute('fill')).toBe('none')
      expect(arc.getAttribute('stroke')).toBe('currentColor')
      expect(arc.getAttribute('stroke-width')).toBe(ringOf(draw().root).getAttribute('stroke-width'))
      expect(Number(arc.getAttribute('r'))).toBeCloseTo(50 / Math.PI, 3)
    }
  })

  it('AC-4412.1: 두 갈래(신환·재진)도 같은 식이다', () => {
    const arcs = arcsOf(draw({ slices: [{ name: '신환', value: 238, tone: 'accent' }, { name: '재진(90일초진 포함)', value: 2170, tone: 'ret' }] }).root)
    expect(arcs).toHaveLength(2)
    expect(arcs.map(dash)).toEqual([
      ['9.28 90.72', '0'],
      ['89.52 10.48', '-9.88'],
    ])
  })

  it('AC-4412.1: 0·음수 조각은 그리지 않고, 조각이 하나뿐이면 사이 없이 고리 전체(100 0)다', () => {
    const arcs = arcsOf(draw({ slices: [{ name: '신환', value: 0, tone: 'accent' }, { name: '90일초진', value: -3, tone: 'f90' }, { name: '재진', value: 40, tone: 'ret' }] }).root)
    expect(arcs).toHaveLength(1)
    expectClasses(arcs[0], 'text-st-ret')
    expect(dash(arcs[0]!)).toEqual(['100 0', '0'])
  })

  it('AC-4412.1: 합이 0이면 바탕 고리만 있고 NaN·Infinity가 없다', () => {
    const { root, html } = draw({ slices: VISITS.map((s) => ({ ...s, value: 0 })), center: ['누적 내원', '0건'] })
    expect(arcsOf(root)).toEqual([])
    expect(ringOf(root)).toBeTruthy()
    expect(html).not.toMatch(/NaN|Infinity/)
  })

  it('AC-4412.1: 가운데 두 줄은 "누적 내원"(caption 600 st-ink-2) / "2,408건"(st-22 600 st-ink 고정폭)이고 고리 한가운데에 겹친다', () => {
    const { root } = draw()
    const wrapper = root.firstElementChild!
    const center = Array.from(wrapper.children).find((el) => el.tagName.toLowerCase() !== 'svg')!
    expectClasses(center, 'absolute', 'inset-0', 'flex', 'flex-col', 'items-center', 'justify-center')
    const lines = Array.from(center.children)
    expect(lines.map(textOf)).toEqual(['누적 내원', '2,408건'])
    expectClasses(lines[0], 'text-caption', 'font-semibold', 'text-st-ink-2')
    expectClasses(lines[1], 'text-st-22', 'font-semibold', 'text-st-ink', 'tabular-nums')
  })

  it('AC-4412.1: 크기는 PC 160px(size-40)·휴대폰 124px(max-md:size-31)이다(시안 .s-donut svg)', () => {
    expectClasses(draw().root.firstElementChild, 'size-40', 'max-md:size-31')
  })

  it('AC-4416.3: <pattern>·그라데이션·id·inline style·16진수 색이 없다', () => {
    const { root, html } = draw({ motion: true })
    expect(html).not.toMatch(/<pattern|gradient|url\(#|#[0-9a-f]{3,8}\b/i)
    expect(root.querySelectorAll('[id]')).toHaveLength(0)
    expect(root.querySelectorAll('[style]')).toHaveLength(0)
  })
})

describe('AC-4417.1·AC-4417.2: DonutChart motion — 처음 그릴 때 st-donut(450ms 한 번), 값이 바뀌면 조각이 300ms', () => {
  it('AC-4417.1: motion이면 svg에 st-donut, 조각마다 seg·st-move-period가 붙고 바탕 고리에는 없다', () => {
    const { root } = draw({ motion: true })
    expectClasses(svgOf(root), 'st-donut')
    for (const arc of arcsOf(root)) expectClasses(arc, 'seg', 'st-move-period')
    expect(classesOf(ringOf(root)).filter((c) => c === 'seg' || c.startsWith('st-'))).toEqual([])
  })

  it('AC-4417.1: motion을 주지 않거나 false면 st-donut·seg·st-move-period가 없다(움직이지 않는 도넛)', () => {
    for (const props of [{}, { motion: false }]) {
      const { root, html } = draw(props)
      expect(html).not.toMatch(/st-donut|st-move|\bseg\b/)
      expect(classesOf(svgOf(root))).toEqual(['size-full'])
    }
  })

  it('AC-4417.2·AC-4417.4: motion은 이름만 더한다 — 이름을 빼면 motion 없는 마크업과 같고 animate-*·transition 클래스가 없다', () => {
    const moving = draw({ motion: true }).html
    expect(moving.replace(/ st-donut| seg st-move-period/g, '')).toBe(draw().html)
    expect(moving).not.toMatch(/animate-|transition|animation/)
  })
})
