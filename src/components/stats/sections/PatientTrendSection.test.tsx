// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { StatsPick } from '@/components/stats/periodPick'
import { rangeOf, statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { addDays } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { StatsCard } from './parts'
import { PatientTrendSection } from './PatientTrendSection'

// 일별 내원(옛 환자 수 추이) (stats REQ-513 AC-513.1·513.2·513.3·513.4·513.13, first90 REQ-4412 AC-4412.1·AC-4412.2, REQ-4417 AC-4417.2,
// 시안 docs/mockups/first90/redesign.html .s-sub-trend). 가짜 일 줄은 이 파일 안에서만 만든다.
// day()는 옛 도우미(v2) 날이라 first90이 없다 → 두 갈래(신환 · 재진(90일초진 포함)). day90()은 새 도우미(v4) 날이다

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]
const CLOSED = '휴진한 날은 칸이 없어요. 막대를 누르면 그날 숫자가 나와요.'
const NOT_LOADED = '휴진한 날과 아직 불러오지 않은 날은 칸이 없어요. 막대를 누르면 그날 숫자가 나와요.'

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
// 새 도우미 날: returning에는 90일초진이 빠져 있다
const day90 = (ymd: string, newPatients: number, first90: number, returning: number, partial = false): DayPayload => ({
  ...day(ymd, newPatients, returning, partial),
  totals: { patients: newPatients + first90 + returning, newPatients, returning, unknown: 0, first90 },
})
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
// 막대 그림(꾸밈)과 그 안 칸 단추
const figureOf = (container: HTMLElement) => container.querySelector('.tabular-nums[aria-hidden="true"]')!
const columnsOf = (container: HTMLElement) => Array.from(figureOf(container).querySelectorAll('button'))
const tokens = (el: Element) => el.className.split(/\s+/).filter(Boolean)

afterEach(cleanup)

describe('AC-513.1·AC-513.2·AC-4412.2: 일별 내원', () => {
  it('AC-513.1·AC-4412.2: h2 "일별 내원" + 범례 + 쌓은 막대 + 아래 글이고 옆 설명은 없다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8)], WHOLE)} saved />)
    const heading = screen.getByRole('heading', { level: 2, name: '일별 내원' })
    expect(heading.parentElement!.textContent).toBe('일별 내원자세히')
    expect(screen.queryByText('신환·재진, 하루씩')).toBeNull()
    expect(screen.getAllByText('신환').length).toBeGreaterThan(0)
    expect(screen.getByRole('table', { name: '일별 내원 (건)' })).toBeTruthy()
    expect(screen.getByText(CLOSED)).toBeTruthy()
    expect(screen.queryByText('일부 기간')).toBeNull()
  })

  it('AC-513.2·AC-4412.2: 두 갈래는 신환 accent·재진 st-ret 면이고 그림은 꾸밈(aria-hidden)이다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8)], WHOLE)} saved />)
    const figure = figureOf(container)
    expect(figure.querySelector('.bg-accent')).not.toBeNull()
    expect(figure.querySelector('.bg-st-ret')).not.toBeNull()
    expect(figure.querySelector('.bg-st-f90')).toBeNull()
    expect(figure.querySelector('.bg-chart-3')).toBeNull()
  })

  it('AC-4412.2: 축 단위 글은 "(건)"이다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8)], WHOLE)} saved />)
    expect(figureOf(container).firstElementChild!.textContent).toBe('(건)')
  })

  it('AC-513.1·AC-4412.2: 칸 31개 이하면 막대 위 합계가 있고 768px 이상에서만 보인다(휴대폰은 모두 숨김)', () => {
    const days = Array.from({ length: 13 }, (_, i) => day(addDays('2026-10-20', i), 2, 8))
    const { container } = render(<PatientTrendSection input={inputOf(days, WHOLE)} saved />)
    const labels = Array.from(figureOf(container).querySelectorAll('.text-ink-2')).map((el) => el.parentElement!)
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) expect(tokens(label)).toContain('max-md:hidden')
    expect(container.innerHTML).not.toContain('max-md:[&amp;_.text-ink-2]:invisible')
  })

  it('AC-513.1: 칸이 32개 이상이면 막대 위 합계를 그리지 않는다', () => {
    const days = Array.from({ length: 32 }, (_, i) => day(addDays('2026-08-20', i), 2, 8))
    const { container } = render(<PatientTrendSection input={inputOf(days, WHOLE, '90d')} saved />)
    expect(figureOf(container).querySelector('.text-ink-2')).toBeNull()
  })

  it('AC-513.1: 덜 끝난 칸이 있으면 범례에 빗금 "일부 기간"이 붙는다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8, true)], WHOLE)} saved />)
    expect(screen.getAllByText('일부 기간').length).toBeGreaterThan(0)
  })
})

describe('AC-4412.2: 세 갈래 · 두 갈래', () => {
  const legendOf = () => within(screen.getAllByRole('list')[1]!).getAllByRole('listitem').map((li) => li.textContent)

  it('AC-4412.2: 모든 칸에 first90이 있으면 위부터 신환 · 90일초진 · 재진 세 갈래이고 범례·화면 읽기 표 열도 그 차례다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day90('2026-11-02', 2, 3, 5)], WHOLE)} saved />)
    expect(legendOf()).toEqual(['신환', '90일초진', '재진'])
    const bar = figureOf(container).querySelector('.bg-accent')!.parentElement!
    expect(Array.from(bar.children).flatMap((el) => tokens(el).filter((name) => name.startsWith('bg-')))).toEqual(['bg-accent', 'bg-st-f90', 'bg-st-ret'])
    const table = screen.getByRole('table', { name: '일별 내원 (건)' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['기간', '신환', '90일초진', '재진', '합계', '상태'])
  })

  it('AC-4412.2: 하나라도 first90이 없으면 두 갈래이고 범례는 "신환" · "재진(90일초진 포함)", 재진 값은 returning + first90이다', () => {
    render(<PatientTrendSection input={inputOf([day90('2026-11-02', 2, 3, 5), day('2026-11-03', 1, 9)], WHOLE)} saved />)
    expect(legendOf()).toEqual(['신환', '재진(90일초진 포함)'])
    expect(screen.queryByText('90일초진')).toBeNull()
    const table = screen.getByRole('table', { name: '일별 내원 (건)' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['기간', '신환', '재진(90일초진 포함)', '합계', '상태'])
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => Array.from(row.children).map((cell) => cell.textContent)),
    ).toEqual([
      ['11월 2일', '2', '8', '10', '완료'],
      ['11월 3일', '1', '9', '10', '완료'],
    ])
  })

  it('AC-4412.2: [자세히] 표 열도 세 갈래면 날짜 · 신환 · 90일초진 · 재진 · 합계다', () => {
    render(<PatientTrendSection input={inputOf([day90('2026-11-02', 2, 3, 5)], WHOLE)} saved />)
    const panel = detail()
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['날짜', '신환', '90일초진', '재진', '합계'])
    expect(rowsOf(panel)).toEqual([['11월 2일 (월)', '2', '3', '5', '10']])
  })
})

describe('AC-4412.2: 막대를 누르면 아래 줄에 그날 숫자', () => {
  const status = () => screen.getByRole('status')

  it('AC-4412.2: 아래 줄(role="status")은 처음 비어 있고, 칸은 탭 순서 밖 단추다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day90('2026-11-02', 2, 3, 5)], WHOLE)} saved />)
    expect(status().textContent).toBe('')
    expect(status().getAttribute('aria-live')).toBe('polite')
    expect(columnsOf(container).map((button) => button.getAttribute('tabindex'))).toEqual(['-1'])
  })

  it('AC-4412.2: 세 갈래 칸을 누르면 "{m.d}({요일}) 내원 {n}건 · 신환 {n} · 90일초진 {n} · 재진 {n}"이고 그 칸이 고른 칸이다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day90('2026-11-02', 2, 3, 5), day90('2026-11-03', 1, 0, 1200)], WHOLE)} saved />)
    fireEvent.click(columnsOf(container)[1]!)
    expect(status().textContent).toBe('11.3(화) 내원 1,201건 · 신환 1 · 90일초진 0 · 재진 1,200')
    expect(tokens(columnsOf(container)[1]!)).toContain('bg-accent-soft')
    expect(tokens(columnsOf(container)[0]!)).not.toContain('bg-accent-soft')
  })

  it('AC-4412.2: 두 갈래면 "· 신환 {n} · 재진(90일초진 포함) {n}"이다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8)], WHOLE)} saved />)
    fireEvent.click(columnsOf(container)[0]!)
    expect(status().textContent).toBe('11.2(월) 내원 10건 · 신환 2 · 재진(90일초진 포함) 8')
  })

  it('AC-4412.2: PC는 올리기만 해도 아래 줄이 바뀐다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8), day('2026-11-04', 3, 4)], WHOLE)} saved />)
    fireEvent.mouseEnter(columnsOf(container)[1]!)
    expect(status().textContent).toBe('11.4(수) 내원 7건 · 신환 3 · 재진(90일초진 포함) 4')
  })

  it('AC-4412.2: 주·달 칸은 칸 기간 글로 시작한다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-10-10', 2, 8), day('2026-11-02', 3, 7)], WHOLE, '12m')} saved />)
    fireEvent.click(columnsOf(container)[0]!)
    expect(status().textContent).toBe('2026년 10월 내원 10건 · 신환 2 · 재진(90일초진 포함) 8')
  })

  it('AC-4412.2: 기간을 바꿔 고른 칸이 없어지면 아래 줄이 빈다', () => {
    const days = [day('2026-11-02', 1, 1), day('2026-11-10', 5, 5)]
    const { container, rerender } = render(<PatientTrendSection input={inputOf(days, WHOLE, '30d')} saved />)
    fireEvent.click(columnsOf(container)[0]!)
    expect(status().textContent).not.toBe('')
    rerender(<PatientTrendSection input={inputOf(days, WHOLE, '7d')} saved />)
    expect(status().textContent).toBe('')
  })

  it('AC-4412.2: 자료 없는 칸(–)은 눌러도 아래 줄이 바뀌지 않는다', () => {
    const pick: StatsPick = { kind: 'month', unit: 'day', month: '2026-10' }
    const input: StatsInput = { days: [day('2026-10-01', 2, 8)], covered: [{ from: '2026-10-01', to: '2026-10-29' }], range: rangeOf('2026-11-06', pick, false) }
    const { container } = render(<PatientTrendSection input={input} saved />)
    const [first, ...blanks] = columnsOf(container)
    fireEvent.click(first!)
    const text = status().textContent
    fireEvent.click(blanks[0]!)
    expect(status().textContent).toBe(text)
  })
})

describe('AC-4417.2: 막대 움직임', () => {
  it('AC-4417.2: 막대·조각에 st-move-period가 붙는다(높이 300ms, 움직임은 globals.css)', () => {
    const { container } = render(<PatientTrendSection input={inputOf([day90('2026-11-02', 2, 3, 5)], WHOLE)} saved />)
    const bar = figureOf(container).querySelector('.bg-accent')!.parentElement!
    expect(tokens(bar)).toContain('st-move-period')
    const pieces = Array.from(bar.children).filter((el) => tokens(el).some((name) => name.startsWith('bg-')))
    expect(pieces).toHaveLength(3)
    for (const piece of pieces) expect(tokens(piece)).toContain('st-move-period')
  })
})

describe('AC-4412.1·AC-4412.2: 내원 구성과 한 줄', () => {
  it('AC-4412.1: 1100px 이상은 내원 구성이 일별 내원 막대 왼쪽(4:8), 좁으면 위다', () => {
    render(<PatientTrendSection input={inputOf([day90('2026-11-02', 2, 3, 5)], WHOLE)} saved className="col-span-12" />)
    const mix = screen.getByRole('heading', { level: 2, name: '내원 구성' }).closest('section')!
    const trend = screen.getByRole('heading', { level: 2, name: '일별 내원' }).closest('section')!
    const row = mix.parentElement!
    expect(trend.parentElement).toBe(row)
    expect(Array.from(row.children)).toEqual([mix, trend])
    expect(tokens(row)).toEqual(expect.arrayContaining(['grid', 'min-[1100px]:grid-cols-[minmax(280px,4fr)_8fr]', 'col-span-12']))
    expect(tokens(row).filter((name) => /grid-cols/.test(name))).toEqual(['min-[1100px]:grid-cols-[minmax(280px,4fr)_8fr]'])
  })

  it('AC-4412.1·AC-4412.2: 환자 카드 안에서는 내원 구성·일별 내원이 h3이고 h2는 카드 제목뿐이다', () => {
    render(
      <StatsCard title="환자" desc="최근 30일 · 10월 14일 – 11월 12일">
        <PatientTrendSection input={inputOf([day90('2026-11-02', 2, 3, 5)], WHOLE)} saved />
      </StatsCard>,
    )
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['환자'])
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['내원 구성', '일별 내원'])
  })

  it('AC-4412.1: 자료가 없으면 내원 구성 없이 일별 내원 빈 글만이다', () => {
    render(<PatientTrendSection input={inputOf([], [])} saved={false} />)
    expect(screen.queryByRole('heading', { name: '내원 구성' })).toBeNull()
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
      const figure = figureOf(container)
      const wrapper = figure.parentElement!.parentElement!
      const names = tokens(wrapper)
      for (const name of ['relative', '[&_.text-center]:flex', '[&_.text-center]:flex-col', '[&_.text-center]:items-center', '[&_table]:right-0']) expect(names, period).toContain(name)
      for (const name of ['[&_table]:whitespace-normal', '[&_table]:break-all']) expect(names, period).not.toContain(name)
      const labelCells = Array.from(figure.lastElementChild!.children)
      expect(labelCells.length, period).toBeGreaterThan(0)
      expect(Array.from(wrapper.querySelectorAll('.text-center')), period).toEqual(labelCells)
      expect(Array.from(wrapper.querySelectorAll('table')).map((table) => table.className), period).toEqual(['sr-only'])
      unmount()
    }
  })
})

describe('AC-513.1·AC-4412.2: 12개월 월별 내원의 끝나지 않은 달 글', () => {
  const ROWS = [day('2026-07-10', 2, 8), day('2026-10-10', 2, 8), day('2026-11-02', 2, 8)]

  it('AC-513.1·AC-4412.2: 제목은 "월별 내원"이고 덜 끝난 칸이 오늘이 든 달뿐이면 아래 글 뒤에 시안 글을 덧붙인다', () => {
    render(<PatientTrendSection input={inputOf(ROWS, WHOLE, '12m')} saved />)
    expect(screen.getByRole('heading', { level: 2, name: '월별 내원' })).toBeTruthy()
    expect(screen.getByText(`${CLOSED} 빗금 칸은 아직 끝나지 않은 달이에요(11월은 13일까지).`)).toBeTruthy()
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

  it('AC-513.1·AC-4412.2: 이번 달이 끝났고 지난달만 덜 덮였어도 끝나지 않은 달 글이 없다(아래 글은 기본 글뿐)', () => {
    const covered = [
      { from: '2024-12-01', to: '2026-08-05' },
      { from: '2026-08-20', to: '2026-11-30' },
    ]
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-08-25', 2, 8)], covered, '12m', '2026-11-30')} saved />)
    expect(container.textContent).not.toContain('끝나지 않은')
    expect(screen.getByText(CLOSED)).toBeTruthy()
  })
})

describe('AC-513.3: 일별 내원 [자세히]', () => {
  it('AC-513.3·AC-4412.2: 일 기간 표는 날짜(요일 포함)·신환·재진(90일초진 포함)·합계이고 합계는 600이다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-11-02', 1200, 34)], WHOLE)} saved />)
    const panel = detail()
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['날짜', '신환', '재진(90일초진 포함)', '합계'])
    expect(rowsOf(panel)).toEqual([['11월 2일 (월)', '1,200', '34', '1,234']])
    expect(within(panel).getByText('1,234').className).toContain('font-semibold')
    expect(within(panel).getByRole('table', { name: '일별 내원 (건)' })).toBeTruthy()
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

  it('AC-513.3·AC-4412.2: 표는 그래프(와 아래 줄)와 안내 글 바로 아래에 열린다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-11-02', 2, 8)], WHOLE)} saved />)
    const chart = screen.getByRole('table', { name: '일별 내원 (건)' }) // 그래프 부품의 화면 읽기 표
    const panel = detail()
    const note = panel.previousElementSibling!
    expect(note.textContent).toBe(CLOSED)
    expect(note.previousElementSibling!.contains(chart)).toBe(true)
    expect(note.previousElementSibling!.contains(screen.getByRole('status'))).toBe(true)
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

describe('AC-513.4: 일별 내원 빈 상태', () => {
  it('AC-513.4·AC-4412.2: 저장된 숫자가 없으면 그래프·[자세히] 없이 시안 문구다', () => {
    render(<PatientTrendSection input={inputOf([], [])} saved={false} />)
    expect(screen.getByRole('heading', { level: 2, name: '일별 내원' })).toBeTruthy()
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러오면 이 기간의 하루하루가 신환·재진 막대로 그려져요.')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-513.4: 저장된 숫자는 있는데 이 기간 자료가 없으면 그 문구다', () => {
    render(<PatientTrendSection input={inputOf([day('2026-01-05', 1, 1)], WHOLE)} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
  })
})

describe('AC-513.13·AC-4412.2: 고른 기간에 덮이지 않은 날이 있을 때의 아래 글', () => {
  const ROW = [day('2026-11-02', 2, 8)] // 오늘이 11월 13일인 '30d'의 고른 기간은 10월 14일 ~ 11월 12일이다
  const expectOld = () => {
    expect(screen.getByText(CLOSED)).toBeTruthy()
    expect(screen.queryByText(NOT_LOADED)).toBeNull()
  }
  const expectNew = () => {
    expect(screen.getByText(NOT_LOADED)).toBeTruthy()
    expect(screen.queryByText(CLOSED)).toBeNull()
  }

  it("AC-513.13: 오늘이 11월 13일인 '30d', 덮은 기간 끝이 어제(11월 12일)이고 오늘은 덮이지 않음 — 지금 글이다", () => {
    render(<PatientTrendSection input={inputOf(ROW, [{ from: '2026-10-14', to: '2026-11-12' }])} saved />)
    expectOld()
  })

  it('AC-513.13: 덮은 기간 끝이 그저께 — 새 문장이다', () => {
    render(<PatientTrendSection input={inputOf(ROW, [{ from: '2026-10-14', to: '2026-11-11' }])} saved />)
    expectNew()
  })

  it('AC-513.13: 첫날(10월 14일)만 덮이지 않음 — 새 문장이다', () => {
    render(<PatientTrendSection input={inputOf(ROW, [{ from: '2026-10-15', to: '2026-11-12' }])} saved />)
    expectNew()
  })

  it('AC-513.13: 가운데에 빈틈이 있는 덮은 기간 둘 — 새 문장이다', () => {
    const covered = [
      { from: '2026-10-14', to: '2026-10-25' },
      { from: '2026-10-28', to: '2026-11-12' },
    ]
    render(<PatientTrendSection input={inputOf(ROW, covered)} saved />)
    expectNew()
  })

  it('AC-513.13: 붙어 있는 덮은 기간 둘이 고른 기간을 다 덮음 — 날마다 보므로 지금 글이다', () => {
    const covered = [
      { from: '2026-10-14', to: '2026-10-25' },
      { from: '2026-10-26', to: '2026-11-12' },
    ]
    render(<PatientTrendSection input={inputOf(ROW, covered)} saved />)
    expectOld()
  })

  it('AC-513.13: input.covered가 비어 있고 일 줄은 있음 — 새 문장이다', () => {
    render(<PatientTrendSection input={inputOf(ROW, [])} saved />)
    expectNew()
  })

  it("AC-513.13: '7d'·'90d'도 같은 판정이다", () => {
    const partOfBoth = [{ from: '2026-11-08', to: '2026-11-11' }]
    for (const period of ['7d', '90d'] as const) {
      const { unmount } = render(<PatientTrendSection input={inputOf([day('2026-11-10', 2, 8)], WHOLE, period)} saved />)
      expectOld()
      unmount()
      const again = render(<PatientTrendSection input={inputOf([day('2026-11-10', 2, 8)], partOfBoth, period)} saved />)
      expectNew()
      again.unmount()
    }
  })

  it("AC-513.13: '12m'에서 덮이지 않은 날이 있음 — 새 문장이 없다", () => {
    const { container } = render(<PatientTrendSection input={inputOf([day('2026-10-10', 2, 8)], [{ from: '2026-08-20', to: '2026-11-12' }], '12m')} saved />)
    expect(container.textContent).not.toContain('아직 불러오지 않은 날')
  })

  it('AC-513.13: 일 줄이 없을 때의 빈 글은 덮이지 않은 날이 있어도 그대로다', () => {
    const { container } = render(<PatientTrendSection input={inputOf([], [{ from: '2026-10-20', to: '2026-11-12' }])} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
    expect(container.textContent).not.toContain('아직 불러오지 않은 날')
  })
})

// ── 고른 기간 (stats-period REQ-1704). 오늘은 2026-11-06(금)이다 ─────────────────
describe('AC-1704.3·AC-1704.4·AC-4412.2: 고른 기간의 일별·주별·월별 내원', () => {
  const P_TODAY = '2026-11-06'
  const OCT_DAY: StatsPick = { kind: 'month', unit: 'day', month: '2026-10' }
  const OCT_WEEK: StatsPick = { kind: 'month', unit: 'week', month: '2026-10' }
  const YEAR: StatsPick = { kind: 'year', year: '2026' }
  const pickOf = (pick: StatsPick, days: DayPayload[], covered: DateRange[], todayDone = false): StatsInput => ({ days, covered, range: rangeOf(P_TODAY, pick, todayDone) })
  const OCT_ROWS = [day('2026-10-01', 2, 8), day('2026-10-05', 3, 7), day('2026-10-12', 1, 1), day('2026-10-19', 4, 4)]

  it('AC-1704.4·AC-4412.2: 제목은 칸 단위를 따른다(일별·주별·월별 내원). 기간 이름은 카드 옆 글이 맡아 칸에는 없다', () => {
    render(<PatientTrendSection input={pickOf(OCT_WEEK, OCT_ROWS, WHOLE)} saved />)
    expect(screen.getByRole('heading', { level: 2, name: '주별 내원' })).toBeTruthy()
    expect(screen.queryByText(/2026년 10월$/)).toBeNull()
    cleanup()
    render(<PatientTrendSection input={pickOf(OCT_DAY, OCT_ROWS, WHOLE)} saved />)
    expect(screen.getByRole('heading', { level: 2, name: '일별 내원' })).toBeTruthy()
    cleanup()
    render(<PatientTrendSection input={pickOf(YEAR, OCT_ROWS, WHOLE)} saved />)
    expect(screen.getByRole('heading', { level: 2, name: '월별 내원' })).toBeTruthy()
  })

  it('AC-1704.3·AC-4412.2: 주별 [자세히] 표는 주 칸이고, 기간에 잘린 주는 "일부 기간", 자료 없는 주는 숫자가 "–"다(0이 아니다)', () => {
    render(<PatientTrendSection input={pickOf(OCT_WEEK, OCT_ROWS, [{ from: '2026-10-01', to: '2026-10-25' }])} saved />)
    const panel = detail()
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['주', '신환', '재진(90일초진 포함)', '합계'])
    expect(rowsOf(panel)).toEqual([
      ['10월 1일 – 4일일부 기간', '2', '8', '10'],
      ['10월 5일 – 11일', '3', '7', '10'],
      ['10월 12일 – 18일', '1', '1', '2'],
      ['10월 19일 – 25일', '4', '4', '8'],
      ['10월 26일 – 31일', '–', '–', '–'],
    ])
    expect(screen.getByText(`${CLOSED} '–'는 자료가 없는 주예요.`)).toBeTruthy()
  })

  it('AC-1704.3·AC-4412.2: 일별은 휴진한 날(줄 없고 덮은 날)만 칸이 없고, 자료 없는 날(줄 없고 덮지 않음)은 표에서 "–"다', () => {
    render(<PatientTrendSection input={pickOf(OCT_DAY, [day('2026-10-01', 2, 8), day('2026-10-02', 1, 1)], [{ from: '2026-10-01', to: '2026-10-29' }])} saved />)
    const panel = detail()
    expect(within(panel).getAllByRole('columnheader')[0]!.textContent).toBe('날짜')
    expect(rowsOf(panel)).toEqual([
      ['10월 1일 (목)', '2', '8', '10'],
      ['10월 2일 (금)', '1', '1', '2'],
      ['10월 30일 (금)', '–', '–', '–'],
      ['10월 31일 (토)', '–', '–', '–'],
    ])
    expect(screen.getByText(`${CLOSED} '–'는 자료가 없는 날이에요.`)).toBeTruthy()
  })

  it('AC-1704.3·AC-4412.2: 일별에 자료 없는 날이 없으면 아래 글은 기본 글뿐이다', () => {
    render(<PatientTrendSection input={pickOf(OCT_DAY, OCT_ROWS, WHOLE)} saved />)
    expect(screen.getByText(CLOSED)).toBeTruthy()
    expect(screen.queryByText(/자료가 없는/)).toBeNull()
  })

  it('AC-1704.3: 월별 [자세히] 표는 달 칸이고, 앞으로 올 달은 표에 없으며, 줄이 없는 달은 "–"다', () => {
    render(<PatientTrendSection input={pickOf(YEAR, [day('2026-03-02', 2, 8), day('2026-10-05', 3, 7)], [{ from: '2026-01-01', to: '2026-11-05' }])} saved />)
    const panel = detail()
    expect(within(panel).getAllByRole('columnheader')[0]!.textContent).toBe('달')
    const rows = rowsOf(panel)
    expect(rows).toHaveLength(11)
    expect(rows[0]).toEqual(['2026년 1월', '–', '–', '–'])
    expect(rows[2]).toEqual(['2026년 3월', '2', '8', '10'])
    expect(rows[9]).toEqual(['2026년 10월', '3', '7', '10'])
    expect(rows[10]).toEqual(['2026년 11월', '–', '–', '–'])
    expect(rows.some(([first]) => first?.startsWith('2026년 12월'))).toBe(false)
    expect(screen.getByText(`${CLOSED} '–'는 자료가 없는 달이에요.`)).toBeTruthy()
  })

  it('AC-1704.3: 고른 기간에 줄이 없으면 지금 빈 글이다', () => {
    render(<PatientTrendSection input={pickOf(OCT_DAY, [day('2026-09-07', 2, 8)], WHOLE)} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
  })
})
