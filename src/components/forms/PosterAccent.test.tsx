// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LOGO, layoutPoster } from '@/lib/forms/layout'
import { THEMES, isAccentHex, themeHref, themeOf } from '@/lib/forms/themes'
import type { BackgroundLook } from '@/types/formBackground'
import type { ClosureNotice, NoticeCard, ThemeArt, ThemeId } from '@/types/forms'
import { Poster } from './Poster'

// 휴진 안내 그림 — 직접 고른 글자 색 (specs/forms-accent TASK-3, REQ-4702 · AC-4702.1~4702.3, design.md 6절).
// 지금 그림 시험(Poster.test.tsx·PosterBackground.test.tsx)은 고치지 않는다. 고른 색·배경 그림·배경 강조색은 지어낸 값이다

afterEach(cleanup)

const card = (start: string, name: string, end: string | null = null, status = '휴진'): NoticeCard => ({ start, end, name, status })
const BASE: ClosureNotice = {
  year: 2027,
  month: 5,
  cards: [card('2027-05-05', '어린이날'), card('2027-05-12', '학회', '2027-05-14', '단축진료')],
  theme: null,
}
const THEME: ThemeId = 'children'
const PICKED = '#0b7a5c' // 직접 고른 글자 색 — 테마 23개·배경 강조색과 다른 값
const IMAGE = `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ${'A'.repeat(40)}==`
const BG_ACCENT = '#7a1f4d'
const BACKGROUND: BackgroundLook = { image: IMAGE, accent: BG_ACCENT }

type Look = { theme?: ThemeId; art?: ThemeArt; background?: BackgroundLook | null }
// [이름, Poster에 넘기는 그림 값, 자동 색]. 내 배경·저장 전 만든 배경은 Poster에 모두 background로 온다
const LOOKS: [string, Look, string][] = [
  ['테마 그림 1', { art: 1 }, themeOf(THEME).accent],
  ['테마 그림 2', { art: 2 }, themeOf(THEME).accent],
  ['다른 테마(성탄절) 그림 2', { theme: 'christmas', art: 2 }, themeOf('christmas').accent],
  ['AI 배경', { background: BACKGROUND }, BG_ACCENT],
  ['AI 배경(그림 2를 골라 둔 채)', { background: BACKGROUND, art: 2 }, BG_ACCENT],
]

function draw(notice: ClosureNotice, { theme = THEME, ...rest }: Look = {}) {
  const { container } = render(<Poster notice={notice} theme={theme} {...rest} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}
// 틀린 모양 값은 타입 밖의 값도 넣어 본다(표·화면 밖에서 온 값)
const withAccent = (accent: unknown): ClosureNotice => ({ ...BASE, accent: accent as string | null })
// SVG 요소 이름은 대소문자를 가린다 — localName으로 찾는다
const all = (root: Element, name: string) => [...root.querySelectorAll('*')].filter((el) => el.localName === name)
// useId로 지은 필터 이름은 그릴 때마다 달라질 수 있어 하나로 맞춘 뒤 견준다
const plain = (svg: Element) => svg.outerHTML.replace(/poster-(shadow|soft)-[\w-]+/g, 'poster-$1-ID')
const plainOf = (notice: ClosureNotice, look: Look) => {
  const html = plain(draw(notice, look))
  cleanup()
  return html
}
const textFill = (svg: Element, content: string) => {
  const found = all(svg, 'text').filter((t) => t.textContent === content)
  expect(found, content).toHaveLength(1)
  return found[0].getAttribute('fill')
}
const count = (html: string, part: string) => html.split(part).length - 1
const layout = layoutPoster(BASE)

describe('AC-4702.1: 시험 값', () => {
  it('AC-4702.1: 고른 색은 글자 색 모양이고 어느 테마·배경 강조색과도 다르다(바뀐 곳을 가려낼 수 있다)', () => {
    expect(isAccentHex(PICKED)).toBe(true)
    expect(THEMES.map((t) => t.accent)).not.toContain(PICKED)
    expect(PICKED).not.toBe(BG_ACCENT)
  })
})

describe("AC-4702.1: 고른 글자 색이 'N월'·날짜 띠·카드 아래 글에 들어간다", () => {
  it.each(LOOKS)("AC-4702.1: %s — 'N월'·날짜 띠·카드 아래 글이 모두 고른 색이다", (_, look) => {
    const svg = draw(withAccent(PICKED), look)
    expect(textFill(svg, layout.monthText)).toBe(PICKED)
    const bands = all(svg, 'path')
    expect(bands).toHaveLength(BASE.cards.length)
    for (const band of bands) expect(band.getAttribute('fill')).toBe(PICKED)
    for (const c of layout.cards) expect(textFill(svg, c.status.text), c.status.text).toBe(PICKED)
  })

  it.each(LOOKS)('AC-4702.1: %s — 그 밖(흰 날짜 글·카드 이름·카드 상자·로고·배경 그림·흰 판)은 자동일 때와 글자 하나까지 같다', (_, look, auto) => {
    const picked = plainOf(withAccent(PICKED), look)
    const now = plainOf(BASE, look)
    expect(picked).not.toContain(auto) // 자동 색은 어디에도 남지 않는다
    expect(count(picked, PICKED)).toBe(1 + 2 * BASE.cards.length) // 'N월' 하나 + 카드마다 띠·아래 글
    expect(picked.split(PICKED).join(auto)).toBe(now) // 세 곳의 색만 바뀌었다

    const svg = draw(withAccent(PICKED), look)
    for (const c of layout.cards) {
      expect(textFill(svg, c.date.text), c.date.text).toBe('#fff')
      expect(textFill(svg, c.name.text), c.name.text).toBe('#262626')
    }
    expect(textFill(svg, '진료일정안내')).toBe('#262626')
    const boxes = all(svg, 'rect').filter((rect) => rect.parentElement?.localName === 'g')
    expect(boxes.map((rect) => rect.getAttribute('fill'))).toEqual(BASE.cards.map(() => '#fff'))
    expect(svg.lastElementChild?.getAttribute('href')).toBe(LOGO.href)
    const ground = all(svg, 'image')[0].getAttribute('href')
    expect(ground).toBe(look.background ? IMAGE : themeHref(look.theme ?? THEME, look.art))
  })

  it.each([1, 2, 3, 4])('AC-4702.1: 카드 %i장 — 띠와 아래 글이 카드마다 모두 고른 색이다(테마 그림·AI 배경)', (n) => {
    const cards = Array.from({ length: n }, (_, i) => card(`2027-05-${String(10 + i).padStart(2, '0')}`, `학회${i + 1}`, null, i % 2 ? '오전진료' : '휴진'))
    for (const look of [{}, { background: BACKGROUND }] as Look[]) {
      const svg = draw({ ...BASE, cards, accent: PICKED }, look)
      expect(all(svg, 'path').map((p) => p.getAttribute('fill'))).toEqual(cards.map(() => PICKED))
      const statuses = all(svg, 'text').filter((t) => t.textContent === '휴진' || t.textContent === '오전진료')
      expect(statuses.map((t) => t.getAttribute('fill'))).toEqual(cards.map(() => PICKED))
      cleanup()
    }
  })

  it('AC-4702.1: 쓸 수 없는 배경이 와서 테마 그림으로 그릴 때도 고른 색이다', () => {
    const svg = draw(withAccent(PICKED), { background: { image: 'https://example.com/a.jpg', accent: BG_ACCENT }, art: 2 })
    expect(all(svg, 'image')[0].getAttribute('href')).toBe(themeHref(THEME, 2))
    expect(textFill(svg, layout.monthText)).toBe(PICKED)
    expect(plain(svg)).toBe(plainOf(withAccent(PICKED), { art: 2 }))
  })
})

describe('AC-4702.2: 글자 색이 없으면(자동) 지금 그림 그대로', () => {
  it.each(LOOKS)('AC-4702.2: %s — accent가 없을 때·undefined·null일 때 그림이 글자 하나까지 같다', (_, look) => {
    const now = plainOf(BASE, look)
    expect('accent' in BASE).toBe(false)
    expect(plainOf(withAccent(null), look)).toBe(now)
    expect(plainOf(withAccent(undefined), look)).toBe(now)
  })

  it.each(LOOKS)("AC-4702.2: %s — 'N월'·띠·아래 글은 자동 색(배경이면 배경 강조색, 아니면 테마 강조색)이다", (_, look, auto) => {
    const svg = draw(withAccent(null), look)
    expect(textFill(svg, layout.monthText)).toBe(auto)
    expect(all(svg, 'path').map((p) => p.getAttribute('fill'))).toEqual(BASE.cards.map(() => auto))
    for (const c of layout.cards) expect(textFill(svg, c.status.text), c.status.text).toBe(auto)
  })
})

describe("AC-4702.3: 모양이 틀린 글자 색은 쓰지 않고 자동 색으로 그린다('#'+소문자 16진수 6자리만)", () => {
  it.each([
    ['대문자 #C62F2F', '#C62F2F'],
    [`대문자 ${PICKED.toUpperCase()}`, PICKED.toUpperCase()],
    ['색 이름 red', 'red'],
    ['3자리 #abc', '#abc'],
    ['# 없음', PICKED.slice(1)],
    ['8자리', `${PICKED}ff`],
    ['앞뒤 공백', ` ${PICKED} `],
    ['빈 글자', ''],
    ['숫자', 0x0b7a5c],
    ['객체', { hex: PICKED }],
  ] as [string, unknown][])('AC-4702.3: %s → 자동일 때와 글자 하나까지 같다(테마 그림·그림 2·AI 배경)', (_, bad) => {
    for (const [name, look, auto] of LOOKS) {
      const svg = draw(withAccent(bad), look)
      expect(textFill(svg, layout.monthText), name).toBe(auto)
      const html = plain(svg)
      cleanup()
      expect(html, name).toBe(plainOf(BASE, look))
    }
  })
})
