import { describe, expect, it } from 'vitest'
import { canPurge, employedIn, keepUntil, splitActive, tenure, upcoming } from './roster'

// 명단 알림·근속·보관 (staff REQ-7607). 보기 자료(지어낸 사람)는 시안 list.html 그대로 — 오늘 2026-11-21(토).

const TODAY = '2026-11-21'

const person = (id: string, hiredOn: string, birthday: string | null, leftOn: string | null = null) => ({ id, hiredOn, leftOn, birthday })
const CHOI = person('choi', '2019-11-25', '1990-02-11') // 최민준 — 입사 7주년 11-25(수)
const KIM = person('kim', '2021-03-02', '1994-08-30') // 김하늘
const LEE = person('lee', '2023-07-17', '1996-04-12') // 이도윤
const JUNG = person('jung', '2024-09-02', '1999-11-24') // 정유나 — 생일 11-24(화)
const PARK = person('park', '2025-01-06', '1998-01-20') // 박서연
const HAN = person('han', '2026-02-02', null) // 한지우 — 생일 안 적음
const OH = person('oh', '2020-03-02', '1992-11-23', '2024-05-31') // 오세린 퇴사 — 생일이 7일 안이어도 알림 없음
const MOON = person('moon', '2018-04-02', '1988-11-22', '2022-12-31') // 문태호 퇴사
const ALL = [KIM, HAN, OH, LEE, CHOI, MOON, JUNG, PARK]

describe('upcoming — 앞으로 7일 알림', () => {
  it('AC-7607.1: 보기 — 정유나 생일 11-24(화), 최민준 입사 7주년 11-25(수), 날짜 차례', () => {
    expect(upcoming(ALL, TODAY)).toEqual([
      { day: '2026-11-24', staffId: 'jung', kind: 'birthday' },
      { day: '2026-11-25', staffId: 'choi', kind: 'anniversary', years: 7 },
    ])
  })

  it('AC-7607.1: 오늘~오늘+6일만(양 끝 포함), 퇴사자는 없음, 생일이 없거나 틀리면 생일 알림 없음', () => {
    expect(upcoming([person('a', '2020-05-01', '2000-11-21'), person('b', '2020-05-01', '2000-11-27'), person('c', '2020-05-01', '2000-11-28'), person('d', '2020-05-01', '2000-11-20')], TODAY)).toEqual([
      { day: '2026-11-21', staffId: 'a', kind: 'birthday' },
      { day: '2026-11-27', staffId: 'b', kind: 'birthday' },
    ])
    expect(upcoming([person('x', '2020-05-01', '2000-13-01'), person('y', '2020-05-01', null)], TODAY)).toEqual([])
    expect(upcoming([person('z', '2020-05-01', '2000-11-22', '2026-11-20')], TODAY)).toEqual([]) // 어제 퇴사
    expect(upcoming([person('w', '2020-05-01', '2000-11-22', '2026-11-21')], TODAY)).toEqual([{ day: '2026-11-22', staffId: 'w', kind: 'birthday' }]) // 오늘 퇴사 = 재직
  })

  it('AC-7607.1: 입사 기념일은 1주년부터 — 입사한 날·입사 전 날은 알림 없음', () => {
    expect(upcoming([person('n', '2026-11-23', null)], TODAY)).toEqual([])
    expect(upcoming([person('n', '2025-11-23', null)], TODAY)).toEqual([{ day: '2026-11-23', staffId: 'n', kind: 'anniversary', years: 1 }])
    expect(upcoming([person('n', '2026-11-21', null)], TODAY)).toEqual([])
  })

  it('AC-7607.1: 해를 넘는 7일(12-28~01-03)과 같은 날 여럿 — 날짜 차례, 같은 날은 생일 먼저', () => {
    const a = person('a', '2020-01-02', '1990-12-30')
    const b = person('b', '2019-12-30', '1991-01-02')
    expect(upcoming([a, b], '2026-12-28')).toEqual([
      { day: '2026-12-30', staffId: 'a', kind: 'birthday' },
      { day: '2026-12-30', staffId: 'b', kind: 'anniversary', years: 7 },
      { day: '2027-01-02', staffId: 'b', kind: 'birthday' },
      { day: '2027-01-02', staffId: 'a', kind: 'anniversary', years: 7 },
    ])
  })

  it('AC-7607.1: 2월 29일 생일·입사일은 평년에 2월 28일, 윤년에 2월 29일', () => {
    const leap = person('leap', '2024-02-29', '2000-02-29')
    expect(upcoming([leap], '2027-02-25')).toEqual([
      { day: '2027-02-28', staffId: 'leap', kind: 'birthday' },
      { day: '2027-02-28', staffId: 'leap', kind: 'anniversary', years: 3 },
    ])
    expect(upcoming([leap], '2028-02-25')).toEqual([
      { day: '2028-02-29', staffId: 'leap', kind: 'birthday' },
      { day: '2028-02-29', staffId: 'leap', kind: 'anniversary', years: 4 },
    ])
  })
})

describe('tenure — 근속', () => {
  it("AC-7607.2: 보기 — 오늘까지 '{n}년 {m}개월', 1년 미만은 '{m}개월'", () => {
    expect(tenure(CHOI.hiredOn, TODAY)).toBe('6년 11개월')
    expect(tenure(KIM.hiredOn, TODAY)).toBe('5년 8개월')
    expect(tenure(LEE.hiredOn, TODAY)).toBe('3년 4개월')
    expect(tenure(JUNG.hiredOn, TODAY)).toBe('2년 2개월')
    expect(tenure(PARK.hiredOn, TODAY)).toBe('1년 10개월')
    expect(tenure(HAN.hiredOn, TODAY)).toBe('9개월')
  })

  it('AC-7607.2: 다 찬 달만 센다 — 기념일 당일·앞날, 입사 한 달 안, 말일 입사, 입사 전', () => {
    expect(tenure('2019-11-25', '2026-11-25')).toBe('7년 0개월')
    expect(tenure('2019-11-25', '2026-11-24')).toBe('6년 11개월')
    expect(tenure('2026-11-02', TODAY)).toBe('0개월')
    expect(tenure('2026-01-31', '2026-02-28')).toBe('1개월')
    expect(tenure('2026-01-31', '2026-02-27')).toBe('0개월')
    expect(tenure('2026-11-23', TODAY)).toBe('0개월')
  })
})

describe('keepUntil · canPurge · splitActive · employedIn — 재직·퇴사·보관', () => {
  it('AC-7607.3: 보기 — 오세린 2027-05-31까지 보관, 문태호 지울 때', () => {
    expect(keepUntil(OH.leftOn as string)).toBe('2027-05-31')
    expect(canPurge(OH, TODAY)).toBe(false)
    expect(keepUntil(MOON.leftOn as string)).toBe('2025-12-31')
    expect(canPurge(MOON, TODAY)).toBe(true)
  })

  it("AC-7607.3: 보관 끝 = 퇴사일 + 3년, 오늘이 그 뒤일 때만 '지울 때' — 재직자는 아님", () => {
    expect(canPurge(OH, '2027-05-31')).toBe(false)
    expect(canPurge(OH, '2027-06-01')).toBe(true)
    expect(keepUntil('2024-02-29')).toBe('2027-02-28')
    expect(canPurge(KIM, '2099-01-01')).toBe(false)
    expect(canPurge(person('f', '2020-01-01', null, '2026-12-31'), TODAY)).toBe(false)
  })

  it('AC-7607.3: 퇴사일이 없거나 오늘(포함) 이후면 재직 — 재직은 입사일 빠른 차례, 퇴사는 퇴사일 늦은 차례', () => {
    const leavesToday = person('t', '2022-05-01', null, TODAY)
    const leftYesterday = person('y', '2017-05-01', null, '2026-11-20')
    const { active, left } = splitActive([...ALL, leavesToday, leftYesterday], TODAY)
    expect(active.map((m) => m.id)).toEqual(['choi', 'kim', 't', 'lee', 'jung', 'park', 'han'])
    expect(left.map((m) => m.id)).toEqual(['y', 'oh', 'moon'])
    expect(active[0]).toBe(CHOI)
    expect(splitActive([], TODAY)).toEqual({ active: [], left: [] })
  })

  it('AC-7607.3: 그달 재직 — 입사일 ≤ 달 끝, 퇴사일 없음 또는 ≥ 달 첫날', () => {
    expect(employedIn(HAN, '2026-02')).toBe(true)
    expect(employedIn(HAN, '2026-01')).toBe(false)
    expect(employedIn(person('e', '2026-11-30', null), '2026-11')).toBe(true)
    expect(employedIn(person('e', '2026-12-01', null), '2026-11')).toBe(false)
    expect(employedIn(OH, '2024-05')).toBe(true)
    expect(employedIn(OH, '2024-06')).toBe(false)
    expect(employedIn(person('e', '2020-01-01', null, '2026-11-01'), '2026-11')).toBe(true)
    expect(employedIn(person('e', '2020-01-01', null, '2026-10-31'), '2026-11')).toBe(false)
    expect(employedIn(KIM, '2026-11')).toBe(true)
  })
})
