#!/usr/bin/env node
// 양지바른 사전점검 원본(seoseungkwan/shared@2a1069b, 저장소 밖)에서 점검 표 네 개를 옮긴다(spec precheck REQ-007).
//
//   node scripts/precheck/import-tables.mjs --src "$YANGJI_SRC" --out src/lib/precheck/data
//
// - 원본 경로는 --src 인자로만 받는다(환경 변수를 스스로 읽지 않는다). 원본 파일은 복사하지 않고 옮긴 결과만 쓴다(AC-007.3)
// - 같은 원본이면 늘 같은 바이트: 키 순서·들여쓰기(2칸)·줄바꿈(\n)을 고정하고, 시각·경로를 적지 않는다(AC-007.3)
// - 네 표를 모두 만든 뒤에야 쓴다. 하나라도 못 만들면 아무것도 쓰지 않는다
// - 값은 원본 그대로 옮긴다. 원본 화면이 받는 모양으로 바꾸는 것만 원본 코드와 같은 방식으로 한다:
//   rules.json    ← tools/precheck_rules.json 그대로(claim_precheck.py가 화면에 싣는 CAT)
//   dxFlags.json  ← assets/knowledge/dx_flags.json 을 claim_precheck.py precheck_dx_flags() 처럼(I·N 목록, N은 V~Y 대분류 뺌)
//   drugInfo.json ← assets/knowledge/drug_class_map.json 을 medicore/drug_info.py lookup() 처럼(9자리 코드 → 세 칸, 주성분명 200자까지)
//   codeMap.json  ← assets/mx999_v22.html 의 `let CODEMAP = {…}` 블록(기본 사전, 화면의 CODEMAP_DEF = JSON 왕복)
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import vm from 'node:vm'

class ImportError extends Error {}
const fail = (message) => {
  throw new ImportError(message)
}

// ── 인자 ──────────────────────────────────────────────────

function readArgs(argv) {
  let values
  try {
    ;({ values } = parseArgs({ args: argv, options: { src: { type: 'string' }, out: { type: 'string' } }, strict: true }))
  } catch {
    fail('쓰는 법: node scripts/precheck/import-tables.mjs --src <원본 YangjiBareun_사전점검 폴더> --out <표를 쓸 폴더>')
  }
  if (!values.src) fail('원본 경로를 --src 인자로 주세요(예: --src "$YANGJI_SRC"). 환경 변수는 스스로 읽지 않습니다')
  if (!values.out) fail('표를 쓸 폴더를 --out 인자로 주세요(예: --out src/lib/precheck/data)')
  const src = resolve(values.src)
  if (!existsSync(src) || !statSync(src).isDirectory()) fail(`원본 폴더가 없습니다: --src ${values.src}`)
  return { src, out: resolve(values.out) }
}

function readSource(src, rel) {
  const path = join(src, rel)
  if (!existsSync(path)) fail(`원본 파일이 없습니다: ${rel}`)
  return readFileSync(path, 'utf-8')
}

function readSourceJson(src, rel) {
  try {
    return JSON.parse(readSource(src, rel))
  } catch (error) {
    if (error instanceof ImportError) throw error
    fail(`원본 JSON을 읽지 못했습니다: ${rel}`)
  }
}

const isRecord = (x) => typeof x === 'object' && x !== null && !Array.isArray(x)

// ── 표 네 개 ──────────────────────────────────────────────

/** 규칙표: 원본 파일 그대로(claim_precheck.py precheck_catalog) */
function rulesTable(src) {
  const catalog = readSourceJson(src, 'tools/precheck_rules.json')
  if (!isRecord(catalog) || !Array.isArray(catalog.rules)) fail('원본 규칙표에 rules 목록이 없습니다: tools/precheck_rules.json')
  return catalog
}

/** 상병: claim_precheck.py precheck_dx_flags() — 불완전코드(I) · 주상병 불가(N, V~Y 대분류는 규칙에서 따로 봄) */
function dxFlagsTable(src) {
  const data = readSourceJson(src, 'assets/knowledge/dx_flags.json')
  if (!isRecord(data) || !isRecord(data.flags)) fail('원본 상병 표에 flags가 없습니다: assets/knowledge/dx_flags.json')
  const flags = Object.entries(data.flags)
  // Python sorted()와 같은 순서(코드는 ASCII라 기본 정렬과 같다)
  const sorted = (codes) => codes.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return {
    version: data.version ?? '',
    date: data.date ?? '',
    source: data.source ?? '',
    I: sorted(flags.filter(([, value]) => String(value).includes('I')).map(([code]) => code)),
    N: sorted(flags.filter(([code, value]) => String(value).includes('N') && !'VWXY'.includes(code.slice(0, 1))).map(([code]) => code)),
  }
}

/** Python str(x or "") */
const pyText = (x) => (x === null || x === undefined || x === false || x === 0 || x === '' ? '' : String(x))
/** Python 글자[:n] (UTF-16이 아니라 글자 단위) */
const pyCut = (text, n) => Array.from(text).slice(0, n).join('')

/** 약: medicore/drug_info.py lookup()이 화면에 넘기는 모양 — 9자리 코드 → [분류번호, 주성분코드, 주성분명(200자까지)] */
function drugInfoTable(src) {
  const data = readSourceJson(src, 'assets/knowledge/drug_class_map.json')
  if (!isRecord(data) || !isRecord(data.map)) fail('원본 약제 표에 map이 없습니다: assets/knowledge/drug_class_map.json')
  const map = {}
  for (const [code, info] of Object.entries(data.map)) {
    // 화면은 9자리 약 코드만 묻고(NEW_MEDICORE_DRUG_INFO_FETCH), 세 칸이 안 되는 줄은 lookup()이 뺀다
    if (!/^\d{9}$/.test(code) || !Array.isArray(info) || info.length < 3) continue
    map[code] = [pyText(info[0]), pyText(info[1]), pyCut(pyText(info[2]), 200)]
  }
  return {
    version: pyText(data.version),
    base_date: pyText(data.base_date),
    source: pyText(data.source),
    fields: Array.isArray(data.fields) ? data.fields.map(pyText) : [],
    map,
  }
}

const CODEMAP_START = 'let CODEMAP = '

/** `{`에서 시작해 짝이 맞는 `}`까지(글자·주석 안의 중괄호는 세지 않는다)의 끝 위치 */
function objectEnd(text, start) {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2)
      if (close < 0) break
      i = close + 1
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return fail('원본 화면의 CODEMAP 블록이 닫히지 않았습니다: assets/mx999_v22.html')
}

/** 처방코드 사전: 원본 화면의 `let CODEMAP = {…}` 블록만 꺼내 평가한다(빈 환경·시간 제한). 화면의 CODEMAP_DEF처럼 JSON 왕복 */
function codeMapTable(src) {
  const html = readSource(src, 'assets/mx999_v22.html')
  const at = html.indexOf(CODEMAP_START + '{')
  if (at < 0) fail('원본 화면에서 CODEMAP 블록(let CODEMAP = {)을 찾지 못했습니다: assets/mx999_v22.html')
  if (html.indexOf(CODEMAP_START + '{', at + 1) >= 0) fail('원본 화면에 CODEMAP 블록이 둘 이상입니다: assets/mx999_v22.html')
  const open = at + CODEMAP_START.length
  const block = html.slice(open, objectEnd(html, open))
  let value
  try {
    value = JSON.parse(JSON.stringify(vm.runInNewContext(`(${block})`, Object.create(null), { timeout: 1000 })))
  } catch {
    fail('원본 화면의 CODEMAP 블록을 읽지 못했습니다: assets/mx999_v22.html')
  }
  if (!isRecord(value) || !Object.values(value).every(isRecord)) fail('원본 화면의 CODEMAP 모양이 다릅니다: assets/mx999_v22.html')
  return value
}

// ── 쓰기 ──────────────────────────────────────────────────

/** 2칸 들여쓴 JSON. inlineDepth 깊이부터는 한 줄로(큰 사전을 한 항목 한 줄로 두어 비교하기 쉽게) */
function pretty(value, inlineDepth, depth = 0) {
  if (depth >= inlineDepth || value === null || typeof value !== 'object') return JSON.stringify(value)
  const pad = '  '.repeat(depth + 1)
  const end = '  '.repeat(depth)
  const items = Array.isArray(value)
    ? value.map((item) => pad + pretty(item, inlineDepth, depth + 1))
    : Object.keys(value).map((key) => `${pad}${JSON.stringify(key)}: ${pretty(value[key], inlineDepth, depth + 1)}`)
  if (items.length === 0) return Array.isArray(value) ? '[]' : '{}'
  return Array.isArray(value) ? `[\n${items.join(',\n')}\n${end}]` : `{\n${items.join(',\n')}\n${end}}`
}

function main() {
  const { src, out } = readArgs(process.argv.slice(2))
  const rules = rulesTable(src)
  const dxFlags = dxFlagsTable(src)
  const drugInfo = drugInfoTable(src)
  const codeMap = codeMapTable(src)
  const files = [
    ['rules.json', pretty(rules, Infinity)],
    ['dxFlags.json', pretty(dxFlags, Infinity)],
    ['drugInfo.json', pretty(drugInfo, 2)],
    ['codeMap.json', pretty(codeMap, 1)],
  ]
  mkdirSync(out, { recursive: true })
  for (const [name, text] of files) writeFileSync(join(out, name), text + '\n', 'utf-8')
  process.stdout.write(
    `rules.json 규칙 ${rules.rules.length} · dxFlags.json I ${dxFlags.I.length} N ${dxFlags.N.length} · ` +
      `drugInfo.json ${Object.keys(drugInfo.map).length} · codeMap.json ${Object.keys(codeMap).length}\n`,
  )
}

try {
  main()
} catch (error) {
  process.stderr.write(`import-tables: ${error instanceof ImportError ? error.message : '옮기지 못했습니다(예상하지 못한 오류)'}\n`)
  process.exitCode = 1
}
