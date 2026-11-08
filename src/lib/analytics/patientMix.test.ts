import { describe, expect, it } from 'vitest'
import type { MixRow, PatientMix } from '@/types/stats'
import {
  AGE_BANDS,
  ageBand,
  formatPatientMix,
  insuranceName,
  mixBar,
  mixDelta,
  mixShareText,
  patientMix,
  type MixInput,
  type Person,
  type VisitLine,
} from './patientMix'

// 접수 줄·사람 표는 모두 지어낸 값이다. p = 메모리 번호(차트번호 없으면 -1), 날짜는 YYYY-MM-DD, h = 접수 시
const FROM = '2026-11-01'
const TO = '2026-11-30'
const DAY = '2026-11-10'

const visit = (p: number, d: string, ins: string | null = '건강보험', h: number | null = 10): VisitLine => ({ p, d, h, ins, doc: 'D1' })
const person = (birth: string | null, area: string | null = null): Person => ({ birth, area })

function input(visits: VisitLine[], people: [number, Person][], first: [number, string][] = [], over: Partial<MixInput> = {}): MixInput {
  return { from: FROM, to: TO, visits, people: new Map(people), first: new Map(first), ...over }
}

// 사람마다 접수 한 건(같은 날)
function onePerPerson(people: [number, Person][]): MixInput {
  return input(people.map(([p]) => visit(p, DAY)), people)
}

const labels = (rows: MixRow[]) => rows.map((row) => row.label)
const counts = (rows: MixRow[]) => rows.map((row) => [row.label, row.people, row.visits])
const kinds = (rows: MixRow[]) => rows.map((row) => row.kind)
const total = (rows: MixRow[], key: 'people' | 'visits') => rows.reduce((sum, row) => sum + row[key], 0)
const rowOf = (rows: MixRow[], label: string) => {
  const found = rows.find((row) => row.label === label)
  if (!found) throw new Error(`줄이 없어요: ${label}`)
  return found
}

describe('AC-2703.1 연령대: 고른 기간 마지막 날의 만 나이', () => {
  it.each<[string | null, string, string]>([
    ['2016-11-30', '2026-11-30', '10대'], // 생일 당일이면 10세
    ['2016-12-01', '2026-11-30', '10세 미만'], // 생일 전날이면 아직 9세
    ['2026-11-30', '2026-11-30', '10세 미만'], // 0세
    ['1997-11-30', '2026-11-30', '20대'],
    ['1996-12-01', '2026-11-30', '20대'], // 29세
    ['1996-11-30', '2026-11-30', '30대'],
    ['1946-11-30', '2026-11-30', '80세 이상'],
    ['1946-12-01', '2026-11-30', '70대'],
    ['2000-02-29', '2010-02-28', '10세 미만'], // 윤일생: 2월 28일엔 아직 9세
    ['2000-02-29', '2010-03-01', '10대'],
    ['1906-11-30', '2026-11-30', '80세 이상'], // 120세까지는 나이로 본다
    ['1905-11-30', '2026-11-30', '생년월일 없음'], // 121세
    ['2026-12-01', '2026-11-30', '생년월일 없음'], // 0 미만
    [null, '2026-11-30', '생년월일 없음'],
  ])('AC-2703.1: 생년월일 %s · 기준일 %s → %s', (birth, day, band) => {
    expect(ageBand(birth, day)).toBe(band)
  })

  it('AC-2703.1: 묶음은 이 차례로 늘 열 줄이다(0명 줄도)', () => {
    expect(AGE_BANDS).toEqual(['10세 미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80세 이상'])
    const mix = patientMix(onePerPerson([[1, person('1990-05-05')]]), 'all')
    expect(labels(mix.age)).toEqual([...AGE_BANDS, '생년월일 없음'])
    expect(counts(mix.age).filter(([, people]) => people === 0)).toHaveLength(9)
    expect(rowOf(mix.age, '30대').people).toBe(1)
    expect(kinds(mix.age)).toEqual([...AGE_BANDS.map(() => 'row'), 'none'])
  })

  it('AC-2703.1: 나이는 접수한 날이 아니라 고른 기간 마지막 날 기준이다', () => {
    const people: [number, Person][] = [[1, person('1996-11-20')]]
    const visits = [visit(1, '2026-11-05')]
    expect(rowOf(patientMix(input(visits, people), 'all').age, '30대').people).toBe(1) // 11월 30일에 30세
    const shortRange = patientMix(input(visits, people, [], { to: '2026-11-10' }), 'all')
    expect(rowOf(shortRange.age, '20대').people).toBe(1) // 11월 10일엔 29세
  })
})

describe('AC-2703.2 [전체]: 명은 환자마다 한 번, 건은 접수마다', () => {
  it('AC-2703.2: 명의 보험은 기간 안 마지막 접수(날·시각이 가장 늦은 것)의 보험이고 건은 접수마다 그 보험이다', () => {
    const mix = patientMix(
      input(
        [
          visit(1, '2026-11-01', '자동차보험', 9),
          visit(1, '2026-11-03', '산재보험', 15),
          visit(1, '2026-11-03', '건강보험', 10), // 같은 날 더 이른 시각이라 마지막이 아니다
          visit(2, '2026-11-02', '건강보험'),
        ],
        [
          [1, person('1980-05-05')],
          [2, person('1990-01-01')],
        ],
      ),
      'all',
    )
    expect(mix.total).toEqual({ people: 2, visits: 4 })
    expect(counts(mix.insurance)).toEqual([
      ['건강보험', 1, 2],
      ['산재보험', 1, 1],
      ['자동차보험', 0, 1],
    ])
  })

  it('AC-2703.2: 같은 날 시각을 모르는 접수는 시각 있는 접수보다 앞으로 보고, 같은 날·같은 시면 뒤 줄이 마지막이다', () => {
    const people: [number, Person][] = [
      [1, person('1980-05-05')],
      [2, person('1980-05-05')],
    ]
    const mix = patientMix(
      input(
        [
          visit(1, DAY, '일반', 9),
          visit(1, DAY, '산재보험', null),
          visit(2, DAY, '일반', 11),
          visit(2, DAY, '자동차보험', 11),
        ],
        people,
      ),
      'all',
    )
    expect(rowOf(mix.insurance, '일반').people).toBe(1)
    expect(rowOf(mix.insurance, '자동차보험').people).toBe(1)
    expect(rowOf(mix.insurance, '산재보험').people).toBe(0)
  })

  it('AC-2703.2: 차트번호 없는 접수는 건에만 들고 생년월일 없음·주소 없음이며 보험은 그 접수의 것이다', () => {
    const mix = patientMix(input([visit(1, DAY), visit(-1, DAY, '의료급여 1종')], [[1, person('1980-05-05', '경기 수원시 영통구 매탄동')]]), 'all')
    expect(mix.total).toEqual({ people: 1, visits: 2 })
    expect(counts([rowOf(mix.age, '생년월일 없음')])).toEqual([['생년월일 없음', 0, 1]])
    expect(counts([rowOf(mix.insurance, '의료급여 1종')])).toEqual([['의료급여 1종', 0, 1]])
    expect(counts([rowOf(mix.city, '주소 없음')])).toEqual([['주소 없음', 0, 1]]) // 0명이어도 건이 있으면 남긴다(건 합 = 접수 건수)
    expect(counts([rowOf(mix.town, '주소 없음')])).toEqual([['주소 없음', 0, 1]])
  })

  it('AC-2703.2: 기간 밖 접수는 세지 않는다', () => {
    const mix = patientMix(input([visit(1, '2026-10-31'), visit(1, DAY), visit(2, '2026-12-01')], [[1, person(null)], [2, person(null)]]), 'all')
    expect(mix.total).toEqual({ people: 1, visits: 1 })
  })

  it('AC-2703.2: 네 묶음 모두 명 합 = 기간 실환자, 건 합 = 기간 접수 건수다(그 밖·동 없는 주소·주소 없음 줄 포함)', () => {
    const towns = ['가람동', '나래동', '다솜동', '라온동', '마루동', '바다동', '사랑동', '아라동', '자람동', '차오동', '카라동', '타래동']
    const people: [number, Person][] = towns.map((town, i) => [i + 1, person(`19${50 + i * 4}-03-0${(i % 9) + 1}`, `경기 수원시 영통구 ${town}`)])
    people.push([20, person(null, '경기 수원시 영통구 매영로')], [21, person('2001-01-01', null)])
    const visits = [
      ...people.map(([p], i) => visit(p, DAY, i % 3 === 0 ? '자동차보험' : '건강보험')),
      visit(3, '2026-11-20', '일반'),
      visit(-1, DAY, null),
    ]
    const mix = patientMix(input(visits, people), 'all')
    expect(mix.total).toEqual({ people: 14, visits: 16 })
    for (const rows of [mix.age, mix.insurance, mix.city, mix.town]) {
      expect(total(rows, 'people')).toBe(14)
      expect(total(rows, 'visits')).toBe(16)
    }
  })
})

describe('AC-2703.3 [신환]: 첫 내원일이 고른 기간 안인 환자와 그 환자들의 기간 안 접수만', () => {
  it('AC-2703.3: 첫 내원일이 기간 안(첫날·끝날 포함)인 환자만, 차트번호 없는 접수·첫 내원일 모르는 환자는 빼고 센다', () => {
    const people: [number, Person][] = [1, 2, 3, 4, 5].map((p) => [p, person('1980-05-05')])
    const mix = patientMix(
      input(
        [
          visit(1, '2026-11-02'),
          visit(1, '2026-11-09'),
          visit(2, '2026-11-03'), // 옛 환자
          visit(3, '2026-11-04'), // 첫 내원일 모름
          visit(-1, '2026-11-05'),
          visit(4, FROM), // 첫날 신환
          visit(5, TO), // 끝날 신환
        ],
        people,
        [
          [1, '2026-11-02'],
          [2, '2025-03-01'],
          [4, FROM],
          [5, TO],
        ],
      ),
      'new',
    )
    expect(mix.total).toEqual({ people: 3, visits: 4 })
    expect(rowOf(mix.age, '40대')).toMatchObject({ people: 3, visits: 4 })
    expect(rowOf(mix.age, '생년월일 없음')).toMatchObject({ people: 0, visits: 0 })
  })
})

describe('AC-2703.4 보험 묶기와 줄 차례', () => {
  it.each<[string | null, string]>([
    ['차상위 1종', '차상위'],
    ['차상위 2종', '차상위'],
    ['  차상위계층 ', '차상위'],
    [' 의료급여 2종 ', '의료급여 2종'],
    ['건강보험', '건강보험'],
    [null, '보험 모름'],
    ['', '보험 모름'],
    ['   ', '보험 모름'],
  ])('AC-2703.4: 보험 이름 %j → %s', (name, label) => {
    expect(insuranceName(name)).toBe(label)
  })

  it('AC-2703.4: 보험은 명이 큰 차례(같으면 이름 차례)로 모두 보이고 연령대는 나이 차례 그대로다', () => {
    const rows: [number, string, string | null][] = [
      [1, '1940-01-01', '차상위 1종'],
      [2, '1940-01-01', '차상위 2종'],
      [3, '1940-01-01', ' 건강보험 '],
      [4, '1940-01-01', '건강보험'],
      [5, '1940-01-01', null],
      [6, '1940-01-01', '  '],
      [7, '1990-01-01', '일반'],
      [8, '1990-01-01', '건강보험'],
    ]
    const mix = patientMix(
      input(
        rows.map(([p, , ins]) => visit(p, DAY, ins)),
        rows.map(([p, birth]) => [p, person(birth)]),
      ),
      'all',
    )
    expect(counts(mix.insurance)).toEqual([
      ['건강보험', 3, 3],
      ['보험 모름', 2, 2],
      ['차상위', 2, 2],
      ['일반', 1, 1],
    ])
    expect(kinds(mix.insurance)).toEqual(['row', 'row', 'row', 'row'])
    expect(labels(mix.age)).toEqual([...AGE_BANDS, '생년월일 없음']) // 80세 이상이 가장 많아도 차례는 그대로
    expect(rowOf(mix.age, '80세 이상').people).toBe(6)
  })
})

// 주소 앞부분(도우미가 보낸 앞 낱말 다섯 개까지). 지역 이름 뒤 숫자는 지어낸 값이다
const AREA_PEOPLE: [number, Person][] = [
  [1, person(null, '경기 수원시 영통구 매탄동')],
  [2, person(null, '경기도 수원시 영통구 매탄동')], // 도 이름이 달라도 같은 구
  [3, person(null, '수원시 영통구 영통동')], // 도 이름이 없어도 같은 구
  [4, person(null, '경기 수원시 권선구 권선동')],
  [5, person(null, '경기 용인시 기흥구 구갈동')],
  [6, person(null, '경기 용인시 기흥구 구갈동')],
  [7, person(null, '경기 화성시 봉담읍 와우리')],
  [8, person(null, '서울특별시 강남구 역삼동')], // 특별시는 도 자리라 시·군은 강남구
  [9, person(null, null)],
  [10, person(null, '매탄로')], // 시·군이 없음
  [11, person(null, '경기')],
]

describe('AC-2703.5 동네 [구·시]', () => {
  it('AC-2703.5: 1위 시 안의 구는 구 이름만, 다른 시의 구는 시 이름을 붙이고, 구 없는 시·군은 그 이름, 시·군이 없으면 주소 없음', () => {
    const mix = patientMix(onePerPerson(AREA_PEOPLE), 'all')
    expect(counts(mix.city)).toEqual([
      ['영통구', 3, 3],
      ['용인시 기흥구', 2, 2],
      ['강남구', 1, 1],
      ['권선구', 1, 1],
      ['화성시', 1, 1],
      ['주소 없음', 3, 3],
    ])
    expect(kinds(mix.city)).toEqual(['row', 'row', 'row', 'row', 'row', 'none'])
  })

  it('AC-2703.5: 1위 시는 명이 가장 많은 시다(구를 모두 더해서)', () => {
    const people: [number, Person][] = [
      [1, person(null, '경기 수원시 영통구 매탄동')],
      [2, person(null, '경기 수원시 영통구 매탄동')],
      [3, person(null, '경기 용인시 기흥구 구갈동')],
      [4, person(null, '경기 용인시 수지구 풍덕천동')],
      [5, person(null, '경기 용인시 처인구 김량장동')],
    ]
    expect(labels(patientMix(onePerPerson(people), 'all').city)).toEqual(['수원시 영통구', '기흥구', '수지구', '처인구'])
  })
})

describe('AC-2703.6 동네 [동]', () => {
  it('AC-2703.6: 이름은 동·읍·면이고, 도로명 주소는 동 없는 주소, 시·군이 없으면 주소 없음', () => {
    const people: [number, Person][] = [...AREA_PEOPLE, [12, person(null, '경기 수원시 영통구 매영로')]]
    const mix = patientMix(onePerPerson(people), 'all')
    expect(counts(mix.town)).toEqual([
      ['구갈동', 2, 2],
      ['매탄동', 2, 2],
      ['권선동', 1, 1],
      ['봉담읍', 1, 1],
      ['역삼동', 1, 1],
      ['영통동', 1, 1],
      ['동 없는 주소', 1, 1],
      ['주소 없음', 3, 3],
    ])
    expect(kinds(mix.town)).toEqual(['row', 'row', 'row', 'row', 'row', 'row', 'noTown', 'none'])
    expect(rowOf(mix.city, '영통구').people).toBe(4) // 도로명 주소도 구까지는 센다
  })

  it('AC-2703.6: 같은 동 이름이 다른 [구·시] 묶음에도 있으면 [구·시] 화면 이름을 괄호로 붙인다', () => {
    const people: [number, Person][] = [
      [1, person(null, '경기 수원시 팔달구 중앙동')],
      [2, person(null, '경기 수원시 팔달구 중앙동')],
      [3, person(null, '경기 안산시 단원구 중앙동')],
      [4, person(null, '경기 수원시 영통구 매탄동')],
    ]
    expect(labels(patientMix(onePerPerson(people), 'all').town)).toEqual(['중앙동 (팔달구)', '매탄동', '중앙동 (안산시 단원구)'])
  })
})

describe('AC-2703.7 동네 줄 고르기', () => {
  const TOWNS = ['가람동', '나래동', '다솜동', '라온동', '마루동', '바다동', '사랑동', '아라동', '자람동', '차오동', '카라동', '타래동']
  // 가람동 12명, 나래동 11명 … 타래동 1명
  function manyTowns(extra: [number, Person][] = []): MixInput {
    const people: [number, Person][] = []
    TOWNS.forEach((town, i) => {
      for (let n = 0; n < TOWNS.length - i; n++) people.push([people.length + 1, person(null, `경기 수원시 영통구 ${town}`)])
    })
    return onePerPerson([...people, ...extra])
  }

  it('AC-2703.7: 명이 큰 차례로 열 줄까지, 나머지는 그 밖 N곳 한 줄(명·건 합), 그 뒤 동 없는 주소·주소 없음', () => {
    const mix = patientMix(manyTowns([
      [500, person(null, '경기 수원시 영통구 매영로')],
      [501, person(null, null)],
    ]), 'all')
    expect(counts(mix.town)).toEqual([
      ...TOWNS.slice(0, 10).map((town, i) => [town, 12 - i, 12 - i]),
      ['그 밖 2곳', 3, 3],
      ['동 없는 주소', 1, 1],
      ['주소 없음', 1, 1],
    ])
    expect(kinds(mix.town).slice(10)).toEqual(['rest', 'noTown', 'none'])
  })

  it('AC-2703.7: 그 밖·동 없는 주소·주소 없음 줄은 0명이면 없다', () => {
    const mix = patientMix(onePerPerson([[1, person(null, '경기 수원시 영통구 매탄동')]]), 'all')
    expect(labels(mix.town)).toEqual(['매탄동'])
    expect(labels(mix.city)).toEqual(['영통구'])
  })

  it('AC-2703.7: 명이 같으면 화면 이름 차례다', () => {
    const people: [number, Person][] = [
      [1, person(null, '경기 수원시 영통구 영통동')],
      [2, person(null, '경기 수원시 영통구 매탄동')],
      [3, person(null, '경기 수원시 영통구 원천동')],
    ]
    expect(labels(patientMix(onePerPerson(people), 'all').town)).toEqual(['매탄동', '영통동', '원천동'])
  })
})

describe('AC-2703.8 비율과 막대', () => {
  it.each<[number, string]>([
    [0, '0%'],
    [0.004, '1% 미만'],
    [0.0099, '1% 미만'],
    [0.01, '1%'],
    [29 / 200, '15%'], // 14.5% → 반올림 15%
    [1 / 3, '33%'],
    [0.995, '100%'],
    [1, '100%'],
  ])('AC-2703.8: 비율 %d → %s', (share, text) => {
    expect(mixShareText(share)).toBe(text)
  })

  it('AC-2703.8: 비율은 그 줄 명 ÷ 묶음 전체 명이다', () => {
    const people: [number, Person][] = [
      [1, person('1990-01-01')],
      [2, person('1990-01-01')],
      [3, person('1980-01-01')],
      [4, person(null)],
    ]
    const mix = patientMix(onePerPerson(people), 'all')
    expect(rowOf(mix.age, '30대').share).toBe(0.5)
    expect(rowOf(mix.age, '40대').share).toBe(0.25)
    expect(rowOf(mix.age, '10대').share).toBe(0)
  })

  it('AC-2703.8: 막대 길이는 그 묶음에서 가장 큰 보통 줄 명에 견주고 100을 넘지 않는다', () => {
    const row = (people: number, kind: MixRow['kind'] = 'row'): MixRow => ({ label: `줄${people}`, people, visits: people, share: 0, kind, previous: null })
    const rows = [row(80), row(20), row(200, 'rest'), row(0, 'none')]
    expect(rows.map((r) => mixBar(r, rows))).toEqual([100, 25, 100, 0])
    expect(mixBar(row(0), [row(0)])).toBe(0)
  })
})

describe('AC-2703.9 지난 기간과 견주기', () => {
  const row = (people: number, previous: number | null, kind: MixRow['kind'] = 'row'): MixRow => ({
    label: '가',
    people,
    visits: people,
    share: 0,
    kind,
    previous,
  })

  it.each<[number, number, ReturnType<typeof mixDelta>]>([
    [110, 100, { dir: 'up', text: '10%', srText: '늘어남' }],
    [90, 100, { dir: 'down', text: '10%', srText: '줄어듦' }],
    [3, 8, { dir: 'down', text: '63%', srText: '줄어듦' }], // −62.5% → 크기를 반올림
    [100, 100, { dir: 'flat', text: '0%', srText: '변화 없음' }],
    [1001, 1000, { dir: 'flat', text: '0%', srText: '변화 없음' }], // 0.1% → 0%
    [5, 0, { dir: 'none', text: '새로', srText: '지난 기간에 없던 줄' }],
    [0, 0, { dir: 'none', text: '–', srText: '변화 없음' }],
    [0, 4, { dir: 'down', text: '100%', srText: '줄어듦' }],
  ])('AC-2703.9: 이번 %d명 · 지난 %d명', (people, previous, expected) => {
    expect(mixDelta(row(people, previous))).toEqual(expected)
  })

  it('AC-2703.9: 지난 숫자가 없거나 생년월일 없음·그 밖·동 없는 주소·주소 없음 줄이면 증감이 없다', () => {
    expect(mixDelta(row(5, null))).toBeNull()
    for (const kind of ['rest', 'noTown', 'none'] as const) expect(mixDelta(row(5, 3, kind))).toBeNull()
  })

  it('AC-2703.9: 견줄 기간이 있으면 같은 묶음 열쇠의 지난 명을 채운다(화면 이름이 달라져도)', () => {
    const people: [number, Person][] = [
      [1, person('1990-01-01', '경기 수원시 팔달구 중앙동')],
      [2, person('1990-01-01', '경기 안산시 단원구 중앙동')],
      [3, person('1990-01-01', '경기 수원시 팔달구 중앙동')],
      [4, person('1950-01-01', '경기 수원시 영통구 매탄동')],
    ]
    const visits = [
      visit(1, '2026-10-05', '자동차보험'),
      visit(3, '2026-10-06'),
      visit(4, '2026-10-07'), // 지난 기간: 중앙동(팔달구) 2명 · 매탄동 1명 · 70대 1명
      visit(1, DAY),
      visit(2, DAY), // 이번 기간: 중앙동 둘(괄호), 매탄동 0명
    ]
    const mix = patientMix(input(visits, people, [], { previous: { from: '2026-10-01', to: '2026-10-31' } }), 'all')
    expect(mix.compared).toBe(true)
    expect(rowOf(mix.town, '중앙동 (팔달구)').previous).toBe(2)
    expect(rowOf(mix.town, '중앙동 (안산시 단원구)').previous).toBe(0)
    expect(rowOf(mix.city, '팔달구').previous).toBe(2)
    expect(rowOf(mix.insurance, '건강보험').previous).toBe(2)
    expect(rowOf(mix.age, '30대').previous).toBe(2)
    expect(rowOf(mix.age, '70대').previous).toBe(1)
    expect(rowOf(mix.age, '70대').people).toBe(0)
    expect(rowOf(mix.age, '생년월일 없음').previous).toBeNull()
  })

  it('AC-2703.9: [신환]이면 지난 기간도 그 기간의 신환만 센다', () => {
    const people: [number, Person][] = [
      [1, person('1990-01-01')],
      [2, person('1990-01-01')],
    ]
    const visits = [visit(1, '2026-10-05'), visit(2, '2026-10-06'), visit(1, DAY)]
    const first: [number, string][] = [
      [1, '2026-10-05'],
      [2, '2020-01-01'],
    ]
    const mix = patientMix(input(visits, people, first, { previous: { from: '2026-10-01', to: '2026-10-31' } }), 'new')
    expect(mix.total.people).toBe(0) // 1번은 지난 기간의 신환이다
    expect(rowOf(mix.age, '30대').previous).toBe(1)
  })

  it('AC-2703.9: 견줄 기간이 없으면 지난 명은 모두 null이다', () => {
    const mix = patientMix(onePerPerson([[1, person('1990-01-01', '경기 수원시 영통구 매탄동')]]), 'all')
    expect(mix.compared).toBe(false)
    for (const rows of [mix.age, mix.insurance, mix.city, mix.town]) expect(rows.every((r) => r.previous === null)).toBe(true)
  })
})

describe('AC-2707.1 환자 구성 표 복사 글', () => {
  function smallMix(): PatientMix {
    const people: [number, Person][] = [
      [1, person('1990-01-01', '경기 수원시 영통구 매탄동')],
      [2, person('1990-01-01', '경기 수원시 영통구 매탄동')],
      [3, person('1950-01-01', '경기 화성시 봉담읍 와우리')],
    ]
    return patientMix(input([visit(1, DAY), visit(1, '2026-11-20'), visit(2, DAY, '자동차보험'), visit(3, DAY)], people), 'all')
  }

  it('AC-2707.1: 첫 줄·빈 줄·묶음마다 머리 줄과 이름 TAB N명 TAB N건 TAB P%를 화면 차례로(묶음 사이 빈 줄)', () => {
    const text = formatPatientMix('가상정형외과', '최근 30일', 'all', 'city', smallMix())
    expect(text.split('\n')).toEqual([
      '가상정형외과 환자 구성 (최근 30일, 전체)',
      '',
      '연령대',
      '10세 미만\t0명\t0건\t0%',
      '10대\t0명\t0건\t0%',
      '20대\t0명\t0건\t0%',
      '30대\t2명\t3건\t67%',
      '40대\t0명\t0건\t0%',
      '50대\t0명\t0건\t0%',
      '60대\t0명\t0건\t0%',
      '70대\t1명\t1건\t33%',
      '80세 이상\t0명\t0건\t0%',
      '생년월일 없음\t0명\t0건\t0%',
      '',
      '보험',
      '건강보험\t2명\t3건\t67%',
      '자동차보험\t1명\t1건\t33%',
      '',
      '동네(구·시)',
      '영통구\t2명\t3건\t67%',
      '화성시\t1명\t1건\t33%',
    ])
  })

  it('AC-2707.1: [신환]·[동]이면 첫 줄과 동네 머리 줄이 바뀌고 동 줄이 간다. 숫자는 천 단위 쉼표, 1% 미만도 그대로', () => {
    const people: [number, Person][] = Array.from({ length: 1200 }, (_, i) => [i + 1, person('1990-01-01', '경기 수원시 영통구 매탄동')])
    people.push([5000, person('1990-01-01', '경기 화성시 봉담읍 와우리')])
    const first: [number, string][] = people.map(([p]) => [p, DAY])
    const mix = patientMix(input(people.map(([p]) => visit(p, DAY)), people, first), 'new')
    const lines = formatPatientMix('가상정형외과', '11월 1일 ~ 11월 30일', 'new', 'town', mix).split('\n')
    expect(lines[0]).toBe('가상정형외과 환자 구성 (11월 1일 ~ 11월 30일, 신환)')
    expect(lines.slice(-3)).toEqual(['동네(동)', '매탄동\t1,200명\t1,200건\t100%', '봉담읍\t1명\t1건\t1% 미만'])
  })
})
