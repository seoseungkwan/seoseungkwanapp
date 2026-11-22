import { describe, expect, it } from 'vitest'
import { COST_KEYS, calcCosts, checkCosts, costFieldText, parseCostInput, type Costs } from './costs'

// 개원 비용 계산(design.md 11절). 저장·계산은 원 정수, 빈칸 = 열쇠 없음

// 시안 plan-filled 예시 숫자(만 원 칸 × 10,000). 시안의 '월세 + 관리비 598'은 design.md 열쇠대로 둘로 나눴다
const EXAMPLE: Costs = {
  deposit: 100_000_000,
  premium: 0,
  interior: 2_500_000, // 평당
  equipment: 320_000_000,
  rent: 5_200_000,
  mgmt: 780_000,
  payroll: 26_000_000,
  otherMonth: 4_000_000,
  loan: 300_000_000,
  rateBp: 520,
  perPatient: 42_000,
  workDays: 26,
}

const MONEY_FIELDS = ['interiorTotal', 'interest', 'monthlyFixed', 'sixMonths', 'startTotal', 'mine'] as const

describe('AC-7913.1 비용 칸', () => {
  it('AC-7913.1: 칸 열쇠는 design.md 11절 열셋이다', () => {
    expect([...COST_KEYS]).toEqual([
      'deposit',
      'premium',
      'interior',
      'equipment',
      'otherStart',
      'rent',
      'mgmt',
      'payroll',
      'otherMonth',
      'loan',
      'rateBp',
      'perPatient',
      'workDays',
    ])
  })

  it('AC-7913.1: 처음에는 모두 빈칸이고 합계는 없음, 빈칸 수는 열셋이다', () => {
    expect(calcCosts({}, null)).toEqual({
      interiorTotal: null,
      interest: null,
      monthlyFixed: null,
      sixMonths: null,
      startTotal: null,
      mine: null,
      loanOver: false,
      breakEven: null,
      blanks: 13,
    })
  })

  it('AC-7913.1: 만 원 칸은 × 10,000 원 정수로 받는다(쉼표·앞뒤 빈칸 괜찮음, 빈칸은 없음)', () => {
    expect(parseCostInput('deposit', '10,000')).toEqual({ ok: true, value: 100_000_000 })
    expect(parseCostInput('premium', '0')).toEqual({ ok: true, value: 0 })
    expect(parseCostInput('interior', ' 250 ')).toEqual({ ok: true, value: 2_500_000 })
    expect(parseCostInput('loan', '999,999')).toEqual({ ok: true, value: 9_999_990_000 })
    expect(parseCostInput('rent', '')).toEqual({ ok: true, value: null })
    expect(parseCostInput('rent', '   ')).toEqual({ ok: true, value: null })
  })

  it('AC-7913.1: 만 원 칸에 소수·음수·글자·너무 큰 값은 받지 않는다', () => {
    for (const text of ['1.5', '-1', '삼백', '12a', '1,000,000', '1e3']) {
      expect(parseCostInput('deposit', text)).toEqual({ ok: false })
    }
  })

  it('AC-7913.1: 환자 1명당 수입은 원 칸이다', () => {
    expect(parseCostInput('perPatient', '42,000')).toEqual({ ok: true, value: 42_000 })
    expect(parseCostInput('perPatient', '9,999,999,999')).toEqual({ ok: true, value: 9_999_999_999 })
    expect(parseCostInput('perPatient', '10,000,000,000')).toEqual({ ok: false })
    expect(parseCostInput('perPatient', '42000.5')).toEqual({ ok: false })
  })

  it('AC-7913.1: 이자는 연 %로 받아 0.01% 단위 정수로 둔다(0~30%, 소수 둘째 자리까지)', () => {
    expect(parseCostInput('rateBp', '5.2')).toEqual({ ok: true, value: 520 })
    expect(parseCostInput('rateBp', '5')).toEqual({ ok: true, value: 500 })
    expect(parseCostInput('rateBp', '5.25')).toEqual({ ok: true, value: 525 })
    expect(parseCostInput('rateBp', '0.05')).toEqual({ ok: true, value: 5 })
    expect(parseCostInput('rateBp', '0')).toEqual({ ok: true, value: 0 })
    expect(parseCostInput('rateBp', '30')).toEqual({ ok: true, value: 3_000 })
    for (const text of ['5.255', '30.01', '-1', '5%', '.5', '5.']) {
      expect(parseCostInput('rateBp', text)).toEqual({ ok: false })
    }
  })

  it('AC-7913.1: 한 달 진료일은 1~31 정수다', () => {
    expect(parseCostInput('workDays', '26')).toEqual({ ok: true, value: 26 })
    expect(parseCostInput('workDays', '1')).toEqual({ ok: true, value: 1 })
    expect(parseCostInput('workDays', '31')).toEqual({ ok: true, value: 31 })
    for (const text of ['0', '32', '1.5', '-3']) {
      expect(parseCostInput('workDays', text)).toEqual({ ok: false })
    }
  })

  it('AC-7913.1: 저장 값을 칸 글자로 되돌리면 다시 같은 값으로 읽힌다', () => {
    expect(costFieldText('deposit', 100_000_000)).toBe('10,000')
    expect(costFieldText('perPatient', 42_000)).toBe('42,000')
    expect(costFieldText('rateBp', 520)).toBe('5.2')
    expect(costFieldText('rateBp', 525)).toBe('5.25')
    expect(costFieldText('rateBp', 500)).toBe('5')
    expect(costFieldText('rateBp', 5)).toBe('0.05')
    expect(costFieldText('workDays', 26)).toBe('26')
    expect(costFieldText('rent', undefined)).toBe('')
    for (const key of COST_KEYS) {
      const value = EXAMPLE[key]
      if (value === undefined) continue
      expect(parseCostInput(key, costFieldText(key, value))).toEqual({ ok: true, value })
    }
  })

  it('AC-7913.1: 시안 예시 숫자로 처음 드는 돈·내 돈·한 달 고정비·손익분기(하루 34.1명)를 design.md 식으로 센다', () => {
    // 넓이 171.90㎡ = 51.99975평 → 인테리어 = 버림(2,500,000 × 51.99975)
    const r = calcCosts(EXAMPLE, 171.9)
    expect(r.interiorTotal).toBe(129_999_375)
    expect(r.interest).toBe(1_300_000) // 300,000,000 × 520 ÷ 120,000
    expect(r.monthlyFixed).toBe(37_280_000) // 5,200,000 + 780,000 + 26,000,000 + 4,000,000 + 1,300,000
    expect(r.sixMonths).toBe(223_680_000)
    expect(r.startTotal).toBe(773_679_375) // 100,000,000 + 0 + 129,999,375 + 320,000,000 + 223,680,000
    expect(r.mine).toBe(473_679_375)
    expect(r.loanOver).toBe(false)
    expect(r.breakEven).toBe(34.1) // 버림(37,280,000 × 10 ÷ (42,000 × 26)) ÷ 10
    expect(r.blanks).toBe(1) // otherStart
    for (const field of MONEY_FIELDS) expect(Number.isInteger(r[field])).toBe(true)
  })

  it('AC-7913.1: 한 달 이자는 원 미만을 버린다', () => {
    // 12,345,678 × 345 ÷ 120,000 = 35,493.82…
    expect(calcCosts({ loan: 12_345_678, rateBp: 345 }, null).interest).toBe(35_493)
    expect(calcCosts({ loan: 12_345_678, rateBp: 0 }, null).interest).toBe(0)
  })

  it('AC-7913.1: 대출이나 이자 한쪽이 비면 이자는 없음이고, 한 달 고정비는 적은 칸만 더한다(빈칸은 0)', () => {
    const r = calcCosts({ rent: 3_000_000, payroll: 10_000_000, loan: 100_000_000 }, null)
    expect(r.interest).toBeNull()
    expect(r.monthlyFixed).toBe(13_000_000)
    expect(r.sixMonths).toBe(78_000_000)
    expect(r.startTotal).toBe(78_000_000)
    expect(r.blanks).toBe(10)
    expect(calcCosts({ rateBp: 500 }, null).interest).toBeNull()
  })

  it('AC-7913.1: 이자만 있어도 한 달 고정비에 들어간다', () => {
    const r = calcCosts({ loan: 120_000_000, rateBp: 500 }, null)
    expect(r.interest).toBe(500_000)
    expect(r.monthlyFixed).toBe(500_000)
    expect(r.startTotal).toBe(3_000_000)
  })

  it('AC-7913.1: 인테리어는 평당 값 × 평(㎡ × 121 ÷ 400)을 버리고, 넓이나 평당 값이 없으면 없음이다', () => {
    expect(calcCosts({ interior: 2_500_000 }, 400).interiorTotal).toBe(302_500_000) // 121평
    expect(calcCosts({ interior: 1_000_001 }, 0.01).interiorTotal).toBe(3_025) // 0.003025평 × 1,000,001 = 3,025.003…
    expect(calcCosts({ interior: 2_500_000 }, null).interiorTotal).toBeNull()
    expect(calcCosts({ interior: 2_500_000 }, 0).interiorTotal).toBeNull()
    expect(calcCosts({}, 400).interiorTotal).toBeNull()
    // 인테리어 합계를 못 내면 처음 드는 돈에서 0으로 센다
    expect(calcCosts({ interior: 2_500_000, deposit: 10_000_000 }, null).startTotal).toBe(10_000_000)
  })

  it('AC-7913.1: 아주 큰 평당 값 × 넓이도 원 정수로 버린다', () => {
    const r = calcCosts({ interior: 9_999_999_999 }, 999_999.99)
    // 9,999,999,999 × 99,999,999 × 121 ÷ 40,000 = 3,024,999,969,447,500.003… → 버림(곱은 2^53을 넘는다)
    expect(r.interiorTotal).toBe(3_024_999_969_447_500)
  })

  it('AC-7913.1: 손익분기 하루 환자는 소수 첫째 자리까지 버린다', () => {
    // 999,999 × 10 ÷ (10,000 × 25) = 39.99996 → 3.9
    expect(calcCosts({ rent: 999_999, perPatient: 10_000, workDays: 25 }, null).breakEven).toBe(3.9)
    // 나눠떨어지면 그대로
    expect(calcCosts({ rent: 1_000_000, perPatient: 10_000, workDays: 25 }, null).breakEven).toBe(4)
  })

  it('AC-7913.1: 환자 1명당 수입·진료일·한 달 고정비 가운데 하나라도 비면(또는 수입 0이면) 손익분기는 없음이다', () => {
    expect(calcCosts({ rent: 1_000_000, workDays: 25 }, null).breakEven).toBeNull()
    expect(calcCosts({ rent: 1_000_000, perPatient: 10_000 }, null).breakEven).toBeNull()
    expect(calcCosts({ perPatient: 10_000, workDays: 25 }, null).breakEven).toBeNull()
    expect(calcCosts({ rent: 1_000_000, perPatient: 0, workDays: 25 }, null).breakEven).toBeNull()
  })

  it('AC-7913.1: 대출이 처음 드는 돈보다 많으면 내 돈은 음수 그대로이고 loanOver다', () => {
    const r = calcCosts({ deposit: 50_000_000, loan: 100_000_000 }, null)
    expect(r.startTotal).toBe(50_000_000)
    expect(r.mine).toBe(-50_000_000)
    expect(r.loanOver).toBe(true)
    const even = calcCosts({ deposit: 50_000_000, loan: 50_000_000 }, null)
    expect(even.mine).toBe(0)
    expect(even.loanOver).toBe(false)
  })

  it('AC-7913.1: 처음 드는 돈이 없으면 대출만 있어도 내 돈은 없음이다', () => {
    const r = calcCosts({ loan: 100_000_000 }, null)
    expect(r.startTotal).toBeNull()
    expect(r.mine).toBeNull()
    expect(r.loanOver).toBe(false)
  })

  it('AC-7913.1: 빈칸 수는 값이 없는 칸만 센다(0은 적은 칸)', () => {
    expect(calcCosts({ premium: 0, rateBp: 0 }, null).blanks).toBe(11)
    expect(calcCosts(EXAMPLE, null).blanks).toBe(1)
  })

  it('AC-7913.1: 저장된 비용 값은 아는 열쇠·칸 범위의 정수만 남긴다', () => {
    expect(
      checkCosts({
        deposit: 100_000_000,
        premium: 1.5,
        interior: -1,
        equipment: '320000000',
        rent: 10_000_000_000,
        mgmt: null,
        rateBp: 3_001,
        workDays: 0,
        perPatient: 42_000,
        loan: 0,
        foo: 1,
      }),
    ).toEqual({ deposit: 100_000_000, perPatient: 42_000, loan: 0 })
    expect(checkCosts({ rateBp: 3_000, workDays: 31 })).toEqual({ rateBp: 3_000, workDays: 31 })
    expect(checkCosts({ workDays: 32 })).toEqual({})
    // 만 원 칸은 × 10,000으로만 들어오므로 1만 원으로 나눠떨어지지 않는 값은 버린다(원 칸은 그대로)
    expect(checkCosts({ rent: 5_200_001, perPatient: 42_001 })).toEqual({ perPatient: 42_001 })
    for (const raw of [null, undefined, 1, 'x', [100]]) expect(checkCosts(raw)).toEqual({})
  })
})
