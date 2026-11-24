import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatRate } from '@/components/charts/format'
import { compareStatsInput } from '@/components/admin/compare/statsInput'
import type { CompareKind, CompareRaw } from '@/lib/admin/compare/load'
import { diffDays, eachDay, weekdayOf } from '@/lib/analytics/dates'
import { rxVisitHeadline } from '@/lib/analytics/rxVisitSplit'
import { readAdminRows, type AdminRow } from '@/lib/storage/adminRows'
import type { DayPayload } from '@/types/payload'
import { SUNAP_TOTAL_KEYS, type SunapRates } from '@/types/sunap'
import { sunapPct } from './sunapView'
import { groupKey } from './treatmentView'
import { rangeOf, statsRange, type StatsInput, type StatsRange } from './view'
import { readViewMonths, sumSpan, viewSums, wholeMonths } from './viewSums'

// 보는 중 통계 탭 비트 전용 칸의 저장 합계 (admin-view REQ-8025 AC-8025.1·AC-8025.2, tasks.md TASK-21).
// 날 줄 sunap(Block 전환)·달 줄 dropoff(몇 번까지 받나)·달 줄 rx(처방별 신환·재진)만 저장 합계로 그린다.
// 줄은 admin_rows jsonb 모양(supabase/migrations/20261124000000_admin_view.sql)을 지어낸 것이고 숫자·이름·묶음은 모두 가짜다. 진짜 Supabase에 붙지 않는다

vi.mock('@/lib/storage/adminRows', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/storage/adminRows')>()), readAdminRows: vi.fn() }))

const TODAY = '2026-11-13'
const LAST = '2026-11-12' // 마지막 끝난 날(어제)
const H = '00000000-0000-4000-8000-0000000000d2'
const OTHER = '00000000-0000-4000-8000-0000000000e9'
const COVERED = [{ from: '2026-09-01', to: '2026-11-12' }]

const R30 = statsRange(TODAY, '30d')
const R12 = statsRange(TODAY, '12m')
const OCT = rangeOf(TODAY, { kind: 'month', unit: 'day', month: '2026-10' }, false)
const NOV = rangeOf(TODAY, { kind: 'month', unit: 'day', month: '2026-11' }, false)
const SEP_OCT = rangeOf(TODAY, { kind: 'custom', unit: 'day', from: '2026-09-01', to: '2026-10-31' }, false)
const MID = rangeOf(TODAY, { kind: 'custom', unit: 'day', from: '2026-09-15', to: '2026-10-31' }, false)

const RATES: SunapRates = { visits: 10, first_n: 2, d90_n: 1, ret_n: 7, block_n: 3, pt_n: 6, first_block: 1, d90_block: 0, ret_block: 2 }
const RATE_KEYS = Object.keys(RATES) as (keyof SunapRates)[]

const openDay = (ymd: string) => weekdayOf(ymd) !== 7 // 일요일은 쉰다(줄 없음 = 휴진)
const OPEN_DAYS = eachDay({ from: '2026-09-01', to: LAST }).filter(openDay)

function dayRow(day: string, sunap: SunapRates | null = RATES): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day,
    partial: false,
    totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 2, within7: 1, within14: 1 },
    ...(sunap === null ? {} : { sunap: { ...sunap } }),
  }
}
const DAYS = OPEN_DAYS.map((day) => dayRow(day))
const inputOf = (range: StatsRange, days: readonly DayPayload[] = DAYS, covered = COVERED): StatsInput => ({ days, covered, range })
const inSpan = (range: StatsRange) => DAYS.filter((row) => row.day >= range.current.from && row.day <= (range.current.to < LAST ? range.current.to : LAST))
const sumOf = (rows: readonly DayPayload[]) => Object.fromEntries(RATE_KEYS.map((key) => [key, rows.reduce((total, row) => total + row.sunap![key], 0)])) as SunapRates

// 처방 묶음 둘. 몇 번까지 받나 줄의 저장된 평균·가장 많이 빠지는 곳은 일부러 수와 맞지 않는 값(9.9·5)이다 — 쓰면 시험이 진다
const KEY_A = groupKey(['MM001'])
const KEY_B = groupKey(['MX100'])
const line = (group: string, atLeast: [number, number, number, number, number, number], ten: number, average = 9.9, drop = 5) => ({
  group,
  n: atLeast[0],
  atLeast,
  ten,
  once: atLeast[0] - atLeast[1],
  average,
  drop,
})
const RX = [
  { code: 'MM001', name: '가짜물리', type: '3', patients: 30, newPatients: 6, returning: 24, followup: [10, 10, 5, 5] },
  { code: 'MX100', name: '가짜도수', type: '3', patients: 50, newPatients: 4, returning: 46, followup: [20, 10, 10, 10] },
]
const LINES: Record<string, ReturnType<typeof line>[]> = {
  '2026-09': [line(KEY_A, [10, 6, 4, 2, 1, 0], 0), line(KEY_B, [4, 4, 3, 1, 1, 1], 1, 1.1, 1)],
  '2026-10': [line(KEY_A, [8, 5, 5, 1, 0, 0], 0)],
}
const monthRow = (month: string, over: Record<string, unknown> = {}): AdminRow => ({
  hospitalId: H,
  row: { month, partial: false, rx: RX, groups: [], dropoff: { asOf: LAST, lines: LINES[month] ?? [] }, sections: null, ...over },
})
const MONTHS = [monthRow('2026-09'), monthRow('2026-10')]

beforeEach(() => {
  vi.mocked(readAdminRows).mockReset()
})

describe('보는 중 통계 비트 전용 칸 — 저장 합계 셈 (AC-8025.1)', () => {
  it('AC-8025.1: 셀 기간 = 고른 기간 첫날 ~ 끝과 마지막 끝난 날 가운데 이른 날, 온전한 달은 달 1일 ~ 말일로 이어진 달들뿐이다', () => {
    expect(sumSpan(R30, LAST)).toEqual({ from: R30.current.from, to: R30.current.to })
    expect(sumSpan(R12, LAST)).toEqual({ from: R12.current.from, to: LAST }) // 12개월의 끝(이번 달 말일)은 어제에서 자른다
    expect(wholeMonths(sumSpan(OCT, LAST))).toEqual(['2026-10'])
    expect(wholeMonths(sumSpan(SEP_OCT, LAST))).toEqual(['2026-09', '2026-10'])
    expect(wholeMonths(sumSpan(R30, LAST))).toBeNull()
    expect(wholeMonths(sumSpan(R12, LAST))).toBeNull() // 이번 달은 아직 끝나지 않았다
    expect(wholeMonths(sumSpan(NOV, LAST))).toBeNull()
    expect(wholeMonths(sumSpan(MID, LAST))).toBeNull()
  })

  it('AC-8025.1: Block 전환 = 고른 기간 날 줄 sunap 아홉 칸을 날마다 더한 것(최근 30일·10월)', () => {
    expect(viewSums(inputOf(R30), LAST, []).sunap).toEqual(sumOf(inSpan(R30)))
    expect(viewSums(inputOf(OCT), LAST, MONTHS).sunap).toEqual(sumOf(inSpan(OCT)))
    // 10월 = 문 연 날 27일 × 하루 숫자
    expect(viewSums(inputOf(OCT), LAST, MONTHS).sunap).toEqual(Object.fromEntries(RATE_KEYS.map((key) => [key, RATES[key] * 27])))
    // 비교·작년 기간의 날 줄은 더하지 않는다
    expect(viewSums(inputOf(OCT, [...DAYS, dayRow('2025-10-02')]), LAST, MONTHS).sunap).toEqual(sumOf(inSpan(OCT)))
  })

  it('AC-8025.1: 몇 번까지 받나 = 고른 달 dropoff 줄을 묶음마다 더하고(대상·k회 이상·10회 이상), 1회만·가장 많이 빠지는 곳은 더한 수에서 다시 센다. 저장된 평균·빠지는 곳은 쓰지 않는다', () => {
    const sums = viewSums(inputOf(SEP_OCT), LAST, MONTHS)
    expect(sums.dropoff).toEqual([
      // A: 9월 + 10월 = [18, 11, 9, 3, 1, 0] → 빠짐 7·2·6·2·1 → 1회 → 2회
      { group: KEY_A, n: 18, atLeast: [18, 11, 9, 3, 1, 0], ten: 0, once: 7, average: null, drop: 1 },
      // B: 9월뿐 [4, 4, 3, 1, 1, 1] → 빠짐 0·1·2·0·0 → 3회 → 4회(저장된 1이 아니다)
      { group: KEY_B, n: 4, atLeast: [4, 4, 3, 1, 1, 1], ten: 1, once: 0, average: null, drop: 3 },
    ])
    expect(viewSums(inputOf(OCT), LAST, MONTHS).dropoff).toEqual([{ group: KEY_A, n: 8, atLeast: [8, 5, 5, 1, 0, 0], ten: 0, once: 3, average: null, drop: 3 }])
  })

  it('AC-8025.1: 처방별 신환·재진 = 고른 달 하나의 달 줄 rx(처방마다 서로 다른 환자) — 합계 큰 차례, 머리 글은 그 달 날 줄 합계', () => {
    const split = viewSums(inputOf(OCT), LAST, MONTHS).split
    expect(split?.kind).toBe('split')
    if (split?.kind !== 'split') return
    expect(split.split.lines).toEqual([
      { code: 'MX100', label: '가짜도수', newPatients: 4, returning: 46, total: 50 },
      { code: 'MM001', label: '가짜물리', newPatients: 6, returning: 24, total: 30 },
    ])
    expect(split.split).toMatchObject({ from: '2026-10-01', to: '2026-10-31', visits: 270, patients: 270, newPatients: 54, returning: 216, invalidCodes: 0 })
    expect(split.headline).toBe('2026-10-01 ~ 2026-10-31 (31일) · 외래 환자 270명 (신환 54명 · 재진 216명) · 내원 270건')
    expect(split.headline).toBe(rxVisitHeadline(split.split))
  })

  it('AC-8025.1: 의원 비교(TASK-13 compareStatsInput)와 같은 셈 — 같은 저장 줄로 10월 Block 전환 비율·몇 번까지 받나 1번·2번·3번 이상이 같다', () => {
    const kinds: CompareKind[] = ['stats_days', 'stats_months', 'stats_day_totals', 'stats_coverage', 'stats_rx_groups', 'stats_goals', 'sales_days', 'sales_code_totals', 'sales_codes', 'sunap_settings', 'sunap_days', 'calendar_settings', 'calendar_allday', 'calendar_counts', 'clinic_profiles', 'staff_members', 'staff_pay', 'staff_settings']
    const raw = Object.fromEntries(kinds.map((kind) => [kind, []])) as unknown as CompareRaw
    raw.stats_days = DAYS.map((row) => ({ day: row.day, partial: false, source: 'bit', payload: row, updated_at: `${row.day}T12:00:00Z` }))
    raw.stats_months = [monthRow('2026-10').row]
    raw.stats_coverage = [{ from_day: '2026-09-01', to_day: LAST }]
    raw.stats_rx_groups = [{ id: '00000000-0000-4000-8000-0000000000a1', name: '가짜 묶음', codes: ['MM001'], out_codes: [], cond: [], sort_order: 0 }]
    const zero = Object.fromEntries(SUNAP_TOTAL_KEYS.map((key) => [key, 0]))
    raw.sunap_days = [{ work_date: '2026-10-05', closed_at: '2026-10-05T10:00:00Z', late: false, ...zero, first_n: 4, rsv_first: 3, d90_n: 2, rsv_d90: 1 }]
    const cells = compareStatsInput(raw, '2026-10')
    const sums = viewSums(inputOf(OCT), LAST, MONTHS)
    expect(cells.sunap?.[2]).toEqual({ label: 'Block 전환', value: sunapPct(sums.sunap!.first_block, sums.sunap!.first_n).replace(/%$/, ''), unit: '%' })
    const ours = sums.dropoff![0]!
    expect(cells.patients.dropoff?.map((bar) => bar.text)).toEqual([0, 1, 2].map((i) => `${formatRate(ours.atLeast[i]! / ours.n)}%`))
  })

  it("AC-8025.1: 달 줄은 readAdminRows('stats_months', [보는 의원], 달 1일, 말일)로 12달씩 나눠 읽고(한 번 400일 아래), 다른 의원 줄은 버린다", async () => {
    vi.mocked(readAdminRows).mockImplementation(async (_kind, _ids, from) => [
      { hospitalId: H, row: { month: from.slice(0, 7) } },
      { hospitalId: OTHER, row: { month: from.slice(0, 7) } },
    ])
    const months = wholeMonths({ from: '2021-11-01', to: '2026-10-31' })!
    expect(months).toHaveLength(60)
    const rows = await readViewMonths(H, months)
    expect(vi.mocked(readAdminRows).mock.calls).toEqual([
      ['stats_months', [H], '2021-11-01', '2022-10-31'],
      ['stats_months', [H], '2022-11-01', '2023-10-31'],
      ['stats_months', [H], '2023-11-01', '2024-10-31'],
      ['stats_months', [H], '2024-11-01', '2025-10-31'],
      ['stats_months', [H], '2025-11-01', '2026-10-31'],
    ])
    for (const [, , from, to] of vi.mocked(readAdminRows).mock.calls) expect(diffDays(from, to)).toBeLessThan(400)
    expect(rows.map((row) => row.hospitalId)).toEqual(Array(5).fill(H))
    await readViewMonths(H, ['2026-10'])
    expect(vi.mocked(readAdminRows).mock.calls.at(-1)).toEqual(['stats_months', [H], '2026-10-01', '2026-10-31'])
  })
})

describe('보는 중 통계 비트 전용 칸 — 합계가 없으면 그 카드만 안내 글 (AC-8025.2)', () => {
  it('AC-8025.2: 고른 기간 날 줄 하나라도 sunap이 없거나 고른 기간이 다 덮이지 않았으면 Block 전환은 null(일부 날만으로 세지 않음)', () => {
    const missing = DAYS.map((row) => (row.day === '2026-10-20' ? dayRow(row.day, null) : row))
    expect(viewSums(inputOf(R30, missing), LAST, []).sunap).toBeNull()
    expect(viewSums(inputOf(OCT, missing), LAST, MONTHS).sunap).toBeNull()
    // 그 날이 고른 기간 밖이면 상관없다
    expect(viewSums(inputOf(R30, DAYS.map((row) => (row.day === '2026-10-02' ? dayRow(row.day, null) : row))), LAST, []).sunap).not.toBeNull()
    expect(viewSums(inputOf(R30, DAYS, [{ from: '2026-10-20', to: LAST }]), LAST, []).sunap).toBeNull()
    expect(viewSums(inputOf(OCT, DAYS, [{ from: '2026-09-01', to: '2026-10-30' }]), LAST, MONTHS).sunap).toBeNull()
    expect(viewSums(inputOf(OCT, DAYS, []), LAST, MONTHS).sunap).toBeNull()
  })

  it('AC-8025.2: 고른 달 가운데 달 줄이 없거나 덜 된 달(partial)이면 몇 번까지 받나·처방별 신환·재진 모두 null', () => {
    for (const rows of [[MONTHS[1]!], [monthRow('2026-09', { partial: true }), MONTHS[1]!], [MONTHS[0]!, { hospitalId: H, row: { month: '2026-10', partial: false, rx: '틀린 모양' } }]]) {
      const sums = viewSums(inputOf(SEP_OCT), LAST, rows)
      expect(sums.dropoff).toBeNull()
      expect(sums.split).toBeNull()
    }
    const partial = viewSums(inputOf(OCT), LAST, [monthRow('2026-10', { partial: true })])
    expect(partial.dropoff).toBeNull()
    expect(partial.split).toBeNull()
  })

  it('AC-8025.2: 고른 달 하나라도 dropoff가 없으면(합계 저장 전 달) 몇 번까지 받나만 null이다', () => {
    const sums = viewSums(inputOf(SEP_OCT), LAST, [monthRow('2026-09', { dropoff: null }), MONTHS[1]!])
    expect(sums.dropoff).toBeNull()
    const oct = viewSums(inputOf(OCT), LAST, [monthRow('2026-10', { dropoff: null })])
    expect(oct.dropoff).toBeNull()
    expect(oct.split?.kind).toBe('split')
    // 대상이 없는 달(빈 목록)은 0으로 센다
    expect(viewSums(inputOf(OCT), LAST, [monthRow('2026-10', { dropoff: { asOf: LAST, lines: [] } })]).dropoff).toEqual([])
  })

  it('AC-8025.2: 고른 기간이 온전한 달이 아니면(최근 30일·최근 12개월·이번 달·달 중간에서 시작) 달 합계 카드는 null이다', () => {
    for (const range of [R30, R12, NOV, MID]) {
      const sums = viewSums(inputOf(range), LAST, MONTHS)
      expect(sums.dropoff).toBeNull()
      expect(sums.split).toBeNull()
    }
  })

  it('AC-8025.2: 처방별 신환·재진은 여러 달이면 null이다(서로 다른 환자 수는 달마다 더할 수 없다)', () => {
    const sums = viewSums(inputOf(SEP_OCT), LAST, MONTHS)
    expect(sums.split).toBeNull()
    expect(sums.dropoff).not.toBeNull()
  })

  it('AC-8025.2: 달 줄을 읽지 못하면(null) 달 합계 카드는 null이고 Block 전환은 날 줄로 그대로 센다', () => {
    const sums = viewSums(inputOf(OCT), LAST, null)
    expect(sums.dropoff).toBeNull()
    expect(sums.split).toBeNull()
    expect(sums.sunap).toEqual(sumOf(inSpan(OCT)))
  })

  it('AC-8025.2: 고른 기간이 비면(첫날이 마지막 끝난 날 뒤) 모든 칸이 null이다', () => {
    const today = rangeOf(TODAY, { kind: 'custom', unit: 'day', from: TODAY, to: TODAY }, false)
    expect(sumSpan(today, LAST)).toBeNull()
    expect(viewSums(inputOf(today), LAST, MONTHS)).toEqual({ sunap: null, dropoff: null, split: null })
  })
})
