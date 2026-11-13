// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { againBaseText, againView } from '@/components/stats/againView'
import { rangeOf, statsRange, type RxLine, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { nestedBoxes } from '@/testing/boxes'
import type { DateRange } from '@/types/dates'
import type { AgainCounts, AgainWindow, DayAgainPayload, DayPayload } from '@/types/payload'
import { RxPickAgain, type AgainDaysState } from './RxPickAgain'

// 같은 처방 재방문 묶음 화면 (fu-rate REQ-1307, 시안 docs/mockups/fu-rate/index.html). 숫자는 진짜 againView로 만들고,
// 날 줄·처방 코드·이름은 모두 이 파일에서 지어낸 값이다. 오늘은 2026-11-05로 둔다

type AgainRx = DayAgainPayload['rx'][number]
const ag = (code: string, starts: number, back: AgainCounts, more: AgainCounts): AgainRx => ({ code, starts, back, more })
const READY_ALL: DayAgainPayload['ready'] = [true, true, true]
const READY_NONE: DayAgainPayload['ready'] = [false, false, false]

function day(ymd: string, again?: { ready: DayAgainPayload['ready']; rx?: AgainRx[] }): DayPayload {
  const base: DayPayload = {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: 30, newPatients: 5, returning: 25, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null },
  }
  return again === undefined ? base : { ...base, again: { ready: again.ready, rx: again.rx ?? [] } }
}

const TODAY = '2026-11-05'
const ALL: DateRange[] = [{ from: '2025-01-01', to: '2026-11-04' }]
const A = '가짜 처방 가'
const B = '가짜 처방 나'
const C = '가짜 처방 다'
const PICK_A: RxLine = { code: 'RA', name: A } // 시작 3명(10명 미만)
const PICK_B: RxLine = { code: 'RB', name: B } // 시작 12명
const PICK_C: RxLine = { code: 'RC', name: C } // 시작 0명

// 최근 30일 + 7일: 센 범위 10-06 ~ 10-28, 아직 셀 수 없는 날 10-29 ~ 11-04(7일)
// RA = 시작 3·다시 1·더 2(33.3%, 평균 0.6번 더), 기다림 2 / RB = 시작 12·다시 6·더 9(50.0%, 평균 0.7번 더), 기다림 4
const DAYS = [
  day('2026-10-10', { ready: READY_ALL, rx: [ag('RA', 3, [1, 1, 2], [2, 3, 4]), ag('RB', 12, [6, 7, 8], [9, 12, 15])] }),
  day('2026-10-31', { ready: READY_NONE, rx: [ag('RA', 2, [null, null, null], [null, null, null]), ag('RB', 4, [null, null, null], [null, null, null])] }),
]

const EMPTY_LINE = '처방을 고르면 7일·14일·30일 안에 같은 처방을 다시 받은 환자가 여기 보여요.'
const READING = '같은 처방 재방문 숫자를 더 읽는 중이에요'
const NO_RANGE = '불러온 숫자에 이 기간 자료가 없어요.'
const BEFORE_AGAIN = '이 기간 숫자는 같은 처방 재방문을 세기 전에 저장했어요. 비트에서 다시 불러오거나 파일을 다시 넣으면 보여요.'
const EXAMPLE_TEXT =
  'ESWT7을 시작하고 3일째와 6일째에 또 받았어요. 7일 안에 2번 더 받았으니 다시 받은 환자 1명, 더 받은 횟수 2번으로 들어가요. 8일째에 받은 것은 7일이 지난 뒤라 7일 안에는 넣지 않아요.'
const COLUMNS = 'lg:grid-cols-[minmax(150px,1fr)_minmax(200px,1.5fr)_136px_132px_112px]'

type Options = { picks?: RxLine[]; days?: DayPayload[]; covered?: DateRange[]; period?: StatsPeriod; win?: AgainWindow; daysState?: AgainDaysState }
function inputOf({ days = DAYS, covered = ALL, period = '30d' }: Options = {}): StatsInput {
  return { days, covered, range: statsRange(TODAY, period) }
}
function draw(options: Options = {}) {
  const onWin = vi.fn()
  const onRetryDays = vi.fn()
  const { picks = [PICK_A, PICK_B], win = 7, daysState = 'ready' } = options
  const view = render(<RxPickAgain picks={picks} input={inputOf(options)} win={win} onWin={onWin} daysState={daysState} onRetryDays={onRetryDays} />)
  return { ...view, onWin, onRetryDays }
}

// 고른 날 수를 들고 있는 부모(TASK-9의 RxPickerSection과 같은 자리)
function Live({ picks = [PICK_A, PICK_B] }: { picks?: RxLine[] }) {
  const [win, setWin] = useState<AgainWindow>(7)
  return <RxPickAgain picks={picks} input={inputOf()} win={win} onWin={setWin} daysState="ready" onRetryDays={() => {}} />
}

const sectionOf = (container: HTMLElement) => container.querySelector('section') as HTMLElement
// <details>도 role group이라 이름표로 찾는다
const winGroup = () => screen.getByRole('group', { name: '시작하고' })
const winButton = (w: AgainWindow) => screen.getByRole('button', { name: `${w}일 안` })
const colsOf = (container: HTMLElement) => container.querySelector('[aria-hidden="true"].h-9') as HTMLElement | null
const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement
const stripOf = (container: HTMLElement) => container.querySelector('[aria-hidden="true"].h-3') as HTMLElement | null
const notesOf = (container: HTMLElement) => container.querySelector('div.max-w-160') as HTMLElement | null
const hasClasses = (el: Element, classes: string) => classes.split(/\s+/).every((name) => el.classList.contains(name))
const detailsOf = (container: HTMLElement) => container.querySelector('details') as HTMLDetailsElement
const rateOf = (row: HTMLElement) => row.querySelector('.text-lead.font-semibold') as HTMLElement
// "어떻게 세나요?" 접는 칸(stats-pc-ux AC-4004.2 ③): 설명 글·한 환자 예시·표 아래 안내가 이 칸 안이다. 처음 접혀 있어 role로 찾으려면 먼저 편다
const howButton = () => screen.getByRole('button', { name: '어떻게 세나요?' })
const queryHow = () => screen.queryByRole('button', { name: '어떻게 세나요?' })
const howBody = () => document.getElementById(howButton().getAttribute('aria-controls')!)!
const openHow = () => fireEvent.click(howButton())

afterEach(cleanup)

describe('AC-1307.1: 머리', () => {
  it('AC-1307.1: 위 1px line-strong 선과 h3 `같은 처방 재방문`, 옆 설명이 있다', () => {
    const { container } = draw()
    const section = sectionOf(container)
    expect(hasClasses(section, 'border-t border-line-strong')).toBe(true)
    const title = screen.getByRole('heading', { level: 3, name: '같은 처방 재방문' })
    expect(section.getAttribute('aria-labelledby')).toBe(title.id)
    expect(screen.getByText('고른 처방을 시작한 환자가 같은 처방을 다시 받으러 왔는지 봐요')).toBeTruthy()
  })

  it('AC-1307.1: 시안에서만 쓰는 것(새 칸 칩·시안 조작 줄·제가 정한 부분·예시 칩·건수 줄)이 없다', () => {
    const { container } = draw()
    const text = container.textContent ?? ''
    for (const word of ['새 칸', '시안에서만 보이는 줄', '제가 정한 부분', '지금 있는 표예요', '건수']) expect(text, word).not.toContain(word)
    expect(screen.queryByText('예시', { exact: true })).toBeNull()
  })
})

describe('AC-1307.2: 고른 처방이 없음', () => {
  it('AC-1307.2: 머리 아래 한 줄만 있고 단추·표·예시가 없다', () => {
    const { container } = draw({ picks: [] })
    expect(screen.getByText(EMPTY_LINE)).toBeTruthy()
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryByRole('group')).toBeNull()
    expect(container.querySelector('details')).toBeNull()
    expect(container.querySelector('li')).toBeNull()
    expect(sectionOf(container).children).toHaveLength(2)
  })
})

describe('AC-1307.3: 날 수 단추', () => {
  it('AC-1307.3: `시작하고` 이름표와 단추 묶음(aria-labelledby) 7일 안·14일 안·30일 안, 고른 것이 aria-pressed다', () => {
    draw({ win: 14 })
    const group = winGroup()
    const label = document.getElementById(group.getAttribute('aria-labelledby') ?? '')
    expect(label?.textContent).toBe('시작하고')
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['7일 안', '14일 안', '30일 안'])
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
  })

  it('AC-1307.3: 모양은 기간 단추와 같다(묶음 테두리·30px 단추·고른 것 accent-soft)', () => {
    draw({ win: 7 })
    const group = winGroup()
    expect(hasClasses(group, 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface')).toBe(true)
    const shape = 'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
    for (const w of [7, 14, 30] as const) expect(hasClasses(winButton(w), shape), `${w}`).toBe(true)
    expect(hasClasses(winButton(7), 'bg-accent-soft font-semibold text-accent-strong')).toBe(true)
    expect(hasClasses(winButton(14), 'font-medium text-ink-2 hover:bg-canvas')).toBe(true)
  })

  it('AC-1307.3: 누르면 onWin(w)다', () => {
    const { onWin } = draw()
    fireEvent.click(winButton(30))
    expect(onWin).toHaveBeenCalledWith(30)
    fireEvent.click(winButton(14))
    expect(onWin).toHaveBeenLastCalledWith(14)
  })

  it('AC-1307.3: 누른 뒤 초점은 누른 단추에 남는다', () => {
    render(<Live />)
    const button = winButton(14)
    button.focus()
    fireEvent.click(button)
    expect(winButton(14).getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(winButton(14))
  })
})

describe('AC-1307.4: 어떻게 세나요', () => {
  it.each([7, 14, 30] as const)('AC-1307.4·AC-4004.4: %i일이면 굵은 머리 `어떻게 세나요` 없이 그 날 수의 설명 글이 접는 칸 안에 그대로 있다', (w) => {
    draw({ win: w })
    expect(screen.queryByText('어떻게 세나요')).toBeNull()
    const how = screen.getByText(`기간 안에 그 처방을 새로 시작한 환자를 모아, 다음 날부터 ${w}일 안에 같은 처방을 또 받았는지 봐요. 새로 시작한 날은 앞 30일 동안 그 처방을 받지 않은 날이에요.`)
    expect(how.tagName).toBe('P')
    expect(how.querySelector('.font-semibold')).toBeNull()
    expect(howBody().contains(how)).toBe(true)
    expect(hasClasses(how, 'max-w-160 text-small text-ink-2')).toBe(true)
  })
})

describe('AC-1307.5: 한 환자 예시', () => {
  it('AC-1307.5: 처음에 열려 있고 요약은 `한 환자로 예를 들면 (7일 안)`이다', () => {
    const { container } = draw()
    const details = detailsOf(container)
    expect(details.open).toBe(true)
    expect(details.querySelector('summary')?.textContent).toBe('한 환자로 예를 들면 (7일 안)')
  })

  it('AC-1307.5·AC-4004.2: 9칸 목록(시작·1일째 ~ 8일째), 받은 칸은 시작·3일째·6일째·8일째이고 칸마다 role="img" 이름이 있다', () => {
    draw()
    openHow()
    const list = screen.getByRole('list', { name: '한 환자의 9일' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.firstElementChild?.textContent)).toEqual(['시작', '1일째', '2일째', '3일째', '4일째', '5일째', '6일째', '7일째', '8일째'])
    const marks = within(list).getAllByRole('img')
    const got = [0, 3, 6, 8]
    expect(marks.map((m) => m.getAttribute('aria-label'))).toEqual(items.map((_, i) => (got.includes(i) ? 'ESWT7 받음' : '안 옴')))
    expect(hasClasses(marks[0]!, 'bg-accent border-accent')).toBe(true)
    expect(marks[1]!.classList.contains('bg-accent')).toBe(false)
    expect(hasClasses(items[0]!.firstElementChild!, 'font-semibold text-ink')).toBe(true)
  })

  it('AC-1307.5·AC-4004.2: 8일째 칸은 흐리고(muted) 받은 표시가 점선 네모다', () => {
    draw()
    openHow()
    const items = within(screen.getByRole('list', { name: '한 환자의 9일' })).getAllByRole('listitem')
    const late = items[8]!
    expect(late.classList.contains('text-muted')).toBe(true)
    const mark = within(late).getByRole('img')
    expect(hasClasses(mark, 'border-dashed border-muted bg-surface')).toBe(true)
    expect(mark.classList.contains('bg-accent')).toBe(false)
  })

  it('AC-1307.5: 7일 칸 아래 `지켜보는 7일` 띠(aria-hidden)와 설명 글이 있다', () => {
    draw()
    const band = screen.getByText('지켜보는 7일')
    expect(band.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(band.classList.contains('col-[2/9]')).toBe(true)
    expect(screen.getByText(EXAMPLE_TEXT)).toBeTruthy()
  })

  it('AC-1307.5: 고른 날 수와 상관없이 7일 예시다', () => {
    const { container } = draw({ win: 30 })
    expect(detailsOf(container).querySelector('summary')?.textContent).toBe('한 환자로 예를 들면 (7일 안)')
    expect(screen.getByText('지켜보는 7일')).toBeTruthy()
    expect(screen.getByText(EXAMPLE_TEXT)).toBeTruthy()
  })

  it('AC-1307.5: 닫으면 날 수를 바꾸거나 고른 처방이 비었다 다시 생겨도 이 화면 안에서는 닫힌 채다', () => {
    const { container, rerender } = render(<Live />)
    const details = detailsOf(container)
    details.open = false
    fireEvent(details, new Event('toggle'))
    fireEvent.click(winButton(30))
    expect(detailsOf(container).open).toBe(false)
    rerender(<Live picks={[]} />)
    expect(container.querySelector('details')).toBeNull()
    rerender(<Live picks={[PICK_A]} />)
    expect(detailsOf(container).open).toBe(false)
  })
})

describe('AC-1307.6: 센 범위 글·띠·범례', () => {
  it('AC-1307.6: 옮기지 않은 기간은 가운데가 굵은 세 조각 글이다', () => {
    draw()
    const strong = screen.getByText('10월 6일 – 10월 28일')
    expect(hasClasses(strong, 'font-semibold')).toBe(true)
    expect(strong.parentElement?.textContent).toBe('10월 6일 – 10월 28일에 시작한 환자로 셌어요. 시작하고 7일이 안 지난 10월 29일 – 11월 4일은 아직 셀 수 없어요.')
  })

  it('AC-1307.6: 옮긴 기간(최근 7일)은 앞 글에 기간 이름이 들어간다', () => {
    draw({ period: '7d', days: [day('2026-10-24', { ready: READY_ALL })] })
    const strong = screen.getByText('10월 22일 – 10월 28일')
    expect(strong.parentElement?.textContent).toBe(
      '최근 7일(10월 29일 – 11월 4일)에 시작한 환자는 아직 7일이 다 지나지 않았어요. 그래서 7일이 다 지난 가장 최근 7일, 10월 22일 – 10월 28일에 시작한 환자로 봤어요.',
    )
  })

  it('AC-1307.6: 센 범위 안에 셀 수 없는 날이 있으면 뒤에 그 날 수가 붙는다', () => {
    draw({ days: [...DAYS, day('2026-10-12')] })
    expect(screen.getByText('10월 6일 – 10월 28일').parentElement?.textContent).toContain(
      ' 그 안에서도 1일은 셀 수 없어요(따로 넣은 파일의 끝 무렵, 이 칸이 생기기 전에 저장한 날 등).',
    )
  })

  it('AC-1307.6: 띠는 높이 12px·조각 사이 1px·aria-hidden이고 조각은 날 수만큼 폭이다(ok accent · no 주황 빗금 · out line)', () => {
    const { container } = draw({ period: '7d', win: 14, days: [day('2026-10-16', { ready: READY_ALL })] })
    const strip = stripOf(container)!
    expect(strip.getAttribute('aria-hidden')).toBe('true')
    expect(hasClasses(strip, 'flex h-3 gap-px')).toBe(true)
    const runs = Array.from(strip.children) as HTMLElement[]
    expect(runs).toHaveLength(3) // ok 7(10-15 ~ 10-21) · out 7(10-22 ~ 10-28) · no 7(10-29 ~ 11-04)
    expect(runs[0]!.classList.contains('bg-accent')).toBe(true)
    expect(runs[1]!.classList.contains('bg-line')).toBe(true)
    expect(hasClasses(runs[2]!, 'bg-warning-soft text-warning')).toBe(true)
    const path = runs[2]!.querySelector('svg path')
    expect(path?.getAttribute('stroke')).toBe('currentColor')
    expect(path?.getAttribute('d')).toMatch(/^M0 4 L4 0 M0 8 L8 0 /)
    expect(path?.getAttribute('d')).toContain('M0 1200 L1200 0')
    for (const run of runs) expect(parseFloat(run.style.width)).toBeCloseTo(33.33, 1)
  })

  it('AC-1307.6: 띠 양 끝 날짜(aria-hidden)와 범례가 차례대로 있고 기간 밖은 있을 때만이다', () => {
    const { container } = draw({ period: '7d', win: 14, days: [day('2026-10-16', { ready: READY_ALL })] })
    const ends = stripOf(container)!.nextElementSibling as HTMLElement
    expect(ends.getAttribute('aria-hidden')).toBe('true')
    expect(Array.from(ends.children).map((el) => el.textContent)).toEqual(['10월 15일', '11월 4일'])
    const legend = ends.nextElementSibling as HTMLElement
    expect(Array.from(legend.children).map((el) => el.textContent)).toEqual(['센 날 7일', '아직 셀 수 없는 날 7일', '기간 밖 7일'])
    cleanup()
    const again = draw()
    const legend30 = stripOf(again.container)!.nextElementSibling!.nextElementSibling!
    expect(Array.from(legend30.children).map((el) => el.textContent)).toEqual(['센 날 23일', '아직 셀 수 없는 날 7일'])
  })

  it('AC-1307.6: 띠 끝 날짜는 오늘과 해가 다르면 해를 붙인다', () => {
    const { container } = draw({ period: '12m', days: [day('2026-03-03', { ready: READY_ALL })] })
    const ends = stripOf(container)!.nextElementSibling!
    expect(Array.from(ends.children).map((el) => el.textContent)).toEqual(['2025년 12월 1일', '11월 4일'])
  })
})

describe('AC-1307.7: 넓은 화면의 표', () => {
  it.each([7, 14, 30] as const)('AC-1307.7: %i일 칸 머리(aria-hidden)는 처방·재방문율·시작한 환자 중·더 받은 횟수·아직 셀 수 없음이다', (w) => {
    const { container } = draw({ win: w })
    const cols = colsOf(container)!
    expect(cols.getAttribute('aria-hidden')).toBe('true')
    expect(Array.from(cols.children).map((el) => el.textContent)).toEqual(['처방', `${w}일 안 재방문율`, '시작한 환자 중', '더 받은 횟수', '아직 셀 수 없음'])
    expect(Array.from(cols.children).map((el) => el.classList.contains('text-right'))).toEqual([false, false, true, true, true])
  })

  it('AC-1307.7: 칸 폭은 머리와 줄이 같다(다섯 칸, 사이 16px)', () => {
    const { container } = draw()
    expect(hasClasses(colsOf(container)!, `${COLUMNS} gap-x-4`)).toBe(true)
    expect(hasClasses(rowOf(B), `${COLUMNS} gap-x-4`)).toBe(true)
  })

  it('AC-1307.7: 줄은 이름(600)·코드(caption muted), 비율(16px 600 오른쪽)·6px 막대, 시작한 환자 중, 평균(600), 기다림이다', () => {
    draw()
    const row = rowOf(B)
    expect(screen.getByText(B).classList.contains('font-semibold')).toBe(true)
    expect(hasClasses(within(row).getByText('RB'), 'text-caption text-muted')).toBe(true)
    const rate = rateOf(row)
    expect(rate.textContent).toBe('50.0%')
    expect(hasClasses(rate, 'text-lead font-semibold text-right')).toBe(true)
    const meter = rate.parentElement!.querySelector('[aria-hidden="true"].h-1\\.5') as HTMLElement
    expect(meter.classList.contains('bg-line')).toBe(true)
    const fill = meter.firstElementChild as HTMLElement
    expect(fill.classList.contains('bg-accent')).toBe(true)
    expect(parseFloat(fill.style.width)).toBe(50)
    expect(within(row).getByText('12명 중 6명', { exact: false })).toBeTruthy()
    const avg = within(row).getByText('평균 0.7번 더')
    expect(avg.classList.contains('font-semibold')).toBe(true)
    expect(row.textContent).toContain('4명')
  })

  it('AC-1307.7: 숫자는 againView 그대로다(14일이면 14일 창)', () => {
    draw({ win: 14 })
    const row = rowOf(A)
    expect(rateOf(row).textContent).toBe('33.3%')
    expect(row.textContent).toContain('3명 중 1명')
    expect(within(row).getByText('평균 1.0번 더')).toBeTruthy()
    expect(row.textContent).toMatch(/아직 셀 수 없음 ?2명$/) // 10-31 시작 2명
  })

  it('AC-1307.7: 화면 읽기는 넓은 화면에서도 칸 이름을 읽는다', () => {
    draw({ win: 14 })
    const row = rowOf(B)
    for (const name of ['14일 안 재방문율', '시작한 환자', '아직 셀 수 없음']) {
      const label = within(row).getByText(name)
      expect(label.closest('[aria-hidden="true"]'), name).toBeNull()
      expect(label.classList.contains('sr-only') || label.classList.contains('lg:sr-only'), name).toBe(true)
    }
  })

  it('AC-1307.7: 이름이 빈 글자이거나 코드와 같으면 코드 하나만 보인다', () => {
    draw({ picks: [{ code: 'RD', name: '' }, { code: 'RE', name: 'RE' }] })
    for (const code of ['RD', 'RE']) {
      const cell = screen.getByText(code)
      expect(cell.classList.contains('font-semibold')).toBe(true)
      expect(cell.parentElement?.textContent).toBe(code)
    }
  })
})

describe('AC-1307.8: 적은 수와 0명', () => {
  it('AC-1307.8: 시작한 환자 1 ~ 9명이면 이름 옆 `10명 미만` 칩, 비율·평균 muted, 막대는 파란 빗금이다', () => {
    draw()
    const row = rowOf(A)
    const chip = within(row).getByText('10명 미만')
    expect(chip.className).toBe(ds.chip.neutral)
    expect(chip.parentElement).toBe(screen.getByText(A).parentElement)
    expect(rateOf(row).classList.contains('text-muted')).toBe(true)
    expect(within(row).getByText('평균 0.6번 더').classList.contains('text-muted')).toBe(true)
    const fill = rateOf(row).parentElement!.querySelector('[aria-hidden="true"].h-1\\.5')!.firstElementChild as HTMLElement
    expect(fill.classList.contains('text-accent')).toBe(true)
    expect(fill.classList.contains('bg-accent')).toBe(false)
    expect(fill.querySelector('svg path')?.getAttribute('stroke')).toBe('currentColor')
    expect(parseFloat(fill.style.width)).toBe(33.3)
  })

  it('AC-1307.8: 10명 이상이면 칩이 없고 글자는 muted가 아니다', () => {
    draw()
    const row = rowOf(B)
    expect(within(row).queryByText('10명 미만')).toBeNull()
    expect(rateOf(row).classList.contains('text-muted')).toBe(false)
    expect(within(row).getByText('평균 0.7번 더').classList.contains('text-muted')).toBe(false)
  })

  it('AC-1307.8: 0명이면 비율 `–`·`시작한 환자 0명`·평균 `–`(muted)이고 막대는 빈 막대다', () => {
    draw({ picks: [PICK_C] })
    const row = rowOf(C)
    expect(within(row).queryByText('10명 미만')).toBeNull()
    const dashes = within(row).getAllByText('–')
    expect(dashes).toHaveLength(2)
    for (const dash of dashes) expect(dash.classList.contains('text-muted')).toBe(true)
    expect(within(row).getByText('시작한 환자 0명')).toBeTruthy()
    for (const meter of row.querySelectorAll('[aria-hidden="true"].h-1\\.5')) expect(meter.children).toHaveLength(0)
  })
})

describe('AC-1307.9: 표 아래 안내', () => {
  const NOTES = (w: number) => [
    ['아직 셀 수 없는 날', `시작하고 ${w}일이 다 지나야 셀 수 있어요. 날이 지나고 새 자료를 넣으면 채워져요.`],
    ['파일을 따로 넣을 때', '앞 파일 끝 무렵에 시작한 환자가 뒤 파일에서 다시 받은 것은 이어서 세지 못해요. 두 파일을 한 번에 같이 넣으면 이어서 세요. 비트 PC에서 불러오면 불러온 기간 안에서 이어서 세요.'],
    ['자료 첫 30일', '그 전 기록이 없어서, 전부터 받던 환자도 새로 시작한 것처럼 잡힐 수 있어요.'],
    ['10명 미만', '시작한 환자가 적으면 한두 명에 비율이 크게 바뀌어요. 참고만 해 주세요.'],
    ['신환 재방문율과 달라요', '위쪽 신환 재방문율은 처음 온 환자가 아무 진료로나 다시 온 비율이에요. 이 칸은 신환·재진 모두, 고른 처방을 다시 받았는지만 봐요.'],
    ['환자 번호', '의원 PC 밖으로 나가지 않아요. 자료를 넣을 때 그 PC 안에서 세고, 날마다 몇 명인지만 저장해요.'],
  ]
  const partsOf = (notes: HTMLElement) => Array.from(notes.children).map((p) => [p.firstElementChild?.textContent, p.textContent?.slice(p.firstElementChild?.textContent?.length)])

  it('AC-1307.9: 글 폭 max-w-160에 굵은 이름 + 글이 차례대로 있다(10명 미만 줄이 있으면 그 안내도)', () => {
    const { container } = draw({ win: 14 })
    const notes = notesOf(container)!
    expect(partsOf(notes)).toEqual(NOTES(14))
    for (const p of notes.children) expect(p.firstElementChild?.classList.contains('font-semibold')).toBe(true)
  })

  it('AC-1307.9: 10명 미만 줄이 없으면 그 안내가 없다', () => {
    const { container } = draw({ picks: [PICK_B, PICK_C] })
    expect(partsOf(notesOf(container)!)).toEqual(NOTES(7).filter(([name]) => name !== '10명 미만'))
  })

  it('AC-1307.9: 합계 줄·지난 기간 칸이 없다', () => {
    const { container } = draw()
    expect(screen.queryByText(/합계/)).toBeNull()
    expect(container.textContent).not.toMatch(/지난 30일|비교/)
  })
})

describe('AC-1307.10: 시안에 없는 상태', () => {
  const noNumbers = (container: HTMLElement) => {
    expect(stripOf(container)).toBeNull()
    expect(colsOf(container)).toBeNull()
    expect(notesOf(container)).toBeNull()
    expect(container.textContent).not.toMatch(/%|명 중/)
  }

  it('AC-1307.10: 날 줄을 더 읽는 중이면 role="status" 한 줄이고 숫자가 없다(단추는 그대로)', () => {
    const { container } = draw({ daysState: 'reading' })
    expect(screen.getByRole('status').textContent).toBe(READING)
    noNumbers(container)
    expect(winGroup()).toBeTruthy()
  })

  it('AC-1307.10: 실패하면 ErrorCard(E-STATS-READ-FAILED) + [다시 읽기]이고 누르면 onRetryDays다', () => {
    const { container, onRetryDays } = draw({ daysState: 'failed' })
    expect(within(screen.getByRole('alert')).getByText('오류 번호 E-STATS-READ-FAILED')).toBeTruthy()
    noNumbers(container)
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(onRetryDays).toHaveBeenCalledTimes(1)
  })

  it('AC-1307.10: 띠 범위에 날 줄이 없으면 이 기간 자료 없음 한 줄이다', () => {
    const { container } = draw({ days: [day('2026-09-01', { ready: READY_ALL })] })
    expect(container.textContent).toContain(NO_RANGE)
    noNumbers(container)
  })

  it('AC-1307.10: 줄은 있는데 again이 하나도 없으면 세기 전에 저장했다는 한 줄이다', () => {
    const { container } = draw({ days: [day('2026-10-10'), day('2026-10-20')] })
    expect(container.textContent).toContain(BEFORE_AGAIN)
    expect(container.textContent).not.toContain(NO_RANGE)
    noNumbers(container)
  })

  it('AC-1307.10: 숫자가 있으면 상태 줄이 없다', () => {
    const { container } = draw()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(container.textContent).not.toContain(NO_RANGE)
    expect(container.textContent).not.toContain(BEFORE_AGAIN)
  })
})

describe('AC-1307.11: 1024px 미만', () => {
  it('AC-1307.11: 칸 머리가 없고 처방 하나가 네 줄(이름 · 비율과 평균 · 전체 폭 막대 · 시작한 환자 중과 기다림)로 쌓인다', () => {
    const { container } = draw()
    expect(colsOf(container)!.classList.contains('max-lg:hidden')).toBe(true)
    const row = rowOf(A)
    expect(row.classList.contains('max-lg:grid-cols-[minmax(0,1fr)_auto]')).toBe(true)
    const cells = Array.from(row.children) as HTMLElement[]
    expect(cells[0]!.classList.contains('max-lg:col-span-2')).toBe(true)
    const rate = rateOf(row)
    expect(hasClasses(rate, 'max-lg:text-heading-m max-lg:text-left')).toBe(true)
    const tag = within(row).getByText('다시 받음')
    expect(hasClasses(tag, 'text-muted lg:hidden')).toBe(true)
    expect(hasClasses(rate.parentElement!, 'max-lg:col-start-1 max-lg:row-start-2')).toBe(true)
    const avg = within(row).getByText('평균 0.6번 더')
    expect(hasClasses(avg, 'font-semibold max-lg:col-start-2 max-lg:row-start-2 max-lg:text-lead')).toBe(true)
    const bars = row.querySelectorAll('[aria-hidden="true"].h-1\\.5')
    expect(bars).toHaveLength(2) // 넓으면 비율 옆, 좁으면 셋째 줄 전체 폭
    expect(bars[0]!.classList.contains('max-lg:hidden')).toBe(true)
    expect(hasClasses(bars[1]!.parentElement!, 'lg:hidden max-lg:col-span-2 max-lg:row-start-3')).toBe(true)
    const of = within(row).getByText('3명 중 1명', { exact: false })
    expect(hasClasses(of, 'max-lg:col-start-1 max-lg:row-start-4 max-lg:text-left')).toBe(true)
    const waitLabel = within(row).getByText('아직 셀 수 없음')
    expect(waitLabel.classList.contains('lg:sr-only')).toBe(true)
    expect(hasClasses(waitLabel.parentElement!, 'max-lg:col-start-2 max-lg:row-start-4 text-right')).toBe(true)
  })

  it('AC-1307.11: 표를 옆으로 밀지 않는다(overflow-x 없음)', () => {
    const { container } = draw()
    const all = [container, ...container.querySelectorAll('*')]
    for (const el of all) expect(el.getAttribute('class') ?? '').not.toMatch(/overflow-(?:x-)?(?:auto|scroll)/)
  })

  it('AC-1307.11: 768px 미만이면 날 수 단추는 셋이 같은 폭으로 전체 폭·44px, 예시 요약·오류 카드 단추는 44px 이상이다', () => {
    const { container } = draw()
    expect(hasClasses(winGroup(), 'max-md:grid max-md:w-full max-md:grid-cols-3')).toBe(true)
    for (const w of [7, 14, 30] as const) expect(winButton(w).classList.contains('max-md:h-11')).toBe(true)
    expect(detailsOf(container).querySelector('summary')!.classList.contains('max-md:min-h-11')).toBe(true)
    cleanup()
    draw({ daysState: 'failed' })
    const retry = screen.getByRole('button', { name: '다시 읽기' })
    expect(hasClasses(retry, 'max-md:h-11 max-md:w-full')).toBe(true)
  })
})

// 클래스 하나를 앞말(변형)과 본말로 나눈다. 대괄호 안의 ':'는 나누지 않는다
function splitClass(token: string): { variants: string[]; utility: string } {
  const parts: string[] = []
  let depth = 0
  let now = ''
  for (const ch of token) {
    if (ch === '[') depth += 1
    if (ch === ']') depth -= 1
    if (ch === ':' && depth === 0) {
      parts.push(now)
      now = ''
    } else now += ch
  }
  return { variants: parts, utility: now.replace(/^!/, '').replace(/^-/, '') }
}
const SPACE_STEPS = new Set(['0', '0.5', '1', '1.5', '2', '3', '4', '5', '6', '8', '12', '16', '24', 'px'])
const SPACING = /^(?:gap-x|gap-y|gap|space-x|space-y|px|py|pt|pr|pb|pl|p|mx|my|mt|mr|mb|ml|m)-(.+)$/
const TEXT_OK = /^text-(?:caption|small|body|lead|subtitle|title|heading-m|heading|metric|display-m|display|canvas|surface|muted|ink-2|ink|accent|accent-strong|positive|negative|warning|left|center|right|wrap|nowrap|balance)$/
function classBreaks(root: Element): string[] {
  const out: string[] = []
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const token of (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) {
      const { variants, utility } = splitClass(token)
      const spacing = utility.match(SPACING)
      if (spacing && !SPACE_STEPS.has(spacing[1]!) && spacing[1] !== 'auto') out.push(`${token} 간격`)
      if (/^text-/.test(utility) && !TEXT_OK.test(utility)) out.push(`${token} 글자`)
      if (/^rounded/.test(utility) && utility !== 'rounded-control') out.push(`${token} 모서리`)
      if (/^(?:bg-(?:linear|radial|conic|gradient)|from-|via-|to-|backdrop-|blur|animate-|shadow)/.test(utility)) out.push(`${token} 꾸밈`)
      if (utility === 'overflow-hidden') out.push(`${token} overflow-clip`)
      for (const v of variants) if (/^(?:max-|min-)?(?:sm|xl|\d*xl)$/.test(v) || /^(?:min|max)-\[/.test(v)) out.push(`${token} 폭 접두사`)
    }
  }
  return out
}

describe('AC-1307.12: 상자·초점·규칙', () => {
  it.each([
    ['숫자', {}],
    ['고른 처방 없음', { picks: [] }],
    ['읽는 중', { daysState: 'reading' }],
    ['읽기 실패', { daysState: 'failed' }],
    ['자료 없음', { days: [] }],
  ] as [string, Options][])('AC-1307.12: %s — 상자 안 상자가 없고 간격·글자·모서리·폭 규칙을 지키며 그라데이션이 없다', (_, options) => {
    const { container } = draw(options)
    expect(nestedBoxes(container)).toEqual([])
    expect(classBreaks(container)).toEqual([])
  })

  it('AC-1307.12: 예시 요약과 [다시 읽기]의 초점 고리는 ds.focusRing이다', () => {
    const { container } = draw()
    expect(hasClasses(detailsOf(container).querySelector('summary')!, ds.focusRing)).toBe(true)
    cleanup()
    draw({ daysState: 'failed' })
    expect(hasClasses(screen.getByRole('button', { name: '다시 읽기' }), ds.focusRing)).toBe(true)
  })

  it('AC-1307.12: 소스(주석 빼고)에 그라데이션·색 값·저장 코드·훅 부름이 없다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/stats/sections/RxPickAgain.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
    expect(text).not.toMatch(/gradient|#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/)
    expect(text).not.toMatch(/@\/lib\/storage|useAgainDays|useRxPicks|useStatsData/)
  })
})

// ── 고른 기간 (stats-period AC-1705.4). 오늘은 2026-11-05로 둔다 ─────────────────
describe('AC-1705.4: 고른 기간의 같은 처방 재방문', () => {
  const pickInput = (month: string, days: DayPayload[]): StatsInput => ({ days, covered: ALL, range: rangeOf(TODAY, { kind: 'month', unit: 'day', month }, false) })
  const drawPick = (input: StatsInput) =>
    render(<RxPickAgain picks={[PICK_A, PICK_B]} input={input} win={7} onWin={() => {}} daysState="ready" onRetryDays={() => {}} />)

  it('AC-1705.4: 센 범위 글은 고른 기간 이름(range.name)으로 낸 againBaseText 글이다', () => {
    const input = pickInput('2026-10', DAYS)
    const { container } = drawPick(input)
    const base = againBaseText(againView(input, 7, [PICK_A, PICK_B]), input.range, '2026년 10월')
    const text = `${base.lead}${base.strong}${base.tail}`
    expect(Array.from(container.querySelectorAll('p')).some((p) => p.textContent === text)).toBe(true)
  })

  it('AC-1705.4: 창이 다 지난 날이 없으면 "{name}에 시작한 환자는 아직 {창}일이 다 지나지 않아 셀 수 없어요." 한 글이다(굵은 글이 없다)', () => {
    const nov = [day('2026-11-02', { ready: READY_NONE, rx: [ag('RA', 2, [null, null, null], [null, null, null])] })]
    drawPick(pickInput('2026-11', nov))
    const line = screen.getByText('2026년 11월에 시작한 환자는 아직 7일이 다 지나지 않아 셀 수 없어요.')
    expect(line.querySelector('.font-semibold')).toBeNull()
  })
})

// ── stats-pc-ux: 같은 처방 재방문 설명 접기 (REQ-4004 AC-4004.2 ③·AC-4004.4, 기본값 10) ─────────────────
describe('AC-4004.2 ③·AC-4004.4: 같은 처방 재방문 설명 접기', () => {
  const HOW_TEXT = (w: number) => `기간 안에 그 처방을 새로 시작한 환자를 모아, 다음 날부터 ${w}일 안에 같은 처방을 또 받았는지 봐요. 새로 시작한 날은 앞 30일 동안 그 처방을 받지 않은 날이에요.`
  const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  const winRow = () => winGroup().parentElement!

  it('AC-4004.4: 날 수 단추 바로 아래가 센 범위 글 · 기간 막대이고 그 뒤가 표다(설명 글·예시가 위에 없다)', () => {
    const { container } = draw()
    const base = winRow().nextElementSibling!
    expect(base.textContent).toBe('10월 6일 – 10월 28일에 시작한 환자로 셌어요. 시작하고 7일이 안 지난 10월 29일 – 11월 4일은 아직 셀 수 없어요.')
    expect(base.nextElementSibling).toBe(stripOf(container))
    expect(follows(stripOf(container)!, colsOf(container)!)).toBe(true)
    expect(follows(rowOf(B), detailsOf(container))).toBe(true)
  })

  it('AC-4004.2: 접는 칸은 칸 맨 아래이고 처음 접혀 있다. 안은 설명 글 · 한 환자 예시 · 표 아래 안내 차례다', () => {
    const { container } = draw({ win: 14 })
    expect(sectionOf(container).lastElementChild!.contains(howButton())).toBe(true)
    expect(howButton().getAttribute('aria-expanded')).toBe('false')
    const body = howBody()
    expect(body.hidden).toBe(true)
    const kids = Array.from(body.children)
    expect(kids).toHaveLength(3)
    expect(kids[0]!.textContent).toBe(HOW_TEXT(14))
    expect(kids[1]).toBe(detailsOf(container))
    expect(kids[2]).toBe(notesOf(container))
    expect(follows(rowOf(B), howButton())).toBe(true)
  })

  it('AC-4004.2: 펼친 안의 한 환자 예시는 처음 열려 있다', () => {
    const { container } = draw()
    openHow()
    expect(howButton().getAttribute('aria-expanded')).toBe('true')
    expect(howBody().hidden).toBe(false)
    expect(howBody().contains(detailsOf(container))).toBe(true)
    expect(detailsOf(container).open).toBe(true)
    expect(screen.getByRole('list', { name: '한 환자의 9일' })).toBeTruthy()
  })

  it('AC-4004.2: 표 아래 안내는 10명 미만 줄이 있으면 여섯, 없으면 다섯이고 둘 다 접는 칸 안이다', () => {
    const { container } = draw()
    expect(notesOf(container)!.children).toHaveLength(6)
    expect(howBody().contains(notesOf(container))).toBe(true)
    cleanup()
    const fewless = draw({ picks: [PICK_B, PICK_C] })
    expect(notesOf(fewless.container)!.children).toHaveLength(5)
    expect(howBody().contains(notesOf(fewless.container))).toBe(true)
  })

  it.each([
    ['읽는 중', { daysState: 'reading' }],
    ['읽기 실패', { daysState: 'failed' }],
    ['이 기간 자료 없음', { days: [day('2026-09-01', { ready: READY_ALL })] }],
    ['세기 전에 저장', { days: [day('2026-10-10'), day('2026-10-20')] }],
  ] as [string, Options][])('AC-4004.4: %s — 표가 없으면 칸 맨 아래 접는 칸에 설명 글과 한 환자 예시만 있다', (_, options) => {
    const { container } = draw(options)
    expect(sectionOf(container).lastElementChild!.contains(howButton())).toBe(true)
    const kids = Array.from(howBody().children)
    expect(kids.map((kid) => kid.tagName)).toEqual(['P', 'DETAILS'])
    expect(kids[0]!.textContent).toBe(HOW_TEXT(7))
    expect(notesOf(container)).toBeNull()
    expect(howBody().textContent).not.toContain('파일을 따로 넣을 때')
  })

  it('AC-4004.4: 고른 처방이 없으면 접는 칸이 없다', () => {
    draw({ picks: [] })
    expect(queryHow()).toBeNull()
  })

  it('AC-4004.1: 접는 칸을 편 채 날 수를 바꾸거나 숫자를 더 읽는 중이 되어도 펼친 채다(같은 자리의 같은 부품)', () => {
    const props = { picks: [PICK_A, PICK_B], input: inputOf(), onWin: () => {}, onRetryDays: () => {} }
    const { rerender } = render(<RxPickAgain {...props} win={7} daysState="ready" />)
    openHow()
    rerender(<RxPickAgain {...props} win={14} daysState="reading" />)
    expect(howButton().getAttribute('aria-expanded')).toBe('true')
    rerender(<RxPickAgain {...props} win={14} daysState="ready" />)
    expect(howButton().getAttribute('aria-expanded')).toBe('true')
    expect(howBody().hidden).toBe(false)
  })
})
