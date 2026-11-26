import { describe, expect, it } from 'vitest'
import { DEFAULT_CAL_SETTINGS, type ApptStatus, type CalAllDay, type CalSettings, type CalSlotRow } from '@/types/calendar'
import { occupancy, occupancyLevel, occupancyLists, occupancySpan, type Occupancy } from './occupancy'

// 예약 빈자리 (spec stats-insights REQ-6105 AC-6105.1·AC-6105.2, design.md '빈자리').
// 예약 줄은 listCalendarSlots 모양이고 시행자·차트번호는 모두 지어낸 것이다.
// 2026-11-18 검토 고침: 찬 분이 0인 칸(기간 동안 그 요일·시와 겹친 예약이 한 번도 없음)은 안 여는 시간으로 보고 빈 칸(null)이다

const TODAY = '2026-11-18' // 수요일. 기간 = 9월 23일(수) ~ 11월 17일(화), 요일마다 꼭 8일
const SETTINGS: CalSettings = {
  ...DEFAULT_CAL_SETTINGS,
  staff: [
    { id: 'ga', name: '한○○', mark: '한', color: 'blueberry' },
    { id: 'na', name: '윤○○', mark: '윤', color: 'basil' },
  ],
  openHour: 9,
  closeHour: 12,
  sunday: false,
}

const slot = (day: string, staffId: string, start: number, len: number, status: ApptStatus = 'auto'): CalSlotRow => ({
  day,
  staffId,
  staffName: staffId === 'ga' ? '한○○' : '윤○○',
  kindId: 'dosu',
  kindName: '도수',
  status,
  auto: null,
  start,
  len,
  chart: '90001',
})
const off = (day: string, staffId: string): CalAllDay => ({ id: `off-${day}-${staffId}`, day, type: 'off', memo: null, staffId, staffName: '가짜' })

const ROWS = [
  slot('2026-11-09', 'ga', 570, 60), // 월 9:30~10:30 → 9시 30분 · 10시 30분
  slot('2026-11-02', 'na', 600, 30), // 월 10:00~10:30 → 10시 30분
  slot('2026-11-02', 'ga', 650, 20), // 월 10:50~11:10 → 10시 10분 · 11시 10분
  slot('2026-11-09', 'na', 540, 60, 'cancel'), // 취소 — 뺀다
  slot('2026-11-18', 'ga', 540, 60), // 오늘 — 기간 밖
  slot('2026-09-22', 'na', 540, 60), // 오늘 − 57일 — 기간 밖
  slot('2026-09-23', 'na', 540, 60), // 오늘 − 56일(수) — 첫날 9시 60분
  slot('2026-11-15', 'ga', 540, 60), // 일요일 — 일요일을 안 쓰면 뺀다
  slot('2026-11-17', 'na', 480, 90), // 화 8:00~9:30 → 여는 시 앞은 빼고 9시 30분
  slot('2026-11-14', 'na', 690, 60), // 토 11:30~12:30 → 11시 30분(닫는 시 뒤는 뺀다)
]
// 한○○은 11월 16일(월) 휴무. 메모 줄·기간 밖 휴무는 상관없다
const OFFS = [
  off('2026-11-16', 'ga'),
  { id: 'memo-1', day: '2026-11-10', type: 'memo', memo: '회의', staffId: null, staffName: null } satisfies CalAllDay,
  off('2026-11-25', 'na'),
]

const run = (over: Partial<Parameters<typeof occupancy>[0]> = {}) => occupancy({ rows: ROWS, offs: OFFS, settings: SETTINGS, today: TODAY, staffId: null, ...over })

describe('AC-6105.1 occupancy: 요일 × 시 찬 정도', () => {
  it('AC-6105.1: 기간은 오늘 앞 56일(어제까지)이다', () => {
    expect(occupancySpan(TODAY)).toEqual({ from: '2026-09-23', to: '2026-11-17' })
    expect(occupancySpan('2027-01-01')).toEqual({ from: '2026-11-06', to: '2026-12-31' })
  })

  it('AC-6105.1: 칸은 월~토 × 여는 시~닫는 시 − 1, 설정이 일요일을 쓰면 일도', () => {
    const view = run()
    expect(view.weekdays).toEqual([1, 2, 3, 4, 5, 6])
    expect(view.hours).toEqual([9, 10, 11])
    expect(view.cells).toHaveLength(6)
    for (const cells of view.cells) expect(cells).toHaveLength(3)
    const wide = run({ settings: { ...SETTINGS, openHour: 8, closeHour: 20, sunday: true } })
    expect(wide.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(wide.hours).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
  })

  it('AC-6105.1: 찬 분 = 취소 아닌 예약이 그 시와 겹친 분, 자리 = 그 요일 날마다 (휴무 아닌 시행자 수 × 60), 찬 정도는 반올림 정수 %, 찬 분이 0인 칸은 null', () => {
    // 월 자리 = (8일 × 2명 − 휴무 1) × 60 = 900분, 다른 요일 = 8 × 2 × 60 = 960분
    const view = run()
    expect(view.cells).toEqual([
      [3, 8, 1], // 월: 30/900 · 70/900 · 10/900
      [3, null, null], // 화: 30/960, 10시·11시는 예약이 한 번도 없음
      [6, null, null], // 수: 60/960(첫날)
      [null, null, null], // 목·금: 예약 없음
      [null, null, null],
      [null, null, 3], // 토: 30/960
    ])
    expect(view.booked).toBe(6) // 기간 안·취소 아님·보이는 요일의 예약 수
  })

  it('AC-6105.1: 시행자를 고르면 그 시행자 예약만, 자리는 그 시행자가 휴무 아닌 날 × 60', () => {
    // 한○○: 월 자리 = 7일 × 60 = 420분(11월 16일 휴무), 다른 요일 480분
    const ga = run({ staffId: 'ga' })
    expect(ga.cells[0]).toEqual([7, 10, 2]) // 30/420 · 40/420 · 10/420
    expect(ga.cells.slice(1).flat().every((pct) => pct === null)).toBe(true) // 한○○ 예약이 없는 칸
    expect(ga.booked).toBe(2)
    // 윤○○: 휴무 없음 → 모든 요일 480분
    const na = run({ staffId: 'na' })
    expect(na.cells).toEqual([
      [null, 6, null],
      [6, null, null],
      [13, null, null], // 60/480 = 12.5 → 13
      [null, null, null],
      [null, null, null],
      [null, null, 6],
    ])
    expect(na.booked).toBe(4)
  })

  it('AC-6105.1: 일요일을 쓰면 일요일 예약도 센다', () => {
    const view = run({ settings: { ...SETTINGS, sunday: true } })
    expect(view.cells[6]).toEqual([6, null, null]) // 60/960
    expect(view.booked).toBe(7)
  })

  it('AC-6105.1: 100을 넘으면 100이다(겹쳐 잡은 예약)', () => {
    const crowd = Array.from({ length: 9 }, () => slot('2026-11-12', 'ga', 540, 60)) // 목 9시 540분 / 480분
    const view = run({ rows: crowd, staffId: 'ga' })
    expect(view.cells[3]).toEqual([100, null, null])
  })

  it('AC-6105.1: 찬 분이 조금이라도 있으면 반올림해 0%여도 빈 칸이 아니라 0이다(찬 분 0만 null)', () => {
    const view = run({ rows: [slot('2026-11-12', 'ga', 540, 2)] }) // 목 9시 2분 / 960분 = 0.2% → 0
    expect(view.cells[3]).toEqual([0, null, null])
    expect(view.cells.filter((_, at) => at !== 3).flat().every((pct) => pct === null)).toBe(true)
    expect(view.booked).toBe(1)
  })

  it('AC-6105.1: 취소된 예약·고르지 않은 시행자 예약만 있는 칸도 찬 분 0이라 null이다', () => {
    const rows = [slot('2026-11-12', 'na', 540, 60, 'cancel'), slot('2026-11-13', 'na', 600, 60)]
    expect(run({ rows }).cells[3]).toEqual([null, null, null]) // 목: 취소뿐
    expect(run({ rows, staffId: 'ga' }).cells[4]).toEqual([null, null, null]) // 금: 윤○○ 예약뿐
    expect(run({ rows, staffId: 'na' }).cells[4]).toEqual([null, 13, null]) // 60/480 = 12.5 → 13
  })

  it("AC-6105.1·AC-6105.2: 목록은 빈 칸(null)을 건너뛰어 '늘 비는 시간'에 예약 없던 시간이 0%로 들어가지 않는다", () => {
    // 칸: 월 3·8·1 · 화 3 · 수 6 · 토 11시 3 (나머지는 예약 없음 → null)
    expect(occupancyLists(run())).toEqual({ empty: '월 11시 1% · 월 9시 3% · 화 9시 3%', full: null })
  })

  it('AC-6105.1: 자리가 0이면 빈 칸(null) — 그 요일 날마다 휴무인 시행자, 시행자가 없는 설정', () => {
    const fridays = ['2026-09-25', '2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13']
    const view = run({ offs: fridays.map((day) => off(day, 'ga')), staffId: 'ga' })
    expect(view.cells[4]).toEqual([null, null, null])
    expect(view.cells[0]).toEqual([6, 8, 2]) // 월 30/480 · 40/480 · 10/480 (휴무 없음)
    const nobody = run({ settings: { ...SETTINGS, staff: [] } })
    expect(nobody.cells.flat().every((pct) => pct === null)).toBe(true)
  })
})

// 반차 휴무(spec staff AC-7616.3): 그 담당의 그날 자리에서 오전 휴무는 경계 앞, 오후 휴무는 경계 뒤만 뺀다.
// 경계 = 그 요일 병원 점심 시작(없으면 13:00, 예약 넣기 경고 AC-7616.2와 같다). 시간 줄은 11시~14시로 경계 앞뒤를 다 본다
describe('AC-7616.3 occupancy: 반차 휴무는 반나절 자리만 뺀다', () => {
  const MIDDAY: CalSettings = { ...SETTINGS, openHour: 11, closeHour: 15 }
  const half = (day: string, staffId: string, part: 'am' | 'pm' | null): CalAllDay => ({ ...off(day, staffId), part })
  // 목(11-12)·금(11-13)·수(11-04) 11:00~15:00 한○○ 예약 세 겹 → 그 요일 시마다 찬 분 180
  const busy = (...days: string[]) => days.flatMap((day) => [0, 1, 2].map(() => slot(day, 'ga', 660, 240)))
  const ROWS_MID = busy('2026-11-12', '2026-11-13', '2026-11-04')
  const at = (over: Partial<Parameters<typeof occupancy>[0]>) =>
    occupancy({ rows: ROWS_MID, offs: [], settings: MIDDAY, today: TODAY, staffId: 'ga', ...over })
  // 한○○ 자리: 휴무 없으면 8일 × 60 = 480분 → 180/480 = 37.5 → 38, 하루가 빠지면 420분 → 180/420 = 42.9 → 43

  it('AC-7616.3: 점심 시작이 없으면(병원 정보 없음) 경계는 13:00 — 오전 휴무는 11·12시만, 오후 휴무는 13·14시만 그날 자리가 빠진다', () => {
    const view = at({ offs: [half('2026-11-05', 'ga', 'am'), half('2026-11-06', 'ga', 'pm')] }) // 목 오전 · 금 오후
    expect(view.hours).toEqual([11, 12, 13, 14])
    expect(view.cells[3]).toEqual([43, 43, 38, 38]) // 목: 경계 앞만 420분
    expect(view.cells[4]).toEqual([38, 38, 43, 43]) // 금: 경계 뒤만 420분
    expect(view.cells[2]).toEqual([38, 38, 38, 38]) // 수: 휴무 없음
  })

  it('AC-7616.3: 경계는 그 요일 병원 점심 시작이다 — 12:30이면 12시 칸은 30분만 빠지고, 점심 없는 요일·휴진 요일은 13:00', () => {
    const open = { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 }
    const days = [open, open, null, { ...open, lunchFrom: 750, lunchTo: 810 }, { ...open, lunchFrom: null, lunchTo: null }, open, null]
    const offs = [half('2026-11-05', 'ga', 'am'), half('2026-11-06', 'ga', 'pm'), half('2026-11-11', 'ga', 'am')] // 목 오전 · 금 오후 · 수(휴진 요일) 오전
    const view = at({ offs, settings: { ...MIDDAY, days } })
    expect(view.cells[3]).toEqual([43, 40, 38, 38]) // 목 경계 12:30: 11시 420분 · 12시 450분(180/450 = 40)
    expect(view.cells[4]).toEqual([38, 38, 43, 43]) // 금 점심 없음 → 13:00
    expect(view.cells[2]).toEqual([43, 43, 38, 38]) // 수 휴진 요일 → 13:00
  })

  it('AC-7616.3: 그 담당의 자리만 빠진다 — 모두 보기에서 한○○ 오전 휴무는 경계 앞 60분만 줄고, 윤○○ 반차는 한○○ 자리를 안 건드린다', () => {
    // 모두: 8일 × 2명 × 60 = 960분 → 180/960 = 18.75 → 19, 오전 60분 빠지면 900분 → 180/900 = 20
    const all = at({ offs: [half('2026-11-05', 'ga', 'am')], staffId: null })
    expect(all.cells[3]).toEqual([20, 20, 19, 19])
    const other = at({ offs: [half('2026-11-05', 'na', 'am'), half('2026-11-06', 'na', 'pm')] })
    expect(other.cells[3]).toEqual([38, 38, 38, 38])
    expect(other.cells[4]).toEqual([38, 38, 38, 38])
  })

  it('AC-7616.3: part 없는(null) 휴무는 지금처럼 하루 전체가 빠지고, 같은 날 오전·오후 휴무가 다 있으면 하루 전체가 빠진다', () => {
    expect(at({ offs: [half('2026-11-05', 'ga', null)] }).cells[3]).toEqual([43, 43, 43, 43])
    expect(at({ offs: [half('2026-11-05', 'ga', 'am'), half('2026-11-05', 'ga', 'pm')] }).cells[3]).toEqual([43, 43, 43, 43])
    expect(at({ offs: [half('2026-11-05', 'ga', 'pm'), half('2026-11-05', 'ga', null)] }).cells[3]).toEqual([43, 43, 43, 43])
  })
})

describe('AC-6105.2 occupancyLists: 늘 비는 시간 · 꽉 차는 시간', () => {
  const view = (cells: (number | null)[][], weekdays = [1, 2, 3, 4, 5, 6]): Occupancy => ({ weekdays, hours: [9, 10, 14], cells, booked: 1 })
  const SAMPLE = view([
    [72, 96, 40],
    [60, 78, 32],
    [66, 84, 49],
    [58, 50, 41],
    [70, 93, 85],
    [38, null, null],
  ])

  it("AC-6105.2: '늘 비는 시간' = 50보다 낮은 칸 가운데 낮은 순 3개, '꽉 차는 시간' = 85 이상 가운데 높은 순 2개, `{요일} {시}시 {p}%`를 ' · '로 잇는다", () => {
    expect(occupancyLists(SAMPLE)).toEqual({ empty: '화 14시 32% · 토 9시 38% · 월 14시 40%', full: '월 10시 96% · 금 10시 93%' })
  })

  it('AC-6105.2: 50은 비는 시간이 아니고 85는 꽉 차는 시간이다. 빈 칸(null)은 어느 쪽에도 없다', () => {
    const edge = view([[50, 85, null], [84, 49, null], [null, null, null], [null, null, null], [null, null, null], [null, null, null]])
    expect(occupancyLists(edge)).toEqual({ empty: '화 10시 49%', full: '월 10시 85%' })
  })

  it('AC-6105.2: 같은 찬 정도는 요일·시 차례(월부터, 이른 시부터). 일요일은 일', () => {
    const tie = view([[30, 30, 90], [30, 90, 90], [60, 60, 60], [60, 60, 60], [60, 60, 60], [60, 60, 60], [10, 60, 60]], [1, 2, 3, 4, 5, 6, 7])
    expect(occupancyLists(tie)).toEqual({ empty: '일 9시 10% · 월 9시 30% · 월 10시 30%', full: '월 14시 90% · 화 10시 90%' })
  })

  it('AC-6105.2: 해당 칸이 없으면 그 줄은 null이다', () => {
    const middle = view(Array.from({ length: 6 }, () => [60, 70, 80]))
    expect(occupancyLists(middle)).toEqual({ empty: null, full: null })
  })
})

describe('AC-6105.3 occupancyLevel: 네 단계 색', () => {
  it('AC-6105.3: 45 미만 0 · 65 미만 1 · 85 미만 2 · 85 이상 3', () => {
    expect([0, 44, 45, 64, 65, 84, 85, 100].map(occupancyLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
  })
})
