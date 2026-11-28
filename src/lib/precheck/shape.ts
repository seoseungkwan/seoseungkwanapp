import { compareYmd, isYmd, monthOf, parseDateCell } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import type {
  CatalogCode,
  CatalogKind,
  ClaimMonth,
  DxLine,
  DxTrend,
  GridRow,
  History,
  HospitalCatalog,
  LaCode,
  LineHint,
  RxByDay,
  RxLine,
  TrendDiagnosis,
  TrendSuggestion,
  Visit,
} from '@/types/precheck'

// 도우미 claim.month JSON(다 모아 한 번 푼 것) → 점검용 모양 ClaimMonth(REQ-009 AC-009.3~AC-009.5, design.md 6-3) [환자 자료 구역].
// 원본(양지바른 사전점검 seoseungkwan/shared@2a1069b assets/mx999_v22.html)의 줄 바꾸기를 그대로 옮겼다:
//   83 증상  → new-medicore-import selectWorkbook('chart') 검사 + build + splitCell
//   47 소모  → selectWorkbook('rx') 검사 + parseRx(+ NEW_MEDICORE_HOSPITAL_CODE_RULES.normalizeQuantity)
//   83D 상병 → new-medicore-diagnoses parse · get
//   12개월 이력 → new-medicore-precheck loadHistory(HIST.byChart) · 상병 추세 → new-medicore-dx-recommend readTrend
// 원본이 가져오기를 멈추던 자료와, 빠진 자료(증상·소모·이력이 빔, counts와 줄 수가 다름)는 E-CLAIM-PARTIAL로 멈춘다(AC-009.4).
// 날짜는 lib/analytics/dates.ts로만 'YYYY-MM-DD'로 바꾼다

/** 점검 자료가 틀려 멈춤. message에는 번호만 싣는다(환자 글자를 싣지 않는다) */
export class PrecheckError extends Error {
  readonly code: ErrorCode
  constructor(code: ErrorCode) {
    super(code)
    this.name = 'PrecheckError'
    this.code = code
  }
}

function stop(): never {
  throw new PrecheckError('E-CLAIM-PARTIAL')
}

type Rec = Record<string, unknown>
const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
/** 원본 count: 0 ~ 10억 정수 */
const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 1e9
const has = (row: GridRow, column: string) => Object.hasOwn(row, column)
const text = (value: string | undefined) => (value ?? '').trim()
const compact = (value: string | undefined) => text(value).replace(/\s/g, '')
const up = (value: unknown) => String(value ?? '').trim().toUpperCase()
/** 원본 diagnoses chartKey: 앞의 0을 뺀 차트번호 */
const chartKey = (value: string | undefined) => text(value).replace(/^0+(?=\d)/, '')

// ── 날짜 칸 ──────────────────────────────────────────────

/** 원본 dateKey(ymd8 + 있는 날인지): 숫자만 8자리 이상이면 앞 8자리, 아니면 엑셀 일련번호(20000~80000) */
function dayOf(raw: string | undefined): string | null {
  const s = text(raw)
  const digits = s.replace(/\D/g, '')
  if (/^\d{8}/.test(digits)) return parseDateCell(digits.slice(0, 8))
  const n = Number(s)
  if (s && Number.isFinite(n) && n > 20000 && n < 80000) return parseDateCell(n)
  return null
}

/** 원본 diagnoses day: 숫자 8자리로 시작하면 그 날, 아니면 빈칸 */
function diagnosisDay(raw: string | undefined): string {
  const digits = text(raw).replace(/\D/g, '')
  return /^\d{8}/.test(digits) ? (parseDateCell(digits.slice(0, 8)) ?? '') : ''
}

// ── 머리 칸 ──────────────────────────────────────────────

function range(x: unknown): DateRange {
  if (!isRecord(x) || typeof x.from !== 'string' || typeof x.to !== 'string') stop()
  if (!isYmd(x.from) || !isYmd(x.to) || compareYmd(x.from, x.to) > 0) stop()
  return { from: x.from, to: x.to }
}

/** 표 하나: 선언한 줄 수와 같고, 줄마다 값이 모두 글자 */
function table(x: unknown, declared: unknown): GridRow[] {
  if (!Array.isArray(x) || !isCount(declared) || x.length !== declared) stop()
  for (const row of x) {
    if (!isRecord(row) || !Object.values(row).every((value) => typeof value === 'string')) stop()
  }
  return x as GridRow[]
}

// ── 83 증상 → 진료 (selectWorkbook · build · splitCell) ─────────────

const HDR_RE = /^\s*(?:#\s*\d+\s*)?(S|O|A|P|CC|C\/C|PI|Hx|PE|Dx|Imp|Tx|Plan|Rx)\s*[)\]:：.]\s*/i
const HDR_KIND: Record<string, LineHint> = {
  s: 'subj', cc: 'subj', 'c/c': 'subj', pi: 'subj', hx: 'subj', o: 'exam', pe: 'exam',
  a: 'dx', dx: 'dx', imp: 'dx', p: 'plan', tx: 'plan', plan: 'plan', rx: 'plan',
}

/** 증상 칸 하나 → 줄들(원본 splitCell 그대로). 머리말이 한 번도 없으면 힌트는 모두 null */
function splitCell(txt: string): { t: string; h: LineHint | null }[] {
  const out: { t: string; h: LineHint | null }[] = []
  let cur: LineHint | null = null
  txt.split(/\r?\n|;\s*/).forEach((piece) => {
    // 한 줄 안에 머리말이 여러 개면 그 앞에서 한 번 더 나눔 ("S) 허리 통증 O) Td(+) P) MBB")
    piece.split(/(?=\s(?:S|O|A|P|CC|PI|Dx|Imp|Tx|Plan)\s*[)\]:：]\s)/).forEach((p0) => {
      let p = p0.replace(/^\s*(?:\d+[.)]|[-•·▶►*])\s+/, '').trim()
      if (!p) return
      const m = p.match(HDR_RE)
      if (m && p.length > m[0].length) {
        const kind = m[1].toLowerCase()
        cur = Object.hasOwn(HDR_KIND, kind) ? HDR_KIND[kind] : null
        p = p.slice(m[0].length).trim()
      }
      out.push({ t: p, h: cur })
    })
  })
  if (!out.some((x) => x.h)) out.forEach((x) => (x.h = null))
  return out.length ? out : [{ t: txt.trim(), h: null }]
}

type VisitDraft = Omit<Visit, 'rx' | 'dx' | 'memosInBit'>

/** 원본 byVisitDate: 날짜 → 차트번호 숫자 → 차트번호 글자 */
function byVisitDate(a: VisitDraft, b: VisitDraft): number {
  const key = (chart: string) => {
    const n = parseInt(chart.replace(/\D/g, ''), 10)
    return Number.isNaN(n) ? Infinity : n
  }
  return compareYmd(a.date, b.date) || key(a.chart) - key(b.chart) || a.chart.localeCompare(b.chart, 'ko')
}

function buildVisits(rows: GridRow[]): VisitDraft[] {
  const owners = new Map<string, string>() // 내원번호 → 차트번호|날짜
  const visits = new Map<string, VisitDraft>()
  for (const row of rows) {
    const content = text(row['증상'])
    if (!content) continue // 빈 줄·합계 줄(【총계】)·증상 없는 줄
    const chart = text(row['차트번호'])
    const date = dayOf(row['기록날짜'])
    const id = text(row['내원번호'])
    if (!chart || !date || !id) stop() // 원본: '차트번호가 비어 있습니다' 등으로 가져오기를 멈춘다
    const owner = `${chart}|${date}`
    const previous = owners.get(id)
    if (previous && previous !== owner) stop() // 같은 내원번호에 서로 다른 환자 또는 날짜
    owners.set(id, owner)
    let visit = visits.get(id)
    if (!visit) {
      visit = { key: id, chart, date, month: monthOf(date), name: text(row['환자명']), lines: [], hints: [] }
      visits.set(id, visit)
    }
    for (const { t, h } of splitCell(content)) {
      visit.lines.push(t)
      visit.hints.push(h)
    }
  }
  return [...visits.values()].sort(byVisitDate)
}

// ── 47 소모 → 처방 (selectWorkbook · parseRx) ─────────────────

/** 원본 normalizeQuantity: 숫자(쉼표 묶음·소수)만, 아니면 null(빈칸을 0으로 만들지 않는다) */
function quantity(value: string | undefined): number | null {
  const input = text(value)
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/.test(input)) return null
  const n = Number(input.replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : null
}

function readRx(rows: GridRow[]): { byDay: RxByDay; order: RxLine[][]; lines: number } {
  const byDay: RxByDay = new Map()
  const order: RxLine[][] = [] // 새 날 목록을 처음 나온 차례로(원본 Object.values(RXDATA)). byDay와 같은 배열이다
  let lines = 0
  for (const row of rows) {
    const chart = text(row['차트번호'])
    if (!chart) continue // 빈 줄·합계·소계 줄
    const date = dayOf(row['처방일자'])
    const code = text(row['처방코드'])
    if (!date || !code || /◀|▶/.test(code)) stop() // 원본: 처방일자·처방코드가 틀리거나 집계 표시가 섞이면 멈춘다
    const pay = has(row, '급여구분') ? text(row['급여구분']) : ''
    const line: RxLine = {
      code,
      name: has(row, '처방명칭') ? text(row['처방명칭']) : '',
      qty: has(row, '수량') ? quantity(row['수량']) : null,
      benefit: !/비급여/.test(pay),
      pay,
    }
    const days = byDay.get(chart) ?? new Map<string, RxLine[]>()
    let list = days.get(date)
    if (!list) {
      list = []
      order.push(list)
      days.set(date, list)
    }
    list.push(line)
    byDay.set(chart, days)
    lines++
  }
  return { byDay, order, lines }
}

// ── 83D 상병 → 내원번호별 상병 (diagnoses parse) ─────────────────

const DX_CODE = /^[A-Z][0-9A-Z]{2,7}$/
const MAX_DX_ROWS = 300_000
const MAX_DX_VISITS = 200_000
const MAX_DX_PER_VISIT = 60
/** 비트 '주상병 여부': 주상병 · 부상병 · 배재상병(비트 표기) */
const role = (kind: string): true | false | 'x' => (kind === '주상병' ? true : /배[재제]/.test(kind) ? 'x' : false)
const rank = (item: DxLine) => (item.m === true ? 0 : item.m === 'x' ? 2 : 1)

type OwnedDx = DxLine & { h: string }

function readDx(rows: GridRow[]): Map<string, OwnedDx[]> {
  const map = new Map<string, OwnedDx[]>()
  let read = 0
  for (const row of rows) {
    if (++read > MAX_DX_ROWS) stop()
    const id = text(row['내원번호'])
    const owner = chartKey(row['차트번호'])
    const value = compact(row['상병청구코드']).toUpperCase()
    if (!id && !owner && !value) continue
    if (!id || !owner || !DX_CODE.test(value)) continue // 합계 줄·빈 코드
    const list = map.get(id) ?? []
    if (list.some((item) => item.c === value) || list.length >= MAX_DX_PER_VISIT) continue
    list.push({
      c: value,
      n: has(row, '상병명칭') ? text(row['상병명칭']).slice(0, 120) : '',
      m: has(row, '주상병여부') ? role(compact(row['주상병여부'])) : null,
      s: has(row, '산정특례기호') ? text(row['산정특례기호']).slice(0, 20) : '',
      d: has(row, '과목코드') ? text(row['과목코드']).slice(0, 8) : '',
      t: has(row, '진단일자') ? diagnosisDay(row['진단일자']) : '',
      h: owner,
    })
    map.set(id, list)
    if (map.size > MAX_DX_VISITS) stop()
  }
  for (const list of map.values()) list.sort((a, b) => rank(a) - rank(b))
  return map
}

// ── 12개월 이력 (loadHistory) ────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function readHistory(rows: unknown[]): { history: History; memos: Map<string, { chart: string; memo: string }[]> } {
  const history: History = new Map()
  const memos = new Map<string, { chart: string; memo: string }[]>() // 내원번호 → 비트 메모
  for (const row of rows) {
    if (!isRecord(row)) continue
    const { v: visit, p: chart, d: date, c: codes, m: memo } = row
    if (typeof chart !== 'string' || typeof date !== 'string' || !ISO_DAY.test(date) || !isYmd(date) || !Array.isArray(codes)) continue
    const days = history.get(chart) ?? new Map<string, { codes: string[]; memo: string }>()
    const known = days.get(date) ?? { codes: [], memo: '' }
    for (const code of codes) {
      const upper = up(code)
      if (upper && !known.codes.includes(upper)) known.codes.push(upper)
    }
    if (typeof memo === 'string' && memo && !known.memo.includes(memo)) known.memo += (known.memo ? '\n' : '') + memo
    days.set(date, known)
    history.set(chart, days)
    if (typeof visit === 'string' && typeof memo === 'string' && memo) {
      const list = memos.get(visit) ?? []
      list.push({ chart: chartKey(chart), memo })
      memos.set(visit, list)
    }
  }
  return { history, memos }
}

// ── 상병 추세 (readTrend) ───────────────────────────────────

const RX_CODE = /^[0-9A-Za-z가-힣_.-]{1,20}$/
const GROUP_CODE = /^[A-Z][0-9A-Z]{2}$/
const MAX_TREND_CODES = 5000
const MAX_TREND_PER_CODE = 40

function readTrendDiagnosis(item: unknown): TrendDiagnosis {
  if (!isRecord(item) || typeof item.c !== 'string' || !DX_CODE.test(item.c) || typeof item.nm !== 'string') stop()
  const { m, s, x, l } = item
  if (!isCount(m) || !isCount(s) || !isCount(x) || (l !== undefined && !isCount(l))) stop()
  return { c: item.c, nm: item.nm.slice(0, 80), m, s, x, l: l === undefined ? null : l }
}

function readSuggestion(entry: unknown): TrendSuggestion {
  if (!isRecord(entry) || typeof entry.c !== 'string' || !RX_CODE.test(entry.c)) stop()
  const { n, k, miss, g } = entry
  if (!isCount(n) || !isCount(k) || !isCount(miss) || k > 1000 || !Array.isArray(g) || !g.length || g.length > 4) stop()
  return {
    rx: up(entry.c),
    n,
    k,
    miss,
    groups: g.map((group: unknown) => {
      if (!isRecord(group) || typeof group.c !== 'string' || !GROUP_CODE.test(group.c) || typeof group.nm !== 'string') stop()
      if (!isCount(group.k) || !isCount(group.x) || group.k > 1000 || group.x > 1000) stop()
      return { c: group.c, nm: group.nm.slice(0, 80), k: group.k, x: group.x }
    }),
  }
}

function readTrend(x: unknown, period: DateRange): DxTrend {
  if (!isRecord(x) || !isCount(x.visits) || !Array.isArray(x.codes) || x.codes.length > MAX_TREND_CODES) stop()
  const codes: DxTrend['codes'] = new Map()
  for (const entry of x.codes) {
    if (!isRecord(entry) || typeof entry.c !== 'string' || !RX_CODE.test(entry.c) || codes.has(up(entry.c))) stop()
    if (!isCount(entry.n) || !Array.isArray(entry.d) || entry.d.length > MAX_TREND_PER_CODE) stop()
    codes.set(up(entry.c), { n: entry.n, d: entry.d.map(readTrendDiagnosis) })
  }
  const suggestions: TrendSuggestion[] = []
  if (x.suggestions != null) {
    if (!Array.isArray(x.suggestions) || x.suggestions.length > MAX_TREND_CODES) stop()
    for (const entry of x.suggestions) suggestions.push(readSuggestion(entry))
  }
  return { from: period.from, to: period.to, visits: x.visits, codes, suggestions }
}

// ── 처방 목록 ────────────────────────────────────────────

const KINDS: readonly CatalogKind[] = ['drug', 'procedure', 'lab', 'other', 'unknown']

function readCatalog(x: unknown): HospitalCatalog {
  if (!isRecord(x) || !Array.isArray(x.codes) || !Array.isArray(x.la)) stop()
  const codes = x.codes.map((row: unknown): CatalogCode => {
    if (!isRecord(row) || typeof row.code !== 'string' || typeof row.name !== 'string' || typeof row.standardCode !== 'string') stop()
    if (!KINDS.includes(row.kind as CatalogKind) || typeof row.active !== 'boolean') stop()
    return { code: row.code, name: row.name, kind: row.kind as CatalogKind, active: row.active, standardCode: row.standardCode }
  })
  const la = x.la.map((row: unknown): LaCode => {
    if (!isRecord(row) || typeof row.code !== 'string' || typeof row.name !== 'string' || typeof row.active !== 'boolean') stop()
    return { code: row.code, name: row.name, active: row.active }
  })
  return { codes, la }
}

// ── 진료의(claim-learn AC-9317.2) ─────────────────────────

/** 진료의 코드는 학습 조건 칸과 같게 40자까지(phrases validCode) */
const DOCTOR_CODE_MAX = 40
const DOCTOR_NAME_MAX = 40

/**
 * 도우미 0.15.0 claim.month 맨 위 두 칸: visitDoctors [[차트번호, 진료일, 진료의 코드|null]] → (앞 0을 뺀 차트번호|YYYY-MM-DD) → 코드들(나온 차례, 겹침 없음),
 * doctors [[코드, 이름|null]] → 이름표(이름은 40자까지, 빈 이름은 null). 두 칸이 다 없으면(옛 도우미) null이다.
 * 진료의는 학습 조건에만 쓰는 곁 자료라 틀린 칸·줄은 버리고 멈추지 않는다
 */
function readDoctors(raw: Rec): { byVisit: Map<string, string[]>; names: Map<string, string | null> } | null {
  const { visitDoctors, doctors } = raw
  if (visitDoctors === undefined && doctors === undefined) return null
  const codeOf = (value: unknown) => (typeof value === 'string' && value.trim() && value.trim().length <= DOCTOR_CODE_MAX ? value.trim() : null)
  const byVisit = new Map<string, string[]>()
  for (const row of Array.isArray(visitDoctors) ? visitDoctors : []) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[1] !== 'string') continue
    const owner = chartKey(row[0])
    const day = dayOf(row[1])
    const code = codeOf(row[2])
    if (!owner || !day || !code) continue
    const key = `${owner}|${day}`
    const list = byVisit.get(key) ?? []
    if (!list.includes(code)) list.push(code)
    byVisit.set(key, list)
  }
  const names = new Map<string, string | null>()
  for (const row of Array.isArray(doctors) ? doctors : []) {
    if (!Array.isArray(row)) continue
    const code = codeOf(row[0])
    const name = row[1]
    if (!code || names.has(code) || !(name === null || typeof name === 'string')) continue
    const cut = name === null ? '' : name.trim().slice(0, DOCTOR_NAME_MAX)
    names.set(code, cut || null)
  }
  return { byVisit, names }
}

// ── 한 달 자료 ───────────────────────────────────────────

/** 풀린 claim.month JSON → ClaimMonth. 틀리거나 빠진 자료면 PrecheckError('E-CLAIM-PARTIAL') */
export function shapeClaimMonth(raw: unknown): ClaimMonth {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.counts)) stop()
  const { counts } = raw
  const period = range(raw.period)
  const historyRange = range(raw.historyRange)
  const trendRange = range(raw.trendRange)
  const s83 = table(raw.s83, counts.s83)
  const s83d = table(raw.s83d, counts.s83d)
  const s47 = table(raw.s47, counts.s47)
  if (!Array.isArray(raw.history) || !isCount(counts.history) || raw.history.length !== counts.history) stop()

  const drafts = buildVisits(s83)
  if (!drafts.length) stop() // 증상(83)이 빔
  const rx = readRx(s47)
  if (!rx.lines) stop() // 소모(47)가 빔
  const dx = readDx(s83d) // 상병(83D)은 없어도 된다(원본처럼)
  const { history, memos } = readHistory(raw.history)
  if (!history.size) stop() // 12개월 이력은 늘 함께 온다(그 기간의 진료도 이력에 든다). 증상·소모처럼 거른 뒤에 센다
  const dxTrend = readTrend(raw.dxTrend, trendRange)
  const catalog = readCatalog(raw.catalog)
  const doctors = readDoctors(raw)

  const visits: Visit[] = drafts.map((draft) => {
    const owner = chartKey(draft.chart)
    return {
      ...draft,
      rx: rx.byDay.get(draft.chart)?.get(draft.date) ?? [],
      dx: (dx.get(draft.key) ?? [])
        .filter((item) => item.h === owner)
        .map((item): DxLine => ({ c: item.c, n: item.n, m: item.m, s: item.s, d: item.d, t: item.t })),
      memosInBit: [...new Set((memos.get(draft.key) ?? []).filter((m) => m.chart === owner).map((m) => m.memo))],
      // 옛 도우미 답(진료의 칸 없음)은 지금 모양 그대로다(AC-9317.2)
      ...(doctors ? { doctors: [...(doctors.byVisit.get(`${owner}|${draft.date}`) ?? [])] } : {}),
    }
  })
  return { period, visits, history, historyRange, rxByDay: rx.byDay, rxDayOrder: rx.order, dxTrend, catalog, hasDx: s83d.length > 0, ...(doctors ? { doctorNames: doctors.names } : {}) }
}
