import { formatCount } from '@/components/charts/format'
import { formatManWon, formatWon } from '@/components/revenue/money'
import { groupCond, groupKey, groupOut, keyedIn } from '@/components/stats/treatmentView'
import { UIS_GAP_TITLE, UIS_NA, UIS_WHY, uisMixMissing } from '@/components/stats/uisarang/texts'
import { ageShareText } from '@/components/stats/uisarang/UisAgeSection'
import { addDays, addMonths, compareYmd, monthOf, monthRange, sameDayLastMonth } from '@/lib/analytics/dates'
import type { DayValue } from '@/lib/analytics/goalPace'
import { AGE_BANDS, NO_BIRTH } from '@/lib/analytics/patientMix'
import { dayListText, formatQty, sumAges, sumRxCodes, sumRxGroups, tileRx } from '@/lib/analytics/uisarang'
import { ratePct, rateSummary } from '@/lib/calendar/counts'
import { occupancy, occupancyLists } from '@/lib/calendar/occupancy'
import type { CalAllDay, CalCountRow, CalSettings, CalSlotRow } from '@/types/calendar'
import type { DateRange } from '@/types/dates'
import { GOAL_KEYS, type Goal, type GoalKey } from '@/types/goals'
import type { DayPayload } from '@/types/payload'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { BitSectionsView } from '@/types/stats'
import type { UisAgePayload, UisPeriodRow, UisRxPayload } from '@/types/uisarang'

// 월간 보고서 자료 (stats-insights REQ-6108 AC-6108.1~AC-6108.4, design.md '월간 보고서'). 순수 함수: 여러 자료 → 보고서 칸 목록.
// 내원·신환·묶음 건수는 넓은 하루 읽기(오늘 앞 12달 stats_days, 달 칸은 일 숫자의 합 — 통계 화면 규칙)에서, 매출은 고른 달·앞 달 하루 매출,
// 예약·시행자·빈자리는 예약 칸이 읽은 줄, 몇 번까지 받나는 비트 칸 답(불러온 범위 전체), 1명당 매출은 비트 칸 답의 고른 달 줄(그 달 신환, bit-total AC-6911.5)에서 온다.
// 자료가 없는 칸은 제목까지 뺀다(AC-6108.3). 결과에는 숫자·묶음 이름·시행자 이름만 있다(차트번호·환자 칸 없음).
// '달라진 것'은 앞 달을 다 읽은 지표만 견준다: 내원·신환·묶음은 넓은 읽기가 앞 달 1일부터 덮고 그 달에 저장된 날이 있을 때, 매출은 두 달 다 하루 매출이 있을 때.
// 견줄 것이 하나도 없으면 그 칸이 없고, 견줬는데 10% 넘게 달라진 것이 없으면 빈 목록이다(화면은 SAME_AS_BEFORE).
// 매출 글 세 곳(한 달 요약·목표·달라진 것)은 원 단위(formatWon, bit-total REQ-6902)다. 신환 1명당 칸 금액은 평균이라 만 원 글(formatManWon) 그대로다(AC-6902.4).
// 이번 달 보고서(AC-6108.4)는 한 달 숫자가 1일~어제의 합(오늘은 진료 중이라 세지 않는다)이고, '달라진 것'은 지난달 1일~같은 날짜(없으면 지난달 말일)와 견준다.
// 다 지난 달은 두 달 전체를 견준다
// 의사랑 의원(uisarang-upload REQ-8817, design.md §10-6, 시안 ?s=monthly): 한 달 요약·목표·내원 흐름·예약·시행자별·빈자리는 같은 셈(날 숫자·매출)이고
// '달라진 것'은 내원·신환·매출만 견준다(처방량 증감 비교는 범위 밖). '치료별' 자리에 '묶음별 처방량'(고른 달을 처방 줄로 다 덮을 때만, 아니면 모자람 한 줄),
// 그다음 '나이대 (내원)', 맨 끝 '의사랑 엑셀로는 셀 수 없어요' 두 줄이고 '몇 번까지 받나'·'신환 1명당 매출'은 없다.
// 처방·나이대 셈은 lib/analytics/uisarang(tileRx·sumRxCodes·sumRxGroups·sumAges·formatQty·dayListText), 비율은 통계 탭 환자 구성 표와 같은 ageShareText다

export const REPORT_MONTHS = 12
export const SAME_AS_BEFORE = '지난달과 비슷해요'

export const REPORT_TITLES = {
  summary: '한 달 요약',
  goal: '목표',
  changes: '달라진 것',
  trend: '내원 흐름 (최근 12달)',
  treatments: '치료별',
  uisRx: '묶음별 처방량',
  ages: '나이대 (내원)',
  calendar: '예약',
  staff: '시행자별',
  dropoff: '몇 번까지 받나',
  value: '신환 1명당 매출',
  occupancy: '예약 빈자리 (최근 8주)',
  uisCannot: UIS_NA,
} as const

// 의사랑 엑셀로는 셀 수 없는 칸 두 줄(맨 끝 칸)
const UIS_CANNOT = [`${REPORT_TITLES.dropoff} · ${UIS_WHY.revisit}`, `${REPORT_TITLES.value} · 환자마다 낸 돈을 알 수 없어요.`]

export type ReportCell = { name: string; value: string }
export type ReportChange = { dir: 'up' | 'down'; text: string }
/** value null = 그 달에 저장된 날이 없음 */
export type ReportBar = { month: string; label: string; value: number | null; picked: boolean }
export type ReportBlock =
  | { key: 'summary' | 'value'; title: string; cells: ReportCell[] }
  | { key: 'goal' | 'treatments' | 'uisRx' | 'ages' | 'calendar' | 'staff' | 'dropoff' | 'occupancy' | 'uisCannot'; title: string; items: string[] }
  | { key: 'changes'; title: string; changes: ReportChange[] }
  | { key: 'trend'; title: string; bars: ReportBar[] }
export type MonthlyReportData = { title: string; sub: string; blocks: ReportBlock[] }

/** 예약 칸이 읽은 것. slots null = 빈자리 줄을 읽지 못함(또는 읽는 중) */
export type ReportCalendar = {
  rows: readonly CalCountRow[]
  settings?: CalSettings
  slots: { rows: readonly CalSlotRow[]; offs: readonly CalAllDay[] } | null
}

/** 의사랑 의원이 고른 달 범위에서 읽은 것(useReportReads): 처방 줄 · 나이대 줄 · 덮은 기간(stats_coverage, 휴진을 가린다) */
export type UisReportData = { rx: readonly UisPeriodRow<UisRxPayload>[]; age: readonly UisPeriodRow<UisAgePayload>[]; covered: readonly DateRange[] }

export type ReportInput = {
  month: string // 고른 달 'YYYY-MM'
  today: string
  hospitalName: string
  days: readonly DayPayload[] // 넓은 하루 읽기의 줄
  daysFrom: string // 넓은 하루 읽기의 첫날(앞 달을 다 읽었는지 본다)
  groups: readonly StatsRxGroup[] // 지금 묶음(처방별 추세)
  sales: readonly DayValue[] | null // 고른 달·앞 달 하루 매출. null = 모름(읽는 중·실패)
  goal: Goal | null // 고른 달 목표. null = 모름
  calendar: ReportCalendar | null // null = 예약 줄을 모름
  bit: BitSectionsView | null // null = 이 기기에서 불러오지 않음(또는 답을 기다림)
  // 의사랑 의원(REQ-8817). 없음·null = 의사랑 아님(지금 그대로). 'unknown' = 의사랑 의원인데 처방·나이대 줄을 모름(읽는 중·실패) —
  // 묶음별 처방량·나이대 칸만 없고 나머지 의사랑 모양(치료별·몇 번까지 받나·1명당 매출 없음, 셀 수 없어요 칸)은 그대로다
  uis?: UisReportData | 'unknown' | null
}

const PEOPLE = '명'
const COUNT = '건'
const CHANGE_FROM = 10 // '달라진 것' = 반올림하기 전 달라진 %가 이 이상(글의 %만 반올림 정수)

const monthLabel = (month: string) => `${Number(month.slice(5, 7))}월`
const longToday = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
const people = (n: number) => `${formatCount(n)}${PEOPLE}`
const cases = (n: number) => `${formatCount(n)}${COUNT}`
const sumOf = <T>(rows: readonly T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0)

/** 고를 달: 이번 달을 넣은 최근 12달 가운데 저장된 하루 숫자가 있는 달, 새 달부터 */
export function reportMonths(days: readonly Pick<DayPayload, 'day'>[], today: string): string[] {
  const current = monthOf(today)
  const saved = new Set(days.map((row) => monthOf(row.day)))
  return Array.from({ length: REPORT_MONTHS }, (_, i) => addMonths(current, -i)).filter((month) => saved.has(month))
}

/** 처음 고른 달: 지난달이 저장돼 있으면 지난달, 아니면 가장 최근 저장된 달. 없으면 null */
export function firstReportMonth(months: readonly string[], today: string): string | null {
  const last = addMonths(monthOf(today), -1)
  return months.includes(last) ? last : (months[0] ?? null)
}

const within = (ymd: string, range: DateRange) => compareYmd(ymd, range.from) >= 0 && compareYmd(ymd, range.to) <= 0

// 고른 달·지난달에서 세는 기간(AC-6108.4): 다 지난 달은 두 달 전체, 이번 달은 1일~어제와 지난달 1일~같은 날짜(그 날짜가 없으면 지난달 말일).
// 오늘이 1일이면 어제는 지난달이라 두 기간 모두 끝이 처음보다 앞이다(빈 기간 — 세는 날이 없어 견주지 않는다)
function spansOf(month: string, today: string): { now: DateRange; before: DateRange } {
  const now = monthRange(month)
  const before = monthRange(addMonths(month, -1))
  if (month !== monthOf(today)) return { now, before }
  const yesterday = addDays(today, -1)
  return { now: { from: now.from, to: yesterday }, before: { from: before.from, to: sameDayLastMonth(yesterday) } }
}

// 기간의 저장된 날 줄(같은 날은 뒤의 것)
function daysIn(days: readonly DayPayload[], range: DateRange): DayPayload[] {
  const byDay = new Map<string, DayPayload>()
  for (const row of days) if (within(row.day, range)) byDay.set(row.day, row)
  return [...byDay.values()]
}

// 기간 하루 매출의 합. 기간 줄이 하나도 없으면 null
function salesIn(sales: readonly DayValue[] | null, range: DateRange): number | null {
  const rows = (sales ?? []).filter((row) => within(row.day, range))
  return rows.length === 0 ? null : sumOf(rows, (row) => row.value)
}

// 지금 묶음(sortOrder 차례, 처방 든 것만, 같은 열쇠는 앞 묶음)의 열쇠·이름
function namedKeys(groups: readonly StatsRxGroup[]): { key: string; name: string }[] {
  const seen = new Set<string>()
  return [...groups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((group) => {
      if (group.codes.length === 0) return []
      const key = groupKey(group.codes, group)
      if (seen.has(key)) return []
      seen.add(key)
      return [{ key, name: group.name }]
    })
}

// 기간 묶음 건수(같은 날 같은 환자는 1건 — 날 줄 묶음 숫자의 합). 기간 어느 날이라도 그 열쇠로 세지 않았으면 null
function groupCount(days: readonly DayPayload[], rows: readonly DayPayload[], range: DateRange, key: string): number | null {
  if (rows.length === 0 || !keyedIn(days, range, key)) return null
  return sumOf(rows, (row) => row.groups.find((line) => line.id === key)?.patients ?? 0)
}

type Metric = { name: string; now: number; before: number; text: (n: number) => string }

function changesOf(metrics: readonly Metric[], before: string): ReportChange[] {
  return metrics.flatMap(({ name, now, before: was, text }) => {
    if (was <= 0) return []
    // 문턱은 반올림하기 전 값으로 본다(9.5%가 반올림해 10%로 들지 않게). 정수끼리 곱해 견줘 소수 오차가 없다
    if (Math.abs(now - was) * 100 < CHANGE_FROM * was) return []
    const pct = Math.round((Math.abs(now - was) * 100) / was)
    const up = now > was
    return [{ dir: up ? 'up' : 'down', text: `${name} · ${monthLabel(before)}보다 ${pct}% ${up ? '많아요' : '적어요'} (${text(was)} → ${text(now)})` }]
  })
}

const GOAL_NAMES: Record<GoalKey, string> = { visits: '내원', newPatients: '신환', revenue: '매출' }

// 묶음별 처방량 칸 줄: 세는 기간을 처방 줄로 다 덮으면 묶음 차례(sortOrder)로 넣는 처방이 있는 묶음마다 한 줄(통계 탭 묶음별 처방량과 같은 셈),
// 아니면 모자람 한 줄. 덮을 줄이 하나도 없으면(세는 날이 없음) 빈 목록 — 칸이 없다
function uisRxItems(uis: UisReportData, range: DateRange, groups: readonly StatsRxGroup[], worked: ReadonlySet<string>, today: string): string[] {
  const tile = tileRx(range, uis.rx, { covered: uis.covered, worked }, today)
  if (!tile.ok) return [`${UIS_GAP_TITLE} · ${formatCount(tile.gap.length)}일 치가 없어요: ${dayListText(tile.gap, today)}`]
  if (tile.used.length === 0) return []
  const named = [...groups].sort((a, b) => a.sortOrder - b.sortOrder).filter((group) => group.codes.length > 0)
  const defs = named.map((group, i) => ({ id: group.id ?? `new-${i}`, codes: group.codes, out: groupOut(group), cond: groupCond(group) }))
  const sums = sumRxGroups(sumRxCodes(tile.used), defs)
  return named.map((group, i) => `${group.name} 처방량 ${formatQty(sums.groups[i]?.qty ?? 0)} · 총액 ${formatWon(sums.groups[i]?.amount ?? 0)}`)
}

// 나이대 (내원) 칸 줄: 0건 줄을 뺀 나이대마다 건수·비율, 진료한 날인데 아래쪽 표가 없는 날이 있으면 끝 줄. 나이대 줄이 하나도 없으면 빈 목록 — 칸이 없다
function ageItems(uis: UisReportData, range: DateRange, worked: ReadonlySet<string>): string[] {
  const sums = sumAges(uis.age, range, worked)
  if (sums.days === 0) return []
  const total = sumOf(sums.bands, (n) => n)
  const lines = [...AGE_BANDS, NO_BIRTH].flatMap((band, i) => {
    const n = sums.bands[i] ?? 0
    return n === 0 ? [] : [`${band} ${cases(n)} · ${ageShareText(n, total)}`]
  })
  return sums.missingDays > 0 ? [...lines, uisMixMissing(formatCount(sums.missingDays))] : lines
}

export function monthlyReport(input: ReportInput): MonthlyReportData {
  const { month, today, days, groups, calendar, bit } = input
  const uis = input.uis ?? null
  const thisMonth = monthOf(today)
  const prev = addMonths(month, -1)
  const spans = spansOf(month, today)
  const rows = daysIn(days, spans.now)
  const prevRows = daysIn(days, spans.before)
  // 앞 달을 다 읽었음: 넓은 읽기가 앞 달 1일부터 덮고 견주는 기간에 저장된 날이 있다
  const prevRead = compareYmd(spans.before.from, input.daysFrom) >= 0 && prevRows.length > 0
  const visits = sumOf(rows, (row) => row.totals.patients)
  const newPatients = sumOf(rows, (row) => row.totals.newPatients)
  const revenue = salesIn(input.sales, spans.now)
  const keys = namedKeys(groups)
  const calRows = calendar === null ? [] : calendar.rows.filter((row) => monthOf(row.day) === month)
  const booked = rateSummary(calRows)
  // 의사랑 의원은 비트 칸 답(몇 번까지 받나·1명당 매출)을 쓰지 않는다(AC-8817.4)
  const ready = uis === null && bit !== null && bit.kind === 'ready' ? bit : null

  const blocks: ReportBlock[] = []

  // 한 달 요약
  blocks.push({
    key: 'summary',
    title: REPORT_TITLES.summary,
    cells: [
      { name: '내원', value: formatCount(visits) },
      { name: '신환', value: formatCount(newPatients) },
      ...(revenue === null ? [] : [{ name: '매출', value: formatWon(revenue) }]),
      ...(booked.total === 0 ? [] : [{ name: '예약 안 옴', value: ratePct(booked.noshow, booked.total) }]),
    ],
  })

  // 목표(그 달 목표가 있는 지표만, 달성률 = 그 달 값 ÷ 목표 버림 정수 %, 목표 0은 100%)
  const actual: Record<GoalKey, number | null> = { visits, newPatients, revenue }
  const goal = input.goal
  const goalItems =
    goal === null
      ? []
      : GOAL_KEYS.flatMap((key) => {
          const target = goal[key]
          const value = actual[key]
          if (target === null || value === null) return []
          const text = key === 'revenue' ? formatWon : people
          const pct = target > 0 ? Math.floor((value * 100) / target) : 100
          return [`${GOAL_NAMES[key]} ${text(value)} / 목표 ${text(target)} · ${pct}%`]
        })
  if (goalItems.length > 0) blocks.push({ key: 'goal', title: REPORT_TITLES.goal, items: goalItems })

  // 달라진 것(지난달보다)
  const prevRevenue = salesIn(input.sales, spans.before)
  const metrics: Metric[] = [
    ...(prevRead
      ? [
          { name: '내원', now: visits, before: sumOf(prevRows, (row) => row.totals.patients), text: people },
          { name: '신환', now: newPatients, before: sumOf(prevRows, (row) => row.totals.newPatients), text: people },
        ]
      : []),
    ...(revenue !== null && prevRevenue !== null ? [{ name: '매출', now: revenue, before: prevRevenue, text: formatWon }] : []),
    // 묶음 건수는 비트 의원만(의사랑은 내원·신환·매출만 견준다, AC-8817.1)
    ...(prevRead && uis === null
      ? keys.flatMap(({ key, name }) => {
          const now = groupCount(days, rows, spans.now, key)
          const before = groupCount(days, prevRows, spans.before, key)
          return now === null || before === null ? [] : [{ name, now, before, text: cases }]
        })
      : []),
  ]
  if (metrics.length > 0) blocks.push({ key: 'changes', title: REPORT_TITLES.changes, changes: changesOf(metrics, prev) })

  // 내원 흐름(이번 달을 넣은 최근 12달)
  blocks.push({
    key: 'trend',
    title: REPORT_TITLES.trend,
    bars: Array.from({ length: REPORT_MONTHS }, (_, i) => addMonths(thisMonth, i - (REPORT_MONTHS - 1))).map((at) => {
      const inMonth = daysIn(days, monthRange(at))
      return { month: at, label: monthLabel(at), value: inMonth.length === 0 ? null : sumOf(inMonth, (row) => row.totals.patients), picked: at === month }
    }),
  })

  if (uis === null) {
    // 치료별(묶음 건수, 묶음 차례)
    const treatments = keys.flatMap(({ key, name }) => {
      const count = groupCount(days, rows, spans.now, key)
      return count === null ? [] : [`${name} ${cases(count)}`]
    })
    if (treatments.length > 0) blocks.push({ key: 'treatments', title: REPORT_TITLES.treatments, items: treatments })
  } else if (uis !== 'unknown') {
    // 의사랑: 치료별 자리에 묶음별 처방량, 그다음 나이대(내원). 진료한 날 = 세는 기간 날 줄의 환자 1명 이상
    const worked = new Set(rows.filter((row) => row.totals.patients > 0).map((row) => row.day))
    const rxItems = uisRxItems(uis, spans.now, groups, worked, today)
    if (rxItems.length > 0) blocks.push({ key: 'uisRx', title: REPORT_TITLES.uisRx, items: rxItems })
    const ages = ageItems(uis, spans.now, worked)
    if (ages.length > 0) blocks.push({ key: 'ages', title: REPORT_TITLES.ages, items: ages })
  }

  // 예약 · 시행자별(예약 칸과 같은 셈·비율 글)
  if (booked.total > 0) {
    blocks.push({
      key: 'calendar',
      title: REPORT_TITLES.calendar,
      items: [
        `예약 ${cases(booked.total)}`,
        `취소 ${cases(booked.cancel)} (${ratePct(booked.cancel, booked.total)})`,
        `변경 ${cases(booked.moved)} (${ratePct(booked.moved, booked.total)})`,
        `안 옴 ${cases(booked.noshow)} (${ratePct(booked.noshow, booked.total)})`,
      ],
    })
    const names = new Map((calendar?.settings?.staff ?? []).map((person) => [person.id, person.name]))
    blocks.push({
      key: 'staff',
      title: REPORT_TITLES.staff,
      items: booked.byStaff.map((row) => `${names.get(row.id) ?? row.label} ${cases(row.total)} · 안 옴 ${ratePct(row.noshow, row.total)}`),
    })
  }

  // 몇 번까지 받나(지금 묶음 이름이 있는 줄만, 대상이 많은 순)
  const names = new Map(keys.map(({ key, name }) => [key, name]))
  const dropoff = (ready?.dropoff ?? [])
    .flatMap((line) => {
      const name = names.get(line.group)
      return name === undefined || line.n === 0 ? [] : [{ ...line, name }]
    })
    .sort((a, b) => b.n - a.n)
    .map((line) => `${line.name} 1회만 ${Math.round((line.once * 100) / line.n)}% · 평균 ${line.average.toFixed(1)}회 (${people(line.n)})`)
  if (dropoff.length > 0) blocks.push({ key: 'dropoff', title: REPORT_TITLES.dropoff, items: dropoff })

  // 신환 1명당 매출(고른 달 신환이 그 달에 낸 돈). 그 달 줄이 없거나 0명이면 칸이 없다
  const value = ready?.values?.find((row) => row.month === month)
  if (value !== undefined && value.n > 0) {
    blocks.push({
      key: 'value',
      title: REPORT_TITLES.value,
      cells: [
        { name: '신환 1명당 평균', value: formatManWon(value.average) },
        { name: '신환 1명당 내원 횟수', value: `${value.times.toFixed(1)}회` },
        { name: '한 번 올 때 평균', value: formatManWon(value.perVisit) },
      ],
    })
  }

  // 예약 빈자리(최근 8주 — 이번 달·지난달 보고서에만)
  const settings = calendar?.settings
  const slots = calendar?.slots ?? null
  if ((month === thisMonth || month === addMonths(thisMonth, -1)) && settings !== undefined && slots !== null && settings.staff.length > 0) {
    const view = occupancy({ rows: slots.rows, offs: slots.offs, settings, today, staffId: null })
    const lists = view.booked === 0 ? { empty: null, full: null } : occupancyLists(view)
    const items = [lists.empty === null ? null : `늘 비는 시간: ${lists.empty}`, lists.full === null ? null : `꽉 차는 시간: ${lists.full}`].filter((item) => item !== null)
    if (items.length > 0) blocks.push({ key: 'occupancy', title: REPORT_TITLES.occupancy, items })
  }

  // 의사랑 엑셀로는 셀 수 없는 것(맨 끝, 처방·나이대 줄을 몰라도 있다)
  if (uis !== null) blocks.push({ key: 'uisCannot', title: REPORT_TITLES.uisCannot, items: [...UIS_CANNOT] })

  return {
    title: `${Number(month.slice(0, 4))}년 ${monthLabel(month)} 통계 보고`,
    sub: `${input.hospitalName} · ${longToday(today)} 뽑음`,
    blocks,
  }
}
