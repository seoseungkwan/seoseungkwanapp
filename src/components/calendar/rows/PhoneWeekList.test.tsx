// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RowsGoogle } from '@/lib/calendar/gshapes'
import type { CalAllDay } from '@/lib/calendar/shapes'
import type { CalAppt, CalKind, CalStaff } from '@/types/calendar'
import { PhoneWeekList, type PhoneWeekListProps } from './PhoneWeekList'

// 폰 주 보기(768px 미만, spec clinic-calendar AC-5905.8, 시안 ?s=phone-week·기본값 7번): 날짜별 목록, 오늘만 펼침, 날짜 줄을 누르면 펼치고 접는다.
// 울타리 안 부품: 받은 예약을 그리고 누름은 콜백으로만 넘긴다. 이름은 ○○로 가린 가짜, 차트번호는 지어낸 값

afterEach(cleanup)

const STAFF: CalStaff[] = [
  { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
  { id: 'na', name: '윤○○', mark: '나', color: 'basil' },
  { id: 'da', name: '조○○', mark: '다', color: 'grape' },
  { id: 'won', name: '원장님', mark: '원', color: 'graphite' },
]
// 옛 기본 종류(주사 분홍 → 플라밍고·진료 연두 → 세이지, google-link design.md 7-4 옮기기 표)
const KINDS: CalKind[] = [
  { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
  { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수', '자보'] },
  { id: 'shock', name: '충격파', len: 15, color: null, words: ['충격파', '타'] },
  { id: 'inj', name: '주사', len: 10, color: 'flamingo', words: ['주사'] },
  { id: 'visit', name: '진료', len: 10, color: 'sage', words: ['진료'] },
]
const SETTINGS = { kinds: KINDS, staff: STAFF }
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
  gEventId: null,
  gUpdated: null,
  gTitle: null,
  gColor: null,
  colorFrom: 'app',
  gKeepTitle: false,
  gMoved: false,
  gGone: false,
  gWait: null,
  gWaitAt: null,
  gNote: null,
  gFrom: null,
  gHow: null,
  createdAt: '2026-11-01T00:00:00+00:00',
}
const appt = (over: Partial<CalAppt>): CalAppt => ({ ...base, ...over })

const APPTS: CalAppt[] = [
  appt({ id: 'a-moved', start: 570, chart: '10231', name: '김○○', memo: '허리 · 3회차', auto: 'came', origDay: '2026-11-18', origStart: 900 }),
  appt({ id: 'a-noshow', start: 540, chart: '23580', name: '정○○', staffId: 'na', staffName: '윤○○', staffMark: '나', kindId: 'jabo', kindName: '자보도수', auto: 'noshow' }),
  appt({ id: 'a-cancel', start: 600, chart: '18842', name: '문○○', staffId: 'da', staffName: '조○○', staffMark: '다', status: 'cancel' }),
  appt({ id: 'a-inj', start: 620, len: 10, chart: '30117', name: '송○○', staffId: 'won', staffName: '원장님', staffMark: '원', kindId: 'inj', kindName: '주사', status: 'came' }),
  appt({ id: 'a-16', day: '2026-11-16', start: 900, chart: '27741', name: '홍○○' }),
  appt({ id: 'a-18', day: '2026-11-18', start: 840, chart: '10457', name: '박○○', memo: '목·어깨' }),
]
const ALLDAY: CalAllDay[] = [
  { id: 'd1', day: '2026-11-16', type: 'memo', memo: '주간 회의 13:00', staffId: null, staffName: null },
  { id: 'd2', day: '2026-11-18', type: 'off', memo: null, staffId: 'na', staffName: '윤○○' },
]
const GHOSTS = [{ key: 'g1', day: TODAY, start: 660, chart: '25190', name: '오○○' }]

function renderList(over: Partial<PhoneWeekListProps> = {}) {
  const props: PhoneWeekListProps = {
    days: WEEK,
    settings: SETTINGS,
    appts: APPTS,
    allday: ALLDAY,
    today: TODAY,
    onAppt: vi.fn(),
    onGhost: vi.fn(),
    onAllDay: vi.fn(),
    ...over,
  }
  const view = render(<PhoneWeekList {...props} />)
  return { ...view, props }
}

const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
const head = (day: string) => screen.getByRole('button', { name: new RegExp(`^${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 `) })
const row = (name: RegExp) => screen.getByRole('button', { name })

describe('AC-5905.8: 폰 주 보기는 날짜별 목록이다(오늘만 펼침)', () => {
  it('AC-5905.8: 날마다 날짜 줄 하나, 오늘만 펼쳐져 있고 그날 예약이 시작 차례로 보인다', () => {
    renderList()
    expect(WEEK.map((day) => head(day).getAttribute('aria-expanded'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false'])
    expect(text(head(TODAY))).toContain('17 화 · 오늘')
    const names = screen.getAllByRole('button', { name: /^\d{5} / }).map((b) => b.getAttribute('aria-label')!.split(' ').slice(0, 2).join(' '))
    expect(names).toEqual(['23580 정○○', '10231 김○○', '18842 문○○', '30117 송○○'])
  })

  it('AC-5905.8: 날짜 줄 요약은 취소 뺀 예약 수, 오늘까지는 왔음·안 옴 수(안 옴 0이면 뺌), 예약이 없으면 "예약 없음"이다', () => {
    renderList()
    expect(within(head(TODAY)).getByText(/예약 3/)).toBeTruthy()
    expect(text(head(TODAY))).toContain('왔음 2 · 안 옴 1')
    expect(within(head(TODAY)).getByText('안 옴 1').className).toContain('text-negative')
    expect(text(head('2026-11-16'))).toContain('예약 1')
    expect(text(head('2026-11-16'))).toContain('왔음 0')
    expect(text(head('2026-11-16'))).not.toContain('안 옴')
    expect(text(head('2026-11-18'))).toContain('예약 1')
    expect(text(head('2026-11-18'))).not.toContain('왔음')
    expect(text(head('2026-11-19'))).toContain('예약 없음')
  })

  it('AC-5905.8: 예약 줄은 시각·길이 / 색 띠 / `차트번호 이름` · `종류 (표시) 시행자 · 메모` / 도착 칩이다', () => {
    renderList()
    const moved = row(/^10231 김○○/)
    expect(within(moved).getByText('09:30')).toBeTruthy()
    expect(within(moved).getByText('30분')).toBeTruthy()
    expect(within(moved).getByText('10231')).toBeTruthy()
    expect(within(moved).getByText('김○○')).toBeTruthy()
    expect(within(moved).getByText('도수 (가) 한○○ · 허리 · 3회차')).toBeTruthy()
    expect(within(moved).getByText('왔음')).toBeTruthy()
    expect(moved.querySelector('[data-bar]')!.className).toContain('bg-cal-blueberry')
    expect(within(row(/^30117 송○○/)).getByText('주사 (원) 원장님')).toBeTruthy()
    expect(row(/^30117 송○○/).querySelector('[data-bar]')!.className).toContain('bg-cal-flamingo')
    expect(within(row(/^23580 정○○/)).getByText('안 옴')).toBeTruthy()
  })

  it('AC-5905.8: 취소 줄은 시각·이름에 가운데 줄과 "취소" 칩이다', () => {
    renderList()
    const cancel = row(/^18842 문○○/)
    expect(within(cancel).getByText('취소')).toBeTruthy()
    expect(within(cancel).getByText('10:00').className).toContain('line-through')
    expect(within(cancel).getByText('문○○').className).toContain('line-through')
  })

  it('AC-5905.8: 예약 줄을 누르면 onAppt(id)다', () => {
    const { props } = renderList()
    fireEvent.click(row(/^10231 김○○/))
    expect(props.onAppt).toHaveBeenCalledWith('a-moved')
  })

  it('AC-5905.8: 날짜 줄을 누르면 펼치고 접는다. 펼친 날에 예약이 없으면 "예약이 없어요"다', () => {
    renderList()
    fireEvent.click(head('2026-11-16'))
    expect(head('2026-11-16').getAttribute('aria-expanded')).toBe('true')
    expect(row(/^27741 홍○○/)).toBeTruthy()
    fireEvent.click(head(TODAY))
    expect(head(TODAY).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: /^10231 김○○/ })).toBeNull()
    fireEvent.click(head('2026-11-19'))
    expect(screen.getByText('예약이 없어요')).toBeTruthy()
  })

  it('AC-5905.8: 이번 주에 오늘이 없으면 처음에 펼친 날이 없다', () => {
    renderList({ days: ['2026-11-23', '2026-11-24'], appts: [], allday: [] })
    expect(screen.queryAllByRole('button', { expanded: true })).toEqual([])
  })

  it('AC-5905.8: 종일 항목은 접힌 날에도 칩으로 보이고(휴무는 시행자 색), 펼친 날에는 + 종일이 있다. 누르면 onAllDay(날짜)다', () => {
    const { props } = renderList()
    expect(screen.getByRole('button', { name: '주간 회의 13:00' })).toBeTruthy()
    const off = screen.getByRole('button', { name: '(나) 윤○○ 휴무' })
    expect(off.className).toContain('bg-cal-basil')
    fireEvent.click(off)
    expect(props.onAllDay).toHaveBeenLastCalledWith('2026-11-18')
    const adds = screen.getAllByRole('button', { name: '+ 종일' })
    expect(adds).toHaveLength(1)
    fireEvent.click(adds[0])
    expect(props.onAllDay).toHaveBeenLastCalledWith(TODAY)
  })

  it('AC-5905.8: 비트 예약 칸을 받지 않으면(폰) 목록에 없고, 받으면(좁은 비트 PC) `비트 예약 · 차트번호 이름` 줄이 보기만으로 있다', () => {
    renderList()
    expect(screen.queryByText(/비트 예약/)).toBeNull()
    cleanup()
    const { props } = renderList({ ghosts: GHOSTS })
    const ghost = screen.getByRole('button', { name: '비트 예약 11:00 25190 오○○ · 보기만 해요' })
    expect(within(ghost).getByText('비트 예약 · 25190 오○○')).toBeTruthy()
    expect(within(ghost).getByText('보기만 해요')).toBeTruthy()
    fireEvent.click(ghost)
    expect(props.onGhost).toHaveBeenCalledWith('g1')
  })
})

describe('AC-5906.2: 폰 목록의 변경 표시', () => {
  it("AC-5906.2: 처음 자리가 있는 예약 줄에만 '변경' 꼬리표가 있다", () => {
    renderList()
    expect(within(row(/^10231 김○○/)).getByText('변경')).toBeTruthy()
    expect(within(row(/^23580 정○○/)).queryByText('변경')).toBeNull()
  })
})

describe('AC-6603.3: 폰 주 보기 — 휴진일(병원 정보)은 날짜 줄에 "휴진", 회색', () => {
  it('AC-6603.3: 휴진일 날짜 줄에 "휴진"이 보이고 이름표에도 든다. 카드는 회색(data-closed)이다', () => {
    renderList({ settings: { ...SETTINGS, closedDates: ['2026-11-18'] } })
    const closed = head('2026-11-18')
    expect(closed.getAttribute('aria-label')).toBe('11월 18일 (수) 휴진 예약 1')
    expect(within(closed).getByText('휴진')).toBeTruthy()
    const card = closed.closest<HTMLElement>('[data-closed]')!
    expect(card.dataset.closed).toBe('true')
    expect(card.className).toContain('bg-canvas')
    expect(within(head('2026-11-17')).queryByText('휴진')).toBeNull()
  })

  it('AC-6603.3: 휴진일도 펼치면 그날 예약 줄과 + 종일이 그대로 있다', () => {
    const { props } = renderList({ settings: { ...SETTINGS, closedDates: ['2026-11-18'] } })
    fireEvent.click(head('2026-11-18'))
    fireEvent.click(row(/^10457 박○○/))
    expect(props.onAppt).toHaveBeenCalledWith('a-18')
  })

  it('AC-6603.3: 휴진일을 받지 않으면 "휴진"이 없다', () => {
    renderList()
    expect(screen.queryByText('휴진')).toBeNull()
  })
})

describe('AC-7616.1: 폰 주 보기의 반차 휴무 칩', () => {
  it("AC-7616.1: part가 있는 휴무 칩은 '{이름} 오전 휴무'·'{이름} 오후 휴무'(그 시행자 색, 지금 칩 모양 그대로)이고 누르면 onAllDay(날짜)다", () => {
    const allday: CalAllDay[] = [
      { id: 'h1', day: '2026-11-16', type: 'off', memo: null, staffId: 'na', staffName: '윤○○', part: 'am' },
      { id: 'h2', day: '2026-11-19', type: 'off', memo: null, staffId: 'gone', staffName: '퇴사○○', part: 'pm' },
      ...ALLDAY,
    ]
    const { props } = renderList({ allday })
    const am = screen.getByRole('button', { name: '(나) 윤○○ 오전 휴무' })
    expect(am.className).toContain('bg-cal-basil')
    expect(screen.getByRole('button', { name: '퇴사○○ 오후 휴무' }).className).toContain('bg-cal-default') // 목록에 없는 시행자 = 캘린더 기본 색(AC-8503.5)
    expect(screen.getByRole('button', { name: '(나) 윤○○ 휴무' })).toBeTruthy()
    fireEvent.click(am)
    expect(props.onAllDay).toHaveBeenLastCalledWith('2026-11-16')
  })
})

// ---------- google-link REQ-8532: 구글과 이은 병원(prop google: RowsGoogle) — 지금 폰 목록 모양 그대로, 색·표시만 예약표와 같게 ----------

const CTX: RowsGoogle['ctx'] = {
  look: { cancel: 'tomato', change: 'graphite', offColor: 'grape' },
  kinds: KINDS.map(({ id, color }) => ({ id, color })),
  staff: STAFF.map(({ id, color }) => ({ id, color })),
}
const linked = (over: Partial<RowsGoogle> = {}): RowsGoogle => ({ ctx: CTX, fixes: [], waiting: new Set<string>(), ...over })
const G_APPTS: CalAppt[] = [
  // google-link AC-8545.1: 이은 병원에서 웹앱으로 옮긴 예약은 같은 쓰기에 g_moved 참을 싣는다
  ...APPTS.map((a) => (a.id === 'a-moved' ? { ...a, gMoved: true } : a)),
  appt({ id: 'g-orange', start: 900, chart: '27750', name: '정모○', colorFrom: 'google', gColor: 'tangerine', gEventId: 'ev-1' }),
  appt({ id: 'g-moved', start: 990, chart: '39070', name: '백모○', colorFrom: 'google', gColor: 'graphite', gMoved: true, gEventId: 'ev-3' }),
  appt({ id: 'g-none', start: 1020, chart: '73450', name: '한예○', staffId: null, staffName: null, staffMark: null, colorFrom: 'google', gColor: 'banana' }),
]
const bar = (name: RegExp) => row(name).querySelector('[data-bar]')!.className

describe('AC-8532.2: 폰 목록 — 색 띠는 구글 색 차례, 변경 꼬리표·주황 시계', () => {
  it('AC-8532.2: 색 띠는 apptPaint 차례(취소 색·변경 색·구글 일정 색·설정 색)이다', () => {
    renderList({ appts: G_APPTS, google: linked() })
    expect(bar(/^18842 문○○/)).toContain('bg-cal-tomato')
    expect(bar(/^10231 김○○/)).toContain('bg-cal-graphite')
    expect(bar(/^27750 정모○/)).toContain('bg-cal-tangerine')
    expect(bar(/^39070 백모○/)).toContain('bg-cal-graphite')
    expect(bar(/^30117 송○○/)).toContain('bg-cal-flamingo')
  })

  it("AC-8532.2: 구글에서 변경 색이 된 예약(gMoved)도 '변경' 꼬리표이고, 못 보낸 예약은 주황 시계와 이름표 '· 구글에 아직 못 보냄'이다", () => {
    renderList({ appts: G_APPTS, google: linked({ waiting: new Set(['a-noshow']) }) })
    expect(within(row(/^39070 백모○/)).getByText('변경')).toBeTruthy()
    const wait = row(/^23580 정○○/)
    expect(within(wait).getByTitle('구글에 아직 못 보냄')).toBeTruthy()
    expect(wait.getAttribute('aria-label')).toBe('23580 정○○ 자보도수 (나) 09:00–09:30 30분 · 안 옴 · 구글에 아직 못 보냄')
    expect(within(row(/^10231 김○○/)).queryByTitle('구글에 아직 못 보냄')).toBeNull()
  })

  it('AC-8532.2: RowsGoogle이 없으면 지금 그대로(설정 색 띠, gMoved만으로는 꼬리표 없음)', () => {
    renderList({ appts: G_APPTS })
    expect(bar(/^18842 문○○/)).toContain('bg-cal-grape')
    expect(bar(/^27750 정모○/)).toContain('bg-cal-blueberry')
    expect(within(row(/^39070 백모○/)).queryByText('변경')).toBeNull()
  })

  it('AC-8532.5: 시행자 없는 예약 줄은 (표시)·시행자 이름 없이 종류만 쓴다', () => {
    renderList({ appts: G_APPTS, google: linked() })
    expect(within(row(/^73450 한예○/)).getByText('도수')).toBeTruthy()
    expect(bar(/^73450 한예○/)).toContain('bg-cal-banana')
  })
})

describe('AC-8532.3: 폰 목록 종일 칩 — off 한 칩·반차 흰 칩·메모 캘린더 기본 색', () => {
  it('AC-8532.3: 그날 하루 종일 휴무는 한 칩 `윤○○, 김예○ off`(포도), 반차는 흰 칩, 메모는 캘린더 기본 색 칩이다', () => {
    const allday: CalAllDay[] = [
      { id: 'o-1', day: TODAY, type: 'off', memo: null, staffId: 'na', staffName: '윤○○' },
      { id: 'o-2', day: TODAY, type: 'off', memo: null, staffId: 'm-desk1', staffName: '김예○' },
      { id: 'h-1', day: TODAY, type: 'off', memo: null, staffId: 'da', staffName: '조○○', part: 'am' },
      { id: 'm-1', day: TODAY, type: 'memo', memo: '주간 회의 13:00', staffId: null, staffName: null },
    ]
    const { props } = renderList({ allday, google: linked() })
    const off = screen.getByRole('button', { name: '윤○○, 김예○ off' })
    expect(off.className).toContain('bg-cal-grape')
    expect(off.getAttribute('title')).toBe('윤○○, 김예○ off · 구글 하루 종일 줄과 같아요')
    const half = screen.getByRole('button', { name: '(다) 조○○ 오전 반차' })
    expect(half.className).toContain('bg-surface')
    expect(half.getAttribute('title')).toBe('(다) 조○○ 오전 반차 · 웹앱에만 보여요(반차는 구글 off 줄에 넣지 않아요)')
    expect(screen.getByRole('button', { name: '주간 회의 13:00' }).className).toContain('bg-cal-default')
    fireEvent.click(off)
    expect(props.onAllDay).toHaveBeenLastCalledWith(TODAY)
  })
})

// ---------- google-link 2차 고침(REQ-8545·8548): '변경' = g_moved · 종류 줄 겹침 빼기 ----------

describe("AC-8545.1: 폰 목록 — 이은 병원의 '변경'은 g_moved만", () => {
  it("AC-8545.1: 처음 자리가 있어도 g_moved가 거짓이면 '변경' 꼬리표가 없고 색 띠도 변경 색이 아니다", () => {
    renderList({ appts: APPTS, google: linked() })
    const moved = row(/^10231 김○○/)
    expect(within(moved).queryByText('변경')).toBeNull()
    expect(moved.querySelector('[data-bar]')!.className).toContain('bg-cal-blueberry')
    expect(moved.getAttribute('aria-label')).toBe('10231 김○○ 도수 (가) 09:30–10:00 30분 · 왔음')
  })

  it("AC-8545.1: g_moved 참이면 '변경' 꼬리표·변경 색 띠·이름표 '· 변경 (원래 …)'", () => {
    renderList({ appts: G_APPTS, google: linked() })
    const moved = row(/^10231 김○○/)
    expect(within(moved).getByText('변경')).toBeTruthy()
    expect(moved.getAttribute('aria-label')).toBe('10231 김○○ 도수 (가) 09:30–10:00 30분 · 왔음 · 변경 (원래 11/18 (수) 15:00)')
  })

  it("AC-8545.3: 잇지 않은 병원은 지금 그대로 처음 자리가 있는 줄에 '변경' 꼬리표", () => {
    renderList({ appts: APPTS })
    expect(within(row(/^10231 김○○/)).getByText('변경')).toBeTruthy()
  })
})

// 종류 이름에 길이·시행자 표시가 든 병원('이 병원 꼴'). 이름·차트번호는 지어낸 값
const OWN = (over: Partial<CalAppt>) =>
  appt({ id: 'own', start: 600, chart: '1234', name: '홍길동', staffId: 'ga', staffName: '정호연', staffMark: '호', kindId: 'dosu30ho', kindName: '도수 30분(호)', ...over })

describe('AC-8548.2: 폰 주 목록 글은 종류 이름에 든 시행자 표시·길이를 겹쳐 적지 않는다', () => {
  it('AC-8548.2: `도수 30분(호)`·(호) → 종류 줄 `도수 30분(호) 정호연`, 이름표 `1234 홍길동 도수 30분(호) 10:00–10:30`', () => {
    renderList({ appts: [OWN({})] })
    const line = row(/^1234 홍길동/)
    expect(within(line).getByText('도수 30분(호) 정호연')).toBeTruthy()
    expect(line.getAttribute('aria-label')).toBe('1234 홍길동 도수 30분(호) 10:00–10:30')
  })

  it('AC-8548.2: 시행자가 (원)이면 종류 줄 `도수 30분(호) (원) 박지원`', () => {
    renderList({ appts: [OWN({ staffName: '박지원', staffMark: '원' })], google: linked() })
    const line = row(/^1234 홍길동/)
    expect(within(line).getByText('도수 30분(호) (원) 박지원')).toBeTruthy()
    expect(line.getAttribute('aria-label')).toBe('1234 홍길동 도수 30분(호) (원) 10:00–10:30')
  })

  it('AC-8548.3: 지금 기본 종류는 지금 그대로 `도수 (호) 정호연`', () => {
    renderList({ appts: [OWN({ kindId: 'dosu', kindName: '도수' })] })
    const line = row(/^1234 홍길동/)
    expect(within(line).getByText('도수 (호) 정호연')).toBeTruthy()
    expect(line.getAttribute('aria-label')).toBe('1234 홍길동 도수 (호) 10:00–10:30 30분')
  })
})
