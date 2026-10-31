import { describe, expect, it } from 'vitest'
import { niceScale } from './scale'

// 쌓은 막대의 눈금 (b2b-redesign REQ-205 AC-205.4, design.md '차트 부품' scale.ts, UI_GUIDE '차트' 눈금).
// 간격 = 최대 합계/4 이상인 가장 작은 {1, 2, 2.5, 5}×10ⁿ(1 이상), 최대 = 간격×4. 합계가 모두 0이면 0 한 줄

describe('AC-205.4: niceScale — 간격은 최대/4 이상인 가장 작은 {1, 2, 2.5, 5}×10ⁿ(1 이상), 최대 = 간격×4', () => {
  it.each<[number, number, number[]]>([
    [714, 800, [0, 200, 400, 600, 800]],
    [1, 4, [0, 1, 2, 3, 4]],
    [99, 100, [0, 25, 50, 75, 100]],
    [250, 400, [0, 100, 200, 300, 400]],
    [1001, 2000, [0, 500, 1000, 1500, 2000]],
  ])('AC-205.4: 최대 합계 %d → 최대 %d, 눈금 %j', (input, max, ticks) => {
    expect(niceScale(input)).toEqual({ max, ticks })
  })

  it('AC-205.4: 합계가 모두 0이면 0 한 줄이다', () => {
    expect(niceScale(0)).toEqual({ max: 0, ticks: [0] })
  })

  it('AC-205.4: 경계 — 최대/4가 후보와 같으면 그 후보다(800 → 간격 200, 400 → 간격 100, 4 → 간격 1)', () => {
    expect(niceScale(800)).toEqual({ max: 800, ticks: [0, 200, 400, 600, 800] })
    expect(niceScale(400)).toEqual({ max: 400, ticks: [0, 100, 200, 300, 400] })
    expect(niceScale(4)).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] })
  })

  it('AC-205.4: 2.5×10ⁿ도 후보다(9 → 간격 2.5, 최대 10 · 90 → 간격 25, 최대 100)', () => {
    expect(niceScale(9)).toEqual({ max: 10, ticks: [0, 2.5, 5, 7.5, 10] })
    expect(niceScale(90)).toEqual({ max: 100, ticks: [0, 25, 50, 75, 100] })
  })

  it('AC-205.4: 간격은 1 이상이다(0.5 → 간격 1, 최대 4)', () => {
    expect(niceScale(0.5)).toEqual({ max: 4, ticks: [0, 1, 2, 3, 4] })
  })

  it('AC-205.4: 큰 값도 간격 × 4가 최대다(12,000,000 → 간격 5,000,000, 최대 20,000,000)', () => {
    expect(niceScale(12_000_000)).toEqual({ max: 20_000_000, ticks: [0, 5_000_000, 10_000_000, 15_000_000, 20_000_000] })
  })

  it('AC-205.4: 0보다 작거나 숫자가 아니면 0 한 줄로 둔다(눈금을 지어내지 않는다)', () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(niceScale(bad), String(bad)).toEqual({ max: 0, ticks: [0] })
    }
  })
})
