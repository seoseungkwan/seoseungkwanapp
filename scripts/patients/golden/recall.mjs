// 원본 양지바른(seoseungkwan/shared@2a1069b, README 1.24.5)의 정기 주사 계산(revisit_schedule.html, tools/revisit_source_boot.js와 같은 코드)을
// node:vm으로 돌려 가짜 자료(fixtures/patients/fake/recall-cases.json)의 결과를 골든 파일(fixtures/patients/golden/recall-*.json)로 쓴다.
//
//   node scripts/patients/golden/recall.mjs "$YANGJI_SRC"     (YANGJI_SRC = …/YangjiBareun_사전점검)
//
// 원본은 저장소 밖에 둔다. 이 스크립트는 원본 파일을 읽기만 하고 저장소에는 결과만 쓴다.
// 돌리는 방식은 revisit.mjs·원본 시험 tests/test_revisit_source.py와 같다. 원본 함수 몸통은 고치지 않는다.
// 바깥으로 내놓지 않은 status·coverageNote·KEEP_MONTHS·MAX_RECORDS와 history·rules 칸만 내놓는 자리에서 한 줄로 꺼낸다.
// [명단 복사]·[번호 복사]는 원본 클릭 처리기를 그대로 부른다(copyText·toast만 받아 적는다).
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
const INPUT = 'fixtures/patients/fake/recall-cases.json'
const OUT = 'fixtures/patients/golden'

function fail(message) {
  console.error(message)
  process.exit(1)
}

const src = process.argv[2] || process.env.YANGJI_SRC
if (!src) fail('원본 폴더가 필요합니다: node scripts/patients/golden/recall.mjs "$YANGJI_SRC"')
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

const ANCHOR = 'Object.defineProperty(window,"NEW_MEDICORE_RECALL"'
if (revisitImport.split(ANCHOR).length !== 2) fail('원본에서 NEW_MEDICORE_RECALL 내놓는 자리를 하나로 찾지 못했습니다.')
const exposed = revisitImport.replace(
  ANCHOR,
  `window.__GOLDEN__={status,coverageNote,KEEP_MONTHS,MAX_RECORDS,setRecall(h,r){history=h;rules=r;}};${ANCHOR}`,
)

// 원본 $()는 nodeType이 1인 칸만 받는다. nmRecall* 칸이 있어야 복사 처리기가 달린다
const nodes = new Map()
function node(id) {
  if (id === 'nmImport') return null
  if (!nodes.has(id)) {
    const listeners = {}
    nodes.set(id, {
      nodeType: String(id).startsWith('nmRecall') ? 1 : undefined,
      id,
      value: '',
      checked: false,
      type: 'text',
      textContent: '',
      innerHTML: '',
      style: {},
      className: '',
      dataset: {},
      listeners,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, handler) {
        ;(listeners[type] ??= []).push(handler)
      },
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
  __OUT__: [],
}
ctx.window = ctx
vm.createContext(ctx)
vm.runInContext(sheetjs, ctx)
vm.runInContext(screen, ctx)
vm.runInContext('copyText=(text,label)=>{__OUT__.push({text,label});};toast=(message)=>{__OUT__.push({toast:message});};', ctx)
vm.runInContext(exposed, ctx)
vm.runInContext('render=()=>{};', ctx)

const R = ctx.NEW_MEDICORE_RECALL
const api = ctx.NEW_MEDICORE_REVISIT
const hidden = ctx.__GOLDEN__
const setPhones = vm.runInContext('(m,p)=>{phoneMap=m;phoneLoaded=p;}', ctx)

// [명단 복사]·[번호 복사]: 기간 칸을 비우면 원본 current()가 compute 전체를 돌려준다
node('nmRecallFrom').value = ''
node('nmRecallTo').value = ''
node('nmRecallOverdue').checked = true
function click(id) {
  ctx.__OUT__.length = 0
  for (const handler of node('nmRecall').listeners.click) handler({ target: { id, matches: () => false } })
  if (ctx.__OUT__.length !== 1) fail(`[${id}] 결과가 하나가 아닙니다(${ctx.__OUT__.length}개).`)
  return ctx.__OUT__[0]
}

// ── 결과 글자로 ─────────────────────────────────────────

const isDate = (value) => Object.prototype.toString.call(value) === '[object Date]'
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

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
const localDateOrNull = (s) => (s ? localDate(s) : null)
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

// ── 가짜 자료 ───────────────────────────────────────────

const inputBytes = readFileSync(join(ROOT, INPUT))
const cases = JSON.parse(inputBytes.toString('utf8'))
const input = { path: INPUT, sha256: sha256(inputBytes) }
const head = (entry, knownDiffs = []) => ({ source: SOURCE, file: FILE, entry, inputs: [input], knownDiffs })

// fixtures/patients/make-fake-patients.ts recallBulkRecords와 같은 계산(시험이 sha256으로 같은지 본다)
const DAY_MS = 86_400_000
const plusDays = (ymdText, n) =>
  new Date(Date.UTC(+ymdText.slice(0, 4), +ymdText.slice(5, 7) - 1, +ymdText.slice(8, 10)) + n * DAY_MS).toISOString().slice(0, 10)
function bulkRecords({ start, span, firstChart }, count) {
  const records = []
  for (let i = 0; i < count; i++) {
    records.push({
      chart: String(firstChart + i),
      name: `가상환자${String(i % 100).padStart(2, '0')}`,
      date: plusDays(start, i % span),
      codes: ['A32'],
      text: '비타민D',
      phone: `010-0000-${String(i % 10_000).padStart(4, '0')}`,
    })
  }
  return records
}

const rxShape = (map) => [...map].map(([key, codes]) => [key, [...codes]])
const pieceOf = (chart, rx) => ({
  visits: chart ? api.prepareSchedule(chart).visits : [],
  rx: rx ? api.prepareRx(rx) : new Map(),
  phones: rx ? api.preparePhones(rx, true).map : {},
})

// ── 일부러 다르게 한 것. cases의 값은 그 사례에서 우리 함수가 내야 할 결과다 ──────────
// 우리 코드를 돌리지 않고 손으로 적는다(시험이 이 값과 견준다).

const READ_THROUGH = '우리는 달 조각으로 읽어 마지막 읽은 날을 기억한다. 원본에는 없는 칸이다. 이상한 값(날짜가 아니거나 없음)은 처음 읽는 것(null)으로 친다 — 원본이 멈추지 않는 칸이라 멈추지 않는다'
const VALIDATE_READ_THROUGH = {
  'ok-empty': null,
  'ok-from': null,
  'ok-read-through': '2026-10-31',
  'ok-read-through-null': null,
  'ok-read-through-broken': null,
  'ok-read-through-not-text': null,
  'ok-read-through-year-0999': null,
  'ok-from-year-1000': null,
  'ok-extra-fields-dropped': null,
  'ok-field-limits': null,
  'ok-code-limits': null,
  'ok-empty-text-phone': null,
  'ok-chart-constructor': null,
  'ok-date-year-1000': null,
  'ok-date-year-9999': null,
  'ok-bad-records-dropped': null,
}
// max(전 값, 읽은 끝)
const INGEST_READ_THROUGH = {
  'first-read': '2026-04-30',
  'code-on-other-day': '2026-04-30',
  'chart-forms': '2026-04-30',
  'reread-period': '2026-05-31',
  'reread-no-visits': '2026-04-30',
  'phone-changed': '2026-04-30',
  'keep-limit': '2026-10-17',
  'keep-limit-month-end': '2026-05-31',
  'keep-limit-leap-day': '2024-02-29',
  'from-keeps-earlier': '2026-03-31',
  'from-moves-earlier': '2026-03-31',
  'from-same': '2026-03-31',
  'from-before-limit': '2020-01-31',
  'from-at-limit': '2023-10-31',
  'equal-date-order': '2026-05-31',
  'visit-outside-period': '2026-04-30',
  'odd-chart': '2026-04-30',
  'long-fields': '2026-04-30',
  'odd-years': '2000-12-31',
  'codes-arg': '2026-04-30',
  'no-codes': '2026-04-30',
  'no-phone-column': '2026-04-30',
}
const BULK_READ_THROUGH = { 'over-limit': '2026-10-31', 'at-limit': '2026-10-31' }

const FAR_REASON =
  '원본은 예정일의 해가 네 자리를 넘으면 말이 안 되는 날짜(10000-06-30)를 그대로 찍고, 쌓인 기록의 날짜를 못 읽으면 TypeError로 명단 전체가 멈춘다. F/U(followup.ts)와 같이 쓸 수 없는 날은 날짜 없음으로 친다: 예정일이 없으면 명단에 넣을 수 없으니 그 환자의 그 줄만 빼고 나머지 명단은 그대로 낸다. 쌓인 기록을 validateHistory로 읽으면 못 읽는 날짜는 이미 빠져 있어, 멈추는 쪽은 validateHistory를 거치지 않은 자료에서만 생긴다'
const FAR_NAME = (i) => `가상환자${i}`
const FAR_CHART = (i) => `9000${i}`
const item = (ruleId, label, months, i, last, due, evidence) => ({
  ruleId,
  label,
  months,
  chart: FAR_CHART(i),
  name: FAR_NAME(i),
  phone: '',
  last,
  due,
  evidence,
})
const FAR_ITEMS = {
  'far-dates': [
    item('cartilage', '연골주사', 6, 48, '2026-04-15', '2026-10-15', '아라간 3차'),
    item('vitamin-d', '비타민D', 3, 45, '9999-09-30', '9999-12-30', '비타민D'),
    item('cartilage', '연골주사', 6, 43, '9999-06-30', '9999-12-30', '아라간 3차'),
  ],
  'bad-dates': [
    item('vitamin-d', '비타민D', 3, 57, '2026-07-10', '2026-10-10', '비타민D'),
    item('cartilage', '연골주사', 6, 51, '2026-04-15', '2026-10-15', '아라간 3차'),
  ],
}

const NOBODY_LINES = '원본은 사람이 없으면 복사 없이 안내(toast)만 띄운다. 우리는 빈 글을 돌려주고 안내는 화면이 한다'
const NOBODY_PHONES =
  '원본은 번호가 하나도 없으면 복사 없이 안내(toast)만 띄우고 번호 없는 사람 수를 알리지 않는다. 우리는 늘 같은 모양으로 돌려주고 안내는 화면이 한다'

// ── recall-ingest.json ──────────────────────────────────

const bulk = cases.bulk
const bulkHistory = (count) => ({ from: bulk.start, records: bulkRecords(bulk, count) })
const summary = ({ from, records }) => ({
  from,
  count: records.length,
  first: records.slice(0, 3),
  last: records.slice(-3),
  sha256: sha256(JSON.stringify(records)),
})
const bulkValidate = (count) => {
  const outcome = attempt(() => R.validateHistory(bulkHistory(count)))
  return 'throws' in outcome ? { count, ...outcome } : { count, result: summary(outcome.result) }
}
const bulkIngest = (id, chart, rx) => ({
  id,
  result: summary(
    plain(
      R.ingest(bulkHistory(bulk.counts.atLimit), {
        ...pieceOf(chart, rx),
        from: bulk.from,
        to: bulk.to,
        codes: bulk.codes,
        today: localDate(bulk.today),
      }),
    ),
  ),
})

const ingestGolden = {
  ...head(
    ['KEEP_MONTHS', 'MAX_RECORDS', 'prepareRx', 'validateHistory', 'ingestRecall'],
    [
      { entry: 'validateHistory', field: 'readThrough', reason: READ_THROUGH, cases: VALIDATE_READ_THROUGH },
      { entry: 'ingestRecall', field: 'readThrough', reason: READ_THROUGH, cases: { ...INGEST_READ_THROUGH, ...BULK_READ_THROUGH } },
      {
        entry: 'ingestRecall',
        field: 'phones의 객체 원형',
        reason:
          '원본은 보통 객체({})를 받으면 차트번호 constructor의 전화 칸에 함수 글자를 쓴다. 우리는 그 표의 값만 읽는다. preparePhones가 만드는 표(원형 없음)에서는 원본과 같아 골든 결과는 같다',
      },
    ],
  ),
  limits: { KEEP_MONTHS: hidden.KEEP_MONTHS, MAX_RECORDS: hidden.MAX_RECORDS },
  rx: cases.rx.map(({ id, rows }) => {
    try {
      return { id, result: rxShape(api.prepareRx(rows)) }
    } catch (error) {
      return { id, throws: true, message: String(error && error.message) }
    }
  }),
  validate: cases.validate.map(({ id, value }) => ({ id, ...attempt(() => R.validateHistory(value)) })),
  ingest: cases.ingest.map(({ id, today, codes, from, to, history, chart, rx }) => ({
    id,
    result: plain(
      R.ingest(
        { from: history.from, records: history.records },
        { ...pieceOf(chart, rx), from, to, codes, today: localDate(today) },
      ),
    ),
  })),
  bulk: {
    validate: [bulkValidate(bulk.counts.atLimit), bulkValidate(bulk.counts.overLimit)],
    ingest: [bulkIngest('over-limit', bulk.chart, bulk.rx), bulkIngest('at-limit', null, null)],
  },
}

// ── recall-compute.json ─────────────────────────────────

const main = cases.compute.find((c) => c.id === 'main')
const mainItems = R.compute(main.records, R.DEFAULTS)

const computeGolden = {
  ...head(
    ['RECALL_DEFAULTS', 'roundTest', 'addMonthsToDay', 'recallCompute', 'recallSelect', 'recallStatus'],
    [{ entry: 'recallCompute', field: 'result', reason: FAR_REASON, cases: FAR_ITEMS }],
  ),
  defaults: plain(R.DEFAULTS),
  roundTest: cases.round.map(({ round, text }) => ({ round, text, result: R.roundTest(round)(text) })),
  addMonths: cases.addMonths.map(({ date, months }) => ({ date, months, result: ymd(R.addMonths(localDate(date), months)) })),
  compute: cases.compute.map(({ id, rules, records }) => ({ id, ...attempt(() => R.compute(records, rules ?? R.DEFAULTS)) })),
  select: cases.select.map(({ from, to, overdue, today }) => ({
    from,
    to,
    overdue,
    today,
    items: R.select(mainItems, localDateOrNull(from), localDateOrNull(to), overdue, localDate(today)).map((i) => ({
      ruleId: i.ruleId,
      chart: i.chart,
      due: ymd(i.due),
    })),
  })),
  status: cases.status.map((today) => ({
    today,
    items: mainItems.map((i) => ({ ruleId: i.ruleId, chart: i.chart, status: hidden.status(i, localDate(today)) })),
  })),
}

// ── recall-coverage.json ────────────────────────────────

// 원본은 안내 글 하나를 돌려준다. 판정(건수·시작 날짜·짧은 규칙)만 글에서 꺼낸다
function verdict(note) {
  const m = /^쌓인 기록 (\d+)건(?: \((.+?)부터\))? · (.*)$/s.exec(note)
  if (!m) fail('원본 coverageNote 글 모양이 다릅니다.')
  const tail = m[3]
  if (tail.startsWith('통계를 가져올 때마다')) return { records: Number(m[1]), from: m[2] ?? null, short: [] }
  const list = tail.split('은 그보다 오래전에')
  if (list.length !== 2) fail('원본 coverageNote 글 모양이 다릅니다.')
  const short = list[0].split(' · ').map((part) => {
    const rule = /^(.*)\((\d+)개월\)$/.exec(part)
    if (!rule) fail('원본 coverageNote 글 모양이 다릅니다.')
    return { label: rule[1], months: Number(rule[2]) }
  })
  return { records: Number(m[1]), from: m[2] ?? null, short }
}

const coverageGolden = {
  ...head(
    ['recallCoverage'],
    [{ entry: 'recallCoverage', field: '안내 글', reason: '원본은 안내 글을 돌려준다. 문구는 화면이 우리 말로 만들고 여기서는 판정(건수·시작 날짜·짧은 규칙)만 돌려준다' }],
  ),
  cases: cases.coverage.map(({ id, today, rules, history }) => {
    hidden.setRecall(history, rules ?? R.DEFAULTS)
    return { id, result: verdict(hidden.coverageNote(localDate(today))) }
  }),
}

// ── recall-copy.json ────────────────────────────────────

function linesOf(outcome) {
  if ('toast' in outcome) return { copied: null, people: 0, toast: outcome.toast }
  const m = /^정기 주사 명단 (\d+)명 복사됨$/.exec(outcome.label)
  if (!m) fail('원본 [명단 복사] 안내 모양이 다릅니다.')
  return { copied: outcome.text, people: Number(m[1]) }
}
function phonesOf(outcome) {
  if ('toast' in outcome) return { copied: null, toast: outcome.toast }
  const m = /^번호 (\d+)개 복사됨(?: · 번호 없음 (\d+)명)?$/.exec(outcome.label)
  if (!m) fail('원본 [번호 복사] 안내 모양이 다릅니다.')
  return { copied: outcome.text, count: Number(m[1]), missing: Number(m[2] ?? 0) }
}

const copyGolden = {
  ...head(
    ['recallCopyLines', 'recallPhones'],
    [
      { entry: 'recallCopyLines', field: 'copied', reason: NOBODY_LINES, cases: { empty: '' } },
      {
        entry: 'recallPhones',
        field: 'copied·count·missing',
        reason: NOBODY_PHONES,
        cases: { empty: { text: '', count: 0, missing: 0 }, 'all-missing': { text: '', count: 0, missing: 2 } },
      },
    ],
  ),
  cases: cases.copy.map(({ id, records, rx }) => {
    const book = rx ? api.preparePhones(rx, true) : { map: {}, loaded: false }
    setPhones(book.map, book.loaded)
    hidden.setRecall({ from: null, records }, R.DEFAULTS)
    return { id, loaded: book.loaded, lines: linesOf(click('nmRecallCopy')), phones: phonesOf(click('nmRecallPhones')) }
  }),
}

// ── 쓰기 ────────────────────────────────────────────────

mkdirSync(join(ROOT, OUT), { recursive: true })
for (const [name, value] of [
  ['recall-ingest.json', ingestGolden],
  ['recall-compute.json', computeGolden],
  ['recall-coverage.json', coverageGolden],
  ['recall-copy.json', copyGolden],
]) {
  const path = join(ROOT, OUT, name)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
  console.log(relative(ROOT, path))
}
