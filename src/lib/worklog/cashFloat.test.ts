import { readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  CASH_COUNT_KEYS,
  CASH_COUNT_MAX,
  CASH_FLOAT_DEFAULT,
  CASH_FLOAT_MAX,
  CASH_PIECES,
  CASH_REASON_MAX,
  emptyWorklogCash,
  emptyWorklogDay,
  MEMO_FONT_DEFAULT,
  MEMO_FONT_PTS,
  WORKLOG_CASH_COLUMNS,
  WORKLOG_CELL_KEYS,
  WORKLOG_COLUMNS,
  type CashCountKey,
  type CashPiece,
  type MemoFontPt,
  type WorklogBlockedKey,
  type WorklogCash,
  type WorklogCashChanges,
  type WorklogCashKey,
  type WorklogCellKey,
  type WorklogDay,
  type WorklogNumberKey,
  type WorklogSavedDay,
} from '@/types/worklog'
import {
  cashReasonBlocked,
  cashSaveValue,
  cashVerdict,
  cellAmount,
  countedWon,
  expectedWon,
  guessCashDifference,
  hasCount,
  parseFloatSetting,
  toCashCount,
  toWorklogCash,
  wonText,
  withFloatSnapshot,
} from './cashFloat'

// 업무일지 현금 시재 규칙 (specs/worklog-cash-float REQ-1601, design.md '규칙').
// 숫자는 승인 시안(docs/mockups/worklog/cash-float.html)의 지어낸 예시다
const SOURCE = 'src/lib/worklog/cashFloat.ts'

const COUNT_KEYS = [
  'count50000',
  'count10000',
  'count5000',
  'count1000',
  'count500',
  'count100',
  'count50',
  'count10',
] as const

/** 장수 여덟 칸(5만원권부터)을 넣은 시재. 나머지는 빈 시재 값 */
function cashOf(counts: readonly number[], rest: Partial<WorklogCash> = {}): WorklogCash {
  const cash = emptyWorklogCash()
  counts.forEach((count, index) => {
    cash[COUNT_KEYS[index]] = count
  })
  return { ...cash, ...rest }
}

const SHORT_COUNTS = [6, 11, 1, 10, 6, 20, 0, 0] // 430,000원
// 435,000원. 시안의 COUNTS_OK [6, 11, 2, 9, 6, 20, 0, 0]은 434,000원이라 1천원권을 10장으로 맞췄다
const OK_COUNTS = [6, 11, 2, 10, 6, 20, 0, 0]

/** 시안의 일지: 현금수납 147,000 · 지출 현금 12,000 · 환불 8,000 · 미수입금 5,000 */
function dayOf(cells: Partial<WorklogDay> = {}): WorklogDay {
  return {
    ...emptyWorklogDay(),
    cashIn: '147,000원',
    spendCash: '12000',
    spendRefund: '8,000',
    unpaidPaid: '5000',
    ...cells,
  }
}

describe('시재 타입·상수', () => {
  it('AC-1601.1: CASH_PIECES는 정확히 50000·10000·5000·1000·500·100·50·10이고 CASH_COUNT_KEYS는 그 차례다', () => {
    expect(CASH_PIECES).toEqual([50000, 10000, 5000, 1000, 500, 100, 50, 10])
    expect(CASH_COUNT_KEYS).toEqual([...COUNT_KEYS])
    expectTypeOf<CashPiece>().toEqualTypeOf<50000 | 10000 | 5000 | 1000 | 500 | 100 | 50 | 10>()
    expectTypeOf<CashCountKey>().toEqualTypeOf<(typeof COUNT_KEYS)[number]>()
  })

  it('AC-1601.1: WorklogCash는 장수 여덟 칸·floatWon·refundCash·unpaidCash·reason이고 바뀐 칸 모양은 Partial이다', () => {
    // WorklogCash는 Record & {...} 교차 타입이라 branded로 펴서 견준다
    expectTypeOf<WorklogCash>().branded.toEqualTypeOf<{
      count50000: number
      count10000: number
      count5000: number
      count1000: number
      count500: number
      count100: number
      count50: number
      count10: number
      floatWon: number | null
      refundCash: boolean
      unpaidCash: boolean
      reason: string
    }>()
    expectTypeOf<WorklogCashKey>().toEqualTypeOf<
      (typeof COUNT_KEYS)[number] | 'floatWon' | 'refundCash' | 'unpaidCash' | 'reason'
    >()
    expectTypeOf<WorklogCashChanges>().toEqualTypeOf<Partial<WorklogCash>>()
    expectTypeOf<WorklogBlockedKey>().toEqualTypeOf<WorklogCellKey | 'cashReason'>()
  })

  it('AC-1601.1: emptyWorklogCash()는 장수 0·floatWon null·둘 다 거짓·빈 이유이고 부를 때마다 새 값이다', () => {
    expect(emptyWorklogCash()).toEqual({
      count50000: 0,
      count10000: 0,
      count5000: 0,
      count1000: 0,
      count500: 0,
      count100: 0,
      count50: 0,
      count10: 0,
      floatWon: null,
      refundCash: false,
      unpaidCash: false,
      reason: '',
    })
    const first = emptyWorklogCash()
    first.count10 = 3
    expect(emptyWorklogCash().count10).toBe(0)
  })

  it('AC-1601.1: 시재 상수는 기본 300000·최대 10000000·장수 최대 9999·이유 최대 200이다', () => {
    expect(CASH_FLOAT_DEFAULT).toBe(300_000)
    expect(CASH_FLOAT_MAX).toBe(10_000_000)
    expect(CASH_COUNT_MAX).toBe(9999)
    expect(CASH_REASON_MAX).toBe(200)
  })

  it('AC-1601.1: WORKLOG_CASH_COLUMNS는 열쇠 → DB 칸 12개를 design.md DB 차례로 둔다', () => {
    expect(WORKLOG_CASH_COLUMNS).toEqual({
      count50000: 'cash_count_50000',
      count10000: 'cash_count_10000',
      count5000: 'cash_count_5000',
      count1000: 'cash_count_1000',
      count500: 'cash_count_500',
      count100: 'cash_count_100',
      count50: 'cash_count_50',
      count10: 'cash_count_10',
      floatWon: 'cash_float',
      refundCash: 'cash_refund_cash',
      unpaidCash: 'cash_unpaid_cash',
      reason: 'cash_reason',
    })
    expect(Object.keys(WORKLOG_CASH_COLUMNS)).toEqual([...COUNT_KEYS, 'floatWon', 'refundCash', 'unpaidCash', 'reason'])
    expect(Object.keys(WORKLOG_CASH_COLUMNS)).toEqual(Object.keys(emptyWorklogCash()))
  })

  it('AC-1601.1: WorklogSavedDay에는 선택 칸 cash만 더해지고 시재 없는 옛 모양도 그대로 통과한다', () => {
    expectTypeOf<WorklogSavedDay>().toEqualTypeOf<{
      day: WorklogDay
      bitFields: WorklogNumberKey[]
      memoFontPt?: MemoFontPt
      cash?: WorklogCash
    }>()
    const old: WorklogSavedDay = { day: emptyWorklogDay(), bitFields: [], memoFontPt: 11 }
    const withCash: WorklogSavedDay = { day: emptyWorklogDay(), bitFields: [], cash: emptyWorklogCash() }
    expect(old.cash).toBeUndefined()
    expect(withCash.cash).toEqual(emptyWorklogCash())
  })

  it('AC-1601.1: 칸 목록 32칸·WORKLOG_COLUMNS·빈 하루에는 시재 칸이 없다', () => {
    expect(WORKLOG_CELL_KEYS).toHaveLength(32)
    const cellKeys: readonly string[] = WORKLOG_CELL_KEYS
    for (const key of Object.keys(WORKLOG_CASH_COLUMNS)) expect(cellKeys).not.toContain(key)
    expect(Object.keys(WORKLOG_COLUMNS)).toEqual([...WORKLOG_CELL_KEYS])
    for (const column of Object.values(WORKLOG_CASH_COLUMNS)) expect(Object.values(WORKLOG_COLUMNS)).not.toContain(column)
    expect(Object.values(WORKLOG_COLUMNS).filter((column) => column.startsWith('cash_'))).toEqual(['cash_in'])
    expect(Object.keys(emptyWorklogDay())).toEqual([...WORKLOG_CELL_KEYS])
  })

  it('AC-1601.1: 글씨 크기 상수는 그대로다', () => {
    expect(MEMO_FONT_PTS).toEqual([8, 9, 10, 11, 12, 14, 16])
    expect(MEMO_FONT_DEFAULT).toBe(11)
  })
})

describe('countedWon · hasCount', () => {
  it('AC-1601.2: 장수 [6, 11, 1, 10, 6, 20, 0, 0]이면 430,000원이고 센 것이다', () => {
    const cash = cashOf(SHORT_COUNTS)
    expect(countedWon(cash)).toBe(430_000)
    expect(hasCount(cash)).toBe(true)
  })

  it('AC-1601.2: 모두 0이면 0원이고 안 센 것이다', () => {
    expect(countedWon(emptyWorklogCash())).toBe(0)
    expect(hasCount(emptyWorklogCash())).toBe(false)
  })

  it('AC-1601.2: 권종마다 장수 × 금액을 더한다(10원 1장만도 센 것이다)', () => {
    expect(countedWon(cashOf([0, 0, 0, 0, 0, 0, 0, 1]))).toBe(10)
    expect(hasCount(cashOf([0, 0, 0, 0, 0, 0, 0, 1]))).toBe(true)
    expect(countedWon(cashOf([1, 1, 1, 1, 1, 1, 1, 1]))).toBe(66_660)
    expect(countedWon(cashOf([9999, 0, 0, 0, 0, 0, 0, 0]))).toBe(499_950_000)
  })

  it('AC-1601.2: 시재·확인란·이유는 센 돈과 센 여부에 들지 않는다', () => {
    const cash = cashOf([0, 0, 0, 0, 0, 0, 0, 0], { floatWon: 300_000, refundCash: true, unpaidCash: true, reason: '메모' })
    expect(countedWon(cash)).toBe(0)
    expect(hasCount(cash)).toBe(false)
  })
})

describe('expectedWon · cellAmount', () => {
  it('AC-1601.3: 시재 300,000 + 현금수납 147,000 − 지출 현금 12,000이고 두 확인란이 꺼져 있으면 435,000이다', () => {
    expect(expectedWon(dayOf(), emptyWorklogCash(), 300_000)).toBe(435_000)
  })

  it('AC-1601.3: 환불을 켜면 427,000, 미수입금만 켜면 440,000, 둘 다 켜면 432,000이다', () => {
    expect(expectedWon(dayOf(), cashOf([], { refundCash: true }), 300_000)).toBe(427_000)
    expect(expectedWon(dayOf(), cashOf([], { unpaidCash: true }), 300_000)).toBe(440_000)
    expect(expectedWon(dayOf(), cashOf([], { refundCash: true, unpaidCash: true }), 300_000)).toBe(432_000)
  })

  it('AC-1601.3: 셈에 쓰는 시재는 세 번째 인자다(cash.floatWon이 아니다)', () => {
    expect(expectedWon(dayOf(), cashOf([], { floatWon: 100_000 }), 300_000)).toBe(435_000)
    expect(expectedWon(dayOf(), emptyWorklogCash(), 0)).toBe(135_000)
  })

  it('AC-1601.3: floatWon이 null이면 null이다', () => {
    expect(expectedWon(dayOf(), emptyWorklogCash(), null)).toBeNull()
    expect(expectedWon(dayOf(), cashOf(SHORT_COUNTS, { floatWon: 300_000 }), null)).toBeNull()
  })

  it.each([
    ['빈 칸', ''],
    ['빈칸만', '   '],
    ['숫자 없음', '현금'],
    ['단위 붙음', '1만'],
    ['숫자 둘', '1,000 2,000'],
    ['빼기 표시', '-5000'],
    ['쉼표 모양 틀림', '1,00'],
    ['전각 숫자', '１２０００'],
    ['개인정보 모양', '010-0000-1234'],
  ])('AC-1601.3: 현금수납이 %s(%s)이면 0으로 본다', (_name, text) => {
    expect(cellAmount(dayOf({ cashIn: text }), 'cashIn')).toBe(0)
    expect(expectedWon(dayOf({ cashIn: text }), emptyWorklogCash(), 300_000)).toBe(288_000)
  })

  it('AC-1601.3: 지출 현금·환불·미수입금도 숫자로 읽히지 않으면 0이다(확인란이 켜져 있어도)', () => {
    const day = dayOf({ spendCash: '모름', spendRefund: '', unpaidPaid: '오천' })
    const both = cashOf([], { refundCash: true, unpaidCash: true })
    expect(expectedWon(day, both, 300_000)).toBe(447_000)
  })

  it('AC-1601.3: cellAmount는 cellText.readCell 규칙대로 읽는다(쉼표·원·빈칸 허용)', () => {
    const day = dayOf({ cashIn: ' 147,000 원 ', spendCash: '12000', spendRefund: '8,000', unpaidPaid: '5000원' })
    expect(cellAmount(day, 'cashIn')).toBe(147_000)
    expect(cellAmount(day, 'spendCash')).toBe(12_000)
    expect(cellAmount(day, 'spendRefund')).toBe(8_000)
    expect(cellAmount(day, 'unpaidPaid')).toBe(5_000)
  })
})

describe('cashVerdict', () => {
  it('AC-1601.4: 한 칸도 안 셌으면 not-counted다(있어야 할 돈이 없어도)', () => {
    expect(cashVerdict(emptyWorklogCash(), 435_000)).toEqual({ kind: 'not-counted' })
    expect(cashVerdict(emptyWorklogCash(), null)).toEqual({ kind: 'not-counted' })
  })

  it('AC-1601.4: 셌는데 있어야 할 돈이 null이면 no-float다', () => {
    expect(cashVerdict(cashOf(SHORT_COUNTS), null)).toEqual({ kind: 'no-float' })
  })

  it('AC-1601.4: 같으면 match다(435,000원 vs 435,000원)', () => {
    expect(countedWon(cashOf(OK_COUNTS))).toBe(435_000)
    expect(cashVerdict(cashOf(OK_COUNTS), 435_000)).toEqual({ kind: 'match' })
  })

  it('AC-1601.4: 적으면 short와 모자란 원이다(430,000 vs 435,000 → 5,000)', () => {
    expect(cashVerdict(cashOf(SHORT_COUNTS), 435_000)).toEqual({ kind: 'short', won: 5_000 })
  })

  it('AC-1601.4: 많으면 over와 많은 원이다', () => {
    expect(cashVerdict(cashOf(SHORT_COUNTS), 427_000)).toEqual({ kind: 'over', won: 3_000 })
  })

  it('AC-1601.4: 있어야 할 돈이 0이거나 음수여도 차이로 본다', () => {
    expect(cashVerdict(cashOf([0, 0, 0, 0, 0, 0, 0, 1]), 0)).toEqual({ kind: 'over', won: 10 })
    expect(cashVerdict(cashOf([0, 0, 0, 0, 0, 0, 0, 1]), -100)).toEqual({ kind: 'over', won: 110 })
  })
})

describe('guessCashDifference', () => {
  it('AC-1601.5: 시안 예(−5,000, 일지 147,000 · 비트 142,000)는 비트 현금 다름 다음 5천원권 1장 더 줌이다', () => {
    expect(guessCashDifference(-5_000, 147_000, 142_000)).toEqual([
      { kind: 'bit-cash', typed: 147_000, bit: 142_000, gap: 5_000 },
      { kind: 'change', piece: 5000, count: 1, direction: 'more' },
    ])
  })

  it('AC-1601.5: 일지가 비트보다 적으면 gap이 음수다', () => {
    expect(guessCashDifference(3_000, 139_000, 142_000)).toEqual([
      { kind: 'bit-cash', typed: 139_000, bit: 142_000, gap: -3_000 },
    ])
  })

  it.each([
    [-5_000, 5000, 1, 'more'],
    [20_000, 10000, 2, 'less'],
    [100_000, 50000, 2, 'less'],
    [-100_000, 50000, 2, 'more'],
    [50_000, 50000, 1, 'less'],
    [-10_000, 10000, 1, 'more'],
    [1_000, 1000, 1, 'less'],
    [-2_000, 1000, 2, 'more'],
  ] as const)('AC-1601.5: 차이 %s원 → %s원권 %s장(%s: 모자라면 더 줌, 많으면 덜 줌)', (diff, piece, count, direction) => {
    expect(guessCashDifference(diff, 142_000, 142_000)).toEqual([{ kind: 'change', piece, count, direction }])
  })

  it.each([15_000, 3_000, 500, -500, 30_000, 150_000, 7_000, 10])(
    'AC-1601.5: 차이 %s원은 1~2장으로 나누어떨어지는 권종이 없어 none 하나다',
    (diff) => {
      expect(guessCashDifference(diff, 142_000, 142_000)).toEqual([{ kind: 'none' }])
    },
  )

  it('AC-1601.5: 비트 현금이 없으면(undefined) bit-cash가 없다', () => {
    expect(guessCashDifference(-5_000, 147_000, undefined)).toEqual([
      { kind: 'change', piece: 5000, count: 1, direction: 'more' },
    ])
    expect(guessCashDifference(-3_000, 147_000, undefined)).toEqual([{ kind: 'none' }])
  })

  it('AC-1601.5: 적은 현금수납이 숫자가 아니면(null) bit-cash가 없다', () => {
    expect(guessCashDifference(-3_000, null, 142_000)).toEqual([{ kind: 'none' }])
  })

  it('AC-1601.5: 일지와 비트 현금이 같으면 bit-cash가 없다', () => {
    expect(guessCashDifference(-5_000, 142_000, 142_000)).toEqual([
      { kind: 'change', piece: 5000, count: 1, direction: 'more' },
    ])
  })

  it('AC-1601.5: 비트 현금 0원도 숫자다(일지 5,000원이면 다름)', () => {
    expect(guessCashDifference(-3_000, 5_000, 0)).toEqual([{ kind: 'bit-cash', typed: 5_000, bit: 0, gap: 5_000 }])
  })
})

describe('입력 읽기: toCashCount · parseFloatSetting', () => {
  it.each([
    ['12a3', 123],
    ['', 0],
    ['123456', 1234],
    ['6', 6],
    ['0', 0],
    ['007', 7],
    [' 1 2 ', 12],
    ['1,000', 1000],
    ['장', 0],
    ['-3', 3],
    ['9999', 9999],
  ])('AC-1601.6: toCashCount(%j)는 %s다(숫자만, 앞 4자리)', (text, count) => {
    expect(toCashCount(text)).toBe(count)
  })

  it.each([
    ['300,000', 300_000],
    ['300000원', 300_000],
    [' 0 ', 0],
    ['300,000 원', 300_000],
    ['10,000,000', 10_000_000],
    ['250000', 250_000],
  ])('AC-1601.6: parseFloatSetting(%j)는 %s다', (text, won) => {
    expect(parseFloatSetting(text)).toBe(won)
  })

  it.each(['', '   ', '30만', '-1', '원', '3.5', '삼십만', '300,000원원', '₩300000'])(
    'AC-1601.6: parseFloatSetting(%j)는 invalid다',
    (text) => {
      expect(parseFloatSetting(text)).toBe('invalid')
    },
  )

  it.each(['10,000,001', '10000001원', '99999999999999999999'])('AC-1601.6: parseFloatSetting(%j)는 too-big이다', (text) => {
    expect(parseFloatSetting(text)).toBe('too-big')
  })
})

describe('withFloatSnapshot · toWorklogCash', () => {
  it('AC-1601.7: floatWon이 null이고 장수가 하나라도 있으면 floatWon이 설정 금액이 된다', () => {
    const cash = cashOf([0, 0, 0, 0, 0, 0, 0, 1], { reason: '메모' })
    expect(withFloatSnapshot(cash, 250_000)).toEqual({ ...cash, floatWon: 250_000 })
    expect(cash.floatWon).toBeNull() // 받은 값은 바꾸지 않는다
  })

  it('AC-1601.7: 설정 금액 0원도 그날 시재가 된다', () => {
    expect(withFloatSnapshot(cashOf(SHORT_COUNTS), 0).floatWon).toBe(0)
  })

  it('AC-1601.7: 이미 floatWon이 있으면 설정이 달라도 그대로다', () => {
    const cash = cashOf(SHORT_COUNTS, { floatWon: 300_000 })
    expect(withFloatSnapshot(cash, 500_000)).toEqual(cash)
  })

  it('AC-1601.7: 장수가 없으면 floatWon이 null 그대로다', () => {
    const cash = cashOf([], { refundCash: true, reason: '메모' })
    expect(withFloatSnapshot(cash, 300_000)).toEqual(cash)
    expect(withFloatSnapshot(emptyWorklogCash(), 300_000).floatWon).toBeNull()
  })

  it('AC-1601.7: 맞는 값은 그대로 읽는다', () => {
    const read = {
      count50000: 6,
      count10000: 11,
      count5000: 1,
      count1000: 10,
      count500: 6,
      count100: 20,
      count50: 0,
      count10: 9999,
      floatWon: 10_000_000,
      refundCash: true,
      unpaidCash: false,
      reason: '거스름돈 실수 같아요',
    }
    expect(toWorklogCash(read)).toEqual(read)
    expect(toWorklogCash({ ...read, floatWon: 0 }).floatWon).toBe(0)
    expect(toWorklogCash({ ...read, reason: 'ㄱ'.repeat(200) }).reason).toBe('ㄱ'.repeat(200))
  })

  it('AC-1601.7: 빈 값(칸이 없는 응답)은 빈 시재다', () => {
    expect(toWorklogCash({})).toEqual(emptyWorklogCash())
  })

  it.each([
    ['음수', -1],
    ['범위 밖', 10_000],
    ['소수', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['글자', '6'],
    ['null', null],
    ['참', true],
    ['배열', [6]],
    ['객체', { n: 6 }],
  ])('AC-1601.7: 장수가 %s이면 0으로 본다', (_name, value) => {
    for (const key of COUNT_KEYS) {
      expect(toWorklogCash({ count1000: 3, [key]: value })[key]).toBe(0)
    }
    expect(toWorklogCash({ count1000: 3, count500: value }).count1000).toBe(3)
  })

  it.each([
    ['음수', -1],
    ['범위 밖', 10_000_001],
    ['소수', 300_000.5],
    ['NaN', Number.NaN],
    ['글자', '300000'],
    ['null', null],
    ['undefined', undefined],
    ['참', true],
  ])('AC-1601.7: 시재가 %s이면 null로 본다', (_name, value) => {
    expect(toWorklogCash({ floatWon: value }).floatWon).toBeNull()
  })

  it.each([
    ['null', null],
    ['글자', 'true'],
    ['숫자', 1],
    ['undefined', undefined],
  ])('AC-1601.7: 확인란이 %s이면 거짓으로 본다', (_name, value) => {
    const read = toWorklogCash({ refundCash: value, unpaidCash: value })
    expect(read.refundCash).toBe(false)
    expect(read.unpaidCash).toBe(false)
  })

  it.each([
    ['null', null],
    ['숫자', 12],
    ['배열', ['메모']],
    ['201자', 'ㄱ'.repeat(201)],
  ])("AC-1601.7: 이유가 %s이면 ''로 본다", (_name, value) => {
    expect(toWorklogCash({ reason: value }).reason).toBe('')
  })
})

describe('보낼 값: cashSaveValue · cashReasonBlocked · wonText', () => {
  it('AC-1601.7: 장수·시재·확인란은 맞는 값이면 그대로 보낸다', () => {
    expect(cashSaveValue('count5000', 2)).toBe(2)
    expect(cashSaveValue('count10', 0)).toBe(0)
    expect(cashSaveValue('count50000', 9999)).toBe(9999)
    expect(cashSaveValue('floatWon', 300_000)).toBe(300_000)
    expect(cashSaveValue('floatWon', 0)).toBe(0)
    expect(cashSaveValue('floatWon', null)).toBeNull()
    expect(cashSaveValue('refundCash', true)).toBe(true)
    expect(cashSaveValue('unpaidCash', false)).toBe(false)
  })

  it('AC-1601.7: 범위 밖·모양이 틀린 장수·시재·확인란은 보내지 않는다(undefined)', () => {
    expect(cashSaveValue('count5000', -1)).toBeUndefined()
    expect(cashSaveValue('count5000', 10_000)).toBeUndefined()
    expect(cashSaveValue('count5000', 1.5)).toBeUndefined()
    expect(cashSaveValue('count5000', Number.NaN)).toBeUndefined()
    expect(cashSaveValue('count5000', '2' as unknown as number)).toBeUndefined()
    expect(cashSaveValue('floatWon', 10_000_001)).toBeUndefined()
    expect(cashSaveValue('floatWon', -1)).toBeUndefined()
    expect(cashSaveValue('floatWon', 0.5)).toBeUndefined()
    expect(cashSaveValue('refundCash', 'true' as unknown as boolean)).toBeUndefined()
    expect(cashSaveValue('unpaidCash', null as unknown as boolean)).toBeUndefined()
  })

  it('AC-1601.7: 이유는 앞뒤 빈칸을 빼고 보내며 비면 null이다', () => {
    expect(cashSaveValue('reason', '  거스름돈 실수  ')).toBe('거스름돈 실수')
    expect(cashSaveValue('reason', '')).toBeNull()
    expect(cashSaveValue('reason', '   ')).toBeNull()
    expect(cashSaveValue('reason', 'ㄱ'.repeat(200))).toBe('ㄱ'.repeat(200))
  })

  it('AC-1601.7: 200자를 넘는 이유·글이 아닌 이유는 보내지 않는다', () => {
    expect(cashSaveValue('reason', 'ㄱ'.repeat(201))).toBeUndefined()
    expect(cashSaveValue('reason', 12 as unknown as string)).toBeUndefined()
  })

  it('AC-1601.8: 개인정보 모양 이유는 notes.privacyProblem으로 막고 보내지 않는다(지어낸 번호)', () => {
    expect(cashReasonBlocked('환자 연락처 010-0000-1234')).toBe(true)
    expect(cashReasonBlocked('900101-1234567')).toBe(true)
    expect(cashReasonBlocked('a@b.co')).toBe(true)
    expect(cashReasonBlocked('거스름돈 5,000원 더 줬어요')).toBe(false)
    expect(cashReasonBlocked('')).toBe(false)
    expect(cashSaveValue('reason', '환자 연락처 010-0000-1234')).toBeUndefined()
  })

  it('AC-1601.3: wonText는 쉼표 금액에 원을 붙인다', () => {
    expect(wonText(147_000)).toBe('147,000원')
    expect(wonText(0)).toBe('0원')
    expect(wonText(10_000_000)).toBe('10,000,000원')
    expect(wonText(500)).toBe('500원')
  })
})

describe('만드는 규칙', () => {
  const source = () => readFileSync(SOURCE, 'utf8')

  it('AC-1601.8: cashFloat는 @/types/worklog·./cellText·./notes만 부르고 이유 막기는 notes를 쓴다', () => {
    const imports = [...source().matchAll(/from '([^']+)'/g)].map((match) => match[1])
    expect([...imports].sort()).toEqual(['./cellText', './notes', '@/types/worklog'])
    expect(source()).toMatch(/\bprivacyProblem\b/)
  })

  it.each([
    ['React', /react/i],
    ['supabase', /supabase/i],
    ['@/lib/storage', /@\/lib\/storage|lib\/storage/],
    ['localStorage', /\blocalStorage\b/],
    ['sessionStorage', /\bsessionStorage\b/],
    ['indexedDB', /\bindexedDB\b/],
    ['console', /\bconsole\b/],
    ['fetch', /\bfetch\b/],
    ['XMLHttpRequest', /\bXMLHttpRequest\b/],
    ['WebSocket', /\bWebSocket\b/],
  ])('AC-1601.8: cashFloat 소스에는 %s가 없다(순수 함수)', (_name, pattern) => {
    expect(source()).not.toMatch(pattern)
  })
})
