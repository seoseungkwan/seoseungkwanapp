import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 글꼴 Pretendard (REQ-203, ADR-019, specs/b2b-redesign TASK-2). 파일과 layout.tsx를 글자로 읽어 본다
const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const FONT_DIR = 'src/app/fonts'

// npm pretendard@1.3.9 꾸러미의 dist/web/static/woff2-subset/ 세 파일(고치지 않음)과 dist/LICENSE.txt
const FONT_FILES: Record<string, string> = {
  'Pretendard-Regular.subset.woff2': '01dd73155fdfab7ce9b25224523e85a96927e21aef97f21957d41f1bfa7e3878',
  'Pretendard-Medium.subset.woff2': '6f4e897a59138903ae64e814df059790cf0e0ff73b8595810145aee23204469f',
  'Pretendard-SemiBold.subset.woff2': '4247dc5e260b92640c2cbd0e75091154647b71e1d5884116655e2903468c54cc',
}
const LICENSE_SHA256 = 'b04538c9abec39a3db75108cf0af0fd9c77032fe8aa2cf38345b4d250e98e38e'
const FONT_BYTES_MAX = 810_000

const fontDirFiles = () => readdirSync(join(ROOT, FONT_DIR)).sort()
const bytes = (name: string) => readFileSync(join(ROOT, FONT_DIR, name))
const sha256 = (name: string) => createHash('sha256').update(bytes(name)).digest('hex')

// 시험 파일 밖 src/ 소스 전부(상대 경로)
function sourceFiles(dir = 'src'): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(rel)
    if (/\.test\.tsx?$/.test(entry.name)) return []
    return /\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(entry.name) ? [rel] : []
  })
}

// 옛 글꼴의 흔적: 주석까지 글자 그대로, 예외 없이 본다
const OLD_FONT = /next\/font\/google|IBM_Plex|Space_Grotesk|--font-(plex|num|grotesk)(?![\w-])/
const oldFontOffenders = (files: Array<[string, string]>) =>
  files.filter(([, text]) => OLD_FONT.test(text)).map(([rel]) => rel)

// open 자리의 여는 괄호와 짝인 닫는 괄호까지의 안쪽 글자
function inside(text: string, open: number): string {
  const pair: Record<string, string> = { '(': ')', '{': '}', '[': ']' }
  const close = pair[text[open]]
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === text[open]) depth++
    if (text[i] === close && --depth === 0) return text.slice(open + 1, i)
  }
  return ''
}

const layout = () => read('src/app/layout.tsx')
// localFont({ ... })의 옵션 글자(큰따옴표는 작은따옴표로)
const localFontOptions = () => {
  const text = layout().replace(/"/g, "'")
  const call = text.indexOf('localFont(')
  return call < 0 ? '' : inside(text, text.indexOf('{', call))
}
const option = (options: string, key: string) => options.match(new RegExp(`(?:^|[\\s,{])${key}:\\s*'([^']*)'`))?.[1]

describe('AC-203.1: src/app/fonts/의 Pretendard 파일', () => {
  it('AC-203.1: 폴더에는 글꼴 세 파일과 OFL.txt만 있다', () => {
    expect(fontDirFiles()).toEqual([...Object.keys(FONT_FILES), 'OFL.txt'].sort())
  })

  it.each(Object.entries(FONT_FILES))('AC-203.1: %s는 pretendard@1.3.9 꾸러미 파일 그대로다(sha256)', (name, hash) => {
    expect(sha256(name)).toBe(hash)
  })

  it('AC-203.1: OFL.txt는 같은 꾸러미의 dist/LICENSE.txt(SIL OFL 1.1, Reserved Font Name Pretendard) 그대로다(sha256)', () => {
    expect(sha256('OFL.txt')).toBe(LICENSE_SHA256)
    const license = bytes('OFL.txt').toString('utf8')
    expect(license).toContain('SIL Open Font License, Version 1.1')
    expect(license).toContain('Reserved Font Name')
    expect(license).toContain('Pretendard')
  })

  it('AC-203.1: 글꼴 세 파일의 합은 810,000바이트 이하다', () => {
    const total = Object.keys(FONT_FILES).reduce((sum, name) => sum + bytes(name).length, 0)
    expect(total).toBeLessThanOrEqual(FONT_BYTES_MAX)
  })
})

describe('AC-203.2: layout.tsx는 next/font/local로 Pretendard를 낸다', () => {
  it('AC-203.2: next/font/local의 localFont를 한 번 불러와 한 번 부른다', () => {
    const text = layout()
    expect([...text.matchAll(/import\s+localFont\s+from\s+['"]next\/font\/local['"]/g)].length).toBe(1)
    expect([...text.matchAll(/from\s+['"]next\/font\//g)].length, 'next/font import는 local 하나다').toBe(1)
    expect([...text.matchAll(/localFont\(/g)].length).toBe(1)
  })

  it("AC-203.2: src는 세 파일(400·500·600, style 'normal')이다", () => {
    const options = localFontOptions()
    const srcAt = options.search(/(?:^|[\s,])src:\s*\[/)
    expect(srcAt, 'src 배열이 없다').toBeGreaterThanOrEqual(0)
    const src = inside(options, options.indexOf('[', srcAt))
    const entries = [...src.matchAll(/\{([^}]*)\}/g)].map(([, body]) => ({
      path: option(body, 'path'),
      weight: option(body, 'weight'),
      style: option(body, 'style'),
    }))
    expect(entries).toEqual([
      { path: './fonts/Pretendard-Regular.subset.woff2', weight: '400', style: 'normal' },
      { path: './fonts/Pretendard-Medium.subset.woff2', weight: '500', style: 'normal' },
      { path: './fonts/Pretendard-SemiBold.subset.woff2', weight: '600', style: 'normal' },
    ])
  })

  it("AC-203.2: display 'swap'·variable '--font-pretendard'이고 <html lang=\"ko\">에 그 변수 class가 붙는다", () => {
    const options = localFontOptions()
    expect(option(options, 'display')).toBe('swap')
    expect(option(options, 'variable')).toBe('--font-pretendard')
    const name = layout().match(/const\s+(\w+)\s*=\s*localFont\(/)?.[1]
    expect(name, 'localFont 결과를 담은 이름이 없다').toBeDefined()
    expect(layout()).toContain(`<html lang="ko" className={${name}.variable}>`)
  })

  it('AC-203.2: 시험 파일 밖 src/에 next/font/google·IBM_Plex·Space_Grotesk·--font-plex·--font-num·--font-grotesk가 없다(주석 포함)', () => {
    expect(oldFontOffenders(sourceFiles().map((rel) => [rel, read(rel)]))).toEqual([])
  })

  it('AC-203.2: 옛 글꼴 검사는 예외 없이 코드와 주석을 모두 잡는다', () => {
    const files: Array<[string, string]> = [
      ['src/app/a.tsx', "import { IBM_Plex_Sans_KR } from 'next/font/google'"],
      ['src/app/b.tsx', "const x = Space_Grotesk({ variable: '--font-grotesk' })"],
      ['src/app/c.css', ':root { --font-sans: var(--font-plex), sans-serif; }'],
      ['src/components/landing/D.module.css', '/* 예전에는 var(--font-num)을 썼다 */\n.x { color: var(--ink); }'],
      ['src/components/landing/Ok.module.css', '.x { font-family: var(--font-sans); --font-plexus: 1; }'],
    ]
    expect(oldFontOffenders(files)).toEqual(['src/app/a.tsx', 'src/app/b.tsx', 'src/app/c.css', 'src/components/landing/D.module.css'])
  })
})

// ---------- AC-203.3: 굵기는 400·500·600만 (글꼴 파일이 세 굵기뿐 — 다른 굵기는 가짜 굵게가 된다) ----------
// 대시보드 두 폴더도 본다(지금 font-semibold뿐이라 그대로 통과한다, b2b-redesign design.md '대시보드 본문 빼기')

// Tailwind 굵기 클래스 가운데 400·500·600 밖의 것(변형 접두사가 붙어도). 앞 글자가 낱말·-이면 잡지 않는다
const BAD_WEIGHT_CLASS = /(?<![\w-])font-(?:extrabold|bold|black|extralight|light|thin)(?![\w-])/g
const WEIGHTS_OK = new Set(['400', '500', '600'])
const withoutCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
// CSS의 font-weight 값과 font 줄임 속성 안의 굵기 낱말(숫자 100~900·bold·bolder·lighter)
function cssWeights(css: string): string[] {
  const text = withoutCssComments(css)
  const weights = [...text.matchAll(/(?<![\w-])font-weight\s*:\s*([^;}]+)/g)].map((m) => m[1].trim())
  const shorthand = [...text.matchAll(/(?<![\w-])font\s*:\s*([^;}]+)/g)].flatMap((m) => m[1].match(/(?<![\w.-])(?:[1-9]00|bold|bolder|lighter)(?![\w.-])/g) ?? [])
  return [...weights, ...shorthand]
}
const badWeightsIn = (rel: string, text: string): string[] =>
  rel.endsWith('.css')
    ? cssWeights(text).filter((w) => !WEIGHTS_OK.has(w)).map((w) => `${rel}: font-weight ${w}`)
    : (text.match(BAD_WEIGHT_CLASS) ?? []).map((cls) => `${rel}: ${cls}`)

// 선택자가 정확히 sel인 규칙의 몸통(주석 뺀 CSS, 맨 바깥과 @layer 안 모두)
const ruleBodies = (css: string, sel: string) =>
  [...withoutCssComments(css).matchAll(/(?:^|[}{;\s])([^{};]+)\{([^{}]*)\}/g)].filter(([, s]) => s.trim() === sel).map(([, , body]) => body)

describe('AC-203.3: 굵기는 400·500·600만, 숫자는 고정폭', () => {
  it('AC-203.3: 검사 규칙 자체가 잡아야 할 것을 잡는다', () => {
    const bad: Array<[string, string]> = [
      ['src/a.tsx', '<b className="font-bold">x</b>'],
      ['src/b.ts', "const x = 'md:font-extrabold text-ink'"],
      ['src/c.tsx', '<p className="font-black" />'],
      ['src/d.tsx', '<p className="hover:font-light" />'],
      ['src/e.ts', "const y = 'font-extralight font-thin'"],
      ['src/f.module.css', '.x { font-weight: 700; }'],
      ['src/g.module.css', '.x { font-weight: bold }'],
      ['src/h.module.css', '.x { font-weight: 300; }'],
      ['src/i.css', '.x { font: 700 16px/24px var(--font-ui); }'],
    ]
    for (const [rel, text] of bad) expect(badWeightsIn(rel, text), rel).not.toEqual([])
    const ok: Array<[string, string]> = [
      ['src/a.tsx', '<b className="font-semibold font-medium font-normal font-sans">x</b>'],
      ['src/b.ts', "const x = '--font-bold-ish tabular-nums'"],
      ['src/f.module.css', '.x { font-weight: 600; } .y { font-weight: 400 } /* font-weight: 700 */'],
      ['src/i.css', '.app-ui :where(button) { font: inherit; }'],
    ]
    for (const [rel, text] of ok) expect(badWeightsIn(rel, text), rel).toEqual([])
  })

  it('AC-203.3: 시험 파일 밖 src/(대시보드 두 폴더 포함)의 TSX·TS에 font-bold·font-extrabold·font-black·font-light·font-extralight·font-thin이 없고, CSS의 font-weight는 400·500·600뿐이다', () => {
    const files = sourceFiles()
    expect(files).toEqual(
      expect.arrayContaining(['src/app/globals.css', 'src/components/landing/base.module.css', 'src/components/dashboard/DashboardEmpty.tsx', 'src/components/ui/classes.ts']),
    )
    expect(files.flatMap((rel) => badWeightsIn(rel, read(rel)))).toEqual([])
    // 빈 검사가 아니다: 랜딩 CSS에 굵기 선언이 있다
    expect(cssWeights(read('src/components/landing/base.module.css')).length).toBeGreaterThan(0)
  })

  it('AC-203.3: .app-ui(globals.css)와 랜딩 뿌리 .root(base.module.css)는 font-variant-numeric: tabular-nums다', () => {
    const appUi = ruleBodies(read('src/app/globals.css'), '.app-ui')
    expect(appUi.length, '.app-ui 규칙이 없다').toBeGreaterThan(0)
    expect(appUi.some((body) => /font-variant-numeric:\s*tabular-nums/.test(body))).toBe(true)
    const root = ruleBodies(read('src/components/landing/base.module.css'), '.root')
    expect(root.length, '.root 규칙이 없다').toBeGreaterThan(0)
    expect(root.some((body) => /font-variant-numeric:\s*tabular-nums/.test(body))).toBe(true)
  })
})
