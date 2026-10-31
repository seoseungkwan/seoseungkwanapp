import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GoogleMark } from './GoogleMark'

// 구글 G 마크 (b2b-redesign REQ-214 AC-214.4, design.md '인증 화면'). 그림은 승인 시안 docs/mockups/b2b-redesign/parts.mjs의 gmark 그대로다.
// 구글 상표 네 색은 이 파일에만 있다(AC-202.3은 theme.test.ts가 16진수 색 전체로 본다)
const ROOT = process.cwd()
const SOURCE = 'src/components/common/GoogleMark.tsx'
const BRAND = ['#EA4335', '#4285F4', '#FBBC05', '#34A853']

const PARTS = readFileSync(join(ROOT, 'docs/mockups/b2b-redesign/parts.mjs'), 'utf8')
const GMARK = PARTS.slice(PARTS.indexOf('export const gmark'), PARTS.indexOf('</svg>`', PARTS.indexOf('export const gmark')))
// 시안의 path [fill, d]
const MOCK_PATHS = [...GMARK.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)].map((m) => [m[1], m[2]])

const attrsOf = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
const openTag = (html: string) => html.match(/^<svg\b[^>]*>/)?.[0] ?? ''
const pathsOf = (html: string) => [...html.matchAll(/<path\b([^>]*?)\/?>/g)].map((m) => attrsOf(m[1] ?? ''))

// 시험 파일 밖 src/의 *.css·*.ts·*.tsx(상대 경로)
function sources(dir = 'src'): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sources(rel)
    return /\.(css|tsx?)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [rel] : []
  })
}

describe('AC-214.4: GoogleMark — 구글 G(48×48 viewBox, 상표 네 색 path 4개)', () => {
  it('AC-214.4: 시안 gmark에서 path 네 개를 읽는다(빈 검사가 아니다)', () => {
    expect(MOCK_PATHS.map(([fill]) => fill)).toEqual(BRAND)
  })

  it.each([18, 24])('AC-214.4: size=%i이면 바깥 svg는 aria-hidden·그 크기·viewBox 0 0 48 48이고 다른 속성이 없다', (size) => {
    const html = renderToStaticMarkup(<GoogleMark size={size} />)
    expect(attrsOf(openTag(html))).toEqual({ 'aria-hidden': 'true', width: String(size), height: String(size), viewBox: '0 0 48 48' })
    expect(html.endsWith('</svg>')).toBe(true)
  })

  it('AC-214.4: 안쪽은 시안 gmark의 path 4개(상표 색 fill + d) 그대로이고 다른 원소가 없다', () => {
    const html = renderToStaticMarkup(<GoogleMark size={18} />)
    const inner = html.slice(openTag(html).length, -'</svg>'.length)
    expect(pathsOf(inner).map((p) => [p.fill, p.d])).toEqual(MOCK_PATHS)
    expect(pathsOf(inner).every((p) => Object.keys(p).length === 2)).toBe(true)
    expect([...inner.matchAll(/<(\w+)\b/g)].map((m) => m[1])).toEqual(['path', 'path', 'path', 'path'])
  })

  it('AC-214.4: 구글 상표 네 색은 시험 파일 밖 src/에서 GoogleMark.tsx에만 있다(대소문자 무시)', () => {
    const files = sources()
    expect(files.length).toBeGreaterThan(50)
    const found = files.filter((rel) => BRAND.some((hex) => readFileSync(join(ROOT, rel), 'utf8').toLowerCase().includes(hex.toLowerCase())))
    expect(found).toEqual([SOURCE])
  })
})
