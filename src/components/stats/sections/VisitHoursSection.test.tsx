// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { statsRange } from '@/components/stats/view'
import { VISIT_HOURS } from '@/lib/analytics/visitHours'
import type { BitSectionsView, PatientMix, VisitHours } from '@/types/stats'
import { StatsCard } from './parts'
import type { BitSectionsShown } from './PatientMixSection'
import { VisitHoursSection } from './VisitHoursSection'

// 시간대별 접수 칸 (stats-bit-sections AC-2706.1·AC-2706.3·AC-2706.5·AC-2706.6·AC-2704.1~2704.5, first90 REQ-4414 AC-4414.1·AC-4414.3,
// REQ-4417 AC-4417.2, 시안 docs/mockups/first90/redesign.html .s-sub-hours). 칸 숫자는 모두 시험 안에서 지은 가짜다

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
const cellButton = (weekday: number, hour: number) => within(cellsOf(weekday)[VISIT_HOURS.indexOf(hour)]!).getByRole('button')
const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const status = () => screen.getByRole('status')
const PICK_NOTE = '칸을 누르면 그 시간의 자세한 숫자가 나와요.'
const FOOT_NOW = '접수 시각 기준이에요. 대기 시간이나 필요한 직원 수를 뜻하지는 않아요. 0건 = 진료한 날이지만 그 시간 접수가 없었음.'
const BASIS = 'min-[1200px]:basis-7/10'
const inCard = (view: BitSectionsShown) => (
  <StatsCard id="stats-ops" title="진료 운영" desc="언제 붐비는지 · 원장님마다">
    <VisitHoursSection view={view} range={R30} className={BASIS} />
  </StatsCard>
)
const withRow = (weekday: number, change: Partial<VisitHours['rows'][number]>): VisitHours => ({
  ...HOURS,
  rows: HOURS.rows.map((one) => (one.weekday === weekday ? { ...one, ...change } : one)),
})
// 768px 미만 요일 보기
const dayGroup = () => screen.getByRole('group', { name: '요일' })
const dayButton = (name: string) => within(dayGroup()).getByRole('button', { name })
const dayList = (weekday: string) => screen.getByRole('list', { name: `${weekday} 시간마다 하루 평균 접수` })
const dayTexts = (weekday: string) =>
  within(dayList(weekday))
    .getAllByRole('listitem')
    .map((li) => [...li.children].filter((el) => el.getAttribute('aria-hidden') !== 'true').map((el) => el.textContent))
const dayFill = (weekday: string, index: number) => within(dayList(weekday)).getAllByRole('listitem')[index]!.querySelector('[aria-hidden="true"]')!.firstElementChild as HTMLElement
const fullToggle = () => screen.getByRole('button', { name: /^(전체 표 보기|요일별로 보기)$/ })

afterEach(cleanup)

describe('AC-4414.1·AC-4414.3: 진료 운영 카드 안 시간대별 접수', () => {
  it('AC-4414.3: 카드 안에서는 h3 "시간대별 접수" + 옆 글 "요일·시간마다 하루 평균 접수 · {기간 이름}"이다', () => {
    render(inCard(ready()))
    expect(screen.getByRole('heading', { level: 3, name: '시간대별 접수' })).toBeTruthy()
    expect(screen.getByText('요일·시간마다 하루 평균 접수 · 최근 30일')).toBeTruthy()
  })

  it.each<[string, BitSectionsShown]>([
    ['숫자가 있을 때', ready()],
    ['답을 기다릴 때', 'waiting'],
    ['이 기기에서 불러오지 않음', null],
    ['옛 도우미', { kind: 'old-helper' }],
    ['이 기간 접수 없음', ready(HOURS, { ...MIX, total: { people: 0, visits: 0 } })],
  ])('AC-4414.1: %s도 받은 className(1200px 이상 70%%)이 칸 바깥 section에 붙는다', (_name, view) => {
    render(inCard(view))
    const section = screen.getByRole('heading', { level: 3, name: '시간대별 접수' }).closest('section')!
    expect(tokens(section)).toEqual(expect.arrayContaining(['min-w-0', BASIS]))
  })
})

describe('AC-2706.3·AC-4414.3 시간대별 접수 칸', () => {
  it('AC-2706.1: h2 "시간대별 접수" + 옆 설명 "요일·시간마다 하루 평균 접수 · {기간 이름}"이고 칸 폭은 놓는 쪽이 준다', () => {
    draw(ready())
    expect(screen.getByText('요일·시간마다 하루 평균 접수 · 최근 30일')).toBeTruthy()
    expect(section().className.split(' ')).toContain('col-span-12')
  })

  it('AC-2704.3·AC-4414.3: 머리 줄은 "가장 붐비는 때 {요일}요일 {hh}:00–{hh}:59 · 하루 평균 {v}건 ({요일}요일 {d}일 동안 {n}건)"이고 요일·시와 평균은 굵다', () => {
    draw(ready())
    const headline = screen.getByText((_, node) => node?.tagName === 'P' && (node.textContent ?? '').startsWith('가장 붐비는 때'))
    expect(headline.textContent).toBe('가장 붐비는 때 월요일 09:00–09:59 · 하루 평균 14.3건 (월요일 4일 동안 57건)')
    expect([...headline.querySelectorAll('.font-semibold')].map((node) => node.textContent)).toEqual(['월요일 09:00–09:59', '14.3건'])
    expect(headline.querySelector('.text-st-muted')!.textContent).toBe('(월요일 4일 동안 57건)')
  })

  it('AC-2704.3·AC-4414.3: 센 접수가 없으면 머리 줄이 없다', () => {
    draw(ready({ ...HOURS, peak: null }))
    expect(screen.queryByText(/가장 붐비는 때/)).toBeNull()
  })

  it('AC-2704.2·AC-4414.3: 표는 늘 월~일 일곱 줄과 8시~20시 열세 열이고, 문 연 날이 없는 요일 줄은 "진료한 날 없음 · 이 기간 {요일}요일에는 접수가 없었어요" 한 칸이다', () => {
    draw(ready())
    const head = within(heat()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(head).toEqual(['요일', ...VISIT_HOURS.map((hour) => `${hour}시`)])
    expect(within(heat()).getAllByRole('columnheader')[0]!.querySelector('.sr-only')!.textContent).toBe('요일')
    expect(bodyRows().map((tr) => within(tr).getByRole('rowheader').textContent)).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    for (const tr of bodyRows().slice(0, 6)) expect(within(tr).getAllByRole('cell')).toHaveLength(13)
    const sunday = cellsOf(7)
    expect(sunday).toHaveLength(1)
    expect(sunday[0]!.getAttribute('colspan')).toBe('13')
    expect(sunday[0]!.textContent).toBe('진료한 날 없음 · 이 기간 일요일에는 접수가 없었어요')
    expect(within(sunday[0]!).queryByRole('button')).toBeNull()
  })

  it('AC-2704.1·AC-4414.3: 칸은 하루 평균을 소수 한 자리로 보이고 0이면 "0"이다', () => {
    draw(ready())
    expect(cellsOf(1).slice(0, 4).map((td) => td.textContent)).toEqual(['6.5', '14.3', '12.8', '0'])
    expect(cellsOf(6).slice(0, 2).map((td) => td.textContent)).toEqual(['8.0', '13.2'])
  })

  it('AC-4414.3·AC-4417.2: 칸 색은 하루 평균 구간(0건 · 0.1–4.9 · 5–9.9 · 10–14.9 · 15–19.9 · 20건 이상 = bg-st-h0~h5)이고 칸마다 st-move-heat다', () => {
    draw(ready(withRow(3, { openDays: 4, cells: cells(1, 60, 80) }))) // 0.25 · 15 · 20
    expect(tokens(cellButton(1, 8))).toContain('bg-st-h2') // 6.5
    expect(tokens(cellButton(1, 9))).toContain('bg-st-h3') // 14.25 → 14.3
    expect(tokens(cellButton(1, 11))).toEqual(expect.arrayContaining(['bg-st-h0', 'text-st-muted'])) // 0
    expect(tokens(cellButton(3, 8))).toContain('bg-st-h1') // 0.25
    expect(tokens(cellButton(3, 9))).toEqual(expect.arrayContaining(['bg-st-h4', 'text-surface'])) // 15
    expect(tokens(cellButton(3, 10))).toEqual(expect.arrayContaining(['bg-st-h5', 'text-surface'])) // 20
    for (const tr of bodyRows().slice(0, 6)) for (const button of within(tr).getAllByRole('button')) expect(tokens(button)).toContain('st-move-heat')
  })

  it('AC-4417.2: 기간을 바꾸면 같은 칸이 남아 색만 바뀐다(st-move-heat가 200ms 옮긴다)', () => {
    const view = draw(ready())
    const before = cellButton(1, 8)
    expect(tokens(before)).toContain('bg-st-h2')
    view.rerender(<VisitHoursSection view={ready(withRow(1, { cells: cells(90) }))} range={R30} />)
    expect(cellButton(1, 8)).toBe(before)
    expect(tokens(before)).toContain('bg-st-h5') // 22.5
    expect(before.textContent).toBe('22.5')
  })

  it('AC-4414.3: 칸 색 범례는 여섯 칸 "0건" · "0.1–4.9" · "5–9.9" · "10–14.9" · "15–19.9" · "20건 이상"이다', () => {
    draw(ready())
    const legend = screen.getByRole('list', { name: '색 구간(하루 평균 건수)' })
    const items = within(legend).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['0건', '0.1–4.9', '5–9.9', '10–14.9', '15–19.9', '20건 이상'])
    items.forEach((li, i) => expect(tokens(li.querySelector('[aria-hidden="true"]')!)).toContain(`bg-st-h${i}`))
    expect(screen.queryByText('적음')).toBeNull()
  })

  it('AC-4414.3: 칸을 누르면(PC는 올리기도) 아래 줄(role="status")에 그 칸 글이 나오고, 처음 글은 "칸을 누르면 그 시간의 자세한 숫자가 나와요."다', () => {
    draw(ready())
    expect(status().textContent).toBe(PICK_NOTE)
    const nine = cellButton(1, 9)
    expect(nine.getAttribute('aria-label')).toBe('월요일 09:00–09:59 · 하루 평균 14.3건 · 월요일 4일 동안 57건 ÷ 4일')
    expect(nine.getAttribute('aria-pressed')).toBeNull()
    fireEvent.click(nine)
    expect(status().textContent).toBe('월요일 09:00–09:59 · 하루 평균 14.3건 · 월요일 4일 동안 57건 ÷ 4일')
    expect(nine.getAttribute('aria-pressed')).toBe('true')
    fireEvent.mouseEnter(cellButton(6, 8))
    expect(status().textContent).toBe('토요일 08:00–08:59 · 하루 평균 8.0건 · 토요일 5일 동안 40건 ÷ 5일')
    expect(cellButton(6, 8).getAttribute('aria-pressed')).toBe('true')
    expect(nine.getAttribute('aria-pressed')).toBeNull()
    fireEvent.click(cellButton(1, 11))
    expect(status().textContent).toBe('월요일 11:00–11:59 · 하루 평균 0.0건 · 월요일 4일 동안 0건 ÷ 4일')
  })

  it('AC-4414.3: 고른 칸의 요일이 문 연 날이 없는 기간으로 바뀌면 아래 줄은 처음 글로 돌아간다', () => {
    const view = draw(ready())
    fireEvent.click(cellButton(1, 9))
    view.rerender(<VisitHoursSection view={ready(withRow(1, { openDays: 0, cells: cells() }))} range={R30} />)
    expect(status().textContent).toBe(PICK_NOTE)
  })

  it('AC-4414.3: 아래 글 "접수 시각 기준이에요. …"이 접지 않고 보인다', () => {
    draw(ready())
    expect(screen.getByText(FOOT_NOW).closest('[hidden]')).toBeNull()
  })

  it('AC-2706.3·AC-4414.3: 좁으면 표만 옆으로 밀리고(밀 수 있는 칸에 이름) 요일 칸은 붙어 있다', () => {
    draw(ready())
    const scroller = heat().parentElement!
    expect(tokens(scroller)).toContain('overflow-x-auto')
    expect(scroller.getAttribute('tabindex')).toBe('0')
    expect(scroller.getAttribute('aria-label')).toBe('시간대별 접수 표, 옆으로 밀어 볼 수 있어요')
    expect(tokens(heat())).toContain('min-w-175')
    const weekday = within(bodyRows()[0]!).getByRole('rowheader')
    expect(tokens(weekday)).toEqual(expect.arrayContaining(['sticky', 'left-0', 'bg-surface']))
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

// ── stats-pc-ux: 아래 글 접기 (REQ-4004 AC-4004.2 ⑦·AC-4004.3) ─────────────────
describe('AC-4004.2 ⑦·AC-4004.3: 시간대별 접수 아래 글은 "어떻게 세나요?" 안이다', () => {
  const FOOT = '병원 접수 시간(8시~20시) 기준이에요. 8시 전 접수는 8시 칸, 20시 넘은 접수는 20시 칸에 넣어요. 예약 대기·취소한 접수는 세지 않아요. 문을 연 날만 평균에 넣어요.'
  const howButton = () => screen.getByRole('button', { name: '어떻게 세나요?' })
  const howBody = () => document.getElementById(howButton().getAttribute('aria-controls')!)!
  const detailPanel = () => document.getElementById(screen.getByRole('button', { name: '자세히' }).getAttribute('aria-controls')!)!

  it('AC-4004.2: 아래 글은 "어떻게 세나요?" 칸 안에 있고 처음에는 접혀(hidden) 있어 그 자리에 보이지 않는다', () => {
    draw(ready())
    expect(howButton().getAttribute('aria-expanded')).toBe('false')
    expect(howBody().hidden).toBe(true)
    expect(screen.getByText(FOOT).closest('[hidden]')).toBe(howBody())
    expect(howBody().textContent).toBe(FOOT)
    fireEvent.click(howButton())
    expect(howBody().hidden).toBe(false)
  })

  it('AC-4004.2: 접는 칸은 [자세히] 칸 바로 다음이고 칸의 맨 끝이다(지금 자리)', () => {
    draw(ready())
    const fold = howButton().parentElement!
    expect(fold.contains(howBody())).toBe(true)
    expect(detailPanel().nextElementSibling).toBe(fold)
    expect(section().lastElementChild).toBe(fold)
  })

  it('AC-4004.3·AC-4414.3: 칸 색 범례와 접수 시각 모름 안내는 접지 않고 접는 칸 앞에 그대로 보인다', () => {
    draw(ready())
    const legend = screen.getByRole('list', { name: '색 구간(하루 평균 건수)' })
    const unknown = screen.getByText('접수 시각을 모르는 3건은 뺐어요.')
    for (const shown of [legend, unknown]) {
      expect(shown.closest('[hidden]')).toBeNull()
      expect(shown.compareDocumentPosition(howButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('AC-4004.2: 빈 상태·기다리는 칸에는 접는 칸이 없다', () => {
    draw(null)
    expect(screen.queryByRole('button', { name: '어떻게 세나요?' })).toBeNull()
    cleanup()
    draw('waiting')
    expect(screen.queryByRole('button', { name: '어떻게 세나요?' })).toBeNull()
  })
})

// ── first90 AC-4414.3: 768px 미만 요일 보기 · [전체 표 보기] (시안 .s-hm-m). 화면 폭은 class로 증명한다 ──
describe('AC-4414.3: 768px 미만 요일 단추 · 시간 가로 막대 · [전체 표 보기]', () => {
  it('AC-4414.3: 768px 미만에는 요일 단추 일곱(처음 첫 요일, 문 연 날 없는 요일은 막힘)과 시간마다 가로 막대 "{hh}:00 {v}건"이고, PC 표는 768px 미만에서 숨는다', () => {
    draw(ready())
    expect(tokens(heat().closest('[data-hm-view="full"]')!)).toContain('max-md:hidden')
    const dayView = dayGroup().closest('[data-hm-view="day"]') as HTMLElement
    expect(tokens(dayView)).toContain('md:hidden')
    expect(dayView.hidden).toBe(false)
    const buttons = within(dayGroup()).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false', 'false'])
    expect(dayButton('일').getAttribute('aria-disabled')).toBe('true')
    expect(dayButton('일').getAttribute('title')).toBe('진료한 날 없음')
    expect(dayTexts('월요일')).toEqual([
      ['08:00', '6.5건'],
      ['09:00', '14.3건'],
      ['10:00', '12.8건'],
      ...VISIT_HOURS.slice(3).map((hour) => [`${hour}:00`, '0건']),
    ])
  })

  it('AC-4414.3·AC-4417.2: 시간 막대 폭은 기간 전체에서 가장 붐비는 칸 대비이고 색은 칸 색 구간을 따르며 st-move-period로 움직인다. 그 요일 가장 붐비는 시간은 진한 파랑 글자다', () => {
    draw(ready())
    expect(dayFill('월요일', 0).style.width).toBe('45.61%') // 6.5 ÷ 14.25
    expect(dayFill('월요일', 1).style.width).toBe('100%')
    expect(tokens(dayFill('월요일', 0))).toEqual(expect.arrayContaining(['st-move-period', 'bg-st-h3'])) // 5–9.9
    expect(tokens(dayFill('월요일', 1))).toContain('bg-st-h4') // 10–14.9
    const peak = within(dayList('월요일')).getAllByRole('listitem')[1]!
    expect(tokens(peak)).toContain('text-accent-strong')
    expect(tokens(within(dayList('월요일')).getAllByRole('listitem')[0]!)).not.toContain('text-accent-strong')
  })

  it('AC-4414.3: 요일 단추를 누르면 그 요일 막대로 바뀌고, 막힌 요일은 눌러도 그대로다', () => {
    draw(ready())
    fireEvent.click(dayButton('토'))
    expect(dayButton('토').getAttribute('aria-pressed')).toBe('true')
    expect(dayButton('월').getAttribute('aria-pressed')).toBe('false')
    expect(dayTexts('토요일').slice(0, 2)).toEqual([
      ['08:00', '8.0건'],
      ['09:00', '13.2건'],
    ])
    fireEvent.click(dayButton('일'))
    expect(dayButton('토').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('list', { name: '일요일 시간마다 하루 평균 접수' })).toBeNull()
  })

  it('AC-4414.3: 처음 고른 요일은 문 연 날이 있는 첫 요일이다', () => {
    draw(ready(withRow(1, { openDays: 0, cells: cells() })))
    expect(dayButton('화').getAttribute('aria-pressed')).toBe('true')
    expect(dayButton('월').getAttribute('aria-disabled')).toBe('true')
    expect(dayList('화요일')).toBeTruthy()
  })

  it('AC-4414.3: [전체 표 보기]를 누르면 히트맵(요일 칸 고정, "옆으로 밀어 보세요 →")이고 단추 글은 [요일별로 보기]로 바뀐다. 다시 누르면 돌아간다', () => {
    draw(ready())
    const toggle = fullToggle()
    expect(toggle.textContent).toBe('전체 표 보기')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(tokens(toggle)).toContain('md:hidden')
    expect(screen.queryByText('옆으로 밀어 보세요 →')).toBeNull()
    fireEvent.click(toggle)
    expect(fullToggle().textContent).toBe('요일별로 보기')
    expect(fullToggle().getAttribute('aria-expanded')).toBe('true')
    const full = heat().closest('[data-hm-view="full"]')!
    expect(tokens(full)).not.toContain('max-md:hidden')
    expect(tokens(screen.getByText('옆으로 밀어 보세요 →'))).toContain('md:hidden')
    expect(within(bodyRows()[0]!).getByRole('rowheader').className).toContain('sticky')
    expect((document.querySelector('[data-hm-view="day"]') as HTMLElement).hidden).toBe(true)
    fireEvent.click(fullToggle())
    expect(fullToggle().textContent).toBe('전체 표 보기')
    expect(tokens(heat().closest('[data-hm-view="full"]')!)).toContain('max-md:hidden')
    expect((document.querySelector('[data-hm-view="day"]') as HTMLElement).hidden).toBe(false)
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
