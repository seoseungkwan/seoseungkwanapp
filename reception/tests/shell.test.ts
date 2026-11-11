// 접수 현황 화면 뼈대(TASK-16, REQ-1407): 색·글꼴 한 곳(theme.css), 모양(style.css), 바깥 주소 없음, 제목 글꼴, 홈 화면 추가, [새로 고침] 단추 크기.
// 화면 파일(reception/www/**)과 승인 시안(docs/mockups/reception-phone/*.dc.html, 2026-11-07 승인 목업 Paper.html)을 글자로 읽어 본다. 자료는 없다(뼈대만)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WWW = path.join(ROOT, 'reception', 'www')
const MOCKUPS = path.join(ROOT, 'docs', 'mockups', 'reception-phone')
const MOCKUP_PAGES = ['Main.dc.html', 'Detail.dc.html', 'Offline.dc.html', 'Tablet.dc.html']
/** 종이 진료기록부 목업(reception-paper, 사용자 승인 2026-11-07). 상표 시안 v12 뒤에 승인된 색(신환 표시 파랑 등)을 더 담는다 */
const PAPER_PAGE = 'Paper.html'
/** 화면이 글자로 읽는 파일(그림·글꼴·사용 허락 글 말고) */
const CODE_EXT = new Set(['.html', '.css', '.js', '.mjs', '.webmanifest', '.json', '.svg'])

/** 화면 파일 글자. 없으면 빈 글자(시험이 내용으로 실패하게) */
function read(rel: string): string {
  const file = path.join(WWW, rel)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

function wwwFiles(): string[] {
  if (!existsSync(WWW)) return []
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(path.relative(WWW, full).split(path.sep).join('/'))
    }
  }
  walk(WWW)
  return out.sort()
}

function codeFiles(): string[] {
  return wwwFiles().filter((rel) => CODE_EXT.has(path.extname(rel)))
}

// ---- 색 글자 ----------------------------------------------------------------------------------------

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi
const FUNC_COLOR = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi

function hexColors(text: string): string[] {
  return (text.match(HEX) ?? []).map(normalHex)
}

function normalHex(hex: string): string {
  let h = hex.slice(1).toUpperCase()
  if (h.length === 3) h = h.replace(/./g, (c) => c + c)
  return `#${h}`
}

function mockupColors(pages: string[] = MOCKUP_PAGES): Set<string> {
  const all = new Set<string>()
  for (const page of pages) for (const c of hexColors(readFileSync(path.join(MOCKUPS, page), 'utf8'))) all.add(c)
  return all
}

// ---- 작은 CSS 읽개 (주석 지우기·@media 안까지 규칙 펼치기) ---------------------------------------------

type Rule = { selector: string; media: string; decls: [string, string][] }

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function parseRules(css: string, media = ''): Rule[] {
  const rules: Rule[] = []
  let i = 0
  const text = stripComments(css)
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open < 0) break
    const head = text.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const body = text.slice(open + 1, j - 1)
    if (head.startsWith('@media')) rules.push(...parseRules(body, head))
    else {
      const decls = body
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const colon = d.indexOf(':')
          return [d.slice(0, colon).trim().toLowerCase(), d.slice(colon + 1).trim()] as [string, string]
        })
      rules.push({ selector: head, media, decls })
    }
    i = j
  }
  return rules
}

/** theme.css :root 값 표. var() 줄은 끝까지 따라가 실제 값으로 푼다 */
function rootTokens(): Map<string, string> {
  const tokens = new Map<string, string>()
  for (const rule of parseRules(read('theme.css'))) {
    if (rule.selector !== ':root' || rule.media !== '') continue
    for (const [name, value] of rule.decls) if (name.startsWith('--')) tokens.set(name, value)
  }
  return tokens
}

function resolve(tokens: Map<string, string>, value: string, seen = new Set<string>()): string {
  return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    if (seen.has(name)) throw new Error(`토큰 고리: ${name}`)
    const inner = tokens.get(name)
    if (inner === undefined) throw new Error(`없는 토큰: ${name}`)
    return resolve(tokens, inner, new Set([...seen, name]))
  })
}

function px(value: string): number {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())
  return m ? Number(m[1]) : Number.NaN
}

// ---- PNG·WOFF2 읽기 --------------------------------------------------------------------------------

function pngSize(file: string): { width: number; height: number } {
  const b = readFileSync(file)
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

/** WOFF2 → 표 이름 → 풀린 표 바이트 (glyf·loca처럼 바뀐 표는 바뀐 그대로. 여기서는 cmap·name만 쓴다) */
function woff2Tables(file: string): Map<string, Buffer> {
  const b = readFileSync(file)
  expect(b.toString('latin1', 0, 4)).toBe('wOF2')
  const known = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep']
  const numTables = b.readUInt16BE(12)
  let p = 48
  const base128 = () => {
    let v = 0
    for (let k = 0; k < 5; k++) {
      const byte = b[p++]
      v = v * 128 + (byte & 0x7f)
      if ((byte & 0x80) === 0) return v
    }
    throw new Error('UIntBase128가 너무 길다')
  }
  const dir: { tag: string; length: number }[] = []
  for (let t = 0; t < numTables; t++) {
    const flags = b[p++]
    const idx = flags & 0x3f
    let tag: string
    if (idx === 0x3f) {
      tag = b.toString('latin1', p, p + 4)
      p += 4
    } else tag = known[idx] ?? `#${idx}`
    const orig = base128()
    const version = (flags >> 6) & 3
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0
    dir.push({ tag, length: transformed ? base128() : orig })
  }
  const compressedSize = b.readUInt32BE(20)
  const data = brotliDecompressSync(b.subarray(p, p + compressedSize))
  const tables = new Map<string, Buffer>()
  let at = 0
  for (const { tag, length } of dir) {
    tables.set(tag, data.subarray(at, at + length))
    at += length
  }
  return tables
}

/** cmap에서 글리프가 있는(0이 아닌) 글자 번호 모음. 형식 4·12 */
function cmapCodepoints(cmap: Buffer): Set<number> {
  const out = new Set<number>()
  const n = cmap.readUInt16BE(2)
  for (let r = 0; r < n; r++) {
    const off = cmap.readUInt32BE(4 + r * 8 + 4)
    const format = cmap.readUInt16BE(off)
    if (format === 4) {
      const segX2 = cmap.readUInt16BE(off + 6)
      const ends = off + 14
      const starts = ends + segX2 + 2
      const deltas = starts + segX2
      const ranges = deltas + segX2
      for (let s = 0; s < segX2 / 2; s++) {
        const end = cmap.readUInt16BE(ends + s * 2)
        const start = cmap.readUInt16BE(starts + s * 2)
        const delta = cmap.readInt16BE(deltas + s * 2)
        const rangeAt = ranges + s * 2
        const range = cmap.readUInt16BE(rangeAt)
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number
          if (range === 0) glyph = (c + delta) & 0xffff
          else {
            const g = cmap.readUInt16BE(rangeAt + range + (c - start) * 2)
            glyph = g === 0 ? 0 : (g + delta) & 0xffff
          }
          if (glyph !== 0) out.add(c)
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(off + 12)
      for (let g = 0; g < groups; g++) {
        const at = off + 16 + g * 12
        const start = cmap.readUInt32BE(at)
        const end = cmap.readUInt32BE(at + 4)
        const first = cmap.readUInt32BE(at + 8)
        for (let c = start; c <= end; c++) if (first + (c - start) !== 0) out.add(c)
      }
    }
  }
  return out
}

/** KS X 1001 완성형 한글 2,350자 (EUC-KR B0A1–C8FE) */
function ksx1001Hangul(): Set<number> {
  const decoder = new TextDecoder('euc-kr')
  const out = new Set<number>()
  for (let hi = 0xb0; hi <= 0xc8; hi++)
    for (let lo = 0xa1; lo <= 0xfe; lo++) out.add(decoder.decode(Uint8Array.from([hi, lo])).codePointAt(0)!)
  return out
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const BODY_FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif'
/**
 * 제목 글꼴을 쓰는 곳: 머리 제목(목록·연결 끊김)과 환자 이름 제목(상세·태블릿 오른쪽),
 * 그리고 어레인지 승인 시안(Arrange.html, reception-arrange)의 머리 탭 단추(.view-btn → .tab)와 표의 환자 이름(.nm → .arr-name)
 */
const TITLE_CLASSES = ['.top-title', '.off-title', '.off-heading', '.detail-name', '.tab', '.arr-name']
/** 어레인지 승인 시안(docs/mockups/reception-arrange/Arrange.html, 2026-11-09)이 더한 색 여섯 (reception-arrange AC-3308.12) */
const ARRANGE_PAGE = path.join(ROOT, 'docs', 'mockups', 'reception-arrange', 'Arrange.html')
const ARRANGE_TOKENS = ['--sono-head', '--sono-col', '--carm-head', '--carm-col', '--ptup-bg', '--ptup-fg']
/**
 * 접수 현황 수정 묶음 승인 시안(docs/mockups/reception-memo-papers/Mock.html, 2026-11-11)이 더한 색의 토큰과 값
 * (reception-memo-papers AC-3401.1 진료보류 진한 노랑, AC-3403.6 어레인지 메모 빨강·펜 검정)
 */
const MEMO_PAPERS_PAGE = path.join(ROOT, 'docs', 'mockups', 'reception-memo-papers', 'Mock.html')
const MEMO_PAPERS_COLORS: Record<string, string> = {
  '--status-hold-bg': '#FFD43B',
  '--status-hold-line': '#C9A100',
  '--memo-red': '#E03131',
  '--memo-red-soft': '#FFF1F1',
  '--memo-ink': '#222222',
}
const STATUSES = ['wait', 'hold', 'pay', 'done', 'long', 'xray']
const TABLET = '(min-width: 1000px) and (orientation: landscape)'

describe('REQ-1407 접수 현황 화면 뼈대 (reception/www)', () => {
  it('AC-1407.7: 화면 파일이 있다(뼈대·상표·글꼴·로고)', () => {
    const files = wwwFiles()
    for (const f of [
      'index.html',
      'theme.css',
      'style.css',
      'dom.js',
      'manifest.webmanifest',
      'logo-mark.png',
      'logo-wordmark.png',
      'fonts/title.woff2',
      'fonts/OFL.txt',
    ])
      expect(files, f).toContain(f)
  })

  it('AC-1407.7: 색은 theme.css :root 값에만 있다. 다른 화면 파일과 theme.css의 :root 밖에는 색 글자(#…·rgb(·hsl( 등)가 없다', () => {
    const files = codeFiles()
    expect(files).toContain('style.css')
    for (const rel of files) {
      let text = read(rel)
      if (rel === 'theme.css') text = parseRules(text).filter((r) => r.selector !== ':root').map((r) => `${r.selector}{${r.decls.map((d) => d.join(':')).join(';')}}`).join('\n')
      expect(hexColors(text), `${rel}의 # 색`).toEqual([])
      expect(text.match(FUNC_COLOR) ?? [], `${rel}의 색 함수`).toEqual([])
    }
  })

  it('AC-1407.7: style.css의 값은 이름 색(white·black…)을 쓰지 않고 var(--…)·currentColor·transparent만 쓴다', () => {
    const named =
      /^(?:white|black|red|green|blue|yellow|orange|gray|grey|silver|navy|purple|lime|teal|olive|maroon|aqua|fuchsia|pink|brown|gold|ivory|beige|tan|khaki|crimson|coral|salmon|violet|indigo|cyan|magenta)$/i
    for (const rule of parseRules(read('style.css')))
      for (const [prop, value] of rule.decls)
        for (const word of value.split(/[\s,()/]+/)) expect(named.test(word), `${rule.selector} { ${prop}: ${value} }`).toBe(false)
  })

  it('AC-1407.7 · AC-1503.2 · AC-3308.12 · AC-3401.1: theme.css의 색은 승인된 의원 상표 시안(v12 Main·Detail·Offline·Tablet)의 색을 모두 담고(빠진 색 없음), 그 밖의 색은 승인 목업 Paper.html의 색과 어레인지 시안 Arrange.html의 새 칸 색 여섯, 수정 묶음 시안 Mock.html의 새 색뿐이다(지어낸 색 없음)', () => {
    const theme = new Set(hexColors(parseRules(read('theme.css')).filter((r) => r.selector === ':root').flatMap((r) => r.decls.map((d) => d[1])).join(' ')))
    const brand = mockupColors()
    const paper = mockupColors([PAPER_PAGE])
    expect(brand.size).toBeGreaterThan(10)
    expect(paper.size).toBeGreaterThan(10)
    // 어레인지 새 색: theme.css의 그 토큰 여섯 값이고 모두 Arrange.html에 있다
    const t = rootTokens()
    const arrangeSheet = new Set(hexColors(readFileSync(ARRANGE_PAGE, 'utf8')))
    const arrange = new Set(ARRANGE_TOKENS.map((name) => normalHex(t.get(name) ?? '#000')))
    for (const name of ARRANGE_TOKENS) expect(t.has(name), `${name}가 theme.css에 없다`).toBe(true)
    for (const c of arrange) expect(arrangeSheet.has(c), `${c}는 어레인지 시안에 없는 색이다`).toBe(true)
    // 수정 묶음 새 색: theme.css의 그 토큰 값이고 모두 Mock.html에 있다
    const memoSheet = new Set(hexColors(readFileSync(MEMO_PAPERS_PAGE, 'utf8')))
    for (const [name, value] of Object.entries(MEMO_PAPERS_COLORS)) {
      expect(resolve(t, t.get(name) ?? '#000').toUpperCase(), name).toBe(value)
      expect(memoSheet.has(value), `${value}는 수정 묶음 시안에 없는 색이다`).toBe(true)
    }
    const memo = new Set(Object.values(MEMO_PAPERS_COLORS))
    for (const c of brand) expect(theme, `상표 시안 색 ${c}가 theme.css에 없다`).toContain(c)
    for (const c of theme) expect(brand.has(c) || paper.has(c) || arrange.has(c) || memo.has(c), `${c}는 승인 시안·목업에 없는 색이다`).toBe(true)
    // 신환 표시 파랑은 Paper.html에서 왔다(상표 시안 v12에는 없다)
    expect(paper.has('#1D4ED8')).toBe(true)
    expect(brand.has('#1D4ED8')).toBe(false)
    expect(theme.has('#1D4ED8')).toBe(true)
  })

  it('AC-1407.7: 바탕·숯색·강조색(로고 노랑)은 시안 값이다', () => {
    const t = rootTokens()
    expect(resolve(t, 'var(--ground)').toUpperCase()).toBe('#F4F4F2')
    expect(resolve(t, 'var(--ink)').toUpperCase()).toBe('#333432')
    expect(resolve(t, 'var(--accent)').toUpperCase()).toBe('#DFDA06')
    expect(resolve(t, 'var(--surface)').toUpperCase()).toBe('#FFFFFF')
  })

  it('AC-1407.7: 상태 색(대기·보류·수납·수납완료·오래 기다림·X-ray 완료)의 채움과 테두리는 강조색(라임 노랑)과 다른 값이다', () => {
    const t = rootTokens()
    const accent = resolve(t, 'var(--accent)').toUpperCase()
    for (const s of STATUSES) {
      const bg = t.get(`--status-${s}-bg`)
      expect(bg, `--status-${s}-bg`).toBeDefined()
      expect(resolve(t, bg!).toUpperCase(), `--status-${s}-bg`).not.toBe(accent)
      expect(t.get(`--status-${s}-fg`), `--status-${s}-fg`).toBeDefined()
      const line = t.get(`--status-${s}-line`)
      if (line !== undefined) expect(resolve(t, line).toUpperCase(), `--status-${s}-line`).not.toBe(accent)
    }
    // style.css가 상태 토큰을 실제로 쓴다
    const style = read('style.css')
    for (const s of STATUSES) expect(style, `var(--status-${s}-bg)`).toContain(`var(--status-${s}-bg)`)
  })

  it('AC-3401.1: 진료보류 이름표는 진한 노랑(--status-hold-bg #FFD43B · --status-hold-fg var(--ink) · --status-hold-line #C9A100)이고, 로고 노랑·SONO 노랑·다른 상태 색과 다르다', () => {
    const t = rootTokens()
    expect(t.get('--status-hold-bg')?.toUpperCase()).toBe('#FFD43B')
    expect(t.get('--status-hold-fg')).toBe('var(--ink)')
    expect(t.get('--status-hold-line')?.toUpperCase()).toBe('#C9A100')
    const hold = [resolve(t, 'var(--status-hold-bg)').toUpperCase(), resolve(t, 'var(--status-hold-line)').toUpperCase()]
    const yellows = ['--accent', '--sono-head', '--sono-col'].map((name) => [name, resolve(t, `var(${name})`).toUpperCase()] as const)
    const others = STATUSES.filter((s) => s !== 'hold').flatMap((s) =>
      (['bg', 'line'] as const).filter((part) => t.has(`--status-${s}-${part}`)).map((part) => [`--status-${s}-${part}`, resolve(t, `var(--status-${s}-${part})`).toUpperCase()] as const),
    )
    for (const c of hold) for (const [name, value] of [...yellows, ...others]) expect(c, name).not.toBe(value)
    // 진료보류 이름표(목록·태블릿·어레인지·기록부가 같은 .status-hold를 쓴다)는 이 세 토큰을 쓴다
    const rule = parseRules(read('style.css')).filter((r) => r.selector.split(',').map((s) => s.trim()).includes('.status-hold') && r.media === '').flatMap((r) => r.decls)
    expect(rule.find(([p]) => p === 'background')?.[1]).toBe('var(--status-hold-bg)')
    expect(rule.find(([p]) => p === 'color')?.[1]).toBe('var(--status-hold-fg)')
    expect(rule.find(([p]) => p === 'border-color')?.[1]).toBe('var(--status-hold-line)')
    for (const file of ['board.js', 'arrange.js', 'charts.js', 'detail.js']) expect(read(file), file).toContain("hold: 'status-hold'")
  })

  it('AC-1503.2: 신환 표시 색 --new(#1D4ED8, 목업 Paper.html)·--on-new(#FFFFFF)는 theme.css에 있고, 상태 색(채움·글·테두리)·강조색(--accent)과 다르다', () => {
    const t = rootTokens()
    expect(t.has('--new')).toBe(true)
    expect(t.has('--on-new')).toBe(true)
    const fill = resolve(t, 'var(--new)').toUpperCase()
    const ink = resolve(t, 'var(--on-new)').toUpperCase()
    expect(fill).toBe('#1D4ED8')
    expect(ink).toBe('#FFFFFF')
    const accent = resolve(t, 'var(--accent)').toUpperCase()
    expect(fill).not.toBe(accent)
    expect(ink).not.toBe(accent)
    const status = (part: 'bg' | 'fg' | 'line') =>
      [...t.keys()].filter((name) => name.startsWith('--status-') && name.endsWith(`-${part}`)).map((name) => [name, resolve(t, `var(${name})`).toUpperCase()] as const)
    expect(status('bg').length).toBeGreaterThanOrEqual(STATUSES.length)
    // 표시 바탕은 어느 상태의 채움·글·테두리와도 다르다
    for (const [name, value] of [...status('bg'), ...status('fg'), ...status('line')]) expect(fill, name).not.toBe(value)
    // 표시 글은 어느 상태의 글과도 다르다
    for (const [name, value] of status('fg')) expect(ink, name).not.toBe(value)
    // 채움·글 짝이 어느 상태 이름표·칩과도 같지 않다
    for (const [name, bg] of status('bg')) {
      const fg = t.get(name.replace(/-bg$/, '-fg'))
      if (fg !== undefined) expect(`${fill}/${ink}`, name).not.toBe(`${bg}/${resolve(t, fg).toUpperCase()}`)
    }
    const style = stripComments(read('style.css'))
    expect(style).toContain('var(--new)')
    expect(style).toContain('var(--on-new)')
  })

  it('AC-1407.7: style.css는 theme.css에 있는 토큰만 쓰고, 폰 한 줄 흐름 + 태블릿 두 칸 모양을 함께 가진다', () => {
    const t = rootTokens()
    const style = stripComments(read('style.css'))
    const used = new Set([...style.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]))
    expect(used.size).toBeGreaterThan(10)
    for (const name of used) expect(t.has(name), `${name}가 theme.css :root에 없다`).toBe(true)
    expect(style).not.toMatch(/(^|[;{\s])--[\w-]+\s*:/) // 토큰은 theme.css에서만 만든다
    expect(parseRules(style).some((r) => r.media.includes(TABLET))).toBe(true)
  })

  it('AC-1407.8: 본문 글꼴은 기기 글꼴, 제목 글꼴은 품은 Black Han Sans이고 없는 글자는 본문 글꼴로 떨어진다. 글꼴 이름은 theme.css에만 있다', () => {
    const t = rootTokens()
    expect(t.get('--font-body')).toBe(BODY_FONT)
    expect(t.get('--font-title')).toBe('"Black Han Sans"')
    const theme = stripComments(read('theme.css'))
    const face = /@font-face\s*{([^}]*)}/.exec(theme)
    expect(face, '@font-face').not.toBeNull()
    expect(face![1]).toMatch(/font-family:\s*"Black Han Sans"/)
    expect(face![1]).toMatch(/src:\s*url\("\/fonts\/title\.woff2"\)\s*format\("woff2"\)/)
    expect(face![1]).toMatch(/font-display:\s*swap/)
    // 다른 파일은 글꼴 이름을 쓰지 않고 var()만
    for (const rel of codeFiles().filter((f) => f !== 'theme.css')) expect(stripComments(read(rel)), rel).not.toMatch(/@font-face|Black Han Sans|Noto Sans KR/)
    for (const rule of parseRules(read('style.css')))
      for (const [prop, value] of rule.decls) {
        expect(prop, rule.selector).not.toBe('font')
        if (prop === 'font-family') expect(value, rule.selector).toMatch(/^(?:inherit|var\(--font-[\w-]+\)(?:,\s*var\(--font-[\w-]+\))*)$/)
      }
  })

  it('AC-1407.8: 제목 글꼴은 머리 제목과 환자 이름 제목에만 쓰고, 늘 본문 글꼴을 뒤에 둔다', () => {
    const rules = parseRules(read('style.css'))
    const titled = rules.filter((r) => r.decls.some(([, v]) => v.includes('var(--font-title)')))
    expect(titled.length).toBeGreaterThan(0)
    for (const r of titled) {
      for (const sel of r.selector.split(',').map((s) => s.trim())) expect(TITLE_CLASSES, sel).toContain(sel.split(/\s+/).pop())
      expect(r.decls.find(([p]) => p === 'font-family')?.[1]).toBe('var(--font-title), var(--font-body)')
    }
    const covered = titled.flatMap((r) => r.selector.split(',').map((s) => s.trim().split(/\s+/).pop()))
    for (const c of TITLE_CLASSES) expect(covered, c).toContain(c)
    // 본문은 body가 기기 글꼴
    const body = rules.find((r) => r.selector === 'body' && r.media === '')
    expect(body?.decls.find(([p]) => p === 'font-family')?.[1]).toBe('var(--font-body)')
  })

  it('AC-1407.8: 제목 글꼴 파일은 Black Han Sans의 KS X 1001 완성형 한글 2,350자 + 영문·숫자만 담은 woff2 하나(600KB 이하)이고 OFL 사용 허락 글이 함께 있다', () => {
    const file = path.join(WWW, 'fonts', 'title.woff2')
    expect(existsSync(file), 'fonts/title.woff2').toBe(true)
    expect(statSync(file).size).toBeLessThanOrEqual(600 * 1024)
    const tables = woff2Tables(file)
    const name = tables.get('name')!
    expect(name.includes(Buffer.from('Black Han Sans', 'utf16le').swap16())).toBe(true)
    const want = ksx1001Hangul()
    expect(want.size).toBe(2350)
    for (const c of ALNUM) want.add(c.codePointAt(0)!)
    expect([...cmapCodepoints(tables.get('cmap')!)].sort((a, b) => a - b)).toEqual([...want].sort((a, b) => a - b))
    const ofl = read('fonts/OFL.txt')
    expect(ofl).toContain('SIL Open Font License, Version 1.1')
    expect(ofl).toContain('Black Han Sans')
    expect(wwwFiles().filter((f) => f.startsWith('fonts/')).sort()).toEqual(['fonts/OFL.txt', 'fonts/title.woff2'])
    expect(existsSync(path.join(ROOT, 'reception', 'fonts', 'make-title-font.py')), 'reception/fonts/make-title-font.py').toBe(true)
  })

  it('AC-1407.8: 화면 파일은 바깥 주소에서 아무것도 받지 않는다(http·// 없음, 그림·글꼴·스크립트는 / 로 시작하는 같은 PC 주소)', () => {
    const files = codeFiles()
    expect(files.length).toBeGreaterThanOrEqual(5)
    for (const rel of files) {
      // SVG 이름 공간 이름(dom.js svg())은 주소 모양의 이름표일 뿐 받아 오지 않는다. 그 글 하나만 뺀다
      const text = read(rel).replaceAll(`'http://www.w3.org/2000/svg'`, `'svg-ns'`)
      expect(text, rel).not.toMatch(/https?:/i)
      if (path.extname(rel) === '.js') expect(text, rel).not.toMatch(/['"`]\s*\/\//)
      else expect(text, rel).not.toMatch(/\/\//)
      for (const m of text.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)) expect(m[1], `${rel}: ${m[0]}`).toMatch(/^(?:\/(?![/\\])|#)/)
      for (const m of text.matchAll(/url\(\s*["']?([^"')]*)/g)) expect(m[1], `${rel}: ${m[0]}`).toMatch(/^\/(?![/\\])/)
    }
  })

  it('AC-1407.8: 로고는 승인 시안 폴더의 그림 파일 사본이다', () => {
    for (const logo of ['logo-mark.png', 'logo-wordmark.png'])
      expect(readFileSync(path.join(WWW, logo)).equals(readFileSync(path.join(MOCKUPS, logo))), logo).toBe(true)
  })

  it('AC-1407.9: index.html은 제목 "접수 현황", theme.css → style.css → app.js(module), 매니페스트·apple-touch-icon을 부르고 인라인 스타일·스크립트가 없다(CSP)', () => {
    const html = read('index.html')
    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).toMatch(/<html lang="ko">/)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1[^"]*">/)
    expect(html).toContain('<title>접수 현황</title>')
    expect((html.match(/<title>/g) ?? []).length).toBe(1)
    const theme = html.indexOf('<link rel="stylesheet" href="/theme.css">')
    const style = html.indexOf('<link rel="stylesheet" href="/style.css">')
    expect(theme).toBeGreaterThan(0)
    expect(style).toBeGreaterThan(theme)
    expect(html).toContain('<script type="module" src="/app.js"></script>')
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">')
    expect(html).toContain('<link rel="apple-touch-icon" href="/logo-mark.png">')
    expect(html).not.toMatch(/<style|\sstyle=|\son[a-z]+=/i)
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      expect(m[1], 'script는 파일만').toMatch(/\ssrc="/)
      expect(m[2].trim()).toBe('')
    }
    expect(html).toContain('id="app"')
  })

  it('AC-1407.9: manifest.webmanifest는 이름 "접수 현황", display standalone, 로고 아이콘(실제 그림 크기)이다. 서비스 워커는 없다', () => {
    const m = JSON.parse(read('manifest.webmanifest')) as Record<string, unknown>
    expect(m.name).toBe('접수 현황')
    expect(m.short_name).toBe('접수 현황')
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.scope).toBe('/')
    expect(m.lang).toBe('ko')
    const icons = m.icons as { src: string; sizes: string; type: string }[]
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) {
      expect(icon.src).toMatch(/^\/[\w-]+\.png$/)
      const { width, height } = pngSize(path.join(WWW, icon.src.slice(1)))
      expect(icon.sizes).toBe(`${width}x${height}`)
      expect(icon.type).toBe('image/png')
    }
    expect(icons.map((i) => i.src)).toContain('/logo-mark.png')
    expect(m).not.toHaveProperty('serviceworker')
    for (const rel of wwwFiles()) expect(rel, '서비스 워커 파일').not.toMatch(/(^|\/)(sw|service-?worker)[\w.-]*\.js$/i)
    for (const rel of codeFiles()) expect(read(rel), rel).not.toMatch(/serviceWorker/)
  })

  it('AC-1407.10: [새로 고침] 단추는 누르는 곳 가로·세로 44px 이상이고 노랑 채움이 아니다(테두리 단추)', () => {
    const rules = parseRules(read('style.css')).filter((r) => r.selector.split(',').some((s) => /\.refresh(?![\w-])(?!::)/.test(s.trim()) && !s.includes('::')))
    expect(rules.length).toBeGreaterThan(0)
    const mins = (prop: string) => rules.flatMap((r) => r.decls.filter(([p]) => p === prop).map(([, v]) => px(v)))
    expect(mins('min-width').length).toBeGreaterThan(0)
    expect(mins('min-height').length).toBeGreaterThan(0)
    for (const v of [...mins('min-width'), ...mins('min-height')]) expect(v).toBeGreaterThanOrEqual(44)
    for (const r of rules)
      for (const [p, v] of r.decls) {
        if (p === 'background' || p === 'background-color') expect(v, r.selector).not.toContain('--accent')
        if (p === 'width' || p === 'height' || p === 'max-width' || p === 'max-height') expect(px(v), `${r.selector} ${p}`).not.toBeLessThan(44)
      }
    expect(rules.some((r) => r.decls.some(([p, v]) => p.startsWith('border') && v.includes('var(--')))).toBe(true)
  })

  it('AC-1407.10: [새로 고침] 그림은 단추 안 svg.refresh-icon 하나다. style.css가 .refresh에 ::before·::after 그림을 더 그리지 않는다(그림 둘이 겹쳐 작은 네모가 보이지 않게)', () => {
    const rules = parseRules(read('style.css'))
    const drawn = rules.filter((r) => r.selector.split(',').some((s) => /\.refresh(?![\w-])[^,]*::?(?:before|after)\b/.test(s.trim())))
    expect(drawn.map((r) => r.selector)).toEqual([])
    expect(rules.some((r) => r.selector.split(',').some((s) => s.trim() === '.refresh-icon'))).toBe(true)
  })

  it('AC-1407.10: 시안의 누르는 단추(칸·X-ray 완료·표시 취소·더 보기·돌아가기)도 44px 이상이다', () => {
    const rules = parseRules(read('style.css'))
    for (const cls of ['.queue', '.tile', '.btn-dark', '.btn-light', '.more', '.back']) {
      const heights = rules
        .filter((r) => r.selector.split(',').some((s) => s.trim().split(/\s+/).pop() === cls))
        .flatMap((r) => r.decls.filter(([p]) => p === 'min-height').map(([, v]) => px(v)))
      expect(heights.length, cls).toBeGreaterThan(0)
      for (const h of heights) expect(h, cls).toBeGreaterThanOrEqual(44)
    }
  })
})
