// revenue.days 답 검사(TASK-2, REQ-002 · AC-002.2·AC-002.3). 숫자는 모두 가짜다. 환자 칸(차트번호·이름)이 섞인 답은 막혀야 한다
import { describe, expect, it } from 'vitest'
import { addDays } from '@/lib/analytics/dates'
import {
  REVENUE_DAY_KEYS,
  REVENUE_KEPT_KEYS,
  REVENUE_MONEY_KEYS,
  REVENUE_SPLIT_KEYS,
  type RevenueCodeRow,
  type RevenueDayRow,
  type RevenueDaysResult,
} from '@/types/revenue'
import { checkResult } from './protocol'

const DAY_KEYS = [
  'date',
  'visits',
  'newPatients',
  'returnVisits',
  'patientsToDate',
  'total',
  'insurer',
  'noncovered',
  'copay',
  'otherTotal',
  'cash',
  'card',
  'transfer',
  'receivableIn',
  'unconfirmed',
  'splitUnconfirmed',
] as const
const COUNT_KEYS = ['visits', 'newPatients', 'returnVisits', 'patientsToDate'] as const
const MONEY_KEYS = ['total', 'insurer', 'noncovered', 'copay', 'otherTotal', 'cash', 'card', 'transfer', 'receivableIn'] as const
const NUMBER_KEYS = [...COUNT_KEYS, ...MONEY_KEYS] as const
/** 나눔 네 칸: splitUnconfirmed면 이 넷만 null */
const SPLIT_KEYS = ['insurer', 'noncovered', 'copay', 'otherTotal'] as const
/** 남는 다섯 칸: splitUnconfirmed여도 숫자 */
const KEPT_KEYS = ['total', 'cash', 'card', 'transfer', 'receivableIn'] as const
const CODE_KEYS = ['code', 'name', 'count', 'amount'] as const

const FAKE_CHART = '900001'
const FAKE_NAME = '가상환자01'

function day(date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow {
  return {
    date,
    visits: 42,
    newPatients: 5,
    returnVisits: 37,
    patientsToDate: 40,
    total: 1_234_560,
    insurer: 800_100,
    noncovered: 210_000,
    copay: 200_000,
    otherTotal: 24_460,
    cash: 52_000,
    card: 301_500,
    transfer: 20_000,
    receivableIn: 3_000,
    unconfirmed: false,
    splitUnconfirmed: false,
    ...over,
  }
}

/** 금액을 세지 않은 날(세 검사·남는 다섯 칸의 음수): 금액 아홉 칸 null */
function unconfirmedDay(date: string): RevenueDayRow {
  return day(date, {
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
  })
}

/** 나눔만 세지 않은 날(금액 맞춤 검사·나눔 네 칸의 음수): 나눔 네 칸만 null, 남는 다섯 칸은 숫자 */
function splitDay(date: string, over: Partial<RevenueDayRow> = {}): RevenueDayRow {
  return day(date, { insurer: null, noncovered: null, copay: null, otherTotal: null, splitUnconfirmed: true, ...over })
}

/** from부터 n일, 하루도 빠짐없이 */
function daysFrom(from: string, n: number): RevenueDayRow[] {
  return Array.from({ length: n }, (_, i) => day(addDays(from, i)))
}

function code(c: string, over: Partial<RevenueCodeRow> = {}): RevenueCodeRow {
  return { code: c, name: '도수치료(가짜)', count: 12, amount: 960_000, ...over }
}

function codesOf(n: number): RevenueCodeRow[] {
  return Array.from({ length: n }, (_, i) => code(`C${i}`, { name: null, count: i, amount: i * 100 }))
}

function good(): RevenueDaysResult {
  return {
    days: [
      day('2026-10-01'),
      unconfirmedDay('2026-10-02'),
      // 진료 없는 날도 0으로 한 줄
      day('2026-10-03', {
        visits: 0,
        newPatients: 0,
        returnVisits: 0,
        patientsToDate: 40,
        total: 0,
        insurer: 0,
        noncovered: 0,
        copay: 0,
        otherTotal: 0,
        cash: 0,
        card: 0,
        transfer: 0,
        receivableIn: 0,
      }),
      // 차트번호 없는 내원·옛 자료 때문에 건수를 정할 수 없는 날
      day('2026-10-04', { visits: null, newPatients: null, returnVisits: null, patientsToDate: null }),
      // 나눔만 세지 않은 날
      splitDay('2026-10-05'),
    ],
    codes: [
      code('MM001'),
      code('MX122', { name: '체외충격파(가짜)', count: 3, amount: null }),
      code('가.처방_1-2', { name: null }),
      code('_REST', { name: null, count: 7, amount: 51_000 }),
    ],
  }
}

const check = (data: unknown) => checkResult('revenue.days', data)

/** 맞는 답을 하나 고친 것 */
function withDay(i: number, row: Record<string, unknown>): Record<string, unknown> {
  const data = good()
  return { ...data, days: data.days.map((d, j) => (j === i ? row : d)) }
}
function withCode(i: number, row: Record<string, unknown>): Record<string, unknown> {
  const data = good()
  return { ...data, codes: data.codes.map((c, j) => (j === i ? row : c)) }
}
function without<T extends Record<string, unknown>>(row: T, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row }
  delete copy[key]
  return copy
}

describe('AC-002.2 맞는 답은 통과한다', () => {
  it('AC-002.2 days·codes 두 칸, 확인 필요한 날(금액 null)·나눔만 빈 날·0인 날·건수 null인 날·_REST·이름 null·금액 null이 있는 답', () => {
    expect(check(good())).toBe(true)
  })

  it('AC-002.2 31일(한도)과 코드 1,000개(한도)는 통과한다', () => {
    expect(check({ days: daysFrom('2026-10-01', 31), codes: codesOf(1000) })).toBe(true)
  })

  it('AC-002.2 하루와 코드 0개도 통과한다', () => {
    expect(check({ days: [day('2026-10-01')], codes: [] })).toBe(true)
  })

  it('AC-002.2 달·해를 넘어 이어지는 날(2월 말·12월 31일)도 하루씩 이어진 것으로 본다', () => {
    expect(check({ days: [day('2024-02-28'), day('2024-02-29'), day('2024-03-01')], codes: [] })).toBe(true)
    expect(check({ days: [day('2026-12-31'), day('2027-01-01')], codes: [] })).toBe(true)
  })

  it('AC-002.2 처방 이름 100자와 1자는 통과한다', () => {
    expect(check(withCode(0, code('MM001', { name: '가'.repeat(100) })))).toBe(true)
    expect(check(withCode(0, code('MM001', { name: 'A' })))).toBe(true)
  })

  it('AC-002.2 코드 모양: 영문·숫자·한글·_ . - 로 1~30자', () => {
    expect(check(withCode(0, code('A'.repeat(30))))).toBe(true)
    expect(check(withCode(0, code('7')))).toBe(true)
  })

  it('AC-002.2 0과 안전한 정수의 끝(2^53-1)은 숫자 칸으로 통과한다', () => {
    expect(check(withDay(0, day('2026-10-01', { total: Number.MAX_SAFE_INTEGER, cash: 0 })))).toBe(true)
    expect(check(withCode(0, code('MM001', { count: 0, amount: 0 })))).toBe(true)
  })
})

describe('AC-002.2 답 전체 모양', () => {
  // 목록은 it.each가 인자로 펼치므로 한 겹 더 싼다
  it.each([[null], [undefined], ['days'], [3], [[]], [[good()]]])('AC-002.2 객체가 아닌 답 %j 는 통과하지 않는다', (data) => {
    expect(check(data)).toBe(false)
  })

  it('AC-002.2 칸은 정확히 days·codes 둘이다(하나 빠짐·하나 더함 거부)', () => {
    const data = good()
    expect(check({ days: data.days })).toBe(false)
    expect(check({ codes: data.codes })).toBe(false)
    expect(check({ ...data, chart: FAKE_CHART })).toBe(false)
    expect(check({ ...data, extra: [] })).toBe(false)
  })

  it.each([
    ['days', {}],
    ['days', null],
    ['days', 'x'],
    ['codes', {}],
    ['codes', null],
    ['codes', 'x'],
  ])('AC-002.2 %s가 목록이 아니면(%j) 통과하지 않는다', (key, value) => {
    expect(check({ ...good(), [key]: value })).toBe(false)
  })
})

describe('AC-002.2·AC-002.3 days 줄', () => {
  it.each(['chart', 'name', 'receiptNo', 'memo'])('AC-002.3 날 줄에 정해 둔 칸 밖의 칸(%s)이 있으면 통과하지 않는다', (key) => {
    expect(check(withDay(0, { ...day('2026-10-01'), [key]: key === 'chart' ? FAKE_CHART : FAKE_NAME }))).toBe(false)
  })

  it.each(DAY_KEYS)('AC-002.2 날 줄에 %s 칸이 빠지면 통과하지 않는다', (key) => {
    expect(check(withDay(0, without(day('2026-10-01'), key)))).toBe(false)
  })

  it.each(NUMBER_KEYS.flatMap((key) => (['1000', 1000.5, -1, Number.NaN, Infinity, 2 ** 53, true, {}] as unknown[]).map((v) => [key, v])))(
    'AC-002.3 날 줄의 숫자 칸 %s가 %j(글자·소수·음수·안전하지 않은 수)면 통과하지 않는다',
    (key, value) => {
      expect(check(withDay(0, { ...day('2026-10-01'), [key as string]: value }))).toBe(false)
    },
  )

  it.each(['false', 0, 1, null, undefined])('AC-002.2 unconfirmed가 참·거짓이 아니면(%j) 통과하지 않는다', (value) => {
    expect(check(withDay(0, { ...day('2026-10-01'), unconfirmed: value }))).toBe(false)
  })

  it.each(MONEY_KEYS)('AC-002.2 unconfirmed: true인데 금액 칸 %s에 숫자가 있으면 통과하지 않는다', (key) => {
    expect(check(withDay(1, { ...unconfirmedDay('2026-10-02'), [key]: 1_000 }))).toBe(false)
  })

  it.each(MONEY_KEYS)('AC-002.2 unconfirmed: false인데 금액 칸 %s가 null이면 통과하지 않는다', (key) => {
    expect(check(withDay(0, { ...day('2026-10-01'), [key]: null }))).toBe(false)
  })

  it('AC-002.2 unconfirmed: true여도 건수 칸은 숫자일 수 있다(금액만 null)', () => {
    expect(check(withDay(1, { ...unconfirmedDay('2026-10-02'), visits: 30, patientsToDate: 41 }))).toBe(true)
  })

  it.each(['2026-02-30', '2026-13-01', '20261001', '2026-10-1', '2026/10/01', '', 20261001, null])(
    'AC-002.2 날짜가 진짜 YYYY-MM-DD가 아니면(%j) 통과하지 않는다',
    (date) => {
      expect(check(withDay(0, { ...day('2026-10-01'), date }))).toBe(false)
    },
  )

  it('AC-002.2 날짜가 뒤바뀌면 통과하지 않는다', () => {
    expect(check({ days: [day('2026-10-02'), day('2026-10-01')], codes: [] })).toBe(false)
  })

  it('AC-002.2 같은 날이 두 번 있으면 통과하지 않는다', () => {
    expect(check({ days: [day('2026-10-01'), day('2026-10-01')], codes: [] })).toBe(false)
  })

  it('AC-002.2 하루를 건너뛰면 통과하지 않는다', () => {
    expect(check({ days: [day('2026-10-01'), day('2026-10-03')], codes: [] })).toBe(false)
  })

  it('AC-002.2 32일은 통과하지 않는다(31일까지)', () => {
    expect(check({ days: daysFrom('2026-10-01', 32), codes: [] })).toBe(false)
  })

  it.each([[null], ['x'], [3], [[]]])('AC-002.2 날 줄이 객체가 아니면(%j) 통과하지 않는다', (row) => {
    expect(check({ days: [row], codes: [] })).toBe(false)
  })
})

describe('AC-002.2·AC-002.3 copay·otherTotal(2026-11-01 더함)과 금액 아홉 칸 짝', () => {
  it('AC-002.2 칸 목록 상수는 design.md 5-2와 같다(copay·otherTotal은 noncovered 바로 뒤, 금액은 아홉 칸)', () => {
    expect([...REVENUE_DAY_KEYS]).toEqual([...DAY_KEYS])
    expect([...REVENUE_MONEY_KEYS]).toEqual([...MONEY_KEYS])
    expect(REVENUE_MONEY_KEYS).toHaveLength(9)
  })

  it('AC-002.2 두 칸이 함께 빠진 옛 모양의 날 줄은 통과하지 않는다', () => {
    const row = without(without(day('2026-10-01'), 'copay'), 'otherTotal')
    expect(check({ days: [row], codes: [] })).toBe(false)
  })

  it('AC-002.2 두 칸이 함께 빠진 옛 모양의 확인 필요한 날(일곱 칸만 null)도 통과하지 않는다', () => {
    const row = without(without(unconfirmedDay('2026-10-02'), 'copay'), 'otherTotal')
    expect(check({ days: [row], codes: [] })).toBe(false)
  })

  it.each([
    ['copay', 'unconfirmed: false', 'day'],
    ['otherTotal', 'unconfirmed: false', 'day'],
    ['copay', 'unconfirmed: true', 'unconfirmedDay'],
    ['otherTotal', 'unconfirmed: true', 'unconfirmedDay'],
  ])('AC-002.3 %s가 음수면 %s인 날이어도 통과하지 않는다', (key, _label, kind) => {
    const row = kind === 'day' ? day('2026-10-01') : unconfirmedDay('2026-10-02')
    expect(check(withDay(kind === 'day' ? 0 : 1, { ...row, [key]: -1 }))).toBe(false)
  })

  it('AC-002.2 unconfirmed: true인데 일곱 칸만 null이고 copay·otherTotal에 숫자가 있으면 통과하지 않는다', () => {
    expect(check(withDay(1, { ...unconfirmedDay('2026-10-02'), copay: 1_000, otherTotal: 0 }))).toBe(false)
  })

  it('AC-002.2 unconfirmed: true인데 copay·otherTotal만 null이고 일곱 칸에 숫자가 있으면 통과하지 않는다', () => {
    expect(check(withDay(0, { ...day('2026-10-01'), copay: null, otherTotal: null, unconfirmed: true }))).toBe(false)
  })

  it('AC-002.2 unconfirmed: false인데 copay·otherTotal만 null이면 통과하지 않는다', () => {
    expect(check(withDay(0, { ...day('2026-10-01'), copay: null, otherTotal: null }))).toBe(false)
  })

  it('AC-002.2 unconfirmed: false인데 아홉 칸이 모두 null이면 통과하지 않는다', () => {
    expect(check(withDay(1, { ...unconfirmedDay('2026-10-02'), unconfirmed: false }))).toBe(false)
  })
})

describe('AC-002.2·AC-002.3 splitUnconfirmed(2026-11-01 더함, "나눔만 비워")와 두 표시의 짝', () => {
  const D = '2026-10-01'
  // 줄 하나뿐인 답으로 본다. 아래 거부 사례는 통과하는 세 모양('맞는 줄' 시험)에서 짝 하나만 어긋나게 고친 것이라, 거부되면 그 짝 때문이다
  const checkRow = (row: unknown) => check({ days: [row], codes: [] })
  const SHAPES: [string, RevenueDayRow][] = [
    ['금액 아홉 칸이 다 있는 날', day(D)],
    ['확인 필요한 날', unconfirmedDay(D)],
    ['나눔만 빈 날', splitDay(D)],
  ]
  const cross = (keys: readonly string[], values: readonly unknown[]): [string, unknown][] =>
    keys.flatMap((k) => values.map((v): [string, unknown] => [k, v]))
  /** null이어야 하는 칸에 오면 거부되는 값(숫자 0·없는 값 undefined 포함) */
  const NOT_NULL = [0, 1_000, '1000', '', -1, 1.5, false, undefined, {}]
  const NOT_COUNT = ['1000', 1000.5, -1, Number.NaN, Infinity, 2 ** 53, true, {}, undefined]
  const NOT_BOOLEAN = ['false', 'true', '', 0, 1, null, undefined, {}]

  it('AC-002.2 칸 목록 상수: splitUnconfirmed는 unconfirmed 바로 뒤, 나눔 네 칸 + 남는 다섯 칸 = 금액 아홉 칸', () => {
    expect([...REVENUE_DAY_KEYS]).toEqual([...DAY_KEYS])
    expect([...REVENUE_SPLIT_KEYS]).toEqual([...SPLIT_KEYS])
    expect([...REVENUE_KEPT_KEYS]).toEqual([...KEPT_KEYS])
    expect([...REVENUE_SPLIT_KEYS, ...REVENUE_KEPT_KEYS].sort()).toEqual([...REVENUE_MONEY_KEYS].sort())
  })

  it.each(SHAPES)('AC-002.2 맞는 줄(%s)은 통과한다', (_label, row) => {
    expect(checkRow(row)).toBe(true)
  })

  it('AC-002.2 세 모양이 섞여 날짜로 이어진 답은 통과한다', () => {
    expect(check({ days: [day(D), splitDay('2026-10-02'), unconfirmedDay('2026-10-03'), splitDay('2026-10-04')], codes: [] })).toBe(true)
  })

  it('AC-002.2 나눔만 빈 날의 남는 다섯 칸은 0이어도 숫자라 통과한다', () => {
    expect(checkRow(splitDay(D, { total: 0, cash: 0, card: 0, transfer: 0, receivableIn: 0 }))).toBe(true)
  })

  it('AC-002.2 둘 다 거짓인 날의 나눔 네 칸은 0이어도 숫자라 통과한다', () => {
    expect(checkRow(day(D, { insurer: 0, noncovered: 0, copay: 0, otherTotal: 0 }))).toBe(true)
  })

  it('AC-002.2 나눔만 빈 날의 건수 칸은 숫자도 null도 통과한다', () => {
    expect(checkRow(splitDay(D, { visits: 30, patientsToDate: 41 }))).toBe(true)
    expect(checkRow(splitDay(D, { visits: null, newPatients: null, returnVisits: null, patientsToDate: null }))).toBe(true)
  })

  it.each(SHAPES)('AC-002.2 splitUnconfirmed가 빠진 옛 모양(%s)은 통과하지 않는다', (_label, row) => {
    expect(checkRow(without(row, 'splitUnconfirmed'))).toBe(false)
  })

  // 참·거짓처럼 읽히는 값(0·1·null)이 그 값대로 맞는 모양에 있어도 막혀야 한다
  describe.each(SHAPES)('AC-002.2 표시 칸이 참·거짓이 아닌 값: %s', (_label, row) => {
    it.each(NOT_BOOLEAN)('AC-002.2 splitUnconfirmed가 %j면 통과하지 않는다', (value) => {
      expect(checkRow({ ...row, splitUnconfirmed: value })).toBe(false)
    })

    it.each(NOT_BOOLEAN)('AC-002.2 unconfirmed가 %j면 통과하지 않는다', (value) => {
      expect(checkRow({ ...row, unconfirmed: value })).toBe(false)
    })
  })

  it.each(SHAPES)('AC-002.2 두 표시가 둘 다 참이면 %s의 금액 모양이어도 통과하지 않는다', (_label, row) => {
    expect(checkRow({ ...row, unconfirmed: true, splitUnconfirmed: true })).toBe(false)
  })

  it.each(cross(SPLIT_KEYS, NOT_NULL))('AC-002.2 splitUnconfirmed: true인데 나눔 칸 %s가 null이 아니고 %j면 통과하지 않는다', (key, value) => {
    expect(checkRow({ ...splitDay(D), [key]: value })).toBe(false)
  })

  it('AC-002.2 splitUnconfirmed: true인데 나눔 네 칸이 모두 숫자면 통과하지 않는다', () => {
    expect(checkRow({ ...day(D), splitUnconfirmed: true })).toBe(false)
  })

  it.each(KEPT_KEYS)('AC-002.2 splitUnconfirmed: true인데 남는 칸 %s가 null이면 통과하지 않는다', (key) => {
    expect(checkRow({ ...splitDay(D), [key]: null })).toBe(false)
  })

  it.each(cross(KEPT_KEYS, NOT_COUNT))('AC-002.3 splitUnconfirmed: true인데 남는 칸 %s가 숫자가 아니고 %j면 통과하지 않는다', (key, value) => {
    expect(checkRow({ ...splitDay(D), [key]: value })).toBe(false)
  })

  it('AC-002.2 splitUnconfirmed: true인데 아홉 칸이 모두 null이면 통과하지 않는다(확인 필요한 날의 모양)', () => {
    expect(checkRow({ ...unconfirmedDay(D), unconfirmed: false, splitUnconfirmed: true })).toBe(false)
  })

  it('AC-002.2 둘 다 거짓인데 나눔 네 칸이 null이면 통과하지 않는다(표시 없는 나눔만 빈 날)', () => {
    expect(checkRow({ ...splitDay(D), splitUnconfirmed: false })).toBe(false)
  })

  it('AC-002.2 둘 다 거짓인데 남는 다섯 칸만 null이면 통과하지 않는다', () => {
    expect(checkRow(day(D, { total: null, cash: null, card: null, transfer: null, receivableIn: null }))).toBe(false)
  })

  it.each(cross(MONEY_KEYS, NOT_NULL))('AC-002.2 unconfirmed: true인데 금액 칸 %s가 null이 아니고 %j면 통과하지 않는다', (key, value) => {
    expect(checkRow({ ...unconfirmedDay(D), [key]: value })).toBe(false)
  })

  it('AC-002.2 unconfirmed: true인데 나눔 네 칸만 null이고 남는 다섯 칸이 숫자면 통과하지 않는다(나눔만 빈 날의 모양)', () => {
    expect(checkRow({ ...splitDay(D), unconfirmed: true, splitUnconfirmed: false })).toBe(false)
  })

  it('AC-002.2 unconfirmed: true인데 남는 다섯 칸만 null이고 나눔 네 칸이 숫자면 통과하지 않는다', () => {
    expect(checkRow(day(D, { total: null, cash: null, card: null, transfer: null, receivableIn: null, unconfirmed: true }))).toBe(false)
  })

  describe.each(SHAPES)('AC-002.3 어느 모양이든 건수 칸·칸 이름은 똑같이 본다: %s', (_label, row) => {
    it.each(cross(COUNT_KEYS, ['3', 1.5, -1]))('AC-002.3 건수 칸 %s가 %j면 통과하지 않는다', (key, value) => {
      expect(checkRow({ ...row, [key]: value })).toBe(false)
    })

    it.each(['chart', 'name'])('AC-002.3 정해 둔 칸 밖의 칸(%s)이 있으면 통과하지 않는다', (key) => {
      expect(checkRow({ ...row, [key]: key === 'chart' ? FAKE_CHART : FAKE_NAME })).toBe(false)
    })
  })
})

describe('AC-002.2·AC-002.3 codes 줄', () => {
  it.each(['chart', 'patient', 'date'])('AC-002.3 코드 줄에 정해 둔 칸 밖의 칸(%s)이 있으면 통과하지 않는다', (key) => {
    expect(check(withCode(0, { ...code('MM001'), [key]: key === 'chart' ? FAKE_CHART : FAKE_NAME }))).toBe(false)
  })

  it.each(CODE_KEYS)('AC-002.2 코드 줄에 %s 칸이 빠지면 통과하지 않는다', (key) => {
    expect(check(withCode(0, without(code('MM001'), key)))).toBe(false)
  })

  it.each(['', 'A'.repeat(31), 'MM 001', 'MM/001', 'MM001\n', '<b>', 'MM:1', 1, null])(
    'AC-002.2 코드 모양이 아니면(%j) 통과하지 않는다',
    (c) => {
      expect(check(withCode(0, { ...code('MM001'), code: c }))).toBe(false)
    },
  )

  it.each(['', '가'.repeat(101), '도수\n치료', '도수\r치료', '도수\t치료', '도수\u0000', '도수\u007f', '도수\u0085', '도수 ', 5, true])(
    'AC-002.2 처방 이름이 1~100자 글자(줄바꿈·제어 문자 없음) 또는 null이 아니면(%j) 통과하지 않는다',
    (name) => {
      expect(check(withCode(0, { ...code('MM001'), name }))).toBe(false)
    },
  )

  it.each([null, -1, 1.5, '3', 2 ** 53, Number.NaN])('AC-002.3 count가 0 이상 정수가 아니면(%j) 통과하지 않는다', (count) => {
    expect(check(withCode(0, { ...code('MM001'), count }))).toBe(false)
  })

  it.each([-1, 1.5, '960000', 2 ** 53, Infinity, false])('AC-002.3 amount가 0 이상 안전한 정수·null이 아니면(%j) 통과하지 않는다', (amount) => {
    expect(check(withCode(0, { ...code('MM001'), amount }))).toBe(false)
  })

  it('AC-002.2 같은 코드가 두 번 있으면 통과하지 않는다', () => {
    expect(check({ days: [day('2026-10-01')], codes: [code('MM001'), code('MX122'), code('MM001')] })).toBe(false)
  })

  it('AC-002.2 코드 1,001개는 통과하지 않는다(1,000개까지)', () => {
    expect(check({ days: [day('2026-10-01')], codes: codesOf(1001) })).toBe(false)
  })

  it.each([[null], ['MM001'], [3], [[]]])('AC-002.2 코드 줄이 객체가 아니면(%j) 통과하지 않는다', (row) => {
    expect(check({ days: [day('2026-10-01')], codes: [row] })).toBe(false)
  })
})
