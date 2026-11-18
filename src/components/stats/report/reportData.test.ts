import { describe, expect, it } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import type { DayValue } from '@/lib/analytics/goalPace'
import type { CalCountRow, CalSettings, CalSlotRow } from '@/types/calendar'
import type { DayPayload } from '@/types/payload'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { BitSectionsView, PatientMix } from '@/types/stats'
import { firstReportMonth, monthlyReport, REPORT_TITLES, reportMonths, SAME_AS_BEFORE, type ReportBlock, type ReportInput } from './reportData'

// 월간 보고서 자료 (stats-insights REQ-6108 AC-6108.1~AC-6108.3). 숫자·이름·차트번호는 모두 시험 안에서 지은 가짜다.
// 오늘 2026-11-13 → 고를 수 있는 달 = 2025-12 ~ 2026-11, 넓은 하루 읽기 = 2025-11-13 ~ 2026-11-12

const TODAY = '2026-11-13'
const WIDE_FROM = '2025-11-13'
const HOSPITAL = '튼튼의원'

const G_DOSU: StatsRxGroup = { id: 'g1', name: '도수', codes: ['MM01'], sortOrder: 0 }
const G_SHOCK: StatsRxGroup = { id: 'g2', name: '충격파', codes: ['MM02'], sortOrder: 1 }
const G_STALE: StatsRxGroup = { id: 'g3', name: '주사', codes: ['MM03'], sortOrder: 2 } // 저장된 날에 이 열쇠 줄이 없다(다시 불러오기 전)
const G_EMPTY: StatsRxGroup = { id: 'g4', name: '빈 묶음', codes: [], sortOrder: 3 }
const GROUPS = [G_SHOCK, G_STALE, G_EMPTY, G_DOSU] // 차례는 sortOrder로 정한다
const DOSU = groupKey(G_DOSU.codes, G_DOSU)
const SHOCK = groupKey(G_SHOCK.codes, G_SHOCK)

const line = (id: string, patients: number) => ({ id, patients, newPatients: 0, returning: patients })
function day(ymd: string, patients: number, newPatients: number, groups: DayPayload['groups'] = []): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients, newPatients, returning: patients - newPatients, unknown: 0 },
    rx: [],
    groups,
    revisit: { cohort: newPatients, within7: null, within14: null },
  }
}

// 10월: 내원 1,500 · 신환 100 · 도수 36건 · 충격파 18건. 9월: 1,250 · 100 · 40건 · 25건
const DAYS: DayPayload[] = [
  day('2025-11-20', 300, 10), // 고를 수 있는 달 밖(12달 전 달)
  day('2025-12-01', 400, 20),
  day('2026-08-03', 500, 30, [line(DOSU, 5), line(SHOCK, 5)]),
  day('2026-09-07', 600, 50, [line(DOSU, 20), line(SHOCK, 10)]),
  day('2026-09-08', 650, 50, [line(DOSU, 20), line(SHOCK, 15)]),
  day('2026-10-05', 700, 40, [line(DOSU, 20), line(SHOCK, 10)]),
  day('2026-10-06', 800, 60, [line(DOSU, 16), line(SHOCK, 8)]),
  day('2026-11-02', 100, 5, [line(DOSU, 2), line(SHOCK, 1)]),
]

// 10월 매출 1억 1,820만 원 · 9월 1억 원
const SALES: DayValue[] = [
  { day: '2026-09-07', value: 50_000_000 },
  { day: '2026-09-08', value: 50_000_000 },
  { day: '2026-10-05', value: 60_000_000 },
  { day: '2026-10-06', value: 58_200_000 },
]

const cal = (day: string, staffId: string, staffName: string, status: CalCountRow['status'], auto: CalCountRow['auto'] = null, origDay: string | null = null): CalCountRow => ({
  day,
  staffId,
  staffName,
  kindId: 'dosu',
  kindName: '도수',
  status,
  auto,
  origDay,
})
// 10월: 예약 4 · 취소 1 · 변경 1 · 안 옴 1. 시행자 s1 3건(안 옴 1) · s2 1건
const CAL_ROWS: CalCountRow[] = [
  cal('2026-09-07', 's1', '김시행', 'came'),
  cal('2026-10-05', 's1', '김시행', 'came'),
  cal('2026-10-05', 's1', '김시행', 'cancel'),
  cal('2026-10-06', 's1', '김시행', 'auto', 'noshow'),
  cal('2026-10-06', 's2', '박시행', 'came', null, '2026-10-02'),
]
const SETTINGS: CalSettings = {
  kinds: [{ id: 'dosu', name: '도수', len: 30, color: null }],
  staff: [{ id: 's1', name: '김선생', mark: '김', color: 'blue' }],
  openHour: 9,
  closeHour: 18,
  sunday: false,
}
const CHART = '99001' // 가짜 차트번호: 보고서 어디에도 나오면 안 된다
const SLOT: CalSlotRow = { day: '2026-10-05', staffId: 's1', staffName: '김시행', kindId: 'dosu', kindName: '도수', status: 'came', auto: null, start: 540, len: 60, chart: CHART }

const MIX: PatientMix = { total: { people: 0, visits: 0 }, compared: false, age: [], insurance: [], city: [], town: [] }
const BIT: BitSectionsView = {
  kind: 'ready',
  mix: { all: MIX, new: MIX },
  hours: { hours: [], rows: [], unknown: 0, peak: null },
  doctors: { kind: 'single' },
  dropoff: [
    { group: SHOCK, n: 50, atLeast: [50, 33, 20, 10, 5, 2], ten: 0, once: 17, average: 3.2, drop: 1 },
    { group: 't0000000000000000', n: 500, atLeast: [500, 1, 1, 1, 1, 1], ten: 0, once: 499, average: 1.1, drop: 1 }, // 지금 묶음에 없는 열쇠
    { group: DOSU, n: 100, atLeast: [100, 71, 50, 40, 30, 20], ten: 5, once: 29, average: 4.6, drop: 1 },
  ],
  value: { n: 40, average: 412_000, times: 5.2, perVisit: 79_230, lines: [] },
}

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  month: '2026-10',
  today: TODAY,
  hospitalName: HOSPITAL,
  days: DAYS,
  daysFrom: WIDE_FROM,
  groups: GROUPS,
  sales: SALES,
  goal: { visits: 2000, newPatients: null, revenue: 120_000_000 },
  calendar: { rows: CAL_ROWS, settings: SETTINGS, slots: { rows: [SLOT], offs: [] } },
  bit: BIT,
  ...over,
})
// 칸 열쇠 하나로 좁힌 칸(summary·value처럼 한 모양을 나눠 쓰는 열쇠도 그 모양으로)
const blockOf = <K extends ReportBlock['key']>(blocks: readonly ReportBlock[], key: K) => blocks.find((block): block is ReportBlock & { key: K } => block.key === key)
const keysOf = (over: Partial<ReportInput> = {}) => monthlyReport(input(over)).blocks.map((block) => block.key)

describe('AC-6108.1: 고를 달', () => {
  it('AC-6108.1: 이번 달을 넣은 최근 12달 가운데 저장된 하루 숫자가 있는 달만, 새 달부터다(12달 전 달은 줄이 있어도 빠진다)', () => {
    expect(reportMonths(DAYS, TODAY)).toEqual(['2026-11', '2026-10', '2026-09', '2026-08', '2025-12'])
  })

  it('AC-6108.1: 처음 고른 달은 지난달이고, 지난달이 저장돼 있지 않으면 가장 최근 저장된 달, 없으면 null이다', () => {
    expect(firstReportMonth(['2026-11', '2026-10', '2026-09'], TODAY)).toBe('2026-10')
    expect(firstReportMonth(['2026-11', '2026-09'], TODAY)).toBe('2026-11')
    expect(firstReportMonth(['2026-09', '2026-08'], TODAY)).toBe('2026-09')
    expect(firstReportMonth([], TODAY)).toBeNull()
  })
})

describe('AC-6108.2: 보고서 칸', () => {
  it('AC-6108.2: 제목은 `{Y}년 {M}월 통계 보고`, 아래 줄은 `{병원 이름} · {M}월 {D}일 뽑음`(오늘)이다', () => {
    const report = monthlyReport(input())
    expect(report.title).toBe('2026년 10월 통계 보고')
    expect(report.sub).toBe('튼튼의원 · 11월 13일 뽑음')
  })

  it('AC-6108.2: 자료가 다 있으면 열 칸이 명세 차례이고 제목이 명세 글자 그대로다', () => {
    const { blocks } = monthlyReport(input())
    expect(blocks.map((block) => block.key)).toEqual(['summary', 'goal', 'changes', 'trend', 'treatments', 'calendar', 'staff', 'dropoff', 'value', 'occupancy'])
    expect(blocks.map((block) => block.title)).toEqual([
      '한 달 요약',
      '목표',
      '달라진 것',
      '내원 흐름 (최근 12달)',
      '치료별',
      '예약',
      '시행자별',
      '몇 번까지 받나',
      '신환 1명당 매출',
      '예약 빈자리 (최근 8주)',
    ])
    expect(blocks.map((block) => block.title)).toEqual(blocks.map((block) => REPORT_TITLES[block.key]))
  })

  it('AC-6108.2: 한 달 요약 = 그 달 저장된 하루 내원·신환의 합 · 매출(하루 매출 합) · 예약 안 옴(안 옴 ÷ 예약, 예약 칸과 같은 비율 글)', () => {
    expect(blockOf(monthlyReport(input()).blocks, 'summary')?.cells).toEqual([
      { name: '내원', value: '1,500' },
      { name: '신환', value: '100' },
      { name: '매출', value: '1억 1,820만 원' },
      { name: '예약 안 옴', value: '25.0%' },
    ])
  })

  it('AC-6108.2: 목표 = 목표가 있는 지표만 `{이름} {그 달 값} / 목표 {목표} · {달성률}%`(버림 정수)', () => {
    expect(blockOf(monthlyReport(input()).blocks, 'goal')?.items).toEqual(['내원 1,500명 / 목표 2,000명 · 75%', '매출 1억 1,820만 원 / 목표 1억 2,000만 원 · 98%'])
    expect(blockOf(monthlyReport(input({ goal: { visits: null, newPatients: 80, revenue: null } })).blocks, 'goal')?.items).toEqual(['신환 100명 / 목표 80명 · 125%'])
  })

  it('AC-6108.2: 달라진 것 = 지난달보다 10% 이상 달라진 내원·신환·매출·묶음 건수(반올림 정수 %), ▲ 많아요 · ▼ 적어요', () => {
    expect(blockOf(monthlyReport(input()).blocks, 'changes')?.changes).toEqual([
      { dir: 'up', text: '내원 · 9월보다 20% 많아요 (1,250명 → 1,500명)' },
      { dir: 'up', text: '매출 · 9월보다 18% 많아요 (1억 원 → 1억 1,820만 원)' },
      { dir: 'down', text: '도수 · 9월보다 10% 적어요 (40건 → 36건)' },
      { dir: 'down', text: '충격파 · 9월보다 28% 적어요 (25건 → 18건)' },
    ])
  })

  it('AC-6108.4: 10% 이상은 반올림하기 전 값으로 본다 — 9.5%는 빼고(반올림하면 10%여도), 꼭 10%는 넣는다. 글의 %만 반올림 정수다', () => {
    const changes = (before: number, now: number) =>
      blockOf(monthlyReport(input({ days: [day('2026-09-07', before, 0), day('2026-10-05', now, 0)], sales: null, groups: [] })).blocks, 'changes')?.changes
    expect(changes(200, 219)).toEqual([]) // 9.5% 많음
    expect(changes(200, 181)).toEqual([]) // 9.5% 적음
    expect(changes(200, 220)).toEqual([{ dir: 'up', text: '내원 · 9월보다 10% 많아요 (200명 → 220명)' }])
    expect(changes(200, 180)).toEqual([{ dir: 'down', text: '내원 · 9월보다 10% 적어요 (200명 → 180명)' }])
    expect(changes(1000, 1104)).toEqual([{ dir: 'up', text: '내원 · 9월보다 10% 많아요 (1,000명 → 1,104명)' }]) // 10.4% → 글은 10%
  })

  // 이번 달 보고서(오늘 11월 13일 → 어제 11월 12일): 10월은 1일~12일만 견준다. 오늘(11월 13일) 줄은 받아도 세지 않는다
  const SAME_DAY_DAYS: DayPayload[] = [
    day('2026-10-05', 300, 20, [line(DOSU, 10)]),
    day('2026-10-12', 100, 10, [line(DOSU, 10)]), // 같은 날짜 — 든다
    day('2026-10-13', 900, 50, [line(DOSU, 30)]), // 같은 날짜 뒤 — 이번 달 보고서에서는 빠진다
    day('2026-10-31', 500, 40, [line(DOSU, 20)]),
    day('2026-11-02', 250, 15, [line(DOSU, 11)]),
    day('2026-11-12', 190, 15, [line(DOSU, 10)]),
    day(TODAY, 999, 99, [line(DOSU, 50)]), // 오늘(진료 중) — 빠진다
  ]
  const SAME_DAY_SALES: DayValue[] = [
    { day: '2026-10-05', value: 10_000_000 },
    { day: '2026-10-12', value: 10_000_000 },
    { day: '2026-10-13', value: 80_000_000 },
    { day: '2026-11-02', value: 9_000_000 },
    { day: '2026-11-12', value: 9_000_000 },
    { day: TODAY, value: 50_000_000 },
  ]
  const sameDay = (over: Partial<ReportInput> = {}) =>
    monthlyReport(input({ month: '2026-11', days: SAME_DAY_DAYS, sales: SAME_DAY_SALES, groups: [G_DOSU], calendar: null, bit: null, ...over })).blocks

  it('AC-6108.4: 이번 달 보고서의 한 달 숫자는 1일~어제의 합(매출도 어제까지)이고 목표 달성률도 그 값이다 — 오늘 줄은 받아도 세지 않는다', () => {
    const blocks = sameDay({ goal: { visits: 880, newPatients: null, revenue: 36_000_000 } })
    expect(blockOf(blocks, 'summary')?.cells).toEqual([
      { name: '내원', value: '440' },
      { name: '신환', value: '30' },
      { name: '매출', value: '1,800만 원' },
    ])
    expect(blockOf(blocks, 'goal')?.items).toEqual(['내원 440명 / 목표 880명 · 50%', '매출 1,800만 원 / 목표 3,600만 원 · 50%'])
    expect(blockOf(blocks, 'treatments')?.items).toEqual(['도수 21건'])
  })

  it("AC-6108.4: 이번 달 보고서의 '달라진 것'은 지난달 1일~같은 날짜(10월 1일~12일)와 견준다 — 같은 날짜 뒤(10월 13일·31일)는 견주지 않는다", () => {
    // 내원 440 vs 400(+10%) · 신환 30 vs 30 · 매출 1,800만 vs 2,000만(-10%) · 도수 21 vs 20(+5%)
    expect(blockOf(sameDay(), 'changes')?.changes).toEqual([
      { dir: 'up', text: '내원 · 10월보다 10% 많아요 (400명 → 440명)' },
      { dir: 'down', text: '매출 · 10월보다 10% 적어요 (2,000만 원 → 1,800만 원)' },
    ])
  })

  it("AC-6108.4: 지난달에 같은 날짜가 없으면 지난달 말일까지와 견준다(오늘 3월 31일 → 3월 1일~30일 vs 2월 1일~28일)", () => {
    const days = [day('2026-02-27', 100, 0), day('2026-02-28', 100, 0), day('2026-03-30', 220, 0), day('2026-03-31', 999, 0)]
    const blocks = monthlyReport(input({ month: '2026-03', today: '2026-03-31', daysFrom: '2025-03-31', days, sales: null, groups: [], calendar: null, bit: null, goal: null })).blocks
    expect(blockOf(blocks, 'summary')?.cells).toEqual([
      { name: '내원', value: '220' },
      { name: '신환', value: '0' },
    ])
    expect(blockOf(blocks, 'changes')?.changes).toEqual([{ dir: 'up', text: '내원 · 2월보다 10% 많아요 (200명 → 220명)' }])
  })

  it("AC-6108.4: 다 지난 달(10월)을 고르면 지금처럼 두 달 전체를 견준다 — 10월 13일·31일도 든다", () => {
    const blocks = sameDay({ month: '2026-10', days: [day('2026-09-10', 1600, 100, [line(DOSU, 70)]), ...SAME_DAY_DAYS], sales: null })
    expect(blockOf(blocks, 'summary')?.cells.slice(0, 2)).toEqual([
      { name: '내원', value: '1,800' },
      { name: '신환', value: '120' },
    ])
    expect(blockOf(blocks, 'changes')?.changes).toEqual([
      { dir: 'up', text: '내원 · 9월보다 13% 많아요 (1,600명 → 1,800명)' },
      { dir: 'up', text: '신환 · 9월보다 20% 많아요 (100명 → 120명)' },
    ])
  })

  it(`AC-6108.2: 견줄 수 있는데 10% 넘게 달라진 것이 없으면 줄이 없고 화면은 '${SAME_AS_BEFORE}'를 쓴다`, () => {
    const same = [day('2026-09-07', 1450, 98, [line(DOSU, 35), line(SHOCK, 18)]), day('2026-10-05', 1500, 100, [line(DOSU, 36), line(SHOCK, 18)])]
    const block = blockOf(monthlyReport(input({ days: same, sales: null })).blocks, 'changes')
    expect(block?.changes).toEqual([])
    expect(SAME_AS_BEFORE).toBe('지난달과 비슷해요')
  })

  it('AC-6108.2: 내원 흐름 = 이번 달을 넣은 최근 12달 달마다 내원 합(줄 없는 달은 null), 고른 달 표시', () => {
    const bars = blockOf(monthlyReport(input()).blocks, 'trend')?.bars ?? []
    expect(bars.map((bar) => bar.month)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ])
    expect(bars.map((bar) => bar.value)).toEqual([400, null, null, null, null, null, null, null, 500, 1250, 1500, 100])
    expect(bars.map((bar) => bar.label)).toEqual(['12월', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월'])
    expect(bars.filter((bar) => bar.picked).map((bar) => bar.month)).toEqual(['2026-10'])
  })

  it('AC-6108.2: 치료별 = 묶음 차례(sortOrder)로 그 달 묶음 건수 `{묶음} {n}건`. 처방 없는 묶음과 그 달을 그 열쇠로 세지 않은 묶음은 없다', () => {
    expect(blockOf(monthlyReport(input()).blocks, 'treatments')?.items).toEqual(['도수 36건', '충격파 18건'])
  })

  it('AC-6108.2: 예약 = 그 달 예약 수·취소·변경·안 옴, 시행자별 = 시행자마다 예약 수·안 옴(설정의 이름, 없으면 예약에 적힌 이름)', () => {
    const { blocks } = monthlyReport(input())
    expect(blockOf(blocks, 'calendar')?.items).toEqual(['예약 4건', '취소 1건 (25.0%)', '변경 1건 (25.0%)', '안 옴 1건 (25.0%)'])
    expect(blockOf(blocks, 'staff')?.items).toEqual(['김선생 3건 · 안 옴 33.3%', '박시행 1건 · 안 옴 0.0%'])
  })

  it('AC-6108.2: 몇 번까지 받나 = 지금 묶음 이름이 있는 줄만 대상이 많은 순 `{묶음} 1회만 {p}% · 평균 {a}회 ({n}명)`', () => {
    expect(blockOf(monthlyReport(input()).blocks, 'dropoff')?.items).toEqual(['도수 1회만 29% · 평균 4.6회 (100명)', '충격파 1회만 34% · 평균 3.2회 (50명)'])
  })

  it('AC-6108.2: 신환 1명당 매출 = 세 칸(평균 · 내원 횟수 · 한 번 올 때)', () => {
    expect(blockOf(monthlyReport(input()).blocks, 'value')?.cells).toEqual([
      { name: '신환 1명당 평균 (90일)', value: '41만 원' },
      { name: '신환 1명당 내원 횟수 (90일)', value: '5.2회' },
      { name: '한 번 올 때 평균', value: '7만 원' },
    ])
  })

  it('AC-6108.2·AC-6105.1: 예약 빈자리 = 최근 8주 늘 비는 시간·꽉 차는 시간(있는 것만). 8주 동안 예약이 없던 시간(빈 칸)은 들지 않는다', () => {
    // 10월 5일(월) 9시 예약 하나 → 60분 ÷ (8일 × 1명 × 60분) = 12.5% → 13%. 다른 칸은 예약이 없어 빈 칸
    expect(blockOf(monthlyReport(input()).blocks, 'occupancy')?.items).toEqual(['늘 비는 시간: 월 9시 13%'])
  })
})

describe('AC-6108.3: 자료가 없는 칸은 제목까지 뺀다', () => {
  it('AC-6108.3: 비트에서 안 불러온 기기는 몇 번까지 받나·신환 1명당 매출이 없다', () => {
    expect(keysOf({ bit: null })).toEqual(['summary', 'goal', 'changes', 'trend', 'treatments', 'calendar', 'staff', 'occupancy'])
  })

  it('AC-6108.3: 묶음 줄·대상이 없는 답, 금액 줄이 없는 답(옛 도우미)도 그 칸이 없다', () => {
    const bare: BitSectionsView = { kind: 'ready', mix: { all: MIX, new: MIX }, hours: { hours: [], rows: [], unknown: 0, peak: null }, doctors: { kind: 'single' } }
    expect(keysOf({ bit: bare })).not.toContain('dropoff')
    expect(keysOf({ bit: bare })).not.toContain('value')
    const nobody = keysOf({ bit: { ...BIT, dropoff: [], value: { n: 0, average: 0, times: 0, perVisit: 0, lines: [] } } })
    expect(nobody).not.toContain('dropoff')
    expect(nobody).not.toContain('value')
    expect(keysOf({ bit: { kind: 'old-helper' } })).not.toContain('dropoff')
  })

  it('AC-6108.3: 목표 없는 달(세 값 모두 빈 값)·목표를 모름(null)이면 목표 칸이 없다', () => {
    expect(keysOf({ goal: { visits: null, newPatients: null, revenue: null } })).not.toContain('goal')
    expect(keysOf({ goal: null })).not.toContain('goal')
  })

  it('AC-6108.3: 매출을 모르면 한 달 요약에 매출 칸이 없고, 매출 목표만 있으면 목표 칸도 없다', () => {
    const report = monthlyReport(input({ sales: null, goal: { visits: null, newPatients: null, revenue: 1000 } }))
    expect(blockOf(report.blocks, 'summary')?.cells.map((cell) => cell.name)).toEqual(['내원', '신환', '예약 안 옴'])
    expect(report.blocks.map((block) => block.key)).not.toContain('goal')
  })

  it('AC-6108.3: 예약 없는 달은 예약·시행자별 칸과 한 달 요약의 예약 안 옴이 없다(예약 칸을 읽지 못한 기기도)', () => {
    for (const calendar of [{ rows: CAL_ROWS.filter((row) => !row.day.startsWith('2026-10')), settings: SETTINGS, slots: null }, null]) {
      const report = monthlyReport(input({ calendar }))
      expect(report.blocks.map((block) => block.key)).not.toContain('calendar')
      expect(report.blocks.map((block) => block.key)).not.toContain('staff')
      expect(blockOf(report.blocks, 'summary')?.cells.map((cell) => cell.name)).toEqual(['내원', '신환', '매출'])
    }
  })

  it('AC-6108.3: 이번 달·지난달이 아닌 달은 예약 빈자리 칸이 없다(이번 달은 있다)', () => {
    expect(keysOf({ month: '2026-09' })).not.toContain('occupancy')
    expect(keysOf({ month: '2026-11' })).toContain('occupancy')
  })

  it('AC-6108.3: 예약 빈자리는 빈자리 줄·설정·시행자·예약이 없으면 없다', () => {
    expect(keysOf({ calendar: { rows: CAL_ROWS, settings: SETTINGS, slots: null } })).not.toContain('occupancy')
    expect(keysOf({ calendar: { rows: CAL_ROWS, slots: { rows: [SLOT], offs: [] } } })).not.toContain('occupancy')
    expect(keysOf({ calendar: { rows: CAL_ROWS, settings: { ...SETTINGS, staff: [] }, slots: { rows: [SLOT], offs: [] } } })).not.toContain('occupancy')
    expect(keysOf({ calendar: { rows: CAL_ROWS, settings: SETTINGS, slots: { rows: [], offs: [] } } })).not.toContain('occupancy')
  })

  it('AC-6108.3: 지난달 숫자가 다 없으면(넓은 읽기 앞 달·저장 안 됨) 내원·신환·묶음은 견주지 않고, 견줄 것이 하나도 없으면 달라진 것 칸이 없다', () => {
    // 2025-12의 앞 달 2025-11은 넓은 읽기(11월 13일부터)에 다 들지 않는다
    expect(keysOf({ month: '2025-12', sales: null })).not.toContain('changes')
    // 2026-08의 앞 달 7월은 저장된 날이 없다
    expect(keysOf({ month: '2026-08', sales: null })).not.toContain('changes')
    // 매출은 두 달 다 있으면 견준다
    const sales = [...SALES, { day: '2026-07-01', value: 10_000_000 }, { day: '2026-08-03', value: 30_000_000 }]
    expect(blockOf(monthlyReport(input({ month: '2026-08', sales })).blocks, 'changes')?.changes).toEqual([{ dir: 'up', text: '매출 · 7월보다 200% 많아요 (1,000만 원 → 3,000만 원)' }])
  })

  it('AC-6108.3: 그 달 묶음 줄이 없으면(저장된 날에 묶음을 세지 않음) 치료별 칸이 없다', () => {
    expect(keysOf({ month: '2025-12', sales: null })).not.toContain('treatments')
  })

  it('AC-6108.3: 보고서에는 차트번호·예약의 환자 칸이 한 글자도 없다(숫자·묶음·시행자 이름만)', () => {
    const text = JSON.stringify(monthlyReport(input()))
    expect(text).not.toContain(CHART)
    expect(text).not.toContain('chart')
  })
})
