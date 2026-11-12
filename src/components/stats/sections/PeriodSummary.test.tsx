// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import type { StatsPick } from '@/components/stats/periodPick'
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

describe('AC-513.1·AC-801.1·AC-1201.1: 섹션 차례', () => {
  const TITLES = ['기간 요약', '환자 수 추이', '신환 재방문율', '처방별 추세', '처방별 신환·재진', '처방 골라 보기', '원장님 보고 문장', '요일별 환자 수']
  const draw = (saved: boolean) =>
    render(
      <StatsSections input={inputOf(saved ? [day('2026-11-02', 10)] : [], saved ? WHOLE : [])} saved={saved} split={null} hospitalName="튼튼의원" report={null} groups={GROUPS} />,
    )

  it('AC-513.1·AC-801.1·AC-1201.1: 여덟 섹션이 승인본 차례이고 섹션마다 h2다. 처방 추세 h2는 없다', () => {
    draw(true)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(TITLES)
    expect(screen.queryByRole('heading', { name: '처방 추세' })).toBeNull()
  })

  it('AC-513.1·AC-801.1·AC-1201.1: 저장된 숫자가 없어도 차례가 같다', () => {
    draw(false)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(TITLES)
    expect(screen.queryByRole('heading', { name: '처방 추세' })).toBeNull()
  })

  it('AC-513.1·AC-801.1·AC-1201.1: 1024px 이상 배치는 12 / 8·4 / 12 / 12 / 12 / 7·5이고 오른쪽 칸은 왼쪽 선 + 안쪽 24다', () => {
    draw(true)
    const sectionOf = (title: string) => screen.getByRole('heading', { level: 2, name: title }).closest('section')!.className
    expect(sectionOf('기간 요약')).toContain('col-span-12')
    expect(sectionOf('환자 수 추이')).toContain('lg:col-span-8')
    expect(sectionOf('처방 골라 보기')).toContain('col-span-12')
    expect(sectionOf('처방 골라 보기')).not.toContain('lg:')
    expect(sectionOf('원장님 보고 문장')).toContain('lg:col-span-7')
    // 처방별 추세와 처방별 신환·재진은 전체 폭이고 세로선·왼쪽 여백이 없다
    for (const title of ['처방별 추세', '처방별 신환·재진']) {
      expect(sectionOf(title).split(' '), title).toContain('col-span-12')
      expect(sectionOf(title), title).not.toMatch(/(^| )lg:(?:col-span|border-l|pl-)/)
    }
    for (const [title, span] of [
      ['신환 재방문율', 'lg:col-span-4'],
      ['요일별 환자 수', 'lg:col-span-5'],
    ] as const) {
      expect(sectionOf(title)).toContain(span)
      expect(sectionOf(title)).toContain('lg:border-l')
      expect(sectionOf(title)).toContain('lg:pl-6')
    }
  })

  it('AC-1201.1·AC-3708.7: 처방별 추세 칸은 h2 옆에 승인본 설명이 있다(group-exclude AC-3708.7 글자)', () => {
    draw(true)
    const section = screen.getByRole('heading', { level: 2, name: '처방별 추세' }).closest('section')!
    expect(within(section).getByText('만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건')).toBeTruthy()
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

  it('AC-513.9·AC-1201.1: 여덟 섹션을 모두 채우고 모두 열어도 그린 화면에 상자 안 상자가 없다', () => {
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
    expect(screen.getByRole('table', { name: '처방별 신환·재진 (명)' })).toBeTruthy()
    expect(screen.getByText('고생하셨습니다 !!')).toBeTruthy()
    expect(within(container).getAllByRole('heading', { level: 2 })).toHaveLength(8)
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
