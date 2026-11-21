import { describe, expect, it } from 'vitest'
import {
  checkWeek,
  dayKind,
  expandLeave,
  fmtMinutes,
  holidayPrefill,
  isChangedDay,
  monthOvertime,
  nthSaturday,
  planOn,
  shiftOn,
  weekSummary,
  workingCount,
  type DayShift,
} from './schedule'

// 근무표 셈 (staff REQ-7605). 보기 자료(지어낸 사람)는 시안 schedule.html 그대로 — 오늘 2026-11-21(토).
// 2026년 11월: 1일 일요일, 토요일은 7(첫째)·14(둘째)·21(셋째)·28(넷째). 10-31은 10월 다섯째 토요일.

const W: DayShift = { start: 540, end: 1080, lunchFrom: 780, lunchTo: 840 } // 09:00~18:00 · 점심 13:00~14:00
const SAT: DayShift = { start: 540, end: 780, lunchFrom: null, lunchTo: null } // 09:00~13:00

// 병원 정보 진료시간(월~일, null = 휴진 요일) — 일요일 휴진
const HOURS = [
  { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 },
  { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 },
  { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 },
  { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 },
  { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 },
  { open: 540, close: 780, lunchFrom: null, lunchTo: null },
  null,
]
const CLINIC = { hours: HOURS, closedDates: [] as string[] }

const member = (id: string, hiredOn: string, leftOn: string | null = null) => ({ id, hiredOn, leftOn })
const KIM = member('kim', '2021-03-02') // 김하늘 간호조무사 · 토 1·3주
const LEE = member('lee', '2023-07-17') // 이도윤 물리치료사 · 토 2·4주
const PARK = member('park', '2025-01-06') // 박서연 물리치료사 · 토 2·4주
const CHOI = member('choi', '2019-11-25') // 최민준 방사선사 · 토 1·3주
const JUNG = member('jung', '2024-09-02') // 정유나 원무 · 월·수·금 (파트타임 24)
const HAN = member('han', '2026-02-02') // 한지우 원무 · 월~금
const OH = member('oh', '2020-03-02', '2024-05-31') // 오세린 퇴사
const MOON = member('moon', '2018-04-02', '2022-12-31') // 문태호 퇴사
const MEMBERS = [KIM, LEE, PARK, CHOI, JUNG, HAN, OH, MOON]

const plan = (staffId: string, from: string, week: DayShift[], sat: 'every' | '1-3' | '2-4') => ({
  id: `plan-${staffId}-${from}`,
  staffId,
  from,
  week,
  sat,
})
const FULL = [W, W, W, W, W, SAT, null]
const PLANS = [
  plan('kim', '2021-03-02', FULL, '1-3'),
  plan('lee', '2023-07-17', FULL, '2-4'),
  plan('park', '2025-01-06', FULL, '2-4'),
  plan('choi', '2019-11-25', FULL, '1-3'),
  plan('jung', '2024-09-02', [W, null, W, null, W, null, null], 'every'),
  plan('han', '2026-02-02', [W, W, W, W, W, null, null], 'every'),
  plan('oh', '2020-03-02', FULL, 'every'),
  plan('moon', '2018-04-02', FULL, 'every'),
]

const change = (staffId: string, day: string, shift: DayShift, memo: string | null = null) => ({ staffId, day, shift, memo })
const CHANGES = [
  change('park', '2026-11-19', { start: 600, end: 1140, lunchFrom: 780, lunchTo: 840 }), // 10–19
  change('han', '2026-11-20', { start: 540, end: 900, lunchFrom: 780, lunchTo: 840 }), // 09–15
  change('choi', '2026-11-15', { start: 540, end: 780, lunchFrom: null, lunchTo: null }), // 휴진일(일) 09–13
  change('lee', '2026-11-18', W, '저녁 환자가 많아 8시까지 일함'), // 메모만(근무는 기본과 같음)
]

const leave = (staffId: string, day: string, kind: string, part: 'am' | 'pm' | null = null) => ({
  id: `${staffId}-${day}`,
  groupId: `g-${staffId}-${day}`,
  staffId,
  day,
  kind: kind as 'annual' | 'half' | 'family' | 'sick' | 'maternity' | 'unpaid',
  part,
  paid: kind !== 'unpaid',
  memo: null,
})
const LEAVES = [
  leave('kim', '2026-11-07', 'annual'),
  leave('park', '2026-11-13', 'half', 'pm'),
  leave('jung', '2026-11-18', 'sick'),
  leave('lee', '2026-11-28', 'annual'),
]

const on = (m: { id: string; hiredOn: string; leftOn: string | null }, day: string, extra: Partial<Parameters<typeof shiftOn>[0]> = {}) =>
  shiftOn({ member: m, plans: PLANS, changes: CHANGES, day, ...extra })

describe('checkWeek — 기본 근무 일곱 칸 모양', () => {
  it('AC-7605.1: 월~일 일곱 칸, 칸은 쉼(null) 또는 10분 단위 근무(시작 < 끝, 점심은 둘 다·근무 안)면 깨끗한 새 배열', () => {
    const week = [{ ...W, extra: 1 }, W, W, W, W, SAT, null]
    const checked = checkWeek(week)
    expect(checked).toEqual(FULL)
    expect(checked?.[0]).not.toBe(week[0])
    expect(checked?.[0]).toEqual({ start: 540, end: 1080, lunchFrom: 780, lunchTo: 840 })
    expect(checkWeek([null, null, null, null, null, null, null])).toEqual([null, null, null, null, null, null, null])
    expect(checkWeek([{ start: 0, end: 1440, lunchFrom: null, lunchTo: null }, null, null, null, null, null, null])).not.toBeNull()
  })

  it('AC-7605.1: 길이·모양·10분 단위·시작 < 끝·0~1440·점심 짝·점심이 근무 밖이면 null', () => {
    const bad = (shift: unknown) => checkWeek([shift, null, null, null, null, null, null])
    expect(checkWeek(FULL.slice(0, 6))).toBeNull()
    expect(checkWeek([...FULL, null])).toBeNull()
    expect(checkWeek('월~금')).toBeNull()
    expect(checkWeek(null)).toBeNull()
    expect(bad('09-18')).toBeNull()
    expect(bad({ start: 545, end: 1080, lunchFrom: null, lunchTo: null })).toBeNull()
    expect(bad({ start: 1080, end: 540, lunchFrom: null, lunchTo: null })).toBeNull()
    expect(bad({ start: 540, end: 540, lunchFrom: null, lunchTo: null })).toBeNull()
    expect(bad({ start: -10, end: 540, lunchFrom: null, lunchTo: null })).toBeNull()
    expect(bad({ start: 540, end: 1450, lunchFrom: null, lunchTo: null })).toBeNull()
    expect(bad({ start: 540, end: 1080, lunchFrom: 780, lunchTo: null })).toBeNull()
    expect(bad({ start: 540, end: 1080, lunchFrom: 840, lunchTo: 780 })).toBeNull()
    expect(bad({ start: 540, end: 1080, lunchFrom: 500, lunchTo: 600 })).toBeNull()
    expect(bad({ start: 540, end: 1080, lunchFrom: 1020, lunchTo: 1090 })).toBeNull()
    expect(bad({ start: 540, end: 1080, lunchFrom: 785, lunchTo: 840 })).toBeNull()
    expect(bad({ start: '540', end: 1080, lunchFrom: null, lunchTo: null })).toBeNull()
    expect(bad({ start: 540, end: 1080 })).toBeNull()
  })
})

describe('nthSaturday · planOn · shiftOn — 기본 근무', () => {
  it('AC-7605.1: 그달 몇째 토요일인가 — 11-07 첫째 · 14 둘째 · 21 셋째 · 28 넷째 · 10-31 다섯째', () => {
    expect(nthSaturday('2026-11-07')).toBe(1)
    expect(nthSaturday('2026-11-14')).toBe(2)
    expect(nthSaturday('2026-11-21')).toBe(3)
    expect(nthSaturday('2026-11-28')).toBe(4)
    expect(nthSaturday('2026-10-31')).toBe(5)
  })

  it('AC-7605.1: 기본 근무 여러 판이면 그날 이전(그날 포함) 가장 늦은 시작일 판, 그 앞은 없음(null)', () => {
    const early = { start: 510, end: 1050, lunchFrom: 780, lunchTo: 840 } // 08:30~17:30
    const later = plan('kim', '2026-11-23', [early, early, early, early, early, SAT, null], 'every')
    const kimPlans = [later, PLANS[0]] // 차례가 섞여 있어도
    expect(planOn(kimPlans, '2026-11-22')).toBe(PLANS[0])
    expect(planOn(kimPlans, '2026-11-23')).toBe(later)
    expect(planOn(kimPlans, '2027-01-04')).toBe(later)
    expect(planOn(kimPlans, '2021-03-01')).toBeNull()
    expect(planOn([], '2026-11-23')).toBeNull()
    const plans = [...PLANS, later]
    expect(shiftOn({ member: KIM, plans, changes: [], day: '2026-11-20' })).toEqual(W)
    expect(shiftOn({ member: KIM, plans, changes: [], day: '2026-11-23' })).toEqual(early)
    expect(shiftOn({ member: KIM, plans, changes: [], day: '2026-11-28' })).toEqual(SAT) // 새 판은 매주
  })

  it('AC-7605.1: 요일 칸 그대로 — 월~금 근무 · 일 쉼 · 정유나 화·목 쉼, 다른 사람 판은 안 씀', () => {
    expect(on(KIM, '2026-11-16')).toEqual(W)
    expect(on(KIM, '2026-11-22')).toBeNull()
    expect(on(JUNG, '2026-11-16')).toEqual(W)
    expect(on(JUNG, '2026-11-17')).toBeNull()
    expect(on(JUNG, '2026-11-19')).toBeNull()
    expect(on(JUNG, '2026-11-20')).toEqual(W)
    expect(shiftOn({ member: HAN, plans: PLANS.filter((p) => p.staffId !== 'han'), changes: [], day: '2026-11-16' })).toBeNull()
  })

  it("AC-7605.1: 토요일 'every'는 늘, '1-3'은 첫째·셋째, '2-4'는 둘째·넷째만 — 다섯째 토요일은 쉼", () => {
    const every = member('every', '2020-01-01')
    const plans = [plan('every', '2020-01-01', FULL, 'every')]
    for (const day of ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28', '2026-10-31'])
      expect(shiftOn({ member: every, plans, changes: [], day })).toEqual(SAT)
    expect(on(KIM, '2026-11-07')).toEqual(SAT)
    expect(on(KIM, '2026-11-14')).toBeNull()
    expect(on(KIM, '2026-11-21')).toEqual(SAT)
    expect(on(KIM, '2026-11-28')).toBeNull()
    expect(on(KIM, '2026-10-31')).toBeNull()
    expect(on(LEE, '2026-11-07')).toBeNull()
    expect(on(LEE, '2026-11-14')).toEqual(SAT)
    expect(on(LEE, '2026-11-21')).toBeNull()
    expect(on(LEE, '2026-11-28')).toEqual(SAT)
    expect(on(LEE, '2026-10-31')).toBeNull()
  })

  it('AC-7605.1: 입사 전·퇴사 뒤는 쉼(바뀐 날이 있어도), 입사일·퇴사일 당일은 근무', () => {
    expect(on(HAN, '2026-01-30')).toBeNull()
    expect(on(HAN, '2026-02-02')).toEqual(W)
    expect(on(OH, '2024-05-31')).toEqual(W)
    expect(on(OH, '2024-06-03')).toBeNull()
    expect(shiftOn({ member: OH, plans: PLANS, changes: [change('oh', '2024-06-03', W)], day: '2024-06-03' })).toBeNull()
    expect(shiftOn({ member: HAN, plans: PLANS, changes: [change('han', '2026-01-30', W)], day: '2026-01-30' })).toBeNull()
  })

  it('AC-7605.1: 기본 근무 요약 줄 — 같은 근무 요일끼리, 이어진 세 요일부터 ~, 토요일 격주, 쉬는 날', () => {
    expect(weekSummary(PLANS[1])).toEqual(['월~금 09:00~18:00 (점심 13:00~14:00)', '토 09:00~13:00 격주 — 둘째·넷째 주', '일 쉬는 날'])
    expect(weekSummary(PLANS[0])).toEqual(['월~금 09:00~18:00 (점심 13:00~14:00)', '토 09:00~13:00 격주 — 첫째·셋째 주', '일 쉬는 날'])
    expect(weekSummary(PLANS[4])).toEqual(['월·수·금 09:00~18:00 (점심 13:00~14:00)', '화·목·토·일 쉬는 날'])
    expect(weekSummary(PLANS[5])).toEqual(['월~금 09:00~18:00 (점심 13:00~14:00)', '토·일 쉬는 날'])
    expect(weekSummary(plan('x', '2026-01-01', [W, W, W, W, W, W, null], 'every'))).toEqual(['월~토 09:00~18:00 (점심 13:00~14:00)', '일 쉬는 날'])
    expect(weekSummary(plan('x', '2026-01-01', [W, W, W, SAT, W, null, null], '1-3'))).toEqual([
      '월~수·금 09:00~18:00 (점심 13:00~14:00)',
      '목 09:00~13:00',
      '토·일 쉬는 날',
    ])
    expect(weekSummary(plan('x', '2026-01-01', [null, null, null, null, null, null, null], '2-4'))).toEqual(['월~일 쉬는 날'])
    expect(weekSummary(plan('x', '2026-01-01', [null, null, null, null, null, null, { start: 1320, end: 1440, lunchFrom: null, lunchTo: null }], 'every'))).toEqual([
      '월~토 쉬는 날',
      '일 22:00~24:00',
    ])
  })
})

describe('shiftOn · isChangedDay — 바뀐 날', () => {
  it('AC-7605.2: 바뀐 날 값(근무 또는 쉼)이 기본을 이긴다', () => {
    expect(on(PARK, '2026-11-19')).toEqual({ start: 600, end: 1140, lunchFrom: 780, lunchTo: 840 })
    expect(on(HAN, '2026-11-20')).toEqual({ start: 540, end: 900, lunchFrom: 780, lunchTo: 840 })
    expect(on(CHOI, '2026-11-15')).toEqual(SAT)
    expect(on(PARK, '2026-11-18')).toEqual(W) // 다른 날은 기본
    const rest = [change('kim', '2026-11-20', null)]
    expect(shiftOn({ member: KIM, plans: PLANS, changes: rest, day: '2026-11-20' })).toBeNull()
    expect(shiftOn({ member: LEE, plans: PLANS, changes: rest, day: '2026-11-20' })).toEqual(W) // 다른 사람 바뀐 날은 안 씀
  })

  it("AC-7605.2: 기본과 근무가 다르면 '바꾼 날', 메모만 있으면(근무가 같으면) 아님", () => {
    const changed = (m: typeof KIM, day: string, changes = CHANGES) => isChangedDay({ member: m, plans: PLANS, changes, day, ctx: CLINIC })
    expect(changed(PARK, '2026-11-19')).toBe(true)
    expect(changed(HAN, '2026-11-20')).toBe(true)
    expect(changed(CHOI, '2026-11-15')).toBe(true) // 휴진일(일)에 일함
    expect(changed(LEE, '2026-11-18')).toBe(false) // 메모만
    expect(changed(KIM, '2026-11-18')).toBe(false) // 바뀐 날 없음
    expect(changed(KIM, '2026-11-20', [change('kim', '2026-11-20', null)])).toBe(true) // 근무 날을 쉼으로
    expect(changed(KIM, '2026-11-22', [change('kim', '2026-11-22', null)])).toBe(false) // 쉬는 날을 쉼으로
    expect(changed(KIM, '2026-11-20', [change('kim', '2026-11-20', { ...W, lunchFrom: null, lunchTo: null })])).toBe(true) // 점심만 다름
  })
})

describe('dayKind — 휴일 날', () => {
  it('AC-7605.3: 공휴일 목록·병원 휴진일·휴진 요일 가운데 하나면 휴일 날', () => {
    expect(dayKind('2026-12-25', CLINIC)).toEqual({ holiday: true, closed: false, noHolidayList: false }) // 성탄절(금)
    expect(dayKind('2026-11-22', CLINIC)).toEqual({ holiday: false, closed: true, noHolidayList: false }) // 일요일 휴진
    expect(dayKind('2026-11-20', { hours: HOURS, closedDates: ['2026-11-20'] })).toEqual({ holiday: false, closed: true, noHolidayList: false })
    expect(dayKind('2026-11-21', CLINIC)).toEqual({ holiday: false, closed: false, noHolidayList: false })
    expect(dayKind('2027-12-27', CLINIC)).toEqual({ holiday: true, closed: false, noHolidayList: false }) // 목록 끝 해
    expect(dayKind('2025-01-01', CLINIC)).toEqual({ holiday: true, closed: false, noHolidayList: false }) // 목록 첫 해
  })

  it("AC-7605.3: 목록의 해 밖(2028년부터, 2024년까지)이면 '공휴일 목록 없음'", () => {
    expect(dayKind('2028-01-03', CLINIC)).toEqual({ holiday: false, closed: false, noHolidayList: true })
    expect(dayKind('2028-01-01', CLINIC)).toEqual({ holiday: false, closed: false, noHolidayList: true })
    expect(dayKind('2024-12-25', CLINIC)).toEqual({ holiday: false, closed: false, noHolidayList: true })
    expect(dayKind('2028-01-02', CLINIC)).toEqual({ holiday: false, closed: true, noHolidayList: true }) // 일요일
  })

  it('AC-7605.3: 휴일 날은 기본 근무가 쉼이고(ctx를 주면) 바뀐 날로 일함을 넣으면 그 근무다', () => {
    expect(on(KIM, '2026-12-25')).toEqual(W) // ctx 없이 물으면 요일 칸
    expect(on(KIM, '2026-12-25', { ctx: CLINIC })).toBeNull()
    expect(on(KIM, '2026-11-20', { ctx: { hours: HOURS, closedDates: ['2026-11-20'] } })).toBeNull()
    expect(on(KIM, '2026-11-20', { ctx: CLINIC })).toEqual(W)
    expect(on(CHOI, '2026-11-15', { ctx: CLINIC })).toEqual(SAT)
    const work = [change('kim', '2026-12-25', SAT)]
    expect(shiftOn({ member: KIM, plans: PLANS, changes: work, day: '2026-12-25', ctx: CLINIC })).toEqual(SAT)
    expect(isChangedDay({ member: KIM, plans: PLANS, changes: work, day: '2026-12-25', ctx: CLINIC })).toBe(true)
  })
})

describe('holidayPrefill — 휴일에 일함으로 바꿀 때 미리 채울 휴일 시간', () => {
  it('AC-7605.4: 근무 길이 − 점심을 30분 단위로 버린 분', () => {
    expect(holidayPrefill(SAT)).toBe(240) // 최민준 11-15 09:00~13:00 → 4시간
    expect(holidayPrefill(W)).toBe(480)
    expect(holidayPrefill({ start: 540, end: 790, lunchFrom: null, lunchTo: null })).toBe(240) // 250 → 240
    expect(holidayPrefill({ start: 550, end: 1080, lunchFrom: 780, lunchTo: 840 })).toBe(450) // 470 → 450
    expect(holidayPrefill({ start: 540, end: 560, lunchFrom: null, lunchTo: null })).toBe(0)
    expect(holidayPrefill(null)).toBe(0)
  })
})

describe('monthOvertime · fmtMinutes — 이달 더 일한 시간', () => {
  const ot = (staffId: string, day: string, kind: 'extended' | 'night' | 'holiday', minutes: number) => ({ staffId, day, kind, minutes })
  const OVERTIME = [
    ot('lee', '2026-11-18', 'extended', 120),
    ot('kim', '2026-11-10', 'night', 60),
    ot('lee', '2026-11-11', 'extended', 120),
    ot('park', '2026-11-20', 'extended', 90),
    ot('park', '2026-11-12', 'extended', 60),
    ot('choi', '2026-11-15', 'holiday', 240),
    ot('kim', '2026-10-30', 'extended', 120), // 다른 달
    ot('han', '2026-12-01', 'night', 30), // 다른 달
  ]

  it('AC-7605.5: 사람마다 연장·야간·휴일 분과 적은 날 목록(날짜 차례), 모두 합 — 보기 11월', () => {
    const sum = monthOvertime(OVERTIME, '2026-11')
    expect(sum.people.kim).toEqual({ extended: 0, night: 60, holiday: 0, total: 60, days: [{ day: '2026-11-10', kind: 'night', minutes: 60 }] })
    expect(sum.people.lee).toEqual({
      extended: 240,
      night: 0,
      holiday: 0,
      total: 240,
      days: [
        { day: '2026-11-11', kind: 'extended', minutes: 120 },
        { day: '2026-11-18', kind: 'extended', minutes: 120 },
      ],
    })
    expect(sum.people.park).toEqual({
      extended: 150,
      night: 0,
      holiday: 0,
      total: 150,
      days: [
        { day: '2026-11-12', kind: 'extended', minutes: 60 },
        { day: '2026-11-20', kind: 'extended', minutes: 90 },
      ],
    })
    expect(sum.people.choi).toEqual({ extended: 0, night: 0, holiday: 240, total: 240, days: [{ day: '2026-11-15', kind: 'holiday', minutes: 240 }] })
    expect(sum.people.jung).toBeUndefined()
    expect(sum.people.han).toBeUndefined()
    expect(Object.keys(sum.people).sort()).toEqual(['choi', 'kim', 'lee', 'park'])
    expect(sum.all).toEqual({ extended: 390, night: 60, holiday: 240, total: 690 })
  })

  it('AC-7605.5: 같은 날 여러 종류는 연장·야간·휴일 차례, 적은 것이 없으면 빈 요약', () => {
    const sum = monthOvertime([ot('kim', '2026-11-10', 'holiday', 30), ot('kim', '2026-11-10', 'extended', 60), ot('kim', '2026-11-10', 'night', 90)], '2026-11')
    expect(sum.people.kim.days.map((d) => d.kind)).toEqual(['extended', 'night', 'holiday'])
    expect(sum.people.kim.total).toBe(180)
    expect(monthOvertime([], '2026-11')).toEqual({ people: {}, all: { extended: 0, night: 0, holiday: 0, total: 0 } })
  })

  it("AC-7605.5: 시간 글은 '2시간 30분'처럼", () => {
    expect(fmtMinutes(150)).toBe('2시간 30분')
    expect(fmtMinutes(390)).toBe('6시간 30분')
    expect(fmtMinutes(690)).toBe('11시간 30분')
    expect(fmtMinutes(240)).toBe('4시간')
    expect(fmtMinutes(60)).toBe('1시간')
    expect(fmtMinutes(30)).toBe('30분')
    expect(fmtMinutes(0)).toBe('0시간')
  })
})

describe('expandLeave — 여러 날 휴가 펼치기', () => {
  const ctx = (m: typeof KIM, changes = CHANGES, closedDates: string[] = []) => ({ member: m, plans: PLANS, changes, hours: HOURS, closedDates })

  it('AC-7605.6: 보기 — 이도윤 2026-12-21(월)~12-23(수) → 3일', () => {
    expect(expandLeave({ from: '2026-12-21', to: '2026-12-23' }, ctx(LEE))).toEqual(['2026-12-21', '2026-12-22', '2026-12-23'])
  })

  it('AC-7605.6: 그 사람 근무가 있는 날만 — 공휴일(12-25)·휴진 요일(일)·휴진일·쉬는 요일·쉬는 토요일은 빠진다', () => {
    // 12월 토요일: 5·12·19·26(넷째) → 이도윤(2·4주)은 26일 일함
    expect(expandLeave({ from: '2026-12-21', to: '2026-12-27' }, ctx(LEE))).toEqual(['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-26'])
    expect(expandLeave({ from: '2026-12-21', to: '2026-12-27' }, ctx(KIM))).toEqual(['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24'])
    expect(expandLeave({ from: '2026-12-21', to: '2026-12-27' }, ctx(JUNG))).toEqual(['2026-12-21', '2026-12-23'])
    expect(expandLeave({ from: '2026-12-21', to: '2026-12-23' }, ctx(LEE, CHANGES, ['2026-12-22']))).toEqual(['2026-12-21', '2026-12-23'])
  })

  it('AC-7605.6: 바뀐 날 근무를 따르고(쉼이면 빠짐, 쉬는 요일에 일함이면 듦), 휴일 날은 일함으로 바꿔도 빠지며, 입사 전·끝이 시작보다 앞이면 없음', () => {
    const changes = [change('jung', '2026-12-22', W), change('jung', '2026-12-23', null), change('jung', '2026-12-25', W)]
    expect(expandLeave({ from: '2026-12-21', to: '2026-12-25' }, ctx(JUNG, changes))).toEqual(['2026-12-21', '2026-12-22'])
    expect(expandLeave({ from: '2026-01-29', to: '2026-02-03' }, ctx(HAN))).toEqual(['2026-02-02', '2026-02-03'])
    expect(expandLeave({ from: '2026-12-23', to: '2026-12-21' }, ctx(LEE))).toEqual([])
    expect(expandLeave({ from: '2026-12-25', to: '2026-12-25' }, ctx(LEE))).toEqual([])
  })
})

describe('workingCount — 그날 일한 사람 수', () => {
  const ctx = { members: MEMBERS, plans: PLANS, changes: CHANGES, leaves: LEAVES, hours: HOURS, closedDates: [] as string[] }

  it('AC-7605.7: 보기 11월 — 근무 있는 재직자에서 하루 휴가는 빼고 반차는 센다', () => {
    const expected: Record<string, number> = {
      '2026-11-07': 1, // 토 첫째: 김하늘(연차)·최민준
      '2026-11-13': 6, // 금: 박서연 오후 반차도 셈
      '2026-11-14': 2, // 토 둘째: 이도윤·박서연
      '2026-11-15': 1, // 일(휴진): 최민준 바뀐 날
      '2026-11-16': 6,
      '2026-11-17': 5, // 화: 정유나 쉼
      '2026-11-18': 5, // 수: 정유나 병가
      '2026-11-19': 5, // 목: 정유나 쉼
      '2026-11-20': 6,
      '2026-11-21': 2, // 토 셋째: 김하늘·최민준
      '2026-11-22': 0, // 일 휴진
      '2026-11-28': 1, // 토 넷째: 이도윤(연차)·박서연
    }
    for (const [day, n] of Object.entries(expected)) expect([day, workingCount(day, ctx)]).toEqual([day, n])
  })

  it('AC-7605.7: 퇴사자·입사 전은 세지 않고, 반차 아닌 휴가는 종류와 상관없이 빼며, 공휴일은 바뀐 날만 센다', () => {
    expect(workingCount('2024-05-31', ctx)).toBe(4) // (금) 김하늘·이도윤·최민준 + 오세린(퇴사일 당일), 정유나·박서연·한지우는 입사 전
    expect(workingCount('2024-06-03', ctx)).toBe(3) // (월) 오세린 퇴사 뒤
    const leaves = [leave('kim', '2026-11-16', 'family'), leave('lee', '2026-11-16', 'unpaid'), leave('park', '2026-11-16', 'half', 'am')]
    expect(workingCount('2026-11-16', { ...ctx, leaves })).toBe(4)
    expect(workingCount('2026-12-25', ctx)).toBe(0)
    expect(workingCount('2026-12-25', { ...ctx, changes: [change('kim', '2026-12-25', SAT)] })).toBe(1)
    expect(workingCount('2026-11-20', { ...ctx, closedDates: ['2026-11-20'] })).toBe(1) // 휴진일: 바뀐 날(09–15)이 있는 한지우만
    expect(workingCount('2026-11-20', { ...ctx, changes: [], closedDates: ['2026-11-20'] })).toBe(0)
  })
})
