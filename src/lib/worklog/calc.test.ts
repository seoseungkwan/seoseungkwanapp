import { describe, expect, it } from 'vitest'
import {
  CELL_MAX,
  emptyWorklogDay,
  MEMO_MAX,
  NAME_MAX,
  NOTE_MAX,
  WORKLOG_CELL_KEYS,
  WORKLOG_COLUMNS,
  WORKLOG_COUNT_KEYS,
  WORKLOG_DEFAULT_NAMES,
  WORKLOG_LABELS,
  WORKLOG_NAME_KEYS,
  WORKLOG_NAME_OF,
  WORKLOG_NOTE_KEYS,
  WORKLOG_SUM_KEYS,
  WORKLOG_WON_KEYS,
  type WorklogNumberKey,
  type WorklogNumbers,
  type WorklogTotals,
} from '@/types/worklog'
import * as calc from './calc'
import { countText, visitsText, wonAutoText, wonInputText, worklogTotals } from './calc'

// 합계·칸 글자 (REQ-002). 숫자는 모두 둥근 가짜 숫자다. 합계의 입력은 칸 글자에서 읽은 숫자다
const NUMBER_KEYS: readonly WorklogNumberKey[] = [...WORKLOG_COUNT_KEYS, ...WORKLOG_WON_KEYS]
const numbersWith = (values: Partial<WorklogNumbers>): WorklogNumbers => ({
  ...(Object.fromEntries(NUMBER_KEYS.map((key) => [key, null])) as WorklogNumbers),
  ...values,
})
const NOTHING: WorklogTotals = { visits: 0, received: 0, spent: 0, net: 0 }

describe('worklogTotals', () => {
  // 칸 하나에만 값을 넣어, 그 칸이 어느 합계에 들어가고 어디에 안 들어가는지 칸마다 따로 본다
  it.each<[WorklogNumberKey, Partial<WorklogTotals>]>([
    ['newPatients', { visits: 1000 }],
    ['returnPatients', { visits: 1000 }],
  ])('AC-002.1: 환자 합계에 들어가는 칸 %s', (key, expected) => {
    expect(worklogTotals(numbersWith({ [key]: 1000 }))).toEqual({ ...NOTHING, ...expected })
  })

  it('AC-002.1: 환자 합계는 신환 + 재진이고 없는 칸은 0이다', () => {
    expect(worklogTotals(numbersWith({ newPatients: 10, returnPatients: 20 })).visits).toBe(30)
    expect(worklogTotals(numbersWith({ newPatients: 10, returnPatients: null })).visits).toBe(10)
    expect(worklogTotals(numbersWith({ newPatients: null, returnPatients: 20 })).visits).toBe(20)
  })

  it.each<WorklogNumberKey>(['cashIn', 'cardIn', 'transferIn', 'localCurrencyIn'])(
    'AC-002.2: 수납액에 들어가는 칸 %s',
    (key) => {
      expect(worklogTotals(numbersWith({ [key]: 1000 }))).toEqual({ ...NOTHING, received: 1000, net: 1000 })
    },
  )

  it.each<WorklogNumberKey>(['totalFee', 'claimAmount', 'unpaidNew', 'unpaidPaid'])(
    'AC-002.2: 수납액에 더하지 않는 칸 %s',
    (key) => {
      expect(worklogTotals(numbersWith({ [key]: 1000 }))).toEqual(NOTHING)
    },
  )

  it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', () => {
    const numbers = numbersWith({
      cashIn: 100_000,
      cardIn: 200_000,
      transferIn: 300_000,
      localCurrencyIn: 400_000,
      totalFee: 9_000_000,
      claimAmount: 8_000_000,
      unpaidNew: 7_000_000,
      unpaidPaid: 6_000_000,
    })
    expect(worklogTotals(numbers).received).toBe(1_000_000)
  })

  it.each<WorklogNumberKey>(['spendCash', 'spendCard', 'spendRefund', 'spendFree'])(
    'AC-002.3: 총지불액에 들어가는 칸 %s',
    (key) => {
      expect(worklogTotals(numbersWith({ [key]: 1000 }))).toEqual({ ...NOTHING, spent: 1000, net: -1000 })
    },
  )

  it('AC-002.3: 총지불액은 지출 현금·카드·환불·free의 합이다', () => {
    const numbers = numbersWith({ spendCash: 10_000, spendCard: 20_000, spendRefund: 30_000, spendFree: 40_000 })
    expect(worklogTotals(numbers).spent).toBe(100_000)
  })

  it('AC-002.1·AC-002.2·AC-002.3: 합계를 움직이는 칸은 WORKLOG_SUM_KEYS 열 칸뿐이다', () => {
    for (const key of NUMBER_KEYS) {
      const totals = worklogTotals(numbersWith({ [key]: 1000 }))
      if (WORKLOG_SUM_KEYS.includes(key)) expect(totals, key).not.toEqual(NOTHING)
      else expect(totals, key).toEqual(NOTHING)
    }
  })

  it('AC-002.4: 합계는 수납액 − 총지불액이다', () => {
    const numbers = numbersWith({ cashIn: 300_000, cardIn: 200_000, spendCash: 100_000, spendRefund: 50_000 })
    expect(worklogTotals(numbers)).toEqual({ visits: 0, received: 500_000, spent: 150_000, net: 350_000 })
  })

  it('AC-002.4: 합계가 음수면 음수 그대로다', () => {
    const numbers = numbersWith({ cashIn: 10_000, spendCash: 22_000 })
    expect(worklogTotals(numbers).net).toBe(-12_000)
  })

  it('AC-002.4: 모든 칸이 없는 날은 합계 넷이 모두 0이다', () => {
    expect(worklogTotals(numbersWith({}))).toEqual(NOTHING)
  })

  it('AC-002.4: 칸마다 가장 큰 값을 넣어도 값이 정수 그대로다', () => {
    const most = 999_999_999_999
    const { received, spent, net } = worklogTotals(
      numbersWith({ cashIn: most, cardIn: most, transferIn: most, localCurrencyIn: most, spendCash: 1 }),
    )
    expect(received).toBe(3_999_999_999_996)
    expect(spent).toBe(1)
    expect(net).toBe(3_999_999_999_995)
    expect(Number.isInteger(net)).toBe(true)
  })

  it('calc는 읽은 숫자로 합계만 내고 칸 글자를 읽지 않는다(읽기는 cellText)', () => {
    expect(Object.keys(calc).sort()).toEqual(['countText', 'visitsText', 'wonAutoText', 'wonInputText', 'worklogTotals'])
  })
})

describe('칸 글자', () => {
  it('AC-002.6: 입력 칸은 값이 없거나 0이면 빈 글자다(초점과 상관없이)', () => {
    expect(wonInputText(null, false)).toBe('')
    expect(wonInputText(0, false)).toBe('')
    expect(wonInputText(null, true)).toBe('')
    expect(wonInputText(0, true)).toBe('')
  })

  it('AC-002.6: 입력 칸은 쉼표와 원을 붙이고, 초점이 있는 동안은 원을 뺀다', () => {
    expect(wonInputText(1_234_500, false)).toBe('1,234,500원')
    expect(wonInputText(1_234_500, true)).toBe('1,234,500')
    expect(wonInputText(500, false)).toBe('500원')
    expect(wonInputText(999_999_999_999, false)).toBe('999,999,999,999원')
  })

  it('AC-002.6: 자동 칸은 0이면 "원"만 보인다', () => {
    expect(wonAutoText(0)).toBe('원')
    expect(wonAutoText(1_234_500)).toBe('1,234,500원')
  })

  it('AC-002.6: 자동 칸 음수는 붙임표 + 쉼표 + 원이다', () => {
    expect(wonAutoText(-12_000)).toBe('-12,000원')
    expect(wonAutoText(-500)).toBe('-500원')
  })

  it('AC-002.6: 인원 입력 칸은 숫자만 보이고 쉼표도 원도 없다', () => {
    expect(countText(86)).toBe('86')
    expect(countText(12_345)).toBe('12345')
  })

  it('AC-002.6: 인원 입력 칸은 값이 없거나 0이면 빈 글자다', () => {
    expect(countText(null)).toBe('')
    expect(countText(0)).toBe('')
  })

  it('AC-002.6: 환자 합계 칸은 0도 "0"이다', () => {
    expect(visitsText(0)).toBe('0')
    expect(visitsText(worklogTotals(numbersWith({})).visits)).toBe('0')
  })

  it('AC-002.6: 환자 합계 칸도 숫자만 보이고 쉼표도 원도 없다', () => {
    expect(visitsText(86)).toBe('86')
    expect(visitsText(12_345)).toBe('12345')
  })
})

describe('자료 모양', () => {
  it('칸 열쇠는 엑셀 줄 순서로 32개다(숫자 14 · 비고 5 · 업무사항 · 항목 이름 12)', () => {
    expect(WORKLOG_CELL_KEYS).toEqual([
      'newPatients',
      'returnPatients',
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
      'noteCash',
      'noteCard',
      'noteRefund',
      'noteFree',
      'noteTotal',
      'memo',
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
    ])
    expect(WORKLOG_CELL_KEYS).toHaveLength(32)
  })

  it('칸 묶음은 칸 열쇠 목록과 순서까지 맞는다', () => {
    expect(WORKLOG_CELL_KEYS).toEqual([
      ...WORKLOG_COUNT_KEYS,
      ...WORKLOG_WON_KEYS,
      ...WORKLOG_NOTE_KEYS,
      'memo',
      ...WORKLOG_NAME_KEYS,
    ])
  })

  it('실제로 합계에 들어가는 열 칸은 신환·재진·수납 넷·지출 넷이다', () => {
    expect(WORKLOG_SUM_KEYS).toEqual([
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
    ])
  })

  it('DB 칸 이름은 design.md 5절 표와 같다', () => {
    expect(WORKLOG_COLUMNS).toEqual({
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
    })
  })

  it('칸 이름은 design.md 5절 표와 같다(항목 이름 칸은 <기본 이름> 항목 이름)', () => {
    expect(WORKLOG_LABELS).toEqual({
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
    })
  })

  it('항목 이름의 기본값은 엑셀 글자다', () => {
    expect(WORKLOG_DEFAULT_NAMES).toEqual({
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
    })
  })

  it('금액 칸마다 항목 이름 칸이 하나 있고, 항목 이름 순서는 금액 칸 순서다', () => {
    expect(WORKLOG_NAME_OF).toEqual({
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
    })
    expect(WORKLOG_WON_KEYS.map((key) => WORKLOG_NAME_OF[key])).toEqual(WORKLOG_NAME_KEYS)
  })

  it('빈 하루는 32칸 모두 빈 글자이고, 합계 칸이 없다', () => {
    const day = emptyWorklogDay()
    expect(Object.keys(day).sort()).toEqual([...WORKLOG_CELL_KEYS].sort())
    for (const key of WORKLOG_CELL_KEYS) expect(day[key], key).toBe('')
  })

  it('빈 하루는 부를 때마다 새 값이다', () => {
    const first = emptyWorklogDay()
    first.cashIn = '1,000'
    expect(emptyWorklogDay().cashIn).toBe('')
  })

  it('글자 한도는 숫자 칸 50 · 항목 이름 20 · 비고 100 · 업무사항 2,000이다', () => {
    expect(CELL_MAX).toBe(50)
    expect(NAME_MAX).toBe(20)
    expect(NOTE_MAX).toBe(100)
    expect(MEMO_MAX).toBe(2000)
  })
})
