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

  it('AC-204.6·AC-315.1·AC-416.7·AC-017.9·AC-1507.3·AC-8006.2: 이름은 16개(shield·lock·clock·cal·upload·user·chev·check·x·arrow·arrowDown·monitor·server·sigma·doc·stop) 뒤에 copy·userCheck, 그 뒤에 logout, logout 뒤에 info·reload, reload 뒤에 alert, alert 뒤에 eye를 더한 23개뿐이다', () => {
    expect([...ICON_NAMES]).toEqual([...NAMES, ...NEW_NAMES, 'logout', 'info', 'reload', 'alert', 'eye'])
    expect(ICON_NAMES).toHaveLength(23)
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

// worklog AC-017.9: info·reload는 비트 표시 시안 docs/mockups/worklog/bitfill.html의 ICON_INFO·ICON_LOAD(viewBox 24)를 ×2/3 한 그림이다(design.md 20-5절).
// 바꿈이 있어 기대 그림은 design.md 글자 그대로 여기에 적고, 원소 종류·개수는 시안과 맞춰 본다
const BITFILL = readFileSync(join(ROOT, 'docs/mockups/worklog/bitfill.html'), 'utf8')
const BIT_SVG = {
  info: BITFILL.match(/const ICON_INFO = '(<svg\b[^>]*>)((?:(?!<\/svg>)[^'])*)<\/svg>';/),
  reload: BITFILL.match(/const ICON_LOAD = '(<svg\b[^>]*>)((?:(?!<\/svg>)[^'])*)<\/svg>';/),
}
const BIT_NAMES = ['info', 'reload'] as const
const BIT_SHAPES: Record<(typeof BIT_NAMES)[number], string> = {
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.33v3.67"/><path d="M8 5h.01"/>',
  reload: '<path d="M13.33 8a5.33 5.33 0 1 1-1.56-3.77"/><path d="M13.33 2.67v3.33h-3.33"/>',
}
const tagsOf = (inner: string) => elementsOf(inner).map(([tag]) => tag)

describe('AC-017.9 아이콘 둘 info·reload (worklog REQ-017, 시안 docs/mockups/worklog/bitfill.html의 ICON_INFO·ICON_LOAD)', () => {
  it('AC-017.9: 시안에서 ICON_INFO·ICON_LOAD 그림을 읽었다(시험 준비 확인)', () => {
    for (const name of BIT_NAMES) {
      expect(BIT_SVG[name]?.[1], name).toMatch(/^<svg\b/)
      expect(elementsOf(BIT_SVG[name]?.[2] ?? '').length, name).toBeGreaterThan(0)
    }
  })

  it('AC-017.9: 시안의 두 그림은 viewBox 24·currentColor·aria-hidden이다(×2/3 하면 16 칸이 된다)', () => {
    for (const name of BIT_NAMES) {
      expect(attrsOf(BIT_SVG[name]?.[1] ?? ''), name).toMatchObject({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'aria-hidden': 'true' })
    }
  })

  it.each(BIT_NAMES)('AC-017.9: %s는 aria-hidden·viewBox 0 0 16 16·fill none·stroke currentColor·선 1.5이고 기본 16×16이다', (name) => {
    const html = draw(name)
    expect(attrsOf(openTag(html))).toEqual({ ...SVG_ATTRS, width: '16', height: '16' })
    expect(html.endsWith('</svg>')).toBe(true)
  })

  it.each(BIT_NAMES)('AC-017.9: %s의 안쪽 그림은 design.md 20-5절 글자(시안 ×2/3)와 같다', (name) => {
    expect(elementsOf(innerOf(draw(name)))).toEqual(elementsOf(BIT_SHAPES[name]))
  })

  it.each(BIT_NAMES)('AC-017.9: %s의 원소 종류·개수는 시안과 같고(circle·path·path / path·path), 안쪽 원소에 색·style·글자가 없다', (name) => {
    const inner = innerOf(draw(name))
    expect(tagsOf(inner)).toEqual(tagsOf(BIT_SVG[name]?.[2] ?? ''))
    expect(tagsOf(inner)).toEqual(name === 'info' ? ['circle', 'path', 'path'] : ['path', 'path'])
    expect(inner, name).not.toMatch(/\b(?:fill|stroke|style|class)=/)
    expect(inner.replace(/<[^>]*>/g, ''), `${name} 글자`).toBe('')
  })

  it.each(BIT_NAMES.flatMap((name) => [12, 14, 16].map((size) => [name, size] as const)))(
    'AC-017.9: %s에 size=%i를 주면 너비·높이가 되고 viewBox·선 굵기는 그대로다',
    (name, size) => {
      const attrs = attrsOf(openTag(draw(name, { size })))
      expect(attrs).toMatchObject({ width: String(size), height: String(size), viewBox: '0 0 16 16', 'stroke-width': '1.5' })
    },
  )

  it('AC-017.9: Icon.tsx 머리 주석이 그림 출처(docs/mockups/worklog/bitfill.html의 ICON_INFO·ICON_LOAD, ×2/3)를 적는다', () => {
    const src = readFileSync(join(ROOT, 'src/components/common/Icon.tsx'), 'utf8')
    const head = src.slice(0, src.indexOf('export const ICON_NAMES'))
    expect(head).toContain('docs/mockups/worklog/bitfill.html')
    expect(head).toContain('ICON_INFO')
    expect(head).toContain('ICON_LOAD')
  })
})

// worklog-memo-font AC-1507.3: alert는 잘림 안내 시안 docs/mockups/worklog/memo-font.html의 ICON_WARN을 info의 원 크기(반지름 6)에 맞춘 그림이다(design.md '날짜 줄').
// 시안은 원 반지름 6.2·한 path에 줄과 점을 이어 적었다 → 기대 그림은 design.md 글자 그대로 여기에 적고, 시안과는 '원 안 세로 줄이 위·점이 아래' 모양을 맞춰 본다
const MEMO_FONT = readFileSync(join(ROOT, 'docs/mockups/worklog/memo-font.html'), 'utf8')
const WARN_SVG = MEMO_FONT.match(/const ICON_WARN = '(<svg\b[^>]*>)((?:(?!<\/svg>)[^'])*)<\/svg>'/)
const ALERT_SHAPE = '<circle cx="8" cy="8" r="6"/><path d="M8 4.67v3.66"/><path d="M8 11h.01"/>'
// 원 안 세로 줄(v 길이 0.5 넘음)의 위·아래 끝과 점(짧은 v·h)의 높이. path d의 'M8 y v길이'·'M8 y h길이' 조각을 읽는다
function lineAndDot(inner: string) {
  const pieces = elementsOf(inner)
    .filter(([tag]) => tag === 'path')
    .flatMap(([, attrs]) => [...String((attrs as Record<string, string>).d).matchAll(/M8 ([\d.]+)([vh])([\d.]+)/g)])
    .map((m) => ({ y: Number(m[1]), dir: m[2], len: Number(m[3]) }))
  const line = pieces.find((p) => p.dir === 'v' && p.len > 0.5)
  const dot = pieces.find((p) => p !== line)
  return { lineTop: line?.y ?? NaN, lineBottom: (line?.y ?? NaN) + (line?.len ?? NaN), dotY: dot?.y ?? NaN, count: pieces.length }
}
const circleOf = (inner: string) => elementsOf(inner).find(([tag]) => tag === 'circle')?.[1]

describe('AC-1507.3 아이콘 alert (worklog-memo-font REQ-1507, 시안 docs/mockups/worklog/memo-font.html의 ICON_WARN)', () => {
  it('AC-1507.3: 시안에서 ICON_WARN 그림을 읽었다(시험 준비 확인)', () => {
    expect(WARN_SVG?.[1]).toMatch(/^<svg\b/)
    expect(attrsOf(WARN_SVG?.[1] ?? '')).toMatchObject({ viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'aria-hidden': 'true' })
    expect(tagsOf(WARN_SVG?.[2] ?? '')).toEqual(['circle', 'path'])
  })

  it('AC-1507.3: alert는 reload 바로 뒤에 있다(그 뒤에는 admin-view의 eye 하나뿐)', () => {
    expect(ICON_NAMES.indexOf('alert')).toBe(ICON_NAMES.indexOf('reload') + 1)
    expect(ICON_NAMES.slice(ICON_NAMES.indexOf('alert') + 1)).toEqual(['eye'])
  })

  it('AC-1507.3: alert는 aria-hidden·viewBox 0 0 16 16·fill none·stroke currentColor·선 1.5이고 기본 16×16이다', () => {
    const html = draw('alert')
    expect(attrsOf(openTag(html))).toEqual({ ...SVG_ATTRS, width: '16', height: '16' })
    expect(html.endsWith('</svg>')).toBe(true)
  })

  it('AC-1507.3: alert의 안쪽 그림은 design.md 글자(원 반지름 6 + 세로 줄 + 점)와 같고, 안쪽 원소에 색·style·글자가 없다', () => {
    const inner = innerOf(draw('alert'))
    expect(elementsOf(inner)).toEqual(elementsOf(ALERT_SHAPE))
    expect(tagsOf(inner)).toEqual(['circle', 'path', 'path'])
    expect(inner).not.toMatch(/\b(?:fill|stroke|style|class)=/)
    expect(inner.replace(/<[^>]*>/g, ''), 'alert 글자').toBe('')
  })

  it('AC-1507.3: alert의 원은 info의 원과 같고, 세로 줄과 점은 info와 위아래가 바뀌었다(alert는 줄이 위·점이 아래, 시안 ICON_WARN과 같은 모양)', () => {
    const alert = innerOf(draw('alert'))
    const info = innerOf(draw('info'))
    expect(circleOf(alert)).toEqual(circleOf(info))
    expect(circleOf(alert)).toEqual({ cx: '8', cy: '8', r: '6' })

    const a = lineAndDot(alert)
    const i = lineAndDot(info)
    const w = lineAndDot(WARN_SVG?.[2] ?? '')
    for (const shape of [a, i, w]) expect(shape.count).toBe(2)
    expect(a.dotY).toBeGreaterThan(a.lineBottom) // 점이 줄 아래
    expect(i.dotY).toBeLessThan(i.lineTop) // info는 점이 줄 위
    expect(w.dotY).toBeGreaterThan(w.lineBottom) // 시안도 점이 줄 아래
    // 줄과 점은 원(반지름 6) 안이다
    for (const y of [a.lineTop, a.lineBottom, a.dotY]) expect(Math.abs(y - 8)).toBeLessThan(6)
  })

  it.each([12, 14, 16])('AC-1507.3: alert에 size=%i를 주면 너비·높이가 되고 viewBox·선 굵기는 그대로다', (size) => {
    const attrs = attrsOf(openTag(draw('alert', { size })))
    expect(attrs).toMatchObject({ width: String(size), height: String(size), viewBox: '0 0 16 16', 'stroke-width': '1.5' })
  })

  it('AC-1507.3: Icon.tsx 머리 주석이 그림 출처(docs/mockups/worklog/memo-font.html의 ICON_WARN)를 적는다', () => {
    const src = readFileSync(join(ROOT, 'src/components/common/Icon.tsx'), 'utf8')
    const head = src.slice(0, src.indexOf('export const ICON_NAMES'))
    expect(head).toContain('docs/mockups/worklog/memo-font.html')
    expect(head).toContain('ICON_WARN')
  })
})

// admin-view(AC-8006.2·AC-8006.4·AC-8012.1): eye는 보는 의원 단추·맨 위 띠·승인 목록 이름 앞의 눈 그림이다.
// 그림은 시안 docs/mockups/admin-view/index.html의 I.eye 그대로다(시안 ic()도 Icon.tsx와 같은 16칸·선 1.5). 다른 그림은 그대로다
const ADMIN_VIEW = readFileSync(join(ROOT, 'docs/mockups/admin-view/index.html'), 'utf8')
const AV_I_BLOCK = ADMIN_VIEW.slice(ADMIN_VIEW.indexOf('const I = {'), ADMIN_VIEW.indexOf('\n  };', ADMIN_VIEW.indexOf('const I = {')))
const AV_I: Record<string, string> = Object.fromEntries([...AV_I_BLOCK.matchAll(/^\s+(\w+): '([^']*)',$/gm)].map((m) => [m[1], m[2]]))
const AV_SVG_TAG = ADMIN_VIEW.match(/const ic = \([^)]*\) => `(<svg\b[^>]*>)/)?.[1] ?? ''
// 시안 I 가운데 Icon.tsx에도 있는 이름(eye 말고) — 시안이 Icon.tsx 모양 그대로 옮긴 그림
const AV_SHARED = Object.keys(AV_I).filter((name) => name !== 'eye' && (ICON_NAMES as readonly string[]).includes(name)) as IconName[]

describe('AC-8006.2·AC-8006.4·AC-8012.1 아이콘 eye (admin-view, 시안 docs/mockups/admin-view/index.html의 I.eye)', () => {
  it('AC-8006.2: 시안에서 I.eye 그림과 ic()의 svg 태그를 읽었다(시험 준비 확인)', () => {
    expect(tagsOf(AV_I.eye ?? '')).toEqual(['path', 'circle'])
    expect(AV_SVG_TAG).toMatch(/^<svg\b/)
    expect(AV_SHARED.length).toBeGreaterThan(0)
  })

  it('AC-8006.2: 시안의 ic()도 viewBox 0 0 16 16·선 1.5·currentColor·aria-hidden이다(시안이 같은 규칙으로 그렸다)', () => {
    expect(attrsOf(AV_SVG_TAG)).toMatchObject(SVG_ATTRS)
  })

  it('AC-8006.2: eye는 ICON_NAMES 끝(alert 뒤)에 있다', () => {
    expect(ICON_NAMES.at(-1)).toBe('eye')
    expect(ICON_NAMES.at(-2)).toBe('alert')
  })

  it('AC-8006.2: eye는 aria-hidden·viewBox 0 0 16 16·fill none·stroke currentColor·선 1.5이고 기본 16×16이다', () => {
    const html = draw('eye')
    expect(attrsOf(openTag(html))).toEqual({ ...SVG_ATTRS, width: '16', height: '16' })
    expect(html.endsWith('</svg>')).toBe(true)
  })

  it('AC-8006.2: eye의 안쪽 그림은 시안 I.eye와 같고(눈 모양 path + 눈동자 circle), 안쪽 원소에 색·style·글자가 없다', () => {
    const inner = innerOf(draw('eye'))
    expect(elementsOf(inner)).toEqual(elementsOf(AV_I.eye ?? ''))
    expect(tagsOf(inner)).toEqual(['path', 'circle'])
    expect(inner).not.toMatch(/\b(?:fill|stroke|style|class)=/)
    expect(inner.replace(/<[^>]*>/g, ''), 'eye 글자').toBe('')
  })

  it.each(AV_SHARED)('AC-8006.2: 시안 I의 %s는 지금 Icon.tsx 그림과 같다(다른 그림은 그대로)', (name) => {
    expect(elementsOf(innerOf(draw(name))), name).toEqual(elementsOf(AV_I[name] ?? ''))
  })

  it.each([12, 14, 16])('AC-8006.2·AC-8012.1: eye에 size=%i를 주면 너비·높이가 되고 viewBox·선 굵기는 그대로다', (size) => {
    const attrs = attrsOf(openTag(draw('eye', { size })))
    expect(attrs).toMatchObject({ width: String(size), height: String(size), viewBox: '0 0 16 16', 'stroke-width': '1.5' })
  })

  it('AC-8006.2: Icon.tsx 머리 주석이 그림 출처(docs/mockups/admin-view/index.html의 I.eye)를 적는다', () => {
    const src = readFileSync(join(ROOT, 'src/components/common/Icon.tsx'), 'utf8')
    const head = src.slice(0, src.indexOf('export const ICON_NAMES'))
    expect(head).toContain('docs/mockups/admin-view/index.html')
    expect(head).toContain('I.eye')
  })
})
