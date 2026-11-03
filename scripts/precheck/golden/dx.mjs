// 추천 상병·상병 확인 골든 만들기(TASK-11, design.md 10절). 원본 스크립트를 node:vm에서 가짜 자료로 돌려 결과를 적는다.
// 쓰는 법: node scripts/precheck/golden/dx.mjs --src "$YANGJI_SRC" [--fake fixtures/precheck/fake] [--out fixtures/precheck/golden]
// 원본은 저장소 밖에 둔다(seoseungkwan/shared@2a1069b). 이 스크립트는 골든을 다시 만들 때만 돌고, 시험과 앱은 원본 없이 돈다
// 스크립트 꺼내기·전역 값 채우기는 원본 시험(tests/test_claim_html.py, test_claim_dx_recommend.py)과 같다
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

const FILE = 'assets/mx999_v22.html'
const FAKE_FILE = 'claim-month-dx-check.json'

function args() {
  const out = { src: process.env.YANGJI_SRC ?? '', fake: 'fixtures/precheck/fake', out: 'fixtures/precheck/golden' }
  const list = process.argv.slice(2)
  for (let i = 0; i < list.length; i += 2) {
    const key = list[i].replace(/^--/, '')
    if (!Object.hasOwn(out, key) || list[i + 1] === undefined) throw new Error(`모르는 인자: ${list[i]}`)
    out[key] = list[i + 1]
  }
  if (!out.src) throw new Error('원본 폴더가 필요하다: --src 또는 YANGJI_SRC')
  return out
}

// ── 사례 ────────────────────────────────────────────────

const HA_NAME = '가상플러스주(히알루론산나트륨)(프리필드시린지)_(20mg/2mL)'

/** 원본 snapshot.rules 모양. 우선순위가 부딪히는 줄을 일부러 넣었다 */
const LINKS = [
  ['G6604', 'S6350', '수근(관절)의 염좌 및 긴장(가상)', 0, 't'],
  ['G6604', 'M1991', '', 1, 's'],
  ['g6604', 'S6350', '뒤에 온 같은 줄(가상)', 1, 's'], // 처방·상병이 같으면 앞 줄이 이긴다
  ['AA17', 'M1390', '', 0, 't'],
  ['AB17', 'M1998', '연결표의 M1998 이름(가상)', 0, 't'],
  ['MM410', 'M750', '연결표의 M750 이름(가상)', 1, 't'], // 고시와 같은 상병
  ['MM410', 'M751', '', 0, 'r'],
  ['A49', 'M2556', '연결표의 M2556 이름(가상)', 0, 's'], // 경향과 같은 상병
  ['A49', 'M17', '연결표의 M17 이름(가상)', 1, 'r'], // 고시가 먼저라 무시된다
  ['G3304', 'G3304', '', 0, 't'], // 상병=처방코드인 줄은 뺀다
  ['LA358', 'M5456', '', 0, 't'], // 경향에서 흔한 상병(l=149)이라도 연결표에 있으면 추천에 남는다
  ['AB17', 'M1000', '연결표의 M1000 이름(가상)', 0, 't'], // ZZ001 경향의 M1000은 이름이 비어 이 이름을 쓴다
]

/** 기록 규칙(r)만 있는 처방. 앞 줄이 연결표(t)면 같은 상병의 기록 줄은 무시된다 */
const RECORD_LINKS = [
  ['D7813', 'M79', '이미 있는 연결표 줄(가상)', 0, 't'],
  ['LA358', 'M54', '요통/ 요천부(가상)', 0, 'r'],
  ['LA358', 'M51', '추간판(가상)', 0, 'r'],
  ['D7813', 'M79', '류마티스(가상)', 1, 'r'],
]

const SCENARIOS = [
  { name: 'trend-links', acs: 'AC-011.1 AC-011.2 AC-011.3', trend: true, hasDx: true, links: LINKS, memoVisits: ['d17'] },
  { name: 'trend-only', acs: 'AC-011.1 AC-011.2', trend: true, hasDx: true, links: [], memoVisits: [] },
  { name: 'links-only', acs: 'AC-011.3 AC-011.4', trend: false, hasDx: true, links: LINKS, memoVisits: [] },
  { name: 'no-trend-no-links', acs: 'AC-011.4', trend: false, hasDx: true, links: [], memoVisits: [] },
  { name: 'record-links', acs: 'AC-011.2 AC-011.3', trend: true, hasDx: true, links: RECORD_LINKS, memoVisits: [] },
  { name: 'no-dx-data', acs: 'AC-011.2', trend: true, hasDx: false, links: LINKS, memoVisits: ['d17'] },
]

const RECOMMEND = [
  ['A49', HA_NAME],
  ['a49', HA_NAME],
  ['A49', '가상플러스주'],
  ['Z1', '가상 히알루론산나트륨 점안액'],
  ['X99', '비급여 히알루론산 주사'],
  ['X98', '가상 히알루론산 겔'],
  ['MM410', ''],
  ['mm410', '수압팽창술'],
  ['G6604', '수근골4매'],
  ['AA17', ''],
  ['AB17', ''],
  ['LA358', '후지내측지'],
  ['D7813', 'RA factor'],
  ['ZZ001', ''],
  ['ZZ002', ''],
  ['NONE99', '없는 처방'],
]

const LINK_ROWS_REJECTED = [
  [['G6604', 'S6350', '', 2, 't']],
  [['G6604', 'bad', '', 0, 't']],
  [['G6604', 'S6350', '', 0, 'x']],
  [['G 6604', 'S6350', '', 0, 't']],
  [['G6604', 'S6350', 1, 0, 't']],
  [['G6604', 'S6350', '', 0]],
  [{ rx: 'G6604' }],
  [['', 'S6350', '', 0, 't']], // 처방코드 길이: 1~20자
  [['A'.repeat(21), 'S6350', '', 0, 't']],
  [['G6604', 'M1', '', 0, 't']], // 상병코드 길이: 3~8자
  [['G6604', 'M12345678', '', 0, 't']],
  [['G6604', 'S6350', '', 0, 't', 9]], // 칸은 꼭 5개
  [[123, 'S6350', '', 0, 't']], // 처방코드는 글자만
  [['G6604', 'S6350', '', 0, 'constructor']], // 출처는 s·t·r만(객체가 물려받은 이름도 안 된다)
]
const LINK_ROWS_ACCEPTED = [
  [['g6604', 'S6350', 'x'.repeat(100), 1, 's'], ['G3304', 'G3304', '', 0, 't'], ['G3304', 'M1991', '', 0, 'r']],
  LINKS,
  [],
  [['A'.repeat(20), 'M17', '', 0, 't'], ['가1_.-', 'M1234567', 'x'.repeat(80), 1, 'r']], // 길이 끝값
  [['A', 'M17', '', 0, 't'], ['G6604', 'M54X', '', 0, 't']], // 처방코드 한 글자, 상병코드 안의 영문
]
const LINK_LIMIT = 5000

/** knownDiffs가 드러나는 사례. 원본 결과를 적고, 그 상병 줄의 이름이 우리는 ours다 */
const KNOWN_DIFF_CASES = [
  // M6601은 진료가 되지 않는 내원 d38의 상병 표에만 있다. 처방 ZZ003 경향에는 이름이 없다
  { where: 'nameMap의 상병내역', scenario: 'trend-links', code: 'ZZ003', name: '', dx: 'M6601', ours: '' },
]

const KNOWN_DIFFS = [
  {
    where: 'recommend·issues의 src',
    why: '원본은 Set, 우리는 넣은 차례의 배열이다. 화면으로 넘기기 쉽게 하려고. 이 골든은 Set을 배열로 적었다',
  },
  {
    where: 'nameMap의 상병내역',
    why: '원본은 상병내역 표 전체(진료가 안 된 내원 포함)에서 이름을 찾고, 우리는 ClaimMonth.visits의 상병에서 찾는다. ClaimMonth에 표 전체가 남지 않는다. 진료가 안 된 내원에만 있는 코드는 경향·연결표에도 이름이 없을 때 이름이 빈다(knownDiffCases). 경고 판단에는 영향이 없다',
  },
  {
    where: 'nameMap의 이름 차례',
    why: '한 상병코드에 이름이 둘이고 83D 표 차례가 진료 차례와 다르면, 원본은 표에서 먼저 나온 이름을, 우리는 먼저 오는 진료의 이름을 보여 준다. 보여 주는 이름만 다르고 경고 판단에는 영향이 없다',
  },
  {
    where: 'missingDx의 v.memos',
    why: '원본은 buildMemo 결과를 본다. 우리는 Visit에 메모가 없어 hasMemo로 받는다. 이 골든은 memoVisits의 진료에 메모가 있다고 두고 양쪽에 같은 값을 넣었다',
  },
]

// ── 원본 돌리기 ─────────────────────────────────────────

function scriptOf(html, id) {
  const found = new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(html)
  if (!found) throw new Error(`원본에 스크립트가 없다: ${id}`)
  return found[1]
}

/** 표 줄(한글 칸 이름) → 시트 줄. 원본 NEW_MEDICORE_DIAGNOSES.parse가 XLSX로 읽는 모양 */
function gridOf(rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  return [headers, ...rows.map((row) => headers.map((key) => row[key] ?? ''))]
}

/** 83 표 → 원본 VISITS(증상 있는 내원만, 표 차례) */
function visitsOf(json, memoVisits) {
  const visits = new Map()
  for (const row of json.s83) {
    const content = (row['증상'] ?? '').trim()
    if (!content) continue
    const id = row['내원번호']
    if (!visits.has(id)) visits.set(id, { id, chart: row['차트번호'], date: row['기록날짜'], name: row['환자명'], memos: memoVisits.includes(id) ? [{ rg: 'fake' }] : [] })
  }
  return [...visits.values()]
}

/** 47 표 → 원본 RXDATA('C차트|날짜' → 처방 줄) */
function rxDataOf(json) {
  const out = {}
  for (const row of json.s47) {
    const chart = (row['차트번호'] ?? '').trim()
    if (!chart) continue
    const pay = row['급여구분'] ?? ''
    const line = { code: row['처방코드'], name: row['처방명칭'], qty: Number(row['수량']), benefit: !/비급여/.test(pay), pay }
    const key = `C${chart}|${row['처방일자']}`
    ;(out[key] ??= []).push(line)
  }
  return out
}

/** 도우미 상병 추세 JSON → 원본 readTrend가 읽는 줄 모양 */
function packTrend(json) {
  const { dxTrend, trendRange } = json
  return {
    from: trendRange.from,
    to: trendRange.to,
    visits: dxTrend.visits,
    at: '',
    codes: dxTrend.codes.map((entry) => [entry.c, entry.n, entry.d.map((d) => [d.c, d.nm, d.m, d.s, d.x, d.l])]),
    suggestions: dxTrend.suggestions.map((s) => [s.c, s.n, s.k, s.miss, s.g.map((g) => [g.c, g.nm, g.k, g.x])]),
  }
}

/** 원본 결과 → JSON(원본 src는 Set) */
const plain = (value) => JSON.parse(JSON.stringify(value, (_, x) => (x instanceof Set ? [...x] : x)))

function newContext(html, json, scenario) {
  const document = { getElementById: () => null, querySelector: () => null }
  const ctx = { console, Date, Map, Set, Error, Promise, Object, Array, Number, String, JSON, Math, RegExp, document }
  ctx.window = ctx
  const grid = gridOf(json.s83d)
  ctx.XLSX = { read: () => ({ SheetNames: ['상병내역'], Sheets: { 상병내역: grid } }), utils: { sheet_to_json: (sheet) => sheet } }
  vm.createContext(ctx)
  ctx.curId = null
  ctx.RXDATA = rxDataOf(json)
  ctx.VISITS = visitsOf(json, scenario.memoVisits)
  ctx.rxOf = (v) => ctx.RXDATA[`C${v.chart}|${v.date}`] || []
  for (const id of ['new-medicore-diagnoses', 'new-medicore-dx-recommend']) vm.runInContext(scriptOf(html, id), ctx)
  return ctx
}

function runScenario(html, json, scenario) {
  const ctx = newContext(html, json, scenario)
  const D = ctx.NEW_MEDICORE_DIAGNOSES
  const R = ctx.NEW_MEDICORE_DX_RECOMMEND
  D.set(scenario.hasDx ? D.parse('가짜').map : null)
  R.restore({ schema: 1, rules: scenario.links, trend: scenario.trend ? packTrend(json) : null })
  return {
    ...scenario,
    recommend: RECOMMEND.map(([code, name]) => ({ code, name, out: plain(R.recommend(code, name)) })),
    visits: ctx.VISITS.map((v) => ({
      id: v.id,
      issues: plain(R.issues(v)),
      needsCheck: R.needsCheck(v),
      missingDx: R.missingDx(v),
    })),
  }
}

/** 원본 restore → snapshot으로 연결표 읽기. 틀리면 원본이 던진다 */
function linkRows(html, json) {
  const R = newContext(html, json, { memoVisits: [] }).NEW_MEDICORE_DX_RECOMMEND
  const rejected = LINK_ROWS_REJECTED.map((rows) => {
    try {
      R.restore({ schema: 1, rules: rows, trend: null })
    } catch {
      return rows
    }
    throw new Error(`원본이 받은 줄을 거절 사례로 적었다: ${JSON.stringify(rows)}`)
  })
  const accepted = LINK_ROWS_ACCEPTED.map((rows) => {
    R.restore({ schema: 1, rules: rows, trend: null })
    return { rows, out: plain(R.snapshot().rules) }
  })
  return { rejected, accepted }
}

/** 원본 restore의 줄 수 한계. 줄이 많아 골든에는 수만 적는다 */
function linkLimits(html, json) {
  const R = newContext(html, json, { memoVisits: [] }).NEW_MEDICORE_DX_RECOMMEND
  const row = ['G6604', 'S6350', '', 0, 't']
  const rows = (length) => Array.from({ length }, () => row)
  R.restore({ schema: 1, rules: rows(LINK_LIMIT), trend: null })
  const kept = R.snapshot().rules.length
  try {
    R.restore({ schema: 1, rules: rows(LINK_LIMIT + 1), trend: null })
  } catch {
    return { row, accepted: LINK_LIMIT, kept, rejected: LINK_LIMIT + 1 }
  }
  throw new Error(`원본이 ${LINK_LIMIT + 1}줄을 받았다`)
}

function knownDiffCases(html, json) {
  return KNOWN_DIFF_CASES.map((item) => {
    const scenario = SCENARIOS.find((s) => s.name === item.scenario)
    const ctx = newContext(html, json, scenario)
    const D = ctx.NEW_MEDICORE_DIAGNOSES
    const R = ctx.NEW_MEDICORE_DX_RECOMMEND
    D.set(D.parse('가짜').map)
    R.restore({ schema: 1, rules: scenario.links, trend: packTrend(json) })
    const out = plain(R.recommend(item.code, item.name))
    if (out.list.find((row) => row.dx === item.dx)?.nm === item.ours) throw new Error(`원본도 같아 일부러 다른 사례가 아니다: ${item.where}`)
    return { ...item, out }
  })
}

// ── 쓰기 ────────────────────────────────────────────────

/** 사례 안의 줄은 한 줄에 하나씩(골든 차이를 읽기 쉽게) */
const list = (items, indent) => (items.length ? `[\n${items.map((item) => `${indent}  ${JSON.stringify(item)}`).join(',\n')}\n${indent}]` : '[]')

function scenarioText({ recommend, visits, ...head }) {
  const lines = Object.entries(head).map(([key, value]) => `      ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
  lines.push(`      "recommend": ${list(recommend, '      ')}`)
  lines.push(`      "visits": ${list(visits, '      ')}`)
  return `    {\n${lines.join(',\n')}\n    }`
}

function goldenText({ scenarios, linkRows: rows, ...head }) {
  const lines = Object.entries(head).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
  lines.push(`  "linkRows": ${JSON.stringify(rows)}`)
  lines.push(`  "scenarios": [\n${scenarios.map(scenarioText).join(',\n')}\n  ]`)
  return `{\n${lines.join(',\n')}\n}\n`
}

const options = args()
const bytes = readFileSync(join(options.src, FILE))
const html = bytes.toString('utf-8')
const fake = join(options.fake, FAKE_FILE)
const json = JSON.parse(readFileSync(fake, 'utf-8'))
const golden = {
  source: 'seoseungkwan/shared@2a1069b',
  file: FILE,
  fileSha256: createHash('sha256').update(bytes).digest('hex'),
  entry: 'new-medicore-dx-recommend recommend·issues·needsCheck·missingDx·restore·snapshot',
  fake: `fixtures/precheck/fake/${FAKE_FILE}`,
  knownDiffs: KNOWN_DIFFS,
  linkLimits: linkLimits(html, json),
  knownDiffCases: knownDiffCases(html, json),
  linkRows: linkRows(html, json),
  scenarios: SCENARIOS.map((scenario) => runScenario(html, json, scenario)),
}
mkdirSync(options.out, { recursive: true })
writeFileSync(join(options.out, 'dx-check.json'), goldenText(golden))
