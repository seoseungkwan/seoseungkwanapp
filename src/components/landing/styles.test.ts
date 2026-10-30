import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 랜딩 CSS Module 글자 시험 (specs/landing-v2 REQ-105~110의 CSS 부분, design.md 'CSS 시험 방식')
// 값은 승인 시안 docs/mockups/landing-v2/index.html의 .lp CSS다. 시안의 @container lp(768·1024)는 같은 숫자의 @media로 옮긴다
const DIR = join(process.cwd(), 'src/components/landing')

// 규칙 시험(AC-105.7)이 보는 모듈: 랜딩 폴더의 *.module.css 전부(TASK-10에서 목록 대신 폴더 전체 읽기로 바꿨다, design.md).
// 새 모듈을 더하면 저절로 검사된다
const CHECKED = readdirSync(DIR)
  .filter((name) => name.endsWith('.module.css'))
  .sort()
// 지금 있어야 하는 랜딩 모듈: base + 섹션 모듈 11개
const LANDING_MODULES = [
  'base.module.css',
  'SiteHeader.module.css',
  'Hero.module.css',
  'HeroChart.module.css',
  'PromiseBand.module.css',
  'AiSection.module.css',
  'OrthoSection.module.css',
  'FeaturesSection.module.css',
  'PrivacySection.module.css',
  'HowSection.module.css',
  'StartSection.module.css',
  'SiteFooter.module.css',
]

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

// 파일 하나에서 선택자의 그 폭 값들을 본다(기본은 base.module.css)
function expectStyle(selector: string, bp: Bp, want: Record<string, string>, file = 'base.module.css') {
  const rules = parse(source(file))
  for (const [prop, value] of Object.entries(want)) {
    expect(at(rules, selector, prop, bp), `${file}: ${selector} { ${prop} } @${bp}`).toBe(normValue(value))
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

// ---------- SiteHeader.module.css 값 (REQ-106, 시안 .lp-hd · .lp-hd-in · .logo · .lp-nav) ----------

const HEADER = 'SiteHeader.module.css'
const header = () => parse(source(HEADER))

describe('AC-106.2: 위쪽 메뉴 — 휴대폰(767px 이하)', () => {
  it('AC-106.2: header는 sticky · top 0 · z-index 20 · 흰 바탕 · 아래 1px line이고 그림자·blur가 없다', () => {
    expectStyle(
      '.header',
      0,
      {
        position: 'sticky',
        top: '0',
        'z-index': '20',
        background: 'var(--surface)',
        'border-bottom': '1px solid var(--line)',
      },
      HEADER,
    )
    expect(source(HEADER)).not.toMatch(/backdrop-filter|blur\(/i)
    for (const [selector, prop, value] of allDecls(HEADER)) {
      if (prop === 'box-shadow') expect(value, `${selector} { box-shadow }`).toBe('none')
    }
  })

  it('AC-106.2: 안쪽은 grid 두 줄 "logo cta" "nav nav"이다', () => {
    expectStyle(
      '.inner',
      0,
      {
        display: 'grid',
        'grid-template-columns': 'minmax(0, 1fr) auto',
        'grid-template-areas': '"logo cta" "nav nav"',
        'align-items': 'center',
        'column-gap': '16px',
      },
      HEADER,
    )
  })

  it('AC-106.2: 로고 줄은 48px이고, 로고는 logo 칸 · ink 글자색(직접 정함) · 16px 600이다', () => {
    expectStyle(
      '.logo',
      0,
      {
        'grid-area': 'logo',
        display: 'inline-flex',
        'align-items': 'center',
        gap: '8px',
        height: '48px',
        color: 'var(--ink)',
        'font-size': '16px',
        'font-weight': '600',
        'white-space': 'nowrap',
      },
      HEADER,
    )
  })

  it('AC-106.2: SiteHeader.module.css가 쓰는 var(--…)는 모두 globals.css에 정의돼 있다(지운 --text-strong 같은 이름이 없다)', () => {
    const globals = withoutComments(readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8'))
    const defined = new Set([...globals.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
    const used = [...source(HEADER).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const name of used) expect(defined.has(name), `${HEADER}: ${name}`).toBe(true)
  })

  it('AC-106.2: nav 줄은 위 1px line · 옆으로 스크롤 · 스크롤바 숨김이고, wrap 좌우 16px까지 넓힌다', () => {
    expectStyle(
      '.nav',
      0,
      {
        'grid-area': 'nav',
        display: 'flex',
        'border-top': '1px solid var(--line)',
        'overflow-x': 'auto',
        'scrollbar-width': 'none',
        'margin-inline': '-16px',
        'padding-inline': '2px',
      },
      HEADER,
    )
    expectStyle('.nav::-webkit-scrollbar', 0, { display: 'none' }, HEADER)
  })

  it('AC-106.2: 링크는 높이 46px · 0 14px · 14px 500 ink-2 · flex none이다', () => {
    expectStyle(
      '.navLink',
      0,
      {
        flex: 'none',
        display: 'flex',
        'align-items': 'center',
        height: '46px',
        padding: '0 14px',
        'font-size': '14px',
        'font-weight': '500',
        color: 'var(--ink-2)',
      },
      HEADER,
    )
  })

  it('AC-106.2: [구글로 시작하기]는 cta 칸이고 ::after가 누름 영역을 44px로 늘린다(inset: -4px 0)', () => {
    expectStyle('.start', 0, { 'grid-area': 'cta', position: 'relative' }, HEADER)
    expectStyle('.start::after', 0, { content: '""', position: 'absolute', inset: '-4px 0' }, HEADER)
  })

  it('AC-106.2: nav와 링크에는 어느 폭에서도 display: none이 없다(::-webkit-scrollbar만 예외)', () => {
    const rules = header()
    expect(rules.some((rule) => rule.selectors.includes('.nav'))).toBe(true)
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        if (!/\.(nav|navLink)\b/.test(selector) || selector === '.nav::-webkit-scrollbar') continue
        for (const [prop, value] of rule.decls) {
          if (prop === 'display') expect(value, `${rule.head ?? ''} ${selector} { display }`).not.toBe('none')
        }
      }
    }
  })
})

describe('AC-106.3: 위쪽 메뉴 — 768px 이상', () => {
  it.each([768, 1024] as Bp[])('AC-106.3: @%ipx 한 줄 "logo nav cta" · 높이 64px, 로고 64px · 17px', (bp) => {
    expectStyle(
      '.inner',
      bp,
      {
        'grid-template-columns': 'auto minmax(0, 1fr) auto',
        'grid-template-areas': '"logo nav cta"',
        'column-gap': '24px',
        height: '64px',
      },
      HEADER,
    )
    expectStyle('.logo', bp, { height: '64px', 'font-size': '17px', color: 'var(--ink)' }, HEADER)
  })

  it.each([768, 1024] as Bp[])('AC-106.3: @%ipx 링크는 64px · 0 12px이고 nav는 스크롤하지 않는다(overflow: visible)', (bp) => {
    expectStyle('.navLink', bp, { height: '64px', padding: '0 12px' }, HEADER)
    expectStyle('.nav', bp, { overflow: 'visible', margin: '0', 'border-top': '0' }, HEADER)
  })

  it.each([768, 1024] as Bp[])('AC-106.3: @%ipx [구글로 시작하기]의 ::after는 끈다', (bp) => {
    expectStyle('.start::after', bp, { display: 'none' }, HEADER)
  })

  it('AC-106.3: 1024px부터 nav 왼쪽 여백 16px(768에서는 0)', () => {
    expectStyle('.nav', 768, { padding: '0' }, HEADER)
    expect(at(header(), '.nav', 'padding-left', 768), '.nav { padding-left } @768').toBeUndefined()
    expectStyle('.nav', 1024, { 'padding-left': '16px' }, HEADER)
  })
})

// ---------- Hero · HeroChart · PromiseBand (REQ-107, 시안 .hero · .shot · .app · .band) ----------

const HERO = 'Hero.module.css'
const CHART = 'HeroChart.module.css'
const BAND = 'PromiseBand.module.css'
const ALL_BPS: Bp[] = [0, 768, 1024]

// 한 선택자의 휴대폰 → 768 → 1024 값을 한 번에 본다
function expectSteps(file: string, selector: string, prop: string, steps: [string, string, string]) {
  ALL_BPS.forEach((bp, i) => expectStyle(selector, bp, { [prop]: steps[i] }, file))
}

describe('AC-107.2: 히어로 CSS (Hero.module.css)', () => {
  it('AC-107.2: .hero 위아래 여백 32px 56px → 64px 80px → 88px 96px, scroll-margin-top 96px → 64px', () => {
    expectSteps(HERO, '.hero', 'padding-block', ['32px 56px', '64px 80px', '88px 96px'])
    expectSteps(HERO, '.hero', 'scroll-margin-top', ['96px', '64px', '64px'])
  })

  it('AC-107.2: .grid는 grid이고 1024px부터 12칸 · column-gap 24px · align-items end다', () => {
    expectStyle('.grid', 0, { display: 'grid', gap: '16px' }, HERO)
    expectStyle('.grid', 768, { gap: '20px', 'max-width': '680px' }, HERO)
    expectStyle(
      '.grid',
      1024,
      { 'max-width': 'none', 'grid-template-columns': COLS(12), 'column-gap': '24px', 'align-items': 'end' },
      HERO,
    )
    expect(at(parse(source(HERO)), '.grid', 'grid-template-columns', 768), '.grid 칸 @768').toBeUndefined()
  })

  it('AC-107.2: 1024px부터 글 덩어리 .text는 1 / span 6, 단추 덩어리 .side는 8 / span 5다', () => {
    expectStyle('.text', 1024, { 'grid-column': '1 / span 6' }, HERO)
    expectStyle('.side', 1024, { 'grid-column': '8 / span 5' }, HERO)
    for (const selector of ['.text', '.side']) {
      expect(at(parse(source(HERO)), selector, 'grid-column', 768), `${selector} @768`).toBeUndefined()
    }
  })

  it('AC-107.2: 글 덩어리 gap 12 → 16px(1024), 단추 덩어리 gap 24 → 28px(768), 둘 다 아래 정렬이다', () => {
    expectSteps(HERO, '.text', 'gap', ['12px', '12px', '16px'])
    expectSteps(HERO, '.side', 'gap', ['24px', '28px', '28px'])
    for (const selector of ['.text', '.side']) expectStyle(selector, 0, { display: 'grid', 'align-content': 'end' }, HERO)
  })

  it('AC-107.2: 소개 줄 14/22 500 ink-2, 단추 줄 flex · gap 8px, 개인정보 줄 14/22 ink-2 · gap 8px', () => {
    expectStyle('.kicker', 0, { 'font-size': '14px', 'line-height': '22px', 'font-weight': '500', color: 'var(--ink-2)' }, HERO)
    expectStyle('.actions', 0, { display: 'flex', 'flex-wrap': 'wrap', gap: '8px' }, HERO)
    expectStyle(
      '.privacy',
      0,
      { display: 'flex', 'align-items': 'center', gap: '8px', 'font-size': '14px', 'line-height': '22px', color: 'var(--ink-2)' },
      HERO,
    )
  })

  it('AC-107.2: 미리보기 위 여백 .shot margin-top 32px → 48px → 64px', () => {
    expectSteps(HERO, '.shot', 'margin-top', ['32px', '48px', '64px'])
  })
})

describe('AC-107.4: 미리보기 CSS (HeroChart.module.css)', () => {
  it('AC-107.4: 틀 .app은 1px line · 모서리 6px · canvas 바탕 · 넘침 숨김이다', () => {
    expectStyle(
      '.app',
      0,
      { border: '1px solid var(--line)', 'border-radius': '6px', background: 'var(--canvas)', overflow: 'hidden' },
      CHART,
    )
  })

  it('AC-107.4: 위쪽 띠 높이 48 → 56 → 64px, 흰 바탕 · 아래 1px line', () => {
    expectSteps(CHART, '.top', 'height', ['48px', '56px', '64px'])
    expectSteps(CHART, '.top', 'padding', ['0 16px', '0 20px', '0 24px'])
    expectStyle('.top', 0, { background: 'var(--surface)', 'border-bottom': '1px solid var(--line)' }, CHART)
    expectSteps(CHART, '.logo', 'font-size', ['15px', '16px', '17px'])
  })

  it('AC-107.4: 탭 높이 46 → 48 → 50px, 글자 14 → 15px 500 ink-2', () => {
    expectSteps(CHART, '.tab', 'height', ['46px', '48px', '50px'])
    expectSteps(CHART, '.tab', 'padding', ['0 14px', '0 16px', '0 20px'])
    expectSteps(CHART, '.tab', 'font-size', ['14px', '15px', '15px'])
    expectStyle('.tab', 0, { 'font-weight': '500', color: 'var(--ink-2)', position: 'relative' }, CHART)
  })

  it('AC-107.4: 지금 탭은 accent 700이고 아래 3px accent 밑줄(좌우 10px 안쪽, 모서리 2px 2px 0 0)이 붙는다', () => {
    const rules = parse(source(CHART))
    expect(cascade(rules, ['.tab', '.tabOn'], 'color', 0)).toBe('var(--accent)')
    expect(cascade(rules, ['.tab', '.tabOn'], 'font-weight', 0)).toBe('700')
    expectStyle(
      '.tabOn::after',
      0,
      {
        content: '""',
        position: 'absolute',
        left: '10px',
        right: '10px',
        bottom: '0',
        height: '3px',
        background: 'var(--accent)',
        'border-radius': '2px 2px 0 0',
      },
      CHART,
    )
  })

  it('AC-107.4: 화면 제목 20/28 → 22/30 → 25/32', () => {
    expectSteps(CHART, '.heading', 'font-size', ['20px', '22px', '25px'])
    expectSteps(CHART, '.heading', 'line-height', ['28px', '30px', '32px'])
  })

  it('AC-107.4: KPI 칸은 2칸(AI 카드는 한 줄 전체) → 768부터 3칸, 패널은 한 줄 전체다', () => {
    expectSteps(CHART, '.grid', 'grid-template-columns', [COLS(2), COLS(3), COLS(3)])
    expectSteps(CHART, '.kpiAi', 'grid-column', ['1 / -1', 'auto', 'auto'])
    expectSteps(CHART, '.panel', 'grid-column', ['1 / -1', '1 / -1', '1 / -1'])
  })

  it('AC-107.4: KPI 카드는 흰 바탕 · 1px line · 6px이고, 이름 13/20 → 14/22, 값 28/34 → 30/38 → 34/40, 단위 16 → 18 → 20', () => {
    expectStyle('.kpi', 0, { background: 'var(--surface)', border: '1px solid var(--line)', 'border-radius': '6px' }, CHART)
    expectSteps(CHART, '.kpiLabel', 'font-size', ['13px', '14px', '14px'])
    expectSteps(CHART, '.kpiLabel', 'line-height', ['20px', '22px', '22px'])
    expectSteps(CHART, '.kpiValue', 'font-size', ['28px', '30px', '34px'])
    expectSteps(CHART, '.kpiValue', 'line-height', ['34px', '38px', '40px'])
    expectStyle('.kpiValue', 0, { 'font-weight': '600', color: 'var(--ink)' }, CHART)
    expectSteps(CHART, '.unit', 'font-size', ['16px', '18px', '20px'])
    expectStyle('.up', 0, { color: 'var(--accent)' }, CHART)
  })

  it('AC-107.4: 도넛은 바탕 고리 accent-soft · 값 고리 accent · 굵기 12이고, 폭 84 → 132 → 156px다', () => {
    expectStyle('.ringTrack', 0, { stroke: 'var(--accent-soft)' }, CHART)
    expectStyle('.ringValue', 0, { stroke: 'var(--accent)' }, CHART)
    const rules = parse(source(CHART))
    for (const selector of ['.ringTrack', '.ringValue']) {
      expect(at(rules, selector, 'stroke-width'), `${selector} stroke-width`).toMatch(/^12(px)?$/)
    }
    expectSteps(CHART, '.ring', 'width', ['84px', '132px', '156px'])
  })

  it('AC-107.4: 막대는 accent-tint이고 마지막 막대(.barLast)만 accent, 막대 영역 높이 116 → 150 → 168px', () => {
    const rules = parse(source(CHART))
    expect(at(rules, '.bar', 'background')).toBe('var(--accent-tint)')
    for (const bp of ALL_BPS) expect(cascade(rules, ['.bar', '.barLast'], 'background', bp), `.bar.barLast @${bp}`).toBe('var(--accent)')
    expectSteps(CHART, '.plot', 'height', ['116px', '150px', '168px'])
  })

  it('AC-107.4: 신환율 막대는 accent-soft 바탕에 accent 채움이다', () => {
    expectStyle('.meter', 0, { height: '6px', background: 'var(--accent-soft)' }, CHART)
    expectStyle('.meterFill', 0, { background: 'var(--accent)', height: '100%' }, CHART)
  })

  it('AC-107.4: 도넛 · 막대 · 신환율 막대는 .6s ease로 따라 움직인다', () => {
    const rules = parse(source(CHART))
    expect(at(rules, '.ringValue', 'transition')).toMatch(/^stroke-dasharray 0?\.6s ease$/)
    expect(at(rules, '.bar', 'transition')).toMatch(/^height 0?\.6s ease$/)
    expect(at(rules, '.meterFill', 'transition')).toMatch(/^width 0?\.6s ease$/)
  })
})

describe('AC-107.5: 약속 띠 CSS (PromiseBand.module.css)', () => {
  it('AC-107.5: 띠는 위아래 1px line · 흰 바탕이다', () => {
    expectStyle('.band', 0, { 'border-block': '1px solid var(--line)', background: 'var(--surface)' }, BAND)
  })

  it('AC-107.5: 휴대폰은 1칸 세 줄 → 768부터 3칸이다', () => {
    expectStyle('.inner', 0, { display: 'grid' }, BAND)
    expectSteps(BAND, '.inner', 'grid-template-columns', [COLS(1), COLS(3), COLS(3)])
  })

  it('AC-107.5: 항목 글자는 15px 500 ink이고 아이콘은 ink-2다', () => {
    expectStyle(
      '.bandItem',
      0,
      {
        display: 'flex',
        'align-items': 'center',
        gap: '12px',
        'padding-block': '14px',
        'font-size': '15px',
        'line-height': '22px',
        'font-weight': '500',
        color: 'var(--ink)',
      },
      BAND,
    )
    expectStyle('.bandItem svg', 0, { color: 'var(--ink-2)' }, BAND)
  })

  it('AC-107.5: 휴대폰은 위 선으로 나누고, 768부터 왼쪽 선으로 나눈다(첫 항목은 왼쪽 여백 0)', () => {
    expectStyle('.bandItem + .bandItem', 0, { 'border-top': '1px solid var(--line)' }, BAND)
    for (const bp of [768, 1024] as Bp[]) {
      expectStyle('.bandItem + .bandItem', bp, { 'border-top': '0', 'border-left': '1px solid var(--line)' }, BAND)
      expectStyle('.bandItem', bp, { padding: '20px' }, BAND)
      expectStyle('.bandItem:first-child', bp, { 'padding-left': '0' }, BAND)
    }
  })
})

describe('AC-107.2 · AC-107.4 · AC-107.5: 쓰는 변수', () => {
  it.each([HERO, CHART, BAND])('AC-107.2 · AC-107.4 · AC-107.5: %s가 쓰는 var(--…)는 모두 globals.css에 정의돼 있다', (name) => {
    const globals = withoutComments(readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8'))
    const defined = new Set([...globals.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
    const used = [...source(name).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const varName of used) expect(defined.has(varName), `${name}: ${varName}`).toBe(true)
  })
})

// ---------- AI 섹션 · 정형외과 섹션 (REQ-108, 시안 .rep · .chat · .ortho .card · .snip) ----------

const AI = 'AiSection.module.css'
const ORTHO = 'OrthoSection.module.css'

describe('AC-108.2: AI 섹션 CSS (AiSection.module.css)', () => {
  it('AC-108.2: 리포트 패널 .rep은 흰 바탕 · 1px line · 6px · 넘침 숨김 · min-width 0이다', () => {
    expectStyle(
      '.rep',
      0,
      {
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        'border-radius': '6px',
        'min-width': '0',
        overflow: 'hidden',
      },
      AI,
    )
  })

  it('AC-108.2: 머리 .repHead는 양끝 정렬 · 줄바꿈 · gap 8px 12px · 아래 1px line, 안쪽 14px 16px → 16px 20px', () => {
    expectStyle(
      '.repHead',
      0,
      {
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        'flex-wrap': 'wrap',
        gap: '8px 12px',
        'border-bottom': '1px solid var(--line)',
      },
      AI,
    )
    expectSteps(AI, '.repHead', 'padding', ['14px 16px', '16px 20px', '16px 20px'])
  })

  it('AC-108.2: 리포트 본문 .repBody는 1칸 → 768부터 minmax(0, 7fr) minmax(0, 5fr)이다', () => {
    expectStyle('.repBody', 0, { display: 'grid' }, AI)
    expectSteps(AI, '.repBody', 'grid-template-columns', [
      COLS(1),
      'minmax(0, 7fr) minmax(0, 5fr)',
      'minmax(0, 7fr) minmax(0, 5fr)',
    ])
  })

  it('AC-108.2: 항목 줄 .repItem은 72px minmax(0, 1fr) · 칸 사이 10px 2px · 위아래 14px · 아래 1px line(마지막 줄 0)이다', () => {
    expectSteps(AI, '.repItems', 'padding', ['0 16px', '0 20px', '0 20px'])
    for (const bp of ALL_BPS) {
      expectStyle('.repItem', bp, { display: 'grid', 'grid-template-columns': '72px minmax(0, 1fr)' }, AI)
    }
    expectStyle(
      '.repItem',
      0,
      { 'column-gap': '10px', 'row-gap': '2px', 'padding-block': '14px', 'border-bottom': '1px solid var(--line)' },
      AI,
    )
    expectStyle('.repItem:last-child', 0, { 'border-bottom': '0' }, AI)
    expectStyle('.repTag', 0, { 'justify-self': 'start' }, AI)
  })

  it('AC-108.2: 항목 글은 14/22 ink, 근거는 둘째 칸 · 13/20 muted다', () => {
    expectStyle('.repText', 0, { 'font-size': '14px', 'line-height': '22px', color: 'var(--ink)' }, AI)
    expectStyle(
      '.repBasis',
      0,
      { 'grid-column': '2', 'font-size': '13px', 'line-height': '20px', color: 'var(--muted)' },
      AI,
    )
  })

  it('AC-108.2: 채팅 칸 .chat은 세로 flex · gap 10px · 흰 바탕, 휴대폰은 위 1px 선 → 768부터 왼쪽 1px 선이다', () => {
    expectStyle(
      '.chat',
      0,
      {
        display: 'flex',
        'flex-direction': 'column',
        gap: '10px',
        background: 'var(--surface)',
        'border-top': '1px solid var(--line)',
      },
      AI,
    )
    expect(at(parse(source(AI)), '.chat', 'border-left', 0), '.chat border-left @0').toBeUndefined()
    expectSteps(AI, '.chat', 'padding', ['16px', '20px', '20px'])
    for (const bp of [768, 1024] as Bp[]) {
      expectStyle('.chat', bp, { 'border-top': '0', 'border-left': '1px solid var(--line)' }, AI)
    }
  })

  it('AC-108.2: 질문 말풍선은 오른쪽 · 최대 85% · canvas 바탕 · 1px line · 6px · 8px 12px · 14/22 ink다', () => {
    expectStyle(
      '.question',
      0,
      {
        'align-self': 'flex-end',
        'max-width': '85%',
        background: 'var(--canvas)',
        border: '1px solid var(--line)',
        'border-radius': '6px',
        padding: '8px 12px',
        'font-size': '14px',
        'line-height': '22px',
        color: 'var(--ink)',
      },
      AI,
    )
  })

  it('AC-108.2: 점 3개 .typing은 36px 상자 안의 움직이지 않는 6px 점(field, 가운데만 muted)이다', () => {
    expectStyle(
      '.typing',
      0,
      {
        'align-self': 'flex-start',
        display: 'inline-flex',
        gap: '4px',
        'align-items': 'center',
        height: '36px',
        padding: '0 12px',
        border: '1px solid var(--line)',
        'border-radius': '6px',
      },
      AI,
    )
    expectStyle(
      '.typing i',
      0,
      { display: 'block', width: '6px', height: '6px', 'border-radius': '50%', background: 'var(--field)' },
      AI,
    )
    expectStyle('.typing i:nth-child(2)', 0, { background: 'var(--muted)' }, AI)
    for (const [selector, prop] of allDecls(AI)) {
      expect(/^(animation|transition)/.test(prop), `${AI}: ${selector} { ${prop} }`).toBe(false)
    }
  })

  it('AC-108.2: 물어보기 칸 .ask는 아래로 밀린 40px 칸(1px field · 6px · 14px muted)이고 보내기 .send는 30px ink 상자다', () => {
    expectStyle(
      '.ask',
      0,
      {
        'margin-top': 'auto',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        gap: '8px',
        height: '40px',
        padding: '0 5px 0 12px',
        border: '1px solid var(--field)',
        'border-radius': '6px',
        'font-size': '14px',
        color: 'var(--muted)',
      },
      AI,
    )
    expectStyle(
      '.send',
      0,
      {
        width: '30px',
        height: '30px',
        'border-radius': '4px',
        background: 'var(--ink)',
        color: 'var(--surface)',
        display: 'grid',
        'place-items': 'center',
      },
      AI,
    )
  })

  it('AC-108.2: 옛 장식(원형 빛 · 반짝이 · 쉬머 · 번호 상자 · 영문 소제목) 규칙이 없다', () => {
    const css = source(AI)
    for (const old of ['.glow', '.sparkle', '.shimmer', '.eyebrow', '.titleAccent', '.num', '.point']) {
      expect(css, `${AI}: ${old}`).not.toMatch(new RegExp(`\\${old}(?![\\w-])`))
    }
  })
})

describe('AC-108.4: 정형외과 섹션 CSS (OrthoSection.module.css)', () => {
  it('AC-108.4: 휴대폰 카드 .orthoCard는 grid minmax(0, 1fr) 136px(글 | 조각) · gap 16px · 위 정렬이다', () => {
    expectStyle(
      '.orthoCard',
      0,
      { display: 'grid', 'grid-template-columns': 'minmax(0, 1fr) 136px', gap: '16px', 'align-items': 'start' },
      ORTHO,
    )
  })

  it('AC-108.4: 768부터 카드는 한 칸(auto 1fr 두 줄) · gap 20px이고, 조각이 위로 간다(order: -1)', () => {
    for (const bp of [768, 1024] as Bp[]) {
      expectStyle(
        '.orthoCard',
        bp,
        { 'grid-template-columns': COLS(1), 'grid-template-rows': 'auto 1fr', gap: '20px' },
        ORTHO,
      )
      expectStyle('.snip', bp, { order: '-1' }, ORTHO)
    }
    expect(at(parse(source(ORTHO)), '.snip', 'order', 0), '.snip order @0').toBeUndefined()
  })

  it('AC-108.4: 글 덩어리 .text는 grid · gap 4px · 위 정렬이다', () => {
    expectStyle('.text', 0, { display: 'grid', gap: '4px', 'align-content': 'start' }, ORTHO)
  })

  it('AC-108.4: 숫자 조각 .snip은 canvas 바탕 · 4px · 12/16, 안쪽 8px 10px → 10px 12px이다', () => {
    expectStyle(
      '.snip',
      0,
      { background: 'var(--canvas)', 'border-radius': '4px', 'font-size': '12px', 'line-height': '16px' },
      ORTHO,
    )
    expectSteps(ORTHO, '.snip', 'padding', ['8px 10px', '10px 12px', '10px 12px'])
  })

  it('AC-108.4: 조각 머리는 양끝 · muted · 아래 6px, 줄은 양끝 · 위 1px line · ink-2 · 줄바꿈 없음, 값은 13px 600 ink다', () => {
    expectStyle(
      '.snipHead',
      0,
      { display: 'flex', 'justify-content': 'space-between', color: 'var(--muted)', 'padding-bottom': '6px' },
      ORTHO,
    )
    expectStyle(
      '.snipRow',
      0,
      {
        display: 'flex',
        'justify-content': 'space-between',
        'align-items': 'baseline',
        gap: '8px',
        'padding-block': '6px',
        'border-top': '1px solid var(--line)',
        color: 'var(--ink-2)',
        'white-space': 'nowrap',
      },
      ORTHO,
    )
    expectStyle('.snipRow b', 0, { 'font-size': '13px', 'font-weight': '600', color: 'var(--ink)' }, ORTHO)
  })

  it('AC-108.4: 카드 모양(테두리 · 바탕 · 모서리 · 안쪽)은 base .card가 정하고 .orthoCard는 덮어쓰지 않는다', () => {
    for (const bp of ALL_BPS) {
      for (const prop of ['background', 'border', 'border-radius', 'padding', 'min-width']) {
        expect(at(parse(source(ORTHO)), '.orthoCard', prop, bp), `.orthoCard ${prop} @${bp}`).toBeUndefined()
      }
    }
  })

  it('AC-108.4: 옛 그림 타일 규칙(.img · .tile · .caption · 영문 소제목)이 없다', () => {
    const css = source(ORTHO)
    for (const old of ['.img', '.tile', '.tiles', '.caption', '.eyebrow']) {
      expect(css, `${ORTHO}: ${old}`).not.toMatch(new RegExp(`\\${old}(?![\\w-])`))
    }
  })
})

describe('AC-108.2 · AC-108.4: 쓰는 변수', () => {
  it.each([AI, ORTHO])('AC-108.2 · AC-108.4: %s가 쓰는 var(--…)는 모두 globals.css에 정의돼 있다', (name) => {
    const globals = withoutComments(readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8'))
    const defined = new Set([...globals.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
    const used = [...source(name).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const varName of used) expect(defined.has(varName), `${name}: ${varName}`).toBe(true)
  })
})

// ---------- 기능 섹션 (REQ-109, 시안 .feat-big · .fcard · .drop · .mini · .rates · .groups · .tbl · .feat-small) ----------

const FEAT = 'FeaturesSection.module.css'
const feat = () => parse(source(FEAT))

describe('AC-109.2: 기능 섹션 CSS (FeaturesSection.module.css)', () => {
  it('AC-109.2: 기능 카드 둘은 한 칸으로 쌓이고 사이가 12px → 16px(1024)이다', () => {
    for (const bp of ALL_BPS) expectStyle('.featBig', bp, { display: 'grid', 'grid-template-columns': COLS(1) }, FEAT)
    expectSteps(FEAT, '.featBig', 'gap', ['12px', '12px', '16px'])
  })

  it('AC-109.2: 휴대폰 기능 카드 .fcard는 세로로 쌓인 흰 상자(1px line · 6px · 넘침 숨김 · min-width 0)이고 미리보기 위에 1px 선이 있다', () => {
    expectStyle(
      '.fcard',
      0,
      {
        display: 'flex',
        'flex-direction': 'column',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        'border-radius': '6px',
        overflow: 'hidden',
        'min-width': '0',
      },
      FEAT,
    )
    expectStyle('.fcardShot', 0, { 'border-top': '1px solid var(--line)', 'min-width': '0' }, FEAT)
    expect(at(feat(), '.fcardShot', 'border-left', 0), '.fcardShot border-left @0').toBeUndefined()
  })

  it('AC-109.2: 768부터 기능 카드는 minmax(0, 1fr) minmax(0, 1fr)이고 미리보기는 위 선 대신 왼쪽 1px 선이다', () => {
    for (const bp of [768, 1024] as Bp[]) {
      expectStyle('.fcard', bp, { display: 'grid' }, FEAT)
      expectStyle('.fcardShot', bp, { 'border-top': '0', 'border-left': '1px solid var(--line)' }, FEAT)
    }
    expectStyle('.fcard', 768, { 'grid-template-columns': 'minmax(0, 1fr) minmax(0, 1fr)' }, FEAT)
  })

  it('AC-109.2: 1024부터 기능 카드는 minmax(0, 5fr) minmax(0, 7fr)이다', () => {
    expectStyle('.fcard', 1024, { 'grid-template-columns': 'minmax(0, 5fr) minmax(0, 7fr)' }, FEAT)
  })

  it('AC-109.2: 글 쪽 .fcardText 안쪽 16 → 24 → 32px, 미리보기 .fcardShot은 canvas 바탕 · 안쪽 16 → 20 → 32px이다', () => {
    expectStyle('.fcardText', 0, { display: 'grid', gap: '10px', 'align-content': 'start' }, FEAT)
    expectSteps(FEAT, '.fcardText', 'padding', ['16px', '24px', '32px'])
    expectStyle('.fcardText', 1024, { 'align-content': 'center' }, FEAT)
    expectStyle('.fcardChips', 0, { 'margin-top': '4px' }, FEAT)
    expectStyle('.fcardShot', 0, { background: 'var(--canvas)', display: 'grid', gap: '12px', 'align-content': 'start' }, FEAT)
    expectSteps(FEAT, '.fcardShot', 'padding', ['16px', '20px', '32px'])
    expectStyle('.fcardShot', 768, { 'align-content': 'center' }, FEAT)
  })

  it('AC-109.2: 파일 놓는 칸 .drop은 48px · 1px 점선 field · 6px · 흰 바탕 · 14px ink-2 · 가운데 정렬이다', () => {
    expectStyle(
      '.drop',
      0,
      {
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        gap: '8px',
        height: '48px',
        border: '1px dashed var(--field)',
        'border-radius': '6px',
        background: 'var(--surface)',
        'font-size': '14px',
        color: 'var(--ink-2)',
      },
      FEAT,
    )
  })

  it('AC-109.2: 작은 패널 .mini는 흰 바탕 · 1px line · 6px · min-width 0 · 넘침 숨김이고, 머리는 44px · 0 12px · 아래 1px line · 이름 14/20 600이다', () => {
    expectStyle(
      '.mini',
      0,
      {
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        'border-radius': '6px',
        'min-width': '0',
        overflow: 'hidden',
      },
      FEAT,
    )
    expectStyle(
      '.miniHead',
      0,
      {
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        gap: '8px',
        height: '44px',
        padding: '0 12px',
        'border-bottom': '1px solid var(--line)',
      },
      FEAT,
    )
    expectStyle('.miniTitle', 0, { 'font-size': '14px', 'line-height': '20px', 'font-weight': '600' }, FEAT)
  })

  it('AC-109.2: 통계 패널은 휴대폰·768에서 비율 4칸 줄(아래 1px 선) 아래에 처방 그룹이 오고, 1024부터 2칸(비율 2×2 | 처방 그룹)이다', () => {
    expectSteps(FEAT, '.miniBody', 'grid-template-columns', [COLS(1), COLS(1), 'minmax(0, 1fr) minmax(0, 1fr)'])
    for (const bp of [0, 768] as Bp[]) {
      expectStyle('.rates', bp, { display: 'grid', 'grid-template-columns': COLS(4), 'border-bottom': '1px solid var(--line)' }, FEAT)
      expect(at(feat(), '.rates', 'border-right', bp), `.rates border-right @${bp}`).toBeUndefined()
    }
    expectStyle(
      '.rates',
      1024,
      { 'grid-template-columns': COLS(2), 'border-bottom': '0', 'border-right': '1px solid var(--line)' },
      FEAT,
    )
  })

  it('AC-109.2: 비율 칸은 휴대폰에서 왼쪽 선으로 나뉘고, 1024부터 2×2 칸을 오른쪽·아래 선으로 나눈다', () => {
    expectStyle('.rate', 0, { display: 'grid', gap: '2px', 'min-width': '0', padding: '10px 4px 10px 10px' }, FEAT)
    expectStyle('.rate + .rate', 0, { 'border-left': '1px solid var(--line)', 'padding-left': '8px' }, FEAT)
    expectStyle('.rate', 1024, { padding: '12px 16px', 'border-left': '0' }, FEAT)
    expectStyle('.rate + .rate', 1024, { padding: '12px 16px', 'border-left': '0' }, FEAT)
    expectStyle('.rate:nth-child(odd)', 1024, { 'border-right': '1px solid var(--line)' }, FEAT)
    expectStyle('.rate:nth-child(-n+2)', 1024, { 'border-bottom': '1px solid var(--line)' }, FEAT)
    expect(at(feat(), '.rate:nth-child(odd)', 'border-right', 768), '2×2 선은 1024부터').toBeUndefined()
  })

  it('AC-109.2: 비율 이름은 12/16 muted · 줄바꿈 없음, 값은 16/22 → 18/24(1024) 600 ink다', () => {
    expectStyle('.rate dt', 0, { 'font-size': '12px', 'line-height': '16px', color: 'var(--muted)', 'white-space': 'nowrap' }, FEAT)
    expectStyle('.rate dd', 0, { 'font-weight': '600', color: 'var(--ink)' }, FEAT)
    expectSteps(FEAT, '.rate dd', 'font-size', ['16px', '16px', '18px'])
    expectSteps(FEAT, '.rate dd', 'line-height', ['22px', '22px', '24px'])
  })

  it('AC-109.2: 처방 그룹은 안쪽 10px 12px 12px → 12px 16px(1024)이고, 한 줄은 64px | 막대 | 40px · 13/18 ink-2다', () => {
    expectStyle('.groups', 0, { display: 'grid', gap: '8px', 'align-content': 'start' }, FEAT)
    expectSteps(FEAT, '.groups', 'padding', ['10px 12px 12px', '10px 12px 12px', '12px 16px'])
    expectStyle('.groups', 1024, { 'align-content': 'center' }, FEAT)
    expectStyle('.groupsTitle', 0, { 'font-size': '12px', 'line-height': '16px', color: 'var(--muted)' }, FEAT)
    expectStyle(
      '.grp',
      0,
      {
        display: 'grid',
        'grid-template-columns': '64px minmax(0, 1fr) 40px',
        gap: '8px',
        'align-items': 'center',
        'font-size': '13px',
        'line-height': '18px',
        color: 'var(--ink-2)',
      },
      FEAT,
    )
    expectStyle('.grp b', 0, { 'text-align': 'right', 'font-weight': '600', color: 'var(--ink)' }, FEAT)
  })

  it('AC-109.2: 처방 그룹 막대는 6px canvas 홈 안의 accent-tint이고, 첫 막대(.fillFirst)만 accent다', () => {
    expectStyle('.track', 0, { height: '6px', 'border-radius': '3px', background: 'var(--canvas)', overflow: 'hidden' }, FEAT)
    expectStyle('.fill', 0, { display: 'block', height: '100%', 'border-radius': '3px', background: 'var(--accent-tint)' }, FEAT)
    const rules = feat()
    for (const bp of ALL_BPS) {
      expect(cascade(rules, ['.fill'], 'background', bp), `.fill @${bp}`).toBe('var(--accent-tint)')
      expect(cascade(rules, ['.fill', '.fillFirst'], 'background', bp), `.fill.fillFirst @${bp}`).toBe('var(--accent)')
    }
    const accentUsers = rules.filter((rule) => rule.decls.some(([, v]) => /var\(--accent\)/.test(v))).flatMap((r) => r.selectors)
    expect(accentUsers, 'var(--accent)를 쓰는 선택자').toEqual(['.fillFirst'])
  })

  it('AC-109.2: 급여표는 13/20 · 폭 100%, 머리 34px canvas 500 ink-2, 칸 36px ink, 머리·칸 모두 줄바꿈 없음, 금액 칸 오른쪽 정렬이다', () => {
    expectStyle('.tbl', 0, { width: '100%', 'border-collapse': 'collapse', 'font-size': '13px', 'line-height': '20px' }, FEAT)
    expectStyle(
      '.tbl th',
      0,
      {
        height: '34px',
        padding: '0 6px',
        'text-align': 'left',
        'font-weight': '500',
        color: 'var(--ink-2)',
        background: 'var(--canvas)',
        'border-bottom': '1px solid var(--line)',
        'white-space': 'nowrap',
      },
      FEAT,
    )
    expectStyle(
      '.tbl td',
      0,
      { height: '36px', padding: '0 6px', color: 'var(--ink)', 'border-bottom': '1px solid var(--line)', 'white-space': 'nowrap' },
      FEAT,
    )
    expectStyle('.tbl tr:last-child td', 0, { 'border-bottom': '0' }, FEAT)
    expectStyle('.tbl .right', 0, { 'text-align': 'right' }, FEAT)
    expectStyle('.tbl .sub', 0, { color: 'var(--ink-2)' }, FEAT)
  })

  it('AC-109.2: 급여표 감싸개는 overflow-x: auto이고, 첫·끝 칸 바깥 여백은 12px이라 390px 폰에서도 잘리지 않는다', () => {
    expectStyle('.tblWrap', 0, { 'overflow-x': 'auto' }, FEAT)
    for (const cell of ['th', 'td']) {
      expectStyle(`.tbl ${cell}:first-child`, 0, { 'padding-left': '12px' }, FEAT)
      expectStyle(`.tbl ${cell}:last-child`, 0, { 'padding-right': '12px' }, FEAT)
    }
    // 표를 품은 상자들이 내용 폭 때문에 넓어지지 않는다(넘치면 감싸개 안에서만 옆으로 민다)
    for (const box of ['.fcard', '.fcardShot', '.mini']) expectStyle(box, 0, { 'min-width': '0' }, FEAT)
    for (const bp of ALL_BPS) {
      expect(at(feat(), '.tbl', 'min-width', bp), `.tbl min-width @${bp}`).toBeUndefined()
      expect(at(feat(), '.tblWrap', 'overflow-x', bp), `.tblWrap overflow-x @${bp}`).toBe('auto')
    }
  })

  it('AC-109.2: 작은 카드 .smallCard는 grid · gap 6px이고 카드 모양(테두리 · 바탕 · 모서리 · 안쪽)은 base .card에 맡긴다, 머리는 svg ink-2 + h3다', () => {
    expectStyle('.smallCard', 0, { display: 'grid', gap: '6px', 'align-content': 'start' }, FEAT)
    for (const bp of ALL_BPS) {
      for (const prop of ['background', 'border', 'border-radius', 'padding', 'min-width']) {
        expect(at(feat(), '.smallCard', prop, bp), `.smallCard ${prop} @${bp}`).toBeUndefined()
      }
    }
    expectStyle('.smallHead', 0, { display: 'flex', 'align-items': 'center', gap: '10px' }, FEAT)
    expectStyle('.smallHead svg', 0, { color: 'var(--ink-2)' }, FEAT)
  })

  it('AC-109.2: 옛 규칙(영문 소제목 · 출렁이는 막대 · 스캔 띠 · 카드 색 · 번갈아 놓는 줄 · 그림 .img)이 없다', () => {
    const css = source(FEAT)
    for (const old of [
      '.eyebrow',
      '.bars',
      '.bar',
      '.scan',
      '.img',
      '.row',
      '.rowReverse',
      '.visual',
      '.visualStats',
      '.visualPayroll',
      '.step',
      '.stepTeal',
      '.stepAmber',
      '.chipTeal',
      '.chipAmber',
      '.cardAmber',
      '.cardPink',
      '.cardBlue',
      '.done',
    ]) {
      expect(css, `${FEAT}: ${old}`).not.toMatch(new RegExp(`\\${old}(?![\\w-])`))
    }
    expect(css).not.toMatch(/row-reverse|wrap-reverse|aspect-ratio/)
  })

  it('AC-109.2: FeaturesSection.module.css가 쓰는 var(--…)는 모두 globals.css에 정의돼 있다', () => {
    const globals = withoutComments(readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8'))
    const defined = new Set([...globals.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
    const used = [...source(FEAT).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const varName of used) expect(defined.has(varName), `${FEAT}: ${varName}`).toBe(true)
  })
})

// ---------- 개인정보 · 시작 3단계 · 시작하기 · 푸터 (REQ-110, 시안 .priv-top · .zero · .flow · .node · .stop · .link · .steps · .start · .lp-ft) ----------

const PRIV = 'PrivacySection.module.css'
const HOW = 'HowSection.module.css'
const START = 'StartSection.module.css'
const FOOT = 'SiteFooter.module.css'
const priv = () => parse(source(PRIV))
// 옛 규칙 이름이 없다(뒤에 이름 글자가 이어지면 다른 이름이다)
function expectNoOld(file: string, olds: string[]) {
  const css = source(file)
  for (const old of olds) expect(css, `${file}: ${old}`).not.toMatch(new RegExp(`\\${old}(?![\\w-])`))
}

describe('AC-110.2: 개인정보 섹션 CSS (PrivacySection.module.css)', () => {
  it('AC-110.2: 윗부분 .top은 한 칸(gap 24px)이고 1024부터 minmax(0, 1fr) 360px · 칸 사이 48px · 아래 맞춤이다', () => {
    expectStyle('.top', 0, { display: 'grid', 'grid-template-columns': COLS(1), gap: '24px' }, PRIV)
    expectStyle('.top', 768, { 'grid-template-columns': COLS(1) }, PRIV)
    expectStyle('.top', 1024, { 'grid-template-columns': 'minmax(0, 1fr) 360px', 'column-gap': '48px', 'align-items': 'end' }, PRIV)
  })

  it('AC-110.2: 0건 카드 .zero는 휴대폰·768에서 숫자 | 설명(가운데 맞춤 · gap 20px), 1024부터 위아래(grid · gap 4px)다', () => {
    expectStyle('.zero', 0, { display: 'flex', 'align-items': 'center', gap: '20px' }, PRIV)
    expectStyle('.zero', 1024, { display: 'grid', gap: '4px', 'justify-items': 'start' }, PRIV)
    expectStyle('.zeroCaption', 0, { 'padding-left': '20px', 'border-left': '1px solid var(--line)' }, PRIV)
    expectStyle('.zeroCaption', 1024, { 'padding-left': '0', 'border-left': '0' }, PRIV)
    expectStyle('.zeroCaption', 0, { 'font-size': '15px', 'line-height': '22px', color: 'var(--ink-2)' }, PRIV)
  })

  it('AC-110.2: 0건 숫자는 48/52 → 56/64(1024) · 600 · ink · 줄바꿈 없음, 단위 "건"은 22px → 24px · 500이다', () => {
    expectSteps(PRIV, '.zeroNum', 'font-size', ['48px', '48px', '56px'])
    expectSteps(PRIV, '.zeroNum', 'line-height', ['52px', '52px', '64px'])
    expectStyle('.zeroNum', 0, { 'font-weight': '600', color: 'var(--ink)', 'white-space': 'nowrap' }, PRIV)
    expectSteps(PRIV, '.zeroNum span', 'font-size', ['22px', '22px', '24px'])
    expectStyle('.zeroNum span', 0, { 'font-weight': '500' }, PRIV)
  })

  it('AC-110.2: 흐름 .flow는 1024 미만 세로 한 칸, 1024부터 minmax(0, 1fr) 112px minmax(0, 1fr) 112px minmax(0, 1fr)이다', () => {
    for (const bp of [0, 768] as Bp[]) expectStyle('.flow', bp, { display: 'grid', 'grid-template-columns': COLS(1) }, PRIV)
    expectStyle(
      '.flow',
      1024,
      { 'grid-template-columns': 'minmax(0, 1fr) 112px minmax(0, 1fr) 112px minmax(0, 1fr)', 'align-items': 'stretch' },
      PRIV,
    )
  })

  it('AC-110.2: 흐름 카드 .node는 흰 상자(1px line · 6px · min-width 0)이고 안쪽 16px → 20px 24px → 24px, 머리는 왼쪽 정렬이다', () => {
    expectStyle(
      '.node',
      0,
      { background: 'var(--surface)', border: '1px solid var(--line)', 'border-radius': '6px', 'min-width': '0' },
      PRIV,
    )
    expectSteps(PRIV, '.node', 'padding', ['16px', '20px 24px', '24px'])
    expectStyle('.nodeHead', 0, { display: 'flex', 'align-items': 'center', gap: '8px' }, PRIV)
    for (const [selector, prop, value] of allDecls(PRIV)) {
      if (prop === 'text-align') expect(value, `${PRIV}: ${selector} { ${prop} }`).not.toBe('center')
      if (selector.startsWith('.node') && prop.startsWith('justify')) {
        expect(value, `${PRIV}: ${selector} { ${prop} }`).not.toBe('center')
      }
    }
  })

  it('AC-110.2: 1024 미만 연결은 1px var(--ink-2) 세로 선 + 아래 화살표(위 테두리 삼각형)다', () => {
    expectStyle('.link', 0, { display: 'flex', 'align-items': 'center' }, PRIV)
    expect(at(priv(), '.link', 'flex-direction', 768), '.link flex-direction @768').toBeUndefined()
    expectStyle('.linkLine', 0, { width: '1px', background: 'var(--ink-2)', 'align-self': 'stretch' }, PRIV)
    expectStyle(
      '.linkLine::after',
      0,
      {
        content: '""',
        position: 'absolute',
        'border-left': '4.5px solid transparent',
        'border-right': '4.5px solid transparent',
        'border-top': '7px solid var(--ink-2)',
      },
      PRIV,
    )
  })

  it('AC-110.2: 1024부터 연결은 가로 화살표(1px 가로 선 + 오른쪽 삼각형)이고 칩이 선 위에 온다(order: -1)', () => {
    expectStyle('.link', 1024, { 'flex-direction': 'column', 'justify-content': 'center' }, PRIV)
    expectStyle('.linkLine', 1024, { width: '100%', height: '1px' }, PRIV)
    expectStyle(
      '.linkLine::after',
      1024,
      {
        border: '0',
        'border-top': '4.5px solid transparent',
        'border-bottom': '4.5px solid transparent',
        'border-left': '7px solid var(--ink-2)',
      },
      PRIV,
    )
    expectStyle('.linkChip', 1024, { order: '-1' }, PRIV)
    expect(at(priv(), '.linkChip', 'order', 768), '.linkChip order @768').toBeUndefined()
  })

  it('AC-110.2: "여기서 멈춤" 상자는 var(--danger-soft) · 모서리 4px, 제목은 var(--danger) 13px 600, 항목은 13px ink-2다', () => {
    expectStyle('.stop', 0, { background: 'var(--danger-soft)', 'border-radius': '4px' }, PRIV)
    expectStyle('.stopTitle', 0, { color: 'var(--danger)', 'font-size': '13px', 'font-weight': '600' }, PRIV)
    expectStyle('.stopItems', 0, { 'font-size': '13px', color: 'var(--ink-2)' }, PRIV)
  })

  it('AC-110.2: ok·danger 색은 "여기서 멈춤"(.stop · .stopTitle)에만 쓴다', () => {
    let seen = 0
    for (const rule of priv()) {
      const body = rule.decls.map(([p, v]) => `${p}: ${v}`).join('; ')
      if (!/--(ok|danger)\b/.test(body)) continue
      seen++
      for (const s of rule.selectors) expect(['.stop', '.stopTitle'], `${s} { ${body} }`).toContain(s)
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('AC-110.2: 옛 규칙(영문 소제목 · 두 색 제목 · 빛나는 0 · 색 연결선 · 가운데 머리 · 옛 카드)이 없다', () => {
    expectNoOld(PRIV, [
      '.section',
      '.inner',
      '.eyebrow',
      '.title',
      '.titleAccent',
      '.lead',
      '.zeroCard',
      '.zeroUnit',
      '.center',
      '.nodePc',
      '.nodeServer',
      '.nodeAi',
      '.nodeTitle',
      '.nodeDesc',
      '.linkTeal',
      '.linkViolet',
      '.line',
      '.lineTeal',
      '.lineViolet',
      '.rules',
      '.rule',
      '.ruleTitle',
      '.ruleDesc',
    ])
  })
})

describe('AC-110.3: 시작 3단계 CSS (HowSection.module.css)', () => {
  it('AC-110.3: .steps는 한 칸 → 768부터 3칸이고 간격은 20px 24px이다', () => {
    expectStyle('.steps', 0, { display: 'grid', 'grid-template-columns': COLS(1), gap: '20px 24px' }, HOW)
    for (const bp of [768, 1024] as Bp[]) expectStyle('.steps', bp, { 'grid-template-columns': COLS(3) }, HOW)
  })

  it('AC-110.3: 번호 .stepNum은 13px/20px · 600 · muted 한 가지 색이다', () => {
    for (const bp of ALL_BPS) {
      expectStyle('.stepNum', bp, { 'font-size': '13px', 'line-height': '20px', 'font-weight': '600', color: 'var(--muted)' }, HOW)
    }
  })

  it('AC-110.3: 옛 규칙(흐르는 선 · 세 색 번호 · 색 카드 · 영문 소제목)이 없다', () => {
    expectNoOld(HOW, [
      '.section',
      '.inner',
      '.eyebrow',
      '.title',
      '.line',
      '.step',
      '.stepTeal',
      '.stepCoral',
      '.stepViolet',
      '.num',
      '.numTeal',
      '.numCoral',
      '.numViolet',
      '.stepTitle',
      '.stepDesc',
    ])
  })
})

describe('AC-110.4: 시작하기 CSS (StartSection.module.css)', () => {
  it('AC-110.4: 휴대폰 .start는 grid · gap 24px · 왼쪽 맞춤으로 위아래로 쌓인다', () => {
    expectStyle('.start', 0, { display: 'grid', gap: '24px', 'justify-items': 'start' }, START)
    expect(at(parse(source(START)), '.start', 'grid-template-columns', 0), '.start 칸 @0').toBeUndefined()
    expectStyle('.text', 0, { display: 'grid', gap: '12px' }, START)
  })

  it('AC-110.4: 768부터 .start는 minmax(0, 1fr) auto · 아래 맞춤 · gap 32px이다', () => {
    for (const bp of [768, 1024] as Bp[]) {
      expectStyle('.start', bp, { 'grid-template-columns': 'minmax(0, 1fr) auto', 'align-items': 'end', gap: '32px' }, START)
    }
  })

  it('AC-110.4: 원형 빛과 가운데 정렬이 없다', () => {
    expectNoOld(START, ['.section', '.inner', '.glow', '.title', '.lead'])
    const css = source(START)
    expect(css).not.toMatch(/radial/i)
    expect(css).not.toMatch(/text-align\s*:\s*center/i)
    expect(css).not.toMatch(/align-items\s*:\s*center/i)
  })
})

describe('AC-110.5: 푸터 CSS (SiteFooter.module.css)', () => {
  it('AC-110.5: footer는 위 1px line · 흰 바탕이다', () => {
    expectStyle('.footer', 0, { 'border-top': '1px solid var(--line)', background: 'var(--surface)' }, FOOT)
  })

  it('AC-110.5: 안쪽 .inner는 위아래 24px · 13px/20px · muted이고 양끝으로 나뉘며 접히면 줄을 바꾼다', () => {
    expectStyle(
      '.inner',
      0,
      {
        display: 'flex',
        'flex-wrap': 'wrap',
        'justify-content': 'space-between',
        gap: '4px 20px',
        'padding-block': '24px',
        'font-size': '13px',
        'line-height': '20px',
        color: 'var(--muted)',
      },
      FOOT,
    )
    expectStyle('.right', 0, { display: 'flex', 'flex-wrap': 'wrap', gap: '4px 20px' }, FOOT)
  })

  it('AC-110.5: 틀 폭·좌우 여백은 base .wrap이 정하고 .inner는 덮어쓰지 않는다', () => {
    for (const bp of ALL_BPS) {
      for (const prop of ['max-width', 'margin', 'margin-inline', 'padding', 'padding-inline']) {
        expect(at(parse(source(FOOT)), '.inner', prop, bp), `.inner ${prop} @${bp}`).toBeUndefined()
      }
    }
  })
})

describe('AC-105.7: 랜딩 모듈이 쓰는 변수', () => {
  it.each(CHECKED)('AC-105.7: %s가 쓰는 var(--…)는 모두 globals.css의 랜딩 :root에 정의돼 있다(옛 변수 없음)', (name) => {
    const globals = withoutComments(readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8'))
    const roots = blocks(globals).filter(([head]) => head === ':root')
    expect(roots.length, 'globals.css의 :root').toBeGreaterThan(0)
    const defined = new Set(roots.flatMap(([, body]) => [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])))
    for (const varName of [...source(name).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1])) {
      expect(defined.has(varName), `${name}: ${varName}`).toBe(true)
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
  it('AC-105.7: 검사 목록은 랜딩 폴더의 *.module.css 전부이고 base + 섹션 모듈 11개를 모두 담는다', () => {
    expect(CHECKED).toEqual(expect.arrayContaining(LANDING_MODULES))
    expect(CHECKED.length).toBeGreaterThanOrEqual(LANDING_MODULES.length)
  })

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
