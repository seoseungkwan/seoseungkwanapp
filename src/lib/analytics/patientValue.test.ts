import { describe, expect, it } from 'vitest'
import type { RxGroupDef } from '@/types/analysis'
import { patientValue, type ValueDay, type ValuePay, type ValueRow } from './patientValue'

// 신환 1명당 매출 (stats-insights REQ-6106 AC-6106.3). 환자 번호·날·처방 코드·금액은 모두 지어낸 값이다.
// 메모리 기간 1/1~6/30, 자료 끝 날 6/30 → 대상 = 첫 내원일이 1/1~4/2(4/2 + 89일 = 6/30)인 환자. 90일 = 첫 내원일 ~ 첫 내원일 + 89일
const RANGE = { from: '2026-01-01', to: '2026-06-30' }

const MANUAL: RxGroupDef = { id: 'g-manual', codes: ['MAN1', 'man2'] }
const SHOCK: RxGroupDef = { id: 'g-shock', codes: ['ESW'], out: ['XOUT'] }
const INJECTION: RxGroupDef = { id: 'g-injection', codes: ['INJ'] }
const PT: RxGroupDef = { id: 'g-pt', codes: ['PT1'] }
const GROUPS = [MANUAL, SHOCK, INJECTION, PT]

const day = (patient: number, date: string): ValueDay => ({ patient, date })
const rx = (patient: number, date: string, rxCode: string): ValueRow => ({ patient, date, rxCode })
const pay = (p: number, d: string, amount: number): ValuePay => ({ p, d, amount })

// 1번: 첫 내원 1/1(기간 첫날). 1/1 진료만 · 1/15 도수 · 3/31(90일째) 충격파. 4/1(91일째)은 90일 밖. 금액 3만 · 5만 · 4만 (4/1 99,999는 밖)
// 2번: 첫 내원 4/2(+89일 = 자료 끝 날, 대상). 4/2 진료 · 6/30 충격파 + 빼는 처방(충격파 아님). 금액 2만 · −5천(환불이 더 큼)
// 3번: 첫 내원 4/3 → 90일이 다 안 지나 뺌 · 4번: 첫 내원 2025-12-31(기간 앞) → 뺌 · 5번: 첫 내원일 없음(신환 아님) → 뺌
// 6번: 첫 내원 2/1. 그 앞 1/20에도 왔다(90일 앞이라 내원·금액 모두 안 셈). 2/1 진료 · 2/10 도수(내원했는데 금액 줄은 없음) · 3/1 내원 없이 수납 3
const DAYS: ValueDay[] = [
  day(1, '2026-01-01'),
  day(1, '2026-01-15'),
  day(1, '2026-03-31'),
  day(1, '2026-04-01'),
  day(2, '2026-04-02'),
  day(2, '2026-06-30'),
  day(3, '2026-04-03'),
  day(4, '2026-01-02'),
  day(5, '2026-02-01'),
  day(6, '2026-01-20'),
  day(6, '2026-02-01'),
  day(6, '2026-02-10'),
]
const ROWS: ValueRow[] = [
  rx(1, '2026-01-01', 'AA157'),
  rx(1, '2026-01-15', 'MAN1'),
  rx(1, '2026-03-31', 'ESW'),
  rx(1, '2026-04-01', 'INJ'),
  rx(2, '2026-04-02', 'AA157'),
  rx(2, '2026-06-30', 'ESW'),
  rx(2, '2026-06-30', 'XOUT'),
  rx(3, '2026-04-03', 'MAN1'),
  rx(4, '2026-01-02', 'MAN1'),
  rx(5, '2026-02-01', 'MAN1'),
  rx(6, '2026-01-20', 'INJ'),
  rx(6, '2026-02-10', 'MAN1'),
]
const PAYS: ValuePay[] = [
  pay(1, '2026-01-01', 30_000),
  pay(1, '2026-01-15', 50_000),
  pay(1, '2026-03-31', 40_000),
  pay(1, '2026-04-01', 99_999),
  pay(2, '2026-04-02', 20_000),
  pay(2, '2026-06-30', -5_000),
  pay(3, '2026-04-03', 1_000_000),
  pay(4, '2026-01-02', 1_000_000),
  pay(5, '2026-02-01', 777_777),
  pay(6, '2026-01-20', 8_888),
  pay(6, '2026-02-01', 10_001),
  pay(6, '2026-03-01', 3),
]
const FIRST = new Map<number, string>([
  [1, '2026-01-01'],
  [2, '2026-04-02'],
  [3, '2026-04-03'],
  [4, '2025-12-31'],
  [6, '2026-02-01'],
])

type Input = Parameters<typeof patientValue>[0]
const run = (over: Partial<Input> = {}) => patientValue({ days: DAYS, rows: ROWS, pays: PAYS, first: FIRST, groups: GROUPS, range: RANGE, ...over })

// 같은 치료를 받은 사람 count명(번호 start부터): 첫 내원 1/5, 그날 codes를 받고 amount를 냄(내원 1회)
function people(start: number, count: number, codes: readonly string[], amount: number): Pick<Input, 'days' | 'rows' | 'pays' | 'first'> {
  const patients = Array.from({ length: count }, (_, i) => start + i)
  return {
    days: patients.map((p) => day(p, '2026-01-05')),
    rows: patients.flatMap((p) => (codes.length === 0 ? [rx(p, '2026-01-05', 'AA157')] : codes.map((code) => rx(p, '2026-01-05', code)))),
    pays: patients.map((p) => pay(p, '2026-01-05', amount)),
    first: new Map(patients.map((p) => [p, '2026-01-05'])),
  }
}
function together(...parts: ReturnType<typeof people>[]): Partial<Input> {
  return {
    days: parts.flatMap((part) => part.days),
    rows: parts.flatMap((part) => part.rows),
    pays: parts.flatMap((part) => part.pays),
    first: new Map(parts.flatMap((part) => [...part.first])),
  }
}

describe('AC-6106.3 patientValue: 처음 온 날부터 90일 동안의 신환 1명당 매출', () => {
  it('AC-6106.3: 대상 = 첫 내원일이 기간 안이고 첫 내원일 + 89일이 자료 끝 날보다 앞이거나 같은 환자, 값 = 그 90일 금액 합, 내원 = 그 90일 내원한 날 수', () => {
    // 대상 1·2·6번. 금액 12만 + 1만 5천 + 1만 4 = 145,004원, 내원 3 + 2 + 2 = 7날
    expect(run()).toEqual({
      n: 3,
      average: 48_334, // 145,004 ÷ 3 = 48,334.67 → 원 미만 버림
      times: 2.3, // 7 ÷ 3 = 2.33
      perVisit: 20_714, // 145,004 ÷ 7 = 20,714.86 → 버림
      lines: [{ groups: null, n: 3, average: 48_334 }], // 조합마다 5명이 안 돼 모두 '그 밖'
    })
  })

  it('AC-6106.3: 90일의 첫날·끝날을 넣고(첫 내원일 + 89일까지) 그 앞·뒤 금액·내원은 넣지 않는다', () => {
    const only = (p: number) => ({
      days: DAYS.filter((x) => x.patient === p),
      rows: ROWS.filter((x) => x.patient === p),
      pays: PAYS.filter((x) => x.p === p),
      first: new Map([[p, FIRST.get(p)!]]),
    })
    expect(run(only(1))).toMatchObject({ n: 1, average: 120_000, times: 3, perVisit: 40_000 })
    expect(run(only(6))).toMatchObject({ n: 1, average: 10_004, times: 2, perVisit: 5_002 })
  })

  it('AC-6106.3: 금액은 음수(환불이 더 큰 날)도 그대로 더하고, 평균이 음수여도 원 미만은 0 쪽으로 버린다', () => {
    const refund = { days: [day(2, '2026-04-02')], rows: [], pays: [pay(2, '2026-04-02', -10_001)], first: new Map([[2, '2026-04-02']]) }
    expect(run({ ...refund, days: [...refund.days, day(7, '2026-04-02')], first: new Map([...refund.first, [7, '2026-04-02']]) })).toMatchObject({
      n: 2,
      average: -5_000, // −10,001 ÷ 2 = −5,000.5
      perVisit: -5_000,
    })
  })

  it('AC-6106.3: 1명당 내원 횟수는 소수 1자리(8 ÷ 3 = 2.67 → 2.6, 버림), 내원은 같은 날 여러 줄이어도 하루다', () => {
    // 1번 6날(1/2는 두 줄) + 2번 1날 + 3번 1날 = 8날
    const many = [day(1, '2026-01-01'), day(1, '2026-01-02'), day(1, '2026-01-02'), ...['03', '04', '05', '06'].map((d) => day(1, `2026-01-${d}`))]
    const first = new Map([
      [1, '2026-01-01'],
      [2, '2026-01-01'],
      [3, '2026-01-01'],
    ])
    const result = run({ days: [...many, day(2, '2026-01-01'), day(3, '2026-01-01')], rows: [], pays: [], first })
    expect(result).toMatchObject({ n: 3, times: 2.6, average: 0, perVisit: 0 })
  })

  it('AC-6106.3: 받은 치료 = 그 90일에 받은 묶음들(빼는 처방 규칙 그대로) — 없으면 진료만([]), 묶음 열쇠는 불러올 때 실은 묶음 차례', () => {
    const shown = run(
      together(
        people(100, 5, [], 60_000), // 진료만
        people(200, 5, ['ESW', 'MAN1'], 900_000), // 도수 + 충격파(줄 차례와 상관없이 묶음 차례)
        people(300, 5, ['ESW', 'XOUT'], 70_000), // 충격파 + 빼는 처방 → 진료만
      ),
    ).lines
    expect(shown).toEqual([
      { groups: [], n: 10, average: 65_000 },
      { groups: [MANUAL.id, SHOCK.id], n: 5, average: 900_000 },
    ])
  })

  it('AC-6106.3: 인원 5명 이상인 조합 가운데 인원 많은 5개만 남기고 나머지(6번째·5명 미만)는 그 밖 한 줄, 평균이 작은 순이고 그 밖은 맨 끝', () => {
    const { lines } = run(
      together(
        people(100, 10, ['PT1'], 140_000),
        people(200, 9, [], 60_000),
        people(300, 8, ['MAN1'], 600_000),
        people(400, 7, ['MAN1', 'ESW'], 900_000),
        people(500, 6, ['ESW'], 380_000),
        people(600, 5, ['INJ'], 200_000), // 6번째 → 그 밖
        people(700, 2, ['ESW', 'INJ'], 500_000), // 5명 미만 → 그 밖
      ),
    )
    expect(lines).toEqual([
      { groups: [], n: 9, average: 60_000 },
      { groups: [PT.id], n: 10, average: 140_000 },
      { groups: [SHOCK.id], n: 6, average: 380_000 },
      { groups: [MANUAL.id], n: 8, average: 600_000 },
      { groups: [MANUAL.id, SHOCK.id], n: 7, average: 900_000 },
      { groups: null, n: 7, average: 285_714 }, // (5 × 20만 + 2 × 50만) ÷ 7 = 285,714.3
    ])
  })

  it('AC-6106.3: 인원이 같으면 묶음 차례로 앞선 조합이 먼저 남는다(진료만이 맨 앞), 그 밖이 없으면 그 밖 줄도 없다', () => {
    const { lines } = run(
      together(
        people(100, 5, ['PT1'], 1_000),
        people(200, 5, ['INJ'], 2_000),
        people(300, 5, ['ESW'], 3_000),
        people(400, 5, ['MAN1'], 4_000),
        people(500, 5, [], 5_000),
        people(600, 5, ['MAN1', 'PT1'], 6_000),
      ),
    )
    // 남는 5개 = 진료만 · 도수 · 도수 + 물리치료 · 충격파 · 주사, 물리치료(묶음 차례 맨 뒤)만 그 밖
    expect(lines.map((line) => line.groups)).toEqual([[INJECTION.id], [SHOCK.id], [MANUAL.id], [], [MANUAL.id, PT.id], null])
    expect(lines.at(-1)).toEqual({ groups: null, n: 5, average: 1_000 })
    expect(run(together(people(100, 5, [], 1_000))).lines).toEqual([{ groups: [], n: 5, average: 1_000 }])
  })

  it('AC-6106.3: 묶음을 싣지 않았으면 모두 진료만이다', () => {
    expect(run({ ...together(people(100, 6, ['MAN1'], 10_000)), groups: [] }).lines).toEqual([{ groups: [], n: 6, average: 10_000 }])
  })

  it('AC-6106.3: 대상이 없으면 n 0·숫자 0·빈 줄이고, 결과에는 묶음 열쇠와 숫자뿐 환자 번호가 없다', () => {
    expect(run({ first: new Map([[3, '2026-04-03']]) })).toEqual({ n: 0, average: 0, times: 0, perVisit: 0, lines: [] })
    expect(run({ days: [], rows: [], pays: [], first: new Map() })).toEqual({ n: 0, average: 0, times: 0, perVisit: 0, lines: [] })
    const result = run(together(people(100, 5, ['MAN1'], 10_000), people(200, 1, [], 1)))
    expect(Object.keys(result).sort()).toEqual(['average', 'lines', 'n', 'perVisit', 'times'])
    for (const line of result.lines) {
      expect(Object.keys(line).sort()).toEqual(['average', 'groups', 'n'])
      expect((line.groups ?? []).every((group) => GROUPS.some((def) => def.id === group))).toBe(true)
    }
  })
})
