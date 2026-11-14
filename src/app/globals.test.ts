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

// 비트 읽는 표시 둘 (bit-dashboard AC-601.17, design.md '결정'): 사용자 결정으로 이 둘만 @keyframes를 쓴다. 값은 시안 docs/mockups/bit-dashboard/css_extra.css.
// first90(design.md 5-3, AC-4417.1·AC-4417.3)이 통계 화면 움직임 키프레임 셋(st-donut·st-rise·st-in)을 더했다. 그 밖의 키프레임은 없다
describe('AC-601.17·AC-4417.1: 움직이는 것은 비트 읽는 표시 둘과 통계 화면 움직임뿐이다', () => {
  it('AC-601.17·AC-4417.1·AC-4417.3: @keyframes는 정확히 bit-read-bar·bit-read-spin과 통계 화면 셋(st-donut·st-rise·st-in)이다', () => {
    expect([...css().matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])).toEqual(['bit-read-bar', 'bit-read-spin', 'st-donut', 'st-rise', 'st-in'])
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

  it('AC-601.17·AC-4417.1·AC-4417.3: animation 선언은 두 표시의 것과 통계 화면 셋(도넛·빗금 막대·꼬리표)과 모션 줄이기 전체 끄기뿐이고, animation-* 낱개 선언이 없다', () => {
    const found = [...css().matchAll(ANIMATION_DECL)].map((m) => `${m[1]}: ${m[2].trim().replace(/\s+/g, ' ')}`)
    expect(found).toEqual([
      'animation: bit-read-bar 1.6s ease-in-out infinite',
      'animation: bit-read-spin 800ms linear infinite',
      'animation: st-donut var(--st-t-first) ease-out',
      'animation: st-rise var(--st-t-toggle) ease-out',
      'animation: st-in var(--st-t-toggle) ease-out',
      'animation: none !important',
    ])
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

// ── 통계 화면 움직임 (first90 REQ-4417, design.md 5-3·5-2, UI_GUIDE '통계 화면(first90)'). 움직임은 CSS만 한다 — 차트 부품은 이 이름을 붙이기만 한다.
// 시간은 :root 토큰(--st-t-toggle 200ms · --st-t-period 300ms · --st-t-first 450ms, theme.test.ts가 값을 본다)을 가리킨다
const ST_MOTION_RULES = ['.st-donut .seg', '.st-move-period', '.st-move-heat', '.st-move-toggle', '.st-rise', '.st-tag-in']
// 바탕 강조(.st-flash)는 움직임을 켠 기기에서만 있다
const noPreferenceBlocks = () => [...css().matchAll(/@media\s*\(\s*prefers-reduced-motion:\s*no-preference\s*\)\s*\{([\s\S]*?\})\s*\}/g)].map((m) => m[1])

describe('AC-4417.1·AC-4417.2·AC-4417.3·AC-4417.4: 통계 화면 움직임 이름(st-*)은 globals.css의 CSS만으로 움직인다', () => {
  it('AC-4417.1: 도넛 조각(.st-donut .seg)은 붙을 때 한 번 450ms 그려진다 — stroke-dasharray 0 → 제 길이(둘레 100), 되풀이·채움(fill-mode) 없음', () => {
    expect(declsOf(css(), '.st-donut .seg')).toEqual({ animation: 'st-donut var(--st-t-first) ease-out' })
    expect(css().replace(/\s+/g, ' ')).toContain('@keyframes st-donut { from { stroke-dasharray: 0 100; } }')
    // 끝 값(to)은 조각 제 값이다 — 끝나면 그 값 그대로라 다시 그려도(값만 바뀜) 되풀이하지 않는다
    expect(css().replace(/\s+/g, ' ')).not.toMatch(/@keyframes st-donut \{[^}]*\} to\b/)
  })

  it('AC-4417.2: 기간을 바꾸면 막대 높이·가로 막대 폭·횟수 막대(flex-basis)·도넛 조각이 300ms ease-out, 시간대 칸 색이 200ms 바뀐다', () => {
    expect(declsOf(css(), '.st-move-period')).toEqual({
      'transition-property': 'height, width, flex-basis, stroke-dasharray, stroke-dashoffset',
      'transition-duration': 'var(--st-t-period)',
      'transition-timing-function': 'ease-out',
    })
    expect(declsOf(css(), '.st-move-heat')).toEqual({
      'transition-property': 'background-color, color',
      'transition-duration': 'var(--st-t-toggle)',
    })
  })

  it('AC-4417.3: 스위치 손잡이는 옮김 200ms, 빗금 막대는 아래 기준으로 솟음 200ms, "참고 포함" 꼬리표는 투명도 200ms다', () => {
    // Tailwind v4의 translate-x-*는 transform이 아니라 translate 속성을 쓴다 → 둘 다 옮긴다
    expect(declsOf(css(), '.st-move-toggle')).toEqual({
      'transition-property': 'transform, translate',
      'transition-duration': 'var(--st-t-toggle)',
      'transition-timing-function': 'ease-out',
    })
    expect(declsOf(css(), '.st-rise')).toEqual({ 'transform-origin': 'bottom', animation: 'st-rise var(--st-t-toggle) ease-out' })
    expect(css().replace(/\s+/g, ' ')).toContain('@keyframes st-rise { from { transform: scaleY(0); } to { transform: scaleY(1); } }')
    expect(declsOf(css(), '.st-tag-in')).toEqual({ animation: 'st-in var(--st-t-toggle) ease-out' })
    expect(css().replace(/\s+/g, ' ')).toContain('@keyframes st-in { from { opacity: 0; } to { opacity: 1; } }')
  })

  it('AC-4417.3·AC-4417.4: 매출 요약 칸 바탕 강조(.st-flash)는 옅은 파랑(--accent-soft)이고, 움직임을 켠 기기(no-preference) 블록 하나 안에만 있다', () => {
    const blocks = noPreferenceBlocks()
    expect(blocks).toHaveLength(1)
    expect(declsOf(blocks[0]!, '.st-flash')).toEqual({ 'background-color': 'var(--accent-soft)' })
    // 블록 안에는 .st-flash 하나뿐이고, 블록 밖에는 .st-flash 규칙이 없다
    expect([...blocks[0]!.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim())).toEqual(['.st-flash'])
    const outside = css().replace(/@media\s*\(\s*prefers-reduced-motion:\s*no-preference\s*\)\s*\{[\s\S]*?\}\s*\}/g, '')
    expect(outside).not.toContain('.st-flash')
  })

  it('AC-4417.4: 모션 줄이기 기기에서는 전역 끄기가 통계 화면 움직임도 모두 끈다 — st-* 규칙은 !important를 쓰지 않아 전역 끄기를 이기지 못한다', () => {
    expect(motionBlock()).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{\s*animation:\s*none\s*!important;\s*transition:\s*none\s*!important/)
    for (const selector of ST_MOTION_RULES) {
      const decls = declsOf(css(), selector)
      expect(Object.keys(decls).length, selector).toBeGreaterThan(0)
      for (const [prop, value] of Object.entries(decls)) expect(value, `${selector} ${prop}`).not.toContain('!important')
      // 움직임은 animation·transition 선언으로만 한다(끄기가 닿는 속성)
      expect(Object.keys(decls).filter((prop) => !/^(?:animation|transition-(?:property|duration|timing-function)|transform-origin)$/.test(prop)), selector).toEqual([])
    }
    expect(css()).not.toMatch(/st-[\w-]+[^{}]*\{[^}]*!important/)
  })

  it('AC-4417.4: 통계 화면 움직임 이름은 정한 일곱(st-move-period·st-move-heat·st-move-toggle·st-donut·st-rise·st-tag-in·st-flash)뿐이다', () => {
    const names = new Set([...css().matchAll(/\.(st-[\w-]+)/g)].map((m) => m[1]))
    expect([...names].sort()).toEqual(['st-donut', 'st-flash', 'st-move-heat', 'st-move-period', 'st-move-toggle', 'st-rise', 'st-tag-in'])
  })
})

// 통계 화면 바탕 (first90 AC-4411.1, design.md 5-5 '화면 바탕'): StatsScreen 맨 바깥의 data-st-canvas 표시를 보고 앱 본문 main#main을 회색으로 칠한다.
// main의 bg-surface는 Tailwind utilities layer에 있다 → 같은 @layer utilities 안에서 id 선택자(#main)가 클래스(.bg-surface)를 이긴다.
// layer 밖 선택자 목록(theme.test AC-202.4)은 늘리지 않는다. 화면(screen)에서만 칠해 인쇄는 main의 흰 바탕 그대로다
const CANVAS_RULE = '#main:has([data-st-canvas])'
// 이름 붙은 @layer 블록 몸통 전부(괄호 짝 맞춤, 파일 순서대로)
const layerBlocks = (text: string, name: string): string[] => {
  const out: string[] = []
  for (const m of text.matchAll(new RegExp(`@layer\\s+${name}\\s*\\{`, 'g'))) {
    const open = m.index + m[0].length - 1
    let depth = 0
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++
      if (text[i] === '}' && --depth === 0) {
        out.push(text.slice(open + 1, i))
        break
      }
    }
  }
  return out
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('AC-4411.1: 통계 화면 바탕(#main:has([data-st-canvas]))', () => {
  it('AC-4411.1: @layer utilities 안 @media screen 규칙 하나가 #main:has([data-st-canvas]) 바탕을 var(--st-canvas)로 칠하고, 다른 곳(layer 밖·인쇄)에는 이 규칙이 없다', () => {
    const text = css()
    expect(text.split(CANVAS_RULE).length - 1, '규칙은 한 번만 있다').toBe(1)
    const inUtilities = layerBlocks(text, 'utilities').filter((body) => body.includes(CANVAS_RULE))
    expect(inUtilities, '@layer utilities 안에 있다').toHaveLength(1)
    const screenBody = inUtilities[0]!.match(new RegExp(`@media\\s+screen\\s*\\{\\s*${escapeRe(CANVAS_RULE)}\\s*\\{([^{}]*)\\}\\s*\\}`))?.[1]
    expect(screenBody, '@media screen 안에 있다(인쇄는 흰 바탕)').toBeDefined()
    expect(declsOf(`${CANVAS_RULE} {${screenBody}}`, CANVAS_RULE)).toEqual({ 'background-color': 'var(--st-canvas)' })
    expect(text).not.toMatch(/@media\s+print/)
  })

  it('AC-4411.1: 실제 Tailwind로 돌린 CSS에서도 그 규칙이 main의 .bg-surface와 같은 utilities layer에 남는다(id 선택자라 클래스를 이긴다)', async () => {
    const { default: postcss } = await import('postcss')
    const { default: tailwind } = await import('@tailwindcss/postcss')
    const out = (await postcss([tailwind({ base: ROOT, optimize: false })]).process(read(GLOBALS), { from: GLOBALS })).css
    const utilities = layerBlocks(out, 'utilities').join('\n')
    expect(utilities).toContain('.bg-surface {')
    expect(utilities).toMatch(new RegExp(`@media screen\\s*\\{\\s*${escapeRe(CANVAS_RULE)}\\s*\\{\\s*background-color:\\s*var\\(--st-canvas\\);?\\s*\\}`))
    expect(out.split(CANVAS_RULE).length - 1, 'Tailwind가 규칙을 옮기거나 겹쳐 만들지 않는다').toBe(1)
  }, 30_000)
})

describe('AC-005.3: 금지한 장식', () => {
  it('AC-005.3: 랜딩 CSS에 그라데이션 글자(background-clip: text)가 없다', () => {
    for (const path of landingCss()) {
      expect(withoutComments(read(path)), path).not.toMatch(/background-clip:\s*text/)
    }
  })
})
