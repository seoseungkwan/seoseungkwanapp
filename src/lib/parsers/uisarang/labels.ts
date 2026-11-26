import { compareYmd, isYmd, parseDateCell } from '@/lib/analytics/dates'
import { uisUnitOf } from '@/lib/payload/uisarang'
import type { Cell, Grid } from '@/types/parse'
import type { UisRefuseCode, UisSpan } from '@/types/uisarang'
import { squash } from './cells'
import type { ReadKind } from './kind'

// 라벨 · 조회일 → 기간 · 조건(specs/uisarang-upload design.md §3-2·§3-3) [환자 자료 구역]

const SPAN_LABEL = '조회일'
const FIRST_DAY = '2020-01-01'
const ALL = '전체'
const DATE_TEXT = /^(\d{4})([-./])(\d{1,2})\2(\d{1,2})$/

type Label = { name: string; value: string }
export type Shown = { from: string; to: string }
export type SpanCheck = { ok: true; span: UisSpan } | { ok: false; code: UisRefuseCode; span: Shown | null }

// `[`로 시작하고 `]`가 든 칸. 이름 = 괄호 안 글자에서 빈칸을 모두 뺀 것, 값 = `]` 뒤 글자
function labelOf(cell: Cell | undefined): Label | null {
  if (typeof cell !== 'string') return null
  const text = cell.trim()
  const close = text.indexOf(']')
  if (!text.startsWith('[') || close === -1) return null
  const name = text.slice(1, close).replace(/\s+/g, '')
  return name === '' ? null : { name, value: text.slice(close + 1).trim() }
}

// 같은 줄 오른쪽 첫 글자 칸. 그 칸이 다른 라벨이면 값이 없다
function rightOf(row: readonly Cell[], c: number): Cell {
  for (let k = c + 1; k < row.length; k++) {
    const cell = row[k]
    if (cell === null || (typeof cell === 'string' && cell.trim() === '')) continue
    if (labelOf(cell) !== null) return null
    return typeof cell === 'string' ? cell.trim() : cell
  }
  return null
}

/** 머리 줄(at) 위의 라벨: 이름 → 값(없으면 null). 같은 이름이 또 나오면 첫 값 */
export function readLabels(grid: Grid, at: number): Map<string, Cell> {
  const labels = new Map<string, Cell>()
  for (let r = 0; r < at && r < grid.length; r++) {
    const row = grid[r]
    row.forEach((cell, c) => {
      const label = labelOf(cell)
      if (label === null || labels.has(label.name)) return
      labels.set(label.name, label.value !== '' ? label.value : rightOf(row, c))
    })
  }
  return labels
}

function dateOf(text: string): string | null {
  const m = DATE_TEXT.exec(text.trim())
  if (m === null) return null
  const ymd = `${m[1]}-${m[3].padStart(2, '0')}-${m[4].padStart(2, '0')}`
  return isYmd(ymd) ? ymd : null
}

/** 조회일 값: `YYYY-MM-DD` 또는 `YYYY-MM-DD ~ YYYY-MM-DD`(구분 `-`·`.`·`/`, 한 자리 달·날 됨) · 엑셀 날짜 숫자. 시작 > 끝이면 못 읽음(null) */
export function parseSpanText(value: Cell): Shown | null {
  if (typeof value === 'number') {
    const day = parseDateCell(value)
    return day === null ? null : { from: day, to: day }
  }
  if (typeof value !== 'string') return null
  const parts = value.split('~')
  if (parts.length > 2) return null
  const from = dateOf(parts[0])
  const to = parts.length === 2 ? dateOf(parts[1]) : from
  if (from === null || to === null || compareYmd(from, to) > 0) return null
  return { from, to }
}

/** 읽은 조회일(2020-01-01부터만). 화면이 받지 않은 줄에도 기간 글을 보이도록 쓴다 */
export function spanOf(labels: ReadonlyMap<string, Cell>): Shown | null {
  const value = labels.get(SPAN_LABEL)
  const span = value === undefined ? null : parseSpanText(value)
  return span !== null && compareYmd(span.from, FIRST_DAY) >= 0 ? span : null
}

/**
 * 조회일 → 기간(design.md §3-3). 차례 DATE → PERIOD/ONE-DAY → FUTURE.
 * 기간별처방통계·위쪽 표는 하루·한 주·한 달, 일일수입통계·아래쪽 표는 하루만. 끝 날이 오늘(한국 날짜) 뒤면 FUTURE
 */
export function checkSpan(kind: ReadKind, labels: ReadonlyMap<string, Cell>, today: string): SpanCheck {
  const shown = spanOf(labels)
  if (shown === null) return { ok: false, code: 'E-UIS-DATE', span: null }
  const unit = uisUnitOf(shown.from, shown.to)
  const oneDayOnly = kind === 'income' || kind === 'visitPatients'
  if (oneDayOnly && unit !== 'day') return { ok: false, code: 'E-UIS-ONE-DAY', span: shown }
  if (unit === null) return { ok: false, code: 'E-UIS-PERIOD', span: shown }
  if (compareYmd(shown.to, today) > 0) return { ok: false, code: 'E-UIS-FUTURE', span: shown }
  return { ok: true, span: { from: shown.from, to: shown.to, unit } }
}

/** 조회일이 아닌 라벨의 값이 모두 빈칸·전체·날짜 모양인가(아니면 E-UIS-FILTER — 예 `[외/입 구분] 외래`) */
export function filtersOk(labels: ReadonlyMap<string, Cell>): boolean {
  for (const [name, value] of labels) {
    if (name === SPAN_LABEL || value === null) continue
    const text = squash(value)
    if (text === '' || text === ALL) continue
    if (parseSpanText(value) !== null || (typeof value === 'string' && parseDateCell(value) !== null)) continue
    return false
  }
  return true
}
