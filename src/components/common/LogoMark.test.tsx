import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AuthFrame } from '@/components/auth/AuthFrame'
import SiteHeader from '@/components/landing/SiteHeader'
import { AppShell } from '@/components/shell/AppShell'
import { LogoMark } from './LogoMark'

// 로고 마크 병원 십자 C③ (REQ-103, design.md '로고', 비교 시안 docs/mockups/landing-v2/logo-options.html C③).
// 마크는 LogoMark 하나에서만 그린다. 색은 테두리 청록 #14C8BA · 십자 보라 #6D5DF5로 고정한다(currentColor 아님)

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))

const draw = (props: { size: number; className?: string }) => renderToStaticMarkup(<LogoMark {...props} />)

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

// 시험 파일 밖 src/ 소스 전부(상대 경로)
function sourceFiles(dir = 'src'): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(rel)
    if (/\.test\.tsx?$/.test(entry.name)) return []
    return /\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(entry.name) ? [rel] : []
  })
}

// 태그 하나의 속성 → { 이름: 값 } (속성 순서 그대로)
const attrsOf = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
const openTag = (html: string) => html.match(/^<svg\b[^>]*>/)?.[0] ?? ''
const innerOf = (html: string) => html.slice(openTag(html).length, -'</svg>'.length)
// 마크업 안 로고 svg(viewBox 0 0 30 30) 전부
const logosIn = (html: string): string[] => html.match(/<svg\b[^>]*viewBox="0 0 30 30"[^>]*>[\s\S]*?<\/svg>/g) ?? []
const withoutClass = (attrs: Record<string, string>) => Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== 'class'))

const TEAL = '#14C8BA'
const VIOLET = '#6D5DF5'
const CROSS =
  'M13.5 8h3a1 1 0 0 1 1 1v3.5H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3.5V21a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3.5H9a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h3.5V9a1 1 0 0 1 1-1z'

// 안쪽 원소 [태그, 속성] (시안 C③ 그대로, 이 순서)
const INNER: [string, Record<string, string>][] = [
  ['rect', { x: '3', y: '3', width: '24', height: '24', rx: '6', fill: 'none', stroke: TEAL, 'stroke-width': '2.4' }],
  ['path', { d: CROSS, fill: VIOLET }],
]
const OLD_COORDS = ['x="9" y="3"', 'x="11" y="12"', 'x="8" y="21"']

describe('AC-103.1: LogoMark 마크업', () => {
  it('AC-103.1: <LogoMark size={22} />의 바깥 svg는 aria-hidden·22×22·viewBox 0 0 30 30뿐이고 fill·stroke가 없다', () => {
    const html = draw({ size: 22 })
    expect(openTag(html)).toBe('<svg aria-hidden="true" width="22" height="22" viewBox="0 0 30 30">')
    expect(attrsOf(openTag(html))).not.toHaveProperty('fill')
    expect(attrsOf(openTag(html))).not.toHaveProperty('stroke')
    expect(html.endsWith('</svg>')).toBe(true)
  })

  it('AC-103.1: 안에는 정확히 두 원소가 이 순서로 있다 — 테두리 rect(#14C8BA, 선 2.4) · 십자 path(#6D5DF5)', () => {
    const inner = innerOf(draw({ size: 22 }))
    const elements = [...inner.matchAll(/<(\w+)\b([^>]*?)\/?>(?:<\/\1>)?/g)]
    expect(elements.map((m) => [m[1], attrsOf(m[2] ?? '')])).toEqual(INNER)
    // 두 원소 말고 다른 원소·글자가 없다
    expect(elements.map((m) => m[0]).join('')).toBe(inner)
  })

  it('AC-103.1: 색은 #14C8BA·#6D5DF5 두 값으로 고정이고 currentColor·다른 색 값·style·빨강 계열이 없다', () => {
    for (const size of [22, 26]) {
      const html = draw({ size, className: 'shrink-0' })
      expect(html).not.toMatch(/currentColor/i)
      expect(html).not.toMatch(/rgba?\(|hsla?\(|color-mix\(|style=|\bred\b/i)
      expect(html.match(/#[0-9a-f]{3,8}\b/gi)).toEqual([TEAL, VIOLET])
      expect(html.match(/\bstroke="[^"]*"/g)).toEqual([`stroke="${TEAL}"`])
      expect(html.match(/\bfill="[^"]*"/g)).toEqual(['fill="none"', `fill="${VIOLET}"`])
    }
  })

  it('AC-103.1: size가 너비·높이가 되고 viewBox·안쪽 원소는 그대로다(앱 틀·인증 틀은 26)', () => {
    const html = draw({ size: 26 })
    expect(attrsOf(openTag(html))).toMatchObject({ width: '26', height: '26', viewBox: '0 0 30 30' })
    expect(innerOf(html)).toBe(innerOf(draw({ size: 22 })))
  })

  it('AC-103.1: className을 넘기면 svg에 붙고, 안 넘기면 class가 없다', () => {
    const withClass = attrsOf(openTag(draw({ size: 26, className: 'shrink-0' })))
    expect(withClass.class).toBe('shrink-0')
    expect(withoutClass(withClass)).toEqual(attrsOf(openTag(draw({ size: 26 }))))
    expect(attrsOf(openTag(draw({ size: 22 })))).not.toHaveProperty('class')
  })
})

describe('AC-103.2: 로고는 LogoMark 한 곳에서', () => {
  const USERS = [
    { file: 'src/components/shell/AppShell.tsx', size: 24 },
    { file: 'src/components/auth/AuthFrame.tsx', size: 28 },
    { file: 'src/components/landing/SiteHeader.tsx', size: 22 },
  ]

  it('AC-103.2: 십자 path 글자(M13.5 8h3)는 시험 밖 src/에서 src/components/common/LogoMark.tsx에만 있다', () => {
    expect(sourceFiles().filter((rel) => read(rel).includes('M13.5 8h3'))).toEqual(['src/components/common/LogoMark.tsx'])
  })

  it('AC-103.2: 옛 막대 좌표 글자(x="9" y="3"·x="11" y="12"·x="8" y="21")는 시험 밖 src/ 어디에도 없다', () => {
    for (const coord of OLD_COORDS) {
      expect(sourceFiles().filter((rel) => read(rel).includes(coord)), coord).toEqual([])
    }
  })

  it('AC-103.2: AppShell(24)·AuthFrame(28)·SiteHeader(22)는 LogoMark로 그리고, 세 파일에 #14C8BA·#6D5DF5(대소문자 무시)와 직접 그린 svg가 없다', () => {
    for (const { file, size } of USERS) {
      const src = read(file)
      expect(src, file).toMatch(/^import \{ LogoMark \} from '@\/components\/common\/LogoMark'$/m)
      expect(src.match(/<LogoMark\b[^>]*\/>/g) ?? [], file).toHaveLength(1)
      expect(src, file).toMatch(new RegExp(`<LogoMark size=\\{${size}\\}[^>]*/>`))
      expect(src, file).not.toMatch(/#14C8BA|#6D5DF5/i)
      expect(src, file).not.toMatch(/<svg\b|<rect\b/)
    }
  })

  it('AC-103.2: 그린 화면마다 로고 svg(viewBox 0 0 30 30)가 하나이고 LogoMark 출력과 같다(배치용 class만 다를 수 있음)', () => {
    const screens = [
      {
        name: 'AppShell',
        size: 24,
        html: renderToStaticMarkup(
          <AppShell hospitalName="병원" email="a@b.c" isAdmin={false}>
            본문
          </AppShell>,
        ),
      },
      { name: 'AuthFrame', size: 28, html: renderToStaticMarkup(<AuthFrame>본문</AuthFrame>) },
      { name: 'SiteHeader', size: 22, html: renderToStaticMarkup(<SiteHeader />) },
    ]
    for (const { name, size, html } of screens) {
      const logos = logosIn(html)
      expect(logos, name).toHaveLength(1)
      const [logo = ''] = logos
      const mark = draw({ size })
      // class(배치용 shrink-0 등)만 다를 수 있고 속성·안쪽 두 원소는 LogoMark 그대로
      expect(withoutClass(attrsOf(openTag(logo))), name).toEqual(attrsOf(openTag(mark)))
      expect(logo.slice(openTag(logo).length), name).toBe(mark.slice(openTag(mark).length))
      // 배치용 class만: 고정 색을 덮는 글자색·선색·채움색 class가 없다
      expect(attrsOf(openTag(logo)).class ?? '', name).not.toMatch(/(^|\s)(text|stroke|fill)-/)
    }
  })
})
