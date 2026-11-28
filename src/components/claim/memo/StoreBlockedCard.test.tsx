// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StoreBlockedCard } from './StoreBlockedCard'

// 기관기호 안내(AC-018.17)의 claim-learn 다듬기(AC-9313.4, 시안 notes '다시 등록'): '개발자에게 도움' 글 대신 다시 등록 안내와 [이 PC 다시 등록]

afterEach(cleanup)

const RE_REGISTER = '이 PC에 저장된 자료가 지금 등록한 병원(요양기관기호)과 달라요. 병원이 바뀌었으면 이 PC를 다시 등록해 주세요.'

describe('AC-9313.4 StoreBlockedCard', () => {
  it("AC-9313.4: '개발자에게 도움' 글 대신 notes '다시 등록' 글이고, 제목·둘째 줄·오류 번호는 그대로다", () => {
    render(<StoreBlockedCard />)
    const card = screen.getByRole('alert')
    expect(card.textContent).not.toContain('개발자에게 도움')
    expect(within(card).getByText(RE_REGISTER)).toBeTruthy()
    expect(within(card).getByText('등록한 기관기호가 바뀌어 이전 병원의 저장 파일이 남아 있어요')).toBeTruthy()
    expect(within(card).getByText('지금은 이 PC에 저장되지 않아요. 고친 메모는 이 화면에 그대로 있어요.')).toBeTruthy()
    expect(within(card).getByText('오류 번호 E-BIT-HOSPITAL-MISMATCH')).toBeTruthy()
  })

  it('AC-9313.4: [이 PC 다시 등록]은 연결 화면의 다시 등록 모양(/claim/setup?from=store)으로 가는 링크다. 지우는 단추는 없다', () => {
    render(<StoreBlockedCard />)
    const card = screen.getByRole('alert')
    const link = within(card).getByRole('link', { name: '이 PC 다시 등록' })
    expect(link.getAttribute('href')).toBe('/claim/setup?from=store')
    expect(within(card).queryByRole('button')).toBeNull()
    // 글은 단추 앞이다
    const text = within(card).getByText(RE_REGISTER)
    expect(text.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
