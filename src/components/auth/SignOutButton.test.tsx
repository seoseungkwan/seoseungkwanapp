// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignOutButton } from './SignOutButton'

// 로그아웃은 signOutAndLeave() 한 곳이 한다(AC-403.4). signOut 기다림·오류·던짐·5초·쿠키 지우기·/login 이동은
// leave.test.ts(AC-403.1·403.2·403.5)가 본다 → 여기서는 단추가 그것을 부르는지만 본다
const { signOutAndLeave } = vi.hoisted(() => ({ signOutAndLeave: vi.fn() }))
vi.mock('@/lib/auth/leave', () => ({ signOutAndLeave }))

beforeEach(() => {
  signOutAndLeave.mockReset()
  signOutAndLeave.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('SignOutButton', () => {
  it('AC-003.6: [로그아웃]은 signOutAndLeave()로 signOut()을 기다린 뒤 /login을 새로 연다(location.assign)', async () => {
    signOutAndLeave.mockReturnValue(new Promise(() => {})) // 기다리는 일은 signOutAndLeave가 한다
    const user = userEvent.setup()
    render(<SignOutButton />)
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
    expect(signOutAndLeave).toHaveBeenCalledWith()
  })

  it('AC-003.6: signOutAndLeave()로 signOut()이 던져도 /login으로 간다', async () => {
    const user = userEvent.setup()
    render(<SignOutButton />)
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
  })

  it('AC-003.6: signOutAndLeave()로 signOut()이 오류를 돌려줘도 /login으로 간다(오류 내용은 보이지 않는다)', async () => {
    const user = userEvent.setup()
    render(<SignOutButton />)
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toBe('로그아웃') // 단추 말고 다른 글자(오류 내용)를 그리지 않는다
  })

  it('AC-003.6: [다른 계정으로 로그인]처럼 글자를 바꿔도 같은 동작', async () => {
    const user = userEvent.setup()
    render(<SignOutButton>다른 계정으로 로그인</SignOutButton>)
    expect(screen.queryByRole('button', { name: '로그아웃' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '다른 계정으로 로그인' }))
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
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
    expect(signOutAndLeave).not.toHaveBeenCalled()
  })

  it('AC-403.4: [로그아웃]은 IdleLogout과 같은 signOutAndLeave()(lib/auth/leave)를 눌렀을 때 한 번 부른다', async () => {
    const user = userEvent.setup()
    render(<SignOutButton />)
    expect(signOutAndLeave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(signOutAndLeave).toHaveBeenCalledTimes(1)
    // 단추가 따로 로그아웃하는 길을 두지 않는다(Supabase를 직접 부르지 않는다)
    const source = readFileSync(join(process.cwd(), 'src/components/auth/SignOutButton.tsx'), 'utf8')
    expect(source).toContain("from '@/lib/auth/leave'")
    expect(source).not.toContain('supabase')
  })
})
