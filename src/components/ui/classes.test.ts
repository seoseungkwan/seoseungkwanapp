import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ui } from './classes'

// 앱 화면 공통 모양 (REQ-013, docs/UI_GUIDE.md '앱 화면', specs/auth/design.md '모양 시험은 클래스로').
// jsdom은 CSS를 계산하지 않는다 → 정해 둔 클래스가 있는지, 쓰면 안 되는 클래스가 없는지를 본다. 보이는 모양은 스크린샷(TASK-18)
const ROOT = process.cwd()

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const has = (classes: string, ...wanted: string[]) => wanted.every((t) => tokens(classes).includes(t))

// ui의 모든 끝 값: ['button.primary', '…클래스…']
function leaves(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) => leaves(v, path ? `${path}.${key}` : key))
}
const ALL = leaves(ui)

// 'max-md:hover:bg-ink' → 변형 ['max-md', 'hover'], 유틸리티 'bg-ink'
const split = (token: string) => {
  const parts = token.split(':')
  return { variants: parts.slice(0, -1), utility: parts[parts.length - 1] }
}
const FOCUS = new Set(['focus', 'focus-visible', 'focus-within'])
const isFocusToken = (token: string) => split(token).variants.some((v) => FOCUS.has(v))

type Named = Array<[string, string]>
const BUTTONS: Named = Object.entries(ui.button)
const CHIPS: Named = Object.entries(ui.chip)
const named = (prefix: string, entries: Named): Named => entries.map(([name, value]) => [`${prefix}.${name}`, value])

describe('AC-013.3: 모서리 — 카드·패널·단추·입력란은 6px(rounded-card), 칩·체크 상자는 4px(rounded-chip)', () => {
  it.each<[string, string]>([
    ['card', ui.card],
    ['panel', ui.panel],
    ['input', ui.input],
    ['readonly', ui.readonly],
    ['layer', ui.layer],
    ...named('button', BUTTONS),
  ])('AC-013.3: %s는 rounded-card', (_name, value) => {
    expect(has(value, 'rounded-card')).toBe(true)
    expect(has(value, 'rounded-chip')).toBe(false)
  })

  it.each<[string, string]>([['checkbox', ui.checkbox], ...named('chip', CHIPS)])(
    'AC-013.3: %s는 rounded-chip',
    (_name, value) => {
      expect(has(value, 'rounded-chip')).toBe(true)
      expect(has(value, 'rounded-card')).toBe(false)
    },
  )

  it('AC-013.3: 모서리는 두 가지뿐(999px·20px 같은 랜딩 모양 없음)', () => {
    for (const [path, value] of ALL) {
      for (const token of tokens(value)) {
        const { utility } = split(token)
        if (utility.startsWith('rounded')) expect(['rounded-card', 'rounded-chip'], `${path}: ${token}`).toContain(utility)
      }
    }
  })
})

describe('AC-013.3: 그림자 — 떠 있는 층(layer)에만 shadow-float', () => {
  it('AC-013.3: layer는 shadow-float 하나', () => {
    const shadows = tokens(ui.layer).filter((t) => split(t).utility.startsWith('shadow'))
    expect(shadows).toEqual(['shadow-float'])
  })

  it('AC-013.3: 카드·패널·단추·입력란·칩·표에는 그림자가 없다', () => {
    for (const [path, value] of ALL) {
      if (path === 'layer') continue
      const shadows = tokens(value).filter((t) => split(t).utility.startsWith('shadow'))
      expect(shadows, path).toEqual([])
    }
  })
})

describe('AC-013.3: 강조색(accent)은 초점 고리·글자 단추·체크한 체크 상자·진행중 칩에만', () => {
  it('AC-013.3: 초점 고리는 2px accent, 2px 띄움', () => {
    expect(has(ui.focusRing, 'focus-visible:outline-2', 'focus-visible:outline-offset-2', 'focus-visible:outline-accent')).toBe(true)
  })

  it('AC-013.3: 글자 단추·링크는 accent 글자, 바탕 없음', () => {
    expect(has(ui.textButton, 'text-accent')).toBe(true)
    expect(tokens(ui.textButton).filter((t) => split(t).utility.startsWith('bg-'))).toEqual([])
  })

  it('AC-013.3: 체크 상자는 체크했을 때만 accent 바탕(+ 흰 체크)', () => {
    expect(has(ui.checkbox, 'checked:bg-accent', 'checked:border-accent')).toBe(true)
    for (const token of tokens(ui.checkbox).filter((t) => t.includes('accent'))) {
      const { variants } = split(token)
      expect(variants.includes('checked') || isFocusToken(token), token).toBe(true)
    }
    expect(has(ui.checkboxMark, 'text-surface', 'peer-checked:block', 'hidden')).toBe(true)
    expect(has(ui.checkbox, 'peer')).toBe(true)
  })

  it('AC-013.3: 진행중 칩은 accent / accent-soft', () => {
    expect(has(ui.chip.progress, 'text-accent', 'bg-accent-soft')).toBe(true)
  })

  it('AC-013.3: 그 밖(주·보조·위험 단추, 다른 칩, 카드·패널, 입력란 바탕·테두리, 표)에는 초점 표시 말고는 accent가 없다', () => {
    const allowed = new Set(['textButton', 'checkbox', 'chip.progress', 'focusRing'])
    for (const [path, value] of ALL) {
      if (allowed.has(path)) continue
      const accents = tokens(value).filter((t) => t.includes('accent') && !isFocusToken(t))
      expect(accents, path).toEqual([])
    }
  })

  it('AC-013.3: 단추·체크 상자·글자 단추는 같은 초점 고리를 쓴다', () => {
    const interactive: Named = [...BUTTONS, ['textButton', ui.textButton], ['checkbox', ui.checkbox]]
    for (const [path, value] of interactive) {
      expect(has(value, ...tokens(ui.focusRing)), path).toBe(true)
    }
  })

  it('AC-013.3: 입력란 초점은 테두리 accent + 1px accent 고리, 오류는 테두리 danger', () => {
    expect(has(ui.input, 'focus-visible:border-accent', 'focus-visible:ring-1', 'focus-visible:ring-accent')).toBe(true)
    expect(has(ui.input, 'border', 'border-muted/55', 'bg-surface', 'aria-invalid:border-danger')).toBe(true)
    expect(has(ui.fieldError, 'text-caption', 'font-medium', 'text-danger')).toBe(true)
  })
})

describe('AC-013.3: 단추·칩 색 (UI_GUIDE 단추·칩 표)', () => {
  it('AC-013.3: 주 단추는 ink 바탕·흰 글자, 보조 단추는 surface·1px line·ink, 위험 단추는 보조 모양 + danger 글자', () => {
    for (const value of [ui.button.primary, ui.button.primarySmall]) {
      expect(has(value, 'bg-ink', 'text-surface', 'border-transparent')).toBe(true)
    }
    for (const value of [ui.button.secondary, ui.button.secondarySmall]) {
      expect(has(value, 'bg-surface', 'border', 'border-line', 'text-ink')).toBe(true)
    }
    for (const value of [ui.button.danger, ui.button.dangerSmall]) {
      expect(has(value, 'bg-surface', 'border', 'border-line', 'text-danger')).toBe(true)
    }
  })

  it('AC-013.3: 완료 ok/ok-soft, 대기 muted/canvas/line, 거절 danger/danger-soft, 범주 ink-2/surface/line', () => {
    expect(has(ui.chip.done, 'text-ok', 'bg-ok-soft')).toBe(true)
    expect(has(ui.chip.waiting, 'text-muted', 'bg-canvas', 'border-line')).toBe(true)
    expect(has(ui.chip.rejected, 'text-danger', 'bg-danger-soft')).toBe(true)
    expect(has(ui.chip.neutral, 'text-ink-2', 'bg-surface', 'border-line')).toBe(true)
    expect(has(ui.chip.sample, 'text-muted', 'bg-surface', 'border-line')).toBe(true)
  })

  it('AC-013.3: 칩은 모두 높이 22px·좌우 7px·caption 500·1px 테두리', () => {
    for (const [name, value] of CHIPS) {
      expect(has(value, 'h-5.5', 'px-1.75', 'text-caption', 'font-medium', 'border'), name).toBe(true)
    }
  })

  it('AC-013.3: 카드·패널은 흰 바탕 + 1px line', () => {
    for (const value of [ui.card, ui.panel, ui.layer]) expect(has(value, 'bg-surface', 'border', 'border-line')).toBe(true)
  })

  it('AC-013.3: 단추 묶음은 flex 크기(flex-·grow·shrink·basis)를 정하지 않는다 — 놓는 자리(flex-[1_1_160px]·max-md:flex-1)가 정해도 같은 속성 클래스가 둘 겹치지 않는다', () => {
    const FLEX_SIZE = /^(flex-(?!col|row|wrap|nowrap)|grow|shrink|basis-)/
    for (const [name, value] of BUTTONS) {
      expect(tokens(value).filter((t) => FLEX_SIZE.test(split(t).utility)), name).toEqual([])
    }
  })
})

describe('AC-013.4: 폰(768px 미만) 누름 영역 44px·입력란 16px', () => {
  // Tailwind 간격 1 = 4px → 11 = 44px. max-md: = 768px 미만
  const tall = (value: string) => has(value, 'max-md:h-11') || has(value, 'max-md:min-h-11')

  it.each<[string, string]>([
    ...named('button', BUTTONS),
    ['textButton', ui.textButton],
    ['input', ui.input],
    ['readonly', ui.readonly],
  ])('AC-013.4: %s는 폰에서 44px 이상', (_name, value) => {
    expect(tall(value)).toBe(true)
  })

  it('AC-013.4: 입력란·읽기 전용 칸 글자는 폰에서 16px(text-lead, 아이폰 확대 방지)', () => {
    expect(has(ui.input, 'max-md:text-lead')).toBe(true)
    expect(has(ui.readonly, 'max-md:text-lead')).toBe(true)
    const globals = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')
    expect(globals).toMatch(/--text-lead:\s*16px;/)
  })
})

// 앱 화면 소스: 컴포넌트 폴더 + src/app의 로그인·가입·승인 대기·오류·앱 페이지. 시험 파일은 뺀다. 나중 TASK의 파일도 저절로 들어온다
const APP_DIRS = [
  'src/components/auth',
  'src/components/common',
  'src/components/shell',
  'src/components/dashboard',
  'src/components/admin',
  'src/components/ui',
  'src/app/login',
  'src/app/(onboarding)',
  'src/app/(app)',
]
const APP_FILES = ['src/app/error.tsx']

function walk(dir: string): string[] {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs).flatMap((name) => {
    const path = join(abs, name)
    return statSync(path).isDirectory() ? walk(relative(ROOT, path)) : [relative(ROOT, path)]
  })
}
const allAppFiles = () => [...APP_DIRS.flatMap(walk), ...APP_FILES.filter((f) => existsSync(join(ROOT, f)))]
const sources = () => allAppFiles().filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))

// 주석과 SVG 그림 색(fill·stroke — 로고·구글 마크)은 뺀다
const code = (file: string) =>
  readFileSync(join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/\b(?:fill|stroke|stopColor|floodColor)=(?:"[^"]*"|'[^']*')/g, '')

const ARBITRARY_COLOR = /\[#|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/
const PALETTE =
  /\b(?:bg|text|border(?:-[trblxyse])?|outline|ring(?:-offset)?|fill|stroke|from|via|to|divide|placeholder|decoration|accent|caret|shadow)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)|white|black)\b/

describe('AC-013.2: 앱 화면 소스 — CSS Module·임의 색·Tailwind 기본 색 없음', () => {
  it('AC-013.2: 검사할 파일 목록에 다시 입힌 화면이 모두 들어 있다(빈 검사가 아니다)', () => {
    const files = sources()
    for (const f of [
      'src/components/auth/AuthFrame.tsx',
      'src/components/auth/LoginCard.tsx',
      'src/components/auth/SignupForm.tsx',
      'src/components/auth/PendingCard.tsx',
      'src/components/common/ErrorCard.tsx',
      'src/components/ui/classes.ts',
      'src/app/error.tsx',
      'src/app/login/page.tsx',
    ]) {
      expect(files).toContain(f)
    }
  })

  it('AC-013.2: *.module.css를 import하지 않는다', () => {
    for (const file of sources()) expect(code(file), file).not.toMatch(/\.module\.css['"]/)
  })

  it('AC-013.2: 앱 화면 폴더에 *.module.css 파일이 없다(랜딩만 CSS Modules)', () => {
    expect(allAppFiles().filter((f) => f.endsWith('.module.css'))).toEqual([])
  })

  it('AC-013.2: 임의 색 값([#…]·rgb(·hsl(·color-mix()이 없다(SVG 그림 색은 예외)', () => {
    for (const file of sources()) expect(code(file), file).not.toMatch(ARBITRARY_COLOR)
  })

  it('AC-013.2: Tailwind 기본 색 이름(blue-500·white 같은)이 없다', () => {
    for (const file of sources()) expect(code(file), file).not.toMatch(PALETTE)
  })

  it('AC-013.2: 검사 규칙 자체가 잡아야 할 것을 잡는다', () => {
    for (const bad of ['bg-[#2563eb]', 'text-[rgb(0,0,0)]', 'border-[color-mix(in_srgb,red,blue)]']) {
      expect(bad).toMatch(ARBITRARY_COLOR)
    }
    for (const bad of ['bg-blue-500', 'hover:text-gray-700', 'text-white', 'border-t-slate-200', 'ring-sky-50']) {
      expect(bad).toMatch(PALETTE)
    }
    for (const ok of ['bg-accent', 'text-ink-2', 'border-muted/55', 'bg-danger-soft', 'text-surface']) {
      expect(ok).not.toMatch(PALETTE)
      expect(ok).not.toMatch(ARBITRARY_COLOR)
    }
  })
})
