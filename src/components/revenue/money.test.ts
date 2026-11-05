// 금액 글자(TASK-8, REQ-008 · AC-008.1). 숫자는 모두 가짜다
import { describe, expect, it } from 'vitest'
import { formatManWon, formatWon } from './money'

describe('AC-008.1 큰 금액은 만 원 아래를 버린다', () => {
  it.each([
    [162_480_350, '1억 6,248만 원'],
    [67_284_150, '6,728만 원'],
    [200_000_000, '2억 원'],
    [200_009_999, '2억 원'],
    [100_010_000, '1억 1만 원'],
    [10_000, '1만 원'],
    [19_999, '1만 원'],
  ])('AC-008.1 %d → %s (반올림 없음)', (won, text) => {
    expect(formatManWon(won)).toBe(text)
  })

  it.each([
    [9_999, '9,999원'],
    [1, '1원'],
    [0, '0원'],
  ])('AC-008.1 1만 원 미만 %d는 "0만 원"이 아니라 %s', (won, text) => {
    expect(formatManWon(won)).toBe(text)
  })
})

describe('AC-008.1 원 단위 글자', () => {
  it.each([
    [55_950, '55,950원'],
    [162_480_350, '162,480,350원'],
    [0, '0원'],
  ])('AC-008.1 %d → %s', (won, text) => {
    expect(formatWon(won)).toBe(text)
  })
})

describe('AC-008.4 빼기는 U+2212다', () => {
  it('AC-008.4 음수에도 같은 글자 모양이고 만 원 아래는 0 쪽으로 버린다', () => {
    expect(formatWon(-5_000)).toBe('−5,000원')
    expect(formatManWon(-5_000)).toBe('−5,000원')
    expect(formatManWon(-162_480_350)).toBe('−1억 6,248만 원')
  })
})
