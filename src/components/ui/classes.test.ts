import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { ds, ui } from './classes'

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
    expect(globals).toMatch(/--fs-lead:\s*16px;/)
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
  'src/components/charts', // b2b-redesign TASK-5 (AC-205.8)
  'src/components/preview', // b2b-redesign TASK-8 (REQ-206)
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

// ── 새 묶음 ds (b2b-redesign REQ-204, design.md '공통 모양 옮기기', UI_GUIDE '공통 모양'). 위의 옛 ui 시험(AC-013.*)은 그대로 두고 TASK-23에서 ui와 함께 지운다.
// 키 목록은 시험이 정한다(구현에서 읽지 않는다) → ds가 없거나 키가 빠지면 그 키의 시험이 빈 글자로 실패한다
const DS_KEYS = [
  'focusRing',
  'button.primary',
  'button.primarySmall',
  'button.primaryLarge',
  'button.secondary',
  'button.secondarySmall',
  'button.danger',
  'button.accentOutlineSmall',
  'button.ghostSmall',
  'button.googleLarge',
  'textButton',
  'field',
  'label',
  'labelHint',
  'input',
  'readonly',
  'help',
  'fieldError',
  'checkbox',
  'checkboxWrap',
  'checkboxMark',
  'chip.neutral',
  'chip.accent',
  'chip.positive',
  'chip.negative',
  'chip.warning',
  'panel',
  'panelHead',
  'panelTitle',
  'panelBody',
  'count',
  'table.wrap',
  'table.table',
  'table.th',
  'table.row',
  'table.td',
  'table.tdSub',
  'table.tdNum',
  'table.check',
  'table.emptyRow',
  'layer',
] as const

// ds의 끝 값 하나(없으면 빈 글자)
const dsAt = (path: string): string => {
  const value = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], ds)
  return typeof value === 'string' ? value : ''
}
const DS_ALL = (): Named => DS_KEYS.map((key) => [key, dsAt(key)])
const DS_BUTTONS = DS_KEYS.filter((key) => key.startsWith('button.'))
const DS_CHIPS = DS_KEYS.filter((key) => key.startsWith('chip.'))
const DS_TABLE = DS_KEYS.filter((key) => key.startsWith('table.'))

// 'max-md:hover:bg-ink' → 변형 ['max-md', 'hover'], 유틸리티 'bg-ink'. 대괄호 안 쌍점(has-[:checked])은 나누지 않는다. 앞뒤 !(important)는 뗀다
function parseClass(token: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth += 1
    if (ch === ']' || ch === ')') depth -= 1
    if (ch === ':' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += ch
  }
  parts.push(current)
  const utility = (parts.pop() ?? '').replace(/^!|!$/g, '')
  return { variants: parts, utility }
}
const baseTokens = (classes: string) => tokens(classes).filter((t) => parseClass(t).variants.length === 0)
// 변형(hover·focus…)이 붙은 유틸리티가 있는가
const withVariant = (classes: string, variant: string | Set<string>, utility: string) =>
  tokens(classes).some((t) => {
    const parsed = parseClass(t)
    const ok = typeof variant === 'string' ? parsed.variants.includes(variant) : parsed.variants.some((v) => variant.has(v))
    return ok && parsed.utility === utility
  })
const shadowsOf = (classes: string) => tokens(classes).filter((t) => /^(?:inset-|drop-)?shadow(?:-|$)/.test(parseClass(t).utility))
const WEIGHT = /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/

describe('AC-204.1·AC-204.2·AC-204.3·AC-204.4·AC-204.5: ds 키는 design.md 표의 새 키 전부다', () => {
  it('AC-204.1·AC-204.2·AC-204.3·AC-204.4·AC-204.5: ds의 끝 값 경로가 표와 같다(옛 card·dangerSmall·chip.done·waiting·progress·sample·rejected 없음)', () => {
    expect(leaves(ds).map(([path]) => path).sort()).toEqual([...DS_KEYS].sort())
  })

  it.each(DS_KEYS)('AC-204.1·AC-204.2·AC-204.3·AC-204.4·AC-204.5: %s는 빈 글자가 아니다', (key) => {
    expect(tokens(dsAt(key)).length, key).toBeGreaterThan(0)
  })

  it('AC-204.1·AC-204.2·AC-204.3·AC-204.4·AC-204.5: 옛 별칭 이름(ok·danger·warn·rounded-card·rounded-chip·text-table·text-panel)을 쓰지 않는다', () => {
    const OLD = /-(?:ok|danger|warn)(?:-soft)?(?:\/\d+)?$|^rounded-(?:card|chip)$|^text-(?:table|tab|panel|logo|title-sm|kpi|kpi-sm)$/
    for (const [path, value] of DS_ALL()) {
      expect(tokens(value).filter((t) => OLD.test(parseClass(t).utility)), path).toEqual([])
    }
  })
})

describe('AC-204.1: ds.button — 크기·종류·공통 모양', () => {
  const SIZE: Record<string, { h: string; px: string; text: string; weight: string }> = {
    'button.primary': { h: 'h-9', px: 'px-4', text: 'text-body', weight: 'font-medium' },
    'button.secondary': { h: 'h-9', px: 'px-4', text: 'text-body', weight: 'font-medium' },
    'button.danger': { h: 'h-9', px: 'px-4', text: 'text-body', weight: 'font-medium' },
    'button.primarySmall': { h: 'h-8', px: 'px-3', text: 'text-small', weight: 'font-medium' },
    'button.secondarySmall': { h: 'h-8', px: 'px-3', text: 'text-small', weight: 'font-medium' },
    'button.accentOutlineSmall': { h: 'h-8', px: 'px-3', text: 'text-small', weight: 'font-semibold' },
    'button.ghostSmall': { h: 'h-8', px: 'px-2', text: 'text-small', weight: 'font-medium' },
    'button.primaryLarge': { h: 'h-11', px: 'px-5', text: 'text-body', weight: 'font-semibold' },
    'button.googleLarge': { h: 'h-11', px: 'px-5', text: 'text-body', weight: 'font-semibold' },
  }

  it('AC-204.1: 크기 표는 단추 키 전부를 덮는다', () => {
    expect(Object.keys(SIZE).sort()).toEqual([...DS_BUTTONS].sort())
  })

  it.each(Object.entries(SIZE))(
    'AC-204.1: %s는 높이·좌우 여백·글자·굵기가 표대로이고 같은 속성 클래스가 겹치지 않는다(기본 36·16·body 500 / Small 32·12·small / Large 44·20·body 600 / 강조 테두리 600 / 글자만 좌우 8)',
    (key, want) => {
      const value = dsAt(key)
      expect(has(value, want.h, want.px, want.text, want.weight), key).toBe(true)
      const base = baseTokens(value)
      expect(base.filter((t) => /^h-/.test(t)), `${key} 높이`).toEqual([want.h])
      expect(base.filter((t) => /^px-/.test(t)), `${key} 좌우`).toEqual([want.px])
      expect(base.filter((t) => WEIGHT.test(t)), `${key} 굵기`).toEqual([want.weight])
      expect(base.filter((t) => /^text-(?:caption|small|body|lead)$/.test(t)), `${key} 글자`).toEqual([want.text])
    },
  )

  it('AC-204.1: 주 단추(primary·primarySmall·primaryLarge)는 accent 바탕·surface 글자·투명 테두리 → 올림 accent-strong', () => {
    for (const key of ['button.primary', 'button.primarySmall', 'button.primaryLarge']) {
      const value = dsAt(key)
      expect(has(value, 'border', 'border-transparent', 'bg-accent', 'text-surface'), key).toBe(true)
      expect(withVariant(value, 'hover', 'bg-accent-strong'), key).toBe(true)
    }
  })

  it('AC-204.1: 보조 단추(secondary·secondarySmall)는 surface·1px line-strong·ink → 올림 canvas', () => {
    for (const key of ['button.secondary', 'button.secondarySmall']) {
      const value = dsAt(key)
      expect(has(value, 'border', 'border-line-strong', 'bg-surface', 'text-ink'), key).toBe(true)
      expect(withVariant(value, 'hover', 'bg-canvas'), key).toBe(true)
    }
  })

  it('AC-204.1: 강조 테두리(accentOutlineSmall)는 surface·1px accent·accent 글자 600 → 올림 accent-soft', () => {
    const value = dsAt('button.accentOutlineSmall')
    expect(has(value, 'border', 'border-accent', 'bg-surface', 'text-accent', 'font-semibold')).toBe(true)
    expect(withVariant(value, 'hover', 'bg-accent-soft')).toBe(true)
  })

  it('AC-204.1: 글자만(ghostSmall)은 투명 테두리·ink-2·좌우 8px·바탕 없음 → 올림 canvas', () => {
    const value = dsAt('button.ghostSmall')
    expect(has(value, 'border', 'border-transparent', 'text-ink-2', 'px-2')).toBe(true)
    expect(baseTokens(value).filter((t) => t.startsWith('bg-'))).toEqual([])
    expect(withVariant(value, 'hover', 'bg-canvas')).toBe(true)
  })

  it('AC-204.1: 위험(danger)은 보조 모양 + negative 글자', () => {
    const value = dsAt('button.danger')
    expect(has(value, 'border', 'border-line-strong', 'bg-surface', 'text-negative')).toBe(true)
    expect(has(value, 'text-ink')).toBe(false)
    expect(withVariant(value, 'hover', 'bg-canvas')).toBe(true)
  })

  it('AC-204.1: 구글(googleLarge)은 보조 모양 + 44px·가운데 정렬·사이 8px·600', () => {
    const value = dsAt('button.googleLarge')
    expect(has(value, 'border', 'border-line-strong', 'bg-surface', 'text-ink', 'h-11', 'justify-center', 'gap-2', 'font-semibold')).toBe(true)
    expect(withVariant(value, 'hover', 'bg-canvas')).toBe(true)
  })

  it.each(DS_BUTTONS)('AC-204.1: %s는 rounded-control·1px 테두리·줄바꿈 없음·초점 고리·막힘 40% + not-allowed이고 그림자가 없다', (key) => {
    const value = dsAt(key)
    expect(has(value, 'rounded-control', 'border', 'whitespace-nowrap', 'inline-flex', 'items-center'), key).toBe(true)
    expect(has(value, 'focus-visible:outline-2', 'focus-visible:outline-offset-2', 'focus-visible:outline-accent'), key).toBe(true)
    expect(has(value, 'disabled:opacity-40', 'disabled:cursor-not-allowed', 'aria-disabled:opacity-40', 'aria-disabled:cursor-not-allowed'), key).toBe(true)
    expect(shadowsOf(value), key).toEqual([])
  })

  it('AC-204.1: 초점 고리 ds.focusRing은 2px accent, 2px 띄움 — 단추·글자 단추·체크 상자가 같이 쓴다', () => {
    expect(tokens(dsAt('focusRing')).sort()).toEqual(['focus-visible:outline-2', 'focus-visible:outline-accent', 'focus-visible:outline-offset-2'])
    for (const key of [...DS_BUTTONS, 'textButton', 'checkbox']) {
      expect(has(dsAt(key), ...tokens(dsAt('focusRing'))), key).toBe(true)
    }
  })

  it('AC-204.1: 올림 색은 막히지 않았을 때만 바뀐다(not-disabled·not-aria-disabled)', () => {
    for (const key of DS_BUTTONS) {
      const hovers = tokens(dsAt(key)).filter((t) => parseClass(t).variants.includes('hover'))
      expect(hovers.length, key).toBeGreaterThan(0)
      for (const token of hovers) {
        expect(parseClass(token).variants.slice(0, 2), `${key}: ${token}`).toEqual(['not-disabled', 'not-aria-disabled'])
      }
    }
  })

  it('AC-204.1: 단추 묶음은 flex 크기(flex-·grow·shrink·basis)를 정하지 않는다 — 놓는 자리(flex-[1_1_160px])가 정한다', () => {
    const FLEX_SIZE = /^(flex-(?!col|row|wrap|nowrap)|grow|shrink|basis-)/
    for (const key of DS_BUTTONS) {
      expect(tokens(dsAt(key)).filter((t) => FLEX_SIZE.test(parseClass(t).utility)), key).toEqual([])
    }
  })

  it('AC-204.1: 글자 단추 ds.textButton은 바탕 없음·accent·body 500 → 올림 밑줄', () => {
    const value = dsAt('textButton')
    expect(has(value, 'text-accent', 'text-body', 'font-medium', 'rounded-control')).toBe(true)
    expect(tokens(value).filter((t) => parseClass(t).utility.startsWith('bg-'))).toEqual([])
    expect(withVariant(value, 'hover', 'underline')).toBe(true)
    expect(shadowsOf(value)).toEqual([])
  })

  it('AC-204.1: 입력 오류 테두리는 aria-invalid:border-negative다(옛 border-danger 아님)', () => {
    expect(has(dsAt('input'), 'aria-invalid:border-negative')).toBe(true)
    expect(has(dsAt('checkbox'), 'aria-invalid:border-negative')).toBe(true)
    for (const [path, value] of DS_ALL()) expect(value, path).not.toMatch(/border-danger/)
  })
})

describe('AC-204.1·AC-204.3: 휴대폰(768px 미만) 누름 영역 44px', () => {
  it.each(DS_BUTTONS)('AC-204.1: %s는 휴대폰에서 44px(max-md:h-11)', (key) => {
    expect(has(dsAt(key), 'max-md:h-11'), key).toBe(true)
  })

  it('AC-204.1: 글자 단추는 휴대폰에서 44px 높이', () => {
    const value = dsAt('textButton')
    expect(has(value, 'max-md:h-11') || has(value, 'max-md:min-h-11')).toBe(true)
  })

  it('AC-204.3: 입력란은 모든 폭에서 44px(h-11, 폭마다 다른 높이 없음), 읽기 전용 칸은 44px 이상(min-h-11)', () => {
    const input = dsAt('input')
    expect(baseTokens(input).filter((t) => /^(?:min-)?h-/.test(t))).toEqual(['h-11'])
    expect(tokens(input).filter((t) => parseClass(t).variants.length > 0 && /^(?:min-)?h-/.test(parseClass(t).utility))).toEqual([])
    expect(has(dsAt('readonly'), 'min-h-11')).toBe(true)
  })

  it('AC-204.3: 입력란·읽기 전용 칸 글자는 휴대폰에서 16px(max-md:text-lead)', () => {
    expect(has(dsAt('input'), 'text-body', 'max-md:text-lead')).toBe(true)
    expect(has(dsAt('readonly'), 'text-body', 'max-md:text-lead')).toBe(true)
  })
})

describe('AC-204.2: ds.chip — 20px·좌우 6px·caption 500·4px·1px 테두리·사이 4px', () => {
  it.each(DS_CHIPS)('AC-204.2: %s는 h-5·px-1.5·text-caption·font-medium·rounded-control·border·gap-1', (key) => {
    const value = dsAt(key)
    expect(has(value, 'inline-flex', 'items-center', 'whitespace-nowrap', 'h-5', 'px-1.5', 'text-caption', 'font-medium', 'rounded-control', 'border', 'gap-1'), key).toBe(true)
    expect(shadowsOf(value), key).toEqual([])
  })

  it.each<[string, string, string, string]>([
    ['chip.neutral', 'bg-canvas', 'border-line', 'text-ink-2'],
    ['chip.accent', 'bg-accent-soft', 'border-transparent', 'text-accent-strong'],
    ['chip.positive', 'bg-positive-soft', 'border-transparent', 'text-positive'],
    ['chip.negative', 'bg-negative-soft', 'border-transparent', 'text-negative'],
    ['chip.warning', 'bg-warning-soft', 'border-transparent', 'text-warning'],
  ])('AC-204.2: %s는 바탕 %s · 테두리 %s · 글자 %s', (key, bg, border, text) => {
    const value = dsAt(key)
    expect(has(value, bg, border, text), key).toBe(true)
    expect(baseTokens(value).filter((t) => t.startsWith('bg-')), key).toEqual([bg])
    expect(baseTokens(value).filter((t) => /^text-(?!caption$)/.test(t)), key).toEqual([text])
  })
})

describe('AC-204.3: 입력 모양 — input·readonly·label·labelHint·help·fieldError·checkbox', () => {
  it('AC-204.3: ds.input은 좌우 12px·surface·1px line-strong·rounded-control·전체 폭', () => {
    expect(has(dsAt('input'), 'w-full', 'min-w-0', 'px-3', 'bg-surface', 'border', 'border-line-strong', 'rounded-control', 'text-ink')).toBe(true)
    expect(shadowsOf(dsAt('input'))).toEqual([])
  })

  it('AC-204.3: ds.input 올림은 muted 테두리, 초점은 accent 테두리 + 1px accent 고리', () => {
    const value = dsAt('input')
    expect(withVariant(value, 'hover', 'border-muted')).toBe(true)
    expect(withVariant(value, FOCUS, 'border-accent')).toBe(true)
    expect(withVariant(value, FOCUS, 'ring-1')).toBe(true)
    expect(withVariant(value, FOCUS, 'ring-accent')).toBe(true)
  })

  it('AC-204.3: ds.readonly는 canvas·1px line·ink-2, 안쪽 초점이면 accent 테두리 + 1px accent 고리', () => {
    const value = dsAt('readonly')
    expect(has(value, 'bg-canvas', 'border', 'border-line', 'text-ink-2', 'rounded-control', 'w-full', 'min-w-0')).toBe(true)
    expect(has(value, 'focus-within:border-accent', 'focus-within:ring-1', 'focus-within:ring-accent')).toBe(true)
  })

  it('AC-204.3: 칸 이름 ds.label은 small 600 ink, ds.labelHint는 caption 400 muted', () => {
    expect(has(dsAt('label'), 'text-small', 'font-semibold', 'text-ink')).toBe(true)
    expect(has(dsAt('labelHint'), 'text-caption', 'font-normal', 'text-muted')).toBe(true)
  })

  it('AC-204.3: ds.help는 caption muted, ds.fieldError는 caption 500 negative', () => {
    expect(has(dsAt('help'), 'text-caption', 'text-muted')).toBe(true)
    expect(has(dsAt('fieldError'), 'text-caption', 'font-medium', 'text-negative')).toBe(true)
  })

  it('AC-204.3: ds.field는 세로로 쌓는 칸 하나(이름 → 입력)', () => {
    expect(has(dsAt('field'), 'flex', 'flex-col')).toBe(true)
    expect(baseTokens(dsAt('field')).filter((t) => t.startsWith('gap-'))).toHaveLength(1)
  })

  it('AC-204.3: ds.checkbox는 16px·rounded-control·1px line-strong → 체크하면 accent 바탕 + 흰 체크(checkboxMark)', () => {
    const value = dsAt('checkbox')
    expect(has(value, 'peer', 'size-4', 'appearance-none', 'rounded-control', 'border', 'border-line-strong', 'bg-surface')).toBe(true)
    expect(has(value, 'checked:bg-accent', 'checked:border-accent')).toBe(true)
    for (const token of tokens(value).filter((t) => t.includes('accent'))) {
      const { variants } = parseClass(token)
      expect(variants.includes('checked') || variants.some((v) => FOCUS.has(v)), token).toBe(true)
    }
    expect(has(dsAt('checkboxWrap'), 'relative', 'inline-flex', 'size-4')).toBe(true)
    expect(has(dsAt('checkboxMark'), 'pointer-events-none', 'absolute', 'hidden', 'size-4', 'text-surface', 'peer-checked:block')).toBe(true)
  })
})

describe('AC-204.4: ds.table — 머리 40px·몸 44px·선만', () => {
  const CELLS = ['table.td', 'table.tdSub', 'table.tdNum'] as const

  it('AC-204.4: 표는 전체 폭·small 글자·칸 선 겹침, 감싸개는 옆으로 밀린다', () => {
    expect(has(dsAt('table.table'), 'w-full', 'border-collapse', 'text-small')).toBe(true)
    expect(has(dsAt('table.wrap'), 'min-w-0', 'overflow-x-auto')).toBe(true)
  })

  it('AC-204.4: 머리 칸은 40px·500 muted·아래 1px line·왼쪽 정렬, 칸 좌우 12px·첫 칸 왼쪽·끝 칸 오른쪽 20px', () => {
    const value = dsAt('table.th')
    expect(has(value, 'h-10', 'font-medium', 'text-muted', 'border-b', 'border-line', 'text-left', 'px-3', 'first:pl-5', 'last:pr-5')).toBe(true)
    expect(baseTokens(value).filter((t) => t.startsWith('bg-'))).toEqual([])
  })

  it.each(CELLS)('AC-204.4: %s는 44px·아래 1px line·칸 좌우 12px·첫 칸 왼쪽·끝 칸 오른쪽 20px', (key) => {
    expect(has(dsAt(key), 'h-11', 'border-b', 'border-line', 'px-3', 'first:pl-5', 'last:pr-5'), key).toBe(true)
  })

  it('AC-204.4: 몸 칸 글자는 ink(보조 칸 ink-2), 숫자 칸은 오른쪽 정렬·고정폭', () => {
    expect(has(dsAt('table.td'), 'text-ink')).toBe(true)
    expect(has(dsAt('table.tdSub'), 'text-ink-2')).toBe(true)
    expect(has(dsAt('table.tdNum'), 'text-right', 'tabular-nums', 'text-ink')).toBe(true)
  })

  it('AC-204.4: 체크 칸은 44px·아래 1px line·왼쪽 20px(첫 칸)', () => {
    expect(has(dsAt('table.check'), 'h-11', 'border-b', 'border-line', 'pl-5')).toBe(true)
  })

  it('AC-204.4: 줄 올림은 canvas이고 마지막 줄 아래 선이 없다', () => {
    expect(withVariant(dsAt('table.row'), 'hover', 'bg-canvas')).toBe(true)
    expect(has(dsAt('table.row'), 'last:*:border-b-0')).toBe(true)
  })

  it('AC-204.4: 빈 탭 줄(늘 마지막 줄)은 아래 선이 없고 muted·좌우 20px', () => {
    const value = dsAt('table.emptyRow')
    expect(has(value, 'text-muted', 'px-5')).toBe(true)
    expect(tokens(value).filter((t) => /^border/.test(parseClass(t).utility))).toEqual([])
  })

  it('AC-204.4: 줄무늬(odd·even)·모서리·바깥 테두리(네 변 border)·그림자가 없다', () => {
    for (const key of DS_TABLE) {
      const value = dsAt(key)
      const parsed = tokens(value).map(parseClass)
      expect(parsed.filter((p) => p.variants.some((v) => v === 'odd' || v === 'even')), key).toEqual([])
      expect(parsed.filter((p) => p.utility.startsWith('rounded')), key).toEqual([])
      expect(parsed.filter((p) => p.utility === 'border'), key).toEqual([])
      expect(shadowsOf(value), key).toEqual([])
    }
  })
})

describe('AC-204.5: ds.panel·layer — 패널은 선, 그림자는 떠 있는 층에만', () => {
  it('AC-204.5: ds.panel은 surface·1px line·rounded-control·그림자 없음', () => {
    expect(has(dsAt('panel'), 'bg-surface', 'border', 'border-line', 'rounded-control')).toBe(true)
    expect(shadowsOf(dsAt('panel'))).toEqual([])
  })

  it('AC-204.5: ds.panelHead는 좌우 20px·위 16px(휴대폰 16·12)', () => {
    expect(has(dsAt('panelHead'), 'px-5', 'pt-4', 'max-md:px-4', 'max-md:pt-3')).toBe(true)
  })

  it('AC-204.5: 제목 ds.panelTitle은 subtitle 600 ink, 보조 글 ds.count는 small muted', () => {
    expect(has(dsAt('panelTitle'), 'text-subtitle', 'font-semibold', 'text-ink')).toBe(true)
    expect(has(dsAt('count'), 'text-small', 'text-muted')).toBe(true)
  })

  it('AC-204.5: ds.panelBody는 좌우 20px·위 16px·아래 20px(휴대폰 16·8·16)', () => {
    expect(has(dsAt('panelBody'), 'px-5', 'pt-4', 'pb-5', 'max-md:px-4', 'max-md:pt-2', 'max-md:pb-4')).toBe(true)
  })

  it('AC-204.5: ds.layer는 surface·1px line·rounded-float·shadow-float 하나', () => {
    expect(has(dsAt('layer'), 'bg-surface', 'border', 'border-line', 'rounded-float')).toBe(true)
    expect(shadowsOf(dsAt('layer'))).toEqual(['shadow-float'])
  })

  it('AC-204.5: layer 밖의 ds에는 그림자와 rounded-float가 없다', () => {
    for (const [path, value] of DS_ALL()) {
      if (path === 'layer') continue
      expect(shadowsOf(value), path).toEqual([])
      expect(has(value, 'rounded-float'), path).toBe(false)
    }
  })
})

// ── AC-204.6 규칙 시험. 검사 대상 = ds의 클래스 글자 + 아래 목록(파일·폴더, 시험 제외). TASK마다 고친 화면을 더하고 TASK-23에서 앱 화면 전체로 바꾼다.
// 옛 ui 묶음은 지울 때까지 빼고 본다(classes.ts 파일 글자가 아니라 ds 값을 본다)
// 앱 틀 네 파일 (b2b-redesign TASK-20, REQ-218). menu.ts는 클래스가 없어 넣지 않는다
const SHELL_FILES = ['src/components/shell/AppShell.tsx', 'src/components/shell/TabBar.tsx', 'src/components/shell/AccountMenu.tsx', 'src/components/shell/KstClock.tsx']
const RULE_TARGETS = ['src/components/common/Icon.tsx', 'src/components/charts', 'src/components/preview', 'src/components/auth/AuthFrame.tsx', 'src/components/admin/AdminApplications.tsx', ...SHELL_FILES]

const ruleFiles = () =>
  RULE_TARGETS.flatMap((target) => (existsSync(join(ROOT, target)) && statSync(join(ROOT, target)).isDirectory() ? walk(target) : [target])).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
  )

// 소스의 문자열 조각(따옴표·템플릿 글자·JSX 속성 값). 주석과 JSX 본문 글자는 들지 않는다
const stringPieces = (file: string) => piecesOf(readFileSync(join(ROOT, file), 'utf8'), file)
function piecesOf(text: string, file: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const pieces: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      pieces.push(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return pieces
}

const SPACE_STEPS = new Set(['0', '0.5', '1', '1.5', '2', '3', '4', '5', '6', '8', '12', '16', '24', 'px'])
const SPACING = /^-?(gap-x|gap-y|gap|space-x|space-y|px|py|pt|pr|pb|pl|ps|pe|p|mx|my|mt|mr|mb|ml|ms|me|m)-(.+)$/
const FONT_SIZES = ['caption', 'small', 'body', 'lead', 'subtitle', 'title', 'heading-m', 'heading', 'metric', 'display-m', 'display']
const TOKEN_COLORS = [
  'canvas', 'surface', 'line', 'line-strong', 'faint', 'muted', 'ink-2', 'ink',
  'accent', 'accent-strong', 'accent-soft', 'positive', 'positive-soft', 'negative', 'negative-soft', 'warning', 'warning-soft',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-prev', 'cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5',
  'current', 'inherit', 'transparent',
]
const TEXT_OTHER = ['left', 'center', 'right', 'justify', 'start', 'end', 'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip']
const TEXT_OK = new Set([...FONT_SIZES, ...TOKEN_COLORS, ...TEXT_OTHER])
const RADIUS_OK = new Set(['rounded-control', 'rounded-float', 'rounded-none'])
const SCREEN_OK = new Set(['md', 'lg', 'max-md', 'max-lg'])
const DECORATION = /^(?:bg-(?:linear|radial|conic|gradient)(?:-|$)|(?:from|via|to)-|backdrop-|blur(?:-|$)|animate-)/

// 클래스 하나가 어긴 규칙(없으면 빈 배열)
function ruleBreaks(token: string): string[] {
  const { variants, utility } = parseClass(token)
  const bare = utility.replace(/^-/, '')
  const breaks: string[] = []
  const spacing = utility.match(SPACING)
  if (spacing) {
    const [, prefix = '', value = ''] = spacing
    const ok = SPACE_STEPS.has(value) || (prefix.startsWith('m') && value === 'auto')
    if (!ok) breaks.push('간격 단계 밖')
  }
  if (/^rounded(?:-|$)/.test(bare) && !RADIUS_OK.has(bare)) breaks.push('모서리 토큰 밖')
  if (/^(?:inset-|drop-)?shadow(?:-|$)/.test(bare) && bare !== 'shadow-float') breaks.push('그림자 토큰 밖')
  if (/^text-/.test(bare) && !TEXT_OK.has(bare.slice('text-'.length).replace(/\/\d+$/, ''))) breaks.push('글자 크기 11단계·토큰 색 밖')
  if (DECORATION.test(bare)) breaks.push('그라데이션·흐림·움직임')
  for (const v of variants) {
    if ((/^(?:max-|min-)?(?:sm|md|lg|\d*xl)$/.test(v) && !SCREEN_OK.has(v)) || /^(?:min|max)-\[/.test(v)) breaks.push(`화면 폭 접두사 ${v}:`)
  }
  if (variants.length === 0 && utility === 'overflow-hidden') breaks.push('overflow-clip을 쓴다')
  return breaks
}
const breaksIn = (classes: string) => tokens(classes).flatMap((t) => ruleBreaks(t).map((why) => `${t} (${why})`))

describe('AC-204.6: 규칙 — 간격 단계·토큰 모서리·그림자·글자 11단계·장식 없음·화면 폭 접두사·overflow-clip', () => {
  it('AC-204.6: 검사 대상이 비어 있지 않다(ds 키 전부 + 목록 파일이 있다)', () => {
    expect(DS_ALL().every(([, value]) => value.length > 0)).toBe(true)
    for (const target of RULE_TARGETS) expect(existsSync(join(ROOT, target)), target).toBe(true)
    expect(ruleFiles()).toContain('src/components/common/Icon.tsx')
  })

  it.each(DS_KEYS)('AC-204.6: ds.%s의 클래스가 규칙을 지킨다', (key) => {
    expect(breaksIn(dsAt(key)), key).toEqual([])
  })

  it('AC-204.6: 검사 목록 파일의 클래스 글자가 규칙을 지킨다', () => {
    for (const file of ruleFiles()) {
      expect(stringPieces(file).flatMap(breaksIn), file).toEqual([])
    }
  })

  it('AC-204.6: ds와 검사 목록 파일에 CSS Module import·임의 색·Tailwind 기본 색 이름이 없다(AC-013.2 검사 그대로)', () => {
    const dsText = DS_ALL().map(([, value]) => value).join(' ')
    expect(dsText).not.toMatch(ARBITRARY_COLOR)
    expect(dsText).not.toMatch(PALETTE)
    for (const file of ruleFiles()) {
      expect(code(file), file).not.toMatch(/\.module\.css['"]/)
      expect(code(file), file).not.toMatch(ARBITRARY_COLOR)
      expect(code(file), file).not.toMatch(PALETTE)
    }
  })

  it.each([
    'p-2.5',
    'gap-[10px]',
    'rounded-lg',
    'text-sm',
    'bg-linear-to-r',
    'sm:flex',
    'overflow-hidden',
    'px-3.5',
    'mt-[3px]',
    'p-(--gutter)',
    '-mt-7',
    'space-y-10',
    'gap-x-2.5',
    'rounded',
    'rounded-card',
    'rounded-[6px]',
    'shadow-md',
    'shadow',
    'drop-shadow-sm',
    'text-table',
    'text-[13px]',
    'text-4xl',
    'bg-radial',
    'bg-gradient-to-b',
    'from-accent',
    'via-accent-soft',
    'to-surface',
    'backdrop-blur-sm',
    'blur-sm',
    'animate-spin',
    'xl:flex',
    'max-sm:hidden',
    'md:sm:p-4',
    'min-[900px]:flex',
    '!overflow-hidden',
  ])('AC-204.6: 규칙이 잘못된 예 %s를 잡는다', (bad) => {
    expect(ruleBreaks(bad).length, bad).toBeGreaterThan(0)
  })

  it.each([
    'p-0',
    'px-px',
    '-mt-px',
    'gap-1.5',
    'py-0.5',
    'mx-auto',
    'lg:mx-auto',
    'space-y-4',
    'pt-24',
    'rounded-control',
    'rounded-float',
    'rounded-none',
    'shadow-float',
    'text-small',
    'text-heading-m',
    'max-md:text-lead',
    'text-ink-2',
    'text-accent-strong',
    'text-muted/55',
    'text-right',
    'text-balance',
    'md:px-6',
    'max-lg:hidden',
    'overflow-clip',
    'overflow-x-auto',
    'after:overflow-hidden',
    'flex-[1_1_160px]',
    'border-muted/55',
    'last:*:border-b-0',
    'not-disabled:not-aria-disabled:hover:bg-accent-strong',
    'has-[:checked]:bg-accent-soft',
    'top-0',
    'peer',
    'peer-checked:block',
    'max-w-7xl',
    'min-h-11',
  ])('AC-204.6: 규칙이 맞는 예 %s는 그냥 둔다', (ok) => {
    expect(ruleBreaks(ok), ok).toEqual([])
  })

  it('AC-204.6: 문자열 조각만 읽는다 — 주석·JSX 본문 글자는 들지 않고 className·템플릿 글자는 든다', () => {
    const pieces = (text: string) => piecesOf(text, 'x.tsx').flatMap(breaksIn)
    expect(pieces('// p-2.5 rounded-lg\nexport const A = () => <p>text-sm 글자</p>')).toEqual([])
    expect(pieces('export const A = () => <p className="p-2.5">x</p>')).toEqual(['p-2.5 (간격 단계 밖)'])
    expect(pieces('const x = 1\nexport const c = `rounded-lg ${x} sm:flex`')).toEqual(['rounded-lg (모서리 토큰 밖)', 'sm:flex (화면 폭 접두사 sm:)'])
  })
})

describe('AC-205.8: 차트 부품 폴더가 AC-013.2 검사(APP_DIRS)와 AC-204.6 검사 목록에 든다', () => {
  const CHART_FILES = ['src/components/charts/format.ts', 'src/components/charts/Sparkline.tsx', 'src/components/charts/KpiStat.tsx']

  it('AC-205.8: AC-013.2 검사 파일에 차트 부품이 있다(시험 파일은 빠진다)', () => {
    expect(sources()).toEqual(expect.arrayContaining(CHART_FILES))
    expect(sources().filter((f) => f.startsWith('src/components/charts/') && /\.test\.tsx?$/.test(f))).toEqual([])
  })

  it('AC-205.8: AC-204.6 검사 목록 파일에 차트 부품이 있다(시험 파일은 빠진다)', () => {
    expect(ruleFiles()).toEqual(expect.arrayContaining(CHART_FILES))
    expect(ruleFiles().filter((f) => /\.test\.tsx?$/.test(f))).toEqual([])
  })
})

describe('AC-204.6: 미리보기 폴더(components/preview)가 AC-013.2 검사(APP_DIRS)와 AC-204.6 검사 목록에 든다 (b2b-redesign TASK-8)', () => {
  const PREVIEW_FILES = ['src/components/preview/sample.ts', 'src/components/preview/DashboardPreview.tsx']

  it('AC-013.2: AC-013.2 검사 파일에 미리보기가 있다(시험 파일은 빠진다)', () => {
    expect(sources()).toEqual(expect.arrayContaining(PREVIEW_FILES))
    expect(sources().filter((f) => f.startsWith('src/components/preview/') && /\.test\.tsx?$/.test(f))).toEqual([])
  })

  it('AC-204.6: AC-204.6 검사 목록 파일에 미리보기가 있다(시험 파일은 빠진다)', () => {
    expect(ruleFiles()).toEqual(expect.arrayContaining(PREVIEW_FILES))
    expect(ruleFiles().filter((f) => f.startsWith('src/components/preview/') && /\.test\.tsx?$/.test(f))).toEqual([])
  })
})

describe('AC-204.6: 인증 화면 틀(AuthFrame)이 AC-204.6 검사 목록에 든다 (b2b-redesign TASK-15)', () => {
  it('AC-204.6: AC-204.6 검사 목록 파일에 src/components/auth/AuthFrame.tsx가 있다', () => {
    expect(ruleFiles()).toContain('src/components/auth/AuthFrame.tsx')
  })
})

describe('AC-204.6: 관리자 가입 신청 화면(AdminApplications)이 AC-204.6 검사 목록에 든다 (b2b-redesign TASK-22)', () => {
  it('AC-204.6: AC-204.6 검사 목록 파일에 src/components/admin/AdminApplications.tsx가 있다', () => {
    expect(ruleFiles()).toContain('src/components/admin/AdminApplications.tsx')
  })
})

describe('AC-204.6: 앱 틀(AppShell·TabBar·AccountMenu·KstClock)이 AC-204.6 검사 목록에 든다 (b2b-redesign TASK-20)', () => {
  it('AC-204.6·AC-218.1: AC-204.6 검사 목록 파일에 앱 틀 네 파일이 있다', () => {
    expect(ruleFiles()).toEqual(expect.arrayContaining(SHELL_FILES))
  })
})
