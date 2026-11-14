// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nestedBoxes } from '@/testing/boxes'
import { formatRxVisitSplit, rxVisitHeadline } from '@/lib/analytics/rxVisitSplit'
import type { RxSplit, RxSplitLine, RxSplitView } from '@/types/stats'
import { StatsCard } from './parts'
import { RxSection } from './RxSection'
import { RxSplitSection } from './RxSplitSection'

// 처방별 신환·재진 (stats REQ-513 AC-513.7·513.8·513.14, 시안 notes.md §3). 줄은 시험 안에서 지은 가짜다

const HOSPITAL = '튼튼의원'
const line = (i: number, total: number): RxSplitLine => ({ code: `R${i}`, label: `가짜 처방 ${i}`, newPatients: 1, returning: total - 1, total })
const lines = (n: number) => Array.from({ length: n }, (_, i) => line(i + 1, 1000 - i))

function split(n: number): RxSplit {
  return { from: '2026-10-14', to: '2026-11-12', visits: 3203, patients: 900, newPatients: 100, returning: 800, lines: lines(n), invalidCodes: 0 }
}
function view(n: number): RxSplitView {
  const s = split(n)
  return { kind: 'split', split: s, days: [], text: '\n워커 글', headline: rxVisitHeadline(s) }
}
const draw = (v: RxSplitView | null, saved = true) => render(<RxSplitSection view={v} hospitalName={HOSPITAL} saved={saved} />)
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  cleanup()
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('AC-513.7: 처방별 신환·재진 표', () => {
  it('AC-513.7·AC-4413.3: h2 + 옆 설명 + 머리 글(rxVisitHeadline) + 표(처방·합계·신환·재진, 순위 모양) + 안내 줄이다', () => {
    const v = view(3)
    draw(v)
    expect(screen.getByRole('heading', { level: 2, name: '처방별 신환·재진' })).toBeTruthy()
    expect(screen.getByText('처방마다 서로 다른 환자 수')).toBeTruthy()
    expect(screen.getByText(rxVisitHeadline(split(3)))).toBeTruthy()
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['처방', '합계', '신환', '재진'])
    expect(within(bodyRows()[0]!).getAllByRole('cell').map((td) => td.textContent)).toEqual(['가짜 처방 1', '1,000', '1', '999'])
    expect(screen.getByText('명 = 그 기간에 그 처방을 받은 서로 다른 환자 수예요. 합계가 큰 차례예요.')).toBeTruthy()
  })

  it('AC-513.7: 합계가 큰 차례 10개만 보이고 [모두 보기]로 나머지가 열리고 다시 접힌다', () => {
    draw(view(14))
    expect(bodyRows()).toHaveLength(10)
    const more = screen.getByRole('button', { name: '모두 보기 (14개)' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(more.getAttribute('aria-controls')!)).not.toBeNull()
    fireEvent.click(more)
    expect(bodyRows()).toHaveLength(14)
    const less = screen.getByRole('button', { name: '10개만 보기' })
    expect(less.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(less)
    expect(bodyRows()).toHaveLength(10)
  })

  it('AC-513.7: 10개 이하면 [모두 보기]가 없다', () => {
    draw(view(10))
    expect(bodyRows()).toHaveLength(10)
    expect(screen.queryByRole('button', { name: /모두 보기/ })).toBeNull()
  })

  it('AC-513.7: [표 복사]는 병원 이름을 넣은 formatRxVisitSplit 글이고 Worker의 view.text가 아니다', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const v = view(14)
    draw(v)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '표 복사' }))
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(formatRxVisitSplit(HOSPITAL, split(14)))
    expect(writeText).not.toHaveBeenCalledWith('\n워커 글')
    expect((writeText.mock.calls[0] as unknown as [string])[0].split('\n')[0]).toBe(HOSPITAL)
  })

  it('AC-513.7·AC-513.14: { kind: \'none\' }이면 표·단추 없이 새 글 전체가 글자 그대로다', () => {
    draw({ kind: 'none' })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('이 기간은 아직 불러오지 않았어요').parentElement!.textContent).toBe('이 기간은 아직 불러오지 않았어요 · 이 기간을 고른 채 [비트에서 불러오기]를 누르면 보여요.')
    expect(screen.queryByText('자료 없음')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('AC-513.14: 처방 줄이 0개인 split은 옛 글이고 새 글이 없다', () => {
    const { container } = draw(view(0))
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 이 기간에 불러온 진료 줄이 없어요.')
    expect(container.textContent).not.toContain('아직 불러오지 않았어요')
    expect(container.textContent).not.toContain('비트에서 불러오기')
  })

  it('AC-513.7: 처방 줄이 하나도 없는 결과는 빈 표 없이 "자료 없음" + 한 줄이다', () => {
    draw(view(0))
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 이 기간에 불러온 진료 줄이 없어요.')
  })
})

describe('AC-513.8: 비트 PC에서 불러온 자료가 없을 때', () => {
  const REASON = '비트 PC에서 불러오면 보여요 · 진료 줄은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.'

  it('AC-513.8: "비트 PC에서 불러오면 보여요" + 한 줄 이유이고 표·단추가 없다', () => {
    draw(null)
    expect(screen.getByText('비트 PC에서 불러오면 보여요').parentElement!.textContent).toBe(REASON)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('처방마다 서로 다른 환자 수')).toBeTruthy()
  })

  it('AC-513.8: 저장된 숫자가 하나도 없으면 시안처럼 h2와 안내뿐이다(옆 설명 없음)', () => {
    draw(null, false)
    expect(screen.getByText('비트 PC에서 불러오면 보여요').parentElement!.textContent).toBe(REASON)
    expect(screen.queryByText('처방마다 서로 다른 환자 수')).toBeNull()
  })
})

// ── 고른 기간 (stats-period AC-1704.4) ─────────────────
describe('AC-1704.4: 고른 기간의 처방별 신환·재진', () => {
  it('AC-1704.4: 고른 기간 이름(name)을 받으면 설명 끝에 " · {name}"이 붙는다', () => {
    render(<RxSplitSection view={view(3)} hospitalName={HOSPITAL} saved name="2026년 10월" />)
    expect(screen.getByText('처방마다 서로 다른 환자 수 · 2026년 10월')).toBeTruthy()
  })

  it('AC-1704.4: 비트 자료가 없을 때 보이는 설명에도 붙는다', () => {
    render(<RxSplitSection view={null} hospitalName={HOSPITAL} saved name="2026년 10월" />)
    expect(screen.getByText('처방마다 서로 다른 환자 수 · 2026년 10월')).toBeTruthy()
  })

  it('AC-1704.4: name이 없거나 null이면(빠른 단추) 설명이 지금과 같다', () => {
    render(<RxSplitSection view={view(3)} hospitalName={HOSPITAL} saved name={null} />)
    expect(screen.getByText('처방마다 서로 다른 환자 수')).toBeTruthy()
  })
})

// ── first90: 처방별 신환·재진도 가로 막대 순위 모양(REQ-4413 AC-4413.3) ─────────────────
describe('AC-4413.3: 가로 막대 순위 모양', () => {
  const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
  const barOf = (row: Element) => row.querySelector('[aria-hidden="true"].h-3') as HTMLElement | null

  it('AC-4413.3: 표 이름은 그대로(처방별 신환·재진 (명))이고 줄마다 이름 다음에 가로 막대(꾸밈)가 있다. 막대 폭 = 합계 ÷ 가장 큰 합계', () => {
    draw(view(3))
    expect(screen.getByRole('table', { name: '처방별 신환·재진 (명)' })).toBeTruthy()
    const [first, , third] = bodyRows()
    const bar = barOf(first!)!
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect((bar.querySelector('.bg-accent') as HTMLElement).style.width).toBe('100%')
    // 998 ÷ 1,000
    expect((barOf(third!)!.querySelector('.bg-accent') as HTMLElement).style.width).toBe('99.8%')
    expect(bar.querySelector('.bg-faint')).toBeNull()
  })

  it('AC-4413.3·AC-4417.2: 막대 폭은 기간을 바꾸면 움직인다(st-move-period)', () => {
    draw(view(3))
    expect(classes(barOf(bodyRows()[0]!)!.querySelector('.bg-accent')!)).toContain('st-move-period')
  })

  it('AC-4413.3: 합계는 크게(18px 600), 수 칸은 오른쪽 정렬·고정폭 숫자다', () => {
    draw(view(3))
    const [name, total, fresh, back] = within(bodyRows()[0]!).getAllByRole('cell')
    expect(classes(total!)).toEqual(expect.arrayContaining(['text-st-18', 'font-semibold', 'tabular-nums', 'text-right']))
    for (const cell of [fresh!, back!]) expect(classes(cell)).toEqual(expect.arrayContaining(['tabular-nums', 'text-right']))
    expect(classes(name!)).toContain('font-semibold')
  })

  it('AC-4413.3: 머리 줄은 1024px 미만에서 화면 읽기에만 있고, 그때 신환·재진 앞에 꾸밈 이름표가 보인다', () => {
    draw(view(3))
    const head = within(screen.getByRole('table')).getAllByRole('row')[0]!
    expect(classes(head)).toContain('max-lg:sr-only')
    const row = bodyRows()[0]!
    const labels = Array.from(row.querySelectorAll('[aria-hidden="true"]')).filter((el) => el.textContent === '신환' || el.textContent === '재진')
    expect(labels.map((el) => el.textContent)).toEqual(['신환', '재진'])
    for (const label of labels) expect(classes(label)).toEqual(expect.arrayContaining(['lg:hidden', 'text-muted']))
  })

  it('AC-4413.3: 줄과 머리 줄을 쌓는 폭 접두사는 lg:·max-lg:만 쓰고 상자 안 상자가 없다', () => {
    const { container } = draw(view(14))
    const OTHER_WIDTH = /^(?:max-)?(?:sm|md|xl|2xl):/
    const table = screen.getByRole('table')
    for (const el of [table, ...Array.from(table.querySelectorAll('*'))]) expect(classes(el).filter((t) => OTHER_WIDTH.test(t))).toEqual([])
    expect(nestedBoxes(container)).toEqual([])
  })

  it('AC-4413.1: 처방 카드(옆 글 있음) 안이면 설명은 패널 맨 위 한 줄이고 카드 머리에는 가지 않는다', () => {
    render(
      <StatsCard title="처방" desc="가짜 카드 설명">
        <RxSection tabs={[{ name: '처방별 신환·재진', panel: <RxSplitSection view={view(3)} hospitalName={HOSPITAL} saved /> }]} />
      </StatsCard>,
    )
    const head = screen.getByRole('heading', { level: 2, name: '처방' }).parentElement!
    expect(head.textContent).toBe('처방가짜 카드 설명')
    expect(screen.getByRole('tabpanel').firstElementChild!.textContent).toBe('처방마다 서로 다른 환자 수')
  })
})
