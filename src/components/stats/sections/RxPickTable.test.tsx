// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Icon } from '@/components/common/Icon'
import { rxPickCopyText, rxPickTotal } from '@/components/stats/rxPickView'
import { rxPickRows, statsRange, type RxLine, type RxPickRow, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { addDays } from '@/lib/analytics/dates'
import { nestedBoxes } from '@/testing/boxes'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { RxPickTable } from './RxPickTable'

// 처방 골라 보기 표 (rx-picker REQ-805·808·809, AC-804.5·804.8). 숫자는 진짜 rxPickRows·rxPickTotal로 만들고, 처방·일 줄은 이 파일에서 지어낸 값이다. navigator.clipboard는 가짜다

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]
const NOW = '2026-11-02' // 최근 30일 안
const BEFORE = '2026-09-21' // 지난 30일 안
const A = '가짜 처방 가'
const B = '가짜 처방 나'
const PICK_A: RxLine = { code: 'RA', name: A }
const PICK_B: RxLine = { code: 'RB', name: B }
const MEANING = '신환율 = 신환 ÷ 건수 · 재진율 = 재진 ÷ 건수'
const GAP_SENTENCE = '어느 쪽에도 넣지 않아서 두 비율을 더해도 100%가 안 돼요.'
const COPIED = '복사했어요. 엑셀이나 메모에 붙여 넣을 수 있어요.'
const BLOCKED = '이 화면에서는 복사가 막혔어요. 아래 글을 직접 복사해 주세요.'

type Line = [code: string, patients: number, newPatients: number, returning: number]
const NAMES: Record<string, string> = { RA: A, RB: B, abc: '소문자 처방' }
function day(ymd: string, lines: Line[]): DayPayload {
  const rx = lines.map(([code, patients, newPatients, returning]) => ({ code, name: NAMES[code] ?? code, type: '', patients, newPatients, returning }))
  const sum = (of: (line: (typeof rx)[number]) => number) => rx.reduce((total, line) => total + of(line), 0)
  const [patients, newPatients, returning] = [sum((l) => l.patients), sum((l) => l.newPatients), sum((l) => l.returning)]
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients, newPatients, returning, unknown: patients - newPatients - returning },
    rx,
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}

// 지난 기간 50건, 이번 기간 120건(신환 30·재진 90). 구분 없음이 없다
const PLAIN = [day(BEFORE, [['RA', 50, 5, 45], ['RB', 10, 1, 9]]), day(NOW, [['RA', 120, 30, 90], ['RB', 40, 8, 32]])]
// 건수 7·신환 1·재진 5·구분 없음 1
const WITH_GAP = [day(NOW, [['RA', 7, 1, 5], ['RB', 40, 8, 32]])]

type Options = {
  period?: StatsPeriod
  covered?: DateRange[]
  today?: string
  opened?: ReadonlySet<string>
  onToggle?: (code: string) => void
  renderPanel?: (row: RxPickRow) => ReactNode
}
function draw(days: DayPayload[], picks: RxLine[], { period = '30d', covered = WHOLE, today = TODAY, opened = new Set(), onToggle = () => {}, renderPanel = (row) => <p>{`${row.name} 그래프`}</p> }: Options = {}) {
  const input: StatsInput = { days, covered, range: statsRange(today, period) }
  const rows = rxPickRows(input, picks)
  const total = rxPickTotal(rows)
  const view = render(<RxPickTable input={input} rows={rows} total={total} hospitalName="가짜 의원" opened={opened} onToggle={onToggle} renderPanel={renderPanel} />)
  return { ...view, input, rows, total }
}

const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(name) })
const headOf = (container: HTMLElement) => container.querySelector('[aria-hidden="true"].grid') as HTMLElement
const bandOf = (row: Element) => row.querySelector('[aria-hidden="true"].h-1\\.5') as HTMLElement
const notesOf = (container: HTMLElement) => Array.from(container.querySelector('.max-w-160')!.children).map((p) => p.textContent)
const hasClasses = (el: Element, classes: string) => classes.split(/\s+/).every((name) => el.classList.contains(name))

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function fakeClipboard(writeText: ((text: string) => Promise<void>) | null) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: writeText === null ? undefined : { writeText } })
}
const pressCopy = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '표 복사' }))
  })
}

afterEach(() => {
  cleanup()
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('AC-805.1·AC-805.2: 넓은 화면의 칸', () => {
  it.each([
    ['7d', '지난 7일'],
    ['30d', '지난 30일'],
    ['90d', '지난 90일'],
    ['12m', '작년 같은 달'],
  ] as const)('AC-805.1: %s 칸 머리는 처방·건수·%s·증감·신환·신환율·재진·재진율이고 화면 읽기에서 숨긴다', (period, name) => {
    const { container } = draw(PLAIN, [PICK_A], { period })
    const head = headOf(container)
    expect(Array.from(head.children).map((el) => el.textContent)).toEqual(['처방', '건수', name, '증감', '신환', '신환율', '재진', '재진율', ''])
    expect(head.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-805.1: 칸 폭은 머리와 줄이 같고 숫자 머리는 오른쪽 정렬이다', () => {
    const { container } = draw(PLAIN, [PICK_A])
    const widths = 'lg:grid-cols-[minmax(200px,1fr)_72px_104px_176px_64px_64px_64px_64px_16px]'
    const head = headOf(container)
    expect(head.classList.contains(widths)).toBe(true)
    expect(rowOf(A).classList.contains(widths)).toBe(true)
    const aligned = Array.from(head.children).map((el) => el.classList.contains('text-right'))
    expect(aligned).toEqual([false, true, true, false, true, true, true, true, false])
  })

  it('AC-805.1: 숫자 칸은 고정폭·오른쪽 정렬이다', () => {
    draw(PLAIN, [PICK_A])
    const row = rowOf(A)
    for (const text of ['120건', '50건', '30건', '25.0%', '90건', '75.0%']) {
      const cell = within(row).getByText(text)
      expect(hasClasses(cell, 'tabular-nums text-right'), text).toBe(true)
    }
  })

  it('AC-805.2: 처방 칸은 이름(600)과 코드(caption muted)다', () => {
    draw(PLAIN, [PICK_A])
    const row = rowOf(A)
    expect(within(row).getByText(A).classList.contains('font-semibold')).toBe(true)
    expect(hasClasses(within(row).getByText('RA'), 'text-caption text-muted')).toBe(true)
  })

  it('AC-805.2: 건수·비율은 600이고 지난 기간·신환·재진은 n건, 증감은 DeltaText(unit 건)다', () => {
    draw(PLAIN, [PICK_A])
    const row = rowOf(A)
    expect(within(row).getByText('120건').classList.contains('font-semibold')).toBe(true)
    expect(within(row).getByText('25.0%').classList.contains('font-semibold')).toBe(true)
    expect(within(row).getByText('75.0%').classList.contains('font-semibold')).toBe(true)
    expect(within(row).getByText('50건').classList.contains('font-semibold')).toBe(false)
    expect(within(row).getByText('30건').classList.contains('font-semibold')).toBe(false)
    expect(within(row).getByText('90건').classList.contains('font-semibold')).toBe(false)
    expect(within(row).getByText('70건 (+140.0%)').textContent).toBe('▲ 70건 (+140.0%)')
    expect(within(row).getByText('늘어남')).toBeTruthy()
  })

  it('AC-805.2: 넓은 화면에서도 화면 읽기는 칸 이름을 읽는다(글자는 있고 넓을 때만 숨긴다)', () => {
    draw(PLAIN, [PICK_A])
    const row = rowOf(A)
    for (const name of ['지난 30일', '신환', '재진']) {
      const label = within(row).getByText(name)
      expect(label.classList.contains('lg:sr-only'), name).toBe(true)
      expect(label.classList.contains('sr-only'), name).toBe(false)
    }
  })

  it('AC-803.5: 이름이 빈 글자이거나 코드와 같으면 표 줄에 코드 하나만 보인다', () => {
    draw([day(NOW, [['RC', 3, 1, 2]])], [{ code: 'RC', name: 'RC' }, { code: 'RD', name: '' }])
    const rows = screen.getAllByRole('button', { name: /^R[CD]/ })
    expect(within(rows[0]!).getAllByText('RC')).toHaveLength(1)
    expect(within(rows[1]!).getAllByText('RD')).toHaveLength(1)
  })
})

describe('AC-804.5·AC-804.8: 빈 줄과 견줄 수 없는 줄', () => {
  it('AC-804.5: 이 기간에 0건이면 줄이 남고 저장해 둔 이름 · 0건 · 비율 – · 빈 띠이며 비교 기간 5건이면 5건 (−100.0%) ▼이다', () => {
    draw([day(BEFORE, [['RA', 5, 1, 4]])], [PICK_A])
    const row = rowOf(A)
    expect(within(row).getAllByText('0건')).toHaveLength(3)
    expect(within(row).getAllByText('–')).toHaveLength(2)
    expect(within(row).getByText('5건')).toBeTruthy()
    expect(within(row).getByText('5건 (−100.0%)').textContent).toBe('▼ 5건 (−100.0%)')
    expect(bandOf(row).children).toHaveLength(0)
  })

  it('AC-804.5: 저장된 줄이 하나도 없고 비교 기간도 0건이면 지난 기간 0건 · 변화 없음이다', () => {
    draw([], [{ code: 'RZ', name: '없는 처방' }])
    const row = rowOf('없는 처방')
    expect(within(row).getAllByText('0건')).toHaveLength(4)
    expect(within(row).getByText('변화 없음')).toBeTruthy()
  })

  it('AC-804.8: 견줄 짝이 하나도 없으면 지난 기간 칸은 –이고 증감은 비교할 수 없음이다', () => {
    const { current } = statsRange(TODAY, '30d')
    draw(PLAIN, [PICK_A], { covered: [{ from: current.from, to: current.to }] })
    const row = rowOf(A)
    expect(within(row).getByText('–')).toBeTruthy()
    expect(within(row).getByText('비교할 수 없음')).toBeTruthy()
  })
})

describe('AC-805.3·AC-805.4·AC-805.5: 뜻 줄·범례·얇은 띠·구분 없음', () => {
  it('AC-805.3: 표 위에 뜻 줄과 범례(신환·재진)가 있고 구분 없음이 없으면 범례에도 없다', () => {
    const { container } = draw(PLAIN, [PICK_A])
    const meaning = screen.getByText(MEANING)
    const legend = meaning.parentElement!.querySelector('ul') as HTMLElement
    expect(Array.from(legend.children).map((li) => li.textContent)).toEqual(['신환', '재진'])
    expect(meaning.compareDocumentPosition(headOf(container)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-805.3: 구분 없음이 하나라도 있으면 범례에 구분 없음이 빗금 표시로 있다', () => {
    draw(WITH_GAP, [PICK_A, PICK_B])
    const legend = screen.getByText(MEANING).parentElement!.querySelector('ul') as HTMLElement
    expect(Array.from(legend.children).map((li) => li.textContent)).toEqual(['신환', '재진', '구분 없음'])
    expect(legend.lastElementChild!.querySelector('svg')!.classList.contains('text-warning')).toBe(true)
  })

  it('AC-805.4: 띠는 6px·aria-hidden이고 신환·재진·구분 없음이 건수 대비 폭으로 차례대로 있다', () => {
    draw(WITH_GAP, [PICK_A])
    const band = bandOf(rowOf(A))
    expect(band.getAttribute('aria-hidden')).toBe('true')
    const [first, second, third] = Array.from(band.children) as HTMLElement[]
    expect(first!.classList.contains('bg-accent')).toBe(true)
    expect(first!.style.width).toBe('14.29%')
    expect(second!.classList.contains('bg-chart-3')).toBe(true)
    expect(second!.style.width).toBe('71.43%')
    expect(third!.classList.contains('text-warning')).toBe(true)
    expect(third!.style.width).toBe('14.29%')
  })

  it('AC-805.4: 구분 없음 빗금은 파일 안 svg path이고 닿는 길이가 1200 이상이다(패턴·그라데이션 없음)', () => {
    draw(WITH_GAP, [PICK_A])
    const hatch = bandOf(rowOf(A)).lastElementChild!
    const path = hatch.querySelector('svg path') as SVGPathElement
    const reach = Math.max(...path.getAttribute('d')!.match(/\d+/g)!.map(Number))
    expect(reach).toBeGreaterThanOrEqual(1200)
    expect(path.getAttribute('stroke')).toBe('currentColor')
    expect(hatch.querySelector('pattern, linearGradient')).toBeNull()
  })

  it('AC-805.4: 0인 몫은 그리지 않는다', () => {
    draw([day(NOW, [['RA', 4, 0, 4]])], [PICK_A])
    const parts = Array.from(bandOf(rowOf(A)).children) as HTMLElement[]
    expect(parts).toHaveLength(1)
    expect(parts[0]!.classList.contains('bg-chart-3')).toBe(true)
    expect(parts[0]!.style.width).toBe('100%')
  })

  it('AC-805.5: 구분 없음이 있으면 칩과 두 비율의 합이 있다(건수 7·신환 1·재진 5·구분 없음 1)', () => {
    draw(WITH_GAP, [PICK_A])
    const row = rowOf(A)
    expect(within(row).getByText('14.2%')).toBeTruthy()
    expect(within(row).getByText('71.4%')).toBeTruthy()
    const chip = within(row).getByText('구분 없음 1건')
    expect(hasClasses(chip, ds.chip.warning)).toBe(true)
    expect(within(row).getByText('신환율과 재진율을 더하면 85.6%예요')).toBeTruthy()
  })

  it('AC-805.5: 구분 없음이 0이면 칩과 설명이 없다(건수 3·신환 1·재진 2의 99.9%에는 설명이 없다)', () => {
    draw([day(NOW, [['RA', 3, 1, 2]])], [PICK_A])
    const row = rowOf(A)
    expect(within(row).getByText('33.3%')).toBeTruthy()
    expect(within(row).getByText('66.6%')).toBeTruthy()
    expect(row.textContent).not.toContain('구분 없음')
    expect(row.textContent).not.toContain('더하면')
  })
})

describe('AC-805.6·AC-805.7: 표 아래 안내', () => {
  it('AC-805.6: 구분 없음이 하나라도 있으면 안내 맨 위에 주의 줄(ink-2)이 있다', () => {
    const { container } = draw(WITH_GAP, [PICK_B, PICK_A])
    const first = container.querySelector('.max-w-160')!.firstElementChild as HTMLElement
    expect(first.textContent).toContain(GAP_SENTENCE)
    expect(first.classList.contains('text-ink-2')).toBe(true)
  })

  it('AC-805.6: 구분 없음이 하나도 없으면 주의 줄이 없다', () => {
    const { container } = draw(PLAIN, [PICK_A])
    expect(notesOf(container).join(' ')).not.toContain(GAP_SENTENCE)
  })

  it('AC-805.6: 주의 글은 GAP_NOTE 상수 하나에서 온다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/stats/sections/RxPickTable.tsx'), 'utf8')
    expect(source).toMatch(/const GAP_NOTE = '[^'\n]*어느 쪽에도 넣지 않아서 두 비율을 더해도 100%가 안 돼요\.[^'\n]*'/)
    expect(source.split(GAP_SENTENCE)).toHaveLength(2)
  })

  it('AC-805.7: 묶음 폭은 max-w-160이고 차례는 주의 줄 · 견준 짝 · 줄 누르기 · 건 · 신환 · 합계다(12개월, 달별)', () => {
    const { container } = draw(WITH_GAP, [PICK_A, PICK_B], { period: '12m' })
    const notes = notesOf(container)
    expect(notes[0]).toContain(GAP_SENTENCE)
    expect(notes.slice(1)).toEqual([
      '증감과 지난 기간 건수는 끝난 11달만 견줘요. 건수는 기간 전체예요.',
      '줄을 누르면 그 처방의 달별 건수가 열려요.',
      '건 = 날마다 그 처방을 받은 환자 수를 더한 값이에요. 같은 환자가 3일 오면 3건이에요.',
      '신환은 의원에 처음 온 환자예요. 그 처방을 처음 받은 환자라는 뜻은 아니에요.',
      '합계는 고른 처방의 건수를 더한 값이에요. 한 환자가 같은 날 두 처방을 받으면 2건이에요.',
    ])
  })

  it('AC-805.7: 날 기간에 빠진 짝이 있으면 N일 안내가 있다', () => {
    const { current, previous } = statsRange(TODAY, '30d')
    const covered = [
      { from: previous.from, to: addDays(previous.to, -2) },
      { from: current.from, to: current.to },
    ]
    const { container } = draw(PLAIN, [PICK_A], { covered })
    expect(notesOf(container)[0]).toBe('증감과 지난 기간 건수는 두 기간 모두 자료가 있는 28일만 견줘요. 건수는 기간 전체예요.')
  })

  it('AC-805.7: 빠진 짝이 없으면 견준 짝 안내가 없다. 한 개만 고르면 합계 안내가 없다', () => {
    const { container } = draw(PLAIN, [PICK_A])
    expect(notesOf(container)).toEqual([
      '줄을 누르면 그 처방의 일별 건수가 열려요.',
      '건 = 날마다 그 처방을 받은 환자 수를 더한 값이에요. 같은 환자가 3일 오면 3건이에요.',
      '신환은 의원에 처음 온 환자예요. 그 처방을 처음 받은 환자라는 뜻은 아니에요.',
    ])
  })

  it.each([
    ['7d', '일별'],
    ['30d', '일별'],
    ['90d', '주별'],
    ['12m', '달별'],
  ] as const)('AC-805.7: %s 줄 누르기 안내는 %s 건수다', (period, grain) => {
    const { container } = draw(PLAIN, [PICK_A], { period })
    expect(notesOf(container)).toContain(`줄을 누르면 그 처방의 ${grain} 건수가 열려요.`)
  })
})

describe('AC-805.8·AC-805.9: 합계 줄과 표 모양', () => {
  it('AC-805.8: 둘 이상이면 맨 아래에 합계 + n가지 줄이 위 1px line-strong 선과 함께 있다', () => {
    draw(PLAIN, [PICK_A, PICK_B])
    const line = screen.getByText('합계').closest('li') as HTMLElement
    expect(within(line).getByText('2가지')).toBeTruthy()
    expect(within(line).getByText('160건')).toBeTruthy()
    expect(line.parentElement!.lastElementChild).toBe(line)
    expect(line.querySelector('.border-t.border-line-strong')).not.toBeNull()
  })

  it('AC-805.8: 합계 줄은 구분 없음도 더해서 보인다(칩·설명 포함)', () => {
    draw([day(NOW, [['RA', 7, 1, 5], ['RB', 3, 0, 2]])], [PICK_A, PICK_B])
    const line = screen.getByText('합계').closest('li') as HTMLElement
    expect(within(line).getByText('구분 없음 2건')).toBeTruthy()
    expect(within(line).getByText('신환율과 재진율을 더하면 80.0%예요')).toBeTruthy()
  })

  it('AC-805.8: 합계 줄은 단추가 아니고 꺾쇠가 없으며 눌러도 아무 일이 없다', () => {
    const onToggle = vi.fn()
    draw(PLAIN, [PICK_A, PICK_B], { onToggle })
    const line = screen.getByText('합계').closest('li') as HTMLElement
    expect(line.querySelector('button')).toBeNull()
    expect(screen.getByText('합계').closest('button')).toBeNull()
    expect(Array.from(line.querySelectorAll('svg')).every((svg) => bandOf(line)?.contains(svg))).toBe(true)
    fireEvent.click(screen.getByText('합계'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('AC-805.8: 한 개만 고르면 합계 줄이 없다', () => {
    draw(PLAIN, [PICK_A])
    expect(screen.queryByText('합계')).toBeNull()
  })

  it('AC-805.9: 상자 안 상자가 없고 줄 올림은 canvas, 초점 고리는 ds.focusRing이다', () => {
    fakeClipboard(null)
    const { container } = draw(WITH_GAP, [PICK_A, PICK_B], { opened: new Set(['RA']) })
    expect(nestedBoxes(container)).toEqual([])
    const row = rowOf(A)
    expect(row.classList.contains('hover:bg-canvas')).toBe(true)
    expect(hasClasses(row, ds.focusRing)).toBe(true)
  })

  it('AC-805.9: 복사가 막혀 읽기 전용 칸이 열려도 상자 안 상자가 없다', async () => {
    fakeClipboard(null)
    const { container } = draw(WITH_GAP, [PICK_A, PICK_B])
    await pressCopy()
    expect(screen.getByRole('textbox', { name: '복사할 표' })).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('AC-806.1: 줄과 열린 칸(그래프는 renderPanel로 받는다)', () => {
  it('AC-806.1: 줄은 button이고 aria-expanded·aria-controls가 있으며 누르면 onToggle에 줄의 코드를 준다', () => {
    const onToggle = vi.fn()
    draw(PLAIN, [PICK_A], { onToggle })
    const row = rowOf(A)
    expect(row.tagName).toBe('BUTTON')
    expect(row.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(row.getAttribute('aria-controls')!) as HTMLElement
    expect(panel.hidden).toBe(true)
    fireEvent.click(row)
    expect(onToggle).toHaveBeenCalledWith('RA')
  })

  it('AC-806.1: 닫힌 줄은 renderPanel을 부르지 않는다', () => {
    const renderPanel = vi.fn(() => <p>그래프</p>)
    draw(PLAIN, [PICK_A], { renderPanel })
    expect(renderPanel).not.toHaveBeenCalled()
  })

  it('AC-806.1: 열린 줄은 바로 아래 칸에 renderPanel 결과가 있고 꺾쇠가 돈다. opened 열쇠는 대문자 코드다', () => {
    draw([day(NOW, [['abc', 4, 1, 3]])], [{ code: 'abc', name: '소문자 처방' }], { opened: new Set(['ABC']) })
    const row = rowOf('소문자 처방')
    expect(row.getAttribute('aria-expanded')).toBe('true')
    const panel = document.getElementById(row.getAttribute('aria-controls')!) as HTMLElement
    expect(panel.hidden).toBe(false)
    expect(row.nextElementSibling).toBe(panel)
    expect(within(panel).getByText('소문자 처방 그래프')).toBeTruthy()
    const chev = Array.from(row.querySelectorAll('svg')).find((svg) => !bandOf(row).contains(svg))!
    expect(chev.classList.contains('rotate-180')).toBe(true)
  })
})

describe('AC-808.1·AC-808.3·AC-808.4·AC-808.5: 표 복사', () => {
  it('AC-808.1: 누르면 표 전체(의원 이름·기간 이름·줄·합계)의 복사 글을 클립보드에 준다', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
    fakeClipboard(writeText)
    const { input, rows, total } = draw(PLAIN, [PICK_A, PICK_B])
    await pressCopy()
    const text = writeText.mock.calls[0]![0]
    expect(text).toBe(rxPickCopyText({ hospitalName: '가짜 의원', periodName: '최근 30일', range: input.range, rows, total }))
    const lines = text.split('\n')
    expect(lines[0]).toBe('가짜 의원 처방 골라 보기')
    expect(lines[1]).toMatch(/^최근 30일 \(/)
    expect(lines[lines.length - 1]).toBe(MEANING)
  })

  it('AC-808.3: 복사하면 status로 안내 글이 보인다', async () => {
    fakeClipboard(vi.fn(async () => {}))
    draw(PLAIN, [PICK_A])
    expect(screen.getByRole('status').textContent).toBe('')
    await pressCopy()
    expect(screen.getByRole('status').textContent).toBe(COPIED)
    expect(screen.queryByRole('textbox', { name: '복사할 표' })).toBeNull()
  })

  it('AC-808.3: 표가 바뀌면 복사했어요가 사라진다(지금 표를 복사한 것처럼 보이지 않게)', async () => {
    fakeClipboard(vi.fn(async () => {}))
    const { rerender, input, rows, total } = draw(PLAIN, [PICK_A, PICK_B])
    await pressCopy()
    const props = { input, total, hospitalName: '가짜 의원', opened: new Set<string>(), onToggle: () => {}, renderPanel: () => null }
    rerender(<RxPickTable {...props} rows={rows} />)
    expect(screen.getByRole('status').textContent).toBe(COPIED)
    rerender(<RxPickTable {...props} rows={rows.slice(0, 1)} />)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('AC-808.4: 클립보드가 없으면 안내 글과 같은 글이 든 읽기 전용 칸이 보인다', async () => {
    fakeClipboard(null)
    const { input, rows, total } = draw(PLAIN, [PICK_A])
    await pressCopy()
    expect(screen.getByRole('status').textContent).toBe(BLOCKED)
    const box = screen.getByRole('textbox', { name: '복사할 표' }) as HTMLTextAreaElement
    expect(box.readOnly).toBe(true)
    expect(box.value).toBe(rxPickCopyText({ hospitalName: '가짜 의원', periodName: '최근 30일', range: input.range, rows, total }))
  })

  it('AC-808.4: 막히면(거절) 칸이 보이고 다음 성공 때 사라진다', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValueOnce(new Error('막힘')).mockResolvedValue(undefined)
    fakeClipboard(writeText)
    draw(PLAIN, [PICK_A])
    await pressCopy()
    expect(screen.getByRole('status').textContent).toBe(BLOCKED)
    expect(screen.getByRole('textbox', { name: '복사할 표' })).toBeTruthy()
    await pressCopy()
    expect(screen.getByRole('status').textContent).toBe(COPIED)
    expect(screen.queryByRole('textbox', { name: '복사할 표' })).toBeNull()
  })

  it('AC-808.4: 막힌 뒤 표가 바뀌면 칸의 글도 지금 표를 따른다', async () => {
    fakeClipboard(null)
    const { rerender, input, rows, total } = draw(PLAIN, [PICK_A, PICK_B])
    await pressCopy()
    const one = rows.slice(0, 1)
    rerender(<RxPickTable input={input} rows={one} total={null} hospitalName="가짜 의원" opened={new Set()} onToggle={() => {}} renderPanel={() => null} />)
    const box = screen.getByRole('textbox', { name: '복사할 표' }) as HTMLTextAreaElement
    expect(box.value).toBe(rxPickCopyText({ hospitalName: '가짜 의원', periodName: '최근 30일', range: input.range, rows: one, total: null }))
    expect(box.value).not.toBe(rxPickCopyText({ hospitalName: '가짜 의원', periodName: '최근 30일', range: input.range, rows, total }))
  })

  it('AC-808.5: [표 복사]는 ds.button.secondarySmall + copy 아이콘이고 표 오른쪽 아래에 있다', () => {
    const { container } = draw(PLAIN, [PICK_A])
    const button = screen.getByRole('button', { name: '표 복사' })
    expect(hasClasses(button, ds.button.secondarySmall)).toBe(true)
    const drawn = render(<Icon name="copy" size={14} />)
    expect(button.querySelector('svg')!.innerHTML).toBe(drawn.container.querySelector('svg')!.innerHTML)
    expect(button.parentElement!.classList.contains('justify-end')).toBe(true)
    const list = container.querySelector('ul.list-none') as HTMLElement
    expect(list.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-808.5: [표 복사]는 휴대폰에서 전체 폭이다', () => {
    draw(PLAIN, [PICK_A])
    expect(screen.getByRole('button', { name: '표 복사' }).classList.contains('max-md:w-full')).toBe(true)
  })
})

describe('AC-809.1·AC-809.2: 좁은 화면', () => {
  it('AC-809.1: 1024px 미만에는 칸 머리 줄이 없고 줄은 세 칸(반·반·꺾쇠)으로 쌓인다', () => {
    const { container } = draw(PLAIN, [PICK_A])
    expect(headOf(container).classList.contains('max-lg:hidden')).toBe(true)
    expect(rowOf(A).classList.contains('max-lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16px]')).toBe(true)
  })

  it('AC-809.1: 큰 건수는 왼쪽, 지난 기간(이름 표시)·증감은 오른쪽이다', () => {
    draw(PLAIN, [PICK_A])
    const row = rowOf(A)
    expect(hasClasses(within(row).getByText('120건'), 'max-lg:text-left max-lg:text-title')).toBe(true)
    const previous = within(row).getByText('50건')
    expect(previous.textContent).toBe('지난 30일 50건')
    expect(previous.classList.contains('text-right')).toBe(true)
    expect(within(row).getByText('70건 (+140.0%)').closest('.max-lg\\:text-right')).not.toBeNull()
  })

  it('AC-809.1: 신환 n건 x%와 재진 n건 x%가 이름과 함께 한 묶음이다', () => {
    draw(PLAIN, [PICK_A])
    const row = rowOf(A)
    expect(within(row).getByText('신환').parentElement!.textContent).toBe('신환30건25.0%')
    expect(within(row).getByText('재진').parentElement!.textContent).toBe('재진90건75.0%')
  })

  it('AC-809.1: 표를 옆으로 밀지 않고(overflow-x 없음) 긴 이름은 칸 안에서 줄을 바꾼다', () => {
    const { container } = draw(PLAIN, [{ code: 'RA', name: A }])
    expect(container.innerHTML).not.toContain('overflow-x')
    expect(hasClasses(within(rowOf(A)).getByText(A).parentElement!, 'min-w-0 wrap-anywhere')).toBe(true)
  })

  it('AC-809.1: 줄은 꺾쇠가 있고 합계 줄은 꺾쇠가 없다', () => {
    draw(PLAIN, [PICK_A, PICK_B])
    const row = rowOf(A)
    expect(Array.from(row.querySelectorAll('svg')).filter((svg) => !bandOf(row).contains(svg))).toHaveLength(1)
    expect((screen.getByText('합계').closest('li') as HTMLElement).querySelectorAll('svg')).toHaveLength(0)
  })

  it('AC-809.2: [표 복사]는 휴대폰에서 44px이고 열린 칸은 쪽 여백까지 넓다', () => {
    draw(PLAIN, [PICK_A], { opened: new Set(['RA']) })
    expect(screen.getByRole('button', { name: '표 복사' }).classList.contains('max-md:h-11')).toBe(true)
    const row = rowOf(A)
    expect(document.getElementById(row.getAttribute('aria-controls')!)!.classList.contains('max-md:-mx-4')).toBe(true)
  })
})
