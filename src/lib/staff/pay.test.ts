import { describe, expect, it } from 'vitest'
import {
  applyRules,
  checkPayItems,
  copyPrev,
  incentiveAmount,
  laborCost,
  lineTotal,
  monthRevenue,
  newLine,
  revenueRatio,
  visibleItems,
  type IncentiveEntry,
  type IncentiveRule,
  type PayItem,
  type PayLine,
} from './pay'

// 급여 셈(spec staff REQ-7606, design.md 4절). 보기 자료는 시안 pay.html(2026년 11월, 지어낸 사람)이다.
// 금액은 원 단위 정수, 원 미만은 항목마다 버리고, 합계는 항목 금액의 합이다(CLAUDE.md)

const NOV = '2026-11'
const OCT = '2026-10'

// 기본 다섯 + 병원이 더한 직책수당(시안 ① 표 칸 차례)
const ITEMS: PayItem[] = [
  { id: 'base', name: '기본급', kind: 'amount', base: true, removedFrom: null },
  { id: 'overtime', name: '연장수당', kind: 'amount', base: true, removedFrom: null },
  { id: 'meal', name: '식대', kind: 'amount', base: true, removedFrom: null },
  { id: 'incentive', name: '인센티브', kind: 'incentive', base: true, removedFrom: null },
  { id: 'bonus', name: '상여', kind: 'amount', base: true, removedFrom: null },
  { id: 'position', name: '직책수당', kind: 'amount', base: false, removedFrom: null },
]

const rule = (id: string, staffId: string, name: string, method: IncentiveRule['method'], value: number, sort: number): IncentiveRule => ({
  id,
  staffId,
  name,
  method,
  unitAmount: method === 'percent' ? null : value,
  percent: method === 'percent' ? value : null,
  sort,
})
// 시안 ③ 인센티브 규칙
const RULES: IncentiveRule[] = [
  rule('r-kim', 's-kim', '고정 수당', 'fixed', 100_000, 0),
  rule('r-lee-1', 's-lee', '도수치료 급여', 'per_case', 5_000, 0),
  rule('r-lee-2', 's-lee', '도수치료 비급여', 'percent', 10, 1),
  rule('r-park', 's-park', '도수치료 비급여', 'percent', 10, 0),
]

const entry = (r: IncentiveRule, count: number | null, sales: number | null): IncentiveEntry => ({
  ruleId: r.id,
  name: r.name,
  method: r.method,
  unitAmount: r.unitAmount,
  percent: r.percent,
  count,
  sales,
})

const line = (month: string, staffId: string | null, amounts: Record<string, number>, incentives: IncentiveEntry[] = [], adjust = 0): PayLine => ({
  id: `line-${month}-${staffId ?? 'gone'}`,
  month,
  staffId,
  amounts,
  incentives,
  adjust,
  adjustReason: null,
  adjustMemo: null,
})

// 시안 ① 11월 표 · ② 이달 실적
const NOV_LINES: PayLine[] = [
  line(NOV, 's-kim', { base: 2_900_000, meal: 200_000 }, [entry(RULES[0], null, null)]),
  line(NOV, 's-lee', { base: 3_100_000, overtime: 120_000, meal: 200_000 }, [entry(RULES[1], 32, null), entry(RULES[2], null, 4_200_000)]),
  line(NOV, 's-park', { base: 2_800_000, overtime: 70_000, meal: 200_000 }, [entry(RULES[3], null, 3_150_000)]),
  line(NOV, 's-choi', { base: 3_300_000, overtime: 160_000, meal: 200_000, position: 150_000 }),
  line(NOV, 's-jung', { base: 1_450_000, meal: 120_000 }),
  line(NOV, 's-han', { base: 2_450_000, meal: 200_000 }),
]
// 10월: 김하늘·정유나·한지우 같음, 이도윤 −40,000, 박서연 −95,000, 최민준 −90,000(시안 ⑦ 사람별 표의 '10월보다')
const OCT_LINES: PayLine[] = [
  line(OCT, 's-kim', { base: 2_900_000, meal: 200_000 }, [entry(RULES[0], null, null)]),
  line(OCT, 's-lee', { base: 3_100_000, overtime: 120_000, meal: 200_000 }, [entry(RULES[1], 30, null), entry(RULES[2], null, 4_700_000)]),
  line(OCT, 's-park', { base: 2_800_000, overtime: 70_000, meal: 200_000 }, [entry(RULES[3], null, 2_200_000)]),
  line(OCT, 's-choi', { base: 3_300_000, overtime: 70_000, meal: 200_000, position: 150_000 }),
  line(OCT, 's-jung', { base: 1_450_000, meal: 120_000 }),
  line(OCT, 's-han', { base: 2_450_000, meal: 200_000 }),
]

describe('AC-7606.1: incentiveAmount — 건당 정액·매출의 %·고정 수당', () => {
  it('AC-7606.1: 보기 — 32건 × 5,000 = 160,000, 4,200,000 × 10% = 420,000, 3,150,000 × 10% = 315,000, 고정 100,000', () => {
    expect(incentiveAmount(entry(RULES[1], 32, null))).toBe(160_000)
    expect(incentiveAmount(entry(RULES[2], null, 4_200_000))).toBe(420_000)
    expect(incentiveAmount(entry(RULES[3], null, 3_150_000))).toBe(315_000)
    expect(incentiveAmount(entry(RULES[0], null, null))).toBe(100_000)
  })

  it('AC-7606.1: 건수·매출이 비면 0이다(고정 수당은 실적과 상관없이 금액)', () => {
    expect(incentiveAmount(entry(RULES[1], null, null))).toBe(0)
    expect(incentiveAmount(entry(RULES[2], null, null))).toBe(0)
    expect(incentiveAmount(entry(RULES[1], 0, null))).toBe(0)
    expect(incentiveAmount(entry(RULES[0], 7, 1_000_000))).toBe(100_000)
  })

  it('AC-7606.1: 매출의 %는 ⌊매출 × % ÷ 100⌋ 정수 셈 — 원 미만은 버린다(소수 둘째 자리 %, 부동소수 찌꺼기 없음)', () => {
    expect(incentiveAmount({ ...entry(RULES[2], null, 12_345), percent: 3.33 })).toBe(411) // 411.0885
    expect(incentiveAmount({ ...entry(RULES[2], null, 1_001), percent: 12.5 })).toBe(125) // 125.125
    expect(incentiveAmount({ ...entry(RULES[2], null, 1_000_000), percent: 0.29 })).toBe(2_900) // 0.29 * 100 = 28.999…
    expect(incentiveAmount({ ...entry(RULES[2], null, 100), percent: 0.07 })).toBe(0) // 0.07원
    expect(incentiveAmount({ ...entry(RULES[2], null, 999), percent: 100 })).toBe(999)
  })

  it('AC-7606.1: 건당 정액·고정 수당의 금액이 비어 있으면 0이다', () => {
    expect(incentiveAmount({ ...entry(RULES[1], 10, null), unitAmount: null })).toBe(0)
    expect(incentiveAmount({ ...entry(RULES[0], null, null), unitAmount: null })).toBe(0)
  })
})

describe('AC-7606.2: visibleItems · lineTotal — 그달 보이는 항목 합 + 인센티브 + 조정', () => {
  it('AC-7606.2: 뺀 항목은 removedFrom 달부터 안 보이고 앞 달에는 보인다(차례 그대로)', () => {
    const items = ITEMS.map((item) => (item.id === 'bonus' ? { ...item, removedFrom: '2026-12' } : item))
    expect(visibleItems(items, NOV).map((item) => item.id)).toEqual(['base', 'overtime', 'meal', 'incentive', 'bonus', 'position'])
    expect(visibleItems(items, '2026-12').map((item) => item.id)).toEqual(['base', 'overtime', 'meal', 'incentive', 'position'])
    expect(visibleItems(items, '2027-03').map((item) => item.id)).toEqual(['base', 'overtime', 'meal', 'incentive', 'position'])
    expect(visibleItems(items, '2026-01').map((item) => item.id)).toContain('bonus')
  })

  it('AC-7606.2: 보기 11월 — 사람마다 김하늘 3,200,000 · 이도윤 4,000,000 · 박서연 3,385,000 · 최민준 3,810,000 · 정유나 1,570,000 · 한지우 2,650,000', () => {
    const totals = NOV_LINES.map((l) => lineTotal(l, ITEMS, NOV))
    expect(totals.map((t) => t.total)).toEqual([3_200_000, 4_000_000, 3_385_000, 3_810_000, 1_570_000, 2_650_000])
    expect(totals.map((t) => t.incentive)).toEqual([100_000, 580_000, 315_000, 0, 0, 0])
    expect(totals.every((t) => t.problem === null)).toBe(true)
    expect(totals.reduce((sum, t) => sum + t.total, 0)).toBe(18_615_000)
  })

  it('AC-7606.2: 보기 11월 항목별 합 — 기본급 16,000,000 · 연장수당 350,000 · 식대 1,120,000 · 인센티브 995,000 · 상여 0 · 직책수당 150,000', () => {
    const byItem = visibleItems(ITEMS, NOV).map((item) =>
      NOV_LINES.reduce((sum, l) => sum + (item.kind === 'incentive' ? lineTotal(l, ITEMS, NOV).incentive : (l.amounts[item.id] ?? 0)), 0),
    )
    expect(byItem).toEqual([16_000_000, 350_000, 1_120_000, 995_000, 0, 150_000])
  })

  it('AC-7606.2: 조정(±)을 더하고, 빠진 항목의 금액은 그달 합계에 안 들어간다', () => {
    const items = ITEMS.map((item) => (item.id === 'bonus' ? { ...item, removedFrom: NOV } : item))
    const l = { ...line(NOV, 's-x', { base: 2_000_000, bonus: 500_000, gone: 300_000 }), adjust: -45_000 }
    expect(lineTotal(l, items, NOV)).toEqual({ total: 1_955_000, incentive: 0, problem: null })
    expect(lineTotal(l, items, OCT).total).toBe(2_455_000) // 10월에는 상여가 보인다
  })

  it('AC-7606.2: 인센티브 항목이 안 보이는 달에는 실적이 있어도 합계에 안 넣는다', () => {
    const items = ITEMS.map((item) => (item.kind === 'incentive' ? { ...item, removedFrom: NOV } : item))
    const l = NOV_LINES[1]
    expect(lineTotal(l, items, NOV)).toEqual({ total: 3_420_000, incentive: 0, problem: null })
    expect(lineTotal(l, items, OCT)).toEqual({ total: 4_000_000, incentive: 580_000, problem: null })
  })

  it("AC-7606.2: 합계가 0원 밑이면 '합계가 0원보다 적어요'(0원은 문제 아님)", () => {
    expect(lineTotal({ ...line(NOV, 's-x', { base: 100_000 }), adjust: -100_001 }, ITEMS, NOV)).toEqual({
      total: -1,
      incentive: 0,
      problem: '합계가 0원보다 적어요',
    })
    expect(lineTotal({ ...line(NOV, 's-x', { base: 100_000 }), adjust: -100_000 }, ITEMS, NOV).problem).toBeNull()
    expect(lineTotal(line(NOV, 's-x', {}), ITEMS, NOV)).toEqual({ total: 0, incentive: 0, problem: null })
  })
})

describe('AC-7606.2: checkPayItems — 항목 목록 검사(30개·이름 10자까지)', () => {
  it('AC-7606.2: 기본 목록과 병원이 더한 항목은 문제가 없다', () => {
    expect(checkPayItems(ITEMS)).toBeNull()
  })

  it('AC-7606.2·AC-7615.4: 30개를 넘거나, 이름이 비거나 10자를 넘으면 까닭을 준다', () => {
    const many = Array.from({ length: 31 }, (_, i): PayItem => ({ id: `x${i}`, name: `항목${i}`, kind: 'amount', base: false, removedFrom: null }))
    expect(checkPayItems(many.slice(0, 30))).toBeNull()
    expect(checkPayItems(many)).toBe('항목은 30개까지 둘 수 있어요.')
    const named = (name: string) => [...ITEMS, { id: 'extra', name, kind: 'amount' as const, base: false, removedFrom: null }]
    expect(checkPayItems(named('가나다라마바사아자차'))).toBeNull()
    expect(checkPayItems(named('가나다라마바사아자차카'))).toBe('항목 이름은 1~10자로 적어 주세요.')
    expect(checkPayItems(named(''))).toBe('항목 이름은 1~10자로 적어 주세요.')
    expect(checkPayItems(named(' 수당'))).toBe('항목 이름은 1~10자로 적어 주세요.')
  })

  it('AC-7606.2: 지금 쓰는 항목끼리 이름이 같으면 막고, 뺀 항목과 같은 이름은 된다', () => {
    const dup = [...ITEMS, { id: 'extra', name: '식대', kind: 'amount' as const, base: false, removedFrom: null }]
    expect(checkPayItems(dup)).toBe('같은 이름의 항목이 있어요.')
    const reused = [...ITEMS.map((item) => (item.id === 'bonus' ? { ...item, removedFrom: OCT } : item)), { id: 'bonus2', name: '상여', kind: 'amount' as const, base: false, removedFrom: null }]
    expect(checkPayItems(reused)).toBeNull()
  })

  it('AC-7606.2: id가 겹치거나 비었거나, 인센티브 항목이 둘이거나, 뺀 달 모양이 틀리면 막는다', () => {
    const problem = '항목 목록이 맞지 않아요. 화면을 새로 고쳐 주세요.'
    expect(checkPayItems([...ITEMS, { ...ITEMS[0], name: '기본급2' }])).toBe(problem)
    expect(checkPayItems([...ITEMS, { id: '', name: '빈칸', kind: 'amount', base: false, removedFrom: null }])).toBe(problem)
    expect(checkPayItems([...ITEMS, { id: 'inc2', name: '성과급', kind: 'incentive', base: false, removedFrom: null }])).toBe(problem)
    expect(checkPayItems(ITEMS.map((item) => (item.id === 'bonus' ? { ...item, removedFrom: '2026-13' } : item)))).toBe(problem)
  })
})

describe('AC-7606.3: newLine · copyPrev — 빈 칸만 지난달 금액으로', () => {
  it('AC-7606.3: 줄이 없는 달의 새 줄은 금액 비움 · 그 사람 지금 규칙(sort 차례, 건수·매출 비움) · 조정 0', () => {
    const shuffled = [RULES[2], RULES[0], RULES[3], RULES[1]]
    expect(newLine({ month: '2026-12', staffId: 's-lee', rules: shuffled })).toEqual({
      id: null,
      month: '2026-12',
      staffId: 's-lee',
      amounts: {},
      incentives: [entry(RULES[1], null, null), entry(RULES[2], null, null)],
      adjust: 0,
      adjustReason: null,
      adjustMemo: null,
    })
    expect(newLine({ month: '2026-12', staffId: 's-choi', rules: RULES }).incentives).toEqual([])
  })

  it('AC-7606.3: 이달 금액 항목 가운데 값이 없는 칸만 지난달 값으로 채운다(이미 적은 칸·0원 칸은 그대로)', () => {
    const now = { ...line(NOV, 's-lee', { base: 3_200_000, overtime: 0 }), incentives: [entry(RULES[1], 40, null)], adjust: 10_000 }
    const prev = OCT_LINES[1]
    const copied = copyPrev(now, prev, ITEMS, NOV)
    expect(copied.amounts).toEqual({ base: 3_200_000, overtime: 0, meal: 200_000 })
    expect(copied.incentives).toEqual(now.incentives) // 인센티브 실적은 가져오지 않는다
    expect(copied.adjust).toBe(10_000) // 조정도 가져오지 않는다
    expect({ ...copied, amounts: now.amounts }).toEqual(now)
  })

  it('AC-7606.3: 그달 안 보이는 항목·인센티브 칸은 가져오지 않고, 넘긴 줄은 바꾸지 않는다', () => {
    const items = ITEMS.map((item) => (item.id === 'bonus' ? { ...item, removedFrom: NOV } : item))
    const prev = { ...line(OCT, 's-x', { base: 1_000_000, bonus: 300_000, position: 50_000, incentive: 9 }), adjust: -5_000, adjustReason: 'deduct' as const }
    const now = line(NOV, 's-x', {})
    const before = structuredClone(now)
    const copied = copyPrev(now, prev, items, NOV)
    expect(copied.amounts).toEqual({ base: 1_000_000, position: 50_000 })
    expect(copied.adjust).toBe(0)
    expect(copied.adjustReason).toBeNull()
    expect(now).toEqual(before)
    expect(copied.amounts).not.toBe(now.amounts)
  })

  it('AC-7606.3: 지난달 줄이 없으면 그대로(새 객체)', () => {
    const now = line(NOV, 's-x', { base: 1 })
    expect(copyPrev(now, null, ITEMS, NOV)).toEqual(now)
    expect(copyPrev(now, null, ITEMS, NOV)).not.toBe(now)
  })
})

describe('AC-7606.4: applyRules — 규칙을 고치면 보는 달 줄의 인센티브를 새 규칙으로', () => {
  it('AC-7606.4: 이름·방식·값은 새 규칙, 적은 건수·매출은 규칙 id로 그대로, 뺀 규칙 줄은 빠지고 새 규칙은 빈 실적(규칙 차례대로)', () => {
    const entries = [entry(RULES[1], 32, null), entry(RULES[2], null, 4_200_000), { ...entry(RULES[1], 3, 9), ruleId: 'r-old', name: '옛 항목' }]
    const rules: IncentiveRule[] = [
      { ...RULES[2], percent: 12, sort: 0 },
      { ...RULES[1], name: '도수 급여', unitAmount: 6_000, sort: 1 },
      rule('r-new', 's-lee', '체외충격파', 'per_case', 3_000, 2),
    ]
    expect(applyRules(entries, rules)).toEqual([
      { ruleId: 'r-lee-2', name: '도수치료 비급여', method: 'percent', unitAmount: null, percent: 12, count: null, sales: 4_200_000 },
      { ruleId: 'r-lee-1', name: '도수 급여', method: 'per_case', unitAmount: 6_000, percent: null, count: 32, sales: null },
      { ruleId: 'r-new', name: '체외충격파', method: 'per_case', unitAmount: 3_000, percent: null, count: null, sales: null },
    ])
  })

  it('AC-7606.4: 방식을 바꿔도 적은 건수·매출은 그대로 남고, 규칙 id가 없는 옛 줄은 빠진다', () => {
    const entries = [entry(RULES[1], 32, 1_000), { ...entry(RULES[1], 5, null), ruleId: null }]
    const changed = applyRules(entries, [{ ...RULES[1], method: 'percent', unitAmount: null, percent: 5 }])
    expect(changed).toEqual([{ ruleId: 'r-lee-1', name: '도수치료 급여', method: 'percent', unitAmount: null, percent: 5, count: 32, sales: 1_000 }])
    expect(incentiveAmount(changed[0])).toBe(50)
    expect(applyRules(entries, [])).toEqual([])
  })

  it('AC-7606.4: 규칙을 바꿔도 앞 달 줄의 금액은 그 줄에 복사해 둔 값으로 셈해 그대로다', () => {
    const raised = RULES.filter((r) => r.staffId === 's-lee').map((r) => (r.method === 'per_case' ? { ...r, unitAmount: 6_000 } : r))
    const oct = OCT_LINES[1]
    const octBefore = lineTotal(oct, ITEMS, OCT).total
    const nov = { ...NOV_LINES[1], incentives: applyRules(NOV_LINES[1].incentives, raised) }
    expect(lineTotal(nov, ITEMS, NOV).total).toBe(4_032_000) // 32건 × 6,000 = 192,000
    expect(lineTotal(oct, ITEMS, OCT).total).toBe(octBefore)
    expect(octBefore).toBe(4_040_000)
    expect(NOV_LINES[1].incentives[0].unitAmount).toBe(5_000) // 넘긴 줄은 바꾸지 않는다
  })
})

describe('AC-7606.5: laborCost — 그달 모든 줄 합계 + 병원 부담분', () => {
  it('AC-7606.5: 보기 11월 18,615,000 + 2,150,000 = 20,765,000, 10월(18,470,000)보다 145,000원 많다', () => {
    const lines = [...OCT_LINES, ...NOV_LINES]
    expect(laborCost(lines, ITEMS, NOV, 2_150_000)).toEqual({ pay: 18_615_000, cost: 20_765_000, count: 6 })
    expect(laborCost(lines, ITEMS, OCT, 2_130_000)).toEqual({ pay: 18_470_000, cost: 20_600_000, count: 6 })
    expect(laborCost(lines, ITEMS, NOV, 0).pay - laborCost(lines, ITEMS, OCT, 0).pay).toBe(145_000)
  })

  it('AC-7606.5: 직원이 지워진 줄(staffId null)도 넣고, 병원 부담분이 없으면 지급 합계 그대로다', () => {
    const lines = [...NOV_LINES, line(NOV, null, { base: 1_000_000 })]
    expect(laborCost(lines, ITEMS, NOV, null)).toEqual({ pay: 19_615_000, cost: 19_615_000, count: 7 })
    expect(laborCost([], ITEMS, NOV, 2_150_000)).toEqual({ pay: 0, cost: 2_150_000, count: 0 })
  })
})

describe('AC-7606.6: revenueRatio · monthRevenue — 매출 대비 인건비 %', () => {
  // 시안 ⑦ 달별 숫자 표(지급 합계 + 병원 부담분 = 인건비, 매출)
  const MONTHS = [
    { month: '2026-06', pay: 18_320_000, employer: 2_080_000, revenue: 112_300_000, ratio: 18.2 },
    { month: '2026-07', pay: 18_510_000, employer: 2_100_000, revenue: 120_500_000, ratio: 17.1 },
    { month: '2026-09', pay: 19_050_000, employer: 2_120_000, revenue: 115_800_000, ratio: 18.3 },
    { month: '2026-10', pay: 18_470_000, employer: 2_130_000, revenue: 121_900_000, ratio: 16.9 },
  ]

  it('AC-7606.6: 보기 11월 20,765,000 ÷ 118,400,000 = 17.5%', () => {
    const { cost } = laborCost(NOV_LINES, ITEMS, NOV, 2_150_000)
    expect(revenueRatio(cost, 118_400_000)).toBe(17.5)
  })

  it.each(MONTHS)('AC-7606.6: 보기 $month — 인건비 ÷ 매출 = $ratio%', ({ month, pay, employer, revenue, ratio }) => {
    const { cost } = laborCost([line(month, 's-a', { base: pay })], ITEMS, month, employer)
    expect(revenueRatio(cost, revenue)).toBe(ratio)
  })

  it('AC-7606.6: 소수 첫째 자리로 반올림한다(딱 반이면 올림, 부동소수 찌꺼기 없음)', () => {
    expect(revenueRatio(1_225, 10_000)).toBe(12.3) // 12.25
    expect(revenueRatio(1_224, 10_000)).toBe(12.2)
    expect(revenueRatio(1, 3)).toBe(33.3)
    expect(revenueRatio(0, 10_000)).toBe(0)
  })

  it("AC-7606.6: 매출이 0이거나 없으면 null('매출 자료 없음')", () => {
    expect(revenueRatio(20_370_000, null)).toBeNull()
    expect(revenueRatio(20_370_000, 0)).toBeNull()
    expect(revenueRatio(20_370_000, -5)).toBeNull()
  })

  it('AC-7606.6: monthRevenue = revenueDayValues 값의 합(total, 없으면 roughTotal, 둘 다 없는 날은 건너뜀)', () => {
    const days = [
      { date: '2026-11-02', total: 5_000_000, roughTotal: null },
      { date: '2026-11-03', total: null, roughTotal: 400_000 },
      { date: '2026-11-04', total: null, roughTotal: null },
      { date: '2026-11-05', total: -20_000 },
      { date: '2026-11-07', total: 0, roughTotal: 99 },
    ]
    expect(monthRevenue(days)).toBe(5_380_000)
  })

  it('AC-7606.6: 달을 주면 그달 날만 더하고, 센 날이 없으면 null(매출 자료 없음)', () => {
    const days = [
      { date: '2026-10-31', total: 1_000_000, roughTotal: null },
      { date: '2026-11-01', total: 2_000_000, roughTotal: null },
      { date: '2026-11-30', total: 3_000_000, roughTotal: null },
      { date: '2026-12-01', total: 4_000_000, roughTotal: null },
    ]
    expect(monthRevenue(days, NOV)).toBe(5_000_000)
    expect(monthRevenue(days, '2026-08')).toBeNull()
    expect(monthRevenue([])).toBeNull()
    expect(monthRevenue([{ date: '2026-11-04', total: null, roughTotal: null }])).toBeNull()
    expect(revenueRatio(20_370_000, monthRevenue(days, '2026-08'))).toBeNull()
  })
})
