// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guardPage } from '@/lib/auth/guard.server'
import type { Me } from '@/lib/auth/hospital.server'
import SignupPage from './page'

// 병원 상태로 어디로 보낼지는 lib/auth/guard.server.test.ts가 본다. 여기서는 guard → 화면 연결만 본다
vi.mock('@/lib/auth/guard.server', () => ({ guardPage: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ from: vi.fn(), auth: { signOut: vi.fn() } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }))

const guard = vi.mocked(guardPage)
const me = (email: string): Me => ({ email, hospital: null, isAdmin: false })

beforeEach(() => {
  guard.mockReset()
  guard.mockResolvedValue(me('manager@example.com'))
})

afterEach(cleanup)

describe('/signup 화면', () => {
  it('AC-004.2: 그리기 전에 guardPage("/signup")을 한 번 부른다', async () => {
    render(await SignupPage())
    expect(guard).toHaveBeenCalledExactlyOnceWith('/signup')
  })

  it('AC-004.2: 위쪽 띠(로고·[서비스 이름]만)와 본문 안에 가입 신청 폼, 구글 계정 칸에는 로그인한 이메일을 읽기 전용으로', async () => {
    render(await SignupPage())
    const banner = screen.getByRole('banner')
    expect(banner.textContent).toBe('[서비스 이름]')
    // 목업 가입 신청 머리띠에는 단추·링크가 없다([다른 계정으로 로그인]은 폼 아래)
    expect(within(banner).queryAllByRole('button')).toHaveLength(0)
    expect(within(banner).queryAllByRole('link')).toHaveLength(0)
    const main = screen.getByRole('main')
    expect(within(main).getByRole('heading', { level: 1 }).textContent).toBe('가입 신청')
    const email = within(main).getByRole<HTMLInputElement>('textbox', { name: '구글 계정' })
    expect(email.value).toBe('manager@example.com')
    expect(email.readOnly).toBe(true)
    expect(within(main).getByRole('button', { name: '가입 신청' })).toBeTruthy()
    expect(within(main).getByRole('button', { name: '다른 계정으로 로그인' })).toBeTruthy()
  })

  it('AC-004.2: 이메일은 Me에서 받은 그대로 값으로만 넣는다(HTML로 그리지 않는다)', async () => {
    const odd = '"><img src=x onerror=alert(1)>@fake.test'
    guard.mockResolvedValue(me(odd))
    render(await SignupPage())
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '구글 계정' }).value).toBe(odd)
    expect(document.querySelector('img')).toBeNull()
  })

  it('AC-004.2: guardPage가 다른 곳으로 보내면(redirect가 던짐) 그리지 않고 그대로 던진다', async () => {
    guard.mockRejectedValue(new Error('NEXT_REDIRECT /pending'))
    await expect(SignupPage()).rejects.toThrow('NEXT_REDIRECT /pending')
  })

  it('AC-004.2: 요청마다 그린다(빌드 때 미리 그리지 않는다 — 로그인 세션이 있어야 guard가 볼 수 있다)', async () => {
    const page = await import('./page')
    expect((page as { dynamic?: unknown }).dynamic).toBe('force-dynamic')
  })

  it('AC-004.2: 페이지는 서버에서 그린다(use client 아님 — guardPage는 server-only)', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/(onboarding)/signup/page.tsx'), 'utf-8')
    expect(source).not.toMatch(/^\s*['"]use client['"]/m)
    expect(source).toContain("guardPage('/signup')")
  })
})
