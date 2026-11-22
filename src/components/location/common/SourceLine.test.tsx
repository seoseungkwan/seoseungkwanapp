// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { SourceLine } from './SourceLine'

// next/link는 /location 안 링크에 쓰지 않는다(이 화면은 주소 tab을 처음에만 읽어, Next가 옮기면 탭이 안 바뀐다).
// 쓰면 표시(data-next-link)가 남게 바꿔 둔다
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a data-next-link="" href={href}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

describe('AC-7906.2: 출처 줄 SourceLine', () => {
  it("AC-7906.2: `{기관} {자료} · 기준 {날짜}` 한 줄이 '근거와 출처'의 그 출처 줄로 가는 링크다", () => {
    render(<SourceLine src="hosp-list" asOf="2026-11-15" />)
    const link = screen.getByRole('link')
    expect(link.textContent).toBe('건강보험심사평가원 병원정보서비스 · 기준 2026년 11월 15일')
    expect(link.getAttribute('href')).toBe('/location?tab=sources#src-hosp-list')
  })

  it('AC-7906.2: 덧붙임은 끝에 ` · {덧붙임}`, 기준 날짜가 없으면 `{기관} {자료}`만', () => {
    render(
      <>
        <SourceLine src="hosp-list" asOf="2026-11-15" extra="의원·과목·의사 수" />
        <SourceLine src="flow-volume" />
      </>,
    )
    const [a, b] = screen.getAllByRole('link')
    expect(a!.textContent).toBe('건강보험심사평가원 병원정보서비스 · 기준 2026년 11월 15일 · 의원·과목·의사 수')
    expect(b!.textContent).toBe('국토교통부 정류장별 이용량')
    expect(b!.getAttribute('href')).toBe('/location?tab=sources#src-flow-volume')
  })

  it('AC-7906.2: 여는 콜백을 주면 누를 때 그 출처 id로 부르고 주소 이동은 막는다', () => {
    const onOpen = vi.fn()
    render(<SourceLine src="pop-age" asOf="2026-10-31" onOpen={onOpen} />)
    const moved = fireEvent.click(screen.getByRole('link'))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith('pop-age')
    expect(moved).toBe(false)
  })

  it('AC-7906.2: 여는 콜백이 있어도 Ctrl을 누르고 누르면(새 탭) 콜백을 부르지 않는다', () => {
    const onOpen = vi.fn()
    render(<SourceLine src="pop-age" asOf="2026-10-31" onOpen={onOpen} />)
    // 시험 브라우저(jsdom)는 주소 이동을 못 하니 부품이 다 본 뒤 문서에서 막는다
    const stop = (e: Event) => e.preventDefault()
    document.addEventListener('click', stop)
    fireEvent.click(screen.getByRole('link'), { ctrlKey: true })
    document.removeEventListener('click', stop)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("AC-7906.2: 여는 콜백이 없으면 평범한 <a href>(next/link 아님) — 그냥 눌러도 막지 않아 주소가 바뀌고 '근거와 출처' 탭으로 열린다", () => {
    render(<SourceLine src="hosp-list" asOf="2026-11-15" />)
    const link = screen.getByRole('link')
    expect(link.hasAttribute('data-next-link')).toBe(false)
    expect(link.getAttribute('href')).toBe('/location?tab=sources#src-hosp-list')
    // 시험 브라우저(jsdom)는 주소 이동을 못 하니 부품이 다 본 뒤 문서에서 막는다 — 부품이 먼저 막았는지만 본다
    let prevented: boolean | null = null
    const look = (e: Event) => {
      prevented = e.defaultPrevented
      e.preventDefault()
    }
    document.addEventListener('click', look)
    fireEvent.click(link)
    document.removeEventListener('click', look)
    expect(prevented).toBe(false)
  })

  it('AC-7906.2: 여는 콜백이 있어도 next/link를 쓰지 않는다', () => {
    render(<SourceLine src="pop-age" asOf="2026-10-31" onOpen={vi.fn()} />)
    expect(screen.getByRole('link').hasAttribute('data-next-link')).toBe(false)
  })

  it('AC-7906.2: 출처 줄은 밑줄 없이(시안 .src), 마우스를 올리면 밑줄', () => {
    render(<SourceLine src="hosp-list" asOf="2026-11-15" />)
    const classes = screen.getByRole('link').className.split(/\s+/)
    expect(classes).toContain('no-underline')
    expect(classes).toContain('hover:underline')
    expect(classes).not.toContain('underline')
  })

  it('AC-7906.2: SOURCES에 없는 출처 id면 아무것도 그리지 않는다', () => {
    const { container } = render(<SourceLine src="no-such-source" asOf="2026-11-15" />)
    expect(container.innerHTML).toBe('')
  })
})
