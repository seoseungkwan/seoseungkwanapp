import { describe, expect, it } from 'vitest'
import type { Delta } from '@/types/analysis'
import { formatCount, formatDelta, formatRate, percentOf, truncatedOne } from './format'

// 차트 부품의 보이는 숫자 글자 (b2b-redesign REQ-205 AC-205.1, design.md '차트 부품'·'비율 표시', UI_GUIDE '차트').
// 보이는 숫자는 버림이다(반올림 안 함, plan.md §5). 부동소수 오차를 막으려고 아주 작은 값을 더한 뒤 자른다.
// percentOf는 그리는 위치(%)라 버림 규칙과 상관없이 Number(x.toFixed(2))다

const MINUS = '−' // 빼기 기호 −
const change = (diff: number, pct: number | null): Delta => ({ kind: 'change', diff, pct })

describe('AC-205.1: formatCount — 세 자리마다 쉼표', () => {
  it.each<[number, string]>([
    [714, '714'],
    [12000000, '12,000,000'],
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [1234567, '1,234,567'],
  ])('AC-205.1: formatCount(%s) = %s', (n, text) => {
    expect(formatCount(n)).toBe(text)
  })
})

describe('AC-205.1: formatRate — 0~1 비율을 %로, 소수 첫째 자리까지 버림(반올림 안 함)', () => {
  it.each<[number, string]>([
    [0.18347, '18.3'],
    [0.29, '29.0'], // 0.29 × 100 = 28.999… → 오차 보정이 없으면 '28.9'
    [1, '100.0'],
    [0, '0.0'],
    [0.18399, '18.3'], // 반올림이면 18.4
    [0.0999, '9.9'],
    [0.57, '57.0'], // 0.57 × 100 = 56.999…
    [131 / 714, '18.3'],
  ])('AC-205.1: formatRate(%s) = %s', (r, text) => {
    expect(formatRate(r)).toBe(text)
  })
})

describe('AC-3707.2: truncatedOne — 소수 첫째 자리까지 버린 글자(부호 없음)를 내보낸다', () => {
  it.each<[number, string]>([
    [18.347, '18.3'],
    [0.29 * 100, '29.0'], // 28.999… → 오차 보정
    [9.99, '9.9'], // 반올림이면 10.0
    [3.47, '3.4'],
    [-3.47, '3.4'], // 부호 없음
    [12.39, '12.3'],
    [0.09, '0.0'],
    [0, '0.0'],
    [1234.56, '1234.5'], // 쉼표 없음
  ])('AC-3707.2: truncatedOne(%s) = %s', (x, text) => {
    expect(truncatedOne(x)).toBe(text)
  })

  it('AC-3707.2: formatRate·formatDelta가 쓰는 글자와 같다(동작 그대로)', () => {
    expect(formatRate(0.18347)).toBe(truncatedOne(18.347))
    expect(formatDelta(change(-0.0027, null), '%p').text).toBe(`${truncatedOne(-0.27)}%p`)
  })
})

describe('AC-205.1: formatDelta — 증감 방향·글자·화면 읽기 글자', () => {
  it('AC-205.1: change·diff > 0 → up, 늘어남, "17명 (+2.4%)"(pct 2.439)', () => {
    expect(formatDelta(change(17, 2.439), '명')).toEqual({ dir: 'up', text: '17명 (+2.4%)', srText: '늘어남' })
  })

  it('AC-205.1: change·diff < 0 → down, 줄어듦, "12명 (−2.1%)"(빼기 기호 U+2212, 버림)', () => {
    const view = formatDelta(change(-12, -2.19), '명')
    expect(view).toEqual({ dir: 'down', text: `12명 (${MINUS}2.1%)`, srText: '줄어듦' })
    expect(view.text).not.toContain('-')
  })

  it('AC-205.1: pct도 반올림하지 않고 버린다 — 신환 5/126 → "+3.9%"(반올림이면 +4.0%)', () => {
    expect(formatDelta(change(5, (5 / 126) * 100), '명').text).toBe('5명 (+3.9%)')
    expect(formatDelta(change(17, (17 / 697) * 100), '명').text).toBe('17명 (+2.4%)')
    expect(formatDelta(change(12, (12 / 571) * 100), '명').text).toBe('12명 (+2.1%)')
  })

  it('AC-205.1: pct가 null이면 괄호 부분이 없다', () => {
    expect(formatDelta(change(3, null), '명')).toEqual({ dir: 'up', text: '3명', srText: '늘어남' })
    expect(formatDelta(change(-3, null), '건')).toEqual({ dir: 'down', text: '3건', srText: '줄어듦' })
  })

  it('AC-205.1: 큰 수는 쉼표, 단위 "건"', () => {
    expect(formatDelta(change(1234, 10), '건').text).toBe('1,234건 (+10.0%)')
  })

  it('AC-205.1: change·diff = 0 → flat, "변화 없음"(화면 읽기 글자 따로 없음)', () => {
    expect(formatDelta(change(0, 0), '명')).toEqual({ dir: 'flat', text: '변화 없음', srText: '' })
    expect(formatDelta(change(0, null), '%p')).toEqual({ dir: 'flat', text: '변화 없음', srText: '' })
  })

  it.each<[Delta, string]>([
    [{ kind: 'new' }, '새로 생김'],
    [{ kind: 'in-progress' }, '집계 중'],
    [{ kind: 'unavailable' }, '비교할 수 없음'],
  ])('AC-205.1: %o → dir none, "%s"', (delta, text) => {
    for (const unit of ['명', '건', '%p'] as const) {
      expect(formatDelta(delta, unit)).toEqual({ dir: 'none', text, srText: '' })
    }
  })

  it('AC-205.1: unit "%p"면 diff는 0~1 비율 차이 — 0.0027 → "0.2%p", pct는 쓰지 않는다', () => {
    expect(formatDelta(change(0.0027, 12.3), '%p')).toEqual({ dir: 'up', text: '0.2%p', srText: '늘어남' })
  })

  it('AC-205.1: "%p" 줄어듦 — −0.0027 → "0.2%p"(부호 없이), 줄어듦', () => {
    expect(formatDelta(change(-0.0027, null), '%p')).toEqual({ dir: 'down', text: '0.2%p', srText: '줄어듦' })
  })

  it('AC-205.1: "%p"도 버림 — 신환율 131/714 − 126/697(0.2698…%p) → "0.2%p"(반올림이면 0.3%p)', () => {
    expect(formatDelta(change(131 / 714 - 126 / 697, null), '%p').text).toBe('0.2%p')
    expect(formatDelta(change(0.0057, null), '%p').text).toBe('0.5%p') // 0.0057 × 100 = 0.5700…01 → 오차에도 0.5
    expect(formatDelta(change(0.29, null), '%p').text).toBe('29.0%p') // 28.999… → 오차 보정
  })
})

describe('AC-205.1: percentOf — 그리는 위치 %(0~100으로 자르고 Number(x.toFixed(2))), max ≤ 0이면 0', () => {
  it.each<[number, number, number]>([
    [86, 402, 21.39],
    [74, 402, 18.41],
    [714, 800, 89.25],
    [1, 3, 33.33],
    [800, 800, 100],
  ])('AC-205.1: percentOf(%s, %s) = %s', (v, max, pct) => {
    expect(percentOf(v, max)).toBe(pct)
  })

  it('AC-205.1: 값 0은 0', () => {
    expect(percentOf(0, 402)).toBe(0)
  })

  it('AC-205.1: max가 0 이하이면 0', () => {
    expect(percentOf(5, 0)).toBe(0)
    expect(percentOf(0, 0)).toBe(0)
    expect(percentOf(5, -3)).toBe(0)
  })

  it('AC-205.1: 넘치면 100, 음수면 0으로 자른다', () => {
    expect(percentOf(500, 402)).toBe(100)
    expect(percentOf(-5, 100)).toBe(0)
  })
})
