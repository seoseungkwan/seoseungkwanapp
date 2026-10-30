import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 랜딩 CSS Module 글자 시험 (specs/landing-v2 REQ-105~110의 CSS 부분, design.md 'CSS 시험 방식')
// 값은 승인 시안 docs/mockups/landing-v2/index.html의 .lp CSS다. 시안의 @container lp(768·1024)는 같은 숫자의 @media로 옮긴다
const DIR = join(process.cwd(), 'src/components/landing')

// 규칙 시험(AC-105.7)이 보는 모듈. TASK마다 고친 모듈을 더하고, TASK-10에서 폴더 전체 읽기로 바꾼다(design.md)
const CHECKED = ['base.module.css']

// ---------- CSS 글자 읽기 도우미 ----------

// 따옴표 안의 "/*"는 주석이 아니다 → 따옴표 글은 그대로 두고 주석만 지운다 (theme.test.ts와 같은 방식)
const withoutComments = (css: string) =>
  css.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\//g, (_, quoted: string | undefined) => quoted ?? '')

// 파일이 없으면 빈 글자(시험이 '파일이 있다'에서 실패하게 한다)
function source(name: string): string {
  const path = join(DIR, name)
  return existsSync(path) ? withoutComments(readFileSync(path, 'utf8')) : ''
}

// 블록 안의 바로 아래 블록들: [머리(선택자나 @규칙), 몸통]. 중괄호 짝을 맞춘다
function blocks(body: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  let depth = 0
  let start = 0
  let head = ''
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{') {
      if (depth === 0) {
        head = body.slice(start, i).trim()
        start = i + 1
      }
      depth++
    } else if (body[i] === '}') {
      depth--
      if (depth === 0) {
        out.push([head, body.slice(start, i)])
        start = i + 1
      }
    } else if (body[i] === ';' && depth === 0) {
      start = i + 1
    }
  }
  return out
}

// 괄호 밖의 쉼표로 선택자를 나눈다
function splitSelectors(selector: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of selector) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += ch
  }
  parts.push(current)
  return parts.map(normSelector)
}

// 빈칸 차이를 없앤다: 'a  >b' → 'a > b', ':where( h1 ,h2 )' → ':where(h1, h2)'
const normSelector = (selector: string) =>
  selector
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, ' $1 ')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\s*,\s*/g, ', ')
    .trim()
const normValue = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\s*,\s*/g, ', ')
    .trim()
const normHead = (head: string) => normValue(head).replace(/\s*:\s*/g, ': ')

// 선언 '이름: 값;'을 순서대로
function declarations(body: string): Array<[string, string]> {
  return body
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.includes(':'))
    .map((part) => {
      const colon = part.indexOf(':')
      return [part.slice(0, colon).trim().toLowerCase(), normValue(part.slice(colon + 1))]
    })
}

// 화면 폭 단계: 0 = 휴대폰(맨 위 규칙), 768·1024 = 그 폭부터
type Bp = 0 | 768 | 1024
const MEDIA: Record<string, Bp> = {
  '@media (min-width: 768px)': 768,
  '@media (min-width: 1024px)': 1024,
}

type Rule = { head: string | null; bp: Bp | null; selectors: string[]; decls: Array<[string, string]> }

// 맨 위 규칙과 @media 블록을 나눠 파일 순서대로 펼친다. 모르는 @규칙 안의 규칙은 bp가 null이다
function parse(css: string): Rule[] {
  const out: Rule[] = []
  for (const [head, body] of blocks(css)) {
    if (head.startsWith('@')) {
      const query = normHead(head)
      for (const [selector, inner] of blocks(body)) {
        out.push({ head: query, bp: MEDIA[query] ?? null, selectors: splitSelectors(selector), decls: declarations(inner) })
      }
    } else {
      out.push({ head: null, bp: 0, selectors: splitSelectors(head), decls: declarations(body) })
    }
  }
  return out
}

// 선택자 하나의 속성 값이 그 폭에서 무엇인지(그 폭 이하 규칙 중 파일에서 마지막 것)
function at(rules: Rule[], selector: string, prop: string, bp: Bp = 0): string | undefined {
  const want = normSelector(selector)
  let value: string | undefined
  for (const rule of rules) {
    if (rule.bp === null || rule.bp > bp || !rule.selectors.includes(want)) continue
    for (const [p, v] of rule.decls) if (p === prop) value = v
  }
  return value
}

// 클래스 하나짜리 선택자 여럿(구체성이 같다)을 함께 단 원소의 값: 파일에서 마지막 선언이 이긴다
function cascade(rules: Rule[], selectors: string[], prop: string, bp: Bp): string | undefined {
  let value: string | undefined
  for (const rule of rules) {
    if (rule.bp === null || rule.bp > bp || !rule.selectors.some((s) => selectors.includes(s))) continue
    for (const [p, v] of rule.decls) if (p === prop) value = v
  }
  return value
}

// 파일의 선언 전부: [선택자 목록, 속성, 값]
const allDecls = (name: string): Array<[string, string, string]> =>
  parse(source(name)).flatMap((rule) => rule.decls.map(([p, v]) => [rule.selectors.join(', '), p, v] as [string, string, string]))

const base = () => parse(source('base.module.css'))

function expectStyle(selector: string, bp: Bp, want: Record<string, string>) {
  const rules = base()
  for (const [prop, value] of Object.entries(want)) {
    expect(at(rules, selector, prop, bp), `${selector} { ${prop} } @${bp}`).toBe(normValue(value))
  }
}

const COLS = (n: number) => (n === 1 ? 'minmax(0, 1fr)' : `repeat(${n}, minmax(0, 1fr))`)

// ---------- base.module.css 값 ----------

describe('AC-105.1: 랜딩 뿌리 .root', () => {
  it('AC-105.1: .root는 흰 바탕·ink 글자·14/22·고정폭 숫자·keep-all이다', () => {
    expectStyle('.root', 0, {
      background: 'var(--surface)',
      color: 'var(--ink)',
      'font-size': '14px',
      'line-height': '22px',
      'font-variant-numeric': 'tabular-nums',
      'word-break': 'keep-all',
    })
  })

  it('AC-105.1: 안쪽 요소와 ::before·::after는 box-sizing: border-box다', () => {
    for (const selector of ['.root *', '.root *::before', '.root *::after']) {
      expectStyle(selector, 0, { 'box-sizing': 'border-box' })
    }
  })

  it('AC-105.1: h1·h2·h3·p·ol·ul·dl·dd·figure의 margin·padding이 0이고, 목록 점이 없다', () => {
    expectStyle('.root :where(h1, h2, h3, p, ol, ul, dl, dd, figure)', 0, { margin: '0', padding: '0' })
    expectStyle('.root :where(ol, ul)', 0, { 'list-style': 'none' })
  })

  it('AC-105.1: 링크는 color: inherit · text-decoration: none이고, 초점 고리는 2px accent · offset 2px다', () => {
    const rules = base()
    const link = ['.root :where(a)', '.root a'].find((s) => at(rules, s, 'color') !== undefined)
    expect(link, '.root 안 a 규칙').toBeDefined()
    expectStyle(link!, 0, { color: 'inherit', 'text-decoration': 'none' })
    expectStyle('.root a:focus-visible', 0, { outline: '2px solid var(--accent)', 'outline-offset': '2px' })
  })
})

describe('AC-105.2: 글자 단계', () => {
  // [클래스, 휴대폰, 768, 1024(크기/줄 높이), 폭과 상관없는 값]
  const TYPE: Array<[string, [number, number], [number, number], [number, number], Record<string, string>]> = [
    ['.tDisplay', [34, 42], [44, 52], [56, 64], { 'font-weight': '600', 'letter-spacing': '-0.02em' }],
    ['.tH2', [24, 32], [28, 36], [32, 40], { 'font-weight': '600', 'letter-spacing': '-0.015em' }],
    ['.tH3l', [20, 28], [22, 30], [22, 30], { 'font-weight': '600', 'letter-spacing': '-0.01em' }],
    ['.tH3', [17, 24], [18, 26], [18, 26], { 'font-weight': '600' }],
    ['.tLead', [16, 26], [18, 28], [18, 28], { color: 'var(--ink-2)', 'max-width': '640px' }],
    ['.tBody', [14, 22], [15, 24], [15, 24], { color: 'var(--ink-2)' }],
    ['.tSmall', [13, 20], [13, 20], [13, 20], {}],
    ['.tLabel', [13, 20], [13, 20], [13, 20], { 'font-weight': '500', color: 'var(--muted)' }],
  ]

  it.each(TYPE)('AC-105.2: %s 크기/줄 높이가 휴대폰 → 768 → 1024 표와 같다', (selector, phone, tablet, pc, fixed) => {
    for (const [bp, [size, lineHeight]] of [
      [0, phone],
      [768, tablet],
      [1024, pc],
    ] as Array<[Bp, [number, number]]>) {
      expectStyle(selector, bp, { 'font-size': `${size}px`, 'line-height': `${lineHeight}px`, ...fixed })
    }
  })
})

describe('AC-105.3: 틀과 간격', () => {
  it('AC-105.3: .wrap은 최대 1248px·가운데, 좌우 16px → 24px(768)', () => {
    expectStyle('.wrap', 0, { 'max-width': '1248px', 'margin-inline': 'auto', 'padding-inline': '16px' })
    expectStyle('.wrap', 768, { 'padding-inline': '24px' })
    expectStyle('.wrap', 1024, { 'padding-inline': '24px' })
  })

  it('AC-105.3: .sec 위아래 56 → 80 → 96px, scroll-margin-top 96 → 64px', () => {
    expectStyle('.sec', 0, { 'padding-block': '56px', 'scroll-margin-top': '96px' })
    expectStyle('.sec', 768, { 'padding-block': '80px', 'scroll-margin-top': '64px' })
    expectStyle('.sec', 1024, { 'padding-block': '96px', 'scroll-margin-top': '64px' })
  })

  it('AC-105.3: .secCanvas는 회색 바탕이다', () => {
    expectStyle('.secCanvas', 0, { background: 'var(--canvas)' })
  })

  it('AC-105.3: .stack 간격 32 → 40 → 48px, .head 간격 12 → 16px · 최대 760px', () => {
    expectStyle('.stack', 0, { gap: '32px' })
    expectStyle('.stack', 768, { gap: '40px' })
    expectStyle('.stack', 1024, { gap: '48px' })
    expectStyle('.head', 0, { gap: '12px', 'max-width': '760px' })
    expectStyle('.head', 768, { gap: '16px' })
    expectStyle('.head', 1024, { gap: '16px', 'max-width': '760px' })
  })
})

describe('AC-105.4: 카드·항목·묶음', () => {
  it('AC-105.4: .card는 흰 바탕·1px line·6px, 안쪽 16 → 24px, min-width 0', () => {
    expectStyle('.card', 0, {
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      'border-radius': '6px',
      padding: '16px',
      'min-width': '0',
    })
    expectStyle('.card', 768, { padding: '24px' })
    expectStyle('.card', 1024, { padding: '24px' })
  })

  it('AC-105.4: .item은 위 1px line, padding-top 16 → 20px', () => {
    expectStyle('.item', 0, { 'border-top': '1px solid var(--line)', 'padding-top': '16px' })
    expectStyle('.item', 768, { 'padding-top': '20px' })
  })

  it('AC-105.4: .group은 휴대폰에서 테두리 하나 안에 카드들이 위 1px 선으로 나뉜다', () => {
    expectStyle('.group', 0, { background: 'var(--surface)', border: '1px solid var(--line)', 'border-radius': '6px' })
    expectStyle('.group > .card', 0, { border: '0', 'border-radius': '0', background: 'transparent' })
    expectStyle('.group > .card + .card', 0, { 'border-top': '1px solid var(--line)' })
  })

  it('AC-105.4: .group은 768부터 묶음 테두리를 없애고 카드마다 제 테두리를 가진다', () => {
    for (const bp of [768, 1024] as Bp[]) {
      expectStyle('.group', bp, { background: 'transparent', border: '0', 'border-radius': '0' })
      expectStyle('.group > .card', bp, {
        border: '1px solid var(--line)',
        'border-radius': '6px',
        background: 'var(--surface)',
      })
    }
  })

  it('AC-105.4: .grid3·.grid4와 .group을 함께 달면 카드 사이가 휴대폰 0 → 768부터 16px이다', () => {
    const rules = base()
    for (const grid of ['.grid3', '.grid4']) {
      expect(cascade(rules, [grid, '.group'], 'gap', 0), `${grid}.group @0`).toBe('0')
      expect(cascade(rules, [grid, '.group'], 'gap', 768), `${grid}.group @768`).toBe('16px')
      expect(cascade(rules, [grid, '.group'], 'gap', 1024), `${grid}.group @1024`).toBe('16px')
    }
  })
})

describe('AC-105.5: 단추·칩', () => {
  it('AC-105.5: .btn은 inline-flex·6px·1px 투명 테두리·500·줄바꿈 없음·바탕색 .15s 전환', () => {
    expectStyle('.btn', 0, {
      display: 'inline-flex',
      'border-radius': '6px',
      border: '1px solid transparent',
      'font-weight': '500',
      'white-space': 'nowrap',
    })
    expect(at(base(), '.btn', 'transition')).toMatch(/^background-color 0?\.15s ease$/)
  })

  it('AC-105.5: .btnMd 36px · 0 14px · 14px, .btnLg 44px · 0 20px · 15px', () => {
    expectStyle('.btnMd', 0, { height: '36px', padding: '0 14px', 'font-size': '14px' })
    expectStyle('.btnLg', 0, { height: '44px', padding: '0 20px', 'font-size': '15px' })
  })

  it('AC-105.5: .btnPrimary는 ink 바탕·흰 글자(hover ink-2), .btnSecondary는 흰 바탕·line 테두리·ink 글자(hover canvas)', () => {
    expectStyle('.btnPrimary', 0, { background: 'var(--ink)', color: 'var(--surface)' })
    expectStyle('.btnPrimary:hover', 0, { background: 'var(--ink-2)' })
    expectStyle('.btnSecondary', 0, {
      background: 'var(--surface)',
      'border-color': 'var(--line)',
      color: 'var(--ink)',
    })
    expectStyle('.btnSecondary:hover', 0, { background: 'var(--canvas)' })
  })

  it('AC-105.5: .chip은 22px · 0 7px · 4px · 12/16 · 500 · 1px 투명 테두리', () => {
    expectStyle('.chip', 0, {
      height: '22px',
      padding: '0 7px',
      'border-radius': '4px',
      'font-size': '12px',
      'line-height': '16px',
      'font-weight': '500',
      border: '1px solid transparent',
    })
  })

  // [변형, 글자, 바탕, 테두리(없으면 .chip의 투명 테두리 그대로)]
  const CHIPS: Array<[string, string, string, string | undefined]> = [
    ['.chipNeutral', 'var(--ink-2)', 'var(--surface)', 'var(--line)'],
    ['.chipSample', 'var(--muted)', 'var(--surface)', 'var(--line)'],
    ['.chipOk', 'var(--ok)', 'var(--ok-soft)', undefined],
    ['.chipAttn', 'var(--danger)', 'var(--danger-soft)', undefined],
    ['.chipWait', 'var(--muted)', 'var(--canvas)', 'var(--line)'],
  ]

  it.each(CHIPS)('AC-105.5: 칩 변형 %s 글자 %s / 바탕 %s / 테두리 %s', (selector, color, background, borderColor) => {
    const rules = base()
    expect(at(rules, selector, 'color'), `${selector} color`).toBe(color)
    expect(at(rules, selector, 'background'), `${selector} background`).toBe(background)
    expect(at(rules, selector, 'border-color'), `${selector} border-color`).toBe(borderColor)
  })
})

describe('AC-105.6: 칸', () => {
  it('AC-105.6: .grid4는 1칸 → 2칸(768) → 4칸(1024), .grid3은 1칸 → 3칸(768)', () => {
    expectStyle('.grid4', 0, { 'grid-template-columns': COLS(1) })
    expectStyle('.grid4', 768, { 'grid-template-columns': COLS(2) })
    expectStyle('.grid4', 1024, { 'grid-template-columns': COLS(4) })
    expectStyle('.grid3', 0, { 'grid-template-columns': COLS(1) })
    expectStyle('.grid3', 768, { 'grid-template-columns': COLS(3) })
    expectStyle('.grid3', 1024, { 'grid-template-columns': COLS(3) })
  })

  it('AC-105.6: .grid3·.grid4 간격은 12px → 16px(768)', () => {
    for (const grid of ['.grid3', '.grid4']) {
      expectStyle(grid, 0, { gap: '12px' })
      expectStyle(grid, 768, { gap: '16px' })
      expectStyle(grid, 1024, { gap: '16px' })
    }
  })

  it('AC-105.6: .items는 1칸 → 2칸(768), 간격 20px 24px → 32px 24px, .itemsFour는 1024부터 4칸', () => {
    expectStyle('.items', 0, { 'grid-template-columns': COLS(1), gap: '20px 24px' })
    expectStyle('.items', 768, { 'grid-template-columns': COLS(2), gap: '32px 24px' })
    const rules = base()
    expect(cascade(rules, ['.items', '.itemsFour'], 'grid-template-columns', 768)).toBe(COLS(2))
    expect(cascade(rules, ['.items', '.itemsFour'], 'grid-template-columns', 1024)).toBe(COLS(4))
    expect(cascade(rules, ['.items'], 'grid-template-columns', 1024)).toBe(COLS(2))
  })

  it('AC-105.6: 모든 칸은 minmax(0, 1fr)이다', () => {
    const columns = allDecls('base.module.css').filter(([, prop]) => prop === 'grid-template-columns')
    expect(columns.length).toBeGreaterThan(0)
    for (const [selector, , value] of columns) {
      expect(value, selector).toMatch(/^(minmax\(0, 1fr\)|repeat\(\d+, minmax\(0, 1fr\)\))$/)
    }
  })
})

// ---------- AC-105.7: 랜딩 CSS Module 규칙 (검사 목록 CHECKED) ----------

const ACCENT_FILES = ['base.module.css', 'HeroChart.module.css', 'FeaturesSection.module.css']
const STATUS_FILES = ['base.module.css', 'PrivacySection.module.css']
const FONT_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 25, 28, 30, 32, 34, 44, 48, 56]
const RADII = new Set(['0', '2px', '3px', '4px', '6px', '50%'])
// 색을 받는 속성(줄임 속성 포함)
const COLOR_PROP =
  /^(color|background(-color)?|fill|stroke|(border|outline)(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|text-decoration-color|caret-color|accent-color|column-rule(-color)?)$/
// 색 속성 값에 와도 되는 낱말(var(--…)는 먼저 지운다)
const COLOR_WORDS = new Set(['transparent', 'currentcolor', 'inherit', 'none', 'solid', 'dashed', 'dotted'])

describe('AC-105.7: 랜딩 CSS Module 규칙', () => {
  it.each(CHECKED)('AC-105.7: 검사할 파일 %s가 있고 비어 있지 않다', (name) => {
    expect(source(name).trim().length, name).toBeGreaterThan(0)
  })

  it.each(CHECKED)('AC-105.7 (a): %s — 미디어 쿼리는 min-width 768px·1024px뿐이고 휴대폰 → 768 → 1024 순서다', (name) => {
    const top = blocks(source(name))
    const order: number[] = []
    for (const [head, body] of top) {
      if (!head.startsWith('@')) {
        order.push(0)
        continue
      }
      const query = normHead(head)
      expect(Object.keys(MEDIA), `${name}: ${query}`).toContain(query)
      order.push(MEDIA[query] ?? -1)
      for (const [inner] of blocks(body)) expect(inner.startsWith('@'), `${name}: ${query} 안의 ${inner}`).toBe(false)
    }
    expect(order, `${name}: 블록 순서`).toEqual([...order].sort((a, b) => a - b))
  })

  it.each(CHECKED)('AC-105.7 (b): %s — 색 글자(#…·rgb·rgba·hsl)가 없고 색은 var(--…)·transparent·currentColor만 쓴다', (name) => {
    const css = source(name)
    expect(css).not.toMatch(/\b(rgba?|hsla?)\(/i)
    for (const [selector, prop, value] of allDecls(name)) {
      expect(value, `${name}: ${selector} { ${prop} }`).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      if (!COLOR_PROP.test(prop)) continue
      const words = value.replace(/var\(--[\w-]+\)/g, ' ').split(/[\s,/]+/).filter(Boolean)
      for (const word of words) {
        const ok = COLOR_WORDS.has(word.toLowerCase()) || /^-?[\d.]+(px|%)?$/.test(word)
        expect(ok, `${name}: ${selector} { ${prop}: ${value} }`).toBe(true)
      }
    }
  })

  it.each(CHECKED)('AC-105.7 (c): %s — 그라데이션·그림자·blur·filter·background-clip·url(·font-family가 없다', (name) => {
    const css = source(name)
    for (const banned of [/gradient/i, /text-shadow/i, /backdrop-filter/i, /filter\s*:/i, /background-clip/i, /url\(/i, /font-family/i]) {
      expect(css, `${name}: ${banned}`).not.toMatch(banned)
    }
    for (const [selector, prop, value] of allDecls(name)) {
      if (prop === 'box-shadow') expect(value, `${name}: ${selector} { box-shadow }`).toBe('none')
    }
  })

  it.each(CHECKED)('AC-105.7 (d): %s — border-radius는 0·2px·3px·4px·6px·50%만 쓴다', (name) => {
    for (const [selector, prop, value] of allDecls(name)) {
      if (!/^border(-[a-z]+)*-radius$/.test(prop)) continue
      for (const part of value.split(/[\s/]+/)) expect(RADII.has(part), `${name}: ${selector} { ${prop}: ${value} }`).toBe(true)
    }
  })

  it.each(CHECKED)('AC-105.7 (e): %s — font-size는 정한 px 값뿐이고 clamp·vw·em·font 줄임 속성이 없다', (name) => {
    expect(source(name)).not.toMatch(/clamp\(/i)
    for (const [selector, prop, value] of allDecls(name)) {
      expect(prop, `${name}: ${selector} { font }`).not.toBe('font')
      if (prop !== 'font-size') continue
      const px = /^(\d+)px$/.exec(value)
      expect(px, `${name}: ${selector} { font-size: ${value} }`).not.toBeNull()
      expect(FONT_SIZES, `${name}: ${selector} { font-size: ${value} }`).toContain(Number(px![1]))
    }
  })

  it.each(CHECKED)('AC-105.7 (f): %s — font-weight는 400·500·600이고 700은 HeroChart.module.css에만 있다', (name) => {
    for (const [selector, prop, value] of allDecls(name)) {
      if (prop !== 'font-weight') continue
      const ok = ['400', '500', '600'].includes(value) || (value === '700' && name === 'HeroChart.module.css')
      expect(ok, `${name}: ${selector} { font-weight: ${value} }`).toBe(true)
    }
  })

  it.each(CHECKED)('AC-105.7 (g): %s — @keyframes·animation이 없고 transition은 정한 두 가지뿐이다', (name) => {
    expect(source(name)).not.toMatch(/@keyframes/i)
    for (const [selector, prop, value] of allDecls(name)) {
      const where = `${name}: ${selector} { ${prop}: ${value} }`
      expect(prop.startsWith('animation'), where).toBe(false)
      if (!prop.startsWith('transition')) continue
      expect(prop, where).toBe('transition')
      const btn = name === 'base.module.css' && selector === '.btn' && /^background-color 0?\.15s ease$/.test(value)
      const chart =
        name === 'HeroChart.module.css' &&
        value.split(', ').every((part) => /^(stroke-dasharray|height|width) 0?\.6s ease$/.test(part))
      expect(btn || chart, where).toBe(true)
    }
  })

  it.each(CHECKED)('AC-105.7 (h): %s — 강조색은 base·HeroChart·Features에만, ok·danger는 base·Privacy에만 나온다', (name) => {
    const css = source(name)
    if (/--accent/.test(css)) expect(ACCENT_FILES, `${name}: --accent*`).toContain(name)
    if (/--(ok|danger)\b/.test(css)) expect(STATUS_FILES, `${name}: --ok*·--danger*`).toContain(name)
  })

  it('AC-105.7 (h): base.module.css의 강조색은 초점 고리에만, ok·danger는 칩(chipOk·chipAttn)에만 쓴다', () => {
    for (const rule of base()) {
      const body = rule.decls.map(([p, v]) => `${p}: ${v}`).join('; ')
      const where = `${rule.selectors.join(', ')} { ${body} }`
      if (/--accent/.test(body)) for (const s of rule.selectors) expect(s, where).toMatch(/:focus-visible$/)
      if (/--(ok|danger)\b/.test(body)) for (const s of rule.selectors) expect(['.chipOk', '.chipAttn'], where).toContain(s)
    }
    expect(source('base.module.css')).toMatch(/--accent/)
  })
})
