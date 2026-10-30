import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AuthFrame } from '@/components/auth/AuthFrame'
import SiteHeader from '@/components/landing/SiteHeader'
import { AppShell } from '@/components/shell/AppShell'
import { LogoMark } from './LogoMark'

// 로고 마크 한 색 (REQ-103, design.md '로고', 시안 docs/mockups/landing-v2 .logo svg).
// 마크는 LogoMark 하나에서만 그리고, 색은 currentColor 하나 → 부모 글자색(ink)을 따른다

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
// 마크업 안 로고 svg(viewBox 0 0 30 30) 전부
const logosIn = (html: string): string[] => html.match(/<svg\b[^>]*viewBox="0 0 30 30"[^>]*>[\s\S]*?<\/svg>/g) ?? []
const withoutClass = (attrs: Record<string, string>) => Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== 'class'))

const RECTS = [
  { x: '9', y: '3', width: '12', height: '6', rx: '3' },
  { x: '11', y: '12', width: '12', height: '6', rx: '3' },
  { x: '8', y: '21', width: '12', height: '6', rx: '3' },
]

describe('AC-103.1: LogoMark 마크업', () => {
  it('AC-103.1: <LogoMark size={22} />의 svg는 aria-hidden·22×22·viewBox 0 0 30 30·fill none·stroke currentColor·stroke-width 2.4다(시안과 같다)', () => {
    const html = draw({ size: 22 })
    expect(openTag(html)).toBe(
      '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="2.4">',
    )
    expect(html.endsWith('</svg>')).toBe(true)
  })

  it('AC-103.1: 안에는 지금과 같은 자리의 rect 3개만 있다 — (9,3) (11,12) (8,21), 12×6, rx 3, rect에는 색·선 속성이 없다', () => {
    const html = draw({ size: 22 })
    const inner = html.slice(openTag(html).length, -'</svg>'.length)
    const rects = [...inner.matchAll(/<rect\b[^>]*>(?:<\/rect>)?/g)].map((m) => m[0])
    expect(rects.map(attrsOf)).toEqual(RECTS)
    // rect 말고 다른 원소·글자가 없다
    expect(rects.join('')).toBe(inner)
  })

  it('AC-103.1: 색 값(#…·rgb·hsl·style)이 없고 선 색은 currentColor 하나다', () => {
    for (const size of [22, 26]) {
      const html = draw({ size, className: 'shrink-0' })
      expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(html).not.toMatch(/rgba?\(|hsla?\(|color-mix\(|style=/i)
      expect(html.match(/\bstroke="[^"]*"/g)).toEqual(['stroke="currentColor"'])
      expect(html.match(/\bfill="[^"]*"/g)).toEqual(['fill="none"'])
    }
  })

  it('AC-103.1: size가 너비·높이가 되고 viewBox는 그대로다(앱 틀·인증 틀은 26)', () => {
    const attrs = attrsOf(openTag(draw({ size: 26 })))
    expect(attrs).toMatchObject({ width: '26', height: '26', viewBox: '0 0 30 30' })
  })

  it('AC-103.1: className을 넘기면 svg에 붙고, 안 넘기면 class가 없다', () => {
    const withClass = attrsOf(openTag(draw({ size: 26, className: 'shrink-0' })))
    expect(withClass.class).toBe('shrink-0')
    expect(withoutClass(withClass)).toEqual(attrsOf(openTag(draw({ size: 26 }))))
    expect(attrsOf(openTag(draw({ size: 22 })))).not.toHaveProperty('class')
  })
})

describe('AC-103.2: 로고는 LogoMark 한 곳에서 한 색으로', () => {
  const USERS = [
    { file: 'src/components/shell/AppShell.tsx', size: 26 },
    { file: 'src/components/auth/AuthFrame.tsx', size: 26 },
    { file: 'src/components/landing/SiteHeader.tsx', size: 22 },
  ]

  it('AC-103.2: rect 좌표 글자(x="9" y="3" 등)는 시험 밖 src/에서 src/components/common/LogoMark.tsx에만 있다', () => {
    for (const coord of ['x="9" y="3"', 'x="11" y="12"', 'x="8" y="21"']) {
      expect(sourceFiles().filter((rel) => read(rel).includes(coord)), coord).toEqual(['src/components/common/LogoMark.tsx'])
    }
  })

  it('AC-103.2: AppShell(26)·AuthFrame(26)·SiteHeader(22)는 LogoMark로 그리고, 세 파일에 #14C8BA·#6D5DF5(대소문자 무시)와 직접 그린 svg가 없다', () => {
    for (const { file, size } of USERS) {
      const src = read(file)
      expect(src, file).toMatch(/^import \{ LogoMark \} from '@\/components\/common\/LogoMark'$/m)
      expect(src.match(/<LogoMark\b[^>]*\/>/g) ?? [], file).toHaveLength(1)
      expect(src, file).toMatch(new RegExp(`<LogoMark size=\\{${size}\\}[^>]*/>`))
      expect(src, file).not.toMatch(/#14C8BA|#6D5DF5/i)
      expect(src, file).not.toMatch(/<svg\b|<rect\b/)
    }
  })

  it('AC-103.2: 그린 화면의 로고는 LogoMark와 같은 svg 하나이고 색은 부모 글자색(ink)을 따른다', () => {
    const screens = [
      {
        name: 'AppShell',
        size: 26,
        html: renderToStaticMarkup(
          <AppShell hospitalName="병원" email="a@b.c" isAdmin={false}>
            본문
          </AppShell>,
        ),
      },
      { name: 'AuthFrame', size: 26, html: renderToStaticMarkup(<AuthFrame>본문</AuthFrame>) },
      { name: 'SiteHeader', size: 22, html: renderToStaticMarkup(<SiteHeader />) },
    ]
    for (const { name, size, html } of screens) {
      const logos = logosIn(html)
      expect(logos, name).toHaveLength(1)
      const [logo = ''] = logos
      const mark = draw({ size })
      // class(배치용 shrink-0 등)만 다를 수 있고 속성·안쪽 rect는 LogoMark 그대로
      expect(withoutClass(attrsOf(openTag(logo))), name).toEqual(attrsOf(openTag(mark)))
      expect(logo.slice(openTag(logo).length), name).toBe(mark.slice(openTag(mark).length))
      // svg에 글자색·선색 클래스를 따로 주지 않는다 → currentColor가 부모 글자색을 따른다
      expect(attrsOf(openTag(logo)).class ?? '', name).not.toMatch(/(^|\s)(text|stroke|fill)-/)
      // 앱 틀·인증 틀 뿌리는 글자색 ink(랜딩 메뉴는 .logo 글자색)
      if (name !== 'SiteHeader') {
        expect((attrsOf(html.match(/^<div\b[^>]*>/)?.[0] ?? '').class ?? '').split(' '), name).toContain('text-ink')
      }
    }
  })
})
