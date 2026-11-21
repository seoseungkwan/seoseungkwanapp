// 급여 셈(staff REQ-7606, design.md 4절). 순수 함수 — 네트워크·저장소·React를 쓰지 않는다.
// 형은 design.md 3절과 같은 칸 이름의 자기 입력 형이다(@/types/staff를 불러오지 않음 — 구조가 같아 그대로 넘긴다).
// 금액은 원 단위 정수, 원 미만은 항목마다 버리고, 합계는 항목 금액의 합이다(CLAUDE.md, plan.md §5).
// 달 줄은 그때 인센티브 규칙을 복사해 두고(incentives), 합계는 늘 그 복사본으로 센다 — 규칙을 고쳐도 앞 달 금액이 바뀌지 않는다(ADR-039)
import { isMonth, monthOf } from '@/lib/analytics/dates'
import { revenueDayValues } from '@/lib/revenue/summary'

export type PayItem = { id: string; name: string; kind: 'amount' | 'incentive'; base: boolean; removedFrom: string | null }
export type IncentiveMethod = 'per_case' | 'percent' | 'fixed'
export type IncentiveRule = { id: string; staffId: string; name: string; method: IncentiveMethod; unitAmount: number | null; percent: number | null; sort: number }
export type IncentiveEntry = {
  ruleId: string | null
  name: string
  method: IncentiveMethod
  unitAmount: number | null
  percent: number | null
  count: number | null
  sales: number | null
}
export type AdjustReason = 'prorate' | 'deduct' | 'other'
export type PayLine = {
  id: string | null
  month: string
  staffId: string | null
  amounts: Record<string, number>
  incentives: IncentiveEntry[]
  adjust: number
  adjustReason: AdjustReason | null
  adjustMemo: string | null
}
export type LineTotal = { total: number; incentive: number; problem: string | null }
export type LaborCost = { pay: number; cost: number; count: number }
// 매출 날 줄에서 셈에 쓰는 칸만(RevenueDayRow)
export type RevenueDay = { date: string; total: number | null; roughTotal?: number | null }

const ITEMS_MAX = 30 // AC-7615.4
const ITEM_NAME_MAX = 10 // AC-7615.4
const ITEMS_BYTES_MAX = 4_000 // AC-7601.6 pay_items 크기
const NEGATIVE_TOTAL = '합계가 0원보다 적어요'

/** 그달에 보이는 항목: 뺀 달(removedFrom) 앞 달에만 보인다. 차례는 그대로 */
export function visibleItems<T extends Pick<PayItem, 'removedFrom'>>(items: readonly T[], month: string): T[] {
  return items.filter((item) => item.removedFrom === null || month < item.removedFrom)
}

/**
 * 항목 목록 검사(AC-7615.4): 30개까지, 이름 1~10자(앞뒤 빈칸 없음), 지금 쓰는 항목끼리 이름이 겹치지 않음.
 * id 겹침·빈 id·인센티브 항목 둘·뺀 달 모양 틀림·4,000바이트 넘음은 화면이 만들 수 없는 값이라 한 문구로 막는다. 문제가 없으면 null
 */
export function checkPayItems(items: readonly PayItem[]): string | null {
  if (items.length > ITEMS_MAX) return '항목은 30개까지 둘 수 있어요.'
  const badName = (name: string) => name.length === 0 || name.trim() !== name || [...name].length > ITEM_NAME_MAX
  if (items.some((item) => typeof item.name !== 'string' || badName(item.name))) return '항목 이름은 1~10자로 적어 주세요.'
  const active = items.filter((item) => item.removedFrom === null).map((item) => item.name)
  if (new Set(active).size !== active.length) return '같은 이름의 항목이 있어요.'
  const ids = items.map((item) => item.id)
  const broken =
    ids.some((id) => typeof id !== 'string' || id === '') ||
    new Set(ids).size !== ids.length ||
    items.some((item) => !(item.kind === 'amount' || item.kind === 'incentive') || typeof item.base !== 'boolean') ||
    items.filter((item) => item.kind === 'incentive').length > 1 ||
    items.some((item) => !(item.removedFrom === null || (typeof item.removedFrom === 'string' && isMonth(item.removedFrom)))) ||
    new TextEncoder().encode(JSON.stringify(items)).length > ITEMS_BYTES_MAX
  return broken ? '항목 목록이 맞지 않아요. 화면을 새로 고쳐 주세요.' : null
}

/**
 * 인센티브 한 줄(AC-7606.1): 건당 정액 = 건수 × 금액, 매출의 % = ⌊매출 × % ÷ 100⌋(정수 셈), 고정 수당 = 금액.
 * 건수·매출·금액이 비면 0이다. %는 소수 둘째 자리까지라 100배 한 정수로 센다(0.29 × 100 = 28.999… 같은 찌꺼기를 막는다)
 */
export function incentiveAmount(entry: Pick<IncentiveEntry, 'method' | 'unitAmount' | 'percent' | 'count' | 'sales'>): number {
  if (entry.method === 'fixed') return entry.unitAmount ?? 0
  if (entry.method === 'per_case') return (entry.count ?? 0) * (entry.unitAmount ?? 0)
  const basisPoints = Math.round((entry.percent ?? 0) * 100)
  return Math.floor(((entry.sales ?? 0) * basisPoints) / 10_000)
}

/**
 * 한 사람 그달 합계(AC-7606.2) = 그달 보이는 금액 항목 합 + 인센티브 합(인센티브 항목이 보일 때) + 조정.
 * 더 일한 시간은 금액이 아니라 넣지 않는다. 0원 밑이면 problem(저장을 막는 문구)
 */
export function lineTotal(line: Pick<PayLine, 'amounts' | 'incentives' | 'adjust'>, items: readonly PayItem[], month: string): LineTotal {
  const shown = visibleItems(items, month)
  const amounts = shown.filter((item) => item.kind === 'amount').reduce((sum, item) => sum + (line.amounts[item.id] ?? 0), 0)
  const incentive = shown.some((item) => item.kind === 'incentive') ? line.incentives.reduce((sum, entry) => sum + incentiveAmount(entry), 0) : 0
  const total = amounts + incentive + line.adjust
  return { total, incentive, problem: total < 0 ? NEGATIVE_TOTAL : null }
}

/**
 * 규칙으로 인센티브 줄을 다시 만든다(AC-7606.4): 넘긴 규칙 차례대로 이름·방식·값은 규칙 것, 적은 건수·매출은 같은 규칙 id 줄에서 그대로.
 * 뺀 규칙 줄(과 규칙 id가 없는 줄)은 빠지고 새 규칙은 빈 실적이다. rules는 그 사람 규칙만 차례대로 넘긴다.
 * 저장 층 saveRules(lib/storage/staff.ts reapplyRules)와 같은 셈이다
 */
export function applyRules(entries: readonly IncentiveEntry[], rules: readonly IncentiveRule[]): IncentiveEntry[] {
  return rules.map((rule) => {
    const old = entries.find((entry) => entry.ruleId === rule.id)
    return { ruleId: rule.id, name: rule.name, method: rule.method, unitAmount: rule.unitAmount, percent: rule.percent, count: old?.count ?? null, sales: old?.sales ?? null }
  })
}

/**
 * 줄이 없는 달의 새 줄(AC-7606.3): 금액 비움 · 인센티브는 그 사람 지금 규칙(sort 차례, 건수·매출 비움) · 조정 0.
 * rules에 다른 사람 규칙이 섞여 있어도 된다(staffId로 고른다)
 */
export function newLine(input: { month: string; staffId: string; rules: readonly IncentiveRule[] }): PayLine {
  const own = input.rules.filter((rule) => rule.staffId === input.staffId).sort((a, b) => a.sort - b.sort)
  return { id: null, month: input.month, staffId: input.staffId, amounts: {}, incentives: applyRules([], own), adjust: 0, adjustReason: null, adjustMemo: null }
}

/**
 * [지난달 금액 가져오기](AC-7606.3): 이달 줄의 그달 보이는 금액 항목 가운데 아직 값이 없는 칸만 지난달 그 사람 값으로 채운다.
 * 인센티브 실적·조정은 가져오지 않는다. 새 줄을 돌려주고 넘긴 줄은 바꾸지 않는다
 */
export function copyPrev(line: PayLine, prev: Pick<PayLine, 'amounts'> | null, items: readonly PayItem[], month: string): PayLine {
  const amounts = { ...line.amounts }
  if (prev !== null) {
    for (const item of visibleItems(items, month)) {
      if (item.kind !== 'amount' || amounts[item.id] !== undefined) continue
      const won = prev.amounts[item.id]
      if (won !== undefined) amounts[item.id] = won
    }
  }
  return { ...line, amounts, incentives: line.incentives.map((entry) => ({ ...entry })) }
}

/**
 * 그달 인건비(AC-7606.5): pay = 그달 모든 줄(직원이 지워진 줄 포함) 합계의 합, cost = pay + 병원 부담분(없으면 0), count = 줄 수.
 * lines에 다른 달 줄이 섞여 있어도 된다(month로 고른다)
 */
export function laborCost(lines: readonly PayLine[], items: readonly PayItem[], month: string, employerCost: number | null): LaborCost {
  const own = lines.filter((line) => line.month === month)
  const pay = own.reduce((sum, line) => sum + lineTotal(line, items, month).total, 0)
  return { pay, cost: pay + (employerCost ?? 0), count: own.length }
}

/**
 * 매출 대비 인건비 %(AC-7606.6): 인건비 ÷ 매출 × 100을 소수 첫째 자리로 반올림(딱 반이면 올림).
 * 매출이 없거나 0 이하면 null('매출 자료 없음'). cost × 1000은 정수라 나눈 값의 반 올림이 정확하다
 */
export function revenueRatio(cost: number, revenue: number | null): number | null {
  if (revenue === null || !(revenue > 0)) return null
  return Math.round((cost * 1_000) / revenue) / 10
}

/**
 * 그달 매출(AC-7606.6) = sales_days 줄의 revenueDayValues(lib/revenue/summary.ts) 값의 합. month를 주면 그달 날만 센다.
 * 센 날이 하나도 없으면 null(매출 자료 없음)
 */
export function monthRevenue(days: readonly RevenueDay[], month?: string): number | null {
  const rows = month === undefined ? days : days.filter((day) => monthOf(day.date) === month)
  const values = revenueDayValues(rows)
  return values.length === 0 ? null : values.reduce((sum, day) => sum + day.value, 0)
}
