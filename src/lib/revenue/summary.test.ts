// 금액 나눔·기간 합·비교(TASK-5, REQ-005 · AC-005.1~AC-005.6, 옛 달 셈은 지움 AC-4110.4). 자료는 모두 가짜 숫자다. 오늘은 인자로만 준다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eachDay } from '@/lib/analytics/dates'
import type { RevenueDayRow } from '@/types/revenue'
import { compare, dayRevenue, perVisit, revenueDayValues, splitDay, sumPeriod } from './summary'

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
  it('AC-005.2·AC-4105.1 원 합이 그대로이고 기타 합이 들어 있으며 급여 + 비급여 + 기타 = splitTotal이다', () => {
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
      workDays: 2,
    })
  })

  it('AC-005.2 기간 밖의 줄은 무시한다', () => {
    const rows = [day('2026-09-30'), day('2026-10-01'), day('2026-10-02'), day('2026-10-03'), day('2026-10-04')]
    const sum = sumPeriod(rows, OCT_3)
    expect(sum?.total).toBe(3_000_000)
    expect(sum?.days).toBe(3)
    expect(sum?.visits).toBe(30)
  })

  it('AC-005.2·AC-4105.1 확인 필요한 날은 금액에서 빠지고 목록에 있으며 내원은 그대로 더한다', () => {
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
      workDays: 1,
    })
  })

  it('AC-005.2·AC-4105.1 나눔을 못 한 날은 총액에 들어가고 나눔 합·splitTotal에서 빠지며 noSplitDays에만 있다(splitTotal < 총액, 맞춰 고치지 않음)', () => {
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
      workDays: 2,
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

// 옛 매출 탭의 달 기간·13달 셈(periodsFor·firstMonth·monthSeries·MonthPoint)과 그 시험은 지웠다(stats-revenue TASK-8, AC-4110.4)
describe('AC-4110.4 옛 달 기간·13달 셈이 없다', () => {
  it('AC-4110.4·AC-6901.1 summary.ts는 splitDay·isWorkDay·sumPeriod·compare·perVisit·dayRevenue·revenueDayValues만 내보낸다', async () => {
    expect(Object.keys(await import('./summary')).sort()).toEqual([
      'compare',
      'dayRevenue',
      'isWorkDay',
      'perVisit',
      'revenueDayValues',
      'splitDay',
      'sumPeriod',
    ])
  })

  it('AC-4110.4 소스에 옛 이름(periodsFor·firstMonth·monthSeries·MonthPoint)이 없다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/revenue/summary.ts'), 'utf8')
    for (const name of ['periodsFor', 'firstMonth', 'monthSeries', 'MonthPoint']) expect(source, name).not.toMatch(new RegExp(`\\b${name}\\b`))
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

describe('AC-4105.1 sumPeriod 진료한 날 수(workDays)', () => {
  it('AC-4105.1 workDays는 확인 필요한 날과 쉬는 날(접수 0건·금액 모두 0)을 뺀 날 수다', () => {
    const rows = [day('2026-10-01'), uncheckedDay('2026-10-02'), restDay('2026-10-03')]
    expect(sumPeriod(rows, OCT_3)).toMatchObject({ days: 2, workDays: 1 })
  })

  it('AC-4105.1 나눔을 못 한 날·접수 건수를 모르는 날·접수 0건이지만 금액이 있는 날은 진료한 날이다', () => {
    const rows = [noSplitDay('2026-10-01'), day('2026-10-02', { visits: null }), restDay('2026-10-03', { receivableIn: 30_000 })]
    expect(sumPeriod(rows, OCT_3)).toMatchObject({ days: 3, workDays: 3 })
  })

  it('AC-4105.1 31일 기간에 확인 필요한 날 2일 · 쉬는 날 5일 · 나눔을 못 한 날 2일이면 workDays는 24다', () => {
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
    expect(sumPeriod(rows, march)).toMatchObject({ days: 29, workDays: 24 })
  })

  it('AC-4105.1 모든 날이 확인 필요한 날이면 workDays는 0이다(합은 null이 아님)', () => {
    expect(sumPeriod([uncheckedDay('2026-10-01'), restDay('2026-10-02')], OCT_3)).toMatchObject({ total: 0, days: 1, workDays: 0 })
  })
})

// first90 AC-4408.2: 참고 금액 포함(withRough). 확인 필요한 날 가운데 참고 금액(roughTotal, 숫자)이 있는 날만 매출·접수 건수·진료한 날에 더한다
describe('AC-4408.2 sumPeriod 참고 금액 포함(withRough)', () => {
  const rough = (date: string, roughTotal: number, over: Partial<RevenueDayRow> = {}) => uncheckedDay(date, { roughTotal, ...over })

  it('AC-4408.2 참고 금액이 있는 확인 필요한 날의 금액·접수 건수·진료한 날을 더하고 roughDays·roughSum을 낸다', () => {
    const rows = [day('2026-10-01'), rough('2026-10-02', 300_000, { visits: 5 }), restDay('2026-10-03')]
    const sum = sumPeriod(rows, OCT_3, { withRough: true })
    expect(sum).toMatchObject({ total: 1_300_000, perVisitTotal: 1_300_000, perVisitCount: 15, workDays: 2, days: 2, roughDays: ['2026-10-02'], roughSum: 300_000 })
    expect(sum?.uncheckedDays).toEqual(['2026-10-02'])
    expect(perVisit(sum)).toBe(86_666) // 1,300,000 ÷ 15 = 86,666.6… → 원 아래 버림
  })

  it('AC-4408.2 급여·비급여·기타와 splitTotal에는 넣지 않는다', () => {
    const rows = [day('2026-10-01'), rough('2026-10-02', 300_000)]
    const plain = sumPeriod(rows, OCT_3)!
    const withRough = sumPeriod(rows, OCT_3, { withRough: true })!
    for (const key of ['covered', 'insurer', 'selfPay', 'noncovered', 'other', 'splitTotal'] as const) expect(withRough[key], key).toBe(plain[key])
  })

  it('AC-4408.2 참고 금액이 없는 확인 필요한 날(옛 도우미·null)은 켜도 빠진다', () => {
    const rows = [day('2026-10-01'), uncheckedDay('2026-10-02'), uncheckedDay('2026-10-03', { roughTotal: null })]
    expect(sumPeriod(rows, OCT_3, { withRough: true })).toMatchObject({ total: 1_000_000, perVisitCount: 10, workDays: 1, roughDays: [], roughSum: 0 })
  })

  it('AC-4408.2 참고 금액 0원·음수(환불)도 숫자라 더한다', () => {
    const rows = [day('2026-10-01'), rough('2026-10-02', 0), rough('2026-10-03', -20_000)]
    expect(sumPeriod(rows, OCT_3, { withRough: true })).toMatchObject({ total: 980_000, workDays: 3, roughDays: ['2026-10-02', '2026-10-03'], roughSum: -20_000 })
  })

  it('AC-4408.2 접수 건수를 모르는 참고 금액 날은 매출에만 들고 건당 진료비 짝에서 빠진다(noVisitDays)', () => {
    const rows = [day('2026-10-01'), rough('2026-10-02', 300_000, { visits: null })]
    const sum = sumPeriod(rows, OCT_3, { withRough: true })
    expect(sum).toMatchObject({ total: 1_300_000, perVisitTotal: 1_000_000, perVisitCount: 10, noVisitDays: ['2026-10-02'] })
  })

  it('AC-4408.2 끄면(기본) 참고 금액이 있어도 지금 셈 그대로이고 roughDays·roughSum 열쇠가 없다', () => {
    const rows = [day('2026-10-01'), rough('2026-10-02', 300_000)]
    const sum = sumPeriod(rows, OCT_3)
    expect(sum).toMatchObject({ total: 1_000_000, workDays: 1 })
    expect(sum).not.toHaveProperty('roughDays')
    expect(sum).not.toHaveProperty('roughSum')
    expect(sumPeriod(rows, OCT_3, { withRough: false })).toEqual(sum)
  })
})

// bit-total AC-6901.1: 그날 매출 = total ?? roughTotal(0·음수 그대로), 둘 다 없으면 null
describe('AC-6901.1 dayRevenue 그날 매출', () => {
  it('AC-6901.1 total만 있는 날(roughTotal null·열쇠 없음)은 total이다', () => {
    expect(dayRevenue(day('2026-10-01'))).toBe(1_000_000)
    expect(dayRevenue(day('2026-10-01', { roughTotal: null }))).toBe(1_000_000)
    expect(dayRevenue({ total: 730_000 })).toBe(730_000)
  })

  it('AC-6901.1 total이 0인 날(쉬는 날)도 0 그대로다', () => {
    expect(dayRevenue(restDay('2026-10-04'))).toBe(0)
  })

  it('AC-6901.1 나눔만 못 센 날(splitUnconfirmed)은 남은 total이다', () => {
    expect(dayRevenue(noSplitDay('2026-10-02'))).toBe(500_000)
  })

  it.each([870_000, 0, -52_000])('AC-6901.1 total이 null이고 roughTotal만 숫자(%j, 0·음수 포함)면 roughTotal 그대로다', (roughTotal) => {
    expect(dayRevenue(uncheckedDay('2026-10-02', { roughTotal }))).toBe(roughTotal)
    expect(dayRevenue({ total: null, roughTotal })).toBe(roughTotal)
  })

  it('AC-6901.1 둘 다 숫자면 total이다', () => {
    expect(dayRevenue({ total: 1_000_000, roughTotal: 870_000 })).toBe(1_000_000)
    expect(dayRevenue({ total: 0, roughTotal: 870_000 })).toBe(0)
  })

  it('AC-6901.1 둘 다 없으면(null·열쇠 없음) null이다', () => {
    expect(dayRevenue(uncheckedDay('2026-10-02'))).toBeNull()
    expect(dayRevenue(uncheckedDay('2026-10-02', { roughTotal: null }))).toBeNull()
    expect(dayRevenue({ total: null })).toBeNull()
    expect(dayRevenue({ total: null, roughTotal: null })).toBeNull()
  })
})

// bit-total AC-6901.2: dayRevenue가 숫자인 날만 { day, value }로, 받은 차례 그대로
describe('AC-6901.2 revenueDayValues 하루 매출 목록', () => {
  it('AC-6901.2 금액이 있는 날만 받은 차례 그대로 { day, value }로 돌려준다(null인 날은 뺀다)', () => {
    const rows = [
      day('2026-10-03'),
      uncheckedDay('2026-10-01', { roughTotal: 300_000 }),
      uncheckedDay('2026-10-02'),
      restDay('2026-10-05'),
      noSplitDay('2026-10-04'),
      uncheckedDay('2026-10-06', { roughTotal: -20_000 }),
      uncheckedDay('2026-10-07', { roughTotal: null }),
    ]
    expect(revenueDayValues(rows)).toEqual([
      { day: '2026-10-03', value: 1_000_000 },
      { day: '2026-10-01', value: 300_000 },
      { day: '2026-10-05', value: 0 },
      { day: '2026-10-04', value: 500_000 },
      { day: '2026-10-06', value: -20_000 },
    ])
  })

  it('AC-6901.2 날짜·total·roughTotal 세 칸만 있는 줄도 받는다', () => {
    expect(revenueDayValues([{ date: '2026-11-01', total: 100 }, { date: '2026-11-02', total: null, roughTotal: 0 }])).toEqual([
      { day: '2026-11-01', value: 100 },
      { day: '2026-11-02', value: 0 },
    ])
  })

  it('AC-6901.2 빈 목록·금액 모르는 날뿐이면 빈 목록이다', () => {
    expect(revenueDayValues([])).toEqual([])
    expect(revenueDayValues([uncheckedDay('2026-10-01'), uncheckedDay('2026-10-02', { roughTotal: null })])).toEqual([])
  })
})
