// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ChartLegend } from '@/components/charts/ChartLegend'
import { KpiStat } from '@/components/charts/KpiStat'
import { RankedBars } from '@/components/charts/RankedBars'
import { StackedBarChart, type BarSeries } from '@/components/charts/StackedBarChart'
import { ds } from '@/components/ui/classes'
import { addDays } from '@/lib/analytics/dates'
import { isBorderBox, nestedBoxes } from '@/testing/boxes'
import type { DayPayload, RevisitPayload } from '@/types/payload'
import { DashboardAnalysis } from './DashboardAnalysis'
import type { SummarySource } from './source'
import { periodRange, tickLabels, topRx, trendBuckets, weekdayBuckets, type Period } from './view'

// 오늘 하루 분석 · 기간별 흐름 (tab-frame REQ-311, design.md '오늘 하루 분석 · 기간별 흐름 · 보고 문장', 시안 docs/mockups/dashboard-home/ + 메모 §3·§4).
// jsdom은 CSS를 계산하지 않는다 → 정해 둔 클래스·글자·짜임을 본다. 차트 부품은 같은 props로 따로 그린 마크업과 견준다.
// 가짜 DayPayload는 이 시험 파일 안에서만 만든다(AC-312.3)
// ui-90 REQ-414(design.md '대시보드 (TASK-11)', 시안 docs/mockups/ui-90/app/gen.py dash_body): 연결 전 기간별 흐름은 빈 그래프 틀 대신
// "연결하면 생기는 것 4가지" 순서 목록 + 안내 줄이고 차트 부품을 그리지 않는다. 보조 글은 small + 최대 폭. 연결 뒤 모양은 그대로다

afterEach(cleanup)

const TODAY = '2026-10-31' // 토요일
const NONE: SummarySource = { kind: 'none' }

type Rx = DayPayload['rx'][number]
const rx = (code: string, name: string, patients: number): Rx => ({ code, name, type: '처치', patients, newPatients: 0, returning: patients })
type DayOptions = { partial?: boolean; newPatients?: number; returning?: number; rx?: Rx[]; revisit?: RevisitPayload }
function day(ymd: string, o: DayOptions = {}): DayPayload {
  const newPatients = o.newPatients ?? 2
  const returning = o.returning ?? 8
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: o.partial ?? false,
    totals: { patients: newPatients + returning, newPatients, returning, unknown: 0 },
    rx: o.rx ?? [],
    groups: [],
    revisit: o.revisit ?? { cohort: newPatients, within7: 0, within14: 0 },
  }
}
const data = (days: DayPayload[]): SummarySource => ({ kind: 'data', days })
// 보조 글(AC-414.6): small(13px) muted + 시안 40em(520px)에 가장 가까운 4px 단위 폭 단계
const NOTE = 'text-small text-muted max-w-130'
// 넷째 칸의 증감·"변화 없음" 값(bit-dashboard design.md '### 날짜 고르기', 시안 css_extra.css .kpi-v.sm): PC 20/36, 폰 16/32. 글자 토큰의 줄 높이는 28·24라 줄 높이를 따로 준다
const DELTA_VALUE = 'text-title leading-9 max-md:text-subtitle max-md:leading-8 font-semibold'
// 연결 전 기간별 흐름 (AC-414.4, 시안 gains 글자 그대로)
const GAINS_TITLE = '연결하면 생기는 것 4가지'
const GAINS = [
  ['환자 수 추이', '신환과 재진을 하루씩 막대로 보여 줘요.'],
  ['신환 재방문율', '처음 온 환자가 7·14·30일 안에 다시 온 비율이에요.'],
  ['요일별 환자 수', '요일마다 하루 평균 환자 수예요.'],
  ['처방 상위', '많이 낸 처방 5가지를 차례로 적어요.'],
] as const
const GAINS_NOTE = '연결한 뒤에는 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.'
const TODAY_NOTE = '연결하면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요.'
// 연결 뒤인데 기간 안 날짜 자료가 없음(오늘 줄만): 그래프 칸은 빈 틀 + "자료 없음"
const EMPTY_RANGE = data([day(TODAY, { rx: [rx('A1', '물리치료', 3)] })])

// 연결 뒤 가짜 자료: 오늘 끝남(13명) · 지난주 토요일 끝남(10명) · 기간 안 여러 날(덜 끝난 날 하나) · 30일 밖 90일 안 · 90일 밖
const FULL_DAYS = [
  day(TODAY, { newPatients: 4, returning: 9 }),
  day('2026-10-24', { newPatients: 2, returning: 8, rx: [rx('A1', '물리치료', 6)], revisit: { cohort: 2, within7: 1, within14: 1 } }),
  day('2026-10-30', { newPatients: 3, returning: 7, rx: [rx('A1', '물리치료', 5), rx('B2', '도수치료', 2)], revisit: { cohort: 3, within7: 1, within14: null } }),
  day('2026-10-12', { partial: true, newPatients: 1, returning: 5, rx: [rx('C3', '주사', 3)], revisit: { cohort: 1, within7: null, within14: null } }),
  day('2026-10-05', { newPatients: 5, returning: 15, rx: [rx('D4', '견인', 4)], revisit: { cohort: 5, within7: 2, within14: 3 } }),
  day('2026-09-15', { newPatients: 1, returning: 1, rx: [rx('E5', '초음파', 9)] }),
  day('2026-07-01', { newPatients: 9, returning: 9, rx: [rx('Z9', '기간 밖', 99)] }),
]

const TREND_SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '재진', tone: 'chart-3' },
]
const WEEK_SERIES: BarSeries[] = [{ name: '환자 수', tone: 'accent' }]

const tokens = (classes: string | null) => (classes ?? '').split(/\s+/).filter(Boolean)
const classesOf = (el: Element) => tokens(el.getAttribute('class'))
const hasAll = (el: Element, classes: string) => expect(classesOf(el)).toEqual(expect.arrayContaining(tokens(classes)))
const allClasses = (root: Element) => [root, ...Array.from(root.querySelectorAll('[class]'))].flatMap(classesOf)

// 따로 그린 부품 마크업(같은 방식 — 브라우저 DOM — 으로 그려 견준다)
function markupOf(node: ReactElement): string {
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() => root.render(node))
  const html = host.innerHTML
  act(() => root.unmount())
  return html
}

const draw = (source: SummarySource, today = TODAY) => render(<DashboardAnalysis today={today} source={source} />)
const region = (name: string) => screen.getByRole('region', { name })
const chart = (name: string) => screen.getByRole('group', { name })
// 숫자 줄 = '오늘 하루 분석' 머리 줄 다음 칸
const kpiRow = () => {
  const row = region('오늘 하루 분석').children[1]
  if (!row) throw new Error('숫자 줄이 없다')
  return row
}
const kpiCells = () => Array.from(kpiRow().children)
const periodButtons = () => within(screen.getByRole('group', { name: '기간' })).getAllByRole('button')
const pressed = () => periodButtons().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)
const rangeText = () => within(region('기간별 흐름')).getByText(/^\d+월 \d+일 – \d+월 \d+일$/).textContent
const choose = async (label: string) => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: label }))
}
// 환자 수 추이 빈 틀 아래 날짜 눈금 글자
// (그룹 안 마지막 aria-hidden 요소 — 범례 표시·가로선 다음)
const tickRow = () => Array.from(chart('환자 수 추이').querySelectorAll('[aria-hidden="true"]')).at(-1)!
const emptyTicks = () => Array.from(tickRow().children).map((el) => el.textContent)
const ticksOf = (period: Period) => tickLabels(periodRange(TODAY, period), period).map((t) => t.label)

describe('오늘 하루 분석 — 연결 전', () => {
  it.each([
    ['none', NONE],
    ['data인데 days가 비었음', data([])],
  ] as const)('AC-311.1·AC-414.3: 연결 전(%s) — h2 옆 neutral 칩 "비트 PC 연결 전", 네 칸 이 순서, 모두 "–" + "연결하면 보여요"', (_, source) => {
    draw(source)
    const section = region('오늘 하루 분석')
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('오늘 하루 분석')
    const chip = within(section).getByText('비트 PC 연결 전')
    hasAll(chip, ds.chip.neutral)
    expect(chip.parentElement).toBe(within(section).getByRole('heading', { level: 2 }).parentElement)
    const cells = kpiCells()
    expect(cells.map((c) => c.querySelector('span')?.textContent)).toEqual(['오늘 환자 수', '신환', '재진', '지난주 같은 요일보다'])
    for (const cell of cells) {
      expect(within(cell as HTMLElement).getByText('–')).toBeTruthy()
      expect(within(cell as HTMLElement).getByText('연결하면 보여요')).toBeTruthy()
    }
  })

  it('AC-311.1: 네 칸은 KpiStat(count · 단위 "명" · emptyText "연결하면 보여요") 그대로다', () => {
    draw(NONE)
    const labels = ['오늘 환자 수', '신환', '재진', '지난주 같은 요일보다']
    kpiCells().forEach((cell, i) => {
      expect(cell.innerHTML).toBe(markupOf(<KpiStat label={labels[i]!} value={null} format="count" unit="명" emptyText="연결하면 보여요" />))
    })
  })

  it('AC-311.1·AC-414.3·AC-414.6: 줄 아래 한 줄(small muted, 최대 폭)이 있고, 원장님 보고 문장 빈 줄은 이 섹션에 없다', () => {
    draw(NONE)
    const section = region('오늘 하루 분석')
    const note = within(section).getByText(TODAY_NOTE)
    expect(note.tagName).toBe('P')
    hasAll(note, `mt-3 ${NOTE}`)
    expect(classesOf(note)).not.toContain('text-caption')
    expect(within(section).queryByText('원장님 보고 문장')).toBeNull()
    expect(section.querySelector('h1')).toBeNull()
  })
})

describe('오늘 하루 분석 — 연결 뒤', () => {
  it('AC-311.2: 칩과 아래 한 줄이 없고, 첫 세 칸은 오늘 줄 totals(KpiStat count · "명")', () => {
    draw(data(FULL_DAYS))
    const section = region('오늘 하루 분석')
    expect(within(section).queryByText('비트 PC 연결 전')).toBeNull()
    expect(within(section).queryByText(/연결하면 이 숫자로/)).toBeNull()
    const [patients, newPatients, returning] = kpiCells()
    expect(patients!.innerHTML).toBe(markupOf(<KpiStat label="오늘 환자 수" value={13} format="count" unit="명" />))
    expect(newPatients!.innerHTML).toBe(markupOf(<KpiStat label="신환" value={4} format="count" unit="명" />))
    expect(returning!.innerHTML).toBe(markupOf(<KpiStat label="재진" value={9} format="count" unit="명" />))
  })

  it('AC-311.2: 오늘과 7일 전이 모두 끝났으면 넷째 칸 값은 증감 글자(화살표 · "늘어남" · "3명 (+30.0%)") + "지난주 토요일"', () => {
    draw(data(FULL_DAYS))
    const cell = kpiCells()[3] as HTMLElement
    expect(within(cell).getByText('지난주 같은 요일보다')).toBeTruthy()
    const value = within(cell).getByText('3명 (+30.0%)').parentElement!
    hasAll(value, `${DELTA_VALUE} text-positive`)
    expect(classesOf(value)).not.toContain('text-metric')
    expect(within(value).getByText('늘어남').className).toBe('sr-only')
    expect(value.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    const compare = within(cell).getByText('지난주 토요일')
    hasAll(compare, 'text-small text-muted')
    expect(within(cell).queryByText('–')).toBeNull()
  })

  it('AC-311.2: 넷째 칸 값 줄의 화면 읽기 글자와 증감 글자 사이에 빈칸이 있다("늘어남 3명 …", 붙여 읽지 않게)', () => {
    draw(data(FULL_DAYS))
    const value = within(kpiCells()[3] as HTMLElement).getByText('3명 (+30.0%)').parentElement!
    expect(value.textContent).toBe('늘어남 3명 (+30.0%)')
  })

  it('AC-311.2: 줄어들면 화살표 · "줄어듦" · negative, 같으면 화살표 없이 "변화 없음"', () => {
    draw(data([day(TODAY, { newPatients: 1, returning: 4 }), day('2026-10-24', { newPatients: 2, returning: 8 })]))
    const down = within(kpiCells()[3] as HTMLElement).getByText('5명 (−50.0%)').parentElement!
    hasAll(down, `${DELTA_VALUE} text-negative`)
    expect(classesOf(down)).not.toContain('text-metric')
    expect(within(down).getByText('줄어듦')).toBeTruthy()
    expect(down.querySelector('svg')).not.toBeNull()
    cleanup()
    draw(data([day(TODAY, { newPatients: 2, returning: 8 }), day('2026-10-24', { newPatients: 2, returning: 8 })]))
    const flat = within(kpiCells()[3] as HTMLElement).getByText('변화 없음').parentElement!
    hasAll(flat, `${DELTA_VALUE} text-muted`)
    expect(classesOf(flat)).not.toContain('text-metric')
    expect(flat.querySelector('svg')).toBeNull()
    expect(within(kpiCells()[3] as HTMLElement).getByText('지난주 토요일')).toBeTruthy()
  })

  it('AC-311.2: 오늘 줄이 덜 끝났으면 넷째 칸은 "–" + "오늘 진료가 끝나면 비교해요"', () => {
    draw(data([day(TODAY, { partial: true, newPatients: 4, returning: 9 }), day('2026-10-24')]))
    expect(kpiCells()[3]!.innerHTML).toBe(
      markupOf(<KpiStat label="지난주 같은 요일보다" value={null} format="count" unit="명" emptyText="오늘 진료가 끝나면 비교해요" />),
    )
    expect(kpiCells()[0]!.innerHTML).toBe(markupOf(<KpiStat label="오늘 환자 수" value={13} format="count" unit="명" />))
  })

  it('AC-311.2·AC-311.6: 오늘 끝남 + 7일 전 줄 없음/덜 끝남 → "–" + "지난주 자료가 없어요"', () => {
    const expected = markupOf(<KpiStat label="지난주 같은 요일보다" value={null} format="count" unit="명" emptyText="지난주 자료가 없어요" />)
    draw(data([day(TODAY), day('2026-10-23')]))
    expect(kpiCells()[3]!.innerHTML).toBe(expected)
    cleanup()
    draw(data([day(TODAY), day('2026-10-24', { partial: true })]))
    expect(kpiCells()[3]!.innerHTML).toBe(expected)
  })

  it('AC-311.2·AC-311.6: 오늘 줄이 없으면 세 칸 "–" + "자료 없음"(KpiStat 기본), 넷째 칸 "오늘 진료가 끝나면 비교해요"', () => {
    draw(data([day('2026-10-30'), day('2026-10-24')]))
    const labels = ['오늘 환자 수', '신환', '재진']
    labels.forEach((label, i) => {
      expect(kpiCells()[i]!.innerHTML).toBe(markupOf(<KpiStat label={label} value={null} format="count" unit="명" />))
    })
    expect(within(kpiCells()[3] as HTMLElement).getByText('오늘 진료가 끝나면 비교해요')).toBeTruthy()
  })
})

// 비트 읽기 상태 글 (bit-dashboard design.md '### 화면', 시안 docs/mockups/bit-dashboard/gen.py today_sec·flow_empty). 주지 않으면 위 연결 전 글 그대로다
describe('숫자가 없을 때 글 바꾸기 (bit-dashboard)', () => {
  const READ_NOTE = '읽기가 끝나면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요.'
  const READ_GAINS_TITLE = '읽기가 끝나면 생기는 것 4가지'
  const READ_GAINS_NOTE = '읽기가 끝나면 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.'
  const READ_REVISIT = '처음 온 환자가 7·14일 안에 다시 온 비율이에요.'

  it('AC-601.2: emptyChip·emptyText·emptyNote가 칩·숫자 칸 넷·안내 줄을 바꾸고 모양은 그대로다', () => {
    render(<DashboardAnalysis today={TODAY} source={NONE} emptyChip="읽는 중" emptyText="읽는 중" emptyNote={READ_NOTE} />)
    const section = region('오늘 하루 분석')
    hasAll(within(section).getByText('읽는 중', { selector: 'span.' + ds.chip.neutral.split(' ')[0] }), ds.chip.neutral)
    const labels = ['오늘 환자 수', '신환', '재진', '지난주 같은 요일보다']
    kpiCells().forEach((cell, i) => {
      expect(cell.innerHTML).toBe(markupOf(<KpiStat label={labels[i]!} value={null} format="count" unit="명" emptyText="읽는 중" />))
    })
    hasAll(within(section).getByText(READ_NOTE), `mt-3 ${NOTE}`)
    expect(within(section).queryByText('비트 PC 연결 전')).toBeNull()
    expect(within(section).queryByText(TODAY_NOTE)).toBeNull()
  })

  it('AC-601.4·AC-601.7: emptyNote가 null이면 안내 줄이 없다', () => {
    render(<DashboardAnalysis today={TODAY} source={NONE} emptyChip="읽지 못함" emptyText="읽지 못했어요" emptyNote={null} />)
    const section = region('오늘 하루 분석')
    expect(within(section).getByText('읽지 못함')).toBeTruthy()
    expect(within(section).getAllByText('읽지 못했어요')).toHaveLength(4)
    expect(section.querySelector('.max-w-130')).toBeNull()
  })

  it('AC-601.2: gainsTitle·gainsNote·gainsRevisitDesc가 목록 제목·안내 줄·재방문율 설명을 바꾸고, 나머지 줄은 그대로다', () => {
    render(<DashboardAnalysis today={TODAY} source={NONE} gainsTitle={READ_GAINS_TITLE} gainsNote={READ_GAINS_NOTE} gainsRevisitDesc={READ_REVISIT} />)
    const section = region('기간별 흐름')
    expect(within(section).getByText(READ_GAINS_TITLE)).toBeTruthy()
    expect(within(section).getByText(READ_GAINS_NOTE)).toBeTruthy()
    expect(within(section).getByRole('list', { name: READ_GAINS_TITLE })).toBeTruthy()
    expect(within(section).queryByText(GAINS_TITLE)).toBeNull()
    expect(within(section).queryByText(GAINS_NOTE)).toBeNull()
    const expected = GAINS.map(([name, desc]) => [name, name === '신환 재방문율' ? READ_REVISIT : desc])
    const shown = within(section).getAllByRole('listitem').map((li) => {
      const [, title, desc] = Array.from(li.children)
      return [title!.textContent, desc!.textContent]
    })
    expect(shown).toEqual(expected)
  })

  it('AC-601.11: emptyCharts면 읽었는데 자료가 없는 것이다 — 목록 대신 빈 그래프 틀 넷("자료 없음"), 숫자 칸은 emptyText', () => {
    render(<DashboardAnalysis today={TODAY} source={data([])} emptyChip="자료 없음" emptyText="자료 없음" emptyNote={null} emptyCharts />)
    const flow = region('기간별 흐름')
    expect(within(flow).queryByText(GAINS_TITLE)).toBeNull()
    for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수', '처방 상위']) expect(chart(name)).toBeTruthy()
    expect(within(chart('환자 수 추이')).getByText('자료 없음')).toBeTruthy()
    expect(within(chart('요일별 환자 수')).getByText('자료 없음')).toBeTruthy()
    expect(within(chart('처방 상위')).getByText('자료 없음')).toBeTruthy()
    expect(flow.querySelector('table')).toBeNull()
    const section = region('오늘 하루 분석')
    expect(within(section).getAllByText('자료 없음')).toHaveLength(5) // 칩 + 칸 넷
    expect(within(section).queryByText(TODAY_NOTE)).toBeNull()
  })

  it('AC-601.1: 숫자가 있으면 이 글들을 쓰지 않는다', () => {
    render(
      <DashboardAnalysis
        today={TODAY}
        source={data(FULL_DAYS)}
        emptyChip="읽는 중"
        emptyText="읽는 중"
        emptyNote={READ_NOTE}
        gainsTitle={READ_GAINS_TITLE}
        gainsNote={READ_GAINS_NOTE}
        gainsRevisitDesc={READ_REVISIT}
      />,
    )
    expect(screen.queryByText('읽는 중')).toBeNull()
    expect(screen.queryByText(READ_NOTE)).toBeNull()
    expect(screen.queryByText(READ_GAINS_TITLE)).toBeNull()
    expect(chart('환자 수 추이')).toBeTruthy()
  })
})

describe('기간별 흐름 — 머리 줄과 기간 단추', () => {
  it('AC-311.3: h2 · 기간 글자 · 기간 단추 묶음(group "기간") 최근 7일 · 30일 · 90일, 처음은 30일만 눌림', () => {
    draw(NONE)
    const section = region('기간별 흐름')
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('기간별 흐름')
    expect(rangeText()).toBe('10월 1일 – 10월 30일')
    expect(periodButtons().map((b) => b.textContent)).toEqual(['최근 7일', '최근 30일', '최근 90일'])
    expect(periodButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    for (const b of periodButtons()) expect(b.getAttribute('type')).toBe('button')
  })

  it('AC-311.3·AC-414.4: 연결 전에도 단추가 눌리고 기간 글자가 바뀐다 — 아래 "연결하면 생기는 것" 목록은 그대로다', async () => {
    draw(NONE)
    const gains = () => region('기간별 흐름').querySelector('ol')!.outerHTML
    const before = gains()
    await choose('최근 90일')
    expect(pressed()).toEqual(['최근 90일'])
    expect(rangeText()).toBe('8월 2일 – 10월 30일')
    await choose('최근 7일')
    expect(pressed()).toEqual(['최근 7일'])
    expect(rangeText()).toBe('10월 24일 – 10월 30일')
    expect(gains()).toBe(before)
  })

  it('AC-311.3: 연결 뒤 기간 안 자료가 없을 때 환자 수 추이 빈 틀의 날짜 눈금이 기간마다 바뀐다', async () => {
    draw(EMPTY_RANGE)
    expect(emptyTicks()).toEqual(ticksOf(30))
    await choose('최근 90일')
    expect(emptyTicks()).toEqual(ticksOf(90))
    await choose('최근 7일')
    expect(emptyTicks()).toEqual(['10.24', '10.25', '10.26', '10.27', '10.28', '10.29', '10.30'])
  })

  it('AC-311.3: 연결 뒤 다른 기간을 누르면 그래프 넷이 그 기간으로 다시 그려지고 숫자 줄은 그대로다', async () => {
    draw(data(FULL_DAYS))
    const before = kpiRow().innerHTML
    const range7 = periodRange(TODAY, 7)
    await choose('최근 7일')
    expect(rangeText()).toBe('10월 24일 – 10월 30일')
    const trend = chart('환자 수 추이').querySelector('table')!.parentElement!
    expect(trend.outerHTML).toBe(
      markupOf(<StackedBarChart title="환자 수 추이" unit="명" series={TREND_SERIES} buckets={trendBuckets(FULL_DAYS, range7, 7)!} />),
    )
    const week = chart('요일별 환자 수').querySelector('table')!.parentElement!
    expect(week.outerHTML).toBe(markupOf(<StackedBarChart title="요일별 환자 수" unit="명" series={WEEK_SERIES} buckets={weekdayBuckets(FULL_DAYS, range7)!} />))
    expect(chart('처방 상위').querySelector('ol')!.outerHTML).toBe(markupOf(<RankedBars title="처방 상위" unit="건" items={topRx(FULL_DAYS, range7)!} />))
    expect(within(chart('신환 재방문율')).getByText('50.0%')).toBeTruthy()
    expect(kpiRow().innerHTML).toBe(before)
  })
})

describe('기간별 흐름 — 연결 전 "연결하면 생기는 것 4가지" (AC-414.4)', () => {
  const gainsTitle = () => within(region('기간별 흐름')).getByText(GAINS_TITLE)
  const gainsList = () => region('기간별 흐름').querySelector('ol') as HTMLOListElement

  it('AC-414.4: 머리 줄(h2 · 기간 글자 · 기간 단추) 아래 "연결하면 생기는 것 4가지"(subtitle 600) → 순서 목록 → 안내 줄 차례', () => {
    draw(NONE)
    const section = region('기간별 흐름')
    expect(section.children).toHaveLength(4)
    const [head, title, list, note] = Array.from(section.children) as HTMLElement[]
    expect(within(head!).getByRole('heading', { level: 2 }).textContent).toBe('기간별 흐름')
    expect(within(head!).getByRole('group', { name: '기간' })).toBeTruthy()
    expect(within(head!).getByText('10월 1일 – 10월 30일')).toBeTruthy()
    expect(title).toBe(gainsTitle())
    expect(title!.tagName).toBe('P')
    hasAll(title!, 'text-subtitle font-semibold text-ink')
    expect(list).toBe(gainsList())
    expect(note!.textContent).toBe(GAINS_NOTE)
    expect(note!.tagName).toBe('P')
    hasAll(note!, `mt-3 ${NOTE}`)
    expect(classesOf(note!)).not.toContain('text-caption')
  })

  it('AC-414.4: 순서 목록(ol, 이름 = "연결하면 생기는 것 4가지") 4줄 — 번호 상자 1~4 · 이름(body 600 ink) · 설명(small ink-2), 시안 gains 글자 그대로', () => {
    draw(NONE)
    const list = gainsList()
    expect(list.getAttribute('aria-labelledby')).toBe(gainsTitle().id)
    expect(gainsTitle().id).not.toBe('')
    expect(within(region('기간별 흐름')).getByRole('list', { name: GAINS_TITLE })).toBe(list)
    const rows = Array.from(list.children) as HTMLElement[]
    expect(rows.map((li) => li.tagName)).toEqual(['LI', 'LI', 'LI', 'LI'])
    rows.forEach((li, i) => {
      const [no, name, desc] = Array.from(li.children) as HTMLElement[]
      expect(li.children).toHaveLength(3)
      expect(no!.textContent).toBe(String(i + 1))
      hasAll(no!, 'grid size-5 shrink-0 place-items-center rounded-control border border-line-strong text-caption font-semibold text-muted')
      expect(name!.textContent).toBe(GAINS[i]![0])
      hasAll(name!, 'text-body font-semibold text-ink')
      expect(desc!.textContent).toBe(GAINS[i]![1])
      hasAll(desc!, 'text-small text-ink-2')
    })
  })

  it('AC-414.4: 768px 이상 4칸 한 줄(위아래 1px line, 칸 사이 1px line 세로선, 첫 칸 왼쪽 0), 768px 미만 쌓기(칸마다 아래 1px line, 설명은 이름 아래로 들여씀)', () => {
    draw(NONE)
    const list = gainsList()
    hasAll(list, 'mt-2 grid list-none border-t border-line md:grid-cols-4 md:border-b')
    for (const t of classesOf(list)) expect(t, t).not.toMatch(/^grid-cols-/) // 폰은 한 줄에 하나
    for (const li of Array.from(list.children)) {
      hasAll(li, 'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 border-b border-line py-3 md:border-b-0 md:border-l md:py-4 md:px-5 md:first:border-l-0 md:first:pl-0')
      // 설명: 768px 이상 번호 상자 아래 전체 폭(위 4), 768px 미만 이름 칸 아래(위 2)
      hasAll(li.children[2]!, 'col-span-2 mt-1 max-md:col-span-1 max-md:col-start-2 max-md:mt-0.5')
    }
  })

  it('AC-414.4: 빈 그래프 틀·차트 부품이 없다 — 그래프 칸(h3·group)·화면 읽기 표·범례·빈 막대·날짜 눈금·"자료 없음"이 없다', () => {
    const { container } = draw(NONE)
    const section = region('기간별 흐름')
    expect(within(section).queryAllByRole('heading', { level: 3 })).toEqual([])
    expect(within(section).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['기간'])
    expect(section.querySelector('table')).toBeNull()
    expect(section.querySelector('ul')).toBeNull() // ChartLegend
    expect(section.querySelector('[aria-hidden="true"]')).toBeNull() // 빈 틀·눈금은 꾸밈(aria-hidden)이었다
    expect(section.querySelector('[style]')).toBeNull()
    for (const gone of ['비트 PC를 연결하면 이 기간의 하루하루가 막대로 그려집니다', '자료 없음', '7일 안에 다시 옴', '많이 낸 처방 5가지가 차례로 적힙니다', '신환·재진, 하루씩']) {
      expect(container.textContent, gone).not.toContain(gone)
    }
  })

  it.each([7, 30, 90] as const)('AC-414.4·AC-414.7: 연결 전(기간 %i일) 글자에서 고정 글자(기간 글자 · 기간 단추 · "4가지"와 번호 1~4 · 시안 설명 · 안내 줄)를 빼면 숫자가 없다', async (period) => {
    const { container } = draw(NONE)
    if (period !== 30) await choose(`최근 ${period}일`)
    const fixed = [
      periodRange(TODAY, period).label,
      '최근 7일',
      '최근 30일',
      '최근 90일',
      GAINS_TITLE,
      ...GAINS.map(([, desc]) => desc),
      GAINS_NOTE,
    ].sort((a, b) => b.length - a.length)
    // 번호 상자 1~4는 덩어리째 뺀다
    const numbers = Array.from(gainsList().children).map((li) => li.children[0]!.textContent)
    expect(numbers).toEqual(['1', '2', '3', '4'])
    const copy = container.cloneNode(true) as HTMLElement
    for (const li of Array.from(copy.querySelectorAll('ol > li'))) li.children[0]!.remove()
    let text = copy.textContent ?? ''
    for (const s of fixed) {
      expect(text, s).toContain(s)
      text = text.split(s).join(' ')
    }
    expect(text).not.toMatch(/\d/)
  })

  it('AC-414.4: 연결 뒤(시험 안 가짜 자료)에는 "연결하면 생기는 것"과 안내 줄이 없고 그래프 넷이 그대로다', () => {
    draw(data(FULL_DAYS))
    const section = region('기간별 흐름')
    expect(within(section).queryByText(GAINS_TITLE)).toBeNull()
    expect(within(section).queryByText(GAINS_NOTE)).toBeNull()
    expect(within(section).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['환자 수 추이', '신환 재방문율', '요일별 환자 수', '처방 상위'])
    expect(section.querySelectorAll('table')).toHaveLength(2)
  })
})

describe('기간별 흐름 — 연결 뒤 그래프 칸 (AC-311.4 · 연결 뒤 모양 그대로)', () => {
  it('AC-311.4: 그래프 넷의 제목(h3)·설명이 이 차례다', () => {
    draw(data(FULL_DAYS))
    const section = region('기간별 흐름')
    expect(within(section).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['환자 수 추이', '신환 재방문율', '요일별 환자 수', '처방 상위'])
    const desc = [
      ['환자 수 추이', '신환·재진, 하루씩'],
      ['신환 재방문율', '처음 온 환자가 다시 온 비율'],
      ['요일별 환자 수', '하루 평균, 요일마다'],
      ['처방 상위', '많이 낸 처방 5가지가 차례로 적힙니다'],
    ]
    for (const [name, text] of desc) {
      const p = within(chart(name!)).getByText(text!)
      hasAll(p, 'text-small text-muted')
    }
    for (const h of within(section).getAllByRole('heading', { level: 3 })) hasAll(h, 'text-subtitle font-semibold')
  })

  it('AC-311.4: 기간 안 자료가 없을 때 환자 수 추이 — 범례(ChartLegend 신환 accent · 재진 chart-3), 가로선 다섯(마지막 line-strong, aria-hidden), 가운데 "자료 없음", 날짜 눈금', () => {
    draw(EMPTY_RANGE)
    const group = chart('환자 수 추이')
    expect(group.querySelector('ul')!.outerHTML).toBe(
      markupOf(
        <ChartLegend
          items={[
            { label: '신환', mark: 'accent' },
            { label: '재진', mark: 'chart-3' },
          ]}
        />,
      ),
    )
    const message = within(group).getByText('자료 없음')
    expect(message.closest('[aria-hidden="true"]')).toBeNull()
    hasAll(message, 'bg-surface px-3 py-1 text-small text-muted')
    const plot = message.parentElement!.parentElement!
    hasAll(plot, 'relative h-50 max-md:h-35')
    const lines = plot.querySelector('[aria-hidden="true"]')!
    expect(lines.children).toHaveLength(5)
    Array.from(lines.children).forEach((line, i) => hasAll(line, `h-px ${i === 4 ? 'bg-line-strong' : 'bg-line'}`))
    expect(emptyTicks()).toEqual(['10.1', '10.8', '10.15', '10.22', '10.29'])
  })

  it('AC-311.4: 날짜 눈금은 caption muted 꾸밈(aria-hidden)이고 기간마다 바뀐다', async () => {
    draw(EMPTY_RANGE)
    const ticks = tickRow()
    hasAll(ticks, 'flex justify-between text-caption text-muted')
    await choose('최근 90일')
    expect(emptyTicks()).toEqual(['8.2', '8.23', '9.13', '10.4', '10.25'])
  })

  it.each([
    ['연결 전', NONE, true],
    ['연결 뒤 · 오늘 줄 없음', data([day('2026-10-30'), day('2026-10-24')]), true],
    ['연결 뒤 · 기간 안 자료 없음', EMPTY_RANGE, true],
    ['연결 뒤 · 자료 다 있음', data(FULL_DAYS), false],
  ] as const)('AC-407.2: %s — 분석의 "–"(KPI·재방문율·처방 상위 빈 줄)는 모두 글자색 muted이고 faint 글자가 없다', (_, source, hasDash) => {
    const { container } = draw(source)
    const dashes = Array.from(container.querySelectorAll('*')).filter((el) => el.children.length === 0 && el.textContent === '–')
    if (hasDash) expect(dashes.length).toBeGreaterThan(0)
    for (const dash of dashes) hasAll(dash, 'text-muted')
    expect(allClasses(container).filter((t) => /(?:^|:)text-faint(?:\/\d+)?$/.test(t))).toEqual([])
  })

  it('AC-311.4: 기간 안 자료가 없을 때 요일별 환자 수 — 빈 막대 칸 7개와 "월 화 수 목 금 토 일"(aria-hidden, 150px · 폰 110px)', () => {
    draw(EMPTY_RANGE)
    const frame = chart('요일별 환자 수').querySelector('[aria-hidden="true"]')!
    hasAll(frame, 'grid grid-cols-7 h-37.5 max-md:h-27.5')
    expect(frame.children).toHaveLength(7)
    expect(Array.from(frame.children).map((c) => c.textContent)).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    for (const col of Array.from(frame.children)) hasAll(col.children[0]!, 'border border-line bg-canvas border-b-line-strong')
  })

  it('AC-311.4: 기간 안 자료가 없을 때 처방 상위 — 빈 줄 다섯(번호 · 빈 칸 · "–", aria-hidden, 36px)', () => {
    draw(EMPTY_RANGE)
    const list = chart('처방 상위').querySelector('ol')!
    expect(list.getAttribute('aria-hidden')).toBe('true')
    const rows = Array.from(list.children)
    expect(rows).toHaveLength(5)
    rows.forEach((row, i) => {
      hasAll(row, 'h-9 border-t border-line')
      expect(row.children[0]!.textContent).toBe(String(i + 1))
      hasAll(row.children[0]!, 'text-caption font-semibold text-muted')
      expect(row.children[1]!.textContent).toBe('')
      expect(row.children[2]!.textContent).toBe('–')
    })
  })
})

describe('기간별 흐름 — 연결 뒤 그래프', () => {
  const MONTH = periodRange(TODAY, 30)

  it('AC-311.5: 환자 수 추이 = StackedBarChart(신환 accent · 재진 chart-3 · "명", 30일은 dense) — 기간 안 자료 있는 날마다 한 칸', () => {
    draw(data(FULL_DAYS))
    const root = chart('환자 수 추이').querySelector('table')!.parentElement!
    const buckets = trendBuckets(FULL_DAYS, MONTH, 30)!
    expect(buckets.map((b) => b.key)).toEqual(['2026-10-05', '2026-10-12', '2026-10-24', '2026-10-30'])
    expect(root.outerHTML).toBe(markupOf(<StackedBarChart title="환자 수 추이" unit="명" series={TREND_SERIES} buckets={buckets} dense />))
    expect(within(chart('환자 수 추이')).queryByText('비트 PC를 연결하면 이 기간의 하루하루가 막대로 그려집니다')).toBeNull()
    // 범례는 연결 뒤에도 그대로
    expect(chart('환자 수 추이').querySelector('ul')).not.toBeNull()
  })

  it('AC-311.5: 90일도 dense, 7일은 dense 없이(막대 위 합계)', async () => {
    draw(data(FULL_DAYS))
    await choose('최근 90일')
    const quarter = periodRange(TODAY, 90)
    expect(chart('환자 수 추이').querySelector('table')!.parentElement!.outerHTML).toBe(
      markupOf(<StackedBarChart title="환자 수 추이" unit="명" series={TREND_SERIES} buckets={trendBuckets(FULL_DAYS, quarter, 90)!} dense />),
    )
    expect(trendBuckets(FULL_DAYS, quarter, 90)!.map((b) => b.key)).toContain('2026-09-15')
  })

  it('AC-311.5: 신환 재방문율 — 7·14일은 formatRate % + 비율 폭 막대, 30일은 늘 "자료 없음" + "30일 기록은 아직 모으지 않아요"(막대 없음)', () => {
    draw(data(FULL_DAYS))
    const group = chart('신환 재방문율')
    // 7일: (1 + 1 + 2) ÷ (2 + 3 + 5) = 40.0% · 14일: (1 + 3) ÷ (2 + 5) = 57.1%(버림)
    const row7 = within(group).getByText('7일 안에 다시 옴').parentElement!
    hasAll(within(row7).getByText('40.0%'), 'text-subtitle font-semibold text-ink')
    const fill = row7.querySelector('[aria-hidden="true"]')!.firstElementChild as HTMLElement
    hasAll(fill, 'h-full bg-accent')
    expect(fill.style.width).toBe('40%')
    const row14 = within(group).getByText('14일 안에 다시 옴').parentElement!
    expect(within(row14).getByText('57.1%')).toBeTruthy()
    const row30 = within(group).getByText('30일 안에 다시 옴').parentElement!
    expect(within(row30).getByText('자료 없음')).toBeTruthy()
    hasAll(within(row30).getByText('30일 기록은 아직 모으지 않아요'), 'text-caption text-muted')
    expect(row30.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('AC-311.5: 신환 재방문율 — 모든 날이 null이면 "집계 중", 분모가 0이면 "–" + "자료 없음"', () => {
    draw(data([day(TODAY), day('2026-10-28', { newPatients: 0, revisit: { cohort: 0, within7: 0, within14: null } })]))
    const group = chart('신환 재방문율')
    const row7 = within(group).getByText('7일 안에 다시 옴').parentElement!
    expect(within(row7).getByText('–')).toBeTruthy()
    expect(within(row7).getByText('자료 없음')).toBeTruthy()
    const row14 = within(group).getByText('14일 안에 다시 옴').parentElement!
    expect(within(row14).getByText('집계 중')).toBeTruthy()
  })

  it('AC-311.5: 요일별 = StackedBarChart 한 계열(accent "환자 수", "명"), 처방 상위 = RankedBars("건")', () => {
    draw(data(FULL_DAYS))
    const week = chart('요일별 환자 수').querySelector('table')!.parentElement!
    expect(week.outerHTML).toBe(markupOf(<StackedBarChart title="요일별 환자 수" unit="명" series={WEEK_SERIES} buckets={weekdayBuckets(FULL_DAYS, MONTH)!} />))
    const rank = chart('처방 상위').querySelector('ol')!
    expect(rank.outerHTML).toBe(markupOf(<RankedBars title="처방 상위" unit="건" items={topRx(FULL_DAYS, MONTH)!} />))
    expect(topRx(FULL_DAYS, MONTH)!.map((item) => item.name)).toEqual(['물리치료', '견인', '주사', '도수치료'])
  })

  it('AC-311.5·AC-311.6: 기간 안 날짜 자료가 하나도 없으면 각 그래프는 빈 틀 + 가운데 "자료 없음"', () => {
    draw(data([day(TODAY, { rx: [rx('A1', '물리치료', 3)] })]))
    const section = region('기간별 흐름')
    expect(section.querySelector('table')).toBeNull()
    expect(section.querySelector('ol[aria-label]')).toBeNull()
    for (const name of ['환자 수 추이', '요일별 환자 수', '처방 상위']) {
      const note = within(chart(name)).getByText('자료 없음')
      hasAll(note, 'bg-surface text-small text-muted')
      expect(note.closest('[aria-hidden="true"]')).toBeNull()
    }
    expect(within(chart('신환 재방문율')).getAllByText('자료 없음').length).toBeGreaterThan(0)
    expect(emptyTicks()).toEqual(ticksOf(30))
  })

  it('AC-311.6: 일부만 있는 자료 — 빠진 날을 0으로 채운 막대가 없고, 있는 자료만 그린다', () => {
    const days = [day('2026-10-03', { newPatients: 1, returning: 1 }), day('2026-10-29', { newPatients: 0, returning: 3 })]
    draw(data(days))
    const rows = chart('환자 수 추이').querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    // 오늘 줄 없음 → 숫자 칸은 빈 상태, 그래프는 그린다
    expect(within(kpiCells()[0] as HTMLElement).getByText('자료 없음')).toBeTruthy()
  })
})

describe('짜임 — 폭별 칸 (AC-311.7)', () => {
  it('AC-311.7: 숫자 줄은 768px 이상 4칸 한 줄(칸 사이 1px line 세로선), 768px 미만 2칸 × 2줄(둘째 줄 위 선)', () => {
    draw(NONE)
    hasAll(kpiRow(), 'grid grid-cols-4 border-b border-line max-md:grid-cols-2')
    const [a, b, c, d] = kpiCells()
    hasAll(a!, 'min-w-0 py-4 pr-5 pl-0 max-md:py-3 max-md:pr-4')
    expect(classesOf(a!)).not.toContain('border-l')
    hasAll(b!, 'min-w-0 border-l border-line py-4 px-5 max-md:py-3 max-md:px-4')
    hasAll(c!, 'min-w-0 border-l border-line py-4 pr-5 pl-5 max-md:border-t max-md:border-l-0 max-md:py-3 max-md:pr-4 max-md:pl-0')
    hasAll(d!, 'min-w-0 border-l border-line py-4 px-5 max-md:border-t max-md:py-3 max-md:px-4')
  })

  it('AC-311.7: 그래프는 1024px 이상 8·4 / 6·6칸(오른쪽은 1px line 세로선 + 24px), 768~1023px 전체 / 반반 / 전체, 768px 미만 세로(사이 32px, 세로선 없음)', () => {
    draw(data(FULL_DAYS))
    const grid = chart('환자 수 추이').parentElement!
    hasAll(grid, 'grid gap-y-8 md:grid-cols-2 md:gap-x-6 lg:grid-cols-12')
    hasAll(chart('환자 수 추이'), 'min-w-0 md:col-span-2 lg:col-span-8')
    hasAll(chart('신환 재방문율'), 'min-w-0 lg:col-span-4 lg:border-l lg:border-line lg:pl-6')
    hasAll(chart('요일별 환자 수'), 'min-w-0 lg:col-span-6')
    hasAll(chart('처방 상위'), 'min-w-0 md:col-span-2 lg:col-span-6 lg:border-l lg:border-line lg:pl-6')
    expect(Array.from(grid.children)).toEqual([chart('환자 수 추이'), chart('신환 재방문율'), chart('요일별 환자 수'), chart('처방 상위')])
    for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수', '처방 상위']) {
      expect(classesOf(chart(name)).filter((t) => /^(?:md:|max-md:)?(?:border-l|pl-)/.test(t)), name).toEqual([])
    }
  })

  it('AC-311.7: 기간 단추는 32px(폰은 단추마다 44px, 셋이 같은 폭으로 다음 줄 전체), 눌린 것은 accent-soft 바탕 accent-strong 600', () => {
    draw(NONE)
    const group = screen.getByRole('group', { name: '기간' })
    hasAll(group, 'inline-flex overflow-clip rounded-control border border-line-strong bg-surface max-md:order-3 max-md:grid max-md:w-full max-md:grid-cols-3')
    for (const b of periodButtons()) hasAll(b, 'h-7.5 px-3 text-small max-md:h-11')
    const [b7, b30, b90] = periodButtons()
    hasAll(b30!, 'bg-accent-soft text-accent-strong font-semibold')
    for (const b of [b7!, b90!]) {
      hasAll(b, 'font-medium text-ink-2')
      expect(classesOf(b)).not.toContain('bg-accent-soft')
    }
    // 단추 사이 1px 세로선(첫 단추는 없음)
    for (const b of periodButtons()) hasAll(b, 'border-l border-line-strong first:border-l-0')
    hasAll(within(region('기간별 흐름')).getByText('10월 1일 – 10월 30일'), 'ml-auto whitespace-nowrap text-small text-muted')
  })

  it('AC-311.7: 섹션 둘은 같은 나눔(위 48 + 1px line-strong + 20, 폰 32 + 선 + 16), 머리 줄은 h2 title 600 + 사이 12 + 아래 16', () => {
    draw(NONE)
    for (const name of ['오늘 하루 분석', '기간별 흐름']) {
      const section = region(name)
      expect(section.tagName).toBe('SECTION')
      hasAll(section, 'mt-12 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4')
      const head = section.children[0]!
      hasAll(head, 'mb-4 flex flex-wrap items-center gap-3')
      hasAll(within(section).getByRole('heading', { level: 2 }), 'text-title font-semibold text-ink')
    }
  })

  it('AC-311.7: 가로로 밀리지 않는다 — 옆 밀기 감싸개가 없고 그래프 칸은 min-w-0', () => {
    const { container } = draw(data(FULL_DAYS))
    expect(allClasses(container).filter((t) => t.startsWith('overflow-x') || t.startsWith('overflow-auto'))).toEqual([])
    for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수', '처방 상위']) hasAll(chart(name), 'min-w-0')
  })
})

// 칸이 날짜 글자보다 좁으면 글자가 오른쪽으로만 넘쳐 휴대폰에서 쪽이 옆으로 밀린다(390 폭, 마지막 칸에 눈금이 올 때 30일 396px · 90일 403px).
// StackedBarChart는 여러 곳이 같이 쓰고 마크업이 시험으로 고정돼 있어 그림을 감싼 칸에서 고친다(통계 화면과 같은 방법, stats e2203ce).
// jsdom은 크기를 재지 못해 클래스만 본다. 폭은 브라우저에서 잰다
describe('AC-311.7: 휴대폰에서 환자 수 추이가 쪽을 옆으로 밀지 않는다', () => {
  // 그 날까지 13일 자료: 마지막 칸이 기간의 마지막 눈금이 된다
  const endingOn = (last: string) => Array.from({ length: 13 }, (_, i) => day(addDays(last, i - 12)))

  it.each([
    [7, '2026-10-30', '10.30'],
    [30, '2026-10-29', '10.29'],
    [90, '2026-10-25', '10.25'],
  ] as const)('AC-311.7: 최근 %i일 — 그림을 감싼 칸이 날짜 글자를 제 칸 가운데로 넘치게 하고 화면 읽기 표를 왼쪽으로 넘긴다(줄바꿈 없음). 선택자는 날짜 글자 칸과 그 표만 잡는다', async (period, last, tick) => {
    draw(data(endingOn(last)))
    if (period !== 30) await choose(`최근 ${period}일`)
    const wrapper = chart('환자 수 추이').querySelector('table')!.parentElement!.parentElement!
    expect(wrapper.parentElement).toBe(chart('환자 수 추이'))
    hasAll(wrapper, 'mt-3 relative [&_.text-center]:flex [&_.text-center]:flex-col [&_.text-center]:items-center [&_table]:right-0')
    for (const name of ['[&_table]:whitespace-normal', '[&_table]:break-all']) expect(classesOf(wrapper)).not.toContain(name)
    const labelCells = Array.from(wrapper.querySelector('.tabular-nums[aria-hidden="true"]')!.lastElementChild!.children)
    expect(labelCells.at(-1)!.textContent).toBe(tick) // 쪽을 미는 바로 그 글자
    expect(Array.from(wrapper.querySelectorAll('.text-center'))).toEqual(labelCells)
    expect(Array.from(wrapper.querySelectorAll('table')).map((table) => table.className)).toEqual(['sr-only'])
  })

  it('AC-311.7: 쪽을 밀지 않는 칸은 그대로다 — 요일별 막대와 빈 틀에는 이 클래스가 없고, 빈 틀 가운데 문구의 .text-center는 선택자에 걸리지 않는다', () => {
    const isFix = (token: string) => token.startsWith('[&_.text-center]') || token.startsWith('[&_table]')
    draw(data(FULL_DAYS))
    expect(allClasses(chart('요일별 환자 수')).filter(isFix)).toEqual([])
    cleanup()
    draw(EMPTY_RANGE)
    expect(allClasses(region('기간별 흐름')).filter(isFix)).toEqual([])
    hasAll(within(chart('환자 수 추이')).getByText('자료 없음').parentElement!, 'flex items-center justify-center text-center')
  })
})

describe('소스·모양 규칙 (AC-311.8)', () => {
  const DIR = join(process.cwd(), 'src/components/dashboard/summary')
  const appFiles = () => readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  const code = (file: string) =>
    readFileSync(join(DIR, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  const importsOf = (file: string) => [...code(file).matchAll(/^import\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!)
  const ALLOWED =
    /^(?:react|@\/components\/charts\/(?:format|KpiStat|StackedBarChart|RankedBars|ChartLegend)|@\/components\/ui\/classes|@\/components\/common\/Icon|@\/lib\/analytics\/(?:dates|compare)|@\/types\/(?:payload|analysis)|\.\/(?:source|view))$/

  it('AC-311.8: 불러오는 곳은 react · 차트 부품 · ds · Icon · dates · compare · 저장 모양 타입 · 이 폴더뿐이다(shell·briefing·notReadyFeatures·supabase·lib/auth 없음)', () => {
    const all = appFiles().flatMap((file) => importsOf(file).map((from) => `${file}: ${from}`))
    expect(all.length).toBeGreaterThan(0)
    expect(all.filter((entry) => !ALLOWED.test(entry.split(': ')[1]!))).toEqual([])
    for (const file of appFiles()) {
      const text = code(file)
      expect(text, file).not.toMatch(/components\/shell|dashboard\/briefing|notReadyFeatures|supabase|@\/lib\/auth|AppShell/)
      expect(text, file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\.cookie/)
    }
  })

  it('AC-311.8: 날짜 계산은 lib/analytics/dates.ts, 증감은 compareNumbers — 화면 파일에서 Date를 쓰지 않는다', () => {
    expect(importsOf('view.ts')).toEqual(expect.arrayContaining(['@/lib/analytics/dates', '@/lib/analytics/compare']))
    expect(code('view.ts')).toMatch(/\bcompareNumbers\(/)
    for (const file of appFiles()) expect(code(file), file).not.toMatch(/\bnew Date\b|\bDate\.(?:now|UTC|parse)\b|\.getDay\(|\.getDate\(/)
  })

  it('AC-311.8: 차트 부품은 @/components/charts/*에서 불러와 쓴다(이 폴더에 차트 부품을 다시 만들지 않는다)', () => {
    const imports = importsOf('DashboardAnalysis.tsx')
    for (const part of ['KpiStat', 'StackedBarChart', 'RankedBars', 'ChartLegend']) expect(imports).toContain(`@/components/charts/${part}`)
    expect(code('DashboardAnalysis.tsx')).toMatch(/^'use client'/)
  })

  it.each([
    ['연결 전', NONE],
    ['연결 뒤', data(FULL_DAYS)],
  ] as const)('AC-311.8: %s — 앱 틀을 다시 그리지 않고, 상자 안 상자가 없고, overflow-hidden·animate- 클래스가 없다', (_, source) => {
    const { container } = draw(source)
    expect(container.querySelector('header, nav, main')).toBeNull()
    expect(nestedBoxes(container, isBorderBox)).toEqual([])
    expect(allClasses(container)).not.toContain('overflow-hidden')
    expect(allClasses(container).filter((t) => t.includes('animate-'))).toEqual([])
  })

  it('AC-311.8: 기간 단추는 올림 바탕이 짧게(transition 150ms) 바뀌고, 눌린 단추는 transition이 없어 바로 바뀐다', async () => {
    draw(NONE)
    const check = () => {
      for (const b of periodButtons()) {
        if (b.getAttribute('aria-pressed') === 'true') expect(classesOf(b)).not.toContain('transition')
        else hasAll(b, 'transition hover:bg-canvas')
        hasAll(b, 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')
        expect(classesOf(b).filter((t) => /^(?:duration|delay|ease|transition-)/.test(t))).toEqual([])
      }
    }
    check()
    await choose('최근 7일')
    check()
  })

  it('AC-311.8: 그래프는 움직이지 않는다 — 그래프 칸 안에 transition 클래스가 없다', () => {
    draw(data(FULL_DAYS))
    for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수', '처방 상위']) {
      expect(allClasses(chart(name)).filter((t) => t.includes('transition')), name).toEqual([])
    }
  })
})

// 날짜 고르기 (bit-dashboard REQ-605, design.md '### 날짜 고르기', 시안 docs/mockups/bit-dashboard/gen.py applyDay): 고른 날은 하루 줄만 바꾼다
describe('고른 날 (day)', () => {
  const LATER = '2026-11-02' // 2026-10-31(토요일)이 지난 날이 되는 오늘
  const drawDay = (dayValue: string | undefined, source: SummarySource = data(FULL_DAYS), today = LATER) =>
    render(<DashboardAnalysis today={today} day={dayValue} source={source} />)
  const cellsOf = (title: string) => Array.from(region(title).children[1]!.children)

  it('AC-605.3: 지난 날짜를 고르면 제목은 "{월}월 {일}일 하루 분석", 첫 칸 이름은 "환자 수"이고 그날 숫자다', () => {
    drawDay('2026-10-31')
    expect(screen.getByRole('heading', { level: 2, name: '10월 31일 하루 분석' })).toBeTruthy()
    const cells = cellsOf('10월 31일 하루 분석')
    expect(cells.slice(0, 3).map((cell) => cell.textContent)).toEqual(['환자 수13명', '신환4명', '재진9명'])
  })

  it('AC-605.3: 넷째 칸은 그날과 7일 전을 견준 값이다', () => {
    drawDay('2026-10-31')
    const fourth = cellsOf('10월 31일 하루 분석')[3]!
    expect(fourth.textContent).toContain('지난주 같은 요일보다')
    expect(fourth.textContent).toContain('3명 (+30.0%)')
    expect(fourth.textContent).toContain('지난주 토요일')
    hasAll(within(fourth as HTMLElement).getByText('3명 (+30.0%)').parentElement!, DELTA_VALUE)
  })

  it('AC-605.3: 7일 전 자료가 없으면 넷째 칸은 "지난주 자료가 없어요"다', () => {
    drawDay('2026-10-30')
    const fourth = cellsOf('10월 30일 하루 분석')[3]!
    expect(within(fourth as HTMLElement).getByText('지난주 자료가 없어요')).toBeTruthy()
  })

  it('AC-605.3: 지난 날짜의 하루 줄에는 "오늘" 글자가 없다(저장 숫자에 덜 끝난 표시가 남은 날도)', () => {
    drawDay('2026-10-12') // partial
    const section = region('10월 12일 하루 분석')
    expect(section.textContent).not.toContain('오늘')
    const fourth = cellsOf('10월 12일 하루 분석')[3]!
    expect(within(fourth as HTMLElement).getByText('자료 없음')).toBeTruthy()
  })

  it('AC-605.4: 자료가 없는 지난 날짜면 숫자 칸 넷이 모두 "–" + "자료 없음"이고 첫 칸 이름은 "환자 수"다', () => {
    drawDay('2026-10-29')
    const section = region('10월 29일 하루 분석')
    const cells = cellsOf('10월 29일 하루 분석')
    expect(cells).toHaveLength(4)
    expect(cells.map((cell) => cell.textContent)).toEqual(['환자 수–자료 없음', '신환–자료 없음', '재진–자료 없음', '지난주 같은 요일보다–자료 없음'])
    expect(section.textContent).not.toContain('오늘')
    // 읽기는 끝났으니 칩은 없다
    expect(within(section).queryByText('비트 PC 연결 전')).toBeNull()
  })

  it('AC-605.4: 읽었는데 빈 배열인 화면에서 지난 날짜를 골라도 제목·첫 칸 이름은 그 날이고 숫자 칸은 받은 글자다', () => {
    render(<DashboardAnalysis today={LATER} day="2026-10-29" source={data([])} emptyChip="자료 없음" emptyText="자료 없음" emptyNote={null} emptyCharts />)
    expect(cellsOf('10월 29일 하루 분석').map((cell) => cell.textContent)).toEqual(['환자 수–자료 없음', '신환–자료 없음', '재진–자료 없음', '지난주 같은 요일보다–자료 없음'])
  })

  it('AC-605.3: day가 없거나 오늘이면 지금처럼 오늘이다', () => {
    const none = drawDay(undefined, data(FULL_DAYS), TODAY)
    expect(region('오늘 하루 분석').children[1]!.children[0]!.textContent).toBe('오늘 환자 수13명')
    const text = document.body.textContent
    none.unmount()
    drawDay(TODAY, data(FULL_DAYS), TODAY)
    expect(document.body.textContent).toBe(text)
  })

  it('AC-605.3: 오늘 칸의 "오늘 진료가 끝나면 비교해요"는 그대로다', () => {
    drawDay(LATER, data([day(LATER, { partial: true })]))
    expect(within(region('오늘 하루 분석')).getByText('오늘 진료가 끝나면 비교해요')).toBeTruthy()
  })

  it('AC-605.6: 기간별 흐름은 today로만 계산해 고른 날과 상관없다', () => {
    const today = drawDay(undefined)
    const flowText = region('기간별 흐름').textContent
    const range = rangeText()
    today.unmount()
    drawDay('2026-10-12')
    expect(rangeText()).toBe(range)
    expect(region('기간별 흐름').textContent).toBe(flowText)
  })

  it('AC-605.6: 날짜가 바뀌어도 고른 기간은 그대로다', async () => {
    const view = drawDay(undefined)
    await choose('최근 7일')
    view.rerender(<DashboardAnalysis today={LATER} day="2026-10-12" source={data(FULL_DAYS)} />)
    expect(pressed()).toEqual(['최근 7일'])
  })
})
