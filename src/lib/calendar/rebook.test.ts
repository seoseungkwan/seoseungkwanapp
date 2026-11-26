import { describe, expect, it } from 'vitest'
import type { ApptAuto, ApptStatus, CalSlotRow } from '@/types/calendar'
import { NO_STAFF_ID } from './counts'
import { rebookRates } from './rebook'

// 시행자별 다시 예약 (spec stats-insights REQ-6104 AC-6104.2, design.md '다시 예약').
// 예약 줄은 listCalendarSlots 모양(이름·메모 없음)이고 차트번호·시행자는 모두 지어낸 것이다

const TODAY = '2026-11-18'
const EDGE = '2026-11-04' // 오늘 − 14일

const slot = (
  day: string,
  chart: string | null,
  { staffId = 'ga', status = 'came', auto = null }: { staffId?: string | null; status?: ApptStatus; auto?: ApptAuto } = {},
): CalSlotRow => ({
  day,
  staffId,
  staffName: staffId === null ? null : staffId === 'ga' ? '한○○' : '윤○○',
  kindId: 'dosu',
  kindName: '도수',
  status,
  auto,
  start: 600,
  len: 30,
  chart,
})

// 다섯 명이 와서(대상 5) 셋이 14일 안에 같은 시행자 예약을 또 잡았다
const FIVE = [
  slot('2026-10-01', '91001'),
  slot('2026-10-05', '91001', { status: 'auto' }), // 4일 뒤 — 다시 예약(상태 auto, 아직 표시 없음도 취소가 아니라 든다)
  slot('2026-10-02', '91002'),
  slot('2026-10-16', '91002', { status: 'noshow' }), // 14일 뒤 — 다시 예약(안 옴도 취소가 아니다)
  slot('2026-10-03', '91003'),
  slot('2026-10-04', '91003', { status: 'cancel' }), // 1일 뒤지만 취소 — 아님
  slot('2026-10-04', '91004'),
  slot('2026-10-19', '91004', { status: 'auto' }), // 15일 뒤 — 아님
  slot('2026-10-06', '91005', { status: 'auto', auto: 'came' }), // 보이는 상태가 왔음(비트 도착) — 대상
  slot('2026-10-07', '91005', { status: 'auto' }), // 1일 뒤 — 다시 예약
]

const byStaff = (rows: readonly CalSlotRow[], staffId = 'ga') => rebookRates(rows, TODAY).find((rate) => rate.staffId === staffId)

describe('AC-6104.2 rebookRates: 시행자별 다시 예약', () => {
  it('AC-6104.2: 대상 = 보이는 상태가 왔음·차트번호 있음·오늘 − 14일까지, 다시 예약 = 같은 차트번호·같은 시행자의 취소 아닌 예약이 1~14일 뒤에 있음', () => {
    // 대상 다섯 가운데 91001(4일 뒤)·91002(14일 뒤 안 옴)·91005(1일 뒤)가 다시 예약 → 3/5 = 60%
    expect(byStaff(FIVE)).toEqual({ staffId: 'ga', targets: 5, rebooked: 3, pct: 60 })
  })

  it('AC-6104.2: 왔음이 아닌 예약(안 옴·취소·표시 없음·비트 안 옴)과 차트번호 없는 예약은 대상이 아니다', () => {
    const others = [
      slot('2026-10-08', '92001', { status: 'noshow' }),
      slot('2026-10-08', '92002', { status: 'cancel' }),
      slot('2026-10-08', '92003', { status: 'auto' }),
      slot('2026-10-08', '92004', { status: 'auto', auto: 'noshow' }),
      slot('2026-10-08', null),
    ]
    const follow = others.map((row) => slot('2026-10-10', row.chart, { status: 'auto' }))
    expect(byStaff([...FIVE, ...others, ...follow])).toEqual({ staffId: 'ga', targets: 5, rebooked: 3, pct: 60 })
  })

  it('AC-6104.2: 날이 오늘 − 14일과 같으면 대상, 하루라도 뒤면 대상이 아니다(다시 잡을 14일이 아직 다 지나지 않았다)', () => {
    const edge = [slot(EDGE, '93001'), slot('2026-11-05', '93002'), slot('2026-11-17', '93003')]
    expect(byStaff([...FIVE, ...edge])).toEqual({ staffId: 'ga', targets: 6, rebooked: 3, pct: 50 })
  })

  it('AC-6104.2: 같은 날 또 잡은 예약·앞선 예약·다른 시행자의 예약은 다시 예약이 아니다', () => {
    const rows = [
      ...FIVE.slice(4), // 91003·91004·91005 — 다시 예약 1(91005)
      slot('2026-10-10', '94001'),
      slot('2026-10-10', '94001', { status: 'auto' }), // 같은 날(0일 뒤)
      slot('2026-10-11', '94002'),
      slot('2026-10-09', '94002', { status: 'auto' }), // 앞선 날
      slot('2026-10-12', '94003'),
      slot('2026-10-13', '94003', { staffId: 'na', status: 'auto' }), // 다른 시행자
    ]
    expect(byStaff(rows)).toEqual({ staffId: 'ga', targets: 6, rebooked: 1, pct: 17 })
  })

  it('AC-6104.2: 비율은 반올림 정수 %(62.5 → 63, 14.29 → 14)', () => {
    const eight = Array.from({ length: 8 }, (_, i) => slot(`2026-09-0${i + 1}`, `9500${i}`))
    const fiveBack = eight.slice(0, 5).map((row) => slot('2026-09-12', row.chart, { status: 'auto' }))
    expect(byStaff([...eight, ...fiveBack])?.pct).toBe(63)
    const seven = eight.slice(0, 7)
    expect(byStaff([...seven, slot('2026-09-12', '95000', { status: 'auto' })])?.pct).toBe(14)
  })

  it('AC-6104.2: 대상이 5보다 적으면 비율은 null(4명은 null, 5명부터 숫자)', () => {
    expect(byStaff(FIVE.slice(0, 8))).toEqual({ staffId: 'ga', targets: 4, rebooked: 2, pct: null })
    expect(byStaff(FIVE)?.pct).toBe(60)
  })

  it('AC-6104.2: 시행자마다 따로 센다 — 줄에 나온 차례, 대상이 없는 시행자는 대상 0·null', () => {
    const rows = [slot('2026-10-01', '96001', { staffId: 'na', status: 'auto' }), ...FIVE]
    expect(rebookRates(rows, TODAY)).toEqual([
      { staffId: 'na', targets: 0, rebooked: 0, pct: null },
      { staffId: 'ga', targets: 5, rebooked: 3, pct: 60 },
    ])
    expect(rebookRates([], TODAY)).toEqual([])
  })

  it("AC-8503.3: 시행자 없는 예약(시행자 null)은 '시행자 없음' 한 묶음(id NO_STAFF_ID = 빈 글자)으로 센다 — 다른 시행자 예약과 섞이지 않는다", () => {
    const none = FIVE.map((row) => ({ ...row, staffId: null, staffName: null }))
    const rows = [...none, slot('2026-10-02', '97001'), slot('2026-10-05', '97001', { status: 'auto' })]
    expect(NO_STAFF_ID).toBe('')
    expect(rebookRates(rows, TODAY)).toEqual([
      { staffId: NO_STAFF_ID, targets: 5, rebooked: 3, pct: 60 },
      { staffId: 'ga', targets: 1, rebooked: 1, pct: null },
    ])
    // 시행자 없는 첫 예약 뒤 같은 차트번호를 시행자 있는 예약으로 다시 잡아도 '같은 시행자'가 아니다
    const mixed = [slot('2026-10-01', '98001', { staffId: null }), slot('2026-10-03', '98001', { status: 'auto' })]
    expect(rebookRates(mixed, TODAY)).toEqual([
      { staffId: NO_STAFF_ID, targets: 1, rebooked: 0, pct: null },
      { staffId: 'ga', targets: 0, rebooked: 0, pct: null },
    ])
  })

  it('AC-6104.2: 결과에 차트번호가 없다(시행자 id·대상 수·다시 예약 수·비율만)', () => {
    const result = rebookRates(FIVE, TODAY)
    expect(result.map((rate) => Object.keys(rate).sort())).toEqual([['pct', 'rebooked', 'staffId', 'targets']])
    const text = JSON.stringify(result)
    for (const chart of ['91001', '91002', '91003', '91004', '91005']) expect(text).not.toContain(chart)
  })
})
