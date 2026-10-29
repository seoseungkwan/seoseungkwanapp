// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guardPage } from '@/lib/auth/guard.server'
import { HospitalReadError, NotSignedInError, readMe, type Hospital, type Me } from '@/lib/auth/hospital.server'
import AppLayout from './layout'

// 앱 화면 틀((app) 레이아웃): 그리기 전에 guard가 병원 상태를 보고, 승인된 사람만 AppShell + IdleLogout 안에 페이지를 그린다
// (design.md '앱 틀'·'데이터 흐름'). 읽기(readMe)만 흉내 내고, guard·gate(어디로 보낼지)는 진짜를 쓴다

vi.mock('@/lib/auth/hospital.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/hospital.server')>()),
  readMe: vi.fn(),
}))
// 진짜 guardPage를 감싸 어떤 경로로 불렀는지만 본다
vi.mock('@/lib/auth/guard.server', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/guard.server')>()
  return { ...real, guardPage: vi.fn(real.guardPage) }
})
// redirect()는 Next에서 던져서 그리기를 멈춘다 → 같은 모양으로 흉내 낸다
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((to: string): never => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
}))
vi.mock('next/navigation', () => ({ redirect, usePathname: () => '/dashboard' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))
// 자동 로그아웃 자체는 IdleLogout.test.tsx가 본다. 여기서는 앱 화면에 하나 붙는지만
vi.mock('@/components/shell/IdleLogout', () => ({ IdleLogout: () => <span data-testid="idle-logout" /> }))

const read = vi.mocked(readMe)
const guard = vi.mocked(guardPage)

const HOSPITAL: Hospital = {
  id: 'h1',
  name: '가나 정형외과의원',
  applicantName: '홍길동',
  phone: null,
  email: 'manager@example.com',
  status: 'approved',
  createdAt: '2026-10-28T01:23:45+00:00',
}
const me = (status: Hospital['status'] | null, isAdmin = false): Me => ({
  email: 'manager@example.com',
  hospital: status === null ? null : { ...HOSPITAL, status },
  isAdmin,
})

beforeEach(() => {
  read.mockReset()
  read.mockResolvedValue(me('approved'))
  guard.mockClear()
  redirect.mockClear()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true })
})

afterEach(() => {
  cleanup()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

const page = <h1>페이지</h1>

describe('(app) 레이아웃', () => {
  it('AC-008.1: 승인된 사용자 — 그리기 전에 guard를 한 번 부르고, 앱 틀(띠·탭 줄) 본문에 페이지를 그린다', async () => {
    render(await AppLayout({ children: page }))
    expect(guard).toHaveBeenCalledTimes(1)
    expect(redirect).not.toHaveBeenCalled()
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('가나 정형외과의원')).toBeTruthy()
    expect(within(banner).getByRole('button', { name: /manager@example\.com/ })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '메뉴' })).toBeTruthy()
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 }).textContent).toBe('페이지')
  })

  it('AC-008.1: guard에 넘기는 경로는 앱 화면 경로(/dashboard) — 병원 상태로만 정해지는 앱 공통 문지기', async () => {
    await AppLayout({ children: page })
    expect(guard).toHaveBeenCalledExactlyOnceWith('/dashboard')
  })

  it('AC-008.2: 관리자면 탭 줄에 [관리자], 아니면 없다', async () => {
    read.mockResolvedValue(me('approved', true))
    render(await AppLayout({ children: page }))
    expect(screen.getByRole('link', { name: '관리자' }).getAttribute('href')).toBe('/admin')
    cleanup()
    read.mockResolvedValue(me('approved', false))
    render(await AppLayout({ children: page }))
    expect(screen.queryByRole('link', { name: '관리자' })).toBeNull()
  })

  it('AC-010.1: 앱 화면마다 자동 로그아웃(IdleLogout)을 하나 붙인다', async () => {
    render(await AppLayout({ children: page }))
    expect(screen.getAllByTestId('idle-logout')).toHaveLength(1)
  })

  it('AC-002.2: 로그인했고 병원 줄이 없으면(/login → /dashboard로 온 사람 포함) /signup으로 보내고 그리지 않는다', async () => {
    read.mockResolvedValue(me(null))
    await expect(AppLayout({ children: page })).rejects.toThrow('NEXT_REDIRECT /signup')
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/signup')
  })

  it('AC-002.3: 대기·거절이면 /pending으로 보내고 그리지 않는다', async () => {
    for (const status of ['pending', 'rejected'] as const) {
      redirect.mockClear()
      read.mockResolvedValue(me(status))
      await expect(AppLayout({ children: page })).rejects.toThrow('NEXT_REDIRECT /pending')
      expect(redirect).toHaveBeenCalledExactlyOnceWith('/pending')
    }
  })

  it('AC-002.1: 로그인이 풀렸으면 /login으로 보낸다', async () => {
    read.mockRejectedValue(new NotSignedInError())
    await expect(AppLayout({ children: page })).rejects.toThrow('NEXT_REDIRECT /login')
  })

  it('AC-002.8: 내 병원 줄 읽기가 실패하면 돌려보내지 않고 그대로 던진다 → 오류 화면(E-PAGE-FAILED)', async () => {
    read.mockRejectedValue(new HospitalReadError('읽기 실패'))
    await expect(AppLayout({ children: page })).rejects.toBeInstanceOf(HospitalReadError)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('AC-002.2: guard가 지나보낸 Me에 승인된 병원 줄이 없으면(올 수 없는 상태) 그리지 않고 던진다 → 오류 화면', async () => {
    guard.mockResolvedValueOnce(me(null))
    await expect(AppLayout({ children: page })).rejects.toThrow()
    guard.mockResolvedValueOnce(me('pending'))
    await expect(AppLayout({ children: page })).rejects.toThrow()
  })

  it('AC-008.1: 요청마다 그린다(로그인 세션으로만 그릴 수 있다 — 빌드 때 미리 그리지 않는다)', async () => {
    const layout = await import('./layout')
    expect((layout as { dynamic?: unknown }).dynamic).toBe('force-dynamic')
  })
})
