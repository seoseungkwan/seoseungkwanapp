// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoEngine, ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import { TryTab } from './TryTab'
import { tryVisit, TRY_CHART, TRY_RX, type TryText } from './tryVisit'

// '메모 시험' 묶음(memo-settings AC-3007.4)

afterEach(cleanup)

function Harness({ draft = ourClinicPhrases() }: { draft?: Phrases }) {
  const [text, setText] = useState<TryText>({ chart: TRY_CHART, rx: TRY_RX })
  return <TryTab draft={draft} text={text} onText={setText} />
}

describe('AC-3007.4 메모 시험', () => {
  it('AC-3007.4: 처음 글은 지금의 가짜 진료이고 [메모 만들기]로 메모가 보인다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect((screen.getByLabelText(/차트 글/) as HTMLTextAreaElement).value).toBe('LBP\nMBB L4,5 both')
    expect((screen.getByLabelText(/처방/) as HTMLTextAreaElement).value).toBe('LA358 2')
    await user.click(screen.getByRole('button', { name: '메모 만들기' }))
    const memo = screen.getByRole('region', { name: '시험한 메모' })
    expect(memo.textContent).toContain(createMemoEngine(ourClinicPhrases(), {}).fullText(tryVisit(TRY_CHART, TRY_RX, ourClinicPhrases())))
    expect(memo.textContent).toContain('MBB')
  })

  it('AC-3007.4: 차트 글과 처방을 바꾸면 그 글로 만든 메모가 보인다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const chart = screen.getByLabelText(/차트 글/)
    const rx = screen.getByLabelText(/처방/)
    await user.clear(chart)
    await user.type(chart, 'Rt knee IA triam')
    await user.clear(rx)
    await user.type(rx, 'KK090 1{Enter}A21')
    await user.click(screen.getByRole('button', { name: '메모 만들기' }))
    const expected = createMemoEngine(ourClinicPhrases(), {}).fullText(tryVisit('Rt knee IA triam', 'KK090 1\nA21', ourClinicPhrases()))
    expect(expected).toContain('IA injection of')
    expect(screen.getByRole('region', { name: '시험한 메모' }).textContent).toContain(expected)
  })

  it('AC-3007.4: 저장하지 않은 지금 고친 값으로 만든다', async () => {
    const user = userEvent.setup()
    const draft = ourClinicPhrases()
    draft.TPL.mark = '★'
    render(<Harness draft={draft} />)
    await user.click(screen.getByRole('button', { name: '메모 만들기' }))
    expect(screen.getByRole('region', { name: '시험한 메모' }).textContent).toContain('★MBB')
    expect(screen.getByText('저장하지 않은 지금 고친 값으로 만들어요. 이 글은 저장하지 않아요.')).toBeTruthy()
  })

  it('AC-3007.4: 틀린 칸이 있으면 메모를 만들지 않고 알린다', async () => {
    const user = userEvent.setup()
    const draft = ourClinicPhrases()
    draft.TPL.main = '{없는말}'
    render(<Harness draft={draft} />)
    await user.click(screen.getByRole('button', { name: '메모 만들기' }))
    expect(screen.queryByRole('region', { name: '시험한 메모' })).toBeNull()
    expect(screen.getByText(/틀린 칸이 있어 메모를 만들 수 없어요/)).toBeTruthy()
  })
})
