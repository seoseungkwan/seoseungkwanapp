// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DashboardSkeleton } from './DashboardSkeleton'

// 저장 숫자를 읽는 동안의 뼈대 (dashboard-ux REQ-2701 AC-2701.1, design.md §2, 시안 docs/mockups/dashboard-ux/index.html skeleton()).
// jsdom은 CSS를 계산하지 않는다 → 짜임(차례·aria-hidden)과 글자를 본다

afterEach(cleanup)

describe('AC-2701.1: 저장 숫자를 읽는 동안의 뼈대', () => {
  it('AC-2701.1: 실제 배치와 같은 차례(머리 줄 · 숫자 칸 4 · AI 요약 자리 · 그래프 자리)의 꾸밈은 모두 aria-hidden이고, 화면 읽기는 role=status 글 하나만 읽는다 — 숫자 글자·연결 전 화면·h1·단추·링크가 없다', () => {
    const { container } = render(<DashboardSkeleton />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('대시보드 숫자를 불러오고 있어요')
    expect(status.closest('[aria-hidden="true"]')).toBeNull()

    // 꾸밈 묶음 하나 안에 네 자리가 이 차례로 있다
    const parts = Array.from(container.querySelectorAll('[data-part]'))
    expect(parts.map((part) => part.getAttribute('data-part'))).toEqual(['header', 'numbers', 'ai', 'charts'])
    for (const part of parts) expect(part.closest('[aria-hidden="true"]'), part.getAttribute('data-part')!).not.toBeNull()
    expect(parts[1]!.children).toHaveLength(4)

    // 보이는 글자는 status 글뿐이고 숫자가 없다(지어낸 숫자 없음)
    expect(container.textContent).toBe('대시보드 숫자를 불러오고 있어요')
    expect(container.textContent).not.toMatch(/\d/)
    expect(container.textContent).not.toContain('비트 PC를 연결하면')
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
