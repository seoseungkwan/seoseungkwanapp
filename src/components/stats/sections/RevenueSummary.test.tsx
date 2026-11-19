// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { revenueCells, type RevenueCell } from '@/components/stats/revenueView'
import { nestedBoxes } from '@/testing/boxes'
import { RevenueSummary } from './RevenueSummary'

// 매출 요약 (bit-total REQ-6904 AC-6904.1·AC-6904.4, design.md 2절. 처음 만든 것은 first90 REQ-4408, 시안 docs/mockups/first90/redesign.html #s-sum-rev).
// 칸은 둘(총매출 · 건당 진료비)뿐이고 스위치·꼬리표·바꿀 때 강조가 없다.
// 칸 값은 revenueView(revenueCells)가 주는 모양을 손으로 만든 가짜(시안 숫자·글)다. 읽는 중·읽기 실패는 revenueCells가 주는 값 그대로다

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const cell = (over: Partial<RevenueCell> & Pick<RevenueCell, 'key' | 'label' | 'value'>): RevenueCell => ({ hint: null, unit: null, tone: 'ink', delta: null, notes: [], ...over })
const CELLS: RevenueCell[] = [
  cell({ key: 'total', label: '총매출', value: '1억 3,759만', unit: '원', delta: { dir: 'up', text: '558만 원 (+4.2%)', srText: '지난 30일보다 늘어남' }, notes: ['진료한 날 26일 · 하루 평균 529만 원'] }),
  cell({ key: 'perVisit', label: '건당 진료비', hint: '매출 ÷ 접수 2,408건', value: '57,139', unit: '원', delta: { dir: 'up', text: '+2.5%', srText: '' } }),
]

const draw = (cells: readonly RevenueCell[]) => render(<RevenueSummary cells={cells} />)
const card = () => screen.getByRole('heading', { level: 2, name: '매출 요약' }).closest('section')!
const head = () => screen.getByRole('heading', { level: 2, name: '매출 요약' }).parentElement!
const grid = () => card().querySelector('.grid')!
const cellsOf = () => [...grid().children] as HTMLElement[]
const classes = (el: Element) => el.className.split(' ').filter(Boolean)

describe('AC-6904.1 매출 요약 칸 둘', () => {
  it('AC-6904.1 제목 "매출 요약" · 옆 글 "총진료비 · 수납한 날 기준"인 큰 카드이고 칸은 총매출 · 건당 진료비 둘뿐이다', () => {
    draw(CELLS)
    expect(within(head()).getByText('총진료비 · 수납한 날 기준')).toBeTruthy()
    expect(classes(card())).toEqual(expect.arrayContaining(['rounded-st', 'shadow-st-card', 'bg-surface']))
    expect(cellsOf().map((el) => el.textContent)).toEqual([
      '총매출1억 3,759만원▲ 558만 원 (+4.2%) 지난 30일보다 늘어남진료한 날 26일 · 하루 평균 529만 원',
      '건당 진료비매출 ÷ 접수 2,408건57,139원▲ +2.5%',
    ])
  })

  it("AC-6904.1 스위치 '참고 금액 포함'과 그 아래 글, '참고 포함' 꼬리표, '확인 필요한 날' 칸이 없다", () => {
    draw(CELLS)
    expect(screen.queryByRole('switch')).toBeNull()
    expect(card().textContent).not.toMatch(/참고 금액|참고 포함|확인 필요/)
    expect(head().textContent).toBe('매출 요약총진료비 · 수납한 날 기준')
  })

  it('AC-6904.1 총매출은 가장 큰 글자(40px), 건당 진료비는 34px이다', () => {
    draw(CELLS)
    expect(classes(within(cellsOf()[0]!).getByText('1억 3,759만'))).toContain('text-st-40')
    expect(classes(within(cellsOf()[1]!).getByText('57,139'))).toContain('text-st-34')
  })

  it('AC-6904.2·AC-6904.3 총매출 증감은 초록·빨강, 건당 진료비 증감은 비율만이고 ink-2다', () => {
    draw(CELLS)
    expect(classes(within(cellsOf()[0]!).getByText('지난 30일보다 늘어남').parentElement!)).toContain('text-positive')
    expect(classes(within(cellsOf()[1]!).getByText('+2.5%', { exact: false }))).toContain('text-st-ink-2')
  })

  it('AC-6904.1 768px 이상은 한 줄에 총매출 : 건당 진료비 = 3 : 2(사이 세로 선), 768px 미만은 총매출 한 줄 아래 건당 진료비 한 줄(사이 가로 선)이다', () => {
    draw(CELLS)
    expect(classes(grid())).toEqual(expect.arrayContaining(['grid', 'grid-cols-5', 'max-md:grid-cols-1']))
    expect(classes(grid())).not.toContain('grid-cols-7')
    const [total, perVisit] = cellsOf()
    expect(classes(total!)).toEqual(expect.arrayContaining(['col-span-3', 'max-md:col-span-1', 'max-md:border-b', 'max-md:border-st-line']))
    expect(classes(perVisit!)).toEqual(expect.arrayContaining(['col-span-2', 'border-l', 'border-st-line', 'max-md:col-span-1', 'max-md:border-l-0']))
  })

  it.each<[string, 'reading' | 'read-failed', string]>([
    ['읽는 중', 'reading', '불러오는 중'],
    ['읽기 실패', 'read-failed', '자료 없음'],
  ])('AC-6904.4 매출을 %s이면 두 칸 모두 값 `–`이고 아래 글은 지금 글 그대로다', (_name, state, note) => {
    draw(revenueCells(state))
    expect(cellsOf().map((el) => el.textContent)).toEqual([`총매출–${note}`, `건당 진료비–${note}`])
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('AC-6904.1 칸 사이는 선뿐이고 상자 안 상자가 없다', () => {
    const { container } = draw(CELLS)
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-6904.1 바꿀 때 강조(st-flash)·타이머가 없다', () => {
    vi.useFakeTimers()
    const { rerender } = draw(CELLS)
    rerender(<RevenueSummary cells={CELLS.map((c) => ({ ...c }))} />)
    expect(cellsOf().some((el) => classes(el).includes('st-flash'))).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-6904.1 소스에 스위치·강조 셈이 없다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/stats/sections/RevenueSummary.tsx'), 'utf8')
    expect(source).not.toMatch(/RoughSwitch|RevenueMode|RoughInfo|st-flash|useState|useEffect|setTimeout/)
  })
})
