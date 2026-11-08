import { describe, expect, it } from 'vitest'
import { AGE_BANDS, NO_BIRTH, type Person, type VisitLine } from '@/lib/analytics/patientMix'
import type { DoctorDay } from '@/lib/analytics/doctorStats'
import { toMonthSections, type SectionsInput } from './toMonthSections'
import { validateMonthSections } from './validate'

// 통계 탭 비트 세 칸의 달 합계(spec stats-bit-ai REQ-2901). 접수 줄·사람 표는 모두 지어낸 값이다(차트번호 대신 환자 번호만)
const FROM = '2026-09-15' // 불러온 범위 처음(9월 중간)
const TO = '2026-10-31' // 불러온 범위 끝
const TODAY = '2026-10-20' // 10월은 오늘까지만 센다

// 접수 한 건. 시각·보험·진료의 코드를 주지 않으면 오전 10시·건강보험·D1
const line = (p: number, d: string, h: number | null = 10, ins: string | null = '건강보험', doc: string | null = 'D1'): VisitLine => ({ p, d, h, ins, doc })
const person = (birth: string | null = null, area: string | null = null): Person => ({ birth, area })

function inputOf(over: Partial<SectionsInput> = {}): SectionsInput {
  return {
    months: [{ month: '2026-10', partial: true }],
    from: '2026-10-01',
    to: TO,
    today: TODAY,
    visits: [],
    people: new Map(),
    first: new Map(),
    doctors: new Map([
      ['D1', '김가상'],
      ['D2', '이가상'],
    ]),
    doctorDays: [],
    ...over,
  }
}

function only(input: SectionsInput) {
  const all = toMonthSections(input)
  expect(all).toHaveLength(1)
  return all[0]
}

// 환자 번호 from부터 n명이 day에 한 번씩 온다
const many = (from: number, n: number, day: string, make: (p: number) => VisitLine = (p) => line(p, day)) =>
  Array.from({ length: n }, (_, i) => make(from + i))

describe('AC-2901.1 달 줄마다 같은 달의 sections, 셈 기간은 그 달과 불러온 범위(오늘까지)가 겹치는 날', () => {
  it('AC-2901.1 달 줄 차례 그대로 하나씩 만들고 v·month·partial이 달 줄과 같다', () => {
    const months = [
      { month: '2026-09', partial: false },
      { month: '2026-10', partial: true },
    ]
    const all = toMonthSections(inputOf({ months, from: FROM, visits: [line(1, '2026-09-20'), line(2, '2026-10-05')] }))
    expect(all.map(({ v, month, partial }) => ({ v, month, partial }))).toEqual([
      { v: 1, month: '2026-09', partial: false },
      { v: 1, month: '2026-10', partial: true },
    ])
  })

  it('AC-2901.1 첫 달은 불러온 범위 처음부터, 끝 달은 오늘까지만 센다(실환자·접수·매출 모두)', () => {
    const visits = [
      line(1, '2026-09-10', 10, '건강보험', 'D1'), // 범위 앞
      line(2, '2026-09-15', 10, '건강보험', 'D1'), // 범위 첫날
      line(3, '2026-09-30', 10, '건강보험', 'D2'),
      line(4, '2026-10-01', 10, '건강보험', 'D1'),
      line(5, '2026-10-20', 10, '건강보험', 'D2'), // 오늘
      line(6, '2026-10-21', 10, '건강보험', 'D2'), // 오늘 뒤(범위 안이어도 세지 않는다)
    ]
    const doctorDays: DoctorDay[] = [
      { d: '2026-09-10', doc: 'D1', amount: 1_000 },
      { d: '2026-09-15', doc: 'D1', amount: 2_000 },
      { d: '2026-10-20', doc: 'D2', amount: 3_000 },
      { d: '2026-10-21', doc: 'D2', amount: 4_000 },
    ]
    const months = [
      { month: '2026-09', partial: true },
      { month: '2026-10', partial: true },
    ]
    const [september, october] = toMonthSections(inputOf({ months, from: FROM, visits, doctorDays }))
    expect(september.mix.people).toBe(2)
    expect(october.mix.people).toBe(2)
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
    expect(sum(september.hours.weekdays)).toBe(2)
    expect(sum(october.hours.weekdays)).toBe(2)
    expect(september.doctors).toEqual([
      { name: '김가상', patients: 1, newPatients: 0, amount: 2_000 },
      { name: '이가상', patients: 1, newPatients: 0, amount: 0 },
    ])
    expect(october.doctors).toEqual([
      { name: '김가상', patients: 1, newPatients: 0, amount: 0 },
      { name: '이가상', patients: 1, newPatients: 0, amount: 3_000 },
    ])
  })

  it('AC-2901.1 달 줄이 없으면 빈 목록이다', () => {
    expect(toMonthSections(inputOf({ months: [], visits: [line(1, '2026-10-05')] }))).toEqual([])
  })
})

describe('AC-2901.2 mix: 실환자·연령대 열 줄·보험·동네(5명 이상 보통 줄)', () => {
  it('AC-2901.2 연령대는 화면 차례 열 줄(0명 줄 포함)이고 나이는 그 달 셈 기간 끝날 기준, 차트번호 없는 접수는 명에 없다', () => {
    const people = new Map([
      [1, person('1986-05-05')], // 10월 20일에 만 40세 → 40대
      [2, person(null)], // 생년월일 없음
      [3, person('2020-01-01')], // 10세 미만
      [4, person('1986-10-21')], // 생일 전(10월 21일) → 만 39세 → 30대
    ])
    const s = only(inputOf({ people, visits: [line(1, '2026-10-05'), line(1, '2026-10-06'), line(2, '2026-10-05'), line(3, '2026-10-07'), line(4, '2026-10-08'), line(-1, '2026-10-08')] }))
    expect(s.mix.people).toBe(4)
    expect(s.mix.age.map((row) => row.name)).toEqual([...AGE_BANDS, NO_BIRTH])
    const ageOf = (name: string) => s.mix.age.find((row) => row.name === name)?.people
    expect([ageOf('10세 미만'), ageOf('30대'), ageOf('40대'), ageOf(NO_BIRTH), ageOf('80세 이상')]).toEqual([1, 1, 1, 1, 0])
  })

  it("AC-2901.2 보험은 5명 이상인 보통 줄만 명이 큰 차례로, 4명 줄·'보험 모름'은 넣지 않는다(차상위는 한 줄)", () => {
    const visits = [
      ...many(1, 6, '2026-10-05', (p) => line(p, '2026-10-05', 10, '건강보험')),
      ...many(11, 5, '2026-10-05', (p) => line(p, '2026-10-05', 10, '의료급여 1종')),
      ...many(21, 4, '2026-10-05', (p) => line(p, '2026-10-05', 10, '자동차보험')),
      ...many(31, 5, '2026-10-05', (p) => line(p, '2026-10-05', 10, null)), // 보험 모름 5명
      ...many(41, 3, '2026-10-05', (p) => line(p, '2026-10-05', 10, '차상위 1종')),
      ...many(51, 2, '2026-10-05', (p) => line(p, '2026-10-05', 10, '차상위 2종')),
      // 같은 사람이 두 번 오면 한 명이고 마지막 접수의 보험으로 센다(화면 [전체]와 같은 셈)
      line(1, '2026-10-06', 10, '건강보험'),
    ]
    expect(only(inputOf({ visits })).mix.insurance).toEqual([
      { name: '건강보험', people: 6 },
      { name: '의료급여 1종', people: 5 },
      { name: '차상위', people: 5 },
    ])
  })

  it("AC-2901.2 동네는 [동] 보통 줄 가운데 5명 이상만, 많아야 10줄이고 '그 밖'·'동 없는 주소'·'주소 없음'은 넣지 않는다", () => {
    const towns = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타'].map((name) => `${name}동`)
    const people = new Map<number, Person>()
    const visits: VisitLine[] = []
    let p = 0
    const add = (n: number, area: string | null) => {
      for (let i = 0; i < n; i++) {
        p += 1
        people.set(p, person('1980-01-01', area))
        visits.push(line(p, '2026-10-05'))
      }
    }
    for (const town of towns) add(5, `경기 가상시 ${town}`) // 열두 동 × 5명 → 앞 열 동만 보통 줄, 뒤 두 동은 '그 밖'
    add(4, '경기 가상시 파동') // 4명
    add(6, '경기 가상시') // 동 없는 주소
    add(7, null) // 주소 없음
    const town = only(inputOf({ people, visits })).mix.town
    expect(town).toEqual(towns.slice(0, 10).map((name) => ({ name, people: 5 })))
  })

  it('AC-2901.2 같은 이름 동이 다른 시에도 있으면 화면 이름(동 (시)) 그대로다', () => {
    const people = new Map<number, Person>()
    const visits: VisitLine[] = []
    for (let p = 1; p <= 12; p++) {
      people.set(p, person('1980-01-01', p <= 7 ? '경기 가상시 중앙동' : '경기 나무시 중앙동'))
      visits.push(line(p, '2026-10-05'))
    }
    expect(only(inputOf({ people, visits })).mix.town).toEqual([
      { name: '중앙동 (가상시)', people: 7 },
      { name: '중앙동 (나무시)', people: 5 },
    ])
  })
})

describe('AC-2901.3 hours: 요일·시간 합과 문 연 날, 접수 시각 모름', () => {
  it('AC-2901.3 월~일 문 연 날·접수 합, 8~20시 열세 칸(8시 전은 8시·21시 뒤는 20시 칸), 시각 모름 건수', () => {
    const visits = [
      line(1, '2026-10-05', 7), // 월 · 8시 칸
      line(2, '2026-10-05', 9),
      line(3, '2026-10-05', 22), // 월 · 20시 칸
      line(4, '2026-10-06', 13), // 화
      line(5, '2026-10-12', 9), // 다음 월
      line(6, '2026-10-07', null), // 수 · 시각 모름 — 이 날은 문 연 날이 아니다
    ]
    const { hours } = only(inputOf({ visits }))
    expect(hours.openDays).toEqual([2, 1, 0, 0, 0, 0, 0])
    expect(hours.weekdays).toEqual([4, 1, 0, 0, 0, 0, 0])
    expect(hours.hours).toEqual([1, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1])
    expect(hours.unknown).toBe(1)
  })
})

describe('AC-2901.4 doctors: 원장님별 줄(이름·실환자·신환·매출), single이면 []', () => {
  const doctors = new Map<string, string | null>([
    ['D1', '김가상'],
    ['D2', '이가상'],
    ['D3', null], // 이름 없음 → 화면은 코드 'D3'로 보인다
  ])

  it('AC-2901.4 화면 차례(실환자 큰 차례)로 이름·실환자·신환·매출(원 단위 정수, 환불 뺌)이고 진료의 미지정 줄도 그대로다', () => {
    const visits = [
      line(1, '2026-10-05', 10, '건강보험', 'D1'),
      line(2, '2026-10-05', 10, '건강보험', 'D1'),
      line(3, '2026-10-06', 10, '건강보험', 'D1'),
      line(4, '2026-10-05', 10, '건강보험', 'D2'),
      line(5, '2026-10-06', 10, '건강보험', 'D2'),
      line(6, '2026-10-06', 10, '건강보험', null),
    ]
    const first = new Map([
      [1, '2026-10-05'], // 김가상 신환
      [2, '2025-01-01'],
    ])
    const doctorDays: DoctorDay[] = [
      { d: '2026-10-05', doc: 'D1', amount: 100_000 },
      { d: '2026-10-06', doc: 'D1', amount: -3_000 },
      { d: '2026-10-05', doc: 'D2', amount: 50_000 },
    ]
    expect(only(inputOf({ visits, first, doctors, doctorDays })).doctors).toEqual([
      { name: '김가상', patients: 3, newPatients: 1, amount: 97_000 },
      { name: '이가상', patients: 2, newPatients: 0, amount: 50_000 },
      { name: '진료의 미지정', patients: 1, newPatients: 0, amount: 0 },
    ])
  })

  it('AC-2901.4·AC-2901.7 이름이 없어 화면이 코드로 보이는 원장님 줄은 넣지 않는다(코드는 서버로 가지 않는다)', () => {
    const visits = [line(1, '2026-10-05', 10, '건강보험', 'D1'), line(2, '2026-10-05', 10, '건강보험', 'D3'), line(3, '2026-10-05', 10, '건강보험', 'D3')]
    const s = only(inputOf({ visits, doctors, doctorDays: [{ d: '2026-10-05', doc: 'D3', amount: 10_000 }] }))
    expect(s.doctors).toEqual([{ name: '김가상', patients: 1, newPatients: 0, amount: 0 }])
    expect(JSON.stringify(s)).not.toContain('D3')
  })

  it('AC-2901.4 원장님이 한 분(진료의 미지정 빼고)이라 화면이 표를 그리지 않으면 []', () => {
    const visits = [line(1, '2026-10-05', 10, '건강보험', 'D1'), line(2, '2026-10-05', 10, '건강보험', null)]
    expect(only(inputOf({ visits, doctorDays: [{ d: '2026-10-05', doc: 'D1', amount: 10_000 }] })).doctors).toEqual([])
  })
})

describe('AC-2901.5 이름 검사(isText)를 못 넘거나 겹치는 이름의 줄은 넣지 않는다', () => {
  const phone = () => ['010', '1234', '5678'].join('-')

  it('AC-2901.5 연락처 모양 보험 이름·원장님 이름의 줄은 빠지고 나머지는 그대로다', () => {
    const visits = [
      ...many(1, 5, '2026-10-05', (p) => line(p, '2026-10-05', 10, `문의 ${phone()}`, 'D1')),
      ...many(11, 5, '2026-10-05', (p) => line(p, '2026-10-05', 10, '건강보험', 'D2')),
      line(21, '2026-10-05', 10, '건강보험', 'D4'),
    ]
    const doctors = new Map<string, string | null>([
      ['D1', '김가상'],
      ['D2', '이가상'],
      ['D4', `연락 ${phone()}`],
    ])
    const s = only(inputOf({ visits, doctors }))
    expect(s.mix.insurance).toEqual([{ name: '건강보험', people: 6 }])
    expect(s.doctors.map((row) => row.name)).toEqual(['김가상', '이가상'])
    expect(JSON.stringify(s)).not.toContain(phone())
  })

  it('AC-2901.5 같은 이름의 원장님 줄이 둘이면 그 이름 줄은 모두 넣지 않는다(지표 ID가 겹치지 않게)', () => {
    const visits = [line(1, '2026-10-05', 10, '건강보험', 'D1'), line(2, '2026-10-05', 10, '건강보험', 'D2'), line(3, '2026-10-05', 10, '건강보험', 'D5')]
    const doctors = new Map<string, string | null>([
      ['D1', '김가상'],
      ['D2', '이가상'],
      ['D5', '김가상'],
    ])
    expect(only(inputOf({ visits, doctors })).doctors).toEqual([{ name: '이가상', patients: 1, newPatients: 0, amount: 0 }])
  })
})

describe('AC-2901.7 만든 sections에는 묶음 이름과 수뿐이다', () => {
  it('AC-2901.7 JSON에 생년월일·주소 앞부분·진료의 코드·환자 번호 열쇠·접수 줄이 없고 정해진 열쇠만 있다', () => {
    const people = new Map<number, Person>()
    const visits: VisitLine[] = []
    for (let p = 1; p <= 6; p++) {
      people.set(p, person('1975-03-04', '경기 가상시 다구 매화동'))
      visits.push(line(p, '2026-10-05', 9, '건강보험', p % 2 === 0 ? 'D1' : 'D2'))
    }
    const s = only(inputOf({ people, visits, doctorDays: [{ d: '2026-10-05', doc: 'D1', amount: 5_000 }] }))
    const json = JSON.stringify(s)
    for (const word of ['1975-03-04', '19750304', '가상시 다구', '경기', '"D1"', '"D2"', '2026-10-05']) expect(json).not.toContain(word)
    const keys = new Set<string>()
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value !== null && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key)
          walk(inner)
        }
      }
    }
    walk(s)
    expect([...keys].sort()).toEqual(
      ['age', 'amount', 'doctors', 'hours', 'insurance', 'mix', 'month', 'name', 'newPatients', 'openDays', 'partial', 'patients', 'people', 'town', 'unknown', 'v', 'weekdays'].sort(),
    )
    expect(s.mix.town).toEqual([{ name: '매화동', people: 6 }])
  })

  it('AC-2901.7 만든 sections는 저장 검사(validateMonthSections)를 넘고 검사 결과가 같은 값이다', () => {
    const months = [
      { month: '2026-09', partial: false },
      { month: '2026-10', partial: true },
    ]
    const visits = [
      ...many(1, 7, '2026-09-21', (p) => line(p, '2026-09-21', 6 + p, p % 3 === 0 ? '의료급여 1종' : '건강보험', p % 2 === 0 ? 'D1' : 'D2')),
      ...many(1, 9, '2026-10-06', (p) => line(p, '2026-10-06', 11 + p, '건강보험', p % 2 === 0 ? 'D1' : null)),
      line(-1, '2026-10-07', null, null, null),
    ]
    const all = toMonthSections(inputOf({ months, from: FROM, visits, doctorDays: [{ d: '2026-09-21', doc: 'D2', amount: 7_777 }] }))
    expect(all).toHaveLength(2)
    for (const s of all) expect(validateMonthSections(s)).toStrictEqual(s)
  })
})
