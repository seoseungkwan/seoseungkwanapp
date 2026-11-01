// 업무일지 하루 값의 모양. 칸 순서는 엑셀 줄 순서다 (specs/worklog/design.md 5절)
// 합계 넷은 저장하지 않고 그릴 때 계산한다(WorklogTotals는 lib/worklog/calc의 결과 모양).
// 업무사항은 서버로 가지 않으므로 WorklogDay에 없다(lib/worklog/memoStore가 따로 둔다)

export type WorklogCountKey = 'newPatients' | 'returnPatients'
export type WorklogWonKey =
  | 'totalFee'
  | 'claimAmount'
  | 'cashIn'
  | 'cardIn'
  | 'transferIn'
  | 'localCurrencyIn'
  | 'unpaidNew'
  | 'unpaidPaid'
  | 'spendCash'
  | 'spendCard'
  | 'spendRefund'
  | 'spendFree'
export type WorklogNumberKey = WorklogCountKey | WorklogWonKey
export type WorklogNoteKey = 'noteCash' | 'noteCard' | 'noteRefund' | 'noteFree' | 'noteTotal'

/** 서버에 저장하는 하루 값. 값이 없음 = null(엑셀 빈칸). 업무사항은 여기 없다(따로 memoStore) */
export type WorklogDay = Record<WorklogNumberKey, number | null> & Record<WorklogNoteKey, string>
export type WorklogTotals = { visits: number; received: number; spent: number; net: number }

export const WORKLOG_COUNT_KEYS: readonly WorklogCountKey[] = ['newPatients', 'returnPatients']
export const WORKLOG_WON_KEYS: readonly WorklogWonKey[] = [
  'totalFee',
  'claimAmount',
  'cashIn',
  'cardIn',
  'transferIn',
  'localCurrencyIn',
  'unpaidNew',
  'unpaidPaid',
  'spendCash',
  'spendCard',
  'spendRefund',
  'spendFree',
]
export const WORKLOG_NOTE_KEYS: readonly WorklogNoteKey[] = ['noteCash', 'noteCard', 'noteRefund', 'noteFree', 'noteTotal']

// 열쇠 → DB 칸(worklog_days)
export const WORKLOG_COLUMNS: Readonly<Record<WorklogNumberKey | WorklogNoteKey, string>> = {
  newPatients: 'new_patients',
  returnPatients: 'return_patients',
  totalFee: 'total_fee',
  claimAmount: 'claim_amount',
  cashIn: 'cash_in',
  cardIn: 'card_in',
  transferIn: 'transfer_in',
  localCurrencyIn: 'local_currency_in',
  unpaidNew: 'unpaid_new',
  unpaidPaid: 'unpaid_paid',
  spendCash: 'spend_cash',
  spendCard: 'spend_card',
  spendRefund: 'spend_refund',
  spendFree: 'spend_free',
  noteCash: 'note_cash',
  noteCard: 'note_card',
  noteRefund: 'note_refund',
  noteFree: 'note_free',
  noteTotal: 'note_total',
}

// 열쇠 → 칸 이름(시안 aria-label)
export const WORKLOG_LABELS: Readonly<Record<WorklogNumberKey | WorklogNoteKey, string>> = {
  newPatients: '신환',
  returnPatients: '재진',
  totalFee: '총진료비',
  claimAmount: '조합청구액',
  cashIn: '현금수납',
  cardIn: '카드수납',
  transferIn: '계좌이체',
  localCurrencyIn: '지역화폐',
  unpaidNew: '미수발생',
  unpaidPaid: '미수입금',
  spendCash: '지출 현금 금액',
  spendCard: '지출 카드 금액',
  spendRefund: '환불 금액',
  spendFree: '지출 free 금액',
  noteCash: '지출 현금 비고',
  noteCard: '지출 카드 비고',
  noteRefund: '환불 비고',
  noteFree: '지출 free 비고',
  noteTotal: '총 지불액 비고',
}

export const NOTE_MAX = 100
export const MEMO_MAX = 2000

export function emptyWorklogDay(): WorklogDay {
  return {
    newPatients: null,
    returnPatients: null,
    totalFee: null,
    claimAmount: null,
    cashIn: null,
    cardIn: null,
    transferIn: null,
    localCurrencyIn: null,
    unpaidNew: null,
    unpaidPaid: null,
    spendCash: null,
    spendCard: null,
    spendRefund: null,
    spendFree: null,
    noteCash: '',
    noteCard: '',
    noteRefund: '',
    noteFree: '',
    noteTotal: '',
  }
}
