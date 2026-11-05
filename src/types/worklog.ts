// 업무일지 하루 값의 모양. 칸 순서는 엑셀 줄 순서다 (specs/worklog/design.md 5절)
// 칸은 모두 글자다(친 글자를 저장한다). 합계 넷은 저장하지 않고, 칸 글자에서 읽은 숫자로 그릴 때 계산한다

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
export type WorklogNameKey =
  | 'nameTotalFee'
  | 'nameClaimAmount'
  | 'nameCashIn'
  | 'nameCardIn'
  | 'nameTransferIn'
  | 'nameLocalCurrencyIn'
  | 'nameUnpaidNew'
  | 'nameUnpaidPaid'
  | 'nameSpendCash'
  | 'nameSpendCard'
  | 'nameSpendRefund'
  | 'nameSpendFree'
export type WorklogCellKey = WorklogNumberKey | WorklogNoteKey | WorklogNameKey | 'memo'

/** 서버에 저장하는 하루 값. 모든 칸이 글자이고 빈 칸은 ''(서버에서는 null). 항목 이름이 ''이면 기본 이름 */
export type WorklogDay = Record<WorklogCellKey, string>
/** 저장에 넘기는 바뀐 칸만 */
export type WorklogChanges = Partial<WorklogDay>
// 업무사항 글씨 크기(pt, 엑셀처럼). 그날 일지에 저장한다. 칸이 아니라 그날의 설정 하나다 (specs/worklog-memo-font)
export const MEMO_FONT_PTS = [8, 9, 10, 11, 12, 14, 16] as const
export type MemoFontPt = (typeof MEMO_FONT_PTS)[number]
export const MEMO_FONT_DEFAULT: MemoFontPt = 11

/** 서버에서 읽은 하루: 칸 값 + 비트에서 불러온 칸 목록(bit_fields, design.md 20-4절) + 업무사항 글씨 크기(없으면 11로 본다) */
export type WorklogSavedDay = { day: WorklogDay; bitFields: WorklogNumberKey[]; memoFontPt?: MemoFontPt }
/** 칸 글자에서 읽은 숫자(합계 계산의 입력). 숫자로 읽히지 않은 칸은 null */
export type WorklogNumbers = Record<WorklogNumberKey, number | null>
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
export const WORKLOG_NAME_KEYS: readonly WorklogNameKey[] = [
  'nameTotalFee',
  'nameClaimAmount',
  'nameCashIn',
  'nameCardIn',
  'nameTransferIn',
  'nameLocalCurrencyIn',
  'nameUnpaidNew',
  'nameUnpaidPaid',
  'nameSpendCash',
  'nameSpendCard',
  'nameSpendRefund',
  'nameSpendFree',
]
// 32칸: 숫자 14 · 비고 5 · 업무사항 · 항목 이름 12
export const WORKLOG_CELL_KEYS: readonly WorklogCellKey[] = [
  ...WORKLOG_COUNT_KEYS,
  ...WORKLOG_WON_KEYS,
  ...WORKLOG_NOTE_KEYS,
  'memo',
  ...WORKLOG_NAME_KEYS,
]
// 실제로 합계에 들어가는 열 칸. 총진료비·조합청구액·미수발생·미수입금은 더하지 않는다
export const WORKLOG_SUM_KEYS: readonly WorklogNumberKey[] = [
  'newPatients',
  'returnPatients',
  'cashIn',
  'cardIn',
  'transferIn',
  'localCurrencyIn',
  'spendCash',
  'spendCard',
  'spendRefund',
  'spendFree',
]

// 열쇠 → DB 칸(worklog_days)
export const WORKLOG_COLUMNS: Readonly<Record<WorklogCellKey, string>> = {
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
  memo: 'memo',
  nameTotalFee: 'name_total_fee',
  nameClaimAmount: 'name_claim_amount',
  nameCashIn: 'name_cash_in',
  nameCardIn: 'name_card_in',
  nameTransferIn: 'name_transfer_in',
  nameLocalCurrencyIn: 'name_local_currency_in',
  nameUnpaidNew: 'name_unpaid_new',
  nameUnpaidPaid: 'name_unpaid_paid',
  nameSpendCash: 'name_spend_cash',
  nameSpendCard: 'name_spend_card',
  nameSpendRefund: 'name_spend_refund',
  nameSpendFree: 'name_spend_free',
}

// 열쇠 → 칸 이름(aria-label). 금액 칸 이름은 항목 이름을 고쳐도 그대로다
export const WORKLOG_LABELS: Readonly<Record<WorklogCellKey, string>> = {
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
  memo: '업무사항',
  nameTotalFee: '총진료비 항목 이름',
  nameClaimAmount: '조합청구액 항목 이름',
  nameCashIn: '현금수납 항목 이름',
  nameCardIn: '카드수납 항목 이름',
  nameTransferIn: '계좌이체 항목 이름',
  nameLocalCurrencyIn: '지역화폐 항목 이름',
  nameUnpaidNew: '미수발생 항목 이름',
  nameUnpaidPaid: '미수입금 항목 이름',
  nameSpendCash: '현금 항목 이름',
  nameSpendCard: '카드 항목 이름',
  nameSpendRefund: '환불 항목 이름',
  nameSpendFree: 'free 항목 이름',
}

// 금액 칸 → 항목 이름 칸
export const WORKLOG_NAME_OF: Readonly<Record<WorklogWonKey, WorklogNameKey>> = {
  totalFee: 'nameTotalFee',
  claimAmount: 'nameClaimAmount',
  cashIn: 'nameCashIn',
  cardIn: 'nameCardIn',
  transferIn: 'nameTransferIn',
  localCurrencyIn: 'nameLocalCurrencyIn',
  unpaidNew: 'nameUnpaidNew',
  unpaidPaid: 'nameUnpaidPaid',
  spendCash: 'nameSpendCash',
  spendCard: 'nameSpendCard',
  spendRefund: 'nameSpendRefund',
  spendFree: 'nameSpendFree',
}

// 항목 이름 칸 → 기본 이름(엑셀 글자)
export const WORKLOG_DEFAULT_NAMES: Readonly<Record<WorklogNameKey, string>> = {
  nameTotalFee: '총진료비',
  nameClaimAmount: '조합청구액',
  nameCashIn: '현금수납',
  nameCardIn: '카드수납',
  nameTransferIn: '계좌이체',
  nameLocalCurrencyIn: '지역화폐',
  nameUnpaidNew: '미수발생',
  nameUnpaidPaid: '미수입금',
  nameSpendCash: '현금',
  nameSpendCard: '카드',
  nameSpendRefund: '환불',
  nameSpendFree: 'free',
}

export const CELL_MAX = 50 // 숫자 칸 글자
export const NAME_MAX = 20 // 항목 이름
export const NOTE_MAX = 100
export const MEMO_MAX = 2000

export function emptyWorklogDay(): WorklogDay {
  return Object.fromEntries(WORKLOG_CELL_KEYS.map((key) => [key, ''])) as WorklogDay
}
