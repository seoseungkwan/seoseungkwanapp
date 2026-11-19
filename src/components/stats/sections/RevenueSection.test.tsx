// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BarBucket } from '@/components/charts/StackedBarChart'
import type { Kpi, StackChart, TreatmentRow } from '@/components/revenue/types'
import type { PerVisitTab, RevenueSplitRow, RevenueTabs, SplitTab, TreatmentsTab, TrendTab } from '@/components/stats/revenueView'
import { groupKey } from '@/components/stats/treatmentView'
import type { StatsRxGroup } from '@/types/rxGroups'
import { rangeOf } from '@/components/stats/view'
import type { BitSectionsView, PeriodValue } from '@/types/stats'
import { nestedBoxes } from '@/testing/boxes'
import type { BitSectionsShown } from './PatientMixSection'
import { SectionAnchor, StatsCard, TOC_SCROLL } from './parts'
import { RevenueSection } from './RevenueSection'

// 통계 매출 칸 (stats-revenue TASK-5, REQ-4107 · AC-4107.1(칸 안 구조)~AC-4107.10, design.md '칸 부품', 시안 docs/mockups/stats-revenue).
// 넘김 값은 revenueView(TASK-4)가 주는 모양을 이 파일에서 손으로 만든 가짜다(시안 숫자·글, 이름·숫자는 모두 지어낸 값). 숫자·글을 만드는 셈은 revenueView.test.ts가 본다

afterEach(cleanup)

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

const NOTE = '휴진한 날은 칸이 없어요.'
// 매출 추이 [어떻게 세나요?] 세 문단(bit-total AC-6905.3)
const TREND_HOW = [
  '매출은 수납한 날(회계일)의 총진료비예요. 총진료비 = 공단부담 + 본인부담 + 비급여 + 기타이고, 그날 정상 수납한 것과 미수금으로 들어온 것을 더해요.',
  '환불·변경수납·예치금이 있거나 수납 연결이 겹친 날도 다른 날과 같은 기준으로 매출에 넣어요. 도우미 0.13.0 전에 불러온 그런 날은 그날 수납한 줄의 총진료비(원장님별 표와 같은 기준, 환불은 빼기)를 넣고, 급여·비급여·기타로는 나누지 못해요.',
  '막대 칸은 환자 수 추이와 같아요: 최근 7일·30일·90일은 하루씩, 최근 12개월은 한 달씩, 기간 골라 보기는 고른 단위(일별·주별·월별)예요.',
]
const SPLIT_HOW = [
  '매출은 총진료비예요. 급여(요양비용총액)는 공단이 내는 몫과 환자가 내는 몫(본인부담)을 더한 금액, 비급여는 환자가 모두 내는 금액, 기타는 100/100 미만 항목과 전액 본인부담 금액이에요. 셋을 더하면 매출이에요.',
  '막대는 날마다 아래부터 급여·비급여·기타예요. 나눔을 못 한 날은 막대가 없어요.',
]
const TREAT_HOW = [
  "처방 금액(단가 × 수량 × 일수)으로 세요. 처방한 날 기준이고 환불·할인이 빠지지 않아 매출과 조금 달라요. 어느 묶음에도 넣지 않은 처방은 '그 밖 처방'으로 세요.",
  '묶음은 처방 칸 [묶음 고치기]에서 고쳐요. 처방 하나는 한 묶음에만 들어가서 금액을 두 번 세지 않아요. 묶음의 빼는 처방·조건은 매출에는 쓰지 않아요(넣는 처방 금액을 모두 더해요).',
  "'처방 n번'은 그 기간에 그 묶음 처방을 낸 횟수예요. 처방 칸의 '건'(같은 날 같은 환자는 1건)과 세는 법이 달라요.",
]
// 건당 진료비 [어떻게 세나요?] 한 문단(bit-total AC-6905.3)
const PER_VISIT_HOW = ['매출을 그 기간의 접수 건수로 나눠요. 같은 분이 다섯 번 오면 다섯 건으로 세요. 원장님 보고 문장의 건당진료비와 같은 식이고, 원 아래는 버려요.']

const bar = (key: string, label: string, rangeLabel: string, value: number | null): BarBucket =>
  value === null ? { key, label, rangeLabel, state: 'complete', values: [0], blank: 'no-data' } : { key, label, rangeLabel, state: 'complete', values: [value] }
const TREND_BARS = [bar('2026-10-15', '10.15', '10월 15일', 530), bar('2026-10-28', '', '10월 28일', null), bar('2026-11-13', '11.13', '11월 13일', 570)]
const PER_VISIT_BARS = [bar('2026-10-15', '10.15', '10월 15일', 57), bar('2026-10-28', '', '10월 28일', null), bar('2026-11-13', '11.13', '11월 13일', 61)]

const TREND: TrendTab = {
  desc: '매출 = 총진료비 · 수납한 날 기준, 하루씩',
  lead: { text: '이 기간 매출', amount: '1억 3,261만 원', rest: '· 지난 30일 1억 3,200만 원' },
  series: [{ name: '매출', tone: 'accent' }],
  buckets: TREND_BARS,
  legend: [],
  tips: {},
  dense: false,
  note: NOTE,
  how: TREND_HOW,
}

const up = (text: string) => ({ dir: 'up' as const, text, srText: '늘어남' })
const down = (text: string) => ({ dir: 'down' as const, text, srText: '줄어듦' })
const none = { dir: 'none' as const, text: '–', srText: '' }
const SPLIT_ROWS: RevenueSplitRow[] = [
  { name: '급여', kind: 'main', amount: '8,466만 원', share: '63.8%', delta: up('+1.0%'), lastYear: null },
  { name: '공단부담', kind: 'sub', amount: '6,087만 원', share: '45.9%', delta: none, lastYear: null },
  { name: '본인부담', kind: 'sub', amount: '2,379만 원', share: '17.9%', delta: none, lastYear: null },
  { name: '비급여', kind: 'main', amount: '4,172만 원', share: '31.4%', delta: down('−0.5%'), lastYear: null },
  { name: '기타', kind: 'main', amount: '621만 원', share: '4.6%', delta: down('−0.7%'), lastYear: null },
  { name: '합계 · 매출', kind: 'sum', amount: '1억 3,261만 원', share: '100%', delta: up('+0.4%'), lastYear: null },
]
const CHART: StackChart = {
  title: '날마다 급여·비급여·기타',
  legend: [
    { key: 'other', label: '기타' },
    { key: 'noncovered', label: '비급여' },
    { key: 'covered', label: '급여' },
  ],
  axis: {
    unit: '(만 원)',
    ticks: [
      { label: '0', bottom: 0 },
      { label: '400', bottom: 50 },
      { label: '800', bottom: 100 },
    ],
  },
  columns: [
    {
      month: '2026-10-15',
      label: '10.15',
      year: '',
      kind: 'other',
      partial: false,
      segments: [
        { key: 'covered', height: 42.16 },
        { key: 'noncovered', height: 21.33 },
        { key: 'other', height: 2.86 },
      ],
    },
    { month: '2026-10-28', label: '', year: '', kind: 'other', partial: false, segments: null },
  ],
  table: {
    caption: '날마다 급여·비급여·기타 (원)',
    head: ['날짜', '급여', '비급여', '기타'],
    rows: [
      ['2026-10-15', '3,373,000원', '1,707,000원', '229,000원'],
      ['2026-10-28', '–', '–', '–'],
    ],
  },
}
const SPLIT: SplitTab = {
  desc: '최근 30일 비급여 몫 31.4% · 기타 몫 4.6%',
  notice: null,
  head: ['나눔', '최근 30일', '몫', '지난 30일보다'],
  rows: SPLIT_ROWS,
  how: SPLIT_HOW,
  chart: CHART,
}

const TREAT_ROWS: TreatmentRow[] = [
  { name: '도수치료', amount: '3,768만 원', share: '27.1%', detail: '처방 471번', width: 100, rest: false, missing: false },
  { name: '물리치료', amount: '2,150만 원', share: '15.4%', detail: '처방 4,302번', width: 57.05, rest: false, missing: false },
  { name: '그 밖 처방', amount: '5,100만 원', share: '36.6%', detail: '진찰료·약·검사 등', width: 100, rest: true, missing: false },
]
const TREATMENTS: TreatmentsTab = {
  desc: '최근 30일 · 처방한 날 기준 · 처방 칸의 묶음으로 세요',
  state: 'rows',
  lead: { text: '이 기간 처방 금액', amount: '1억 3,902만 원', rest: '· 묶음은 처방 칸의 묶음 그대로예요' },
  rows: TREAT_ROWS,
  notice: null,
  lines: [],
  how: TREAT_HOW,
}

const KPIS: Kpi[] = [
  { name: '최근 30일 건당 진료비', value: '57,333원', sub: '매출 ÷ 접수 2,313건', tone: 'ink', srText: '' },
  { name: '지난 30일보다', value: '+2.9%', sub: '지난 30일 55,698원', tone: 'up', srText: '늘어남' },
  { name: '최근 30일 접수 건수', value: '2,408건', sub: '지난 30일 2,370건', tone: 'ink', srText: '' },
]
const PER_VISIT: PerVisitTab = {
  desc: '접수 한 건 기준 · 접수취소는 세지 않아요',
  kpis: KPIS,
  series: [{ name: '건당 진료비', tone: 'accent' }],
  buckets: PER_VISIT_BARS,
  legend: [],
  tips: {},
  dense: false,
  note: NOTE,
  notice: null,
  how: PER_VISIT_HOW,
}

type Ready = Extract<RevenueTabs, { kind: 'ready' }>
const ready = (over: Partial<Omit<Ready, 'kind'>> = {}): Ready => ({ kind: 'ready', trend: TREND, split: SPLIT, treatments: TREATMENTS, perVisit: PER_VISIT, ...over })

const TAB_NAMES = ['매출 추이', '급여·비급여·기타', '치료별 매출', '건당 진료비']
const OLD_HELPER_LEAD = '도우미가 예전 판이라 치료별 매출은 읽지 못했어요.'
const OLD_HELPER_TEXT = `${OLD_HELPER_LEAD} 매출 추이·급여·비급여·기타·건당 진료비는 그대로예요. 설정 탭에서 새 도우미를 받아 깐 뒤 [비트에서 불러오기]를 다시 누르면 채워져요.`

const draw = (tabs: RevenueTabs | 'reading' | 'read-failed' = ready(), { noDayCodes = false, onReread = () => undefined } = {}) =>
  render(<RevenueSection tabs={tabs} noDayCodes={noDayCodes} onReread={onReread} className="col-span-12" />)
const tabs = () => screen.getAllByRole('tab')
const tabNamed = (name: string) => screen.getByRole('tab', { name })
const panelOf = (tab: HTMLElement) => document.getElementById(tab.getAttribute('aria-controls') ?? '')!
const shown = () => screen.getByRole('tabpanel')
const head = () => screen.getByRole('heading', { level: 2, name: '매출' }).parentElement!
const howButton = () => within(shown()).getByRole('button', { name: '어떻게 세나요?' })
const howBody = () => document.getElementById(howButton().getAttribute('aria-controls')!)!
const openHow = () => {
  fireEvent.click(howButton())
  return [...howBody().querySelectorAll('p')].map((p) => p.textContent)
}
const pick = (name: string) => fireEvent.click(tabNamed(name))

describe('AC-4107.1: 매출 칸 — h2 · tablist · 탭 넷 · 키 · 패널 상태', () => {
  it('AC-4107.1: section의 h2는 `매출` 하나이고 className(칸 폭)은 section에 붙는다', () => {
    const { container } = draw()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['매출'])
    expect(container.querySelectorAll('section')).toHaveLength(1)
    expect(classesOf(container.querySelector('section')!)).toEqual(expect.arrayContaining(['col-span-12', 'border-t', 'border-line-strong']))
  })

  it('AC-4107.1: 머리 줄 다음 tablist(aria-label="매출 보기")에 탭 넷이 이 차례이고 처음은 첫 탭이다', () => {
    draw()
    const list = screen.getByRole('tablist', { name: '매출 보기' })
    expect(head().nextElementSibling).toBe(list)
    expect(within(list).getAllByRole('tab').map((t) => t.textContent)).toEqual(TAB_NAMES)
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false'])
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1])
  })

  it('AC-4107.1: 탭마다 패널이 있고 고르지 않은 패널은 hidden이다. 누르면 그 탭 패널만 보인다', () => {
    const { container } = draw()
    expect([...container.querySelectorAll('[role="tabpanel"]')].map((p) => (p as HTMLElement).hidden)).toEqual([false, true, true, true])
    pick('치료별 매출')
    expect(tabs().map((t) => panelOf(t).hidden)).toEqual([true, true, false, true])
    expect(within(shown()).getByText('도수치료')).toBeTruthy()
  })

  it('AC-4107.1: → ← Home End로 고르고 초점을 옮긴다(끝에서 돈다)', () => {
    draw()
    const [first, second, , fourth] = tabs()
    first!.focus()
    fireEvent.keyDown(first!, { key: 'ArrowRight' })
    expect(second!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second!, { key: 'End' })
    expect(document.activeElement).toBe(fourth)
    fireEvent.keyDown(fourth!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first!, { key: 'ArrowLeft' })
    expect(fourth!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(fourth!, { key: 'Home' })
    expect(first!.getAttribute('aria-selected')).toBe('true')
    expect(tabs().map((t) => panelOf(t).hidden)).toEqual([false, true, true, true])
  })

  it('AC-4107.1: 패널 안 상태(펼친 [어떻게 세나요?])는 탭을 옮겼다 와도 남는다', () => {
    draw()
    fireEvent.click(howButton())
    expect(howButton().getAttribute('aria-expanded')).toBe('true')
    pick('건당 진료비')
    expect(howButton().getAttribute('aria-expanded')).toBe('false')
    pick('매출 추이')
    expect(howButton().getAttribute('aria-expanded')).toBe('true')
    expect(howBody().hidden).toBe(false)
  })

  it('AC-4107.1: SectionAnchor(stats-revenue)로 감싸면 section에 그 id와 TOC_SCROLL이 붙고 안에는 겹친 id가 없다', () => {
    const { container } = render(
      <SectionAnchor id="stats-revenue">
        <RevenueSection tabs={ready()} noDayCodes={false} onReread={() => undefined} className="col-span-12" />
      </SectionAnchor>,
    )
    const section = container.querySelector('section')!
    expect(section.id).toBe('stats-revenue')
    expect(classesOf(section)).toEqual(expect.arrayContaining(TOC_SCROLL.split(' ')))
    expect(container.querySelectorAll('#stats-revenue')).toHaveLength(1)
  })
})

describe('AC-4107.2: 제목 옆 회색 설명은 고른 탭 것', () => {
  it('AC-4107.2: 탭을 고를 때마다 머리 줄 설명이 그 탭 설명 하나로 바뀐다', () => {
    draw()
    const descs = [TREND.desc, SPLIT.desc, TREATMENTS.desc, PER_VISIT.desc]
    TAB_NAMES.forEach((name, i) => {
      pick(name)
      const desc = within(head()).getByText(descs[i]!)
      expect(classesOf(desc)).toEqual(expect.arrayContaining(['text-small', 'text-muted']))
      expect(head().textContent).toBe(`매출${descs[i]}`)
    })
  })
})

describe('AC-4107.3: 매출 추이 탭', () => {
  it('AC-4107.3: 첫 줄은 글 + 굵은 금액 + 회색 비교 글이다', () => {
    draw()
    const lead = within(shown()).getByText('1억 3,261만 원').parentElement!
    expect(lead.textContent).toBe('이 기간 매출 1억 3,261만 원 · 지난 30일 1억 3,200만 원')
    expect(classesOf(within(lead).getByText('1억 3,261만 원'))).toEqual(expect.arrayContaining(['font-semibold', 'text-ink', 'tabular-nums']))
    expect(classesOf(within(lead).getByText('· 지난 30일 1억 3,200만 원'))).toContain('text-muted')
  })

  it('AC-4107.3: 비교가 없으면(rest null) 첫 줄에 회색 글이 없다', () => {
    draw(ready({ trend: { ...TREND, lead: { ...TREND.lead, rest: null } } }))
    expect(within(shown()).getByText('1억 3,261만 원').parentElement!.textContent).toBe('이 기간 매출 1억 3,261만 원')
  })

  it('AC-4107.3: 막대는 단위 (만 원), 칸 31개 이하면 막대 위 숫자, 화면 읽기 표 `매출 추이 (만 원)`이고 값이 없는 칸(no-data)은 –다', () => {
    draw()
    const panel = shown()
    const plot = panel.querySelector('div[aria-hidden="true"]')!
    expect(within(plot as HTMLElement).getByText('(만 원)')).toBeTruthy()
    expect(within(plot as HTMLElement).getByText('530')).toBeTruthy()
    const table = within(panel).getByRole('table', { name: '매출 추이 (만 원)' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['기간', '매출', '합계', '상태'])
    expect(within(table).getByRole('rowheader', { name: '10월 28일' }).parentElement!.textContent).toContain('–')
  })

  it('AC-4107.3: dense면 막대 위 숫자가 없다(화면 읽기 표는 그대로)', () => {
    draw(ready({ trend: { ...TREND, dense: true } }))
    const plot = shown().querySelector('div[aria-hidden="true"]') as HTMLElement
    expect(within(plot).queryByText('530')).toBeNull()
    expect(within(shown()).getByRole('table', { name: '매출 추이 (만 원)' })).toBeTruthy()
  })

  it('AC-4107.3: 차례는 첫 줄 → 막대 → 아래 글 → [어떻게 세나요?]이고 아래 글은 그대로다', () => {
    draw()
    const panel = shown()
    const note = within(panel).getByText(NOTE)
    expect(classesOf(note)).toEqual(expect.arrayContaining(['text-small', 'text-muted']))
    const lead = within(panel).getByText('1억 3,261만 원').parentElement!
    const chart = within(panel).getByRole('table', { name: '매출 추이 (만 원)' })
    expect(lead.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(chart.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(note.compareDocumentPosition(howButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-4107.3: 아래 글이 없으면(note null) 그 줄이 없다', () => {
    draw(ready({ trend: { ...TREND, note: null } }))
    expect(within(shown()).queryByText(NOTE)).toBeNull()
  })

  it('AC-4107.3·AC-6905.3: [어떻게 세나요?]는 처음 접혀 있고 펼치면 세 문단이 이 차례다', () => {
    draw()
    expect(howButton().getAttribute('aria-expanded')).toBe('false')
    expect(howBody().hidden).toBe(true)
    expect(openHow()).toEqual(TREND_HOW)
    expect(howBody().hidden).toBe(false)
  })
})

describe('AC-4107.4: 급여·비급여·기타 탭', () => {
  const tableOf = () => within(shown()).getAllByRole('table').find((t) => !t.classList.contains('sr-only'))!

  it('AC-4107.4: 왼쪽 표 머리·줄 여섯(금액·몫·증감), 표 아래 [어떻게 세나요?] 두 문단', () => {
    draw()
    pick('급여·비급여·기타')
    const table = tableOf()
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['나눔', '최근 30일', '몫', '지난 30일보다'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual(['급여', '공단부담', '본인부담', '비급여', '기타', '합계 · 매출'])
    expect(rows[0]!.textContent).toBe('급여8,466만 원63.8%+1.0%늘어남')
    expect(rows[3]!.textContent).toBe('비급여4,172만 원31.4%−0.5%줄어듦')
    expect(rows[1]!.textContent).toBe('공단부담6,087만 원45.9%–')
    expect(table.compareDocumentPosition(howButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(openHow()).toEqual(SPLIT_HOW)
  })

  it('AC-4107.4: 오른쪽 그림은 제목 h3 `날마다 급여·비급여·기타` · 범례 기타·비급여·급여 · 화면 읽기 표다. 12칸 격자의 왼쪽 5칸 · 오른쪽 6칸', () => {
    draw()
    pick('급여·비급여·기타')
    const panel = shown()
    expect(within(panel).getByRole('heading', { level: 3, name: '날마다 급여·비급여·기타' })).toBeTruthy()
    const legend = within(panel).getByText('비급여', { selector: 'span' }).parentElement!
    expect(legend.textContent).toBe('기타비급여급여')
    expect(within(panel).getByRole('table', { name: '날마다 급여·비급여·기타 (원)' })).toBeTruthy()
    const left = tableOf().parentElement!
    expect(classesOf(left)).toEqual(expect.arrayContaining(['min-w-0', 'md:col-span-5']))
    expect(classesOf(left.parentElement!)).toEqual(expect.arrayContaining(['grid', 'md:grid-cols-12']))
    expect(classesOf(left.nextElementSibling!)).toEqual(expect.arrayContaining(['md:col-span-6', 'md:col-start-7']))
  })

  it('AC-4107.4: 나눔 못 한 날이 있으면 표 위 안내 줄(굵은 앞말 + 글)이 있다', () => {
    const notice = { lead: '1일(11월 3일)', rest: '은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.' }
    draw(ready({ split: { ...SPLIT, notice } }))
    pick('급여·비급여·기타')
    const note = within(shown()).getByRole('note')
    expect(note.textContent).toBe('1일(11월 3일)은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.')
    expect(within(note).getByText('1일(11월 3일)').tagName).toBe('STRONG')
    expect(note.compareDocumentPosition(tableOf()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-4107.4: 그림이 없으면(chart null) 오른쪽 칸이 없다', () => {
    draw(ready({ split: { ...SPLIT, chart: null } }))
    pick('급여·비급여·기타')
    expect(within(shown()).queryByRole('heading', { level: 3 })).toBeNull()
    expect(tableOf().parentElement!.nextElementSibling).toBeNull()
  })

  it('AC-4107.4: 작년 비교가 있는 고른 기간이면 머리 `작년 같은 때보다` 칸이 하나 더 있고 줄마다 그 증감이다(휴대폰에서는 증감 칸 둘을 숨긴다)', () => {
    const head = ['나눔', '2026년 10월', '몫', '9월보다', '작년 같은 때보다']
    const rows = SPLIT_ROWS.map((row) => ({ ...row, lastYear: row.kind === 'sub' ? none : up('+3.1%') }))
    draw(ready({ split: { ...SPLIT, head, rows } }))
    pick('급여·비급여·기타')
    const table = tableOf()
    const heads = within(table).getAllByRole('columnheader')
    expect(heads.map((th) => th.textContent)).toEqual(head)
    expect(classesOf(heads[3]!)).toContain('max-md:hidden')
    expect(classesOf(heads[4]!)).toContain('max-md:hidden')
    const body = within(table).getAllByRole('row').slice(1)
    expect(body[0]!.textContent).toBe('급여8,466만 원63.8%+1.0%늘어남+3.1%늘어남')
    expect(body[1]!.textContent).toBe('공단부담6,087만 원45.9%––')
    for (const row of body) {
      const cells = within(row).getAllByRole('cell')
      expect(cells).toHaveLength(5)
      expect(classesOf(cells[4]!)).toContain('max-md:hidden')
    }
  })
})

describe('AC-4107.5: 치료별 매출 탭', () => {
  it('AC-4107.5: 첫 줄 · 순위 막대 줄(이름 · 금액 · 몫 · 처방 n번) · [어떻게 세나요?] 세 문단', () => {
    draw()
    pick('치료별 매출')
    const panel = shown()
    expect(within(panel).getByText('1억 3,902만 원').parentElement!.textContent).toBe('이 기간 처방 금액 1억 3,902만 원 · 묶음은 처방 칸의 묶음 그대로예요')
    const items = within(panel).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['도수치료3,768만 원27.1%처방 471번', '물리치료2,150만 원15.4%처방 4,302번', '그 밖 처방5,100만 원36.6%진찰료·약·검사 등'])
    expect(openHow()).toEqual(TREAT_HOW)
  })

  it('AC-4107.5: 이 칸에는 [묶음 고치기]와 `제안 묶음` 칩이 없다', () => {
    const { container } = draw()
    for (const name of TAB_NAMES) {
      pick(name)
      expect(screen.queryByRole('button', { name: '묶음 고치기' })).toBeNull()
    }
    expect(container.textContent).not.toContain('제안 묶음')
  })

  it('AC-4107.5: 빠진 날이 있으면 순위 막대 아래 안내 줄이다', () => {
    const notice = { lead: '2일(10월 1일–2일)', rest: '은 치료별로 나눠 저장하지 않아 이 표에서 빠졌어요.' }
    draw(ready({ treatments: { ...TREATMENTS, notice } }))
    pick('치료별 매출')
    const note = within(shown()).getByRole('note')
    expect(note.textContent).toBe('2일(10월 1일–2일)은 치료별로 나눠 저장하지 않아 이 표에서 빠졌어요.')
    expect(within(shown()).getByRole('list').compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-4107.5: 묶음을 읽는 중이면 `불러오는 중` 줄 하나다(막대·[어떻게 세나요?] 없음)', () => {
    draw(ready({ treatments: { ...TREATMENTS, state: 'reading', lead: null, rows: [], lines: ['불러오는 중'] } }))
    pick('치료별 매출')
    expect(shown().textContent).toBe('불러오는 중')
    expect(within(shown()).queryByRole('list')).toBeNull()
    expect(within(shown()).queryByRole('button')).toBeNull()
  })

  it('AC-4107.5: 묶음 읽기에 실패하면 `처방별 추세 묶음을 읽지 못했어요` 한 줄만이다', () => {
    draw(ready({ treatments: { ...TREATMENTS, state: 'read-failed', lead: null, rows: [], lines: ['처방별 추세 묶음을 읽지 못했어요'] } }))
    pick('치료별 매출')
    expect(shown().textContent).toBe('처방별 추세 묶음을 읽지 못했어요')
    expect(shown().querySelectorAll('p')).toHaveLength(1)
    expect(within(shown()).queryByRole('button')).toBeNull()
  })

  it('AC-4107.5: 셀 날이 없으면 `자료 없음`(굵게) · 글 한 줄이다', () => {
    const line = '자료 없음 · 새 도우미로 [비트에서 불러오기]를 하면 이 기간의 치료별 매출이 채워져요.'
    draw(ready({ treatments: { ...TREATMENTS, state: 'none', lead: null, rows: [], lines: [line] } }))
    pick('치료별 매출')
    expect(shown().textContent).toBe(line)
    expect(classesOf(within(shown()).getByText('자료 없음'))).toEqual(expect.arrayContaining(['font-semibold', 'text-ink']))
  })
})

describe('AC-4107.6: 건당 진료비 탭', () => {
  it('AC-4107.6: 숫자 칸 셋(이름 · 값 · 아래 글, 늘어남은 화살표 + 화면 읽기 글)', () => {
    draw()
    pick('건당 진료비')
    const panel = shown()
    const cells = [...within(panel).getByText('최근 30일 건당 진료비').parentElement!.parentElement!.children]
    expect(cells.map((cell) => cell.textContent)).toEqual([
      '최근 30일 건당 진료비57,333원매출 ÷ 접수 2,313건',
      '지난 30일보다+2.9%늘어남지난 30일 55,698원',
      '최근 30일 접수 건수2,408건지난 30일 2,370건',
    ])
    expect(cells[1]!.querySelector('.text-positive svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-4107.6·AC-6905.3: 막대는 단위 (천 원) · 화면 읽기 표 `건당 진료비 (천 원)` · 아래 글 · [어떻게 세나요?] 한 문단(건당 진료비)', () => {
    draw()
    pick('건당 진료비')
    const panel = shown()
    expect(within(panel.querySelector('div[aria-hidden="true"]') as HTMLElement).getByText('(천 원)')).toBeTruthy()
    const table = within(panel).getByRole('table', { name: '건당 진료비 (천 원)' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['기간', '건당 진료비', '합계', '상태'])
    expect(within(panel).getByText(NOTE)).toBeTruthy()
    expect(openHow()).toEqual(PER_VISIT_HOW)
    expect(howBody().textContent).not.toContain('1인당')
  })

  it('AC-4107.6: 접수 건수를 확인 못 한 날이 있으면 숫자 칸 위 안내 줄이다', () => {
    const notice = { lead: '1일(11월 3일)', rest: '은 접수 건수를 확인하지 못해 건당 진료비에서 빠졌어요. 매출 합계에는 들어 있어요.' }
    draw(ready({ perVisit: { ...PER_VISIT, notice } }))
    pick('건당 진료비')
    const note = within(shown()).getByRole('note')
    expect(note.textContent).toBe('1일(11월 3일)은 접수 건수를 확인하지 못해 건당 진료비에서 빠졌어요. 매출 합계에는 들어 있어요.')
    expect(note.compareDocumentPosition(within(shown()).getByText('최근 30일 건당 진료비')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('AC-4107.7: 보는 기간에 저장된 매출이 없음', () => {
  it('AC-4107.7: 제목 `매출`만(설명·탭 없음) + `자료 없음`(굵게) · 한 줄이다', () => {
    const { container } = draw({ kind: 'empty' })
    expect(head().textContent).toBe('매출')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    const line = container.querySelector('section > p')!
    expect(line.textContent).toBe('자료 없음 · 불러오면 이 기간의 매출이 하루씩 막대로 그려져요.')
    expect(classesOf(within(line as HTMLElement).getByText('자료 없음'))).toContain('font-semibold')
    expect(container.querySelectorAll('section > *')).toHaveLength(2)
  })

  it('AC-4107.7: 도우미 예전 판 표시가 켜져도 자료 없음이면 노란 줄이 없다', () => {
    draw({ kind: 'empty' }, { noDayCodes: true })
    expect(screen.queryByRole('note')).toBeNull()
  })
})

describe('AC-4107.8: 도우미 예전 판 표시', () => {
  it('AC-4107.8: 제목과 탭 사이 노란 줄(role="note") — 굵은 앞말 + 글 + [설정에서 새 도우미 받기](/settings 링크)', () => {
    draw(ready(), { noDayCodes: true })
    const note = screen.getByRole('note')
    expect(head().nextElementSibling).toBe(note)
    expect(note.nextElementSibling).toBe(screen.getByRole('tablist', { name: '매출 보기' }))
    expect(classesOf(note)).toContain('bg-warning-soft')
    expect(note.querySelector('p')!.textContent).toBe(OLD_HELPER_TEXT)
    expect(within(note).getByText(OLD_HELPER_LEAD).tagName).toBe('STRONG')
    const link = within(note).getByRole('link', { name: '설정에서 새 도우미 받기' })
    expect(link.getAttribute('href')).toBe('/settings')
    expect(classesOf(link)).toContain('max-md:h-11')
  })

  it('AC-4107.8: 표시가 꺼져 있으면 노란 줄이 없다', () => {
    draw()
    expect(screen.queryByText(OLD_HELPER_LEAD)).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('AC-4107.8: 치료별 매출 탭에 셀 날이 없으면 `자료 없음` 줄과 달 합계 안내 줄 두 줄이다', () => {
    const lines = [
      '자료 없음 · 새 도우미로 [비트에서 불러오기]를 하면 이 기간의 치료별 매출이 채워져요.',
      '치료별 매출은 날마다 나눠 저장한 날부터 볼 수 있어요. 지금 도우미는 달 합계만 읽어요.',
    ]
    draw(ready({ treatments: { ...TREATMENTS, state: 'none', lead: null, rows: [], lines } }), { noDayCodes: true })
    pick('치료별 매출')
    const paragraphs = [...shown().querySelectorAll(':scope > p')]
    expect(paragraphs.map((p) => p.textContent)).toEqual(lines)
    expect(classesOf(within(paragraphs[0] as HTMLElement).getByText('자료 없음'))).toContain('font-semibold')
    expect(classesOf(paragraphs[1]!)).toEqual(expect.arrayContaining(['text-small', 'text-muted']))
  })
})

describe('AC-4107.9: 저장된 매출을 읽는 중 · 읽기 실패', () => {
  it('AC-4107.9: 읽는 중이면 제목 `매출` 아래 `불러오는 중` 줄이고 탭이 없다', () => {
    const { container } = draw('reading')
    expect(head().textContent).toBe('매출')
    expect(container.querySelector('section > p')!.textContent).toBe('불러오는 중')
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('AC-4107.9: 읽기 실패면 오류 카드(E-STATS-READ-FAILED) + 카드 밖 [다시 읽기]이고 누르면 onReread다', () => {
    const onReread = vi.fn()
    draw('read-failed', { onReread })
    expect(within(screen.getByRole('alert')).getByText('오류 번호 E-STATS-READ-FAILED')).toBeTruthy()
    const button = screen.getByRole('button', { name: '다시 읽기' })
    expect(screen.getByRole('alert').contains(button)).toBe(false)
    expect(screen.queryByRole('tablist')).toBeNull()
    fireEvent.click(button)
    expect(onReread).toHaveBeenCalledTimes(1)
  })
})

describe('AC-4107.10: 고른 탭·펼침은 화면 상태뿐 · 소스 규칙', () => {
  it('AC-4107.10: 다시 열면(새로 그리면) 첫 탭 · [어떻게 세나요?] 접힘이다', () => {
    const first = draw()
    pick('건당 진료비')
    fireEvent.click(howButton())
    first.unmount()
    draw()
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false'])
    expect(howButton().getAttribute('aria-expanded')).toBe('false')
  })

  it('AC-4107.10: 칸 소스는 브라우저 저장소·주소·서버·통로를 쓰지 않는다', () => {
    const code = readFileSync(join(process.cwd(), 'src/components/stats/sections/RevenueSection.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
    for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'history.', 'location.', 'useRouter', 'useSearchParams', 'fetch(', 'supabase', 'lib/storage', 'lib/bridge', 'console']) {
      expect(code, word).not.toContain(word)
    }
  })

  it('AC-4107.10: 네 탭을 모두 고르고 [어떻게 세나요?]를 모두 펼쳐도 상자 안 상자가 없다(예전 판 줄·안내 줄 포함)', () => {
    const notice = { lead: '1일(11월 3일)', rest: '은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.' }
    const { container } = draw(ready({ split: { ...SPLIT, notice }, perVisit: { ...PER_VISIT, notice } }), { noDayCodes: true })
    for (const name of TAB_NAMES) {
      pick(name)
      fireEvent.click(howButton())
      expect(nestedBoxes(container)).toEqual([])
    }
  })
})

// bit-total(REQ-6905 AC-6905.1·AC-6905.2·AC-6905.4, design.md 2절): 매출 칸에 스위치·꼬리표·범례·점선 칸·빗금 막대·켜짐 안내 줄이 없다.
// 막대는 늘 tabs.trend·tabs.perVisit(계열 하나)다. 확인 필요로 저장되고 roughTotal이 있는 날도 보통 막대이고, 음수면 높이 0 · 칸 위 숫자만 음수다
const NEGATIVE = (values: number): BarBucket => ({ key: '2026-10-28', label: '', rangeLabel: '10월 28일', state: 'complete', values: [values] })
const PLAIN_TREND: TrendTab = {
  ...TREND,
  buckets: [TREND_BARS[0]!, NEGATIVE(-5), TREND_BARS[2]!],
  tips: { '2026-10-15': '10.15(목) 매출 530만 원', '2026-10-28': '10.28(수) 매출 −5만 원', '2026-11-13': '11.13(금) 매출 570만 원' },
}
const PLAIN_PER_VISIT: PerVisitTab = {
  ...PER_VISIT,
  buckets: [PER_VISIT_BARS[0]!, NEGATIVE(-5), PER_VISIT_BARS[2]!],
  tips: { '2026-10-15': '10.15(목) 건당 진료비 57,608원', '2026-10-28': '10.28(수) 건당 진료비 −5,200원', '2026-11-13': '11.13(금) 건당 진료비 61,000원' },
}
const plain = (over: Partial<Omit<Ready, 'kind'>> = {}) => ready({ trend: PLAIN_TREND, perVisit: PLAIN_PER_VISIT, ...over })
const plotOf = () => shown().querySelector('div[aria-hidden="true"]') as HTMLElement
const barButtons = () => [...plotOf().querySelectorAll('button')]
const OLD_WORDS = /참고 금액|참고 포함|확인 필요/

describe('AC-6905.1: 매출 칸 제목 줄에 스위치가 없다', () => {
  const drawCard = (tabsIn: RevenueTabs | 'reading' | 'read-failed') =>
    render(
      <StatsCard title="매출">
        <RevenueSection tabs={tabsIn} noDayCodes={false} onReread={() => undefined} />
      </StatsCard>,
    )
  const cardHead = () => screen.getAllByRole('heading', { level: 2, name: '매출' })[0]!.parentElement!

  it('AC-6905.1: 탭이 있을 때도 · 읽는 중·읽기 실패·자료 없음일 때도 큰 카드 제목 줄에 스위치·그 아래 글이 없다', () => {
    for (const tabsIn of [plain(), 'reading', 'read-failed', { kind: 'empty' }] as const) {
      drawCard(tabsIn)
      expect(screen.queryByRole('switch')).toBeNull()
      expect(cardHead().textContent).not.toMatch(OLD_WORDS)
      cleanup()
    }
  })

  it('AC-6905.1: RevenueSection은 스위치 props(mode·onMode·rough)를 받지 않고 RoughSwitch를 쓰지 않는다', () => {
    const code = readFileSync(join(process.cwd(), 'src/components/stats/sections/RevenueSection.tsx'), 'utf8')
    expect(code).not.toMatch(/RoughSwitch|RevenueMode|RoughInfo|ROUGH_TAG|onMode|tabs\.rough|outside/)
  })
})

describe('AC-6905.1: 매출 추이·건당 진료비 막대 — 계열 하나, 범례·점선 칸·빗금 막대·꼬리표 없음', () => {
  it('AC-6905.1: 매출 추이는 범례 목록·점선 칸·빗금 조각(st-rise)이 없고 화면 읽기 표 머리는 기간·매출·합계·상태다. 머리 글에 `참고 포함` 꼬리표가 없다', () => {
    draw(plain())
    const plot = plotOf()
    expect(within(shown()).queryByRole('list')).toBeNull()
    expect(plot.querySelector('.border-dashed')).toBeNull()
    expect(plot.querySelector('.st-rise')).toBeNull()
    expect(within(plot).queryByText('확인 필요')).toBeNull()
    const table = within(shown()).getByRole('table', { name: '매출 추이 (만 원)' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['기간', '매출', '합계', '상태'])
    const lead = within(shown()).getByText('1억 3,261만 원').parentElement!
    expect(lead.textContent).toBe('이 기간 매출 1억 3,261만 원 · 지난 30일 1억 3,200만 원')
    expect(lead.querySelector('.st-tag-in')).toBeNull()
  })

  it('AC-6905.1: 음수(환불이 더 많은 날) 칸은 높이 0이고 칸 위 숫자만 `−5`다. 화면 읽기 표도 `−5`다', () => {
    draw(plain())
    const label = within(plotOf()).getByText('−5')
    expect(label).toBeTruthy()
    const row = within(within(shown()).getByRole('table', { name: '매출 추이 (만 원)' })).getByRole('rowheader', { name: '10월 28일' }).parentElement!
    expect(row.textContent).toContain('−5')
    expect(row.textContent).not.toMatch(OLD_WORDS)
  })

  it('AC-6905.1: 건당 진료비 탭도 범례·점선 칸·빗금 조각이 없고 음수 칸 위 숫자는 `−5`다', () => {
    draw(plain())
    pick('건당 진료비')
    const plot = plotOf()
    expect(within(shown()).queryByRole('list')).toBeNull()
    expect(plot.querySelector('.border-dashed')).toBeNull()
    expect(plot.querySelector('.st-rise')).toBeNull()
    expect(within(plot).getByText('−5')).toBeTruthy()
    expect(within(within(shown()).getByRole('table', { name: '건당 진료비 (천 원)' })).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['기간', '건당 진료비', '합계', '상태'])
  })

  it('AC-6905.1·AC-4417.3: 막대는 기간을 바꾸면 높이가 움직이고(st-move-period) 막대 위 숫자는 768px 이상에서만 보인다', () => {
    draw(plain())
    const plot = plotOf()
    expect(plot.querySelectorAll('.st-move-period').length).toBeGreaterThan(0)
    expect(classesOf(within(plot).getByText('530').parentElement!)).toContain('max-md:hidden')
  })
})

describe('AC-6905.2: 막대를 누르면(PC는 올리기도) 막대 아래 줄 글(role="status")', () => {
  it('AC-6905.2: 처음은 빈 줄이고, 누르면 그 칸 글 · 올리면 그 칸 글이며 고른 칸 바탕이 옅은 파랑이다', () => {
    draw(plain())
    const status = within(shown()).getByRole('status')
    expect(status.textContent).toBe('')
    expect(plotOf().compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const [first, second] = barButtons()
    expect(first!.tabIndex).toBe(-1)
    fireEvent.click(first!)
    expect(status.textContent).toBe('10.15(목) 매출 530만 원')
    expect(classesOf(barButtons()[0]!)).toContain('bg-accent-soft')
    fireEvent.mouseEnter(second!)
    expect(status.textContent).toBe('10.28(수) 매출 −5만 원')
  })

  it('AC-6905.2: 건당 진료비 탭도 같은 규칙이고 숫자 칸 셋은 그대로다', () => {
    draw(plain())
    pick('건당 진료비')
    fireEvent.click(barButtons()[0]!)
    expect(within(shown()).getByRole('status').textContent).toBe('10.15(목) 건당 진료비 57,608원')
    fireEvent.click(barButtons()[1]!)
    expect(within(shown()).getByRole('status').textContent).toBe('10.28(수) 건당 진료비 −5,200원')
    expect(within(shown()).getByText('57,333원')).toBeTruthy()
  })

  it('AC-6905.2: 막대 아래 글은 한 문장(휴진 문장)뿐이다', () => {
    draw(plain())
    expect(within(shown()).getByText(NOTE).textContent).toBe('휴진한 날은 칸이 없어요.')
    pick('건당 진료비')
    expect(within(shown()).getByText(NOTE)).toBeTruthy()
  })
})

describe('AC-6905.4·AC-4408.5: 급여·비급여·기타·치료별 매출 탭 맨 위에 안내 줄이 없고 탭 넷은 그대로', () => {
  it('AC-6905.4: 급여·비급여·기타·치료별 매출 탭 맨 위에 `참고 금액 … 합이 총매출과 달라요.` 줄이 없고, 칸 어디에도 참고 금액·확인 필요 글이 없다', () => {
    const notice = { lead: '1일(10월 28일)', rest: '은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.' }
    const { container } = draw(plain({ split: { ...SPLIT, notice } }))
    for (const name of ['급여·비급여·기타', '치료별 매출']) {
      pick(name)
      expect(within(shown()).queryByText(/이 탭에 넣지 않아/), name).toBeNull()
      expect(shown().textContent, name).not.toMatch(OLD_WORDS)
    }
    pick('급여·비급여·기타')
    expect(within(shown()).getByRole('note').textContent).toBe('1일(10월 28일)은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.')
    for (const name of TAB_NAMES) {
      pick(name)
      fireEvent.click(howButton())
    }
    expect(container.textContent).not.toMatch(OLD_WORDS)
  })

  it('AC-4408.5: 탭 넷(매출 추이 · 급여·비급여·기타 · 치료별 매출 · 건당 진료비)이고 치료별 매출은 가로 막대 순위(금액 크게 · 막대 폭 움직임)다', () => {
    draw(plain())
    expect(tabs().map((t) => t.textContent)).toEqual(TAB_NAMES)
    pick('치료별 매출')
    const items = within(shown()).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(classesOf(within(items[0]!).getByText('3,768만 원'))).toEqual(expect.arrayContaining(['text-st-18', 'font-semibold', 'text-st-ink']))
    expect(classesOf(items[0]!.querySelector('[style*="width"]')!)).toContain('st-move-period')
  })
})

// ── 신환 1명당 매출(stats-insights REQ-6106 → pv-month REQ-7202 고른 기간 그대로): 비트 칸(bit = { view, range })을 주면 다섯째 탭 '신환 1명당' ──
// 탭 안 칸은 PatientValueSection이다(숫자·글은 PatientValueSection.test.tsx가 본다). 숫자는 모두 지어낸 값이다
describe('AC-7202.3: 매출 칸 다섯째 탭 `신환 1명당`(비트 칸 보기와 통계 기간을 한 묶음으로)', () => {
  const GROUP: StatsRxGroup = { id: 'g1', name: '도수', codes: ['MAN1'], sortOrder: 0 }
  const TODAY = '2026-11-19'
  const NOVEMBER = rangeOf(TODAY, { kind: 'month', unit: 'day', month: '2026-11' }, false)
  const LAST_30 = rangeOf(TODAY, '30d', false)
  const VALUE: PeriodValue = {
    from: '2026-11-01',
    to: '2026-11-18',
    n: 12,
    average: 412_000,
    times: 5.1,
    perVisit: 80_800,
    lines: [{ groups: [groupKey(GROUP.codes, GROUP)], n: 12, average: 412_000 }],
  }
  const bitReady = (period?: PeriodValue): BitSectionsView => ({
    kind: 'ready',
    mix: { all: { total: { people: 1, visits: 1 }, compared: false, age: [], insurance: [], city: [], town: [] }, new: { total: { people: 1, visits: 1 }, compared: false, age: [], insurance: [], city: [], town: [] } },
    hours: { hours: [9], rows: [], unknown: 0, peak: null },
    doctors: { kind: 'single' },
    ...(period === undefined ? {} : { period }),
  })
  const drawBit = (view: BitSectionsShown | undefined, tabsIn: RevenueTabs | 'reading' | 'read-failed' = ready(), range = NOVEMBER) =>
    render(<RevenueSection tabs={tabsIn} noDayCodes={false} onReread={() => undefined} bit={view === undefined ? undefined : { view, range }} groups={[GROUP]} />)

  it('AC-7202.3·AC-7202.1: bit를 주면 탭 넷 뒤에 `신환 1명당`이 더해지고, 누르면 그 패널에 고른 기간의 세 칸·받은 치료별이 보인다', () => {
    drawBit(bitReady(VALUE))
    expect(tabs().map((t) => t.textContent)).toEqual([...TAB_NAMES, '신환 1명당'])
    expect(tabNamed('신환 1명당').getAttribute('aria-selected')).toBe('false')
    pick('신환 1명당')
    expect(within(shown()).getByText('2026년 11월 신환 12명 · 2026년 11월 1일 – 18일')).toBeTruthy()
    expect([...shown().querySelectorAll('[data-kpi]')].map((cell) => cell.textContent)).toEqual([
      '41만 2,000원11월 신환 1명당 평균',
      '5.1회11월 신환 1명당 내원 횟수',
      '8만 800원한 번 올 때 평균',
    ])
    expect(within(shown()).getByRole('list', { name: '받은 치료별' }).textContent).toBe('진료 + 도수41만 2,000원 · 12명')
    // 패널 모드라 탭 이름·칸 제목은 제목이 아니다(h2는 `매출` 하나)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['매출'])
  })

  it('AC-7202.3: 같은 view에 기간만 바꾸면 칸 위 줄·칸 이름이 그 기간 이름이다', () => {
    drawBit(bitReady({ ...VALUE, from: '2026-10-20' }), ready(), LAST_30)
    pick('신환 1명당')
    expect(within(shown()).getByText('최근 30일 신환 12명 · 2026년 10월 20일 – 11월 18일')).toBeTruthy()
    expect([...shown().querySelectorAll('[data-kpi]')].map((cell) => cell.textContent)).toEqual([
      '41만 2,000원최근 30일 신환 1명당 평균',
      '5.1회최근 30일 신환 1명당 내원 횟수',
      '8만 800원한 번 올 때 평균',
    ])
  })

  it.each<[string, BitSectionsShown, string]>([
    ['불러오지 않은 기기', null, '비트에서 불러오면 볼 수 있어요'],
    ['금액 줄이 없는 답(옛 도우미)', bitReady(), '도우미를 0.11.0으로 올리면 볼 수 있어요'],
    ['대상 없음', bitReady({ ...VALUE, n: 0, average: 0, times: 0, perVisit: 0, lines: [] }), '아직 셀 환자가 없어요'],
  ])('AC-7202.2: %s이면 탭 안에 안내 한 줄이다', (_name, view, text) => {
    drawBit(view)
    pick('신환 1명당')
    expect(shown().textContent).toBe(text)
  })

  it('AC-7202.3: bit를 주지 않으면 탭 넷 그대로이고, 매출 칸이 읽는 중·읽기 실패·자료 없음이면 탭이 없다(지금 모양 그대로)', () => {
    drawBit(undefined)
    expect(tabs().map((t) => t.textContent)).toEqual(TAB_NAMES)
    cleanup()
    for (const tabsIn of ['reading', 'read-failed', { kind: 'empty' }] as const) {
      drawBit(bitReady(VALUE), tabsIn)
      expect(screen.queryByRole('tab', { name: '신환 1명당' })).toBeNull()
      cleanup()
    }
  })
})
