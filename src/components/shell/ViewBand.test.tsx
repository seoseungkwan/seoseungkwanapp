// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { ViewBand, ViewCookieSync } from './ViewBand'

// 보는 중 맨 위 띠 + 남은 보기 쿠키 지우기 (admin-view REQ-8006 AC-8006.2·AC-8006.5·AC-8006.7, design.md '앱 틀'·'화면 글자', 시안 .band).
// 실제 Supabase에 붙지 않는다 — 보기 끝(stopAdminView)은 가짜, 쿠키·location은 흉내 낸다

const { pathname, stopAdminView } = vi.hoisted(() => ({ pathname: vi.fn(() => '/dashboard'), stopAdminView: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: pathname, useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/lib/auth/adminView', () => ({ stopAdminView, startAdminView: vi.fn(), listViewHospitals: vi.fn() }))

const VIEWING = { hospitalId: '22222222-2222-4222-8222-222222222222', name: '다라 정형외과의원' }
const KEY = '33333333-3333-4333-8333-333333333333'
const CLEAR = 'ssk_view=; Path=/; SameSite=Lax; Secure; Max-Age=0'

// 쿠키 흉내: 이름=값 한 쌍씩 두고 Max-Age=0이면 지운다. 쓴 글은 차례대로 모은다
let jar = new Map<string, string>()
let writes: string[] = []
const events: string[] = []
const assign = vi.fn((to: string) => events.push(`assign ${to}`))
const reload = vi.fn(() => events.push('reload'))

function fakeCookies({ sticky = false }: { sticky?: boolean } = {}) {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (text: string) => {
      writes.push(text)
      events.push(`cookie ${text}`)
      const [pair, ...attrs] = text.split(';').map((s) => s.trim())
      const at = pair!.indexOf('=')
      const name = pair!.slice(0, at)
      if (attrs.some((a) => a.toLowerCase() === 'max-age=0')) {
        if (!sticky) jar.delete(name)
      } else jar.set(name, pair!.slice(at + 1))
    },
  })
}

beforeEach(() => {
  pathname.mockReturnValue('/dashboard')
  stopAdminView.mockReset()
  stopAdminView.mockImplementation(async () => {
    events.push('stop')
  })
  jar = new Map([['sb-auth', 'x']])
  writes = []
  events.length = 0
  assign.mockClear()
  reload.mockClear()
  fakeCookies()
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/dashboard', pathname: '/dashboard', assign, reload, replace: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (document as unknown as Record<string, unknown>).cookie
})

const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect(tokens(el)).toEqual(expect.arrayContaining(classes.split(/\s+/).filter(Boolean)))
const iconInner = (name: 'eye') => renderToStaticMarkup(<Icon name={name} />).replace(/^<svg\b[^>]*>|<\/svg>$/g, '')
const band = () => screen.getByRole('status')
const back = () => screen.getByRole('button', { name: '내 의원으로' })

describe('AC-8006.2 ViewBand — 글·차례', () => {
  it('AC-8006.2: 글은 "{의원 이름} 보는 중 · 읽기만" + "· 예약·환자·청구 탭과 저장·고치기 단추는 숨겼어요" + [내 의원으로]이고 눈 아이콘이 맨 앞이다', () => {
    render(<ViewBand viewing={VIEWING} />)
    const root = band()
    expect(root.hasAttribute('data-view-band')).toBe(true)
    const inner = root.firstElementChild as HTMLElement
    const [eye, title, hint, button] = Array.from(inner.children) as HTMLElement[]
    expect(inner.children).toHaveLength(4)
    expect(eye!.tagName.toLowerCase()).toBe('svg')
    expect(eye!.innerHTML).toBe(iconInner('eye'))
    expect(eye!.getAttribute('aria-hidden')).toBe('true')
    expect(title!.textContent).toBe('다라 정형외과의원 보는 중 · 읽기만')
    expect(hint!.textContent).toBe('· 예약·환자·청구 탭과 저장·고치기 단추는 숨겼어요')
    expect(button).toBe(back())
    expect(button!.getAttribute('type')).toBe('button')
    expect(root.textContent).toBe('다라 정형외과의원 보는 중 · 읽기만· 예약·환자·청구 탭과 저장·고치기 단추는 숨겼어요내 의원으로')
  })

  it.each(['/admin', '/admin/compare'])('AC-8006.2: 관리자 화면 %s에서는 띠를 그리지 않는다', (path) => {
    pathname.mockReturnValue(path)
    const { container } = render(<ViewBand viewing={VIEWING} />)
    expect(container.innerHTML).toBe('')
  })

  it.each(['/dashboard', '/stats', '/settings', '/administrator', '/location'])('AC-8006.2: 관리자 화면 밖 %s에서는 띠가 있다', (path) => {
    pathname.mockReturnValue(path)
    render(<ViewBand viewing={VIEWING} />)
    expect(band()).toBeTruthy()
  })
})

describe('AC-8006.2·AC-8006.7 ViewBand — 모양(시안 .band, 토큰만)', () => {
  it('AC-8006.2: 44px · warning-soft 바탕 + 아래 1px line, 안쪽은 1280 폭·좌우 24px·사이 8px', () => {
    render(<ViewBand viewing={VIEWING} />)
    hasAll(band(), 'border-b border-line bg-warning-soft')
    hasAll(band().firstElementChild!, 'mx-auto flex h-11 w-full max-w-7xl items-center gap-2 px-6')
  })

  it('AC-8006.2: 눈 아이콘 warning · 의원 이름 600 · 읽기만 600 warning · 안내 small ink-2 · [내 의원으로] ds.button.secondarySmall 오른쪽 끝', () => {
    render(<ViewBand viewing={VIEWING} />)
    const [eye, title, hint] = Array.from(band().firstElementChild!.children)
    hasAll(eye!, 'shrink-0 text-warning')
    hasAll(title!, 'min-w-0 truncate text-body text-ink')
    expect(screen.getByText('다라 정형외과의원').tagName.toLowerCase()).toBe('b')
    hasAll(screen.getByText('다라 정형외과의원'), 'font-semibold')
    hasAll(screen.getByText('읽기만'), 'font-semibold text-warning')
    hasAll(hint!, 'min-w-0 truncate text-small text-ink-2')
    hasAll(back(), `${ds.button.secondarySmall} ml-auto`)
  })

  it('AC-8006.7: 소스에 폰 전용 모양(max-md:)·임의 색이 없다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/shell/ViewBand.tsx'), 'utf8')
    expect(source).not.toContain('max-md:')
    expect(source).not.toMatch(/\[#|\b(?:rgba?|hsla?|oklch|color-mix)\(/)
  })
})

describe('AC-8006.5 ViewBand [내 의원으로]', () => {
  it('AC-8006.5: 누르면 stopAdminView()를 한 번 부르고, 보기 쿠키를 지운 뒤 /dashboard를 새로 연다(차례대로)', async () => {
    jar.set('ssk_view', KEY)
    const user = userEvent.setup()
    render(<ViewBand viewing={VIEWING} />)
    await user.click(back())
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'))
    expect(stopAdminView).toHaveBeenCalledTimes(1)
    expect(stopAdminView).toHaveBeenCalledWith()
    expect(events).toEqual(['stop', `cookie ${CLEAR}`, 'assign /dashboard'])
    expect(jar.has('ssk_view')).toBe(false)
    expect(assign).toHaveBeenCalledTimes(1)
  })

  it('AC-8006.5: stopAdminView()가 실패해도 쿠키를 지우고 /dashboard로 간다(오류 글 없음)', async () => {
    stopAdminView.mockRejectedValue(new Error('network down'))
    jar.set('ssk_view', KEY)
    const user = userEvent.setup()
    render(<ViewBand viewing={VIEWING} />)
    await user.click(back())
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'))
    expect(writes).toEqual([CLEAR])
    expect(document.body.textContent).not.toContain('network down')
  })

  it('AC-8006.5: 끝내는 동안 단추는 aria-busy이고 다시 눌러도 한 번만 부른다', async () => {
    let finish: () => void = () => {}
    stopAdminView.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    render(<ViewBand viewing={VIEWING} />)
    await user.click(back())
    expect(back().getAttribute('aria-busy')).toBe('true')
    await user.click(back())
    expect(stopAdminView).toHaveBeenCalledTimes(1)
    expect(assign).not.toHaveBeenCalled()
    await act(async () => finish())
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1))
  })

  it('AC-8006.5: 그리기만 해서는 끝내지도 쿠키를 쓰지도 않는다', () => {
    jar.set('ssk_view', KEY)
    render(<ViewBand viewing={VIEWING} />)
    expect(stopAdminView).not.toHaveBeenCalled()
    expect(writes).toEqual([])
    expect(assign).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('AC-8006.5 ViewCookieSync — 보는 의원이 없는데 보기 쿠키가 남으면', () => {
  it('AC-8006.5: 쿠키를 지우고 한 번 새로 연다(location.reload). 아무것도 그리지 않는다', async () => {
    jar.set('ssk_view', KEY)
    const { container } = render(<ViewCookieSync />)
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(events).toEqual([`cookie ${CLEAR}`, 'reload'])
    expect(jar.has('ssk_view')).toBe(false)
    expect(container.innerHTML).toBe('')
  })

  it('AC-8006.5: 보기 쿠키가 없으면(다른 쿠키만) 아무것도 쓰지 않고 새로 열지 않는다', () => {
    render(<ViewCookieSync />)
    expect(writes).toEqual([])
    expect(reload).not.toHaveBeenCalled()
  })

  it('AC-8006.5: 쿠키 값이 열쇠 모양이 아니어도(꾸민 값) 남은 보기 쿠키로 보지 않는다 — 지우지도 새로 열지도 않는다', () => {
    jar.set('ssk_view', 'not-a-key')
    render(<ViewCookieSync />)
    expect(writes).toEqual([])
    expect(reload).not.toHaveBeenCalled()
  })

  it('AC-8006.5: 지운 뒤에도 쿠키가 남아 있으면(지우기가 안 먹음) 새로 열지 않는다 — 끝없이 새로 열지 않게', async () => {
    fakeCookies({ sticky: true })
    jar.set('ssk_view', KEY)
    render(<ViewCookieSync />)
    await waitFor(() => expect(writes).toEqual([CLEAR]))
    expect(reload).not.toHaveBeenCalled()
  })
})
