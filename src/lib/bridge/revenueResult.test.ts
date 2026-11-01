// revenue.days 답 검사(TASK-2, REQ-002 · AC-002.2·AC-002.3). 숫자는 모두 가짜다. 환자 칸(차트번호·이름)이 섞인 답은 막혀야 한다
import { describe, expect, it } from 'vitest'
import { addDays } from '@/lib/analytics/dates'
import { REVENUE_DAY_KEYS, REVENUE_MONEY_KEYS, type RevenueCodeRow, type RevenueDayRow, type RevenueDaysResult } from '@/types/revenue'
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
] as const
const COUNT_KEYS = ['visits', 'newPatients', 'returnVisits', 'patientsToDate'] as const
const MONEY_KEYS = ['total', 'insurer', 'noncovered', 'copay', 'otherTotal', 'cash', 'card', 'transfer', 'receivableIn'] as const
const NUMBER_KEYS = [...COUNT_KEYS, ...MONEY_KEYS] as const
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
    ...over,
  }
}

/** 금액을 세지 않은 날(세 검사·금액 맞춤 검사·음수): 금액 아홉 칸 null */
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
  it('AC-002.2 days·codes 두 칸, 확인 필요한 날(금액 null)·0인 날·건수 null인 날·_REST·이름 null·금액 null이 있는 답', () => {
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
