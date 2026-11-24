import { describe, expect, it } from 'vitest'
import { salesRow, type SalesDay } from './sales'

// 의원 비교 매출·환자 수 한 줄(spec admin-view REQ-8014 AC-8014.1, design.md '의원 비교 — 계산'). 숫자는 모두 지어낸 것이다

const day = (over: Partial<SalesDay> = {}): SalesDay => ({ visits: 120, newPatients: 8, returnVisits: 100, total: 5_000_000, roughTotal: null, ...over })

describe('AC-8014.1 salesRow: 한 의원 한 달 매출·환자 수', () => {
  it('AC-8014.1: 총진료비·내원·신환·재진은 날마다 합이다', () => {
    const row = salesRow([
      day({ visits: 130, newPatients: 9, returnVisits: 110, total: 4_100_000 }),
      day({ visits: 142, newPatients: 11, returnVisits: 120, total: 4_350_500 }),
      day({ visits: 98, newPatients: 4, returnVisits: 90, total: 3_020_000 }),
    ])
    expect(row).toEqual({ total: 11_470_500, visits: 370, newPatients: 24, returnVisits: 320, dayAvg: 123.3, days: 3 })
  })

  it('AC-8014.1: total이 없는 날은 rough_total(참고 금액)로 센다 — 통계 총매출(dayRevenue)과 같다', () => {
    const row = salesRow([day({ total: 2_000_000 }), day({ total: null, roughTotal: 1_500_000 }), day({ total: null, roughTotal: null })])
    expect(row?.total).toBe(3_500_000)
  })

  it('AC-8014.1: 하루 평균 내원 = 내원 합 ÷ 내원이 1 이상인 날 수, 소수 첫째 자리까지(그 아래 버림 — 시안 136.4건)', () => {
    // 3,412건 ÷ 25일 = 136.48 → 136.4 (반올림이면 136.5)
    const days = [...Array.from({ length: 24 }, () => day({ visits: 136 })), day({ visits: 148 })]
    expect(days.reduce((sum, d) => sum + (d.visits ?? 0), 0)).toBe(3_412)
    expect(salesRow(days)?.dayAvg).toBe(136.4)
    // 0건인 날(쉬는 날)은 분모에서 빠진다
    expect(salesRow([day({ visits: 10 }), day({ visits: 0 }), day({ visits: 11 })])).toMatchObject({ visits: 21, dayAvg: 10.5, days: 2 })
    // 나누어떨어지면 그대로
    expect(salesRow([day({ visits: 100 }), day({ visits: 102 })])?.dayAvg).toBe(101)
    // 0건·모르는 날은 분모에 들지 않는다: 2 ÷ 2 = 1
    expect(salesRow([day({ visits: 1 }), day({ visits: 1 }), day({ visits: 0 }), day({ visits: null })])?.dayAvg).toBe(1)
    // 4 ÷ 3 = 1.333… → 1.3, 5 ÷ 3 = 1.666… → 1.6(반올림이면 1.7)
    expect(salesRow([day({ visits: 2 }), day({ visits: 1 }), day({ visits: 1 })])?.dayAvg).toBe(1.3)
    expect(salesRow([day({ visits: 3 }), day({ visits: 1 }), day({ visits: 1 })])?.dayAvg).toBe(1.6)
  })

  it('AC-8014.1: 빈 칸(null)은 합에서 뺀다', () => {
    const row = salesRow([
      day({ visits: 50, newPatients: null, returnVisits: 40, total: 1_000_000 }),
      day({ visits: null, newPatients: 3, returnVisits: null, total: 900_000 }),
      day({ visits: 60, newPatients: 5, returnVisits: 50, total: null, roughTotal: null }),
    ])
    expect(row).toEqual({ total: 1_900_000, visits: 110, newPatients: 8, returnVisits: 90, dayAvg: 55, days: 2 })
  })

  it('AC-8014.1: 한 칸이 모든 날 비면 그 칸은 0이 아니라 null이고, 내원이 1 이상인 날이 없으면 하루 평균도 null이다', () => {
    const row = salesRow([day({ visits: null, newPatients: null, returnVisits: null, total: null, roughTotal: null }), day({ visits: 0, newPatients: null, returnVisits: null, total: 0 })])
    expect(row).toEqual({ total: 0, visits: 0, newPatients: null, returnVisits: null, dayAvg: null, days: 0 })
    expect(salesRow([day({ total: null, roughTotal: null })])?.total).toBeNull()
  })

  it('AC-8014.1: 날이 하나도 없으면 모두 null(줄 자체가 null)이다', () => {
    expect(salesRow([])).toBeNull()
  })

  it('AC-8014.1: 넘긴 줄을 바꾸지 않는다', () => {
    const days = [day(), day({ visits: 0 })]
    const copy = structuredClone(days)
    salesRow(days)
    expect(days).toEqual(copy)
  })
})
