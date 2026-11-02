// 금액 나눔·기간 합·비교(TASK-5, REQ-005 · AC-005.1~AC-005.6). 자료는 모두 가짜 숫자다. 오늘은 인자로만 준다
import { describe, expect, it } from 'vitest'
import { eachDay } from '@/lib/analytics/dates'
import type { RevenueDayRow } from '@/types/revenue'
import { compare, firstMonth, monthSeries, perVisit, periodsFor, splitDay, sumPeriod } from './summary'

// 나눔이 있는 보통 날: 1,000,000 = (500,000 + 200,000) + 250,000 + 50,000
function day(date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow {
  return {
    date,
    visits: 10,
    newPatients: 2,
    returnVisits: 8,
    total: 1_000_000,
    insurer: 500_000,
    noncovered: 250_000,
    copay: 200_000,
    otherTotal: 50_000,
    cash: 100_000,
    card: 800_000,
    transfer: 100_000,
    receivableIn: 0,
    unconfirmed: false,
    splitUnconfirmed: false,
    ...over,
  }
}

// 그날 금액을 셀 수 없는 날: 아홉 칸 null
function uncheckedDay(date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow {
  return day(date, {
    total: null,
    insurer: null,
    noncovered: null,
    copay: null,
    otherTotal: null,
    cash: null,
    card: null,
    transfer: null,
    receivableIn: null,
    unconfirmed: true,
    ...over,
  })
}

// 나눔만 셀 수 없는 날: 네 칸 null, total은 남음
function noSplitDay(date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow {
  return day(date, { total: 500_000, insurer: null, noncovered: null, copay: null, otherTotal: null, splitUnconfirmed: true, ...over })
}

// 쉬는 날: 아홉 칸 0, 내원 0, 두 표시 거짓
function restDay(date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow {
  return day(date, {
    visits: 0,
    newPatients: 0,
    returnVisits: 0,
    total: 0,
    insurer: 0,
    noncovered: 0,
    copay: 0,
    otherTotal: 0,
    cash: 0,
    card: 0,
    transfer: 0,
    receivableIn: 0,
    ...over,
  })
}

const NO_SPLIT = { covered: null, insurer: null, selfPay: null, noncovered: null, other: null, splitTotal: null }
const OCT_3 = { from: '2026-10-01', to: '2026-10-03' }

describe('AC-005.1 splitDay 하루 나눔', () => {
  it('AC-005.1 급여는 공단부담과 본인부담을 더한 값이고 기타는 otherTotal이다(기타를 급여에 섞지 않음)', () => {
    expect(splitDay(day('2026-10-01'))).toEqual({
      covered: 700_000,
      insurer: 500_000,
      selfPay: 200_000,
      noncovered: 250_000,
      other: 50_000,
      total: 1_000_000,
    })
  })

  it('AC-005.1 쉬는 날은 0으로 나뉜 날이다(null이 아님)', () => {
    expect(splitDay(restDay('2026-10-04'))).toEqual({ covered: 0, insurer: 0, selfPay: 0, noncovered: 0, other: 0, total: 0 })
  })

  it('AC-005.1 unconfirmed인 날은 나눔이 없다(칸이 맞아도 표시를 따른다)', () => {
    expect(splitDay(uncheckedDay('2026-10-01'))).toBeNull()
    expect(splitDay(day('2026-10-01', { unconfirmed: true }))).toBeNull()
  })

  it('AC-005.1 splitUnconfirmed인 날은 나눔이 없다(total이 있어도, 칸이 맞아도 표시를 따른다)', () => {
    expect(splitDay(noSplitDay('2026-10-01'))).toBeNull()
    expect(splitDay(day('2026-10-01', { splitUnconfirmed: true }))).toBeNull()
  })

  it('AC-005.1 표시가 거짓이어도 나눔 칸이 null이면 나눔이 없다', () => {
    expect(splitDay(day('2026-10-01', { otherTotal: null }))).toBeNull()
    // null을 0으로 치면 합이 맞는 줄
    expect(splitDay(day('2026-10-01', { otherTotal: null, noncovered: 300_000 }))).toBeNull()
  })

  it('AC-005.1 급여 + 비급여 + 기타 ≠ 총액이면 고쳐 맞추지 않고 null이다', () => {
    expect(splitDay(day('2026-10-01', { total: 1_000_001 }))).toBeNull()
    expect(splitDay(day('2026-10-01', { otherTotal: 49_999 }))).toBeNull()
  })

  it.each([
    ['공단부담', { insurer: -100, otherTotal: 550_100 }],
    ['본인부담', { copay: -100, otherTotal: 250_100 }],
    ['비급여', { noncovered: -100, otherTotal: 300_100 }],
    ['기타', { otherTotal: -100, noncovered: 300_100 }],
    ['총액', { total: -100, insurer: 0, copay: 0, noncovered: 0, otherTotal: -100 }],
  ])('AC-005.1 합이 맞아도 %s 칸이 음수면 null이다', (_name, over) => {
    expect(splitDay(day('2026-10-01', over))).toBeNull()
  })
})

describe('AC-005.2 sumPeriod 기간 합', () => {
  it('AC-005.2 원 합이 그대로이고 기타 합이 들어 있으며 급여 + 비급여 + 기타 = splitTotal이다', () => {
    const rows = [
      day('2026-10-01', { total: 266_357, insurer: 123_457, copay: 52_901, noncovered: 88_888, otherTotal: 1_111 }),
      day('2026-10-02', { total: 400_007, insurer: 300_001, copay: 99_999, noncovered: 0, otherTotal: 7 }),
    ]
    expect(sumPeriod(rows, { from: '2026-10-01', to: '2026-10-02' })).toEqual({
      total: 666_364,
      covered: 576_358,
      insurer: 423_458,
      selfPay: 152_900,
      noncovered: 88_888,
      other: 1_118,
      splitTotal: 666_364,
      visits: 20,
      perVisitTotal: 666_364,
      perVisitCount: 20,
      uncheckedDays: [],
      noSplitDays: [],
      noVisitDays: [],
      days: 2,
    })
  })

  it('AC-005.2 기간 밖의 줄은 무시한다', () => {
    const rows = [day('2026-09-30'), day('2026-10-01'), day('2026-10-02'), day('2026-10-03'), day('2026-10-04')]
    const sum = sumPeriod(rows, OCT_3)
    expect(sum?.total).toBe(3_000_000)
    expect(sum?.days).toBe(3)
    expect(sum?.visits).toBe(30)
  })

  it('AC-005.2 확인 필요한 날은 금액에서 빠지고 목록에 있으며 내원은 그대로 더한다', () => {
    const sum = sumPeriod([day('2026-10-01'), uncheckedDay('2026-10-02')], OCT_3)
    expect(sum).toEqual({
      total: 1_000_000,
      covered: 700_000,
      insurer: 500_000,
      selfPay: 200_000,
      noncovered: 250_000,
      other: 50_000,
      splitTotal: 1_000_000,
      visits: 20,
      perVisitTotal: 1_000_000,
      perVisitCount: 10,
      uncheckedDays: ['2026-10-02'],
      noSplitDays: [],
      noVisitDays: [],
      days: 1,
    })
  })

  it('AC-005.2 나눔을 못 한 날은 총액에 들어가고 나눔 합·splitTotal에서 빠지며 noSplitDays에만 있다(splitTotal < 총액, 맞춰 고치지 않음)', () => {
    const sum = sumPeriod([day('2026-10-01'), noSplitDay('2026-10-02')], OCT_3)
    expect(sum).toEqual({
      total: 1_500_000,
      covered: 700_000,
      insurer: 500_000,
      selfPay: 200_000,
      noncovered: 250_000,
      other: 50_000,
      splitTotal: 1_000_000,
      visits: 20,
      perVisitTotal: 1_500_000,
      perVisitCount: 20,
      uncheckedDays: [],
      noSplitDays: ['2026-10-02'],
      noVisitDays: [],
      days: 2,
    })
  })

  it('AC-005.2 합 검사에 걸린 손으로 만든 줄도 나눔을 못 한 날로 센다(총액에는 들어감)', () => {
    const sum = sumPeriod([day('2026-10-01'), day('2026-10-02', { total: 1_000_001 })], OCT_3)
    expect(sum?.total).toBe(2_000_001)
    expect(sum?.splitTotal).toBe(1_000_000)
    expect(sum?.noSplitDays).toEqual(['2026-10-02'])
    expect(sum?.uncheckedDays).toEqual([])
  })

  it('AC-005.2 모든 날이 나눔을 못 한 날이면 나눔 여섯 칸은 null이고 총액은 있다', () => {
    const sum = sumPeriod([noSplitDay('2026-10-01'), noSplitDay('2026-10-02')], OCT_3)
    expect(sum).toMatchObject({ ...NO_SPLIT, total: 1_000_000, noSplitDays: ['2026-10-01', '2026-10-02'], days: 2 })
  })

  it('AC-005.2 일요일 0원 줄 하나 + 나머지 모두 splitUnconfirmed면 나눔 여섯 칸은 null(0이 아님)이고 일요일은 noSplitDays에 없다', () => {
    const rows = [
      restDay('2026-03-01'),
      ...eachDay({ from: '2026-03-02', to: '2026-03-07' }).map((date) => noSplitDay(date)),
    ]
    const sum = sumPeriod(rows, { from: '2026-03-01', to: '2026-03-07' })
    expect(sum).toMatchObject({ ...NO_SPLIT, total: 3_000_000, days: 7 })
    expect(sum?.noSplitDays).toEqual(eachDay({ from: '2026-03-02', to: '2026-03-07' }))
    expect(sum?.uncheckedDays).toEqual([])
  })

  it('AC-005.2 31일 기간에 확인 필요한 날 2일과 쉬는 날·나눔을 못 한 날이 섞이면 days는 29다', () => {
    const rest = new Set(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29'])
    const unchecked = new Set(['2026-03-02', '2026-03-03'])
    const noSplit = new Set(['2026-03-10', '2026-03-11'])
    const march = { from: '2026-03-01', to: '2026-03-31' }
    const rows = eachDay(march).map((date) => {
      if (rest.has(date)) return restDay(date)
      if (unchecked.has(date)) return uncheckedDay(date)
      if (noSplit.has(date)) return noSplitDay(date)
      return day(date)
    })
    const sum = sumPeriod(rows, march)
    expect(sum?.days).toBe(29)
    expect(sum?.uncheckedDays).toEqual([...unchecked])
    expect(sum?.noSplitDays).toEqual([...noSplit])
    expect(sum?.total).toBe(22 * 1_000_000 + 2 * 500_000)
    expect(sum?.splitTotal).toBe(22 * 1_000_000)
  })

  it('AC-005.2 기간 안 줄이 없으면 null이다', () => {
    expect(sumPeriod([], OCT_3)).toBeNull()
    expect(sumPeriod([day('2026-09-30')], OCT_3)).toBeNull()
  })

  it('AC-005.2 모든 날의 금액·내원이 0이면 null이다', () => {
    expect(sumPeriod([restDay('2026-10-01'), restDay('2026-10-02')], OCT_3)).toBeNull()
  })

  it('AC-005.2 총액이 0이어도 다른 금액이나 내원이 있으면 자료가 있고 나눔 칸만 null이다', () => {
    const received = sumPeriod([restDay('2026-10-01', { receivableIn: 30_000 })], OCT_3)
    expect(received).toMatchObject({ ...NO_SPLIT, total: 0, days: 1 })
    const visited = sumPeriod([restDay('2026-10-01', { visits: 3 })], OCT_3)
    expect(visited).toMatchObject({ ...NO_SPLIT, total: 0, visits: 3 })
  })

  it('AC-005.2 내원을 셀 수 없는 날(null)은 0과 다르다: 내원 합에서 빠지고 자료 없음으로 치지 않는다', () => {
    const sum = sumPeriod([day('2026-10-01'), day('2026-10-02', { visits: null })], OCT_3)
    expect(sum?.visits).toBe(10)
    expect(sumPeriod([restDay('2026-10-01', { visits: null })], OCT_3)).toMatchObject({ total: 0, visits: null, days: 1 })
  })

  it('AC-005.2 모든 날이 확인 필요한 날이어도 null이 아니다: 총액 0, days 0, 나눔 칸 null, 날짜 목록', () => {
    const sum = sumPeriod([uncheckedDay('2026-10-01'), uncheckedDay('2026-10-02')], OCT_3)
    expect(sum).toMatchObject({ ...NO_SPLIT, total: 0, days: 0, uncheckedDays: ['2026-10-01', '2026-10-02'] })
  })

  it('AC-005.2 날짜 목록은 줄 순서와 상관없이 날짜 순이다', () => {
    const sum = sumPeriod(
      [
        uncheckedDay('2026-10-03'),
        noSplitDay('2026-10-02'),
        uncheckedDay('2026-10-01'),
        noSplitDay('2026-10-01'),
        day('2026-10-03', { visits: null }),
        day('2026-10-02', { visits: null }),
      ],
      OCT_3,
    )
    expect(sum?.uncheckedDays).toEqual(['2026-10-01', '2026-10-03'])
    expect(sum?.noSplitDays).toEqual(['2026-10-01', '2026-10-02'])
    expect(sum?.noVisitDays).toEqual(['2026-10-02', '2026-10-03'])
  })

  it('AC-005.2 visits는 null인 날만 건너뛴 아는 접수 건수 전부이고 unconfirmed인 날도 든다', () => {
    const rows = [day('2026-10-01'), uncheckedDay('2026-10-02', { visits: 7 }), day('2026-10-03', { visits: null })]
    expect(sumPeriod(rows, OCT_3)?.visits).toBe(17)
  })

  it('AC-005.2 perVisitTotal·perVisitCount는 unconfirmed가 아니고 visits가 null이 아닌 날만 더한다', () => {
    const rows = [
      day('2026-10-01', { visits: 12 }),
      uncheckedDay('2026-10-02', { visits: 7 }),
      day('2026-10-03', { total: 800_000, insurer: 300_000, visits: null }),
    ]
    expect(sumPeriod(rows, OCT_3)).toMatchObject({ total: 1_800_000, visits: 19, perVisitTotal: 1_000_000, perVisitCount: 12 })
  })

  it('AC-005.2 noVisitDays는 unconfirmed가 아니고 visits가 null인 날이다(total이 0이어도 든다)', () => {
    const rows = [day('2026-10-01', { visits: null }), restDay('2026-10-02', { visits: null }), day('2026-10-03')]
    const sum = sumPeriod(rows, OCT_3)
    expect(sum?.noVisitDays).toEqual(['2026-10-01', '2026-10-02'])
    expect(sum?.uncheckedDays).toEqual([])
    expect(sum?.noSplitDays).toEqual([])
    expect(sum?.days).toBe(3)
  })

  it('AC-005.2 unconfirmed이면서 visits도 null인 날은 uncheckedDays에만 있다', () => {
    const sum = sumPeriod([uncheckedDay('2026-10-01', { visits: null }), day('2026-10-02')], OCT_3)
    expect(sum).toMatchObject({ visits: 10, perVisitTotal: 1_000_000, perVisitCount: 10 })
    expect(sum?.uncheckedDays).toEqual(['2026-10-01'])
    expect(sum?.noVisitDays).toEqual([])
  })

  it('AC-005.2 기간의 visits가 모두 null이면 visits는 0이 아니라 null이고 total은 그대로다', () => {
    const sum = sumPeriod([day('2026-10-01', { visits: null }), day('2026-10-02', { visits: null })], OCT_3)
    expect(sum).toMatchObject({ total: 2_000_000, visits: null, perVisitTotal: 0, perVisitCount: 0, days: 2 })
    expect(sum?.noVisitDays).toEqual(['2026-10-01', '2026-10-02'])
  })

  it('AC-005.2 unconfirmed인 날뿐이고 visits도 모두 null이면 visits는 null이다', () => {
    const sum = sumPeriod([uncheckedDay('2026-10-01', { visits: null })], OCT_3)
    expect(sum).toMatchObject({ total: 0, visits: null, perVisitTotal: 0, perVisitCount: 0, days: 0 })
    expect(sum?.uncheckedDays).toEqual(['2026-10-01'])
    expect(sum?.noVisitDays).toEqual([])
  })

  it('AC-005.2 visits가 모두 0이고 금액이 있으면 visits는 null이 아니라 0이다', () => {
    const paid = { total: 100_000, insurer: 100_000 }
    const sum = sumPeriod([restDay('2026-10-01', paid), restDay('2026-10-02', paid)], OCT_3)
    expect(sum).toMatchObject({ total: 200_000, visits: 0, perVisitTotal: 200_000, perVisitCount: 0 })
    expect(sum?.noVisitDays).toEqual([])
  })

  it('AC-005.2 금액이 모두 0이고 visits가 모두 null이면 합은 null이 아니고(null을 0으로 보지 않음) 그 날들이 noVisitDays에 있다', () => {
    const sum = sumPeriod([restDay('2026-10-01', { visits: null }), restDay('2026-10-02', { visits: null })], OCT_3)
    expect(sum).not.toBeNull()
    expect(sum).toMatchObject({ ...NO_SPLIT, total: 0, visits: null, perVisitTotal: 0, perVisitCount: 0, days: 2 })
    expect(sum?.noVisitDays).toEqual(['2026-10-01', '2026-10-02'])
  })
})

describe('AC-005.3 periodsFor·firstMonth 기간', () => {
  it('AC-005.3 지난 달을 고르면 끝은 말일이고, 지난달이 짧으면 3월 31일 → 2월 28일이다', () => {
    expect(periodsFor('2026-03', '2026-04-15')).toEqual({
      current: { from: '2026-03-01', to: '2026-03-31' },
      lastMonth: { from: '2026-02-01', to: '2026-02-28' },
      lastYear: { from: '2025-03-01', to: '2025-03-31' },
    })
  })

  it('AC-005.3 이번 달은 어제까지이고 비교 기간도 같은 날짜까지다', () => {
    expect(periodsFor('2026-10', '2026-10-15')).toEqual({
      current: { from: '2026-10-01', to: '2026-10-14' },
      lastMonth: { from: '2026-09-01', to: '2026-09-14' },
      lastYear: { from: '2025-10-01', to: '2025-10-14' },
    })
  })

  it('AC-005.3 이번 달 말일에는 어제까지이고, 다음 달 1일에는 그 달 말일까지다', () => {
    expect(periodsFor('2026-10', '2026-10-31').current).toEqual({ from: '2026-10-01', to: '2026-10-30' })
    expect(periodsFor('2026-10', '2026-11-01').current).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('AC-005.3 윤년 2월 29일의 작년 같은 때는 28일이다', () => {
    expect(periodsFor('2028-02', '2028-03-10')).toEqual({
      current: { from: '2028-02-01', to: '2028-02-29' },
      lastMonth: { from: '2028-01-01', to: '2028-01-29' },
      lastYear: { from: '2027-02-01', to: '2027-02-28' },
    })
  })

  it('AC-005.3 1월의 지난달은 작년 12월이다', () => {
    expect(periodsFor('2026-01', '2026-01-15').lastMonth).toEqual({ from: '2025-12-01', to: '2025-12-14' })
  })

  it('AC-005.3 오늘이 1일이면 이번 달 기간은 비어 있어 합이 없다', () => {
    const { current } = periodsFor('2026-11', '2026-11-01')
    expect(sumPeriod([day('2026-11-01'), day('2026-10-31')], current)).toBeNull()
  })

  it('AC-005.3 firstMonth는 어제가 속한 달이다(오늘이 1일이면 지난달)', () => {
    expect(firstMonth('2026-11-02')).toBe('2026-11')
    expect(firstMonth('2026-11-01')).toBe('2026-10')
    expect(firstMonth('2026-01-01')).toBe('2025-12')
  })
})

describe('AC-005.4 compare 늘고 준 비율', () => {
  it('AC-005.4 +4.08%는 4.0(up)이다', () => {
    expect(compare(10_408, 10_000)).toEqual({ dir: 'up', rate: 4.0 })
  })

  it('AC-005.4 −2.15%는 −2.1(down)이다(0 쪽으로 버림)', () => {
    expect(compare(9_785, 10_000)).toEqual({ dir: 'down', rate: -2.1 })
  })

  it('AC-005.4 같으면 same이고 비율은 0이다', () => {
    expect(compare(10_000, 10_000)).toEqual({ dir: 'same', rate: 0 })
  })

  it('AC-005.4 부동소수 오차로 한 칸 덜 버리지 않는다(129 ÷ 100 → 29.0)', () => {
    expect(compare(129, 100)).toEqual({ dir: 'up', rate: 29.0 })
  })

  it('AC-005.4 버려서 0.0이 되어도 방향은 금액 차이대로이고 비율은 −0이 아니다', () => {
    expect(compare(1_000_100, 1_000_000)).toEqual({ dir: 'up', rate: 0 })
    const down = compare(999_900, 1_000_000)
    expect(down?.dir).toBe('down')
    expect(down?.rate).toBe(0)
  })

  it('AC-005.4 지금이 0이면 −100이다', () => {
    expect(compare(0, 10_000)).toEqual({ dir: 'down', rate: -100 })
  })

  it('AC-005.4 before가 null이거나 0이면 비교할 수 없다', () => {
    expect(compare(10_000, null)).toBeNull()
    expect(compare(10_000, 0)).toBeNull()
    expect(compare(0, 0)).toBeNull()
  })

  it('AC-005.4 now가 null이어도 비교할 수 없다', () => {
    expect(compare(null, 10_000)).toBeNull()
  })
})

describe('AC-005.5 monthSeries 13달', () => {
  const emptyMonth = (month: string, partial = false) => ({
    month,
    partial,
    total: null,
    covered: null,
    noncovered: null,
    other: null,
    visits: null,
    perVisit: null,
  })

  it('AC-005.5 마지막 달부터 거꾸로 13달을 오래된 달부터 돌려준다', () => {
    const series = monthSeries([], '2026-10', '2026-10-16')
    expect(series.map((p) => p.month)).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ])
  })

  it('AC-005.5 달마다 총액·급여·비급여·기타·내원·건당 진료비를 낸다', () => {
    const rows = [day('2026-09-01'), day('2026-09-30', { visits: 30 })]
    const point = monthSeries(rows, '2026-10', '2026-10-16').find((p) => p.month === '2026-09')
    expect(point).toEqual({
      month: '2026-09',
      partial: false,
      total: 2_000_000,
      covered: 1_400_000,
      noncovered: 500_000,
      other: 100_000,
      visits: 40,
      perVisit: 50_000,
    })
  })

  it('AC-005.5 자료 없는 달은 0이 아니라 null이다(모두 0인 달도)', () => {
    const rows = [restDay('2026-08-02'), restDay('2026-08-09')]
    const series = monthSeries(rows, '2026-10', '2026-10-16')
    expect(series.find((p) => p.month === '2026-08')).toEqual(emptyMonth('2026-08'))
    expect(series.find((p) => p.month === '2026-07')).toEqual(emptyMonth('2026-07'))
  })

  it('AC-005.5 진행 중인 달은 어제까지만 더하고 partial이다', () => {
    const rows = [
      day('2026-10-01'),
      day('2026-10-15'),
      day('2026-10-16', { total: 7_000_000, insurer: 6_500_000 }),
    ]
    const last = monthSeries(rows, '2026-10', '2026-10-16').at(-1)
    expect(last).toEqual({
      month: '2026-10',
      partial: true,
      total: 2_000_000,
      covered: 1_400_000,
      noncovered: 500_000,
      other: 100_000,
      visits: 20,
      perVisit: 100_000,
    })
  })

  it('AC-005.5 이번 달 말일에도 끝나지 않은 달이고, 다음 달 1일이면 끝난 달이다', () => {
    const rows = [day('2026-10-30'), day('2026-10-31')]
    expect(monthSeries(rows, '2026-10', '2026-10-31').at(-1)).toMatchObject({ partial: true, total: 1_000_000 })
    expect(monthSeries(rows, firstMonth('2026-11-01'), '2026-11-01').at(-1)).toMatchObject({
      month: '2026-10',
      partial: false,
      total: 2_000_000,
    })
  })

  it('AC-005.5 쉬는 날 말고 모두 나눔을 못 한 달의 급여·비급여·기타는 null이고 총액은 있다', () => {
    const rows = [restDay('2026-07-05'), noSplitDay('2026-07-06'), restDay('2026-07-31')]
    expect(monthSeries(rows, '2026-10', '2026-10-16').find((p) => p.month === '2026-07')).toEqual({
      month: '2026-07',
      partial: false,
      total: 500_000,
      covered: null,
      noncovered: null,
      other: null,
      visits: 10,
      perVisit: 50_000,
    })
  })

  it('AC-005.5 달마다 perVisit은 AC-005.6과 같은 규칙이다: 확인 필요한 날과 접수 건수를 모르는 날은 금액·건수가 둘 다 빠진다', () => {
    const rows = [day('2026-09-01'), uncheckedDay('2026-09-02', { visits: 90 }), day('2026-09-03', { visits: null })]
    const point = monthSeries(rows, '2026-10', '2026-10-16').find((p) => p.month === '2026-09')
    expect(point).toMatchObject({ total: 2_000_000, visits: 100, perVisit: 100_000 })
  })

  it('AC-005.5 달의 visits가 모두 null이면 visits·perVisit은 null이고 total은 숫자다', () => {
    const rows = [day('2026-09-01', { visits: null }), day('2026-09-02', { visits: null })]
    const point = monthSeries(rows, '2026-10', '2026-10-16').find((p) => p.month === '2026-09')
    expect(point).toEqual({
      month: '2026-09',
      partial: false,
      total: 2_000_000,
      covered: 1_400_000,
      noncovered: 500_000,
      other: 100_000,
      visits: null,
      perVisit: null,
    })
  })
})

describe('AC-005.6 perVisit 건당 진료비', () => {
  const ONE_DAY = { from: '2026-10-01', to: '2026-10-01' }
  const TWO_DAYS = { from: '2026-10-01', to: '2026-10-02' }

  it('AC-005.6 162,480,350원 ÷ 2,904건은 55,950원이다(원 미만 버림)', () => {
    const row = day('2026-10-01', {
      total: 162_480_350,
      insurer: 100_000_000,
      copay: 30_000_000,
      noncovered: 30_000_000,
      otherTotal: 2_480_350,
      visits: 2_904,
    })
    expect(perVisit(sumPeriod([row], ONE_DAY))).toBe(55_950)
  })

  it('AC-005.6 unconfirmed인 날은 금액과 건수가 둘 다 빠진다', () => {
    const rows = [day('2026-10-01'), uncheckedDay('2026-10-02', { visits: 990 })]
    expect(perVisit(sumPeriod(rows, TWO_DAYS))).toBe(100_000)
  })

  it('AC-005.6 visits가 null이고 금액이 있는 날은 둘 다 빠지고 noVisitDays에 있으며 총액에는 남는다(건당 진료비가 부풀지 않음)', () => {
    const sum = sumPeriod([day('2026-10-01'), day('2026-10-02', { visits: null })], TWO_DAYS)
    expect(perVisit(sum)).toBe(100_000) // 금액만 남기면 200,000이 된다
    expect(sum?.total).toBe(2_000_000)
    expect(sum?.noVisitDays).toEqual(['2026-10-02'])
  })

  it('AC-005.6 visits가 0이고 금액이 있는 날은 분자에 남는다', () => {
    const rows = [day('2026-10-01'), restDay('2026-10-02', { total: 100_000, insurer: 100_000 })]
    expect(perVisit(sumPeriod(rows, TWO_DAYS))).toBe(110_000)
  })

  it('AC-005.6 splitUnconfirmed인 날은 보통 날처럼 든다', () => {
    expect(perVisit(sumPeriod([day('2026-10-01'), noSplitDay('2026-10-02')], TWO_DAYS))).toBe(75_000)
  })

  it('AC-005.2 AC-005.6 splitUnconfirmed이면서 visits도 null인 날은 두 목록에 다 들고 총액에 남고 짝에서 빠진다', () => {
    const sum = sumPeriod([day('2026-10-01'), noSplitDay('2026-10-02', { visits: null })], TWO_DAYS)
    expect(sum?.noSplitDays).toEqual(['2026-10-02'])
    expect(sum?.noVisitDays).toEqual(['2026-10-02'])
    expect(sum?.total).toBe(sumPeriod([day('2026-10-01')], TWO_DAYS)!.total + noSplitDay('2026-10-02').total!)
    expect(sum?.perVisitTotal).toBe(day('2026-10-01').total)
    expect(sum?.perVisitCount).toBe(day('2026-10-01').visits)
  })

  it('AC-005.6 짝이 맞는 날이 없으면 null이다', () => {
    expect(perVisit(sumPeriod([uncheckedDay('2026-10-01')], ONE_DAY))).toBeNull()
    expect(perVisit(sumPeriod([day('2026-10-01', { visits: null })], ONE_DAY))).toBeNull()
  })

  it('AC-005.6 visits 합이 0이면 null이다', () => {
    const sum = sumPeriod([restDay('2026-10-01', { total: 100_000, insurer: 100_000 })], ONE_DAY)
    expect(sum?.total).toBe(100_000)
    expect(perVisit(sum)).toBeNull()
  })

  it('AC-005.6 합이 null이면 null이다', () => {
    expect(perVisit(null)).toBeNull()
  })
})
