import { describe, expect, it } from 'vitest'
import { lineTotal, type PayItem } from '@/lib/staff/pay'
import { STAFF_JOBS } from '@/types/staff'
import { payByJob, type PayLineIn, type PayMember } from './pay'

// 의원 비교 직군별 월급(spec admin-view REQ-8014 AC-8014.2, design.md '의원 비교 — 계산'·기본값 18).
// 금액은 lib/staff/pay.ts lineTotal(실수령) 그대로다. 사람·금액은 모두 지어낸 것이다

const OCT = '2026-10'

// 상여는 10월부터 뺀 항목이라 10월 합계에 들지 않는다
const ITEMS: PayItem[] = [
  { id: 'base', name: '기본급', kind: 'amount', base: true, removedFrom: null },
  { id: 'meal', name: '식대', kind: 'amount', base: true, removedFrom: null },
  { id: 'incentive', name: '인센티브', kind: 'incentive', base: true, removedFrom: null },
  { id: 'bonus', name: '상여', kind: 'amount', base: true, removedFrom: '2026-10' },
]

const member = (id: string, job: PayMember['job'], employment: PayMember['employment'], hiredOn = '2024-03-04', leftOn: string | null = null): PayMember => ({
  id,
  job,
  employment,
  hiredOn,
  leftOn,
})

const line = (staffId: string | null, amounts: Record<string, number>, over: Partial<PayLineIn> = {}): PayLineIn => ({
  month: OCT,
  staffId,
  amounts,
  incentives: [],
  adjust: 0,
  ...over,
})

const fixed = (amount: number) => ({ ruleId: 'r1', name: '고정 수당', method: 'fixed' as const, unitAmount: amount, percent: null, count: null, sales: null })
const perCase = (count: number, unit: number) => ({ ruleId: 'r2', name: '도수', method: 'per_case' as const, unitAmount: unit, percent: null, count, sales: null })

const MEMBERS: PayMember[] = [
  member('nurse-1', '간호사', 'regular'),
  member('nurse-2', '간호사', 'contract'),
  member('nurse-3', '간호사', 'regular'),
  member('aide-1', '간호조무사', 'regular'),
  member('pt-1', '물리치료사', 'regular'),
  member('part-1', '물리치료사', 'part', '2026-01-05'),
  member('part-2', '원무', 'part', '2026-11-01'), // 11월에 들어옴 — 10월에 일하지 않음
  member('part-3', '기타', 'part', '2025-05-01', '2026-09-30'), // 9월에 나감
  member('part-4', '간호사', 'part', '2025-05-01', '2026-10-01'), // 10월 첫날 나감 — 그달 일함
  member('part-5', '기타', 'part', '2026-10-31'), // 10월 끝날 들어옴 — 그달 일함
]

const LINES: PayLineIn[] = [
  // 2,500,000 + 200,000 + 고정 100,000 − 50,000 = 2,750,000 (상여 500,000은 뺀 항목)
  line('nurse-1', { base: 2_500_000, meal: 200_000, bonus: 500_000 }, { incentives: [fixed(100_000)], adjust: -50_000 }),
  line('nurse-2', { base: 2_300_000, meal: 200_000 }, { adjust: 1 }), // 2,500,001
  line('nurse-3', { base: 0 }), // 0원 — 평균에 들지 않음
  line('aide-1', { base: 2_100_000 }),
  line('pt-1', { base: 3_000_000 }, { incentives: [perCase(10, 5_000)] }), // 3,050,000
  line('part-1', { base: 900_000 }), // 파트타임은 사람 수만
  line(null, { base: 9_999_999 }), // 직원 줄이 지워진 급여 줄
  line('gone', { base: 8_888_888 }), // 직원 목록에 없는 사람
  line('nurse-1', { base: 7_777_777 }, { month: '2026-09' }), // 다른 달
]

describe('AC-8014.2 payByJob: 직군별 월급(실수령)', () => {
  it('AC-8014.2: 직군 여섯마다 정규직·계약직 가운데 지급 합계가 0보다 큰 사람의 사람 수·평균(원 미만 버림)·가장 적음·가장 많음이다', () => {
    const pay = payByJob({ lines: LINES, members: MEMBERS, items: ITEMS, month: OCT })
    expect(pay.none).toBe(false)
    expect(Object.keys(pay.jobs)).toEqual([...STAFF_JOBS])
    // (2,750,000 + 2,500,001) ÷ 2 = 2,625,000.5 → 2,625,000
    expect(pay.jobs['간호사']).toEqual({ count: 2, avg: 2_625_000, min: 2_500_001, max: 2_750_000 })
    expect(pay.jobs['간호조무사']).toEqual({ count: 1, avg: 2_100_000, min: 2_100_000, max: 2_100_000 })
    expect(pay.jobs['물리치료사']).toEqual({ count: 1, avg: 3_050_000, min: 3_050_000, max: 3_050_000 })
    expect(pay.jobs['방사선사']).toBeNull()
    expect(pay.jobs['원무']).toBeNull()
    expect(pay.jobs['기타']).toBeNull()
  })

  it('AC-8014.2: 사람마다 금액은 lib/staff/pay.ts lineTotal 그대로다(뺀 항목·인센티브 항목이 없는 달·조정)', () => {
    // 인센티브 항목을 10월부터 뺀 병원: 인센티브 줄이 있어도 합계에 들지 않는다
    const items: PayItem[] = [
      { id: 'base', name: '기본급', kind: 'amount', base: true, removedFrom: null },
      { id: 'incentive', name: '인센티브', kind: 'incentive', base: true, removedFrom: '2026-10' },
    ]
    const one = line('nurse-1', { base: 2_400_000, gone: 300_000 }, { incentives: [fixed(200_000), perCase(3, 10_000)], adjust: 12_345 })
    const expected = lineTotal(one, items, OCT).total
    expect(expected).toBe(2_412_345)
    const pay = payByJob({ lines: [one], members: MEMBERS, items, month: OCT })
    expect(pay.jobs['간호사']).toEqual({ count: 1, avg: expected, min: expected, max: expected })
  })

  it('AC-8014.2: 직군·고용 형태는 지금 직원 줄 값이고, 기타 직군은 한 묶음이다', () => {
    const members = [member('x-1', '기타', 'regular'), member('x-2', '기타', 'contract'), member('x-3', '방사선사', 'part')]
    const lines = [line('x-1', { base: 2_000_000 }), line('x-2', { base: 2_200_001 }), line('x-3', { base: 1_000_000 })]
    const pay = payByJob({ lines, members, items: ITEMS, month: OCT })
    expect(pay.jobs['기타']).toEqual({ count: 2, avg: 2_100_000, min: 2_000_000, max: 2_200_001 })
    expect(pay.jobs['방사선사']).toBeNull() // 파트타임은 평균에 들지 않는다
    expect(pay.partTime).toBe(1)
  })

  it('AC-8014.2: 파트타임은 그달 일한 사람 수만이다(들어온 날 ≤ 달 끝, 나간 날 없음 또는 ≥ 달 첫날)', () => {
    const pay = payByJob({ lines: LINES, members: MEMBERS, items: ITEMS, month: OCT })
    expect(pay.partTime).toBe(3) // part-1 · part-4 · part-5
  })

  it('AC-8014.2: 직원 줄이 지워진 급여 줄(staffId 없음·목록에 없음)과 다른 달 줄은 뺀다', () => {
    const lines = [line(null, { base: 9_999_999 }), line('gone', { base: 8_888_888 }), line('nurse-1', { base: 7_777_777 }, { month: '2026-09' })]
    const pay = payByJob({ lines, members: MEMBERS, items: ITEMS, month: OCT })
    expect(pay.none).toBe(true)
    expect(Object.values(pay.jobs).every((job) => job === null)).toBe(true)
  })

  it('AC-8014.2: 지급 합계가 0보다 큰 줄이 하나도 없으면 급여 없음(none)이다', () => {
    expect(payByJob({ lines: [], members: MEMBERS, items: ITEMS, month: OCT })).toEqual({
      none: true,
      jobs: { 간호사: null, 간호조무사: null, 물리치료사: null, 방사선사: null, 원무: null, 기타: null },
      partTime: 3,
    })
    const zero = [line('nurse-1', { base: 0 }), line('aide-1', { base: 100_000 }, { adjust: -100_000 })]
    expect(payByJob({ lines: zero, members: MEMBERS, items: ITEMS, month: OCT }).none).toBe(true)
  })

  it('AC-8014.2: 파트타임 급여 줄만 있어도 그달 급여를 적은 것이라 급여 없음이 아니다(직군 칸은 모두 비어 있음)', () => {
    const pay = payByJob({ lines: [line('part-1', { base: 900_000 })], members: MEMBERS, items: ITEMS, month: OCT })
    expect(pay.none).toBe(false)
    expect(Object.values(pay.jobs).every((job) => job === null)).toBe(true)
  })

  it('AC-8014.2: 넘긴 줄·직원·항목을 바꾸지 않는다', () => {
    const input = { lines: LINES, members: MEMBERS, items: ITEMS, month: OCT }
    const copy = structuredClone(input)
    payByJob(input)
    expect(input).toEqual(copy)
  })
})
