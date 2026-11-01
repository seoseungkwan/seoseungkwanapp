// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolRow } from './ToolRow'

// 도구 단추 줄(AC-610.2, 목업 .tools·.tool). 나중에 다른 탭도 쓸 수 있게 props는 일반 모양이다
afterEach(cleanup)

const ITEMS = [
  { id: 'a', label: '가', href: '/x?tool=a' },
  { id: 'b', label: '나', href: '/x?tool=b' },
] as const

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(classes.split(' ')))
const hasNone = (el: Element, classes: string) => {
  for (const c of classes.split(' ')) expect(classesOf(el), c).not.toContain(c)
}

describe('ToolRow', () => {
  it('AC-610.2: 이름 붙은 nav 안에 항목마다 링크 하나, 받은 순서·이름·주소대로', () => {
    render(<ToolRow label="환자 도구" items={ITEMS} current="a" />)
    const nav = screen.getByRole('navigation', { name: '환자 도구' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['가', '/x?tool=a'],
      ['나', '/x?tool=b'],
    ])
  })

  it('AC-610.2: 고른 항목에만 aria-current="page"가 붙는다', () => {
    render(<ToolRow label="환자 도구" items={ITEMS} current="b" />)
    expect(screen.getByRole('link', { name: '가' }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('link', { name: '나' }).getAttribute('aria-current')).toBe('page')
  })

  it('AC-610.2: 고른 항목은 accent 테두리·accent-soft 바탕·accent-strong 600, 나머지는 line-strong·surface·ink 500 (목업 .tool)', () => {
    render(<ToolRow label="환자 도구" items={ITEMS} current="a" />)
    const on = screen.getByRole('link', { name: '가' })
    const off = screen.getByRole('link', { name: '나' })
    hasAll(on, 'border-accent bg-accent-soft text-accent-strong font-semibold')
    hasNone(on, 'border-line-strong bg-surface text-ink font-medium')
    hasAll(off, 'border-line-strong bg-surface text-ink font-medium hover:bg-canvas')
    hasNone(off, 'border-accent bg-accent-soft text-accent-strong font-semibold')
    // 공통: 36px(휴대폰 44px)·좌우 16·사이 8·4px·body·초점 고리
    for (const link of [on, off]) hasAll(link, 'h-9 max-md:h-11 px-4 gap-2 rounded-control border text-body shrink-0 focus-visible:outline-2')
  })

  it('AC-610.2: 줄은 사이 8px, 휴대폰은 본문 여백을 넘어 옆으로 밀린다(목업 .is-ph .tools)', () => {
    render(<ToolRow label="환자 도구" items={ITEMS} current="a" />)
    hasAll(screen.getByRole('navigation'), 'flex gap-2 max-md:-mx-4 max-md:overflow-x-auto max-md:px-4 max-md:py-0.5')
  })

  it('AC-610.2: 아이콘을 주면 꾸밈으로 글자 앞에 그린다(글자 이름은 그대로)', () => {
    render(<ToolRow label="환자 도구" items={[{ id: 'a', label: '가', href: '/x', icon: 'cal' }]} current="a" />)
    const link = screen.getByRole('link', { name: '가' })
    const icon = link.querySelector('svg')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(link.textContent).toBe('가')
  })
})
