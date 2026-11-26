// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAL_SETTINGS, type ApptStatus, type CalCountRow, type CalSettings, type CalSlotRow } from '@/types/calendar'
import { CalendarSection, CALENDAR_DESC, type CalendarRows, type StatsCalendarShown } from './CalendarSection'
import { StatsCard } from './parts'

// 통계 탭 '예약' 칸 (spec clinic-calendar AC-5907.3, 시안 ?s=stats).
// 이번 달을 넣은 최근 12달: 달마다 예약 수 막대 + 세 비율 선 + 월별 표, 고른 달의 시행자별·종류별 표, 세는 법.
// 숫자는 받은 줄(listCalendarCounts, 이름·차트번호·메모 없음)을 lib/calendar rateSummary·monthTrend로 센다. 저장소는 부르지 않는다(props만)

afterEach(cleanup)

const TODAY = '2026-11-17'
const row = (day: string, over: Partial<CalCountRow> = {}): CalCountRow => ({
  day,
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
// 10월: 10줄(취소 2·변경 1·안 옴 1), 9월: 4줄(취소 1), 11월(진행 중): 3줄, 2025-11(12달 밖): 5줄
const ROWS: CalCountRow[] = [
  row('2026-10-02', { status: 'cancel' }),
  row('2026-10-05', { status: 'cancel', staffId: 'na', staffName: '윤○○' }),
  row('2026-10-06', { origDay: '2026-10-01' }),
  row('2026-10-07', { auto: 'noshow', kindId: 'inj', kindName: '주사' }),
  ...Array.from({ length: 6 }, (_, i) => row(`2026-10-1${i}`)),
  row('2026-09-03', { status: 'cancel' }),
  ...Array.from({ length: 3 }, (_, i) => row(`2026-09-1${i}`, { staffId: 'na', staffName: '윤○○' })),
  ...Array.from({ length: 3 }, (_, i) => row(`2026-11-0${i + 1}`)),
  ...Array.from({ length: 5 }, (_, i) => row(`2025-11-1${i}`)),
]

const values = (tr: HTMLElement) => [...tr.querySelectorAll('th, td')].map((cell) => (cell.querySelector('[data-n]') ?? cell).textContent?.trim())

function draw(rows: CalendarRows = ROWS, onReread = vi.fn(), extra: Partial<StatsCalendarShown> = {}) {
  render(
    <StatsCard id="stats-calendar" title="예약">
      <CalendarSection rows={rows} today={TODAY} onReread={onReread} {...extra} />
    </StatsCard>,
  )
  return onReread
}

const monthTable = () => {
  const heading = screen.getByRole('heading', { name: '월별 숫자' })
  return within(heading.closest('section')!).getByRole('table')
}

describe('AC-5907.3: 통계 예약 칸 — 12달 그림·표', () => {
  it('AC-5907.3: 카드 옆 글과 칸 제목들이 시안 그대로', () => {
    draw()
    expect(CALENDAR_DESC).toBe('최근 12개월 · 예약 탭에 넣은 예약으로 세요(비트에서 불러오지 않아도 돼요) · 위 기간과 상관없이 늘 12개월 · 예약은 1년만 남아요')
    expect(screen.getByText(CALENDAR_DESC)).toBeTruthy()
    for (const name of ['월별 예약 수', '취소율 · 변경율 · 안 옴율', '월별 숫자', '2026년 10월 나눠 보기']) {
      expect(screen.getByRole('heading', { name }), name).toBeTruthy()
    }
    expect(screen.getByText('취소 포함 · 지운 예약 빼고')).toBeTruthy()
    expect(screen.getByText('그 달 예약 수로 나눠요')).toBeTruthy()
    expect(screen.getByText('줄을 누르면 아래 표가 그 달로 바뀌어요')).toBeTruthy()
    expect(
      screen.getByText('막대나 달 칸에 마우스를 올리면 숫자가 나오고, 누르면 아래 표가 그 달로 바뀌어요. 11월은 아직 진행 중이라(17일부터는 앞으로 올 예약) 안 옴율이 낮게 나와요.'),
    ).toBeTruthy()
  })

  it('AC-5907.3: 월별 숫자 표는 이번 달을 넣은 12달(지난해 12월 ~ 이번 달)과 12개월 합계, 이번 달에 진행 중 꼬리표', () => {
    draw()
    const rows = within(monthTable()).getAllByRole('row')
    expect(values(rows[0]!)).toEqual(['달', '예약', '취소', '취소율', '변경', '변경율', '안 옴', '안 옴율'])
    const body = rows.slice(1, -1).map(values)
    expect(body.map((r) => r[0])).toEqual([
      '2025년 12월',
      '2026년 1월',
      '2026년 2월',
      '2026년 3월',
      '2026년 4월',
      '2026년 5월',
      '2026년 6월',
      '2026년 7월',
      '2026년 8월',
      '2026년 9월',
      '2026년 10월',
      '2026년 11월진행 중',
    ])
    expect(body[0]).toEqual(['2025년 12월', '0', '0', '–', '0', '–', '0', '–'])
    expect(body[9]).toEqual(['2026년 9월', '4', '1', '25.0%', '0', '0.0%', '0', '0.0%'])
    expect(body[10]).toEqual(['2026년 10월', '10', '2', '20.0%', '1', '10.0%', '1', '10.0%'])
    expect(values(rows[rows.length - 1]!)).toEqual(['12개월', '17', '3', '17.6%', '1', '5.9%', '1', '5.9%'])
  })

  it('AC-5907.3: 막대 그림의 화면 읽기 표도 12달 예약 수다', () => {
    draw()
    const table = screen.getByRole('table', { name: '월별 예약 수 (건)' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(12)
    expect(values(rows[10]!)).toEqual(['2026년 10월', '10', '10', '완료'])
    expect(values(rows[11]!)).toEqual(['2026년 11월', '3', '3', '집계 중'])
  })

  it('AC-5907.3: 선 그림 범례(취소율·변경율·안 옴율·이번 달)와 끝 이름표(이번 달 비율)', () => {
    draw()
    const chart = screen.getByRole('heading', { name: '취소율 · 변경율 · 안 옴율' }).closest('section')!
    for (const words of ['취소율', '변경율', '안 옴율', '이번 달(진행 중)']) expect(within(chart).getAllByText(words).length, words).toBeGreaterThan(0)
  })
})

describe('AC-5907.3: 고른 달 나눠 보기', () => {
  it('AC-5907.3: 처음은 지난달(마지막으로 다 찬 달)이고 시행자별·종류별 표가 그 달 숫자다', () => {
    draw()
    const part = screen.getByRole('heading', { name: '2026년 10월 나눠 보기' }).closest('section')!
    const [staff, kinds] = within(part).getAllByRole('table')
    // stats-insights AC-6104.3: 기존 칸 뒤에 '다시 예약'·'12달 예약 수'(slots를 주지 않으면 다시 예약은 '—')
    expect(within(staff!).getAllByRole('row').map(values)).toEqual([
      ['시행자', '예약', '취소', '취소율', '변경', '변경율', '안 옴', '안 옴율', '다시 예약', '12달 예약 수'],
      ['한○○', '9', '1', '11.1%', '1', '11.1%', '1', '11.1%', '—', ''],
      ['윤○○', '1', '1', '100.0%', '0', '0.0%', '0', '0.0%', '—', ''],
      ['합계', '10', '2', '20.0%', '1', '10.0%', '1', '10.0%', '', ''],
    ])
    expect(within(kinds!).getAllByRole('row').map((r) => values(r).slice(0, 2))).toEqual([
      ['종류', '예약'],
      ['도수', '9'],
      ['주사', '1'],
      ['합계', '10'],
    ])
  })

  it('AC-5907.3: 월별 표 줄을 누르면 그 달, ‹ ›로 앞뒤 달(끝에서는 막힘), 이번 달은 진행 중 꼬리표', () => {
    draw()
    fireEvent.click(within(monthTable()).getByRole('button', { name: '2026년 9월' }))
    expect(screen.getByRole('heading', { name: '2026년 9월 나눠 보기' })).toBeTruthy()
    expect(within(monthTable()).getByRole('button', { name: '2026년 9월' }).getAttribute('aria-current')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '이전 달' }))
    expect(screen.getByRole('heading', { name: '2026년 8월 나눠 보기' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(screen.getByRole('heading', { name: /^2026년 11월 나눠 보기/ }).textContent).toContain('진행 중')
    expect((screen.getByRole('button', { name: '다음 달' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-5907.3: 세는 법(펼쳐 둠)', () => {
    draw()
    const how = screen.getByText('세는 법').closest('details')!
    expect(how.open).toBe(true)
    expect([...how.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '예약 수: 그 달에 잡혀 있는 예약. 취소한 예약은 넣고, 지운 예약과 비트 예약 칸은 빼요.',
      '취소: [예약 취소]를 누른 예약. 취소율 = 취소 ÷ 예약 수.',
      '변경: [고치기]로 날짜나 시작 시간을 옮긴 예약. 옮긴 뒤 날짜의 달에 세고, 여러 번 옮겨도 한 번이에요. 길이·담당·종류·메모만 바꾼 건 빼요.',
      "안 옴: 예약 시간이 끝났는데 비트 접수가 없거나 손으로 '안 옴'을 고른 예약. 취소한 예약은 빼요.",
      '비율은 소수 첫째 자리까지(반올림). 시행자·종류는 예약에 적힌 담당·종류로 나눠요.',
    ])
  })
})

describe('AC-5907.3: 빈 상태·읽는 중·실패', () => {
  it("AC-5907.3: 12달에 예약이 없으면 '예약 탭에 적은 예약이 없어요'이고 그림·표가 없다", () => {
    draw([row('2025-10-01')])
    expect(screen.getByText('예약 탭에 적은 예약이 없어요')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-5907.3: 읽는 중은 비워 둔다', () => {
    draw('reading')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('예약 탭에 적은 예약이 없어요')).toBeNull()
  })

  it('AC-5907.3: 읽기 실패는 오류 카드와 [다시 읽기]', () => {
    const onReread = draw('failed')
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(onReread).toHaveBeenCalledTimes(1)
  })
})

// ── stats-insights REQ-6104·REQ-6105: 시행자 표 두 칸 더함 · 예약 빈자리 (시안 docs/mockups/stats-insights ④⑤). 차트번호·시행자는 지어낸 것이다 ──
const slot = (day: string, chart: string, staffId: string | null = 'ga', status: ApptStatus = 'came'): CalSlotRow => ({
  day,
  staffId,
  staffName: staffId === null ? null : staffId === 'ga' ? '한○○' : '윤○○',
  kindId: 'dosu',
  kindName: '도수',
  status,
  auto: null,
  start: 600,
  len: 30,
  chart,
})
// 한○○: 다섯 명이 와서 셋이 14일 안에 같은 시행자 예약을 또 잡음 → 60%. 윤○○: 둘만 와서 대상이 5보다 적음 → '—'
const SLOTS: CalSlotRow[] = [
  slot('2026-10-01', '91001'),
  slot('2026-10-05', '91001', 'ga', 'auto'),
  slot('2026-10-02', '91002'),
  slot('2026-10-09', '91002', 'ga', 'auto'),
  slot('2026-10-03', '91003'),
  slot('2026-10-10', '91003', 'ga', 'auto'),
  slot('2026-10-04', '91004'),
  slot('2026-10-06', '91005'),
  slot('2026-10-01', '92001', 'na'),
  slot('2026-10-02', '92002', 'na'),
]
const WITH_STAFF: CalSettings = {
  ...DEFAULT_CAL_SETTINGS,
  staff: [
    { id: 'ga', name: '한○○', mark: '한', color: 'blueberry' },
    { id: 'na', name: '윤○○', mark: '윤', color: 'basil' },
  ],
}
const REBOOK_NOTE = '다시 예약 = 와서 치료받은 환자 가운데 14일 안에 같은 시행자 예약이 또 잡힌 비율(최근 12달)'
const staffTable = () => within(screen.getByRole('heading', { name: '2026년 10월 나눠 보기' }).closest('section')!).getAllByRole('table')[0]!

describe('AC-6104.3: 시행자 표 — 다시 예약 · 12달 예약 수', () => {
  it("AC-6104.3: 기존 칸 뒤에 '다시 예약'({p}%, 대상이 5보다 적으면 '—')과 '12달 예약 수'가 더해진다", () => {
    draw(ROWS, vi.fn(), { slots: { rows: SLOTS, offs: [] } })
    const rows = within(staffTable()).getAllByRole('row').map(values)
    expect(rows[0]!.slice(-3)).toEqual(['안 옴율', '다시 예약', '12달 예약 수'])
    expect(rows.slice(1).map((r) => [r[0], r[8]])).toEqual([
      ['한○○', '60%'],
      ['윤○○', '—'],
      ['합계', ''],
    ])
  })

  it('AC-6104.3: 12달 예약 수는 달마다 예약 수 작은 막대 12개(이번 달을 넣은 12달, 취소 포함)이고 접근성 이름은 {시행자} 12달 예약 수', () => {
    draw()
    const ga = within(staffTable()).getByRole('img', { name: '한○○ 12달 예약 수' })
    const na = within(staffTable()).getByRole('img', { name: '윤○○ 12달 예약 수' })
    // 한○○: 9월 1 · 10월 9 · 11월 3, 윤○○: 9월 3 · 10월 1. 높이는 두 사람 가운데 가장 많은 달(9건) 대비
    const heights = (spark: HTMLElement) => [...spark.querySelectorAll('span')].map((bar) => bar.style.height)
    expect(heights(ga)).toEqual(['0%', '0%', '0%', '0%', '0%', '0%', '0%', '0%', '0%', '11%', '100%', '33%'])
    expect(heights(na)).toEqual(['0%', '0%', '0%', '0%', '0%', '0%', '0%', '0%', '0%', '33%', '11%', '0%'])
  })

  it('AC-6104.3: 설정이 있으면 줄 이름은 (표시) 이름이고 막대 이름은 시행자 이름이다. 예약 없는 시행자도 줄이 있다', () => {
    const settings: CalSettings = { ...WITH_STAFF, staff: [...WITH_STAFF.staff, { id: 'da', name: '조○○', mark: '조', color: 'grape' }] }
    draw(ROWS, vi.fn(), { settings, slots: { rows: SLOTS, offs: [] } })
    const rows = within(staffTable()).getAllByRole('row').map(values)
    expect(rows.slice(1).map((r) => [r[0], r[1], r[8]])).toEqual([
      ['(한) 한○○', '9', '60%'],
      ['(윤) 윤○○', '1', '—'],
      ['(조) 조○○', '0', '—'],
      ['합계', '10', ''],
    ])
    expect(within(staffTable()).getByRole('img', { name: '조○○ 12달 예약 수' })).toBeTruthy()
  })

  it("AC-8503.3: 시행자 없는 예약(세 칸 null)은 시행자 표에 '시행자 없음' 한 줄로 묶이고, 12달 막대·다시 예약도 그 묶음이다(설정이 있어도 아래 줄)", () => {
    const none = (day: string, over: Partial<CalCountRow> = {}) => row(day, { staffId: null, staffName: null, ...over })
    const rows = [...ROWS, none('2026-10-03'), none('2026-10-04', { status: 'cancel' }), none('2026-09-20')]
    const slots = [...SLOTS, ...['93001', '93002', '93003', '93004', '93005'].map((chart, i) => slot(`2026-10-1${i}`, chart, null)), slot('2026-10-19', '93001', null, 'auto')]
    draw(rows, vi.fn(), { settings: WITH_STAFF, slots: { rows: slots, offs: [] } })
    const lines = within(staffTable()).getAllByRole('row').map(values)
    expect(lines.slice(1).map((r) => [r[0], r[1], r[2], r[8]])).toEqual([
      ['(한) 한○○', '9', '1', '60%'],
      ['(윤) 윤○○', '1', '1', '—'],
      ['시행자 없음', '2', '1', '20%'],
      ['합계', '12', '3', ''],
    ])
    expect(within(staffTable()).getByRole('img', { name: '시행자 없음 12달 예약 수' })).toBeTruthy()
  })

  it("AC-6104.3: 표 아래 '다시 예약 = … 비율(최근 12달)'이 보인다", () => {
    draw()
    expect(screen.getByText(REBOOK_NOTE)).toBeTruthy()
  })

  it("AC-6104.3: 다시 예약 줄을 읽지 못하면(failed) 다시 예약은 '—'이고 표는 그대로다", () => {
    draw(ROWS, vi.fn(), { slots: 'failed' })
    expect(within(staffTable()).getAllByRole('row').map((r) => values(r)[8])).toEqual(['다시 예약', '—', '—', ''])
  })
})

describe('AC-6105.3: 예약 칸 안 예약 빈자리', () => {
  it("AC-6105.3: slots를 주면 나눠 보기 뒤에 '예약 빈자리' 칸이 있고, 주지 않으면 없다", () => {
    draw(ROWS, vi.fn(), { settings: WITH_STAFF, slots: { rows: SLOTS, offs: [] } })
    const occupancy = screen.getByRole('heading', { name: '예약 빈자리' }).closest('section')!
    const split = screen.getByRole('heading', { name: '2026년 10월 나눠 보기' }).closest('section')!
    expect(split.compareDocumentPosition(occupancy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(occupancy).getByRole('group', { name: '시행자' })).toBeTruthy()
    cleanup()
    draw()
    expect(screen.queryByRole('heading', { name: '예약 빈자리' })).toBeNull()
  })

  it('AC-6105.3: 예약 빈자리 읽기만 실패하면 그 칸만 오류 카드이고 위 표·그림은 그대로다', () => {
    draw(ROWS, vi.fn(), { slots: 'failed' })
    const occupancy = screen.getByRole('heading', { name: '예약 빈자리' }).closest('section')!
    expect(within(occupancy).getByRole('alert')).toBeTruthy()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '월별 숫자' })).toBeTruthy()
  })
})
