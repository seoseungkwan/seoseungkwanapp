// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { errorInfo } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'
import { ErrorCard } from './ErrorCard'

afterEach(cleanup)

const AUTH_CODES = [
  'E-AUTH-CALLBACK',
  'E-AUTH-START',
  'E-SIGNUP-FAILED',
  'E-ADMIN-FAILED',
  'E-PAGE-FAILED',
] as const satisfies readonly ErrorCode[]

describe('ErrorCard', () => {
  it.each(AUTH_CODES)('AC-012.1: %s 카드의 문구는 lib/errors.ts의 errorInfo에서 온다', (code) => {
    render(<ErrorCard code={code} />)
    const card = screen.getByRole('alert')
    const info = errorInfo(code)
    expect(within(card).getByText(info.what).tagName).toBe('P')
    expect(within(card).getByText(info.fix).tagName).toBe('P')
  })

  it('AC-012.2: 무엇이 · 어떻게 고치나 · "오류 번호 E-…" 순서로 보인다(목업 로그인 실패 카드)', () => {
    render(<ErrorCard code="E-AUTH-CALLBACK" />)
    const card = screen.getByRole('alert')
    const lines = [...card.querySelectorAll('p')].map((p) => p.textContent)
    expect(lines).toEqual([
      '구글 로그인을 마치지 못했어요',
      '다시 시도해 보세요. 계속되면 오류 번호와 함께 문의해 주세요.',
      '오류 번호 E-AUTH-CALLBACK',
    ])
  })

  it('AC-012.2: 카드 글자는 무엇이·어떻게 고치나·오류 번호뿐이다(링크·단추·다른 글자 없음)', () => {
    render(<ErrorCard code="E-PAGE-FAILED" />)
    const card = screen.getByRole('alert')
    const info = errorInfo('E-PAGE-FAILED')
    expect(card.textContent).toBe(`${info.what}${info.fix}오류 번호 E-PAGE-FAILED`)
    expect(within(card).queryAllByRole('link')).toHaveLength(0)
    expect(within(card).queryAllByRole('button')).toHaveLength(0)
  })

  it('AC-012.2: 원래 오류 내용을 넘길 자리가 없다(속성은 code 하나)', () => {
    // 오류 객체를 넘겨도 화면에 나오지 않는다 — 타입이 막고, 실제로도 그리지 않는다
    const leak = { code: 'E-SIGNUP-FAILED' as const, error: new Error('duplicate key value violates unique constraint') }
    render(<ErrorCard {...(leak as { code: ErrorCode })} />)
    expect(document.body.textContent).not.toContain('duplicate key')
    expect(document.body.textContent).not.toContain('Error')
  })

  it('AC-012.2: 아이콘은 읽지 않는다(aria-hidden)', () => {
    render(<ErrorCard code="E-ADMIN-FAILED" />)
    const svg = screen.getByRole('alert').querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-012.2·AC-013.2·AC-013.3: 오류 카드 모양 — danger-soft 바탕·6px 모서리, 무엇이 danger 600, 어떻게 ink-2, 오류 번호 caption muted, 임의 색 없음', () => {
    render(<ErrorCard code="E-SIGNUP-FAILED" />)
    const card = screen.getByRole('alert')
    const info = errorInfo('E-SIGNUP-FAILED')
    const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
    expect(classes(card)).toEqual(expect.arrayContaining(['bg-danger-soft', 'rounded-card']))
    expect(classes(card).some((c) => c.startsWith('shadow'))).toBe(false)
    expect(classes(within(card).getByText(info.what))).toEqual(expect.arrayContaining(['text-danger', 'font-semibold', 'text-body']))
    expect(classes(within(card).getByText(info.fix))).toEqual(expect.arrayContaining(['text-ink-2', 'text-table']))
    expect(classes(within(card).getByText('오류 번호 E-SIGNUP-FAILED'))).toEqual(
      expect.arrayContaining(['text-muted', 'text-caption']),
    )
    expect(classes(card.querySelector('svg') as Element)).toContain('text-danger')
    for (const el of [card, ...card.querySelectorAll('[class]')]) {
      expect(el.getAttribute('class') ?? '').not.toMatch(/\[#|rgba?\(|hsla?\(|color-mix\(/)
    }
  })
})
