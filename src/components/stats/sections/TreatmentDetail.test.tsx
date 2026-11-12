// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { niceScale } from '@/components/charts/scale'
import { plotY } from '@/components/charts/StackedBarChart'
import { chartCells, trendFit } from '@/components/stats/treatmentChart'
import { groupKey, treatmentDetail, treatmentRows, type TreatmentRow } from '@/components/stats/treatmentView'
import { COMPARE_NAME, rangeOf, statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { addDays } from '@/lib/analytics/dates'
import { nestedBoxes } from '@/testing/boxes'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { RxGroup } from '@/types/rxGroups'
import { CHART_NO_SIDE_SCROLL, todayOf } from './parts'
import { TreatmentDetail } from './TreatmentDetail'
import { detailNote } from './trendLabels'

// 처방별 추세 열린 칸 (treatment-trend REQ-1209 AC-1209.2·1209.3·1209.4·1209.6, REQ-1206 AC-1206.5).
// group-exclude REQ-3709: 모양 단추 [건수]·[총환자 대비 %]·요약 줄·추세선·꺾은선·추세 글·안내·표 칸 일곱(시안 docs/mockups/group-exclude chartHtml()).
// 묶음·일 줄은 이 파일 안에서만 지은 가짜다. 묶음 줄(groups)의 id는 groupKey(codes)이고, 열 줄은 treatmentRows(TASK-4)가 낸 준비된 줄이다

type Ready = Extract<TreatmentRow, { kind: 'ready' }>
type Line = [id: string, patients: number, newPatients?: number]

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]
const NAME = '가짜 충격파 묶음'
const CODES = ['FAKE1', 'FAKE7']
const KEY = groupKey(CODES)
const OLD_KEY = groupKey(['FAKE1']) // 처방을 바꾸기 전 열쇠
const GROUP: RxGroup = { id: 'g-fake', name: NAME, codes: CODES, sortOrder: 0 }
const NUMBERS = { closed: '숫자로 보기', open: '접기' }
// [건수]·[총환자 대비 %] 안내 끝 글(AC-3709.5)
const TREND_NOTE = '추세선은 쉬는 날(총환자 0명)과 빗금 칸을 빼고 그었어요.'
const countNote = (note: string) => `${note} ${TREND_NOTE}`

// all = 그날 총환자(totals.patients)
function day(ymd: string, lines: Line[], partial = false, all = 10): DayPayload {
  const groups = lines.map(([id, patients, newPatients = 0]) => ({ id, patients, newPatients, returning: patients - newPatients }))
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients: all, newPatients: 2, returning: all - 2, unknown: 0 },
    rx: [],
    groups: groups.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null },
  }
}
const inputOf = (days: DayPayload[], covered: DateRange[], period: StatsPeriod = '30d', today = TODAY): StatsInput => ({ days, covered, range: statsRange(today, period) })
function readyOf(input: StatsInput, group: RxGroup = GROUP): Ready {
  const [row] = treatmentRows(input, [group])
  if (row?.kind !== 'ready') throw new Error(`준비된 줄이 아니다: ${row?.kind}`)
  return row
}
function draw(input: StatsInput, group: RxGroup = GROUP) {
  const item = readyOf(input, group)
  const { container } = render(<TreatmentDetail input={input} item={item} />)
  return { root: container.firstElementChild as HTMLElement, item }
}

const figureOf = (root: HTMLElement) => root.querySelector('.tabular-nums[aria-hidden="true"]') as HTMLElement
const chartBoxOf = (root: HTMLElement) => figureOf(root).parentElement!.parentElement!
const columnsOf = (root: HTMLElement) => Array.from(root.querySelector('.absolute.inset-0.flex')!.children)
const totalsOf = (root: HTMLElement) => root.querySelectorAll('.absolute.inset-0.flex .bottom-full')
const tokens = (el: Element) => el.className.split(/\s+/)
const legendOf = (root: HTMLElement) => Array.from(root.querySelector('ul')!.children).map((li) => li.textContent)
const openTable = (root: HTMLElement) => {
  fireEvent.click(within(root).getByRole('button', { name: NUMBERS.closed }))
  const button = within(root).getByRole('button', { name: NUMBERS.open })
  return document.getElementById(button.getAttribute('aria-controls')!)!
}
const tableRows = (panel: HTMLElement) =>
  within(panel)
    .getAllByRole('row')
    .slice(1)
    .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent))
const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

afterEach(cleanup)

// 지난 기간 줄(9월 21일) + 이번 기간 줄(11월 2일, 총환자 5,000명). 두 기간이 온전히 덮였고 두 날 모두 지금 열쇠로 셌다
const BOTH = [day('2026-09-21', [[KEY, 50, 10]], false, 200), day('2026-11-02', [[KEY, 1234, 300]], false, 5000)]

// 90일 = 12주 6일이라 첫날이 월·화면 13칸, 수~일이면 14칸이다. 비교 기간 첫날은 하루 뒤 요일이다
function quarter(today: string) {
  const range = statsRange(today, '90d')
  const days = [day(addDays(range.current.from, 3), [[KEY, 10, 4]]), day(addDays(range.previous.from, 3), [[KEY, 5, 1]])]
  return inputOf(days, [{ from: '2024-12-01', to: addDays(today, -1) }], '90d', today)
}

describe('AC-1209.2: 열린 칸 짜임', () => {
  it('AC-1209.2·AC-3709.5: 제목 · 범례 · 막대 그림 · 안내 글 · [숫자로 보기]가 이 차례로 있다', () => {
    const { root } = draw(inputOf(BOTH, WHOLE))
    const title = within(root).getByText(`${NAME} · 일별 건수`)
    const legend = root.querySelector('ul')!
    const figure = figureOf(root)
    const note = within(root).getByText(countNote('하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.'))
    const button = within(root).getByRole('button', { name: NUMBERS.closed })
    expect(follows(title, legend)).toBe(true)
    expect(follows(legend, figure)).toBe(true)
    expect(follows(figure, note)).toBe(true)
    expect(follows(note, button)).toBe(true)
    expect(within(root).queryByRole('button', { name: '자세히' })).toBeNull()
  })

  it('AC-1209.2: 긴 묶음 이름의 제목은 칸 안에서 줄을 바꾼다(wrap-anywhere)', () => {
    const long = { ...GROUP, name: '띄어쓰기없이아주길게지은가짜묶음이름띄어쓰기없이아주길게' }
    const { root } = draw(inputOf(BOTH, WHOLE), long)
    expect(tokens(within(root).getByText(`${long.name} · 일별 건수`))).toContain('wrap-anywhere')
  })

  it('AC-1209.2: 범례는 신환·재진·비교 기간이고, 덜 끝난 칸이 없으면 일부 기간이 없다', () => {
    const { root } = draw(inputOf(BOTH, WHOLE))
    expect(legendOf(root)).toEqual(['신환', '재진', '비교 기간'])
  })

  it('AC-1209.2: 덜 끝난 칸이 있으면(12개월 이번 달) 범례 끝에 일부 기간 빗금이 있다', () => {
    const { root } = draw(inputOf([day('2026-10-10', [[KEY, 10]])], WHOLE, '12m'))
    expect(legendOf(root)).toEqual(['신환', '재진', '비교 기간', '일부 기간'])
    expect(root.querySelector('ul')!.lastElementChild!.querySelector('svg')).not.toBeNull()
  })

  it('AC-1209.2: 막대 그림은 compact·단위 건이고 신환·재진을 쌓는다(화면 읽기 표 칸)', () => {
    const { root } = draw(inputOf(BOTH, WHOLE))
    expect(figureOf(root).querySelector('.h-40')).not.toBeNull() // compact 그림 높이
    const chartTable = within(root).getByRole('table', { name: `${NAME} 일별 건수 (건)` })
    expect(within(chartTable).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['기간', '신환', '재진', '합계', '상태', '비교 기간'])
    const nov2 = within(chartTable).getByRole('rowheader', { name: '11월 2일 (월)' }).parentElement!
    expect(within(nov2).getAllByRole('cell').map((td) => td.textContent)).toEqual(['300', '934', '1,234', '완료', '0'])
  })

  it('AC-1209.2·AC-3709.5: 칸 단위 안내 글은 처방 추세 detailNote 뒤에 추세선 글이 붙는다(일·주·달)', () => {
    for (const input of [inputOf(BOTH, WHOLE), quarter('2026-11-16'), inputOf([day('2026-10-10', [[KEY, 10]])], WHOLE, '12m')]) {
      const { root, item } = draw(input)
      const { current } = treatmentDetail(input, item)
      expect(within(root).getByText(countNote(detailNote(input.range.bucket, current, todayOf(input.range))))).toBeTruthy()
      cleanup()
    }
    const { root } = draw(inputOf([day('2026-10-10', [[KEY, 10]])], WHOLE, '12m'))
    expect(within(root).getByText(countNote('빗금 칸은 아직 끝나지 않은 달이에요(11월은 13일까지). 회색 막대는 작년 같은 달이에요.'))).toBeTruthy()
  })
})

describe('AC-1209.3: 칸 나누기와 막대 위 합계(그리기)', () => {
  it('AC-1209.3: 7·30일은 일, 90일은 주, 12개월은 달 칸이고 칸 수는 treatmentDetail 그대로다', () => {
    const cases: [StatsInput, string, number][] = [
      [inputOf([day('2026-11-10', [[KEY, 5, 1]])], WHOLE, '7d'), '일', 7],
      [inputOf(BOTH, WHOLE), '일', 30],
      [quarter('2026-11-16'), '주', 13],
      [quarter('2026-11-14'), '주', 14],
      [inputOf([day('2026-10-10', [[KEY, 10]])], WHOLE, '12m'), '달', 12],
    ]
    for (const [input, grain, cells] of cases) {
      const { root, item } = draw(input)
      expect(within(root).getByText(`${NAME} · ${grain}별 건수`)).toBeTruthy()
      expect(columnsOf(root)).toHaveLength(cells)
      expect(treatmentDetail(input, item).current).toHaveLength(cells)
      cleanup()
    }
  })

  it('AC-1209.3: 90일 13칸 대 14칸 — 채우거나 자르지 않고 13칸 모두 회색 막대, 남는 비교 칸은 그리지 않는다', () => {
    const input = quarter('2026-11-16')
    const { root, item } = draw(input)
    const { current, previous } = treatmentDetail(input, item)
    expect([current.length, previous.length]).toEqual([13, 14])
    const columns = columnsOf(root)
    expect(columns).toHaveLength(13)
    expect(columns.filter((column) => column.querySelector('.bg-faint')).length).toBe(13)
  })

  it('AC-1209.3: 90일 14칸 대 13칸 — 비교 점이 없는 마지막 칸은 회색 막대가 없다', () => {
    const input = quarter('2026-11-14')
    const { root, item } = draw(input)
    const { current, previous } = treatmentDetail(input, item)
    expect([current.length, previous.length]).toEqual([14, 13])
    const columns = columnsOf(root)
    expect(columns).toHaveLength(14)
    expect(columns[12]!.querySelector('.bg-faint')).not.toBeNull()
    expect(columns[13]!.querySelector('.bg-faint')).toBeNull()
  })

  it('AC-1209.3: 칸이 13개를 넘으면(30일·90일 14주) 막대 위 합계 글자가 없고 13개 이하(7일·90일 13주·12개월)는 있다', () => {
    const cases: [StatsInput, number][] = [
      [inputOf([day('2026-11-10', [[KEY, 5, 1]])], WHOLE, '7d'), 7],
      [quarter('2026-11-16'), 13],
      [inputOf([day('2026-10-10', [[KEY, 10]])], WHOLE, '12m'), 12],
      [inputOf(BOTH, WHOLE), 0],
      [quarter('2026-11-14'), 0],
    ]
    for (const [input, totals] of cases) {
      const { root } = draw(input)
      expect(totalsOf(root), input.range.name).toHaveLength(totals)
      cleanup()
    }
  })

  it('AC-1209.3: 휴대폰에서 칸이 13개 이상이면 마지막 칸 글자만 남긴다(thinTotals), 12칸 이하는 그대로다', () => {
    const thin = 'max-md:[&_.text-ink-2]:invisible'
    const cases: [StatsInput, boolean][] = [
      [quarter('2026-11-16'), true],
      [inputOf(BOTH, WHOLE), true],
      [inputOf([day('2026-10-10', [[KEY, 10]])], WHOLE, '12m'), false],
      [inputOf([day('2026-11-10', [[KEY, 5, 1]])], WHOLE, '7d'), false],
    ]
    for (const [input, thinned] of cases) {
      const { root } = draw(input)
      expect(tokens(chartBoxOf(root)).includes(thin), input.range.name).toBe(thinned)
      cleanup()
    }
  })
})

describe('AC-1209.4: [숫자로 보기]', () => {
  it('AC-1209.4: 누르면 글자가 접기가 되고 그림 아래에 표가 열리며, 다시 누르면 숫자로 보기로 돌아가 닫힌다', () => {
    const { root } = draw(inputOf(BOTH, WHOLE))
    const button = within(root).getByRole('button', { name: NUMBERS.closed })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(panel.hidden).toBe(true)
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.textContent).toBe(NUMBERS.open)
    expect(panel.hidden).toBe(false)
    expect(within(panel).getByRole('table', { name: `${NAME} 일별 건수` })).toBeTruthy()
    expect(root.lastElementChild).toBe(panel)
    expect(follows(figureOf(root), panel)).toBe(true)
    expect(follows(within(root).getByText(/^하루씩 센 건수예요/), panel)).toBe(true)
    fireEvent.click(button)
    expect(button.textContent).toBe(NUMBERS.closed)
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hidden).toBe(true)
  })

  it('AC-1209.4·AC-3709.6: 표는 캡션 <이름> 일별 건수, 칸 날짜·건수·총환자·총환자 대비·신환·재진·비교 이름이고 건수는 n건(굵게, 세 자리 쉼표)이다', () => {
    const { root } = draw(inputOf(BOTH, WHOLE))
    const panel = openTable(root)
    expect(within(panel).getByRole('table', { name: `${NAME} 일별 건수` })).toBeTruthy()
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['날짜', '건수', '총환자', '총환자 대비', '신환', '재진', COMPARE_NAME['30d']])
    const rows = tableRows(panel)
    expect(rows).toHaveLength(30)
    // 11월 2일은 기간의 스무째 날, 비교 기간의 같은 차례 날은 10월 3일(줄 없는 덮인 날 = 0건). 1,234 ÷ 5,000 = 24.68% → 24.6%
    expect(rows[19]).toEqual(['11월 2일 (월)', '1,234건', '5,000명', '24.6%', '300', '934', '0건'])
    // 9월 21일 50건: 이번 기간의 여드레째(10월 21일)와 짝이다. 저장된 줄이 없는 날은 총환자 0명·총환자 대비 –
    expect(rows[7]).toEqual(['10월 21일 (수)', '0건', '0명', '–', '0', '0', '50건'])
    expect(tokens(within(panel).getByText('1,234건'))).toContain('font-semibold')
  })

  it('AC-1209.4·AC-3709.6: 12개월은 첫 칸 달, 비교 이름 작년 같은 12달이고 덜 끝난 칸에는 일부 기간 칩이 있다', () => {
    const { root } = draw(inputOf([day('2026-10-10', [[KEY, 10]])], WHOLE, '12m'))
    const panel = openTable(root)
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['달', '건수', '총환자', '총환자 대비', '신환', '재진', '작년 같은 12달'])
    const rows = tableRows(panel)
    expect(rows[0]![0]).toBe('2025년 12월')
    expect(rows[11]![0]).toBe('2026년 11월일부 기간')
    const last = within(panel).getAllByRole('row').at(-1)!
    expect(tokens(within(last).getByText('일부 기간'))).toContain('text-warning')
    expect(rows.slice(0, 11).every((row) => !row[0]!.includes('일부 기간'))).toBe(true)
  })

  it('AC-1209.4·AC-3709.6: 90일은 첫 칸 주(시작 – 끝)이고 비교 점이 없는 칸은 –다', () => {
    const { root } = draw(quarter('2026-11-14'))
    const panel = openTable(root)
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['주', '건수', '총환자', '총환자 대비', '신환', '재진', COMPARE_NAME['90d']])
    const rows = tableRows(panel)
    expect(rows).toHaveLength(14)
    expect(rows[0]![0]).toMatch(/^\d+월 \d+일 – \d+월 \d+일/)
    expect(rows[13]![6]).toBe('–')
    expect(rows[12]![6]).not.toBe('–')
  })

  it('AC-1209.4·AC-3709.6: 비교 칸이 덮이지 않았으면 표 비교 칸은 –이고 0건이 아니다', () => {
    const { root } = draw(inputOf([day('2026-11-02', [[KEY, 100]])], [{ from: '2026-10-14', to: '2026-11-12' }]))
    const compare = tableRows(openTable(root)).map((row) => row[6])
    expect(compare).toHaveLength(30)
    expect(new Set(compare)).toEqual(new Set(['–']))
  })
})

describe('AC-1206.5: 비교 기간을 지금 열쇠로 세지 않은 묶음', () => {
  // 비교 기간 9월 21일은 처방을 바꾸기 전 열쇠로만 셌다 → 이 묶음은 견주지 않는다
  const OLD_PREVIOUS = [day('2026-09-21', [[OLD_KEY, 50, 10]]), day('2026-11-02', [[KEY, 100, 30]])]

  it('AC-1206.5: 비교 기간 일 줄에 열쇠가 하나라도 없으면 열린 그래프에 회색 막대가 없고 표 비교 칸이 모두 –다', () => {
    const input = inputOf(OLD_PREVIOUS, WHOLE)
    const { root, item } = draw(input)
    expect(item.compared).toBe(false)
    for (const column of columnsOf(root)) expect(column.querySelector('.bg-faint')).toBeNull()
    const chartTable = within(root).getByRole('table', { name: `${NAME} 일별 건수 (건)` })
    expect(within(chartTable).queryByRole('columnheader', { name: '비교 기간' })).toBeNull()
    const compare = tableRows(openTable(root)).map((row) => row[6])
    expect(new Set(compare)).toEqual(new Set(['–']))
    expect(root.textContent).not.toContain('50건') // 옛 열쇠로 센 값은 쓰지 않는다
  })

  it('AC-1206.5: 비교 기간도 지금 열쇠로 셌으면 같은 차례 칸에 회색 막대가 있고 표 비교 칸(일곱째 칸)이 n건이다', () => {
    const input = inputOf(BOTH, WHOLE)
    const { root, item } = draw(input)
    expect(item.compared).toBe(true)
    const columns = columnsOf(root)
    expect(columns.every((column) => column.querySelector('.bg-faint') !== null)).toBe(true)
    const rows = tableRows(openTable(root))
    expect(rows.every((row) => row[6] !== '–')).toBe(true)
    expect(rows[7]![6]).toBe('50건')
  })
})

describe('AC-1209.6: 휴대폰에서 열린 칸', () => {
  // 열린 칸 바탕(bg-canvas)·여백·휴대폰 좌우 끝 넓힘(max-md:-mx-4)은 이 그림을 담는 표의 칸(TreatmentTable, TASK-11 시험)이 맡는다.
  // 이 칸이 또 넓히면 휴대폰에서 16px씩 화면 밖으로 나가 쪽이 옆으로 밀린다
  it('AC-1209.6: 숫자 표 머리는 열린 칸과 같은 canvas 바탕이고, 이 칸은 다시 넓히거나 여백을 겹치지 않는다', () => {
    const { root } = draw(inputOf(BOTH, WHOLE))
    expect(tokens(root)).toContain('[&_th]:bg-canvas')
    for (const name of ['max-md:-mx-4', 'p-4', 'bg-canvas']) expect(tokens(root)).not.toContain(name)
  })

  it('AC-1209.6: 그림 칸은 쪽을 옆으로 밀지 않는다(CHART_NO_SIDE_SCROLL). 선택자는 날짜 글자 칸과 화면 읽기 표만 잡는다', () => {
    const { root } = draw(inputOf(BOTH, WHOLE))
    const box = chartBoxOf(root)
    expect(tokens(box)).toEqual(expect.arrayContaining(CHART_NO_SIDE_SCROLL.split(' ')))
    const labelCells = Array.from(figureOf(root).lastElementChild!.children)
    expect(labelCells).toHaveLength(30)
    expect(Array.from(box.querySelectorAll('.text-center'))).toEqual(labelCells)
    expect(Array.from(box.querySelectorAll('table')).map((table) => table.className)).toEqual(['sr-only'])
  })
})

describe('AC-1209.4: 이 칸만 단추 글자를 바꾼다', () => {
  it('AC-1209.4: 열린 칸의 [숫자로 보기]는 [자세히]가 아니다', () => {
    draw(inputOf(BOTH, WHOLE))
    expect(screen.queryByRole('button', { name: '자세히' })).toBeNull()
    expect(screen.getByRole('button', { name: NUMBERS.closed })).toBeTruthy()
  })
})

// ── 고른 기간 (stats-period AC-1705.4). 오늘은 2026-11-06(금)이다 ─────────────────
describe('AC-1705.4: 고른 기간의 처방별 추세 열린 칸', () => {
  const P_TODAY = '2026-11-06'
  const pickInput = (unit: 'day' | 'week'): StatsInput => ({
    days: [day('2026-09-07', [[KEY, 40, 10]]), day('2026-10-05', [[KEY, 100, 30]])],
    covered: [{ from: '2025-01-01', to: '2026-11-05' }],
    range: rangeOf(P_TODAY, { kind: 'month', unit, month: '2026-10' }, false),
  })

  it('AC-1705.4·AC-3709.6: 주별이면 칸은 주이고 표의 비교 칸 이름은 바로 전 기간 이름(9월)이다', () => {
    const { root } = draw(pickInput('week'))
    expect(within(root).getByText(`${NAME} · 주별 건수`)).toBeTruthy()
    const table = openTable(root)
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['주', '건수', '총환자', '총환자 대비', '신환', '재진', '9월'])
  })

  it('AC-1705.4·AC-3709.5: 일별이면 칸은 날이고 회색 막대(표 비교 칸)는 바로 전 기간의 같은 차례 날이다', () => {
    const input = pickInput('day')
    const { root, item } = draw(input)
    expect(within(root).getByText(`${NAME} · 일별 건수`)).toBeTruthy()
    const { current, previous } = treatmentDetail(input, item)
    expect(current[0]?.start).toBe('2026-10-01')
    expect(previous[0]?.start).toBe('2026-09-01')
    expect(within(root).getByText(countNote(detailNote('day', current, P_TODAY, true)))).toBeTruthy()
  })

  it('AC-3709.2: 고른 기간의 합계 이름은 `{기간 이름} 합계`다', () => {
    const { root } = draw(pickInput('day'))
    expect(within(root).getByText('2026년 10월 합계').parentElement!.textContent).toContain('2026년 10월 합계 100건')
  })

  it('AC-1705.4: 해 고르기의 끝나지 않은 달 글은 끝난 날까지다(오늘 진료가 안 끝났으면 어제 11월 5일, 끝났으면 오늘 6일)', () => {
    const yearInput = (todayDone: boolean): StatsInput => ({
      days: [day('2026-10-05', [[KEY, 100, 30]]), day('2026-11-02', [[KEY, 10, 3]])],
      covered: [{ from: '2025-01-01', to: todayDone ? P_TODAY : '2026-11-05' }],
      range: rangeOf(P_TODAY, { kind: 'year', year: '2026' }, todayDone),
    })
    const { root } = draw(yearInput(false))
    expect(within(root).getByText(countNote('빗금 칸은 아직 끝나지 않은 달이에요(11월은 5일까지). 회색 막대는 비교 기간의 같은 차례 달이에요.'))).toBeTruthy()
    cleanup()
    const { root: done } = draw(yearInput(true))
    expect(within(done).getByText(countNote('빗금 칸은 아직 끝나지 않은 달이에요(11월은 6일까지). 회색 막대는 비교 기간의 같은 차례 달이에요.'))).toBeTruthy()
  })
})

// ── group-exclude REQ-3709: [건수]·[총환자 대비 %] ─────────────────
// 최근 7일 칸마다 [건수, 신환, 총환자]. 셋째 날은 쉬는 날(저장된 줄 없음 → 총환자 0, 추세선·꺾은선에서 빠짐)
const R7 = statsRange(TODAY, '7d').current
const WEEK: Array<[number, number, number] | null> = [[10, 2, 100], [12, 3, 100], null, [14, 4, 100], [16, 4, 200], [18, 5, 100], [20, 5, 100]]
const SEVEN = WEEK.flatMap((cell, i) => (cell === null ? [] : [day(addDays(R7.from, i), [[KEY, cell[0], cell[1]]], false, cell[2])]))
const sevenInput = () => inputOf(SEVEN, WHOLE, '7d')
const MODE = { count: '건수', pct: '총환자 대비 %' }
const modeButton = (root: HTMLElement, name: string) => within(root).getByRole('button', { name })
const pressed = (root: HTMLElement) => [modeButton(root, MODE.count), modeButton(root, MODE.pct)].map((b) => b.getAttribute('aria-pressed'))
const trendLineOf = (root: HTMLElement) => figureOf(root).querySelector('line[stroke-dasharray="6 4"]')
const summaryOf = (root: HTMLElement) => within(root).getByText(/ 합계$/).parentElement!
const trendTextOf = (root: HTMLElement) => within(root).getByText(/^추세선(?:으로 보면|을 그을)/)
const COUNT_TREND = '추세선으로 보면 하루에 약 1.6건씩 늘어나는 흐름이에요.'
const PCT_TREND = '추세선으로 보면 총환자 대비 비율이 하루에 약 1.3%p씩 오르는 흐름이에요. (%p = 퍼센트끼리 뺀 차이, 예: 22%에서 23%는 1%p)'

describe('AC-3709.1: 열린 칸 머리와 모양 단추', () => {
  it('AC-3709.1: 왼쪽 제목 `{이름} · 일별 건수`, 오른쪽 단추 묶음 [건수] [총환자 대비 %](ds.segment, aria-pressed, 처음 [건수])이다', () => {
    const { root } = draw(sevenInput())
    const title = within(root).getByText(`${NAME} · 일별 건수`)
    const group = within(root).getByRole('group', { name: '그래프 모양' })
    expect(title.parentElement).toBe(group.parentElement)
    expect(follows(title, group)).toBe(true)
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([MODE.count, MODE.pct])
    expect(pressed(root)).toEqual(['true', 'false'])
    expect(tokens(group)).toEqual(expect.arrayContaining(`${ds.segment.group} max-md:grid-cols-2`.split(' ')))
    expect(tokens(modeButton(root, MODE.count))).toEqual(expect.arrayContaining(`${ds.segment.button} ${ds.segment.on}`.split(' ')))
    expect(tokens(modeButton(root, MODE.pct))).toEqual(expect.arrayContaining(`${ds.segment.button} ${ds.segment.off}`.split(' ')))
  })

  it('AC-3709.1: [총환자 대비 %]를 누르면 제목이 `{이름} · {일|주|달}별 총환자 대비`가 되고 눌린 단추가 바뀐다', () => {
    for (const [input, grain] of [
      [sevenInput(), '일'],
      [quarter('2026-11-16'), '주'],
      [inputOf([day('2026-10-10', [[KEY, 10]])], WHOLE, '12m'), '달'],
    ] as const) {
      const { root } = draw(input)
      fireEvent.click(modeButton(root, MODE.pct))
      expect(within(root).getByText(`${NAME} · ${grain}별 총환자 대비`)).toBeTruthy()
      expect(pressed(root)).toEqual(['false', 'true'])
      fireEvent.click(modeButton(root, MODE.count))
      expect(within(root).getByText(`${NAME} · ${grain}별 건수`)).toBeTruthy()
      cleanup()
    }
  })

  it('AC-3709.1: 단추 묶음이 있어도 상자 안 상자가 없다', () => {
    const { root } = draw(sevenInput())
    fireEvent.click(modeButton(root, MODE.pct))
    openTable(root)
    expect(nestedBoxes(root)).toEqual([])
  })
})

describe('AC-3709.2: 요약 줄', () => {
  it('AC-3709.2: `{합계 이름} N건` · `총환자 T명 중 x%` · `하루 평균 a건 (진료한 날 m일)`이고 N·x·a는 600이다', () => {
    const { root } = draw(sevenInput())
    const summary = summaryOf(root)
    // 90건 ÷ 700명 = 12.85…% → 12.8%, 90건 ÷ 진료한 날 6일 = 15.0건
    expect(Array.from(summary.children).map((el) => el.textContent)).toEqual(['최근 7일 합계 90건', '총환자 700명 중 12.8%', '하루 평균 15.0건 (진료한 날 6일)'])
    for (const text of ['90건', '12.8%', '15.0건']) expect(tokens(within(summary).getByText(text)), text).toEqual(expect.arrayContaining(['font-semibold', 'text-ink']))
    expect(tokens(summary)).toEqual(expect.arrayContaining(['text-small', 'text-ink-2']))
    expect(follows(within(root).getByText(`${NAME} · 일별 건수`), summary)).toBe(true)
    expect(follows(summary, root.querySelector('ul')!)).toBe(true)
  })

  it('AC-3709.2: 12개월은 `1년(최근 12개월) 합계`다. [총환자 대비 %]에서도 요약은 같다', () => {
    const { root } = draw(inputOf([day('2026-10-10', [[KEY, 10]], false, 40)], WHOLE, '12m'))
    expect(summaryOf(root).firstElementChild!.textContent).toBe('1년(최근 12개월) 합계 10건')
    fireEvent.click(modeButton(root, MODE.pct))
    expect(Array.from(summaryOf(root).children).map((el) => el.textContent)).toEqual(['1년(최근 12개월) 합계 10건', '총환자 40명 중 25.0%', '하루 평균 10.0건 (진료한 날 1일)'])
  })
})

describe('AC-3709.3: [건수] 막대 위 추세선', () => {
  it('AC-3709.3: 막대 그림 칸 안에 점선 추세선(ink 2px)이 쉬는 날을 뺀 최소제곱 직선의 첫·끝 칸 가운데를 잇는다', () => {
    const input = sevenInput()
    const { root, item } = draw(input)
    const fit = trendFit(chartCells(input, item), 'count')!
    expect([fit.from, fit.to]).toEqual([0, 6])
    const line = trendLineOf(root)!
    const max = niceScale(20).max
    expect(line.getAttribute('x1')).toBe('0.5')
    expect(line.getAttribute('x2')).toBe('6.5')
    expect(Number(line.getAttribute('y1'))).toBe(plotY(fit.intercept, max))
    expect(Number(line.getAttribute('y2'))).toBe(plotY(fit.intercept + fit.slope * 6, max))
    expect(line.getAttribute('stroke-width')).toBe('2')
    expect(line.getAttribute('class')!.split(/\s+/)).toContain('stroke-ink')
    expect(columnsOf(root)).toHaveLength(7)
  })

  it('AC-3709.3: 범례 끝에 추세선(점선 표시)이 있다', () => {
    const { root } = draw(sevenInput())
    expect(legendOf(root)).toEqual(['신환', '재진', '비교 기간', '추세선'])
    expect(root.querySelector('ul')!.lastElementChild!.querySelector('svg line')!.getAttribute('stroke-dasharray')).not.toBeNull()
  })

  it('AC-3709.3: 추세선을 그을 칸이 둘보다 적으면 선과 범례 추세선이 없다', () => {
    const { root } = draw(inputOf(BOTH, WHOLE))
    expect(trendLineOf(root)).toBeNull()
    expect(legendOf(root)).not.toContain('추세선')
  })
})

describe('AC-3709.4: [총환자 대비 %] 꺾은선', () => {
  const pctOf = (input: StatsInput) => {
    const view = draw(input)
    fireEvent.click(modeButton(view.root, MODE.pct))
    return view
  }

  it('AC-3709.4: 칸마다 총환자 대비 점과 accent 꺾은선(총환자 0인 칸은 점이 없고 선이 건너뜀), 점선 추세선, 단위 %다', () => {
    const { root } = pctOf(sevenInput())
    const figure = figureOf(root)
    expect(within(figure).getByText('(%)')).toBeTruthy()
    const polyline = figure.querySelector('polyline')!
    expect(polyline.getAttribute('class')!.split(/\s+/)).toContain('stroke-accent')
    // 쉬는 날(셋째 칸)을 건너 여섯 점을 잇는다
    expect(polyline.getAttribute('points')!.split(' ').map((p) => p.split(',')[0])).toEqual(['0.5', '1.5', '3.5', '4.5', '5.5', '6.5'])
    expect(figure.querySelectorAll('circle')).toHaveLength(6)
    expect(trendLineOf(root)).not.toBeNull()
    expect(columnsOf(root)).toHaveLength(7)
  })

  it('AC-3709.4: 칸이 13개 이하이면 점 위에 x.x%(버림)가 있다', () => {
    const { root } = pctOf(sevenInput())
    expect(within(figureOf(root)).getAllByText(/^\d+\.\d%$/).map((el) => el.textContent)).toEqual(['10.0%', '12.0%', '14.0%', '8.0%', '18.0%', '20.0%'])
  })

  it('AC-3709.4: 칸이 13개를 넘으면(30일) 점 위 글이 없다', () => {
    const { root } = pctOf(inputOf(BOTH, WHOLE))
    expect(within(figureOf(root)).queryAllByText(/^\d+\.\d%$/)).toHaveLength(0)
  })

  it('AC-3709.4: 범례는 총환자 대비 %(선)·추세선이고, 추세선을 그을 칸이 모자라면 총환자 대비 %뿐이다', () => {
    const { root } = pctOf(sevenInput())
    expect(legendOf(root)).toEqual(['총환자 대비 %', '추세선'])
    cleanup()
    const { root: few } = pctOf(inputOf(BOTH, WHOLE))
    expect(legendOf(few)).toEqual(['총환자 대비 %'])
    expect(trendLineOf(few)).toBeNull()
  })

  it('AC-3709.4: 그림 칸은 쪽을 옆으로 밀지 않는다(CHART_NO_SIDE_SCROLL)', () => {
    const { root } = pctOf(sevenInput())
    expect(tokens(chartBoxOf(root))).toEqual(expect.arrayContaining(CHART_NO_SIDE_SCROLL.split(' ')))
  })
})

describe('AC-3709.5: 추세 글과 안내', () => {
  it('AC-3709.5: [건수]이면 그래프 아래에 추세 글(왼쪽 2px ink 선)이 있고 그 아래 안내가 detailNote + 추세선 글이다', () => {
    const input = sevenInput()
    const { root, item } = draw(input)
    const trend = trendTextOf(root)
    expect(trend.textContent).toBe(COUNT_TREND)
    expect(tokens(trend)).toEqual(expect.arrayContaining(['border-l-2', 'border-ink', 'pl-3']))
    const { current } = treatmentDetail(input, item)
    const note = within(root).getByText(countNote(detailNote('day', current, todayOf(input.range))))
    expect(follows(figureOf(root), trend)).toBe(true)
    expect(follows(trend, note)).toBe(true)
    expect(follows(note, within(root).getByRole('button', { name: NUMBERS.closed }))).toBe(true)
  })

  it('AC-3709.5: [총환자 대비 %]이면 추세 글이 %p 글이고 안내가 `총환자 대비 = 그 {일|주|달}의 {이름} 건수 ÷ 그 {일|주|달}의 총환자예요.` + 추세선 글이다', () => {
    const { root } = draw(sevenInput())
    fireEvent.click(modeButton(root, MODE.pct))
    expect(trendTextOf(root).textContent).toBe(PCT_TREND)
    expect(within(root).getByText(`총환자 대비 = 그 일의 ${NAME} 건수 ÷ 그 일의 총환자예요. ${TREND_NOTE}`)).toBeTruthy()
    cleanup()
    const { root: weeks } = draw(quarter('2026-11-16'))
    fireEvent.click(modeButton(weeks, MODE.pct))
    expect(within(weeks).getByText(`총환자 대비 = 그 주의 ${NAME} 건수 ÷ 그 주의 총환자예요. ${TREND_NOTE}`)).toBeTruthy()
  })

  it('AC-3709.5·AC-3707.4: 추세선을 그을 칸이 모자라면 추세 글이 `추세선을 그을 칸이 모자라요.`다', () => {
    const { root } = draw(inputOf(BOTH, WHOLE))
    expect(trendTextOf(root).textContent).toBe('추세선을 그을 칸이 모자라요.')
  })
})

describe('AC-3709.6: [숫자로 보기] 표 칸 일곱', () => {
  it('AC-3709.6: 칸은 날짜·건수·총환자(n명)·총환자 대비(rateText)·신환·재진·비교 이름이고 두 모양에서 같다', () => {
    const { root } = draw(sevenInput())
    const panel = openTable(root)
    const columns = ['날짜', '건수', '총환자', '총환자 대비', '신환', '재진', COMPARE_NAME['7d']]
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(columns)
    const rows = tableRows(panel).map((row) => row.slice(1))
    expect(rows).toEqual([
      ['10건', '100명', '10.0%', '2', '8', '0건'],
      ['12건', '100명', '12.0%', '3', '9', '0건'],
      ['0건', '0명', '–', '0', '0', '0건'],
      ['14건', '100명', '14.0%', '4', '10', '0건'],
      ['16건', '200명', '8.0%', '4', '12', '0건'],
      ['18건', '100명', '18.0%', '5', '13', '0건'],
      ['20건', '100명', '20.0%', '5', '15', '0건'],
    ])
    fireEvent.click(modeButton(root, MODE.pct))
    expect(within(panel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(columns)
    expect(panel.hidden).toBe(false)
  })
})

describe('AC-3709.7: 모양 prop', () => {
  it('AC-3709.7: mode·onMode를 주면 그 모양을 그리고 단추는 onMode만 부른다(제 상태로 바꾸지 않는다)', () => {
    const input = sevenInput()
    const item = readyOf(input)
    const onMode = vi.fn()
    const { container } = render(<TreatmentDetail input={input} item={item} mode="pct" onMode={onMode} />)
    const root = container.firstElementChild as HTMLElement
    expect(pressed(root)).toEqual(['false', 'true'])
    expect(within(root).getByText(`${NAME} · 일별 총환자 대비`)).toBeTruthy()
    fireEvent.click(modeButton(root, MODE.count))
    expect(onMode).toHaveBeenCalledWith('count')
    expect(pressed(root)).toEqual(['false', 'true'])
  })

  it('AC-3709.7: 두 prop이 없으면 제 상태로 [건수]부터 그리고 단추로 바뀐다', () => {
    const { root } = draw(sevenInput())
    expect(pressed(root)).toEqual(['true', 'false'])
    fireEvent.click(modeButton(root, MODE.pct))
    expect(pressed(root)).toEqual(['false', 'true'])
  })
})

describe('AC-3709.8: 화면 읽기', () => {
  it('AC-3709.8: 두 그림은 꾸밈(aria-hidden)이고, 꺾은선 표는 칸마다 기간 | 총환자 대비 | 상태다(값 없으면 –)', () => {
    const { root } = draw(sevenInput())
    expect(figureOf(root).getAttribute('aria-hidden')).toBe('true')
    expect(within(root).getByRole('table', { name: `${NAME} 일별 건수 (건)` })).toBeTruthy()
    fireEvent.click(modeButton(root, MODE.pct))
    expect(figureOf(root).getAttribute('aria-hidden')).toBe('true')
    const table = within(root).getByRole('table', { name: `${NAME} 일별 총환자 대비 (%)` })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['기간', '총환자 대비', '상태'])
    const cells = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((tr) => within(tr).getAllByRole('cell').map((td) => td.textContent))
    expect(cells.map((row) => row[0])).toEqual(['10.0%', '12.0%', '–', '14.0%', '8.0%', '18.0%', '20.0%'])
  })
})
