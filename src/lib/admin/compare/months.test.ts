import { describe, expect, it } from 'vitest'
import { compareMonths, nearestMonth, type MonthYears } from './months'

// 의원 비교 고를 수 있는 달(spec admin-view REQ-8023 AC-8023.1·AC-8023.2, design.md '의원 비교 달 10년').
// 저장된 가장 이른 달(모든 승인된 의원 기준) ~ 지난달, 이번 달 − 120달보다 앞은 안 된다. 이번 달은 늘 뺀다. 날짜는 모두 지어낸 것이다

const months = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('AC-8023.1 compareMonths — 가장 이른 달 ~ 지난달, 10년까지', () => {
  it('AC-8023.1: 첫 달 ~ 지난달(이번 달 뺌), 연도는 최근 해가 먼저, 해마다 그 해에 고를 수 있는 달만', () => {
    expect(compareMonths('2023-11', '2026-11-24')).toEqual({
      first: '2023-11',
      last: '2026-10',
      years: [
        { year: 2026, months: months(1, 10) },
        { year: 2025, months: months(1, 12) },
        { year: 2024, months: months(1, 12) },
        { year: 2023, months: [11, 12] },
      ],
    })
  })

  it('AC-8023.1: 첫 달이 null(저장된 숫자가 없음)이면 지난달 하나', () => {
    expect(compareMonths(null, '2026-11-24')).toEqual({ first: '2026-10', last: '2026-10', years: [{ year: 2026, months: [10] }] })
  })

  it.each(['2026-11', '2027-03'])('AC-8023.1: 첫 달이 지난달보다 늦으면(%s) 지난달 하나', (first) => {
    expect(compareMonths(first, '2026-11-24')).toEqual({ first: '2026-10', last: '2026-10', years: [{ year: 2026, months: [10] }] })
  })

  it('AC-8023.1: 첫 달이 지난달이면 그 달 하나', () => {
    expect(compareMonths('2026-10', '2026-11-01')).toEqual({ first: '2026-10', last: '2026-10', years: [{ year: 2026, months: [10] }] })
  })

  it('AC-8023.1: 10년(이번 달 − 120달)보다 앞은 자른다 — 2026년 11월이면 2016년 11월부터 120달', () => {
    const got = compareMonths('2009-04', '2026-11-24')
    expect(got.first).toBe('2016-11')
    expect(got.last).toBe('2026-10')
    expect(got.years.map((entry) => entry.year)).toEqual(months(2016, 2026).reverse())
    expect(got.years.at(-1)).toEqual({ year: 2016, months: [11, 12] })
    expect(got.years.reduce((total, entry) => total + entry.months.length, 0)).toBe(120)
  })

  it('AC-8023.1: 딱 120달 앞이면 그대로, 121달 앞이면 120달로', () => {
    expect(compareMonths('2016-11', '2026-11-24').first).toBe('2016-11')
    expect(compareMonths('2016-10', '2026-11-24').first).toBe('2016-11')
  })

  it('AC-8023.1: 1월에 열면 지난달은 지난해 12월', () => {
    expect(compareMonths('2026-08', '2027-01-05')).toEqual({
      first: '2026-08',
      last: '2026-12',
      years: [{ year: 2026, months: [8, 9, 10, 11, 12] }],
    })
  })

  it.each(['2026-13', '2026-1', '', 'abc'])('AC-8023.1: 달 모양이 아닌 첫 달(%s)은 null과 같다', (first) => {
    expect(compareMonths(first, '2026-11-24')).toEqual({ first: '2026-10', last: '2026-10', years: [{ year: 2026, months: [10] }] })
  })
})

describe('AC-8023.2 nearestMonth — 연도를 바꿀 때 가장 가까운 고를 수 있는 달', () => {
  const years = compareMonths('2023-11', '2026-11-24').years

  it('AC-8023.2: 그 해에 같은 달이 있으면 그 달', () => {
    expect(nearestMonth(years, 2024, 5)).toBe('2024-05')
    expect(nearestMonth(years, 2023, 12)).toBe('2023-12')
  })

  it('AC-8023.2: 그 해에 없는 달이면 가장 가까운 달(시안: 2023년으로 바꾸면 10월이 없어 11월)', () => {
    expect(nearestMonth(years, 2023, 10)).toBe('2023-11')
    expect(nearestMonth(years, 2023, 1)).toBe('2023-11')
    expect(nearestMonth(years, 2026, 12)).toBe('2026-10')
  })

  it('AC-8023.2: 거리가 같으면 앞 달', () => {
    const gap: MonthYears = [{ year: 2025, months: [3, 7] }]
    expect(nearestMonth(gap, 2025, 5)).toBe('2025-03')
  })

  it('AC-8023.2: 목록에 없는 해면 모든 달 가운데 가장 가까운 달', () => {
    expect(nearestMonth(years, 2020, 6)).toBe('2023-11')
    expect(nearestMonth(years, 2028, 2)).toBe('2026-10')
  })
})
