// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import { WordsTab } from './WordsTab'

// 설정 '차트 줄임말' 묶음(clinic-profile AC-6612.1, design.md 14절). 줄임말은 가짜다

afterEach(cleanup)

let latest: Phrases
function Harness({ start = ourClinicPhrases() }: { start?: Phrases }) {
  const [draft, setDraft] = useState(start)
  latest = draft
  return <WordsTab draft={draft} errors={[]} onChange={setDraft} />
}
const withWords = (chartWords: Phrases['chartWords']): Phrases => ({ ...ourClinicPhrases(), chartWords })
const term = (n: number) => screen.getByLabelText(`${n}번 줄 차트에 이렇게 적으면`) as HTMLInputElement
const target = (n: number) => screen.getByLabelText(`${n}번 줄 이렇게 읽어요`) as HTMLInputElement

describe('AC-6612.1 차트 줄임말 표', () => {
  it("AC-6612.1: '차트에 이렇게 적으면' · '이렇게 읽어요' 두 칸 줄 목록과 [+ 줄 더하기]·[빼기]가 있고 아래에 '메모 시험 탭에서 바로 확인할 수 있어요.'가 보인다", () => {
    render(<Harness start={withWords([{ term: '무주', target: 'IA' }])} />)
    const table = screen.getByRole('table', { name: '차트 줄임말' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['차트에 이렇게 적으면', '이렇게 읽어요', '빼기'])
    expect(term(1).value).toBe('무주')
    expect(target(1).value).toBe('IA')
    expect(within(table).getByRole('button', { name: '1번 줄 빼기' }).textContent).toBe('빼기')
    expect(screen.getByRole('button', { name: '+ 줄 더하기' })).toBeTruthy()
    const note = screen.getByText('메모 시험 탭에서 바로 확인할 수 있어요.')
    expect(table.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-6612.1: 표가 없으면 빈 줄 안내이고, 줄을 더하고 고치고 뺀다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('적은 줄임말이 없어요.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '+ 줄 더하기' }))
    expect(latest.chartWords).toEqual([{ term: '', target: '' }])
    await user.type(term(1), '무주')
    await user.type(target(1), 'IA')
    await user.click(screen.getByRole('button', { name: '+ 줄 더하기' }))
    await user.type(term(2), '묵')
    await user.type(target(2), 'MBB')
    expect(latest.chartWords).toEqual([
      { term: '무주', target: 'IA' },
      { term: '묵', target: 'MBB' },
    ])
    await user.click(screen.getByRole('button', { name: '1번 줄 빼기' }))
    expect(latest.chartWords).toEqual([{ term: '묵', target: 'MBB' }])
    expect(term(1).value).toBe('묵')
  })

  it('AC-6612.1: 칸마다 40자까지 적히고, 100줄이면 더 더할 수 없다', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Harness start={withWords([{ term: 'a', target: 'b' }])} />)
    await user.type(term(1), 'x'.repeat(45))
    expect(term(1).value).toHaveLength(40)
    await user.type(target(1), 'y'.repeat(45))
    expect(target(1).value).toHaveLength(40)
    unmount()
    render(<Harness start={withWords(Array.from({ length: 100 }, (_, i) => ({ term: `t${i}`, target: 'x' })))} />)
    expect((screen.getByRole('button', { name: '+ 줄 더하기' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-6612.1·AC-6613.3: 검사(validatePhrases)의 까닭을 그 칸 아래에 보인다', () => {
    const errors = [
      { path: 'chartWords.1.term', message: '같은 줄임말이 이미 있습니다: AB' },
      { path: 'chartWords.0.target', message: '읽어요 칸 오류' },
      { path: 'chartWords', message: '표 전체 오류' },
    ]
    render(
      <WordsTab
        draft={withWords([
          { term: 'ab', target: '' },
          { term: 'AB', target: 'Y' },
        ])}
        errors={errors}
        onChange={() => {}}
      />,
    )
    expect(term(2).getAttribute('aria-invalid')).toBe('true')
    expect(term(1).getAttribute('aria-invalid')).toBeNull()
    expect(target(1).getAttribute('aria-invalid')).toBe('true')
    expect(target(1).closest('td')?.textContent).toContain('읽어요 칸 오류')
    expect(term(2).closest('td')?.textContent).toContain('같은 줄임말이 이미 있습니다: AB')
    expect(screen.getByText('표 전체 오류')).toBeTruthy()
  })
})
