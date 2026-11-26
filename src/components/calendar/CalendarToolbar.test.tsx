// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalSettings } from '@/types/calendar'
import { CalendarLegend, CalendarToolbar, periodLabel, type CalView } from './CalendarToolbar'

// 예약 탭 도구 줄·안내 줄 (spec clinic-calendar AC-5905.1·AC-5905.8, 시안 docs/mockups/clinic-calendar ?s=week·phone-week).
// props·콜백만 받는다(기간 옮기기·보기 바꾸기는 화면이 한다). 글은 시안 그대로다

const SETTINGS: CalSettings = {
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
    { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수'] },
    { id: 'shock', name: '충격파', len: 15, color: null, words: ['충격파'] },
    { id: 'inj', name: '주사', len: 10, color: 'flamingo', words: ['주사'] },
    { id: 'visit', name: '진료', len: 10, color: 'sage', words: ['진료'] },
  ],
  staff: [
    { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
    { id: 'won', name: '원장님', mark: '원', color: 'graphite' },
  ],
  openHour: 8,
  closeHour: 20,
  sunday: false,
}

afterEach(cleanup)

function draw(view: CalView = 'week', from = '2026-11-16', to = '2026-11-21') {
  const calls = { view: vi.fn(), today: vi.fn(), prev: vi.fn(), next: vi.fn(), settings: vi.fn(), add: vi.fn() }
  render(
    <CalendarToolbar
      view={view}
      from={from}
      to={to}
      onView={calls.view}
      onToday={calls.today}
      onPrev={calls.prev}
      onNext={calls.next}
      onSettings={calls.settings}
      onAdd={calls.add}
    />,
  )
  return calls
}

describe('AC-5905.1: 기간 글(도구 줄 제목·나눠 보기 제목)', () => {
  it('AC-5905.1: 주는 같은 달이면 끝 날만, 달이 다르면 달까지, 해가 다르면 해까지 적는다', () => {
    expect(periodLabel('week', '2026-11-16', '2026-11-21')).toBe('2026년 11월 16일 – 21일')
    expect(periodLabel('week', '2026-11-30', '2026-12-05')).toBe('2026년 11월 30일 – 12월 5일')
    expect(periodLabel('week', '2026-12-28', '2027-01-02')).toBe('2026년 12월 28일 – 2027년 1월 2일')
  })

  it('AC-5905.1: 일은 요일까지, 월은 해·달만', () => {
    expect(periodLabel('day', '2026-11-17', '2026-11-17')).toBe('2026년 11월 17일 (화)')
    expect(periodLabel('month', '2026-11-01', '2026-11-30')).toBe('2026년 11월')
  })
})

describe('AC-5905.1: 도구 줄 — [오늘]·◀▶·제목·[일·주·월]·[설정]·[+ 예약 더하기]', () => {
  it('AC-5905.1: 제목 h1이 보이는 기간이다(폰은 해를 숨긴다)', () => {
    draw()
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.textContent).toBe('2026년 11월 16일 – 21일')
  })

  it('AC-5905.1: [오늘]·[이전 주]·[다음 주]가 콜백을 부른다', () => {
    const calls = draw()
    fireEvent.click(screen.getByRole('button', { name: '오늘' }))
    fireEvent.click(screen.getByRole('button', { name: '이전 주' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 주' }))
    expect(calls.today).toHaveBeenCalledTimes(1)
    expect(calls.prev).toHaveBeenCalledTimes(1)
    expect(calls.next).toHaveBeenCalledTimes(1)
  })

  it('AC-5905.1: 일 보기는 [이전 날]·[다음 날], 월 보기는 [이전 달]·[다음 달]', () => {
    draw('day', '2026-11-17', '2026-11-17')
    expect(screen.getByRole('button', { name: '이전 날' })).toBeTruthy()
    cleanup()
    draw('month', '2026-11-01', '2026-11-30')
    expect(screen.getByRole('button', { name: '다음 달' })).toBeTruthy()
  })

  it('AC-5905.1: [일·주·월] 묶음은 지금 보기만 눌려 있고 누르면 그 보기로 부른다', () => {
    const calls = draw('week')
    const group = screen.getByRole('group', { name: '보기' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['일', '주', '월'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    fireEvent.click(buttons[0]!)
    fireEvent.click(buttons[2]!)
    expect(calls.view.mock.calls).toEqual([['day'], ['month']])
  })

  it('AC-5905.1: [예약 설정]·[예약 더하기]가 콜백을 부른다', () => {
    const calls = draw()
    fireEvent.click(screen.getByRole('button', { name: '예약 설정' }))
    fireEvent.click(screen.getByRole('button', { name: '예약 더하기' }))
    expect(calls.settings).toHaveBeenCalledTimes(1)
    expect(calls.add).toHaveBeenCalledTimes(1)
  })
})

describe('AC-5905.1·AC-5905.8: 안내 줄 — 비트 연결·색·도착·변경', () => {
  const text = () => document.body.textContent ?? ''

  it('AC-5905.1: 비트 PC는 비트 연결됨·비트 예약 색·저절로 표시 안내', () => {
    render(<CalendarLegend settings={SETTINGS} bit />)
    expect(screen.getAllByText('비트 연결됨').length).toBeGreaterThan(0)
    expect(screen.getAllByText('비트 예약').length).toBeGreaterThan(0)
    expect(screen.getAllByText('비트 접수를 보고 저절로 표시해요').length).toBeGreaterThan(0)
    expect(text()).not.toContain('비트 없는 기기')
  })

  it('AC-5905.8: 비트 없는 기기는 비트 없는 기기·도착은 비트 PC가 정한다는 안내, 비트 예약 색은 없다', () => {
    render(<CalendarLegend settings={SETTINGS} bit={false} />)
    expect(screen.getAllByText('비트 없는 기기').length).toBeGreaterThan(0)
    expect(screen.getAllByText('도착 표시는 비트 PC가 정해요').length).toBeGreaterThan(0)
    expect(text()).not.toContain('비트 예약')
    expect(text()).not.toContain('비트 연결됨')
  })

  it('AC-5905.1: 색은 시행자 (표시) 이름, 고정 색 종류, 시행자 색을 따르는 종류 안내', () => {
    render(<CalendarLegend settings={SETTINGS} bit />)
    expect(screen.getAllByText('(가) 한○○').length).toBeGreaterThan(0)
    expect(screen.getAllByText('(원) 원장님').length).toBeGreaterThan(0)
    expect(screen.getAllByText('주사').length).toBeGreaterThan(0)
    expect(screen.getAllByText('도수·자보도수·충격파는 담당 색').length).toBeGreaterThan(0)
  })

  it('AC-5905.1: 도착 안내(왔음·안 옴·취소·표시 없음 = 아직)와 변경 안내', () => {
    render(<CalendarLegend settings={SETTINGS} bit />)
    for (const words of ['왔음', '안 옴', '취소', '표시 없음 = 아직', '날짜나 시작 시간을 옮긴 예약']) {
      expect(screen.getAllByText(words).length, words).toBeGreaterThan(0)
    }
  })

  it('AC-5905.8: 폰에서는 접어 두는 [색·도착 표시 보기]가 있다', () => {
    render(<CalendarLegend settings={SETTINGS} bit={false} />)
    expect(screen.getByText('색·도착 표시 보기').tagName).toBe('SUMMARY')
  })
})
