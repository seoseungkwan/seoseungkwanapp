// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { nestedBoxes } from '@/testing/boxes'
import { RateLineChart, type RatePoint } from './RateLineChart'
import { StackedBarChart } from './StackedBarChart'

// 총환자 대비 꺾은선 (group-exclude REQ-3709 AC-3709.4·AC-3709.8, design.md '그래프 부품' RateLineChart).
// StackedBarChart compact와 같은 틀('(%)' 단위 줄, niceScale 눈금 짝수 번째만, 가로 눈금선, 아래 기간 글자)에
// 값 있는 점을 차례로 잇는 accent 2px 선(값 없는 칸은 건너 이음), HTML 점(8px, accent + 2px surface 테두리), dense가 아니면 점 위 'x.x%' 글.
// 그림은 aria-hidden, 화면 읽기 표는 '기간 | 총환자 대비 | 상태'(값 없으면 '–'). 모양은 시안 docs/mockups/group-exclude/index.html의 polyline·.dot.
// 서버에서 그대로 그리는 부품 → renderToStaticMarkup으로 그린 마크업을 jsdom에 넣어 짜임·클래스·글자·inline style을 본다. 값은 모두 지어낸 것이다

// 7칸: 셋째 칸은 쉬는 날(총환자 0 → 값 없음), 마지막 칸은 일부 기간. 최대 30.1 → niceScale 간격 10, 최대 40
const POINTS: RatePoint[] = [
  { key: 'd1', label: '3', rangeLabel: '11월 3일 (월)', value: 22.5, partial: false },
  { key: 'd2', label: '4', rangeLabel: '11월 4일 (화)', value: 18.3, partial: false },
  { key: 'd3', label: '5', rangeLabel: '11월 5일 (수)', value: null, partial: false },
  { key: 'd4', label: '6', rangeLabel: '11월 6일 (목)', value: 25, partial: false },
  { key: 'd5', label: '7', rangeLabel: '11월 7일 (금)', value: 30.1, partial: false },
  { key: 'd6', label: '8', rangeLabel: '11월 8일 (토)', value: 27.84, partial: false },
  { key: 'd7', label: '9', rangeLabel: '11월 9일 (일)', value: 12, partial: true },
]
const VALUED = [0, 1, 3, 4, 5, 6] // 값 있는 칸
// y = 100 − 값 ÷ 40 × 100 (소수 둘째 자리)
const Y = [43.75, 54.25, 37.5, 24.75, 30.4, 70]
// 점 높이 bottom = 값 ÷ 40 %
const BOTTOM = ['56.25%', '45.75%', '62.5%', '75.25%', '69.6%', '30%']
// 점 위 글: 소수 첫째 자리까지 버림
const TEXT = ['22.5%', '18.3%', '25.0%', '30.1%', '27.8%', '12.0%']
const LABELS = POINTS.map((p) => p.label)

const render = (element: ReactElement) => {
  const html = renderToStaticMarkup(element)
  const root = document.createElement('div')
  root.innerHTML = html
  return { root, html }
}
const chart = (props: Partial<Parameters<typeof RateLineChart>[0]> = {}) =>
  render(<RateLineChart title="기본 PT 일별 총환자 대비" points={POINTS} {...props} />)

const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted))
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const all = (root: Element) => Array.from(root.querySelectorAll('*'))
const leaves = (root: Element) => all(root).filter((el) => el.children.length === 0)
const leafByText = (root: Element, text: string) => leaves(root).filter((el) => textOf(el) === text)
const styleOf = (el: Element) => el.getAttribute('style') ?? ''
const num = (el: Element, name: string) => Number(el.getAttribute(name))

const figureOf = (root: Element) => {
  const figure = root.firstElementChild?.querySelector(':scope > [aria-hidden="true"]')
  expect(figure).toBeTruthy()
  return figure!
}
const tableOf = (root: Element) => {
  const table = root.querySelector('table')
  expect(table).toBeTruthy()
  return table!
}
const gridlines = (figure: Element) => all(figure).filter((el) => classesOf(el).includes('h-px'))
const plotOf = (root: Element) => gridlines(figureOf(root))[0]!.parentElement!
// 점 칸 줄: 그림 칸 안 absolute inset-0 flex. 칸마다 하나
const cellsOf = (root: Element) => {
  const layer = Array.from(plotOf(root).children).find((el) => classesOf(el).includes('flex'))
  expect(layer).toBeTruthy()
  expectClasses(layer, 'absolute', 'inset-0', 'flex')
  return Array.from(layer!.children)
}
// 점 자리(bottom % 하나를 가진 칸 안 요소)
const spotsOf = (root: Element) => cellsOf(root).flatMap((cell) => Array.from(cell.children))
const dotOf = (spot: Element) => {
  const dot = spot.querySelector('svg')
  expect(dot).toBeTruthy()
  return dot!
}
const polylines = (root: Element) => Array.from(figureOf(root).querySelectorAll('polyline'))
const pointsOf = (polyline: Element) =>
  (polyline.getAttribute('points') ?? '')
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
// 그림 칸 바로 안 svg 가운데 점선(stroke-dasharray) line을 가진 것
const trendLines = (root: Element) =>
  Array.from(plotOf(root).children)
    .filter((el) => el.tagName.toLowerCase() === 'svg')
    .flatMap((svg) => Array.from(svg.querySelectorAll('line')))
    .filter((line) => line.hasAttribute('stroke-dasharray'))
const rows = (table: Element) => Array.from(table.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.children).map(textOf))
const dateLabels = (figure: Element) => Array.from(figure.lastElementChild!.children).map((cell) => cell.firstElementChild!)

describe('AC-3709.8: RateLineChart — 그림은 꾸밈(aria-hidden), 숫자는 화면 읽기 표', () => {
  it('AC-3709.8: 그림은 aria-hidden="true" 한 덩어리이고 화면 읽기 표는 그 밖 sr-only 칸 안에 있다', () => {
    const { root } = chart()
    const figure = figureOf(root)
    expect(figure.getAttribute('aria-hidden')).toBe('true')
    const table = tableOf(root)
    expect(table.closest('[aria-hidden="true"]')).toBeNull()
    expect(figure.contains(table)).toBe(false)
    expectClasses(table, 'sr-only')
    expectClasses(table.parentElement, 'sr-only')
    for (const svg of Array.from(figure.querySelectorAll('svg'))) expect(svg.closest('[aria-hidden="true"]')).toBeTruthy()
  })

  it('AC-3709.8: 표 caption은 "<제목> (%)", 머리는 기간 · 총환자 대비 · 상태다', () => {
    const table = tableOf(chart().root)
    expect(textOf(table.querySelector('caption'))).toBe('기본 PT 일별 총환자 대비 (%)')
    expect(Array.from(table.querySelectorAll('thead th')).map(textOf)).toEqual(['기간', '총환자 대비', '상태'])
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.getAttribute('scope'))).toEqual(['col', 'col', 'col'])
  })

  it('AC-3709.8: 칸마다 rangeLabel · x.x%(값 없으면 –) · 완료/일부 기간이고, 칸 이름은 줄 머리(th scope=row)다', () => {
    const table = tableOf(chart().root)
    expect(rows(table)).toEqual([
      ['11월 3일 (월)', '22.5%', '완료'],
      ['11월 4일 (화)', '18.3%', '완료'],
      ['11월 5일 (수)', '–', '완료'],
      ['11월 6일 (목)', '25.0%', '완료'],
      ['11월 7일 (금)', '30.1%', '완료'],
      ['11월 8일 (토)', '27.8%', '완료'],
      ['11월 9일 (일)', '12.0%', '일부 기간'],
    ])
    for (const tr of Array.from(table.querySelectorAll('tbody tr'))) {
      expect(tr.firstElementChild!.tagName).toBe('TH')
      expect(tr.firstElementChild!.getAttribute('scope')).toBe('row')
    }
  })

  it('AC-3709.8: dense·thinLabels·trend여도 표는 같다', () => {
    const base = tableOf(chart().root).outerHTML
    const trend = { from: { at: 0, value: 20 }, to: { at: 6, value: 22 } }
    expect(tableOf(chart({ dense: true, thinLabels: true, trend }).root).outerHTML).toBe(base)
  })
})

describe('AC-3709.4: RateLineChart 틀 — StackedBarChart compact와 같은 단위 줄·눈금·그림 칸·기간 글자', () => {
  it('AC-3709.4: 단위 "(%)"가 맨 앞(위 왼쪽)에 caption muted로 있고 그림 전체가 고정폭 숫자다', () => {
    const figure = figureOf(chart().root)
    const first = leaves(figure).find((el) => textOf(el) !== '')
    expect(textOf(first)).toBe('(%)')
    expectClasses(first!.closest('.text-caption'), 'text-caption', 'text-muted')
    expectClasses(figure, 'tabular-nums')
  })

  it('AC-3709.4: 눈금은 niceScale(30.1) = 0·10·20·30·40의 짝수 번째(0·20·40)만 — 맨 아래 0 선만 line-strong', () => {
    const figure = figureOf(chart().root)
    const lines = gridlines(figure)
    expect(lines.map(styleOf)).toEqual(['bottom:0%', 'bottom:50%', 'bottom:100%'])
    expectClasses(lines[0], 'bg-line-strong')
    expectClasses(lines[1], 'bg-line')
    expectClasses(lines[2], 'bg-line')
    for (const t of ['0', '20', '40']) {
      const tick = leafByText(figure, t)
      expect(tick, t).toHaveLength(1)
      expectClasses(tick[0], 'text-caption', 'text-muted')
    }
    for (const t of ['10', '30']) expect(leafByText(figure, t), t).toHaveLength(0)
    expect(leafByText(figure, '0')[0]!.getAttribute('style')).toBe('bottom:0%')
    expect(leafByText(figure, '40')[0]!.getAttribute('style')).toBe('bottom:100%')
  })

  it('AC-3709.4: 단위 줄·눈금 칸·그림 칸·기간 글자 줄의 클래스가 StackedBarChart compact와 같다', () => {
    const lineRoot = chart().root
    const line = figureOf(lineRoot)
    const bars = figureOf(
      render(
        <StackedBarChart
          title="막대"
          unit="%"
          series={[{ name: '건수', tone: 'accent' }]}
          buckets={[{ key: 'a', label: 'a', rangeLabel: 'a', state: 'complete', values: [1] }]}
          compact
        />,
      ).root,
    )
    // 단위 줄 → (눈금 칸 · 그림 칸) 줄 → 기간 글자 줄
    expect(line.children).toHaveLength(3)
    expect(Array.from(line.children).map((el) => el.getAttribute('class'))).toEqual(Array.from(bars.children).map((el) => el.getAttribute('class')))
    const [lineAxis, linePlot] = Array.from(line.children[1]!.children)
    const [barAxis, barPlot] = Array.from(bars.children[1]!.children)
    expect(lineAxis!.getAttribute('class')).toBe(barAxis!.getAttribute('class'))
    expect(linePlot!.getAttribute('class')).toBe(barPlot!.getAttribute('class'))
    expect(plotOf(lineRoot)).toBe(linePlot)
  })

  it('AC-3709.4: 아래 기간 글자 7개가 칸 순서대로 caption muted이고 칸 폭이 같다(flex-1)', () => {
    const figure = figureOf(chart().root)
    const labels = dateLabels(figure)
    expect(labels.map(textOf)).toEqual(LABELS)
    for (const label of labels) {
      expectClasses(label.parentElement, 'min-w-0', 'flex-1', 'text-center', 'text-caption', 'text-muted')
      expect(classesOf(label)).not.toContain('max-md:invisible')
    }
  })

  it('AC-3709.4: thinLabels면 0부터 홀수 번째 기간 글자만 max-md:invisible이고 글자·칸 수는 그대로다', () => {
    const labels = dateLabels(figureOf(chart({ thinLabels: true }).root))
    expect(labels.map(textOf)).toEqual(LABELS)
    expect(labels.map((label) => classesOf(label).includes('max-md:invisible'))).toEqual([false, true, false, true, false, true, false])
  })
})

describe('AC-3709.4: RateLineChart 꺾은선 — 값 있는 점만 차례로 잇는 accent 2px 선(값 없는 칸은 건너 이음)', () => {
  it('AC-3709.4: 선은 그림 칸 안 aria-hidden svg 하나(absolute inset-0, viewBox 0 0 7 100, preserveAspectRatio none)의 polyline 하나다', () => {
    const { root } = chart()
    const lines = polylines(root)
    expect(lines).toHaveLength(1)
    const svg = lines[0]!.parentElement!
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(svg.parentElement).toBe(plotOf(root))
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expectClasses(svg, 'absolute', 'inset-0', 'size-full')
    expect(svg.getAttribute('viewBox')).toBe('0 0 7 100')
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none')
    expect(svg.hasAttribute('style')).toBe(false)
  })

  it('AC-3709.4: 점은 값 있는 칸만 x = 칸 + 0.5, y = 100 − 값 ÷ 눈금 최대(40) × 100 — 셋째 칸(값 없음)은 건너뛴다', () => {
    const points = pointsOf(polylines(chart().root)[0]!)
    expect(points).toEqual(VALUED.map((at, i) => [at + 0.5, Y[i]]))
  })

  it('AC-3709.4: 선은 2px · vector-effect non-scaling-stroke · 둥근 꺾임 · stroke-accent(토큰 클래스)이고 면·색 속성이 없다', () => {
    const line = polylines(chart().root)[0]!
    expect(line.getAttribute('fill')).toBe('none')
    expect(line.getAttribute('stroke-width')).toBe('2')
    expect(line.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    expect(line.getAttribute('stroke-linejoin')).toBe('round')
    expectClasses(line, 'stroke-accent')
    expect(line.hasAttribute('stroke')).toBe(false)
    expect(line.hasAttribute('stroke-dasharray')).toBe(false)
  })

  it('AC-3709.4: 값 있는 칸이 하나뿐이면 선이 없고 점 하나만 있다', () => {
    const one = POINTS.map((p, i) => (i === 3 ? p : { ...p, value: null }))
    const { root } = chart({ points: one })
    expect(polylines(root)).toHaveLength(0)
    expect(spotsOf(root)).toHaveLength(1)
  })

  it('AC-3709.4: 값이 모두 없으면 선·점·점 글이 없고 눈금은 0 한 줄이며 NaN·Infinity가 없다', () => {
    const none = POINTS.map((p) => ({ ...p, value: null }))
    const { root, html } = chart({ points: none })
    expect(polylines(root)).toHaveLength(0)
    expect(spotsOf(root)).toHaveLength(0)
    expect(cellsOf(root)).toHaveLength(7)
    expect(gridlines(figureOf(root)).map(styleOf)).toEqual(['bottom:0%'])
    expect(html).not.toMatch(/NaN|Infinity/)
    expect(rows(tableOf(root)).map((row) => row[1])).toEqual(POINTS.map(() => '–'))
  })
})

describe('AC-3709.4: RateLineChart 점 — 칸마다 HTML 점(8px, accent + 2px surface 테두리), 값 없는 칸은 점이 없다', () => {
  it('AC-3709.4: 칸은 7개이고 값 있는 칸에만 점 자리 하나가 있으며 높이는 값 ÷ 40 %다(bottom)', () => {
    const { root } = chart()
    const cells = cellsOf(root)
    expect(cells).toHaveLength(7)
    expect(cells.map((cell) => cell.children.length)).toEqual([1, 1, 0, 1, 1, 1, 1])
    for (const cell of cells) expectClasses(cell, 'relative', 'h-full', 'min-w-0', 'flex-1')
    expect(spotsOf(root).map(styleOf)).toEqual(BOTTOM.map((b) => `bottom:${b}`))
  })

  it('AC-3709.4: 점은 8×8 aria-hidden svg 원 하나 — accent 면(fill-accent), 2px surface 테두리(stroke-surface), 색 속성 없음', () => {
    for (const spot of spotsOf(chart().root)) {
      const dot = dotOf(spot)
      expect(dot.getAttribute('width')).toBe('8')
      expect(dot.getAttribute('height')).toBe('8')
      expect(dot.getAttribute('viewBox')).toBe('0 0 8 8')
      expect(dot.children).toHaveLength(1)
      const circle = dot.firstElementChild!
      expect(circle.tagName.toLowerCase()).toBe('circle')
      expect([num(circle, 'cx'), num(circle, 'cy'), num(circle, 'r'), num(circle, 'stroke-width')]).toEqual([4, 4, 3, 2])
      expectClasses(circle, 'fill-accent', 'stroke-surface')
      expect(circle.hasAttribute('fill')).toBe(false)
      expect(circle.hasAttribute('stroke')).toBe(false)
    }
  })

  it('AC-3709.4: 점 가운데가 값 높이·칸 가운데에 온다(왼쪽 반·아래 반 옮김)', () => {
    for (const spot of spotsOf(chart().root)) {
      expectClasses(spot, 'absolute', 'inset-x-0', 'h-0')
      expectClasses(dotOf(spot), 'absolute', 'top-0', 'left-1/2', '-translate-x-1/2', '-translate-y-1/2')
    }
  })

  it('AC-3709.4: dense가 아니면 점 위에 x.x%(소수 첫째 자리까지 버림) 글이 caption ink-2로 있다', () => {
    const spots = spotsOf(chart().root)
    expect(spots.map((spot) => textOf(spot))).toEqual(TEXT)
    for (const spot of spots) {
      const label = spot.querySelector('span')!
      expectClasses(label, 'absolute', 'bottom-0', 'left-1/2', '-translate-x-1/2', 'whitespace-nowrap', 'text-caption', 'text-ink-2')
      // 점(반지름 4px) 위로 6px
      expectClasses(label, 'mb-1.5')
    }
  })

  it('AC-3709.4: dense면 점 위 글만 없다 — 그림이 기본 그림에서 그 글을 지운 것과 같다', () => {
    const base = chart()
    for (const spot of spotsOf(base.root)) spot.querySelector('span')!.remove()
    const dense = chart({ dense: true })
    expect(figureOf(dense.root).outerHTML).toBe(figureOf(base.root).outerHTML)
    for (const t of TEXT) expect(leafByText(figureOf(dense.root), t), t).toHaveLength(0)
    expect(spotsOf(dense.root)).toHaveLength(6)
    expect(polylines(dense.root)).toHaveLength(1)
  })

  it('AC-3709.4: 점은 선과 추세선 위에 그린다(점 칸 줄이 그림 칸의 마지막)', () => {
    const { root } = chart({ trend: { from: { at: 0, value: 20 }, to: { at: 6, value: 22 } } })
    const layer = plotOf(root).lastElementChild!
    expectClasses(layer, 'absolute', 'inset-0', 'flex')
  })
})

describe('AC-3709.4: RateLineChart 추세선 — 막대와 같은 점선(ink 2px), 주지 않으면 없다', () => {
  const TREND = { from: { at: 0, value: 20 }, to: { at: 6, value: 22 } }

  it('AC-3709.4: trend를 주면 그림 칸 안 svg에 점선 line 하나 — x = at + 0.5, y = 100 − 값 ÷ 40 × 100, 6 4 · 2px · non-scaling · stroke-ink', () => {
    const { root } = chart({ trend: TREND })
    const lines = trendLines(root)
    expect(lines).toHaveLength(1)
    const line = lines[0]!
    expect([num(line, 'x1'), num(line, 'y1'), num(line, 'x2'), num(line, 'y2')]).toEqual([0.5, 50, 6.5, 45])
    expect(line.getAttribute('stroke-dasharray')).toBe('6 4')
    expect(line.getAttribute('stroke-width')).toBe('2')
    expect(line.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    expectClasses(line, 'stroke-ink')
    expect(line.hasAttribute('stroke')).toBe(false)
    const svg = line.parentElement!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('viewBox')).toBe('0 0 7 100')
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none')
    expectClasses(svg, 'absolute', 'inset-0', 'size-full')
  })

  it('AC-3709.4: 추세선은 막대 그림의 추세선과 마크업이 같다(같은 칸 수·눈금 최대면)', () => {
    // 꺾은선 눈금 최대 40 = 막대 합계 최대 40(niceScale(40) → 간격 10)
    const bar = render(
      <StackedBarChart
        title="막대"
        unit="건"
        series={[{ name: '건수', tone: 'accent' }]}
        buckets={POINTS.map((p, i) => ({ key: p.key, label: p.label, rangeLabel: p.rangeLabel, state: 'complete', values: [i === 4 ? 40 : 1] }))}
        compact
        trend={TREND}
      />,
    )
    const barSvg = Array.from(gridlines(figureOf(bar.root))[0]!.parentElement!.children).find((el) => el.tagName.toLowerCase() === 'svg')!
    expect(trendLines(chart({ trend: TREND }).root)[0]!.parentElement!.outerHTML).toBe(barSvg.outerHTML)
  })

  it('AC-3709.4: 눈금은 점 값으로만 잡는다 — 추세선 값이 커도 눈금은 0·20·40이다', () => {
    const { root } = chart({ trend: { from: { at: 0, value: 10 }, to: { at: 6, value: 90 } } })
    expect(gridlines(figureOf(root)).map(styleOf)).toEqual(['bottom:0%', 'bottom:50%', 'bottom:100%'])
    expect([num(trendLines(root)[0]!, 'y1'), num(trendLines(root)[0]!, 'y2')]).toEqual([75, -125])
  })

  it('AC-3709.4: trend를 주지 않거나 null이면 점선이 없고 마크업이 같다', () => {
    const none = chart()
    expect(trendLines(none.root)).toHaveLength(0)
    expect(chart({ trend: null }).html).toBe(none.html)
    expect(chart({ trend: undefined }).html).toBe(none.html)
  })
})

describe('AC-3709.4: RateLineChart 모양 규칙 — inline style은 bottom %뿐, pattern·id·상자 없음, 움직임 없음', () => {
  it('AC-3709.4: style은 bottom %(0~100, 소수 둘째 자리)뿐이고 svg에는 style이 없다', () => {
    const { root } = chart({ trend: { from: { at: 0, value: 20 }, to: { at: 6, value: 22 } } })
    const styled = all(root).filter((el) => el.hasAttribute('style'))
    expect(styled.length).toBeGreaterThan(0)
    for (const el of styled) {
      const m = /^bottom:(\d+(?:\.\d{1,2})?)%$/.exec(styleOf(el))
      expect(m, styleOf(el)).toBeTruthy()
      expect(Number(m![1])).toBeLessThanOrEqual(100)
    }
    for (const svg of Array.from(root.querySelectorAll('svg'))) expect(svg.hasAttribute('style')).toBe(false)
  })

  it('AC-3709.4: pattern·id·url(#…)·그라데이션·움직임이 없고 상자 안 상자가 없다', () => {
    const { root, html } = chart({ trend: { from: { at: 0, value: 20 }, to: { at: 6, value: 22 } } })
    expect(html).not.toMatch(/<pattern|gradient/i)
    expect(html).not.toContain('url(#')
    expect(html).not.toMatch(/animate-|transition/)
    expect(root.querySelectorAll('[id]')).toHaveLength(0)
    expect(nestedBoxes(root)).toEqual([])
  })

  it('AC-3709.4: 색은 토큰 클래스로만 준다 — svg 안 fill·stroke 속성은 none뿐이다', () => {
    const { root } = chart({ trend: { from: { at: 0, value: 20 }, to: { at: 6, value: 22 } } })
    for (const el of Array.from(root.querySelectorAll('svg *'))) {
      for (const attr of ['fill', 'stroke']) {
        const value = el.getAttribute(attr)
        if (value !== null) expect(value, `${el.tagName} ${attr}`).toBe('none')
      }
    }
  })
})
