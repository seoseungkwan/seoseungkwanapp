import { describe, expect, it } from 'vitest'
import { checkCustom, pickRange, type StatsPick } from '@/components/stats/periodPick'
import { trendSeries } from '@/components/stats/trendSeries'
import { patientTrend } from '@/components/stats/view'
import type { BarBucket } from '@/components/charts/StackedBarChart'
import type { DayPayload } from '@/types/payload'
import { flowBasis, flowDense, flowOf, flowSeries, flowTicks, flowTrend, QUICK_CHOICE, rankLine, todayFinished, type FlowChoice } from './flow'
import { PERIODS, periodRange, tickLabels, trendBuckets } from './view'

// 대시보드 기간별 흐름의 고른 기간 잇기 (dashboard-period REQ-1801·REQ-1802·REQ-1803, design.md 'summary/flow.ts').
// 시험의 오늘은 2026-11-06(금), 어제는 2026-11-05다. 가짜 DayPayload는 이 시험 파일 안에서만 만든다

const TODAY = '2026-11-06'

// first90: 새 도우미(v4) 날의 90일초진 수(first90 AC-4402.2). 주면 totals에 열쇠가 생기고 환자 수에 더한다. 주지 않으면 옛 날(열쇠 없음)이다
type DayOptions = { partial?: boolean; newPatients?: number; returning?: number; first90?: number }
function day(ymd: string, o: DayOptions = {}): DayPayload {
  const newPatients = o.newPatients ?? 2
  const returning = o.returning ?? 8
  const first90 = o.first90 === undefined ? {} : { first90: o.first90 }
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: o.partial ?? false,
    totals: { patients: newPatients + (o.first90 ?? 0) + returning, newPatients, returning, unknown: 0, ...first90 },
    rx: [],
    groups: [],
    revisit: { cohort: newPatients, within7: 0, within14: 0 },
  }
}

const month = (m: string, unit: 'day' | 'week' = 'day'): StatsPick => ({ kind: 'month', unit, month: m })
const year = (y: string): StatsPick => ({ kind: 'year', year: y })
const custom = (from: string, to: string, unit: 'day' | 'week' | 'month' = 'day'): StatsPick => ({ kind: 'custom', unit, from, to })
const flow = (choice: FlowChoice, todayDone = false) => flowOf(TODAY, choice, todayDone)
const labels = (ticks: { label: string }[]) => ticks.map((t) => t.label)

describe('todayFinished · lastDay — 끝난 마지막 날 (AC-1801.3)', () => {
  it('AC-1801.3: 오늘 줄이 있고 partial false면 끝남이다. partial true·오늘 줄 없음은 아니다(같은 날 두 줄은 뒤의 것)', () => {
    expect(todayFinished(TODAY, [day(TODAY)])).toBe(true)
    expect(todayFinished(TODAY, [day(TODAY, { partial: true })])).toBe(false)
    expect(todayFinished(TODAY, [day('2026-11-05')])).toBe(false)
    expect(todayFinished(TODAY, [])).toBe(false)
    expect(todayFinished(TODAY, [day(TODAY), day(TODAY, { partial: true })])).toBe(false)
    expect(todayFinished(TODAY, [day(TODAY, { partial: true }), day(TODAY)])).toBe(true)
  })

  it.each([
    ['빠른 단추', 30],
    ['달', month('2026-10')],
    ['직접 날짜', custom('2026-09-01', '2026-09-30')],
  ] as const)('AC-1801.3: %s — lastDay는 오늘이 끝났으면 오늘(11월 6일), 아니면 어제(11월 5일)다', (_, choice) => {
    expect(flow(choice, true).lastDay).toBe('2026-11-06')
    expect(flow(choice, false).lastDay).toBe('2026-11-05')
  })

  it("AC-1801.3: 그 lastDay를 받은 통계 탭 직접 날짜 검사는 '어제(11월 5일)까지만 고를 수 있어요.'(끝났으면 '오늘(11월 6일)…')다", () => {
    expect(checkCustom('2026-11-01', '2026-11-06', 'day', flow(30).lastDay, false)).toEqual({ kind: 'error', text: '어제(11월 5일)까지만 고를 수 있어요.' })
    expect(checkCustom('2026-11-01', '2026-11-07', 'day', flow(30, true).lastDay, true)).toEqual({ kind: 'error', text: '오늘(11월 6일)까지만 고를 수 있어요.' })
  })
})

describe('flowOf — 빠른 단추 (AC-1801.4·AC-1802.5)', () => {
  it('AC-1801.4: QUICK_CHOICE는 통계 빠른 단추 글자(7 → 7d · 30 → 30d · 90 → 90d)다', () => {
    expect(QUICK_CHOICE).toEqual({ 7: '7d', 30: '30d', 90: '90d' })
  })

  it.each(PERIODS)('AC-1801.4·AC-1802.5: 최근 %i일 — current·head는 periodRange 그대로, 일 칸, picker는 통계 빠른 단추 글자, range null', (period) => {
    for (const done of [false, true]) {
      const f = flow(period, done)
      expect(f.period).toBe(period)
      expect(f.current).toEqual(periodRange(TODAY, period))
      expect(f.head).toBe(periodRange(TODAY, period).label)
      expect(f.bucket).toBe('day')
      expect(f.picker).toBe(QUICK_CHOICE[period])
      expect(f.range).toBeNull()
    }
  })

  it("AC-1801.4: 빠른 단추 기간 글은 지금과 한 글자도 같다('10월 7일 – 11월 5일' · '10월 30일 – 11월 5일' · '8월 8일 – 11월 5일')", () => {
    expect(flow(30).head).toBe('10월 7일 – 11월 5일')
    expect(flow(7).head).toBe('10월 30일 – 11월 5일')
    expect(flow(90).head).toBe('8월 8일 – 11월 5일')
  })
})

describe('flowOf — 고른 기간 (AC-1801.4)', () => {
  it.each([
    ['2026년 10월', month('2026-10'), false, '10월 1일 – 31일'],
    ['2026년 10월 주별', month('2026-10', 'week'), false, '10월 1일 – 31일'],
    ['직접 날짜 9월 3일 – 10월 2일', custom('2026-09-03', '2026-10-02'), false, '9월 3일 – 10월 2일'],
    ['다른 해의 달', month('2025-10'), false, '2025년 10월 1일 – 31일'],
    ['다른 해 같은 달 안 직접 날짜', custom('2024-02-03', '2024-02-20', 'week'), false, '2024년 2월 3일 – 20일'],
    ['해를 넘는 직접 날짜', custom('2025-12-20', '2026-01-10'), false, '2025년 12월 20일 – 2026년 1월 10일'],
    ['끝나지 않은 11월', month('2026-11'), false, '11월 1일 – 5일 (어제까지)'],
    ['끝나지 않은 11월 · 오늘 끝남', month('2026-11'), true, '11월 1일 – 6일 (오늘까지)'],
    ['끝나지 않은 해 2026년', year('2026'), false, '1월 1일 – 11월 5일 (어제까지)'],
    ['끝난 해 2025년', year('2025'), false, '2025년 1월 1일 – 12월 31일'],
    ['어제에서 끝나는 직접 날짜(붙지 않는다)', custom('2026-10-07', '2026-11-05'), false, '10월 7일 – 11월 5일'],
    ['오늘에서 끝나는 직접 날짜(붙지 않는다)', custom('2026-11-01', '2026-11-06'), true, '11월 1일 – 6일'],
    ['직접 날짜 하루', custom('2026-10-05', '2026-10-05'), false, '10월 5일'],
  ] as const)("AC-1801.4: %s — 머리 줄 기간 글 '%s'", (_, pick, done, head) => {
    expect(flow(pick, done).head).toBe(head)
  })

  it('AC-1801.4: 고른 기간 — current는 pickRange(…).current, period null, bucket·picker·range는 고른 것 그대로', () => {
    const pick = month('2026-10', 'week')
    const range = pickRange(TODAY, pick, false)
    const f = flow(pick)
    expect(f.period).toBeNull()
    expect(f.current).toEqual(range.current)
    expect(f.range).toEqual(range)
    expect(f.bucket).toBe('week')
    expect(f.picker).toEqual(pick)
    expect(flow(year('2026')).bucket).toBe('month')
    expect(flow(custom('2026-01-01', '2026-06-30', 'month')).bucket).toBe('month')
    expect(flow(month('2026-11'), true).current).toEqual({ ...pickRange(TODAY, month('2026-11'), true).current })
    expect(flow(month('2026-11'), true).current.to).toBe('2026-11-06')
  })
})

describe('flowTrend · flowTicks · flowDense — 환자 수 추이 칸 (AC-1802.1·AC-1802.2)', () => {
  // 10월: 첫 주(10-01~04) 두 날, 둘째 주 덜 끝난 날 하나, 셋째 주 하루, 넷째 주 없음, 다섯째 주(10-26~31) 두 날. 기간 밖 9-30·11-02
  const OCT_DAYS = [
    day('2026-09-30', { newPatients: 50, returning: 50 }),
    day('2026-10-01', { newPatients: 1, returning: 2 }),
    day('2026-10-02', { newPatients: 3, returning: 4 }),
    day('2026-10-08', { newPatients: 2, returning: 5 }),
    day('2026-10-09', { partial: true, newPatients: 1, returning: 1 }),
    day('2026-10-13', { newPatients: 4, returning: 6 }),
    day('2026-10-27', { newPatients: 2, returning: 2 }),
    day('2026-10-31', { newPatients: 5, returning: 5 }),
    day('2026-11-02', { newPatients: 50, returning: 50 }),
  ]
  const RECENT = [day('2026-08-10'), day('2026-09-01'), day('2026-10-30'), day('2026-11-02', { partial: true }), day('2026-11-05'), day(TODAY)]

  it.each(PERIODS)('AC-1802.5: 최근 %i일 — 칸·눈금·dense가 지금 대시보드(trendBuckets·tickLabels·7일만 합계)와 같다', (period) => {
    const f = flow(period)
    const buckets = flowTrend(RECENT, f)
    expect(buckets).toEqual(trendBuckets(RECENT, periodRange(TODAY, period), period))
    expect(flowTicks(f)).toEqual(tickLabels(periodRange(TODAY, period), period))
    expect(flowDense(f, buckets!)).toBe(period !== 7)
  })

  it('AC-1802.1: 2026년 10월 일별 — 자료 있는 날마다 한 칸(줄 없는 날은 칸이 없다), 날짜 글자는 첫날부터 7일마다, 덜 끝난 줄은 partial', () => {
    const buckets = flowTrend(OCT_DAYS, flow(month('2026-10')))!
    expect(buckets.map((b) => b.key)).toEqual(['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-09', '2026-10-13', '2026-10-27', '2026-10-31'])
    expect(buckets.map((b) => b.label)).toEqual(['10.1', '', '10.8', '', '', '', ''])
    expect(buckets.map((b) => b.state)).toEqual(['complete', 'complete', 'complete', 'partial', 'complete', 'complete', 'complete'])
    expect(buckets.every((b) => b.blank === undefined)).toBe(true)
    expect(buckets[0]).toMatchObject({ rangeLabel: '10월 1일', values: [1, 2] })
  })

  it('AC-1802.1: 일별 눈금 — 기간이 31일 이하면 첫날부터 7일마다, 넘으면 21일마다(막대 아래 글자도 같은 날)', () => {
    expect(labels(flowTicks(flow(month('2026-10'))))).toEqual(['10.1', '10.8', '10.15', '10.22', '10.29'])
    expect(labels(flowTicks(flow(custom('2026-09-01', '2026-10-01'))))).toEqual(['9.1', '9.8', '9.15', '9.22', '9.29'])
    expect(labels(flowTicks(flow(custom('2026-09-01', '2026-10-02'))))).toEqual(['9.1', '9.22'])
    const long = flow(custom('2026-08-01', '2026-10-31'))
    expect(labels(flowTicks(long))).toEqual(['8.1', '8.22', '9.12', '10.3', '10.24'])
    expect(flowTrend([day('2026-08-22'), day('2026-08-23')], long)!.map((b) => b.label)).toEqual(['8.22', ''])
  })

  it('AC-1802.1: 고른 기간은 칸이 7개를 넘으면 dense(막대 위 합계 없음), 7개 이하면 아니다', () => {
    const f = flow(month('2026-10'))
    const seven = flowTrend(OCT_DAYS, f)!
    expect(seven).toHaveLength(7)
    expect(flowDense(f, seven)).toBe(false)
    const eight = flowTrend([...OCT_DAYS, day('2026-10-20')], f)!
    expect(eight).toHaveLength(8)
    expect(flowDense(f, eight)).toBe(true)
  })

  it('AC-1802.1·AC-1802.2: 기간 안 줄이 없으면 null이고, 빈 틀 눈금은 일별일 때만 있다', () => {
    const outside = [day('2026-09-30'), day('2026-11-01')]
    for (const pick of [month('2026-10'), month('2026-10', 'week'), year('2025'), custom('2026-10-01', '2026-10-31', 'month')]) {
      expect(flowTrend(outside, flow(pick))).toBeNull()
    }
    expect(flowTicks(flow(month('2026-10'))).length).toBeGreaterThan(0)
    expect(flowTicks(flow(month('2026-10', 'week')))).toEqual([])
    expect(flowTicks(flow(year('2026')))).toEqual([])
    expect(flowTicks(flow(custom('2026-01-01', '2026-06-30', 'month')))).toEqual([])
  })

  it("AC-1802.2: 2026년 10월 주별 — 월–일 주를 기간으로 자른 다섯 칸, 잘린 첫·끝 주와 덜 끝난 줄이 든 주는 '일부 기간', 값은 칸 안 줄의 합, 줄 없는 주는 '–'", () => {
    const buckets = flowTrend(OCT_DAYS, flow(month('2026-10', 'week')))!
    expect(buckets.map((b) => b.key)).toEqual(['2026-10-01', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    expect(buckets.map((b) => b.rangeLabel)).toEqual(['10월 1일 – 4일', '10월 5일 – 11일', '10월 12일 – 18일', '10월 19일 – 25일', '10월 26일 – 31일'])
    expect(buckets.map((b) => b.blank)).toEqual([undefined, undefined, undefined, 'no-data', undefined])
    expect(buckets.map((b) => b.state)[0]).toBe('partial') // 기간에 잘림
    expect(buckets.map((b) => b.state)[1]).toBe('partial') // 덜 끝난 줄
    expect(buckets.map((b) => b.state)[2]).toBe('complete')
    expect(buckets.map((b) => b.state)[4]).toBe('partial') // 기간에 잘림
    expect(buckets.map((b) => b.values)).toEqual([
      [4, 6],
      [3, 6],
      [4, 6],
      [0, 0],
      [7, 7],
    ])
  })

  it("AC-1802.2: 해 2026년 — 1월~12월 열두 칸, 11월은 '일부 기간', 12월은 달 글자만 있는 빈 칸(future), 줄 없는 달은 '–'", () => {
    const days = [day('2026-01-15'), day('2026-03-10'), day('2026-10-05'), day('2026-11-02'), day(TODAY, { partial: true })]
    const f = flow(year('2026'))
    const buckets = flowTrend(days, f)!
    expect(buckets.map((b) => b.label)).toEqual(['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'])
    expect(buckets[10]!.state).toBe('partial')
    expect(buckets[10]!.blank).toBeUndefined()
    expect(buckets[11]!.blank).toBe('future')
    expect(buckets[1]!.blank).toBe('no-data')
    expect(buckets[0]).toMatchObject({ state: 'complete', values: [2, 8] })
    expect(flowDense(f, buckets)).toBe(true)
  })

  it.each([
    ['일별', month('2026-10')],
    ['주별', month('2026-10', 'week')],
    ['해', year('2026')],
    ['직접 날짜 월별', custom('2026-02-10', '2026-10-20', 'month')],
  ] as const)('AC-1802.2: 고른 기간(%s) 칸은 통계 patientTrend에 고른 기간 하나를 덮은 기간으로 넘긴 것과 같다(대시보드는 덮은 기간을 읽지 않는다)', (_, pick) => {
    const f = flow(pick)
    expect(flowTrend(OCT_DAYS, f)).toEqual(patientTrend({ days: OCT_DAYS, covered: [{ from: f.current.from, to: f.current.to }], range: f.range! }))
  })
})

// 기간별 흐름 막대의 90일초진 (first90 REQ-4404 AC-4404.3, design.md 5-9). 모든 칸이 앎이면 [신환, 90일초진, 재진] 세 갈래, 아니면 지금 두 갈래([신환, 재진(90일초진 포함)])다
describe('flowTrend · flowSeries — 90일초진 갈래 (AC-4404.3)', () => {
  // 칸 모양(키·글자·상태·빈 칸)만(값은 비운다). 값은 시험마다 따로 본다
  const shape = (buckets: BarBucket[] | null) => buckets?.map((bucket) => ({ ...bucket, values: [] })) ?? null
  const valuesOf = (buckets: BarBucket[] | null) => buckets?.map((b) => b.values) ?? null
  // 10월: 모두 새 도우미 날(기간 밖 9-30·11-02 포함). 주: 10-01~04 · 10-05~11(덜 끝난 날) · 10-12~18 · 10-19~25(줄 없음) · 10-26~31
  const OCT_KNOWN = [
    day('2026-09-30', { newPatients: 50, first90: 9, returning: 50 }),
    day('2026-10-01', { newPatients: 1, first90: 1, returning: 2 }),
    day('2026-10-02', { newPatients: 3, first90: 2, returning: 4 }),
    day('2026-10-08', { newPatients: 2, first90: 0, returning: 5 }),
    day('2026-10-09', { partial: true, newPatients: 1, first90: 3, returning: 1 }),
    day('2026-10-13', { newPatients: 4, first90: 1, returning: 6 }),
    day('2026-10-27', { newPatients: 2, first90: 2, returning: 2 }),
    day('2026-10-31', { newPatients: 5, first90: 4, returning: 5 }),
    day('2026-11-02', { newPatients: 50, first90: 9, returning: 50 }),
  ]
  // 10월 13일만 옛 도우미 날(90일초진이 재진에 들어 있다)
  const OCT_MIXED = OCT_KNOWN.map((d) => (d.day === '2026-10-13' ? day('2026-10-13', { newPatients: 4, returning: 7 }) : d))
  // 최근 7일(10월 30일 – 11월 5일): 모두 새 도우미 날. 오늘 줄은 기간 밖이다
  const RECENT_KNOWN = [
    day('2026-10-30', { newPatients: 2, first90: 3, returning: 5 }),
    day('2026-11-02', { partial: true, newPatients: 1, first90: 0, returning: 4 }),
    day('2026-11-05', { newPatients: 4, first90: 1, returning: 6 }),
    day(TODAY, { first90: 9 }),
  ]

  it.each(PERIODS)('AC-4404.3: 최근 %i일 — 기간 안 모든 날에 first90이 있으면 칸 값은 [신환, 90일초진, 재진]이고 칸·글자·상태는 지금 trendBuckets 그대로다', (period) => {
    const buckets = flowTrend(RECENT_KNOWN, flow(period))
    expect(shape(buckets)).toEqual(shape(trendBuckets(RECENT_KNOWN, periodRange(TODAY, period), period)))
    expect(valuesOf(buckets)).toEqual([
      [2, 3, 5],
      [1, 0, 4],
      [4, 1, 6],
    ])
  })

  it('AC-4404.3: 최근 N일 — 하루라도 first90이 없으면 두 값이고, 새 도우미 날의 재진은 returning + 90일초진(옛 날과 같은 뜻)이다', () => {
    const mixed = [day('2026-10-30', { newPatients: 2, first90: 3, returning: 5 }), day('2026-11-05', { newPatients: 4, returning: 7 })]
    const buckets = flowTrend(mixed, flow(7))
    expect(shape(buckets)).toEqual(shape(trendBuckets(mixed, periodRange(TODAY, 7), 7)))
    expect(valuesOf(buckets)).toEqual([
      [2, 8],
      [4, 7],
    ])
  })

  it('AC-4404.3: 고른 기간 일별(2026년 10월) — 모두 앎이면 날마다 [신환, 90일초진, 재진], 칸 모양은 patientTrend 그대로다', () => {
    const f = flow(month('2026-10'))
    const buckets = flowTrend(OCT_KNOWN, f)
    expect(shape(buckets)).toEqual(shape(patientTrend({ days: OCT_KNOWN, covered: [{ from: f.current.from, to: f.current.to }], range: f.range! })))
    expect(valuesOf(buckets)).toEqual([
      [1, 1, 2],
      [3, 2, 4],
      [2, 0, 5],
      [1, 3, 1],
      [4, 1, 6],
      [2, 2, 2],
      [5, 4, 5],
    ])
  })

  it("AC-4404.3: 고른 기간 주별 — 모두 앎이면 칸마다 [신환 합, 90일초진 합, 재진 합], 줄 없는 주는 [0, 0, 0](빈 칸), 칸 모양은 patientTrend 그대로다", () => {
    const f = flow(month('2026-10', 'week'))
    const buckets = flowTrend(OCT_KNOWN, f)
    expect(shape(buckets)).toEqual(shape(patientTrend({ days: OCT_KNOWN, covered: [{ from: f.current.from, to: f.current.to }], range: f.range! })))
    expect(buckets!.map((b) => b.blank)).toEqual([undefined, undefined, undefined, 'no-data', undefined])
    expect(valuesOf(buckets)).toEqual([
      [4, 3, 6],
      [3, 3, 6],
      [4, 1, 6],
      [0, 0, 0],
      [7, 6, 7],
    ])
  })

  it('AC-4404.3: 고른 기간 해 — 모두 앎이면 달마다 세 값, 앞으로 올 달은 빈 칸이다', () => {
    const days = [day('2026-01-15', { first90: 1 }), day('2026-03-10', { first90: 2 }), day('2026-11-02', { first90: 3 }), day(TODAY, { partial: true, first90: 4 })]
    const buckets = flowTrend(days, flow(year('2026')))!
    expect(buckets[0]).toMatchObject({ state: 'complete', values: [2, 1, 8] })
    expect(buckets[1]).toMatchObject({ blank: 'no-data', values: [0, 0, 0] })
    expect(buckets[10]).toMatchObject({ state: 'partial', values: [2, 3, 8] }) // 오늘(덜 끝남)은 끝난 날 밖이다
    expect(buckets[11]!.blank).toBe('future')
  })

  it('AC-4404.3: 고른 기간 — 하루라도 first90이 없으면 두 값이고, 새 도우미 날의 재진은 returning + 90일초진이다(재진이 줄어 보이지 않는다)', () => {
    const f = flow(month('2026-10', 'week'))
    expect(valuesOf(flowTrend(OCT_MIXED, f))).toEqual([
      [4, 9],
      [3, 9],
      [4, 7],
      [0, 0],
      [7, 13],
    ])
  })

  it('AC-4404.3: flowSeries — 기간 안 모든 날이 앎이면 통계 일별 내원과 같은 세 갈래(trendSeries(true): 신환 accent · 90일초진 f90 · 재진 ret)다', () => {
    expect(flowSeries(RECENT_KNOWN, flow(7))).toEqual(trendSeries(true))
    expect(flowSeries(OCT_KNOWN, flow(month('2026-10', 'week')))).toEqual([
      { name: '신환', tone: 'accent' },
      { name: '90일초진', tone: 'f90' },
      { name: '재진', tone: 'ret' },
    ])
  })

  it('AC-4404.3: flowSeries — 하나라도 없거나 기간 안 줄이 없으면 두 갈래이고 둘째 이름은 통계 일별 내원과 같은 "재진(90일초진 포함)"이다(신환 accent · 재진(90일초진 포함) chart-3, 색은 그대로)', () => {
    const now = [
      { name: '신환', tone: 'accent' },
      { name: '재진(90일초진 포함)', tone: 'chart-3' },
    ]
    expect(flowSeries(OCT_MIXED, flow(month('2026-10', 'week')))).toEqual(now)
    expect(flowSeries([day('2026-11-05')], flow(7))).toEqual(now)
    expect(flowSeries([], flow(30))).toEqual(now)
    expect(flowSeries([day(TODAY, { first90: 1 })], flow(7))).toEqual(now)
  })
})

describe('rankLine — 처방 상위 날짜 줄 (AC-1803.1·AC-1803.2)', () => {
  it.each([
    [30, 26, '10월 7일 – 11월 5일 (어제까지) · 자료 있는 26일'],
    [7, 5, '10월 30일 – 11월 5일 (어제까지) · 자료 있는 5일'],
    [90, 60, '8월 8일 – 11월 5일 (어제까지) · 자료 있는 60일'],
  ] as const)("AC-1803.1: 최근 %i일 · 자료 있는 날 %i일 — '%s'", (period, count, text) => {
    expect(rankLine(flow(period), count)).toBe(text)
    // 빠른 단추는 늘 어제에서 끝나 오늘이 끝났어도 ' (어제까지)'다
    expect(rankLine(flow(period, true), count)).toBe(text)
  })

  it("AC-1803.2: 2026년 10월은 '10월 1일 – 31일 · 자료 있는 26일', 끝나지 않은 11월은 '11월 1일 – 5일 (어제까지) · 자료 있는 4일'이고 앞의 기간 글은 머리 줄 기간 글과 같다", () => {
    expect(rankLine(flow(month('2026-10')), 26)).toBe('10월 1일 – 31일 · 자료 있는 26일')
    expect(rankLine(flow(month('2026-11')), 4)).toBe('11월 1일 – 5일 (어제까지) · 자료 있는 4일')
    for (const pick of [month('2026-10'), month('2026-11'), year('2026'), custom('2025-12-20', '2026-01-10')]) {
      expect(rankLine(flow(pick), 3)).toBe(`${flow(pick).head} · 자료 있는 3일`)
      expect(flow(pick).span).toBe(flow(pick).head)
    }
  })

  it("AC-1803.3: 날 수가 없으면(0·null — 줄 없음, 읽는 중, 읽기 실패) 날짜 줄은 '{기간 글}'뿐이다", () => {
    expect(rankLine(flow(month('2026-10')), 0)).toBe('10월 1일 – 31일')
    expect(rankLine(flow(month('2026-10')), null)).toBe('10월 1일 – 31일')
    expect(rankLine(flow(30), null)).toBe('10월 7일 – 11월 5일 (어제까지)')
  })

  it('AC-1803.2: 날 수는 천 단위 쉼표 글자다', () => {
    expect(rankLine(flow(custom('2021-01-01', '2025-12-31', 'month')), 1500)).toBe('2021년 1월 1일 – 2025년 12월 31일 · 자료 있는 1,500일')
  })
})

// 그래프 설명 줄·표 캡션의 기간 기준 (dashboard-ux REQ-2706 AC-2706.3)
describe('flowBasis — 기간 기준 글 (AC-2706.3)', () => {
  it.each(PERIODS)("AC-2706.3: 빠른 단추 %i일은 '최근 N일'이다", (period) => {
    expect(flowBasis(flow(period))).toBe(`최근 ${period}일`)
  })

  it('AC-2706.3: 고른 기간은 그 기간 글(머리 줄 기간 글 그대로)이다', () => {
    expect(flowBasis(flow(month('2026-10')))).toBe('10월 1일 – 31일')
    expect(flowBasis(flow(month('2026-11')))).toBe('11월 1일 – 5일 (어제까지)')
    expect(flowBasis(flow(custom('2025-12-20', '2026-01-10')))).toBe('2025년 12월 20일 – 2026년 1월 10일')
    for (const pick of [month('2026-10', 'week'), year('2026')]) expect(flowBasis(flow(pick))).toBe(flow(pick).head)
  })
})
