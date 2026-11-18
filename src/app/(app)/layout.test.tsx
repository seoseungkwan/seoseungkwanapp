// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '@/components/shell/AppShell'
import { guardPage } from '@/lib/auth/guard.server'
import { HospitalReadError, NotSignedInError, readMe, type Hospital, type Me } from '@/lib/auth/hospital.server'
import { currentMe } from './currentMe.server'
import AppLayout, { generateMetadata } from './layout'

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
// 레이아웃과 generateMetadata가 같은 읽기(currentMe)를 쓰는지 보려고 진짜 currentMe를 감싼다.
// 시험(react-server 밖)에서 React cache는 그냥 부르기라 부를 때마다 guard가 한 번 돈다 — 요청 안 한 번 읽기는 Next 서버 몫
vi.mock('./currentMe.server', async (importOriginal) => {
  const real = await importOriginal<typeof import('./currentMe.server')>()
  return { ...real, currentMe: vi.fn(real.currentMe) }
})
// 진짜 AppShell을 감싸 레이아웃이 넘긴 값(병원 이름·메일·관리자·데스크)만 본다 (desk-feedback AC-6305.3)
vi.mock('@/components/shell/AppShell', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/shell/AppShell')>()
  return { ...real, AppShell: vi.fn(real.AppShell) }
})
// redirect()는 Next에서 던져서 그리기를 멈춘다 → 같은 모양으로 흉내 낸다.
// 데스크 앱 틀 안 DeskGate(desk-feedback AC-6306.3)가 쓰는 usePathname·useRouter도 흉내 낸다(같은 router를 늘 돌려준다 — Next처럼)
const { redirect, pathname, router } = vi.hoisted(() => ({
  redirect: vi.fn((to: string): never => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
  pathname: vi.fn(() => '/dashboard'),
  router: { replace: vi.fn() },
}))
vi.mock('next/navigation', () => ({ redirect, usePathname: pathname, useRouter: () => router }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))
// 자동 로그아웃 자체는 IdleLogout.test.tsx가 본다. 여기서는 앱 화면에 하나 붙는지만
vi.mock('@/components/shell/IdleLogout', () => ({ IdleLogout: () => <span data-testid="idle-logout" /> }))

const read = vi.mocked(readMe)
const guard = vi.mocked(guardPage)
const current = vi.mocked(currentMe)
const shell = vi.mocked(AppShell)

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
  current.mockClear()
  shell.mockClear()
  redirect.mockClear()
  pathname.mockReturnValue('/dashboard')
  router.replace.mockClear()
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

  it('AC-303.4: 관리자든 아니든 탭 줄에 [관리자] 링크와 세로 구분선이 없다', async () => {
    for (const isAdmin of [true, false]) {
      read.mockResolvedValue(me('approved', isAdmin))
      render(await AppLayout({ children: page }))
      const nav = screen.getByRole('navigation', { name: '메뉴' })
      expect(within(nav).queryByRole('link', { name: '관리자' }), String(isAdmin)).toBeNull()
      expect(within(nav).queryByText('관리자'), String(isAdmin)).toBeNull()
      expect(nav.querySelectorAll('[aria-hidden="true"].w-px'), String(isAdmin)).toHaveLength(0)
      expect(screen.queryByRole('link', { name: '관리자' }), String(isAdmin)).toBeNull()
      cleanup()
    }
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

  it("AC-402.3: generateMetadata — 탭 이름 틀은 { template: '%s · <의원 이름>', default: '<의원 이름>' }이고 currentMe(guard '/dashboard') 읽기를 쓴다", async () => {
    expect(await generateMetadata()).toEqual({ title: { template: '%s · 가나 정형외과의원', default: '가나 정형외과의원' } })
    expect(current).toHaveBeenCalledTimes(1)
    expect(guard).toHaveBeenCalledExactlyOnceWith('/dashboard')
  })

  it('AC-402.3: 레이아웃 그리기와 generateMetadata는 같은 읽기 currentMe를 같이 쓴다(레이아웃이 guard를 따로 부르지 않는다)', async () => {
    await generateMetadata()
    render(await AppLayout({ children: page }))
    expect(current).toHaveBeenCalledTimes(2)
    expect(guard.mock.calls).toEqual([['/dashboard'], ['/dashboard']])
    expect(within(screen.getByRole('banner')).getByText('가나 정형외과의원')).toBeTruthy()
  })

  it("AC-402.3: currentMe는 요청 안에서 한 번 캐시한 guardPage('/dashboard') 읽기다(React cache, 서버 전용)", () => {
    const source = readFileSync(join(process.cwd(), 'src/app/(app)/currentMe.server.ts'), 'utf8')
    expect(source).toMatch(/^import 'server-only'$/m)
    expect(source).toMatch(/import \{ cache \} from 'react'/)
    expect(source).toMatch(/export const currentMe = cache\(\(\) => guardPage\('\/dashboard'\)\)/)
  })

  it('AC-402.3: 승인 전이면 generateMetadata도 지금처럼 guard가 보낸다(대기·거절 → /pending, 병원 줄 없음 → /signup)', async () => {
    read.mockResolvedValue(me('pending'))
    await expect(generateMetadata()).rejects.toThrow('NEXT_REDIRECT /pending')
    read.mockResolvedValue(me(null))
    await expect(generateMetadata()).rejects.toThrow('NEXT_REDIRECT /signup')
  })

  it('AC-008.1: 요청마다 그린다(로그인 세션으로만 그릴 수 있다 — 빌드 때 미리 그리지 않는다)', async () => {
    const layout = await import('./layout')
    expect((layout as { dynamic?: unknown }).dynamic).toBe('force-dynamic')
  })
})

// desk-feedback REQ-6305: 데스크(내 병원 줄 없음 + 데스크 줄)는 그 병원 이름으로 데스크 앱 틀(AppShell desk)을 그린다.
// 세 탭·칩·막힌 화면·첫 화면 바꾸기는 AppShell 안 DeskGate가 한다(shell.test.tsx·DeskGate.test.tsx). 여기서는 레이아웃이 넘기는 값과 이어짐만 본다
describe('(app) 레이아웃 — 데스크 (desk-feedback AC-6305.3)', () => {
  const DESK = { hospitalId: 'h1', hospitalName: '가나 정형외과의원' }
  const deskMe = (isAdmin = false): Me => ({ email: 'desk@example.com', hospital: null, isAdmin, desk: DESK })
  const shellProps = () => {
    expect(shell).toHaveBeenCalled()
    return shell.mock.calls[shell.mock.calls.length - 1]![0]
  }

  it('AC-6305.3: 데스크면 AppShell에 그 병원 이름·로그인 메일·desk 참·관리자 거짓을 넘기고, 보내지 않는다(guard는 /dashboard로 한 번)', async () => {
    read.mockResolvedValue(deskMe())
    pathname.mockReturnValue('/sunap')
    render(await AppLayout({ children: page }))
    expect(redirect).not.toHaveBeenCalled()
    expect(guard).toHaveBeenCalledExactlyOnceWith('/dashboard')
    expect(shellProps()).toMatchObject({ hospitalName: '가나 정형외과의원', email: 'desk@example.com', isAdmin: false, desk: true })
  })

  it('AC-6305.3: admins에 있는 데스크여도 관리자 거짓을 넘긴다', async () => {
    read.mockResolvedValue(deskMe(true))
    pathname.mockReturnValue('/sunap')
    render(await AppLayout({ children: page }))
    expect(shellProps()).toMatchObject({ isAdmin: false, desk: true })
  })

  it('AC-6305.3: 데스크 앱 틀 — 띠에 그 병원 이름·데스크 칩, 탭은 업무일지·수납일지·예약 셋, 세 탭 주소(/sunap)에서는 본문에 페이지를 그린다', async () => {
    read.mockResolvedValue(deskMe())
    pathname.mockReturnValue('/sunap')
    render(await AppLayout({ children: page }))
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('가나 정형외과의원')).toBeTruthy()
    const account = within(banner).getByRole('button', { name: /desk@example\.com/ })
    expect(within(account).getByText('데스크')).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: '메뉴' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['업무일지', '수납일지', '예약'])
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 }).textContent).toBe('페이지')
    expect(screen.getAllByTestId('idle-logout')).toHaveLength(1)
  })

  it('AC-6305.3: 데스크가 로그인 뒤 첫 주소(/dashboard)에 오면 레이아웃은 보내지 않고 앱 틀의 DeskGate가 /sunap으로 바꾼다(그동안 본문은 비어 있다)', async () => {
    read.mockResolvedValue(deskMe())
    pathname.mockReturnValue('/dashboard')
    render(await AppLayout({ children: page }))
    expect(redirect).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/sunap')
    expect(within(screen.getByRole('main')).queryByText('페이지')).toBeNull()
  })

  it('AC-6305.3: 데스크가 막힌 주소(/stats)에 있으면 본문 대신 막힌 화면이다(앱 틀이 그린다)', async () => {
    read.mockResolvedValue(deskMe())
    pathname.mockReturnValue('/stats')
    render(await AppLayout({ children: page }))
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('데스크 계정은 볼 수 없는 화면이에요')
    expect(within(main).queryByText('페이지')).toBeNull()
  })

  it("AC-6305.3: 데스크의 generateMetadata — 탭 이름 틀은 '%s · {그 병원 이름}'", async () => {
    read.mockResolvedValue(deskMe())
    expect(await generateMetadata()).toEqual({ title: { template: '%s · 가나 정형외과의원', default: '가나 정형외과의원' } })
  })

  it('AC-6305.3: 승인된 원장은 지금과 같다 — 병원 이름·관리자 값 그대로, desk는 참이 아니다', async () => {
    read.mockResolvedValue(me('approved', true))
    render(await AppLayout({ children: page }))
    const props = shellProps()
    expect(props).toMatchObject({ hospitalName: '가나 정형외과의원', email: 'manager@example.com', isAdmin: true })
    expect(props.desk).toBeFalsy()
    expect(screen.getByRole('navigation', { name: '메뉴' })).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('AC-6305.3: 승인된 병원 줄이 있으면 데스크 칸이 있어도 원장으로 그린다(병원 줄이 먼저)', async () => {
    guard.mockResolvedValueOnce({ ...me('approved'), desk: { hospitalId: 'h9', hospitalName: '다른 의원' } })
    render(await AppLayout({ children: page }))
    const props = shellProps()
    expect(props.hospitalName).toBe('가나 정형외과의원')
    expect(props.desk).toBeFalsy()
  })

  it('AC-6305.3: 그 밖의 사용자는 지금처럼 그리지 않는다 — 대기·거절 병원 줄이 있으면 데스크 칸이 있어도 던진다', async () => {
    for (const status of ['pending', 'rejected'] as const) {
      guard.mockResolvedValueOnce({ ...me(status), desk: DESK })
      await expect(AppLayout({ children: page }), status).rejects.toThrow()
      guard.mockResolvedValueOnce({ ...me(status), desk: DESK })
      await expect(generateMetadata(), status).rejects.toThrow()
    }
    expect(shell).not.toHaveBeenCalled()
  })
})
