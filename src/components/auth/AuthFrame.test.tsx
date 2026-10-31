// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthFrame } from './AuthFrame'

// 인증 화면 틀 (b2b-redesign REQ-213 AC-213.1·AC-213.2, design.md '인증 화면', UI_GUIDE '인증 화면').
// 짜임은 승인 시안 docs/mockups/b2b-redesign/screens.mjs의 col480(한 칸)·loginPC/loginPhone(두 칸)이다.
// jsdom은 CSS를 풀지 않는다 → 짜임·클래스·글자를 본다(보이는 모양은 Phase 3 끝 사진)

const ROOT = process.cwd()
const SOURCE = 'src/components/auth/AuthFrame.tsx'
const TAGLINE = '통증 의원 관리자를 위한 AI 업무 도구'

const classesOf = (el: Element | null | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted))
const expectNoClass = (el: Element | null | undefined, pattern: RegExp) =>
  expect(classesOf(el).filter((cls) => pattern.test(cls))).toEqual([])
const tagsOf = (el: Element) => Array.from(el.children).map((child) => child.tagName.toLowerCase())
// 그린 화면의 로고 svg(LogoMark는 viewBox 0 0 30 30)
const logos = () => Array.from(document.querySelectorAll('svg[viewBox="0 0 30 30"]'))

const column = (headerEnd?: ReactNode) => render(<AuthFrame headerEnd={headerEnd}>본문</AuthFrame>)
const split = () =>
  render(
    <AuthFrame aside={<p>미리보기 내용</p>}>
      <p>로그인 폼</p>
    </AuthFrame>,
  )

afterEach(cleanup)

describe('AC-213.1: 한 칸(aside 없음 — 가입 신청·승인 대기·거절·오류)', () => {
  it('AC-213.1: .app-ui 뿌리(surface 바탕) 안에 가운데 480px 한 칸이 있다(768px 미만 좌우 16px)', () => {
    const { container } = column()
    const root = container.firstElementChild
    const col = screen.getByRole('banner').parentElement
    expect(col?.parentElement).toBe(root)
    expectClasses(root, 'app-ui', 'min-h-dvh', 'bg-surface', 'text-ink', 'max-md:px-4')
    expect(classesOf(root)).not.toContain('bg-canvas')
    expectClasses(col, 'mx-auto', 'w-full', 'max-w-120')
  })

  it('AC-213.1: 맨 위 줄 <header>는 72px(768px 미만 56px)이고 왼쪽에 LogoMark 28 하나만, 띠 테두리·바탕·[서비스 이름]이 없다', () => {
    column()
    const header = screen.getByRole('banner')
    expect(header.tagName).toBe('HEADER')
    expectClasses(header, 'flex', 'items-center', 'h-18', 'max-md:h-14')
    expectNoClass(header, /(^|:)(border|bg-)/)
    expect(tagsOf(header)).toEqual(['svg'])
    expect(header.textContent).toBe('')
    const [logo] = logos()
    expect(header.contains(logo ?? null)).toBe(true)
    expect(logo?.getAttribute('width')).toBe('28')
    expect(logo?.getAttribute('height')).toBe('28')
    expect(document.body.textContent).not.toContain('[서비스 이름]')
  })

  it('AC-213.1: headerEnd를 주면 같은 줄 오른쪽 끝(ml-auto 자리)에 그린다', () => {
    column(<button type="button">로그아웃</button>)
    const header = screen.getByRole('banner')
    const slot = within(header).getByRole('button', { name: '로그아웃' }).parentElement as HTMLElement
    expect(tagsOf(header)).toEqual(['svg', 'div'])
    expect(header.lastElementChild).toBe(slot)
    expectClasses(slot, 'ml-auto', 'flex', 'items-center')
    expect(within(screen.getByRole('main')).queryByRole('button')).toBeNull()
  })

  it('AC-213.1: 로고 왼쪽 끝과 본문 왼쪽 끝이 같다 — header와 main이 같은 480 칸의 형제이고 둘 다(로고도) 제 여백·들여쓰기가 없다', () => {
    column()
    const header = screen.getByRole('banner')
    const main = screen.getByRole('main')
    expect(header.parentElement).toBe(main.parentElement)
    for (const el of [header, main, logos()[0]]) {
      expectNoClass(el, /^(?:[\w-]+:)?-?(?:p|px|pl|ps|m|mx|ml|ms)-/)
    }
  })

  it('AC-213.1: <main>은 하나이고 본문을 담는다(아래 48px, 768px 미만 32px)', () => {
    column()
    const mains = screen.getAllByRole('main')
    expect(mains).toHaveLength(1)
    expect(mains[0]?.textContent).toBe('본문')
    expectClasses(mains[0], 'pb-12', 'max-md:pb-8')
  })

  it('AC-213.1: aside가 없으면 <aside>·아래 소개 줄을 그리지 않는다', () => {
    column()
    expect(document.querySelector('aside')).toBeNull()
    expect(document.body.textContent).not.toContain(TAGLINE)
  })
})

describe('AC-213.2: 두 칸(aside — 로그인)', () => {
  // 뿌리 > [왼쪽 칸, aside], 왼쪽 칸 > 400 칸 > [header, main, 소개 줄]
  const parts = () => {
    const header = screen.getByRole('banner')
    const col = header.parentElement as HTMLElement
    const left = col.parentElement as HTMLElement
    const root = left.parentElement as HTMLElement
    const aside = screen.getByRole('complementary', { name: '미리보기' })
    return { root, left, col, header, main: screen.getByRole('main'), aside }
  }

  it('AC-213.2: 1024px 이상 두 칸(반반) — .app-ui 뿌리(surface 바탕) 안에 왼쪽 칸과 오른쪽 <aside>', () => {
    const { container } = split()
    const { root, left, aside } = parts()
    expect(root).toBe(container.firstElementChild)
    expectClasses(root, 'app-ui', 'min-h-dvh', 'bg-surface', 'text-ink', 'lg:grid', 'lg:grid-cols-2')
    expect(classesOf(root)).not.toContain('bg-canvas')
    expect(Array.from(root.children)).toEqual([left, aside])
  })

  it('AC-213.2: 왼쪽은 가운데 400px 칸(768px 미만 좌우 16px)에 위 <header> · 세로 가운데 <main> · 아래 소개 줄, 위아래 32px', () => {
    split()
    const { col, header, main } = parts()
    expectClasses(col, 'mx-auto', 'w-full', 'md:max-w-100', 'max-md:px-4', 'flex', 'flex-col', 'min-h-dvh', 'lg:py-8')
    const tagline = col.lastElementChild as HTMLElement
    expect(Array.from(col.children)).toEqual([header, main, tagline])
    expect(tagline.tagName).toBe('P')
    expect(tagline.textContent).toBe(TAGLINE)
    expectClasses(main, 'lg:flex', 'lg:flex-1', 'lg:flex-col', 'lg:justify-center')
    expect(main.textContent).toBe('로그인 폼')
  })

  it('AC-213.2: 아래 소개 줄은 caption muted이고 1024px 미만에서 숨는다', () => {
    split()
    const tagline = parts().col.lastElementChild
    expectClasses(tagline, 'text-caption', 'text-muted', 'max-lg:hidden')
  })

  it('AC-213.2: 오른쪽 <aside aria-label="미리보기">는 canvas 바탕·왼쪽 1px line이고 가운데 560px 칸에 aside 내용, 1024px 미만에서 숨는다', () => {
    split()
    const { aside, main } = parts()
    expect(aside.tagName).toBe('ASIDE')
    expect(aside.getAttribute('aria-label')).toBe('미리보기')
    expectClasses(aside, 'bg-canvas', 'border-l', 'border-line', 'max-lg:hidden', 'lg:flex', 'items-center', 'justify-center')
    expect(tagsOf(aside)).toEqual(['div'])
    const inner = aside.firstElementChild
    expectClasses(inner, 'w-full', 'max-w-140')
    expect(inner?.textContent).toBe('미리보기 내용')
    // aside 내용은 main 밖, 본문은 aside 밖
    expect(main.contains(aside)).toBe(false)
    expect(aside.textContent).not.toContain('로그인 폼')
  })

  it('AC-213.2: 1024px 미만 위 줄은 56px이고 같은 LogoMark 28을 클래스로 24px로 줄인다 → 본문 위 32px', () => {
    split()
    const { header, main } = parts()
    expectClasses(header, 'flex', 'items-center', 'max-lg:h-14')
    expectNoClass(header, /(^|:)(border|bg-)/)
    expect(tagsOf(header)).toEqual(['svg'])
    const [logo] = logos()
    expect(logo?.getAttribute('width')).toBe('28')
    expectClasses(logo, 'max-lg:size-6')
    expectClasses(main, 'max-lg:pt-8')
  })

  it('AC-213.2: <main>은 하나다', () => {
    split()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })
})

describe('AC-213.1·AC-213.2: LogoMark는 소스에 하나(<header> 안)이고 그린 화면에도 하나', () => {
  it('AC-213.1: 소스에 <LogoMark·<header·<main이 하나씩이고 LogoMark는 <header> 안에 있다', () => {
    const src = readFileSync(join(ROOT, SOURCE), 'utf8')
    expect(src.match(/<LogoMark\b/g) ?? []).toHaveLength(1)
    expect(src.match(/<header\b/g) ?? []).toHaveLength(1)
    expect(src.match(/<main\b/g) ?? []).toHaveLength(1)
    const header = src.slice(src.indexOf('<header'), src.indexOf('</header>'))
    expect(header).toMatch(/<LogoMark size=\{28\}/)
  })

  it.each([
    ['한 칸', () => column()],
    ['한 칸 + headerEnd', () => column(<button type="button">로그아웃</button>)],
    ['두 칸', () => split()],
  ])('AC-213.2: %s — 그린 화면에 로고 svg가 하나이고 <header> 안에 있다', (_, draw) => {
    draw()
    const found = logos()
    expect(found).toHaveLength(1)
    expect(screen.getByRole('banner').contains(found[0] ?? null)).toBe(true)
  })
})
