// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement as h, type ComponentType } from 'react'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApplications } from '@/components/admin/AdminApplications'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { LoginAside } from '@/components/auth/LoginAside'
import { LoginCard } from '@/components/auth/LoginCard'
import { HeaderSignOut, PendingCard, type PendingHospital } from '@/components/auth/PendingCard'
import { SignupForm } from '@/components/auth/SignupForm'
import { AppShell } from '@/components/shell/AppShell'
import PageError from '@/app/error'
import { isBorderBox, nestedBoxes } from '@/testing/boxes'
import { ds, ui } from './classes'

// 앱 화면 공통 모양 (REQ-013, docs/UI_GUIDE.md '앱 화면', specs/auth/design.md '모양 시험은 클래스로').
// jsdom은 CSS를 계산하지 않는다 → 정해 둔 클래스가 있는지, 쓰면 안 되는 클래스가 없는지를 본다. 보이는 모양은 스크린샷(TASK-18)
const ROOT = process.cwd()

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const has = (classes: string, ...wanted: string[]) => wanted.every((t) => tokens(classes).includes(t))

// 묶음의 모든 끝 값: ['button.primary', '…클래스…']
function leaves(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) => leaves(v, path ? `${path}.${key}` : key))
}

const FOCUS = new Set(['focus', 'focus-visible', 'focus-within'])

type Named = Array<[string, string]>

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
  'src/components/claim', // ui-90 TASK-5 (AC-408.1)
  'src/components/revenue', // revenue TASK-9 (AC-009.5)
  'src/components/stats', // stats TASK-13 (AC-513.9)
  'src/components/worklog', // worklog TASK-7 (AC-007.3)
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
    // 윈도우에서도 목록 글자는 '/'로 견준다(경로 구분자만 바꾼다)
    const rel = relative(ROOT, path).split(sep).join('/')
    return statSync(path).isDirectory() ? walk(rel) : [rel]
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

// 예외 한 파일(worklog AC-007.3, design.md 12절): 앱 화면의 CSS Module은 엑셀 양식 한 파일뿐이고, 불러오는 소스도 양식 칸 한 파일뿐이다. 다른 파일은 그대로 잡는다
const WORKLOG_SHEET_CSS = 'src/components/worklog/sheet.module.css'
const WORKLOG_SHEET_IMPORTER = 'src/components/worklog/WorklogSheet.tsx'
const WORKLOG_SHEET_SPECIFIER = './sheet.module.css'
// 글자가 불러오는 *.module.css 가운데 예외 밖의 것
const badCssModuleImports = (file: string, text: string) =>
  [...text.matchAll(/['"]([^'"\n]*\.module\.css)['"]/g)]
    .map((match) => match[1])
    .filter((specifier) => !(file === WORKLOG_SHEET_IMPORTER && specifier === WORKLOG_SHEET_SPECIFIER))

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

  it('AC-013.2·AC-007.3: *.module.css를 import하는 소스는 WorklogSheet.tsx 하나뿐이다', () => {
    for (const file of sources()) expect(badCssModuleImports(file, code(file)), file).toEqual([])
  })

  it('AC-013.2·AC-007.3: 앱 화면 폴더의 *.module.css는 sheet.module.css 하나뿐이다(그 밖은 랜딩만 CSS Modules)', () => {
    expect(allAppFiles().filter((f) => f.endsWith('.module.css'))).toEqual([WORKLOG_SHEET_CSS])
  })

  it('AC-007.3: src/components/worklog가 앱 화면 검사 폴더에 든다', () => {
    expect(APP_DIRS).toContain('src/components/worklog')
    expect(allAppFiles()).toContain(WORKLOG_SHEET_CSS)
  })

  it('AC-007.3: 예외는 불러오는 파일 하나 × sheet.module.css 하나뿐이고, 다른 파일과 다른 CSS Module은 그대로 잡는다', () => {
    const line = `import s from '${WORKLOG_SHEET_SPECIFIER}'`
    expect(badCssModuleImports(WORKLOG_SHEET_IMPORTER, line)).toEqual([])
    for (const file of ['src/components/worklog/WorklogToolbar.tsx', 'src/components/worklog/WorklogScreen.tsx', 'src/components/auth/LoginCard.tsx', 'src/app/(app)/worklog/page.tsx']) {
      expect(badCssModuleImports(file, line), file).toEqual([WORKLOG_SHEET_SPECIFIER])
    }
    for (const other of ['./other.module.css', '../landing/sheet.module.css']) {
      expect(badCssModuleImports(WORKLOG_SHEET_IMPORTER, `import t from '${other}'`), other).toEqual([other])
    }
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

// ── 새 묶음 ds (b2b-redesign REQ-204, design.md '공통 모양 옮기기', UI_GUIDE '공통 모양'). 옛 ui 모양 시험(AC-013.3·AC-013.4)은 TASK-23에서 지웠다 — ui에는 대시보드 빈 자리가 쓰는 세 키만 남는다(AC-221.1).
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
  'button.ghost',
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
  'segment.group',
  'segment.button',
  'segment.on',
  'segment.off',
  'chartNoSideScroll',
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

// ── dashboard-ux AC-2703.2·AC-2703.3 (design.md §8 'ds: segment'): 기간 단추 묶음 하나를 대시보드 추이 빠른 단추·통계 기간 고르기가 같이 쓴다
describe('AC-2703.2·AC-2703.3: ds.segment — 기간 단추 묶음(group·button·on·off)', () => {
  it('AC-2703.2·AC-2703.3: 값은 통계 기간 고르기 단추의 지금 모양 그대로이고, 휴대폰 칸 수(max-md:grid-cols-N)는 단추 수에 맞춰 놓는 자리가 준다', () => {
    expect(ds.segment).toEqual({
      group: 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full',
      button:
        'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-1',
      on: 'bg-accent-soft font-semibold text-accent-strong',
      off: 'font-medium text-ink-2 transition hover:bg-canvas',
    })
    expect(tokens(dsAt('segment.group')).filter((t) => /grid-cols-/.test(t))).toEqual([])
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
    'button.ghost': { h: 'h-9', px: 'px-4', text: 'text-body', weight: 'font-medium' }, // ui-90 AC-406.2 글자만 기본
    'button.ghostSmall': { h: 'h-8', px: 'px-2', text: 'text-small', weight: 'font-medium' },
    'button.primaryLarge': { h: 'h-11', px: 'px-5', text: 'text-body', weight: 'font-semibold' },
    'button.googleLarge': { h: 'h-11', px: 'px-5', text: 'text-body', weight: 'font-semibold' },
  }

  it('AC-204.1: 크기 표는 단추 키 전부를 덮는다', () => {
    expect(Object.keys(SIZE).sort()).toEqual([...DS_BUTTONS].sort())
  })

  it.each(Object.entries(SIZE))(
    'AC-204.1·AC-406.2: %s는 높이·좌우 여백·글자·굵기가 표대로이고 같은 속성 클래스가 겹치지 않는다(기본 36·16·body 500 / Small 32·12·small / Large 44·20·body 600 / 강조 테두리 600 / 글자만 작은 좌우 8 / 글자만 기본 36·16)',
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

  it('AC-406.2: 글자만 기본(ghost)은 ghostSmall과 같은 색 — 투명 테두리·ink-2·바탕 없음 → 올림 canvas, 기본 크기(36px·좌우 16px·body 500)', () => {
    const value = dsAt('button.ghost')
    expect(has(value, 'border', 'border-transparent', 'text-ink-2', 'h-9', 'px-4', 'text-body', 'font-medium', 'max-md:h-11')).toBe(true)
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

// ── AC-406.1·AC-406.2 (ui-90 REQ-406, design.md '`ds` 반응 · 기다림 · 대비', UI_GUIDE '단추'): 짧은 반응과 기다림 모양이 ds 안에 있다.
// 화면 파일이 따로 붙이지 않아도 모든 단추가 같은 반응을 갖는다. 규칙(AC-204.6·AC-313.2)은 위 it.each(DS_KEYS)가 그대로 본다
const PRESS_DOWN = 'not-disabled:not-aria-disabled:not-aria-busy:active:translate-y-px'
const BUSY = ['aria-busy:cursor-progress', 'aria-busy:opacity-60']

describe('AC-406.1·AC-406.2: ds 단추 — 짧은 반응(transition·누름 1px)과 기다림(aria-busy 60%·progress 커서)', () => {
  it.each(DS_BUTTONS)('AC-406.1: %s는 transition(150ms 기본)과 막히지도 기다리지도 않을 때만 누름 아래 1px이다', (key) => {
    const value = dsAt(key)
    expect(has(value, 'transition', PRESS_DOWN), key).toBe(true)
    // 누름 옮김은 이 한 클래스뿐이다(막힘·기다림 조건 없는 active:가 없다)
    expect(tokens(value).filter((t) => parseClass(t).variants.includes('active')), key).toEqual([PRESS_DOWN])
    // 150ms 기본값을 그대로 쓴다(transition-*·duration-*·ease-*·delay-* 없음)
    expect(tokens(value).filter((t) => /^(?:transition-|duration-|ease-|delay-)/.test(parseClass(t).utility)), key).toEqual([])
  })

  it('AC-406.1: 글자 단추 ds.textButton도 transition(150ms 기본)이 있다', () => {
    expect(has(dsAt('textButton'), 'transition')).toBe(true)
    expect(tokens(dsAt('textButton')).filter((t) => /^(?:transition-|duration-|ease-|delay-)/.test(parseClass(t).utility))).toEqual([])
  })

  it.each(DS_BUTTONS)('AC-406.2: %s는 기다릴 때(aria-busy="true") 60% 흐림 + progress 커서다(막힘 40%와 다른 값)', (key) => {
    const value = dsAt(key)
    expect(has(value, ...BUSY), key).toBe(true)
    expect(has(value, 'disabled:opacity-40', 'aria-disabled:opacity-40'), key).toBe(true)
  })

  it('AC-406.1·AC-406.2: 새 반응·기다림 클래스는 AC-204.6·AC-313.2 규칙을 그대로 통과한다', () => {
    for (const ok of ['transition', PRESS_DOWN, ...BUSY]) expect(ruleBreaks(ok), ok).toEqual([])
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

// ── AC-204.6 규칙 시험. 검사 대상 = ds의 클래스 글자 + 앱 화면 폴더 전체(위 APP_DIRS·APP_FILES, 시험 제외).
// TASK마다 고친 화면을 목록에 더하다가 TASK-23에서 폴더 전체로 바꿨다(AC-221.2). 빠지는 것은 옛 빈 자리 한 파일(DashboardEmpty.tsx)뿐이다 —
// 대시보드 두 폴더에 새로 생기는 파일은 저절로 검사에 든다(tab-frame AC-313.3).
// classes.ts는 파일 글자를 보되, 대시보드 빈 자리가 쓰는 옛 ui 세 키의 값은 뺀다(AC-204.6·AC-221.1)
const OLD_DASHBOARD_FILE = 'src/components/dashboard/DashboardEmpty.tsx'
const isOldDashboard = (file: string) => file === OLD_DASHBOARD_FILE
const CLASSES_FILE = 'src/components/ui/classes.ts'
// 대시보드 빈 자리가 쓰는 옛 ui 세 키와 그 값(한 글자도 바꾸지 않는다, AC-221.1)
const KEPT_UI: Record<string, string> = {
  card: 'rounded-card border border-line bg-surface p-6 max-md:px-4 max-md:py-5',
  panel: 'flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface px-4.5 pt-4.5 pb-4',
  panelTitle: 'text-panel font-semibold text-ink',
}
// 앱 틀 네 파일 (b2b-redesign TASK-20, REQ-218). menu.ts는 클래스가 없다
const SHELL_FILES = ['src/components/shell/AppShell.tsx', 'src/components/shell/TabBar.tsx', 'src/components/shell/AccountMenu.tsx', 'src/components/shell/KstClock.tsx']
// 로그인 화면 세 파일 (b2b-redesign TASK-16, REQ-214)
const LOGIN_FILES = ['src/components/auth/LoginCard.tsx', 'src/components/auth/LoginAside.tsx', 'src/components/common/GoogleMark.tsx']
// 승인 대기·거절 화면 (b2b-redesign TASK-18, REQ-216)
const PENDING_FILES = ['src/components/auth/PendingCard.tsx']
// 가입 신청 두 파일 (b2b-redesign TASK-17, REQ-215)
const SIGNUP_FILES = ['src/components/auth/SignupForm.tsx', 'src/components/auth/Stepper.tsx']
// 오류 카드·오류 화면 (b2b-redesign TASK-19, REQ-217)
const ERROR_FILES = ['src/components/common/ErrorCard.tsx', 'src/app/error.tsx']
// 검사 대상: 앱 화면 폴더·파일 전체. 옛 빈 자리 한 파일은 ruleFiles가 뺀다
const RULE_TARGETS = [...APP_DIRS, ...APP_FILES]

const ruleFiles = () =>
  RULE_TARGETS.flatMap((target) => (existsSync(join(ROOT, target)) && statSync(join(ROOT, target)).isDirectory() ? walk(target) : [target])).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !isOldDashboard(f),
  )

// 소스의 문자열 조각(따옴표·템플릿 글자·JSX 속성 값). 주석과 JSX 본문 글자는 들지 않는다
const KEPT_UI_VALUES = new Set(Object.values(KEPT_UI))
const stringPieces = (file: string) =>
  piecesOf(readFileSync(join(ROOT, file), 'utf8'), file).filter((piece) => !(file === CLASSES_FILE && KEPT_UI_VALUES.has(piece)))
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
  // 대비(AC-407.1): 글자는 muted 이상. faint는 차트 표시(bg-faint)에만 쓴다
  if (/^text-faint(?:\/\d+)?$/.test(bare)) breaks.push('대비 — 글자는 muted 이상')
  if (DECORATION.test(bare)) breaks.push('그라데이션·흐림·움직임')
  // 짧은 반응(AC-313.2): 맨 transition(150ms 기본)과 duration-200(휴대폰 아래 단추)만. 옮김·돌림·투명도와 변형(active:·starting:…)은 막지 않는다
  if (/^transition-/.test(bare) || (/^duration-/.test(bare) && bare !== 'duration-200') || /^(?:delay|ease)-/.test(bare)) breaks.push('짧은 반응 밖')
  for (const v of variants) {
    if ((/^(?:max-|min-)?(?:sm|md|lg|\d*xl)$/.test(v) && !SCREEN_OK.has(v)) || /^(?:min|max)-\[/.test(v)) breaks.push(`화면 폭 접두사 ${v}:`)
  }
  if (variants.length === 0 && utility === 'overflow-hidden') breaks.push('overflow-clip을 쓴다')
  return breaks
}
const breaksIn = (classes: string) => tokens(classes).flatMap((t) => ruleBreaks(t).map((why) => `${t} (${why})`))
// 규칙 예외(ui-90 AC-405.3, UI_GUIDE '움직임 › 불러오기 줄'): 불러오기 줄 한 파일의 700ms·감속 곡선 두 클래스뿐이다. 다른 파일의 같은 클래스는 그대로 잡는다
const LOAD_BAR_FILE = 'src/components/shell/LoadBar.tsx'
const RULE_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = { [LOAD_BAR_FILE]: ['duration-700', 'ease-out'] }
const fileBreaksIn = (file: string, classes: string) =>
  breaksIn(
    tokens(classes)
      .filter((t) => !(RULE_EXCEPTIONS[file] ?? []).includes(t))
      .join(' '),
  )

describe('AC-204.6: 규칙 — 간격 단계·토큰 모서리·그림자·글자 11단계·장식 없음·화면 폭 접두사·overflow-clip', () => {
  it('AC-204.6: 검사 대상이 비어 있지 않다(ds 키 전부 + 목록 파일이 있다)', () => {
    expect(DS_ALL().every(([, value]) => value.length > 0)).toBe(true)
    for (const target of RULE_TARGETS) expect(existsSync(join(ROOT, target)), target).toBe(true)
    expect(ruleFiles()).toContain('src/components/common/Icon.tsx')
  })

  it.each(DS_KEYS)('AC-204.6: ds.%s의 클래스가 규칙을 지킨다', (key) => {
    expect(breaksIn(dsAt(key)), key).toEqual([])
  })

  it('AC-204.6·AC-405.3: 검사 목록 파일의 클래스 글자가 규칙을 지킨다(불러오기 줄 한 파일의 두 클래스만 예외)', () => {
    for (const file of ruleFiles()) {
      expect(
        stringPieces(file).flatMap((piece) => fileBreaksIn(file, piece)),
        file,
      ).toEqual([])
    }
  })

  it('AC-204.6·AC-007.3: ds와 검사 목록 파일에 CSS Module import(양식 칸 한 파일 빼고)·임의 색·Tailwind 기본 색 이름이 없다(AC-013.2 검사 그대로)', () => {
    const dsText = DS_ALL().map(([, value]) => value).join(' ')
    expect(dsText).not.toMatch(ARBITRARY_COLOR)
    expect(dsText).not.toMatch(PALETTE)
    for (const file of ruleFiles()) {
      expect(badCssModuleImports(file, code(file)), file).toEqual([])
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

// ── AC-313.2 짧은 반응 (tab-frame, docs/UI_GUIDE.md '움직임'): 맨 transition(150ms 기본)·duration-200(휴대폰 아래 단추)과 작은 옮김·돌림·투명도만.
// ds 키 전부와 검사 목록 파일이 이 규칙을 지키는지는 위 it.each(DS_KEYS)·검사 목록 시험이 그대로 본다
describe('AC-313.2: 규칙 — 짧은 반응 밖의 움직임(transition-*·duration-*·delay-*·ease-*·animate-*)을 잡는다', () => {
  it.each([
    'transition-all',
    'transition-colors',
    'transition-transform',
    'duration-150',
    'duration-300',
    'delay-75',
    'ease-in-out',
    'ease-[cubic-bezier(0,0,1,1)]',
    'motion-safe:animate-pulse',
    'hover:transition-all',
  ])('AC-313.2: 짧은 반응 밖의 움직임 클래스 %s를 잡는다', (bad) => {
    expect(ruleBreaks(bad).length, bad).toBeGreaterThan(0)
  })

  it.each([
    'transition',
    'duration-200',
    'active:translate-y-px',
    'not-disabled:active:translate-y-px',
    'group-hover:translate-x-0.5',
    'starting:opacity-0',
    'starting:-translate-y-1',
    'group-open:rotate-180',
    'translate-y-full',
  ])('AC-313.2: 짧은 반응 클래스 %s는 통과한다', (ok) => {
    expect(ruleBreaks(ok), ok).toEqual([])
  })
})

// ── ui-90 AC-405.3 불러오기 줄 예외: 700ms·감속 곡선은 LoadBar.tsx 한 파일에서만 통과한다(UI_GUIDE '움직임 › 불러오기 줄')
describe('AC-405.3: 규칙 — 불러오기 줄 예외는 LoadBar.tsx 한 파일 × duration-700·ease-out 두 클래스뿐이다', () => {
  it('AC-405.3: 예외 목록은 파일 하나(LoadBar.tsx) × 클래스 둘이고, 그 파일이 있고 검사 목록에 든다', () => {
    expect(RULE_EXCEPTIONS).toEqual({ 'src/components/shell/LoadBar.tsx': ['duration-700', 'ease-out'] })
    expect(existsSync(join(ROOT, LOAD_BAR_FILE))).toBe(true)
    expect(ruleFiles()).toContain(LOAD_BAR_FILE)
  })

  it('AC-405.3: LoadBar.tsx는 예외 두 클래스를 실제로 쓴다(쓰지 않는 예외를 남기지 않는다)', () => {
    const used = stringPieces(LOAD_BAR_FILE).flatMap(tokens)
    for (const cls of RULE_EXCEPTIONS[LOAD_BAR_FILE] ?? []) expect(used, cls).toContain(cls)
  })

  it('AC-405.3: 두 클래스는 규칙 자체로는 여전히 짧은 반응 밖이다', () => {
    for (const cls of ['duration-700', 'ease-out']) expect(ruleBreaks(cls), cls).toContain('짧은 반응 밖')
  })

  it.each(['src/components/shell/TabBar.tsx', 'src/components/shell/MoreMenu.tsx', 'src/components/ui/classes.ts', 'src/components/claim/x.tsx'])(
    'AC-405.3: 다른 파일(%s)의 duration-700·ease-out은 그대로 잡는다',
    (file) => {
      expect(fileBreaksIn(file, 'transition duration-700 ease-out')).toEqual(['duration-700 (짧은 반응 밖)', 'ease-out (짧은 반응 밖)'])
    },
  )

  it('AC-405.3: LoadBar.tsx에서도 예외 두 클래스 밖의 움직임(다른 시간·곡선·delay·변형 앞말 붙은 것)은 잡는다', () => {
    expect(fileBreaksIn(LOAD_BAR_FILE, 'transition duration-700 ease-out')).toEqual([])
    for (const bad of ['duration-300', 'duration-1000', 'ease-in', 'ease-in-out', 'delay-150', 'transition-all', 'hover:duration-700', 'motion-safe:ease-out', 'animate-pulse']) {
      expect(fileBreaksIn(LOAD_BAR_FILE, bad).length, bad).toBeGreaterThan(0)
    }
  })

  it('AC-405.3: 검사 목록 파일 가운데 duration-700·ease-out을 쓰는 곳은 LoadBar.tsx뿐이다', () => {
    const users = ruleFiles().filter((file) =>
      stringPieces(file)
        .flatMap(tokens)
        .some((t) => t === 'duration-700' || t === 'ease-out'),
    )
    expect(users).toEqual([LOAD_BAR_FILE])
  })
})

// ── bit-dashboard AC-601.17 읽는 표시 예외 (design.md '결정', UI_GUIDE '움직임 › 비트 읽는 표시'): 움직임은 globals.css의 .bit-read-bar·.bit-read-spin 둘뿐이다.
// Tailwind animate-* 금지는 ReadStatus.tsx를 포함해 그대로다. 윈도우에서도 돌도록 경로 글자를 / 로 맞춘다
describe('AC-601.17: 규칙 — 움직이는 표시 예외는 ReadStatus.tsx의 클래스 이름 둘뿐이고 animate-*는 그대로 막는다', () => {
  const READ_STATUS = 'src/components/dashboard/live/ReadStatus.tsx'
  const GLOBALS_CSS = 'src/app/globals.css'
  const srcFiles = () =>
    walk('src')
      .map((file) => file.replace(/\\/g, '/'))
      .filter((file) => /\.(?:tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file))

  it('AC-601.17: .bit-read-* 클래스를 쓰는 앱 소스는 ReadStatus.tsx 하나이고, 이름은 둘뿐이다', () => {
    const users = srcFiles().filter((file) => file !== GLOBALS_CSS && /bit-read/.test(code(file)))
    expect(users).toEqual([READ_STATUS])
    const names = new Set(stringPieces(READ_STATUS).flatMap(tokens).filter((t) => t.includes('bit-read')))
    expect([...names].sort()).toEqual(['bit-read-bar', 'bit-read-spin'])
  })

  it('AC-601.17: @keyframes·animation 선언은 src/에서 globals.css에만 있다', () => {
    const users = srcFiles().filter((file) => /@keyframes|\banimation(?:-[\w-]+)?\s*:/.test(code(file)))
    expect(users).toEqual([GLOBALS_CSS])
  })

  it.each(['animate-spin', 'animate-pulse', 'animate-bit-read-bar', 'motion-safe:animate-spin', 'hover:animate-spin', '!animate-spin'])(
    'AC-601.17: ReadStatus.tsx에서도 %s는 그대로 잡는다',
    (bad) => {
      expect(fileBreaksIn(READ_STATUS, bad).length, bad).toBeGreaterThan(0)
    },
  )

  it('AC-601.17: ReadStatus.tsx의 클래스 글자가 규칙을 지키고, 규칙 예외 목록에 들지 않는다', () => {
    expect(stringPieces(READ_STATUS).flatMap((piece) => fileBreaksIn(READ_STATUS, piece))).toEqual([])
    expect(RULE_EXCEPTIONS[READ_STATUS]).toBeUndefined()
  })

  it('AC-601.17: 두 이름은 시안의 도는 원을 rounded-full이나 overflow-hidden 없이 그린다(그 값은 globals.css에만 있다)', () => {
    const used = stringPieces(READ_STATUS).flatMap(tokens)
    for (const banned of ['rounded-full', 'overflow-hidden']) expect(used, banned).not.toContain(banned)
  })
})

// ── AC-407.1 대비 (ui-90 REQ-407, UI_GUIDE '대비'): 글자색 text-faint를 규칙 시험이 잡는다. 차트 표시 bg-faint는 그대로 된다
describe('AC-407.1: 규칙 — 글자색 text-faint(변형 앞말 포함)를 잡고 bg-faint는 통과한다', () => {
  it.each(['text-faint', 'hover:text-faint', 'max-md:text-faint', 'group-hover:text-faint', 'not-disabled:hover:text-faint', 'text-faint/60', '!text-faint'])(
    'AC-407.1: 글자색 %s를 대비 규칙으로 잡는다',
    (bad) => {
      expect(ruleBreaks(bad), bad).toContain('대비 — 글자는 muted 이상')
    },
  )

  it.each(['bg-faint', 'max-md:bg-faint', 'text-muted', 'hover:text-muted', 'text-ink-2'])('AC-407.1: %s는 그냥 둔다', (ok) => {
    expect(ruleBreaks(ok), ok).toEqual([])
  })

  it('AC-407.1: ds와 검사 목록 파일 전체에 글자색 text-faint가 없다', () => {
    const faintText = (classes: string) => tokens(classes).filter((t) => /^text-faint(?:\/\d+)?$/.test(parseClass(t).utility))
    for (const [path, value] of DS_ALL()) expect(faintText(value), path).toEqual([])
    const files = ruleFiles()
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) expect(stringPieces(file).flatMap(faintText), file).toEqual([])
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

describe('AC-204.6: 로그인 화면(LoginCard·LoginAside·GoogleMark)이 AC-204.6 검사 목록에 든다 (b2b-redesign TASK-16)', () => {
  it('AC-204.6: AC-204.6 검사 목록 파일에 로그인 화면 세 파일이 있고 모두 실제 파일이다', () => {
    expect(ruleFiles()).toEqual(expect.arrayContaining(LOGIN_FILES))
    for (const file of LOGIN_FILES) expect(existsSync(join(ROOT, file)), file).toBe(true)
  })
})

describe('AC-204.6: 승인 대기·거절 화면(PendingCard)이 AC-204.6 검사 목록에 든다 (b2b-redesign TASK-18)', () => {
  it('AC-204.6·AC-216.1·AC-216.2: AC-204.6 검사 목록 파일에 src/components/auth/PendingCard.tsx가 있고 실제 파일이다', () => {
    expect(ruleFiles()).toEqual(expect.arrayContaining(PENDING_FILES))
    for (const file of PENDING_FILES) expect(existsSync(join(ROOT, file)), file).toBe(true)
  })
})

describe('AC-204.6: 가입 신청 화면(SignupForm·Stepper)이 AC-204.6 검사 목록에 든다 (b2b-redesign TASK-17)', () => {
  it('AC-204.6·AC-215.1: AC-204.6 검사 목록 파일에 가입 신청 두 파일이 있고 모두 실제 파일이다', () => {
    expect(ruleFiles()).toEqual(expect.arrayContaining(SIGNUP_FILES))
    for (const file of SIGNUP_FILES) expect(existsSync(join(ROOT, file)), file).toBe(true)
  })
})

describe('AC-204.6: 오류 카드·오류 화면(ErrorCard·error.tsx)이 AC-204.6 검사 목록에 든다 (b2b-redesign TASK-19)', () => {
  it('AC-204.6·AC-217.1·AC-217.2: AC-204.6 검사 목록 파일에 오류 카드·오류 화면 두 파일이 있고 모두 실제 파일이다', () => {
    expect(ruleFiles()).toEqual(expect.arrayContaining(ERROR_FILES))
    for (const file of ERROR_FILES) expect(existsSync(join(ROOT, file)), file).toBe(true)
  })
})

// ── ui-90 REQ-408: 청구 폴더(components/claim)도 앱 화면 규칙 시험에 든다(TASK-5).
// 시험 파일 밖 청구 소스 전부가 AC-013.2·AC-204.6 검사 목록에 들고 간격·글자·모서리·장식·움직임·ui 금지 규칙을 지킨다.
// 그림은 직접 그린 svg와 ✓·✗ 글자 대신 공용 Icon(stop·check·x)이다(AC-408.2). 그려진 아이콘 모양은 SetupScreen.test가 본다
const CLAIM_DIR = 'src/components/claim'
const claimSources = () => walk(CLAIM_DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
// 청구 화면 네 파일(설치·연결 확인 · 오류 상자 · 안내 상자 · /claim 자리)
const CLAIM_SCREENS = ['SetupScreen.tsx', 'SetupAlert.tsx', 'StepGuide.tsx', 'ClaimEntry.tsx'].map((f) => `${CLAIM_DIR}/setup/${f}`)
// 직접 그린 svg 태그와 ✓·✗ 글자(주석까지 본다)
const DRAWN_MARK = /<svg\b|[✓✗]/

describe('AC-408.1: 청구 폴더(components/claim)가 앱 화면 규칙 시험에 든다', () => {
  it('AC-408.1: 앱 화면 폴더 목록(APP_DIRS)과 AC-204.6 검사 대상에 src/components/claim이 있다', () => {
    expect(APP_DIRS).toContain(CLAIM_DIR)
    expect(RULE_TARGETS).toContain(CLAIM_DIR)
  })

  it('AC-408.1: 시험 파일 밖 청구 소스가 모두 AC-013.2·AC-204.6 검사 목록에 있다(화면 네 파일이 있어 빈 검사가 아니고, 시험 파일은 빠진다)', () => {
    const files = claimSources()
    expect(files).toEqual(expect.arrayContaining(CLAIM_SCREENS))
    expect(sources()).toEqual(expect.arrayContaining(files))
    expect(ruleFiles()).toEqual(expect.arrayContaining(files))
    expect([...sources(), ...ruleFiles()].filter((f) => f.startsWith(`${CLAIM_DIR}/`) && /\.test\.tsx?$/.test(f))).toEqual([])
  })

  it('AC-408.1: 청구 소스의 클래스 글자가 간격 단계·글자 11단계·토큰 모서리·장식 없음·짧은 반응 규칙을 지킨다', () => {
    for (const file of claimSources()) expect(stringPieces(file).flatMap(breaksIn), file).toEqual([])
  })

  it('AC-408.1: 청구 소스에 CSS Module·임의 색·Tailwind 기본 색이 없고, ui를 쓰지 않으며 classes에서 ds만 불러온다', () => {
    const imports: string[][] = []
    for (const file of claimSources()) {
      const text = code(file)
      expect(text, file).not.toMatch(/\.module\.css['"]/)
      expect(text, file).not.toMatch(ARBITRARY_COLOR)
      expect(text, file).not.toMatch(PALETTE)
      expect(text, file).not.toMatch(/(?<![\w.$])ui\.[A-Za-z]/)
      for (const m of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"][^'"]*\/ui\/classes['"]/g)) {
        imports.push(m[1].split(',').map((n) => n.trim()).filter(Boolean))
      }
    }
    expect(imports.length).toBeGreaterThan(0)
    for (const names of imports) expect(names).toEqual(['ds'])
  })
})

describe('AC-408.2: 청구 소스는 직접 그린 svg와 ✓·✗ 글자 대신 Icon(stop·check·x)을 쓴다', () => {
  it('AC-408.2: 시험 파일 밖 청구 소스에 <svg와 "✓"·"✗" 글자가 없다', () => {
    const files = claimSources()
    expect(files).toEqual(expect.arrayContaining(CLAIM_SCREENS))
    for (const file of files) expect(readFileSync(join(ROOT, file), 'utf8'), file).not.toMatch(DRAWN_MARK)
  })

  it('AC-408.2: 검사 규칙 자체가 잡아야 할 것을 잡는다', () => {
    for (const bad of ['<svg aria-hidden="true">', '<svg\n  width="16"', '<span aria-hidden="true">✓&nbsp;</span>완료', '✗&nbsp;없음', '// 5단계를 ✓/✗로']) {
      expect(bad).toMatch(DRAWN_MARK)
    }
    for (const ok of ['<Icon name="check" size={12} />', '<Icon name="x" size={12} />', "querySelector('svg')", '<svgPath />', '완료']) {
      expect(ok).not.toMatch(DRAWN_MARK)
    }
  })
})

// ── AC-221.1: 옛 이름 정리 — ui는 대시보드 빈 자리가 쓰는 세 키만, ui 참조는 classes.ts와 DashboardEmpty.tsx에만(AC-313.3), ds에 쓰지 않는 키가 없다
// 시험 파일 밖 src/의 .ts·.tsx 전부
const srcSources = () => walk('src').filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
// ds 키 하나를 그대로 부르는가(ds.button.primary는 ds.button.primaryLarge와 다르다)
const callsKey = (text: string, key: string) => new RegExp(`(?<![\\w.$])ds\\.${key.replace(/\./g, '\\.')}(?![\\w$])`).test(text)
// 다른 ds 키 안에 들어 있어 따로 부르지 않는 키: 초점 고리(단추·글자 단추·체크 상자가 같이 쓴다, AC-204.1)
const INSIDE_OTHER_KEYS = ['focusRing']
// REQ-204(AC-204.1·AC-204.4·AC-204.5)가 정한 키지만 대시보드 본문을 이 명세에서 뺀 뒤(2026-10-31, design.md '대시보드 본문 빼기') 쓰는 화면이 없는 키.
// 차트 부품처럼 다음 대시보드 명세가 쓴다 — 그때 이 목록을 비운다
// ui-90: button.ghost(AC-406.2)는 ② TASK-8 오류 화면 [로그아웃]이 쓰기 전까지 쓰는 화면이 없다(목록에 있어도 쓰면 실패하지 않는다)
const NEXT_DASHBOARD_KEYS = ['button.primarySmall', 'panel', 'panelHead', 'panelTitle', 'panelBody', 'count', 'table.tdNum', 'table.check', 'button.ghost']

describe('AC-221.1: 옛 모양 묶음 ui는 대시보드 빈 자리가 쓰는 세 키만 남는다', () => {
  it('AC-221.1: ui의 키는 card·panel·panelTitle 셋뿐이고 값은 한 글자도 바뀌지 않았다', () => {
    expect(leaves(ui)).toEqual(Object.entries(KEPT_UI))
  })

  it('AC-221.1·AC-313.3: ui. 참조와 ui 불러오기는 시험 파일 밖 src/에서 classes.ts와 DashboardEmpty.tsx에만 있다', () => {
    const files = srcSources()
    expect(files).toEqual(expect.arrayContaining([CLASSES_FILE, OLD_DASHBOARD_FILE, 'src/components/shell/AppShell.tsx']))
    const usesUi = (file: string) => {
      const text = code(file)
      return /(?<![\w.$])ui\.[A-Za-z]/.test(text) || /import\s*(?:type\s*)?\{[^}]*\bui\b[^}]*\}\s*from\s*['"][^'"]*classes['"]/.test(text)
    }
    expect(files.filter(usesUi).filter((f) => f !== CLASSES_FILE && f !== OLD_DASHBOARD_FILE)).toEqual([])
    // 대시보드 빈 자리는 아직 ui를 쓴다(그래서 세 키가 남는다)
    expect(usesUi('src/components/dashboard/DashboardEmpty.tsx')).toBe(true)
  })

  it('AC-221.1: DashboardEmpty.tsx 밖의 앱 화면·차트·미리보기는 classes에서 ds만 불러온다', () => {
    const imports = srcSources()
      .filter((f) => f !== CLASSES_FILE && f !== OLD_DASHBOARD_FILE)
      .flatMap((f) => [...code(f).matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"][^'"]*\/ui\/classes['"]/g)].map((m) => [f, m[1].split(',').map((n) => n.trim()).filter(Boolean)] as const))
    expect(imports.length).toBeGreaterThan(0)
    for (const [file, names] of imports) expect(names, file).toEqual(['ds'])
  })

  it('AC-221.1: ds의 키는 모두 어느 화면이 쓴다(다른 키 안에 든 초점 고리와 다음 대시보드 명세가 쓸 키는 빼고)', () => {
    const texts = srcSources()
      .filter((f) => f !== CLASSES_FILE)
      .map((f) => code(f))
    const unused = DS_KEYS.filter((key) => !texts.some((text) => callsKey(text, key)))
    const allowed = new Set([...INSIDE_OTHER_KEYS, ...NEXT_DASHBOARD_KEYS])
    expect(unused.filter((key) => !allowed.has(key))).toEqual([])
    // 예외 목록은 ds에 있는 키다(지운 키를 적어 두지 않는다)
    for (const key of allowed) expect(DS_KEYS as readonly string[], key).toContain(key)
    // 초점 고리는 쓰는 단추 묶음 안에 들어 있다
    for (const key of INSIDE_OTHER_KEYS) {
      const users = DS_KEYS.filter((other) => other !== key && !unused.includes(other) && has(dsAt(other), ...tokens(dsAt(key))))
      expect(users.length, key).toBeGreaterThan(0)
    }
  })

  it('AC-221.1: 키 부르기 검사는 키 이름 전체만 잡는다', () => {
    expect(callsKey('className={ds.button.primaryLarge}', 'button.primary')).toBe(false)
    expect(callsKey('className={ds.button.primary}', 'button.primary')).toBe(true)
    expect(callsKey('`${ds.table.td} x`', 'table.td')).toBe(true)
    expect(callsKey('`${ds.table.tdSub}`', 'table.td')).toBe(false)
    expect(callsKey('cls.ds.panel', 'panel')).toBe(false)
  })
})

describe('AC-221.2: 규칙 시험은 검사 목록 없이 앱 화면 전체를 본다', () => {
  it('AC-221.2·AC-313.3: AC-204.6 검사 파일은 앱 화면 폴더 전체(+ charts·preview, error.tsx)이고 옛 빈 자리 DashboardEmpty.tsx만 빠진다', () => {
    expect([...ruleFiles()].sort()).toEqual(sources().filter((f) => f !== OLD_DASHBOARD_FILE).sort())
    expect(ruleFiles()).toEqual(
      expect.arrayContaining([
        'src/components/auth/SignOutButton.tsx',
        'src/components/shell/IdleLogout.tsx',
        'src/components/shell/menu.ts',
        'src/components/common/LogoMark.tsx',
        'src/components/admin/applications.ts',
        CLASSES_FILE,
        'src/app/login/page.tsx',
        'src/app/(onboarding)/signup/page.tsx',
        'src/app/(onboarding)/pending/page.tsx',
        'src/app/(app)/layout.tsx',
        'src/app/(app)/admin/page.tsx',
        'src/app/error.tsx',
        'src/components/dashboard/todayTitle.ts',
        'src/app/(app)/dashboard/page.tsx',
      ]),
    )
    expect(ruleFiles().filter(isOldDashboard)).toEqual([])
    // AC-013.2(옛 앱 화면 색 검사)는 DashboardEmpty.tsx도 계속 본다
    expect(sources()).toContain(OLD_DASHBOARD_FILE)
  })

  it('AC-221.2: classes.ts는 파일 글자를 보되 남는 ui 세 키의 값만 뺀다', () => {
    const pieces = stringPieces(CLASSES_FILE)
    for (const value of Object.values(KEPT_UI)) expect(pieces).not.toContain(value)
    expect(pieces.join(' ')).toContain('rounded-control')
  })
})

// ── AC-313.3: 대시보드 두 폴더는 옛 빈 자리 한 파일만 빼고 규칙 검사(간격·글자·모서리·장식·움직임)와 ui 금지 검사를 받는다.
// 병렬 갈래(briefing·summary)가 새 파일을 만들자마자 규칙을 받는지는 빠짐 판정 함수에 이름만 만든 파일을 넣어 본다
describe('AC-313.3: 대시보드 두 폴더의 시험 밖 파일은 DashboardEmpty.tsx 하나만 검사에서 빠진다', () => {
  it('AC-313.3: 검사 목록에 todayTitle.ts와 dashboard/page.tsx가 들고 DashboardEmpty.tsx만 빠진다', () => {
    const files = ruleFiles()
    expect(files).toEqual(expect.arrayContaining(['src/components/dashboard/todayTitle.ts', 'src/app/(app)/dashboard/page.tsx']))
    const dashboardSources = sources().filter((f) => f.startsWith('src/components/dashboard/') || f.startsWith('src/app/(app)/dashboard/'))
    expect(dashboardSources.filter((f) => !files.includes(f))).toEqual([OLD_DASHBOARD_FILE])
  })

  it.each([
    'src/components/dashboard/briefing/X.tsx',
    'src/components/dashboard/summary/X.ts',
    'src/components/dashboard/X.tsx',
    'src/app/(app)/dashboard/X.tsx',
    'src/components/dashboard/todayTitle.ts',
    'src/app/(app)/dashboard/page.tsx',
    'src/components/dashboard',
  ])('AC-313.3: 빠짐 판정은 대시보드 폴더의 %s를 빼지 않는다', (file) => {
    expect(isOldDashboard(file), file).toBe(false)
  })

  it('AC-313.3: 빠짐 판정은 옛 빈 자리 DashboardEmpty.tsx만 뺀다', () => {
    expect(isOldDashboard(OLD_DASHBOARD_FILE)).toBe(true)
  })
})

// ── AC-221.2·AC-204.7: 상자 겹침 — REQ-213~REQ-218·REQ-220 화면 전부(대시보드 본문은 이 명세가 고치지 않아 들지 않는다).
// 화면마다의 시험은 본문만 그린다. 여기서는 페이지처럼 틀(AuthFrame·AppShell) 안에 넣어 틀과 본문 사이의 겹침까지 본다.
// 실제 Supabase·Next 라우터에 붙지 않는다
const { insert, order, rpc, router } = vi.hoisted(() => ({
  insert: vi.fn(),
  order: vi.fn(),
  rpc: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() },
}))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: () => ({ insert, select: () => ({ order }) }),
    rpc,
    auth: { signOut: vi.fn(), signInWithOAuth: vi.fn() },
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/admin' }))

const EMAIL = 'manager@example.com'
const HOSPITAL = '가나 정형외과의원'
const KAKAO =
  'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36;KAKAOTALK 2410420'
const PENDING: PendingHospital = { id: 'h1', name: HOSPITAL, applicantName: '홍길동', phone: '01000001234', email: EMAIL, status: 'pending', createdAt: '2026-10-28T01:23:45+00:00' }
const REJECTED: PendingHospital = { ...PENDING, id: 'h4', status: 'rejected' }
const DB_ROWS = [
  { id: 'r1', name: HOSPITAL, applicant_name: '홍길동', phone: '01000001234', email: EMAIL, status: 'pending', created_at: '2026-10-28T01:00:00+00:00' },
  { id: 'r4', name: '사아 의원', applicant_name: '박민수', phone: null, email: 'minsu@example.com', status: 'rejected', created_at: '2026-10-22T03:00:00+00:00' },
  { id: 'r3', name: '마바 정형외과의원', applicant_name: '이영희', phone: '0212345678', email: 'younghee@example.com', status: 'approved', created_at: '2026-10-20T03:00:00+00:00' },
]
type NextErrorProps = { error: Error & { digest?: string }; reset: () => void }

// 페이지 파일(login·signup·pending/page.tsx, error.tsx)과 같은 틀 짜임
const loginPage = (failed: boolean) => h(AuthFrame, { aside: h(LoginAside), children: h(LoginCard, { failed }) })
const signupPage = () => h(AuthFrame, { children: h(SignupForm, { email: EMAIL }) })
const pendingPage = (hospital: PendingHospital) => h(AuthFrame, { headerEnd: h(HeaderSignOut), children: h(PendingCard, { hospital }) })
const errorPage = () => h(PageError as ComponentType<NextErrorProps>, { error: new Error('x'), reset: () => {} })
// (app)/layout.tsx + admin/page.tsx: 앱 틀 안의 관리자 화면
const adminPage = () => h(AppShell, { hospitalName: HOSPITAL, email: EMAIL, isAdmin: true, children: h(AdminApplications) })
const noNested = (label: string) => expect(nestedBoxes(document.body), label).toEqual([])

describe('AC-221.2·AC-204.7: 틀째 그린 앱 화면 전부에 상자 안 상자가 없다', () => {
  beforeEach(() => {
    insert.mockReset()
    insert.mockResolvedValue({ data: null, error: null, status: 201 })
    order.mockReset()
    order.mockResolvedValue({ data: DB_ROWS, error: null, status: 200 })
    rpc.mockReset()
    rpc.mockResolvedValue({ data: null, error: null, status: 204 })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it.each<[string, () => ReturnType<typeof h>]>([
    ['REQ-213·REQ-214 로그인(일반)', () => loginPage(false)],
    ['REQ-214 로그인(오류)', () => loginPage(true)],
    ['REQ-213·REQ-215 가입 신청(처음)', signupPage],
    ['REQ-216 승인 대기', () => pendingPage(PENDING)],
    ['REQ-216 거절', () => pendingPage(REJECTED)],
    ['REQ-217 오류 화면', errorPage],
  ])('AC-204.7: %s', (label, page) => {
    render(page())
    expect(screen.getAllByRole('main')).toHaveLength(1)
    noNested(label)
  })

  it('AC-204.7: REQ-214 로그인(앱 안 브라우저 — 안내 + 읽기 전용 주소 칸)', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(KAKAO)
    render(loginPage(false))
    await screen.findByText('크롬·엣지에서 열어 주세요')
    noNested('앱 안 브라우저')
  })

  // 칸은 이름 끝("…이름 필수")·역할로만 고른다 — 칸 순서·칸 이름 앞말·틀린 칸 문구·동의 문구에 기대지 않는다(ui-90 TASK-16이 그 문구를 바꾼다)
  it('AC-204.7: REQ-215 가입 신청(틀린 칸 문구 · 저장 실패 오류 카드)', async () => {
    const user = userEvent.setup()
    render(signupPage())
    await user.click(screen.getByRole('button', { name: '가입 신청' }))
    await waitFor(() => expect(document.querySelector('[aria-invalid="true"]')).not.toBeNull())
    noNested('틀린 칸')
    insert.mockResolvedValue({ data: null, error: { code: '23514', message: 'x' }, status: 400 })
    const nameFields = screen.getAllByRole('textbox', { name: /이름\s*필수$/ })
    expect(nameFields).toHaveLength(2) // 의원 이름 · 신청자 이름
    for (const [i, field] of nameFields.entries()) await user.type(field, i === 0 ? HOSPITAL : '홍길동')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '가입 신청' }))
    await screen.findByRole('alert')
    noNested('저장 실패')
  })

  it('AC-204.7: REQ-218·REQ-220 앱 틀 + 관리자(세 탭·확인 창·계정 메뉴)', async () => {
    const user = userEvent.setup()
    render(adminPage())
    await screen.findByRole('tablist', { name: '신청 상태' })
    const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label} \\d+$`) })
    for (const label of ['대기', '승인', '거절']) {
      await user.click(tab(label))
      noNested(`관리자 ${label} 탭`)
    }
    await user.click(screen.getByRole('button', { name: new RegExp(EMAIL) }))
    expect(screen.getByRole('menu', { name: '계정' })).toBeTruthy()
    noNested('계정 메뉴')
    await user.keyboard('{Escape}')
    await user.click(tab('대기'))
    const row = screen.getByRole('cell', { name: HOSPITAL }).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: '거절' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    noNested('확인 창')
    // 빈 검사가 아니다: 확인 창은 테두리 상자다
    expect(Array.from(document.body.querySelectorAll('*')).some(isBorderBox)).toBe(true)
  })
})
