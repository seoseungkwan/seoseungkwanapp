// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CalCountRow } from '@/types/calendar'
import { SummaryLine } from './SummaryLine'

// 보이는 기간 합계 줄 + 나눠 보기 (spec clinic-calendar AC-5907.2, 시안 ?s=summary).
// `예약 N · 취소 N (x.x%) · 변경 N (x.x%) · 안 옴 N (x.x%)`, 누르면 시행자별·종류별 표. 수는 lib/calendar rateSummary

afterEach(cleanup)

const row = (over: Partial<CalCountRow>): CalCountRow => ({
  day: '2026-11-17',
  staffId: 'ga',
  staffName: '한○○',
  kindId: 'dosu',
  kindName: '도수',
  status: 'auto',
  auto: null,
  origDay: null,
  gMoved: false,
  ...over,
})
// 10줄: 취소 2 · 처음 자리 1(취소 아님) · 안 옴 1 (design.md '예')
const ROWS10 = [
  row({ status: 'cancel' }),
  row({ status: 'cancel', staffId: 'na', staffName: '윤○○' }),
  row({ origDay: '2026-11-18' }),
  row({ status: 'noshow' }),
  ...Array.from({ length: 6 }, () => row({})),
]

const line = () => screen.getByRole('button')
const items = (el: HTMLElement) => [...el.querySelectorAll('[data-item]')].map((item) => item.textContent)

describe('AC-5907.2: 합계 줄', () => {
  it('AC-5907.2: 주 보기는 "이 주 합계"와 예약·취소·변경·안 옴 수·비율', () => {
    render(<SummaryLine view="week" from="2026-11-16" to="2026-11-21" rows={ROWS10} />)
    const button = line()
    expect(button.textContent).toContain('이 주 합계')
    expect(items(button)).toEqual(['예약 10', '취소 2 (20.0%)', '변경 1 (10.0%)', '안 옴 1 (10.0%)'])
    expect(button.textContent).toContain('시행자·종류별 ▾')
  })

  it('AC-5907.2: 일 보기는 "이 날 합계", 월 보기는 "이 달 합계"', () => {
    render(<SummaryLine view="day" from="2026-11-17" to="2026-11-17" rows={ROWS10} />)
    expect(line().textContent).toContain('이 날 합계')
    cleanup()
    render(<SummaryLine view="month" from="2026-11-01" to="2026-11-30" rows={ROWS10} />)
    expect(line().textContent).toContain('이 달 합계')
  })

  it('AC-5907.2: 예약이 없으면 0이고 비율은 –', () => {
    render(<SummaryLine view="week" from="2026-11-16" to="2026-11-21" rows={[]} />)
    expect(items(line())).toEqual(['예약 0', '취소 0 (–)', '변경 0 (–)', '안 옴 0 (–)'])
  })

  it('AC-5907.2: 세 자리가 넘으면 쉼표', () => {
    render(<SummaryLine view="month" from="2026-11-01" to="2026-11-30" rows={Array.from({ length: 1203 }, () => row({}))} />)
    expect(items(line())[0]).toBe('예약 1,203')
  })
})

describe("AC-8545.1: 구글과 이은 병원(linked)의 요약 줄 '변경' 수는 g_moved만", () => {
  it('AC-8545.1: linked면 처음 자리만 있는 예약(g_moved 거짓)은 변경이 아니고, g_moved 예약만 센다(나눠 보기 표도 같은 수)', () => {
    const rows = [...ROWS10, row({ gMoved: true })]
    render(<SummaryLine view="week" from="2026-11-16" to="2026-11-21" rows={rows} linked />)
    expect(items(line())).toEqual(['예약 11', '취소 2 (18.2%)', '변경 1 (9.1%)', '안 옴 1 (9.1%)'])
    cleanup()
    render(<SummaryLine view="week" from="2026-11-16" to="2026-11-21" rows={ROWS10} linked />)
    expect(items(line())[2]).toBe('변경 0 (0.0%)')
  })

  it('AC-8545.3: linked를 주지 않으면(잇지 않은 병원) 지금 그대로 처음 자리도 변경이다', () => {
    render(<SummaryLine view="week" from="2026-11-16" to="2026-11-21" rows={[...ROWS10, row({ gMoved: true })]} />)
    expect(items(line())[2]).toBe('변경 2 (18.2%)')
  })
})

describe('AC-5907.2: 누르면 나눠 보기(시행자별·종류별 표)', () => {
  it('AC-5907.2: 처음은 닫혀 있고 누르면 열리며 제목·안내·두 표가 보인다. 다시 누르면 닫힌다', () => {
    render(<SummaryLine view="week" from="2026-11-16" to="2026-11-21" rows={ROWS10} />)
    const button = line()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.textContent).toContain('접기 ▴')
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(within(panel).getByRole('heading', { name: '2026년 11월 16일 – 21일 · 나눠 보기' })).toBeTruthy()
    expect(panel.textContent).toContain('예약 수는 취소 포함·지운 것 빼고 · 비율은 그 줄 예약 수로 나눠요 · 안 옴은 시간이 지난 예약만 · 비트 예약 칸은 세지 않아요')
    expect(within(panel).getAllByRole('table')).toHaveLength(2)
    expect(within(panel).getByText('한○○')).toBeTruthy()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-5907.2: defaultOpen이면 열린 채로 그린다(시안 ?s=summary)', () => {
    render(<SummaryLine view="week" from="2026-11-16" to="2026-11-21" rows={ROWS10} defaultOpen />)
    expect(screen.getAllByRole('table')).toHaveLength(2)
  })
})
