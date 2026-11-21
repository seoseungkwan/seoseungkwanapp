import { addMonths, compareYmd, monthOf } from '@/lib/analytics/dates'
import { sortItems } from './order'

// 쓴 양과 달별 보고 (spec inventory REQ-7502 AC-7502.1·AC-7502.2, design.md 2절·8절). 순수 함수만.
// '그 사이 입고'는 저장 순서로 본다(총괄 결정): 앞 세기 저장 시각 < 입고 저장 시각 ≤ 뒤 세기 저장 시각.
// 쓴 양의 달은 뒤 세기 날짜의 달, 구입비의 달은 명세서 날짜(day)의 달. 금액은 원 단위 정수, 합계는 항목 금액의 합.
// 입력 타입은 필요한 칸만 적는다(src/types/inventory.ts의 InvCountLine·InvReceiptLine·InvItem·InvCategory와 칸 이름이 같다)

export type UsageCount = { itemId: string; day: string; savedAt: string; qty: number }
export type UsageReceipt = { itemId: string; savedAt: string; qty: number }
/** 잇단 두 세기 사이(from = 앞 세기 날짜, to = 뒤 세기 날짜). used < 0이면 0으로 세고 missing(빠진 입고) */
export type UsageInterval = { itemId: string; from: string; to: string; month: string; used: number; missing: boolean }

type ReportItem = { id: string; categoryId: string; name: string; sortOrder: number; hidden: boolean }
type ReportCategory = { id: string; name: string; sortOrder: number }
type ReportReceipt = { itemId: string; day: string; savedAt: string; qty: number; amount: number }

export type MonthlyRow<I> = {
  item: I
  used: number | null // 그 달에 끝난 사이의 합, 없으면 null
  prevUsed: number | null
  cost: number // 명세서 날짜가 그 달인 줄 금액 합
  prevCost: number
  change: string // 쓴 양 증감(changeText)
  missing: boolean // 그 달 사이에 빠진 입고가 있음
}
export type MonthlyCategory<C> = { category: C; cost: number; prevCost: number; change: string }
export type MonthlyReport<I, C> = {
  countDays: string[] // 그 달에 끝난 세기 날짜(차례대로)
  numbers: { cost: number; receipts: number; counts: number } // 구입비 합·들어온 기록 건수·세기 횟수
  rows: MonthlyRow<I>[] // 목록 차례
  categories: MonthlyCategory<C>[] // 분류 차례, 줄이 있는 분류만
  total: { cost: number; prevCost: number; change: string }
}

// ── 저장 시각 ─────────────────────────────────────────────

// timestamptz 글자('2026-11-14T01:00:00.123456+00:00' · 'Z' · '+09:00'). Date.parse는 1/1000초까지라 소수는 따로 백만분의 1초로 더한다
const STAMP = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i

/** 1970년부터 백만분의 1초(못 읽으면 null). 시간대가 없으면 UTC로 본다(Supabase는 늘 붙여 준다) */
function timeKey(s: string): number | null {
  const m = STAMP.exec(s.trim())
  if (!m) return null
  const zone = (m[4] ?? 'Z').toUpperCase()
  const offset = zone === 'Z' ? zone : `${zone.slice(0, 3)}:${zone.length > 3 ? zone.slice(-2) : '00'}`
  const ms = Date.parse(`${m[1]}T${m[2]}${offset}`)
  if (Number.isNaN(ms)) return null
  return ms * 1000 + Number((m[3] ?? '').padEnd(6, '0').slice(0, 6))
}

/** a − b의 부호. 둘 다 읽히면 실제 시각으로, 아니면 글자 차례로 */
function compareTime(a: string, b: string): number {
  const x = timeKey(a)
  const y = timeKey(b)
  if (x !== null && y !== null) return Math.sign(x - y)
  return a < b ? -1 : a > b ? 1 : 0
}

// ── 쓴 양 ───────────────────────────────────────────────

function groupBy<T extends { itemId: string }>(list: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const value of list) {
    const group = groups.get(value.itemId)
    if (group) group.push(value)
    else groups.set(value.itemId, [value])
  }
  return groups
}

/** 물품마다 세기 날짜 차례 이웃 둘(A·B)의 쓴 양 = A 수 + (A.savedAt < 입고 savedAt ≤ B.savedAt) 입고 수 − B 수. 첫 세기 앞은 없다 */
export function usageIntervals(counts: readonly UsageCount[], receipts: readonly UsageReceipt[]): UsageInterval[] {
  const receiptsOf = groupBy(receipts)
  const out: UsageInterval[] = []
  for (const [itemId, list] of groupBy(counts)) {
    const sorted = list
      .map((value, index) => ({ value, index }))
      .sort((a, b) => compareYmd(a.value.day, b.value.day) || compareTime(a.value.savedAt, b.value.savedAt) || a.index - b.index)
      .map(({ value }) => value)
    const mine = receiptsOf.get(itemId) ?? []
    for (let k = 1; k < sorted.length; k++) {
      const a = sorted[k - 1]
      const b = sorted[k]
      const came = mine
        .filter((r) => compareTime(a.savedAt, r.savedAt) < 0 && compareTime(r.savedAt, b.savedAt) <= 0)
        .reduce((sum, r) => sum + r.qty, 0)
      const used = a.qty + came - b.qty
      out.push({ itemId, from: a.day, to: b.day, month: monthOf(b.day), used: Math.max(used, 0), missing: used < 0 })
    }
  }
  return out
}

// ── 증감 글 ──────────────────────────────────────────────

const MINUS = '−' // 빼기 기호 −
const EPSILON = 1e-9
const comma = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * 지난달과 견준 증감(시안 글자): '+4 (+13.3%)' · '−92,500원 (−9.2%)'(비율은 소수 첫째 자리까지 버림).
 * 지난달이 없거나 0이면 '새로 생김'(이번 달도 0·없음이면 '–'), 이번 달이 없으면 '–', 같으면 '변화 없음'
 */
export function changeText(now: number | null, prev: number | null, unit = ''): string {
  if (now === null) return '–'
  if (prev === null || prev === 0) return now > 0 ? '새로 생김' : '–'
  const diff = now - prev
  if (diff === 0) return '변화 없음'
  const sign = diff > 0 ? '+' : MINUS
  const pct = (Math.floor((Math.abs(diff) * 1000) / Math.abs(prev) + EPSILON) / 10).toFixed(1)
  return `${sign}${comma(Math.abs(diff))}${unit} (${sign}${pct}%)`
}

// ── 달별 보고 ─────────────────────────────────────────────

type Used = { used: number; missing: boolean }

function usedIn(intervals: readonly UsageInterval[], month: string): Map<string, Used> {
  const byItem = new Map<string, Used>()
  for (const iv of intervals) {
    if (iv.month !== month) continue
    const seen = byItem.get(iv.itemId)
    byItem.set(iv.itemId, { used: (seen?.used ?? 0) + iv.used, missing: (seen?.missing ?? false) || iv.missing })
  }
  return byItem
}

/**
 * 고른 달(YYYY-MM)과 지난달의 쓴 양·구입비. counts·receipts는 고른 달 첫날 − 1달 − 35일 ~ 달 끝을 넘긴다(TASK-12).
 * 물품 줄은 목록 차례(분류 → sort_order → 이름)이고 숨긴 물품은 두 달 안에 자료가 있을 때만 줄이 있다.
 * 분류 합은 물품의 지금 분류로 묶은 구입비, 들어온 기록 건수는 입고 한 건(저장 시각)마다 하나
 */
export function monthlyReport<I extends ReportItem, C extends ReportCategory>(input: {
  month: string
  items: readonly I[]
  categories: readonly C[]
  counts: readonly UsageCount[]
  receipts: readonly ReportReceipt[]
}): MonthlyReport<I, C> {
  const { month, items, categories, counts, receipts } = input
  const prev = addMonths(month, -1)
  const intervals = usageIntervals(counts, receipts)
  const usedNow = usedIn(intervals, month)
  const usedBefore = usedIn(intervals, prev)

  const money = new Map<string, { cost: number; prevCost: number }>()
  const receiptKeys = new Set<string>()
  for (const line of receipts) {
    const m = monthOf(line.day)
    if (m !== month && m !== prev) continue
    const sums = money.get(line.itemId) ?? { cost: 0, prevCost: 0 }
    if (m === month) {
      sums.cost += line.amount
      receiptKeys.add(String(timeKey(line.savedAt) ?? line.savedAt))
    } else sums.prevCost += line.amount
    money.set(line.itemId, sums)
  }

  const countDays = [...new Set(counts.filter((c) => monthOf(c.day) === month).map((c) => c.day))].sort(compareYmd)

  const rows = sortItems(items, categories).flatMap((item): MonthlyRow<I>[] => {
    const now = usedNow.get(item.id)
    const before = usedBefore.get(item.id)
    const sums = money.get(item.id)
    if (item.hidden && now === undefined && before === undefined && sums === undefined) return []
    const used = now?.used ?? null
    const prevUsed = before?.used ?? null
    return [
      {
        item,
        used,
        prevUsed,
        cost: sums?.cost ?? 0,
        prevCost: sums?.prevCost ?? 0,
        change: changeText(used, prevUsed),
        missing: now?.missing ?? false,
      },
    ]
  })

  // 물품 줄이 이미 분류 차례라 처음 나온 차례가 곧 분류 차례다
  const categoryOf = new Map(categories.map((c) => [c.id, c]))
  const byCategory = new Map<string, { category: C; cost: number; prevCost: number }>()
  for (const row of rows) {
    const category = categoryOf.get(row.item.categoryId)
    if (category === undefined) continue
    const sums = byCategory.get(category.id) ?? { category, cost: 0, prevCost: 0 }
    sums.cost += row.cost
    sums.prevCost += row.prevCost
    byCategory.set(category.id, sums)
  }

  const cost = rows.reduce((sum, row) => sum + row.cost, 0)
  const prevCost = rows.reduce((sum, row) => sum + row.prevCost, 0)
  return {
    countDays,
    numbers: { cost, receipts: receiptKeys.size, counts: countDays.length },
    rows,
    categories: [...byCategory.values()].map((c) => ({ ...c, change: changeText(c.cost, c.prevCost, '원') })),
    total: { cost, prevCost, change: changeText(cost, prevCost, '원') },
  }
}
