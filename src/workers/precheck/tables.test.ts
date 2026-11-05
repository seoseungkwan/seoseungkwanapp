import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 점검 표 불러오기(REQ-007 AC-007.4·AC-007.5). 가짜 로더를 넣어 한 번만 부르는지·실패하면 번호만 돌려주는지 보고,
// src/ 전체 소스를 읽어 표 파일을 부르는 곳이 workers/precheck/tables.ts의 글자 고정 import()뿐인지 본다

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SRC = join(ROOT, 'src')
const DATA_DIR = join(SRC, 'lib/precheck/data')
const TABLES_FILE = 'src/workers/precheck/tables.ts'
const THIS_FILE = 'src/workers/precheck/tables.test.ts'
const TABLE_NAMES = ['rules', 'dxFlags', 'drugInfo', 'codeMap'] as const

const loadModule = () => import('./tables')
const readRaw = () =>
  Object.fromEntries(
    TABLE_NAMES.map((name) => [name, JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), 'utf-8')) as unknown]),
  ) as Record<(typeof TABLE_NAMES)[number], unknown>

/** 하나 기다렸다 푸는 약속(같이 부른 두 번이 한 번의 불러오기를 나눠 쓰는지 보려고) */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('AC-007.5 loadTables는 네 표를 한 번만 불러 기억한다', () => {
  it('AC-007.5: 여러 번(같이) 불러도 로더는 한 번만 돌고 같은 표를 돌려준다', async () => {
    const { createTableLoader } = await loadModule()
    const raw = readRaw()
    const gate = deferred<typeof raw>()
    let calls = 0
    const loadTables = createTableLoader(() => {
      calls += 1
      return gate.promise
    })
    const first = loadTables()
    const second = loadTables()
    gate.resolve(raw)
    const [a, b] = await Promise.all([first, second])
    const c = await loadTables()
    expect(calls).toBe(1)
    expect(a.ok && b.ok && c.ok).toBe(true)
    if (!a.ok || !b.ok || !c.ok) return
    expect(b.value).toBe(a.value)
    expect(c.value).toBe(a.value)
    expect(a.value.rules.rules).toHaveLength(262)
  })

  it('AC-007.5: 불러오기가 실패하면 E-RULES-LOAD-FAILED를 돌려주고, 기억을 비워 다음에 다시 부른다', async () => {
    const { createTableLoader } = await loadModule()
    const raw = readRaw()
    let calls = 0
    const loadTables = createTableLoader(async () => {
      calls += 1
      if (calls === 1) throw new Error('가짜 실패: 청크를 받지 못함')
      return raw
    })
    expect(await loadTables()).toEqual({ ok: false, code: 'E-RULES-LOAD-FAILED' })
    const again = await loadTables()
    expect(calls).toBe(2)
    expect(again.ok).toBe(true)
  })

  it('AC-007.5: 표 모양이 틀리면(검사 실패) 점검을 시작할 표를 주지 않고 E-RULES-LOAD-FAILED만 돌려준다', async () => {
    const { createTableLoader } = await loadModule()
    const raw = readRaw()
    const bad = { ...raw, dxFlags: { ...(raw.dxFlags as Record<string, unknown>), I: 'M545' } }
    const result = await createTableLoader(async () => bad)()
    // 원래 오류 글(어느 칸이 틀렸는지)은 싣지 않는다. 번호만
    expect(result).toEqual({ ok: false, code: 'E-RULES-LOAD-FAILED' })
  })

  it('AC-007.5: 실제 loadTables()는 글자 고정 import()로 네 표를 불러 검사한 뒤 기억한다', async () => {
    const { loadTables } = await loadModule()
    const first = await loadTables()
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.rules.rules).toHaveLength(262)
    expect(first.value.dxFlags.I).toContain('M545')
    expect(Object.keys(first.value.drugInfo.map)).toHaveLength(22062)
    expect(first.value.codeMap.LA247).toEqual({ n: 'SSNB', k: 'proc', rg: 'shoulder' })
    const second = await loadTables()
    expect(second.ok && second.value).toBe(first.value)
  }, 30_000) // 2MB 표를 처음 변환하느라 전체 시험이 같이 돌 때 느릴 수 있다
})

// ── AC-007.4 소스 검사 ─────────────────────────────────────

type ModuleRef = { kind: 'static' | 'dynamic' | 'require'; spec: string }

/** 소스 글에서 모듈을 부르는 곳(정적 import·export from·동적 import()·require())을 모두 찾는다. 동적 import는 괄호 안 글 그대로 */
function moduleRefs(source: string): ModuleRef[] {
  const refs: ModuleRef[] = []
  const patterns: [ModuleRef['kind'], RegExp][] = [
    ['static', /\b(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?['"]([^'"]+)['"]/g],
    ['dynamic', /\bimport\s*\(\s*([^)]*?)\s*\)/g],
    ['require', /\brequire\s*\(\s*([^)]*?)\s*\)/g],
  ]
  for (const [kind, pattern] of patterns) for (const match of source.matchAll(pattern)) refs.push({ kind, spec: match[1] })
  return refs
}

/** 부르는 경로가 lib/precheck/data의 표 파일을 가리키나(@/ 별칭·상대 경로·?url 같은 꼬리 모두) */
function pointsAtTable(fromFile: string, spec: string): boolean {
  const text = spec.replace(/^[`'"]|[`'"]$/g, '').replace(/[?#].*$/, '')
  const resolved = text.startsWith('@/')
    ? posix.join('src', text.slice(2))
    : text.startsWith('.')
      ? posix.join(posix.dirname(fromFile), text)
      : text
  return /(^|\/)lib\/precheck\/data(\/|$)/.test(resolved) || /(^|\/)precheck\/data\//.test(text)
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(entry.name)) out.push(relative(ROOT, full).split(sep).join('/'))
  }
  return out
}

describe('AC-007.4 표 파일을 부르는 곳은 workers/precheck/tables.ts의 글자 고정 import()뿐이다', () => {
  it('AC-007.4: 검사기가 정적 import·export from·require·상대 경로·꼬리 붙은 경로·동적 import()를 알아본다', () => {
    // 경로를 글자 조각으로 이어 붙인다(이 시험 파일 자체가 표를 부르는 것으로 읽히지 않게)
    const at = (path: string) => `'${path}'`
    const data = 'lib/precheck/' + 'data'
    const samples: [string, string][] = [
      [`import rules from ${at(`@/${data}/rules.json`)}`, 'src/components/claim/x.tsx'],
      [`import type X from ${at(`@/${data}/rules.json`)}`, 'src/components/claim/x.tsx'],
      [`export { default } from ${at(`@/${data}/codeMap.json`)}`, 'src/lib/precheck/x.ts'],
      [`import * as all from ${at(`./${'data'}/drugInfo.json`)}`, 'src/lib/precheck/x.ts'],
      [`const t = require(${at(`../../${data}/dxFlags.json`)})`, 'src/app/x/y.ts'],
      [`const u = await import(${at(`@/${data}/rules.json?url`)})`, 'src/components/x.tsx'],
      [`import(\`@/${data}/\${name}.json\`)`, 'src/workers/x.ts'],
    ]
    for (const [source, file] of samples) {
      const hits = moduleRefs(source).filter((ref) => pointsAtTable(file, ref.spec))
      expect(hits, source).toHaveLength(1)
    }
    expect(moduleRefs(`import { x } from ${at('@/lib/precheck/rules')}`).filter((r) => pointsAtTable('src/a.ts', r.spec))).toEqual([])
  })

  it('AC-007.4: src/ 전체에서 표 파일을 부르는 곳은 tables.ts 하나이고, 거기서도 정적 import 없이 글자 고정 import() 네 개뿐이다', () => {
    const files = sourceFiles(SRC)
    expect(files).toContain(TABLES_FILE)
    const users = new Map<string, ModuleRef[]>()
    for (const file of files) {
      if (file === THIS_FILE) continue // 위 검사기 시험의 견본 글만 있다
      const refs = moduleRefs(readFileSync(join(ROOT, file), 'utf-8')).filter((ref) => pointsAtTable(file, ref.spec))
      if (refs.length) users.set(file, refs)
    }
    expect([...users.keys()]).toEqual([TABLES_FILE])
    expect(users.get(TABLES_FILE)).toEqual(
      TABLE_NAMES.map((name) => ({ kind: 'dynamic', spec: `'@/lib/precheck/data/${name}.json'` })),
    )
  })

  it('AC-007.4: data 폴더에는 표 네 개(JSON)만 있다', () => {
    expect(readdirSync(DATA_DIR).sort()).toEqual(TABLE_NAMES.map((name) => `${name}.json`).sort())
    expect(dirname(join(ROOT, TABLES_FILE))).toBe(join(SRC, 'workers/precheck'))
  })
})
