// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { eachDay, monthRange } from '@/lib/analytics/dates'
import { nestedBoxes } from '@/testing/boxes'
import type { RevenueDayRow } from '@/types/revenue'
import { MonthBars, StackBars } from './MonthBars'
import { RevenuePerVisit } from './RevenuePerVisit'
import { RevenueSplit } from './RevenueSplit'
import {
  BusyNotice,
  ConnectNeeded,
  EmptyMonthBlock,
  FailedBanner,
  Fetching,
  PeriodRow,
  RevenueError,
  SafeLine,
  SaveFailedCard,
  SavedNotice,
  TitleRow,
  UpgradeNeeded,
} from './RevenueStates'
import { RevenueTreatments } from './RevenueTreatments'
import { RevenueTrend } from './RevenueTrend'
import { TreatmentBars } from './TreatmentBars'
import { buildRevenueView, type RevenueBlocks, type RevenueView, type RevenueViewInput } from './view'

// 매출 화면 부품 (TASK-9, REQ-009 · AC-009.1·AC-009.5). 보기 모양은 진짜 buildRevenueView로 만든다. 자료는 모두 가짜 숫자다

const TODAY = '2026-11-01'
const MONTHS = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const FOLDER = 'src/components/revenue'

// scale배 하루(10월은 2배라 늘어남, 작년 같은 달은 3배라 줄어듦)
function day(date: string, scale = 1, over: Partial<RevenueDayRow> = {}): RevenueDayRow {
  return {
    date,
    visits: 10,
    newPatients: 2,
    returnVisits: 8,
    total: 1_000_000 * scale,
    insurer: 600_000 * scale,
    noncovered: 250_000 * scale,
    copay: 100_000 * scale,
    otherTotal: 50_000 * scale,
    cash: 200_000 * scale,
    card: 700_000 * scale,
    transfer: 100_000 * scale,
    receivableIn: 0,
    unconfirmed: false,
    splitUnconfirmed: false,
    ...over,
  }
}
const scaleOf = (month: string) => (month === '2026-10' ? 2 : month === '2025-10' ? 3 : 1)
const ROWS = MONTHS.flatMap((month) => eachDay(monthRange(month)).map((date) => day(date, scaleOf(month))))
const NO_SPLIT = { insurer: null, noncovered: null, copay: null, otherTotal: null, splitUnconfirmed: true }

const input = (over: Partial<RevenueViewInput> = {}): RevenueViewInput => ({
  days: ROWS,
  codes: [
    { month: '2026-10', code: 'MANUAL1', name: '가짜 처방', count: 40, amount: 4_000_000 },
    { month: '2026-10', code: 'ETC1', name: '가짜 진찰', count: 90, amount: 9_000_000 },
  ],
  groups: [{ id: 'g1', name: '가짜 묶음', codes: ['MANUAL1'], sortOrder: 0 }],
  fetchedAt: '2026-10-31T22:10:00Z',
  month: '2026-10',
  today: TODAY,
  bridge: 'ready',
  sync: { state: 'idle' },
  ...over,
})
function stateOf<S extends RevenueView['state']>(state: S, over: Partial<RevenueViewInput> = {}) {
  const view = buildRevenueView(input(over))
  if (view.state !== state) throw new Error(view.state)
  return view as Extract<RevenueView, { state: S }>
}
const blocks = (over: Partial<RevenueViewInput> = {}): RevenueBlocks => stateOf('ready', over).blocks
const draw = (node: ReactNode) => render(node).container

const tokensOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const classesOf = (el: Element | null) => (el ? tokensOf(el) : [])
const heights = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>('[style*="height"]'))

afterEach(cleanup)

describe('AC-009.1 네 덩어리는 시안 글자 그대로다', () => {
  it('AC-009.1 매출 추이: 제목·설명·칸 넷·차트 제목·범례', () => {
    draw(<RevenueTrend view={blocks().trend} />)
    expect(screen.getByRole('heading', { level: 2, name: '매출 추이' })).toBeTruthy()
    expect(screen.getByText('매출 = 총진료비 · 지난달 · 작년 같은 때와 견줘요')).toBeTruthy()
    for (const name of ['10월 매출', '9월보다', '작년 10월보다', '확인 필요한 날']) expect(screen.getByText(name)).toBeTruthy()
    expect(screen.getByText('6,200만 원')).toBeTruthy()
    expect(screen.getByText('하루 평균 200만 원')).toBeTruthy()
    expect(screen.getByText('없음')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: '달마다 매출 · 최근 13달' })).toBeTruthy()
    for (const name of ['고른 달', '작년 같은 달', '다른 달']) expect(screen.getByText(name)).toBeTruthy()
  })

  it('AC-009.1 확인 필요한 날: 수와 날짜, 그날 금액이 합계에 없다는 글', () => {
    const days = ROWS.map((row) => (row.date === '2026-10-14' ? { ...day(row.date), ...{ total: null, insurer: null, noncovered: null, copay: null, otherTotal: null, cash: null, card: null, transfer: null, receivableIn: null, unconfirmed: true } } : row))
    draw(<RevenueTrend view={blocks({ days }).trend} />)
    expect(screen.getByText('1일')).toBeTruthy()
    expect(screen.getByText('10월 14일. 그날 금액은 합계에 넣지 않았어요')).toBeTruthy()
  })

  it('AC-009.1 급여·비급여·기타: 표 머리·줄 여섯·안내 글, 합계 줄 이름은 합계 · 매출', () => {
    draw(<RevenueSplit view={blocks().split} />)
    expect(screen.getByRole('heading', { level: 2, name: '급여·비급여·기타' })).toBeTruthy()
    expect(screen.getByText('10월 비급여 몫 25.0% · 기타 몫 5.0%')).toBeTruthy()
    const table = screen.getAllByRole('table')[0]!
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['나눔', '10월', '몫', '9월보다'])
    expect(within(table).getAllByRole('row').slice(1).map((tr) => tr.children[0]!.textContent)).toEqual(['급여', '공단부담', '본인부담', '비급여', '기타', '합계 · 매출'])
    expect(screen.getByText(/셋을 더하면 매출이에요\./)).toBeTruthy()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('AC-009.1·AC-008.6 나눔을 못 한 날이 있으면 머리 아래 안내와 합계 줄 이름 합계, 지난달보다는 "–"이고 맞춰 고치지 않는다', () => {
    const days = ROWS.map((row) => (row.date === '2026-10-05' ? day(row.date, 2, NO_SPLIT) : row))
    const { container } = render(<RevenueSplit view={blocks({ days }).split} />)
    expect(screen.getByRole('note').textContent).toBe('1일(10월 5일)은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.')
    const table = screen.getAllByRole('table')[0]!
    const rows = within(table).getAllByRole('row')
    const sum = rows.at(-1)!
    expect(sum.children[0]!.textContent).toBe('합계')
    expect(sum.children[1]!.textContent).toBe('6,000만 원')
    expect(sum.children[3]!.textContent).toBe('–')
    expect(screen.getByText(/셋을 더해도 매출보다 작아요/)).toBeTruthy()
    // 머리 → 안내 → 표 차례
    const text = container.textContent ?? ''
    expect(text.indexOf('10월 비급여 몫')).toBeLessThan(text.indexOf('나눔을 못 해서'))
    expect(text.indexOf('나눔을 못 해서')).toBeLessThan(text.indexOf('공단부담'))
  })

  it('AC-009.1·AC-008.6 고른 달 나눔이 모두 없으면 표는 "–"이고 쌓은 막대 그림 전체가 없다', () => {
    const days = ROWS.map((row) => (row.date.startsWith('2026-10') ? day(row.date, 2, NO_SPLIT) : row))
    const { container } = render(<RevenueSplit view={blocks({ days }).split} />)
    expect(screen.getAllByText('자료 없음').length).toBeGreaterThan(0)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('AC-009.1 치료별 매출: 금액·몫·건수, 그 밖 처방은 맨 뒤 line-strong 막대, 안내 글', () => {
    const { container } = render(<RevenueTreatments view={blocks().treatments} onRetry={() => {}} retrying={false} />)
    expect(screen.getByRole('heading', { level: 2, name: '치료별 매출' })).toBeTruthy()
    expect(screen.getByText('10월 · 처방한 날 기준 · 내가 만든 묶음')).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent?.includes('가짜 묶음'))).toEqual([true, false])
    expect(items[0]!.textContent).toContain('400만 원')
    expect(items[0]!.textContent).toContain('30.7%')
    expect(items[0]!.textContent).toContain('40건')
    expect(items[1]!.textContent).toContain('그 밖 처방')
    expect(items[1]!.textContent).toContain('진찰료·약·검사 등')
    expect(container.querySelector('.bg-line-strong')?.closest('li')).toBe(items[1])
    expect(screen.getByText(/처방 금액\(단가 × 수량 × 일수\)으로 세요/)).toBeTruthy()
  })

  it('AC-009.1 치료별 매출: 저장된 묶음이 없으면 제안 표시, 코드가 없으면 "자료 없음"', () => {
    draw(<RevenueTreatments view={blocks({ groups: [], codes: [] }).treatments} onRetry={() => {}} retrying={false} />)
    expect(screen.getByText('제안 묶음 · 아직 저장 안 함')).toBeTruthy()
    expect(screen.getByText('자료 없음')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('AC-009.1 치료별 매출: 묶음을 읽지 못하면 안내·[다시 불러오기]·오류 번호, 다시 불러오는 동안은 aria-busy', () => {
    const onRetry = vi.fn()
    const view = blocks({ groups: 'load-failed' }).treatments
    const { rerender } = render(<RevenueTreatments view={view} onRetry={onRetry} retrying={false} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('치료 묶음을 불러오지 못했어요.')
    expect(alert.textContent).toContain('묶음 없이 제안으로 바꿔 보이지 않아요.')
    within(alert).getByRole('button', { name: '다시 불러오기' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.getByText('오류 번호 E-REVENUE-GROUP-LOAD-FAILED')).toBeTruthy()

    rerender(<RevenueTreatments view={view} onRetry={onRetry} retrying />)
    expect(screen.getByRole('button', { name: '다시 불러오기' }).getAttribute('aria-busy')).toBe('true')
  })

  it('AC-009.1 건당 진료비: 칸 넷·차트 제목·안내 글, 접수 건수를 확인하지 못한 날이 없으면 안내 줄이 없다', () => {
    draw(<RevenuePerVisit view={blocks().perVisit} />)
    expect(screen.getByRole('heading', { level: 2, name: '건당 진료비' })).toBeTruthy()
    expect(screen.getByText('접수 한 건 기준 · 접수취소는 세지 않아요')).toBeTruthy()
    for (const name of ['10월 건당 진료비', '9월보다', '작년 10월보다', '10월 접수 건수']) expect(screen.getByText(name)).toBeTruthy()
    expect(within(screen.getByText('10월 건당 진료비').parentElement!).getByText('200,000원')).toBeTruthy()
    expect(screen.getByText('매출 ÷ 접수 310건')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: '달마다 건당 진료비 · 최근 13달' })).toBeTruthy()
    expect(screen.getByText(/같은 분이 한 달에 다섯 번 오면 다섯 건으로 세요/)).toBeTruthy()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('AC-009.1·AC-008.7 접수 건수를 확인하지 못한 날이 있으면 건당 진료비 덩어리에 안내 글자가 있다', () => {
    const days = ROWS.map((row) => (row.date === '2026-10-14' ? { ...row, visits: null } : row))
    draw(<RevenuePerVisit view={blocks({ days }).perVisit} />)
    expect(screen.getByRole('note').textContent).toBe('1일(10월 14일)은 접수 건수를 확인하지 못해 건당 진료비에서 빠졌어요. 매출 합계에는 들어 있어요.')
  })
})

describe('AC-009.1 제목 줄·달 고르기·상태 부품', () => {
  it('AC-009.1 제목 줄: 시각과 단추, 단추가 없는 보기면 그리지 않는다', () => {
    const onRefresh = vi.fn()
    const { rerender } = render(<TitleRow header={{ title: '매출', meta: '11월 1일 07:10에 비트에서 가져왔어요', refresh: '다시 가져오기' }} onRefresh={onRefresh} />)
    expect(screen.getByRole('heading', { level: 1, name: '매출' })).toBeTruthy()
    screen.getByRole('button', { name: '다시 가져오기' }).click()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    rerender(<TitleRow header={{ title: '매출', meta: null, refresh: null }} onRefresh={onRefresh} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('AC-009.1 달 고르기: 지난달·다음 달 이름, 끝이면 막힌다', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    render(<PeriodRow period={{ label: '2026년 10월', note: '10월 1일 – 31일 · 수납한 날 기준' }} canPrevious canNext={false} onPrevious={onPrevious} onNext={onNext} />)
    screen.getByRole('button', { name: '지난달' }).click()
    expect(onPrevious).toHaveBeenCalledTimes(1)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '다음 달' }).disabled).toBe(true)
    expect(screen.getByText('2026년 10월')).toBeTruthy()
    expect(screen.getByText('10월 1일 – 31일 · 수납한 날 기준')).toBeTruthy()
  })

  it('AC-3503.1 달 고르기: bound가 있으면 기간 글 바로 옆에 text-small text-muted로 그 글이 있다', () => {
    const bound = '· 예시 2020년 1월부터 넘겨 볼 수 있어요'
    render(<PeriodRow period={{ label: '2026년 11월', note: '11월 1일 – 9일 · 수납한 날 기준' }} bound={bound} canPrevious canNext={false} onPrevious={() => {}} onNext={() => {}} />)
    const line = screen.getByText(bound)
    expect(classesOf(line)).toEqual(expect.arrayContaining(['text-small', 'text-muted']))
    expect(line.previousElementSibling?.textContent).toBe('11월 1일 – 9일 · 수납한 날 기준')
  })

  it('AC-3503.1 달 고르기: bound가 없으면 지금 그대로(달 상자와 기간 글 둘뿐)', () => {
    const { container } = render(<PeriodRow period={{ label: '2026년 11월', note: '11월 1일 – 9일 · 수납한 날 기준' }} canPrevious canNext onPrevious={() => {}} onNext={() => {}} />)
    const row = container.firstElementChild!
    expect(row.children).toHaveLength(2)
    expect(row.lastElementChild?.textContent).toBe('11월 1일 – 9일 · 수납한 날 기준')
    expect(screen.queryByText(/넘겨 볼 수 있어요/)).toBeNull()
  })

  it('AC-009.5 가져오는 중: 정적인 진행 막대(폭 %), 몇 달인지 모르면 숫자를 지어내지 않는다', () => {
    const { container, rerender } = render(<Fetching view={stateOf('fetching', { sync: { state: 'running', done: 4, total: 13, month: '2026-02' } })} />)
    expect(screen.getByRole('status').textContent).toContain('13달 가운데 4달을 가져왔어요')
    expect(screen.getByText('2026년 2월 읽는 중')).toBeTruthy()
    expect(container.querySelector<HTMLElement>('[aria-hidden="true"] [style*="width"]')?.style.width).toBe('30.76%')
    rerender(<Fetching view={stateOf('fetching', { sync: { state: 'running' } })} />)
    expect(container.querySelector('[style*="width"]')).toBeNull()
    expect(screen.queryByText(/달 가운데/)).toBeNull()
  })

  it('AC-009.4 가져오지 못한 달 알림 줄: 수·달 목록·[다시 가져오기]', () => {
    const failed = stateOf('ready', {
      sync: {
        state: 'idle',
        failed: [
          { month: '2025-12', code: 'E-BIT-READ-FAILED' },
          { month: '2025-11', code: 'E-BIT-READ-FAILED' },
        ],
      },
    }).failed!
    const onRetry = vi.fn()
    render(<FailedBanner failed={failed} onRetry={onRetry} />)
    const banner = screen.getByRole('status')
    expect(banner.textContent).toContain('2달을 가져오지 못했어요.')
    expect(banner.textContent).toContain('2025년 11월·12월')
    expect(banner.textContent).toContain('나머지 달은 그대로 볼 수 있어요.')
    within(banner).getByRole('button', { name: '다시 가져오기' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-009.4 저장 실패 카드: 문구는 lib/errors.ts, 단추는 카드 밖 [다시 저장]', () => {
    const onRetry = vi.fn()
    render(<SaveFailedCard onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toContain('매출 숫자를 저장하지 못했어요')
    expect(within(screen.getByRole('alert')).queryByRole('button')).toBeNull()
    screen.getByRole('button', { name: '다시 저장' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-009.4 오류 화면: 알려진 번호는 오류 카드 + [다시 확인], E-PAGE-FAILED는 글이 말하는 [다시 시도], 모르는 번호는 번호만', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<RevenueError view={stateOf('error', { sync: { state: 'error', code: 'E-BRIDGE-DISCONNECTED' } })} onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toContain('도우미와 연결이 끊겼어요')
    screen.getByRole('button', { name: '다시 확인' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<RevenueError view={stateOf('error', { sync: { state: 'error', code: 'E-PAGE-FAILED' } })} onRetry={onRetry} />)
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
    rerender(<RevenueError view={stateOf('error', { sync: { state: 'error', code: 'E-NEW-ONE' } })} onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toBe('오류 번호 E-NEW-ONE')
  })

  it('AC-009.3·AC-009.4 다른 창이 통로를 쓰는 중: 문구는 lib/errors.ts, 단추는 카드 밖 [다시 확인]이고 폰에서도 보인다', () => {
    const onRetry = vi.fn()
    render(<BusyNotice onRetry={onRetry} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('오류 번호 E-BRIDGE-BUSY')
    expect(within(alert).queryByRole('button')).toBeNull()
    expect(classesOf(alert.parentElement)).not.toContain('max-md:hidden')
    screen.getByRole('button', { name: '다시 확인' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-009.3 연결 안 된 PC 알림 줄은 폰에서 숨고(시안 폰에 없다) 비트 PC 연결로 간다', () => {
    const { notice } = stateOf('saved-only', { bridge: 'none' })
    render(<SavedNotice notice={notice} />)
    const line = screen.getByRole('note')
    expect(classesOf(line)).toContain('max-md:hidden')
    expect(line.textContent).toContain('이 PC는 비트와 연결되어 있지 않아요.')
    expect(line.textContent).toContain('의원 PC에서 11월 1일 07:10에 가져온 숫자를 보여 드려요.')
    expect(within(line).getByRole('link', { name: '비트 PC 연결' }).getAttribute('href')).toBe('/claim/setup')
  })

  it('AC-009.3 비트 PC 연결 필요: 생기는 것 목록은 브라우저 번호 없이 번호 상자만 보인다(list-none, 앱에 기본 초기화가 없다)', () => {
    const { container } = render(<ConnectNeeded view={stateOf('connect-needed', { bridge: 'none', days: [] })} />)
    const list = container.querySelector('ol')
    expect(list).not.toBeNull()
    expect(classesOf(list)).toContain('list-none')
  })
})

describe('AC-009.5 그래프는 HTML 막대 + aria-hidden + 화면 읽기 표', () => {
  const trendChart = () => blocks().trend.chart!
  const stackChart = () => blocks().split.chart!

  it('AC-009.5 막대는 % height inline style이고 그림은 aria-hidden, 숫자는 sr-only 표로도 있다', () => {
    const { container } = render(<MonthBars chart={trendChart()} size="tall" />)
    const figure = container.querySelector('[aria-hidden="true"]')!
    expect(figure.querySelector('svg')).toBeNull()
    const bars = heights(figure)
    expect(bars).toHaveLength(13)
    for (const bar of bars) expect(bar.style.height).toMatch(/^\d+(\.\d+)?%$/)
    expect(figure.textContent).toContain('(만 원)')

    const table = container.querySelector('table')!
    expect(classesOf(table)).toContain('sr-only')
    expect(table.closest('[aria-hidden="true"]')).toBeNull()
    expect(table.querySelector('caption')?.textContent).toBe('달마다 매출 (원)')
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['달', '매출'])
    expect(Array.from(table.querySelectorAll('tbody tr')).at(-1)?.textContent).toBe('2026-1062,000,000원')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(13)
  })

  it('AC-009.5 고른 달 accent · 작년 같은 달 faint · 다른 달 chart-2, 가로 눈금선만', () => {
    const { container } = render(<MonthBars chart={trendChart()} size="tall" />)
    const figure = container.querySelector('[aria-hidden="true"]')!
    const bars = heights(figure)
    expect(classesOf(bars[12]!)).toContain('bg-accent')
    expect(classesOf(bars[0]!)).toContain('bg-faint')
    expect(classesOf(bars[5]!)).toContain('bg-chart-2')
    expect(figure.querySelectorAll('[style*="bottom"].h-px').length).toBe(trendChart().axis.ticks.length)
    expect(figure.querySelector('.w-px')).toBeNull()
  })

  it('AC-009.5 자료 없는 달은 막대를 그리지 않는다(0으로 채우지 않는다)', () => {
    const days = ROWS.filter((row) => !row.date.startsWith('2026-03'))
    const { container } = render(<MonthBars chart={blocks({ days }).trend.chart!} size="tall" />)
    expect(heights(container.querySelector('[aria-hidden="true"]')!)).toHaveLength(12)
  })

  it('AC-009.5 쌓은 막대: 아래부터 급여 chart-3 · 비급여 accent · 기타 line-strong, % height, 범례·표', () => {
    const { container } = render(<StackBars chart={stackChart()} />)
    const figure = container.querySelector('[aria-hidden="true"]')!
    const bars = heights(figure)
    expect(bars).toHaveLength(39)
    const top = bars.slice(36).map((bar) => classesOf(bar).find((c) => c.startsWith('bg-')))
    expect(top).toEqual(['bg-line-strong', 'bg-accent', 'bg-chart-3'])
    for (const name of ['기타', '비급여', '급여']) expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    const table = container.querySelector('table.sr-only')!
    expect(table.querySelector('caption')?.textContent).toBe('달마다 급여·비급여·기타 (원)')
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['달', '급여', '비급여', '기타'])
  })

  it('AC-009.5 증감은 화살표와 글자를 같이 쓴다: "늘어남"·"줄어듦"은 화면 읽기로, 화살표는 aria-hidden svg', () => {
    draw(<RevenueTrend view={blocks().trend} />)
    const up = screen.getByText('늘어남')
    const down = screen.getByText('줄어듦')
    for (const [word, tone, text] of [
      [up, 'text-positive', /^\+/],
      [down, 'text-negative', /^−/],
    ] as const) {
      expect(classesOf(word)).toContain('sr-only')
      const line = word.closest('p')!
      expect(classesOf(line)).toContain(tone)
      expect(line.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
      expect(line.textContent).toMatch(text)
    }
  })

  it('AC-009.5 표의 증감도 화살표와 글자를 같이 쓴다', () => {
    const { container } = render(<RevenueSplit view={blocks().split} />)
    const words = within(container.querySelector('table')!).getAllByText('늘어남')
    expect(words.length).toBeGreaterThan(0)
    for (const word of words) {
      expect(classesOf(word)).toContain('sr-only')
      expect(word.parentElement?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('AC-009.5 순위 막대: 폭 % inline style, 막대는 aria-hidden, 글자는 밖에 있다', () => {
    const { container } = render(<TreatmentBars rows={[{ name: '가짜 묶음', amount: '400만 원', share: '30.7%', detail: '40건', width: 100, rest: false, missing: false }]} />)
    const bar = container.querySelector<HTMLElement>('[style*="width"]')!
    expect(bar.style.width).toBe('100%')
    expect(bar.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByText('400만 원').closest('[aria-hidden="true"]')).toBeNull()
    expect(classesOf(bar)).toContain('bg-accent')
  })
})

describe('AC-009.5 폰(768px 미만)·PC 배치 클래스', () => {
  it('AC-009.5 폰: 막대 날짜 글자는 하나 걸러 숨기되 고른 달은 늘 보이고, 값 글자는 고른 달만 남는다', () => {
    const { container } = render(<MonthBars chart={blocks({ month: '2026-09' }).trend.chart!} size="tall" />)
    const figure = container.querySelector('[aria-hidden="true"]')!
    const label = (text: string) => Array.from(figure.querySelectorAll('p')).find((p) => p.textContent === text)!
    expect(classesOf(label('11월'))).toContain('max-md:invisible') // 2025-11 = 둘째 칸
    expect(classesOf(label('12월'))).not.toContain('max-md:invisible') // 2025-12 = 셋째 칸
    expect(classesOf(label('9월'))).not.toContain('max-md:invisible') // 2026-09 = 고른 달, 열두째 칸
    expect(classesOf(label('9월'))).toContain('font-semibold')

    const values = Array.from(figure.querySelectorAll('[style*="height"] span'))
    expect(values).toHaveLength(13)
    expect(values.filter((value) => !classesOf(value).includes('max-md:hidden'))).toHaveLength(1)
  })

  describe('AC-009.5 폰: 고른 달 글자가 옆 달 글자와 겹치지 않는다', () => {
    // 달 글자를 칸 차례대로 모은다. '10월'이 두 번 나와서 글자가 아니라 칸 번호로 본다(0 = 2025-10 … 12 = 2026-10)
    const monthLabels = (root: Element) => Array.from(root.querySelectorAll('[aria-hidden="true"] p')).filter((p) => /^\d+월$/.test(p.textContent ?? ''))
    const hiddenSlots = (root: Element) => monthLabels(root).flatMap((label, slot) => (classesOf(label).includes('max-md:invisible') ? [slot] : []))
    const ODD_SLOTS = [1, 3, 5, 7, 9, 11]

    it('AC-009.5 고른 달이 숨는 자리(열두째 칸, 2026-09)면 바로 앞뒤 칸을 숨기고 고른 달은 보인다', () => {
      const { container } = render(<MonthBars chart={blocks({ month: '2026-09' }).trend.chart!} size="tall" />)
      expect(monthLabels(container).map((label) => label.textContent)).toEqual(['10월', '11월', '12월', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월'])
      expect(hiddenSlots(container)).toEqual([1, 3, 5, 7, 9, 10, 12])
      expect(classesOf(monthLabels(container)[11])).toContain('font-semibold')
    })

    it('AC-009.5 고른 달이 가운데 숨는 자리(여섯째 칸, 2026-03)면 앞뒤 칸만 더 숨고, 두 칸·세 칸 떨어진 글자는 원래 규칙이다', () => {
      const { container } = render(<MonthBars chart={blocks({ month: '2026-03' }).trend.chart!} size="tall" />)
      // 고른 달 5는 보인다. 앞뒤 4·6은 더 숨고, 두 칸 떨어진 3·7은 홀수 칸이라 숨고, 세 칸 떨어진 2·8은 짝수 칸이라 보인다
      expect(hiddenSlots(container)).toEqual([1, 3, 4, 6, 7, 9, 11])
    })

    it('AC-009.5 건당 진료비 막대와 세 겹 막대도 같은 규칙이다', () => {
      const perVisit = render(<MonthBars chart={blocks({ month: '2026-09' }).perVisit.chart!} size="short" />)
      expect(hiddenSlots(perVisit.container)).toEqual([1, 3, 5, 7, 9, 10, 12])
      perVisit.unmount()
      const stack = render(<StackBars chart={blocks({ month: '2026-09' }).split.chart!} />)
      expect(hiddenSlots(stack.container)).toEqual([1, 3, 5, 7, 9, 10, 12])
    })

    it('AC-009.5 고른 달이 원래 보이는 자리(열셋째 칸, 2026-10)면 원래 규칙 그대로다', () => {
      const { container } = render(<MonthBars chart={blocks({ month: '2026-10' }).trend.chart!} size="tall" />)
      expect(hiddenSlots(container)).toEqual(ODD_SLOTS)
    })

    it('AC-009.5 고른 달이 없는 그림이면 원래 규칙 그대로이고 첫 칸도 보인다', () => {
      const chart = blocks().trend.chart!
      const { container } = render(<MonthBars chart={{ ...chart, columns: chart.columns.map((column) => ({ ...column, kind: 'other' as const })) }} size="tall" />)
      expect(hiddenSlots(container)).toEqual(ODD_SLOTS)
    })
  })

  it('AC-009.5 폰 단추·달 고르기 단추는 44px 누름 영역이다(h-11·size-11 또는 ds의 폰 크기)', () => {
    render(
      <>
        <TitleRow header={{ title: '매출', meta: null, refresh: '다시 가져오기' }} onRefresh={() => {}} />
        <PeriodRow period={{ label: '2026년 10월', note: '기간' }} canPrevious canNext onPrevious={() => {}} onNext={() => {}} />
      </>,
    )
    expect(classesOf(screen.getByRole('button', { name: '다시 가져오기' }))).toContain('max-md:h-11')
    for (const name of ['지난달', '다음 달']) expect(classesOf(screen.getByRole('button', { name }))).toContain('max-md:size-11')
    expect(ds.button.secondarySmall).toContain('max-md:h-11')
  })

  it('AC-009.5 다른 단추·링크도 ds의 폰 44px 묶음이다', () => {
    const failed = stateOf('ready', { sync: { state: 'idle', failed: [{ month: '2025-12', code: 'E-BIT-READ-FAILED' }] } }).failed!
    render(
      <>
        <FailedBanner failed={failed} onRetry={() => {}} />
        <SaveFailedCard onRetry={() => {}} />
        <BusyNotice onRetry={() => {}} />
        <SavedNotice notice={stateOf('saved-only', { bridge: 'none' }).notice} />
        <UpgradeNeeded view={stateOf('helper-old', { bridge: 'helper-old' })} />
        <ConnectNeeded view={stateOf('connect-needed', { bridge: 'none', days: [] })} />
        <RevenueTreatments view={blocks({ groups: 'load-failed' }).treatments} onRetry={() => {}} retrying={false} />
      </>,
    )
    for (const el of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) expect(classesOf(el), el.textContent ?? '').toContain('max-md:h-11')
  })

  it('AC-009.5 배치가 md:(768)에서 바뀐다: 칸 넷 2×2 → 4칸, 표·막대 두 칸, 표의 지난달보다 칸은 폰에서 숨고, 순위 막대는 이름·값 한 줄 + 막대 아래 줄', () => {
    const { container } = render(
      <>
        <RevenueTrend view={blocks().trend} />
        <RevenueSplit view={blocks().split} />
        <RevenueTreatments view={blocks().treatments} onRetry={() => {}} retrying={false} />
      </>,
    )
    const kpis = screen.getByText('10월 매출').parentElement!.parentElement!
    expect(classesOf(kpis)).toEqual(expect.arrayContaining(['grid-cols-2', 'md:grid-cols-4']))

    const split = container.querySelector('table:not(.sr-only)')!.parentElement!.parentElement!
    expect(classesOf(split)).toContain('md:grid-cols-12')

    const headCells = Array.from(container.querySelectorAll('table:not(.sr-only) thead th'))
    expect(classesOf(headCells[3]!)).toContain('max-md:hidden')
    for (const cell of container.querySelectorAll('table:not(.sr-only) tbody tr td:nth-child(4)')) expect(classesOf(cell)).toContain('max-md:hidden')

    const row = screen.getAllByRole('listitem')[0]!
    expect(classesOf(row)).toEqual(expect.arrayContaining(['flex-wrap', 'md:flex-nowrap']))
    const bar = row.querySelector('[aria-hidden="true"]')!
    expect(classesOf(bar)).toEqual(expect.arrayContaining(['order-last', 'w-full', 'md:order-none']))
    expect(classesOf(row.lastElementChild!.lastElementChild!)).toContain('max-md:hidden')
  })
})

describe('AC-009.5 소스 규칙(폴더의 새 파일을 저절로 본다)', () => {
  const files = () => readdirSync(join(process.cwd(), FOLDER)).filter((name) => /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name))
  const source = (name: string) => readFileSync(join(process.cwd(), FOLDER, name), 'utf8')
  const code = (name: string) => source(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

  it('AC-009.5 검사할 파일이 있다(빈 검사가 아니다)', () => {
    expect(files()).toEqual(
      expect.arrayContaining(['RevenueScreen.tsx', 'RevenueTrend.tsx', 'RevenueSplit.tsx', 'RevenueTreatments.tsx', 'RevenuePerVisit.tsx', 'MonthBars.tsx', 'TreatmentBars.tsx', 'RevenueStates.tsx']),
    )
  })

  it('AC-009.5 16진수·색 함수·대괄호 값·font-bold·sm:·xl:·움직임 클래스가 없다', () => {
    for (const name of files()) {
      const text = code(name)
      expect(text, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(text, name).not.toMatch(/\b(?:rgba?|hsla?|oklch|color-mix)\(/)
      expect(text, name).not.toMatch(/\b[\w:-]+-\[[^\]]*\]/)
      expect(text, name).not.toMatch(/\bfont-bold\b/)
      expect(text, name).not.toMatch(/\b(?:sm|xl|\dxl):/)
      expect(text, name).not.toMatch(/\banimate-|@keyframes|transition-all/)
    }
  })

  it.each(['MonthBars.tsx', 'TreatmentBars.tsx', 'RevenueParts.tsx'])("AC-009.5 그림 부품 %s은 훅·'use client'·타이머·움직임이 없는 순수 부품이다", (name) => {
    const text = code(name)
    expect(text).not.toMatch(/['"]use client['"]/)
    expect(text).not.toMatch(/\buse[A-Z]\w*\s*\(/)
    expect(text).not.toMatch(/\b(?:setInterval|setTimeout|requestAnimationFrame)\b/)
    expect(text).not.toMatch(/\btransition\b/)
  })

  it("AC-009.5 RevenueScreen만 'use client'를 앞세우고, 통로 client.ts를 불러오지 않고 Worker를 만들지 않는다", () => {
    expect(source('RevenueScreen.tsx').startsWith("'use client'")).toBe(true)
    for (const name of files().filter((file) => file !== 'RevenueScreen.tsx')) expect(code(name), name).not.toMatch(/['"]use client['"]/)
    for (const name of files()) {
      expect(code(name), name).not.toMatch(/lib\/bridge\/client/)
      expect(code(name), name).not.toMatch(/\bnew Worker\b/)
    }
  })

  it('AC-009.5 빨강·초록만으로 가르지 않고 빈 그래프 틀이 없다: 상자 안 상자도 없다', () => {
    const everything = (
      <>
        <TitleRow header={stateOf('ready').header} onRefresh={() => {}} />
        <PeriodRow period={stateOf('ready').period} canPrevious canNext onPrevious={() => {}} onNext={() => {}} />
        <RevenueTrend view={blocks().trend} />
        <RevenueSplit view={blocks().split} />
        <RevenueTreatments view={blocks().treatments} onRetry={() => {}} retrying={false} />
        <RevenuePerVisit view={blocks().perVisit} />
        <SafeLine text={stateOf('ready').safe} />
        <ConnectNeeded view={stateOf('connect-needed', { bridge: 'none', days: [] })} />
        <Fetching view={stateOf('fetching', { sync: { state: 'running', done: 1, total: 13 } })} />
        <UpgradeNeeded view={stateOf('helper-old', { bridge: 'helper-old' })} />
        <UpgradeNeeded view={stateOf('extension-old', { sync: { state: 'idle', extensionOld: true } })} />
        <RevenueError view={stateOf('error', { sync: { state: 'error', code: 'E-BIT-DB-FAILED' } })} onRetry={() => {}} />
        <EmptyMonthBlock empty={stateOf('empty', { days: [] }).empty} />
      </>
    )
    expect(nestedBoxes(render(everything).container)).toEqual([])
  })
})
