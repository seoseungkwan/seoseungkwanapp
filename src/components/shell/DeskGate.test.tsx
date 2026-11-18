// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { nestedBoxes } from '@/testing/boxes'
import { DeskGate } from './DeskGate'
import { RoleProvider, useDesk } from './role'

// 데스크 문지기·막힌 화면 (desk-feedback REQ-6306 AC-6306.3, design.md '④ 데스크 화면', 시안 docs/mockups/desk-feedback ④).
// (app) 레이아웃은 지금 주소를 모르고 옆 화면으로 옮겨도 다시 그려지지 않는다 → usePathname으로 주소마다 바로 거른다.
// next/navigation은 흉내 낸다(useRouter는 Next처럼 늘 같은 router)

const { pathname, router } = vi.hoisted(() => ({ pathname: vi.fn(() => '/sunap'), router: { replace: vi.fn(), push: vi.fn() } }))
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => router }))

const TITLE = '데스크 계정은 볼 수 없는 화면이에요'
const LEAD = '업무일지 · 수납일지 · 예약만 쓸 수 있어요.'

const gate = () => (
  <DeskGate>
    <p>본문</p>
  </DeskGate>
)
const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect(tokens(el)).toEqual(expect.arrayContaining(classes.split(/\s+/).filter(Boolean)))

beforeEach(() => {
  pathname.mockReturnValue('/sunap')
  router.replace.mockReset()
  router.push.mockReset()
})
afterEach(cleanup)

describe('AC-6306.3 DeskGate — 주소마다 본문·막힌 화면·수납일지로 바꾸기', () => {
  it.each(['/worklog', '/worklog/x', '/sunap', '/sunap/x', '/calendar', '/calendar/x'])('AC-6306.3: 세 탭 주소와 그 아래(%s)는 본문을 그대로 그린다', (path) => {
    pathname.mockReturnValue(path)
    const { container } = render(gate())
    expect(screen.getByText('본문')).toBeTruthy()
    expect(container.innerHTML).toBe('<p>본문</p>')
    expect(screen.queryByText(TITLE)).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it.each(['/stats', '/stats/x', '/claim', '/claim/setup', '/patients', '/ai-report', '/forms', '/notices', '/settings', '/admin', '/sunapx'])(
    'AC-6306.3: 다른 주소(%s)는 본문 대신 막힌 화면 — h1 "데스크 계정은 볼 수 없는 화면이에요" · 글 · [수납일지로 가기](/sunap)',
    (path) => {
      pathname.mockReturnValue(path)
      render(gate())
      expect(screen.queryByText('본문')).toBeNull()
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1.textContent).toBe(TITLE)
      expect(screen.getByText(LEAD).tagName).toBe('P')
      const link = screen.getByRole('link', { name: '수납일지로 가기' })
      expect(link.getAttribute('href')).toBe('/sunap')
      expect(screen.getAllByRole('link')).toEqual([link])
      expect(router.replace).not.toHaveBeenCalled()
    },
  )

  it('AC-6306.3: 막힌 화면은 가운데 정렬 패널 하나(ds.panel)이고 [수납일지로 가기]는 주 단추 모양 링크다. 상자 안 상자가 없다', () => {
    pathname.mockReturnValue('/stats')
    const { container } = render(gate())
    const card = container.firstElementChild as HTMLElement
    hasAll(card, `${ds.panel} text-center`)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(card.contains(h1)).toBe(true)
    hasAll(h1, 'font-semibold text-ink')
    hasAll(screen.getByRole('link', { name: '수납일지로 가기' }), `${ds.button.primary} no-underline`)
    // h1 → 글 → 링크 차례
    expect(Array.from(card.children).map((el) => el.textContent)).toEqual([TITLE, LEAD, '수납일지로 가기'])
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-6306.3: /dashboard면 수납일지(/sunap)로 바꾸고(router.replace 한 번, push 아님) 그동안 아무것도 그리지 않는다', () => {
    pathname.mockReturnValue('/dashboard')
    const { container } = render(gate())
    expect(container.innerHTML).toBe('')
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/sunap')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('AC-6306.3: 옆 화면으로 옮겨 가면(DeskGate가 다시 붙지 않아도) 주소에 따라 바로 바뀐다', () => {
    const { container, rerender } = render(gate())
    expect(screen.getByText('본문')).toBeTruthy()
    pathname.mockReturnValue('/stats')
    rerender(gate())
    expect(screen.queryByText('본문')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TITLE)
    pathname.mockReturnValue('/calendar')
    rerender(gate())
    expect(container.innerHTML).toBe('<p>본문</p>')
    pathname.mockReturnValue('/dashboard')
    rerender(gate())
    expect(container.innerHTML).toBe('')
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/sunap')
    // 같은 주소로 다시 그려도 또 바꾸지 않는다
    rerender(gate())
    expect(router.replace).toHaveBeenCalledTimes(1)
    pathname.mockReturnValue('/sunap')
    rerender(gate())
    expect(container.innerHTML).toBe('<p>본문</p>')
    expect(router.replace).toHaveBeenCalledTimes(1)
  })
})

describe('AC-6306.2 RoleProvider·useDesk', () => {
  function Probe() {
    return <p>{useDesk() ? '데스크' : '원장'}</p>
  }

  it('AC-6306.2: useDesk()는 RoleProvider 밖에서 거짓(원장 화면·지금 시험 그대로), RoleProvider desk 안에서 참, desk={false} 안에서 거짓이다', () => {
    const { container, rerender } = render(<Probe />)
    expect(container.textContent).toBe('원장')
    rerender(
      <RoleProvider desk>
        <Probe />
      </RoleProvider>,
    )
    expect(container.textContent).toBe('데스크')
    rerender(
      <RoleProvider desk={false}>
        <Probe />
      </RoleProvider>,
    )
    expect(container.textContent).toBe('원장')
  })

  it('AC-6306.2: RoleProvider는 마크업을 더하지 않는다', () => {
    const { container } = render(
      <RoleProvider desk>
        <p>본문</p>
      </RoleProvider>,
    )
    expect(container.innerHTML).toBe('<p>본문</p>')
  })
})
