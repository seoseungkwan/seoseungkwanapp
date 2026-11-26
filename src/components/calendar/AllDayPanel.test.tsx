// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalAllDay } from '@/lib/calendar/shapes'
import type { CalSettings } from '@/types/calendar'
import { AllDayPanel } from './AllDayPanel'

// 종일 작은 판 (spec clinic-calendar AC-5905.4, 시안 종일 줄 누름 .pop). 메모(20자) 또는 시행자 휴무를 넣고, 그날 항목을 지운다.
// 휴무 표시는 그 시행자 색(--cal-* 토큰). 저장은 화면이 한다(콜백만)

afterEach(cleanup)

const SETTINGS: CalSettings = {
  kinds: [{ id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] }],
  staff: [
    { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
    { id: 'na', name: '윤○○', mark: '나', color: 'basil' },
    { id: 'da', name: '조○○', mark: '다', color: 'grape' },
  ],
  openHour: 8,
  closeHour: 20,
  sunday: false,
}
const ITEMS: CalAllDay[] = [
  { id: 'm1', day: '2026-11-18', type: 'memo', memo: '원장님 학회 (오후)', staffId: null, staffName: null },
  { id: 'o1', day: '2026-11-18', type: 'off', memo: null, staffId: 'na', staffName: '윤○○' },
]

function draw(items: CalAllDay[] = ITEMS) {
  const calls = { add: vi.fn(), remove: vi.fn(), close: vi.fn() }
  render(<AllDayPanel day="2026-11-18" items={items} settings={SETTINGS} onAdd={calls.add} onDelete={calls.remove} onClose={calls.close} />)
  return calls
}

describe('AC-5905.4: 종일 판', () => {
  it('AC-5905.4: 제목은 날짜 · 종일, 그날 항목마다 [지우기]', () => {
    const calls = draw()
    const dialog = screen.getByRole('dialog', { name: '11월 18일 (수) · 종일' })
    const items = within(dialog).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('[data-label]')?.textContent)).toEqual(['원장님 학회 (오후)', '(나) 윤○○ 휴무'])
    fireEvent.click(within(items[1]!).getByRole('button', { name: '지우기' }))
    expect(calls.remove).toHaveBeenCalledWith('o1')
  })

  it('AC-5905.4: 휴무 항목은 그 시행자 색 표시(--cal-* 토큰)', () => {
    draw()
    const off = screen.getAllByRole('listitem')[1]!
    expect(off.querySelector<HTMLElement>('[data-swatch]')!.style.backgroundColor).toBe('var(--cal-basil)')
  })

  it('AC-5905.4: 메모(기본)는 20자까지 적고 [더하기]로 넣는다. 빈 메모는 넣지 않는다', () => {
    const calls = draw([])
    const group = screen.getByRole('group', { name: '종일 종류' })
    expect(within(group).getByRole('button', { name: '메모' }).getAttribute('aria-pressed')).toBe('true')
    const input = screen.getByRole('textbox', { name: '종일 메모' }) as HTMLInputElement
    expect(input.placeholder).toBe('예: 학회, 소독, 회의')
    expect(input.maxLength).toBe(20)
    expect(screen.getByText('그날 맨 위 종일 줄에 글로 보여요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '더하기' }))
    expect(calls.add).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '  물리치료실 소독 ' } })
    fireEvent.click(screen.getByRole('button', { name: '더하기' }))
    expect(calls.add).toHaveBeenCalledWith({ day: '2026-11-18', type: 'memo', memo: '물리치료실 소독', staffId: null, staffName: null })
  })

  it('AC-5905.4: 시행자 휴무는 그날 아직 휴무가 아닌 시행자를 골라 넣는다', () => {
    const calls = draw()
    fireEvent.click(screen.getByRole('button', { name: '시행자 휴무' }))
    expect(screen.getByText('그날 그 시행자를 휴무로 표시해요. 휴무인 담당으로 예약을 넣으면 알려 줘요.')).toBeTruthy()
    const select = screen.getByRole('combobox', { name: '휴무 시행자' }) as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(['(가) 한○○', '(다) 조○○'])
    fireEvent.change(select, { target: { value: 'da' } })
    fireEvent.click(screen.getByRole('button', { name: '더하기' }))
    expect(calls.add).toHaveBeenCalledWith({ day: '2026-11-18', type: 'off', memo: null, staffId: 'da', staffName: '조○○' })
  })

  it('AC-5905.4: [닫기]·Esc는 onClose', () => {
    const calls = draw()
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(calls.close).toHaveBeenCalledTimes(2)
  })
})

describe('AC-7616.1: 종일 판의 반차 휴무', () => {
  // 직원 탭 휴가에서 온 반차 휴무 줄(part). part 없는 줄은 지금 그대로 '휴무'
  const HALF: CalAllDay[] = [
    { id: 'o1', day: '2026-11-18', type: 'off', memo: null, staffId: 'na', staffName: '윤○○', part: 'am' },
    { id: 'o2', day: '2026-11-18', type: 'off', memo: null, staffId: 'da', staffName: '조○○', part: 'pm' },
    { id: 'o3', day: '2026-11-18', type: 'off', memo: null, staffId: 'ga', staffName: '한○○', part: null },
  ]

  it("AC-7616.1: part가 있는 휴무는 '{이름} 오전 휴무'·'{이름} 오후 휴무', part가 null이면 지금 그대로 '휴무'다. [지우기]는 그대로", () => {
    const calls = draw(HALF)
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('[data-label]')?.textContent)).toEqual(['(나) 윤○○ 오전 휴무', '(다) 조○○ 오후 휴무', '(가) 한○○ 휴무'])
    fireEvent.click(within(items[1]!).getByRole('button', { name: '지우기' }))
    expect(calls.remove).toHaveBeenCalledWith('o2')
  })

  it('AC-7616.1: 반차 휴무인 시행자도 그날은 이미 휴무라 휴무 고르기 목록에 없다', () => {
    draw(HALF.slice(0, 2))
    fireEvent.click(screen.getByRole('button', { name: '시행자 휴무' }))
    const select = screen.getByRole('combobox', { name: '휴무 시행자' }) as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(['(가) 한○○'])
  })
})
