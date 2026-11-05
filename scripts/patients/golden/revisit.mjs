// 원본 양지바른(seoseungkwan/shared@2a1069b, README 1.24.5)의 F/U 계산(revisit_schedule.html)을 node:vm으로 돌려
// 가짜 자료(fixtures/patients/fake)의 결과를 골든 파일(fixtures/patients/golden)로 쓴다.
//
//   node scripts/patients/golden/revisit.mjs "$YANGJI_SRC"     (YANGJI_SRC = …/YangjiBareun_사전점검)
//
// 원본은 저장소 밖에 둔다. 이 스크립트는 원본 파일을 읽기만 하고 저장소에는 결과만 쓴다.
// 돌리는 방식은 원본 시험 tests/test_revisit_import_html.py·test_revisit_source.py와 같다: <script>를 꺼내 가짜 document를 넣은
// vm 문맥에서 SheetJS → 화면 스크립트(parseFU 등) → new-medicore-revisit-import 순서로 돌린다.
// 원본 함수 몸통은 고치지 않는다. 바깥으로 내놓지 않은 phoneColumn·phoneTokens·headerFor만 같은 자리에서 한 줄로 꺼낸다.
// 원본의 Date 값은 그 날짜의 'YYYY-MM-DD' 글자로 적는다(한국 시간 기준이라 TZ=Asia/Seoul로 돈다).
process.env.TZ = 'Asia/Seoul'

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const SOURCE = 'seoseungkwan/shared@2a1069b'
const FILE = 'YangjiBareun_사전점검/assets/revisit_schedule.html'
// 2a1069b(= 얕은 clone c66488e, 이 폴더 안 파일은 같음)의 revisit_schedule.html
const SOURCE_SHA256 = '9a41e596e1247da6509f3f30664ddb1d0f63d9de4950d6c9047c5480136b35c3'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const FAKE = 'fixtures/patients/fake'
const OUT = 'fixtures/patients/golden'

function fail(message) {
  console.error(message)
  process.exit(1)
}

const src = process.argv[2] || process.env.YANGJI_SRC
if (!src) fail('원본 폴더가 필요합니다: node scripts/patients/golden/revisit.mjs "$YANGJI_SRC"')
const htmlBytes = readFileSync(join(src, 'assets', 'revisit_schedule.html'))
const sourceSha = createHash('sha256').update(htmlBytes).digest('hex')
if (sourceSha !== SOURCE_SHA256) fail(`원본이 ${SOURCE}의 파일이 아닙니다(sha256 ${sourceSha}).`)
const html = htmlBytes.toString('utf8')

// ── 원본 돌리기 ─────────────────────────────────────────

const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1], code: m[2] }))
const only = (what, list) => {
  if (list.length !== 1) fail(`원본에서 ${what} 스크립트를 하나로 찾지 못했습니다(${list.length}개).`)
  return list[0].code
}
const sheetjs = only('SheetJS 0.18.5', scripts.filter((s) => s.code.includes('SheetJS 0.18.5')))
const screen = only('parseFU', scripts.filter((s) => s.code.includes('function parseFU(')))
const revisitImport = only('new-medicore-revisit-import', scripts.filter((s) => s.attrs.includes('id="new-medicore-revisit-import"')))

const ANCHOR = 'Object.defineProperty(window,"NEW_MEDICORE_REVISIT"'
if (revisitImport.split(ANCHOR).length !== 2) fail('원본에서 NEW_MEDICORE_REVISIT 내놓는 자리를 하나로 찾지 못했습니다.')
const exposed = revisitImport.replace(ANCHOR, `window.__GOLDEN__={phoneColumn,phoneTokens,headerFor};${ANCHOR}`)

const nodes = new Map()
function node(id) {
  if (id === 'nmImport') return null
  if (!nodes.has(id)) {
    nodes.set(id, {
      value: '',
      checked: false,
      type: 'text',
      textContent: '',
      style: {},
      className: '',
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {},
      querySelectorAll() {
        return []
      },
    })
  }
  return nodes.get(id)
}
const ctx = {
  console,
  URL,
  Date,
  Map,
  Set,
  Error,
  Promise,
  AbortController,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: node, querySelectorAll: () => [], addEventListener() {} },
  navigator: {},
}
ctx.window = ctx
vm.createContext(ctx)
vm.runInContext(sheetjs, ctx)
vm.runInContext(screen, ctx)
vm.runInContext(exposed, ctx)
vm.runInContext('render=()=>{};', ctx)

const api = ctx.NEW_MEDICORE_REVISIT
const hidden = ctx.__GOLDEN__
const O = vm.runInContext(
  `({parseFU, aragan, writtenDate, extractTx, extractSite, visitKind, baseDate, scheduleRows, undecidedRows, passFilters, pasteRows,
    setState(v, l, m, p){ visits = v; latestByChart = l; phoneMap = m; phoneLoaded = p; }})`,
  ctx,
)

// 화면 칸(원본이 document.getElementById로 읽는 값)
function setScreen({ includeCond = false, includePast = false, kind = '', from = '', to = '' } = {}) {
  node('condToggle').checked = includeCond
  node('pastToggle').checked = includePast
  node('kindSel').value = kind
  node('dFrom').value = from
  node('dTo').value = to
  node('search').value = ''
}

// ── 결과 글자로 ─────────────────────────────────────────

const isDate = (value) => Object.prototype.toString.call(value) === '[object Date]'
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Date → 'YYYY-MM-DD', 배열·객체는 같은 모양(null 원형 객체도 보통 객체로)
function plain(value) {
  if (isDate(value)) return ymd(value)
  if (Array.isArray(value)) return value.map(plain)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value)) out[key] = plain(value[key])
    return out
  }
  return value
}

function attempt(run) {
  try {
    return { result: plain(run()) }
  } catch (error) {
    return { throws: true, message: String(error && error.message) }
  }
}

const localDate = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))

// ── 가짜 자료 ───────────────────────────────────────────

const inputPath = (name) => `${FAKE}/${name}`
const readInput = (name) => {
  const bytes = readFileSync(join(ROOT, inputPath(name)))
  return { json: JSON.parse(bytes.toString('utf8')), input: { path: inputPath(name), sha256: createHash('sha256').update(bytes).digest('hex') } }
}
const cases = readInput('followup-cases.json')
const chart = readInput('chart-rows.json')
const rx = readInput('rx-rows.json')

const head = (entry, inputs, knownDiffs = []) => ({ source: SOURCE, file: FILE, entry, inputs, knownDiffs })

// ── 일부러 다르게 한 사례: 터무니없이 먼 날 ────────────────
// 원본은 해가 네 자리를 넘거나 NaN인 날짜도 그대로 찍는다. 우리는 그 말을 날짜를 주지 않은 것으로 치고 원본의 나머지 순서를 탄다.
// cases의 값은 그 사례에서 우리 함수가 내야 할 결과다. 우리 코드를 돌리지 않고 손으로 적는다(시험이 이 값과 견준다).

const FAR_REASON =
  '원본은 말이 안 되는 날짜(11609-06-18 (목), NaN-NaN-NaN (undefined))를 찍는다. 우리는 지어낸 날짜 대신 날짜 없음으로 둔다. 그 말은 날짜를 주지 않은 것으로 치고 원본의 나머지 순서를 그대로 탄다'
const NO_DATE = { dateStr: '', sortDate: null, kind: '', evidence: '' }
const dated = (date, yoil, kind, evidence) => ({ dateStr: `${date} (${yoil})`, sortDate: date, kind, evidence })
const FAR_PARSE = {
  'far-week-417000': NO_DATE,
  'far-week-500000': NO_DATE,
  'far-week-nan': NO_DATE,
  'far-week-infinity': NO_DATE,
  'far-days-date-like': NO_DATE,
  'far-days-2930000': NO_DATE,
  'far-tomorrow': NO_DATE,
  'far-day-after': NO_DATE,
  'far-one-week': NO_DATE,
  'far-next-week': NO_DATE,
  'far-next-week-short': NO_DATE,
  'far-weekday': NO_DATE,
  'far-written': NO_DATE,
  'far-aragan': NO_DATE,
  'far-round-kind': NO_DATE,
  'far-cond-no-return': NO_DATE,
  'far-then-tomorrow': dated('2026-10-16', '금', '예정', '500000주 뒤 내일 f/u'),
  'far-then-days': dated('2026-10-18', '일', '예정', '500000주 뒤 3일 뒤 f/u'),
  'far-then-weekday': dated('9999-12-31', '금', '예정', '다음주 월 금요일 f/u'),
  'far-then-written': dated('2026-10-19', '월', '예정', '500000주 뒤 10/19 f/u'),
  'far-then-month': { dateStr: '11월 초', sortDate: null, kind: '예정', evidence: '500000주 뒤 11월 초 재내원' },
  'far-then-later': { dateStr: '미정', sortDate: null, kind: '예정', evidence: '2930000일 뒤 추후 재내원' },
  'far-then-next-line': dated('2026-10-29', '목', '예정', '2주뒤 f/u'),
  'far-then-aragan': dated('2026-10-22', '목', '예정', '아라간 1차 → 1주뒤 2차주사 (자동)'),
  'far-then-cond': { dateStr: '미정', sortDate: null, kind: '조건부', evidence: '아프면 500000주 뒤 재내원' },
}
// 날짜 없음으로 둔 탓에 근거 글이 달라져 주사/F/U 구분도 따라 달라지는 사례
const FAR_KIND = { 'far-aragan': 'F/U', 'far-round-kind': 'F/U', 'far-then-aragan': '주사' }
const FAR_VISITS = {
  'ok-far-dates': {
    V2: NO_DATE,
    V3: NO_DATE,
    V4: NO_DATE,
    V5: NO_DATE,
    V6: NO_DATE,
    V7: NO_DATE,
    V8: NO_DATE,
    V9: { dateStr: '미정', sortDate: null, kind: '조건부', evidence: '아프면 500000주 뒤 재내원' },
    V10: dated('2026-10-22', '목', '예정', '2주뒤 f/u'),
  },
}

// ── followup-parse.json ─────────────────────────────────

const parse = {
  ...head(
    ['parseFU', 'aragan', 'visitKind', 'extractTx', 'extractSite', 'writtenDate'],
    [cases.input],
    [
      { entry: 'parseFU', field: 'parseFU', reason: FAR_REASON, cases: FAR_PARSE },
      { entry: 'aragan', field: 'aragan', reason: FAR_REASON, cases: { 'far-aragan': null } },
      { entry: 'visitKind', field: 'visitKind', reason: `${FAR_REASON}. 그래서 근거 글이 달라져 구분도 따라 달라진다`, cases: FAR_KIND },
      { entry: 'writtenDate', field: 'result', reason: FAR_REASON, cases: { 'far-next-year': null } },
    ],
  ),
  parse: cases.json.parse.map(({ id, visitDate, lines }) => {
    const next = O.parseFU(localDate(visitDate), lines)
    return {
      id,
      parseFU: plain(next),
      aragan: plain(O.aragan(localDate(visitDate), lines)),
      visitKind: O.visitKind({ next }),
      extractTx: O.extractTx(lines),
      extractSite: O.extractSite(lines),
    }
  }),
  written: cases.json.written.map(({ id, visitDate, month, day, before }) => ({
    id,
    result: plain(O.writtenDate(localDate(visitDate), month, day, before)),
  })),
}

// ── followup-schedule.json ──────────────────────────────

const chartRows = (id) => chart.json.cases.find((c) => c.id === id).rows
const rxRows = (id) => rx.json.cases.find((c) => c.id === id).rows

const prepare = chart.json.cases.map(({ id, rows }) => ({ id, ...attempt(() => api.prepareSchedule(rows)) }))

const VIEW_CHART = 'main'
const VIEW_PHONES = 'main'
const scheduled = api.prepareSchedule(chartRows(VIEW_CHART))
const phones = api.preparePhones(rxRows(VIEW_PHONES))
O.setState(scheduled.visits, scheduled.latest, phones.map, phones.loaded)
const base = ymd(O.baseDate())

const schedule = []
for (const includePast of [false, true]) {
  for (const includeCond of [false, true]) {
    setScreen({ includeCond, includePast })
    schedule.push({ includeCond, includePast, rows: plain(O.scheduleRows()) })
  }
}
schedule.sort((a, b) => Number(a.includePast) - Number(b.includePast) || Number(a.includeCond) - Number(b.includeCond))

const week = (n) => ymd(new Date(localDate(base).getTime() + n * 86400000 + 3600000))
const ranges = [
  ['', ''],
  [base, week(7)],
  [week(3), ''],
  ['', week(5)],
]
const passFilters = []
for (const kind of ['', '주사', 'F/U']) {
  for (const [from, to] of ranges) {
    for (const useDate of [true, false]) {
      setScreen({ kind, from, to })
      const charts = Object.values(scheduled.latest)
        .filter((v) => O.passFilters(v, useDate))
        .map((v) => v.chart)
      passFilters.push({ kind, from, to, useDate, charts })
    }
  }
}

const paste = []
const pasteCombos = []
for (const withDate of [false, true]) {
  for (const [from, to] of [
    ['', ''],
    [week(-12), week(4)],
  ]) {
    for (const book of ['main', 'none']) pasteCombos.push({ includeCond: false, includePast: true, kind: '', from, to, withDate, phones: book })
  }
}
pasteCombos.push(
  { includeCond: false, includePast: false, kind: '', from: '', to: '', withDate: true, phones: 'main' },
  { includeCond: true, includePast: false, kind: '주사', from: '', to: '', withDate: true, phones: 'main' },
  { includeCond: true, includePast: true, kind: 'F/U', from: '', to: '', withDate: false, phones: 'main' },
  { includeCond: false, includePast: true, kind: '', from: '', to: week(-5), withDate: true, phones: 'none' },
)
for (const combo of pasteCombos) {
  if (combo.phones === 'main') O.setState(scheduled.visits, scheduled.latest, phones.map, phones.loaded)
  else O.setState(scheduled.visits, scheduled.latest, {}, false)
  setScreen(combo)
  paste.push({ ...combo, rows: plain(O.pasteRows(combo.withDate)) })
}
O.setState(scheduled.visits, scheduled.latest, phones.map, phones.loaded)

const scheduleGolden = {
  ...head(
    ['dateKey', 'recordedStamp', 'prepareSchedule', 'baseDate', 'visitKind', 'scheduleRows', 'undecidedRows', 'passFilters', 'pasteRows'],
    [chart.input, rx.input],
    [
      { entry: 'prepareSchedule', field: 'visits[].next·latest[].next', reason: FAR_REASON, cases: FAR_VISITS },
      {
        entry: 'prepareSchedule',
        field: 'row.nmRecordedAt',
        reason:
          '원본은 파일을 고를 때(selectWorkbook) 표 줄에 붙여 둔 row.nmRecordedAt을 먼저 본다. 우리 표 줄은 도우미가 주는 JSON 배열이라 그 값이 없어 기록날짜 칸에서 바로 읽는다',
      },
      {
        entry: 'baseDate',
        field: '자료가 없을 때',
        reason: "원본은 자료가 없으면 오늘(new Date())을 돌려준다. '오늘'을 계산 안에서 부르지 않는 규칙이고 자료가 없으면 명단도 없어서 우리는 ''를 돌려준다",
      },
    ],
  ),
  dateKey: chart.json.dateCells.map((raw) => ({ raw, result: api.dateKey(raw) })),
  recordedStamp: chart.json.dateCells.map((raw) => ({ raw, result: api.recordedStamp(raw) })),
  prepare,
  views: {
    chart: VIEW_CHART,
    phones: VIEW_PHONES,
    base,
    visitKind: scheduled.visits.map((v) => ({ visitNo: v.visitNo, chart: v.chart, kind: O.visitKind(v) })),
    schedule,
    undecided: plain(O.undecidedRows()),
    passFilters,
    paste,
  },
}

// 작은 표로 짚는 scheduleRows: 기준 날짜 경계·차트번호 순서. 위 결과를 다 만든 뒤에 화면 상태를 바꾼다
scheduleGolden.scheduleViews = ['ok-base-boundary', 'ok-chart-tie-break'].map((id) => {
  const table = api.prepareSchedule(chartRows(id))
  O.setState(table.visits, table.latest, {}, false)
  const rows = []
  for (const includePast of [false, true]) {
    for (const includeCond of [false, true]) {
      setScreen({ includeCond, includePast })
      rows.push({ includeCond, includePast, rows: plain(O.scheduleRows()) })
    }
  }
  return { chart: id, base: ymd(O.baseDate()), schedule: rows }
})

// ── followup-phones.json · phone-columns.json ───────────

const phonesGolden = {
  ...head(
    ['preparePhones', 'phoneTokens'],
    [rx.input],
    [
      {
        entry: 'preparePhones',
        field: 'contacts',
        reason:
          '번호가 여러 개인 차트의 후보 목록(원본 화면에서 번호를 직접 고르는 곳)이다. 명단은 map(번호 하나인 차트)만 쓰므로 옮기지 않았다. 여러 번호를 화면에 내보내지 않으려는 것',
      },
      {
        entry: 'preparePhones',
        field: 'diagnostics',
        reason: '원본 화면의 안내 문구용 숫자(찾은 칸 이름·못 읽은 칸 수)다. 우리 화면은 이 문구를 쓰지 않아 옮기지 않았다',
      },
    ],
  ),
  prepare: rx.json.cases.map(({ id, rows, allowMissing }) => ({
    id,
    allowMissing: Boolean(allowMissing),
    ...attempt(() => api.preparePhones(rows, Boolean(allowMissing))),
  })),
  tokens: rx.json.tokens.map((raw) => ({ raw, result: plain(hidden.phoneTokens(raw)) })),
}

const columnsGolden = {
  ...head(['phoneColumn'], [rx.input]),
  cases: rx.json.columns.map((header) => ({ header, result: hidden.phoneColumn(header) })),
}

// ── 쓰기 ────────────────────────────────────────────────

mkdirSync(join(ROOT, OUT), { recursive: true })
for (const [name, value] of [
  ['followup-parse.json', parse],
  ['followup-schedule.json', scheduleGolden],
  ['followup-phones.json', phonesGolden],
  ['phone-columns.json', columnsGolden],
]) {
  const path = join(ROOT, OUT, name)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
  console.log(relative(ROOT, path))
}
