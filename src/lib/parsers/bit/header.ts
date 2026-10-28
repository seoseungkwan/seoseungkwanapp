import { compareYmd, parseDateCell } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { Cell, Grid } from '@/types/parse'
import { normalizeColumnName } from './columnMap'

// 비트 표 머리: 제목 줄·'기간' 줄·빈 줄 뒤에 칸 이름 줄(머리줄)이 온다
const HEADER_SEARCH_ROWS = 20

const textOf = (cell: Cell | undefined) => (typeof cell === 'string' ? normalizeColumnName(cell) : '')
const isChartName = (name: string) => name.includes('차트') || name.includes('등록번호')

// 위 20줄 안에서 '차트'(또는 '등록번호')가 든 칸과 '처방코드'가 든 다른 칸이 함께 있는 첫 줄. 없으면 -1
export function findHeaderRow(grid: Grid): number {
  const end = Math.min(grid.length, HEADER_SEARCH_ROWS)
  for (let r = 0; r < end; r++) {
    const names = grid[r].map(textOf)
    const hasCode = (except: number) => names.some((name, i) => i !== except && name.includes('처방코드'))
    if (names.some((name, i) => isChartName(name) && hasCode(i))) return r
  }
  return -1
}

// 머리줄 위 '기간' 칸(과 그 뒤 칸들)에서 '시작 ~ 끝' 날짜 두 개. 시작 > 끝이거나 못 읽으면 null
export function readPeriod(grid: Grid, headerRow: number): DateRange | null {
  for (let r = 0; r < headerRow; r++) {
    const row = grid[r]
    const at = row.findIndex((cell) => typeof cell === 'string' && cell.includes('기간'))
    if (at === -1) continue
    const label = String(row[at])
    const rest = row.slice(at + 1).map((cell) => (cell === null ? '' : String(cell)))
    const period = periodIn([label.slice(label.indexOf('기간') + '기간'.length), ...rest].join(' '))
    if (period !== null) return period
  }
  return null
}

// ': 2026-09-01 00:00 ~ 2026-10-24' → 물결 앞의 마지막 날짜 ~ 물결 뒤의 첫 날짜
function periodIn(text: string): DateRange | null {
  const sides = text.split('~')
  if (sides.length !== 2) return null
  const from = datesIn(sides[0]).pop()
  const to = datesIn(sides[1]).shift()
  if (from === undefined || to === undefined || compareYmd(from, to) > 0) return null
  return { from, to }
}

// 공백으로 나눈 낱말 중 날짜로 읽히는 것들(앞뒤에 붙은 ':'·괄호 등은 뗀다)
function datesIn(text: string): string[] {
  const dates: string[] = []
  for (const word of text.split(/\s+/)) {
    const date = parseDateCell(word.replace(/^[^\d]+|[^\d]+$/g, ''))
    if (date !== null) dates.push(date)
  }
  return dates
}
