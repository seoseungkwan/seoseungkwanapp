import { compareYmd, parseDateCell } from '@/lib/analytics/dates'
import type { ConsumptionRow, ParseResult, PatientIds } from '@/types/consumption'
import type { Cell, Grid } from '@/types/parse'
import { readGrid } from '../common'
import { toRegion } from '../region'
import { mapColumns, normalizeColumnName, readOutpatient, readVisit } from './columnMap'
import { findHeaderRow, readPeriod } from './header'

// 비트 '환자별 소모 통계' 표 → EMR 공통 모양 ConsumptionRow[]. 허용 칸 8개 말고는 칸 값을 읽지 않는다.
// 차트번호는 ids로 번호만 받고 바로 버린다(결과·오류에 넣지 않는다)

// 숫자6-숫자7, 앞 6자리의 가운데·끝 두 자리가 월(01~12)·일(01~31) 모양. 앞뒤에 숫자가 더 붙으면 아니다
const NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-\d{7}(?!\d)/
// 붙여 쓴 13자리: 앞 6자리가 월·일 모양이고 7번째(성별) 자리가 1~8. 앞뒤에 숫자가 더 붙으면 아니다.
// 처방코드 칸에는 쓰지 않는다 — 13자리 의약품 표준코드(880…)가 88년생 주민번호와 같은 모양이다
const JOINED_NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6}(?!\d)/
// 엑셀 숫자 칸은 앞 0이 사라진다(2000~2009년생 → 10~12자리 숫자). 13자리로 채운 값은 앞 두 자리가 00~09라
// 2000년대생 성별 자리(3·4·7·8)만 본다
const LOST_ZERO_NATIONAL_ID = /^0\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[3478]\d{6}$/
const SUMMARY_LABEL = /합계|소계|총계/

const UNREADABLE = { ok: false, code: 'E-PARSE-UNREADABLE' } as const
const EMPTY = { ok: false, code: 'E-PARSE-EMPTY' } as const
const NATIONAL_ID_FOUND = { ok: false, code: 'E-PARSE-RRN' } as const

export function looksLikeNationalId(value: string): boolean {
  return NATIONAL_ID.test(value)
}

export function looksLikeJoinedNationalId(value: string): boolean {
  return JOINED_NATIONAL_ID.test(value)
}

// 칸 하나 → 앞뒤 공백을 뺀 글자(빈 칸·줄 끝에서 떼어 낸 칸은 '')
function textOf(cell: Cell | undefined): string {
  if (typeof cell === 'string') return cell.trim()
  return typeof cell === 'number' ? String(cell) : ''
}

// 앞 0이 사라진 2000년대생 주민번호 모양의 엑셀 숫자 칸
function looksLikeLostZeroNationalId(cell: Cell | undefined): boolean {
  if (typeof cell !== 'number' || !Number.isSafeInteger(cell) || cell < 0) return false
  const digits = String(cell)
  return digits.length < 13 && LOST_ZERO_NATIONAL_ID.test(digits.padStart(13, '0'))
}

// 앞쪽 칸(허용 칸 중 처음으로 값이 있는 칸)에 '합계'·'소계'·'총계'(합 계처럼 띄어 써도)
function hasSummaryLabel(cells: readonly string[]): boolean {
  const first = cells.find((value) => value !== '')
  return first !== undefined && SUMMARY_LABEL.test(first.replace(/\s/g, ''))
}

// 처방코드 칸의 과목 구분 표시('◀ 과 목 ▶'). 띄어쓰기와 ◀ ▶ 말고는 글자가 정확히 같아야 한다
function isSectionDividerCode(code: string): boolean {
  return code.replace(/[\s◀▶]/g, '') === '과목'
}

export function parseBitFile(bytes: Uint8Array, ids: PatientIds): ParseResult {
  const grid = readGrid(bytes)
  return grid.ok ? parseBitGrid(grid.value, ids) : grid
}

export function parseBitGrid(grid: Grid, ids: PatientIds): ParseResult {
  const headerRow = findHeaderRow(grid)
  if (headerRow === -1) return UNREADABLE // 환자별 소모 통계가 아닌 파일
  const mapping = mapColumns(grid[headerRow])
  if (!mapping.ok) return { ok: false, code: 'E-PARSE-COLUMN', missingColumns: mapping.missingColumns }
  const c = mapping.columns
  // 허용 칸 자리만, 파일 칸 순서대로
  const allowed = Object.values(c)
    .filter((at): at is number => at !== null)
    .sort((a, b) => a - b)
  const headerCode = normalizeColumnName(textOf(grid[headerRow][c.rxCode]))
  // 같은 주소가 줄마다 되풀이된다. 이 표를 읽는 동안만 쓴다
  const regions = new Map<string, string | null>()
  const regionOf = (address: string) => {
    let region = regions.get(address)
    if (region === undefined) {
      region = toRegion(address)
      regions.set(address, region)
    }
    return region
  }

  const rows: ConsumptionRow[] = []
  let skippedSummaryRows = 0
  let invalidRows = 0
  let unknownVisitRows = 0
  let inpatientRows = 0
  let from = ''
  let to = ''

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r]
    const cells = allowed.map((at) => textOf(row[at]))
    // 빈 줄(허용 칸이 모두 빔). 읽지 않는 칸은 보지 않는다
    if (cells.every((value) => value === '')) continue
    // 붙임표 모양은 모든 허용 칸. 붙여 쓴 모양은 처방코드 칸 밖에서만 본다(13자리 의약품 표준코드).
    // 앞 0이 사라진 숫자 칸은 차트번호 칸에서 보지 않는다 — 번호로만 바뀌어 밖으로 나가지 않고, 10~12자리 숫자 차트번호를 잘못 거를 수 있다
    const nationalIdAt = (at: number, i: number) =>
      looksLikeNationalId(cells[i]) ||
      (at !== c.rxCode && (looksLikeJoinedNationalId(cells[i]) || (at !== c.chart && looksLikeLostZeroNationalId(row[at]))))
    if (allowed.some(nationalIdAt)) return NATIONAL_ID_FOUND

    const code = textOf(row[c.rxCode])
    const dateText = textOf(row[c.date])
    // 합계·소계·총계 줄: 처방코드(또는 그 칸이 합계 글자)·처방일자가 비고 앞쪽 칸에 합계 글자
    if (dateText === '' && (code === '' || SUMMARY_LABEL.test(code)) && hasSummaryLabel(cells)) {
      skippedSummaryRows++
      continue
    }
    if (code !== '' && normalizeColumnName(code) === headerCode) {
      skippedSummaryRows++ // 반복 머리줄
      continue
    }
    const chart = textOf(row[c.chart])
    // 과목 구분 줄: 환자 기록이 아니다. 처방일자나 차트번호가 있으면 구분 줄로 보지 않는다
    if (dateText === '' && chart === '' && isSectionDividerCode(code)) {
      skippedSummaryRows++
      continue
    }

    const date = parseDateCell(row[c.date])
    // 집계 필수값 오류: 그 줄만 뺀다. 못 읽은 날짜를 앞뒤 줄로 추측하지 않는다
    if (date === null || chart === '' || code === '') {
      invalidRows++
      continue
    }

    const firstVisit = readVisit(textOf(row[c.visit]))
    const outpatient = c.inOut === null ? true : readOutpatient(textOf(row[c.inOut]))
    if (firstVisit === null) unknownVisitRows++
    if (outpatient === false) inpatientRows++
    if (from === '' || compareYmd(date, from) < 0) from = date
    if (to === '' || compareYmd(date, to) > 0) to = date
    rows.push({
      rxCode: code,
      rxName: textOf(row[c.rxName]),
      rxType: c.rxType === null ? '' : textOf(row[c.rxType]),
      date,
      firstVisit,
      outpatient,
      patient: ids.idOf(chart),
      region: regionOf(textOf(row[c.address])),
    })
  }

  if (rows.length === 0 || inpatientRows === rows.length) return EMPTY // 외래 줄이 0개
  return {
    ok: true,
    value: {
      rows,
      period: readPeriod(grid, headerRow),
      dataRange: { from, to },
      rowCount: rows.length,
      skippedSummaryRows,
      invalidRows,
      unknownVisitRows,
      inpatientRows,
    },
  }
}
