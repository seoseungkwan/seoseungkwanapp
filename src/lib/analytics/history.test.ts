import { describe, expect, it } from 'vitest'
import type { Delta, TotalsDelta } from '@/types/analysis'
import type { MonthPayload } from '@/types/payload'
import { buildHistory } from './history'

const UNAVAILABLE: Delta = { kind: 'unavailable' }
const ALL_UNAVAILABLE: TotalsDelta = { patients: UNAVAILABLE, newPatients: UNAVAILABLE, returning: UNAVAILABLE }

// 저장된 달 하나. 재진 = 환자 − 신환 − 알 수 없음
function saved(month: string, patients: number, newPatients: number, { partial = false, unknown = 0 } = {}): MonthPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    month,
    partial,
    totals: { patients, newPatients, returning: patients - newPatients - unknown, unknown },
    rx: [
      { code: 'D1001', name: '가짜정 10mg', type: '약품', patients, newPatients, returning: patients - newPatients - unknown, followup: [patients, 0, 0, 0] },
    ],
    groups: [],
    revisit: { cohort: newPatients, within7: null, within14: null },
    regions: [],
  }
}

const change = (diff: number, pct: number | null): Delta => ({ kind: 'change', diff, pct })

describe('AC-009.1 buildHistory — 지난달 대비', () => {
  it('AC-5.1 9월·8월 완전 → 기준 9월, 9월 vs 8월 증감(compareNumbers 그대로)', () => {
    const view = buildHistory([saved('2026-08', 1000, 200), saved('2026-09', 1100, 220)])
    expect(view.base).toEqual({ month: '2026-09', totals: { patients: 1100, newPatients: 220, returning: 880, unknown: 0 } })
    expect(view.lastMonth).toEqual({ month: '2026-08', totals: { patients: 1000, newPatients: 200, returning: 800, unknown: 0 } })
    expect(view.vsLastMonth).toEqual({ patients: change(100, 10), newPatients: change(20, 10), returning: change(80, 10) })
    // 작년 9월은 저장돼 있지 않다
    expect(view.lastYear).toBeNull()
    expect(view.vsLastYear).toEqual(ALL_UNAVAILABLE)
  })

  it('AC-5.1 줄어듦·같음·이전 0(신규)도 compareNumbers 그대로', () => {
    const view = buildHistory([saved('2026-08', 50, 0, { unknown: 10 }), saved('2026-09', 40, 5, { unknown: 0 })])
    expect(view.vsLastMonth).toEqual({ patients: change(-10, -20), newPatients: { kind: 'new' }, returning: change(-5, -12.5) })
    const same = buildHistory([saved('2026-08', 30, 0), saved('2026-09', 30, 0)])
    expect(same.vsLastMonth).toEqual({ patients: change(0, 0), newPatients: change(0, null), returning: change(0, 0) })
  })

  it('AC-5.1 해를 넘는 지난달: 2026-01 vs 2025-12', () => {
    const view = buildHistory([saved('2025-12', 80, 8), saved('2026-01', 100, 10)])
    expect(view.base?.month).toBe('2026-01')
    expect(view.lastMonth?.month).toBe('2025-12')
    expect(view.vsLastMonth.patients).toEqual(change(20, 25))
  })

  it('AC-5.3 8월이 일부 → 지난달 대비 unavailable(일부 달의 숫자도 내지 않는다)', () => {
    const view = buildHistory([saved('2026-08', 600, 100, { partial: true }), saved('2026-09', 1100, 220)])
    expect(view.base?.month).toBe('2026-09')
    expect(view.lastMonth).toBeNull()
    expect(view.vsLastMonth).toEqual(ALL_UNAVAILABLE)
  })

  it('AC-5.3 지난달이 저장돼 있지 않아도 unavailable(사이를 건너뛰어 그 전달과 비교하지 않는다)', () => {
    const view = buildHistory([saved('2026-07', 900, 150), saved('2026-09', 1100, 220)])
    expect(view.lastMonth).toBeNull()
    expect(view.vsLastMonth).toEqual(ALL_UNAVAILABLE)
  })
})

describe('AC-009.1 buildHistory — 작년 같은 달 대비', () => {
  it('AC-5.2 2025-09와 2026-09 완전 → 작년 대비 증감', () => {
    const view = buildHistory([saved('2025-09', 800, 160), saved('2026-09', 1000, 180)])
    expect(view.base?.month).toBe('2026-09')
    expect(view.lastYear).toEqual({ month: '2025-09', totals: { patients: 800, newPatients: 160, returning: 640, unknown: 0 } })
    expect(view.vsLastYear).toEqual({ patients: change(200, 25), newPatients: change(20, 12.5), returning: change(180, 28.125) })
    // 8월은 저장돼 있지 않다
    expect(view.lastMonth).toBeNull()
    expect(view.vsLastMonth).toEqual(ALL_UNAVAILABLE)
  })

  it('AC-5.2 작년 같은 달이 일부면 작년 대비 unavailable', () => {
    const view = buildHistory([saved('2025-09', 300, 60, { partial: true }), saved('2026-08', 1000, 200), saved('2026-09', 1100, 220)])
    expect(view.lastYear).toBeNull()
    expect(view.vsLastYear).toEqual(ALL_UNAVAILABLE)
    expect(view.vsLastMonth.patients).toEqual(change(100, 10))
  })
})

describe('AC-009.1 buildHistory — 기준 달', () => {
  it('AC-5.4 10월(일부)만 최근이면 기준 달은 9월(완전한 가장 최근)', () => {
    const view = buildHistory([saved('2026-08', 1000, 200), saved('2026-09', 1100, 220), saved('2026-10', 700, 90, { partial: true })])
    expect(view.base).toEqual({ month: '2026-09', totals: { patients: 1100, newPatients: 220, returning: 880, unknown: 0 } })
    expect(view.lastMonth?.month).toBe('2026-08')
    expect(view.vsLastMonth.patients).toEqual(change(100, 10))
  })

  it('AC-5.4 받은 순서와 상관없다(저장소는 달 순이지만 섞여 와도 같은 답)', () => {
    const months = [saved('2026-10', 700, 90, { partial: true }), saved('2025-09', 800, 160), saved('2026-09', 1100, 220), saved('2026-08', 1000, 200)]
    expect(buildHistory(months)).toEqual(buildHistory([...months].sort((a, b) => (a.month < b.month ? -1 : 1))))
    expect(buildHistory(months).base?.month).toBe('2026-09')
  })

  it('AC-5.6 저장된 달이 없으면 base null, 증감은 모두 unavailable, 추세는 빈 배열', () => {
    expect(buildHistory([])).toEqual({
      base: null,
      lastMonth: null,
      vsLastMonth: ALL_UNAVAILABLE,
      lastYear: null,
      vsLastYear: ALL_UNAVAILABLE,
      trend: [],
    })
  })

  it('AC-5.6 일부 달만 있으면 base null, 증감은 모두 unavailable(추세는 12칸)', () => {
    const view = buildHistory([saved('2026-09', 600, 100, { partial: true }), saved('2026-10', 700, 90, { partial: true })])
    expect(view.base).toBeNull()
    expect(view.lastMonth).toBeNull()
    expect(view.lastYear).toBeNull()
    expect(view.vsLastMonth).toEqual(ALL_UNAVAILABLE)
    expect(view.vsLastYear).toEqual(ALL_UNAVAILABLE)
    expect(view.trend).toHaveLength(12)
  })
})

describe('AC-009.1 buildHistory — 최근 12달 추세', () => {
  it('AC-5.5 가장 최근 저장된 달까지 12칸, 오래된 달이 먼저 — 빈 달 null, 일부 달 partial: true', () => {
    const view = buildHistory([
      saved('2025-10', 500, 50), // 12칸 밖(2025-11부터)
      saved('2025-11', 900, 120),
      saved('2026-03', 950, 130),
      saved('2026-09', 1100, 220),
      saved('2026-10', 700, 90, { partial: true }),
    ])
    expect(view.trend.map((m) => m.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ])
    expect(view.trend[0]).toEqual({ month: '2025-11', patients: 900, newPatients: 120, partial: false })
    expect(view.trend[1]).toEqual({ month: '2025-12', patients: null, newPatients: null, partial: false })
    expect(view.trend[4]).toEqual({ month: '2026-03', patients: 950, newPatients: 130, partial: false })
    expect(view.trend[10]).toEqual({ month: '2026-09', patients: 1100, newPatients: 220, partial: false })
    expect(view.trend[11]).toEqual({ month: '2026-10', patients: 700, newPatients: 90, partial: true })
    expect(view.trend.filter((m) => m.patients === null)).toHaveLength(8)
  })

  it('AC-5.5 저장된 달이 하나여도 12칸(앞 11칸은 null)', () => {
    const view = buildHistory([saved('2026-02', 400, 40)])
    expect(view.trend).toHaveLength(12)
    expect(view.trend[0]).toEqual({ month: '2025-03', patients: null, newPatients: null, partial: false })
    expect(view.trend[11]).toEqual({ month: '2026-02', patients: 400, newPatients: 40, partial: false })
  })

  it('받은 값을 바꾸지 않고, 돌려준 합계는 사본이다', () => {
    const months = [saved('2026-08', 1000, 200), saved('2026-09', 1100, 220)]
    const before = structuredClone(months)
    const view = buildHistory(months)
    expect(months).toEqual(before)
    expect(view.base?.totals).not.toBe(months[1].totals)
    expect(view.lastMonth?.totals).not.toBe(months[0].totals)
  })
})

describe('AC-4402.4 buildHistory는 first90 열쇠를 지킨다', () => {
  // 저장된 v4 달: 재진 = 환자 − 신환 − 90일초진(지어낸 숫자)
  const withFirst90 = (month: string, patients: number, newPatients: number, first90: number): MonthPayload => {
    const base = saved(month, patients, newPatients)
    return { ...base, totals: { patients, newPatients, first90, returning: patients - newPatients - first90, unknown: 0 } }
  }

  it('AC-4402.4: 기준 달·지난달·작년 같은 달 합계에 first90이 있으면 그대로 옮기고, 증감은 지금 세 칸이다', () => {
    const view = buildHistory([withFirst90('2025-09', 900, 180, 30), withFirst90('2026-08', 1000, 200, 50), withFirst90('2026-09', 1100, 220, 80)])
    expect(view.base).toEqual({ month: '2026-09', totals: { patients: 1100, newPatients: 220, first90: 80, returning: 800, unknown: 0 } })
    expect(view.lastMonth?.totals).toEqual({ patients: 1000, newPatients: 200, first90: 50, returning: 750, unknown: 0 })
    expect(view.lastYear?.totals).toEqual({ patients: 900, newPatients: 180, first90: 30, returning: 690, unknown: 0 })
    expect(Object.keys(view.vsLastMonth).sort()).toEqual(['newPatients', 'patients', 'returning'])
  })

  it('AC-4402.4: first90이 없는 달은 열쇠가 없다(지금 그대로)', () => {
    const view = buildHistory([withFirst90('2026-08', 1000, 200, 50), saved('2026-09', 1100, 220)])
    expect(Object.keys(view.base?.totals ?? {}).sort()).toEqual(['newPatients', 'patients', 'returning', 'unknown'])
    expect(view.lastMonth?.totals.first90).toBe(50)
  })

  it('AC-4402.4: 돌려준 합계는 사본이다(first90이 있어도)', () => {
    const months = [withFirst90('2026-09', 1100, 220, 80)]
    const view = buildHistory(months)
    expect(view.base?.totals).not.toBe(months[0].totals)
    expect(months[0].totals.first90).toBe(80)
  })
})
