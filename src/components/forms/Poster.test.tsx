// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LOGO, layoutPoster, logoTextFit, type PosterLogo } from '@/lib/forms/layout'
import { themeOf } from '@/lib/forms/themes'
import type { ClosureNotice, NoticeCard, ThemeId } from '@/types/forms'
import { Poster } from './Poster'

// 서식 탭 휴진 안내 그림 SVG (spec forms REQ-3505 AC-3505.1, REQ-3510 AC-3510.2, design.md 5·6절).
// 기준 그림은 승인 테마 시안 docs/mockups/forms/themes.html의 poster() — 자리·크기·굵기·색·자간·그림자·띠 모양을 그대로 본다

afterEach(cleanup)

const card = (start: string, name: string, end: string | null = null, status = '휴진'): NoticeCard => ({ start, end, name, status })
const CHILDREN: ClosureNotice = { year: 2027, month: 5, cards: [card('2027-05-05', '어린이날')], theme: null }

function draw(notice: ClosureNotice, theme: ThemeId = 'children') {
  const { container } = render(<Poster notice={notice} theme={theme} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}
// SVG 요소 이름은 대소문자를 가린다(feDropShadow) — localName으로 찾는다
const all = (root: Element, name: string) => [...root.querySelectorAll('*')].filter((el) => el.localName === name)
const texts = (svg: Element) => all(svg, 'text')
const textOf = (svg: Element, content: string) => {
  const found = texts(svg).filter((t) => t.textContent === content)
  expect(found, content).toHaveLength(1)
  return found[0]
}
const attrs = (el: Element, names: string[]) => Object.fromEntries(names.map((n) => [n, el.getAttribute(n)]))
const TEXT_ATTRS = ['x', 'y', 'font-size', 'font-weight', 'fill', 'letter-spacing']
const num = (el: Element, name: string) => Number(el.getAttribute(name))

describe('AC-3505.1: 안내문 SVG 틀 — 794×1123, 테마 그림, 차례', () => {
  it('AC-3505.1: 뿌리는 viewBox 0 0 794 1123·xmlns·role="img"인 svg 하나다', () => {
    const svg = draw(CHILDREN)
    expect(svg.getAttribute('viewBox')).toBe('0 0 794 1123')
    expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg')
    expect(svg.getAttribute('role')).toBe('img')
    expect(all(svg, 'svg')).toHaveLength(0) // 안에 svg가 또 없다
  })

  it('AC-3505.1·AC-3602.1: 테마 그림(첫 image)은 /poster/themes/<열쇠>.svg를 0,0에 794×1123으로 깔고, image는 테마 그림과 로고 둘뿐이다', () => {
    for (const theme of ['children', 'm05', 'chuseok'] as const) {
      const images = all(draw(CHILDREN, theme), 'image')
      expect(images, theme).toHaveLength(2)
      expect(images[1].getAttribute('href'), theme).toBe('/poster/logo.png')
      expect(attrs(images[0], ['href', 'x', 'y', 'width', 'height']), theme).toEqual({
        href: `/poster/themes/${theme}.svg`,
        x: '0',
        y: '0',
        width: '794',
        height: '1123',
      })
      cleanup()
    }
  })

  it('AC-3505.1·AC-3510.2·AC-3602.1: 자식 차례는 <style> → <defs> → <image> → 글자·카드 → 로고 <image>다(테마 그림이 맨 아래, 로고가 맨 위)', () => {
    const names = [...draw(CHILDREN).children].map((el) => el.localName)
    expect(names.slice(0, 3)).toEqual(['style', 'defs', 'image'])
    expect(names.at(-1)).toBe('image')
    expect(names.slice(3, -1).every((n) => n === 'text' || n === 'g' || n === 'path')).toBe(true)
  })
})

describe('AC-3602.1: 병원 로고 — 맨 아래 가운데, 받침·필터 없이 그대로 (specs/forms-logo)', () => {
  const LOGO_ATTRS = { href: '/poster/logo.png', x: '227', y: '1011', width: '340', height: '58' }
  const days = (n: number) => Array.from({ length: n }, (_, i) => card(`2027-05-${String(10 + i).padStart(2, '0')}`, `학회${i + 1}`))

  it('AC-3602.1: 카드 1~4장·여러 테마에서 마지막 자식은 /poster/logo.png를 227,1011에 340×58로 그린 image 하나다', () => {
    for (const n of [1, 2, 3, 4])
      for (const theme of ['children', 'm11', 'christmas'] as const) {
        const svg = draw({ year: 2027, month: 5, cards: days(n), theme: null }, theme)
        const last = svg.lastElementChild
        expect(last?.localName, `${n}장 ${theme}`).toBe('image')
        expect(attrs(last!, Object.keys(LOGO_ATTRS)), `${n}장 ${theme}`).toEqual(LOGO_ATTRS)
        expect(all(svg, 'image').filter((el) => el.getAttribute('href') === '/poster/logo.png'), `${n}장 ${theme}`).toHaveLength(1)
        cleanup()
      }
  })

  it('AC-3602.1: 로고에는 filter·opacity·clip이 없고, 로고 뒤 받침 rect도 없다(rect는 카드 수만큼뿐)', () => {
    for (const n of [1, 4]) {
      const svg = draw({ year: 2027, month: 5, cards: days(n), theme: null })
      const logo = svg.lastElementChild!
      for (const name of ['filter', 'opacity', 'clip-path', 'mask', 'style']) expect(logo.getAttribute(name), name).toBeNull()
      expect(all(svg, 'rect'), `${n}장`).toHaveLength(n)
      cleanup()
    }
  })
})

describe('AC-3505.1: 제목·안내 두 줄 — 시안 자리·크기·굵기·색·자간', () => {
  it("AC-3505.1: 'N월'은 x 397·cy 162, 132px·900·강조색·자간 -0.02em", () => {
    const svg = draw(CHILDREN)
    expect(attrs(textOf(svg, '5월'), TEXT_ATTRS)).toEqual({
      x: '397',
      y: '162',
      'font-size': '132',
      'font-weight': '900',
      fill: themeOf('children').accent,
      'letter-spacing': '-0.02em',
    })
  })

  it("AC-3505.1: '진료일정안내'는 cy 296, 120px·900·#262626·자간 -0.045em", () => {
    expect(attrs(textOf(draw(CHILDREN), '진료일정안내'), TEXT_ATTRS)).toEqual({
      x: '397',
      y: '296',
      'font-size': '120',
      'font-weight': '900',
      fill: '#262626',
      'letter-spacing': '-0.045em',
    })
  })

  it('AC-3505.1: 안내 두 줄은 글자 그대로 cy 417·459, 27px·700·#3a3a3a·자간 -0.02em', () => {
    const svg = draw(CHILDREN)
    const line = (y: string) => ({ x: '397', y, 'font-size': '27', 'font-weight': '700', fill: '#3a3a3a', 'letter-spacing': '-0.02em' })
    expect(attrs(textOf(svg, '5월 진료일정을 안내드리오니'), TEXT_ATTRS)).toEqual(line('417'))
    expect(attrs(textOf(svg, '진료 및 내원에 참고해주시길 바랍니다'), TEXT_ATTRS)).toEqual(line('459'))
  })

  it("AC-3505.1: 'N월'과 첫 안내 줄은 안내문의 달을 쓴다(10월)", () => {
    const svg = draw({ year: 2026, month: 10, cards: [card('2026-10-03', '개천절')], theme: null }, 'foundation')
    textOf(svg, '10월')
    textOf(svg, '10월 진료일정을 안내드리오니')
  })

  it('AC-3505.1·AC-3510.2: 모든 글자는 PosterPretendard·가운데 맞춤·줄 가운데(central)이고 굵기는 700·900뿐이다', () => {
    const svg = draw({ ...CHILDREN, cards: [card('2027-05-05', '어린이날'), card('2027-05-13', '부처님오신날')] })
    const all = texts(svg)
    expect(all.length).toBe(4 + 2 * 3)
    for (const t of all) {
      expect(attrs(t, ['font-family', 'text-anchor', 'dominant-baseline']), t.textContent ?? '').toEqual({
        'font-family': 'PosterPretendard',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      })
      expect(['700', '900']).toContain(t.getAttribute('font-weight'))
    }
  })
})

describe('AC-3505.1: 날짜 카드 — 흰 상자·그림자·강조색 띠·글', () => {
  it('AC-3505.1: 카드 한 장은 x 238·y 534, 318×303 흰 상자(모서리 22)이고 그림자 필터를 쓴다', () => {
    const svg = draw(CHILDREN)
    const rects = all(svg, 'rect')
    expect(rects).toHaveLength(1)
    expect(attrs(rects[0], ['x', 'y', 'width', 'height', 'rx', 'fill'])).toEqual({ x: '238', y: '534', width: '318', height: '303', rx: '22', fill: '#fff' })
    const group = rects[0].parentElement
    expect(group?.localName).toBe('g')
    const filterId = all(svg, 'filter')[0].getAttribute('id')
    expect(group?.getAttribute('filter')).toBe(`url(#${filterId})`)
  })

  it('AC-3505.1: 그림자 필터는 하나 — 시안 feDropShadow(dy 14·흐림 17·rgb(25,45,80)·.16) 그대로, 이름은 poster-shadow로 시작', () => {
    const svg = draw(CHILDREN)
    const filters = all(svg, 'filter')
    expect(filters).toHaveLength(1)
    expect(filters[0].parentElement?.localName).toBe('defs')
    expect(filters[0].getAttribute('id')).toMatch(/^poster-shadow[\w-]*$/)
    expect(attrs(filters[0], ['x', 'y', 'width', 'height'])).toEqual({ x: '-20%', y: '-20%', width: '140%', height: '150%' })
    const shadows = all(filters[0], 'feDropShadow')
    expect(shadows).toHaveLength(1)
    expect(attrs(shadows[0], ['dx', 'dy', 'stdDeviation', 'flood-color', 'flood-opacity'])).toEqual({
      dx: '0',
      dy: '14',
      stdDeviation: '17',
      'flood-color': 'rgb(25,45,80)',
      'flood-opacity': '.16',
    })
  })

  it('AC-3505.1: 안내문 두 장을 한 화면에 그려도 그림자 이름이 겹치지 않는다(미리보기·인쇄 사본)', () => {
    const { container } = render(
      <>
        <Poster notice={CHILDREN} theme="children" />
        <Poster notice={CHILDREN} theme="children" />
      </>,
    )
    const ids = all(container, 'filter').map((f) => f.getAttribute('id'))
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    const refs = all(container, 'g').map((g) => g.getAttribute('filter'))
    expect(refs).toEqual(ids.map((id) => `url(#${id})`))
  })

  it('AC-3505.1: 위 띠는 위 모서리만 둥근 path(시안 d 그대로)이고 강조색으로 칠한다', () => {
    const paths = all(draw(CHILDREN), 'path')
    expect(paths).toHaveLength(1)
    expect(paths[0].getAttribute('d')).toBe('M238 613 V556 A22 22 0 0 1 260 534 H534 A22 22 0 0 1 556 556 V613 Z')
    expect(paths[0].getAttribute('fill')).toBe(themeOf('children').accent)
  })

  it('AC-3505.1: 날짜는 띠 가운데 흰 700, 이름은 몸통 30% #262626 900, 아래 글은 몸통 67% 강조색 900(시안 크기 33·46·50)', () => {
    const svg = draw(CHILDREN)
    const accent = themeOf('children').accent
    const date = textOf(svg, '5월 5일(수)')
    const name = textOf(svg, '어린이날')
    const status = textOf(svg, '휴진')
    expect(attrs(date, ['x', 'font-size', 'font-weight', 'fill', 'letter-spacing'])).toEqual({ x: '397', 'font-size': '33', 'font-weight': '700', fill: '#fff', 'letter-spacing': '-0.02em' })
    expect(attrs(name, ['x', 'font-size', 'font-weight', 'fill', 'letter-spacing'])).toEqual({ x: '397', 'font-size': '46', 'font-weight': '900', fill: '#262626', 'letter-spacing': '-0.03em' })
    expect(attrs(status, ['x', 'font-size', 'font-weight', 'fill', 'letter-spacing'])).toEqual({ x: '397', 'font-size': '50', 'font-weight': '900', fill: accent, 'letter-spacing': '0.02em' })
    expect(num(date, 'y')).toBeCloseTo(534 + 79 / 2, 6)
    expect(num(name, 'y')).toBeCloseTo(534 + 79 + 224 * 0.3, 6)
    expect(num(status, 'y')).toBeCloseTo(534 + 79 + 224 * 0.67, 6)
  })

  it.each([1, 2, 3, 4])('AC-3505.1: 카드 %i장은 배치(layoutPoster)의 자리·크기·글자 크기대로 그린다', (count) => {
    const all4 = [card('2027-05-01', '근로자의날'), card('2027-05-05', '어린이날'), card('2027-05-13', '부처님오신날'), card('2027-05-20', '임시휴진', null, '오전진료')]
    const notice: ClosureNotice = { ...CHILDREN, cards: all4.slice(0, count) }
    const svg = draw(notice)
    const layout = layoutPoster(notice)
    const rects = all(svg, 'rect')
    const bands = all(svg, 'path')
    expect(rects).toHaveLength(count)
    expect(bands).toHaveLength(count)
    const cardTexts = texts(svg).slice(4) // 제목·안내 두 줄 뒤, 카드마다 날짜·이름·아래 글
    expect(cardTexts).toHaveLength(count * 3)
    layout.cards.forEach((c, i) => {
      expect(attrs(rects[i], ['x', 'y', 'width', 'height'])).toEqual({ x: String(c.x), y: String(c.y), width: String(c.w), height: String(c.headH + c.bodyH) })
      const r = 22
      expect(bands[i].getAttribute('d')).toBe(
        `M${c.x} ${c.y + c.headH} V${c.y + r} A${r} ${r} 0 0 1 ${c.x + r} ${c.y} H${c.x + c.w - r} A${r} ${r} 0 0 1 ${c.x + c.w} ${c.y + r} V${c.y + c.headH} Z`,
      )
      const cx = String(c.x + c.w / 2)
      for (const [j, part, y] of [
        [0, c.date, c.y + c.headH / 2],
        [1, c.name, c.y + c.headH + c.bodyH * 0.3],
        [2, c.status, c.y + c.headH + c.bodyH * 0.67],
      ] as const) {
        const t = cardTexts[i * 3 + j]
        expect(t.textContent).toBe(part.text)
        expect(t.getAttribute('x'), part.text).toBe(cx)
        expect(num(t, 'y'), part.text).toBeCloseTo(y, 6)
        expect(t.getAttribute('font-size'), part.text).toBe(String(part.size))
      }
    })
  })

  it('AC-3505.1: 카드는 시작 날짜 차례로 그린다(적은 차례가 아니다)', () => {
    const notice: ClosureNotice = { ...CHILDREN, cards: [card('2027-05-13', '부처님오신날'), card('2027-05-05', '어린이날')] }
    const svg = draw(notice)
    const cardTexts = texts(svg).slice(4).map((t) => t.textContent)
    expect(cardTexts).toEqual(['5월 5일(수)', '어린이날', '휴진', '5월 13일(목)', '부처님오신날', '휴진'])
    const xs = all(svg, 'rect').map((r) => r.getAttribute('x'))
    expect(xs).toEqual(['61', '415'])
  })

  it('AC-3505.1: 이어서 쉬는 날 카드는 범위 날짜 글을 띠에 쓴다', () => {
    const svg = draw({ year: 2027, month: 5, cards: [card('2027-05-03', '연휴', '2027-05-05', '휴진')], theme: null })
    textOf(svg, '5월 3일(월)~5일(수)')
  })

  it("AC-3505.1: 강조색('N월'·띠·아래 글)은 고른 테마의 색이다(다른 테마로 바꾸면 따라 바뀐다)", () => {
    const notice: ClosureNotice = { ...CHILDREN, cards: [card('2027-05-05', '어린이날'), card('2027-05-13', '부처님오신날', null, '오전진료')] }
    for (const theme of ['children', 'm05', 'buddha'] as const) {
      const svg = draw(notice, theme)
      const accent = themeOf(theme).accent
      expect(textOf(svg, '5월').getAttribute('fill'), theme).toBe(accent)
      expect(all(svg, 'path').map((p) => p.getAttribute('fill')), theme).toEqual([accent, accent])
      expect(textOf(svg, '휴진').getAttribute('fill'), theme).toBe(accent)
      expect(textOf(svg, '오전진료').getAttribute('fill'), theme).toBe(accent)
      cleanup()
    }
  })
})

describe('AC-3505.1: 읽는 이름과 병원 정보', () => {
  it('AC-3505.1: aria-label은 "YYYY년 M월 진료일정안내: 날짜 이름 아래 글"이다', () => {
    expect(draw(CHILDREN).getAttribute('aria-label')).toBe('2027년 5월 진료일정안내: 5월 5일(수) 어린이날 휴진')
  })

  it("AC-3505.1: 카드가 여럿이면 시작 날짜 차례로 ', '로 잇는다", () => {
    const notice: ClosureNotice = {
      ...CHILDREN,
      cards: [card('2027-05-13', '부처님오신날', null, '오전진료'), card('2027-05-03', '연휴', '2027-05-05')],
    }
    expect(draw(notice).getAttribute('aria-label')).toBe('2027년 5월 진료일정안내: 5월 3일(월)~5일(수) 연휴 휴진, 5월 13일(목) 부처님오신날 오전진료')
  })

  it('AC-3505.1: 병원 정보(이름·전화·주소)가 없다 — 글자는 제목·안내 두 줄·카드 글뿐이다', () => {
    const svg = draw(CHILDREN)
    expect(texts(svg).map((t) => t.textContent)).toEqual(['5월', '진료일정안내', '5월 진료일정을 안내드리오니', '진료 및 내원에 참고해주시길 바랍니다', '5월 5일(수)', '어린이날', '휴진'])
    const all = svg.textContent ?? ''
    for (const word of ['의원', '병원', '전화', '주소', '원장', 'Tel', 'TEL']) expect(all, word).not.toContain(word)
    expect(all).not.toMatch(/\d{2,4}-\d{3,4}-\d{4}/)
    expect(svg.getAttribute('aria-label')).not.toMatch(/의원|병원|전화/)
  })

  it('AC-3505.1: 카드 글은 글자로만 그린다(꺾쇠·&가 요소가 되지 않는다)', () => {
    const svg = draw({ ...CHILDREN, cards: [card('2027-05-05', '<b>휴&진</b>', null, '<i>')] })
    expect(all(svg, 'b')).toHaveLength(0)
    expect(all(svg, 'i')).toHaveLength(0)
    textOf(svg, '<b>휴&진</b>')
    textOf(svg, '<i>')
  })
})

describe('AC-3510.2: 안내문 글꼴 — PosterPretendard 700·900', () => {
  const faces = (svg: Element) => {
    const style = svg.firstElementChild
    expect(style?.localName).toBe('style')
    return [...(style?.textContent ?? '').matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1])
  }
  const prop = (body: string, name: string) => body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+?)\\s*(?:;|$)`))?.[1]

  it('AC-3510.2: 첫 자식 <style>에 @font-face가 둘(700·900)이고 이름은 PosterPretendard다', () => {
    const bodies = faces(draw(CHILDREN))
    expect(bodies).toHaveLength(2)
    expect(bodies.map((b) => prop(b, 'font-family'))).toEqual(['PosterPretendard', 'PosterPretendard'])
    expect(bodies.map((b) => prop(b, 'font-weight'))).toEqual(['700', '900'])
  })

  it('AC-3510.2: 700은 /poster/fonts/Pretendard-Bold.subset.woff2, 900은 Pretendard-Black.subset.woff2를 woff2로 읽는다', () => {
    const bodies = faces(draw(CHILDREN))
    expect(bodies.map((b) => prop(b, 'src'))).toEqual([
      "url(/poster/fonts/Pretendard-Bold.subset.woff2) format('woff2')",
      "url(/poster/fonts/Pretendard-Black.subset.woff2) format('woff2')",
    ])
  })

  it('AC-3510.2: <style>에는 @font-face 두 규칙 밖의 다른 규칙이 없다(화면 글자를 건드리지 않는다)', () => {
    const css = draw(CHILDREN).firstElementChild?.textContent ?? ''
    expect(css.replace(/@font-face\s*\{[^}]*\}/g, '').trim()).toBe('')
  })
})

// ---------- 병원 정보 로고 (spec clinic-profile REQ-6604 AC-6604.1·AC-6604.2, design.md 6절) ----------

describe('AC-6604.1·AC-6604.2: 로고 자리 — 병원 정보 로고 그림 또는 병원 이름 글자', () => {
  const LOGO_URL = `data:image/png;base64,iVBORw0KGgo${'A'.repeat(24)}`
  const BOX = { x: '227', y: '1011', width: '340', height: '58' }
  function drawWith(logo: PosterLogo | null, notice: ClosureNotice = CHILDREN) {
    const { container } = render(<Poster notice={notice} theme="children" logo={logo} />)
    const svg = container.querySelector('svg')
    if (!svg) throw new Error('svg가 없다')
    return svg
  }

  it('AC-6604.1: 로고가 그림이면 마지막 자식은 그 data: 주소를 로고 상자(227,1011 · 340×58)에 비율을 지켜(xMidYMid meet) 그린 image다', () => {
    for (const n of [1, 4]) {
      const cards = Array.from({ length: n }, (_, i) => card(`2027-05-${String(10 + i).padStart(2, '0')}`, `학회${i + 1}`))
      const svg = drawWith({ kind: 'image', href: LOGO_URL }, { ...CHILDREN, cards })
      const last = svg.lastElementChild!
      expect(last.localName, `${n}장`).toBe('image')
      expect(attrs(last, ['href', 'x', 'y', 'width', 'height', 'preserveAspectRatio'])).toEqual({ href: LOGO_URL, ...BOX, preserveAspectRatio: 'xMidYMid meet' })
      expect(all(svg, 'image').map((el) => el.getAttribute('href'))).toEqual(['/poster/themes/children.svg', LOGO_URL])
      expect(svg.outerHTML).not.toContain('/poster/logo.png')
      cleanup()
    }
  })

  it('AC-6604.1: 로고가 없으면 마지막 자식은 병원 이름 글자 — 로고 상자 가운데(397, 1040)·900·진한 글자색(#262626)·PosterPretendard', () => {
    const name = '서승관정형외과의원'
    const svg = drawWith({ kind: 'text', text: name })
    const last = svg.lastElementChild!
    expect(last.localName).toBe('text')
    expect(last.textContent).toBe(name)
    expect(attrs(last, ['x', 'y', 'font-weight', 'fill', 'font-family', 'text-anchor', 'dominant-baseline', 'textLength'])).toEqual({
      x: '397',
      y: '1040',
      'font-weight': '900',
      fill: '#262626',
      'font-family': 'PosterPretendard',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      textLength: null,
    })
    expect(num(last, 'font-size')).toBe(logoTextFit(name, LOGO).size)
    expect(num(last, 'font-size')).toBeLessThanOrEqual(58 * 0.8)
    // 그림은 테마 그림 하나뿐이고 옛 로고 주소가 없다
    expect(all(svg, 'image').map((el) => el.getAttribute('href'))).toEqual(['/poster/themes/children.svg'])
    expect(svg.outerHTML).not.toContain('/poster/logo.png')
  })

  it('AC-6604.1: 가장 작은 글자로도 넘치는 긴 이름은 상자 폭(340)으로 눌러 그린다(textLength·spacingAndGlyphs)', () => {
    const last = drawWith({ kind: 'text', text: '가'.repeat(50) }).lastElementChild!
    expect(attrs(last, ['textLength', 'lengthAdjust'])).toEqual({ textLength: '340', lengthAdjust: 'spacingAndGlyphs' })
    expect(num(last, 'font-size')).toBe(18)
  })

  it('AC-6604.1: 병원 이름 글자는 글자로만 그린다(꺾쇠·&가 요소가 되지 않는다)', () => {
    const svg = drawWith({ kind: 'text', text: '<b>A&B</b>의원' })
    expect(svg.lastElementChild?.textContent).toBe('<b>A&B</b>의원')
    expect(all(svg, 'b')).toHaveLength(0)
  })

  it('AC-6604.2: 로고를 읽는 중(null)이면 로고 자리에 아무것도 그리지 않는다(그림은 테마 그림뿐, 병원 이름 글자 없음)', () => {
    const svg = drawWith(null)
    expect(all(svg, 'image').map((el) => el.getAttribute('href'))).toEqual(['/poster/themes/children.svg'])
    expect(svg.lastElementChild?.localName).not.toBe('image')
    expect(svg.outerHTML).not.toContain('/poster/logo.png')
  })

  it('AC-6604.1: 이름이 비었으면(가입 이름도 못 읽음) 로고 자리를 비운다', () => {
    const svg = drawWith({ kind: 'text', text: '  ' })
    expect(texts(svg).map((t) => t.textContent)).toEqual(texts(drawWith(null)).map((t) => t.textContent))
  })

  it('AC-6604.1: 로고 말고는 옛 그림과 글자 하나까지 같다(그림·글자·이름 글자 셋 모두)', () => {
    const plain = (svg: Element) => svg.outerHTML.replace(/poster-shadow-[\w-]+/g, 'poster-shadow-ID')
    const base = plain(drawWith(null))
    const legacy = plain(draw(CHILDREN))
    expect(legacy.replace(/<image href="\/poster\/logo\.png"[^>]*><\/image>/, '')).toBe(base)
    cleanup()
    expect(plain(drawWith({ kind: 'image', href: LOGO_URL })).replace(/<image href="data:[^>]*><\/image>/, '')).toBe(base)
    cleanup()
    expect(plain(drawWith({ kind: 'text', text: '서승관의원' })).replace(/<text[^>]*>서승관의원<\/text>/, '')).toBe(base)
  })
})
