import { addDays, addMonths, compareYmd, eachDay, isYmd, monthOf, monthRange } from '@/lib/analytics/dates'
import { AGE_BANDS, NO_BIRTH } from '@/lib/analytics/patientMix'
import { sumAges, sumRxCodes, sumRxGroups, tileRx, type UisCodeSum, type UisGroupSums } from '@/lib/analytics/uisarang'
import { uisUnitOf, validateUisAgePayload, validateUisRxPayload } from '@/lib/payload/uisarang'
import { validateDayPayload } from '@/lib/payload/validate'
import { revenueDayValues } from '@/lib/revenue/summary'
import type { ReportInput, ReportMetric } from '@/types/aiReport'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { UisAgePayload, UisGroupDef, UisPeriodKind, UisPeriodRow, UisRxPayload } from '@/types/uisarang'

// 의사랑 의원의 AI 경영 리포트 입력(specs/uisarang-upload REQ-8816, design.md §10-5). 순수 함수만 — 네트워크·DB·SDK·node 모듈 없음.
// 서버(app/api/ai/store.ts)가 사용자 세션으로 읽은 줄(UisReportRaw)을 받아 검사(validateUisReportMonths)를 지난 것만으로 입력을 만든다 — 브라우저가 보낸 숫자는 없다.
// 셈은 의사랑 숫자 셈(lib/analytics/uisarang: tileRx·sumRxCodes·sumRxGroups·sumAges)·날 줄 검사(validateDayPayload)·그날 매출(revenueDayValues)을 그대로 부른다.
// 지문이 늘 같게: 지표 차례는 고정, 처방은 sumRxCodes 차례(총액 큰 차례, 같으면 코드 글자 차례), 묶음은 받은 차례(store.ts groupDefsOf = 통계 탭 차례)다.
// 신환 재방문율·처방별 환자 수·동네·보험·원장님별·시간대별 지표는 의사랑 엑셀로 셀 수 없어 만들지 않는다

/** 고른 달 총액 큰 처방 몇 개를 지표로 넣나 */
export const UIS_TOP_RX = 20

// 나이대 열 줄: AGE_BANDS 아홉 + 생년월일 없음(의사랑 나이대 저장 모양 bands와 같은 차례)
const AGE_NAMES: readonly string[] = [...AGE_BANDS, NO_BIRTH]

/**
 * 서버가 읽은 의사랑 줄(검사 전, design.md §10-5 그대로). 세 달 = 고른 달·지난달·작년 같은 달(달마다 1일~말일).
 * groups는 store.ts groupDefsOf가 만든 지금 묶음(통계 탭과 같은 거르기·차례·열쇠, 처방이 든 묶음만)
 */
export type UisReportRaw = {
  days: unknown[] // stats_days { day, payload } · source = 'uisarang'
  coverage: unknown[] // stats_coverage { from_day, to_day } · source = 'uisarang' · 세 달과 겹치는 줄
  sales: unknown[] // sales_days { day, total, rough_total }
  rx: unknown[] // uis_periods { from_day, to_day, payload, updated_at } · kind = 'rx' · 세 달과 겹치는 줄
  age: unknown[] // uis_periods { from_day, to_day, payload, updated_at } · kind = 'age' · 세 달 안
  groups: Array<{ key: string; name: string; codes: string[]; out: string[]; cond: unknown[] }>
}

type SalesDay = { date: string; total: number | null; roughTotal: number | null }

/** 검사를 지난 한 달: 날 줄(하나 이상) · 매출 줄(null = 어긴 줄이 있어 총진료비를 셀 수 없음) */
export type UisValidMonth = { month: string; days: DayPayload[]; sales: SalesDay[] | null }
export type UisReportGroup = UisGroupDef & { name: string }

/** 검사를 지난 세 달. 비교 달은 날 줄이 없거나 어기면 null(덮였는지는 buildUisReportInput이 본다) */
export type ValidUisReportMonths = {
  today: string
  selected: UisValidMonth
  prev: UisValidMonth | null
  lastYear: UisValidMonth | null
  coverage: DateRange[]
  rx: UisPeriodRow<UisRxPayload>[]
  age: UisPeriodRow<UisAgePayload>[]
  groups: UisReportGroup[]
}

type Fields = Record<string, unknown>

const fieldsOf = (row: unknown): Fields | null => (typeof row === 'object' && row !== null && !Array.isArray(row) ? (row as Fields) : null)
const isYmdText = (value: unknown): value is string => typeof value === 'string' && isYmd(value)
// 매출 칸: 0 이상 정수 또는 null(칸이 없으면 어김)
const isMoney = (value: unknown): value is number | null => value === null || (Number.isSafeInteger(value) && (value as number) >= 0)
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])
const sumOf = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

// 줄의 날이 세 달 가운데 몇째 달인가. 날짜가 아니거나 세 달 밖이면 null
function monthIndex(day: unknown, months: readonly string[]): number | null {
  if (!isYmdText(day)) return null
  const at = months.indexOf(monthOf(day))
  return at < 0 ? null : at
}

// 날 줄 → 달마다 검사를 지난 날 숫자. 한 줄이라도 어기면(검사 · payload.day 다름 · 같은 날 두 줄) 그 달은 null,
// 어느 달 줄인지 모르는 줄(객체 아님 · 날짜 아님 · 세 달 밖)이 있으면 세 달 모두 null. 줄이 없는 달도 null
function daysByMonth(rows: readonly unknown[], months: readonly string[]): Array<DayPayload[] | null> {
  const out: Array<DayPayload[] | null> = months.map(() => [])
  for (const row of rows) {
    const o = fieldsOf(row)
    const at = o === null ? null : monthIndex(o.day, months)
    if (o === null || at === null) return months.map(() => null)
    const held = out[at]
    if (held === null) continue
    const payload = validateDayPayload(o.payload)
    if (payload === null || payload.day !== o.day || held.some((day) => day.day === payload.day)) out[at] = null
    else held.push(payload)
  }
  return out.map((days) => (days !== null && days.length > 0 ? days : null))
}

// 매출 줄 → 달마다 날 줄. 한 줄이라도 어기면(금액 칸 · 같은 날 두 줄) 그 달은 null, 어느 달 줄인지 모르는 줄이 있으면 세 달 모두 null
function salesByMonth(rows: readonly unknown[], months: readonly string[]): Array<SalesDay[] | null> {
  const out: Array<SalesDay[] | null> = months.map(() => [])
  for (const row of rows) {
    const o = fieldsOf(row)
    const at = o === null ? null : monthIndex(o.day, months)
    if (o === null || at === null) return months.map(() => null)
    const held = out[at]
    if (held === null) continue
    const { day, total, rough_total: roughTotal } = o
    if (!isMoney(total) || !isMoney(roughTotal) || held.some((sale) => sale.date === day)) out[at] = null
    else held.push({ date: day as string, total, roughTotal })
  }
  return out
}

// 덮은 기간: 두 날이 날짜이고 앞뒤가 맞는 줄만(어긴 줄은 버림 → 덮이지 않은 날이 늘어 partial이 될 뿐)
function coverageOf(rows: readonly unknown[]): DateRange[] {
  return rows.flatMap((row) => {
    const o = fieldsOf(row)
    if (o === null || !isYmdText(o.from_day) || !isYmdText(o.to_day) || compareYmd(o.from_day, o.to_day) > 0) return []
    return [{ from: o.from_day, to: o.to_day }]
  })
}

// 처방·나이대 줄: 날짜 · 기간 모양(처방은 하루·한 주·한 달, 나이대는 하루) · 저장 모양 검사를 지난 줄만(어긴 줄은 버림)
function periodsOf<P>(kind: UisPeriodKind, rows: readonly unknown[], check: (value: unknown) => P | null): UisPeriodRow<P>[] {
  return rows.flatMap((row) => {
    const o = fieldsOf(row)
    if (o === null) return []
    const { from_day: from, to_day: to, payload, updated_at: updatedAt } = o
    if (!isYmdText(from) || !isYmdText(to) || typeof updatedAt !== 'string') return []
    const unit = uisUnitOf(from, to)
    if (unit === null || (kind === 'age' && unit !== 'day')) return []
    const checked = check(payload)
    return checked === null ? [] : [{ kind, from, to, payload: checked, updatedAt }]
  })
}

/**
 * 서버가 읽은 의사랑 줄 검사(AC-8816.9). 날 줄은 isYmd · 그 달 안 · validateDayPayload 통과 · payload.day = day(하나라도 어기면 그 달 날 숫자 없음),
 * 매출 줄은 그 달 날 · total·rough_total이 0 이상 정수 또는 null(하나라도 어기면 그 달 총진료비 null),
 * 덮은 기간·처방·나이대 줄은 지난 줄만 쓴다. 고른 달 날 숫자가 없으면 null(= E-AI-NO-DATA)
 */
export function validateUisReportMonths(raw: UisReportRaw, month: string, today: string): ValidUisReportMonths | null {
  const months = [month, addMonths(month, -1), addMonths(month, -12)]
  const days = daysByMonth(listOf(raw.days), months)
  const selected = days[0]
  if (selected === null) return null
  const sales = Array.isArray(raw.sales) ? salesByMonth(raw.sales, months) : months.map(() => null)
  const monthAt = (at: number): UisValidMonth | null => {
    const found = days[at]
    return found === null ? null : { month: months[at], days: found, sales: sales[at] }
  }
  return {
    today,
    selected: { month, days: selected, sales: sales[0] },
    prev: monthAt(1),
    lastYear: monthAt(2),
    coverage: coverageOf(listOf(raw.coverage)),
    rx: periodsOf('rx', listOf(raw.rx), validateUisRxPayload),
    age: periodsOf('age', listOf(raw.age), validateUisAgePayload),
    // 묶음은 store.ts groupDefsOf가 모양을 이미 본 것이다. 열쇠(key)가 지표 id가 된다(UisGroupDef.id)
    groups: raw.groups.map((group) => ({ id: group.key, name: group.name, codes: [...group.codes], out: [...group.out], cond: [...group.cond] })),
  }
}

// 한 달의 값
type MonthValues = {
  partial: boolean
  patients: number
  newPatients: number
  returning: number
  sales: number | null // 총진료비 = 그날 매출 합(매출 줄이 없거나 어기면 null)
  codes: UisCodeSum[] | null // 처방 코드별 합(그 달이 처방 줄로 다 덮일 때만)
  groups: UisGroupSums['groups'] | null // 묶음별 합(같은 때만)
  ages: number[] | null // 나이대 열 줄 내원 합(진료한 날마다 나이대 줄이 있을 때만)
}

const isIn = (day: string, ranges: readonly DateRange[]) => ranges.some((range) => compareYmd(range.from, day) <= 0 && compareYmd(day, range.to) <= 0)

function monthValues(m: UisValidMonth, valid: ValidUisReportMonths): MonthValues {
  const { today, coverage } = valid
  const range = monthRange(m.month)
  // 이번 달(이상)이거나 그 달에 덮이지 않은 날이 있으면 그 달 전부가 아니다
  const partial = m.month >= monthOf(today) || eachDay(range).some((day) => !isIn(day, coverage))
  const worked = new Set(m.days.filter((day) => day.totals.patients > 0).map((day) => day.day))

  // 처방은 그 달 1일 ~ (말일과 어제 가운데 앞 날). 그 기간이 tileRx로 다 덮일 때만 값
  const yesterday = addDays(today, -1)
  const rxRange = { from: range.from, to: compareYmd(range.to, yesterday) <= 0 ? range.to : yesterday }
  let codes: UisCodeSum[] | null = null
  if (compareYmd(rxRange.from, rxRange.to) <= 0) {
    const tile = tileRx(rxRange, valid.rx, { covered: coverage, worked }, today)
    if (tile.ok) codes = sumRxCodes(tile.used)
  }

  const ages = sumAges(valid.age, range, worked)
  const values = m.sales === null ? [] : revenueDayValues(m.sales)
  return {
    partial,
    patients: sumOf(m.days.map((day) => day.totals.patients)),
    newPatients: sumOf(m.days.map((day) => day.totals.newPatients)),
    // 재진 = 접수 건수 − 신환 − 알 수 없음(비트 입력과 같은 뜻 · 90일초진 칸이 있으면 더한다)
    returning: sumOf(m.days.map((day) => day.totals.returning + (day.totals.first90 ?? 0))),
    sales: values.length === 0 ? null : sumOf(values.map((value) => value.value)),
    codes,
    groups: codes === null ? null : sumRxGroups(codes, valid.groups).groups,
    ages: ages.missingDays === 0 ? ages.bands : null,
  }
}

/**
 * 의사랑 입력(AC-8816.2~4): 접수 건수·신환·재진·총진료비 → 지금 묶음마다 처방량·총액 → 고른 달 총액 큰 처방 UIS_TOP_RX개의 처방량·총액 → 나이대 열 줄 내원 건수,
 * 끝에 source: 'uisarang'. 비교 달은 다 덮인 달만 견준다(아니면 그 달 값 모두 null · hasPrev·hasLastYear 거짓)
 */
export function buildUisReportInput(valid: ValidUisReportMonths): ReportInput {
  const compared = (m: UisValidMonth | null) => {
    if (m === null) return null
    const values = monthValues(m, valid)
    return values.partial ? null : values
  }
  const selected = monthValues(valid.selected, valid)
  const prev = compared(valid.prev)
  const lastYear = compared(valid.lastYear)
  const all = [selected, prev, lastYear]
  const metrics: ReportMetric[] = []
  const add = (id: string, label: string, kind: ReportMetric['kind'], pick: (values: MonthValues) => number | null) => {
    const [s, p, l] = all.map((values) => (values === null ? null : pick(values)))
    metrics.push({ id, label, kind, values: { selected: s, prev: p, lastYear: l } })
  }

  add('total.patients', '접수 건수', 'visits', (v) => v.patients)
  add('total.newPatients', '신환', 'count', (v) => v.newPatients)
  add('total.returning', '재진', 'visits', (v) => v.returning)
  add('sales.total', '총진료비', 'won', (v) => v.sales)

  valid.groups.forEach((group, at) => {
    add(`group:${group.id}.qty`, `처방 그룹 '${group.name}' 처방량`, 'qty', (v) => v.groups?.[at].qty ?? null)
    add(`group:${group.id}.amount`, `처방 그룹 '${group.name}' 총액`, 'won', (v) => v.groups?.[at].amount ?? null)
  })

  // 처방: 이름은 고른 달 것(빈칸뿐이면 코드). 처방이 다 덮인 달에 그 코드가 없으면 0
  const codeIn = (v: MonthValues, code: string) => (v.codes === null ? null : (v.codes.find((item) => item.code === code) ?? { qty: 0, amount: 0 }))
  for (const top of (selected.codes ?? []).slice(0, UIS_TOP_RX)) {
    const name = top.name.trim() === '' ? top.code : top.name
    add(`rx:${top.code}.qty`, `처방 '${name}' 처방량`, 'qty', (v) => codeIn(v, top.code)?.qty ?? null)
    add(`rx:${top.code}.amount`, `처방 '${name}' 총액`, 'won', (v) => codeIn(v, top.code)?.amount ?? null)
  }

  AGE_NAMES.forEach((name, at) => add(`agevisit:${name}`, `연령대 '${name}' 내원 건수`, 'visits', (v) => v.ages?.[at] ?? null))

  const month = valid.selected.month
  return {
    month,
    partial: selected.partial,
    prevMonth: addMonths(month, -1),
    lastYearMonth: addMonths(month, -12),
    hasPrev: prev !== null,
    hasLastYear: lastYear !== null,
    metrics,
    source: 'uisarang',
  }
}
