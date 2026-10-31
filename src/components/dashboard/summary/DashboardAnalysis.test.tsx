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
import { isBorderBox, nestedBoxes } from '@/testing/boxes'
import type { DayPayload, RevisitPayload } from '@/types/payload'
import { DashboardAnalysis } from './DashboardAnalysis'
import type { SummarySource } from './source'
import { periodRange, tickLabels, topRx, trendBuckets, weekdayBuckets, type Period } from './view'

// 오늘 하루 분석 · 기간별 흐름 (tab-frame REQ-311, design.md '오늘 하루 분석 · 기간별 흐름 · 보고 문장', 시안 docs/mockups/dashboard-home/ + 메모 §3·§4).
// jsdom은 CSS를 계산하지 않는다 → 정해 둔 클래스·글자·짜임을 본다. 차트 부품은 같은 props로 따로 그린 마크업과 견준다.
// 가짜 DayPayload는 이 시험 파일 안에서만 만든다(AC-312.3)

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
  ] as const)('AC-311.1: 연결 전(%s) — h2 + "비트 PC 연결 전" 칩, 네 칸 이 순서, 모두 "–" + "연결하면 보여요"', (_, source) => {
    draw(source)
    const section = region('오늘 하루 분석')
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('오늘 하루 분석')
    const chip = within(section).getByText('비트 PC 연결 전')
    hasAll(chip, ds.chip.neutral)
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

  it('AC-311.1: 줄 아래 한 줄(caption muted)이 있고, 원장님 보고 문장 빈 줄은 이 섹션에 없다', () => {
    draw(NONE)
    const section = region('오늘 하루 분석')
    const note = within(section).getByText('연결하면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요.')
    hasAll(note, 'mt-3 text-caption text-muted')
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
    hasAll(value, 'text-metric font-semibold text-positive')
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
    hasAll(down, 'text-negative')
    expect(within(down).getByText('줄어듦')).toBeTruthy()
    expect(down.querySelector('svg')).not.toBeNull()
    cleanup()
    draw(data([day(TODAY, { newPatients: 2, returning: 8 }), day('2026-10-24', { newPatients: 2, returning: 8 })]))
    const flat = within(kpiCells()[3] as HTMLElement).getByText('변화 없음').parentElement!
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

  it('AC-311.3: 연결 전에도 단추가 눌리고 기간 글자와 환자 수 추이 빈 틀의 날짜 눈금이 바뀐다', async () => {
    draw(NONE)
    expect(emptyTicks()).toEqual(ticksOf(30))
    await choose('최근 90일')
    expect(pressed()).toEqual(['최근 90일'])
    expect(rangeText()).toBe('8월 2일 – 10월 30일')
    expect(emptyTicks()).toEqual(ticksOf(90))
    await choose('최근 7일')
    expect(pressed()).toEqual(['최근 7일'])
    expect(rangeText()).toBe('10월 24일 – 10월 30일')
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

describe('기간별 흐름 — 연결 전 빈 틀', () => {
  it('AC-311.4: 그래프 넷의 제목(h3)·설명이 이 차례다', () => {
    draw(NONE)
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

  it('AC-311.4: 차트 부품(StackedBarChart·RankedBars)을 그리지 않는다 — 화면 읽기 표·순위 목록·세로 눈금 숫자가 없다', () => {
    draw(NONE)
    const section = region('기간별 흐름')
    expect(section.querySelector('table')).toBeNull()
    expect(section.querySelector('ol[aria-label]')).toBeNull()
    expect(within(section).queryByText('(명)')).toBeNull()
    expect(section.querySelector('[style]')).toBeNull()
  })

  it('AC-311.4: 환자 수 추이 — 범례(ChartLegend 신환 accent · 재진 chart-3), 가로선 다섯(마지막 line-strong, aria-hidden), 가운데 문구, 날짜 눈금', () => {
    draw(NONE)
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
    const message = within(group).getByText('비트 PC를 연결하면 이 기간의 하루하루가 막대로 그려집니다')
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
    draw(NONE)
    const ticks = tickRow()
    hasAll(ticks, 'flex justify-between text-caption text-muted')
    await choose('최근 90일')
    expect(emptyTicks()).toEqual(['8.2', '8.23', '9.13', '10.4', '10.25'])
  })

  it('AC-311.4: 신환 재방문율 — 줄 셋(7·14·30일 안에 다시 옴), 값 "–"(faint), 빈 막대 칸(canvas + 1px line, aria-hidden)', () => {
    draw(NONE)
    const group = chart('신환 재방문율')
    const names = ['7일 안에 다시 옴', '14일 안에 다시 옴', '30일 안에 다시 옴']
    for (const name of names) {
      const row = within(group).getByText(name).parentElement!
      hasAll(row, 'border-t border-line py-3')
      hasAll(within(row).getByText('–'), 'text-faint')
      const bar = row.querySelector('[aria-hidden="true"]')!
      hasAll(bar, 'h-2 border border-line bg-canvas')
      expect(bar.children).toHaveLength(0)
    }
  })

  it('AC-311.4: 요일별 환자 수 — 빈 막대 칸 7개와 "월 화 수 목 금 토 일"(aria-hidden, 150px · 폰 110px)', () => {
    draw(NONE)
    const frame = chart('요일별 환자 수').querySelector('[aria-hidden="true"]')!
    hasAll(frame, 'grid grid-cols-7 h-37.5 max-md:h-27.5')
    expect(frame.children).toHaveLength(7)
    expect(Array.from(frame.children).map((c) => c.textContent)).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    for (const col of Array.from(frame.children)) hasAll(col.children[0]!, 'border border-line bg-canvas border-b-line-strong')
  })

  it('AC-311.4: 처방 상위 — 빈 줄 다섯(번호 · 빈 칸 · "–", aria-hidden, 36px)', () => {
    draw(NONE)
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

  it.each([7, 30, 90] as const)('AC-311.4: 연결 전 화면 글자에서 고정 글자(기간 %i일의 날짜 눈금 포함)를 빼면 숫자가 없다', async (period) => {
    const { container } = draw(NONE)
    if (period !== 30) await choose(`최근 ${period}일`)
    const range = periodRange(TODAY, period)
    const fixed = [
      range.label,
      '최근 7일',
      '최근 30일',
      '최근 90일',
      '7일 안에 다시 옴',
      '14일 안에 다시 옴',
      '30일 안에 다시 옴',
      '많이 낸 처방 5가지가 차례로 적힙니다',
      // 번호 줄(1~5)과 날짜 눈금은 덩어리째 뺀다
      chart('처방 상위').querySelector('ol')!.textContent!,
      tickRow().textContent!,
    ].sort((a, b) => b.length - a.length)
    expect(emptyTicks()).toEqual(ticksOf(period))
    let text = container.textContent ?? ''
    for (const s of fixed) text = text.split(s).join(' ')
    expect(text).not.toMatch(/\d/)
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
    draw(NONE)
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

  it('AC-311.7: 기간 단추는 32px(폰 44px, 셋이 같은 폭으로 다음 줄 전체), 눌린 것은 accent-soft 바탕 accent-strong 600', () => {
    draw(NONE)
    const group = screen.getByRole('group', { name: '기간' })
    hasAll(group, 'inline-flex overflow-clip rounded-control border border-line-strong bg-surface max-md:order-3 max-md:grid max-md:w-full max-md:grid-cols-3')
    for (const b of periodButtons()) hasAll(b, 'h-7.5 px-3 text-small max-md:h-10.5')
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
