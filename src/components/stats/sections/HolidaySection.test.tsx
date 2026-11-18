// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WideDays } from '@/components/stats/useWideDays'
import { eachDay, weekdayOf } from '@/lib/analytics/dates'
import { HOLIDAYS } from '@/lib/analytics/holidays'
import type { DayPayload } from '@/types/payload'
import { HolidaySection } from './HolidaySection'
import { StatsCard } from './parts'

// 휴일에 따라 (stats-insights REQ-6107 AC-6107.3, 시안 docs/mockups/stats-insights ⑦ — 날씨 줄 없이 휴일만). 내원 수는 지어낸 값이다.
// 오늘 2026-11-18 → 최근 12달 = 2025-11-18 ~ 2026-11-17

const TODAY = '2026-11-18'
const NOTE = '최근 12달, 같은 요일끼리 견줘요. 공휴일은 2025~2027년 것이 들어 있어요.'
const HOLIDAY = new Set(HOLIDAYS)

function day(ymd: string, patients: number): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients, newPatients: 0, returning: patients, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}
const openDays = (from: string, to: string, visits: (ymd: string) => number) =>
  eachDay({ from, to })
    .filter((ymd) => weekdayOf(ymd) !== 7 && !HOLIDAY.has(ymd))
    .map((ymd) => day(ymd, visits(ymd)))

// 2026-04-27 ~ 06-13: 연휴 다섯(노동절·어린이날·부처님오신날·지방선거·현충일). 평소 100 · 전날 80 · 다음 날 130
const BEFORE = new Set(['2026-04-30', '2026-05-04', '2026-05-23', '2026-06-02', '2026-06-05'])
const AFTER = new Set(['2026-05-02', '2026-05-06', '2026-05-26', '2026-06-04', '2026-06-08'])
const SPRING = openDays('2026-04-27', '2026-06-13', (ymd) => (BEFORE.has(ymd) ? 80 : AFTER.has(ymd) ? 130 : 100))
// 추석 연휴 하나뿐(전날·다음 날 하루씩)
const CHUSEOK = openDays('2026-09-14', '2026-10-02', () => 100)

const wide = (days: readonly DayPayload[], state: WideDays['state'] = 'ready', retry = vi.fn()): WideDays => ({ state, days, retry })
const section = (w: WideDays) => <HolidaySection today={TODAY} wide={w} />
// 진료 운영 카드 안에 놓는다(TASK-7이 잇는 자리)
const inCard = (w: WideDays) => (
  <StatsCard id="stats-ops" title="진료 운영" desc="언제 붐비는지 · 원장님마다">
    {section(w)}
  </StatsCard>
)

const table = () => screen.getByRole('table')
const head = () => within(table()).getAllByRole('columnheader').map((th) => th.textContent)
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const cells = () => bodyRows().map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent))
const vsCell = (row: number) => within(bodyRows()[row]!).getAllByRole('cell')[3]!

afterEach(cleanup)

describe('AC-6107.3 휴일에 따라 칸', () => {
  it('AC-6107.3: 진료 운영 카드 안 h3 "휴일에 따라" 아래 표(칸 날·날 수·하루 평균 내원·평소보다, 줄 평소·연휴 전날·연휴 다음 날)가 보인다', () => {
    render(inCard(wide(SPRING)))
    expect(screen.getByRole('heading', { level: 3, name: '휴일에 따라' })).toBeTruthy()
    expect(head()).toEqual(['날', '날 수', '하루 평균 내원', '평소보다'])
    expect(cells()).toEqual([
      ['평소', '27일', '100명', '—'],
      ['연휴 전날', '5일', '80명', '−20%'],
      ['연휴 다음 날', '5일', '130명', '+30%'],
    ])
  })

  it('AC-6107.3: 평소보다 적으면 빨강, 많으면 초록 글자다(부호로도 읽힌다)', () => {
    render(inCard(wide(SPRING)))
    expect(vsCell(1).innerHTML).toContain('text-negative')
    expect(vsCell(2).innerHTML).toContain('text-positive')
  })

  it('AC-6107.3: 날 수가 5보다 적은 줄은 평소보다 자리에 "아직 적어요"가 흐리게 보인다. 평소 줄은 늘 "—"', () => {
    render(inCard(wide(CHUSEOK)))
    expect(cells()).toEqual([
      ['평소', '12일', '100명', '—'],
      ['연휴 전날', '1일', '100명', '아직 적어요'],
      ['연휴 다음 날', '1일', '100명', '아직 적어요'],
    ])
    expect(within(vsCell(1)).getByText('아직 적어요').className).toContain('text-st-muted')
  })

  it('AC-6107.3: 연휴가 없는 기간이면 전날·다음 날 줄은 0일 · 하루 평균 "—" · "아직 적어요"다', () => {
    render(inCard(wide(openDays('2026-11-02', '2026-11-14', () => 90))))
    expect(cells()).toEqual([
      ['평소', '12일', '90명', '—'],
      ['연휴 전날', '0일', '—', '아직 적어요'],
      ['연휴 다음 날', '0일', '—', '아직 적어요'],
    ])
  })

  it('AC-6107.3: 맨 아래 세는 법 한 줄이 보인다', () => {
    render(inCard(wide(SPRING)))
    expect(screen.getByText(NOTE)).toBeTruthy()
  })

  it('AC-6107.3: 저장된 날이 없으면(최근 12달에 연 날 없음) 칸을 그리지 않는다', () => {
    expect(render(section(wide([]))).container.innerHTML).toBe('')
    cleanup()
    expect(render(section(wide([day('2024-05-02', 100)]))).container.innerHTML).toBe('')
  })

  it('AC-6107.3: 넓은 하루를 읽는 중이면 칸을 그리지 않는다', () => {
    expect(render(section(wide(SPRING, 'reading'))).container.innerHTML).toBe('')
  })

  it('AC-6107.3: 읽기에 실패하면 제목 아래 오류 카드와 [다시 읽기]가 보이고 누르면 retry를 부른다', () => {
    const retry = vi.fn()
    render(inCard(wide([], 'failed', retry)))
    expect(screen.getByRole('heading', { level: 3, name: '휴일에 따라' })).toBeTruthy()
    expect(within(screen.getByRole('alert')).getByText('저장된 통계를 읽지 못했어요')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
