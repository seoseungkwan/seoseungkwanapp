import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApplications } from '@/components/admin/AdminApplications'
import { AdminViewLog } from '@/components/admin/AdminViewLog'
import { InstallFilesAdmin } from '@/components/admin/InstallFilesAdmin'
import { guardPage } from '@/lib/auth/guard.server'
import { HospitalReadError, NotSignedInError, readMe, type Hospital, type Me } from '@/lib/auth/hospital.server'
import AdminPage, { dynamic, metadata } from './page'

// /admin 페이지 (REQ-007, AC-002.5, design.md '데이터 흐름' `(app)/admin/page.tsx # 관리자만`).
// (app) 레이아웃은 지금 경로를 모르고 늘 '/dashboard'로 문지기를 부른다 → 관리자만 여는 이 페이지는 스스로 '/admin'으로 부른다.
// 읽기(readMe)만 흉내 내고, guard·gate(어디로 보낼지)는 진짜를 쓴다.
// 설치 파일 칸(helper-download REQ-5104)은 가입 승인 위에 둔다. 그 목록도 브라우저가 읽는다

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
vi.mock('next/navigation', () => ({ redirect }))
// 목록은 브라우저(AdminApplications)가 읽는다. 여기서는 Supabase에 닿지 않는지 본다
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

describe('/admin 페이지 문지기', () => {
  it('AC-002.5: 승인된 관리자(admins에 있음)면 연다 — 가입 승인 화면(AdminApplications)을 그린다', async () => {
    const page = (await AdminPage()) as ReactElement
    expect(page.type).toBe(AdminApplications)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('AC-002.5: 그리기 전에 문지기를 \'/admin\' 경로로 한 번 부른다(레이아웃의 \'/dashboard\' 판정만으로는 관리자를 가리지 못한다)', async () => {
    await AdminPage()
    expect(guard).toHaveBeenCalledExactlyOnceWith('/admin')
  })

  it('AC-002.5: 승인됐지만 관리자가 아니면(admins에 없음) /dashboard로 보내고 그리지 않는다', async () => {
    read.mockResolvedValue(me('approved', false))
    await expect(AdminPage()).rejects.toThrow('NEXT_REDIRECT /dashboard')
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/dashboard')
  })

  it('AC-002.2: 로그인했고 병원 줄이 없으면 관리자라도 /signup으로 보낸다', async () => {
    for (const isAdmin of [false, true]) {
      redirect.mockClear()
      read.mockResolvedValue(me(null, isAdmin))
      await expect(AdminPage()).rejects.toThrow('NEXT_REDIRECT /signup')
      expect(redirect).toHaveBeenCalledExactlyOnceWith('/signup')
    }
  })

  it('AC-002.3: 대기·거절이면 관리자라도 /pending으로 보낸다', async () => {
    for (const status of ['pending', 'rejected'] as const) {
      for (const isAdmin of [false, true]) {
        redirect.mockClear()
        read.mockResolvedValue(me(status, isAdmin))
        await expect(AdminPage()).rejects.toThrow('NEXT_REDIRECT /pending')
        expect(redirect).toHaveBeenCalledExactlyOnceWith('/pending')
      }
    }
  })

  it('AC-002.1: 로그인이 풀렸으면 /login으로 보낸다', async () => {
    read.mockRejectedValue(new NotSignedInError())
    await expect(AdminPage()).rejects.toThrow('NEXT_REDIRECT /login')
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/login')
  })

  it('AC-002.8: 내 병원·관리자 줄 읽기가 실패하면 돌려보내지 않고 그대로 던진다 → 오류 화면(E-PAGE-FAILED)', async () => {
    read.mockRejectedValue(new HospitalReadError('읽기 실패'))
    await expect(AdminPage()).rejects.toBeInstanceOf(HospitalReadError)
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('/admin 페이지 그리기', () => {
  it('AC-007.1: 요청의 로그인 세션으로만 그린다 — 빌드 때 미리 그리지 않는다(force-dynamic)', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-007.1: 서버는 신청 목록을 읽지 않는다 — 목록은 브라우저가 RLS로 읽는다(ADR-004: 서버는 내 줄·관리자 줄만)', async () => {
    await AdminPage()
    expect(supabaseBrowser).not.toHaveBeenCalled()
    expect(SOURCE).not.toMatch(/@\/lib\/supabase|@\/lib\/auth\/admin'|listApplications|setHospitalStatus|\bfetch\(|'use client'/)
    expect(SOURCE).toMatch(/from '@\/lib\/auth\/guard\.server'/)
  })

  it('AC-007.1·AC-013.2·AC-5104.3·AC-8012.3: 앱 틀을 한 번 더 그리지 않는다 — 가입 승인(AdminApplications) 하나만 돌려주고 설치 파일 칸은 그 top 자리, 본 기록 칸은 bottom 자리로 넘긴다(띠·탭·<main>은 (app)/layout 몫)', async () => {
    const page = (await AdminPage()) as ReactElement<{ top?: ReactNode; bottom?: ReactNode }>
    expect(page.type).toBe(AdminApplications)
    expect(Object.keys(page.props)).toEqual(['top', 'bottom'])
    expect((page.props.top as ReactElement).type).toBe(InstallFilesAdmin)
    expect((page.props.bottom as ReactElement).type).toBe(AdminViewLog)
  })

  it('AC-8012.3·AC-8012.4: 서버 그리기 차례 — h1 `가입 승인` → 안쪽 메뉴(관리자 안 메뉴) → 설치 파일 칸 → 본 기록 칸, 목록·본 기록은 읽지 않는다', async () => {
    const html = renderToStaticMarkup((await AdminPage()) as ReactElement)
    const at = [
      /<h1\b[^>]*>가입 승인<\/h1>/,
      /<nav\b[^>]*aria-label="관리자 안 메뉴"/,
      /<h2\b[^>]*>설치 파일<\/h2>/,
      /<h2\b[^>]*>본 기록<\/h2>/,
    ].map((re) => html.search(re))
    for (const i of at) expect(i).toBeGreaterThan(-1)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(html).toMatch(/<a\b[^>]*href="\/admin\/compare"[^>]*>의원 비교<\/a>/)
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })

  it("AC-5104.1·AC-5104.3: 제목 '가입 승인'(h1)이 맨 위이고 그 아래 '설치 파일' 칸 — 서버 그리기에서 h1이 '설치 파일' 제목보다 먼저 나오고, 목록은 읽지 않는다", async () => {
    const html = renderToStaticMarkup((await AdminPage()) as ReactElement)
    const install = html.search(/<h2\b[^>]*>설치 파일<\/h2>/)
    const applications = html.search(/<h1\b[^>]*>가입 승인<\/h1>/)
    expect(applications).toBeGreaterThan(-1)
    expect(install).toBeGreaterThan(applications)
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })
})

describe('/admin 페이지 이름 (ui-90 REQ-417)', () => {
  it('AC-417.1: 탭 이름(metadata)과 h1이 같은 "가입 승인"이고 h1 바로 위에 "관리자" 표시가 있다. "가입 신청" h1·"병원 이름"·"니다." 글자가 없다', async () => {
    expect(metadata.title).toBe('가입 승인')
    // 서버 그리기(effect 없음) → 목록은 읽지 않고 제목 묶음만 나온다
    const html = renderToStaticMarkup((await AdminPage()) as ReactElement)
    expect(html).toMatch(/<p\b[^>]*><svg\b[^>]*>.*?<\/svg>관리자<\/p><h1\b[^>]*>가입 승인<\/h1>/)
    expect(html).not.toMatch(/<h1\b[^>]*>가입 신청<\/h1>/)
    expect(html).not.toMatch(/병원 이름|니다\./)
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })
})
