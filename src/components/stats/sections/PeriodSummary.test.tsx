// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import type { StatsPick } from '@/components/stats/periodPick'
import { rangeOf, statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { nestedBoxes } from '@/testing/boxes'
import type { ClinicReportNumbers } from '@/types/clinicReport'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { RxGroup } from '@/types/rxGroups'
import type { RxSplitView } from '@/types/stats'
import { PeriodSummary } from './PeriodSummary'
import type { ReportData } from './ReportSection'
import { StatsSections } from './StatsSections'

// 환자 요약(first90 REQ-4403, 옛 기간 요약) + 섹션 차례 (stats REQ-513 AC-513.1·513.2·513.4·513.9, rx-picker AC-801.1, treatment-trend AC-1201.1·AC-1213.1, 시안 notes.md §2·§3·§4). 가짜 일 줄은 이 파일 안에서만 만든다
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

// 도우미 v4 날(first90 있음, spec first90 REQ-4402). patients = 신환 + 90일초진 + 재진
function day90(ymd: string, newPatients: number, first90: number, returning: number): DayPayload {
  return { ...day(ymd, newPatients + first90 + returning), totals: { patients: newPatients + first90 + returning, newPatients, returning, unknown: 0, first90 } }
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

describe('AC-513.1·AC-801.1·AC-1201.1·AC-4003.1·AC-4411.1: 섹션 차례', () => {
  // first90 AC-4411.1: 요약 자리 → 큰 카드(환자 · 매출 · 처방 · 진료 운영 · 보고). 처방 세 칸은 처방 카드 + 탭 셋이다(stats-pc-ux AC-4003.1).
  // 카드 안 작은 칸(h3) 이름은 각 칸 시험이 본다. 매출 카드는 revenue를, 비트 칸은 bit를 줄 때만 있다
  const PLACES = [
    ['stats-summary', '환자 요약'],
    ['stats-patients', '환자'],
    ['stats-rx', '처방'],
    ['stats-ops', '진료 운영'],
    ['stats-report', '원장님 보고 문장'],
  ]
  const titleOf = (el: Element) => document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ?? null
  const places = () => [...document.querySelectorAll('section[id^="stats-"]')].map((el) => [el.id, titleOf(el)])
  const draw = (saved: boolean) =>
    render(
      <StatsSections input={inputOf(saved ? [day('2026-11-02', 10)] : [], saved ? WHOLE : [])} saved={saved} split={null} hospitalName="튼튼의원" report={null} groups={GROUPS} />,
    )

  it('AC-513.1·AC-801.1·AC-1201.1·AC-4003.1·AC-4411.1: 요약 → 카드 넷이 승인본 차례다. 처방 추세 · 처방별 추세 · 처방별 신환·재진 · 처방 골라 보기는 제목이 아니다', () => {
    draw(true)
    expect(places()).toEqual(PLACES)
    expect(screen.queryByRole('heading', { name: '처방 추세' })).toBeNull()
    for (const name of ['처방별 추세', '처방별 신환·재진', '처방 골라 보기']) expect(screen.queryByRole('heading', { name, hidden: true }), name).toBeNull()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['묶음별 추세', '처방별 신환·재진', '처방 골라 보기'])
  })

  it('AC-513.1·AC-801.1·AC-1201.1·AC-4003.1·AC-4411.1: 저장된 숫자가 없어도 차례가 같다', () => {
    draw(false)
    expect(places()).toEqual(PLACES)
    expect(screen.queryByRole('heading', { name: '처방 추세' })).toBeNull()
  })

  it('AC-4411.1: 카드는 나란히 놓지 않고 한 줄씩 쌓는다(12칸 배치·세로선 없음)', () => {
    draw(true)
    for (const [id] of PLACES) {
      const className = document.getElementById(id)!.className
      expect(className, id).not.toMatch(/col-span-|lg:border-l/)
    }
  })

  it('AC-1201.1·AC-3708.7·AC-4411.3: 처방 카드 머리 줄에 승인본 옆 글이 있고 [묶음 고치기]는 처방 카드 안에 있다(group-exclude AC-3708.7 글자)', () => {
    draw(true)
    const rx = document.getElementById('stats-rx')!
    const head = document.getElementById(rx.getAttribute('aria-labelledby')!)!.parentElement!
    expect(within(head).getAllByText('만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건').length).toBeGreaterThan(0)
    expect(within(rx).getByRole('button', { name: '묶음 고치기' })).toBeTruthy()
  })

  it('AC-4002.6·AC-4411.2: 바로가기 자리 section마다 id와 띠에 가리지 않는 scroll-margin이 있고, 안쪽(탭 안 칸 포함)에는 id가 없다', () => {
    const { container } = render(
      <StatsSections input={inputOf([day('2026-11-02', 10)], WHOLE)} saved split={null} hospitalName="튼튼의원" report={null} groups={GROUPS} bit={null} />,
    )
    expect(places()).toEqual(PLACES)
    for (const [id] of PLACES) {
      expect(document.getElementById(id)!.tagName, id).toBe('SECTION')
      expect(document.getElementById(id)!.className.split(' '), id).toEqual(expect.arrayContaining(['scroll-mt-41', 'max-md:scroll-mt-40']))
    }
    expect(container.querySelectorAll('[id^="stats-"]')).toHaveLength(PLACES.length)
    // 탭 안 칸(묶음별 추세 · 처방별 신환·재진 · 처방 골라 보기)은 제목 칸이 아니다(숨은 패널 포함)
    const rx = container.querySelector<HTMLElement>('#stats-rx')!
    const titles = within(rx).queryAllByRole('heading', { hidden: true }).map((h) => h.textContent)
    for (const name of ['처방별 추세', '처방별 신환·재진', '처방 골라 보기']) expect(titles, name).not.toContain(name)
  })

  // stats-revenue: 매출 값(useStatsRevenue 값 + 마지막 끝난 날)을 주면 `매출` 카드가 환자 카드 다음 · 처방 카드 앞에 있고 환자 요약 바로 다음에 매출 요약 카드가 있다(first90 AC-4408.2, 옛 기간 요약 둘째 줄).
  // 주지 않으면 매출 카드가 없다(위 시험)
  const REVENUE_READY = { state: 'ready' as const, days: [], codes: [], monthCodes: [], noDayCodes: false, lastDay: '2026-11-12', onReread: () => undefined }
  const WITH_REVENUE = [PLACES[0], PLACES[1], ['stats-revenue', '매출'], ...PLACES.slice(2)]
  const drawWithRevenue = (revenue: Omit<typeof REVENUE_READY, 'state'> & { state: 'reading' | 'ready' | 'read-failed' } = REVENUE_READY) =>
    render(
      <StatsSections input={inputOf([day('2026-11-02', 10)], WHOLE)} saved split={null} hospitalName="튼튼의원" report={null} groups={GROUPS} bit={null} revenue={revenue} />,
    )
  // 매출 요약(first90 AC-4408.2): 환자 요약 바로 다음 큰 카드(바로가기 자리는 환자 요약과 같은 stats-summary 한 자리)
  const revenueSummary = () => screen.queryByRole('heading', { level: 2, name: '매출 요약' })?.closest('section') ?? null
  const revenueSummaryCells = () => [...revenueSummary()!.querySelector('.grid')!.children].map((cell) => cell.textContent)

  it('AC-4109.1·AC-4107.1·AC-4411.1: 매출 값을 주면 `매출` 카드가 환자 카드 다음 · 처방 카드 앞(바로가기 자리 id stats-revenue)이다', () => {
    const { container } = drawWithRevenue()
    expect(places()).toEqual(WITH_REVENUE)
    expect(document.getElementById('stats-revenue')!.className.split(' ')).toEqual(expect.arrayContaining(['scroll-mt-41', 'max-md:scroll-mt-40']))
    expect(container.querySelectorAll('[id^="stats-"]')).toHaveLength(WITH_REVENUE.length)
  })

  it('AC-4109.1·AC-4106.3·AC-6904.1·AC-6904.4: 매출 값을 주면 환자 요약 바로 다음에 매출 요약(칸 둘)이 있고, 주지 않으면 매출 카드·매출 요약이 없다', () => {
    drawWithRevenue()
    expect(document.getElementById('stats-summary')!.nextElementSibling).toBe(revenueSummary())
    expect(revenueSummary()!.id).toBe('')
    expect(revenueSummaryCells()).toEqual(['총매출–자료 없음', '건당 진료비–자료 없음'])
    expect(screen.getByRole('heading', { level: 2, name: '매출' }).closest('section')!.textContent).toBe('매출자료 없음 · 불러오면 이 기간의 매출이 하루씩 막대로 그려져요.')
    cleanup()

    render(<StatsSections input={inputOf([day('2026-11-02', 10)], WHOLE)} saved split={null} hospitalName="튼튼의원" report={null} groups={GROUPS} bit={null} />)
    expect(places()).toEqual(PLACES)
    expect(revenueSummary()).toBeNull()
  })

  it('AC-4107.1·AC-4106.3·AC-6904.4: 매출을 읽는 중이면 매출 요약 두 칸과 매출 칸이 `불러오는 중`이고, 읽기 실패면 매출 칸 [다시 읽기]가 매출만 다시 읽는다', () => {
    drawWithRevenue({ ...REVENUE_READY, state: 'reading' })
    expect(revenueSummaryCells()).toEqual(['총매출–불러오는 중', '건당 진료비–불러오는 중'])
    expect(screen.getByRole('heading', { level: 2, name: '매출' }).closest('section')!.textContent).toBe('매출불러오는 중')
    cleanup()

    const onReread = vi.fn()
    drawWithRevenue({ ...REVENUE_READY, state: 'read-failed', onReread })
    const section = screen.getByRole('heading', { level: 2, name: '매출' }).closest('section')!
    expect(within(section).getByRole('alert').textContent).toContain('E-STATS-READ-FAILED')
    fireEvent.click(within(section).getByRole('button', { name: '다시 읽기' }))
    expect(onReread).toHaveBeenCalledTimes(1)
  })

  it('AC-513.1·AC-4403.1·AC-4411.3: 환자 요약은 큰 카드(둥근 모서리·옅은 그림자, 위 줄 없음)이고 도구 단추 줄이 없다', () => {
    draw(true)
    const section = screen.getByRole('heading', { level: 2, name: '환자 요약' }).closest('section')!
    expect(section.className.split(' ')).toEqual(expect.arrayContaining(['rounded-st', 'shadow-st-card']))
    expect(section.className).not.toContain('border-t')
    expect(screen.queryByRole('toolbar')).toBeNull()
  })
})

describe('AC-513.1·AC-513.2·AC-4403.1·AC-4403.2·AC-4403.3: 환자 요약 숫자 칸', () => {
  // 지난 기간 하루 100명, 이번 기간 하루 110명(옛 자료: first90 없음 → 90일초진 확인 불가)
  const UP = [day('2026-09-21', 100), day('2026-11-02', 110)]
  // 도우미 v4 날(first90 있음)
  const KNOWN = [day90('2026-09-21', 10, 20, 70), day90('2026-11-02', 12, 18, 80)]
  const SUMMARY_DESC = '접수 기준 · 같은 분이 여러 번 오면 여러 건 · 증감은 지난 30일과 비교'

  it('AC-513.1·AC-4403.1: 큰 카드 h2 "환자 요약" + 옆 글이고, first90이 모두 있으면 칸 넷이 승인본 글이다', () => {
    render(<PeriodSummary input={inputOf(KNOWN, WHOLE)} saved />)
    const heading = screen.getByRole('heading', { level: 2, name: '환자 요약' })
    expect(within(heading.parentElement!).getByText(SUMMARY_DESC)).toBeTruthy()
    expect(heading.closest('section')!.className.split(' ')).toEqual(expect.arrayContaining(['rounded-st', 'shadow-st-card']))
    expect(cellText('하루 평균 내원')).toBe('하루 평균 내원진료한 날 1일 평균110건▲ 10건 (+10.0%) 늘어남')
    expect(cellText('신환')).toBe('신환처음 온 환자12명▲ 2명 (+20.0%) 늘어남')
    expect(cellText('90일초진')).toBe('90일초진90일 넘어 다시 온 내원18건▼ 2건 (−10.0%) 줄어듦')
    expect(cellText('재진')).toBe('재진그 밖의 내원80건▲ 10건 (+14.2%) 늘어남')
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('AC-4403.1: 옆 글의 과/와는 비교 이름 끝 받침을 따른다', () => {
    const range = statsRange(TODAY, '30d')
    render(<PeriodSummary input={{ days: KNOWN, covered: WHOLE, range: { ...range, previous: { ...range.previous, name: '지난 기간 가' } } }} saved />)
    expect(screen.getByText('접수 기준 · 같은 분이 여러 번 오면 여러 건 · 증감은 지난 기간 가와 비교')).toBeTruthy()
  })

  it('AC-513.1·AC-4403.1: 768px 미만은 두 칸씩 두 줄이고 이름 옆 글은 이름 아래로 내려간다', () => {
    const { container } = render(<PeriodSummary input={inputOf(KNOWN, WHOLE)} saved />)
    const grid = container.querySelector('.grid-cols-4')!
    expect(grid.className.split(' ')).toEqual(expect.arrayContaining(['grid', 'grid-cols-4', 'max-md:grid-cols-2']))
    expect(grid.children).toHaveLength(4)
    expect(screen.getByText('처음 온 환자').className.split(' ')).toContain('max-md:block')
    const cells = [...grid.children].map((el) => el.className.split(' '))
    expect(cells[1]).toEqual(expect.arrayContaining(['border-l', 'border-st-line', 'max-md:border-l-0']))
    for (const i of [2, 3]) expect(cells[i]).toEqual(expect.arrayContaining(['max-md:border-t', 'max-md:pt-3']))
  })

  it('AC-513.2·AC-4403.2: 증감은 칸 안 숫자 아래 한 줄이고 늘어남은 ▲ + 글 + "늘어남", 줄어듦은 ▼ + 글 + "줄어듦"이다(색만 쓰지 않는다)', () => {
    render(<PeriodSummary input={inputOf(UP, WHOLE)} saved />)
    const average = screen.getByText('하루 평균 내원').closest('.grid-cols-4 > div')!
    expect(average.textContent).toBe('하루 평균 내원진료한 날 1일 평균110건▲ 10건 (+10.0%) 늘어남')
    expect(average.querySelector('.text-positive')).not.toBeNull()
    cleanup()
    render(<PeriodSummary input={inputOf([day('2026-09-21', 100), day('2026-11-02', 90)], WHOLE)} saved />)
    const down = screen.getByText('하루 평균 내원').closest('.grid-cols-4 > div')!
    expect(down.textContent).toContain('▼ 10건 (−10.0%) 줄어듦')
    expect(down.querySelector('.text-negative')).not.toBeNull()
  })

  it('AC-513.2·AC-4403.2: 변화 없음은 화살표 없이 글자만이다', () => {
    render(<PeriodSummary input={inputOf([day('2026-09-21', 100), day('2026-11-02', 100)], WHOLE)} saved />)
    expect(cellText('하루 평균 내원')).toBe('하루 평균 내원진료한 날 1일 평균100건변화 없음')
    expect(cellText('신환')).toBe('신환처음 온 환자2명변화 없음')
  })

  it('AC-513.1·AC-4403.2: 견줄 수 없으면 증감 줄 글은 "비교할 자료가 없어요"이고 넷째 칸 "비교 기간보다"는 없다', () => {
    render(<PeriodSummary input={inputOf([day('2026-11-02', 100)], [{ from: '2026-10-14', to: '2026-11-12' }])} saved />)
    expect(cellText('하루 평균 내원')).toBe('하루 평균 내원진료한 날 1일 평균100건비교할 자료가 없어요')
    expect(cellText('신환')).toBe('신환처음 온 환자2명비교할 자료가 없어요')
    expect(screen.queryByText('비교 기간보다')).toBeNull()
  })

  it('AC-4403.3·AC-6907.1: first90이 없는 날이 있으면 90일초진은 "확인 불가" + 옛 도우미 글(증감 없음), 재진은 "90일초진 포함"이고 아래에 안내 글(굵은 글 `90일초진은 새 도우미(0.7.0)가 있어야 보여요.`)과 "새 도우미 내려받기" 링크가 있다', () => {
    render(<PeriodSummary input={inputOf(UP, WHOLE)} saved />)
    expect(cellText('90일초진')).toBe('90일초진확인 불가예전 도우미(0.6.0)는 90일초진을 따로 세지 못해요. 지금은 재진에 들어 있어요.')
    expect(cellText('재진')).toBe('재진90일초진 포함108건▲ 10건 (+10.2%) 늘어남')
    const note = screen.getByRole('note')
    expect(note.textContent).toBe(
      '90일초진은 새 도우미(0.7.0)가 있어야 보여요. 비트 PC 연결 화면에서 새 도우미를 받아 깐 뒤 [비트에서 불러오기]를 다시 누르면 보여요.새 도우미 내려받기',
    )
    expect(within(note).getByText('90일초진은 새 도우미(0.7.0)가 있어야 보여요.').tagName).toBe('STRONG')
    expect(note.textContent).not.toContain('참고 금액')
    expect(within(note).getByRole('link', { name: '새 도우미 내려받기' }).getAttribute('href')).toBe('/settings')
    expect(note.className.split(' ')).toEqual(expect.arrayContaining(['bg-warning-soft', 'text-st-warn-ink', 'rounded-st-sm']))
  })

  it('AC-4403.3: 재진 값은 returning + first90 합이고 그날 first90이 없으면 0으로 더한다', () => {
    render(<PeriodSummary input={inputOf([day90('2026-11-02', 12, 18, 80), day('2026-11-03', 50)], WHOLE)} saved />)
    expect(cellText('재진')).toContain('재진90일초진 포함146건') // (80 + 18) + 48
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

  it('AC-513.1·AC-4403.1: 첫 칸 이름은 "한 달 평균 내원"이고 오늘이 든 달 안내 글이 있다', () => {
    render(<PeriodSummary input={inputOf(ROWS, WHOLE, '12m')} saved />)
    expect(screen.getByText('접수 기준 · 같은 분이 여러 번 오면 여러 건 · 증감은 작년 같은 12달과 비교')).toBeTruthy()
    expect(screen.getByText('한 달 평균 내원')).toBeTruthy()
    expect(screen.getByText('11월은 아직 끝나지 않은 달이라 평균과 견주기에서 빼요(작년 11월도 빼요). 신환·재진 합계에는 넣어요.')).toBeTruthy()
  })

  it('AC-513.1·AC-4403.2: 이번 달만 있으면 평균 칸 "–"·"자료 없음"(증감 줄 없음)·신환은 "비교할 자료가 없어요"·끝난 달 없음 안내다', () => {
    render(<PeriodSummary input={inputOf([day('2026-11-02', 30)], [{ from: '2026-11-02', to: '2026-11-12' }], '12m')} saved />)
    expect(cellText('한 달 평균 내원')).toBe('한 달 평균 내원–자료 없음')
    expect(cellText('신환')).toContain('비교할 자료가 없어요')
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
  it('AC-513.4·AC-4403.1: 저장된 숫자가 없으면 숫자 칸 없이 "자료 없음" + 시안 한 줄이다', () => {
    render(<PeriodSummary input={inputOf([], [])} saved={false} />)
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe('자료 없음 · 숫자를 불러오면 이 기간의 평균 환자 수와 신환·재진이 보여요.')
    expect(screen.queryByText('하루 평균 내원')).toBeNull()
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

  it('AC-513.9·AC-1201.1·AC-4003.2·AC-4413.1: 여섯 섹션을 모두 채우고 모두 열고 처방 탭을 모두 골라도 그린 화면에 상자 안 상자가 없다', () => {
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
    expect(within(container).getAllByRole('heading', { level: 2 })).toHaveLength(5) // 처방 카드 안 RxSection이 제 h2 '처방'을 더는 그리지 않는다(TASK-8, AC-4413.1)
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
describe('AC-1704.1·AC-1704.2·AC-1704.4·AC-4403.2: 고른 기간의 환자 요약', () => {
  const P_TODAY = '2026-11-06'
  const OCT: StatsPick = { kind: 'month', unit: 'day', month: '2026-10' }
  const NOV: StatsPick = { kind: 'month', unit: 'day', month: '2026-11' }
  const pickOf = (pick: StatsPick, days: DayPayload[], covered: DateRange[], todayDone = false): StatsInput => ({ days, covered, range: rangeOf(P_TODAY, pick, todayDone) })
  // 9월·10월은 날마다 덮고 줄은 몇 날만(나머지는 휴진). 작년 10월은 줄도 덮은 기간도 없다
  const SEP_OCT: DateRange[] = [{ from: '2026-09-01', to: '2026-10-31' }]
  const DAYS = [day('2026-09-07', 30), day('2026-10-05', 40), day('2026-10-06', 44)]
  const gridOf = () => screen.getByText('하루 평균 내원').closest('.grid')!
  const labels = () => [...gridOf().children].map((cell) => cell.querySelector('p > span')?.textContent)

  it('AC-1704.4·AC-4403.1: 옆 글은 바로 전 비교 이름이고 칸은 빠르게 보기와 같은 넷이다(비교 칸 없음)', () => {
    render(<PeriodSummary input={pickOf(OCT, DAYS, SEP_OCT)} saved />)
    expect(screen.getByText('접수 기준 · 같은 분이 여러 번 오면 여러 건 · 증감은 9월과 비교')).toBeTruthy()
    expect(labels()).toEqual(['하루 평균 내원', '신환', '90일초진', '재진'])
    expect(screen.queryByText('9월보다')).toBeNull()
  })

  it('AC-1704.1·AC-4403.2: 하루 평균 칸에만 증감이 있고, 작년 비교는 그 아래 둘째 줄 "{작년 이름}보다 …"다(견줄 수 없으면 "비교할 자료가 없어요", 0이 아니다)', () => {
    render(<PeriodSummary input={pickOf(OCT, DAYS, SEP_OCT)} saved />)
    expect(cellText('하루 평균 내원')).toBe('하루 평균 내원진료한 날 2일 평균42건▲ 12건 (+40.0%) 늘어남작년 10월보다 비교할 자료가 없어요')
    expect(cellText('신환')).toBe('신환처음 온 환자4명')
    expect(cellText('재진')).toBe('재진90일초진 포함80건')
    expect(gridOf().textContent).not.toContain('0명')
  })

  it('AC-1704.1·AC-4403.1: PC는 네 칸 한 줄, 휴대폰은 두 칸씩 두 줄이다(빠르게 보기와 같다)', () => {
    render(<PeriodSummary input={pickOf(OCT, DAYS, SEP_OCT)} saved />)
    expect(gridOf().className.split(' ')).toEqual(expect.arrayContaining(['grid-cols-4', 'max-md:grid-cols-2']))
    expect(gridOf().children).toHaveLength(4)
  })

  it('AC-1704.1·AC-4403.2: 해 고르기는 작년 둘째 줄이 없다', () => {
    const covered: DateRange[] = [{ from: '2025-01-01', to: '2026-11-05' }]
    render(<PeriodSummary input={pickOf({ kind: 'year', year: '2026' }, [day('2025-03-02', 20), day('2026-03-02', 30)], covered)} saved />)
    expect(screen.getByText('접수 기준 · 같은 분이 여러 번 오면 여러 건 · 증감은 2025년과 비교')).toBeTruthy()
    expect(cellText('하루 평균 내원')).toBe('하루 평균 내원진료한 날 1일 평균30건▲ 10건 (+50.0%) 늘어남')
  })

  it('AC-1704.2: 고른 기간에 끝나지 않은 날이 있으면 칸 아래에 "자료 없는 날 N일은 빼고 셌어요"가 있다', () => {
    // 11월 1–5일 가운데 2·3일만 줄이 있고 덮은 기간은 10월 31일까지다 → 1·4·5일 셋이 자료 없는 날
    render(<PeriodSummary input={pickOf(NOV, [day('2026-11-02', 40), day('2026-11-03', 44)], SEP_OCT)} saved />)
    expect(screen.getByText('자료 없는 날 3일은 빼고 셌어요')).toBeTruthy()
  })

  it('AC-1704.2: 끝나지 않은 날이 없으면 없다', () => {
    render(<PeriodSummary input={pickOf(OCT, DAYS, SEP_OCT)} saved />)
    expect(screen.queryByText(/자료 없는 날/)).toBeNull()
  })
})

// ── bit-total AC-6904.1·AC-6905.1: 참고 금액 포함 스위치가 없다(옛 first90 AC-4408.1의 두 곳 · 매출 요약 머리 · 매출 카드 머리). 확인 필요로 저장되고 roughTotal이 있는 날은 그냥 더한다 ──
describe('AC-6904.1·AC-6904.2·AC-6905.1: 매출 요약·매출 카드에 스위치가 없다', () => {
  const NULLS = { total: null, insurer: null, noncovered: null, copay: null, otherTotal: null, cash: null, card: null, transfer: null, receivableIn: null }
  const money = (date: string, over: Record<string, unknown> = {}) => ({
    date,
    visits: 10,
    newPatients: 2,
    returnVisits: 8,
    total: 1_000_000,
    insurer: 500_000,
    noncovered: 250_000,
    copay: 200_000,
    otherTotal: 50_000,
    cash: 100_000,
    card: 800_000,
    transfer: 100_000,
    receivableIn: 0,
    unconfirmed: false,
    splitUnconfirmed: false,
    dayCodes: true,
    ...over,
  })
  type Money = ReturnType<typeof money>
  const drawWith = (days: Money[]) =>
    render(
      <StatsSections
        input={inputOf([day('2026-11-02', 10)], WHOLE)}
        saved
        split={null}
        hospitalName="튼튼의원"
        report={null}
        groups={GROUPS}
        bit={null}
        revenue={{ state: 'ready', days, codes: [], monthCodes: [], noDayCodes: false, lastDay: '2026-11-12', onReread: () => undefined }}
      />,
    )
  const revenueSummary = () => screen.getByRole('heading', { level: 2, name: '매출 요약' }).closest('section')!

  it('AC-6904.1·AC-6904.2·AC-6905.1: roughTotal이 있는 확인 필요한 날은 처음부터 총매출에 들고(100만 + 30만 = 130만), 두 카드 어디에도 스위치·`참고 포함` 꼬리표가 없다', () => {
    drawWith([money('2026-11-02'), money('2026-11-03', { ...NULLS, unconfirmed: true, roughTotal: 300_000 })])
    expect(screen.queryByRole('switch')).toBeNull()
    expect(within(revenueSummary()).getByText('130만')).toBeTruthy()
    expect(within(revenueSummary()).queryByText('참고 포함')).toBeNull()
    const card = screen.getByRole('heading', { level: 2, name: '매출' }).closest('section')!
    expect(revenueSummary().textContent).not.toMatch(/참고 금액|참고 포함|확인 필요/)
    expect(card.textContent).not.toMatch(/참고 금액|참고 포함|확인 필요/)
  })

  it('AC-6904.1·AC-6906.1: 금액 모르는 확인 필요한 날(roughTotal 없음)이 있어도 스위치가 없고 그날은 세지 않는다', () => {
    drawWith([money('2026-11-02'), money('2026-11-03', { ...NULLS, unconfirmed: true })])
    expect(screen.queryByRole('switch')).toBeNull()
    expect(within(revenueSummary()).getByText('100만')).toBeTruthy()
    expect(revenueSummary().textContent).not.toMatch(/참고 금액|참고 포함|확인 필요/)
    cleanup()
    drawWith([money('2026-11-02')])
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
