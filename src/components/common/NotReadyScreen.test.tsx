// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Link from 'next/link'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ds } from '@/components/ui/classes'
import { isBorderBox, nestedBoxes } from '@/testing/boxes'
import { Icon } from './Icon'
import { NotReadyScreen } from './NotReadyScreen'
import type { NotReadyFeature } from './notReadyFeatures'

// 준비 중 화면 새 배치 (ui-90 REQ-415 AC-415.2~415.4, design.md '준비 중 (TASK-12)', UI_GUIDE '빈 상태',
// 시안 docs/mockups/ui-90/app/gen.py nr_body · CSS .nr*·.dots·.mw*).
// 서버에서 그대로 그리는 화면 → renderToStaticMarkup으로 그린 마크업을 jsdom에 넣어 짜임·클래스·글자를 본다(보이는 모양은 Phase 끝 사진).
// 받은 자료를 그대로 그리는지 보려고 표에 없는 가짜 기능(시험 안에서만)을 준다. 화면은 title·intro·items 셋만 받는다(청구 연결됨이 같은 화면을 쓴다)

const FEATURE: Pick<NotReadyFeature, 'title' | 'intro' | 'items'> = {
  title: '시험 기능은 준비 중이에요',
  intro: '시험용 소개 문장이에요. 만들어지면 이 탭에서 바로 쓸 수 있어요.',
  items: ['셋째로 적은 것', '첫째로 적은 것', '둘째로 적은 것'],
}

const mount = (element: ReactElement) => {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(element)
  return root
}
const screenOf = (props: Partial<Parameters<typeof NotReadyScreen>[0]> = {}) => mount(<NotReadyScreen feature={FEATURE} {...props} />)

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element | null | undefined) => tokens(el?.getAttribute('class') ?? '')
const expectClasses = (el: Element | null | undefined, ...wanted: string[]) =>
  expect(classesOf(el)).toEqual(expect.arrayContaining(wanted.flatMap(tokens)))
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const tag = (el: Element | null | undefined) => el?.tagName.toLowerCase()
const allClasses = (root: Element) => [root, ...Array.from(root.querySelectorAll('*'))].flatMap(classesOf)

const SOURCES = ['./NotReadyScreen.tsx', './notReadyFeatures.ts'].map((rel) => ({
  rel,
  text: readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'),
}))

// 화면 뿌리 = 마운트한 감싸개의 하나뿐인 자식. 그 바로 아래 칸: 왼쪽 · 오른쪽(만들 것) · 그동안(있을 때)
const layoutOf = (root: Element) => {
  expect(root.children).toHaveLength(1)
  return root.firstElementChild!
}
const columnsOf = (root: Element) => Array.from(layoutOf(root).children)
const leftOf = (root: Element) => columnsOf(root)[0]!
const rightOf = (root: Element) => columnsOf(root)[1]!
const meanwhileOf = (root: Element) => {
  const columns = columnsOf(root)
  expect(columns).toHaveLength(3)
  return columns[2]!
}
// 돌아가기 자리(왼쪽 칸 마지막 자식)
const actionSlotOf = (root: Element) => leftOf(root).lastElementChild!
const backLinkOf = (root: Element) => {
  const links = actionSlotOf(root).querySelectorAll('a')
  expect(links).toHaveLength(1)
  return links[0]!
}
const arrowSvg = () => mount(<Icon name="arrow" />).querySelector('svg')!.innerHTML

const MEANWHILE = [
  { href: '/claim/setup', label: '비트 PC 연결', desc: '청구 점검을 쓰려면 먼저 해요' },
  { href: '/claim', label: '청구', desc: '삭감 예방 사전점검' },
]

describe('AC-415.2: 준비 중 화면 짜임 — 왼쪽 칸(칩 · h1 title · 소개 · 돌아가기) · 오른쪽 칸(만들 것) · 그 아래 그동안 쓸 수 있어요', () => {
  it('AC-415.2: 뿌리 아래 칸은 차례로 왼쪽 · 오른쪽(만들 것) · 그동안 쓸 수 있어요 셋이다', () => {
    const root = screenOf()
    const [left, right, meanwhile] = columnsOf(root)
    expect(columnsOf(root)).toHaveLength(3)
    expect(left!.querySelector('h1')).not.toBeNull()
    expect(textOf(right!.querySelector('h2'))).toBe('만들 것')
    expect(textOf(meanwhile!.querySelector('h2'))).toBe('그동안 쓸 수 있어요')
  })

  it('AC-415.2: 왼쪽 칸은 위에서부터 "준비 중" 칩 · h1(받은 title) · 소개 문장 · [대시보드로 돌아가기]다', () => {
    const left = leftOf(screenOf())
    const children = Array.from(left.children)
    expect(children.map(tag)).toEqual(['span', 'h1', 'p', 'div'])
    expect(children.map(textOf)).toEqual(['준비 중', FEATURE.title, FEATURE.intro, '대시보드로 돌아가기'])
  })

  it('AC-415.2: 칩은 ds.chip.neutral "준비 중"이다', () => {
    const chip = leftOf(screenOf()).firstElementChild
    expect(textOf(chip)).toBe('준비 중')
    expectClasses(chip, ds.chip.neutral)
  })

  it('AC-415.2: h1은 화면에 하나이고 받은 title이다 — heading 600 ink(768px 미만 heading-m), 위 12', () => {
    const root = screenOf()
    const h1s = root.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(textOf(h1s[0])).toBe(FEATURE.title)
    expectClasses(h1s[0], 'mt-3 text-heading-m md:text-heading font-semibold text-ink text-balance')
    expect(textOf(screenOf({ feature: { ...FEATURE, title: '주소록은 준비 중이에요' } }).querySelector('h1'))).toBe('주소록은 준비 중이에요')
  })

  it('AC-415.2: 소개 문장은 p, lead ink-2, 위 12, 최대 폭 480px(max-w-120 = 시안 30em × 16px)이다', () => {
    const intro = leftOf(screenOf()).children[2]
    expect(tag(intro)).toBe('p')
    expect(textOf(intro)).toBe(FEATURE.intro)
    expectClasses(intro, 'mt-3 text-lead text-ink-2 max-w-120')
  })

  it('AC-415.2: [대시보드로 돌아가기]는 /dashboard 보조 단추(ds.button.secondary)이고 폰은 전체 폭, 위 24다', () => {
    const root = screenOf()
    const link = backLinkOf(root)
    expect(link.getAttribute('href')).toBe('/dashboard')
    expect(textOf(link)).toBe('대시보드로 돌아가기')
    expectClasses(link, ds.button.secondary, 'max-md:w-full')
    expectClasses(actionSlotOf(root), 'mt-6')
  })

  it('AC-415.2: 돌아가기 링크 안 왼쪽에 왼쪽을 보는 꾸밈 화살표(arrow를 돌림, ink-2, aria-hidden)가 있다', () => {
    const link = backLinkOf(screenOf())
    const svgs = link.querySelectorAll('svg')
    expect(svgs).toHaveLength(1)
    const svg = svgs[0]!
    expect(link.firstElementChild).toBe(svg)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expectClasses(svg, 'rotate-180 text-ink-2')
    expect(svg.innerHTML).toBe(arrowSvg())
  })

  it('AC-415.2: 오른쪽 칸은 h2 "만들 것"(small 600 muted) → 점 목록 ul 하나(받은 순서)다', () => {
    const right = rightOf(screenOf())
    const children = Array.from(right.children)
    expect(children.map(tag)).toEqual(['h2', 'ul'])
    expectClasses(children[0], 'text-small font-semibold text-muted')
    const list = children[1]!
    expect(Array.from(list.children).map((li) => [tag(li), textOf(li)])).toEqual(FEATURE.items.map((item) => ['li', item]))
    expectClasses(list, 'mt-3')
  })

  it('AC-415.2: 만들 것 줄마다 앞에 꾸밈 점(aria-hidden, 6px accent) 하나 + 글(body ink)이다', () => {
    const list = rightOf(screenOf()).querySelector('ul')!
    for (const li of Array.from(list.children)) {
      expectClasses(li, 'flex text-body text-ink')
      const dot = li.firstElementChild!
      expect(li.children).toHaveLength(1)
      expect(tag(dot)).toBe('span')
      expect(dot.getAttribute('aria-hidden')).toBe('true')
      expect(textOf(dot)).toBe('')
      expectClasses(dot, 'size-1.5 shrink-0 bg-accent')
    }
  })

  it('AC-415.2: 그동안 쓸 수 있어요 — 위 1px line, h2(small 600 muted) → ul 하나에 링크 둘(글자 단추 + 화살표)과 설명이 차례로 있다', () => {
    const meanwhile = meanwhileOf(screenOf())
    expectClasses(meanwhile, 'border-t border-line pt-5')
    const children = Array.from(meanwhile.children)
    expect(children.map(tag)).toEqual(['h2', 'ul'])
    expectClasses(children[0], 'text-small font-semibold text-muted')
    const items = Array.from(children[1]!.children)
    expect(items.map(tag)).toEqual(['li', 'li'])
    expect(
      items.map((li) => {
        const [link, desc] = Array.from(li.children)
        return { tags: Array.from(li.children).map(tag), href: link!.getAttribute('href'), label: textOf(link), desc: textOf(desc) }
      }),
    ).toEqual(MEANWHILE.map(({ href, label, desc }) => ({ tags: ['a', 'span'], href, label, desc })))
  })

  it('AC-415.2: 그동안 링크는 ds.textButton 모양이고 끝에 오른쪽 화살표(돌리지 않음, aria-hidden)가 있다. 설명은 small muted다', () => {
    const items = Array.from(meanwhileOf(screenOf()).querySelector('ul')!.children)
    for (const li of items) {
      const [link, desc] = Array.from(li.children)
      expectClasses(link, ds.textButton)
      const svgs = link!.querySelectorAll('svg')
      expect(svgs).toHaveLength(1)
      expect(link!.lastElementChild).toBe(svgs[0])
      expect(svgs[0]!.getAttribute('aria-hidden')).toBe('true')
      expect(classesOf(svgs[0])).not.toContain('rotate-180')
      expect(svgs[0]!.innerHTML).toBe(arrowSvg())
      expectClasses(desc, 'text-small text-muted')
    }
  })

  it('AC-415.2: 화면의 링크는 셋(돌아가기 + 그동안 둘)이고 단추는 없다', () => {
    const root = screenOf()
    expect(Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['/dashboard', '/claim/setup', '/claim'])
    expect(root.querySelectorAll('button, [role="button"], [role="link"]')).toHaveLength(0)
  })

  it('AC-415.2: 1024px 이상 12칸(사이 24) — 왼쪽 1~6 · 오른쪽 8~12(위 32) · 그동안 전체 폭(위 48)', () => {
    const root = screenOf()
    expectClasses(layoutOf(root), 'lg:grid lg:grid-cols-12 lg:gap-x-6')
    expectClasses(leftOf(root), 'lg:col-span-6')
    expectClasses(rightOf(root), 'lg:col-span-5 lg:col-start-8 lg:mt-0 lg:border-t-0 lg:pt-8')
    expectClasses(meanwhileOf(root), 'lg:col-span-12 lg:mt-12')
  })

  it('AC-415.2: 1024px 미만은 쌓는다 — 만들 것 위 32 + 1px line + 20, 그동안도 위 32 + 1px line + 20', () => {
    const root = screenOf()
    // 12칸은 1024px 이상에만 있다
    expect(classesOf(layoutOf(root)).filter((t) => /(?:^|:)grid(?:-cols-|$)/.test(t))).toEqual(['lg:grid', 'lg:grid-cols-12'])
    expectClasses(rightOf(root), 'mt-8 border-t border-line pt-5')
    expectClasses(meanwhileOf(root), 'mt-8 border-t border-line pt-5')
  })

  it('AC-415.2: 그동안 목록은 768px 미만 한 줄씩 쌓고(링크 아래 설명), 768px 이상은 옆으로 놓는다', () => {
    const list = meanwhileOf(screenOf()).querySelector('ul')!
    expectClasses(list, 'flex flex-col md:flex-row md:flex-wrap')
    for (const li of Array.from(list.children)) expectClasses(li, 'flex flex-col md:flex-row md:items-center')
  })
})

describe('AC-415.3: 바깥 상자 · 꾸밈 선 · 고정 높이 없음 · 상자 안 상자 없음 · 자료를 읽지 않는 서버 화면', () => {
  const variants = [
    ['기본', {}],
    ['action · meanwhile={false}', { action: <Link href="/x">다른 단추</Link>, meanwhile: false }],
  ] as const

  it.each(variants)('AC-305.3·AC-415.3: (%s) 네 변 테두리 상자(ds.panel 포함)가 없다', (_name, props) => {
    const root = screenOf(props)
    expect([root, ...Array.from(root.querySelectorAll('*'))].filter(isBorderBox)).toEqual([])
    const panel = tokens(ds.panel)
    expect(Array.from(root.querySelectorAll('*')).filter((el) => panel.every((t) => classesOf(el).includes(t)))).toEqual([])
    expect(nestedBoxes(root)).toEqual([])
  })

  it.each(variants)('AC-415.3: (%s) 꾸밈 선(1px 높이·폭 요소)이 없고, svg가 아닌 aria-hidden 요소는 만들 것의 꾸밈 점뿐이다', (_name, props) => {
    const root = screenOf(props)
    expect(allClasses(root).filter((t) => /(?:^|:)[hw]-px$/.test(t))).toEqual([])
    const hidden = Array.from(root.querySelectorAll('[aria-hidden="true"]')).filter((el) => tag(el) !== 'svg')
    const dots = Array.from(rightOf(root).querySelectorAll('li > span[aria-hidden="true"]'))
    expect(hidden).toEqual(dots)
    expect(dots).toHaveLength(FEATURE.items.length)
  })

  it.each(variants)('AC-415.3: (%s) 짜임 요소(div·section·ul·li·p·h1·h2)에 고정 높이(h-*·min-h-*)가 없다', (_name, props) => {
    const root = screenOf(props)
    const layout = [layoutOf(root), ...Array.from(layoutOf(root).querySelectorAll('div, section, ul, li, p, h1, h2'))]
    expect(layout.flatMap(classesOf).filter((t) => /(?:^|:)(?:min-)?h-/.test(t))).toEqual([])
  })

  it('AC-305.3·AC-415.3: 앱 틀(main·header·nav·.app-ui)을 다시 그리지 않는다', () => {
    expect(screenOf().querySelectorAll('main, header, nav, .app-ui')).toHaveLength(0)
  })

  it('AC-305.3·AC-415.3: overflow-hidden 클래스를 쓰지 않는다(그린 결과와 소스)', () => {
    expect(allClasses(screenOf()).filter((t) => t.endsWith('overflow-hidden'))).toEqual([])
    for (const { rel, text } of SOURCES) expect(text, rel).not.toContain('overflow-hidden')
  })

  it.each(SOURCES)("AC-305.3·AC-415.3: $rel은 Supabase·문지기(*.server)·fetch·브라우저 저장소를 쓰지 않고 'use client'가 아니다", ({ text }) => {
    expect(text).not.toMatch(/supabase|\.server['"]|guard\.server|\bfetch\s*\(|localStorage|sessionStorage|indexedDB|document\.cookie/)
    expect(text).not.toMatch(/^\s*['"]use client['"]/m)
  })

  it.each(SOURCES)('AC-305.3·AC-415.3: $rel은 앱 틀(components/shell)·대시보드(components/dashboard)를 불러오지 않는다', ({ text }) => {
    expect(text).not.toMatch(/from ['"]@\/components\/(?:shell|dashboard)\//)
  })

  it('AC-415.3: NotReadyScreen.tsx는 ds.panel을 쓰지 않는다', () => {
    expect(SOURCES[0]!.text).not.toMatch(/ds\.panel\b/)
  })
})

describe('AC-415.4: action · meanwhile — 돌아가기 자리와 "그동안 쓸 수 있어요"를 바꿀 수 있다', () => {
  const ACTION = (
    <Link href="/claim/setup" className="action-test">
      비트 PC 연결 다시 확인
    </Link>
  )

  it('AC-415.4: 주지 않으면 돌아가기 링크와 "그동안 쓸 수 있어요"가 있다', () => {
    const root = screenOf()
    expect(textOf(actionSlotOf(root))).toBe('대시보드로 돌아가기')
    expect(textOf(meanwhileOf(root).querySelector('h2'))).toBe('그동안 쓸 수 있어요')
  })

  it('AC-415.4: action과 meanwhile={false}를 주면 돌아가기 자리에 받은 action이 그대로 오고 "그동안 쓸 수 있어요"가 없다', () => {
    const root = screenOf({ action: ACTION, meanwhile: false })
    expect(actionSlotOf(root).innerHTML).toBe(renderToStaticMarkup(ACTION))
    expect(columnsOf(root)).toHaveLength(2)
    expect(textOf(root)).not.toContain('대시보드로 돌아가기')
    expect(textOf(root)).not.toContain('그동안 쓸 수 있어요')
    expect(root.querySelector('a[href="/dashboard"], a[href="/claim"]')).toBeNull()
    // 나머지 짜임은 그대로다
    expect(Array.from(leftOf(root).children).map(textOf)).toEqual(['준비 중', FEATURE.title, FEATURE.intro, '비트 PC 연결 다시 확인'])
    expect(textOf(rightOf(root).querySelector('h2'))).toBe('만들 것')
  })

  it('AC-415.4: action만 주면 돌아가기 자리만 바뀌고 "그동안 쓸 수 있어요"는 남는다', () => {
    const root = screenOf({ action: ACTION })
    expect(actionSlotOf(root).innerHTML).toBe(renderToStaticMarkup(ACTION))
    expect(textOf(meanwhileOf(root).querySelector('h2'))).toBe('그동안 쓸 수 있어요')
  })

  it('AC-415.4: meanwhile={false}만 주면 돌아가기 링크는 남고 "그동안 쓸 수 있어요"가 없다', () => {
    const root = screenOf({ meanwhile: false })
    expect(backLinkOf(root).getAttribute('href')).toBe('/dashboard')
    expect(columnsOf(root)).toHaveLength(2)
    expect(textOf(root)).not.toContain('그동안 쓸 수 있어요')
  })
})
