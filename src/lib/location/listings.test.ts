import { describe, expect, it } from 'vitest'
import {
  FEW_LISTINGS_TEXT,
  MIN_LISTINGS_TO_COMPARE,
  compareListings,
  filterByPyeong,
  perPyeong,
  perPyeongOf,
  vsAverage,
  type ListingNumbers,
} from './listings'

// 매물 견주기(design.md 11절 listings.ts). 넓이는 저장 ㎡(소수 2자리), 금액은 원 정수.
// 평은 화면 평(area.ts m2ToPyeong — 0.01㎡ 안쪽에서 가장 큰 0.1평)이다: 99.17㎡ = 30평 · 132.23㎡ = 40평 · 66.11㎡ = 20평
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
  it('AC-7910.2: 평당 값 = 버림(값 ÷ 화면 평 m2ToPyeong)', () => {
    expect(perPyeong(12_100_000, 400)).toBe(100_000) // 400㎡ = 121평
    expect(perPyeong(3_375_000, 99.17)).toBe(112_500) // 99.17㎡ = 화면 30평(30평으로 적어 저장한 값)
    expect(perPyeong(3_000_000, 99.83)).toBe(99_337) // 99.83㎡ = 30.2평 → 3,000,000 ÷ 30.2 = 99,337.7
    expect(perPyeong(0, 99.17)).toBe(0)
  })

  it('AC-7910.2: 큰 금액도 원 정수로 버린다(9,999,999,999원 · 0.33㎡ = 0.1평)', () => {
    expect(perPyeong(9_999_999_999, 0.33)).toBe(99_999_999_990)
    expect(Number.isInteger(perPyeong(9_999_999_999, 999_999.99))).toBe(true)
  })

  it('AC-7910.2: 넓이가 0 이하·숫자 아님·0.1평 미만(0.32㎡)이거나 금액이 음수·소수면 RangeError다', () => {
    expect(() => perPyeong(1_000_000, 0)).toThrow(RangeError)
    expect(() => perPyeong(1_000_000, -1)).toThrow(RangeError)
    expect(() => perPyeong(1_000_000, Number.NaN)).toThrow(RangeError)
    expect(() => perPyeong(1_000_000, 0.32)).toThrow(RangeError)
    expect(() => perPyeong(-1, 99.17)).toThrow(RangeError)
    expect(() => perPyeong(1.5, 99.17)).toThrow(RangeError)
  })

  it('AC-7910.2: perPyeongOf는 값이나 넓이가 없거나 셀 수 없으면 null이다(위험 신호·견주기가 같이 씀)', () => {
    expect(perPyeongOf(3_375_000, 99.17)).toBe(112_500)
    expect(perPyeongOf(null, 99.17)).toBeNull()
    expect(perPyeongOf(3_375_000, null)).toBeNull()
    for (const area of [0, -1, 0.01, 0.32, Number.NaN]) expect(perPyeongOf(1_000_000, area), String(area)).toBeNull()
    for (const won of [-1, 1.5, Number.NaN]) expect(perPyeongOf(won, 99.17), String(won)).toBeNull()
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
    expect(result.rentAvg).toBe(112_500) // (112,500 + 100,000 + 125,000) ÷ 3
    expect(result.depositAvg).toBe(1_555_555) // (1,666,666 + 1,500,000 + 1,500,000) ÷ 3 버림
    expect(result.items.l1).toEqual({
      rent: { perPy: 112_500, vs: { pct: 0, text: '평균과 같아요' } },
      deposit: { perPy: 1_666_666, vs: { pct: 7, text: '저장한 매물 평균보다 7% 비싸요' } },
    })
    expect(result.items.l2).toEqual({
      rent: { perPy: 100_000, vs: { pct: -11, text: '저장한 매물 평균보다 11% 싸요' } },
      deposit: { perPy: 1_500_000, vs: { pct: -3, text: '저장한 매물 평균보다 3% 싸요' } },
    })
    expect(result.items.l3).toEqual({
      rent: { perPy: 125_000, vs: { pct: 11, text: '저장한 매물 평균보다 11% 비싸요' } },
      deposit: { perPy: 1_500_000, vs: { pct: -3, text: '저장한 매물 평균보다 3% 싸요' } },
    })
  })

  it('AC-7910.2: 저장한 매물이 1개면 평당 값만 보이고 견주지 않으며 안내 글이 나온다', () => {
    const result = compareListings([L1])
    expect(result).toEqual({
      notice: FEW_LISTINGS_TEXT,
      rentAvg: null,
      depositAvg: null,
      items: { l1: { rent: { perPy: 112_500, vs: null }, deposit: { perPy: 1_666_666, vs: null } } },
    })
    expect(compareListings([])).toEqual({ notice: FEW_LISTINGS_TEXT, rentAvg: null, depositAvg: null, items: {} })
  })

  it('AC-7910.2: 넓이·월세가 있는 매물만 월세 평균에 들고, 보증금은 따로 같은 셈이다', () => {
    const noRent = listing('n1', 99.17, null, 30_000_000)
    const noArea = listing('n2', null, 9_000_000, 90_000_000)
    const result = compareListings([L1, L2, noRent, noArea])
    expect(result.notice).toBeNull()
    expect(result.rentAvg).toBe(106_250) // L1·L2만: (112,500 + 100,000) ÷ 2
    expect(result.items.l1.rent).toEqual({ perPy: 112_500, vs: { pct: 5, text: '저장한 매물 평균보다 5% 비싸요' } })
    expect(result.items.l2.rent).toEqual({ perPy: 100_000, vs: { pct: -5, text: '저장한 매물 평균보다 5% 싸요' } })
    expect(result.items.n1.rent).toBeNull()
    expect(result.items.n2).toEqual({ rent: null, deposit: null })
    // 보증금: L1·L2·n1 셋((1,666,666 + 1,500,000 + 1,000,000) ÷ 3 버림)
    expect(result.items.n1.deposit?.perPy).toBe(1_000_000)
    expect(result.depositAvg).toBe(1_388_888)
  })

  it('AC-7910.2: 견줄 수 있는 매물이 한 값에서 2개 미만이면 그 값만 견주지 않는다', () => {
    const result = compareListings([listing('a', 99.17, 3_375_000, null), listing('b', 132.23, null, 60_000_000), listing('c', 66.11, null, 30_000_000)])
    expect(result.notice).toBeNull()
    expect(result.rentAvg).toBeNull()
    expect(result.items.a.rent).toEqual({ perPy: 112_500, vs: null })
    expect(result.depositAvg).toBe(1_500_000) // b·c: (1,500,000 + 1,500,000) ÷ 2
    expect(result.items.b.deposit?.vs?.text).toBe('평균과 같아요')
  })

  it('AC-7910.2: 0.1평이 안 되는 넓이(0.01㎡)의 매물은 평당 값을 셀 수 없어 견주기에서 빠진다(오류 없음)', () => {
    const result = compareListings([L1, L2, listing('t', 0.01, 3_000_000, 10_000_000)])
    expect(result.items.t).toEqual({ rent: null, deposit: null })
    expect(result.rentAvg).toBe(106_250)
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

  it('AC-7910.2: ○평~○평은 양 끝을 넣고, 화면에 보이는 평(m2ToPyeong)으로 거른다', () => {
    // e1 99.16㎡ = 29.9평 · e2 132.24㎡ = 40평(화면 '40평 (132.24㎡)')이라 ~40평에 든다
    expect(ids(filterByPyeong(rows, { from: 30, to: 40 }))).toEqual(['l1', 'l2', 'e2'])
    expect(ids(filterByPyeong(rows, { from: 30, to: null }))).toEqual(['l1', 'l2', 'e2'])
    expect(ids(filterByPyeong(rows, { from: null, to: 30 }))).toEqual(['l1', 'l3', 'e1'])
    expect(ids(filterByPyeong(rows, { from: 20, to: 20 }))).toEqual(['l3'])
  })

  it('AC-7910.2: 소수 평도 화면 평으로 견준다(99.82㎡ = 30.1평 · 99.83㎡·99.84㎡ = 30.2평)', () => {
    const list = [listing('a', 99.82, 1, 1), listing('b', 99.83, 1, 1), listing('c', 99.84, 1, 1)]
    expect(ids(filterByPyeong(list, { from: 30.2, to: null }))).toEqual(['b', 'c'])
    expect(ids(filterByPyeong(list, { from: null, to: 30.2 }))).toEqual(['a', 'b', 'c'])
    expect(ids(filterByPyeong(list, { from: null, to: 30.1 }))).toEqual(['a'])
  })

  it('AC-7910.2: 하나라도 정하면 넓이 없는 매물은 빠진다', () => {
    expect(ids(filterByPyeong(rows, { from: 1, to: null }))).not.toContain('n')
  })
})
