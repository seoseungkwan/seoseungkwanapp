// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import type { StatsPick } from '@/components/stats/periodPick'
import { revenueCells, type RevenueCell } from '@/components/stats/revenueView'
import { rangeOf, statsRange, summaryCells, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { nestedBoxes } from '@/testing/boxes'
import type { ClinicReportNumbers } from '@/types/clinicReport'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { RxGroup } from '@/types/rxGroups'
import type { RxSplitView } from '@/types/stats'
import { PeriodSummary } from './PeriodSummary'
import type { ReportData } from './ReportSection'
import { StatsSections } from './StatsSections'

// 기간 요약 + 섹션 차례 (stats REQ-513 AC-513.1·513.2·513.4·513.9, rx-picker AC-801.1, treatment-trend AC-1201.1·AC-1213.1, 시안 notes.md §2·§3·§4). 가짜 일 줄은 이 파일 안에서만 만든다
// 처방 골라 보기는 이 파일에서 읽는 중에 머문다. 그 칸의 안은 RxPickerSection.test.tsx가 본다
// 처방별 추세의 묶음 값은 이 파일이 만든 가짜(StatsRxGroupsView)다. 그 칸의 안은 TreatmentTrendSection.test.tsx가 본다

vi.mock('@/lib/storage/rxPicks', () => ({
  readRxPicks: vi.fn(() => new Promise(() => undefined)),
  addRxPick: vi.fn(),
  removeRxPick: vi.fn(),
  clearRxPicks: vi.fn(),
}))
// 통계 묶음 저장 코드. 섹션은 묶음 값을 props로만 받아 부르지 않는다
vi.mock('@/lib/storage/statsRxGroups', () => ({
  listStatsRxGroups: vi.fn(() => new Promise(() => undefined)),
  saveStatsRxGroups: vi.fn(),
  StatsRxGroupStoreError: class extends Error {},
}))

const TODAY = '2026-11-13' // 금요일

function day(ymd: string, patients: number, partial = false): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients, newPatients: 2, returning: patients - 2, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 2, within7: 1, within14: 1 },
  }
}

const inputOf = (days: DayPayload[], covered: DateRange[], period: StatsPeriod = '30d', today = TODAY): StatsInput => ({
  days,
  covered,
  range: statsRange(today, period),
})
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]

// 저장된 묶음 하나(지어낸 이름·코드)
const GROUP: RxGroup = { id: 'g0', name: '가짜 묶음', codes: ['RA'], sortOrder: 0 }
const GROUPS: StatsRxGroupsView = {
  state: 'ready',
  groups: [GROUP],
  suggested: false,
  saving: false,
  saveFailed: false,
  reread: () => undefined,
  save: async () => true,
  forLoad: async () => [],
}

afterEach(cleanup)

const cellText = (name: string) => screen.getByText(name).closest('.grid-cols-4 > div')!.textContent

describe('AC-513.1·AC-801.1·AC-1201.1·AC-4003.1: 섹션 차례', () => {
  // 처방 세 칸은 한 칸 `처방` + 탭 셋이다(stats-pc-ux AC-4003.1). 비트 전용 세 칸은 bit를 줄 때만 있다
  const TITLES = ['기간 요약', '환자 수 추이', '신환 재방문율', '처방', '원장님 보고 문장', '요일별 환자 수']
  const draw = (saved: boolean) =>
    render(
      <StatsSections input={inputOf(saved ? [day('2026-11-02', 10)] : [], saved ? WHOLE : [])} saved={saved} split={null} hospitalName="튼튼의원" report={null} groups={GROUPS} />,
    )

  it('AC-513.1·AC-801.1·AC-1201.1·AC-4003.1: 여섯 섹션이 승인본 차례이고 섹션마다 h2다. 처방 추세 · 처방별 추세 · 처방별 신환·재진 · 처방 골라 보기 h2는 없다', () => {
    draw(true)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(TITLES)
    expect(screen.queryByRole('heading', { name: '처방 추세' })).toBeNull()
    for (const name of ['처방별 추세', '처방별 신환·재진', '처방 골라 보기']) expect(screen.queryByRole('heading', { level: 2, name, hidden: true }), name).toBeNull()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['묶음별 추세', '처방별 신환·재진', '처방 골라 보기'])
  })

  it('AC-513.1·AC-801.1·AC-1201.1·AC-4003.1: 저장된 숫자가 없어도 차례가 같다', () => {
    draw(false)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(TITLES)
    expect(screen.queryByRole('heading', { name: '처방 추세' })).toBeNull()
  })

  it('AC-513.1·AC-801.1·AC-1201.1·AC-4003.1: 1024px 이상 배치는 12 / 8·4 / 12 / 7·5이고 오른쪽 칸은 왼쪽 선 + 안쪽 24다', () => {
    draw(true)
    const sectionOf = (title: string) => screen.getByRole('heading', { level: 2, name: title }).closest('section')!.className
    expect(sectionOf('기간 요약')).toContain('col-span-12')
    expect(sectionOf('환자 수 추이')).toContain('lg:col-span-8')
    expect(sectionOf('원장님 보고 문장')).toContain('lg:col-span-7')
    // 처방 칸은 전체 폭이고 세로선·왼쪽 여백이 없다
    expect(sectionOf('처방').split(' ')).toContain('col-span-12')
    expect(sectionOf('처방')).not.toContain('lg:')
    for (const [title, span] of [
      ['신환 재방문율', 'lg:col-span-4'],
      ['요일별 환자 수', 'lg:col-span-5'],
    ] as const) {
      expect(sectionOf(title)).toContain(span)
      expect(sectionOf(title)).toContain('lg:border-l')
      expect(sectionOf(title)).toContain('lg:pl-6')
    }
  })

  it('AC-1201.1·AC-3708.7·AC-4003.4: 처음 고른 첫 탭(묶음별 추세)이면 처방 칸 h2 옆에 승인본 설명이 있다(group-exclude AC-3708.7 글자)', () => {
    draw(true)
    const head = screen.getByRole('heading', { level: 2, name: '처방' }).parentElement!
    expect(within(head).getByText('만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건')).toBeTruthy()
    expect(within(head).getByRole('button', { name: '묶음 고치기' })).toBeTruthy()
  })

  it('AC-4002.6: 아홉 칸 section마다 목차 id와 목차 띠에 가리지 않는 scroll-margin이 있고, 안쪽(탭 안 칸 포함)에는 id가 없다', () => {
    const IDS = [
      ['기간 요약', 'stats-summary'],
      ['환자 수 추이', 'stats-trend'],
      ['신환 재방문율', 'stats-revisit'],
      ['처방', 'stats-rx'],
      ['원장님 보고 문장', 'stats-report'],
      ['요일별 환자 수', 'stats-weekday'],
      ['환자 구성', 'stats-mix'],
      ['시간대별 접수', 'stats-hours'],
      ['원장님별', 'stats-doctors'],
    ] as const
    const { container } = render(
      <StatsSections input={inputOf([day('2026-11-02', 10)], WHOLE)} saved split={null} hospitalName="튼튼의원" report={null} groups={GROUPS} bit={null} />,
    )
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(IDS.map(([title]) => title))
    for (const [title, id] of IDS) {
      const section = screen.getByRole('heading', { level: 2, name: title }).closest('section')!
      expect(section.id, title).toBe(id)
      expect(section.className.split(' '), title).toEqual(expect.arrayContaining(['scroll-mt-36.25', 'max-md:scroll-mt-34.75']))
    }
    expect(container.querySelectorAll('[id^="stats-"]')).toHaveLength(IDS.length)
    // 탭 안 칸(묶음별 추세 · 처방별 신환·재진 · 처방 골라 보기)은 h2 칸이 아니다(숨은 패널 포함)
    const rx = container.querySelector<HTMLElement>('#stats-rx')!
    expect(within(rx).queryAllByRole('heading', { level: 2, hidden: true }).map((h) => h.textContent)).toEqual(['처방'])
  })

  // stats-revenue: 매출 값(useStatsRevenue 값 + 마지막 끝난 날)을 주면 `매출` 칸이 재방문율 다음 · 처방 앞에 있고 기간 요약에 둘째 줄이 있다.
  // 주지 않으면 지금 아홉 칸 그대로다(위 AC-4002.6 시험)
  const REVENUE_READY = { state: 'ready' as const, days: [], codes: [], monthCodes: [], noDayCodes: false, lastDay: '2026-11-12', onReread: () => undefined }
  const TEN = ['기간 요약', '환자 수 추이', '신환 재방문율', '매출', '처방', '원장님 보고 문장', '요일별 환자 수', '환자 구성', '시간대별 접수', '원장님별']
  const drawWithRevenue = (revenue: Omit<typeof REVENUE_READY, 'state'> & { state: 'reading' | 'ready' | 'read-failed' } = REVENUE_READY) =>
    render(
      <StatsSections input={inputOf([day('2026-11-02', 10)], WHOLE)} saved split={null} hospitalName="튼튼의원" report={null} groups={GROUPS} bit={null} revenue={revenue} />,
    )
  const summaryGrids = () => [...screen.getByRole('heading', { level: 2, name: '기간 요약' }).closest('section')!.querySelectorAll('.grid')]

  it('AC-4109.1·AC-4107.1: 매출 값을 주면 h2 열이 승인본 차례이고 `매출`은 재방문율 다음 · 처방 앞 전체 폭 칸(목차 자리 id stats-revenue)이다', () => {
    const { container } = drawWithRevenue()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(TEN)
    const section = screen.getByRole('heading', { level: 2, name: '매출' }).closest('section')!
    expect(section.id).toBe('stats-revenue')
    expect(section.className.split(' ')).toEqual(expect.arrayContaining(['col-span-12', 'scroll-mt-36.25', 'max-md:scroll-mt-34.75']))
    expect(section.className).not.toContain('lg:')
    expect(container.querySelectorAll('[id^="stats-"]')).toHaveLength(TEN.length)
  })

  it('AC-4109.1·AC-4106.3: 매출 값을 주면 기간 요약에 둘째 줄(매출 네 칸)이 있고, 주지 않으면 지금 아홉 칸 그대로 둘째 줄이 없다', () => {
    drawWithRevenue()
    expect(summaryGrids()).toHaveLength(2)
    expect([...summaryGrids()[1]!.children].map((cell) => cell.textContent)).toEqual(['매출–자료 없음', '건당 진료비–자료 없음', '확인 필요한 날–자료 없음', '비교 기간보다–자료 없음'])
    expect(screen.getByRole('heading', { level: 2, name: '매출' }).closest('section')!.textContent).toBe('매출자료 없음 · 불러오면 이 기간의 매출이 하루씩 막대로 그려져요.')
    cleanup()

    render(<StatsSections input={inputOf([day('2026-11-02', 10)], WHOLE)} saved split={null} hospitalName="튼튼의원" report={null} groups={GROUPS} bit={null} />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(TEN.filter((title) => title !== '매출'))
    expect(summaryGrids()).toHaveLength(1)
  })

  it('AC-4107.1·AC-4106.3: 매출을 읽는 중이면 둘째 줄 네 칸과 매출 칸이 `불러오는 중`이고, 읽기 실패면 매출 칸 [다시 읽기]가 매출만 다시 읽는다', () => {
    drawWithRevenue({ ...REVENUE_READY, state: 'reading' })
    expect([...summaryGrids()[1]!.children].map((cell) => cell.textContent)).toEqual(['매출–불러오는 중', '건당 진료비–불러오는 중', '확인 필요한 날–불러오는 중', '비교 기간보다–불러오는 중'])
    expect(screen.getByRole('heading', { level: 2, name: '매출' }).closest('section')!.textContent).toBe('매출불러오는 중')
    cleanup()

    const onReread = vi.fn()
    drawWithRevenue({ ...REVENUE_READY, state: 'read-failed', onReread })
    const section = screen.getByRole('heading', { level: 2, name: '매출' }).closest('section')!
    expect(within(section).getByRole('alert').textContent).toContain('E-STATS-READ-FAILED')
    fireEvent.click(within(section).getByRole('button', { name: '다시 읽기' }))
    expect(onReread).toHaveBeenCalledTimes(1)
  })

  it('AC-513.1: 섹션 위는 1px line-strong이고 도구 단추 줄이 없다', () => {
    draw(true)
    const section = screen.getByRole('heading', { level: 2, name: '기간 요약' }).closest('section')!
    expect(section.className).toContain('border-t')
    expect(section.className).toContain('border-line-strong')
    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})

describe('AC-513.1·AC-513.2: 기간 요약 숫자 칸', () => {
  // 지난 기간 하루 100명, 이번 기간 하루 110명
  const UP = [day('2026-09-21', 100), day('2026-11-02', 110)]

  it('AC-513.1: h2 + 옆 설명(기간 이름 · 기간 글자)이고 숫자 칸 넷이 시안 글이다', () => {
    render(<PeriodSummary input={inputOf(UP, WHOLE)} saved />)
    expect(screen.getByRole('heading', { level: 2, name: '기간 요약' })).toBeTruthy()
    expect(screen.getByText('최근 30일 · 10월 14일 – 11월 12일')).toBeTruthy()
    expect(cellText('하루 평균 환자 수')).toBe('하루 평균 환자 수110명진료한 날 1일 평균')
    expect(cellText('신환')).toBe('신환2명기간 합계')
    expect(cellText('재진')).toBe('재진108명기간 합계')
  })

  it('AC-513.1: 768px 미만에서 숫자 칸 넷의 값은 모두 heading-m(24/32)이다', () => {
    const { container } = render(<PeriodSummary input={inputOf(UP, WHOLE)} saved />)
    const grid = container.querySelector('.grid-cols-4')!
    expect(grid.className).toContain('max-md:[&_.text-metric]:text-heading-m')
    expect(grid.querySelectorAll('.text-metric')).toHaveLength(4)
  })

  it('AC-513.2: 늘어남은 ▲ + formatDelta 글자 + "늘어남"이고 색만 쓰지 않는다', () => {
    render(<PeriodSummary input={inputOf(UP, WHOLE)} saved />)
    const cell = screen.getByText('비교 기간보다').closest('.grid-cols-4 > div')!
    expect(cell.textContent).toContain('▲')
    expect(cell.textContent).toContain('10명 (+10.0%)')
    expect(cell.textContent).toContain('늘어남')
    expect(cell.textContent).toContain('지난 30일 하루 평균 100명')
    expect(cell.querySelector('.text-positive')).not.toBeNull()
  })

  it('AC-513.2: 줄어듦은 ▼ + 글자 + "줄어듦"이다', () => {
    render(<PeriodSummary input={inputOf([day('2026-09-21', 100), day('2026-11-02', 90)], WHOLE)} saved />)
    const cell = screen.getByText('비교 기간보다').closest('.grid-cols-4 > div')!
    expect(cell.textContent).toContain('▼')
    expect(cell.textContent).toContain('10명 (−10.0%)')
    expect(cell.textContent).toContain('줄어듦')
    expect(cell.querySelector('.text-negative')).not.toBeNull()
  })

  it('AC-513.2: 변화 없음은 화살표 없이 글자만이다', () => {
    render(<PeriodSummary input={inputOf([day('2026-09-21', 100), day('2026-11-02', 100)], WHOLE)} saved />)
    const cell = screen.getByText('비교 기간보다').closest('.grid-cols-4 > div')!
    expect(cell.textContent).toContain('변화 없음')
    expect(cell.textContent).not.toMatch(/[▲▼]/)
  })

  it('AC-513.1: 비교 자료가 없으면 넷째 칸은 "–" + "비교할 자료가 없어요"다', () => {
    render(<PeriodSummary input={inputOf([day('2026-11-02', 100)], [{ from: '2026-10-14', to: '2026-11-12' }])} saved />)
    expect(cellText('비교 기간보다')).toBe('비교 기간보다–비교할 자료가 없어요')
  })

  it('AC-513.1: 넷째 칸 아래 글은 SummaryCell.note 그대로다 — "견준 …" 글이 그대로 보인다', () => {
    // 작년 앞쪽 달이 덮이지 않은 12개월 보기, 두 해 숫자가 같음(view.test의 사례와 같은 모양)
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
    const last = ['2025-06', '2025-07', '2025-08', '2025-09', '2025-10']
    const days = [...months, ...last].map((m) => day(`${m}-10`, 100))
    const input = inputOf(days, [{ from: '2025-06-01', to: '2026-11-12' }], '12m')
    const note = summaryCells(input).find((cell) => cell.key === 'compare')!.note
    expect(note).toMatch(/^견준 /)
    render(<PeriodSummary input={input} saved />)
    expect(screen.getByText(note)).toBeTruthy()
  })

  it('AC-513.1: 덜 끝난 칸이 든 신환·재진 합에는 warning 칩 "일부 기간"이 붙는다', () => {
    render(<PeriodSummary input={inputOf([day('2026-11-02', 100), day('2026-11-03', 50, true)], WHOLE)} saved />)
    const chips = screen.getAllByText('일부 기간')
    expect(chips).toHaveLength(2)
    for (const chip of chips) expect(chip.className).toContain('text-warning')
  })
})

describe('AC-513.1: 12개월 기간 요약', () => {
  const ROWS = [day('2025-10-10', 100), day('2026-10-10', 100), day('2026-11-02', 30)]

  it('AC-513.1: 이름은 "한 달 평균 환자 수"이고 오늘이 든 달 안내 글이 있다', () => {
    render(<PeriodSummary input={inputOf(ROWS, WHOLE, '12m')} saved />)
    expect(screen.getByText('최근 12개월 · 2025년 12월 – 2026년 11월')).toBeTruthy()
    expect(screen.getByText('한 달 평균 환자 수')).toBeTruthy()
    expect(screen.getByText('11월은 아직 끝나지 않은 달이라 평균과 견주기에서 빼요(작년 11월도 빼요). 신환·재진 합계에는 넣어요.')).toBeTruthy()
  })

  it('AC-513.1: 이번 달만 있으면 평균 칸 "자료 없음"·넷째 칸 "비교할 자료가 없어요"·끝난 달 없음 안내다', () => {
    render(<PeriodSummary input={inputOf([day('2026-11-02', 30)], [{ from: '2026-11-02', to: '2026-11-12' }], '12m')} saved />)
    expect(cellText('한 달 평균 환자 수')).toBe('한 달 평균 환자 수–자료 없음')
    expect(cellText('비교 기간보다')).toBe('비교 기간보다–비교할 자료가 없어요')
    expect(screen.getByText('끝난 달 숫자가 아직 없어요. 11월은 끝나지 않은 달이라 평균에 넣지 않아요. 12월 1일이 지나면 평균이 보여요.')).toBeTruthy()
  })

  it('AC-513.1: 12월의 다음 달은 1월이다', () => {
    render(<PeriodSummary input={inputOf([day('2026-12-02', 30)], [{ from: '2026-12-02', to: '2026-12-04' }], '12m', '2026-12-05')} saved />)
    expect(screen.getByText('끝난 달 숫자가 아직 없어요. 12월은 끝나지 않은 달이라 평균에 넣지 않아요. 1월 1일이 지나면 평균이 보여요.')).toBeTruthy()
  })

  it('AC-513.1: 8월이 덜 덮인 11월의 12개월 보기 — 8월이 끝나지 않았다는 글이 없고, 글은 오늘이 든 달만 말한다', () => {
    const covered = [
      { from: '2024-12-01', to: '2026-08-05' },
      { from: '2026-08-20', to: '2026-11-12' },
    ]
    const { container } = render(<PeriodSummary input={inputOf([day('2026-08-25', 40), ...ROWS], covered, '12m')} saved />)
    expect(container.textContent).not.toContain('8월은')
    expect(screen.getByText('11월은 아직 끝나지 않은 달이라 평균과 견주기에서 빼요(작년 11월도 빼요). 신환·재진 합계에는 넣어요.')).toBeTruthy()
  })

  it('AC-513.1: 이번 달이 끝났고 지난 8월만 덜 덮였으면 끝나지 않은 달 글이 아예 없고 칩만 있다', () => {
    const today = '2026-11-30'
    const covered = [
      { from: '2024-12-01', to: '2026-08-05' },
      { from: '2026-08-20', to: '2026-11-30' },
    ]
    const { container } = render(<PeriodSummary input={inputOf([day('2026-08-25', 40), day('2026-11-02', 30)], covered, '12m', today)} saved />)
    expect(container.textContent).not.toContain('끝나지 않은')
    expect(screen.getAllByText('일부 기간').length).toBeGreaterThan(0)
  })

  it('AC-513.1: 일 기간에는 이 안내 글이 없다', () => {
    const { container } = render(<PeriodSummary input={inputOf([day('2026-11-02', 30, true)], WHOLE)} saved />)
    expect(container.textContent).not.toContain('끝나지 않은')
  })
})

describe('AC-513.4: 기간 요약 빈 상태', () => {
  it('AC-513.4: 저장된 숫자가 없으면 숫자 칸 없이 "자료 없음" + 시안 한 줄이다', () => {
    render(<PeriodSummary input={inputOf([], [])} saved={false} />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 숫자를 불러오면 이 기간의 평균 환자 수와 신환·재진이 보여요.')
    expect(screen.queryByText('하루 평균 환자 수')).toBeNull()
    expect(screen.queryByText('–')).toBeNull()
  })

  it('AC-513.4: 저장된 숫자는 있는데 이 기간 자료가 없으면 그 문구이고 숫자를 지어내지 않는다', () => {
    render(<PeriodSummary input={inputOf([day('2026-01-05', 3)], WHOLE)} saved />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.')
    expect(screen.queryByText('0명')).toBeNull()
  })
})

describe('AC-513.9: 섹션 소스 규칙', () => {
  const ROOT = process.cwd()
  const DIR = 'src/components/stats/sections'
  const files = () => [
    ...readdirSync(join(ROOT, DIR))
      .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .map((name) => `${DIR}/${name}`),
    'src/components/stats/view.ts',
  ]
  const code = (file: string) =>
    readFileSync(join(ROOT, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')

  it('AC-513.9·AC-1213.1: 검사 대상이 비어 있지 않다(섹션 여덟 + 공용 둘 + view.ts + 처방별 추세 조각)', () => {
    const list = files()
    for (const name of [
      'PeriodSummary',
      'PatientTrendSection',
      'RevisitSection',
      'TreatmentTrendSection',
      'RxSplitSection',
      'RxPickerSection',
      'ReportSection',
      'WeekdaySection',
      'DetailToggle',
      'CopyButton',
      'TreatmentTable',
      'TreatmentDetail',
      'TreatmentGroupEditor',
    ]) {
      expect(list).toContain(`${DIR}/${name}.tsx`)
    }
    expect(list).toContain(`${DIR}/trendLabels.ts`)
    expect(list).toContain('src/components/stats/view.ts')
    expect(list).not.toContain(`${DIR}/RxTrendSection.tsx`) // 처방 추세 칸은 지웠다(AC-1201.1)
  })

  it('AC-1213.1: 처방별 추세의 화면·훅·계산 파일은 브라우저 저장소·document.cookie·console·lib/bridge/client·주소를 쓰지 않는다', () => {
    const own = [
      ...['TreatmentTrendSection', 'TreatmentTable', 'TreatmentDetail', 'TreatmentGroupEditor'].map((name) => `${DIR}/${name}.tsx`),
      `${DIR}/trendLabels.ts`,
      'src/components/stats/useStatsRxGroups.ts',
      'src/components/stats/treatmentView.ts',
      'src/components/stats/treatmentEdit.ts',
    ]
    const treatmentSections = readdirSync(join(ROOT, DIR)).filter((name) => /^Treatment.*\.tsx$/.test(name) && !/\.test\.tsx$/.test(name))
    for (const name of treatmentSections) expect(own).toContain(`${DIR}/${name}`)
    for (const file of own) {
      const text = code(file)
      for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'console', 'lib/bridge/client', 'history.', 'location.', 'useSearchParams', 'fetch(']) {
        expect(text, `${file}: ${word}`).not.toContain(word)
      }
    }
  })

  it('AC-513.9: Supabase·fetch·브라우저 저장소·주소·lib/bridge·workers를 쓰지 않는다', () => {
    for (const file of files()) {
      const text = code(file)
      expect(text, file).not.toMatch(/supabase/i)
      expect(text, file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon/)
      expect(text, file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
      expect(text, file).not.toMatch(/history\.(?:push|replace)State|location\.(?:href|search|hash)|useRouter|useSearchParams/)
      expect(text, file).not.toMatch(/['"]@\/lib\/bridge|['"]@\/workers|lib\/storage/)
    }
  })

  it('AC-513.9: 옛 모양(ui.)·font-bold·HTML 넣기·새 차트 패키지가 없다', () => {
    for (const file of files()) {
      const text = code(file)
      expect(text, file).not.toMatch(/\bui\.[a-z]/)
      expect(text, file).not.toContain('font-bold')
      expect(text, file).not.toContain('dangerouslySetInnerHTML')
      expect(text, file).not.toMatch(/recharts|chart\.js|d3-|echarts/)
    }
  })

  it('AC-513.9·AC-1201.1·AC-4003.2: 여섯 섹션을 모두 채우고 모두 열고 처방 탭을 모두 골라도 그린 화면에 상자 안 상자가 없다', () => {
    const withRx = (ymd: string, patients: number): DayPayload => ({
      ...day(ymd, patients),
      rx: [{ code: 'RA', name: '가짜 처방', type: '', patients, newPatients: 2, returning: patients - 2 }],
      groups: [{ id: groupKey(GROUP.codes), patients, newPatients: 2, returning: patients - 2 }],
      revisit: { cohort: 2, within7: 1, within14: 1, within30: 1, after30: 0 },
    })
    const split: RxSplitView = {
      kind: 'split',
      split: {
        from: '2026-10-14',
        to: '2026-11-12',
        visits: 110,
        patients: 90,
        newPatients: 2,
        returning: 88,
        lines: [{ code: 'RA', label: '가짜 표 처방', newPatients: 2, returning: 88, total: 90 }],
        invalidCodes: 0,
      },
      days: [],
      text: '',
      headline: '가짜 머리 글',
    }
    const numbers = (period: string): ClinicReportNumbers => ({
      ok: true,
      period,
      totalVisits: 120,
      newPatients: 20,
      returnPatients: 100,
      totalAmount: 1000000,
      insurerAmount: 700000,
      noncoveredAmount: 300000,
      cashAmount: 100000,
      cardAmount: 200000,
      transferAmount: 0,
      treatments: { manual: 10, eswt: 5, carm: 3, sono: 2, cryo: 1 },
      laCodes: [],
      financeUnconfirmed: true,
      notes: [],
    })
    const report: ReportData = {
      numbers: {
        daily: [numbers(TODAY), { ok: false, period: '2026-11-12', reason: '가짜 사유' }],
        monthly: [numbers('2026-11'), numbers('2026-10')],
      },
      loadedAt: '18:42',
      closedToday: false,
    }
    const { container } = render(
      <StatsSections input={inputOf([withRx('2026-09-21', 100), withRx('2026-11-02', 110)], WHOLE)} saved split={split} hospitalName="튼튼의원" report={report} groups={GROUPS} />,
    )
    // 묶음 줄을 먼저 열어야 그 안의 [숫자로 보기]까지 함께 열린다
    fireEvent.click(screen.getByRole('button', { name: /가짜 묶음/ }))
    for (const button of screen.getAllByRole('button', { name: '자세히' })) fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: '숫자로 보기' }))
    expect(screen.queryByRole('button', { name: '자세히' })).toBeNull()
    expect(screen.queryByRole('button', { name: '숫자로 보기' })).toBeNull()
    expect(screen.getAllByRole('button', { name: '접기' })).toHaveLength(4) // 추이 · 재방문율 · 치료별 칸 · 요일별
    expect(screen.getByRole('list', { name: '첫 재방문까지 날수' })).toBeTruthy()
    expect(screen.getByRole('table', { name: '가짜 묶음 일별 건수' })).toBeTruthy()
    // 처방별 신환·재진은 처방 칸 둘째 탭이다(고르지 않은 패널은 hidden, stats-pc-ux AC-4003.2)
    fireEvent.click(screen.getByRole('tab', { name: '처방별 신환·재진' }))
    expect(screen.getByRole('table', { name: '처방별 신환·재진 (명)' })).toBeTruthy()
    expect(screen.getByText('고생하셨습니다 !!')).toBeTruthy()
    expect(within(container).getAllByRole('heading', { level: 2 })).toHaveLength(6)
    expect(nestedBoxes(container)).toEqual([])
    fireEvent.click(screen.getByRole('tab', { name: '처방 골라 보기' }))
    expect(nestedBoxes(container)).toEqual([])
    // 보고를 확정할 수 없는 벌의 칸도 본다
    fireEvent.click(screen.getByRole('button', { name: '어제 일일보고' }))
    expect(screen.getByText('이 기간은 보고를 확정할 수 없어요')).toBeTruthy()
    expect(nestedBoxes(container)).toEqual([])
  })
})

// ── 고른 기간 (stats-period REQ-1704). 오늘은 2026-11-06(금)이다 ─────────────────
describe('AC-1704.1·AC-1704.2·AC-1704.4: 고른 기간의 기간 요약', () => {
  const P_TODAY = '2026-11-06'
  const OCT: StatsPick = { kind: 'month', unit: 'day', month: '2026-10' }
  const NOV: StatsPick = { kind: 'month', unit: 'day', month: '2026-11' }
  const pickOf = (pick: StatsPick, days: DayPayload[], covered: DateRange[], todayDone = false): StatsInput => ({ days, covered, range: rangeOf(P_TODAY, pick, todayDone) })
  // 9월·10월은 날마다 덮고 줄은 몇 날만(나머지는 휴진). 작년 10월은 줄도 덮은 기간도 없다
  const SEP_OCT: DateRange[] = [{ from: '2026-09-01', to: '2026-10-31' }]
  const DAYS = [day('2026-09-07', 30), day('2026-10-05', 40), day('2026-10-06', 44)]
  const gridOf = () => screen.getByText('하루 평균 환자 수').closest('.grid')!
  const labels = () => [...gridOf().children].map((cell) => cell.querySelector('.text-small')?.textContent)
  const pickCell = (label: string) => [...gridOf().children].find((cell) => cell.querySelector('.text-small')?.textContent === label)!

  it('AC-1704.4: 설명은 "{name} · {label}"이고 칸은 평균·신환·재진·비교마다 한 칸("9월보다"·"작년 10월보다")이다', () => {
    render(<PeriodSummary input={pickOf(OCT, DAYS, SEP_OCT)} saved />)
    expect(screen.getByText('2026년 10월 · 2026년 10월 1일 – 31일')).toBeTruthy()
    expect(labels()).toEqual(['하루 평균 환자 수', '신환', '재진', '9월보다', '작년 10월보다'])
  })

  it('AC-1704.1: 견준 비교 칸은 증감 글자와 "{비교 label} 하루 평균 N명"이고, 견줄 수 없는 비교 칸은 "–"와 "{비교 label} 자료가 없어요"다(0이 아니다)', () => {
    render(<PeriodSummary input={pickOf(OCT, DAYS, SEP_OCT)} saved />)
    const before = pickCell('9월보다')
    expect(before.textContent).toContain('▲')
    expect(before.textContent).toContain('9월 1일 – 30일 하루 평균 30명')
    const lastYear = pickCell('작년 10월보다')
    expect(lastYear.textContent).toContain('–')
    expect(lastYear.textContent).toContain('2025년 10월 1일 – 31일 자료가 없어요')
    expect(lastYear.textContent).not.toContain('0명')
  })

  it('AC-1704.1: PC는 한 줄(비교 둘이면 5칸), 휴대폰은 평균·신환·재진 셋이 한 줄이고 비교 칸마다 한 줄이다', () => {
    render(<PeriodSummary input={pickOf(OCT, DAYS, SEP_OCT)} saved />)
    const grid = gridOf()
    expect(grid.className.split(' ')).toEqual(expect.arrayContaining(['grid-cols-5', 'max-md:grid-cols-3']))
    expect(grid.className).not.toContain('max-md:grid-cols-2')
    const spans = [...grid.children].map((cell) => cell.className.split(' ').includes('max-md:col-span-3'))
    expect(spans).toEqual([false, false, false, true, true])
  })

  it('AC-1704.1: 해 고르기는 비교 칸이 하나("2025년보다")라 PC 4칸이다', () => {
    const covered: DateRange[] = [{ from: '2025-01-01', to: '2026-11-05' }]
    render(<PeriodSummary input={pickOf({ kind: 'year', year: '2026' }, [day('2025-03-02', 20), day('2026-03-02', 30)], covered)} saved />)
    expect(screen.getByText('2026년 · 2026년 1월 1일 – 11월 5일')).toBeTruthy()
    expect(labels()).toEqual(['하루 평균 환자 수', '신환', '재진', '2025년보다'])
    expect(gridOf().className.split(' ')).toEqual(expect.arrayContaining(['grid-cols-4', 'max-md:grid-cols-3']))
  })

  it('AC-1704.2: 고른 기간에 끝나지 않은 날이 있으면 설명 끝에 " · 자료 없는 날 N일은 빼고 셌어요"가 붙는다', () => {
    // 11월 1–5일 가운데 2·3일만 줄이 있고 덮은 기간은 10월 31일까지다 → 1·4·5일 셋이 자료 없는 날
    render(<PeriodSummary input={pickOf(NOV, [day('2026-11-02', 40), day('2026-11-03', 44)], SEP_OCT)} saved />)
    expect(screen.getByText('2026년 11월 · 2026년 11월 1일 – 5일 · 자료 없는 날 3일은 빼고 셌어요')).toBeTruthy()
  })

  it('AC-1704.2: 끝나지 않은 날이 없으면 붙지 않는다', () => {
    render(<PeriodSummary input={pickOf(OCT, DAYS, SEP_OCT)} saved />)
    expect(screen.queryByText(/자료 없는 날/)).toBeNull()
  })
})

// ── stats-revenue: 기간 요약 둘째 줄 매출 네 칸 (REQ-4106, design.md '칸 부품', 시안 docs/mockups/stats-revenue).
// 칸 값은 revenueView(TASK-4)가 주는 모양을 손으로 만든 가짜(시안 숫자·글)다. 읽는 중·읽기 실패는 revenueCells가 주는 값 그대로다
describe('AC-4106.1~AC-4106.4: 기간 요약 둘째 줄(매출 네 칸)', () => {
  const UP = [day('2026-09-21', 100), day('2026-11-02', 110)]
  const cell = (key: RevenueCell['key'], label: string, value: string, unit: string | null, note: string | null, tone: RevenueCell['tone'], srText = ''): RevenueCell => ({
    key,
    label,
    value,
    unit,
    note,
    tone,
    srText,
  })
  const TOTAL = cell('total', '매출', '1억 3,261만', '원', '진료한 날 25일 평균 530만 원', 'ink')
  const PER_VISIT = cell('perVisit', '건당 진료비', '57,333', '원', '매출 ÷ 접수 2,313건', 'ink')
  const UNCHECKED = cell('unchecked', '확인 필요한 날', '1', '일', '10월 28일 · 그날 금액은 매출에 넣지 않았어요', 'warn')
  const COMPARE = cell('compare', '비교 기간보다', '60만 원 (+0.4%)', null, '지난 30일 매출 1억 3,200만 원', 'up', '늘어남')
  const MOCKUP = [TOTAL, PER_VISIT, UNCHECKED, COMPARE]
  const grids = (container: HTMLElement) => [...container.querySelectorAll('section .grid')] as HTMLElement[]
  const revenueGrid = (container: HTMLElement) => grids(container)[1]!
  const cellsOf = (container: HTMLElement) => [...revenueGrid(container).children] as HTMLElement[]
  const drawWith = (revenue: readonly RevenueCell[], input = inputOf(UP, WHOLE)) => render(<PeriodSummary input={input} saved revenue={revenue} />).container

  it('AC-4106.1: 환자 첫 줄 바로 아래 둘째 줄에 네 칸이 매출 · 건당 진료비 · 확인 필요한 날 · 비교 기간보다 차례이고 시안 글이다', () => {
    const container = drawWith(MOCKUP)
    const [first, second] = grids(container)
    expect(grids(container)).toHaveLength(2)
    expect(first!.nextElementSibling).toBe(second)
    expect(cellsOf(container).map((el) => el.textContent)).toEqual([
      '매출1억 3,261만원진료한 날 25일 평균 530만 원',
      '건당 진료비57,333원매출 ÷ 접수 2,313건',
      '확인 필요한 날1일10월 28일 · 그날 금액은 매출에 넣지 않았어요',
      '비교 기간보다▲ 60만 원 (+0.4%)늘어남지난 30일 매출 1억 3,200만 원',
    ])
  })

  it('AC-4106.1: 값 옆 `원`·`일`은 작은 글자(body 500 muted)이고 값은 metric 600 고정폭이다', () => {
    const container = drawWith(MOCKUP)
    const [total, , unchecked] = cellsOf(container)
    const value = within(total!).getByText('1억 3,261만')
    expect(value.className.split(' ')).toEqual(expect.arrayContaining(['mt-1', 'text-metric', 'font-semibold', 'tabular-nums', 'text-ink']))
    const unit = within(value).getByText('원')
    expect(unit.tagName).toBe('SPAN')
    expect(unit.className.split(' ')).toEqual(expect.arrayContaining(['ml-0.5', 'text-body', 'font-medium', 'text-muted']))
    expect(within(unchecked!).getByText('일').tagName).toBe('SPAN')
  })

  it('AC-4106.1: 확인 필요한 날 값은 주황(text-warning), 늘어남은 초록(text-positive) + 꾸밈 ▲ + 글 `늘어남`이다', () => {
    const container = drawWith(MOCKUP)
    const [, , unchecked, compare] = cellsOf(container)
    expect(within(unchecked!).getByText('1').className).toContain('text-warning')
    const delta = compare!.querySelector('.text-positive')!
    expect(delta).not.toBeNull()
    expect(delta.querySelector('[aria-hidden="true"]')!.textContent).toBe('▲ ')
    expect(within(compare!).getByText('늘어남').className.split(' ')).toEqual(expect.arrayContaining(['text-small', 'font-medium']))
  })

  it('AC-4106.1: 칸 모양·나눔 줄·휴대폰 2칸 × 2줄은 첫 줄과 같다', () => {
    const container = drawWith(MOCKUP)
    const [first, second] = grids(container)
    const classes = (el: Element) => el.className.split(' ').filter(Boolean)
    expect(classes(second!)).toEqual(expect.arrayContaining(['grid', 'grid-cols-4', 'border-b', 'border-line', 'max-md:grid-cols-2', 'max-md:[&_.text-metric]:text-heading-m']))
    expect(classes(second!)).not.toContain('mt-2')
    expect([...second!.children].map((el) => el.className)).toEqual([...first!.children].map((el) => el.className))
    expect(second!.querySelectorAll('.text-metric')).toHaveLength(4)
  })

  it('AC-4106.2: 확인 필요한 날이 없으면 `없음`이고 아래 글이 없다', () => {
    const container = drawWith([TOTAL, PER_VISIT, cell('unchecked', '확인 필요한 날', '없음', null, null, 'ink'), COMPARE])
    const unchecked = cellsOf(container)[2]!
    expect(unchecked.textContent).toBe('확인 필요한 날없음')
    expect(unchecked.querySelectorAll('p')).toHaveLength(1)
  })

  it('AC-4106.2: 줄어듦은 ▼ + 글 + `줄어듦`이고 빨강(text-negative)이다', () => {
    const container = drawWith([TOTAL, PER_VISIT, UNCHECKED, cell('compare', '비교 기간보다', '60만 원 (−0.4%)', null, '지난 30일 매출 1억 3,321만 원', 'down', '줄어듦')])
    const compare = cellsOf(container)[3]!
    expect(compare.textContent).toBe('비교 기간보다▼ 60만 원 (−0.4%)줄어듦지난 30일 매출 1억 3,321만 원')
    expect(compare.querySelector('.text-negative')).not.toBeNull()
  })

  it('AC-4106.2: 변화 없음은 화살표 없이 글자만이다', () => {
    const container = drawWith([TOTAL, PER_VISIT, UNCHECKED, cell('compare', '비교 기간보다', '변화 없음', null, '지난 30일 매출 1억 3,261만 원', 'flat')])
    const compare = cellsOf(container)[3]!
    expect(compare.textContent).toBe('비교 기간보다변화 없음지난 30일 매출 1억 3,261만 원')
    expect(compare.textContent).not.toMatch(/[▲▼]/)
  })

  it('AC-4106.2: 견주지 않으면 `–`와 `비교할 자료가 없어요`다', () => {
    const container = drawWith([TOTAL, PER_VISIT, UNCHECKED, cell('compare', '비교 기간보다', '–', null, '비교할 자료가 없어요', 'none')])
    const compare = cellsOf(container)[3]!
    expect(compare.textContent).toBe('비교 기간보다–비교할 자료가 없어요')
    expect(within(compare).getByText('–').className).toContain('text-muted')
  })

  it.each<[string, 'reading' | 'read-failed', string]>([
    ['읽는 중', 'reading', '불러오는 중'],
    ['읽기 실패', 'read-failed', '자료 없음'],
  ])('AC-4106.3: 매출을 %s이면 네 칸 모두 값 `–`이고 아래 글은 그 글이다. 환자 첫 줄은 바뀌지 않는다', (_name, state, note) => {
    const plain = render(<PeriodSummary input={inputOf(UP, WHOLE)} saved />).container
    const firstRow = grids(plain)[0]!.outerHTML
    cleanup()
    const container = drawWith(revenueCells(state))
    expect(cellsOf(container).map((el) => el.textContent)).toEqual([`매출–${note}`, `건당 진료비–${note}`, `확인 필요한 날–${note}`, `비교 기간보다–${note}`])
    for (const el of cellsOf(container)) expect(within(el).getByText('–').className).toContain('text-muted')
    expect(grids(container)[0]!.outerHTML).toBe(firstRow)
  })

  it('AC-4106.3: 저장된 매출이 없음(자료 없음 칸 넷)도 네 칸 모두 `–` · `자료 없음`이다', () => {
    const blank = (key: RevenueCell['key'], label: string) => cell(key, label, '–', null, '자료 없음', 'none')
    const container = drawWith([blank('total', '매출'), blank('perVisit', '건당 진료비'), blank('unchecked', '확인 필요한 날'), blank('compare', '비교 기간보다')])
    expect(cellsOf(container).map((el) => el.textContent)).toEqual(['매출–자료 없음', '건당 진료비–자료 없음', '확인 필요한 날–자료 없음', '비교 기간보다–자료 없음'])
  })

  it('AC-4106.4: 고른 기간은 칸 이름·글이 비교 이름(`9월보다` · `9월 매출 …`)이고 작년 비교 칸 없이 네 칸이다(첫 줄이 다섯 칸이어도 둘째 줄은 같은 4칸 격자)', () => {
    const input: StatsInput = {
      days: [day('2026-09-07', 30), day('2026-10-05', 40)],
      covered: [{ from: '2026-09-01', to: '2026-10-31' }],
      range: rangeOf('2026-11-06', { kind: 'month', unit: 'day', month: '2026-10' }, false),
    }
    const picked = [TOTAL, PER_VISIT, UNCHECKED, cell('compare', '9월보다', '60만 원 (+0.4%)', null, '9월 매출 1억 3,200만 원', 'up', '늘어남')]
    const container = drawWith(picked, input)
    const [first, second] = grids(container)
    expect(first!.className).toContain('grid-cols-5')
    expect(second!.className.split(' ')).toEqual(expect.arrayContaining(['grid-cols-4', 'max-md:grid-cols-2']))
    const labels = cellsOf(container).map((el) => el.querySelector('.text-small')!.textContent)
    expect(labels).toEqual(['매출', '건당 진료비', '확인 필요한 날', '9월보다'])
    expect(cellsOf(container)[3]!.textContent).toContain('9월 매출 1억 3,200만 원')
    expect(revenueGrid(container).textContent).not.toContain('작년')
  })

  it('AC-4106.1: revenue를 주지 않으면 둘째 줄이 없고 지금 마크업 그대로다', () => {
    const container = render(<PeriodSummary input={inputOf(UP, WHOLE)} saved />).container
    expect(grids(container)).toHaveLength(1)
    expect(screen.queryByText('건당 진료비')).toBeNull()
  })
})
