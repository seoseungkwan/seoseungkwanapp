import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { NextRequest } from 'next/server'
import type { ComponentType, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as authCallback } from '@/app/auth/callback/route'
import { setupSteps, type SetupInput } from '@/components/claim/setup/steps'
import { NotReadyScreen } from '@/components/common/NotReadyScreen'
import { NOT_READY_FEATURES } from '@/components/common/notReadyFeatures'
import { DASHBOARD_FEATURES, type FeatureStatus } from '@/components/dashboard/briefing/features'
import { BitDashboard } from '@/components/dashboard/live/BitDashboard'
import { AppShell } from '@/components/shell/AppShell'
import { PREVIEW_TABS } from '@/components/preview/sample'
import { LIBRARY_TAB, LOCATION_TAB, MENU, MORE_MENU, TAB_ACCESS_MENU } from '@/components/shell/menu'
import { todayInKorea } from '@/lib/analytics/dates'
import { decideRoute } from '@/lib/auth/gate'
import DashboardPage from './dashboard/page'

// 탭 틀 통합 시험 (tab-frame REQ-301·REQ-307·REQ-308, design.md '대시보드 페이지 조립'·'목차·준비 중 자료는 각 갈래 자기 파일').
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

// 대시보드 연결 전 화면(dashboard-ux AC-2701.1): 서버 그림(DashboardPage)은 이제 저장 숫자를 읽는 동안의 뼈대라, 연결 전 브리핑은
// 저장 숫자 읽기가 빈 줄로 끝난 뒤 LiveDashboard가 놓는 그림 — <BitDashboard initial={{ kind: 'none' }} />(오늘 한국 날짜) — 으로 본다.
// 그 그림이 브라우저에서 페이지가 그리는 것과 같은지는 dashboard/page.test.tsx(AC-306.2·AC-2701.1)가 본다
const beforeConnect = () => renderToStaticMarkup(<BitDashboard today={todayInKorea()} initial={{ kind: 'none' }} />)

// 목차 상태(ui-90 AC-414.5): 준비 중(soon)이 아닌 칸 = 쓰는 화면이 있는 칸(connect-first · ready). 수는 목록에서 센다(spec revenue AC-010.1·patients AC-610.1, 다른 탭 명세도 같은 칸을 바꾼다)
const READY = DASHBOARD_FEATURES.filter((f) => f.status !== 'soon')
const NOT_READY = DASHBOARD_FEATURES.filter((f) => f.status === 'soon')
const featureCount = (status: FeatureStatus) => DASHBOARD_FEATURES.filter((f) => f.status === status).length
// 쓰는 화면이 있는 칸의 주소 → 그 페이지가 불러오는 화면 폴더. 탭에 화면이 생기면 여기에 한 줄 더한다
const SCREEN_DIR: Record<string, string> = {
  '/claim': 'claim/setup',
  '/claim/setup': 'claim/setup',
  '/stats': 'stats',
  '/notices': 'notices', // spec notices AC-7423.2 — 쪽 파일이 list·detail·keywords를 놓는다
  '/patients': 'patients',
  '/sunap': 'sunap', // spec sunap-ilji AC-4907.2
  '/calendar': 'calendar', // spec clinic-calendar AC-5905.10
  '/ai-report': 'ai-report',
  '/forms': 'forms', // spec forms AC-3501.1
  '/inventory': 'inventory', // spec inventory AC-7512.1
  '/contacts': 'contacts', // spec contacts AC-6508.1
  '/worklog': 'worklog',
  '/staff': 'staff', // spec staff AC-7611.1
  '/settings': 'settings',
}

describe('AC-515.5: 로그인하면 늘 대시보드가 첫 화면이다 (REQ-301)', () => {
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

  it('AC-301.3·AC-2704.7: 대시보드 페이지와 components/dashboard/**(시험 밖) 소스에 다른 주소로 보내는 코드가 없다 — 같은 주소 다시 읽기(location.reload())는 AI 요약의 로그인 끊김 한 곳뿐', () => {
    const dir = join(ROOT, 'src/components/dashboard')
    const files = [
      pageFile('/dashboard'),
      ...readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
        .map((f) => join(dir, f).split(sep).join('/')), // 윈도우에서도 '/'로 견준다
    ]
    // 옛 빈 자리 · 브리핑 · 분석 폴더가 모두 들었다
    for (const part of ['DashboardEmpty.tsx', 'briefing/DashboardHome.tsx', 'summary/DashboardAnalysis.tsx']) {
      expect(files.some((f) => f.endsWith(part)), part).toBe(true)
    }
    for (const file of files) {
      expect(read(file), file).not.toMatch(/\bredirect\b|permanentRedirect|useRouter|router\.push|router\.replace|\blocation\.(?!reload\(\))/)
    }
    // 로그인이 끊긴 AI 답은 AI 리포트 화면과 같이 그 페이지를 다시 읽는다(dashboard-ux AC-2704.7). 주소는 바꾸지 않는다
    expect(files.filter((file) => /\blocation\.reload\(\)/.test(read(file))).map((file) => file.slice(file.indexOf('src/')))).toEqual([
      'src/components/dashboard/ai/useAiBrief.ts',
    ])
  })
})

describe('탭 · 목차 · 준비 중 화면 맞춤 (REQ-307)', () => {
  it('AC-307.1: 목차 이름·순서 = MENU에서 대시보드를 뺀 탭 이름', () => {
    expect(DASHBOARD_FEATURES.map((f) => f.name)).toEqual(MENU.filter((m) => m.label !== '대시보드').map((m) => m.label))
    expect(DASHBOARD_FEATURES).toHaveLength(MENU.length - 1)
  })

  it('AC-307.1: 목차 칸마다 href = 같은 이름 탭의 path', () => {
    for (const feature of DASHBOARD_FEATURES) {
      expect(feature.href, feature.name).toBe(MENU.find((m) => m.label === feature.name)?.path)
    }
  })

  it('AC-307.2: MENU의 탭 주소마다 src/app/(app)<주소>/page.tsx가 있다', () => {
    expect(MENU).toHaveLength(DASHBOARD_FEATURES.length + 1) // 목차 칸 + 대시보드
    for (const item of MENU) expect(existsSync(pageFile(item.path)), pageFile(item.path)).toBe(true)
  })

  it.each(NOT_READY.map((f) => [f.name, f.href]))(
    'AC-307.3·AC-415.5: 준비 중 칸 %s(%s)의 페이지 = 같은 이름의 준비 중 자료로 그린 NotReadyScreen — h1은 그 자료의 title("…준비 중이에요")',
    async (name, href) => {
      const feature = NOT_READY_FEATURES.find((f) => f.name === name)
      expect(feature, name).toBeDefined()
      const Page = await loadPage(href)
      const html = renderToStaticMarkup(<Page />)
      expect(html).toBe(renderToStaticMarkup(<NotReadyScreen feature={feature!} />))
      // 같은 화면 견주기의 기대 글자(ui-90): h1 = title, 옛 안내 "준비 중인 기능입니다"는 없다
      expect([...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => plain(m[1]!))).toEqual([feature!.title])
      expect(feature!.title).toMatch(new RegExp(`^${name}[은는] 준비 중이에요$`))
      expect(plain(html)).not.toContain('준비 중인 기능입니다')
    },
  )

  it('AC-307.3·AC-4110.1·AC-515.4·AC-714.3·AC-610.1·AC-012.4·AC-012.6·AC-3501.1·AC-5801.4·AC-5905.10·AC-7423.1·AC-7423.2·AC-7512.1·AC-7512.2·AC-6508.1·AC-7611.1: 쓰는 화면이 있는 칸의 페이지는 NotReadyScreen을 쓰지 않는 자기 화면이다 — 칸은 MENU의 ready 탭(대시보드 뺌)과 같고 /stats·/claim·/notices·/patients·/worklog·/sunap·/calendar·/ai-report·/forms·/staff·/inventory·/contacts·/settings다', () => {
    expect(READY.map((f) => f.href)).toEqual(MENU.filter((m) => m.ready && m.label !== '대시보드').map((m) => m.path))
    // 업무일지가 수납일지 바로 앞(nav-worklog AC-5801.4), 직원은 서식 바로 뒤(staff AC-7611.1)
    expect(READY.map((f) => f.href)).toEqual(['/stats', '/claim', '/notices', '/patients', '/worklog', '/sunap', '/calendar', '/ai-report', '/forms', '/staff', '/inventory', '/contacts', '/settings'])
    expect(READY.map((f) => f.href)).toContain('/stats')
    expect(READY.map((f) => f.href)).toContain('/patients')
    expect(READY.map((f) => f.href)).toContain('/ai-report')
    expect(READY.map((f) => f.href)).toContain('/worklog')
    for (const feature of READY) {
      const source = read(pageFile(feature.href))
      expect(source, feature.href).not.toMatch(/NotReadyScreen|notReadyFeatures/)
      expect(source, feature.href).toContain(`from '@/components/${SCREEN_DIR[feature.href]}/`)
      if (feature.href === '/ai-report') {
        expect(source, feature.href).toMatch(/from '@\/components\/ai-report\/AiReportScreen'/) // AI 리포트 화면
      }
    }
    // 청구 사전점검 화면(ClaimEntry · SetupScreen) · 환자 탭 입구(PatientsEntry)
    for (const href of ['/claim', '/claim/setup']) expect(read(pageFile(href)), href).toMatch(/from '@\/components\/claim\/setup\//)
    expect(read(pageFile('/patients')), '/patients').toMatch(/from '@\/components\/patients\//)
    // 설정 화면(SettingsPage)
    expect(read(pageFile('/settings')), '/settings').toMatch(/from '@\/components\/settings\//)
    // 고시·공지 쪽 파일(notices AC-7423.2·AC-7424.13): 글 목록·글 화면·내 낱말 칸
    for (const part of ['list/NoticesScreen', 'detail/NoticeDetail', 'keywords/KeywordsControl']) {
      expect(read(pageFile('/notices')), part).toContain(`from '@/components/notices/${part}'`)
    }
    // 재고 화면(InventoryScreen, spec inventory AC-7512.1)
    expect(read(pageFile('/inventory')), '/inventory').toMatch(/from '@\/components\/inventory\/InventoryScreen'/)
  })

  it('AC-515.4·AC-2702.1: 통계는 세 곳(menu · features · notReady)이 맞고(주요 메뉴) /stats 페이지는 StatsScreen이다', () => {
    expect(MENU.find((m) => m.label === '통계')).toEqual({ label: '통계', path: '/stats', href: '/stats', ready: true, primary: true })
    expect(DASHBOARD_FEATURES.find((f) => f.name === '통계')).toMatchObject({ href: '/stats', status: 'connect-first' })
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/stats')
    expect(read(pageFile('/stats'))).toMatch(/from '@\/components\/stats\/StatsScreen'/)
  })

  it('AC-307.4·AC-010.1·AC-515.3·AC-012.4: NOT_READY_FEATURES · 준비 중 칸 · MENU에서 href가 null이고 설정이 아닌 탭 — 이름·주소·순서가 모두 같고 통계와 업무일지는 없다', () => {
    const fromNotReady = NOT_READY_FEATURES.map((f) => [f.name, f.path])
    expect(fromNotReady).toHaveLength(MENU.filter((m) => !m.ready).length)
    expect(fromNotReady).not.toContainEqual(['통계', '/stats'])
    expect(fromNotReady).not.toContainEqual(['업무일지', '/worklog'])
    expect(fromNotReady).not.toContainEqual(['AI 리포트', '/ai-report'])
    expect(NOT_READY.map((f) => [f.name, f.href])).toEqual(fromNotReady)
    expect(MENU.filter((m) => m.href === null && m.label !== '설정').map((m) => [m.label, m.path])).toEqual(fromNotReady)
  })

  it('AC-4110.1·AC-4110.3: 매출 탭이 없다 — 세 곳(menu · features · notReady) 어디에도 매출·/revenue가 없고 /revenue 페이지 파일도 없다. 통계 목차 설명에 매출이 든다', () => {
    expect(MENU.map((m) => m.label as string)).not.toContain('매출')
    expect(MENU.map((m) => m.path as string)).not.toContain('/revenue')
    expect(DASHBOARD_FEATURES.map((f) => f.name)).not.toContain('매출')
    expect(DASHBOARD_FEATURES.map((f) => f.href)).not.toContain('/revenue')
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/revenue')
    expect(NOT_READY_FEATURES.map((f) => f.name)).not.toContain('매출')
    expect(existsSync(pageFile('/revenue'))).toBe(false)
    expect(DASHBOARD_FEATURES.find((f) => f.name === '통계')?.desc.split('·')).toContain('매출')
  })

  it('AC-010.1·AC-2702.2: [더보기] 판이 세는 준비 중 수 = NOT_READY_FEATURES 수 = 목차의 준비 중 칸 수(매출이 빠진 수) — 준비 중 탭은 모두 [더보기] 판에 있다', () => {
    const notReadyTabs = MENU.filter((m) => !m.ready)
    expect(notReadyTabs.map((m) => m.label as string)).not.toContain('매출')
    expect(MORE_MENU.filter((m) => !m.ready)).toEqual(notReadyTabs)
    expect(notReadyTabs).toHaveLength(NOT_READY_FEATURES.length)
    expect(notReadyTabs).toHaveLength(featureCount('soon'))
  })

  // 설치·연결 확인 단계 이름은 입력과 상관없이 같다 → 아무 입력(연결 중)이나 준다
  const SETUP_INPUT: SetupInput = { state: 'connecting', hello: null, helloError: null, check: null, checkError: null, checking: false }

  it('AC-307.7·AC-2701.1: 브리핑 연결 순서 이름 다섯 = setupSteps가 주는 title 다섯(순서·글자 그대로) — 768px 이상 목록과 768px 미만 접는 칸 둘 다', () => {
    const titles = setupSteps(SETUP_INPUT).map((s) => s.title)
    expect(titles).toHaveLength(5)
    const briefing = /<section aria-label="오늘 브리핑"[^>]*>[\s\S]*?<\/section>/.exec(beforeConnect())?.[0] ?? ''
    const lists = [...briefing.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/g)].map((list) =>
      [...list[1]!.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((row) => plain(row[1]!)),
    )
    expect(lists).toHaveLength(2)
    // 줄 = 번호(1~5) + 이름
    for (const rows of lists) expect(rows).toEqual(titles.map((title, i) => `${i + 1} ${title}`))
  })

  it('AC-307.7·AC-414.5·AC-010.1·AC-515.2·AC-714.4·AC-610.1·AC-012.5·AC-2701.1: 기능 수 글의 숫자 = DASHBOARD_FEATURES 개수 · 지금 쓸 수 있는 칸 수 · 연결하면 쓸 수 있는 칸 수 — 수는 목록에서 센다', () => {
    const total = DASHBOARD_FEATURES.length
    const now = featureCount('ready')
    const afterConnect = featureCount('connect-first')
    // 세 상태를 더하면 전체이고, 전체는 대시보드를 뺀 탭 수, 지금·연결 뒤 쓰는 칸은 대시보드를 뺀 ready 탭이다
    expect(now + afterConnect + featureCount('soon')).toBe(total)
    expect(total).toBe(MENU.length - 1)
    expect(now + afterConnect).toBe(MENU.filter((m) => m.ready && m.label !== '대시보드').length)
    expect(now + afterConnect).toBe(READY.length)
    const text = plain(beforeConnect())
    expect([.../(\d+)개 가운데 (\d+)개는 지금, (\d+)개는 연결하면 쓸 수 있어요/.exec(text)!.slice(1)].map(Number)).toEqual([total, now, afterConnect])
    // 옛 기능 수 글 둘은 없다
    expect(text).not.toMatch(/기능 \d+개 가운데|개를 지금 쓸 수 있어요/)
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
  // 바탕 A(ui-90 AC-404.1, tab-frame AC-307.8 대체): 모든 앱 화면이 흰 바탕 한 장 — 페이지 표시(data-page-surface)와 상관없이 main이 bg-surface
  const SURFACE = 'bg-surface'
  const OLD_SURFACE = 'has-[[data-page-surface]]:bg-surface'
  const dashboardMain = () => {
    pathname.mockReturnValue('/dashboard')
    return mainOf(shell(<DashboardPage />))
  }

  it('AC-404.1: 대시보드 페이지를 그린 AppShell — main이 흰 바탕(bg-surface)이고 옛 표시 클래스·canvas가 없다', () => {
    const { classes } = dashboardMain()
    expect(classes).toContain(SURFACE)
    expect(classes).not.toContain(OLD_SURFACE)
    expect(classes).not.toContain('bg-canvas')
  })

  it.each(NOT_READY.map((f) => [f.name, f.href]))(
    'AC-404.1: 준비 중 페이지 %s(%s)를 그린 AppShell — main이 대시보드와 같은 흰 바탕(bg-surface)이다. 본문 안에 data-page-surface가 없다',
    async (_name, href) => {
      const dashboard = dashboardMain().classes
      pathname.mockReturnValue(href)
      const Page = await loadPage(href)
      const { classes, body } = mainOf(shell(<Page />))
      expect(classes).toContain(SURFACE)
      expect(classes).not.toContain(OLD_SURFACE)
      expect(classes).toEqual(dashboard)
      expect(body).not.toContain('data-page-surface')
    },
  )
})

describe('바탕 표시 지움 (ui-90 AC-404.2)', () => {
  // 시험 파일 밖 소스(주석은 빼고 본다 — 옛 표시를 지웠다는 설명 글은 표시가 아니다)
  const codeOf = (file: string) =>
    read(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  const sources = (dir: string) =>
    readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(?:tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => join(ROOT, dir, f).split(sep).join('/'))

  it('AC-404.2: 시험 파일 밖 src/components/**·src/app/** 소스에 data-page-surface가 없다', () => {
    const files = [...sources('src/components'), ...sources('src/app')]
    expect(files.some((f) => f.endsWith('briefing/DashboardHome.tsx'))).toBe(true)
    expect(files.some((f) => f.endsWith('shell/AppShell.tsx'))).toBe(true)
    expect(files.filter((f) => codeOf(f).includes('data-page-surface')).map((f) => f.slice(ROOT.length + 1))).toEqual([])
  })

  it('AC-404.2·AC-2701.1: 대시보드를 그린 앱 틀 안에 data-page-surface 요소가 없다 — 서버 그림(뼈대)과 연결 전 화면 둘 다', () => {
    pathname.mockReturnValue('/dashboard')
    const inShell = (page: ReactNode) =>
      renderToStaticMarkup(
        <AppShell hospitalName="가나 정형외과의원" email="manager@example.com" isAdmin={false}>
          {page}
        </AppShell>,
      )
    const server = inShell(<DashboardPage />)
    expect(server).toContain('대시보드 숫자를 불러오고 있어요')
    expect(server).not.toContain('data-page-surface')
    const before = inShell(<BitDashboard today={todayInKorea()} initial={{ kind: 'none' }} />)
    expect(before).toContain('오늘 브리핑')
    expect(before).not.toContain('data-page-surface')
  })
})

// specs/location REQ-7901: 입지 분석은 관리자만 보는 탭이라 MENU 밖 상수 LOCATION_TAB 하나다 — 세 곳(menu · features · notReady)은 그대로다
describe('입지 분석 탭 — 관리자만, 목차·준비 중 그대로 (location REQ-7901)', () => {
  it('AC-7901.1: LOCATION_TAB은 MENU 밖이라 세 곳이 그대로다 — MENU 14개, 목차 = MENU에서 대시보드를 뺀 칸, 준비 중 자료·[더보기] 준비 중 수 그대로이고 어디에도 입지 분석·/location이 없다', () => {
    expect(LOCATION_TAB).toMatchObject({ label: '입지 분석', path: '/location', href: '/location', ready: true, primary: false })
    expect(MENU).toHaveLength(14)
    expect(MENU).not.toContain(LOCATION_TAB)
    expect(MORE_MENU).not.toContain(LOCATION_TAB)
    expect(DASHBOARD_FEATURES).toHaveLength(MENU.length - 1)
    expect(DASHBOARD_FEATURES.map((f) => f.name)).toEqual(MENU.filter((m) => m.label !== '대시보드').map((m) => m.label))
    for (const names of [MENU.map((m) => m.label as string), DASHBOARD_FEATURES.map((f) => f.name as string), NOT_READY_FEATURES.map((f) => f.name as string)]) {
      expect(names).not.toContain('입지 분석')
    }
    for (const paths of [MENU.map((m) => m.path as string), DASHBOARD_FEATURES.map((f) => f.href as string), NOT_READY_FEATURES.map((f) => f.path as string)]) {
      expect(paths).not.toContain('/location')
    }
    expect(MORE_MENU.filter((m) => !m.ready)).toHaveLength(NOT_READY_FEATURES.length)
  })

  it('AC-7901.1: 관리자 앱 틀을 /location에서 그리면 [더보기] 단추가 "더보기 · 입지 분석"이고, 관리자 아닌 원장의 앱 틀은 같은 주소에서도 "더보기"다(입지 분석 글이 없다). 다른 탭(/dashboard)에서는 둘 다 "더보기"다', () => {
    const shellAs = (isAdmin: boolean) =>
      plain(
        renderToStaticMarkup(
          <AppShell hospitalName="가나 정형외과의원" email="manager@example.com" isAdmin={isAdmin}>
            <p>본문</p>
          </AppShell>,
        ),
      )
    pathname.mockReturnValue('/location')
    expect(shellAs(true)).toContain('더보기 · 입지 분석')
    expect(shellAs(false)).not.toContain('입지 분석')
    pathname.mockReturnValue('/dashboard')
    for (const isAdmin of [true, false]) {
      expect(shellAs(isAdmin)).toContain('더보기')
      expect(shellAs(isAdmin)).not.toContain('입지 분석')
    }
  })

  it('AC-7901.2: /location과 그 아래는 /admin과 같이 관리자 경로 — 관리자는 연다, 관리자 아닌 원장 /dashboard, 데스크 /sunap, 로그인 안 함 /login', () => {
    for (const path of ['/admin', '/location', '/location/x']) {
      expect(decideRoute({ path, signedIn: true, hospital: 'approved', isAdmin: true }), path).toBeNull()
      expect(decideRoute({ path, signedIn: true, hospital: 'approved', isAdmin: false }), path).toBe('/dashboard')
      expect(decideRoute({ path, signedIn: true, hospital: 'desk', isAdmin: false }), path).toBe('/sunap')
      expect(decideRoute({ path, signedIn: false, hospital: 'unknown', isAdmin: false }), path).toBe('/login')
    }
  })
})

// specs/library REQ-8108: 자료실은 모두에게 늘 보이는 탭이라 MENU 밖 상수 LIBRARY_TAB 하나다 — 세 곳(menu · features · notReady)과
// '관리자만 보는 탭' 목록(TAB_ACCESS_MENU)·미리보기 탭(PREVIEW_TABS)은 그대로다(입지 분석과 같은 모양)
describe('자료실 탭 — 늘 보임, 목차·준비 중·관리자만 보는 탭 목록 그대로 (library REQ-8108)', () => {
  it('AC-8108.1: LIBRARY_TAB은 MENU 밖이라 다섯 곳이 그대로다 — MENU 14개, 목차 = MENU에서 대시보드를 뺀 칸, 준비 중 자료·[더보기] 준비 중 수, 관리자만 보는 탭 목록 12개, 미리보기 탭 = MENU 이름이고 어디에도 자료실·/library가 없다', () => {
    expect(LIBRARY_TAB).toMatchObject({ label: '자료실', path: '/library', href: '/library', ready: true, primary: false })
    expect(MENU).toHaveLength(14)
    expect(MENU).not.toContain(LIBRARY_TAB)
    expect(MORE_MENU).not.toContain(LIBRARY_TAB)
    expect(TAB_ACCESS_MENU).toHaveLength(12)
    expect(TAB_ACCESS_MENU).not.toContain(LIBRARY_TAB)
    expect(DASHBOARD_FEATURES).toHaveLength(MENU.length - 1)
    expect(DASHBOARD_FEATURES.map((f) => f.name)).toEqual(MENU.filter((m) => m.label !== '대시보드').map((m) => m.label))
    expect([...PREVIEW_TABS]).toEqual(MENU.map((m) => m.label))
    for (const names of [
      MENU.map((m) => m.label as string),
      DASHBOARD_FEATURES.map((f) => f.name as string),
      NOT_READY_FEATURES.map((f) => f.name as string),
      TAB_ACCESS_MENU.map((m) => m.label as string),
      [...PREVIEW_TABS] as string[],
    ]) {
      expect(names).not.toContain('자료실')
    }
    for (const paths of [
      MENU.map((m) => m.path as string),
      DASHBOARD_FEATURES.map((f) => f.href as string),
      NOT_READY_FEATURES.map((f) => f.path as string),
      TAB_ACCESS_MENU.map((m) => m.path as string),
    ]) {
      expect(paths).not.toContain('/library')
    }
    expect(MORE_MENU.filter((m) => !m.ready)).toHaveLength(NOT_READY_FEATURES.length)
  })

  it('AC-8108.2: /library에서 원장·관리자 앱 틀 모두 [더보기] 단추가 "더보기 · 자료실"이고, 다른 탭(/dashboard)에서는 "더보기"다(자료실 글은 판을 열어야 보인다)', () => {
    const shellAs = (isAdmin: boolean) =>
      plain(
        renderToStaticMarkup(
          <AppShell hospitalName="가나 정형외과의원" email="manager@example.com" isAdmin={isAdmin}>
            <p>본문</p>
          </AppShell>,
        ),
      )
    pathname.mockReturnValue('/library')
    for (const isAdmin of [false, true]) expect(shellAs(isAdmin), String(isAdmin)).toContain('더보기 · 자료실')
    pathname.mockReturnValue('/dashboard')
    for (const isAdmin of [false, true]) {
      expect(shellAs(isAdmin), String(isAdmin)).toContain('더보기')
      expect(shellAs(isAdmin), String(isAdmin)).not.toContain('자료실')
    }
  })

  it('AC-8108.3: /library와 그 아래는 관리자 경로가 아니다 — 승인된 원장·관리자·데스크 모두 연다(문지기 그대로), 대기 /pending, 로그인 안 함 /login', () => {
    for (const path of ['/library', '/library/x']) {
      expect(decideRoute({ path, signedIn: true, hospital: 'approved', isAdmin: true }), path).toBeNull()
      expect(decideRoute({ path, signedIn: true, hospital: 'approved', isAdmin: false }), path).toBeNull()
      expect(decideRoute({ path, signedIn: true, hospital: 'desk', isAdmin: false }), path).toBeNull()
      expect(decideRoute({ path, signedIn: true, hospital: 'pending', isAdmin: false }), path).toBe('/pending')
      expect(decideRoute({ path, signedIn: false, hospital: 'unknown', isAdmin: false }), path).toBe('/login')
    }
  })
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
