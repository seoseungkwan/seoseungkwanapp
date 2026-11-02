// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { COMPARE_NAME, rxDetail, statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { addDays } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { RxTrendSection } from './RxTrendSection'

// 처방 추세 (stats REQ-513 AC-513.2·513.3·513.4·513.5·513.11, 시안 notes.md §3). 처방·일 줄은 이 파일 안에서만 지은 가짜다

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]
const A = '가짜 처방 가'
const B = '가짜 처방 나'

type Line = [code: string, patients: number, newPatients?: number]
function day(ymd: string, lines: Line[], partial = false): DayPayload {
  const rx = lines.map(([code, patients, newPatients = 0]) => ({
    code,
    name: code === 'RA' ? A : B,
    type: '',
    patients,
    newPatients,
    returning: patients - newPatients,
  }))
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
const inputOf = (days: DayPayload[], covered: DateRange[], period: StatsPeriod = '30d', today = TODAY): StatsInput => ({
  days,
  covered,
  range: statsRange(today, period),
})
const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(name) })
const barOf = (row: HTMLElement) => row.querySelector('.bg-accent') as HTMLElement
const tickOf = (row: HTMLElement) => row.querySelector('.bg-faint') as HTMLElement | null
const open = (name: string) => {
  const row = rowOf(name)
  fireEvent.click(row)
  return document.getElementById(row.getAttribute('aria-controls')!)!
}
const columnsOf = (panel: HTMLElement) => Array.from(panel.querySelector('.absolute.inset-0.flex')!.children)
const openTable = (panel: HTMLElement) => {
  fireEvent.click(within(panel).getByRole('button', { name: '자세히' }))
  const button = within(panel).getByRole('button', { name: '접기' })
  return document.getElementById(button.getAttribute('aria-controls')!)!
}
const tableRows = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent))

afterEach(cleanup)

// 지난 기간 줄(9월) + 이번 기간 줄(11월). 두 기간이 온전히 덮였다
const BOTH = [day('2026-09-21', [['RA', 50], ['RB', 40]]), day('2026-11-02', [['RA', 100, 30], ['RB', 25, 5]])]

describe('AC-513.1·AC-513.5: 처방 추세 짜임', () => {
  it('AC-513.1: h2 + 옆 설명 + 머리 줄(처방·기간 이름·비교 이름·신환 재진)이다', () => {
    const { container } = render(<RxTrendSection input={inputOf(BOTH, WHOLE)} saved />)
    expect(screen.getByRole('heading', { level: 2, name: '처방 추세' })).toBeTruthy()
    expect(screen.getByText('많이 낸 처방 5가지 · 건수')).toBeTruthy()
    const head = container.querySelector('[aria-hidden="true"].grid')!
    expect(Array.from(head.children).map((el) => el.textContent)).toEqual(['처방', '최근 30일', '지난 30일보다', '신환 · 재진', ''])
    expect(head.className).toContain('max-md:hidden')
  })

  it('AC-513.1: 처방 줄 목록에는 점이 없다(시안, list-none)', () => {
    render(<RxTrendSection input={inputOf(BOTH, WHOLE)} saved />)
    const list = rowOf(A).closest('li')!.parentElement!
    expect(list.tagName).toBe('UL')
    expect(list.className).toContain('list-none')
  })

  it('AC-513.5: 금액·소모량 자리에 시안 글이 있다', () => {
    render(<RxTrendSection input={inputOf(BOTH, WHOLE)} saved />)
    expect(screen.getByText('금액·소모량은 매출 탭에서 볼 수 있어요')).toBeTruthy()
    expect(screen.getByText('줄을 누르면 그 처방의 일별 건수와 신환·재진이 열려요. 막대 안 회색 눈금은 비교 기간 건수예요. 건 = 날마다 그 처방을 받은 환자 수를 더한 값이에요.')).toBeTruthy()
  })

  it('AC-513.5: 칸 단위 글은 기간을 따른다(90일 주별, 12개월 달별)', () => {
    const { rerender } = render(<RxTrendSection input={inputOf(BOTH, WHOLE, '90d')} saved />)
    expect(screen.getByText(/그 처방의 주별 건수/)).toBeTruthy()
    rerender(<RxTrendSection input={inputOf(BOTH, WHOLE, '12m')} saved />)
    expect(screen.getByText(/그 처방의 달별 건수/)).toBeTruthy()
  })
})

describe('AC-513.11·AC-513.2: 처방 줄의 막대와 글자', () => {
  it('AC-513.11: 막대 = comparable.current, 눈금 = comparable.previous, max는 그리는 값 가운데 가장 큰 값이다', () => {
    render(<RxTrendSection input={inputOf(BOTH, WHOLE)} saved />)
    const a = rowOf(A)
    expect(barOf(a).style.width).toBe('100%') // 100 / 100
    expect(tickOf(a)!.style.left).toBe('50%') // 50 / 100
    const b = rowOf(B)
    expect(barOf(b).style.width).toBe('25%')
    expect(tickOf(b)!.style.left).toBe('40%')
  })

  it('AC-513.11: max에는 비교 눈금 값도 든다 — 지금 50건·지난 200건이면 막대 25%, 눈금 100%다', () => {
    render(<RxTrendSection input={inputOf([day('2026-09-21', [['RA', 200]]), day('2026-11-02', [['RA', 50]])], WHOLE)} saved />)
    const a = rowOf(A)
    expect(barOf(a).style.width).toBe('25%')
    expect(tickOf(a)!.style.left).toBe('100%')
  })

  it('AC-513.11: 12개월 — 건수 글자는 count + "일부 기간"이고 막대·눈금·증감은 끝난 달끼리다', () => {
    // 눈금 기준을 RB 200건이 정한다. RA의 막대가 count(130)로 그려지면 65%가 된다
    const days = [
      day('2025-10-10', [['RA', 50], ['RB', 200]]),
      day('2026-10-10', [['RA', 100, 10], ['RB', 200]]),
      day('2025-11-10', [['RA', 999]]), // 작년 11월: 짝인 11월이 덜 끝나 뺀다
      day('2026-11-02', [['RA', 30, 3]]), // 덜 끝난 이번 달: 건수에는 든다
    ]
    render(<RxTrendSection input={inputOf(days, WHOLE, '12m')} saved />)
    const a = rowOf(A)
    expect(a.textContent).toContain('130건')
    expect(within(a).getByText('일부 기간').className).toContain('text-warning')
    expect(barOf(a).style.width).toBe('50%')
    expect(tickOf(a)!.style.left).toBe('25%')
    expect(barOf(rowOf(B)).style.width).toBe('100%')
    expect(tickOf(rowOf(B))!.style.left).toBe('100%')
    expect(a.textContent).toContain('▲')
    expect(a.textContent).toContain('50건 (+100.0%)')
    expect(a.textContent).toContain('늘어남')
    expect(a.textContent).toContain('신환 13 · 재진 117')
  })

  it('AC-513.11: 일 기간에는 "일부 기간" 표시가 없다', () => {
    render(<RxTrendSection input={inputOf(BOTH, WHOLE)} saved />)
    expect(within(rowOf(A)).queryByText('일부 기간')).toBeNull()
  })

  it('AC-513.11: comparable이 null이면(일 기간) 막대는 count, 눈금 없음, 증감 "비교할 수 없음"이다', () => {
    render(<RxTrendSection input={inputOf([day('2026-11-02', [['RA', 100], ['RB', 25]])], [{ from: '2026-10-14', to: '2026-11-12' }])} saved />)
    const a = rowOf(A)
    expect(barOf(a).style.width).toBe('100%')
    expect(tickOf(a)).toBeNull()
    expect(a.textContent).toContain('비교할 수 없음')
    expect(a.textContent).not.toMatch(/[▲▼]/)
    expect(a.textContent).not.toContain('비교할 자료 없음')
    expect(barOf(rowOf(B)).style.width).toBe('25%')
  })

  it('AC-513.11: comparable이 null이면(12개월) 막대는 count, 눈금 없음, 증감 "비교할 수 없음"이고 건수 옆 "일부 기간"이다', () => {
    render(<RxTrendSection input={inputOf([day('2026-11-02', [['RA', 30]])], [{ from: '2026-11-01', to: '2026-11-12' }], '12m')} saved />)
    const a = rowOf(A)
    expect(barOf(a).style.width).toBe('100%')
    expect(tickOf(a)).toBeNull()
    expect(a.textContent).toContain('비교할 수 없음')
    expect(a.textContent).toContain('30건')
    expect(within(a).getByText('일부 기간')).toBeTruthy()
  })

  it('AC-513.2: 줄어듦은 ▼ + 글자 + "줄어듦"이고 변화 없음은 화살표가 없다', () => {
    render(<RxTrendSection input={inputOf([day('2026-09-21', [['RA', 200], ['RB', 25]]), day('2026-11-02', [['RA', 100], ['RB', 25]])], WHOLE)} saved />)
    const a = rowOf(A)
    expect(a.textContent).toContain('▼')
    expect(a.textContent).toContain('100건 (−50.0%)')
    expect(a.textContent).toContain('줄어듦')
    expect(a.querySelector('.text-negative')).not.toBeNull()
    expect(rowOf(B).textContent).toContain('변화 없음')
    expect(rowOf(B).textContent).not.toMatch(/[▲▼]/)
  })
})

describe('AC-513.3: 처방 줄 열기', () => {
  it('AC-513.3: 줄은 단추(aria-expanded·aria-controls)이고 누르면 바로 아래 칸이 열리고 다시 누르면 닫힌다', () => {
    render(<RxTrendSection input={inputOf(BOTH, WHOLE)} saved />)
    const row = rowOf(A)
    expect(row.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(row.getAttribute('aria-controls')!)!
    expect(panel.hidden).toBe(true)
    expect(row.nextElementSibling).toBe(panel)
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hidden).toBe(false)
    expect(panel.className).toContain('bg-canvas')
    expect(within(panel).getByText(`${A} · 일별 건수`)).toBeTruthy()
    expect(within(panel).getByRole('table', { name: `${A} 일별 건수 (건)` })).toBeTruthy()
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)
  })

  it('AC-513.3: 열린 칸은 범례(신환·재진·비교 기간)와 안내 글을 보인다', () => {
    render(<RxTrendSection input={inputOf(BOTH, WHOLE)} saved />)
    const panel = open(A)
    for (const name of ['신환', '재진', '비교 기간']) expect(within(panel).getAllByText(name).length).toBeGreaterThan(0)
    expect(within(panel).getByText('하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.')).toBeTruthy()
  })

  it('AC-513.3: 표 칸은 날짜·건수·신환·재진·비교 이름(COMPARE_NAME)이다', () => {
    render(<RxTrendSection input={inputOf(BOTH, WHOLE)} saved />)
    const panel = openTable(open(A))
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['날짜', '건수', '신환', '재진', COMPARE_NAME['30d']])
    const rows = tableRows(panel)
    expect(rows).toHaveLength(30)
    // 11월 2일은 기간의 스무째 날, 비교 기간의 같은 차례 날은 10월 3일(줄 없는 덮인 날 = 0건)
    expect(rows[19]).toEqual(['11월 2일 (월)', '100건', '30', '70', '0건'])
    // 9월 21일에 RA 50건: 이번 기간의 여드레째(10월 21일)와 짝이다
    expect(rows[7]).toEqual(['10월 21일 (수)', '0건', '0', '0', '50건'])
  })

  it('AC-513.3: 처방 칸의 표는 그래프와 안내 글 아래, 칸 맨 끝에 열린다', () => {
    render(<RxTrendSection input={inputOf(BOTH, WHOLE)} saved />)
    const panel = open(A)
    const table = openTable(panel)
    expect(panel.lastElementChild).toBe(table)
    const note = within(panel).getByText('하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.')
    expect(note.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-513.3: 기간을 바꿔도 열어 둔 처방 줄은 열린 채 새 숫자로 다시 그린다', () => {
    const { rerender } = render(<RxTrendSection input={inputOf(BOTH, WHOLE, '30d')} saved />)
    open(A)
    rerender(<RxTrendSection input={inputOf(BOTH, WHOLE, '12m')} saved />)
    const row = rowOf(A)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    const panel = document.getElementById(row.getAttribute('aria-controls')!)!
    expect(within(panel).getByText(`${A} · 달별 건수`)).toBeTruthy()
  })

  it('AC-513.11: 12개월은 칸이 달이고 표 첫 칸 머리가 "달", 비교 이름이 "작년 같은 12달"이다', () => {
    render(<RxTrendSection input={inputOf(BOTH, WHOLE, '12m')} saved />)
    const panel = openTable(open(A))
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['달', '건수', '신환', '재진', '작년 같은 12달'])
    expect(tableRows(panel)[0]![0]).toBe('2025년 12월')
    expect(tableRows(panel)[11]![0]).toBe('2026년 11월일부 기간')
  })
})

describe('AC-513.11: 비교 칸', () => {
  it('AC-513.11: covered: false인 비교 칸은 표에 "–"이고 "0건"이 없으며 막대가 없다', () => {
    render(<RxTrendSection input={inputOf([day('2026-11-02', [['RA', 100]])], [{ from: '2026-10-14', to: '2026-11-12' }])} saved />)
    const panel = open(A)
    for (const column of columnsOf(panel)) expect(column.querySelector('.bg-faint')).toBeNull()
    const table = openTable(panel)
    const compare = tableRows(table).map((row) => row[4])
    expect(compare).toHaveLength(30)
    expect(new Set(compare)).toEqual(new Set(['–']))
    expect(compare).not.toContain('0건')
  })

  it('AC-513.11: 처방 줄을 열면 같은 차례 previous.count가 비교 막대이고 covered: false 칸은 막대가 없다', () => {
    // 비교 기간 9월 14일 ~ 10월 13일 가운데 10월 1일부터만 덮임 → 앞 17칸은 covered: false
    const covered = [{ from: '2026-10-01', to: '2026-11-12' }]
    const days = [day('2026-10-02', [['RA', 40]]), day('2026-11-02', [['RA', 100]])]
    const input = inputOf(days, covered)
    render(<RxTrendSection input={input} saved />)
    const { current, previous } = rxDetail(input, 'RA')
    expect(current).toHaveLength(previous.length)
    const panel = open(A)
    const columns = columnsOf(panel)
    expect(columns).toHaveLength(current.length)
    previous.forEach((point, i) => {
      const bar = columns[i]!.querySelector('.bg-faint') as HTMLElement | null
      if (point.covered) expect(bar, point.start).not.toBeNull()
      else expect(bar, point.start).toBeNull()
    })
    expect(previous.some((point) => point.covered && point.count === 40)).toBe(true)
    const table = openTable(panel)
    const rows = tableRows(table)
    previous.forEach((point, i) => {
      expect(rows[i]![4]).toBe(point.covered ? `${point.count}건` : '–')
    })
  })

  it('AC-513.2: 비교 막대 값이 있으면 그림 옆 화면 읽기 표에 "비교 기간" 칸이 붙는다', () => {
    render(<RxTrendSection input={inputOf(BOTH, WHOLE)} saved />)
    const panel = open(A)
    const table = within(panel).getByRole('table', { name: `${A} 일별 건수 (건)` })
    expect(within(table).getAllByRole('columnheader').at(-1)!.textContent).toBe('비교 기간')
  })

  describe('TASK-8 규칙: 90일 주 칸 수가 두 기간에서 다름', () => {
    // 90일 = 12주 6일이라 첫날이 월·화면 13칸, 수~일이면 14칸이다. 비교 기간 첫날은 하루 뒤 요일이다
    const rowsFor = (today: string) => {
      const range = statsRange(today, '90d')
      return [day(addDays(range.current.from, 3), [['RA', 10]]), day(addDays(range.previous.from, 3), [['RA', 5]])]
    }
    const whole = (today: string): DateRange[] => [{ from: '2024-12-01', to: addDays(today, -1) }]

    it('AC-513.11: 13칸 대 14칸 — 13칸만 그리고 남는 비교 칸은 그리지 않는다', () => {
      const today = '2026-11-16'
      const input = inputOf(rowsFor(today), whole(today), '90d', today)
      const { current, previous } = rxDetail(input, 'RA')
      expect([current.length, previous.length]).toEqual([13, 14])
      render(<RxTrendSection input={input} saved />)
      const panel = open(A)
      const columns = columnsOf(panel)
      expect(columns).toHaveLength(13)
      expect(columns.filter((column) => column.querySelector('.bg-faint')).length).toBe(13)
      const table = openTable(panel)
      const rows = tableRows(table)
      expect(rows).toHaveLength(13)
      expect(rows.map((row) => row[4])).not.toContain('–')
      expect(within(table).getAllByRole('columnheader')[0]!.textContent).toBe('주')
    })

    it('AC-513.11: 14칸 대 13칸 — 비교 점이 없는 칸은 comparison: null(막대 없음, 표 "–")이다', () => {
      const today = '2026-11-14'
      const input = inputOf(rowsFor(today), whole(today), '90d', today)
      const { current, previous } = rxDetail(input, 'RA')
      expect([current.length, previous.length]).toEqual([14, 13])
      render(<RxTrendSection input={input} saved />)
      const panel = open(A)
      const columns = columnsOf(panel)
      expect(columns).toHaveLength(14)
      expect(columns[13]!.querySelector('.bg-faint')).toBeNull()
      expect(columns[12]!.querySelector('.bg-faint')).not.toBeNull()
      const rows = tableRows(openTable(panel))
      expect(rows).toHaveLength(14)
      expect(rows[13]![4]).toBe('–')
      expect(rows[12]![4]).not.toBe('–')
    })

    it('AC-513.3: 주 칸 글은 월~일 안내이고 표 첫 칸은 "시작 – 끝"이다', () => {
      const today = '2026-11-16'
      render(<RxTrendSection input={inputOf(rowsFor(today), whole(today), '90d', today)} saved />)
      const panel = open(A)
      expect(within(panel).getByText('주는 월요일–일요일이에요. 기간 처음과 끝에 걸린 주는 일부 기간(빗금)이에요. 회색 막대는 비교 기간의 같은 차례 주예요.')).toBeTruthy()
      expect(tableRows(openTable(panel))[1]![0]).toBe('8월 24일 – 8월 30일')
    })
  })
})

describe('AC-513.1: 12개월 처방 칸의 끝나지 않은 달 글', () => {
  it('AC-513.1: 덜 끝난 칸이 오늘이 든 달뿐이면 시안 글이다', () => {
    render(<RxTrendSection input={inputOf([day('2026-10-10', [['RA', 10]])], WHOLE, '12m')} saved />)
    const panel = open(A)
    expect(within(panel).getByText('빗금 칸은 아직 끝나지 않은 달이에요(11월은 13일까지). 회색 막대는 작년 같은 달이에요.')).toBeTruthy()
  })

  it('AC-513.1: 8월이 덜 덮인 11월의 12개월 보기 — 끝나지 않았다는 글 없이 회색 막대 안내만이다', () => {
    const covered = [
      { from: '2024-12-01', to: '2026-08-05' },
      { from: '2026-08-20', to: '2026-11-12' },
    ]
    render(<RxTrendSection input={inputOf([day('2026-10-10', [['RA', 10]])], covered, '12m')} saved />)
    const panel = open(A)
    expect(panel.textContent).not.toContain('아직 끝나지 않은')
    expect(within(panel).getByText('회색 막대는 작년 같은 달이에요.')).toBeTruthy()
    expect(within(panel).getAllByText('일부 기간').length).toBeGreaterThan(0)
  })
})

describe('AC-513.4: 처방 추세 빈 상태', () => {
  it('AC-513.4: 저장된 숫자가 없으면 줄·금액 안내 없이 시안 문구다', () => {
    render(<RxTrendSection input={inputOf([], [])} saved={false} />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러오면 많이 낸 처방 5가지와 그 흐름이 보여요.')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('금액·소모량은 매출 탭에서 볼 수 있어요')).toBeNull()
  })

  it('AC-513.4: 저장된 숫자는 있는데 이 기간에 처방이 없으면 그 문구다', () => {
    render(<RxTrendSection input={inputOf([day('2026-11-02', [])], WHOLE)} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
  })
})
