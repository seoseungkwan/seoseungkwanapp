// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { groupKey, treatmentRows, type TreatmentRow } from '@/components/stats/treatmentView'
import type { StatsPick } from '@/components/stats/periodPick'
import { rangeOf, statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { nestedBoxes } from '@/testing/boxes'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { StatsRxGroup } from '@/types/rxGroups'
import { TreatmentTable } from './TreatmentTable'

// 처방별 추세 묶음 줄 표 (treatment-trend REQ-1207·1209·1212, design.md '화면', 시안 docs/mockups/treatment-trend/index.html).
// 줄은 진짜 treatmentRows로 만들고, 묶음·일 줄은 이 파일에서 지어낸 값이다. 열린 칸 그림은 renderPanel 가짜다

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]
const NOW = '2026-11-02' // 최근 30일 안
const BEFORE = '2026-09-21' // 지난 30일 안
const COLUMNS = 'lg:grid-cols-[minmax(200px,1fr)_84px_184px_128px_128px_16px]'
const PHONE_COLUMNS = 'max-lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16px]'
const STALE = '다시 불러오면 보여요'
const NO_CODES = '넣은 처방이 없어요. [묶음 고치기]에서 넣어 주세요.'

type Line = DayPayload['groups'][number]
type Ready = Extract<TreatmentRow, { kind: 'ready' }>

const group = (name: string, codes: string[], sortOrder: number, id: string | null = `g${sortOrder}`): StatsRxGroup => ({ id, name, codes, sortOrder })
const SHOCK = group('충격파', ['ESWT1', 'ESWT7'], 0)
const MANUAL = group('도수치료', ['도수'], 1)
const CARM = group('C-arm', ['CARM1'], 2)
const FROZEN = group('냉동치료', [], 3)
const SHOCK_KEY = groupKey(SHOCK.codes)
const MANUAL_KEY = groupKey(MANUAL.codes)

// 묶음 줄. returning을 따로 주면 구분 없음이 생긴다(신환 + 재진 < 건수)
const line = (id: string, patients: number, newPatients = 0, returning = patients - newPatients): Line => ({ id, patients, newPatients, returning })
function day(ymd: string, groups: Line[]): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
    rx: [],
    groups: [...groups].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null },
  }
}

// 충격파 지난 50 → 이번 120(신환 30·재진 90), 도수치료 지난 10 → 이번 40(신환 8·재진 32). 구분 없음이 없다
const PLAIN = [day(BEFORE, [line(SHOCK_KEY, 50, 5), line(MANUAL_KEY, 10, 1)]), day(NOW, [line(SHOCK_KEY, 120, 30), line(MANUAL_KEY, 40, 8)])]

type Options = { period?: StatsPeriod; covered?: DateRange[]; opened?: ReadonlySet<string>; onToggle?: (key: string) => void; renderPanel?: (item: Ready) => ReactNode }
function draw(days: DayPayload[], groups: StatsRxGroup[], { period = '30d', covered = WHOLE, opened = new Set(), onToggle = () => {}, renderPanel = (item) => <p>{`${item.group.name} 그래프`}</p> }: Options = {}) {
  const input: StatsInput = { days, covered, range: statsRange(TODAY, period) }
  const rows = treatmentRows(input, groups)
  const view = render(<TreatmentTable input={input} rows={rows} opened={opened} onToggle={onToggle} renderPanel={renderPanel} />)
  return { ...view, input, rows }
}

const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(name) })
const lineOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement
const headOf = (container: HTMLElement) => container.querySelector('[aria-hidden="true"].grid') as HTMLElement
const barOf = (row: Element) => row.querySelector('[aria-hidden="true"].h-3') as HTMLElement | null
const hasClasses = (el: Element, classes: string) => classes.split(/\s+/).every((name) => el.classList.contains(name))
const cellOf = (row: HTMLElement, text: string) => within(row).getByText(text)

afterEach(cleanup)

describe('AC-1207.3: 준비된 줄의 이름·코드·막대·숫자', () => {
  it('AC-1207.3: 이름은 굵게, 그 옆 코드 줄은 · 로 이은 caption muted다', () => {
    draw(PLAIN, [SHOCK])
    const row = rowOf('충격파')
    expect(cellOf(row, '충격파').classList.contains('font-semibold')).toBe(true)
    const codes = cellOf(row, 'ESWT1 · ESWT7')
    expect(hasClasses(codes, 'text-caption text-muted')).toBe(true)
    expect(codes.parentElement).toBe(cellOf(row, '충격파').parentElement)
  })

  it('AC-1207.3: 건수 n건(600·오른쪽·고정폭), 증감은 DeltaText(단위 건), 신환·재진은 n건 + 비율(600)이다', () => {
    draw(PLAIN, [SHOCK])
    const row = rowOf('충격파')
    expect(hasClasses(cellOf(row, '120건'), 'font-semibold text-right tabular-nums')).toBe(true)
    expect(cellOf(row, '70건 (+140.0%)').textContent).toBe('▲ 70건 (+140.0%)')
    expect(within(row).getByText('늘어남')).toBeTruthy()
    expect(within(row).getByText('신환').parentElement!.textContent).toBe('신환30건25.0%')
    expect(within(row).getByText('재진').parentElement!.textContent).toBe('재진90건75.0%')
    expect(cellOf(row, '25.0%').classList.contains('font-semibold')).toBe(true)
    expect(cellOf(row, '75.0%').classList.contains('font-semibold')).toBe(true)
  })

  it('AC-1207.3: 건수·신환·재진은 세 자리마다 쉼표다', () => {
    draw([day(NOW, [line(SHOCK_KEY, 1234, 234, 1000)])], [SHOCK])
    const row = rowOf('충격파')
    expect(cellOf(row, '1,234건')).toBeTruthy()
    expect(within(row).getByText('신환').parentElement!.textContent).toBe('신환234건18.9%')
    expect(within(row).getByText('재진').parentElement!.textContent).toBe('재진1,000건81.0%')
  })

  it('AC-1207.3: 이름 아래 줄 막대는 InlineBar이고 견준 짝이 있으면 이번 = comparable.current·눈금 = comparable.previous, 최대값은 준비된 줄이 그리는 값 가운데 가장 큰 값이다', () => {
    draw(PLAIN, [SHOCK, MANUAL])
    const shock = barOf(rowOf('충격파'))!
    const manual = barOf(rowOf('도수치료'))!
    expect(shock.getAttribute('aria-hidden')).toBe('true')
    // 최대 120: 충격파 120·50, 도수치료 40·10
    expect((shock.querySelector('.bg-accent') as HTMLElement).style.width).toBe('100%')
    expect((shock.querySelector('.bg-faint') as HTMLElement).style.left).toBe('41.67%')
    expect((manual.querySelector('.bg-accent') as HTMLElement).style.width).toBe('33.33%')
    expect((manual.querySelector('.bg-faint') as HTMLElement).style.left).toBe('8.33%')
  })

  it('AC-1207.3: 막대는 이름 아래(같은 첫 칸)이고 칸 폭을 채운다', () => {
    draw(PLAIN, [SHOCK])
    const bar = barOf(rowOf('충격파'))!
    const cell = bar.parentElement!
    expect(hasClasses(cell, 'lg:col-start-1 lg:row-start-2 [&>span]:w-full')).toBe(true)
  })

  it('AC-1207.3: 비교 기간을 이 열쇠로 세지 않았으면(견준 짝 없음) 막대는 건수이고 눈금이 없으며 증감은 비교할 수 없음이다', () => {
    // 지난 기간 날에 충격파 열쇠 줄이 없다 → compared 거짓. 도수치료는 견준다(최대 = 충격파 120)
    const { rows } = draw([day(BEFORE, [line(MANUAL_KEY, 10, 1)]), day(NOW, [line(SHOCK_KEY, 120, 30), line(MANUAL_KEY, 40, 8)])], [SHOCK, MANUAL])
    expect((rows[0] as Ready).compared).toBe(false)
    const shock = barOf(rowOf('충격파'))!
    expect((shock.querySelector('.bg-accent') as HTMLElement).style.width).toBe('100%')
    expect(shock.querySelector('.bg-faint')).toBeNull()
    expect(within(rowOf('충격파')).getByText('비교할 수 없음')).toBeTruthy()
    expect((barOf(rowOf('도수치료'))!.querySelector('.bg-faint') as HTMLElement).style.left).toBe('8.33%')
  })

  it('AC-1207.3: 줄 끝에 꺾쇠가 있다', () => {
    draw(PLAIN, [SHOCK])
    const row = rowOf('충격파')
    const chev = Array.from(row.querySelectorAll('svg')).filter((svg) => !barOf(row)?.contains(svg))
    expect(chev).toHaveLength(1)
    expect(chev[0]!.classList.contains('text-muted')).toBe(true)
  })

  it('AC-1207.2(그리기): 12개월 건수에 덜 끝난 달이 들면 건수 옆에 일부 기간 칩이 있다. 날 기간에는 없다', () => {
    const { rows } = draw([day(NOW, [line(SHOCK_KEY, 12, 2)])], [SHOCK], { period: '12m' })
    expect((rows[0] as Ready).row.partial).toBe(true)
    const count = cellOf(rowOf('충격파'), '12건')
    const chip = within(count).getByText('일부 기간')
    expect(hasClasses(chip, ds.chip.warning)).toBe(true)
    cleanup()
    draw(PLAIN, [SHOCK])
    expect(within(rowOf('충격파')).queryByText('일부 기간')).toBeNull()
  })
})

describe('AC-1207.4·AC-1207.5(그리기): 비율과 0건 줄', () => {
  it('AC-1207.4: 비율은 건수가 밑수이고 소수 첫째 자리까지 버린다(건수 3·신환 1·재진 2 → 33.3%·66.6%)', () => {
    draw([day(NOW, [line(SHOCK_KEY, 3, 1)])], [SHOCK])
    const row = rowOf('충격파')
    expect(cellOf(row, '33.3%')).toBeTruthy()
    expect(cellOf(row, '66.6%')).toBeTruthy()
  })

  it('AC-1207.5: 이 기간 0건이면 줄이 남고 0건, 신환·재진 0건, 비율 –이며 비교 기간 5건이면 5건 (−100.0%) ▼이다', () => {
    draw([day(BEFORE, [line(SHOCK_KEY, 5, 1)]), day(NOW, [line(SHOCK_KEY, 0)])], [SHOCK])
    const row = rowOf('충격파')
    expect(within(row).getAllByText('0건')).toHaveLength(3)
    expect(within(row).getAllByText('–')).toHaveLength(2)
    expect(cellOf(row, '5건 (−100.0%)').textContent).toBe('▼ 5건 (−100.0%)')
    expect(within(row).getByText('줄어듦')).toBeTruthy()
    expect(row.textContent).not.toContain('구분 없음')
  })
})

describe('AC-1207.6: 구분 없음', () => {
  it('AC-1207.6: 신환 + 재진 < 건수이면 줄 아래에 구분 없음 n건 칩과 두 비율 글자의 합이 있다(건수 7·신환 1·재진 5)', () => {
    draw([day(NOW, [line(SHOCK_KEY, 7, 1, 5)])], [SHOCK])
    const row = rowOf('충격파')
    expect(cellOf(row, '14.2%')).toBeTruthy()
    expect(cellOf(row, '71.4%')).toBeTruthy()
    const chip = cellOf(row, '구분 없음 1건')
    expect(hasClasses(chip, ds.chip.warning)).toBe(true)
    const note = cellOf(row, '신환율과 재진율을 더하면 85.6%예요')
    expect(note.parentElement).toBe(chip.parentElement)
    expect(hasClasses(chip.parentElement!, 'lg:col-start-1 lg:row-start-3')).toBe(true)
  })

  it('AC-1207.6: 같으면 칩과 설명이 없다(건수 3·신환 1·재진 2의 99.9%에도 없다)', () => {
    draw([day(NOW, [line(SHOCK_KEY, 3, 1)])], [SHOCK])
    const row = rowOf('충격파')
    expect(row.textContent).not.toContain('구분 없음')
    expect(row.textContent).not.toContain('더하면')
  })
})

describe('AC-1207.7: 넓은 화면의 머리 줄과 칸', () => {
  it.each([
    ['7d', '지난 7일보다'],
    ['30d', '지난 30일보다'],
    ['90d', '지난 90일보다'],
    ['12m', '작년 같은 12달보다'],
  ] as const)('AC-1207.7: %s 머리 줄은 묶음·건수·%s·신환·재진이고 화면 읽기에서 숨긴다', (period, compare) => {
    const { container } = draw(PLAIN, [SHOCK], { period })
    const head = headOf(container)
    expect(Array.from(head.children).map((el) => el.textContent)).toEqual(['묶음', '건수', compare, '신환', '재진', ''])
    expect(head.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-1207.7: 숫자 머리는 오른쪽, 묶음·비교 머리는 왼쪽 정렬이다(시안 .cols)', () => {
    const { container } = draw(PLAIN, [SHOCK])
    const aligned = Array.from(headOf(container).children).map((el) => el.classList.contains('text-right'))
    expect(aligned).toEqual([false, true, false, true, true, false])
  })

  it('AC-1207.7: 머리 줄·준비된 줄·기다리는 줄의 칸 폭이 같다', () => {
    const { container } = draw(PLAIN, [SHOCK, CARM, FROZEN])
    expect(headOf(container).classList.contains(COLUMNS)).toBe(true)
    expect(rowOf('충격파').classList.contains(COLUMNS)).toBe(true)
    expect((lineOf('C-arm').firstElementChild as HTMLElement).classList.contains(COLUMNS)).toBe(true)
    expect((lineOf('냉동치료').firstElementChild as HTMLElement).classList.contains(COLUMNS)).toBe(true)
  })

  it('AC-1207.7: 1024px 미만에는 머리 줄이 없다', () => {
    const { container } = draw(PLAIN, [SHOCK])
    expect(headOf(container).classList.contains('max-lg:hidden')).toBe(true)
  })

  it('AC-1207.7: 넓은 화면의 칸 자리는 건수 2 · 증감 3 · 신환 4 · 재진 5 · 꺾쇠 6이다', () => {
    draw(PLAIN, [SHOCK])
    const row = rowOf('충격파')
    expect(cellOf(row, '120건').classList.contains('lg:col-start-2')).toBe(true)
    expect(cellOf(row, '70건 (+140.0%)').closest('.lg\\:col-start-3')).not.toBeNull()
    expect(within(row).getByText('신환').parentElement!.classList.contains('lg:col-start-4')).toBe(true)
    expect(within(row).getByText('재진').parentElement!.classList.contains('lg:col-start-5')).toBe(true)
    const chev = Array.from(row.querySelectorAll('svg')).find((svg) => !barOf(row)?.contains(svg))!
    expect(chev.classList.contains('lg:col-start-6')).toBe(true)
  })
})

describe('AC-1207.9: 다시 불러와야 하는 줄·처방 없는 줄', () => {
  // 충격파는 이번 기간 날에 열쇠 줄이 있고, C-arm은 없다(다시 불러와야 함), 냉동치료는 처방이 없다
  const MIXED = [day(NOW, [line(SHOCK_KEY, 4, 1)])]

  it('AC-1207.9: 다시 불러와야 하는 줄은 단추가 아니고 이름·코드 옆에 다시 불러오면 보여요가 있으며 숫자·막대·꺾쇠가 없다', () => {
    draw(MIXED, [SHOCK, CARM, FROZEN])
    const item = lineOf('C-arm')
    expect(item.querySelector('button')).toBeNull()
    expect(within(item).getByText('CARM1')).toBeTruthy()
    expect(within(item).getByText(STALE)).toBeTruthy()
    expect(item.textContent).not.toMatch(/\d+건|%/)
    expect(barOf(item)).toBeNull()
    expect(item.querySelector('svg')).toBeNull()
    expect(screen.queryByRole('button', { name: /C-arm/ })).toBeNull()
  })

  it('AC-1207.9: 처방 없는 줄은 단추가 아니고 넣은 처방이 없어요 글이 있으며 코드 줄·숫자·막대·꺾쇠가 없다', () => {
    draw(MIXED, [SHOCK, CARM, FROZEN])
    const item = lineOf('냉동치료')
    expect(item.querySelector('button')).toBeNull()
    expect(within(item).getByText(NO_CODES)).toBeTruthy()
    expect(item.textContent).toBe(`냉동치료${NO_CODES}`)
    expect(barOf(item)).toBeNull()
    expect(item.querySelector('svg')).toBeNull()
  })

  it('AC-1207.9: 기다리는 글은 small muted이고 넓으면 건수~재진 자리(2~6번 선), 좁으면 이름 아래 폭 전체다', () => {
    draw(MIXED, [SHOCK, CARM, FROZEN])
    for (const text of [STALE, NO_CODES]) {
      const note = screen.getByText(text)
      expect(hasClasses(note, 'text-small text-muted lg:col-[2/6] max-lg:col-[1/4] max-lg:row-start-2'), text).toBe(true)
    }
  })

  it('AC-1207.9: 다시 불러와야 하는 줄은 열린 줄 목록에 있어도 열린 칸이 없고 renderPanel을 부르지 않는다', () => {
    const renderPanel = vi.fn(() => <p>그래프</p>)
    draw(MIXED, [SHOCK, CARM], { opened: new Set(['g2']), renderPanel })
    expect(lineOf('C-arm').children).toHaveLength(1)
    expect(renderPanel).not.toHaveBeenCalled()
  })

  it('AC-1207.9: 기다리는 줄은 준비된 줄 막대의 최대값에 들지 않는다', () => {
    draw(MIXED, [SHOCK, CARM, FROZEN])
    expect((barOf(rowOf('충격파'))!.querySelector('.bg-accent') as HTMLElement).style.width).toBe('100%')
  })
})

describe('AC-1209.1(줄 단추): 준비된 줄을 눌러 열기', () => {
  it('AC-1209.1: 준비된 줄은 단추이고 aria-expanded·aria-controls가 있으며 누르면 onToggle에 줄 열쇠(저장된 id)를 준다', () => {
    const onToggle = vi.fn()
    draw(PLAIN, [SHOCK], { onToggle })
    const row = rowOf('충격파')
    expect(row.tagName).toBe('BUTTON')
    expect(row.getAttribute('type')).toBe('button')
    expect(row.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(row.getAttribute('aria-controls')!) as HTMLElement
    expect(panel.hidden).toBe(true)
    fireEvent.click(row)
    expect(onToggle).toHaveBeenCalledWith('g0')
  })

  it('AC-1209.1: 아직 저장 안 한 제안 묶음(id null)의 줄 열쇠는 new: + 이름이다', () => {
    const onToggle = vi.fn()
    const suggested = group('충격파', SHOCK.codes, 0, null)
    draw(PLAIN, [suggested], { onToggle, opened: new Set(['new:충격파']) })
    const row = rowOf('충격파')
    expect(row.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(row)
    expect(onToggle).toHaveBeenCalledWith('new:충격파')
  })

  it('AC-1209.1: 닫힌 줄은 renderPanel을 부르지 않는다', () => {
    const renderPanel = vi.fn(() => <p>그래프</p>)
    draw(PLAIN, [SHOCK, MANUAL], { renderPanel })
    expect(renderPanel).not.toHaveBeenCalled()
  })

  it('AC-1209.1: 열린 줄은 바로 아래 칸에 renderPanel(그 줄) 결과가 있고 꺾쇠가 뒤집힌다', () => {
    const renderPanel = vi.fn((item: Ready) => <p>{`${item.group.name} 그래프`}</p>)
    const { rows } = draw(PLAIN, [SHOCK, MANUAL], { opened: new Set(['g1']), renderPanel })
    const row = rowOf('도수치료')
    expect(row.getAttribute('aria-expanded')).toBe('true')
    const panel = document.getElementById(row.getAttribute('aria-controls')!) as HTMLElement
    expect(panel.hidden).toBe(false)
    expect(row.nextElementSibling).toBe(panel)
    expect(within(panel).getByText('도수치료 그래프')).toBeTruthy()
    expect(renderPanel).toHaveBeenCalledTimes(1)
    expect(renderPanel).toHaveBeenCalledWith(rows[1])
    const chev = Array.from(row.querySelectorAll('svg')).find((svg) => !barOf(row)?.contains(svg))!
    expect(chev.classList.contains('rotate-180')).toBe(true)
    const closed = Array.from(rowOf('충격파').querySelectorAll('svg')).find((svg) => !barOf(rowOf('충격파'))?.contains(svg))!
    expect(closed.classList.contains('rotate-180')).toBe(false)
  })

  it('AC-1209.1: 여러 줄을 같이 열 수 있다', () => {
    draw(PLAIN, [SHOCK, MANUAL], { opened: new Set(['g0', 'g1']) })
    expect(screen.getByText('충격파 그래프')).toBeTruthy()
    expect(screen.getByText('도수치료 그래프')).toBeTruthy()
  })

  it('AC-1209.1: 열린 칸은 canvas 바탕이고 휴대폰에서 좌우 끝까지 넓힌다. 줄 올림은 canvas, 초점 고리는 ds.focusRing이다', () => {
    draw(PLAIN, [SHOCK], { opened: new Set(['g0']) })
    const row = rowOf('충격파')
    const panel = row.nextElementSibling as HTMLElement
    expect(hasClasses(panel, 'bg-canvas max-md:-mx-4 border-b border-line')).toBe(true)
    expect(row.classList.contains('hover:bg-canvas')).toBe(true)
    expect(hasClasses(row, ds.focusRing)).toBe(true)
  })

  it('AC-1209.1: 줄을 열어도 상자 안 상자가 없다', () => {
    const { container } = draw([day(NOW, [line(SHOCK_KEY, 7, 1, 5)])], [SHOCK, CARM, FROZEN], { opened: new Set(['g0']) })
    expect(nestedBoxes(container)).toEqual([])
  })
})

describe('AC-1212.1: 1024px 미만 쌓임', () => {
  it('AC-1212.1: 줄은 세 칸(반·반·꺾쇠)으로 쌓인다', () => {
    draw(PLAIN, [SHOCK])
    expect(rowOf('충격파').classList.contains(PHONE_COLUMNS)).toBe(true)
    expect((lineOf('충격파').firstElementChild as HTMLElement).classList.contains(PHONE_COLUMNS)).toBe(true)
  })

  it('AC-1212.1: 1줄 이름·코드(왼쪽) + 꺾쇠(오른쪽) / 2줄 큰 건수(왼쪽) + 증감(오른쪽) / 3줄 막대(폭 전체) / 4줄 신환(왼쪽) + 재진(오른쪽) / 5줄 구분 없음', () => {
    draw([day(BEFORE, [line(SHOCK_KEY, 5, 1)]), day(NOW, [line(SHOCK_KEY, 7, 1, 5)])], [SHOCK])
    const row = rowOf('충격파')
    expect(hasClasses(cellOf(row, '충격파').parentElement!, 'max-lg:col-[1/3] max-lg:row-start-1')).toBe(true)
    const chev = Array.from(row.querySelectorAll('svg')).find((svg) => !barOf(row)?.contains(svg))!
    expect(hasClasses(chev, 'max-lg:col-start-3 max-lg:row-start-1')).toBe(true)
    expect(hasClasses(cellOf(row, '7건'), 'max-lg:col-start-1 max-lg:row-start-2 max-lg:text-left max-lg:text-title')).toBe(true)
    expect(hasClasses(cellOf(row, '2건 (+40.0%)').closest('.max-lg\\:row-start-2.max-lg\\:col-\\[2\\/4\\]')!, 'max-lg:text-right')).toBe(true)
    expect(hasClasses(barOf(row)!.parentElement!, 'max-lg:col-[1/4] max-lg:row-start-3')).toBe(true)
    expect(hasClasses(within(row).getByText('신환').parentElement!, 'max-lg:col-start-1 max-lg:row-start-4')).toBe(true)
    expect(hasClasses(within(row).getByText('재진').parentElement!, 'max-lg:col-[2/4] max-lg:row-start-4 text-right')).toBe(true)
    expect(hasClasses(cellOf(row, '구분 없음 1건').parentElement!, 'max-lg:col-[1/4] max-lg:row-start-5')).toBe(true)
  })

  it('AC-1212.1: 이름표 신환·재진은 1024px 이상에서만 숨고(화면 읽기는 읽는다) 좁으면 muted로 보인다', () => {
    draw(PLAIN, [SHOCK])
    const row = rowOf('충격파')
    for (const name of ['신환', '재진']) {
      const label = within(row).getByText(name)
      expect(hasClasses(label, 'lg:sr-only text-muted'), name).toBe(true)
      expect(label.classList.contains('sr-only'), name).toBe(false)
    }
  })

  it('AC-1212.1: 줄과 머리 줄을 쌓는 폭 접두사는 lg:·max-lg:만 쓴다', () => {
    const { container } = draw([day(NOW, [line(SHOCK_KEY, 7, 1, 5)])], [SHOCK, CARM, FROZEN])
    const OTHER_WIDTH = /^(?:max-)?(?:sm|md|xl|2xl):/
    const lines = [headOf(container), rowOf('충격파'), lineOf('C-arm').firstElementChild!, lineOf('냉동치료').firstElementChild!]
    for (const el of lines.flatMap((root) => [root, ...Array.from(root.querySelectorAll('*'))])) {
      const tokens = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
      expect(tokens.filter((token) => OTHER_WIDTH.test(token))).toEqual([])
    }
  })
})

// ── 고른 기간 (stats-period REQ-1705). 오늘은 2026-11-06(금)이다 ─────────────────
describe('AC-1705.2: 고른 기간의 처방별 추세 표', () => {
  const P_TODAY = '2026-11-06'
  const OCT: StatsPick = { kind: 'month', unit: 'day', month: '2026-10' }
  const ALL_COVER: DateRange[] = [{ from: '2025-01-01', to: '2026-11-05' }]
  // 충격파 이번 10월 120, 9월 50, 작년 10월 100
  const THREE = [day('2025-10-06', [line(SHOCK_KEY, 100, 10)]), day('2026-09-07', [line(SHOCK_KEY, 50, 5)]), day('2026-10-05', [line(SHOCK_KEY, 120, 30)])]
  const drawPick = (days: DayPayload[], pick: StatsPick = OCT, covered: DateRange[] = ALL_COVER) => {
    const input: StatsInput = { days, covered, range: rangeOf(P_TODAY, pick, false) }
    const rows = treatmentRows(input, [SHOCK])
    return render(<TreatmentTable input={input} rows={rows} opened={new Set()} onToggle={() => {}} renderPanel={() => null} />)
  }
  const headTexts = (container: HTMLElement) => Array.from(headOf(container).children).map((cell) => cell.textContent)
  // 줄 안 비교 칸: 휴대폰 이름표('{name}보다', 넓으면 화면 읽기에만)가 든 칸
  const compareOf = (name: string) => within(rowOf('충격파')).getByText(`${name}보다`).parentElement!

  it('AC-1705.2: 머리에 비교마다 "{name}보다"가 있다(9월보다·작년 10월보다)', () => {
    const { container } = drawPick(THREE)
    expect(headTexts(container)).toEqual(['묶음', '건수', '9월보다', '작년 10월보다', '신환', '재진', ''])
    expect(headOf(container).classList.contains('lg:grid-cols-[minmax(200px,1fr)_84px_184px_184px_128px_128px_16px]')).toBe(true)
  })

  it('AC-1705.2: 해는 "2025년보다" 하나다', () => {
    const { container } = drawPick([day('2025-03-02', [line(SHOCK_KEY, 40, 4)]), day('2026-03-02', [line(SHOCK_KEY, 60, 6)])], { kind: 'year', year: '2026' })
    expect(headTexts(container)).toEqual(['묶음', '건수', '2025년보다', '신환', '재진', ''])
    expect(headOf(container).classList.contains(COLUMNS)).toBe(true)
  })

  it('AC-1705.2: 견준 칸은 증감 글자이고, 작년 기간을 그 묶음으로 세지 않았으면 작년 칸만 "–"이며 표 아래 안내가 있다', () => {
    const notKeyed = [day('2025-10-06', []), day('2026-09-07', [line(SHOCK_KEY, 50, 5)]), day('2026-10-05', [line(SHOCK_KEY, 120, 30)])]
    drawPick(notKeyed)
    expect(compareOf('9월').textContent).toContain('▲')
    expect(compareOf('작년 10월').textContent).toBe('작년 10월보다–')
    expect(screen.getByText('작년 10월: 자료가 없어요. 비트 PC에서 그 기간을 불러오면 보여요.')).toBeTruthy()
    expect(screen.queryByText(/^9월: 자료가 없어요/)).toBeNull()
  })

  it('AC-1705.2: 작년 기간이 덮이지 않았으면(비트에서 불러온 적 없음) 그 칸이 "–"다', () => {
    drawPick(THREE, OCT, [{ from: '2026-09-01', to: '2026-11-05' }])
    expect(compareOf('작년 10월').textContent).toBe('작년 10월보다–')
    expect(compareOf('9월').textContent).not.toContain('–')
  })

  it('AC-1705.2: 둘 다 견주면 표 아래 안내가 없다', () => {
    drawPick(THREE)
    expect(compareOf('작년 10월').textContent).toContain('▲')
    expect(screen.queryByText(/자료가 없어요\. 비트 PC에서 그 기간을 불러오면 보여요\./)).toBeNull()
  })
})

describe('AC-1705.5: 빠른 단추의 처방별 추세 표는 지금과 같다', () => {
  it('AC-1705.5: 머리는 묶음·건수·"지난 30일보다"·신환·재진이고 칸 폭이 지금 그대로다', () => {
    const { container } = draw(PLAIN, [SHOCK])
    expect(Array.from(headOf(container).children).map((cell) => cell.textContent)).toEqual(['묶음', '건수', '지난 30일보다', '신환', '재진', ''])
    expect(headOf(container).classList.contains(COLUMNS)).toBe(true)
    expect(screen.queryByText(/자료가 없어요\. 비트 PC에서 그 기간을 불러오면 보여요\./)).toBeNull()
  })
})

// ── 제외할 처방 (rx-group-exclude REQ-2708, 시안 docs/mockups/rx-group-exclude codesLine). 묶음·코드는 지어낸 값이다 ─────────────────
const excluding = (base: StatsRxGroup, exclude: string[]): StatsRxGroup => ({ ...base, exclude })
const INJECT = group('주사', ['MM010'], 0)

describe('AC-2708.1: 이름 옆 코드 줄의 제외할 처방', () => {
  it('AC-2708.1: 준비된 줄은 넣은 처방 뒤에 ` · 제외 ` + 제외할 처방이 붙고, 한 코드 줄(caption muted, 이름 옆)이다', () => {
    const shown = excluding(INJECT, ['ESWT7'])
    draw([day(NOW, [line(groupKey(shown.codes, shown.exclude), 12, 2)])], [shown])
    const row = rowOf('주사')
    const codes = cellOf(row, 'MM010 · 제외 ESWT7')
    expect(hasClasses(codes, 'text-caption text-muted')).toBe(true)
    expect(codes.parentElement).toBe(cellOf(row, '주사').parentElement)
  })

  it.each([
    [['MM010'], ['ESWT1', 'ESWT7'], 'MM010 · 제외 ESWT1, ESWT7'],
    [['MM010', 'MM020'], ['ESWT1', 'ESWT7'], 'MM010 · MM020 · 제외 ESWT1, ESWT7'],
  ])('AC-2708.1: 넣은 처방 %j은 ` · `, 제외할 처방 %j은 `, `로 잇는다 → %s', (codes, exclude, text) => {
    const shown = excluding(group('주사', codes, 0), exclude)
    draw([day(NOW, [line(groupKey(shown.codes, shown.exclude), 12, 2)])], [shown])
    expect(cellOf(rowOf('주사'), text)).toBeTruthy()
  })

  it('AC-2708.1: 다시 불러와야 하는 줄(제외할 처방을 넣고 아직 다시 불러오지 않음)도 같은 코드 줄이다', () => {
    // PLAIN은 제외할 처방이 없는 충격파 열쇠로 셌다 → 제외할 처방을 넣은 충격파는 다시 불러와야 한다
    draw(PLAIN, [excluding(SHOCK, ['MM010'])])
    const item = lineOf('충격파')
    expect(item.textContent).toBe(`충격파ESWT1 · ESWT7 · 제외 MM010${STALE}`)
    expect(hasClasses(within(item).getByText('ESWT1 · ESWT7 · 제외 MM010'), 'text-caption text-muted')).toBe(true)
  })

  it('AC-2708.1: 처방 없는 줄에 제외할 처방만 있으면 코드 줄은 `제외 ESWT7`이다', () => {
    draw(PLAIN, [SHOCK, excluding(FROZEN, ['ESWT7'])])
    const item = lineOf('냉동치료')
    expect(item.textContent).toBe(`냉동치료제외 ESWT7${NO_CODES}`)
    const codes = within(item).getByText('제외 ESWT7')
    expect(hasClasses(codes, 'text-caption text-muted')).toBe(true)
    expect(codes.parentElement).toBe(within(item).getByText('냉동치료').parentElement)
  })

  it('AC-2708.1: 제외할 처방이 빈 배열이면 코드 줄은 지금 글 그대로다(처방 없는 줄은 코드 줄이 없다)', () => {
    draw(PLAIN, [excluding(SHOCK, []), excluding(FROZEN, [])])
    expect(cellOf(rowOf('충격파'), 'ESWT1 · ESWT7')).toBeTruthy()
    expect(lineOf('냉동치료').textContent).toBe(`냉동치료${NO_CODES}`)
    expect(screen.queryByText(/제외/)).toBeNull()
  })
})

describe('AC-2708.3: 제외할 처방이 있는 묶음도 숫자·열린 칸·쌓임이 같다', () => {
  const SHOCK_EX = excluding(SHOCK, ['MM010'])
  const EX_KEY = groupKey(SHOCK_EX.codes, SHOCK_EX.exclude)
  const PLAIN_CODES = '>ESWT1 · ESWT7<'
  const EX_CODES = '>ESWT1 · ESWT7 · 제외 MM010<'
  // 같은 숫자를 열쇠만 바꿔 넣는다: 견준 짝·구분 없음이 있는 줄(지난 5 → 이번 7, 신환 1·재진 5)
  const daysFor = (key: string) => [day(BEFORE, [line(key, 5, 1)]), day(NOW, [line(key, 7, 1, 5)])]
  // useId 값(그리기마다 다르다)을 지운 마크업. 칸 자리·넓은 칸·휴대폰 쌓임 클래스가 모두 든다
  const markup = (el: Element) => el.outerHTML.replace(/«[^»]*»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, 'ID')

  it.each(['7d', '30d', '90d', '12m'] as const)('AC-2708.3: %s 준비된 줄(열린 칸 포함)의 마크업은 코드 줄 글만 다르다', (period) => {
    draw(daysFor(SHOCK_KEY), [SHOCK], { period, opened: new Set(['g0']) })
    const plain = markup(lineOf('충격파'))
    cleanup()
    draw(daysFor(EX_KEY), [SHOCK_EX], { period, opened: new Set(['g0']) })
    const item = lineOf('충격파')
    expect(within(item).getByText('ESWT1 · ESWT7 · 제외 MM010')).toBeTruthy()
    expect(markup(item)).toBe(plain.replace(PLAIN_CODES, EX_CODES))
  })

  it('AC-2708.3: 다시 불러와야 하는 줄의 마크업도 코드 줄 글만 다르다', () => {
    draw([day(NOW, [])], [SHOCK])
    const plain = markup(lineOf('충격파'))
    cleanup()
    draw([day(NOW, [])], [SHOCK_EX])
    expect(markup(lineOf('충격파'))).toBe(plain.replace(PLAIN_CODES, EX_CODES))
  })
})
