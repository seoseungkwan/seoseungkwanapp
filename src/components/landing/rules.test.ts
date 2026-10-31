import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ds } from '@/components/ui/classes'

// 랜딩 CSS 규칙 시험 (specs/b2b-redesign REQ-212 AC-212.1·AC-212.2, design.md '시험 방식', docs/UI_GUIDE.md '랜딩 짜임').
// landing-v2의 CSS 값 하나하나 시험(styles.test.ts)을 대신한다. 값을 박지 않고 규칙(토큰만·간격 단계·글자 단계·모서리·굵기·
// 금지 장식·화면 폭)을 본다. 픽셀 모양은 Phase 끝 화면 사진이 본다.
const ROOT = process.cwd()
const DIR = join(ROOT, 'src/components/landing')

// AC-212.1 검사 목록: 랜딩 폴더의 *.module.css 전체(목록 없이 폴더를 읽는다). TASK-14에서 고친 파일 목록 대신 폴더 읽기로 바꿨다
const CHECKED = readdirSync(DIR)
  .filter((name) => name.endsWith('.module.css'))
  .sort()

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
// 옛 이름 별칭: TASK-23이 globals.css :root에서 지운 옛 랜딩 변수(b2b-redesign AC-221.1). 모듈이 쓰면 '옛 별칭'으로 잡는다
const ALIASES = new Set(['ok', 'ok-soft', 'danger', 'danger-soft', 'accent-tint', 'field', 'content-max', 'font-sans'])

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
  it('AC-212.1: 검사 목록은 랜딩 폴더의 *.module.css 전체이고(빼 두는 파일 없음), 파일마다 실제 규칙이 있다(빈 검사가 아니다)', () => {
    expect(CHECKED).toEqual(
      expect.arrayContaining([
        'base.module.css',
        'SiteHeader.module.css',
        'SiteFooter.module.css',
        'Hero.module.css',
        'AiSection.module.css',
        'OrthoSection.module.css',
        'FeaturesSection.module.css',
        'PrivacySection.module.css',
        'HowSection.module.css',
      ]),
    )
    expect(readdirSync(DIR).filter((name) => name.endsWith('.css') && !CHECKED.includes(name)), '검사 밖 CSS 파일').toEqual([])
    for (const name of CHECKED) {
      expect(existsSync(join(DIR, name)), name).toBe(true)
      expect(parseCss(readLanding(name)).rules.length, name).toBeGreaterThan(0)
    }
    // 토큰을 globals.css에서 실제로 읽었다
    expect([...COLOR_TOKENS]).toEqual(
      expect.arrayContaining(['canvas', 'surface', 'line', 'ink', 'ink-2', 'accent', 'positive-soft', 'warning', 'chart-3', 'cat-5']),
    )
    expect(COLOR_TOKENS.has('fs-body') || COLOR_TOKENS.has('ok'), '색 토큰에 글자·별칭 변수가 섞이지 않는다').toBe(false)
    // 옛 별칭은 globals.css :root에 더는 없다(TASK-23에서 지움)
    expect([...ALIASES].filter((name) => rootVars.has(name)), ':root에 남은 옛 별칭').toEqual([])
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
    ['.tSmall', 'small', 'small', {}],
    ['.tCaption', 'caption', 'caption', {}],
  ]
  // .tLead는 랜딩이 쓰지 않아 TASK-14에서 지웠다(AC-212.4: 정의한 클래스는 모두 쓴다). 쓰게 되면 표에 lead → lead로 되돌린다
  it('AC-212.2: base.module.css의 글자 단계 클래스(.t로 시작)는 이 표의 것뿐이다(옛 이름 .tH2·.tH3·.tH3l·.tBody·.tLabel 없음)', () => {
    const typeClasses = [...new Set(base().rules.flatMap((r) => r.selectors.flatMap((s) => [...s.matchAll(/\.(t[A-Z]\w*)/g)].map((m) => `.${m[1]}`))))]
    expect(typeClasses.sort()).toEqual(TYPE.map(([selector]) => selector).sort())
  })

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

// ---------- AC-212.4(CSS 부분): base.module.css에 정의한 클래스는 모두 랜딩 TSX에서 쓴다 ----------

// 랜딩 TSX(시험 제외): 랜딩 폴더의 *.tsx와 랜딩 페이지 src/app/page.tsx(.root 감싸개). 주석과 import 줄은 빼고 읽는다
const LANDING_TSX = [
  ...readdirSync(DIR)
    .filter((name) => name.endsWith('.tsx') && !/\.test\.tsx$/.test(name))
    .map((name) => join(DIR, name)),
  join(ROOT, 'src/app/page.tsx'),
].map((path) => ({ name: relative(ROOT, path), body: readFileSync(path, 'utf8') }))
const codeOf = (tsx: string) =>
  tsx
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')
    .replace(/^import\b[^\n]*$/gm, '')
const usedBase = () => new Set(LANDING_TSX.flatMap((f) => [...codeOf(f.body).matchAll(/\bbase\.([a-zA-Z]\w*)/g)].map((m) => m[1])))
// base.module.css 선택자에 나오는 클래스 이름 전부
const definedBase = () => [
  ...new Set(base().rules.flatMap((r) => r.selectors.flatMap((s) => [...s.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])))),
]
// 쓰는 곳이 없어도 남기는 클래스(requirements AC-212.4 예외 하나): 32px 단추 크기의 기준값. AC-212.2가 ds.button.primarySmall과,
// AC-207.2가 메뉴 단추의 휴대폰 크기(.inner .start)와 견준다
const UNUSED_OK = ['btnSm']

describe('AC-212.4: base.module.css에 정의한 클래스는 모두 랜딩 TSX 어딘가에서 쓴다(예외 .btnSm 하나)', () => {
  it('AC-212.4: base.module.css를 부르는 랜딩 TSX는 모두 base라는 이름으로 부른다(쓰임 찾기가 헛돌지 않는다)', () => {
    const importers = LANDING_TSX.filter((f) => /base\.module\.css['"]/.test(f.body))
    expect(importers.map((f) => f.name)).toEqual(expect.arrayContaining(['src/app/page.tsx', 'src/components/landing/HowSection.tsx']))
    expect(importers.length).toBeGreaterThan(8)
    for (const f of importers) {
      expect(f.body, f.name).toMatch(/^import base from '(?:\.\/|@\/components\/landing\/)base\.module\.css'$/m)
    }
    expect(usedBase().has('root'), 'page.tsx의 base.root').toBe(true)
  })

  it('AC-212.4: 정의한 클래스 가운데 랜딩 TSX가 쓰지 않는 것은 .btnSm(예외)뿐이다 — 옛 이름(.card·.group·.grid3·.grid4·.items·.itemsFour·.item·.chipOk·.chipAttn·.chipWait·.chipSample·.nowrap·.stack·.head·.tH2·.tH3·.tLead·.tBody …)이 지워졌다', () => {
    const used = usedBase()
    const defined = definedBase()
    expect(defined.length, '정의한 클래스를 실제로 읽었다').toBeGreaterThan(20)
    expect(defined.filter((name) => !used.has(name)).sort()).toEqual(UNUSED_OK)
  })

  it('AC-212.4: 랜딩 TSX가 쓰는 base 클래스는 모두 base.module.css에 정의돼 있다', () => {
    const defined = new Set(definedBase())
    expect([...usedBase()].filter((name) => !defined.has(name)).sort()).toEqual([])
  })

  it('AC-212.4: 쓰임 찾기는 주석·import 줄을 빼고 base.이름만 센다', () => {
    const sample = [
      "import base from './base.module.css'",
      '// base.card는 옛 이름이다',
      '/* base.group */',
      'const a = <div className={`${base.wrap} ${base.grid}`}>{x}</div> // base.stack',
    ].join('\n')
    expect([...codeOf(sample).matchAll(/\bbase\.([a-zA-Z]\w*)/g)].map((m) => m[1])).toEqual(['wrap', 'grid'])
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

// ---------- AC-208.1(CSS 부분)·AC-208.2: Hero.module.css 값 ----------

const heroSheet = () => parseCss(readLanding('Hero.module.css'))
// Hero.module.css에서 그 속성을 정한 선택자들
const heroSelectorsWith = (props: RegExp) =>
  [...new Set(heroSheet().rules.filter((r) => r.decls.some((d) => props.test(d.prop))).flatMap((r) => r.selectors))].sort()

describe('AC-208.1: Hero.module.css — 글 덩어리·단추·약속·휴대폰 한 줄의 글자와 선', () => {
  it('AC-208.1: 소개 줄(.tSmall + .kicker)은 small 600 ink-2, 제목(.tDisplay)은 text-wrap: balance, 안내(.lead)는 ink-2이고 body → lead(768)다', () => {
    const sheet = heroSheet()
    expectAt('.tSmall', 0, { 'font-size': 'var(--fs-small)', 'line-height': 'var(--lh-small)' })
    expectAt('.tDisplay', 0, { 'text-wrap': 'balance' })
    for (const bp of BPS) {
      expect(valueOf(sheet, '.kicker', 'font-weight', bp), `.kicker font-weight @${bp}`).toBe('600')
      expect(valueOf(sheet, '.kicker', 'color', bp), `.kicker color @${bp}`).toBe('var(--ink-2)')
      expect(valueOf(sheet, '.lead', 'color', bp), `.lead color @${bp}`).toBe('var(--ink-2)')
    }
    expect(valueOf(sheet, '.lead', 'font-size', 0)).toBe('var(--fs-body)')
    expect(valueOf(sheet, '.lead', 'line-height', 0)).toBe('var(--lh-body)')
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.lead', 'font-size', bp), `.lead font-size @${bp}`).toBe('var(--fs-lead)')
      expect(valueOf(sheet, '.lead', 'line-height', bp), `.lead line-height @${bp}`).toBe('var(--lh-lead)')
    }
  })

  it('AC-208.1: [구글로 시작하기](.start)는 768px 미만 전체 폭 → 이상 내용 폭이고, 크기·색은 base .btnLg(44px)·.btnPrimary 그대로다', () => {
    const sheet = heroSheet()
    expect(valueOf(sheet, '.start', 'width', 0)).toBe('100%')
    for (const bp of [768, 1024] as Bp[]) expect(valueOf(sheet, '.start', 'width', bp), `.start width @${bp}`).toBe('auto')
    // .start는 폭만 정한다 → base 단추와 겹치는 속성이 없어 CSS 파일 순서에 기대지 않는다
    const props = sheet.rules.filter((r) => r.selectors.includes('.start')).flatMap((r) => r.decls.map((d) => d.prop))
    expect([...new Set(props)]).toEqual(['width'])
    for (const bp of BPS) expect(landingValues(base(), ['.btn', '.btnLg'], ['height'], bp).height, `.btnLg @${bp}`).toBe('44px')
  })

  it('AC-208.1: 약속 — ul(.promises) 위 1px line, li(.promise)마다 아래 1px line으로 나뉘고 ink-2 글자, 아이콘(.icon)은 muted, "0건"(.zero)은 600 ink다', () => {
    const sheet = heroSheet()
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.promises', 'border-top', bp), `.promises border-top @${bp}`).toBe('1px solid var(--line)')
      expect(valueOf(sheet, '.promise', 'border-bottom', bp), `.promise border-bottom @${bp}`).toBe('1px solid var(--line)')
      expect(valueOf(sheet, '.promise', 'display', bp), `.promise display @${bp}`).toBe('flex')
      expect(valueOf(sheet, '.promise', 'align-items', bp), `.promise align-items @${bp}`).toBe('center')
      expect(valueOf(sheet, '.promise', 'color', bp), `.promise color @${bp}`).toBe('var(--ink-2)')
      expect(valueOf(sheet, '.icon', 'color', bp), `.icon color @${bp}`).toBe('var(--muted)')
      expect(valueOf(sheet, '.zero', 'font-weight', bp), `.zero font-weight @${bp}`).toBe('600')
      expect(valueOf(sheet, '.zero', 'color', bp), `.zero color @${bp}`).toBe('var(--ink)')
    }
  })

  it('AC-208.1: 휴대폰 한 줄(.phoneLine)은 muted 글자이고 방패와 글이 가로 한 줄(세로 가운데, 사이 8px)이다', () => {
    const sheet = heroSheet()
    expect(valueOf(sheet, '.phoneLine', 'color', 0)).toBe('var(--muted)')
    expect(valueOf(sheet, '.phoneLine', 'display', 0)).toBe('flex')
    expect(valueOf(sheet, '.phoneLine', 'align-items', 0)).toBe('center')
    expect(valueOf(sheet, '.phoneLine', 'gap', 0)).toBe('8px')
  })
})

describe('AC-208.2: Hero.module.css — 칸·여백·제목 단계·장식 없음', () => {
  it('AC-208.2: 1024px 이상 12칸(base .grid)에서 글 1~5칸(.text) · 미리보기 6~12칸(.shot)이고 세로 가운데 맞춤이다', () => {
    const sheet = heroSheet()
    expectAt('.grid', 1024, { 'grid-template-columns': 'repeat(12, minmax(0, 1fr))', 'column-gap': '24px' })
    expect(valueOf(sheet, '.text', 'grid-column', 1024)).toBe('1 / 6')
    expect(valueOf(sheet, '.shot', 'grid-column', 1024)).toBe('6 / 13')
    expect(valueOf(sheet, '.layout', 'align-items', 1024)).toBe('center')
    for (const name of ['.text', '.shot']) expect(valueOf(sheet, name, 'min-width', 1024), `${name} min-width`).toBe('0')
  })

  it('AC-208.2: 1024px 미만은 위아래로 쌓인다(글 → 미리보기) — 칸 지정이 없고, 어느 폭에도 순서 바꾸기가 없으며 둘 사이가 띄워진다', () => {
    const sheet = heroSheet()
    for (const bp of [0, 768] as Bp[]) {
      for (const name of ['.text', '.shot']) expect(valueOf(sheet, name, 'grid-column', bp), `${name} grid-column @${bp}`).toBeUndefined()
      expect(px(valueOf(sheet, '.layout', 'row-gap', bp)), `.layout row-gap @${bp}`).toBeGreaterThan(0)
    }
    expect(heroSelectorsWith(/^(?:order|grid-row(?:-[\w-]+)?|grid-area|grid-template(?:-areas|-rows)?|flex-direction)$/)).toEqual(['.text'])
    expect(valueOf(sheet, '.text', 'flex-direction', 0), '글 덩어리 안은 위에서 아래로').toBe('column')
  })

  it('AC-208.2: 위아래 여백 32/48 → 48/64(768) → 64/96(1024)이고, 로고 링크(#top)로 옮겨도 메뉴에 가리지 않게 scroll-margin-top은 .sec와 같다', () => {
    const sheet = heroSheet()
    expect(valueOf(sheet, '.hero', 'padding-block', 0)).toBe('32px 48px')
    expect(valueOf(sheet, '.hero', 'padding-block', 768)).toBe('48px 64px')
    expect(valueOf(sheet, '.hero', 'padding-block', 1024)).toBe('64px 96px')
    for (const bp of BPS) {
      expect(valueOf(sheet, '.hero', 'scroll-margin-top', bp), `.hero scroll-margin-top @${bp}`).toBe(valueOf(base(), '.sec', 'scroll-margin-top', bp))
    }
  })

  it('AC-208.2: 제목은 display-m(768px 미만) → display(base .tDisplay)이고, Hero.module.css는 글자 크기를 안내(.lead) 말고 정하지 않는다', () => {
    expectAt('.tDisplay', 0, { 'font-size': 'var(--fs-display-m)', 'line-height': 'var(--lh-display-m)' })
    expectAt('.tDisplay', 768, { 'font-size': 'var(--fs-display)', 'line-height': 'var(--lh-display)' })
    expect(heroSelectorsWith(/^(?:font-size|line-height|letter-spacing|font)$/)).toEqual(['.lead'])
  })

  it('AC-208.2: 장식(격자·원형 빛·반짝이)이 없다 — 바탕·그림·::before/::after·겹쳐 놓기·투명도·mask가 없다', () => {
    const sheet = heroSheet()
    expect(sheet.rules.length).toBeGreaterThan(0)
    const deco = sheet.rules.flatMap((r) => [
      ...r.selectors.filter((sel) => /::?(?:before|after)\b/.test(sel)).map((sel) => `${sel} (꾸밈 조각)`),
      ...r.decls
        .filter(
          (d) =>
            /^(?:background(?:-[\w-]+)?|mask(?:-[\w-]+)?|opacity|content|clip-path|transform)$/.test(d.prop) ||
            (d.prop === 'position' && /^(?:absolute|fixed)$/.test(d.value)),
        )
        .map((d) => `${r.selectors.join(', ')} { ${d.prop}: ${d.value} }`),
    ])
    expect(deco).toEqual([])
  })
})

// ---------- AC-209.1(CSS 부분): AiSection.module.css 값 ----------

const aiSheet = () => parseCss(readLanding('AiSection.module.css'))
const LINE = '1px solid var(--line)'

describe('AC-209.1: AiSection.module.css — 칸·약속·리포트 패널·채팅 칸', () => {
  it('AC-209.1: 1024px 이상 12칸(base .grid)에서 글(.text) 1~4칸 · 리포트(.report) 5~12칸이고, 미만은 칸 지정 없이 쌓이며(순서 바꾸기 없음) 사이가 띄워진다', () => {
    const sheet = aiSheet()
    expectAt('.grid', 1024, { 'grid-template-columns': 'repeat(12, minmax(0, 1fr))', 'column-gap': '24px' })
    expect(valueOf(sheet, '.text', 'grid-column', 1024)).toBe('1 / 5')
    expect(valueOf(sheet, '.report', 'grid-column', 1024)).toBe('5 / 13')
    for (const name of ['.text', '.report']) expect(valueOf(sheet, name, 'min-width', 1024), `${name} min-width`).toBe('0')
    for (const bp of [0, 768] as Bp[]) {
      for (const name of ['.text', '.report']) expect(valueOf(sheet, name, 'grid-column', bp), `${name} grid-column @${bp}`).toBeUndefined()
      expect(px(valueOf(sheet, '.layout', 'row-gap', bp)), `.layout row-gap @${bp}`).toBeGreaterThan(0)
    }
    const reorder = sheet.rules.flatMap((r) => r.decls.filter((d) => /^(?:order|grid-row(?:-[\w-]+)?|grid-area)$/.test(d.prop)))
    expect(reorder).toEqual([])
  })

  it('AC-209.1: 제목은 base .tHeading(heading-m → heading(768))이고, 안내(.lead)는 ink-2·위 12px다', () => {
    const sheet = aiSheet()
    expectAt('.tHeading', 0, { 'font-size': 'var(--fs-heading-m)', 'line-height': 'var(--lh-heading-m)' })
    expectAt('.tHeading', 768, { 'font-size': 'var(--fs-heading)', 'line-height': 'var(--lh-heading)' })
    for (const bp of BPS) {
      expect(valueOf(sheet, '.lead', 'color', bp), `.lead color @${bp}`).toBe('var(--ink-2)')
      expect(valueOf(sheet, '.lead', 'margin-top', bp), `.lead margin-top @${bp}`).toBe('12px')
    }
  })

  it('AC-209.1: 약속(768px 이상) — .points 위 1px line · .point마다 아래 1px line(위아래 12px), dt(.pointTitle) 600 · dd(.pointDesc) small muted', () => {
    const sheet = aiSheet()
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.points', 'display', bp), `.points display @${bp}`).toBe('block')
      expect(valueOf(sheet, '.points', 'border-top', bp), `.points border-top @${bp}`).toBe(LINE)
      expect(valueOf(sheet, '.point', 'border-bottom', bp), `.point border-bottom @${bp}`).toBe(LINE)
      expect(valueOf(sheet, '.point', 'padding-block', bp), `.point padding-block @${bp}`).toBe('12px')
      expect(valueOf(sheet, '.pointTitle', 'font-weight', bp), `.pointTitle font-weight @${bp}`).toBe('600')
      expect(valueOf(sheet, '.pointTitle', 'color', bp), `.pointTitle color @${bp}`).toBe('var(--ink)')
      expect(valueOf(sheet, '.pointDesc', 'display', bp), `.pointDesc display @${bp}`).toBe('block')
      expect(valueOf(sheet, '.pointDesc', 'font-size', bp), `.pointDesc font-size @${bp}`).toBe('var(--fs-small)')
      expect(valueOf(sheet, '.pointDesc', 'line-height', bp), `.pointDesc line-height @${bp}`).toBe('var(--lh-small)')
      expect(valueOf(sheet, '.pointDesc', 'color', bp), `.pointDesc color @${bp}`).toBe('var(--muted)')
      expect(valueOf(sheet, '.point::before', 'display', bp), `.point::before display @${bp}`).toBe('none')
    }
    expect(valueOf(sheet, '.points', 'margin-top', 1024)).toBe('32px')
  })

  it('AC-209.1: 약속(768px 미만) — dd가 숨고(display: none) dt가 2칸(repeat(2, minmax(0, 1fr)))으로 놓이며, 줄마다 앞에 4×4 accent 점(::before)이 있고 줄 선이 없다', () => {
    const sheet = aiSheet()
    expect(valueOf(sheet, '.pointDesc', 'display', 0)).toBe('none')
    expect(valueOf(sheet, '.points', 'display', 0)).toBe('grid')
    expect(valueOf(sheet, '.points', 'grid-template-columns', 0)).toBe('repeat(2, minmax(0, 1fr))')
    expect(valueOf(sheet, '.points', 'border-top', 0) ?? '0').toBe('0')
    expect(valueOf(sheet, '.point', 'border-bottom', 0) ?? '0').toBe('0')
    expect(valueOf(sheet, '.point', 'position', 0)).toBe('relative')
    expect(px(valueOf(sheet, '.point', 'padding-left', 0)), '점 자리').toBeGreaterThanOrEqual(8)
    for (const [prop, value] of Object.entries({
      content: '""',
      position: 'absolute',
      width: '4px',
      height: '4px',
      background: 'var(--accent)',
    })) {
      expect(valueOf(sheet, '.point::before', prop, 0), `.point::before ${prop}`).toBe(value)
    }
  })

  it('AC-209.1: 리포트 패널(.report)은 surface 바탕·1px line 테두리·4px(var(--r-control)) 모서리 하나이고, 머리(.reportHead)는 h3와 칩을 양 끝에 둔 한 줄이다', () => {
    const sheet = aiSheet()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.report', 'background', bp), `.report background @${bp}`).toBe('var(--surface)')
      expect(valueOf(sheet, '.report', 'border', bp), `.report border @${bp}`).toBe(LINE)
      expect(valueOf(sheet, '.report', 'border-radius', bp), `.report border-radius @${bp}`).toBe('var(--r-control)')
      expect(valueOf(sheet, '.reportHead', 'display', bp), `.reportHead display @${bp}`).toBe('flex')
      expect(valueOf(sheet, '.reportHead', 'align-items', bp), `.reportHead align-items @${bp}`).toBe('center')
      expect(valueOf(sheet, '.reportHead', 'justify-content', bp), `.reportHead justify-content @${bp}`).toBe('space-between')
    }
  })

  it('AC-209.1: 몸(.reportBody, 위 1px line)은 1024px 이상 minmax(0, 1fr) 300px 두 칸이고 채팅 칸(.chat)은 왼쪽 1px line, 미만은 한 칸이고 채팅 칸은 위 1px line이다', () => {
    const sheet = aiSheet()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.reportBody', 'display', bp), `.reportBody display @${bp}`).toBe('grid')
      expect(valueOf(sheet, '.reportBody', 'border-top', bp), `.reportBody border-top @${bp}`).toBe(LINE)
    }
    expect(valueOf(sheet, '.reportBody', 'grid-template-columns', 1024)).toBe('minmax(0, 1fr) 300px')
    for (const bp of [0, 768] as Bp[]) {
      expect(valueOf(sheet, '.reportBody', 'grid-template-columns', bp), `.reportBody 칸 @${bp}`).toBe('minmax(0, 1fr)')
    }
    expect(valueOf(sheet, '.chat', 'border-top', 768)).toBe(LINE)
    expect(valueOf(sheet, '.chat', 'border-left', 768) ?? '0').toBe('0')
    expect(valueOf(sheet, '.chat', 'border-top', 1024)).toBe('0')
    expect(valueOf(sheet, '.chat', 'border-left', 1024)).toBe(LINE)
  })

  it('AC-209.1: 항목(.item)은 768px 이상 칩 | 글 두 칸(미만은 한 칸), 줄 사이 아래 1px line(마지막 줄 없음)이고, 칩(.tag)은 글자 폭만큼, 근거(.basis)는 muted다', () => {
    const sheet = aiSheet()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.item', 'display', bp), `.item display @${bp}`).toBe('grid')
      expect(valueOf(sheet, '.item', 'border-bottom', bp), `.item border-bottom @${bp}`).toBe(LINE)
      expect(valueOf(sheet, '.item:last-child', 'border-bottom', bp), `.item:last-child @${bp}`).toBe('0')
      expect(valueOf(sheet, '.tag', 'justify-self', bp), `.tag justify-self @${bp}`).toBe('start')
      expect(valueOf(sheet, '.basis', 'color', bp), `.basis color @${bp}`).toBe('var(--muted)')
      expect(valueOf(sheet, '.itemBody', 'min-width', bp), `.itemBody min-width @${bp}`).toBe('0')
    }
    expect(valueOf(sheet, '.item', 'grid-template-columns', 0)).toBe('minmax(0, 1fr)')
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.item', 'grid-template-columns', bp), `.item 칸 @${bp}`).toBe('76px minmax(0, 1fr)')
    }
  })

  it('AC-209.1: 채팅 — 말풍선(.bubble)은 오른쪽·canvas·1px line·4px·small, 답 쓰는 중(.typing)은 muted, 물어보기 칸(.ask)은 40px·1px line-strong 테두리·4px, 보내기(.send)는 32px accent 바탕·surface 글자다', () => {
    const sheet = aiSheet()
    const want: Record<string, Record<string, string>> = {
      '.chat': { display: 'flex', 'flex-direction': 'column' },
      '.bubble': {
        'align-self': 'flex-end',
        background: 'var(--canvas)',
        border: LINE,
        'border-radius': 'var(--r-control)',
        'font-size': 'var(--fs-small)',
        'line-height': 'var(--lh-small)',
      },
      '.typing': { color: 'var(--muted)' },
      '.ask': {
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        height: '40px',
        border: '1px solid var(--line-strong)',
        'border-radius': 'var(--r-control)',
        color: 'var(--muted)',
      },
      '.send': {
        width: '32px',
        height: '32px',
        'border-radius': 'var(--r-control)',
        background: 'var(--accent)',
        color: 'var(--surface)',
      },
    }
    for (const bp of [768, 1024] as Bp[]) {
      for (const [selector, props] of Object.entries(want)) {
        for (const [prop, value] of Object.entries(props)) {
          expect(valueOf(sheet, selector, prop, bp), `${selector} ${prop} @${bp}`).toBe(value)
        }
      }
    }
  })
})

// ---------- AC-209.2(CSS 부분): OrthoSection.module.css 값 ----------

const orthoSheet = () => parseCss(readLanding('OrthoSection.module.css'))

describe('AC-209.2: OrthoSection.module.css — 머리 칸·PC 비교표·휴대폰 표', () => {
  it('AC-209.2: 머리(.head)는 1024px 이상 h2(.title) 1~6칸 · 안내(.lead) 7~11칸, 아래 맞춤(align-items: end)이고 미만은 쌓인다(사이가 띄워짐)', () => {
    const sheet = orthoSheet()
    expect(valueOf(sheet, '.title', 'grid-column', 1024)).toBe('1 / 7')
    expect(valueOf(sheet, '.lead', 'grid-column', 1024)).toBe('7 / 12')
    expect(valueOf(sheet, '.head', 'align-items', 1024)).toBe('end')
    for (const bp of [0, 768] as Bp[]) {
      for (const name of ['.title', '.lead']) expect(valueOf(sheet, name, 'grid-column', bp), `${name} grid-column @${bp}`).toBeUndefined()
      expect(px(valueOf(sheet, '.head', 'row-gap', bp)), `.head row-gap @${bp}`).toBeGreaterThan(0)
    }
    for (const bp of BPS) expect(valueOf(sheet, '.lead', 'color', bp), `.lead color @${bp}`).toBe('var(--ink-2)')
  })

  it('AC-209.2: PC 표(.table)는 폭 100%·칸 붙임(border-collapse: collapse)·위 32px이고, 머리 칸(.colHead)은 subtitle 600, 머리 줄(.colHead·.corner)은 아래 1px ink 선이다', () => {
    const sheet = orthoSheet()
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.table', 'width', bp), `.table width @${bp}`).toBe('100%')
      expect(valueOf(sheet, '.table', 'border-collapse', bp), `.table border-collapse @${bp}`).toBe('collapse')
      expect(valueOf(sheet, '.table', 'margin-top', bp), `.table margin-top @${bp}`).toBe('32px')
      expect(valueOf(sheet, '.colHead', 'font-size', bp), `.colHead font-size @${bp}`).toBe('var(--fs-subtitle)')
      expect(valueOf(sheet, '.colHead', 'line-height', bp), `.colHead line-height @${bp}`).toBe('var(--lh-subtitle)')
      expect(valueOf(sheet, '.colHead', 'font-weight', bp), `.colHead font-weight @${bp}`).toBe('600')
      for (const name of ['.colHead', '.corner']) {
        expect(valueOf(sheet, name, 'border-bottom', bp), `${name} border-bottom @${bp}`).toBe('1px solid var(--ink)')
      }
    }
  })

  it('AC-209.2: 줄 머리(.rowHead)는 small 500 muted·120px이고, 칸(.rowHead·.cell)은 아래 1px line·위 맞춤이며 모듈 어디에도 세로 선·네 변 테두리가 없다', () => {
    const sheet = orthoSheet()
    for (const bp of [768, 1024] as Bp[]) {
      for (const [prop, value] of Object.entries({
        'font-size': 'var(--fs-small)',
        'line-height': 'var(--lh-small)',
        'font-weight': '500',
        color: 'var(--muted)',
        width: '120px',
      })) {
        expect(valueOf(sheet, '.rowHead', prop, bp), `.rowHead ${prop} @${bp}`).toBe(value)
      }
      for (const name of ['.rowHead', '.cell']) {
        expect(valueOf(sheet, name, 'border-bottom', bp), `${name} border-bottom @${bp}`).toBe(LINE)
        expect(valueOf(sheet, name, 'vertical-align', bp), `${name} vertical-align @${bp}`).toBe('top')
        expect(valueOf(sheet, name, 'text-align', bp), `${name} text-align @${bp}`).toBe('left')
      }
    }
    const sides = sheet.rules.flatMap((r) =>
      r.decls
        .filter((d) => /^border(?:-(?:left|right|inline(?:-start|-end)?))?(?:-width|-style|-color)?$/.test(d.prop) && d.value !== '0')
        .map((d) => `${r.selectors.join(', ')} { ${d.prop}: ${d.value} }`),
    )
    expect(sides).toEqual([])
  })

  it('AC-209.2: 값 쌍(.kv)은 이름 | 값 양 끝 한 줄(ink-2)이고 값(.value)은 600 ink, 쌍 사이 4px다', () => {
    const sheet = orthoSheet()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.kv', 'display', bp), `.kv display @${bp}`).toBe('flex')
      expect(valueOf(sheet, '.kv', 'justify-content', bp), `.kv justify-content @${bp}`).toBe('space-between')
      expect(valueOf(sheet, '.kv', 'color', bp), `.kv color @${bp}`).toBe('var(--ink-2)')
      expect(valueOf(sheet, '.value', 'font-weight', bp), `.value font-weight @${bp}`).toBe('600')
      expect(valueOf(sheet, '.value', 'color', bp), `.value color @${bp}`).toBe('var(--ink)')
      expect(valueOf(sheet, '.kv + .kv', 'margin-top', bp), `.kv + .kv margin-top @${bp}`).toBe('4px')
    }
  })

  it('AC-209.2: 휴대폰 표(.mobile) — caption(.caption)은 caption muted 왼쪽 맞춤, 줄 머리(.mRowHead)는 이름 600 ink · 아래 기준(.mBasis, 블록) caption muted, 칸은 아래 1px line, 첫 줄 위 1px ink 선이다', () => {
    const sheet = orthoSheet()
    const want: Record<string, Record<string, string>> = {
      '.mobile': { width: '100%', 'border-collapse': 'collapse' },
      '.caption': { 'font-size': 'var(--fs-caption)', 'line-height': 'var(--lh-caption)', color: 'var(--muted)', 'text-align': 'left' },
      '.mRowHead': { 'font-weight': '600', color: 'var(--ink)', 'text-align': 'left', 'vertical-align': 'top', 'border-bottom': LINE },
      '.mBasis': {
        display: 'block',
        'font-size': 'var(--fs-caption)',
        'line-height': 'var(--lh-caption)',
        'font-weight': '400',
        color: 'var(--muted)',
      },
      '.mCell': { 'border-bottom': LINE, 'vertical-align': 'top' },
      '.mRow:first-child > *': { 'border-top': '1px solid var(--ink)' },
    }
    for (const [selector, props] of Object.entries(want)) {
      for (const [prop, value] of Object.entries(props)) {
        expect(valueOf(sheet, selector, prop, 0), `${selector} ${prop}`).toBe(value)
      }
    }
  })
})

// ---------- AC-210.1(CSS 부분): FeaturesSection.module.css 값 ----------

const featSheet = () => parseCss(readLanding('FeaturesSection.module.css'))
// 세로 선(왼쪽·오른쪽 테두리)을 주는 선언
const sideBorders = (sheet: Sheet) =>
  sheet.rules.flatMap((r) =>
    r.decls
      .filter((d) => /^border(?:-(?:left|right|inline(?:-start|-end)?))?(?:-width|-style|-color)?$/.test(d.prop) && d.value !== '0')
      .map((d) => `${r.selectors.join(', ')} { ${d.prop}: ${d.value} }`),
  )

describe('AC-210.1: FeaturesSection.module.css — 위 선·칸·급여 패널·기능 목록', () => {
  it('AC-210.1: .wrap 위 1px line(.inner::before)은 섹션 위 여백(base .sec padding-block)만큼 위로 올라가 섹션 맨 위에 붙고, 같은 만큼 아래를 띄운다(모든 폭, 선은 내용 폭)', () => {
    const sheet = featSheet()
    for (const bp of BPS) {
      const pad = words(valueOf(base(), '.sec', 'padding-block', bp) ?? '')[0]
      expect(px(pad), `.sec padding-block @${bp}`).toBeGreaterThan(0)
      expect(valueOf(sheet, '.inner::before', 'content', bp), `content @${bp}`).toBe('""')
      expect(valueOf(sheet, '.inner::before', 'display', bp), `display @${bp}`).toBe('block')
      expect(valueOf(sheet, '.inner::before', 'border-top', bp), `border-top @${bp}`).toBe(LINE)
      expect(valueOf(sheet, '.inner::before', 'margin-block', bp), `margin-block @${bp}`).toBe(`-${pad} ${pad}`)
    }
    // 섹션 모듈은 base .sec·.wrap의 속성을 덮어쓰지 않는다(CSS 순서와 상관없이 같은 결과)
    expect(sheet.rules.filter((r) => r.selectors.some((s) => /^\.(?:sec|wrap|grid)$/.test(s)))).toEqual([])
  })

  it('AC-210.1: 제목(.title)은 최대 560px이고, 칸(.layout)은 제목 아래 16px → 32px(768)이며 1024px 이상 급여(.pay) 1~6칸 · 목록(.list) 8~12칸, 미만은 쌓인다(사이가 띄워짐)', () => {
    const sheet = featSheet()
    for (const bp of BPS) expect(valueOf(sheet, '.title', 'max-width', bp), `.title max-width @${bp}`).toBe('560px')
    expect(valueOf(sheet, '.layout', 'margin-top', 0)).toBe('16px')
    for (const bp of [768, 1024] as Bp[]) expect(valueOf(sheet, '.layout', 'margin-top', bp), `.layout margin-top @${bp}`).toBe('32px')
    expect(px(valueOf(sheet, '.layout', 'row-gap', 768)), '.layout row-gap @768').toBeGreaterThan(0)
    expect(valueOf(sheet, '.pay', 'grid-column', 1024)).toBe('1 / 7')
    expect(valueOf(sheet, '.list', 'grid-column', 1024)).toBe('8 / 13')
    for (const name of ['.pay', '.list']) {
      expect(valueOf(sheet, name, 'min-width', 1024), `${name} min-width`).toBe('0')
      for (const bp of [0, 768] as Bp[]) expect(valueOf(sheet, name, 'grid-column', bp), `${name} grid-column @${bp}`).toBeUndefined()
    }
  })

  it('AC-210.1: 급여 덩어리 — 소개(.kicker)는 600 accent, h3(.payTitle)는 위 8px, 설명(.payLead)은 ink-2·위 8px, 패널(.panel)은 위 24px다', () => {
    const sheet = featSheet()
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.kicker', 'font-weight', bp), `.kicker font-weight @${bp}`).toBe('600')
      expect(valueOf(sheet, '.kicker', 'color', bp), `.kicker color @${bp}`).toBe('var(--accent)')
      expect(valueOf(sheet, '.payTitle', 'margin-top', bp), `.payTitle margin-top @${bp}`).toBe('8px')
      expect(valueOf(sheet, '.payLead', 'color', bp), `.payLead color @${bp}`).toBe('var(--ink-2)')
      expect(valueOf(sheet, '.payLead', 'margin-top', bp), `.payLead margin-top @${bp}`).toBe('8px')
      expect(valueOf(sheet, '.panel', 'margin-top', bp), `.panel margin-top @${bp}`).toBe('24px')
    }
  })

  it('AC-210.1: 패널(.panel)은 surface·1px line·4px 상자 하나이고, 머리(.panelHead)는 제목과 칩을 양 끝에 둔 한 줄, "예시"(.sample)는 muted다', () => {
    const sheet = featSheet()
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.panel', 'background', bp), `.panel background @${bp}`).toBe('var(--surface)')
      expect(valueOf(sheet, '.panel', 'border', bp), `.panel border @${bp}`).toBe(LINE)
      expect(valueOf(sheet, '.panel', 'border-radius', bp), `.panel border-radius @${bp}`).toBe('var(--r-control)')
      expect(valueOf(sheet, '.panelHead', 'display', bp), `.panelHead display @${bp}`).toBe('flex')
      expect(valueOf(sheet, '.panelHead', 'align-items', bp), `.panelHead align-items @${bp}`).toBe('center')
      expect(valueOf(sheet, '.panelHead', 'justify-content', bp), `.panelHead justify-content @${bp}`).toBe('space-between')
      expect(valueOf(sheet, '.sample', 'color', bp), `.sample color @${bp}`).toBe('var(--muted)')
    }
  })

  it('AC-210.1: 급여표(.table)는 폭 100%·칸 붙임·small 글자이고, 칸(.head·.cell) 아래 1px line(마지막 줄 없음), 금액(.amount)은 오른쪽 맞춤·고정폭, 바닥 줄(.sum)은 600·위 1px line-strong이며 세로 선이 없다', () => {
    const sheet = featSheet()
    const want: Record<string, Record<string, string>> = {
      '.table': {
        width: '100%',
        'border-collapse': 'collapse',
        'font-size': 'var(--fs-small)',
        'line-height': 'var(--lh-small)',
      },
      '.head': { 'border-bottom': LINE, 'text-align': 'left', 'font-weight': '500', color: 'var(--muted)' },
      '.cell': { 'border-bottom': LINE },
      '.row:last-child .cell': { 'border-bottom': '0' },
      '.amount': { 'text-align': 'right', 'font-variant-numeric': 'tabular-nums' },
      '.sum': { 'font-weight': '600', 'border-top': '1px solid var(--line-strong)' },
    }
    for (const bp of [768, 1024] as Bp[]) {
      for (const [selector, props] of Object.entries(want)) {
        for (const [prop, value] of Object.entries(props)) {
          expect(valueOf(sheet, selector, prop, bp), `${selector} ${prop} @${bp}`).toBe(value)
        }
      }
    }
    expect(sideBorders(sheet).filter((d) => !d.startsWith('.panel {'))).toEqual([])
  })

  it('AC-210.1: 기능 목록 — 줄(.item)은 아래 1px line·첫 줄 위 1px line, 번호(.num) | 글 두 칸(32px → 40px(768))이고 위아래 12px → 20px(768)이다', () => {
    const sheet = featSheet()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.item', 'display', bp), `.item display @${bp}`).toBe('grid')
      expect(valueOf(sheet, '.item', 'border-bottom', bp), `.item border-bottom @${bp}`).toBe(LINE)
      expect(valueOf(sheet, '.item:first-child', 'border-top', bp), `.item:first-child border-top @${bp}`).toBe(LINE)
    }
    expect(valueOf(sheet, '.item', 'grid-template-columns', 0)).toBe('32px minmax(0, 1fr)')
    expect(valueOf(sheet, '.item', 'padding-block', 0)).toBe('12px')
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.item', 'grid-template-columns', bp), `.item 칸 @${bp}`).toBe('40px minmax(0, 1fr)')
      expect(valueOf(sheet, '.item', 'padding-block', bp), `.item padding-block @${bp}`).toBe('20px')
    }
  })

  it('AC-210.1: 번호(.num)는 small 600 accent, h3(.itemTitle)·설명(.desc·.short)은 둘째 칸이고, 긴 설명은 ink-2·위 4px, 짧은 설명은 small muted다', () => {
    const sheet = featSheet()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.num', 'font-size', bp), `.num font-size @${bp}`).toBe('var(--fs-small)')
      expect(valueOf(sheet, '.num', 'font-weight', bp), `.num font-weight @${bp}`).toBe('600')
      expect(valueOf(sheet, '.num', 'color', bp), `.num color @${bp}`).toBe('var(--accent)')
      for (const name of ['.itemTitle', '.desc', '.short']) {
        expect(valueOf(sheet, name, 'grid-column', bp), `${name} grid-column @${bp}`).toBe('2')
      }
    }
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.desc', 'color', bp), `.desc color @${bp}`).toBe('var(--ink-2)')
      expect(valueOf(sheet, '.desc', 'margin-top', bp), `.desc margin-top @${bp}`).toBe('4px')
    }
    expect(valueOf(sheet, '.short', 'font-size', 0)).toBe('var(--fs-small)')
    expect(valueOf(sheet, '.short', 'line-height', 0)).toBe('var(--lh-small)')
    expect(valueOf(sheet, '.short', 'color', 0)).toBe('var(--muted)')
  })
})

// ---------- AC-210.2(CSS 부분): PrivacySection.module.css 값 ----------

const privSheet = () => parseCss(readLanding('PrivacySection.module.css'))

describe('AC-210.2: PrivacySection.module.css — 윗부분·0건·흐름 상자·연결·약속', () => {
  it('AC-210.2: 윗부분(.top)은 1024px 이상 글(.text) 1~8칸 · 0건(.zero) 10~12칸(아래 맞춤)이고 미만은 쌓인다. 안내(.lead)는 ink-2·위 12px·최대 640px다', () => {
    const sheet = privSheet()
    expect(valueOf(sheet, '.text', 'grid-column', 1024)).toBe('1 / 9')
    expect(valueOf(sheet, '.zero', 'grid-column', 1024)).toBe('10 / 13')
    expect(valueOf(sheet, '.zero', 'align-self', 1024)).toBe('end')
    for (const bp of [0, 768] as Bp[]) {
      for (const name of ['.text', '.zero']) expect(valueOf(sheet, name, 'grid-column', bp), `${name} grid-column @${bp}`).toBeUndefined()
      expect(px(valueOf(sheet, '.top', 'row-gap', bp)), `.top row-gap @${bp}`).toBeGreaterThan(0)
    }
    for (const bp of BPS) {
      expect(valueOf(sheet, '.lead', 'color', bp), `.lead color @${bp}`).toBe('var(--ink-2)')
      expect(valueOf(sheet, '.lead', 'margin-top', bp), `.lead margin-top @${bp}`).toBe('12px')
      expect(valueOf(sheet, '.lead', 'max-width', bp), `.lead max-width @${bp}`).toBe('640px')
    }
  })

  it('AC-210.2: 0건(.zero)은 768px 이상 왼쪽 1px line·왼쪽 24px, 768px 미만은 왼쪽 선 없이 숫자와 설명이 한 줄(flex·글자 아래선 맞춤)이다. 단위(.unit)는 title 크기 600 ink-2, 설명(.zeroCaption)은 muted다', () => {
    const sheet = privSheet()
    expect(valueOf(sheet, '.zero', 'display', 0)).toBe('flex')
    expect(valueOf(sheet, '.zero', 'align-items', 0)).toBe('baseline')
    expect(px(valueOf(sheet, '.zero', 'gap', 0))).toBeGreaterThan(0)
    expect(valueOf(sheet, '.zero', 'border-left', 0) ?? '0').toBe('0')
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.zero', 'display', bp), `.zero display @${bp}`).toBe('block')
      expect(valueOf(sheet, '.zero', 'border-left', bp), `.zero border-left @${bp}`).toBe(LINE)
      expect(valueOf(sheet, '.zero', 'padding-left', bp), `.zero padding-left @${bp}`).toBe('24px')
    }
    for (const bp of BPS) {
      expect(valueOf(sheet, '.unit', 'font-size', bp), `.unit font-size @${bp}`).toBe('var(--fs-title)')
      expect(valueOf(sheet, '.unit', 'font-weight', bp), `.unit font-weight @${bp}`).toBe('600')
      expect(valueOf(sheet, '.unit', 'color', bp), `.unit color @${bp}`).toBe('var(--ink-2)')
      expect(valueOf(sheet, '.zeroCaption', 'color', bp), `.zeroCaption color @${bp}`).toBe('var(--muted)')
    }
  })

  it('AC-210.2: 흐름(.flow)은 surface·1px line·4px 상자 하나이고, 1024px 이상 칸 · 104px · 칸 · 104px · 칸 가로, 미만은 한 칸 세로다(윗부분 아래 16px → 32px(768))', () => {
    const sheet = privSheet()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.flow', 'display', bp), `.flow display @${bp}`).toBe('grid')
      expect(valueOf(sheet, '.flow', 'background', bp), `.flow background @${bp}`).toBe('var(--surface)')
      expect(valueOf(sheet, '.flow', 'border', bp), `.flow border @${bp}`).toBe(LINE)
      expect(valueOf(sheet, '.flow', 'border-radius', bp), `.flow border-radius @${bp}`).toBe('var(--r-control)')
    }
    expect(valueOf(sheet, '.flow', 'grid-template-columns', 1024)).toBe(
      'minmax(0, 1fr) 104px minmax(0, 1fr) 104px minmax(0, 1fr)',
    )
    for (const bp of [0, 768] as Bp[]) {
      expect(valueOf(sheet, '.flow', 'grid-template-columns', bp), `.flow 칸 @${bp}`).toBe('minmax(0, 1fr)')
    }
    expect(valueOf(sheet, '.flow', 'margin-top', 0)).toBe('16px')
    for (const bp of [768, 1024] as Bp[]) expect(valueOf(sheet, '.flow', 'margin-top', bp), `.flow margin-top @${bp}`).toBe('32px')
    // 칸·연결은 테두리가 없다(두 겹 상자 없음)
    expect(sideBorders(sheet).filter((d) => !/^\.(?:flow|zero) \{/.test(d))).toEqual([])
  })

  it('AC-210.2: 칸(.node) — h3(.nodeTitle)는 아이콘과 글자 한 줄, 아이콘(.nodeIcon)은 muted, 설명(.nodeDesc)은 ink-2다', () => {
    const sheet = privSheet()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.node', 'display', bp), `.node display @${bp}`).toBe('flex')
      expect(valueOf(sheet, '.node', 'flex-direction', bp), `.node flex-direction @${bp}`).toBe('column')
      expect(valueOf(sheet, '.node', 'min-width', bp), `.node min-width @${bp}`).toBe('0')
      expect(valueOf(sheet, '.nodeTitle', 'display', bp), `.nodeTitle display @${bp}`).toBe('flex')
      expect(valueOf(sheet, '.nodeTitle', 'align-items', bp), `.nodeTitle align-items @${bp}`).toBe('center')
      expect(valueOf(sheet, '.nodeTitle', 'gap', bp), `.nodeTitle gap @${bp}`).toBe('8px')
      expect(valueOf(sheet, '.nodeIcon', 'color', bp), `.nodeIcon color @${bp}`).toBe('var(--muted)')
    }
    for (const bp of [768, 1024] as Bp[]) expect(valueOf(sheet, '.nodeDesc', 'color', bp), `.nodeDesc color @${bp}`).toBe('var(--ink-2)')
  })

  it('AC-210.2: 멈춤 줄(.stop)은 negative small이고 아이콘 14px | 글 두 칸(아이콘은 첫 줄 가운데), "여기서 멈춤"(.stopTitle)은 600, 항목(.stopItems)은 둘째 칸이다', () => {
    const sheet = privSheet()
    for (const bp of BPS) {
      for (const [prop, value] of Object.entries({
        display: 'grid',
        'grid-template-columns': '14px minmax(0, 1fr)',
        'align-items': 'center',
        'font-size': 'var(--fs-small)',
        'line-height': 'var(--lh-small)',
        color: 'var(--negative)',
      })) {
        expect(valueOf(sheet, '.stop', prop, bp), `.stop ${prop} @${bp}`).toBe(value)
      }
      expect(valueOf(sheet, '.stopTitle', 'font-weight', bp), `.stopTitle font-weight @${bp}`).toBe('600')
      expect(valueOf(sheet, '.stopItems', 'grid-column', bp), `.stopItems grid-column @${bp}`).toBe('2')
    }
  })

  it('AC-210.2: 연결(.edge)은 muted이고, 1024px 이상 글자 위 · 가로 화살표 아래(세로 쌓기·가운데), 미만은 아래쪽 화살표(90도 돌림) → 글자 한 줄이며 화살표는 칸 아이콘과 같은 왼쪽 끝이다', () => {
    const sheet = privSheet()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.edge', 'display', bp), `.edge display @${bp}`).toBe('flex')
      expect(valueOf(sheet, '.edge', 'align-items', bp), `.edge align-items @${bp}`).toBe('center')
      expect(valueOf(sheet, '.edge', 'color', bp), `.edge color @${bp}`).toBe('var(--muted)')
    }
    expect(valueOf(sheet, '.edge', 'flex-direction', 1024)).toBe('column')
    expect(valueOf(sheet, '.edge', 'justify-content', 1024)).toBe('center')
    expect(valueOf(sheet, '.edgeArrow', 'transform', 1024)).toBe('none')
    expect(valueOf(sheet, '.edgeArrow', 'order', 1024)).toBe('0')
    for (const bp of [0, 768] as Bp[]) {
      expect(valueOf(sheet, '.edge', 'flex-direction', bp) ?? 'row', `.edge flex-direction @${bp}`).toBe('row')
      expect(valueOf(sheet, '.edgeArrow', 'transform', bp), `.edgeArrow transform @${bp}`).toBe('rotate(90deg)')
      expect(valueOf(sheet, '.edgeArrow', 'order', bp), `.edgeArrow order @${bp}`).toBe('-1')
      const nodeInline = valueOf(sheet, '.node', 'padding-inline', bp)
      expect(px(nodeInline), `.node padding-inline @${bp}`).toBeGreaterThan(0)
      expect(valueOf(sheet, '.edge', 'padding-inline', bp), `.edge padding-inline @${bp}`).toBe(nodeInline)
    }
  })

  it('AC-210.2: 약속(.rules, 768px 이상)은 2칸(사이 24px)·위 32px이고, 칸(.rule)마다 위 1px line(위아래 16px), dt(.ruleTitle) 600 · dd(.ruleDesc) ink-2다', () => {
    const sheet = privSheet()
    for (const bp of [768, 1024] as Bp[]) {
      for (const [selector, props] of Object.entries({
        '.rules': { display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0, 1fr))', 'column-gap': '24px', 'margin-top': '32px' },
        '.rule': { 'border-top': LINE, 'padding-block': '16px' },
        '.ruleTitle': { 'font-weight': '600' },
        '.ruleDesc': { color: 'var(--ink-2)' },
      } as Record<string, Record<string, string>>)) {
        for (const [prop, value] of Object.entries(props)) {
          expect(valueOf(sheet, selector, prop, bp), `${selector} ${prop} @${bp}`).toBe(value)
        }
      }
    }
  })
})

// ---------- AC-211.1(CSS 부분): HowSection.module.css 값 ----------

const howSheet = () => parseCss(readLanding('HowSection.module.css'))
const howSelectorsWith = (props: RegExp) =>
  [...new Set(howSheet().rules.filter((r) => r.decls.some((d) => props.test(d.prop))).flatMap((r) => r.selectors))].sort()

describe('AC-211.1: HowSection.module.css — 칸·휴대폰 순서·단계 줄·번호', () => {
  it('AC-211.1: 1024px 이상 12칸(base .grid)에서 글(.text)·단추(.start)는 1~5칸 두 줄, 단계(.steps)는 7~12칸이고 두 줄에 걸친다(위 줄은 글 높이, 남는 높이는 아래 줄)', () => {
    const sheet = howSheet()
    expectAt('.grid', 1024, { 'grid-template-columns': 'repeat(12, minmax(0, 1fr))', 'column-gap': '24px' })
    expect(valueOf(sheet, '.text', 'grid-column', 1024)).toBe('1 / 6')
    expect(valueOf(sheet, '.text', 'grid-row', 1024)).toBe('1')
    expect(valueOf(sheet, '.start', 'grid-column', 1024)).toBe('1 / 6')
    expect(valueOf(sheet, '.start', 'grid-row', 1024)).toBe('2')
    expect(valueOf(sheet, '.start', 'align-self', 1024)).toBe('start')
    expect(valueOf(sheet, '.steps', 'grid-column', 1024)).toBe('7 / 13')
    expect(valueOf(sheet, '.steps', 'grid-row', 1024)).toBe('1 / 3')
    expect(valueOf(sheet, '.layout', 'grid-template-rows', 1024)).toBe('auto 1fr')
    for (const name of ['.text', '.steps']) expect(valueOf(sheet, name, 'min-width', 1024), `${name} min-width`).toBe('0')
  })

  it('AC-211.1: 1024px 미만은 칸 지정 없이 쌓이고 사이가 띄워진다. 768px 미만만 단추(.start)가 단계 뒤로 가고(order) 전체 폭이다', () => {
    const sheet = howSheet()
    for (const bp of [0, 768] as Bp[]) {
      for (const name of ['.text', '.start', '.steps']) {
        expect(valueOf(sheet, name, 'grid-column', bp), `${name} grid-column @${bp}`).toBeUndefined()
        expect(valueOf(sheet, name, 'grid-row', bp), `${name} grid-row @${bp}`).toBeUndefined()
      }
      expect(valueOf(sheet, '.layout', 'grid-template-rows', bp), `.layout grid-template-rows @${bp}`).toBeUndefined()
    }
    for (const bp of BPS) expect(px(valueOf(sheet, '.layout', 'row-gap', bp)), `.layout row-gap @${bp}`).toBeGreaterThan(0)
    // 같은 DOM(글 → 단추 → 단계)에서 휴대폰만 단추를 단계 뒤로 옮긴다: h2 → 안내 → 단계 → 단추(design.md '#how의 단추')
    expect(howSelectorsWith(/^order$/)).toEqual(['.start'])
    expect(Number(valueOf(sheet, '.start', 'order', 0))).toBeGreaterThan(0)
    for (const bp of [768, 1024] as Bp[]) expect(valueOf(sheet, '.start', 'order', bp), `.start order @${bp}`).toBe('0')
    expect(valueOf(sheet, '.start', 'justify-self', 0)).toBe('stretch')
    for (const bp of [768, 1024] as Bp[]) expect(valueOf(sheet, '.start', 'justify-self', bp), `.start justify-self @${bp}`).toBe('start')
  })

  it('AC-211.1: 단추 자리(.start)는 자리·순서만 정하고 크기·색은 base .btnLg(44px)·.btnPrimary 그대로다(CSS 파일 순서에 기대지 않는다)', () => {
    const props = howSheet().rules.filter((r) => r.selectors.includes('.start')).flatMap((r) => r.decls.map((d) => d.prop))
    expect(props.length).toBeGreaterThan(0)
    for (const prop of props) expect(prop).toMatch(/^(?:order|justify-self|align-self|grid-column|grid-row|margin-top)$/)
    for (const bp of BPS) expect(landingValues(base(), ['.btn', '.btnLg'], ['height'], bp).height, `.btnLg @${bp}`).toBe('44px')
  })

  it('AC-211.1: 안내(.lead)는 ink-2·위 12px이고, h2 크기는 base .tHeading(heading-m → heading(768))이 정한다', () => {
    const sheet = howSheet()
    expect(valueOf(sheet, '.lead', 'color', 0)).toBe('var(--ink-2)')
    expect(valueOf(sheet, '.lead', 'margin-top', 0)).toBe('12px')
    expectAt('.tHeading', 0, { 'font-size': 'var(--fs-heading-m)', 'line-height': 'var(--lh-heading-m)' })
    expectAt('.tHeading', 768, { 'font-size': 'var(--fs-heading)', 'line-height': 'var(--lh-heading)' })
    expect(howSelectorsWith(/^(?:font-size|line-height|letter-spacing|font)$/), '글자 크기는 번호(.num)만 정한다').toEqual(['.num'])
  })

  it('AC-211.1: 단계 줄(.step)은 위아래 1px line으로 나뉘고(첫 줄 위 선), 번호 | 글 두 칸(40px)이며 위아래 12px → 20px(768)다', () => {
    const sheet = howSheet()
    for (const bp of BPS) {
      expect(valueOf(sheet, '.step', 'display', bp), `.step display @${bp}`).toBe('grid')
      expect(valueOf(sheet, '.step', 'grid-template-columns', bp), `.step 칸 @${bp}`).toBe('40px minmax(0, 1fr)')
      expect(valueOf(sheet, '.step', 'border-bottom', bp), `.step border-bottom @${bp}`).toBe(LINE)
      expect(valueOf(sheet, '.step:first-child', 'border-top', bp), `.step:first-child border-top @${bp}`).toBe(LINE)
    }
    expect(valueOf(sheet, '.step', 'padding-block', 0)).toBe('12px')
    expect(valueOf(sheet, '.step', 'align-items', 0), '휴대폰은 제목만 보여 번호와 가운데 맞춤').toBe('center')
    for (const bp of [768, 1024] as Bp[]) {
      expect(valueOf(sheet, '.step', 'padding-block', bp), `.step padding-block @${bp}`).toBe('20px')
      expect(valueOf(sheet, '.step', 'align-items', bp), `.step align-items @${bp}`).toBe('start')
    }
  })

  it('AC-211.1: 번호(.num)는 24px 칸·accent-soft 바탕·accent-strong 600(small)·4px 모서리이고 글자는 가운데다', () => {
    const sheet = howSheet()
    for (const bp of BPS) {
      for (const [prop, value] of Object.entries({
        display: 'grid',
        'place-items': 'center',
        width: '24px',
        height: '24px',
        background: 'var(--accent-soft)',
        color: 'var(--accent-strong)',
        'font-size': 'var(--fs-small)',
        'line-height': 'var(--lh-small)',
        'font-weight': '600',
        'border-radius': 'var(--r-control)',
      })) {
        expect(valueOf(sheet, '.num', prop, bp), `.num ${prop} @${bp}`).toBe(value)
      }
    }
  })

  it('AC-211.1: h3(.stepTitle)·설명(.desc)은 둘째 칸이고, 설명은 ink-2·위 4px다(768px 미만 숨김은 base .pcOnly)', () => {
    const sheet = howSheet()
    for (const bp of BPS) {
      for (const name of ['.stepTitle', '.desc']) expect(valueOf(sheet, name, 'grid-column', bp), `${name} grid-column @${bp}`).toBe('2')
      expect(valueOf(sheet, '.desc', 'color', bp), `.desc color @${bp}`).toBe('var(--ink-2)')
      expect(valueOf(sheet, '.desc', 'margin-top', bp), `.desc margin-top @${bp}`).toBe('4px')
    }
    expect(howSelectorsWith(/^display$/), '숨김은 base .pcOnly가 맡는다').toEqual(['.num', '.step'])
  })

  it('AC-211.1: 상자·장식이 없다 — 네 변 테두리·세로 선·::before/::after·겹쳐 놓기가 없고 바탕은 번호(.num)에만 있다', () => {
    const sheet = howSheet()
    expect(sheet.rules.length).toBeGreaterThan(0)
    expect(sideBorders(sheet)).toEqual([])
    expect(sheet.rules.flatMap((r) => r.selectors).filter((sel) => /::?(?:before|after)\b/.test(sel))).toEqual([])
    expect(howSelectorsWith(/^(?:position|transform|opacity|content|clip-path|mask(?:-[\w-]+)?)$/)).toEqual([])
    expect(howSelectorsWith(/^background(?:-[\w-]+)?$/)).toEqual(['.num'])
  })
})
