// 새 확장 'ERP 마감일지 채우기'의 틀(TASK-1 REQ-3601): manifest·답 모양 상수·코드 울타리·설정 연결을 파일로 검사한다
import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const EXT = path.join(ROOT, 'extension-erp')
const SRC = path.join(EXT, 'src')
const MANIFEST = path.join(EXT, 'manifest.json')
// ERP 도우미 명령 표(ERP 도우미에 실림, TASK-11). 기존 확장 manifest는 ID가 다른지 견줄 때만 본다
const ERP_TABLE = path.join(ROOT, 'helper-erp', 'commands.json')
const OLD_MANIFEST = path.join(ROOT, 'extension', 'manifest.json')
const DESIGN = path.join(ROOT, 'specs', 'erp-closing-fill', 'design.md')
const ERP_MATCH = 'https://erp.minesolution.com/*'
// ESLint 설정 읽기·tsc가 느린 PC에서도 흔들리지 않게
const SLOW = { timeout: 60_000 }

function readJson(file: string): Record<string, unknown> {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
}

/** 크롬 규칙: 공개키(DER) SHA-256의 앞 16바이트를 16진수로 쓰고 0-f를 a-p로 바꾼 것이 확장 ID */
function extensionIdFromKey(key: string): string {
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)
  return [...hex].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('')
}

// types.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const loadTypes = () => import('./types')

/** extension-erp/src 아래 코드 파일(시험 파일·시험용 __tests__ 폴더 빼고), 경로는 / 로 */
function codeFiles(): string[] {
  if (!existsSync(SRC)) return []
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => /\.[cm]?[jt]sx?$/.test(f) && !/\.test\.[cm]?[jt]sx?$/.test(f) && !f.split('/').includes('__tests__'))
}

describe('AC-3601.1 extension-erp/manifest.json', () => {
  it("AC-3601.1: MV3이고 이름은 'ERP 마감일지 채우기', 판은 0.1.0이다", () => {
    const m = readJson(MANIFEST)
    expect(m.manifest_version).toBe(3)
    expect(m.name).toBe('ERP 마감일지 채우기')
    expect(m.version).toBe('0.1.0')
    expect(String(m.description ?? '').trim()).not.toBe('')
  })

  it('AC-3601.1: permissions는 정확히 [nativeMessaging, storage]다', () => {
    expect(readJson(MANIFEST).permissions).toEqual(['nativeMessaging', 'storage'])
  })

  it('AC-3601.1: host_permissions·externally_connectable·선택 권한·팝업이 없고, 정해 둔 칸 밖의 것이 없다', () => {
    const m = readJson(MANIFEST)
    for (const key of [
      'host_permissions',
      'externally_connectable',
      'optional_permissions',
      'optional_host_permissions',
      'action',
      'browser_action',
      'page_action',
    ]) {
      expect(m, key).not.toHaveProperty(key)
    }
    expect(Object.keys(m).sort()).toEqual(
      [
        'background',
        'content_scripts',
        'description',
        'key',
        'manifest_version',
        'name',
        'options_page',
        'permissions',
        'version',
        'web_accessible_resources',
      ].sort(),
    )
  })

  it('AC-3601.1: 서비스 워커는 ES 모듈 background.js, 설정 화면은 options.html이다', () => {
    const m = readJson(MANIFEST)
    expect(m.background).toEqual({ service_worker: 'background.js', type: 'module' })
    expect(m.options_page).toBe('options.html')
  })

  it('AC-3601.1: 내용 스크립트는 https://erp.minesolution.com/* 하나에만 content.js 하나다', () => {
    expect(readJson(MANIFEST).content_scripts).toEqual([{ matches: [ERP_MATCH], js: ['content.js'] }])
  })

  it('AC-3601.1: 내용 스크립트가 불러오는 모듈 파일(web_accessible_resources)도 같은 주소 하나에만 연다', () => {
    expect(readJson(MANIFEST).web_accessible_resources).toEqual([
      { resources: ['main.js', 'cells.js', 'fill.js', 'panel.js', 'settings.js', 'types.js'], matches: [ERP_MATCH] },
    ])
    const url = new URL(ERP_MATCH.slice(0, -1))
    expect(url.protocol).toBe('https:')
    expect(url.host).toBe('erp.minesolution.com')
  })

  it('AC-3601.1: key는 RSA 2048 공개 열쇠이고, 그것으로 계산한 ID는 32자 a~p이며 ERP 명령 표 extensionId와 같고 기존 확장 ID와 다르다', () => {
    const key = String(readJson(MANIFEST).key ?? '')
    const pub = createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' })
    expect(pub.asymmetricKeyType).toBe('rsa')
    expect(pub.asymmetricKeyDetails?.modulusLength).toBe(2048)
    // 다시 내보낸 값이 그대로여야 크롬이 같은 ID를 계산한다(앞뒤 공백·줄바꿈 없음)
    expect(pub.export({ format: 'der', type: 'spki' }).toString('base64')).toBe(key)
    const id = extensionIdFromKey(key)
    expect(id).toMatch(/^[a-p]{32}$/)
    const erp = readJson(ERP_TABLE)
    expect(id).toBe(erp.extensionId)
    expect(key).toBe(erp.extensionKey)
    const oldKey = String(readJson(OLD_MANIFEST).key ?? '')
    expect(id).not.toBe(extensionIdFromKey(oldKey))
    expect(key).not.toBe(oldKey)
  })
})

describe('AC-3601.1 extension-erp/src/types.ts 이름표·차례', () => {
  it('AC-3601.1: HOST_NAME은 ERP 명령 표 helper-erp/commands.json hostName(com.seoseungkwan.erp_helper)과 같다', async () => {
    const { HOST_NAME } = await loadTypes()
    const erp = readJson(ERP_TABLE)
    expect(erp.hostName).toBe('com.seoseungkwan.erp_helper')
    expect(HOST_NAME).toBe(erp.hostName)
  })

  it('AC-3601.1: GROUP_KEYS는 design.md 2절 묶음 key 19개 차례 그대로다', async () => {
    const { GROUP_KEYS } = await loadTypes()
    const expected = [
      'carm', 'sono', 'arthro', 'manual', 'eswt', 'pt', 'etc1', 'etc2', 'etc3', 'etc4',
      'manualConsult', 'lipus', 'nail', 'ct', 'surgery', 'eswtStd', 'eswtRadial', 'injection', 'ptVisit',
    ]
    expect([...GROUP_KEYS]).toEqual(expected)
    // 명세 2절 closing.day args의 enum 값과도 같다(도우미 쪽 일꾼과의 경계)
    const values = /"key": \{ "type": "enum", "values": (\[[^\]]*\])/.exec(readFileSync(DESIGN, 'utf8'))?.[1]
    expect(values, 'design.md 2절 key enum을 찾지 못했다').toBeDefined()
    expect(JSON.parse(values as string)).toEqual(expected)
  })

  it('AC-3601.1: GROUP_NAMES는 묶음마다 design.md 2절 설정 이름이다', async () => {
    const { GROUP_KEYS, GROUP_NAMES } = await loadTypes()
    expect(Object.keys(GROUP_NAMES)).toEqual([...GROUP_KEYS])
    expect(GROUP_NAMES).toEqual({
      carm: '씨암',
      sono: 'SONO',
      arthro: '관절조영',
      manual: '도수',
      eswt: '충격파',
      pt: '물리치료',
      etc1: '기타1',
      etc2: '기타2',
      etc3: '기타3',
      etc4: '기타4',
      manualConsult: '도수상담',
      lipus: '리푸스',
      nail: '손발톱케어',
      ct: 'CT',
      surgery: '수술',
      eswtStd: 'ESWT Standard',
      eswtRadial: 'ESWT Radial',
      injection: '주사',
      ptVisit: '물리치료내원',
    })
  })

  it('AC-3601.1: RSV_ROWS·RSV_NAMES는 design.md 4절 예약 6줄 차례와 이름이다', async () => {
    const { RSV_ROWS, RSV_NAMES } = await loadTypes()
    expect([...RSV_ROWS]).toEqual(['injection', 'followup', 'manual', 'eswt', 'clinic', 'etc'])
    expect(Object.keys(RSV_NAMES)).toEqual([...RSV_ROWS])
    expect(RSV_NAMES).toEqual({
      injection: '주사',
      followup: '경과',
      manual: '도수',
      eswt: '충격파',
      clinic: '진료예약',
      etc: '기타(수액,드레싱등)',
    })
  })

  it('AC-3601.5: 설정은 chrome.storage.local의 erpClosing 한 칸에 둔다', async () => {
    const { SETTINGS_KEY } = await loadTypes()
    expect(SETTINGS_KEY).toBe('erpClosing')
  })
})

describe('AC-3601.5 새 확장 코드: 네트워크·console·웹 저장소 없음', SLOW, () => {
  let eslint: ESLint
  const PROBE = 'extension-erp/src/probe.ts'

  beforeAll(async () => {
    eslint = new ESLint({ cwd: ROOT })
    await eslint.lintText('', { filePath: PROBE }) // 설정 읽기(느림)
  }, 60_000)

  async function errorRules(code: string, filePath = PROBE) {
    const [result] = await eslint.lintText(code, { filePath })
    return result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId)
  }

  it('AC-3601.5: extension-erp/src 코드(시험 빼고)에 fetch·XMLHttpRequest·WebSocket·console·localStorage·sessionStorage가 없다', () => {
    const files = codeFiles()
    expect(files).toEqual(expect.arrayContaining(['types.ts']))
    for (const file of files) {
      const code = readFileSync(path.join(SRC, file), 'utf8')
      expect(code, file).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|console|localStorage|sessionStorage)\b/)
    }
  })

  it('AC-3601.5: chrome.storage는 local 칸만 쓴다(sync·session·managed 없음)', () => {
    for (const file of codeFiles()) {
      const code = readFileSync(path.join(SRC, file), 'utf8')
      expect(code, file).not.toMatch(/\bstorage\s*\??\.\s*(?:sync|session|managed)\b/)
    }
  })

  it.each([
    ["fetch('x')", 'no-restricted-globals'],
    ["self.fetch('x')", 'no-restricted-properties'],
    ["window.fetch('x')", 'no-restricted-properties'],
    ['new XMLHttpRequest()', 'no-restricted-globals'],
    ["new WebSocket('x')", 'no-restricted-globals'],
    ["new globalThis.WebSocket('x')", 'no-restricted-properties'],
    ["new EventSource('x')", 'no-restricted-globals'],
    ["navigator.sendBeacon('x')", 'no-restricted-properties'],
    ["localStorage.setItem('k', 'v')", 'no-restricted-globals'],
    ["sessionStorage.getItem('k')", 'no-restricted-globals'],
    ["window.localStorage.getItem('k')", 'no-restricted-properties'],
    ["indexedDB.open('x')", 'no-restricted-globals'],
    ['console.log(1)', 'no-console'],
    ['const c = console; c.log(1)', 'no-restricted-globals'],
    ['self.console.error(1)', 'no-restricted-properties'],
  ])('AC-3601.5: ESLint가 extension-erp/src에서 %s 를 %s 로 막는다', async (code, rule) => {
    expect(await errorRules(code)).toContain(rule)
  })

  it('AC-3601.5: 하위 폴더와 시험 파일도 같은 규칙 아래 있다', async () => {
    expect(await errorRules('console.log(1)', 'extension-erp/src/__tests__/probe.ts')).toContain('no-console')
    expect(await errorRules("fetch('x')", 'extension-erp/src/probe.test.ts')).toContain('no-restricted-globals')
  })

  it('AC-3601.5: 설정 저장(chrome.storage.local)·도우미 켜기·화면 칸 읽기는 막히지 않는다', async () => {
    const code = [
      "export const load = () => chrome.storage.local.get('erpClosing')",
      "export const save = (v: unknown) => chrome.storage.local.set({ erpClosing: v })",
      "export const open = () => chrome.runtime.connectNative('com.seoseungkwan.erp_helper')",
      "export const cell = () => document.querySelector('input')",
    ].join('\n')
    const [result] = await eslint.lintText(code, { filePath: PROBE })
    expect(result.messages).toEqual([])
  })

  it('AC-3601.5: 빌드 산출물 extension-erp/dist/는 ESLint가 보지 않는다', async () => {
    expect(await eslint.isPathIgnored('extension-erp/dist/main.js')).toBe(true)
  })
})

describe('AC-3601.1 설정 연결: vitest·tsconfig·ESLint·package.json', SLOW, () => {
  it('AC-3601.1: vitest include에 extension-erp/**/*.test.ts가 있다', async () => {
    const config = (await import('../../vitest.config')).default
    expect(config.test?.include ?? []).toContain('extension-erp/**/*.test.ts')
  })

  it('AC-3601.1: 루트 tsconfig.json은 extension-erp를 뺀다(Next 검사 밖, 따로 tsc)', () => {
    const tsconfig = readJson(path.join(ROOT, 'tsconfig.json')) as { exclude?: string[] }
    expect(tsconfig.exclude).toEqual(expect.arrayContaining(['extension-erp', 'extension', 'helper']))
  })

  it('AC-3601.1: extension-erp/tsconfig.json은 src/*.ts(시험 빼고)를 dist로 내고, 그대로 tsc 검사를 통과한다', () => {
    const tsconfig = readJson(path.join(EXT, 'tsconfig.json')) as {
      compilerOptions?: Record<string, unknown>
      include?: string[]
      exclude?: string[]
    }
    expect(tsconfig.include).toEqual(['src/*.ts'])
    expect(tsconfig.exclude).toEqual(['src/*.test.ts'])
    expect(tsconfig.compilerOptions).toMatchObject({ strict: true, rootDir: 'src', outDir: 'dist', types: ['chrome'] })
    const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
    execFileSync(process.execPath, [tsc, '-p', path.join('extension-erp', 'tsconfig.json'), '--noEmit'], {
      cwd: ROOT,
      stdio: 'pipe',
    })
  })

  it('AC-3601.1: package.json ext-erp:build는 dist를 지우고 tsc 뒤 manifest.json·options.html을 dist로 복사한다', () => {
    const { scripts } = readJson(path.join(ROOT, 'package.json')) as { scripts: Record<string, string> }
    const script = scripts['ext-erp:build']
    expect(script, 'ext-erp:build가 없다').toBeDefined()
    const cleanAt = script.indexOf("rmSync('extension-erp/dist'")
    const tscAt = script.indexOf('tsc -p extension-erp/tsconfig.json')
    expect(cleanAt).toBeGreaterThanOrEqual(0)
    expect(tscAt).toBeGreaterThan(cleanAt)
    for (const file of ['manifest.json', 'options.html']) {
      expect(script.indexOf(file, tscAt), file).toBeGreaterThan(tscAt)
    }
    expect(script.slice(tscAt)).toContain('extension-erp/dist/')
  })
})
