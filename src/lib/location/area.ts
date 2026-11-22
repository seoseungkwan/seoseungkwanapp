import { commaText } from './money'

// 넓이 (specs/location design.md 5절, AC-7905.5). 1평 = 400/121㎡ → 평 = ㎡ × 121 ÷ 400.
// 저장은 ㎡ 소수 2자리 버림(numeric(8,2)), 화면은 `{평 소수 1자리 버림}평 ({㎡ 소수 2자리 버림}㎡)`.
// 셈은 0.01㎡ 수·0.1평 수(정수)로 한다. 부동소수 오차(99.83 × 100 = 9982.99…)는 버리기 전에 EPS로 받는다.
// 평으로 적은 값은 저장할 때 0.01㎡ 미만이 버려진다(30평 → 99.17㎡, 그대로 되돌리면 29.99…평 → 29.9평).
// 그래서 ㎡ → 평은 '저장 ㎡ 이상 ~ 0.01㎡ 더한 값 미만'(버리기 전 값이 있던 자리)에서 가장 큰 0.1평으로 버린다:
// 평으로 적은 값은 적은 평 그대로 보이고, 그런 평이 없는 ㎡(㎡로 적은 값)는 그 ㎡에서 바로 버린 값과 같다

export type AreaUnit = 'pyeong' | 'm2'

/** 저장 칸 numeric(8,2)에 들어가는 가장 큰 ㎡ */
export const MAX_M2 = 999_999.99

const EPS = 1e-6

function checkArea(n: number): void {
  if (!Number.isFinite(n) || n < 0) throw new RangeError('넓이는 0 이상 숫자여야 해요')
}

/** ㎡ → 0.01㎡ 수(버림) */
const m2Hundredths = (m2: number) => Math.floor(m2 * 100 + EPS)

/** 0.01㎡ 수 h → 0.1평 수: [h, h + 1) × 121 ÷ 4,000 안의 가장 큰 정수(오른쪽 끝은 들지 않음) */
function pyeongTenths(h: number): number {
  const top = (h + 1) * 121
  if (!Number.isSafeInteger(top)) throw new RangeError('넓이가 너무 커요')
  return Math.floor((top - 1) / 4000)
}

/** 정수 n ÷ 10^digits → 천 단위 쉼표, 끝의 0을 뺀 글자 */
function decimalText(n: number, digits: number): string {
  const scale = 10 ** digits
  const frac = String(n % scale).padStart(digits, '0').replace(/0+$/, '')
  const int = commaText(Math.floor(n / scale))
  return frac ? `${int}.${frac}` : int
}

/** 평 → ㎡(소수 2자리 버림). 30.2평 → 99.83㎡ */
export function pyeongToM2(pyeong: number): number {
  checkArea(pyeong)
  return Math.floor((pyeong * 40_000) / 121 + EPS) / 100
}

/** ㎡ → 평(소수 1자리 버림, 평으로 적어 저장한 값은 적은 평 그대로). 99.83㎡ → 30.2평 */
export function m2ToPyeong(m2: number): number {
  checkArea(m2)
  return pyeongTenths(m2Hundredths(m2)) / 10
}

/** 입력(평 또는 ㎡) → 저장할 ㎡(소수 2자리 버림). 0 이하·숫자 아님·버린 뒤 0·MAX_M2 넘음은 null */
export function toStoredM2(value: number, unit: AreaUnit): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  const m2 = unit === 'pyeong' ? pyeongToM2(value) : m2Hundredths(value) / 100
  return m2 > 0 && m2 <= MAX_M2 ? m2 : null
}

/** ㎡ → `30.2평 (99.83㎡)` */
export function areaText(m2: number): string {
  checkArea(m2)
  const h = m2Hundredths(m2)
  return `${decimalText(pyeongTenths(h), 1)}평 (${decimalText(h, 2)}㎡)`
}
