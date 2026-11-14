// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { statsRange, type RxLine, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { nestedBoxes } from '@/testing/boxes'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { RxPickOnce } from './RxPickOnce'

// 신환이 그 처방을 받은 횟수 묶음 (first90 REQ-4410, design.md 5-8, 시안 docs/mockups/first90 .s-once). 처방·날 줄은 이 파일에서 지어낸 값이다

const TODAY = '2026-11-14'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-13' }]
const TITLE = '신환이 그 처방을 받은 횟수'
const DESC = '첫 내원일에 이 처방을 받은 신환이, 불러온 자료 끝날까지 이 처방을 몇 날 받았는지 달마다 봐요'
const FOOT = '집계 중 = 이번 달과 지난달. 첫 내원이 얼마 안 돼서 다시 받으러 오면 1회가 줄 수 있어요. 막대 안 숫자는 실제 인원이에요.'
const MISSING = '이 기간 숫자는 1회 신환을 세기 전에 저장했어요. 비트에서 다시 불러오거나 파일을 다시 넣으면 보여요.'
const SHOCK: RxLine = { code: 'SW01', name: '체외충격파' }
const MANUAL: RxLine = { code: 'MT30', name: '도수치료 30분' }

// [처방, 신환, 1회] — 1회를 주지 않으면 이 기능 전에 저장한 날이다
type Line = [line: RxLine, newPatients: number, once?: number]
function day(ymd: string, lines: Line[]): DayPayload {
  const rx = lines.map(([{ code, name }, newPatients, once]) => ({ code, name, type: '', patients: newPatients + 2, newPatients, returning: 2, ...(once === undefined ? {} : { once }) }))
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: 30, newPatients: 6, returning: 24, unknown: 0 },
    rx,
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}
// 최근 30일(10월 15일 – 11월 13일): 체외충격파 10월 신환 3·1회 2, 11월 신환 1·1회 1 / 도수치료 10월 신환 2·1회 0, 11월 신환 없음
const DAYS = [
  day('2026-10-20', [
    [SHOCK, 3, 2],
    [MANUAL, 2, 0],
  ]),
  day('2026-11-03', [[SHOCK, 1, 1]]),
]
const inputOf = (days: readonly DayPayload[] = DAYS, period: StatsPeriod = '30d'): StatsInput => ({ days, covered: WHOLE, range: statsRange(TODAY, period) })
const draw = (picks: readonly RxLine[] = [SHOCK, MANUAL], input: StatsInput = inputOf()) => render(<RxPickOnce picks={picks} input={input} />)

const section = () => screen.getByRole('heading', { level: 3, name: TITLE }).closest('section')!
const pickButtons = () => within(screen.getByRole('group', { name: '처방' })).getAllByRole('button')
const rowOf = (label: string) => screen.getByText(label).closest('li') as HTMLElement
const barOf = (row: HTMLElement) => within(row).queryByRole('img')
const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

afterEach(cleanup)

describe('AC-4410.1: 묶음 틀 · 처방 단추 · 범례', () => {
  it('AC-4410.1: 고른 처방이 없으면 아무것도 그리지 않는다', () => {
    const { container } = draw([])
    expect(container.innerHTML).toBe('')
  })

  it('AC-4410.1: section 안에 h3 이름과 옆 글이 있고 위는 얇은 선이다', () => {
    draw()
    const head = screen.getByRole('heading', { level: 3, name: TITLE })
    expect(classes(head)).toEqual(expect.arrayContaining(['text-st-15', 'font-semibold', 'text-st-ink']))
    expect(within(section()).getByText(DESC)).toBeTruthy()
    expect(classes(section())).toEqual(expect.arrayContaining(['border-t', 'border-st-line']))
    expect(section().getAttribute('aria-labelledby')).toBe(head.id)
  })

  it('AC-4410.1: 처방 단추 묶음(role=group "처방")은 고른 처방 차례이고 처음은 첫째가 눌려 있다(aria-pressed)', () => {
    draw()
    expect(pickButtons().map((b) => b.textContent)).toEqual([SHOCK.name, MANUAL.name])
    expect(pickButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    expect(pickButtons().every((b) => b.getAttribute('type') === 'button')).toBe(true)
  })

  it('AC-4410.1: 다른 처방을 누르면 그 단추만 눌리고 줄이 그 처방 숫자로 바뀐다', () => {
    draw()
    expect(within(rowOf('2026년 10월 (15일부터)')).getByText('신환 3명 · 1회 66.6%')).toBeTruthy()
    fireEvent.click(pickButtons()[1]!)
    expect(pickButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    expect(within(rowOf('2026년 10월 (15일부터)')).getByText('신환 2명 · 1회 0.0%')).toBeTruthy()
    expect(within(rowOf('11월 (13일까지)')).getByText('신환 0명')).toBeTruthy()
  })

  it('AC-4410.1: 고른 처방이 바뀌어 고른 단추가 없어지면 첫째로 돌아간다', () => {
    const view = draw()
    fireEvent.click(pickButtons()[1]!)
    view.rerender(<RxPickOnce picks={[SHOCK]} input={inputOf()} />)
    expect(pickButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true'])
    expect(within(rowOf('2026년 10월 (15일부터)')).getByText('신환 3명 · 1회 66.6%')).toBeTruthy()
  })

  it('AC-4410.1: 범례는 "현재까지 1회" · "2회 이상"이고 색 점은 막대 색과 같다(꾸밈)', () => {
    draw()
    const items = within(section()).getAllByRole('listitem').filter((li) => li.textContent === '현재까지 1회' || li.textContent === '2회 이상')
    expect(items.map((li) => li.textContent)).toEqual(['현재까지 1회', '2회 이상'])
    const [once, more] = items.map((li) => li.querySelector('[aria-hidden="true"]')!)
    expect(classes(once!)).toContain('bg-accent')
    expect(classes(more!)).toContain('bg-st-ink')
  })
})

describe('AC-4410.2: 달 줄 · 100% 막대 · 줄 끝 글 · 합계', () => {
  it('AC-4410.2: 보는 기간의 달마다 한 줄이고 달 이름·일부 달 글이 있다', () => {
    draw()
    expect(rowOf('2026년 10월 (15일부터)')).toBeTruthy()
    expect(rowOf('11월 (13일까지)')).toBeTruthy()
  })

  it('AC-4410.2: 막대는 두 갈래이고 안에 실제 인원 숫자, 폭은 flex-basis %, 이름은 글로 준다(role=img)', () => {
    draw()
    const bar = barOf(rowOf('2026년 10월 (15일부터)'))!
    expect(bar.getAttribute('aria-label')).toBe('신환 3명 중 1회 2명, 2회 이상 1명')
    const [once, more] = Array.from(bar.children) as HTMLElement[]
    expect(once!.textContent).toBe('2')
    expect(more!.textContent).toBe('1')
    expect(once!.style.flexBasis).toBe('66.67%')
    expect(more!.style.flexBasis).toBe('33.33%')
  })

  it('AC-4410.2: 집계가 끝난 달 막대는 1회 파랑 · 2회 이상 짙은 남색 바탕에 흰 숫자다(최근 12개월의 3월)', () => {
    draw([SHOCK], inputOf([day('2026-03-10', [[SHOCK, 4, 1]]), ...DAYS], '12m'))
    const [once, more] = Array.from(barOf(rowOf('3월'))!.children) as HTMLElement[]
    expect(classes(once!)).toEqual(expect.arrayContaining(['bg-accent', 'text-surface']))
    expect(classes(more!)).toEqual(expect.arrayContaining(['bg-st-ink', 'text-surface']))
  })

  it('AC-4410.2: 두 갈래 바탕은 막대 안 흰 숫자(text-surface)와 대비 4.5:1 이상이다(1회 파랑 · 2회 이상 짙은 남색)', () => {
    draw([SHOCK], inputOf([day('2026-03-10', [[SHOCK, 4, 1]]), ...DAYS], '12m'))
    const bar = barOf(rowOf('3월'))!
    const tones = (Array.from(bar.children) as HTMLElement[]).map((part) => classes(part).find((name) => name.startsWith('bg-'))!)
    expect(tones).toEqual(['bg-accent', 'bg-st-ink'])
    const surface = tokenColor('surface')
    for (const tone of tones) expect(contrast(tokenColor(tone.slice(3)), surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('AC-4410.2: 0명인 갈래는 그리지 않는다(1회 1명 · 2회 이상 0명)', () => {
    draw()
    const bar = barOf(rowOf('11월 (13일까지)'))!
    expect(bar.getAttribute('aria-label')).toBe('신환 1명 중 1회 1명, 2회 이상 0명')
    expect(Array.from(bar.children).map((el) => el.textContent)).toEqual(['1'])
    expect((bar.children[0] as HTMLElement).style.flexBasis).toBe('100%')
  })

  it('AC-4410.2: 줄 끝 글은 "신환 {n}명 · 1회 {p}%"이고 신환이 0이면 "신환 0명"이며 막대가 없다', () => {
    draw()
    expect(within(rowOf('2026년 10월 (15일부터)')).getByText('신환 3명 · 1회 66.6%')).toBeTruthy()
    expect(within(rowOf('11월 (13일까지)')).getByText('신환 1명 · 1회 100.0%')).toBeTruthy()
    fireEvent.click(pickButtons()[1]!)
    const empty = rowOf('11월 (13일까지)')
    expect(within(empty).getByText('신환 0명')).toBeTruthy()
    expect(barOf(empty)).toBeNull()
  })

  it('AC-4410.2: 막대 아래 합계 한 줄 "합계 · 신환 {n}명 중 1회 {n}명({p}%) · 2회 이상 {n}명"', () => {
    draw()
    expect(within(section()).getByText('합계 · 신환 4명 중 1회 3명(75.0%) · 2회 이상 1명')).toBeTruthy()
    fireEvent.click(pickButtons()[1]!)
    expect(within(section()).getByText('합계 · 신환 2명 중 1회 0명(0.0%) · 2회 이상 2명')).toBeTruthy()
  })

  it('AC-4410.2: 신환이 하나도 없으면 합계는 "합계 · 신환 0명"이고 줄마다 "신환 0명"이다', () => {
    draw([{ code: 'NONE', name: '없는 처방' }])
    expect(within(section()).getByText('합계 · 신환 0명')).toBeTruthy()
    expect(within(section()).getAllByText('신환 0명')).toHaveLength(2)
    expect(within(section()).queryByRole('img')).toBeNull()
  })

  it('AC-4410.2: 보는 기간에 날 줄이 없으면 h3 아래 "자료 없음" 한 줄뿐이다', () => {
    draw([SHOCK], inputOf([day('2026-09-01', [[SHOCK, 3, 1]])]))
    expect(section().textContent).toBe(`${TITLE}${DESC}자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.`)
    expect(screen.queryByRole('group', { name: '처방' })).toBeNull()
  })
})

describe('AC-4410.3: 집계 중', () => {
  it('AC-4410.3: 오늘이 든 달과 그 앞 달은 달 이름 옆에 "집계 중" 꼬리표가 있고 막대가 옅다(옅은 바탕 + 진한 숫자, 막대 전체 투명 없음)', () => {
    draw()
    for (const label of ['2026년 10월 (15일부터)', '11월 (13일까지)']) {
      const name = screen.getByText(label)
      const tag = within(name).getByText('집계 중')
      expect(classes(tag)).toEqual(expect.arrayContaining(['rounded-full', 'text-caption']))
      const bar = barOf(rowOf(label))!
      expect(classes(bar).some((name) => name.startsWith('opacity-'))).toBe(false)
      for (const part of Array.from(bar.children)) {
        expect(classes(part)).toContain('text-st-ink')
        expect(classes(part)).not.toContain('text-surface')
      }
    }
    // 두 갈래가 다 있는 10월: 1회 연한 파랑 · 2회 이상 연한 회색
    const [once, more] = Array.from(barOf(rowOf('2026년 10월 (15일부터)'))!.children) as HTMLElement[]
    expect(classes(once!)).toContain('bg-st-h2')
    expect(classes(more!)).toContain('bg-st-line-2')
  })

  it('AC-4410.3: 집계 중 막대 숫자와 옅은 바탕 대비는 4.5:1 이상이다', () => {
    const ink = tokenColor('st-ink')
    for (const tone of ['st-h2', 'st-line-2']) expect(contrast(tokenColor(tone), ink)).toBeGreaterThanOrEqual(4.5)
  })

  it('AC-4410.3: 그 밖 달은 꼬리표가 없고 막대가 옅지 않다(최근 12개월의 3월)', () => {
    draw([SHOCK], inputOf([day('2026-03-10', [[SHOCK, 4, 1]]), ...DAYS], '12m'))
    const march = rowOf('3월')
    expect(within(march).queryByText('집계 중')).toBeNull()
    const [once, more] = Array.from(barOf(march)!.children) as HTMLElement[]
    expect(classes(once!)).toEqual(expect.arrayContaining(['bg-accent', 'text-surface']))
    expect(classes(more!)).toEqual(expect.arrayContaining(['bg-st-ink', 'text-surface']))
    expect(within(march).getByText('신환 4명 · 1회 25.0%')).toBeTruthy()
    expect(within(section()).getAllByText('집계 중')).toHaveLength(2)
  })

  it('AC-4410.3: 합계 아래 글은 늘 같은 한 줄이다', () => {
    draw()
    const foot = within(section()).getByText(FOOT)
    const sum = within(section()).getByText('합계 · 신환 4명 중 1회 3명(75.0%) · 2회 이상 1명')
    expect(sum.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(pickButtons()[1]!)
    expect(within(section()).getByText(FOOT)).toBeTruthy()
  })
})

describe('AC-4410.4: once가 없는 날', () => {
  const OLD = [day('2026-10-20', [[SHOCK, 2]]), day('2026-11-03', [[SHOCK, 3, 1]])]

  it('AC-4410.4: 그 달 줄은 막대가 없고 "신환 {n}명 · 1회 –", 합계는 "합계 · 신환 {n}명 · 1회 –"이며 아래에 안내 글이 있다', () => {
    draw([SHOCK], inputOf(OLD))
    const oct = rowOf('2026년 10월 (15일부터)')
    expect(barOf(oct)).toBeNull()
    expect(within(oct).getByText('신환 2명 · 1회 –')).toBeTruthy()
    expect(barOf(rowOf('11월 (13일까지)'))).not.toBeNull()
    expect(within(section()).getByText('합계 · 신환 5명 · 1회 –')).toBeTruthy()
    expect(within(section()).getByText(MISSING)).toBeTruthy()
  })

  it('AC-4410.4: 모두 셌으면 안내 글이 없다', () => {
    draw()
    expect(screen.queryByText(MISSING)).toBeNull()
  })
})

describe('AC-4417.2: 횟수 막대 움직임', () => {
  it('AC-4417.2: 막대 갈래에 st-move-period가 붙고(flex-basis 300ms) 다른 움직임 클래스는 없다', () => {
    const { container } = draw()
    const parts = Array.from(barOf(rowOf('2026년 10월 (15일부터)'))!.children)
    for (const part of parts) expect(classes(part)).toContain('st-move-period')
    const all = Array.from(container.querySelectorAll('*')).flatMap(classes)
    expect(all.filter((c) => /^(?:transition-|animate-|duration-)/.test(c))).toEqual([])
  })

  it('AC-4410.1: 상자 안 상자가 없다', () => {
    const { container } = draw()
    expect(nestedBoxes(container)).toEqual([])
  })
})

// globals.css :root의 색 토큰 값(#RRGGBB)과 WCAG 대비
function tokenColor(name: string): string {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const found = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6});`))
  if (!found) throw new Error(`--${name} 토큰이 없다`)
  return found[1]!
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}
