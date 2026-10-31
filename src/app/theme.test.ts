import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// 앱 화면 토큰과 Tailwind 설정 (REQ-013, ADR-015·ADR-019, specs/b2b-redesign REQ-202, docs/UI_GUIDE.md '앱 화면', specs/auth/design.md 'Tailwind는 Preflight 없이')
const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
// 따옴표 안의 "/*"(예: @source not "../**/*.test.ts")는 주석이 아니다 → 따옴표 글은 그대로 두고 주석만 지운다
const withoutComments = (css: string) =>
  css.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\//g, (_, quoted: string | undefined) => quoted ?? '')
const globals = () => withoutComments(read('src/app/globals.css'))

// head가 가리키는 블록의 몸통(중괄호 짝을 맞춘다). 없으면 null
function blockBody(css: string, head: RegExp): string | null {
  const match = head.exec(css)
  if (match === null) return null
  const open = css.indexOf('{', match.index + match[0].length - 1)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  return null
}

// 블록 안의 바로 아래 규칙들: [선택자, 몸통]
function rules(body: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  let depth = 0
  let start = 0
  let selector = ''
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{') {
      if (depth === 0) {
        selector = body.slice(start, i).trim()
        start = i + 1
      }
      depth++
    } else if (body[i] === '}') {
      depth--
      if (depth === 0) {
        out.push([selector, body.slice(start, i)])
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
      parts.push(current.trim())
      current = ''
    } else current += ch
  }
  parts.push(current.trim())
  return parts
}

// 선언 '--이름: 값;'을 순서대로
function declarations(body: string): Array<[string, string]> {
  return [...body.matchAll(/(--[\w*-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')])
}

// 모든 @layer 블록과 @theme 블록을 뺀 나머지(= layer 밖 CSS)
function outsideLayers(css: string): string {
  let rest = css
  for (;;) {
    const match = /@(layer\s+[\w-]+|theme(\s+inline)?)\s*\{/.exec(rest)
    if (match === null) return rest
    const body = blockBody(rest, /@(layer\s+[\w-]+|theme(\s+inline)?)\s*\{/)!
    const end = rest.indexOf(body, match.index) + body.length + 1
    rest = rest.slice(0, match.index) + rest.slice(end)
  }
}

// 같은 이름의 @layer 블록 몸통 전부(파일 순서대로)
function layerBodies(css: string, name: string): string[] {
  const out: string[] = []
  const head = new RegExp(`@layer\\s+${name}\\s*\\{`, 'g')
  for (let m = head.exec(css); m !== null; m = head.exec(css)) {
    const body = blockBody(css.slice(m.index), new RegExp(`@layer\\s+${name}\\s*\\{`))
    if (body !== null) out.push(body)
  }
  return out
}

// 랜딩이 쓰는 요소 규칙 중 앱 요소에도 닿는 것. @layer base에 두어 앱의 Tailwind 클래스(utilities)가 이기게 한다 (AC-102.3: a 하나)
const LANDING_BASE: Record<string, RegExp> = {
  a: /^\s*color:\s*var\(--accent\)\s*;?\s*$/,
}

// head로 시작하는 블록을 모두 지운다(중괄호 짝을 맞춘다)
function removeBlocks(css: string, head: RegExp): string {
  let rest = css
  for (;;) {
    const match = head.exec(rest)
    if (match === null) return rest
    const open = rest.indexOf('{', match.index + match[0].length - 1)
    let depth = 0
    let end = rest.length
    for (let i = open; i < rest.length; i++) {
      if (rest[i] === '{') depth++
      if (rest[i] === '}' && --depth === 0) {
        end = i + 1
        break
      }
    }
    rest = rest.slice(0, match.index) + rest.slice(end)
  }
}


// ---------- 토큰 표 (specs/b2b-redesign REQ-202 AC-202.1, design.md '토큰 블록'·'옛 이름 별칭') ----------

// 색 토큰: 이름(-- 뒤) → 값. 16진수는 대소문자를 보지 않는다
const COLOR_TOKENS: Record<string, string> = {
  canvas: '#F7F8FA',
  surface: '#FFFFFF',
  line: '#E5E7EB',
  'line-strong': '#D1D5DB',
  faint: '#9CA3AF',
  muted: '#6B7280',
  'ink-2': '#374151',
  ink: '#111827',
  accent: '#2563EB',
  'accent-strong': '#1D4ED8',
  'accent-soft': '#EAF1FE',
  positive: '#15803D',
  'positive-soft': '#ECF7EF',
  negative: '#C2410C',
  'negative-soft': '#FDF0EA',
  warning: '#B45309',
  'warning-soft': '#FDF4E3',
  'chart-1': '#DBE7FD',
  'chart-2': '#B4CDFA',
  'chart-3': '#8DB0F4',
  'chart-4': '#2563EB',
  'chart-5': '#1D4ED8',
  'chart-prev': '#9CA3AF',
  'cat-1': '#2563EB',
  'cat-2': '#0F766E',
  'cat-3': '#B45309',
  'cat-4': '#6D28D9',
  'cat-5': '#6B7280',
}

// 글자 11단계: [크기 px, 줄 높이 px, 자간 토큰(--ls-heading·--ls-display) 또는 없음]
const TYPE: Record<string, [number, number, 'heading' | 'display' | null]> = {
  caption: [12, 16, null],
  small: [13, 20, null],
  body: [14, 22, null],
  lead: [16, 24, null],
  subtitle: [16, 24, null],
  title: [20, 28, null],
  'heading-m': [24, 32, 'heading'],
  heading: [28, 36, 'heading'],
  metric: [28, 36, 'heading'],
  'display-m': [32, 40, 'display'],
  display: [48, 56, 'display'],
}

const ELEV_FLOAT = '0 1px 2px rgb(17 24 39 / 0.06), 0 6px 16px rgb(17 24 39 / 0.1)'
const FONT_UI = "var(--font-pretendard), 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif"

// :root 토큰 전부: 변수 이름 → 값
const TOKENS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(COLOR_TOKENS).map(([name, value]) => [`--${name}`, value])),
  ...Object.fromEntries(
    Object.entries(TYPE).flatMap(([step, [size, lineHeight]]) => [
      [`--fs-${step}`, `${size}px`],
      [`--lh-${step}`, `${lineHeight}px`],
    ]),
  ),
  '--ls-heading': '-0.01em',
  '--ls-display': '-0.02em',
  '--r-control': '4px',
  '--r-float': '8px',
  '--elev-float': ELEV_FLOAT,
  '--w-landing': '1200px',
  '--w-app': '1280px',
  '--gutter': '24px',
  '--gutter-m': '16px',
  '--font-ui': FONT_UI,
}

// 옛 이름 별칭(TASK-23에서 지움). 랜딩 CSS Module이 쓰는 옛 :root 이름 → 새 토큰
const LANDING_ALIASES: Record<string, string> = {
  '--ok': 'var(--positive)',
  '--ok-soft': 'var(--positive-soft)',
  '--danger': 'var(--negative)',
  '--danger-soft': 'var(--negative-soft)',
  '--accent-tint': 'var(--chart-2)',
  '--field': 'var(--faint)',
  '--content-max': 'var(--w-landing)',
  '--font-sans': 'var(--font-ui)',
}
// 옛 Tailwind 이름 → 가리키는 새 토큰(색·모서리는 토큰 이름, 글자는 단계 이름)
const OLD_COLORS: Record<string, string> = {
  ok: 'positive',
  'ok-soft': 'positive-soft',
  danger: 'negative',
  'danger-soft': 'negative-soft',
  warn: 'warning',
}
const OLD_RADII: Record<string, string> = { card: 'r-control', chip: 'r-control' }
const OLD_TEXT: Record<string, string> = {
  table: 'small',
  tab: 'body',
  panel: 'subtitle',
  logo: 'subtitle',
  'title-sm': 'title',
  'kpi-sm': 'metric',
  kpi: 'metric',
}

// 16진수만 대문자로(글꼴 이름 같은 글자는 그대로 비교한다)
const upperHex = (value: string) => value.replace(/#[0-9a-f]{3,8}\b/gi, (hex) => hex.toUpperCase())
const normalized = (entries: Array<[string, string]> | Record<string, string>) =>
  Object.fromEntries((Array.isArray(entries) ? entries : Object.entries(entries)).map(([name, value]) => [name, upperHex(value)]))

// 글자 단계 하나의 @theme 선언: 크기·줄 높이(+ 자간)
const textTheme = (name: string, step: string): Array<[string, string]> => {
  const [, , spacing] = TYPE[step]
  return [
    [`--text-${name}`, `var(--fs-${step})`],
    [`--text-${name}--line-height`, `var(--lh-${step})`],
    ...(spacing ? ([[`--text-${name}--letter-spacing`, `var(--ls-${spacing})`]] as Array<[string, string]>) : []),
  ]
}

// layer 밖 :root 규칙들의 몸통
const rootBodies = () =>
  rules(outsideLayers(globals()))
    .filter(([s]) => s === ':root')
    .map(([, body]) => body)

// @theme 블록들: [머리('@theme inline' 등), 몸통]
function themeBlocks(): Array<[string, string]> {
  const css = globals()
  const out: Array<[string, string]> = []
  const head = /@theme\b[^{;]*\{/g
  for (let m = head.exec(css); m !== null; m = head.exec(css)) {
    const body = blockBody(css.slice(m.index), /@theme\b[^{;]*\{/)
    if (body !== null) out.push([m[0].slice(0, -1).trim().replace(/\s+/g, ' '), body])
  }
  return out
}
const themeDecls = () => themeBlocks().flatMap(([, body]) => declarations(body))

// globals.css를 실제 Tailwind(postcss)로 돌린다. extra는 inline으로 더 만들 클래스
async function tailwindCss(extra: string[] = []): Promise<string> {
  const { default: postcss } = await import('postcss')
  const { default: tailwind } = await import('@tailwindcss/postcss')
  const source = extra.length > 0 ? `${read('src/app/globals.css')}\n@source inline("${extra.join(' ')}");\n` : read('src/app/globals.css')
  const result = await postcss([tailwind({ base: ROOT, optimize: false })]).process(source, {
    from: join(ROOT, 'src/app/globals.css'),
  })
  return result.css
}
// 만든 CSS에서 클래스 하나의 규칙 몸통(공백을 하나로). 없으면 null
const utility = (css: string, selector: string) =>
  css.replace(/\s+/g, ' ').match(new RegExp(`(?:^|[\\s}])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? null

describe('AC-013.1: Tailwind 불러오기 (Preflight 없음)', () => {
  it('AC-013.1: globals.css 맨 앞은 layer 순서 선언이고, Tailwind는 theme·utilities만 layer로 불러온다', () => {
    const css = globals()
    expect(css.trimStart().startsWith('@layer theme, base, components, utilities;'), 'layer 순서 선언이 맨 앞이 아니다').toBe(true)
    const imports = [...css.matchAll(/@import\s+[^;]+;/g)].map((m) => m[0].replace(/'/g, '"').replace(/\s+/g, ' '))
    expect(imports).toEqual([
      '@import "tailwindcss/theme.css" layer(theme);',
      '@import "tailwindcss/utilities.css" layer(utilities) source("../");',
    ])
  })

  it('AC-013.1: Tailwind는 src/ 안 소스만 보고 시험 파일(*.test.ts·*.test.tsx)은 보지 않는다 — 문서·명세·시험 글자에만 있는 클래스를 만들지 않는다', async () => {
    const css = globals()
    expect(css).toContain('@source not "../**/*.test.ts";')
    expect(css).toContain('@source not "../**/*.test.tsx";')
    // 실제 Tailwind로 돌려 본다(저장소 뿌리를 base로 줘도 src/만 본다)
    const { default: postcss } = await import('postcss')
    const { default: tailwind } = await import('@tailwindcss/postcss')
    const result = await postcss([tailwind({ base: ROOT, optimize: false })]).process(read('src/app/globals.css'), {
      from: join(ROOT, 'src/app/globals.css'),
    })
    const out = result.css
    // 앱 화면이 쓰는 클래스는 그대로 만든다(개편 뒤에도 남는 것만 고른다, b2b-redesign design.md)
    for (const cls of ['.max-md\\:hidden', '.flex-\\[1_1_160px\\]', '.shadow-float']) {
      expect(out, cls).toContain(cls)
    }
    // 시험 글자(hasNone의 'overflow-hidden')·문서·시안(rounded-2xl·text-4xl)에만 있는 클래스는 만들지 않는다
    for (const cls of ['.overflow-hidden {', '.rounded-2xl {', '.text-4xl {']) expect(out, cls).not.toContain(cls)
  }, 30_000)

  it('AC-013.1: Preflight(기본 초기화)를 불러오지 않는다', () => {
    const css = globals()
    expect(css).not.toMatch(/preflight/i)
    expect(css).not.toMatch(/@import\s+["']tailwindcss["']/)
    expect(css).not.toMatch(/@tailwind\b/)
  })
})

describe('AC-202.2: @theme inline은 토큰을 var()로만 가리킨다', () => {
  it('AC-202.2: @theme 블록은 @theme inline 하나이고, 값은 var(--토큰)과 기본값 지우기(initial) 네 줄뿐이다 — 16진수·px·em을 직접 쓰지 않는다', () => {
    const blocks = themeBlocks()
    expect(blocks.map(([head]) => head)).toEqual(['@theme inline'])
    const [, body] = blocks[0]
    expect(body, '@theme inline 안에 16진수·px·em 값이 있다').not.toMatch(/#[0-9a-f]{3,8}\b|\d(px|r?em)\b/i)
    const decls = declarations(body)
    for (const [name, value] of decls) {
      if (name.endsWith('-*')) expect(value, name).toBe('initial')
      else expect(value, name).toMatch(/^var\(--[\w-]+\)$/)
    }
    // 가리키는 변수는 모두 :root 토큰이다(별칭을 다시 가리키지 않는다)
    for (const [name, value] of decls.filter(([n]) => !n.endsWith('-*'))) {
      expect(Object.keys(TOKENS), `${name}: ${value}`).toContain(value.slice(4, -1))
    }
  })

  it('AC-202.2: --color-*·--radius-*·--shadow-*·--text-*: initial 네 줄이 있고, 각 이름 공간의 다른 선언보다 앞에 있다', () => {
    const decls = themeDecls()
    const wipes = decls.filter(([name]) => name.endsWith('-*')).map(([name]) => name)
    expect(wipes.sort()).toEqual(['--color-*', '--radius-*', '--shadow-*', '--text-*'])
    for (const wipe of wipes) {
      const prefix = wipe.slice(0, -1)
      const first = decls.findIndex(([name]) => name.startsWith(prefix))
      expect(decls[first][0], `${wipe}가 ${prefix} 선언보다 뒤에 있다`).toBe(wipe)
    }
  })

  it('AC-202.2: 색은 :root 색 토큰 전부(차트·항목 색 포함)를 같은 이름으로 가리키고, 옛 별칭 ok·ok-soft·danger·danger-soft·warn은 표의 새 색을 가리킨다', () => {
    const colors = themeDecls().filter(([name]) => name.startsWith('--color-') && name !== '--color-*')
    const names = colors.map(([name]) => name)
    expect(names.length, '같은 색 이름을 두 번 선언했다').toBe(new Set(names).size)
    expect(Object.fromEntries(colors)).toEqual({
      ...Object.fromEntries(Object.keys(COLOR_TOKENS).map((name) => [`--color-${name}`, `var(--${name})`])),
      ...Object.fromEntries(Object.entries(OLD_COLORS).map(([old, token]) => [`--color-${old}`, `var(--${token})`])),
    })
  })

  it('AC-202.2: 모서리는 control·float(+ 옛 card·chip은 control), 그림자는 float 하나다', () => {
    const decls = themeDecls()
    const radii = decls.filter(([name]) => name.startsWith('--radius-') && name !== '--radius-*')
    expect(Object.fromEntries(radii)).toEqual({
      '--radius-control': 'var(--r-control)',
      '--radius-float': 'var(--r-float)',
      ...Object.fromEntries(Object.entries(OLD_RADII).map(([old, token]) => [`--radius-${old}`, `var(--${token})`])),
    })
    const shadows = decls.filter(([name]) => name.startsWith('--shadow-') && name !== '--shadow-*')
    expect(shadows).toEqual([['--shadow-float', 'var(--elev-float)']])
  })

  it('AC-202.2: 글자는 11단계(크기·줄 높이, heading·heading-m·metric은 --ls-heading, display·display-m은 --ls-display)이고, 옛 별칭은 표의 단계를 그대로 가리킨다', () => {
    const texts = themeDecls().filter(([name]) => name.startsWith('--text-') && name !== '--text-*')
    const names = texts.map(([name]) => name)
    expect(names.length, '같은 글자 이름을 두 번 선언했다').toBe(new Set(names).size)
    expect(Object.fromEntries(texts)).toEqual(
      Object.fromEntries([
        ...Object.keys(TYPE).flatMap((step) => textTheme(step, step)),
        ...Object.entries(OLD_TEXT).flatMap(([old, step]) => textTheme(old, step)),
      ]),
    )
  })

  it('AC-202.2: 글꼴은 --font-sans: var(--font-ui) 하나다', () => {
    const fonts = themeDecls().filter(([name]) => name.startsWith('--font-'))
    expect(fonts).toEqual([['--font-sans', 'var(--font-ui)']])
  })

  it('AC-202.2: 실제 Tailwind로 돌리면 토큰 클래스는 var(토큰)을 쓰고, 지운 기본 이름(text-sm·rounded-lg·shadow-md·bg-blue-500)은 만들어지지 않는다', async () => {
    const steps = Object.keys(TYPE)
    const olds = Object.keys(OLD_TEXT)
    const css = await tailwindCss([
      ...steps.map((s) => `text-${s}`),
      ...olds.map((s) => `text-${s}`),
      'bg-ink',
      'text-ok',
      'bg-chart-3',
      'rounded-control',
      'rounded-float',
      'rounded-card',
      'shadow-float',
      'font-sans',
      'text-sm',
      'rounded-lg',
      'shadow-md',
      'bg-blue-500',
    ])
    const small = utility(css, '.text-small')
    expect(small, '.text-small이 없다').not.toBeNull()
    expect(small).toContain('font-size: var(--fs-small)')
    expect(small).toMatch(/line-height: [^;]*var\(--lh-small\)/)
    for (const [name, step] of [...steps.map((s) => [s, s]), ...Object.entries(OLD_TEXT)]) {
      const rule = utility(css, `.text-${name}`)
      expect(rule, `.text-${name}가 없다`).not.toBeNull()
      expect(rule, name).toContain(`font-size: var(--fs-${step})`)
      expect(rule, name).toMatch(new RegExp(`line-height: [^;]*var\\(--lh-${step}\\)`))
      const spacing = TYPE[step][2]
      if (spacing) expect(rule, name).toMatch(new RegExp(`letter-spacing: [^;]*var\\(--ls-${spacing}\\)`))
      else expect(rule, name).not.toContain('letter-spacing')
    }
    expect(utility(css, '.bg-ink')).toContain('background-color: var(--ink)')
    expect(utility(css, '.text-ok')).toContain('color: var(--positive)')
    expect(utility(css, '.bg-chart-3')).toContain('background-color: var(--chart-3)')
    expect(utility(css, '.rounded-control')).toContain('border-radius: var(--r-control)')
    expect(utility(css, '.rounded-float')).toContain('border-radius: var(--r-float)')
    expect(utility(css, '.rounded-card')).toContain('border-radius: var(--r-control)')
    expect(utility(css, '.shadow-float')).toContain('--tw-shadow: var(--elev-float)')
    expect(utility(css, '.font-sans')).toContain('font-family: var(--font-ui)')
    for (const gone of ['.text-sm', '.rounded-lg', '.shadow-md', '.bg-blue-500']) expect(utility(css, gone), gone).toBeNull()
    // .app-ui 초기화가 쓰는 --color-canvas·--color-ink는 theme 층에 만들어져 토큰을 가리킨다(화면 바탕이 비지 않는다)
    const flat = css.replace(/\s+/g, ' ')
    expect(flat).toContain('--color-canvas: var(--canvas);')
    expect(flat).toContain('--color-ink: var(--ink);')
  }, 30_000)
})

describe('AC-013.1: 앱 초기화는 .app-ui 안에만', () => {
  const base = () => {
    const bodies = layerBodies(globals(), 'base')
    expect(bodies.length, '@layer base 블록이 없다').toBeGreaterThan(0)
    return bodies.flatMap(rules)
  }
  const find = (selector: RegExp) => base().find(([s]) => splitSelectors(s).some((part) => selector.test(part)))?.[1] ?? ''

  it('AC-013.1: @layer base는 .app-ui로 시작하는 앱 초기화(+ 랜딩 a·a:hover)뿐이고, layer 밖에는 .app-ui가 없다', () => {
    const appRules = base().filter(([s]) => !(s in LANDING_BASE))
    expect(appRules.length).toBeGreaterThan(0)
    for (const [s] of appRules) {
      for (const part of splitSelectors(s)) expect(part, part).toMatch(/^\.app-ui(?![\w-])/)
    }
    expect(outsideLayers(globals())).not.toContain('.app-ui')
  })

  it('AC-013.1: 뿌리는 바탕 canvas·고정폭 숫자·keep-all', () => {
    const root = find(/^\.app-ui$/)
    expect(root).toMatch(/background(-color)?:\s*var\(--color-canvas\)/)
    expect(root).toMatch(/font-variant-numeric:\s*tabular-nums/)
    expect(root).toMatch(/word-break:\s*keep-all/)
  })

  it('AC-013.1: 안쪽 요소는 border-box·여백 0, 단추·입력란은 글꼴·색 상속', () => {
    const all = find(/^\.app-ui \*$/)
    expect(all).toMatch(/box-sizing:\s*border-box/)
    expect(all).toMatch(/margin:\s*0/)
    const controls = find(/^\.app-ui (:where\()?button\b/)
    expect(controls).toMatch(/font:\s*inherit/)
    expect(controls).toMatch(/color:\s*inherit/)
    expect(base().find(([s]) => /input/.test(s)), '입력란 초기화가 없다').toBeDefined()
  })
})

describe('AC-202.1: 토큰 값은 layer 밖 :root 한 곳', () => {
  it('AC-202.1: layer 밖 :root는 하나이고, 변수 선언만 있다', () => {
    const bodies = rootBodies()
    expect(bodies.length, 'layer 밖 :root는 하나다').toBe(1)
    const statements = bodies[0].split(';').map((d) => d.trim()).filter(Boolean)
    expect(statements.filter((d) => !d.startsWith('--')), ':root에 변수 말고 다른 선언이 있다').toEqual([])
    // layer 안이나 다른 곳에 :root를 또 두지 않는다
    expect([...globals().matchAll(/:root\b/g)].length, 'globals.css의 :root 개수').toBe(1)
  })

  it('AC-202.1: :root에 토큰 표의 이름·값이 한 번씩 있고, 그 밖에는 design.md 랜딩 별칭만 있다(16진수는 대소문자 무시)', () => {
    const decls = declarations(rootBodies().join('\n'))
    const names = decls.map(([name]) => name)
    expect(names.length, '같은 변수를 두 번 선언했다').toBe(new Set(names).size)
    expect(normalized(decls)).toEqual(normalized({ ...TOKENS, ...LANDING_ALIASES }))
  })

  it('AC-202.1: 랜딩 별칭 값은 :root 토큰 하나를 가리키는 var()뿐이다(16진수·섞은 색·숫자 값 없음)', () => {
    const root = Object.fromEntries(declarations(rootBodies().join('\n')))
    for (const name of Object.keys(LANDING_ALIASES)) {
      expect(Object.keys(TOKENS), `${name}는 토큰 이름과 겹치면 안 된다`).not.toContain(name)
      const value = root[name]
      expect(value, `:root에 ${name}가 없다`).toBeDefined()
      expect(value, name).toMatch(/^var\(--[\w-]+\)$/)
      expect(Object.keys(TOKENS), `${name}: ${value}`).toContain(value.slice(4, -1))
    }
  })
})

// ---------- AC-202.3: 색 글자가 있는 곳 ----------

// 16진수 색(# + 3·4·6·8자리)과 함수 색. '#top'·'#features' 같은 링크 조각은 잡지 않는다
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi
const COLOR_FN = /\b(?:rgba?|hsla?|color-mix)\(/gi
// 16진수 색을 둘 수 있는 파일: 로고 두 색, 구글 상표 네 색
const HEX_FILES = ['src/components/common/LogoMark.tsx', 'src/components/common/GoogleMark.tsx']
// 옮기는 동안만: 구글 마크가 아직 LoginCard 안에 있다. TASK-16에서 GoogleMark.tsx로 옮기며 이 예외를 지운다
const HEX_MOVING = ['src/components/auth/LoginCard.tsx']

// 시험 파일 밖 src/의 *.css·*.ts·*.tsx(상대 경로)
function colorSources(dir = 'src'): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return colorSources(rel)
    return /\.(css|tsx?)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [rel] : []
  })
}
// 파일 글자(주석 포함). globals.css는 layer 밖 :root 토큰 블록을 뺀 나머지
const colorText = (rel: string) => (rel === 'src/app/globals.css' ? removeBlocks(read(rel), /(^|\n)\s*:root\s*\{/) : read(rel))

describe('AC-202.3: 색 글자는 토큰 블록(과 로고·구글 마크)에만', () => {
  it('AC-202.3: 검사 규칙 자체가 잡아야 할 것을 잡는다', () => {
    for (const bad of ['#fff', '#2563EB', '#2563eb80', 'color: #F7F8FA;', 'fill="#EA4335"']) expect(bad.match(HEX), bad).not.toBeNull()
    for (const ok of ['href="#top"', 'href="#features"', 'href="#ai"', 'href="#how"', 'var(--ink)']) expect(ok.match(HEX), ok).toBeNull()
    for (const bad of ['rgb(17 24 39)', 'rgba(0,0,0,.1)', 'hsl(0 0% 0%)', 'color-mix(in srgb, red, blue)']) {
      expect(bad.match(COLOR_FN), bad).not.toBeNull()
    }
    expect('var(--accent)'.match(COLOR_FN)).toBeNull()
    // globals.css에서 토큰 블록을 빼도 나머지는 남는다(빈 검사가 아니다)
    const rest = colorText('src/app/globals.css')
    expect(rest).toContain('@theme inline')
    expect(rest).not.toMatch(/(^|\n)\s*:root\s*\{/)
    expect(read('src/app/globals.css').match(HEX)?.length ?? 0, '토큰 블록에 16진수 색이 있다').toBeGreaterThan(20)
  })

  it('AC-202.3: 시험 파일 밖 src/의 16진수 색은 globals.css :root 토큰 블록·LogoMark·GoogleMark에만 있다(옮기는 동안 LoginCard 예외)', () => {
    const files = colorSources()
    expect(files).toEqual(expect.arrayContaining(['src/app/globals.css', 'src/components/common/LogoMark.tsx', 'src/components/landing/base.module.css']))
    const allowed = new Set([...HEX_FILES, ...HEX_MOVING])
    const found = files.filter((rel) => !allowed.has(rel)).flatMap((rel) => (colorText(rel).match(HEX) ?? []).map((hex) => `${rel}: ${hex}`))
    expect(found).toEqual([])
  })

  it('AC-202.3: rgb(·hsl(·color-mix(는 globals.css :root 토큰 블록 밖 어디에도 없다', () => {
    const found = colorSources().flatMap((rel) => (colorText(rel).match(COLOR_FN) ?? []).map((fn) => `${rel}: ${fn}`))
    expect(found).toEqual([])
  })
})

// ---------- AC-202.4: 장식 없음 · body ----------

// 모든 선언 '속성: 값;'(주석 뺀 globals.css)
const allDeclarations = (css: string) =>
  [...css.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')] as [string, string])

describe('AC-202.4: globals.css에 장식이 없고 body는 토큰 글꼴', () => {
  it('AC-202.4: 그라데이션(gradient()·backdrop-filter·blur(가 없다', () => {
    const css = globals()
    expect(css).not.toMatch(/gradient\(/i)
    expect(css).not.toMatch(/backdrop-filter/i)
    expect(css).not.toMatch(/blur\(/i)
  })

  it('AC-202.4: 그림자 값은 --elev-float 하나뿐이다(box-shadow·text-shadow·drop-shadow 선언 없음)', () => {
    const css = globals()
    expect(css).not.toMatch(/(box|text)-shadow\s*:/i)
    expect(css).not.toMatch(/drop-shadow/i)
    const shadowLike = allDeclarations(css).filter(([, value]) => /\d(px)?\s+-?\d+px\s+-?\d+px/.test(value) || /rgba?\(/.test(value))
    expect(shadowLike).toEqual([['--elev-float', ELEV_FLOAT]])
  })

  it('AC-202.4: body는 하나이고 바탕 surface·글자 ink·글꼴 var(--font-ui)·keep-all·가로 넘침 clip이다', () => {
    const bodies = rules(outsideLayers(globals())).filter(([s]) => s === 'body')
    expect(bodies.length, 'body 규칙은 하나다').toBe(1)
    const body = bodies[0][1]
    expect(body).toMatch(/(^|[;\s])background:\s*var\(--surface\)\s*;/)
    expect(body).toMatch(/(^|[;\s])color:\s*var\(--ink\)\s*;/)
    expect(body).toMatch(/font-family:\s*var\(--font-ui\)\s*;/)
    expect(body).toMatch(/word-break:\s*keep-all\s*;/)
    expect(body).toMatch(/overflow-x:\s*clip\s*;/)
  })

  it('AC-202.4: layer 밖 선택자는 :root·body·모션 줄이기 블록뿐이고, 모션 줄이기는 모든 animation·transition을 끈다', () => {
    const outside = outsideLayers(globals())
    const selectors = rules(outside).map(([s]) => s.replace(/\s+/g, ' '))
    const allowed = new Set([':root', 'body', '@media (prefers-reduced-motion: reduce)'])
    expect(selectors.filter((s) => !allowed.has(s))).toEqual([])
    const motion = rules(outside).find(([s]) => /prefers-reduced-motion/.test(s))?.[1] ?? ''
    expect(motion).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{/)
    expect(motion).toMatch(/animation:\s*none\s*!important/)
    expect(motion).toMatch(/transition:\s*none\s*!important/)
  })
})

describe('AC-102.3: @layer base의 랜딩 링크 색', () => {
  it('AC-102.3: @layer base의 랜딩 요소 규칙은 a { color: var(--accent) } 하나뿐이고 a:hover 규칙이 없다(.app-ui 초기화는 AC-013.1 시험이 본다)', () => {
    const baseRules = layerBodies(globals(), 'base').flatMap(rules)
    const landing = baseRules.filter(([s]) => !splitSelectors(s).every((part) => /^\.app-ui(?![\w-])/.test(part)))
    expect(landing.map(([s]) => s.replace(/\s+/g, ' '))).toEqual(['a'])
    expect(landing[0][1]).toMatch(LANDING_BASE.a)
    expect(globals()).not.toMatch(/(^|[^\w-])a:hover/)
  })
})

describe('AC-013.1: PostCSS 설정과 패키지', () => {
  it('AC-013.1: postcss.config.mjs의 플러그인은 @tailwindcss/postcss 하나다', async () => {
    const config = (await import(pathToFileURL(join(ROOT, 'postcss.config.mjs')).href)).default
    expect(Object.keys(config.plugins)).toEqual(['@tailwindcss/postcss'])
  })

  it('AC-013.1: tailwindcss·@tailwindcss/postcss·postcss는 버전을 고정한 개발 패키지다(Tailwind 둘은 같은 4.x)', () => {
    const pkg = JSON.parse(read('package.json'))
    const lock = JSON.parse(read('package-lock.json'))
    for (const name of ['tailwindcss', '@tailwindcss/postcss', 'postcss']) {
      const version = pkg.devDependencies?.[name]
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/)
      expect(pkg.dependencies?.[name], `${name}는 개발 패키지여야 한다`).toBeUndefined()
      expect(lock.packages?.[`node_modules/${name}`]?.version, `${name} lock 버전`).toBe(version)
    }
    expect(pkg.devDependencies.tailwindcss).toMatch(/^4\./)
    expect(pkg.devDependencies['@tailwindcss/postcss']).toBe(pkg.devDependencies.tailwindcss)
  })
})
