import { addMonthsToDay, compareYmd, diffDays, isYmd } from '@/lib/analytics/dates'
import { dateKey } from './followup'
import { PatientsSourceError } from './sourceError'
import type { ChartVisit, RecallCoverage, RecallHistory, RecallRecord } from '@/types/patients'

export type { RecallHistory, RecallRecord } from '@/types/patients'

// 원본 양지바른(seoseungkwan/shared@2a1069b) 정기 주사 계산(tools/revisit_source_boot.js, assets/revisit_schedule.html의 prepareRx·firstPhone)을 옮겼다.
// 줄은 원본 그대로 두고 바꾼 것은 여섯뿐이다:
//  - 원본의 Date 값은 'YYYY-MM-DD' 글자로, 달 더하기는 lib/analytics/dates.ts로(한국 날짜, 결과는 원본과 같다)
//  - 원본이 전역 값(rules·history·phoneOf)에서 읽던 것은 인자로 받고, '오늘'도 인자로 받는다
//  - 원본에 없는 readThrough(마지막으로 읽은 날)를 더했다
//  - 쓸 수 없는 예정일은 날짜 없음으로 친다(dueAfter)
//  - 원본이 멈추는 곳의 오류는 E-PATIENTS-SOURCE다(환자 값 없이 정해 둔 이유만)
//  - 전화 표는 그 표의 값만 읽는다(phoneIn, 객체 원형의 값을 전화로 읽지 않는다)
// 원본과 같은지는 goldenRecall.test.ts가 원본 결과(fixtures/patients/golden/recall-*.json)와 견준다.

export type RecallRule = { id: string; enabled: boolean; label: string; codes: string[]; round: string; months: number }

export type RecallItem = {
  ruleId: string
  label: string
  months: number
  chart: string
  name: string
  phone: string
  last: string
  due: string
  evidence: string
}

// 연골주사는 3차 뒤 6개월, 비타민D는 맞을 때마다 3개월
export const RECALL_DEFAULTS: readonly RecallRule[] = [
  { id: 'cartilage', enabled: true, label: '연골주사', codes: ['A49'], round: '3차', months: 6 },
  { id: 'vitamin-d', enabled: true, label: '비타민D', codes: ['A32'], round: '', months: 3 },
]
export const KEEP_MONTHS = 36
export const MAX_RECORDS = 50_000

const CHART_RE = /^[0-9A-Za-z-]{1,30}$/
const CODE_RE = /^[0-9A-Z_-]{1,20}$/
const CHART_ORDER = new Intl.Collator(undefined, { numeric: true })

// 원본 chartKey: 엑셀의 .0과 앞자리 0을 뗀 차트번호
const chartKey = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/\.0+$/, '')
    .replace(/^0+(?=\d)/, '')

// 원본 parseDay가 읽는 날: 해가 1000~9999인 있는 날. 0100~0999년은 원본 iso가 앞자리 0을 붙이지 않아 읽지 못한다
const isDay = (value: unknown): value is string => typeof value === 'string' && isYmd(value) && value >= '1000'

// 쌓인 기록의 날짜를 못 읽으면 원본은 TypeError로, 예정일의 해가 네 자리를 넘으면 10000-06-30을 찍는다.
// 지어낸 날짜를 보이지 않고 줄 하나로 명단 전체가 멈추지도 않게 날짜 없음(null)으로 돌려준다(골든 knownDiffs)
function dueAfter(day: string, months: number): string | null {
  if (!isDay(day)) return null
  try {
    return addMonthsToDay(day, months)
  } catch {
    return null
  }
}

// 증상 조건: '3차'는 13차·23차와 구분해 숫자 그대로, 그 밖의 글자는 포함 여부로 본다
export function roundTest(round: string): (text: string) => boolean {
  if (!round) return () => true
  const number = round.match(/^(\d{1,2})\s*차$/)
  if (number) {
    const re = new RegExp(`(?:^|[^0-9])${number[1]}\\s*차`)
    return (text) => re.test(text)
  }
  const needle = round.toLowerCase()
  return (text) => text.toLowerCase().includes(needle)
}

const headerKey = (value: unknown) => String(value ?? '').replace(/\s/g, '')

// 머리줄(20줄 안). followup.ts prepareSchedule·preparePhones와 같은 원본 headerFor
function headerFor(rows: readonly (readonly unknown[])[], required: readonly string[]) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const head = rows[i].map(headerKey)
    if (required.every((key) => head.some((cell) => cell.includes(key)))) {
      if (required.some((key) => head.filter((cell) => cell.includes(key)).length !== 1)) {
        throw new PatientsSourceError('header-duplicate')
      }
      return { index: i, col: (key: string) => head.findIndex((cell) => cell.includes(key)) }
    }
  }
  throw new PatientsSourceError('header-missing')
}

// 차트번호(앞자리 0 뗌)|처방일자 → 처방코드(47 표)
export function prepareRx(rows: unknown[][]): Map<string, Set<string>> {
  const h = headerFor(rows, ['처방코드', '차트번호', '처방일자'])
  const iCode = h.col('처방코드')
  const iChart = h.col('차트번호')
  const iDate = h.col('처방일자')
  const index = new Map<string, Set<string>>()
  for (const row of rows.slice(h.index + 1)) {
    const code = String(row[iCode] ?? '').trim().toUpperCase()
    const chart = chartKey(row[iChart])
    const day = dateKey(row[iDate])
    if (!code || !chart || !day) continue
    const key = `${chart}|${day}`
    const codes = index.get(key)
    if (codes) codes.add(code)
    else index.set(key, new Set([code]))
  }
  return index
}

function validRecord(value: unknown): value is RecallRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<keyof RecallRecord, unknown>
  return (
    typeof r.chart === 'string' &&
    CHART_RE.test(r.chart) &&
    typeof r.name === 'string' &&
    r.name.length > 0 &&
    r.name.length <= 100 &&
    isDay(r.date) &&
    Array.isArray(r.codes) &&
    r.codes.length > 0 &&
    r.codes.length <= 20 &&
    r.codes.every((code) => typeof code === 'string' && CODE_RE.test(code)) &&
    typeof r.text === 'string' &&
    r.text.length <= 1000 &&
    typeof r.phone === 'string' &&
    r.phone.length <= 60
  )
}

// 저장해 둔 기록 읽기. 전체 모양이 틀리면 원본처럼 멈추고, 기록 하나가 이상하면 그 기록만 뺀다.
// readThrough는 원본에 없는 칸이라 이상해도 멈추지 않고 처음 읽는 것(null)으로 친다
export function validateHistory(value: unknown): RecallHistory {
  const v = value as { from?: unknown; readThrough?: unknown; records?: unknown } | null | undefined
  if (!v || typeof v !== 'object' || !Array.isArray(v.records) || v.records.length > MAX_RECORDS || (v.from !== null && !isDay(v.from))) {
    throw new PatientsSourceError('row-unreadable')
  }
  return {
    from: v.from as string | null,
    readThrough: isDay(v.readThrough) ? v.readThrough : null,
    records: v.records.filter(validRecord).map((r) => ({
      chart: r.chart,
      name: r.name,
      date: r.date,
      codes: r.codes.slice(),
      text: r.text,
      phone: r.phone,
    })),
  }
}

// 객체 원형의 값(constructor 같은 차트번호)을 전화로 읽지 않는다. preparePhones의 표(원형 없음)면 원본과 같다
const phoneIn = (phones: Readonly<Record<string, string>>, chart: string) =>
  Object.prototype.hasOwnProperty.call(phones, chart) ? phones[chart] : ''

// 새로 읽은 한 달을 기록에 합친다: 그 기간의 예전 기록은 새것으로 바꾸고(정정 반영), 36개월 지난 기록은 지우고, 50,000건을 넘으면 최근 것만 남긴다.
// codes는 꺼 둔 규칙을 포함한 모든 규칙의 코드다
export function ingestRecall(
  history: RecallHistory,
  piece: { visits: ChartVisit[]; rx: Map<string, Set<string>>; phones: Record<string, string>; from: string; to: string },
  codes: string[],
  today: string,
): RecallHistory {
  const { visits, rx, phones, from, to } = piece
  const wanted = new Set(codes.map((code) => String(code).toUpperCase()))
  const kept = history.records.filter((r) => !(r.date >= from && r.date <= to))
  const fresh: RecallRecord[] = []
  for (const v of visits) {
    const given = rx.get(`${chartKey(v.chart)}|${v.date.replace(/-/g, '')}`)
    const matched = given ? [...given].filter((code) => wanted.has(code)) : []
    if (!matched.length || !CHART_RE.test(v.chart)) continue
    fresh.push({
      chart: v.chart,
      name: v.name.slice(0, 100),
      date: v.date,
      codes: matched.sort(),
      text: v.lines
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' / ')
        .slice(0, 1000),
      phone: (phoneIn(phones, v.chart) || phoneIn(phones, chartKey(v.chart))).slice(0, 60),
    })
  }
  const limit = addMonthsToDay(today, -KEEP_MONTHS)
  const records = kept
    .concat(fresh)
    .filter((r) => r.date >= limit)
    .sort((a, b) => a.date.localeCompare(b.date) || CHART_ORDER.compare(a.chart, b.chart))
  const start = [history.from, from].filter(Boolean).sort()[0] || from
  return {
    from: start < limit ? limit : start,
    readThrough: history.readThrough && history.readThrough > to ? history.readThrough : to,
    records: records.slice(-MAX_RECORDS),
  }
}

// 환자마다 그 주사를 마지막으로 맞은 기록만 본다. 마지막이 조건(3차)에 맞을 때만 간격 뒤를 예정일로 잡고,
// 그 뒤 새로 1·2차를 시작했으면 명단에 넣지 않는다
export function recallCompute(records: RecallRecord[], rules: readonly RecallRule[]): RecallItem[] {
  // 날짜를 못 읽는 기록도 원본처럼 그 자리에 두고 마지막을 고른다(기록이 validateHistory를 거쳤으면 없다)
  const ordered = records.slice().sort((a, b) => a.date.localeCompare(b.date))
  const out: RecallItem[] = []
  for (const rule of rules) {
    if (!rule.enabled) continue
    const codes = new Set(rule.codes)
    const test = roundTest(rule.round)
    const last = new Map<string, RecallRecord>()
    for (const r of ordered) if (r.codes.some((code) => codes.has(code))) last.set(chartKey(r.chart), r)
    for (const r of last.values()) {
      if (!test(r.text)) continue
      const due = dueAfter(r.date, rule.months)
      if (due === null) continue
      const evidence = rule.round ? r.text.split(' / ').find((line) => test(line)) || r.text : r.text
      out.push({ ruleId: rule.id, label: rule.label, months: rule.months, chart: r.chart, name: r.name, phone: r.phone, last: r.date, due, evidence })
    }
  }
  return out.sort((a, b) => compareYmd(a.due, b.due) || a.label.localeCompare(b.label) || CHART_ORDER.compare(a.chart, b.chart))
}

// 화면 기간: 예정일이 시작~끝 사이, '지난 예정 포함'이면 오늘 전 예정일도(아직 다시 맞지 않은 사람)
export function recallSelect(items: RecallItem[], from: string | null, to: string | null, overdue: boolean, today: string): RecallItem[] {
  return items.filter((item) => (!to || item.due <= to) && (!from || item.due >= from || (overdue && item.due < today)))
}

export function recallStatus(item: RecallItem, today: string): string {
  const diff = diffDays(today, item.due)
  return diff < 0 ? `지남 ${-diff}일` : diff === 0 ? '오늘' : `${diff}일 남음`
}

// 쌓인 기록이 간격보다 짧으면 그보다 오래전 주사는 아직 없다(원본 coverageNote의 판정만. 문구는 화면이, trimmed는 Worker가 채운다)
export function recallCoverage(history: RecallHistory, rules: readonly RecallRule[], today: string): Omit<RecallCoverage, 'trimmed'> {
  const start = isDay(history.from) ? history.from : null
  const short = rules.filter((rule) => rule.enabled && (!start || start > addMonthsToDay(today, -rule.months)))
  return {
    records: history.records.length,
    from: history.from,
    short: short.map((rule) => ({ label: rule.label, months: rule.months })),
  }
}

// 지금 읽은 전화가 있으면 그것, 없으면 기록할 때의 전화
const phoneFor = (item: RecallItem, phoneOf: (chart: string) => string) => phoneOf(item.chart) || item.phone || ''

// [명단 복사]: 이름·전화·이름·종류 4칸
export function recallCopyLines(items: RecallItem[], phoneOf: (chart: string) => string): string {
  return items.map((item) => [item.name, phoneFor(item, phoneOf), item.name, item.label].join('\t')).join('\n')
}

// 한 칸에 번호가 여러 개(010-… / 010-…)면 첫 번호만 쓴다
const firstPhone = (phone: string) => phone.split(/[/,;·]|\s{2,}/)[0].trim()

// [번호 복사]: 숫자와 +만, 같은 번호는 한 번, 번호 없는 사람 수
export function recallPhones(items: RecallItem[], phoneOf: (chart: string) => string): { text: string; count: number; missing: number } {
  const numbers: string[] = []
  let missing = 0
  for (const item of items) {
    const number = firstPhone(phoneFor(item, phoneOf)).replace(/[^0-9+]/g, '')
    if (!number) missing++
    else if (!numbers.includes(number)) numbers.push(number)
  }
  return { text: numbers.join('\n'), count: numbers.length, missing }
}
