// @vitest-environment jsdom
import { createElement, type ComponentType } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import PageError from './error'

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
