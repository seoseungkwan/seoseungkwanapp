// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminNav } from './AdminNav'

// 관리자 화면 안쪽 메뉴 (admin-view REQ-8012 AC-8012.4, design.md '관리자 화면', 시안 docs/mockups/admin-view ?s=admin-list adminHead).
// 모양은 설정 화면 안쪽 메뉴(SettingsPage·SetupScreen의 SettingsSubnav, AC-034.2)와 같다 — 페이지 이동 링크라 tablist가 아니고 aria-current.
// 폰 전용 모양은 만들지 않는다(사용자 규칙 2026-11-21): max-md: 클래스가 없다
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(classesOf(el), t).not.toContain(t)
}

const nav = () => screen.getByRole('navigation', { name: '관리자 안 메뉴' })
const links = () => within(nav()).getAllByRole('link')

afterEach(cleanup)

describe('AC-8012.4 관리자 화면 안쪽 메뉴', () => {
  it('AC-8012.4: 링크 둘 `가입 승인`(/admin) | `의원 비교`(/admin/compare), 그 차례', () => {
    render(<AdminNav current="/admin" />)
    expect(links().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['가입 승인', '/admin'],
      ['의원 비교', '/admin/compare'],
    ])
  })

  it.each([
    ['/admin', '가입 승인'],
    ['/admin/compare', '의원 비교'],
  ] as const)('AC-8012.4: 지금 화면(%s) 링크 하나만 aria-current="page"(%s)', (current, label) => {
    render(<AdminNav current={current} />)
    expect(links().filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual([label])
    expect(links().filter((a) => a.hasAttribute('aria-current'))).toHaveLength(1)
  })

  it('AC-8012.4: 설정 안쪽 메뉴와 같은 모양 — 줄 아래 1px line, 항목 40px·좌우 12px·body·rounded-control·첫 항목 왼쪽 12px 당김, 키보드 초점은 안쪽 2px accent 고리', () => {
    render(<AdminNav current="/admin" />)
    expect(nav().tagName).toBe('NAV')
    hasAll(nav(), 'flex border-b border-line')
    for (const a of links()) {
      hasAll(a, 'relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body no-underline first:-ml-3')
      hasAll(a, 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    }
  })

  it('AC-8012.4: 지금 링크는 ink 600 + 아래 2px accent 밑줄, 다른 링크는 ink-2 500 → 올림 ink(설정 안쪽 메뉴 값 그대로)', () => {
    render(<AdminNav current="/admin/compare" />)
    const [apply, compare] = links()
    hasAll(compare, 'font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent')
    hasNone(compare, 'font-medium text-ink-2 font-bold text-accent')
    hasAll(apply, 'font-medium text-ink-2 hover:text-ink')
    hasNone(apply, 'font-semibold after:bg-accent text-accent')
  })

  it('AC-8012.4: 폰 전용 모양이 없다(max-md: 클래스 없음)', () => {
    render(<AdminNav current="/admin" />)
    for (const el of [nav(), ...links()]) expect(classesOf(el).filter((t) => t.startsWith('max-md:'))).toEqual([])
  })

  it('AC-8012.4: 계정 메뉴에는 [의원 비교]를 더하지 않는다 — AccountMenu 소스에 의원 비교·/admin/compare가 없다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/shell/AccountMenu.tsx'), 'utf8')
    expect(source).not.toMatch(/의원 비교|\/admin\/compare/)
  })
})
