// @vitest-environment jsdom
import { createElement, type ComponentType } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { nestedBoxes } from '@/testing/boxes'
import PageError from './error'

// [로그아웃](AC-003.7)은 실제 Supabase에 붙지 않는다. signOut을 부르는지와 그 뒤 어디로 가는지만 본다
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }))

// Next는 error.tsx에 { error, reset }을 넘긴다. 이 화면은 그 값을 받지 않는다 → 넘겨도 보이지 않음을 확인한다
type NextErrorProps = { error: Error & { digest?: string }; reset: () => void }
const leak = Object.assign(new Error('relation "public.hospitals" does not exist'), {
  stack: 'Error: relation "public.hospitals" does not exist\n    at readMe (hospital.server.ts:12:7)',
  digest: '4213370001',
})
const reset = vi.fn()
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class') ?? '')
const page = () => render(createElement(PageError as ComponentType<NextErrorProps>, { error: leak, reset }))

// jsdom의 location.reload·assign은 바꿔 끼울 수 없다 → location을 통째로 가짜로
const reload = vi.fn()
const assign = vi.fn()
const replace = vi.fn()

beforeEach(() => {
  reload.mockReset()
  assign.mockReset()
  replace.mockReset()
  reset.mockReset()
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/dashboard', reload, assign, replace })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('app/error.tsx: 서버에서 내 병원 줄을 읽다가 실패', () => {
  it('AC-002.8: E-PAGE-FAILED 카드(무엇이·어떻게 고치나·오류 번호)를 보인다', () => {
    page()
    const card = screen.getByRole('alert')
    const info = errorInfo('E-PAGE-FAILED')
    expect(within(card).getByText(info.what).tagName).toBe('P')
    expect(within(card).getByText(info.fix).tagName).toBe('P')
    expect(within(card).getByText('오류 번호 E-PAGE-FAILED').tagName).toBe('P')
  })

  it('AC-002.8: 로그인·대시보드로 돌려보내지 않는다(이동 없음, 그쪽 링크 없음)', () => {
    page()
    expect(assign).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(location.href).toBe('http://localhost:3000/dashboard')
    const hrefs = screen.queryAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs.filter((h) => h === '/login' || h === '/dashboard')).toEqual([])
  })

  it('AC-002.8: [다시 시도]는 페이지를 새로 연다(서버가 처음부터 다시 읽는다)', async () => {
    const user = userEvent.setup()
    page()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })

  it('AC-012.2: Next가 넘긴 오류의 메시지·스택·digest는 화면에 보이지 않는다', () => {
    page()
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('relation')
    expect(text).not.toContain('hospitals')
    expect(text).not.toContain('hospital.server.ts')
    expect(text).not.toContain('4213370001')
  })
})

describe('app/error.tsx: [로그아웃] (오류가 이어져도 화면에 갇히지 않게)', () => {
  it('AC-003.7: [다시 시도] 바로 옆(다음)에 [로그아웃]이 있다(카드 밖, 카드 아래)', () => {
    page()
    const retry = screen.getByRole('button', { name: '다시 시도' })
    const signOutButton = screen.getByRole('button', { name: '로그아웃' })
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['다시 시도', '로그아웃'])
    expect(signOutButton.parentElement).toBe(retry.parentElement)
    expect(retry.nextElementSibling).toBe(signOutButton)
    const card = screen.getByRole('alert')
    expect(card.contains(signOutButton)).toBe(false)
    expect(card.compareDocumentPosition(signOutButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-003.7: [로그아웃]을 누르면 signOut() 뒤 /login을 새로 연다(AC-003.6과 같은 동작)', async () => {
    const user = userEvent.setup()
    page()
    expect(signOut).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(reload).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
  })

  it('AC-003.7: signOut()이 실패해도 /login으로 간다', async () => {
    signOut.mockRejectedValue(new Error('network'))
    const user = userEvent.setup()
    page()
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(document.body.textContent).not.toContain('network')
  })

  it('AC-003.7·AC-217.2: [다시 시도]는 주 단추(ds.button.primary), [로그아웃]은 보조 단추(ds.button.secondary)', () => {
    page()
    expect(classesOf(screen.getByRole('button', { name: '다시 시도' }))).toEqual(
      expect.arrayContaining(tokens(ds.button.primary)),
    )
    expect(classesOf(screen.getByRole('button', { name: '로그아웃' }))).toEqual(
      expect.arrayContaining(tokens(ds.button.secondary)),
    )
  })

  it('AC-003.7·AC-013.2: 두 단추는 한 줄에 나란히(flex·flex-wrap·gap-2, 좁으면 아래로), 단추마다 flex-[1_1_160px], 임의 색 없음', () => {
    page()
    const retry = screen.getByRole('button', { name: '다시 시도' })
    const row = retry.parentElement as HTMLElement
    expect(classesOf(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'gap-2']))
    for (const name of ['다시 시도', '로그아웃']) {
      expect(classesOf(screen.getByRole('button', { name })), name).toContain('flex-[1_1_160px]')
      // flex 크기를 정하는 클래스는 그것 하나(shrink-0 같은 것이 겹치면 어느 쪽이 이길지 모른다 — classes.ts 규칙)
      const flexSize = classesOf(screen.getByRole('button', { name })).filter((t) =>
        /^(flex-(?!col|row|wrap|nowrap)|grow|shrink|basis-)/.test(t.split(':').pop() ?? ''),
      )
      expect(flexSize, name).toEqual(['flex-[1_1_160px]'])
    }
    for (const el of document.querySelectorAll('[class]')) {
      expect(el.getAttribute('class') ?? '').not.toMatch(/\[#|rgba?\(|hsla?\(|color-mix\(/)
    }
  })

})

// b2b-redesign REQ-217 AC-217.2: 한 칸 AuthFrame(480 칸, 위 줄 로고) 본문에 오류 카드 → 단추 줄
describe('app/error.tsx: AuthFrame 안 오류 카드 + 단추 줄 (AC-217.2)', () => {
  it('AC-217.2: .app-ui 뿌리(surface) 안 가운데 480 칸 — 위 줄(header)은 로고 하나뿐이고 [로그아웃]·글자가 없다', () => {
    const { container } = page()
    const root = container.firstElementChild
    expect(classesOf(root as Element)).toEqual(expect.arrayContaining(['app-ui', 'bg-surface']))
    const header = screen.getByRole('banner')
    const main = screen.getByRole('main')
    expect(header.parentElement).toBe(main.parentElement)
    expect(main.parentElement?.parentElement).toBe(root)
    expect(classesOf(main.parentElement as HTMLElement)).toEqual(expect.arrayContaining(['mx-auto', 'w-full', 'max-w-120']))
    expect(header.querySelectorAll('svg[viewBox="0 0 30 30"]')).toHaveLength(1)
    expect(document.querySelectorAll('svg[viewBox="0 0 30 30"]')).toHaveLength(1)
    expect(header.textContent).toBe('')
    expect(within(header).queryAllByRole('button')).toHaveLength(0)
    // 옛 400 칸·화면 가운데 맞춤 틀은 없다
    for (const el of document.querySelectorAll('[class]')) expect(classesOf(el)).not.toContain('max-w-100')
  })

  it('AC-217.2: 본문(main)은 오류 카드 → 단추 줄 순서이고, 오류 카드(위 줄 아래 24px)·단추 줄 모두 위 24px', () => {
    page()
    const main = screen.getByRole('main')
    const card = screen.getByRole('alert')
    const row = screen.getByRole('button', { name: '다시 시도' }).parentElement as HTMLElement
    expect(main.children).toHaveLength(2)
    // 첫 칸이 오류 카드를 담고 위 24px(가입 신청·승인 대기의 단계 줄, 거절의 상태 줄과 같은 시작 높이)
    const first = main.children[0] as HTMLElement
    expect(first.contains(card)).toBe(true)
    expect(classesOf(first)).toContain('mt-6')
    expect(main.children[1]).toBe(row)
    expect(classesOf(row)).toContain('mt-6')
  })

  it('AC-217.2: 글자는 오류 카드 글·[다시 시도]·[로그아웃] 그대로이고 이동 링크가 없다', () => {
    const { container } = page()
    const info = errorInfo('E-PAGE-FAILED')
    expect(container.textContent).toBe(`${info.what}${info.fix}오류 번호 E-PAGE-FAILED다시 시도로그아웃`)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(container.querySelectorAll('a')).toHaveLength(0)
  })

  it('AC-204.7·AC-217.2: 오류 화면에 상자 안 상자가 없다', () => {
    const { container } = page()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })
})
