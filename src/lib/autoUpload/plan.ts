import { isCovered, mergeRanges } from '@/lib/analytics/coverage'
import { addDays, addMonths, compareYmd, monthOf, monthRange } from '@/lib/analytics/dates'
import { planRevenue, savedMark } from '@/lib/revenue/sync'
import type { SavedSalesMark, StatsMarks } from '@/lib/storage/autoUpload'
import type { DateRange } from '@/types/dates'
import type { RevenueDaysResult } from '@/types/revenue'
import { fillRange } from './range'

// 저절로 올리기 — 할 일 셈(spec admin-view REQ-8021 AC-8021.2·AC-8021.9, design.md '저절로 올리기 — 통계 조각').
// 순수 함수만(네트워크·저장소 없음, 환자 자료 구역 밖). 받는 것은 저장된 날의 표시(날짜·참거짓)뿐이고 돌려주는 것은 기간뿐이다.
// 매출은 통계 탭과 같은 planRevenue·savedMark, 통계는 '할 달'을 골라 새 조각 하나(최근 24달) + 옛 조각(12달 이하씩)으로 묶는다.
// 일 차례는 끝날이 늦은 것부터(같으면 매출 먼저) — 그래서 어제가 든 매출 덩어리와 어제까지 저장하는 새 조각이 맨 앞이다

/** 새 조각이 맡는 최근 달 수(이번 달 포함) */
export const RECENT_MONTHS = 24
/** 옛 조각 하나의 달 수 한도 */
export const OLD_PART_MONTHS = 12
/** '몇 번까지 받나'(dropoff)를 지켜보는 달 수 — 그 달 + 석 달의 끝까지 읽어야 다 센 값이다 */
const WATCH_MONTHS = 3
/** 저장 첫날 앞으로 더 읽는 날(통계 탭 loadPlan과 같은 이웃 여유) */
const NEIGHBOR_DAYS = 31

export type UploadPart = { save: DateRange; read: DateRange }
export type UploadTask = { kind: 'revenue'; range: DateRange } | { kind: 'stats'; part: UploadPart }
export type UploadProgress = { through: string | null; filledFrom: string | null }
export type PlanInput = {
  today: string
  /** 채울 기간 달 수(fillRange) */
  months: number
  /** DB가 아는 다 올라온 날(없으면 null). 어제보다 앞이면 그날 처음 연 것 */
  throughDay: string | null
  sales: readonly SavedSalesMark[]
  coverage: readonly DateRange[]
  marks: StatsMarks
  /** 그 의원이 고른 묶음이 있는지(처방 묶음·Block·물리치료 묶음). null = 묶음 정의를 읽지 못함 → 통계 일 없음 */
  groups: { rx: boolean; sunap: boolean } | null
  /** 도우미 판(savedMark). 모르면 null */
  helperVersion: string | null | undefined
}

const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)
const endOf = (task: UploadTask) => (task.kind === 'revenue' ? task.range.to : task.part.save.to)

/** 매출 날마다 다 저장됐는지(savedMark — 도우미 판에 따라 확인 필요한 날은 거짓) */
export function revenueSaved(sales: readonly SavedSalesMark[], helperVersion: string | null | undefined): Map<string, boolean> {
  return new Map(sales.map((row) => [row.date, savedMark(row, helperVersion)]))
}

/** 방금 저장한 매출 답을 저장 표시와 같은 모양으로(dayCodes = 날 단위 처방 줄을 같이 보냈는지) */
export function marksOfResult(result: RevenueDaysResult): SavedSalesMark[] {
  const dayCodes = result.dayCodes !== undefined
  return result.days.map((row) => ({
    date: row.date,
    dayCodes,
    unconfirmed: row.unconfirmed,
    roughTotal: typeof row.roughTotal === 'number' ? row.roughTotal : null,
  }))
}

/** 통계 '할 달'(옛 달부터): (가) 채울 기간 안 날이 다 덮이지 않음 · 최근 24달 안에서 (나) Block·물리치료 묶음이 있는데 수납 합계 없는 날 줄이 있음 ·
 * (다) 처방 묶음이 있고 다 끝난 달 줄의 dropoff가 없거나 asOf < min(그 달 + 석 달의 끝, 어제) */
function todoMonths(input: PlanInput, groups: { rx: boolean; sunap: boolean }, fill: DateRange): string[] {
  const yesterday = fill.to
  const covered = mergeRanges([...input.coverage])
  const recentFrom = addMonths(monthOf(input.today), -(RECENT_MONTHS - 1))
  const noSunap = new Set(input.marks.days.filter((row) => !row.hasSunap).map((row) => monthOf(row.day)))
  const monthMarks = new Map(input.marks.months.map((row) => [row.month, row]))
  const todo: string[] = []
  for (let month = monthOf(fill.from); month <= monthOf(fill.to); month = addMonths(month, 1)) {
    const span = monthRange(month)
    const inFill = { from: compareYmd(span.from, fill.from) >= 0 ? span.from : fill.from, to: earlier(span.to, yesterday) }
    const recent = month >= recentFrom
    const finished = compareYmd(span.to, yesterday) <= 0
    const mark = monthMarks.get(month)
    const watchedTo = earlier(monthRange(addMonths(month, WATCH_MONTHS)).to, yesterday)
    const uncovered = !isCovered(inFill, covered)
    const sunapMissing = recent && groups.sunap && noSunap.has(month)
    const dropoffMissing =
      recent && groups.rx && finished && mark !== undefined && (mark.dropoffAsOf === null || compareYmd(mark.dropoffAsOf, watchedTo) < 0)
    if (uncovered || sunapMissing || dropoffMissing) todo.push(month)
  }
  return todo
}

function statsTasks(input: PlanInput, groups: { rx: boolean; sunap: boolean }, fill: DateRange): UploadTask[] {
  const yesterday = fill.to
  const recentFrom = addMonths(monthOf(input.today), -(RECENT_MONTHS - 1))
  const todo = todoMonths(input, groups, fill)
  const tasks: UploadTask[] = []
  // 새 조각: 최근 할 달 가운데 가장 이른 달 1일 ~ 어제(읽기 끝 = 저장 끝 — 확실한 조각)
  const firstRecent = todo.find((month) => month >= recentFrom)
  if (firstRecent !== undefined) {
    const save = { from: monthRange(firstRecent).from, to: yesterday }
    tasks.push({ kind: 'stats', part: { save, read: { from: addDays(save.from, -NEIGHBOR_DAYS), to: yesterday } } })
  }
  // 옛 조각: 최근 달부터 이어진 할 달 12달 이하씩. 읽기 끝 = 끝 달 + 석 달의 끝(어제를 넘지 않음)
  const runs: string[][] = []
  for (const month of todo.filter((item) => item < recentFrom).reverse()) {
    const run = runs.at(-1)
    if (run !== undefined && run.length < OLD_PART_MONTHS && addMonths(month, 1) === run.at(-1)) run.push(month)
    else runs.push([month])
  }
  for (const run of runs) {
    const last = run[0]!
    const save = { from: monthRange(run.at(-1)!).from, to: monthRange(last).to }
    const read = { from: addDays(save.from, -NEIGHBOR_DAYS), to: earlier(monthRange(addMonths(last, WATCH_MONTHS)).to, yesterday) }
    tasks.push({ kind: 'stats', part: { save, read } })
  }
  return tasks
}

/** 할 일 목록. 할 일이 없으면 빈 목록 */
export function uploadPlan(input: PlanInput): UploadTask[] {
  const fill = fillRange(input.today, input.months)
  const yesterday = fill.to
  const saved = revenueSaved(input.sales, input.helperVersion)
  // planRevenue는 어제를 늘 다시 읽는다. 그날 두 번째 열기부터는 다 저장된 어제를 빼고 셈한다
  const firstToday = input.throughDay === null || compareYmd(input.throughDay, yesterday) < 0
  const whole = firstToday || saved.get(yesterday) !== true ? fill : { from: fill.from, to: addDays(yesterday, -1) }
  const tasks: UploadTask[] = planRevenue(whole, input.today, false, saved).map((range) => ({ kind: 'revenue', range }))
  if (input.groups !== null) tasks.push(...statsTasks(input, input.groups, fill))
  // 끝날이 늦은 것부터. sort는 안정적이라 같은 끝날이면 앞에 넣은 매출이 먼저다
  return tasks.sort((a, b) => compareYmd(endOf(b), endOf(a)))
}

/** 채울 기간 안 매출(revenue 참)·통계(덮음)가 둘 다 저장된 날로 through_day·filled_from(AC-8021.9) */
export function progressOf(fill: DateRange, revenue: ReadonlyMap<string, boolean>, coverage: readonly DateRange[]): UploadProgress {
  const covered = mergeRanges([...coverage])
  const done = (day: string) => revenue.get(day) === true && isCovered({ from: day, to: day }, covered)
  let through: string | null = null
  for (let day = fill.to; compareYmd(day, fill.from) >= 0; day = addDays(day, -1)) {
    if (done(day)) {
      through = day
      break
    }
  }
  if (through === null) return { through: null, filledFrom: null }
  let first = through
  while (compareYmd(first, fill.from) > 0 && done(addDays(first, -1))) first = addDays(first, -1)
  const filledFrom = first.endsWith('-01') ? first : monthRange(addMonths(monthOf(first), 1)).from
  return { through, filledFrom: compareYmd(filledFrom, through) <= 0 ? filledFrom : null }
}
