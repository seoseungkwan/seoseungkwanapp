// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAL_SETTINGS, type CalAllDay, type CalAppt, type CalStaff } from '@/types/calendar'
import { BLOCK_GUTTER_PX, placeStyle } from './ApptBlock'
import { GHOST_NOTE } from './GhostBlock'
import { TimeGrid, type TimeGridProps } from './TimeGrid'

// 예약표 일·주 시간 표(spec clinic-calendar REQ-5905·REQ-5906, design.md '화면' rows/TimeGrid, 시안 ?s=week·day·empty).
// 울타리 안 부품: 받은 예약·종일 줄·비트 예약 칸을 그리고 누름은 콜백으로만 넘긴다. 이름은 ○○로 가린 가짜, 차트번호는 지어낸 값

afterEach(cleanup)

const STAFF: CalStaff[] = [
  { id: 'ga', name: '한○○', mark: '가', color: 'blue' },
  { id: 'na', name: '윤○○', mark: '나', color: 'teal' },
  { id: 'da', name: '조○○', mark: '다', color: 'purple' },
  { id: 'won', name: '원장님', mark: '원', color: 'gray' },
]
const SETTINGS = { ...DEFAULT_CAL_SETTINGS, staff: STAFF } // 08:00–20:00
const WEEK = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']
const TODAY = '2026-11-17'

const base: CalAppt = {
  id: '',
  day: TODAY,
  start: 540,
  len: 30,
  name: '',
  chart: null,
  staffId: 'ga',
  staffName: '한○○',
  staffMark: '가',
  kindId: 'dosu',
  kindName: '도수',
  memo: '',
  status: 'auto',
  auto: null,
  origDay: null,
  origStart: null,
}
const appt = (over: Partial<CalAppt>): CalAppt => ({ ...base, ...over })

const APPTS: CalAppt[] = [
  appt({ id: 'a-moved', start: 570, chart: '10231', name: '김○○', memo: '허리 · 3회차', auto: 'came', origDay: '2026-11-18', origStart: 900 }),
  appt({ id: 'a-noshow', start: 540, chart: '23580', name: '정○○', staffId: 'na', staffName: '윤○○', staffMark: '나', kindId: 'jabo', kindName: '자보도수', auto: 'noshow' }),
  appt({ id: 'a-cancel', start: 600, chart: '18842', name: '문○○', staffId: 'da', staffName: '조○○', staffMark: '다', status: 'cancel' }),
  appt({ id: 'a-inj', start: 620, len: 10, chart: '30117', name: '송○○', staffId: 'won', staffName: '원장님', staffMark: '원', kindId: 'inj', kindName: '주사', status: 'came' }),
  appt({ id: 'a-16', day: '2026-11-16', start: 900, chart: '27741', name: '홍○○' }),
  appt({ id: 'a-late', day: '2026-11-18', start: 1260, chart: '10457', name: '박○○' }),
  appt({ id: 'a-new', day: '2026-11-19', start: 600, name: '신○○', staffId: 'gone', staffName: '퇴사○○', staffMark: '퇴' }),
]
const ALLDAY: CalAllDay[] = [
  { id: 'd1', day: '2026-11-16', type: 'memo', memo: '주간 회의 13:00', staffId: null, staffName: null },
  { id: 'd2', day: '2026-11-18', type: 'off', memo: null, staffId: 'na', staffName: '윤○○' },
  { id: 'd3', day: '2026-11-20', type: 'off', memo: null, staffId: 'gone', staffName: '퇴사○○' },
]
const GHOSTS = [{ key: 'g1', day: TODAY, start: 660, chart: '25190', name: '오○○' }]

function renderGrid(over: Partial<TimeGridProps> = {}) {
  const props: TimeGridProps = {
    days: WEEK,
    settings: SETTINGS,
    appts: APPTS,
    allday: ALLDAY,
    today: TODAY,
    nowMin: 640,
    onSlot: vi.fn(),
    onAppt: vi.fn(),
    onGhost: vi.fn(),
    onAllDay: vi.fn(),
    onDay: vi.fn(),
    onAdd: vi.fn(),
    ...over,
  }
  const view = render(<TimeGrid {...props} />)
  return { ...view, props }
}

const block = (name: RegExp) => screen.getByRole('button', { name })
const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
const column = (container: HTMLElement, day: string) => container.querySelector<HTMLElement>(`[data-slot-day="${day}"]`)!

// jsdom은 자리를 셈하지 않아(모두 0) 날 칸 자리를 시험에서 정한다: 왼쪽 0 · 위 0 · 폭 200px → 오른쪽 빈 줄은 x 180~200
const COL_W = 200
function placed(el: HTMLElement) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: COL_W,
    bottom: 1440,
    width: COL_W,
    height: 1440,
    toJSON: () => ({}),
  } as DOMRect)
  return el
}
// jsdom은 calc 글을 제 모양으로 다시 적는다(예: `calc(1px + 0.5 * (100% - 20px))`) — 명세 글을 같은 길로 돌려 견준다
function css(value: string) {
  const probe = document.createElement('div')
  probe.style.left = value
  expect(probe.style.left).not.toBe('')
  return probe.style.left
}
const box = (el: HTMLElement) => [el.style.left, el.style.width]
const ONE = [css('calc((100% - 20px) * 0.0000 + 1px)'), css('calc((100% - 20px) * 1.0000 - 2px)')]
const HALF_L = [css('calc((100% - 20px) * 0.0000 + 1px)'), css('calc((100% - 20px) * 0.5000 - 2px)')]
const HALF_R = [css('calc((100% - 20px) * 0.5000 + 1px)'), css('calc((100% - 20px) * 0.5000 - 2px)')]
const hoverBox = (container: HTMLElement, kind: 'edge' | 'full') => container.querySelector<HTMLElement>(`[data-hover="${kind}"]`)

describe('AC-5905.1: 주 보기 시간 표(10분 = 20px, 보이는 시간, 오늘 칸·지금 선)', () => {
  it('AC-5905.1: 날짜 머리는 설정이 준 날(월~토)마다 하나이고, 오늘은 "· 오늘"과 취소를 뺀 예약 수(보이는 시간 밖 예약 포함)다', () => {
    renderGrid()
    expect(screen.getByRole('region', { name: '예약표' })).toBeTruthy()
    const heads = WEEK.map((day) => screen.getByRole('button', { name: new RegExp(`^${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일`) }))
    expect(heads.map((h) => h.getAttribute('aria-label'))).toEqual([
      '11월 16일 (월) 예약 1',
      '11월 17일 (화) 오늘 예약 3',
      '11월 18일 (수) 예약 1',
      '11월 19일 (목) 예약 1',
      '11월 20일 (금) 예약 0',
      '11월 21일 (토) 예약 0',
    ])
    expect(text(heads[1])).toBe('17 화 · 오늘 예약 3')
    expect(text(heads[4])).toBe('20 금')
  })

  it('AC-5905.1: 날짜 머리를 누르면 그날 일 보기로 간다(onDay)', () => {
    const { props } = renderGrid()
    fireEvent.click(screen.getByRole('button', { name: '11월 19일 (목) 예약 1' }))
    expect(props.onDay).toHaveBeenCalledWith('2026-11-19')
  })

  it('AC-5905.1: 시간 줄은 보이는 시간(08:00~19:00) 한 시간마다이고, 표 높이는 10분 = 20px(12시간 = 1440px)이다', () => {
    const { container } = renderGrid()
    for (let h = 8; h < 20; h++) expect(screen.getByText(`${String(h).padStart(2, '0')}:00`)).toBeTruthy()
    expect(screen.queryByText('20:00')).toBeNull()
    expect(container.querySelector<HTMLElement>('[data-grid-body]')!.style.height).toBe('1440px')
  })

  it('AC-5905.1: 보이는 시간을 바꾸면(09~18시) 줄·높이·칸 자리가 따라간다', () => {
    const { container } = renderGrid({ settings: { ...SETTINGS, openHour: 9, closeHour: 18 } })
    expect(screen.queryByText('08:00')).toBeNull()
    expect(screen.getByText('17:00')).toBeTruthy()
    expect(container.querySelector<HTMLElement>('[data-grid-body]')!.style.height).toBe('1080px')
    expect(block(/^23580 정○○/).style.top).toBe('0px')
  })

  it('AC-5905.1: 칸은 시작 시각 자리(위 = (시작 − 여는 시각) ÷ 10 × 20px)에 길이만큼(− 1px) 놓인다', () => {
    renderGrid()
    const moved = block(/^10231 김○○/)
    expect([moved.style.top, moved.style.height]).toEqual(['180px', '59px'])
    const inj = block(/^30117 송○○/)
    expect([inj.style.top, inj.style.height]).toEqual(['280px', '19px'])
  })

  it('AC-5905.1: 보이는 시간 밖 예약(21:00)은 일·주 보기에 칸이 없다(날짜 머리 수에는 든다)', () => {
    renderGrid()
    expect(screen.queryByRole('button', { name: /^10457 박○○/ })).toBeNull()
    expect(screen.getByRole('button', { name: '11월 18일 (수) 예약 1' })).toBeTruthy()
  })

  it('AC-5905.1: 겹친 칸은 layoutDay대로 나란히(열·열 수·넓힘), 끝이 다음 시작과 같으면 겹침이 아니다', () => {
    renderGrid()
    const place = (name: RegExp) => {
      const el = block(name)
      return [el.dataset.col, el.dataset.cols, el.dataset.span]
    }
    expect(place(/^18842 문○○/)).toEqual(['0', '2', '1'])
    expect(place(/^30117 송○○/)).toEqual(['1', '2', '1'])
    expect(place(/^10231 김○○/)).toEqual(['0', '1', '1'])
    expect(place(/^23580 정○○/)).toEqual(['0', '1', '1'])
  })

  it('AC-5905.1: 주 보기 칸 글은 `차트번호 이름 종류 (표시)` + 길이이고, 전체 글은 이름표(마우스 올림·화면 읽기)에 있다', () => {
    renderGrid()
    expect(text(block(/^27741 홍○○/))).toBe('27741 홍○○ 도수 (가) 30분')
    expect(block(/^27741 홍○○/).getAttribute('title')).toBe('27741 홍○○ 도수 (가) 15:00–15:30 30분')
    expect(block(/^10231 김○○/).getAttribute('aria-label')).toBe('10231 김○○ 도수 (가) 09:30–10:00 30분 · 왔음 · 변경 (원래 11/18 (수) 15:00)')
    expect(block(/^23580 정○○/).getAttribute('aria-label')).toBe('23580 정○○ 자보도수 (나) 09:00–09:30 30분 · 안 옴')
    expect(block(/^18842 문○○/).getAttribute('aria-label')).toBe('18842 문○○ 도수 (다) 10:00–10:30 30분 · 취소')
  })

  it('AC-5905.1: 차트번호 없는 예약(신환)은 이름부터 쓴다', () => {
    renderGrid()
    expect(text(block(/^신○○/))).toBe('신○○ 도수 (퇴) 30분')
  })

  it('AC-5905.1: 색은 종류 색(주사 분홍) 또는 시행자 색(도수 → (가) 파랑)이고, 목록에 없는 시행자의 예약은 회색이다', () => {
    renderGrid()
    expect(block(/^10231 김○○/).className).toContain('bg-cal-blue-soft')
    expect(block(/^10231 김○○/).className).toContain('border-cal-blue')
    expect(block(/^23580 정○○/).className).toContain('bg-cal-teal-soft')
    expect(block(/^30117 송○○/).className).toContain('bg-cal-pink-soft')
    expect(block(/^신○○/).className).toContain('bg-cal-gray-soft')
  })

  it('AC-5905.1: 취소 칸은 흰 바탕·흐린 글·가운데 줄로 남고 색 바탕이 없다', () => {
    renderGrid()
    const cancel = block(/^18842 문○○/)
    expect(cancel.className).toContain('bg-surface')
    expect(cancel.className).not.toContain('bg-cal-')
    expect(within(cancel).getByText('문○○').className).toContain('line-through')
  })

  it('AC-5905.1: 오늘 칸에만 지금 선(10:40 → 320px)이 있고, 시각을 모르면(null) 없다', () => {
    const { container } = renderGrid()
    const now = screen.getByTitle('지금 10:40')
    expect(now.style.top).toBe('320px')
    expect(now.closest('[data-slot-day]')?.getAttribute('data-slot-day')).toBe(TODAY)
    expect(column(container, TODAY).dataset.today).toBe('true')
    expect(column(container, '2026-11-18').dataset.today).toBeUndefined()
    cleanup()
    renderGrid({ nowMin: null })
    expect(screen.queryByTitle(/^지금/)).toBeNull()
  })

  it('AC-5905.1: 빈 칸을 누르면 그 날짜·10분에 맞춘 시각으로 onSlot을 부른다(표 밖으로 넘치면 마지막 칸)', () => {
    const { container, props } = renderGrid()
    fireEvent.click(column(container, '2026-11-18'), { clientY: 130 })
    expect(props.onSlot).toHaveBeenLastCalledWith('2026-11-18', 540)
    fireEvent.click(column(container, '2026-11-18'), { clientY: 99999 })
    expect(props.onSlot).toHaveBeenLastCalledWith('2026-11-18', 1190)
  })

  it('AC-5905.1: 빈 칸에 마우스를 올리면 그 시각(+ 09:00)이 보이고, 나가면 없어진다', () => {
    const { container } = renderGrid()
    fireEvent.mouseMove(placed(column(container, '2026-11-19')), { clientY: 130 })
    expect(screen.getByText('+ 09:00')).toBeTruthy()
    fireEvent.mouseLeave(column(container, '2026-11-19'))
    expect(screen.queryByText('+ 09:00')).toBeNull()
  })

  it('AC-5905.1: 예약 칸을 누르면 onAppt(id)만 부르고 빈 칸 누름은 부르지 않는다', () => {
    const { props } = renderGrid()
    fireEvent.click(block(/^10231 김○○/))
    expect(props.onAppt).toHaveBeenCalledWith('a-moved')
    expect(props.onSlot).not.toHaveBeenCalled()
  })

  it('AC-5905.1: 종일 줄은 메모 칩과 시행자 휴무 칩(그 시행자 색, 목록에 없으면 회색)이고, 칸·칩·+ 종일을 누르면 onAllDay(날짜)다', () => {
    const { container, props } = renderGrid()
    expect(screen.getByText('종일')).toBeTruthy()
    expect(screen.getByRole('button', { name: '주간 회의 13:00' })).toBeTruthy()
    const off = screen.getByRole('button', { name: '(나) 윤○○ 휴무' })
    expect(off.className).toContain('bg-cal-teal-soft')
    expect(screen.getByRole('button', { name: '퇴사○○ 휴무' }).className).toContain('bg-cal-gray-soft')
    fireEvent.click(off)
    expect(props.onAllDay).toHaveBeenCalledTimes(1)
    expect(props.onAllDay).toHaveBeenLastCalledWith('2026-11-18')
    const adds = screen.getAllByRole('button', { name: '+ 종일' })
    expect(adds).toHaveLength(3) // 항목 없는 17·19·21일
    fireEvent.click(adds[0])
    expect(props.onAllDay).toHaveBeenLastCalledWith(TODAY)
    fireEvent.click(container.querySelector('[data-allday-day="2026-11-21"]')!)
    expect(props.onAllDay).toHaveBeenLastCalledWith('2026-11-21')
    expect(props.onAllDay).toHaveBeenCalledTimes(3)
  })

  it('AC-5905.1: 더하기 판이 열려 있으면 그 자리에 새 예약 자리 표시가 보이고, 경고가 있으면 "· 확인"이 붙는다', () => {
    renderGrid({ draft: { day: '2026-11-18', start: 860, len: 30, editing: false, warn: true } })
    expect(screen.getByText('새 예약 14:20–14:50 · 확인')).toBeTruthy()
    cleanup()
    renderGrid({ draft: { day: '2026-11-18', start: 860, len: 30, editing: true, warn: false } })
    expect(screen.getByText('고치는 중 14:20–14:50')).toBeTruthy()
  })
})

describe('AC-5905.1: 일 보기(하루, 칸마다 시간·길이·메모)', () => {
  it('AC-5905.1: 날이 하나면 칸 둘째 줄에 `09:30–10:00 · 30분 · 메모`, 짧은 칸(15분 이하)은 한 줄에 이어 쓴다', () => {
    renderGrid({ days: [TODAY] })
    const moved = block(/^10231 김○○/)
    expect(within(moved).getByText('09:30–10:00')).toBeTruthy()
    expect(within(moved).getByText('· 30분')).toBeTruthy()
    expect(within(moved).getByText('· 허리 · 3회차')).toBeTruthy()
    expect(moved.querySelector('br')).not.toBeNull()
    const inj = block(/^30117 송○○/)
    expect(text(inj)).toBe('30117 송○○ 주사 (원) 10:20–10:30 · 10분')
    expect(inj.querySelector('br')).toBeNull()
  })

  it('AC-5905.1: 일 보기 날짜 머리는 누를 차례(tab)에서 빠진다', () => {
    renderGrid({ days: [TODAY] })
    expect(screen.getByRole('button', { name: '11월 17일 (화) 오늘 예약 3' }).getAttribute('tabindex')).toBe('-1')
  })
})

describe('AC-5905.1: 빈 화면(이번 주 예약 없음, 시안 ?s=empty)', () => {
  it('AC-5905.1: 주 보기에 예약이 하나도 없으면 안내 카드와 [예약 더하기](onAdd)가 보인다', () => {
    const { props } = renderGrid({ appts: [], allday: [] })
    expect(screen.getByRole('heading', { name: '이번 주 예약이 아직 없어요' })).toBeTruthy()
    expect(screen.getByText('빈 칸을 누르면 그 시간으로 예약을 넣어요. 구글 캘린더에 있던 예약은 옮겨 오지 않아요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '예약 더하기' }))
    expect(props.onAdd).toHaveBeenCalledTimes(1)
  })

  it('AC-5905.1: 예약이 있으면 안내 카드가 없다', () => {
    renderGrid()
    expect(screen.queryByText('이번 주 예약이 아직 없어요')).toBeNull()
  })
})

describe('AC-5905.1: 도착 표시(시안 기본값 10번)', () => {
  it('AC-5905.1: 왔음 = 초록 ✓, 안 옴 = 주황 ! + 옅은 빗금, 취소 = 회색 "취소", 아직 = 표시 없음', () => {
    renderGrid()
    expect(within(block(/^10231 김○○/)).getByTitle('왔음')).toBeTruthy()
    expect(within(block(/^30117 송○○/)).getByTitle('왔음')).toBeTruthy()
    const noshow = block(/^23580 정○○/)
    expect(within(noshow).getByTitle('안 옴').textContent).toBe('!')
    expect(noshow.querySelector('svg[data-hatch]')).not.toBeNull()
    expect(within(block(/^18842 문○○/)).getByTitle('취소').textContent).toBe('취소')
    const waiting = block(/^27741 홍○○/)
    expect(within(waiting).queryByTitle(/왔음|안 옴|취소/)).toBeNull()
    expect(waiting.querySelector('svg[data-hatch]')).toBeNull()
  })
})

describe('AC-5905.7: 비트 예약 칸(비트 PC만, 흐린 회색 빗금, 20분, 보기만)', () => {
  it('AC-5905.7: 받은 비트 예약은 `비트 예약 차트번호 이름` 회색 빗금 칸(20분 → 39px)이고 예약 칸과 같이 놓인다', () => {
    renderGrid({ ghosts: GHOSTS })
    const ghost = screen.getByRole('button', { name: '비트 예약 11:00 25190 오○○ · 보기만 해요' })
    expect(text(ghost)).toBe('비트 예약 25190 오○○')
    expect([ghost.style.top, ghost.style.height]).toEqual(['360px', '39px'])
    expect(ghost.className).toContain('border-dashed')
    expect(ghost.querySelector('svg[data-hatch]')).not.toBeNull()
    expect(ghost.className).not.toContain('bg-cal-')
  })

  it('AC-5905.7: 일 보기 비트 예약 칸은 시각을 덧붙인다', () => {
    renderGrid({ days: [TODAY], ghosts: GHOSTS })
    expect(text(screen.getByRole('button', { name: /^비트 예약 11:00/ }))).toBe('비트 예약 25190 오○○ 11:00')
  })

  it('AC-5905.7: 비트 예약 칸을 누르면 onGhost(key)만 부르고(화면이 안내 글을 띄운다), 안내 글은 시안 그대로다', () => {
    const { props } = renderGrid({ ghosts: GHOSTS })
    fireEvent.click(screen.getByRole('button', { name: /^비트 예약/ }))
    expect(props.onGhost).toHaveBeenCalledWith('g1')
    expect(props.onSlot).not.toHaveBeenCalled()
    expect(props.onAppt).not.toHaveBeenCalled()
    expect(GHOST_NOTE).toBe('비트에 있는 예약이에요. 여기서는 보기만 하고, 고치려면 비트에서 해요.')
  })

  it('AC-5905.7: 차트번호·이름 없는 비트 예약도 그린다', () => {
    renderGrid({ ghosts: [{ key: 'g2', day: '2026-11-19', start: 840, chart: null, name: null }] })
    expect(text(screen.getByRole('button', { name: '비트 예약 14:00 · 보기만 해요' }))).toBe('비트 예약')
  })
})

describe('AC-5905.8: 비트 없는 기기(폰·도우미 없음)', () => {
  it('AC-5905.8: 비트 예약 칸을 받지 않으면 그리지 않고, 도착 표시는 서버 값(auto·상태) 그대로다', () => {
    renderGrid()
    expect(screen.queryByRole('button', { name: /^비트 예약/ })).toBeNull()
    expect(within(block(/^10231 김○○/)).getByTitle('왔음')).toBeTruthy()
  })
})

describe('AC-5906.2: 일정 변경 표시', () => {
  it("AC-5906.2: 처음 자리(origDay)가 있는 예약 칸에만 작은 '변경' 표시가 있다(새 예약·다음 주에도로 만든 예약은 없다)", () => {
    renderGrid()
    expect(within(block(/^10231 김○○/)).getByTitle('날짜나 시작 시간을 옮김').textContent).toBe('변경')
    for (const name of [/^27741 홍○○/, /^23580 정○○/, /^30117 송○○/]) expect(within(block(name)).queryByText('변경')).toBeNull()
  })
})

describe('AC-6003.1: 예약 칸은 날 칸 오른쪽 20px를 비우고 그 안에서 나란히 놓인다(spec calendar-colors REQ-6003, 시안 ⑤)', () => {
  it('AC-6003.1: placeStyle은 (100% - 20px) 안에서 왼쪽 = 자리 × 열/열 수 + 1px, 폭 = 넓힘/열 수 − 2px이다(위·높이는 그대로)', () => {
    expect(BLOCK_GUTTER_PX).toBe(20)
    expect(placeStyle({ col: 0, cols: 1, span: 1 }, 180, 59)).toEqual({
      top: 180,
      height: 59,
      left: 'calc((100% - 20px) * 0.0000 + 1px)',
      width: 'calc((100% - 20px) * 1.0000 - 2px)',
    })
    expect(placeStyle({ col: 1, cols: 2, span: 1 }, 280, 19)).toEqual({
      top: 280,
      height: 19,
      left: 'calc((100% - 20px) * 0.5000 + 1px)',
      width: 'calc((100% - 20px) * 0.5000 - 2px)',
    })
    expect(placeStyle({ col: 1, cols: 3, span: 2 }, 0, 14)).toMatchObject({
      left: 'calc((100% - 20px) * 0.3333 + 1px)',
      width: 'calc((100% - 20px) * 0.6667 - 2px)',
    })
  })

  it('AC-6003.1: 주 보기 — 혼자인 칸은 (100% - 20px) 폭 전체, 같은 시간 두 칸(10:00 문○○·10:20 송○○)은 그 안에서 반씩 나란히', () => {
    renderGrid()
    expect(box(block(/^27741 홍○○/))).toEqual(ONE)
    expect(box(block(/^10231 김○○/))).toEqual(ONE)
    expect(box(block(/^18842 문○○/))).toEqual(HALF_L)
    expect(box(block(/^30117 송○○/))).toEqual(HALF_R)
  })

  it('AC-6003.1: 일 보기도 같은 값이고, 비트 예약 칸도 같은 자리 규칙을 따른다', () => {
    renderGrid({ days: [TODAY], ghosts: GHOSTS })
    expect(box(block(/^10231 김○○/))).toEqual(ONE)
    expect(box(block(/^18842 문○○/))).toEqual(HALF_L)
    expect(box(block(/^30117 송○○/))).toEqual(HALF_R)
    expect(box(block(/^비트 예약 11:00/))).toEqual(ONE)
  })
})

describe('AC-6003.2: 예약이 있는 시간의 오른쪽 빈 줄을 누르면 그 시각으로 더하기', () => {
  it('AC-6003.2: 예약(09:30 김○○)이 있는 높이의 오른쪽 줄(예약 칸 밖)을 누르면 onSlot(그날, 09:30)이고 onAppt는 안 불린다', () => {
    const { container, props } = renderGrid()
    fireEvent.click(placed(column(container, TODAY)), { clientX: 190, clientY: 185 })
    expect(props.onSlot).toHaveBeenLastCalledWith(TODAY, 570)
    expect(props.onAppt).not.toHaveBeenCalled()
  })

  it('AC-6003.2: 두 칸이 나란한 시간(10:20 송○○)에서도 오른쪽 줄을 누르면 onSlot(그날, 10:20)이다(일 보기도 같다)', () => {
    const { container, props } = renderGrid()
    fireEvent.click(placed(column(container, TODAY)), { clientX: 195, clientY: 285 })
    expect(props.onSlot).toHaveBeenLastCalledWith(TODAY, 620)
    cleanup()
    const day = renderGrid({ days: [TODAY] })
    fireEvent.click(placed(column(day.container, TODAY)), { clientX: 185, clientY: 185 })
    expect(day.props.onSlot).toHaveBeenLastCalledWith(TODAY, 570)
    expect(day.props.onAppt).not.toHaveBeenCalled()
  })

  it('AC-6003.2: 예약 칸(또는 칸 안 글)을 누르면 지금처럼 onAppt(id)만 부르고 onSlot은 안 부른다', () => {
    const { container, props } = renderGrid()
    placed(column(container, TODAY))
    fireEvent.click(within(block(/^10231 김○○/)).getByText('김○○'))
    expect(props.onAppt).toHaveBeenLastCalledWith('a-moved')
    fireEvent.click(block(/^30117 송○○/))
    expect(props.onAppt).toHaveBeenLastCalledWith('a-inj')
    expect(props.onSlot).not.toHaveBeenCalled()
  })
})

describe('AC-6003.3: 오른쪽 줄 위 마우스 → 글 없는 좁은 점선 칸, 나머지 빈 곳 → + HH:MM', () => {
  it('AC-6003.3: 날 칸 오른쪽 20px 위(09:30 높이)면 그 10분 칸 높이에 글 없는 좁은 점선 칸(data-hover="edge")만 보인다', () => {
    const { container } = renderGrid()
    fireEvent.mouseMove(placed(column(container, TODAY)), { clientX: 195, clientY: 185 })
    const edge = hoverBox(container, 'edge')!
    expect(edge).not.toBeNull()
    expect(edge.textContent).toBe('')
    expect(edge.getAttribute('aria-hidden')).toBe('true')
    expect([edge.style.top, edge.style.height]).toEqual(['180px', '18px'])
    for (const c of ['pointer-events-none', 'right-0.5', 'w-4', 'border-dashed', 'border-accent', 'max-md:hidden']) expect(edge.className).toContain(c)
    expect(edge.closest('[data-slot-day]')?.getAttribute('data-slot-day')).toBe(TODAY)
    expect(hoverBox(container, 'full')).toBeNull()
    expect(screen.queryByText(/^\+ \d\d:\d\d$/)).toBeNull()
  })

  it('AC-6003.3: 오른쪽 줄은 날 칸 오른쪽 끝 − 20px(x 180)부터다 — 179는 지금처럼 + HH:MM', () => {
    const { container } = renderGrid()
    const col = placed(column(container, '2026-11-19'))
    fireEvent.mouseMove(col, { clientX: 180, clientY: 130 })
    expect(hoverBox(container, 'edge')).not.toBeNull()
    fireEvent.mouseMove(col, { clientX: 179, clientY: 130 })
    expect(hoverBox(container, 'edge')).toBeNull()
    expect(text(hoverBox(container, 'full')!)).toBe('+ 09:00')
  })

  it('AC-6003.3: 나머지 빈 곳은 + HH:MM(data-hover="full", 30분 높이)이고, 같은 10분 칸에서 오른쪽 줄로 옮기면 좁은 칸으로 바뀐다', () => {
    const { container } = renderGrid()
    const col = placed(column(container, '2026-11-19'))
    fireEvent.mouseMove(col, { clientX: 50, clientY: 130 })
    const full = hoverBox(container, 'full')!
    expect(text(full)).toBe('+ 09:00')
    expect(full.getAttribute('aria-hidden')).toBe('true')
    expect([full.style.top, full.style.height]).toEqual(['120px', '58px'])
    expect(hoverBox(container, 'edge')).toBeNull()
    fireEvent.mouseMove(col, { clientX: 195, clientY: 135 })
    expect(hoverBox(container, 'full')).toBeNull()
    expect(hoverBox(container, 'edge')!.style.top).toBe('120px')
  })

  it('AC-6003.3: 예약 칸 위에서는 둘 다 없다(오른쪽 줄에 있다가 칸 위로 가도 사라진다)', () => {
    const { container } = renderGrid()
    placed(column(container, TODAY))
    fireEvent.mouseMove(column(container, TODAY), { clientX: 195, clientY: 185 })
    expect(hoverBox(container, 'edge')).not.toBeNull()
    fireEvent.mouseMove(block(/^10231 김○○/), { clientX: 100, clientY: 185 })
    expect(hoverBox(container, 'edge')).toBeNull()
    expect(hoverBox(container, 'full')).toBeNull()
  })

  it('AC-6003.3: 일 보기에서도 오른쪽 줄 위면 좁은 칸, 더하기 판이 열려 있으면(draft) 미리 보기가 없다', () => {
    const { container } = renderGrid({ days: [TODAY] })
    fireEvent.mouseMove(placed(column(container, TODAY)), { clientX: 190, clientY: 405 })
    expect(hoverBox(container, 'edge')!.style.top).toBe('400px')
    cleanup()
    const open = renderGrid({ days: [TODAY], draft: { day: TODAY, start: 860, len: 30, editing: false, warn: false } })
    fireEvent.mouseMove(placed(column(open.container, TODAY)), { clientX: 190, clientY: 405 })
    expect(hoverBox(open.container, 'edge')).toBeNull()
    expect(hoverBox(open.container, 'full')).toBeNull()
  })
})
