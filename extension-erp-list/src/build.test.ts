// spec erp-copy-list TASK-5 AC-3907.2·AC-3907.3: 새 확장 빌드(scripts/build-erp-list.mjs, design.md 1절)
// - rewriteOptions: 지금 설정 화면(extension-erp/options.html)의 script 줄 하나만 dist 경로로 바꾼다(줄이 하나가 아니면 던짐)
// - missingRefs: manifest 서비스 워커·설정 화면·list.html·options.html script가 가리키는 파일 중 dist에 없는 것
// - 실제 빌드 한 번: dist 파일 목록이 design.md 1절 그대로(content.js·시험·.map 없음), 가리키는 파일이 다 있음
// - package.json ext-erp-list:build 글자, 지금 ext-erp:build 글자는 그대로
// 자료는 없다(파일 모양만 본다)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIST = path.join(ROOT, 'extension-erp-list', 'dist')
const OPTIONS = path.join(ROOT, 'extension-erp', 'options.html')
const SCRIPT = path.join(ROOT, 'scripts', 'build-erp-list.mjs')

// 빌드 스크립트가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
type BuildModule = {
  OPTIONS_SCRIPT: string
  OPTIONS_SCRIPT_DIST: string
  rewriteOptions(html: string): string
  missingRefs(distDir: string): string[]
}
const load = async () => (await import('../../scripts/build-erp-list.mjs')) as BuildModule

/** 지금 확장 빌드 명령(이 기능 전 글자 그대로) */
const EXT_ERP_BUILD =
  "node -e \"require('fs').rmSync('extension-erp/dist',{recursive:true,force:true})\" && tsc -p extension-erp/tsconfig.json && node -e \"const fs=require('fs');for(const f of ['manifest.json','options.html'])fs.copyFileSync('extension-erp/'+f,'extension-erp/dist/'+f)\""

/** design.md 1절 dist 모양 */
const NEW_CODE = ['background', 'listTypes', 'rows', 'zip', 'xlsx', 'view', 'list']
const REUSED = ['background', 'options', 'settings', 'cells', 'types', 'errors', 'josa', 'main', 'panel', 'fill', 'erpday', 'range', 'rangeTypes', 'rangeView']
const EXPECTED_DIST = [
  'manifest.json',
  'list.html',
  'options.html',
  ...NEW_CODE.map((n) => `extension-erp-list/src/${n}.js`),
  ...REUSED.map((n) => `extension-erp/src/${n}.js`),
].sort()

/** 폴더 아래 모든 파일(상대 경로, / 로) */
function allFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => statSync(path.join(dir, f)).isFile())
    .sort()
}

const temps: string[] = []
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDist(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'erp-list-dist-'))
  temps.push(dir)
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), body)
  }
  return dir
}

const MANIFEST = JSON.stringify({ background: { service_worker: 'extension-erp-list/src/background.js', type: 'module' }, options_page: 'options.html' })
const LIST = '<!DOCTYPE html><html><body><main id="listMain"></main><script type="module" src="extension-erp-list/src/list.js"></script></body></html>'
const OPTS = '<!DOCTYPE html><html><body><script type="module" src="extension-erp/src/options.js"></script></body></html>'

describe('AC-3907.2 rewriteOptions', () => {
  it('AC-3907.2: 지금 extension-erp/options.html의 script 줄 하나만 src="extension-erp/src/options.js"로 바뀌고 나머지 글자는 같다', async () => {
    const { rewriteOptions, OPTIONS_SCRIPT, OPTIONS_SCRIPT_DIST } = await load()
    expect(OPTIONS_SCRIPT).toBe('<script type="module" src="options.js"></script>')
    expect(OPTIONS_SCRIPT_DIST).toBe('<script type="module" src="extension-erp/src/options.js"></script>')
    const original = readFileSync(OPTIONS, 'utf8')
    const out = rewriteOptions(original)
    expect(out).not.toBe(original)
    expect(out.split(OPTIONS_SCRIPT_DIST)).toHaveLength(2)
    expect(out).not.toContain(OPTIONS_SCRIPT)
    expect(out.replace(OPTIONS_SCRIPT_DIST, OPTIONS_SCRIPT)).toBe(original)
    const a = original.split(/\r?\n/)
    const b = out.split(/\r?\n/)
    expect(b).toHaveLength(a.length)
    expect(a.filter((line, i) => line !== b[i])).toEqual([OPTIONS_SCRIPT])
  })

  it('AC-3907.2: script 줄이 없거나 둘이면 던진다', async () => {
    const { rewriteOptions, OPTIONS_SCRIPT } = await load()
    expect(() => rewriteOptions('<html><body></body></html>')).toThrow()
    expect(() => rewriteOptions(`<html><body>${OPTIONS_SCRIPT}\n${OPTIONS_SCRIPT}</body></html>`)).toThrow()
    expect(() => rewriteOptions('<script type="module" src="./options.js"></script>')).toThrow()
  })
})

describe('AC-3907.2 missingRefs', () => {
  it('AC-3907.2: 다 있으면 빈 목록', async () => {
    const { missingRefs } = await load()
    const dir = tempDist({
      'manifest.json': MANIFEST,
      'list.html': LIST,
      'options.html': OPTS,
      'extension-erp-list/src/background.js': '',
      'extension-erp-list/src/list.js': '',
      'extension-erp/src/options.js': '',
    })
    expect(missingRefs(dir)).toEqual([])
  })

  it('AC-3907.2: 서비스 워커·list.html script·options.html script 가운데 없는 파일을 찾는다', async () => {
    const { missingRefs } = await load()
    const dir = tempDist({ 'manifest.json': MANIFEST, 'list.html': LIST, 'options.html': OPTS, 'extension-erp-list/src/list.js': '' })
    expect([...missingRefs(dir)].sort()).toEqual(['extension-erp-list/src/background.js', 'extension-erp/src/options.js'])
  })

  it('AC-3907.2: 화면 파일·manifest가 없으면 그 파일을 없다고 한다', async () => {
    const { missingRefs } = await load()
    const dir = tempDist({ 'manifest.json': MANIFEST, 'extension-erp-list/src/background.js': '' })
    expect([...missingRefs(dir)].sort()).toEqual(['list.html', 'options.html'])
    const empty = tempDist({})
    expect(missingRefs(empty)).toContain('manifest.json')
  })
})

describe('AC-3907.2·AC-3907.3 실제 빌드', () => {
  let run: ReturnType<typeof spawnSync>

  beforeAll(() => {
    run = existsSync(SCRIPT)
      ? spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf8', timeout: 180_000 })
      : spawnSync(process.execPath, ['-e', 'process.exit(1)'], { encoding: 'utf8' })
  }, 200_000)

  it('AC-3907.2: node scripts/build-erp-list.mjs가 0으로 끝난다', () => {
    expect(existsSync(SCRIPT)).toBe(true)
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0)
  })

  it('AC-3907.3: dist에는 manifest.json·list.html·options.html·새 코드 7개·지금 부품 14개만 있다(content.js·시험·.map 없음)', () => {
    const files = allFiles(DIST)
    expect(files).toEqual(EXPECTED_DIST)
    expect(files.some((f) => f.endsWith('content.js'))).toBe(false)
    expect(files.some((f) => /\.test\.js$|\.map$|__tests__/.test(f))).toBe(false)
  })

  it('AC-3907.3: dist의 가리키는 파일이 다 있고, manifest·list.html은 소스 그대로, options.html은 script 줄만 다르다', async () => {
    const { missingRefs, OPTIONS_SCRIPT, OPTIONS_SCRIPT_DIST } = await load()
    expect(missingRefs(DIST)).toEqual([])
    expect(readFileSync(path.join(DIST, 'manifest.json'), 'utf8')).toBe(readFileSync(path.join(ROOT, 'extension-erp-list', 'manifest.json'), 'utf8'))
    expect(readFileSync(path.join(DIST, 'list.html'), 'utf8')).toBe(readFileSync(path.join(ROOT, 'extension-erp-list', 'list.html'), 'utf8'))
    const dist = readFileSync(path.join(DIST, 'options.html'), 'utf8')
    expect(dist.replace(OPTIONS_SCRIPT_DIST, OPTIONS_SCRIPT)).toBe(readFileSync(OPTIONS, 'utf8'))
    // 새 코드가 부르는 지금 부품 경로가 dist 모양과 맞는다(import 글자 그대로)
    expect(readFileSync(path.join(DIST, 'extension-erp-list', 'src', 'list.js'), 'utf8')).toContain("'../../extension-erp/src/settings.js'")
  })
})

describe('AC-3907.2 package.json', () => {
  it("AC-3907.2: ext-erp-list:build = 'node scripts/build-erp-list.mjs'이고 지금 ext-erp:build 글자는 그대로다", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    expect(pkg.scripts['ext-erp-list:build']).toBe('node scripts/build-erp-list.mjs')
    expect(pkg.scripts['ext-erp:build']).toBe(EXT_ERP_BUILD)
  })
})
