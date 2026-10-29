import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ui } from '@/components/ui/classes'
import { DashboardEmpty } from './DashboardEmpty'

// 대시보드 빈 자리 (REQ-009, design.md '대시보드 범위'·'대시보드', UI_GUIDE '앱 화면' 글자·빈 상태).
// 제목과 빈 안내 상자 하나만 — 숫자 카드·패널·표·예시 숫자·단추는 없다(대시보드 내용은 별도 명세).
// 상호작용이 없는 Server Component → node + renderToStaticMarkup. 모양은 정해 둔 클래스로 본다(보이는 모양은 TASK-18 스크린샷)

const TITLE = '2026년 10월 29일 (목)'
const render = (title = TITLE) => renderToStaticMarkup(<DashboardEmpty title={title} />)
const html = render()

// 태그를 빈칸으로 바꾸고 빈칸을 하나로 모은 글자
const textOf = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
// 그 태그들: 속성 글자와 안쪽 마크업
const tagsOf = (markup: string, tag: string) =>
  [...markup.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => ({
    attrs: m[1],
    inner: m[2],
  }))
const attrOf = (attrs: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1]
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (attrs: string) => tokens(attrOf(attrs, 'class') ?? '')
// 요소가 그 클래스를 모두 가진다
const hasAll = (attrs: string, classes: string) =>
  expect(classesOf(attrs)).toEqual(expect.arrayContaining(tokens(classes)))
const allClasses = (markup: string) => [...markup.matchAll(/\sclass="([^"]*)"/g)].flatMap((m) => tokens(m[1]))

const h1 = () => {
  const found = tagsOf(html, 'h1')
  expect(found).toHaveLength(1)
  return found[0]
}
const box = () => {
  const found = tagsOf(html, 'section')
  expect(found).toHaveLength(1)
  return found[0]
}

describe('DashboardEmpty: 제목 (오늘 + 한국 날짜)', () => {
  it('AC-009.1: 페이지 제목(h1) 하나 — "오늘 2026년 10월 29일 (목)"', () => {
    expect(textOf(h1().inner)).toBe('오늘 2026년 10월 29일 (목)')
    // 받은 날짜 글자를 그대로 쓴다
    expect(textOf(tagsOf(render('2027년 1월 1일 (금)'), 'h1')[0].inner)).toBe('오늘 2027년 1월 1일 (금)')
  })

  it("AC-009.1: 'TODAY' 같은 영문 소제목이 없다 — 화면 글자에 영문이 없다", () => {
    expect(textOf(html)).not.toMatch(/[A-Za-z]/)
  })

  it('AC-009.1·AC-013.3: 제목 글자는 title 600 ink(폰 title-sm), "오늘"과 날짜 사이 10px', () => {
    const { attrs, inner } = h1()
    hasAll(attrs, 'text-title font-semibold text-ink max-md:text-title-sm')
    expect(tagsOf(inner, 'span').map((s) => textOf(s.inner))).toEqual(['오늘', TITLE])
    // 사이 10px = 진짜 빈칸(25px 글자에서 약 6px) + "오늘" 오른쪽 4px
    const [today] = tagsOf(inner, 'span')
    hasAll(today.attrs, 'mr-1')
  })

  it('AC-009.1: 화면 읽기·복사 글자도 "오늘 2026년 …"(진짜 빈칸 하나) — 제목은 flex·grid가 아니어서 사이 빈칸이 지워지지 않는다', () => {
    const { attrs, inner } = h1()
    // 태그만 지운 글자(빈칸을 새로 넣지 않는다)
    expect(inner.replace(/<[^>]+>/g, '')).toBe(`오늘 ${TITLE}`)
    for (const layout of ['flex', 'inline-flex', 'grid', 'inline-grid']) expect(classesOf(attrs), layout).not.toContain(layout)
    expect(classesOf(attrs).filter((t) => t.startsWith('gap'))).toEqual([])
  })
})

describe('DashboardEmpty: 빈 안내 상자 하나', () => {
  it('AC-009.2: 제목 아래 상자 하나 — "대시보드는 준비 중입니다" + "어떤 숫자와 칸을 둘지는 따로 정한 뒤 만듭니다."', () => {
    const { attrs, inner } = box()
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<section'))
    // 상자 이름 = 상자 제목(화면 읽기 프로그램이 "대시보드는 준비 중입니다" 영역으로 읽는다)
    const heading = tagsOf(inner, 'h2')
    expect(heading).toHaveLength(1)
    expect(textOf(heading[0].inner)).toBe('대시보드는 준비 중입니다')
    expect(attrOf(attrs, 'aria-labelledby')).toBe(attrOf(heading[0].attrs, 'id'))
    expect(tagsOf(inner, 'p').map((p) => textOf(p.inner))).toEqual(['어떤 숫자와 칸을 둘지는 따로 정한 뒤 만듭니다.'])
  })

  it('AC-009.2: 화면 글자는 제목과 안내 두 줄뿐이다(다른 칸·문구 없음)', () => {
    expect(textOf(html)).toBe(`오늘 ${TITLE} 대시보드는 준비 중입니다 어떤 숫자와 칸을 둘지는 따로 정한 뒤 만듭니다.`)
  })

  it('AC-009.2: 숫자 카드·패널·표·단추·링크·그림·예시 숫자가 없다', () => {
    for (const tag of ['table', 'button', 'a', 'img', 'svg', 'ul', 'ol', 'dl', 'input', 'form'])
      expect(html, tag).not.toMatch(new RegExp(`<${tag}\\b`))
    // 카드 모양 덩어리는 안내 상자 하나, 패널 모양은 없다
    expect(html.match(/\bclass="[^"]*\brounded-card\b/g)).toHaveLength(1)
    const elements = [...html.matchAll(/\sclass="([^"]*)"/g)].map((m) => tokens(m[1]))
    expect(elements.filter((cls) => tokens(ui.panel).every((t) => cls.includes(t)))).toEqual([])
    // 숫자는 제목의 날짜에만 있다(예시 숫자·"예시 자료" 칩 없음)
    expect(textOf(html.replace(/<h1\b[\s\S]*?<\/h1>/, ''))).not.toMatch(/\d/)
    expect(textOf(html)).not.toContain('예시 자료')
  })

  it('AC-009.2·AC-013.3: 상자는 ui.card(흰 바탕·1px 선·6px·안쪽 24px), 상자 제목 panel 600 ink, 안내는 table muted', () => {
    const { attrs, inner } = box()
    hasAll(attrs, ui.card)
    hasAll(tagsOf(inner, 'h2')[0].attrs, ui.panelTitle)
    hasAll(tagsOf(inner, 'p')[0].attrs, 'text-table text-muted')
  })

  it('AC-013.3: 그림자·강조색이 없다(제자리 상자는 1px 선, 강조색은 정해진 곳에만)', () => {
    const classes = allClasses(html)
    expect(classes.filter((c) => /shadow/.test(c))).toEqual([])
    expect(classes.filter((c) => /accent/.test(c))).toEqual([])
  })

  it('AC-013.3: 제목과 상자 사이 16px(폰 12px) — 덩어리 사이 간격', () => {
    const root = /^<div\b([^>]*)>/.exec(html)
    expect(root).not.toBeNull()
    hasAll(root![1], 'flex flex-col gap-4 max-md:gap-3')
  })

  it('AC-013.2: 클래스에 임의 색 값·Tailwind 기본 색이 없다', () => {
    for (const c of allClasses(html)) {
      expect(c).not.toMatch(/\[#|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\(/)
      expect(c).not.toMatch(/-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/)
    }
  })
})
