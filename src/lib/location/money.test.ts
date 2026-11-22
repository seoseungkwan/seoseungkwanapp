import { describe, expect, it } from 'vitest'
import { wonText } from './money'

// 돈 글자 (specs/location design.md 5절, AC-7905.5). 금액은 원 단위 정수다.
// 10,000원으로 나눠떨어지고 1,000,000원 이상이면 `n억 m만 원`(0인 쪽 뺌), 아니면 `#,###원`
describe('wonText — 돈 글자 (AC-7905.5)', () => {
  it('AC-7905.5: 1억 5,000만 원 · 112,500원 · 0원', () => {
    expect(wonText(150_000_000)).toBe('1억 5,000만 원')
    expect(wonText(112_500)).toBe('112,500원')
    expect(wonText(0)).toBe('0원')
  })

  it('AC-7905.5: 억·만 가운데 0인 쪽은 뺀다', () => {
    expect(wonText(100_000_000)).toBe('1억 원')
    expect(wonText(50_000_000)).toBe('5,000만 원')
    expect(wonText(3_400_000)).toBe('340만 원')
    expect(wonText(1_234_560_000_000)).toBe('12,345억 6,000만 원')
  })

  it('AC-7905.5: 100만 원 경계 — 1,000,000원부터 만 원 글자, 그 아래는 나눠떨어져도 #,###원', () => {
    expect(wonText(1_000_000)).toBe('100만 원')
    expect(wonText(990_000)).toBe('990,000원')
    expect(wonText(10_000)).toBe('10,000원')
  })

  it('AC-7905.5: 10,000원으로 나눠떨어지지 않으면 크더라도 #,###원', () => {
    expect(wonText(1_005_000)).toBe('1,005,000원')
    expect(wonText(150_000_001)).toBe('150,000,001원')
    expect(wonText(9_999_999_999)).toBe('9,999,999,999원')
    expect(wonText(999)).toBe('999원')
  })

  it('AC-7905.5: 음수(예: 대출이 더 많은 내 돈)는 같은 모양 앞에 빼기 표시 −(U+2212)', () => {
    expect(wonText(-5_000_000)).toBe('−500만 원')
    expect(wonText(-150_000_000)).toBe('−1억 5,000만 원')
    expect(wonText(-112_500)).toBe('−112,500원')
    expect(wonText(-0)).toBe('0원')
  })

  it('AC-7905.5: 소수 금액·숫자 아님·안전한 정수 밖은 거부한다', () => {
    for (const bad of [1.5, 112_500.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2 ** 53]) {
      expect(() => wonText(bad)).toThrow(RangeError)
    }
  })
})
