import { addDays, isYmd } from '@/lib/analytics/dates'
import { BridgeError, isRecord } from '@/lib/bridge/protocol'
import { baseDate, passFilters, pasteRows, phoneColumn, phoneOf, preparePhones, prepareSchedule, scheduleRows, undecidedRows, visitKind } from '@/lib/patients/followup'
import { ingestRecall, prepareRx, recallCompute, recallCopyLines, recallCoverage, recallPhones, recallSelect, recallStatus, validateHistory } from '@/lib/patients/recall'
import type { RecallItem, RecallRule } from '@/lib/patients/recall'
import { PatientsSourceError } from '@/lib/patients/sourceError'
import type {
  ChartVisit,
  ContactCount,
  ContactStoreData,
  FollowupFilters,
  FollowupRow,
  FollowupView,
  PreparedSchedule,
  RecallFilters,
  RecallHistory,
  RecallRow,
  RecallView,
  TargetsKind,
  UndecidedRow,
} from '@/types/patients'
import { FOLLOWUP_DAYS, type Range } from './plan'

// 보기 모양·건수·저장 글자 만들기(AC-604.3·604.5·604.6·604.7) [환자 자료 구역]. 계산은 lib/patients(원본 옮김)가 하고 여기서는 잇기만 한다.
// 도우미·저장에서 온 값을 열쇠로 쓰는 표는 모두 원형 없는 객체다: 열쇠가 __proto__·constructor여도 그냥 값이다

const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'
const STORE_BROKEN = 'E-STORE-BROKEN'

type Marks = ContactStoreData['marks']
type TargetsTables = { chart: string[][]; rx: string[][] }

const newTable = () => Object.create(null) as Record<string, string>
const hasMark = (marks: Marks, key: string) => Object.hasOwn(marks, key)

function copyTable(table: Readonly<Record<string, string>>): Record<string, string> {
  const copy = newTable()
  for (const key of Object.keys(table)) copy[key] = table[key]
  return copy
}

// ── 답 읽기 ─────────────────────────────────────────────

const CHART_COLUMNS = ['내원번호', '차트번호', '환자명', '증상', '기록날짜']
const RX_COLUMNS: Record<TargetsKind, readonly string[]> = {
  followup: ['차트번호'],
  injection: ['처방코드', '차트번호', '처방일자'],
}

const headKey = (cell: string) => cell.replace(/\s/g, '')

const isTable = (x: unknown): x is string[][] =>
  Array.isArray(x) && x.length > 0 && x.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))

// 83 표는 약속한 칸 다섯뿐이다
function chartHeadOk(head: readonly string[]): boolean {
  const keys = head.map(headKey)
  return keys.length === CHART_COLUMNS.length && CHART_COLUMNS.every((name) => keys.includes(name))
}

// 47 표는 약속한 칸(원본 headerFor처럼 포함으로 찾고 하나씩) + 전화 칸(원본 phoneColumn 이름)뿐이다
function rxHeadOk(head: readonly string[], kind: TargetsKind): boolean {
  const keys = head.map(headKey)
  const names = RX_COLUMNS[kind]
  return (
    names.every((name) => keys.filter((key) => key.includes(name)).length === 1) &&
    keys.every((key) => names.some((name) => key.includes(name)) || phoneColumn(key))
  )
}

// 도우미 contact.targets 답. 물어본 것과 다르거나 칸이 약속과 다르면 쓰지 않는다
export function readTargets(json: unknown, expect: { kind: TargetsKind; from: string; to: string }): TargetsTables {
  if (!isRecord(json) || json.v !== 1 || json.kind !== expect.kind || json.from !== expect.from || json.to !== expect.to) {
    throw new BridgeError(BAD_REPLY)
  }
  const { chart, rx } = json
  if (!isTable(chart) || !isTable(rx) || !chartHeadOk(chart[0]) || !rxHeadOk(rx[0], expect.kind)) throw new BridgeError(BAD_REPLY)
  return { chart, rx }
}

const emptyStore = (): ContactStoreData => ({ v: 1, marks: newTable(), recall: { from: null, readThrough: null, records: [] } })

// 도우미 store.load 답. {}는 저장이 아직 없는 것. 모양이 틀리면 빈 것으로 시작하지 않는다(PC 저장을 덮어쓰게 된다)
export function readStore(json: unknown): ContactStoreData {
  if (!isRecord(json)) throw new BridgeError(STORE_BROKEN)
  if (Object.keys(json).length === 0) return emptyStore()
  if (json.v !== 1 || !isRecord(json.marks)) throw new BridgeError(STORE_BROKEN)
  const marks = newTable()
  for (const [key, day] of Object.entries(json.marks)) {
    if (typeof day !== 'string' || !isYmd(day)) throw new BridgeError(STORE_BROKEN)
    marks[key] = day
  }
  try {
    return { v: 1, marks, recall: validateHistory(json.recall) }
  } catch {
    throw new BridgeError(STORE_BROKEN)
  }
}

// ── 표 잇기 ─────────────────────────────────────────────

// 조각 여러 개를 머리 줄 한 번으로 잇는다. 머리 줄이 다르면 칸이 어긋나므로 쓰지 않는다
function joinTables(tables: readonly string[][][]): string[][] {
  if (!tables.length) return []
  const head = tables[0][0]
  const same = JSON.stringify(head)
  const joined = [head]
  for (const table of tables) {
    if (JSON.stringify(table[0]) !== same) throw new BridgeError(BAD_REPLY)
    for (let i = 1; i < table.length; i++) joined.push(table[i])
  }
  return joined
}

// 그 기간에 진료가 없으면 표는 머리 줄뿐이다. 원본이 멈추는 'no-visits'(고른 파일에 자료 없음)와 달리 조각에서는 맞는 답이다
function scheduleOf(chart: string[][]): PreparedSchedule {
  try {
    return prepareSchedule(chart)
  } catch (error) {
    if (error instanceof PatientsSourceError && error.reason === 'no-visits') return { visits: [], latest: Object.create(null) }
    throw error
  }
}

// ── 줄 열쇠·표시 ────────────────────────────────────────

export type MarkKeyRow = { kind: 'f'; visitNo: string; chart: string; next: string } | { kind: 'r'; ruleId: string; chart: string; due: string }

// F/U f|내원번호|차트번호|다음 날짜, 정기 주사 r|규칙|차트번호|다음 예정일. 새로 진료하거나 주사하면 열쇠가 바뀌어 표시가 저절로 풀린다
export function markKey(row: MarkKeyRow): string {
  return row.kind === 'f' ? `f|${row.visitNo}|${row.chart}|${row.next}` : `r|${row.ruleId}|${row.chart}|${row.due}`
}

export function setMark(store: ContactStoreData, key: string, on: boolean, today: string): ContactStoreData {
  const marks = copyTable(store.marks)
  if (on) marks[key] = today
  else delete marks[key]
  return { ...store, marks }
}

// 보기 모양이 있는 종류는 그 보기 모양의 줄 열쇠에 있는 표시만 남긴다. 보기 모양이 없는 종류는 그대로.
// 날짜로 표시를 지우지 않는다(연락한 환자가 '미연락'으로 돌아온다, AC-604.7)
export function pruneMarks(marks: Marks, views: { followup: FollowupView | null; recall: RecallView | null }, today: string): Marks {
  void today // 약속한 모양이라 받기만 한다(날짜는 보지 않는다)
  const shown = new Set<string>()
  for (const row of views.followup?.rows ?? []) shown.add(row.key)
  for (const row of views.recall?.rows ?? []) shown.add(row.key)
  const kept = newTable()
  for (const key of Object.keys(marks)) {
    const view = key.startsWith('f|') ? views.followup : key.startsWith('r|') ? views.recall : null
    if (!view || shown.has(key)) kept[key] = marks[key]
  }
  return kept
}

// 표시만 바뀌었을 때 보기 모양을 다시 만들지 않고 연락함 칸만 맞춘다
export function withMarks<V extends { rows: readonly { key: string; contacted: boolean }[] }>(view: V, marks: Marks): V {
  return { ...view, rows: view.rows.map((row) => ({ ...row, contacted: hasMark(marks, row.key) })) }
}

// ── F/U ─────────────────────────────────────────────────

// F/U 조각 47 표의 전화(원형 없는 표). 정기 주사 줄의 전화도 이 표를 먼저 본다
export function followupPhones(pieces: readonly TargetsTables[]): Record<string, string> {
  return preparePhones(joinTables(pieces.map((piece) => piece.rx)), true).map
}

export function buildFollowup(pieces: readonly TargetsTables[], marks: Marks, today: string): FollowupView {
  const read = { from: addDays(today, 1 - FOLLOWUP_DAYS), to: today }
  const { visits, latest } = scheduleOf(joinTables(pieces.map((piece) => piece.chart)))
  const phones = preparePhones(joinTables(pieces.map((piece) => piece.rx)), true)
  const base = baseDate(visits)
  // 고르기는 화면 값으로 filterFollowup이 한다. 보기 모양에는 조건부·지난 예정까지 다 둔다(건수는 고르기와 상관없이 센다)
  const rows = scheduleRows(latest, { includeCond: true, includePast: true, base }).map((v): FollowupRow => {
    const next = v.next.sortDate as string
    const key = markKey({ kind: 'f', visitNo: v.visitNo, chart: v.chart, next })
    return {
      key,
      chart: v.chart,
      name: v.name,
      phone: phoneOf(phones.map, v.chart),
      lastVisit: v.date,
      next,
      nextLabel: v.next.dateStr,
      plan: v.next.kind as FollowupRow['plan'],
      visitKind: visitKind(v),
      site: v.site,
      tx: v.tx,
      evidence: v.next.evidence,
      contacted: hasMark(marks, key),
    }
  })
  const undecided = undecidedRows(latest).map(
    (v): UndecidedRow => ({
      key: markKey({ kind: 'f', visitNo: v.visitNo, chart: v.chart, next: '' }),
      chart: v.chart,
      name: v.name,
      phone: phoneOf(phones.map, v.chart),
      lastVisit: v.date,
      nextLabel: v.next.dateStr,
      evidence: v.next.evidence,
    }),
  )
  return { read, base, rows, undecided, phoneLoaded: phones.loaded, marksLoaded: true }
}

// 보기 모양 줄 → 원본 함수(scheduleRows·passFilters·pasteRows)가 읽는 내원 모양
const visitOfRow = (row: FollowupRow): ChartVisit => ({
  visitNo: '',
  chart: row.chart,
  name: row.name,
  date: row.lastVisit,
  recordedAt: '',
  lines: [],
  next: { dateStr: row.nextLabel, sortDate: row.next, kind: row.plan, evidence: row.evidence },
  tx: row.tx,
  site: row.site,
})
const visitOfUndecided = (row: UndecidedRow): ChartVisit => ({
  visitNo: '',
  chart: row.chart,
  name: row.name,
  date: row.lastVisit,
  recordedAt: '',
  lines: [],
  next: { dateStr: row.nextLabel, sortDate: null, kind: '', evidence: row.evidence },
  tx: '',
  site: '',
})

const tabbed = (rows: readonly string[][]) => rows.map((row) => row.join('\t')).join('\n')

export function filterFollowup(view: FollowupView, f: FollowupFilters): { rows: FollowupRow[]; undecided: UndecidedRow[]; copy: { list: string; listWithDate: string } } {
  const rowOf = new Map<ChartVisit, FollowupRow>()
  const latest: Record<string, ChartVisit> = Object.create(null)
  const phones = newTable()
  for (const row of view.rows) {
    const visit = visitOfRow(row)
    rowOf.set(visit, row)
    latest[row.chart] = visit
    if (row.phone) phones[row.chart] = row.phone
  }
  const listed = scheduleRows(latest, { includeCond: f.includeCond, includePast: f.includePast, base: view.base })
  const asked = { kind: f.kind, from: f.from, to: f.to }
  const paste = (withDate: boolean) =>
    tabbed(
      pasteRows(
        listed.filter((v) => passFilters(v, asked, false)),
        { map: phones, loaded: view.phoneLoaded },
        { from: f.from, to: f.to, withDate },
      ),
    )
  return {
    rows: listed.filter((v) => passFilters(v, asked, true)).map((v) => rowOf.get(v) as FollowupRow),
    undecided: view.undecided.filter((row) => passFilters(visitOfUndecided(row), asked, false)),
    copy: { list: paste(false), listWithDate: paste(true) },
  }
}

// ── 정기 주사 ───────────────────────────────────────────

// 달 조각을 쌓인 기록에 합친다. 꺼 둔 규칙의 코드도 쌓는다(원본 ingest와 같다)
export function mergeRecall(history: RecallHistory, pieces: readonly (TargetsTables & { range: Range })[], rules: readonly RecallRule[], today: string): RecallHistory {
  const codes = rules.flatMap((rule) => rule.codes)
  let merged = history
  for (const { range, chart, rx } of pieces) {
    merged = ingestRecall(
      merged,
      { visits: scheduleOf(chart).visits, rx: prepareRx(rx), phones: preparePhones(rx, true).map, from: range.from, to: range.to },
      codes,
      today,
    )
  }
  return merged
}

export function buildRecall(
  history: RecallHistory,
  rules: readonly RecallRule[],
  marks: Marks,
  phones: Readonly<Record<string, string>>,
  today: string,
  trimmed: number,
): RecallView {
  // phoneOf는 원형 없는 표를 받아야 한다(빈 {}면 차트번호 constructor에 함수가 돌아온다)
  const table = copyTable(phones)
  const rows = recallCompute(history.records, rules).map((item): RecallRow => {
    const key = markKey({ kind: 'r', ruleId: item.ruleId, chart: item.chart, due: item.due })
    return {
      key,
      ruleId: item.ruleId,
      label: item.label,
      months: item.months,
      chart: item.chart,
      name: item.name,
      phone: phoneOf(table, item.chart) || item.phone,
      last: item.last,
      due: item.due,
      status: recallStatus(item, today),
      evidence: item.evidence,
      contacted: hasMark(marks, key),
    }
  })
  return { rows, coverage: { ...recallCoverage(history, rules, today), trimmed } }
}

const itemOfRow = (row: RecallRow): RecallItem => ({
  ruleId: row.ruleId,
  label: row.label,
  months: row.months,
  chart: row.chart,
  name: row.name,
  phone: row.phone,
  last: row.last,
  due: row.due,
  evidence: row.evidence,
})

// 줄의 전화는 이미 F/U 표 → 기록 순서로 골랐다
const noPhoneOf = () => ''

export function filterRecall(view: RecallView, f: RecallFilters, today: string): { rows: RecallRow[]; copy: { list: string; phones: string; missingPhones: number } } {
  const rowOf = new Map<RecallItem, RecallRow>()
  const items = view.rows.map((row) => {
    const item = itemOfRow(row)
    rowOf.set(item, row)
    return item
  })
  const selected = recallSelect(items, f.from, f.to, f.overdue, today)
  const phones = recallPhones(selected, noPhoneOf)
  return {
    rows: selected.map((item) => rowOf.get(item) as RecallRow),
    copy: { list: recallCopyLines(selected, noPhoneOf), phones: phones.text, missingPhones: phones.missing },
  }
}

// ── 건수 ────────────────────────────────────────────────

// 늘 정수 둘. null(보기 모양 없음·연락 표시 못 불러옴)은 handler가 정한다
export function contactCounts(fu: FollowupView, rc: RecallView, today: string): ContactCount {
  const tomorrow = addDays(today, 1)
  return {
    followup_left: fu.rows.filter((row) => row.plan === '예정' && row.next === tomorrow && !row.contacted).length,
    injection_left: rc.rows.filter((row) => row.due <= today && !row.contacted).length,
  }
}

// ── 저장 글자 ───────────────────────────────────────────

export const MAX_STORE_BYTES = 30 * 1024 * 1024 // 도우미 ContactStore.MaxContactBytes(32MB) 아래

const utf8Length = (text: string) => new TextEncoder().encode(text).byteLength
// from이 null에서 날짜로 바뀌면 늘어나는 바이트('null' → '"YYYY-MM-DD"')
const FROM_GROWTH = 8

// UTF-8 JSON이 한도를 넘으면 가장 오래된 정기 주사 기록부터 빼고 from을 남은 첫 기록 날짜로 늦춘다.
// 증상 글은 자르지 않는다(원본 판정이 바뀐다)
export function fitStore(store: ContactStoreData): { store: ContactStoreData; trimmed: number } {
  let bytes = utf8Length(JSON.stringify(store))
  if (bytes <= MAX_STORE_BYTES) return { store, trimmed: 0 }
  const { recall } = store
  if (recall.from === null) bytes += FROM_GROWTH
  const ordered = recall.records.slice().sort((a, b) => a.date.localeCompare(b.date))
  let trimmed = 0
  while (trimmed < ordered.length && bytes > MAX_STORE_BYTES) {
    bytes -= utf8Length(JSON.stringify(ordered[trimmed])) + 1 // 기록 사이 쉼표
    trimmed++
  }
  const records = ordered.slice(trimmed)
  return { store: { ...store, recall: { ...recall, from: records.length ? records[0].date : null, records } }, trimmed }
}

// 늘 pruneMarks → fitStore를 거친 store만 넣는다
export function storePayload(store: ContactStoreData): string {
  return JSON.stringify({ contact: store })
}
