// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ui } from '@/components/ui/classes'
import { AccountMenu } from './AccountMenu'
import { AppShell } from './AppShell'
import { KstClock } from './KstClock'
import { ADMIN_ITEM, MENU } from './menu'
import { TabBar } from './TabBar'

// 앱 틀 (REQ-008, design.md '앱 틀', UI_GUIDE '앱 화면' 앱 틀·탭·폰).
// jsdom은 CSS를 계산하지 않는다 → 동작·역할은 Testing Library로, 모양은 정해 둔 클래스가 있는지로 본다(보이는 모양은 TASK-18 스크린샷)

const { signOut, pathname } = vi.hoisted(() => ({ signOut: vi.fn(), pathname: vi.fn(() => '/dashboard') }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }))
vi.mock('next/navigation', () => ({ usePathname: pathname }))

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
// 요소가 그 클래스를 모두 가진다
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(classesOf(el), t).not.toContain(t)
}

const LABELS = ['대시보드', '통계', 'AI 리포트', '매출', '재고', '급여', '일일마감·보고', '월간 PDF', '설정']
const NOT_READY = LABELS.filter((l) => l !== '대시보드')
const EMAIL = 'manager@example.com'
const HOSPITAL = '가나 정형외과의원'

// jsdom에는 scrollIntoView가 없다 → 누구에게 불렀는지 본다
const scrollIntoView = vi.fn()

beforeEach(() => {
  pathname.mockReturnValue('/dashboard')
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  scrollIntoView.mockReset()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrollIntoView, configurable: true, writable: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

const nav = () => screen.getByRole('navigation', { name: '메뉴' })
// 탭 줄의 항목(링크·준비 중 단추)을 화면 순서대로
const tabItems = () => Array.from(nav().querySelectorAll<HTMLElement>('a, button'))
const tab = (name: string) => within(nav()).getByText(name, { selector: 'span[data-label]' }).parentElement as HTMLElement

describe('menu', () => {
  it('AC-008.1: 시안 A 순서 — 대시보드만 화면이 있고 나머지는 아직 없다(href null)', () => {
    expect(MENU.map((m) => m.label)).toEqual(LABELS)
    expect(MENU.filter((m) => m.href !== null)).toEqual([{ label: '대시보드', href: '/dashboard' }])
  })

  it('AC-008.2: 관리자 탭은 /admin', () => {
    expect(ADMIN_ITEM).toEqual({ label: '관리자', href: '/admin' })
  })
})

describe('TabBar', () => {
  it('AC-008.1: nav "메뉴" 안에 시안 A 순서대로, 대시보드만 링크이고 지금 화면이라 aria-current="page"', () => {
    render(<TabBar isAdmin={false} />)
    expect(nav().tagName).toBe('NAV')
    expect(tabItems().map((el) => el.textContent)).toEqual(LABELS)
    const links = within(nav()).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['대시보드', '/dashboard']])
    expect(links[0].getAttribute('aria-current')).toBe('page')
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('AC-008.1: 아직 없는 화면은 링크가 아니라 누를 수 없는 단추다', () => {
    render(<TabBar isAdmin={false} />)
    for (const label of NOT_READY) {
      const item = tab(label)
      expect(item.tagName, label).toBe('BUTTON')
      expect(item.getAttribute('type'), label).toBe('button')
      expect(item.getAttribute('aria-disabled'), label).toBe('true')
      expect(item.closest('a'), label).toBeNull()
      expect(item.hasAttribute('aria-current'), label).toBe(false)
    }
  })

  it('AC-008.2: 관리자면 설정 뒤 세로 구분선(읽지 않음) 다음에 [관리자] /admin 링크', () => {
    render(<TabBar isAdmin />)
    expect(tabItems().map((el) => el.textContent)).toEqual([...LABELS, '관리자'])
    const admin = within(nav()).getByRole('link', { name: '관리자' })
    expect(admin.getAttribute('href')).toBe('/admin')
    const sep = admin.previousElementSibling as HTMLElement
    expect(sep.getAttribute('aria-hidden')).toBe('true')
    expect(sep.textContent).toBe('')
    hasAll(sep, 'w-px h-4 bg-line')
    expect(sep.previousElementSibling?.contains(tab('설정'))).toBe(true)
  })

  it('AC-008.2: 관리자가 아니면 구분선과 [관리자]가 없다', () => {
    render(<TabBar isAdmin={false} />)
    expect(within(nav()).queryByText('관리자')).toBeNull()
    expect(nav().querySelectorAll('[aria-hidden="true"].w-px')).toHaveLength(0)
  })

  it('AC-008.1·AC-008.2: /admin에서는 [관리자]가 지금 탭이고 대시보드는 아니다', () => {
    pathname.mockReturnValue('/admin')
    render(<TabBar isAdmin />)
    expect(within(nav()).getByRole('link', { name: '관리자' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav()).getByRole('link', { name: '대시보드' }).hasAttribute('aria-current')).toBe(false)
  })

  it('AC-008.5: 준비 중 탭은 aria-describedby로 "준비 중" 툴팁을 읽힌다(탭마다 다른 id)', () => {
    render(<TabBar isAdmin={false} />)
    const ids = NOT_READY.map((label) => {
      const id = tab(label).getAttribute('aria-describedby')
      expect(id, label).toBeTruthy()
      const tip = document.getElementById(id as string) as HTMLElement
      expect(tip.getAttribute('role'), label).toBe('tooltip')
      expect(tip.textContent, label).toBe('준비 중')
      return id
    })
    expect(new Set(ids).size).toBe(NOT_READY.length)
    // 화면이 있는 탭에는 툴팁이 없다
    expect(within(nav()).getByRole('link', { name: '대시보드' }).hasAttribute('aria-describedby')).toBe(false)
  })

  it('AC-008.5: 툴팁은 평소 숨고, 1024px 이상에서 올림·초점에 보인다(ink 바탕·흰 caption 500·4px·shadow-float)', () => {
    render(<TabBar isAdmin={false} />)
    const button = tab('통계')
    const tip = document.getElementById(button.getAttribute('aria-describedby') as string) as HTMLElement
    hasAll(tip, 'hidden lg:group-hover:block lg:group-focus-within:block')
    hasAll(tip, 'absolute top-full bg-ink text-surface text-caption font-medium rounded-chip px-2 py-1 shadow-float whitespace-nowrap')
    // 올림·초점을 받는 group은 단추와 툴팁을 함께 감싼다
    const group = button.parentElement as HTMLElement
    expect(group.contains(tip)).toBe(true)
    hasAll(group, 'group relative')
  })

  it('AC-008.5: 준비 중 탭을 눌러도 주소가 바뀌지 않는다', async () => {
    const user = userEvent.setup()
    render(<TabBar isAdmin={false} />)
    const before = window.location.href
    for (const label of NOT_READY) await user.click(tab(label))
    expect(window.location.href).toBe(before)
  })

  it('AC-008.5: 준비 중 탭의 모양은 다른 탭과 같다(같은 크기·글자·색)', () => {
    pathname.mockReturnValue('/admin')
    render(<TabBar isAdmin />)
    const link = within(nav()).getByRole('link', { name: '대시보드' }) // 지금 탭이 아닌 링크
    expect(classesOf(tab('통계'))).toEqual(classesOf(link))
  })

  it('AC-008.1·AC-013.3: 탭 모양 — 50px·좌우 20px·tab 500 ink-2, 올림 ink, 키보드 초점은 탭 안쪽 2px accent 고리', () => {
    render(<TabBar isAdmin={false} />)
    const item = tab('통계')
    hasAll(item, 'h-12.5 px-5 text-tab font-medium text-ink-2 hover:text-ink whitespace-nowrap')
    hasAll(item, 'rounded-chip focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    hasNone(item, 'text-accent font-bold')
  })

  it('AC-008.1·AC-013.3: 지금 탭은 accent 700 + 아래 3px accent 밑줄(좌우 10px 안쪽, 위 모서리 2px), 밑줄 장식 없음', () => {
    render(<TabBar isAdmin={false} />)
    const current = within(nav()).getByRole('link', { name: '대시보드' })
    hasAll(current, 'text-accent font-bold')
    hasAll(current, 'relative after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.75 after:rounded-t-xs after:bg-accent')
    hasNone(current, 'text-ink-2 font-medium hover:text-ink')
    // 랜딩 a 규칙(teal 글자·브라우저 밑줄)이 앱 탭에 닿지 않게 글자색과 no-underline을 직접 준다
    hasAll(current, 'no-underline')
  })

  it('AC-008.1: 굵기가 바뀌어도 탭 폭이 흔들리지 않게 굵은 글자 폭을 미리 잡는다', () => {
    render(<TabBar isAdmin={false} />)
    for (const label of LABELS) {
      const span = within(nav()).getByText(label, { selector: 'span[data-label]' })
      expect(span.getAttribute('data-label')).toBe(label)
      hasAll(span, 'after:invisible after:h-0 after:overflow-hidden after:font-bold after:content-[attr(data-label)]')
    }
  })

  it('AC-008.7: 1024px 미만에서는 띠 안에서 옆으로 밀린다(얇은 스크롤바, 줄바꿈 없음), 그 이상은 넘침을 보인다(툴팁)', () => {
    render(<TabBar isAdmin />)
    hasAll(nav(), 'bg-surface border-b border-line max-lg:overflow-x-auto max-lg:[scrollbar-width:thin]')
    hasNone(nav(), 'overflow-x-auto overflow-hidden')
    const row = nav().firstElementChild as HTMLElement
    hasAll(row, 'flex w-max min-w-full items-stretch')
    hasNone(row, 'flex-wrap')
    for (const item of tabItems()) hasAll(item, 'whitespace-nowrap shrink-0')
  })

  it('AC-008.7·AC-013.4: 폰 탭은 46px(44px 이상)·좌우 14px·body', () => {
    render(<TabBar isAdmin />)
    for (const item of tabItems()) hasAll(item, 'max-md:h-11.5 max-md:px-3.5 max-md:text-body')
  })

  it('AC-008.7: 처음 그릴 때 지금 탭이 보이게 옮긴다(scrollIntoView, 지금 탭에만)', () => {
    pathname.mockReturnValue('/admin')
    render(<TabBar isAdmin />)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(within(nav()).getByRole('link', { name: '관리자' }))
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ block: 'nearest' })
  })

  it('AC-008.7: 메뉴 서랍·[메뉴 열기] 단추가 없다', () => {
    render(<TabBar isAdmin />)
    expect(screen.queryByRole('button', { name: /메뉴/ })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('AccountMenu', () => {
  const button = () => screen.getByRole('button', { name: new RegExp(EMAIL) })

  it('AC-008.3: 계정 단추에 로그인한 구글 이메일, 메뉴 단추(aria-haspopup="menu"), 처음엔 닫혀 있다', () => {
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} />)
    expect(button().textContent).toBe(EMAIL)
    expect(button().getAttribute('type')).toBe('button')
    expect(button().getAttribute('aria-haspopup')).toBe('menu')
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('AC-008.3: 누르면 메뉴(이메일·병원 이름)와 [로그아웃]이 열리고 [로그아웃]에 초점이 간다', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} />)
    await user.click(button())
    expect(button().getAttribute('aria-expanded')).toBe('true')
    const menu = screen.getByRole('menu', { name: '계정' })
    expect(button().getAttribute('aria-controls')).toBe(menu.id)
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['로그아웃'])
    expect(document.activeElement).toBe(items[0])
    // 머리(이메일·병원 이름)는 메뉴의 설명으로 읽힌다
    const head = document.getElementById(menu.getAttribute('aria-describedby') as string) as HTMLElement
    expect(within(head).getByText(EMAIL)).toBeTruthy()
    expect(within(head).getByText(HOSPITAL)).toBeTruthy()
    expect(within(head).queryByText('관리자 계정')).toBeNull()
  })

  it('AC-008.3: 관리자면 메뉴 머리에 "관리자 계정" 중립 칩', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin />)
    await user.click(button())
    const chip = screen.getByText('관리자 계정')
    hasAll(chip, ui.chip.neutral)
  })

  it('AC-008.3: Esc로 닫히고 초점이 계정 단추로 돌아온다', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} />)
    await user.click(button())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button())
  })

  it('AC-008.3: 바깥을 누르면 닫히고, 메뉴 안(머리)을 눌러서는 닫히지 않는다', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <p>바깥</p>
        <AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} />
      </div>,
    )
    await user.click(button())
    await user.click(screen.getByText(HOSPITAL))
    expect(screen.getByRole('menu')).toBeTruthy()
    await user.click(screen.getByText('바깥'))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(button().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-008.3: 계정 단추를 다시 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} />)
    await user.click(button())
    await user.click(button())
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('AC-008.3·AC-003.6: [로그아웃]은 signOut() 뒤 /login을 새로 연다', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/dashboard', assign })
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} />)
    await user.click(button())
    await user.click(screen.getByRole('menuitem', { name: '로그아웃' }))
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith('/login'))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('AC-008.3·AC-013.3: 계정 단추 38px·1px line·6px·body 500, 올림 canvas. 메뉴는 떠 있는 층(ui.layer, shadow-float)·폭 240px', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} />)
    hasAll(button(), 'h-9.5 border border-line rounded-card bg-surface text-body font-medium text-ink hover:bg-canvas')
    hasAll(button(), ui.focusRing)
    hasNone(button(), 'shadow-float')
    await user.click(button())
    const layer = screen.getByRole('menu').parentElement as HTMLElement
    hasAll(layer, ui.layer)
    hasAll(layer, 'absolute w-60 p-1')
    const head = document.getElementById(screen.getByRole('menu').getAttribute('aria-describedby') as string) as HTMLElement
    expect(layer.contains(head)).toBe(true)
    hasAll(within(head).getByText(EMAIL), 'text-table font-medium text-ink')
    hasAll(within(head).getByText(HOSPITAL), 'text-caption text-muted')
    hasAll(screen.getByRole('menu'), 'border-t border-line')
    hasAll(screen.getByRole('menuitem'), 'h-9 w-full text-body text-ink hover:bg-canvas')
  })

  it('AC-008.7·AC-013.4: 폰은 44×44 아이콘 단추(테두리 없음) — 이메일·화살표는 숨기고 aria-label에 이메일, 메뉴 항목 44px', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} />)
    expect(button().getAttribute('aria-label')).toContain(EMAIL)
    hasAll(button(), 'max-md:size-11 max-md:border-transparent max-md:justify-center')
    hasAll(within(button()).getByText(EMAIL), 'max-md:hidden truncate')
    const icons = button().querySelectorAll('svg')
    expect(icons).toHaveLength(2) // 사람 아이콘 + 아래 화살표
    for (const svg of icons) expect(svg.getAttribute('aria-hidden')).toBe('true')
    hasAll(icons[1], 'max-md:hidden')
    hasNone(icons[0], 'max-md:hidden')
    await user.click(button())
    hasAll(screen.getByRole('menuitem'), 'max-md:h-11')
  })
})

describe('KstClock', () => {
  it('AC-008.6: 한국 시각을 그리고 1분마다(분이 바뀔 때) 새 값으로 바꾼다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T00:42:30Z')) // 한국 09:42:30
    render(<KstClock />)
    const time = () => screen.getByText(/\(KST\)$/)
    expect(time().tagName).toBe('TIME')
    expect(time().textContent).toBe('2026년 10월 29일 (목) 09:42 (KST)')
    act(() => vi.advanceTimersByTime(29_000))
    expect(time().textContent).toBe('2026년 10월 29일 (목) 09:42 (KST)')
    act(() => vi.advanceTimersByTime(1_000))
    expect(time().textContent).toBe('2026년 10월 29일 (목) 09:43 (KST)')
    act(() => vi.advanceTimersByTime(60_000))
    expect(time().textContent).toBe('2026년 10월 29일 (목) 09:44 (KST)')
  })

  it('AC-008.6: <time dateTime>은 같은 순간(분 단위)을 기계가 읽는 값으로 둔다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T00:42:30Z'))
    render(<KstClock />)
    expect(screen.getByText(/\(KST\)$/).getAttribute('datetime')).toBe('2026-10-29T00:42:00.000Z')
  })

  it('AC-008.6: 앱 화면을 떠나면(unmount) 타이머가 풀린다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T00:42:30Z'))
    const { unmount } = render(<KstClock />)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-008.6·AC-008.7: table 글자 muted, 폰에서는 숨긴다', () => {
    render(<KstClock />)
    hasAll(screen.getByText(/\(KST\)$/), 'text-table text-muted whitespace-nowrap max-md:hidden')
  })
})

describe('AppShell', () => {
  const shell = (isAdmin = false) =>
    render(
      <AppShell hospitalName={HOSPITAL} email={EMAIL} isAdmin={isAdmin}>
        <h1>본문 제목</h1>
      </AppShell>,
    )

  it('AC-008.3: 위쪽 띠 왼쪽 로고·[서비스 이름]·구분선·병원 이름, 오른쪽 한국 시각·계정 단추(이메일)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T00:42:30Z'))
    shell()
    const banner = screen.getByRole('banner')
    expect(banner.textContent).toBe(`[서비스 이름]${HOSPITAL}2026년 10월 29일 (목) 09:42 (KST)${EMAIL}`)
    const logo = banner.querySelector('svg') as SVGElement
    expect(logo.getAttribute('aria-hidden')).toBe('true')
    expect(logo.getAttribute('width')).toBe('26')
    const sep = banner.querySelector('span[aria-hidden="true"]') as HTMLElement
    hasAll(sep, 'w-px h-5.5 bg-line')
    expect(within(banner).getByRole('button', { name: new RegExp(EMAIL) }).getAttribute('aria-haspopup')).toBe('menu')
    // 띠에는 메뉴 탭이 없다(탭은 띠 아래 nav)
    expect(within(banner).queryByRole('navigation')).toBeNull()
  })

  it('AC-008.1: 띠 → 탭 줄(nav "메뉴") → 본문(main) 순서, 본문에 페이지를 그린다', () => {
    shell()
    const banner = screen.getByRole('banner')
    const main = screen.getByRole('main')
    expect(banner.nextElementSibling).toBe(nav())
    expect(nav().nextElementSibling).toBe(main)
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('본문 제목')
    expect(within(nav()).queryByRole('link', { name: '관리자' })).toBeNull()
  })

  it('AC-008.2: 관리자면 탭 줄에 [관리자]', () => {
    shell(true)
    expect(within(nav()).getByRole('link', { name: '관리자' }).getAttribute('href')).toBe('/admin')
  })

  it('AC-008.1·AC-013.1: 앱 뿌리 .app-ui·canvas 바탕, 띠는 흰 바탕·64px·좌우 24px·아래 1px 선이고 위에 붙어 따라온다', () => {
    const { container } = shell()
    const root = container.firstElementChild as HTMLElement
    hasAll(root, 'app-ui bg-canvas text-ink min-h-dvh')
    const banner = screen.getByRole('banner')
    hasAll(banner, 'sticky top-0 bg-surface border-b border-line')
    hasAll(banner.firstElementChild as HTMLElement, 'h-16 px-6')
    // 탭 띠는 붙지 않고 본문과 함께 올라간다
    hasNone(nav(), 'sticky')
  })

  it('AC-008.3·AC-013.3: [서비스 이름] logo 600, 병원 이름 lead 500(넘치면 말줄임)', () => {
    shell()
    const banner = screen.getByRole('banner')
    hasAll(within(banner).getByText('[서비스 이름]'), 'text-logo font-semibold text-ink')
    hasAll(within(banner).getByText(HOSPITAL), 'text-lead font-medium text-ink truncate')
  })

  it('AC-008.1: 본문은 좌우 24px·위 24px·아래 28px', () => {
    shell()
    hasAll(screen.getByRole('main'), 'px-6 pt-6 pb-7')
  })

  it('AC-008.7: 폰 — 띠 48px·좌우 16px, 로고·병원 이름(body 600)·계정 단추만 보이고 [서비스 이름]·구분선·시각은 숨긴다. 본문 좌우·위 16px', () => {
    shell()
    const banner = screen.getByRole('banner')
    hasAll(banner.firstElementChild as HTMLElement, 'max-md:h-12 max-md:px-4')
    hasAll(within(banner).getByText('[서비스 이름]'), 'max-md:hidden')
    hasAll(banner.querySelector('span[aria-hidden="true"]') as HTMLElement, 'max-md:hidden')
    hasAll(within(banner).getByText(/\(KST\)$/), 'max-md:hidden')
    hasAll(within(banner).getByText(HOSPITAL), 'max-md:text-body max-md:font-semibold')
    hasNone(within(banner).getByText(HOSPITAL), 'max-md:hidden')
    hasNone(banner.querySelector('svg') as SVGElement, 'max-md:hidden')
    hasAll(screen.getByRole('main'), 'max-md:px-4 max-md:pt-4')
    expect(screen.queryByRole('button', { name: /메뉴 열기/ })).toBeNull()
  })
})
