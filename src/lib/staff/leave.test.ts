// 연차 셈(staff TASK-4, REQ-7604 · AC-7604.1~AC-7604.8, 근로기준법 60조). 사람·휴가는 모두 지어낸 것이고 오늘은 인자로만 준다.
// 보기 여섯 명은 requirements.md 보기 자료(오늘 2026-11-21, 입사일 기준, 못 쓴 연차는 수당 정산) — 휴가 목록은 합이 맞게 지어냈고,
// 이도윤 이번 기간은 시안 휴가 ④ 목록 그대로다(11-28 넣기 전)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eachDay } from '@/lib/analytics/dates'
import { annualDays, ceilHalf, leaveStatus, remainingAt, retireGap, settleInMonth } from './leave'

type Kind = 'annual' | 'half' | 'family' | 'sick' | 'maternity' | 'unpaid'
type Person = {
  id?: string
  employment: 'regular' | 'contract' | 'part'
  weeklyHours: number
  hiredOn: string
  leftOn: string | null
  usedBefore: number
  usedBeforeFrom: string | null
}

const TODAY = '2026-11-21'

function person(hiredOn: string, over: Partial<Person> = {}): Person {
  return { employment: 'regular', weeklyHours: 40, hiredOn, leftOn: null, usedBefore: 0, usedBeforeFrom: null, ...over }
}

// design.md 3절 Leave 모양 그대로(셈은 day·kind·staffId만 본다)
let seq = 0
function lv(day: string, kind: Kind = 'annual', over: { part?: 'am' | 'pm'; paid?: boolean; staffId?: string } = {}) {
  seq += 1
  return {
    id: `leave-${seq}`,
    groupId: `group-${seq}`,
    staffId: over.staffId ?? 'staff',
    day,
    kind,
    part: kind === 'half' ? (over.part ?? 'am') : null,
    paid: over.paid ?? kind !== 'unpaid',
    memo: null,
  }
}
const run = (from: string, to: string, kind: Kind = 'annual') => eachDay({ from, to }).map((d) => lv(d, kind))

const hire = { basis: 'hire', leftover: 'pay' } as const
const jan1 = { basis: 'jan1', leftover: 'pay' } as const

// ── 보기 여섯 명 ─────────────────────────────────────────

const 김하늘 = {
  person: person('2021-03-02'),
  leaves: [
    lv('2026-02-20'), // 지난 기간 — 이번 기간에 안 셈
    lv('2026-03-20'),
    lv('2026-05-04'),
    lv('2026-05-06'),
    lv('2026-06-01', 'sick'), // 병가 — 안 셈
    lv('2026-06-15', 'half', { part: 'am' }),
    ...run('2026-08-10', '2026-08-12'),
    lv('2026-09-25', 'half', { part: 'pm' }),
    lv('2026-10-02'),
    lv('2026-10-16', 'half', { part: 'am' }),
    lv('2026-11-07'), // 보기 자료 11-07(토) 연차
  ],
}

// 지난 기간(2025-07-17~2026-07-16) 13일 + 이번 기간 시안 ④ 여섯 줄(연차·반차 6일 + 경조사 1일)
const 이도윤지난 = [
  ...run('2025-08-04', '2025-08-08'),
  lv('2025-10-10'),
  lv('2025-12-24'),
  lv('2025-12-26'),
  ...run('2026-02-16', '2026-02-18'),
  lv('2026-05-25'),
  lv('2026-07-15', 'half', { part: 'am' }),
  lv('2026-07-16', 'half', { part: 'pm' }), // 지난 기간 끝날
]
const 이도윤이번 = [
  lv('2026-07-31'),
  ...run('2026-08-03', '2026-08-05'),
  lv('2026-09-07'),
  lv('2026-09-18', 'family'),
  lv('2026-10-12', 'half', { part: 'am' }),
  lv('2026-10-23', 'half', { part: 'pm' }),
]
const 이도윤 = { person: person('2023-07-17'), leaves: [...이도윤지난, ...이도윤이번] }
const 이도윤1128 = { ...이도윤, leaves: [...이도윤.leaves, lv('2026-11-28')] }

const 박서연 = {
  person: person('2025-01-06'),
  leaves: [
    lv('2025-08-01'), // 첫해(달마다 1일) 기간
    lv('2026-03-09'),
    lv('2026-07-20'),
    lv('2026-09-14', 'half', { part: 'am' }),
    lv('2026-11-13', 'half', { part: 'pm' }), // 보기 자료 11-13(금) 오후 반차
  ],
}

// 웹앱을 쓰기 전 이번 기간에 이미 쓴 10일(올해 이미 쓴 연차) + 웹앱에 넣은 4일
const 최민준 = {
  person: person('2019-11-25', { usedBefore: 10, usedBeforeFrom: '2025-11-25' }),
  leaves: [
    lv('2026-03-03'),
    lv('2026-06-08'),
    lv('2026-09-21', 'half', { part: 'am' }),
    lv('2026-10-05', 'half', { part: 'pm' }),
    lv('2026-11-10'),
  ],
}

const 정유나 = {
  person: person('2024-09-02', { employment: 'part', weeklyHours: 24 }),
  leaves: [
    lv('2026-10-08'),
    lv('2026-11-05', 'half', { part: 'am' }),
    lv('2026-11-06', 'half', { part: 'pm' }),
    lv('2026-11-18', 'sick'), // 보기 자료 11-18(수) 병가 — 안 셈
  ],
}

const 한지우 = {
  person: person('2026-02-02', { employment: 'contract' }),
  leaves: [
    lv('2026-05-15'),
    lv('2026-07-27'),
    lv('2026-07-28'),
    lv('2026-10-30', 'half', { part: 'am' }),
    lv('2026-11-20', 'half', { part: 'pm' }),
  ],
}

describe('AC-7604.8 보기 자료 여섯 명 (오늘 2026-11-21, 입사일 기준)', () => {
  it('AC-7604.8 김하늘 17/9.5/7.5 · 2026-03-02~2027-03-01 · 다음 2027-03-02 17일', () => {
    expect(leaveStatus({ ...김하늘, ...hire, today: TODAY })).toMatchObject({
      period: { from: '2026-03-02', to: '2027-03-01' },
      basis: 'hire',
      firstYear: false,
      granted: 17,
      carried: 0,
      used: 9.5,
      left: 7.5,
      next: { day: '2027-03-02', days: 17, inDays: 101 },
      endsThisMonth: false,
    })
  })

  it('AC-7604.8 이도윤 16/6/10 · 2026-07-17~2027-07-16 · 다음 2027-07-17 16일 (경조사는 안 셈)', () => {
    expect(leaveStatus({ ...이도윤, ...hire, today: TODAY })).toMatchObject({
      period: { from: '2026-07-17', to: '2027-07-16' },
      granted: 16,
      carried: 0,
      used: 6,
      left: 10,
      next: { day: '2027-07-17', days: 16 },
      endsThisMonth: false,
    })
  })

  it('AC-7604.8 이도윤 11-28 연차를 더하면 16/7/9 (기간 안 앞날도 바로 셈)', () => {
    expect(leaveStatus({ ...이도윤1128, ...hire, today: TODAY })).toMatchObject({ granted: 16, used: 7, left: 9 })
  })

  it('AC-7604.8 이도윤 지난 기간 2025-07-17~2026-07-16은 15일 생김 · 13일 씀 · 남은 2일 → 2026-07 정산', () => {
    const status = leaveStatus({ ...이도윤, ...hire, today: TODAY })
    expect(status.previous).toEqual({
      from: '2025-07-17',
      to: '2026-07-16',
      granted: 15,
      used: 13,
      left: 2,
      settledMonth: '2026-07',
    })
    expect(settleInMonth({ ...이도윤, ...hire, month: '2026-07' })).toBe(2)
  })

  it('AC-7604.8 박서연 15/3/12 · 2026-01-06~2027-01-05 · 다음 2027-01-06 15일', () => {
    const status = leaveStatus({ ...박서연, ...hire, today: TODAY })
    expect(status).toMatchObject({
      period: { from: '2026-01-06', to: '2027-01-05' },
      firstYear: false,
      granted: 15,
      used: 3,
      left: 12,
      next: { day: '2027-01-06', days: 15 },
    })
    // 지난 기간은 첫해(달마다 1일 11일)
    expect(status.previous).toEqual({ from: '2025-01-06', to: '2026-01-05', granted: 11, used: 1, left: 10, settledMonth: '2026-01' })
  })

  it('AC-7604.8 최민준 17/14/3 · 2025-11-25~2026-11-24 · 이번 달에 끝남 · 다음 2026-11-25 18일(4일 뒤)', () => {
    expect(leaveStatus({ ...최민준, ...hire, today: TODAY })).toMatchObject({
      period: { from: '2025-11-25', to: '2026-11-24' },
      granted: 17,
      used: 14,
      left: 3,
      next: { day: '2026-11-25', days: 18, inDays: 4 },
      endsThisMonth: true,
    })
    expect(settleInMonth({ ...최민준, ...hire, month: '2026-11' })).toBe(3)
  })

  it('AC-7604.8 정유나(파트타임 주 24시간) 9/2/7 · 2026-09-02~2027-09-01 · 다음 2027-09-02 10일', () => {
    expect(leaveStatus({ ...정유나, ...hire, today: TODAY })).toMatchObject({
      period: { from: '2026-09-02', to: '2027-09-01' },
      granted: 9,
      used: 2,
      left: 7,
      next: { day: '2027-09-02', days: 10 },
    })
  })

  it('AC-7604.8 한지우(1년 미만) 9/4/5 · 2026-02-02~2027-02-01 · 2026-12-02에 1일 더', () => {
    expect(leaveStatus({ ...한지우, ...hire, today: TODAY })).toMatchObject({
      period: { from: '2026-02-02', to: '2027-02-01' },
      firstYear: true,
      granted: 9,
      used: 4,
      left: 5,
      next: { day: '2026-12-02', days: 1, inDays: 11 },
      previous: null,
    })
  })
})

describe('AC-7604.1 입사일 기준 n년째 15 + ⌊(n−1)/2⌋, 25일까지', () => {
  it('AC-7604.1 annualDays: 1·2년 15, 3·4년 16, 5·6년 17, 7·8년 18, 21년부터 25', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(annualDays)).toEqual([15, 15, 16, 16, 17, 17, 18, 18])
    expect(annualDays(20)).toBe(24)
    expect(annualDays(21)).toBe(25)
    expect(annualDays(23)).toBe(25) // 15 + 11 = 26 → 25
    expect(annualDays(40)).toBe(25)
    expect(annualDays(0)).toBe(0)
  })

  it('AC-7604.1 기간은 입사 기념일부터 1년 — 끝날까지 그 기간, 기념일에 새 기간', () => {
    const p = { person: person('2019-11-25'), leaves: [], ...hire }
    expect(leaveStatus({ ...p, today: '2026-11-24' })).toMatchObject({
      period: { from: '2025-11-25', to: '2026-11-24' },
      granted: 17,
    })
    const after = leaveStatus({ ...p, today: '2026-11-25' })
    expect(after).toMatchObject({ period: { from: '2026-11-25', to: '2027-11-24' }, granted: 18, endsThisMonth: false })
    expect(after.previous).toMatchObject({ from: '2025-11-25', to: '2026-11-24', granted: 17 })
  })

  it('AC-7604.1 2월 29일 입사는 기념일이 평년 2월 28일', () => {
    const p = { person: person('2024-02-29'), leaves: [], ...hire }
    expect(leaveStatus({ ...p, today: '2025-02-27' })).toMatchObject({ firstYear: true, granted: 11 })
    expect(leaveStatus({ ...p, today: '2025-02-28' })).toMatchObject({
      period: { from: '2025-02-28', to: '2026-02-27' },
      firstYear: false,
      granted: 15,
    })
  })
})

describe('AC-7604.2 입사 1년 미만 — 입사일 + m달 날마다 1일', () => {
  const p = { person: person('2026-02-02'), ...hire }

  it('AC-7604.2 한 달 다 차기 전날은 0, 그날 1일 · 11일까지 · 기간은 입사일 ~ 1년 앞날', () => {
    expect(leaveStatus({ ...p, leaves: [], today: '2026-03-01' })).toMatchObject({
      period: { from: '2026-02-02', to: '2027-02-01' },
      granted: 0,
      next: { day: '2026-03-02', days: 1, inDays: 1 },
    })
    expect(leaveStatus({ ...p, leaves: [], today: '2026-03-02' }).granted).toBe(1)
    expect(leaveStatus({ ...p, leaves: [], today: '2027-01-02' }).granted).toBe(11)
    expect(leaveStatus({ ...p, leaves: [], today: '2027-02-01' })).toMatchObject({
      firstYear: true,
      granted: 11,
      next: { day: '2027-02-02', days: 15, inDays: 1 },
    })
    const year1 = leaveStatus({ ...p, leaves: [], today: '2027-02-02' })
    expect(year1).toMatchObject({ period: { from: '2027-02-02', to: '2028-02-01' }, firstYear: false, granted: 15 })
    expect(year1.previous).toMatchObject({ from: '2026-02-02', to: '2027-02-01', granted: 11 })
  })

  it('AC-7604.2 그 한 달에 무급(결근)이 있으면 그 달은 0 — 달의 끝날·첫날 경계', () => {
    // 2번째 달 = 03-02 ~ 04-01 → 04-02에 생김, 3번째 달 = 04-02 ~ 05-01 → 05-02에 생김
    const lastDay = [lv('2026-04-01', 'unpaid')]
    expect(leaveStatus({ ...p, leaves: lastDay, today: '2026-04-02' }).granted).toBe(1)
    expect(leaveStatus({ ...p, leaves: lastDay, today: '2026-05-02' }).granted).toBe(2)
    const firstDay = [lv('2026-04-02', 'unpaid')]
    expect(leaveStatus({ ...p, leaves: firstDay, today: '2026-04-02' }).granted).toBe(2)
    expect(leaveStatus({ ...p, leaves: firstDay, today: '2026-05-02' }).granted).toBe(2)
    expect(leaveStatus({ ...p, leaves: firstDay, today: '2026-06-02' }).granted).toBe(3)
    // 0인 달은 건너뛰고 그다음 생기는 날을 보인다
    expect(leaveStatus({ ...p, leaves: [lv('2026-04-10', 'unpaid')], today: '2026-04-05' }).next).toEqual({
      day: '2026-06-02',
      days: 1,
      inDays: 58,
    })
  })

  it('AC-7604.2 무급 병가·경조사는 결근이 아니다', () => {
    const leaves = [lv('2026-03-10', 'sick', { paid: false }), lv('2026-03-11', 'family'), lv('2026-03-12', 'maternity')]
    expect(leaveStatus({ ...p, leaves, today: '2026-04-02' }).granted).toBe(2)
  })

  it('AC-7604.2 31일 입사는 말일로 — 02-28, 03-31에 생김', () => {
    const q = { person: person('2026-01-31'), leaves: [], ...hire }
    expect(leaveStatus({ ...q, today: '2026-02-27' }).granted).toBe(0)
    expect(leaveStatus({ ...q, today: '2026-02-28' }).granted).toBe(1)
    expect(leaveStatus({ ...q, today: '2026-03-30' }).granted).toBe(1)
    expect(leaveStatus({ ...q, today: '2026-03-31' }).granted).toBe(2)
  })

  it('AC-7604.2 입사 전이면 첫 기간 · 0일 · 다음 생기는 날', () => {
    expect(leaveStatus({ person: person('2026-12-01'), leaves: [], ...hire, today: TODAY })).toMatchObject({
      period: { from: '2026-12-01', to: '2027-11-30' },
      firstYear: true,
      granted: 0,
      used: 0,
      left: 0,
      next: { day: '2027-01-01', days: 1, inDays: 41 },
      previous: null,
    })
  })
})

describe('AC-7604.3 1월 1일 기준', () => {
  const p = { person: person('2024-09-02'), leaves: [], ...jan1 }

  it('AC-7604.3 입사한 해: 입사일 ~ 12-31 기간, 달마다 1일 · 다음 1월 1일에 15 × 121 ÷ 366 → 5일', () => {
    expect(leaveStatus({ ...p, today: '2024-12-31' })).toMatchObject({
      period: { from: '2024-09-02', to: '2024-12-31' },
      basis: 'jan1',
      firstYear: true,
      granted: 3,
      next: { day: '2025-01-01', days: 5, inDays: 1 },
      endsThisMonth: true,
      previous: null,
    })
  })

  it('AC-7604.3 입사 다음 해: 1월 1일 비례 5일 + 남은 달마다 1일, 기간 1월 1일~12월 31일', () => {
    const jan = leaveStatus({ ...p, today: '2025-01-01' })
    expect(jan).toMatchObject({ period: { from: '2025-01-01', to: '2025-12-31' }, granted: 5, next: { day: '2025-01-02', days: 1 } })
    expect(jan.previous).toEqual({ from: '2024-09-02', to: '2024-12-31', granted: 3, used: 0, left: 3, settledMonth: '2024-12' })
    expect(leaveStatus({ ...p, today: '2025-08-02' })).toMatchObject({
      firstYear: true,
      granted: 13,
      next: { day: '2026-01-01', days: 15 },
    })
    expect(leaveStatus({ ...p, today: '2025-09-02' }).firstYear).toBe(false)
  })

  it('AC-7604.3 그다음 1월 1일: n = 그해 − 입사한 해 − 1 → 15 · 15 · 16 … 25까지', () => {
    expect(leaveStatus({ ...p, today: '2026-01-01' }).granted).toBe(15) // n = 1
    expect(leaveStatus({ ...p, today: '2027-01-01' }).granted).toBe(15) // n = 2
    expect(leaveStatus({ ...p, today: '2027-12-31' }).granted).toBe(15)
    expect(leaveStatus({ ...p, today: '2028-01-01' }).granted).toBe(16) // n = 3
    expect(leaveStatus({ ...p, today: '2034-01-01' }).granted).toBe(19) // n = 9
    expect(leaveStatus({ ...p, today: '2060-06-01' }).granted).toBe(25)
  })

  it('AC-7604.3 평년 비례 15 × 183 ÷ 365 = 7.52 → 8일, 1월 1일 입사는 다음 해 15일', () => {
    // 07-02 입사: 6번째 달 1일은 01-02에 생긴다(07-01 입사면 01-01에 비례 8 + 달마다 1 = 9)
    expect(leaveStatus({ person: person('2025-07-02'), leaves: [], ...jan1, today: '2026-01-01' }).granted).toBe(8)
    expect(leaveStatus({ person: person('2025-07-01'), leaves: [], ...jan1, today: '2026-01-01' }).granted).toBe(9)
    const q = { person: person('2025-01-01'), leaves: [], ...jan1 }
    expect(leaveStatus({ ...q, today: '2025-12-31' })).toMatchObject({ period: { from: '2025-01-01', to: '2025-12-31' }, granted: 11 })
    expect(leaveStatus({ ...q, today: '2026-01-01' }).granted).toBe(15)
  })

  it('AC-7604.3 같은 날 생기는 연차는 다음 새 연차에 합쳐 보인다 (01-01 비례 8 + 달마다 1)', () => {
    expect(leaveStatus({ person: person('2025-07-01'), leaves: [], ...jan1, today: '2025-12-31' }).next).toEqual({
      day: '2026-01-01',
      days: 9,
      inDays: 1,
    })
  })

  it('AC-7604.3 입사 전이면 입사한 해 기간 · 다음은 1월 1일 (15 × 31 ÷ 365 → 1.5 + 달마다 1)', () => {
    expect(leaveStatus({ person: person('2026-12-01'), leaves: [], ...jan1, today: TODAY })).toMatchObject({
      period: { from: '2026-12-01', to: '2026-12-31' },
      granted: 0,
      next: { day: '2027-01-01', days: 2.5, inDays: 41 },
    })
  })

  it('AC-7604.3 1월 1일 기준이면 기간은 모두 12월에 끝난다', () => {
    expect(leaveStatus({ ...p, today: '2026-12-05' })).toMatchObject({
      period: { from: '2026-01-01', to: '2026-12-31' },
      endsThisMonth: true,
      next: { day: '2027-01-01', days: 15, inDays: 27 },
    })
    expect(leaveStatus({ ...p, today: '2026-11-30' }).endsThisMonth).toBe(false)
  })
})

describe('AC-7604.4 1월 1일 기준 퇴사자 — 입사일 기준이 더 많으면 차이', () => {
  const p = (leftOn: string) => ({ person: person('2024-09-02', { leftOn }), leaves: [], basis: 'jan1' as const })

  it('AC-7604.4 1주년 하루 전 퇴사는 0, 1주년 날 퇴사는 26 − 16 = 10', () => {
    expect(retireGap(p('2025-09-01'))).toBe(0) // 입사일 11 < 1월 1일 16
    expect(retireGap(p('2025-09-02'))).toBe(10) // 입사일 11 + 15 = 26, 1월 1일 11 + 5 = 16
    expect(retireGap(p('2025-12-31'))).toBe(10)
  })

  it('AC-7604.4 1월 1일 연차는 그날 재직일 때만 — 12-31 퇴사 10, 01-01 퇴사 0', () => {
    expect(retireGap(p('2026-01-01'))).toBe(0) // 1월 1일 31 ≥ 입사일 26
  })

  it('AC-7604.4 3주년(16일) 하루 전 0, 그날 퇴사 57 − 46 = 11', () => {
    expect(retireGap(p('2027-09-01'))).toBe(0) // 41 vs 46
    expect(retireGap(p('2027-09-02'))).toBe(11) // 11 + 15 + 15 + 16 = 57 vs 11 + 5 + 15 + 15 = 46
  })

  it('AC-7604.4 입사일 기준이거나 퇴사일이 없으면 0', () => {
    expect(retireGap({ ...p('2025-09-02'), basis: 'hire' })).toBe(0)
    expect(retireGap({ person: person('2024-09-02'), leaves: [], basis: 'jan1' })).toBe(0)
  })

  it('AC-7604.4 퇴사하면 그 기간은 퇴사일에 끝나고 다음 새 연차가 없다', () => {
    expect(leaveStatus({ ...p('2026-05-31'), leftover: 'pay', today: TODAY })).toMatchObject({
      period: { from: '2026-01-01', to: '2026-05-31' },
      granted: 15,
      next: null,
      endsThisMonth: false,
    })
  })
})

describe('AC-7604.5 주 근무시간 — 15시간 미만 0, 파트타임 비례(0.5일 올림)', () => {
  it('AC-7604.5 ceilHalf는 0.5 단위로 올린다', () => {
    expect([9.6, 9.1, 9, 9.5, 0, 4.959, 5.625, 2.25].map(ceilHalf)).toEqual([10, 9.5, 9, 9.5, 0, 5, 6, 2.5])
    expect(ceilHalf((16 * 24) / 40)).toBe(10)
    expect(ceilHalf((15 * 24) / 40)).toBe(9)
  })

  it('AC-7604.5 주 15시간 미만은 근무 형태와 상관없이 0, 다음 새 연차도 없음', () => {
    for (const employment of ['regular', 'contract', 'part'] as const) {
      const status = leaveStatus({
        person: person('2023-07-17', { employment, weeklyHours: 14.5 }),
        leaves: [],
        ...hire,
        today: TODAY,
      })
      expect(status).toMatchObject({ granted: 0, left: 0, next: null })
    }
    expect(leaveStatus({ person: person('2026-02-02', { weeklyHours: 14.5 }), leaves: [], ...hire, today: TODAY }).granted).toBe(0)
  })

  it('AC-7604.5 파트타임 15시간 = 15 × 15 ÷ 40 = 5.625 → 6일, 40시간 넘으면 40으로, 정규직·계약직은 그대로', () => {
    const at = (over: Partial<Person>) =>
      leaveStatus({ person: person('2025-09-02', over), leaves: [], ...hire, today: '2026-09-02' }).granted
    expect(at({ employment: 'part', weeklyHours: 15 })).toBe(6)
    expect(at({ employment: 'part', weeklyHours: 24 })).toBe(9)
    expect(at({ employment: 'part', weeklyHours: 45 })).toBe(15)
    expect(at({ employment: 'regular', weeklyHours: 20 })).toBe(15)
    expect(at({ employment: 'contract', weeklyHours: 15 })).toBe(15)
  })

  it('AC-7604.5 3년째부터 가산도 비율로 — 정유나 2027-09-02 16 × 24 ÷ 40 = 9.6 → 10일', () => {
    const p = { ...정유나, ...hire }
    expect(leaveStatus({ ...p, today: '2027-09-01' }).next).toMatchObject({ day: '2027-09-02', days: 10 })
    expect(leaveStatus({ ...p, today: '2027-09-02' }).granted).toBe(10)
  })

  it('AC-7604.5 1년 미만 파트타임은 쌓인 합에 한 번 올린다 (주 24시간: 1 · 1.5 · … 9달 5.4 → 5.5)', () => {
    const p = { person: person('2026-02-02', { employment: 'part', weeklyHours: 24 }), leaves: [], ...hire }
    expect(leaveStatus({ ...p, today: '2026-03-02' }).granted).toBe(1)
    expect(leaveStatus({ ...p, today: '2026-04-02' }).granted).toBe(1.5)
    const nov = leaveStatus({ ...p, today: TODAY })
    expect(nov.granted).toBe(5.5)
    expect(nov.next).toEqual({ day: '2026-12-02', days: 0.5, inDays: 11 }) // 10달 6 − 5.5
  })

  it('AC-7604.5 1월 1일 기준 파트타임 비례: 5일 × 24 ÷ 40 = 3일', () => {
    const p = { person: person('2024-09-02', { employment: 'part', weeklyHours: 24 }), leaves: [], ...jan1 }
    expect(leaveStatus({ ...p, today: '2025-01-01' }).granted).toBe(3)
    expect(leaveStatus({ ...p, today: '2026-01-01' }).granted).toBe(9)
  })
})

describe('AC-7604.6 쓴 연차 — 연차 1 · 반차 0.5만, 기간 안 앞날도', () => {
  it('AC-7604.6 경조사·병가·출산·육아휴직·무급(결근)은 세지 않는다', () => {
    const leaves = [
      lv('2026-03-02'),
      lv('2026-03-03', 'half', { part: 'pm' }),
      lv('2026-03-04', 'family'),
      lv('2026-03-05', 'sick'),
      lv('2026-03-06', 'sick', { paid: false }),
      lv('2026-03-09', 'maternity'),
      lv('2026-03-10', 'unpaid'),
    ]
    expect(leaveStatus({ person: person('2021-03-02'), leaves, ...hire, today: TODAY })).toMatchObject({ used: 1.5, left: 15.5 })
  })

  it('AC-7604.6 다음 기간의 휴가는 이번 기간에 안 센다', () => {
    const leaves = [...최민준.leaves, lv('2026-11-25'), lv('2026-11-26')]
    expect(leaveStatus({ ...최민준, leaves, ...hire, today: TODAY })).toMatchObject({ used: 14, left: 3 })
    expect(leaveStatus({ ...최민준, leaves, ...hire, today: '2026-11-25' })).toMatchObject({ granted: 18, used: 2, left: 16 })
  })

  it('AC-7604.6 올해 이미 쓴 연차는 그 값을 적은 날이 든 기간에만 더한다', () => {
    const next = leaveStatus({ ...최민준, ...hire, today: '2026-11-25' })
    expect(next.used).toBe(0)
    expect(next.previous).toMatchObject({ used: 14, left: 3 })
    // 적은 날이 없으면 어느 기간에도 더하지 않는다
    const noFrom = { ...최민준, person: { ...최민준.person, usedBeforeFrom: null } }
    expect(leaveStatus({ ...noFrom, ...hire, today: TODAY }).used).toBe(4)
  })

  it('AC-7604.6 다른 직원 휴가는 세지 않는다 (staffId)', () => {
    const p = person('2021-03-02', { id: 'me' })
    const leaves = [lv('2026-04-01', 'annual', { staffId: 'me' }), lv('2026-04-02', 'annual', { staffId: 'other' })]
    expect(leaveStatus({ person: p, leaves, ...hire, today: TODAY }).used).toBe(1)
  })

  it('AC-7604.6 remainingAt: 그날 기준 지금 기간 남은 일수 (세무사 자료 달 끝날)', () => {
    expect(remainingAt({ ...이도윤1128, ...hire }, '2026-11-30')).toBe(9)
    expect(remainingAt({ ...한지우, ...hire }, '2026-11-30')).toBe(5)
    expect(remainingAt({ ...한지우, ...hire }, '2026-12-31')).toBe(6)
    expect(remainingAt({ ...한지우, ...hire }, '2026-01-31')).toBeNull() // 입사 전
  })
})

describe('AC-7604.7 못 쓴 연차 — pay 정산 · carry 넘김', () => {
  // 첫해 2025-03-02~2026-03-01 11일 생김, 8일 씀 → 남은 3일. 이번 기간 2026-03-02~ 15일, 1일 씀
  const leaves = [...run('2025-06-02', '2025-06-06'), ...run('2025-09-01', '2025-09-03'), lv('2026-04-01')]
  const base = { person: person('2025-03-02'), leaves }

  it('AC-7604.7 pay: 남은 3일을 끝날이 든 달(2026-03)에 정산하고 다음 기간은 0에서', () => {
    const status = leaveStatus({ ...base, ...hire, today: TODAY })
    expect(status).toMatchObject({ granted: 15, carried: 0, used: 1, left: 14 })
    expect(status.previous).toEqual({ from: '2025-03-02', to: '2026-03-01', granted: 11, used: 8, left: 3, settledMonth: '2026-03' })
    expect(settleInMonth({ ...base, ...hire, month: '2026-03' })).toBe(3)
    expect(settleInMonth({ ...base, ...hire, month: '2026-02' })).toBeNull()
    expect(settleInMonth({ ...base, ...hire, month: '2026-04' })).toBeNull()
  })

  it('AC-7604.7 carry: 남은 3일이 다음 기간 넘어온 연차, 정산은 없음', () => {
    const p = { ...base, basis: 'hire', leftover: 'carry' } as const
    const status = leaveStatus({ ...p, today: TODAY })
    expect(status).toMatchObject({ granted: 15, carried: 3, used: 1, left: 17 })
    expect(status.previous).toMatchObject({ left: 3, settledMonth: null })
    expect(settleInMonth({ ...p, month: '2026-03' })).toBeNull()
    expect(remainingAt(p, '2026-11-30')).toBe(17)
  })

  it('AC-7604.7 남은이 0 밑이면 음수 그대로 — pay 정산은 0, carry는 음수를 넘김', () => {
    const over = { person: person('2025-03-02'), leaves: [...leaves, ...run('2025-12-01', '2025-12-04')] } // 첫해 12일 씀
    const pay = leaveStatus({ ...over, ...hire, today: TODAY })
    expect(pay.previous).toMatchObject({ granted: 11, used: 12, left: -1 })
    expect(pay).toMatchObject({ carried: 0, left: 14 })
    expect(settleInMonth({ ...over, ...hire, month: '2026-03' })).toBe(0)
    const carry = leaveStatus({ ...over, basis: 'hire', leftover: 'carry', today: TODAY })
    expect(carry).toMatchObject({ carried: -1, left: 13 })
  })

  it('AC-7604.7 퇴사하면 그 기간은 퇴사일에 끝나 그달 정산(넘길 다음 기간이 없어 carry도)', () => {
    const left = { person: person('2021-03-02', { leftOn: '2026-05-31' }), leaves: [lv('2026-04-10')] }
    expect(settleInMonth({ ...left, ...hire, month: '2026-05' })).toBe(16)
    // carry는 앞 기간들 남은 것(11 + 15 + 15 + 16 + 16)이 넘어와 있다
    expect(settleInMonth({ ...left, basis: 'hire', leftover: 'carry', month: '2026-05' })).toBe(11 + 15 + 15 + 16 + 16 + 17 - 1)
    expect(settleInMonth({ ...left, ...hire, month: '2027-03' })).toBeNull()
    expect(leaveStatus({ ...left, ...hire, today: TODAY })).toMatchObject({
      period: { from: '2026-03-02', to: '2026-05-31' },
      granted: 17,
      used: 1,
      left: 16,
      next: null,
    })
    expect(remainingAt({ ...left, ...hire }, '2026-11-30')).toBe(16)
  })

  it('AC-7604.7 1월 1일 기준은 12월에 정산', () => {
    const p = { person: person('2024-09-02'), leaves: [lv('2026-06-01')], ...jan1 }
    expect(settleInMonth({ ...p, month: '2026-12' })).toBe(14)
    expect(settleInMonth({ ...p, month: '2026-11' })).toBeNull()
  })
})

describe('AC-7604.1~7604.8 바탕 — 순수 함수', () => {
  it('AC-7604.1 leave.ts는 lib/analytics/dates만 불러온다(@/types/staff·네트워크·저장소·React 없음)', () => {
    const src = readFileSync(join(__dirname, 'leave.ts'), 'utf8')
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    expect(imports).toEqual(['@/lib/analytics/dates'])
  })
})
