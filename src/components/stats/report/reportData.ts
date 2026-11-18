import { formatCount } from '@/components/charts/format'
import { formatManWon } from '@/components/revenue/money'
import { groupKey, keyedIn } from '@/components/stats/treatmentView'
import { addMonths, compareYmd, monthOf, monthRange } from '@/lib/analytics/dates'
import type { DayValue } from '@/lib/analytics/goalPace'
import { ratePct, rateSummary } from '@/lib/calendar/counts'
import { occupancy, occupancyLists } from '@/lib/calendar/occupancy'
import type { CalAllDay, CalCountRow, CalSettings, CalSlotRow } from '@/types/calendar'
import { GOAL_KEYS, type Goal, type GoalKey } from '@/types/goals'
import type { DayPayload } from '@/types/payload'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { BitSectionsView } from '@/types/stats'

// 월간 보고서 자료 (stats-insights REQ-6108 AC-6108.1~AC-6108.3, design.md '월간 보고서'). 순수 함수: 여러 자료 → 보고서 칸 목록.
// 내원·신환·묶음 건수는 넓은 하루 읽기(오늘 앞 12달 stats_days, 달 칸은 일 숫자의 합 — 통계 화면 규칙)에서, 매출은 고른 달·앞 달 하루 매출,
// 예약·시행자·빈자리는 예약 칸이 읽은 줄, 몇 번까지 받나·1명당 매출은 비트 칸 답(불러온 범위 전체)에서 온다.
// 자료가 없는 칸은 제목까지 뺀다(AC-6108.3). 결과에는 숫자·묶음 이름·시행자 이름만 있다(차트번호·환자 칸 없음).
// '달라진 것'은 앞 달을 다 읽은 지표만 견준다: 내원·신환·묶음은 넓은 읽기가 앞 달 1일부터 덮고 그 달에 저장된 날이 있을 때, 매출은 두 달 다 하루 매출이 있을 때.
// 견줄 것이 하나도 없으면 그 칸이 없고, 견줬는데 10% 넘게 달라진 것이 없으면 빈 목록이다(화면은 SAME_AS_BEFORE)

export const REPORT_MONTHS = 12
export const SAME_AS_BEFORE = '지난달과 비슷해요'

export const REPORT_TITLES = {
  summary: '한 달 요약',
  goal: '목표',
  changes: '달라진 것',
  trend: '내원 흐름 (최근 12달)',
  treatments: '치료별',
  calendar: '예약',
  staff: '시행자별',
  dropoff: '몇 번까지 받나',
  value: '신환 1명당 매출',
  occupancy: '예약 빈자리 (최근 8주)',
} as const

export type ReportCell = { name: string; value: string }
export type ReportChange = { dir: 'up' | 'down'; text: string }
/** value null = 그 달에 저장된 날이 없음 */
export type ReportBar = { month: string; label: string; value: number | null; picked: boolean }
export type ReportBlock =
  | { key: 'summary' | 'value'; title: string; cells: ReportCell[] }
  | { key: 'goal' | 'treatments' | 'calendar' | 'staff' | 'dropoff' | 'occupancy'; title: string; items: string[] }
  | { key: 'changes'; title: string; changes: ReportChange[] }
  | { key: 'trend'; title: string; bars: ReportBar[] }
export type MonthlyReportData = { title: string; sub: string; blocks: ReportBlock[] }

/** 예약 칸이 읽은 것. slots null = 빈자리 줄을 읽지 못함(또는 읽는 중) */
export type ReportCalendar = {
  rows: readonly CalCountRow[]
  settings?: CalSettings
  slots: { rows: readonly CalSlotRow[]; offs: readonly CalAllDay[] } | null
}

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
}

const PEOPLE = '명'
const COUNT = '건'
const CHANGE_FROM = 10 // '달라진 것' = 반올림 정수 %가 이 이상

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

// 그 달의 저장된 날 줄(같은 날은 뒤의 것)
function daysIn(days: readonly DayPayload[], month: string): DayPayload[] {
  const byDay = new Map<string, DayPayload>()
  for (const row of days) if (monthOf(row.day) === month) byDay.set(row.day, row)
  return [...byDay.values()]
}

// 그 달 하루 매출의 합. 그 달 줄이 하나도 없으면 null
function salesIn(sales: readonly DayValue[] | null, month: string): number | null {
  const rows = (sales ?? []).filter((row) => monthOf(row.day) === month)
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

// 그 달 묶음 건수(같은 날 같은 환자는 1건 — 날 줄 묶음 숫자의 합). 그 달 어느 날이라도 그 열쇠로 세지 않았으면 null
function groupCount(days: readonly DayPayload[], rows: readonly DayPayload[], month: string, key: string): number | null {
  if (rows.length === 0 || !keyedIn(days, monthRange(month), key)) return null
  return sumOf(rows, (row) => row.groups.find((line) => line.id === key)?.patients ?? 0)
}

type Metric = { name: string; now: number; before: number; text: (n: number) => string }

function changesOf(metrics: readonly Metric[], before: string): ReportChange[] {
  return metrics.flatMap(({ name, now, before: was, text }) => {
    if (was <= 0) return []
    const pct = Math.round((Math.abs(now - was) * 100) / was)
    if (pct < CHANGE_FROM) return []
    const up = now > was
    return [{ dir: up ? 'up' : 'down', text: `${name} · ${monthLabel(before)}보다 ${pct}% ${up ? '많아요' : '적어요'} (${text(was)} → ${text(now)})` }]
  })
}

const GOAL_NAMES: Record<GoalKey, string> = { visits: '내원', newPatients: '신환', revenue: '매출' }

export function monthlyReport(input: ReportInput): MonthlyReportData {
  const { month, today, days, groups, calendar, bit } = input
  const thisMonth = monthOf(today)
  const prev = addMonths(month, -1)
  const rows = daysIn(days, month)
  const prevRows = daysIn(days, prev)
  // 앞 달을 다 읽었음: 넓은 읽기가 앞 달 1일부터 덮고 그 달에 저장된 날이 있다
  const prevRead = compareYmd(monthRange(prev).from, input.daysFrom) >= 0 && prevRows.length > 0
  const visits = sumOf(rows, (row) => row.totals.patients)
  const newPatients = sumOf(rows, (row) => row.totals.newPatients)
  const revenue = salesIn(input.sales, month)
  const keys = namedKeys(groups)
  const calRows = calendar === null ? [] : calendar.rows.filter((row) => monthOf(row.day) === month)
  const booked = rateSummary(calRows)
  const ready = bit !== null && bit.kind === 'ready' ? bit : null

  const blocks: ReportBlock[] = []

  // 한 달 요약
  blocks.push({
    key: 'summary',
    title: REPORT_TITLES.summary,
    cells: [
      { name: '내원', value: formatCount(visits) },
      { name: '신환', value: formatCount(newPatients) },
      ...(revenue === null ? [] : [{ name: '매출', value: formatManWon(revenue) }]),
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
          const text = key === 'revenue' ? formatManWon : people
          const pct = target > 0 ? Math.floor((value * 100) / target) : 100
          return [`${GOAL_NAMES[key]} ${text(value)} / 목표 ${text(target)} · ${pct}%`]
        })
  if (goalItems.length > 0) blocks.push({ key: 'goal', title: REPORT_TITLES.goal, items: goalItems })

  // 달라진 것(지난달보다)
  const prevRevenue = salesIn(input.sales, prev)
  const metrics: Metric[] = [
    ...(prevRead
      ? [
          { name: '내원', now: visits, before: sumOf(prevRows, (row) => row.totals.patients), text: people },
          { name: '신환', now: newPatients, before: sumOf(prevRows, (row) => row.totals.newPatients), text: people },
        ]
      : []),
    ...(revenue !== null && prevRevenue !== null ? [{ name: '매출', now: revenue, before: prevRevenue, text: formatManWon }] : []),
    ...(prevRead
      ? keys.flatMap(({ key, name }) => {
          const now = groupCount(days, rows, month, key)
          const before = groupCount(days, prevRows, prev, key)
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
      const inMonth = daysIn(days, at)
      return { month: at, label: monthLabel(at), value: inMonth.length === 0 ? null : sumOf(inMonth, (row) => row.totals.patients), picked: at === month }
    }),
  })

  // 치료별(묶음 건수, 묶음 차례)
  const treatments = keys.flatMap(({ key, name }) => {
    const count = groupCount(days, rows, month, key)
    return count === null ? [] : [`${name} ${cases(count)}`]
  })
  if (treatments.length > 0) blocks.push({ key: 'treatments', title: REPORT_TITLES.treatments, items: treatments })

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

  // 신환 1명당 매출(90일)
  const value = ready?.value
  if (value !== undefined && value.n > 0) {
    blocks.push({
      key: 'value',
      title: REPORT_TITLES.value,
      cells: [
        { name: '신환 1명당 평균 (90일)', value: formatManWon(value.average) },
        { name: '신환 1명당 내원 횟수 (90일)', value: `${value.times.toFixed(1)}회` },
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

  return {
    title: `${Number(month.slice(0, 4))}년 ${monthLabel(month)} 통계 보고`,
    sub: `${input.hospitalName} · ${longToday(today)} 뽑음`,
    blocks,
  }
}
