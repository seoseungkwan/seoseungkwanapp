// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import type { MemoTableRow } from '@/types/precheck'
import { MemoTable } from './MemoTable'

// 메모 표의 칸(memo-edit-any REQ-2201). 줄은 props로만 받는다. 이름·글은 지어낸 것이다

afterEach(cleanup)

const row = (key: string, over: Partial<MemoTableRow> = {}): MemoTableRow => ({
  key,
  date: '2026-10-28',
  text: `우리 메모 ${key}`,
  hasMemo: true,
  unfinished: false,
  compare: '비트에 없음',
  chart: `9${key}`,
  name: `가상환자${key}`,
  rxNames: ['가상시술 가'],
  edited: false,
  missing: [],
  done: false,
  unsaved: false,
  afterEntry: false,
  ...over,
})

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => [...el.classList]
const box = (key: string) => within(screen.getByRole('table', { name: '메모' })).getByRole('textbox', { name: `가상환자${key} 메모` }) as HTMLTextAreaElement

const ROWS = [row('a', { done: true, compare: '같음', inBit: '우리 메모 a', lastJournal: 'done' }), row('b', { done: true, compare: '같음', inBit: '우리 메모 b' }), row('c')]

function show(rows: readonly MemoTableRow[], locked: boolean) {
  const on = { onChange: vi.fn(), onBlur: vi.fn() }
  const view = render(<MemoTable rows={rows} valueOf={(_, base) => base} onChange={on.onChange} onBlur={on.onBlur} locked={locked} showUnsaved={false} />)
  return { on, view }
}

describe('REQ-2201 메모 표에서 완료·같음 메모도 고친다', () => {
  it('AC-2201.1: 입력 중이 아니면 완료 줄과 같음 줄의 칸도 보통 칸이고, 치면 onChange·칸 밖을 누르면 onBlur가 불린다', async () => {
    const user = userEvent.setup()
    const { on } = show(ROWS, false)
    for (const key of ['a', 'b', 'c']) {
      expect(box(key).readOnly).toBe(false)
      expect(classesOf(box(key))).toEqual(expect.arrayContaining(tokens(ds.input)))
    }
    await user.type(box('a'), '더')
    expect(on.onChange).toHaveBeenLastCalledWith('a', '우리 메모 a더')
    await user.type(box('b'), '더')
    expect(on.onChange).toHaveBeenLastCalledWith('b', '우리 메모 b더')
    expect(on.onBlur).toHaveBeenCalledWith('a')
    await user.tab()
    expect(on.onBlur).toHaveBeenLastCalledWith('b')
  })

  it('AC-2201.2: 입력 중(locked)이면 모든 칸이 readOnly이고 읽기 전용 모양이며, 풀리면 다시 보통 칸이다', async () => {
    const user = userEvent.setup()
    const { on, view } = show(ROWS, true)
    for (const key of ['a', 'b', 'c']) {
      expect(box(key).readOnly).toBe(true)
      expect(classesOf(box(key))).toEqual(expect.arrayContaining(tokens(ds.readonly)))
      expect(classesOf(box(key))).not.toContain('bg-surface')
      expect(classesOf(box(key))).not.toContain('border-line-strong')
    }
    await user.type(box('c'), '더')
    expect(on.onChange).not.toHaveBeenCalled()
    view.rerender(<MemoTable rows={ROWS} valueOf={(_, base) => base} onChange={on.onChange} onBlur={on.onBlur} locked={false} showUnsaved={false} />)
    for (const key of ['a', 'b', 'c']) {
      expect(box(key).readOnly).toBe(false)
      expect(classesOf(box(key))).toEqual(expect.arrayContaining(tokens(ds.input)))
    }
  })

  it('AC-2201.3: 완료였다가 고친 줄은 고침·다름이고 [아직 입력 안 된 것만]을 눌러도 남는다', async () => {
    const user = userEvent.setup()
    show([row('a', { done: false, edited: true, compare: '다름', inBit: '우리 메모 a', text: '고친 글', lastJournal: 'done' }), row('d', { done: true, compare: '같음', inBit: '우리 메모 d' })], false)
    const table = screen.getByRole('table', { name: '메모' })
    const line = within(table).getByText('가상환자a').closest('tr')!
    expect(line.textContent).toContain('고침')
    expect(line.textContent).toContain('다름')
    expect(line.textContent).not.toContain('완료')
    await user.click(screen.getByRole('button', { name: '아직 입력 안 된 것만' }))
    expect(within(table).getByText('가상환자a')).toBeTruthy()
    expect(within(table).queryByText('가상환자d')).toBeNull()
  })
})
