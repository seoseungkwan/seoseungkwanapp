// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ColorButton, ColorPalette, GoogleChip } from './ColorPalette'

// 설정 › 구글 캘린더 › 시행자·종류의 색판 (spec google-link AC-8529.1, notes-calendar `colors` '색판', 시안 calendar.html ?s=colors .gpal·.cbtn·.gev).
// 색판: 종류는 '시행자 색 따름' + 11색 + '캘린더 기본 색', 시행자·휴무 줄·취소 색·변경 색은 11색만. 색마다 이름 글을 동그라미 아래에 쓴다.
// 11색 차례는 시안 그대로 구글 화면 차례(토마토 → 흑연). 색 값은 globals.css 토큰(--cal-*)만 쓴다(16진수 없음)

afterEach(cleanup)

// 시안 GC 차례(구글 캘린더 화면 차례)와 notes 이름
const GOOGLE_ORDER = ['토마토', '플라밍고', '귤', '바나나', '세이지', '바질', '공작', '블루베리', '라벤더', '포도', '흑연']
const TOKEN: Record<string, string> = {
  토마토: 'tomato',
  플라밍고: 'flamingo',
  귤: 'tangerine',
  바나나: 'banana',
  세이지: 'sage',
  바질: 'basil',
  공작: 'peacock',
  블루베리: 'blueberry',
  라벤더: 'lavender',
  포도: 'grape',
  흑연: 'graphite',
}

const palette = () => screen.getByRole('group', { name: '구글 색 고르기' })
const names = () => within(palette()).getAllByRole('button').map((b) => b.textContent)
const pressed = () => within(palette()).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)

describe('AC-8529.1: 색판 — 종류', () => {
  it("AC-8529.1: 종류 색판은 '시행자 색 따름' + 구글 11색(구글 화면 차례) + '캘린더 기본 색'이고, 이름 글이 동그라미 아래에 있다", () => {
    render(<ColorPalette value={null} forKind onPick={() => {}} />)
    expect(names()).toEqual(['시행자 색 따름', ...GOOGLE_ORDER, '캘린더 기본 색'])
    for (const button of within(palette()).getAllByRole('button')) {
      const dot = button.querySelector('[data-dot]')
      expect(dot, button.textContent ?? '').not.toBeNull()
      expect(dot!.getAttribute('aria-hidden')).toBe('true')
      expect(button.lastChild?.textContent).toBe(button.textContent) // 동그라미 다음(아래)에 이름 글
    }
  })

  it('AC-8529.1: 고른 색만 눌림이고, 누르면 그 색(시행자 색 따름 = null, 캘린더 기본 색 = default)을 넘긴다', () => {
    const onPick = vi.fn()
    const { rerender } = render(<ColorPalette value={null} forKind onPick={onPick} />)
    expect(pressed()).toEqual(['시행자 색 따름'])
    rerender(<ColorPalette value="default" forKind onPick={onPick} />)
    expect(pressed()).toEqual(['캘린더 기본 색'])
    rerender(<ColorPalette value="sage" forKind onPick={onPick} />)
    expect(pressed()).toEqual(['세이지'])
    fireEvent.click(within(palette()).getByRole('button', { name: '시행자 색 따름' }))
    fireEvent.click(within(palette()).getByRole('button', { name: '캘린더 기본 색' }))
    fireEvent.click(within(palette()).getByRole('button', { name: '토마토' }))
    expect(onPick.mock.calls).toEqual([[null], ['default'], ['tomato']])
  })

  it('AC-8529.1: 동그라미 색은 토큰 var(--cal-*)이고 16진수 글이 없다', () => {
    render(<ColorPalette value={null} forKind onPick={() => {}} />)
    for (const name of GOOGLE_ORDER) {
      const dot = within(palette()).getByRole('button', { name }).querySelector('[data-dot]') as HTMLElement
      expect(dot.style.background || dot.style.backgroundColor).toContain(`var(--cal-${TOKEN[name]})`)
    }
    const fallback = within(palette()).getByRole('button', { name: '캘린더 기본 색' }).querySelector('[data-dot]') as HTMLElement
    expect(fallback.getAttribute('style')).toContain('var(--cal-default)')
    expect(palette().outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})

describe('AC-8529.1: 색판 — 시행자·휴무 줄·취소·변경', () => {
  it('AC-8529.1: 종류가 아니면 구글 11색만(시행자 색 따름·캘린더 기본 색 없음)', () => {
    const onPick = vi.fn()
    render(<ColorPalette value="lavender" onPick={onPick} />)
    expect(names()).toEqual(GOOGLE_ORDER)
    expect(pressed()).toEqual(['라벤더'])
    fireEvent.click(within(palette()).getByRole('button', { name: '흑연' }))
    expect(onPick).toHaveBeenCalledWith('graphite')
  })
})

describe('AC-8529.1: 색 단추', () => {
  it('AC-8529.1: 색 단추는 색 점 + 색 이름 + ▼이고, 열림을 aria-expanded로 알리며 누르면 onToggle', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<ColorButton value="lavender" label="(호) 정호연 구글 색" open={false} onToggle={onToggle} />)
    const button = screen.getByRole('button', { name: /^\(호\) 정호연 구글 색/ })
    expect(button.textContent).toBe('라벤더▼')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect((button.querySelector('[data-dot]') as HTMLElement).style.backgroundColor).toBe('var(--cal-lavender)')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<ColorButton value={null} label="도수 구글 색" open onToggle={onToggle} />)
    const kind = screen.getByRole('button', { name: /^도수 구글 색/ })
    expect(kind.textContent).toBe('시행자 색 따름▼')
    expect(kind.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('AC-8529.1: 구글 모양 칩(미리 보기)', () => {
  it('AC-8529.1: 칩은 그 색으로 꽉 채우고 구글 화면처럼 흰 글자, 바나나만 검정 글자다', () => {
    render(
      <>
        <GoogleChip color="lavender" text="1234 홍길동 도수 30분 (호)" />
        <GoogleChip color="banana" text="2087 이보기 자보도수 30분 (원)" />
        <GoogleChip color="default" text="원장님 학회" />
      </>,
    )
    const chip = (text: string) => screen.getByText(text)
    expect(chip('1234 홍길동 도수 30분 (호)').style.backgroundColor).toBe('var(--cal-lavender)')
    expect(chip('1234 홍길동 도수 30분 (호)').className).toContain('text-surface')
    expect(chip('2087 이보기 자보도수 30분 (원)').className).toContain('text-ink')
    expect(chip('2087 이보기 자보도수 30분 (원)').className).not.toContain('text-surface')
    expect(chip('원장님 학회').style.backgroundColor).toBe('var(--cal-default)')
    expect(chip('원장님 학회').getAttribute('title')).toBe('원장님 학회')
  })
})
