import { addDays, compareYmd, diffDays, eachDay, isYmd, monthOf, sameDayLastMonth, weekdayOf, weekRange, weekStartOf } from '@/lib/analytics/dates'
import commands from '@/lib/bridge/commands.json'
import type { ClaimDayCount } from '@/lib/storage/claimCounts'
import type { DayCount } from '@/types/bridge'
import type { DateRange } from '@/types/dates'

// 날짜 목록과 기간 계산(AC-013.1·AC-013.2·AC-013.13, design.md 6-4). 날짜와 숫자뿐이다(환자 글자 없음). 날짜 계산 자체는 lib/analytics/dates.ts 한 곳이다

/** 한 번에 불러오는 기간(시작·끝을 함께 센다, AC-008.1). 도우미 명령 표와 같은 값이다 */
const MAX_PERIOD_DAYS: number = commands.commands['claim.month'].maxDays
/** claim.dates 한도(시작·끝을 함께 센다) */
const MAX_LIST_DAYS: number = commands.commands['claim.dates'].maxDays
/** 날짜 목록 기본 길이: 최근 60일 */
const LIST_DAYS = 60
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일

export type DateRow = {
  date: string
  visits: number
  memoInBit: number
  /** 서버 건수. 아직 불러오지 않은 날은 null */
  needMemo: number | null
  entered: number | null
  left: number | null
  /** 다 끝난 날 */
  done: boolean
  updatedAt: string | null
}

/** 진료 0건인 날을 빼고 ① 덜 끝난 날(메모 필요 > 입력, 또는 아직 불러오지 않은 날)을 오래된 날부터 ② 다 끝난 날을 최근 날부터(AC-013.1) */
export function buildDateList(days: readonly DayCount[], counts: readonly ClaimDayCount[]): DateRow[] {
  const countOf = new Map(counts.map((count) => [count.visit_date, count]))
  const rows = days
    .filter((day) => day.visits > 0)
    .map((day): DateRow => {
      const count = countOf.get(day.date)
      const left = count ? Math.max(count.need_memo - count.entered, 0) : null
      return {
        date: day.date,
        visits: day.visits,
        memoInBit: day.memoInBit,
        needMemo: count?.need_memo ?? null,
        entered: count?.entered ?? null,
        left,
        done: left === 0,
        updatedAt: count?.updated_at ?? null,
      }
    })
  const unfinished = rows.filter((row) => !row.done).sort((a, b) => compareYmd(a.date, b.date))
  const finished = rows.filter((row) => row.done).sort((a, b) => compareYmd(b.date, a.date))
  return [...unfinished, ...finished]
}

/** claim.dates로 물을 기간: 최근 60일 + 서버 건수에 남은 일이 있는 더 옛날(design.md 15절). 400일을 넘지 않는다 */
export function listRange(today: string, counts: readonly ClaimDayCount[]): DateRange {
  const oldestAllowed = addDays(today, 1 - MAX_LIST_DAYS)
  const recent = addDays(today, 1 - LIST_DAYS)
  const oldestLeft = counts
    .filter((count) => count.need_memo > count.entered)
    .map((count) => count.visit_date)
    .sort(compareYmd)[0]
  const from = oldestLeft !== undefined && compareYmd(oldestLeft, recent) < 0 ? oldestLeft : recent
  return { from: compareYmd(from, oldestAllowed) < 0 ? oldestAllowed : from, to: today }
}

/**
 * 고른 기간이 불러올 수 있는지. 안 되면 보일 안내, 되면 null(AC-013.2). 그리는 동안 부르므로 던지지 않는다:
 * 크롬 날짜 칸은 연도를 칠 때마다 값을 바꿔 0002-10-28 같은 값이 온다. isYmd가 빈 값과 함께 거른다
 */
export function checkPeriod({ from, to }: DateRange): string | null {
  if (!isYmd(from) || !isYmd(to)) return '날짜를 골라 주세요'
  if (compareYmd(from, to) > 0) return '기간의 시작일이 종료일보다 늦습니다.'
  if (diffDays(from, to) + 1 > MAX_PERIOD_DAYS) return `한 번에 ${MAX_PERIOD_DAYS}일까지 고를 수 있어요.`
  return null
}

/** claim.month가 읽는 기간: 시작과 '끝의 한 달 전 같은 날' 가운데 빠른 날부터 끝까지(AC-013.13, 원본 '청구메모용 1개월 받기') */
export function readRange(visible: DateRange): DateRange {
  const monthAgo = sameDayLastMonth(visible.to)
  return { from: compareYmd(monthAgo, visible.from) < 0 ? monthAgo : visible.from, to: visible.to }
}

/** 고른 기간의 달들, 이른 달부터(store.load는 고른 기간만 묻는다, AC-013.13) */
export const monthsIn = (visible: DateRange): string[] => [...new Set(eachDay(visible).map(monthOf))]

/** 한 번에 불러올 수 있는 길이로 자른다. 오래된 날부터 끝내게 앞쪽을 남긴다 */
function clipPeriod(period: DateRange): DateRange {
  return diffDays(period.from, period.to) + 1 > MAX_PERIOD_DAYS ? { from: period.from, to: addDays(period.from, MAX_PERIOD_DAYS - 1) } : period
}

/** [입력 안 된 날짜 모두]: 덜 끝난 첫 날 ~ 끝 날. 35일을 넘으면 앞에서 35일, 없으면 null */
export function unfinishedPeriod(rows: readonly DateRow[]): DateRange | null {
  const dates = rows.filter((row) => !row.done).map((row) => row.date)
  return dates.length ? clipPeriod({ from: dates[0], to: dates[dates.length - 1] }) : null
}

/** 처음 기간: [입력 안 된 날짜 모두]와 같다. 덜 끝난 날이 없으면 오늘 하루 */
export function defaultPeriod(rows: readonly DateRow[], today: string): DateRange {
  return unfinishedPeriod(rows) ?? { from: today, to: today }
}

/** [이번 주](0)·[지난주](-1): 월~일 */
export const weekPeriod = (today: string, weeks: number): DateRange => weekRange(addDays(weekStartOf(today), weeks * 7))

/**
 * 표의 체크: 기간은 이어진 날들이라 체크 하나가 끝을 움직인다. 기간 밖 날을 고르면 그 날까지 넓히고,
 * 기간 안 날을 풀면 가까운 쪽 끝을 그 날 다음으로 당긴다. 하루만 남은 기간은 그대로다(기간이 비지 않게)
 */
export function toggleDay(period: DateRange, date: string): DateRange {
  if (!isYmd(period.from) || !isYmd(period.to)) return { from: date, to: date } // 비었거나 연도를 치는 중간 값(checkPeriod)
  if (compareYmd(date, period.from) < 0) return { from: date, to: period.to }
  if (compareYmd(date, period.to) > 0) return { from: period.from, to: date }
  if (period.from === period.to) return period
  return diffDays(period.from, date) <= diffDays(date, period.to) ? { from: addDays(date, 1), to: period.to } : { from: period.from, to: addDays(date, -1) }
}

export const inPeriod = (date: string, { from, to }: DateRange) => Boolean(from && to) && compareYmd(date, from) >= 0 && compareYmd(date, to) <= 0

/** 고른 기간 요약: 진료한 날·환자·메모 필요(불러온 날이 없으면 null), 달마다 날 수 */
export function periodSummary(rows: readonly DateRow[], period: DateRange) {
  const inside = rows.filter((row) => inPeriod(row.date, period)).sort((a, b) => compareYmd(a.date, b.date))
  const known = inside.filter((row) => row.needMemo !== null)
  const months = new Map<number, number>()
  for (const row of inside) {
    const month = Number(row.date.slice(5, 7))
    months.set(month, (months.get(month) ?? 0) + 1)
  }
  return {
    days: inside.length,
    visits: inside.reduce((sum, row) => sum + row.visits, 0),
    needMemo: known.length ? known.reduce((sum, row) => sum + (row.needMemo ?? 0), 0) : null,
    months: [...months].map(([month, days]) => ({ month, days })),
  }
}

/** 10/28 (수) */
export function dayLabel(ymd: string): string {
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8))} (${WEEKDAYS[weekdayOf(ymd) - 1]})`
}

/** 상태 칩: 입력 전 · 진행중 n/m · 완료 */
export function statusOf(row: Pick<DateRow, 'done' | 'needMemo' | 'entered'>): { label: string; tone: 'neutral' | 'accent' | 'positive' } {
  if (row.done) return { label: '완료', tone: 'positive' }
  if (!row.entered) return { label: '입력 전', tone: 'neutral' }
  return { label: `진행중 ${row.entered}/${row.needMemo}`, tone: 'accent' }
}
