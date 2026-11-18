// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { nestedBoxes } from '@/testing/boxes'
import { MonthlyReport } from './MonthlyReport'
import type { MonthlyReportData, ReportBar } from './reportData'

// 월간 보고서 종이 (stats-insights REQ-6108 AC-6108.1·AC-6108.2, 시안 docs/mockups/stats-insights ⑧). 숫자·이름은 시험 안에서 지은 가짜다

const MONTHS = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']
const BARS: ReportBar[] = MONTHS.map((month, i) => ({
  month,
  label: `${Number(month.slice(5))}월`,
  value: i === 1 ? null : 1000 + i * 100,
  picked: month === '2026-10',
}))

const DATA: MonthlyReportData = {
  title: '2026년 10월 통계 보고',
  sub: '튼튼의원 · 11월 13일 뽑음',
  blocks: [
    {
      key: 'summary',
      title: '한 달 요약',
      cells: [
        { name: '내원', value: '1,500' },
        { name: '신환', value: '100' },
      ],
    },
    { key: 'goal', title: '목표', items: ['내원 1,500명 / 목표 2,000명 · 75%'] },
    {
      key: 'changes',
      title: '달라진 것',
      changes: [
        { dir: 'up', text: '내원 · 9월보다 20% 많아요 (1,250명 → 1,500명)' },
        { dir: 'down', text: '도수 · 9월보다 10% 적어요 (40건 → 36건)' },
      ],
    },
    { key: 'trend', title: '내원 흐름 (최근 12달)', bars: BARS },
    { key: 'treatments', title: '치료별', items: ['도수 36건', '충격파 18건'] },
  ],
}

const draw = (data: MonthlyReportData = DATA) => render(<MonthlyReport data={data} />)
const paper = () => screen.getByRole('article', { name: DATA.title })
const block = (title: string) => screen.getByRole('heading', { level: 5, name: title }).closest('section')!

afterEach(cleanup)

describe('AC-6108.2: 보고서 종이', () => {
  it('AC-6108.2: 종이 하나(인쇄 표시)에 제목 h4 · 병원 이름과 뽑은 날 줄 · 칸 제목 h5가 받은 차례대로다', () => {
    draw()
    expect(paper().hasAttribute('data-print-report')).toBe(true)
    expect(within(paper()).getByRole('heading', { level: 4 }).textContent).toContain('2026년 10월 통계 보고')
    expect(within(paper()).getByText('튼튼의원 · 11월 13일 뽑음')).toBeTruthy()
    expect(within(paper()).getAllByRole('heading', { level: 5 }).map((h) => h.textContent)).toEqual(['한 달 요약', '목표', '달라진 것', '내원 흐름 (최근 12달)', '치료별'])
  })

  it('AC-6108.2: 칸(값 · 이름)과 줄 목록이 받은 글자 그대로다', () => {
    draw()
    const summary = block('한 달 요약')
    expect(within(summary).getByText('1,500')).toBeTruthy()
    expect(within(summary).getByText('내원')).toBeTruthy()
    expect(within(block('치료별')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['도수 36건', '충격파 18건'])
    expect(within(block('목표')).getByText('내원 1,500명 / 목표 2,000명 · 75%')).toBeTruthy()
  })

  it('AC-6108.2: 달라진 것은 ▲(positive)·▼(negative) 표시 + 문장이고 표시는 화면 읽기에서 뺀다(문장이 뜻을 말한다)', () => {
    draw()
    const items = within(block('달라진 것')).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['▲내원 · 9월보다 20% 많아요 (1,250명 → 1,500명)', '▼도수 · 9월보다 10% 적어요 (40건 → 36건)'])
    const marks = items.map((li) => li.querySelector('[aria-hidden="true"]')!)
    expect(marks.map((mark) => mark.className)).toEqual([expect.stringContaining('text-positive'), expect.stringContaining('text-negative')])
  })

  it("AC-6108.2: 견줄 수 있는데 달라진 것이 없으면 '지난달과 비슷해요' 한 줄이다", () => {
    draw({ ...DATA, blocks: [{ key: 'changes', title: '달라진 것', changes: [] }] })
    expect(within(block('달라진 것')).getByText('지난달과 비슷해요')).toBeTruthy()
    expect(within(block('달라진 것')).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('AC-6108.2: 내원 흐름은 달마다 한 줄(달 · 숫자, 줄 없는 달은 –)이고 고른 달 막대만 accent다', () => {
    draw()
    const items = within(block('내원 흐름 (최근 12달)')).getAllByRole('listitem')
    expect(items).toHaveLength(12)
    expect(items[1].textContent).toContain('–')
    expect(items[10].textContent).toContain('2,000')
    expect(items[10].textContent).toContain('10월')
    const bars = items.map((li) => li.querySelector('[data-bar]')!)
    expect(bars.filter((bar) => bar.className.includes('bg-accent'))).toEqual([bars[10]])
    expect(bars[0]!.className).toContain('bg-st-line-2')
  })

  it('AC-6108.2: 종이 안에 상자(네 변 테두리) 안 상자가 없다', () => {
    draw()
    expect(nestedBoxes(paper())).toEqual([])
  })
})

describe('AC-6108.1: 인쇄', () => {
  const printCss = () => document.querySelector('style')?.textContent ?? ''

  it('AC-6108.1: 인쇄 규칙은 A4 세로 쪽이고 인쇄 때만이다', () => {
    draw()
    expect(printCss()).toMatch(/^@media print \{/)
    expect(printCss()).toMatch(/@page \{ size: A4 portrait; margin: 12mm; \}/)
  })

  it('AC-6108.1: 인쇄 때는 보고서 종이와 그 안, 종이를 품은 바깥 틀 밖을 모두 가리고(다른 칸·단추·앱 틀), 바깥 틀의 여백·테두리·바탕을 없앤다', () => {
    draw()
    const css = printCss()
    expect(css).toContain('body:has([data-print-report]) *:not([data-print-report], [data-print-report] *, :has([data-print-report])) { display: none !important; }')
    expect(css).toMatch(/body:has\(\[data-print-report\]\) :has\(\[data-print-report\]\) \{[^}]*margin: 0;[^}]*padding: 0;[^}]*border: 0;[^}]*box-shadow: none;[^}]*background: none;/)
  })

  it('AC-6108.1: 인쇄 규칙 글자에는 HTML로 바뀌는 글자(<·>·&)가 없다(서버 그림에서도 그대로 읽힌다)', () => {
    draw()
    expect(printCss()).not.toMatch(/[<>&]/)
  })
})
