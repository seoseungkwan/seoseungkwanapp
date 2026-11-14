// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { StatsPick } from '@/components/stats/periodPick'
import { rangeOf, statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { RevisitSection } from './RevisitSection'

// 신환 재방문율 + 첫 재방문까지 날수 (stats REQ-513 AC-513.1·513.3·513.4·513.10, 시안 notes.md §3). 가짜 일 줄은 이 파일 안에서만 만든다

const TODAY = '2026-11-13'

type Numbers = [cohort: number, within7: number | null, within14: number | null, within30?: number | null, after30?: number | null]
function day(ymd: string, [cohort, within7, within14, within30 = null, after30 = null]: Numbers): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: cohort, newPatients: cohort, returning: 0, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort, within7, within14, within30, after30 },
  }
}
const inputOf = (days: DayPayload[], period: StatsPeriod, covered: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]): StatsInput => ({
  days,
  covered,
  range: statsRange(TODAY, period),
})
// 줄(이름으로 찾은 li)
const row = (name: string) => screen.getByText(name).closest('li')!
// h3 "첫 재방문까지 날수" 바로 아래 글
const firstNote = () => screen.getByRole('heading', { level: 3, name: '첫 재방문까지 날수' }).nextElementSibling!.textContent

afterEach(cleanup)

// 최근 30일: 고른 기간 10월 14일 ~ 11월 12일, 30일 줄은 9월 14일 ~ 10월 13일에서 30일 값이 숫자인 날(9월 15일 ~ 10월 12일)
const DAYS_30 = [
  day('2026-09-15', [20, 5, 8, 10, 2]),
  day('2026-10-12', [30, 6, 9, 15, 3]),
  day('2026-10-13', [5, 1, 2, null, null]),
  day('2026-11-02', [10, 3, 4]),
  day('2026-11-10', [10, null, null]),
]

describe('AC-513.10: 최근 30일', () => {
  it('AC-513.10: 30일 줄은 "집계 중" 대신 비율과 날짜 caption이다({N} = cohort, {K} = within)', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    const line = row('30일 안에 다시 옴')
    expect(line.textContent).toContain('50.0%')
    expect(line.textContent).not.toContain('집계 중')
    expect(within(line).getByText('9월 15일 – 10월 12일에 온 신환 50명 가운데 25명 · 온 뒤 30일이 지난 가장 최근 신환이에요')).toBeTruthy()
  })

  it('AC-513.10: 30일 줄에는 뺀 칸이 있어도 "…빼고 셌어요"를 붙이지 않는다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    expect(row('30일 안에 다시 옴').textContent).not.toContain('빼고 셌어요')
  })

  it('AC-513.10: 첫 재방문까지 날수의 기준 줄은 같은 날짜를 쓴다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    expect(screen.getByText('9월 15일 – 10월 12일에 온 신환 50명 기준 (온 뒤 30일이 지난 날만)')).toBeTruthy()
  })

  it('AC-513.10: 7·14일 줄은 고른 기간 그대로이고 뺀 날이 있으면 "…빼고 셌어요"다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    expect(within(row('7일 안에 다시 옴')).getByText('신환 10명 가운데 3명 · 온 뒤 7일이 안 된 날의 신환은 빼고 셌어요')).toBeTruthy()
    expect(row('7일 안에 다시 옴').textContent).toContain('30.0%')
    expect(within(row('14일 안에 다시 옴')).getByText('신환 10명 가운데 4명 · 온 뒤 14일이 안 된 날의 신환은 빼고 셌어요')).toBeTruthy()
  })

  it('AC-513.10: 7·14일 줄은 뺀 날이 없으면 caption이 "신환 N명 가운데 K명"뿐이다', () => {
    render(<RevisitSection input={inputOf([day('2026-11-02', [10, 3, 4]), day('2026-11-05', [10, 2, 5])], '30d')} saved />)
    expect(within(row('7일 안에 다시 옴')).getByText('신환 20명 가운데 5명')).toBeTruthy()
    expect(within(row('14일 안에 다시 옴')).getByText('신환 20명 가운데 9명')).toBeTruthy()
    expect(row('7일 안에 다시 옴').textContent).not.toContain('빼고 셌어요')
    expect(row('14일 안에 다시 옴').textContent).not.toContain('빼고 셌어요')
  })

  it('AC-513.10: 최근 90일·12개월도 뺀 칸이 없으면 "…빼고 셌어요"가 없다', () => {
    const { unmount } = render(<RevisitSection input={inputOf([day('2026-09-15', [20, 5, 8, 10, 2])], '90d')} saved />)
    expect(within(row('30일 안에 다시 옴')).getByText('신환 20명 가운데 10명')).toBeTruthy()
    unmount()
    render(<RevisitSection input={inputOf([day('2026-01-10', [20, 5, 8, 10, 2])], '12m')} saved />)
    expect(within(row('7일 안에 다시 옴')).getByText('신환 20명 가운데 5명')).toBeTruthy()
  })

  it('AC-513.10: 30일 줄이 비율이 아니면 목업의 "집계 중"이다', () => {
    render(<RevisitSection input={inputOf([day('2026-09-20', [5, 1, 1]), day('2026-11-02', [10, 3, 4])], '30d')} saved />)
    const line = row('30일 안에 다시 옴')
    expect(line.textContent).toContain('집계 중')
    expect(within(line).getByText('신환이 온 뒤 30일이 지나야 셀 수 있어요. 최근 90일이나 최근 12개월에서 볼 수 있어요.')).toBeTruthy()
    expect(firstNote()).toBe('집계 중 · 신환이 온 뒤 30일이 지나야 날수를 셀 수 있어요. 최근 90일이나 최근 12개월에서 볼 수 있어요.')
  })

  it('AC-513.10: 그 날짜의 자료가 아예 없으면 30일 줄 "–" + "자료 없음"이고 첫 재방문도 "자료 없음"이다', () => {
    render(<RevisitSection input={inputOf([day('2026-11-02', [10, 3, 4])], '30d')} saved />)
    const line = row('30일 안에 다시 옴')
    expect(line.textContent).toBe('30일 안에 다시 옴–자료 없음')
    expect(firstNote()).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
  })

  it('AC-513.10: 최근 7일은 셋 다 집계 중이고 안내 글은 승인 시안 그대로다', () => {
    render(<RevisitSection input={inputOf([day('2026-11-10', [10, null, null])], '7d')} saved />)
    expect(within(row('7일 안에 다시 옴')).getByText('신환이 온 뒤 7일이 지나야 셀 수 있어요.')).toBeTruthy()
    expect(within(row('14일 안에 다시 옴')).getByText('신환이 온 뒤 14일이 지나야 셀 수 있어요.')).toBeTruthy()
    expect(within(row('30일 안에 다시 옴')).getByText('신환이 온 뒤 30일이 지나야 셀 수 있어요. 최근 90일이나 최근 12개월에서 볼 수 있어요.')).toBeTruthy()
    expect(screen.queryByRole('list', { name: '첫 재방문까지 날수' })).toBeNull()
    expect(firstNote()).toBe('집계 중 · 신환이 온 뒤 30일이 지나야 날수를 셀 수 있어요. 최근 90일이나 최근 12개월에서 볼 수 있어요.')
  })

  it('AC-513.10: 최근 90일은 고른 기간으로 세고 날짜 caption을 쓰지 않는다', () => {
    render(<RevisitSection input={inputOf([day('2026-09-15', [20, 5, 8, 10, 2]), day('2026-11-10', [10, 3, 4])], '90d')} saved />)
    expect(within(row('30일 안에 다시 옴')).getByText('신환 20명 가운데 10명 · 온 뒤 30일이 안 된 날의 신환은 빼고 셌어요')).toBeTruthy()
    expect(screen.getByText('9월 15일 – 9월 15일에 온 신환 20명 기준 (온 뒤 30일이 지난 날만)')).toBeTruthy()
  })

  it('AC-513.10: 최근 90일에 30일 값이 없으면 집계 중 안내에 다른 기간을 권하지 않는다', () => {
    render(<RevisitSection input={inputOf([day('2026-11-10', [10, 3, 4])], '90d')} saved />)
    expect(within(row('30일 안에 다시 옴')).getByText('신환이 온 뒤 30일이 지나야 셀 수 있어요.')).toBeTruthy()
    expect(firstNote()).toBe('집계 중 · 신환이 온 뒤 30일이 지나야 날수를 셀 수 있어요.')
  })

  it('AC-513.10: 12개월은 달 단위 글이다', () => {
    render(
      <RevisitSection
        input={inputOf([day('2026-01-10', [20, 5, 8, 10, 2]), day('2026-09-10', [30, 6, 9, 15, 3]), day('2026-11-02', [10, null, null])], '12m')}
        saved
      />,
    )
    expect(within(row('7일 안에 다시 옴')).getByText('신환 50명 가운데 11명 · 온 뒤 7일이 안 된 달의 신환은 빼고 셌어요')).toBeTruthy()
    expect(screen.getByText('2026년 1월 – 2026년 9월에 온 신환 50명 기준 (온 뒤 30일이 지난 달만)')).toBeTruthy()
  })
})

describe('AC-513.1: 신환 재방문율 짜임', () => {
  it('AC-513.1: h2 + 옆 설명 + 줄 셋 + h3 "첫 재방문까지 날수"다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    expect(screen.getByRole('heading', { level: 2, name: '신환 재방문율' })).toBeTruthy()
    expect(screen.getByText('처음 온 환자가 다시 온 비율')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: '첫 재방문까지 날수' })).toBeTruthy()
  })

  it('AC-513.1: 줄 셋의 목록에는 점이 없다(시안, list-none)', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    const list = row('7일 안에 다시 옴').parentElement!
    expect(list.tagName).toBe('UL')
    expect(list.className).toContain('list-none')
  })

  it('AC-513.1: 비율 줄의 막대는 InlineBar이고 폭이 비율이며 눈금이 없다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    const line = row('30일 안에 다시 옴')
    expect((line.querySelector('.bg-accent') as HTMLElement).style.width).toBe('50%')
    expect(line.querySelector('.bg-faint')).toBeNull()
    expect(row('30일 안에 다시 옴').querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-513.1: 집계 중 줄에는 막대가 없다', () => {
    render(<RevisitSection input={inputOf([day('2026-11-10', [10, null, null])], '7d')} saved />)
    expect(row('7일 안에 다시 옴').querySelector('.bg-accent')).toBeNull()
  })

  describe('첫 재방문까지 날수 목록', () => {
    const list = () => screen.getByRole('list', { name: '첫 재방문까지 날수' })
    const items = () => within(list()).getAllByRole('listitem')
    const widths = () => items().map((item) => (item.querySelector('.bg-accent') as HTMLElement).style.width)
    const LAST_BAR = '[&_.bg-accent]:bg-line-strong'

    it('AC-513.1: 값 크기와 상관없이 정해진 차례 그대로이고 줄은 이름 · 막대 · 값 + 몫이며 이름을 자르지 않는다', () => {
      render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
      expect(list().tagName).toBe('OL')
      expect(items().map((item) => item.textContent)).toEqual(['7일 안11명22.0%', '8~14일6명12.0%', '15~30일8명16.0%', '30일 넘어 다시 옴5명10.0%', '아직 다시 안 옴20명40.0%'])
      expect(list().querySelector('.truncate')).toBeNull()
      for (const item of items()) expect(item.className).toContain('grid-cols-[112px_minmax(0,1fr)_auto]')
    })

    it('AC-513.1: 값은 small 600, 몫은 small muted다', () => {
      render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
      expect(within(items()[0]!).getByText('11명').className).toContain('font-semibold')
      expect(within(items()[0]!).getByText('22.0%').className).toContain('text-muted')
    })

    it('AC-513.2: 막대는 InlineBar이고 폭은 다섯 가운데 가장 큰 값 대비이며 눈금이 없다', () => {
      render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
      expect(widths()).toEqual(['55%', '30%', '40%', '25%', '100%'])
      expect(list().querySelector('.bg-faint')).toBeNull()
    })

    it('AC-513.2: 가장 큰 값이 "아직 다시 안 옴"이 아니어도 다섯 가운데 가장 큰 값이 기준이다', () => {
      // 7일 안 35 · 8~14일 0 · 15~30일 30 · 30일 넘어 20 · 아직 15
      render(<RevisitSection input={inputOf([day('2026-10-01', [100, 35, 35, 65, 20]), day('2026-11-02', [10, 3, 4])], '30d')} saved />)
      expect(widths()).toEqual(['100%', '0%', '85.71%', '57.14%', '42.86%'])
    })

    it('AC-513.1: "아직 다시 안 옴" 줄의 막대만 line-strong이다', () => {
      render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
      expect(items().map((item) => item.className.includes(LAST_BAR))).toEqual([false, false, false, false, true])
    })
  })

  it('AC-513.1: 안내 글은 불러온 자료 끝날(덮은 기간 끝)을 쓴다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    expect(screen.getByText("'30일 넘어 다시 옴'은 불러온 자료 끝날(11월 12일)까지 본 수라, 다시 불러오면 늘 수 있어요.")).toBeTruthy()
  })

  it('AC-513.1: 덮은 기간을 못 읽었으면 가장 늦은 줄의 날을 쓴다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d', [])} saved />)
    expect(screen.getByText("'30일 넘어 다시 옴'은 불러온 자료 끝날(11월 10일)까지 본 수라, 다시 불러오면 늘 수 있어요.")).toBeTruthy()
  })
})

describe('AC-513.3: 신환 재방문율 [자세히]', () => {
  it('AC-513.3: 표는 구분·다시 온 신환·센 신환·비율이고 첫 재방문 다섯 줄을 포함한다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const table = screen.getByRole('table', { name: '신환 재방문율' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['구분', '다시 온 신환', '센 신환', '비율'])
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent))
    expect(rows).toEqual([
      ['7일 안에 다시 옴', '3명', '10명', '30.0%'],
      ['14일 안에 다시 옴', '4명', '10명', '40.0%'],
      ['30일 안에 다시 옴', '25명', '50명', '50.0%'],
      ['첫 재방문 7일 안', '11명', '50명', '22.0%'],
      ['첫 재방문 8~14일', '6명', '50명', '12.0%'],
      ['첫 재방문 15~30일', '8명', '50명', '16.0%'],
      ['첫 재방문 30일 넘어 다시 옴', '5명', '50명', '10.0%'],
      ['첫 재방문 아직 다시 안 옴', '20명', '50명', '40.0%'],
    ])
  })

  it('AC-513.3·AC-4004.2: 표는 줄과 첫 재방문까지 날수 아래, 안내 글을 접은 "어떻게 세나요?" 칸 바로 뒤에 열린다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const button = screen.getByRole('button', { name: '접기' })
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!
    const fold = panel.previousElementSibling!
    expect(fold.contains(screen.getByRole('button', { name: '어떻게 세나요?' }))).toBe(true)
    expect(fold.textContent).toContain("'30일 넘어 다시 옴'은")
    expect(panel.parentElement!.lastElementChild).toBe(panel)
  })

  it('AC-513.3: 집계 중·자료 없음 줄은 "–"이고 비율 칸이 그 글자다', () => {
    render(<RevisitSection input={inputOf([day('2026-11-02', [10, 3, null])], '30d')} saved />)
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const rows = within(screen.getByRole('table', { name: '신환 재방문율' }))
      .getAllByRole('row')
      .slice(1)
      .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent))
    expect(rows).toEqual([
      ['7일 안에 다시 옴', '3명', '10명', '30.0%'],
      ['14일 안에 다시 옴', '–', '–', '집계 중'],
      ['30일 안에 다시 옴', '–', '–', '자료 없음'],
    ])
  })
})

// stats-load-range REQ-3306: 센 날에 after30이 null인 줄이 들면 '30일 넘어 다시 옴'과 '아직 다시 안 옴'을 합친 넷이다
describe('AC-3306.2: 합친 넷의 첫 재방문까지 날수', () => {
  // DAYS_30에서 10월 12일만 after30이 null: 7일 안 11 · 8~14일 6 · 15~30일 8 · 합친 줄 50 − 25 = 25
  const MERGED_30 = [day('2026-09-15', [20, 5, 8, 10, 2]), day('2026-10-12', [30, 6, 9, 15, null]), day('2026-10-13', [5, 1, 2, null, null]), day('2026-11-02', [10, 3, 4])]
  const MERGED = '30일 넘어 다시 왔거나 아직 안 옴'
  const list = () => screen.getByRole('list', { name: '첫 재방문까지 날수' })
  const items = () => within(list()).getAllByRole('listitem')
  const widths = () => items().map((item) => (item.querySelector('.bg-accent') as HTMLElement).style.width)

  it('AC-3306.2: 목록은 네 줄이고 차례는 7일 안 · 8~14일 · 15~30일 · 30일 넘어 다시 왔거나 아직 안 옴이다', () => {
    render(<RevisitSection input={inputOf(MERGED_30, '30d')} saved />)
    expect(items().map((item) => item.textContent)).toEqual(['7일 안11명22.0%', '8~14일6명12.0%', '15~30일8명16.0%', `${MERGED}25명50.0%`])
  })

  it('AC-3306.2: 줄 모양은 그대로이고 이름을 자르지 않는다', () => {
    render(<RevisitSection input={inputOf(MERGED_30, '30d')} saved />)
    expect(list().querySelector('.truncate')).toBeNull()
    for (const item of items()) expect(item.className).toContain('grid-cols-[112px_minmax(0,1fr)_auto]')
  })

  it('AC-3306.2: 합친 줄의 막대만 line-strong이다', () => {
    render(<RevisitSection input={inputOf(MERGED_30, '30d')} saved />)
    expect(items().map((item) => item.className.includes('[&_.bg-accent]:bg-line-strong'))).toEqual([false, false, false, true])
  })

  it('AC-3306.2: 막대 폭은 넷 가운데 가장 큰 값 대비다', () => {
    const { unmount } = render(<RevisitSection input={inputOf(MERGED_30, '30d')} saved />)
    expect(widths()).toEqual(['44%', '24%', '32%', '100%'])
    unmount()
    // 7일 안 50 · 8~14일 5 · 15~30일 25 · 합친 줄 20 — 가장 큰 값이 합친 줄이 아니다
    render(<RevisitSection input={inputOf([day('2026-10-01', [100, 50, 55, 80, null]), day('2026-11-02', [10, 3, 4])], '30d')} saved />)
    expect(widths()).toEqual(['100%', '10%', '50%', '40%'])
  })

  it("AC-3306.2: '30일 넘어 다시 옴'은 불러온 자료 끝날… 안내가 없다", () => {
    render(<RevisitSection input={inputOf(MERGED_30, '30d')} saved />)
    expect(screen.queryByText(/'30일 넘어 다시 옴'은 불러온 자료 끝날/)).toBeNull()
    // 목록 바로 뒤가 [자세히] 표 자리다(안내 줄이 끼지 않는다)
    expect(list().nextElementSibling!.id).toBe(screen.getByRole('button', { name: '자세히' }).getAttribute('aria-controls'))
  })

  it('AC-3306.2: [자세히] 표의 첫 재방문 줄도 넷이다', () => {
    render(<RevisitSection input={inputOf(MERGED_30, '30d')} saved />)
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const rows = within(screen.getByRole('table', { name: '신환 재방문율' }))
      .getAllByRole('row')
      .slice(1)
      .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent))
    expect(rows.slice(3)).toEqual([
      ['첫 재방문 7일 안', '11명', '50명', '22.0%'],
      ['첫 재방문 8~14일', '6명', '50명', '12.0%'],
      ['첫 재방문 15~30일', '8명', '50명', '16.0%'],
      [`첫 재방문 ${MERGED}`, '25명', '50명', '50.0%'],
    ])
  })
})

describe('AC-513.4: 신환 재방문율 빈 상태', () => {
  it('AC-513.4: 저장된 숫자가 없으면 줄·[자세히] 없이 시안 문구다', () => {
    render(<RevisitSection input={inputOf([], '30d', [])} saved={false} />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러오면 처음 온 환자가 7·14·30일 안에 다시 온 비율이 보여요.')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
    expect(screen.queryByText('처음 온 환자가 다시 온 비율')).toBeNull()
  })

  it('AC-513.4: 저장된 숫자는 있는데 이 기간 자료가 없으면 그 문구다(비교 기간에만 줄이 있어도)', () => {
    render(<RevisitSection input={inputOf([day('2026-09-15', [20, 5, 8, 10, 2])], '30d')} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
  })
})

// ── stats-pc-ux: '30일 넘어 다시 옴' 끝날 안내 접기 (REQ-4004 AC-4004.2 ④, 기본값 11) ─────────────────
describe('AC-4004.2 ④: 신환 재방문율 끝날 안내는 "어떻게 세나요?" 안이다', () => {
  const NOTE = "'30일 넘어 다시 옴'은 불러온 자료 끝날(11월 12일)까지 본 수라, 다시 불러오면 늘 수 있어요."
  const howButton = () => screen.getByRole('button', { name: '어떻게 세나요?' })
  const howBody = () => document.getElementById(howButton().getAttribute('aria-controls')!)!
  const list = () => screen.getByRole('list', { name: '첫 재방문까지 날수' })

  it('AC-4004.2: 안내 글은 "어떻게 세나요?" 칸 안에 있고 처음에는 접혀(hidden) 있어 그 자리에 보이지 않는다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    expect(howButton().getAttribute('aria-expanded')).toBe('false')
    expect(howBody().hidden).toBe(true)
    expect(screen.getByText(NOTE).closest('[hidden]')).toBe(howBody())
    expect(howBody().textContent).toBe(NOTE)
  })

  it('AC-4004.2: 누르면 안내가 보이고 다시 누르면 접힌다', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    fireEvent.click(howButton())
    expect(howButton().getAttribute('aria-expanded')).toBe('true')
    expect(howBody().hidden).toBe(false)
    fireEvent.click(howButton())
    expect(howBody().hidden).toBe(true)
  })

  it('AC-4004.2: 접는 칸은 첫 재방문 목록 바로 아래, [자세히] 칸 바로 앞이다(지금 안내 자리)', () => {
    render(<RevisitSection input={inputOf(DAYS_30, '30d')} saved />)
    const fold = howButton().parentElement!
    expect(fold.contains(howBody())).toBe(true)
    expect(list().nextElementSibling).toBe(fold)
    expect(fold.nextElementSibling!.id).toBe(screen.getByRole('button', { name: '자세히' }).getAttribute('aria-controls'))
  })

  it("AC-4004.2: '30일 넘어 다시 옴' 줄이 없으면(합친 넷) 넣을 글이 없어 접는 칸도 없다", () => {
    render(
      <RevisitSection
        input={inputOf([day('2026-09-15', [20, 5, 8, 10, 2]), day('2026-10-12', [30, 6, 9, 15, null]), day('2026-11-02', [10, 3, 4])], '30d')}
        saved
      />,
    )
    expect(screen.queryByRole('button', { name: '어떻게 세나요?' })).toBeNull()
  })

  it('AC-4004.2: 빈 상태 칸에는 접는 칸이 없다', () => {
    render(<RevisitSection input={inputOf([], '30d', [])} saved />)
    expect(screen.queryByRole('button', { name: '어떻게 세나요?' })).toBeNull()
  })
})

// ── 고른 기간 (stats-period REQ-1704). 오늘은 2026-11-06(금)이다 ─────────────────
describe('AC-1704.4·AC-1704.5: 고른 기간의 신환 재방문율', () => {
  const OCT: StatsPick = { kind: 'month', unit: 'day', month: '2026-10' }
  const pickOf = (days: DayPayload[]): StatsInput => ({ days, covered: [{ from: '2025-01-01', to: '2026-11-05' }], range: rangeOf('2026-11-06', OCT, false) })

  it('AC-1704.4: 설명 끝에 " · {name}"이 붙는다', () => {
    render(<RevisitSection input={pickOf([day('2026-10-05', [2, 1, 1])])} saved />)
    expect(screen.getByText('처음 온 환자가 다시 온 비율 · 2026년 10월')).toBeTruthy()
  })

  it('AC-1704.5: current 날만 센다(바로 전 9월 줄은 넣지 않는다)', () => {
    render(<RevisitSection input={pickOf([day('2026-09-07', [2, 2, 2]), day('2026-10-05', [2, 1, 1])])} saved />)
    expect(row('7일 안에 다시 옴').textContent).toContain('50.0%')
    expect(row('7일 안에 다시 옴').textContent).toContain('신환 2명 가운데 1명')
  })

  it('AC-1704.5: current에 줄이 없으면 지금처럼 "불러온 숫자에 이 기간 자료가 없어요."다', () => {
    render(<RevisitSection input={pickOf([day('2026-09-07', [2, 2, 2])])} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
  })

  it('AC-1704.5: 빼고 센 칸의 글은 "날"이다(고른 기간은 일 칸)', () => {
    render(<RevisitSection input={pickOf([day('2026-10-05', [2, 1, 1]), day('2026-10-30', [2, null, null])])} saved />)
    expect(row('7일 안에 다시 옴').textContent).toContain('온 뒤 7일이 안 된 날의 신환은 빼고 셌어요')
  })
})
