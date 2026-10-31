import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import type { ComponentType, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as authCallback } from '@/app/auth/callback/route'
import { setupSteps, type SetupInput } from '@/components/claim/setup/steps'
import { NotReadyScreen } from '@/components/common/NotReadyScreen'
import { NOT_READY_FEATURES } from '@/components/common/notReadyFeatures'
import { DASHBOARD_FEATURES } from '@/components/dashboard/briefing/features'
import { AppShell } from '@/components/shell/AppShell'
import { MENU } from '@/components/shell/menu'
import { decideRoute } from '@/lib/auth/gate'
import DashboardPage from './dashboard/page'

// 탭 13개 틀 통합 시험 (tab-frame REQ-301·REQ-307·REQ-308, design.md '대시보드 페이지 조립'·'목차·준비 중 자료는 각 갈래 자기 파일').
// 네 갈래(탭 줄 · 준비 중 화면 · 브리핑 · 분석)를 합친 코드를 가로질러 본다: 이름·주소·순서가 세 곳(menu.ts · briefing/features.ts ·
// notReadyFeatures.ts)에서 같은지, 탭 주소마다 페이지가 있는지, 로그인하면 늘 대시보드가 첫 화면인지.
// 기능에 진짜 화면이 생기면 세 곳과 그 주소의 page.tsx를 같은 TASK에서 고친다 — 한쪽만 바꾸면 이 시험이 깨진다(design.md '다음 명세가 탭을 채울 때')

// 실제 Supabase에 붙지 않는다(콜백은 route.test.ts처럼 코드 → 세션 바꾸기만 흉내 낸다). 계정 메뉴의 [로그아웃]도 붙지 않는다
const { exchangeCodeForSession, supabaseServer, pathname } = vi.hoisted(() => {
  const exchangeCodeForSession = vi.fn()
  return {
    exchangeCodeForSession,
    supabaseServer: vi.fn(async () => ({ auth: { exchangeCodeForSession } })),
    pathname: vi.fn(() => '/dashboard'),
  }
})
vi.mock('@/lib/supabase/server', () => ({ supabaseServer }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('next/navigation', () => ({ usePathname: pathname }))

const ROOT = process.cwd()
const APP_GROUP = 'src/app/(app)'
const ORIGIN = 'http://localhost:3000'

const pageFile = (path: string) => join(ROOT, `${APP_GROUP}${path}/page.tsx`)
const read = (file: string) => readFileSync(file, 'utf8')
// 그 주소의 페이지(주소 → 파일을 자료에서 바로 찾는다. 따로 적은 표가 없다)
const loadPage = async (path: string): Promise<ComponentType> =>
  ((await import(`./${path.slice(1)}/page.tsx`)) as { default: ComponentType }).default
// 그린 마크업 → 보이는 글자(태그는 빈칸, React가 글자 사이에 넣는 <!-- -->는 지운다)
const plain = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const READY = DASHBOARD_FEATURES.filter((f) => f.ready)
const NOT_READY = DASHBOARD_FEATURES.filter((f) => !f.ready)

describe('로그인하면 늘 대시보드가 첫 화면이다 (REQ-301)', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset()
    exchangeCodeForSession.mockResolvedValue({ data: { session: {}, user: { id: 'user-1' } }, error: null })
    supabaseServer.mockClear()
  })

  it.each([
    '?code=abc',
    '?code=abc&next=/stats',
    '?code=abc&redirect=/admin',
    '?code=abc&returnTo=/contacts',
    '?code=abc&next=https://evil.example&redirect=//evil.example/x&returnTo=/claim/setup',
  ])('AC-301.1: 콜백 세션 만들기가 성공하면(%s) 같은 origin의 /dashboard — next·redirect·returnTo를 줘도', async (query) => {
    const response = await authCallback(new NextRequest(`${ORIGIN}/auth/callback${query}`))
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`${ORIGIN}/dashboard`)
  })

  it('AC-301.2: 승인된 사용자(관리자 포함)가 /login·/signup·/pending을 열면 문지기가 /dashboard로 보낸다', () => {
    for (const isAdmin of [false, true]) {
      for (const path of ['/login', '/signup', '/pending']) {
        expect(decideRoute({ path, signedIn: true, hospital: 'approved', isAdmin }), `${path} 관리자 ${isAdmin}`).toBe('/dashboard')
      }
    }
  })

  it('AC-301.2: 로그인했고 병원 상태를 아직 모르는 middleware 단계(unknown)에서 /login을 열어도 /dashboard', () => {
    for (const isAdmin of [false, true]) {
      expect(decideRoute({ path: '/login', signedIn: true, hospital: 'unknown', isAdmin })).toBe('/dashboard')
    }
  })

  it('AC-301.3: 승인된 사용자(관리자 포함)가 /dashboard를 열면 문지기는 그대로 연다(null)', () => {
    for (const isAdmin of [false, true]) {
      expect(decideRoute({ path: '/dashboard', signedIn: true, hospital: 'approved', isAdmin })).toBeNull()
    }
  })

  it('AC-301.3: 대시보드 페이지와 components/dashboard/**(시험 밖) 소스에 다른 주소로 보내는 코드가 없다', () => {
    const dir = join(ROOT, 'src/components/dashboard')
    const files = [
      pageFile('/dashboard'),
      ...readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
        .map((f) => join(dir, f)),
    ]
    // 옛 빈 자리 · 브리핑 · 분석 폴더가 모두 들었다
    for (const part of ['DashboardEmpty.tsx', 'briefing/DashboardHome.tsx', 'summary/DashboardAnalysis.tsx']) {
      expect(files.some((f) => f.endsWith(part)), part).toBe(true)
    }
    for (const file of files) {
      expect(read(file), file).not.toMatch(/\bredirect\b|permanentRedirect|useRouter|router\.push|router\.replace|\blocation\./)
    }
  })
})

describe('탭 · 목차 · 준비 중 화면 맞춤 (REQ-307)', () => {
  it('AC-307.1: 목차 이름·순서 = MENU에서 대시보드를 뺀 탭 이름 12개', () => {
    expect(DASHBOARD_FEATURES.map((f) => f.name)).toEqual(MENU.filter((m) => m.label !== '대시보드').map((m) => m.label))
    expect(DASHBOARD_FEATURES).toHaveLength(12)
  })

  it('AC-307.1: 목차 칸마다 href = 같은 이름 탭의 path', () => {
    for (const feature of DASHBOARD_FEATURES) {
      expect(feature.href, feature.name).toBe(MENU.find((m) => m.label === feature.name)?.path)
    }
  })

  it('AC-307.2: MENU의 탭 주소 13개마다 src/app/(app)<주소>/page.tsx가 있다', () => {
    expect(MENU).toHaveLength(13)
    for (const item of MENU) expect(existsSync(pageFile(item.path)), pageFile(item.path)).toBe(true)
  })

  it.each(NOT_READY.map((f) => [f.name, f.href]))(
    'AC-307.3: 준비 중 칸 %s(%s)의 페이지 = 같은 이름의 준비 중 자료로 그린 NotReadyScreen',
    async (name, href) => {
      const feature = NOT_READY_FEATURES.find((f) => f.name === name)
      expect(feature, name).toBeDefined()
      const Page = await loadPage(href)
      expect(renderToStaticMarkup(<Page />)).toBe(renderToStaticMarkup(<NotReadyScreen feature={feature!} />))
    },
  )

  it('AC-307.3: 사용 가능 칸(/claim·/claim/setup)의 페이지는 NotReadyScreen을 쓰지 않는 기존 화면이다', () => {
    expect(READY.map((f) => f.href)).toEqual(['/claim', '/claim/setup'])
    for (const feature of READY) {
      const source = read(pageFile(feature.href))
      expect(source, feature.href).not.toMatch(/NotReadyScreen|notReadyFeatures/)
      expect(source, feature.href).toMatch(/from '@\/components\/claim\/setup\//) // 청구 사전점검 화면(ClaimEntry · SetupScreen)
    }
  })

  it('AC-307.4: NOT_READY_FEATURES · 준비 중 칸 · MENU에서 href가 null이고 설정이 아닌 탭 — 이름·주소·순서가 모두 같다', () => {
    const fromNotReady = NOT_READY_FEATURES.map((f) => [f.name, f.path])
    expect(fromNotReady).toHaveLength(10)
    expect(NOT_READY.map((f) => [f.name, f.href])).toEqual(fromNotReady)
    expect(MENU.filter((m) => m.href === null && m.label !== '설정').map((m) => [m.label, m.path])).toEqual(fromNotReady)
  })

  // 설치·연결 확인 단계 이름은 입력과 상관없이 같다 → 아무 입력(연결 중)이나 준다
  const SETUP_INPUT: SetupInput = { state: 'connecting', hello: null, helloError: null, check: null, checkError: null, checking: false }

  it('AC-307.7: 브리핑 연결 순서 이름 다섯 = setupSteps가 주는 title 다섯(순서·글자 그대로) — 768px 이상 목록과 768px 미만 접는 칸 둘 다', () => {
    const titles = setupSteps(SETUP_INPUT).map((s) => s.title)
    expect(titles).toHaveLength(5)
    const briefing = /<section aria-label="오늘 브리핑"[^>]*>[\s\S]*?<\/section>/.exec(renderToStaticMarkup(<DashboardPage />))?.[0] ?? ''
    const lists = [...briefing.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/g)].map((list) =>
      [...list[1]!.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((row) => plain(row[1]!)),
    )
    expect(lists).toHaveLength(2)
    // 줄 = 번호(1~5) + 이름
    for (const rows of lists) expect(rows).toEqual(titles.map((title, i) => `${i + 1} ${title}`))
  })

  it('AC-307.7: 기능 수 글 둘의 숫자 = DASHBOARD_FEATURES 개수(12)와 사용 가능 칸 수(2)', () => {
    const total = DASHBOARD_FEATURES.length
    const ready = READY.length
    expect([total, ready]).toEqual([12, 2])
    const text = plain(renderToStaticMarkup(<DashboardPage />))
    expect([.../기능 (\d+)개 가운데 (\d+)개예요\. 다른 하나는 위의 비트 PC 연결이에요\./.exec(text)!.slice(1)].map(Number)).toEqual([total, ready])
    expect([.../(\d+)개 가운데 (\d+)개를 지금 쓸 수 있어요/.exec(text)!.slice(1)].map(Number)).toEqual([total, ready])
  })

  // 앱 틀 안에 페이지를 그린다(계정은 관리자 아닌 사람)
  const shell = (page: ReactNode) =>
    renderToStaticMarkup(
      <AppShell hospitalName="가나 정형외과의원" email="manager@example.com" isAdmin={false}>
        {page}
      </AppShell>,
    )
  // main의 클래스와 안쪽(본문)
  const mainOf = (html: string) => {
    const match = /<main\b[^>]*\bclass="([^"]*)"[^>]*>([\s\S]*)<\/main>/.exec(html)
    expect(match, '<main>').not.toBeNull()
    return { classes: match![1]!.split(/\s+/), body: match![2]! }
  }
  const SURFACE = 'has-[[data-page-surface]]:bg-surface'

  it('AC-307.8: 대시보드 페이지를 그린 AppShell — 본문 안에 data-page-surface 요소가 있고 main이 흰 바탕 클래스를 가진다', () => {
    pathname.mockReturnValue('/dashboard')
    const { classes, body } = mainOf(shell(<DashboardPage />))
    expect(classes).toContain(SURFACE)
    expect(body).toMatch(/<div data-page-surface="[^"]*"/)
  })

  it.each(NOT_READY.map((f) => [f.name, f.href]))(
    'AC-307.8: 준비 중 페이지 %s(%s)를 그린 AppShell — 본문 안에 data-page-surface가 없다(main 클래스는 같고 바탕은 canvas 그대로)',
    async (_name, href) => {
      pathname.mockReturnValue(href)
      const Page = await loadPage(href)
      const { classes, body } = mainOf(shell(<Page />))
      expect(classes).toContain(SURFACE)
      expect(body).not.toContain('data-page-surface')
    },
  )
})

describe('그대로 두는 것 — 관리자 화면 (REQ-308)', () => {
  it('AC-308.3: 승인된 사용자가 /admin을 열면 관리자가 아니면 /dashboard, 관리자면 연다(null)', () => {
    expect(decideRoute({ path: '/admin', signedIn: true, hospital: 'approved', isAdmin: false })).toBe('/dashboard')
    expect(decideRoute({ path: '/admin', signedIn: true, hospital: 'approved', isAdmin: true })).toBeNull()
  })

  it("AC-308.3: 관리자 페이지는 그리기 전에 guardPage('/admin')을 부른다", () => {
    const source = read(pageFile('/admin'))
    const guard = source.indexOf("await guardPage('/admin')")
    expect(guard).toBeGreaterThan(-1)
    expect(source.indexOf('return <', guard)).toBeGreaterThan(guard)
    expect(source.slice(0, guard)).not.toMatch(/return </)
  })
})
