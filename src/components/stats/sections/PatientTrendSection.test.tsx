// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { addDays } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { PatientTrendSection } from './PatientTrendSection'

// 환자 수 추이 (stats REQ-513 AC-513.1·513.2·513.3·513.4, 시안 notes.md §3). 가짜 일 줄은 이 파일 안에서만 만든다

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]

function day(ymd: string, newPatients: number, returning: number, partial = false): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients: newPatients + returning, newPatients, returning, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: newPatients, within7: null, within14: null },
  }
}
const inputOf = (days: DayPayload[], covered: DateRange[], period: StatsPeriod = '30d', today = TODAY): StatsInput => ({
  days,
  covered,
  range: statsRange(today, period),
})
const detail = () => {
  fireEvent.click(screen.getByRole('button', { name: '자세히' }))
  const button = screen.getByRole('button', { name: '접기' })
  return document.getElementById(button.getAttribute('aria-controls')!)!
}
const rowsOf = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((td) => td.textContent))

afterEach(cleanup)

describe('AC-513.1·AC-513.2: 환자 수 추이', () => {
  it('AC-513.1: h2 + 옆 설명 + 범례(신환·재진) + 쌓은 막대 + 휴진 안내다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8)], WHOLE)} saved />)
    expect(screen.getByRole('heading', { level: 2, name: '환자 수 추이' })).toBeTruthy()
    expect(screen.getByText('신환·재진, 하루씩')).toBeTruthy()
    expect(screen.getAllByText('신환').length).toBeGreaterThan(0)
    expect(screen.getByRole('table', { name: '환자 수 추이 (명)' })).toBeTruthy()
    expect(screen.getByText('휴진한 날은 칸이 없어요.')).toBeTruthy()
    expect(screen.queryByText('일부 기간')).toBeNull()
  })

  it('AC-513.2: 신환은 accent·재진은 chart-3 면이고 그림은 꾸밈(aria-hidden)이다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8)], WHOLE)} saved />)
    const figure = container.querySelector('.tabular-nums[aria-hidden="true"]')!
    expect(figure.querySelector('.bg-accent')).not.toBeNull()
    expect(figure.querySelector('.bg-chart-3')).not.toBeNull()
  })

  it('AC-513.1: 칸 31개 이하면 막대 위 합계가 있고, 휴대폰은 칸 13개부터 마지막 칸만이다', () => {
    const days = Array.from({ length: 13 }, (_, i) => day(addDays('2026-10-20', i), 2, 8))
    const { container } = render(<PatientTrendSection input={inputOf(days, WHOLE)} saved />)
    const figure = container.querySelector('.tabular-nums[aria-hidden="true"]')!
    expect(figure.querySelectorAll('.text-ink-2').length).toBeGreaterThan(0)
    expect(figure.parentElement!.parentElement!.className).toContain('max-md:[&_.text-ink-2]:invisible')
  })

  it('AC-513.1: 칸 12개 이하면 휴대폰에서도 합계를 숨기지 않는다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8)], WHOLE)} saved />)
    expect(container.innerHTML).not.toContain('max-md:[&amp;_.text-ink-2]:invisible')
  })

  it('AC-513.1: 칸이 32개 이상이면 막대 위 합계를 그리지 않는다', () => {
    const days = Array.from({ length: 32 }, (_, i) => day(addDays('2026-08-20', i), 2, 8))
    const { container } = render(<PatientTrendSection input={inputOf(days, WHOLE, '90d')} saved />)
    const figure = container.querySelector('.tabular-nums[aria-hidden="true"]')!
    expect(figure.querySelector('.text-ink-2')).toBeNull()
  })

  it('AC-513.1: 덜 끝난 칸이 있으면 범례에 빗금 "일부 기간"이 붙는다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8, true)], WHOLE)} saved />)
    expect(screen.getAllByText('일부 기간').length).toBeGreaterThan(0)
  })
})

// 칸이 글자보다 좁으면 글자가 오른쪽으로만 넘쳐 휴대폰에서 쪽이 옆으로 밀린다(30일 390px, 끝 칸 "10.31"). 숨은 화면 읽기 표도 줄을 못 바꿔 쪽을 민다(90일 처방 칸을 열면 400px).
// 표는 왼쪽으로 넘기고(스크롤이 안 생긴다) 줄바꿈시키지 않는다: 줄을 바꾸면 표가 수천 px로 길어져 쪽이 아래로 늘어난다.
// jsdom은 크기를 재지 못해 클래스만 본다. 진짜 증거는 Phase 끝 브라우저 측정이다
describe('AC-513.1: 휴대폰에서 그림이 쪽을 옆으로 밀지 않는다', () => {
  it('AC-513.1: 그림을 감싼 칸이 날짜 글자를 제 칸 가운데로 넘치게 하고 화면 읽기 표를 왼쪽으로 넘긴다(줄바꿈 없음). 선택자는 날짜 글자 칸과 그 표만 잡는다', () => {
    for (const period of ['7d', '30d', '90d', '12m'] as const) {
      const days = Array.from({ length: 13 }, (_, i) => day(addDays('2026-11-12', i - 12), 2, 8)) // 어제까지 13일: 네 기간 모두에 줄이 있다
      const { container, unmount } = render(<PatientTrendSection input={inputOf(days, WHOLE, period)} saved />)
      const figure = container.querySelector('.tabular-nums[aria-hidden="true"]')!
      const wrapper = figure.parentElement!.parentElement!
      const tokens = wrapper.className.split(/\s+/)
      for (const name of ['relative', '[&_.text-center]:flex', '[&_.text-center]:flex-col', '[&_.text-center]:items-center', '[&_table]:right-0']) expect(tokens, period).toContain(name)
      for (const name of ['[&_table]:whitespace-normal', '[&_table]:break-all']) expect(tokens, period).not.toContain(name)
      const labelCells = Array.from(figure.lastElementChild!.children)
      expect(labelCells.length, period).toBeGreaterThan(0)
      expect(Array.from(wrapper.querySelectorAll('.text-center')), period).toEqual(labelCells)
      expect(Array.from(wrapper.querySelectorAll('table')).map((table) => table.className), period).toEqual(['sr-only'])
      unmount()
    }
  })
})

describe('AC-513.1: 12개월 환자 수 추이의 끝나지 않은 달 글', () => {
  const ROWS = [day('2026-07-10', 2, 8), day('2026-10-10', 2, 8), day('2026-11-02', 2, 8)]

  it('AC-513.1: 설명은 "한 달씩"이고 덜 끝난 칸이 오늘이 든 달뿐이면 시안 글이다', () => {
    render(<PatientTrendSection input={inputOf(ROWS, WHOLE, '12m')} saved />)
    expect(screen.getByText('신환·재진, 한 달씩')).toBeTruthy()
    expect(screen.getByText('빗금 칸은 아직 끝나지 않은 달이에요(11월은 13일까지).')).toBeTruthy()
    expect(screen.queryByText('휴진한 날은 칸이 없어요.')).toBeNull()
  })

  it('AC-513.1: 8월이 덜 덮인 11월의 12개월 보기 — 8월이 끝나지 않았다는 글이 없고 빗금과 "일부 기간"만이다', () => {
    const covered = [
      { from: '2024-12-01', to: '2026-08-05' },
      { from: '2026-08-20', to: '2026-11-12' },
    ]
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-08-25', 2, 8), ...ROWS], covered, '12m')} saved />)
    expect(container.textContent).not.toContain('아직 끝나지 않은')
    expect(screen.getAllByText('일부 기간').length).toBeGreaterThan(0)
  })

  it('AC-513.1: 이번 달이 끝났고 지난달만 덜 덮였어도 끝나지 않은 달 글이 없다', () => {
    const covered = [
      { from: '2024-12-01', to: '2026-08-05' },
      { from: '2026-08-20', to: '2026-11-30' },
    ]
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-08-25', 2, 8)], covered, '12m', '2026-11-30')} saved />)
    expect(container.textContent).not.toContain('끝나지 않은')
  })
})

describe('AC-513.3: 환자 수 추이 [자세히]', () => {
  it('AC-513.3: 일 기간 표는 날짜(요일 포함)·신환·재진·합계이고 합계는 600이다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-11-02', 1200, 34)], WHOLE)} saved />)
    const panel = detail()
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['날짜', '신환', '재진', '합계'])
    expect(rowsOf(panel)).toEqual([['11월 2일 (월)', '1,200', '34', '1,234']])
    expect(within(panel).getByText('1,234').className).toContain('font-semibold')
  })

  it('AC-513.3: 12개월 표의 첫 칸은 달이고 덜 끝난 칸에는 칩이 붙는다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-10-10', 2, 8), day('2026-11-02', 3, 7)], WHOLE, '12m')} saved />)
    const panel = detail()
    expect(within(panel).getAllByRole('columnheader')[0]!.textContent).toBe('달')
    expect(rowsOf(panel)).toEqual([
      ['2026년 10월', '2', '8', '10'],
      ['2026년 11월일부 기간', '3', '7', '10'],
    ])
    expect(within(panel).getByText('일부 기간').className).toContain('text-warning')
  })

  it('AC-513.3: 표는 그래프와 안내 글 바로 아래에 열린다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8)], WHOLE)} saved />)
    const chart = screen.getByRole('table', { name: '환자 수 추이 (명)' }) // 그래프 부품의 화면 읽기 표
    const panel = detail()
    const note = panel.previousElementSibling!
    expect(note.textContent).toBe('휴진한 날은 칸이 없어요.')
    expect(note.previousElementSibling!.contains(chart)).toBe(true)
    expect(panel.parentElement!.lastElementChild).toBe(panel)
  })

  it('AC-513.3: 다시 누르면 닫히고 주소가 바뀌지 않는다', () => {
    const href = window.location.href
    render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8)], WHOLE)} saved />)
    const panel = detail()
    fireEvent.click(screen.getByRole('button', { name: '접기' }))
    expect(panel.hidden).toBe(true)
    expect(window.location.href).toBe(href)
  })

  it('AC-513.3: 기간을 바꿔도 열어 둔 표는 열린 채 새 숫자로 다시 그린다', () => {
    const days = [day('2026-11-02', 1, 1), day('2026-11-10', 5, 5)]
    const { rerender } = render(<PatientTrendSection input={inputOf(days, WHOLE, '30d')} saved />)
    detail()
    rerender(<PatientTrendSection input={inputOf([day('2026-11-10', 5, 5)], WHOLE, '7d')} saved />)
    const button = screen.getByRole('button', { name: '접기' })
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(rowsOf(panel)).toEqual([['11월 10일 (화)', '5', '5', '10']])
  })
})

describe('AC-513.4: 환자 수 추이 빈 상태', () => {
  it('AC-513.4: 저장된 숫자가 없으면 그래프·[자세히] 없이 시안 문구다', () => {
    render(<PatientTrendSection input={inputOf([], [])} saved={false} />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러오면 이 기간의 하루하루가 신환·재진 막대로 그려져요.')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('신환·재진, 하루씩')).toBeNull()
  })

  it('AC-513.4: 저장된 숫자는 있는데 이 기간 자료가 없으면 그 문구다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-01-05', 1, 1)], WHOLE)} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
  })
})
