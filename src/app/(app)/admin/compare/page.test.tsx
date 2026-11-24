import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ComparePage } from '@/components/admin/compare/ComparePage'
import { todayInKorea } from '@/lib/analytics/dates'
import { guardPage } from '@/lib/auth/guard.server'
import { HospitalReadError, NotSignedInError, readMe, type Hospital, type Me } from '@/lib/auth/hospital.server'
import AdminComparePage, { dynamic, metadata } from './page'

// /admin/compare 의원 비교 페이지(spec admin-view REQ-8017 AC-8017.1, design.md '의원 비교 — 불러오기와 한도'·'흐름').
// (app) 레이아웃은 지금 경로를 모르고 늘 '/dashboard'로 문지기를 부른다 → 관리자만 여는 이 페이지는 스스로 '/admin/compare'로 부른다
// (gate.ts ADMIN_PATHS가 /admin 아래를 관리자 경로로 본다). 읽기(readMe)만 흉내 내고 guard·gate는 진짜를 쓴다.
// 의원 숫자는 브라우저(ComparePage)가 정의자 함수로 읽는다 — 서버는 읽지 않는다(ADR-004·ADR-047)

vi.mock('@/lib/auth/hospital.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/hospital.server')>()),
  readMe: vi.fn(),
}))
vi.mock('@/lib/auth/guard.server', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/guard.server')>()
  return { ...real, guardPage: vi.fn(real.guardPage) }
})
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((to: string): never => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
}))
vi.mock('next/navigation', () => ({ redirect }))
const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const read = vi.mocked(readMe)
const guard = vi.mocked(guardPage)
const SOURCE = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')

const HOSPITAL: Hospital = {
  id: 'h1',
  name: '가나 정형외과의원',
  applicantName: '홍길동',
  phone: null,
  email: 'admin@example.com',
  status: 'approved',
  createdAt: '2026-10-28T01:23:45+00:00',
}
const me = (status: Hospital['status'] | null, isAdmin: boolean): Me => ({
  email: 'admin@example.com',
  hospital: status === null ? null : { ...HOSPITAL, status },
  isAdmin,
})

beforeEach(() => {
  read.mockReset()
  read.mockResolvedValue(me('approved', true))
  guard.mockClear()
  redirect.mockClear()
  supabaseBrowser.mockClear()
})

describe('AC-8017.1 /admin/compare 문지기', () => {
  it('AC-8017.1: 승인된 관리자면 연다 — 의원 비교 화면(ComparePage) 하나만 돌려주고 오늘(한국 날짜)을 넘긴다', async () => {
    const page = (await AdminComparePage()) as ReactElement<{ today: string }>
    expect(page.type).toBe(ComparePage)
    expect(Object.keys(page.props)).toEqual(['today'])
    expect(page.props.today).toBe(todayInKorea())
    expect(redirect).not.toHaveBeenCalled()
  })

  it("AC-8017.1: 그리기 전에 문지기를 '/admin/compare' 경로로 한 번 부른다", async () => {
    await AdminComparePage()
    expect(guard).toHaveBeenCalledExactlyOnceWith('/admin/compare')
    const at = SOURCE.indexOf("await guardPage('/admin/compare')")
    expect(at).toBeGreaterThan(-1)
    expect(SOURCE.indexOf('return <', at)).toBeGreaterThan(at)
    expect(SOURCE.slice(0, at)).not.toMatch(/return </)
  })

  it('AC-8017.1: 승인됐지만 관리자가 아니면 /dashboard로 보내고 그리지 않는다', async () => {
    read.mockResolvedValue(me('approved', false))
    await expect(AdminComparePage()).rejects.toThrow('NEXT_REDIRECT /dashboard')
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/dashboard')
  })

  it('AC-8017.1: 대기·거절이면 관리자라도 /pending, 병원 줄이 없으면 /signup, 로그인이 풀렸으면 /login', async () => {
    for (const status of ['pending', 'rejected'] as const) {
      redirect.mockClear()
      read.mockResolvedValue(me(status, true))
      await expect(AdminComparePage()).rejects.toThrow('NEXT_REDIRECT /pending')
    }
    read.mockResolvedValue(me(null, true))
    await expect(AdminComparePage()).rejects.toThrow('NEXT_REDIRECT /signup')
    read.mockRejectedValue(new NotSignedInError())
    await expect(AdminComparePage()).rejects.toThrow('NEXT_REDIRECT /login')
  })

  it('AC-8017.1: 내 병원·관리자 줄 읽기가 실패하면 돌려보내지 않고 그대로 던진다 → 오류 화면(E-PAGE-FAILED)', async () => {
    read.mockRejectedValue(new HospitalReadError('읽기 실패'))
    await expect(AdminComparePage()).rejects.toBeInstanceOf(HospitalReadError)
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('AC-8017.1 /admin/compare 그리기', () => {
  it("AC-8017.1: 브라우저 탭 이름은 '화면 글자'의 제목 `의원 비교`이고, 요청의 로그인 세션으로만 그린다(force-dynamic)", () => {
    expect(metadata.title).toBe('의원 비교')
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-8017.1·AC-8017.4: 서버는 의원 숫자를 읽지 않는다 — Supabase·브라우저 함수·fetch를 부르지 않고 문지기만 부른다', async () => {
    await AdminComparePage()
    expect(supabaseBrowser).not.toHaveBeenCalled()
    expect(SOURCE).not.toMatch(/@\/lib\/supabase|@\/lib\/storage|@\/lib\/auth\/admin|readAdminRows|listViewHospitals|\bfetch\(|'use client'/)
    expect(SOURCE).toMatch(/from '@\/lib\/auth\/guard\.server'/)
  })

  it('AC-8017.1: 서버 그리기 — 관리자 표시 → h1 `의원 비교` → 관리자 안 메뉴(의원 비교가 지금 화면), 읽기는 브라우저가 연 뒤에 한다', async () => {
    const html = renderToStaticMarkup((await AdminComparePage()) as ReactElement)
    const at = [/관리자<\/p>/, /<h1\b[^>]*>의원 비교<\/h1>/, /<nav\b[^>]*aria-label="관리자 안 메뉴"/].map((re) => html.search(re))
    for (const i of at) expect(i).toBeGreaterThan(-1)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html).toMatch(/<a\b[^>]*href="\/admin\/compare"[^>]*aria-current="page"[^>]*>의원 비교<\/a>|<a\b[^>]*aria-current="page"[^>]*href="\/admin\/compare"[^>]*>의원 비교<\/a>/)
    expect(html).toContain('data-st-canvas')
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })
})
