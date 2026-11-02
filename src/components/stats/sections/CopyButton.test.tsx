// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './CopyButton'

// [복사]·[표 복사] (stats REQ-513 AC-513.6, 대시보드 ReportBlock의 동작을 옮긴 통계 쪽 단추). navigator.clipboard는 가짜다

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function fakeClipboard(writeText: ((text: string) => Promise<void>) | null) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: writeText === null ? undefined : { writeText } })
}
const FAILED = '복사하지 못했어요. 문장을 길게 눌러 직접 복사해 주세요.'
const FAILED_TABLE = '복사하지 못했어요. 표를 길게 눌러 직접 복사해 주세요.'

const press = async (button: HTMLElement) => {
  await act(async () => {
    fireEvent.click(button)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('AC-513.6: 복사 단추', () => {
  it('AC-513.6: 누르면 navigator.clipboard.writeText에 글을 주고 2초 동안 "복사했어요"를 보인 뒤 되돌린다', async () => {
    const writeText = vi.fn(async () => {})
    fakeClipboard(writeText)
    render(<CopyButton text="보고 글" label="복사" />)
    await press(screen.getByRole('button', { name: '복사' }))
    expect(writeText).toHaveBeenCalledWith('보고 글')
    expect(screen.getByRole('button').textContent).toBe('복사했어요')
    act(() => {
      vi.advanceTimersByTime(1999)
    })
    expect(screen.getByRole('button').textContent).toBe('복사했어요')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('button').textContent).toBe('복사')
  })

  it('AC-513.6: 성공은 aria-live로 화면 읽기에 알린다', async () => {
    fakeClipboard(async () => {})
    const { container } = render(<CopyButton text="글" label="복사" />)
    await press(screen.getByRole('button'))
    const live = container.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toBe('복사했어요')
    expect(live.className).toContain('sr-only')
  })

  it('AC-513.6: 복사에 실패하면 직접 복사 안내를 보이고 단추 글자는 그대로다', async () => {
    fakeClipboard(async () => {
      throw new Error('막힘')
    })
    render(<CopyButton text="글" label="복사" />)
    await press(screen.getByRole('button'))
    expect(screen.getByText(FAILED)).toBeTruthy()
    expect(screen.getByRole('button').textContent).toBe('복사')
  })

  it('AC-513.6: navigator.clipboard가 없어도 직접 복사 안내다', async () => {
    fakeClipboard(null)
    render(<CopyButton text="글" label="복사" />)
    await press(screen.getByRole('button'))
    expect(screen.getByText(FAILED)).toBeTruthy()
  })

  it('AC-513.6: [표 복사] 실패 안내는 표를 말한다', async () => {
    fakeClipboard(null)
    render(<CopyButton text="글" label="표 복사" />)
    await press(screen.getByRole('button', { name: '표 복사' }))
    expect(screen.getByText(FAILED_TABLE)).toBeTruthy()
  })

  it('AC-513.6: 성공 뒤 실패하면 남은 타이머가 실패 안내를 지우지 않는다', async () => {
    const writeText = vi.fn(async () => {})
    fakeClipboard(writeText)
    render(<CopyButton text="글" label="복사" />)
    await press(screen.getByRole('button'))
    writeText.mockRejectedValueOnce(new Error('막힘'))
    await press(screen.getByRole('button'))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText(FAILED)).toBeTruthy()
  })

  it('AC-513.6: 폭 흔들림이 없다 — 어느 상태든 최소 폭 112px(min-w-28)이다', async () => {
    fakeClipboard(async () => {})
    render(<CopyButton text="글" label="복사" />)
    expect(screen.getByRole('button').className).toContain('min-w-28')
    await press(screen.getByRole('button'))
    expect(screen.getByRole('button').className).toContain('min-w-28')
  })

  it('AC-513.6: 글이 없으면 막힌 단추(aria-disabled)이고 눌러도 복사하지 않는다', async () => {
    const writeText = vi.fn(async () => {})
    fakeClipboard(writeText)
    render(<CopyButton text={null} label="복사" />)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    await press(button)
    expect(writeText).not.toHaveBeenCalled()
    expect(button.textContent).toBe('복사')
  })

  it('AC-513.6: 화면을 떠난 뒤에는 타이머가 돌지 않는다', async () => {
    fakeClipboard(async () => {})
    const { unmount } = render(<CopyButton text="글" label="복사" />)
    await press(screen.getByRole('button'))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
