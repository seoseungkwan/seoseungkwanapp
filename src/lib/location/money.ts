// 돈 글자 (specs/location design.md 5절, AC-7905.5). 금액은 원 단위 정수다(CLAUDE.md) — 소수 금액은 계산이 틀린 것이라 글자로 바꾸지 않는다.
// 10,000원으로 나눠떨어지고 1,000,000원 이상이면 `n억 m만 원`(0인 쪽 뺌), 아니면 `#,###원`.
// 음수(개원 준비의 내 돈이 대출보다 적을 때)는 앞에 빼기 표시 '−'(U+2212, 급여·매출 화면과 같음)
// 만 원 칸 금액 글 `manText`(AC-7905.7): 0 `없음`, 없음 `–`, 만 원으로 나눠떨어지면 100만 원 아래도 `n억 m만 원`

const MINUS = '−'
const WON_PER_MAN = 10_000
const MAN_PER_EOK = 10_000
const MAN_TEXT_FROM = 1_000_000

/** 0 이상 정수 → 천 단위 쉼표 글자 */
export function commaText(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 10,000원으로 나눠떨어지는 0 넘는 원 → `1억 5,000만 원`(0인 쪽 뺌, 부호 없음) */
function eokManText(abs: number): string {
  const man = abs / WON_PER_MAN
  const eok = Math.floor(man / MAN_PER_EOK)
  const rest = man % MAN_PER_EOK
  const parts = [eok > 0 ? `${commaText(eok)}억` : '', rest > 0 ? `${commaText(rest)}만` : ''].filter(Boolean)
  return `${parts.join(' ')} 원`
}

/** 원 정수 → `1억 5,000만 원` · `112,500원` · `0원`. 소수·숫자 아님·안전한 정수 밖은 RangeError */
export function wonText(won: number): string {
  if (!Number.isSafeInteger(won)) throw new RangeError('금액은 원 단위 정수여야 해요')
  const abs = Math.abs(won)
  const sign = won < 0 ? MINUS : ''
  if (abs < MAN_TEXT_FROM || abs % WON_PER_MAN !== 0) return `${sign}${commaText(abs)}원`
  return `${sign}${eokManText(abs)}`
}

/**
 * 만 원 칸에서 온 금액(매물 보증금·월세·권리금·관리비, 개원 비용 칸·합계 등, AC-7905.7) → `78만 원` · `1억 5,000만 원`.
 * 0은 `없음`, 값이 없으면 `–`, 10,000원으로 안 나눠지면 `wonText` 그대로. 소수·음수는 `wonText`와 같다(RangeError · 앞에 `−`)
 */
export function manText(won: number | null | undefined): string {
  if (won == null) return '–'
  if (!Number.isSafeInteger(won) || won % WON_PER_MAN !== 0) return wonText(won)
  if (won === 0) return '없음'
  return `${won < 0 ? MINUS : ''}${eokManText(Math.abs(won))}`
}
