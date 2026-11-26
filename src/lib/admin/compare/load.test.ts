import { describe, expect, it } from 'vitest'
import { COMPARE_KINDS, compareRanges, loadHospital, type CompareKind, type CompareRead } from './load'

// 의원 비교 불러오기(spec admin-view REQ-8014, design.md '의원 비교 — 계산' load.ts·'비교 읽기' 표).
// 의원 하나 = admin_rows 열여덟 종류 + admin_uis_rows 두 종류(spec uisarang-upload REQ-8813, design.md §10-4). read는 readAdminRows 모양의 가짜이고 줄은 지어낸 jsonb다

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
  'uis_periods',
  'clinic_emr',
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

describe('AC-8014.1·AC-8014.2 불러오기: 종류 스물 · 기간', () => {
  it('AC-8014.1·AC-8014.2·AC-8813.6: 종류는 design.md 비교 읽기 표의 열여덟 + 의사랑 둘(uis_periods·clinic_emr)이다', () => {
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
      uis_periods: one,
      clinic_emr: one,
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

// readAdminRows가 함수 없음(PGRST202·42883)에 다는 표시와 같은 모양의 가짜 오류
const missingError = () => Object.assign(new Error('함수 없음(가짜)'), { missing: true })

describe('AC-8813.7 admin_uis_rows 함수가 DB에 없을 때 — 새 두 종류만 빈 목록', () => {
  it('AC-8813.7: uis_periods·clinic_emr 읽기가 함수 없음이면 그 둘만 빈 목록이고 나머지 열여덟은 읽은 그대로 — 의원 읽기가 실패하지 않는다', async () => {
    const day = { day: '2026-10-01', visits: 120, new_patients: 8, total: 4_000_000, rough_total: null }
    const calls: CompareKind[] = []
    const read: CompareRead = async (kind) => {
      calls.push(kind)
      if (kind === 'uis_periods' || kind === 'clinic_emr') throw missingError()
      return kind === 'sales_days' ? [{ hospitalId: H, row: day }] : []
    }
    const raw = await loadHospital(read, H, '2026-10')
    expect(raw.uis_periods).toEqual([])
    expect(raw.clinic_emr).toEqual([])
    expect(raw.sales_days).toEqual([day])
    expect(Object.keys(raw).sort()).toEqual([...KINDS].sort())
    expect(calls.sort()).toEqual([...KINDS].sort()) // 저절로 다시 읽지 않는다
  })

  it('AC-8813.7: 함수가 있으면 새 두 종류도 그 의원 줄만 jsonb 그대로 묶는다', async () => {
    const emr = { emr: 'uisarang' }
    const rx = { kind: 'rx', from_day: '2026-10-01', to_day: '2026-10-31', payload: { v: 1, rows: [], total: null } }
    const { read, calls } = fakeRead({
      clinic_emr: [{ hospitalId: H, row: emr }, { hospitalId: OTHER, row: { emr: 'bit' } }],
      uis_periods: [{ hospitalId: OTHER, row: { ...rx } }, { hospitalId: H, row: rx }],
    })
    const raw = await loadHospital(read, H, '2026-10')
    expect(raw.clinic_emr).toEqual([emr])
    expect(raw.uis_periods).toEqual([rx])
    const uisCalls = calls.filter((call) => call.kind === 'uis_periods' || call.kind === 'clinic_emr')
    expect(uisCalls).toEqual(
      expect.arrayContaining([
        { kind: 'uis_periods', ids: [H], from: '2026-10-01', to: '2026-10-31' },
        { kind: 'clinic_emr', ids: [H], from: '2026-10-01', to: '2026-10-31' },
      ]),
    )
  })

  it.each(['uis_periods', 'clinic_emr'] as const)('AC-8813.7: %s의 그 밖 오류(함수 없음 아님)는 지금처럼 의원 읽기 실패다', async (failing) => {
    const boom = new Error('권한 없음(가짜)')
    const read: CompareRead = async (kind) => {
      if (kind === failing) throw boom
      return []
    }
    await expect(loadHospital(read, H, '2026-10')).rejects.toBe(boom)
  })

  it('AC-8813.7: missing이 참이 아닌 표시(거짓·글)는 함수 없음으로 보지 않는다', async () => {
    for (const missing of [false, 'true', 1]) {
      const boom = Object.assign(new Error('가짜'), { missing })
      const read: CompareRead = async (kind) => {
        if (kind === 'uis_periods') throw boom
        return []
      }
      await expect(loadHospital(read, H, '2026-10')).rejects.toBe(boom)
    }
  })

  it.each(['stats_days', 'sales_days', 'staff_settings'] as const)('AC-8813.7: 지금 열여덟 종류(%s)의 함수 없음은 받아 주지 않고 지금처럼 실패다', async (failing) => {
    const boom = missingError()
    const read: CompareRead = async (kind) => {
      if (kind === failing) throw boom
      return []
    }
    await expect(loadHospital(read, H, '2026-10')).rejects.toBe(boom)
  })
})
