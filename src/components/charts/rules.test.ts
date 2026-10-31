import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// 차트 폴더 소스 규칙 (b2b-redesign REQ-205 AC-205.8, design.md '차트 부품', UI_GUIDE '차트').
// 폴더의 *.ts·*.tsx(시험 제외)를 모두 읽는다 → 다음 TASK(쌓은 막대·범례·순위 막대·줄 안 막대)의 파일도 저절로 들어온다.
// 서버에서 그대로 그린다(클라이언트 코드·움직임 없음), 색은 토큰 클래스로만, 그림은 늘 꾸밈(aria-hidden), 바깥에서는 타입만 불러온다
const ROOT = process.cwd()
const DIR = 'src/components/charts'

const chartSources = () =>
  readdirSync(join(ROOT, DIR))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => relative(ROOT, join(ROOT, DIR, name)))
    .sort()

const parse = (text: string, file: string) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

const walk = (node: ts.Node, visit: (n: ts.Node) => void) => {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

// 주석을 뺀 소스 글자(정규식 검사용). 문자열 안의 '//'(주소 등)는 차트 소스에 없다
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

// 문자열 조각(따옴표·템플릿 글자·JSX 속성 값)
const stringPieces = (source: ts.SourceFile) => {
  const pieces: string[] = []
  walk(source, (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      pieces.push(node.text)
    }
  })
  return pieces
}

const attrName = (attr: ts.JsxAttributeLike) => (ts.isJsxAttribute(attr) ? attr.name.getText() : '')
// JSX 속성 값: 따옴표 글자면 그 글자, {'글자'}면 그 글자, {true}면 'true', 그 밖(식)은 null
const attrValue = (attr: ts.JsxAttribute): string | null => {
  const init = attr.initializer
  if (!init) return 'true'
  if (ts.isStringLiteral(init)) return init.text
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text
    if (e.kind === ts.SyntaxKind.TrueKeyword) return 'true'
  }
  return null
}

const ALLOWED_OUTSIDE = new Set(['react', '@/types/analysis'])
const isTypeOnlyImport = (node: ts.ImportDeclaration) => {
  const clause = node.importClause
  if (!clause) return false // 부작용 import
  if (clause.isTypeOnly) return true
  if (clause.name) return false
  const bindings = clause.namedBindings
  return !!bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((el) => el.isTypeOnly)
}
// 폴더 안 파일끼리: './이름'(폴더를 벗어나지 않음)
const isInsideFolder = (spec: string) => /^\.\/[\w.-]+$/.test(spec)

const HOOK = /\buse(?:[A-Z]\w*)?\s*\(/
const TIMER = /\b(?:setInterval|setTimeout|requestAnimationFrame)\b/
const USE_CLIENT = /['"]use client['"]/
const HEX = /#[0-9a-fA-F]{3,8}\b/
const COLOR_FN = /\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/
const ROLE_IMG = /\brole\s*[:=]\s*\{?\s*['"`]img['"`]/
const MOTION_CLASS = /^!?(?:animate-|transition(?:-|$))/
const utilityOf = (token: string) => token.split(':').pop() ?? ''

// 소스 하나가 어긴 규칙(없으면 빈 배열)
function violations(text: string, file: string): string[] {
  const found: string[] = []
  const code = withoutComments(text)
  if (USE_CLIENT.test(code)) found.push("'use client'")
  if (HOOK.test(code)) found.push('React 훅')
  if (TIMER.test(code)) found.push('타이머')
  if (HEX.test(code)) found.push('16진수 색')
  if (COLOR_FN.test(code)) found.push('색 함수')
  if (ROLE_IMG.test(code)) found.push('role="img"')

  const source = parse(text, file)
  for (const piece of stringPieces(source)) {
    for (const token of piece.split(/\s+/).filter(Boolean)) {
      if (MOTION_CLASS.test(utilityOf(token))) found.push(`움직임 클래스 ${token}`)
    }
  }

  walk(source, (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText()
      const attrs = node.attributes.properties
      for (const attr of attrs) {
        if (ts.isJsxSpreadAttribute(attr)) {
          if (tag === 'svg') found.push('svg 속성 펼치기')
          continue
        }
        const name = attrName(attr)
        const value = attrValue(attr)
        if ((name === 'fill' || name === 'stroke') && !(value === 'currentColor' || value === 'none')) {
          found.push(`<${tag} ${name}=${value ?? '{식}'}>`)
        }
        if (name === 'role' && value === 'img') found.push('role="img"')
      }
      if (tag === 'svg') {
        const hidden = attrs.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && attrName(a) === 'aria-hidden')
        if (!hidden || attrValue(hidden) !== 'true') found.push('aria-hidden 없는 <svg>')
      }
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text
      if (!isInsideFolder(spec) && !(ALLOWED_OUTSIDE.has(spec) && isTypeOnlyImport(node))) found.push(`import ${spec}`)
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text
      if (!isInsideFolder(spec)) found.push(`export from ${spec}`)
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (callee.kind === ts.SyntaxKind.ImportKeyword) found.push('동적 import()')
      if (ts.isIdentifier(callee) && callee.text === 'require') found.push('require()')
    }
  })
  return found
}

describe('AC-205.8: 차트 폴더 소스 규칙 — 서버에서 그대로 그리고, 움직임·16진수 색·role="img"가 없고, 바깥에서는 타입만 불러온다', () => {
  it('AC-205.8: 검사할 파일이 있다(빈 검사가 아니다)', () => {
    expect(chartSources()).toEqual(
      expect.arrayContaining(['src/components/charts/format.ts', 'src/components/charts/Sparkline.tsx', 'src/components/charts/KpiStat.tsx']),
    )
  })

  it('AC-205.8: 폴더의 모든 소스가 규칙을 지킨다', () => {
    const files = chartSources()
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(violations(readFileSync(join(ROOT, file), 'utf8'), file), file).toEqual([])
    }
  })

  it('AC-205.8: 그리는 부품(*.tsx)마다 svg가 있으면 모두 aria-hidden이다 — Sparkline·KpiStat에 svg가 실제로 있다', () => {
    for (const file of ['src/components/charts/Sparkline.tsx', 'src/components/charts/KpiStat.tsx']) {
      const source = parse(readFileSync(join(ROOT, file), 'utf8'), file)
      let svgs = 0
      walk(source, (node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === 'svg') svgs += 1
      })
      expect(svgs, file).toBeGreaterThan(0)
    }
  })

  it.each<[string, string]>([
    ['use client', "'use client'\nexport const A = 1"],
    ['useState', "import type { ReactNode } from 'react'\nexport function A() { const [a] = useState(0); return a }"],
    ['React.use', 'export function A(p: { x: Promise<number> }) { return use(p.x) }'],
    ['useId', 'export function A() { return useId() }'],
    ['setTimeout', 'export function A() { setTimeout(() => 0, 1); return null }'],
    ['setInterval', 'export const t = setInterval'],
    ['requestAnimationFrame', 'export const t = () => requestAnimationFrame(() => 0)'],
    ['animate-*', 'export const A = () => <div className="animate-pulse" />'],
    ['motion-safe:animate-*', 'export const A = () => <div className="motion-safe:animate-spin h-2" />'],
    ['transition', 'export const A = () => <div className="transition" />'],
    ['transition-colors', 'export const c = `bg-accent transition-colors`'],
    ['16진수 색', "export const c = '#2563EB'"],
    ['16진수 색(3자리)', 'export const A = () => <div data-c="#fff" />'],
    ['rgb(', "export const c = 'rgb(0, 0, 0)'"],
    ['fill 16진수', 'export const A = () => <svg aria-hidden="true"><path fill="#2563EB" /></svg>'],
    ['stroke 이름 색', 'export const A = () => <svg aria-hidden="true"><path stroke="white" /></svg>'],
    ['fill 식', 'export const A = (p: { c: string }) => <svg aria-hidden="true"><path fill={p.c} /></svg>'],
    ['role="img"', 'export const A = () => <svg aria-hidden="true" role="img" />'],
    ['aria-hidden 없는 svg', 'export const A = () => <svg width="8" />'],
    ['aria-hidden="false"', 'export const A = () => <svg aria-hidden="false" />'],
    ['next import', "import Link from 'next/link'\nexport const A = Link"],
    ['ui 묶음 import', "import { ds } from '@/components/ui/classes'\nexport const A = ds"],
    ['폴더 밖 상대 경로', "import { x } from '../ui/classes'\nexport const A = x"],
    ['react 값 import', "import { useMemo } from 'react'\nexport const A = useMemo"],
    ['analysis 값 import', "import { thing } from '@/types/analysis'\nexport const A = thing"],
    ['차트 라이브러리', "import type { BarProps } from 'recharts'\nexport type A = BarProps"],
    ['export from 밖', "export { x } from '@/lib/analytics/compare'"],
    ['동적 import', "export const A = () => import('@/lib/analytics/compare')"],
  ])('AC-205.8: 규칙이 잘못된 예(%s)를 잡는다', (_name, text) => {
    expect(violations(text, 'bad.tsx').length).toBeGreaterThan(0)
  })

  it('AC-205.8: 규칙이 맞는 예는 그냥 둔다(주석 속 글자·타입 import·폴더 안 import·currentColor·none)', () => {
    const ok = [
      "import type { ReactNode } from 'react'",
      "import { type JSX } from 'react'",
      "import type { Delta } from '@/types/analysis'",
      "import { formatCount } from './format'",
      "import { Sparkline } from './Sparkline'",
      "export { percentOf } from './format'",
      '// useState·setTimeout·#2563EB·animate-spin·role="img"은 주석이면 상관없다',
      '/* transition 없음 */',
      'export const A = (p: { n: ReactNode }) => (',
      '  <span className="text-small text-muted">',
      '    <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8"><path d="M4 1.2 7.4 6.8H.6z" fill="currentColor" /></svg>',
      '    <svg aria-hidden={true}><polyline fill="none" className="stroke-accent" strokeWidth="1.5" /></svg>',
      '    {p.n}',
      '  </span>',
      ')',
    ].join('\n')
    expect(violations(ok, 'ok.tsx')).toEqual([])
  })
})
