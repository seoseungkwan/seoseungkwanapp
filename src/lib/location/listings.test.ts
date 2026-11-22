import { describe, expect, it } from 'vitest'
import {
  FEW_LISTINGS_TEXT,
  MIN_LISTINGS_TO_COMPARE,
  compareListings,
  filterByPyeong,
  perPyeong,
  vsAverage,
  type ListingNumbers,
} from './listings'

// 매물 견주기(design.md 11절 listings.ts). 넓이는 저장 ㎡(소수 2자리), 1평 = 400/121㎡, 금액은 원 정수
const listing = (id: string, areaM2: number | null, rent: number | null, deposit: number | null): ListingNumbers => ({
  id,
  areaM2,
  rent,
  deposit,
})
// 30평·40평·20평으로 적어 ㎡로 버려 저장한 값(99.17·132.23·66.11㎡)
const L1 = listing('l1', 99.17, 3_375_000, 50_000_000)
const L2 = listing('l2', 132.23, 4_000_000, 60_000_000)
const L3 = listing('l3', 66.11, 2_500_000, 30_000_000)

describe('AC-7910.2 perPyeong', () => {
  it('AC-7910.2: 평당 값 = 버림(값 ÷ 평), 평 = ㎡ × 121 ÷ 400', () => {
    expect(perPyeong(12_100_000, 400)).toBe(100_000) // 400㎡ = 121평
    expect(perPyeong(3_375_000, 99.17)).toBe(112_504) // 99.17㎡ = 29.998925평
    expect(perPyeong(3_000_000, 99.83)).toBe(99_342)
    expect(perPyeong(0, 99.17)).toBe(0)
  })

  it('AC-7910.2: 큰 금액도 원 정수로 버린다(9,999,999,999원 · 0.01㎡)', () => {
    expect(perPyeong(9_999_999_999, 0.01)).toBe(Math.floor((9_999_999_999 * 40000) / 121))
    expect(Number.isInteger(perPyeong(9_999_999_999, 999_999.99))).toBe(true)
  })

  it('AC-7910.2: 넓이가 0 이하·숫자 아님이거나 금액이 음수·소수면 RangeError다', () => {
    expect(() => perPyeong(1_000_000, 0)).toThrow(RangeError)
    expect(() => perPyeong(1_000_000, -1)).toThrow(RangeError)
    expect(() => perPyeong(1_000_000, Number.NaN)).toThrow(RangeError)
    expect(() => perPyeong(-1, 99.17)).toThrow(RangeError)
    expect(() => perPyeong(1.5, 99.17)).toThrow(RangeError)
  })
})

describe('AC-7910.2 vsAverage', () => {
  it('AC-7910.2: 차이 % = 버림((값 − 평균) × 100 ÷ 평균) → 비싸요·싸요', () => {
    expect(vsAverage(112, 100)).toEqual({ pct: 12, text: '저장한 매물 평균보다 12% 비싸요' })
    expect(vsAverage(88, 100)).toEqual({ pct: -12, text: '저장한 매물 평균보다 12% 싸요' })
    expect(vsAverage(875, 1000)).toEqual({ pct: -12, text: '저장한 매물 평균보다 12% 싸요' }) // −12.5 → 12
    expect(vsAverage(1129, 1000)).toEqual({ pct: 12, text: '저장한 매물 평균보다 12% 비싸요' }) // 12.9 → 12
    expect(vsAverage(1010, 1000)).toEqual({ pct: 1, text: '저장한 매물 평균보다 1% 비싸요' })
    expect(vsAverage(990, 1000)).toEqual({ pct: -1, text: '저장한 매물 평균보다 1% 싸요' })
  })

  it('AC-7910.2: 차이가 1% 안(|n| < 1)이면 평균과 같아요다(위·아래 같게)', () => {
    expect(vsAverage(100, 100)).toEqual({ pct: 0, text: '평균과 같아요' })
    expect(vsAverage(1009, 1000)).toEqual({ pct: 0, text: '평균과 같아요' })
    expect(vsAverage(991, 1000)).toEqual({ pct: 0, text: '평균과 같아요' })
    expect(Object.is(vsAverage(991, 1000)?.pct, 0)).toBe(true) // −0이 아니다
  })

  it('AC-7910.2: 평균이 0이면 값도 0일 때만 같아요이고, 아니면 견주지 않는다', () => {
    expect(vsAverage(0, 0)).toEqual({ pct: 0, text: '평균과 같아요' })
    expect(vsAverage(5, 0)).toBeNull()
  })
})

describe('AC-7910.2 compareListings', () => {
  it('AC-7910.2: 2개 이상일 때 견주고, 2개 미만이면 안내 글만 보인다', () => {
    expect(MIN_LISTINGS_TO_COMPARE).toBe(2)
    expect(FEW_LISTINGS_TEXT).toBe('매물을 2개 이상 저장하면 서로 견줘 드려요')
  })

  it('AC-7910.2: 매물마다 평당 월세·보증금을 저장한 매물 모두의 평균(버림)과 견준다', () => {
    const result = compareListings([L1, L2, L3])
    expect(result.notice).toBeNull()
    expect(result.rentAvg).toBe(112_505) // (112,504 + 100,001 + 125,010) ÷ 3 버림
    expect(result.depositAvg).toBe(1_555_623)
    expect(result.items.l1).toEqual({
      rent: { perPy: 112_504, vs: { pct: 0, text: '평균과 같아요' } },
      deposit: { perPy: 1_666_726, vs: { pct: 7, text: '저장한 매물 평균보다 7% 비싸요' } },
    })
    expect(result.items.l2).toEqual({
      rent: { perPy: 100_001, vs: { pct: -11, text: '저장한 매물 평균보다 11% 싸요' } },
      deposit: { perPy: 1_500_015, vs: { pct: -3, text: '저장한 매물 평균보다 3% 싸요' } },
    })
    expect(result.items.l3).toEqual({
      rent: { perPy: 125_010, vs: { pct: 11, text: '저장한 매물 평균보다 11% 비싸요' } },
      deposit: { perPy: 1_500_129, vs: { pct: -3, text: '저장한 매물 평균보다 3% 싸요' } },
    })
  })

  it('AC-7910.2: 저장한 매물이 1개면 평당 값만 보이고 견주지 않으며 안내 글이 나온다', () => {
    const result = compareListings([L1])
    expect(result).toEqual({
      notice: FEW_LISTINGS_TEXT,
      rentAvg: null,
      depositAvg: null,
      items: { l1: { rent: { perPy: 112_504, vs: null }, deposit: { perPy: 1_666_726, vs: null } } },
    })
    expect(compareListings([])).toEqual({ notice: FEW_LISTINGS_TEXT, rentAvg: null, depositAvg: null, items: {} })
  })

  it('AC-7910.2: 넓이·월세가 있는 매물만 월세 평균에 들고, 보증금은 따로 같은 셈이다', () => {
    const noRent = listing('n1', 99.17, null, 30_000_000)
    const noArea = listing('n2', null, 9_000_000, 90_000_000)
    const result = compareListings([L1, L2, noRent, noArea])
    expect(result.notice).toBeNull()
    expect(result.rentAvg).toBe(106_252) // L1·L2만: (112,504 + 100,001) ÷ 2 버림
    expect(result.items.l1.rent).toEqual({ perPy: 112_504, vs: { pct: 5, text: '저장한 매물 평균보다 5% 비싸요' } })
    expect(result.items.l2.rent).toEqual({ perPy: 100_001, vs: { pct: -5, text: '저장한 매물 평균보다 5% 싸요' } })
    expect(result.items.n1.rent).toBeNull()
    expect(result.items.n2).toEqual({ rent: null, deposit: null })
    // 보증금: L1·L2·n1 셋((1,666,726 + 1,500,015 + 1,000,035) ÷ 3 버림)
    expect(result.items.n1.deposit?.perPy).toBe(1_000_035)
    expect(result.depositAvg).toBe(1_388_925)
  })

  it('AC-7910.2: 견줄 수 있는 매물이 한 값에서 2개 미만이면 그 값만 견주지 않는다', () => {
    const result = compareListings([listing('a', 99.17, 3_375_000, null), listing('b', 132.23, null, 60_000_000), listing('c', 66.11, null, 30_000_000)])
    expect(result.notice).toBeNull()
    expect(result.rentAvg).toBeNull()
    expect(result.items.a.rent).toEqual({ perPy: 112_504, vs: null })
    expect(result.depositAvg).toBe(1_500_072) // b·c: (1,500,015 + 1,500,129) ÷ 2 버림
    expect(result.items.b.deposit?.vs?.text).toBe('평균과 같아요')
  })

  it('AC-7910.2: 매물이 여럿이어도 견줄 값(넓이와 월세·보증금)이 2개 미만이면 안내 글이 나온다', () => {
    const result = compareListings([listing('a', null, 3_000_000, 50_000_000), listing('b', 99.17, 3_375_000, 50_000_000)])
    expect(result.notice).toBe(FEW_LISTINGS_TEXT)
    expect(result.rentAvg).toBeNull()
    expect(result.depositAvg).toBeNull()
  })
})

describe('AC-7910.2 filterByPyeong', () => {
  const rows = [L1, L2, L3, listing('n', null, 1_000_000, null), listing('e1', 99.16, 1, 1), listing('e2', 132.24, 1, 1)]
  const ids = (list: readonly ListingNumbers[]) => list.map((l) => l.id)

  it('AC-7910.2: 둘 다 비우면 넓이 없는 매물까지 모두다', () => {
    expect(filterByPyeong(rows, { from: null, to: null })).toBe(rows)
  })

  it('AC-7910.2: ○평~○평은 양 끝을 넣고, 평으로 적어 버려 저장한 ㎡도 그 평으로 본다', () => {
    expect(ids(filterByPyeong(rows, { from: 30, to: 40 }))).toEqual(['l1', 'l2'])
    expect(ids(filterByPyeong(rows, { from: 30, to: null }))).toEqual(['l1', 'l2', 'e2'])
    expect(ids(filterByPyeong(rows, { from: null, to: 30 }))).toEqual(['l1', 'l3', 'e1'])
    expect(ids(filterByPyeong(rows, { from: 20, to: 20 }))).toEqual(['l3'])
  })

  it('AC-7910.2: 소수 평(30.2평 = 99.83㎡)도 같은 버림으로 견준다', () => {
    const list = [listing('a', 99.82, 1, 1), listing('b', 99.83, 1, 1), listing('c', 99.84, 1, 1)]
    expect(ids(filterByPyeong(list, { from: 30.2, to: null }))).toEqual(['b', 'c'])
    expect(ids(filterByPyeong(list, { from: null, to: 30.2 }))).toEqual(['a', 'b'])
  })

  it('AC-7910.2: 하나라도 정하면 넓이 없는 매물은 빠진다', () => {
    expect(ids(filterByPyeong(rows, { from: 1, to: null }))).not.toContain('n')
  })
})
