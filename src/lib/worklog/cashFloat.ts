import {
  CASH_COUNT_KEYS,
  CASH_COUNT_MAX,
  CASH_FLOAT_MAX,
  CASH_PIECES,
  CASH_REASON_MAX,
  emptyWorklogCash,
  type CashCountKey,
  type WorklogCash,
  type WorklogCashKey,
  type WorklogDay,
} from '@/types/worklog'
import { readCell } from './cellText'
import { privacyProblem } from './notes'

// 업무일지 현금 시재 규칙 (specs/worklog-cash-float design.md '규칙'). 순수 함수다: 저장·화면·통로를 부르지 않는다.
// 금액은 원 단위 정수이고 나눗셈은 거스름돈 추측의 나누어떨어짐 검사뿐이라 버림·반올림이 없다

export type CashAmountKey = 'cashIn' | 'spendCash' | 'spendRefund' | 'unpaidPaid'
export type CashVerdict =
  | { kind: 'not-counted' }
  | { kind: 'no-float' }
  | { kind: 'match' }
  | { kind: 'short' | 'over'; won: number }
export type ChangePiece = 50000 | 10000 | 5000 | 1000
export type CashGuess =
  | { kind: 'bit-cash'; typed: number; bit: number; gap: number } // gap = typed − bit
  | { kind: 'change'; piece: ChangePiece; count: 1 | 2; direction: 'more' | 'less' }
  | { kind: 'none' }

const CHANGE_PIECES: readonly ChangePiece[] = [50000, 10000, 5000, 1000] // 거스름돈으로 주고받는 지폐
const COMMAS = new Intl.NumberFormat('ko-KR')
const DIGITS_ONLY = /^\d+$/
const FLOAT_TEXT = /^([\d,]+)\s*원?$/

const pieceOf = (key: CashCountKey): number => CASH_PIECES[CASH_COUNT_KEYS.indexOf(key)]
const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= CASH_COUNT_MAX
const isFloat = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= CASH_FLOAT_MAX
const isCountKey = (key: WorklogCashKey): key is CashCountKey => (CASH_COUNT_KEYS as readonly string[]).includes(key)
// DB char_length와 같게 글자(코드 포인트) 수로 센다
const charCount = (text: string): number => [...text].length

/** 세어 본 돈: 권종마다 장수 × 금액의 합 */
export function countedWon(cash: WorklogCash): number {
  return CASH_COUNT_KEYS.reduce((total, key) => total + cash[key] * pieceOf(key), 0)
}

/** 한 칸이라도 장수를 적었는가 */
export function hasCount(cash: WorklogCash): boolean {
  return CASH_COUNT_KEYS.some((key) => cash[key] > 0)
}

/** 일지 금액 칸을 합계와 같은 규칙(cellText.readCell)으로 읽는다. 숫자로 읽히지 않으면 0 */
export function cellAmount(day: WorklogDay, key: CashAmountKey): number {
  const read = readCell('won', day[key])
  return read.kind === 'number' ? read.value : 0
}

/** 있어야 할 돈 = 시재 + 현금수납 − 지출 현금 − 환불(현금으로 돌려줌일 때) + 미수입금(현금으로 받음일 때). 시재를 모르면 null */
export function expectedWon(day: WorklogDay, cash: WorklogCash, floatWon: number | null): number | null {
  if (floatWon === null) return null
  const refund = cash.refundCash ? cellAmount(day, 'spendRefund') : 0
  const unpaid = cash.unpaidCash ? cellAmount(day, 'unpaidPaid') : 0
  return floatWon + cellAmount(day, 'cashIn') - cellAmount(day, 'spendCash') - refund + unpaid
}

export function cashVerdict(cash: WorklogCash, expected: number | null): CashVerdict {
  if (!hasCount(cash)) return { kind: 'not-counted' }
  if (expected === null) return { kind: 'no-float' }
  const diff = countedWon(cash) - expected
  if (diff === 0) return { kind: 'match' }
  return diff < 0 ? { kind: 'short', won: -diff } : { kind: 'over', won: diff }
}

/**
 * 차이(세어 본 돈 − 있어야 할 돈)가 생겼을 법한 까닭. 이 PC에 이미 있는 숫자로만 계산한다.
 * (가) 일지 현금수납이 비트 현금과 다름 (나) 차이가 큰 지폐부터 처음 나누어떨어지는 권종 1~2장이면 거스름돈 실수 (다) 둘 다 없으면 none
 */
export function guessCashDifference(diff: number, typedCashIn: number | null, bitCashIn: number | undefined): CashGuess[] {
  const guesses: CashGuess[] = []
  if (typedCashIn !== null && bitCashIn !== undefined && typedCashIn !== bitCashIn) {
    guesses.push({ kind: 'bit-cash', typed: typedCashIn, bit: bitCashIn, gap: typedCashIn - bitCashIn })
  }
  const gap = Math.abs(diff)
  const piece = CHANGE_PIECES.find((bill) => gap > 0 && gap % bill === 0 && gap / bill <= 2)
  if (piece !== undefined) {
    guesses.push({ kind: 'change', piece, count: gap / piece === 1 ? 1 : 2, direction: diff < 0 ? 'more' : 'less' })
  }
  return guesses.length > 0 ? guesses : [{ kind: 'none' }]
}

/** 장수 칸 글자: 숫자만 남기고 앞 4자리까지. 없으면 0 */
export function toCashCount(text: string): number {
  const digits = text.replace(/\D/g, '').slice(0, String(CASH_COUNT_MAX).length)
  return digits ? Number(digits) : 0
}

/** 시재 금액 글자: 앞뒤 빈칸·쉼표·끝 '원'을 허용한다. 0원도 된다 */
export function parseFloatSetting(text: string): number | 'invalid' | 'too-big' {
  const match = FLOAT_TEXT.exec(text.trim())
  if (match === null) return 'invalid'
  const digits = match[1].replace(/,/g, '')
  if (!DIGITS_ONLY.test(digits)) return 'invalid'
  const won = Number(digits)
  return won > CASH_FLOAT_MAX ? 'too-big' : won
}

/** 처음 장수를 적을 때 그날 시재를 설정 금액으로 붙인다. 이미 있거나 장수가 없으면 그대로 */
export function withFloatSnapshot(cash: WorklogCash, settingWon: number): WorklogCash {
  if (cash.floatWon !== null || !hasCount(cash)) return cash
  return { ...cash, floatWon: settingWon }
}

/** 읽은 값 거르기: 범위 밖·정수 아님·모양이 틀린 값은 장수 0 · 시재 null · 거짓 · '' */
export function toWorklogCash(values: Partial<Record<WorklogCashKey, unknown>>): WorklogCash {
  const cash = emptyWorklogCash()
  for (const key of CASH_COUNT_KEYS) {
    const value = values[key]
    if (isCount(value)) cash[key] = value
  }
  if (isFloat(values.floatWon)) cash.floatWon = values.floatWon
  cash.refundCash = values.refundCash === true
  cash.unpaidCash = values.unpaidCash === true
  const reason = values.reason
  if (typeof reason === 'string' && charCount(reason) <= CASH_REASON_MAX) cash.reason = reason
  return cash
}

/** 차이 이유가 개인정보 모양이라 저장하지 않을 글인가 (업무사항과 같은 막기) */
export function cashReasonBlocked(reason: string): boolean {
  return privacyProblem(reason)
}

/**
 * 서버로 보낼 값(마지막 문). undefined = 보내지 않음.
 * 장수·시재는 범위 안 정수, 확인란은 참/거짓, 이유는 앞뒤 빈칸을 뺀 글(비면 null). 개인정보 모양 이유는 보내지 않는다
 */
export function cashSaveValue(
  key: WorklogCashKey,
  value: WorklogCash[WorklogCashKey],
): number | boolean | string | null | undefined {
  if (isCountKey(key)) return isCount(value) ? value : undefined
  if (key === 'floatWon') return value === null || isFloat(value) ? value : undefined
  if (key === 'refundCash' || key === 'unpaidCash') return typeof value === 'boolean' ? value : undefined
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  if (charCount(trimmed) > CASH_REASON_MAX || cashReasonBlocked(trimmed)) return undefined
  return trimmed
}

/** 쉼표 금액 + 원 ('147,000원') */
export function wonText(n: number): string {
  return `${COMMAS.format(n)}원`
}
