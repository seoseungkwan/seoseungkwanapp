import { describe, expect, it } from 'vitest'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { onceView, type OnceRow } from './onceView'
import { statsRange } from './view'

// 신환이 그 처방을 받은 횟수의 화면 숫자 (first90 REQ-4410 AC-4410.2·AC-4410.3·AC-4410.4, design.md 5-8). 날 줄·처방 코드는 모두 이 파일에서 지어낸 값이다

const TODAY = '2026-11-14'
const CODE = 'SW01'
// [code, newPatients, once] — once를 주지 않으면(undefined) 이 기능 전에 저장한 날이다
type Line = [code: string, newPatients: number, once?: number]
function day(ymd: string, lines: Line[]): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: 20, newPatients: 5, returning: 15, unknown: 0 },
    rx: lines.map(([code, newPatients, once]) => ({ code, name: `처방 ${code}`, type: '', patients: newPatients + 3, newPatients, returning: 3, ...(once === undefined ? {} : { once }) })),
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}
const range30 = () => statsRange(TODAY, '30d').current // 10월 15일 – 11월 13일
const range12 = () => statsRange(TODAY, '12m').current // 2025년 12월 1일 – 2026년 11월 30일
const labels = (rows: readonly OnceRow[]) => rows.map((row) => [row.label, row.sub])

describe('AC-4410.2: 달로 묶기 · 달 이름', () => {
  it('AC-4410.2: 최근 30일은 두 달이고 첫 줄은 해를 붙이며 일부만 든 달은 "(15일부터)" · "(13일까지)"다', () => {
    const view = onceView([], CODE, range30(), TODAY)
    expect(view.rows.map((row) => row.month)).toEqual(['2026-10', '2026-11'])
    expect(labels(view.rows)).toEqual([
      ['2026년 10월', '(15일부터)'],
      ['11월', '(13일까지)'],
    ])
  })

  it('AC-4410.2: 최근 12개월은 열두 줄이고 첫 줄·1월 줄만 해가 있다. 기간 끝이 오늘 뒤면 어제까지라 마지막 달은 "(13일까지)"다', () => {
    const view = onceView([], CODE, range12(), TODAY)
    expect(view.rows).toHaveLength(12)
    expect(labels(view.rows)).toEqual([
      ['2025년 12월', null],
      ['2026년 1월', null],
      ['2월', null],
      ['3월', null],
      ['4월', null],
      ['5월', null],
      ['6월', null],
      ['7월', null],
      ['8월', null],
      ['9월', null],
      ['10월', null],
      ['11월', '(13일까지)'],
    ])
  })

  it('AC-4410.2: 한 달 안의 일부면 "(7일 – 13일)"이다. 기간 끝이 오늘이면 오늘까지 센다', () => {
    expect(labels(onceView([], CODE, { from: '2026-03-07', to: '2026-03-13' }, TODAY).rows)).toEqual([['2026년 3월', '(7일 – 13일)']])
    const toToday: DateRange = { from: '2026-11-01', to: TODAY }
    expect(labels(onceView([], CODE, toToday, TODAY).rows)).toEqual([['2026년 11월', '(14일까지)']])
  })

  it('AC-4410.2: 달을 다 덮으면 sub가 없다', () => {
    expect(labels(onceView([], CODE, { from: '2026-02-01', to: '2026-03-31' }, TODAY).rows)).toEqual([
      ['2026년 2월', null],
      ['3월', null],
    ])
  })
})

describe('AC-4410.2: 신환 · 1회 · 2회 이상 · 비율', () => {
  const DAYS = [
    day('2026-10-14', [[CODE, 9, 9]]), // 기간 밖(10월 15일 앞)
    day('2026-10-20', [[CODE, 2, 1]]),
    day('2026-10-28', [
      [CODE, 1, 1],
      ['MT30', 4, 4],
    ]),
    day('2026-11-03', [['sw01', 3, 1]]), // 코드는 대소문자를 가리지 않는다
    day('2026-11-14', [[CODE, 5, 5]]), // 오늘(기간 밖)
  ]

  it('AC-4410.2: 신환 = 그 달 날 칸 newPatients 합, 1회 = once 합, 2회 이상 = 신환 − 1회, 비율은 소수 첫째 자리 아래 버림이다', () => {
    const [oct, nov] = onceView(DAYS, CODE, range30(), TODAY).rows
    expect(oct).toMatchObject({ newPatients: 3, once: 2, more: 1, rate: 66.6 })
    expect(nov).toMatchObject({ newPatients: 3, once: 1, more: 2, rate: 33.3 })
  })

  it('AC-4410.2: 합계는 줄의 합이고 비율은 합끼리 나눈다', () => {
    expect(onceView(DAYS, CODE, range30(), TODAY).total).toEqual({ newPatients: 6, once: 3, more: 3, rate: 50 })
  })

  it('AC-4410.2: 다른 처방 줄은 세지 않는다', () => {
    const [oct] = onceView(DAYS, 'MT30', range30(), TODAY).rows
    expect(oct).toMatchObject({ newPatients: 4, once: 4, more: 0, rate: 100 })
  })

  it('AC-4410.2: 같은 날 줄이 둘이면 뒤의 줄만 센다', () => {
    const view = onceView([day('2026-10-20', [[CODE, 2, 1]]), day('2026-10-20', [[CODE, 4, 3]])], CODE, range30(), TODAY)
    expect(view.rows[0]).toMatchObject({ newPatients: 4, once: 3, more: 1, rate: 75 })
  })

  it('AC-4410.2: 신환이 0이면 1회·2회 이상 0이고 비율은 null이다. 합계도 같다', () => {
    const view = onceView([day('2026-10-20', [['MT30', 4, 4]])], CODE, range30(), TODAY)
    expect(view.rows.map((row) => [row.newPatients, row.once, row.more, row.rate])).toEqual([
      [0, 0, 0, null],
      [0, 0, 0, null],
    ])
    expect(view.total).toEqual({ newPatients: 0, once: 0, more: 0, rate: null })
    expect(view.missing).toBe(false)
  })

  it('AC-4410.2: 비율은 반올림하지 않는다(1 ÷ 3 = 33.3, 2 ÷ 3 = 66.6, 1 ÷ 7 = 14.2)', () => {
    const rate = (newPatients: number, once: number) => onceView([day('2026-10-20', [[CODE, newPatients, once]])], CODE, range30(), TODAY).rows[0]!.rate
    expect(rate(3, 1)).toBe(33.3)
    expect(rate(3, 2)).toBe(66.6)
    expect(rate(7, 1)).toBe(14.2)
  })
})

describe('AC-4410.3: 집계 중 = 오늘이 든 달과 그 앞 달', () => {
  it('AC-4410.3: 최근 12개월은 10월·11월만 counting이다', () => {
    const rows = onceView([], CODE, range12(), TODAY).rows
    expect(rows.filter((row) => row.counting).map((row) => row.month)).toEqual(['2026-10', '2026-11'])
  })

  it('AC-4410.3: 1월이면 그 앞 달은 지난해 12월이다', () => {
    const rows = onceView([], CODE, { from: '2025-11-01', to: '2026-01-04' }, '2026-01-05').rows
    expect(rows.map((row) => [row.month, row.counting])).toEqual([
      ['2025-11', false],
      ['2025-12', true],
      ['2026-01', true],
    ])
  })
})

describe('AC-4410.4: once가 없는 날(이 기능 전에 저장)', () => {
  it('AC-4410.4: 신환이 있는데 once가 없는 날이 든 달은 1회·2회 이상·비율이 null이고 합계도 null이며 missing이다', () => {
    const view = onceView([day('2026-10-20', [[CODE, 2]]), day('2026-11-03', [[CODE, 3, 1]])], CODE, range30(), TODAY)
    expect(view.rows[0]).toMatchObject({ newPatients: 2, once: null, more: null, rate: null })
    expect(view.rows[1]).toMatchObject({ newPatients: 3, once: 1, more: 2, rate: 33.3 })
    expect(view.total).toEqual({ newPatients: 5, once: null, more: null, rate: null })
    expect(view.missing).toBe(true)
  })

  it('AC-4410.4: 신환이 0인 줄은 once가 없어도 모르는 것이 아니다', () => {
    const view = onceView([day('2026-10-20', [[CODE, 0]])], CODE, range30(), TODAY)
    expect(view.rows[0]).toMatchObject({ newPatients: 0, once: 0, rate: null })
    expect(view.missing).toBe(false)
  })
})
