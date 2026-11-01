import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const GLOBALS = join(ROOT, 'src/app/globals.css')
const LANDING = join(ROOT, 'src/components/landing')

const read = (path: string) => readFileSync(path, 'utf8')
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

// 랜딩 CSS 전부: globals.css + 섹션 CSS Module
const landingCss = () => [
  GLOBALS,
  ...readdirSync(LANDING)
    .filter((name) => name.endsWith('.module.css'))
    .map((name) => join(LANDING, name)),
]

describe('AC-004.3: 모션 줄이기', () => {
  it('AC-004.3: prefers-reduced-motion: reduce 안에서 모든 요소의 animation·transition을 끈다', () => {
    const css = withoutComments(read(GLOBALS))
    const block = css.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?\})\s*\}/)
    expect(block, 'reduced-motion 블록이 없다').not.toBeNull()
    const body = block![1]
    expect(body).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{/)
    expect(body).toMatch(/animation:\s*none\s*!important/)
    expect(body).toMatch(/transition:\s*none\s*!important/)
  })
})

// 비트 읽는 표시 둘 (bit-dashboard AC-601.17, design.md '결정'): 사용자 결정으로 이 둘만 @keyframes를 쓴다. 값은 시안 docs/mockups/bit-dashboard/css_extra.css
describe('AC-601.17: 움직이는 것은 비트 읽는 표시 둘뿐이다', () => {
  const css = () => withoutComments(read(GLOBALS))
  const motionBlock = () => css().match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?\})\s*\}/)![1]
  // 선택자 하나의 선언('속성' → '값'). 같은 선택자가 둘이면 글에서 먼저 나온 것
  const declsOf = (text: string, selector: string): Record<string, string> => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const body = text.match(new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^{}]*)\\}`))?.[1]
    expect(body, `${selector} 규칙이 없다`).toBeDefined()
    return Object.fromEntries(
      body!
        .split(';')
        .map((decl) => decl.trim())
        .filter(Boolean)
        .map((decl) => {
          const colon = decl.indexOf(':')
          return [decl.slice(0, colon).trim(), decl.slice(colon + 1).trim().replace(/\s+/g, ' ')]
        }),
    )
  }

  it('AC-601.17: @keyframes는 정확히 bit-read-bar·bit-read-spin 둘이다', () => {
    expect([...css().matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])).toEqual(['bit-read-bar', 'bit-read-spin'])
  })

  // animation 선언 찾기: (속성, 값). 접두사 붙은 것도 같은 선언이다(landing/rules.test.ts의 BANNED_PROP과 같다)
  const ANIMATION_DECL = /(?:^|[;{\s])((?:-webkit-)?animation(?:-[\w-]+)?)\s*:\s*([^;}]+)/g

  it('AC-601.17: animation 선언 찾기 규칙이 접두사 붙은 선언까지 잡는다', () => {
    const props = (text: string) => [...text.matchAll(ANIMATION_DECL)].map((m) => m[1])
    expect(props('.a { animation: x 1s; }')).toEqual(['animation'])
    expect(props('.a { animation-name: x; }')).toEqual(['animation-name'])
    expect(props('.a { -webkit-animation: x 1s; }')).toEqual(['-webkit-animation'])
    expect(props('.a { -webkit-animation-name: x; }')).toEqual(['-webkit-animation-name'])
    expect(props('.a { color: var(--ink); }')).toEqual([])
  })

  it('AC-601.17: animation 선언은 두 표시의 것과 모션 줄이기 전체 끄기뿐이고, animation-* 낱개 선언이 없다', () => {
    const found = [...css().matchAll(ANIMATION_DECL)].map((m) => `${m[1]}: ${m[2].trim().replace(/\s+/g, ' ')}`)
    expect(found).toEqual(['animation: bit-read-bar 1.6s ease-in-out infinite', 'animation: bit-read-spin 800ms linear infinite', 'animation: none !important'])
  })

  it('AC-601.17: 막대는 시안 값대로 4px 띠 안에서 32% 조각이 왼쪽 밖에서 오른쪽 끝까지 흐른다(1.6초, 왕복 없음)', () => {
    expect(declsOf(css(), '.bit-read-bar')).toEqual({
      position: 'relative',
      height: '4px',
      overflow: 'clip',
      background: 'var(--line)',
      'border-radius': '2px',
    })
    expect(declsOf(css(), '.bit-read-bar::after')).toEqual({
      content: "''",
      position: 'absolute',
      top: '0',
      bottom: '0',
      width: '32%',
      background: 'var(--accent)',
      'border-radius': '2px',
      animation: 'bit-read-bar 1.6s ease-in-out infinite',
    })
    const flat = css().replace(/\s+/g, ' ')
    expect(flat).toContain('@keyframes bit-read-bar { 0% { left: -32%; } 100% { left: 100%; } }')
  })

  it('AC-601.17: 도는 표시는 시안 값대로 12px 고리가 800ms에 한 바퀴 돈다', () => {
    expect(declsOf(css(), '.bit-read-spin')).toEqual({
      width: '12px',
      height: '12px',
      border: '2px solid var(--line-strong)',
      'border-top-color': 'var(--accent)',
      'border-radius': '50%',
      animation: 'bit-read-spin 800ms linear infinite',
    })
    expect(css().replace(/\s+/g, ' ')).toContain('@keyframes bit-read-spin { to { transform: rotate(360deg); } }')
  })

  it('AC-601.17: 모션 줄이기 기기에서는 전역 규칙이 두 표시도 멈춘다 — 두 표시는 !important를 쓰지 않아 전역 끄기를 이기지 못한다', () => {
    expect(motionBlock()).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{\s*animation:\s*none\s*!important/)
    for (const selector of ['.bit-read-bar', '.bit-read-bar::after', '.bit-read-spin']) {
      for (const [prop, value] of Object.entries(declsOf(css(), selector))) expect(value, `${selector} ${prop}`).not.toContain('!important')
    }
  })

  it('AC-601.17: 멈춘 막대는 진행률로 읽히지 않게 전체 폭 옅은 띠로 선다(시안 값)', () => {
    expect(declsOf(motionBlock(), '.bit-read-bar::after')).toEqual({ left: '0', width: '100%', opacity: '.4' })
  })
})

describe('AC-005.3: 금지한 장식', () => {
  it('AC-005.3: 랜딩 CSS에 그라데이션 글자(background-clip: text)가 없다', () => {
    for (const path of landingCss()) {
      expect(withoutComments(read(path)), path).not.toMatch(/background-clip:\s*text/)
    }
  })
})
