// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ComponentType } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import styles from '@/components/common/ErrorCard.module.css'
import { errorInfo } from '@/lib/errors'
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

  it('AC-003.7: [다시 시도]는 Primary, [로그아웃]은 Secondary 단추 모양(목업 A)', () => {
    page()
    expect(screen.getByRole('button', { name: '다시 시도' }).className).toBe(styles.primary)
    expect(screen.getByRole('button', { name: '로그아웃' }).className).toBe(styles.secondary)
  })

  it('AC-003.7: 두 단추는 한 줄에 나란히(좁으면 아래로), Secondary는 흰 바탕·남색 글자·옅은 테두리(globals.css 변수만)', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/common/ErrorCard.module.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    const rule = (name: string) => css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
    const actions = rule('actions')
    expect(actions).toMatch(/display:\s*flex/)
    expect(actions).toMatch(/flex-wrap:\s*wrap/)
    expect(actions).toMatch(/gap:\s*12px/)
    for (const name of ['primary', 'secondary']) {
      const r = rule(name)
      expect(r, name).toMatch(/flex:\s*1 1 160px/)
      expect(r, name).toMatch(/min-height:\s*52px/)
      expect(r, name).toMatch(/border-radius:\s*999px/)
      expect(r, name).toMatch(/font-size:\s*15px/)
      expect(r, name).toMatch(/font-weight:\s*700/)
    }
    expect(rule('primary')).toMatch(/background:\s*var\(--text-strong\)/)
    const secondary = rule('secondary')
    expect(secondary).toMatch(/background:\s*var\(--bg-page\)/)
    expect(secondary).toMatch(/color:\s*var\(--text-strong\)/)
    expect(secondary).toMatch(/border:\s*1px solid color-mix\(in srgb, var\(--text-strong\) 15%, transparent\)/)
  })
})
