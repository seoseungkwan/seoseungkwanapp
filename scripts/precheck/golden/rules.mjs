#!/usr/bin/env node
// 규칙 엔진 골든 만들기(TASK-10, design.md 10절). 가짜 자료를 원본(양지바른 사전점검 seoseungkwan/shared@2a1069b)에 넣어 돌린 결과를 적는다.
//   node scripts/precheck/golden/rules.mjs --src "$YANGJI_SRC" --fake fixtures/precheck/fake --out fixtures/precheck/golden
//
// 원본은 저장소 밖에 있고 경로로만 받는다. mx999_v22.html의 스크립트를 원본 시험(tests/test_claim_html.py)처럼 꺼내 node:vm 안에서 돌린다.
// 표 줄 → 원본 전역 값은 원본 함수로 만든다: 83 → build · 47 → parseRx · 83D → NEW_MEDICORE_DIAGNOSES.parse · 이력 → loadHistory ·
// 처방 목록 → 사전 CODEMAP은 hospital-update-model fresh + NEW_MEDICORE_CLAIM_PROCEDURE_DEFAULTS.
// 코드 찾기 → hospital-code-rules의 병원 모드 cm 그대로(importedRow·namedDrugRoles와 cm을 덮어쓰는 곳). 우리 코드는 한 줄도 돌지 않는다.
// 원본을 지나지 않고 이 스크립트가 직접 하는 것(원본 함수가 화면·설정·비트 연결에 묶여 있어서):
//   · 사전을 통째로 바꾸는 자리: plan은 저장된 설정(TPL·이력)이 있어야 돌아, plan의 CODEMAP 바꾸기 줄만 여기서 한다(줄마다 fresh, 기본 사전은 남기지 않음. 목록이 비면 원본도 바꾸지 않는다)
//   · 병원 모드 켜기: plan이 사전을 바꿀 때 적는 TPL.__catalog에서 NEW_MEDICORE_HOSPITAL_MODE가 보는 칸만 여기서 적는다. 목록이 비면 적지 않아 본 스크립트의 cm 그대로다.
//     TPL.drugNames는 적지 않아 원본 기본 약 이름 목록(drugNameDefaults)을 쓴다(AC-010.7). 병원마다 고치는 칸은 requirements.md 범위 밖이다
//   · 수량 함수: hospital-code-rules 안의 normalizeQuantity·quantityColumn만 꺼낸다 · 83D의 표 읽기: 엑셀 대신 이미 표인 줄을 돌려준다
//   · 약 역할 기본값: lidoCodes는 원본 TPL_DEF 값을 적어 둔다(LIDO_DEFAULT) · 이력 받기: 비트 대신 가짜 이력을 돌려준다
//   · 약 정보 받기: 묻는 코드는 원본 requestDrugInfo가 고른다. 도우미 /kb/drug-info 대신 물어본 코드만 약 표에서 돌려주고 모르는 코드는 뺀다(원본 drug_info.lookup. 이름 200자 자르기는 표를 만들 때 이미 했다)
//
// 만드는 것: rules-<사례>.json(가짜 자료 파일마다 하나) · rules-settings.json(설정을 넣은 것) · rules-status.json(statusOf) · rules-coverage.json(규칙 덮기)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import vm from 'node:vm'

process.env.TZ = 'Asia/Seoul' // 원본 날짜 계산은 지역 시간을 쓴다. 시험과 같은 시간대로 돈다

const SOURCE = 'seoseungkwan/shared@2a1069b'
const FILE = 'assets/mx999_v22.html'
const ENTRY = 'new-medicore-precheck evaluate/collect'
const LIDO_DEFAULT = 'A15' // 원본 TPL_DEF.lidoCodes

/** 설정을 넣어 돌리는 골든. HD-08은 기본으로 꺼진 규칙이라 여기서만 걸린다 */
const SETTINGS_CASES = [
  {
    name: 'rules-settings-changed.json',
    fake: 'claim-month-rules-settings.json',
    settings: { schema: 1, off: ['IJ-05', 'LA-01'], on: ['HD-08'], grade: [['HD-07', '확인필요'], ['HY-03', '알림'], ['IJ-13', '알림'], ['PH-01', '참고']] },
  },
  {
    // HY-12는 다른 규칙 결과를 보고 붙는다. 꺼지면 붙지 않고, 끄지 않아도 일부러 낮춘 등급은 보지 않는다(HY-03 위)
    name: 'rules-settings-off-hy12.json',
    fake: 'claim-month-rules-settings.json',
    settings: { schema: 1, off: ['HY-12'], on: [], grade: [] },
  },
]

/**
 * 원본과 다르게 둔 것(design.md 10절: 적지 않은 차이는 실패다). 지금은 없다. 모든 골든 머리에 적는 자리는 남겨 둔다.
 * 더할 때는 { id, where, rules, reason }으로 적고 golden.test.ts의 기대 목록과 engine.test.ts의 시험을 함께 고친다
 */
const KNOWN_DIFFS = []

/** 돌 수 있는 규칙(자동·이력)인데 골든에서 걸리게 할 수 없는 것 */
const UNREACHABLE = {
  'DX-08': '원본 H.dx_master가 늘 null을 돌려준다. 배제상병 판정은 required_dx 규칙 안에서 그 규칙 번호로 나온다(IJ-13.hit-excluded 사례)',
  'CL-15': '증상 줄이 빈 진료는 원본 build가 진료로 만들지 않아 도우미 표로는 생기지 않는다. engine.test.ts에서 빈 줄 진료를 바로 넣어 확인한다',
}

// ── 인자 ────────────────────────────────────────────────

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!/^--(src|fake|out)$/.test(argv[i]) || argv[i + 1] === undefined) throw new Error(`인자를 확인해 주세요: ${argv[i]}`)
    out[argv[i].slice(2)] = argv[i + 1]
  }
  out.src ??= process.env.YANGJI_SRC
  if (!out.src || !out.fake || !out.out) throw new Error('쓰는 법: rules.mjs --src <원본 폴더> --fake <가짜 자료 폴더> --out <골든 폴더>')
  return { src: resolve(out.src), fake: resolve(out.fake), out: resolve(out.out) }
}

// ── 원본 꺼내기 ──────────────────────────────────────────

function readScripts(html) {
  const scripts = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  for (let m; (m = re.exec(html)); ) scripts.push({ id: /\bid="([^"]+)"/.exec(m[1])?.[1] ?? '', code: m[2] })
  return scripts
}

const byId = (scripts, id) => {
  const found = scripts.find((s) => s.id === id)
  if (!found) throw new Error(`원본에서 스크립트를 찾지 못함: ${id}`)
  return found.code
}

/** 원본 첫 칸에서 시작해 첫 칸의 } 로 끝나는 함수 하나 */
function takeFunction(source, name) {
  const start = source.indexOf(`\nfunction ${name}(`)
  const end = source.indexOf('\n}', start + 1)
  if (start < 0 || end < 0) throw new Error(`원본에서 함수를 찾지 못함: ${name}`)
  return source.slice(start, end + 2)
}

/** const 한 묶음(세미콜론 + 줄바꿈까지) */
function takeConst(source, name) {
  const start = source.indexOf(`\nconst ${name} =`)
  const end = source.indexOf(';\n', start + 1)
  if (start < 0 || end < 0) throw new Error(`원본에서 값을 찾지 못함: ${name}`)
  return source.slice(start, end + 1)
}

/** 스크립트 안(IIFE)의 함수 하나. 한 칸 들여 쓴 } 로 끝난다 */
function takeInner(source, name) {
  const start = source.indexOf(`\n function ${name}(`)
  const end = source.indexOf('\n }', start + 1)
  if (start < 0 || end < 0) throw new Error(`원본에서 함수를 찾지 못함: ${name}`)
  return source.slice(start, end + 3)
}

function originalParts(html) {
  const scripts = readScripts(html)
  const main = scripts.find((s) => s.code.includes('\nfunction splitCell('))
  if (!main) throw new Error('원본에서 본 스크립트를 찾지 못함')
  const prelude = [
    takeConst(main.code, 'STEROID'),
    takeConst(main.code, 'HDR_RE'),
    takeConst(main.code, 'HDR_KIND'),
    ...['cm', 'rxOf', 'lidoCodes', 'ymd8', 'byVisitDate', 'splitCell', 'build', 'parseRx'].map((name) => takeFunction(main.code, name)),
  ].join('\n')
  // hospital-code-rules는 뒤쪽이 화면 함수(drugTxt 등)에 묶여 통째로 돌 수 없다. cm을 덮어쓰는 앞쪽(mode ~ cm)은 그대로 돌리고, parseRx가 부르는 수량 함수 둘을 꺼낸다
  const rulesCode = byId(scripts, 'new-medicore-hospital-code-rules')
  const cmStart = rulesCode.indexOf(' const mode=()=>')
  const cmEnd = rulesCode.indexOf(' // Codes the hospital still has to classify.')
  if (cmStart < 0 || cmEnd < 0) throw new Error('원본에서 병원 모드 cm을 찾지 못함')
  const modeHolder = scripts.find((s) => s.code.includes("'NEW_MEDICORE_HOSPITAL_MODE',{value:"))
  const modeLine = modeHolder && /\n Object\.defineProperty\(window,'NEW_MEDICORE_HOSPITAL_MODE'.*/.exec(modeHolder.code)
  if (!modeLine) throw new Error('원본에서 값을 찾지 못함: NEW_MEDICORE_HOSPITAL_MODE')
  const hospitalCm = `${modeLine[0]}\n(function(global){'use strict';${rulesCode.slice(cmStart, cmEnd)}})(window);`
  const quantity =`(function(){${takeInner(rulesCode, 'normalizeQuantity')}\n${takeInner(rulesCode, 'quantityColumn')}\nwindow.NEW_MEDICORE_HOSPITAL_CODE_RULES={normalizeQuantity,quantityColumn};})();`
  // 병원 모드 사전: fresh와 그 재료(copy·own·base), fresh가 받는 기본 시술 사전을 꺼낸다
  const model = byId(scripts, 'new-medicore-claim-hospital-update-model')
  const modelConst = (name) => {
    const found = new RegExp(`\\n const ${name}=.*`).exec(model)
    if (!found) throw new Error(`원본에서 값을 찾지 못함: ${name}`)
    return found[0]
  }
  const defaultsHolder = scripts.find((s) => s.code.includes("'NEW_MEDICORE_CLAIM_PROCEDURE_DEFAULTS'"))
  const defaultsLine = defaultsHolder && /\n Object\.defineProperty\(window,'NEW_MEDICORE_CLAIM_PROCEDURE_DEFAULTS'.*/.exec(defaultsHolder.code)
  if (!defaultsLine) throw new Error('원본에서 값을 찾지 못함: NEW_MEDICORE_CLAIM_PROCEDURE_DEFAULTS')
  const hospital = `(function(){${['copy', 'own', 'base'].map(modelConst).join('')}${takeInner(model, 'fresh')}${defaultsLine[0]}\nwindow.ORIGINAL_FRESH=fresh;})();`
  return {
    prelude,
    hospitalCm,
    codeRules: quantity,
    hospital,
    diagnoses: byId(scripts, 'new-medicore-diagnoses'),
    precheck: byId(scripts, 'new-medicore-precheck'),
  }
}

// ── 표 줄 → 원본 입력 ────────────────────────────────────

const table = (columns, rows) => [columns, ...rows.map((row) => columns.map((c) => row[c] ?? ''))]
const S83 = ['내원번호', '차트번호', '환자명', '증상', '기록날짜']
const S83D = ['내원번호', '차트번호', '상병청구코드', '상병명칭', '주상병여부', '산정특례기호', '과목코드', '진단일자']
const S47 = ['처방코드', '처방명칭', '차트번호', '처방일자', '급여구분', '수량']

/** 원본 plan의 사전 바꾸기: 목록이 있으면 CODEMAP을 비우고 줄마다 fresh로 채우고 병원 모드를 켠다. 목록이 비면 기본 사전 그대로다 */
const REPLACE_CODEMAP = `if(CATALOG.length){const canonical=window.NEW_MEDICORE_CLAIM_PROCEDURE_DEFAULTS();CODEMAP=Object.create(null);for(const row of CATALOG)CODEMAP[row.code]=window.ORIGINAL_FRESH(row,canonical);TPL.__catalog={schema:1,source:'drbit-hospital',rowCount:CATALOG.length};}`

async function runOriginal(parts, json, tables, settings) {
  const toast = () => {}
  const drugInfoRequests = []
  const ctx = {
    console, Map, Set, WeakMap, Error, Object, Array, Number, String, JSON, RegExp, Date, Math, Promise,
    // 원본은 처음 점검할 때 약 정보 요청을 setTimeout으로 예약한다. 그것만 받아 뒀다가 돌린다
    setTimeout: (fn) => {
      if (fn.name === 'requestDrugInfo') drugInfoRequests.push(fn)
      return 0
    },
    toast,
    uiAlert: toast,
    document: { readyState: 'complete', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    // 83D는 원본 parse로 읽는다. 엑셀 대신 이미 표인 줄을 돌려주는 자리만 바꾼다
    XLSX: { read: (rows) => ({ SheetNames: ['상병'], Sheets: { 상병: rows } }), utils: { sheet_to_json: (rows) => rows } },
  }
  ctx.window = ctx
  vm.createContext(ctx)
  const run = (source) => vm.runInContext(source, ctx)
  ctx.CODEMAP_JSON = JSON.stringify(tables.codeMap)
  ctx.CATALOG_JSON = JSON.stringify(json.catalog.codes)
  ctx.TPL_LIDO = LIDO_DEFAULT
  run('var TPL={lidoCodes:TPL_LIDO},CODEMAP_DEF=JSON.parse(CODEMAP_JSON),CODEMAP=JSON.parse(CODEMAP_JSON),CATALOG=JSON.parse(CATALOG_JSON),RXDATA=null,VISITS=[],curId=null;')
  run(parts.hospital)
  run(REPLACE_CODEMAP)
  run(parts.prelude)
  run(parts.hospitalCm) // 목록이 비면 TPL.__catalog가 없어 병원 모드가 꺼진 채로, 본 스크립트의 cm 그대로 찾는다
  run(parts.codeRules)
  run(parts.diagnoses)
  ctx.S83 = table(S83, json.s83)
  ctx.S47 = table(S47, json.s47)
  run('VISITS=build(S83,true,x=>x);RXDATA=parseRx(S47,true).data;')
  if (json.s83d.length) ctx.NEW_MEDICORE_DIAGNOSES.set(ctx.NEW_MEDICORE_DIAGNOSES.parse(table(S83D, json.s83d)).map)
  run(parts.precheck)
  const P = ctx.NEW_MEDICORE_PRECHECK
  ctx.NEW_MEDICORE_DRUG_INFO_FETCH = async (codes) => ({
    map: Object.fromEntries(codes.filter((code) => Object.hasOwn(tables.drugInfo.map, code)).map((code) => [code, tables.drugInfo.map[code]])),
  })
  ctx.NEW_MEDICORE_RX_HISTORY_FETCH = async () => ({
    from: json.historyRange.from,
    to: json.historyRange.to,
    rows: json.history.map((row) => [row.p, row.d, row.c, row.m]),
  })
  await P.loadHistory()
  if (settings) P.restore(settings)
  // 원본 흐름 그대로: 첫 점검이 요청을 예약하고, 요청이 약 정보를 넣는다. 약 정보가 바뀌면 원본 캐시가 비어 아래 점검은 새로 센다
  P.collect()
  if (!drugInfoRequests.length) throw new Error('원본이 약 정보 요청을 예약하지 않음')
  for (const request of drugInfoRequests.splice(0)) await request()

  const visits = ctx.VISITS.map((v) => {
    const r = P.evaluate(v)
    return {
      id: v.id,
      hits: r.hits.map((h) => ({ id: h.id, grade: h.grade, message: h.message, detail: h.detail })),
      skipped: { history: r.skipped.history, data: r.skipped.data },
      checked: r.checked,
    }
  })
  const c = P.collect()
  const collect = {
    visits: c.visits.map((v) => v.id),
    checked: c.checked,
    hi: c.hi,
    mid: c.mid,
    lo: c.lo,
    patients: c.patients,
    historySkips: c.historySkips,
    byRule: c.byRule.map((item) => ({ rule: item.rule.id, grade: item.grade, visits: item.visits.map((x) => x.v.id) })),
    rows: c.rows.map((row) => [row.v.id, row.h.id]),
  }
  return { visits, collect, P, rules: tables.rules.rules }
}

// ── 쓰기 ────────────────────────────────────────────────

/** 줄마다 한 항목이라 바뀐 곳만 차이에 보인다 */
function lines(value, indent = '') {
  if (Array.isArray(value)) return value.length ? `[\n${value.map((item) => indent + '  ' + JSON.stringify(item)).join(',\n')}\n${indent}]` : '[]'
  if (value && typeof value === 'object') {
    return `{\n${Object.entries(value).map(([k, v]) => `${indent}  ${JSON.stringify(k)}: ${lines(v, indent + '  ')}`).join(',\n')}\n${indent}}`
  }
  return JSON.stringify(value)
}

const head = (fake, settings) => ({ source: SOURCE, file: FILE, entry: ENTRY, knownDiffs: KNOWN_DIFFS, fake, settings: settings ?? null })

async function main() {
  const { src, fake, out } = args(process.argv.slice(2))
  const parts = originalParts(readFileSync(join(src, FILE), 'utf-8'))
  const data = (name) => JSON.parse(readFileSync(new URL(`../../../src/lib/precheck/data/${name}`, import.meta.url), 'utf-8'))
  const tables = { rules: data('rules.json'), drugInfo: data('drugInfo.json'), codeMap: data('codeMap.json') }
  mkdirSync(out, { recursive: true })

  const files = readdirSync(fake).filter((name) => /^claim-month-(rules-.+|cross-month)\.json$/.test(name)).sort()
  const hitIn = new Map()
  let statuses = null
  const write = (name, value) => {
    writeFileSync(join(out, name), `${lines(value)}\n`)
    console.log(name)
  }

  for (const file of files) {
    const json = JSON.parse(readFileSync(join(fake, file), 'utf-8'))
    const { visits, collect, P } = await runOriginal(parts, json, tables, null)
    statuses ??= Object.fromEntries(tables.rules.rules.map((rule) => [rule.id, P.statusOf(rule.id)]))
    const name = `${file.replace(/^claim-month-/, '').replace(/^(?!rules-)/, 'rules-')}`
    write(name, { ...head(file, null), visits, collect })
    for (const [, id] of collect.rows) if (!hitIn.has(id)) hitIn.set(id, name)
  }

  for (const { name, fake: file, settings } of SETTINGS_CASES) {
    const json = JSON.parse(readFileSync(join(fake, file), 'utf-8'))
    const { visits, collect } = await runOriginal(parts, json, tables, settings)
    write(name, { ...head(file, settings), visits, collect })
    for (const [, id] of collect.rows) if (!hitIn.has(id)) hitIn.set(id, name)
  }

  write('rules-status.json', { source: SOURCE, file: FILE, entry: 'new-medicore-precheck statusOf', statuses })

  const missing = []
  const rules = tables.rules.rules.map((rule) => {
    if (hitIn.has(rule.id)) return { id: rule.id, hitIn: hitIn.get(rule.id) }
    const status = statuses[rule.id]
    if (status === 'sam') return { id: rule.id, reason: 'SAM 단계 규칙이라(statusOf=sam) 원본 evaluate가 돌리지 않는다' }
    if (status === 'manual') {
      const why = rule.type === 'info_only' ? 'info_only라 판정 함수가 없다' : '원본이 자동 점검 조건을 못 맞춘다'
      return { id: rule.id, reason: `수동 확인 규칙이라(statusOf=manual) 원본 evaluate가 돌리지 않는다: ${why}` }
    }
    if (UNREACHABLE[rule.id]) return { id: rule.id, reason: UNREACHABLE[rule.id] }
    missing.push(rule.id)
    return { id: rule.id }
  })
  write('rules-coverage.json', { source: SOURCE, rules })
  if (missing.length) {
    console.error(`걸린 골든도 이유도 없는 규칙: ${missing.join(' ')}`)
    process.exitCode = 1
  }
}

await main()
