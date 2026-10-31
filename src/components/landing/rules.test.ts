import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ds } from '@/components/ui/classes'

// 랜딩 CSS 규칙 시험 (specs/b2b-redesign REQ-212 AC-212.1·AC-212.2, design.md '시험 방식', docs/UI_GUIDE.md '랜딩 짜임').
// landing-v2의 CSS 값 하나하나 시험(styles.test.ts)을 대신한다. 값을 박지 않고 규칙(토큰만·간격 단계·글자 단계·모서리·굵기·
// 금지 장식·화면 폭)을 본다. 픽셀 모양은 Phase 끝 화면 사진이 본다.
const ROOT = process.cwd()
const DIR = join(ROOT, 'src/components/landing')

// AC-212.1 검사 목록: 새 규칙으로 고친 랜딩 모듈. TASK마다 늘고, TASK-14에서 랜딩 폴더 전체 읽기로 바꾼다
const CHECKED = ['base.module.css', 'SiteHeader.module.css', 'SiteFooter.module.css']

// ---------- CSS 읽기 도우미 ----------

// 따옴표 안의 "/*"는 주석이 아니다 → 따옴표 글은 그대로 두고 주석만 지운다
const withoutComments = (css: string) =>
  css.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\//g, (_, quoted: string | undefined) => quoted ?? '')

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

// 따옴표·괄호 밖에서 글자 하나(sep)로 나눈다
function splitTop(text: string, sep: (ch: string) => boolean): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let current = ''
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (depth === 0 && sep(ch)) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}
const splitSelectors = (selector: string) => splitTop(selector, (ch) => ch === ',').map(normSelector)
// 값을 낱말로: '1px solid var(--line)' → ['1px', 'solid', 'var(--line)']
const words = (value: string) => splitTop(value, (ch) => /\s/.test(ch))

type Decl = { prop: string; value: string; important: boolean }
// at: 둘러싼 @규칙 머리(바깥부터). 맨 위 규칙은 []
type Rule = { at: string[]; selectors: string[]; decls: Decl[] }
type Sheet = { rules: Rule[]; atRules: string[]; problems: string[] }

function declarations(body: string): Decl[] {
  return splitTop(body, (ch) => ch === ';')
    .filter((part) => part.includes(':'))
    .map((part) => {
      const colon = part.indexOf(':')
      const raw = part.slice(colon + 1)
      const important = /!\s*important\s*$/i.test(raw)
      return {
        prop: part.slice(0, colon).trim().toLowerCase(),
        value: normValue(raw.replace(/!\s*important\s*$/i, '')),
        important,
      }
    })
}

// 블록 하나의 바로 아래 항목: 블록 [머리, 몸통] 또는 블록 밖 글자(';'로 끝나는 @import 같은 것). 따옴표 안 중괄호는 세지 않는다
function items(text: string, problems: string[]): Array<{ head: string; body: string } | { statement: string }> {
  const out: Array<{ head: string; body: string } | { statement: string }> = []
  let depth = 0
  let quote = ''
  let start = 0
  let head = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '{') {
      if (depth === 0) {
        head = text.slice(start, i).trim()
        start = i + 1
      }
      depth++
    } else if (ch === '}') {
      depth--
      if (depth < 0) {
        problems.push('짝 없는 }')
        depth = 0
        start = i + 1
      } else if (depth === 0) {
        out.push({ head, body: text.slice(start, i) })
        start = i + 1
      }
    } else if (ch === ';' && depth === 0) {
      out.push({ statement: text.slice(start, i).trim() })
      start = i + 1
    }
  }
  if (depth !== 0) problems.push('닫히지 않은 {')
  if (text.slice(start).trim()) out.push({ statement: text.slice(start).trim() })
  return out
}

function walk(text: string, at: string[], sheet: Sheet) {
  for (const item of items(text, sheet.problems)) {
    if ('statement' in item) {
      if (item.statement) sheet.problems.push(`블록 밖 글자 ${normValue(item.statement)}`)
      continue
    }
    if (item.head.startsWith('@')) {
      const head = normHead(item.head)
      sheet.atRules.push(head)
      walk(item.body, [...at, head], sheet)
      continue
    }
    if (/[{}]/.test(item.body)) sheet.problems.push(`규칙 안 규칙(nesting) ${normSelector(item.head)}`)
    sheet.rules.push({ at, selectors: splitSelectors(item.head), decls: declarations(item.body) })
  }
}

function parseCss(css: string): Sheet {
  const sheet: Sheet = { rules: [], atRules: [], problems: [] }
  walk(withoutComments(css), [], sheet)
  return sheet
}

const readLanding = (name: string) => {
  const path = join(DIR, name)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

// ---------- 토큰 (globals.css layer 밖 :root) ----------

const rootVars = (() => {
  const sheet = parseCss(readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8'))
  const root = sheet.rules.filter((r) => r.at.length === 0 && r.selectors.length === 1 && r.selectors[0] === ':root')
  return new Map(root.flatMap((r) => r.decls.filter((d) => d.prop.startsWith('--')).map((d) => [d.prop.slice(2), d.value] as const)))
})()
// 색 토큰: 값이 16진수인 변수(차트·항목 색 포함)
const COLOR_TOKENS = new Set([...rootVars].filter(([, v]) => /^#[0-9a-f]{3,8}$/i.test(v)).map(([k]) => k))
// 옛 이름 별칭: 값이 var() 하나뿐인 변수(--ok·--danger·--content-max …, TASK-23에서 지움). 고친 모듈은 쓰지 않는다
const ALIASES = new Set([...rootVars].filter(([, v]) => /^var\(--[\w-]+\)$/.test(v)).map(([k]) => k))

// ---------- AC-212.1 규칙 ----------

// CSS 색 이름(CSS Color 4) + 시스템 색
const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue ' +
    'chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey ' +
    'darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray ' +
    'darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen ' +
    'fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen ' +
    'lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime ' +
    'limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue ' +
    'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive ' +
    'olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum ' +
    'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver ' +
    'skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen ' +
    'accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext ' +
    'highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext'
  ).split(' '),
)
const HEX = /#[0-9a-f]{3,8}\b/i
const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i
// 색을 싣는 속성(줄임 속성 포함)
const COLOR_PROP =
  /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|text-decoration(?:-color)?|caret-color|accent-color|column-rule(?:-color)?|scrollbar-color|text-emphasis(?:-color)?|-webkit-tap-highlight-color|stop-color|flood-color|lighting-color)$/
// 값 전체가 색 하나인 속성
const SINGLE_COLOR_PROP =
  /^(?:color|background-color|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-color|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color|column-rule-color)$/
const COLOR_KEYWORDS = new Set(['transparent', 'currentcolor', 'inherit'])
const SPACING_PROP =
  /^(?:(?:margin|padding|scroll-margin|scroll-padding)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|gap|row-gap|column-gap|grid-gap|grid-row-gap|grid-column-gap|inset(?:-(?:block|inline)(?:-(?:start|end))?)?|top|right|bottom|left)$/
// 간격 단계(px). 72·80은 scroll-margin(메뉴 높이 + 여유)에만 쓴다(UI_GUIDE '간격')
const SPACING = new Set([0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 48, 64, 96])
const SCROLL_EXTRA = new Set([72, 80])
const RADIUS_PROP = /^border(?:-[\w-]+)?-radius$/
const RADIUS_OK = new Set(['0', 'var(--r-control)', 'var(--r-float)'])
const BANNED_PROP =
  /^(?:-webkit-)?(?:box-shadow|backdrop-filter|filter|animation(?:-[\w-]+)?|transition(?:-[\w-]+)?)$/
const LAYER = '@layer base'
const MIN_768 = '@media (min-width: 768px)'
const MIN_1024 = '@media (min-width: 1024px)'
const MAX_PHONE = '@media (max-width: 767.98px)'
const ALLOWED_AT = new Set([LAYER, MIN_768, MIN_1024, MAX_PHONE])

const stripVars = (value: string) => {
  let out = value
  while (/var\([^()]*\)/.test(out)) out = out.replace(/var\([^()]*\)/g, ' ')
  return out
}
const stripQuoted = (value: string) => value.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
const varNames = (value: string) => [...value.matchAll(/var\(\s*--([\w-]+)/g)].map((m) => m[1])

function spacingOk(token: string, prop: string): boolean {
  if (token === '0' || token === 'auto') return true
  if (/^-?\d+(?:\.\d+)?%$/.test(token)) return true
  if (/^var\(--gutter(?:-[\w-]+)?\)$/.test(token)) return true
  const px = /^-?(\d+)px$/.exec(token)
  if (!px) return false
  const n = Number(px[1])
  return SPACING.has(n) || (prop.startsWith('scroll-margin') && SCROLL_EXTRA.has(n))
}

// 모듈 글자 하나가 어긴 규칙(없으면 빈 배열)
function violations(css: string): string[] {
  const sheet = parseCss(css)
  const found = [...sheet.problems]
  const localVars = new Set(sheet.rules.flatMap((r) => r.decls.filter((d) => d.prop.startsWith('--')).map((d) => d.prop.slice(2))))

  for (const head of sheet.atRules) {
    if (!ALLOWED_AT.has(head)) found.push(`@규칙 ${head}`)
  }

  for (const rule of sheet.rules) {
    const where = rule.selectors.join(', ')
    const onlyPhone = rule.at.includes(MAX_PHONE)
    if (onlyPhone && !(rule.selectors.length === 1 && rule.selectors[0] === '.pcOnly')) {
      found.push(`${where}: (max-width: 767.98px)는 .pcOnly 숨김에만`)
    }
    for (const { prop, value, important } of rule.decls) {
      const decl = `${where} { ${prop}: ${value} }`
      const bare = stripQuoted(value)

      if (important) {
        const hide =
          prop === 'display' &&
          value === 'none' &&
          rule.selectors.length === 1 &&
          ((rule.selectors[0] === '.pcOnly' && onlyPhone) || (rule.selectors[0] === '.phoneOnly' && rule.at.includes(MIN_768)))
        if (!hide) found.push(`!important ${decl}`)
      }

      // 금지 장식
      if (BANNED_PROP.test(prop)) found.push(`장식 ${decl}`)
      if (/gradient\(/i.test(bare)) found.push(`그라데이션 ${decl}`)

      // 색: 토큰 var()·transparent·currentColor·inherit뿐
      if (HEX.test(bare)) found.push(`16진수 색 ${decl}`)
      if (COLOR_FN.test(bare)) found.push(`색 함수 ${decl}`)
      if (COLOR_PROP.test(prop) || prop.startsWith('--')) {
        for (const word of stripVars(bare).toLowerCase().match(/[a-z][a-z-]*/g) ?? []) {
          if (NAMED_COLORS.has(word)) found.push(`색 이름 ${decl}`)
        }
      }
      if (COLOR_PROP.test(prop)) {
        if (/url\(/i.test(bare)) found.push(`그림 url ${decl}`)
        for (const name of varNames(value)) if (!COLOR_TOKENS.has(name)) found.push(`색 토큰이 아닌 var(--${name}) ${decl}`)
      }
      if (SINGLE_COLOR_PROP.test(prop)) {
        const ok =
          COLOR_KEYWORDS.has(value.toLowerCase()) ||
          ((prop === 'fill' || prop === 'stroke') && value === 'none') ||
          (/^var\(--[\w-]+\)$/.test(value) && COLOR_TOKENS.has(varNames(value)[0]))
        if (!ok) found.push(`색 값 ${decl}`)
      }

      // 변수: globals.css :root 토큰(별칭 빼고)이나 이 파일이 정한 변수만
      for (const name of varNames(value)) {
        if (ALIASES.has(name)) found.push(`옛 별칭 var(--${name}) ${decl}`)
        else if (!rootVars.has(name) && !localVars.has(name)) found.push(`정의 안 된 var(--${name}) ${decl}`)
      }

      // 글자: 크기·줄 높이는 토큰, 굵기 400·500·600, 자간 0·토큰
      if (prop === 'font') {
        if (value !== 'inherit') found.push(`줄임 font ${decl}`)
      }
      if (prop === 'font-size' && !/^var\(--fs-[\w-]+\)$/.test(value)) found.push(`글자 크기 ${decl}`)
      if (prop === 'line-height' && !/^var\(--lh-[\w-]+\)$/.test(value)) found.push(`줄 높이 ${decl}`)
      if (prop === 'font-weight' && !['400', '500', '600'].includes(value)) found.push(`굵기 ${decl}`)
      if (prop === 'letter-spacing' && !(value === '0' || /^var\(--ls-[\w-]+\)$/.test(value))) found.push(`자간 ${decl}`)

      // 모서리
      if (RADIUS_PROP.test(prop) && !splitTop(value, (ch) => /[\s/]/.test(ch)).every((w) => RADIUS_OK.has(w))) {
        found.push(`모서리 ${decl}`)
      }

      // 간격 단계
      if (SPACING_PROP.test(prop) && !words(value).every((w) => spacingOk(w, prop))) found.push(`간격 ${decl}`)
    }
  }
  return found
}

describe('AC-212.1: 검사 목록의 랜딩 모듈은 토큰·간격 단계·글자 단계·모서리·굵기 규칙만 쓰고 장식이 없다', () => {
  it('AC-212.1: 검사 목록은 base.module.css에서 시작하고, 파일마다 실제 규칙이 있다(빈 검사가 아니다)', () => {
    expect(CHECKED).toContain('base.module.css')
    for (const name of CHECKED) {
      expect(existsSync(join(DIR, name)), name).toBe(true)
      expect(parseCss(readLanding(name)).rules.length, name).toBeGreaterThan(0)
    }
    // 토큰을 globals.css에서 실제로 읽었다
    expect([...COLOR_TOKENS]).toEqual(
      expect.arrayContaining(['canvas', 'surface', 'line', 'ink', 'ink-2', 'accent', 'positive-soft', 'warning', 'chart-3', 'cat-5']),
    )
    expect(COLOR_TOKENS.has('fs-body') || COLOR_TOKENS.has('ok'), '색 토큰에 글자·별칭 변수가 섞이지 않는다').toBe(false)
    expect([...ALIASES]).toEqual(expect.arrayContaining(['ok', 'danger', 'content-max', 'accent-tint']))
    expect(rootVars.get('fs-body')).toBe('14px')
  })

  it('AC-212.1: 검사 목록의 모든 모듈이 규칙을 지킨다', () => {
    for (const name of CHECKED) expect(violations(readLanding(name)), name).toEqual([])
  })

  // 검사가 헛돌지 않는지: 어긴 예는 잡고, 지킨 예는 통과시킨다
  const BAD: Array<[string, string]> = [
    ['.a { color: #fff; }', '16진수 색'],
    ['.a { border: 1px solid #E5E7EB; }', '16진수 색'],
    ['.a { color: rgb(17 24 39); }', '색 함수'],
    ['.a { background: rgba(0, 0, 0, .1); }', '색 함수'],
    ['.a { color: hsl(0 0% 0%); }', '색 함수'],
    ['.a { background: color-mix(in srgb, var(--ink) 50%, transparent); }', '색 함수'],
    ['.a { color: white; }', '색 이름'],
    ['.a { border: 1px solid Black; }', '색 이름'],
    ['.a { outline: 2px solid red; }', '색 이름'],
    ['.a { --my-color: navy; }', '색 이름'],
    ['.a { background: CanvasText; }', '색 이름'],
    ['.a { color: var(--ok); }', '옛 별칭'],
    ['.a { max-width: var(--content-max); }', '옛 별칭'],
    ['.a { color: var(--color-ink); }', '정의 안 된'],
    ['.a { color: var(--fs-body); }', '색 토큰이 아닌'],
    ['.a { background: url("data:image/svg+xml,x"); }', '그림 url'],
    ['.a { color: initial; }', '색 값'],
    ['.a { font-size: 14px; }', '글자 크기'],
    ['.a { font-size: 1rem; }', '글자 크기'],
    ['.a { line-height: 1.5; }', '줄 높이'],
    ['.a { font: 600 14px/22px sans-serif; }', '줄임 font'],
    ['.a { font-weight: 700; }', '굵기'],
    ['.a { font-weight: bold; }', '굵기'],
    ['.a { letter-spacing: -0.01em; }', '자간'],
    ['.a { border-radius: 6px; }', '모서리'],
    ['.a { border-radius: 50%; }', '모서리'],
    ['.a { border-top-left-radius: 2px; }', '모서리'],
    ['.a { margin: 10px; }', '간격'],
    ['.a { padding: 0 14px; }', '간격'],
    ['.a { gap: 1rem; }', '간격'],
    ['.a { row-gap: 40px; }', '간격'],
    ['.a { margin-block: -1px; }', '간격'],
    ['.a { inset: -3px 0; }', '간격'],
    ['.a { top: calc(100% + 4px); }', '간격'],
    ['.a { padding-top: 80px; }', '간격'],
    ['.a { scroll-margin-top: 56px; }', '간격'],
    ['.a { box-shadow: none; }', '장식'],
    ['.a { filter: blur(2px); }', '장식'],
    ['.a { backdrop-filter: blur(4px); }', '장식'],
    ['.a { -webkit-backdrop-filter: blur(4px); }', '장식'],
    ['.a { animation: spin 1s; }', '장식'],
    ['.a { transition: background-color .15s ease; }', '장식'],
    ['.a { transition-duration: .2s; }', '장식'],
    ['.a { background: linear-gradient(var(--ink), var(--surface)); }', '그라데이션'],
    ['.a { background-image: radial-gradient(var(--accent), transparent); }', '그라데이션'],
    ['@keyframes spin { to { opacity: 1; } }', '@규칙 @keyframes'],
    ['.a { display: none !important; }', '!important'],
    ['@media (max-width: 767.98px) { .pcOnly { display: block !important; } }', '!important'],
    ['@media (min-width: 768px) { .pcOnly { display: none !important; } }', '!important'],
    ['@media (max-width: 767.98px) { .a { display: none; } }', '.pcOnly 숨김에만'],
    ['@media (min-width: 640px) { .a { margin: 0; } }', '@규칙 @media (min-width: 640px)'],
    ['@media (max-width: 1023px) { .a { margin: 0; } }', '@규칙 @media (max-width: 1023px)'],
    ['@media screen and (min-width: 768px) { .a { margin: 0; } }', '@규칙'],
    ['@container (min-width: 400px) { .a { margin: 0; } }', '@규칙 @container'],
    ['@supports (display: grid) { .a { margin: 0; } }', '@규칙 @supports'],
    ['@layer components { .a { margin: 0; } }', '@규칙 @layer components'],
    ['@import url("x.css");', '블록 밖 글자'],
    ['.a { margin: 0; .b { margin: 0; } }', '규칙 안 규칙'],
  ]
  it.each(BAD)('AC-212.1: 어긴 예 %s 를 잡는다(%s)', (css, why) => {
    const found = violations(css)
    expect(found.some((v) => v.includes(why)), `${css} → ${JSON.stringify(found)}`).toBe(true)
  })

  const GOOD = [
    '.a { color: var(--ink); background: transparent; border: 1px solid var(--line); outline: 2px solid var(--accent); }',
    '.a { color: currentColor; fill: currentColor; stroke: none; background-color: var(--canvas); color: inherit; }',
    '.a { border-top: 1px solid var(--line-strong); border-color: transparent; text-decoration: none; }',
    '.a { font-family: var(--font-ui); font-size: var(--fs-body); line-height: var(--lh-body); font-weight: 600; }',
    '.a { letter-spacing: var(--ls-heading); } .b { letter-spacing: 0; font-weight: 400; } .c { font-weight: 500; font: inherit; }',
    '.a { border-radius: var(--r-control); } .b { border-radius: 0; } .c { border-radius: var(--r-float) var(--r-float) 0 0; }',
    '.a { margin: -16px auto 0; padding: 2px 6px 20px 96px; gap: 12px 24px; row-gap: 48px; column-gap: 64px; }',
    '.a { inset: 0; top: 50%; left: -4px; scroll-margin-top: 72px; padding-inline: var(--gutter-m); margin-inline: auto; }',
    '@media (min-width: 768px) { .a { scroll-margin-top: 80px; padding-inline: var(--gutter); } }',
    '@media (max-width: 767.98px) { .pcOnly { display: none !important; } } @media (min-width: 768px) { .phoneOnly { display: none !important; } }',
    '@media (min-width: 1024px) { .a { max-width: calc(var(--w-landing) + 2 * var(--gutter)); } }',
    '@layer base { .root :where(p) { margin: 0; } }',
    '/* color: #fff; transition: all 1s; font-size: 15px */ .a { color: var(--ink); }',
    '.a::after { content: ""; } .b { grid-template-areas: "logo cta" "nav nav"; white-space: nowrap; }',
    '.a { --cols: 3; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); }',
  ]
  it.each(GOOD)('AC-212.1: 지킨 예 %s 는 통과한다', (css) => {
    expect(violations(css)).toEqual([])
  })
})

// ---------- AC-212.2: base.module.css 값 ----------

// 요소(태그)·전체(*) 선택자를 쓰는가: '.root :where(h1, p)'·'.root a:focus-visible'·'.root *'는 예, '.wrap'·'.btn:hover'는 아니오
const hasTypeSelector = (selector: string) =>
  /(?:^|[\s>+~(,])(?:\*|[a-zA-Z][\w-]*)/.test(
    selector.replace(/\[[^\]]*\]/g, '').replace(/:nth-[\w-]+\([^)]*\)/g, ''),
  )

type Bp = 0 | 768 | 1024
const BP_OF: Record<string, number> = { [MIN_768]: 768, [MIN_1024]: 1024 }
// 그 폭에서 켜지는 규칙인가(@layer는 폭과 상관없다)
const appliesAt = (rule: Rule, bp: Bp) =>
  rule.at.every((h) => h === LAYER || (h === MAX_PHONE ? bp < 768 : h in BP_OF ? bp >= BP_OF[h] : false))
const layered = (rule: Rule) => rule.at.includes(LAYER)

// 줄임 속성에서 원하는 값을 꺼낸다
function pick(want: string, d: Decl): string | undefined {
  if (d.prop === want) return d.value
  const parts = words(d.value)
  const colorWord = (w: string) => /^var\(--[\w-]+\)$/.test(w) || COLOR_KEYWORDS.has(w.toLowerCase())
  if (want === 'background' && d.prop === 'background-color') return d.value
  if (want === 'border-color' && d.prop === 'border') return parts.find(colorWord) ?? 'currentcolor'
  if (want === 'border-width' && d.prop === 'border') return parts.find((w) => /^\d/.test(w))
  if (want === 'padding-inline' && d.prop === 'padding') {
    return parts.length === 4 && parts[1] !== parts[3] ? `${parts[1]} ${parts[3]}` : (parts[1] ?? parts[0])
  }
  return undefined
}

// 클래스 여럿을 함께 단 원소의 값(layer 밖, 그 폭): 선택자는 클래스 하나짜리라 구체성이 같고 파일에서 마지막 선언이 이긴다
function cascade(sheet: Sheet, selectors: string[], prop: string, bp: Bp): string | undefined {
  let value: string | undefined
  for (const rule of sheet.rules) {
    if (layered(rule) || !appliesAt(rule, bp) || !rule.selectors.some((s) => selectors.includes(s))) continue
    for (const d of rule.decls) value = pick(prop, d) ?? value
  }
  return value
}
// 선택자 하나(정확히 같은 글자)의 값
function valueOf(sheet: Sheet, selector: string, prop: string, bp: Bp, inLayer = false): string | undefined {
  let value: string | undefined
  for (const rule of sheet.rules) {
    if (layered(rule) !== inLayer || !appliesAt(rule, bp) || !rule.selectors.includes(normSelector(selector))) continue
    for (const d of rule.decls) value = pick(prop, d) ?? value
  }
  return value
}

const base = () => parseCss(readLanding('base.module.css'))

function expectAt(selector: string, bp: Bp, want: Record<string, string>, inLayer = false) {
  const sheet = base()
  for (const [prop, value] of Object.entries(want)) {
    expect(valueOf(sheet, selector, prop, bp, inLayer), `${inLayer ? '@layer base ' : ''}${selector} { ${prop} } @${bp}`).toBe(normValue(value))
  }
}

// ds 클래스 글자 → 같은 뜻의 CSS 값. 접두사 없는 것과 올림(hover:)만 본다(휴대폰 max-md:는 랜딩 메뉴 단추 32px 때문에 빼고 본다)
const TEXT_STEP = /^text-(caption|small|body|lead|subtitle|title|heading-m|heading|metric|display-m|display)$/
function dsValues(classes: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const token of classes.split(/\s+/).filter(Boolean)) {
    const parts = token.split(':')
    const util = parts.pop()!
    if (parts.length > 0 && parts.at(-1) !== 'hover') continue
    const hover = parts.length > 0
    const step = (n: string) => `${Number(n) * 4}px`
    let m: RegExpExecArray | null
    if (hover) {
      if ((m = /^bg-([\w-]+)$/.exec(util)) && COLOR_TOKENS.has(m[1])) out['hover:background'] = `var(--${m[1]})`
      continue
    }
    if ((m = /^h-(\d+(?:\.\d+)?)$/.exec(util))) out.height = step(m[1])
    else if ((m = /^px-(\d+(?:\.\d+)?)$/.exec(util))) out['padding-inline'] = step(m[1])
    else if ((m = /^gap-(\d+(?:\.\d+)?)$/.exec(util))) out.gap = step(m[1])
    else if ((m = TEXT_STEP.exec(util))) {
      out['font-size'] = `var(--fs-${m[1]})`
      out['line-height'] = `var(--lh-${m[1]})`
    } else if (util === 'font-medium') out['font-weight'] = '500'
    else if (util === 'font-semibold') out['font-weight'] = '600'
    else if (util === 'rounded-control') out['border-radius'] = 'var(--r-control)'
    else if (util === 'border') out['border-width'] = '1px'
    else if (util === 'border-transparent') out['border-color'] = 'transparent'
    else if ((m = /^border-([\w-]+)$/.exec(util)) && COLOR_TOKENS.has(m[1])) out['border-color'] = `var(--${m[1]})`
    else if ((m = /^bg-([\w-]+)$/.exec(util)) && COLOR_TOKENS.has(m[1])) out.background = `var(--${m[1]})`
    else if ((m = /^text-([\w-]+)$/.exec(util)) && COLOR_TOKENS.has(m[1])) out.color = `var(--${m[1]})`
  }
  return out
}
const only = (values: Record<string, string>, keys: string[]) =>
  Object.fromEntries(Object.entries(values).filter(([k]) => keys.includes(k)))
const SIZE_KEYS = ['height', 'padding-inline', 'font-size', 'line-height', 'font-weight']
const TONE_KEYS = ['background', 'color', 'border-color']

// 랜딩 원소 값: 클래스 묶음 + 올림 규칙(.이름:hover)
function landingValues(sheet: Sheet, classes: string[], keys: string[], bp: Bp): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const key of keys) {
    if (key === 'hover:background') {
      out[key] = cascade(sheet, classes.map((c) => `${c}:hover`), 'background', bp)
    } else out[key] = cascade(sheet, classes, key, bp)
  }
  return out
}

describe('AC-212.2: base.module.css — 요소 초기화는 @layer base 안, 틀·글자 단계·단추·칩·숨김 도우미는 layer 밖', () => {
  it('AC-212.2: 선택자 판단 도우미가 요소·전체 선택자를 가려낸다', () => {
    for (const s of ['.root :where(h1, h2, p)', '.root a:focus-visible', '.root *', '.root *::before', '.root svg', '.a > li', '.a:is(p)']) {
      expect(hasTypeSelector(s), s).toBe(true)
    }
    for (const s of ['.root', '.wrap', '.btn:hover', '.btnPrimary:hover', '.group > .card', '.a::after', '.a:nth-child(2n+1)', '.a[data-x="p"]', '.a:not(.b)']) {
      expect(hasTypeSelector(s), s).toBe(false)
    }
  })

  it('AC-212.2: 요소·전체 선택자를 쓰는 규칙은 모두 @layer base 안에 있고, layer 안에는 그런 초기화 규칙만 있다', () => {
    const sheet = base()
    const outside = sheet.rules.filter((r) => !layered(r) && r.selectors.some(hasTypeSelector)).map((r) => r.selectors.join(', '))
    expect(outside).toEqual([])
    const inside = sheet.rules.filter(layered)
    expect(inside.length).toBeGreaterThan(0)
    expect(inside.filter((r) => !r.selectors.every(hasTypeSelector)).map((r) => r.selectors.join(', '))).toEqual([])
    expect(sheet.atRules.filter((h) => h === LAYER)).toHaveLength(1)
  })

  it('AC-212.2: @layer base 초기화 — border-box, 제목·글·목록 여백 0, 목록 점 없음, 링크 색 상속·밑줄 없음, 링크 초점 고리 2px accent', () => {
    for (const s of ['.root *', '.root *::before', '.root *::after']) expectAt(s, 0, { 'box-sizing': 'border-box' }, true)
    expectAt('.root :where(h1, h2, h3, p, ol, ul, dl, dd, figure)', 0, { margin: '0', padding: '0' }, true)
    expectAt('.root :where(ol, ul)', 0, { 'list-style': 'none' }, true)
    const sheet = base()
    const link = ['.root :where(a)', '.root a'].find((s) => valueOf(sheet, s, 'color', 0, true) !== undefined)
    expect(link, '@layer base 안 .root a 규칙').toBeDefined()
    expectAt(link!, 0, { color: 'inherit', 'text-decoration': 'none' }, true)
    const focus = sheet.rules.find((r) => layered(r) && r.selectors.some((s) => /^\.root (?::where\()?a\)?:focus-visible$/.test(s)))
    expect(focus, '@layer base 안 링크 초점 규칙').toBeDefined()
    expect(focus!.decls).toEqual(
      expect.arrayContaining([
        { prop: 'outline', value: '2px solid var(--accent)', important: false },
        { prop: 'outline-offset', value: '2px', important: false },
      ]),
    )
  })

  it('AC-212.2: .root는 surface 바탕·ink 글자·var(--font-ui)(Pretendard, REQ-203)·body 14/22 토큰·고정폭 숫자·keep-all이다', () => {
    expectAt('.root', 0, {
      background: 'var(--surface)',
      color: 'var(--ink)',
      'font-family': 'var(--font-ui)',
      'font-size': 'var(--fs-body)',
      'line-height': 'var(--lh-body)',
      'font-variant-numeric': 'tabular-nums',
      'word-break': 'keep-all',
    })
  })

  it('AC-212.2: .wrap은 최대 calc(var(--w-landing) + 2 * var(--gutter))·가운데, 좌우 var(--gutter-m) → var(--gutter)(768)', () => {
    expectAt('.wrap', 0, { 'max-width': 'calc(var(--w-landing) + 2 * var(--gutter))', 'margin-inline': 'auto', 'padding-inline': 'var(--gutter-m)' })
    expectAt('.wrap', 768, { 'padding-inline': 'var(--gutter)' })
    expectAt('.wrap', 1024, { 'padding-inline': 'var(--gutter)', 'max-width': 'calc(var(--w-landing) + 2 * var(--gutter))' })
  })

  it('AC-212.2: .grid는 1024px 이상 12칸·칸 사이 24px이고, 그 아래에서는 12칸이 아니다', () => {
    expectAt('.grid', 1024, { display: 'grid', 'grid-template-columns': 'repeat(12, minmax(0, 1fr))', 'column-gap': '24px' })
    const sheet = base()
    for (const bp of [0, 768] as Bp[]) expect(valueOf(sheet, '.grid', 'grid-template-columns', bp), `.grid @${bp}`).not.toMatch(/repeat\(12/)
  })

  it('AC-212.2: .sec 위아래 48px → 64px(768) → 96px(1024), .secCanvas(띠)는 canvas 바탕이다', () => {
    expectAt('.sec', 0, { 'padding-block': '48px' })
    expectAt('.sec', 768, { 'padding-block': '64px' })
    expectAt('.sec', 1024, { 'padding-block': '96px' })
    expectAt('.secCanvas', 0, { background: 'var(--canvas)' })
  })

  // [클래스, 768px 미만 단계, 768px 이상 단계, 폭과 상관없는 값]
  const TYPE: Array<[string, string, string, Record<string, string>]> = [
    ['.tDisplay', 'display-m', 'display', { 'font-weight': '600', 'letter-spacing': 'var(--ls-display)' }],
    ['.tHeading', 'heading-m', 'heading', { 'font-weight': '600', 'letter-spacing': 'var(--ls-heading)' }],
    ['.tTitle', 'title', 'title', { 'font-weight': '600' }],
    ['.tSubtitle', 'subtitle', 'subtitle', { 'font-weight': '600' }],
    ['.tLead', 'lead', 'lead', {}],
    ['.tSmall', 'small', 'small', {}],
    ['.tCaption', 'caption', 'caption', {}],
  ]
  it.each(TYPE)('AC-212.2: 글자 단계 %s는 %s → %s(768) 토큰 크기·줄 높이다', (selector, phone, pc, fixed) => {
    expectAt(selector, 0, { 'font-size': `var(--fs-${phone})`, 'line-height': `var(--lh-${phone})`, ...fixed })
    for (const bp of [768, 1024] as Bp[]) {
      expectAt(selector, bp, { 'font-size': `var(--fs-${pc})`, 'line-height': `var(--lh-${pc})`, ...fixed })
    }
  })

  // [랜딩 크기 클래스, 같은 크기의 ds 단추]
  const SIZES: Array<[string, keyof typeof ds.button]> = [
    ['.btnSm', 'primarySmall'],
    ['.btnMd', 'primary'],
    ['.btnLg', 'primaryLarge'],
  ]
  it.each(SIZES)('AC-212.2: 단추 .btn + %s의 높이·좌우 여백·글자·굵기는 ds.button.%s와 같다(768px 이상)', (size, key) => {
    const want = only(dsValues(ds.button[key]), SIZE_KEYS)
    expect(Object.keys(want).sort(), `ds.button.${key}에서 읽은 크기 값`).toEqual([...SIZE_KEYS].sort())
    for (const bp of [768, 1024] as Bp[]) expect(landingValues(base(), ['.btn', size], SIZE_KEYS, bp), `@${bp}`).toEqual(want)
  })

  const TONES: Array<[string, keyof typeof ds.button]> = [
    ['.btnPrimary', 'primary'],
    ['.btnSecondary', 'secondary'],
  ]
  it.each(TONES)('AC-212.2: 단추 .btn + %s의 바탕·글자·테두리 색과 올림 바탕은 ds.button.%s와 같다', (tone, key) => {
    const keys = [...TONE_KEYS, 'hover:background']
    const want = only(dsValues(ds.button[key]), keys)
    expect(Object.keys(want).sort(), `ds.button.${key}에서 읽은 색 값`).toEqual([...keys].sort())
    for (const bp of [0, 768, 1024] as Bp[]) expect(landingValues(base(), ['.btn', tone], keys, bp), `@${bp}`).toEqual(want)
  })

  it('AC-212.2: .btn은 ds 단추처럼 사이 8px·4px 모서리(var(--r-control))·1px 테두리·줄바꿈 없음·가운데 정렬이다', () => {
    const want = only(dsValues(ds.button.primary), ['gap', 'border-radius', 'border-width'])
    expect(want).toEqual({ gap: '8px', 'border-radius': 'var(--r-control)', 'border-width': '1px' })
    for (const bp of [0, 768, 1024] as Bp[]) {
      expect(landingValues(base(), ['.btn'], Object.keys(want), bp), `@${bp}`).toEqual(want)
    }
    expectAt('.btn', 0, { display: 'inline-flex', 'align-items': 'center', 'justify-content': 'center', 'white-space': 'nowrap' })
  })

  const CHIPS: Array<[string, keyof typeof ds.chip]> = [
    ['.chipNeutral', 'neutral'],
    ['.chipPositive', 'positive'],
    ['.chipWarning', 'warning'],
  ]
  it.each(CHIPS)('AC-212.2: 칩 .chip + %s는 ds.chip.%s와 높이·여백·사이·글자·굵기·모서리·테두리·색이 같다', (tone, key) => {
    const want = dsValues(ds.chip[key])
    const keys = ['height', 'padding-inline', 'gap', 'font-size', 'line-height', 'font-weight', 'border-radius', 'border-width', ...TONE_KEYS]
    expect(Object.keys(want).sort(), `ds.chip.${key}에서 읽은 값`).toEqual([...keys].sort())
    for (const bp of [0, 768, 1024] as Bp[]) expect(landingValues(base(), ['.chip', tone], keys, bp), `@${bp}`).toEqual(want)
  })

  it('AC-212.2: 숨김 도우미 — .pcOnly는 768px 미만에서만, .phoneOnly는 768px 이상에서만 display: none !important, .srOnly는 1px 화면 읽기 전용이다', () => {
    const sheet = base()
    const hides = (selector: string) =>
      sheet.rules
        .filter((r) => r.selectors.includes(selector))
        .flatMap((r) => r.decls.filter((d) => d.prop === 'display').map((d) => ({ at: r.at.join(' '), value: d.value, important: d.important })))
    expect(hides('.pcOnly')).toEqual([{ at: MAX_PHONE, value: 'none', important: true }])
    expect(hides('.phoneOnly')).toEqual([{ at: MIN_768, value: 'none', important: true }])
    expectAt('.srOnly', 0, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', 'white-space': 'nowrap' })
    const clip = valueOf(sheet, '.srOnly', 'clip-path', 0) ?? valueOf(sheet, '.srOnly', 'clip', 0)
    expect(clip, '.srOnly clip-path(또는 clip)').toMatch(/^(inset\(50%\)|rect\(0,? 0,? 0,? 0\))$/)
  })
})

// ---------- AC-207.2: SiteHeader.module.css 값 ----------

const header = () => parseCss(readLanding('SiteHeader.module.css'))
// 휴대폰에서 [구글로 시작하기](.btn·.btnMd·.btnPrimary·.start)를 32px로 줄이는 규칙. 클래스 둘이라 base의 클래스 하나짜리
// .btnMd를 CSS 파일 순서와 상관없이 이긴다
const START_SIZE = '.inner .start'
const px = (value: string | undefined) => Number(/^(-?\d+)px$/.exec(value ?? '')?.[1] ?? NaN)
const BPS: Bp[] = [0, 768, 1024]

describe('AC-207.2: SiteHeader.module.css — 위쪽 메뉴는 모든 폭에서 한 줄이다', () => {
  it('AC-207.2: 메뉴는 위에 붙어 따라오고(sticky, top 0) surface 바탕·아래 1px line이며 높이는 56px → 64px(768)이다', () => {
    const sheet = header()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.header', 'position', bp), `.header position @${bp}`).toBe('sticky')
      expect(valueOf(sheet, '.header', 'top', bp), `.header top @${bp}`).toBe('0')
      expect(valueOf(sheet, '.header', 'background', bp), `.header background @${bp}`).toBe('var(--surface)')
      expect(valueOf(sheet, '.header', 'border-bottom', bp), `.header border-bottom @${bp}`).toBe('1px solid var(--line)')
    }
    expect(valueOf(sheet, '.header', 'height', 0)).toBe('56px')
    expect(valueOf(sheet, '.header', 'height', 768)).toBe('64px')
    expect(valueOf(sheet, '.header', 'height', 1024)).toBe('64px')
  })

  it('AC-207.2: 한 줄 — .inner는 세로 가운데 맞춘 flex 한 줄(메뉴 높이를 채움)이고, 어느 폭에도 줄바꿈·두 줄 칸·옆으로 넘기기가 없다', () => {
    const sheet = header()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.inner', 'display', bp), `.inner display @${bp}`).toBe('flex')
      expect(valueOf(sheet, '.inner', 'align-items', bp), `.inner align-items @${bp}`).toBe('center')
      expect(valueOf(sheet, '.inner', 'height', bp), `.inner height @${bp}`).toBe('100%')
    }
    const multiLine = sheet.rules.flatMap((r) =>
      r.decls
        .filter(
          (d) =>
            (d.prop === 'flex-wrap' && d.value !== 'nowrap') ||
            (d.prop === 'flex-flow' && /\bwrap\b/.test(d.value)) ||
            /^grid-template(?:-areas|-rows)?$/.test(d.prop) ||
            /^overflow(?:-x)?$/.test(d.prop),
        )
        .map((d) => `${r.selectors.join(', ')} { ${d.prop}: ${d.value} }`),
    )
    expect(multiLine).toEqual([])
  })

  it('AC-207.2: nav는 768px 미만에서 숨고(display: none), 이상에서 보이며 링크 사이 24px, 링크는 body 500 ink-2·줄바꿈 없음이다', () => {
    const sheet = header()
    expect(valueOf(sheet, '.nav', 'display', 0)).toBe('none')
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.nav', 'display', bp), `.nav display @${bp}`).toBe('flex')
      expect(valueOf(sheet, '.nav', 'gap', bp) ?? valueOf(sheet, '.nav', 'column-gap', bp), `.nav gap @${bp}`).toBe('24px')
      for (const [prop, value] of Object.entries({
        'font-size': 'var(--fs-body)',
        'line-height': 'var(--lh-body)',
        'font-weight': '500',
        color: 'var(--ink-2)',
        'white-space': 'nowrap',
      })) {
        expect(valueOf(sheet, '.navLink', prop, bp), `.navLink ${prop} @${bp}`).toBe(value)
      }
    }
  })

  it('AC-207.2: [구글로 시작하기](.btn·.btnMd·.btnPrimary)는 768px 미만 32px(.btnSm 크기) → 이상 36px(.btnMd 크기)이고, 크기는 .inner .start(클래스 둘)가 정해 CSS 파일 순서에 기대지 않는다', () => {
    const sheet = base()
    const hd = header()
    // 그 폭에서 이기는 값: .inner .start가 정한 값, 없으면 base .btn + .btnMd
    const effective = (bp: Bp) => ({
      ...landingValues(sheet, ['.btn', '.btnMd'], SIZE_KEYS, bp),
      ...Object.fromEntries(
        SIZE_KEYS.map((k) => [k, valueOf(hd, START_SIZE, k, bp)] as const).filter(([, v]) => v !== undefined),
      ),
    })
    expect(effective(0), '@0').toEqual(landingValues(sheet, ['.btn', '.btnSm'], SIZE_KEYS, 0))
    expect(effective(0).height).toBe('32px')
    for (const bp of [768, 1024] as Bp[]) {
      expect(effective(bp), `@${bp}`).toEqual(landingValues(sheet, ['.btn', '.btnMd'], SIZE_KEYS, bp))
      expect(effective(bp).height, `@${bp}`).toBe('36px')
    }
    // .inner .start는 크기만 정한다(색·모양은 base .btnPrimary·.btn 그대로)
    const sizeRules = hd.rules.filter((r) => r.selectors.includes(START_SIZE))
    expect(sizeRules.length, `${START_SIZE} 규칙`).toBeGreaterThan(0)
    expect(sizeRules.flatMap((r) => r.decls.map((d) => d.prop)).filter((p) => !SIZE_KEYS.includes(p))).toEqual([])
    // 클래스 하나짜리 .start(base와 같은 구체성)는 base 단추가 정한 속성을 다시 정하지 않는다 → 파일 순서가 바뀌어도 값이 같다
    const baseProps = new Set(
      sheet.rules
        .filter((r) => r.selectors.some((s) => ['.btn', '.btnMd', '.btnPrimary', '.btnPrimary:hover'].includes(s)))
        .flatMap((r) => r.decls.map((d) => d.prop)),
    )
    const overlap = hd.rules
      .filter((r) => r.selectors.includes('.start'))
      .flatMap((r) => r.decls.map((d) => d.prop))
      .filter((p) => baseProps.has(p))
    expect(overlap).toEqual([])
  })

  it('AC-207.2: 휴대폰 [구글로 시작하기]의 누름 영역(.start::after)은 44px 이상이다', () => {
    const sheet = header()
    expect(valueOf(sheet, '.start', 'position', 0)).toBe('relative')
    expect(valueOf(sheet, '.start::after', 'content', 0)).toBe('""')
    expect(valueOf(sheet, '.start::after', 'position', 0)).toBe('absolute')
    const inset = words(valueOf(sheet, '.start::after', 'inset', 0) ?? '')
    expect(inset.length, '.start::after inset').toBeGreaterThan(0)
    // inset은 테두리 안쪽(padding box)에서 잰다: 단추 높이 - 위아래 테두리 1px×2 + 위아래 늘린 만큼
    const height = px(valueOf(sheet, START_SIZE, 'height', 0))
    const border = px(landingValues(base(), ['.btn'], ['border-width'], 0)['border-width'])
    const hit = height - 2 * border - 2 * px(inset[0])
    expect(hit, `누름 영역 높이(단추 ${height}px, inset ${inset.join(' ')})`).toBeGreaterThanOrEqual(44)
  })

  it('AC-207.2: 로고 링크의 누름 영역은 높이·너비 모두 44px 이상이고(LogoMark 24 + 좌우 여백), 로고 그림은 본문 왼쪽 끝에 맞는다', () => {
    const sheet = header()
    for (const bp of BPS) {
      expect(px(valueOf(sheet, '.logo', 'height', bp)), `.logo height @${bp}`).toBeGreaterThanOrEqual(44)
      const pad = words(valueOf(sheet, '.logo', 'padding-inline', bp) ?? '0px').map(px)
      const [start, end = start] = pad
      expect(24 + start + end, `.logo 너비 @${bp}`).toBeGreaterThanOrEqual(44)
      expect(valueOf(sheet, '.logo', 'margin-inline-start', bp), `.logo margin-inline-start @${bp}`).toBe(`-${start}px`)
    }
  })

  it('AC-207.2: 로고 링크의 초점 고리는 안쪽(outline-offset: -2px)이다', () => {
    const sheet = header()
    const focus = sheet.rules.filter((r) => r.at.length === 0 && r.selectors.some((s) => /(?:^|\s)\.logo:focus-visible$/.test(s)))
    expect(focus.length, '.logo:focus-visible 규칙').toBeGreaterThan(0)
    expect(focus.flatMap((r) => r.decls).filter((d) => d.prop === 'outline-offset').map((d) => d.value)).toEqual(['-2px'])
  })

  it('AC-207.2: 섹션(.sec)의 scroll-margin-top은 72px → 80px(768)라 메뉴 링크로 옮겨도 제목이 메뉴(56 → 64px)에 가리지 않는다', () => {
    expectAt('.sec', 0, { 'scroll-margin-top': '72px' })
    expectAt('.sec', 768, { 'scroll-margin-top': '80px' })
    expectAt('.sec', 1024, { 'scroll-margin-top': '80px' })
    const sheet = header()
    for (const bp of BPS) {
      const gap = px(valueOf(base(), '.sec', 'scroll-margin-top', bp)) - px(valueOf(sheet, '.header', 'height', bp))
      expect(gap, `@${bp} 섹션 위 여유`).toBeGreaterThanOrEqual(16)
    }
  })
})
