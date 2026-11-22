// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { NextRouter } from 'next/dist/shared/lib/router/router'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import type { ReactNode } from 'react'
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
import { ADMIN_LINK, DESK_HOME, DESK_MENU, LOCATION_TAB, MENU, MORE_MENU, PRIMARY_MENU, currentMenuLabel, isDeskPath } from './menu'
import { useDesk } from './role'
import { TabBar } from './TabBar'

// 시험 내용과 상관없이, PC가 바쁠 때 기본 5초를 넘겨 실패하는 일만 막는다
vi.setConfig({ testTimeout: 60_000 })

// 앱 틀 (REQ-008, b2b-redesign REQ-218, design.md '앱 틀·대시보드·관리자', UI_GUIDE '앱 화면' 앱 틀·탭·폰).
// jsdom은 CSS를 계산하지 않는다 → 동작·역할은 Testing Library로, 모양은 정해 둔 클래스가 있는지로 본다(보이는 모양은 TASK-18 스크린샷)

// 데스크 문지기(DeskGate, desk-feedback AC-6306.3)가 쓰는 useRouter도 흉내 낸다(같은 router를 늘 돌려준다 — Next처럼)
const { signOut, pathname, router } = vi.hoisted(() => ({ signOut: vi.fn(), pathname: vi.fn(() => '/dashboard'), router: { replace: vi.fn() } }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }))
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => router }))
// 탭 숫자(NoticeBadge, notices AC-7423.3)가 읽는 안 읽은 수. 실제 Supabase에 붙지 않는다 — 기본은 실패(아무것도 그리지 않음)라 다른 시험의 탭 글자는 그대로다
const { unreadCount } = vi.hoisted(() => ({ unreadCount: vi.fn<() => Promise<number | 'failed'>>() }))
vi.mock('@/lib/storage/notices', () => ({ NOTICES_CHANGED: 'notices:changed', unreadCount }))

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
// 공통 아이콘 그림(svg 안쪽 글자)
const iconInner = (name: IconName) => renderToStaticMarkup(<Icon name={name} />).replace(/^<svg\b[^>]*>|<\/svg>$/g, '')
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
// 요소가 그 클래스를 모두 가진다
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const hasNone = (el: Element, classes: string) => {
  for (const t of tokens(classes)) expect(classesOf(el), t).not.toContain(t)
}

// 탭과 탭 주소(tab-frame REQ-302, design.md '탭 목록'). 기능 자신의 화면이 있는 것은 READY의 탭이다(통계는 stats AC-515.1, 환자는 patients AC-610.1, 업무일지는 worklog AC-012.2, 서식은 forms AC-3501.1, 직원은 staff AC-7611.1, 재고는 inventory AC-7512.1, 주소록은 contacts AC-6508.1).
// 매출 탭은 통계 매출 칸으로 옮겨 없어졌다(stats-revenue AC-4110.1, /revenue는 next.config가 /stats로 넘긴다)
const PATHS: readonly (readonly [string, string])[] = [
  ['대시보드', '/dashboard'],
  ['통계', '/stats'],
  ['청구', '/claim'],
  ['고시·공지', '/notices'],
  ['환자', '/patients'],
  ['업무일지', '/worklog'],
  ['수납일지', '/sunap'],
  ['예약', '/calendar'],
  ['AI 리포트', '/ai-report'],
  ['서식', '/forms'],
  ['직원', '/staff'],
  ['재고', '/inventory'],
  ['주소록', '/contacts'],
  ['설정', '/settings'],
]
const LABELS = PATHS.map(([label]) => label)
const READY = ['대시보드', '통계', '청구', '고시·공지', '환자', '업무일지', '수납일지', '예약', 'AI 리포트', '서식', '직원', '재고', '주소록'] // 고시·공지는 notices AC-7423.1, 직원은 staff AC-7611.1, 재고는 inventory AC-7512.1, 주소록은 contacts AC-6508.1
// 준비 중 화면 주소(설정 빼고 화면이 없는 탭)
const NOT_READY_PATHS = PATHS.filter(([label]) => !READY.includes(label) && label !== '설정')
const EMAIL = 'manager@example.com'
const HOSPITAL = '가나 정형외과의원'

// jsdom에는 scrollIntoView가 없다 → 누구에게 불렀는지 본다
const scrollIntoView = vi.fn()

beforeEach(() => {
  pathname.mockReturnValue('/dashboard')
  unreadCount.mockReset()
  unreadCount.mockResolvedValue('failed')
  router.replace.mockReset()
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

// 주요 메뉴 여덟(탭 띠)과 나머지 여섯([더보기] 판). 둘 다 MENU 차례 그대로다(dashboard-ux AC-2702.1, 매출이 빠짐 stats-revenue AC-4110.1, 수납일지 sunap-ilji AC-4907.1, 업무일지가 수납일지 바로 왼쪽 nav-worklog AC-5801.2, 예약이 수납일지 다음 clinic-calendar AC-5905.10,
// 고시·공지가 청구와 환자 사이 notices AC-7423.1 — 탭 옆 숫자가 보이게 [더보기]에서 꺼냈다)
const PRIMARY = ['대시보드', '통계', '청구', '고시·공지', '환자', '업무일지', '수납일지', '예약']
const PRIMARY_PATHS = PATHS.filter(([label]) => PRIMARY.includes(label))
const MORE_PATHS = PATHS.filter(([label]) => !PRIMARY.includes(label))

const nav = () => screen.getByRole('navigation', { name: '메뉴' })
// 탭 줄 감싸개: nav의 첫 자식. 탭 띠와 [더보기] 감싸개를 담고 1024px 이상은 본문과 같은 1280 폭 가운데다(dashboard-ux AC-2702.4)
const line = () => nav().firstElementChild as HTMLElement
// 탭 띠: 탭 줄 감싸개의 첫 자식(1024px 미만 옆으로 밀림). [더보기] 감싸개(단추·판)는 띠 밖 바로 다음, 불러오기 줄은 nav 끝이다(AC-2702.1)
const strip = () => line().firstElementChild as HTMLElement
// 탭 띠의 항목을 화면 순서대로(모두 링크. 단추가 끼면 AC-2702.1이 잡는다)
const tabItems = () => Array.from(strip().querySelectorAll<HTMLElement>('a, button'))
const tab = (name: string) => within(strip()).getByText(name, { selector: 'span[data-label]' }).parentElement as HTMLElement
// [더보기] 단추(글자는 "더보기" 또는 "더보기 · {이름}")·그 감싸개·판(열렸을 때만 있다, aria-controls가 가리킨다)
const moreButton = () => within(nav()).getByRole('button', { name: /^더보기/ })
const moreWrap = () => moreButton().parentElement as HTMLElement
const panel = () => {
  const id = moreButton().getAttribute('aria-controls')
  return id ? document.getElementById(id) : null
}
// 화면이 있는 탭(MENU ready: true) — 대시보드·통계·청구·고시·공지·환자·업무일지·수납일지·예약·AI 리포트·서식·직원·재고·주소록·설정(MENU 차례)
const READY_TABS = ['대시보드', '통계', '청구', '고시·공지', '환자', '업무일지', '수납일지', '예약', 'AI 리포트', '서식', '직원', '재고', '주소록', '설정']
// 준비 중 탭(MENU ready: false). 수는 NOT_READY_FEATURES에서 센다
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
  it('AC-302.1·AC-4110.1·AC-4907.1·AC-5801.1·AC-5905.10: 탭은 14개 — 대시보드 · 통계 · 청구 · 고시·공지 · 환자 · 업무일지 · 수납일지 · 예약 · AI 리포트 · 서식 · 직원 · 재고 · 주소록 · 설정. 매출·급여·일일마감·보고·월간 PDF·관리자는 없다', () => {
    expect(MENU.map((m) => m.label)).toEqual([
      '대시보드', '통계', '청구', '고시·공지', '환자', '업무일지', '수납일지', '예약', 'AI 리포트', '서식', '직원', '재고', '주소록', '설정',
    ])
    expect(MENU).toHaveLength(14)
    expect(MENU).toHaveLength(PATHS.length)
    for (const gone of ['매출', '급여', '일일마감·보고', '월간 PDF', '관리자']) expect(MENU.map((m) => m.label as string), gone).not.toContain(gone)
  })

  it('AC-4110.1: 탭 주소에 /revenue가 없고, 주소 타입(MenuLabel·MenuPath·MenuHref)에도 매출·/revenue가 없다', () => {
    expect(MENU.map((m) => m.path as string)).not.toContain('/revenue')
    expect(MENU.map((m) => m.href as string | null)).not.toContain('/revenue')
    const source = readFileSync(join(process.cwd(), 'src/components/shell/menu.ts'), 'utf8')
    expect(source).not.toContain("'/revenue'")
    expect(source).not.toContain("'매출'")
  })

  it('AC-302.2·AC-4110.1·AC-4907.1·AC-5905.10: 탭 주소(path)는 표와 같고 14개가 모두 다르며 같은 origin 고정 경로다', () => {
    expect(MENU.map((m) => [m.label, m.path])).toEqual(PATHS)
    expect(new Set(MENU.map((m) => m.path)).size).toBe(MENU.length)
    for (const { label, path } of MENU) expect(path, label).toMatch(/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/)
  })

  it('AC-302.3·AC-4110.1·AC-515.1·AC-714.1·AC-610.1·AC-012.2·AC-012.6·AC-3501.1·AC-7423.1·AC-7512.1·AC-6508.1·AC-7611.1: 기능 자신의 화면(href)은 대시보드 /dashboard · 통계 /stats · 청구 /claim · 고시·공지 /notices · 환자 /patients · AI 리포트 /ai-report · 서식 /forms · 직원 /staff · 재고 /inventory · 업무일지 /worklog · 주소록 /contacts · 설정 /settings이고 나머지는 null. href가 있으면 path와 같다', () => {
    expect(MENU.filter((m) => m.href !== null).map(({ label, href }) => ({ label, href }))).toEqual([
      { label: '대시보드', href: '/dashboard' },
      { label: '통계', href: '/stats' },
      { label: '청구', href: '/claim' },
      { label: '고시·공지', href: '/notices' },
      { label: '환자', href: '/patients' },
      { label: '업무일지', href: '/worklog' },
      { label: '수납일지', href: '/sunap' },
      { label: '예약', href: '/calendar' },
      { label: 'AI 리포트', href: '/ai-report' },
      { label: '서식', href: '/forms' },
      { label: '직원', href: '/staff' },
      { label: '재고', href: '/inventory' },
      { label: '주소록', href: '/contacts' },
      { label: '설정', href: '/settings' },
    ])
    expect(MENU.filter((m) => m.href === null).map((m) => m.label)).toEqual(NOT_READY_TABS)
    for (const { label, path, href } of MENU) if (href !== null) expect(href, label).toBe(path)
  })

  it('AC-012.6: 탭의 [설정]은 /settings로 가고, 비트 PC 연결(/claim/setup)은 설정 탭 자리에 속한다(owns)', () => {
    const settings = MENU.find((m) => m.label === '설정')
    expect(settings?.path).toBe('/settings')
    expect(settings?.owns).toEqual(['/claim/setup'])
  })

  it('AC-006.4·AC-302.4·AC-4110.1: 지금 탭 — /claim과 /claim/*은 청구, 설치·연결 확인(/claim/setup)은 목업처럼 설정 자리', () => {
    expect(currentMenuLabel('/dashboard')).toBe('대시보드')
    expect(currentMenuLabel('/claim')).toBe('청구')
    expect(currentMenuLabel('/claim/close')).toBe('청구')
    expect(currentMenuLabel('/claim/setup')).toBe('설정')
    expect(currentMenuLabel('/claim/setup/x')).toBe('설정')
    expect(currentMenuLabel('/settings')).toBe('설정')
    expect(currentMenuLabel('/settings/x')).toBe('설정')
    expect(currentMenuLabel('/claimed')).toBeNull()
    expect(currentMenuLabel('/admin')).toBeNull()
    expect(currentMenuLabel('/worklog')).toBe('업무일지')
    expect(currentMenuLabel('/sunap')).toBe('수납일지')
    expect(currentMenuLabel('/calendar')).toBe('예약')
    // 준비 중 주소와 그 아래 경로는 그 탭
    expect(NOT_READY_PATHS).toHaveLength(NOT_READY_FEATURES.length)
    expect(NOT_READY_PATHS.map(([, path]) => path)).toEqual(NOT_READY_FEATURES.map((f) => f.path))
    // 환자 탭도 그 탭이다(?tool=은 경로가 아니다)
    expect(currentMenuLabel('/patients')).toBe('환자')
    for (const [label, path] of NOT_READY_PATHS) {
      expect(currentMenuLabel(path), path).toBe(label)
      expect(currentMenuLabel(`${path}/x`), `${path}/x`).toBe(label)
    }
    // 매출 탭은 없다(/revenue는 next.config가 /stats로 넘긴다, AC-4110.2)
    expect(currentMenuLabel('/revenue')).toBeNull()
    expect(currentMenuLabel('/revenue/x')).toBeNull()
    expect(currentMenuLabel('/stats')).toBe('통계')
    expect(currentMenuLabel('/stats/x')).toBe('통계')
    expect(currentMenuLabel('/ai-report')).toBe('AI 리포트')
    for (const path of ['/admin', '/', '/statsx', '/claimx', '/settingsx']) expect(currentMenuLabel(path), path).toBeNull()
  })

  it('AC-303.4·AC-304.1: 관리자 링크는 탭이 아니라 계정 메뉴의 [가입 승인] /admin(ADMIN_LINK). 옛 관리자 탭(ADMIN_ITEM)은 없다', () => {
    expect(ADMIN_LINK).toEqual({ label: '가입 승인', href: '/admin' })
    expect('ADMIN_ITEM' in menuModule).toBe(false)
  })

  it('AC-416.4·AC-4110.1·AC-515.1·AC-714.1·AC-610.1·AC-012.2·AC-3501.1·AC-7423.1·AC-7512.1·AC-6508.1·AC-7611.1: 항목마다 ready가 있고 화면이 있는 탭(대시보드·통계·청구·고시·공지·환자·AI 리포트·서식·직원·재고·업무일지·주소록·설정)만 true다. ready: false인 주소들은 NOT_READY_FEATURES의 주소와 같다(순서도)', () => {
    for (const item of MENU) expect(typeof item.ready, item.label).toBe('boolean')
    expect(MENU.filter((m) => m.ready).map((m) => m.label)).toEqual(READY_TABS)
    expect(MENU.filter((m) => !m.ready).map((m) => m.label)).toEqual(NOT_READY_TABS)
    expect(MENU.filter((m) => !m.ready).map((m) => m.path)).toEqual(NOT_READY_FEATURES.map((f) => f.path))
    expect(NOT_READY_TABS).toHaveLength(NOT_READY_FEATURES.length)
    expect(NOT_READY_TABS).not.toContain('매출')
  })

  it('AC-2702.1·AC-4110.1·AC-4907.1·AC-5801.2·AC-5905.10·AC-7423.1: primary는 대시보드·통계·청구·고시·공지·환자·업무일지·수납일지·예약만 true다 — PRIMARY_MENU는 그 여덟, MORE_MENU는 나머지 여섯(업무일지·고시·공지 없음, 둘 다 MENU 차례·같은 항목). 이름·주소·ready는 MENU 그대로다', () => {
    for (const item of MENU) expect(typeof item.primary, item.label).toBe('boolean')
    expect(MENU.filter((m) => m.primary).map((m) => m.label)).toEqual(PRIMARY)
    expect(PRIMARY_MENU).toEqual(MENU.filter((m) => m.primary))
    expect(MORE_MENU).toEqual(MENU.filter((m) => !m.primary))
    expect(PRIMARY_MENU.map((m) => [m.label, m.path])).toEqual(PRIMARY_PATHS)
    expect(MORE_MENU.map((m) => [m.label, m.path])).toEqual(MORE_PATHS)
    expect(PRIMARY_MENU).toHaveLength(8)
    expect(MORE_MENU).toHaveLength(6)
    expect(MORE_MENU.map((m) => m.label)).toEqual(['AI 리포트', '서식', '직원', '재고', '주소록', '설정'])
    for (const item of [...PRIMARY_MENU, ...MORE_MENU]) expect(MENU, item.label).toContain(item)
  })

  // notices REQ-7423: 고시·공지 탭을 켠다 — 화면이 생겼고, 탭 옆 숫자가 보이게 주요 메뉴(청구와 환자 사이)로 꺼낸다
  it("AC-7423.1: '고시·공지'는 href·path '/notices'·ready·primary이고 MENU·PRIMARY_MENU 차례가 청구 바로 다음·환자 바로 앞이다. [더보기] 판에는 없다", () => {
    expect(MENU.find((m) => m.label === '고시·공지')).toEqual({ label: '고시·공지', path: '/notices', href: '/notices', ready: true, primary: true })
    for (const list of [MENU, PRIMARY_MENU]) {
      const labels = list.map((m) => m.label)
      const at = labels.indexOf('고시·공지')
      expect([labels[at - 1], labels[at + 1]]).toEqual(['청구', '환자'])
    }
    expect(MORE_MENU.map((m) => m.label)).not.toContain('고시·공지')
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/notices')
  })

  it('AC-7423.1: /notices와 그 아래(/notices/week 주간 모음)는 고시·공지 탭이다. 데스크 주소가 아니다', () => {
    for (const path of ['/notices', '/notices/week']) {
      expect(currentMenuLabel(path), path).toBe('고시·공지')
      expect(isDeskPath(path), path).toBe(false)
    }
    expect(currentMenuLabel('/noticesx')).toBeNull()
    expect(DESK_MENU.map((m) => m.label)).not.toContain('고시·공지')
  })

  // desk-feedback REQ-6306: 데스크 계정은 업무일지·수납일지·예약 세 탭만 쓴다. 첫 화면은 수납일지
  it('AC-6306.1: DESK_MENU는 업무일지·수납일지·예약(MENU 차례, MENU 항목 그대로)이고 데스크 첫 화면 DESK_HOME은 /sunap이다', () => {
    expect(DESK_MENU.map((m) => [m.label, m.path])).toEqual([
      ['업무일지', '/worklog'],
      ['수납일지', '/sunap'],
      ['예약', '/calendar'],
    ])
    for (const item of DESK_MENU) expect(MENU, item.label).toContain(item)
    expect(DESK_MENU).toEqual(MENU.filter((m) => DESK_MENU.includes(m)))
    expect(DESK_HOME).toBe('/sunap')
    expect(DESK_MENU.map((m) => m.path)).toContain(DESK_HOME)
  })

  it.each(['/worklog', '/worklog/x', '/sunap', '/sunap/2026-11-18', '/calendar', '/calendar/x/y'])('AC-6306.1: isDeskPath(%s)는 참이다(세 탭 주소와 그 아래)', (path) => {
    expect(isDeskPath(path)).toBe(true)
  })

  it.each([
    '/',
    '/dashboard',
    '/stats',
    '/stats/x',
    '/claim',
    '/patients',
    '/ai-report',
    '/forms',
    '/notices',
    '/staff',
    '/staff/schedule',
    '/staff/leave',
    '/staff/pay',
    '/contacts',
    '/settings',
    '/admin',
    '/login',
    '/signup',
    '/pending',
    '/worklogs',
    '/sunapx',
    '/calendarx',
  ])('AC-6306.1·AC-7611.3: isDeskPath(%s)는 거짓이다', (path) => {
    expect(isDeskPath(path)).toBe(false)
  })

  // desk-setup REQ-7001: 데스크도 비트 PC 연결 화면(/claim/setup)을 연다. 탭은 세 개 그대로(위 AC-6306.1)
  it.each(['/claim/setup', '/claim/setup/x'])('AC-7001.1: isDeskPath(%s)는 참이다(비트 PC 연결 화면과 그 아래)', (path) => {
    expect(isDeskPath(path)).toBe(true)
  })

  it.each(['/claim', '/claim/setupx', '/claim/x', '/settings', '/stats', '/dashboard'])('AC-7001.1: isDeskPath(%s)는 그대로 거짓이다', (path) => {
    expect(isDeskPath(path)).toBe(false)
  })
})

describe('TabBar', () => {
  it('AC-2702.1·AC-4110.1·AC-5801.2·AC-5905.10: nav "메뉴"의 탭 띠 안에는 주요 메뉴 여덟(대시보드·통계·청구·고시·공지·환자·업무일지·수납일지·예약, AC-7423.1) 링크만 이 차례로 있고 href는 MENU.path다. 대시보드가 지금 화면이라 aria-current="page"', () => {
    render(<TabBar />)
    expect(nav().tagName).toBe('NAV')
    expect(tabItems().map((el) => el.textContent)).toEqual(PRIMARY)
    const links = within(strip()).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual(PRIMARY_PATHS)
    expect(links[0].getAttribute('aria-current')).toBe('page')
    expect(strip().querySelectorAll('[aria-current]')).toHaveLength(1)
    // 탭 띠 안에는 단추·툴팁·"준비 중" 글자가 없다([더보기] 단추는 띠 밖, AC-2702.1)
    expect(strip().querySelectorAll('button, [aria-disabled], [role="tooltip"], [aria-describedby]')).toHaveLength(0)
    expect(strip().textContent).not.toContain('준비 중')
    // 판은 닫혀 있다 → nav 안 링크는 탭 띠의 넷뿐이다
    expect(within(nav()).getAllByRole('link')).toEqual(links)
  })

  // 관리자 값은 [더보기] 판의 입지 분석에만 쓴다(location AC-7901.1). 탭 띠에는 관리자 탭이 없다
  it('AC-303.4·AC-2702.1·AC-7901.1: 관리자여도 탭 줄에 [관리자] 링크와 세로 구분선이 없다 — TabBar는 값 없이도 그린다(관리자 값은 [더보기] 판의 입지 분석에만 쓴다)', () => {
    expect(TabBar.length).toBe(0)
    for (const ui of [<TabBar key="no" />, <TabBar key="admin" isAdmin />]) {
      render(ui)
      expect(within(nav()).queryByText('관리자')).toBeNull()
      expect(within(nav()).queryByRole('link', { name: '관리자' })).toBeNull()
      expect(nav().querySelectorAll('[aria-hidden="true"].w-px')).toHaveLength(0)
      expect(tabItems().map((el) => el.textContent)).toEqual(PRIMARY)
      cleanup()
    }
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
    ['/stats', '통계', '/stats'],
    ['/stats/x', '통계', '/stats'],
    ['/patients', '환자', '/patients'],
  ])('AC-303.2·AC-2702.3·AC-4110.1: %s에서는 탭 띠의 [%s](%s 링크)만 지금 탭이고 지금 탭 모양이다. [청구]·[대시보드]는 아니다', (path, label, href) => {
    pathname.mockReturnValue(path)
    render(<TabBar />)
    const current = within(strip()).getByRole('link', { name: label })
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

  it('AC-303.3·AC-2702.1·AC-4110.1: 탭 띠의 넷은 모두 화면이 있는 탭이고 지금 탭이 아니면 같은 기본 모양(faint 아님)이다. 모든 탭은 올림 글자색만 짧게 바뀐다(transition, 그 밖의 움직임 없음)', () => {
    pathname.mockReturnValue('/dashboard')
    render(<TabBar />)
    for (const label of PRIMARY) expect(READY_TABS, label).toContain(label)
    const ready = within(nav()).getByRole('link', { name: '청구' }) // 화면이 있고 지금 탭이 아닌 링크
    for (const label of PRIMARY.filter((l) => l !== '대시보드')) {
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

  it('AC-008.1·AC-218.2·AC-2702.1: 굵기가 바뀌어도 탭 폭이 흔들리지 않게 지금 탭 굵기(600) 글자 폭을 미리 잡는다', () => {
    render(<TabBar />)
    for (const label of PRIMARY) {
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

  it('AC-218.2·AC-2702.1·AC-2702.4: 탭 줄 — 탭 띠 안 줄 하나에 1280 폭·좌우 24px(폰 16px), 첫 탭은 왼쪽으로 12px 당겨 글자가 로고 왼쪽 끝과 맞는다. nav 자식은 탭 줄 감싸개(탭 띠 · [더보기] 감싸개) · 불러오기 줄', () => {
    render(<TabBar />)
    expect(Array.from(nav().children)).toEqual([line(), loadBar()])
    expect(Array.from(line().children)).toEqual([strip(), moreWrap()])
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
    const isStrip = (el: Element) => el === el.closest('nav')?.firstElementChild?.firstElementChild
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
      return isStrip(this) ? (overflow ? 1000 : 390) : 0
    })
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return isStrip(this) ? 390 : 0
    })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (isStrip(this)) return rect(0, 390)
      const stripEl = this.closest('nav')?.firstElementChild?.firstElementChild
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

  it('AC-008.7·AC-2702.1·AC-4110.1: 처음 그릴 때 지금 탭(띠 끝 [환자])이 보이게 탭 띠만 옆으로 민다(띠 오른쪽 끝에 맞춤). nav·페이지(창)는 움직이지 않는다', () => {
    const { scrollTo } = layout({ overflow: true })
    pathname.mockReturnValue('/patients')
    render(<TabBar />)
    expect(strip().scrollLeft).toBe(590) // 980 - 390
    expect(nav().scrollLeft).toBe(0)
    expect(scrollIntoView).not.toHaveBeenCalled() // scrollIntoView는 창까지 밀 수 있다
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('AC-008.7·AC-2702.1·AC-4110.1: 탭이 한 줄에 다 들어가면(넘치지 않으면) 아무것도 밀지 않는다', () => {
    const { scrollTo } = layout({ overflow: false })
    pathname.mockReturnValue('/patients')
    render(<TabBar />)
    expect(strip().scrollLeft).toBe(0)
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('AC-303.5·AC-2702.1·AC-4110.1: 탭 띠가 넘치면 처음 그릴 때 지금 탭(/patients의 [환자])이 보이게 띠만 민다. 띠 밖 오른쪽 끝에 [더보기] 단추가 있고 서랍(dialog)·띠 끝 흐림은 없다', () => {
    const { scrollTo } = layout({ overflow: true })
    pathname.mockReturnValue('/patients')
    render(<TabBar />)
    hasAll(strip(), 'max-lg:overflow-x-auto max-lg:[scrollbar-width:thin]')
    hasNone(strip().firstElementChild as HTMLElement, 'flex-wrap')
    expect(within(strip()).getByRole('link', { name: '환자' }).getAttribute('aria-current')).toBe('page')
    expect(strip().scrollLeft).toBe(590)
    expect(scrollTo).not.toHaveBeenCalled()
    // [더보기]는 탭 띠 밖, 띠 바로 다음(오른쪽 끝)
    expect(strip().contains(moreButton())).toBe(false)
    expect(strip().nextElementSibling).toBe(moreWrap())
    expect(screen.queryByRole('dialog')).toBeNull()
    // 띠 끝 흐림(그라데이션·가림)을 넣지 않는다
    for (const el of [nav(), ...Array.from(nav().querySelectorAll('*'))]) {
      expect(classesOf(el).filter((c) => /(?:^|:)(?:bg-(?:linear|radial|conic|gradient)|from-|via-|to-|mask-)/.test(c))).toEqual([])
    }
  })

  it('AC-008.7·AC-2702.1: 메뉴 서랍(dialog)·[메뉴 열기]·[전체 메뉴] 단추가 없고, nav 안 단추는 [더보기] 하나뿐이다', () => {
    render(<TabBar />)
    expect(screen.queryByRole('button', { name: /메뉴 열기/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /전체 메뉴/ })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(nav()).getAllByRole('button')).toEqual([moreButton()])
  })

  it('AC-416.5·AC-2702.1·AC-4110.1: 키보드 초점이 띠 밖으로 밀린 탭에 가면 탭 띠만 밀어 그 탭이 보인다(오른쪽·왼쪽 모두). 보이는 탭은 그대로, 창은 움직이지 않는다', () => {
    const { scrollTo } = layout({ overflow: true, at: { 대시보드: 0, 통계: 80, 환자: 900 } })
    render(<TabBar />)
    expect(strip().scrollLeft).toBe(0) // 지금 탭(대시보드)은 처음부터 보인다
    act(() => within(strip()).getByRole('link', { name: '통계' }).focus())
    expect(strip().scrollLeft).toBe(0)
    act(() => within(strip()).getByRole('link', { name: '환자' }).focus())
    expect(strip().scrollLeft).toBe(590) // 980 - 390
    act(() => within(strip()).getByRole('link', { name: '대시보드' }).focus())
    expect(strip().scrollLeft).toBe(0)
    expect(nav().scrollLeft).toBe(0)
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  // desk-feedback AC-6306.2: 데스크는 세 탭만, [더보기] 없음
  const DESK_PATHS = [
    ['업무일지', '/worklog'],
    ['수납일지', '/sunap'],
    ['예약', '/calendar'],
  ]

  it('AC-6306.2: desk면 탭 띠에 업무일지·수납일지·예약 세 링크(MENU.path)만 이 차례로 있고 [더보기] 단추·판이 없다. 지금 주소(/sunap)의 탭이 지금 탭이다', () => {
    pathname.mockReturnValue('/sunap')
    render(<TabBar desk />)
    expect(tabItems().map((el) => el.textContent)).toEqual(['업무일지', '수납일지', '예약'])
    const links = within(strip()).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual(DESK_PATHS)
    expect(within(nav()).getAllByRole('link')).toEqual(links)
    expect(within(nav()).queryAllByRole('button')).toEqual([])
    expect(within(nav()).queryByText(/더보기/)).toBeNull()
    // 탭 줄 감싸개 안에는 탭 띠 하나뿐이다([더보기] 감싸개 없음). 불러오기 줄은 그대로 nav 끝
    expect(Array.from(line().children)).toEqual([strip()])
    expect(Array.from(nav().children)).toEqual([line(), loadBar()])
    expect(within(strip()).getByRole('link', { name: '수납일지' }).getAttribute('aria-current')).toBe('page')
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(1)
    hasAll(within(strip()).getByRole('link', { name: '업무일지' }), IDLE_LOOK)
  })

  it('AC-6306.2: desk가 막힌 주소(/stats)에 있으면 탭 띠에 지금 탭이 없다(통계 탭이 없다)', () => {
    pathname.mockReturnValue('/stats')
    render(<TabBar desk />)
    expect(tabItems().map((el) => el.textContent)).toEqual(['업무일지', '수납일지', '예약'])
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(0)
    expect(within(nav()).queryByRole('link', { name: '통계' })).toBeNull()
  })

  it('AC-6306.2·AC-7423.1: desk={false}면 지금과 같다 — 주요 메뉴 여덟과 [더보기]', () => {
    render(<TabBar desk={false} />)
    expect(tabItems().map((el) => el.textContent)).toEqual(PRIMARY)
    expect(moreButton().textContent).toBe('더보기')
    expect(Array.from(line().children)).toEqual([strip(), moreWrap()])
  })

  // notices AC-7423.3: 원장 탭 띠의 '고시·공지' 옆 안 읽은 관련 글 수(NoticeBadge). 숫자 모양·다시 읽기는 NoticeBadge.test.tsx가 본다
  it('AC-7423.3: 원장 탭 띠는 열 때 안 읽은 수를 한 번 읽고, 3이면 [고시·공지] 링크 안 이름 뒤에 숫자 "3"(aria-hidden)과 화면 읽기 "안 읽은 관련 글 3건"이 있다. 다른 탭에는 숫자가 없다', async () => {
    unreadCount.mockResolvedValue(3)
    render(<TabBar />)
    const link = tab('고시·공지')
    await waitFor(() => expect(link.textContent).toBe('고시·공지3안 읽은 관련 글 3건'))
    expect(unreadCount).toHaveBeenCalledTimes(1)
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/notices')
    // 이름(span[data-label]) 뒤에 숫자 동그라미와 화면 읽기 글
    const [label, dot, sr] = Array.from(link.children) as HTMLElement[]
    expect(label!.getAttribute('data-label')).toBe('고시·공지')
    expect(dot!.getAttribute('aria-hidden')).toBe('true')
    expect(dot!.textContent).toBe('3')
    hasAll(dot!, 'rounded-control bg-accent text-surface')
    expect(sr!.textContent).toBe('안 읽은 관련 글 3건')
    hasAll(sr!, 'sr-only')
    expect(within(nav()).getByRole('link', { name: /^고시·공지/ })).toBe(link)
    // 숫자는 고시·공지 옆 하나뿐이다
    expect(nav().querySelectorAll('.bg-accent.text-surface')).toHaveLength(1)
    for (const other of PRIMARY.filter((l) => l !== '고시·공지')) expect(tab(other).textContent, other).toBe(other)
  })

  it('AC-7423.3: 안 읽은 수가 0이거나 읽기에 실패하면 [고시·공지]는 이름뿐이다', async () => {
    for (const value of [0, 'failed'] as const) {
      unreadCount.mockReset()
      unreadCount.mockResolvedValue(value)
      const view = render(<TabBar />)
      await waitFor(() => expect(unreadCount).toHaveBeenCalledTimes(1))
      await act(async () => {})
      expect(tab('고시·공지').textContent, String(value)).toBe('고시·공지')
      view.unmount()
    }
  })

  it('AC-7423.3: 데스크 탭 띠(desk)는 안 읽은 수를 읽지도 그리지도 않는다 — 고시·공지 탭도 없다', async () => {
    unreadCount.mockResolvedValue(3)
    pathname.mockReturnValue('/sunap')
    render(<TabBar desk />)
    await act(async () => {})
    expect(unreadCount).not.toHaveBeenCalled()
    expect(within(nav()).queryByText('고시·공지')).toBeNull()
    expect(within(nav()).queryByText(/안 읽은 관련 글/)).toBeNull()
    expect(tabItems().map((el) => el.textContent)).toEqual(['업무일지', '수납일지', '예약'])
  })

  it('AC-7423.3: TabBar 소스는 NoticeBadge를 desk가 아닐 때 /notices 탭에만 붙인다', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/shell/TabBar.tsx'), 'utf8')
    expect(src).toMatch(/import \{ NoticeBadge \} from '\.\/NoticeBadge'/)
    expect([...src.matchAll(/<NoticeBadge\b/g)]).toHaveLength(1)
  })
})

// ── dashboard-ux REQ-2702 [더보기] (design.md §3, 시안 docs/mockups/dashboard-ux .more·.morewrap·.morepanel). 옛 [전체 메뉴](ui-90 REQ-416)를 바꾼다
describe('MoreMenu', () => {
  it('AC-2702.1: [더보기] 단추는 탭 띠 밖·띠 바로 다음(오른쪽)의 감싸개 안에 있고 모든 폭에서 보인다 — 44px·좌우 12px·body, 꾸밈 chev(글자 뒤)·aria-expanded false', () => {
    render(<TabBar />)
    const button = moreButton()
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.textContent).toBe('더보기')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    // 닫혀 있으면 판이 없다(열릴 때만 그린다) → aria-controls도 열렸을 때만
    expect(button.hasAttribute('aria-controls')).toBe(false)
    expect(panel()).toBeNull()
    expect(strip().contains(button)).toBe(false)
    expect(strip().nextElementSibling).toBe(moreWrap())
    // 감싸개는 탭 줄 감싸개(nav 첫 자식) 안이다(AC-2702.4: 1024px 이상 본문 1280 폭 안)
    expect(moreWrap().parentElement).toBe(line())
    expect(line().parentElement).toBe(nav())
    // 어느 폭에서도 숨기지 않는다(옛 [전체 메뉴]의 lg:hidden 같은 숨김 없음)
    for (const el of [moreWrap(), button]) expect(classesOf(el).filter((c) => /(?:^|:)(?:hidden|sr-only)$/.test(c))).toEqual([])
    hasAll(button, 'min-h-11 shrink-0 items-center whitespace-nowrap px-3 text-body')
    hasAll(button, 'cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    const svg = button.lastElementChild as SVGElement
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(button.querySelectorAll('svg')).toHaveLength(1)
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.innerHTML).toBe(iconInner('chev'))
  })

  it('AC-2702.2·AC-5801.2·AC-7423.1·AC-7611.5: 열면 판 머리 "다른 메뉴 6개"·"준비 중 N개"(N = 판 안 ready=false 수, 0이면 "준비 중" 칸 없음), 목록(ul) 링크가 MORE_MENU 차례·MENU.path·44px이고 준비 중 항목만 링크 글자 안에 "준비 중" 칩이 있다(화면 읽기가 이름과 함께 읽는다)', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(moreButton())
    expect(moreButton().getAttribute('aria-expanded')).toBe('true')
    const p = panel() as HTMLElement
    expect(p).not.toBeNull()
    expect(moreWrap().contains(p)).toBe(true)
    expect(strip().contains(p)).toBe(false)
    const head = p.firstElementChild as HTMLElement
    expect(Array.from(head.children).map((s) => s.textContent)).toEqual(
      NOT_READY_FEATURES.length === 0
        ? [`다른 메뉴 ${MORE_PATHS.length}개`]
        : [`다른 메뉴 ${MORE_PATHS.length}개`, `준비 중 ${NOT_READY_FEATURES.length}개`],
    )
    expect(head.textContent).toContain('다른 메뉴 6개')
    if (NOT_READY_FEATURES.length === 0) {
      expect(p.textContent).not.toContain('준비 중 0개')
      expect(head.textContent).not.toContain('준비 중')
    }
    const list = within(p).getByRole('list')
    expect(list.tagName).toBe('UL')
    expect(head.nextElementSibling).toBe(list)
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(MORE_PATHS.length)
    const links = within(list).getAllByRole('link')
    expect(links.map((a) => [a.firstElementChild?.textContent, a.getAttribute('href')])).toEqual(MORE_PATHS)
    for (const [i, a] of links.entries()) {
      const label = a.firstElementChild?.textContent ?? ''
      expect(a.parentElement, `${label} li`).toBe(items[i])
      hasAll(a, 'flex h-11 items-center no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
      if (NOT_READY_TABS.includes(label)) {
        expect(a.children, label).toHaveLength(2)
        const chip = a.lastElementChild as HTMLElement
        expect(chip.tagName, label).toBe('SPAN')
        expect(chip.textContent, label).toBe('준비 중')
        hasAll(chip, ds.chip.neutral)
        // 칩은 링크 글자 안이다 → 링크 이름이 "{이름} 준비 중"
        expect(within(list).getByRole('link', { name: `${label} 준비 중` }), label).toBe(a)
      } else {
        expect(READY_TABS, label).toContain(label)
        expect(a.children, label).toHaveLength(1)
        expect(a.textContent, label).toBe(label)
      }
    }
    // 준비 중 탭이 하나도 없으면(고시·공지·재고·주소록·직원 모두 화면이 생김) 칩도 없다 — getAll은 0개면 던지므로 queryAll로 센다
    expect(within(p).queryAllByText('준비 중')).toHaveLength(NOT_READY_FEATURES.length)
  })

  it('AC-2702.2: 판 머리의 숫자는 MORE_MENU에서 센다(MoreMenu.tsx에 수를 적지 않는다). 옛 [전체 메뉴](AllMenu.tsx)는 없다', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/shell/MoreMenu.tsx'), 'utf8')
    expect(src).toMatch(/\bMORE_MENU\b/)
    expect(src).not.toMatch(/\d+개|\b[A-Z_]+\s*=\s*\d+\b/)
    expect(existsSync(join(process.cwd(), 'src/components/shell/AllMenu.tsx'))).toBe(false)
  })

  it.each([
    ['/settings', '설정'],
    ['/claim/setup', '설정'],
    ['/contacts', '주소록'],
    ['/ai-report', 'AI 리포트'],
  ])('AC-2702.3: %s에서는 [더보기] 단추가 지금 탭 모양(600·아래 2px accent)이고 글자가 "더보기 · %s"이며, 판 안 그 링크에만 aria-current="page"가 있다. 탭 띠에는 지금 탭이 없다', async (path, label) => {
    pathname.mockReturnValue(path)
    const user = userEvent.setup()
    render(<TabBar />)
    const button = moreButton()
    expect(button.textContent).toBe(`더보기 · ${label}`)
    hasAll(button, `${CURRENT_LOOK} relative after:inset-x-3`)
    hasNone(button, 'text-ink-2 font-medium')
    expect(strip().querySelectorAll('[aria-current]')).toHaveLength(0)
    for (const item of tabItems()) hasAll(item, IDLE_LOOK)
    await user.click(button)
    const links = within(panel() as HTMLElement).getAllByRole('link')
    const current = links.filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current.map((a) => a.firstElementChild?.textContent)).toEqual([label])
    hasAll(current[0] as HTMLElement, 'text-accent-strong font-semibold before:h-5 before:w-0.5 before:bg-accent')
    for (const a of links.filter((x) => !current.includes(x))) {
      hasAll(a, 'text-ink font-medium')
      hasNone(a, 'text-accent-strong font-semibold before:bg-accent')
    }
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it.each([
    ['/dashboard', '대시보드'],
    ['/stats/x', '통계'],
    ['/claim', '청구'],
    ['/worklog', '업무일지'],
  ])('AC-2702.3·AC-5801.3: %s에서는 탭 띠의 [%s]이 지금 탭이고 [더보기] 단추는 "더보기"·기본 모양(ink-2 500)이며 판에는 지금 항목이 없다', async (path, label) => {
    pathname.mockReturnValue(path)
    const user = userEvent.setup()
    render(<TabBar />)
    expect(moreButton().textContent).toBe('더보기')
    hasAll(moreButton(), IDLE_LOOK)
    hasNone(moreButton(), 'text-ink font-semibold after:bg-accent')
    expect(within(strip()).getByRole('link', { name: label }).getAttribute('aria-current')).toBe('page')
    await user.click(moreButton())
    expect((panel() as HTMLElement).querySelectorAll('[aria-current]')).toHaveLength(0)
  })

  it('AC-2702.3: /admin에서는 탭 띠·[더보기] 판 모두 지금 항목이 없고 단추는 "더보기"다', async () => {
    pathname.mockReturnValue('/admin')
    const user = userEvent.setup()
    render(<TabBar />)
    expect(moreButton().textContent).toBe('더보기')
    hasAll(moreButton(), IDLE_LOOK)
    await user.click(moreButton())
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(0)
  })

  it('AC-515.1·AC-2702.1: 통계 탭은 href·path가 /stats이고 ready인 주요 메뉴라 탭 띠에 있고 [더보기] 판에는 없다', async () => {
    expect(MENU.find((m) => m.label === '통계')).toEqual({ label: '통계', path: '/stats', href: '/stats', ready: true, primary: true })
    const user = userEvent.setup()
    render(<TabBar />)
    const link = within(strip()).getByRole('link', { name: '통계' })
    expect(link.getAttribute('href')).toBe('/stats')
    expect(link.textContent).toBe('통계')
    await user.click(moreButton())
    expect(within(panel() as HTMLElement).queryByRole('link', { name: /통계/ })).toBeNull()
  })

  it('AC-012.2·AC-714.1·AC-2702.2·AC-5801.1·AC-5801.2: 업무일지(/worklog)는 ready·primary라 탭 띠에 있고 [더보기] 판에는 없다. AI 리포트(/ai-report)는 ready이고 [더보기] 판에 있으며 그 칸에 "준비 중" 칩이 없다', async () => {
    expect(MENU.find((m) => m.label === '업무일지')).toEqual({ label: '업무일지', path: '/worklog', href: '/worklog', ready: true, primary: true })
    expect(MENU.find((m) => m.label === 'AI 리포트')).toEqual({ label: 'AI 리포트', path: '/ai-report', href: '/ai-report', ready: true, primary: false })
    const user = userEvent.setup()
    render(<TabBar />)
    expect(within(strip()).getByRole('link', { name: '업무일지' }).getAttribute('href')).toBe('/worklog')
    expect(within(strip()).queryByRole('link', { name: /AI 리포트/ })).toBeNull()
    await user.click(moreButton())
    expect(within(panel() as HTMLElement).queryByRole('link', { name: /업무일지/ })).toBeNull()
    for (const [label, href] of [['AI 리포트', '/ai-report']]) {
      const link = within(panel() as HTMLElement).getByRole('link', { name: label })
      expect(link.getAttribute('href'), label).toBe(href)
      expect(link.children, label).toHaveLength(1)
      expect(link.textContent, label).toBe(label)
    }
  })

  it('AC-7611.1: 직원(/staff)은 href·path가 /staff인 ready 탭이고(주요 메뉴 아님) [더보기] 판에 있으며 그 칸에 "준비 중" 칩이 없다', async () => {
    expect(MENU.find((m) => m.label === '직원')).toEqual({ label: '직원', path: '/staff', href: '/staff', ready: true, primary: false })
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/staff')
    const user = userEvent.setup()
    render(<TabBar />)
    expect(within(strip()).queryByRole('link', { name: /직원/ })).toBeNull()
    await user.click(moreButton())
    const link = within(panel() as HTMLElement).getByRole('link', { name: '직원' })
    expect(link.getAttribute('href')).toBe('/staff')
    expect(link.children).toHaveLength(1)
    expect(link.textContent).toBe('직원')
  })

  it.each(['/staff', '/staff/schedule', '/staff/leave', '/staff/pay'])('AC-7611.2: %s에서는 탭 "직원"이 켜진다 — [더보기] 단추가 "더보기 · 직원"이고 판 안 직원 링크가 aria-current="page"다', async (path) => {
    pathname.mockReturnValue(path)
    expect(currentMenuLabel(path)).toBe('직원')
    const user = userEvent.setup()
    render(<TabBar />)
    expect(moreButton().textContent).toContain('직원')
    await user.click(moreButton())
    expect(within(panel() as HTMLElement).getByRole('link', { name: '직원' }).getAttribute('aria-current')).toBe('page')
  })

  it('AC-7512.1: 재고(/inventory)는 href·path가 /inventory인 ready 탭이고(주요 메뉴 아님) [더보기] 판 자리 그대로이며 그 칸에 "준비 중" 칩이 없다', async () => {
    expect(MENU.find((m) => m.label === '재고')).toEqual({ label: '재고', path: '/inventory', href: '/inventory', ready: true, primary: false })
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/inventory')
    const user = userEvent.setup()
    render(<TabBar />)
    expect(within(strip()).queryByRole('link', { name: /재고/ })).toBeNull()
    await user.click(moreButton())
    const link = within(panel() as HTMLElement).getByRole('link', { name: '재고' })
    expect(link.getAttribute('href')).toBe('/inventory')
    expect(link.children).toHaveLength(1)
    expect(link.textContent).toBe('재고')
  })

  it('AC-7512.1: /inventory에서는 탭 "재고"가 켜진다 — [더보기] 단추가 "더보기 · 재고"이고 판 안 재고 링크가 aria-current="page"다', async () => {
    pathname.mockReturnValue('/inventory')
    expect(currentMenuLabel('/inventory')).toBe('재고')
    const user = userEvent.setup()
    render(<TabBar />)
    expect(moreButton().textContent).toBe('더보기 · 재고')
    await user.click(moreButton())
    expect(within(panel() as HTMLElement).getByRole('link', { name: '재고' }).getAttribute('aria-current')).toBe('page')
  })

  it('AC-3501.1: 서식(/forms)은 href·path가 /forms인 ready 탭이고 [더보기] 판에 있으며 그 칸에 "준비 중" 칩이 없다', async () => {
    expect(MENU.find((m) => m.label === '서식')).toEqual({ label: '서식', path: '/forms', href: '/forms', ready: true, primary: false })
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/forms')
    const user = userEvent.setup()
    render(<TabBar />)
    expect(within(strip()).queryByRole('link', { name: /서식/ })).toBeNull()
    await user.click(moreButton())
    const link = within(panel() as HTMLElement).getByRole('link', { name: '서식' })
    expect(link.getAttribute('href')).toBe('/forms')
    expect(link.children).toHaveLength(1)
    expect(link.textContent).toBe('서식')
  })

  it('AC-6508.1: 주소록(/contacts)은 href·path가 /contacts인 ready 탭이고 primary가 아니라 [더보기] 판에 있으며(차례 그대로) 그 칸에 "준비 중" 칩이 없다', async () => {
    expect(MENU.find((m) => m.label === '주소록')).toEqual({ label: '주소록', path: '/contacts', href: '/contacts', ready: true, primary: false })
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/contacts')
    // 고시·공지는 주요 메뉴로 옮겨 [더보기] 판에 없다(notices AC-7423.1)
    expect(MORE_MENU.map((m) => m.label)).toEqual(['AI 리포트', '서식', '직원', '재고', '주소록', '설정'])
    const user = userEvent.setup()
    render(<TabBar />)
    expect(within(strip()).queryByRole('link', { name: /주소록/ })).toBeNull()
    await user.click(moreButton())
    const link = within(panel() as HTMLElement).getByRole('link', { name: '주소록' })
    expect(link.getAttribute('href')).toBe('/contacts')
    expect(link.children).toHaveLength(1)
    expect(link.textContent).toBe('주소록')
  })

  it('AC-2702.4: 누르면 aria-expanded가 true가 되고 aria-controls가 판의 id를 가리키며 초점은 단추에 남는다. 판은 나타날 때만 150ms 흐림 → 보임, 꺾쇠는 열린 동안 180° 돈다. 다시 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(moreButton())
    expect(moreButton().getAttribute('aria-expanded')).toBe('true')
    const id = moreButton().getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(document.getElementById(id as string)).toBe(panel())
    expect(document.activeElement).toBe(moreButton())
    const p = panel() as HTMLElement
    expect(motionOf(p)).toEqual(['transition', 'starting:opacity-0'])
    hasAll(moreButton().querySelector('svg') as SVGElement, 'transition rotate-180')
    await user.click(moreButton())
    expect(panel()).toBeNull()
    expect(moreButton().getAttribute('aria-expanded')).toBe('false')
    hasNone(moreButton().querySelector('svg') as SVGElement, 'rotate-180')
  })

  it('AC-2702.4: Esc로 닫히고 초점이 [더보기]로 돌아온다(판 안 링크에 초점이 있어도)', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(moreButton())
    act(() => within(panel() as HTMLElement).getAllByRole('link')[3]?.focus())
    await user.keyboard('{Escape}')
    expect(panel()).toBeNull()
    expect(moreButton().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(moreButton())
  })

  it('AC-2702.4: 판 밖을 누르면 닫히고, 판 안(머리)을 눌러서는 닫히지 않는다', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <p>바깥</p>
        <TabBar />
      </div>,
    )
    await user.click(moreButton())
    await user.click(within(panel() as HTMLElement).getByText(`다른 메뉴 ${MORE_PATHS.length}개`))
    expect(panel()).not.toBeNull()
    await user.click(screen.getByText('바깥'))
    expect(panel()).toBeNull()
    expect(moreButton().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-2702.4: 판 안 링크를 누르면 닫힌다(링크 이동은 막지 않는다)', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(moreButton())
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
    expect(moreButton().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-2702.4: 경로가 바뀌면 닫힌다(같은 경로로 다시 그려도 닫힌 그대로)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TabBar />)
    await user.click(moreButton())
    expect(panel()).not.toBeNull()
    pathname.mockReturnValue('/stats')
    rerender(<TabBar />)
    expect(panel()).toBeNull()
    expect(moreButton().getAttribute('aria-expanded')).toBe('false')
    rerender(<TabBar />)
    expect(panel()).toBeNull()
  })

  it('AC-2702.4: 판 자리 — 768px 이상은 오른쪽 끝을 본문 오른쪽 정렬선에 맞춘 320px 떠 있는 판(화면 폭 − 좌우 24px을 넘지 않는다), 768px 미만은 감싸개가 static이라 nav 전체 폭(inset-x-0) 두 칸 판이다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(moreButton())
    const p = panel() as HTMLElement
    hasAll(moreWrap(), 'relative max-md:static')
    hasAll(p, 'absolute top-full right-0 border-line bg-surface shadow-float')
    // 본문 오른쪽 정렬선(앱 틀 본문 max-w-7xl·좌우 24px): 탭 줄 감싸개가 1024px 이상 본문과 같은 1280 폭 가운데이고,
    // [더보기] 감싸개를 오른쪽 12px 띄워(md:mr-3) 단추 글자 끝이, 판을 단추 끝에서 12px 안쪽(md:right-3)에 맞춰 판 끝이 그 선에 온다
    hasAll(line(), 'flex min-w-0 flex-1 lg:mx-auto lg:max-w-7xl')
    // 탭 줄 감싸개는 자리 기준이 아니다 → 768px 미만 판의 기준은 그대로 nav(relative)다
    hasNone(line(), 'relative absolute fixed sticky')
    hasAll(moreWrap(), 'md:mr-3')
    hasAll(p, 'md:right-3')
    // 768px 미만 배치는 그대로: 폰 쪽 여백·오른쪽 맞춤을 더하지 않는다
    expect(classesOf(moreWrap()).filter((c) => /^(?:max-md:)?m[rx]-/.test(c))).toEqual([])
    expect(classesOf(p).filter((c) => /^max-md:(?:right|left|m[rx])-/.test(c))).toEqual([])
    hasAll(p, 'md:w-80 md:max-w-[calc(100vw-3rem)] md:rounded-float md:border')
    hasAll(p, 'max-md:inset-x-0 max-md:border-b')
    // 옛 [전체 메뉴] 판처럼 1024px 이상에서 숨거나 왼쪽 끝에 붙지 않는다
    hasNone(p, 'lg:hidden left-0 inset-x-0 w-80')
    const list = within(p).getByRole('list')
    hasAll(list, 'grid list-none max-md:grid-cols-2')
    hasNone(list, 'grid-cols-2')
  })
})

// ── ui-90 REQ-405 누른 탭 먼저 · 불러오기 줄 (UI_GUIDE '누른 탭 먼저 + 불러오기 줄', '움직임 › 불러오기 줄'). [더보기] 판 링크는 dashboard-ux AC-2702.5
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

  it('AC-405.2·AC-4110.1: 누른 뒤 다른 탭을 또 누르면 마지막에 누른 탭 하나만 누른 탭이다', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(stripLink('통계'))
    await user.click(stripLink('환자'))
    expect(pendings()).toEqual([stripLink('환자')])
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

  it('AC-2702.5: [더보기] 판의 링크를 누르면 판이 닫히고 [더보기] 단추가 누른 탭(data-pending="true"·지금 탭 모양·"더보기 · 그 이름")이 되며 불러오기 줄이 차오른다. 앞서 누른 띠의 탭과 옛 지금 탭은 기본 모양, aria-current는 아직 그대로', async () => {
    const user = userEvent.setup()
    render(<TabBar />)
    await user.click(stripLink('통계'))
    await user.click(moreButton())
    await user.click(within(panel() as HTMLElement).getByRole('link', { name: /^재고/ }))
    expect(panel()).toBeNull()
    expect(pendings()).toEqual([moreButton()])
    expect(moreButton().getAttribute('data-pending')).toBe('true')
    expect(moreButton().textContent).toBe('더보기 · 재고')
    hasAll(moreButton(), CURRENT_LOOK)
    hasAll(stripLink('통계'), IDLE_LOOK)
    hasAll(stripLink('대시보드'), IDLE_LOOK)
    expect(stripLink('대시보드').getAttribute('aria-current')).toBe('page')
    hasAll(loadBar(), 'scale-x-80 duration-700 ease-out')
  })

  it('AC-2702.5: 경로가 바뀌면 data-pending이 사라지고 [더보기]는 그 경로의 지금 탭 표시("더보기 · 재고")로 남으며 줄이 사라진다', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TabBar />)
    await user.click(moreButton())
    await user.click(within(panel() as HTMLElement).getByRole('link', { name: /^재고/ }))
    pathname.mockReturnValue('/inventory')
    rerender(<TabBar />)
    expect(pendings()).toEqual([])
    expect(moreButton().textContent).toBe('더보기 · 재고')
    hasAll(moreButton(), CURRENT_LOOK)
    hasAll(loadBar(), 'opacity-0')
    expect(strip().querySelectorAll('[aria-current]')).toHaveLength(0)
  })

  it('AC-2702.5: 판 밖 지금 탭(더보기 항목)에서 띠의 탭을 누르면 그 탭이 누른 탭이 되고 [더보기]는 "더보기"·기본 모양이 된다. 판 안 지금 항목을 누르면 판만 닫히고 누른 탭·줄이 거둬진다', async () => {
    // 업무일지는 탭 띠로 옮겨 갔다(nav-worklog AC-5801.2) → 판 안 ready 항목은 AI 리포트로 본다
    pathname.mockReturnValue('/ai-report')
    const user = userEvent.setup()
    render(<TabBar />)
    expect(moreButton().textContent).toBe('더보기 · AI 리포트')
    await user.click(stripLink('통계'))
    expect(pendings()).toEqual([stripLink('통계')])
    expect(moreButton().textContent).toBe('더보기')
    hasAll(moreButton(), IDLE_LOOK)
    expect(moreButton().hasAttribute('data-pending')).toBe(false)
    await user.click(moreButton())
    await user.click(within(panel() as HTMLElement).getByRole('link', { name: 'AI 리포트' }))
    expect(panel()).toBeNull()
    expect(pendings()).toEqual([])
    expect(moreButton().textContent).toBe('더보기 · AI 리포트')
    hasAll(moreButton(), CURRENT_LOOK)
    hasAll(loadBar(), 'opacity-0')
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

  it('AC-405.3·AC-4110.1: 다시 누르면 줄이 0에서 다시 차오른다(새 줄)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TabBar />)
    await user.click(stripLink('통계'))
    const first = loadBar()
    pathname.mockReturnValue('/stats')
    rerender(<TabBar />)
    await user.click(stripLink('환자'))
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

  // desk-feedback AC-6306.2: 데스크 계정은 계정 단추(메일 앞)와 메뉴 머리에 warning 칩 '데스크'. [가입 승인]은 없다
  const menuHead = () => document.getElementById(screen.getByRole('menu').getAttribute('aria-describedby') as string) as HTMLElement

  it('AC-6306.2: desk면 계정 단추 안 메일 앞에 warning 칩 "데스크"가 있고 768px 미만에서도 보인다(단추는 44px 높이, 폭은 칩이 들어가게 고정하지 않는다)', () => {
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} desk />)
    const chip = within(button()).getByText('데스크')
    expect(chip.tagName).toBe('SPAN')
    hasAll(chip, ds.chip.warning)
    expect(classesOf(chip).filter((c) => /(?:^|:)(?:hidden|sr-only)$/.test(c))).toEqual([])
    const mail = within(button()).getByText(EMAIL)
    expect(chip.compareDocumentPosition(mail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button().textContent).toBe(`데스크${EMAIL}`)
    // 사람 아이콘 · 칩 · 이메일 · 아래 화살표
    expect(Array.from(button().children).map((el) => el.tagName.toLowerCase())).toEqual(['svg', 'span', 'span', 'svg'])
    hasAll(button(), `${ds.button.secondarySmall} max-md:h-11 max-md:border-transparent`)
    hasNone(button(), 'max-md:size-11')
    // 화면 읽기 이름은 이메일로 시작한다
    expect(button().getAttribute('aria-label')?.startsWith(EMAIL)).toBe(true)
  })

  // 항목은 desk-setup AC-7003.1부터 [비트 PC 연결]·[로그아웃](옛: [로그아웃] 하나·링크 없음)
  it('AC-6306.2·AC-7003.1: desk면 메뉴 머리(이메일·병원 이름)에도 warning 칩 "데스크"가 있고, 관리자 값이 참이어도 [가입 승인]·"관리자 계정"이 없다(항목은 [비트 PC 연결]·[로그아웃], 링크는 /claim/setup 하나)', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin desk />)
    await user.click(button())
    const head = menuHead()
    expect(within(head).getByText(EMAIL)).toBeTruthy()
    expect(within(head).getByText(HOSPITAL)).toBeTruthy()
    hasAll(within(head).getByText('데스크'), ds.chip.warning)
    expect(within(head).queryByText('관리자 계정')).toBeNull()
    expect(menuItems().map((i) => i.textContent)).toEqual(['비트 PC 연결', '로그아웃'])
    expect(screen.queryByText('가입 승인')).toBeNull()
    // 메뉴 항목 링크는 role이 menuitem이라 link 역할로 잡히지 않는다 → a 요소로 본다
    expect(Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['/claim/setup'])
  })

  // desk-setup REQ-7003: 데스크 계정 메뉴의 [비트 PC 연결](시안 docs/mockups/desk-setup ②). 원장·관리자 메뉴는 그대로
  it('AC-7003.1: desk면 [로그아웃] 위에 메뉴 항목 링크 [비트 PC 연결](/claim/setup, menuitem, 왼쪽 꾸밈 아이콘 monitor 16)이 있고 [로그아웃]과 같은 항목 모양이다', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} desk />)
    await user.click(button())
    const [setup, logout] = menuItems()
    expect(setup.tagName).toBe('A')
    expect(setup.textContent).toBe('비트 PC 연결')
    expect(setup.getAttribute('href')).toBe('/claim/setup')
    expect(setup.getAttribute('role')).toBe('menuitem')
    expect(logout.textContent).toBe('로그아웃')
    expect(classesOf(setup)).toEqual(classesOf(logout))
    // 열면 첫 항목([비트 PC 연결])에 초점
    expect(document.activeElement).toBe(setup)
    const svg = setup.firstElementChild as SVGElement
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(setup.querySelectorAll('svg')).toHaveLength(1)
    expect([svg.getAttribute('width'), svg.getAttribute('height'), svg.getAttribute('viewBox')]).toEqual(['16', '16', '0 0 16 16'])
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.innerHTML).toBe(iconInner('monitor'))
    hasAll(svg, 'shrink-0 text-ink-2')
  })

  it('AC-7003.1: [비트 PC 연결]을 누르면 메뉴가 닫히고 /claim/setup으로 간다(링크 이동을 막지 않는다)', async () => {
    const user = userEvent.setup()
    render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={false} desk />)
    await user.click(button())
    // jsdom은 페이지 이동을 하지 않는다 → 문서까지 올라온 누름이 /claim/setup 링크이고 막히지 않았는지 본다
    const clicks: { href: string | null; blocked: boolean }[] = []
    const onClick = (e: MouseEvent) => {
      clicks.push({ href: (e.target as Element).closest('a')?.getAttribute('href') ?? null, blocked: e.defaultPrevented })
      e.preventDefault()
    }
    document.addEventListener('click', onClick)
    try {
      await user.click(screen.getByRole('menuitem', { name: '비트 PC 연결' }))
    } finally {
      document.removeEventListener('click', onClick)
    }
    expect(clicks).toEqual([{ href: '/claim/setup', blocked: false }])
    expect(screen.queryByRole('menu')).toBeNull()
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('AC-7003.2: 원장·관리자 메뉴에는 [비트 PC 연결]이 없다 — 관리자는 [가입 승인]·[로그아웃], 원장은 [로그아웃]', async () => {
    for (const [isAdmin, items] of [
      [true, ['가입 승인', '로그아웃']],
      [false, ['로그아웃']],
    ] as const) {
      for (const desk of [undefined, false]) {
        const user = userEvent.setup()
        render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin={isAdmin} desk={desk} />)
        await user.click(button())
        expect(menuItems().map((i) => i.textContent)).toEqual(items)
        expect(screen.queryByText('비트 PC 연결')).toBeNull()
        expect(Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(isAdmin ? ['/admin'] : [])
        cleanup()
      }
    }
  })

  it('AC-6306.2: desk가 없거나 거짓이면 계정 단추·메뉴 머리에 "데스크" 칩이 없고 단추는 지금 모양(폰 44×44)이다', async () => {
    for (const desk of [undefined, false]) {
      const user = userEvent.setup()
      render(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} isAdmin desk={desk} />)
      expect(button().textContent).toBe(EMAIL)
      hasAll(button(), 'max-md:size-11')
      await user.click(button())
      expect(within(menuHead()).queryByText('데스크')).toBeNull()
      expect(menuItems().map((i) => i.textContent)).toEqual(['가입 승인', '로그아웃'])
      cleanup()
    }
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

  it('AC-303.4·AC-304.1·AC-2702.1: 관리자여도 탭 줄에 [관리자]·구분선이 없고(링크는 주요 메뉴 넷뿐), 계정 메뉴를 열면 첫 항목이 [가입 승인] /admin이다', async () => {
    const user = userEvent.setup()
    shell(true)
    expect(within(nav()).queryByRole('link', { name: '관리자' })).toBeNull()
    expect(within(nav()).queryByText('관리자')).toBeNull()
    expect(nav().querySelectorAll('[aria-hidden="true"].w-px')).toHaveLength(0)
    expect(within(nav()).getAllByRole('link').map((a) => a.textContent)).toEqual(PRIMARY)
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

  // claim-memo-fit REQ-4801: 앱 안에 [data-wide-page](메모 칸)가 있으면 1024px 이상에서 1280 폭 제한을 푼다. 감싸개 넷이 같이 넓어진다
  const WIDE = 'lg:group-has-[[data-wide-page]]/app:max-w-none'

  it('AC-4801.2: 뿌리에 이름 붙은 묶음 group/app이 있고, max-w-7xl 감싸개 넷(띠 안쪽·탭 줄 감싸개·탭 띠 안 줄·본문 안쪽)에 모두 넓힘 class가 있다. 그 밖의 class는 그대로다', () => {
    const { container } = shell()
    const root = container.firstElementChild as HTMLElement
    hasAll(root, 'group/app app-ui bg-surface text-ink min-h-dvh')
    const headerInner = screen.getByRole('banner').firstElementChild as HTMLElement
    const tabRow = strip().firstElementChild as HTMLElement
    const mainInner = screen.getByRole('main').firstElementChild as HTMLElement
    hasAll(headerInner, `${WIDE} mx-auto w-full ${wrapper} h-14 max-md:h-12`)
    hasAll(mainInner, `${WIDE} mx-auto w-full ${wrapper} pt-6 pb-12`)
    hasAll(line(), `${WIDE} flex min-w-0 flex-1 lg:mx-auto lg:max-w-7xl`)
    hasAll(tabRow, `${WIDE} px-6 max-md:px-4 lg:mx-auto lg:w-full lg:min-w-0 lg:max-w-7xl`)
    // 1280 폭 감싸개는 이 넷뿐이고, 넓힘 class도 이 넷에만 있다(한 곳만 넓어져 왼쪽 끝이 어긋나지 않게)
    const capped = Array.from(container.querySelectorAll('*')).filter((el) => classesOf(el).some((c) => /(?:^|:)max-w-7xl$/.test(c)))
    expect(capped).toEqual([headerInner, line(), tabRow, mainInner])
    const widened = Array.from(container.querySelectorAll('*')).filter((el) => classesOf(el).includes(WIDE))
    expect(widened).toEqual(capped)
  })

  it('AC-4801.3: 앱 틀 뿌리에 이름 없는 group class가 없다 — 묶음은 group/app 하나뿐이다(안쪽 group-hover 등이 앱 전체에 걸리지 않게)', () => {
    const { container } = shell()
    const root = container.firstElementChild as HTMLElement
    expect(classesOf(root)).not.toContain('group')
    expect(classesOf(root).filter((c) => c === 'group' || c.startsWith('group/'))).toEqual(['group/app'])
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

  // desk-feedback AC-6306.2·AC-6306.3: AppShell desk → 세 탭·칩, 본문은 RoleProvider desk + DeskGate 안
  function DeskProbe() {
    return <p>{useDesk() ? '데스크 본문' : '원장 본문'}</p>
  }
  const deskShell = (desk?: boolean) => (
    <AppShell hospitalName={HOSPITAL} email={EMAIL} isAdmin={false} desk={desk}>
      <DeskProbe />
    </AppShell>
  )
  const BLOCKED = '데스크 계정은 볼 수 없는 화면이에요'

  it('AC-6306.2·AC-6306.3: desk면 탭은 업무일지·수납일지·예약 셋([더보기] 없음)이고 계정 단추에 칩 "데스크"가 있다. 세 탭 주소(/sunap)에서는 본문을 그대로 그리고 본문 안 useDesk()가 참이다', () => {
    pathname.mockReturnValue('/sunap')
    render(deskShell(true))
    expect(within(nav()).getAllByRole('link').map((a) => a.textContent)).toEqual(['업무일지', '수납일지', '예약'])
    expect(within(nav()).queryAllByRole('button')).toEqual([])
    const account = within(screen.getByRole('banner')).getByRole('button', { name: new RegExp(EMAIL) })
    hasAll(within(account).getByText('데스크'), ds.chip.warning)
    const main = screen.getByRole('main')
    expect(within(main).getByText('데스크 본문')).toBeTruthy()
    expect(within(main).queryByText(BLOCKED)).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
    // 감싸개(RoleProvider·DeskGate)는 마크업을 더하지 않는다 — 본문 감싸개 바로 안이 페이지다
    expect(main.children).toHaveLength(1)
    expect((main.firstElementChild as HTMLElement).firstElementChild?.textContent).toBe('데스크 본문')
  })

  it('AC-6306.3: desk면 막힌 주소(/stats)는 본문 대신 막힌 화면이고, /dashboard는 /sunap으로 바꾸며(router.replace) 그동안 본문이 비어 있다. 옆 화면으로 옮겨 가면 주소에 따라 바로 바뀐다', () => {
    pathname.mockReturnValue('/stats')
    const { rerender } = render(deskShell(true))
    const inner = () => screen.getByRole('main').firstElementChild as HTMLElement
    expect(within(inner()).getByRole('heading', { level: 1 }).textContent).toBe(BLOCKED)
    expect(within(inner()).queryByText('데스크 본문')).toBeNull()
    expect(within(inner()).getByRole('link', { name: '수납일지로 가기' }).getAttribute('href')).toBe('/sunap')
    pathname.mockReturnValue('/dashboard')
    rerender(deskShell(true))
    expect(inner().children).toHaveLength(0)
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/sunap')
    pathname.mockReturnValue('/worklog')
    rerender(deskShell(true))
    expect(within(inner()).getByText('데스크 본문')).toBeTruthy()
    expect(within(inner()).queryByText(BLOCKED)).toBeNull()
  })

  // contacts AC-6508.3: 주소록은 원장(의원) 계정만 — 데스크는 탭 줄에 없고 주소를 쳐도 막힌 화면이다(DESK_MENU·isDeskPath 그대로)
  it('AC-6508.3: desk면 탭 줄에 주소록이 없고, /contacts를 열면 본문 대신 막힌 화면이다(원장은 그대로 본문)', () => {
    expect(DESK_MENU.map((m) => m.path)).not.toContain('/contacts')
    expect(isDeskPath('/contacts')).toBe(false)
    expect(isDeskPath('/contacts/x')).toBe(false)
    pathname.mockReturnValue('/contacts')
    render(deskShell(true))
    expect(within(nav()).queryByRole('link', { name: /주소록/ })).toBeNull()
    expect(within(nav()).queryByText(/주소록/)).toBeNull()
    const inner = screen.getByRole('main').firstElementChild as HTMLElement
    expect(within(inner).getByRole('heading', { level: 1 }).textContent).toBe(BLOCKED)
    expect(within(inner).queryByText('데스크 본문')).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
    cleanup()
    render(deskShell(false))
    expect(within(screen.getByRole('main')).getByText('원장 본문')).toBeTruthy()
    expect(moreButton().textContent).toBe('더보기 · 주소록')
  })

  it('AC-6306.2·AC-6306.3: desk가 없거나 거짓이면 지금과 같다 — 막힌 주소(/stats)에서도 본문을 그리고 useDesk()는 거짓, 탭은 주요 메뉴 여덟과 [더보기], "데스크" 칩 없음', () => {
    pathname.mockReturnValue('/stats')
    for (const desk of [undefined, false]) {
      render(deskShell(desk))
      expect(within(screen.getByRole('main')).getByText('원장 본문')).toBeTruthy()
      expect(screen.queryByText(BLOCKED)).toBeNull()
      expect(tabItems().map((el) => el.textContent)).toEqual(PRIMARY)
      expect(moreButton().textContent).toBe('더보기')
      expect(within(screen.getByRole('banner')).queryByText('데스크')).toBeNull()
      expect(router.replace).not.toHaveBeenCalled()
      cleanup()
    }
  })
})

// 인쇄(worklog REQ-011): 앱 틀은 숨기고 본문만 여백 없이 찍힌다. 다른 화면 인쇄에도 같은 효과다
describe('AppShell 인쇄', () => {
  it('AC-011.3: 건너뛰기 링크·위쪽 묶음은 print:hidden, 본문 안쪽 감싸개는 print:p-0이고 본문은 숨지 않는다', () => {
    render(
      <AppShell hospitalName={HOSPITAL} email={EMAIL} isAdmin={false}>
        <h1>본문 제목</h1>
      </AppShell>,
    )
    hasAll(screen.getByRole('link', { name: '본문으로 건너뛰기' }), 'print:hidden')
    hasAll(screen.getByRole('banner').parentElement as HTMLElement, 'print:hidden')
    const main = screen.getByRole('main')
    const inner = main.firstElementChild as HTMLElement
    hasAll(inner, 'print:p-0')
    hasNone(main, 'print:hidden')
    hasNone(inner, 'print:hidden')
  })
})

// ── location REQ-7901: 입지 분석 탭(관리자만). MENU 밖 상수 LOCATION_TAB 하나를 관리자 [더보기] 판의 주소록 다음·설정 앞에 끼운다.
// /location만 자기 CSP(카카오 origin, next.config.ts)를 쓴다. Next <Link>는 문서를 새로 받지 않고 옮기므로 첫 문서의 CSP가 그대로 남는다
// (다른 탭에서 넘어가면 지도가 막히고, /location에서 떠나면 넓은 CSP가 남는다) → 입지 분석으로 가는 링크와 /location 화면 안의 셸 링크는
// 평범한 <a>다(브라우저가 새 문서를 받아 그 주소의 머리를 쓴다)
describe('입지 분석 탭 (location REQ-7901)', () => {
  // 관리자 [더보기] 판 차례: MORE_MENU의 주소록 다음에 입지 분석
  const AT = MORE_PATHS.findIndex(([label]) => label === '주소록') + 1
  const ADMIN_MORE_PATHS = [...MORE_PATHS.slice(0, AT), ['입지 분석', '/location'] as const, ...MORE_PATHS.slice(AT)]
  const panelLinks = () => within(within(panel() as HTMLElement).getByRole('list')).getAllByRole('link')
  const panelHead = () => (panel() as HTMLElement).firstElementChild as HTMLElement
  const locationLink = () => (panel() as HTMLElement).querySelector<HTMLAnchorElement>('a[href="/location"]')

  // 진짜 next/link에 Next 길잡이(router)를 준다 → <Link>는 누르면 기본 이동을 막고 push로 이 창 안에서 옮긴다(새 문서 없음 → CSP 그대로).
  // 평범한 <a>는 push를 부르지 않고 기본 이동(브라우저가 새 문서를 받음)을 막지 않는다
  const nextRouter = {
    push: vi.fn<(href: string) => Promise<boolean>>(async () => true),
    replace: vi.fn(async () => true),
    prefetch: vi.fn(async () => undefined),
    pathname: '/',
    asPath: '/',
  }
  const withRouter = (ui: ReactNode) => <RouterContext.Provider value={nextRouter as unknown as NextRouter}>{ui}</RouterContext.Provider>
  beforeEach(() => {
    nextRouter.push.mockClear()
    nextRouter.prefetch.mockClear()
  })

  // 링크를 누른 결과: 'next' = Next가 이 창 안에서 옮김, 'document' = 브라우저가 새 문서를 받음.
  // jsdom은 페이지를 옮기지 않는다 → 문서까지 올라온 누름에서 기본 이동이 막혔는지만 적고 기본 이동은 막는다
  async function press(user: ReturnType<typeof userEvent.setup>, link: HTMLElement): Promise<'next' | 'document'> {
    nextRouter.push.mockClear()
    const prevented: boolean[] = []
    const onClick = (e: MouseEvent) => {
      prevented.push(e.defaultPrevented)
      e.preventDefault()
    }
    document.addEventListener('click', onClick)
    try {
      await user.click(link)
    } finally {
      document.removeEventListener('click', onClick)
    }
    expect(prevented).toHaveLength(1)
    if (nextRouter.push.mock.calls.length > 0) {
      expect(prevented).toEqual([true])
      return 'next'
    }
    expect(prevented).toEqual([false])
    return 'document'
  }

  it("AC-7901.1: LOCATION_TAB = { label: '입지 분석', path: '/location', href: '/location', ready: true, primary: false } 하나이고 MENU·PRIMARY_MENU·MORE_MENU·DESK_MENU 밖이다(MENU 14개 그대로). 데스크 주소가 아니다", () => {
    expect(LOCATION_TAB).toEqual({ label: '입지 분석', path: '/location', href: '/location', ready: true, primary: false })
    for (const list of [MENU, PRIMARY_MENU, MORE_MENU, DESK_MENU]) {
      expect(list.map((m) => m.label as string)).not.toContain('입지 분석')
      expect(list.map((m) => m.path as string)).not.toContain('/location')
      expect(list).not.toContain(LOCATION_TAB)
    }
    expect(MENU.map((m) => [m.label, m.path])).toEqual(PATHS)
    expect(MORE_MENU.map((m) => [m.label, m.path])).toEqual(MORE_PATHS)
    for (const path of ['/location', '/location/x']) expect(isDeskPath(path), path).toBe(false)
  })

  it("AC-7901.1: 지금 탭 — /location과 그 아래는 '입지 분석'이고 /locations·/location-x·/locationx는 아니다", () => {
    expect(currentMenuLabel('/location')).toBe('입지 분석')
    expect(currentMenuLabel('/location/report')).toBe('입지 분석')
    for (const path of ['/locations', '/location-x', '/locationx']) expect(currentMenuLabel(path), path).toBeNull()
  })

  it('AC-7901.1: 관리자면 [더보기] 판이 일곱 — 주소록 다음·설정 앞에 입지 분석(/location), 머리 "다른 메뉴 7개"·준비 중 수 그대로. 입지 분석 칸만 이름 뒤 중립 칩 "관리자만"(시안)이고 링크 모양은 다른 칸과 같다. 탭 띠는 그대로다', async () => {
    const user = userEvent.setup()
    render(<TabBar isAdmin />)
    expect(tabItems().map((el) => el.textContent)).toEqual(PRIMARY)
    expect(moreButton().textContent).toBe('더보기')
    await user.click(moreButton())
    expect(Array.from(panelHead().children).map((s) => s.textContent)).toEqual(
      NOT_READY_FEATURES.length === 0
        ? [`다른 메뉴 ${ADMIN_MORE_PATHS.length}개`]
        : [`다른 메뉴 ${ADMIN_MORE_PATHS.length}개`, `준비 중 ${NOT_READY_FEATURES.length}개`],
    )
    expect(panelHead().textContent).toContain('다른 메뉴 7개')
    expect(within(panel() as HTMLElement).queryAllByText('준비 중')).toHaveLength(NOT_READY_FEATURES.length)
    const links = panelLinks()
    expect(links.map((a) => [a.firstElementChild?.textContent, a.getAttribute('href')])).toEqual(ADMIN_MORE_PATHS)
    expect(within(within(panel() as HTMLElement).getByRole('list')).getAllByRole('listitem')).toHaveLength(ADMIN_MORE_PATHS.length)
    const location = links[AT] as HTMLElement
    expect(location).toBe(locationLink())
    expect(location.children).toHaveLength(2)
    const chip = location.lastElementChild as HTMLElement
    expect(chip.tagName).toBe('SPAN')
    expect(chip.textContent).toBe('관리자만')
    hasAll(chip, ds.chip.neutral)
    // 칩은 링크 글자 안이다 → 링크 이름이 "입지 분석 관리자만"
    expect(within(panel() as HTMLElement).getByRole('link', { name: '입지 분석 관리자만' })).toBe(location)
    hasAll(location, 'flex h-11 items-center no-underline text-ink font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
    expect(location.hasAttribute('aria-current')).toBe(false)
    // 다른 칸에는 "관리자만" 칩이 없다
    for (const a of links.filter((x) => x !== location)) expect(a.textContent, a.getAttribute('href') ?? '').not.toContain('관리자만')
  })

  it('AC-7901.1: 관리자가 아닌 원장(isAdmin 없음·거짓)의 [더보기] 판에는 입지 분석이 없고 지금과 같다("다른 메뉴 6개"). 데스크는 관리자 값이 참이어도 [더보기]·입지 분석이 없다', async () => {
    const user = userEvent.setup()
    for (const ui of [<TabBar key="none" />, <TabBar key="false" isAdmin={false} />]) {
      render(ui)
      await user.click(moreButton())
      expect(panel()?.textContent).not.toContain('입지 분석')
      expect(locationLink()).toBeNull()
      expect(panelLinks().map((a) => [a.firstElementChild?.textContent, a.getAttribute('href')])).toEqual(MORE_PATHS)
      expect(panelHead().firstElementChild?.textContent).toBe(`다른 메뉴 ${MORE_PATHS.length}개`)
      cleanup()
    }
    for (const path of ['/sunap', '/location']) {
      pathname.mockReturnValue(path)
      render(<TabBar desk isAdmin />)
      expect(within(nav()).queryAllByRole('button')).toEqual([])
      expect(nav().textContent).not.toContain('입지 분석')
      expect(nav().querySelector('a[href="/location"]')).toBeNull()
      cleanup()
    }
  })

  it.each(['/location', '/location/x'])('AC-7901.1: 관리자가 %s에 있으면 [더보기] 단추가 "더보기 · 입지 분석"·지금 탭 모양이고 판 안 입지 분석에만 aria-current="page"다(탭 띠에는 지금 탭 없음)', async (path) => {
    pathname.mockReturnValue(path)
    const user = userEvent.setup()
    render(<TabBar isAdmin />)
    expect(moreButton().textContent).toBe('더보기 · 입지 분석')
    hasAll(moreButton(), `${CURRENT_LOOK} relative after:inset-x-3`)
    expect(strip().querySelectorAll('[aria-current]')).toHaveLength(0)
    await user.click(moreButton())
    const current = panelLinks().filter((a) => a.getAttribute('aria-current') === 'page')
    expect(current.map((a) => a.getAttribute('href'))).toEqual(['/location'])
    hasAll(current[0] as HTMLElement, 'text-accent-strong font-semibold before:h-5 before:w-0.5 before:bg-accent')
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('AC-7901.1: 다른 탭(/dashboard)에서 [더보기] 판의 입지 분석은 평범한 <a href="/location"> — 누르면 Next가 이 창 안에서 옮기지 않고 브라우저가 새 문서를 받는다(그 문서의 카카오 CSP를 쓴다). 탭 띠·판의 다른 링크는 지금처럼 Next가 옮긴다', async () => {
    const user = userEvent.setup()
    render(withRouter(<TabBar isAdmin />))
    // 시험이 둘을 가려 낸다: Next 길잡이가 있으면 <Link>는 이 창 안에서 옮긴다
    for (const [label, href] of PRIMARY_PATHS) {
      const link = within(strip()).getByRole('link', { name: label })
      expect(link.getAttribute('href')).toBe(href)
      expect(await press(user, link), label).toBe('next')
      expect(nextRouter.push.mock.calls[0]?.[0], label).toBe(href)
    }
    for (const [label, href] of ADMIN_MORE_PATHS) {
      await user.click(moreButton())
      const link = (panel() as HTMLElement).querySelector<HTMLAnchorElement>(`a[href="${href}"]`) as HTMLAnchorElement
      expect(link.firstElementChild?.textContent).toBe(label)
      expect(await press(user, link), label).toBe(href === '/location' ? 'document' : 'next')
      // 판 안 링크를 누르면 판이 닫힌다(새 문서로 가는 링크도)
      expect(panel(), label).toBeNull()
    }
  })

  it.each(['/location', '/location/x'])('AC-7901.1: %s에서는 셸의 탭 링크가 모두 평범한 <a> — 탭 띠 여덟·[더보기] 판 일곱 어느 것을 눌러도 Next가 옮기지 않고 브라우저가 새 문서를 받는다(넓은 CSP가 다른 탭에 남지 않는다)', async (path) => {
    pathname.mockReturnValue(path)
    const user = userEvent.setup()
    render(withRouter(<TabBar isAdmin />))
    for (const [label, href] of PRIMARY_PATHS) {
      const link = within(strip()).getByRole('link', { name: label })
      expect(link.getAttribute('href')).toBe(href)
      expect(await press(user, link), label).toBe('document')
    }
    for (const [label, href] of ADMIN_MORE_PATHS) {
      await user.click(moreButton())
      const link = (panel() as HTMLElement).querySelector<HTMLAnchorElement>(`a[href="${href}"]`) as HTMLAnchorElement
      expect(link.firstElementChild?.textContent).toBe(label)
      expect(await press(user, link), label).toBe('document')
    }
    expect(nextRouter.push).not.toHaveBeenCalled()
  })

  it('AC-7901.1·AC-2702.5: [더보기] 판의 입지 분석을 누르면 판이 닫히고 [더보기]가 누른 탭("더보기 · 입지 분석"·data-pending·지금 탭 모양)이 되며 불러오기 줄이 찬다 — 새 문서를 받는 동안 보인다', async () => {
    const stop = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('click', stop)
    try {
      const user = userEvent.setup()
      render(<TabBar isAdmin />)
      await user.click(moreButton())
      await user.click(locationLink() as HTMLAnchorElement)
      expect(panel()).toBeNull()
      expect(moreButton().textContent).toBe('더보기 · 입지 분석')
      expect(moreButton().getAttribute('data-pending')).toBe('true')
      hasAll(moreButton(), CURRENT_LOOK)
      hasAll(within(strip()).getByRole('link', { name: '대시보드' }), IDLE_LOOK)
      hasAll(loadBar(), 'scale-x-80 duration-700 ease-out')
    } finally {
      document.removeEventListener('click', stop)
    }
  })

  it('AC-7901.1: 새 문서로 떠난 뒤 뒤로 가기로 이 화면이 그대로 돌아오면(pageshow persisted) 누른 탭·불러오기 줄을 거둔다. 처음 문서를 열 때의 pageshow(persisted 아님)는 그대로 둔다', async () => {
    pathname.mockReturnValue('/location')
    const stop = (e: MouseEvent) => e.preventDefault()
    document.addEventListener('click', stop)
    try {
      const user = userEvent.setup()
      render(<TabBar isAdmin />)
      await user.click(within(strip()).getByRole('link', { name: '통계' }))
      expect(within(strip()).getByRole('link', { name: '통계' }).getAttribute('data-pending')).toBe('true')
      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
      })
      expect(within(strip()).getByRole('link', { name: '통계' }).getAttribute('data-pending')).toBe('true')
      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      })
      expect(document.querySelectorAll('[data-pending]')).toHaveLength(0)
      expect(moreButton().textContent).toBe('더보기 · 입지 분석')
      hasAll(loadBar(), 'opacity-0')
    } finally {
      document.removeEventListener('click', stop)
    }
  })

  it('AC-7901.1: AppShell은 관리자 값을 탭 줄에도 넘긴다 — 관리자면 [더보기] 판에 입지 분석이 있고, 관리자가 아니면 없다. 데스크는 관리자 값이 참이어도 [더보기]·입지 분석이 없다', async () => {
    const user = userEvent.setup()
    for (const isAdmin of [true, false]) {
      render(
        <AppShell hospitalName={HOSPITAL} email={EMAIL} isAdmin={isAdmin}>
          <h1>본문 제목</h1>
        </AppShell>,
      )
      await user.click(moreButton())
      expect(locationLink() !== null, `관리자 ${isAdmin}`).toBe(isAdmin)
      expect(panelLinks().map((a) => a.getAttribute('href'))).toEqual((isAdmin ? ADMIN_MORE_PATHS : MORE_PATHS).map(([, href]) => href))
      cleanup()
    }
    pathname.mockReturnValue('/sunap')
    render(
      <AppShell hospitalName={HOSPITAL} email={EMAIL} isAdmin desk>
        <h1>본문 제목</h1>
      </AppShell>,
    )
    expect(within(nav()).queryAllByRole('button')).toEqual([])
    expect(nav().textContent).not.toContain('입지 분석')
    expect(document.querySelector('a[href="/location"]')).toBeNull()
  })

  // 계정 메뉴의 링크 둘(관리자 [가입 승인] /admin · 데스크 [비트 PC 연결] /claim/setup)도 셸 링크(ShellLink)와 같은 까닭으로
  // /location(그 아래)에서는 평범한 <a>다 — Next가 옮기면 /location의 넓은 CSP가 그 화면에 남는다
  const ACCOUNT_LINKS = [
    [{ isAdmin: true }, ADMIN_LINK.label, ADMIN_LINK.href],
    [{ isAdmin: false, desk: true }, '비트 PC 연결', '/claim/setup'],
  ] as const
  const accountButton = () => screen.getByRole('button', { name: new RegExp(EMAIL) })

  it.each(['/location', '/location/x'])('AC-7901.1: %s에서는 계정 메뉴의 [가입 승인]·[비트 PC 연결]도 평범한 <a> — 누르면 Next가 옮기지 않고 브라우저가 새 문서를 받으며 메뉴가 닫힌다', async (path) => {
    pathname.mockReturnValue(path)
    const user = userEvent.setup()
    for (const [props, name, href] of ACCOUNT_LINKS) {
      render(withRouter(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} {...props} />))
      await user.click(accountButton())
      const link = screen.getByRole('menuitem', { name })
      expect(link.tagName).toBe('A')
      expect(link.getAttribute('href')).toBe(href)
      expect(await press(user, link), name).toBe('document')
      expect(screen.queryByRole('menu'), name).toBeNull()
      cleanup()
    }
    expect(nextRouter.push).not.toHaveBeenCalled()
  })

  it.each(['/dashboard', '/locations'])('AC-7901.1: %s에서는 계정 메뉴의 [가입 승인]·[비트 PC 연결]이 지금처럼 Next가 이 창 안에서 옮긴다', async (path) => {
    pathname.mockReturnValue(path)
    const user = userEvent.setup()
    for (const [props, name, href] of ACCOUNT_LINKS) {
      render(withRouter(<AccountMenu email={EMAIL} hospitalName={HOSPITAL} {...props} />))
      await user.click(accountButton())
      const link = screen.getByRole('menuitem', { name })
      expect(await press(user, link), name).toBe('next')
      expect(nextRouter.push.mock.calls[0]?.[0], name).toBe(href)
      expect(screen.queryByRole('menu'), name).toBeNull()
      cleanup()
    }
  })
})
