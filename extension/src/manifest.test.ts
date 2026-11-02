// 확장 manifest(AC-003.1·AC-038.3)와 빌드(AC-003.8)를 파일로 검사한다 (TASK-3 REQ-003, TASK-38 REQ-038)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import commands from '../../src/lib/bridge/commands.json'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MANIFEST = path.join(ROOT, 'extension', 'manifest.json')
const DIST = path.join(ROOT, 'extension', 'dist')

function readJson(file: string): Record<string, unknown> {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
}

/** 크롬 규칙: 공개키(DER) SHA-256의 앞 16바이트를 16진수로 쓰고 0-f를 a-p로 바꾼 것이 확장 ID */
function extensionIdFromKey(key: string): string {
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)
  return [...hex].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('')
}

describe('AC-003.1 extension/manifest.json', () => {
  it('manifest_version 3, name·version이 있다', () => {
    const m = readJson(MANIFEST)
    expect(m.manifest_version).toBe(3)
    expect(typeof m.name).toBe('string')
    expect(String(m.name).trim()).not.toBe('')
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('permissions는 ["nativeMessaging"] 하나다', () => {
    expect(readJson(MANIFEST).permissions).toEqual(['nativeMessaging'])
  })

  it('host_permissions·content_scripts·web_accessible_resources·선택 권한·팝업(action)이 없다', () => {
    const m = readJson(MANIFEST)
    for (const key of [
      'host_permissions',
      'optional_permissions',
      'optional_host_permissions',
      'content_scripts',
      'web_accessible_resources',
      'action',
      'browser_action',
      'page_action',
    ]) {
      expect(m, key).not.toHaveProperty(key)
    }
    // 정해 둔 칸 밖의 것(새 권한·페이지 등)을 몰래 더하지 못하게
    expect(Object.keys(m).sort()).toEqual(
      ['background', 'description', 'externally_connectable', 'key', 'manifest_version', 'name', 'permissions', 'version'],
    )
  })

  it('서비스 워커는 ES 모듈 background.js다', () => {
    expect(readJson(MANIFEST).background).toEqual({ service_worker: 'background.js', type: 'module' })
  })

  it('externally_connectable.matches는 commands.json origin 하나(경로 /*만)이고 와일드카드 도메인·다른 확장 ids가 없다', () => {
    const ec = readJson(MANIFEST).externally_connectable as Record<string, unknown>
    expect(Object.keys(ec)).toEqual(['matches'])
    expect(ec.matches).toEqual([`${commands.origin}/*`])
    const [match] = ec.matches as string[]
    const url = new URL(match.slice(0, -1))
    expect(url.protocol).toBe('https:')
    expect(url.host).toBe(new URL(commands.origin).host)
    expect(url.host).not.toContain('*')
    expect(match).not.toMatch(/localhost|\*\.vercel\.app|^http:/)
  })

  it('key는 commands.json extensionKey이고, 그 key로 계산한 ID가 commands.json extensionId와 같다', () => {
    const m = readJson(MANIFEST)
    expect(m.key).toBe(commands.extensionKey)
    expect(extensionIdFromKey(String(m.key))).toBe(commands.extensionId)
  })
})

/** 확장 코드(시험 제외)에 있으면 안 되는 글자: 탭·창의 제목·주소와 탭 목록, 정해 둔 창 호출(get·update) 밖의 것(AC-038.3) */
const FORBIDDEN_TAB_READS = [
  /\b(?:title|url|pendingUrl|favIconUrl|populate|tabs)\b/i,
  /\btab\??\.(?!windowId\b)/,
  /\bwindows\??\.(?!(?:get|update)\b)/,
]

function readsTabText(code: string): boolean {
  return FORBIDDEN_TAB_READS.some((re) => re.test(code))
}

describe('AC-038.3 권한은 그대로, 판은 올린다', () => {
  it('AC-038.3: permissions는 그대로 ["nativeMessaging"]이고 tabs·host_permissions를 더하지 않았다', () => {
    const m = readJson(MANIFEST)
    expect(m.permissions).toEqual(['nativeMessaging'])
    expect(m).not.toHaveProperty('host_permissions')
    expect(JSON.stringify(m.permissions)).not.toContain('tabs')
  })

  it('AC-038.3: manifest.version을 지금 올라가 있는 0.1.0보다 올렸다', () => {
    const version = String(readJson(MANIFEST).version)
    expect(version.localeCompare('0.1.0', undefined, { numeric: true })).toBeGreaterThan(0)
  })

  it.each([
    'port.sender?.tab?.title',
    'sender.tab.url',
    'sender.url',
    'win.title',
    "tab['url']",
    'const { title } = tab',
    'tab.pendingUrl',
    'tab.favIconUrl',
    'tab.id',
    'chrome.tabs.query({})',
    'chrome.windows.get(1, { populate: true }, cb)',
    'chrome.windows.getAll(cb)',
    'chrome.windows.getCurrent(cb)',
  ])('AC-038.3: 글자 검사가 %s 를 잡는다', (code) => {
    expect(readsTabText(code)).toBe(true)
  })

  it.each([
    'port.sender?.tab?.windowId',
    'chrome.windows.get(windowId, cb)',
    "chrome.windows.update(windowId, { state: 'minimized' }, cb)",
  ])('AC-038.3: 글자 검사가 쓰는 줄 %s 는 잡지 않는다', (code) => {
    expect(readsTabText(code)).toBe(false)
  })

  it('AC-038.3: extension/src/**(시험 파일 빼고)는 탭·창의 제목과 주소를 읽지 않고, 웹 연결의 창 번호만 쓴다', () => {
    const src = path.join(ROOT, 'extension', 'src')
    const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(
      (f) => /\.[cm]?[jt]sx?$/.test(f) && !/\.test\.[cm]?[jt]sx?$/.test(f),
    )
    expect(files).toEqual(expect.arrayContaining(['background.ts', 'chromeLike.ts', 'relay.ts']))
    for (const file of files) {
      expect(readsTabText(readFileSync(path.join(src, file), 'utf8')), file).toBe(false)
    }
    expect(readFileSync(path.join(src, 'background.ts'), 'utf8')).toMatch(/\.sender\?\.tab\?\.windowId/)
  })
})

describe('AC-003.8 npm run ext:build', { timeout: 120_000 }, () => {
  const globals = globalThis as { chrome?: unknown }

  beforeAll(() => {
    rmSync(DIST, { recursive: true, force: true })
    execFileSync('npm', ['run', 'ext:build'], { cwd: ROOT, stdio: 'pipe' })
  }, 120_000)

  afterAll(() => {
    delete globals.chrome
  })

  it('extension/dist/에 manifest.json·background.js·relay.js를 만들고 시험 파일은 넣지 않는다', () => {
    for (const file of ['manifest.json', 'background.js', 'relay.js']) {
      expect(existsSync(path.join(DIST, file)), file).toBe(true)
    }
    expect(readdirSync(DIST).filter((f) => /\.test\.|\.ts$/.test(f))).toEqual([])
  })

  it('dist/manifest.json은 extension/manifest.json과 같다', () => {
    expect(readJson(path.join(DIST, 'manifest.json'))).toEqual(readJson(MANIFEST))
  })

  it('dist의 JS는 dist 안의 파일만 import한다(서비스 워커가 그대로 불러온다). 명령 표는 JS 모듈로 옮겨져 commands.json과 같다', async () => {
    for (const file of readdirSync(DIST).filter((f) => f.endsWith('.js'))) {
      const code = readFileSync(path.join(DIST, file), 'utf8')
      for (const [, spec] of code.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)) {
        expect(spec, `${file}: ${spec}`).toMatch(/^\.\/[\w.-]+\.js$/)
        expect(existsSync(path.join(DIST, spec)), `${file}: ${spec}`).toBe(true)
      }
      expect(code, file).not.toMatch(/\.json['"]/)
    }
    const table = (await import(pathToFileURL(path.join(DIST, 'commands.js')).href)) as { default: unknown }
    expect(table.default).toEqual(commands)
  })

  it('dist/background.js를 불러오면 chrome.runtime.onConnectExternal에 스스로 듣는 함수를 건다', async () => {
    const listeners: unknown[] = []
    globals.chrome = {
      runtime: {
        onConnectExternal: { addListener: (fn: unknown) => listeners.push(fn) },
        connectNative: () => {
          throw new Error('연결 전에 도우미를 켜면 안 된다')
        },
        getManifest: () => readJson(MANIFEST),
      },
    }
    await import(pathToFileURL(path.join(DIST, 'background.js')).href)
    expect(listeners).toHaveLength(1)
  })

  it('루트 tsconfig.json은 extension/·helper/를 빼고, extension/dist/는 git·ESLint 밖이다', () => {
    const tsconfig = readJson(path.join(ROOT, 'tsconfig.json')) as { exclude?: string[] }
    expect(tsconfig.exclude).toEqual(expect.arrayContaining(['extension', 'helper']))
    expect(readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/)).toContain('extension/dist/')
    expect(readFileSync(path.join(ROOT, 'eslint.config.mjs'), 'utf8')).toMatch(/ignores:\s*\[[^\]]*'extension\/dist\/'/)
  })

  it('helper.yml extension 일(ubuntu-latest)이 npm ci → npm run ext:build → precheck-extension-<manifest.version>.zip → artifact, release 일이 함께 올린다', () => {
    const yml = readFileSync(path.join(ROOT, '.github', 'workflows', 'helper.yml'), 'utf8')
    const job = /^ {2}extension:\n((?: {4}.*\n|\s*\n)+)/m.exec(yml)?.[1]
    expect(job, 'jobs.extension이 없다').toBeDefined()
    const text = job as string
    expect(text).toMatch(/^ {4}runs-on: ubuntu-latest$/m)
    expect(text).not.toMatch(/^ {4}permissions:/m)
    const at = (re: RegExp) => text.search(re)
    const ci = at(/run: npm ci$/m)
    const build = at(/run: npm run ext:build$/m)
    const zip = at(/precheck-extension-\$\w+\.zip/)
    const upload = at(/uses: actions\/upload-artifact@v\d+/)
    expect(ci).toBeGreaterThan(0)
    expect(build).toBeGreaterThan(ci)
    expect(zip).toBeGreaterThan(build)
    expect(upload).toBeGreaterThan(zip)
    expect(text).toMatch(/require\('\.\/extension\/manifest\.json'\)\.version/)
    expect(text).toMatch(/path: dist\/precheck-extension-\*\.zip/)
    expect(yml).toMatch(/^ {4}needs: \[helper, extension\]$/m)
  })
})
