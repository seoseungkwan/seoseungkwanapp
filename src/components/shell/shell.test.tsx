// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon, type IconName } from '@/components/common/Icon'
import { NOT_READY_FEATURES } from '@/components/common/notReadyFeatures'
import { ds } from '@/components/ui/classes'
import { AccountMenu } from './AccountMenu'
import { AppShell } from './AppShell'
import { KstClock } from './KstClock'
import * as menuModule from './menu'
import { ADMIN_LINK, MENU, currentMenuLabel } from './menu'
import { TabBar } from './TabBar'

// 앱 틀 (REQ-008, b2b-redesign REQ-218, design.md '앱 틀·대시보드·관리자', UI_GUIDE '앱 화면' 앱 틀·탭·폰).
// jsdom은 CSS를 계산하지 않는다 → 동작·역할은 Testing Library로, 모양은 정해 둔 클래스가 있는지로 본다(보이는 모양은 TASK-18 스크린샷)

const { signOut, pathname } = vi.hoisted(() => ({ signOut: vi.fn(), pathname: vi.fn(() => '/dashboard') }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }))
vi.mock('next/navigation', () => ({ usePathname: pathname }))

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
// 공통 아이콘 그림(svg 안쪽 글자)
const iconInner = (name: IconName) => renderToStaticMarkup(<Icon name={name} />).replace(/^<svg\b[^>]*>|<\/svg>$/g, '')
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
// 요소가 그 클래스를 모두 가진다
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(classesOf(el), t).not.toContain(t)
}

// 탭 13개와 탭 주소(tab-frame REQ-302, design.md '탭 목록'). 기능 자신의 화면이 있는 것은 대시보드·통계·청구다
const PATHS: readonly (readonly [string, string])[] = [
  ['대시보드', '/dashboard'],
  ['통계', '/stats'],
  ['청구', '/claim'],
  ['고시·공지', '/notices'],
  ['환자', '/patients'],
  ['매출', '/revenue'],
  ['AI 리포트', '/ai-report'],
  ['서식', '/forms'],
  ['직원', '/staff'],
  ['업무일지', '/worklog'],
  ['재고', '/inventory'],
  ['주소록', '/contacts'],
  ['설정', '/claim/setup'],
]
const LABELS = PATHS.map(([label]) => label)
const READY = ['대시보드', '통계', '청구']
const NOT_READY = LABELS.filter((l) => !READY.includes(l))
// 준비 중 화면 주소(설정 빼고 화면이 없는 탭)
const NOT_READY_PATHS = PATHS.filter(([label]) => !READY.includes(label) && label !== '설정')
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

const nav = () => screen.getByRole('navigation', { name: '메뉴' })
// 탭 띠: nav의 첫 자식(1024px 미만 옆으로 밀림). [전체 메뉴] 단추·판과 불러오기 줄은 띠 밖, nav 안에 있다(ui-90 AC-416.1)
const strip = () => nav().firstElementChild as HTMLElement
// 탭 띠의 항목을 화면 순서대로(모두 링크. 단추가 끼면 AC-303.1이 잡는다)
const tabItems = () => Array.from(strip().querySelectorAll<HTMLElement>('a, button'))
const tab = (name: string) => within(strip()).getByText(name, { selector: 'span[data-label]' }).parentElement as HTMLElement
// [전체 메뉴] 단추와 그 판(열렸을 때만 있다, aria-controls가 가리킨다)
const allButton = () => within(nav()).getByRole('button', { name: '전체 메뉴' })
const panel = () => {
  const id = allButton().getAttribute('aria-controls')
  return id ? document.getElementById(id) : null
}
// 화면이 있는 탭(MENU ready: true) — 대시보드·통계·청구·설정(비트 PC 연결 화면)
const READY_TABS = ['대시보드', '통계', '청구', '설정']
// 준비 중 탭(MENU ready: false)
const NOT_READY_TABS = LABELS.filter((l) => !READY_TABS.includes(l))
// 지금 탭 모양(ink 600 + 아래 2px accent 밑줄)과 기본 모양(ink-2 500)
const CURRENT_LOOK = 'text-ink font-semibold after:absolute after:bottom-0 after:h-0.5 after:bg-accent'
const IDLE_LOOK = 'text-ink-2 font-medium hover:text-ink'
// 불러오기 줄: nav의 마지막 자식(aria-hidden span)
const loadBar = () => nav().lastElementChild as HTMLElement
// 움직임에 드는 클래스(transition·duration·ease·delay·animate·옮김·돌림·크기·투명도, 변형 앞말 포함)
const motionOf = (el: Element) =>
  classesOf(el).filter((c) => /(?:^|:)(?:animate-|transition|duration-|delay-|ease-|-?translate-|-?rotate-|-?scale-|opacity-)/.test(c))

describe('menu', () => {
  it('AC-302.1: 탭은 13개 — 대시보드 · 통계 · 청구 · 고시·공지 · 환자 · 매출 · AI 리포트 · 서식 · 직원 · 업무일지 · 재고 · 주소록 · 설정. 급여·일일마감·보고·월간 PDF·관리자는 없다', () => {
    expect(MENU.map((m) => m.label)).toEqual([
      '대시보드', '통계', '청구', '고시·공지', '환자', '매출', 'AI 리포트', '서식', '직원', '업무일지', '재고', '주소록', '설정',
    ])
    expect(MENU).toHaveLength(PATHS.length)
    for (const gone of ['급여', '일일마감·보고', '월간 PDF', '관리자']) expect(MENU.map((m) => m.label as string), gone).not.toContain(gone)
  })

  it('AC-302.2: 탭 주소(path)는 표와 같고 13개가 모두 다르며 같은 origin 고정 경로다', () => {
    expect(MENU.map((m) => [m.label, m.path])).toEqual(PATHS)
    expect(new Set(MENU.map((m) => m.path)).size).toBe(MENU.length)
    for (const { label, path } of MENU) expect(path, label).toMatch(/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/)
  })

  it('AC-302.3·AC-515.1: 기능 자신의 화면(href)은 대시보드 /dashboard · 통계 /stats · 청구 /claim이고 나머지(설정 포함)는 null. href가 있으면 path와 같다', () => {
    expect(MENU.filter((m) => m.href !== null).map(({ label, href }) => ({ label, href }))).toEqual([
      { label: '대시보드', href: '/dashboard' },
      { label: '통계', href: '/stats' },
      { label: '청구', href: '/claim' },
    ])
    expect(MENU.filter((m) => m.href === null).map((m) => m.label)).toEqual(NOT_READY)
    // 설치·연결 확인 화면(SetupScreen)의 [청구·연락]이 고치지 않고도 '준비 중'이려면 설정 href가 null이어야 한다
    expect(MENU.find((m) => m.label === '설정')?.href).toBeNull()
    for (const { label, path, href } of MENU) if (href !== null) expect(href, label).toBe(path)
  })

  it('AC-006.4·AC-302.4: 지금 탭 — /claim과 /claim/*은 청구, 설치·연결 확인(/claim/setup)은 목업처럼 설정 자리', () => {
    expect(currentMenuLabel('/dashboard')).toBe('대시보드')
    expect(currentMenuLabel('/claim')).toBe('청구')
    expect(currentMenuLabel('/claim/close')).toBe('청구')
    expect(currentMenuLabel('/claim/setup')).toBe('설정')
    expect(currentMenuLabel('/claim/setup/x')).toBe('설정')
    expect(currentMenuLabel('/claimed')).toBeNull()
    expect(currentMenuLabel('/admin')).toBeNull()
    // 준비 중 주소와 그 아래 경로는 그 탭
    expect(NOT_READY_PATHS).toHaveLength(NOT_READY_FEATURES.length)
    for (const [label, path] of NOT_READY_PATHS) {
      expect(currentMenuLabel(path), path).toBe(label)
      expect(currentMenuLabel(`${path}/x`), `${path}/x`).toBe(label)
    }
    expect(currentMenuLabel('/stats')).toBe('통계')
    expect(currentMenuLabel('/stats/x')).toBe('통계')
    expect(currentMenuLabel('/ai-report')).toBe('AI 리포트')
    for (const path of ['/admin', '/', '/statsx', '/claimx', '/settings']) expect(currentMenuLabel(path), path).toBeNull()
  })

  it('AC-303.4·AC-304.1: 관리자 링크는 탭이 아니라 계정 메뉴의 [가입 승인] /admin(ADMIN_LINK). 옛 관리자 탭(ADMIN_ITEM)은 없다', () => {
    expect(ADMIN_LINK).toEqual({ label: '가입 승인', href: '/admin' })
    expect('ADMIN_ITEM' in menuModule).toBe(false)
  })

  it('AC-416.4·AC-515.1: 항목마다 ready가 있고 화면이 있는 탭(대시보드·통계·청구·설정)만 true다. ready: false인 주소들은 NOT_READY_FEATURES의 주소와 같다(순서도)', () => {
    for (const item of MENU) expect(typeof item.ready, item.label).toBe('boolean')
    expect(MENU.filter((m) => m.ready).map((m) => m.label)).toEqual(READY_TABS)
    expect(MENU.filter((m) => !m.ready).map((m) => m.label)).toEqual(NOT_READY_TABS)
    expect(MENU.filter((m) => !m.ready).map((m) => m.path)).toEqual(NOT_READY_FEATURES.map((f) => f.path))
    expect(NOT_READY_TABS).toHaveLength(NOT_READY_FEATURES.length)
  })
})

describe('TabBar', () => {
  it('AC-303.1·AC-416.1: nav "메뉴"의 탭 띠 안에 링크 13개가 MENU 순서·이름대로이고 링크마다 href가 그 탭의 path다. 대시보드가 지금 화면이라 aria-current="page"', () => {
    render(<TabBar />)
    expect(nav().tagName).toBe('NAV')
    expect(tabItems().map((el) => el.textContent)).toEqual(LABELS)
    const links = within(strip()).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual(PATHS)
    expect(links[0].getAttribute('aria-current')).toBe('page')
    expect(strip().querySelectorAll('[aria-current]')).toHaveLength(1)
    // 탭 띠 안에는 단추·툴팁·"준비 중" 글자가 없다([전체 메뉴] 단추는 띠 밖, AC-416.1)
    expect(strip().querySelectorAll('button, [aria-disabled], [role="tooltip"], [aria-describedby]')).toHaveLength(0)
    expect(strip().textContent).not.toContain('준비 중')
    // 판은 닫혀 있다 → nav 안 링크는 탭 띠의 13개뿐이다
    expect(within(nav()).getAllByRole('link')).toEqual(links)
  })

  it('AC-303.4: 탭 줄에 [관리자] 링크와 세로 구분선이 없다 — TabBar는 관리자 여부를 받지 않는다', () => {
    expect(TabBar.length).toBe(0)
    render(<TabBar />)
    expect(within(nav()).queryByText('관리자')).toBeNull()
    expect(within(nav()).queryByRole('link', { name: '관리자' })).toBeNull()
    expect(nav().querySelectorAll('[aria-hidden="true"].w-px')).toHaveLength(0)
    expect(tabItems().map((el) => el.textContent)).toEqual(LABELS)
  })

  it.each(['/claim', '/claim/close'])('AC-006.4·AC-034.1: %s에서는 [청구] /claim 링크가 지금 탭(aria-current="page")이고 하나뿐이다', (path) => {
    pathname.mockReturnValue(path)
    render(<TabBar />)
    const claim = within(nav()).getByRole('link', { name: '청구' })
    expect(claim.getAttribute('href')).toBe('/claim')
    expect(claim.getAttribute('aria-current')).toBe('page')
    hasAll(claim, 'text-ink font-semibold after:bg-accent')
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it.each([
    ['/claim/setup', '설정', '/claim/setup'],
    ['/stats', '통계', '/stats'],
    ['/stats/x', '통계', '/stats'],
    ['/contacts', '주소록', '/contacts'],
  ])('AC-303.2: %s에서는 [%s](%s 링크)만 지금 탭이고 지금 탭 모양이다. [청구]·[대시보드]는 아니다', (path, label, href) => {
    pathname.mockReturnValue(path)
    render(<TabBar />)
    const current = within(nav()).getByRole('link', { name: label })
    expect(current.getAttribute('href')).toBe(href)
    expect(current.getAttribute('aria-current')).toBe('page')
    hasAll(current, 'text-ink font-semibold after:absolute after:bottom-0 after:h-0.5 after:bg-accent')
    hasNone(current, 'text-faint text-ink-2 font-medium')
    expect(current.hasAttribute('aria-describedby')).toBe(false)
    for (const other of ['청구', '대시보드']) expect(within(nav()).getByRole('link', { name: other }).hasAttribute('aria-current'), other).toBe(false)
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('AC-303.2: /admin에서는 지금 탭이 없다(대시보드도 아니다)', () => {
    pathname.mockReturnValue('/admin')
    render(<TabBar />)
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(0)
    expect(within(nav()).getByRole('link', { name: '대시보드' }).hasAttribute('aria-current')).toBe(false)
    expect(within(nav()).queryByRole('link', { name: '관리자' })).toBeNull()
  })

  it('AC-303.3: 화면이 아직 없는 기능의 탭도 다른 탭과 같은 기본 모양(faint 아님)이고, 모든 탭은 올림 글자색만 짧게 바뀐다(transition, 그 밖의 움직임 없음)', () => {
    pathname.mockReturnValue('/dashboard')
    render(<TabBar />)
    const ready = within(nav()).getByRole('link', { name: '청구' }) // 화면이 있고 지금 탭이 아닌 링크
    for (const label of NOT_READY) {
      const item = tab(label)
      expect(item.tagName, label).toBe('A')
      expect(classesOf(item), label).toEqual(classesOf(ready))
      hasAll(item, 'text-ink-2 hover:text-ink transition')
      hasNone(item, 'text-faint')
    }
    for (const item of tabItems()) {
      hasAll(item, 'transition')
      const motion = classesOf(item).filter((c) => /(?:^|:)(?:animate-|transition-|duration-|delay-|ease-|-?translate-|-?rotate-|scale-)/.test(c))
      expect(motion, item.textContent ?? '').toEqual([])
    }
  })

  it('AC-218.2: 탭 모양 — 44px·좌우 12px·body 500 ink-2, 올림 ink, 키보드 초점은 탭 안쪽 2px accent 고리(4px 모서리)', () => {
    pathname.mockReturnValue('/dashboard')
    render(<TabBar />)
    const idle = within(nav()).getByRole('link', { name: '통계' })
    hasAll(idle, 'h-11 px-3 text-body font-medium text-ink-2 hover:text-ink whitespace-nowrap')
    for (const item of [idle, tab('통계')]) {
      hasAll(item, 'h-11 px-3 text-body font-medium')
      hasAll(item, 'rounded-control focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
      hasNone(item, 'h-12.5 px-5 text-tab rounded-chip text-accent font-bold font-semibold')
    }
  })

  it('AC-218.2: 지금 탭은 ink 600 + 아래 2px accent 밑줄(좌우 12px 안쪽, 모서리 없음), 밑줄 장식 없음', () => {
    render(<TabBar />)
    const current = within(nav()).getByRole('link', { name: '대시보드' })
    hasAll(current, 'h-11 px-3 text-body text-ink font-semibold')
    hasAll(current, 'relative after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent')
    hasNone(current, 'text-accent font-bold font-medium text-ink-2 hover:text-ink after:inset-x-2.5 after:h-0.75 after:rounded-t-xs')
    // 랜딩 a 규칙(teal 글자·브라우저 밑줄)이 앱 탭에 닿지 않게 글자색과 no-underline을 직접 준다
    hasAll(current, 'no-underline')
  })

  it('AC-008.1·AC-218.2: 굵기가 바뀌어도 탭 폭이 흔들리지 않게 지금 탭 굵기(600) 글자 폭을 미리 잡는다', () => {
    render(<TabBar />)
    for (const label of LABELS) {
      const span = within(nav()).getByText(label, { selector: 'span[data-label]' })
      expect(span.getAttribute('data-label')).toBe(label)
      hasAll(span, 'after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]')
      hasNone(span, 'after:font-bold')
    }
  })

  it('AC-008.7·AC-416.1: 1024px 미만에서는 탭 띠(nav 첫 자식)만 옆으로 밀린다(얇은 스크롤바, 줄바꿈 없음), 그 이상은 넘침을 보인다. nav 자신은 밀리지 않는다', () => {
    render(<TabBar />)
    hasAll(nav(), 'relative flex bg-surface border-b border-line')
    hasNone(nav(), 'overflow-x-auto overflow-hidden max-lg:overflow-x-auto max-lg:[scrollbar-width:thin]')
    hasAll(strip(), 'min-w-0 flex-1 max-lg:overflow-x-auto max-lg:[scrollbar-width:thin]')
    hasNone(strip(), 'overflow-x-auto overflow-hidden')
    const row = strip().firstElementChild as HTMLElement
    hasAll(row, 'flex w-max min-w-full items-stretch')
    hasNone(row, 'flex-wrap')
    for (const item of tabItems()) hasAll(item, 'whitespace-nowrap shrink-0')
  })

  it('AC-008.7·AC-218.2: 탭은 모든 폭에서 44px·좌우 12px·body다(폰만 다른 크기가 없다)', () => {
    render(<TabBar />)
    for (const item of tabItems()) {
      hasAll(item, 'h-11 px-3 text-body')
      expect(classesOf(item).filter((c) => /^max-md:(?:h|px|text)-/.test(c)), item.textContent ?? '').toEqual([])
    }
  })

  it('AC-218.2·AC-416.1: 탭 줄 — 탭 띠 안 줄 하나에 1280 폭·좌우 24px(폰 16px), 첫 탭은 왼쪽으로 12px 당겨 글자가 로고 왼쪽 끝과 맞는다. nav 자식은 탭 띠 · [전체 메뉴] · 불러오기 줄', () => {
    render(<TabBar />)
    expect(Array.from(nav().children)).toEqual([strip(), allButton(), loadBar()])
    expect(strip().children).toHaveLength(1)
    const row = strip().firstElementChild as HTMLElement
    hasAll(row, 'flex w-max min-w-full items-stretch px-6 max-md:px-4 lg:mx-auto lg:w-full lg:min-w-0 lg:max-w-7xl')
    hasAll(row, '[&>:first-child]:-ml-3')
    // 탭 사이 틈이 없다(탭 좌우 12px가 사이를 만든다)
    expect(classesOf(row).filter((c) => /(?:^|:)gap-/.test(c))).toEqual([])
    // 줄 안에 감싸개를 따로 두지 않는다 — 탭이 줄의 바로 아래 자식이다
    expect(row.firstElementChild).toBe(within(nav()).getByRole('link', { name: '대시보드' }))
    expect(tab('통계').parentElement).toBe(row)
  })

  // jsdom은 배치를 계산하지 않는다 → 탭 띠(390px)와 탭의 자리를 정해 준다(ui-90: 밀리는 것은 nav가 아니라 nav 첫 자식인 탭 띠).
  // 탭 자리(밀기 전, 띠 안 왼쪽 끝): at에 적은 탭은 그 값, 아니면 지금 탭은 900~980px, 나머지는 0
  const layout = ({ overflow, at = {} }: { overflow: boolean; at?: Record<string, number> }) => {
    const rect = (left: number, width: number) =>
      ({ left, right: left + width, top: 0, bottom: 50, width, height: 50, x: left, y: 0, toJSON: () => ({}) }) as DOMRect
    const isStrip = (el: Element) => el.parentElement?.tagName === 'NAV' && el.parentElement.firstElementChild === el
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
      return isStrip(this) ? (overflow ? 1000 : 390) : 0
    })
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return isStrip(this) ? 390 : 0
    })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (isStrip(this)) return rect(0, 390)
      const stripEl = this.closest('nav')?.firstElementChild
      if (this.tagName === 'A' && stripEl?.contains(this)) {
        const left = at[this.textContent ?? ''] ?? (this.getAttribute('aria-current') === 'page' ? 900 : 0)
        return rect(left - stripEl.scrollLeft, 80)
      }
      return rect(0, 0)
    })
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    return { scrollTo }
  }

  it('AC-008.7·AC-416.1: 처음 그릴 때 지금 탭이 보이게 탭 띠만 옆으로 민다(띠 오른쪽 끝에 맞춤). nav·페이지(창)는 움직이지 않는다', () => {
    const { scrollTo } = layout({ overflow: true })
    pathname.mockReturnValue('/contacts')
    render(<TabBar />)
    expect(strip().scrollLeft).toBe(590) // 980 - 390
    expect(nav().scrollLeft).toBe(0)
    expect(scrollIntoView).not.toHaveBeenCalled() // scrollIntoView는 창까지 밀 수 있다
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('AC-008.7: 탭이 한 줄에 다 들어가면(넘치지 않으면) 아무것도 밀지 않는다', () => {
    const { scrollTo } = layout({ overflow: false })
    pathname.mockReturnValue('/contacts')
    render(<TabBar />)
    expect(strip().scrollLeft).toBe(0)
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('AC-303.5·AC-416.1: 1024px 미만은 탭 띠가 옆으로 밀리고 처음 그릴 때 지금 탭(준비 중 주소 /worklog의 [업무일지])이 보이게 띠만 민다. 띠 밖 오른쪽 끝에 [전체 메뉴] 단추가 있고 서랍(dialog)·띠 끝 흐림은 없다', () => {
    const { scrollTo } = layout({ overflow: true })
    pathname.mockReturnValue('/worklog')
    render(<TabBar />)
    hasAll(strip(), 'max-lg:overflow-x-auto max-lg:[scrollbar-width:thin]')
    hasNone(strip().firstElementChild as HTMLElement, 'flex-wrap')
    expect(within(strip()).getByRole('link', { name: '업무일지' }).getAttribute('aria-current')).toBe('page')
    expect(strip().scrollLeft).toBe(590)
    expect(scrollTo).not.toHaveBeenCalled()
    // [전체 메뉴]는 탭 띠 밖, 띠 바로 다음(오른쪽 끝)
    expect(strip().contains(allButton())).toBe(false)
    expect(strip().nextElementSibling).toBe(allButton())
    expect(screen.queryByRole('dialog')).toBeNull()
    // 띠 끝 흐림(그라데이션·가림)을 넣지 않는다
    for (const el of [nav(), ...Array.from(nav().querySelectorAll('*'))]) {
      expect(classesOf(el).filter((c) => /(?:^|:)(?:bg-(?:linear|radial|conic|gradient)|from-|via-|to-|mask-)/.test(c))).toEqual([])
    }
  })

  it('AC-008.7·AC-416.1: 메뉴 서랍(dialog)·[메뉴 열기] 단추가 없고, nav 안 단추는 [전체 메뉴] 하나뿐이다', () => {
    render(<TabBar />)
    expect(screen.queryByRole('button', { name: /메뉴 열기/ })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(nav()).getAllByRole('button')).toEqual([allButton()])
  })

  it('AC-416.5: 키보드 초점이 띠 밖으로 밀린 탭에 가면 탭 띠만 밀어 그 탭이 보인다(오른쪽·왼쪽 모두). 보이는 탭은 그대로, 창은 움직이지 않는다', () => {
    const { scrollTo } = layout({ overflow: true, at: { 대시보드: 0, 통계: 80, 주소록: 900 } })
    render(<TabBar />)
    expect(strip().scrollLeft).toBe(0) // 지금 탭(대시보드)은 처음부터 보인다
    act(() => within(strip()).getByRole('link', { name: '통계' }).focus())
    expect(strip().scrollLeft).toBe(0)
    act(() => within(strip()).getByRole('link', { name: '주소록' }).focus())
    expect(strip().scrollLeft).toBe(590) // 980 - 390
    act(() => within(strip()).getByRole('link', { name: '대시보드' }).focus())
    expect(strip().scrollLeft).toBe(0)
    expect(nav().scrollLeft).toBe(0)
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
  })
})

// ── ui-90 REQ-416 [전체 메뉴] (UI_GUIDE '앱 틀' [전체 메뉴], 시안 docs/mockups/ui-90/app/gen.py tabs·all_panel, CSS .allbtn·.allp*)
describe('AllMenu', () => {
  it('AC-416.1: 탭 띠 오른쪽 끝·띠 밖에 [전체 메뉴] 단추 — 44px·왼쪽 1px line·body accent 600·꾸밈 chev(글자 뒤)·aria-expanded false, 1024px 이상은 숨김(lg:hidden)', () => {
    render(<TabBar />)
    const button = allButton()
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.textContent).toBe('전체 메뉴')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    // 닫혀 있으면 판이 없다(열릴 때만 그린다) → aria-controls도 열렸을 때만
    expect(button.hasAttribute('aria-controls')).toBe(false)
    expect(panel()).toBeNull()
    expect(button.parentElement).toBe(nav())
    expect(strip().contains(button)).toBe(false)
    hasAll(button, 'inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap border-l border-line px-3 text-body font-semibold text-accent lg:hidden')
    hasAll(button, 'cursor-pointer transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    hasNone(button, 'border border-r border-t border-b text-ink font-medium max-lg:hidden md:hidden')
    const svg = button.lastElementChild as SVGElement
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(button.querySelectorAll('svg')).toHaveLength(1)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.innerHTML).toBe(iconInner('chev'))
    hasAll(svg, 'shrink-0 transition')
    hasNone(svg, 'rotate-180')
  })

  it('AC-416.2·AC-515.3: 누르면 탭 줄 바로 아래 판 — surface·아래 1px line·shadow-float, 머리 "모든 탭 n개" · "준비 중 n개"(목록에서 센다, small muted), 2칸 목록(ul) 링크가 MENU 순서·44px', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    expect(allButton().getAttribute('aria-expanded')).toBe('true')
    const p = panel() as HTMLElement
    expect(p).not.toBeNull()
    expect(p.tagName).toBe('DIV')
    // 판은 nav 안, 탭 띠 밖, [전체 메뉴] 바로 다음. 탭 줄 바로 아래(top-full)에 화면 폭 전체로 뜬다
    expect(nav().contains(p)).toBe(true)
    expect(strip().contains(p)).toBe(false)
    expect(allButton().nextElementSibling).toBe(p)
    // mt-px: nav 아래 1px 선을 덮지 않는다(시안처럼 탭 띠와 판 머리 사이에 선이 보인다)
    hasAll(p, 'absolute inset-x-0 top-full mt-px border-b border-line bg-surface shadow-float px-4 pt-1 pb-4 md:px-6 lg:hidden')
    hasNone(p, 'border rounded-float rounded-control')
    // 머리: 두 글자 양 끝(small muted)
    const head = p.firstElementChild as HTMLElement
    expect(head.tagName).toBe('P')
    expect(Array.from(head.children).map((s) => s.textContent)).toEqual([`모든 탭 ${MENU.length}개`, `준비 중 ${NOT_READY_FEATURES.length}개`])
    hasAll(head, 'flex justify-between py-2 text-small text-muted')
    // 2칸 목록: 위 1px line, 칸 사이 16px
    const list = within(p).getByRole('list')
    expect(list.tagName).toBe('UL')
    expect(head.nextElementSibling).toBe(list)
    hasAll(list, 'grid list-none grid-cols-2 gap-x-4 border-t border-line')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(MENU.length)
    const links = within(list).getAllByRole('link')
    expect(links.map((a) => [a.firstElementChild?.textContent, a.getAttribute('href')])).toEqual(PATHS)
    for (const [i, a] of links.entries()) {
      expect(a.parentElement, `${PATHS[i]?.[0]} li`).toBe(items[i])
      hasAll(a, 'flex h-11 items-center justify-between gap-1.5 border-b border-line px-1 text-body no-underline hover:bg-canvas active:translate-y-px transition')
      hasAll(a, 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
      hasAll(a.firstElementChild as HTMLElement, 'flex-1')
    }
  })

  it.each([
    ['/dashboard', '대시보드'],
    ['/claim/setup', '설정'],
    ['/stats/x', '통계'],
  ])('AC-416.2: %s에서 판의 지금 탭 [%s]은 aria-current="page"(accent-strong 600 + 왼쪽 2px accent 막대), 나머지는 ink 500', async (path, label) => {
    pathname.mockReturnValue(path)
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    const links = within(panel() as HTMLElement).getAllByRole('link')
    const current = links.filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current.map((a) => a.firstElementChild?.textContent)).toEqual([label])
    hasAll(current[0] as HTMLElement, 'text-accent-strong font-semibold before:h-5 before:w-0.5 before:-ml-1 before:bg-accent')
    hasNone(current[0] as HTMLElement, 'text-ink font-medium')
    for (const a of links.filter((x) => !current.includes(x))) {
      hasAll(a, 'text-ink font-medium')
      hasNone(a, 'text-accent-strong font-semibold before:bg-accent before:w-0.5')
    }
  })

  it('AC-416.2: /admin에서는 판에도 지금 탭이 없다', async () => {
    pathname.mockReturnValue('/admin')
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    expect((panel() as HTMLElement).querySelectorAll('[aria-current]')).toHaveLength(0)
  })

  it('AC-515.1: 통계 탭은 href·path가 /stats이고 ready이며, [전체 메뉴] 판의 그 칸에 "준비 중" 칩이 없다', async () => {
    expect(MENU.find((m) => m.label === '통계')).toEqual({ label: '통계', path: '/stats', href: '/stats', ready: true })
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    const link = within(panel() as HTMLElement).getByRole('link', { name: '통계' })
    expect(link.getAttribute('href')).toBe('/stats')
    expect(link.children).toHaveLength(1)
    expect(link.textContent).toBe('통계')
  })

  it('AC-416.2·AC-515.1: 준비 중 탭은 neutral 칩 "준비 중"(글자 뒤), 화면이 있는 탭(대시보드·통계·청구·설정)에는 칩이 없다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    const links = within(panel() as HTMLElement).getAllByRole('link')
    for (const a of links) {
      const label = a.firstElementChild?.textContent ?? ''
      if (NOT_READY_TABS.includes(label)) {
        expect(a.children, label).toHaveLength(2)
        const chip = a.lastElementChild as HTMLElement
        expect(chip.tagName, label).toBe('SPAN')
        expect(chip.textContent, label).toBe('준비 중')
        hasAll(chip, ds.chip.neutral)
      } else {
        expect(READY_TABS, label).toContain(label)
        expect(a.children, label).toHaveLength(1)
        expect(a.textContent, label).toBe(label)
      }
    }
    expect(within(panel() as HTMLElement).getAllByText('준비 중')).toHaveLength(NOT_READY_FEATURES.length)
  })

  it('AC-416.2: 머리의 숫자는 MENU에서 센다(AllMenu.tsx에 13·10을 적지 않는다)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/shell/AllMenu.tsx'), 'utf8')
    expect(src).toMatch(/\bMENU\b/)
    expect(src).not.toMatch(/13개|10개|\b13\b|\b10\b/)
  })

  it('AC-416.2: 판은 나타날 때만 150ms 흐림 → 보임(starting:opacity-0)이고 닫으면 바로 없어진다. 꺾쇠는 열린 동안 180° 돈다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    const p = panel() as HTMLElement
    hasAll(p, 'transition starting:opacity-0')
    expect(motionOf(p)).toEqual(['transition', 'starting:opacity-0'])
    const svg = allButton().querySelector('svg') as SVGElement
    hasAll(svg, 'transition rotate-180')
    // 움직임은 짧은 반응(transition 기본 150ms)뿐이다
    for (const el of [allButton(), svg, p, ...Array.from(p.querySelectorAll('*'))]) {
      expect(classesOf(el).filter((c) => /(?:^|:)(?:animate-|transition-|duration-|delay-|ease-)/.test(c))).toEqual([])
    }
    await user.click(allButton())
    expect(panel()).toBeNull()
    expect(nav().querySelector('[class*="starting:opacity-0"]')).toBeNull()
    hasNone(allButton().querySelector('svg') as SVGElement, 'rotate-180')
  })

  it('AC-416.1·AC-416.2: 열면 aria-controls가 판의 id를 가리키고, 초점은 단추에 남는다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    const id = allButton().getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(document.getElementById(id as string)).toBe(panel())
    expect(document.activeElement).toBe(allButton())
  })

  it('AC-416.3: 단추를 다시 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    await user.click(allButton())
    expect(panel()).toBeNull()
    expect(allButton().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-416.3: Esc로 닫히고 초점이 [전체 메뉴]로 돌아온다(판 안 링크에 초점이 있어도)', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    act(() => within(panel() as HTMLElement).getAllByRole('link')[3]?.focus())
    await user.keyboard('{Escape}')
    expect(panel()).toBeNull()
    expect(allButton().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(allButton())
  })

  it('AC-416.3: 판 밖을 누르면 닫히고, 판 안(머리)을 눌러서는 닫히지 않는다', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <p>바깥</p>
        <TabBar />
      </div>,
    )
    await user.click(allButton())
    await user.click(within(panel() as HTMLElement).getByText(`모든 탭 ${MENU.length}개`))
    expect(panel()).not.toBeNull()
    await user.click(screen.getByText('바깥'))
    expect(panel()).toBeNull()
    expect(allButton().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-416.3: 판 안 링크를 누르면 닫힌다(링크 이동은 막지 않는다)', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    const clicks: { href: string | null; blocked: boolean }[] = []
    const onClick = (e: MouseEvent) => {
      clicks.push({ href: (e.target as Element).closest('a')?.getAttribute('href') ?? null, blocked: e.defaultPrevented })
      e.preventDefault()
    }
    document.addEventListener('click', onClick)
    try {
      await user.click(within(panel() as HTMLElement).getByRole('link', { name: /^재고/ }))
    } finally {
      document.removeEventListener('click', onClick)
    }
    expect(clicks).toEqual([{ href: '/inventory', blocked: false }])
    expect(panel()).toBeNull()
    expect(allButton().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-416.3: 경로가 바뀌면 닫힌다', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TabBar />)
    await user.click(allButton())
    expect(panel()).not.toBeNull()
    pathname.mockReturnValue('/stats')
    rerender(<TabBar />)
    expect(panel()).toBeNull()
    expect(allButton().getAttribute('aria-expanded')).toBe('false')
    // 같은 경로로 다시 그려도 닫힌 그대로다
    rerender(<TabBar />)
    expect(panel()).toBeNull()
  })
})

// ── ui-90 REQ-405 누른 탭 먼저 · 불러오기 줄 (UI_GUIDE '누른 탭 먼저 + 불러오기 줄', '움직임 › 불러오기 줄')
describe('TabBar 누른 탭 · 불러오기 줄', () => {
  // jsdom은 페이지를 옮기지 않는다 → 문서까지 올라온 누름의 기본 동작(이동)만 막는다. 탭 쪽 처리는 그 전에 끝난다
  const stopNavigation = (e: MouseEvent) => e.preventDefault()
  beforeEach(() => document.addEventListener('click', stopNavigation))
  afterEach(() => document.removeEventListener('click', stopNavigation))

  const stripLink = (label: string) => within(strip()).getByRole('link', { name: label })
  const pendings = () => Array.from(document.querySelectorAll('[data-pending]'))

  it('AC-405.2: 지금 경로와 다른 탭을 누르면 그 탭이 바로 지금 탭 모양(data-pending="true")이 되고 옛 지금 탭은 기본 모양이 된다. aria-current는 아직 옮기지 않는다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    expect(pendings()).toEqual([])
    await user.click(stripLink('통계'))
    const pressed = stripLink('통계')
    expect(pressed.getAttribute('data-pending')).toBe('true')
    hasAll(pressed, `${CURRENT_LOOK} after:inset-x-3`)
    hasNone(pressed, 'text-ink-2 font-medium')
    expect(pressed.hasAttribute('aria-current')).toBe(false)
    const old = stripLink('대시보드')
    expect(old.getAttribute('aria-current')).toBe('page')
    hasAll(old, IDLE_LOOK)
    hasNone(old, 'text-ink font-semibold after:bg-accent')
    expect(old.hasAttribute('data-pending')).toBe(false)
    expect(pendings()).toEqual([pressed])
  })

  it('AC-405.2: 경로가 바뀌면 aria-current가 누른 탭으로 옮겨지고 data-pending이 사라진다', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TabBar />)
    await user.click(stripLink('통계'))
    pathname.mockReturnValue('/stats')
    rerender(<TabBar />)
    expect(pendings()).toEqual([])
    expect(stripLink('통계').getAttribute('aria-current')).toBe('page')
    hasAll(stripLink('통계'), CURRENT_LOOK)
    expect(stripLink('대시보드').hasAttribute('aria-current')).toBe(false)
    hasAll(stripLink('대시보드'), IDLE_LOOK)
    expect(strip().querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('AC-405.2: 누른 뒤 다른 탭을 또 누르면 마지막에 누른 탭 하나만 누른 탭이다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(stripLink('통계'))
    await user.click(stripLink('재고'))
    expect(pendings()).toEqual([stripLink('재고')])
    hasAll(stripLink('통계'), IDLE_LOOK)
  })

  it('AC-405.2: 지금 탭을 다시 누르면 아무것도 바뀌지 않는다(누른 탭·불러오기 줄 없음)', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    const before = loadBar().getAttribute('class')
    await user.click(stripLink('대시보드'))
    expect(pendings()).toEqual([])
    hasAll(stripLink('대시보드'), CURRENT_LOOK)
    expect(loadBar().getAttribute('class')).toBe(before)
    hasAll(loadBar(), 'opacity-0')
  })

  it('AC-405.2: 누른 뒤 경로가 그대로일 때 지금 탭을 누르면 data-pending과 줄이 사라진다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(stripLink('통계'))
    expect(pendings()).toEqual([stripLink('통계')])
    // 같은 주소 이동이 앞의 이동을 버린다(경로가 바뀌지 않는다) → 누른 탭을 거둔다
    await user.click(stripLink('대시보드'))
    expect(pendings()).toEqual([])
    hasAll(stripLink('통계'), IDLE_LOOK)
    hasAll(stripLink('대시보드'), CURRENT_LOOK)
    expect(stripLink('대시보드').getAttribute('aria-current')).toBe('page')
    hasAll(loadBar(), 'opacity-0')
    hasNone(loadBar(), 'duration-700 ease-out scale-x-80')
  })

  it('AC-405.2: 판에서 지금 탭을 눌러도 앞서 누른 탭과 줄이 사라진다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(stripLink('통계'))
    await user.click(allButton())
    await user.click(within(panel() as HTMLElement).getByRole('link', { name: '대시보드' }))
    expect(panel()).toBeNull()
    expect(pendings()).toEqual([])
    hasAll(loadBar(), 'opacity-0')
  })

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Meta(⌘)', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['가운데 단추', { button: 1 }],
  ])('AC-405.2: %s 누름(새 탭·새 창으로 여는 누름)은 누른 탭으로 정하지 않는다', (_name, init) => {
    render(<TabBar />)
    fireEvent.click(stripLink('통계'), init)
    expect(pendings()).toEqual([])
    hasAll(stripLink('통계'), IDLE_LOOK)
    hasAll(stripLink('대시보드'), CURRENT_LOOK)
    hasAll(loadBar(), 'opacity-0')
  })

  it('AC-405.2: [전체 메뉴] 판의 링크를 눌러도 탭 띠의 그 탭이 누른 탭이 되고, 판은 닫힌다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    await user.click(within(panel() as HTMLElement).getByRole('link', { name: /^재고/ }))
    expect(panel()).toBeNull()
    expect(pendings()).toEqual([stripLink('재고')])
    hasAll(stripLink('재고'), CURRENT_LOOK)
    hasAll(loadBar(), 'scale-x-80 duration-700 ease-out')
  })

  it('AC-405.2: 판에서 지금 탭을 누르면 판만 닫히고 누른 탭은 생기지 않는다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(allButton())
    await user.click(within(panel() as HTMLElement).getByRole('link', { name: '대시보드' }))
    expect(panel()).toBeNull()
    expect(pendings()).toEqual([])
  })

  it('AC-405.3: 불러오기 줄은 nav 맨 끝의 aria-hidden span — 탭 줄 맨 아래 2px accent(왼쪽 기준), 평소에는 숨음(opacity-0)', () => {
    render(<TabBar />)
    const bar = loadBar()
    expect(bar.tagName).toBe('SPAN')
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect(bar.textContent).toBe('')
    expect(bar.children).toHaveLength(0)
    hasAll(bar, 'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent transition opacity-0')
    hasNone(bar, 'scale-x-80 duration-700 ease-out')
  })

  it('AC-405.3: 누른 뒤 경로가 그대로인 동안 줄이 보이고 왼쪽에서 80%까지 700ms 감속하며 차오른다(scale-x-80 duration-700 ease-out, 0에서 시작)', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(stripLink('통계'))
    const bar = loadBar()
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    hasAll(bar, 'absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent transition scale-x-80 duration-700 ease-out starting:scale-x-0')
    hasNone(bar, 'opacity-0')
    expect(classesOf(bar).filter((c) => /(?:^|:)delay-/.test(c))).toEqual([])
  })

  it('AC-405.3: 경로가 바뀌면 줄은 150ms(기본 transition)에 사라진다 — 700ms·감속·delay가 없다', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TabBar />)
    await user.click(stripLink('통계'))
    pathname.mockReturnValue('/stats')
    rerender(<TabBar />)
    const bar = loadBar()
    hasAll(bar, 'transition opacity-0')
    hasNone(bar, 'duration-700 ease-out starting:scale-x-0')
    expect(classesOf(bar).filter((c) => /(?:^|:)(?:delay-|duration-|ease-)/.test(c))).toEqual([])
  })

  it('AC-405.3: 다시 누르면 줄이 0에서 다시 차오른다(새 줄)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TabBar />)
    await user.click(stripLink('통계'))
    const first = loadBar()
    pathname.mockReturnValue('/stats')
    rerender(<TabBar />)
    await user.click(stripLink('재고'))
    expect(loadBar()).not.toBe(first)
    hasAll(loadBar(), 'scale-x-80 duration-700 ease-out starting:scale-x-0')
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
    hasAll(chip, ds.chip.neutral)
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

  it('AC-218.3: 계정 단추는 ds.button.secondarySmall(32px) 모양에 사람 아이콘 16 + 이메일 + 아래 화살표. 메뉴는 ds.layer(8px·그림자)·폭 240px', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} />)
    hasAll(button(), ds.button.secondarySmall)
    hasNone(button(), 'h-9.5 rounded-card border-line text-body shadow-float')
    // 단추 안: 공통 아이콘(Icon) 사람 16 · 이메일 · 아래 화살표(chev) 차례
    const [person, mail, chev] = Array.from(button().children)
    expect(button().children).toHaveLength(3)
    for (const [svg, name] of [[person, 'user'], [chev, 'chev']] as const) {
      expect(svg?.tagName.toLowerCase(), name).toBe('svg')
      expect([svg?.getAttribute('width'), svg?.getAttribute('height'), svg?.getAttribute('viewBox')], name).toEqual(['16', '16', '0 0 16 16'])
      expect(svg?.innerHTML, name).toBe(iconInner(name))
    }
    expect(mail?.textContent).toBe(EMAIL)
    await user.click(button())
    const layer = screen.getByRole('menu').parentElement as HTMLElement
    hasAll(layer, ds.layer)
    hasAll(layer, 'absolute w-60 p-1')
    hasNone(layer, 'rounded-card')
    const head = document.getElementById(screen.getByRole('menu').getAttribute('aria-describedby') as string) as HTMLElement
    expect(layer.contains(head)).toBe(true)
    hasAll(within(head).getByText(EMAIL), 'text-small font-medium text-ink')
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

  const openMenu = async (isAdmin: boolean) => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={isAdmin} />)
    await user.click(button())
    return user
  }
  const menuItems = () => within(screen.getByRole('menu', { name: '계정' })).getAllByRole('menuitem')

  it('AC-304.1: 관리자면 메뉴 항목이 위에서부터 [가입 승인](/admin 링크, menuitem, 왼쪽 꾸밈 아이콘 userCheck 16) · [로그아웃]이고, 메뉴 머리는 그대로다', async () => {
    await openMenu(true)
    const items = menuItems()
    expect(items.map((i) => i.textContent)).toEqual(['가입 승인', '로그아웃'])
    const [admin] = items
    expect(admin.tagName).toBe('A')
    expect(admin.getAttribute('href')).toBe('/admin')
    expect(admin.getAttribute('role')).toBe('menuitem')
    // 아이콘은 글자 앞(왼쪽), 공통 아이콘 userCheck 16 그대로, 꾸밈(읽지 않음)
    const svg = admin.firstElementChild as SVGElement
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(admin.querySelectorAll('svg')).toHaveLength(1)
    expect([svg.getAttribute('width'), svg.getAttribute('height'), svg.getAttribute('viewBox')]).toEqual(['16', '16', '0 0 16 16'])
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.innerHTML).toBe(iconInner('userCheck'))
    hasAll(svg, 'shrink-0 text-ink-2')
    // 메뉴 머리(이메일·병원 이름·"관리자 계정" 칩)
    const head = document.getElementById(screen.getByRole('menu').getAttribute('aria-describedby') as string) as HTMLElement
    expect(within(head).getByText(EMAIL)).toBeTruthy()
    expect(within(head).getByText(HOSPITAL)).toBeTruthy()
    hasAll(within(head).getByText('관리자 계정'), ds.chip.neutral)
  })

  it('AC-417.2: 계정 메뉴 [가입 승인]에는 숫자·칩이 없다(대기 건수를 메뉴에 보이지 않는다)', async () => {
    await openMenu(true)
    const [admin] = menuItems()
    expect(admin.textContent).toBe('가입 승인')
    expect(admin.textContent).not.toMatch(/\d/)
    // 아이콘 하나와 글자만: 칩·배지 요소가 없다
    expect(Array.from(admin.children).map((el) => el.tagName.toLowerCase())).toEqual(['svg'])
    expect(admin.querySelectorAll('span')).toHaveLength(0)
    for (const chip of Object.values(ds.chip)) expect(admin.innerHTML).not.toContain(chip)
  })

  it('AC-416.7: [로그아웃]의 꾸밈 아이콘은 Icon logout 16(글자 앞, ink-2, aria-hidden)이고 직접 그린 svg가 아니다', async () => {
    await openMenu(false)
    const [logout] = menuItems()
    expect(logout.textContent).toBe('로그아웃')
    const svg = logout.firstElementChild as SVGElement
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(logout.querySelectorAll('svg')).toHaveLength(1)
    expect([svg.getAttribute('width'), svg.getAttribute('height'), svg.getAttribute('viewBox')]).toEqual(['16', '16', '0 0 16 16'])
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.innerHTML).toBe(iconInner('logout'))
    hasAll(svg, 'shrink-0 text-ink-2')
    // 옛 직접 그린 그림(viewBox 0 0 24 24·선 1.6)이 AccountMenu.tsx에 없다
    const src = readFileSync(join(process.cwd(), 'src/components/shell/AccountMenu.tsx'), 'utf8')
    expect(src).not.toMatch(/<svg\b/)
    expect(src).toMatch(/<Icon name="logout"/)
  })

  it('AC-304.1: 관리자가 아니면 항목은 [로그아웃] 하나뿐이고 "가입 승인" 글자가 없다', async () => {
    await openMenu(false)
    expect(menuItems().map((i) => i.textContent)).toEqual(['로그아웃'])
    expect(screen.queryByText('가입 승인')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('AC-304.2: 열면 첫 항목에 초점, ↓·↑로 항목 사이를 옮기고 끝에서 처음(처음에서 끝)으로 돈다', async () => {
    const user = await openMenu(true)
    const [admin, logout] = menuItems()
    expect(document.activeElement).toBe(admin)
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(logout)
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(admin)
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(logout)
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(admin)
    // 옮기는 동안 메뉴는 열려 있다
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('AC-304.2: 항목이 하나(관리자 아님)면 ↓·↑에도 [로그아웃]에 머문다', async () => {
    const user = await openMenu(false)
    const [logout] = menuItems()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(logout)
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(logout)
  })

  it('AC-304.2: Esc는 닫고 계정 단추로 초점을 돌려주고, Tab은 닫는다(↓로 옮긴 뒤에도)', async () => {
    const user = await openMenu(true)
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button())
    await user.click(button())
    expect(document.activeElement).toBe(menuItems()[0])
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(button().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-304.3: [가입 승인]을 누르면 메뉴가 닫히고 /admin으로 간다(링크 이동을 막지 않는다)', async () => {
    const user = await openMenu(true)
    // jsdom은 페이지 이동을 하지 않는다 → 문서까지 올라온 누름이 /admin 링크이고 막히지 않았는지 본다
    const clicks: { href: string | null; blocked: boolean }[] = []
    const onClick = (e: MouseEvent) => {
      clicks.push({ href: (e.target as Element).closest('a')?.getAttribute('href') ?? null, blocked: e.defaultPrevented })
      e.preventDefault()
    }
    document.addEventListener('click', onClick)
    try {
      await user.click(screen.getByRole('menuitem', { name: '가입 승인' }))
    } finally {
      document.removeEventListener('click', onClick)
    }
    expect(clicks).toEqual([{ href: '/admin', blocked: false }])
    expect(screen.queryByRole('menu')).toBeNull()
    expect(button().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-304.3: [가입 승인]은 [로그아웃]과 같은 메뉴 항목 모양(36px·폰 44px·올림 canvas·누름 아래 1px·안쪽 초점 고리)', async () => {
    await openMenu(true)
    const [admin, logout] = menuItems()
    expect(classesOf(admin)).toEqual(classesOf(logout))
    for (const item of [admin, logout]) {
      hasAll(item, 'h-9 max-md:h-11 w-full text-body text-ink hover:bg-canvas active:translate-y-px transition')
      hasAll(item, 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    }
  })

  it('AC-304.4: 계정 단추는 올림과 열린 동안 바탕 canvas(색 150ms), 메뉴 층은 나타날 때만 투명·위 4px에서 제자리로 150ms, 닫으면 바로 없어진다', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin />)
    hasAll(button(), 'transition not-disabled:not-aria-disabled:hover:bg-canvas aria-expanded:bg-canvas')
    await user.click(button())
    expect(button().getAttribute('aria-expanded')).toBe('true')
    const layer = screen.getByRole('menu').parentElement as HTMLElement
    hasAll(layer, 'transition starting:opacity-0 starting:-translate-y-1')
    // 움직임은 짧은 반응(transition 기본 150ms)뿐이다
    for (const el of [button(), layer, ...Array.from(layer.querySelectorAll('*'))]) {
      expect(classesOf(el).filter((c) => /(?:^|:)(?:animate-|transition-|duration-|delay-|ease-)/.test(c))).toEqual([])
    }
    await user.click(button())
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.querySelector('[class*="starting:opacity-0"]')).toBeNull()
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

  it('AC-008.6: 화면에 붙자마자(hydration 직후) 브라우저 시각으로 바꾼다 — 서버가 그린 분이 다음 분까지 남지 않는다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T00:41:59Z')) // 서버가 그린 때: 한국 09:41
    const container = document.createElement('div')
    container.innerHTML = renderToString(<KstClock />)
    document.body.appendChild(container)
    expect(container.textContent).toBe('2026년 10월 29일 (목) 09:41 (KST)')
    vi.setSystemTime(new Date('2026-10-29T00:42:01Z')) // 브라우저가 붙인 때: 09:42
    let root: Root | undefined
    await act(async () => {
      root = hydrateRoot(container, <KstClock />)
    })
    const time = container.querySelector('time') as HTMLElement
    expect(time.textContent).toBe('2026년 10월 29일 (목) 09:42 (KST)')
    expect(time.getAttribute('datetime')).toBe('2026-10-29T00:42:00.000Z')
    act(() => root?.unmount())
    container.remove()
  })

  it('AC-008.6·AC-008.7·AC-218.1: small 글자 muted, 폰(768px 미만)에서만 숨긴다', () => {
    render(<KstClock />)
    hasAll(screen.getByText(/\(KST\)$/), 'text-small text-muted whitespace-nowrap max-md:hidden')
    hasNone(screen.getByText(/\(KST\)$/), 'text-table')
    hasNone(screen.getByText(/\(KST\)$/), 'max-lg:hidden')
  })
})

describe('AppShell', () => {
  const shell = (isAdmin = false) =>
    render(
      <AppShell hospitalName={HOSPITAL} email={EMAIL} isAdmin={isAdmin}>
        <h1>본문 제목</h1>
      </AppShell>,
    )

  // 안쪽 감싸개 셋(띠·탭 줄·본문)의 1280 폭·좌우 여백
  const wrapper = 'max-w-7xl px-6 max-md:px-4'
  const stickyGroup = () => screen.getByRole('banner').parentElement as HTMLElement

  it('AC-008.3·AC-218.1: 위쪽 띠 왼쪽 로고(24)·병원 이름, 오른쪽 한국 시각·계정 단추(이메일). [서비스 이름]과 세로 구분선이 없다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T00:42:30Z'))
    shell()
    const banner = screen.getByRole('banner')
    expect(banner.textContent).toBe(`${HOSPITAL}2026년 10월 29일 (목) 09:42 (KST)${EMAIL}`)
    const logo = banner.querySelector('svg') as SVGElement
    expect(logo.getAttribute('aria-hidden')).toBe('true')
    expect(logo.getAttribute('viewBox')).toBe('0 0 30 30')
    expect([logo.getAttribute('width'), logo.getAttribute('height')]).toEqual(['24', '24'])
    expect(within(banner).queryByText('[서비스 이름]')).toBeNull()
    expect(banner.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(0)
    expect(banner.querySelectorAll('.w-px')).toHaveLength(0)
    expect(within(banner).getByRole('button', { name: new RegExp(EMAIL) }).getAttribute('aria-haspopup')).toBe('menu')
    // 띠에는 메뉴 탭이 없다(탭은 띠 아래 nav)
    expect(within(banner).queryByRole('navigation')).toBeNull()
  })

  it('AC-008.1·AC-218.1: 띠와 탭 줄(nav "메뉴")이 붙는 묶음 하나의 두 자식이고, 그 묶음 다음이 본문(main)이다. 본문에 페이지를 그린다', () => {
    shell()
    const banner = screen.getByRole('banner')
    const main = screen.getByRole('main')
    const group = stickyGroup()
    expect(Array.from(group.children)).toEqual([banner, nav()])
    expect(group.nextElementSibling).toBe(main)
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('본문 제목')
    expect(within(nav()).queryByRole('link', { name: '관리자' })).toBeNull()
  })

  it('AC-303.4·AC-304.1: 관리자여도 탭 줄에 [관리자]·구분선이 없고, 계정 메뉴를 열면 첫 항목이 [가입 승인] /admin이다', async () => {
    const user = userEvent.setup()
    shell(true)
    expect(within(nav()).queryByRole('link', { name: '관리자' })).toBeNull()
    expect(within(nav()).queryByText('관리자')).toBeNull()
    expect(nav().querySelectorAll('[aria-hidden="true"].w-px')).toHaveLength(0)
    expect(within(nav()).getAllByRole('link').map((a) => a.textContent)).toEqual(LABELS)
    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: new RegExp(EMAIL) }))
    const items = within(screen.getByRole('menu', { name: '계정' })).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['가입 승인', '로그아웃'])
    expect(items[0].getAttribute('href')).toBe('/admin')
    // [가입 승인]은 띠(계정 메뉴) 안에 있고 탭 줄에는 없다
    expect(nav().contains(items[0])).toBe(false)
  })

  // 바탕 A(ui-90 REQ-404, tab-frame AC-303.6 대체): 모든 앱 화면이 흰 바탕 한 장. 페이지 표시(data-page-surface)와 상관없다
  it('AC-404.1: 뿌리와 main이 bg-surface이고 bg-canvas·has-[[data-page-surface]]: 클래스가 없다. 본문 감싸개(1280·좌우 24·위 24·아래 48, 폰 16·16·32)는 그대로', () => {
    const { container } = shell()
    const root = container.firstElementChild as HTMLElement
    const main = screen.getByRole('main')
    for (const el of [root, main]) {
      hasAll(el, 'bg-surface')
      expect(classesOf(el), 'bg-canvas').not.toContain('bg-canvas')
      expect(classesOf(el).filter((c) => c.includes('data-page-surface')), 'has-[[data-page-surface]]:').toEqual([])
    }
    hasAll(main, 'flex-1')
    // 앱 틀 어디에도 옛 표시 클래스·회색 판 바탕이 없다
    expect(container.innerHTML).not.toContain('data-page-surface')
    expect(container.querySelectorAll('.bg-canvas')).toHaveLength(0)
    expect(main.children).toHaveLength(1)
    hasAll(main.firstElementChild as HTMLElement, `mx-auto w-full ${wrapper} pt-6 pb-12 max-md:pt-4 max-md:pb-8`)
  })

  it('AC-404.1: 페이지가 옛 표시(data-page-surface)를 달아도 main 클래스는 표시 없는 페이지와 같다(TASK-11 전 대시보드)', () => {
    render(
      <AppShell hospitalName={HOSPITAL} email={EMAIL} isAdmin={false}>
        <div data-page-surface="">
          <h1>대시보드</h1>
        </div>
      </AppShell>,
    )
    const marked = classesOf(screen.getByRole('main'))
    cleanup()
    shell()
    expect(classesOf(screen.getByRole('main'))).toEqual(marked)
    expect(marked).toContain('bg-surface')
  })

  // 건너뛰기 링크(ui-90 REQ-403, 시안 docs/mockups/ui-90/app '.skip'): 왼쪽 위 띠 위(위 6px·왼쪽 8px·z 12 > 붙는 묶음 z 10)
  const skipLink = () => screen.getByRole('link', { name: '본문으로 건너뛰기' })

  it('AC-403.1: 문서 순서로 첫 조작 요소가 <a href="#main">본문으로 건너뛰기</a>이고 뿌리의 첫 자식이다. 첫 Tab이 그 링크로 간다', async () => {
    const user = userEvent.setup()
    const { container } = shell()
    const root = container.firstElementChild as HTMLElement
    const link = skipLink()
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('#main')
    expect(link.textContent).toBe('본문으로 건너뛰기')
    expect(root.firstElementChild).toBe(link)
    const focusable = container.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    expect(focusable[0]).toBe(link)
    await user.tab()
    expect(document.activeElement).toBe(link)
  })

  it('AC-403.1: main은 id="main"·tabIndex -1 — 링크가 가리키는 곳이 본문이다', () => {
    shell()
    const main = screen.getByRole('main')
    expect(main.id).toBe('main')
    expect(main.getAttribute('tabindex')).toBe('-1')
    expect(document.getElementById('main')).toBe(main)
    expect(document.querySelectorAll('#main')).toHaveLength(1)
    // 옮겨도 첫 줄이 붙는 묶음(띠 + 탭 줄 = 102px, 768px 미만 94px)에 가리지 않고, 본문 둘레에 초점 고리를 그리지 않는다
    hasAll(main, 'scroll-mt-25.5 max-md:scroll-mt-23.5 focus:outline-none')
  })

  it('AC-403.1: 평소에는 sr-only, 키보드 초점이면 보인다 — 왼쪽 위 띠 위, 44px, surface, 1px line, rounded-float, shadow-float, body 600, 2px accent 초점 고리', () => {
    shell()
    const link = skipLink()
    hasAll(link, 'sr-only focus-visible:not-sr-only')
    // 자리: 띠 위에 뜬다(위 6px·왼쪽 8px), 붙는 묶음(z 10)보다 위
    hasAll(link, 'focus-visible:absolute focus-visible:top-1.5 focus-visible:left-2 focus-visible:z-12')
    // 크기·짜임: 높이 44px·좌우 16px·가운데 줄. not-sr-only가 지우는 테두리 두께·안쪽 여백은 초점일 때 다시 준다
    hasAll(link, 'focus-visible:inline-flex focus-visible:items-center focus-visible:h-11 focus-visible:px-4 focus-visible:border')
    // 모양: 흰 바탕·1px line·떠 있는 층 모서리·그림자, 글자 body 600 ink, 밑줄 없음
    hasAll(link, 'bg-surface border-line rounded-float shadow-float text-body font-semibold text-ink no-underline')
    // 초점 고리: 2px accent, 밖으로 2px
    hasAll(link, 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent')
    // 평소에 보이게 하는 클래스는 없다(초점일 때만)
    hasNone(link, 'not-sr-only absolute inline-flex h-11')
  })

  it('AC-218.1·AC-404.1: 앱 뿌리 .app-ui·surface 바탕. 위에 붙는 묶음(sticky·top 0·z 10)이 띠와 탭 줄을 함께 붙인다 — 띠·탭 줄 자신은 붙지 않는다', () => {
    const { container } = shell()
    const root = container.firstElementChild as HTMLElement
    hasAll(root, 'app-ui bg-surface text-ink min-h-dvh')
    const group = stickyGroup()
    expect(group.parentElement).toBe(root)
    expect(group.tagName).toBe('DIV')
    hasAll(group, 'sticky top-0 z-10')
    hasNone(screen.getByRole('banner'), 'sticky top-0 z-10')
    hasNone(nav(), 'sticky')
  })

  it('AC-218.1: 띠는 surface·아래 1px line·56px(폰 48px), 안쪽 감싸개는 1280·가운데·좌우 24px(폰 16px), 오른쪽 시각·계정 단추 사이 16px', () => {
    shell()
    const banner = screen.getByRole('banner')
    hasAll(banner, 'bg-surface border-b border-line')
    expect(banner.children).toHaveLength(1)
    const inner = banner.firstElementChild as HTMLElement
    hasAll(inner, `mx-auto w-full ${wrapper} h-14 max-md:h-12 flex items-center justify-between`)
    hasNone(inner, 'h-16 gap-5')
    const end = within(banner).getByText(/\(KST\)$/).parentElement as HTMLElement
    expect(end.contains(within(banner).getByRole('button', { name: new RegExp(EMAIL) }))).toBe(true)
    hasAll(end, 'flex items-center gap-4 shrink-0')
    hasNone(end, 'gap-6')
  })

  it('AC-218.1·AC-416.1: 1280 감싸개 셋 — 띠 안쪽·탭 줄(탭 띠 안 줄)·본문 안쪽이 같은 최대 폭(max-w-7xl)·좌우 24px(폰 16px)이고 가운데에 놓인다', () => {
    shell()
    const headerInner = screen.getByRole('banner').firstElementChild as HTMLElement
    const tabRow = strip().firstElementChild as HTMLElement
    const mainInner = screen.getByRole('main').firstElementChild as HTMLElement
    for (const el of [headerInner, mainInner]) hasAll(el, `mx-auto w-full ${wrapper}`)
    // 탭 줄은 1024px 미만에서 옆으로 밀리므로(w-max) 가운데 놓기·1280 폭 맞춤은 1024px 이상에서만. 좌우 여백은 같다
    hasAll(tabRow, 'px-6 max-md:px-4 lg:mx-auto lg:w-full lg:min-w-0 lg:max-w-7xl')
  })

  it('AC-218.1: 병원 이름은 subtitle 600(넘치면 말줄임), 로고 옆 12px(폰 8px)', () => {
    shell()
    const banner = screen.getByRole('banner')
    const name = within(banner).getByText(HOSPITAL)
    hasAll(name, 'text-subtitle font-semibold text-ink truncate')
    hasNone(name, 'text-lead font-medium')
    const start = name.parentElement as HTMLElement
    expect(start.contains(banner.querySelector('svg'))).toBe(true)
    hasAll(start, 'flex items-center gap-3 max-md:gap-2 min-w-0')
  })

  it('AC-008.3·AC-416.6: 계정 단추 이메일 칸은 768px 이상에서 최대 240px(md:max-w-60, 그보다 길 때만 말줄임), 병원 이름은 80px 아래로 줄지 않고 말줄임', () => {
    shell()
    const banner = screen.getByRole('banner')
    hasAll(within(banner).getByText(EMAIL), 'truncate max-w-32 md:max-w-60 max-md:hidden')
    hasNone(within(banner).getByText(EMAIL), 'lg:max-w-60 lg:max-w-32 md:max-w-32')
    hasAll(within(banner).getByText(HOSPITAL), 'truncate min-w-20')
    // 단추의 화면 읽기 이름은 보이는 이메일로 시작한다(잘려 보여도 이름은 전체)
    expect(within(banner).getByRole('button', { name: new RegExp(EMAIL) }).getAttribute('aria-label')?.startsWith(EMAIL)).toBe(true)
  })

  it('AC-218.1: 본문(main) 안쪽 감싸개는 좌우 24px·위 24px·아래 48px(폰 좌우 16·위 16·아래 32)', () => {
    shell()
    const main = screen.getByRole('main')
    expect(main.children).toHaveLength(1)
    const inner = main.firstElementChild as HTMLElement
    hasAll(inner, 'px-6 pt-6 pb-12 max-md:px-4 max-md:pt-4 max-md:pb-8')
    expect(within(inner).getByRole('heading', { level: 1 }).textContent).toBe('본문 제목')
    hasNone(main, 'px-6 pt-6 pb-7')
  })

  it('AC-008.7·AC-218.1: 폰 — 띠 48px·좌우 16px, 로고·병원 이름(body 600)·계정 단추만 보이고 시각은 숨긴다', () => {
    shell()
    const banner = screen.getByRole('banner')
    hasAll(banner.firstElementChild as HTMLElement, 'max-md:h-12 max-md:px-4')
    hasAll(within(banner).getByText(/\(KST\)$/), 'max-md:hidden')
    hasAll(within(banner).getByText(HOSPITAL), 'max-md:text-body font-semibold')
    hasNone(within(banner).getByText(HOSPITAL), 'max-md:hidden')
    hasNone(banner.querySelector('svg') as SVGElement, 'max-md:hidden')
    expect(screen.queryByRole('button', { name: /메뉴 열기/ })).toBeNull()
  })
})
