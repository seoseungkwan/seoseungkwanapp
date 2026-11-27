// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { statsRange, type StatsInput } from '@/components/stats/view'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { StatsCard } from './parts'
import { VisitMixSection } from './VisitMixSection'

// 내원 구성 도넛 칸 (first90 REQ-4412 AC-4412.1, REQ-4417 AC-4417.1·AC-4417.2, design.md 5-0·5-4, 시안 docs/mockups/first90/redesign.html .s-sub-mix).
// 숫자는 시안의 누적 내원 2,408건(신환 238 · 90일초진 293 · 재진 1,877)을 두 날로 나눈 가짜다

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]
const OLD_NOTE = '지금은 재진에 90일초진이 들어 있어요. 새 도우미(0.7.0)로 다시 불러오면 따로 보여요.'

function day(ymd: string, newPatients: number, returning: number, first90?: number): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: newPatients + returning + (first90 ?? 0), newPatients, returning, unknown: 0, ...(first90 === undefined ? {} : { first90 }) },
    rx: [],
    groups: [],
    revisit: { cohort: newPatients, within7: null, within14: null },
  }
}
const inputOf = (days: DayPayload[]): StatsInput => ({ days, covered: WHOLE, range: statsRange(TODAY, '30d') })
// 새 도우미 날 둘(세 갈래)
const KNOWN = [day('2026-11-02', 100, 900, 93), day('2026-11-10', 138, 977, 200)]
// 둘째 날이 옛 도우미 날(returning에 90일초진 200 포함) → 두 갈래
const MIXED = [day('2026-11-02', 100, 900, 93), day('2026-11-10', 138, 1177)]

const tokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const legendRows = () =>
  within(screen.getByRole('list', { name: '내원 구성' }))
    .getAllByRole('listitem')
    .map((li) => Array.from(li.children).map((cell) => cell.textContent))
const donutOf = (container: HTMLElement) => container.querySelector('svg')!.parentElement!

afterEach(cleanup)

describe('AC-4412.1: 내원 구성', () => {
  it('AC-4412.1: 제목 "내원 구성" · 옆 글 "이 기간 누적 내원 · 같은 분이 여러 번 오면 여러 건"이고 도넛 하나와 범례가 있다', () => {
    const { container } = render(<VisitMixSection input={inputOf(KNOWN)} />)
    const heading = screen.getByRole('heading', { level: 2, name: '내원 구성' })
    expect(heading.parentElement!.textContent).toBe('내원 구성이 기간 누적 내원 · 같은 분이 여러 번 오면 여러 건')
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(screen.getByRole('list', { name: '내원 구성' })).toBeTruthy()
  })

  it('AC-4412.1: 도넛 가운데 두 줄은 "누적 내원" / "{n}건"이고 그림은 꾸밈(aria-hidden)이다', () => {
    const { container } = render(<VisitMixSection input={inputOf(KNOWN)} />)
    const donut = donutOf(container)
    expect(donut.getAttribute('aria-hidden')).toBe('true')
    const center = donut.lastElementChild!
    expect(Array.from(center.children).map((line) => line.textContent)).toEqual(['누적 내원', '2,408건'])
  })

  it('AC-4412.1: 모든 날에 first90이 있으면 범례 세 줄 "신환 {n}건 {p}%" · "90일초진 …" · "재진 …"이고 비율은 소수 첫째 자리 아래 버림이다', () => {
    render(<VisitMixSection input={inputOf(KNOWN)} />)
    expect(legendRows()).toEqual([
      ['', '신환', '238건', '9.8%'],
      ['', '90일초진', '293건', '12.1%'],
      ['', '재진', '1,877건', '77.9%'],
    ])
    expect(screen.queryByText(OLD_NOTE)).toBeNull()
  })

  it('AC-4412.1: 범례 색 표시는 꾸밈이고 도넛 조각과 같은 색(accent · st-f90 · st-ret)이다', () => {
    const { container } = render(<VisitMixSection input={inputOf(KNOWN)} />)
    const marks = within(screen.getByRole('list', { name: '내원 구성' }))
      .getAllByRole('listitem')
      .map((li) => li.firstElementChild!)
    for (const mark of marks) expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(marks.map((mark) => tokens(mark).find((name) => name.startsWith('bg-')))).toEqual(['bg-accent', 'bg-st-f90', 'bg-st-ret'])
    const arcs = Array.from(container.querySelectorAll('svg g > circle'))
    expect(arcs.map((arc) => tokens(arc).find((name) => name.startsWith('text-')))).toEqual(['text-accent', 'text-st-f90', 'text-st-ret'])
  })

  it('AC-4412.1: first90이 없는 날이 있으면 두 갈래 "신환" · "재진"이고 아래에 옛 도우미 안내 글이 있다', () => {
    const { container } = render(<VisitMixSection input={inputOf(MIXED)} />)
    expect(legendRows()).toEqual([
      ['', '신환', '238건', '9.8%'],
      ['', '재진', '2,170건', '90.1%'],
    ])
    expect(container.querySelectorAll('svg g > circle')).toHaveLength(2)
    const note = screen.getByText(OLD_NOTE)
    expect(tokens(note)).toContain('text-st-warn-ink')
    expect(screen.getByRole('list', { name: '내원 구성' }).compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-4412.1: 380px 미만은 범례가 도넛 아래로 간다(줄을 세로로 쌓고 도넛은 가운데)', () => {
    const { container } = render(<VisitMixSection input={inputOf(KNOWN)} />)
    const holder = donutOf(container).parentElement!
    const line = holder.parentElement!
    expect(Array.from(line.children)).toEqual([holder, screen.getByRole('list', { name: '내원 구성' })])
    expect(tokens(line)).toEqual(expect.arrayContaining(['flex', 'items-center', 'max-[380px]:flex-col', 'max-[380px]:items-stretch']))
    expect(tokens(holder)).toContain('max-[380px]:self-center')
  })

  it('AC-4412.1: 환자 카드 안에서는 h3다', () => {
    render(
      <StatsCard title="환자">
        <VisitMixSection input={inputOf(KNOWN)} />
      </StatsCard>,
    )
    expect(screen.getByRole('heading', { level: 3, name: '내원 구성' })).toBeTruthy()
  })

  it('AC-4412.1: 이 기간에 줄이 없으면 그리지 않는다(일별 내원 칸이 빈 글을 맡는다)', () => {
    const { container } = render(<VisitMixSection input={inputOf([day('2026-01-05', 1, 1, 0)])} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('AC-4417.1·AC-4417.2: 도넛 움직임', () => {
  it('AC-4417.1·AC-4417.2: 도넛은 motion으로 그린다(svg st-donut · 조각 seg st-move-period)', () => {
    const { container } = render(<VisitMixSection input={inputOf(KNOWN)} />)
    expect(tokens(container.querySelector('svg')!)).toContain('st-donut')
    for (const arc of Array.from(container.querySelectorAll('svg g > circle'))) expect(tokens(arc)).toEqual(expect.arrayContaining(['seg', 'st-move-period']))
  })

  it('AC-4417.1: 값이 바뀌어 다시 그려도 같은 svg·조각 요소를 그대로 쓴다(처음 450ms 그리기를 되풀이하지 않는다)', () => {
    const { container, rerender } = render(<VisitMixSection input={inputOf(KNOWN)} />)
    const svg = container.querySelector('svg')
    const arcs = Array.from(container.querySelectorAll('svg g > circle'))
    rerender(<VisitMixSection input={inputOf([day('2026-11-02', 10, 20, 30)])} />)
    expect(container.querySelector('svg')).toBe(svg)
    expect(Array.from(container.querySelectorAll('svg g > circle'))).toEqual(arcs)
    expect(legendRows().map((row) => row[2])).toEqual(['10건', '30건', '20건'])
  })
})

// uisarang-upload REQ-8818(design.md §10-7): 의사랑 날 줄은 늘 first90이 없다 → 의사랑 의원(uis)이면 옛 도우미 안내 줄만 그리지 않는다. 도넛·범례·셈은 그대로
describe('AC-8818.1: 의사랑 의원은 내원 구성 옛 도우미 안내가 없다', () => {
  // 의사랑 날 줄 모양(first90 없음) — 신환 238 · 재진 2,170, 누적 2,408건
  const NO90 = [day('2026-11-02', 100, 993), day('2026-11-10', 138, 1177)]

  it('AC-8818.1: uis이면 first90 없는 날 줄이어도 옛 도우미 안내가 없고, 도넛(두 조각 · 가운데 글)·범례 두 줄은 그대로다', () => {
    const { container } = render(<VisitMixSection input={inputOf(NO90)} uis />)
    expect(screen.queryByText(OLD_NOTE)).toBeNull()
    expect(container.textContent).not.toContain('새 도우미(0.7.0)')
    expect(legendRows()).toEqual([
      ['', '신환', '238건', '9.8%'],
      ['', '재진', '2,170건', '90.1%'],
    ])
    expect(container.querySelectorAll('svg g > circle')).toHaveLength(2)
    expect(Array.from(donutOf(container).lastElementChild!.children).map((line) => line.textContent)).toEqual(['누적 내원', '2,408건'])
    expect(screen.getByRole('heading', { level: 2, name: '내원 구성' })).toBeTruthy()
  })

  it('AC-8818.1: uis이면 그린 글이 uis 없음에서 안내 줄 하나만 뺀 것과 같다', () => {
    // 서버 그림끼리 견준다(그릴 때마다 머리 id(useId)가 처음부터 같다)
    render(<VisitMixSection input={inputOf(NO90)} />)
    const note = screen.getByText(OLD_NOTE).outerHTML
    const plain = renderToStaticMarkup(<VisitMixSection input={inputOf(NO90)} />)
    const uis = renderToStaticMarkup(<VisitMixSection input={inputOf(NO90)} uis />)
    expect(plain).toContain(note)
    expect(uis).toBe(plain.replace(note, ''))
  })

  it('AC-8818.1·AC-8818.4: uis를 주지 않거나 거짓이면 지금처럼 first90 없는 날이 있을 때 안내가 있다', () => {
    const { rerender } = render(<VisitMixSection input={inputOf(NO90)} />)
    expect(screen.getByText(OLD_NOTE)).toBeTruthy()
    rerender(<VisitMixSection input={inputOf(NO90)} uis={false} />)
    expect(screen.getByText(OLD_NOTE)).toBeTruthy()
    rerender(<VisitMixSection input={inputOf(MIXED)} uis={false} />)
    expect(screen.getByText(OLD_NOTE)).toBeTruthy()
  })

  it('AC-8818.1: uis이어도 이 기간에 줄이 없으면 그리지 않는다(지금 그대로)', () => {
    const { container } = render(<VisitMixSection input={inputOf([day('2026-01-05', 1, 1)])} uis />)
    expect(container.innerHTML).toBe('')
  })
})
