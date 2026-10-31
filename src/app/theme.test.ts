import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// 앱 화면 토큰과 Tailwind 설정 (REQ-013, ADR-015, docs/UI_GUIDE.md '앱 화면', specs/auth/design.md 'Tailwind는 Preflight 없이')
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

// 시험 파일 밖 src/ 소스 전부(상대 경로)
function sourceFiles(dir = 'src'): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(rel)
    if (/\.test\.tsx?$/.test(entry.name)) return []
    return /\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(entry.name) ? [rel] : []
  })
}

// @theme·@theme inline 블록의 선언 전부(파일 순서대로)
const theme = () => {
  const css = globals()
  const bodies: string[] = []
  const head = /@theme(\s+inline)?\s*\{/g
  for (let m = head.exec(css); m !== null; m = head.exec(css)) {
    const body = blockBody(css.slice(m.index), /@theme(\s+inline)?\s*\{/)
    if (body !== null) bodies.push(body)
  }
  expect(bodies.length, '@theme 블록이 없다').toBeGreaterThan(0)
  return bodies.flatMap(declarations)
}

const COLORS: Record<string, string> = {
  '--color-ink': '#111827',
  '--color-ink-2': '#374151',
  '--color-muted': '#6B7280',
  '--color-line': '#E5E7EB',
  '--color-canvas': '#F7F8FA',
  '--color-surface': '#FFFFFF',
  '--color-accent': '#2563EB',
  '--color-accent-soft': '#EAF1FE',
  '--color-ok': '#166534',
  '--color-ok-soft': '#E7F6EC',
  '--color-danger': '#C2410C',
  '--color-danger-soft': '#FFF1E8',
  '--color-warn': '#B45309',
}

// UI_GUIDE '글자' 표: 크기/줄 높이(px)
const TEXT: Record<string, [number, number]> = {
  caption: [12, 16],
  table: [13, 20],
  body: [14, 22],
  tab: [15, 20],
  lead: [16, 24],
  panel: [18, 26],
  logo: [19, 24],
  'title-sm': [20, 28],
  title: [25, 32],
  'kpi-sm': [28, 34],
  kpi: [34, 40],
}

const FONT_SANS = 'var(--font-plex), system-ui, sans-serif'

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
    // 앱 화면이 쓰는 클래스는 그대로 만든다
    for (const cls of ['.max-md\\:hidden', '.lg\\:max-w-60', '.md\\:table-fixed', '.empty\\:sr-only', '.flex-\\[1_1_160px\\]', '.bg-ink', '.shadow-float']) {
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

describe('AC-013.1: @theme 토큰', () => {
  it('AC-013.1: 기본 색을 지운 뒤(--color-*: initial) 색 토큰 13개만 둔다', () => {
    const decls = theme()
    const colors = decls.filter(([name]) => name.startsWith('--color-'))
    expect(colors[0], '기본 색 지우기가 첫 색 선언이 아니다').toEqual(['--color-*', 'initial'])
    const tokens = Object.fromEntries(colors.slice(1).map(([name, value]) => [name, value.toUpperCase()]))
    expect(tokens).toEqual(COLORS)
  })

  it('AC-013.1: 모서리는 card 6px·chip 4px 두 가지다', () => {
    const radii = theme().filter(([name]) => name.startsWith('--radius-'))
    expect(Object.fromEntries(radii)).toEqual({ '--radius-card': '6px', '--radius-chip': '4px' })
  })

  it('AC-013.1: 글자 크기 토큰 11개와 줄 높이(title·kpi는 자간 -0.01em)', () => {
    const decls = Object.fromEntries(theme().filter(([name]) => name.startsWith('--text-')))
    const sizes = Object.keys(decls).filter((name) => !name.includes('--', 2))
    expect(sizes.sort()).toEqual(Object.keys(TEXT).map((t) => `--text-${t}`).sort())
    for (const [token, [size, lineHeight]] of Object.entries(TEXT)) {
      expect(decls[`--text-${token}`], token).toBe(`${size}px`)
      expect(decls[`--text-${token}--line-height`], `${token} 줄 높이`).toBe(`${lineHeight}px`)
    }
    expect(decls['--text-title--letter-spacing']).toBe('-0.01em')
    expect(decls['--text-kpi--letter-spacing']).toBe('-0.01em')
  })

  it('AC-013.1: 그림자는 float 하나(0 1px 2px + 0 6px 16px, ink 6%·10%)', () => {
    const shadows = theme().filter(([name]) => name.startsWith('--shadow-'))
    expect(shadows.map(([name]) => name)).toEqual(['--shadow-float'])
    expect(shadows[0][1]).toBe('0 1px 2px rgb(17 24 39 / 0.06), 0 6px 16px rgb(17 24 39 / 0.1)')
  })

  it('AC-013.1: 글꼴 sans는 next/font의 IBM Plex Sans KR(--font-plex)', () => {
    expect(Object.fromEntries(theme())['--font-sans']).toBe(FONT_SANS)
  })

  it('AC-013.1: 글자 크기·글꼴 클래스는 값을 바로 쓴다 — 랜딩 변수 --text-body(글자 색)와 이름이 겹쳐도 크기가 깨지지 않는다', async () => {
    // globals.css를 실제 Tailwind로 돌려 클래스를 만든다. var(--text-body)로 두면 layer 밖 랜딩 :root의 색 값이 이겨 크기가 무효가 된다
    const { default: postcss } = await import('postcss')
    const { default: tailwind } = await import('@tailwindcss/postcss')
    const classes = [...Object.keys(TEXT).map((t) => `text-${t}`), 'font-sans'].join(' ')
    const source = `${read('src/app/globals.css')}\n@source inline("${classes}");\n`
    const result = await postcss([tailwind({ base: join(ROOT, 'src/app'), optimize: false })]).process(source, {
      from: join(ROOT, 'src/app/globals.css'),
    })
    const out = result.css.replace(/\s+/g, ' ')
    for (const [token, [size, lineHeight]] of Object.entries(TEXT)) {
      const rule = out.match(new RegExp(`\\.text-${token} \\{([^}]*)\\}`))?.[1] ?? ''
      expect(rule, token).toContain(`font-size: ${size}px`)
      expect(rule, token).toContain(`${lineHeight}px`)
      expect(rule, token).not.toContain('var(--text-')
    }
    expect(out.match(/\.font-sans \{([^}]*)\}/)?.[1]).toContain(`font-family: ${FONT_SANS}`)
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

// 랜딩 :root 변수 (landing-v2 REQ-102). 값은 승인 시안 docs/mockups/landing-v2 그대로이고, 색은 @theme과 같다
const LANDING_COLORS: Record<string, string> = {
  '--ink': '#111827',
  '--ink-2': '#374151',
  '--muted': '#6b7280',
  '--line': '#e5e7eb',
  '--canvas': '#f7f8fa',
  '--surface': '#ffffff',
  '--accent': '#2563eb',
  '--accent-soft': '#eaf1fe',
  '--ok': '#166534',
  '--ok-soft': '#e7f6ec',
  '--danger': '#c2410c',
  '--danger-soft': '#fff1e8',
}
const LANDING_ROOT: Record<string, string> = {
  ...LANDING_COLORS,
  '--accent-tint': 'color-mix(in srgb, #2563eb 32%, #ffffff)',
  '--field': 'color-mix(in srgb, #6b7280 55%, #ffffff)',
  '--content-max': '1200px',
  '--gutter': '24px',
  '--font-sans': FONT_SANS,
}
// 옛 글꼴 변수(--font-num·--font-grotesk)를 쓰는 파일: 주석까지 글자 그대로, 예외 없이 본다(AC-102.4 · AC-113.3)
const fontVarOffenders = (files: Array<[string, string]>) =>
  files.filter(([, text]) => /--font-(num|grotesk)(?![\w-])/.test(text)).map(([rel]) => rel)

// 옛 랜딩 변수 이름(landing 명세 시절)
const OLD_LANDING_VARS = /--(bg-[\w-]+|border-card|text-(strong|body|muted)|(teal|violet|amber|pink|blue|coral|warn)-[\w-]+)(?![\w-])/

// layer 밖 :root 규칙들의 몸통
const landingRootBodies = () =>
  rules(outsideLayers(globals()))
    .filter(([s]) => s === ':root')
    .map(([, body]) => body)
const landingRoot = () => Object.fromEntries(landingRootBodies().flatMap(declarations))

describe('AC-102.1: 랜딩 :root 변수', () => {
  it('AC-102.1: layer 밖 랜딩 :root는 색 12·섞은 색 2·틀 2와 --font-sans(AC-102.4)만 둔다', () => {
    const bodies = landingRootBodies()
    expect(bodies.length, 'layer 밖 :root가 없다').toBeGreaterThan(0)
    const statements = bodies.flatMap((body) => body.split(';').map((d) => d.trim()).filter(Boolean))
    expect(statements.filter((d) => !d.startsWith('--')), ':root에 변수 말고 다른 선언이 있다').toEqual([])
    const decls = bodies.flatMap(declarations)
    const names = decls.map(([name]) => name)
    expect(names.length, '같은 변수를 두 번 선언했다').toBe(new Set(names).size)
    const lower = (entries: Array<[string, string]>) => Object.fromEntries(entries.map(([n, v]) => [n, v.toLowerCase()]))
    expect(lower(decls)).toEqual(lower(Object.entries(LANDING_ROOT)))
  })

  it('AC-102.1: 랜딩 색 12개는 @theme의 같은 이름 --color-* 값과 같다(대소문자 무시)', () => {
    const tokens = Object.fromEntries(theme().filter(([name]) => name.startsWith('--color-')))
    const vars = landingRoot()
    for (const name of Object.keys(LANDING_COLORS)) {
      const token = tokens[`--color-${name.slice(2)}`]
      expect(token, `@theme에 --color-${name.slice(2)}가 없다`).toBeDefined()
      expect(vars[name], `:root에 ${name}가 없다`).toBeDefined()
      expect(vars[name].toLowerCase(), name).toBe(token.toLowerCase())
    }
  })

  it('AC-102.1: 옛 랜딩 변수(--bg-*·--border-card·--text-strong·body·muted·--teal·violet·amber·pink·blue·coral·warn-*)를 선언하지도 쓰지도 않는다', () => {
    // @theme 안의 앱 토큰(--text-body: 14px 등)은 빼고 본다
    const css = removeBlocks(globals(), /@theme(\s+inline)?\s*\{/)
    expect([...css.matchAll(new RegExp(OLD_LANDING_VARS.source, 'g'))].map((m) => m[0])).toEqual([])
  })
})

describe('AC-102.2: body와 layer 밖 규칙', () => {
  it('AC-102.2: body는 바탕 surface·글자 ink·Plex 글꼴·keep-all·가로 넘침 clip', () => {
    const bodies = rules(outsideLayers(globals())).filter(([s]) => s === 'body')
    expect(bodies.length, 'body 규칙은 하나다').toBe(1)
    const body = bodies[0][1]
    expect(body).toMatch(/(^|[;\s])background:\s*var\(--surface\)\s*;/)
    expect(body).toMatch(/(^|[;\s])color:\s*var\(--ink\)\s*;/)
    expect(body).toMatch(/font-family:\s*var\(--font-sans\), system-ui, sans-serif\s*;/)
    expect(body).toMatch(/word-break:\s*keep-all\s*;/)
    expect(body).toMatch(/overflow-x:\s*clip\s*;/)
  })

  it('AC-102.2: layer 밖 선택자는 :root·body·모션 줄이기 블록뿐이다(요소·전체 선택자가 layer 밖이면 앱의 utilities를 이긴다)', () => {
    const outside = outsideLayers(globals())
    const selectors = rules(outside).map(([s]) => s.replace(/\s+/g, ' '))
    const allowed = new Set([':root', 'body', '@media (prefers-reduced-motion: reduce)'])
    expect(selectors.filter((s) => !allowed.has(s))).toEqual([])
    expect(outside).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/)
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

describe('AC-102.4: 글꼴은 IBM Plex Sans KR 하나', () => {
  it('AC-102.4: layout.tsx는 next/font/google에서 IBM_Plex_Sans_KR(400·500·600·700, --font-plex) 하나만 불러오고 Space_Grotesk가 없다', () => {
    const layout = read('src/app/layout.tsx')
    const imports = [...layout.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]next\/font\/google['"]/g)]
    expect(imports.length, 'next/font/google import는 하나다').toBe(1)
    expect(imports[0][1].split(',').map((name) => name.trim()).filter(Boolean)).toEqual(['IBM_Plex_Sans_KR'])
    expect(layout).not.toMatch(/next\/font\/local/)
    expect([...layout.matchAll(/IBM_Plex_Sans_KR\(/g)].length).toBe(1)
    const options = layout.match(/IBM_Plex_Sans_KR\(\{([\s\S]*?)\}\)/)?.[1] ?? ''
    expect(options.replace(/\s+/g, '').replace(/"/g, "'")).toContain("weight:['400','500','600','700']")
    expect(options).toMatch(/variable:\s*'--font-plex'/)
    expect(layout).not.toMatch(/Space_Grotesk|Grotesk/)
  })

  it('AC-102.4: :root가 --font-sans를 next/font 변수 --font-plex로 잇는다', () => {
    expect(landingRoot()['--font-sans']).toBe(FONT_SANS)
  })

  it('AC-102.4: --font-num·--font-grotesk는 시험 파일 밖 src/ 어디에도 없다(주석 포함)', () => {
    expect(fontVarOffenders(sourceFiles().map((rel) => [rel, read(rel)]))).toEqual([])
  })

  it('AC-113.3: 임시 예외 없이 모든 파일을 같은 규칙으로 본다 — 옛 변수를 쓰는 랜딩 모듈의 옛 font-family 줄과 주석도 잡는다', () => {
    const files: Array<[string, string]> = [
      ['src/components/landing/Old.module.css', '.x { color: var(--teal-text); font-family: var(--font-num), sans-serif; }'],
      ['src/components/landing/Note.module.css', '/* 예전에는 var(--font-grotesk)를 썼다 */\n.x { color: var(--ink); }'],
      ['src/components/landing/Ok.module.css', '.x { color: var(--teal-text); font-family: var(--font-sans); }'],
    ]
    expect(fontVarOffenders(files)).toEqual(['src/components/landing/Old.module.css', 'src/components/landing/Note.module.css'])
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
