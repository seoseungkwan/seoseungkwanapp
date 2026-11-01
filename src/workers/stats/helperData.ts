import { addDays, addMonths, isYmd, monthOf } from '@/lib/analytics/dates'
import type { ClinicReportNumbers } from '@/types/clinicReport'
import type { ConsumptionRow, PatientIds } from '@/types/consumption'
import { StatsDataError } from './assemble'

// 도우미 stats.rows 답(JSON 글자) → 검사 → 계산이 아는 모양 [환자 자료 구역]. 정해 둔 열쇠·모양이 아니면 번호만 던진다.
// 차트번호는 이 파일을 지나면 메모리 번호(PatientIds)로만 남는다. 이 모양들은 Worker 안에서만 쓴다(화면에 보내는 모양은 types/stats.ts)

export const MAX_STATS_ROWS = 700_000
const MAX_CODE = 40

const REPORT_NUMBERS = [
  'totalVisits',
  'newPatients',
  'returnPatients',
  'totalAmount',
  'insurerAmount',
  'noncoveredAmount',
  'cashAmount',
  'cardAmount',
  'transferAmount',
] as const
const TREATMENTS = ['manual', 'eswt', 'carm', 'sono', 'cryo'] as const
const SUMMARY_KEYS = ['visits', 'patients', 'newPatients', 'noChart', 'duplicate', 'noFirst'] as const
const TOP_KEYS = ['v', 'from', 'to', 'summary', 'days', 'codes', 'rows', 'report']

export type StatsSummary = Record<(typeof SUMMARY_KEYS)[number], number>
export type StatsRowsData = {
  v: 1
  from: string // YYYY-MM-DD, 요청과 같다
  to: string
  summary: StatsSummary
  days: [day: string, visits: number, patients: number, newPatients: number][] // 날짜는 YYYYMMDD
  codes: [code: string, name: string][]
  rows: [chart: string, day: string, code: string, first: string | null][] // 날짜는 YYYYMMDD
  report: { daily: ClinicReportNumbers[]; monthly: ClinicReportNumbers[] }
}

// 진료 줄 한 칸(처방별 신환·재진 계산용, Worker 메모리에만). f = 첫 내원일, 없으면 ''(어떤 날과도 같지 않고 어떤 기간 첫날보다 앞이라 신환이 아니다)
export type VisitRow = { p: number; d: string; c: string; f: string }

function bad(): never {
  throw new StatsDataError('E-BRIDGE-BAD-REPLY')
}

type Fields = Record<string, unknown>
export const isRecord = (x: unknown): x is Fields => typeof x === 'object' && x !== null && !Array.isArray(x)
const isCount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0
const isCode = (x: unknown): x is string => typeof x === 'string' && x.length >= 1 && x.length <= MAX_CODE

function hasExactly(o: Fields, keys: readonly string[], optional: readonly string[] = []): boolean {
  return keys.every((key) => Object.hasOwn(o, key)) && Object.keys(o).every((key) => keys.includes(key) || optional.includes(key))
}

const COMPACT_DAY = /^\d{8}$/
// YYYYMMDD → YYYY-MM-DD
export const dashed = (day: string) => `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`

// 700,000줄에서 같은 날짜를 또 따지지 않게 맞은 날을 기억한다
function dayChecker() {
  const known = new Set<string>()
  return (x: unknown): x is string => {
    if (typeof x !== 'string') return false
    if (known.has(x)) return true
    if (!COMPACT_DAY.test(x) || !isYmd(dashed(x))) return false
    known.add(x)
    return true
  }
}

// 같은 날짜 글자를 줄마다 새로 만들지 않는다
function dashedMemo() {
  const seen = new Map<string, string>()
  return (day: string) => {
    let text = seen.get(day)
    if (text === undefined) {
      text = dashed(day)
      seen.set(day, text)
    }
    return text
  }
}

function isReportSet(x: unknown, period: string): boolean {
  if (!isRecord(x) || x.period !== period) return false
  if (x.ok === false) return hasExactly(x, ['ok', 'period', 'reason']) && typeof x.reason === 'string'
  if (x.ok !== true) return false
  const { treatments, laCodes, notes, financeUnconfirmed, financeUnconfirmedReason } = x
  return (
    hasExactly(x, ['ok', 'period', ...REPORT_NUMBERS, 'treatments', 'laCodes', 'financeUnconfirmed', 'notes'], ['financeUnconfirmedReason']) &&
    REPORT_NUMBERS.every((key) => isCount(x[key])) &&
    isRecord(treatments) &&
    hasExactly(treatments, TREATMENTS) &&
    TREATMENTS.every((key) => isCount(treatments[key])) &&
    Array.isArray(laCodes) &&
    laCodes.every((la: unknown) => isRecord(la) && hasExactly(la, ['code', 'count']) && isCode(la.code) && isCount(la.count)) &&
    typeof financeUnconfirmed === 'boolean' &&
    (financeUnconfirmedReason === undefined || typeof financeUnconfirmedReason === 'string') &&
    Array.isArray(notes) &&
    notes.every((note: unknown) => typeof note === 'string')
  )
}

// 일일 to·to−1, 월말 to가 든 달·그 앞 달 (AC-504.1)
function checkReport(report: unknown, to: string): void {
  if (!isRecord(report) || !hasExactly(report, ['daily', 'monthly'])) bad()
  const thisMonth = monthOf(to)
  const periods = { daily: [to, addDays(to, -1)], monthly: [thisMonth, addMonths(thisMonth, -1)] }
  for (const kind of ['daily', 'monthly'] as const) {
    const sets = report[kind]
    if (!Array.isArray(sets) || sets.length !== 2 || !sets.every((set, i) => isReportSet(set, periods[kind][i]))) bad()
  }
}

function checkRows(rows: unknown, from: string, to: string, noFirst: number, isDay: (x: unknown) => x is string): void {
  if (!Array.isArray(rows) || rows.length > MAX_STATS_ROWS) bad()
  const firstOf = new Map<string, string | null>() // 한 환자의 첫 내원일은 하나. 이 함수 안에서만 차트번호를 든다
  let withoutFirst = 0
  for (const row of rows as unknown[]) {
    if (!Array.isArray(row) || row.length !== 4) bad()
    const [chart, day, code, first] = row as unknown[]
    if (typeof chart !== 'string' || !isDay(day) || !isCode(code)) bad()
    if (day < from || day > to) bad()
    if (first !== null && (!isDay(first) || first > day)) bad()
    const person = chart.trim() // PatientIds와 같은 열쇠
    if (person === '') bad()
    const seen = firstOf.get(person)
    if (seen === undefined) {
      firstOf.set(person, first)
      if (first === null) withoutFirst++
    } else if (seen !== first) {
      bad()
    }
  }
  // 첫 내원을 못 찾은 환자는 기간 합계 noFirst에 든다. 줄 없는 환자도 세므로 합계가 더 클 수는 있다
  if (withoutFirst > noFirst) bad()
}

export function parseStatsRows(text: string, req: { from: string; to: string }): StatsRowsData {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    bad() // 파서 예외 글에는 자료 조각이 들어 있다
  }
  if (!isRecord(value) || !hasExactly(value, TOP_KEYS) || value.v !== 1) bad()
  if (value.from !== req.from || value.to !== req.to) bad()

  const { summary, days, codes } = value
  if (!isRecord(summary) || !hasExactly(summary, SUMMARY_KEYS) || !SUMMARY_KEYS.every((key) => isCount(summary[key]))) bad()

  const isDay = dayChecker()
  const from = req.from.replaceAll('-', '')
  const to = req.to.replaceAll('-', '')
  const isDayRow = (x: unknown) =>
    Array.isArray(x) && x.length === 4 && isDay(x[0]) && x[0] >= from && x[0] <= to && isCount(x[1]) && isCount(x[2]) && isCount(x[3])
  if (!Array.isArray(days) || !days.every(isDayRow)) bad()
  const isCodeRow = (x: unknown) => Array.isArray(x) && x.length === 2 && isCode(x[0]) && typeof x[1] === 'string'
  if (!Array.isArray(codes) || !codes.every(isCodeRow)) bad()

  checkRows(value.rows, from, to, summary.noFirst as number, isDay)
  checkReport(value.report, req.to)
  return value as unknown as StatsRowsData
}

// 지금 파서가 내는 모양 그대로: 첫 내원일 = 진료일이면 신환, 외래만 읽었고, 동네·유형은 도우미가 읽지 않는다
export function toConsumptionRows(data: StatsRowsData, ids: PatientIds): ConsumptionRow[] {
  const names = new Map(data.codes)
  const dateOf = dashedMemo()
  return data.rows.map(([chart, day, code, first]) => ({
    rxCode: code,
    rxName: names.get(code) || code, // 이름이 없거나 빈 글자면 코드
    rxType: '',
    date: dateOf(day),
    firstVisit: first === day,
    outpatient: true,
    patient: ids.idOf(chart),
    region: null,
  }))
}

export function toVisitRows(data: StatsRowsData, ids: PatientIds): VisitRow[] {
  const dateOf = dashedMemo()
  return data.rows.map(([chart, day, code, first]) => ({
    p: ids.idOf(chart),
    d: dateOf(day),
    c: code,
    f: first === null ? '' : dateOf(first),
  }))
}
