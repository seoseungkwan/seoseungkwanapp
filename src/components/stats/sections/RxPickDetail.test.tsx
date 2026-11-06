// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rxDetail, statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { addDays } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { CHART_NO_SIDE_SCROLL } from './parts'
import { RxPickDetail, type RxPickMode } from './RxPickDetail'
import { detailNote } from './trendLabels'

// 줄을 눌러 여는 그래프·자세히 (rx-picker REQ-806·807, AC-809.2 그래프 단추). 처방·일 줄은 이 파일 안에서만 지은 가짜다

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]
const NAME = '가짜 처방 가'
const LINE = { code: 'RA', name: NAME }
const GAP_ADDED = ' 주황 빗금은 신환·재진 구분이 없는 건이에요.'
const DAY_NOTE = '하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.'

type Line = [code: string, patients: number, newPatients?: number, returning?: number]
function day(ymd: string, lines: Line[], partial = false): DayPayload {
  const rx = lines.map(([code, patients, newPatients = 0, returning = patients - newPatients]) => ({ code, name: NAME, type: '', patients, newPatients, returning }))
  const patients = rx.reduce((sum, line) => sum + line.patients, 0)
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients, newPatients: 0, returning: patients, unknown: 0 },
    rx,
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}
const inputOf = (days: DayPayload[], covered: DateRange[] = WHOLE, period: StatsPeriod = '30d', today = TODAY): StatsInput => ({ days, covered, range: statsRange(today, period) })

// 30일: 이번 기간 여섯째 날(10월 19일)과 비교 기간 여섯째 날이 같은 차례다
const R30 = statsRange(TODAY, '30d')
const AT = 5
const CURRENT_DAY = addDays(R30.current.from, AT)
const PREVIOUS_DAY = addDays(R30.previous.from, AT)
const NO_GAP = [day(PREVIOUS_DAY, [['RA', 40, 10]]), day(CURRENT_DAY, [['RA', 100, 30]])]
const WITH_GAP = [day(PREVIOUS_DAY, [['RA', 40, 10, 20]]), day(CURRENT_DAY, [['RA', 100, 30, 60]])] // 구분 없음 10건씩
const PARTIAL_DAY = [day(PREVIOUS_DAY, [['RA', 40, 10]]), day(CURRENT_DAY, [['RA', 100, 30, 60]], true)]

const draw = (input: StatsInput, mode: RxPickMode = 'total', onMode: (next: RxPickMode) => void = () => {}, line = LINE) => render(<RxPickDetail line={line} input={input} mode={mode} onMode={onMode} />)
// 그래프 모양을 쥔 부모
function Parent({ input }: { input: StatsInput }) {
  const [mode, setMode] = useState<RxPickMode>('total')
  return <RxPickDetail line={LINE} input={input} mode={mode} onMode={setMode} />
}

const columnsOf = (box: HTMLElement) => Array.from(box.querySelector('.absolute.inset-0.flex')!.children)
const legendOf = (box: HTMLElement) => Array.from(box.querySelectorAll('ul li')).map((item) => item.textContent)
const totalsOf = (box: HTMLElement) => columnsOf(box).map((column) => column.querySelector('.bottom-full')?.textContent ?? null)
const modeButton = (name: string) => within(screen.getByRole('group', { name: '그래프 모양' })).getByRole('button', { name })
const chartTable = (name = `${NAME} 일별 건수 (건)`) => screen.getByRole('table', { name })
const headsOf = (table: HTMLElement) => within(table).getAllByRole('columnheader').map((head) => head.textContent)
const chartBox = (box: HTMLElement) => box.querySelector('table caption')!.closest('.relative') as HTMLElement
// [자세히]를 연 표. 그림 옆 화면 읽기 표와 이름이 달라(`(건)`이 없다) 이름으로 고른다
const detailName = (grain = '일') => `${NAME} ${grain}별 건수`
const openDetail = () => fireEvent.click(screen.getByRole('button', { name: '자세히' }))
const detailRows = (grain = '일') =>
  within(screen.getByRole('table', { name: detailName(grain) }))
    .getAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent))

afterEach(cleanup)

describe('AC-806.1: 열린 칸 안', () => {
  it('AC-806.1: 머리 → 그래프 모양 단추 → 범례 → 그래프 → 안내 → [자세히] 차례다', () => {
    const { container } = draw(inputOf(NO_GAP))
    const order = [
      screen.getByText(`${NAME} · 일별 건수`),
      screen.getByRole('group', { name: '그래프 모양' }),
      container.querySelector('ul')!,
      columnsOf(container)[0]!,
      screen.getByText(DAY_NOTE),
      screen.getByRole('button', { name: '자세히' }),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}번째`).toBeTruthy()
    }
  })
})

describe('AC-806.2: 처음 그린 칸', () => {
  it.each([
    ['7d', '일'],
    ['30d', '일'],
    ['90d', '주'],
    ['12m', '달'],
  ] as const)('AC-806.2: %s 머리는 <이름> · %s별 건수다', (period, grain) => {
    draw(inputOf(NO_GAP, WHOLE, period))
    expect(screen.getByText(`${NAME} · ${grain}별 건수`).className).toContain('font-semibold')
  })

  it('AC-806.2: 단추 묶음에 [건수만]이 눌린 모양이고 [신환·재진 나눠 보기]는 아니다', () => {
    draw(inputOf(NO_GAP))
    const buttons = within(screen.getByRole('group', { name: '그래프 모양' })).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['건수만', '신환·재진 나눠 보기'])
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    expect(buttons[0]!.className).toContain('bg-accent-soft')
    expect(buttons[1]!.className).not.toContain('bg-accent-soft')
  })

  it('AC-806.2: 범례는 건수·비교 기간이고 덜 끝난 칸이 있으면 일부 기간이 붙는다', () => {
    const whole = draw(inputOf(NO_GAP))
    expect(legendOf(whole.container)).toEqual(['건수', '비교 기간'])
    whole.unmount()
    const { container } = draw(inputOf(PARTIAL_DAY))
    expect(legendOf(container)).toEqual(['건수', '비교 기간', '일부 기간'])
  })

  it('AC-806.2: 건수 하나로 그린다. 구분 없음이 있어도 막대 하나가 건수 전체이고 재진 색이 없다', () => {
    const { container } = draw(inputOf(WITH_GAP))
    const table = chartTable()
    expect(headsOf(table)).toEqual(['기간', '건수', '합계', '상태', '비교 기간'])
    expect(within(table).getByRole('row', { name: /10월 19일/ }).textContent).toContain('100')
    const column = columnsOf(container)[AT]!
    expect(column.querySelectorAll('.bg-accent')).toHaveLength(1)
    expect((column.querySelector('.bg-accent') as HTMLElement).style.height).toBe('100%')
    expect(container.querySelector('.bg-chart-3')).toBeNull()
    expect(container.querySelector('svg.text-warning')).toBeNull()
  })

  it('AC-806.2: compact 막대이고 칸은 rxDetail의 칸이다', () => {
    const input = inputOf(NO_GAP)
    const { container } = draw(input)
    expect(columnsOf(container)).toHaveLength(rxDetail(input, 'RA').current.length)
    expect(container.querySelector('.h-40')).not.toBeNull()
  })

  it('AC-806.2: thinLabels를 주지 않아 날짜 글자가 휴대폰에서 하나 걸러 숨지 않는다', () => {
    const { container } = draw(inputOf(NO_GAP, WHOLE, '7d'))
    const ticks = Array.from(container.querySelectorAll('.text-center > p'))
    expect(ticks).toHaveLength(7)
    expect(ticks.filter((tick) => tick.className.includes('invisible'))).toEqual([])
  })

  it('AC-806.2: 처방 코드의 대소문자가 달라도 같은 처방의 칸을 그린다', () => {
    draw(inputOf(NO_GAP), 'total', () => {}, { code: 'ra', name: NAME })
    expect(within(chartTable()).getByRole('row', { name: /10월 19일/ }).textContent).toContain('100')
  })

  it('AC-806.2: 그래프 모양은 prop이라 기간을 바꿔 다시 그려도 준 값 그대로이고 칸만 바뀐다', () => {
    const { rerender } = draw(inputOf(NO_GAP), 'split')
    rerender(<RxPickDetail line={LINE} input={inputOf(NO_GAP, WHOLE, '12m')} mode="split" onMode={() => {}} />)
    expect(modeButton('신환·재진 나눠 보기').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(`${NAME} · 달별 건수`)).toBeTruthy()
  })
})

describe('AC-806.3: 비교 칸', () => {
  it('AC-806.3: 같은 차례 비교 칸의 건수가 회색 막대다', () => {
    const { container } = draw(inputOf(NO_GAP))
    const bar = columnsOf(container)[AT]!.querySelector('.bg-faint') as HTMLElement
    expect(bar.style.height).toBe('40%') // 눈금 최대 100
    expect(within(chartTable()).getByRole('row', { name: /10월 19일/ }).textContent).toContain('40')
  })

  it('AC-806.3: 덮이지 않은 비교 칸은 막대가 없다', () => {
    const covered = [{ from: addDays(R30.previous.from, AT + 1), to: '2026-11-12' }]
    const input = inputOf([day(CURRENT_DAY, [['RA', 100, 30]])], covered)
    const { container } = draw(input)
    const columns = columnsOf(container)
    expect(columns[AT]!.querySelector('.bg-faint')).toBeNull()
    expect(columns[AT + 1]!.querySelector('.bg-faint')).not.toBeNull()
  })

  // 90일 = 12주 6일이라 첫날이 월·화면 13칸, 수~일이면 14칸이다
  const rowsFor = (today: string) => {
    const range = statsRange(today, '90d')
    return [day(addDays(range.current.from, 3), [['RA', 10]]), day(addDays(range.previous.from, 3), [['RA', 5]])]
  }
  const whole = (today: string): DateRange[] => [{ from: '2024-12-01', to: addDays(today, -1) }]

  it('AC-806.3: 90일 13칸 대 14칸 — 13칸만 그리고 남는 비교 칸은 그리지 않는다', () => {
    const today = '2026-11-16'
    const input = inputOf(rowsFor(today), whole(today), '90d', today)
    const { current, previous } = rxDetail(input, 'RA')
    expect([current.length, previous.length]).toEqual([13, 14])
    const { container } = draw(input)
    expect(columnsOf(container)).toHaveLength(13)
    expect(columnsOf(container).filter((column) => column.querySelector('.bg-faint'))).toHaveLength(13)
  })

  it('AC-806.3: 90일 14칸 대 13칸 — 차례가 없는 마지막 칸은 막대가 없다', () => {
    const today = '2026-11-14'
    const input = inputOf(rowsFor(today), whole(today), '90d', today)
    const { current, previous } = rxDetail(input, 'RA')
    expect([current.length, previous.length]).toEqual([14, 13])
    const { container } = draw(input)
    const columns = columnsOf(container)
    expect(columns[13]!.querySelector('.bg-faint')).toBeNull()
    expect(columns[12]!.querySelector('.bg-faint')).not.toBeNull()
  })
})

describe('AC-806.4: 신환·재진 나눠 보기', () => {
  it('AC-806.4: [신환·재진 나눠 보기]를 누르면 부모에게 split을, [건수만]을 누르면 total을 알린다', () => {
    const onMode = vi.fn()
    draw(inputOf(NO_GAP), 'total', onMode)
    fireEvent.click(modeButton('신환·재진 나눠 보기'))
    expect(onMode).toHaveBeenLastCalledWith('split')
    fireEvent.click(modeButton('건수만'))
    expect(onMode).toHaveBeenLastCalledWith('total')
  })

  it('AC-806.4: 구분 없음이 있으면 신환·재진·구분 없음(빗금 text-warning)으로 쌓이고 범례도 따라 바뀐다', () => {
    const { container } = draw(inputOf(WITH_GAP), 'split')
    const column = columnsOf(container)[AT]!
    expect(column.querySelector('.bg-accent')).not.toBeNull()
    expect(column.querySelector('.bg-chart-3')).not.toBeNull()
    expect(column.querySelector('svg.text-warning')).not.toBeNull()
    expect(legendOf(container)).toEqual(['신환', '재진', '구분 없음', '비교 기간'])
    expect(headsOf(chartTable())).toEqual(['기간', '신환', '재진', '구분 없음', '합계', '상태', '비교 기간'])
    const cells = within(chartTable()).getByRole('row', { name: /10월 19일/ })
    expect(within(cells).getAllByRole('cell').map((cell) => cell.textContent).slice(0, 4)).toEqual(['30', '60', '10', '100'])
  })

  it('AC-806.4: 그 칸들에 구분 없음이 없으면 신환·재진 둘뿐이다', () => {
    const { container } = draw(inputOf(NO_GAP), 'split')
    expect(legendOf(container)).toEqual(['신환', '재진', '비교 기간'])
    expect(container.querySelector('svg.text-warning')).toBeNull()
    expect(headsOf(chartTable())).toEqual(['기간', '신환', '재진', '합계', '상태', '비교 기간'])
  })

  it.each(['total', 'split'] as const)('AC-806.4: 덜 끝난 칸은 %s 모양에서도 파란 빗금 막대이고 높이는 건수 전체다', (mode) => {
    const { container } = draw(inputOf(PARTIAL_DAY), mode)
    const column = columnsOf(container)[AT]!
    expect(column.querySelector('svg.text-accent')).not.toBeNull()
    expect(column.querySelector('.bg-accent')).toBeNull()
    expect(column.querySelector('.bg-chart-3')).toBeNull()
    expect((column.querySelector('svg.text-accent')!.parentElement as HTMLElement).style.height).toBe('100%')
    expect(legendOf(container).at(-1)).toBe('일부 기간')
  })

  it('AC-806.4: 부모가 모양을 쥐면 눌러서 나뉘고 [건수만]을 누르면 돌아온다', () => {
    const { container } = render(<Parent input={inputOf(WITH_GAP)} />)
    expect(container.querySelector('.bg-chart-3')).toBeNull()
    fireEvent.click(modeButton('신환·재진 나눠 보기'))
    expect(modeButton('신환·재진 나눠 보기').getAttribute('aria-pressed')).toBe('true')
    expect(modeButton('건수만').getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('.bg-chart-3')).not.toBeNull()
    fireEvent.click(modeButton('건수만'))
    expect(modeButton('건수만').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.bg-chart-3')).toBeNull()
    expect(legendOf(container)).toEqual(['건수', '비교 기간'])
  })
})

describe('AC-806.6: 그래프 아래 안내', () => {
  it('AC-806.6: 건수만은 처방 추세와 같은 글이다(구분 없음이 있어도)', () => {
    const input = inputOf(WITH_GAP)
    draw(input)
    const note = screen.getByText(DAY_NOTE)
    expect(note.textContent).toBe(detailNote('30d', rxDetail(input, 'RA').current, TODAY))
  })

  it('AC-806.6: 나눠 보기에서 구분 없음이 있으면 주황 빗금 글이 붙는다', () => {
    draw(inputOf(WITH_GAP), 'split')
    expect(screen.getByText(`${DAY_NOTE}${GAP_ADDED}`)).toBeTruthy()
  })

  it('AC-806.6: 나눠 보기라도 구분 없음이 없으면 붙지 않는다', () => {
    draw(inputOf(NO_GAP), 'split')
    expect(screen.getByText(DAY_NOTE)).toBeTruthy()
  })

  it('AC-806.6: 주·달 칸도 처방 추세와 같은 글이다', () => {
    const week = draw(inputOf(NO_GAP, WHOLE, '90d'))
    expect(screen.getByText('주는 월요일–일요일이에요. 기간 처음과 끝에 걸린 주는 일부 기간(빗금)이에요. 회색 막대는 비교 기간의 같은 차례 주예요.')).toBeTruthy()
    week.unmount()
    draw(inputOf(NO_GAP, WHOLE, '12m'))
    expect(screen.getByText('빗금 칸은 아직 끝나지 않은 달이에요(11월은 13일까지). 회색 막대는 작년 같은 달이에요.')).toBeTruthy()
  })
})

describe('AC-806.7: 막대 위 건수', () => {
  const SOME = [day(addDays(R30.current.from, 2), [['RA', 7]]), day(addDays(R30.current.from, 10), [['RA', 1234]]), day(addDays(R30.current.from, 28), [['RA', 3]])]

  it.each(['total', 'split'] as const)('AC-806.7: 30칸 %s — 건수가 있는 칸마다 글자가 있고(dense 없음) 0인 칸에는 없다', (mode) => {
    const { container } = draw(inputOf(SOME), mode)
    const totals = totalsOf(container)
    expect(totals).toHaveLength(30)
    expect(totals.filter((text) => text !== null)).toEqual(['7', '1,234', '3'])
    expect(totals[2]).toBe('7')
    expect(totals[0]).toBeNull()
  })

  it('AC-806.7: 칸이 13개 이상이면 휴대폰에서 마지막 끝난 칸 글자만 남는다', () => {
    const { container } = draw(inputOf(SOME))
    expect(chartBox(container).className).toContain('max-md:[&_.text-ink-2]:invisible')
  })

  it('AC-806.7: 휴대폰에서 숨는 글자 칸에 범례·그래프 모양 단추가 들지 않는다(둘 다 text-ink-2다)', () => {
    const { container } = draw(inputOf(SOME))
    expect(chartBox(container).querySelector('ul')).toBeNull()
    expect(chartBox(container).querySelector('button')).toBeNull()
  })

  it('AC-806.7: 칸이 13개 미만이면 휴대폰에서도 글자를 다 둔다', () => {
    const { container } = draw(inputOf(NO_GAP, WHOLE, '7d'))
    expect(columnsOf(container)).toHaveLength(7)
    expect(chartBox(container).className).not.toContain('invisible')
  })

  it('AC-806.7: 휴대폰에서 쪽이 옆으로 밀리지 않는다(CHART_NO_SIDE_SCROLL)', () => {
    const { container } = draw(inputOf(SOME))
    expect(chartBox(container).className).toContain(CHART_NO_SIDE_SCROLL)
  })

  it('AC-806.7: 화면 읽기 표는 0인 칸까지 숫자를 준다', () => {
    draw(inputOf(SOME))
    const rows = within(chartTable()).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(30)
    expect(within(rows[0]!).getAllByRole('cell')[0]!.textContent).toBe('0')
    expect(within(rows[10]!).getAllByRole('cell')[0]!.textContent).toBe('1,234')
  })
})

describe('AC-807.1: 자세히 표', () => {
  it('AC-807.1: 처음에는 닫혀 있고 누르면 표가 열리며 caption은 <이름> <칸>별 건수다', () => {
    draw(inputOf(NO_GAP))
    expect(screen.queryByRole('table', { name: detailName() })).toBeNull()
    openDetail()
    expect(screen.getByRole('table', { name: detailName() })).toBeTruthy()
    expect(screen.getByRole('button', { name: '접기' }).getAttribute('aria-expanded')).toBe('true')
  })

  it.each([
    ['7d', '일', '날짜', '지난 7일'],
    ['30d', '일', '날짜', '지난 30일'],
    ['90d', '주', '주', '지난 90일'],
    ['12m', '달', '달', '작년 같은 달'],
  ] as const)('AC-807.1: %s 칸은 %s 단위 · %s · 건수 · 신환 · 재진 · %s 이다', (period, grain, first, compare) => {
    draw(inputOf(NO_GAP, WHOLE, period))
    openDetail()
    expect(headsOf(screen.getByRole('table', { name: detailName(grain) }))).toEqual([first, '건수', '신환', '재진', compare])
  })

  it('AC-807.1: 구분 없음이 있으면 재진과 비교 기간 사이에 그 칸이 있다', () => {
    draw(inputOf(WITH_GAP))
    openDetail()
    expect(headsOf(screen.getByRole('table', { name: detailName() }))).toEqual(['날짜', '건수', '신환', '재진', '구분 없음', '지난 30일'])
    expect(detailRows()[AT]).toEqual(['10월 19일 (월)', '100건', '30', '60', '10', '40건'])
  })

  it('AC-807.1: 줄은 날짜 · n건(600) · 신환 · 재진 · 비교 n건이다', () => {
    draw(inputOf(NO_GAP))
    openDetail()
    expect(detailRows()[AT]).toEqual(['10월 19일 (월)', '100건', '30', '70', '40건'])
    const count = within(screen.getByRole('table', { name: detailName() })).getByText('100건')
    expect(count.className).toContain('font-semibold')
  })
})

describe('AC-807.2: 자세히 줄', () => {
  it('AC-807.2: 덜 끝난 칸은 이름 뒤에 " · 일부"가 붙는다', () => {
    draw(inputOf(PARTIAL_DAY))
    openDetail()
    const rows = detailRows()
    expect(rows[AT]![0]).toBe('10월 19일 (월) · 일부')
    expect(rows[AT + 1]![0]).toBe('10월 20일 (화)')
  })

  it('AC-807.2: 12개월의 덜 끝난 달도 " · 일부"다', () => {
    draw(inputOf(NO_GAP, WHOLE, '12m'))
    openDetail()
    expect(detailRows('달').at(-1)![0]).toBe('2026년 11월 · 일부')
  })

  it('AC-807.2: 비교 값이 없는 칸은 –다', () => {
    const covered = [{ from: R30.current.from, to: '2026-11-12' }]
    draw(inputOf([day(CURRENT_DAY, [['RA', 100, 30]])], covered))
    openDetail()
    expect(detailRows().map((row) => row.at(-1))).toEqual(Array(30).fill('–'))
  })

  it('AC-807.2: [건수만]·[나눠 보기]를 오가도 표의 숫자와 열림이 그대로다', () => {
    render(<Parent input={inputOf(WITH_GAP)} />)
    openDetail()
    const before = detailRows()
    fireEvent.click(modeButton('신환·재진 나눠 보기'))
    expect(screen.getByRole('button', { name: '접기' })).toBeTruthy()
    expect(detailRows()).toEqual(before)
    fireEvent.click(modeButton('건수만'))
    expect(screen.getByRole('button', { name: '접기' })).toBeTruthy()
    expect(detailRows()).toEqual(before)
  })
})

describe('AC-809.2: 좁은 화면의 단추', () => {
  it('AC-809.2: 그래프 모양 단추는 768px 미만에서 반씩 전체 폭이고 44px다', () => {
    draw(inputOf(NO_GAP))
    const group = screen.getByRole('group', { name: '그래프 모양' })
    expect(group.className.split(/\s+/)).toEqual(expect.arrayContaining(['max-md:grid', 'max-md:w-full', 'max-md:grid-cols-2']))
    for (const button of within(group).getAllByRole('button')) expect(button.className.split(/\s+/)).toContain('max-md:h-11')
  })

  it('AC-809.2: [자세히]는 768px 미만에서 44px 이상이다', () => {
    draw(inputOf(NO_GAP))
    expect(screen.getByRole('button', { name: '자세히' }).className.split(/\s+/)).toContain('max-md:min-h-11')
  })
})
