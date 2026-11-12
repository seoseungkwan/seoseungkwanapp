import type { DateRange } from '@/types/dates'
import type { RxSplit, RxSplitDay, RxSplitLine } from '@/types/stats'
import { compareYmd, diffDays, weekdayOf } from './dates'

// 처방별 신환·재진 [환자 자료 구역]. 원본 양지바른 medicore/rx_visit_split.py(2a1069b)의 계산과 글을 옮겼다.
// 글자 하나까지 fixtures/stats/golden/rx-visit-split-*.json과 같아야 한다. 일부러 다른 곳은 그 머리의 knownDiffs에 있다.
// 진료 줄과 환자 번호는 안에서 세는 데만 쓰고 결과에는 수만 남긴다

export type { RxSplit, RxSplitDay, RxSplitLine } from '@/types/stats'

// 진료 줄 한 칸. p = 메모리 번호, d·f = YYYY-MM-DD, f(첫 내원일)를 못 찾았으면 ''
export type VisitRow = { p: number; d: string; c: string; f: string }
export type RxSplitTotals = { visits: number; patients: number; newPatients: number; invalidCodes?: number }
export type RxSplitDayTotals = { date: string; visits: number; patients: number; newPatients: number }

export const ANY_LABEL = '고른 처방 중 하나라도'
export const ANY_CODE = '' // 처방코드는 한 글자 이상이라 겹치지 않는다

const WEEKDAYS = '월화수목금토일'

// seen = 그 줄의 처방을 받은 환자, new = 그중 신환 줄이 하나라도 있는 환자. 한 환자는 한 줄에서 신환이나 재진 한쪽에만 든다
type Tally = { new: Set<number>; seen: Set<number> }
const newTally = (): Tally => ({ new: new Set(), seen: new Set() })

const toLine = (code: string, label: string, tally: Tally): RxSplitLine => ({
  code,
  label,
  newPatients: tally.new.size,
  returning: tally.seen.size - tally.new.size,
  total: tally.seen.size,
})

const count = (tally: Tally, row: VisitRow, isNew: boolean) => {
  tally.seen.add(row.p)
  if (isNew) tally.new.add(row.p)
}

// 코드 차례대로 줄을 낸다. 코드가 둘 이상이면 마지막에 '하나라도' 줄. 그 줄에는 목록에 없는 코드의 줄도 든다(원본 그대로)
function splitLines(
  rows: readonly VisitRow[],
  codes: readonly string[],
  names: ReadonlyMap<string, string>,
  isNew: (row: VisitRow) => boolean,
): RxSplitLine[] {
  const tallies = new Map<string, Tally>(codes.map((code) => [code, newTally()]))
  const any = newTally()
  for (const row of rows) {
    const rowIsNew = isNew(row)
    const tally = tallies.get(row.c)
    if (tally) count(tally, row, rowIsNew)
    count(any, row, rowIsNew)
  }
  const lines = [...tallies].map(([code, tally]) => toLine(code, names.get(code) || code, tally))
  if (lines.length > 1) lines.push(toLine(ANY_CODE, ANY_LABEL, any))
  return lines
}

// 그 진료 줄이 우리 병원 최초 내원일(f)의 방문인지. 기간 셈과 날짜별 셈이 같은 기준을 쓴다
const isFirstVisitRow = (row: VisitRow) => row.f === row.d

// 원본 summarize. 신환 = 그 진료 줄의 진료일이 우리 병원 최초 내원일(f)인 줄(rx-split-new, 사용자 결정 2026-11-12).
// 원본은 f가 기간 첫날 이후면 기간 내내 신환이다(골든 knownDiffs). f를 못 찾은 줄('')은 어느 날과도 같지 않아 재진
export function rxVisitSplit(
  rows: readonly VisitRow[],
  totals: RxSplitTotals,
  codes: readonly string[],
  range: DateRange,
  names: ReadonlyMap<string, string>,
): RxSplit {
  const { from, to } = range
  const within = rows.filter((row) => compareYmd(row.d, from) >= 0 && compareYmd(row.d, to) <= 0)
  return {
    from,
    to,
    visits: totals.visits,
    patients: totals.patients,
    newPatients: totals.newPatients,
    returning: totals.patients - totals.newPatients,
    lines: splitLines(within, codes, names, isFirstVisitRow),
    invalidCodes: totals.invalidCodes ?? 0,
  }
}

// 원본 summarize_days. 그날 신환 = 그날이 첫 내원일. 그래서 날짜별 합과 기간 합계의 신환은 다를 수 있다
export function rxVisitSplitDays(
  rows: readonly VisitRow[],
  dayTotals: readonly RxSplitDayTotals[],
  codes: readonly string[],
  names: ReadonlyMap<string, string>,
): RxSplitDay[] {
  const rowsByDay = new Map<string, VisitRow[]>()
  for (const row of rows) {
    const sameDay = rowsByDay.get(row.d)
    if (sameDay) sameDay.push(row)
    else rowsByDay.set(row.d, [row])
  }
  return [...dayTotals]
    .sort((a, b) => compareYmd(a.date, b.date))
    .map(({ date, visits, patients, newPatients }) => ({
      date,
      visits,
      patients,
      newPatients,
      returning: patients - newPatients,
      lines: splitLines(rowsByDay.get(date) ?? [], codes, names, isFirstVisitRow),
    }))
}

// ── 글 ───────────────────────────────────────────────────

const comma = (n: number) => n.toLocaleString('en-US')
// 파이썬 ljust는 글자(코드 포인트) 수로 맞춘다
const charCount = (s: string) => [...s].length
const ljust = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - charCount(s)))
const rjust4 = (n: number) => String(n).padStart(4)

const dayLabel = (ymd: string) => `${ymd} (${WEEKDAYS[weekdayOf(ymd) - 1]})`

function periodText({ from, to }: RxSplit): string {
  return from === to ? dayLabel(from) : `${from} ~ ${to} (${diffDays(from, to) + 1}일)`
}

export function rxVisitHeadline(s: RxSplit): string {
  return (
    `${periodText(s)} · 외래 환자 ${comma(s.patients)}명 ` +
    `(신환 ${comma(s.newPatients)}명 · 재진 ${comma(s.returning)}명) · 내원 ${comma(s.visits)}건`
  )
}

// 복사용 글. 숫자만 담는다
export function formatRxVisitSplit(hospital: string, s: RxSplit): string {
  const width = Math.max(4, ...s.lines.map((line) => charCount(line.label)))
  const lines = [hospital, '처방별 신환·재진', rxVisitHeadline(s), '', `${ljust('처방', width)}   신환   재진   합계`]
  for (const line of s.lines) {
    lines.push(`${ljust(line.label, width)}  ${rjust4(line.newPatients)}명 ${rjust4(line.returning)}명 ${rjust4(line.total)}명`)
  }
  if (s.invalidCodes) lines.push('', `※ 코드 형식이 달라 빠진 처방 ${comma(s.invalidCodes)}건`)
  return lines.join('\n')
}

// 날짜별 복사용 글. 숫자만 담는다
export function formatRxVisitSplitDays(hospital: string, s: RxSplit, days: readonly RxSplitDay[]): string {
  const lines = [hospital, '처방별 신환·재진 (날짜별)', rxVisitHeadline(s)]
  for (const day of days) {
    lines.push('', `${dayLabel(day.date)} · 외래 환자 ${comma(day.patients)}명 (신환 ${comma(day.newPatients)} · 재진 ${comma(day.returning)})`)
    for (const line of day.lines) {
      lines.push(`  ${line.label}: 신환 ${comma(line.newPatients)} · 재진 ${comma(line.returning)} · 합계 ${comma(line.total)}`)
    }
  }
  return lines.join('\n')
}
