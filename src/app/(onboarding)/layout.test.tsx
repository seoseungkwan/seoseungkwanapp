// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OnboardingLayout from './layout'

// 가입 신청·승인 대기 화면 묶음((onboarding) 레이아웃, REQ-402). 로그인한 사람만 보는 화면이라 앱 화면처럼 자동 로그아웃을 붙인다.
// 자동 로그아웃 자체는 IdleLogout.test.tsx가 본다. 여기서는 하나 붙는지와 페이지를 그대로 그리는지만
vi.mock('@/components/shell/IdleLogout', () => ({ IdleLogout: () => <span data-testid="idle-logout" /> }))

afterEach(cleanup)

describe('(onboarding) 레이아웃', () => {
  it('AC-402.1: 가입·대기 화면 묶음에 자동 로그아웃(IdleLogout)을 하나 붙인다', () => {
    render(
      <OnboardingLayout>
        <h1>가입 신청</h1>
      </OnboardingLayout>,
    )
    expect(screen.getAllByTestId('idle-logout')).toHaveLength(1)
  })

  it('AC-402.1: children을 감싸거나 바꾸지 않고 그대로 그린다(IdleLogout 다음, 다른 요소 없음)', () => {
    const { container } = render(
      <OnboardingLayout>
        <main>
          <h1>승인 대기</h1>
        </main>
        <p>둘째 자식</p>
      </OnboardingLayout>,
    )
    expect(container.innerHTML).toBe('<span data-testid="idle-logout"></span><main><h1>승인 대기</h1></main><p>둘째 자식</p>')
  })
})
