import { addDays, isYmd } from '@/lib/analytics/dates'
import { BridgeError, isRecord } from '@/lib/bridge/protocol'
import { baseDate, passFilters, pasteRows, phoneColumn, phoneOf, preparePhones, prepareSchedule, scheduleRows, undecidedRows, visitKind } from '@/lib/patients/followup'
import { lapsedPaste, lapsedView } from '@/lib/patients/lapsed'
import { ingestRecall, prepareRx, recallCompute, recallCopyLines, recallCoverage, recallPhones, recallSelect, recallStatus, validateHistory } from '@/lib/patients/recall'
import type { RecallItem, RecallRule } from '@/lib/patients/recall'
import { copyRows, countOn, firstPick, missed, missedPaste, missedRange, reservationPaste, upcoming } from '@/lib/patients/reservations'
import { PatientsSourceError } from '@/lib/patients/sourceError'
import type {
  ChartVisit,
  ContactCount,
  ContactStoreData,
  FollowupFilters,
  FollowupRow,
  FollowupView,
  LapsedData,
  LapsedListFilters,
  LapsedListView,
  PreparedSchedule,
  RecallFilters,
  RecallHistory,
  RecallRow,
  RecallView,
  ReservationData,
  ReservationFilters,
  ReservationListView,
  ReservationPick,
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

// store.load 답 {contact: …}의 contact 안쪽 값(readStoreReply가 꺼내 넘긴다). {}는 저장이 아직 없는 것. 모양이 틀리면 빈 것으로 시작하지 않는다(PC 저장을 덮어쓰게 된다)
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

// 도우미 store.load {contact: true}의 답 {contact: {…}}(도우미 0.3.0). contact만 읽고 밖의 칸은 보지 않는다.
// contact가 없거나 객체가 아니면(안쪽 모양을 바로 준 옛 답 {}·{v: 1, …} 포함) 빈 것으로 시작하지 않는다
export function readStoreReply(json: unknown): ContactStoreData {
  if (!isRecord(json) || !isRecord(json.contact)) throw new BridgeError(STORE_BROKEN)
  return readStore(json.contact)
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

// 도우미 83 표 끝의 총계 줄(patients-total-row). 비트 표에서 【 총 계 】 글자는 No 칸에 있는데 도우미가 그 칸을 고르지 않아,
// 차트번호 칸의 건수(1,295건)만 남는다. 원본 prepareSchedule은 첫 칸이 【총계】일 때만 총계로 보므로 여기서 뺀다.
// 좁게 본다: 건수 모양(원본 isChartSummaryRow와 같은 정규식)이고 다른 칸이 모두 비었을 때만. 아니면 원본처럼 멈춘다
const TOTAL_COUNT = /^\d+(?:,\d{3})*건$/

function isHelperTotalRow(row: readonly string[], chartColumn: number): boolean {
  return (
    chartColumn >= 0 &&
    TOTAL_COUNT.test(String(row[chartColumn] ?? '').replace(/\s/g, '')) &&
    row.every((value, index) => index === chartColumn || String(value ?? '').trim() === '')
  )
}

// 머리 줄은 그대로 두고 총계 줄만 뺀다. 자리로 찾지 않는다(F/U는 조각을 이어 붙여 총계 줄이 가운데에도 있다)
function dropHelperTotalRows(chart: string[][]): string[][] {
  if (!chart.length) return chart
  const chartColumn = chart[0].findIndex((cell) => headKey(cell) === '차트번호')
  return [chart[0], ...chart.slice(1).filter((row) => !isHelperTotalRow(row, chartColumn))]
}

// 그 기간에 진료가 없으면 표는 머리 줄뿐이다(총계 줄만 있어도 같다). 원본이 멈추는 'no-visits'(고른 파일에 자료 없음)와 달리 조각에서는 맞는 답이다
function scheduleOf(chart: string[][]): PreparedSchedule {
  try {
    return prepareSchedule(dropHelperTotalRows(chart))
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

// 예약 보냄 표시(s|)는 예약 날이 오늘에서 이만큼 전보다 앞이면 지운다(AC-2806.4. 예약은 오늘−30일부터 읽는다)
export const RESERVATION_MARK_DAYS = 31
const COMPACT_DAY = /^\d{8}$/

// s|차트번호|예약 시각(yyyyMMddHHmm)[|차례]의 예약 날 YYYYMMDD. 모양이 다르면 null
function reservationDayOf(key: string): string | null {
  const day = (key.split('|')[2] ?? '').slice(0, 8)
  return COMPACT_DAY.test(day) ? day : null
}

// F/U(f|)·정기 주사(r|): 보기 모양이 있는 종류는 그 보기 모양의 줄 열쇠에 있는 표시만 남긴다. 보기 모양이 없는 종류는 그대로.
// 날짜로 지우지 않는다(연락한 환자가 '미연락'으로 돌아온다, AC-604.7).
// 예약(s|)은 예약 날이 오늘−31일보다 앞이면 지운다(오늘을 모르면 그대로). 장기 미방문(l|)은 읽은 명단(lapsed)이 있으면 그 명단의 열쇠만 남긴다(AC-2806.4)
export function pruneMarks(
  marks: Marks,
  views: { followup: FollowupView | null; recall: RecallView | null; lapsed?: Pick<LapsedData, 'rows'> | null },
  today: string,
): Marks {
  const shown = new Set<string>()
  for (const row of views.followup?.rows ?? []) shown.add(row.key)
  for (const row of views.recall?.rows ?? []) shown.add(row.key)
  const lapsedKeys = views.lapsed ? new Set(views.lapsed.rows.map((row) => row.key)) : null
  const oldest = isYmd(today) ? addDays(today, -RESERVATION_MARK_DAYS).replace(/-/g, '') : null
  const kept = newTable()
  for (const key of Object.keys(marks)) {
    if (key.startsWith('s|')) {
      const day = reservationDayOf(key)
      if (!oldest || !day || day >= oldest) kept[key] = marks[key]
      continue
    }
    if (key.startsWith('l|')) {
      if (!lapsedKeys || lapsedKeys.has(key)) kept[key] = marks[key]
      continue
    }
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
  // 지난 줄의 기준은 이 명단을 읽은 날이다. view.base(자료의 마지막 진료일)로 가르면 그날 아직 진료가 없을 때 어제 줄이 남는다.
  // 끄면 scheduleRows가 오늘 전 줄을 고른 기간 안이어도 뺀다(AC-611.1 사용자 결정)
  const today = view.read.to
  const listed = scheduleRows(latest, { includeCond: f.includeCond, includePast: f.includePast, base: today })
  const asked = { kind: f.kind, from: f.from, to: f.to }
  const kindOnly = { kind: f.kind }
  // 켜면 고른 기간의 줄에 기간 앞의 지난 줄(오늘 전이고 시작일 전)을 더한다(recallSelect와 같은 규칙). 오늘부터 시작일 전까지의 줄은 지난 줄이 아니다
  const isEarlier = (v: ChartVisit) => {
    const next = v.next.sortDate as string
    return next < today && (!f.from || next < f.from)
  }
  const selected = listed.filter((v) => passFilters(v, asked, true) || (f.includePast && passFilters(v, kindOnly, false) && isEarlier(v)))
  // 복사 글은 고른 줄에서 만든다. pasteRows에 기간을 넘기면 지난 줄이 빠진다. 번호 없는 분을 빼는 규칙은 pasteRows 그대로다
  const paste = (withDate: boolean) => tabbed(pasteRows(selected, { map: phones, loaded: view.phoneLoaded }, { withDate }))
  return {
    rows: selected.map((v) => rowOf.get(v) as FollowupRow),
    undecided: view.undecided.filter((row) => passFilters(visitOfUndecided(row), kindOnly, false)),
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

// ── 비트 명단: 예약 문자 명단 · 장기 미방문 명단(spec patients-bit-lists) ─────
// 계산은 lib/patients/reservations.ts·lapsed.ts가 하고 여기서는 화면 보기 모양으로 잇기만 한다.
// marks가 null이면 저장을 못 불러온 것이다: 표시는 모두 꺼져 있고 marksLoaded false

/** 읽은 뒤 한 번: 처음 고를 날과 [내일]·[모레] 단추의 인원수(그 날 문자 보낼 예약 수) */
export function reservationsHead(data: ReservationData, today: string): { pick: ReservationPick; dayCounts: { tomorrow: number; after: number } } {
  return { pick: firstPick(data, today), dayCounts: { tomorrow: countOn(data, addDays(today, 1)), after: countOn(data, addDays(today, 2)) } }
}

export function reservationsListView(data: ReservationData, today: string, f: ReservationFilters, marks: Marks | null): ReservationListView {
  const day = f.day ?? firstPick(data, today).day
  const rows = upcoming(data, day, marks ?? newTable())
  const copied = copyRows(rows, f.unsentOnly)
  const range = missedRange(today, f.missedDays)
  const away = missed(data, range, f.notYetOnly)
  return {
    day,
    rows,
    copy: { list: reservationPaste(copied, f.withDate, day), keys: copied.map((row) => row.key) },
    missed: { range, rows: away.rows, summary: away.summary, copy: { list: missedPaste(away.rows), count: away.rows.filter((row) => row.phone).length } },
    marksLoaded: marks !== null,
  }
}

export function lapsedListView(data: LapsedData, today: string, f: LapsedListFilters, marks: Marks | null): LapsedListView {
  const view = lapsedView(data, { bucket: f.bucket, rx: f.rx }, f.groups, marks ?? newTable(), today)
  return { ...view, copy: { list: lapsedPaste(view.rows), count: view.rows.filter((row) => row.phone).length }, marksLoaded: marks !== null }
}

// ── 건수 ────────────────────────────────────────────────

// 늘 정수 둘. null(보기 모양 없음·연락 표시 못 불러옴)은 handler가 정한다. 비트 명단 표시(s|·l|)는 세지 않는다(AC-2806.1)
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
