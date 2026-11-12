import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addDays, eachDay } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { StatsRxGroup } from '@/types/rxGroups'
import { pickRange } from './periodPick'
import { rateText } from './rxPickView'
import { comparisonAt } from './sections/trendLabels'
import { chartCells, perDayText, periodPatients, sumLabel, trendFit, trendText, type ChartCell, type ReadyTreatmentRow, type TrendFit } from './treatmentChart'
import { groupKey, treatmentDetail, treatmentRows, type TreatmentRow } from './treatmentView'
import { statsRange, type StatsInput, type StatsPeriod } from './view'

// 처방별 추세 열린 칸·줄 표의 숫자와 글 (group-exclude REQ-3706·3707·3709 AC-3709.2, design.md '화면 숫자').
// 입력은 가짜 일 줄·덮은 기간·묶음뿐이다(모두 지어낸 값). 묶음 줄(groups)의 id는 groupKey(codes)다

type Line = DayPayload['groups'][number]

const line = (id: string, patients: number, newPatients = 0): Line => ({ id, patients, newPatients, returning: patients - newPatients })

// 그날 총환자(totals.patients)와 묶음 줄
function day(ymd: string, patients: number, groups: Line[] = [], partial = false): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients, newPatients: 0, returning: patients, unknown: 0 },
    rx: [],
    groups,
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null },
  }
}

const today = '2026-11-13'
// '7d': 이번 기간 11월 6일 ~ 12일, 비교 기간 10월 30일 ~ 11월 5일
const THIS_WEEK = { from: '2026-11-06', to: '2026-11-12' }
const LAST_WEEK = { from: '2026-10-30', to: '2026-11-05' }
const bothWeeks = [{ from: LAST_WEEK.from, to: THIS_WEEK.to }]

const BASIC_PT: StatsRxGroup = { id: 'g1', name: '기본 PT', codes: ['MM010', 'MM015'], sortOrder: 0, out: ['ESWT7'] }
const KEY = groupKey(BASIC_PT.codes, BASIC_PT)

const input = (period: StatsPeriod, days: DayPayload[], covered: DateRange[], day0 = today): StatsInput => ({ days, covered, range: statsRange(day0, period) })

function ready(row: TreatmentRow | undefined): ReadyTreatmentRow {
  if (row?.kind !== 'ready') throw new Error(`준비된 줄이 아니다: ${row?.kind}`)
  return row
}
const readyOf = (stats: StatsInput) => ready(treatmentRows(stats, [BASIC_PT])[0])

// 추세선 시험용 칸. pct는 chartCells와 같은 셈(건수 ÷ 총환자 × 100)
function cell(count: number, patients = 10, partial = false): ChartCell {
  return {
    code: KEY,
    start: '2026-11-02',
    end: '2026-11-02',
    label: '',
    partial,
    count,
    newCount: 0,
    returningCount: count,
    quantity: null,
    amount: null,
    covered: true,
    patients,
    pct: patients > 0 ? (count / patients) * 100 : null,
    comparison: null,
  }
}
const fitOf = (slope: number): TrendFit => ({ slope, intercept: 0, from: 0, to: 2 })
const flat3 = (count: number) => [cell(count), cell(count), cell(count)]

describe('AC-3706.1 periodPatients', () => {
  it('AC-3706.1 기간 안 날마다 totals.patients를 더하고, totals.patients > 0인 날 수가 진료한 날이다', () => {
    const days = [
      day('2026-11-05', 99), // 기간 앞
      day('2026-11-06', 12),
      day('2026-11-07', 0), // 쉬는 날(줄은 있지만 0명)
      day('2026-11-08', 7),
      day('2026-11-12', 5),
      day('2026-11-13', 40), // 기간 뒤
    ]
    expect(periodPatients(days, THIS_WEEK)).toEqual({ patients: 24, openDays: 3 })
  })

  it('AC-3706.1 같은 날이 둘이면 뒤의 줄을 쓴다(rowsIn 규칙)', () => {
    const days = [day('2026-11-08', 7), day('2026-11-09', 4), day('2026-11-08', 9), day('2026-11-09', 0)]
    expect(periodPatients(days, THIS_WEEK)).toEqual({ patients: 9, openDays: 1 })
  })

  it('AC-3706.1 기간 안에 저장된 줄이 없으면 0명·0일이고 받은 목록을 바꾸지 않는다', () => {
    expect(periodPatients([], THIS_WEEK)).toEqual({ patients: 0, openDays: 0 })
    const days = [day('2026-11-01', 30)]
    expect(periodPatients(days, THIS_WEEK)).toEqual({ patients: 0, openDays: 0 })
    expect(days).toEqual([day('2026-11-01', 30)])
  })
})

describe('AC-3706.2 총환자 대비 글', () => {
  it('AC-3706.2 묶음 건수 ÷ 기간 총환자는 rateText 글(소수 첫째 자리까지 버림)이다', () => {
    // 이번 주 날마다 총환자 9명 중 묶음 2건 → 14건 ÷ 63명 = 22.22…%
    const days = eachDay({ from: LAST_WEEK.from, to: THIS_WEEK.to }).map((ymd) => day(ymd, 9, [line(KEY, 2)]))
    const stats = input('7d', days, bothWeeks)
    const item = readyOf(stats)
    const { patients } = periodPatients(stats.days, stats.range.current)
    expect([item.row.count, patients]).toEqual([14, 63])
    expect(rateText(item.row.count, patients)).toBe('22.2%')
    expect(rateText(2, 3)).toBe('66.6%') // 반올림이면 66.7%
  })

  it('AC-3706.2 기간 총환자가 0명이면 –다', () => {
    const days = eachDay({ from: LAST_WEEK.from, to: THIS_WEEK.to }).map((ymd) => day(ymd, 0, [line(KEY, 0)]))
    const stats = input('7d', days, bothWeeks)
    const item = readyOf(stats)
    expect(rateText(item.row.count, periodPatients(stats.days, stats.range.current).patients)).toBe('–')
  })
})

describe('AC-3706.3 chartCells', () => {
  // 이번 주: 총환자·묶음 건수가 날마다 다르다. 11월 8일은 줄이 없는 날(휴진), 11월 6일은 같은 날 줄이 둘(뒤의 줄)
  const thisWeek = [
    day('2026-11-06', 50, [line(KEY, 1)]),
    day('2026-11-07', 0, [line(KEY, 0)]),
    day('2026-11-09', 3, [line(KEY, 1)]),
    day('2026-11-10', 8, [line(KEY, 8)]),
    day('2026-11-11', 7, [line(KEY, 0)]),
    day('2026-11-12', 6, [line(KEY, 2)]),
    day('2026-11-06', 10, [line(KEY, 3)]),
  ]
  const lastWeek = eachDay(LAST_WEEK).map((ymd) => day(ymd, 5, [line(KEY, ymd === '2026-11-01' ? 4 : 1)]))

  it('AC-3706.3 일 칸마다 그 날 총환자, 총환자 대비 = 칸 건수 ÷ 칸 총환자 × 100, 총환자 0이면 값 없음이다', () => {
    const stats = input('7d', [...lastWeek, ...thisWeek], bothWeeks)
    const cells = chartCells(stats, readyOf(stats))
    expect(cells.map((item) => [item.start, item.count, item.patients])).toEqual([
      ['2026-11-06', 3, 10],
      ['2026-11-07', 0, 0],
      ['2026-11-08', 0, 0],
      ['2026-11-09', 1, 3],
      ['2026-11-10', 8, 8],
      ['2026-11-11', 0, 7],
      ['2026-11-12', 2, 6],
    ])
    const pct = cells.map((item) => item.pct)
    expect(pct[0]).toBeCloseTo(30, 9)
    expect(pct[1]).toBeNull()
    expect(pct[2]).toBeNull()
    expect(pct[3]).toBeCloseTo(100 / 3, 9)
    expect(pct[4]).toBeCloseTo(100, 9)
    expect(pct[5]).toBe(0)
    expect(pct[6]).toBeCloseTo(100 / 3, 9)
  })

  it('AC-3706.3 칸은 treatmentDetail의 지금 칸 그대로이고, 비교는 같은 차례 비교 점(comparisonAt)이다', () => {
    const stats = input('7d', [...lastWeek, ...thisWeek], bothWeeks)
    const item = readyOf(stats)
    const cells = chartCells(stats, item)
    const detail = treatmentDetail(stats, item)
    expect(cells).toEqual(detail.current.map((point, i) => ({ ...point, patients: cells[i]?.patients, pct: cells[i]?.pct, comparison: cells[i]?.comparison })))
    expect(cells).toHaveLength(detail.current.length)
    expect(cells.map((one) => one.comparison)).toEqual(detail.current.map((_, i) => comparisonAt(detail.previous, i)))
    expect(cells.map((one) => one.comparison)).toEqual([1, 1, 4, 1, 1, 1, 1])
  })

  it('AC-3706.3 비교 기간을 이 열쇠로 세지 않았거나 덮지 않았으면 비교는 모두 값 없음이다', () => {
    const uncounted = lastWeek.map((row) => (row.day === '2026-11-01' ? { ...row, groups: [] } : row))
    const stats = input('7d', [...uncounted, ...thisWeek], bothWeeks)
    expect(chartCells(stats, readyOf(stats)).map((one) => one.comparison)).toEqual(Array(7).fill(null))
    const onlyThisWeek = input('7d', thisWeek, [THIS_WEEK])
    expect(chartCells(onlyThisWeek, readyOf(onlyThisWeek)).map((one) => one.comparison)).toEqual(Array(7).fill(null))
  })

  // 불러오는 범위 전체에 날마다 다른 총환자를 둔다(칸 경계가 숫자로 보인다)
  const patientsOn = (ymd: string) => (Number(ymd.slice(8)) % 7) + 3
  function cellsOf(day0: string, period: StatsPeriod) {
    const range = statsRange(day0, period)
    const last = addDays(day0, -1)
    const days = eachDay({ from: range.load.from, to: last }).map((ymd) => day(ymd, patientsOn(ymd), [line(KEY, 1)]))
    const stats: StatsInput = { days, covered: [{ from: range.load.from, to: last }], range }
    return { cells: chartCells(stats, readyOf(stats)), range }
  }
  const expectedPatients = (span: DateRange, last: string) =>
    eachDay(span).reduce((total, ymd) => total + (ymd <= last ? patientsOn(ymd) : 0), 0)

  it('AC-3706.3 90일 주 칸은 그 칸 날짜(기간에 잘린 처음·끝 주) 안 저장된 줄의 총환자 합이다', () => {
    const { cells, range } = cellsOf('2026-11-14', '90d')
    expect(cells).toHaveLength(14)
    expect(cells[0]?.start).toBe(range.current.from) // 기간 앞 날(비교 기간 줄)은 넣지 않는다
    expect([cells[0]?.partial, cells[13]?.partial]).toEqual([true, true])
    for (const one of cells) {
      expect(one.patients).toBe(expectedPatients({ from: one.start, to: one.end }, '2026-11-13'))
      expect(one.pct).toBeCloseTo((one.count / one.patients) * 100, 9)
    }
  })

  it('AC-3706.3 12개월 달 칸은 그 달 저장된 줄의 총환자 합이다(끝나지 않은 달은 저장된 날까지)', () => {
    const { cells } = cellsOf(today, '12m')
    expect(cells.map((one) => one.start.slice(0, 7))).toEqual(['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    for (const one of cells) expect(one.patients).toBe(expectedPatients({ from: one.start, to: one.end }, '2026-11-12'))
    expect(cells[11]?.partial).toBe(true)
  })
})

describe('AC-3707.1 trendFit', () => {
  it('AC-3707.1 칸 차례(0, 1, 2…)를 x로 한 최소제곱 직선이고 from·to는 쓴 첫·끝 칸 자리다', () => {
    expect(trendFit([cell(2), cell(4), cell(6), cell(8)], 'count')).toEqual({ slope: 2, intercept: 2, from: 0, to: 3 })
    expect(trendFit([cell(10), cell(8), cell(6)], 'count')).toEqual({ slope: -2, intercept: 10, from: 0, to: 2 })
  })

  it('AC-3707.1 총환자 0인 칸(쉬는 날)과 일부 기간(빗금) 칸은 빼고, 남은 칸은 제자리 x를 쓴다', () => {
    const cells = [cell(5), cell(0, 0), cell(9), cell(1, 10, true), cell(13)]
    expect(trendFit(cells, 'count')).toEqual({ slope: 2, intercept: 5, from: 0, to: 4 })
    expect(trendFit([cell(1, 10, true), cell(4), cell(6), cell(0, 20, true)], 'count')).toEqual({ slope: 2, intercept: 2, from: 1, to: 2 })
  })

  it('AC-3707.1 [총환자 대비 %] 모양은 칸의 총환자 대비 값으로 긋는다', () => {
    const cells = [cell(1, 10), cell(3, 20), cell(2, 10)] // 10% · 15% · 20%, 건수는 1 · 3 · 2
    const pct = trendFit(cells, 'pct')
    expect(pct?.slope).toBeCloseTo(5, 9)
    expect(pct?.intercept).toBeCloseTo(10, 9)
    expect([pct?.from, pct?.to]).toEqual([0, 2])
    const count = trendFit(cells, 'count')
    expect(count?.slope).toBeCloseTo(0.5, 9)
    expect(count?.intercept).toBeCloseTo(1.5, 9)
  })

  it('AC-3707.1 쓸 칸이 둘보다 적으면 없음이다', () => {
    expect(trendFit([], 'count')).toBeNull()
    expect(trendFit([cell(5)], 'count')).toBeNull()
    expect(trendFit([cell(5), cell(0, 0), cell(3, 10, true)], 'count')).toBeNull()
    expect(trendFit([cell(0, 0), cell(0, 0)], 'pct')).toBeNull()
  })

  it('AC-3707.1 받은 칸을 바꾸지 않는다', () => {
    const cells = [cell(1), cell(2)]
    trendFit(cells, 'count')
    expect(cells).toEqual([cell(1), cell(2)])
  })
})

describe('AC-3707.2 trendText [건수]', () => {
  it('AC-3707.2 기울기 크기 10 이상은 정수(소수 버림, 세 자리 쉼표)다', () => {
    expect(trendText(fitOf(1234.9), flat3(100), 'count', 'day')).toBe('추세선으로 보면 하루에 약 1,234건씩 늘어나는 흐름이에요.')
    expect(trendText(fitOf(10), flat3(100), 'count', 'day')).toBe('추세선으로 보면 하루에 약 10건씩 늘어나는 흐름이에요.')
    expect(trendText(fitOf(-12.7), flat3(100), 'count', 'month')).toBe('추세선으로 보면 한 달에 약 12건씩 줄어드는 흐름이에요.')
  })

  it('AC-3707.2 10보다 작으면 소수 첫째 자리까지 버린다(반올림 안 함)', () => {
    expect(trendText(fitOf(9.99), flat3(100), 'count', 'day')).toBe('추세선으로 보면 하루에 약 9.9건씩 늘어나는 흐름이에요.')
    expect(trendText(fitOf(-3.47), flat3(100), 'count', 'week')).toBe('추세선으로 보면 한 주에 약 3.4건씩 줄어드는 흐름이에요.')
    expect(trendText(fitOf(0.5), flat3(100), 'count', 'month')).toBe('추세선으로 보면 한 달에 약 0.5건씩 늘어나는 흐름이에요.')
  })

  it('AC-3707.2 버린 값이 0.0이면 거의 그대로다', () => {
    expect(trendText(fitOf(0.09), flat3(1), 'count', 'day')).toBe('추세선으로 보면 건수는 거의 그대로예요.')
    expect(trendText(fitOf(-0.09), flat3(1), 'count', 'day')).toBe('추세선으로 보면 건수는 거의 그대로예요.')
    expect(trendText(fitOf(0), flat3(1), 'count', 'day')).toBe('추세선으로 보면 건수는 거의 그대로예요.')
  })

  it('AC-3707.2 기울기 크기가 쓴 칸 평균의 0.5%보다 작으면 거의 그대로다(같으면 흐름 글)', () => {
    // 평균 200 → 0.5% = 1: 기울기 1은 작지 않다. 평균 201 → 1.005: 기울기 1은 작다
    expect(trendText(fitOf(1), [cell(199), cell(200), cell(201)], 'count', 'day')).toBe('추세선으로 보면 하루에 약 1.0건씩 늘어나는 흐름이에요.')
    expect(trendText(fitOf(-1), [cell(199), cell(200), cell(201)], 'count', 'day')).toBe('추세선으로 보면 하루에 약 1.0건씩 줄어드는 흐름이에요.')
    expect(trendText(fitOf(1), [cell(200), cell(201), cell(202)], 'count', 'day')).toBe('추세선으로 보면 건수는 거의 그대로예요.')
    expect(trendText(fitOf(-1), [cell(200), cell(201), cell(202)], 'count', 'day')).toBe('추세선으로 보면 건수는 거의 그대로예요.')
  })

  it('AC-3707.2 평균은 추세선에 쓴 칸(총환자 > 0, 일부 기간 아님)만 본다', () => {
    // 빗금 칸 100000건이 들면 평균 20120 → 기울기 1은 거의 그대로가 된다
    const kept = [cell(199), cell(0, 0), cell(200), cell(201), cell(100000, 10, true)]
    expect(trendText(fitOf(1), kept, 'count', 'day')).toBe('추세선으로 보면 하루에 약 1.0건씩 늘어나는 흐름이에요.')
    // 쉬는 날 0건이 들면 평균 150.75 → 기울기 1은 흐름 글이 된다
    const resting = [cell(200), cell(0, 0), cell(201), cell(202)]
    expect(trendText(fitOf(1), resting, 'count', 'day')).toBe('추세선으로 보면 건수는 거의 그대로예요.')
  })
})

describe('AC-3707.3 trendText [총환자 대비 %]', () => {
  const tail = ' (%p = 퍼센트끼리 뺀 차이, 예: 22%에서 23%는 1%p)'

  it('AC-3707.3 기울기를 소수 첫째 자리까지 버린 %p 글이고 하루에·한 주에·한 달에다', () => {
    expect(trendText(fitOf(0.37), flat3(5), 'pct', 'day')).toBe(`추세선으로 보면 총환자 대비 비율이 하루에 약 0.3%p씩 오르는 흐름이에요.${tail}`)
    expect(trendText(fitOf(-1.25), flat3(5), 'pct', 'week')).toBe(`추세선으로 보면 총환자 대비 비율이 한 주에 약 1.2%p씩 내리는 흐름이에요.${tail}`)
    expect(trendText(fitOf(12.39), flat3(5), 'pct', 'month')).toBe(`추세선으로 보면 총환자 대비 비율이 한 달에 약 12.3%p씩 오르는 흐름이에요.${tail}`)
  })

  it('AC-3707.3 버린 값이 0.0이면 거의 그대로다(평균 0.5% 규칙은 쓰지 않는다)', () => {
    expect(trendText(fitOf(0.09), flat3(5), 'pct', 'day')).toBe('추세선으로 보면 총환자 대비 비율은 거의 그대로예요.')
    expect(trendText(fitOf(-0.05), flat3(5), 'pct', 'day')).toBe('추세선으로 보면 총환자 대비 비율은 거의 그대로예요.')
    // 평균 50% → 0.5% = 0.25지만 %는 버린 값만 본다
    expect(trendText(fitOf(0.1), flat3(5), 'pct', 'day')).toBe(`추세선으로 보면 총환자 대비 비율이 하루에 약 0.1%p씩 오르는 흐름이에요.${tail}`)
  })
})

describe('AC-3707.4 추세선이 없음', () => {
  it('AC-3707.4 추세선이 없으면 두 모양 모두 칸이 모자라다는 글이다', () => {
    expect(trendText(null, [], 'count', 'day')).toBe('추세선을 그을 칸이 모자라요.')
    expect(trendText(null, [cell(3)], 'pct', 'month')).toBe('추세선을 그을 칸이 모자라요.')
    const one = [cell(3), cell(9, 10, true)]
    expect(trendText(trendFit(one, 'count'), one, 'count', 'week')).toBe('추세선을 그을 칸이 모자라요.')
  })
})

describe('AC-3707.1 칸에서 글까지', () => {
  it('AC-3707.1 7일 일 칸에서 건수·총환자 대비 추세 글을 낸다', () => {
    // 이번 주 날마다 총환자 10명, 묶음 1 · 2 · … · 7건 → 하루에 1건씩, 10%p씩
    const days = eachDay({ from: LAST_WEEK.from, to: THIS_WEEK.to }).map((ymd, i) => day(ymd, 10, [line(KEY, ymd < THIS_WEEK.from ? 1 : i - 6)]))
    const stats = input('7d', days, bothWeeks)
    const cells = chartCells(stats, readyOf(stats))
    expect(cells.map((one) => one.count)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(trendText(trendFit(cells, 'count'), cells, 'count', stats.range.bucket)).toBe('추세선으로 보면 하루에 약 1.0건씩 늘어나는 흐름이에요.')
    expect(trendText(trendFit(cells, 'pct'), cells, 'pct', stats.range.bucket)).toBe(
      '추세선으로 보면 총환자 대비 비율이 하루에 약 10.0%p씩 오르는 흐름이에요. (%p = 퍼센트끼리 뺀 차이, 예: 22%에서 23%는 1%p)',
    )
  })

  it('AC-3707.1 90일 주 칸은 기간에 걸린 처음·끝 주(빗금)를 빼고 긋는다', () => {
    const range = statsRange('2026-11-14', '90d')
    const days = eachDay({ from: range.load.from, to: '2026-11-13' }).map((ymd) => day(ymd, 10, [line(KEY, 2)]))
    const stats: StatsInput = { days, covered: [{ from: range.load.from, to: '2026-11-13' }], range }
    const cells = chartCells(stats, readyOf(stats))
    const fit = trendFit(cells, 'count')
    expect([fit?.from, fit?.to]).toEqual([1, cells.length - 2])
    expect(fit?.slope).toBeCloseTo(0, 9) // 온전한 주는 모두 14건
    expect(trendText(fit, cells, 'count', 'week')).toBe('추세선으로 보면 건수는 거의 그대로예요.')
  })
})

describe('AC-3709.2 요약 줄 글', () => {
  it('AC-3709.2 합계 이름: 빠른 단추 7·30·90일은 최근 N일 합계, 12개월은 1년(최근 12개월) 합계', () => {
    expect(sumLabel(statsRange(today, '7d'))).toBe('최근 7일 합계')
    expect(sumLabel(statsRange(today, '30d'))).toBe('최근 30일 합계')
    expect(sumLabel(statsRange(today, '90d'))).toBe('최근 90일 합계')
    expect(sumLabel(statsRange(today, '12m'))).toBe('1년(최근 12개월) 합계')
  })

  it('AC-3709.2 합계 이름: 고른 기간은 {기간 이름} 합계', () => {
    const month = pickRange(today, { kind: 'month', unit: 'day', month: '2026-10' }, true)
    expect(sumLabel(month)).toBe(`${month.name} 합계`)
    expect(sumLabel(month)).toBe('2026년 10월 합계')
    expect(sumLabel(pickRange(today, { kind: 'year', year: '2025' }, true))).toBe('2025년 합계')
    const custom = pickRange(today, { kind: 'custom', unit: 'day', from: '2026-09-01', to: '2026-09-20' }, true)
    expect(sumLabel(custom)).toBe(`${custom.name} 합계`)
  })

  it('AC-3709.2 하루 평균 = 건수 ÷ 진료한 날, 소수 첫째 자리까지 버림', () => {
    expect(perDayText(100, 7)).toBe('14.2') // 14.28…
    expect(perDayText(1999, 100)).toBe('19.9') // 반올림이면 20.0
    expect(perDayText(57, 100)).toBe('0.5') // 0.57 × 10 = 5.699…
    expect(perDayText(29, 10)).toBe('2.9')
    expect(perDayText(42, 1)).toBe('42.0')
    expect(perDayText(0, 5)).toBe('0.0')
  })

  it('AC-3709.2 진료한 날이 0일이면 –다', () => {
    expect(perDayText(0, 0)).toBe('–')
    expect(perDayText(12, 0)).toBe('–')
  })
})

describe('소스 규칙', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/stats/treatmentChart.ts'), 'utf8')

  it('AC-3706.3 칸은 treatmentView의 treatmentDetail과 trendLabels의 comparisonAt을 불러 쓴다(따로 세지 않는다)', () => {
    expect(source).toMatch(/import \{[^}]*\btreatmentDetail\b[^}]*\} from '\.\/treatmentView'/)
    expect(source).toMatch(/import \{[^}]*\bcomparisonAt\b[^}]*\} from '\.\/sections\/trendLabels'/)
    expect(source).not.toMatch(/buildTrend|rxDetail\(/)
  })

  it('AC-3707.2 숫자 글은 format.ts의 formatCount·truncatedOne을 쓴다(반올림 없음)', () => {
    expect(source).toMatch(/import \{[^}]*\bformatCount\b[^}]*\btruncatedOne\b[^}]*\} from '@\/components\/charts\/format'/)
    expect(source).not.toMatch(/Math\.round|toFixed/)
  })

  it('AC-3707.1 순수 함수다(화면 라이브러리·서버·네트워크·브라우저 저장소·시계 없음)', () => {
    expect(source).not.toMatch(/from 'react'|supabase|fetch|localStorage|sessionStorage|indexedDB|document\.cookie|console|lib\/bridge/i)
    expect(source).not.toMatch(/new Date|Date\.(UTC|now)/)
  })
})
