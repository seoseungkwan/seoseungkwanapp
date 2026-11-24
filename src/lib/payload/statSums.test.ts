import { describe, expect, it } from 'vitest'
import { buildReportInput } from '@/lib/ai/input'
import { dropoff, type DropoffRow } from '@/lib/analytics/dropoff'
import { emptyRates, sunapRates, type SunapRatesInput } from '@/lib/analytics/sunapRates'
import type { PatientDay, RxGroupDef } from '@/types/analysis'
import type { ConsumptionRow } from '@/types/consumption'
import type { DayPayload, MonthPayload } from '@/types/payload'
import type { DropoffLine } from '@/types/stats'
import type { SunapRates } from '@/types/sunap'
import { dropoffByMonth, sunapByDay, withDaySunap, withMonthDropoff } from './statSums'
import { validateDayPayload, validateMonthPayload } from './validate'

// 통계 합계 저장(admin-view REQ-8018, design.md '통계 합계 저장'). 의원이 통계를 불러올 때 날 줄에 그날 Block 전환 아홉 칸(sunap),
// 달 줄에 첫 진료가 그달인 신환의 몇 번까지 받나(dropoff)를 더한다. 환자 번호·날·처방 코드는 모두 지어낸 값이다

// ── 날 줄 sunap ──────────────────────────────────────────
const BLOCK: RxGroupDef = { id: 'g-block', codes: ['MM110'] }
const PT: RxGroupDef = { id: 'g-pt', codes: ['MM010'], out: ['ESWT7'] }
const pday = (patient: number, date: string, firstVisit = false, first90 = 0): PatientDay => ({ patient, date, receptions: 1, firstVisit, first90 })
const rx = (patient: number, date: string, rxCode: string): ConsumptionRow => ({
  rxCode,
  rxName: rxCode,
  rxType: '',
  date,
  firstVisit: false,
  outpatient: true,
  patient,
  region: null,
})
const DAYS: PatientDay[] = [
  pday(1, '2026-09-01', true),
  pday(2, '2026-09-01', false, 1),
  pday(3, '2026-09-01'),
  pday(1, '2026-09-02'),
  pday(4, '2026-09-02', true),
  pday(5, '2026-09-04', false, 1), // 9/3은 아무도 오지 않았다
  pday(6, '2026-09-30'), // 기간 밖
]
const ROWS: ConsumptionRow[] = [
  rx(1, '2026-09-01', 'MM110'),
  rx(1, '2026-09-01', 'MM010'),
  rx(2, '2026-09-01', 'MM110'),
  rx(3, '2026-09-01', 'MM010'),
  rx(3, '2026-09-01', 'ESWT7'), // 빼는 처방 — 물리치료 아님
  rx(1, '2026-09-02', 'MM010'),
  rx(4, '2026-09-02', 'MM110'),
  rx(5, '2026-09-04', 'MM110'),
  rx(5, '2026-09-04', 'MM010'),
  rx(6, '2026-09-30', 'MM110'),
]
const SUNAP_INPUT: SunapRatesInput = { from: '2026-09-01', to: '2026-09-04', days: DAYS, rows: ROWS, block: BLOCK, pt: PT }
const RATE_KEYS = ['block_n', 'd90_block', 'd90_n', 'first_block', 'first_n', 'pt_n', 'ret_block', 'ret_n', 'visits']

const sumRates = (list: Iterable<SunapRates>): SunapRates => {
  const total = emptyRates()
  for (const rates of list) for (const key of Object.keys(total) as (keyof SunapRates)[]) total[key] += rates[key]
  return total
}

function dayRow(day: string): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day,
    partial: false,
    totals: { patients: 3, newPatients: 1, returning: 2, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 1, within7: 0, within14: 0, within30: 0, after30: 0 },
  }
}

describe('AC-8018.1 sunapByDay: 날마다 그날 Block 전환 아홉 칸', () => {
  it('AC-8018.1: 기간 안 환자·날이 있는 날마다 한 줄이고, 날마다 그 하루만 고른 sunapRates와 같다', () => {
    const byDay = sunapByDay(SUNAP_INPUT)
    expect([...byDay.keys()]).toEqual(['2026-09-01', '2026-09-02', '2026-09-04'])
    for (const [day, rates] of byDay) expect(rates).toEqual(sunapRates({ ...SUNAP_INPUT, from: day, to: day }))
    expect(byDay.get('2026-09-01')).toEqual({ visits: 3, first_n: 1, d90_n: 1, ret_n: 1, block_n: 2, pt_n: 1, first_block: 1, d90_block: 1, ret_block: 0 })
  })

  it('AC-8018.1: 기간의 날 sunap을 모두 더하면 같은 자료로 통계 탭 Block 전환이 세는 sunapRates와 같다(기간 일부를 골라도)', () => {
    expect(sumRates(sunapByDay(SUNAP_INPUT).values())).toEqual(sunapRates(SUNAP_INPUT))
    const byDay = sunapByDay(SUNAP_INPUT)
    const part = ['2026-09-02', '2026-09-03', '2026-09-04'].flatMap((day) => byDay.get(day) ?? [])
    expect(sumRates(part)).toEqual(sunapRates({ ...SUNAP_INPUT, from: '2026-09-02' }))
  })

  it('AC-8018.1: withDaySunap은 날 줄마다 그날 아홉 칸을 붙이고(오지 않은 날은 모두 0), 저장 검사를 지난다. 넣은 줄은 고치지 않는다', () => {
    const rows = ['2026-09-01', '2026-09-03'].map(dayRow)
    const before = structuredClone(rows)
    const byDay = sunapByDay(SUNAP_INPUT)
    const out = withDaySunap(rows, byDay)
    expect(out.map((row) => row.sunap)).toEqual([byDay.get('2026-09-01'), emptyRates()])
    expect(out[0]!.sunap).not.toBe(byDay.get('2026-09-01'))
    for (const row of out) {
      expect(Object.keys(row.sunap!).sort()).toEqual(RATE_KEYS)
      expect(validateDayPayload(row)).toStrictEqual(row)
    }
    expect(rows).toStrictEqual(before)
  })
})

// ── 달 줄 dropoff ─────────────────────────────────────────
// 메모리 기간 1/1~6/30(달 여섯 모두 온전히 든다), 자료 끝 날 6/30 − 30일 = 5/31
const RANGE = { from: '2026-01-01', to: '2026-06-30' }
const MAN: RxGroupDef = { id: 't00000000000000c1', codes: ['MAN1'] }
const ESW: RxGroupDef = { id: 't00000000000000c2', codes: ['ESW'] }
const NOBODY: RxGroupDef = { id: 't00000000000000c3', codes: ['NONE'] }
const GROUPS = [MAN, ESW, NOBODY]
const drx = (patient: number, date: string, rxCode: string): DropoffRow => ({ patient, date, rxCode })
// 1번 1월(도수 2회) · 2번 1월(도수 1회) · 3번 2월(도수 3회·충격파 1회) · 4번 2월(6/10에도 와서 아직 다니는 중)
// 5번 3월(충격파 2회) · 4월 신환 없음 · 6번 5/31(도수 1회, 5/31은 끝난 날) · 9번 6월(아직 다니는 중)
// 7번은 첫 내원일이 기간 앞, 8번은 첫 내원일이 없다 → 대상 아님
const DROP_ROWS: DropoffRow[] = [
  drx(1, '2026-01-05', 'MAN1'),
  drx(1, '2026-01-12', 'MAN1'),
  drx(2, '2026-01-20', 'MAN1'),
  drx(3, '2026-02-03', 'MAN1'),
  drx(3, '2026-02-03', 'ESW'),
  drx(3, '2026-02-10', 'MAN1'),
  drx(3, '2026-02-17', 'MAN1'),
  drx(4, '2026-02-25', 'MAN1'),
  drx(4, '2026-06-10', 'MAN1'),
  drx(5, '2026-03-10', 'ESW'),
  drx(5, '2026-03-17', 'ESW'),
  drx(6, '2026-05-31', 'MAN1'),
  drx(7, '2026-01-02', 'MAN1'),
  drx(8, '2026-01-03', 'MAN1'),
  drx(9, '2026-06-15', 'MAN1'),
]
const FIRST = new Map<number, string>([
  [1, '2026-01-05'],
  [2, '2026-01-20'],
  [3, '2026-02-03'],
  [4, '2026-02-25'],
  [5, '2026-03-10'],
  [6, '2026-05-31'],
  [7, '2025-12-20'],
  [9, '2026-06-15'],
])
const DROP_INPUT = { rows: DROP_ROWS, first: FIRST, groups: GROUPS, range: RANGE }
const line = (group: string, counts: readonly number[]): DropoffLine => dropoff({
  rows: counts.flatMap((count, i) => Array.from({ length: count }, (_, d) => drx(1000 + i, `2026-01-${String(d + 1).padStart(2, '0')}`, group))),
  first: new Map(counts.map((_, i) => [1000 + i, '2026-01-01'])),
  groups: [{ id: group, codes: [group] }],
  range: RANGE,
})[0]!

// 묶음마다 대상·k회 이상·10회 이상·1회만을 더한다(평균은 반올림한 값이라 더하지 않는다)
function summed(lines: readonly DropoffLine[], groups: readonly RxGroupDef[]) {
  return groups.flatMap(({ id }) => {
    const mine = lines.filter((one) => one.group === id)
    if (mine.length === 0) return []
    const sum = (pick: (one: DropoffLine) => number) => mine.reduce((total, one) => total + pick(one), 0)
    return [{ group: id, n: sum((one) => one.n), atLeast: [0, 1, 2, 3, 4, 5].map((k) => sum((one) => one.atLeast[k]!)), ten: sum((one) => one.ten), once: sum((one) => one.once) }]
  })
}
const additive = ({ group, n, atLeast, ten, once }: DropoffLine) => ({ group, n, atLeast, ten, once })

function monthRow(month: string): MonthPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    month,
    partial: false,
    totals: { patients: 3, newPatients: 1, returning: 2, unknown: 0 },
    rx: [{ code: 'MAN1', name: '가짜 도수', type: '', patients: 2, newPatients: 1, returning: 1, followup: [1, 1, 0, 0] }],
    groups: [],
    revisit: { cohort: 1, within7: 0, within14: 0, within30: 0, after30: 0 },
    regions: [],
  }
}

describe('AC-8018.2 dropoffByMonth: 첫 진료가 그달인 신환만 모아 몇 번까지 받나', () => {
  it('AC-8018.2: 달 전체가 메모리 기간 안인 달마다 한 줄이고 asOf = 자료 끝 날, 대상이 없는 달은 빈 목록이다', () => {
    const byMonth = dropoffByMonth(DROP_INPUT)
    expect([...byMonth.keys()]).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
    for (const value of byMonth.values()) expect(value.asOf).toBe(RANGE.to)
    expect(byMonth.get('2026-01')!.lines).toEqual([line(MAN.id, [2, 1])])
    expect(byMonth.get('2026-02')!.lines).toEqual([line(MAN.id, [3]), line(ESW.id, [1])])
    expect(byMonth.get('2026-03')!.lines).toEqual([line(ESW.id, [2])])
    expect(byMonth.get('2026-04')!.lines).toEqual([])
    expect(byMonth.get('2026-05')!.lines).toEqual([line(MAN.id, [1])])
    expect(byMonth.get('2026-06')!.lines).toEqual([])
  })

  it('AC-8018.2: 달마다 = 첫 내원일이 그달인 환자만 넣은 dropoff()이고, 모든 달의 줄을 묶음마다 더하면 통계 탭 dropoff()와 같다', () => {
    const byMonth = dropoffByMonth(DROP_INPUT)
    for (const [month, value] of byMonth) {
      const first = new Map([...FIRST].filter(([, day]) => day.startsWith(month)))
      expect(value.lines).toEqual(dropoff({ ...DROP_INPUT, first }))
    }
    const card = dropoff(DROP_INPUT)
    expect(card.map((one) => one.group)).toEqual([MAN.id, ESW.id])
    expect(summed([...byMonth.values()].flatMap((value) => value.lines), GROUPS)).toEqual(card.map(additive))
  })

  it('AC-8018.2: 기간 첫날·끝날이 달 중간이면 그 두 달은 넣지 않는다(그달 신환을 다 보지 못함) — 자료 끝 날은 기간 끝날', () => {
    const byMonth = dropoffByMonth({ ...DROP_INPUT, range: { from: '2026-01-15', to: '2026-06-20' } })
    expect([...byMonth.keys()]).toEqual(['2026-02', '2026-03', '2026-04', '2026-05'])
    for (const value of byMonth.values()) expect(value.asOf).toBe('2026-06-20')
    // 6/20 − 30일 = 5/21: 6번(5/31)은 아직 다니는 중이다
    expect(byMonth.get('2026-05')!.lines).toEqual([])
    expect(dropoffByMonth({ ...DROP_INPUT, range: { from: '2026-03-02', to: '2026-03-31' } }).size).toBe(0)
  })

  it('AC-8018.2: 묶음이 없으면 달마다 빈 목록이다', () => {
    const byMonth = dropoffByMonth({ ...DROP_INPUT, groups: [] })
    expect([...byMonth.values()].every((value) => value.lines.length === 0)).toBe(true)
  })

  it('AC-8018.2: withMonthDropoff는 그 달 값이 있는 달 줄에만 붙이고 저장 검사를 지난다. 없는 달 줄은 열쇠가 없고, 넣은 줄은 고치지 않는다', () => {
    const rows = ['2025-12', '2026-02', '2026-04'].map(monthRow)
    const before = structuredClone(rows)
    const byMonth = dropoffByMonth(DROP_INPUT)
    const out = withMonthDropoff(rows, byMonth)
    expect('dropoff' in out[0]!).toBe(false)
    expect(out[1]!.dropoff).toEqual(byMonth.get('2026-02'))
    expect(out[1]!.dropoff).not.toBe(byMonth.get('2026-02'))
    expect(out[2]!.dropoff).toEqual({ asOf: RANGE.to, lines: [] })
    for (const row of out) expect(validateMonthPayload(row)).toStrictEqual(row)
    expect(rows).toStrictEqual(before)
  })
})

describe('AC-8018.4 AI 경로에 보내는 집계는 새 열쇠가 있어도 지금과 같다', () => {
  it('AC-8018.4: 같은 달 줄에 dropoff가 있어도 없어도 buildReportInput 값이 같다', () => {
    const plain = monthRow('2026-02')
    const withSums = withMonthDropoff([plain], dropoffByMonth(DROP_INPUT))[0]!
    expect(withSums.dropoff?.lines.length).toBeGreaterThan(0)
    const input = (selected: MonthPayload) => buildReportInput({ selected, prev: null, lastYear: null, groupNames: { [MAN.id]: '도수' } })
    expect(input(validateMonthPayload(withSums)!)).toEqual(input(validateMonthPayload(plain)!))
  })
})

describe('AC-8018.5 새 열쇠에는 환자 번호·날 목록·처방 코드가 없다', () => {
  it('AC-8018.5: sunap은 숫자 아홉 칸, dropoff는 자료 끝 날과 묶음 열쇠·숫자뿐이다', () => {
    const days = withDaySunap(['2026-09-01', '2026-09-02'].map(dayRow), sunapByDay(SUNAP_INPUT))
    for (const { sunap } of days) expect(Object.values(sunap!).every((value) => Number.isSafeInteger(value))).toBe(true)
    const months = withMonthDropoff(['2026-01', '2026-02', '2026-03'].map(monthRow), dropoffByMonth(DROP_INPUT))
    const texts = (value: unknown): string[] =>
      typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(texts) : value !== null && typeof value === 'object' ? Object.values(value).flatMap(texts) : []
    const allowed = new Set([RANGE.to, MAN.id, ESW.id])
    for (const { dropoff: sums } of months) {
      expect(Object.keys(sums!).sort()).toEqual(['asOf', 'lines'])
      for (const one of sums!.lines) expect(Object.keys(one).sort()).toEqual(['atLeast', 'average', 'drop', 'group', 'n', 'once', 'ten'])
      expect(texts(sums).filter((text) => !allowed.has(text))).toEqual([])
    }
    const json = JSON.stringify([...days.map((day) => day.sunap), ...months.map((month) => month.dropoff)])
    for (const code of ['MAN1', 'ESW', 'MM110', 'MM010', 'ESWT7', '2026-01-05', '2026-02-25']) expect(json).not.toContain(code)
  })
})
