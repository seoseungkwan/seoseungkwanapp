import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  emptyWorklogDay,
  WORKLOG_COUNT_KEYS,
  WORKLOG_DEFAULT_NAMES,
  WORKLOG_NAME_KEYS,
  WORKLOG_NOTE_KEYS,
  WORKLOG_WON_KEYS,
  type WorklogChanges,
  type WorklogDay,
  type WorklogNameKey,
  type WorklogNumberKey,
} from '@/types/worklog'
import { worklogTotals } from './calc'
import {
  cellKindOf,
  cellSaveText,
  cellShownText,
  excludedSumKeys,
  readCell,
  readDayNumbers,
  type CellKind,
  type CellRead,
} from './cellText'
import { privacyProblem } from './notes'

// 칸 글자 읽기 (REQ-003, design.md 7절). 숫자·번호는 모두 둥근 가짜다
const NONE: CellRead = { kind: 'none' }
const EXCLUDED: CellRead = { kind: 'excluded' }
const num = (value: number): CellRead => ({ kind: 'number', value })
const KINDS: readonly CellKind[] = ['count', 'won']
const dayWith = (cells: WorklogChanges): WorklogDay => ({ ...emptyWorklogDay(), ...cells })

// 합계에 들어가는 열 칸(AC-003.13 문장 그대로). 상수와 다르면 시험이 잡는다
const SUM_KEYS: readonly WorklogNumberKey[] = [
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
const NOT_SUMMED_KEYS: readonly WorklogNumberKey[] = ['totalFee', 'claimAmount', 'unpaidNew', 'unpaidPaid']
const WORDS_KEYS = [...WORKLOG_NOTE_KEYS, 'memo', ...WORKLOG_NAME_KEYS] as const

describe('cellKindOf', () => {
  it.each(WORKLOG_COUNT_KEYS)('AC-003.10: %s은 인원 칸이다(5자리 한도)', (key) => {
    expect(cellKindOf(key)).toBe('count')
  })

  it.each(WORKLOG_WON_KEYS)('AC-003.10: %s은 금액 칸이다(12자리 한도)', (key) => {
    expect(cellKindOf(key)).toBe('won')
  })
})

describe('readCell', () => {
  it.each<[string, number]>([
    ['12000', 12_000],
    ['12,000', 12_000],
    ['12,000원', 12_000],
    ['12,000 원', 12_000],
    ['1,234,500원', 1_234_500],
    ['00012', 12],
    ['  12,000원  ', 12_000],
    ['0', 0],
    ['0원', 0],
    ['000', 0],
  ])('AC-003.6: 숫자만이거나 쉼표·원이 붙은 "%s"는 %d이다', (text, value) => {
    expect(readCell('won', text)).toEqual(num(value))
  })

  it.each(['', ' ', '   ', '\t\n', '　'])('AC-003.6: 빈 글자·공백뿐(%j)이면 없음이다', (text) => {
    for (const kind of KINDS) expect(readCell(kind, text)).toEqual(NONE)
  })

  it.each<[string, number]>([
    ['12,000 별도', 12_000],
    ['별도 12,000', 12_000],
    ['12,000-', 12_000],
    ['12,000.', 12_000],
    ['3건', 3],
    ['1,000,000 별도 보고', 1_000_000],
  ])('AC-003.7: 글 안에 숫자가 하나인 "%s"는 %d이다(쉼표는 한 숫자에 속한다)', (text, value) => {
    expect(readCell('won', text)).toEqual(num(value))
  })

  // 쉼표 규칙이 제대로 된 묶음까지 막지 않는다
  it.each<[string, number]>([
    ['12,000', 12_000],
    ['1,234,500', 1_234_500],
    ['1,000', 1_000],
    ['100,000', 100_000],
    ['12,000 별도', 12_000],
    ['12,000원', 12_000],
    ['00012', 12],
    ['0,000', 0],
    ['1200', 1_200],
  ])('AC-003.10: 쉼표가 3자리 묶음이거나 쉼표가 없는 "%s"는 그대로 %d이다', (text, value) => {
    expect(readCell('won', text)).toEqual(num(value))
  })

  it.each([
    '120,00',
    '3,4건',
    '10,000,20,000',
    '12,000,',
    '12,만원',
    '12,',
    '12,000,원',
    '12,000, 별도',
    '1,00',
    '1,0000',
    '1234,567',
    '12,,000',
    '12,000,00',
    '별도 120,00',
  ])('AC-003.10: 쉼표가 3자리 묶음이 아닌 "%s"는 합계 제외다', (text) => {
    for (const kind of KINDS) expect(readCell(kind, text)).toEqual(EXCLUDED)
  })

  it.each(['별도 보고', '별도', '원', '만원', '-', '.'])('AC-003.8: 숫자가 없는 "%s"는 없음이다', (text) => {
    for (const kind of KINDS) expect(readCell(kind, text)).toEqual(NONE)
  })

  it.each(['2건 12,000', '12 000', '10/28', '1,000 + 2,000', '1,000원 3건'])(
    'AC-003.9: 숫자가 둘 이상인 "%s"는 합계 제외다',
    (text) => {
      for (const kind of KINDS) expect(readCell(kind, text)).toEqual(EXCLUDED)
    },
  )

  it.each(['택배비. ₩5,000', '₩5,000', '￦5,000', '\\5,000'])('AC-003.10: 빼기 표시가 없는 원 표시 "%s"는 5,000으로 읽는다', (text) => {
    expect(readCell('won', text)).toEqual({ kind: 'number', value: 5000 })
  })

  it.each(['12.5', '.5', '. 5', '0.5', '별도 .5'])('AC-003.10: 소수점이 있는 "%s"는 합계 제외다', (text) => {
    for (const kind of KINDS) expect(readCell(kind, text)).toEqual(EXCLUDED)
  })

  it.each([
    '-5,000',
    '- 5,000',
    '-₩5,000',
    '- ₩5,000',
    '-₩ 5,000',
    '-￦5,000',
    '-\\5,000',
    '△₩5,000',
    '(₩5,000)',
    '−5,000',
    '− 5,000',
    '–5,000',
    '– 5,000',
    '—5,000',
    '— 5,000',
    '－5,000',
    '－ 5,000',
    '―5,000',
    '― 5,000',
    '‐5,000',
    '‐ 5,000',
    '‑5,000',
    '‑ 5,000',
    'ㅡ5,000',
    'ㅡ 5,000',
    '별도 ㅡ5,000',
    '△5,000',
    '△ 5,000',
    '▲5,000',
    '▲ 5,000',
    '▼5,000',
    '▼ 5,000',
    '(5,000)',
    '( 5,000 )',
    '(5,000',
    '（5,000）',
    '（ 5,000 ）',
    '（5,000',
    '－　5,000',
    '별도 -5,000',
    '별도 △5,000',
  ])('AC-003.10: 빼기 표시가 있는 "%s"는 합계 제외다', (text) => {
    for (const kind of KINDS) expect(readCell(kind, text)).toEqual(EXCLUDED)
  })

  it.each(['별도(12,000)', '별도 (12,000)', '별도（12,000）'])(
    'AC-003.10: 글 뒤에 괄호로 적은 "%s"도 숫자 바로 앞이 괄호라 합계 제외다',
    (text) => {
      for (const kind of KINDS) expect(readCell(kind, text)).toEqual(EXCLUDED)
    },
  )

  // 빼기 표시는 숫자 앞에서만 본다(design.md 7절 7번: 끝에 붙은 글자는 상관없다)
  it.each<[string, number]>([
    ['12,000 (별도)', 12_000],
    ['(별도) 12,000', 12_000],
    ['12,000)', 12_000],
    ['12,000—', 12_000],
    ['12,000△', 12_000],
    ['12,000ㅡ', 12_000],
    ['12,000―', 12_000],
  ])('AC-003.7: 숫자 앞이 빼기 표시가 아닌 "%s"는 %d이다', (text, value) => {
    expect(readCell('won', text)).toEqual(num(value))
  })

  it.each(['１２,０００', '１２０００', '１２,０００원', '별도 １２,０００', '12,０００', '１２,000'])(
    'AC-003.10: 전각 숫자가 든 "%s"는 합계 제외다',
    (text) => {
      for (const kind of KINDS) expect(readCell(kind, text)).toEqual(EXCLUDED)
    },
  )

  it.each(['０', '１', '２', '３', '４', '５', '６', '７', '８', '９'])(
    'AC-003.10: 전각 숫자 "%s"가 하나만 있어도 합계 제외다(없음이 아니다)',
    (digit) => {
      for (const kind of KINDS) {
        expect(readCell(kind, digit)).toEqual(EXCLUDED)
        expect(readCell(kind, `${digit}건`)).toEqual(EXCLUDED)
      }
    },
  )

  it('AC-003.10: 전각 숫자는 덩이를 찾기 전에 본다(보통 숫자가 하나 있어도 그 숫자로 읽지 않는다)', () => {
    expect(readCell('won', '12,000 １건')).toEqual(EXCLUDED)
    expect(readCell('won', '１건 12,000')).toEqual(EXCLUDED)
  })

  it.each(['12만원', '12 만원', '3십만원', '3 십만원', '3십', '3백원', '3 백원', '3천', '1억', '1조', '1,000만원', '12　만원'])(
    'AC-003.10: 숫자 바로 뒤에 단위가 있는 "%s"는 합계 제외다(곱하지 않는다)',
    (text) => {
      for (const kind of KINDS) expect(readCell(kind, text)).toEqual(EXCLUDED)
    },
  )

  it.each<[CellKind, string, CellRead]>([
    ['won', '100000000000', num(100_000_000_000)], // 12자리
    ['won', '100,000,000,000', num(100_000_000_000)],
    ['won', '1000000000000', EXCLUDED], // 13자리
    ['won', '1,000,000,000,000', EXCLUDED],
    ['count', '10000', num(10_000)], // 5자리
    ['count', '10,000', num(10_000)],
    ['count', '100000', EXCLUDED], // 6자리
    ['count', '100,000', EXCLUDED],
    ['won', '100000', num(100_000)], // 같은 글자도 금액 칸에서는 한도 안
  ])('AC-003.10: %s 칸 "%s"의 자릿수 한도(앞자리만 잘라 읽지 않는다)', (kind, text, expected) => {
    expect(readCell(kind, text)).toEqual(expected)
  })

  it.each<[CellKind, string, CellRead]>([
    ['won', '0100000000000', num(100_000_000_000)], // 13글자지만 앞의 0을 빼면 12자리
    ['won', '001000000000000', EXCLUDED], // 앞의 0을 빼도 13자리
    ['count', '0000000000010000', num(10_000)],
    ['count', '0,000,100,000', EXCLUDED],
  ])('AC-003.10: %s 칸 "%s"의 자릿수는 앞의 0을 세지 않는다', (kind, text, expected) => {
    expect(readCell(kind, text)).toEqual(expected)
  })

  it.each([
    '010-0000-1234',
    '01000001234',
    '010-00001234',
    '0200001234',
    '(02)000-1234',
    '+82 10-0000-1234',
    '900101-1234567',
    '900101 1234567',
    '9001011234567',
    '가상@example.com',
    '연락처 010-0000-1234',
  ])('AC-003.11: 개인정보 모양 "%s"는 합계 제외다', (text) => {
    for (const kind of KINDS) expect(readCell(kind, text)).toEqual(EXCLUDED)
  })

  it('AC-003.11: 앞뒤 공백이 있어도 개인정보 모양이면 합계 제외다', () => {
    expect(readCell('won', '  01000001234  ')).toEqual(EXCLUDED)
  })

  // 숫자 덩이가 둘이라도 합계 제외이므로, 막는 모양인지는 모양 검사로 따로 본다
  it('AC-003.11: "(02)123-4567"은 막는 모양으로 합계 제외다', () => {
    expect(privacyProblem('(02)123-4567')).toBe(true)
    for (const kind of KINDS) expect(readCell(kind, '(02)123-4567')).toEqual(EXCLUDED)
  })

  it('AC-003.6: 같은 글자를 거듭 읽어도 결과가 같다', () => {
    const results = [readCell('won', '12,000'), readCell('won', '12,000'), readCell('won', '12,000')]
    expect(results).toEqual([num(12_000), num(12_000), num(12_000)])
  })
})

// design.md 7절 표 그대로: 친 글자 | 읽기 | 합계 | "합계에서 빠졌어요"
describe('7절 표', () => {
  const NUMBER_ROWS: readonly [string, number][] = [
    ['12000', 12_000],
    ['12,000원', 12_000],
    ['12,000 원', 12_000],
    ['00012', 12],
    ['12,000 별도', 12_000],
    ['12,000-', 12_000],
    ['3건', 3],
  ]
  const NONE_ROWS: readonly string[] = ['별도 보고', '']
  const EXCLUDED_ROWS: readonly string[] = [
    '-₩5,000',
    '(₩5,000)',
    '2건 12,000',
    '12 000',
    '10/28',
    '12.5',
    '.5',
    '-5,000',
    '- 5,000',
    '△5,000',
    '(5,000)',
    'ㅡ5,000',
    '１２,０００',
    '120,00',
    '3,4건',
    '12,000,',
    '12만원',
    '12 만원',
    '3십만원',
    '3백원',
    '3천',
    '1억',
    '1조',
    '1000000000000',
    '010-0000-1234',
  ]

  it.each(NUMBER_ROWS)('AC-003.12: "%s"는 %d을 더하고 AC-003.13: 표시가 없다', (text, value) => {
    const day = dayWith({ cashIn: text })
    expect(readCell('won', text)).toEqual(num(value))
    expect(worklogTotals(readDayNumbers(day)).received).toBe(value)
    expect(excludedSumKeys(day)).toEqual([])
  })

  it.each(NONE_ROWS)('AC-003.12: "%s"는 더하지 않고 AC-003.13: 표시가 없다', (text) => {
    const day = dayWith({ cashIn: text })
    expect(readCell('won', text)).toEqual(NONE)
    expect(worklogTotals(readDayNumbers(day)).received).toBe(0)
    expect(excludedSumKeys(day)).toEqual([])
  })

  it.each(EXCLUDED_ROWS)('AC-003.12: "%s"는 더하지 않고 AC-003.13: 표시가 있다', (text) => {
    const day = dayWith({ cashIn: text })
    expect(readCell('won', text)).toEqual(EXCLUDED)
    expect(worklogTotals(readDayNumbers(day)).received).toBe(0)
    expect(excludedSumKeys(day)).toEqual(['cashIn'])
  })

  it('AC-003.12: 인원 6자리는 더하지 않고 AC-003.13: 표시가 있다', () => {
    const day = dayWith({ newPatients: '100000' })
    expect(worklogTotals(readDayNumbers(day)).visits).toBe(0)
    expect(excludedSumKeys(day)).toEqual(['newPatients'])
  })
})

describe('readDayNumbers', () => {
  it('AC-003.12: 숫자 칸 14개만 읽고 업무사항·비고·항목 이름은 읽지 않는다', () => {
    const numbers = readDayNumbers(dayWith({ memo: '100,000', noteCash: '100,000', nameCashIn: '100,000' }))
    expect(Object.keys(numbers).sort()).toEqual([...WORKLOG_COUNT_KEYS, ...WORKLOG_WON_KEYS].sort())
    expect(Object.values(numbers).every((value) => value === null)).toBe(true)
  })

  it('AC-003.12: 숫자로 읽힌 칸만 값이 있고 없음·합계 제외 칸은 값이 없다', () => {
    const numbers = readDayNumbers(
      dayWith({ cashIn: '12,000 별도', cardIn: '2건 12,000', transferIn: '별도 보고', localCurrencyIn: '', spendCash: '0' }),
    )
    expect(numbers.cashIn).toBe(12_000)
    expect(numbers.cardIn).toBeNull()
    expect(numbers.transferIn).toBeNull()
    expect(numbers.localCurrencyIn).toBeNull()
    expect(numbers.spendCash).toBe(0)
  })

  it('AC-003.12: 칸 종류에 맞는 자릿수 한도로 읽는다', () => {
    const numbers = readDayNumbers(dayWith({ newPatients: '100000', returnPatients: '10000', cashIn: '100000' }))
    expect(numbers.newPatients).toBeNull()
    expect(numbers.returnPatients).toBe(10_000)
    expect(numbers.cashIn).toBe(100_000)
  })

  it('AC-003.12: 합계는 읽은 숫자로만 낸다: 12,000 별도는 더하고 2건 12,000은 안 더한다', () => {
    const day = dayWith({
      newPatients: '100명',
      returnPatients: '2건 100',
      cashIn: '12,000 별도',
      cardIn: '2건 12,000',
      transferIn: '10,000원',
      localCurrencyIn: '별도 보고',
      totalFee: '1,000,000',
      spendCash: '1,000 별도',
      spendCard: '-5,000',
      spendRefund: '2,000',
      spendFree: '3만원',
      memo: '100,000',
      noteCash: '100,000',
      nameSpendFree: '100,000',
    })
    expect(worklogTotals(readDayNumbers(day))).toEqual({ visits: 100, received: 22_000, spent: 3_000, net: 19_000 })
  })
})

describe('excludedSumKeys', () => {
  it('AC-003.13: 합계에 들어가는 열 칸이 모두 합계 제외면 그 순서로 돌려준다', () => {
    const day = dayWith(Object.fromEntries(SUM_KEYS.map((key) => [key, '2건 12,000'])))
    expect(excludedSumKeys(day)).toEqual(SUM_KEYS)
  })

  it.each(SUM_KEYS)('AC-003.13: 열 칸 %s는 합계 제외일 때 든다', (key) => {
    expect(excludedSumKeys(dayWith({ [key]: '2건 12,000' }))).toEqual([key])
  })

  it.each(NOT_SUMMED_KEYS)('AC-003.13: %s는 어떤 글자여도 들지 않는다', (key) => {
    for (const text of ['2건 12,000', '-5,000', 'ㅡ5,000', '△5,000', '(5,000)', '１２,０００', '120,00', '12만원', '3십만원', '010-0000-1234']) {
      expect(excludedSumKeys(dayWith({ [key]: text }))).toEqual([])
    }
  })

  it.each(WORDS_KEYS)('AC-003.13: 업무사항·비고·항목 이름 %s의 숫자는 들지 않는다', (key) => {
    expect(excludedSumKeys(dayWith({ [key]: '2건 12,000' }))).toEqual([])
  })

  it('AC-003.13: 칸 종류의 한도로 본다(같은 6자리가 인원에서만 든다)', () => {
    expect(excludedSumKeys(dayWith({ newPatients: '100000', cashIn: '100000' }))).toEqual(['newPatients'])
  })
})

describe('cellShownText', () => {
  it.each<[string, string, string]>([
    ['1234500', '1,234,500원', '1,234,500'],
    ['1,234,500', '1,234,500원', '1,234,500'],
    ['1,234,500원', '1,234,500원', '1,234,500'],
    ['1,234,500 원', '1,234,500원', '1,234,500'],
    ['  12,000원  ', '12,000원', '12,000'],
    ['00012', '12원', '12'],
    ['100000000000', '100,000,000,000원', '100,000,000,000'],
  ])('AC-003.14: 금액 칸 "%s"는 엑셀 모양 "%s", 초점 중 "%s"다', (text, shown, focused) => {
    expect(cellShownText('won', text, false)).toBe(shown)
    expect(cellShownText('won', text, true)).toBe(focused)
  })

  it.each<[string, string]>([
    ['86', '86'],
    ['00086', '86'],
    ['86원', '86'],
    ['1,000', '1000'],
    ['10000', '10000'],
  ])('AC-003.14: 인원 칸 "%s"는 숫자만 "%s"다(초점과 상관없이)', (text, shown) => {
    expect(cellShownText('count', text, false)).toBe(shown)
    expect(cellShownText('count', text, true)).toBe(shown)
  })

  it.each(['0', '0원', '000', '0 원'])('AC-003.14: 0인 "%s"는 빈 글자다', (text) => {
    for (const kind of KINDS) {
      expect(cellShownText(kind, text, false)).toBe('')
      expect(cellShownText(kind, text, true)).toBe('')
    }
  })

  it.each([
    '12,000 별도',
    '별도 12,000',
    '12,000-',
    '3건',
    '별도 보고',
    '2건 12,000',
    '12 000',
    '10/28',
    '12.5',
    '.5',
    '-5,000',
    '- 5,000',
    '—5,000',
    '－5,000',
    'ㅡ5,000',
    '―5,000',
    '‐5,000',
    '‑5,000',
    '△5,000',
    '▲5,000',
    '▼5,000',
    '(5,000)',
    '（5,000）',
    '별도(12,000)',
    '１２,０００',
    '12,０００',
    '120,00',
    '3,4건',
    '10,000,20,000',
    '12,000,',
    '12,000,원',
    '12,만원',
    '12만원',
    '12 만원',
    '3십만원',
    '3백원',
    '3천',
    '1억',
    '1조',
    '1000000000000',
    '010-0000-1234',
    '01000001234',
    '(02)123-4567',
  ])('AC-003.14: 글이 섞이거나 합계 제외인 "%s"는 친 글자 그대로다', (text) => {
    for (const focused of [false, true]) expect(cellShownText('won', text, focused)).toBe(text)
  })

  it('AC-003.14: 인원 6자리는 친 글자 그대로다(같은 글자도 금액 칸은 엑셀 모양)', () => {
    expect(cellShownText('count', '100000', false)).toBe('100000')
    expect(cellShownText('won', '100000', false)).toBe('100,000원')
  })

  it('AC-003.14: 막는 모양은 쉼표 금액으로 보이지 않는다', () => {
    expect(cellShownText('won', '01000001234', false)).toBe('01000001234')
    expect(cellShownText('won', '0200001234', true)).toBe('0200001234')
    expect(cellShownText('won', '9001011234567', false)).toBe('9001011234567')
  })

  it('AC-003.14: 그대로 보일 때는 앞뒤 공백을 지운 글자이고 빈 칸은 빈 글자다', () => {
    expect(cellShownText('won', '  12,000 별도  ', false)).toBe('12,000 별도')
    expect(cellShownText('won', '', false)).toBe('')
    expect(cellShownText('won', '   ', true)).toBe('')
  })
})

describe('cellSaveText', () => {
  it.each([...WORKLOG_COUNT_KEYS, ...WORKLOG_WON_KEYS])('AC-003.15: 숫자 칸 %s는 앞뒤 공백만 지운다', (key) => {
    expect(cellSaveText(key, '12,000 별도 ')).toBe('12,000 별도')
    expect(cellSaveText(key, '  12,000원')).toBe('12,000원')
    expect(cellSaveText(key, '1,234,500 원')).toBe('1,234,500 원')
    expect(cellSaveText(key, '00012')).toBe('00012')
    expect(cellSaveText(key, '   ')).toBe('')
  })

  it('AC-003.15: 숫자 칸은 글자가 기본 이름과 같아도 그대로다', () => {
    expect(cellSaveText('cashIn', ' 현금수납 ')).toBe('현금수납')
  })

  it.each(WORKLOG_NAME_KEYS)('AC-003.15: 항목 이름 %s는 기본 이름과 같으면 빈 글자다', (key) => {
    expect(cellSaveText(key, WORKLOG_DEFAULT_NAMES[key])).toBe('')
    expect(cellSaveText(key, ` ${WORKLOG_DEFAULT_NAMES[key]}  `)).toBe('')
  })

  it.each<[WorklogNameKey, string, string]>([
    ['nameSpendFree', ' 식대 ', '식대'],
    ['nameSpendFree', 'Free', 'Free'],
    ['nameSpendCash', '카드', '카드'], // 다른 칸의 기본 이름은 기본 이름이 아니다
    ['nameCashIn', '현금', '현금'],
    ['nameCashIn', '   ', ''],
  ])('AC-003.15: 항목 이름 %s의 "%s"는 앞뒤 공백만 지운다', (key, text, saved) => {
    expect(cellSaveText(key, text)).toBe(saved)
  })

  it.each([...WORKLOG_NOTE_KEYS, 'memo'] as const)('AC-003.15: 비고·업무사항 %s는 그대로다', (key) => {
    expect(cellSaveText(key, '  오전 회의\n  ')).toBe('  오전 회의\n  ')
    expect(cellSaveText(key, '   ')).toBe('   ')
  })
})

describe('만드는 규칙', () => {
  const importsOf = (path: string) =>
    [...readFileSync(path, 'utf8').matchAll(/from '([^']+)'/g)].map((match) => match[1])

  it('AC-003.12: cellText는 calc·notes·types만 부르고 calc는 cellText를 부르지 않는다', () => {
    expect(importsOf('src/lib/worklog/cellText.ts').sort()).toEqual(['./calc', './notes', '@/types/worklog'])
    expect(importsOf('src/lib/worklog/calc.ts')).not.toContain('./cellText')
  })

  it.each(['console', 'fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'throw'])(
    'AC-003.12: cellText에는 %s가 없다(순수 함수, 칸 글자를 오류·로그에 넣지 않는다)',
    (word) => {
      expect(readFileSync('src/lib/worklog/cellText.ts', 'utf8')).not.toMatch(new RegExp(`\\b${word}\\b`))
    },
  )
})
