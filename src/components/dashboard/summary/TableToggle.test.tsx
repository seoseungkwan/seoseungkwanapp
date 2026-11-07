// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ChartTable } from '@/components/charts/ChartTable'
import { StackedBarChart, type BarBucket, type BarSeries } from '@/components/charts/StackedBarChart'
import { ds } from '@/components/ui/classes'
import { TableToggle } from './TableToggle'

// [표로 보기] 단추 + 보이는 표 (dashboard-ux REQ-2706 AC-2706.1, design.md §7, 시안 docs/mockups/dashboard-ux/index.html .tbl-toggle).
// 펼침 상태는 이 부품이 쥐고 그래프 쪽에 알려 준다(펼친 동안 그래프는 srTable={false}). 예시 값은 지어낸 것이다

afterEach(cleanup)

const SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '재진', tone: 'chart-3' },
]
const BUCKETS: BarBucket[] = [
  { key: 'a', label: '10.1', rangeLabel: '10월 1일', state: 'complete', values: [0, 4] },
  { key: 'b', label: '10.2', rangeLabel: '10월 2일', state: 'partial', values: [2, 3] },
]
const CAPTION = '환자 수 추이 · 단위 명 · 최근 30일'

function draw() {
  const seen: boolean[] = []
  const { container } = render(
    <TableToggle caption={CAPTION} series={SERIES} buckets={BUCKETS}>
      {(open) => {
        seen.push(open)
        return <StackedBarChart title="환자 수 추이" unit="명" series={SERIES} buckets={BUCKETS} srTable={!open} />
      }}
    </TableToggle>,
  )
  return { container, seen }
}
// 따로 그린 부품 마크업(같은 방식 — 브라우저 DOM — 으로 그려 견준다)
function markupOf(node: ReactElement): string {
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() => root.render(node))
  const html = host.innerHTML
  act(() => root.unmount())
  return html
}
const button = () => screen.getByRole('button', { name: '표로 보기' })
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element | null | undefined) => tokens(el?.getAttribute('class') ?? '')
const srTables = (root: Element) => Array.from(root.querySelectorAll('table')).filter((t) => t.closest('.sr-only'))
const visibleTables = (root: Element) => Array.from(root.querySelectorAll('table')).filter((t) => !t.closest('.sr-only'))

describe('AC-2706.1: TableToggle — [표로 보기]를 누르면 보이는 표가 펼쳐지고, 펼친 동안 화면 읽기 표는 없다', () => {
  it('AC-2706.1: 처음은 접혀 있다 — 단추 aria-expanded="false", aria-controls는 있는 칸을 가리키고, 보이는 표 없이 그래프의 화면 읽기 표 하나다', () => {
    const { container, seen } = draw()
    const b = button()
    expect(b.getAttribute('type')).toBe('button')
    expect(b.getAttribute('aria-expanded')).toBe('false')
    const target = document.getElementById(b.getAttribute('aria-controls') ?? '')
    expect(target).not.toBeNull()
    expect(container.contains(target)).toBe(true)
    expect(target!.children).toHaveLength(0)
    expect(visibleTables(container)).toHaveLength(0)
    expect(srTables(container)).toHaveLength(1)
    expect(seen.at(-1)).toBe(false)
  })

  it('AC-2706.1: 누르면 aria-expanded="true"이고 가리키는 칸 안에 ChartTable이 펼쳐지며, 그래프는 화면 읽기 표 없이 그려진다(같은 숫자를 두 번 읽지 않는다)', () => {
    const { container, seen } = draw()
    fireEvent.click(button())
    const b = button()
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(seen.at(-1)).toBe(true)
    const target = document.getElementById(b.getAttribute('aria-controls')!)!
    expect(target.innerHTML).toBe(markupOf(<ChartTable caption={CAPTION} series={SERIES} buckets={BUCKETS} />))
    expect(srTables(container)).toHaveLength(0)
    expect(container.querySelectorAll('table')).toHaveLength(1)
    // 단추 → 표 차례(단추 바로 아래 펼친다)
    expect(b.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-2706.1: 다시 누르면 접혀 처음 그대로다(보이는 표 없음 · 화면 읽기 표 그대로)', () => {
    const { container } = draw()
    const before = container.innerHTML
    fireEvent.click(button())
    fireEvent.click(button())
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(visibleTables(container)).toHaveLength(0)
    expect(srTables(container)).toHaveLength(1)
    expect(container.innerHTML).toBe(before)
  })

  it('AC-2706.1: 단추는 ds.button.secondarySmall(폰 44px)에 폰 전체 폭이고, 꺾쇠 아이콘(꾸밈)은 펼치면 뒤집힌다', () => {
    draw()
    const b = button()
    expect(classesOf(b)).toEqual([...tokens(ds.button.secondarySmall), 'max-md:w-full'])
    const icon = b.querySelector('svg')!
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(classesOf(icon)).not.toContain('rotate-180')
    fireEvent.click(b)
    expect(classesOf(button().querySelector('svg'))).toContain('rotate-180')
  })
})
