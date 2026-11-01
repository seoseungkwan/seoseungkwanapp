// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guardPage } from '@/lib/auth/guard.server'
import type { Hospital, Me } from '@/lib/auth/hospital.server'
import PendingPage, { generateMetadata } from './page'

// 병원 상태로 어디로 보낼지는 lib/auth/guard.server.test.ts가 본다. 여기서는 guard → 화면 연결만 본다
vi.mock('@/lib/auth/guard.server', () => ({ guardPage: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }))

const guard = vi.mocked(guardPage)
const HOSPITAL: Hospital = {
  id: 'h1',
  name: '가나 정형외과의원',
  applicantName: '홍길동',
  phone: '01000001234',
  email: 'manager@example.com',
  status: 'pending',
  createdAt: '2026-10-28T01:23:45+00:00',
}
const me = (hospital: Hospital | null): Me => ({ email: 'manager@example.com', hospital, isAdmin: false })

beforeEach(() => {
  guard.mockReset()
  guard.mockResolvedValue(me(HOSPITAL))
})

afterEach(cleanup)

describe('/pending 화면', () => {
  it('AC-005.1: 그리기 전에 guardPage("/pending")을 한 번 부른다', async () => {
    render(await PendingPage())
    expect(guard).toHaveBeenCalledExactlyOnceWith('/pending')
  })

  it('AC-005.1·AC-216.1: pending — 위쪽 띠(로고·[로그아웃])와 본문에 승인 대기 카드(본문 [로그아웃] 없음)', async () => {
    render(await PendingPage())
    const banner = screen.getByRole('banner')
    expect(banner.textContent).toBe('로그아웃')
    expect(within(banner).getAllByRole('button').map((b) => b.textContent)).toEqual(['로그아웃'])
    expect(within(banner).queryAllByRole('link')).toHaveLength(0)
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('신청을 확인하고 있습니다')
    // 본문 [로그아웃]은 없다(AC-216.1) → 페이지의 [로그아웃]은 위 띠 하나
    expect(within(main).getAllByRole('button').map((b) => b.textContent)).toEqual(['상태 다시 확인'])
    expect(screen.getAllByRole('button', { name: '로그아웃' })).toHaveLength(1)
    // 보낸 신청 내용은 guard가 읽은 내 병원 줄
    const summary = within(main).getByRole('region', { name: '보낸 신청 내용' })
    expect(within(summary).getByText('가나 정형외과의원')).toBeTruthy()
    expect(within(summary).getByText('manager@example.com')).toBeTruthy()
  })

  it('AC-005.3·AC-216.2: rejected — 같은 띠 [로그아웃]과 거절 카드, [상태 다시 확인]·본문 [로그아웃]은 없다', async () => {
    guard.mockResolvedValue(me({ ...HOSPITAL, status: 'rejected' }))
    render(await PendingPage())
    const banner = screen.getByRole('banner')
    expect(banner.textContent).toBe('로그아웃')
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('가입이 승인되지 않았습니다')
    // 본문 [로그아웃]은 없다(AC-216.2) → 페이지의 [로그아웃]은 위 띠 하나
    expect(within(main).getAllByRole('button').map((b) => b.textContent)).toEqual(['다른 계정으로 로그인'])
    expect(screen.getAllByRole('button', { name: '로그아웃' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '상태 다시 확인' })).toBeNull()
  })

  it('AC-402.2: 탭 이름(generateMetadata)은 페이지와 같은 guardPage("/pending") 읽기로 상태를 본다 — 대기 "승인 대기", 거절 "가입 승인 안 됨"', async () => {
    expect(await generateMetadata()).toEqual({ title: '승인 대기' })
    expect(guard).toHaveBeenCalledExactlyOnceWith('/pending')
    guard.mockResolvedValue(me({ ...HOSPITAL, status: 'rejected' }))
    expect(await generateMetadata()).toEqual({ title: '가입 승인 안 됨' })
  })

  it('AC-402.2: 페이지와 generateMetadata는 요청 안에서 한 번 캐시한 같은 읽기(React cache)를 쓴다', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/(onboarding)/pending/page.tsx'), 'utf8')
    expect(source).toMatch(/import \{ cache \} from 'react'/)
    expect(source).toMatch(/= cache\(\(\) => guardPage\('\/pending'\)\)/)
    expect([...source.matchAll(/guardPage\(/g)], 'guardPage는 cache 안 한 곳에서만 부른다').toHaveLength(1)
  })

  it('AC-402.2: 승인됐으면 탭 이름을 정하기 전에도 guardPage가 보낸다(그대로 던진다)', async () => {
    guard.mockRejectedValue(new Error('NEXT_REDIRECT /dashboard'))
    await expect(generateMetadata()).rejects.toThrow('NEXT_REDIRECT /dashboard')
  })

  it('AC-005.2: 승인됐으면 guardPage가 /dashboard로 보낸다(redirect가 던짐) → 그리지 않고 그대로 던진다', async () => {
    guard.mockRejectedValue(new Error('NEXT_REDIRECT /dashboard'))
    await expect(PendingPage()).rejects.toThrow('NEXT_REDIRECT /dashboard')
  })

  it('AC-005.1: guard가 지나보낸 Me에 대기·거절 병원 줄이 없으면(올 수 없는 상태) 그리지 않고 던진다 → 오류 화면', async () => {
    guard.mockResolvedValue(me(null))
    await expect(PendingPage()).rejects.toThrow()
    guard.mockResolvedValue(me({ ...HOSPITAL, status: 'approved' }))
    await expect(PendingPage()).rejects.toThrow()
  })

  it('AC-005.2: 요청마다 그린다(빌드 때 미리 그리지 않는다 — [상태 다시 확인]이 새 상태를 읽어야 한다)', async () => {
    const page = await import('./page')
    expect((page as { dynamic?: unknown }).dynamic).toBe('force-dynamic')
  })

  it('AC-005.1: 페이지는 서버에서 그린다(use client 아님 — guardPage는 server-only)', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/(onboarding)/pending/page.tsx'), 'utf-8')
    expect(source).not.toMatch(/^\s*['"]use client['"]/m)
    expect(source).toContain("guardPage('/pending')")
  })
})
