// @vitest-environment jsdom
import type { Metadata } from 'next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notReadyFeature, type NotReadyPath } from '@/components/common/notReadyFeatures'
import { MENU } from '@/components/shell/menu'
import { guardPage } from '@/lib/auth/guard.server'
import type { Hospital, Me } from '@/lib/auth/hospital.server'

// 화면마다 브라우저 탭 이름 (ui-90 REQ-402, design.md '탭 이름'). 뿌리 template과 페이지마다의 metadata.title을 읽어 본다.
// 앱 틀 레이아웃의 template(AC-402.3)은 (app)/layout.test.tsx가 본다. 그린 결과(브라우저 탭)는 TASK-19가 세 폭에서 잰다

// 뿌리 레이아웃은 next/font/local을 부른다 → 빌드 밖에서는 같은 모양의 빈 글꼴로 바꾼다
vi.mock('next/font/local', () => ({ default: () => ({ className: '', variable: '--font-pretendard' }) }))
// 병원 상태로 어디로 보낼지는 lib/auth/guard.server.test.ts가 본다. 여기서는 /pending 탭 이름이 받은 상태를 따르는지만
vi.mock('@/lib/auth/guard.server', () => ({ guardPage: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))

const guard = vi.mocked(guardPage)
const HOSPITAL: Hospital = {
  id: 'h1',
  name: '가나 정형외과의원',
  applicantName: '홍길동',
  phone: null,
  email: 'manager@example.com',
  status: 'pending',
  createdAt: '2026-10-28T01:23:45+00:00',
}
const me = (status: Hospital['status']): Me => ({ email: 'manager@example.com', hospital: { ...HOSPITAL, status }, isAdmin: false })

beforeEach(() => {
  guard.mockReset()
})

// 페이지 모듈의 고정 metadata (generateMetadata가 아니라)
const staticTitle = async (load: () => Promise<{ metadata?: Metadata }>) => (await load()).metadata?.title

describe('AC-402.1: 뿌리 레이아웃의 탭 이름 틀', () => {
  it("AC-402.1: src/app/layout.tsx의 metadata.title은 { template: '%s · 병원 업무 도구', default: '병원 업무 도구' }다", async () => {
    expect(await staticTitle(() => import('./layout'))).toEqual({ template: '%s · 병원 업무 도구', default: '병원 업무 도구' })
  })
})

describe('AC-402.2: 입구 페이지의 탭 이름', () => {
  it.each([
    { path: '/', title: '숫자로 보는 우리 의원', load: () => import('./page') },
    { path: '/login', title: '로그인', load: () => import('./login/page') },
    { path: '/signup', title: '가입 신청', load: () => import('./(onboarding)/signup/page') },
  ])('AC-402.2: $path 페이지의 metadata.title은 $title이다', async ({ title, load }) => {
    expect(await staticTitle(load)).toBe(title)
  })

  it('AC-402.2: /pending은 generateMetadata — 승인 대기면 "승인 대기", 거절이면 "가입 승인 안 됨"(guard가 읽은 상태)', async () => {
    const { generateMetadata, metadata } = (await import('./(onboarding)/pending/page')) as {
      generateMetadata?: () => Promise<Metadata>
      metadata?: Metadata
    }
    expect(metadata, '상태마다 달라 고정 metadata를 두지 않는다').toBeUndefined()
    expect(typeof generateMetadata).toBe('function')
    guard.mockResolvedValue(me('pending'))
    expect((await generateMetadata!()).title).toBe('승인 대기')
    guard.mockResolvedValue(me('rejected'))
    expect((await generateMetadata!()).title).toBe('가입 승인 안 됨')
    expect(guard.mock.calls.every(([path]) => path === '/pending')).toBe(true)
  })
})

// 앱 페이지 16개 (탭 14개 + /claim/setup + /admin). 매출 탭은 없다(/revenue는 next.config가 /stats로 넘긴다, stats-revenue AC-4110.2)
const APP_PAGES: Array<{ path: string; title: string; load: () => Promise<{ metadata?: Metadata }> }> = [
  { path: '/dashboard', title: '대시보드', load: () => import('./(app)/dashboard/page') },
  { path: '/stats', title: '통계', load: () => import('./(app)/stats/page') },
  ...(
    [
      ['/staff', () => import('./(app)/staff/page')],
      ['/inventory', () => import('./(app)/inventory/page')],
      ['/contacts', () => import('./(app)/contacts/page')],
    ] as const
  ).map(([path, load]) => ({ path, title: notReadyFeature(path as NotReadyPath).name, load })),
  // 진짜 화면이 생겨 준비 중 목록에 없다(AC-714.3)
  { path: '/ai-report', title: 'AI 리포트', load: () => import('./(app)/ai-report/page') },
  { path: '/forms', title: '서식', load: () => import('./(app)/forms/page') }, // 화면이 있는 탭(forms AC-3501.3)
  { path: '/notices', title: '고시·공지', load: () => import('./(app)/notices/page') }, // 화면이 있는 탭(notices AC-7423.2)
  { path: '/worklog', title: '업무일지', load: () => import('./(app)/worklog/page') },
  { path: '/sunap', title: '수납일지', load: () => import('./(app)/sunap/page') },
  { path: '/calendar', title: '예약', load: () => import('./(app)/calendar/page') }, // 예약 탭(clinic-calendar AC-5905.10)
  { path: '/claim', title: '청구', load: () => import('./(app)/claim/page') },
  { path: '/patients', title: '환자', load: () => import('./(app)/patients/page') }, // 화면이 있는 탭(patients AC-610.1)
  { path: '/claim/setup', title: '비트 PC 연결', load: () => import('./(app)/claim/setup/page') },
  { path: '/settings', title: '설정', load: () => import('./(app)/settings/page') },
  { path: '/admin', title: '가입 승인', load: () => import('./(app)/admin/page') },
]

describe('AC-402.4: 앱 페이지의 탭 이름', () => {
  it.each(APP_PAGES)('AC-402.4: $path 페이지의 metadata.title은 $title이다', async ({ title, load }) => {
    expect(await staticTitle(load)).toBe(title)
  })

  it('AC-402.4·AC-4110.1·AC-4907.2·AC-5905.10: 앱 페이지 표는 MENU의 탭 주소와 /claim/setup·/admin이 빠짐없이 있고, 16개의 탭 이름은 모두 다르다(매출 없음)', async () => {
    expect(APP_PAGES.map((p) => p.path).sort()).toEqual([...MENU.map((m) => m.path), '/claim/setup', '/admin'].sort())
    const titles = await Promise.all(APP_PAGES.map(({ load }) => staticTitle(load)))
    expect(titles).toHaveLength(16)
    expect(titles.every((t) => typeof t === 'string' && t !== '')).toBe(true)
    expect(new Set(titles).size).toBe(16)
    expect(titles).not.toContain('매출')
  })

  it('AC-7423.2: /notices 페이지의 metadata.title은 준비 중 자료가 아니라 페이지가 직접 적은 "고시·공지"다(글 화면 ?id=도 같은 쪽이라 같은 이름)', async () => {
    const { metadata } = await import('./(app)/notices/page')
    expect(metadata.title).toBe('고시·공지')
    expect(notReadyFeature('/notices' as NotReadyPath)).toBeUndefined()
  })

  it('AC-3501.3: /forms 페이지의 metadata.title은 준비 중 자료가 아니라 페이지가 직접 적은 "서식"이다', async () => {
    const { metadata } = await import('./(app)/forms/page')
    expect(metadata.title).toBe('서식')
    expect(notReadyFeature('/forms' as NotReadyPath)).toBeUndefined()
  })
})
