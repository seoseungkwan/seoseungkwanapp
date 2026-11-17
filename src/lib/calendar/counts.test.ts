import { describe, expect, it } from 'vitest'
import { sunapPct } from '@/components/stats/sunapView'
import { monthCells, monthTrend, ratePct, rateSummary } from './counts'
import type { ApptAuto, ApptStatus, CalAllDay, CalCountRow } from './shapes'

// 지어낸 예약 수 줄(listCalendarCounts 모양: 이름·차트번호·메모 칸 없음)
type Kind = 'dosu' | 'jabo' | 'inj' | 'visit'
const KIND_NAME: Record<Kind, string> = { dosu: '도수', jabo: '자보도수', inj: '주사', visit: '진료' }
const STAFF_NAME: Record<string, string> = { ga: '한○○', na: '윤○○', da: '조○○', won: '원장님' }
const row = (
  day: string,
  kindId: Kind,
  { status = 'auto', auto = null, origDay = null, staffId = 'ga' }: { status?: ApptStatus; auto?: ApptAuto; origDay?: string | null; staffId?: string } = {},
): CalCountRow => ({ day, staffId, staffName: STAFF_NAME[staffId], kindId, kindName: KIND_NAME[kindId], status, auto, origDay })
const off = (day: string, staffId: string): CalAllDay => ({ id: `off-${day}`, day, type: 'off', memo: null, staffId, staffName: STAFF_NAME[staffId] })
const memo = (day: string, text: string): CalAllDay => ({ id: `memo-${day}`, day, type: 'memo', memo: text, staffId: null, staffName: null })

describe('AC-5902.5 monthCells: 월 보기 날마다 수', () => {
  // design.md '예'(오늘 11/17)
  const TODAY = '2026-11-17'
  const APPTS = [
    row('2026-11-16', 'dosu'),
    row('2026-11-16', 'dosu', { auto: 'noshow' }),
    row('2026-11-16', 'inj', { status: 'noshow', staffId: 'won' }),
    row('2026-11-16', 'dosu', { status: 'cancel', auto: 'noshow' }),
    row('2026-11-17', 'dosu', { auto: 'noshow' }),
    row('2026-11-17', 'jabo', { status: 'came', staffId: 'na' }),
    row('2026-11-18', 'dosu'),
    row('2026-11-18', 'inj', { staffId: 'won' }),
    row('2026-11-18', 'dosu'),
    row('2026-11-18', 'visit', { origDay: '2026-11-17', staffId: 'won' }),
    row('2026-11-18', 'dosu', { status: 'cancel', origDay: '2026-11-19' }),
    row('2026-11-20', 'dosu'), // 기간 밖
  ]
  const ALLDAY = [off('2026-11-18', 'na'), memo('2026-11-16', '주간 회의 13:00'), memo('2026-11-21', '기간 밖')]
  const cells = monthCells(APPTS, ALLDAY, '2026-11-15', '2026-11-18', TODAY)
  const cell = (day: string) => cells.find((c) => c.day === day)

  it('AC-5902.5: from~to 날마다 한 칸, 날짜 차례', () => {
    expect(cells.map((c) => c.day)).toEqual(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'])
    expect(monthCells([], [], '2026-11-01', '2026-11-30', TODAY)).toHaveLength(30)
  })

  it('AC-5902.5: 11/16 = 예약 3(취소 뺌), 도수 2·주사 1, 안 옴 2(도착 칸 noshow + 상태 noshow, 취소는 안 셈), 변경 0, 종일 메모', () => {
    expect(cell('2026-11-16')).toEqual({
      day: '2026-11-16',
      total: 3,
      kinds: [
        { kindId: 'dosu', kindName: '도수', n: 2 },
        { kindId: 'inj', kindName: '주사', n: 1 },
      ],
      noshow: 2,
      moved: 0,
      allday: [memo('2026-11-16', '주간 회의 13:00')],
    })
  })

  it('AC-5902.5: 11/18 = 예약 4, 도수 2·주사 1·진료 1, 안 옴 null(오늘 뒤), 변경 1(옮겨 온 취소는 뺌), 종일 (나) 휴무', () => {
    expect(cell('2026-11-18')).toEqual({
      day: '2026-11-18',
      total: 4,
      kinds: [
        { kindId: 'dosu', kindName: '도수', n: 2 },
        { kindId: 'inj', kindName: '주사', n: 1 },
        { kindId: 'visit', kindName: '진료', n: 1 },
      ],
      noshow: null,
      moved: 1,
      allday: [off('2026-11-18', 'na')],
    })
  })

  it('AC-5902.5: 안 옴은 오늘 전 날만 — 오늘(11/17)은 null, 예약 없는 지난 날은 0', () => {
    expect(cell('2026-11-17')).toMatchObject({ total: 2, noshow: null, moved: 0 })
    expect(cell('2026-11-15')).toEqual({ day: '2026-11-15', total: 0, kinds: [], noshow: 0, moved: 0, allday: [] })
  })

  it('AC-5902.5: 종류는 많은 차례(같으면 먼저 나온 차례)', () => {
    const rows = [row('2026-11-10', 'inj'), row('2026-11-10', 'dosu'), row('2026-11-10', 'dosu'), row('2026-11-10', 'visit')]
    expect(monthCells(rows, [], '2026-11-10', '2026-11-10', TODAY)[0].kinds.map((k) => k.kindId)).toEqual(['dosu', 'inj', 'visit'])
  })
})

describe('AC-5907.1 rateSummary·monthTrend·ratePct: 취소·변경·안 옴 수와 비율', () => {
  // design.md '예': 10줄(취소 2, 처음 자리 있음 1(취소 아님), noshow 1)
  const TEN = [
    row('2026-11-02', 'dosu'),
    row('2026-11-02', 'dosu', { auto: 'came' }),
    row('2026-11-03', 'dosu', { status: 'cancel', auto: 'noshow' }),
    row('2026-11-03', 'jabo', { origDay: '2026-10-30' }),
    row('2026-11-04', 'jabo', { auto: 'noshow', staffId: 'na' }),
    row('2026-11-04', 'dosu', { status: 'came', staffId: 'na' }),
    row('2026-11-05', 'dosu', { status: 'cancel', staffId: 'na' }),
    row('2026-11-05', 'dosu', { staffId: 'da' }),
    row('2026-11-06', 'inj', { status: 'came', staffId: 'won' }),
    row('2026-11-06', 'visit', { staffId: 'won' }),
  ]

  it('AC-5907.1: 예약 10 · 취소 2 (20.0%) · 변경 1 (10.0%) · 안 옴 1 (10.0%)', () => {
    const s = rateSummary(TEN)
    expect({ total: s.total, cancel: s.cancel, moved: s.moved, noshow: s.noshow }).toEqual({ total: 10, cancel: 2, moved: 1, noshow: 1 })
    expect([ratePct(s.cancel, s.total), ratePct(s.moved, s.total), ratePct(s.noshow, s.total)]).toEqual(['20.0%', '10.0%', '10.0%'])
  })

  it('AC-5907.1: 시행자별·종류별 같은 네 수, 예약 많은 차례(같으면 먼저 나온 차례), 이름은 그 줄의 저장된 이름', () => {
    const s = rateSummary(TEN)
    expect(s.byStaff).toEqual([
      { id: 'ga', label: '한○○', total: 4, cancel: 1, moved: 1, noshow: 0 },
      { id: 'na', label: '윤○○', total: 3, cancel: 1, moved: 0, noshow: 1 },
      { id: 'won', label: '원장님', total: 2, cancel: 0, moved: 0, noshow: 0 },
      { id: 'da', label: '조○○', total: 1, cancel: 0, moved: 0, noshow: 0 },
    ])
    expect(s.byKind).toEqual([
      { id: 'dosu', label: '도수', total: 6, cancel: 2, moved: 0, noshow: 0 },
      { id: 'jabo', label: '자보도수', total: 2, cancel: 0, moved: 1, noshow: 1 },
      { id: 'inj', label: '주사', total: 1, cancel: 0, moved: 0, noshow: 0 },
      { id: 'visit', label: '진료', total: 1, cancel: 0, moved: 0, noshow: 0 },
    ])
  })

  it('AC-5907.1: 취소한 예약도 옮긴 적이 있으면 변경에 세고(둘 다), 취소는 안 옴에 세지 않는다', () => {
    const s = rateSummary([row('2026-11-02', 'dosu', { status: 'cancel', auto: 'noshow', origDay: '2026-11-01' })])
    expect({ total: s.total, cancel: s.cancel, moved: s.moved, noshow: s.noshow }).toEqual({ total: 1, cancel: 1, moved: 1, noshow: 0 })
  })

  it('AC-5907.1: 같은 id의 이름이 바뀌었으면 한 줄이고 이름은 마지막(가장 늦은) 줄 것', () => {
    const renamed = { ...row('2026-11-09', 'dosu'), staffName: '한□□', kindName: '도수치료' }
    const s = rateSummary([row('2026-11-02', 'dosu'), renamed])
    expect(s.byStaff).toEqual([{ id: 'ga', label: '한□□', total: 2, cancel: 0, moved: 0, noshow: 0 }])
    expect(s.byKind).toEqual([{ id: 'dosu', label: '도수치료', total: 2, cancel: 0, moved: 0, noshow: 0 }])
  })

  it("AC-5907.1: 빈 기간은 모두 0, 표는 빈 목록, 비율은 '–'", () => {
    expect(rateSummary([])).toEqual({ total: 0, cancel: 0, moved: 0, noshow: 0, byStaff: [], byKind: [] })
    expect(ratePct(0, 0)).toBe('–')
  })

  it("AC-5907.1: ratePct는 소수 첫째 자리 — 1/3 → '33.3%', 2/3 → '66.7%', 0/5 → '0.0%', 5/5 → '100.0%'", () => {
    expect(ratePct(1, 3)).toBe('33.3%')
    expect(ratePct(2, 3)).toBe('66.7%')
    expect(ratePct(0, 5)).toBe('0.0%')
    expect(ratePct(5, 5)).toBe('100.0%')
  })

  it('AC-5907.1: ratePct는 sunapPct와 같은 반올림이다(분모 1~200, 분자 0~분모 모두)', () => {
    const diff: string[] = []
    for (let whole = 0; whole <= 200; whole++) {
      for (let part = 0; part <= whole; part++) if (ratePct(part, whole) !== sunapPct(part, whole)) diff.push(`${part}/${whole}`)
    }
    expect(diff).toEqual([])
  })

  it('AC-5907.1: monthTrend는 준 달 차례로 달마다 네 수(예약 없는 달은 0, 준 달 밖 줄은 뺌)', () => {
    const rows = [
      ...TEN,
      row('2026-10-31', 'dosu', { status: 'cancel' }),
      row('2026-10-01', 'dosu', { origDay: '2026-09-30' }),
      row('2026-09-30', 'dosu'),
    ]
    expect(monthTrend(rows, ['2026-10', '2026-11', '2026-12'])).toEqual([
      { month: '2026-10', total: 2, cancel: 1, moved: 1, noshow: 0 },
      { month: '2026-11', total: 10, cancel: 2, moved: 1, noshow: 1 },
      { month: '2026-12', total: 0, cancel: 0, moved: 0, noshow: 0 },
    ])
  })
})
