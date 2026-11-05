// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { statsRange } from '@/components/stats/view'
import type { DayPayload } from '@/types/payload'
import { WeekdaySection } from './WeekdaySection'

// 요일별 환자 수 (stats REQ-513 AC-513.1·513.3·513.4, 시안 notes.md §3). 가짜 일 줄은 이 파일 안에서만 만든다

const TODAY = '2026-11-13' // 금요일
const RANGE = statsRange(TODAY, '30d') // 10월 14일 ~ 11월 12일

function day(ymd: string, patients: number, partial = false): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients, newPatients: 1, returning: patients - 1, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 1, within7: null, within14: null },
  }
}

// 월요일 둘(10월 19일·26일) 평균 15명, 화요일 하나 8명. 일요일 없음
const DAYS = [day('2026-10-19', 10), day('2026-10-26', 21), day('2026-10-20', 8)]

afterEach(cleanup)

describe('AC-513.1: 요일별 환자 수', () => {
  it('AC-513.1: h2 + 옆 설명 + 범례 없는 그래프 + 안내 줄이다', () => {
    render(<WeekdaySection days={DAYS} range={RANGE} saved />)
    expect(screen.getByRole('heading', { level: 2, name: '요일별 환자 수' })).toBeTruthy()
    expect(screen.getByText('하루 평균, 요일마다')).toBeTruthy()
    expect(screen.getByText('자료 있는 요일만 보여요. 일요일은 진료한 날이 없어요.')).toBeTruthy()
    expect(screen.queryByText('일부 기간')).toBeNull()
    // 그래프는 StackedBarChart(화면 읽기 표)다
    expect(screen.getByRole('table', { name: '요일별 환자 수 (명)', hidden: true })).toBeTruthy()
  })

  it('AC-513.1: 일요일 자료가 있으면 일요일에 진료한 날이 없다고 쓰지 않는다', () => {
    render(<WeekdaySection days={[...DAYS, day('2026-10-25', 3)]} range={RANGE} saved />)
    expect(screen.getByText('자료 있는 요일만 보여요.')).toBeTruthy()
  })

  it('AC-513.1: 12개월에 오늘(진료 중) 줄이 들면 빗금 범례와 "오늘" 안내를 더한다', () => {
    render(<WeekdaySection days={[...DAYS, day(TODAY, 4, true)]} range={statsRange(TODAY, '12m')} saved />)
    expect(screen.getByText('환자 수', { selector: 'li span' })).toBeTruthy()
    expect(screen.getAllByText('일부 기간').length).toBeGreaterThan(0)
    expect(screen.getByText('자료 있는 요일만 보여요. 일요일은 진료한 날이 없어요. 빗금 막대에는 오늘(진료 중) 숫자가 들어 있어요.')).toBeTruthy()
  })

  it('AC-513.1: 덜 끝난 줄이 오늘이 아니면 빗금과 "일부 기간"만이고 오늘이라고 쓰지 않는다', () => {
    render(<WeekdaySection days={[...DAYS, day('2026-11-12', 4, true)]} range={RANGE} saved />)
    expect(screen.getByText('환자 수', { selector: 'li span' })).toBeTruthy()
    expect(screen.getAllByText('일부 기간').length).toBeGreaterThan(0)
    expect(screen.getByText('자료 있는 요일만 보여요. 일요일은 진료한 날이 없어요.')).toBeTruthy()
    expect(screen.queryByText(/오늘\(진료 중\)/)).toBeNull()
  })

  it('AC-513.1: 오늘 줄이 덜 끝났어도 고른 기간 밖이면(최근 30일) "오늘(진료 중)"을 쓰지 않고 빗금도 없다', () => {
    render(<WeekdaySection days={[...DAYS, day(TODAY, 4, true)]} range={RANGE} saved />)
    expect(screen.getByText('자료 있는 요일만 보여요. 일요일은 진료한 날이 없어요.')).toBeTruthy()
    expect(screen.queryByText(/오늘\(진료 중\)/)).toBeNull()
    expect(screen.queryByText('일부 기간')).toBeNull()
  })
})

describe('AC-513.3: 요일별 [자세히]', () => {
  it('AC-513.3: 표는 그래프와 안내 글 바로 아래에 열린다', () => {
    render(<WeekdaySection days={DAYS} range={RANGE} saved />)
    const chart = screen.getByRole('table', { name: '요일별 환자 수 (명)' }) // 그래프 부품의 화면 읽기 표
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const button = screen.getByRole('button', { name: '접기' })
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!
    const note = panel.previousElementSibling!
    expect(note.textContent).toBe('자료 있는 요일만 보여요. 일요일은 진료한 날이 없어요.')
    expect(note.previousElementSibling!.contains(chart)).toBe(true)
    expect(panel.parentElement!.lastElementChild).toBe(panel)
  })

  it('AC-513.3: 표는 요일 · 하루 평균 · 자료 있는 날이다', () => {
    render(<WeekdaySection days={DAYS} range={RANGE} saved />)
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const table = screen.getByRole('table', { name: '요일별 환자 수' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['요일', '하루 평균', '자료 있는 날'])
    const rows = within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((td) => td.textContent))
    expect(rows).toEqual([
      ['월요일', '15명', '2일'],
      ['화요일', '8명', '1일'],
    ])
  })

  it('AC-513.3: 덜 끝난 줄이 든 요일 칸에는 칩이 붙는다', () => {
    render(<WeekdaySection days={[...DAYS, day('2026-11-12', 4, true)]} range={RANGE} saved />)
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const table = screen.getByRole('table', { name: '요일별 환자 수' })
    expect(within(table).getByText('일부 기간').className).toContain('text-warning')
    expect(within(table).getByText('목요일').textContent).toBe('목요일일부 기간')
  })

  it('AC-513.3: 같은 날 줄이 둘이어도 자료 있는 날은 하루로 센다', () => {
    render(<WeekdaySection days={[...DAYS, day('2026-10-20', 9)]} range={RANGE} saved />)
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const table = screen.getByRole('table', { name: '요일별 환자 수' })
    expect(within(within(table).getAllByRole('row')[2]!).getAllByRole('cell').map((td) => td.textContent)).toEqual(['화요일', '9명', '1일'])
  })

  it('AC-513.3: 기간 밖 줄은 세지 않는다', () => {
    render(<WeekdaySection days={[...DAYS, day('2026-09-21', 40)]} range={RANGE} saved />)
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const table = screen.getByRole('table', { name: '요일별 환자 수' })
    expect(within(within(table).getAllByRole('row')[1]!).getAllByRole('cell').map((td) => td.textContent)).toEqual(['월요일', '15명', '2일'])
  })
})

describe('AC-513.4: 요일별 빈 상태', () => {
  it('AC-513.4: 저장된 숫자가 없으면 그래프·[자세히] 없이 목업 문구다', () => {
    render(<WeekdaySection days={[]} range={RANGE} saved={false} />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러오면 요일마다 하루 평균 환자 수가 보여요.')
    expect(screen.queryByRole('table', { hidden: true })).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('AC-513.4: 저장된 숫자는 있는데 이 기간 자료가 없으면 그 문구다', () => {
    render(<WeekdaySection days={[day('2026-01-05', 3)]} range={RANGE} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
  })
})
