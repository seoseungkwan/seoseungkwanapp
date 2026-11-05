// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MemoCode, ProcedureDrugs as Value } from '@/lib/precheck/memo'
import { ProcedureDrugs } from './ProcedureDrugs'

// 시술별 약(AC-018.19). 약 이름으로 넣기·빼기와 자리를 고른다. 국소마취제·연골주사약도 같다

afterEach(cleanup)

const CODES: Record<string, MemoCode> = {
  LA358: { n: 'MBB', k: 'proc', rg: null },
  KK090: { n: 'IA', k: 'proc', rg: null },
  A15: { n: '리도카인', k: 'drug', rg: null, localAnesthetic: true },
  B20: { n: '아라간', k: 'drug', rg: null, cartilage: true },
  C30: { n: '덱사', k: 'drug', rg: null },
}
function Harness({ start, onChange }: { start: Value; onChange?: (next: Value) => void }) {
  const [value, setValue] = useState(start)
  return (
    <ProcedureDrugs
      codes={CODES}
      value={value}
      errors={[]}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

describe('AC-018.19 시술별 약', () => {
  it('AC-018.19: 안내 두 줄이 보이고 시술을 고르면 약마다 줄이 있다(국소마취제·연골주사약 포함)', async () => {
    render(<Harness start={{}} />)
    expect(screen.getByText('병원 설정과 실제로 쓴 시술이 다른 날에는 메모가 틀릴 수 있어요')).toBeTruthy()
    expect(screen.getByText('바꾸면 다음에 만드는 메모부터 바뀌어요')).toBeTruthy()
    const table = screen.getByRole('table', { name: 'MBB에 넣을 약' })
    expect(within(table).getByText('리도카인')).toBeTruthy()
    expect(within(table).getByText('아라간')).toBeTruthy()
    expect(within(table).getByText('덱사')).toBeTruthy()
    expect(within(table).getAllByText('아직 안 정함')).toHaveLength(3)
    await userEvent.setup().selectOptions(screen.getByLabelText('고칠 시술'), 'KK090')
    expect(screen.getByRole('table', { name: 'IA에 넣을 약' })).toBeTruthy()
  })

  it('AC-018.19: 넣기를 고르면 자리(시술 뒤)와 함께 적히고, 자리를 고칠 수 있고, 빼기에는 자리가 없다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness start={{}} onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: '리도카인 넣기' }))
    expect(onChange.mock.lastCall?.[0]).toEqual({ LA358: { 리도카인: { use: 'include', place: 'afterProc' } } })
    await user.selectOptions(screen.getByLabelText('리도카인 자리'), 'ownLine')
    expect(onChange.mock.lastCall?.[0]).toEqual({ LA358: { 리도카인: { use: 'include', place: 'ownLine' } } })
    await user.click(screen.getByRole('radio', { name: '리도카인 빼기' }))
    expect(onChange.mock.lastCall?.[0]).toEqual({ LA358: { 리도카인: { use: 'exclude' } } })
    expect((screen.getByLabelText('리도카인 자리') as HTMLSelectElement).disabled).toBe(true)
  })

  it('AC-018.19: 틀린 칸의 글을 보인다', () => {
    render(<ProcedureDrugs codes={CODES} value={{}} errors={[{ path: 'procedureDrugs.LA358.리도카인.place', message: '약을 넣을 자리를 골라 주세요.' }]} onChange={() => {}} />)
    expect(screen.getByText('약을 넣을 자리를 골라 주세요.')).toBeTruthy()
  })
})
