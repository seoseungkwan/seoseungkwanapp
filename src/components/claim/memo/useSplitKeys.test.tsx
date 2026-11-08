// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSplitKeys } from './useSplitKeys'

// 두 칸 보기의 키(AC-3102.3·AC-3102.4·AC-3103.1): ↑↓는 사람 옮기기, C는 복사(완료). 글 칸·알림 창·입력 중에는 쓰지 않는다

afterEach(cleanup)

function Probe({ enabled = true, onMove, onCopy }: { enabled?: boolean; onMove(step: 1 | -1): void; onCopy(): void }) {
  useSplitKeys({ enabled, onMove, onCopy })
  return (
    <div>
      <button type="button">아무 단추</button>
      <textarea aria-label="글 칸" />
      <input aria-label="글자 칸" />
      <select aria-label="고르는 칸">
        <option>하나</option>
      </select>
      <input type="radio" aria-label="동그라미" name="mode" />
      <input type="date" aria-label="날짜 칸" />
    </div>
  )
}

function setup(enabled = true) {
  const onMove = vi.fn()
  const onCopy = vi.fn()
  const view = render(<Probe enabled={enabled} onMove={onMove} onCopy={onCopy} />)
  return { onMove, onCopy, view }
}

describe('AC-3102.3 ↑↓로 옮긴다', () => {
  it('AC-3102.3: ↓는 다음, ↑는 앞 사람이고 페이지가 스크롤되지 않게 기본 동작을 막는다', () => {
    const { onMove } = setup()
    const down = fireEvent.keyDown(document.body, { key: 'ArrowDown', code: 'ArrowDown' })
    const up = fireEvent.keyDown(screen.getByRole('button', { name: '아무 단추' }), { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onMove.mock.calls).toEqual([[1], [-1]])
    expect(down).toBe(false)
    expect(up).toBe(false)
  })

  it('AC-3102.4: 입력 방식 동그라미에 초점이 있어도 ↑↓는 사람을 옮기고 동그라미는 바뀌지 않는다', () => {
    const { onMove } = setup()
    const radio = screen.getByRole('radio', { name: '동그라미' })
    const moved = fireEvent.keyDown(radio, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(onMove).toHaveBeenCalledWith(1)
    expect(moved).toBe(false)
  })
})

describe('AC-3103.1 C로 복사한다', () => {
  it('AC-3103.1: C(한글 자판의 ㅊ도 같은 자리 키)를 누르면 복사하고, 누른 채 반복은 무시한다', () => {
    const { onCopy } = setup()
    expect(fireEvent.keyDown(document.body, { key: 'c', code: 'KeyC' })).toBe(false)
    fireEvent.keyDown(document.body, { key: 'ㅊ', code: 'KeyC' })
    fireEvent.keyDown(document.body, { key: 'c', code: 'KeyC', repeat: true })
    expect(onCopy).toHaveBeenCalledTimes(2)
  })
})

describe('AC-3102.4 쓰지 않는 때', () => {
  it.each(['글 칸', '글자 칸', '고르는 칸', '날짜 칸'])('AC-3102.4: 초점이 %s에 있으면 옮기지도 복사하지도 않고 그 칸의 동작 그대로다', (name) => {
    const { onMove, onCopy } = setup()
    const field = screen.getByLabelText(name)
    expect(fireEvent.keyDown(field, { key: 'ArrowDown', code: 'ArrowDown' })).toBe(true)
    expect(fireEvent.keyDown(field, { key: 'c', code: 'KeyC' })).toBe(true)
    expect(onMove).not.toHaveBeenCalled()
    expect(onCopy).not.toHaveBeenCalled()
  })

  it.each([{ ctrlKey: true }, { altKey: true }, { metaKey: true }])('AC-3102.4: Ctrl·Alt·⌘와 함께 누르면 쓰지 않는다(Ctrl+C는 보통 복사): %o', (mods) => {
    const { onMove, onCopy } = setup()
    expect(fireEvent.keyDown(document.body, { key: 'c', code: 'KeyC', ...mods })).toBe(true)
    fireEvent.keyDown(document.body, { key: 'ArrowDown', code: 'ArrowDown', ...mods })
    expect(onMove).not.toHaveBeenCalled()
    expect(onCopy).not.toHaveBeenCalled()
  })

  it('AC-3102.4: 한글을 조합하는 중이면 쓰지 않는다', () => {
    const { onCopy } = setup()
    fireEvent.keyDown(document.body, { key: 'Process', code: 'KeyC', isComposing: true })
    expect(onCopy).not.toHaveBeenCalled()
  })

  it('AC-3102.4: 꺼져 있으면(알림 창·입력 중·결과 화면) 아무 키도 쓰지 않고, 다시 켜면 쓴다', () => {
    const onMove = vi.fn()
    const onCopy = vi.fn()
    const view = render(<Probe enabled={false} onMove={onMove} onCopy={onCopy} />)
    expect(fireEvent.keyDown(document.body, { key: 'ArrowDown', code: 'ArrowDown' })).toBe(true)
    fireEvent.keyDown(document.body, { key: 'c', code: 'KeyC' })
    expect(onMove).not.toHaveBeenCalled()
    expect(onCopy).not.toHaveBeenCalled()
    view.rerender(<Probe enabled onMove={onMove} onCopy={onCopy} />)
    fireEvent.keyDown(document.body, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(onMove).toHaveBeenCalledWith(1)
  })

  it('AC-3102.4: 화면이 사라지면 키를 듣지 않는다', () => {
    const { onMove, view } = setup()
    view.unmount()
    fireEvent.keyDown(document.body, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('AC-3102.3: 다시 그려져 함수가 바뀌어도 마지막 함수를 부른다', () => {
    const first = vi.fn()
    const second = vi.fn()
    const onCopy = vi.fn()
    const view = render(<Probe onMove={first} onCopy={onCopy} />)
    view.rerender(<Probe onMove={second} onCopy={onCopy} />)
    fireEvent.keyDown(document.body, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(-1)
  })
})
