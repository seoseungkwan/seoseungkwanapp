// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalAllDay } from '@/lib/calendar/shapes'
import { DEFAULT_CAL_SETTINGS, type CalCountRow, type CalStaff } from '@/types/calendar'
import { MonthGrid, type MonthGridProps } from './MonthGrid'

// 월 보기(spec clinic-calendar AC-5905.1·AC-5906.3, 시안 ?s=month·기본값 6번): 목록이 아니라 날마다 수만(monthCells).
// 월~일 7칸, 날을 누르면 그날 일 보기. 이름·차트번호 없는 수 세기 줄(listCalendarCounts 모양)만 받는다

afterEach(cleanup)

const STAFF: CalStaff[] = [
  { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
  { id: 'na', name: '윤○○', mark: '나', color: 'basil' },
]
const SETTINGS = { kinds: DEFAULT_CAL_SETTINGS.kinds, staff: STAFF }
const TODAY = '2026-11-17'

const base: CalCountRow = { day: TODAY, staffId: 'ga', staffName: '한○○', kindId: 'dosu', kindName: '도수', status: 'auto', auto: null, origDay: null, gMoved: false }
const row = (over: Partial<CalCountRow>): CalCountRow => ({ ...base, ...over })

const ROWS: CalCountRow[] = [
  // 11/16(지난 날): 도수 2(하나는 auto 안 옴)·주사 1(손으로 안 옴)·취소 도수 1
  row({ day: '2026-11-16', auto: 'noshow' }),
  row({ day: '2026-11-16' }),
  row({ day: '2026-11-16', kindId: 'inj', kindName: '주사', status: 'noshow' }),
  row({ day: '2026-11-16', status: 'cancel' }),
  // 11/17(오늘): 안 옴은 아직 세지 않는다
  row({ day: TODAY, auto: 'noshow' }),
  // 11/18: 도수 2·주사 1·진료 1(11/17에서 옮겨 옴)·취소 도수 1(11/19에서 옮겨 옴) → 변경 1
  row({ day: '2026-11-18' }),
  row({ day: '2026-11-18', staffId: 'na', staffName: '윤○○' }),
  row({ day: '2026-11-18', kindId: 'inj', kindName: '주사' }),
  row({ day: '2026-11-18', kindId: 'visit', kindName: '진료', origDay: TODAY }),
  row({ day: '2026-11-18', status: 'cancel', origDay: '2026-11-19' }),
  // 11/19: 수가 많아도 종류는 설정 차례, 지운 종류는 그 뒤
  row({ day: '2026-11-19', kindId: 'old', kindName: '옛종류' }),
  row({ day: '2026-11-19', kindId: 'old', kindName: '옛종류' }),
  row({ day: '2026-11-19', kindId: 'old', kindName: '옛종류' }),
  row({ day: '2026-11-19', kindId: 'visit', kindName: '진료' }),
  row({ day: '2026-11-19', kindId: 'visit', kindName: '진료' }),
  row({ day: '2026-11-19' }),
  // 달 밖(앞 달 마지막 주)
  row({ day: '2026-10-27' }),
]
const ALLDAY: CalAllDay[] = [
  { id: 'd1', day: '2026-11-16', type: 'memo', memo: '주간 회의 13:00', staffId: null, staffName: null },
  { id: 'd2', day: '2026-11-18', type: 'off', memo: null, staffId: 'na', staffName: '윤○○' },
]

function renderMonth(over: Partial<MonthGridProps> = {}) {
  const props: MonthGridProps = { month: '2026-11', rows: ROWS, allday: ALLDAY, settings: SETTINGS, today: TODAY, onDay: vi.fn(), ...over }
  const view = render(<MonthGrid {...props} />)
  return { ...view, props }
}

const cell = (label: RegExp) => screen.getByRole('button', { name: label })
const kinds = (el: HTMLElement) => el.querySelector('[data-kinds]')?.textContent ?? null

describe('AC-5905.1: 월 보기는 날마다 수만(monthCells), 월~일 7칸', () => {
  it('AC-5905.1: 머리는 월~일, 칸은 그 달을 덮는 주 전부(11월: 10/26 월 ~ 12/6 일, 42칸)다', () => {
    renderMonth()
    const region = screen.getByRole('region', { name: '월 보기' })
    for (const w of ['월', '화', '수', '목', '금', '토', '일']) expect(within(region).getByText(w)).toBeTruthy()
    const cells = within(region).getAllByRole('button')
    expect(cells).toHaveLength(42)
    expect(cells[0].getAttribute('aria-label')).toBe('10월 26일 (월) 예약 0')
    expect(cells[41].getAttribute('aria-label')).toBe('12월 6일 (일) 예약 0')
  })

  it('AC-5905.1: 다섯 주로 덮이는 달은 35칸이다(2026-02: 1/26 ~ 3/1)', () => {
    renderMonth({ month: '2026-02', rows: [], allday: [] })
    const cells = screen.getAllByRole('button')
    expect(cells).toHaveLength(35)
    expect(cells[0].getAttribute('aria-label')).toBe('1월 26일 (월) 예약 0')
    expect(cells[34].getAttribute('aria-label')).toBe('3월 1일 (일) 예약 0')
  })

  it('AC-5905.1: 지난 날 칸은 `예약 N`(취소 뺌)·종류별 수·`안 옴 N`(손으로 고른 안 옴 + 비트 안 옴)이다', () => {
    renderMonth()
    const c16 = cell(/^11월 16일/)
    expect(c16.getAttribute('aria-label')).toBe('11월 16일 (월) 예약 3')
    expect(within(c16).getByText('예약 3')).toBeTruthy()
    expect(kinds(c16)).toBe('도수 2 · 주사 1')
    expect(within(c16).getByText('안 옴 2')).toBeTruthy()
    expect(within(c16).queryByText(/^변경/)).toBeNull()
  })

  it('AC-5905.1: 오늘과 앞날은 안 옴을 세지 않고, 오늘 칸은 표시(aria-current)가 있다', () => {
    renderMonth()
    const today = cell(/^11월 17일/)
    expect(today.getAttribute('aria-current')).toBe('date')
    expect(within(today).queryByText(/안 옴/)).toBeNull()
    expect(cell(/^11월 18일/).getAttribute('aria-current')).toBeNull()
  })

  it('AC-5905.1: 종류별 수는 설정의 종류 차례이고, 목록에 없는 종류(지운 것)는 저장된 이름으로 뒤에 붙는다', () => {
    renderMonth()
    expect(kinds(cell(/^11월 18일/))).toBe('도수 2 · 주사 1 · 진료 1')
    expect(kinds(cell(/^11월 19일/))).toBe('도수 1 · 진료 2 · 옛종류 3')
  })

  it('AC-5905.1: 종일 항목은 칩(메모 · 시행자 휴무는 그 시행자 색)으로 보인다', () => {
    renderMonth()
    expect(within(cell(/^11월 16일/)).getByText('주간 회의 13:00')).toBeTruthy()
    const off = within(cell(/^11월 18일/)).getByText('(나) 윤○○ 휴무')
    expect(off.className).toContain('bg-cal-basil')
  })

  it('AC-5905.1: 예약 없는 날은 수 글이 없고, 달 밖 날은 흐리게 보인다', () => {
    renderMonth()
    const empty = cell(/^11월 20일/)
    expect(empty.getAttribute('aria-label')).toBe('11월 20일 (금) 예약 0')
    expect(within(empty).queryByText(/예약/)).toBeNull()
    expect(kinds(empty)).toBeNull()
    const outside = cell(/^10월 27일/)
    expect(outside.dataset.out).toBe('true')
    expect(within(outside).getByText('예약 1')).toBeTruthy()
    expect(cell(/^11월 16일/).dataset.out).toBeUndefined()
  })

  it('AC-5905.1: 날을 누르면 그날 일 보기로 간다(onDay)', () => {
    const { props } = renderMonth()
    fireEvent.click(cell(/^11월 18일/))
    expect(props.onDay).toHaveBeenCalledWith('2026-11-18')
  })
})

describe('AC-5906.3: 월 칸의 변경 수', () => {
  it('AC-5906.3: 그날로 옮겨 온 취소 아닌 예약 수가 `변경 N`이다(옮겨 온 취소 예약은 세지 않는다)', () => {
    renderMonth()
    expect(within(cell(/^11월 18일/)).getByText('변경 1')).toBeTruthy()
    expect(within(cell(/^11월 18일/)).queryByText(/안 옴/)).toBeNull()
  })
})

describe("AC-8545.1: 구글과 이은 병원(linked)의 월 칸 '변경' 수는 g_moved만", () => {
  it('AC-8545.1: linked면 처음 자리만 있고 g_moved 거짓인 예약은 세지 않고 g_moved 예약만 `변경 N`이다', () => {
    renderMonth({
      linked: true,
      rows: [row({ day: '2026-11-18', origDay: TODAY }), row({ day: '2026-11-19', gMoved: true }), row({ day: '2026-11-19', gMoved: true, origDay: TODAY })],
    })
    expect(cell(/^11월 18일/).textContent).not.toContain('변경')
    expect(cell(/^11월 19일/).textContent).toContain('변경 2')
  })

  it('AC-8545.3: linked를 주지 않으면(잇지 않은 병원) 지금 그대로 처음 자리가 있는 예약도 `변경 N`이다', () => {
    renderMonth({ rows: [row({ day: '2026-11-18', origDay: TODAY })] })
    expect(cell(/^11월 18일/).textContent).toContain('변경 1')
  })
})

describe('AC-6603.3: 휴진일(병원 정보)은 월 칸에 "휴진", 칸이 회색', () => {
  it('AC-6603.3: 휴진일 칸에 "휴진"이 보이고 회색(data-closed)이며, 이름표에도 휴진이 든다. 그날 수는 그대로 센다', () => {
    renderMonth({ settings: { ...SETTINGS, closedDates: ['2026-11-19', '2026-11-20'] } })
    const closed = cell(/^11월 19일/)
    expect(closed.getAttribute('aria-label')).toBe('11월 19일 (목) 휴진 예약 6')
    expect(within(closed).getByText('휴진')).toBeTruthy()
    expect(closed.dataset.closed).toBe('true')
    expect(closed.className).toContain('bg-canvas')
    expect(kinds(closed)).toBe('도수 1 · 진료 2 · 옛종류 3')
    expect(within(cell(/^11월 20일/)).getByText('휴진')).toBeTruthy()
    const open = cell(/^11월 18일/)
    expect(open.dataset.closed).toBeUndefined()
    expect(within(open).queryByText('휴진')).toBeNull()
  })

  it('AC-6603.3: 휴진일 칸을 눌러도 그날 일 보기로 간다(예약은 지금처럼 넣을 수 있다)', () => {
    const { props } = renderMonth({ settings: { ...SETTINGS, closedDates: ['2026-11-19'] } })
    fireEvent.click(cell(/^11월 19일/))
    expect(props.onDay).toHaveBeenCalledWith('2026-11-19')
  })

  it('AC-6603.3: 휴진일을 받지 않으면 "휴진"이 없다(지금 월 보기 그대로)', () => {
    renderMonth()
    expect(screen.queryByText('휴진')).toBeNull()
    expect(document.querySelector('[data-closed]')).toBeNull()
  })
})

describe('AC-7616.1: 월 칸의 반차 휴무 칩', () => {
  it("AC-7616.1: part가 있는 휴무 칩은 '{이름} 오전 휴무'·'{이름} 오후 휴무'(그 시행자 색), part 없는 칩은 지금 그대로다", () => {
    const allday: CalAllDay[] = [
      { id: 'h1', day: '2026-11-13', type: 'off', memo: null, staffId: 'na', staffName: '윤○○', part: 'pm' },
      { id: 'h2', day: '2026-11-20', type: 'off', memo: null, staffId: 'ga', staffName: '한○○', part: 'am' },
      ...ALLDAY,
    ]
    renderMonth({ allday })
    const pm = within(cell(/^11월 13일/)).getByText('(나) 윤○○ 오후 휴무')
    expect(pm.className).toContain('bg-cal-basil')
    expect(within(cell(/^11월 20일/)).getByText('(가) 한○○ 오전 휴무').className).toContain('bg-cal-blueberry')
    expect(within(cell(/^11월 18일/)).getByText('(나) 윤○○ 휴무')).toBeTruthy()
  })
})
