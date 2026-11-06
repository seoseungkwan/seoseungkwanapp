import { formatDelta, formatRate } from '@/components/charts/format'
import { compareNumbers } from '@/lib/analytics/compare'
import { isCovered } from '@/lib/analytics/coverage'
import { compareYmd, eachDay } from '@/lib/analytics/dates'
import type { Delta } from '@/types/analysis'
import type { DayPayload } from '@/types/payload'
import { codeKey, rxComparedCells, type CompareRange, type RxLine, type RxPickRow, type StatsInput, type StatsPeriod, type StatsRange, type YearCompare } from './view'

// 처방 골라 보기의 글자·찾기·복사 (rx-picker REQ-802·804·805·808). view.ts와 같은 규칙의 순수 함수다.
// 입력은 일 숫자·덮은 기간·표 줄뿐이고 환자 줄은 들어올 수 없다

export const COLUMN_NAME: Record<StatsPeriod, string> = { '7d': '지난 7일', '30d': '지난 30일', '90d': '지난 90일', '12m': '작년 같은 달' }
export const GRAIN_NAME: Record<StatsPeriod, '일' | '주' | '달'> = { '7d': '일', '30d': '일', '90d': '주', '12m': '달' }

const NO_VALUE = '–'
const RATE_MEANING = '신환율 = 신환 ÷ 건수 · 재진율 = 재진 ÷ 건수'
const ARROW = { up: '▲ ', down: '▼ ', flat: '', none: '' } as const
const UNAVAILABLE: Delta = { kind: 'unavailable' }

const sum = <T>(list: readonly T[], of: (item: T) => number) => list.reduce((total, item) => total + of(item), 0)

// ── 비율 ─────────────────────────────────────────────────

// 밑수는 건수다. 소수 첫째 자리까지 버린 글자(반올림하지 않는다)
export function rateText(part: number, whole: number): string {
  return whole > 0 ? `${formatRate(part / whole)}%` : NO_VALUE
}

// '14.2%' → 142. 소수로 더하면 14.2 + 71.4 = 85.60000000000001이다
const permille = (rate: string) => Number(rate.replace(/[.%]/g, ''))

// 보이는 두 비율 글자의 합. 비율을 먼저 더하지 않아 건수 3·신환 1·재진 2는 99.9%다
export function addedRateText(row: RxPickRow): string {
  if (row.count <= 0) return NO_VALUE
  const added = permille(rateText(row.newCount, row.count)) + permille(rateText(row.returningCount, row.count))
  return `${Math.trunc(added / 10)}.${added % 10}%`
}

// ── 합계·안내 ────────────────────────────────────────────

// 고른 기간의 작년 합계: 견줄 수 있는 줄의 건수·작년 건수를 더한다(견줄 수 있는지는 처방과 상관없어 모든 줄이 같다)
function lastYearTotal(rows: readonly RxPickRow[]): YearCompare {
  const counted = rows.flatMap((row) => (row.lastYear === undefined || row.lastYear.previous === null ? [] : [{ current: row.count, previous: row.lastYear.previous }]))
  if (counted.length === 0) return { previous: null, delta: UNAVAILABLE }
  const previous = sum(counted, (pair) => pair.previous)
  return { previous, delta: compareNumbers(sum(counted, (pair) => pair.current), previous) }
}

// 지난 기간과 증감은 합계 건수가 아니라 줄마다 견준 짝의 합으로 낸다. 남은 짝은 모든 줄이 같다(rxComparedCells).
// 고른 기간은 비교마다 더한다(바로 전 = comparable·delta, 작년 = lastYear)
export function rxPickTotal(rows: readonly RxPickRow[]): RxPickRow | null {
  if (rows.length < 2) return null
  const compared = rows.flatMap((row) => (row.comparable === null ? [] : [row.comparable]))
  const comparable = compared.length === 0 ? null : { current: sum(compared, (pair) => pair.current), previous: sum(compared, (pair) => pair.previous) }
  return {
    code: '',
    name: '합계',
    count: sum(rows, (row) => row.count),
    newCount: sum(rows, (row) => row.newCount),
    returningCount: sum(rows, (row) => row.returningCount),
    gapCount: sum(rows, (row) => row.gapCount),
    partial: rows.some((row) => row.partial),
    comparable,
    delta: comparable === null ? UNAVAILABLE : compareNumbers(comparable.current, comparable.previous),
    ...(rows.some((row) => row.lastYear !== undefined) ? { lastYear: lastYearTotal(rows) } : {}),
  }
}

// 견줄 짝이 빠졌을 때의 안내. 남은 짝이 없으면 증감 칸이 '비교할 수 없음'이라 적지 않는다
export function pickComparedNote(input: StatsInput): string | null {
  const { kept, dropped } = rxComparedCells(input)
  if (!dropped || kept < 1) return null
  const pairs = input.range.grain === 'month' ? `끝난 ${kept}달` : `두 기간 모두 자료가 있는 ${kept}일`
  return `증감과 지난 기간 건수는 ${pairs}만 견줘요. 건수는 기간 전체예요.`
}

// ── 찾기 목록 ─────────────────────────────────────────────

// 표의 건수(buildTrend)와 같은 셈이다: 덮은 기간 안 날의 합이고 같은 날 줄이 둘이면 뒤의 것이다. 이 기간에 없는 처방은 들어 있지 않다
export function rxPeriodCounts({ days, covered, range }: StatsInput): Map<string, number> {
  const byDay = new Map(days.map((row) => [row.day, row]))
  const merged = [...covered]
  const counts = new Map<string, number>()
  for (const day of eachDay(range.current)) {
    if (!isCovered({ from: day, to: day }, merged)) continue
    for (const { code, patients } of byDay.get(day)?.rx ?? []) counts.set(codeKey(code), (counts.get(codeKey(code)) ?? 0) + patients)
  }
  return counts
}

function compareCode(a: RxLine, b: RxLine): number {
  const [left, right] = [codeKey(a.code), codeKey(b.code)]
  return left < right ? -1 : left > right ? 1 : 0
}

// days는 넓은 범위와 화면의 날 숫자, extra는 고른 처방이다. 코드(대소문자 합침)마다 가장 최근 날의 글자·이름이고 날 줄에 없는 고른 처방은 저장한 글자·이름이다.
// check에 걸린 줄은 합치기 전에 뺀다. check는 코드·이름 두 열쇠만 받는다(validateRxPick은 다른 열쇠가 있으면 거부한다)
export function rxCatalog(days: readonly DayPayload[], extra: readonly RxLine[], check: (line: RxLine) => boolean): RxLine[] {
  const lines = new Map<string, RxLine>()
  for (const { code, name } of extra) {
    const line = { code, name }
    if (!lines.has(codeKey(code)) && check(line)) lines.set(codeKey(code), line)
  }
  const oldestFirst = [...days].sort((a, b) => compareYmd(a.day, b.day)) // 같은 날은 받은 차례 그대로라 뒤의 줄이 남는다
  for (const row of oldestFirst) {
    for (const { code, name } of row.rx) {
      const line = { code, name }
      if (check(line)) lines.set(codeKey(code), line)
    }
  }
  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko') || compareCode(a, b))
}

// 앞뒤 빈칸을 뺀 글자가 이름이나 코드에 든 줄. 영문 대소문자를 가리지 않는다. 글자가 없으면 모든 줄이다
export function searchCatalog(catalog: readonly RxLine[], query: string): RxLine[] {
  const wanted = query.trim().toLowerCase()
  return catalog.filter(({ code, name }) => name.toLowerCase().includes(wanted) || code.toLowerCase().includes(wanted))
}

// ── 표 복사 ──────────────────────────────────────────────

const oneLine = (text: string) => text.replace(/[\t\r\n]+/g, ' ')

function deltaCell(delta: Delta): string {
  const view = formatDelta(delta, '건')
  return `${ARROW[view.dir]}${view.text}`
}

// 고른 기간 + 작년 비교일 때만 작년 두 칸이 붙는다
const hasLastYear = (range: StatsRange): range is StatsRange & { lastYear: CompareRange } => range.period === null && range.lastYear !== null

function copyLine(row: RxPickRow, range: StatsRange): string {
  const lastYear = row.lastYear ?? { previous: null, delta: UNAVAILABLE }
  return [
    oneLine(row.code),
    oneLine(row.name),
    row.count,
    row.comparable === null ? NO_VALUE : row.comparable.previous,
    deltaCell(row.delta),
    ...(hasLastYear(range) ? [lastYear.previous === null ? NO_VALUE : lastYear.previous, deltaCell(lastYear.delta)] : []),
    row.newCount,
    rateText(row.newCount, row.count),
    row.returningCount,
    rateText(row.returningCount, row.count),
    row.gapCount,
  ].join('\t')
}

// 비교 칸 머리. 빠른 단추는 지금 이름('지난 30일'·'증감'), 고른 기간은 비교마다 '{name}'·'{name}보다'
function compareHead(range: StatsRange): string[] {
  if (range.period !== null) return [COLUMN_NAME[range.period], '증감']
  const compares = [range.previous, ...(range.lastYear === null ? [] : [range.lastYear])]
  return compares.flatMap(({ name }) => [name, `${name}보다`])
}

// periodName은 부르는 쪽이 준다(PERIOD_NAME이 화면 파일에 있다). 비교 글의 괄호는 비교마다 why다(빠른 단추의 why = COMPARE_NAME)
export function rxPickCopyText({ hospitalName, periodName, range, rows, total }: { hospitalName: string; periodName: string; range: StatsRange; rows: readonly RxPickRow[]; total: RxPickRow | null }): string {
  const compares = [range.previous, ...(range.lastYear === null ? [] : [range.lastYear])]
  return [
    `${oneLine(hospitalName)} 처방 골라 보기`,
    `${periodName} (${range.current.label}) · 비교: ${compares.map(({ label, why }) => `${label} (${why})`).join(' · ')}`,
    ['코드', '처방', '건수', ...compareHead(range), '신환', '신환율', '재진', '재진율', '구분 없음'].join('\t'),
    ...rows.map((row) => copyLine(row, range)),
    ...(total === null ? [] : [copyLine(total, range)]),
    RATE_MEANING,
  ].join('\n')
}
