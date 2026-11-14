// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { cleanup, fireEvent, render as mount } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nestedBoxes } from '@/testing/boxes'
import { StackedBarChart, type BarBucket, type BarSeries } from './StackedBarChart'

// 쌓은 막대 (b2b-redesign REQ-205 AC-205.4, design.md '차트 부품'(HTML 막대·빗금 svg·sr-only 표), UI_GUIDE '차트').
// 서버에서 그대로 그리는 부품 → renderToStaticMarkup으로 그린 마크업을 jsdom에 넣어 짜임·클래스·글자·inline style을 본다(보이는 모양은 Phase 끝 사진).
// 예시 값은 시안 docs/mockups/b2b-redesign/parts.mjs의 WEEKS 8주(마지막 주 집계 중, 합계 최대 714명)를 이 시험 안에 적은 것이다

const SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '재진', tone: 'chart-3' },
]
const WEEKS: [key: string, range: string, newPatients: number, returning: number, note?: string][] = [
  ['9.7', '9월 7일 – 13일', 112, 524],
  ['9.14', '9월 14일 – 20일', 118, 538],
  ['9.21', '9월 21일 – 27일', 92, 431, '추석 연휴'],
  ['9.28', '9월 28일 – 10월 4일', 121, 556],
  ['10.5', '10월 5일 – 11일', 109, 521, '한글날'],
  ['10.12', '10월 12일 – 18일', 126, 571],
  ['10.19', '10월 19일 – 25일', 131, 583],
  ['10.26', '10월 26일 – 11월 1일', 98, 452],
]
const BUCKETS: BarBucket[] = WEEKS.map(([key, range, n, r, note], i) => ({
  key,
  label: key,
  rangeLabel: range,
  state: i === WEEKS.length - 1 ? 'in-progress' : 'complete',
  values: [n, r],
  ...(note ? { note } : {}),
}))
const TOTALS = WEEKS.map(([, , n, r]) => n + r) // 636 656 523 677 630 697 714 550
const LABELS = WEEKS.map(([key]) => key)

const pct = (v: number, max: number) => Number(((v / max) * 100).toFixed(2))

const render = (element: ReactElement) => {
  const html = renderToStaticMarkup(element)
  const root = document.createElement('div')
  root.innerHTML = html
  return { root, html }
}
const chart = (props: Partial<Parameters<typeof StackedBarChart>[0]> = {}) =>
  render(<StackedBarChart title="주별 환자 수" unit="명" series={SERIES} buckets={BUCKETS} {...props} />)

const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted))
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const all = (root: Element) => Array.from(root.querySelectorAll('*'))
// 자식 요소가 없는 요소(글자가 직접 든 곳)
const leaves = (root: Element) => all(root).filter((el) => el.children.length === 0)
const leafByText = (root: Element, text: string) => leaves(root).filter((el) => textOf(el) === text)
const oneLeaf = (root: Element, text: string) => {
  const found = leafByText(root, text)
  expect(found, text).toHaveLength(1)
  return found[0]!
}

// 그림(aria-hidden)과 화면 읽기 표
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
// 가로 눈금선(1px 높이)
const gridlines = (figure: Element) => all(figure).filter((el) => classesOf(el).includes('h-px'))
// 막대: 칸 폭의 반(w-1/2). 순서는 칸 순서
const bars = (figure: Element) => all(figure).filter((el) => classesOf(el).includes('w-1/2'))
// 쌓은 조각: 막대 바로 안에서 높이 %를 가진 것
const segmentsOf = (bar: Element) => Array.from(bar.children).filter((el) => el.hasAttribute('style'))
const styleOf = (el: Element) => el.getAttribute('style') ?? ''
const bottomOf = (el: Element) => styleOf(el.closest('[style]') ?? el)

// 높이를 정한 클래스(h-N = N×4px, h-[Npx])의 px. 없으면 null
const fixedHeightPx = (el: Element): number | null => {
  for (const token of classesOf(el)) {
    const step = /^h-(\d+(?:\.\d+)?)$/.exec(token)
    if (step) return Number(step[1]) * 4
    const px = /^h-\[(\d+(?:\.\d+)?)px\]$/.exec(token)
    if (px) return Number(px[1])
  }
  return null
}
// 빗금 path의 d를 'M0 k L k 0' 조각으로 나눈 k 목록. 다른 명령이 섞이면 null
const hatchKs = (d: string): number[] | null => {
  const re = /M\s*0[\s,]+(\d+(?:\.\d+)?)\s*L\s*(\d+(?:\.\d+)?)[\s,]+0/g
  const ks: number[] = []
  for (const m of d.matchAll(re)) {
    if (m[1] !== m[2]) return null
    ks.push(Number(m[1]))
  }
  return d.replace(re, '').trim() === '' ? ks : null
}
// 화면 읽기 표 몸통 줄마다 칸 글자
const rows = (table: Element) => Array.from(table.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.children).map(textOf))
const K_EXPECTED = Array.from({ length: 110 }, (_, i) => 4 * (i + 1)) // 4, 8, …, 440

describe('AC-205.4: StackedBarChart 눈금 — niceScale(714) → 0·200·400·600·800, compact는 0·400·800', () => {
  it('AC-205.4: 기본은 가로 눈금선 다섯 줄이고 맨 아래 0 선만 line-strong, 나머지는 line이다(bottom %)', () => {
    const lines = gridlines(figureOf(chart().root))
    expect(lines).toHaveLength(5)
    expect(lines.map(styleOf)).toEqual(['bottom:0%', 'bottom:25%', 'bottom:50%', 'bottom:75%', 'bottom:100%'])
    expectClasses(lines[0], 'bg-line-strong')
    for (const line of lines.slice(1)) {
      expectClasses(line, 'bg-line')
      expect(classesOf(line)).not.toContain('bg-line-strong')
    }
  })

  it('AC-205.4: 눈금 글자는 0·200·400·600·800이고 caption muted·고정폭이며 눈금선과 같은 높이(bottom %)에 있다', () => {
    const figure = figureOf(chart().root)
    const ticks = ['0', '200', '400', '600', '800'].map((t) => oneLeaf(figure, t))
    expect(ticks.map(bottomOf)).toEqual(['bottom:0%', 'bottom:25%', 'bottom:50%', 'bottom:75%', 'bottom:100%'])
    for (const tick of ticks) {
      expectClasses(tick.closest('.text-caption'), 'text-caption', 'text-muted')
      expect(tick.closest('.tabular-nums')).toBeTruthy()
    }
  })

  it('AC-205.4: compact는 0·400·800 세 줄과 그 글자만 그린다', () => {
    const figure = figureOf(chart({ compact: true }).root)
    const lines = gridlines(figure)
    expect(lines.map(styleOf)).toEqual(['bottom:0%', 'bottom:50%', 'bottom:100%'])
    expectClasses(lines[0], 'bg-line-strong')
    expectClasses(lines[1], 'bg-line')
    expectClasses(lines[2], 'bg-line')
    for (const t of ['0', '400', '800']) oneLeaf(figure, t)
    for (const t of ['200', '600']) expect(leafByText(figure, t), t).toHaveLength(0)
  })
})

describe('AC-205.4: StackedBarChart 그림 — aria-hidden, 가로 눈금선만, 단위·눈금·기간 글자', () => {
  it('AC-205.4: 그림은 aria-hidden="true" 한 덩어리이고 화면 읽기 표는 그 밖에 있다', () => {
    const { root } = chart()
    const figure = figureOf(root)
    expect(figure.getAttribute('aria-hidden')).toBe('true')
    const table = tableOf(root)
    expect(table.closest('[aria-hidden="true"]')).toBeNull()
    expect(figure.contains(table)).toBe(false)
  })

  it('AC-205.4: 단위 "(명)"이 맨 앞(위 왼쪽)에 caption muted로 있다', () => {
    const figure = figureOf(chart().root)
    const first = leaves(figure).find((el) => textOf(el) !== '')
    expect(textOf(first)).toBe('(명)')
    expectClasses(first!.closest('.text-caption'), 'text-caption', 'text-muted')
  })

  it('AC-205.4: 막대 아래 기간 글자 8개가 칸 순서대로 caption muted·고정폭으로 있다', () => {
    const figure = figureOf(chart().root)
    const found = leaves(figure).filter((el) => LABELS.includes(textOf(el)))
    expect(found.map(textOf)).toEqual(LABELS)
    for (const label of found) {
      expectClasses(label.closest('.text-caption'), 'text-caption', 'text-muted')
      expect(label.closest('.tabular-nums'), textOf(label)).toBeTruthy()
    }
  })

  it('AC-205.4: 세로 선·바깥 테두리가 없다 — 테두리 클래스는 빗금 막대에만 있고 1px 폭 세로 선이 없다', () => {
    const { root } = chart()
    const bordered = all(root).filter((el) => classesOf(el).some((c) => /^(?:\w+:)?border(?:-|$)/.test(c)))
    expect(bordered.length).toBeGreaterThan(0)
    for (const el of bordered) expect(el.querySelector('svg'), classesOf(el).join(' ')).toBeTruthy()
    expect(all(root).filter((el) => classesOf(el).includes('w-px'))).toHaveLength(0)
    expect(classesOf(root.firstElementChild).some((c) => c.startsWith('border'))).toBe(false)
    expect(nestedBoxes(root)).toEqual([])
  })

  it('AC-205.4: 그림 칸(눈금선이 든 곳) 높이는 클래스로 정하고 400px을 넘지 않는다 — 막대는 모두 그 안에 있다', () => {
    for (const compact of [false, true]) {
      const figure = figureOf(chart({ compact }).root)
      const plot = gridlines(figure)[0]!.parentElement!
      const height = fixedHeightPx(plot)
      expect(height, `compact=${compact}`).not.toBeNull()
      expect(height!).toBeGreaterThan(0)
      expect(height!).toBeLessThanOrEqual(400)
      expect(styleOf(plot)).toBe('')
      for (const bar of bars(figure)) expect(plot.contains(bar)).toBe(true)
    }
  })
})

describe('AC-205.4: StackedBarChart 막대 — 높이 = 합계/최대 %, 첫 계열이 맨 위, 계열 사이 2px, 폭은 칸의 반(최대 40px, compact 20px)', () => {
  it('AC-205.4: 칸마다 막대 하나이고 높이는 합계/800 %다(714 → 89.25%, 550 → 68.75%)', () => {
    const list = bars(figureOf(chart().root))
    expect(list).toHaveLength(8)
    expect(list.map(styleOf)).toEqual(TOTALS.map((t) => `height:${pct(t, 800)}%`))
    expect(styleOf(list[6]!)).toBe('height:89.25%')
    expect(styleOf(list[7]!)).toBe('height:68.75%')
    expect(styleOf(list[1]!)).toBe('height:82%')
  })

  it('AC-205.4: 막대 폭은 칸의 반이고 최대 40px이다(compact 20px)', () => {
    for (const bar of bars(figureOf(chart().root))) expectClasses(bar, 'w-1/2', 'max-w-10')
    for (const bar of bars(figureOf(chart({ compact: true }).root))) {
      expectClasses(bar, 'w-1/2', 'max-w-5')
      expect(classesOf(bar)).not.toContain('max-w-10')
    }
  })

  it('AC-205.4: complete 막대는 계열을 쌓는다 — 첫 계열(신환·accent)이 맨 위, 재진(chart-3)이 아래, 사이 2px(gap-0.5)', () => {
    const list = bars(figureOf(chart().root))
    WEEKS.slice(0, 7).forEach(([key, , n, r], i) => {
      const bar = list[i]!
      expectClasses(bar, 'flex', 'flex-col', 'gap-0.5')
      expect(classesOf(bar)).not.toContain('flex-col-reverse')
      const segments = segmentsOf(bar)
      expect(segments, key).toHaveLength(2)
      expectClasses(segments[0], 'bg-accent')
      expectClasses(segments[1], 'bg-chart-3')
      expect(segments.map(styleOf), key).toEqual([`height:${pct(n, n + r)}%`, `height:${pct(r, n + r)}%`])
    })
    expect(segmentsOf(list[6]!).map(styleOf)).toEqual(['height:18.35%', 'height:81.65%'])
  })

  it('AC-205.4: 막대 위 합계 글자는 caption ink-2·고정폭이고 마지막 complete 칸(10.19 · 714)만 600 ink다', () => {
    const figure = figureOf(chart().root)
    const list = bars(figure)
    TOTALS.forEach((total, i) => {
      const label = oneLeaf(list[i]!.parentElement!, String(total))
      expect(label.closest('.tabular-nums'), String(total)).toBeTruthy()
      expectClasses(label.closest('.text-caption'), 'text-caption')
      if (i === 6) {
        expectClasses(label, 'font-semibold', 'text-ink')
        expect(classesOf(label)).not.toContain('text-ink-2')
      } else {
        expectClasses(label, 'text-ink-2')
        expect(classesOf(label), String(total)).not.toContain('font-semibold')
      }
    })
  })

  it('AC-205.4: 완료 칸이 없으면 굵은 합계가 없다', () => {
    const buckets = BUCKETS.map((b) => ({ ...b, state: 'partial' as const }))
    const figure = figureOf(chart({ buckets }).root)
    expect(all(figure).filter((el) => classesOf(el).includes('font-semibold'))).toHaveLength(0)
  })
})

describe('AC-205.4: StackedBarChart 집계 중·일부 기간 — 한 막대 + 빗금 path 하나(패턴·id 없음) + 1px accent 테두리', () => {
  const hatched = (root: Element) => bars(figureOf(root))[7]!

  it('AC-205.4: 집계 중 칸은 쌓지 않은 한 막대이고 1px accent 테두리를 쓴다 — 막대가 relative라 안의 absolute svg가 막대를 채운다', () => {
    const bar = hatched(chart().root)
    expect(segmentsOf(bar)).toHaveLength(0)
    expectClasses(bar, 'relative', 'border', 'border-accent')
    expect(styleOf(bar)).toBe('height:68.75%')
    expect(bar.querySelector('.bg-accent, .bg-chart-3')).toBeNull()
  })

  it('AC-205.4: 빗금은 막대 안 viewBox 없는 aria-hidden svg 하나(absolute inset-0 size-full, style·크기 속성 없음)다', () => {
    const bar = hatched(chart().root)
    const svgs = bar.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    const svg = svgs[0]!
    expect(svg.parentElement).toBe(bar)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expectClasses(svg, 'absolute', 'inset-0', 'size-full')
    for (const attr of ['viewBox', 'style', 'width', 'height', 'id']) expect(svg.hasAttribute(attr), attr).toBe(false)
  })

  it('AC-205.4: 빗금 선은 accent 1px <path stroke="currentColor"> 하나이고 d는 M0 k L k 0을 k = 4, 8, …, 440까지 잇는다', () => {
    const svg = hatched(chart().root).querySelector('svg')!
    expect(svg.children).toHaveLength(1)
    const path = svg.querySelector('path')!
    expect(svg.firstElementChild).toBe(path)
    expect(path.getAttribute('stroke')).toBe('currentColor')
    expect(path.getAttribute('stroke-width')).toBe('1')
    expect(path.getAttribute('fill')).toBe('none')
    expect(svg.closest('.text-accent')).toBeTruthy()
    const ks = hatchKs(path.getAttribute('d') ?? '')
    expect(ks).toEqual(K_EXPECTED)
    expect(ks!.at(-1)).toBe(440)
  })

  it('AC-205.4: 마지막 선 k = 440이 폭 40px·높이 400px 막대까지 덮는다 — 그림 칸 높이 + 최대 막대 폭 ≤ 440', () => {
    for (const compact of [false, true]) {
      const figure = figureOf(chart({ compact }).root)
      const plotHeight = fixedHeightPx(gridlines(figure)[0]!.parentElement!)!
      const maxBarWidth = compact ? 20 : 40
      expect(plotHeight + maxBarWidth).toBeLessThanOrEqual(440)
    }
  })

  it('AC-205.4: <pattern>·url(#…)·id가 없다 — 한 쪽에 차트가 둘이어도 겹칠 id가 없다', () => {
    const { root, html } = render(
      <div>
        <StackedBarChart title="주별 환자 수" unit="명" series={SERIES} buckets={BUCKETS} />
        <StackedBarChart title="주별 환자 수 (예시)" unit="명" series={SERIES} buckets={BUCKETS} compact />
      </div>,
    )
    expect(html).not.toMatch(/<pattern/i)
    expect(html).not.toContain('url(#')
    expect(root.querySelectorAll('[id]')).toHaveLength(0)
    expect(root.querySelectorAll('svg')).toHaveLength(2)
  })

  it('AC-205.4: 기본 크기에서는 집계 중 막대 위(합계 위)에 "집계 중"이 붙는다', () => {
    const bar = hatched(chart().root)
    const column = bar.parentElement!
    const state = oneLeaf(column, '집계 중')
    expectClasses(state.closest('.text-caption'), 'text-caption')
    expectClasses(state, 'text-muted')
    const total = oneLeaf(column, '550')
    expect(state.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-205.4: partial 칸도 빗금 한 막대이고 위에 "일부 기간"이 붙는다', () => {
    const buckets = BUCKETS.map((b, i) => (i === 7 ? { ...b, state: 'partial' as const } : b))
    const figure = figureOf(chart({ buckets }).root)
    const bar = bars(figure)[7]!
    expect(segmentsOf(bar)).toHaveLength(0)
    expectClasses(bar, 'relative', 'border', 'border-accent')
    expect(hatchKs(bar.querySelector('svg path')?.getAttribute('d') ?? '')).toEqual(K_EXPECTED)
    oneLeaf(bar.parentElement!, '일부 기간')
    expect(leafByText(figure, '집계 중')).toHaveLength(0)
  })

  it('AC-205.4: complete 막대에는 빗금 svg·테두리가 없다', () => {
    for (const bar of bars(figureOf(chart().root)).slice(0, 7)) {
      expect(bar.querySelector('svg')).toBeNull()
      expect(classesOf(bar)).not.toContain('border')
    }
  })
})

describe('AC-205.4: StackedBarChart note·compact', () => {
  it('AC-205.4: 기본 크기에서 note가 있으면 기간 글자 아래 한 줄 더 나온다(muted)', () => {
    const figure = figureOf(chart().root)
    for (const [label, note] of [
      ['9.21', '추석 연휴'],
      ['10.5', '한글날'],
    ]) {
      const noteEl = oneLeaf(figure, note!)
      expectClasses(noteEl.closest('.text-muted'), 'text-muted')
      const labelEl = oneLeaf(figure, label!)
      expect(labelEl.parentElement).toBe(noteEl.parentElement)
      expect(labelEl.compareDocumentPosition(noteEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('AC-205.4: compact에서는 note와 "집계 중" 글자가 빠지고 막대·합계·기간 글자는 남는다', () => {
    const figure = figureOf(chart({ compact: true }).root)
    for (const gone of ['추석 연휴', '한글날', '집계 중']) expect(leafByText(figure, gone), gone).toHaveLength(0)
    expect(bars(figure)).toHaveLength(8)
    for (const total of TOTALS) oneLeaf(figure, String(total))
    expect(leaves(figure).filter((el) => LABELS.includes(textOf(el))).map(textOf)).toEqual(LABELS)
    expect(bars(figure)[7]!.querySelector('svg path')).toBeTruthy()
  })

  it('AC-205.4: compact에서도 partial 글자 "일부 기간"은 그림에서 빠진다(표에는 남는다)', () => {
    const buckets = BUCKETS.map((b, i) => (i === 7 ? { ...b, state: 'partial' as const } : b))
    const { root } = chart({ buckets, compact: true })
    expect(leafByText(figureOf(root), '일부 기간')).toHaveLength(0)
    expect(textOf(tableOf(root))).toContain('일부 기간')
  })
})

describe('AC-205.4: StackedBarChart 화면 읽기 표(sr-only)', () => {
  it('AC-601.18: 표를 sr-only 칸이 감싼다 — 표의 sr-only만으로는 1px 제한이 안 먹어 줄 수만큼 길어지고 쪽 아래에 빈 곳이 생긴다', () => {
    const { root } = chart()
    const box = tableOf(root).parentElement!
    expect(box.tagName).toBe('DIV')
    expect(classesOf(box)).toEqual(['sr-only'])
    expect(box.parentElement).toBe(root.firstElementChild) // 부품 맨 바깥 바로 아래, 그림과 나란히
  })

  it('AC-205.4: caption "<제목> (<단위>)", 머리 "기간 · 계열 이름들 · 합계 · 상태"', () => {
    const table = tableOf(chart().root)
    expectClasses(table, 'sr-only')
    expect(textOf(table.querySelector('caption'))).toBe('주별 환자 수 (명)')
    expect(Array.from(table.querySelectorAll('thead th')).map(textOf)).toEqual(['기간', '신환', '재진', '합계', '상태'])
  })

  it('AC-205.4: 줄마다 rangeLabel · 계열 값 · 합계 · "완료"/"집계 중"', () => {
    const table = tableOf(chart().root)
    expect(rows(table)).toEqual(
      WEEKS.map(([, range, n, r], i) => [range, String(n), String(r), String(n + r), i === 7 ? '집계 중' : '완료']),
    )
  })

  it('AC-205.4: partial 줄은 상태가 "일부 기간"이고, compact여도 표는 같다', () => {
    const buckets = BUCKETS.map((b, i) => (i === 7 ? { ...b, state: 'partial' as const } : b))
    const table = tableOf(chart({ buckets, compact: true }).root)
    expect(rows(table).at(-1)).toEqual(['10월 26일 – 11월 1일', '98', '452', '550', '일부 기간'])
    expect(textOf(table.querySelector('caption'))).toBe('주별 환자 수 (명)')
  })

  it('AC-205.4: 표의 큰 숫자는 세 자리 쉼표 글자다', () => {
    const buckets: BarBucket[] = [{ key: 'a', label: 'a', rangeLabel: '가', state: 'complete', values: [1200, 34] }]
    expect(rows(tableOf(chart({ buckets }).root))).toEqual([['가', '1,200', '34', '1,234', '완료']])
  })
})

describe('AC-205.4: StackedBarChart inline style — height·bottom의 % 값(0~100, 소수 둘째 자리)뿐', () => {
  it.each([false, true])('AC-205.4: style은 height·bottom %뿐이다(compact=%s)', (compact) => {
    const { root } = chart({ compact })
    const styled = all(root).filter((el) => el.hasAttribute('style'))
    expect(styled.length).toBeGreaterThan(0)
    for (const el of styled) {
      const m = /^(height|bottom):(\d+(?:\.\d{1,2})?)%$/.exec(styleOf(el))
      expect(m, styleOf(el)).toBeTruthy()
      const value = Number(m![2])
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    }
    for (const svg of Array.from(root.querySelectorAll('svg'))) expect(svg.hasAttribute('style')).toBe(false)
  })
})

describe('AC-205.4: StackedBarChart 합계가 모두 0인 차트', () => {
  const ZERO: BarBucket[] = [
    { key: '1', label: '1', rangeLabel: '첫 주', state: 'complete', values: [0, 0] },
    { key: '2', label: '2', rangeLabel: '둘째 주', state: 'complete', values: [0, 0] },
    { key: '3', label: '3', rangeLabel: '셋째 주', state: 'in-progress', values: [0, 0] },
  ]

  it('AC-205.4: 눈금은 0 한 줄(line-strong)이고 막대 높이는 모두 0%, 합계 글자는 "0"이다', () => {
    const { root, html } = chart({ buckets: ZERO })
    const figure = figureOf(root)
    const lines = gridlines(figure)
    expect(lines).toHaveLength(1)
    expect(styleOf(lines[0]!)).toBe('bottom:0%')
    expectClasses(lines[0], 'bg-line-strong')
    expect(bars(figure).map(styleOf)).toEqual(['height:0%', 'height:0%', 'height:0%'])
    // 눈금 "0" 하나 + 막대 위 합계 "0" 셋
    expect(leafByText(figure, '0')).toHaveLength(4)
    expect(html).not.toMatch(/NaN|Infinity/)
    expect(rows(tableOf(root))).toEqual([
      ['첫 주', '0', '0', '0', '완료'],
      ['둘째 주', '0', '0', '0', '완료'],
      ['셋째 주', '0', '0', '0', '집계 중'],
    ])
  })
})

// ── StackedBarChart 촘촘한 막대 dense (tab-frame REQ-314 AC-314.2, design.md '차트 부품').
// 칸이 많은 그림(예: 90일)에서 막대 위 합계·상태 글자를 뺀다. 아래 날짜 글자 고르기는 부르는 쪽이 label로 한다(빈 label = 빈칸).
// 옵션을 주지 않으면 마크업이 REQ-314 전과 한 글자도 같다

const sha256 = async (text: string) => (await import('node:crypto')).createHash('sha256').update(text).digest('hex')
// AC-601.18이 표를 감싼 칸 하나만 더했다. 그 칸을 되돌리면 아래 고정값과 한 글자도 같아야 한다(다른 곳이 같이 바뀌면 잡는다)
const withoutTableBox = (html: string) => html.replace('<div class="sr-only"><table class="sr-only">', '<table class="sr-only">').replace('</table></div>', '</table>')
// REQ-314 전 마크업의 sha256(BUCKETS 기본 · compact)
const BEFORE_REQ_314 = {
  md: 'd6d72732841dc07a6bad0bd93d754c501380b1f689e7f70060abf7e323fe87df',
  sm: 'd58044063fdca2a15500c558558be14cc8b1eb7d91ca2afd1272f1445c8a39c6',
}
// 막대 위 글자 덩어리(합계·상태): 막대 바로 안의 absolute bottom-full
const aboveBar = (bar: Element) => Array.from(bar.children).filter((el) => classesOf(el).includes('bottom-full'))
// 일곱째 칸은 일부 기간, 마지막 칸은 집계 중 — 상태 글자 둘이 다 나오는 자료
const MIXED = BUCKETS.map((b, i) => (i === 6 ? { ...b, state: 'partial' as const } : b))
const MIXED_STATE = WEEKS.map((_, i) => (i === 7 ? '집계 중' : i === 6 ? '일부 기간' : '완료'))

describe('AC-314.2: StackedBarChart dense — 막대 위 합계·상태 글자 없음, 화면 읽기 표는 그대로', () => {
  it('AC-314.2: dense면 막대 위 합계·상태 글자가 없다 — 막대 안에 글자가 없고 굵은 합계도 없다', () => {
    const figure = figureOf(chart({ buckets: MIXED, dense: true }).root)
    const list = bars(figure)
    expect(list).toHaveLength(8)
    for (const bar of list) {
      expect(aboveBar(bar)).toEqual([])
      expect(bar.querySelector('span')).toBeNull()
      expect(textOf(bar)).toBe('')
    }
    for (const gone of ['집계 중', '일부 기간', ...TOTALS.map(String)]) expect(leafByText(figure, gone), gone).toHaveLength(0)
    expect(all(figure).filter((el) => classesOf(el).includes('font-semibold'))).toHaveLength(0)
  })

  it('AC-314.2: dense는 막대 위 글자만 뺀다 — 그림이 기본 그림에서 그 글자 덩어리를 지운 것과 같다(기본·compact)', () => {
    for (const compact of [false, true]) {
      const base = figureOf(chart({ buckets: MIXED, compact }).root)
      for (const bar of bars(base)) {
        const above = aboveBar(bar)
        expect(above).toHaveLength(1)
        above[0]!.remove()
      }
      expect(figureOf(chart({ buckets: MIXED, compact, dense: true }).root).outerHTML, `compact=${compact}`).toBe(base.outerHTML)
    }
  })

  it('AC-314.2: dense여도 화면 읽기 표는 모든 칸의 기간·계열 값·합계·상태를 준다 — 표가 기본과 같다', () => {
    const table = tableOf(chart({ buckets: MIXED, dense: true }).root)
    expectClasses(table, 'sr-only')
    expect(textOf(table.querySelector('caption'))).toBe('주별 환자 수 (명)')
    expect(Array.from(table.querySelectorAll('thead th')).map(textOf)).toEqual(['기간', '신환', '재진', '합계', '상태'])
    expect(rows(table)).toEqual(WEEKS.map(([, range, n, r], i) => [range, String(n), String(r), String(n + r), MIXED_STATE[i]]))
    expect(table.outerHTML).toBe(tableOf(chart({ buckets: MIXED }).root).outerHTML)
  })

  it('AC-314.2: label이 빈 칸은 아래 날짜 글자가 빈칸이다 — 칸 수·막대·표 줄은 그대로', () => {
    // 칸이 많을 때 부르는 쪽이 몇 칸에만 날짜를 준다(여기서는 첫째·다섯째 칸)
    const shown = new Set([0, 4])
    const buckets = BUCKETS.map((b, i) => (shown.has(i) ? b : { ...b, label: '' }))
    const { root } = chart({ buckets, dense: true })
    const figure = figureOf(root)
    const labelRow = figure.lastElementChild! // 그림의 마지막 줄 = 기간 글자 줄
    const cells = Array.from(labelRow.children)
    expect(cells).toHaveLength(8)
    expect(cells.map((cell) => textOf(cell.firstElementChild))).toEqual(BUCKETS.map((b, i) => (shown.has(i) ? b.label : '')))
    expect(leaves(figure).filter((el) => LABELS.includes(textOf(el))).map(textOf)).toEqual(['9.7', '10.5'])
    expect(bars(figure)).toHaveLength(8)
    expect(rows(tableOf(root)).map((row) => row[0])).toEqual(WEEKS.map(([, range]) => range))
  })

  it('AC-314.2: dense를 주지 않거나 false면 막대마다 위 글자가 있고 마크업이 REQ-314 전과 한 글자도 같다(sha256)', async () => {
    for (const compact of [false, true]) {
      expect(chart({ compact, dense: false }).html, `compact=${compact}`).toBe(chart({ compact }).html)
      for (const bar of bars(figureOf(chart({ compact }).root))) expect(aboveBar(bar)).toHaveLength(1)
    }
    expect(await sha256(withoutTableBox(chart().html))).toBe(BEFORE_REQ_314.md)
    expect(await sha256(withoutTableBox(chart({ compact: true }).html))).toBe(BEFORE_REQ_314.sm)
  })
})

// ---------- ui-90 AC-421.2: thinLabels — 768px 미만에서 날짜 글자를 하나 걸러 보인다 ----------

// 아래 날짜 글자 줄(그림의 마지막 줄)의 칸마다 첫 글자 p
const dateLabels = (figure: Element) => Array.from(figure.lastElementChild!.children).map((cell) => cell.firstElementChild!)

describe('AC-421.2: StackedBarChart thinLabels — 768px 미만은 날짜 글자가 하나 걸러 보이고, 주지 않으면 지금 그림 그대로', () => {
  it('AC-421.2: thinLabels면 둘째·넷째·…(0부터 홀수 번째) 날짜 글자만 max-md:invisible이고, 글자·칸 수는 그대로다(시안 skip: 9.7 · 9.21 · 10.5 · 10.19만 보임)', () => {
    for (const compact of [false, true]) {
      const labels = dateLabels(figureOf(chart({ compact, thinLabels: true }).root))
      expect(labels, `compact=${compact}`).toHaveLength(8)
      expect(labels.map(textOf)).toEqual(LABELS)
      expect(labels.map((p) => classesOf(p).includes('max-md:invisible')), `compact=${compact}`).toEqual(LABELS.map((_, i) => i % 2 === 1))
      const shown = labels.filter((p) => !classesOf(p).includes('max-md:invisible')).map(textOf)
      expect(shown).toEqual(['9.7', '9.21', '10.5', '10.19'])
      // 768px 이상에서는 모두 보인다(숨김은 max-md: 하나뿐)
      for (const p of labels) expect(classesOf(p).filter((c) => /(^|:)(hidden|invisible|sr-only)$/.test(c) && c !== 'max-md:invisible')).toEqual([])
    }
  })

  it('AC-421.2: thinLabels는 날짜 글자의 클래스 하나만 더한다 — 그 클래스를 빼면 기본 그림과 한 글자도 같고, 화면 읽기 표는 그대로다', () => {
    for (const compact of [false, true]) {
      const thin = chart({ compact, thinLabels: true })
      expect(thin.html.replace(/ max-md:invisible/g, ''), `compact=${compact}`).toBe(chart({ compact }).html)
      expect(tableOf(thin.root).outerHTML).toBe(tableOf(chart({ compact }).root).outerHTML)
    }
  })

  it('AC-421.2: thinLabels를 주지 않거나 false면 숨는 날짜 글자가 없고 마크업이 지금과 같다(sha256)', async () => {
    for (const compact of [false, true]) {
      expect(chart({ compact, thinLabels: false }).html, `compact=${compact}`).toBe(chart({ compact }).html)
      expect(chart({ compact }).html).not.toContain('invisible')
    }
    expect(await sha256(withoutTableBox(chart().html))).toBe(BEFORE_REQ_314.md)
    expect(await sha256(withoutTableBox(chart({ compact: true }).html))).toBe(BEFORE_REQ_314.sm)
  })
})

// 비교 막대 (stats REQ-513 AC-513.2, design.md TASK-13, 시안 docs/mockups/stats/gen.py의 .pv). 지금 시험은 고치지 않고 여기에 더한다
describe('AC-513.2: comparison — 쌓은 막대 왼쪽의 가는 비교 기간 막대', () => {
  const THREE = BUCKETS.slice(0, 3) // 합계 636 · 656 · 523
  const withComparison = (values: (number | null | undefined)[]) => THREE.map((bucket, i) => ({ ...bucket, comparison: values[i] }))
  const faintBars = (root: Element) => Array.from(figureOf(root).querySelectorAll('.bg-faint'))
  const cellOf = (root: Element, i: number) => {
    const cells = figureOf(root).querySelector('.absolute.inset-0.flex')?.children
    expect(cells).toBeTruthy()
    return cells![i]!
  }

  it('AC-513.2: 숫자를 주면 칸마다 가는 bg-faint 막대가 쌓은 막대 왼쪽에 보이고 높이가 눈금 대비 %다', () => {
    const { root } = chart({ buckets: withComparison([400, 500, 300]) })
    const bars = faintBars(root)
    expect(bars).toHaveLength(3)
    // 눈금 최대는 지금처럼 합계 656으로 정해져 800이다
    expect((bars[0] as HTMLElement).style.height).toBe(`${pct(400, 800)}%`)
    expect((bars[2] as HTMLElement).style.height).toBe(`${pct(300, 800)}%`)
    const cell = cellOf(root, 0)
    expect(cell.firstElementChild).toBe(bars[0])
    expect(cell.children).toHaveLength(2)
  })

  it('AC-513.2: 눈금은 합계와 숫자인 comparison 가운데 가장 큰 값으로 정해진다', () => {
    const { root } = chart({ buckets: withComparison([900, null, 100]) }) // 900 → 간격 250, 최대 1,000
    expect(leafByText(figureOf(root), '1,000')).toHaveLength(1)
    expect((faintBars(root)[0] as HTMLElement).style.height).toBe('90%')
    const stack = cellOf(root, 0).lastElementChild as HTMLElement
    expect(stack.style.height).toBe(`${pct(636, 1000)}%`)
  })

  it('AC-513.2: null과 값 없는 칸은 비교 막대를 그리지 않고 눈금에도 넣지 않는다', () => {
    const { root } = chart({ buckets: withComparison([400, null, undefined]) })
    expect(faintBars(root)).toHaveLength(1)
    expect(cellOf(root, 1).querySelector('.bg-faint')).toBeNull()
    expect(cellOf(root, 2).querySelector('.bg-faint')).toBeNull()
    expect(leafByText(figureOf(root), '800')).toHaveLength(1)
  })

  it('AC-513.2: 숫자 0도 값이다(비교 막대 높이 0%), 눈금은 그대로다', () => {
    const { root } = chart({ buckets: withComparison([0, null, null]) })
    expect(faintBars(root)).toHaveLength(1)
    expect((faintBars(root)[0] as HTMLElement).style.height).toBe('0%')
  })

  it('AC-513.2: 숫자가 있는 칸이 있으면 화면 읽기 표에 "비교 기간" 칸이 하나 붙고 null은 "–"다', () => {
    const { root } = chart({ buckets: withComparison([1200, null, 300]) })
    const table = root.querySelector('table')!
    expect(Array.from(table.querySelectorAll('thead th')).map(textOf)).toEqual(['기간', '신환', '재진', '합계', '상태', '비교 기간'])
    const rows = Array.from(table.querySelectorAll('tbody tr'))
    expect(textOf(rows[0]!.lastElementChild)).toBe('1,200')
    expect(textOf(rows[1]!.lastElementChild)).toBe('–')
    expect(textOf(rows[2]!.lastElementChild)).toBe('300')
  })

  it('AC-513.2: 주지 않으면 지금과 결과가 같다 — 모두 null이어도 그림·표가 한 글자도 다르지 않다', () => {
    const plain = chart({ buckets: THREE }).html
    expect(chart({ buckets: withComparison([null, null, null]) }).html).toBe(plain)
    expect(chart({ buckets: withComparison([undefined, undefined, undefined]) }).html).toBe(plain)
    expect(plain).not.toContain('bg-faint')
    expect(plain).not.toContain('비교 기간')
  })

  it('AC-513.2: 비교 막대가 있어도 빗금 칸과 작은 그림이 그대로 그려진다(움직임 없음)', () => {
    const buckets = withComparison([100, 200, 300]).map((bucket, i) => (i === 0 ? { ...bucket, state: 'partial' as const } : bucket))
    const { root, html } = chart({ buckets, compact: true, dense: true })
    expect(faintBars(root)).toHaveLength(3)
    const hatchedCell = cellOf(root, 0)
    expect(hatchedCell.firstElementChild).toBe(faintBars(root)[0])
    const hatched = hatchedCell.lastElementChild
    expectClasses(hatched, 'border', 'border-accent')
    expect(hatched!.querySelectorAll('svg path')).toHaveLength(1)
    expect(cellOf(root, 1).querySelector('svg')).toBeNull()
    expect(html).not.toMatch(/animate-|transition/)
  })
})

// 구분 없음 빗금 조각 (rx-picker REQ-806 AC-806.4, design.md '차트 부품', 시안 docs/mockups/rx-picker/index.html의 .s-gap). 지금 시험은 고치지 않고 여기에 더한다.
// 예시 값은 지어낸 것이다
const SPLIT_SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '재진', tone: 'chart-3' },
  { name: '구분 없음', tone: 'hatch-warning' },
]
const SPLIT_BUCKETS: BarBucket[] = [
  { key: 'd1', label: '1', rangeLabel: '11월 1일', state: 'complete', values: [10, 25, 5] }, // 합계 40, 눈금 최대 40
  { key: 'd2', label: '2', rangeLabel: '11월 2일', state: 'complete', values: [8, 12, 0] }, // 구분 없음 0
  { key: 'd3', label: '3', rangeLabel: '11월 3일', state: 'in-progress', values: [3, 4, 3] }, // 덜 끝난 칸
]
const splitChart = (props: Partial<Parameters<typeof StackedBarChart>[0]> = {}) => chart({ series: SPLIT_SERIES, buckets: SPLIT_BUCKETS, ...props })
const gapSegment = (root: Element) => segmentsOf(bars(figureOf(root))[0]!)[2]!

describe('AC-806.4: hatch-warning 계열 — 쌓은 막대의 구분 없음 조각(bg-warning-soft + text-warning 빗금 path)', () => {
  it('AC-806.4: 구분 없음은 신환·재진 아래 셋째 조각이고 바탕은 bg-warning-soft, 1px warning 테두리(시안 .s-gap), 높이는 값/합계 %다', () => {
    const list = bars(figureOf(splitChart().root))
    const segments = segmentsOf(list[0]!)
    expect(segments).toHaveLength(3)
    expectClasses(segments[0], 'bg-accent')
    expectClasses(segments[1], 'bg-chart-3')
    expectClasses(segments[2], 'relative', 'w-full', 'border', 'border-warning', 'bg-warning-soft')
    expect(segments.map(styleOf)).toEqual(['height:25%', 'height:62.5%', 'height:12.5%'])
    expect(styleOf(list[0]!)).toBe('height:100%')
  })

  it('AC-806.4: 빗금은 조각 안 viewBox 없는 aria-hidden svg 하나(absolute inset-0 size-full, text-warning)다', () => {
    const segment = gapSegment(splitChart().root)
    const svgs = segment.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    const svg = svgs[0]!
    expect(svg.parentElement).toBe(segment)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expectClasses(svg, 'absolute', 'inset-0', 'size-full', 'text-warning')
    for (const attr of ['viewBox', 'style', 'width', 'height', 'id']) expect(svg.hasAttribute(attr), attr).toBe(false)
  })

  it('AC-806.4: 빗금 선은 1px <path stroke="currentColor"> 하나이고 d는 덜 끝난 칸의 파란 빗금과 같은 HATCH다', () => {
    const { root } = splitChart()
    const svg = gapSegment(root).querySelector('svg')!
    expect(svg.children).toHaveLength(1)
    const path = svg.querySelector('path')!
    expect(path.getAttribute('stroke')).toBe('currentColor')
    expect(path.getAttribute('stroke-width')).toBe('1')
    expect(path.getAttribute('fill')).toBe('none')
    const d = path.getAttribute('d') ?? ''
    expect(hatchKs(d)).toEqual(K_EXPECTED)
    expect(d).toBe(bars(figureOf(root))[2]!.querySelector('path')!.getAttribute('d'))
  })

  it('AC-806.4: <pattern>·url(#…)·id·그라데이션이 없다 — 한 쪽에 차트가 둘이어도 겹칠 id가 없다', () => {
    const { root, html } = splitChart()
    expect(html).not.toMatch(/<pattern|<linearGradient|gradient/i)
    expect(html).not.toContain('url(#')
    expect(root.querySelectorAll('[id]')).toHaveLength(0)
  })

  it('AC-806.4: 구분 없음이 0인 칸은 조각·빗금이 없고 신환·재진만 쌓는다', () => {
    const bar = bars(figureOf(splitChart().root))[1]!
    const segments = segmentsOf(bar)
    expect(segments).toHaveLength(2)
    expect(segments.map(styleOf)).toEqual(['height:40%', 'height:60%'])
    expect(bar.querySelector('svg')).toBeNull()
    expect(bar.outerHTML).not.toContain('warning')
  })

  it('AC-806.4: 덜 끝난 칸은 구분 없음이 있어도 파란 빗금 한 막대이고 높이에는 구분 없음까지 든다', () => {
    const bar = bars(figureOf(splitChart().root))[2]!
    expectClasses(bar, 'border', 'border-accent', 'bg-surface')
    expect(styleOf(bar)).toBe('height:25%')
    expect(segmentsOf(bar)).toEqual([])
    expect(bar.querySelectorAll('svg')).toHaveLength(1)
    expectClasses(bar.querySelector('svg'), 'text-accent')
    expect(bar.outerHTML).not.toContain('warning')
  })

  it('AC-806.4: 작은 그림(compact)에서도 같은 조각이다', () => {
    const segment = gapSegment(splitChart({ compact: true }).root)
    expectClasses(segment, 'border-warning', 'bg-warning-soft')
    expectClasses(segment.querySelector('svg'), 'text-warning')
  })

  it('AC-806.4: 화면 읽기 표에 구분 없음 칸이 있고 합계에 든다', () => {
    const table = tableOf(splitChart().root)
    expect(Array.from(table.querySelectorAll('thead th')).map(textOf)).toEqual(['기간', '신환', '재진', '구분 없음', '합계', '상태'])
    expect(rows(table)).toEqual([
      ['11월 1일', '10', '25', '5', '40', '완료'],
      ['11월 2일', '8', '12', '0', '20', '완료'],
      ['11월 3일', '3', '4', '3', '10', '집계 중'],
    ])
  })

  it('AC-806.4: hatch-warning 계열을 쓰지 않으면 warning 색이 없고 마크업이 지금과 같다(sha256)', async () => {
    expect(chart().html).not.toContain('warning')
    expect(await sha256(withoutTableBox(chart().html))).toBe(BEFORE_REQ_314.md)
    expect(await sha256(withoutTableBox(chart({ compact: true }).html))).toBe(BEFORE_REQ_314.sm)
  })
})

// 합계 0인 칸의 글자 빼기 (rx-picker REQ-806 AC-806.7, design.md '차트 부품', 시안 :496 x.c > 0). 예시 값은 지어낸 것이다.
// 30칸, 3칸마다 0건(1일·4일·…·28일)이고 마지막 칸(30일)은 건수가 있다
const MONTH_BUCKETS: BarBucket[] = Array.from({ length: 30 }, (_, i) => ({
  key: `d${i + 1}`,
  label: String(i + 1),
  rangeLabel: `11월 ${i + 1}일`,
  state: 'complete' as const,
  values: i % 3 === 0 ? [0, 0] : [i + 1, 2],
}))
const monthTotal = (i: number) => MONTH_BUCKETS[i]!.values[0]! + MONTH_BUCKETS[i]!.values[1]!
const zeroAt = (buckets: BarBucket[], i: number, state: BarBucket['state']): BarBucket[] =>
  buckets.map((bucket, j) => (j === i ? { ...bucket, state, values: [0, 0] } : bucket))

describe('AC-806.7: StackedBarChart hideZeroTotals — 합계 0인 칸에는 막대 위 글자가 없고, 주지 않으면 지금 그림 그대로', () => {
  it('AC-806.7: 30칸(dense 없음)에서 건수가 있는 칸은 막대 위 글자가 있고 0인 칸은 없다', () => {
    const list = bars(figureOf(chart({ buckets: MONTH_BUCKETS, hideZeroTotals: true }).root))
    expect(list).toHaveLength(30)
    list.forEach((bar, i) => {
      const above = aboveBar(bar)
      if (monthTotal(i) === 0) {
        expect(above, `${i + 1}일`).toEqual([])
        expect(textOf(bar), `${i + 1}일`).toBe('')
      } else {
        expect(above, `${i + 1}일`).toHaveLength(1)
        expect(textOf(above[0]), `${i + 1}일`).toBe(String(monthTotal(i)))
      }
    })
  })

  it('AC-806.7: hideZeroTotals는 0인 칸의 글자 덩어리만 뺀다 — 그림이 기본 그림에서 그 덩어리를 지운 것과 같다(기본·compact)', () => {
    for (const compact of [false, true]) {
      const base = figureOf(chart({ buckets: MONTH_BUCKETS, compact }).root)
      bars(base).forEach((bar, i) => {
        if (monthTotal(i) === 0) aboveBar(bar)[0]!.remove()
      })
      expect(figureOf(chart({ buckets: MONTH_BUCKETS, compact, hideZeroTotals: true }).root).outerHTML, `compact=${compact}`).toBe(base.outerHTML)
    }
  })

  it('AC-806.7: hideZeroTotals여도 화면 읽기 표는 0인 칸까지 모두 준다 — 표가 기본과 같다', () => {
    const on = tableOf(chart({ buckets: MONTH_BUCKETS, hideZeroTotals: true }).root)
    expect(on.outerHTML).toBe(tableOf(chart({ buckets: MONTH_BUCKETS }).root).outerHTML)
    expect(rows(on)[0]).toEqual(['11월 1일', '0', '0', '0', '완료'])
  })

  it('AC-806.7: 덜 끝난 칸이 0이면 상태 글자까지 없고 표에는 남는다. 0이 아니면 상태 글자가 그대로다', () => {
    const buckets = zeroAt(MONTH_BUCKETS.slice(0, 3), 2, 'in-progress')
    const { root } = chart({ buckets, hideZeroTotals: true })
    const figure = figureOf(root)
    expect(aboveBar(bars(figure)[2]!)).toEqual([])
    expect(leafByText(figure, '집계 중')).toEqual([])
    expect(rows(tableOf(root))[2]).toEqual(['11월 3일', '0', '0', '0', '집계 중'])

    const partial = MONTH_BUCKETS.slice(1, 3).map((bucket) => ({ ...bucket, state: 'partial' as const }))
    const shown = figureOf(chart({ buckets: partial, hideZeroTotals: true }).root)
    expect(leafByText(shown, '일부 기간')).toHaveLength(2)
  })

  it('AC-806.7: 글자 색은 그대로다 — 마지막 끝난 칸은 600 ink, 나머지는 ink-2(thinTotals가 text-ink-2만 숨긴다)', () => {
    const list = bars(figureOf(chart({ buckets: MONTH_BUCKETS, hideZeroTotals: true }).root))
    const strong = oneLeaf(list[29]!, String(monthTotal(29)))
    expectClasses(strong, 'font-semibold', 'text-ink')
    expect(classesOf(strong)).not.toContain('text-ink-2')
    expectClasses(oneLeaf(list[28]!, String(monthTotal(28))), 'text-ink-2')
    expect(figureOf(chart({ buckets: MONTH_BUCKETS, hideZeroTotals: true }).root).querySelectorAll('.font-semibold')).toHaveLength(1)
  })

  it('AC-806.7: 마지막 끝난 칸이 0이면 그 칸에 글자가 없고 앞 칸이 대신 굵어지지 않는다(시안 :488·:496과 같다)', () => {
    const buckets = zeroAt(MONTH_BUCKETS, 29, 'complete')
    const figure = figureOf(chart({ buckets, hideZeroTotals: true }).root)
    expect(aboveBar(bars(figure)[29]!)).toEqual([])
    expect(figure.querySelectorAll('.font-semibold')).toHaveLength(0)
    expectClasses(oneLeaf(bars(figure)[28]!, String(monthTotal(28))), 'text-ink-2')
  })

  it('AC-806.7: 합계가 모두 0이면 막대 위 글자가 없고 막대 높이는 0%, 눈금은 그대로다', () => {
    const buckets = MONTH_BUCKETS.slice(0, 3).map((bucket) => ({ ...bucket, values: [0, 0] }))
    const { root, html } = chart({ buckets, hideZeroTotals: true })
    const list = bars(figureOf(root))
    for (const bar of list) {
      expect(aboveBar(bar)).toEqual([])
      expect(styleOf(bar)).toBe('height:0%')
    }
    expect(gridlines(figureOf(root))).toHaveLength(1)
    expect(html).not.toMatch(/NaN|Infinity/)
  })

  it('AC-806.7: dense와 같이 줘도 막대 위 글자가 없고 표는 그대로다', () => {
    const both = chart({ buckets: MONTH_BUCKETS, dense: true, hideZeroTotals: true })
    expect(both.html).toBe(chart({ buckets: MONTH_BUCKETS, dense: true }).html)
  })

  it('AC-806.7: 주지 않거나 false면 0인 칸에도 "0" 글자가 있고 마크업이 지금과 같다(sha256)', async () => {
    for (const compact of [false, true]) {
      expect(chart({ compact, hideZeroTotals: false }).html, `compact=${compact}`).toBe(chart({ compact }).html)
      expect(chart({ buckets: MONTH_BUCKETS, compact, hideZeroTotals: false }).html, `compact=${compact}`).toBe(chart({ buckets: MONTH_BUCKETS, compact }).html)
    }
    expect(textOf(aboveBar(bars(figureOf(chart({ buckets: MONTH_BUCKETS }).root))[0]!)[0])).toBe('0')
    expect(await sha256(withoutTableBox(chart().html))).toBe(BEFORE_REQ_314.md)
    expect(await sha256(withoutTableBox(chart({ compact: true }).html))).toBe(BEFORE_REQ_314.sm)
  })
})

// 빈 칸 blank (stats-period REQ-1704 AC-1704.3, design.md '숫자'·TASK-9). 고른 기간의 막대는 칸을 모두 만든다.
// no-data = 자료 없는 칸: 막대·합계 자리에 '–'(muted)이고 화면 읽기 표도 계열·합계·상태가 '–'다(0이 아니다).
// future = 앞으로 올 달: 달 글자만 있는 빈 칸이고 화면 읽기 표에 없다. 눈금은 진짜 칸만으로 잡는다. 지금 시험은 고치지 않고 여기에 더한다.
// 예시 값은 지어낸 것이다
describe('AC-1704.3: StackedBarChart blank — 자료 없는 칸은 "–", 앞으로 올 칸은 글자만, 주지 않으면 지금 그림 그대로', () => {
  // 3칸 진짜(합계 636 · 656 · 523) + 자료 없음 1칸 + 앞으로 올 칸 1칸
  const BLANKS: BarBucket[] = [
    ...BUCKETS.slice(0, 3),
    { key: 'n', label: 'N', rangeLabel: '자료 없는 주', state: 'partial', values: [0, 0], blank: 'no-data' },
    { key: 'f', label: 'F', rangeLabel: '앞으로 올 주', state: 'partial', values: [0, 0], blank: 'future' },
  ]
  const cellsOf = (root: Element) => {
    const cells = figureOf(root).querySelector('.absolute.inset-0.flex')?.children
    expect(cells).toBeTruthy()
    return Array.from(cells!)
  }

  it('AC-1704.3: no-data 칸은 막대가 없고 막대 자리에 "–"(caption muted, 고정폭) 하나만 있다 — 0이 아니다', () => {
    const { root } = chart({ buckets: BLANKS })
    const cell = cellsOf(root)[3]!
    expect(cell.querySelector('.w-1\\/2')).toBeNull()
    expect(textOf(cell)).toBe('–')
    const dash = oneLeaf(cell, '–')
    expectClasses(dash, 'text-caption', 'text-muted')
    expect(dash.closest('.tabular-nums')).toBeTruthy()
    expect(leafByText(cell, '0')).toHaveLength(0)
    expect(cell.querySelector('svg')).toBeNull()
  })

  it('AC-1704.3: future 칸은 막대·글자가 없는 빈 칸이고 아래 기간 글자는 남는다', () => {
    const { root } = chart({ buckets: BLANKS })
    const cell = cellsOf(root)[4]!
    expect(cell.children).toHaveLength(0)
    expect(textOf(cell)).toBe('')
    expect(dateLabels(figureOf(root)).map(textOf)).toEqual(['9.7', '9.14', '9.21', 'N', 'F'])
  })

  it('AC-1704.3: 진짜 칸 셋만 막대가 있고 칸 수는 다섯이다', () => {
    const { root } = chart({ buckets: BLANKS })
    expect(cellsOf(root)).toHaveLength(5)
    expect(bars(figureOf(root))).toHaveLength(3)
    expect(bars(figureOf(root)).map(styleOf)).toEqual(TOTALS.slice(0, 3).map((t) => `height:${pct(t, 800)}%`))
  })

  it('AC-1704.3: 화면 읽기 표 — no-data 줄은 계열·합계·상태가 "–"이고 future 줄은 없다', () => {
    const table = tableOf(chart({ buckets: BLANKS }).root)
    expect(rows(table)).toEqual([
      ...WEEKS.slice(0, 3).map(([, range, n, r]) => [range, String(n), String(r), String(n + r), '완료']),
      ['자료 없는 주', '–', '–', '–', '–'],
    ])
  })

  it('AC-1704.3: 화면 읽기 표 — no-data 줄의 상태 칸은 칸의 state와 상관없이 "–"다(막대 자리처럼 상태 글이 없다)', () => {
    for (const state of ['partial', 'complete', 'in-progress'] as const) {
      const buckets = BLANKS.map((b) => (b.blank === 'no-data' ? { ...b, state } : b))
      const table = tableOf(chart({ buckets }).root)
      expect(rows(table)[3], state).toEqual(['자료 없는 주', '–', '–', '–', '–'])
      expect(leafByText(table, '일부 기간'), state).toHaveLength(0)
    }
  })

  it('AC-1704.3: 눈금은 진짜 칸만으로 잡는다 — 빈 칸의 값·비교 값이 커도 0·200·400·600·800이고 빈 칸에는 비교 막대가 없다', () => {
    const buckets = BLANKS.map((b) => (b.blank ? { ...b, values: [5000, 5000], comparison: 9000 } : b))
    const { root } = chart({ buckets })
    const figure = figureOf(root)
    expect(gridlines(figure).map(styleOf)).toEqual(['bottom:0%', 'bottom:25%', 'bottom:50%', 'bottom:75%', 'bottom:100%'])
    for (const t of ['0', '200', '400', '600', '800']) oneLeaf(figure, t)
    expect(figure.querySelectorAll('.bg-faint')).toHaveLength(0)
    expect(textOf(cellsOf(root)[3])).toBe('–')
    expect(cellsOf(root)[4]!.children).toHaveLength(0)
    // 진짜 칸에 비교 값이 없으니 표에 "비교 기간" 칸도 없다
    expect(Array.from(tableOf(root).querySelectorAll('thead th')).map(textOf)).toEqual(['기간', '신환', '재진', '합계', '상태'])
    expect(rows(tableOf(root))[3]).toEqual(['자료 없는 주', '–', '–', '–', '–'])
  })

  it('AC-1704.3: 진짜 칸에 비교 값이 있으면 no-data 줄의 비교 기간 칸도 "–"다', () => {
    const buckets = BLANKS.map((b, i) => (i === 0 ? { ...b, comparison: 400 } : b.blank ? { ...b, comparison: 300 } : b))
    const { root } = chart({ buckets })
    expect(figureOf(root).querySelectorAll('.bg-faint')).toHaveLength(1)
    expect(rows(tableOf(root))).toHaveLength(4)
    expect(rows(tableOf(root))[3]).toEqual(['자료 없는 주', '–', '–', '–', '–', '–'])
  })

  it('AC-1704.3: 굵은 합계는 마지막 진짜 완료 칸이다 — 뒤의 빈 칸이 complete여도 굵어지지 않는다', () => {
    const buckets = BLANKS.map((b) => (b.blank ? { ...b, state: 'complete' as const } : b))
    const figure = figureOf(chart({ buckets }).root)
    const strong = Array.from(figure.querySelectorAll('.font-semibold'))
    expect(strong.map(textOf)).toEqual(['523'])
  })

  it('AC-1704.3: dense·compact·hideZeroTotals여도 no-data 칸의 "–"는 남고 future 칸은 비어 있다', () => {
    for (const props of [{ dense: true }, { compact: true }, { hideZeroTotals: true }, { dense: true, compact: true, thinLabels: true }]) {
      const { root } = chart({ buckets: BLANKS, ...props })
      expect(textOf(cellsOf(root)[3]), JSON.stringify(props)).toBe('–')
      expect(cellsOf(root)[4]!.children, JSON.stringify(props)).toHaveLength(0)
      expect(rows(tableOf(root)), JSON.stringify(props)).toHaveLength(4)
    }
  })

  it('AC-1704.3: 칸이 모두 빈 칸이어도 눈금 0 한 줄이고 NaN·Infinity가 없다', () => {
    const buckets = BLANKS.slice(3)
    const { root, html } = chart({ buckets })
    expect(gridlines(figureOf(root))).toHaveLength(1)
    expect(bars(figureOf(root))).toHaveLength(0)
    expect(html).not.toMatch(/NaN|Infinity/)
    expect(rows(tableOf(root))).toEqual([['자료 없는 주', '–', '–', '–', '–']])
  })

  it('AC-1704.3: blank를 주지 않거나 undefined면 마크업이 지금과 같다(sha256, 대시보드·미리보기 그대로)', async () => {
    const undef = BUCKETS.map((b) => ({ ...b, blank: undefined }))
    for (const compact of [false, true]) expect(chart({ buckets: undef, compact }).html, `compact=${compact}`).toBe(chart({ compact }).html)
    expect(await sha256(withoutTableBox(chart().html))).toBe(BEFORE_REQ_314.md)
    expect(await sha256(withoutTableBox(chart({ compact: true }).html))).toBe(BEFORE_REQ_314.sm)
    expect(leafByText(figureOf(chart().root), '–')).toHaveLength(0)
  })
})

// 화면 읽기 표 끄기 srTable (dashboard-ux REQ-2706 AC-2706.1, design.md §7). 보이는 표(ChartTable)를 펼친 동안 부르는 쪽이 false를 준다(두 번 읽히지 않게).
// 기본 true라 통계 탭·미리보기 그림은 한 글자도 바뀌지 않는다(위 sha256 시험도 그대로 본다). 예시 값은 지어낸 것이다
describe('AC-2706.1: StackedBarChart srTable — 기본은 지금 그대로, false면 화면 읽기 표만 없다', () => {
  const MIXED: BarBucket[] = [
    { ...BUCKETS[0]!, comparison: 500 },
    BUCKETS[1]!,
    { key: 'n', label: 'N', rangeLabel: '자료 없는 주', state: 'partial', values: [0, 0], blank: 'no-data' },
    { key: 'f', label: 'F', rangeLabel: '앞으로 올 주', state: 'partial', values: [0, 0], blank: 'future' },
  ]
  const CASES: Array<[string, Partial<Parameters<typeof StackedBarChart>[0]>]> = [
    ['기본', {}],
    ['compact', { compact: true }],
    ['dense · thinLabels · hideZeroTotals', { dense: true, thinLabels: true, hideZeroTotals: true }],
    ['빈 칸 · 비교 값', { buckets: MIXED }],
  ]
  // 화면 읽기 표를 감싼 칸(<div class="sr-only"><table …>…</table></div>) 하나
  const SR_BOX = /<div class="sr-only"><table class="sr-only">[\s\S]*<\/table><\/div>/

  it.each(CASES)('AC-2706.1: %s — srTable을 주지 않은 것과 true는 마크업이 같다', (_name, props) => {
    expect(chart({ ...props, srTable: true }).html).toBe(chart(props).html)
  })

  it.each(CASES)('AC-2706.1: %s — srTable false는 화면 읽기 표 칸 하나만 빠지고 그림은 한 글자도 같다', (_name, props) => {
    const now = chart(props).html
    expect(now.match(SR_BOX)).toHaveLength(1)
    const off = chart({ ...props, srTable: false })
    expect(off.html).toBe(now.replace(SR_BOX, ''))
    expect(off.root.querySelector('table')).toBeNull()
    expect(off.root.querySelector('.sr-only')).toBeNull()
  })
})

// ── 막대 위 추세선 trend (group-exclude REQ-3709 AC-3709.3, design.md '그래프 부품'). 시안 docs/mockups/group-exclude/index.html의 svg.over 점선이다.
// 그림 칸 안 absolute inset-0 svg 하나(viewBox 0 0 {칸 수} 100, preserveAspectRatio none)에 점선 line 하나: x = at + 0.5, y = 100 − 값 ÷ 눈금 최대 × 100.
// 점선 6 4 · 2px · vector-effect non-scaling-stroke · stroke-ink. 눈금은 막대로만 잡는다. 주지 않거나 null이면 지금 그림과 한 글자도 다르지 않다. 값은 지어낸 것이다
describe('AC-3709.3: StackedBarChart trend — 그림 칸 안 점선 추세선 하나, 주지 않으면 지금 그림 그대로', () => {
  // BUCKETS 8칸, 눈금 최대 800: 600 → y 25, 700 → y 12.5
  const TREND = { from: { at: 0, value: 600 }, to: { at: 7, value: 700 } }
  const plotOf = (root: Element) => gridlines(figureOf(root))[0]!.parentElement!
  // 그림 칸 바로 안의 svg(막대 안 빗금 svg는 들지 않는다)
  const trendSvgs = (root: Element) => Array.from(plotOf(root).children).filter((el) => el.tagName.toLowerCase() === 'svg')
  const trendSvg = (root: Element) => {
    const found = trendSvgs(root)
    expect(found).toHaveLength(1)
    return found[0]!
  }
  const numAttr = (el: Element, name: string) => Number(el.getAttribute(name))

  it('AC-3709.3: trend를 주지 않거나 null·undefined면 마크업이 지금과 한 글자도 같다(sha256)', async () => {
    for (const compact of [false, true]) {
      const now = chart({ compact }).html
      expect(chart({ compact, trend: null }).html, `compact=${compact}`).toBe(now)
      expect(chart({ compact, trend: undefined }).html, `compact=${compact}`).toBe(now)
      expect(trendSvgs(chart({ compact }).root)).toHaveLength(0)
    }
    expect(await sha256(withoutTableBox(chart({ trend: null }).html))).toBe(BEFORE_REQ_314.md)
    expect(await sha256(withoutTableBox(chart({ compact: true, trend: null }).html))).toBe(BEFORE_REQ_314.sm)
  })

  it('AC-3709.3: trend를 주면 그림 칸 바로 안에 aria-hidden svg 하나가 칸을 채운다(absolute inset-0, viewBox 0 0 8 100, preserveAspectRatio none)', () => {
    for (const compact of [false, true]) {
      const { root } = chart({ compact, trend: TREND })
      const svg = trendSvg(root)
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expectClasses(svg, 'absolute', 'inset-0', 'size-full')
      expect(svg.getAttribute('viewBox')).toBe('0 0 8 100')
      expect(svg.getAttribute('preserveAspectRatio')).toBe('none')
      expect(svg.hasAttribute('style')).toBe(false)
      expect(svg.hasAttribute('width')).toBe(false)
      expect(svg.hasAttribute('height')).toBe(false)
      // 막대 뒤에 있어 막대 위에 그려진다
      expect(plotOf(root).lastElementChild).toBe(svg)
    }
  })

  it('AC-3709.3: 선은 line 하나 — x = at + 0.5, y = 100 − 값 ÷ 눈금 최대(800) × 100', () => {
    const svg = trendSvg(chart({ trend: TREND }).root)
    expect(svg.children).toHaveLength(1)
    const line = svg.firstElementChild!
    expect(line.tagName.toLowerCase()).toBe('line')
    expect([numAttr(line, 'x1'), numAttr(line, 'y1'), numAttr(line, 'x2'), numAttr(line, 'y2')]).toEqual([0.5, 25, 7.5, 12.5])
  })

  it('AC-3709.3: 선은 점선(6 4) · 2px · vector-effect non-scaling-stroke · stroke-ink(토큰 클래스)이고 색 속성이 없다', () => {
    const line = trendSvg(chart({ trend: TREND }).root).firstElementChild!
    expect(line.getAttribute('stroke-dasharray')).toBe('6 4')
    expect(line.getAttribute('stroke-width')).toBe('2')
    expect(line.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    expectClasses(line, 'stroke-ink')
    expect(line.hasAttribute('stroke')).toBe(false)
    expect(['none', null]).toContain(line.getAttribute('fill'))
  })

  it('AC-3709.3: 가운데 칸에서 시작·끝나는 선도 같은 식이다(compact도 눈금 최대는 같다)', () => {
    for (const compact of [false, true]) {
      const line = trendSvg(chart({ compact, trend: { from: { at: 2, value: 200 }, to: { at: 5, value: 524 } } }).root).firstElementChild!
      expect([numAttr(line, 'x1'), numAttr(line, 'y1'), numAttr(line, 'x2'), numAttr(line, 'y2')], `compact=${compact}`).toEqual([2.5, 75, 5.5, 34.5])
    }
  })

  it('AC-3709.3: 눈금은 막대로만 잡는다 — 선 값이 눈금 최대를 넘거나 음수여도 눈금은 그대로이고 선이 그림 칸 밖으로 나간다(잘림)', () => {
    const big = { from: { at: 0, value: -100 }, to: { at: 7, value: 1000 } }
    const { root } = chart({ trend: big })
    expect(gridlines(figureOf(root)).map(styleOf)).toEqual(['bottom:0%', 'bottom:25%', 'bottom:50%', 'bottom:75%', 'bottom:100%'])
    expect(leafByText(figureOf(root), '1,000')).toHaveLength(0)
    const line = trendSvg(root).firstElementChild!
    expect([numAttr(line, 'y1'), numAttr(line, 'y2')]).toEqual([112.5, -25])
    // 잘리게 둔다: svg 넘침을 보이게 하는 클래스가 없다
    expect(classesOf(trendSvg(root)).some((c) => c.startsWith('overflow'))).toBe(false)
  })

  it('AC-3709.3: trend는 svg 하나만 더한다 — 그 svg를 빼면 그림이 지금 그림과 한 글자도 같고, 화면 읽기 표도 그대로다', () => {
    const cases: Array<Partial<Parameters<typeof StackedBarChart>[0]>> = [
      {},
      { compact: true },
      { compact: true, dense: true, thinLabels: true, hideZeroTotals: true },
      { buckets: BUCKETS.map((b, i) => ({ ...b, comparison: i === 2 ? null : 500 })) },
    ]
    for (const props of cases) {
      const base = chart(props)
      const withTrend = chart({ ...props, trend: TREND })
      trendSvg(withTrend.root).remove()
      expect(figureOf(withTrend.root).outerHTML).toBe(figureOf(base.root).outerHTML)
      expect(tableOf(withTrend.root).outerHTML).toBe(tableOf(base.root).outerHTML)
    }
  })

  it('AC-3709.3: 합계가 모두 0이면(눈금 최대 0) 선은 맨 아래(y 100)이고 NaN·Infinity가 없다', () => {
    const zero: BarBucket[] = [
      { key: '1', label: '1', rangeLabel: '첫 주', state: 'complete', values: [0, 0] },
      { key: '2', label: '2', rangeLabel: '둘째 주', state: 'complete', values: [0, 0] },
    ]
    const { root, html } = chart({ buckets: zero, trend: { from: { at: 0, value: 0 }, to: { at: 1, value: 0 } } })
    const line = trendSvg(root).firstElementChild!
    expect(trendSvg(root).getAttribute('viewBox')).toBe('0 0 2 100')
    expect([numAttr(line, 'x1'), numAttr(line, 'y1'), numAttr(line, 'x2'), numAttr(line, 'y2')]).toEqual([0.5, 100, 1.5, 100])
    expect(html).not.toMatch(/NaN|Infinity/)
  })

  it('AC-3709.3: 좌표는 소수 둘째 자리까지다', () => {
    // 눈금 최대 800: 100 ÷ 3 → y 95.83(100 − 4.1666…)
    const line = trendSvg(chart({ trend: { from: { at: 0, value: 100 / 3 }, to: { at: 7, value: 2000 / 3 } } }).root).firstElementChild!
    expect([numAttr(line, 'y1'), numAttr(line, 'y2')]).toEqual([95.83, 16.67])
  })

  it('AC-3709.3: 추세선이 있어도 pattern·id·url(#…)·그라데이션이 없다(한 쪽에 그림이 둘이어도 겹치지 않는다)', () => {
    const { root, html } = chart({ trend: TREND })
    expect(html).not.toMatch(/<pattern|gradient/i)
    expect(html).not.toContain('url(#')
    expect(root.querySelectorAll('[id]')).toHaveLength(0)
    expect(nestedBoxes(root)).toEqual([])
  })
})

// ── first90 통계 화면 차트 기반 (REQ-4416·REQ-4417, design.md 5-4, 시안 docs/mockups/first90/redesign.html). 예시 값은 지어낸 것이다.
// 새 tone f90·ret·rough, 칸 mark 'unchecked'(점선 칸 + "확인 필요"), 선택 props motion·selected·onPick. 주지 않으면 지금 마크업과 한 글자도 같다
const THREE_SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '90일초진', tone: 'f90' },
  { name: '재진', tone: 'ret' },
]
const THREE_BUCKETS: BarBucket[] = [
  { key: 'd1', label: '1', rangeLabel: '11월 1일', state: 'complete', values: [10, 20, 70] },
  { key: 'd2', label: '2', rangeLabel: '11월 2일', state: 'complete', values: [5, 0, 45] },
  { key: 'd3', label: '3', rangeLabel: '11월 3일', state: 'in-progress', values: [2, 3, 15] },
]
const REVENUE_SERIES: BarSeries[] = [
  { name: '매출', tone: 'accent' },
  { name: '참고 금액', tone: 'rough' },
]
// 확인된 날 · 참고 금액이 있는 날(빗금) · 확인 필요한 날(점선 칸, 값은 그리지 않는다) · 확인된 날
const REVENUE_BUCKETS: BarBucket[] = [
  { key: 'r1', label: '1', rangeLabel: '11월 1일', state: 'complete', values: [50, 0] },
  { key: 'r2', label: '2', rangeLabel: '11월 2일', state: 'complete', values: [0, 40] },
  { key: 'r3', label: '3', rangeLabel: '11월 3일', state: 'complete', values: [9999, 0], mark: 'unchecked' },
  { key: 'r4', label: '4', rangeLabel: '11월 4일', state: 'complete', values: [80, 0] },
]
const columnsOf = (root: Element) => {
  const columns = figureOf(root).querySelector('.absolute.inset-0.flex')?.children
  expect(columns).toBeTruthy()
  return Array.from(columns!)
}
const dashedBoxOf = (column: Element) => Array.from(column.children).find((el) => classesOf(el).includes('border-dashed'))
const ROUGH_KS = Array.from({ length: 55 }, (_, i) => 8 * (i + 1)) // 8, 16, …, 440

describe('AC-4416.2: StackedBarChart 새 props를 주지 않으면 지금 마크업 그대로다(대시보드·미리보기 그대로)', () => {
  it('AC-4416.2: motion false·selected·onPick 없음은 주지 않은 것과 한 글자도 같고, REQ-314 전 고정값(sha256)과도 같다', async () => {
    for (const compact of [false, true]) {
      const now = chart({ compact }).html
      expect(chart({ compact, motion: false }).html, `compact=${compact}`).toBe(now)
      expect(chart({ compact, motion: undefined, selected: undefined, onPick: undefined }).html, `compact=${compact}`).toBe(now)
      expect(now).not.toMatch(/st-|button/)
    }
    expect(await sha256(withoutTableBox(chart({ motion: false }).html))).toBe(BEFORE_REQ_314.md)
    expect(await sha256(withoutTableBox(chart({ compact: true, motion: false }).html))).toBe(BEFORE_REQ_314.sm)
  })

  it('AC-4416.2: 지금 칸 모양(빈 칸·비교 막대·구분 없음·추세선)에 새 props를 안 주면 마크업이 그대로이고 st- 이름이 없다', () => {
    const buckets: BarBucket[] = [
      { ...BUCKETS[0]!, comparison: 500 },
      { ...BUCKETS[1]!, blank: 'no-data' },
      { ...BUCKETS[2]!, blank: 'future' },
      BUCKETS[7]!,
    ]
    const series: BarSeries[] = [...SERIES, { name: '구분 없음', tone: 'hatch-warning' }]
    const props = { buckets, series, trend: { from: { at: 0, value: 100 }, to: { at: 3, value: 200 } } }
    expect(chart({ ...props, motion: false }).html).toBe(chart(props).html)
    expect(chart(props).html).not.toContain('st-')
  })
})

describe('AC-4416.1: StackedBarChart 새 tone — f90(bg-st-f90)·ret(bg-st-ret)', () => {
  it('AC-4416.1: 신환·90일초진·재진 세 갈래는 위부터 bg-accent·bg-st-f90·bg-st-ret 조각이고 높이는 값/합계 %다', () => {
    const { root } = chart({ series: THREE_SERIES, buckets: THREE_BUCKETS })
    const list = bars(figureOf(root))
    const segments = segmentsOf(list[0]!)
    expect(segments).toHaveLength(3)
    expectClasses(segments[0], 'w-full', 'bg-accent')
    expectClasses(segments[1], 'w-full', 'bg-st-f90')
    expectClasses(segments[2], 'w-full', 'bg-st-ret')
    expect(segments.map(styleOf)).toEqual(['height:10%', 'height:20%', 'height:70%'])
    // 0인 계열은 그리지 않는다(지금 규칙 그대로)
    expect(segmentsOf(list[1]!).map((el) => classesOf(el).find((c) => c.startsWith('bg-')))).toEqual(['bg-accent', 'bg-st-ret'])
  })

  it('AC-4416.1: 화면 읽기 표 열은 기간·신환·90일초진·재진·합계·상태다', () => {
    const table = tableOf(chart({ series: THREE_SERIES, buckets: THREE_BUCKETS }).root)
    expect(Array.from(table.querySelectorAll('thead th')).map(textOf)).toEqual(['기간', '신환', '90일초진', '재진', '합계', '상태'])
    expect(rows(table)).toEqual([
      ['11월 1일', '10', '20', '70', '100', '완료'],
      ['11월 2일', '5', '0', '45', '50', '완료'],
      ['11월 3일', '2', '3', '15', '20', '집계 중'],
    ])
  })
})

describe('AC-4416.3: StackedBarChart rough tone — 참고 금액 빗금은 svg다(그라데이션·pattern 없음)', () => {
  const roughSegment = (root: Element) => {
    const segment = segmentsOf(bars(figureOf(root))[1]!)[0]
    expect(segment).toBeTruthy()
    return segment!
  }

  it('AC-4416.3: 빗금 조각은 bg-st-ref-2 바탕(relative) 안에 viewBox 없는 aria-hidden svg 하나(text-st-ref)다', () => {
    const segment = roughSegment(chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS }).root)
    expectClasses(segment, 'relative', 'w-full', 'bg-st-ref-2')
    expect(styleOf(segment)).toBe('height:100%')
    const svgs = segment.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0]!.getAttribute('aria-hidden')).toBe('true')
    expectClasses(svgs[0], 'absolute', 'inset-0', 'size-full', 'text-st-ref')
    for (const attr of ['viewBox', 'style', 'width', 'height', 'id']) expect(svgs[0]!.hasAttribute(attr), attr).toBe(false)
  })

  it('AC-4416.3: 빗금 선은 3px <path stroke="currentColor"> 하나이고 8px 간격(M0 k L k 0, k = 8 … 440)이다', () => {
    const path = roughSegment(chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS }).root).querySelector('svg path')!
    expect(path.getAttribute('stroke')).toBe('currentColor')
    expect(path.getAttribute('stroke-width')).toBe('3')
    expect(path.getAttribute('fill')).toBe('none')
    expect(hatchKs(path.getAttribute('d') ?? '')).toEqual(ROUGH_KS)
  })

  it('AC-4416.3: <pattern>·url(#…)·id·그라데이션이 없다', () => {
    const { root, html } = chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS, motion: true })
    expect(html).not.toMatch(/<pattern|<linearGradient|gradient/i)
    expect(html).not.toContain('url(#')
    expect(root.querySelectorAll('[id]')).toHaveLength(0)
  })
})

describe('AC-4416.1: StackedBarChart mark "unchecked" — 막대 대신 점선 칸 + 칸 위 글 "확인 필요"', () => {
  it('AC-4416.1: 그 칸은 막대·조각 없이 점선 칸(border-dashed border-st-line-2, 옅은 노랑 바탕, 칸 높이의 반)이고 높이 style이 없다', () => {
    const columns = columnsOf(chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS }).root)
    const box = dashedBoxOf(columns[2]!)
    expect(box).toBeTruthy()
    expectClasses(box, 'relative', 'w-1/2', 'max-w-10', 'h-1/2', 'border', 'border-dashed', 'border-st-line-2', 'bg-warning-soft')
    expect(box!.hasAttribute('style')).toBe(false)
    expect(segmentsOf(box!)).toEqual([])
    expect(box!.querySelector('svg')).toBeNull()
    // 다른 칸에는 점선 칸이 없다
    for (const i of [0, 1, 3]) expect(dashedBoxOf(columns[i]!), `칸 ${i}`).toBeUndefined()
  })

  it('AC-4416.1: 칸 위 글은 "확인 필요"(caption 600 st-warn-ink, 막대 위 글 자리)이고 합계 숫자는 없다', () => {
    const { root } = chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS })
    const box = dashedBoxOf(columnsOf(root)[2]!)!
    const above = aboveBar(box)
    expect(above).toHaveLength(1)
    expect(textOf(above[0])).toBe('확인 필요')
    expectClasses(above[0], 'absolute', 'bottom-full', 'left-1/2', 'mb-1', '-translate-x-1/2', 'whitespace-nowrap', 'text-caption', 'font-semibold', 'text-st-warn-ink')
    expect(leafByText(figureOf(root), '9,999')).toHaveLength(0)
  })

  it('AC-4416.1: 그 칸 값은 눈금·굵은 합계에 넣지 않는다 — 눈금은 다른 칸(최대 80)으로 잡고 마지막 완료 칸이 굵다', () => {
    const { root } = chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS })
    const figure = figureOf(root)
    expect(leafByText(figure, '10,000')).toHaveLength(0)
    // 80 → 간격 20, 최대 80(9,999를 넣었다면 최대 10,000)
    expect(leafByText(figure, '60')).toHaveLength(1)
    expect(styleOf(bars(figure)[3]!)).toBe('height:100%')
    expectClasses(oneLeaf(bars(figure)[3]!, '80'), 'font-semibold', 'text-ink')
  })

  it('AC-4416.1: 화면 읽기 표의 그 줄은 계열·합계가 "–"이고 상태가 "확인 필요"다', () => {
    expect(rows(tableOf(chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS }).root))).toEqual([
      ['11월 1일', '50', '0', '50', '완료'],
      ['11월 2일', '0', '40', '40', '완료'],
      ['11월 3일', '–', '–', '–', '확인 필요'],
      ['11월 4일', '80', '0', '80', '완료'],
    ])
  })

  it('AC-4416.1: dense면 칸 위 글을 그리지 않는다(점선 칸은 그대로)', () => {
    const box = dashedBoxOf(columnsOf(chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS, dense: true }).root)[2]!)!
    expect(aboveBar(box)).toEqual([])
    expectClasses(box, 'border-dashed')
  })
})

describe('AC-4417.2: StackedBarChart motion — 막대 st-move-period, 빗금 조각 st-rise(움직임은 globals.css CSS만)', () => {
  it('AC-4417.2: motion이면 완료 막대·쌓은 조각·덜 끝난 막대·비교 막대에 st-move-period가 붙는다', () => {
    const buckets = THREE_BUCKETS.map((b) => ({ ...b, comparison: 40 }))
    const { root } = chart({ series: THREE_SERIES, buckets, motion: true })
    const list = bars(figureOf(root))
    expect(list).toHaveLength(3)
    for (const bar of list) expectClasses(bar, 'st-move-period')
    for (const segment of segmentsOf(list[0]!)) expectClasses(segment, 'st-move-period')
    const faint = Array.from(figureOf(root).querySelectorAll('.bg-faint'))
    expect(faint).toHaveLength(3)
    for (const el of faint) expectClasses(el, 'st-move-period')
  })

  it('AC-4417.2: motion이면 빗금(rough) 조각에 st-rise가 붙고, 점선 칸에는 움직임 이름이 없다', () => {
    const { root } = chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS, motion: true })
    expectClasses(segmentsOf(bars(figureOf(root))[1]!)[0], 'st-rise')
    expect(classesOf(segmentsOf(bars(figureOf(root))[0]!)[0])).not.toContain('st-rise')
    expect(classesOf(dashedBoxOf(columnsOf(root)[2]!)).filter((c) => c.startsWith('st-'))).toEqual([])
  })

  it('AC-4417.2·AC-4417.4: motion은 움직임 이름만 더한다 — 이름을 빼면 motion 없는 마크업과 같고, animate-*·transition 클래스·style이 없다', () => {
    const cases: Array<Partial<Parameters<typeof StackedBarChart>[0]>> = [
      {},
      { compact: true },
      { series: THREE_SERIES, buckets: THREE_BUCKETS },
      { series: REVENUE_SERIES, buckets: REVENUE_BUCKETS },
    ]
    for (const props of cases) {
      const moving = chart({ ...props, motion: true }).html
      expect(moving).toContain('st-move-period')
      expect(moving.replace(/ st-(?:move-period|rise)/g, '')).toBe(chart(props).html)
      expect(moving).not.toMatch(/animate-|transition|animation/)
    }
  })
})

describe('AC-4416.2: StackedBarChart selected·onPick — 고른 칸 표시와 누름·올림(상태는 부르는 쪽이 갖는다)', () => {
  afterEach(() => cleanup())

  it('AC-4416.2: selected 칸만 옅은 파랑 바탕(bg-accent-soft)이고, onPick이 없으면 칸은 단추가 아니다', () => {
    const { root, html } = chart({ selected: '9.21' })
    const columns = columnsOf(root)
    columns.forEach((column, i) => {
      if (i === 2) expectClasses(column, 'bg-accent-soft')
      else expect(classesOf(column), `칸 ${i}`).not.toContain('bg-accent-soft')
    })
    expect(html).not.toContain('<button')
    // 표시만 더한다
    expect(html.replace(' bg-accent-soft', '')).toBe(chart().html)
  })

  it('AC-4416.2: onPick이 있으면 칸마다 type="button"·tabindex -1 단추(그림은 aria-hidden 그대로)이고 누르면·올리면 그 칸 키로 부른다', () => {
    const onPick = vi.fn()
    const { container } = mount(<StackedBarChart title="일별 내원" unit="건" series={THREE_SERIES} buckets={THREE_BUCKETS} onPick={onPick} selected="d2" />)
    const figure = figureOf(container)
    const columns = columnsOf(container)
    expect(columns.map((c) => c.tagName.toLowerCase())).toEqual(['button', 'button', 'button'])
    for (const column of columns) {
      expect(column.getAttribute('type')).toBe('button')
      expect(column.getAttribute('tabindex')).toBe('-1')
      expectClasses(column, 'cursor-pointer')
      expect(figure.contains(column)).toBe(true)
    }
    expectClasses(columns[1], 'bg-accent-soft')
    fireEvent.click(columns[0]!)
    expect(onPick).toHaveBeenLastCalledWith('d1')
    fireEvent.mouseEnter(columns[2]!)
    expect(onPick).toHaveBeenLastCalledWith('d3')
    expect(onPick).toHaveBeenCalledTimes(2)
  })

  it('AC-4416.2: onPick이 있으면 막대 위 숫자·"확인 필요"는 768px 이상에서만 보인다(max-md:hidden), 앞으로 올 칸은 단추가 아니다', () => {
    const buckets: BarBucket[] = [...REVENUE_BUCKETS, { key: 'r5', label: '5', rangeLabel: '11월 5일', state: 'complete', values: [0, 0], blank: 'future' }]
    const { container } = mount(<StackedBarChart title="매출" unit="만 원" series={REVENUE_SERIES} buckets={buckets} onPick={() => {}} />)
    const columns = columnsOf(container)
    expect(columns.map((c) => c.tagName.toLowerCase())).toEqual(['button', 'button', 'button', 'button', 'div'])
    const labels = [...bars(figureOf(container)).flatMap(aboveBar)]
    expect(labels.length).toBeGreaterThan(3)
    for (const above of labels) expectClasses(above, 'max-md:hidden')
    expect(aboveBar(dashedBoxOf(columns[2]!)!)).toHaveLength(1)
  })

  it('AC-4416.2: onPick·selected를 줘도 화면 읽기 표는 그대로다', () => {
    const base = tableOf(chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS }).root).outerHTML
    const picked = tableOf(chart({ series: REVENUE_SERIES, buckets: REVENUE_BUCKETS, selected: 'r2', onPick: () => {}, motion: true }).root).outerHTML
    expect(picked).toBe(base)
  })
})
