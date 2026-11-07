// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChartTable } from './ChartTable'
import type { BarBucket, BarSeries } from './StackedBarChart'

// 그래프 보이는 표 (dashboard-ux REQ-2706 AC-2706.1·AC-2706.2·AC-2706.3, design.md §7, 시안 docs/mockups/dashboard-ux/index.html '표로 보기').
// 서버에서 그대로 그리는 부품 → renderToStaticMarkup으로 그린 마크업을 jsdom에 넣어 본다. 예시 값은 지어낸 것이다

const SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '재진', tone: 'chart-3' },
]
const bucket = (key: string, values: number[], o: Partial<BarBucket> = {}): BarBucket => ({
  key,
  label: key,
  rangeLabel: `${key} 칸`,
  state: 'complete',
  values,
  ...o,
})
const CAPTION = '환자 수 추이 · 단위 명 · 최근 30일'

const mount = (buckets: BarBucket[], series: BarSeries[] = SERIES) => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(<ChartTable caption={CAPTION} series={series} buckets={buckets} />)
  return root
}
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const tableOf = (root: Element) => {
  const tables = root.querySelectorAll('table')
  expect(tables).toHaveLength(1)
  return tables[0]!
}
const rows = (root: Element) => Array.from(tableOf(root).querySelectorAll('tbody tr')).map((tr) => Array.from(tr.children).map(textOf))

describe('AC-2706.1·AC-2706.3: ChartTable — 보이는 표(캡션 · 열 머리 · 줄 머리)', () => {
  it('AC-2706.1·AC-2706.3: 캡션은 받은 글(그래프 이름 · 단위 · 기간 기준), 열 머리는 기간 · 계열 · 합계 · 상태, 줄 머리는 칸의 기간 글이다', () => {
    const root = mount([bucket('a', [3, 7]), bucket('b', [1, 2])])
    const table = tableOf(root)
    expect(textOf(table.querySelector('caption'))).toBe(CAPTION)
    const heads = Array.from(table.querySelectorAll('thead th'))
    expect(heads.map(textOf)).toEqual(['기간', '신환', '재진', '합계', '상태'])
    for (const th of heads) expect(th.getAttribute('scope')).toBe('col')
    const rowHeads = Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.firstElementChild!)
    expect(rowHeads.map((th) => [th.tagName, th.getAttribute('scope'), textOf(th)])).toEqual([
      ['TH', 'row', 'a 칸'],
      ['TH', 'row', 'b 칸'],
    ])
    // 보이는 표다(화면 읽기 전용이 아니다)
    expect(root.querySelector('.sr-only')).toBeNull()
  })

  it('AC-2706.3: 0은 "0", 큰 수는 세 자리 쉼표, 자료 없는 칸은 계열·합계가 "자료 없음"이고 상태는 "–", 상태 글은 완료 · 집계 중 · 일부 기간으로 다르다', () => {
    const root = mount([
      bucket('a', [0, 0]),
      bucket('b', [1200, 34], { state: 'in-progress' }),
      bucket('c', [2, 0], { state: 'partial' }),
      bucket('n', [0, 0], { state: 'partial', blank: 'no-data' }),
    ])
    expect(rows(root)).toEqual([
      ['a 칸', '0', '0', '0', '완료'],
      ['b 칸', '1,200', '34', '1,234', '집계 중'],
      ['c 칸', '2', '0', '2', '일부 기간'],
      ['n 칸', '자료 없음', '자료 없음', '자료 없음', '–'],
    ])
  })

  it('AC-2706.3: 앞으로 올 칸(blank future)은 줄이 없다', () => {
    const root = mount([bucket('a', [1, 1]), bucket('f', [0, 0], { blank: 'future' })])
    expect(rows(root).map((row) => row[0])).toEqual(['a 칸'])
  })

  it('AC-2706.1: 비교 값이 있는 칸이 있으면 화면 읽기 표처럼 "비교 기간" 열이 붙는다(없는 칸은 "–")', () => {
    const root = mount([bucket('a', [1, 1], { comparison: 5 }), bucket('b', [2, 2], { comparison: null })])
    expect(Array.from(tableOf(root).querySelectorAll('thead th')).map(textOf).at(-1)).toBe('비교 기간')
    expect(rows(root).map((row) => row.at(-1))).toEqual(['5', '–'])
  })
})

describe('AC-2706.2: 칸이 많은 그래프 — 칸마다 한 줄, 표는 자기 상자 안에서만 넘친다', () => {
  it('AC-2706.2: 90칸이면 90줄이고 줄마다 기간 · 계열 값 · 합계 · 상태가 모두 있다', () => {
    const many = Array.from({ length: 90 }, (_, i) => bucket(`d${i}`, [i, 1], { state: i === 89 ? 'partial' : 'complete' }))
    const all = rows(mount(many))
    expect(all).toHaveLength(90)
    for (const [i, row] of all.entries()) expect(row).toEqual([`d${i} 칸`, String(i), '1', String(i + 1), i === 89 ? '일부 기간' : '완료'])
  })

  it('AC-2706.2: 상자는 높이 한도(max-h-72) 안에서 넘치면 자기 안에서 굴리고(overflow-auto), 머리 줄은 위에 붙고(sticky top-0), 칸 글자는 줄바꿈하지 않고 숫자는 고정폭이다', () => {
    const root = mount([bucket('a', [1, 1])])
    const box = tableOf(root).parentElement!
    expect(box.parentElement).toBe(root)
    expect(classesOf(box)).toEqual(expect.arrayContaining(['max-h-72', 'overflow-auto']))
    expect(classesOf(box)).not.toContain('overflow-hidden')
    expect(classesOf(tableOf(root))).toEqual(expect.arrayContaining(['w-full', 'tabular-nums']))
    for (const th of Array.from(root.querySelectorAll('thead th'))) expect(classesOf(th)).toEqual(expect.arrayContaining(['sticky', 'top-0', 'whitespace-nowrap']))
    for (const cell of Array.from(root.querySelectorAll('tbody th, tbody td'))) expect(classesOf(cell)).toContain('whitespace-nowrap')
  })
})
