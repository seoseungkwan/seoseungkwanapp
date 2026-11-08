import { describe, expect, it } from 'vitest'
import type { DoctorRow, DoctorsView } from '@/types/stats'
import { NO_DOCTOR, doctorShareText, doctorStats, formatDoctors, type DoctorDay, type DoctorInput } from './doctorStats'

// 접수 줄·금액·원장님 이름은 모두 지어낸 값이다. p = 메모리 번호(차트번호 없으면 -1)
const FROM = '2026-11-01'
const TO = '2026-11-30'
const at = (p: number, d: string, doc: string | null) => ({ p, d, doc })
const money = (d: string, doc: string, amount: number): DoctorDay => ({ d, doc, amount })

function input(over: Partial<DoctorInput>): DoctorInput {
  return { from: FROM, to: TO, visits: [], first: new Map(), doctors: new Map(), doctorDays: [], ...over }
}

function tableOf(view: DoctorsView) {
  if (view.kind !== 'table') throw new Error('표가 아니에요')
  return view
}

// 원장님 셋(김가상 D1 · 이름 없는 D2 · 매출만 있는 박가상 D3)과 진료의 없는 접수
const CLINIC = input({
  visits: [
    at(1, '2026-11-02', 'D1'), // 1번 첫 내원 → D1 신환
    at(1, '2026-11-09', 'D1'),
    at(2, '2026-11-03', 'D1'), // 2번은 첫 내원이 D2에게 받은 날이라 D1 신환이 아니다
    at(2, '2026-11-05', 'D2'),
    at(3, '2026-11-06', 'D2'), // 옛 환자
    at(4, '2026-11-07', 'D2'), // D2 신환
    at(-1, '2026-11-04', 'D1'), // 차트번호 없는 접수도 내원에 든다
    at(5, '2026-11-08', null), // 진료의 미지정
    at(1, '2026-10-30', 'D1'), // 기간 밖
  ],
  first: new Map([
    [1, '2026-11-02'],
    [2, '2026-11-05'],
    [3, '2025-01-01'],
    [4, '2026-11-07'],
  ]),
  doctors: new Map([
    ['D1', '김가상'],
    ['D2', null],
    ['D3', '박가상'],
  ]),
  doctorDays: [
    money('2026-11-02', 'D1', 100_000),
    money('2026-11-03', 'D1', 50_001),
    money('2026-11-05', 'D2', 70_000),
    money('2026-11-06', 'D2', -5_000), // 환불도 그대로 더한다
    money('2026-11-04', 'D3', 30_000),
    money('2026-10-31', 'D1', 99_999), // 기간 밖
  ],
})

const pick = (row: DoctorRow) => [row.label, row.patients, row.newPatients, row.visits, row.amount, row.perVisit]

describe('AC-2705.1 진료의마다 실환자·신환·내원', () => {
  it('AC-2705.1: 실환자 = 서로 다른 환자, 신환 = 첫 내원일이 그 진료의 접수 날 중 하루, 내원 = 접수 건수(차트번호 없는 접수 포함), 진료의 없는 접수는 진료의 미지정', () => {
    const { rows } = tableOf(doctorStats(CLINIC))
    expect(rows.map((row) => [row.label, row.patients, row.newPatients, row.visits])).toEqual([
      ['D2', 3, 2, 3],
      ['김가상', 2, 1, 4],
      [NO_DOCTOR, 1, 0, 1],
      ['박가상', 0, 0, 0],
    ])
    expect(NO_DOCTOR).toBe('진료의 미지정')
  })
})

describe('AC-2705.2 매출과 비중', () => {
  it('AC-2705.2: 매출은 기간 안 수납일 줄의 총진료비 합이고 비중은 진료의 매출 ÷ 합계 매출이다', () => {
    const { rows, total } = tableOf(doctorStats(CLINIC))
    expect(rows.map((row) => [row.label, row.amount])).toEqual([
      ['D2', 65_000],
      ['김가상', 150_001],
      [NO_DOCTOR, 0],
      ['박가상', 30_000],
    ])
    expect(total.amount).toBe(245_001)
    expect(rows[0].share).toBeCloseTo(65_000 / 245_001, 12)
    expect(rows.map((row) => doctorShareText(row.share))).toEqual(['26.5%', '61.2%', '0.0%', '12.2%'])
  })

  it.each<[number | null, string]>([
    [null, '–'],
    [0, '0.0%'],
    [1 / 3, '33.3%'],
    [2 / 3, '66.7%'],
    [0.5485, '54.9%'],
    [1, '100.0%'],
  ])('AC-2705.2: 비중 %d → %s', (share, text) => {
    expect(doctorShareText(share)).toBe(text)
  })

  it('AC-2705.2: 합계 매출이 0이면 비중은 없다(–)', () => {
    const view = tableOf(
      doctorStats(input({ visits: [at(1, '2026-11-02', 'D1'), at(2, '2026-11-02', 'D2')], doctors: new Map([['D1', '김가상'], ['D2', '이가상']]) })),
    )
    expect(view.rows.every((row) => row.share === null)).toBe(true)
    expect(view.total.share).toBeNull()
  })
})

describe('AC-2705.3 진료의 이름과 줄 차례', () => {
  it('AC-2705.3: 이름은 doctors의 이름, 없으면 코드, 코드도 없으면 진료의 미지정. 실환자가 큰 차례(같으면 이름 차례), 매출만 있는 진료의도 줄이 있다', () => {
    const view = tableOf(
      doctorStats(
        input({
          visits: [at(1, '2026-11-02', 'D9'), at(2, '2026-11-02', 'D1'), at(3, '2026-11-02', null)],
          doctors: new Map([
            ['D1', '이가상'],
            ['D9', ''],
            ['D4', '김가상'],
          ]),
          doctorDays: [money('2026-11-02', 'D4', 1_000)],
        }),
      ),
    )
    expect(view.rows.map(pick)).toEqual([
      ['D9', 1, 0, 1, 0, 0],
      ['이가상', 1, 0, 1, 0, 0],
      [NO_DOCTOR, 1, 0, 1, 0, 0],
      ['김가상', 0, 0, 0, 1_000, null],
    ])
  })
})

describe('AC-2705.4 합계 줄', () => {
  it('AC-2705.4: 실환자·신환은 기간 전체의 서로 다른 환자(두 진료의에게 받은 분은 한 번), 내원·매출은 줄의 합', () => {
    const { rows, total } = tableOf(doctorStats(CLINIC))
    expect(pick(total)).toEqual(['합계', 5, 3, 8, 245_001, 30_625])
    expect(rows.reduce((sum, row) => sum + row.patients, 0)).toBe(6) // 2번 환자가 두 줄에 든다
    expect(total.share).toBe(1)
  })
})

describe('AC-2705.5 진료의가 하나 이하', () => {
  it.each<[string, Partial<DoctorInput>, DoctorsView['kind']]>([
    ['접수·매출 모두 한 분', { visits: [at(1, '2026-11-02', 'D1')], doctorDays: [money('2026-11-02', 'D1', 1_000)] }, 'single'],
    ['한 분 + 진료의 없는 접수', { visits: [at(1, '2026-11-02', 'D1'), at(2, '2026-11-02', null)] }, 'single'],
    ['접수도 매출도 없음', {}, 'single'],
    ['다른 분의 매출이 기간 밖', { visits: [at(1, '2026-11-02', 'D1')], doctorDays: [money('2026-10-31', 'D2', 1_000)] }, 'single'],
    ['접수는 한 분, 매출은 다른 분', { visits: [at(1, '2026-11-02', 'D1')], doctorDays: [money('2026-11-02', 'D2', 1_000)] }, 'table'],
    ['접수만 두 분', { visits: [at(1, '2026-11-02', 'D1'), at(2, '2026-11-02', 'D2')] }, 'table'],
  ])('AC-2705.5: %s → %s', (_name, over, kind) => {
    expect(doctorStats(input(over)).kind).toBe(kind)
  })
})

describe('AC-2705.6 1인당 진료비', () => {
  it('AC-2705.6: 매출 ÷ 내원 건수의 원 미만을 버리고 내원이 0이면 없다. 합계 줄은 합계 매출 ÷ 합계 내원', () => {
    const { rows, total } = tableOf(doctorStats(CLINIC))
    expect(rows.map((row) => row.perVisit)).toEqual([21_666, 37_500, 0, null]) // 65,000 ÷ 3 = 21,666.6… · 150,001 ÷ 4 = 37,500.25
    expect(total.perVisit).toBe(30_625) // 245,001 ÷ 8 = 30,625.125
  })

  it('AC-2705.6: 환불로 매출이 음수여도 원 미만만 버린다(0 쪽으로)', () => {
    const { rows } = tableOf(
      doctorStats(
        input({
          visits: [at(1, '2026-11-02', 'D1'), at(2, '2026-11-02', 'D1'), at(3, '2026-11-02', 'D2'), at(4, '2026-11-02', 'D2')],
          doctors: new Map([
            ['D1', '김가상'],
            ['D2', '이가상'],
          ]),
          doctorDays: [money('2026-11-02', 'D1', 1_001), money('2026-11-02', 'D2', -1_001)],
        }),
      ),
    )
    expect(rows.map((row) => [row.label, row.perVisit])).toEqual([
      ['김가상', 500],
      ['이가상', -500],
    ])
  })
})

describe('AC-2707.2 원장님별 표 복사 글', () => {
  it('AC-2707.2: 첫 줄·빈 줄·머리 줄, 줄마다 같은 칸(천 단위 쉼표, 단위 글자 없음), 마지막 합계 줄', () => {
    const text = formatDoctors('가상정형외과', '최근 30일', tableOf(doctorStats(CLINIC)))
    expect(text.split('\n')).toEqual([
      '가상정형외과 원장님별 (최근 30일)',
      '',
      '원장님\t실환자\t신환\t내원\t매출\t1인당 진료비\t비중',
      'D2\t3\t2\t3\t65,000\t21,666\t26.5%',
      '김가상\t2\t1\t4\t150,001\t37,500\t61.2%',
      '진료의 미지정\t1\t0\t1\t0\t0\t0.0%',
      '박가상\t0\t0\t0\t30,000\t–\t12.2%',
      '합계\t5\t3\t8\t245,001\t30,625\t100%',
    ])
  })

  it('AC-2707.2: 합계 매출이 0이면 비중 칸은 –다', () => {
    const view = tableOf(
      doctorStats(input({ visits: [at(1, '2026-11-02', 'D1'), at(2, '2026-11-02', 'D2')], doctors: new Map([['D1', '김가상'], ['D2', '이가상']]) })),
    )
    const lines = formatDoctors('가상정형외과', '최근 7일', view).split('\n')
    expect(lines.slice(3)).toEqual(['김가상\t1\t0\t1\t0\t0\t–', '이가상\t1\t0\t1\t0\t0\t–', '합계\t2\t0\t2\t0\t0\t–'])
  })
})
