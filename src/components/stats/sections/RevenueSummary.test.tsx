// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { revenueCells, type RevenueCell, type RevenueMode } from '@/components/stats/revenueView'
import { nestedBoxes } from '@/testing/boxes'
import { RevenueSummary } from './RevenueSummary'

// 매출 요약 (first90 REQ-4408 AC-4408.1·AC-4408.2, REQ-4417 AC-4417.3, design.md 5-7, 시안 docs/mockups/first90/redesign.html #s-sum-rev).
// 칸 값은 revenueView(revenueCells)가 주는 모양을 손으로 만든 가짜(시안 숫자·글)다. 읽는 중·읽기 실패는 revenueCells가 주는 값 그대로다

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const cell = (over: Partial<RevenueCell> & Pick<RevenueCell, 'key' | 'label' | 'value'>): RevenueCell => ({ hint: null, tag: false, unit: null, tone: 'ink', delta: null, notes: [], ...over })
const OUT: RevenueCell[] = [
  cell({ key: 'total', label: '총매출', value: '1억 3,261만', unit: '원', delta: { dir: 'up', text: '60만 원 (+0.4%)', srText: '지난 30일보다 늘어남' }, notes: ['진료한 날 25일 · 하루 평균 530만 원'] }),
  cell({ key: 'perVisit', label: '건당 진료비', hint: '매출 ÷ 접수 2,313건', value: '57,333', unit: '원', delta: { dir: 'up', text: '+2.9%', srText: '' } }),
  cell({ key: 'unchecked', label: '확인 필요한 날', value: '1', unit: '일', tone: 'warn', notes: ['10월 28일 · 금액이 확실하지 않아 뺐어요'] }),
]
const IN: RevenueCell[] = [
  { ...OUT[0]!, tag: true, value: '1억 3,759만', delta: { dir: 'up', text: '558만 원 (+4.2%)', srText: '지난 30일보다 늘어남' }, notes: ['진료한 날 26일 · 하루 평균 529만 원 · 참고 498만 원 포함'] },
  { ...OUT[1]!, tag: true, hint: '매출 ÷ 접수 2,408건', value: '57,139', delta: { dir: 'up', text: '+2.5%', srText: '' } },
  { ...OUT[2]!, notes: ['10월 28일 · 참고 금액 498만 원 포함'] },
]
const ROUGH = { days: 1, roughDays: 1 }

const draw = (cells: readonly RevenueCell[], o: { mode?: RevenueMode; onMode?: (mode: RevenueMode) => void; rough?: { days: number; roughDays: number } | null } = {}) =>
  render(<RevenueSummary cells={cells} mode={o.mode ?? 'out'} onMode={o.onMode ?? (() => undefined)} rough={o.rough === undefined ? ROUGH : o.rough} />)
const card = () => screen.getByRole('heading', { level: 2, name: '매출 요약' }).closest('section')!
const head = () => screen.getByRole('heading', { level: 2, name: '매출 요약' }).parentElement!
const grid = () => card().querySelector('.grid')!
const cellsOf = () => [...grid().children] as HTMLElement[]
const classes = (el: Element) => el.className.split(' ').filter(Boolean)

describe('AC-4408.2 매출 요약 칸 셋', () => {
  it('AC-4408.2 제목 "매출 요약" · 옆 글 "총진료비 · 수납한 날 기준"인 큰 카드이고 칸 셋이 총매출 · 건당 진료비 · 확인 필요한 날 차례다', () => {
    draw(OUT)
    expect(within(head()).getByText('총진료비 · 수납한 날 기준')).toBeTruthy()
    expect(classes(card())).toEqual(expect.arrayContaining(['rounded-st', 'shadow-st-card', 'bg-surface']))
    expect(cellsOf().map((el) => el.textContent)).toEqual([
      '총매출1억 3,261만원▲ 60만 원 (+0.4%) 지난 30일보다 늘어남진료한 날 25일 · 하루 평균 530만 원',
      '건당 진료비매출 ÷ 접수 2,313건57,333원▲ +2.9%',
      '확인 필요한 날1일10월 28일 · 금액이 확실하지 않아 뺐어요',
    ])
  })

  it('AC-4408.2 총매출은 가장 큰 글자(40px), 나머지는 34px이고 확인 필요한 날 값은 warn 글자다', () => {
    draw(OUT)
    expect(classes(within(cellsOf()[0]!).getByText('1억 3,261만'))).toContain('text-st-40')
    expect(classes(within(cellsOf()[1]!).getByText('57,333'))).toContain('text-st-34')
    expect(classes(within(cellsOf()[2]!).getByText('1'))).toEqual(expect.arrayContaining(['text-st-34', 'text-st-warn-ink']))
  })

  it('AC-4408.2 총매출 증감은 초록·빨강, 건당 진료비 증감은 비율만이고 ink-2다', () => {
    draw(OUT)
    expect(classes(within(cellsOf()[0]!).getByText('지난 30일보다 늘어남').parentElement!)).toContain('text-positive')
    expect(classes(within(cellsOf()[1]!).getByText('+2.9%', { exact: false }))).toContain('text-st-ink-2')
  })

  it('AC-4408.2 PC는 1.5 : 1 : 1 한 줄, 768px 미만은 총매출이 한 줄 전체이고 나머지 둘이 아래 한 줄이다', () => {
    draw(OUT)
    expect(classes(grid())).toEqual(expect.arrayContaining(['grid', 'grid-cols-7', 'max-md:grid-cols-2']))
    const [total, perVisit, unchecked] = cellsOf()
    expect(classes(total!)).toEqual(expect.arrayContaining(['col-span-3', 'max-md:col-span-2']))
    for (const el of [perVisit!, unchecked!]) expect(classes(el)).toEqual(expect.arrayContaining(['col-span-2', 'border-l', 'border-st-line', 'max-md:col-span-1', 'max-md:border-l-0']))
  })

  it('AC-4408.2 켜짐이면 총매출·건당 진료비 이름 옆에 "참고 포함" 꼬리표가 있고 아래 글이 참고 금액 글이다', () => {
    draw(IN, { mode: 'in' })
    const [total, perVisit, unchecked] = cellsOf()
    expect(within(total!).getByText('참고 포함')).toBeTruthy()
    expect(within(perVisit!).getByText('참고 포함')).toBeTruthy()
    expect(within(unchecked!).queryByText('참고 포함')).toBeNull()
    expect(total!.textContent).toBe('총매출참고 포함1억 3,759만원▲ 558만 원 (+4.2%) 지난 30일보다 늘어남진료한 날 26일 · 하루 평균 529만 원 · 참고 498만 원 포함')
    expect(unchecked!.textContent).toBe('확인 필요한 날1일10월 28일 · 참고 금액 498만 원 포함')
  })

  it.each<[string, 'reading' | 'read-failed', string]>([
    ['읽는 중', 'reading', '불러오는 중'],
    ['읽기 실패', 'read-failed', '자료 없음'],
  ])('AC-4408.2 매출을 %s이면 세 칸 모두 값 `–`이고 아래 글은 지금 글 그대로다(스위치 없음)', (_name, state, note) => {
    draw(revenueCells(state), { rough: null })
    expect(cellsOf().map((el) => el.textContent)).toEqual([`총매출–${note}`, `건당 진료비–${note}`, `확인 필요한 날–${note}`])
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('AC-4408.2 칸 사이는 세로 선뿐이고 상자 안 상자가 없다', () => {
    const { container } = draw(IN, { mode: 'in' })
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('AC-4408.1 매출 요약 머리 줄의 스위치', () => {
  it('AC-4408.1 확인 필요한 날이 있으면 제목 줄 오른쪽에 스위치가 있고 누르면 onMode를 부른다', () => {
    const onMode = vi.fn()
    draw(OUT, { onMode, rough: { days: 1, roughDays: 1 } })
    const button = within(head()).getByRole('switch', { name: '참고 금액 포함' })
    expect(button.getAttribute('aria-checked')).toBe('false')
    expect(within(head()).getByText('확인 필요한 날 1일은 빼고 셌어요')).toBeTruthy()
    fireEvent.click(button)
    expect(onMode).toHaveBeenCalledWith('in')
  })

  it('AC-4408.1 확인 필요한 날이 없으면(0일) 스위치가 없다', () => {
    draw(OUT, { rough: { days: 0, roughDays: 0 } })
    expect(screen.queryByRole('switch')).toBeNull()
  })
})

describe('AC-4417.3 바꿀 때 칸 바탕 강조(st-flash)', () => {
  const flashed = () => cellsOf().map((el) => classes(el).includes('st-flash'))

  it('AC-4417.3 처음 그릴 때는 강조가 없고, mode가 바뀌면 세 칸에 st-flash가 붙었다가 250ms 뒤 떨어진다', () => {
    vi.useFakeTimers()
    const { rerender } = draw(OUT)
    expect(flashed()).toEqual([false, false, false])
    rerender(<RevenueSummary cells={IN} mode="in" onMode={() => undefined} rough={ROUGH} />)
    expect(flashed()).toEqual([true, true, true])
    act(() => vi.advanceTimersByTime(249))
    expect(flashed()).toEqual([true, true, true])
    act(() => vi.advanceTimersByTime(1))
    expect(flashed()).toEqual([false, false, false])
  })

  it('AC-4417.3 빠르게 여러 번 바꿔도 타이머는 하나이고 마지막 바뀜 250ms 뒤에는 강조가 남지 않는다', () => {
    vi.useFakeTimers()
    const { rerender } = draw(OUT)
    const at = (mode: RevenueMode) => rerender(<RevenueSummary cells={mode === 'in' ? IN : OUT} mode={mode} onMode={() => undefined} rough={ROUGH} />)
    at('in')
    act(() => vi.advanceTimersByTime(100))
    at('out')
    act(() => vi.advanceTimersByTime(100))
    at('in')
    act(() => vi.advanceTimersByTime(200)) // 첫 바뀜에서 400ms, 마지막 바뀜에서 200ms
    expect(flashed()).toEqual([true, true, true])
    expect(vi.getTimerCount()).toBe(1)
    act(() => vi.advanceTimersByTime(50))
    expect(flashed()).toEqual([false, false, false])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-4417.3 같은 mode로 다시 그리면(값만 바뀜) 강조하지 않는다', () => {
    vi.useFakeTimers()
    const { rerender } = draw(OUT)
    rerender(<RevenueSummary cells={OUT.map((c) => ({ ...c }))} mode="out" onMode={() => undefined} rough={ROUGH} />)
    expect(flashed()).toEqual([false, false, false])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-4417.3 강조 중에 칸이 사라져도 타이머를 남기지 않는다', () => {
    vi.useFakeTimers()
    const { rerender, unmount } = draw(OUT)
    rerender(<RevenueSummary cells={IN} mode="in" onMode={() => undefined} rough={ROUGH} />)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
