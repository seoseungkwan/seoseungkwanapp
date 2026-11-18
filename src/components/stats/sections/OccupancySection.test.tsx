// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays } from '@/lib/analytics/dates'
import { DEFAULT_CAL_SETTINGS, type ApptStatus, type CalAllDay, type CalSettings, type CalSlotRow } from '@/types/calendar'
import type { CalendarSlots } from './CalendarSection'
import { OccupancySection } from './OccupancySection'
import { StatsCard } from './parts'

// 통계 '예약' 칸 안 '예약 빈자리' (spec stats-insights REQ-6105 AC-6105.2·AC-6105.3, 시안 docs/mockups/stats-insights ⑤).
// 숫자는 받은 줄(listCalendarSlots·listAllDay)을 lib/calendar occupancy로 센다. 저장소는 부르지 않는다(props만). 시행자·차트번호는 지어낸 것이다

afterEach(cleanup)

const TODAY = '2026-11-18' // 수요일. 기간 9월 23일 ~ 11월 17일, 요일마다 8일
const SETTINGS: CalSettings = {
  ...DEFAULT_CAL_SETTINGS,
  staff: [
    { id: 'ga', name: '한○○', mark: '한', color: 'blue' },
    { id: 'na', name: '윤○○', mark: '윤', color: 'teal' },
  ],
  openHour: 9,
  closeHour: 11,
  sunday: false,
}
const slot = (day: string, staffId: string, start: number, status: ApptStatus = 'auto'): CalSlotRow => ({
  day,
  staffId,
  staffName: staffId === 'ga' ? '한○○' : '윤○○',
  kindId: 'dosu',
  kindName: '도수',
  status,
  auto: null,
  start,
  len: 60,
  chart: '90001',
})
const weekly = (first: string, count: number) => Array.from({ length: count }, (_, i) => addDays(first, i * 7))
const MONDAYS = weekly('2026-09-28', 8)
const TUESDAYS = weekly('2026-09-29', 7)
// 자리 = 8일 × 2명 × 60 = 960분. 월 9시 둘 다 → 100%, 월 10시 한○○만 → 50%, 화 9시 둘 다 7일 → 840/960 = 88%
const ROWS: CalSlotRow[] = [
  ...MONDAYS.flatMap((day) => [slot(day, 'ga', 540), slot(day, 'na', 540), slot(day, 'ga', 600)]),
  ...TUESDAYS.flatMap((day) => [slot(day, 'ga', 540), slot(day, 'na', 540)]),
  slot('2026-11-11', 'na', 600, 'cancel'), // 취소 — 뺀다
]
const OFFS: CalAllDay[] = []
const FOOT = '최근 8주. 찬 정도 = 그 시간에 잡힌 예약 분 ÷ (일하는 시행자 수 × 60분). 휴무인 시행자와 취소된 예약은 빼요.'
const EMPTY = '예약이 쌓이면 보여요'

function draw({ slots = { rows: ROWS, offs: OFFS }, settings = SETTINGS, onReread = vi.fn() }: { slots?: CalendarSlots; settings?: CalSettings | null; onReread?: () => void } = {}) {
  render(
    <StatsCard title="예약">
      <OccupancySection slots={slots} today={TODAY} onReread={onReread} {...(settings ? { settings } : {})} />
    </StatsCard>,
  )
  return onReread
}

const heat = () => screen.getByRole('table', { name: '요일·시간마다 예약이 찬 정도 (%)' })
const texts = (tr: HTMLElement) => [...tr.querySelectorAll('th, td')].map((cell) => cell.textContent?.trim())
const levels = (tr: HTMLElement) => [...tr.querySelectorAll('td')].map((cell) => cell.getAttribute('data-level'))
const part = () => screen.getByRole('heading', { name: '예약 빈자리' }).closest('section')!

describe('AC-6105.3: 예약 빈자리 칸', () => {
  it("AC-6105.3: 제목 '예약 빈자리' 아래 고르기 '모두'·시행자 이름들, 요일×시 표(칸에 숫자), 범례, 두 목록, 맨 아래 글", () => {
    draw()
    expect(screen.getByRole('heading', { name: '예약 빈자리' })).toBeTruthy()
    const pick = within(part()).getByRole('group', { name: '시행자' })
    expect(within(pick).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['모두', 'true'],
      ['한○○', 'false'],
      ['윤○○', 'false'],
    ])
    const rows = within(heat()).getAllByRole('row')
    expect(rows.map(texts)).toEqual([
      ['요일', '9시', '10시'],
      ['월', '100', '50'],
      ['화', '88', '0'],
      ['수', '0', '0'],
      ['목', '0', '0'],
      ['금', '0', '0'],
      ['토', '0', '0'],
    ])
    expect(within(part()).getByText('비어 있음')).toBeTruthy()
    expect(within(part()).getByText('꽉 참')).toBeTruthy()
    expect([...part().querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '늘 비는 시간: 화 10시 0% · 수 9시 0% · 수 10시 0%',
      '꽉 차는 시간: 월 9시 100% · 화 9시 88%',
    ])
    expect(within(part()).getByText(FOOT)).toBeTruthy()
  })

  it('AC-6105.3: 칸 색은 네 단계(45 미만·65 미만·85 미만·85 이상)이고 숫자로도 읽힌다. 자리가 0인 칸은 비어 있다', () => {
    // 한○○은 화요일마다 휴무 → 한○○ 화 칸은 자리 0
    const offs: CalAllDay[] = weekly('2026-09-29', 8).map((day) => ({ id: `off-${day}`, day, type: 'off', memo: null, staffId: 'ga', staffName: '한○○' }))
    // 수 9시 6일 × 60 = 360/960 = 38%(0) · 목 9시 10일 → 600/960 = 63%(1) · 금 9시 13일 → 780/960 = 81%(2)
    const extra = [
      ...weekly('2026-09-23', 6).map((day) => slot(day, 'na', 540)),
      ...weekly('2026-09-24', 8).map((day) => slot(day, 'na', 540)),
      ...weekly('2026-09-24', 2).map((day) => slot(day, 'ga', 540)),
      ...weekly('2026-09-25', 8).map((day) => slot(day, 'na', 540)),
      ...weekly('2026-09-25', 5).map((day) => slot(day, 'ga', 540)),
    ]
    draw({ slots: { rows: [...ROWS, ...extra], offs } })
    const rows = within(heat()).getAllByRole('row').slice(1)
    expect(rows.map(texts).slice(0, 5)).toEqual([
      ['월', '100', '50'],
      ['화', '100', '0'], // 화 자리 = 8 × 1명(윤○○) × 60 = 480분, 찬 분 840 → 100
      ['수', '38', '0'],
      ['목', '63', '0'],
      ['금', '81', '0'],
    ])
    expect(rows.map(levels).slice(0, 5)).toEqual([
      ['3', '1'],
      ['3', '0'],
      ['0', '0'],
      ['1', '0'],
      ['2', '0'],
    ])
    fireEvent.click(within(part()).getByRole('button', { name: '한○○' }))
    const ga = within(heat()).getAllByRole('row').slice(1)
    expect(texts(ga[1]!)).toEqual(['화', '', ''])
    expect(levels(ga[1]!)).toEqual(['none', 'none'])
  })

  it('AC-6105.3: 시행자를 고르면 그 시행자 예약·자리로 다시 센다. [모두]로 돌아온다', () => {
    draw()
    fireEvent.click(within(part()).getByRole('button', { name: '한○○' }))
    expect(within(part()).getByRole('button', { name: '한○○' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(part()).getByRole('button', { name: '모두' }).getAttribute('aria-pressed')).toBe('false')
    // 한○○ 자리 = 8 × 60 = 480분: 월 9시·10시 480/480, 화 9시 420/480 = 88%
    expect(within(heat()).getAllByRole('row').slice(1, 3).map(texts)).toEqual([
      ['월', '100', '100'],
      ['화', '88', '0'],
    ])
    expect(within(part()).getByText(/^꽉 차는 시간/).closest('li')!.textContent).toBe('꽉 차는 시간: 월 9시 100% · 월 10시 100%')
    fireEvent.click(within(part()).getByRole('button', { name: '모두' }))
    expect(texts(within(heat()).getAllByRole('row')[1]!)).toEqual(['월', '100', '50'])
  })

  it("AC-6105.2: 85 이상인 칸이 없으면 '꽉 차는 시간' 줄을 그리지 않는다", () => {
    draw({ slots: { rows: MONDAYS.map((day) => slot(day, 'ga', 600)), offs: OFFS } })
    expect([...part().querySelectorAll('li')].map((li) => li.textContent)).toEqual(['늘 비는 시간: 월 9시 0% · 화 9시 0% · 화 10시 0%'])
  })

  it("AC-6105.3: 폰 폭에서 표는 가로로 밀어 보는 칸 안이다(화면 전체는 넘치지 않는다)", () => {
    draw()
    const region = screen.getByRole('region', { name: '예약 빈자리 표, 옆으로 밀어 볼 수 있어요' })
    expect(region.className).toContain('overflow-x-auto')
    expect(region.contains(heat())).toBe(true)
    expect(heat().className).toMatch(/min-w-/)
  })
})

describe('AC-6105.3: 빈 상태·읽는 중·실패', () => {
  it.each<[string, { slots?: CalendarSlots; settings?: CalSettings | null }]>([
    ['시행자가 없는 설정', { settings: { ...SETTINGS, staff: [] } }],
    ['설정이 없음(읽지 못함)', { settings: null }],
    ['기간에 예약이 없음(오늘·57일 전·취소뿐)', { slots: { rows: [slot(TODAY, 'ga', 540), slot('2026-09-22', 'ga', 540), slot('2026-11-16', 'ga', 540, 'cancel')], offs: OFFS } }],
  ])("AC-6105.3: %s이면 '예약이 쌓이면 보여요'만 보인다", (_name, props) => {
    draw(props)
    expect(within(part()).getByText(EMPTY)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('group', { name: '시행자' })).toBeNull()
    expect(screen.queryByText(FOOT)).toBeNull()
  })

  it('AC-6105.3: 읽는 중은 제목만 두고 비워 둔다', () => {
    draw({ slots: 'reading' })
    expect(screen.getByRole('heading', { name: '예약 빈자리' })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText(EMPTY)).toBeNull()
  })

  it('AC-6105.3: 읽기 실패는 이 칸만 오류 카드와 [다시 읽기]', () => {
    const onReread = draw({ slots: 'failed' })
    expect(within(part()).getByRole('alert').textContent).toContain('E-STATS-READ-FAILED')
    fireEvent.click(within(part()).getByRole('button', { name: '다시 읽기' }))
    expect(onReread).toHaveBeenCalledTimes(1)
  })
})
