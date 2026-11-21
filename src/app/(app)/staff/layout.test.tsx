// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '@/components/shell/AppShell'
import { currentMenuLabel, isDeskPath } from '@/components/shell/menu'
import type { Hospital, Me } from '@/lib/auth/hospital.server'
import StaffLayout from './layout'

// 직원 탭 틀 (staff REQ-7611, design.md 6절). (app)/layout 안쪽의 서버 레이아웃이 문지기가 읽은 나(currentMe)를 보고
// 원장이면 제목 '직원' + 작은 메뉴(StaffNav) + 페이지를, 데스크면 아무것도 그리지 않는다(막힌 화면은 앱 틀의 DeskGate가 그린다).
// 읽기(currentMe)와 주소(usePathname)만 흉내 낸다. 앱 틀·DeskGate·작은 메뉴는 진짜를 쓴다

const { currentMe, pathname, router } = vi.hoisted(() => ({
  currentMe: vi.fn<() => Promise<Me>>(),
  pathname: vi.fn(() => '/staff'),
  router: { replace: vi.fn() },
}))
vi.mock('../currentMe.server', () => ({ currentMe }))
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => router }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/staff/layout.tsx'), 'utf8')

const HOSPITAL: Hospital = {
  id: 'h1',
  name: '가나 정형외과의원',
  applicantName: '홍길동',
  phone: null,
  email: 'manager@example.com',
  status: 'approved',
  createdAt: '2026-10-28T01:23:45+00:00',
}
const OWNER: Me = { email: 'manager@example.com', hospital: HOSPITAL, isAdmin: false }
const DESK: Me = { email: 'desk@example.com', hospital: null, isAdmin: false, desk: { hospitalId: 'h1', hospitalName: '가나 정형외과의원' } }

// 직원 탭 네 주소(design.md 6절)와 작은 메뉴의 지금 칸
const PAGES: Array<[string, string]> = [
  ['/staff', '명단'],
  ['/staff/schedule', '근무표'],
  ['/staff/leave', '휴가'],
  ['/staff/pay', '급여'],
]

// 페이지 자리: 그려지면(=자료를 읽으러 가면) 부른 기록이 남는다
const pageRendered = vi.fn()
function PageProbe() {
  pageRendered()
  return <p>직원 페이지 본문</p>
}

const layout = (children: ReactNode = <PageProbe />) => StaffLayout({ children })

beforeEach(() => {
  currentMe.mockReset()
  currentMe.mockResolvedValue(OWNER)
  pathname.mockReturnValue('/staff')
  router.replace.mockReset()
  pageRendered.mockReset()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true })
})

afterEach(() => {
  cleanup()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

describe('AC-7611.2: 원장 — 제목 "직원" 아래 작은 메뉴, 그 아래 페이지', () => {
  it.each(PAGES)('AC-7611.2: %s — h1 "직원" 하나, 그 아래 nav "직원 안 메뉴"(명단·근무표·휴가·급여, 지금 칸 "%s"), 그 아래 페이지 본문', async (path, label) => {
    pathname.mockReturnValue(path)
    render(await layout())
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings.map((h) => h.textContent)).toEqual(['직원'])
    const nav = screen.getByRole('navigation', { name: '직원 안 메뉴' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['명단', '근무표', '휴가', '급여'])
    expect(within(nav).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual([label])
    const body = screen.getByText('직원 페이지 본문')
    // 차례: 제목 → 작은 메뉴 → 페이지
    expect(headings[0]!.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(nav.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pageRendered).toHaveBeenCalled()
    expect(currentMe).toHaveBeenCalledTimes(1)
  })

  it.each(PAGES)('AC-7611.2: %s — 앱 틀 탭 이름은 "직원"이다(탭 "직원"이 켜진다)', (path) => {
    expect(currentMenuLabel(path)).toBe('직원')
  })

  it('AC-7611.2: 원장 앱 틀 안에서 /staff/pay를 그리면 [더보기] 단추가 "더보기 · 직원"이고 본문에 제목·작은 메뉴·페이지가 있다', async () => {
    pathname.mockReturnValue('/staff/pay')
    render(
      <AppShell hospitalName="가나 정형외과의원" email="manager@example.com" isAdmin={false}>
        {await layout()}
      </AppShell>,
    )
    expect(screen.getByRole('button', { name: /^더보기/ }).textContent).toContain('직원')
    expect(screen.getByRole('heading', { level: 1, name: '직원' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '직원 안 메뉴' })).toBeTruthy()
    expect(screen.getByText('직원 페이지 본문')).toBeTruthy()
  })

  it('AC-7611.2: 원장 화면의 제목은 다른 탭 제목과 같은 모양(title 600 ink)이다', async () => {
    render(await layout())
    const h1 = screen.getByRole('heading', { level: 1, name: '직원' })
    expect((h1.getAttribute('class') ?? '').split(/\s+/)).toEqual(expect.arrayContaining(['text-title', 'font-semibold', 'text-ink']))
  })
})

describe('AC-7611.3: 데스크 — 막힌 화면(DeskGate)만, 직원 페이지는 그리지도 읽지도 않는다', () => {
  it.each(PAGES)('AC-7611.3: %s는 데스크가 열 수 있는 주소가 아니다(isDeskPath 거짓)', (path) => {
    expect(isDeskPath(path)).toBe(false)
  })

  it('AC-7611.3: 데스크(병원 줄 없음 + desk)면 레이아웃은 던지지 않고 아무것도 그리지 않는다 — 제목·작은 메뉴·페이지(자료 읽기) 모두 없다', async () => {
    currentMe.mockResolvedValue(DESK)
    const tree = await layout()
    expect(tree).toBeNull()
    expect(renderToStaticMarkup(<>{tree}</>)).toBe('')
    expect(pageRendered).not.toHaveBeenCalled()
  })

  it.each(PAGES)('AC-7611.3: 데스크 앱 틀 안에서 %s를 열면 막힌 화면이 보이고 직원 제목·작은 메뉴·페이지가 없다', async (path) => {
    currentMe.mockResolvedValue(DESK)
    pathname.mockReturnValue(path)
    render(
      <AppShell hospitalName="가나 정형외과의원" email="desk@example.com" isAdmin={false} desk>
        {await layout()}
      </AppShell>,
    )
    expect(screen.getByRole('heading', { level: 1, name: '데스크 계정은 볼 수 없는 화면이에요' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1, name: '직원' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: '직원 안 메뉴' })).toBeNull()
    expect(screen.queryByText('직원 페이지 본문')).toBeNull()
    expect(pageRendered).not.toHaveBeenCalled()
    // 데스크 탭 띠에는 직원 탭이 없다
    expect(within(screen.getByRole('navigation', { name: '메뉴' })).queryByRole('link', { name: /직원/ })).toBeNull()
  })

  it('AC-7611.3: 병원 줄도 데스크 줄도 없으면(문지기가 막아 오지 않는 길) 빈 화면이 아니라 던진다', async () => {
    currentMe.mockResolvedValue({ email: 'x@example.com', hospital: null, isAdmin: false })
    await expect(layout()).rejects.toThrow()
    expect(pageRendered).not.toHaveBeenCalled()
  })

  it('AC-7611.3: 레이아웃은 서버 부품이고 자료를 읽지 않는다 — use client·supabase·fetch가 없고 currentMe만 읽는다', () => {
    expect(SOURCE).not.toMatch(/['"]use client['"]|supabase|\bfetch\s*\(/)
    expect(SOURCE).toMatch(/from '\.\.\/currentMe\.server'/)
    expect(SOURCE).toMatch(/from '@\/components\/staff\/StaffNav'/)
  })
})

describe('AC-7611.4: 페이지는 옆으로 밀리지 않는다', () => {
  it('AC-7611.4: 레이아웃의 바깥 칸은 min-w-0이라 안의 넓은 표가 페이지 폭을 늘리지 않는다', async () => {
    const { container } = render(await layout())
    const outer = container.firstElementChild as HTMLElement
    expect((outer.getAttribute('class') ?? '').split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'min-w-0']))
  })
})
