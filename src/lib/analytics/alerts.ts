import { shownStatus } from '@/lib/calendar/rules'
import type { CalCountRow } from '@/types/calendar'
import type { DayPayload } from '@/types/payload'
import { addDays, compareYmd, eachDay, weekStartOf } from './dates'

// 평소와 다른 것 (stats-insights REQ-6101 AC-6101.1~AC-6101.4). 순수 함수다. 받는 것은 저장된 하루 숫자·묶음 이름·예약 수 세기 줄뿐이고
// 낸 줄에는 이름·숫자 글자만 있다(차트번호·환자 이름 없음).
// 이번 주 = 어제가 든 주의 월요일 ~ 어제. 그 날들 각각을 앞선 4주의 같은 요일(7·14·21·28일 전)과 견준다.
// 저장된 날 = 끝난(partial 아닌) 줄이 있는 날(같은 날이 둘이면 뒤의 것). 묶음은 그날 그 묶음 줄이 있어야(0건 줄 포함) 저장된 날이다.
// 이번 주 날이 저장되지 않았거나, 그 요일이 앞선 4주에 저장된 날이 2일보다 적으면 그날은 양쪽에서 뺀다

export type AlertKind = 'down' | 'up' | 'warn'
// name = 문장 맨 앞 이름(화면이 굵게 그린다), text = 문장 전체, range = '{M/D}~{M/D}'(이번 주 첫날 ~ 어제)
export type Alert = { kind: AlertKind; name: string; text: string; range: string }
// 처방 칸 묶음: id = 그 묶음 열쇠(일 줄 groups의 id), name = 화면 이름
export type AlertGroup = { id: string; name: string }
export type AlertCalRow = Pick<CalCountRow, 'day' | 'kindId' | 'kindName' | 'status' | 'auto'>

const WEEKS_BACK = [7, 14, 21, 28]
const MIN_PREV_DAYS = 2
const MIN_USUAL = 10
const MIN_CHANGE = 15 // %
const MIN_THIS_WEEK_APPTS = 10
const MIN_PREV_APPTS = 20
const MIN_NOSHOW_RISE = 3 // %p
const MAX_ALERTS = 5

type Metric = { name: string; unit: string; value: (row: DayPayload) => number | null }
type Ranked = Alert & { change: number }

const count = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const shortDate = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`
const average = (values: readonly number[]) => values.reduce((sum, n) => sum + n, 0) / values.length

function metricsOf(groups: readonly AlertGroup[]): Metric[] {
  return [
    { name: '내원', unit: '명', value: (row) => row.totals.patients },
    { name: '신환', unit: '명', value: (row) => row.totals.newPatients },
    ...groups.map((group) => ({ name: group.name, unit: '건', value: (row: DayPayload) => row.groups.find((line) => line.id === group.id)?.patients ?? null })),
  ]
}

// 이번 주 값·평소 값. 견준 날이 하루도 없으면 null
function compareMetric(metric: Metric, week: readonly string[], byDay: ReadonlyMap<string, DayPayload>): { now: number; usual: number } | null {
  const valueOn = (ymd: string) => {
    const row = byDay.get(ymd)
    return row === undefined ? null : metric.value(row)
  }
  let now = 0
  let usual = 0
  let compared = false
  for (const ymd of week) {
    const value = valueOn(ymd)
    if (value === null) continue
    const prev = WEEKS_BACK.map((back) => valueOn(addDays(ymd, -back))).filter((n): n is number => n !== null)
    if (prev.length < MIN_PREV_DAYS) continue
    now += value
    usual += average(prev)
    compared = true
  }
  return compared ? { now, usual } : null
}

function metricAlert(metric: Metric, { now, usual }: { now: number; usual: number }, range: string): Ranked | null {
  if (usual < MIN_USUAL) return null
  const change = Math.round((Math.abs(now - usual) * 100) / usual)
  if (change < MIN_CHANGE) return null
  const fewer = now < usual
  const text = `${metric.name} · 이번 주 ${count(Math.round(now))}${metric.unit}, 지난 4주 평균 ${count(Math.round(usual))}${metric.unit}보다 ${change}% ${fewer ? '적어요' : '많아요'}`
  return { kind: fewer ? 'down' : 'up', name: metric.name, text, range, change }
}

type NoShow = { name: string; nameDay: string; now: number; nowNoShow: number; prev: number; prevNoShow: number }

// 종류마다 예약 안 옴. 비율 = 안 옴 ÷ 예약 수(취소 포함), 반올림 정수 %. 이름은 그 종류의 가장 늦은 줄 이름
function noShowAlerts(cal: readonly AlertCalRow[], week: readonly string[], range: string): Ranked[] {
  const thisWeek = new Set(week)
  const prevWeeks = new Set(week.flatMap((ymd) => WEEKS_BACK.map((back) => addDays(ymd, -back))))
  const byKind = new Map<string, NoShow>()
  for (const row of cal) {
    const inNow = thisWeek.has(row.day)
    if (!inNow && !prevWeeks.has(row.day)) continue
    const kind = byKind.get(row.kindId) ?? { name: row.kindName, nameDay: row.day, now: 0, nowNoShow: 0, prev: 0, prevNoShow: 0 }
    if (compareYmd(row.day, kind.nameDay) >= 0) {
      kind.name = row.kindName
      kind.nameDay = row.day
    }
    const noShow = shownStatus(row) === 'noshow' ? 1 : 0
    if (inNow) {
      kind.now += 1
      kind.nowNoShow += noShow
    } else {
      kind.prev += 1
      kind.prevNoShow += noShow
    }
    byKind.set(row.kindId, kind)
  }
  return [...byKind.values()].flatMap((kind): Ranked[] => {
    if (kind.now < MIN_THIS_WEEK_APPTS || kind.prev < MIN_PREV_APPTS) return []
    const a = Math.round((kind.nowNoShow * 100) / kind.now)
    const b = Math.round((kind.prevNoShow * 100) / kind.prev)
    if (a - b < MIN_NOSHOW_RISE) return []
    const name = `${kind.name} 예약 안 옴`
    return [{ kind: 'warn', name, text: `${name} · 이번 주 ${a}%, 지난 4주 평균 ${b}%보다 높아요`, range, change: a - b }]
  })
}

/** 알림 줄(warn 먼저, 그다음 달라진 비율이 큰 차례, 5줄까지). 견줄 저장된 날이 하루도 없고 알림도 없으면 null(칸을 그리지 않는다) */
export function buildAlerts({
  today,
  days,
  groups = [],
  cal = null,
}: {
  today: string
  days: readonly DayPayload[]
  groups?: readonly AlertGroup[]
  cal?: readonly AlertCalRow[] | null
}): Alert[] | null {
  const yesterday = addDays(today, -1)
  const first = weekStartOf(yesterday)
  const week = eachDay({ from: first, to: yesterday })
  const range = `${shortDate(first)}~${shortDate(yesterday)}`

  const byDay = new Map<string, DayPayload>()
  for (const row of days) {
    if (row.partial) byDay.delete(row.day)
    else byDay.set(row.day, row)
  }

  let compared = false
  const ranked: Ranked[] = []
  for (const metric of metricsOf(groups)) {
    const result = compareMetric(metric, week, byDay)
    if (result === null) continue
    compared = true
    const alert = metricAlert(metric, result, range)
    if (alert !== null) ranked.push(alert)
  }
  if (cal !== null) ranked.push(...noShowAlerts(cal, week, range))
  if (!compared && ranked.length === 0) return null

  const warnFirst = (alert: Ranked) => (alert.kind === 'warn' ? 0 : 1)
  return ranked
    .sort((a, b) => warnFirst(a) - warnFirst(b) || b.change - a.change)
    .slice(0, MAX_ALERTS)
    .map(({ kind, name, text, range: shown }) => ({ kind, name, text, range: shown }))
}
