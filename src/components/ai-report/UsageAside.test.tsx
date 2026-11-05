// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AiUsageView } from '@/types/aiReport'
import { UsageAside } from './UsageAside'

// AI 리포트 옆 칸(spec ai-report-screen REQ-712, 시안 <aside>). 숫자는 이 파일 안에서만 지어낸다

afterEach(cleanup)

const USAGE: AiUsageView = { calls: 3, tokens: 42180, costMicroUsd: 362000 }
const LABELS = ['분석 횟수', '토큰', '비용']
const SAFE_TEXT = '집계 숫자와 처방·동네 이름만 보내요. 환자 이름과 차트번호는 보내지 않아요.'

const aside = () => screen.getByRole('complementary', { name: 'AI 사용량과 보내는 자료' })
// 이름표(dt) 다음 칸의 값(dd)
const valueOf = (label: string) => {
  const term = within(aside()).getByText(label)
  expect(term.tagName).toBe('DT')
  expect(term.nextElementSibling?.tagName).toBe('DD')
  return term.nextElementSibling?.textContent
}

describe('AC-712.1: 이번 달 AI 사용량', () => {
  it('AC-712.1: <aside>이고 이름이 있다', () => {
    render(<UsageAside usage={USAGE} />)
    expect(aside().tagName).toBe('ASIDE')
  })

  it('AC-712.1: 제목과 분석 횟수·토큰·비용 값, 콘솔 안내가 있다', () => {
    render(<UsageAside usage={USAGE} />)
    within(aside()).getByRole('heading', { level: 2, name: '이번 달 AI 사용량' })
    expect(valueOf('분석 횟수')).toBe('3회')
    expect(valueOf('토큰')).toBe('42,180개')
    expect(valueOf('비용')).toBe('$0.36')
    within(aside()).getByText('정확한 청구 금액은 Anthropic 콘솔에서 봐요.')
  })

  it('AC-712.1: 사용량이 0이면 "—"가 아니라 0으로 보인다', () => {
    render(<UsageAside usage={{ calls: 0, tokens: 0, costMicroUsd: 0 }} />)
    expect(valueOf('분석 횟수')).toBe('0회')
    expect(valueOf('토큰')).toBe('0개')
    expect(valueOf('비용')).toBe('$0.00')
  })
})

describe('AC-712.2: AI에게 보내는 것', () => {
  it.each([
    ['사용량 있음', USAGE],
    ['사용량 모름', null],
  ])('AC-712.2: %s에도 제목·방패 아이콘·글이 있다', (_name, usage) => {
    render(<UsageAside usage={usage} />)
    within(aside()).getByRole('heading', { level: 2, name: 'AI에게 보내는 것' })
    const text = within(aside()).getByText(SAFE_TEXT)
    expect(text.parentElement?.querySelector('svg')).not.toBeNull()
  })
})

describe('AC-708.4·AC-708.5: 읽는 중·읽기 실패의 옆 칸', () => {
  it('AC-708.4·AC-708.5: usage가 null이면 세 값이 모두 "—"이고 이름표는 그대로다', () => {
    render(<UsageAside usage={null} />)
    for (const label of LABELS) expect(valueOf(label)).toBe('—')
    expect(within(aside()).getAllByText('—')).toHaveLength(3)
  })

  it('AC-708.4·AC-708.5: usage가 null이어도 두 절과 콘솔 안내가 그대로 있다', () => {
    render(<UsageAside usage={null} />)
    within(aside()).getByRole('heading', { level: 2, name: '이번 달 AI 사용량' })
    within(aside()).getByRole('heading', { level: 2, name: 'AI에게 보내는 것' })
    within(aside()).getByText('정확한 청구 금액은 Anthropic 콘솔에서 봐요.')
  })
})
