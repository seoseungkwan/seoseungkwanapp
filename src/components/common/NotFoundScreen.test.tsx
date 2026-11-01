// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { isBorderBox, nestedBoxes } from '@/testing/boxes'
import { NotFoundScreen } from './NotFoundScreen'
import { RequestedPath } from './RequestedPath'

// 없는 주소 화면 (ui-90 REQ-410 AC-410.1~410.3, design.md '없는 주소 (TASK-7)', UI_GUIDE '오류 카드·확인 창' 없는 주소 화면,
// 시안 docs/mockups/ui-90/entry/screens.mjs notFoundIn(앱 안)·notFoundOut(밖)).
// 서버에서 그리는 화면 → renderToStaticMarkup으로 그린 마크업을 jsdom에 넣어 짜임·클래스·글자를 본다(보이는 모양은 TASK-19 사진).
// 열려던 주소(RequestedPath)는 usePathname()을 흉내 낸다. 같이 흉내 낸 쿼리(useSearchParams)는 그리면 안 된다

const { pathname } = vi.hoisted(() => ({ pathname: vi.fn((): string => '/dashbord') }))
vi.mock('next/navigation', () => ({
  usePathname: pathname,
  useSearchParams: () => new URLSearchParams('tab=1'),
}))

const LEAD_APP = '주소가 바뀌었거나 잘못 적힌 것 같아요. 위 탭에서 가려는 화면을 고르거나 대시보드로 가 주세요.'
const LEAD_OUT = '주소가 바뀌었거나 잘못 적힌 것 같아요. 처음 화면에서 다시 시작해 주세요.'

const mount = (element: ReactElement) => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(element)
  return root
}
const appScreen = () => mount(<NotFoundScreen where="app" />)
const outScreen = () => mount(<NotFoundScreen where="outside" />)

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element | null | undefined) => tokens(el?.getAttribute('class') ?? '')
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted.flatMap(tokens)))
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const tag = (el: Element | null | undefined) => el?.tagName.toLowerCase()

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
// 주석을 뺀 소스(주석에 적은 설명 글자는 보지 않는다)
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
const importsOf = (rel: string) => [...code(rel).matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

// 화면에서 하나뿐이어야 하는 것
const only = (root: Element, selector: string) => {
  const found = root.querySelectorAll(selector)
  expect(found, selector).toHaveLength(1)
  return found[0]!
}
// 열려던 주소 줄: "열려던 주소" 이름표가 든 p
const addrLineOf = (root: Element) => {
  const lines = Array.from(root.querySelectorAll('p')).filter((p) => Array.from(p.children).some((c) => textOf(c) === '열려던 주소'))
  expect(lines).toHaveLength(1)
  return lines[0]!
}

beforeEach(() => {
  pathname.mockReset()
  pathname.mockReturnValue('/dashbord')
})
afterEach(cleanup)

describe('AC-410.1: 앱 안 없는 주소 — 패널 하나 안에 칩 → h1 → 안내 → 열려던 주소 → [대시보드로 가기]', () => {
  it('AC-410.1: 그린 것 전체가 패널 하나(ds.panel)이고 상자 안 상자가 없다', () => {
    const root = appScreen()
    expect(root.children).toHaveLength(1)
    const panel = root.firstElementChild!
    expectClasses(panel, ds.panel)
    expect(Array.from(root.querySelectorAll('*')).filter(isBorderBox)).toEqual([panel])
    expect(nestedBoxes(root)).toEqual([])
  })

  it('AC-410.1: 패널은 가운데 정렬한 세로 묶음이다(최대 640, 위 24 · 휴대폰 위 0)', () => {
    const panel = appScreen().firstElementChild!
    expectClasses(panel, 'mx-auto flex flex-col items-center text-center max-w-160 mt-6 max-md:mt-0')
  })

  it('AC-410.1: 패널 안은 위에서부터 칩 "없는 주소" · h1 · 안내 · 열려던 주소 · [대시보드로 가기]다(시안 글자 그대로)', () => {
    const panel = appScreen().firstElementChild!
    expect(Array.from(panel.children).map((el) => [tag(el), textOf(el)])).toEqual([
      ['span', '없는 주소'],
      ['h1', '찾는 화면이 없어요'],
      ['p', LEAD_APP],
      ['p', '열려던 주소 /dashbord'],
      ['a', '대시보드로 가기'],
    ])
  })

  it('AC-410.1: 칩은 ds.chip.neutral, h1은 하나이고 title 600 ink, 안내는 body ink-2다', () => {
    const root = appScreen()
    const [chip, , lead] = Array.from(root.firstElementChild!.children)
    expectClasses(chip, ds.chip.neutral)
    const h1 = only(root, 'h1')
    expectClasses(h1, 'text-title font-semibold text-ink mt-3')
    expect(root.querySelectorAll('h2, h3, h4')).toHaveLength(0)
    expectClasses(lead, 'mt-2 text-body text-ink-2')
  })

  it('AC-410.1: [대시보드로 가기]는 /dashboard 링크 하나, ds.button.primaryLarge, 휴대폰 전체 폭이다', () => {
    const root = appScreen()
    expect(root.querySelectorAll('a, button, [role="button"], [role="link"]')).toHaveLength(1)
    const link = only(root, 'a')
    expect(link.getAttribute('href')).toBe('/dashboard')
    expect(textOf(link)).toBe('대시보드로 가기')
    expectClasses(link, ds.button.primaryLarge, 'mt-6 max-md:w-full')
  })

  it('AC-410.1: 열려던 주소 줄은 이름표(small muted) + 경로이고 가운데로 모인다', () => {
    const line = addrLineOf(appScreen())
    expectClasses(line, 'mt-4 flex flex-wrap items-baseline justify-center')
    const [label, path] = Array.from(line.children)
    expect(textOf(label)).toBe('열려던 주소')
    expectClasses(label, 'text-small text-muted')
    expect(textOf(path)).toBe('/dashbord')
  })
})

describe('AC-410.2: 밖 없는 주소 — 칩 → h1 → 안내 → 열려던 주소 → [처음 화면으로] · [로그인]', () => {
  it('AC-410.2: 상자 없이 한 칸에 위에서부터 칩 줄 · h1 · 안내 · 열려던 주소 · 단추 줄이다(시안 글자 그대로)', () => {
    const root = outScreen()
    expect(root.children).toHaveLength(1)
    const page = root.firstElementChild!
    expect(Array.from(root.querySelectorAll('*')).filter(isBorderBox)).toEqual([])
    expect(Array.from(page.children).map((el) => [tag(el), textOf(el)])).toEqual([
      ['p', '없는 주소'],
      ['h1', '찾는 화면이 없어요'],
      ['p', LEAD_OUT],
      ['p', '열려던 주소 /dashbord'],
      ['div', '처음 화면으로로그인'],
    ])
  })

  it('AC-410.2: 칩 줄은 위 24에 ds.chip.neutral "없는 주소", h1은 하나이고 heading-m → 768px 이상 heading, 안내는 body ink-2다', () => {
    const root = outScreen()
    const [status, , lead] = Array.from(root.firstElementChild!.children)
    expectClasses(status, 'mt-6')
    const chip = only(status!, 'span')
    expect(textOf(chip)).toBe('없는 주소')
    expectClasses(chip, ds.chip.neutral)
    const h1 = only(root, 'h1')
    expectClasses(h1, 'mt-2 text-heading-m md:text-heading font-semibold text-ink')
    expect(root.querySelectorAll('h2, h3, h4')).toHaveLength(0)
    expectClasses(lead, 'mt-2 text-body text-ink-2')
  })

  it('AC-410.2: 단추 줄(위 24 · 사이 8 · 줄바꿈)은 [처음 화면으로](/, 주 큰) · [로그인](/login, 보조 큰) 두 링크뿐이다', () => {
    const root = outScreen()
    expect(root.querySelectorAll('button, [role="button"], [role="link"]')).toHaveLength(0)
    const links = Array.from(root.querySelectorAll('a'))
    expect(links.map((a) => [a.getAttribute('href'), textOf(a)])).toEqual([
      ['/', '처음 화면으로'],
      ['/login', '로그인'],
    ])
    const row = links[0]!.parentElement!
    expect(links[1]!.parentElement).toBe(row)
    expectClasses(row, 'mt-6 flex flex-wrap gap-2')
    const [home, login] = links
    expectClasses(home, ds.button.primaryLarge)
    // 보조 큰 = 보조 색(line-strong 테두리 · surface · ink) + 큰 크기(44px · 좌우 20 · 600)
    expectClasses(login, 'h-11 px-5 font-semibold border-line-strong bg-surface text-ink')
    expect(classesOf(login)).not.toContain('bg-accent')
    // 휴대폰은 두 단추가 140px부터 나눠 늘어난다(시안 .col480.ph .btns .btn)
    for (const link of links) expectClasses(link, 'max-md:flex-[1_1_140px]')
  })

  it('AC-410.2: 열려던 주소 줄은 위 16, 이름표(small muted) + 경로다', () => {
    const line = addrLineOf(outScreen())
    expectClasses(line, 'mt-4 flex flex-wrap items-baseline')
    expect(classesOf(line)).not.toContain('justify-center')
    const [label, path] = Array.from(line.children)
    expectClasses(label, 'text-small text-muted')
    expect(textOf(path)).toBe('/dashbord')
  })

  it('AC-410.2: NotFoundScreen·RequestedPath는 Supabase·문지기(guard)·로그인 정보·fetch를 쓰지 않는다', () => {
    for (const rel of ['./NotFoundScreen.tsx', './RequestedPath.tsx']) {
      for (const from of importsOf(rel)) expect(from, rel).not.toMatch(/supabase|guard|lib\/auth|\.server/)
      expect(code(rel), rel).not.toMatch(/\bfetch\s*\(|\bcookies\s*\(|\bheaders\s*\(/)
    }
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch를 부르면 안 된다'))
    try {
      outScreen()
      appScreen()
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it("AC-410.2: NotFoundScreen은 서버 컴포넌트다('use client' 없음) — 열려던 주소 자리만 브라우저 부품이다", () => {
    expect(read('./NotFoundScreen.tsx')).not.toMatch(/['"]use client['"]/)
    expect(importsOf('./NotFoundScreen.tsx')).toContain('./RequestedPath')
  })
})

describe('AC-410.3: 열려던 주소(RequestedPath) — usePathname()의 경로만 글자로, 긴 경로는 줄바꿈', () => {
  it('AC-410.3: 주소창에 쿼리·해시가 있어도 usePathname()의 경로만 보인다', () => {
    window.history.replaceState(null, '', '/claim/close?tab=1#top')
    pathname.mockReturnValue('/claim/close')
    try {
      const { container } = render(<RequestedPath />)
      expect(container.textContent).toBe('/claim/close')
      expect(container.textContent).not.toMatch(/[?#]/)
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('AC-410.3: 꺾쇠 글자도 태그가 아니라 글자로 보인다', () => {
    const odd = '/x/<b>굵게</b><img src=x onerror=alert(1)>'
    pathname.mockReturnValue(odd)
    const { container } = render(<RequestedPath />)
    expect(container.textContent).toBe(odd)
    expect(container.querySelector('b, img')).toBeNull()
    expect(renderToStaticMarkup(<RequestedPath />)).toContain('&lt;b&gt;')
  })

  it('AC-410.3: 경로 하나만 그리는 span이고 고정폭 숫자 · break-all · body ink · canvas 바탕 4px 모서리다', () => {
    pathname.mockReturnValue('/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bbbb')
    const root = mount(<RequestedPath />)
    expect(root.children).toHaveLength(1)
    const span = root.firstElementChild!
    expect(tag(span)).toBe('span')
    expect(span.children).toHaveLength(0)
    expectClasses(span, 'tabular-nums break-all text-body text-ink bg-canvas rounded-control px-1.5 py-0.5')
  })

  it("AC-410.3: 'use client' 부품이고 usePathname()만 읽는다(쿼리·해시·주소창·HTML 넣기 없음)", () => {
    const src = read('./RequestedPath.tsx')
    expect(src.trimStart().startsWith("'use client'")).toBe(true)
    const body = code('./RequestedPath.tsx')
    expect(body).toMatch(/\busePathname\s*\(/)
    expect(body).not.toMatch(/useSearchParams|useParams|window\.|location\.|dangerouslySetInnerHTML|innerHTML/)
  })

  it('AC-410.3: 두 모양 모두 열려던 주소 자리에 RequestedPath를 그린다', () => {
    pathname.mockReturnValue('/claim/close')
    const want = renderToStaticMarkup(<RequestedPath />)
    for (const root of [appScreen(), outScreen()]) {
      const [, path] = Array.from(addrLineOf(root).children)
      expect(path!.outerHTML).toBe(want)
    }
  })
})
