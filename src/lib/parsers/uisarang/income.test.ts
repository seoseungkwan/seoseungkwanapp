import { describe, expect, it } from 'vitest'
import { isRevenueDays } from '@/lib/bridge/revenueResult'
import type { RevenueDayRow } from '@/types/revenue'
import type { UisFileResult } from '@/types/uisarang'
import { readUisFile } from './readFile'
import { bookBytes, gridRowOf, INCOME_HEADER, incomeRows, TODAY, type IncomeOptions } from './testBooks'

// 일일수입통계 → 그날 매출 한 줄(design.md §4-1)

const DAY = '2026-11-02'
// testBooks INCOME_TOTAL(합계 줄)에서 나오는 줄: 총진료비 = 급여총액 + 비급여, 급여총액 = 청구액 + 본인부담금, 진료수납액 = 현금 + 카드
const ROW: RevenueDayRow = {
  date: DAY,
  visits: 46,
  newPatients: null,
  returnVisits: null,
  total: 1_364_000,
  insurer: 812_340,
  noncovered: 250_000,
  copay: 301_660,
  otherTotal: 0,
  cash: 151_660,
  card: 400_000,
  transfer: 0,
  receivableIn: 0,
  unconfirmed: false,
  splitUnconfirmed: false,
}
const NINE_NULL = {
  total: null,
  insurer: null,
  noncovered: null,
  copay: null,
  otherTotal: null,
  cash: null,
  card: null,
  transfer: null,
  receivableIn: null,
}
const SPLIT_NULL = { insurer: null, noncovered: null, copay: null, otherTotal: null }

function rowOf(result: UisFileResult): RevenueDayRow {
  if (result.status !== 'read' || result.read.kind !== 'income') throw new Error(`받지 못함: ${JSON.stringify(result)}`)
  return result.read.row
}
const read = (options: IncomeOptions = {}) => readUisFile(bookBytes(incomeRows(options)), TODAY)
const income = (options: IncomeOptions = {}) => rowOf(read(options))

describe('AC-8803.1 합계 줄 → 매출 한 날 줄', () => {
  it('AC-8803.1: 날 = 조회일 · 내원 = 인원계 · 신환·재진 null · 계좌이체·미수 입금 0 · 참고 금액 열쇠 없음', () => {
    const result = read()
    expect(result).toStrictEqual({ status: 'read', read: { kind: 'income', span: { from: DAY, to: DAY, unit: 'day' }, row: ROW } })
    expect(Object.keys(rowOf(result))).not.toContain('roughTotal')
  })

  it('AC-8803.1: 만든 줄은 매출 날 줄 검사(sales_days 제약과 같은 짝)를 지난다', () => {
    expect(isRevenueDays({ days: [income()], codes: [] })).toBe(true)
  })

  it('AC-8803.1: 합계 줄은 보험구분 칸(빈칸 뺌)이 합계인 첫 줄', () => {
    expect(income({ total: { 보험구분: ' 합 계 ' } })).toStrictEqual(ROW)
  })
})

describe('AC-8803.2 합계 줄 총진료비가 빈칸이면 한 줄 아래 같은 칸', () => {
  it('AC-8803.2: 합친 칸 — 값이 한 줄 아래에 있다', () => {
    expect(income({ total: { 총진료비: null }, below: { 총진료비: 1_364_000 } })).toStrictEqual(ROW)
  })

  it('AC-8803.2: 엑셀 합친 칸 표시(!merges)가 있어도 같다', () => {
    const rows = incomeRows({ total: { 총진료비: null }, below: { 총진료비: 1_364_000 } })
    const at = rows.findIndex((row) => row[0] === '합계')
    const c = INCOME_HEADER.indexOf('총진료비')
    const merges = [{ s: { r: at, c }, e: { r: at + 1, c } }]
    expect(rowOf(readUisFile(bookBytes(rows, 'biff8', merges), TODAY))).toStrictEqual(ROW)
  })

  it('AC-8803.2: 아래 줄도 비면 없음 → 금액을 셀 수 없음', () => {
    expect(income({ total: { 총진료비: null } })).toStrictEqual({ ...ROW, ...NINE_NULL, unconfirmed: true })
  })
})

describe('AC-8803.3 숫자 글자', () => {
  it('AC-8803.3: 쉼표·빈칸을 떼고 원 미만은 버린다', () => {
    const row = income({
      total: { 총진료비: '1,364,000', 청구액: ' 812,340.9 ', 본인부담금: 301_660.4, 현금수납액: '151,660', 카드수납액: '400, 000', 인원계: ' 46 ' },
    })
    expect(row).toStrictEqual(ROW)
  })

  it('AC-8803.3: 빈칸은 0이 아니라 없음(인원계 → null)', () => {
    expect(income({ total: { 인원계: null } })).toStrictEqual({ ...ROW, visits: null })
  })

  it('AC-8803.3: 숫자로 못 바꾸는 글자는 그 줄 E-UIS-ROW(빈 줄을 뺀 차례)', () => {
    const rows = incomeRows({ total: { 비급여: '25만' } })
    expect(readUisFile(bookBytes(rows), TODAY)).toStrictEqual({
      status: 'refused',
      code: 'E-UIS-ROW',
      kind: 'income',
      span: { from: DAY, to: DAY },
      row: gridRowOf(rows, rows.findIndex((row) => row[0] === '합계')),
    })
  })

  it('AC-8803.3: 인원계가 음수·소수면 E-UIS-ROW', () => {
    expect(read({ total: { 인원계: -1 } })).toMatchObject({ status: 'refused', code: 'E-UIS-ROW' })
    expect(read({ total: { 인원계: 4.5 } })).toMatchObject({ status: 'refused', code: 'E-UIS-ROW' })
  })
})

describe('AC-8803.4 금액을 셀 수 없음(unconfirmed) — 아홉 칸 null', () => {
  it.each([
    ['총진료비 없음', { 총진료비: null }],
    ['현금수납액 없음', { 현금수납액: null }],
    ['카드수납액 없음', { 카드수납액: null }],
    ['총진료비 음수', { 총진료비: -5 }],
    ['현금수납액 음수(환불)', { 현금수납액: -10_000, 진료수납액: 390_000 }],
    ['진료수납액 ≠ 현금 + 카드', { 진료수납액: 551_661 }],
  ])('AC-8803.4: %s', (_, total) => {
    expect(income({ total })).toStrictEqual({ ...ROW, ...NINE_NULL, unconfirmed: true, splitUnconfirmed: false })
  })

  it('AC-8803.4: 진료수납액이 없으면 그 맞춤은 보지 않는다', () => {
    expect(income({ total: { 진료수납액: null } })).toStrictEqual(ROW)
  })
})

describe('AC-8803.5 나눔만 셀 수 없음(splitUnconfirmed) — 나눔 네 칸만 null', () => {
  it.each([
    ['청구액 없음', { 청구액: null }],
    ['본인부담금 없음', { 본인부담금: null }],
    ['비급여 없음', { 비급여: null }],
    ['급여총액 없음', { 급여총액: null }],
    ['청구액 음수', { 청구액: -1, 급여총액: 301_659 }],
    ['청구액 + 본인부담금 ≠ 급여총액', { 급여총액: 1_114_001 }],
    ['기타 음수(비급여가 너무 큼)', { 비급여: 250_001 }],
  ])('AC-8803.5: %s', (_, total) => {
    const row = income({ total })
    expect(row).toStrictEqual({ ...ROW, ...SPLIT_NULL, splitUnconfirmed: true })
    expect(isRevenueDays({ days: [row], codes: [] })).toBe(true)
  })

  it('AC-8803.5: 기타 = 총진료비 − 청구액 − 본인부담금 − 비급여', () => {
    expect(income({ total: { 총진료비: 1_370_000 } })).toStrictEqual({ ...ROW, total: 1_370_000, otherTotal: 6_000 })
  })

  it('AC-8803.5: 셀 수 없음이 먼저면 나눔 표시는 거짓', () => {
    expect(income({ total: { 총진료비: null, 청구액: null } })).toMatchObject({ unconfirmed: true, splitUnconfirmed: false })
  })
})

describe('AC-8803.6 합계 줄이 없으면 E-UIS-TOTAL', () => {
  it('AC-8803.6: 보험구분 줄만 있다', () => {
    expect(read({ noTotal: true })).toStrictEqual({ status: 'refused', code: 'E-UIS-TOTAL', kind: 'income', span: { from: DAY, to: DAY } })
  })
})

describe('AC-8803.7 보험구분 줄·현금영수증수납액은 쓰지 않는다', () => {
  it('AC-8803.7: 보험구분 줄에 못 읽는 글자·맞지 않는 숫자가 있어도 · 현금영수증이 커도 합계 줄 그대로', () => {
    const row = income({
      insurance: [
        { 보험구분: '건강보험', 총진료비: '오류', 현금수납액: -999, 카드수납액: 'x' },
        { 보험구분: '의료급여', 총진료비: 1, 인원계: 0.5 },
      ],
      total: { 현금영수증수납액: 9_999_999 },
    })
    expect(row).toStrictEqual(ROW)
    expect(row.cash).toBe(151_660)
  })
})
