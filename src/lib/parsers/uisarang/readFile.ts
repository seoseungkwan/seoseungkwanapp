import { readGrid } from '@/lib/parsers/common'
import type { ErrorCode } from '@/types/errors'
import type { UisFileResult, UisKind, UisRead, UisRefuseCode, UisSpan } from '@/types/uisarang'
import type { Body, Sheet } from './cells'
import { readIncome } from './income'
import { columnIndex, findHeader, READ_COLUMNS, type ReadKind } from './kind'
import { checkSpan, filtersOk, readLabels, spanOf, type Shown } from './labels'
import { readRx } from './rx'
import { readVisitPatients } from './visitPatients'
import { readVisits } from './visits'

// 의사랑 엑셀 파일 하나 → 결과 하나(specs/uisarang-upload design.md §3·§4) [환자 자료 구역].
// 차례: 종류 → 열 → 조회일(DATE → PERIOD/ONE-DAY → FUTURE) → 조건(FILTER) → 줄. 오류는 번호만 — 칸 글자·예외 글을 싣지 않는다

// readGrid 실패 번호 → 의사랑 번호(이 셋 말고 E-PARSE- 번호는 나오지 않는다)
const PARSE_CODE: Partial<Record<ErrorCode, UisRefuseCode>> = {
  'E-PARSE-TOO-BIG': 'E-UIS-TOO-BIG',
  'E-PARSE-UNREADABLE': 'E-UIS-UNREADABLE',
  'E-PARSE-EMPTY': 'E-UIS-KIND', // 읽은 줄이 없으면 머리 줄도 없다
}

const READERS: Readonly<Record<ReadKind, (sheet: Sheet, span: UisSpan) => Body<UisRead>>> = {
  income: readIncome,
  rx: readRx,
  visits: readVisits,
  visitPatients: readVisitPatients,
}

const refused = (code: UisRefuseCode, kind: UisKind | null, span: Shown | null): UisFileResult => ({ status: 'refused', code, kind, span })

export function readUisFile(bytes: Uint8Array, today: string): UisFileResult {
  const grid = readGrid(bytes)
  if (!grid.ok) return refused(PARSE_CODE[grid.code] ?? 'E-UIS-UNREADABLE', null, null)
  const hit = findHeader(grid.value)
  if (hit === null) return refused('E-UIS-KIND', null, null)
  const { kind } = hit
  // 예약환자통계는 웹앱이 쓰지 않는다 — 조회일·줄을 읽지 않는다
  if (kind === 'rsv' || kind === 'rsvPatients') return { status: 'skipped', why: 'rsv', kind, span: null }

  const labels = readLabels(grid.value, hit.at)
  const columns = columnIndex(hit.header, READ_COLUMNS[kind])
  if (!columns.ok) return { status: 'refused', code: 'E-UIS-COLUMN', kind, span: spanOf(labels), columns: columns.columns }
  const checked = checkSpan(kind, labels, today)
  if (!checked.ok) return refused(checked.code, kind, checked.span)
  const { span } = checked
  const shown = { from: span.from, to: span.to }
  if (!filtersOk(labels)) return refused('E-UIS-FILTER', kind, shown)

  const body = READERS[kind]({ grid: grid.value, at: hit.at, header: hit.header, col: columns.index }, span)
  if (body.ok) return { status: 'read', read: body.value }
  return body.row === undefined ? refused(body.code, kind, shown) : { status: 'refused', code: body.code, kind, span: shown, row: body.row }
}
