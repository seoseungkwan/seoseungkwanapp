import { describe, expect, it } from 'vitest'
import type { RevenueDayRow } from '@/types/revenue'
import {
  emptyWorklogDay,
  WORKLOG_CELL_KEYS,
  type WorklogCellKey,
  type WorklogChanges,
  type WorklogDay,
  type WorklogNumberKey,
} from '@/types/worklog'
import { BIT_FILL_KEYS, bitValuesFrom, dropBitField, mergeBit, takeBitValue, type BitValues } from './bitFill'

// 비트 숫자 맞추기 (REQ-014, design.md 20-2·20-3절). 숫자는 모두 둥근 가짜다
const dayWith = (cells: WorklogChanges): WorklogDay => ({ ...emptyWorklogDay(), ...cells })

// 칸마다 다른 둥근 숫자(칸을 잘못 이으면 시험이 잡는다)
const ROW: RevenueDayRow = {
  date: '2026-01-05',
  visits: 30,
  newPatients: 10,
  returnVisits: 20,
  total: 1000000,
  insurer: 600000,
  noncovered: 50000,
  copay: 300000,
  otherTotal: 50000,
  cash: 100000,
  card: 500000,
  transfer: 200000,
  receivableIn: 40000,
  unconfirmed: false,
  splitUnconfirmed: false,
}
const UNCONFIRMED_ROW: RevenueDayRow = {
  ...ROW,
  total: null,
  insurer: null,
  noncovered: null,
  copay: null,
  otherTotal: null,
  cash: null,
  card: null,
  transfer: null,
  receivableIn: null,
  unconfirmed: true,
}
const SPLIT_ROW: RevenueDayRow = {
  ...ROW,
  insurer: null,
  noncovered: null,
  copay: null,
  otherTotal: null,
  splitUnconfirmed: true,
}

// 20-2절 표 그대로(업무일지 칸 ← revenue.days 칸)
const FULL_VALUES: BitValues = {
  newPatients: 10,
  returnPatients: 20,
  totalFee: 1000000,
  claimAmount: 600000,
  cashIn: 100000,
  cardIn: 500000,
  transferIn: 200000,
  unpaidPaid: 40000,
}
const MONEY_FILL_KEYS: readonly WorklogNumberKey[] = [
  'totalFee',
  'claimAmount',
  'cashIn',
  'cardIn',
  'transferIn',
  'unpaidPaid',
]
const NOT_FILLED_KEYS: readonly WorklogCellKey[] = WORKLOG_CELL_KEYS.filter(
  (key) => !(BIT_FILL_KEYS as readonly WorklogCellKey[]).includes(key),
)

describe('BIT_FILL_KEYS', () => {
  it('AC-014.1: 채우는 칸은 20-2절 표의 여덟 칸이다(미수발생·지역화폐 없음)', () => {
    expect(BIT_FILL_KEYS).toEqual([
      'newPatients',
      'returnPatients',
      'totalFee',
      'claimAmount',
      'cashIn',
      'cardIn',
      'transferIn',
      'unpaidPaid',
    ])
    expect(BIT_FILL_KEYS).not.toContain('unpaidNew')
    expect(BIT_FILL_KEYS).not.toContain('localCurrencyIn')
  })
})

describe('bitValuesFrom', () => {
  it('AC-014.1: 하루 줄의 칸을 20-2절 표 그대로 업무일지 칸에 잇는다(copay·otherTotal·visits·noncovered는 쓰지 않는다)', () => {
    expect(bitValuesFrom(ROW)).toEqual({ values: FULL_VALUES, unconfirmed: false })
  })

  it('AC-014.1: 미수발생·지역화폐는 늘 비트 값이 없다', () => {
    const { values } = bitValuesFrom(ROW)
    expect('unpaidNew' in values).toBe(false)
    expect('localCurrencyIn' in values).toBe(false)
  })

  it('AC-014.1: null인 칸은 비트 값이 없다(0으로 지어내지 않는다)', () => {
    const { values } = bitValuesFrom({ ...ROW, card: null, receivableIn: null, newPatients: null })
    expect('cardIn' in values).toBe(false)
    expect('unpaidPaid' in values).toBe(false)
    expect('newPatients' in values).toBe(false)
    expect(values).toEqual({
      returnPatients: 20,
      totalFee: 1000000,
      claimAmount: 600000,
      cashIn: 100000,
      transferIn: 200000,
    })
  })

  it('AC-014.1: 0은 값이다(null과 다르다)', () => {
    const { values } = bitValuesFrom({ ...ROW, transfer: 0, newPatients: 0 })
    expect(values.transferIn).toBe(0)
    expect(values.newPatients).toBe(0)
  })

  it('AC-014.1: 줄이 없으면 비트 값이 없고 확인 필요도 아니다', () => {
    expect(bitValuesFrom(null)).toEqual({ values: {}, unconfirmed: false })
  })

  it('AC-014.2: 신환 = newPatients, 재진 = returnVisits', () => {
    const { values } = bitValuesFrom({ ...ROW, newPatients: 7, returnVisits: 23 })
    expect(values.newPatients).toBe(7)
    expect(values.returnPatients).toBe(23)
  })

  it('AC-014.2: unconfirmed인 날은 신환·재진은 채우고 금액 여섯 칸은 없다', () => {
    const result = bitValuesFrom(UNCONFIRMED_ROW)
    expect(result).toEqual({ values: { newPatients: 10, returnPatients: 20 }, unconfirmed: true })
    for (const key of MONEY_FILL_KEYS) expect(key in result.values).toBe(false)
  })

  it('AC-014.2: unconfirmed인 날 인원이 null이면 그 칸도 없다', () => {
    const result = bitValuesFrom({ ...UNCONFIRMED_ROW, returnVisits: null })
    expect(result).toEqual({ values: { newPatients: 10 }, unconfirmed: true })
  })

  it('AC-014.2: splitUnconfirmed인 날은 조합청구액만 없고 나머지 일곱 칸은 채운다(unconfirmed: false)', () => {
    const result = bitValuesFrom(SPLIT_ROW)
    expect(result.unconfirmed).toBe(false)
    expect('claimAmount' in result.values).toBe(false)
    expect(result.values).toEqual({
      newPatients: 10,
      returnPatients: 20,
      totalFee: 1000000,
      cashIn: 100000,
      cardIn: 500000,
      transferIn: 200000,
      unpaidPaid: 40000,
    })
  })

  it('AC-014.2: splitUnconfirmed인 날은 insurer에 숫자가 와도 조합청구액을 채우지 않는다(계약을 어긴 줄)', () => {
    const result = bitValuesFrom({ ...ROW, splitUnconfirmed: true })
    expect(result.unconfirmed).toBe(false)
    expect('claimAmount' in result.values).toBe(false)
    expect(result.values).toEqual({
      newPatients: 10,
      returnPatients: 20,
      totalFee: 1000000,
      cashIn: 100000,
      cardIn: 500000,
      transferIn: 200000,
      unpaidPaid: 40000,
    })
  })

  it('AC-014.2: unconfirmed인 날은 금액 칸에 숫자가 와도 채우지 않고 신환·재진만 채운다(계약을 어긴 줄)', () => {
    const result = bitValuesFrom({ ...ROW, unconfirmed: true })
    expect(result).toEqual({ values: { newPatients: 10, returnPatients: 20 }, unconfirmed: true })
    for (const key of MONEY_FILL_KEYS) expect(key in result.values).toBe(false)
  })
})

describe('mergeBit', () => {
  it('AC-014.3: 빈 칸은 비트 값을 숫자 글자로 채우고 비트 칸으로 둔다', () => {
    const day = emptyWorklogDay()
    const result = mergeBit(day, [], FULL_VALUES)
    expect(result.day.cashIn).toBe('100000')
    expect(result.day.totalFee).toBe('1000000')
    expect(result.day.newPatients).toBe('10')
    expect(result.day.returnPatients).toBe('20')
    expect([...result.bitFields].sort()).toEqual([...BIT_FILL_KEYS].sort())
    expect(result.changed).toBe(true)
    expect(result.differs).toEqual([])
    expect(day.cashIn).toBe('') // 받은 하루는 바꾸지 않는다
  })

  it('AC-014.3: 0도 숫자 글자 "0"으로 채운다', () => {
    const result = mergeBit(emptyWorklogDay(), [], { transferIn: 0 })
    expect(result.day.transferIn).toBe('0')
    expect(result.bitFields).toEqual(['transferIn'])
  })

  it('AC-014.3: 비트 값이 없는 칸은 비워 둔다(지어내지 않는다)', () => {
    const result = mergeBit(emptyWorklogDay(), [], bitValuesFrom(UNCONFIRMED_ROW).values)
    for (const key of MONEY_FILL_KEYS) expect(result.day[key]).toBe('')
    expect(result.day.newPatients).toBe('10')
    expect(result.day.returnPatients).toBe('20')
    expect([...result.bitFields].sort()).toEqual(['newPatients', 'returnPatients'])
  })

  it('AC-014.3: 비트 값이 하나도 없으면 아무것도 바뀌지 않는다', () => {
    const day = dayWith({ cashIn: '100,000' })
    const result = mergeBit(day, [], {})
    expect(result.day).toEqual(day)
    expect(result.bitFields).toEqual([])
    expect(result.changed).toBe(false)
    expect(result.differs).toEqual([])
  })

  it('AC-014.4: 비트 칸은 바뀐 비트 값을 따라간다', () => {
    const day = dayWith({ cashIn: '100000', newPatients: '10' })
    const result = mergeBit(day, ['cashIn', 'newPatients'], { cashIn: 150000, newPatients: 12 })
    expect(result.day.cashIn).toBe('150000')
    expect(result.day.newPatients).toBe('12')
    expect(result.bitFields).toEqual(['cashIn', 'newPatients'])
    expect(result.changed).toBe(true)
    expect(result.differs).toEqual([])
  })

  it('AC-014.4: 비트 칸 값이 그대로면 바뀐 것이 없다', () => {
    const day = dayWith({ cashIn: '100000' })
    const result = mergeBit(day, ['cashIn'], { cashIn: 100000 })
    expect(result.day).toEqual(day)
    expect(result.bitFields).toEqual(['cashIn'])
    expect(result.changed).toBe(false)
  })

  it('AC-014.4: 사람이 비운 비트 칸은 다시 채운다', () => {
    const result = mergeBit(emptyWorklogDay(), ['cashIn'], { cashIn: 100000 })
    expect(result.day.cashIn).toBe('100000')
    expect(result.bitFields).toEqual(['cashIn'])
    expect(result.changed).toBe(true)
  })

  it('AC-014.4: 비트 값이 사라진 비트 칸(그날이 확인 필요로 바뀜)은 값을 지우거나 지어내지 않고 비트 칸으로 남는다', () => {
    const day = dayWith({ cashIn: '100000' })
    const result = mergeBit(day, ['cashIn'], bitValuesFrom(UNCONFIRMED_ROW).values)
    expect(result.day.cashIn).toBe('100000')
    expect(result.bitFields).toContain('cashIn')
    expect(result.differs).toEqual([])
    expect(result.day.newPatients).toBe('10')
    expect(result.day.returnPatients).toBe('20')

    const filled = dayWith({ cashIn: '100000', newPatients: '10', returnPatients: '20' })
    const fields: WorklogNumberKey[] = ['cashIn', 'newPatients', 'returnPatients']
    const again = mergeBit(filled, fields, bitValuesFrom(UNCONFIRMED_ROW).values)
    expect(again.day).toEqual(filled)
    expect(again.bitFields).toEqual(fields)
    expect(again.differs).toEqual([])
    expect(again.changed).toBe(false)
  })

  it.each(['125,000원', '125,000 별도', '125000'])(
    'AC-014.5: 적은 칸 "%s"는 읽은 숫자가 비트 값과 같으면 아무 일도 없다',
    (typed) => {
      const day = dayWith({ cashIn: typed })
      const result = mergeBit(day, [], { cashIn: 125000 })
      expect(result.day.cashIn).toBe(typed)
      expect(result.bitFields).toEqual([])
      expect(result.changed).toBe(false)
      expect(result.differs).toEqual([])
    },
  )

  it.each(['120,000', '별도 보고', '2건 125,000'])(
    'AC-014.5: 적은 칸 "%s"(다른 숫자·숫자 없음·합계 제외)는 그대로 두고 다름으로 알린다',
    (typed) => {
      const day = dayWith({ cashIn: typed })
      const result = mergeBit(day, [], { cashIn: 125000 })
      expect(result.day.cashIn).toBe(typed)
      expect(result.bitFields).toEqual([])
      expect(result.changed).toBe(false)
      expect(result.differs).toEqual([{ key: 'cashIn', typed, bit: 125000 }])
    },
  )

  it('AC-014.5: 인원 칸도 같은 규칙으로 견준다', () => {
    const day = dayWith({ newPatients: '10명', returnPatients: '15' })
    const result = mergeBit(day, [], { newPatients: 10, returnPatients: 20 })
    expect(result.day.newPatients).toBe('10명')
    expect(result.day.returnPatients).toBe('15')
    expect(result.differs).toEqual([{ key: 'returnPatients', typed: '15', bit: 20 }])
    expect(result.changed).toBe(false)
  })

  it('AC-014.5: 빈 칸 채우기와 다름 알리기가 한 번에 된다', () => {
    const day = dayWith({ cashIn: '120,000' })
    const result = mergeBit(day, [], { cashIn: 125000, cardIn: 500000 })
    expect(result.day.cashIn).toBe('120,000')
    expect(result.day.cardIn).toBe('500000')
    expect(result.bitFields).toEqual(['cardIn'])
    expect(result.changed).toBe(true)
    expect(result.differs).toEqual([{ key: 'cashIn', typed: '120,000', bit: 125000 }])
  })

  it('AC-014.7: 지출·비고·업무사항·항목 이름은 건드리지 않는다(지출 값이 와도)', () => {
    const day = dayWith({
      spendCash: '',
      spendCard: '30,000',
      noteCash: '가상 비고',
      noteTotal: '',
      memo: '가상 업무사항',
      nameTotalFee: '가상 총액',
      localCurrencyIn: '',
      unpaidNew: '',
    })
    const bit: BitValues = { ...FULL_VALUES, spendCash: 100000, spendCard: 200000, localCurrencyIn: 300000, unpaidNew: 400000 }
    const result = mergeBit(day, [], bit)
    for (const key of NOT_FILLED_KEYS) expect(result.day[key]).toBe(day[key])
    for (const key of ['spendCash', 'spendCard', 'localCurrencyIn', 'unpaidNew'] as const) {
      expect(result.bitFields).not.toContain(key)
    }
    expect(result.differs.map((item) => item.key)).not.toContain('spendCard')
  })

  it('AC-014.8: 항목 이름을 고친 칸도 이름을 보지 않고 같은 칸에 채운다', () => {
    const day = dayWith({ nameCashIn: '가상 항목', nameCardIn: '현금수납', nameTotalFee: '카드수납' })
    const result = mergeBit(day, [], FULL_VALUES)
    expect(result.day.cashIn).toBe('100000')
    expect(result.day.cardIn).toBe('500000')
    expect(result.day.totalFee).toBe('1000000')
    expect(result.day.nameCashIn).toBe('가상 항목')
    expect(result.day.nameCardIn).toBe('현금수납')
    expect(result.day.nameTotalFee).toBe('카드수납')
    expect(result.bitFields).toContain('cashIn')
  })
})

describe('takeBitValue', () => {
  it('AC-014.6: [비트 숫자로 바꾸기]는 적은 글자를 덮어 숫자 글자로 바꾸고 비트 칸이 된다', () => {
    const day = dayWith({ cashIn: '120,000 별도', cardIn: '별도 보고' })
    const bit: BitValues = { cashIn: 125000, cardIn: 500000 }
    const before = mergeBit(day, [], bit)
    expect(before.differs.map((item) => item.key)).toEqual(['cashIn', 'cardIn'])

    const result = takeBitValue(day, [], 'cashIn', bit)
    expect(result.day.cashIn).toBe('125000')
    expect(result.day.cardIn).toBe('별도 보고')
    expect(result.bitFields).toEqual(['cashIn'])
    expect(result.changed).toBe(true)
    expect(result.differs).toEqual([{ key: 'cardIn', typed: '별도 보고', bit: 500000 }])
    expect(day.cashIn).toBe('120,000 별도') // 받은 하루는 바꾸지 않는다
  })

  it('AC-014.6: 비트 값이 없는 칸은 바꾸지 않는다', () => {
    const day = dayWith({ claimAmount: '600,000' })
    const result = takeBitValue(day, [], 'claimAmount', bitValuesFrom(SPLIT_ROW).values)
    expect(result.day.claimAmount).toBe('600,000')
    expect(result.bitFields).not.toContain('claimAmount')
  })

  it('AC-014.6: 사람이 고친 비트 칸은 비트 칸이 아니게 되고, 다음 맞추기에서 덮지 않고 다름으로 알린다', () => {
    const filled = mergeBit(emptyWorklogDay(), [], { cashIn: 100000 })
    expect(filled.bitFields).toEqual(['cashIn'])

    const edited = dayWith({ ...filled.day, cashIn: '90,000' })
    const bitFields = dropBitField(filled.bitFields, 'cashIn')
    expect(bitFields).toEqual([])
    expect(filled.bitFields).toEqual(['cashIn']) // 받은 목록은 바꾸지 않는다

    const next = mergeBit(edited, bitFields, { cashIn: 110000 })
    expect(next.day.cashIn).toBe('90,000')
    expect(next.bitFields).toEqual([])
    expect(next.differs).toEqual([{ key: 'cashIn', typed: '90,000', bit: 110000 }])
  })

  it('AC-014.7: 채우는 여덟 칸 밖(지출)은 바꾸기로도 건드리지 않는다', () => {
    const day = dayWith({ spendCash: '30,000' })
    const result = takeBitValue(day, [], 'spendCash', { spendCash: 100000 })
    expect(result.day).toEqual(day)
    expect(result.bitFields).toEqual([])
    expect(result.changed).toBe(false)
  })

  it('AC-014.6: 목록에 없는 칸을 빼도 목록은 그대로다', () => {
    expect(dropBitField(['cardIn'], 'cashIn')).toEqual(['cardIn'])
  })
})
