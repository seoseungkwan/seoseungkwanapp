import { WORKLOG_COUNT_KEYS, type WorklogNumberKey, type WorklogNumbers, type WorklogTotals } from '@/types/worklog'

// 업무일지 합계와 숫자의 칸 글자. 합계는 저장하지 않고 그릴 때 계산한다.
// 칸 글자를 읽지 않는다: 읽은 숫자(cellText.readDayNumbers)만 받는다(방향은 cellText → calc).
// 금액은 원 단위 정수이고 나눗셈이 없어 버림·반올림이 필요 없다

// 엑셀 E15. 총진료비·조합청구액·미수발생·미수입금은 수납액이 아니다
const RECEIVED_KEYS: readonly WorklogNumberKey[] = ['cashIn', 'cardIn', 'transferIn', 'localCurrencyIn']
const SPENT_KEYS: readonly WorklogNumberKey[] = ['spendCash', 'spendCard', 'spendRefund', 'spendFree'] // 엑셀 E22

const COMMAS = new Intl.NumberFormat('ko-KR')

const sum = (numbers: WorklogNumbers, keys: readonly WorklogNumberKey[]) =>
  keys.reduce((total, key) => total + (numbers[key] ?? 0), 0)

export function worklogTotals(numbers: WorklogNumbers): WorklogTotals {
  const received = sum(numbers, RECEIVED_KEYS)
  const spent = sum(numbers, SPENT_KEYS)
  return { visits: sum(numbers, WORKLOG_COUNT_KEYS), received, spent, net: received - spent } // visits는 엑셀 D6, net은 E23(음수 그대로)
}

// 엑셀 서식 #,###"원": 입력 칸은 없거나 0이면 빈 글자, 초점이 있는 동안은 원을 뺀다
export function wonInputText(n: number | null, focused: boolean): string {
  if (!n) return ''
  return focused ? COMMAS.format(n) : `${COMMAS.format(n)}원`
}

// 엑셀 서식 #,###"원": 자동 칸은 0이면 '원'만 보인다
export function wonAutoText(n: number): string {
  if (n === 0) return '원'
  return n < 0 ? `-${COMMAS.format(-n)}원` : `${COMMAS.format(n)}원`
}

// 인원 입력 칸: 숫자만(쉼표 없음). 없거나 0이면 빈 글자
export function countText(n: number | null): string {
  return n ? String(n) : ''
}

// 환자 합계 칸(엑셀 D6): 숫자만(쉼표 없음). 0도 '0'
export function visitsText(n: number): string {
  return String(n)
}
