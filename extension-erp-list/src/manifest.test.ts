// spec erp-copy-list TASK-1(REQ-3901): 새 확장 'ERP 마감일지 입력 목록'의 틀을 파일로 검사한다.
// - AC-3901.1 manifest 칸·값(ERP 사이트에 들어갈 권한·길이 없음) · AC-3901.2 고정 ID 공개키(개인키는 저장소에 없음)
// - AC-3901.4 코드 울타리(네트워크·console·웹 저장소·chrome.storage 없음, import는 같은 폴더와 design.md 2절 표의 지금 부품·이름뿐)
// - AC-3901.5 설정 연결(vitest·tsconfig·ESLint·.gitignore, 새 tsconfig로 tsc 통과)
// - AC-3901.6 지금 확장·청구 쪽·웹앱은 시안 커밋 ec536578 그대로(src/b2b-merge.test.ts 한 줄만 더함)
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, createPublicKey } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const EXT = path.join(ROOT, 'extension-erp-list')
const SRC = path.join(EXT, 'src')
const MANIFEST = path.join(EXT, 'manifest.json')
// 지금 확장 ID는 ERP 명령 표(helper-erp/commands.json extensionId), 청구 확장 ID는 extension/manifest.json key로 계산한다
const ERP_TABLE = path.join(ROOT, 'helper-erp', 'commands.json')
const CLAIM_MANIFEST = path.join(ROOT, 'extension', 'manifest.json')
/** 이 갈래의 시안 커밋(AC-3901.6 기준) */
const BASE = 'ec536578'
const NAME = 'ERP 마감일지 입력 목록'
// ESLint 설정 읽기·tsc가 느린 PC에서도 흔들리지 않게
const SLOW = { timeout: 60_000 }
// 개인키 머리 글자. 이 시험 파일에 그 글자가 그대로 있으면 아래 검사가 이 파일에 걸리므로 나눠 적는다
const PRIVATE_MARK = ['PRIVATE', 'KEY'].join(' ')

/**
 * design.md 2절 표: 새 코드가 부르는 지금 부품(extension-erp/src/<이름>.js)과 그 안에서 쓰는 이름(값·타입).
 * background는 불러오기만 한다(이름 없음). 표를 넓히려면 명세를 고친다
 */
const REUSE: Readonly<Record<string, readonly string[]>> = {
  background: [],
  settings: ['load', 'toGroups', 'overlapAsks'],
  cells: ['planCells', 'HELD_SALES', 'Planned', 'Where'],
  main: ['readDay', 'READ_TIMEOUT_MS'],
  panel: ['TEXT', 'FLOW_TEXT', 'SKIP_TEXT', 'OVERLAP_TEXT', 'warningLines'],
  rangeView: ['RANGE_TEXT', 'pickProblem', 'localToday', 'dayList'],
  range: ['rangeDays'],
  errors: ['explain', 'E_BRIDGE_DISCONNECTED', 'E_BRIDGE_BAD_REPLY', 'E_HELPER_TIMEOUT'],
  types: ['GROUP_NAMES', 'ClosingDay', 'Settings', 'OverlapChoice'],
}
const SAME_FOLDER = /^\.\/([A-Za-z][A-Za-z0-9]*)\.js$/
const REUSED = /^\.\.\/\.\.\/extension-erp\/src\/([A-Za-z][A-Za-z0-9]*)\.js$/
const FORBIDDEN_WORDS =
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|console|localStorage|sessionStorage|indexedDB)\b/

function readJson(file: string): Record<string, unknown> {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
}

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** 크롬 규칙: 공개키(DER) SHA-256의 앞 16바이트를 16진수로 쓰고 0-f를 a-p로 바꾼 것이 확장 ID */
function extensionIdFromKey(key: string): string {
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)
  return [...hex].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('')
}

/** extension-erp-list/src/*.ts(시험 빼고) */
function codeFiles(): string[] {
  if (!existsSync(SRC)) return []
  return readdirSync(SRC)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && statSync(path.join(SRC, f)).isFile())
    .sort()
}

/** 폴더 아래 모든 파일(상대 경로, / 로) */
function allFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => statSync(path.join(dir, f)).isFile())
}

type ImportUse = { from: string; names: string[]; problems: string[] }

/** 파일 안 모든 import·export … from(정적), 그리고 동적 import·require·import 타입 같은 다른 길 */
function importsOf(file: string, text: string): { uses: ImportUse[]; others: string[] } {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const uses: ImportUse[] = []
  const others: string[] = []
  const nameOf = (el: ts.ImportSpecifier | ts.ExportSpecifier) => (el.propertyName ?? el.name).text
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const from = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : node.moduleSpecifier.getText(source)
      const names: string[] = []
      const problems: string[] = []
      const clause = node.importClause
      if (clause?.name) problems.push(`기본 이름 import ${clause.name.text}`)
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) problems.push(`* as ${bindings.name.text}`)
      if (bindings && ts.isNamedImports(bindings)) names.push(...bindings.elements.map(nameOf))
      uses.push({ from, names, problems })
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const from = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : node.moduleSpecifier.getText(source)
      const clause = node.exportClause
      if (!clause) uses.push({ from, names: [], problems: ['export *'] })
      else if (ts.isNamespaceExport(clause)) uses.push({ from, names: [], problems: [`export * as ${clause.name.text}`] })
      else uses.push({ from, names: clause.elements.map(nameOf), problems: [] })
    } else if (ts.isImportEqualsDeclaration(node)) {
      others.push(`import = ${node.getText(source)}`)
    } else if (ts.isImportTypeNode(node)) {
      others.push(`import 타입 ${node.getText(source)}`)
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) others.push(`동적 ${node.getText(source)}`)
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') others.push(node.getText(source))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { uses, others }
}

describe('AC-3901.1 extension-erp-list/manifest.json', () => {
  it('AC-3901.1: 맨 위 칸은 정확히 아홉 개(manifest_version·name·version·description·permissions·background·action·options_page·key)다', () => {
    expect(Object.keys(readJson(MANIFEST)).sort()).toEqual(
      ['manifest_version', 'name', 'version', 'description', 'permissions', 'background', 'action', 'options_page', 'key'].sort(),
    )
  })

  it("AC-3901.1: MV3, 이름 'ERP 마감일지 입력 목록', 판 0.1.0, 설명은 빈 글이 아니다", () => {
    const m = readJson(MANIFEST)
    expect(m.manifest_version).toBe(3)
    expect(m.name).toBe(NAME)
    expect(m.version).toBe('0.1.0')
    expect(typeof m.description).toBe('string')
    expect(String(m.description).trim()).not.toBe('')
  })

  it('AC-3901.1: permissions는 정확히 [nativeMessaging, storage]다', () => {
    expect(readJson(MANIFEST).permissions).toEqual(['nativeMessaging', 'storage'])
  })

  it('AC-3901.1: 사이트에 들어갈 칸(내용 스크립트·사이트 권한·선택 권한·웹 접근 자원·밖 연결·CSP)이 없다', () => {
    const m = readJson(MANIFEST)
    for (const key of [
      'content_scripts',
      'host_permissions',
      'optional_permissions',
      'optional_host_permissions',
      'web_accessible_resources',
      'externally_connectable',
      'content_security_policy',
    ]) {
      expect(m, key).not.toHaveProperty(key)
    }
    // 권한 안에도 사이트 주소·ERP 화면을 건드리는 권한이 없다
    const permissions = m.permissions as string[]
    for (const p of permissions) expect(p, p).not.toMatch(/[:/*]/)
    for (const p of ['scripting', 'tabs', 'activeTab', 'downloads', 'clipboardWrite']) expect(permissions, p).not.toContain(p)
  })

  it('AC-3901.1: 서비스 워커는 ES 모듈 extension-erp-list/src/background.js, 설정 화면은 options.html, 아이콘은 제목만(팝업 없음)', () => {
    const m = readJson(MANIFEST)
    expect(m.background).toEqual({ service_worker: 'extension-erp-list/src/background.js', type: 'module' })
    expect(m.options_page).toBe('options.html')
    expect(m.action).toEqual({ default_title: NAME })
  })
})

describe('AC-3901.2 고정 ID 공개키', () => {
  it('AC-3901.2: key는 RSA 2048 공개키(SPKI DER, base64)이고 다시 내보내도 같은 글자다', () => {
    const key = String(readJson(MANIFEST).key ?? '')
    expect(key).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
    const pub = createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' })
    expect(pub.type).toBe('public')
    expect(pub.asymmetricKeyType).toBe('rsa')
    expect(pub.asymmetricKeyDetails?.modulusLength).toBe(2048)
    expect(pub.export({ format: 'der', type: 'spki' }).toString('base64')).toBe(key)
  })

  it('AC-3901.2: key로 계산한 확장 ID는 32자 a~p이고 지금 확장 ID(ERP 명령 표)·청구 확장 ID와 다르다', () => {
    const key = String(readJson(MANIFEST).key ?? '')
    const id = extensionIdFromKey(key)
    expect(id).toMatch(/^[a-p]{32}$/)
    const erpId = readJson(ERP_TABLE).extensionId
    expect(erpId).toMatch(/^[a-p]{32}$/)
    expect(id).not.toBe(erpId)
    const claimKey = String(readJson(CLAIM_MANIFEST).key ?? '')
    expect(claimKey).not.toBe('')
    expect(id).not.toBe(extensionIdFromKey(claimKey))
    expect(key).not.toBe(claimKey)
    expect(key).not.toBe(readJson(ERP_TABLE).extensionKey)
  })

  it('AC-3901.2: 개인키는 저장소에 없다 — extension-erp-list/ 아래에 .pem 파일·개인키 머리 글자가 없다', () => {
    const files = allFiles(EXT)
    expect(files).toEqual(expect.arrayContaining(['manifest.json', 'src/manifest.test.ts']))
    for (const file of files) {
      expect(file.toLowerCase(), file).not.toMatch(/\.(pem|key|crx|der|p8|p12|pfx)$/)
      expect(readFileSync(path.join(EXT, file), 'latin1'), file).not.toContain(PRIVATE_MARK)
    }
  })

  it('AC-3901.2: 루트 .gitignore의 *.pem 줄은 그대로다(갈래 시안 커밋에서 뺀 줄 없음, .pem은 무시됨)', () => {
    const lines = read('.gitignore').split(/\r?\n/)
    expect(lines).toContain('*.pem')
    const diff = spawnSync('git', ['diff', '-U0', BASE, '--', '.gitignore'], { cwd: ROOT, encoding: 'utf8' })
    expect(diff.status, diff.stderr).toBe(0)
    const removed = diff.stdout.split(/\r?\n/).filter((l) => l.startsWith('-') && !l.startsWith('---'))
    expect(removed).toEqual([])
    const ignored = spawnSync('git', ['check-ignore', '-q', 'extension-erp-list/list.pem'], { cwd: ROOT })
    expect(ignored.status).toBe(0)
  })
})

describe('AC-3901.4 새 코드: 네트워크·console·웹 저장소·chrome.storage 없음, import는 표 안만', SLOW, () => {
  let eslint: ESLint
  const PROBE = 'extension-erp-list/src/probe.ts'

  beforeAll(async () => {
    eslint = new ESLint({ cwd: ROOT })
    await eslint.lintText('', { filePath: PROBE }) // 설정 읽기(느림)
  }, 60_000)

  async function errorRules(code: string, filePath = PROBE) {
    const [result] = await eslint.lintText(code, { filePath })
    return result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId)
  }

  it('AC-3901.4: extension-erp-list/src/*.ts(시험 빼고) 글자에 fetch·XMLHttpRequest·WebSocket·EventSource·importScripts·sendBeacon·console·localStorage·sessionStorage·indexedDB가 없다', () => {
    const files = codeFiles()
    expect(files).toEqual(expect.arrayContaining(['background.ts', 'listTypes.ts']))
    for (const file of files) expect(readFileSync(path.join(SRC, file), 'utf8'), file).not.toMatch(FORBIDDEN_WORDS)
  })

  it('AC-3901.4: 새 코드에 chrome.storage가 없다(설정은 지금 settings.js의 load로만 읽는다)', () => {
    for (const file of codeFiles()) {
      const code = readFileSync(path.join(SRC, file), 'utf8')
      expect(code, file).not.toMatch(/\bstorage\b/)
      expect(code, file).not.toMatch(/\bchrome\s*\??\.\s*storage\b/)
    }
  })

  it('AC-3901.4: 동적 import()·require·import 타입·import =가 없다', () => {
    for (const file of codeFiles()) {
      const text = readFileSync(path.join(SRC, file), 'utf8')
      expect(text, file).not.toMatch(/\bimport\s*\(/)
      expect(importsOf(file, text).others, file).toEqual([])
    }
  })

  it('AC-3901.4: 모든 import·export … from 경로는 같은 폴더 ./<이름>.js(있는 파일) 또는 표의 ../../extension-erp/src/<이름>.js뿐이다(패키지 이름·다른 경로 없음)', () => {
    let seen = 0
    for (const file of codeFiles()) {
      for (const use of importsOf(file, readFileSync(path.join(SRC, file), 'utf8')).uses) {
        seen += 1
        const where = `${file}: ${use.from}`
        expect(use.problems, where).toEqual([])
        const own = SAME_FOLDER.exec(use.from)
        const reused = REUSED.exec(use.from)
        expect(own !== null || reused !== null, where).toBe(true)
        if (own) expect(existsSync(path.join(SRC, `${own[1]}.ts`)), where).toBe(true)
        if (reused) expect(Object.keys(REUSE), where).toContain(reused[1])
      }
    }
    expect(seen).toBeGreaterThanOrEqual(2)
  })

  it('AC-3901.4: extension-erp/src에서 불러오는 이름은 design.md 2절 표의 모듈·이름뿐이다(background는 불러오기만)', () => {
    const found = new Map<string, Set<string>>()
    for (const file of codeFiles()) {
      for (const use of importsOf(file, readFileSync(path.join(SRC, file), 'utf8')).uses) {
        const part = REUSED.exec(use.from)?.[1]
        if (!part) continue
        for (const name of use.names) expect(REUSE[part] ?? [], `${file}: ${part}.${name}`).toContain(name)
        const set = found.get(part) ?? new Set<string>()
        use.names.forEach((n) => set.add(n))
        found.set(part, set)
      }
    }
    expect(found.has('background'), 'background.ts가 지금 도우미 통로를 불러야 한다').toBe(true)
    expect([...(found.get('background') ?? [])]).toEqual([])
  })

  it('AC-3901.4: 표에는 ERP 화면 부품(fill·erpday·content·options, scanRange·runRange·createDock·startPage)이 없고, 표의 이름은 그 모듈이 실제로 내보낸다', () => {
    for (const part of ['fill', 'erpday', 'content', 'options', 'josa', 'rangeTypes']) expect(REUSE, part).not.toHaveProperty(part)
    expect(REUSE.range).not.toContain('scanRange')
    expect(REUSE.range).not.toContain('runRange')
    expect(REUSE.panel).not.toContain('createDock')
    expect(REUSE.main).not.toContain('startPage')
    for (const [part, names] of Object.entries(REUSE)) {
      const text = read(`extension-erp/src/${part}.ts`)
      for (const name of names) {
        expect(text, `${part}.${name}`).toMatch(new RegExp(`^export (?:async )?(?:const|function|type|let) ${name}\\b`, 'm'))
      }
    }
  })

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ["self.fetch('x')", 'no-restricted-properties'],
    ['new XMLHttpRequest()', 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["new EventSource('x')", 'no-restricted-globals'],
    ["importScripts('x.js')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["window.localStorage.getItem('k')", 'no-restricted-properties'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
  ])('AC-3901.4: ESLint가 extension-erp-list/src에서 %s 를 %s 로 막는다(지금 ERP 확장 규칙)', async (code, rule) => {
    expect(await errorRules(code)).toContain(rule)
  })

  it('AC-3901.4: 시험 파일도 같은 규칙 아래 있다', async () => {
    expect(await errorRules('console.log(1)', 'extension-erp-list/src/probe.test.ts')).toContain('no-console')
    expect(await errorRules("fetch('x')", 'extension-erp-list/src/probe.test.ts')).toContain('no-restricted-globals')
  })

  it('AC-3901.4: 목록 화면이 쓰는 것(도우미에 묻기·설정 화면 열기·클립보드·화면 칸)은 막히지 않는다', async () => {
    const code = [
      "export const ask = () => chrome.runtime.sendMessage({ cmd: 'closing.day', args: {} })",
      'export const open = () => chrome.runtime.openOptionsPage()',
      "export const copy = () => navigator.clipboard.writeText('1')",
      "export const cell = () => document.querySelector('button')",
    ].join('\n')
    const [result] = await eslint.lintText(code, { filePath: PROBE })
    expect(result.messages).toEqual([])
  })
})

describe('AC-3901.5 설정 연결: vitest·tsconfig·ESLint·.gitignore', SLOW, () => {
  it('AC-3901.5: vitest include에 extension-erp-list/**/*.test.ts가 있고 맨 위 주석에도 같은 이름이 있다', async () => {
    const config = (await import('../../vitest.config')).default
    expect(config.test?.include ?? []).toContain('extension-erp-list/**/*.test.ts')
    expect(read('vitest.config.ts')).toContain('extension-erp-list/**/*.test.ts(ERP 마감일지 입력 목록 확장)')
  })

  it('AC-3901.5: 루트 tsconfig.json exclude에 extension-erp-list가 있다(지금 뺀 것들도 그대로)', () => {
    const tsconfig = readJson(path.join(ROOT, 'tsconfig.json')) as { exclude?: string[] }
    expect(tsconfig.exclude).toEqual(expect.arrayContaining(['extension-erp-list', 'extension-erp', 'extension', 'helper', 'node_modules']))
  })

  it('AC-3901.5: ESLint는 extension-erp-list/dist/를 보지 않고 extension-erp-list/src는 본다', async () => {
    const eslint = new ESLint({ cwd: ROOT })
    expect(await eslint.isPathIgnored('extension-erp-list/dist/x.js')).toBe(true)
    expect(await eslint.isPathIgnored('extension-erp-list/dist/extension-erp-list/src/list.js')).toBe(true)
    expect(await eslint.isPathIgnored('extension-erp-list/src/list.ts')).toBe(false)
    expect(read('eslint.config.mjs')).toContain("'extension-erp-list/dist/'")
  })

  it('AC-3901.5: .gitignore에 extension-erp-list/dist/ 줄이 있고 git이 그 폴더를 무시한다', () => {
    expect(read('.gitignore').split(/\r?\n/)).toContain('extension-erp-list/dist/')
    const ignored = spawnSync('git', ['check-ignore', '-q', 'extension-erp-list/dist/manifest.json'], { cwd: ROOT })
    expect(ignored.status).toBe(0)
  })

  it('AC-3901.5: extension-erp-list/tsconfig.json은 design.md 1절 그대로다', () => {
    expect(readJson(path.join(EXT, 'tsconfig.json'))).toEqual({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ES2022',
        moduleResolution: 'bundler',
        isolatedModules: true,
        strict: true,
        skipLibCheck: true,
        types: ['chrome'],
        rootDir: '..',
        outDir: 'dist',
        noEmitOnError: true,
      },
      include: ['src/*.ts', '../extension-erp/src/options.ts'],
      exclude: ['src/*.test.ts'],
    })
  })

  it('AC-3901.5: tsc -p extension-erp-list/tsconfig.json --noEmit이 0으로 끝난다', () => {
    const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
    const run = spawnSync(process.execPath, [tsc, '-p', path.join('extension-erp-list', 'tsconfig.json'), '--noEmit'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0)
  })
})

describe('AC-3901.6 지금 확장·청구 쪽·웹앱은 시안 커밋(ec536578) 그대로', SLOW, () => {
  const git = (args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  const B2B = 'src/b2b-merge.test.ts'

  it('AC-3901.6: git diff --name-only ec536578 -- extension-erp extension helper src 는 비었거나 src/b2b-merge.test.ts 하나다', () => {
    const names = git(['diff', '--name-only', BASE, '--', 'extension-erp', 'extension', 'helper', 'src'])
      .split(/\r?\n/)
      .filter(Boolean)
    expect([[], [B2B]]).toContainEqual(names)
  })

  it("AC-3901.6: 그 파일의 차이는 더한 줄 'extension-erp-list/**/*.test.ts', 하나뿐이다(뺀 줄 없음)", () => {
    const numstat = git(['diff', '--numstat', BASE, '--', B2B]).trim()
    if (numstat === '') return // 아직 더하지 않았다(위 시험이 빈 목록을 받는다)
    expect(numstat.split(/\s+/).slice(0, 3)).toEqual(['1', '0', B2B])
    const changed = git(['diff', '-U0', BASE, '--', B2B])
      .split(/\r?\n/)
      .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
    expect(changed).toHaveLength(1)
    expect(changed[0].startsWith('+')).toBe(true)
    expect(changed[0].slice(1).trim()).toBe("'extension-erp-list/**/*.test.ts',")
  })
})
