import { formatCount, formatRate, percentOf, truncatedOne } from '@/components/charts/format'
import { formatManWon } from '@/components/revenue/money'
import { sumClosed, type SunapClosedDay } from '@/components/stats/sections/SunapSection'
import { hasFinal, pickRange } from '@/components/stats/periodPick'
import { revenueCells, revenueTabs, type RevenueInput } from '@/components/stats/revenueView'
import { sunapPct } from '@/components/stats/sunapView'
import { groupKey, treatmentRows } from '@/components/stats/treatmentView'
import { revisitRates, summaryCells, visitTrend, weekdayRows, type StatsInput, type StatsRateCell } from '@/components/stats/view'
import type { CompareRaw } from '@/lib/admin/compare/load'
import { salesRow } from '@/lib/admin/compare/sales'
import { isUisClinic, uisAgeMix, uisGroupQty, uisRxRows, uisAgeRows, type UisAgeMix } from '@/lib/admin/compare/uis'
import { buildAlerts, type Alert, type AlertGroup } from '@/lib/analytics/alerts'
import { mergeRanges } from '@/lib/analytics/coverage'
import { addDays, isMonth, isYmd, monthRange } from '@/lib/analytics/dates'
import { holidayEffect, type HolidayRow } from '@/lib/analytics/holidayEffect'
import { NO_BIRTH } from '@/lib/analytics/patientMix'
import { formatQty } from '@/lib/analytics/uisarang'
import { cellAverage, foldHours, heatLevel, VISIT_HOURS } from '@/lib/analytics/visitHours'
import { ratePct, rateSummary } from '@/lib/calendar/counts'
import { validateDayPayload, validateMonthPayload, validateMonthSections } from '@/lib/payload/validate'
import { sumPeriod } from '@/lib/revenue/summary'
import type { ApptAuto, ApptStatus, CalCountRow } from '@/types/calendar'
import type { DateRange } from '@/types/dates'
import { GOAL_REVENUE_MAX } from '@/types/goals'
import type { DayPayload, MonthPayload, MonthSections } from '@/types/payload'
import { REVENUE_DAY_KEYS, type RevenueDayRow } from '@/types/revenue'
import type { RxCond, StatsRxGroup } from '@/types/rxGroups'
import { SUNAP_TOTAL_KEYS, type SunapRates } from '@/types/sunap'

// 통계 나란히 보기 칸 값 (spec admin-view REQ-8014 AC-8014.5, design.md '통계 나란히 보기 칸 표'·'의원 비교 — 계산'). 순수 함수.
// 한 의원의 admin_rows 줄(load.ts CompareRaw, jsonb 그대로)을 지금 줄 검사 함수(validate.ts)·저장소와 같은 모양 검사로 받고,
// 칸 값은 통계 탭과 같은 순수 함수(components/stats/view.ts·revenueView.ts·lib/analytics/*·lib/revenue/*·lib/calendar/counts.ts)로 만든다 — 새 공식이 없다.
// 기간 = 고른 달(증감 비교 = 지난달, 통계 탭 달 고르기 pickRange와 같다, 오늘 = 다음 달 1일). '휴일에 따라'만 그달 끝까지 12달(stats_day_totals).
// 저장되지 않은 값은 null이다(화면 '–'·그 칸의 빈 글). 고른 달이 10년 앞 옛 달이어도 셈은 같다.
// 의사랑 의원(clinic_emr uisarang, spec uisarang-upload REQ-8813 AC-8813.3·AC-8813.4, design.md §10-4)이면 uis가 참이고,
// 환자 구성 = 그달 나이대 하루 줄 합(내원 건), 처방별 추세 자리 = 묶음별 처방량 위 셋(그달이 처방 줄로 다 덮일 때만, lib/admin/compare/uis.ts),
// 셀 수 없는 칸(처방별 신환·재진·몇 번까지 받나·원장님별·시간대별 접수·Block 전환)은 값이 없고 화면이 안내 글을 그린다(CompareCells).
// 새 두 종류는 열쇠가 없을 수 있어(열여덟 종류만 만든 값) `?? []`로 읽는다 — 그 값은 비트 의원 그대로다

/** 숫자 칸 하나. value null = '–'(단위 없음) */
export type CellNumber = { label: string; value: string | null; unit: string }
/** 가로 막대 줄. width = 그리는 폭 0~100 */
export type CellBar = { name: string; text: string; width: number }
/** 작은 세로 막대. columns = 칸마다 아래부터 쌓는 값, from·to = 아래 축 글 */
export type CellColumns = { columns: number[][]; from: string; to: string }
/** 평소와 다른 것 한 줄: 표시 · 비율('19%', 주의 줄은 null) · 문장 */
export type CellAlert = { kind: Alert['kind']; rate: string | null; text: string }
export type CellGoal = { rate: string | null; goal: string; width: number }
export type CellShare = { key: 'covered' | 'noncovered' | 'other'; name: string; share: string; width: number }
/** 작은 표 한 줄: 굵은 이름 + 오른쪽 칸들 */
export type CellTableRow = { name: string; cells: string[] }

export type CompareStatsCells = {
  /** 그달 자료가 하나라도 있나(없으면 칸 전체 '자료 없음') */
  hasData: boolean
  /** 의사랑 의원이면 참(비트 의원은 열쇠 없음) — 셀 수 없는 칸은 안내 글, 처방 줄 이름은 묶음별 처방량 */
  uis?: true
  summary: { patients: CellNumber[]; revenue: CellNumber[]; alerts: CellAlert[] | null; goal: CellGoal | null }
  patients: { daily: CellColumns | null; age: CellBar[] | null; revisit: CellNumber[]; dropoff: CellBar[] | null }
  revenue: { trend: { columns: CellColumns; total: string } | null; split: CellShare[] | null }
  /** 신환 예약률 · 90일 예약률 · Block 전환. null = 수납일지를 마감한 날이 없음 */
  sunap: CellNumber[] | null
  /** 예약 수 · 취소율 · 변경율 · 안 옴율. null = 예약 탭에 적은 예약이 없음 */
  calendar: CellNumber[] | null
  /** trend = 처방별 추세(의사랑 의원은 묶음별 처방량, 값은 처방량 글) */
  rx: { trend: CellBar[] | null; split: CellTableRow[] | null }
  ops: {
    doctors: CellTableRow[] | 'single' | null
    hours: { levels: number[]; from: string; to: string } | null
    weekdays: { names: string[]; values: number[] } | null
    holiday: CellTableRow[] | null
  }
}

type Row = Record<string, unknown>

const DASH = '–'
const MINUS = '−'
const TOP = 3 // 환자 구성·처방별 추세 줄 수(시안)
const HEAT_WINDOW = { from: 9, to: 18 } // 시간대별 접수 열 칸(시안 9시~18시)
const FEW_DAYS = 5 // 휴일에 따라: 날 수가 이보다 적으면 '아직 적어요'(HolidaySection과 같다)
const CAL_ID_MAX = 40 // 예약 시행자·종류 id(lib/storage/calendar.ts와 같다)
const CAL_LABEL_MAX = 10
const STATUSES: readonly ApptStatus[] = ['auto', 'came', 'noshow', 'cancel']
const HOLIDAY_NAMES: Partial<Record<HolidayRow['key'], string>> = { before: '공휴일 앞날', after: '공휴일 다음 날' }
const WEEKDAY_SHORT = '월화수목금토일'

const isRecord = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
const isDay = (value: unknown): value is string => typeof value === 'string' && isYmd(value)
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
const lengthIn = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && [...value].length >= min && [...value].length <= max
const inMonth = (day: string, month: string) => day.startsWith(`${month}-`)
const sum = (values: readonly number[]) => values.reduce((total, n) => total + n, 0)
const monthDay = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
// '63.4%' → 숫자 '63.4'·단위 '%', '–' → null
const pctCell = (label: string, text: string): CellNumber => ({ label, value: text === DASH ? null : text.replace(/%$/, ''), unit: '%' })

// ── 줄 받기(저장소와 같은 검사) ──────────────────────────────

const SOURCES: readonly unknown[] = ['bit', 'file', 'uisarang']

// stats_days: readPeriod(lib/storage/stats.ts)처럼 payload 검사 + 줄의 날·partial·출처(비트·파일·의사랑)가 맞는 것만. 같은 날은 뒤 줄
function statsDays(rows: readonly Row[]): DayPayload[] {
  const byDay = new Map<string, DayPayload>()
  for (const row of rows) {
    const payload = validateDayPayload(row.payload)
    if (payload === null || payload.day !== row.day || payload.partial !== row.partial || !SOURCES.includes(row.source)) continue
    byDay.set(payload.day, payload)
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

// stats_day_totals: 날 합계만 있는 줄을 빈 처방·묶음·재방문의 날 줄로 감싸 같은 검사를 지난 것만(휴일에 따라는 내원 수만 쓴다)
function dayTotals(rows: readonly Row[]): DayPayload[] {
  return rows.flatMap((row) => {
    const payload = validateDayPayload({
      schemaVersion: 2,
      quality: 'valid',
      day: row.day,
      partial: row.partial,
      totals: row.totals,
      rx: [],
      groups: [],
      revisit: { cohort: 0, within7: 0, within14: 0 },
    })
    return payload === null ? [] : [payload]
  })
}

// readCoverage와 같다
function coverage(rows: readonly Row[]): DateRange[] {
  return mergeRanges(rows.flatMap((row) => (isDay(row.from_day) && isDay(row.to_day) ? [{ from: row.from_day, to: row.to_day }] : [])))
}

// stats_months: 달 줄은 처방·묶음·dropoff·sections만 실어 온다. 합계·재방문은 0으로 채워 달 줄 검사를 그대로 지나게 하고, sections는 따로 검사한다
function monthOf(rows: readonly Row[], month: string): { payload: MonthPayload | null; sections: MonthSections | null } {
  const row = rows.find((one) => one.month === month)
  if (row === undefined) return { payload: null, sections: null }
  const payload = validateMonthPayload({
    schemaVersion: 2,
    quality: 'valid',
    month,
    partial: row.partial,
    totals: { patients: 0, newPatients: 0, returning: 0, unknown: 0 },
    rx: row.rx,
    groups: row.groups,
    revisit: { cohort: 0, within7: 0, within14: 0 },
    regions: [],
    ...(row.dropoff === null || row.dropoff === undefined ? {} : { dropoff: row.dropoff }),
  })
  const sections = validateMonthSections(row.sections)
  return { payload, sections: sections !== null && sections.month === month ? sections : null }
}

const isCond = (value: unknown): value is RxCond => isRecord(value) && typeof value.code === 'string' && isStrings(value.unless)

// stats_rx_groups: 처방 묶음 저장소(fromDbGroup)와 같은 칸
function rxGroups(rows: readonly Row[]): StatsRxGroup[] {
  return rows.flatMap((row): StatsRxGroup[] => {
    const { id, name, codes, sort_order: sortOrder } = row
    const out = row.out_codes ?? []
    const cond = row.cond ?? []
    if (typeof id !== 'string' || typeof name !== 'string' || !isStrings(codes) || !Number.isSafeInteger(sortOrder)) return []
    if (!isStrings(out) || !Array.isArray(cond) || !cond.every(isCond)) return []
    return [{ id, name, codes, out, cond, sortOrder: sortOrder as number }]
  })
}

// 처방 든 묶음만, sortOrder 차례, 같은 열쇠는 한 번만(AlertsSection·groupDefs와 같은 규칙)
function keyedGroups(groups: readonly StatsRxGroup[]): AlertGroup[] {
  const seen = new Set<string>()
  return [...groups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((group) => {
      if (group.codes.length === 0) return []
      const id = groupKey(group.codes, group)
      if (seen.has(id)) return []
      seen.add(id)
      return [{ id, name: group.name }]
    })
}

// stats_goals: 그달 매출 목표(목표 저장소와 같은 범위). 없거나 0이면 null
function revenueGoal(rows: readonly Row[], month: string): number | null {
  const revenue = rows.find((row) => row.month === month)?.revenue
  return isCount(revenue) && revenue > 0 && revenue <= GOAL_REVENUE_MAX ? revenue : null
}

type SavedDay = RevenueDayRow & { dayCodes: boolean }
const columnOf = (key: string) => (key === 'date' ? 'day' : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`))
const isMoney = (value: unknown) => value === null || Number.isSafeInteger(value)
const FLAGS = new Set(['unconfirmed', 'splitUnconfirmed'])

// sales_days: 매출 저장소(fromDbDay)와 같은 칸. 날짜·숫자·참거짓 모양이 틀린 줄은 뺀다
function salesDays(rows: readonly Row[]): SavedDay[] {
  return rows.flatMap((row): SavedDay[] => {
    if (!isDay(row.day) || typeof row.day_codes !== 'boolean' || !isMoney(row.rough_total ?? null)) return []
    const day: Row = { dayCodes: row.day_codes, roughTotal: row.rough_total ?? null }
    for (const key of REVENUE_DAY_KEYS) {
      const value = row[columnOf(key)]
      if (key === 'date') day.date = value
      else if (FLAGS.has(key) ? typeof value !== 'boolean' : !isMoney(value)) return []
      else day[key] = value
    }
    return [day as SavedDay]
  })
}

// sunap_days: 마감한 날 줄(toSunapDay와 같은 검사)
function closedDays(rows: readonly Row[]): SunapClosedDay[] {
  return rows.flatMap((row): SunapClosedDay[] => {
    const { work_date: day, closed_at: closedAt, late } = row
    if (!isDay(day) || typeof closedAt !== 'string' || closedAt === '' || typeof late !== 'boolean') return []
    if (!SUNAP_TOTAL_KEYS.every((key) => isCount(row[key]))) return []
    return [{ day, late, totals: { first_n: row.first_n as number, rsv_first: row.rsv_first as number, d90_n: row.d90_n as number, rsv_d90: row.rsv_d90 as number } }]
  })
}

const isStatus = (value: unknown): value is ApptStatus => (STATUSES as readonly unknown[]).includes(value)
const isAuto = (value: unknown): value is ApptAuto => value === null || value === 'came' || value === 'noshow'

// calendar_counts: 예약 저장소(toCount)와 같은 검사. 이름·차트번호 없는 수 세기 줄이다.
// 시행자 두 칸은 함께 null(시행자 없음, google-link AC-8503.3)이어도 받고, g_moved는 칸이 없거나 null이면 거짓(AC-8503.4)
function calRows(rows: readonly Row[]): CalCountRow[] {
  return rows.flatMap((row): CalCountRow[] => {
    const { day, staff_id: staffId, staff_name: staffName, kind_id: kindId, kind_name: kindName, status, auto, orig_day: origDay, g_moved: gMoved } = row
    const noStaff = staffId === null && staffName === null
    if (!isDay(day) || !(noStaff || (lengthIn(staffId, 1, CAL_ID_MAX) && lengthIn(staffName, 1, CAL_LABEL_MAX)))) return []
    if (!lengthIn(kindId, 1, CAL_ID_MAX) || !lengthIn(kindName, 1, CAL_LABEL_MAX) || !isStatus(status) || !isAuto(auto)) return []
    if (!(origDay === null || isDay(origDay))) return []
    if (!(gMoved === undefined || gMoved === null || typeof gMoved === 'boolean')) return []
    return [{ day, staffId: staffId as string | null, staffName: staffName as string | null, kindId, kindName, status, auto, origDay, gMoved: gMoved === true }]
  })
}

// clinic_profiles: 병원 휴진일(날짜 모양만)
function closedDates(rows: readonly Row[]): string[] {
  const dates = rows[0]?.closed_dates
  return Array.isArray(dates) ? dates.filter(isDay) : []
}

// ── 칸 값 ────────────────────────────────────────────────

// '신환 · 이번 주 54명, 지난 4주 평균 27명보다 100% 많아요' → ▲ '100%' + '신환이 평소보다 많아요'(시안 꼴). 주의 줄은 문장 그대로
function alertCell(alert: Alert): CellAlert {
  const match = alert.kind === 'warn' ? null : / (\d+)% (적어요|많아요)$/.exec(alert.text)
  if (match === null) return { kind: alert.kind, rate: null, text: alert.text }
  return { kind: alert.kind, rate: `${match[1]}%`, text: `${alert.name}${hasFinal(alert.name) ? '이' : '가'} 평소보다 ${match[2]}` }
}

function goalCell(total: number | null, goal: number | null): CellGoal | null {
  if (goal === null) return null
  return { rate: total === null ? null : `${truncatedOne((total * 100) / goal)}%`, goal: formatManWon(goal), width: total === null ? 0 : percentOf(total, goal) }
}

// 나이대 열 줄(비트 = 달 sections.mix, 의사랑 = 그달 나이대 하루 줄 합)에서 많은 나이대 셋과 몫
function ageBars(mix: UisAgeMix | null): CellBar[] | null {
  if (mix === null || mix.people === 0) return null
  const { people, age } = mix
  const top = age
    .filter((row) => row.name !== NO_BIRTH && row.people > 0)
    .sort((a, b) => b.people - a.people)
    .slice(0, TOP)
  if (top.length === 0) return null
  return top.map((row) => ({ name: row.name, text: `${formatRate(row.people / people)}%`, width: percentOf(row.people, top[0]!.people) }))
}

const rateValue = (label: string, cell: StatsRateCell): CellNumber => ({ label, value: cell.kind === 'rate' ? formatRate(cell.value) : null, unit: '%' })

// 그 의원 묶음 차례의 첫 묶음 줄. 1번·2번·3번 이상 = 1·2·3회 이상 인원 ÷ 대상(통계 탭 몇 번까지 받나 'k회 이상'과 같은 분자·분모, 저장된 평균은 쓰지 않음)
function dropoffBars(payload: MonthPayload | null, groups: readonly AlertGroup[]): CellBar[] | null {
  const lines = payload?.dropoff?.lines ?? []
  const line = groups.map((group) => lines.find((one) => one.group === group.id)).find((one) => one !== undefined)
  if (line === undefined || line.n === 0) return null
  return (['1번', '2번', '3번 이상'] as const).map((name, i) => ({ name, text: `${formatRate(line.atLeast[i]! / line.n)}%`, width: percentOf(line.atLeast[i]!, line.n) }))
}

function splitShares(days: readonly SavedDay[], month: string): CellShare[] | null {
  const sums = sumPeriod(days, monthRange(month))
  if (sums === null) return null
  const { covered, noncovered, other, splitTotal } = sums
  if (splitTotal === null || !(splitTotal > 0) || covered === null || noncovered === null || other === null) return null
  const share = (key: CellShare['key'], name: string, part: number): CellShare => ({ key, name, share: `${formatRate(part / splitTotal)}%`, width: percentOf(part, splitTotal) })
  return [share('covered', '급여', covered), share('noncovered', '비급여', noncovered), share('other', '기타', other)]
}

// 그달 날 줄 sunap 합(통계 탭 Block 전환 아홉 칸). 그런 날이 없으면 null
function sunapSum(days: readonly DayPayload[]): SunapRates | null {
  const rows = days.flatMap((day) => (day.sunap === undefined ? [] : [day.sunap]))
  if (rows.length === 0) return null
  const keys = Object.keys(rows[0]!) as (keyof SunapRates)[]
  return Object.fromEntries(keys.map((key) => [key, sum(rows.map((row) => row[key]))])) as SunapRates
}

function sunapCells(closed: readonly SunapClosedDay[], rates: SunapRates | null): CellNumber[] | null {
  if (closed.length === 0) return null
  const sums = sumClosed(closed)
  return [
    pctCell('신환 예약률', sunapPct(sums.rsvFirst, sums.first)),
    pctCell('90일 예약률', sunapPct(sums.rsvD90, sums.d90)),
    pctCell('Block 전환', rates === null ? DASH : sunapPct(rates.first_block, rates.first_n)),
  ]
}

function calendarCells(rows: readonly CalCountRow[]): CellNumber[] | null {
  if (rows.length === 0) return null
  const summary = rateSummary(rows)
  return [
    { label: '예약 수', value: formatCount(summary.total), unit: '건' },
    pctCell('취소율', ratePct(summary.cancel, summary.total)),
    pctCell('변경율', ratePct(summary.moved, summary.total)),
    pctCell('안 옴율', ratePct(summary.noshow, summary.total)),
  ]
}

// 처방별 추세: 묶음 칸(treatmentRows) 가운데 센 묶음을 건수 많은 차례로 셋. 처방별 신환·재진은 같은 묶음의 달 줄(그달 서로 다른 환자)
function rxCells(input: StatsInput, groups: readonly StatsRxGroup[], payload: MonthPayload | null): CompareStatsCells['rx'] {
  const top = treatmentRows(input, groups)
    .flatMap((row) => (row.kind === 'ready' && row.row.count > 0 ? [row] : []))
    .sort((a, b) => b.row.count - a.row.count)
    .slice(0, TOP)
  if (top.length === 0) return { trend: null, split: null }
  const max = top[0]!.row.count
  const trend = top.map(({ group, row }) => ({ name: group.name, text: `${formatCount(row.count)}건`, width: percentOf(row.count, max) }))
  if (payload === null) return { trend, split: null }
  const split = top.map(({ group, key }) => {
    const line = payload.groups.find((one) => one.id === key)
    return { name: group.name, cells: [`신환 ${formatCount(line?.newPatients ?? 0)}명`, `재진 ${formatCount(line?.returning ?? 0)}건`] }
  })
  return { trend, split }
}

function doctorRows(sections: MonthSections | null): CellTableRow[] | 'single' | null {
  if (sections === null) return null
  if (sections.doctors.length === 0) return 'single'
  return sections.doctors.map((row) => ({ name: row.name, cells: [`${formatCount(row.patients)}명`, formatManWon(row.amount)] }))
}

// 시간 칸 열셋(8~20시)을 한 줄(모든 요일)로 보고 9~18시로 접어(foldHours) 칸마다 하루 평균의 색 단계(heatLevel)
function heatCells(sections: MonthSections | null): CompareStatsCells['ops']['hours'] {
  if (sections === null) return null
  const openDays = sum(sections.hours.openDays)
  if (openDays === 0) return null
  const folded = foldHours({ hours: [...VISIT_HOURS], rows: [{ weekday: 1, openDays, cells: sections.hours.hours }], unknown: sections.hours.unknown, peak: null }, HEAT_WINDOW)
  return { levels: folded.rows[0]!.cells.map((cell) => heatLevel(cellAverage(cell, openDays))), from: `${folded.hours[0]}시`, to: `${folded.hours[folded.hours.length - 1]}시` }
}

// 요일별 내원: 월~토(일요일은 진료한 날이 있을 때만)
function weekdayCells(input: StatsInput): CompareStatsCells['ops']['weekdays'] {
  const rows = weekdayRows(input.days, input.range)
  if (rows === null) return null
  const shown = rows.filter((row, i) => i < 6 || (row.average !== null && row.average > 0))
  return { names: shown.map((row) => WEEKDAY_SHORT[Number(row.key) - 1]!), values: shown.map((row) => row.average ?? 0) }
}

function holidayText(row: HolidayRow): string {
  if (row.days < FEW_DAYS) return '아직 적어요'
  if (row.vsUsual === null) return DASH
  if (row.vsUsual === 0) return '평소보다 0%'
  return `평소보다 ${row.vsUsual > 0 ? '+' : MINUS}${Math.abs(row.vsUsual)}%`
}

function holidayCells(rows: HolidayRow[] | null): CellTableRow[] | null {
  if (rows === null) return null
  return rows.flatMap((row) => {
    const name = HOLIDAY_NAMES[row.key]
    return name === undefined ? [] : [{ name, cells: [holidayText(row)] }]
  })
}

// 의사랑 처방별 추세 자리 = 묶음별 처방량(묶음 차례 = sort_order, 넣는 처방이 있는 묶음만) 가운데 처방량 큰 차례 셋, 값은 처방량 글(단위 없음).
// 그달이 처방 줄로 다 덮이지 않았거나 묶음 처방량이 모두 0이면 null(–)
function uisRxTrend(raw: CompareRaw, month: string, covered: readonly DateRange[], worked: ReadonlySet<string>, groups: readonly StatsRxGroup[]): CellBar[] | null {
  const ordered = [...groups].filter((group) => group.codes.length > 0).sort((a, b) => a.sortOrder - b.sortOrder)
  // rxGroups가 고른 줄은 id·out·cond가 늘 있다(열쇠 없음은 타입만의 길)
  const defs = ordered.map((group) => ({ id: group.id ?? group.name, name: group.name, codes: group.codes, out: group.out ?? [], cond: group.cond ?? [] }))
  const qty = uisGroupQty(raw, month, { covered, worked }, defs)
  if (qty === null) return null
  const top = qty
    .filter((group) => group.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, TOP)
  if (top.length === 0) return null
  const max = top[0]!.qty
  return top.map((group) => ({ name: group.name, text: formatQty(group.qty), width: percentOf(group.qty, max) }))
}

/** 한 의원의 비교 자료(그 달 compareRanges로 읽은 것)와 고른 달('YYYY-MM')로 나란히 보기 칸 값을 만든다 */
export function compareStatsInput(raw: CompareRaw, month: string): CompareStatsCells {
  if (!isMonth(month)) throw new Error('달 모양이 아님')
  const end = monthRange(month).to
  const today = addDays(end, 1) // 통계 탭이 다음 달 1일에 그달을 고른 것과 같다
  const range = pickRange(today, { kind: 'month', unit: 'day', month }, false)
  // 의사랑 의원은 달 줄(비트 처방·묶음·dropoff·sections)을 쓰지 않는다 — 그 칸은 셀 수 없음 안내이고 나이대는 의사랑 줄로 센다
  const uis = isUisClinic(raw)

  const days = statsDays(raw.stats_days)
  const monthDays = days.filter((day) => inMonth(day.day, month))
  const input: StatsInput = { days, covered: coverage(raw.stats_coverage), range }
  const { payload, sections } = uis ? { payload: null, sections: null } : monthOf(raw.stats_months, month)
  const worked = new Set(days.filter((day) => day.totals.patients >= 1).map((day) => day.day))
  const first = monthRange(month).from
  const uisInMonth = uis && [...uisRxRows(raw), ...uisAgeRows(raw)].some((row) => row.from <= end && row.to >= first)
  const groups = rxGroups(raw.stats_rx_groups)
  const keyed = keyedGroups(groups)
  const sales = salesDays(raw.sales_days)
  const monthSales = sales.filter((day) => inMonth(day.date, month))
  const closed = closedDays(raw.sunap_days).filter((day) => inMonth(day.day, month))
  const cal = calRows(raw.calendar_counts)
  const monthCal = cal.filter((row) => inMonth(row.day, month))
  const goal = revenueGoal(raw.stats_goals, month)

  const revenueInput: RevenueInput = { range, lastDay: end, days: sales, codes: [], monthCodes: [], groups: [], noDayCodes: false }
  const tabs = revenueTabs(revenueInput)
  const trend = visitTrend(input)
  const axis = { from: monthDay(first), to: monthDay(end) }
  const alerts = buildAlerts({ today, days, groups: keyed, cal })
  const rates = revisitRates(input)

  return {
    hasData:
      monthDays.length > 0 || payload !== null || sections !== null || monthSales.length > 0 || closed.length > 0 || monthCal.length > 0 || goal !== null || uisInMonth,
    ...(uis ? { uis: true as const } : {}),
    summary: {
      patients: summaryCells(input).map((cell) => ({ label: cell.label, value: cell.value === null ? null : formatCount(cell.value), unit: cell.unit })),
      revenue: revenueCells(revenueInput).map((cell) => ({ label: cell.label, value: cell.value === DASH ? null : cell.value, unit: cell.unit ?? '' })),
      alerts: alerts === null ? null : alerts.map(alertCell),
      goal: goalCell(salesRow(monthSales)?.total ?? null, goal),
    },
    patients: {
      daily:
        trend === null
          ? null
          : { columns: trend.buckets.map((bucket) => (bucket.blank ? [0, 0] : [bucket.values[0] ?? 0, sum(bucket.values.slice(1))])), ...axis },
      age: ageBars(uis ? uisAgeMix(raw, month, worked) : (sections?.mix ?? null)),
      revisit: [rateValue('7일 안', rates.d7), rateValue('14일 안', rates.d14), rateValue('30일 안', rates.d30)],
      dropoff: dropoffBars(payload, keyed),
    },
    revenue: {
      trend:
        tabs.kind === 'empty'
          ? null
          : { columns: { columns: tabs.trend.buckets.map((bucket) => [bucket.blank ? 0 : (bucket.values[0] ?? 0)]), ...axis }, total: tabs.trend.lead.amount },
      split: splitShares(sales, month),
    },
    sunap: sunapCells(closed, uis ? null : sunapSum(monthDays)),
    calendar: calendarCells(monthCal),
    rx: uis ? { trend: uisRxTrend(raw, month, input.covered, worked, groups), split: null } : rxCells(input, groups, payload),
    ops: {
      doctors: doctorRows(sections),
      hours: heatCells(sections),
      weekdays: weekdayCells(input),
      holiday: holidayCells(holidayEffect({ today, days: dayTotals(raw.stats_day_totals), closedDates: closedDates(raw.clinic_profiles) })),
    },
  }
}
