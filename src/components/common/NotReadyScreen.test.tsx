// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ds } from '@/components/ui/classes'
import { isBorderBox, nestedBoxes } from '@/testing/boxes'
import { Icon } from './Icon'
import { NotReadyScreen } from './NotReadyScreen'
import type { NotReadyFeature } from './notReadyFeatures'

// 준비 중 화면 (tab-frame REQ-305 AC-305.1~305.3, design.md '준비 중 화면', 시안 docs/mockups/dashboard-home/index.html 화면 5 + notes.md §3 '준비 중 화면').
// 서버에서 그대로 그리는 화면 → renderToStaticMarkup으로 그린 마크업을 jsdom에 넣어 짜임·클래스·글자를 본다(보이는 모양은 Phase 끝 사진).
// 받은 자료를 그대로 그리는지 보려고 표에 없는 가짜 기능(시험 안에서만)을 준다

const FEATURE: NotReadyFeature = {
  path: '/contacts',
  name: '시험 기능',
  intro: '시험용 소개 문장이에요. 만들어지면 이 탭에서 바로 쓸 수 있어요.',
  items: ['셋째로 적은 것', '첫째로 적은 것', '둘째로 적은 것'],
}

const mount = (element: ReactElement) => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(element)
  return root
}
const screenOf = (feature: NotReadyFeature = FEATURE) => mount(<NotReadyScreen feature={feature} />)

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element | null | undefined) => tokens(el?.getAttribute('class') ?? '')
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted.flatMap(tokens)))
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const allClasses = (root: Element) => [root, ...Array.from(root.querySelectorAll('*'))].flatMap(classesOf)

const SOURCES = ['./NotReadyScreen.tsx', './notReadyFeatures.ts'].map((rel) => ({
  rel,
  text: readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'),
}))

// 바깥 상자(네 변 테두리를 가진 상자)는 하나뿐이다
const boxOf = (root: Element) => {
  const boxes = Array.from(root.querySelectorAll('*')).filter(isBorderBox)
  expect(boxes).toHaveLength(1)
  return boxes[0]!
}
// 상자 안 꾸밈 선 묶음: aria-hidden이고 svg가 아닌 것
const ghostOf = (root: Element) => {
  const found = Array.from(boxOf(root).querySelectorAll('[aria-hidden="true"]')).filter((el) => el.tagName.toLowerCase() !== 'svg')
  expect(found).toHaveLength(1)
  return found[0]!
}
// 글 묶음: 칩이 든 상자의 바로 아래 자식
const textGroupOf = (root: Element) => {
  const box = boxOf(root)
  const groups = Array.from(box.children).filter((el) => el.getAttribute('aria-hidden') !== 'true')
  expect(groups).toHaveLength(1)
  return groups[0]!
}
const linkOf = (root: Element) => {
  const links = root.querySelectorAll('a')
  expect(links).toHaveLength(1)
  return links[0]!
}

describe('AC-305.1: 준비 중 화면 — h1 기능 이름 → 바깥 상자 하나 안에 칩 · 안내 · 소개 · 만들 것 · 돌아가기', () => {
  it('AC-305.1: h1은 하나이고 받은 기능 이름이다(title 600 ink)', () => {
    const root = screenOf()
    const h1s = root.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(textOf(h1s[0])).toBe('시험 기능')
    expectClasses(h1s[0], 'text-title font-semibold text-ink')
    expect(textOf(screenOf({ ...FEATURE, name: '주소록' }).querySelector('h1'))).toBe('주소록')
  })

  it('AC-305.1: h1 아래에 바깥 상자 하나(ds.panel 틀)가 있다', () => {
    const root = screenOf()
    const box = boxOf(root)
    expectClasses(box, ds.panel)
    const h1 = root.querySelector('h1')!
    expect(h1.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(box.contains(h1)).toBe(false)
  })

  it('AC-305.1: 상자 안 글은 위에서부터 "준비 중" 칩 · "준비 중인 기능입니다" · 소개 문장 · 만들 것(받은 순서) · "대시보드로 돌아가기"다', () => {
    const group = textGroupOf(screenOf())
    expect(Array.from(group.children).map(textOf)).toEqual([
      '준비 중',
      '준비 중인 기능입니다',
      FEATURE.intro,
      // textContent는 li 글자를 빈칸 없이 잇는다(항목 하나하나는 아래 ul 시험이 본다)
      FEATURE.items.join(''),
      '대시보드로 돌아가기',
    ])
  })

  it('AC-305.1: 칩은 ds.chip.neutral "준비 중"이다', () => {
    const [chip] = Array.from(textGroupOf(screenOf()).children)
    expect(textOf(chip)).toBe('준비 중')
    expectClasses(chip, ds.chip.neutral)
  })

  it('AC-305.1: "준비 중인 기능입니다"는 subtitle 600 ink, 소개 문장은 ink-2다', () => {
    const [, title, intro] = Array.from(textGroupOf(screenOf()).children)
    expectClasses(title, 'text-subtitle font-semibold text-ink')
    expectClasses(intro, 'text-ink-2')
    expect(intro!.tagName.toLowerCase()).toBe('p')
  })

  it('AC-305.1: 만들 것은 ul 하나에 받은 순서대로 li이고 small muted다', () => {
    const lists = screenOf().querySelectorAll('ul')
    expect(lists).toHaveLength(1)
    const list = lists[0]!
    expect(Array.from(list.children).map((li) => [li.tagName.toLowerCase(), textOf(li)])).toEqual(FEATURE.items.map((item) => ['li', item]))
    expectClasses(list, 'text-small text-muted')
  })

  it('AC-305.1: 돌아가기 링크는 /dashboard, ds.button.secondary 모양 + 짧은 반응(transition · 누름 1px)이다', () => {
    const link = linkOf(screenOf())
    expect(link.getAttribute('href')).toBe('/dashboard')
    expect(textOf(link)).toBe('대시보드로 돌아가기')
    expectClasses(link, ds.button.secondary, 'transition not-disabled:active:translate-y-px')
  })

  it('AC-305.1: 링크 안 왼쪽에 꾸밈 화살표(arrow를 돌림, aria-hidden)가 있다', () => {
    const link = linkOf(screenOf())
    const svgs = link.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    const svg = svgs[0]!
    expect(link.firstElementChild).toBe(svg)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expectClasses(svg, 'rotate-180')
    expect(svg.innerHTML).toBe(mount(<Icon name="arrow" />).querySelector('svg')!.innerHTML)
  })

  it('AC-305.1: 링크·단추는 돌아가기 링크 하나뿐이다', () => {
    expect(screenOf().querySelectorAll('a, button, [role="button"], [role="link"]')).toHaveLength(1)
  })
})

describe('AC-305.2: 꾸밈 선 묶음과 폭별 모양', () => {
  it('AC-305.2: 상자 안에 글자 없는 꾸밈 선 묶음이 aria-hidden="true"로 있다 — 1px 선 넷, 마지막만 line-strong', () => {
    const ghost = ghostOf(screenOf())
    expect(textOf(ghost)).toBe('')
    const lines = Array.from(ghost.children)
    expect(lines).toHaveLength(4)
    for (const line of lines) expectClasses(line, 'h-px')
    expect(lines.map((line) => classesOf(line).filter((t) => t.startsWith('bg-')))).toEqual([['bg-line'], ['bg-line'], ['bg-line'], ['bg-line-strong']])
  })

  it('AC-305.2: 꾸밈 선은 상자 안쪽에 절대 위치로 놓인다(768px 미만 위아래 24·좌우 16, 이상 위아래 64·오른쪽 40·왼쪽 72)', () => {
    const ghost = ghostOf(screenOf())
    expectClasses(ghost, 'absolute top-6 bottom-6 left-4 right-4 md:top-16 md:bottom-16 md:left-18 md:right-10')
    expectClasses(boxOf(screenOf()), 'relative')
  })

  it('AC-305.2: 768px 이상은 상자 높이 420px(md:h-105)이고 글 묶음이 가운데다(글 묶음 안쪽 위아래 20·좌우 24)', () => {
    const root = screenOf()
    const box = boxOf(root)
    expectClasses(box, 'md:h-105 flex items-center justify-center md:py-0')
    expectClasses(textGroupOf(root), 'md:py-5 md:px-6 text-center')
  })

  it('AC-305.2: 768px 미만은 높이가 글에 맞고, 상자 위아래 48 + 글 묶음 위아래 12(좌우 16) = 글까지 60px', () => {
    const root = screenOf()
    const box = boxOf(root)
    expectClasses(box, 'py-12')
    // 정해 둔 높이는 768px 이상에만 있다
    expect(classesOf(box).filter((t) => /^(?:min-|max-)?h-/.test(t))).toEqual([])
    expectClasses(textGroupOf(root), 'py-3 px-4')
  })

  it('AC-305.2: 글 묶음은 surface 바탕으로 꾸밈 선을 가린다(선보다 위에 그린다)', () => {
    const root = screenOf()
    const group = textGroupOf(root)
    expectClasses(group, 'relative bg-surface')
    expect(ghostOf(root).compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-305.2: 768px 미만 돌아가기 링크는 44px다(ds.button의 폰 규칙 max-md:h-11)', () => {
    expectClasses(linkOf(screenOf()), 'max-md:h-11')
  })

  it('AC-305.2: 768~1023px도 PC 값이다 — 1024px 기준 접두사(lg:·max-lg:)를 쓰지 않는다', () => {
    expect(allClasses(screenOf()).filter((t) => /(?:^|:)(?:max-)?lg:/.test(t))).toEqual([])
  })
})

describe('AC-305.3: 자료를 읽지 않는 서버 화면 · 앱 틀 없음 · 상자 안 상자 없음 · overflow-hidden 없음', () => {
  it.each(SOURCES)("AC-305.3: $rel은 Supabase·문지기(*.server)·fetch·브라우저 저장소를 쓰지 않고 'use client'가 아니다", ({ text }) => {
    expect(text).not.toMatch(/supabase|\.server['"]|guard\.server|\bfetch\s*\(|localStorage|sessionStorage|indexedDB|document\.cookie/)
    expect(text).not.toMatch(/^\s*['"]use client['"]/m)
  })

  it.each(SOURCES)('AC-305.3: $rel은 앱 틀(components/shell)·대시보드(components/dashboard)를 불러오지 않는다', ({ text }) => {
    expect(text).not.toMatch(/from ['"]@\/components\/(?:shell|dashboard)\//)
  })

  it('AC-305.3: 앱 틀(main·header·nav·.app-ui)을 다시 그리지 않는다', () => {
    const root = screenOf()
    expect(root.querySelectorAll('main, header, nav, .app-ui')).toHaveLength(0)
  })

  it('AC-305.3: 상자 안 상자가 없다(nestedBoxes)', () => {
    expect(nestedBoxes(screenOf())).toEqual([])
  })

  it('AC-305.3: overflow-hidden 클래스를 쓰지 않는다(그린 결과와 소스)', () => {
    expect(allClasses(screenOf()).filter((t) => t.endsWith('overflow-hidden'))).toEqual([])
    for (const { rel, text } of SOURCES) expect(text, rel).not.toContain('overflow-hidden')
  })
})
