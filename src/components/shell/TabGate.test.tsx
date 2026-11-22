// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import type { MenuPath } from './menu'
import { TabGate } from './TabGate'

// 관리자만 보는 탭 돌려보내기 (multi-admin REQ-7706 AC-7706.4, design.md '앱 틀'·기본값 18·22, ADR-042).
// (app) 레이아웃은 지금 주소를 모르고 옆 화면으로 옮길 때 다시 그려지지 않는다 → DeskGate처럼 주소(usePathname)마다 거른다.
// 숨긴 탭 자리(그 아래 포함)면 본문을 비우고 /dashboard로 바꾼다(replace). 글·알림은 없다(requirements.md '화면 글자' 끝 줄).
// next/navigation은 흉내 낸다(useRouter는 Next처럼 늘 같은 router)

const { pathname, router } = vi.hoisted(() => ({ pathname: vi.fn(() => '/dashboard'), router: { replace: vi.fn(), push: vi.fn() } }))
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => router }))
// 앱 틀 시험에서 탭 숫자(NoticeBadge)가 읽는 안 읽은 수 — 실제 Supabase에 붙지 않는다(실패 = 아무것도 그리지 않음)
vi.mock('@/lib/storage/notices', () => ({ NOTICES_CHANGED: 'notices:changed', unreadCount: vi.fn(async () => 'failed') }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))

const gate = (hidden: readonly MenuPath[]) => (
  <TabGate hidden={hidden}>
    <p>본문</p>
  </TabGate>
)

beforeEach(() => {
  pathname.mockReturnValue('/dashboard')
  router.replace.mockReset()
  router.push.mockReset()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true })
})
afterEach(() => {
  cleanup()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

describe('AC-7706.4 TabGate — 숨긴 탭 주소는 말 없이 /dashboard로', () => {
  it.each([
    ['/stats', ['/stats']],
    ['/stats/x', ['/stats']],
    ['/claim', ['/claim']],
    ['/claim/x', ['/claim']],
    ['/staff', ['/stats', '/staff']],
    ['/notices/week', ['/notices']],
    ['/sunap', ['/sunap']],
  ] as const)('AC-7706.4: 숨긴 탭 주소와 그 아래(%s, 숨김 %j)는 본문을 그리지 않고 router.replace("/dashboard")를 한 번 부른다 — 글·알림 없음', (path, hidden) => {
    pathname.mockReturnValue(path)
    const { container } = render(gate(hidden))
    expect(container.innerHTML).toBe('')
    expect(screen.queryByText('본문')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard')
    expect(router.push).not.toHaveBeenCalled()
  })

  it.each([
    ['/claim/setup', ['/claim']],
    ['/claim/setup/x', ['/claim']],
    ['/dashboard', ['/stats', '/claim']],
    ['/settings', ['/stats']],
    ['/admin', ['/stats']],
    ['/patients', ['/stats', '/claim']],
    ['/statsx', ['/stats']],
    ['/somewhere', ['/stats']],
  ] as const)('AC-7706.4: 숨긴 탭 자리가 아닌 주소(%s, 숨김 %j — /claim/setup은 설정 자리)는 본문을 그대로 그리고 바꾸지 않는다', (path, hidden) => {
    pathname.mockReturnValue(path)
    const { container } = render(gate(hidden))
    expect(container.innerHTML).toBe('<p>본문</p>')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('AC-7706.4: 숨긴 탭이 없으면 어느 주소든 본문 그대로다', () => {
    for (const path of ['/stats', '/claim', '/staff', '/dashboard']) {
      pathname.mockReturnValue(path)
      const { container } = render(gate([]))
      expect(container.innerHTML, path).toBe('<p>본문</p>')
      cleanup()
    }
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('AC-7706.4: 옆 화면으로 옮겨 가면(TabGate가 다시 붙지 않아도) 주소에 따라 바로 바뀌고, 같은 주소로 다시 그려도 또 바꾸지 않는다', () => {
    pathname.mockReturnValue('/patients')
    const { container, rerender } = render(gate(['/stats']))
    expect(container.innerHTML).toBe('<p>본문</p>')
    pathname.mockReturnValue('/stats')
    rerender(gate(['/stats']))
    expect(container.innerHTML).toBe('')
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard')
    rerender(gate(['/stats']))
    expect(router.replace).toHaveBeenCalledTimes(1)
    pathname.mockReturnValue('/dashboard')
    rerender(gate(['/stats']))
    expect(container.innerHTML).toBe('<p>본문</p>')
    expect(router.replace).toHaveBeenCalledTimes(1)
  })

  it('AC-7706.4: TabGate 소스는 isHiddenPath로 판단하고 /dashboard로만 replace한다(push·글자 없음)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/shell/TabGate.tsx'), 'utf8')
    expect(src).toMatch(/^'use client'/)
    expect(src).toMatch(/\bisHiddenPath\(/)
    expect(src).toMatch(/router\.replace\('\/dashboard'\)/)
    expect(src).not.toMatch(/\.push\(/)
  })
})

// 앱 틀 안에서: 숨긴 탭이 있을 때만 TabGate가 본문을 감싼다. 숨긴 탭 주소면 본문만 비고 띠·탭 줄은 그대로다
describe('AC-7706.4 AppShell hiddenTabs — 본문 돌려보내기', () => {
  const shellAt = (path: string, props: { hiddenTabs?: readonly MenuPath[]; desk?: boolean } = {}) => {
    pathname.mockReturnValue(path)
    return render(
      <AppShell hospitalName="가나 정형외과의원" email="manager@example.com" isAdmin={false} {...props}>
        <h1>페이지</h1>
      </AppShell>,
    )
  }
  const main = () => screen.getByRole('main')

  it('AC-7706.4: 원장 — 숨긴 탭 주소(/stats/x)면 본문(main 안)이 비고 /dashboard로 한 번 바꾼다. 띠·탭 줄은 그린다', () => {
    shellAt('/stats/x', { hiddenTabs: ['/stats'] })
    expect(within(main()).queryByText('페이지')).toBeNull()
    expect((main().firstElementChild as HTMLElement).innerHTML).toBe('')
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard')
    expect(screen.getByRole('banner')).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '메뉴' })).toBeTruthy()
  })

  it('AC-7706.4: 원장 — 숨긴 탭이 아닌 주소는 본문을 그대로 그린다', () => {
    shellAt('/patients', { hiddenTabs: ['/stats'] })
    expect(within(main()).getByRole('heading', { level: 1 }).textContent).toBe('페이지')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('AC-7706.4: 데스크 — 숨긴 데스크 탭(/sunap)이면 /dashboard로, /dashboard에서는 DeskGate가 숨기지 않은 첫 데스크 탭(업무일지)으로 간다(끝없이 돌지 않는다)', () => {
    const { unmount } = shellAt('/sunap', { desk: true, hiddenTabs: ['/sunap'] })
    expect(within(main()).queryByText('페이지')).toBeNull()
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard')
    unmount()
    router.replace.mockReset()
    shellAt('/dashboard', { desk: true, hiddenTabs: ['/sunap'] })
    expect(within(main()).queryByText('페이지')).toBeNull()
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/worklog')
    cleanup()
    router.replace.mockReset()
    shellAt('/worklog', { desk: true, hiddenTabs: ['/sunap'] })
    expect(within(main()).getByRole('heading', { level: 1 }).textContent).toBe('페이지')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('AC-7706.4: 데스크 — 세 데스크 탭을 모두 숨기면 /dashboard는 지금 막힌 화면이고 바꾸지 않는다', () => {
    shellAt('/dashboard', { desk: true, hiddenTabs: ['/worklog', '/sunap', '/calendar'] })
    expect(within(main()).getByRole('heading', { level: 1 }).textContent).toBe('데스크 계정은 볼 수 없는 화면이에요')
    expect(router.replace).not.toHaveBeenCalled()
  })
})
