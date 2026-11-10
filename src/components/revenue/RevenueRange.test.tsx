// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nestedBoxes } from '@/testing/boxes'
import { LoadRangePanel, RangeDoneNotice, RangeStoppedLine } from './RevenueRange'

// 매출 가져올 기간 부품 (revenue-load-range TASK-3, 시안 docs/mockups/revenue-load-range #picker·#doneBox·#stopped).
// 부품은 받은 글을 그대로 그린다 — 글은 아무 예시 글이다(글 만들기는 range.ts가 맡는다)

const SPANS = [
  { key: '1y', name: '최근 1년' },
  { key: '2y', name: '최근 2년' },
  { key: 'all', name: '전체 기간' },
]
const HINT = '예시 안내 줄: 아직 안 가져온 70달을 가져와요.'
const LOAD = '비트에서 가져오기'

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

function panel(over: { selected?: string; hint?: string; disabled?: boolean } = {}) {
  const props = { spans: SPANS, selected: '1y', onSelect: vi.fn<(key: string) => void>(), hint: HINT, disabled: false, onLoad: vi.fn<() => void>(), ...over }
  return { props, ...render(<LoadRangePanel {...props} />) }
}

afterEach(cleanup)

describe('AC-3501.1 가져올 기간 칸', () => {
  it("AC-3501.1 '가져올 기간' 이름과 role=group 묶음 안에 단추 셋이 받은 차례대로 있다", () => {
    panel()
    expect(screen.getByText('가져올 기간', { selector: 'span' })).toBeTruthy()
    const group = screen.getByRole('group', { name: '가져올 기간' })
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['최근 1년', '최근 2년', '전체 기간'])
  })

  it('AC-3501.1 고른 단추만 aria-pressed="true"이고, 고른 것이 바뀌면 그것만 눌린다', () => {
    const { props, rerender } = panel()
    const pressed = () => within(screen.getByRole('group', { name: '가져올 기간' })).getAllByRole('button').map((button) => button.getAttribute('aria-pressed'))
    expect(pressed()).toEqual(['true', 'false', 'false'])
    rerender(<LoadRangePanel {...props} selected="all" />)
    expect(pressed()).toEqual(['false', 'false', 'true'])
  })

  it('AC-3501.1 단추를 누르면 그 열쇠로 onSelect를 부른다', () => {
    const { props } = panel()
    screen.getByRole('button', { name: '최근 2년' }).click()
    screen.getByRole('button', { name: '전체 기간' }).click()
    expect(props.onSelect.mock.calls).toEqual([['2y'], ['all']])
  })

  it('AC-3501.1 [비트에서 가져오기]와 안내 줄 글이 있고, 누르면 onLoad를 부른다', () => {
    const { props } = panel()
    expect(screen.getByText(HINT)).toBeTruthy()
    const load = screen.getByRole<HTMLButtonElement>('button', { name: LOAD })
    expect(load.disabled).toBe(false)
    load.click()
    expect(props.onLoad).toHaveBeenCalledTimes(1)
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('AC-3501.1 폰에서도 깨지지 않는다: 단추는 44px(max-md:h-11), 묶음은 전체 폭 세 칸, 안내 줄은 줄 전체 폭, 상자 안 상자가 없다', () => {
    const { container } = panel()
    for (const button of screen.getAllByRole('button')) expect(classesOf(button), button.textContent ?? '').toContain('max-md:h-11')
    expect(classesOf(screen.getByRole('group', { name: '가져올 기간' }))).toEqual(expect.arrayContaining(['max-md:w-full', 'max-md:grid-cols-3']))
    expect(classesOf(screen.getByRole('button', { name: LOAD }))).toContain('max-md:w-full')
    expect(classesOf(screen.getByText(HINT))).toContain('basis-full')
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('AC-3501.4 남은 달이 없으면 막힌다', () => {
  it('AC-3501.4 disabled면 [비트에서 가져오기]가 disabled이고 눌러도 onLoad를 부르지 않으며, 안내 줄 글은 그대로 보인다', () => {
    const hint = '예시: 최근 1년은 다 가져와 있어요.'
    const { props } = panel({ disabled: true, hint })
    const load = screen.getByRole<HTMLButtonElement>('button', { name: LOAD })
    expect(load.disabled).toBe(true)
    load.click()
    expect(props.onLoad).not.toHaveBeenCalled()
    expect(screen.getByText(hint)).toBeTruthy()
  })
})

describe('AC-3502.3 다 가져온 뒤 알림', () => {
  it('AC-3502.3 role="status" 초록 알림에 굵은 첫 줄과 둘째 줄이 있다', () => {
    const lead = '예시: 2020년 1월 – 2025년 10월의 70달을 가져왔어요.'
    const rest = '예시: 이제 기간 줄의 ‹ 단추로 2020년 1월까지 넘겨 볼 수 있어요.'
    render(<RangeDoneNotice lead={lead} rest={rest} />)
    const status = screen.getByRole('status')
    expect(classesOf(status)).toContain('bg-positive-soft')
    const lines = Array.from(status.querySelectorAll('p'))
    expect(lines.map((line) => line.textContent)).toEqual([lead, rest])
    expect(lines[0]!.querySelector('strong')?.textContent).toBe(lead)
    expect(lines[1]!.querySelector('strong')).toBeNull()
  })
})

describe('AC-3502.4 멈춘 뒤 한 줄', () => {
  it('AC-3502.4 받은 글을 한 줄로 그린다', () => {
    const text = '예시: 가져온 12달(2024년 11월 – 2025년 10월)은 저장됐어요. 남은 58달만 읽어요.'
    const { container } = render(<RangeStoppedLine text={text} />)
    const line = screen.getByText(text)
    expect(line.tagName).toBe('P')
    expect(container.textContent).toBe(text)
  })
})
