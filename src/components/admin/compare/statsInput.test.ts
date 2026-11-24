import { describe, expect, it } from 'vitest'
import { formatCount, formatRate, percentOf } from '@/components/charts/format'
import { formatManWon } from '@/components/revenue/money'
import { sumClosed } from '@/components/stats/sections/SunapSection'
import { pickRange } from '@/components/stats/periodPick'
import { revenueCells, revenueTabs, type RevenueInput } from '@/components/stats/revenueView'
import { sunapPct } from '@/components/stats/sunapView'
import { groupKey, treatmentRows } from '@/components/stats/treatmentView'
import { revisitRates, summaryCells, visitTrend, weekdayRows, type StatsInput } from '@/components/stats/view'
import { compareStatsInput } from './statsInput'
import type { CompareKind, CompareRaw } from '@/lib/admin/compare/load'
import { buildAlerts } from '@/lib/analytics/alerts'
import { addDays, addMonths, eachDay, monthRange, weekStartOf, weekdayOf } from '@/lib/analytics/dates'
import { holidayEffect } from '@/lib/analytics/holidayEffect'
import { HOLIDAYS } from '@/lib/analytics/holidays'
import { AGE_BANDS, NO_BIRTH } from '@/lib/analytics/patientMix'
import { cellAverage, foldHours, heatLevel, VISIT_HOURS } from '@/lib/analytics/visitHours'
import { ratePct, rateSummary } from '@/lib/calendar/counts'
import { sumPeriod } from '@/lib/revenue/summary'
import { salesRow } from '@/lib/admin/compare/sales'
import { validateDayPayload } from '@/lib/payload/validate'
import type { DayPayload } from '@/types/payload'
import type { RevenueDayRow } from '@/types/revenue'
import type { StatsRxGroup } from '@/types/rxGroups'
import { SUNAP_TOTAL_KEYS } from '@/types/sunap'

// 통계 나란히 보기 칸 값(spec admin-view REQ-8014 AC-8014.5, design.md '통계 나란히 보기 칸 표').
// 줄은 admin_rows jsonb 모양(supabase/migrations/20261124000000_admin_view.sql)을 지어낸 것이다. 숫자·이름은 모두 가짜다.
// 기대 값은 같은 가짜 저장 숫자를 통계 탭 순수 함수에 그대로 넣어 만든다(새 공식이 없음을 견준다)

const MONTH = '2026-10'
const KINDS: CompareKind[] = [
  'stats_days',
  'stats_months',
  'stats_day_totals',
  'stats_coverage',
  'stats_rx_groups',
  'stats_goals',
  'sales_days',
  'sales_code_totals',
  'sales_codes',
  'sunap_settings',
  'sunap_days',
  'calendar_settings',
  'calendar_allday',
  'calendar_counts',
  'clinic_profiles',
  'staff_members',
  'staff_pay',
  'staff_settings',
]
const emptyRaw = (): CompareRaw => Object.fromEntries(KINDS.map((kind) => [kind, []])) as unknown as CompareRaw

// 처방 묶음 둘(물리치료 먼저)
const PT_CODES = ['MM001', 'MM002']
const DS_CODES = ['MX100']
const KEY_PT = groupKey(PT_CODES)
const KEY_DS = groupKey(DS_CODES)
const GROUP_ROWS = [
  { id: '00000000-0000-4000-8000-0000000000a2', name: '도수치료', codes: DS_CODES, out_codes: [], cond: [], sort_order: 1 },
  { id: '00000000-0000-4000-8000-0000000000a1', name: '물리치료', codes: PT_CODES, out_codes: [], cond: [], sort_order: 0 },
]
const GROUPS: StatsRxGroup[] = [
  { id: '00000000-0000-4000-8000-0000000000a1', name: '물리치료', codes: PT_CODES, out: [], cond: [], sortOrder: 0 },
  { id: '00000000-0000-4000-8000-0000000000a2', name: '도수치료', codes: DS_CODES, out: [], cond: [], sortOrder: 1 },
]

const openDay = (ymd: string) => weekdayOf(ymd) !== 7 // 일요일은 쉰다
const twoMonths = (month: string) => eachDay({ from: monthRange(addMonths(month, -1)).from, to: monthRange(month).to }).filter(openDay)

// 그달 마지막 주(마지막 날이 든 주 월요일 ~ 말일)는 신환이 두 배, 물리치료 묶음이 줄어든다
function dayPayload(month: string, day: string, withSunap: boolean): DayPayload {
  const late = day >= weekStartOf(monthRange(month).to)
  const newPatients = late ? 8 : 4
  const first90 = 2
  const returning = 30
  const patients = newPatients + first90 + returning
  return {
    schemaVersion: 2,
    quality: 'valid',
    day,
    partial: false,
    totals: { patients, newPatients, first90, returning, unknown: 0 },
    rx: [],
    groups: [
      { id: KEY_DS, patients: 5, newPatients: 1, returning: 3 },
      { id: KEY_PT, patients: late ? 5 : 12, newPatients: 2, returning: 3 },
    ].sort((a, b) => (a.id < b.id ? -1 : 1)),
    revisit: { cohort: newPatients, within7: 1, within14: 2, within30: 3, after30: 0 },
    ...(withSunap
      ? { sunap: { visits: patients, first_n: newPatients, d90_n: first90, ret_n: returning, block_n: 7, pt_n: 10, first_block: 1, d90_block: 1, ret_block: 5 } }
      : {}),
  }
}

const AGE_PEOPLE = [5, 10, 20, 40, 60, 80, 50, 25, 5, 5] // 9 나이대 + 생년월일 없음, 합 300
const SECTIONS = (month: string) => ({
  v: 1,
  month,
  partial: false,
  mix: { people: 300, age: [...AGE_BANDS, NO_BIRTH].map((name, i) => ({ name, people: AGE_PEOPLE[i] })), insurance: [], town: [] },
  hours: {
    openDays: [4, 4, 4, 5, 5, 5, 0],
    weekdays: [160, 150, 140, 170, 165, 100, 0],
    hours: [10, 90, 100, 95, 60, 30, 85, 80, 70, 60, 50, 30, 125],
    unknown: 0,
  },
  doctors: [
    { name: '원장 가', patients: 180, newPatients: 30, amount: 32_000_000 },
    { name: '원장 나', patients: 120, newPatients: 20, amount: 22_000_000 },
  ],
})

const DROPOFF = (month: string) => ({
  asOf: monthRange(addMonths(month, 1)).to,
  lines: [
    { group: KEY_DS, n: 5, atLeast: [5, 3, 1, 0, 0, 0], ten: 0, once: 2, average: 1.8, drop: 2 },
    { group: KEY_PT, n: 20, atLeast: [20, 12, 8, 5, 3, 2], ten: 1, once: 8, average: 9.9, drop: 1 },
  ],
})

const MONTH_GROUPS = [
  { id: KEY_PT, patients: 80, newPatients: 20, returning: 60, followup: [40, 20, 15, 5] },
  { id: KEY_DS, patients: 30, newPatients: 6, returning: 24, followup: [10, 10, 5, 5] },
].sort((a, b) => (a.id < b.id ? -1 : 1))

const salesRowOf = (day: string) => ({
  day,
  visits: 36,
  new_patients: 4,
  return_visits: 32,
  total: 2_000_000,
  insurer: 1_000_000,
  noncovered: 500_000,
  copay: 300_000,
  other_total: 200_000,
  cash: 500_000,
  card: 1_500_000,
  transfer: 0,
  receivable_in: 0,
  unconfirmed: false,
  split_unconfirmed: false,
  rough_total: null,
  day_codes: true,
})

const ZERO_SUNAP = Object.fromEntries(SUNAP_TOTAL_KEYS.map((key) => [key, 0]))
const sunapRowOf = (day: string) => ({ work_date: day, closed_at: `${day}T10:00:00Z`, late: false, ...ZERO_SUNAP, first_n: 4, rsv_first: 3, d90_n: 2, rsv_d90: 1 })

const calRow = (day: string, status: string, origDay: string | null = null) => ({
  day,
  staff_id: 'staff-1',
  staff_name: '치료사 가',
  kind_id: 'kind-1',
  kind_name: '도수',
  status,
  auto: null,
  orig_day: origDay,
})

// 12달 날 합계(휴일 칸): 그달 끝 − 364일 ~ 그달 끝, 일요일·공휴일·의원 휴진일은 쉬고 공휴일 앞날은 내원이 많다
const CLOSED = (month: string) => [`${month}-20`]
function dayTotals(month: string) {
  const to = monthRange(month).to
  const closed = new Set([...HOLIDAYS, ...CLOSED(month)])
  return eachDay({ from: addDays(to, -364), to })
    .filter((day) => openDay(day) && !closed.has(day))
    .map((day) => {
      const busy = closed.has(addDays(day, 1)) ? 12 : 0
      const patients = 36 + busy
      return { day, partial: false, totals: { patients, newPatients: 4, returning: patients - 4, unknown: 0 } }
    })
}

type Opts = { sums?: boolean; goal?: number | null }
function rawOf(month: string, { sums = true, goal = 50_000_000 }: Opts = {}): CompareRaw {
  const raw = emptyRaw()
  const days = twoMonths(month)
  raw.stats_days = days.map((day) => ({ day, partial: false, source: 'bit', payload: dayPayload(month, day, sums), updated_at: `${day}T12:00:00Z` }))
  raw.stats_months = [
    { month, partial: false, rx: [], groups: MONTH_GROUPS, dropoff: sums ? DROPOFF(month) : null, sections: SECTIONS(month) },
  ]
  raw.stats_day_totals = dayTotals(month)
  raw.stats_coverage = [{ from_day: monthRange(addMonths(month, -1)).from, to_day: monthRange(month).to }]
  raw.stats_rx_groups = GROUP_ROWS
  raw.stats_goals = goal === null ? [] : [{ month, visits: null, new_patients: null, revenue: goal }]
  raw.sales_days = days.map(salesRowOf)
  raw.sunap_days = days.filter((day) => day.startsWith(month)).map(sunapRowOf)
  const inMonth = days.filter((day) => day.startsWith(month))
  raw.calendar_counts = [
    ...inMonth.slice(0, 6).map((day) => calRow(day, 'came')),
    calRow(inMonth[6]!, 'cancel'),
    calRow(inMonth[7]!, 'cancel'),
    calRow(inMonth[8]!, 'noshow'),
    calRow(inMonth[9]!, 'came', inMonth[2]!),
    // 지난달 예약은 그달 숫자에 들지 않는다
    ...days.slice(0, 3).map((day) => calRow(day, 'cancel')),
  ]
  raw.clinic_profiles = [{ display_name: '가나 의원', honorific: '원장님', hours: null, closed_dates: CLOSED(month), staff: [] }]
  return raw
}

// 통계 탭이 같은 달을 볼 때의 입력(오늘 = 다음 달 1일)
function statsInputOf(month: string, sums = true): StatsInput {
  const today = monthRange(addMonths(month, 1)).from
  return {
    days: twoMonths(month).map((day) => dayPayload(month, day, sums)),
    covered: [{ from: monthRange(addMonths(month, -1)).from, to: monthRange(month).to }],
    range: pickRange(today, { kind: 'month', unit: 'day', month }, false),
  }
}

function revenueInputOf(month: string): RevenueInput {
  const days = twoMonths(month).map((day): RevenueDayRow & { dayCodes: boolean } => ({
    date: day,
    visits: 36,
    newPatients: 4,
    returnVisits: 32,
    total: 2_000_000,
    insurer: 1_000_000,
    noncovered: 500_000,
    copay: 300_000,
    otherTotal: 200_000,
    cash: 500_000,
    card: 1_500_000,
    transfer: 0,
    receivableIn: 0,
    unconfirmed: false,
    splitUnconfirmed: false,
    roughTotal: null,
    dayCodes: true,
  }))
  const { range } = statsInputOf(month)
  return { range, lastDay: monthRange(month).to, days, codes: [], monthCodes: [], groups: [], noDayCodes: false }
}

const dash = (text: string) => (text === '–' ? null : text)
const pctParts = (text: string) => (text === '–' ? null : text.replace(/%$/, ''))

describe('compareStatsInput — 통계 탭과 같은 순수 함수 (AC-8014.5)', () => {
  const cells = compareStatsInput(rawOf(MONTH), MONTH)
  const input = statsInputOf(MONTH)

  it('AC-8014.5: 환자 요약 넷은 summaryCells(기간 = 그달) 값 그대로다', () => {
    const expected = summaryCells(input).map((cell) => ({ label: cell.label, value: cell.value === null ? null : formatCount(cell.value), unit: cell.unit }))
    expect(cells.summary.patients).toEqual(expected)
    expect(cells.summary.patients.map((cell) => cell.label)).toEqual(['하루 평균 내원', '신환', '90일초진', '재진'])
    expect(cells.summary.patients.every((cell) => cell.value !== null)).toBe(true)
  })

  it('AC-8014.5: 매출 요약 둘은 revenueCells 값 그대로다(총매출 · 건당 진료비)', () => {
    const expected = revenueCells(revenueInputOf(MONTH)).map((cell) => ({ label: cell.label, value: dash(cell.value), unit: cell.unit ?? '' }))
    expect(cells.summary.revenue).toEqual(expected)
    expect(cells.summary.revenue.map((cell) => cell.label)).toEqual(['총매출', '건당 진료비'])
  })

  it('AC-8014.5: 평소와 다른 것은 오늘 = 다음 달 1일의 buildAlerts를 "▲ 100% 신환이 평소보다 많아요" 꼴로 바꾼 것이다', () => {
    const alerts = buildAlerts({ today: '2026-11-01', days: input.days, groups: [{ id: KEY_PT, name: '물리치료' }, { id: KEY_DS, name: '도수치료' }], cal: [] })
    expect(alerts).not.toBeNull()
    expect(cells.summary.alerts).toHaveLength(alerts!.length)
    expect(cells.summary.alerts?.map((alert) => alert.kind)).toEqual(alerts!.map((alert) => alert.kind))
    expect(cells.summary.alerts).toContainEqual({ kind: 'up', rate: '100%', text: '신환이 평소보다 많아요' })
    expect(cells.summary.alerts).toContainEqual({ kind: 'down', rate: '58%', text: '물리치료가 평소보다 적어요' })
  })

  it('AC-8014.5: 이번 달 목표는 그달 salesRow 총매출 × 100 ÷ 매출 목표(소수 첫째 자리 버림)와 목표 금액이다', () => {
    const total = salesRow(revenueInputOf(MONTH).days.filter((day) => day.date.startsWith(MONTH)))!.total
    expect(total).toBe(54_000_000)
    expect(cells.summary.goal).toEqual({ rate: '108.0%', goal: formatManWon(50_000_000), width: 100 })
    expect(compareStatsInput(rawOf(MONTH, { goal: null }), MONTH).summary.goal).toBeNull()
    expect(compareStatsInput(rawOf(MONTH, { goal: 0 }), MONTH).summary.goal).toBeNull()
    expect(compareStatsInput(rawOf(MONTH, { goal: 60_000_000 }), MONTH).summary.goal).toEqual({ rate: '90.0%', goal: '6,000만 원', width: 90 })
  })

  it('AC-8014.5: 일별 내원은 visitTrend 칸마다 [신환, 나머지]이고 축 글은 그달 1일 · 말일이다', () => {
    const trend = visitTrend(input)!
    expect(cells.patients.daily).toEqual({
      columns: trend.buckets.map((bucket) => (bucket.blank ? [0, 0] : [bucket.values[0] ?? 0, bucket.values.slice(1).reduce((a, b) => a + b, 0)])),
      from: '10월 1일',
      to: '10월 31일',
    })
    expect(cells.patients.daily?.columns).toHaveLength(27) // 통계 탭처럼 저장된 날(일요일 뺀 27일)만 칸이다
  })

  it('AC-8014.5: 신환 재방문율은 revisitRates의 7일·14일·30일 안이다', () => {
    const rates = revisitRates(input)
    const value = (cell: typeof rates.d7) => (cell.kind === 'rate' ? formatRate(cell.value) : null)
    expect(cells.patients.revisit).toEqual([
      { label: '7일 안', value: value(rates.d7), unit: '%' },
      { label: '14일 안', value: value(rates.d14), unit: '%' },
      { label: '30일 안', value: value(rates.d30), unit: '%' },
    ])
    expect(cells.patients.revisit.every((cell) => cell.value !== null)).toBe(true)
  })

  it('AC-8014.5: 환자 구성은 달 sections.mix.age에서 많은 나이대 셋(생년월일 없음 뺌)과 몫이다', () => {
    expect(cells.patients.age).toEqual([
      { name: '50대', text: '26.6%', width: 100 },
      { name: '40대', text: '20.0%', width: 75 },
      { name: '60대', text: '16.6%', width: 62.5 },
    ])
  })

  it('AC-8014.5: 몇 번까지 받나는 묶음 차례 첫 묶음 줄의 수(n·atLeast)로 새로 센다 — 저장된 평균은 쓰지 않는다', () => {
    expect(cells.patients.dropoff).toEqual([
      { name: '1번', text: '100.0%', width: 100 },
      { name: '2번', text: '60.0%', width: 60 },
      { name: '3번 이상', text: '40.0%', width: 40 },
    ])
  })

  it('AC-8014.5: 매출 추이는 revenueTabs 매출 막대와 합계, 급여·비급여·기타는 그달 sumPeriod 몫이다', () => {
    const tabs = revenueTabs(revenueInputOf(MONTH))
    if (tabs.kind !== 'ready') throw new Error('매출 탭이 비었다')
    expect(cells.revenue.trend).toEqual({
      columns: { columns: tabs.trend.buckets.map((bucket) => [bucket.blank ? 0 : (bucket.values[0] ?? 0)]), from: '10월 1일', to: '10월 31일' },
      total: tabs.trend.lead.amount,
    })
    expect(cells.revenue.trend?.total).toBe('5,400만 원')
    const sum = sumPeriod(revenueInputOf(MONTH).days, monthRange(MONTH))
    expect(sum?.splitTotal).toBe(54_000_000)
    expect(cells.revenue.split).toEqual([
      { key: 'covered', name: '급여', share: `${formatRate(sum!.covered! / sum!.splitTotal!)}%`, width: 65 },
      { key: 'noncovered', name: '비급여', share: '25.0%', width: 25 },
      { key: 'other', name: '기타', share: '10.0%', width: 10 },
    ])
  })

  it('AC-8014.5: 신환 예약률·90일 예약률은 마감한 날 sumClosed·sunapPct, Block 전환은 그달 날 줄 sunap 합이다', () => {
    const closed = rawOf(MONTH).sunap_days.map((row) => ({ day: row.work_date as string, late: false, totals: { first_n: 4, rsv_first: 3, d90_n: 2, rsv_d90: 1 } }))
    const sums = sumClosed(closed)
    const month = input.days.filter((day) => day.day.startsWith(MONTH))
    const block = sunapPct(month.reduce((n, day) => n + day.sunap!.first_block, 0), month.reduce((n, day) => n + day.sunap!.first_n, 0))
    expect(block).toBe('20.5%')
    expect(cells.sunap).toEqual([
      { label: '신환 예약률', value: pctParts(sunapPct(sums.rsvFirst, sums.first)), unit: '%' },
      { label: '90일 예약률', value: pctParts(sunapPct(sums.rsvD90, sums.d90)), unit: '%' },
      { label: 'Block 전환', value: pctParts(block), unit: '%' },
    ])
  })

  it('AC-8014.5: 예약 네 칸은 그달 예약 줄만 rateSummary·ratePct로 센다', () => {
    const rows = rawOf(MONTH)
      .calendar_counts.filter((row) => String(row.day).startsWith(MONTH))
      .map((row) => ({ staffId: 'staff-1', staffName: '치료사 가', kindId: 'kind-1', kindName: '도수', status: row.status as 'came', auto: null, origDay: row.orig_day as string | null }))
    const summary = rateSummary(rows)
    expect(summary.total).toBe(10)
    expect(cells.calendar).toEqual([
      { label: '예약 수', value: '10', unit: '건' },
      { label: '취소율', value: pctParts(ratePct(summary.cancel, summary.total)), unit: '%' },
      { label: '변경율', value: '10.0', unit: '%' },
      { label: '안 옴율', value: '10.0', unit: '%' },
    ])
    expect(cells.calendar?.[1]?.value).toBe('20.0')
  })

  it('AC-8014.5: 처방별 추세는 treatmentRows 건수 많은 차례 셋, 처방별 신환·재진은 그 묶음의 달 줄 수다', () => {
    const ready = treatmentRows(input, GROUPS).flatMap((row) => (row.kind === 'ready' ? [row] : []))
    const top = [...ready].sort((a, b) => b.row.count - a.row.count)
    expect(cells.rx.trend).toEqual(top.map((row) => ({ name: row.group.name, text: `${formatCount(row.row.count)}건`, width: percentOf(row.row.count, top[0]!.row.count) })))
    expect(cells.rx.trend?.map((row) => row.name)).toEqual(['물리치료', '도수치료'])
    expect(cells.rx.split).toEqual([
      { name: '물리치료', cells: ['신환 20명', '재진 60건'] },
      { name: '도수치료', cells: ['신환 6명', '재진 24건'] },
    ])
  })

  it('AC-8014.5: 원장님별은 달 sections.doctors, 한 분이면 single', () => {
    expect(cells.ops.doctors).toEqual([
      { name: '원장 가', cells: ['180명', '3,200만 원'] },
      { name: '원장 나', cells: ['120명', '2,200만 원'] },
    ])
    const raw = rawOf(MONTH)
    raw.stats_months = [{ ...raw.stats_months[0]!, sections: { ...SECTIONS(MONTH), doctors: [] } }]
    expect(compareStatsInput(raw, MONTH).ops.doctors).toBe('single')
  })

  it('AC-8014.5: 시간대별 접수는 sections.hours를 9시~18시 열 칸으로 접은 heatLevel이다', () => {
    const open = 27
    const folded = foldHours({ hours: [...VISIT_HOURS], rows: [{ weekday: 1, openDays: open, cells: SECTIONS(MONTH).hours.hours }], unknown: 0, peak: null }, { from: 9, to: 18 })
    expect(cells.ops.hours).toEqual({ levels: folded.rows[0]!.cells.map((sum) => heatLevel(cellAverage(sum, open))), from: '9시', to: '18시' })
    expect(cells.ops.hours?.levels).toHaveLength(10)
  })

  it('AC-8014.5: 요일별 내원은 weekdayRows 평균(월~토, 일요일은 값이 있을 때만)이다', () => {
    const rows = weekdayRows(input.days, input.range)!
    expect(cells.ops.weekdays).toEqual({ names: ['월', '화', '수', '목', '금', '토'], values: rows.slice(0, 6).map((row) => row.average ?? 0) })
  })

  it('AC-8014.5: 휴일에 따라만 그달 끝까지 12달(stats_day_totals)과 의원 휴진일로 holidayEffect를 센다', () => {
    const days = dayTotals(MONTH).map((row) => validateDayPayload({ schemaVersion: 2, quality: 'valid', ...row, rx: [], groups: [], revisit: { cohort: 0, within7: 0, within14: 0 } })!)
    const rows = holidayEffect({ today: '2026-11-01', days, closedDates: CLOSED(MONTH) })!
    const text = (key: 'before' | 'after') => {
      const row = rows.find((one) => one.key === key)!
      if (row.days < 5) return '아직 적어요'
      if (row.vsUsual === null) return '–'
      return row.vsUsual === 0 ? '평소보다 0%' : `평소보다 ${row.vsUsual > 0 ? '+' : '−'}${Math.abs(row.vsUsual)}%`
    }
    expect(cells.ops.holiday).toEqual([
      { name: '공휴일 앞날', cells: [text('before')] },
      { name: '공휴일 다음 날', cells: [text('after')] },
    ])
    expect(cells.ops.holiday?.[0]?.cells[0]).toMatch(/^평소보다 \+\d+%$/)
    // 두 달 날 줄만 있고 12달 합계가 없으면 휴일 칸은 없다(그달 하나로 세지 않는다)
    const raw = rawOf(MONTH)
    raw.stats_day_totals = []
    expect(compareStatsInput(raw, MONTH).ops.holiday).toBeNull()
  })
})

describe('compareStatsInput — 저장 안 된 값은 null (AC-8014.5)', () => {
  it('AC-8014.5: 합계 저장 전 달(날 줄 sunap·달 줄 dropoff 없음)은 Block 전환·몇 번까지 받나만 비고 나머지는 그대로다', () => {
    const before = compareStatsInput(rawOf(MONTH, { sums: false }), MONTH)
    const after = compareStatsInput(rawOf(MONTH), MONTH)
    expect(before.hasData).toBe(true)
    expect(before.patients.dropoff).toBeNull()
    expect(before.sunap?.[2]).toEqual({ label: 'Block 전환', value: null, unit: '%' })
    expect(before.sunap?.slice(0, 2)).toEqual(after.sunap?.slice(0, 2))
    expect(before.summary).toEqual(after.summary)
    expect(before.patients.age).toEqual(after.patients.age)
  })

  it('AC-8014.5: 줄이 없는 종류는 그 값만 null이다(마감한 날·예약·sections·달 줄 없음)', () => {
    const raw = rawOf(MONTH)
    raw.sunap_days = []
    raw.calendar_counts = []
    raw.stats_months = []
    const cells = compareStatsInput(raw, MONTH)
    expect(cells.hasData).toBe(true)
    expect(cells.sunap).toBeNull()
    expect(cells.calendar).toBeNull()
    expect(cells.patients.age).toBeNull()
    expect(cells.patients.dropoff).toBeNull()
    expect(cells.rx.split).toBeNull()
    expect(cells.ops.doctors).toBeNull()
    expect(cells.ops.hours).toBeNull()
    expect(cells.rx.trend).not.toBeNull()
  })

  it('AC-8014.5: 그달 자료가 하나도 없으면 hasData가 거짓이고 값은 모두 비어 있다', () => {
    const raw = emptyRaw()
    raw.stats_rx_groups = GROUP_ROWS
    raw.clinic_profiles = [{ display_name: '가나 의원', honorific: '원장님', hours: null, closed_dates: [], staff: [] }]
    const cells = compareStatsInput(raw, MONTH)
    expect(cells.hasData).toBe(false)
    expect(cells.summary.patients.every((cell) => cell.value === null)).toBe(true)
    expect(cells.summary.revenue.every((cell) => cell.value === null)).toBe(true)
    expect(cells.summary.alerts).toBeNull()
    expect(cells.summary.goal).toBeNull()
    expect(cells.patients.daily).toBeNull()
    expect(cells.revenue.trend).toBeNull()
    expect(cells.revenue.split).toBeNull()
    expect(cells.ops.weekdays).toBeNull()
    expect(cells.ops.holiday).toBeNull()
  })

  it('AC-8014.5: 지난달 줄만 있으면 그달 자료 없음이다', () => {
    const raw = rawOf(MONTH)
    const prev = addMonths(MONTH, -1)
    for (const kind of ['stats_days', 'sales_days'] as const) raw[kind] = raw[kind].filter((row) => String(row.day).startsWith(prev))
    raw.stats_months = []
    raw.stats_goals = []
    raw.sunap_days = []
    raw.calendar_counts = raw.calendar_counts.filter((row) => String(row.day).startsWith(prev))
    expect(compareStatsInput(raw, MONTH).hasData).toBe(false)
  })

  it('AC-8014.5: 모양이 틀린 줄은 지금 줄 검사 함수로 빠진다(날 열쇠 다름·출처 다름·합이 안 맞음)', () => {
    const good = compareStatsInput(rawOf(MONTH), MONTH)
    const raw = rawOf(MONTH)
    const [first, second, third, ...rest] = raw.stats_days
    const payload = (row: Record<string, unknown>) => row.payload as DayPayload
    raw.stats_days = [
      ...rest,
      { ...first!, day: '2026-09-30' }, // 줄 날과 payload 날이 다름
      { ...second!, source: 'ocr' },
      { ...third!, payload: { ...payload(third!), totals: { ...payload(third!).totals, patients: 1 } } },
      { day: '2026-10-15', partial: false, source: 'bit', payload: 'x', updated_at: '' },
    ]
    expect(() => compareStatsInput(raw, MONTH)).not.toThrow()
    raw.stats_months = [{ month: MONTH, partial: false, rx: [], groups: [{ id: 'bad' }], dropoff: null, sections: { v: 2 } }]
    raw.sales_days = [...raw.sales_days, { day: 'x', total: -1 }]
    raw.sunap_days = [...raw.sunap_days, { work_date: MONTH, closed_at: '' }]
    raw.calendar_counts = [...raw.calendar_counts, { day: '2026-10-02', status: 'gone' }]
    const cells = compareStatsInput(raw, MONTH)
    expect(cells.patients.age).toBeNull()
    expect(cells.patients.dropoff).toBeNull()
    expect(cells.summary.revenue).toEqual(good.summary.revenue)
    expect(cells.calendar).toEqual(good.calendar)
    expect(cells.sunap).toEqual(good.sunap)
  })
})

describe('compareStatsInput — 10년 앞 옛 달도 같은 셈 (AC-8014.5)', () => {
  it('AC-8014.5: 2016년 10월도 통계 탭 함수 값과 같다', () => {
    const old = '2016-10'
    const cells = compareStatsInput(rawOf(old), old)
    const input = statsInputOf(old)
    expect(cells.hasData).toBe(true)
    expect(cells.summary.patients).toEqual(summaryCells(input).map((cell) => ({ label: cell.label, value: cell.value === null ? null : formatCount(cell.value), unit: cell.unit })))
    expect(cells.summary.revenue).toEqual(revenueCells(revenueInputOf(old)).map((cell) => ({ label: cell.label, value: dash(cell.value), unit: cell.unit ?? '' })))
    expect(cells.patients.daily?.from).toBe('10월 1일')
    expect(cells.patients.dropoff?.[2]).toEqual({ name: '3번 이상', text: '40.0%', width: 40 })
    expect(cells.summary.goal?.rate).toBe('104.0%') // 2016년 10월은 진료한 날 26일 × 200만 원
    expect(cells.ops.holiday).not.toBeNull()
  })
})
