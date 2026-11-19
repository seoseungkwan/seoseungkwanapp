// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LOGO, POSTER, layoutPoster, type PosterLogo } from '@/lib/forms/layout'
import { themeHref, themeOf } from '@/lib/forms/themes'
import type { BackgroundLook } from '@/types/formBackground'
import type { ClosureNotice, NoticeCard, ThemeArt, ThemeId } from '@/types/forms'
import { Poster } from './Poster'

// 휴진 안내 그림 — 그림 2와 AI 배경(내 배경) (specs/forms-themes TASK-10, REQ-4603 · AC-4603.1~4603.4, design.md 6절).
// 값은 승인 시안 docs/mockups/forms-themes/ai-backgrounds.html 그대로 본다. 지금 그림 시험(Poster.test.tsx)은 고치지 않는다.
// 로고 뒤 흰 빛(흐린 흰 타원)은 spec logo-fit AC-6703.4(사용자 2026-11-19 "그라데이션 없애")로 없앴다 — AC-4603.2 시험 세 곳을 타원 없는 형으로 고쳤다.
// 배경 그림·강조색은 지어낸 값이다

afterEach(cleanup)

const card = (start: string, name: string, end: string | null = null, status = '휴진'): NoticeCard => ({ start, end, name, status })
const NOTICE: ClosureNotice = {
  year: 2027,
  month: 5,
  cards: [card('2027-05-05', '어린이날'), card('2027-05-12', '학회', '2027-05-14', '단축진료')],
  theme: null,
}
const THEME: ThemeId = 'children'
const IMAGE = `data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ${'A'.repeat(40)}==`
const ACCENT = '#7a1f4d' // 테마 23개의 강조색과 다른 값
const BACKGROUND: BackgroundLook = { image: IMAGE, accent: ACCENT }

type Props = { theme?: ThemeId; art?: ThemeArt; background?: BackgroundLook | null; logo?: PosterLogo | null }
function draw({ theme = THEME, ...rest }: Props = {}) {
  const { container } = render(<Poster notice={NOTICE} theme={theme} {...rest} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}
// SVG 요소 이름은 대소문자를 가린다(feGaussianBlur) — localName으로 찾는다
const all = (root: Element, name: string) => [...root.querySelectorAll('*')].filter((el) => el.localName === name)
const attrs = (el: Element) => Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]))
const images = (svg: Element) => all(svg, 'image')
const firstHref = (svg: Element) => images(svg)[0]?.getAttribute('href')
// useId로 지은 필터 이름은 그릴 때마다 달라질 수 있어 하나로 맞춘 뒤 견준다
const plain = (svg: Element) => svg.outerHTML.replace(/poster-(shadow|soft)-[\w-]+/g, 'poster-$1-ID')
const textFill = (svg: Element, content: string) => {
  const found = all(svg, 'text').filter((t) => t.textContent === content)
  expect(found, content).toHaveLength(1)
  return found[0].getAttribute('fill')
}
const urlId = (value: string | null) => /^url\(#([^)]+)\)$/.exec(value ?? '')?.[1] ?? null

describe('AC-4603.1: 테마 그림 1·2', () => {
  it('AC-4603.1: art 2면 첫 image는 /poster/themes/<열쇠>-2.svg다', () => {
    expect(firstHref(draw({ art: 2 }))).toBe('/poster/themes/children-2.svg')
    expect(firstHref(draw({ theme: 'm05', art: 2 }))).toBe('/poster/themes/m05-2.svg')
    expect(firstHref(draw({ theme: 'm05', art: 2 }))).toBe(themeHref('m05', 2))
  })

  it('AC-4603.1: art가 없거나 1이면 지금 주소(/poster/themes/<열쇠>.svg)다', () => {
    expect(firstHref(draw())).toBe('/poster/themes/children.svg')
    expect(firstHref(draw({ art: 1 }))).toBe('/poster/themes/children.svg')
    expect(firstHref(draw({ theme: 'm12' }))).toBe(themeHref('m12'))
  })

  it('AC-4603.1: art가 없을 때·1일 때 그림은 글자 하나까지 같다', () => {
    expect(plain(draw({ art: 1 }))).toBe(plain(draw()))
  })

  it('AC-4603.1: 그림 2는 첫 image 주소만 다르고 글자·카드·로고·강조색은 그림 1과 같다', () => {
    const second = plain(draw({ art: 2 })).replace('/poster/themes/children-2.svg', '/poster/themes/children.svg')
    expect(second).toBe(plain(draw({ art: 1 })))
    const svg = draw({ art: 2 })
    expect(images(svg)).toHaveLength(2)
    expect(images(svg)[1].getAttribute('href')).toBe(LOGO.href)
    expect(textFill(svg, layoutPoster(NOTICE).monthText)).toBe(themeOf(THEME).accent)
  })
})

describe('AC-4603.2: AI 배경(내 배경)을 얹은 그림', () => {
  it('AC-4603.2: 첫 image는 그 배경 주소이고 x 0·y 0·794×1123, xMidYMid slice다', () => {
    const [image] = images(draw({ background: BACKGROUND }))
    expect(attrs(image)).toEqual({
      href: IMAGE,
      x: '0',
      y: '0',
      width: String(POSTER.width),
      height: String(POSTER.height),
      preserveAspectRatio: 'xMidYMid slice',
    })
    expect([POSTER.width, POSTER.height]).toEqual([794, 1123])
  })

  it('AC-4603.2·AC-6703.4: 배경 바로 뒤에 반투명 흰 판이 시안 값 그대로 오고, 로고 뒤 흰 빛(타원)은 없다', () => {
    const svg = draw({ background: BACKGROUND })
    const [image] = images(svg)
    const panel = image.nextElementSibling
    expect(panel?.localName).toBe('rect')
    expect(panel?.nextElementSibling?.localName).not.toBe('ellipse')
    const { filter: panelFilter, ...panelRest } = attrs(panel as Element)
    expect(panelRest).toEqual({ x: '64', y: '70', width: '666', height: '770', rx: '40', fill: '#fff', 'fill-opacity': '.55' })
    expect(urlId(panelFilter)).not.toBeNull()
    expect(all(svg, 'ellipse')).toHaveLength(0)
    // 반투명은 흰 판 하나뿐이다(흰 빛 .7이 없다)
    expect([...svg.querySelectorAll('[fill-opacity]')].map((el) => el.localName)).toEqual(['rect'])
  })

  it('AC-4603.2·AC-6703.4: 흐림 필터는 하나(feGaussianBlur stdDeviation 18, -10%·120%)이고 흰 판 하나만 그 필터를 쓴다', () => {
    const svg = draw({ background: BACKGROUND })
    const blurs = all(svg, 'feGaussianBlur')
    expect(blurs).toHaveLength(1)
    expect(blurs[0].getAttribute('stdDeviation')).toBe('18')
    const soft = blurs[0].parentElement as Element
    expect(soft.localName).toBe('filter')
    expect(soft.parentElement?.localName).toBe('defs')
    expect(attrs(soft)).toEqual({ id: soft.id, x: '-10%', y: '-10%', width: '120%', height: '120%' })
    expect(soft.id).toMatch(/^poster-soft-[\w-]+$/)
    const users = [...svg.querySelectorAll('[filter]')].filter((el) => el.getAttribute('filter') === `url(#${soft.id})`)
    expect(users.map((el) => el.localName)).toEqual(['rect'])
    // 그림자 필터는 지금처럼 카드 상자만 쓴다
    const shadow = all(svg, 'filter').find((f) => f !== soft) as Element
    expect(all(svg, 'filter')).toHaveLength(2)
    const shadowUsers = [...svg.querySelectorAll('[filter]')].filter((el) => el.getAttribute('filter') === `url(#${shadow.id})`)
    expect(shadowUsers.map((el) => el.localName)).toEqual(['g', 'g'])
  })

  it("AC-4603.2: 'N월'·날짜 띠·카드 아래 글은 배경의 강조색이고, 테마 강조색은 어디에도 없다", () => {
    const svg = draw({ background: BACKGROUND })
    const layout = layoutPoster(NOTICE)
    expect(textFill(svg, layout.monthText)).toBe(ACCENT)
    const bands = all(svg, 'path')
    expect(bands).toHaveLength(NOTICE.cards.length)
    for (const band of bands) expect(band.getAttribute('fill')).toBe(ACCENT)
    for (const c of layout.cards) expect(textFill(svg, c.status.text)).toBe(ACCENT)
    expect(svg.outerHTML).not.toContain(themeOf(THEME).accent)
  })

  it('AC-4603.2: 글자·카드·로고 자리는 테마 그림일 때와 같고, 띠 글은 흰색 그대로다', () => {
    const layout = layoutPoster(NOTICE)
    const svg = draw({ background: BACKGROUND })
    for (const c of layout.cards) {
      expect(textFill(svg, c.date.text)).toBe('#fff')
      expect(textFill(svg, c.name.text)).toBe(textFill(draw(), c.name.text))
    }
    const texts = (el: Element) => all(el, 'text').map((t) => [t.textContent, t.getAttribute('x'), t.getAttribute('y'), t.getAttribute('font-size')])
    expect(texts(svg)).toEqual(texts(draw()))
  })

  it('AC-4603.2: 안내문 안 image는 배경과 로고 둘뿐이다(로고는 맨 끝, 테마 그림을 함께 넣지 않는다)', () => {
    const svg = draw({ background: BACKGROUND, art: 2 })
    expect(images(svg).map((image) => image.getAttribute('href'))).toEqual([IMAGE, LOGO.href])
    expect(svg.lastElementChild?.getAttribute('href')).toBe(LOGO.href)
    expect(svg.outerHTML).not.toContain('/poster/themes/')
  })

  it('AC-4603.2·AC-6703.4: 차례는 style → defs → 배경 → 흰 판 → 글자·카드 → 로고다(흰 빛 없음)', () => {
    const order = [...draw({ background: BACKGROUND }).children].map((el) => el.localName)
    expect(order.slice(0, 4)).toEqual(['style', 'defs', 'image', 'rect'])
    expect(order).not.toContain('ellipse')
    expect(order.slice(4, -1).every((n) => n === 'text' || n === 'g' || n === 'path')).toBe(true)
    expect(order.at(-1)).toBe('image')
  })
})

describe('AC-6703.4: AI 배경 위 로고 뒤에 흰 빛을 그리지 않는다 (spec logo-fit, 사용자 2026-11-19 "그라데이션 없애")', () => {
  const LOGO_URL = `data:image/png;base64,iVBORw0KGgo${'E'.repeat(24)}`
  it.each([
    ['크기를 아는 세로형 그림', { kind: 'image', href: LOGO_URL, width: 1080, height: 501 }],
    ['크기를 아는 가로형 그림', { kind: 'image', href: LOGO_URL, width: 1033, height: 175 }],
    ['크기 모르는 그림', { kind: 'image', href: LOGO_URL }],
    ['병원 이름 글자', { kind: 'text', text: '서승관정형외과의원' }],
    ['읽는 중', null],
    ['옛 부르기(로고 없음)', undefined],
  ] as [string, PosterLogo | null | undefined][])('AC-6703.4: %s — 타원이 없고, 글자 뒤 반투명 흰 판은 그대로다', (_, logo) => {
    const svg = draw({ background: BACKGROUND, logo })
    expect(all(svg, 'ellipse')).toHaveLength(0)
    expect(svg.outerHTML).not.toContain('fill-opacity=".7"')
    const panels = [...svg.children].filter((el) => el.localName === 'rect') // 카드 상자는 g 안이라 빠진다
    expect(panels).toHaveLength(1)
    expect(panels[0].getAttribute('fill-opacity')).toBe('.55')
    expect(urlId(panels[0].getAttribute('filter'))).toMatch(/^poster-soft-/)
    expect(all(svg, 'feGaussianBlur')).toHaveLength(1)
  })

  it('AC-6703.4: 로고 자리 말고는 로고 종류와 상관없이 같다(흰 빛이 로고를 따라 바뀌지 않는다)', () => {
    const withoutLogo = (logo: PosterLogo | null) =>
      plain(draw({ background: BACKGROUND, logo }))
        .replace(/<image href="data:image\/png[^>]*><\/image>/, '')
        .replace(/<text[^>]*>서승관의원<\/text>/, '')
    const base = withoutLogo(null)
    expect(withoutLogo({ kind: 'image', href: LOGO_URL, width: 1080, height: 501 })).toBe(base)
    expect(withoutLogo({ kind: 'image', href: LOGO_URL })).toBe(base)
    expect(withoutLogo({ kind: 'text', text: '서승관의원' })).toBe(base)
  })
})

describe('AC-4603.3: 쓸 수 없는 배경이면 테마 그림으로', () => {
  it.each([
    ['https: 주소', { image: 'https://example.com/a.jpg', accent: ACCENT }],
    ['PNG data: 주소', { image: 'data:image/png;base64,iVBORw0KGgo=', accent: ACCENT }],
    ['SVG data: 주소', { image: 'data:image/svg+xml;base64,PHN2Zz4=', accent: ACCENT }],
    ['앞에 공백', { image: ` ${IMAGE}`, accent: ACCENT }],
    ['대문자 머리(DATA:IMAGE/JPEG)', { image: IMAGE.replace('data:image/jpeg', 'DATA:IMAGE/JPEG'), accent: ACCENT }],
    ['빈 주소', { image: '', accent: ACCENT }],
    ['강조색이 대문자', { image: IMAGE, accent: '#7A1F4D' }],
    ['강조색이 3자리', { image: IMAGE, accent: '#7a1' }],
    ['강조색에 # 없음', { image: IMAGE, accent: '7a1f4d' }],
    ['강조색이 색 이름', { image: IMAGE, accent: 'red' }],
  ] as [string, BackgroundLook][])('AC-4603.3: %s → 배경을 쓰지 않고 그 테마·그림 번호로 그린다', (_, bad) => {
    for (const art of [1, 2] as const) {
      const svg = draw({ background: bad, art })
      expect(plain(svg)).toBe(plain(draw({ art })))
      expect(firstHref(svg)).toBe(themeHref(THEME, art))
      expect(textFill(svg, layoutPoster(NOTICE).monthText)).toBe(themeOf(THEME).accent)
    }
  })

  it('AC-4603.3: 배경이 null이면 테마 그림이다', () => {
    expect(plain(draw({ background: null, art: 2 }))).toBe(plain(draw({ art: 2 })))
  })
})

describe('AC-4603.4: 테마로 그린 안내문에는 흰 판·흰 빛·흐림 필터가 없다', () => {
  it.each([
    ['art 없음', {}],
    ['그림 1', { art: 1 }],
    ['그림 2', { art: 2 }],
    ['배경 null', { background: null }],
    ['쓸 수 없는 배경', { background: { image: 'https://example.com/a.jpg', accent: ACCENT } }],
  ] as [string, Props][])('AC-4603.4: %s', (_, props) => {
    const svg = draw(props)
    expect(all(svg, 'feGaussianBlur')).toHaveLength(0)
    expect(all(svg, 'ellipse')).toHaveLength(0)
    expect(all(svg, 'filter')).toHaveLength(1)
    expect(svg.querySelector('[fill-opacity]')).toBeNull()
    expect(all(svg, 'rect').every((rect) => rect.parentElement?.localName === 'g')).toBe(true) // 카드 상자뿐
    expect(images(svg)[0].hasAttribute('preserveAspectRatio')).toBe(false)
    expect(svg.outerHTML).not.toContain('poster-soft-')
  })
})
