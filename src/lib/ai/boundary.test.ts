import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 울타리 시험(REQ-513): 저장소 소스를 읽어 AI 파일이 규칙을 지키는지 판정한다.
// 판정 함수는 가짜 파일 목록으로 먼저 시험하고(어긴 것만 잡는지), 그다음 실제 저장소에 건다.

type SourceFile = { path: string; text: string } // path는 저장소 기준 '/' 경로

// 이 파일 안의 위반 견본이 저장소 검사에 걸리지 않게 SDK 이름은 이어 붙여 만든다
const SDK = '@anthropic' + '-ai/sdk'

const splitLines = (text: string) => text.split(/\r?\n/)

// 주석을 뺀 글자. 줄 앞에서 시작하는 /* */ 와 공백 뒤의 // 만 뺀다
// (글자 안의 'http://' 같은 것을 주석으로 오해해 위반을 숨기지 않게, 모자라게 뺀다)
function stripComments(text: string): string {
  const noBlock = text.replace(/(^|\n)[ \t]*\/\*[\s\S]*?\*\//g, '$1')
  return splitLines(noBlock)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
}

// import·export from·동적 import()·require()의 모듈 이름들 (줄이 나뉜 import도 \s가 줄바꿈을 먹는다)
const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g, // import x from / import type / export ... from
  /\bimport\s*['"]([^'"\n]+)['"]/g, // import 'x'
  /\bimport\s*\(\s*['"`]([^'"`\n]+)['"`]/g, // import('x')
  /\brequire\s*\(\s*['"`]([^'"`\n]+)['"`]/g, // require('x')
]
function moduleSpecifiers(text: string): string[] {
  const code = stripComments(text)
  const found: string[] = []
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const m of code.matchAll(pattern)) found.push(m[1])
  }
  return found
}

const isSdk = (spec: string) => spec.startsWith('@anthropic-ai/sdk')
const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '')))
function isImpureModule(spec: string): boolean {
  if (spec.startsWith('node:')) return true
  if (BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0])) return true // fs, path, crypto, fs/promises ...
  if (spec.startsWith('@supabase/') || /supabase/i.test(spec)) return true
  if (spec === 'next' || spec.startsWith('next/')) return true
  if (spec === 'react' || spec.startsWith('react/')) return true
  if (spec === 'react-dom' || spec.startsWith('react-dom/')) return true
  return isSdk(spec)
}

// AC-513.1
function sdkImportsOutsideAllowed(files: SourceFile[]): string[] {
  return files
    .filter((f) => !f.path.startsWith('src/app/api/ai/') && !f.path.startsWith('scripts/'))
    .filter((f) => moduleSpecifiers(f.text).some(isSdk))
    .map((f) => f.path)
}

// AC-513.2
function missingServerOnly(files: SourceFile[]): string[] {
  return files
    .filter(
      (f) =>
        f.path.startsWith('src/app/api/ai/') &&
        f.path.endsWith('.ts') &&
        !f.path.endsWith('.test.ts') &&
        path.posix.basename(f.path) !== 'route.ts',
    )
    .filter((f) => {
      const first = splitLines(f.text)[0].replace(/^﻿/, '')
      return !/^import\s+['"]server-only['"]\s*;?\s*$/.test(first)
    })
    .map((f) => f.path)
}

// AC-513.3
function impureLibAi(files: SourceFile[]): string[] {
  return files
    .filter((f) => f.path.startsWith('src/lib/ai/') && !f.path.endsWith('.test.ts'))
    .filter(
      (f) => moduleSpecifiers(f.text).some(isImpureModule) || /\bfetch\s*\(/.test(stripComments(f.text)),
    )
    .map((f) => f.path)
}

function toRepoPath(root: string, abs: string): string {
  const rel = path.win32.relative(root, abs) // win32 규칙은 '/'도 '\'도 알아본다
  return rel.replace(/\\/g, '/')
}

const SOURCE_DIRS = ['src', 'scripts', 'e2e', 'fixtures', 'supabase']
const SOURCE_EXT = /\.(ts|tsx|js|mjs|cjs)$/
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist'])
function readRepoSources(root: string): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (SOURCE_EXT.test(entry.name)) {
        out.push({ path: toRepoPath(root, abs), text: readFileSync(abs, 'utf8') })
      }
    }
  }
  for (const d of SOURCE_DIRS) {
    try {
      walk(path.join(root, d))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  return out
}

const root = fileURLToPath(new URL('../../..', import.meta.url))
const f = (p: string, text: string): SourceFile => ({ path: p, text })
const imp = (spec: string) => `import x from '${spec}'\n`

describe('저장소 훑기 도우미', () => {
  it("AC-513.1 윈도우 경로 구분자(\\)를 '/'로 바꿔 저장소 기준 경로로 만든다", () => {
    expect(toRepoPath('C:\\a\\b', 'C:\\a\\b\\src\\lib\\ai\\x.ts')).toBe('src/lib/ai/x.ts')
    expect(toRepoPath('/a/b', '/a/b/src/lib/ai/x.ts')).toBe('src/lib/ai/x.ts')
  })

  it('AC-513.1 훑은 파일 목록에 실제 파일이 들어 있고 node_modules·.next·.env는 없다', () => {
    const paths = readRepoSources(root).map((s) => s.path)
    expect(paths).toContain('src/app/api/ai/claude.ts')
    expect(paths).toContain('src/app/api/ai/report/route.ts')
    expect(paths).toContain('src/lib/ai/input.ts')
    expect(paths).toContain('src/lib/ai/boundary.test.ts')
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false)
    expect(paths.some((p) => p.startsWith('.next/') || p.includes('/.next/'))).toBe(false)
    expect(paths.some((p) => /(^|\/)\.env/.test(p))).toBe(false)
    expect(paths.every((p) => !p.includes('\\'))).toBe(true)
  })
})

describe('AC-513.1 SDK import는 src/app/api/ai/와 scripts/ 밖에 없다', () => {
  it('AC-513.1 판정 함수는 밖의 SDK import를 모양 가리지 않고 잡는다', () => {
    const files = [
      f('src/components/x.tsx', `import Anthropic from '${SDK}'\n`),
      f('src/lib/a.ts', `import type { Message } from "${SDK}/resources"\n`),
      f('src/lib/b.ts', `import {\r\n  APIError,\r\n  Foo,\r\n} from\r\n  '${SDK}'\r\n`),
      f('src/lib/c.ts', `import '${SDK}/shims/node'\n`),
      f('src/lib/d.ts', `const m = await import('${SDK}')\n`),
      f('e2e/lib/e.js', `const A = require("${SDK}")\n`),
      f('src/lib/f.ts', `export { default } from '${SDK}'\n`),
      f('supabase/g.mjs', `import A from '${SDK}'\n`),
      // 지킨 것
      f('src/app/api/ai/claude.ts', `import 'server-only'\nimport A from '${SDK}'\n`),
      f('src/app/api/ai/sub/deep.ts', `import A from '${SDK}'\n`),
      f('scripts/aiTry.ts', `import A from '${SDK}'\n`),
      f('src/lib/ai/ok.ts', `import { a } from './basis'\n`),
      f('src/lib/comment.ts', `// import A from '${SDK}'\n/*\n import B from '${SDK}'\n*/\nconst s = 1\n`),
    ]
    expect(sdkImportsOutsideAllowed(files).sort()).toEqual(
      [
        'e2e/lib/e.js',
        'src/components/x.tsx',
        'src/lib/a.ts',
        'src/lib/b.ts',
        'src/lib/c.ts',
        'src/lib/d.ts',
        'src/lib/f.ts',
        'supabase/g.mjs',
      ].sort(),
    )
  })

  it('AC-513.1 SDK import는 src/app/api/ai/와 scripts/ 밖에 없다(실제 저장소)', () => {
    const sources = readRepoSources(root)
    expect(sources.length).toBeGreaterThan(50)
    // 훑는 눈이 SDK를 아예 못 보는 게 아님을 확인: 허용 자리의 claude.ts를 밖으로 옮겨 보면 잡힌다
    const claude = sources.filter((s) => s.path === 'src/app/api/ai/claude.ts')
    expect(claude).toHaveLength(1)
    expect(sdkImportsOutsideAllowed([{ ...claude[0], path: 'src/x/claude.ts' }])).toEqual(['src/x/claude.ts'])
    expect(sdkImportsOutsideAllowed(sources)).toEqual([])
  })
})

describe("AC-513.2 src/app/api/ai/ 시험 아닌 .ts 파일의 첫 줄은 import 'server-only'다", () => {
  it('AC-513.2 판정 함수는 첫 줄이 다른 파일만 잡는다(route.ts·시험·밖의 파일 제외, CRLF·BOM 허용)', () => {
    const files = [
      f('src/app/api/ai/ok1.ts', `import 'server-only'\r\nimport a from './b'\r\n`),
      f('src/app/api/ai/ok2.ts', `import 'server-only';\nconst a = 1\n`),
      f('src/app/api/ai/ok3.ts', `\uFEFFimport "server-only"\r\n`),
      f('src/app/api/ai/sub/ok4.ts', `import 'server-only'\n`),
      f('src/app/api/ai/bad1.ts', `// 설명\nimport 'server-only'\n`),
      f('src/app/api/ai/bad2.ts', `\nimport 'server-only'\n`),
      f('src/app/api/ai/bad3.ts', `import a from './b'\nimport 'server-only'\n`),
      f('src/app/api/ai/bad4.ts', `import 'server-only-x'\n`),
      f('src/app/api/ai/bad5.ts', ``),
      f('src/app/api/ai/sub/bad6.ts', `export const a = 1\r\n`),
      // 빼는 것
      f('src/app/api/ai/report/route.ts', `import { a } from './b'\n`),
      f('src/app/api/ai/route.ts', `export const a = 1\n`),
      f('src/app/api/ai/x.test.ts', `import { it } from 'vitest'\n`),
      f('src/app/api/ai/y.tsx', `export const a = 1\n`),
      f('src/lib/ai/outside.ts', `export const a = 1\n`),
      f('scripts/s.ts', `export const a = 1\n`),
    ]
    expect(missingServerOnly(files).sort()).toEqual(
      [
        'src/app/api/ai/bad1.ts',
        'src/app/api/ai/bad2.ts',
        'src/app/api/ai/bad3.ts',
        'src/app/api/ai/bad4.ts',
        'src/app/api/ai/bad5.ts',
        'src/app/api/ai/sub/bad6.ts',
      ].sort(),
    )
  })

  it("AC-513.2 src/app/api/ai/ 시험 아닌 .ts 파일의 첫 줄은 import 'server-only'다(실제 저장소)", () => {
    const sources = readRepoSources(root)
    const names = sources
      .filter(
        (s) =>
          s.path.startsWith('src/app/api/ai/') &&
          s.path.endsWith('.ts') &&
          !s.path.endsWith('.test.ts') &&
          !s.path.endsWith('/route.ts'),
      )
      .map((s) => s.path)
    expect(names).toEqual(
      expect.arrayContaining(['src/app/api/ai/claude.ts', 'src/app/api/ai/generate.ts', 'src/app/api/ai/store.ts']),
    )
    expect(missingServerOnly(sources)).toEqual([])
  })
})

describe('AC-513.3 src/lib/ai/ 시험 아닌 파일은 순수 함수만이다', () => {
  const bad = (spec: string) => f('src/lib/ai/bad.ts', imp(spec))

  it.each([
    'node:fs',
    'node:fs/promises',
    'node:crypto',
    'fs',
    'fs/promises',
    'path',
    'crypto',
    'child_process',
    '@supabase/supabase-js',
    '@supabase/ssr',
    '@/lib/supabase/server',
    '../supabase/client',
    'next',
    'next/server',
    'next/headers',
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    SDK,
    `${SDK}/resources`,
  ])('AC-513.3 판정 함수는 %s import를 잡는다', (spec) => {
    expect(impureLibAi([bad(spec)])).toEqual(['src/lib/ai/bad.ts'])
  })

  it.each([
    (s: string) => `import x from '${s}'\n`,
    (s: string) => `import type { X } from "${s}"\n`,
    (s: string) => `import {\r\n  a,\r\n  b,\r\n} from\r\n  '${s}'\r\n`,
    (s: string) => `import '${s}'\n`,
    (s: string) => `export * from '${s}'\n`,
    (s: string) => `const m = await import('${s}')\n`,
    (s: string) => `const m = require("${s}")\n`,
  ])('AC-513.3 판정 함수는 import의 여러 모양(%#)을 놓치지 않는다', (shape) => {
    expect(impureLibAi([f('src/lib/ai/bad.ts', shape('node:fs'))])).toEqual(['src/lib/ai/bad.ts'])
    expect(impureLibAi([f('src/lib/ai/bad.ts', shape('@/lib/supabase/server'))])).toEqual(['src/lib/ai/bad.ts'])
    expect(impureLibAi([f('src/lib/ai/ok.ts', shape('./basis'))])).toEqual([])
  })

  it('AC-513.3 판정 함수는 fetch 호출을 잡고 이름만 닮은 것·주석은 놓아 준다', () => {
    const files = [
      f('src/lib/ai/f1.ts', `const r = await fetch('/x')\n`),
      f('src/lib/ai/f2.ts', `const r = globalThis.fetch ( url )\r\n`),
      f('src/lib/ai/ok1.ts', `const refetch = 1\nconst prefetch = (a: number) => a\nrefetch\n`),
      f('src/lib/ai/ok2.ts', `// fetch('x')로 부르지 않는다\nconst a = 1\n`),
      f('src/lib/ai/ok3.ts', `/*\n fetch('x')\n*/\nconst a = 1\n`),
    ]
    expect(impureLibAi(files).sort()).toEqual(['src/lib/ai/f1.ts', 'src/lib/ai/f2.ts'])
  })

  it('AC-513.3 판정 함수는 순수한 파일·시험 파일·밖의 파일은 잡지 않는다', () => {
    const files = [
      f(
        'src/lib/ai/pure.ts',
        `import { addMonths } from '@/lib/analytics/dates'\nimport type { A } from '@/types/aiReport'\nimport { b } from './basis'\r\n`,
      ),
      f('src/lib/ai/pure2.ts', `import { formatCount } from '@/components/charts/format'\n`),
      f('src/lib/ai/x.test.ts', `import { readFileSync } from 'node:fs'\nfetch('x')\n`),
      f('src/app/api/ai/claude.ts', `import Anthropic from '${SDK}'\nfetch('x')\n`),
      f('src/lib/other.ts', `import fs from 'node:fs'\n`),
    ]
    expect(impureLibAi(files)).toEqual([])
  })

  it('AC-513.3 src/lib/ai/ 시험 아닌 파일의 import에 supabase·next·react·SDK·node: 모듈과 fetch가 없다(실제 저장소)', () => {
    const sources = readRepoSources(root)
    const targets = sources.filter((s) => s.path.startsWith('src/lib/ai/') && !s.path.endsWith('.test.ts'))
    expect(targets.map((s) => s.path)).toEqual(
      expect.arrayContaining([
        'src/lib/ai/input.ts',
        'src/lib/ai/basis.ts',
        'src/lib/ai/prompt.ts',
        'src/lib/ai/cost.ts',
        'src/lib/ai/output.ts',
      ]),
    )
    expect(impureLibAi(sources)).toEqual([])
  })
})
