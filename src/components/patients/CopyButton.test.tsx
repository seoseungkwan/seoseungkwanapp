// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyButton, CopyNoticeLine } from './CopyButton'

// 복사 단추(AC-611.4, 목업 copyBtn·copyStatus). 결과 줄은 처음부터 있는 role="status"라 바뀐 글을 화면 읽기가 읽어 준다(useCopy와 같은 방식)
afterEach(cleanup)

const FAILED = '복사하지 못했어요. 다시 눌러 주세요. 계속되면 크롬에서 이 사이트의 클립보드 쓰기를 허용해 주세요.'

// userEvent.setup()이 navigator.clipboard를 자기 것으로 바꾸므로 그 뒤에 넣는다
function setup(writeText = vi.fn<(text: string) => Promise<void>>(async () => {})) {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return { user, writeText }
}

describe('CopyButton', () => {
  it('AC-611.4 글을 클립보드에 넣고 "복사했어요"를 보인다', async () => {
    const { user, writeText } = setup()
    render(<CopyButton text="복사할 글" label="명단 복사" />)
    expect(screen.getByRole('status').textContent).toBe('')
    await user.click(screen.getByRole('button', { name: '명단 복사' }))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('복사할 글')
    expect(screen.getByRole('status').textContent).toBe('복사했어요')
  })

  it('AC-611.4 글을 함수로 주면 누를 때 만든다', async () => {
    const { user, writeText } = setup()
    const text = vi.fn(() => '누를 때 만든 글')
    render(<CopyButton text={text} label="문구 복사" />)
    expect(text).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '문구 복사' }))
    expect(writeText).toHaveBeenCalledExactlyOnceWith('누를 때 만든 글')
  })

  it('AC-611.4 클립보드가 막히면 "복사하지 못했어요. …"를 보이고 멈추지 않는다', async () => {
    const { user } = setup(vi.fn(async () => Promise.reject(new Error('막힘'))))
    render(<CopyButton text="글" label="명단 복사" />)
    await user.click(screen.getByRole('button', { name: '명단 복사' }))
    expect(screen.getByRole('status').textContent).toBe(FAILED)
  })

  it('AC-611.4 글을 만들다 실패해도 같은 실패 글이다(원래 오류 글은 보이지 않는다)', async () => {
    const { user, writeText } = setup()
    const text = () => {
      throw new RangeError('날짜 비밀')
    }
    render(<CopyButton text={text} label="문구 복사" />)
    await user.click(screen.getByRole('button', { name: '문구 복사' }))
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe(FAILED)
  })

  it('AC-611.4 막힌 단추는 aria-disabled이고 눌러도 복사하지 않는다(목업 copyBtn)', async () => {
    const { user, writeText } = setup()
    render(<CopyButton text="글" label="명단 복사" disabled />)
    const button = screen.getByRole('button', { name: '명단 복사' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    await user.click(button)
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('AC-611.4 됨 글(doneText)을 주면 그 글을 보인다(목업 "복사했어요 · 3명")', async () => {
    const { user } = setup()
    render(<CopyButton text="글" label="명단 복사" doneText="복사했어요 · 3명" />)
    await user.click(screen.getByRole('button', { name: '명단 복사' }))
    expect(screen.getByRole('status').textContent).toBe('복사했어요 · 3명')
  })

  it('AC-611.4 복사할 글이 없으면(unavailable) 복사하지 않고 그 글을 보인다', async () => {
    const { user, writeText } = setup()
    render(<CopyButton text="글" label="문구 복사" unavailable="복사할 문구가 없어요." />)
    await user.click(screen.getByRole('button', { name: '문구 복사' }))
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('복사할 문구가 없어요.')
  })

  it('AC-611.4 onResult를 주면 결과 줄을 그리지 않고 결과를 넘긴다(단추 여럿이 한 줄을 나눠 쓴다, 목업 copyStatus)', async () => {
    const { user } = setup()
    const onResult = vi.fn()
    render(<CopyButton text="글" label="명단 복사" onResult={onResult} />)
    expect(screen.queryByRole('status')).toBeNull()
    await user.click(screen.getByRole('button', { name: '명단 복사' }))
    expect(onResult).toHaveBeenCalledExactlyOnceWith({ ok: true, text: '복사했어요' })
  })
})

describe('CopyNoticeLine', () => {
  it('AC-611.4 결과가 없어도 줄은 처음부터 있다', () => {
    render(<CopyNoticeLine notice={null} />)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('AC-611.4 됨은 체크 아이콘과 함께(색만으로 보이지 않는다), 실패는 글자만', () => {
    const { rerender } = render(<CopyNoticeLine notice={{ ok: true, text: '복사했어요' }} />)
    expect(screen.getByRole('status').querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe('복사했어요')
    rerender(<CopyNoticeLine notice={{ ok: false, text: FAILED }} />)
    expect(screen.getByRole('status').querySelector('svg')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe(FAILED)
  })
})
