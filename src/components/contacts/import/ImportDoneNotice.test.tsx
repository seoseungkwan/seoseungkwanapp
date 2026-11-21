// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportDoneNotice } from './ImportDoneNotice'

// 넣은 뒤 목록 위 초록 줄(specs/contacts AC-6506.4의 부품 몫, requirements.md '화면 글자' 엑셀 미리 보기 마지막 줄, 시안 기본값 26).
// [닫기]를 누를 때까지 남는다(잠깐 뜨는 알림이 아님). 넣지 않은 줄이 0이면 뒤 문장이 없다

afterEach(() => cleanup())

describe('AC-6506.4 ImportDoneNotice', () => {
  it('AC-6506.4: 엑셀에서 넣었어요. 새로 {n}곳 · 바뀜 {n}곳. 넣지 않은 줄 {n}개는 엑셀에서 고쳐 다시 올리면 돼요. + [닫기]', () => {
    const onClose = vi.fn()
    render(<ImportDoneNotice added={5} changed={3} skipped={3} onClose={onClose} />)
    const line = screen.getByRole('status')
    expect(line.textContent).toBe('엑셀에서 넣었어요. 새로 5곳 · 바뀜 3곳. 넣지 않은 줄 3개는 엑셀에서 고쳐 다시 올리면 돼요.닫기')
    expect(screen.getByText('엑셀에서 넣었어요.').tagName).toBe('B')
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('AC-6506.4: 넣지 않은 줄이 0이면 뒤 문장을 뺀다', () => {
    render(<ImportDoneNotice added={2} changed={0} skipped={0} onClose={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toBe('엑셀에서 넣었어요. 새로 2곳 · 바뀜 0곳.닫기')
  })
})
