import { describe, expect, it } from 'vitest'
import { COMPARE_KINDS, compareRanges, loadHospital, type CompareKind, type CompareRead } from './load'

// 의원 비교 불러오기(spec admin-view REQ-8014, design.md '의원 비교 — 계산' load.ts·'비교 읽기' 표).
// 의원 하나 = admin_rows 열여덟 종류. read는 readAdminRows 모양의 가짜이고 줄은 지어낸 jsonb다

const H = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'

// design.md '비교 읽기' 표 차례
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

type Call = { kind: CompareKind; ids: readonly string[]; from: string; to: string }

function fakeRead(rows: Partial<Record<CompareKind, { hospitalId: string; row: Record<string, unknown> }[]>> = {}) {
  const calls: Call[] = []
  const read: CompareRead = async (kind, ids, from, to) => {
    calls.push({ kind, ids, from, to })
    return rows[kind] ?? []
  }
  return { read, calls }
}

describe('AC-8014.1·AC-8014.2 불러오기: 종류 열여덟 · 기간', () => {
  it('AC-8014.1·AC-8014.2: 종류는 design.md 비교 읽기 표의 열여덟이다', () => {
    expect([...COMPARE_KINDS]).toEqual(KINDS)
  })

  it('AC-8014.1·AC-8014.2: 기간 — 날 줄·예약·수납·코드 합은 지난달 1일 ~ 고른 달 끝, 달 줄은 지난달·고른 달, 휴일 날 합계는 고른 달 끝 − 364일 ~ 끝, 목표·급여는 고른 달', () => {
    const two = { from: '2026-09-01', to: '2026-10-31' }
    const one = { from: '2026-10-01', to: '2026-10-31' }
    expect(compareRanges('2026-10')).toEqual({
      stats_days: two,
      stats_months: two,
      stats_day_totals: { from: '2025-11-01', to: '2026-10-31' },
      stats_coverage: two,
      stats_rx_groups: one,
      stats_goals: one,
      sales_days: two,
      sales_code_totals: two,
      sales_codes: two,
      sunap_settings: one,
      sunap_days: two,
      calendar_settings: two,
      calendar_allday: two,
      calendar_counts: two,
      clinic_profiles: one,
      staff_members: one,
      staff_pay: one,
      staff_settings: one,
    })
  })

  it('AC-8014.1·AC-8014.2: 해가 바뀌는 달·윤년 2월도 같은 규칙이다', () => {
    const jan = compareRanges('2026-01')
    expect(jan.stats_days).toEqual({ from: '2025-12-01', to: '2026-01-31' })
    expect(jan.staff_pay).toEqual({ from: '2026-01-01', to: '2026-01-31' })
    expect(jan.stats_day_totals).toEqual({ from: '2025-02-01', to: '2026-01-31' })
    const feb = compareRanges('2028-02')
    expect(feb.sales_days).toEqual({ from: '2028-01-01', to: '2028-02-29' })
    expect(feb.stats_day_totals).toEqual({ from: '2027-03-02', to: '2028-02-29' })
  })

  it('AC-8014.1·AC-8014.2: loadHospital은 종류마다 한 번씩 그 의원 하나만 그 기간으로 읽는다', async () => {
    const { read, calls } = fakeRead()
    await loadHospital(read, H, '2026-10')
    expect(calls.map((c) => c.kind).sort()).toEqual([...KINDS].sort())
    const ranges = compareRanges('2026-10')
    for (const call of calls) {
      expect(call.ids).toEqual([H])
      expect({ from: call.from, to: call.to }).toEqual(ranges[call.kind])
    }
  })

  it('AC-8014.1·AC-8014.2: 줄은 종류별로 jsonb 그대로 묶고 다른 의원 줄은 버리며, 줄이 없는 종류는 빈 목록이다', async () => {
    const day1 = { day: '2026-10-01', visits: 120, new_patients: 8, total: 4_000_000, rough_total: null }
    const day2 = { day: '2026-10-02', visits: 98, new_patients: 5, total: null, rough_total: 2_500_000 }
    const pay = { month: '2026-10-01', staff_id: 's-1', amounts: { base: 2_500_000 }, incentives: [], adjust: 0 }
    const { read } = fakeRead({
      sales_days: [
        { hospitalId: H, row: day1 },
        { hospitalId: OTHER, row: { day: '2026-10-01', visits: 1 } },
        { hospitalId: H, row: day2 },
      ],
      staff_pay: [{ hospitalId: H, row: pay }],
    })
    const raw = await loadHospital(read, H, '2026-10')
    expect(Object.keys(raw).sort()).toEqual([...KINDS].sort())
    expect(raw.sales_days).toEqual([day1, day2])
    expect(raw.sales_days[0]).toBe(day1) // 고치지 않고 그대로
    expect(raw.staff_pay).toEqual([pay])
    expect(raw.stats_days).toEqual([])
    expect(raw.staff_members).toEqual([])
  })

  it('AC-8014.1·AC-8014.2: 읽기 하나가 실패하면 그 오류로 실패한다', async () => {
    const boom = new Error('읽기 실패(가짜)')
    const read: CompareRead = async (kind) => {
      if (kind === 'staff_pay') throw boom
      return []
    }
    await expect(loadHospital(read, H, '2026-10')).rejects.toBe(boom)
  })
})
