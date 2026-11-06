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

  it('AC-2102.3: 이유(detail)를 넘기지 않으면 번호 줄은 지금처럼 "오류 번호 <번호>"뿐이다', () => {
    render(<ErrorCard code="E-PATIENTS-SOURCE" />)
    const lines = [...screen.getByRole('alert').querySelectorAll('p')].map((p) => p.textContent)
    expect(lines[2]).toBe('오류 번호 E-PATIENTS-SOURCE')
  })

  it('AC-2102.1: 이유를 넘기면 번호 줄 한 덩어리 글자 끝에 " (<이유>)"가 붙는다', () => {
    render(<ErrorCard code="E-PATIENTS-SOURCE" detail="row-unreadable" />)
    const number = within(screen.getByRole('alert')).getByText('오류 번호 E-PATIENTS-SOURCE (row-unreadable)')
    expect(number.tagName).toBe('P')
  })

  it('AC-012.2: 아이콘은 읽지 않는다(aria-hidden)', () => {
    render(<ErrorCard code="E-ADMIN-FAILED" />)
    const svg = screen.getByRole('alert').querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  // b2b-redesign REQ-217 AC-217.1, UI_GUIDE '오류 카드·확인 창'
  it('AC-217.1·AC-407.3: 오류 카드 모양 — negative-soft 바탕·rounded-control·테두리 없음·안쪽 12px 16px, 아이콘 16(negative), 무엇이 small 600 negative, 어떻게 small ink-2, 오류 번호 caption ink-2 고정폭, 임의 색 없음', () => {
    render(<ErrorCard code="E-SIGNUP-FAILED" />)
    const card = screen.getByRole('alert')
    const info = errorInfo('E-SIGNUP-FAILED')
    const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
    // 글자 크기 클래스는 줄마다 하나(옛 크기가 겹쳐 남지 않게)
    const sizes = (el: Element) =>
      classes(el).filter((c) => /^text-(?:caption|small|body|lead|subtitle|title|heading-m|heading|metric|display-m|display|table)$/.test(c))

    expect(classes(card)).toEqual(expect.arrayContaining(['bg-negative-soft', 'rounded-control', 'px-4', 'py-3']))
    expect(classes(card).filter((c) => /^(?:[\w-]+:)?(?:border|shadow|ring|outline)(?:-|$)/.test(c))).toEqual([])

    const svg = card.querySelector('svg') as Element
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('height')).toBe('16')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(classes(svg)).toContain('text-negative')

    const what = within(card).getByText(info.what)
    const fix = within(card).getByText(info.fix)
    const number = within(card).getByText('오류 번호 E-SIGNUP-FAILED')
    expect(classes(what)).toEqual(expect.arrayContaining(['font-semibold', 'text-negative']))
    expect(sizes(what)).toEqual(['text-small'])
    expect(classes(fix)).toContain('text-ink-2')
    expect(sizes(fix)).toEqual(['text-small'])
    // ui-90 AC-407.3: negative-soft 위에서 muted는 4.5:1이 안 된다(4.33:1) → ink-2
    expect(classes(number)).toEqual(expect.arrayContaining(['text-ink-2', 'tabular-nums']))
    expect(classes(number).filter((c) => /^text-(?!caption$)/.test(c))).toEqual(['text-ink-2'])
    expect(sizes(number)).toEqual(['text-caption'])

    // 옛 별칭(danger·rounded-card·rounded-chip·text-table — TASK-23에서 지운다)을 쓰지 않는다
    for (const el of [card, ...card.querySelectorAll('[class]')]) {
      expect(classes(el).filter((c) => /(?:^|-)danger(?:-|$)|^rounded-(?:card|chip)$|^text-table$/.test(c))).toEqual([])
      expect(el.getAttribute('class') ?? '').not.toMatch(/\[#|rgba?\(|hsla?\(|color-mix\(/)
    }
  })
})
