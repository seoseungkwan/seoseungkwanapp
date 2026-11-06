import { isCovered } from '@/lib/analytics/coverage'
import { addDays, compareYmd, diffDays, eachDay } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import { AGAIN_WINDOWS, type AgainWindow, type DayPayload } from '@/types/payload'
import { rateText } from './rxPickView'
import { codeKey, type RxLine, type StatsInput, type StatsRange } from './view'

// 같은 처방 재방문의 화면 숫자 (fu-rate REQ-1305). view.ts와 같은 규칙의 순수 함수다.
// 입력은 저장된 날 숫자(처방별 몇 명)·덮은 기간·고른 처방뿐이고 환자 줄은 들어올 수 없다. 날짜 계산은 lib/analytics/dates.ts만 쓴다

// from·to = 기간 첫날 ~ E(= min(기간 끝, 오늘 − 1)), days = 그 날 수. countFrom·countTo = 센 시작일.
// 옮김(shifted) = 기간 안에 창이 다 지난 날이 없어 다 지난 가장 최근 같은 길이 기간으로 옮김(신환 재방문율의 최근 30일과 같은 생각)
export type AgainSpan = { from: string; to: string; days: number; shifted: boolean; countFrom: string; countTo: string }
// ok = 센 날, no = 아직 셀 수 없는 날, out = 옮긴 범위와 기간 사이(기간 밖)
export type AgainDayKind = 'ok' | 'no' | 'out'
export type AgainStrip = { from: string; to: string; runs: { kind: AgainDayKind; days: number }[]; ok: number; no: number; out: number }
// starts·back·more = 센 날의 합, wait = 아직 셀 수 없는 날에 시작한 환자 수(기간 밖은 넣지 않는다)
export type AgainRow = { code: string; name: string; starts: number; back: number; more: number; wait: number }
export type AgainView = { span: AgainSpan; strip: AgainStrip; gapDays: number; hasRows: boolean; hasAgain: boolean; rows: AgainRow[] }

type Sums = { starts: number; back: number; more: number }

const NO_VALUE = '–'
const LONGEST: AgainWindow = AGAIN_WINDOWS[AGAIN_WINDOWS.length - 1]
const GAP_NOTE = (days: number) => ` 그 안에서도 ${days}일은 셀 수 없어요(따로 넣은 파일의 끝 무렵, 이 칸이 생기기 전에 저장한 날 등).`

const inRange = (ymd: string, range: DateRange) => compareYmd(ymd, range.from) >= 0 && compareYmd(ymd, range.to) <= 0

// 오늘은 statsRange의 불러올 범위 끝이다(parts.tsx todayOf와 같다). 12개월의 기간 끝은 이달 말일이라 어제로 자른다
function lastDayOf(range: StatsRange): string {
  const yesterday = addDays(range.load.to, -1)
  return compareYmd(range.current.to, yesterday) <= 0 ? range.current.to : yesterday
}

// ── 범위 ────────────────────────────────────────────────

export function againSpan(range: StatsRange, win: AgainWindow): AgainSpan {
  const from = range.current.from
  const to = lastDayOf(range)
  const days = diffDays(from, to) + 1
  // 고른 기간은 옮기지 않는다(옮긴 범위는 읽지 않은 날일 수 있다). 센 시작일 = 첫날 ~ min(기간 끝, 어제 − 창). 비면 모든 날이 아직 셀 수 없음이다(AC-1705.4)
  if (range.period === null) {
    const latest = addDays(range.load.to, -1 - win)
    return { from, to, days, shifted: false, countFrom: from, countTo: compareYmd(range.current.to, latest) <= 0 ? range.current.to : latest }
  }
  const countTo = addDays(to, -win)
  const shifted = compareYmd(countTo, from) < 0
  return { from, to, days, shifted, countFrom: shifted ? addDays(countTo, 1 - days) : from, countTo }
}

// 최근 7일만 페이지 읽기(비교 기간 첫날 ~) 앞을 더 읽는다: 가장 긴 창으로 옮긴 첫날(E − 36) ~ 비교 기간 첫날 − 1
export function againExtraSpan(range: StatsRange): DateRange | null {
  if (range.period !== '7d') return null
  return { from: againSpan(range, LONGEST).countFrom, to: addDays(range.previous.from, -1) }
}

export function needsExtra(range: StatsRange, win: AgainWindow): boolean {
  return againExtraSpan(range) !== null && win !== AGAIN_WINDOWS[0]
}

// ── 숫자 ────────────────────────────────────────────────

function add(sums: Map<string, Sums>, key: string, starts: number, back: number, more: number) {
  const now = sums.get(key) ?? { starts: 0, back: 0, more: 0 }
  sums.set(key, { starts: now.starts + starts, back: now.back + back, more: now.more + more })
}

// 띠 = 옮겼으면 옮긴 첫날, 아니면 기간 첫날 ~ E. 센 범위 안의 날은 그날 줄의 ready[창]이고, 줄이 없으면 덮은 기간 안일 때 휴진이라 센 날이다
export function againView(input: StatsInput, win: AgainWindow, picks: readonly RxLine[]): AgainView {
  const span = againSpan(input.range, win)
  const slot = AGAIN_WINDOWS.indexOf(win)
  const band: DateRange = { from: span.shifted ? span.countFrom : span.from, to: span.to }
  const byDay = new Map<string, DayPayload>()
  for (const row of input.days) if (inRange(row.day, band)) byDay.set(row.day, row) // 같은 날은 뒤의 것(rowsIn과 같다)
  const merged = [...input.covered]

  const kindOf = (ymd: string, row: DayPayload | undefined): AgainDayKind => {
    if (compareYmd(ymd, span.countTo) > 0) return compareYmd(ymd, span.from) < 0 ? 'out' : 'no'
    if (row === undefined) return isCovered({ from: ymd, to: ymd }, merged) ? 'ok' : 'no'
    return row.again?.ready[slot] === true ? 'ok' : 'no'
  }

  const runs: AgainStrip['runs'] = []
  const total: Record<AgainDayKind, number> = { ok: 0, no: 0, out: 0 }
  const counted = new Map<string, Sums>()
  const waiting = new Map<string, Sums>()
  let gapDays = 0
  for (const ymd of eachDay(band)) {
    const row = byDay.get(ymd)
    const kind = kindOf(ymd, row)
    total[kind] += 1
    const last = runs.at(-1)
    if (last?.kind === kind) last.days += 1
    else runs.push({ kind, days: 1 })
    if (kind === 'no' && compareYmd(ymd, span.countTo) <= 0) gapDays += 1
    if (kind === 'out') continue
    for (const line of row?.again?.rx ?? []) {
      if (kind === 'ok') add(counted, codeKey(line.code), line.starts, line.back[slot] ?? 0, line.more[slot] ?? 0)
      else add(waiting, codeKey(line.code), line.starts, 0, 0)
    }
  }

  const rows = picks.map(({ code, name }): AgainRow => {
    const sums = counted.get(codeKey(code)) ?? { starts: 0, back: 0, more: 0 }
    return { code, name, ...sums, wait: waiting.get(codeKey(code))?.starts ?? 0 }
  })
  const kept = [...byDay.values()]
  return {
    span,
    strip: { ...band, runs, ...total },
    gapDays,
    hasRows: kept.length > 0,
    hasAgain: kept.some((row) => row.again !== undefined),
    rows,
  }
}

// ── 글자 ────────────────────────────────────────────────

// 다시 받은 환자 ÷ 시작한 환자, 소수 첫째 자리까지 버림
export function againRateText(row: AgainRow): string {
  return rateText(row.back, row.starts)
}

// 더 받은 날 수 ÷ 시작한 환자 모두. 정수로 나눠 소수 첫째 자리까지 버린다(부동소수 오차 없음)
export function againAverageText(row: AgainRow): string {
  if (row.starts <= 0) return NO_VALUE
  const tenths = Math.floor((10 * row.more) / row.starts)
  return `평균 ${Math.trunc(tenths / 10)}.${tenths % 10}번 더`
}

export const isFewStarts = (row: AgainRow) => row.starts >= 1 && row.starts <= 9

// '{월}월 {일}일', 오늘과 해가 다르면 앞에 '{해}년 '
function dateText(ymd: string, today: string): string {
  const day = `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
  return ymd.slice(0, 4) === today.slice(0, 4) ? day : `${Number(ymd.slice(0, 4))}년 ${day}`
}

type BaseText = { lead: string; strong: string; tail: string }

// 고른 기간의 글. 창은 어제 − 센 범위 끝이다(센 범위가 비었거나 기간 끝 무렵이 창 안일 때만 쓴다)
function pickBaseText({ span, gapDays }: AgainView, range: StatsRange, periodName: string): BaseText {
  const date = (ymd: string) => dateText(ymd, range.load.to)
  const win = diffDays(span.countTo, addDays(range.load.to, -1))
  if (compareYmd(span.countTo, span.from) < 0) return { lead: `${periodName}에 시작한 환자는 아직 ${win}일이 다 지나지 않아 셀 수 없어요.`, strong: '', tail: '' }
  const gap = gapDays > 0 ? GAP_NOTE(gapDays) : ''
  const strong = `${date(span.from)} – ${date(span.countTo)}`
  if (span.countTo === span.to) return { lead: '', strong, tail: `에 시작한 환자로 셌어요.${gap}` }
  return { lead: '', strong, tail: `에 시작한 환자로 셌어요. 시작하고 ${win}일이 안 지난 ${date(addDays(span.countTo, 1))} – ${date(span.to)}은 아직 셀 수 없어요.${gap}` }
}

// 센 범위를 알리는 한 문장(앞·굵게·뒤). 기간 이름은 화면이 넘긴다(빠른 단추는 parts.tsx의 PERIOD_NAME, 고른 기간은 range.name. 이 파일이 .tsx를 불러오지 않게)
export function againBaseText(view: AgainView, range: StatsRange, periodName: string): BaseText {
  if (range.period === null) return pickBaseText(view, range, periodName)
  const { span, gapDays } = view
  const date = (ymd: string) => dateText(ymd, range.load.to)
  const win = diffDays(span.countTo, span.to) // 센 범위 끝 = E − w
  const gap = gapDays > 0 ? GAP_NOTE(gapDays) : ''
  if (span.shifted) {
    return {
      lead: `${periodName}(${date(span.from)} – ${date(span.to)})에 시작한 환자는 아직 ${win}일이 다 지나지 않았어요. 그래서 ${win}일이 다 지난 가장 최근 ${span.days}일, `,
      strong: `${date(span.countFrom)} – ${date(span.countTo)}`,
      tail: `에 시작한 환자로 봤어요.${gap}`,
    }
  }
  return {
    lead: '',
    strong: `${date(span.from)} – ${date(span.countTo)}`,
    tail: `에 시작한 환자로 셌어요. 시작하고 ${win}일이 안 지난 ${date(addDays(span.countTo, 1))} – ${date(span.to)}은 아직 셀 수 없어요.${gap}`,
  }
}
