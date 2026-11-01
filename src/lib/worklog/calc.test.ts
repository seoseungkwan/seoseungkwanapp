import { describe, expect, it } from 'vitest'
import {
  emptyWorklogDay,
  MEMO_MAX,
  NOTE_MAX,
  WORKLOG_COLUMNS,
  WORKLOG_COUNT_KEYS,
  WORKLOG_LABELS,
  WORKLOG_NOTE_KEYS,
  WORKLOG_WON_KEYS,
  type WorklogDay,
  type WorklogNumberKey,
  type WorklogTotals,
} from '@/types/worklog'
import { countText, parseCount, parseWon, visitsText, wonAutoText, wonInputText, worklogTotals } from './calc'

// 합계·칸 글자 (REQ-002). 숫자는 모두 둥근 가짜 숫자다
const dayWith = (values: Partial<WorklogDay>): WorklogDay => ({ ...emptyWorklogDay(), ...values })
const NOTHING: WorklogTotals = { visits: 0, received: 0, spent: 0, net: 0 }

describe('worklogTotals', () => {
  // 칸 하나에만 값을 넣어, 그 칸이 어느 합계에 들어가고 어디에 안 들어가는지 칸마다 따로 본다
  it.each<[WorklogNumberKey, Partial<WorklogTotals>]>([
    ['newPatients', { visits: 1000 }],
    ['returnPatients', { visits: 1000 }],
  ])('AC-002.1: 환자 합계에 들어가는 칸 %s', (key, expected) => {
    expect(worklogTotals(dayWith({ [key]: 1000 }))).toEqual({ ...NOTHING, ...expected })
  })

  it('AC-002.1: 환자 합계는 신환 + 재진이고 빈 칸은 0이다', () => {
    expect(worklogTotals(dayWith({ newPatients: 10, returnPatients: 20 })).visits).toBe(30)
    expect(worklogTotals(dayWith({ newPatients: 10, returnPatients: null })).visits).toBe(10)
    expect(worklogTotals(dayWith({ newPatients: null, returnPatients: 20 })).visits).toBe(20)
  })

  it.each<WorklogNumberKey>(['cashIn', 'cardIn', 'transferIn', 'localCurrencyIn'])(
    'AC-002.2: 수납액에 들어가는 칸 %s',
    (key) => {
      expect(worklogTotals(dayWith({ [key]: 1000 }))).toEqual({ ...NOTHING, received: 1000, net: 1000 })
    },
  )

  it.each<WorklogNumberKey>(['totalFee', 'claimAmount', 'unpaidNew', 'unpaidPaid'])(
    'AC-002.2: 수납액에 더하지 않는 칸 %s',
    (key) => {
      expect(worklogTotals(dayWith({ [key]: 1000 }))).toEqual(NOTHING)
    },
  )

  it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', () => {
    const day = dayWith({
      cashIn: 100_000,
      cardIn: 200_000,
      transferIn: 300_000,
      localCurrencyIn: 400_000,
      totalFee: 9_000_000,
      claimAmount: 8_000_000,
      unpaidNew: 7_000_000,
      unpaidPaid: 6_000_000,
    })
    expect(worklogTotals(day).received).toBe(1_000_000)
  })

  it.each<WorklogNumberKey>(['spendCash', 'spendCard', 'spendRefund', 'spendFree'])(
    'AC-002.3: 총지불액에 들어가는 칸 %s',
    (key) => {
      expect(worklogTotals(dayWith({ [key]: 1000 }))).toEqual({ ...NOTHING, spent: 1000, net: -1000 })
    },
  )

  it('AC-002.3: 총지불액은 지출 현금·카드·환불·free의 합이다', () => {
    const day = dayWith({ spendCash: 10_000, spendCard: 20_000, spendRefund: 30_000, spendFree: 40_000 })
    expect(worklogTotals(day).spent).toBe(100_000)
  })

  it('AC-002.4: 합계는 수납액 − 총지불액이다', () => {
    const day = dayWith({ cashIn: 300_000, cardIn: 200_000, spendCash: 100_000, spendRefund: 50_000 })
    expect(worklogTotals(day)).toEqual({ visits: 0, received: 500_000, spent: 150_000, net: 350_000 })
  })

  it('AC-002.4: 합계가 음수면 음수 그대로다', () => {
    const day = dayWith({ cashIn: 10_000, spendCash: 22_000 })
    expect(worklogTotals(day).net).toBe(-12_000)
  })

  it('AC-002.4: 빈 날은 합계 넷이 모두 0이다', () => {
    expect(worklogTotals(emptyWorklogDay())).toEqual(NOTHING)
  })

  it('AC-002.4: 칸마다 가장 큰 값을 넣어도 값이 정수 그대로다', () => {
    const most = 999_999_999_999
    const { received, spent, net } = worklogTotals(
      dayWith({ cashIn: most, cardIn: most, transferIn: most, localCurrencyIn: most, spendCash: 1 }),
    )
    expect(received).toBe(3_999_999_999_996)
    expect(spent).toBe(1)
    expect(net).toBe(3_999_999_999_995)
    expect(Number.isInteger(net)).toBe(true)
  })
})

describe('parseWon·parseCount', () => {
  it('AC-002.5: 쉼표·원·빈칸·붙임표를 버린다', () => {
    expect(parseWon('1,234,500원')).toBe(1_234_500)
    expect(parseWon('1 000')).toBe(1000)
    expect(parseWon('-500')).toBe(500)
    expect(parseCount('8,6명')).toBe(86)
    expect(parseCount('-5')).toBe(5)
  })

  it('AC-002.5: 앞의 0을 지운다', () => {
    expect(parseWon('00012')).toBe(12)
    expect(parseCount('00012')).toBe(12)
  })

  it('AC-002.5: 0만 친 값은 빈 값이 아니라 0이다', () => {
    expect(parseWon('0')).toBe(0)
    expect(parseWon('000')).toBe(0)
    expect(parseCount('0')).toBe(0)
  })

  it.each(['', '   ', 'abc', '원', ',-'])('AC-002.5: 숫자가 없는 글자 "%s"는 빈 값이다', (text) => {
    expect(parseWon(text)).toBeNull()
    expect(parseCount(text)).toBeNull()
  })

  it('AC-002.5: 금액은 앞 12자리까지만 받는다', () => {
    expect(parseWon('123456789012')).toBe(123_456_789_012)
    expect(parseWon('1234567890123')).toBe(123_456_789_012)
  })

  it('AC-002.5: 인원은 앞 5자리까지만 받는다', () => {
    expect(parseCount('12345')).toBe(12_345)
    expect(parseCount('123456')).toBe(12_345)
  })

  it('AC-002.5: 자리 수는 앞의 0을 지운 뒤에 센다', () => {
    expect(parseWon('0001234567890123')).toBe(123_456_789_012)
    expect(parseCount('00123456')).toBe(12_345)
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
    expect(visitsText(worklogTotals(emptyWorklogDay()).visits)).toBe('0')
  })

  it('AC-002.6: 환자 합계 칸도 숫자만 보이고 쉼표도 원도 없다', () => {
    expect(visitsText(86)).toBe('86')
    expect(visitsText(12_345)).toBe('12345')
  })
})

describe('자료 모양', () => {
  const ALL_KEYS = [...WORKLOG_COUNT_KEYS, ...WORKLOG_WON_KEYS, ...WORKLOG_NOTE_KEYS]

  it('칸 열쇠는 엑셀 줄 순서로 19개다', () => {
    expect(ALL_KEYS).toEqual([
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
    })
  })

  it('칸 이름은 시안의 aria-label과 같다', () => {
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
    })
  })

  it('빈 하루는 숫자 null·비고 빈 글자이고, 업무사항과 합계 칸이 없다', () => {
    const day = emptyWorklogDay()
    expect(Object.keys(day).sort()).toEqual([...ALL_KEYS].sort())
    for (const key of [...WORKLOG_COUNT_KEYS, ...WORKLOG_WON_KEYS]) expect(day[key]).toBeNull()
    for (const key of WORKLOG_NOTE_KEYS) expect(day[key]).toBe('')
  })

  it('빈 하루는 부를 때마다 새 값이다', () => {
    const first = emptyWorklogDay()
    first.cashIn = 1000
    expect(emptyWorklogDay().cashIn).toBeNull()
  })

  it('비고는 100자, 업무사항은 2,000자까지다', () => {
    expect(NOTE_MAX).toBe(100)
    expect(MEMO_MAX).toBe(2000)
  })
})
