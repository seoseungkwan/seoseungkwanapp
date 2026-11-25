// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../../next.config'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { NotFoundScreen } from '@/components/common/NotFoundScreen'
import type { Hospital, Me } from '@/lib/auth/hospital.server'
import { currentMe } from './(app)/currentMe.server'

// 없는 주소 화면의 라우트 파일 (ui-90 REQ-410, design.md '없는 주소 (TASK-7)'·'결정과 트레이드오프' 앱 안 404).
// - 앱 안: (app)/[...rest]/page.tsx가 notFound()를 부른다 → 앱 틀 안의 (app)/not-found.tsx가 NotFoundScreen(app)을 그린다
// - 밖: 뿌리 not-found.tsx가 한 칸 AuthFrame 안에 NotFoundScreen(outside)를 그린다
// 화면 모양 자체는 components/common/NotFoundScreen.test.tsx가 본다. 여기서는 파일이 그 모양을 그리는지 · 탭 이름 · 라우트 자리만.
// AuthFrame 머리(로고)는 따로 보지 않는다(ui-90 TASK-16이 로고를 링크로 바꾼다) — 같은 AuthFrame으로 그린 것과 견준다

// notFound()는 Next에서 던져서 그리기를 멈춘다 → 같은 모양으로 흉내 내고 불렀는지 본다
const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('next/navigation', () => ({
  notFound,
  redirect: vi.fn(),
  usePathname: () => '/claim/close',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
// 뿌리 레이아웃은 next/font/local을 부른다 → 빌드 밖에서는 같은 모양의 빈 글꼴로 바꾼다
vi.mock('next/font/local', () => ({ default: () => ({ className: '', variable: '--font-pretendard' }) }))
// 앱 틀 레이아웃의 탭 이름 틀만 본다 → 읽기(currentMe)와 앱 틀 부품은 흉내 낸다(앱 틀 자체는 shell 시험이 본다)
vi.mock('./(app)/currentMe.server', () => ({ currentMe: vi.fn() }))
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/shell/IdleLogout', () => ({ IdleLogout: () => null }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
const importsOf = (rel: string) => [...code(rel).matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1])

const ROOT_NOT_FOUND = 'src/app/not-found.tsx'
const APP_NOT_FOUND = 'src/app/(app)/not-found.tsx'
const CATCH_ALL = 'src/app/(app)/[...rest]/page.tsx'
const TITLE = '찾는 화면이 없어요'

type PageModule = { default: ComponentType; metadata?: Metadata }
const loadRootNotFound = () => import('./not-found') as Promise<PageModule>
const loadAppNotFound = () => import('./(app)/not-found') as Promise<PageModule>
const loadCatchAll = () => import('./(app)/[...rest]/page') as Promise<PageModule>

const HOSPITAL: Hospital = {
  id: 'h1',
  name: '가나 정형외과의원',
  applicantName: '홍길동',
  phone: null,
  email: 'manager@example.com',
  status: 'approved',
  createdAt: '2026-10-28T01:23:45+00:00',
}
const APPROVED: Me = { email: 'manager@example.com', hospital: HOSPITAL, isAdmin: false }

// Next가 화면 metadata.title을 레이아웃의 title.template에 넣는 것과 같게
const applyTemplate = (layoutTitle: Metadata['title'], pageTitle: Metadata['title']) => {
  expect(typeof pageTitle).toBe('string')
  const template = (layoutTitle as { template?: string } | null | undefined)?.template
  expect(typeof template).toBe('string')
  return template!.replace('%s', pageTitle as string)
}

beforeEach(() => {
  notFound.mockClear()
  vi.mocked(currentMe).mockReset()
  vi.mocked(currentMe).mockResolvedValue(APPROVED)
})

describe('AC-410.1: 앱 안 없는 주소 — (app)/[...rest]가 notFound()를 부르고 (app)/not-found가 앱 안 모양을 그린다', () => {
  it('AC-410.1: (app)/[...rest]/page.tsx가 있고 그리면 notFound()를 한 번 부른다', async () => {
    expect(existsSync(join(ROOT, CATCH_ALL)), CATCH_ALL).toBe(true)
    const Page = (await loadCatchAll()).default as unknown as () => unknown
    expect(() => Page()).toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledTimes(1)
    expect(importsOf(CATCH_ALL)).toContain('next/navigation')
  })

  it('AC-410.1: (app)/not-found.tsx는 NotFoundScreen(앱 안 모양)만 그린다', async () => {
    expect(existsSync(join(ROOT, APP_NOT_FOUND)), APP_NOT_FOUND).toBe(true)
    const NotFound = (await loadAppNotFound()).default
    expect(renderToStaticMarkup(<NotFound />)).toBe(renderToStaticMarkup(<NotFoundScreen where="app" />))
  })
})

describe('AC-410.2: 밖 없는 주소 — 뿌리 not-found가 한 칸 AuthFrame 안에 밖 모양을 그린다', () => {
  it('AC-410.2: 뿌리 not-found.tsx는 aside 없는 AuthFrame 안에 NotFoundScreen(밖 모양)을 그린다', async () => {
    const NotFound = (await loadRootNotFound()).default
    expect(renderToStaticMarkup(<NotFound />)).toBe(
      renderToStaticMarkup(
        <AuthFrame>
          <NotFoundScreen where="outside" />
        </AuthFrame>,
      ),
    )
  })

  it('AC-410.2: 뿌리 not-found.tsx는 클래스를 두지 않고 Supabase·문지기·fetch를 쓰지 않는다', () => {
    expect(code(ROOT_NOT_FOUND)).not.toMatch(/className=/)
    for (const from of importsOf(ROOT_NOT_FOUND)) expect(from).not.toMatch(/supabase|guard|lib\/auth|\.server/)
    expect(code(ROOT_NOT_FOUND)).not.toMatch(/\bfetch\s*\(|\bcookies\s*\(|\bheaders\s*\(/)
  })
})

describe('AC-410.4: 두 404의 탭 이름 — "찾는 화면이 없어요"', () => {
  it('AC-410.4: 뿌리 not-found의 metadata.title은 "찾는 화면이 없어요" → 탭 이름 "찾는 화면이 없어요 · 병원 업무 도구"', async () => {
    const { metadata } = await loadRootNotFound()
    expect(metadata?.title).toBe(TITLE)
    const layout = (await import('./layout')) as { metadata?: Metadata }
    expect(applyTemplate(layout.metadata?.title, metadata?.title)).toBe('찾는 화면이 없어요 · 병원 업무 도구')
  })

  it('AC-410.4: (app)/not-found와 (app)/[...rest]의 metadata.title은 "찾는 화면이 없어요" → 탭 이름 "찾는 화면이 없어요 · <의원 이름>"', async () => {
    const appLayout = (await import('./(app)/layout')) as { generateMetadata: () => Promise<Metadata> }
    const layoutTitle = (await appLayout.generateMetadata()).title
    for (const load of [loadAppNotFound, loadCatchAll]) {
      const { metadata } = await load()
      expect(metadata?.title).toBe(TITLE)
      expect(applyTemplate(layoutTitle, metadata?.title)).toBe('찾는 화면이 없어요 · 가나 정형외과의원')
    }
  })
})

describe('AC-410.5: 잡는 페이지보다 구체적인 기존 주소는 모두 자기 페이지가 있다', () => {
  // 탭 주소 12개(MENU) + 처음 화면 · 로그인 · 가입 · 대기 · 로그인 콜백 · 비트 PC 연결 · 관리자. /revenue는 없다(아래 AC-4110.2)
  const ROUTES: Array<[string, string]> = [
    ['/', 'src/app/page.tsx'],
    ['/login', 'src/app/login/page.tsx'],
    ['/signup', 'src/app/(onboarding)/signup/page.tsx'],
    ['/pending', 'src/app/(onboarding)/pending/page.tsx'],
    ['/auth/callback', 'src/app/auth/callback/route.ts'],
    ['/dashboard', 'src/app/(app)/dashboard/page.tsx'],
    ['/stats', 'src/app/(app)/stats/page.tsx'],
    ['/claim', 'src/app/(app)/claim/page.tsx'],
    ['/notices', 'src/app/(app)/notices/page.tsx'],
    ['/notices/week', 'src/app/(app)/notices/week/page.tsx'], // 고시·공지 주간 모음(notices REQ-7421)
    ['/patients', 'src/app/(app)/patients/page.tsx'],
    ['/ai-report', 'src/app/(app)/ai-report/page.tsx'],
    ['/forms', 'src/app/(app)/forms/page.tsx'],
    ['/staff', 'src/app/(app)/staff/page.tsx'],
    ['/worklog', 'src/app/(app)/worklog/page.tsx'],
    ['/inventory', 'src/app/(app)/inventory/page.tsx'],
    ['/contacts', 'src/app/(app)/contacts/page.tsx'],
    ['/claim/setup', 'src/app/(app)/claim/setup/page.tsx'],
    ['/settings', 'src/app/(app)/settings/page.tsx'],
    ['/admin', 'src/app/(app)/admin/page.tsx'],
    ['/admin/compare', 'src/app/(app)/admin/compare/page.tsx'], // 의원 비교(admin-view AC-8017.1)
    ['/library', 'src/app/(app)/library/page.tsx'], // 자료실(library AC-8105.1)
  ]

  it.each(ROUTES)('AC-410.5: %s는 자기 라우트 파일(%s)이 있다', (_path, file) => {
    expect(existsSync(join(ROOT, file)), file).toBe(true)
  })

  it('AC-4110.2: /revenue는 자기 라우트 파일이 없다(페이지·시험·폴더 모두). next.config가 /stats로 넘긴다', () => {
    expect(existsSync(join(ROOT, 'src/app/(app)/revenue/page.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'src/app/(app)/revenue/page.test.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'src/app/(app)/revenue'))).toBe(false)
  })

  it('AC-410.5: 모든 주소를 잡는 폴더는 앱 틀 안의 (app)/[...rest] 하나뿐이다(앱 틀 guard를 같이 받는다)', () => {
    const catchAlls = readdirSync(join(ROOT, 'src/app'), { recursive: true, encoding: 'utf8' })
      .map((rel) => rel.split('\\').join('/'))
      .filter((rel) => rel.split('/').some((seg) => /^\[{1,2}\.\.\./.test(seg)))
      .map((rel) => rel.split('/').slice(0, rel.split('/').findIndex((seg) => /^\[{1,2}\.\.\./.test(seg)) + 1).join('/'))
    expect([...new Set(catchAlls)]).toEqual(['(app)/[...rest]'])
  })
})

describe('AC-4110.2: /revenue → /stats 넘기기 (next.config redirects)', () => {
  it('AC-4110.2: redirects()는 { source: /revenue, destination: /stats, permanent: false } 하나뿐이다', async () => {
    expect(nextConfig.redirects).toBeTypeOf('function')
    expect(await nextConfig.redirects!()).toEqual([{ source: '/revenue', destination: '/stats', permanent: false }])
  })

  it('AC-4110.2: 넘기는 곳은 같은 origin 고정 경로다(바깥 주소·주소 조각·쿼리로 정하는 곳이 없다, 열린 넘기기 금지)', async () => {
    for (const rule of await nextConfig.redirects!()) {
      expect(rule.destination, rule.source).toMatch(/^\/[a-z][a-z/-]*$/)
      expect(rule.source, rule.source).toMatch(/^\/[a-z][a-z/-]*$/)
      expect('has' in rule || 'missing' in rule, rule.source).toBe(false)
    }
  })

  it('AC-4110.2: 넘기는 주소 /stats는 자기 페이지가 있다', () => {
    expect(existsSync(join(ROOT, 'src/app/(app)/stats/page.tsx'))).toBe(true)
  })
})
