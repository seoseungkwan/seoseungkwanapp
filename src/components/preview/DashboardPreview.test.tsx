// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChartLegend } from '@/components/charts/ChartLegend'
import { KpiStat } from '@/components/charts/KpiStat'
import { StackedBarChart } from '@/components/charts/StackedBarChart'
import { ds } from '@/components/ui/classes'
import { isBorderBox, nestedBoxes } from '@/testing/boxes'
import { DashboardPreview } from './DashboardPreview'
import { SAMPLE_KPIS, SAMPLE_SERIES, SAMPLE_WEEKS } from './sample'

// 대시보드 미리보기 (b2b-redesign REQ-206 AC-206.2·AC-206.3, design.md '미리보기', UI_GUIDE '미리보기').
// 짜임은 승인 시안 docs/mockups/b2b-redesign/screens.mjs의 preview다. 서버에서 그대로 그리는 부품 → renderToStaticMarkup으로 그린
// 마크업을 jsdom에 넣어 짜임·클래스·글자를 본다(보이는 모양은 Phase 2 끝 사진). 숫자는 모두 예시(sample.ts)다

const ROOT = process.cwd()

const mount = () => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(<DashboardPreview />)
  return root
}
const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted))
const expectNoClasses = (el: Element | null | undefined, ...unwanted: string[]) => {
  for (const cls of unwanted) expect(classesOf(el), cls).not.toContain(cls)
}
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
// 요소에 바로 든 글자(자식 요소 글자 빼고)
const ownText = (el: Element) =>
  Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? '')
    .join('')
    .trim()
const elementsWithOwnText = (root: Element, text: string) => Array.from(root.querySelectorAll('*')).filter((el) => ownText(el) === text)

// 상자 하나와 그 안 네 줄
const parts = () => {
  const root = mount()
  expect(root.children).toHaveLength(1)
  const box = root.firstElementChild!
  expect(box.children).toHaveLength(4)
  const [top, tabs, kpis, chart] = Array.from(box.children) as [Element, Element, Element, Element]
  return { root, box, top, tabs, kpis, chart }
}

describe('AC-206.2: 상자 하나 안에 위 줄 → 탭 줄 → KPI 줄 → 차트', () => {
  it('AC-206.2: 맨 바깥은 div 상자 하나(surface·1px line·rounded-control·overflow-clip)이고 그 안이 네 줄이다', () => {
    const { box } = parts()
    expect(box.tagName).toBe('DIV')
    expectClasses(box, 'bg-surface', 'border', 'border-line', 'rounded-control', 'overflow-clip')
    expectNoClasses(box, 'overflow-hidden', 'shadow-float')
    expect(isBorderBox(box)).toBe(true)
  })

  it('AC-206.2: 상자 안에 상자가 없다(AC-204.7 도우미 nestedBoxes)', () => {
    const { root } = parts()
    expect(nestedBoxes(root)).toEqual([])
  })

  it('AC-206.2: 위 줄 — 44px·아래 1px line, 왼쪽 LogoMark 18 + "예시정형외과의원"(small 600), 오른쪽 ds.chip.accent "예시 숫자"', () => {
    const { top } = parts()
    expectClasses(top, 'flex', 'h-11', 'items-center', 'justify-between', 'border-b', 'border-line')
    expect(top.children).toHaveLength(2)
    const [left, chip] = Array.from(top.children) as [Element, Element]
    const logo = left.querySelector('svg')
    expect(logo?.getAttribute('aria-hidden')).toBe('true')
    expect(logo?.getAttribute('viewBox')).toBe('0 0 30 30')
    expect(logo?.getAttribute('width')).toBe('18')
    expect(logo?.getAttribute('height')).toBe('18')
    const name = elementsWithOwnText(left, '예시정형외과의원')
    expect(name).toHaveLength(1)
    expectClasses(name[0], 'text-small', 'font-semibold', 'text-ink')
    expect(chip.tagName).toBe('SPAN')
    expect(chip.getAttribute('class')).toBe(ds.chip.accent)
    expect(textOf(chip)).toBe('예시 숫자')
  })

  it('AC-206.2: 탭 줄 — 36px·아래 1px line·small 500·사이 20px, span 6개(대시보드 · 통계 · AI 리포트 · 매출 · 재고 · 급여)', () => {
    const { tabs } = parts()
    expectClasses(tabs, 'flex', 'h-9', 'border-b', 'border-line', 'text-small', 'font-medium', 'gap-5')
    const items = Array.from(tabs.children)
    expect(items.map((el) => el.tagName)).toEqual(Array(6).fill('SPAN'))
    expect(items.map(textOf)).toEqual(['대시보드', '통계', 'AI 리포트', '매출', '재고', '급여'])
  })

  it('AC-206.2: 첫 탭만 ink 600 + 아래 2px accent, 나머지는 faint(밑줄 색 없음)', () => {
    const [first, ...rest] = Array.from(parts().tabs.children)
    expectClasses(first, 'text-ink', 'font-semibold', 'border-b-2', 'border-accent')
    for (const tab of rest) {
      expectClasses(tab, 'text-faint')
      expectNoClasses(tab, 'text-ink', 'font-semibold', 'border-accent')
    }
  })

  it('AC-206.2: 5·6번째 탭(재고·급여)만 768px 미만에서 숨는다(max-md:hidden)', () => {
    const items = Array.from(parts().tabs.children)
    expect(items.map((el) => classesOf(el).includes('max-md:hidden'))).toEqual([false, false, false, false, true, true])
  })

  it('AC-206.2: KPI 줄 — 아래 1px line, 768px 이상 4칸·미만 2×2(grid-cols-4 max-md:grid-cols-2), 칸 4개', () => {
    const { kpis } = parts()
    expectClasses(kpis, 'grid', 'grid-cols-4', 'max-md:grid-cols-2', 'border-b', 'border-line')
    expect(kpis.children).toHaveLength(4)
  })

  it('AC-206.2: KPI 칸은 KpiStat size="sm"·sparkOnPhone={false}에 예시 자료를 그대로 넣은 것이다', () => {
    const cells = Array.from(parts().kpis.children)
    cells.forEach((cell, i) => {
      expect(cell.innerHTML, `${i}`).toBe(renderToStaticMarkup(<KpiStat size="sm" sparkOnPhone={false} {...SAMPLE_KPIS[i]!} />))
      expectClasses(cell.querySelector('p'), 'text-heading-m')
      const spark = cell.querySelector('svg')
      expect(spark?.getAttribute('width')).toBe('56')
      expect(spark?.getAttribute('height')).toBe('22')
      expectClasses(spark?.parentElement, 'max-md:hidden')
    })
  })

  it('AC-206.2: KPI 칸 사이는 왼쪽 1px line, 2×2의 아래 줄(3·4번째)은 위 1px line', () => {
    const [a, b, c, d] = Array.from(parts().kpis.children)
    for (const cell of [a, b, c, d]) {
      expectClasses(cell, 'border-line')
      expectNoClasses(cell, 'border')
    }
    // 첫 칸: 선 없음
    for (const cls of ['border-l', 'md:border-l', 'border-t', 'max-md:border-t']) expectNoClasses(a, cls)
    // 둘째(2×2 위 오른쪽): 늘 왼쪽 선
    expectClasses(b, 'border-l')
    expectNoClasses(b, 'max-md:border-t', 'border-t')
    // 셋째(2×2 아래 왼쪽): 768px 이상만 왼쪽 선, 미만은 위 선
    expectClasses(c, 'md:border-l', 'max-md:border-t')
    expectNoClasses(c, 'border-l', 'border-t')
    // 넷째(2×2 아래 오른쪽): 늘 왼쪽 선 + 미만은 위 선
    expectClasses(d, 'border-l', 'max-md:border-t')
    expectNoClasses(d, 'border-t')
  })

  it('AC-206.2: KPI 4개의 보이는 글자 — 714명 17명 (+2.4%) · 131명 5명 (+3.9%) · 583명 12명 (+2.1%) · 18.3% 0.2%p', () => {
    const cells = Array.from(parts().kpis.children)
    const rows: [label: string, value: string, unit: string, delta: string][] = [
      ['환자 수', '714', '명', '17명 (+2.4%)'],
      ['신환', '131', '명', '5명 (+3.9%)'],
      ['재진', '583', '명', '12명 (+2.1%)'],
      ['신환율', '18.3', '%', '0.2%p'],
    ]
    rows.forEach(([label, value, unit, delta], i) => {
      const cell = cells[i]!
      expect(elementsWithOwnText(cell, label), label).toHaveLength(1)
      const valueEl = elementsWithOwnText(cell, value)
      expect(valueEl, value).toHaveLength(1)
      expect(textOf(valueEl[0]), value).toBe(`${value}${unit}`)
      expect(elementsWithOwnText(cell, delta), delta).toHaveLength(1)
      expect(textOf(cell.querySelector('.sr-only')), label).toBe('늘어남')
      expect(textOf(cell), label).not.toContain('그 전 주 대비')
    })
  })

  it('AC-206.2: 차트 — 좌우 16px·위 12px·아래 16px, 제목 "주별 환자 수"(small 600) + 오른쪽 ChartLegend(신환 · 재진 · 집계 중)', () => {
    const { chart } = parts()
    expectClasses(chart, 'px-4', 'pt-3', 'pb-4')
    const head = chart.children[0]!
    expectClasses(head, 'flex', 'items-center', 'justify-between')
    expect(head.children).toHaveLength(2)
    const [title, legend] = Array.from(head.children) as [Element, Element]
    expect(textOf(title)).toBe('주별 환자 수')
    expectClasses(title, 'text-small', 'font-semibold', 'text-ink')
    expect(legend.outerHTML).toBe(
      renderToStaticMarkup(
        <ChartLegend
          items={[
            { label: '신환', mark: 'accent' },
            { label: '재진', mark: 'chart-3' },
            { label: '집계 중', mark: 'hatch' },
          ]}
        />,
      ),
    )
  })

  it('AC-206.2: 범례 아래는 StackedBarChart compact(제목 "주별 환자 수 (예시)", 단위 명, 예시 8주)다', () => {
    const { chart } = parts()
    expect(chart.children).toHaveLength(2)
    const bars = chart.children[1]!
    expect(bars.innerHTML).toBe(
      renderToStaticMarkup(<StackedBarChart compact title="주별 환자 수 (예시)" unit="명" series={SAMPLE_SERIES} buckets={SAMPLE_WEEKS} />),
    )
    expect(textOf(bars.querySelector('caption'))).toBe('주별 환자 수 (예시) (명)')
    expect(bars.querySelectorAll('tbody tr')).toHaveLength(8)
  })
})

const BANNED = ['a', 'button', 'input', 'select', 'textarea', 'label', 'form', 'header', 'nav', 'main', 'section', 'footer']
const PREVIEW_SOURCES = ['src/components/preview/DashboardPreview.tsx', 'src/components/preview/sample.ts']
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('AC-206.3: 받는 것·누르는 것·이정표가 없고, 숫자는 "예시 숫자"와 함께 보인다', () => {
  it.each(BANNED)('AC-206.3: <%s>가 없다', (tag) => {
    const { root } = parts()
    expect(root.querySelectorAll(tag)).toHaveLength(0)
  })

  it('AC-206.3: tabindex가 없다', () => {
    const { root } = parts()
    expect(root.querySelectorAll('[tabindex]')).toHaveLength(0)
  })

  it.each(PREVIEW_SOURCES)("AC-206.3: %s에 'use client'·타이머·훅이 없다(서버에서 그대로 그린다)", (file) => {
    const src = read(file)
    expect(src).not.toMatch(/['"]use client['"]/)
    expect(src).not.toMatch(/\b(?:setTimeout|setInterval|requestAnimationFrame|useEffect|useLayoutEffect|useState|useReducer|useRef)\b/)
  })

  it('AC-206.3: "예시 숫자" 칩은 하나이고 위 줄에 있으며, 어느 폭에서도 숨지 않는다', () => {
    const { root, top } = parts()
    const chips = elementsWithOwnText(root, '예시 숫자')
    expect(chips).toHaveLength(1)
    expect(top.contains(chips[0]!)).toBe(true)
    for (let el: Element | null = chips[0]!; el && el !== root; el = el.parentElement) {
      for (const cls of classesOf(el)) expect(cls, textOf(el)).not.toMatch(/(^|:)hidden$|^sr-only$/)
      expect(el.getAttribute('aria-hidden'), textOf(el)).not.toBe('true')
    }
  })

  it('AC-206.3: 받는 값이 없는 한 컴포넌트다 — 예시 자료·차트 부품·로고·ds만 불러온다(실제 자료를 읽지 않는다)', () => {
    const imports = [...read('src/components/preview/DashboardPreview.tsx').matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(imports.length).toBeGreaterThan(0)
    const allowed = /^(?:\.\/sample|@\/components\/charts\/\w+|@\/components\/common\/LogoMark|@\/components\/ui\/classes)$/
    for (const from of imports) expect(from, from).toMatch(allowed)
    expect(DashboardPreview.length).toBe(0)
  })
})
