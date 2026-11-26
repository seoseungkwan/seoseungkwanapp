import { addDays, isYmd, monthOf, monthRange, weekdayOf } from '@/lib/analytics/dates'
import { jsonbBytes } from '@/lib/payload/jsonbText'
import { validateDayPayload, validateRxPick } from '@/lib/payload/validate'
import type { DayPayload } from '@/types/payload'
import { REVENUE_DAY_KEYS, type RevenueDayRow } from '@/types/revenue'
import type { UisAgePayload, UisFileResult, UisKind, UisPlan, UisRxPayload, UisRxRow, UisSpan, UisUnit, UisVisitDay } from '@/types/uisarang'

// 의사랑 저장 모양(specs/uisarang-upload design.md §6). 순수 함수 — 환자 자료 구역(lib/payload) 규칙 안이다.
// 서버로 가는 처방·나이대 값의 기준이다: 하나라도 어긋나면 null(고쳐 쓰지 않는다). 맞으면 정해 둔 열쇠만 새 객체로 돌려준다

export type { UisPlan }

/** uis_periods 제약 octet_length(payload::text) <= 262144와 같다 */
export const UIS_PAYLOAD_MAX_BYTES = 262_144
/** 기간별처방통계 코드 수 한도 */
export const UIS_RX_MAX_ROWS = 3_000
const QTY_MAX = 1_000_000_000
const AMOUNT_MAX = 1_000_000_000_000
const AGE_ROWS = 10 // AGE_BANDS 아홉 + 생년월일 없음

const RX_KEYS = ['v', 'rows', 'total']
const RX_ROW_KEYS = ['code', 'name', 'qty', 'amount']
const AGE_KEYS = ['v', 'patients', 'newPatients', 'bands', 'newBands']

type Fields = Record<string, unknown>

function exactly(value: unknown, keys: readonly string[]): Fields | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const own = Object.keys(value)
  return own.length === keys.length && keys.every((key) => own.includes(key)) ? (value as Fields) : null
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const isAmount = (value: unknown): value is number => Number.isSafeInteger(value) && Math.abs(value as number) <= AMOUNT_MAX
const isQty = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= QTY_MAX && Math.round(value * 1000) / 1000 === value

/**
 * 처방 코드·처방명칭 글자: 1~100자 · 제어 글자 없음 · 전화·주민번호·메일 모양 없음(validate.ts isCode와 같은 규칙 — 처방 고르기 검사를 그대로 쓴다).
 * 엑셀 읽기(lib/parsers/uisarang)도 이 함수로 본다 — 저장 모양 검사와 어긋나지 않게
 */
export const isUisRxText = (value: unknown): value is string => typeof value === 'string' && validateRxPick({ code: value, name: '' }) !== null

/** 처방 줄 차례(코드 글자 차례 · JS 글자 비교). 저장 모양의 rows는 이 차례로 겹치지 않는다 */
export const compareUisCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** 조회일 모양: 하루 · 한 주(월요일 ~ +6일) · 한 달(1일 ~ 말일). 그 밖·날짜 아님은 null */
export function uisUnitOf(from: string, to: string): UisUnit | null {
  if (!isYmd(from) || !isYmd(to)) return null
  if (from === to) return 'day'
  if (weekdayOf(from) === 1 && to === addDays(from, 6)) return 'week'
  if (from.endsWith('-01') && to === monthRange(monthOf(from)).to) return 'month'
  return null
}

function rxRowOf(value: unknown): UisRxRow | null {
  const o = exactly(value, RX_ROW_KEYS)
  if (o === null) return null
  const { code, name, qty, amount } = o
  return isUisRxText(code) && isUisRxText(name) && isQty(qty) && isAmount(amount) ? { code, name, qty, amount } : null
}

export function validateUisRxPayload(value: unknown): UisRxPayload | null {
  const o = exactly(value, RX_KEYS)
  if (o === null || o.v !== 1 || !Array.isArray(o.rows) || o.rows.length > UIS_RX_MAX_ROWS) return null
  if (o.total !== null && !isAmount(o.total)) return null
  const rows: UisRxRow[] = []
  for (const item of o.rows as unknown[]) {
    const row = rxRowOf(item)
    const before = rows.at(-1)
    if (row === null || (before !== undefined && compareUisCode(before.code, row.code) >= 0)) return null
    rows.push(row)
  }
  const payload: UisRxPayload = { v: 1, rows, total: o.total }
  return jsonbBytes(payload) <= UIS_PAYLOAD_MAX_BYTES ? payload : null
}

function countsOf(value: unknown): number[] | null {
  return Array.isArray(value) && value.length === AGE_ROWS && value.every(isCount) ? [...(value as number[])] : null
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

export function validateUisAgePayload(value: unknown): UisAgePayload | null {
  const o = exactly(value, AGE_KEYS)
  if (o === null || o.v !== 1 || !isCount(o.patients) || !isCount(o.newPatients)) return null
  const bands = countsOf(o.bands)
  const newBands = countsOf(o.newBands)
  if (bands === null || newBands === null) return null
  if (sum(bands) !== o.patients || sum(newBands) !== o.newPatients || newBands.some((n, i) => n > bands[i])) return null
  const payload: UisAgePayload = { v: 1, patients: o.patients, newPatients: o.newPatients, bands, newBands }
  return jsonbBytes(payload) <= UIS_PAYLOAD_MAX_BYTES ? payload : null
}

/**
 * 위쪽 표 날 한 줄 → 지금 날 저장 모양(validateDayPayload를 그대로 지남). 처방·묶음 없음 · 재방문 셀 수 없음.
 * 오늘 파일도 partial 거짓 — 원장이 마감 뒤 올린 것을 그날 숫자로 본다(뒤에 다시 올리면 바꿔 저장)
 */
export function toUisDayPayload(d: UisVisitDay): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: d.day,
    partial: false,
    totals: { patients: d.patients, newPatients: d.newPatients, returning: d.patients - d.newPatients, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}

// 매출 줄은 정해 둔 열다섯 칸만 새 객체로(의사랑에는 참고 금액이 없어 열쇠도 없다)
const revenueRowOf = (row: RevenueDayRow): RevenueDayRow => Object.fromEntries(REVENUE_DAY_KEYS.map((key) => [key, row[key]])) as RevenueDayRow

const spanKey = (kind: UisKind, span: Pick<UisSpan, 'from' | 'to'>) => `${kind}|${span.from}|${span.to}`

type Entry =
  | { at: number; files: number[]; part: 'stats'; value: UisPlan['stats'][number] }
  | { at: number; files: number[]; part: 'revenue'; value: UisPlan['revenue'][number] }
  | { at: number; files: number[]; part: 'periods'; value: UisPlan['periods'][number] }

// 받은 결과 하나 → 계획 줄. 검사를 못 지나면 null
function entryOf(at: number, read: Extract<UisFileResult, { status: 'read' }>['read']): Entry | null {
  const files = [at]
  const { from, to } = read.span
  switch (read.kind) {
    case 'income':
      return { at, files, part: 'revenue', value: { files, row: revenueRowOf(read.row) } }
    case 'visits': {
      // 검사는 문만 본다(저장할 때 saveStats가 다시 검사한다)
      const days = read.days.map(toUisDayPayload)
      if (days.some((payload) => validateDayPayload(payload) === null)) return null
      return { at, files, part: 'stats', value: { files, covered: { from, to }, days } }
    }
    case 'rx': {
      const payload = validateUisRxPayload(read.payload)
      return payload === null ? null : { at, files, part: 'periods', value: { files, kind: 'rx', from, to, payload } }
    }
    case 'visitPatients': {
      const payload = validateUisAgePayload(read.payload)
      return payload === null ? null : { at, files, part: 'periods', value: { files, kind: 'age', from, to, payload } }
    }
  }
}

/**
 * 파일마다의 결과 → 저장 계획(design.md §6). 줄마다 그 줄을 낸 파일 차례 번호가 붙고, 같은 엑셀로 건너뛴 파일 번호도 같은 줄에 붙는다.
 * 검사를 못 지난 모양은 계획에 넣지 않고 그 파일 번호(건너뛴 같은 엑셀 포함)를 refused에 둔다. 건너뜀(예약)·받지 않음은 계획에 없다
 */
export function planUisSave(results: UisFileResult[]): UisPlan {
  const byKey = new Map<string, Entry | 'refused'>()
  const entries: Entry[] = []
  const refused = new Set<number>()
  results.forEach((result, at) => {
    if (result.status !== 'read') return
    const entry = entryOf(at, result.read)
    const key = spanKey(result.read.kind, result.read.span)
    if (entry === null) {
      refused.add(at)
      if (!byKey.has(key)) byKey.set(key, 'refused')
      return
    }
    entries.push(entry)
    if (!byKey.has(key)) byKey.set(key, entry)
  })
  results.forEach((result, at) => {
    if (result.status !== 'skipped' || result.why !== 'same' || result.span === null) return
    const owner = byKey.get(spanKey(result.kind, result.span))
    if (owner === 'refused') refused.add(at)
    else owner?.files.push(at)
  })
  const plan: UisPlan = { stats: [], revenue: [], periods: [], refused: [...refused].sort((a, b) => a - b) }
  for (const entry of entries) {
    if (entry.part === 'stats') plan.stats.push(entry.value)
    else if (entry.part === 'revenue') plan.revenue.push(entry.value)
    else plan.periods.push(entry.value)
  }
  return plan
}
