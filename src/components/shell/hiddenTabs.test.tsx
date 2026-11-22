// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { MORE_MENU, PRIMARY_MENU, type MenuPath } from './menu'
import { TabBar } from './TabBar'
import { TabGate } from './TabGate'

// 관리자만 보는 탭 — 메뉴에서 빼기 (multi-admin REQ-7706 AC-7706.3, design.md '앱 틀'·기본값 23, ADR-042).
// 숨긴 탭은 탭 띠(원장 주요 메뉴·데스크 세 탭)와 [더보기] 판에서 빠지고 판 머리 수는 보이는 항목 수다. 대시보드·설정·[가입 승인]은 그대로.
// 숨김이 없거나 빈 목록이면 지금 앱 틀과 같고 TabGate를 그리지 않는다(지금 시험들이 useRouter 흉내 없이 AppShell을 그린다)

const { pathname, router, unreadCount } = vi.hoisted(() => ({
  pathname: vi.fn(() => '/dashboard'),
  router: { replace: vi.fn() },
  unreadCount: vi.fn(async (): Promise<number | 'failed'> => 'failed'),
}))
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => router }))
// 탭 숫자(NoticeBadge)가 읽는 안 읽은 수 — 실제 Supabase에 붙지 않는다(실패 = 아무것도 그리지 않음)
vi.mock('@/lib/storage/notices', () => ({ NOTICES_CHANGED: 'notices:changed', unreadCount }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))
// 진짜 TabGate를 감싸 앱 틀이 그렸는지·무엇을 넘겼는지만 본다
vi.mock('./TabGate', async (importOriginal) => {
  const real = await importOriginal<typeof import('./TabGate')>()
  return { ...real, TabGate: vi.fn(real.TabGate) }
})
const tabGate = vi.mocked(TabGate)

beforeEach(() => {
  pathname.mockReturnValue('/dashboard')
  router.replace.mockReset()
  unreadCount.mockClear()
  tabGate.mockClear()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true })
})
afterEach(() => {
  cleanup()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

const nav = () => screen.getByRole('navigation', { name: '메뉴' })
const strip = () => (nav().firstElementChild as HTMLElement).firstElementChild as HTMLElement
const stripLinks = () => Array.from(strip().querySelectorAll<HTMLAnchorElement>('a'))
const stripLabels = () => stripLinks().map((a) => a.querySelector('span[data-label]')?.textContent)
const moreButton = () => within(nav()).getByRole('button', { name: /^더보기/ })
const panel = () => {
  const id = moreButton().getAttribute('aria-controls')
  return id ? (document.getElementById(id) as HTMLElement) : null
}
const panelLabels = () => within(panel() as HTMLElement).getAllByRole('link').map((a) => a.firstElementChild?.textContent)
const openMore = async () => {
  await userEvent.setup().click(moreButton())
  expect(panel()).not.toBeNull()
}
// 열린 판 머리의 "다른 메뉴 {n}개"
const panelHead = () => (panel() as HTMLElement).querySelector('p') as HTMLElement

const PRIMARY = PRIMARY_MENU.map((m) => m.label)
const MORE = MORE_MENU.map((m) => m.label)
const ALL_TAB_ACCESS: MenuPath[] = ['/stats', '/claim', '/notices', '/patients', '/worklog', '/sunap', '/calendar', '/ai-report', '/forms', '/staff', '/inventory', '/contacts']

describe('AC-7706.3 TabBar hidden — 원장 탭 띠', () => {
  it('AC-7706.3: 숨긴 주요 메뉴(통계·환자)는 탭 띠에 없고 나머지는 MENU 차례·href 그대로다', () => {
    render(<TabBar hidden={['/stats', '/patients']} />)
    expect(stripLabels()).toEqual(['대시보드', '청구', '고시·공지', '업무일지', '수납일지', '예약'])
    expect(stripLinks().map((a) => a.getAttribute('href'))).toEqual(['/dashboard', '/claim', '/notices', '/worklog', '/sunap', '/calendar'])
    expect(within(nav()).queryByText('통계')).toBeNull()
    expect(within(nav()).queryByText('환자')).toBeNull()
  })

  it('AC-7706.3: 고시·공지를 숨기면 그 탭도 탭 숫자(NoticeBadge)도 없다', async () => {
    unreadCount.mockResolvedValue(3)
    render(<TabBar hidden={['/notices']} />)
    await act(async () => {})
    expect(stripLabels()).not.toContain('고시·공지')
    expect(within(nav()).queryByText(/안 읽은 관련 글/)).toBeNull()
  })

  it('AC-7706.3: 12개 탭을 모두 숨겨도 대시보드는 탭 띠에, 설정은 [더보기] 판에 있다(판 머리 "다른 메뉴 1개")', async () => {
    render(<TabBar hidden={ALL_TAB_ACCESS} />)
    expect(stripLabels()).toEqual(['대시보드'])
    await openMore()
    expect(panelLabels()).toEqual(['설정'])
    expect(within(panelHead()).getByText('다른 메뉴 1개')).toBeTruthy()
  })
})

describe('AC-7706.3 MoreMenu hidden — [더보기] 판', () => {
  it('AC-7706.3: 숨긴 탭(직원·주소록)은 판 목록에 없고 판 머리 수는 보이는 항목 수(4)다. 나머지는 MORE_MENU 차례·href 그대로', async () => {
    render(<TabBar hidden={['/staff', '/contacts']} />)
    await openMore()
    expect(panelLabels()).toEqual(['AI 리포트', '서식', '재고', '설정'])
    expect(within(panel() as HTMLElement).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/ai-report', '/forms', '/inventory', '/settings'])
    expect(panelHead().textContent).toBe('다른 메뉴 4개')
    // 판 안 링크 모양은 숨김이 없을 때와 같다
    for (const a of within(panel() as HTMLElement).getAllByRole('link')) expect(a.getAttribute('class')).toContain('h-11')
  })

  it('AC-7706.3: 주요 메뉴만 숨기면 판 목록·머리 수는 지금 그대로(다른 메뉴 6개)', async () => {
    render(<TabBar hidden={['/stats']} />)
    await openMore()
    expect(panelLabels()).toEqual(MORE)
    expect(panelHead().textContent).toBe(`다른 메뉴 ${MORE.length}개`)
  })

  it('AC-7706.3: 지금 주소가 숨긴 판 항목(/staff)이면 [더보기] 단추는 "더보기"(지금 탭 표시 없음)이고 판에 그 항목이 없다', async () => {
    pathname.mockReturnValue('/staff')
    render(<TabBar hidden={['/staff']} />)
    expect(moreButton().textContent).toBe('더보기')
    await openMore()
    expect(panelLabels()).not.toContain('직원')
    expect((panel() as HTMLElement).querySelectorAll('[aria-current]')).toHaveLength(0)
  })

  it('AC-7706.3: 숨기지 않은 판 항목 주소(/inventory)면 지금처럼 "더보기 · 재고"이고 판 안 그 링크가 aria-current다', async () => {
    pathname.mockReturnValue('/inventory')
    render(<TabBar hidden={['/staff']} />)
    expect(moreButton().textContent).toBe('더보기 · 재고')
    await openMore()
    const current = within(panel() as HTMLElement)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current.map((a) => a.firstElementChild?.textContent)).toEqual(['재고'])
  })
})

describe('AC-7706.3 데스크 탭 띠 hidden', () => {
  it('AC-7706.3: 데스크 — 숨긴 데스크 탭(업무일지)은 탭 띠에 없고 나머지(수납일지·예약)는 차례 그대로, [더보기]는 없다', () => {
    pathname.mockReturnValue('/sunap')
    render(<TabBar desk hidden={['/worklog']} />)
    expect(stripLabels()).toEqual(['수납일지', '예약'])
    expect(within(nav()).queryByRole('button', { name: /^더보기/ })).toBeNull()
  })

  it('AC-7706.3: 데스크 — 데스크 밖 탭만 숨기면 세 탭 그대로', () => {
    pathname.mockReturnValue('/sunap')
    render(<TabBar desk hidden={['/stats', '/staff']} />)
    expect(stripLabels()).toEqual(['업무일지', '수납일지', '예약'])
  })
})

describe('AC-7706.3 숨김이 없으면 지금과 같다', () => {
  // 판 id(useId)는 그릴 때마다 다를 수 있다 → 견줄 때만 지운다
  const withoutIds = (html: string) => html.replace(/ (id|aria-controls)="[^"]*"/g, '')

  it('AC-7706.3: TabBar — hidden이 없을 때와 빈 목록일 때 탭 띠의 글자·차례·클래스가 같다(원장·데스크)', () => {
    expect(renderToStaticMarkup(<TabBar hidden={[]} />)).toBe(renderToStaticMarkup(<TabBar />))
    pathname.mockReturnValue('/sunap')
    expect(renderToStaticMarkup(<TabBar desk hidden={[]} />)).toBe(renderToStaticMarkup(<TabBar desk />))
    render(<TabBar hidden={[]} />)
    expect(stripLabels()).toEqual(PRIMARY)
  })

  it('AC-7706.3: [더보기] 판 — hidden이 없을 때와 빈 목록일 때 판(머리 수·목록·클래스)이 같다', async () => {
    pathname.mockReturnValue('/settings')
    const { unmount } = render(<TabBar />)
    await openMore()
    const before = withoutIds((panel() as HTMLElement).outerHTML)
    const buttonBefore = withoutIds(moreButton().outerHTML)
    unmount()
    render(<TabBar hidden={[]} />)
    await openMore()
    expect(withoutIds((panel() as HTMLElement).outerHTML)).toBe(before)
    expect(withoutIds(moreButton().outerHTML)).toBe(buttonBefore)
    expect(panelLabels()).toEqual(MORE)
    expect(panelHead().textContent).toContain(`다른 메뉴 ${MORE.length}개`)
  })
})

describe('AC-7706.3 AppShell hiddenTabs', () => {
  const shell = (props: { hiddenTabs?: readonly MenuPath[]; isAdmin?: boolean; desk?: boolean } = {}) => (
    <AppShell hospitalName="가나 정형외과의원" email="manager@example.com" isAdmin={props.isAdmin ?? false} desk={props.desk} hiddenTabs={props.hiddenTabs}>
      <h1>페이지</h1>
    </AppShell>
  )

  it('AC-7706.3: 숨긴 탭이 없거나(prop 없음) 빈 목록이면 TabGate를 그리지 않고 앱 틀이 지금과 같다(원장·데스크)', () => {
    for (const desk of [false, true]) {
      pathname.mockReturnValue(desk ? '/sunap' : '/dashboard')
      const plain = render(shell({ desk }))
      const before = withoutTime(plain.container.innerHTML)
      plain.unmount()
      const empty = render(shell({ desk, hiddenTabs: [] }))
      expect(withoutTime(empty.container.innerHTML), String(desk)).toBe(before)
      empty.unmount()
    }
    expect(tabGate).not.toHaveBeenCalled()
  })

  it('AC-7706.3: 숨긴 탭이 있으면 TabGate가 본문을 감싸고(숨긴 탭을 넘김) 탭 띠에서 그 탭이 빠진다', () => {
    render(shell({ hiddenTabs: ['/stats'] }))
    expect(tabGate).toHaveBeenCalled()
    expect(tabGate.mock.calls[0]![0]).toMatchObject({ hidden: ['/stats'] })
    expect(stripLabels()).not.toContain('통계')
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 }).textContent).toBe('페이지')
  })

  it('AC-7706.3: 데스크 — 숨긴 탭이 데스크 탭 띠에서 빠진다', () => {
    pathname.mockReturnValue('/worklog')
    render(shell({ desk: true, hiddenTabs: ['/sunap'] }))
    expect(stripLabels()).toEqual(['업무일지', '예약'])
  })

  it('AC-7706.3: 숨긴 탭이 있어도 계정 메뉴의 [가입 승인](관리자)은 그대로다', async () => {
    render(shell({ isAdmin: true, hiddenTabs: ALL_TAB_ACCESS }))
    const user = userEvent.setup()
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: /manager@example\.com/ }))
    const item = screen.getByRole('menuitem', { name: '가입 승인' })
    expect(item.getAttribute('href')).toBe('/admin')
    expect(stripLabels()).toEqual(['대시보드'])
  })
})

// 시계(KstClock)는 그릴 때의 한국 시각이라 두 번 그리는 사이에 바뀔 수 있다 → 견줄 때만 시각 글자를 지운다
function withoutTime(html: string) {
  return html.replace(/<time\b[^>]*>[\s\S]*?<\/time>/g, '<time></time>').replace(/ (id|aria-controls)="[^"]*"/g, '')
}
