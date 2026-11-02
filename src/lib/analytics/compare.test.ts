import { describe, expect, it } from 'vitest'
import type { BucketRef, Delta, RxGroupDef, Summary } from '@/types/analysis'
import type { ConsumptionRow } from '@/types/consumption'
import type { DateRange } from '@/types/dates'
import { aggregate } from './aggregate'
import { buildSummary, compareNumbers, rxSeries } from './compare'
import { eachDay, weekdayOf } from './dates'

// 2026: 8/31 월 · 9/28 월 · 10/5 월 · 10/12 월 · 10/17 토 · 10/19 월 · 10/23 금 · 10/24 토 · 10/25 일 · 10/26 월

const BASE: ConsumptionRow = {
  rxCode: 'D1001',
  rxName: '가짜정 10mg',
  rxType: '약품',
  date: '2026-10-19',
  firstVisit: false,
  outpatient: true,
  patient: 1,
  region: '서울특별시 강남구 역삼동',
}
const row = (over: Partial<ConsumptionRow> = {}): ConsumptionRow => ({ ...BASE, ...over })
const r = (from: string, to: string): DateRange => ({ from, to })
const ZERO = { patients: 0, newPatients: 0, returning: 0, unknown: 0 }
const UNAVAILABLE: Delta = { kind: 'unavailable' }
const ALL_UNAVAILABLE = { patients: UNAVAILABLE, newPatients: UNAVAILABLE, returning: UNAVAILABLE }

// 환자 번호가 겹치지 않게 줄을 만든다(add 한 번 = 새 환자 n명)
function clinic() {
  let next = 1
  const rows: ConsumptionRow[] = []
  const add = (date: string, n: number, over: Partial<ConsumptionRow> = {}) => {
    for (let i = 0; i < n; i++) rows.push(row({ ...over, date, patient: next++ }))
  }
  // 일요일은 휴진, 다른 날은 매일 n명
  const daily = (range: DateRange, n = 1) => {
    for (const date of eachDay(range)) if (weekdayOf(date) !== 7) add(date, n)
  }
  return { rows, add, daily }
}

function summarize(
  rows: ConsumptionRow[],
  covered: DateRange[],
  today: string,
  quality: 'valid' | 'incomplete' = 'valid',
): Summary {
  return buildSummary({ aggregates: aggregate(rows), covered, quality, today })
}

// 요약 안의 Delta를 모두 꺼낸다
function deltasIn(value: unknown): Delta[] {
  if (Array.isArray(value)) return value.flatMap(deltasIn)
  if (value === null || typeof value !== 'object') return []
  if ('kind' in value) return [value as Delta]
  return Object.values(value).flatMap(deltasIn)
}

const codesOf = (list: { code: string }[]) => list.map((x) => x.code)
// 칸 참조의 파일럿 필드(key·range·state·totals). 비율·재방문은 AC-007.2·AC-007.3 시험이 따로 본다
const pilotRef = (ref: BucketRef | null) => ref && { key: ref.key, range: ref.range, state: ref.state, totals: ref.totals }
const withoutDelta = (list: Summary['week']['rx']) => list.map((x) => ({ ...x, delta: null }))

// 10/5 주(이전) vs 10/12 주(지금), 처방마다 몇 명. 오늘 10/25라 두 주 모두 완전
function weekPair(previous: Record<string, number>, current: Record<string, number>, quality: 'valid' | 'incomplete' = 'valid') {
  const c = clinic()
  for (const [rxCode, n] of Object.entries(previous)) c.add('2026-10-05', n, { rxCode })
  for (const [rxCode, n] of Object.entries(current)) c.add('2026-10-12', n, { rxCode })
  return summarize(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-25', quality)
}

// ── compareNumbers ────────────────────────────────────────

describe('AC-007.1 compareNumbers — 둘 다 유효할 때의 차이·증감률(%)', () => {
  it('늘어남·줄어듦·같음', () => {
    expect(compareNumbers(12, 8)).toEqual({ kind: 'change', diff: 4, pct: 50 })
    expect(compareNumbers(6, 8)).toEqual({ kind: 'change', diff: -2, pct: -25 })
    expect(compareNumbers(8, 8)).toEqual({ kind: 'change', diff: 0, pct: 0 })
    expect(compareNumbers(0, 5)).toEqual({ kind: 'change', diff: -5, pct: -100 })
  })

  it("이전 0 → 지금 3: '신규'", () => {
    expect(compareNumbers(3, 0)).toEqual({ kind: 'new' })
  })

  it('둘 다 0: 차이 0, 증감률 없음(null)', () => {
    expect(compareNumbers(0, 0)).toEqual({ kind: 'change', diff: 0, pct: null })
  })
})

// ── [일] 맨 위 날 · 직전 진료일 · 지난주 같은 요일 ─────────────

describe("AC-007.1 [일] 맨 위 날('어제')", () => {
  it('파일 9/1~10/24, 오늘 10/25(일) → 맨 위 날 10/24(토), 직전 진료일 10/23(금), 지난주 같은 요일 10/17', () => {
    const c = clinic()
    c.daily(r('2026-09-01', '2026-10-22'))
    c.add('2026-10-17', 2) // 10/17 = 3명
    c.add('2026-10-23', 4)
    c.add('2026-10-24', 4)
    c.add('2026-10-24', 2, { firstVisit: true }) // 10/24 = 6명(신환 2)
    const { day } = summarize(c.rows, [r('2026-09-01', '2026-10-24')], '2026-10-25')

    expect(pilotRef(day.day)).toEqual({
      key: '2026-10-24',
      range: r('2026-10-24', '2026-10-24'),
      state: 'complete',
      totals: { patients: 6, newPatients: 2, returning: 4, unknown: 0 },
    })
    expect(day.prevClinicDay).toMatchObject({ key: '2026-10-23', state: 'complete', totals: { patients: 4 } })
    expect(day.vsPrevClinicDay).toEqual({
      patients: { kind: 'change', diff: 2, pct: 50 },
      newPatients: { kind: 'new' },
      returning: { kind: 'change', diff: 0, pct: 0 },
    })
    expect(day.sameWeekdayLastWeek).toMatchObject({ key: '2026-10-17', state: 'complete', totals: { patients: 3 } })
    expect(day.vsSameWeekdayLastWeek.patients).toEqual({ kind: 'change', diff: 3, pct: 100 })
  })

  it('일요일 휴진: 맨 위 날이 월요일(10/26)이면 직전 진료일은 토요일(10/24), 일요일이 아니다', () => {
    const c = clinic()
    c.daily(r('2026-10-01', '2026-10-26'))
    const { day } = summarize(c.rows, [r('2026-10-01', '2026-10-26')], '2026-10-27')
    expect(day.day?.key).toBe('2026-10-26')
    expect(weekdayOf('2026-10-26')).toBe(1)
    expect(day.prevClinicDay?.key).toBe('2026-10-24')
    expect(day.vsPrevClinicDay.patients).toEqual({ kind: 'change', diff: 0, pct: 0 })
    expect(day.sameWeekdayLastWeek?.key).toBe('2026-10-19')
  })

  it('파일 마지막 날 = 오늘(10/24) → 10/24는 in-progress, 맨 위 날은 그 전 진료일 10/23', () => {
    const c = clinic()
    c.daily(r('2026-10-01', '2026-10-24'))
    const summary = summarize(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-24')
    expect(summary.day.day?.key).toBe('2026-10-23')
    expect(summary.day.prevClinicDay?.key).toBe('2026-10-22')
    expect(summary.series.day.at(-1)).toMatchObject({ key: '2026-10-24', state: 'in-progress', totals: { patients: 1 } })
  })

  it('PC 시계가 아니라 파일로 정한다: 옛 파일(~10/17)을 10/26에 넣으면 맨 위 날 10/17', () => {
    const c = clinic()
    c.daily(r('2026-09-01', '2026-10-17'))
    const { day, week } = summarize(c.rows, [r('2026-09-01', '2026-10-17')], '2026-10-26')
    expect(day.day?.key).toBe('2026-10-17')
    expect(day.prevClinicDay?.key).toBe('2026-10-16')
    expect(week.current).toMatchObject({ key: '2026-10-12', state: 'partial' }) // 일요일 10/18은 파일 밖
    expect(week.lastComplete?.key).toBe('2026-10-05')
  })

  it('덮은 기간 밖의 날은 맨 위 날이 될 수 없다', () => {
    const c = clinic()
    c.daily(r('2026-10-01', '2026-10-24'))
    const { day } = summarize(c.rows, [r('2026-10-01', '2026-10-23')], '2026-10-25')
    expect(day.day?.key).toBe('2026-10-23')
  })

  it('맨 위 날과 직전 진료일 사이에 안 덮인 날이 있으면 직전 진료일을 모른다 → 비교 불가', () => {
    const c = clinic()
    c.daily(r('2026-10-01', '2026-10-21'))
    c.add('2026-10-23', 3)
    const { day } = summarize(c.rows, [r('2026-10-01', '2026-10-21'), r('2026-10-23', '2026-10-23')], '2026-10-25')
    expect(day.day?.key).toBe('2026-10-23')
    expect(day.prevClinicDay).toBeNull() // 10/22에 진료했는지 알 수 없다
    expect(day.vsPrevClinicDay).toEqual(ALL_UNAVAILABLE)
    expect(day.rx.every((x) => x.previous === null && x.delta.kind === 'unavailable')).toBe(true)
    expect(day.topRising).toEqual([])
    // 지난주 같은 요일(10/16)은 덮여 있어 비교한다
    expect(day.sameWeekdayLastWeek).toMatchObject({ key: '2026-10-16', state: 'complete' })
    expect(day.vsSameWeekdayLastWeek.patients).toEqual({ kind: 'change', diff: 2, pct: 200 })
  })

  it("지난주 같은 요일이 덮였지만 휴진(0명) → 그 0과 비교해 '신규'", () => {
    const c = clinic()
    c.add('2026-10-23', 2)
    c.add('2026-10-24', 3)
    const { day } = summarize(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-25')
    expect(pilotRef(day.sameWeekdayLastWeek)).toEqual({ key: '2026-10-17', range: r('2026-10-17', '2026-10-17'), state: 'complete', totals: ZERO })
    expect(day.vsSameWeekdayLastWeek.patients).toEqual({ kind: 'new' })
  })

  it('지난주 같은 요일이 파일 밖이면 비교 불가', () => {
    const c = clinic()
    c.daily(r('2026-10-20', '2026-10-24'))
    const { day } = summarize(c.rows, [r('2026-10-20', '2026-10-24')], '2026-10-25')
    expect(day.sameWeekdayLastWeek).toMatchObject({ key: '2026-10-17', state: 'partial' })
    expect(day.vsSameWeekdayLastWeek).toEqual(ALL_UNAVAILABLE)
  })

  it('완전한 날이 없으면(오늘 하루치뿐) 맨 위 날 없음, 모두 비교 불가', () => {
    const c = clinic()
    c.add('2026-10-24', 3)
    const { day } = summarize(c.rows, [r('2026-10-24', '2026-10-24')], '2026-10-24')
    expect(day).toEqual({
      day: null,
      prevClinicDay: null,
      vsPrevClinicDay: ALL_UNAVAILABLE,
      sameWeekdayLastWeek: null,
      vsSameWeekdayLastWeek: ALL_UNAVAILABLE,
      rx: [],
      topRising: [],
      topFalling: [],
      groups: [],
    })
  })

  it('[일] 처방 증감·급증감은 맨 위 날 vs 직전 진료일', () => {
    const c = clinic()
    c.add('2026-10-23', 5, { rxCode: 'X0001' })
    c.add('2026-10-24', 9, { rxCode: 'X0001' })
    const { day } = summarize(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-25')
    expect(day.rx).toEqual([
      { code: 'X0001', name: '가짜정 10mg', type: '약품', current: 9, previous: 5, delta: { kind: 'change', diff: 4, pct: 80 }, newRate: 0, returningRate: 1, followupRate: 0 },
    ])
    expect(codesOf(day.topRising)).toEqual(['X0001'])
  })
})

// ── [주] ─────────────────────────────────────────────────

describe('AC-007.1 [주] 이번 주 · 지난주 vs 그 전주', () => {
  it('오늘 10/25(일) → 10/19 주는 in-progress, lastComplete 10/12 주, previous 10/5 주 → 증감 있음', () => {
    const c = clinic()
    c.daily(r('2026-09-01', '2026-10-24'))
    c.add('2026-10-14', 3) // 10/12 주 = 6 + 3 = 9명, 10/5 주 = 6명
    const { week } = summarize(c.rows, [r('2026-09-01', '2026-10-24')], '2026-10-25')
    expect(week.current).toMatchObject({ key: '2026-10-19', range: r('2026-10-19', '2026-10-25'), state: 'in-progress', totals: { patients: 6 } })
    expect(week.lastComplete).toMatchObject({ key: '2026-10-12', range: r('2026-10-12', '2026-10-18'), state: 'complete', totals: { patients: 9 } })
    expect(week.previous).toMatchObject({ key: '2026-10-05', state: 'complete', totals: { patients: 6 } })
    expect(week.vsPrevious).toEqual({
      patients: { kind: 'change', diff: 3, pct: 50 },
      newPatients: { kind: 'change', diff: 0, pct: null },
      returning: { kind: 'change', diff: 3, pct: 50 },
    })
    expect(week.rx).toEqual([
      { code: 'D1001', name: '가짜정 10mg', type: '약품', current: 9, previous: 6, delta: { kind: 'change', diff: 3, pct: 50 }, newRate: 0, returningRate: 1, followupRate: 0 },
    ])
  })

  it('덮였지만 줄이 없는 주(통째로 휴진)는 0명인 칸 → 그다음 주와 비교하면 신규', () => {
    const c = clinic()
    c.daily(r('2026-09-28', '2026-10-04'))
    c.daily(r('2026-10-12', '2026-10-24'))
    const summary = summarize(c.rows, [r('2026-09-28', '2026-10-24')], '2026-10-25')
    expect(summary.week.lastComplete).toMatchObject({ key: '2026-10-12', totals: { patients: 6 } })
    expect(pilotRef(summary.week.previous)).toEqual({ key: '2026-10-05', range: r('2026-10-05', '2026-10-11'), state: 'complete', totals: ZERO })
    expect(summary.week.vsPrevious.patients).toEqual({ kind: 'new' })
    expect(summary.week.rx.map((x) => [x.code, x.previous, x.delta.kind])).toEqual([['D1001', 0, 'new']])
    // 추세 그래프에도 0명인 칸으로 나온다. 덮인 일요일도 0명인 날
    expect(summary.series.week.map((b) => [b.key, b.state, b.totals.patients])).toEqual([
      ['2026-09-28', 'complete', 6],
      ['2026-10-05', 'complete', 0],
      ['2026-10-12', 'complete', 6],
      ['2026-10-19', 'in-progress', 6],
    ])
    expect(summary.series.day.map((b) => b.key)).toEqual(eachDay(r('2026-09-28', '2026-10-24')))
    expect(summary.series.day.find((b) => b.key === '2026-10-04')).toMatchObject({ state: 'complete', totals: ZERO })
  })

  it('두 파일 사이 공백: 안 덮인 주는 추세에서 빠지고, 그 주가 previous면 비교 불가', () => {
    const c = clinic()
    c.daily(r('2026-09-01', '2026-09-30'))
    c.daily(r('2026-10-12', '2026-10-24'))
    const summary = summarize(c.rows, [r('2026-10-12', '2026-10-24'), r('2026-09-01', '2026-09-30')], '2026-10-25')
    expect(summary.covered).toEqual([r('2026-09-01', '2026-09-30'), r('2026-10-12', '2026-10-24')])
    expect(summary.series.week.map((b) => [b.key, b.state])).toEqual([
      ['2026-08-31', 'partial'],
      ['2026-09-07', 'complete'],
      ['2026-09-14', 'complete'],
      ['2026-09-21', 'complete'],
      ['2026-09-28', 'partial'],
      ['2026-10-12', 'complete'],
      ['2026-10-19', 'in-progress'],
    ])
    expect(summary.week.lastComplete?.key).toBe('2026-10-12')
    expect(pilotRef(summary.week.previous)).toEqual({ key: '2026-10-05', range: r('2026-10-05', '2026-10-11'), state: 'partial', totals: ZERO })
    expect(summary.week.vsPrevious).toEqual(ALL_UNAVAILABLE)
    expect(summary.week.rx.map((x) => [x.code, x.current, x.previous, x.delta.kind])).toEqual([['D1001', 6, null, 'unavailable']])
    expect(summary.series.day.some((b) => b.key === '2026-10-05')).toBe(false)
  })
})

// ── [월] ─────────────────────────────────────────────────

describe('AC-007.1 [월] 이번 달 · 지난달 vs 그 전달', () => {
  it('파일 9/1~10/24 → 10월 in-progress, lastComplete 9월, previous 8월(안 덮임) → 비교 불가', () => {
    const c = clinic()
    c.daily(r('2026-09-01', '2026-10-24'))
    const { month } = summarize(c.rows, [r('2026-09-01', '2026-10-24')], '2026-10-25')
    expect(month.current).toMatchObject({ key: '2026-10', range: r('2026-10-01', '2026-10-31'), state: 'in-progress', totals: { patients: 21 } })
    expect(month.lastComplete).toMatchObject({ key: '2026-09', range: r('2026-09-01', '2026-09-30'), state: 'complete', totals: { patients: 26 } })
    expect(pilotRef(month.previous)).toEqual({ key: '2026-08', range: r('2026-08-01', '2026-08-31'), state: 'partial', totals: ZERO })
    expect(month.vsPrevious).toEqual(ALL_UNAVAILABLE)
    expect(month.rx.map((x) => [x.code, x.current, x.previous, x.delta.kind])).toEqual([['D1001', 26, null, 'unavailable']])
    expect(month.topRising).toEqual([])
    expect(month.topFalling).toEqual([])
  })

  it('파일 9/15~10/24 → 9월은 partial, lastComplete 없음', () => {
    const c = clinic()
    c.daily(r('2026-09-15', '2026-10-24'))
    const { month, series } = summarize(c.rows, [r('2026-09-15', '2026-10-24')], '2026-10-25')
    expect(series.month.map((b) => [b.key, b.state])).toEqual([
      ['2026-09', 'partial'],
      ['2026-10', 'in-progress'],
    ])
    expect(month.current?.key).toBe('2026-10')
    expect(month.lastComplete).toBeNull()
    expect(month.previous).toBeNull()
    expect(month.vsPrevious).toEqual(ALL_UNAVAILABLE)
    expect(month.rx).toEqual([])
  })

  it('두 달 다 완전하면 증감(파일 8/1~10/24)', () => {
    const c = clinic()
    c.daily(r('2026-08-01', '2026-10-24'))
    c.add('2026-09-10', 13) // 9월 = 26 + 13 = 39명, 8월 = 26명
    const { month } = summarize(c.rows, [r('2026-08-01', '2026-10-24')], '2026-10-25')
    expect(month.lastComplete).toMatchObject({ key: '2026-09', totals: { patients: 39 } })
    expect(month.previous).toMatchObject({ key: '2026-08', state: 'complete', totals: { patients: 26 } })
    expect(month.vsPrevious.patients).toEqual({ kind: 'change', diff: 13, pct: 50 })
  })
})

// ── 처방 비교 · 급증감 ─────────────────────────────────────

describe('AC-007.1 처방 비교 · 급증감(이전 5명 이상만)', () => {
  it('이전 4명→20명은 목록에 없고, 5명→9명은 topRising, 이전 0→3은 신규, 지금 0명이 된 처방도 줄어듦에', () => {
    const { week } = weekPair(
      { A0004: 4, B0005: 5, C0009: 9, E0006: 6, F0007: 7 },
      { A0004: 20, B0005: 9, C0009: 3, D0000: 3, F0007: 7 },
    )
    expect(codesOf(week.rx)).toEqual(['A0004', 'B0005', 'C0009', 'D0000', 'E0006', 'F0007'])
    const byCode = Object.fromEntries(week.rx.map((x) => [x.code, x]))
    expect(byCode.A0004.delta).toEqual({ kind: 'change', diff: 16, pct: 400 })
    expect(byCode.D0000).toMatchObject({ current: 3, previous: 0, delta: { kind: 'new' } })
    expect(byCode.E0006).toEqual({
      code: 'E0006',
      name: '가짜정 10mg',
      type: '약품',
      current: 0,
      previous: 6,
      delta: { kind: 'change', diff: -6, pct: -100 },
      newRate: null,
      returningRate: null,
      followupRate: null,
    })
    expect(byCode.F0007.delta).toEqual({ kind: 'change', diff: 0, pct: 0 })
    expect(codesOf(week.topRising)).toEqual(['B0005'])
    expect(codesOf(week.topFalling)).toEqual(['C0009', 'E0006']) // 같은 -6이면 처방코드 순
  })

  it('늘어난 것 diff 큰 순 5개, 줄어든 것 diff 작은 순 5개', () => {
    const up = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']
    const down = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']
    const previous = Object.fromEntries([...up.map((code) => [code, 5]), ...down.map((code) => [code, 10])])
    const current = Object.fromEntries([...up.map((code, i) => [code, 6 + i]), ...down.map((code, i) => [code, 9 - i])])
    const { week } = weekPair(previous, current)
    expect(codesOf(week.topRising)).toEqual(['R7', 'R6', 'R5', 'R4', 'R3'])
    expect(week.topRising.map((x) => (x.delta.kind === 'change' ? x.delta.diff : NaN))).toEqual([7, 6, 5, 4, 3])
    expect(codesOf(week.topFalling)).toEqual(['S7', 'S6', 'S5', 'S4', 'S3'])
    expect(week.topFalling.map((x) => (x.delta.kind === 'change' ? x.delta.diff : NaN))).toEqual([-7, -6, -5, -4, -3])
  })

  it('신환율·F/U율 = 지금 칸의 신환 / 전체, 2회 이상 / 전체', () => {
    const rows = [
      row({ patient: 1, date: '2026-10-12', firstVisit: true }),
      row({ patient: 1, date: '2026-10-13' }),
      row({ patient: 2, date: '2026-10-12' }),
      row({ patient: 2, date: '2026-10-14' }),
      row({ patient: 3, date: '2026-10-12' }),
      row({ patient: 3, date: '2026-10-13' }),
      row({ patient: 3, date: '2026-10-15' }),
      row({ patient: 4, date: '2026-10-13' }),
    ]
    const { week } = summarize(rows, [r('2026-10-01', '2026-10-24')], '2026-10-25')
    expect(week.rx[0]).toMatchObject({ code: 'D1001', current: 4, newRate: 0.25, followupRate: 0.75 })
  })

  it("품질 incomplete → 모든 Delta 'unavailable', 급증감 빈 배열, 숫자는 그대로", () => {
    const previous = { B0005: 5, C0009: 9, F0007: 7 }
    const current = { B0005: 9, C0009: 3, D0000: 3, F0007: 7 }
    const valid = weekPair(previous, current)
    const bad = weekPair(previous, current, 'incomplete')

    expect(bad.quality).toBe('incomplete')
    expect(deltasIn(valid).some((d) => d.kind !== 'unavailable')).toBe(true) // 시험이 헛돌지 않게
    const deltas = deltasIn(bad)
    expect(deltas.length).toBeGreaterThan(0)
    expect(deltas.every((d) => d.kind === 'unavailable')).toBe(true)
    for (const view of [bad.day, bad.week, bad.month]) {
      expect(view.topRising).toEqual([])
      expect(view.topFalling).toEqual([])
    }
    expect(valid.week.topRising.length).toBeGreaterThan(0)

    expect(bad.series).toEqual(valid.series)
    expect(bad.day.day).toEqual(valid.day.day)
    expect(bad.day.prevClinicDay).toEqual(valid.day.prevClinicDay)
    expect(bad.week.current).toEqual(valid.week.current)
    expect(bad.week.lastComplete).toEqual(valid.week.lastComplete)
    expect(bad.week.previous).toEqual(valid.week.previous)
    expect(withoutDelta(bad.week.rx)).toEqual(withoutDelta(valid.week.rx))
    expect(withoutDelta(bad.day.rx)).toEqual(withoutDelta(valid.day.rx))
  })
})

// ── 모양 · 정렬 · 같은 입력 → 같은 출력 ──────────────────────

describe('AC-007.1 요약 모양', () => {
  const previous = { MM042: 6, AA154: 5, D1001: 8 }
  const current = { D1001: 9, B4001: 2, AA154: 7, MM042: 1 }

  it('rx는 처방코드 순(일·주·월 모두)', () => {
    const summary = weekPair(previous, current)
    const ascending = (xs: string[]) => xs.every((x, i) => i === 0 || xs[i - 1] < x)
    for (const view of [summary.day, summary.week, summary.month]) expect(ascending(codesOf(view.rx))).toBe(true)
    expect(codesOf(summary.week.rx)).toEqual(['AA154', 'B4001', 'D1001', 'MM042'])
  })

  it('같은 입력 → 같은 출력(줄·구간 순서를 뒤집어도 JSON이 같다)', () => {
    const c = clinic()
    for (const [rxCode, n] of Object.entries(previous)) c.add('2026-10-05', n, { rxCode })
    for (const [rxCode, n] of Object.entries(current)) c.add('2026-10-12', n, { rxCode })
    c.daily(r('2026-10-01', '2026-10-24'))
    const covered = [r('2026-10-01', '2026-10-10'), r('2026-10-11', '2026-10-24')]
    const first = JSON.stringify(summarize(c.rows, covered, '2026-10-25'))
    expect(JSON.stringify(summarize(c.rows, covered, '2026-10-25'))).toBe(first)
    expect(JSON.stringify(summarize([...c.rows].reverse(), [...covered].reverse(), '2026-10-25'))).toBe(first)
  })

  it('covered는 합친 구간, today는 받은 그대로, 칸 참조는 key·range·state·totals·rates·revisit만', () => {
    const c = clinic()
    c.daily(r('2026-10-01', '2026-10-24'))
    const summary = summarize(c.rows, [r('2026-10-11', '2026-10-24'), r('2026-10-01', '2026-10-10')], '2026-10-25')
    expect(Object.keys(summary).sort()).toEqual(['covered', 'day', 'month', 'quality', 'series', 'today', 'week'])
    expect(summary.covered).toEqual([r('2026-10-01', '2026-10-24')])
    expect(summary.today).toBe('2026-10-25')
    const refs: (BucketRef | null)[] = [summary.day.day, summary.week.current, summary.month.current, ...summary.series.week]
    for (const ref of refs) expect(Object.keys(ref ?? {}).sort()).toEqual(['key', 'range', 'rates', 'revisit', 'state', 'totals'])
  })

  it('기간이 오늘 뒤까지 적혀 있어도(10/1~10/31, 오늘 10/25) 오늘 뒤의 빈 칸은 만들지 않는다', () => {
    const c = clinic()
    c.daily(r('2026-10-01', '2026-10-24'))
    const summary = summarize(c.rows, [r('2026-10-01', '2026-10-31')], '2026-10-25')
    expect(summary.series.day.at(-1)).toMatchObject({ key: '2026-10-25', state: 'in-progress', totals: ZERO })
    expect(summary.week.current).toMatchObject({ key: '2026-10-19', state: 'in-progress', totals: { patients: 6 } })
    expect(summary.series.week.map((b) => b.key)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'])
    expect(summary.month.current?.key).toBe('2026-10')
    expect(summary.day.day?.key).toBe('2026-10-24')
  })

  it('줄이 없고 덮은 구간도 없으면 빈 요약', () => {
    const summary = summarize([], [], '2026-10-25')
    expect(summary.series).toEqual({ day: [], week: [], month: [] })
    expect(summary.day.day).toBeNull()
    for (const view of [summary.week, summary.month]) {
      expect(view).toEqual({ current: null, lastComplete: null, previous: null, vsPrevious: ALL_UNAVAILABLE, rx: [], topRising: [], topFalling: [], groups: [] })
    }
  })
})

// ── rxSeries ──────────────────────────────────────────────

describe('AC-007.1 rxSeries — 처방 하나의 칸별 환자 수(추세용)', () => {
  const rows = [
    row({ patient: 1, date: '2026-10-05', rxCode: 'A1' }),
    row({ patient: 2, date: '2026-10-06', rxCode: 'A1' }),
    row({ patient: 3, date: '2026-10-12', rxCode: 'A1', firstVisit: true }),
    row({ patient: 4, date: '2026-10-19', rxCode: 'B2' }),
  ]
  const agg = aggregate(rows)

  it('그 갈래의 칸마다 하나, key 오름차순, 그 처방이 없는 칸은 0', () => {
    expect(rxSeries(agg, 'week', 'A1')).toEqual([
      { key: '2026-10-05', patients: 2, newPatients: 0 },
      { key: '2026-10-12', patients: 1, newPatients: 1 },
      { key: '2026-10-19', patients: 0, newPatients: 0 },
    ])
    expect(rxSeries(agg, 'day', 'B2').map((p) => [p.key, p.patients])).toEqual([
      ['2026-10-05', 0],
      ['2026-10-06', 0],
      ['2026-10-12', 0],
      ['2026-10-19', 1],
    ])
    expect(rxSeries(agg, 'month', 'A1')).toEqual([{ key: '2026-10', patients: 3, newPatients: 1 }])
  })

  it('없는 처방코드 → 모두 0', () => {
    expect(rxSeries(agg, 'month', 'ZZZ')).toEqual([{ key: '2026-10', patients: 0, newPatients: 0 }])
  })
})

// ── 신환율·재진율 ─────────────────────────────────────────

describe('AC-007.2 신환율·재진율 — 전체 환자 중 비율(0~1)', () => {
  it('칸마다 신환 ÷ 전체, 재진 ÷ 전체(알 수 없음이 있으면 둘의 합이 1보다 작다)', () => {
    const c = clinic()
    c.add('2026-10-23', 1, { firstVisit: true })
    c.add('2026-10-23', 2)
    c.add('2026-10-23', 1, { firstVisit: null })
    const { day } = summarize(c.rows, [r('2026-10-01', '2026-10-23')], '2026-10-25')
    expect(day.day?.key).toBe('2026-10-23')
    expect(day.day?.rates).toEqual({ newRate: 0.25, returningRate: 0.5 })
  })

  it('0명인 칸(덮였지만 줄이 없음)은 null', () => {
    const c = clinic()
    c.daily(r('2026-10-12', '2026-10-24'))
    const { week } = summarize(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-25')
    expect(week.previous).toMatchObject({ key: '2026-10-05', totals: ZERO })
    expect(week.previous?.rates).toEqual({ newRate: null, returningRate: null })
  })

  it('series의 모든 칸: 비율 = 수 ÷ 전체', () => {
    const c = clinic()
    c.daily(r('2026-10-01', '2026-10-24'), 3)
    c.add('2026-10-14', 2, { firstVisit: true })
    const summary = summarize(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-25')
    for (const ref of [...summary.series.day, ...summary.series.week, ...summary.series.month]) {
      const { patients, newPatients, returning } = ref.totals
      expect(ref.rates).toEqual(
        patients === 0 ? { newRate: null, returningRate: null } : { newRate: newPatients / patients, returningRate: returning / patients },
      )
    }
  })

  it('처방 비교의 재진율 = 그 처방 환자 중 칸에서 재진인 환자 ÷ 그 처방 환자', () => {
    const c = clinic()
    c.add('2026-10-12', 1, { firstVisit: true })
    c.add('2026-10-12', 2)
    c.add('2026-10-13', 1, { firstVisit: null })
    const { week, day } = summarize(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-25')
    expect(week.rx[0]).toMatchObject({ code: 'D1001', current: 4, newRate: 0.25, returningRate: 0.5 })
    expect(day.rx[0]).toMatchObject({ code: 'D1001', current: 1, newRate: 0, returningRate: 0 }) // 10/13: 알 수 없음 1명
  })
})

// ── 재방문 '집계 중' ─────────────────────────────────────

// 10/1(목) 신환이 10/5에 다시 왔다. 7일 창 10/2~10/8, 14일 창 10/2~10/15
const NEW_DAY = '2026-10-01'
const revisitRows = (): ConsumptionRow[] => [
  row({ patient: 900, date: NEW_DAY, firstVisit: true }),
  row({ patient: 900, date: '2026-10-05' }),
]
const refIn = (refs: BucketRef[], key: string) => {
  const found = refs.find((ref) => ref.key === key)
  if (found === undefined) throw new Error(`칸이 없어요: ${key}`)
  return found
}

describe("AC-007.3 재방문 '집계 중' — 칸 첫날 ~ 칸 끝날 + N일이 다 덮이고 끝났을 때만 숫자", () => {
  it('두 창이 다 덮이고 끝났으면 수와 비율', () => {
    const summary = summarize(revisitRows(), [r('2026-10-01', '2026-10-24')], '2026-10-25')
    expect(refIn(summary.series.day, NEW_DAY).revisit).toEqual({ cohort: 1, within7: 1, within14: 1, rate7: 1, rate14: 1, within30: null, after30: null, rate30: null })
  })

  it('14일 창이 덜 덮였으면 14일만 집계 중(null)', () => {
    const summary = summarize(revisitRows(), [r('2026-10-01', '2026-10-10')], '2026-10-25')
    expect(refIn(summary.series.day, NEW_DAY).revisit).toEqual({ cohort: 1, within7: 1, within14: null, rate7: 1, rate14: null, within30: null, after30: null, rate30: null })
  })

  it('파일 사이 공백이 창 안에 있으면 집계 중', () => {
    const summary = summarize(revisitRows(), [r('2026-10-01', '2026-10-06'), r('2026-10-08', '2026-10-24')], '2026-10-25')
    expect(refIn(summary.series.day, NEW_DAY).revisit).toEqual({ cohort: 1, within7: null, within14: null, rate7: null, rate14: null, within30: null, after30: null, rate30: null })
  })

  it.each([
    ['2026-10-08', { within7: null, within14: null, rate7: null, rate14: null, within30: null, after30: null, rate30: null }], // 7일 창 끝날이 오늘
    ['2026-10-09', { within7: 1, within14: null, rate7: 1, rate14: null, within30: null, after30: null, rate30: null }],
    ['2026-10-15', { within7: 1, within14: null, rate7: 1, rate14: null, within30: null, after30: null, rate30: null }], // 14일 창 끝날이 오늘
    ['2026-10-16', { within7: 1, within14: 1, rate7: 1, rate14: 1, within30: null, after30: null, rate30: null }],
  ])('오늘이 %s → %j (창 끝날이 오늘 이후면 덮였어도 집계 중)', (today, expected) => {
    const summary = summarize(revisitRows(), [r('2026-10-01', '2026-10-24')], today)
    expect(refIn(summary.series.day, NEW_DAY).revisit).toEqual({ cohort: 1, ...expected })
  })

  it('칸 자체가 덜 덮였으면 집계 중(주 9/28~10/4 중 9/28~9/30이 안 덮임)', () => {
    const summary = summarize(revisitRows(), [r('2026-10-01', '2026-10-24')], '2026-10-25')
    expect(refIn(summary.series.week, '2026-09-28').revisit).toEqual({ cohort: 1, within7: null, within14: null, rate7: null, rate14: null, within30: null, after30: null, rate30: null })
  })

  it('달 칸은 다음 달 7일·14일까지 덮이고 끝나야 숫자', () => {
    const both = summarize(revisitRows(), [r('2026-10-01', '2026-11-20')], '2026-11-30')
    expect(refIn(both.series.month, '2026-10').revisit).toEqual({ cohort: 1, within7: 1, within14: 1, rate7: 1, rate14: 1, within30: null, after30: null, rate30: null })
    const only7 = summarize(revisitRows(), [r('2026-10-01', '2026-11-10')], '2026-11-30')
    expect(refIn(only7.series.month, '2026-10').revisit).toEqual({ cohort: 1, within7: 1, within14: null, rate7: 1, rate14: null, within30: null, after30: null, rate30: null })
  })

  it('여러 명: 비율 = 재방문 수 ÷ 집단', () => {
    const rows = [
      ...revisitRows(),
      row({ patient: 901, date: NEW_DAY, firstVisit: true }),
      row({ patient: 901, date: '2026-10-12' }), // 11일째
      row({ patient: 902, date: NEW_DAY, firstVisit: true }), // 다시 오지 않음
    ]
    const summary = summarize(rows, [r('2026-10-01', '2026-10-24')], '2026-10-25')
    expect(refIn(summary.series.day, NEW_DAY).revisit).toEqual({ cohort: 3, within7: 1, within14: 2, rate7: 1 / 3, rate14: 2 / 3, within30: null, after30: null, rate30: null })
  })

  it('집단이 0명이면 수는 0, 비율은 null', () => {
    const summary = summarize([row({ date: '2026-10-02' })], [r('2026-10-01', '2026-10-24')], '2026-10-25')
    expect(refIn(summary.series.day, '2026-10-02').revisit).toEqual({ cohort: 0, within7: 0, within14: 0, rate7: null, rate14: null, within30: null, after30: null, rate30: null })
    expect(refIn(summary.series.day, '2026-10-03').revisit).toEqual({ cohort: 0, within7: 0, within14: 0, rate7: null, rate14: null, within30: null, after30: null, rate30: null })
  })
})

// 10/1(목) 신환. 30일 창 10/2~10/31 — 10/31까지 덮이고 오늘이 11/1 이후여야 숫자
describe("AC-501.3 30일 재방문 '집계 중' — 칸 첫날 ~ 칸 끝날 + 30일이 다 덮이고 끝났을 때만 숫자", () => {
  it('30일 창이 다 덮이고 끝났으면 within30·after30·rate30이 숫자', () => {
    const summary = summarize(revisitRows(), [r('2026-10-01', '2026-11-05')], '2026-11-06')
    expect(refIn(summary.series.day, NEW_DAY).revisit).toEqual({
      cohort: 1,
      within7: 1,
      within14: 1,
      within30: 1,
      after30: 0,
      rate7: 1,
      rate14: 1,
      rate30: 1,
    })
  })

  it('30일 창이 덜 덮였으면 30일만 집계 중(null), 7·14일은 숫자', () => {
    const summary = summarize(revisitRows(), [r('2026-10-01', '2026-10-30')], '2026-11-06')
    expect(refIn(summary.series.day, NEW_DAY).revisit).toEqual({
      cohort: 1,
      within7: 1,
      within14: 1,
      within30: null,
      after30: null,
      rate7: 1,
      rate14: 1,
      rate30: null,
    })
  })

  it('파일 사이 공백이 30일 창 안에만 있으면 30일만 집계 중', () => {
    const summary = summarize(revisitRows(), [r('2026-10-01', '2026-10-20'), r('2026-10-22', '2026-11-05')], '2026-11-06')
    expect(refIn(summary.series.day, NEW_DAY).revisit).toMatchObject({ within7: 1, within14: 1, within30: null, after30: null, rate30: null })
  })

  it.each([
    ['2026-10-31', { within30: null, after30: null, rate30: null }], // 30일 창 끝날이 오늘
    ['2026-11-01', { within30: 1, after30: 0, rate30: 1 }],
  ])('오늘이 %s → %j (창 끝날이 오늘 이후면 덮였어도 집계 중)', (today, expected) => {
    const summary = summarize(revisitRows(), [r('2026-10-01', '2026-11-05')], today)
    expect(refIn(summary.series.day, NEW_DAY).revisit).toMatchObject(expected)
  })

  it('30일 넘어 다시 온 신환: 30일이 숫자일 때만 after30도 숫자', () => {
    const rows = [row({ patient: 900, date: NEW_DAY, firstVisit: true }), row({ patient: 900, date: '2026-11-05' })] // 35일째
    const done = summarize(rows, [r('2026-10-01', '2026-11-10')], '2026-11-11')
    expect(refIn(done.series.day, NEW_DAY).revisit).toEqual({
      cohort: 1,
      within7: 0,
      within14: 0,
      within30: 0,
      after30: 1,
      rate7: 0,
      rate14: 0,
      rate30: 0,
    })
    const counting = summarize(rows, [r('2026-10-01', '2026-10-30'), r('2026-11-05', '2026-11-10')], '2026-11-11')
    expect(refIn(counting.series.day, NEW_DAY).revisit).toMatchObject({ within14: 0, within30: null, after30: null, rate30: null })
  })

  it('칸 자체가 덜 덮였으면 집계 중(주 9/28~10/4 중 9/28~9/30이 안 덮임)', () => {
    const summary = summarize(revisitRows(), [r('2026-10-01', '2026-11-30')], '2026-12-01')
    expect(refIn(summary.series.week, '2026-09-28').revisit).toMatchObject({ within30: null, after30: null, rate30: null })
  })

  it('달 칸은 다음 달 30일까지 덮이고 끝나야 숫자(10월 칸 → 11/30)', () => {
    const done = summarize(revisitRows(), [r('2026-10-01', '2026-11-30')], '2026-12-01')
    expect(refIn(done.series.month, '2026-10').revisit).toMatchObject({ within14: 1, within30: 1, after30: 0, rate30: 1 })
    const short = summarize(revisitRows(), [r('2026-10-01', '2026-11-29')], '2026-12-01')
    expect(refIn(short.series.month, '2026-10').revisit).toMatchObject({ within14: 1, within30: null, after30: null, rate30: null })
    const today = summarize(revisitRows(), [r('2026-10-01', '2026-11-30')], '2026-11-30')
    expect(refIn(today.series.month, '2026-10').revisit).toMatchObject({ within30: null, after30: null, rate30: null })
  })

  it('여러 명: rate30 = 30일 재방문 수 ÷ 집단', () => {
    const rows = [
      ...revisitRows(), // 900: 4일째
      row({ patient: 901, date: NEW_DAY, firstVisit: true }),
      row({ patient: 901, date: '2026-10-25' }), // 24일째
      row({ patient: 902, date: NEW_DAY, firstVisit: true }),
      row({ patient: 902, date: '2026-11-03' }), // 33일째
      row({ patient: 903, date: NEW_DAY, firstVisit: true }), // 다시 오지 않음
    ]
    const summary = summarize(rows, [r('2026-10-01', '2026-11-05')], '2026-11-06')
    expect(refIn(summary.series.day, NEW_DAY).revisit).toEqual({
      cohort: 4,
      within7: 1,
      within14: 1,
      within30: 2,
      after30: 1,
      rate7: 1 / 4,
      rate14: 1 / 4,
      rate30: 2 / 4,
    })
  })

  it('집단이 0명이면 within30·after30은 0, rate30은 null', () => {
    const summary = summarize([row({ date: '2026-10-02' })], [r('2026-10-01', '2026-11-10')], '2026-11-11')
    for (const key of ['2026-10-02', '2026-10-03']) {
      expect(refIn(summary.series.day, key).revisit).toEqual({
        cohort: 0,
        within7: 0,
        within14: 0,
        within30: 0,
        after30: 0,
        rate7: null,
        rate14: null,
        rate30: null,
      })
    }
  })

  it('30일이 숫자인 칸은 7·14일도 숫자이고, 30일이 집계 중이면 after30·rate30도 집계 중(일·주·월, 여러 덮은 기간·오늘)', () => {
    const c = clinic()
    c.daily(r('2026-09-01', '2026-12-10'))
    c.add('2026-10-01', 3, { firstVisit: true })
    const cases: [DateRange[], string][] = [
      [[r('2026-09-01', '2026-12-10')], '2026-12-11'],
      [[r('2026-09-01', '2026-12-10')], '2026-11-05'],
      [[r('2026-09-01', '2026-10-20'), r('2026-10-22', '2026-12-10')], '2026-12-11'],
      [[r('2026-09-15', '2026-11-15')], '2026-11-20'],
    ]
    let counted = 0
    for (const [covered, today] of cases) {
      const summary = summarize(c.rows, covered, today)
      for (const ref of [...summary.series.day, ...summary.series.week, ...summary.series.month]) {
        const { within7, within14, within30, after30, rate30 } = ref.revisit
        if (within30 === null) {
          expect(after30).toBeNull()
          expect(rate30).toBeNull()
          continue
        }
        counted++
        expect(within7).not.toBeNull()
        expect(within14).not.toBeNull()
        expect(after30).not.toBeNull()
      }
    }
    expect(counted).toBeGreaterThan(0)
  })
})

describe('AC-501.4 30일 칸은 더하기만 — 7·14일 판정·숫자는 30일 창과 상관없다', () => {
  it('RevisitView 칸은 지금 칸에 within30·after30·rate30만 더한 것이고, 7·14일은 30일이 집계 중이든 아니든 같다', () => {
    const counting = summarize(revisitRows(), [r('2026-10-01', '2026-10-24')], '2026-10-25')
    const done = summarize(revisitRows(), [r('2026-10-01', '2026-11-30')], '2026-12-01')
    const old = { cohort: 1, within7: 1, within14: 1, rate7: 1, rate14: 1 }
    for (const summary of [counting, done]) {
      const { revisit } = refIn(summary.series.day, NEW_DAY)
      expect(Object.keys(revisit).sort()).toEqual(['after30', 'cohort', 'rate14', 'rate30', 'rate7', 'within14', 'within30', 'within7'])
      expect(revisit).toMatchObject(old)
    }
    expect(refIn(counting.series.day, NEW_DAY).revisit.within30).toBeNull()
    expect(refIn(done.series.day, NEW_DAY).revisit.within30).toBe(1)
  })
})

// ── 그룹 비교 ─────────────────────────────────────────────

const MANUAL: RxGroupDef = { id: 'g-manual', codes: ['MM101', 'MM102'] }

function summarizeGroups(
  rows: ConsumptionRow[],
  covered: DateRange[],
  today: string,
  groups: RxGroupDef[],
  quality: 'valid' | 'incomplete' = 'valid',
): Summary {
  return buildSummary({ aggregates: aggregate(rows, groups), covered, quality, today })
}

describe('AC-007.4 그룹 비교 — 처방 비교와 같은 규칙(같은 칸 짝, 증감, 신환율·재진율·F/U율), id 순', () => {
  it('[주] 지난주 vs 그 전주', () => {
    const c = clinic()
    c.add('2026-10-05', 4, { rxCode: 'MM101' })
    c.add('2026-10-06', 2, { rxCode: 'MM102' })
    c.add('2026-10-12', 6, { rxCode: 'MM101' })
    c.add('2026-10-13', 3, { rxCode: 'MM102', firstVisit: true })
    c.add('2026-10-13', 5, { rxCode: 'D1001' }) // 그룹 밖 코드
    const { week } = summarizeGroups(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-25', [MANUAL])
    expect(week.groups).toEqual([
      {
        id: 'g-manual',
        current: 9,
        previous: 6,
        delta: { kind: 'change', diff: 3, pct: 50 },
        newRate: 3 / 9,
        returningRate: 6 / 9,
        followupRate: 0,
      },
    ])
  })

  it('F/U율 = 그룹 코드를 이틀 이상 받은 환자 ÷ 그룹 환자', () => {
    const rows = [
      row({ patient: 1, date: '2026-10-12', rxCode: 'MM101' }),
      row({ patient: 1, date: '2026-10-14', rxCode: 'MM102' }),
      row({ patient: 2, date: '2026-10-14', rxCode: 'MM101' }),
    ]
    const { week } = summarizeGroups(rows, [r('2026-10-01', '2026-10-24')], '2026-10-25', [MANUAL])
    expect(week.groups[0]).toMatchObject({ id: 'g-manual', current: 2, followupRate: 0.5 })
  })

  it('id 순, 이전 칸에만 있던 그룹은 지금 0명(비율은 null)', () => {
    const c = clinic()
    c.add('2026-10-05', 6, { rxCode: 'ZZ001' })
    c.add('2026-10-05', 2, { rxCode: 'MM101' })
    c.add('2026-10-12', 3, { rxCode: 'MM101' })
    const groups = [
      { id: 'g-z', codes: ['ZZ001'] },
      { id: 'g-a', codes: ['MM101'] },
    ]
    const { week } = summarizeGroups(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-25', groups)
    expect(week.groups.map((g) => g.id)).toEqual(['g-a', 'g-z'])
    expect(week.groups[1]).toEqual({
      id: 'g-z',
      current: 0,
      previous: 6,
      delta: { kind: 'change', diff: -6, pct: -100 },
      newRate: null,
      returningRate: null,
      followupRate: null,
    })
  })

  it('이전 칸이 완전하지 않으면 이전 수 null · 비교 불가', () => {
    const c = clinic()
    c.add('2026-10-08', 2, { rxCode: 'MM101' })
    c.add('2026-10-12', 3, { rxCode: 'MM101' })
    const { week } = summarizeGroups(c.rows, [r('2026-10-08', '2026-10-24')], '2026-10-25', [MANUAL])
    expect(week.groups[0]).toMatchObject({ id: 'g-manual', current: 3, previous: null, delta: UNAVAILABLE })
  })

  it('[일] 맨 위 날 vs 직전 진료일 · 완전한 달이 없으면 [월] 그룹은 빈 목록', () => {
    const c = clinic()
    c.add('2026-10-23', 2, { rxCode: 'MM101' })
    c.add('2026-10-24', 3, { rxCode: 'MM102' })
    const { day, month } = summarizeGroups(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-25', [MANUAL])
    expect(day.groups[0]).toMatchObject({ id: 'g-manual', current: 3, previous: 2, delta: { kind: 'change', diff: 1, pct: 50 } })
    expect(month.groups).toEqual([]) // 완전한 달이 없다
  })

  it('[월] 지난달 vs 그 전달(둘 다 완전한 달)', () => {
    const c = clinic()
    c.add('2026-08-10', 4, { rxCode: 'MM101' })
    c.add('2026-09-10', 5, { rxCode: 'MM102' })
    c.add('2026-09-11', 1, { rxCode: 'MM101', firstVisit: true })
    const { month } = summarizeGroups(c.rows, [r('2026-08-01', '2026-10-24')], '2026-10-25', [MANUAL])
    expect(month.lastComplete?.key).toBe('2026-09')
    expect(month.groups).toEqual([
      {
        id: 'g-manual',
        current: 6,
        previous: 4,
        delta: { kind: 'change', diff: 2, pct: 50 },
        newRate: 1 / 6,
        returningRate: 5 / 6,
        followupRate: 0,
      },
    ])
  })

  it('집계 품질이 incomplete면 증감은 비교 불가(숫자는 그대로)', () => {
    const c = clinic()
    c.add('2026-10-05', 2, { rxCode: 'MM101' })
    c.add('2026-10-12', 3, { rxCode: 'MM101' })
    const { week } = summarizeGroups(c.rows, [r('2026-10-01', '2026-10-24')], '2026-10-25', [MANUAL], 'incomplete')
    expect(week.groups[0]).toMatchObject({ current: 3, delta: UNAVAILABLE })
  })

  it('그룹 정의가 없으면 모든 보기의 그룹은 빈 목록', () => {
    const c = clinic()
    c.daily(r('2026-09-01', '2026-10-24'))
    const summary = summarize(c.rows, [r('2026-09-01', '2026-10-24')], '2026-10-25')
    expect([summary.day.groups, summary.week.groups, summary.month.groups]).toEqual([[], [], []])
  })
})
