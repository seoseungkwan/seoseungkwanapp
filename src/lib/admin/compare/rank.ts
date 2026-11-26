import { formatCount, formatRate } from '@/components/charts/format'
import { sumClosed, type SunapClosedDay } from '@/components/stats/sections/SunapSection'
import { pickRange } from '@/components/stats/periodPick'
import { sunapPct } from '@/components/stats/sunapView'
import { groupKey } from '@/components/stats/treatmentView'
import { revisitRates } from '@/components/stats/view'
import { addMonths, compareYmd, isMonth, isYmd, monthRange } from '@/lib/analytics/dates'
import { NO_BIRTH } from '@/lib/analytics/patientMix'
import { rateSummary } from '@/lib/calendar/counts'
import { validateDayPayload, validateMonthSections } from '@/lib/payload/validate'
import { sumPeriod } from '@/lib/revenue/summary'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { RevenueDayRow } from '@/types/revenue'
import type { RxCond } from '@/types/rxGroups'
import type { CompareRaw } from './load'
import type { PayByJob } from './pay'
import { salesRow, type SalesRow } from './sales'

// 의원 비교 대표 숫자(spec admin-view REQ-8014 AC-8014.4, design.md '대표 숫자 표'). 순수 함수.
// raw = 한 의원의 admin_rows 종류별 jsonb 줄(load.ts). 줄마다 지금 줄 검사(validate.ts)로 고르고, 검사 함수를 내보내지 않은 종류
// (sales_days·sunap_days·calendar_counts·stats_rx_groups·달 줄 dropoff)는 저장소 읽기와 같은 규칙의 가벼운 검사로 고른다.
// 숫자는 통계 탭과 같은 순수 함수(sumPeriod·revisitRates·sumClosed·rateSummary·salesRow)로 만든다. 새 공식을 두지 않는다

/** 순위 표 '통계 대표 숫자' 칸 여덟(시안 차례). 건당 진료비는 없다 */
export const REPRESENTATIVE = [
  { key: 'nonpay', label: '비급여 비율' },
  { key: 'revisit30', label: '신환 재방문율 (30일)' },
  { key: 'rsvFirst', label: '신환 예약률' },
  { key: 'block', label: 'Block 전환율' },
  { key: 'appts', label: '예약 수' },
  { key: 'age', label: '가장 많은 나이대' },
  { key: 'goal', label: '목표 달성률' },
  { key: 'three', label: '3번 이상 받은 비율' },
] as const

export type RepKey = (typeof REPRESENTATIVE)[number]['key']
/** value = 줄 세우기 값(% 숫자 그대로·건수), text = 화면 글. 자료가 없으면 둘 다 null(화면 –) */
export type RepValue = { value: number | null; text: string | null }
export type Representative = Record<RepKey, RepValue>

/** 비교 표 세 개가 받는 의원 한 줄. region = 화면 지역 글(시·도 또는 '지역 모름'). 읽지 못한 칸은 null */
export type CompareRow = {
  id: string
  name: string
  own: boolean
  region: string
  sales: SalesRow | null
  pay: PayByJob | null
  rep: Representative | null
}

const NONE: RepValue = { value: null, text: null }

type Row = Record<string, unknown>

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const isWholeOrNull = (value: unknown): value is number | null => value === null || Number.isSafeInteger(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
const inRange = (day: string, range: DateRange) => compareYmd(day, range.from) >= 0 && compareYmd(day, range.to) <= 0

// % 글은 소수 첫째 자리 버림(formatRate), 신환 예약률·Block 전환율은 통계 탭과 같은 sunapPct 글
function rateOf(part: number, whole: number): RepValue {
  return whole > 0 ? { value: (part * 100) / whole, text: `${formatRate(part / whole)}%` } : NONE
}
function sunapRateOf(part: number, whole: number): RepValue {
  return whole > 0 ? { value: (part * 100) / whole, text: sunapPct(part, whole) } : NONE
}

// ── 줄 고르기 ──

const SALES_NUMBERS = [
  ['visits', 'visits'],
  ['newPatients', 'new_patients'],
  ['returnVisits', 'return_visits'],
  ['total', 'total'],
  ['insurer', 'insurer'],
  ['noncovered', 'noncovered'],
  ['copay', 'copay'],
  ['otherTotal', 'other_total'],
  ['cash', 'cash'],
  ['card', 'card'],
  ['transfer', 'transfer'],
  ['receivableIn', 'receivable_in'],
] as const

// sales_days 한 줄 → 매출 날 줄(lib/storage/revenue.ts 저장된 날 읽기와 같은 칸). 모양이 틀리면 null
function salesDayOf(row: Row): RevenueDayRow | null {
  const { day, unconfirmed, split_unconfirmed: splitUnconfirmed, rough_total: roughTotal = null } = row
  if (typeof day !== 'string' || !isYmd(day) || typeof unconfirmed !== 'boolean' || typeof splitUnconfirmed !== 'boolean') return null
  if (!isWholeOrNull(roughTotal)) return null
  const out: Record<string, unknown> = { date: day, unconfirmed, splitUnconfirmed, roughTotal }
  for (const [key, column] of SALES_NUMBERS) {
    const value = row[column]
    if (!isWholeOrNull(value)) return null
    out[key] = value
  }
  return out as RevenueDayRow
}

/** 그달 sales_days 줄 → 매출 날 줄(모양이 틀린 줄은 뺀다). salesRow·sumPeriod가 받는 모양이다 */
export function monthSalesDays(raw: CompareRaw, month: string): RevenueDayRow[] {
  const range = monthRange(month)
  return raw.sales_days.flatMap((row) => {
    const day = salesDayOf(row)
    return day !== null && inRange(day.date, range) ? [day] : []
  })
}

// stats_days 줄: 저장소 읽기(lib/storage/stats.ts)와 같은 검사 — 날 payload 검사 + 줄의 날·일부·출처가 맞아야 한다
function statsDays(raw: CompareRaw): DayPayload[] {
  return raw.stats_days.flatMap((row) => {
    const payload = validateDayPayload(row.payload)
    const fits = payload !== null && payload.day === row.day && payload.partial === row.partial && (row.source === 'bit' || row.source === 'file')
    return fits ? [payload] : []
  })
}

// sunap_days 줄: 마감한 날(closed_at 있음)만, 네 칸은 0 이상 정수(lib/storage/sunap.ts 읽기와 같은 규칙)
function closedDays(raw: CompareRaw, range: DateRange): SunapClosedDay[] {
  return raw.sunap_days.flatMap((row) => {
    const { work_date: day, closed_at: closedAt, late, first_n, rsv_first, d90_n, rsv_d90 } = row
    if (typeof day !== 'string' || !isYmd(day) || !inRange(day, range) || !isFilled(closedAt) || typeof late !== 'boolean') return []
    if (!isCount(first_n) || !isCount(rsv_first) || !isCount(d90_n) || !isCount(rsv_d90)) return []
    return [{ day, late, totals: { first_n, rsv_first, d90_n, rsv_d90 } }]
  })
}

const STATUSES: readonly unknown[] = ['auto', 'came', 'noshow', 'cancel']
const AUTOS: readonly unknown[] = ['came', 'noshow', null]

// calendar_counts 줄(lib/storage/calendar.ts 숫자 칸 읽기와 같은 칸): 이름·차트번호·메모는 없다.
// 시행자 두 칸은 함께 null(시행자 없음, google-link AC-8503.3)이어도 받고, g_moved는 칸이 없거나 null이면 거짓(AC-8503.4)
function apptRows(raw: CompareRaw, range: DateRange) {
  return raw.calendar_counts.flatMap((row) => {
    const { day, staff_id: staffId, staff_name: staffName, kind_id: kindId, kind_name: kindName, status, auto, orig_day: origDay, g_moved: gMoved } = row
    if (typeof day !== 'string' || !isYmd(day) || !inRange(day, range)) return []
    const noStaff = staffId === null && staffName === null
    if (!(noStaff || (isFilled(staffId) && isFilled(staffName))) || !isFilled(kindId) || !isFilled(kindName)) return []
    if (!STATUSES.includes(status) || !AUTOS.includes(auto) || !(origDay === null || (typeof origDay === 'string' && isYmd(origDay)))) return []
    if (!(gMoved === undefined || gMoved === null || typeof gMoved === 'boolean')) return []
    return [
      {
        staffId: staffId as string | null,
        staffName: staffName as string | null,
        kindId,
        kindName,
        status: status as 'auto',
        auto: auto as null,
        origDay: origDay as string | null,
        gMoved: gMoved === true,
      },
    ]
  })
}

function monthRow(raw: CompareRaw, month: string): Row | null {
  return raw.stats_months.find((row) => row.month === month && isMonth(month) && typeof row.partial === 'boolean') ?? null
}

// 통계 처방 묶음(lib/storage/statsRxGroups.ts 읽기와 같은 칸, null은 빈 배열) → 묶음 열쇠, sort_order 차례. 코드가 빈 묶음은 뺀다(DropoffSection과 같음)
function groupKeys(raw: CompareRaw): string[] {
  const groups = raw.stats_rx_groups.flatMap((row) => {
    const { id, name, codes, out_codes: out = null, cond = null, sort_order: sortOrder } = row
    if (typeof id !== 'string' || typeof name !== 'string' || !isStrings(codes) || !Number.isSafeInteger(sortOrder)) return []
    if (!(out === null || isStrings(out))) return []
    const conds = cond === null ? [] : cond
    if (!Array.isArray(conds) || !conds.every((item: unknown) => typeof item === 'object' && item !== null && typeof (item as RxCond).code === 'string' && isStrings((item as RxCond).unless))) return []
    return codes.length === 0 ? [] : [{ codes, out: out ?? [], cond: conds as RxCond[], sortOrder: sortOrder as number }]
  })
  return groups.sort((a, b) => a.sortOrder - b.sortOrder).map((group) => groupKey(group.codes, group))
}

const DROPOFF_STEPS = 6

// 달 줄 dropoff에서 쓰는 칸만 검사(validate.ts dropoffOf와 같은 규칙: 자료 끝 날 ≥ 그달 말일, 대상 1명 이상, 1회 이상 = 대상, 늘지 않음). 틀린 줄이 있으면 통째로 없음
function dropoffLines(row: Row | null, month: string): Map<string, { n: number; atLeast: number[] }> | null {
  const dropoff = row?.dropoff
  if (typeof dropoff !== 'object' || dropoff === null) return null
  const { asOf, lines } = dropoff as Row
  if (typeof asOf !== 'string' || !isYmd(asOf) || compareYmd(asOf, monthRange(month).to) < 0 || !Array.isArray(lines)) return null
  const byGroup = new Map<string, { n: number; atLeast: number[] }>()
  for (const line of lines as unknown[]) {
    if (typeof line !== 'object' || line === null) return null
    const { group, n, atLeast } = line as Row
    if (typeof group !== 'string' || !isCount(n) || n < 1 || byGroup.has(group)) return null
    if (!Array.isArray(atLeast) || atLeast.length !== DROPOFF_STEPS || !atLeast.every(isCount)) return null
    if (atLeast[0] !== n || atLeast.some((count, k) => k > 0 && count > atLeast[k - 1])) return null
    byGroup.set(group, { n, atLeast })
  }
  return byGroup
}

// ── 여덟 ──

function nonpayOf(sales: readonly RevenueDayRow[], month: string): RepValue {
  const sum = sumPeriod(sales, monthRange(month))
  return sum === null || sum.noncovered === null || sum.splitTotal === null ? NONE : rateOf(sum.noncovered, sum.splitTotal)
}

// 그달을 고른 통계 탭과 같은 기간(오늘 = 다음 달 1일, 끝난 달)
function revisitOf(days: readonly DayPayload[], month: string): RepValue {
  const range = pickRange(`${addMonths(month, 1)}-01`, { kind: 'month', unit: 'day', month }, false)
  const { d30 } = revisitRates({ days, covered: [], range })
  return d30.kind === 'rate' ? { value: d30.value * 100, text: `${formatRate(d30.value)}%` } : NONE
}

function rsvFirstOf(raw: CompareRaw, month: string): RepValue {
  const days = closedDays(raw, monthRange(month))
  if (days.length === 0) return NONE
  const sums = sumClosed(days)
  return sunapRateOf(sums.rsvFirst, sums.first)
}

function blockOf(days: readonly DayPayload[], month: string): RepValue {
  const range = monthRange(month)
  let first = 0
  let firstBlock = 0
  let counted = 0
  for (const day of days) {
    if (!inRange(day.day, range) || day.sunap === undefined) continue
    counted += 1
    first += day.sunap.first_n
    firstBlock += day.sunap.first_block
  }
  return counted === 0 ? NONE : sunapRateOf(firstBlock, first)
}

function apptsOf(raw: CompareRaw, month: string): RepValue {
  const rows = apptRows(raw, monthRange(month))
  if (rows.length === 0) return NONE
  const { total } = rateSummary(rows)
  return { value: total, text: `${formatCount(total)}건` }
}

// 생년월일 없음은 나이대가 아니다. 같으면 통계 탭 차례(앞)
function ageOf(row: Row | null, month: string): RepValue {
  const sections = row === null ? null : validateMonthSections(row.sections)
  if (sections === null || sections.month !== month || sections.mix.people === 0) return NONE
  let top: { name: string; people: number } | null = null
  for (const band of sections.mix.age) if (band.name !== NO_BIRTH && band.people > (top?.people ?? 0)) top = band
  if (top === null) return NONE
  const rate = rateOf(top.people, sections.mix.people)
  return { value: rate.value, text: `${top.name} · ${rate.text}` }
}

// 그달 총진료비(salesRow) ÷ 그달 매출 목표. 오늘 기준 목표 속도 셈은 끝난 달에 맞지 않아 쓰지 않는다
function goalOf(raw: CompareRaw, sales: readonly RevenueDayRow[], month: string): RepValue {
  const goal = raw.stats_goals.find((row) => row.month === month)?.revenue
  if (!isCount(goal) || goal === 0) return NONE
  const total = salesRow(sales)?.total ?? null
  return total === null ? NONE : rateOf(total, goal)
}

// 그 의원 처방 묶음 차례에서 그달 줄이 있는 첫 묶음: atLeast[2](3회 이상) ÷ n. 저장된 average·drop은 쓰지 않는다
function threeOf(raw: CompareRaw, row: Row | null, month: string): RepValue {
  const lines = dropoffLines(row, month)
  if (lines === null) return NONE
  for (const key of groupKeys(raw)) {
    const line = lines.get(key)
    if (line) return rateOf(line.atLeast[2]!, line.n)
  }
  return NONE
}

/** 한 의원의 그달(month 'YYYY-MM') 대표 숫자 여덟(REPRESENTATIVE 차례) */
export function representative(raw: CompareRaw, month: string): Representative {
  const sales = monthSalesDays(raw, month)
  const days = statsDays(raw)
  const row = monthRow(raw, month)
  return {
    nonpay: nonpayOf(sales, month),
    revisit30: revisitOf(days, month),
    rsvFirst: rsvFirstOf(raw, month),
    block: blockOf(days, month),
    appts: apptsOf(raw, month),
    age: ageOf(row, month),
    goal: goalOf(raw, sales, month),
    three: threeOf(raw, row, month),
  }
}

/** 그달 저장된 숫자가 있는 의원인지: 매출 줄이 있거나 대표 숫자가 하나라도 있다(급여만으로는 아님, AC-8015.6) */
export function hasMonthNumbers(row: CompareRow): boolean {
  return row.sales !== null || (row.rep !== null && REPRESENTATIVE.some(({ key }) => row.rep![key].value !== null))
}
