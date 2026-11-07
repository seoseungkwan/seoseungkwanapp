// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { statsRange } from '@/components/stats/view'
import { VISIT_HOURS, visitHoursHeadline } from '@/lib/analytics/visitHours'
import type { BitSectionsView, PatientMix, VisitHours } from '@/types/stats'
import type { BitSectionsShown } from './PatientMixSection'
import { VisitHoursSection } from './VisitHoursSection'

// 시간대별 접수 칸 (stats-bit-sections AC-2706.1·AC-2706.3·AC-2706.5·AC-2706.6·AC-2704.1~2704.5, 시안 docs/mockups/stats-bit-sections).
// 칸 숫자는 모두 시험 안에서 지은 가짜다

const TODAY = '2026-11-13'
const R30 = statsRange(TODAY, '30d')

// 8시부터 차례로 채우고 나머지 칸은 0
const cells = (...values: number[]) => [...values, ...Array<number>(VISIT_HOURS.length - values.length).fill(0)]
const HOURS: VisitHours = {
  hours: [...VISIT_HOURS],
  rows: [
    { weekday: 1, openDays: 4, cells: cells(26, 57, 51) }, // 6.5 · 14.25(가장 붐빔) · 12.75
    { weekday: 2, openDays: 4, cells: cells(21, 47) },
    { weekday: 3, openDays: 4, cells: cells(19, 44) },
    { weekday: 4, openDays: 4, cells: cells(20, 45) },
    { weekday: 5, openDays: 4, cells: cells(22, 50) },
    { weekday: 6, openDays: 5, cells: cells(40, 66) },
    { weekday: 7, openDays: 0, cells: cells() },
  ],
  unknown: 3,
  peak: { weekday: 1, hour: 9, average: 57 / 4 },
}
const MIX: PatientMix = { total: { people: 10, visits: 12 }, compared: false, age: [], insurance: [], city: [], town: [] }
const ready = (hours: VisitHours = HOURS, mix: PatientMix = MIX): BitSectionsView => ({ kind: 'ready', mix: { all: mix, new: mix }, hours, doctors: { kind: 'single' } })

const draw = (view: BitSectionsShown) => render(<VisitHoursSection view={view} range={R30} className="col-span-12" />)
const section = () => screen.getByRole('heading', { level: 2, name: '시간대별 접수' }).closest('section')!
const heat = () => screen.getByRole('table', { name: '요일·시간마다 하루 평균 접수 (건)' })
const bodyRows = () => within(heat()).getAllByRole('row').slice(1)
const cellsOf = (weekday: number) => within(bodyRows()[weekday - 1]!).getAllByRole('cell')

afterEach(cleanup)

describe('AC-2706.3 시간대별 접수 칸', () => {
  it('AC-2706.1: h2 "시간대별 접수" + 옆 설명 "요일·시간마다 하루 평균 접수 · {기간 이름}"이고 칸 폭은 놓는 쪽이 준다', () => {
    draw(ready())
    expect(screen.getByText('요일·시간마다 하루 평균 접수 · 최근 30일')).toBeTruthy()
    expect(section().className.split(' ')).toContain('col-span-12')
  })

  it('AC-2704.3: 머리글은 visitHoursHeadline 글이고 요일·시와 평균은 굵다', () => {
    draw(ready())
    const headline = screen.getByText((_, node) => node?.tagName === 'P' && node.textContent === visitHoursHeadline(HOURS))
    expect(headline.textContent).toBe('가장 붐비는 때는 월요일 오전 9시예요 · 하루 평균 14.3건')
    expect([...headline.querySelectorAll('.font-semibold')].map((node) => node.textContent)).toEqual(['월요일 오전 9시', '14.3건'])
  })

  it('AC-2704.2: 표는 늘 월~일 일곱 줄과 8시~20시 열세 열이다(요일 머리 칸은 화면 읽기 글)', () => {
    draw(ready())
    const head = within(heat()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(head).toEqual(['요일', ...VISIT_HOURS.map((hour) => `${hour}시`)])
    expect(within(heat()).getAllByRole('columnheader')[0]!.querySelector('.sr-only')!.textContent).toBe('요일')
    expect(bodyRows().map((tr) => within(tr).getByRole('rowheader').textContent)).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    for (const tr of bodyRows()) expect(within(tr).getAllByRole('cell')).toHaveLength(13)
  })

  it('AC-2704.1: 칸은 하루 평균을 소수 한 자리로 보이고 0이면 "–"다. 문 연 날이 없는 요일은 모두 "–"다', () => {
    draw(ready())
    expect(cellsOf(1).slice(0, 4).map((td) => td.textContent)).toEqual(['6.5', '14.3', '12.8', '–'])
    expect(cellsOf(6).slice(0, 2).map((td) => td.textContent)).toEqual(['8.0', '13.2'])
    expect(cellsOf(7).every((td) => td.textContent === '–')).toBe(true)
  })

  it('AC-2704.4: 칸 색은 cellLevel 단계(1~5 = chart-1~chart-5)이고 0인 칸은 색이 없다', () => {
    draw(ready())
    const [eight, nine, ten, eleven] = cellsOf(1)
    expect(nine!.className).toContain('bg-chart-5') // 14.25 ÷ 14.25 → 5
    expect(ten!.className).toContain('bg-chart-5') // 12.75 ÷ 14.25 × 5 = 4.47 → 5
    expect(eight!.className).toContain('bg-chart-3') // 6.5 ÷ 14.25 × 5 = 2.28 → 3
    expect(eleven!.className).toContain('bg-surface')
    expect(eleven!.className).not.toMatch(/bg-chart-/)
    expect(cellsOf(6)[0]!.className).toContain('bg-chart-3') // 8.0 → 2.8 → 3
    expect(cellsOf(2)[0]!.className).toContain('bg-chart-2') // 5.25 → 1.84 → 2
  })

  it('AC-2704.4: 표 아래에 "적음 → 많음" 색 다섯 칸이 있다', () => {
    draw(ready())
    const legend = screen.getByText('적음').parentElement!
    expect(legend.textContent).toBe('적음많음')
    const swatches = [...legend.querySelectorAll('[aria-hidden="true"]')].map((node) => node.className)
    expect(swatches).toHaveLength(5)
    ;['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'].forEach((tone, i) => expect(swatches[i]).toContain(tone))
  })

  it('AC-2706.3: 좁으면 표만 옆으로 밀리고 요일 칸은 붙어 있다', () => {
    draw(ready())
    expect(heat().parentElement!.className.split(' ')).toContain('overflow-x-auto')
    expect(heat().className.split(' ')).toContain('min-w-155')
    const weekday = within(bodyRows()[0]!).getByRole('rowheader')
    expect(weekday.className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'left-0', 'bg-surface']))
  })

  it('AC-2704.2: 접수 시각을 모르는 접수가 있으면 표 아래에 그 건수를 알리고, 없으면 글이 없다', () => {
    draw(ready())
    expect(screen.getByText('접수 시각을 모르는 3건은 뺐어요.')).toBeTruthy()
    cleanup()
    draw(ready({ ...HOURS, unknown: 0 }))
    expect(screen.queryByText(/접수 시각을 모르는/)).toBeNull()
  })

  it('AC-2706.3: 아래 글이 시안 그대로다', () => {
    draw(ready())
    expect(
      screen.getByText('병원 접수 시간(8시~20시) 기준이에요. 8시 전 접수는 8시 칸, 20시 넘은 접수는 20시 칸에 넣어요. 예약 대기·취소한 접수는 세지 않아요. 문을 연 날만 평균에 넣어요.'),
    ).toBeTruthy()
  })

  it('AC-2704.5: 제목 줄 오른쪽 [자세히]를 누르면 합계 표(첫 칸 "월 (4일)")가 열리고 [접기]로 닫힌다', () => {
    draw(ready())
    const open = screen.getByRole('button', { name: '자세히' })
    expect(open.closest('section')).toBe(section())
    expect(open.closest('.ml-auto')).not.toBeNull()
    expect(open.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('table', { name: '시간대별 접수 합계 (건)' })).toBeNull()
    fireEvent.click(open)
    const totals = screen.getByRole('table', { name: '시간대별 접수 합계 (건)' })
    expect(within(totals).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['요일 (문을 연 날)', ...VISIT_HOURS.map((hour) => `${hour}시`)])
    const rows = within(totals).getAllByRole('row').slice(1)
    expect(rows.map((tr) => within(tr).getAllByRole('cell')[0]!.textContent)).toEqual(['월 (4일)', '화 (4일)', '수 (4일)', '목 (4일)', '금 (4일)', '토 (5일)', '일 (0일)'])
    expect(within(rows[0]!).getAllByRole('cell').slice(1, 5).map((td) => td.textContent)).toEqual(['26', '57', '51', '–'])
    const close = screen.getByRole('button', { name: '접기' })
    expect(close.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(close)
    expect(screen.queryByRole('table', { name: '시간대별 접수 합계 (건)' })).toBeNull()
  })

  it('AC-2704.5: 합계 표 숫자는 천 단위 쉼표다', () => {
    draw(ready({ ...HOURS, rows: HOURS.rows.map((one) => (one.weekday === 1 ? { ...one, cells: cells(1234) } : one)) }))
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const first = within(screen.getByRole('table', { name: '시간대별 접수 합계 (건)' })).getAllByRole('row')[1]!
    expect(within(first).getAllByRole('cell')[1]!.textContent).toBe('1,234')
  })
})

describe('AC-2706.5·AC-2706.6 숫자가 없을 때', () => {
  it.each<[string, BitSectionsShown, string]>([
    ['이 기기에서 불러오지 않음', null, '비트 PC에서 불러오면 보여요 · 진료 줄은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.'],
    ['불러온 범위 밖(none)', { kind: 'none' }, '이 기간은 아직 불러오지 않았어요 · 이 기간을 고른 채 [비트에서 불러오기]를 누르면 보여요.'],
    [
      '옛 도우미(old-helper)',
      { kind: 'old-helper' },
      '도우미를 업데이트하면 보여요 · 새 도우미가 나이·보험·동네·접수 시각·원장님을 함께 읽어 와요. 비트 PC 연결 화면에서 업데이트할 수 있어요.',
    ],
  ])('AC-2706.5: %s → 제목만 두고 안내 한 줄이며 [자세히]·표가 없다', (_name, view, text) => {
    draw(view)
    expect(section().querySelector('p')!.textContent).toBe(text)
    expect(section().textContent).not.toContain('요일·시간마다')
    expect(within(section()).queryByRole('button')).toBeNull()
    expect(within(section()).queryByRole('table')).toBeNull()
  })

  it('AC-2706.6: 고른 기간에 접수가 하나도 없으면 "이 기간에 불러온 접수가 없어요."다', () => {
    draw(ready(HOURS, { ...MIX, total: { people: 0, visits: 0 } }))
    expect(section().querySelector('p')!.textContent).toBe('자료 없음 · 이 기간에 불러온 접수가 없어요.')
    expect(within(section()).queryByRole('table')).toBeNull()
  })

  it('AC-2706.1: 이 기간 답을 기다리는 동안은 제목·설명만이다', () => {
    draw('waiting')
    expect(section().textContent).toBe('시간대별 접수요일·시간마다 하루 평균 접수 · 최근 30일')
  })
})
