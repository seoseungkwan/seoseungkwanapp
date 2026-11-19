import { describe, expect, it } from 'vitest'
import type { RxGroupDef } from '@/types/analysis'
import { monthValues, periodValue, type ValueDay, type ValuePay, type ValueRow } from './patientValue'

// 신환 1명당 매출 = 그 달 신환이 그 달에 낸 돈 (bit-total REQ-6911 AC-6911.1·AC-6911.2). 환자 번호·날·처방 코드·금액은 모두 지어낸 값이다.
// 메모리 기간 1/1~3/18(자료 끝 날 3/18) → 달 줄 = 1월(1/1~1/31) · 2월(2/1~2/28) · 3월(3/1~3/18). 대상 = 그 달 신환 날 표시가 있는 접수 줄의 환자
const RANGE = { from: '2026-01-01', to: '2026-03-18' }

const MANUAL: RxGroupDef = { id: 'g-manual', codes: ['MAN1', 'man2'] }
const SHOCK: RxGroupDef = { id: 'g-shock', codes: ['ESW'], out: ['XOUT'] }
const INJECTION: RxGroupDef = { id: 'g-injection', codes: ['INJ'] }
const PT: RxGroupDef = { id: 'g-pt', codes: ['PT1'] }
const GROUPS = [MANUAL, SHOCK, INJECTION, PT]

const day = (patient: number, date: string, firstVisit = false): ValueDay => ({ patient, date, firstVisit })
const rx = (patient: number, date: string, rxCode: string): ValueRow => ({ patient, date, rxCode })
const pay = (p: number, d: string, amount: number): ValuePay => ({ p, d, amount })

// 1번: 1/1(달 첫날) 신환 표시 · 1/15 · 1/31(달 말일) 내원, 1/25는 내원 없이 수납 3원. 2/1에도 왔지만 2월엔 표시가 없다(2월 대상 아님, 1월에도 안 셈)
// 2번: 2/10 · 3/2 두 달에 신환 표시. 2월 2/10 · 2/20(환불이 더 큼) · 3월 3/2 · 3/18(자료 끝 날). 3/19 금액은 자료 끝 날 뒤라 밖
// 3번: 2월 안 두 날(2/3 · 2/17)에 신환 표시 → 2월 한 명. 1/20 내원(표시 없음)은 다른 달이라 안 셈
// 4번: 2월 내원인데 신환 표시 없음(재진) → 대상 아님 · 5번: 2/28(2월 말일) 신환 표시, 3/1 금액은 다른 달이라 안 셈
// 7번: 3/19 신환 표시 → 자료 끝 날 뒤라 3월 대상 아님
const DAYS: ValueDay[] = [
  day(1, '2026-01-01', true),
  day(1, '2026-01-15'),
  day(1, '2026-01-31'),
  day(1, '2026-02-01'),
  day(2, '2026-02-10', true),
  day(2, '2026-02-20'),
  day(2, '2026-03-02', true),
  day(2, '2026-03-18'),
  day(3, '2026-01-20'),
  day(3, '2026-02-03', true),
  day(3, '2026-02-17', true),
  day(4, '2026-02-05'),
  day(5, '2026-02-28', true),
  day(7, '2026-03-19', true),
]
const ROWS: ValueRow[] = [
  rx(1, '2026-01-01', 'AA157'),
  rx(1, '2026-01-15', 'MAN1'),
  rx(1, '2026-01-31', 'ESW'),
  rx(1, '2026-02-01', 'INJ'),
  rx(2, '2026-02-10', 'AA157'),
  rx(2, '2026-02-20', 'MAN1'),
  rx(2, '2026-03-02', 'INJ'),
  rx(3, '2026-01-20', 'PT1'),
  rx(3, '2026-02-03', 'AA157'),
  rx(4, '2026-02-05', 'MAN1'),
  rx(5, '2026-02-28', 'ESW'),
  rx(5, '2026-02-28', 'XOUT'),
]
const PAYS: ValuePay[] = [
  pay(1, '2026-01-01', 30_000),
  pay(1, '2026-01-15', 50_000),
  pay(1, '2026-01-25', 3),
  pay(1, '2026-01-31', 40_000),
  pay(1, '2026-02-01', 99_999),
  pay(2, '2026-02-10', 20_000),
  pay(2, '2026-02-20', -5_000),
  pay(2, '2026-03-02', 15_000),
  pay(2, '2026-03-18', 7_000),
  pay(2, '2026-03-19', 1_000_000),
  pay(3, '2026-01-20', 8_888),
  pay(3, '2026-02-03', 10_000),
  pay(3, '2026-02-17', 10_000),
  pay(4, '2026-02-05', 777_777),
  pay(5, '2026-02-28', 12_345),
  pay(5, '2026-03-01', 50_000),
  pay(7, '2026-03-19', 300_000),
]

type Input = Parameters<typeof monthValues>[0]
const run = (over: Partial<Input> = {}) => monthValues({ days: DAYS, rows: ROWS, pays: PAYS, groups: GROUPS, range: RANGE, ...over })
const monthIn = (over: Partial<Input>, month: string) => run(over).find((row) => row.month === month)

// 같은 치료를 받은 사람 count명(번호 start부터): ymd에 신환 표시, 그날 codes를 받고 amount를 냄(내원 1회)
type Part = Pick<Input, 'days' | 'rows' | 'pays'>
function people(start: number, count: number, codes: readonly string[], amount: number, ymd = '2026-01-05'): Part {
  const patients = Array.from({ length: count }, (_, i) => start + i)
  return {
    days: patients.map((p) => day(p, ymd, true)),
    rows: patients.flatMap((p) => (codes.length === 0 ? [rx(p, ymd, 'AA157')] : codes.map((code) => rx(p, ymd, code)))),
    pays: patients.map((p) => pay(p, ymd, amount)),
  }
}
function together(...parts: Part[]): Part {
  return {
    days: parts.flatMap((part) => part.days),
    rows: parts.flatMap((part) => part.rows),
    pays: parts.flatMap((part) => part.pays),
  }
}
const january = (over: Partial<Input>) => monthIn(over, '2026-01')!

describe('AC-6911.1 monthValues: 달마다 그 달 신환이 그 달에 낸 돈', () => {
  it('AC-6911.1: 메모리 첫날 이후 1일이 있는 달마다(끝 날이 든 달까지) 한 줄, 달 차례, 센 끝 날 = 말일과 자료 끝 날 가운데 이른 날', () => {
    expect(run().map((row) => [row.month, row.to])).toEqual([
      ['2026-01', '2026-01-31'],
      ['2026-02', '2026-02-28'],
      ['2026-03', '2026-03-18'],
    ])
  })

  it('AC-6911.1: 대상 = 그 달 신환 표시가 있는 환자, 금액 = 그 달 안 금액 줄 합(내원 없는 날 금액도), 내원 = 그 달 안 서로 다른 내원 날 수', () => {
    expect(run()).toEqual([
      // 1번만: 12만 3원 ÷ 1명, 내원 1/1 · 1/15 · 1/31 = 3날. 2/1 금액·처방은 다른 달이라 안 셈
      { month: '2026-01', to: '2026-01-31', n: 1, average: 120_003, times: 3, perVisit: 40_001, lines: [{ groups: null, n: 1, average: 120_003 }] },
      // 2·3·5번: 1만 5천 + 2만 + 12,345 = 47,345원, 내원 2 + 2 + 1 = 5날. 4번(표시 없음)·1번(2월 표시 없음)은 대상 아님
      { month: '2026-02', to: '2026-02-28', n: 3, average: 15_781, times: 1.6, perVisit: 9_469, lines: [{ groups: null, n: 3, average: 15_781 }] },
      // 2번만: 1만 5천 + 7천 = 2만 2천원, 내원 3/2 · 3/18 = 2날. 3/19(자료 끝 날 뒤)의 금액·7번 표시는 안 셈, 5번 3/1 금액은 3월 표시가 없어 안 셈
      { month: '2026-03', to: '2026-03-18', n: 1, average: 22_000, times: 2, perVisit: 11_000, lines: [{ groups: null, n: 1, average: 22_000 }] },
    ])
  })

  it('AC-6911.1: 메모리 첫날이 달 중간이면 그 달은 없다(다음 달부터), 어느 달 1일도 없으면 빈 목록이다', () => {
    expect(run({ range: { from: '2026-01-02', to: '2026-03-18' } }).map((row) => row.month)).toEqual(['2026-02', '2026-03'])
    expect(run({ range: { from: '2026-03-05', to: '2026-03-18' } })).toEqual([])
  })

  it('AC-6911.1: 메모리가 1일 하루뿐이면 그날까지 센 한 줄이다', () => {
    expect(run({ range: { from: '2026-01-01', to: '2026-01-01' } })).toEqual([
      { month: '2026-01', to: '2026-01-01', n: 1, average: 30_000, times: 1, perVisit: 30_000, lines: [{ groups: null, n: 1, average: 30_000 }] },
    ])
  })

  it('AC-6911.1: 신환 표시가 없는 달은 n 0·숫자 0·빈 줄이다(달 줄은 있다)', () => {
    expect(run({ range: { from: '2026-01-01', to: '2026-04-10' } }).at(-1)).toEqual({
      month: '2026-04',
      to: '2026-04-10',
      n: 0,
      average: 0,
      times: 0,
      perVisit: 0,
      lines: [],
    })
    expect(run({ days: [], rows: [], pays: [] }).map((row) => row.n)).toEqual([0, 0, 0])
  })

  it('AC-6911.1: 금액은 음수(환불이 더 큰 날)도 그대로 더하고, 평균이 음수여도 원 미만은 0 쪽으로 버린다', () => {
    const refund = { days: [day(2, '2026-01-02', true), day(8, '2026-01-02', true)], rows: [], pays: [pay(2, '2026-01-02', -10_001)] }
    expect(january(refund)).toMatchObject({ n: 2, average: -5_000, perVisit: -5_000 }) // −10,001 ÷ 2 = −5,000.5
  })

  it('AC-6911.1: 1명당 내원 횟수는 소수 1자리(8 ÷ 3 = 2.67 → 2.6, 버림), 내원은 같은 날 여러 줄이어도 하루다', () => {
    // 1번 6날(1/2는 두 줄) + 2번 1날 + 3번 1날 = 8날
    const many = [day(1, '2026-01-01', true), day(1, '2026-01-02'), day(1, '2026-01-02'), ...['03', '04', '05', '06'].map((d) => day(1, `2026-01-${d}`))]
    const result = january({ days: [...many, day(2, '2026-01-01', true), day(3, '2026-01-01', true)], rows: [], pays: [] })
    expect(result).toMatchObject({ n: 3, times: 2.6, average: 0, perVisit: 0 })
  })

  it('AC-6911.1: 받은 치료 = 그 달 안에 받은 묶음들(빼는 처방 규칙 그대로) — 없으면 진료만([]), 묶음 열쇠는 불러올 때 실은 묶음 차례', () => {
    const { lines } = january(
      together(
        people(100, 5, [], 60_000), // 진료만
        people(200, 5, ['ESW', 'MAN1'], 900_000), // 도수 + 충격파(줄 차례와 상관없이 묶음 차례)
        people(300, 5, ['ESW', 'XOUT'], 70_000), // 충격파 + 빼는 처방 → 진료만
      ),
    )
    expect(lines).toEqual([
      { groups: [], n: 10, average: 65_000 },
      { groups: [MANUAL.id, SHOCK.id], n: 5, average: 900_000 },
    ])
  })

  it('AC-6911.1: 인원 5명 이상인 조합 가운데 인원 많은 5개만 남기고 나머지(6번째·5명 미만)는 그 밖 한 줄, 평균이 작은 순이고 그 밖은 맨 끝', () => {
    const { lines } = january(
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

  it('AC-6911.1: 인원이 같으면 묶음 차례로 앞선 조합이 먼저 남는다(진료만이 맨 앞), 그 밖이 없으면 그 밖 줄도 없다', () => {
    const { lines } = january(
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
    expect(january(together(people(100, 5, [], 1_000))).lines).toEqual([{ groups: [], n: 5, average: 1_000 }])
  })

  it('AC-6911.1: 묶음을 싣지 않았으면 모두 진료만이다', () => {
    expect(january({ ...together(people(100, 6, ['MAN1'], 10_000)), groups: [] }).lines).toEqual([{ groups: [], n: 6, average: 10_000 }])
  })

  it('AC-6911.1: 결과에는 달·센 끝 날·묶음 열쇠와 숫자뿐 환자 번호·환자별 금액이 없다', () => {
    const result = run(together(people(100, 5, ['MAN1'], 10_000), people(200, 1, [], 1)))
    for (const row of result) {
      expect(Object.keys(row).sort()).toEqual(['average', 'lines', 'month', 'n', 'perVisit', 'times', 'to'])
      for (const line of row.lines) {
        expect(Object.keys(line).sort()).toEqual(['average', 'groups', 'n'])
        expect((line.groups ?? []).every((group) => GROUPS.some((def) => def.id === group))).toBe(true)
      }
    }
  })
})

describe('AC-6911.2 monthValues: 두 달에 신환 표시 · 같은 달 두 날', () => {
  it('AC-6911.2: 두 달에 신환 표시가 있으면 두 달 모두에 따로 들고, 달마다 그 달 안 금액·내원·받은 치료만 센다', () => {
    // 같은 5명이 1/5(도수) · 2/5(충격파) 두 날 신환 표시. 1월 도수만 · 2월 충격파만이고 금액도 그 달 것만
    const result = run(together(people(100, 5, ['MAN1'], 10_000, '2026-01-05'), people(100, 5, ['ESW'], 30_000, '2026-02-05')))
    expect(result.find((row) => row.month === '2026-01')).toMatchObject({ n: 5, average: 10_000, times: 1, lines: [{ groups: [MANUAL.id], n: 5, average: 10_000 }] })
    expect(result.find((row) => row.month === '2026-02')).toMatchObject({ n: 5, average: 30_000, times: 1, lines: [{ groups: [SHOCK.id], n: 5, average: 30_000 }] })
  })

  it('AC-6911.2: 같은 달 두 날에 신환 표시가 있어도 그 달 한 명이다(3번: 2/3 · 2/17)', () => {
    const only3 = { days: DAYS.filter((x) => x.patient === 3), rows: ROWS.filter((x) => x.patient === 3), pays: PAYS.filter((x) => x.p === 3) }
    expect(monthIn(only3, '2026-02')).toMatchObject({ n: 1, average: 20_000, times: 2, perVisit: 10_000 })
    // 1/20 내원은 표시가 없어 1월 대상이 아니다
    expect(monthIn(only3, '2026-01')).toMatchObject({ n: 0 })
  })
})

// ── 고른 기간 그대로(pv-month REQ-7201): span 안 신환 표시 환자의 span 안 금액·내원·받은 치료 ──
describe('AC-7201.1 periodValue: 고른 기간 신환이 그 기간에 낸 돈', () => {
  const runSpan = (span: { from: string; to: string }, over: Partial<Input> = {}) =>
    periodValue({ days: DAYS, rows: ROWS, pays: PAYS, groups: GROUPS, ...over, span })

  it('AC-7201.1: 두 달 기간(2/1~3/18) — 두 달에 표시가 있는 2번은 한 명, 금액·내원은 기간 안 줄만(3/19·1/20은 밖)', () => {
    // 대상 2·3·5번. 2번 2만 − 5천 + 1만 5천 + 7천 = 3만 7천, 3번 2만, 5번 12,345 + 5만(3/1) = 62,345 → 119,345원 ÷ 3명
    // 내원 2번 4날(2/10·2/20·3/2·3/18) + 3번 2날 + 5번 1날 = 7날 → 7 ÷ 3 = 2.33 → 2.3, 한 번 올 때 119,345 ÷ 7 = 17,049.2 → 버림
    expect(runSpan({ from: '2026-02-01', to: '2026-03-18' })).toEqual({
      from: '2026-02-01',
      to: '2026-03-18',
      n: 3,
      average: 39_781,
      times: 2.3,
      perVisit: 17_049,
      lines: [{ groups: null, n: 3, average: 39_781 }],
    })
  })

  it('AC-7201.1: 한 달 1일~말일이면 monthValues의 그 달 줄과 숫자가 같다', () => {
    for (const [month, from, to] of [
      ['2026-01', '2026-01-01', '2026-01-31'],
      ['2026-02', '2026-02-01', '2026-02-28'],
    ] as const) {
      const { n, average, times, perVisit, lines } = monthIn({}, month)!
      expect(runSpan({ from, to })).toEqual({ from, to, n, average, times, perVisit, lines })
    }
  })

  it('AC-7201.1: 표시 날 앞의 기간 안 줄도 센다 — 3번은 1/20 표시 없이 오고 2/3 표시, 기간 1/1~2/28이면 1/20 내원·금액·처방까지 든다', () => {
    const value = runSpan({ from: '2026-01-01', to: '2026-02-28' }, { groups: [PT] })
    // 대상 1·2·3·5번. 3번 = 8,888 + 1만 + 1만 = 28,888원 · 내원 1/20·2/3·2/17 = 3날 · 받은 치료 물리치료(1/20 PT1)
    // 1번 12만 3원(1월) + 99,999(2/1) = 220,002 · 2번 1만 5천 · 5번 12,345 → 합 276,235원 ÷ 4명 = 69,058.75 → 69,058
    // 내원 1번 4날(1/1·1/15·1/31·2/1) + 2번 2날 + 3번 3날 + 5번 1날 = 10날
    expect(value).toMatchObject({ n: 4, average: 69_058, times: 2.5, perVisit: 27_623 })
    expect(value.lines).toEqual([{ groups: null, n: 4, average: 69_058 }])
    const onlyThree = runSpan({ from: '2026-01-01', to: '2026-02-28' }, { days: DAYS.filter((d) => d.patient === 3), groups: [PT] })
    expect(onlyThree).toMatchObject({ n: 1, average: 28_888, times: 3, perVisit: 9_629 })
  })

  it('AC-7201.1: 받은 치료 줄 규칙은 monthValues와 같다(5명 이상 조합은 따로, 나머지는 그 밖 맨 끝)', () => {
    const parts = together(people(100, 5, ['MAN1'], 10_000), { days: DAYS, rows: ROWS, pays: PAYS })
    expect(runSpan({ from: '2026-01-01', to: '2026-01-31' }, parts).lines).toEqual([
      { groups: [MANUAL.id], n: 5, average: 10_000 },
      { groups: null, n: 1, average: 120_003 },
    ])
  })

  it('AC-7201.1: 기간 안에 신환 표시가 없으면 n 0·숫자 0·빈 줄이다', () => {
    expect(runSpan({ from: '2026-03-03', to: '2026-03-17' })).toEqual({ from: '2026-03-03', to: '2026-03-17', n: 0, average: 0, times: 0, perVisit: 0, lines: [] })
  })

  it('AC-7201.1: 결과에는 기간·묶음 열쇠와 숫자뿐 환자 번호·환자별 금액이 없다', () => {
    const value = runSpan({ from: '2026-01-01', to: '2026-03-18' })
    expect(Object.keys(value).sort()).toEqual(['from', 'lines', 'n', 'average', 'perVisit', 'times', 'to'].sort())
    for (const line of value.lines) expect(Object.keys(line).sort()).toEqual(['average', 'groups', 'n'])
  })
})
