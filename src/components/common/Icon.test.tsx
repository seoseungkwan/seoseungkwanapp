import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Icon, ICON_NAMES, type IconName } from './Icon'

// 16px 선 아이콘 (b2b-redesign REQ-204 TASK-4, UI_GUIDE '아이콘·로고'). 그림은 승인 시안 docs/mockups/b2b-redesign/parts.mjs의 I 그대로다.
// 소스 규칙(간격·색·모서리)은 classes.test.ts의 AC-204.6 검사 목록이 Icon.tsx를 읽어 본다
const ROOT = process.cwd()

const NAMES = [
  'shield',
  'lock',
  'clock',
  'cal',
  'upload',
  'user',
  'chev',
  'check',
  'x',
  'arrow',
  'arrowDown',
  'monitor',
  'server',
  'sigma',
  'doc',
  'stop',
] as const

// 시안의 I: { 이름: 안쪽 svg 글자 }
const PARTS = readFileSync(join(ROOT, 'docs/mockups/b2b-redesign/parts.mjs'), 'utf8')
const I_BLOCK = PARTS.slice(PARTS.indexOf('const I = {'), PARTS.indexOf('\n}', PARTS.indexOf('const I = {')))
const MOCK: Record<string, string> = Object.fromEntries([...I_BLOCK.matchAll(/^\s+(\w+): '([^']*)',$/gm)].map((m) => [m[1], m[2]]))

// tab-frame REQ-315: 새 두 이름은 대시보드 시안의 [복사]·[가입 승인] 단추 svg에서 읽는다(단추 글자 바로 앞의 svg)
const NEW_NAMES = ['copy', 'userCheck'] as const
const HOME = readFileSync(join(ROOT, 'docs/mockups/dashboard-home/index.html'), 'utf8')
const svgBefore = (label: string) => HOME.match(new RegExp(`(<svg\\b[^>]*>)((?:(?!</svg>).)*)</svg><span>${label}</span></button>`, 's'))
const HOME_SVG = { copy: svgBefore('복사'), userCheck: svgBefore('가입 승인') }

// ui-90 REQ-416(AC-416.7): logout은 시안 docs/mockups/ui-90/app/gen.py의 ICONS['logout'] 그대로다(계정 메뉴 [로그아웃])
const UI90 = readFileSync(join(ROOT, 'docs/mockups/ui-90/app/gen.py'), 'utf8')
const UI90_LOGOUT = UI90.match(/^ 'logout': '([^']*)',$/m)?.[1] ?? ''
const UI90_SVG_TAG = UI90.match(/def ic\([^)]*\):[\s\S]*?return f'(<svg\b[^>]*>)/)?.[1] ?? ''

const draw = (name: IconName, props: { size?: number; className?: string } = {}) => renderToStaticMarkup(<Icon name={name} {...props} />)
const attrsOf = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
const openTag = (html: string) => html.match(/^<svg\b[^>]*>/)?.[0] ?? ''
const innerOf = (html: string) => (html.endsWith('</svg>') ? html.slice(openTag(html).length, -'</svg>'.length) : '')
// 안쪽 원소 [태그, 속성]. React는 <path …></path>, 시안은 <path …/>로 적어서 여는 태그만 본다
const elementsOf = (inner: string) => [...inner.matchAll(/<(\w+)\b([^>]*?)\/?>/g)].map((m) => [m[1], attrsOf(m[2] ?? '')])

const SVG_ATTRS = {
  'aria-hidden': 'true',
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.5',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
}

describe('AC-204.6 아이콘 Icon (REQ-204, 시안 parts.mjs의 I)', () => {
  it('AC-204.6: 시안 I에서 읽은 그림이 16개 이름을 모두 갖는다(시험 준비 확인)', () => {
    for (const name of NAMES) expect(MOCK[name], name).toBeTruthy()
  })

  it('AC-204.6·AC-315.1·AC-416.7: 이름은 16개(shield·lock·clock·cal·upload·user·chev·check·x·arrow·arrowDown·monitor·server·sigma·doc·stop) 뒤에 copy·userCheck, 그 뒤에 logout을 더한 19개뿐이다', () => {
    expect([...ICON_NAMES]).toEqual([...NAMES, ...NEW_NAMES, 'logout'])
    expect(ICON_NAMES).toHaveLength(19)
  })

  it.each(NAMES)('AC-204.6: %s는 aria-hidden·viewBox 0 0 16 16·fill none·stroke currentColor·선 1.5이고 기본 16×16이다', (name) => {
    const html = draw(name)
    expect(attrsOf(openTag(html))).toEqual({ ...SVG_ATTRS, width: '16', height: '16' })
    expect(html.endsWith('</svg>')).toBe(true)
  })

  it.each(NAMES)('AC-204.6: %s의 안쪽 그림은 시안 I와 같고, 안쪽 원소에 색·style이 없다', (name) => {
    const inner = innerOf(draw(name))
    expect(elementsOf(inner), name).toEqual(elementsOf(MOCK[name] ?? ''))
    expect(elementsOf(inner).length, name).toBeGreaterThan(0)
    expect(inner, name).not.toMatch(/\b(?:fill|stroke|style|class)=/)
    expect(inner.replace(/<[^>]*>/g, ''), `${name} 글자`).toBe('')
  })

  it.each([12, 14, 16])('AC-204.6: size=%i가 너비·높이가 되고 viewBox·선 굵기는 그대로다', (size) => {
    const attrs = attrsOf(openTag(draw('shield', { size })))
    expect(attrs).toMatchObject({ width: String(size), height: String(size), viewBox: '0 0 16 16', 'stroke-width': '1.5' })
  })

  it('AC-204.6: className을 주면 svg에 붙고, 안 주면 class가 없다', () => {
    expect(attrsOf(openTag(draw('clock', { size: 12, className: 'shrink-0 text-muted' })))).toMatchObject({ class: 'shrink-0 text-muted' })
    expect(attrsOf(openTag(draw('clock')))).not.toHaveProperty('class')
  })

  it('AC-204.6: Icon.tsx는 서버에서 그대로 그린다(use client·React 훅이 없다)', () => {
    const src = readFileSync(join(ROOT, 'src/components/common/Icon.tsx'), 'utf8')
    expect(src).not.toMatch(/['"]use client['"]/)
    expect(src).not.toMatch(/\buse(?:State|Effect|Ref|Memo|Callback|LayoutEffect|Id)\b/)
  })
})

describe('AC-315.1 아이콘 둘 copy·userCheck (tab-frame REQ-315, 시안 dashboard-home의 [복사]·[가입 승인])', () => {
  it('AC-315.1: 시안에서 [복사]·[가입 승인] 단추의 svg를 읽었다(시험 준비 확인)', () => {
    for (const name of NEW_NAMES) expect(HOME_SVG[name]?.[2], name).toBeTruthy()
  })

  it('AC-315.1: 시안의 두 svg도 viewBox 0 0 16 16·선 1.5·currentColor·aria-hidden이다(시안이 같은 규칙으로 그렸다)', () => {
    for (const name of NEW_NAMES) expect(attrsOf(HOME_SVG[name]?.[1] ?? ''), name).toMatchObject(SVG_ATTRS)
  })

  it.each(NEW_NAMES)('AC-315.1: %s는 aria-hidden·viewBox 0 0 16 16·fill none·stroke currentColor·선 1.5이고 기본 16×16이다', (name) => {
    const html = draw(name)
    expect(attrsOf(openTag(html))).toEqual({ ...SVG_ATTRS, width: '16', height: '16' })
    expect(html.endsWith('</svg>')).toBe(true)
  })

  it.each(NEW_NAMES)('AC-315.1: %s의 안쪽 그림은 시안 단추의 svg 안쪽과 같고, 안쪽 원소에 색·style이 없다', (name) => {
    const inner = innerOf(draw(name))
    expect(elementsOf(inner), name).toEqual(elementsOf(HOME_SVG[name]?.[2] ?? ''))
    expect(elementsOf(inner).length, name).toBeGreaterThan(0)
    expect(inner, name).not.toMatch(/\b(?:fill|stroke|style|class)=/)
    expect(inner.replace(/<[^>]*>/g, ''), `${name} 글자`).toBe('')
  })

  it.each(NEW_NAMES.flatMap((name) => [12, 14, 16].map((size) => [name, size] as const)))(
    'AC-315.1: %s에 size=%i를 주면 너비·높이가 되고 viewBox·선 굵기는 그대로다',
    (name, size) => {
      const attrs = attrsOf(openTag(draw(name, { size })))
      expect(attrs).toMatchObject({ width: String(size), height: String(size), viewBox: '0 0 16 16', 'stroke-width': '1.5' })
    },
  )
})

describe('AC-416.7 아이콘 logout (ui-90 REQ-416, 시안 docs/mockups/ui-90/app/gen.py의 ICONS)', () => {
  it('AC-416.7: 시안에서 ICONS의 logout 그림과 ic()의 svg 태그를 읽었다(시험 준비 확인)', () => {
    expect(elementsOf(UI90_LOGOUT).length).toBeGreaterThan(0)
    expect(UI90_SVG_TAG).toMatch(/^<svg\b/)
  })

  it('AC-416.7: 시안의 ic()도 viewBox 0 0 16 16·선 1.5·currentColor·aria-hidden이다(시안이 같은 규칙으로 그렸다)', () => {
    expect(attrsOf(UI90_SVG_TAG)).toMatchObject(SVG_ATTRS)
  })

  it('AC-416.7: logout은 aria-hidden·viewBox 0 0 16 16·fill none·stroke currentColor·선 1.5이고 기본 16×16이다', () => {
    const html = draw('logout')
    expect(attrsOf(openTag(html))).toEqual({ ...SVG_ATTRS, width: '16', height: '16' })
    expect(html.endsWith('</svg>')).toBe(true)
  })

  it('AC-416.7: logout의 안쪽 그림은 시안 ICONS["logout"]과 같고, 안쪽 원소에 색·style이 없다', () => {
    const inner = innerOf(draw('logout'))
    expect(elementsOf(inner)).toEqual(elementsOf(UI90_LOGOUT))
    expect(elementsOf(inner)).toHaveLength(2)
    expect(inner).not.toMatch(/\b(?:fill|stroke|style|class)=/)
    expect(inner.replace(/<[^>]*>/g, ''), 'logout 글자').toBe('')
  })

  it.each([12, 14, 16])('AC-416.7: logout에 size=%i를 주면 너비·높이가 되고 viewBox·선 굵기는 그대로다', (size) => {
    const attrs = attrsOf(openTag(draw('logout', { size })))
    expect(attrs).toMatchObject({ width: String(size), height: String(size), viewBox: '0 0 16 16', 'stroke-width': '1.5' })
  })

  it('AC-416.7: Icon.tsx 머리 주석이 그림 출처 셋(b2b-redesign·dashboard-home·ui-90 시안)을 적는다', () => {
    const src = readFileSync(join(ROOT, 'src/components/common/Icon.tsx'), 'utf8')
    const head = src.slice(0, src.indexOf('export const ICON_NAMES'))
    for (const source of ['docs/mockups/b2b-redesign/parts.mjs', 'docs/mockups/dashboard-home/index.html', 'docs/mockups/ui-90/app/gen.py']) {
      expect(head, source).toContain(source)
    }
  })
})
