import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isValidElement, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotReadyScreen } from '@/components/common/NotReadyScreen'
import { NOT_READY_FEATURES, notReadyFeature, type NotReadyPath } from '@/components/common/notReadyFeatures'
import { KeywordsControl } from '@/components/notices/keywords/KeywordsControl'
import { MENU, isDeskPath } from '@/components/shell/menu'
import { decideRoute, type HospitalState } from '@/lib/auth/gate'
import type { Me } from '@/lib/auth/hospital.server'
import AiReportPage from './ai-report/page'
import ContactsPage from './contacts/page'
import NoticesPage, { metadata as noticesMetadata } from './notices/page'
import StaffPage from './staff/page'

// 화면 부품은 가짜로 바꿔 페이지가 넘긴 today만 본다(AC-714.3). 화면 자체는 components/ai-report 시험이 본다
vi.mock('@/components/ai-report/AiReportScreen', () => ({
  AiReportScreen: ({ today }: { today: string }) => <p data-ai-report-today={today}>AI 리포트 화면</p>,
}))

// /notices 쪽 파일(notices AC-7423.2·AC-7424.13): 문지기 읽기와 화면 부품 셋은 가짜다. 화면 자체는 components/notices 시험이 본다
const { currentMe, NoticesScreen, NoticeDetail, KeywordsMock } = vi.hoisted(() => ({
  currentMe: vi.fn<() => Promise<Me>>(),
  NoticesScreen: vi.fn<(props: { keywords?: unknown }) => unknown>(),
  NoticeDetail: vi.fn<(props: { id: string }) => unknown>(),
  KeywordsMock: vi.fn<() => unknown>(),
}))
vi.mock('./currentMe.server', () => ({ currentMe }))
vi.mock('@/components/notices/list/NoticesScreen', () => ({ NoticesScreen }))
vi.mock('@/components/notices/detail/NoticeDetail', () => ({ NoticeDetail }))
vi.mock('@/components/notices/keywords/KeywordsControl', () => ({ KeywordsControl: KeywordsMock }))

// 준비 중 주소의 페이지 (tab-frame REQ-305 AC-305.5·AC-305.6, ui-90 AC-415.5, design.md '준비 중 화면' 한 줄 페이지·'데이터 흐름').
// 페이지는 (app) 묶음 안이라 앱 틀과 승인 검사((app)/layout)를 저절로 받는다. 문지기 규칙은 바꾸지 않는다

const ROOT = process.cwd()
const APP_GROUP = 'src/app/(app)'

// 주소 · 표의 이름 · h1(title) · 페이지 (탭 순서)
const PAGES: Array<{ path: NotReadyPath; name: string; title: string; Page: ComponentType }> = [
  { path: '/staff', name: '직원', title: '직원은 준비 중이에요', Page: StaffPage },
  { path: '/contacts', name: '주소록', title: '주소록은 준비 중이에요', Page: ContactsPage },
]

const pageFile = (path: string) => `${APP_GROUP}${path}/page.tsx`
const h1Texts = (markup: string) =>
  [...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())

describe('AC-714.3: /ai-report 페이지 = 준비 중 화면이 아닌 진짜 화면에 요청 때의 한국 날짜를 넘긴다', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-714.3: 가짜 시계 UTC 2026-11-01 15:30(한국 11월 2일 00:30)에서 화면이 받은 today는 "2026-11-02"다(UTC 날짜면 11-01)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T15:30:00Z'))
    const html = renderToStaticMarkup(<AiReportPage />)
    expect(html).toContain('data-ai-report-today="2026-11-02"')
    expect(html).not.toContain('2026-11-01')
  })

  it('AC-714.3: dynamic은 "force-dynamic"이고 탭 이름은 "AI 리포트"다', async () => {
    const page = await import('./ai-report/page')
    expect(page.dynamic).toBe('force-dynamic')
    expect(page.metadata).toEqual({ title: 'AI 리포트' })
  })

  it('AC-714.3: 그린 결과에 준비 중 화면이 없고, 소스에 NotReadyScreen·notReadyFeature가 없다', () => {
    const html = renderToStaticMarkup(<AiReportPage />)
    expect(html).not.toContain('준비 중')
    expect(html).not.toContain('그동안 쓸 수 있어요')
    expect(html).not.toContain('대시보드로 돌아가기')
    const source = readFileSync(join(ROOT, pageFile('/ai-report')), 'utf8')
    expect(source).not.toMatch(/NotReadyScreen|notReadyFeature/)
    expect(source).toMatch(/from '@\/components\/ai-report\/AiReportScreen'/)
    expect(existsSync(join(ROOT, pageFile('/ai-report'))), pageFile('/ai-report')).toBe(true)
  })
})

describe('AC-305.5: 준비 중 주소의 페이지 = notReadyFeature(주소)를 준 NotReadyScreen', () => {
  it.each(PAGES)('AC-305.5: $path 페이지는 notReadyFeature("$path")를 준 NotReadyScreen과 같다', ({ path, Page }) => {
    expect(renderToStaticMarkup(<Page />)).toBe(renderToStaticMarkup(<NotReadyScreen feature={notReadyFeature(path)} />))
  })

  it.each(PAGES)('AC-415.5: $path 페이지의 h1은 하나이고 그 항목의 title "$title"이다(이름 "$name"만이 아니다)', ({ path, Page, name, title }) => {
    expect(h1Texts(renderToStaticMarkup(<Page />))).toEqual([title])
    expect(notReadyFeature(path).title).toBe(title)
    expect(title).not.toBe(name)
  })

  it.each(PAGES)('AC-415.5: $path 페이지는 "그동안 쓸 수 있어요"와 [대시보드로 돌아가기]를 그린다', ({ Page }) => {
    const html = renderToStaticMarkup(<Page />)
    expect(html).toContain('그동안 쓸 수 있어요')
    expect(html).toContain('대시보드로 돌아가기')
    expect(html).not.toContain('준비 중인 기능입니다')
  })

  it.each(PAGES)('AC-305.5: $path 페이지 소스는 자기 주소의 준비 중 자료만 꺼내 넘긴다(한 줄 페이지)', ({ path }) => {
    const source = readFileSync(join(ROOT, pageFile(path)), 'utf8')
    expect(source).toContain(`notReadyFeature('${path}')`)
    expect([...source.matchAll(/notReadyFeature\(/g)]).toHaveLength(1)
    expect(source).toMatch(/from '@\/components\/common\/NotReadyScreen'/)
    expect(source).not.toMatch(/['"]use client['"]|supabase|guard\.server|\bfetch\s*\(/)
  })

  it('AC-305.5·AC-010.1: 주소가 모두 다르고, 페이지 표의 주소·순서가 NOT_READY_FEATURES와 같다', () => {
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length)
    expect(PAGES.map((p) => p.path)).toEqual(NOT_READY_FEATURES.map((f) => f.path))
  })

  it('AC-010.1·AC-4110.2: /revenue는 준비 중 주소가 아니다 — 페이지 표와 준비 중 목록에 없고, 그 페이지 파일도 없다(next.config가 /stats로 넘긴다)', () => {
    expect(PAGES.map((p) => p.path as string)).not.toContain('/revenue')
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/revenue')
    expect(existsSync(join(ROOT, pageFile('/revenue')))).toBe(false)
  })

  it('AC-515.3: 이 표의 주소는 준비 중 목록(NOT_READY_FEATURES)·탭 목록(MENU)의 준비 중 항목과 같고 /stats는 없다', () => {
    expect(PAGES.map((p) => p.path)).toEqual(NOT_READY_FEATURES.map((f) => f.path))
    expect(PAGES.map((p) => p.path as string)).toEqual(MENU.filter((m) => !m.ready).map((m) => m.path as string))
    expect(PAGES.map((p) => p.path as string)).not.toContain('/stats')
  })

  it('AC-305.5: 주소가 모두 다르고 /ai-report가 없다', () => {
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length)
    expect(PAGES.map((p) => p.path)).not.toContain('/ai-report')
  })

  it('AC-305.5·AC-012.4: 이 표의 주소는 준비 중 목록(NOT_READY_FEATURES)과 같고(화면이 생긴 탭은 양쪽에서 빠진다) /worklog는 없다', () => {
    expect(PAGES.map((p) => p.path)).toEqual(NOT_READY_FEATURES.map((f) => f.path))
    expect(PAGES.map((p) => p.path as string)).not.toContain('/worklog')
  })

  it('AC-3501.1·AC-3501.2: /forms는 준비 중 주소가 아니다 — 페이지 표와 준비 중 목록에 없고, 그 페이지 소스는 준비 중 화면이 아니라 서식 화면(FormsScreen)을 쓴다', () => {
    expect(PAGES.map((p) => p.path as string)).not.toContain('/forms')
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/forms')
    const source = readFileSync(join(ROOT, pageFile('/forms')), 'utf8')
    expect(source).not.toMatch(/NotReadyScreen|notReadyFeature/)
    expect(source).toMatch(/from '@\/components\/forms\/FormsScreen'/)
  })

  it('AC-7423.1·AC-7423.2: /notices는 준비 중 주소가 아니다 — 페이지 표와 준비 중 목록에 없고, 페이지 소스는 준비 중 화면이 아니라 고시·공지 화면(NoticesScreen·NoticeDetail·KeywordsControl)을 쓴다', () => {
    expect(PAGES.map((p) => p.path as string)).not.toContain('/notices')
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/notices')
    const source = readFileSync(join(ROOT, pageFile('/notices')), 'utf8')
    expect(source).not.toMatch(/NotReadyScreen|notReadyFeature/)
    expect(source).toMatch(/from '@\/components\/notices\/list\/NoticesScreen'/)
    expect(source).toMatch(/from '@\/components\/notices\/detail\/NoticeDetail'/)
    expect(source).toMatch(/from '@\/components\/notices\/keywords\/KeywordsControl'/)
    // 쪽 파일은 서버 쪽이다: 화면을 놓기만 하고 고시·공지 표를 읽지 않는다(ADR-004)
    expect(source).not.toMatch(/['"]use client['"]|['"]use server['"]|supabase|guard\.server|lib\/storage|\bfetch\s*\(/)
  })

  it('AC-7512.1·AC-7512.2: /inventory는 준비 중 주소가 아니다 — 페이지 표와 준비 중 목록에 없고, 그 페이지 소스는 준비 중 화면이 아니라 재고 화면(InventoryScreen)을 쓴다', () => {
    expect(PAGES.map((p) => p.path as string)).not.toContain('/inventory')
    expect(NOT_READY_FEATURES.map((f) => f.path as string)).not.toContain('/inventory')
    const source = readFileSync(join(ROOT, pageFile('/inventory')), 'utf8')
    expect(source).not.toMatch(/NotReadyScreen|notReadyFeature/)
    expect(source).toMatch(/from '@\/components\/inventory\/InventoryScreen'/)
    expect(existsSync(join(ROOT, pageFile('/inventory')))).toBe(true)
  })

  it('AC-610.1: /patients 페이지는 준비 중 화면을 쓰지 않는 환자 탭이다', () => {
    const source = readFileSync(join(ROOT, pageFile('/patients')), 'utf8')
    expect(source).not.toMatch(/NotReadyScreen|notReadyFeature/)
    expect(source).toMatch(/from '@\/components\/patients\/PatientsEntry'/)
  })
})

describe('AC-305.6: 준비 중 주소는 문지기(decideRoute) 규칙 그대로 · 페이지 파일은 (app) 아래', () => {
  const HOSPITALS: HospitalState[] = ['none', 'pending', 'approved', 'rejected', 'unknown']

  it.each(PAGES)('AC-305.6: $path — 로그인 안 함 → /login', ({ path }) => {
    for (const hospital of HOSPITALS) {
      for (const isAdmin of [false, true]) expect(decideRoute({ path, signedIn: false, hospital, isAdmin })).toBe('/login')
    }
  })

  it.each(PAGES)('AC-305.6: $path — 병원 줄 없음 → /signup', ({ path }) => {
    for (const isAdmin of [false, true]) expect(decideRoute({ path, signedIn: true, hospital: 'none', isAdmin })).toBe('/signup')
  })

  it.each(PAGES)('AC-305.6: $path — 대기·거절 → /pending', ({ path }) => {
    for (const hospital of ['pending', 'rejected'] as const) {
      for (const isAdmin of [false, true]) expect(decideRoute({ path, signedIn: true, hospital, isAdmin })).toBe('/pending')
    }
  })

  it.each(PAGES)('AC-305.6: $path — 승인 → 그대로 연다(null, 관리자 아니어도)', ({ path }) => {
    for (const isAdmin of [false, true]) expect(decideRoute({ path, signedIn: true, hospital: 'approved', isAdmin })).toBeNull()
  })

  it.each(PAGES)('AC-305.6: $path 페이지 파일은 src/app/(app)/ 아래에 있다', ({ path }) => {
    expect(existsSync(join(ROOT, pageFile(path))), pageFile(path)).toBe(true)
  })

  it('AC-305.6: (app) 묶음의 layout이 앱 틀(AppShell)과 승인 검사(guardPage)를 준다', () => {
    const layout = readFileSync(join(ROOT, APP_GROUP, 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/guardPage\(/)
    expect(layout).toMatch(/<AppShell\b/)
  })
})

describe('/notices 쪽 파일 (AC-7423.2·AC-7424.13)', () => {
  const ME: Me = {
    email: 'manager@example.com',
    isAdmin: false,
    hospital: {
      id: 'h1',
      name: '가나 정형외과의원',
      applicantName: '홍길동',
      phone: null,
      email: 'manager@example.com',
      status: 'approved',
      createdAt: '2026-10-28T01:23:45+00:00',
    },
  }
  const ID = '0f8b9c2e-4a1d-4e6b-9c3f-2b7d5e8a1c40'

  beforeEach(() => {
    currentMe.mockReset()
    currentMe.mockResolvedValue(ME)
    NoticesScreen.mockReset()
    NoticesScreen.mockImplementation(({ keywords }) => <section data-list="">{keywords as ReactNode}</section>)
    NoticeDetail.mockReset()
    NoticeDetail.mockImplementation(({ id }) => <article data-detail={id} />)
    KeywordsMock.mockReset()
    KeywordsMock.mockImplementation(() => <span data-keywords="" />)
  })

  const draw = async (params: Record<string, string | string[] | undefined>) =>
    renderToStaticMarkup((await NoticesPage({ searchParams: Promise.resolve(params) })) as ReactElement)

  it('AC-7423.2·AC-7424.13: id가 없으면 글 목록(NoticesScreen)이고, keywords 자리에 KeywordsControl을 넣는다. 글 화면은 없다', async () => {
    const html = await draw({})
    expect(html).toBe('<section data-list=""><span data-keywords=""></span></section>')
    expect(NoticesScreen).toHaveBeenCalledTimes(1)
    const keywords = NoticesScreen.mock.calls[0]![0].keywords as ReactElement
    expect(isValidElement(keywords)).toBe(true)
    expect(keywords.type).toBe(KeywordsControl)
    expect(keywords.props).toEqual({})
    expect(NoticeDetail).not.toHaveBeenCalled()
    expect(currentMe).toHaveBeenCalledTimes(1)
  })

  it.each([ID, ID.toUpperCase()])('AC-7423.2·AC-7424.13: ?id=<uuid>(%s)면 그 id의 글 화면(NoticeDetail)이고 목록·내 낱말은 없다', async (id) => {
    const html = await draw({ id })
    expect(html).toBe(`<article data-detail="${id}"></article>`)
    expect(NoticeDetail).toHaveBeenCalledTimes(1)
    expect(NoticeDetail.mock.calls[0]![0]).toEqual({ id })
    expect(NoticesScreen).not.toHaveBeenCalled()
    expect(KeywordsMock).not.toHaveBeenCalled()
  })

  it.each([
    ['uuid 모양이 아님', 'abc'],
    ['빈 글자', ''],
    ['뒤에 글자가 더 붙음', `${ID}x`],
    ['여러 개', [ID, ID]],
  ])('AC-7423.2: id가 %s이면 글 화면이 아니라 글 목록이다', async (_why, id) => {
    const html = await draw({ id })
    expect(html).toContain('data-list')
    expect(NoticeDetail).not.toHaveBeenCalled()
  })

  it('AC-7423.2: 탭 이름은 "고시·공지"이고 준비 중 화면 글자가 없다', async () => {
    expect(noticesMetadata).toEqual({ title: '고시·공지' })
    const html = await draw({})
    expect(html).not.toContain('준비 중')
    expect(html).not.toContain('대시보드로 돌아가기')
  })

  // 데스크는 앱 틀(DeskGate)이 막힌 화면을 그린다(/notices는 데스크 주소가 아니다). 페이지가 던지면 앱 틀 대신 오류 화면이 뜬다 → 아무것도 그리지 않는다
  it('AC-7423.2·AC-7424.13: 데스크(병원 줄 없음 + desk)면 던지지 않고 아무것도 그리지 않는다 — 목록·글·낱말 부품을 부르지 않는다', async () => {
    currentMe.mockResolvedValue({ email: 'desk@example.com', isAdmin: false, hospital: null, desk: { hospitalId: 'h1', hospitalName: '가나 정형외과의원' } })
    for (const params of [{}, { id: ID }]) {
      await expect(NoticesPage({ searchParams: Promise.resolve(params) })).resolves.toBeNull()
    }
    expect(NoticesScreen).not.toHaveBeenCalled()
    expect(NoticeDetail).not.toHaveBeenCalled()
    expect(KeywordsMock).not.toHaveBeenCalled()
    expect(isDeskPath('/notices')).toBe(false)
  })

  it('AC-7423.2: 병원 줄이 없거나(데스크 아님) 승인되지 않았으면(문지기가 막아 오지 않는 길) 그리지 않고 던진다', async () => {
    currentMe.mockResolvedValue({ ...ME, hospital: null })
    await expect(NoticesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow()
    currentMe.mockResolvedValue({ ...ME, hospital: { ...ME.hospital!, status: 'pending' } })
    await expect(NoticesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow()
    expect(NoticesScreen).not.toHaveBeenCalled()
    expect(NoticeDetail).not.toHaveBeenCalled()
  })
})
