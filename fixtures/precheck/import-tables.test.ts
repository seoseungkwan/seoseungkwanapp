import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

// 옮기기 스크립트 scripts/precheck/import-tables.mjs (REQ-007 AC-007.3). 진짜 원본(저장소 밖) 대신
// 원본과 같은 폴더 모양의 아주 작은 가짜 원본 fixtures/precheck/fake-source/로 돌린다(실제 원본을 복사하지 않고 새로 지은 파일)

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SCRIPT = join(ROOT, 'scripts/precheck/import-tables.mjs')
const FAKE_SOURCE = join(ROOT, 'fixtures/precheck/fake-source')
const OUTPUTS = ['codeMap.json', 'drugInfo.json', 'dxFlags.json', 'rules.json']
// 원본에만 있어야 하는 파일 이름(저장소에는 가짜 원본 폴더 밖에 두지 않는다)
const SOURCE_FILES = ['precheck_rules.json', 'dx_flags.json', 'drug_class_map.json', 'mx999_v22.html']

const temps: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'precheck-import-'))
  temps.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

function runImport(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 30_000,
    env: { ...process.env, ...env },
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

const read = (dir: string, name: string) => readFileSync(join(dir, name))
const readJson = (dir: string, name: string): unknown => JSON.parse(read(dir, name).toString('utf-8'))

describe('AC-007.3 옮기기 스크립트는 같은 원본이면 같은 바이트를 쓴다', () => {
  it('AC-007.3: 가짜 원본으로 두 번 돌리면 네 표가 바이트까지 같다(다른 폴더·같은 폴더 덮어쓰기 모두)', () => {
    const first = tempDir()
    const second = tempDir()
    expect(runImport(['--src', FAKE_SOURCE, '--out', first]).status).toBe(0)
    expect(runImport(['--src', FAKE_SOURCE, '--out', second]).status).toBe(0)
    const before = OUTPUTS.map((name) => read(first, name))
    for (const [i, name] of OUTPUTS.entries()) expect(read(second, name).equals(before[i]), name).toBe(true)
    expect(runImport(['--src', FAKE_SOURCE, '--out', first]).status).toBe(0)
    for (const [i, name] of OUTPUTS.entries()) expect(read(first, name).equals(before[i]), name).toBe(true)
    for (const name of OUTPUTS) {
      const text = read(first, name).toString('utf-8')
      expect(text.endsWith('}\n'), name).toBe(true)
      expect(text.includes('\r'), name).toBe(false)
    }
  })

  it('AC-007.3: 원본 파일을 복사하지 않는다 — 나오는 것은 옮긴 표 네 개뿐이다', () => {
    const out = tempDir()
    expect(runImport(['--src', FAKE_SOURCE, '--out', out]).status).toBe(0)
    expect(readdirSync(out).sort()).toEqual(OUTPUTS)
  })

  it('AC-007.3: 원본 경로를 --src 인자로 주지 않으면 실패하고 아무것도 쓰지 않는다(환경 변수 YANGJI_SRC가 있어도)', () => {
    const out = tempDir()
    const result = runImport(['--out', out], { YANGJI_SRC: FAKE_SOURCE })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('--src')
    expect(readdirSync(out)).toEqual([])
  })

  it('AC-007.3: 없는 원본 경로면 실패하고 아무것도 쓰지 않는다', () => {
    const out = tempDir()
    const result = runImport(['--src', join(tempDir(), 'no-such-source'), '--out', out])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('원본')
    expect(readdirSync(out)).toEqual([])
  })

  it('AC-007.3: 원본 화면 파일에 CODEMAP 블록이 없으면 실패하고 아무것도 쓰지 않는다(반쪽 표를 쓰지 않음)', () => {
    const source = tempDir()
    cpSync(FAKE_SOURCE, source, { recursive: true })
    writeFileSync(join(source, 'assets/mx999_v22.html'), '<!doctype html><script>let OTHER = {};</script>\n')
    const out = tempDir()
    const result = runImport(['--src', source, '--out', out])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('CODEMAP')
    expect(readdirSync(out)).toEqual([])
  })
})

describe('AC-007.3 가짜 원본에서 옮긴 값(원본 화면이 쓰는 모양)', () => {
  const out = tempDir()
  const ran = runImport(['--src', FAKE_SOURCE, '--out', out])

  it('AC-007.3: 규칙표는 원본 파일 그대로(키 순서까지) 옮긴다', () => {
    expect(ran.status).toBe(0)
    const original = JSON.parse(readFileSync(join(FAKE_SOURCE, 'tools/precheck_rules.json'), 'utf-8'))
    const rules = readJson(out, 'rules.json')
    expect(JSON.stringify(rules)).toBe(JSON.stringify(original))
    expect((rules as { rules: unknown[] }).rules).toHaveLength(3)
  })

  it('AC-007.3: 상병은 원본 precheck_dx_flags()처럼 I·N만 정렬해 싣고, N에서 V~Y 대분류를 뺀다', () => {
    expect(ran.status).toBe(0)
    expect(readJson(out, 'dxFlags.json')).toEqual({
      version: '가짜 상병마스터_990101',
      date: '2099-01-01',
      source: '시험용 가짜 상병마스터',
      I: ['Q99', 'W99', 'Z99', 'Z991'],
      N: ['Z990', 'Z991'],
    })
  })

  it('AC-007.3: 약은 원본 drug_info.lookup()처럼 9자리 코드의 세 칸만, 주성분명은 200자(글자 단위)까지 싣는다', () => {
    expect(ran.status).toBe(0)
    const drug = readJson(out, 'drugInfo.json') as { map: Record<string, string[]> }
    const long = '가'.repeat(199) + '𝔸'
    expect(drug).toEqual({
      version: '가짜 약제목록 2099.01.01.',
      base_date: '2099-01-01',
      source: '시험용 가짜 약제목록',
      fields: ['분류번호', '주성분코드', '주성분명'],
      map: {
        '999000010': ['114', '999901ATB', '가짜성분A 200mg'],
        '999000020': ['114', '999902ATB', '가짜성분B 100mg'],
        '999000060': ['', '999906ATB', '가짜성분C'],
        '099000030': ['141', '999903BIJ', long],
      },
    })
    expect(Array.from(drug.map['099000030'][2])).toHaveLength(200)
  })

  it('AC-007.3: 처방코드 사전은 원본 화면의 let CODEMAP = {…} 블록만 꺼내 JSON으로 바꾼다(주석·글자 안 중괄호 무시)', () => {
    expect(ran.status).toBe(0)
    expect(readJson(out, 'codeMap.json')).toEqual({
      ZZ001: { n: '가짜차단', k: 'proc', rg: 'knee' },
      ZZ002: { n: '가짜 {중괄호} 처치', k: 'note', rg: null, memo: '{부위} 가짜 메모 // 주석 아님' },
      ZZ003: { n: '작은따옴표', k: 'drug', rg: null },
    })
  })
})

describe('AC-007.3 저장소에 원본을 두지 않는다', () => {
  it('AC-007.3: 원본 파일 이름은 가짜 원본 폴더 밖에 없고, 가짜 원본은 작은 파일뿐이다', () => {
    const SKIP = new Set(['node_modules', '.git', '.next', 'bin', 'obj', 'dist'])
    const found: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!SKIP.has(entry.name)) walk(join(dir, entry.name))
        } else if (SOURCE_FILES.includes(entry.name)) {
          found.push(relative(ROOT, join(dir, entry.name)).split(sep).join('/'))
        }
      }
    }
    walk(ROOT)
    expect(found.sort()).toEqual([
      'fixtures/precheck/fake-source/assets/knowledge/drug_class_map.json',
      'fixtures/precheck/fake-source/assets/knowledge/dx_flags.json',
      'fixtures/precheck/fake-source/assets/mx999_v22.html',
      'fixtures/precheck/fake-source/tools/precheck_rules.json',
    ])
    for (const file of found) expect(statSync(join(ROOT, file)).size, file).toBeLessThan(16 * 1024)
    expect(existsSync(SCRIPT)).toBe(true)
  })
})
