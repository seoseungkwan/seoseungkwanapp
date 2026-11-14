// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { rangeOf, statsRange, type StatsRange } from '@/components/stats/view'
import type { DayPayload } from '@/types/payload'
import { StatsCard } from './parts'
import { WeekdaySection } from './WeekdaySection'

// 요일별 내원 (stats REQ-513 AC-513.1·513.3·513.4, first90 REQ-4414 AC-4414.1·AC-4414.2, REQ-4417 AC-4417.2,
// 시안 docs/mockups/first90/redesign.html .s-week). 가짜 일 줄은 이 파일 안에서만 만든다

const TODAY = '2026-11-13' // 금요일
const RANGE = statsRange(TODAY, '30d') // 10월 14일 ~ 11월 12일
const BASIS = 'min-[1200px]:basis-3/10'

function day(ymd: string, patients: number, partial = false): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients, newPatients: 1, returning: patients - 1, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 1, within7: null, within14: null },
  }
}

// 월요일 둘(10월 19일·26일) 평균 15명, 화요일 하나 8명. 일요일 없음
const DAYS = [day('2026-10-19', 10), day('2026-10-26', 21), day('2026-10-20', 8)]

// 진료 운영 카드 안에 놓는다(StatsSections와 같은 자리)
const inCard = (days: readonly DayPayload[], range: StatsRange = RANGE, saved = true) => (
  <StatsCard id="stats-ops" title="진료 운영" desc="언제 붐비는지 · 원장님마다">
    <WeekdaySection days={days} range={range} saved={saved} className={BASIS} />
  </StatsCard>
)
const list = () => screen.getByRole('list', { name: '요일마다 하루 평균 내원' })
const rowTexts = () => within(list()).getAllByRole('listitem').map((li) => [...li.children].filter((el) => el.getAttribute('aria-hidden') !== 'true').map((el) => el.textContent))
const fillOf = (weekday: string) => {
  const li = within(list()).getAllByRole('listitem').find((item) => item.firstElementChild?.textContent === weekday)!
  return (li.querySelector('[aria-hidden="true"]')?.firstElementChild ?? null) as HTMLElement | null
}
const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

afterEach(cleanup)

describe('AC-4414.1·AC-4414.2: 진료 운영 카드 안 요일별 내원', () => {
  it('AC-4414.2: 카드 안에서는 h3 "요일별 내원" + 옆 글 "하루 평균 · 요일마다"이다', () => {
    render(inCard(DAYS))
    expect(screen.getByRole('heading', { level: 3, name: '요일별 내원' })).toBeTruthy()
    expect(screen.getByText('하루 평균 · 요일마다')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['진료 운영'])
  })

  it('AC-4414.1: 받은 className(1200px 이상 30%)은 칸 바깥 section에 붙는다 — 자료가 있을 때 · 저장된 숫자가 없을 때 · 이 기간 자료가 없을 때 모두', () => {
    for (const [days, saved] of [
      [DAYS, true],
      [[], false],
      [[day('2026-01-05', 3)], true],
    ] as const) {
      render(inCard(days, RANGE, saved))
      const section = screen.getByRole('heading', { level: 3, name: '요일별 내원' }).closest('section')!
      expect(tokens(section)).toEqual(expect.arrayContaining(['min-w-0', BASIS]))
      cleanup()
    }
  })

  it('AC-4414.2: 요일마다 가로 막대와 "{n}건"이고 진료한 날이 없는 요일은 막대 대신 "진료한 날 없음"이다(월~일 일곱 줄)', () => {
    render(inCard(DAYS))
    expect(rowTexts()).toEqual([
      ['월', '15건'],
      ['화', '8건'],
      ['수', '진료한 날 없음'],
      ['목', '진료한 날 없음'],
      ['금', '진료한 날 없음'],
      ['토', '진료한 날 없음'],
      ['일', '진료한 날 없음'],
    ])
    expect(fillOf('월')!.style.width).toBe('100%')
    expect(fillOf('화')!.style.width).toBe('53.33%') // 8 ÷ 15
    for (const name of ['수', '목', '금', '토', '일']) expect(fillOf(name), name).toBeNull()
  })

  it('AC-4414.2: 그래프 밑 옛 안내("자료 있는 요일만…")는 없다 — 일곱 줄이 진료한 날 없음을 보인다', () => {
    render(inCard(DAYS))
    expect(screen.queryByText(/자료 있는 요일만/)).toBeNull()
    expect(screen.queryByText(/일요일은 진료한 날이 없어요/)).toBeNull()
    expect(screen.queryByText('일부 기간')).toBeNull()
  })

  it('AC-4417.2: 막대는 기간을 바꾸면 폭이 움직인다(st-move-period) — 같은 막대가 남아 폭만 바뀐다', () => {
    const view = render(inCard(DAYS))
    const monday = fillOf('월')!
    const tuesday = fillOf('화')!
    expect(tokens(monday)).toContain('st-move-period')
    expect(tokens(monday)).toContain('bg-accent')
    view.rerender(inCard([day('2026-10-19', 10), day('2026-10-20', 20)]))
    expect(fillOf('월')).toBe(monday)
    expect(fillOf('화')).toBe(tuesday)
    expect(monday.style.width).toBe('50%')
    expect(tuesday.style.width).toBe('100%')
  })
})

describe('AC-513.1·AC-4414.2: 일부 기간 · 오늘(진료 중)은 지금 그대로다', () => {
  it('AC-513.1·AC-4414.2: 12개월에 오늘(진료 중) 줄이 들면 그 요일은 빗금 막대이고 빗금 범례와 "오늘" 안내를 더한다', () => {
    render(inCard([...DAYS, day(TODAY, 4, true)], statsRange(TODAY, '12m')))
    expect(screen.getByText('내원', { selector: 'li span' })).toBeTruthy()
    expect(screen.getAllByText('일부 기간').length).toBeGreaterThan(0)
    expect(screen.getByText('빗금 막대에는 오늘(진료 중) 숫자가 들어 있어요.')).toBeTruthy()
    const friday = fillOf('금')!
    expect(tokens(friday)).toEqual(expect.arrayContaining(['st-move-period', 'border', 'border-accent', 'bg-surface']))
    expect(friday.querySelector('svg path')).not.toBeNull()
    expect(tokens(fillOf('월')!)).toContain('bg-accent')
  })

  it('AC-513.1·AC-4414.2: 덜 끝난 줄이 오늘이 아니면 빗금과 "일부 기간"만이고 오늘이라고 쓰지 않는다', () => {
    render(inCard([...DAYS, day('2026-11-12', 4, true)]))
    expect(screen.getByText('내원', { selector: 'li span' })).toBeTruthy()
    expect(screen.getAllByText('일부 기간').length).toBeGreaterThan(0)
    expect(fillOf('목')!.querySelector('svg path')).not.toBeNull()
    expect(screen.queryByText(/오늘\(진료 중\)/)).toBeNull()
  })

  it('AC-513.1: 오늘 줄이 덜 끝났어도 고른 기간 밖이면(최근 30일) "오늘(진료 중)"을 쓰지 않고 빗금도 없다', () => {
    render(inCard([...DAYS, day(TODAY, 4, true)]))
    expect(screen.queryByText(/오늘\(진료 중\)/)).toBeNull()
    expect(screen.queryByText('일부 기간')).toBeNull()
    expect(rowTexts()[4]).toEqual(['금', '진료한 날 없음'])
  })

  it('AC-513.1: 카드 밖에서 그리면 지금처럼 h2 칸이다', () => {
    render(<WeekdaySection days={DAYS} range={RANGE} saved />)
    expect(screen.getByRole('heading', { level: 2, name: '요일별 내원' })).toBeTruthy()
  })
})

describe('AC-513.3: 요일별 [자세히]', () => {
  it('AC-513.3·AC-4414.2: 표는 막대 목록 바로 아래에 열린다', () => {
    render(inCard(DAYS))
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const button = screen.getByRole('button', { name: '접기' })
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(panel.previousElementSibling).toBe(list())
    expect(panel.parentElement!.lastElementChild).toBe(panel)
  })

  it('AC-513.3·AC-4414.2: 표는 요일 · 하루 평균({n}건) · 자료 있는 날이다', () => {
    render(inCard(DAYS))
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const table = screen.getByRole('table', { name: '요일별 내원' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['요일', '하루 평균', '자료 있는 날'])
    const rows = within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((td) => td.textContent))
    expect(rows).toEqual([
      ['월요일', '15건', '2일'],
      ['화요일', '8건', '1일'],
    ])
  })

  it('AC-513.3: 덜 끝난 줄이 든 요일 칸에는 칩이 붙는다', () => {
    render(inCard([...DAYS, day('2026-11-12', 4, true)]))
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const table = screen.getByRole('table', { name: '요일별 내원' })
    expect(within(table).getByText('일부 기간').className).toContain('text-warning')
    expect(within(table).getByText('목요일').textContent).toBe('목요일일부 기간')
  })

  it('AC-513.3·AC-4414.2: 같은 날 줄이 둘이어도 자료 있는 날은 하루로 센다', () => {
    render(inCard([...DAYS, day('2026-10-20', 9)]))
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const table = screen.getByRole('table', { name: '요일별 내원' })
    expect(within(within(table).getAllByRole('row')[2]!).getAllByRole('cell').map((td) => td.textContent)).toEqual(['화요일', '9건', '1일'])
  })

  it('AC-513.3·AC-4414.2: 기간 밖 줄은 세지 않는다', () => {
    render(inCard([...DAYS, day('2026-09-21', 40)]))
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const table = screen.getByRole('table', { name: '요일별 내원' })
    expect(within(within(table).getAllByRole('row')[1]!).getAllByRole('cell').map((td) => td.textContent)).toEqual(['월요일', '15건', '2일'])
  })
})

describe('AC-513.4: 요일별 빈 상태', () => {
  it('AC-513.4: 저장된 숫자가 없으면 막대·[자세히] 없이 목업 문구다', () => {
    render(<WeekdaySection days={[]} range={RANGE} saved={false} />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러오면 요일마다 하루 평균 환자 수가 보여요.')
    expect(screen.queryByRole('table', { hidden: true })).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('AC-513.4: 저장된 숫자는 있는데 이 기간 자료가 없으면 그 문구다', () => {
    render(<WeekdaySection days={[day('2026-01-05', 3)]} range={RANGE} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
  })
})

// ── 고른 기간 (stats-period REQ-1704). 오늘은 2026-11-06(금)이다 ─────────────────
describe('AC-1704.4·AC-1704.5: 고른 기간의 요일별 내원', () => {
  const OCT = rangeOf('2026-11-06', { kind: 'month', unit: 'day', month: '2026-10' }, false)
  // 10월 월요일 둘(5일·12일) 평균 15명. 9월 7일(월) 100명은 바로 전 기간이라 세지 않는다
  const PICK_DAYS = [day('2026-09-07', 100), day('2026-10-05', 10), day('2026-10-12', 20)]

  it('AC-1704.4·AC-4414.2: 옆 글 끝에 " · {name}"이 붙는다', () => {
    render(<WeekdaySection days={PICK_DAYS} range={OCT} saved />)
    expect(screen.getByText('하루 평균 · 요일마다 · 2026년 10월')).toBeTruthy()
  })

  it('AC-1704.5·AC-4414.2: current 날만 센다', () => {
    render(<WeekdaySection days={PICK_DAYS} range={OCT} saved />)
    expect(rowTexts()[0]).toEqual(['월', '15건'])
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const table = screen.getByRole('table', { name: '요일별 내원' })
    const rows = within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((td) => td.textContent))
    expect(rows).toEqual([['월요일', '15건', '2일']])
  })

  it('AC-1704.5: current에 줄이 없으면 지금처럼 "불러온 숫자에 이 기간 자료가 없어요."다', () => {
    render(<WeekdaySection days={[day('2026-09-07', 100)]} range={OCT} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
  })
})
