// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { useReadOnly, useViewing } from './viewing'

// 앱 틀 — 다른 의원 보는 중 (admin-view REQ-8006 AC-8006.2~AC-8006.5·AC-8006.7, design.md '앱 틀', 시안 ?s=viewing).
// AppShell의 새 선택 prop viewing이 있으면 맨 위 띠·탭 빼기·ViewGate·ViewingProvider, 관리자면 머리에 '보는 의원' 단추.
// 실제 Supabase에 붙지 않는다. 의원 이름·메일은 지어낸 값이다

vi.setConfig({ testTimeout: 60_000 })

const { pathname, router, listViewHospitals } = vi.hoisted(() => ({
  pathname: vi.fn(() => '/dashboard'),
  router: { replace: vi.fn() },
  listViewHospitals: vi.fn(),
}))
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => router }))
vi.mock('@/lib/storage/notices', () => ({ NOTICES_CHANGED: 'notices:changed', unreadCount: vi.fn(async () => 'failed') }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/lib/auth/adminView', () => ({ listViewHospitals, startAdminView: vi.fn(), stopAdminView: vi.fn() }))

const HOSPITAL = '가나 정형외과의원'
const EMAIL = 'manager@example.com'
const VIEWING = { hospitalId: '22222222-2222-4222-8222-222222222222', name: '다라 정형외과의원' }
const KEY = '33333333-3333-4333-8333-333333333333'
const CLEAR = 'ssk_view=; Path=/; SameSite=Lax; Secure; Max-Age=0'
const ALL_TABS = ['대시보드', '통계', '청구', '고시·공지', '환자', '업무일지', '수납일지', '예약']
const VIEW_TABS = ['대시보드', '통계', '고시·공지', '업무일지', '수납일지']

let cookie = ''
let writes: string[] = []
const reload = vi.fn()

function Probe() {
  return <p data-testid="probe">{`${useViewing()?.name ?? '없음'}|${useReadOnly() ? '읽기만' : '쓰기'}`}</p>
}

type ShellProps = Partial<Parameters<typeof AppShell>[0]>
const shell = (props: ShellProps = {}) => (
  <AppShell hospitalName={HOSPITAL} email={EMAIL} isAdmin {...props}>
    <Probe />
  </AppShell>
)

beforeEach(() => {
  pathname.mockReturnValue('/dashboard')
  router.replace.mockReset()
  listViewHospitals.mockReset()
  listViewHospitals.mockResolvedValue([])
  cookie = ''
  writes = []
  reload.mockClear()
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => cookie,
    set: (text: string) => {
      writes.push(text)
      if (text.includes('Max-Age=0')) cookie = ''
    },
  })
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/dashboard', pathname: '/dashboard', assign: vi.fn(), reload, replace: vi.fn() })
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (document as unknown as Record<string, unknown>).cookie
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

const nav = () => screen.getByRole('navigation', { name: '메뉴' })
const tabs = () => within(nav()).getAllByRole('link').map((a) => a.textContent)
const stickyGroup = () => screen.getByRole('banner').parentElement as HTMLElement
const band = () => document.querySelector('[data-view-band]')

describe('AC-8006.2 AppShell viewing — 맨 위 띠 · 머리 이름 · 읽기만 본문', () => {
  it('AC-8006.2: 위에 붙는 묶음 맨 위가 띠이고 그다음 머리·탭 줄이다. 머리 이름은 보는 의원, 계정 단추는 내 메일 그대로', () => {
    render(shell({ viewing: VIEWING }))
    const group = stickyGroup()
    expect(Array.from(group.children)).toEqual([band(), screen.getByRole('banner'), nav()])
    expect(band()!.textContent).toContain('다라 정형외과의원 보는 중 · 읽기만')
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('다라 정형외과의원')).toBeTruthy()
    expect(within(banner).queryByText(HOSPITAL)).toBeNull()
    expect(within(banner).getByRole('button', { name: `${EMAIL} 계정 메뉴` })).toBeTruthy()
  })

  it('AC-8006.2: 계정 메뉴 머리는 내 메일과 내 의원 이름이다(계정은 내 것)', async () => {
    const user = userEvent.setup()
    render(shell({ viewing: VIEWING }))
    await user.click(screen.getByRole('button', { name: `${EMAIL} 계정 메뉴` }))
    const menu = screen.getByRole('menu', { name: '계정' })
    const head = document.getElementById(menu.getAttribute('aria-describedby')!) as HTMLElement
    expect(head.textContent).toContain(EMAIL)
    expect(head.textContent).toContain(HOSPITAL)
  })

  it('AC-8006.2: 본문은 ViewingProvider 안이다(보는 의원·읽기만)', () => {
    render(shell({ viewing: VIEWING }))
    expect(within(screen.getByRole('main')).getByTestId('probe').textContent).toBe('다라 정형외과의원|읽기만')
  })

  it.each(['/admin', '/admin/compare'])('AC-8006.2: 관리자 화면 %s에서는 띠가 없고 본문은 읽기만이 아니다', (path) => {
    pathname.mockReturnValue(path)
    render(shell({ viewing: VIEWING }))
    expect(band()).toBeNull()
    expect(Array.from(stickyGroup().children)).toEqual([screen.getByRole('banner'), nav()])
    expect(screen.getByTestId('probe').textContent).toBe('없음|쓰기')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('AC-8006.2: 띠가 있으면 본문 건너뛰기 자리(scroll-margin)가 띠 45px만큼 길다(102 → 147px), 띠가 없는 관리자 화면은 그대로', () => {
    render(shell({ viewing: VIEWING }))
    expect(screen.getByRole('main').className.split(/\s+/)).toContain('group-has-[[data-view-band]]/app:scroll-mt-36.75')
  })

  it('AC-8006.2: viewing이 없으면(undefined·null) 띠가 없고 앱 틀의 글자·차례·클래스가 viewing을 주지 않은 지금 앱 틀과 같다', () => {
    for (const isAdmin of [false, true]) {
      const plain = renderToStaticMarkup(
        <AppShell hospitalName={HOSPITAL} email={EMAIL} isAdmin={isAdmin}>
          <Probe />
        </AppShell>,
      )
      const none = renderToStaticMarkup(shell({ isAdmin, viewing: null }))
      expect(none, String(isAdmin)).toBe(plain)
      expect(plain).not.toContain('data-view-band')
      expect(plain).toContain('없음|쓰기')
    }
    render(shell({ isAdmin: false }))
    expect(Array.from(stickyGroup().children)).toEqual([screen.getByRole('banner'), nav()])
    expect(tabs()).toEqual(ALL_TABS)
    expect(screen.getByRole('main').className).toBe('flex-1 scroll-mt-25.5 bg-surface focus:outline-none max-md:scroll-mt-23.5')
  })
})

describe('AC-8006.3 AppShell viewing — 탭 띠·[더보기]에서 예약·환자·청구 빼기', () => {
  it('AC-8006.3: 보는 중 탭 띠에 청구·환자·예약이 없다(차례는 그대로)', () => {
    render(shell({ viewing: VIEWING }))
    expect(tabs()).toEqual(VIEW_TABS)
  })

  it('AC-8006.3: [더보기] 안의 다른 탭(입지 분석·설정·직원·재고·주소록·AI 리포트·서식)은 모두 보인다', async () => {
    const user = userEvent.setup()
    render(shell({ viewing: VIEWING }))
    await user.click(within(nav()).getByRole('button', { name: /더보기/ }))
    const links = Array.from(nav().querySelectorAll('a')).map((a) => a.textContent ?? '')
    for (const label of ['입지 분석', '설정', '직원', '재고', '주소록', 'AI 리포트', '서식']) {
      expect(links.some((text) => text.startsWith(label)), label).toBe(true)
    }
    for (const label of ['청구', '환자', '예약']) expect(links.some((text) => text === label), label).toBe(false)
  })

  it.each(['/claim', '/claim/setup', '/patients', '/calendar'])('AC-8006.3: 보는 중 %s이면 본문을 그리지 않고 /dashboard로 한 번 바꾼다', (path) => {
    pathname.mockReturnValue(path)
    render(shell({ viewing: VIEWING }))
    expect(within(screen.getByRole('main')).queryByTestId('probe')).toBeNull()
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard')
  })

  it('AC-8006.3: 보는 중이 아니면 그 주소들도 지금처럼 본문을 그린다(돌려보내지 않는다)', () => {
    pathname.mockReturnValue('/claim')
    render(shell({ viewing: null }))
    expect(screen.getByTestId('probe')).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('AC-8006.3: 관리자만 보는 탭 숨김(hiddenTabs)과 함께 빼도 둘 다 빠진다', () => {
    render(shell({ viewing: VIEWING, hiddenTabs: ['/sunap'] }))
    expect(tabs()).toEqual(['대시보드', '통계', '고시·공지', '업무일지'])
  })
})

// 자료실(library AC-8108.4)은 보는 중에도 [더보기]에 있고 /library는 막히지 않는다(ViewGate가 막는 주소는 예약·환자·청구뿐)
describe('AC-8108.4 AppShell viewing — 자료실은 그대로', () => {
  it('AC-8108.4: 보는 중 [더보기] 판에 자료실(/library)이 입지 분석 다음·설정 앞에 있다', async () => {
    const user = userEvent.setup()
    render(shell({ viewing: VIEWING }))
    await user.click(within(nav()).getByRole('button', { name: /더보기/ }))
    const panelLinks = Array.from(nav().querySelectorAll('ul a'))
    expect(panelLinks.map((a) => a.firstElementChild?.textContent)).toEqual(['AI 리포트', '서식', '직원', '재고', '주소록', '입지 분석', '자료실', '설정'])
    expect(nav().querySelector('a[href="/library"]')?.textContent).toBe('자료실')
  })

  it.each(['/library', '/library/x'])('AC-8108.4: 보는 중 %s은 돌려보내지 않고 본문(읽기만)을 그린다. [더보기] 단추는 "더보기 · 자료실"이다', (path) => {
    pathname.mockReturnValue(path)
    render(shell({ viewing: VIEWING }))
    expect(within(screen.getByRole('main')).getByTestId('probe').textContent).toBe('다라 정형외과의원|읽기만')
    expect(router.replace).not.toHaveBeenCalled()
    expect(band()).toBeTruthy()
    expect(within(nav()).getByRole('button', { name: /더보기/ }).textContent).toBe('더보기 · 자료실')
  })
})

describe('AC-8006.4 AppShell — 머리의 "보는 의원" 단추', () => {
  it('AC-8006.4: 관리자(데스크 아님)면 머리 오른쪽에 보는 의원 단추 → 시계 → 계정 단추 차례다', () => {
    render(shell({ viewing: null }))
    const banner = screen.getByRole('banner')
    const picker = within(banner).getByRole('button', { name: '보는 의원' })
    const account = within(banner).getByRole('button', { name: `${EMAIL} 계정 메뉴` })
    const right = account.parentElement!.parentElement as HTMLElement
    const order = Array.from(right.children)
    expect(order).toHaveLength(3)
    expect(order[0]!.contains(picker)).toBe(true)
    expect(order[1]!.textContent).toMatch(/\(KST\)$/)
    expect(order[2]!.contains(account)).toBe(true)
    expect(listViewHospitals).not.toHaveBeenCalled()
  })

  it('AC-8006.4: 보는 중이면 단추가 켜짐 모양(accent 테두리)이다', () => {
    render(shell({ viewing: VIEWING }))
    expect(within(screen.getByRole('banner')).getByRole('button', { name: '보는 의원' }).className).toContain('border-accent')
  })

  it('AC-8006.4: 관리자가 아니거나 데스크면 단추가 없다', () => {
    render(shell({ isAdmin: false }))
    expect(screen.queryByRole('button', { name: '보는 의원' })).toBeNull()
    cleanup()
    pathname.mockReturnValue('/sunap')
    render(shell({ isAdmin: true, desk: true }))
    expect(screen.queryByRole('button', { name: '보는 의원' })).toBeNull()
  })

  it('AC-8006.4: 판을 열면 listViewHospitals()를 한 번 읽는다', async () => {
    const user = userEvent.setup()
    render(shell({ viewing: null }))
    await user.click(screen.getByRole('button', { name: '보는 의원' }))
    await waitFor(() => expect(listViewHospitals).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('dialog', { name: '다른 의원 보기' })).toBeTruthy()
  })
})

describe('AC-8006.5 AppShell — 남은 보기 쿠키', () => {
  it('AC-8006.5: viewing이 없는데 보기 쿠키가 남아 있으면 앱 틀이 쿠키를 지우고 한 번 새로 연다', async () => {
    cookie = `sb=x; ssk_view=${KEY}`
    render(shell({ viewing: null }))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(writes).toEqual([CLEAR])
  })

  it('AC-8006.5: 관리자가 아닌 원장·데스크도 쿠키가 남았으면 지우고 한 번 새로 연다(관리자에서 빠짐)', async () => {
    cookie = `ssk_view=${KEY}`
    render(shell({ isAdmin: false }))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(writes).toEqual([CLEAR])
  })

  it('AC-8006.5: 보는 중(viewing 있음)이면 쿠키를 그대로 두고 새로 열지 않는다 — 새로 고쳐도 보던 의원 그대로', async () => {
    cookie = `ssk_view=${KEY}`
    render(shell({ viewing: VIEWING }))
    cleanup()
    render(shell({ viewing: VIEWING }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(writes).toEqual([])
    expect(reload).not.toHaveBeenCalled()
    expect(band()).toBeTruthy()
  })

  it('AC-8006.5: 쿠키가 없으면 아무것도 쓰지 않는다', async () => {
    render(shell({ viewing: null }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(writes).toEqual([])
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('AC-8006.7 AppShell — 폰 전용 모양 없음 · 토큰 색만', () => {
  it('AC-8006.7: AppShell의 max-md: 클래스 수는 이 기능 전과 같다(9개) — 새 폰 전용 모양이 없다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/shell/AppShell.tsx'), 'utf8')
    expect(source.match(/max-md:/g) ?? []).toHaveLength(9)
    expect(source).not.toMatch(/\[#|\b(?:rgba?|hsla?|oklch|color-mix)\(/)
  })
})
