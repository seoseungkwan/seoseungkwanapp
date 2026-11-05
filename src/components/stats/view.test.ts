import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { formatDelta } from '@/components/charts/format'
import { periodRange, trendBuckets, weekdayBuckets } from '@/components/dashboard/summary/view'
import { compareNumbers } from '@/lib/analytics/compare'
import { mergeRanges } from '@/lib/analytics/coverage'
import { addDays, addMonths, diffDays, eachDay, weekdayOf } from '@/lib/analytics/dates'
import { buildTrend, comparisonRange } from '@/lib/analytics/rxTrend'
import type { DateRange } from '@/types/dates'
import type { DayPayload, RevisitPayload } from '@/types/payload'
import {
  codeKey,
  COMPARE_NAME,
  DEFAULT_STATS_PERIOD,
  patientTrend,
  revisitRates,
  rxComparedCells,
  rxDetail,
  rxList,
  rxPickRows,
  statsRange,
  summaryCells,
  weekdayBars,
  type StatsInput,
  type StatsPeriod,
  type SummaryCell,
} from './view'

// buildTrend는 그대로 돌고 부른 횟수만 본다(AC-804.1)
vi.mock('@/lib/analytics/rxTrend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics/rxTrend')>()
  return { ...actual, buildTrend: vi.fn(actual.buildTrend) }
})

// 통계 화면 숫자 (stats REQ-511, design.md TASK-11). 가짜 저장 모양은 이 파일 안에서만 만든다.
// AC-511.4는 원본 vendor/drbit_export/CohortTests.cs의 사례를 옮겼다(모두 가짜 자료). 시험 이름의 '원본:'이 원본 확인 글이다.
// 원본과 다르게 한 것은 여기에만 적는다
const knownDiffs = [
  {
    original: 'FullyObservedNewPatients·FullyObservedReturned·PendingNewPatients(완전 관찰 수, 미완료 관찰 환자 구별)',
    reason: '저장 모양에 완전 관찰 수가 없다. 값이 null(집계 중)인 칸을 분자·분모에서 빼는 것이 같은 구실을 한다',
  },
  {
    original: 'Treatments(치료 묶음 주사·체외충격파·도수의 비율, 처방 분류 기본값과 검사)',
    reason: '통계 화면에는 치료 묶음 칸이 없다. 처방별 숫자는 처방 추세와 처방별 신환·재진이 맡는다',
  },
  {
    original: '월별 신환 엑셀·HTML 보고서, CohortForm 화면 렌더링',
    reason: '셈만 옮긴다. 화면은 통계 탭 몫이고 엑셀·HTML 보고서는 만들지 않는다',
  },
  {
    original: "'기준일 이후 제외와 성공한 빈 월 보간'의 빈 월 0명",
    reason: '자료 없는 달은 0으로 치지 않아 칸이 없다(AC-511.2). 덮은 기간 안의 빈 날은 달 칸에 0을 더할 뿐이다',
  },
  {
    original: "CohortRate.Label '미산출 (분모 0)'",
    reason: "글자 대신 { kind: 'none' }을 주고 화면이 '자료 없음'으로 그린다",
  },
  {
    original: 'ObservationEnd(관찰 끝날, 윤년 경계)',
    reason: '관찰 창은 재방문을 세는 엔진(aggregate) 몫이다. 저장 모양에는 이미 센 숫자만 온다',
  },
]

type Rx = DayPayload['rx'][number]
const rx = (code: string, patients: number, o: { name?: string; newPatients?: number } = {}): Rx => ({
  code,
  name: o.name ?? `처방 ${code}`,
  type: '처치',
  patients,
  newPatients: o.newPatients ?? 0,
  returning: patients - (o.newPatients ?? 0),
})

type DayOptions = { partial?: boolean; newPatients?: number; returning?: number; rx?: Rx[]; revisit?: Partial<RevisitPayload> }
function day(ymd: string, o: DayOptions = {}): DayPayload {
  const newPatients = o.newPatients ?? 2
  const returning = o.returning ?? 8
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: o.partial ?? false,
    totals: { patients: newPatients + returning, newPatients, returning, unknown: 0 },
    rx: o.rx ?? [],
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null, ...o.revisit },
  }
}

const daysFrom = (from: string, to: string, o: DayOptions = {}) => eachDay({ from, to }).map((ymd) => day(ymd, o))
// 달마다 1일·2일 두 줄
const monthRows = (month: string, o: DayOptions = {}) => [day(`${month}-01`, o), day(`${month}-02`, o)]
const monthsFrom = (first: string, count: number) => Array.from({ length: count }, (_, i) => addMonths(first, i))

const input = (today: string, period: StatsPeriod, days: DayPayload[], covered: DateRange[]): StatsInput => ({ days, covered, range: statsRange(today, period) })
const cellOf = (cells: SummaryCell[], key: SummaryCell['key']) => cells.find((cell) => cell.key === key)!
const rate = (within: number, cohort: number, excluded: boolean) => ({ kind: 'rate', value: within / cohort, within, cohort, excluded })
const firstCounts = (result: ReturnType<typeof revisitRates>) => result.firstRevisit?.items.map((item) => [item.label, item.count])

describe('AC-511.1 statsRange', () => {
  it('AC-511.1 처음 기간은 최근 30일이다', () => {
    expect(DEFAULT_STATS_PERIOD).toBe('30d')
  })

  it.each([
    ['7d', 7],
    ['30d', 30],
    ['90d', 90],
  ] as const)('AC-511.1 %s는 어제까지 N일(대시보드 periodRange 그대로)이고 비교는 바로 앞 같은 일수다', (period, days) => {
    const today = '2026-11-13'
    const range = statsRange(today, period)
    const compared = comparisonRange(range.current.from, range.current.to, 'PreviousEqualDays')
    expect(range.current).toEqual(periodRange(today, days))
    expect(range.label).toBe(periodRange(today, days).label)
    expect(range.previous.from).toBe(compared.from)
    expect(range.previous.to).toBe(compared.to)
    expect(range.grain).toBe('day')
  })

  it('AC-511.1 12개월은 이번 달을 넣은 12달이고 비교는 작년 같은 12달이다', () => {
    const range = statsRange('2026-11-13', '12m')
    const compared = comparisonRange(range.current.from, range.current.to, 'PreviousYear')
    expect(range.current).toMatchObject({ from: '2025-12-01', to: '2026-11-30' })
    expect(range.previous).toMatchObject({ from: '2024-12-01', to: '2025-11-30' })
    expect(range.previous.from).toBe(compared.from)
    expect(range.previous.to).toBe(compared.to)
    expect(range.grain).toBe('month')
    expect(range.label).toBe('2025년 12월 – 2026년 11월')
    expect(range.previous.label).toBe('2024년 12월 – 2025년 11월')
    expect(range.load).toEqual({ from: '2024-12-01', to: '2026-11-13' })
  })

  it('AC-511.1 작년 2월이 윤달이면 비교 기간은 2월 29일까지다', () => {
    const range = statsRange('2029-02-15', '12m')
    expect(range.current).toMatchObject({ from: '2028-03-01', to: '2029-02-28' })
    expect(range.previous).toMatchObject({ from: '2027-03-01', to: '2028-02-29' })
  })

  it('AC-511.1 올해 2월이 윤달이면 작년 2월 말일까지다', () => {
    const range = statsRange('2028-02-15', '12m')
    expect(range.current).toMatchObject({ from: '2027-03-01', to: '2028-02-29' })
    expect(range.previous).toMatchObject({ from: '2026-03-01', to: '2027-02-28' })
  })

  it('AC-511.1 불러올 범위는 비교 기간 첫날이 든 달의 1일 ~ 오늘이다', () => {
    expect(statsRange('2026-11-13', '30d').load).toEqual({ from: '2026-09-01', to: '2026-11-13' })
    expect(statsRange('2026-11-13', '7d').load).toEqual({ from: '2026-10-01', to: '2026-11-13' })
    expect(statsRange('2026-11-13', '90d').load).toEqual({ from: '2026-05-01', to: '2026-11-13' })
  })

  it('AC-511.1 불러올 범위는 어느 날, 어느 기간이든 800일 이하다', () => {
    const periods: StatsPeriod[] = ['7d', '30d', '90d', '12m']
    for (const today of eachDay({ from: '2027-01-01', to: '2029-12-31' })) {
      for (const period of periods) {
        const { load } = statsRange(today, period)
        expect(diffDays(load.from, load.to)).toBeLessThanOrEqual(800)
      }
    }
  })

  it('AC-511.1 오늘 11월 13일의 30d finishedCohort는 9월 14일 ~ 10월 13일이고 비교 기간과 같다', () => {
    const range = statsRange('2026-11-13', '30d')
    expect(range.finishedCohort).toEqual({ from: '2026-09-14', to: '2026-10-13' })
    expect(range.previous).toMatchObject(range.finishedCohort!)
  })

  it.each(['7d', '90d', '12m'] as const)('AC-511.1 %s의 finishedCohort는 null이다', (period) => {
    expect(statsRange('2026-11-13', period).finishedCohort).toBeNull()
  })
})

describe('AC-511.2 summaryCells', () => {
  const covered12m = [{ from: '2024-12-01', to: '2026-11-14' }]
  // 11월 15일의 12개월 보기: 끝난 달은 모두 한 달 200명, 덜 끝난 이번 11월은 10명, 작년 11월은 2,000명
  const finishedMonth: DayOptions = { newPatients: 10, returning: 90 }
  const november15 = [
    ...monthsFrom('2024-12', 23).flatMap((month) => monthRows(month, month === '2025-11' ? { newPatients: 100, returning: 900 } : finishedMonth)),
    ...monthRows('2026-11', { newPatients: 1, returning: 4 }),
  ]

  it('AC-511.2 네 칸이다: 평균 환자 수, 신환, 재진, 비교 기간보다', () => {
    const cells = summaryCells(input('2026-11-13', '30d', [day('2026-11-02')], [{ from: '2026-10-01', to: '2026-11-12' }]))
    expect(cells.map((cell) => cell.key)).toEqual(['average', 'new', 'returning', 'compare'])
    expect(cells.map((cell) => cell.label)).toEqual(['하루 평균 환자 수', '신환', '재진', '비교 기간보다'])
  })

  it('AC-511.2 일 기간 평균은 자료 있는 끝난 날 평균이고 버린다. 자료 없는 날은 0으로 치지 않는다', () => {
    const days = [
      day('2026-11-06', { newPatients: 2, returning: 8 }),
      day('2026-11-09', { newPatients: 3, returning: 8 }),
      day('2026-11-10', { newPatients: 4, returning: 8 }),
      day('2026-11-11', { newPatients: 4, returning: 8 }),
    ]
    const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-11-06', to: '2026-11-12' }]))
    expect(cellOf(cells, 'average')).toMatchObject({ value: 11, note: '진료한 날 4일 평균', partial: false })
    expect(cellOf(cells, 'new')).toMatchObject({ value: 13, note: '기간 합계', partial: false })
    expect(cellOf(cells, 'returning')).toMatchObject({ value: 32, note: '기간 합계', partial: false })
  })

  it('AC-511.2 비교 기간보다는 버린 평균끼리의 compareNumbers 증감이다', () => {
    const days = [
      day('2026-11-06', { newPatients: 0, returning: 10 }),
      day('2026-11-07', { newPatients: 0, returning: 11 }),
      day('2026-10-30', { newPatients: 0, returning: 9 }),
      day('2026-10-31', { newPatients: 0, returning: 10 }),
    ]
    const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-12' }]))
    expect(cellOf(cells, 'average').value).toBe(10)
    expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(10, 9))
    expect(cellOf(cells, 'compare').note).toBe('지난 7일 하루 평균 9명')
  })

  it('AC-511.2 11월 15일의 12개월 보기 — 덜 끝난 11월과 작년 11월을 빼고 견주어 그 달 때문에 ▼가 나오지 않는다', () => {
    const cells = summaryCells(input('2026-11-15', '12m', november15, covered12m))
    expect(cellOf(cells, 'average')).toMatchObject({ label: '한 달 평균 환자 수', value: 200, note: '끝난 달 11달 평균', partial: false })
    expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(200, 200))
    expect(cellOf(cells, 'compare').note).toBe('작년 같은 12달 한 달 평균 200명')
  })

  it('AC-511.2 신환·재진 합에는 덜 끝난 칸도 넣고 일부 기간 표시를 붙인다', () => {
    const cells = summaryCells(input('2026-11-15', '12m', november15, covered12m))
    expect(cellOf(cells, 'new')).toMatchObject({ value: 11 * 20 + 2, partial: true })
    expect(cellOf(cells, 'returning')).toMatchObject({ value: 11 * 180 + 8, partial: true })
  })

  it('AC-511.2 오늘이 1일이라 이번 달 줄이 없어도 작년 같은 달을 비교에서 뺀다', () => {
    const days = monthsFrom('2024-12', 23).flatMap((month) => monthRows(month, month === '2025-11' ? { newPatients: 100, returning: 900 } : finishedMonth))
    const cells = summaryCells(input('2026-11-01', '12m', days, [{ from: '2024-12-01', to: '2026-10-31' }]))
    expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(200, 200))
  })

  it('AC-511.2 덮이지 않은 달의 짝(작년 같은 달)도 비교에서 뺀다', () => {
    const days = [
      ...monthsFrom('2024-12', 6).flatMap((month) => monthRows(month, { newPatients: 100, returning: 900 })),
      ...monthsFrom('2025-06', 6).flatMap((month) => monthRows(month, finishedMonth)),
      ...monthsFrom('2026-06', 5).flatMap((month) => monthRows(month, finishedMonth)),
      ...monthRows('2026-11', { newPatients: 1, returning: 4 }),
    ]
    const covered = [
      { from: '2024-12-01', to: '2025-11-30' },
      { from: '2026-06-01', to: '2026-11-14' },
    ]
    const cells = summaryCells(input('2026-11-15', '12m', days, covered))
    expect(cellOf(cells, 'average').note).toBe('끝난 달 5달 평균')
    expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(200, 200))
  })

  it('AC-511.2 일 기간도 덜 끝난 날과 그 짝인 날을 빼고 견준다', () => {
    const days = [
      day('2026-11-10', { newPatients: 0, returning: 20 }),
      day('2026-11-12', { newPatients: 0, returning: 5, partial: true }),
      day('2026-11-03', { newPatients: 0, returning: 20 }),
      day('2026-11-05', { newPatients: 0, returning: 1000 }),
    ]
    const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-12' }]))
    expect(cellOf(cells, 'average').value).toBe(20)
    expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(20, 20))
    expect(cellOf(cells, 'returning')).toMatchObject({ value: 25, partial: true })
  })

  describe('일 기간의 덮이지 않은 날', () => {
    const only = (ymd: string, patients: number) => day(ymd, { newPatients: 0, returning: patients })

    it('AC-511.2 며칠 전에 불러온 일 기간 — 덮이지 않아 줄이 없는 날의 짝도 빼서 가짜 ▼가 없다', () => {
      // 오늘 11월 13일(금), 덮은 기간 끝 11월 8일. 이번 기간은 금 100·토 40뿐이고 같은 요일끼리는 비교 기간과 같다
      const days = [
        only('2026-11-06', 100),
        only('2026-11-07', 40),
        only('2026-10-30', 100),
        only('2026-10-31', 40),
        only('2026-11-02', 150),
        only('2026-11-03', 110),
        only('2026-11-04', 100),
        only('2026-11-05', 100),
      ]
      const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-08' }]))
      expect(cellOf(cells, 'average').value).toBe(70)
      expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(70, 70))
      expect(cellOf(cells, 'compare').note).toBe('지난 7일 하루 평균 70명')
    })

    it('AC-511.2 덮인 날에 줄이 없으면 휴진이라 그 짝은 비교에 남는다', () => {
      // 11월 9일은 덮인 휴진일이고 그 짝이 11월 2일이다
      const days = [only('2026-11-06', 20), only('2026-10-30', 20), only('2026-11-02', 50)]
      const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-12' }]))
      expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(20, 35))
    })

    it('AC-511.2 덮은 기간 밖의 줄도 partial이 false면 끝난 날이고 짝도 남는다(AC-511.3 trendBuckets 칸과 같다)', () => {
      const days = [only('2026-11-10', 20), only('2026-11-03', 30)]
      const inputs = input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-05' }])
      const cells = summaryCells(inputs)
      expect(cellOf(cells, 'average')).toMatchObject({ value: 20, note: '진료한 날 1일 평균' })
      expect(cellOf(cells, 'returning')).toMatchObject({ value: 20, partial: false })
      expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(20, 30))
      expect(patientTrend(inputs)).toMatchObject([{ key: '2026-11-10', state: 'complete' }])
    })
  })

  describe('넷째 칸은 짝이 모두 끝난 칸끼리만 견준다', () => {
    const only = (ymd: string, patients: number) => day(ymd, { newPatients: 0, returning: patients })
    const perMonth = (month: string, patients: number) => monthRows(month, { newPatients: 0, returning: patients / 2 })
    // 작년 12~5월은 덮이지 않아 줄이 없다. 두 해 모두 12~5월 달 300명 · 6~10월 달 100명이다
    const earlyLastYearMissing = [
      ...monthsFrom('2025-06', 5).flatMap((month) => perMonth(month, 100)),
      ...monthsFrom('2025-12', 6).flatMap((month) => perMonth(month, 300)),
      ...monthsFrom('2026-06', 5).flatMap((month) => perMonth(month, 100)),
      ...perMonth('2026-11', 10),
    ]

    it('AC-511.2 작년 앞쪽 달이 덮이지 않은 12개월 보기, 두 해 숫자가 같음 — 짝이 남은 달끼리 견주어 변화 없음이고 아래 글이 견준 칸을 말한다', () => {
      const cells = summaryCells(input('2026-11-15', '12m', earlyLastYearMissing, [{ from: '2025-06-01', to: '2026-11-14' }]))
      expect(cellOf(cells, 'average')).toMatchObject({ value: 209, note: '끝난 달 11달 평균' })
      expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(100, 100))
      expect(cellOf(cells, 'compare').note).toBe('견준 5달 평균 · 이번 100명 · 작년 100명')
    })

    it('AC-511.2 11월 15일의 12개월 보기가 온전히 덮임 — 덜 끝난 이번 달은 평균에 들지 않아 아래 글은 그대로다', () => {
      const cells = summaryCells(input('2026-11-15', '12m', november15, covered12m))
      expect(cellOf(cells, 'compare').note).toBe('작년 같은 12달 한 달 평균 200명')
    })

    it('AC-511.2 덮은 기간이 며칠 전에 끝난 일 기간 — 줄 없는 이번 쪽 날은 평균에 들지 않아 아래 글은 그대로다', () => {
      const days = [only('2026-11-06', 100), only('2026-10-30', 100), only('2026-11-02', 900)]
      const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-08' }]))
      expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(100, 100))
      expect(cellOf(cells, 'compare').note).toBe('지난 7일 하루 평균 100명')
    })

    it('AC-511.2 일 기간에서 비교 쪽 날이 덮이지 않으면 끝난 이번 날도 빼고 "견준 {n}일"이라 적는다. 평균 칸 값은 그대로다', () => {
      const days = [...daysFrom('2026-11-06', '2026-11-07', { newPatients: 0, returning: 300 }), ...daysFrom('2026-11-08', '2026-11-12', { newPatients: 0, returning: 100 }), ...daysFrom('2026-11-01', '2026-11-05', { newPatients: 0, returning: 100 })]
      const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-11-01', to: '2026-11-12' }]))
      expect(cellOf(cells, 'average')).toMatchObject({ value: 157, note: '진료한 날 7일 평균' })
      expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(100, 100))
      expect(cellOf(cells, 'compare').note).toBe('견준 5일 평균 · 이번 100명 · 지난 기간 100명')
    })

    it('AC-511.2 {n}은 짝 수가 아니라 남은 이번 쪽 칸 수다(두 쪽 다 휴진인 날은 칸이 없다)', () => {
      const days = [
        only('2026-11-06', 300),
        only('2026-11-07', 300),
        only('2026-11-08', 100),
        only('2026-11-10', 100),
        only('2026-11-11', 100),
        only('2026-11-12', 100),
        only('2026-11-01', 100),
        only('2026-11-03', 100),
        only('2026-11-04', 100),
        only('2026-11-05', 100),
      ]
      const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-11-01', to: '2026-11-12' }]))
      expect(cellOf(cells, 'compare').note).toBe('견준 4일 평균 · 이번 100명 · 지난 기간 100명')
    })

    it('AC-511.2 비교 쪽 칸만 덜 끝나도 그 짝의 끝난 이번 칸을 양쪽에서 뺀다', () => {
      const days = [only('2026-11-10', 50), only('2026-11-11', 20), day('2026-11-03', { newPatients: 0, returning: 1000, partial: true }), only('2026-11-04', 20)]
      const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-12' }]))
      expect(cellOf(cells, 'average').value).toBe(35)
      expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(20, 20))
      expect(cellOf(cells, 'compare').note).toBe('견준 1일 평균 · 이번 20명 · 지난 기간 20명')
    })

    it('AC-511.2 12개월에서 작년 같은 달이 일부만 덮이면 줄이 있어도 그 짝을 뺀다', () => {
      const days = [...perMonth('2025-08', 1000), ...perMonth('2025-09', 100), ...perMonth('2026-08', 50), ...perMonth('2026-09', 100)]
      const cells = summaryCells(input('2026-11-15', '12m', days, [{ from: '2025-08-15', to: '2026-11-14' }]))
      expect(cellOf(cells, 'average')).toMatchObject({ value: 75, note: '끝난 달 2달 평균' })
      expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(100, 100))
      expect(cellOf(cells, 'compare').note).toBe('견준 1달 평균 · 이번 100명 · 작년 100명')
    })

    it('AC-511.2 12개월에서 덮였는데 줄이 없는 달은 휴진이라 짝을 빼지 않고 아래 글도 그대로다', () => {
      const days = [...perMonth('2026-07', 100), ...perMonth('2025-07', 100), ...perMonth('2025-08', 300)]
      const cells = summaryCells(input('2026-11-13', '12m', days, [{ from: '2025-07-01', to: '2026-11-12' }]))
      expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(100, 200))
      expect(cellOf(cells, 'compare').note).toBe('작년 같은 12달 한 달 평균 200명')
    })

    it('AC-511.2 짝을 빼서 이번 쪽에 남은 칸이 없으면 "비교할 자료가 없어요"다', () => {
      // 11월 6일의 짝은 덮이지 않았고, 11월 3일의 짝 11월 10일은 덮인 휴진일이다
      const days = [only('2026-11-06', 100), only('2026-11-03', 100)]
      const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-11-01', to: '2026-11-12' }]))
      expect(cellOf(cells, 'average').value).toBe(100)
      expect(cellOf(cells, 'compare')).toMatchObject({ value: null, delta: null, note: '비교할 자료가 없어요' })
    })

    it('AC-511.2 짝을 빼서 비교 쪽에 남은 칸이 없으면 "비교할 자료가 없어요"다', () => {
      // 11월 3일의 짝 11월 10일은 덜 끝났고, 11월 12일의 짝 11월 5일은 덮인 휴진일이다
      const days = [day('2026-11-10', { partial: true }), only('2026-11-12', 100), only('2026-11-03', 100)]
      const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-12' }]))
      expect(cellOf(cells, 'average').value).toBe(100)
      expect(cellOf(cells, 'compare')).toMatchObject({ value: null, delta: null, note: '비교할 자료가 없어요' })
    })
  })

  it('AC-511.2 비교 기간 이름은 넷째 칸 글자와 [자세히] 표 머리가 같이 쓴다', () => {
    expect(COMPARE_NAME).toEqual({ '7d': '지난 7일', '30d': '지난 30일', '90d': '지난 90일', '12m': '작년 같은 12달' })
    const days = [day('2026-11-10'), day('2026-11-03')]
    const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-12' }]))
    expect(cellOf(cells, 'compare').note).toContain(COMPARE_NAME['7d'])
  })

  it('AC-511.2 비교 기간의 덜 끝난 칸도 평균에서 뺀다', () => {
    const days = [day('2026-11-10', { newPatients: 0, returning: 20 }), day('2026-11-03', { newPatients: 0, returning: 20 }), day('2026-11-04', { newPatients: 0, returning: 1000, partial: true })]
    const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-12' }]))
    expect(cellOf(cells, 'compare').delta).toEqual(compareNumbers(20, 20))
    expect(cellOf(cells, 'compare').note).toBe('지난 7일 하루 평균 20명')
  })

  it('AC-511.2 비교 기간 자료가 없으면 넷째 칸은 "비교할 자료가 없어요"다', () => {
    const cells = summaryCells(input('2026-11-13', '7d', [day('2026-11-10')], [{ from: '2026-11-06', to: '2026-11-12' }]))
    expect(cellOf(cells, 'average').value).toBe(10)
    expect(cellOf(cells, 'compare')).toMatchObject({ value: null, delta: null, note: '비교할 자료가 없어요' })
  })

  it('AC-511.2 덜 끝난 달만 자료가 있는 12개월 보기 — 평균 칸 "자료 없음", 넷째 칸 "비교할 자료가 없어요", 신환·재진 합은 일부 기간과 함께', () => {
    const days = daysFrom('2026-11-02', '2026-11-12', { newPatients: 1, returning: 2 })
    const cells = summaryCells(input('2026-11-13', '12m', days, [{ from: '2026-11-02', to: '2026-11-12' }]))
    expect(cellOf(cells, 'average')).toMatchObject({ value: null, note: '자료 없음' })
    expect(cellOf(cells, 'compare')).toMatchObject({ value: null, delta: null, note: '비교할 자료가 없어요' })
    expect(cellOf(cells, 'new')).toMatchObject({ value: 11, partial: true })
    expect(cellOf(cells, 'returning')).toMatchObject({ value: 22, partial: true })
  })

  it('AC-511.2 끝난 날이 없는 일 기간 — 평균 칸 "자료 없음", 넷째 칸 "비교할 자료가 없어요", 합은 일부 기간과 함께', () => {
    const days = [day('2026-11-10', { partial: true }), day('2026-11-03')]
    const cells = summaryCells(input('2026-11-13', '7d', days, [{ from: '2026-10-30', to: '2026-11-12' }]))
    expect(cellOf(cells, 'average')).toMatchObject({ value: null, note: '자료 없음' })
    expect(cellOf(cells, 'compare')).toMatchObject({ value: null, delta: null, note: '비교할 자료가 없어요' })
    expect(cellOf(cells, 'new')).toMatchObject({ value: 2, partial: true })
  })

  it('AC-511.2 기간에 자료가 하나도 없으면 네 칸 모두 숫자가 없다', () => {
    const cells = summaryCells(input('2026-11-13', '30d', [], []))
    expect(cells).toHaveLength(4)
    expect(cellOf(cells, 'average')).toMatchObject({ value: null, note: '자료 없음' })
    expect(cellOf(cells, 'new')).toMatchObject({ value: null, note: '자료 없음', partial: false })
    expect(cellOf(cells, 'returning')).toMatchObject({ value: null, note: '자료 없음', partial: false })
    expect(cellOf(cells, 'compare')).toMatchObject({ value: null, delta: null, note: '비교할 자료가 없어요' })
  })

  it('AC-511.2 처방 없는 접수만 있는 달도 칸이 나오고 RangeError가 나지 않는다', () => {
    const days = monthRows('2026-08', { newPatients: 1, returning: 1, rx: [] })
    const cells = summaryCells(input('2026-11-13', '12m', days, [{ from: '2026-08-01', to: '2026-08-31' }]))
    expect(cellOf(cells, 'average')).toMatchObject({ value: 4, note: '끝난 달 1달 평균' })
  })

  it('AC-511.2 달 칸의 합에는 덮이지 않은 날의 줄도 넣지만 그 달은 평균에서 뺀다', () => {
    const days = [...monthRows('2026-08', finishedMonth), ...monthRows('2026-09', finishedMonth), day('2026-09-20', finishedMonth)]
    const cells = summaryCells(input('2026-11-13', '12m', days, [{ from: '2026-08-01', to: '2026-09-10' }]))
    expect(cellOf(cells, 'average')).toMatchObject({ value: 200, note: '끝난 달 1달 평균' })
    expect(cellOf(cells, 'new')).toMatchObject({ value: 50, partial: true })
  })

  it('AC-511.2 그 달의 일 줄만 있고 달 줄이 없어도 12개월 요약과 추이가 같은 숫자다', () => {
    const inputs = input('2026-11-15', '12m', november15, covered12m)
    const buckets = patientTrend(inputs)!
    const cells = summaryCells(inputs)
    expect(buckets.reduce((total, bucket) => total + bucket.values[0], 0)).toBe(cellOf(cells, 'new').value)
    expect(buckets.reduce((total, bucket) => total + bucket.values[1], 0)).toBe(cellOf(cells, 'returning').value)
    const finished = buckets.filter((bucket) => bucket.state === 'complete')
    expect(Math.floor(finished.reduce((total, bucket) => total + bucket.values[0] + bucket.values[1], 0) / finished.length)).toBe(cellOf(cells, 'average').value)
  })
})

describe('AC-511.3 patientTrend', () => {
  const august = { from: '2026-08-01', to: '2026-08-31' }

  it.each([
    ['7d', 7],
    ['30d', 30],
    ['90d', 90],
  ] as const)('AC-511.3 %s는 대시보드 trendBuckets 그대로다', (period, days) => {
    const today = '2026-11-13'
    const rows = [day('2026-11-10'), day('2026-11-12', { partial: true })]
    expect(patientTrend(input(today, period, rows, []))).toEqual(trendBuckets(rows, periodRange(today, days), days))
  })

  it('AC-511.3 12개월은 달마다 그 달 일 숫자의 합이고 자료 없는 달은 칸이 없다', () => {
    const days = [...monthRows('2026-08', { newPatients: 1, returning: 3 }), ...monthRows('2026-10', { newPatients: 2, returning: 5 })]
    const buckets = patientTrend(input('2026-11-13', '12m', days, [{ from: '2026-08-01', to: '2026-10-31' }]))
    expect(buckets).toEqual([
      { key: '2026-08', label: '8월', rangeLabel: '2026년 8월', state: 'complete', values: [2, 6] },
      { key: '2026-10', label: '10월', rangeLabel: '2026년 10월', state: 'complete', values: [4, 10] },
    ])
  })

  it('AC-511.3 파일 8월 1~2일 뒤 8월 3~31일, 합쳐진 덮은 기간 → 8월은 끝난 칸이고 합은 두 파일의 전체다', () => {
    const covered = mergeRanges([
      { from: '2026-08-01', to: '2026-08-02' },
      { from: '2026-08-03', to: '2026-08-31' },
    ])
    const buckets = patientTrend(input('2026-11-13', '12m', daysFrom(august.from, august.to), covered))
    expect(buckets).toEqual([{ key: '2026-08', label: '8월', rangeLabel: '2026년 8월', state: 'complete', values: [62, 248] }])
  })

  it('AC-511.3 덮인 휴진일은 0을 더한다', () => {
    const days = daysFrom(august.from, august.to).filter((row) => row.day !== '2026-08-15')
    const [bucket] = patientTrend(input('2026-11-13', '12m', days, [august]))!
    expect(bucket).toMatchObject({ state: 'complete', values: [60, 240] })
  })

  it('AC-511.3 일 줄은 있는데 덮이지 않은 날이 있는 달 → 일부 기간이다. 합에는 그 날의 줄도 넣는다', () => {
    const buckets = patientTrend(input('2026-11-13', '12m', daysFrom(august.from, august.to), [{ from: '2026-08-01', to: '2026-08-20' }]))
    expect(buckets).toEqual([{ key: '2026-08', label: '8월', rangeLabel: '2026년 8월', state: 'partial', values: [62, 248] }])
  })

  it('AC-511.3 이번 달은 일부 기간이다', () => {
    const [bucket] = patientTrend(input('2026-11-13', '12m', [day('2026-11-02')], [{ from: '2026-11-01', to: '2026-11-12' }]))!
    expect(bucket).toMatchObject({ key: '2026-11', state: 'partial' })
  })

  it('AC-511.3 덜 끝난 일 줄이 있는 달은 다 덮여도 일부 기간이다', () => {
    const [bucket] = patientTrend(input('2026-11-13', '12m', [day('2026-08-10', { partial: true })], [august]))!
    expect(bucket).toMatchObject({ state: 'partial' })
  })

  it('AC-511.3 처방 없는 접수만 있는 달(rx 빈 목록)도 칸이 나온다', () => {
    const [bucket] = patientTrend(input('2026-11-13', '12m', [day('2026-08-10', { rx: [] })], [august]))!
    expect(bucket).toMatchObject({ key: '2026-08', values: [2, 8] })
  })

  it.each(['7d', '12m'] as const)('AC-511.3 %s에 자료가 없으면 null이다', (period) => {
    expect(patientTrend(input('2026-11-13', period, [], []))).toBeNull()
  })
})

describe('AC-511.4 revisitRates', () => {
  it('AC-511.4 7·14일 = 그 값이 null이 아닌 칸들의 재방문 합 ÷ 그 칸들의 집단 합이고 within·cohort·excluded를 싣는다', () => {
    const days = [
      day('2026-11-06', { revisit: { cohort: 4, within7: 1, within14: 2 } }),
      day('2026-11-07', { revisit: { cohort: 6, within7: 3, within14: null } }),
      day('2026-11-08', { revisit: { cohort: 0, within7: 0, within14: 0 } }),
    ]
    const result = revisitRates(input('2026-11-13', '7d', days, []))
    expect(result.d7).toEqual(rate(4, 10, false))
    expect(result.d14).toEqual(rate(2, 4, true))
  })

  it('AC-511.4 값이 모두 null이면 집계 중, 줄이 없거나 분모가 0이면 자료 없음이다', () => {
    const inProgress = revisitRates(input('2026-11-13', '7d', [day('2026-11-06', { revisit: { cohort: 3 } })], []))
    expect(inProgress.d7).toEqual({ kind: 'in-progress' })
    expect(inProgress.d14).toEqual({ kind: 'in-progress' })
    expect(inProgress.d30).toEqual({ kind: 'in-progress' })
    const noRows = revisitRates(input('2026-11-13', '7d', [], []))
    expect(noRows.d7).toEqual({ kind: 'none' })
    expect(noRows.d30).toEqual({ kind: 'none' })
    expect(noRows.firstRevisit).toBeNull()
    const zero = revisitRates(input('2026-11-13', '7d', [day('2026-11-06', { revisit: { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 } })], []))
    expect(zero.d7).toEqual({ kind: 'none' })
    expect(zero.d30).toEqual({ kind: 'none' })
    expect(zero.firstRevisit).toBeNull()
  })

  it('AC-511.4 빠진 within30 칸(옛 줄)은 null로 친다', () => {
    const old = { ...day('2026-11-06'), revisit: { cohort: 3, within7: 1, within14: 1 } }
    const result = revisitRates(input('2026-11-13', '7d', [old], []))
    expect(result.d7).toEqual(rate(1, 3, false))
    expect(result.d30).toEqual({ kind: 'in-progress' })
    expect(result.firstRevisit).toBeNull()
  })

  it('AC-511.4 7일 기간은 셋 다 집계 중이면 첫 재방문도 없고 finishedCohort를 쓰지 않는다', () => {
    const days = [
      day('2026-11-06', { revisit: { cohort: 2 } }),
      day('2026-10-01', { revisit: { cohort: 9, within7: 9, within14: 9, within30: 9, after30: 0 } }),
    ]
    const result = revisitRates(input('2026-11-13', '7d', days, []))
    expect(result.d7).toEqual({ kind: 'in-progress' })
    expect(result.d14).toEqual({ kind: 'in-progress' })
    expect(result.d30).toEqual({ kind: 'in-progress' })
    expect(result.d30Cohort).toBeNull()
    expect(result.firstRevisit).toBeNull()
  })

  it('AC-511.4 첫 재방문까지 날수는 30일 값이 숫자인 칸들의 다섯 칸이고 합 = 집단 합이다', () => {
    const days = [
      day('2026-09-01', { revisit: { cohort: 40, within7: 12, within14: 20, within30: 24, after30: 3 } }),
      day('2026-09-02', { revisit: { cohort: 10, within7: 1, within14: 2, within30: 2, after30: 1 } }),
      day('2026-11-02', { revisit: { cohort: 100, within7: 50, within14: 60, within30: null, after30: null } }),
    ]
    const result = revisitRates(input('2026-11-13', '90d', days, []))
    expect(firstCounts(result)).toEqual([
      ['7일 안', 13],
      ['8~14일', 9],
      ['15~30일', 4],
      ['30일 넘어 다시 옴', 4],
      ['아직 다시 안 옴', 20],
    ])
    expect(result.firstRevisit).toMatchObject({ from: '2026-09-01', to: '2026-09-02', cohort: 50 })
    expect(result.firstRevisit!.items.reduce((total, item) => total + item.count, 0)).toBe(50)
    expect(result.d30).toEqual(rate(26, 50, true))
    expect(result.d30Cohort).toBeNull()
  })

  it('AC-511.4 첫 재방문 칸마다 key가 있어 차례가 아니라 key로 고른다', () => {
    const days = [day('2026-09-01', { revisit: { cohort: 40, within7: 12, within14: 20, within30: 24, after30: 3 } })]
    const { firstRevisit } = revisitRates(input('2026-11-13', '90d', days, []))
    expect(firstRevisit!.items).toEqual([
      { key: 'within7', label: '7일 안', count: 12 },
      { key: 'days8to14', label: '8~14일', count: 8 },
      { key: 'days15to30', label: '15~30일', count: 4 },
      { key: 'after30', label: '30일 넘어 다시 옴', count: 3 },
      { key: 'never', label: '아직 다시 안 옴', count: 13 },
    ])
  })

  it('AC-511.4 90일 기간은 finishedCohort를 쓰지 않고 고른 기간의 숫자인 날로 센다', () => {
    const days = [
      day('2026-08-01', { revisit: { cohort: 5, within7: 1, within14: 1, within30: 1, after30: 0 } }),
      day('2026-09-01', { revisit: { cohort: 10, within7: 1, within14: 1, within30: 5, after30: 0 } }),
    ]
    const result = revisitRates(input('2026-11-13', '90d', days, []))
    expect(result.d30).toEqual(rate(5, 10, false))
    expect(result.firstRevisit).toMatchObject({ from: '2026-09-01', to: '2026-09-01' })
  })

  describe("'30d'의 30일 줄 (S6)", () => {
    const today = '2026-11-13'
    const finished: Partial<RevisitPayload> = { cohort: 2, within7: 1, within14: 1, within30: 1, after30: 0 }
    const recent: Partial<RevisitPayload> = { cohort: 3, within7: 2, within14: 2, within30: null, after30: null }
    const whole = [...daysFrom('2026-09-14', '2026-10-13', { revisit: finished }), ...daysFrom('2026-10-14', '2026-11-12', { revisit: recent })]

    it('AC-511.4 오늘이 11월 13일인 30d — 30일 줄이 9월 14일 ~ 10월 13일을 세고 그 날짜를 보인다', () => {
      const result = revisitRates(input(today, '30d', whole, []))
      expect(result.d30).toEqual(rate(30, 60, false))
      expect(result.d30Cohort).toEqual({ from: '2026-09-14', to: '2026-10-13' })
      expect(result.firstRevisit).toMatchObject({ from: '2026-09-14', to: '2026-10-13', cohort: 60 })
      expect(firstCounts(result)).toEqual([
        ['7일 안', 30],
        ['8~14일', 0],
        ['15~30일', 0],
        ['30일 넘어 다시 옴', 0],
        ['아직 다시 안 옴', 30],
      ])
    })

    it('AC-511.4 7·14일 줄은 여전히 고른 기간을 쓴다', () => {
      const result = revisitRates(input(today, '30d', whole, []))
      expect(result.d7).toEqual(rate(60, 90, false))
      expect(result.d14).toEqual(rate(60, 90, false))
    })

    it('AC-511.4 가장 새로운 날들이 null — 날짜가 숫자인 날까지로 줄어든다', () => {
      const days = [...daysFrom('2026-09-14', '2026-10-10', { revisit: finished }), ...daysFrom('2026-10-11', '2026-10-13', { revisit: recent })]
      const result = revisitRates(input(today, '30d', days, []))
      expect(result.d30).toEqual(rate(27, 54, true))
      expect(result.d30Cohort).toEqual({ from: '2026-09-14', to: '2026-10-10' })
      expect(result.firstRevisit).toMatchObject({ from: '2026-09-14', to: '2026-10-10', cohort: 54 })
    })

    it('AC-511.4 그 범위가 모두 null이면 집계 중이고 날짜가 없다', () => {
      const result = revisitRates(input(today, '30d', daysFrom('2026-09-14', '2026-10-13', { revisit: recent }), []))
      expect(result.d30).toEqual({ kind: 'in-progress' })
      expect(result.d30Cohort).toBeNull()
      expect(result.firstRevisit).toBeNull()
    })

    it('AC-511.4 그 범위의 분모가 0이면 자료 없음이다', () => {
      const days = daysFrom('2026-09-14', '2026-10-13', { revisit: { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 } })
      const result = revisitRates(input(today, '30d', days, []))
      expect(result.d30).toEqual({ kind: 'none' })
      expect(result.d30Cohort).toBeNull()
      expect(result.firstRevisit).toBeNull()
    })

    it('AC-511.4 그 범위에 줄이 없으면 고른 기간에 줄이 있어도 자료 없음이다', () => {
      const result = revisitRates(input(today, '30d', daysFrom('2026-10-14', '2026-11-12', { revisit: recent }), []))
      expect(result.d7).toEqual(rate(60, 90, false))
      expect(result.d30).toEqual({ kind: 'none' })
      expect(result.d30Cohort).toBeNull()
      expect(result.firstRevisit).toBeNull()
    })
  })

  describe("'12m'은 달 단위로 뺀다", () => {
    const today = '2026-11-13'
    const september: Partial<RevisitPayload> = { cohort: 10, within7: 2, within14: 4, within30: 6, after30: 1 }
    // 10월: 앞 날은 30일이 지났고 뒤 날은 아직이다
    const octoberDone: Partial<RevisitPayload> = { cohort: 10, within7: 3, within14: 5, within30: 7, after30: 0 }
    const octoberOpen: Partial<RevisitPayload> = { cohort: 10, within7: 3, within14: 5, within30: null, after30: null }
    const days = [
      day('2026-09-05', { revisit: september }),
      day('2026-09-20', { revisit: september }),
      day('2026-10-05', { revisit: octoberDone }),
      day('2026-10-20', { revisit: octoberOpen }),
    ]

    it('AC-511.4 마지막 날들이 아직 N일이 안 된 달 → N일 셈에서 그 달 전체가 빠지고, 이미 지난 더 작은 N의 셈에는 든다', () => {
      const result = revisitRates(input(today, '12m', days, []))
      expect(result.d30).toEqual(rate(12, 20, true))
      expect(result.d7).toEqual(rate(10, 40, false))
      expect(result.d14).toEqual(rate(18, 40, false))
    })

    it('AC-511.4 모든 날이 정해진 지난 달은 센다', () => {
      const result = revisitRates(input(today, '12m', days.slice(0, 2), []))
      expect(result.d30).toEqual(rate(12, 20, false))
    })

    it('AC-511.4 caption 말이 참이다 — excluded가 참이면 뺀 달의 신환이 cohort에 하나도 없고, 첫 재방문까지 날수에 든 달은 모두 30일 값이 숫자인 달이다', () => {
      const result = revisitRates(input(today, '12m', days, []))
      expect(result.d30).toMatchObject({ kind: 'rate', excluded: true, cohort: 20 })
      expect(result.firstRevisit).toMatchObject({ from: '2026-09-01', to: '2026-09-30', cohort: 20 })
      expect(firstCounts(result)).toEqual([
        ['7일 안', 4],
        ['8~14일', 4],
        ['15~30일', 4],
        ['30일 넘어 다시 옴', 2],
        ['아직 다시 안 옴', 6],
      ])
      expect(result.d30Cohort).toBeNull()
    })

    it('AC-511.4 일부 날이 숫자여도 모든 달이 빠지면 "집계 중"이다(날 기준이면 분모 0으로 "자료 없음"이 나온다)', () => {
      const rows = [day('2026-10-05', { revisit: { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 } }), day('2026-10-20', { revisit: { cohort: 3, within7: 1, within14: 1, within30: null, after30: null } })]
      const result = revisitRates(input(today, '12m', rows, []))
      expect(result.d30).toEqual({ kind: 'in-progress' })
      expect(result.firstRevisit).toBeNull()
    })

    it('AC-511.4 12개월은 finishedCohort를 쓰지 않고 줄이 없으면 자료 없음이다', () => {
      const result = revisitRates(input(today, '12m', [], []))
      expect(result.d7).toEqual({ kind: 'none' })
      expect(result.d30).toEqual({ kind: 'none' })
      expect(result.d30Cohort).toBeNull()
    })
  })

  describe('원본 CohortTests.cs 사례', () => {
    const today = '2024-03-15'
    const covered = [{ from: '2024-01-01', to: '2024-03-14' }]
    // 원본 1월: 전체 100명, 신환 40명, 재방문 신환 24명(7일 안 12 · 8~14일 8 · 15~30일 4), 한 번만 온 신환 16명
    const january = day('2024-01-15', { newPatients: 40, returning: 60, revisit: { cohort: 40, within7: 12, within14: 20, within30: 24, after30: 0 } })

    it("AC-511.4 원본: '신환율·기존환자율·신환 재방문율 분모 구별'", () => {
      const inputs = input(today, '12m', [january], covered)
      const cells = summaryCells(inputs)
      const newPatients = cellOf(cells, 'new').value!
      const returning = cellOf(cells, 'returning').value!
      expect(newPatients / (newPatients + returning)).toBe(0.4) // 신환율: 분모 전체 환자
      expect(returning / (newPatients + returning)).toBe(0.6) // 기존환자율: 분모 전체 환자
      expect(revisitRates(inputs).d30).toEqual(rate(24, 40, false)) // 신환 재방문율: 분모 신환
    })

    it("AC-511.4 원본: 재방문 칸 합 = 재방문 신환, 'SingleVisitNewPatients' = 신환 − 재방문 신환", () => {
      const result = revisitRates(input(today, '12m', [january], covered))
      expect(firstCounts(result)).toEqual([
        ['7일 안', 12],
        ['8~14일', 8],
        ['15~30일', 4],
        ['30일 넘어 다시 옴', 0],
        ['아직 다시 안 옴', 16],
      ])
    })

    it("AC-511.4 원본: '신환·치료 분모 0은 미산출'", () => {
      const march = day('2024-03-10', { newPatients: 0, returning: 0, revisit: { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 } })
      const result = revisitRates(input(today, '12m', [march], covered))
      expect(result.d7).toEqual({ kind: 'none' })
      expect(result.d14).toEqual({ kind: 'none' })
      expect(result.d30).toEqual({ kind: 'none' })
      expect(result.firstRevisit).toBeNull()
    })

    it("AC-511.4 원본: '기준일 이후 제외' — 기준일이 든 달은 덜 끝난 달이다", () => {
      const march = day('2024-03-10', { newPatients: 0, returning: 0 })
      const buckets = patientTrend(input(today, '12m', [january, march], covered))!
      expect(buckets.map((bucket) => [bucket.key, bucket.state])).toEqual([
        ['2024-01', 'complete'],
        ['2024-03', 'partial'],
      ])
    })

    it('AC-511.4 옮기지 않은 것은 knownDiffs에 이유와 함께 적었다', () => {
      for (const word of ['FullyObserved', 'Treatments', '엑셀·HTML']) {
        const entry = knownDiffs.find((diff) => diff.original.includes(word))
        expect(entry?.reason, word).toBeTruthy()
      }
    })
  })
})

describe('AC-511.5 weekdayBars', () => {
  it.each([
    ['7d', 7],
    ['30d', 30],
    ['90d', 90],
  ] as const)('AC-511.5 %s는 대시보드 weekdayBuckets 규칙 그대로다', (period, days) => {
    const rows = [day('2026-11-09', { newPatients: 5, returning: 5 }), day('2026-11-02', { newPatients: 1, returning: 2 }), day('2026-11-10', { partial: true })]
    expect(weekdayBars(rows, statsRange('2026-11-13', period))).toEqual(weekdayBuckets(rows, periodRange('2026-11-13', days)))
  })

  it('AC-511.5 12개월도 기간 안 일 숫자로 센다', () => {
    const rows = [day('2026-08-03', { newPatients: 1, returning: 2 }), day('2026-08-10', { newPatients: 2, returning: 3 }), day('2025-08-04', { newPatients: 90, returning: 90 })]
    const bars = weekdayBars(rows, statsRange('2026-11-13', '12m'))
    expect(weekdayOf('2026-08-03')).toBe(1)
    expect(bars).toEqual([{ key: '1', label: '월', rangeLabel: '월요일', state: 'complete', values: [4] }])
  })

  it('AC-511.5 자료가 없으면 null이다', () => {
    expect(weekdayBars([], statsRange('2026-11-13', '12m'))).toBeNull()
  })
})

describe('AC-511.6 rxList', () => {
  const today = '2026-11-13'
  const bothWeeks = [{ from: '2026-10-30', to: '2026-11-12' }]

  it('AC-511.6 기간 건수가 큰 5개(같으면 코드 순)이고 이름은 가장 최근 날의 이름이며 비교·신환·재진 건수가 있다', () => {
    const days = [
      day('2026-10-30', { rx: [rx('A', 4)] }),
      day('2026-11-06', { rx: [rx('A', 10, { name: '옛 이름', newPatients: 3 }), rx('B', 20), rx('D', 30), rx('C', 30), rx('E', 5), rx('F', 1)] }),
      day('2026-11-10', { rx: [rx('A', 1, { name: '새 이름' })] }),
    ]
    const rows = rxList(input(today, '7d', days, bothWeeks))!
    expect(rows.map((row) => row.code)).toEqual(['C', 'D', 'B', 'A', 'E'])
    expect(rows[3]).toEqual({
      code: 'A',
      name: '새 이름',
      count: 11,
      newCount: 3,
      returningCount: 8,
      partial: false,
      comparable: { current: 11, previous: 4 },
      delta: compareNumbers(11, 4),
    })
    expect(rows[0]).toMatchObject({ comparable: { current: 30, previous: 0 }, delta: { kind: 'new' } })
  })

  it('AC-511.6 처방 줄이 없는 기간은 null이고 RangeError가 나지 않는다', () => {
    expect(rxList(input(today, '7d', [], bothWeeks))).toBeNull()
    expect(rxList(input(today, '7d', [day('2026-11-06', { rx: [] })], bothWeeks))).toBeNull()
    expect(rxList(input(today, '12m', [day('2026-11-06', { rx: [] })], bothWeeks))).toBeNull()
  })

  it('AC-511.6 비교 기간에만 있던 처방은 줄이 되지 않는다', () => {
    const rows = rxList(input(today, '7d', [day('2026-11-06', { rx: [rx('A', 1)] }), day('2026-10-30', { rx: [rx('Z', 99)] })], bothWeeks))!
    expect(rows.map((row) => row.code)).toEqual(['A'])
  })

  it('AC-511.6 건수가 0인 처방(덮은 기간 밖의 날에만 나옴)은 줄이 되지 않는다', () => {
    const days = [day('2026-11-06', { rx: [rx('A', 1)] }), day('2026-11-12', { rx: [rx('Z', 5)] })]
    const rows = rxList(input(today, '7d', days, [{ from: '2026-10-30', to: '2026-11-11' }]))!
    expect(rows.map((row) => row.code)).toEqual(['A'])
    expect(rxList(input(today, '7d', [day('2026-11-12', { rx: [rx('Z', 5)] })], [{ from: '2026-10-30', to: '2026-11-11' }]))).toBeNull()
  })

  it('AC-511.6 코드 201개 자료에서 예외 없이 상위 5개가 나온다', () => {
    const lines = Array.from({ length: 201 }, (_, i) => rx(`C${String(i).padStart(3, '0')}`, i + 1))
    const rows = rxList(input(today, '7d', [day('2026-11-06', { rx: lines })], bothWeeks))!
    expect(rows.map((row) => row.code)).toEqual(['C200', 'C199', 'C198', 'C197', 'C196'])
    expect(rows[0].count).toBe(201)
  })

  it('AC-511.6 대소문자만 다른 코드가 묶음 경계에 걸려도 한 줄이다', () => {
    const lines = Array.from({ length: 200 }, (_, i) => rx(`C${String(i).padStart(3, '0')}`, 1))
    const days = [day('2026-11-06', { rx: [rx('ab1', 500, { name: '옛 이름' }), ...lines] }), day('2026-11-07', { rx: [rx('AB1', 500, { name: '새 이름' })] })]
    const rows = rxList(input(today, '7d', days, bothWeeks))!
    expect(rows.filter((row) => row.code.toUpperCase() === 'AB1')).toHaveLength(1)
    expect(rows[0]).toMatchObject({ code: 'AB1', name: '새 이름', count: 1000 })
  })

  it('AC-511.6 건수는 [자세히] 점의 합과 같다', () => {
    const days = [day('2026-11-06', { rx: [rx('A', 3, { newPatients: 1 })] }), day('2026-11-08', { rx: [rx('A', 4, { newPatients: 2 })] })]
    const inputs = input(today, '7d', days, bothWeeks)
    const [row] = rxList(inputs)!
    const { current } = rxDetail(inputs, 'A')
    expect(row.count).toBe(current.reduce((total, point) => total + point.count, 0))
    expect(row.newCount).toBe(current.reduce((total, point) => total + point.newCount, 0))
    expect(row.returningCount).toBe(current.reduce((total, point) => total + point.returningCount, 0))
  })

  describe("'12m'은 끝난 달끼리 견준다", () => {
    const covered = [{ from: '2024-12-01', to: '2026-11-14' }]
    const november15 = [
      ...monthsFrom('2024-12', 23).map((month) => day(`${month}-10`, { rx: [rx('R', month === '2025-11' ? 1000 : 100, { newPatients: 10 })] })),
      day('2026-11-02', { rx: [rx('R', 10, { newPatients: 1 })] }),
    ]

    it('AC-511.6 11월 15일의 12개월 보기 — 11월과 작년 11월을 둘 다 빼서 가짜 ▼가 없다', () => {
      const [row] = rxList(input('2026-11-15', '12m', november15, covered))!
      expect(row.comparable).toEqual({ current: 1100, previous: 1100 })
      expect(row.delta).toEqual(compareNumbers(1100, 1100))
    })

    it('AC-511.6 건수·신환·재진은 덜 끝난 달을 넣고 일부 기간 표시를 붙인다', () => {
      const [row] = rxList(input('2026-11-15', '12m', november15, covered))!
      expect(row).toMatchObject({ count: 1110, newCount: 111, returningCount: 999, partial: true })
    })

    it('AC-511.6 순위는 덜 끝난 달을 넣은 count로 정한다', () => {
      const days = [
        day('2026-08-10', { rx: [rx('A', 5), rx('B', 10)] }),
        day('2026-11-02', { rx: [rx('A', 100)] }),
      ]
      const rows = rxList(input('2026-11-15', '12m', days, covered))!
      expect(rows.map((row) => [row.code, row.count])).toEqual([
        ['A', 105],
        ['B', 10],
      ])
      expect(rows[0].comparable!.current).toBeLessThan(rows[1].comparable!.current)
    })

    it('AC-511.6 덜 끝난 달만 자료가 있음 — 비교할 수 없음', () => {
      const [row] = rxList(input(today, '12m', [day('2026-11-02', { rx: [rx('R', 7)] })], [{ from: '2026-11-02', to: '2026-11-12' }]))!
      expect(row).toMatchObject({ count: 7, partial: true, comparable: null, delta: { kind: 'unavailable' } })
    })

    it('AC-511.6 작년 같은 달만 덮이지 않음 — 그 달을 양쪽에서 빼고 건수에는 그대로 넣는다', () => {
      const line = (month: string, patients: number) => day(`${month}-10`, { rx: [rx('R', patients)] })
      const days = [
        ...monthsFrom('2025-06', 5).map((month) => line(month, 100)),
        ...monthsFrom('2025-12', 6).map((month) => line(month, 300)),
        ...monthsFrom('2026-06', 5).map((month) => line(month, 100)),
      ]
      const [row] = rxList(input('2026-11-15', '12m', days, [{ from: '2025-06-01', to: '2026-11-14' }]))!
      expect(row).toMatchObject({ count: 2300, partial: true, comparable: { current: 500, previous: 500 }, delta: compareNumbers(500, 500) })
    })

    it('AC-511.6 이번 달이 끝난 달이면 일부 기간 표시가 없다', () => {
      const lastDay = '2026-11-30'
      const days = [day('2026-11-02', { rx: [rx('R', 7)] }), day('2025-11-02', { rx: [rx('R', 5)] })]
      const [row] = rxList(input(lastDay, '12m', days, [{ from: '2024-12-01', to: lastDay }]))!
      expect(row).toMatchObject({ partial: false, comparable: { current: 7, previous: 5 }, delta: compareNumbers(7, 5) })
    })
  })

  describe('일 기간은 늘 날마다 짝 짓는다', () => {
    const everyDay = (from: string, to: string, patients: number) => daysFrom(from, to, { rx: [rx('R', patients)] })

    it('AC-511.6 비교 기간이 덮은 기간 밖 — 모든 줄이 "새로 생김"이 아니라 "비교할 수 없음"이다', () => {
      const days = daysFrom('2026-11-06', '2026-11-12', { rx: [rx('R', 2), rx('S', 1)] })
      const rows = rxList(input(today, '7d', days, [{ from: '2026-11-06', to: '2026-11-12' }]))!
      expect(rows.map((row) => row.delta)).toEqual([{ kind: 'unavailable' }, { kind: 'unavailable' }])
      expect(rows[0]).toMatchObject({ count: 14, comparable: null, partial: false })
    })

    it('AC-511.6 비교 기간이 반만 덮임 — 덮인 짝만 견준다', () => {
      const days = [...everyDay('2026-11-06', '2026-11-12', 2), ...everyDay('2026-11-02', '2026-11-05', 3)]
      const [row] = rxList(input(today, '7d', days, [{ from: '2026-11-02', to: '2026-11-12' }]))!
      expect(row).toMatchObject({ count: 14, comparable: { current: 8, previous: 12 }, delta: compareNumbers(8, 12), partial: false })
    })

    it('AC-511.6 이번 기간 끝이 덮은 기간 밖(어제가 안 덮임) — 그 날과 짝을 빼고 나머지로 보통 증감이다', () => {
      const days = [...everyDay('2026-11-06', '2026-11-12', 2), ...everyDay('2026-10-30', '2026-11-05', 3)]
      const [row] = rxList(input(today, '7d', days, [{ from: '2026-10-30', to: '2026-11-11' }]))!
      expect(row).toMatchObject({ count: 12, comparable: { current: 12, previous: 18 }, delta: compareNumbers(12, 18), partial: false })
    })

    it('AC-511.6 두 기간이 모두 온전히 덮임 — 보통 증감이다', () => {
      const days = [...everyDay('2026-11-06', '2026-11-12', 2), ...everyDay('2026-10-30', '2026-11-05', 1)]
      const [row] = rxList(input(today, '7d', days, bothWeeks))!
      expect(row).toMatchObject({ count: 14, comparable: { current: 14, previous: 7 }, delta: compareNumbers(14, 7), partial: false })
    })

    it('AC-511.6 덮은 기간 안의 휴진일은 0으로 남아 짝을 빼지 않는다', () => {
      const days = [day('2026-11-06', { rx: [rx('R', 2)] }), day('2026-11-05', { rx: [rx('R', 9)] })]
      const [row] = rxList(input(today, '7d', days, bothWeeks))!
      expect(row).toMatchObject({ comparable: { current: 2, previous: 9 }, delta: compareNumbers(2, 9) })
    })

    it('AC-511.6 덜 끝난 줄이 있는 날도 그 짝을 양쪽에서 뺀다', () => {
      const days = [day('2026-11-06', { rx: [rx('R', 2)] }), day('2026-11-12', { partial: true, rx: [rx('R', 1)] }), day('2026-10-30', { rx: [rx('R', 3)] }), day('2026-11-05', { rx: [rx('R', 50)] })]
      const [row] = rxList(input(today, '7d', days, bothWeeks))!
      expect(row).toMatchObject({ count: 3, comparable: { current: 2, previous: 3 } })
    })

    it('AC-511.6 최근 90일도 표시 칸(주)과 상관없이 날마다 짝 짓는다', () => {
      const range = statsRange(today, '90d')
      // 비교 기간 끝 하루만 덜 끝났다. 주로 묶어 빼면 그 주의 다른 날까지 빠진다
      const days = [
        day(range.current.to, { rx: [rx('R', 1)] }),
        day(addDays(range.current.to, -1), { rx: [rx('R', 2)] }),
        day(range.previous.to, { partial: true, rx: [rx('R', 40)] }),
        day(addDays(range.previous.to, -1), { rx: [rx('R', 5)] }),
      ]
      const [row] = rxList({ days, covered: [{ from: range.previous.from, to: range.current.to }], range })!
      expect(row).toMatchObject({ count: 3, comparable: { current: 2, previous: 5 }, delta: compareNumbers(2, 5), partial: false })
    })
  })
})

describe('AC-511.7 소스', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/stats/view.ts'), 'utf8')

  it('AC-511.7 순수 함수다(화면 라이브러리·서버·네트워크·브라우저 저장소 없음)', () => {
    expect(source).not.toMatch(/react|supabase|fetch|localStorage|sessionStorage|indexedDB/i)
  })

  it('AC-511.7 날짜는 dates.ts, 증감은 compareNumbers, 대시보드 view.ts는 불러 쓰기만 한다', () => {
    expect(source).toContain("from '@/lib/analytics/dates'")
    expect(source).toContain('compareNumbers(')
    expect(source).toContain("from '@/components/dashboard/summary/view'")
    expect(source).not.toMatch(/new Date|Date\.(UTC|now)/)
  })

  it('AC-511.2 저장된 달 줄을 읽지 않는다', () => {
    expect(source).not.toContain('MonthPayload')
  })
})

describe('AC-511.8 rxDetail', () => {
  const today = '2026-11-13'
  const longCovered = [{ from: '2024-01-01', to: '2026-11-12' }]
  const days = [day('2026-11-06', { rx: [rx('R', 2, { newPatients: 1 })] }), day('2026-10-30', { rx: [rx('R', 3)] })]

  it.each([
    ['7d', 7],
    ['30d', 30],
  ] as const)('AC-511.8 %s의 칸은 하루이고 비교 기간도 같은 칸이다', (period, length) => {
    const { current, previous } = rxDetail(input(today, period, days, longCovered), 'R')
    expect(current).toHaveLength(length)
    expect(previous).toHaveLength(length)
    for (const point of [...current, ...previous]) expect(point.start).toBe(point.end)
  })

  it('AC-511.8 최근 90일의 칸은 주(월~일)이고 비교 기간도 같은 칸이며 칸 수를 채우거나 자르지 않는다', () => {
    const inputs = input(today, '90d', days, longCovered)
    const { current, previous } = rxDetail(inputs, 'R')
    const { range } = inputs
    const weeks = (span: DateRange) => buildTrend(days, longCovered, { from: span.from, to: span.to, bucket: 'week', codes: ['R'] }).points
    expect(current).toHaveLength(weeks(range.current).length)
    expect(previous).toHaveLength(weeks(range.previous).length)
    for (const point of current.slice(1, -1)) {
      expect(weekdayOf(point.start)).toBe(1)
      expect(weekdayOf(point.end)).toBe(7)
    }
    expect(current[0].start).toBe(range.current.from)
    expect(current.at(-1)!.end).toBe(range.current.to)
  })

  it('AC-511.8 최근 12개월의 칸은 달이고 비교 기간도 같은 칸이다', () => {
    const { current, previous } = rxDetail(input(today, '12m', days, longCovered), 'R')
    expect(current).toHaveLength(12)
    expect(previous).toHaveLength(12)
    expect(current[0]).toMatchObject({ start: '2025-12-01', end: '2025-12-31' })
    expect(previous.at(-1)).toMatchObject({ start: '2025-11-01', end: '2025-11-30' })
  })

  it('AC-511.8 buildTrend의 점을 그대로 쓰고 covered만 더한다', () => {
    const inputs = input(today, '7d', days, longCovered)
    const { current, previous } = rxDetail(inputs, 'R')
    const points = (span: DateRange) => buildTrend(days, longCovered, { from: span.from, to: span.to, bucket: 'day', codes: ['R'] }).points
    expect(current.map(({ covered, ...point }) => (expect(covered).toBe(true), point))).toEqual(points(inputs.range.current))
    expect(previous.map(({ covered, ...point }) => (expect(covered).toBe(true), point))).toEqual(points(inputs.range.previous))
  })

  it('AC-511.8 비교 기간이 덮은 기간 밖인 칸 — covered: false', () => {
    const { current, previous } = rxDetail(input(today, '7d', days, [{ from: '2026-11-06', to: '2026-11-12' }]), 'R')
    expect(current.every((point) => point.covered)).toBe(true)
    expect(previous.every((point) => !point.covered)).toBe(true)
    expect(previous.every((point) => point.count === 0)).toBe(true)
  })

  it('AC-511.8 칸의 일부 날만 덮임 — covered: true', () => {
    // 달 칸: 8월 31일 하루만, 10월 1일 하루만 덮였다
    const edges = [
      { from: '2026-08-31', to: '2026-08-31' },
      { from: '2026-10-01', to: '2026-10-01' },
    ]
    const { current } = rxDetail(input(today, '12m', days, edges), 'R')
    const byStart = new Map(current.map((point) => [point.start, point]))
    expect(byStart.get('2026-08-01')).toMatchObject({ covered: true, partial: true })
    expect(byStart.get('2026-10-01')).toMatchObject({ covered: true, partial: true })
    expect(byStart.get('2026-09-01')).toMatchObject({ covered: false, partial: true })
  })

  it('AC-511.8 주 칸도 일부만 덮이면 covered: true다', () => {
    const range = statsRange(today, '90d')
    const week = rxDetail({ days, covered: [], range }, 'R').current[2]
    const { current } = rxDetail({ days, covered: [{ from: week.end, to: week.end }], range }, 'R')
    expect(current[2]).toMatchObject({ covered: true, partial: true })
    expect(current[1].covered).toBe(false)
  })
})

describe('AC-511.9 rxComparedCells', () => {
  const today = '2026-11-13'
  const november15 = '2026-11-15'
  // '30d' 오늘 11월 13일: 이번 기간 10월 14일 ~ 11월 12일, 비교 기간 9월 14일 ~ 10월 13일
  const both30 = [{ from: '2026-09-14', to: '2026-11-12' }]
  const everyDay = (from: string, to: string) => daysFrom(from, to, { rx: [rx('R', 1)] })
  const everyMonth = (first: string, count: number) => monthsFrom(first, count).map((month) => day(`${month}-10`, { rx: [rx('R', 1)] }))

  it("AC-511.9 11월 13일의 '30d', 비교 기간의 마지막 8일만 덮임 — 8짝이 남는다", () => {
    const stats = input(today, '30d', everyDay('2026-09-14', '2026-11-12'), [{ from: '2026-10-06', to: '2026-11-12' }])
    expect(rxComparedCells(stats)).toEqual({ kept: 8, dropped: true })
    expect(rxList(stats)![0].comparable).toEqual({ current: 8, previous: 8 })
  })

  it("AC-511.9 2026년 11월 15일의 '12m', 2025년 6월 1일부터 덮임 — 5달이 남는다", () => {
    const stats = input(november15, '12m', everyMonth('2025-06', 18), [{ from: '2025-06-01', to: '2026-11-14' }])
    expect(rxComparedCells(stats)).toEqual({ kept: 5, dropped: true })
    expect(rxList(stats)![0].comparable).toEqual({ current: 5, previous: 5 })
  })

  it("AC-511.9 11월 15일의 '12m'이 온전히 덮임 — 이번 달만 덜 끝나 11달이 남는다", () => {
    const stats = input(november15, '12m', everyMonth('2024-12', 24), [{ from: '2024-12-01', to: '2026-11-14' }])
    expect(rxComparedCells(stats)).toEqual({ kept: 11, dropped: true })
    expect(rxList(stats)![0].comparable).toEqual({ current: 11, previous: 11 })
  })

  it("AC-511.9 두 기간이 온전히 덮인 '30d' — 뺀 짝이 없다(줄 없는 날은 휴진이라 빼지 않는다)", () => {
    expect(rxComparedCells(input(today, '30d', everyDay('2026-10-20', '2026-10-21'), both30))).toEqual({ kept: 30, dropped: false })
  })

  it('AC-511.9 비교 기간이 모두 덮은 기간 밖 — 남은 짝이 없다', () => {
    const stats = input(today, '30d', everyDay('2026-10-14', '2026-11-12'), [{ from: '2026-10-14', to: '2026-11-12' }])
    expect(rxComparedCells(stats)).toEqual({ kept: 0, dropped: true })
    expect(rxList(stats)![0].comparable).toBeNull()
  })

  it("AC-511.9 '90d'는 주가 아니라 날로 센다", () => {
    const range = statsRange(today, '90d')
    const whole = [{ from: range.previous.from, to: range.current.to }]
    const lastEight = [{ from: addDays(range.previous.to, -7), to: range.current.to }]
    expect(rxComparedCells({ days: [], covered: whole, range })).toEqual({ kept: 90, dropped: false })
    expect(rxComparedCells({ days: [], covered: lastEight, range })).toEqual({ kept: 8, dropped: true })
    // 덜 끝난 날 하루는 그 날의 짝만 뺀다. 주로 묶으면 그 주의 다른 날까지 빠진다
    expect(rxComparedCells({ days: [day(range.previous.to, { partial: true })], covered: whole, range })).toEqual({ kept: 89, dropped: true })
  })

  it('AC-511.9 줄마다 같다 — 서로 다른 날에 나오는 처방 둘의 comparable이 모두 같은 남은 짝의 날만 더한 값이다', () => {
    // '7d': 이번 기간 11월 6일 ~ 12일, 비교 기간 10월 30일 ~ 11월 5일. 11월 1일까지는 덮은 기간 밖이고 11월 3일은 덜 끝났다.
    // 남은 짝은 11월 2일↔9일, 4일↔11일, 5일↔12일이다
    const days = [
      day('2026-11-02', { rx: [rx('A', 1)] }),
      day('2026-11-03', { partial: true, rx: [rx('A', 40)] }), // A만 나온 날이 덜 끝나도 B의 짝(11월 10일)까지 빠진다
      day('2026-11-04', { rx: [rx('A', 2)] }),
      day('2026-11-05', { rx: [rx('B', 8)] }),
      day('2026-11-06', { rx: [rx('A', 50)] }), // 짝 10월 30일이 덮은 기간 밖
      day('2026-11-07', { rx: [rx('B', 60)] }), // 짝 10월 31일이 덮은 기간 밖
      day('2026-11-09', { rx: [rx('B', 16)] }),
      day('2026-11-10', { rx: [rx('B', 100)] }), // 짝 11월 3일이 덜 끝남
      day('2026-11-11', { rx: [rx('B', 32)] }),
      day('2026-11-12', { rx: [rx('A', 4)] }),
    ]
    const stats = input(today, '7d', days, [{ from: '2026-11-02', to: '2026-11-12' }])
    const comparableByCode = Object.fromEntries(rxList(stats)!.map((row) => [row.code, row.comparable]))
    expect(comparableByCode).toEqual({ A: { current: 4, previous: 3 }, B: { current: 48, previous: 8 } })
    expect(rxComparedCells(stats)).toEqual({ kept: 3, dropped: true })
  })
})

// 처방 골라 보기 표의 숫자 (rx-picker REQ-804). 모두 지어낸 일 줄이다
describe('AC-804 rxPickRows', () => {
  const today = '2026-11-13'
  // '7d': 이번 기간 11월 6일 ~ 12일, 비교 기간 10월 30일 ~ 11월 5일
  const bothWeeks = [{ from: '2026-10-30', to: '2026-11-12' }]
  const pick = (code: string, name = `저장한 ${code}`) => ({ code, name })
  // 구분 없음이 있는 줄: 신환 + 재진이 건수보다 적다
  const gapLine = (code: string, patients: number, newPatients: number, returning: number) => ({ ...rx(code, patients, { newPatients }), returning })

  it('AC-804.1 줄은 고른 차례 그대로다(많은 차례로 다시 줄 세우지 않는다)', () => {
    const days = [day('2026-11-10', { rx: [rx('A', 30), rx('B', 1), rx('C', 20)] })]
    const rows = rxPickRows(input(today, '7d', days, bothWeeks), [pick('B'), pick('A'), pick('C')])
    expect(rows.map((row) => row.code)).toEqual(['B', 'A', 'C'])
    expect(rows.map((row) => row.count)).toEqual([1, 30, 20])
  })

  it('AC-804.1 고른 처방이 없으면 빈 목록이고 buildTrend를 부르지 않는다', () => {
    const stats = input(today, '7d', [day('2026-11-10', { rx: [rx('A', 3)] })], bothWeeks)
    vi.mocked(buildTrend).mockClear()
    expect(rxPickRows(stats, [])).toEqual([])
    expect(buildTrend).not.toHaveBeenCalled()
  })

  it('AC-804.2 건수·신환·재진·견준 짝·증감이 처방 추세(rxList) 줄과 같다', () => {
    const days = [
      day('2026-11-01', { rx: [rx('A', 4, { newPatients: 1 })] }),
      day('2026-11-06', { rx: [rx('A', 10, { newPatients: 3 })] }),
      day('2026-11-10', { rx: [rx('A', 2, { newPatients: 2 })] }),
    ]
    const stats = input(today, '7d', days, bothWeeks)
    const trend = rxList(stats)![0]
    const [row] = rxPickRows(stats, [pick('A')])
    expect(row.count).toBe(12)
    expect(row.newCount).toBe(5)
    expect(row.returningCount).toBe(7)
    expect(row).toEqual({ ...trend, gapCount: 0 })
  })

  it('AC-804.2 덮은 기간 밖 날은 더하지 않고 덮은 기간 안의 덜 끝난 날은 더한다', () => {
    const days = [
      day('2026-11-06', { rx: [rx('A', 100)] }), // 덮은 기간 밖
      day('2026-11-08', { rx: [rx('A', 5)] }),
      day('2026-11-12', { partial: true, rx: [rx('A', 2)] }),
    ]
    const [row] = rxPickRows(input(today, '7d', days, [{ from: '2026-11-07', to: '2026-11-12' }]), [pick('A')])
    expect(row.count).toBe(7)
  })

  it('AC-804.3 구분 없음 = 건수 − 신환 − 재진이다', () => {
    const days = [day('2026-11-08', { rx: [gapLine('A', 7, 1, 5), rx('B', 3, { newPatients: 1 })] }), day('2026-11-09', { rx: [gapLine('A', 4, 1, 1)] })]
    const rows = rxPickRows(input(today, '7d', days, bothWeeks), [pick('A'), pick('B')])
    expect(rows.map((row) => [row.count, row.newCount, row.returningCount, row.gapCount])).toEqual([
      [11, 2, 6, 3],
      [3, 1, 2, 0],
    ])
  })

  it('AC-804.5 이 기간에 저장된 줄이 없는 처방도 지우지 않고 0건 줄로 두고 이름은 저장해 둔 이름이다', () => {
    const days = [day('2026-11-08', { rx: [rx('A', 3)] }), day('2026-11-01', { rx: [rx('Z', 5, { name: '비교 기간의 이름' })] })]
    const rows = rxPickRows(input(today, '7d', days, bothWeeks), [pick('Z', '저장한 이름'), pick('Y', '어디에도 없는 처방'), pick('A')])
    expect(rows.map((row) => row.code)).toEqual(['Z', 'Y', 'A'])
    expect(rows[0]).toMatchObject({ name: '저장한 이름', count: 0, newCount: 0, returningCount: 0, gapCount: 0 })
    expect(rows[1]).toMatchObject({ name: '어디에도 없는 처방', count: 0, newCount: 0, returningCount: 0, gapCount: 0 })
  })

  it('AC-804.5 이름은 이 기간 가장 최근 날의 이름이다', () => {
    const days = [
      day('2026-11-10', { rx: [rx('A', 1, { name: '새 이름' })] }),
      day('2026-11-06', { rx: [rx('A', 1, { name: '옛 이름' })] }),
      day('2026-11-01', { rx: [rx('A', 1, { name: '비교 기간의 이름' })] }),
    ]
    expect(rxPickRows(input(today, '7d', days, bothWeeks), [pick('A', '저장한 이름')])[0].name).toBe('새 이름')
  })

  it('AC-804.5 비교 기간 5건이고 이 기간 0건이면 증감이 5건 (−100.0%) ▼다', () => {
    const days = [day('2026-11-01', { rx: [rx('A', 5)] })]
    const [row] = rxPickRows(input(today, '7d', days, bothWeeks), [pick('A')])
    expect(row.comparable).toEqual({ current: 0, previous: 5 })
    expect(formatDelta(row.delta, '건')).toMatchObject({ dir: 'down', text: '5건 (−100.0%)' })
  })

  it('AC-804.5 비교 기간도 0건이면 증감이 변화 없음이다', () => {
    const [row] = rxPickRows(input(today, '7d', [], bothWeeks), [pick('A')])
    expect(row.comparable).toEqual({ current: 0, previous: 0 })
    expect(formatDelta(row.delta, '건')).toMatchObject({ dir: 'flat', text: '변화 없음' })
  })

  it('AC-804.6 7일 — 지난 기간에 덮이지 않은 날이 있으면 건수 − 지난 기간 건수 ≠ 증감 크기', () => {
    // 11월 2일부터 덮음: 남은 짝은 11월 2~5일 ↔ 9~12일 넷이다. 건수에는 11월 6~8일도 든다
    const days = [...daysFrom('2026-11-02', '2026-11-05', { rx: [rx('A', 1)] }), ...daysFrom('2026-11-06', '2026-11-12', { rx: [rx('A', 2)] })]
    const [row] = rxPickRows(input(today, '7d', days, [{ from: '2026-11-02', to: '2026-11-12' }]), [pick('A')])
    expect(row.count).toBe(14)
    expect(row.comparable).toEqual({ current: 8, previous: 4 })
    expect(row.delta).toEqual(compareNumbers(8, 4))
    expect(row.count - row.comparable!.previous).not.toBe(4)
  })

  it('AC-804.6 90일도 주가 아니라 날끼리 짝 짓는다 — 덜 끝난 날 하루는 그 짝만 뺀다', () => {
    const range = statsRange(today, '90d')
    const days = daysFrom(range.previous.from, range.current.to, { rx: [rx('A', 1)] }).map((row) => (row.day === range.previous.to ? { ...row, partial: true } : row))
    const [row] = rxPickRows({ days, covered: [{ from: range.previous.from, to: range.current.to }], range }, [pick('A')])
    expect(row.count).toBe(90)
    expect(row.comparable).toEqual({ current: 89, previous: 89 })
  })

  it('AC-804.7 오늘 2026-11-13의 12개월 — 11달을 견주고 건수에는 11월이 들어 건수 − 지난 기간 건수 ≠ 증감 크기', () => {
    const lastYear = monthsFrom('2024-12', 12).flatMap((month) => monthRows(month, { rx: [rx('A', 3)] }))
    const thisYear = monthsFrom('2025-12', 12).flatMap((month) => monthRows(month, { rx: [rx('A', 4)] }))
    const [row] = rxPickRows(input(today, '12m', [...lastYear, ...thisYear], [{ from: '2024-12-01', to: '2026-11-12' }]), [pick('A')])
    expect(row.count).toBe(96) // 12달 × 8건, 덜 끝난 11월 포함
    expect(row.comparable).toEqual({ current: 88, previous: 66 }) // 끝난 11달끼리
    expect(row.delta).toEqual(compareNumbers(88, 66))
    expect(row.count - row.comparable!.previous).not.toBe(22)
  })

  it('AC-804.8 견줄 짝이 하나도 없으면 comparable이 null이고 증감은 비교할 수 없음이다. 건수는 그대로다', () => {
    const days = daysFrom('2026-11-06', '2026-11-12', { rx: [rx('A', 2)] })
    const [row] = rxPickRows(input(today, '7d', days, [{ from: '2026-11-06', to: '2026-11-12' }]), [pick('A')])
    expect(row.count).toBe(14)
    expect(row.comparable).toBeNull()
    expect(row.delta).toEqual({ kind: 'unavailable' })
    expect(formatDelta(row.delta, '건').text).toBe('비교할 수 없음')
  })

  it('AC-804.10 250개를 골라도 오류 없이 250줄이 고른 차례다(200개씩 나눠 부른다)', () => {
    const picks = Array.from({ length: 250 }, (_, i) => pick(`C${249 - i}`))
    const days = [day('2026-11-08', { rx: [rx('C0', 1), rx('C50', 2), rx('C249', 3)] })]
    const rows = rxPickRows(input(today, '7d', days, bothWeeks), picks)
    expect(rows.map((row) => row.code)).toEqual(picks.map((line) => line.code))
    expect(rows[0].count).toBe(3) // C249: 첫 묶음
    expect(rows[199].count).toBe(2) // C50: 첫 묶음 끝
    expect(rows[249].count).toBe(1) // C0: 둘째 묶음
  })

  it('AC-804.12 고른 코드와 날 줄 코드의 대소문자가 달라도 건수가 맞게 들고 코드는 고른 글자 그대로다', () => {
    const days = [day('2026-11-08', { rx: [rx('ABC', 3, { newPatients: 1 })] }), day('2026-11-09', { rx: [rx('Abc', 2)] }), day('2026-11-01', { rx: [rx('aBc', 4)] })]
    const [row] = rxPickRows(input(today, '7d', days, bothWeeks), [pick('abc')])
    expect(row).toMatchObject({ code: 'abc', count: 5, newCount: 1, returningCount: 4, comparable: { current: 5, previous: 4 } })
  })

  it('AC-804.12 입력에 대소문자만 다른 코드가 둘이면 처음 것 한 줄로 모으고 0건 줄을 만들지 않는다', () => {
    const days = [day('2026-11-08', { rx: [rx('ABC', 3)] })]
    const rows = rxPickRows(input(today, '7d', days, bothWeeks), [pick('abc', '첫 글자'), pick('B'), pick('ABC', '뒤 글자')])
    expect(rows.map((row) => [row.code, row.count])).toEqual([
      ['abc', 3],
      ['B', 0],
    ])
  })

  it('AC-804.12 대소문자만 다른 두 코드가 200개 묶음의 경계를 넘어 있어도 한 줄이다', () => {
    const others = Array.from({ length: 199 }, (_, i) => pick(`C${i}`))
    const days = [day('2026-11-08', { rx: [rx('ABC', 3)] })]
    const rows = rxPickRows(input(today, '7d', days, bothWeeks), [pick('abc'), ...others, pick('D'), pick('ABC')])
    expect(rows).toHaveLength(201)
    expect(rows[0]).toMatchObject({ code: 'abc', count: 3 })
    expect(rows.filter((row) => codeKey(row.code) === 'ABC')).toHaveLength(1)
  })

  it('AC-802.12 codeKey는 코드를 대문자로 바꾸는 규칙이다', () => {
    expect(codeKey('aBc-1')).toBe('ABC-1')
  })
})
