// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignOutButton } from './SignOutButton'

// 실제 Supabase에 붙지 않는다. signOut을 부르는지와 그 뒤 어디로 가는지만 본다
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }))

// jsdom의 location.assign은 바꿔 끼울 수 없다 → location을 통째로 가짜로
const assign = vi.fn()
const replace = vi.fn()

beforeEach(() => {
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
  assign.mockReset()
  replace.mockReset()
  vi.stubGlobal('location', { origin: 'http://localhost:3000', href: 'http://localhost:3000/pending', assign, replace })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SignOutButton', () => {
  it('AC-003.6: [로그아웃]은 signOut()을 기다린 뒤 /login을 새로 연다(location.assign)', async () => {
    let finish: (value: { error: null }) => void = () => {}
    signOut.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    render(<SignOutButton />)
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledWith() // 기본(전역) 로그아웃 → 갱신 토큰까지 끊는다
    expect(assign).not.toHaveBeenCalled() // signOut을 기다린 뒤에 간다
    finish({ error: null })
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(assign).toHaveBeenCalledTimes(1)
    expect(replace).not.toHaveBeenCalled()
  })

  it('AC-003.6: signOut()이 던져도 /login으로 간다', async () => {
    signOut.mockRejectedValue(new Error('network'))
    const user = userEvent.setup()
    render(<SignOutButton />)
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
  })

  it('AC-003.6: signOut()이 오류를 돌려줘도 /login으로 간다(오류 내용은 보이지 않는다)', async () => {
    signOut.mockResolvedValue({ error: new Error('session missing') })
    const user = userEvent.setup()
    render(<SignOutButton />)
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(document.body.textContent).not.toContain('session missing')
  })

  it('AC-003.6: [다른 계정으로 로그인]처럼 글자를 바꿔도 같은 동작', async () => {
    const user = userEvent.setup()
    render(<SignOutButton>다른 계정으로 로그인</SignOutButton>)
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '다른 계정으로 로그인' }))
    expect(signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
  })

  it('AC-003.6: 링크가 아니라 type="button" 단추이고, 모양은 쓰는 곳이 준 className을 단다', () => {
    render(<SignOutButton className="secondary-look" />)
    const button = screen.getByRole('button', { name: '로그아웃' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.className).toBe('secondary-look')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('AC-003.6: 그리기만 해서는 로그아웃하지도 이동하지도 않는다', () => {
    render(<SignOutButton />)
    expect(signOut).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })
})
