// 'ERP 마감일지 입력 목록' 확장 빌드(spec erp-copy-list design.md 1절, AC-3907.2·AC-3907.3). `npm run ext-erp-list:build`
// 차례: extension-erp-list/dist 지움 → tsc -p extension-erp-list/tsconfig.json(rootDir가 저장소 맨 위라 새 코드는 dist/extension-erp-list/src/,
// 불러 쓰는 지금 부품은 고친 것 없이 dist/extension-erp/src/에 나온다) → manifest.json·list.html 복사 →
// 지금 설정 화면(extension-erp/options.html)의 script 줄 하나만 dist 경로로 바꿔 dist/options.html → 가리키는 파일이 다 있는지 본다
// 지금 확장 빌드(npm run ext-erp:build)와 그 결과는 건드리지 않는다
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 지금 설정 화면의 script 줄 */
export const OPTIONS_SCRIPT = '<script type="module" src="options.js"></script>'
/** dist 설정 화면의 script 줄(지금 부품이 dist/extension-erp/src/에 있다) */
export const OPTIONS_SCRIPT_DIST = '<script type="module" src="extension-erp/src/options.js"></script>'

/**
 * extension-erp/options.html 글 → dist options.html 글. script 줄이 정확히 하나가 아니면 던진다
 * @param {string} html
 * @returns {string}
 */
export function rewriteOptions(html) {
  const count = html.split(OPTIONS_SCRIPT).length - 1
  if (count !== 1) throw new Error(`extension-erp/options.html에 ${OPTIONS_SCRIPT} 줄이 ${count}개다(하나여야 한다)`)
  return html.replace(OPTIONS_SCRIPT, OPTIONS_SCRIPT_DIST)
}

/** 화면 글 안 <script src="…"> 경로들 */
function scriptSources(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1])
}

/**
 * dist 안에서 manifest(서비스 워커·설정 화면)와 list.html·options.html의 <script src>가 가리키는 파일 가운데 없는 것(dist 기준 경로).
 * 첫 파일만 본다. 그 파일들이 부르는 모듈은 import 규칙(AC-3901.4)과 tsc가 함께 내는 것으로 보장한다
 * @param {string} distDir
 * @returns {string[]}
 */
export function missingRefs(distDir) {
  const has = (rel) => existsSync(path.join(distDir, ...rel.split('/')))
  const missing = []
  const need = (rel) => {
    if (!has(rel) && !missing.includes(rel)) missing.push(rel)
  }
  need('manifest.json')
  if (has('manifest.json')) {
    const manifest = JSON.parse(readFileSync(path.join(distDir, 'manifest.json'), 'utf8'))
    const worker = manifest?.background?.service_worker
    if (typeof worker === 'string') need(worker)
    else missing.push('manifest.json background.service_worker')
    if (typeof manifest?.options_page === 'string') need(manifest.options_page)
  }
  for (const page of ['list.html', 'options.html']) {
    need(page)
    if (!has(page)) continue
    const sources = scriptSources(readFileSync(path.join(distDir, page), 'utf8'))
    if (sources.length === 0) missing.push(`${page} script`)
    for (const src of sources) need(src)
  }
  return missing
}

/** 저장소 맨 위에서 dist를 만든다. 가리키는 파일이 빠지면 던진다 */
function build() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const ext = path.join(root, 'extension-erp-list')
  const dist = path.join(ext, 'dist')
  rmSync(dist, { recursive: true, force: true })
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  execFileSync(process.execPath, [tsc, '-p', path.join(ext, 'tsconfig.json')], { cwd: root, stdio: 'inherit' })
  for (const file of ['manifest.json', 'list.html']) copyFileSync(path.join(ext, file), path.join(dist, file))
  writeFileSync(path.join(dist, 'options.html'), rewriteOptions(readFileSync(path.join(root, 'extension-erp', 'options.html'), 'utf8')))
  const missing = missingRefs(dist)
  if (missing.length > 0) throw new Error(`dist에 없는 파일: ${missing.join(', ')}`)
  process.stdout.write(`extension-erp-list/dist를 만들었다\n`)
}

// 직접 실행될 때만 빌드한다(시험은 두 함수만 부른다)
const self = path.resolve(fileURLToPath(import.meta.url)).toLowerCase()
if (process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === self) build()
