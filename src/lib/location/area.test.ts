import { describe, expect, it } from 'vitest'
import { areaText, m2ToPyeong, MAX_M2, pyeongToM2, toStoredM2 } from './area'

// 넓이 (specs/location design.md 5절, AC-7905.5). 1평 = 400/121㎡, 평 = ㎡ × 121 ÷ 400.
// 저장은 ㎡ 소수 2자리 버림(numeric(8,2)), 화면은 `{평 소수 1자리 버림}평 ({㎡ 소수 2자리 버림}㎡)`
describe('area — 평·㎡ (AC-7905.5)', () => {
  it('AC-7905.5: 30.2평은 99.83㎡로 저장되고 `30.2평 (99.83㎡)`로 보인다', () => {
    expect(pyeongToM2(30.2)).toBe(99.83) // 30.2 × 400 ÷ 121 = 99.8347… → 버림
    expect(areaText(99.83)).toBe('30.2평 (99.83㎡)')
    expect(areaText(30.2 * 400 / 121)).toBe('30.2평 (99.83㎡)') // 버리기 전 값도 같다
  })

  it('AC-7905.5: 평 → ㎡는 소수 2자리 버림이다(나눠떨어지는 값은 그대로)', () => {
    expect(pyeongToM2(30)).toBe(99.17) // 99.1735…
    expect(pyeongToM2(1)).toBe(3.3) // 3.3057…
    expect(pyeongToM2(121)).toBe(400)
    expect(pyeongToM2(12.1)).toBe(40) // 12.1 × 400 ÷ 121 = 40 (부동소수 39.99… 아님)
  })

  it('AC-7905.5: ㎡ → 평은 소수 1자리 버림이다', () => {
    expect(m2ToPyeong(100)).toBe(30.2) // 30.25
    expect(m2ToPyeong(33)).toBe(9.9) // 9.9825
    expect(m2ToPyeong(400)).toBe(121)
    expect(m2ToPyeong(12345.67)).toBe(3734.5) // 3,734.565…
  })

  it('AC-7905.5: 평으로 적은 값(소수 1자리)은 ㎡로 버려 저장한 뒤에도 같은 평으로 보인다', () => {
    // 30평 → 99.17㎡ → 99.17 × 121 ÷ 400 = 29.9989… 이지만 저장할 때 버린 0.01㎡ 안쪽이라 30평이다
    expect(m2ToPyeong(pyeongToM2(30))).toBe(30)
    expect(areaText(pyeongToM2(30))).toBe('30평 (99.17㎡)')
    for (let tenths = 1; tenths <= 20_000; tenths++) {
      const pyeong = tenths / 10
      expect(m2ToPyeong(pyeongToM2(pyeong))).toBe(pyeong)
    }
  })

  it('AC-7905.5: ㎡로 적은 값은 그 ㎡에서 평을 버린다(평으로 적은 값이 그 ㎡가 될 수 없을 때)', () => {
    expect(areaText(99.8)).toBe('30.1평 (99.8㎡)') // 30.1895
    expect(areaText(39.99)).toBe('12평 (39.99㎡)') // 12.0969… (12.1평은 40㎡)
    expect(areaText(3.29)).toBe('0.9평 (3.29㎡)') // 0.9952… (1평은 3.3㎡)
  })

  it('AC-7905.5: 글자는 천 단위 쉼표, 끝의 0은 뺀다, ㎡ 소수 셋째 자리부터 버린다', () => {
    expect(areaText(12345.67)).toBe('3,734.5평 (12,345.67㎡)')
    expect(areaText(400)).toBe('121평 (400㎡)')
    expect(areaText(100.05)).toBe('30.2평 (100.05㎡)')
    expect(areaText(99.839)).toBe('30.2평 (99.83㎡)')
    expect(areaText(0)).toBe('0평 (0㎡)')
  })

  it('AC-7905.5: 숫자 아님·음수 넓이는 글자로 바꾸지 않는다', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(() => areaText(bad)).toThrow(RangeError)
      expect(() => m2ToPyeong(bad)).toThrow(RangeError)
      expect(() => pyeongToM2(bad)).toThrow(RangeError)
    }
    expect(() => areaText(1e20)).toThrow(RangeError) // 정수 셈이 안전한 범위 밖
  })

  it('AC-7905.5: 저장할 ㎡는 평·㎡ 가운데 고른 단위에서 소수 2자리 버림, 0 이하·저장 칸(numeric(8,2)) 밖은 null', () => {
    expect(toStoredM2(30.2, 'pyeong')).toBe(99.83)
    expect(toStoredM2(99.839, 'm2')).toBe(99.83)
    expect(toStoredM2(MAX_M2, 'm2')).toBe(999_999.99)
    expect(MAX_M2).toBe(999_999.99)
    expect(toStoredM2(1_000_000, 'm2')).toBeNull()
    expect(toStoredM2(302_500, 'pyeong')).toBeNull() // 1,000,000㎡
    expect(toStoredM2(0, 'm2')).toBeNull()
    expect(toStoredM2(0.004, 'm2')).toBeNull() // 버리면 0㎡
    expect(toStoredM2(-3, 'pyeong')).toBeNull()
    expect(toStoredM2(Number.NaN, 'm2')).toBeNull()
    expect(toStoredM2(Number.POSITIVE_INFINITY, 'pyeong')).toBeNull()
  })
})
