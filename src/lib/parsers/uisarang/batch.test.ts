import { describe, expect, it } from 'vitest'
import { planUisSave } from '@/lib/payload/uisarang'
import type { RevenueDayRow } from '@/types/revenue'
import type { UisAgePayload, UisFileResult, UisRxPayload, UisSpan, UisVisitDay } from '@/types/uisarang'
import { settleBatch } from './batch'

// 한 번에 넣은 파일 묶음 — 같은 날 두 번(design.md §5). 받은(read) 결과만 견준다

const day = (d: string): UisSpan => ({ from: d, to: d, unit: 'day' })
const WEEK: UisSpan = { from: '2026-11-02', to: '2026-11-08', unit: 'week' }
const OCTOBER: UisSpan = { from: '2026-10-01', to: '2026-10-31', unit: 'month' }

const revenue = (date: string, total = 1000): RevenueDayRow => ({
  date,
  visits: 3,
  newPatients: null,
  returnVisits: null,
  total,
  insurer: total,
  noncovered: 0,
  copay: 0,
  otherTotal: 0,
  cash: 0,
  card: total,
  transfer: 0,
  receivableIn: 0,
  unconfirmed: false,
  splitUnconfirmed: false,
})
const income = (date: string, total?: number): UisFileResult => ({ status: 'read', read: { kind: 'income', span: day(date), row: revenue(date, total) } })
const rxPayload = (qty: number): UisRxPayload => ({ v: 1, rows: [{ code: 'carm', name: '카름정', qty, amount: 100 }], total: 100 })
const rx = (span: UisSpan, qty = 1): UisFileResult => ({ status: 'read', read: { kind: 'rx', span, payload: rxPayload(qty) } })
const agePayload = (n: number): UisAgePayload => ({ v: 1, patients: n, newPatients: 0, bands: [n, 0, 0, 0, 0, 0, 0, 0, 0, 0], newBands: Array<number>(10).fill(0) })
const ages = (date: string, n = 2): UisFileResult => ({ status: 'read', read: { kind: 'visitPatients', span: day(date), payload: agePayload(n) } })
const visits = (span: UisSpan, days: UisVisitDay[]): UisFileResult => ({ status: 'read', read: { kind: 'visits', span, days } })
const v = (d: string, patients: number, newPatients = 0): UisVisitDay => ({ day: d, patients, newPatients })
const WEEK_DAYS = [v('2026-11-02', 40, 5), v('2026-11-03', 52, 7), v('2026-11-04', 38)]

const same = (result: UisFileResult): UisFileResult => {
  if (result.status !== 'read') throw new Error('read만')
  return { status: 'skipped', why: 'same', kind: result.read.kind, span: result.read.span }
}
const twice = (result: UisFileResult): UisFileResult => {
  if (result.status !== 'read') throw new Error('read만')
  const { from, to } = result.read.span
  return { status: 'refused', code: 'E-UIS-TWICE', kind: result.read.kind, span: { from, to } }
}

describe('AC-8807.2 일일수입통계·아래쪽 표: 같은 날 둘 이상', () => {
  it('AC-8807.2: 숫자가 모두 같으면 첫 파일만 read, 나머지는 건너뜀(같은 엑셀)', () => {
    const a = income('2026-11-02')
    const files = [a, income('2026-11-03'), income('2026-11-02'), income('2026-11-02')]
    expect(settleBatch(files)).toStrictEqual([a, files[1], same(a), same(a)])
  })

  it('AC-8807.2: 하나라도 다르면 그 날 파일 모두 E-UIS-TWICE · 다른 날은 그대로', () => {
    const files = [income('2026-11-02'), income('2026-11-03'), income('2026-11-02'), income('2026-11-02', 2000)]
    expect(settleBatch(files)).toStrictEqual([twice(files[0]), files[1], twice(files[2]), twice(files[3])])
  })

  it('AC-8807.2: 아래쪽 표도 같다', () => {
    expect(settleBatch([ages('2026-11-03'), ages('2026-11-03')])).toStrictEqual([ages('2026-11-03'), same(ages('2026-11-03'))])
    expect(settleBatch([ages('2026-11-03'), ages('2026-11-03', 3)])).toStrictEqual([twice(ages('2026-11-03')), twice(ages('2026-11-03', 3))])
  })

  it('AC-8807.2: 종류가 다르면 같은 날이어도 견주지 않는다', () => {
    const files = [income('2026-11-03'), ages('2026-11-03'), rx(day('2026-11-03'))]
    expect(settleBatch(files)).toStrictEqual(files)
  })
})

describe('AC-8807.2 기간별처방통계: 조회일이 똑같은 것끼리', () => {
  it('AC-8807.2: 같은 기간·같은 숫자 → 건너뜀(같은 엑셀), 다른 숫자 → 모두 E-UIS-TWICE', () => {
    expect(settleBatch([rx(OCTOBER), rx(OCTOBER)])).toStrictEqual([rx(OCTOBER), same(rx(OCTOBER))])
    expect(settleBatch([rx(OCTOBER), rx(OCTOBER, 2)])).toStrictEqual([twice(rx(OCTOBER)), twice(rx(OCTOBER, 2))])
  })

  it('AC-8807.2: 기간이 다르면(그 달 안의 하루·한 주) 숫자가 달라도 모두 받는다', () => {
    const files = [rx(OCTOBER), rx(day('2026-10-05'), 9), rx({ from: '2026-10-05', to: '2026-10-11', unit: 'week' }, 7)]
    expect(settleBatch(files)).toStrictEqual(files)
  })
})

describe('AC-8807.2 위쪽 표: 겹친 날 숫자가 다르면 겹친 파일 모두 E-UIS-TWICE', () => {
  it('AC-8807.2: 겹친 날 숫자가 모두 같으면 모두 받는다(같은 엑셀 두 번도)', () => {
    const files = [visits(WEEK, WEEK_DAYS), visits(day('2026-11-03'), [v('2026-11-03', 52, 7)]), visits(WEEK, WEEK_DAYS)]
    expect(settleBatch(files)).toStrictEqual(files)
  })

  it('AC-8807.2: 겹친 날의 숫자가 다르면 두 파일 모두', () => {
    const files = [visits(WEEK, WEEK_DAYS), visits(day('2026-11-03'), [v('2026-11-03', 51, 7)]), visits(day('2026-11-09'), [v('2026-11-09', 9)])]
    expect(settleBatch(files)).toStrictEqual([twice(files[0]), twice(files[1]), files[2]])
  })

  it('AC-8807.2: 줄 있음/없음도 숫자 — 한 주 파일에 없는 날(휴진)을 하루 파일이 줄로 가지면 다르다', () => {
    const sunday = visits(day('2026-11-08'), [v('2026-11-08', 3)])
    expect(settleBatch([visits(WEEK, WEEK_DAYS), sunday])).toStrictEqual([twice(visits(WEEK, WEEK_DAYS)), twice(sunday)])
    const closed = visits(day('2026-11-08'), [])
    expect(settleBatch([visits(WEEK, WEEK_DAYS), closed])).toStrictEqual([visits(WEEK, WEEK_DAYS), closed])
  })

  it('AC-8807.2: 한 파일과 다르면 그 둘만 — 겹치지만 같은 셋째 파일은 받는다', () => {
    const files = [visits(WEEK, WEEK_DAYS), visits(day('2026-11-04'), [v('2026-11-04', 1)]), visits(day('2026-11-02'), [v('2026-11-02', 40, 5)])]
    expect(settleBatch(files)).toStrictEqual([twice(files[0]), twice(files[1]), files[2]])
  })
})

describe('AC-8807.2 묶음 밖 결과와 저장 계획', () => {
  it('AC-8807.2: 받지 않음·건너뜀(예약)은 그대로 · 차례 그대로', () => {
    const files: UisFileResult[] = [
      { status: 'refused', code: 'E-UIS-KIND', kind: null, span: null },
      income('2026-11-02'),
      { status: 'skipped', why: 'rsv', kind: 'rsv', span: null },
      { status: 'refused', code: 'E-UIS-ROW', kind: 'income', span: { from: '2026-11-02', to: '2026-11-02' }, row: 7 },
    ]
    expect(settleBatch(files)).toStrictEqual(files)
  })

  it('AC-8807.2: 건너뛴 같은 엑셀 번호는 저장 계획에서 첫 파일 줄에 함께 붙는다', () => {
    const plan = planUisSave(settleBatch([income('2026-11-02'), rx(OCTOBER), income('2026-11-02'), rx(OCTOBER)]))
    expect(plan.revenue.map((entry) => entry.files)).toEqual([[0, 2]])
    expect(plan.periods.map((entry) => entry.files)).toEqual([[1, 3]])
    expect(plan.refused).toEqual([])
  })
})
