// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StatsCard } from './parts'
import { RoughSwitch } from './RoughSwitch'

// 참고 금액 포함 스위치 (first90 REQ-4408 AC-4408.1, REQ-4417 AC-4417.3, design.md 5-7, 시안 docs/mockups/first90/redesign.html .s-sw).
// 상태(mode)는 부르는 쪽(StatsSections)이 갖고, 스위치는 그리기와 바꾸기 부르기만 한다

afterEach(cleanup)

const OFF = '확인 필요한 날 3일은 빼고 셌어요'
const ON = '확인 필요한 날 2일의 참고 금액을 더했어요'
const OLD = '도우미가 예전 판(0.6.0)이라 참고 금액을 알 수 없어요'
const describedText = (button: HTMLElement) => document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent
const classes = (el: Element) => el.className.split(' ').filter(Boolean)

describe('AC-4408.1 RoughSwitch', () => {
  it('AC-4408.1 role="switch" · 이름 "참고 금액 포함" · 꺼짐이면 aria-checked="false"이고 아래 글은 "확인 필요한 날 {n}일은 빼고 셌어요"다', () => {
    render(<RoughSwitch mode="out" onChange={() => undefined} days={3} roughDays={2} />)
    const button = screen.getByRole('switch', { name: '참고 금액 포함' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.getAttribute('aria-checked')).toBe('false')
    expect(button.hasAttribute('aria-disabled')).toBe(false)
    expect(describedText(button)).toBe(OFF)
  })

  it('AC-4408.1 켜짐이면 aria-checked="true"이고 아래 글의 {n}은 참고 금액이 있는 날 수다', () => {
    render(<RoughSwitch mode="in" onChange={() => undefined} days={3} roughDays={2} />)
    const button = screen.getByRole('switch', { name: '참고 금액 포함' })
    expect(button.getAttribute('aria-checked')).toBe('true')
    expect(describedText(button)).toBe(ON)
  })

  it('AC-4408.1 누르면 반대 mode로 바꾸라고 부른다', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RoughSwitch mode="out" onChange={onChange} days={3} roughDays={2} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenLastCalledWith('in')
    rerender(<RoughSwitch mode="in" onChange={onChange} days={3} roughDays={2} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenLastCalledWith('out')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('AC-4408.1 참고 금액이 있는 날이 없으면 눌리지 않고(aria-disabled="true", 꺼짐) 아래 글은 옛 도우미 글이다', () => {
    const onChange = vi.fn()
    render(<RoughSwitch mode="in" onChange={onChange} days={3} roughDays={0} />)
    const button = screen.getByRole('switch', { name: '참고 금액 포함' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('aria-checked')).toBe('false')
    expect(describedText(button)).toBe(OLD)
    fireEvent.click(button)
    expect(onChange).not.toHaveBeenCalled()
    expect(classes(button)).toEqual(expect.arrayContaining(['aria-disabled:cursor-not-allowed', 'aria-disabled:bg-st-canvas', 'aria-disabled:text-st-muted']))
  })

  it('AC-4408.1 확인 필요한 날이 없으면 스위치와 아래 글이 없다', () => {
    const { container } = render(<RoughSwitch mode="out" onChange={() => undefined} days={0} roughDays={0} />)
    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('AC-4408.1 두 곳의 아래 글 id는 따로다(useId)', () => {
    render(
      <>
        <RoughSwitch mode="out" onChange={() => undefined} days={3} roughDays={2} />
        <RoughSwitch mode="out" onChange={() => undefined} days={3} roughDays={2} />
      </>,
    )
    const [a, b] = screen.getAllByRole('switch')
    expect(a!.getAttribute('aria-describedby')).not.toBe(b!.getAttribute('aria-describedby'))
    expect(describedText(a!)).toBe(OFF)
    expect(describedText(b!)).toBe(OFF)
  })

  it('AC-4408.1 큰 카드 안이면 카드 제목 줄 오른쪽 자리(머리 줄 끝)에 그린다', () => {
    render(
      <StatsCard title="매출 요약" desc="총진료비 · 수납한 날 기준">
        <RoughSwitch mode="out" onChange={() => undefined} days={3} roughDays={2} />
        <p>몸</p>
      </StatsCard>,
    )
    const head = screen.getByRole('heading', { level: 2, name: '매출 요약' }).parentElement!
    const button = within(head).getByRole('switch', { name: '참고 금액 포함' })
    const wrap = button.parentElement!
    expect(classes(wrap)).toEqual(expect.arrayContaining(['order-last', 'ml-auto', 'flex', 'flex-col', 'items-end', 'max-md:w-full', 'max-md:items-start']))
    expect(within(head).getByText(OFF)).toBeTruthy()
    expect(screen.getByText('몸').parentElement!.children).toHaveLength(1) // 몸에는 자리가 남지 않는다
  })

  it('AC-4408.1 모양: 알약(rounded-full) 40px 단추 · 켜면 참고 금액 색 테두리와 옅은 노랑 바탕 · 아래 글은 12px muted', () => {
    render(<RoughSwitch mode="in" onChange={() => undefined} days={3} roughDays={2} />)
    const button = screen.getByRole('switch')
    expect(classes(button)).toEqual(
      expect.arrayContaining(['rounded-full', 'min-h-10', 'border', 'border-st-line-2', 'bg-surface', 'font-semibold', 'aria-checked:border-st-ref', 'aria-checked:bg-warning-soft']),
    )
    expect(classes(screen.getByText(ON))).toEqual(expect.arrayContaining(['text-caption', 'text-st-muted']))
  })
})

describe('AC-4417.3 스위치 손잡이 움직임', () => {
  it('AC-4417.3 손잡이에 st-move-toggle이 있고 켜면 옆으로 옮긴다(translate-x-4). 손잡이·길은 화면 읽기에서 숨긴다', () => {
    const { rerender } = render(<RoughSwitch mode="out" onChange={() => undefined} days={3} roughDays={2} />)
    const track = screen.getByRole('switch').querySelector('[aria-hidden="true"]')!
    const knob = track.firstElementChild!
    expect(classes(knob)).toContain('st-move-toggle')
    expect(classes(knob)).not.toContain('translate-x-4')
    expect(classes(track)).toContain('bg-st-line-2')
    rerender(<RoughSwitch mode="in" onChange={() => undefined} days={3} roughDays={2} />)
    expect(classes(knob)).toContain('translate-x-4')
    expect(classes(track)).toContain('bg-st-ref')
  })
})
