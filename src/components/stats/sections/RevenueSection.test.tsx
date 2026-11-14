// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BarBucket } from '@/components/charts/StackedBarChart'
import type { Kpi, StackChart, TreatmentRow } from '@/components/revenue/types'
import type { PerVisitTab, RevenueSplitRow, RevenueTabs, SplitTab, TreatmentsTab, TrendTab } from '@/components/stats/revenueView'
import { nestedBoxes } from '@/testing/boxes'
import { SectionAnchor, StatsCard, TOC_SCROLL } from './parts'
import { RevenueSection } from './RevenueSection'

// 통계 매출 칸 (stats-revenue TASK-5, REQ-4107 · AC-4107.1(칸 안 구조)~AC-4107.10, design.md '칸 부품', 시안 docs/mockups/stats-revenue).
// 넘김 값은 revenueView(TASK-4)가 주는 모양을 이 파일에서 손으로 만든 가짜다(시안 숫자·글, 이름·숫자는 모두 지어낸 값). 숫자·글을 만드는 셈은 revenueView.test.ts가 본다

afterEach(cleanup)

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

const NOTE = "휴진한 날은 칸이 없어요. '–'는 확인 필요한 날(10월 28일)이에요. 그날 금액은 합계에 넣지 않았어요."
const TREND_HOW = [
  '매출은 수납한 날(회계일)의 총진료비예요. 총진료비 = 공단부담 + 본인부담 + 비급여 + 기타이고, 그날 정상 수납한 것과 미수금으로 들어온 것을 더해요.',
  "환불·변경수납·예치금이 있거나 수납 연결이 겹친 날은 '확인 필요한 날'로 두고 그날 금액을 매출에 넣지 않아요. 비트 외래환자경영통계에서 그날을 직접 확인해 주세요.",
  "그래서 아래 '원장님별'의 매출 합계(그런 날도 더해요)나 '원장님 보고 문장'의 총진료비(그런 날이 든 날·달은 '확인 필요')와 다를 수 있어요.",
  '막대 칸은 환자 수 추이와 같아요: 최근 7일·30일·90일은 하루씩, 최근 12개월은 한 달씩, 기간 골라 보기는 고른 단위(일별·주별·월별)예요.',
]
const SPLIT_HOW = [
  '매출은 총진료비예요. 급여(요양비용총액)는 공단이 내는 몫과 환자가 내는 몫(본인부담)을 더한 금액, 비급여는 환자가 모두 내는 금액, 기타는 100/100 미만 항목과 전액 본인부담 금액이에요. 셋을 더하면 매출이에요.',
  '막대는 날마다 아래부터 급여·비급여·기타예요. 확인 필요한 날과 나눔을 못 한 날은 막대가 없어요.',
]
const TREAT_HOW = [
  "처방 금액(단가 × 수량 × 일수)으로 세요. 처방한 날 기준이고 환불·할인이 빠지지 않아 매출과 조금 달라요. 어느 묶음에도 넣지 않은 처방은 '그 밖 처방'으로 세요.",
  '묶음은 처방 칸 [묶음 고치기]에서 고쳐요. 처방 하나는 한 묶음에만 들어가서 금액을 두 번 세지 않아요. 묶음의 빼는 처방·조건은 매출에는 쓰지 않아요(넣는 처방 금액을 모두 더해요).',
  "'처방 n번'은 그 기간에 그 묶음 처방을 낸 횟수예요. 처방 칸의 '건'(같은 날 같은 환자는 1건)과 세는 법이 달라요.",
]
const PER_VISIT_HOW = [
  '매출을 그 기간의 접수 건수로 나눠요. 같은 분이 다섯 번 오면 다섯 건으로 세요. 원장님 보고 문장의 건당진료비와 같은 식이고, 원 아래는 버려요.',
  "확인 필요한 날은 금액을 알 수 없어서 그날 접수 건수도 함께 빼고 나눠요. 그래서 '원장님별'의 건당 진료비(그런 날도 더해요)와 조금 다를 수 있어요.",
]

const bar = (key: string, label: string, rangeLabel: string, value: number | null): BarBucket =>
  value === null ? { key, label, rangeLabel, state: 'complete', values: [0], blank: 'no-data' } : { key, label, rangeLabel, state: 'complete', values: [value] }
const TREND_BARS = [bar('2026-10-15', '10.15', '10월 15일', 530), bar('2026-10-28', '', '10월 28일', null), bar('2026-11-13', '11.13', '11월 13일', 570)]
const PER_VISIT_BARS = [bar('2026-10-15', '10.15', '10월 15일', 57), bar('2026-10-28', '', '10월 28일', null), bar('2026-11-13', '11.13', '11월 13일', 61)]

const TREND: TrendTab = {
  desc: '매출 = 총진료비 · 수납한 날 기준, 하루씩',
  lead: { text: '이 기간 매출', amount: '1억 3,261만 원', rest: '· 지난 30일 1억 3,200만 원' },
  buckets: TREND_BARS,
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
  buckets: PER_VISIT_BARS,
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

  it('AC-4107.3: 막대는 단위 (만 원), 칸 31개 이하면 막대 위 숫자, 화면 읽기 표 `매출 추이 (만 원)`이고 확인 필요한 날은 –다', () => {
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

  it('AC-4107.3: [어떻게 세나요?]는 처음 접혀 있고 펼치면 네 문단이 이 차례다', () => {
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

  it('AC-4107.6: 막대는 단위 (천 원) · 화면 읽기 표 `건당 진료비 (천 원)` · 아래 글 · [어떻게 세나요?] 두 문단(건당 진료비)', () => {
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

// first90 AC-4408.1: 참고 금액 포함 스위치의 둘째 자리(매출 칸 제목 줄 오른쪽). 상태는 부르는 쪽(StatsSections)이 갖는다
describe('AC-4408.1: 매출 칸 제목 줄의 참고 금액 포함 스위치', () => {
  const drawCard = (props: Partial<Parameters<typeof RevenueSection>[0]> = {}) =>
    render(
      <StatsCard title="매출">
        <RevenueSection tabs={ready()} noDayCodes={false} onReread={() => undefined} {...props} />
      </StatsCard>,
    )
  const cardHead = () => screen.getAllByRole('heading', { level: 2, name: '매출' })[0]!.parentElement!

  it('AC-4408.1: 확인 필요한 날이 있으면 큰 카드 제목 줄 오른쪽에 스위치가 있고, 누르면 onMode를 부른다', () => {
    const onMode = vi.fn()
    drawCard({ mode: 'out', onMode, rough: { days: 2, roughDays: 1 } })
    const button = within(cardHead()).getByRole('switch', { name: '참고 금액 포함' })
    expect(button.getAttribute('aria-checked')).toBe('false')
    expect(within(cardHead()).getByText('확인 필요한 날 2일은 빼고 셌어요')).toBeTruthy()
    fireEvent.click(button)
    expect(onMode).toHaveBeenCalledWith('in')
  })

  it('AC-4408.1: 켜짐이면 aria-checked="true"이고 아래 글은 참고 금액 글이다', () => {
    drawCard({ mode: 'in', onMode: () => undefined, rough: { days: 2, roughDays: 1 } })
    expect(within(cardHead()).getByRole('switch').getAttribute('aria-checked')).toBe('true')
    expect(within(cardHead()).getByText('확인 필요한 날 1일의 참고 금액을 더했어요')).toBeTruthy()
  })

  it('AC-4408.1: 확인 필요한 날이 없거나 rough를 주지 않으면 스위치가 없다. 탭 넷은 그대로다', () => {
    drawCard({ mode: 'out', onMode: () => undefined, rough: { days: 0, roughDays: 0 } })
    expect(screen.queryByRole('switch')).toBeNull()
    expect(tabs()).toHaveLength(4)
    cleanup()
    drawCard()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('AC-4408.1: 읽는 중·읽기 실패·자료 없음 칸에는 스위치가 없다', () => {
    for (const tabsIn of ['reading', 'read-failed', { kind: 'empty' }] as const) {
      drawCard({ tabs: tabsIn, mode: 'out', onMode: () => undefined, rough: { days: 2, roughDays: 1 } })
      expect(screen.queryByRole('switch')).toBeNull()
      cleanup()
    }
  })
})
