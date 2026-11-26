// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverwriteDialog, overwriteStart } from './OverwriteDialog'

// [덮어쓰기…] 창(spec google-link AC-8515.3, 시안 notes-sunap `overwrite`). 기대 글은 notes 글자 그대로.
// 날짜는 오늘(지난 달을 보는 중이면 그 달 1일)에서 시작하고, 도우미가 받는 날(오늘 − 62일 ~ 오늘, design.md 9-2) 안에서만 옮긴다

const norm = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

function renderDialog(over: { start?: string; today?: string; min?: string } = {}) {
  const onCancel = vi.fn()
  const onPick = vi.fn()
  render(<OverwriteDialog start={over.start ?? '2026-11-26'} today={over.today ?? '2026-11-26'} min={over.min ?? '2026-09-25'} onCancel={onCancel} onPick={onPick} />)
  return { onCancel, onPick }
}
const dateText = () => norm(screen.getByTestId('overwrite-day'))

afterEach(cleanup)

describe('AC-8515.3: 덮어쓰기 창 글', () => {
  it('AC-8515.3: 제목 "덮어쓰기"인 창, 날짜 [‹] 2026년 11월 26일 (목) [›] [오늘]', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: '덮어쓰기' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dateText()).toBe('2026년 11월 26일 (목)')
    expect(screen.getByRole('button', { name: '전날' }).textContent).toBe('‹')
    expect(screen.getByRole('button', { name: '다음 날' }).textContent).toBe('›')
    expect(screen.getByRole('button', { name: '오늘' })).toBeTruthy()
  })

  it('AC-8515.3: 풀이 글과 작은 글이 notes 그대로다', () => {
    renderDialog()
    const texts = [...screen.getByRole('dialog').querySelectorAll('p')].map((p) => norm(p))
    expect(texts).toEqual([
      '덮어쓰기는 비트가 채우는 칸(차트번호·이름·기호·금액·진료실·초진·90일초진·Block·물리치료)을 비트 값으로 다시 써요. 직원이 적은 비고·예약관리·지출은 안 건드려요.',
      '지난 날 빈 칸만 다시 채우려면 날짜를 고르고 [빈 칸만 채우기]를 누르세요. 직원이 고친 금액·이름도 비트 값으로 바뀌니, 고친 칸이 있으면 [빈 칸만 채우기]를 쓰세요.',
    ])
    expect(screen.getByText('직원이 적은 비고·예약관리·지출은 안 건드려요.').tagName).toBe('B')
  })

  it('AC-8515.3: 단추는 [취소] [빈 칸만 채우기] [덮어쓰기](파란) 차례', () => {
    renderDialog()
    const foot = [...screen.getByTestId('overwrite-foot').querySelectorAll('button')].map((b) => b.textContent)
    expect(foot).toEqual(['취소', '빈 칸만 채우기', '덮어쓰기'])
    expect(screen.getByRole('button', { name: '덮어쓰기' }).className).toContain('bg-accent')
  })
})

describe('AC-8515.3: 날짜 옮기기', () => {
  it('AC-8515.3: [‹]은 전날, [›]는 다음 날, [오늘]은 오늘로', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '전날' }))
    expect(dateText()).toBe('2026년 11월 25일 (수)')
    fireEvent.click(screen.getByRole('button', { name: '전날' }))
    expect(dateText()).toBe('2026년 11월 24일 (화)')
    fireEvent.click(screen.getByRole('button', { name: '다음 날' }))
    expect(dateText()).toBe('2026년 11월 25일 (수)')
    fireEvent.click(screen.getByRole('button', { name: '오늘' }))
    expect(dateText()).toBe('2026년 11월 26일 (목)')
  })

  it('AC-8515.3: 오늘 뒤로는 못 간다([›] 잠김)', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: '다음 날' })).toHaveProperty('disabled', true)
  })

  it('AC-8515.3: 도우미가 받는 가장 이른 날 앞으로는 못 간다([‹] 잠김)', () => {
    renderDialog({ start: '2026-09-25' })
    expect(dateText()).toBe('2026년 9월 25일 (금)')
    expect(screen.getByRole('button', { name: '전날' })).toHaveProperty('disabled', true)
  })

  it('AC-8515.3: 시작 날 — 이번 달은 오늘, 지난 달은 그 달 1일, 받는 날보다 이르면 가장 이른 날', () => {
    expect(overwriteStart('2026-11', '2026-11-26')).toBe('2026-11-26')
    expect(overwriteStart('2026-10', '2026-11-26')).toBe('2026-10-01')
    expect(overwriteStart('2026-09', '2026-11-26')).toBe('2026-09-25')
    expect(overwriteStart('2025-12', '2026-11-26')).toBe('2026-09-25')
  })
})

describe('AC-8515.3: 누르면', () => {
  it('AC-8515.3: [덮어쓰기]는 고른 날을 덮어쓰기로', () => {
    const { onPick } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '전날' }))
    fireEvent.click(screen.getByRole('button', { name: '덮어쓰기' }))
    expect(onPick).toHaveBeenCalledWith('2026-11-25', 'overwrite')
  })

  it('AC-8515.3: [빈 칸만 채우기]는 고른 날을 빈 칸만 채우기로', () => {
    const { onPick } = renderDialog({ start: '2026-10-01' })
    fireEvent.click(screen.getByRole('button', { name: '빈 칸만 채우기' }))
    expect(onPick).toHaveBeenCalledWith('2026-10-01', 'fillEmpty')
  })

  it('AC-8515.3: [취소]·Esc는 onCancel, 넣지 않는다', () => {
    const { onCancel, onPick } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('AC-8515.3: 창이 열리면 초점은 [취소]에(덮어쓰기는 한 번 더 골라야 한다)', () => {
    renderDialog()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }))
  })
})
