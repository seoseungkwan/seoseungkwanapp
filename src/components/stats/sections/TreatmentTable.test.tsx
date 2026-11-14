// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rateText } from '@/components/stats/rxPickView'
import { periodPatients } from '@/components/stats/treatmentChart'
import { groupKey, treatmentRows, type TreatmentRow } from '@/components/stats/treatmentView'
import type { StatsPick } from '@/components/stats/periodPick'
import { rangeOf, statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { nestedBoxes } from '@/testing/boxes'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { RxGroup, StatsRxGroup } from '@/types/rxGroups'
import { TreatmentTable } from './TreatmentTable'

// 처방별 추세 묶음 줄 표 (treatment-trend REQ-1207·1209·1212, design.md '화면', 시안 docs/mockups/treatment-trend/index.html).
// group-exclude REQ-3708(총환자 줄·총환자 대비 칸·조건 *·조건 줄·빼는 처방 줄, 시안 docs/mockups/group-exclude/index.html .allpt·.c-share·.out-line).
// 줄은 진짜 treatmentRows로 만들고, 묶음·일 줄은 이 파일에서 지어낸 값이다. 열린 칸 그림은 renderPanel 가짜다

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]
const NOW = '2026-11-02' // 최근 30일 안
const BEFORE = '2026-09-21' // 지난 30일 안
// 총환자 대비 칸이 건수 뒤에 든다(group-exclude design.md '화면'). 막대는 이름 다음 제 칸이다(first90 AC-4413.2)
const COLUMNS = 'lg:grid-cols-[minmax(160px,220px)_minmax(0,1fr)_88px_88px_168px_112px_112px_16px]'
const COLUMNS_TWO = 'lg:grid-cols-[minmax(120px,200px)_minmax(0,1fr)_88px_80px_144px_144px_104px_104px_16px]'
const PHONE_COLUMNS = 'max-lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16px]'
const STALE = '다시 불러오면 보여요'
const NO_CODES = '넣은 처방이 없어요. [묶음 고치기]에서 넣어 주세요.'

type Line = DayPayload['groups'][number]
type Ready = Extract<TreatmentRow, { kind: 'ready' }>

const group = (name: string, codes: string[], sortOrder: number, id: string | null = `g${sortOrder}`): RxGroup => ({ id, name, codes, sortOrder })
const SHOCK = group('충격파', ['ESWT1', 'ESWT7'], 0)
const MANUAL = group('도수치료', ['도수'], 1)
const CARM = group('C-arm', ['CARM1'], 2)
const FROZEN = group('냉동치료', [], 3)
const SHOCK_KEY = groupKey(SHOCK.codes)
const MANUAL_KEY = groupKey(MANUAL.codes)

// 묶음 줄. returning을 따로 주면 구분 없음이 생긴다(신환 + 재진 < 건수)
const line = (id: string, patients: number, newPatients = 0, returning = patients - newPatients): Line => ({ id, patients, newPatients, returning })
// all = 그날 총환자(totals.patients)
function day(ymd: string, groups: Line[], all = 10): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: all, newPatients: 2, returning: all - 2, unknown: 0 },
    rx: [],
    groups: [...groups].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null },
  }
}

// 충격파 지난 50 → 이번 120(신환 30·재진 90), 도수치료 지난 10 → 이번 40(신환 8·재진 32). 구분 없음이 없다
const PLAIN = [day(BEFORE, [line(SHOCK_KEY, 50, 5), line(MANUAL_KEY, 10, 1)]), day(NOW, [line(SHOCK_KEY, 120, 30), line(MANUAL_KEY, 40, 8)])]

type Options = { period?: StatsPeriod; covered?: DateRange[]; opened?: ReadonlySet<string>; onToggle?: (key: string) => void; renderPanel?: (item: Ready) => ReactNode }
function draw(days: DayPayload[], groups: RxGroup[], { period = '30d', covered = WHOLE, opened = new Set(), onToggle = () => {}, renderPanel = (item) => <p>{`${item.group.name} 그래프`}</p> }: Options = {}) {
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

  it('AC-1207.3·AC-4413.2: 막대는 이름 다음 둘째 칸(머리의 막대 칸)이고 칸 폭을 채운다', () => {
    draw(PLAIN, [SHOCK])
    const bar = barOf(rowOf('충격파'))!
    const cell = bar.parentElement!
    expect(hasClasses(cell, 'lg:col-start-2 lg:row-start-1 [&>span]:w-full')).toBe(true)
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
  it('AC-1207.6·AC-4413.2: 신환 + 재진 < 건수이면 줄 아래(이름·막대 칸 밑)에 구분 없음 n건 칩과 두 비율 글자의 합이 있다(건수 7·신환 1·재진 5)', () => {
    draw([day(NOW, [line(SHOCK_KEY, 7, 1, 5)])], [SHOCK])
    const row = rowOf('충격파')
    expect(cellOf(row, '14.2%')).toBeTruthy()
    expect(cellOf(row, '71.4%')).toBeTruthy()
    const chip = cellOf(row, '구분 없음 1건')
    expect(hasClasses(chip, ds.chip.warning)).toBe(true)
    const note = cellOf(row, '신환율과 재진율을 더하면 85.6%예요')
    expect(note.parentElement).toBe(chip.parentElement)
    expect(hasClasses(chip.parentElement!, 'lg:col-[1/3] lg:row-start-2')).toBe(true)
  })

  it('AC-1207.6: 같으면 칩과 설명이 없다(건수 3·신환 1·재진 2의 99.9%에도 없다)', () => {
    draw([day(NOW, [line(SHOCK_KEY, 3, 1)])], [SHOCK])
    const row = rowOf('충격파')
    expect(row.textContent).not.toContain('구분 없음')
    expect(row.textContent).not.toContain('더하면')
  })
})

describe('AC-1207.7·AC-3708.2: 넓은 화면의 머리 줄과 칸', () => {
  it.each([
    ['7d', '지난 7일보다'],
    ['30d', '지난 30일보다'],
    ['90d', '지난 90일보다'],
    ['12m', '작년 같은 12달보다'],
  ] as const)('AC-1207.7·AC-3708.2·AC-4413.2: %s 머리 줄은 묶음·(막대)·건수·총환자 대비·%s·신환·재진이고 화면 읽기에서 숨긴다', (period, compare) => {
    const { container } = draw(PLAIN, [SHOCK], { period })
    const head = headOf(container)
    expect(Array.from(head.children).map((el) => el.textContent)).toEqual(['묶음', '', '건수', '총환자 대비', compare, '신환', '재진', ''])
    expect(head.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-1207.7·AC-3708.2·AC-4413.2: 숫자 머리(건수·총환자 대비·비교·신환·재진)는 오른쪽, 묶음·막대 머리는 왼쪽 정렬이다', () => {
    const { container } = draw(PLAIN, [SHOCK])
    const aligned = Array.from(headOf(container).children).map((el) => el.classList.contains('text-right'))
    expect(aligned).toEqual([false, false, true, true, true, true, true, false])
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

  it('AC-1207.7·AC-3708.2·AC-4413.2: 넓은 화면의 칸 자리는 막대 2 · 건수 3 · 총환자 대비 4 · 증감 5 · 신환 6 · 재진 7 · 꺾쇠 8이다', () => {
    draw(PLAIN, [SHOCK])
    const row = rowOf('충격파')
    expect(cellOf(row, '120건').classList.contains('lg:col-start-3')).toBe(true)
    expect(within(row).getByText('총환자 대비').parentElement!.classList.contains('lg:col-start-4')).toBe(true)
    expect(cellOf(row, '70건 (+140.0%)').closest('.lg\\:col-start-5')).not.toBeNull()
    expect(within(row).getByText('신환').parentElement!.classList.contains('lg:col-start-6')).toBe(true)
    expect(within(row).getByText('재진').parentElement!.classList.contains('lg:col-start-7')).toBe(true)
    const chev = Array.from(row.querySelectorAll('svg')).find((svg) => !barOf(row)?.contains(svg))!
    expect(chev.classList.contains('lg:col-start-8')).toBe(true)
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

  it('AC-1207.9·AC-3708.2·AC-4413.2: 기다리는 글은 small muted이고 넓으면 막대~재진 자리(2~8번 선, 총환자 대비 칸 포함), 좁으면 이름 아래 폭 전체다', () => {
    draw(MIXED, [SHOCK, CARM, FROZEN])
    for (const text of [STALE, NO_CODES]) {
      const note = screen.getByText(text)
      expect(hasClasses(note, 'text-small text-muted lg:col-[2/8] max-lg:col-[1/4] max-lg:row-start-2'), text).toBe(true)
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

  it('AC-1212.1·AC-3708.3·AC-4413.2: 1줄 이름·코드(왼쪽) + 건수(오른쪽) + 꺾쇠 / 2줄 막대(폭 전체) / 3줄 총환자 대비(왼쪽) + 증감(오른쪽) / 4줄 신환(왼쪽) + 재진(오른쪽) / 5줄 구분 없음', () => {
    draw([day(BEFORE, [line(SHOCK_KEY, 5, 1)]), day(NOW, [line(SHOCK_KEY, 7, 1, 5)])], [SHOCK])
    const row = rowOf('충격파')
    expect(hasClasses(cellOf(row, '충격파').parentElement!, 'max-lg:col-start-1 max-lg:row-start-1')).toBe(true)
    const chev = Array.from(row.querySelectorAll('svg')).find((svg) => !barOf(row)?.contains(svg))!
    expect(hasClasses(chev, 'max-lg:col-start-3 max-lg:row-start-1')).toBe(true)
    expect(hasClasses(cellOf(row, '7건'), 'max-lg:col-start-2 max-lg:row-start-1 text-right')).toBe(true)
    expect(hasClasses(barOf(row)!.parentElement!, 'max-lg:col-[1/4] max-lg:row-start-2')).toBe(true)
    expect(hasClasses(within(row).getByText('총환자 대비').parentElement!, 'max-lg:col-start-1 max-lg:row-start-3 max-lg:text-left')).toBe(true)
    expect(hasClasses(cellOf(row, '2건 (+40.0%)').closest('.max-lg\\:row-start-3.max-lg\\:col-\\[2\\/4\\]')!, 'text-right')).toBe(true)
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

  it('AC-1705.2·AC-3708.2·AC-4413.2: 머리에 비교마다 "{name}보다"가 있다(9월보다·작년 10월보다). 총환자 대비 칸은 비교 앞이다', () => {
    const { container } = drawPick(THREE)
    expect(headTexts(container)).toEqual(['묶음', '', '건수', '총환자 대비', '9월보다', '작년 10월보다', '신환', '재진', ''])
    expect(headOf(container).classList.contains(COLUMNS_TWO)).toBe(true)
  })

  it('AC-1705.2·AC-3708.2·AC-4413.2: 해는 "2025년보다" 하나다', () => {
    const { container } = drawPick([day('2025-03-02', [line(SHOCK_KEY, 40, 4)]), day('2026-03-02', [line(SHOCK_KEY, 60, 6)])], { kind: 'year', year: '2026' })
    expect(headTexts(container)).toEqual(['묶음', '', '건수', '총환자 대비', '2025년보다', '신환', '재진', ''])
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
  it('AC-1705.5·AC-3708.2·AC-4413.2: 머리는 묶음·(막대)·건수·총환자 대비·"지난 30일보다"·신환·재진이고 칸 폭이 한 비교 칸 그대로다', () => {
    const { container } = draw(PLAIN, [SHOCK])
    expect(Array.from(headOf(container).children).map((cell) => cell.textContent)).toEqual(['묶음', '', '건수', '총환자 대비', '지난 30일보다', '신환', '재진', ''])
    expect(headOf(container).classList.contains(COLUMNS)).toBe(true)
    expect(screen.queryByText(/자료가 없어요\. 비트 PC에서 그 기간을 불러오면 보여요\./)).toBeNull()
  })
})

// ── group-exclude REQ-3708: 총환자·총환자 대비·조건·빼는 처방 ─────────────────
// 이번 30일(10월 14일 – 11월 12일)에 저장된 날 둘: 11월 2일 총환자 1,000명, 11월 3일 234명 → 1,234명. 지난 30일 9월 21일 300명은 들지 않는다
const PEOPLE = [
  day(BEFORE, [line(SHOCK_KEY, 50, 5), line(MANUAL_KEY, 10, 1)], 300),
  day(NOW, [line(SHOCK_KEY, 120, 30), line(MANUAL_KEY, 40, 8)], 1000),
  day('2026-11-03', [line(SHOCK_KEY, 0), line(MANUAL_KEY, 0)], 234),
]
const ALL_TEXT = '이 기간 총환자 1,234명 · 날마다 온 환자 수를 더한 값'
// 빼는 처방·조건 든 묶음(지어낸 코드). 조건은 넣는 처방 차례와 다르게 적어 둔다(MM080 먼저)
const BASIC: StatsRxGroup = {
  id: 'g5',
  name: '기본 PT',
  codes: ['MM010', 'MM015', 'MM080'],
  out: ['ESWT7', '도수'],
  cond: [
    { code: 'MM080', unless: ['MM020', 'MM030', 'TENS'] },
    { code: 'MM015', unless: ['TENS'] },
  ],
  sortOrder: 5,
}
const BASIC_KEY = groupKey(BASIC.codes, BASIC)
const textOf = (text: string) => screen.getByText((_, el) => el !== null && el.tagName === 'P' && el.textContent === text)
const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
const nameCellOf = (item: HTMLElement, name: string) => within(item).getByText(name).parentElement!

describe('AC-3708.1: 표 위 총환자 줄', () => {
  it('AC-3708.1: 표 위에 `이 기간 총환자 N명 · 날마다 온 환자 수를 더한 값`이 있고 N(600)은 periodPatients(input.days, 이번 기간)다', () => {
    const { container, input } = draw(PEOPLE, [SHOCK, MANUAL])
    const all = textOf(ALL_TEXT)
    expect(periodPatients(input.days, input.range.current).patients).toBe(1234)
    expect(hasClasses(within(all).getByText('1,234명'), 'font-semibold text-ink')).toBe(true)
    expect(hasClasses(all, 'text-small text-ink-2')).toBe(true)
    expect(hasClasses(within(all).getByText('· 날마다 온 환자 수를 더한 값'), 'text-muted')).toBe(true)
    expect(follows(all, headOf(container))).toBe(true)
    expect(follows(all, container.querySelector('ul')!)).toBe(true)
  })

  it('AC-3708.1: 같은 날 줄이 둘이면 뒤의 줄 총환자를 쓴다(rowsIn 규칙)', () => {
    draw([day(NOW, [line(SHOCK_KEY, 1)], 50), day(NOW, [line(SHOCK_KEY, 2)], 70)], [SHOCK])
    expect(textOf('이 기간 총환자 70명 · 날마다 온 환자 수를 더한 값')).toBeTruthy()
  })
})

describe('AC-3708.2: 넓은 화면의 총환자 대비 칸', () => {
  it('AC-3708.2·AC-4413.2: 준비된 줄마다 총환자 대비 칸에 rateText(건수, 총환자)가 있다(600·오른쪽·고정폭, 이름표는 넓으면 화면 읽기에만)', () => {
    draw(PEOPLE, [SHOCK, MANUAL])
    // 충격파 120 ÷ 1,234 = 9.72…% → 9.7%, 도수치료 40 ÷ 1,234 = 3.24…% → 3.2%
    for (const [name, count, text] of [
      ['충격파', 120, '9.7%'],
      ['도수치료', 40, '3.2%'],
    ] as const) {
      const row = rowOf(name)
      expect(rateText(count, 1234)).toBe(text)
      const label = within(row).getByText('총환자 대비')
      const cell = label.parentElement!
      expect(cell.textContent, name).toBe(`총환자 대비 ${text}`)
      expect(hasClasses(cell, 'font-semibold text-right tabular-nums lg:col-start-4 lg:row-start-1'), name).toBe(true)
      expect(hasClasses(label, 'lg:sr-only text-muted font-normal'), name).toBe(true)
    }
  })

  it('AC-3708.2: 총환자가 0이면 총환자 대비는 –다', () => {
    draw([day(NOW, [line(SHOCK_KEY, 0)], 0)], [SHOCK])
    expect(within(rowOf('충격파')).getByText('총환자 대비').parentElement!.textContent).toBe('총환자 대비 –')
  })

  it('AC-3708.2·AC-4413.2: 고른 기간에 비교가 둘(작년)이면 총환자 대비 4 · 비교 5·6 · 신환 7 · 재진 8 · 꺾쇠 9이고 기다리는 글은 2~9번 선이다', () => {
    const OCT: StatsPick = { kind: 'month', unit: 'day', month: '2026-10' }
    const days = [day('2025-10-06', [line(SHOCK_KEY, 100, 10)]), day('2026-09-07', [line(SHOCK_KEY, 50, 5)]), day('2026-10-05', [line(SHOCK_KEY, 120, 30)], 400)]
    const input: StatsInput = { days, covered: [{ from: '2025-01-01', to: '2026-11-05' }], range: rangeOf('2026-11-06', OCT, false) }
    render(<TreatmentTable input={input} rows={treatmentRows(input, [SHOCK, CARM])} opened={new Set()} onToggle={() => {}} renderPanel={() => null} />)
    const row = rowOf('충격파')
    expect(within(row).getByText('총환자 대비').parentElement!.textContent).toBe('총환자 대비 30.0%')
    expect(hasClasses(within(row).getByText('총환자 대비').parentElement!, 'lg:col-start-4')).toBe(true)
    expect(hasClasses(within(row).getByText('9월보다').parentElement!, 'lg:col-start-5')).toBe(true)
    expect(hasClasses(within(row).getByText('작년 10월보다').parentElement!, 'lg:col-start-6')).toBe(true)
    expect(hasClasses(within(row).getByText('신환').parentElement!, 'lg:col-start-7')).toBe(true)
    expect(hasClasses(within(row).getByText('재진').parentElement!, 'lg:col-start-8')).toBe(true)
    const chev = Array.from(row.querySelectorAll('svg')).find((svg) => !barOf(row)?.contains(svg))!
    expect(chev.classList.contains('lg:col-start-9')).toBe(true)
    expect(hasClasses(screen.getByText(STALE), 'lg:col-[2/9]')).toBe(true)
  })

  it('AC-3708.2: 기다리는 줄에는 총환자 대비 칸이 없다', () => {
    draw([day(NOW, [line(SHOCK_KEY, 4, 1)])], [SHOCK, CARM, FROZEN])
    expect(within(lineOf('C-arm')).queryByText('총환자 대비')).toBeNull()
    expect(within(lineOf('냉동치료')).queryByText('총환자 대비')).toBeNull()
  })
})

describe('AC-3708.3: 좁은 화면의 총환자 대비', () => {
  it('AC-3708.3·AC-4413.2: 막대 아래 셋째 줄 왼쪽에 `총환자 대비 x%`가 있고 이름표가 보인다(sr-only가 아니다). 머리 줄은 숨는다', () => {
    const { container } = draw(PEOPLE, [SHOCK])
    const row = rowOf('충격파')
    const label = within(row).getByText('총환자 대비')
    expect(label.classList.contains('sr-only')).toBe(false)
    expect(hasClasses(label.parentElement!, 'max-lg:col-start-1 max-lg:row-start-3 max-lg:text-left max-lg:text-small')).toBe(true)
    expect(follows(cellOf(row, '120건'), label)).toBe(true)
    expect(headOf(container).classList.contains('max-lg:hidden')).toBe(true)
  })
})

describe('AC-3708.4: 조건이 있는 넣는 처방', () => {
  it('AC-3708.4: 조건이 있는 코드 뒤에 *가 붙는다(코드 줄은 · 로 이은 caption muted 그대로)', () => {
    draw([day(NOW, [line(BASIC_KEY, 30, 3)])], [BASIC])
    const row = rowOf('기본 PT')
    const codes = cellOf(row, 'MM010 · MM015* · MM080*')
    expect(hasClasses(codes, 'text-caption text-muted')).toBe(true)
  })

  it('AC-3708.4: 코드 줄 아래에 조건마다 `* 조건 {code}은(는) {unless · 이음}와(과) 같이 받으면 안 셈` 줄이 넣는 처방 차례로 있다(* 조건 600 warning)', () => {
    draw([day(NOW, [line(BASIC_KEY, 30, 3)])], [BASIC])
    const row = rowOf('기본 PT')
    const labels = within(row).getAllByText('* 조건')
    expect(labels.map((label) => label.parentElement!.textContent)).toEqual([
      '* 조건 MM015은(는) TENS와(과) 같이 받으면 안 셈',
      '* 조건 MM080은(는) MM020 · MM030 · TENS와(과) 같이 받으면 안 셈',
    ])
    for (const label of labels) {
      expect(hasClasses(label, 'font-semibold text-warning')).toBe(true)
      expect(hasClasses(label.parentElement!, 'block text-caption text-ink-2')).toBe(true)
      expect(label.parentElement!.parentElement).toBe(nameCellOf(row, '기본 PT'))
    }
    expect(follows(cellOf(row, 'MM010 · MM015* · MM080*'), labels[0]!)).toBe(true)
  })

  it('AC-3708.4: 넣는 처방에 없는 코드의 조건·빈 조건은 없는 것이다(* 도 조건 줄도 없다)', () => {
    const loose: StatsRxGroup = { ...BASIC, out: [], cond: [{ code: 'NOPE', unless: ['MM020'] }, { code: 'MM010', unless: [] }] }
    draw([day(NOW, [line(groupKey(loose.codes, loose), 9, 1)])], [loose])
    const row = rowOf('기본 PT')
    expect(cellOf(row, 'MM010 · MM015 · MM080')).toBeTruthy()
    expect(within(row).queryByText('* 조건')).toBeNull()
  })
})

describe('AC-3708.5: 빼는 처방 줄', () => {
  it('AC-3708.5: 이름 칸 맨 아래 줄에 이름표 `빼는 처방`(600 negative)과 코드들(· 이음)이 있다', () => {
    draw([day(NOW, [line(BASIC_KEY, 30, 3)])], [BASIC])
    const row = rowOf('기본 PT')
    const label = within(row).getByText('빼는 처방')
    expect(hasClasses(label, 'font-semibold text-negative')).toBe(true)
    expect(label.parentElement!.textContent).toBe('빼는 처방 ESWT7 · 도수')
    expect(hasClasses(label.parentElement!, 'block text-caption text-ink-2')).toBe(true)
    expect(nameCellOf(row, '기본 PT').lastElementChild).toBe(label.parentElement)
  })

  it('AC-3708.5: 다시 불러와야 하는 줄도 같은 이름 칸(코드 *·조건 줄·빼는 처방 줄)이다', () => {
    draw([day(NOW, [line(SHOCK_KEY, 4, 1)])], [SHOCK, BASIC])
    const item = lineOf('기본 PT')
    expect(item.querySelector('button')).toBeNull()
    expect(within(item).getByText(STALE)).toBeTruthy()
    expect(within(item).getByText('MM010 · MM015* · MM080*')).toBeTruthy()
    expect(within(item).getAllByText('* 조건')).toHaveLength(2)
    expect(within(item).getByText('빼는 처방').parentElement!.textContent).toBe('빼는 처방 ESWT7 · 도수')
  })

  it('AC-3708.5: 처방 없는 줄도 빼는 처방 줄이 있다(코드 줄·조건 줄은 없다)', () => {
    const empty: StatsRxGroup = { id: 'g6', name: '빈 묶음', codes: [], out: ['ESWT7'], sortOrder: 6 }
    draw([day(NOW, [line(SHOCK_KEY, 4, 1)])], [SHOCK, empty])
    const item = lineOf('빈 묶음')
    expect(within(item).getByText(NO_CODES)).toBeTruthy()
    expect(within(item).getByText('빼는 처방').parentElement!.textContent).toBe('빼는 처방 ESWT7')
    expect(within(item).queryByText('* 조건')).toBeNull()
  })

  it('AC-3708.4·AC-3708.5: 빼는 처방·조건이 없는 묶음의 이름 칸은 지금 그대로(이름 + 코드 줄 둘뿐)다', () => {
    draw(PEOPLE, [SHOCK])
    const cell = nameCellOf(rowOf('충격파'), '충격파')
    expect(Array.from(cell.children).map((el) => el.textContent)).toEqual(['충격파', 'ESWT1 · ESWT7'])
    expect(within(rowOf('충격파')).queryByText('빼는 처방')).toBeNull()
  })

  it('AC-3708.4·AC-3708.5: 조건·빼는 처방 줄이 있어도 상자 안 상자가 없고 폭 접두사는 lg:·max-lg:만 쓴다', () => {
    const { container } = draw([day(NOW, [line(BASIC_KEY, 30, 3)])], [BASIC, CARM], { opened: new Set(['g5']) })
    expect(nestedBoxes(container)).toEqual([])
    const OTHER_WIDTH = /^(?:max-)?(?:sm|md|xl|2xl):/
    for (const el of [rowOf('기본 PT'), ...Array.from(rowOf('기본 PT').querySelectorAll('*'))]) {
      const tokens = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
      expect(tokens.filter((token) => OTHER_WIDTH.test(token))).toEqual([])
    }
  })
})

// ── first90: 순위 줄 모양(REQ-4413 AC-4413.2) · 가로 막대 움직임(REQ-4417 AC-4417.2) ─────────────────
describe('AC-4413.2: 순위 줄 — 큰 건수 · 표 위 비교 글 · 아래 글', () => {
  const FOOT = '같은 날 같은 환자는 1건 · 한 환자가 여러 묶음을 받을 수 있어 비율의 합은 100%가 아니에요.'

  it('AC-4413.2: 건수는 "{n}건" 한 글자 덩이이고 크게(18px 600) 오른쪽 정렬·고정폭 숫자다', () => {
    draw(PLAIN, [SHOCK])
    const count = cellOf(rowOf('충격파'), '120건')
    expect(hasClasses(count, 'text-st-18 leading-7 font-semibold text-right tabular-nums')).toBe(true)
    expect(count.classList.contains('max-lg:text-title')).toBe(false)
  })

  it('AC-4413.2: 증감·신환·재진 칸도 오른쪽 정렬이다(좁을 때 왼쪽 칸은 왼쪽)', () => {
    draw(PLAIN, [SHOCK])
    const row = rowOf('충격파')
    expect(hasClasses(cellOf(row, '70건 (+140.0%)').closest('.lg\\:col-start-5')!, 'text-right')).toBe(true)
    expect(hasClasses(within(row).getByText('신환').parentElement!, 'text-right max-lg:text-left')).toBe(true)
    expect(hasClasses(within(row).getByText('재진').parentElement!, 'text-right')).toBe(true)
  })

  it.each([
    ['30d', '증감은 지난 30일(9월 14일 – 10월 13일)과 비교'],
    ['12m', '증감은 작년 같은 12달(2024년 12월 1일 – 2025년 11월 30일)과 비교'],
  ] as const)('AC-4413.2: %s 표 위(총환자 줄 다음)에 1023px 이하에서만 보이는 비교 글 "%s"가 있다', (period, text) => {
    const { container } = draw(PLAIN, [SHOCK], { period })
    const note = screen.getByText(text)
    expect(note.tagName).toBe('P')
    expect(hasClasses(note, 'lg:hidden text-small text-muted')).toBe(true)
    expect(note.previousElementSibling!.textContent).toMatch(/^이 기간 총환자 /)
    expect(follows(note, container.querySelector('ul')!)).toBe(true)
  })

  it('AC-4413.2: 고른 기간에 비교가 둘이면 비교 글도 둘이다', () => {
    const input: StatsInput = {
      days: [day('2025-10-06', [line(SHOCK_KEY, 100, 10)]), day('2026-10-05', [line(SHOCK_KEY, 120, 30)])],
      covered: [{ from: '2025-01-01', to: '2026-11-05' }],
      range: rangeOf('2026-11-06', { kind: 'month', unit: 'day', month: '2026-10' }, false),
    }
    render(<TreatmentTable input={input} rows={treatmentRows(input, [SHOCK])} opened={new Set()} onToggle={() => {}} renderPanel={() => null} />)
    expect(screen.getByText('증감은 9월(9월 1일 – 9월 30일)과 비교')).toBeTruthy()
    expect(screen.getByText('증감은 작년 10월(10월 1일 – 10월 31일)과 비교')).toBeTruthy()
  })

  it('AC-4413.2: 줄 목록 아래에 "같은 날 같은 환자는 1건 · …" 한 줄이 있다(small muted)', () => {
    const { container } = draw(PLAIN, [SHOCK, CARM])
    const foot = screen.getByText(FOOT)
    expect(foot.tagName).toBe('P')
    expect(hasClasses(foot, 'text-small text-muted')).toBe(true)
    expect(follows(container.querySelector('ul')!, foot)).toBe(true)
  })
})

describe('AC-4417.2: 가로 막대 폭 움직임', () => {
  it('AC-4417.2: 묶음 줄 막대(이번 막대)에 st-move-period가 붙는다', () => {
    draw(PLAIN, [SHOCK, MANUAL])
    for (const name of ['충격파', '도수치료']) expect((barOf(rowOf(name))!.querySelector('.bg-accent') as HTMLElement).classList.contains('st-move-period'), name).toBe(true)
  })
})
