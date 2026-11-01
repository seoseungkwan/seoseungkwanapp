import { formatCount } from '@/components/charts/format'

// 매출 화면의 금액 글자(spec revenue design.md 9절, AC-008.1). 큰 금액은 만 원 아래를 버린다(반올림 없음), 화면 읽기 표는 원 단위 그대로다.
// 쉼표와 빼기 기호(U+2212)는 charts/format의 formatCount가 맡는다

const MINUS = '−'
const WON_PER_MAN = 10_000
const MAN_PER_EOK = 10_000

/** "55,950원" */
export function formatWon(n: number): string {
  return `${formatCount(n)}원`
}

/** "1억 6,248만 원" · "6,728만 원" · "2억 원". 1만 원 미만은 "0만 원"이 아니라 formatWon */
export function formatManWon(n: number): string {
  const man = Math.trunc(Math.abs(n) / WON_PER_MAN)
  if (man === 0) return formatWon(n)
  const eok = Math.trunc(man / MAN_PER_EOK)
  const rest = man % MAN_PER_EOK
  const sign = n < 0 ? MINUS : ''
  if (eok === 0) return `${sign}${formatCount(rest)}만 원`
  return rest === 0 ? `${sign}${eok}억 원` : `${sign}${eok}억 ${formatCount(rest)}만 원`
}
