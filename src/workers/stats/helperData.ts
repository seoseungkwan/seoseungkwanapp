import { addDays, addMonths, isYmd, monthOf } from '@/lib/analytics/dates'
import type { PatientDay } from '@/types/analysis'
import type { ClinicReportNumbers } from '@/types/clinicReport'
import type { ConsumptionRow, PatientIds } from '@/types/consumption'
import { StatsDataError } from './assemble'

// 도우미 stats.rows 답(JSON 글자) → 검사 → 계산이 아는 모양 [환자 자료 구역]. 정해 둔 열쇠·모양이 아니면 번호만 던진다.
// 차트번호는 이 파일을 지나면 메모리 번호(PatientIds)로만 남는다. 이 모양들은 Worker 안에서만 쓴다(화면에 보내는 모양은 types/stats.ts)

export const MAX_STATS_ROWS = 700_000
const MAX_CODE = 40
const MAX_AMOUNT = 10 ** 14 // 절댓값 한도. 음수도 받는다(원본 medicore/reports.py _amount)

const REPORT_COUNTS = ['totalVisits', 'newPatients', 'returnPatients'] as const
const REPORT_AMOUNTS = [
  'totalAmount',
  'insurerAmount',
  'noncoveredAmount',
  'cashAmount',
  'cardAmount',
  'transferAmount',
] as const
const TREATMENTS = ['manual', 'eswt', 'carm', 'sono', 'cryo'] as const
const SUMMARY_KEYS = ['visits', 'patients', 'newPatients', 'noChart', 'duplicate', 'noFirst'] as const
const TOP_KEYS = ['v', 'from', 'to', 'summary', 'days', 'patientDays', 'codes', 'rows', 'report']

export type StatsSummary = Record<(typeof SUMMARY_KEYS)[number], number>
export type StatsRowsData = {
  v: 2
  from: string // YYYY-MM-DD, 요청과 같다
  to: string
  summary: StatsSummary
  days: [day: string, visits: number, patients: number, newPatients: number][] // 날짜는 YYYYMMDD
  patientDays: [chart: string, day: string, receptions: number, first: string | null][] // 환자·날마다 한 줄, 날짜는 YYYYMMDD
  codes: [code: string, name: string][]
  rows: [chart: string, day: string, code: string, first: string | null][] // 날짜는 YYYYMMDD
  report: { daily: ClinicReportNumbers[]; monthly: ClinicReportNumbers[] }
}

// 진료 줄 한 칸(처방별 신환·재진 계산용, Worker 메모리에만). f = 첫 내원일, 없으면 ''(어떤 날과도 같지 않고 어떤 기간 첫날보다 앞이라 신환이 아니다)
export type VisitRow = { p: number; d: string; c: string; f: string }

function bad(): never {
  throw new StatsDataError('E-BRIDGE-BAD-REPLY')
}

// 모양은 맞는데 진료 줄과 접수 줄이 어긋남: 불러오는 사이에 접수가 바뀌었다
function changed(): never {
  throw new StatsDataError('E-STATS-CHANGED')
}

type Fields = Record<string, unknown>
export const isRecord = (x: unknown): x is Fields => typeof x === 'object' && x !== null && !Array.isArray(x)
const isCount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0
const isAmount = (x: unknown): x is number => Number.isSafeInteger(x) && Math.abs(x as number) <= MAX_AMOUNT
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
    hasExactly(x, ['ok', 'period', ...REPORT_COUNTS, ...REPORT_AMOUNTS, 'treatments', 'laCodes', 'financeUnconfirmed', 'notes'], ['financeUnconfirmedReason']) &&
    REPORT_COUNTS.every((key) => isCount(x[key])) &&
    REPORT_AMOUNTS.every((key) => isAmount(x[key])) &&
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

type DayRules = { from: string; to: string; isDay: (x: unknown) => x is string } // from·to는 YYYYMMDD
type Firsts = Map<string, string | null> // 환자 → 첫 내원일. 검사 안에서만 차트번호를 든다
type Receipts = { firsts: Firsts; visits: Set<string> } // visits = 접수 줄의 환자·날

// 두 배열에 같은 세 칸. 돌려주는 값은 PatientIds와 같은 열쇠(앞뒤 공백을 뺀 차트번호)다
function personOf(chart: unknown, day: unknown, first: unknown, { from, to, isDay }: DayRules): string {
  if (typeof chart !== 'string' || !isDay(day)) bad()
  if (day < from || day > to) bad()
  if (first !== null && (!isDay(first) || first > day)) bad()
  const person = chart.trim()
  if (person === '') bad()
  return person
}

// 한 배열 안에서 한 환자의 첫 내원일은 하나
function noteFirst(firsts: Firsts, person: string, first: string | null): void {
  const seen = firsts.get(person)
  if (seen === undefined) firsts.set(person, first)
  else if (seen !== first) bad()
}

// 날짜는 8자라 차트번호에 어떤 글자가 들어도 두 환자·날이 같은 열쇠가 되지 않는다
const visitKey = (person: string, day: string) => `${person}|${day}`

function checkRows(rows: unknown, rules: DayRules): Firsts {
  if (!Array.isArray(rows) || rows.length > MAX_STATS_ROWS) bad()
  const firsts: Firsts = new Map()
  for (const row of rows as unknown[]) {
    if (!Array.isArray(row) || row.length !== 4) bad()
    const [chart, day, code, first] = row as unknown[]
    if (!isCode(code)) bad()
    noteFirst(firsts, personOf(chart, day, first, rules), first as string | null)
  }
  return firsts
}

function checkPatientDays(lines: unknown, rules: DayRules): Receipts {
  if (!Array.isArray(lines) || lines.length > MAX_STATS_ROWS) bad()
  const firsts: Firsts = new Map()
  const visits = new Set<string>()
  for (const line of lines as unknown[]) {
    if (!Array.isArray(line) || line.length !== 4) bad()
    const [chart, day, receptions, first] = line as unknown[]
    if (!isCount(receptions) || receptions < 1) bad()
    const person = personOf(chart, day, first, rules)
    const visit = visitKey(person, day as string)
    if (visits.has(visit)) bad()
    visits.add(visit)
    noteFirst(firsts, person, first as string | null)
  }
  return { firsts, visits }
}

// 처방 없는 접수가 있으니 반대쪽(patientDays에만 있는 환자·날)은 어긋남이 아니다. days와는 대조하지 않는다(design.md)
function checkAgreement(rows: StatsRowsData['rows'], rowFirsts: Firsts, receipts: Receipts): void {
  for (const [chart, day] of rows) {
    if (!receipts.visits.has(visitKey(chart.trim(), day))) changed()
  }
  for (const [person, first] of rowFirsts) {
    if (receipts.firsts.get(person) !== first) changed()
  }
}

// 첫 내원을 못 찾은 환자는 기간 합계 noFirst에 든다. 줄 없는 환자도 세므로 합계가 더 클 수는 있다.
// 대조를 지났으면 rows의 환자는 모두 patientDays에도 있으니 patientDays의 환자가 곧 두 배열의 환자다
function checkNoFirst(firsts: Firsts, noFirst: number): void {
  let withoutFirst = 0
  for (const first of firsts.values()) {
    if (first === null) withoutFirst++
  }
  if (withoutFirst > noFirst) bad()
}

export function parseStatsRows(text: string, req: { from: string; to: string }): StatsRowsData {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    bad() // 파서 예외 글에는 자료 조각이 들어 있다
  }
  if (!isRecord(value) || !hasExactly(value, TOP_KEYS) || value.v !== 2) bad()
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

  const rules = { from, to, isDay }
  const rowFirsts = checkRows(value.rows, rules)
  const receipts = checkPatientDays(value.patientDays, rules)
  checkReport(value.report, req.to)

  // 모양을 다 본 뒤에 대조한다: 모양이 틀린 답이 '접수가 바뀌었어요'로 보이지 않게
  const data = value as unknown as StatsRowsData
  checkAgreement(data.rows, rowFirsts, receipts)
  checkNoFirst(receipts.firsts, data.summary.noFirst)
  return data
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

// 접수 줄 → aggregate의 셋째 인자. ids는 진료 줄과 같은 것을 넘긴다(같은 환자 = 같은 번호)
export function toPatientDays(data: StatsRowsData, ids: PatientIds): PatientDay[] {
  const dateOf = dashedMemo()
  return data.patientDays.map(([chart, day, receptions, first]) => ({
    patient: ids.idOf(chart),
    date: dateOf(day),
    receptions,
    firstVisit: first === day,
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
