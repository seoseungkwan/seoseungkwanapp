// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
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
    expect(await sha256(chart().html)).toBe(BEFORE_REQ_314.md)
    expect(await sha256(chart({ compact: true }).html)).toBe(BEFORE_REQ_314.sm)
  })
})
