// 매출 화면 보기 모양(TASK-8, REQ-008 · AC-008.1~AC-008.7). 자료는 모두 가짜 숫자다(시안 gen.py의 예시와 같은 값). 오늘은 인자로만 준다
import { describe, expect, it } from 'vitest'
import { niceScale } from '@/components/charts/scale'
import { eachDay, monthRange } from '@/lib/analytics/dates'
import { ERRORS } from '@/lib/errors'
import type { RevenueCodeRow, RevenueDayRow } from '@/types/revenue'
import type { RxGroup } from '@/types/rxGroups'
import { buildRevenueView, type Kpi, type RevenueBlocks, type RevenueView, type RevenueViewInput } from './view'

const TODAY = '2026-11-01'
const MONTH = '2026-10'
const FETCHED_AT = '2026-10-31T22:10:00Z' // 한국 시각 11월 1일 07:10
const MONTHS = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const TOTAL = [148_204_120, 152_118_300, 146_305_880, 139_402_150, 135_809_640, 157_603_210, 159_207_730, 154_411_090, 158_806_420, 163_509_870, 159_702_660, 156_104_530, 162_480_350]
const NONCOV = [60_102_400, 62_880_150, 59_204_300, 56_011_820, 55_120_440, 64_330_700, 65_701_220, 63_140_880, 65_402_310, 67_903_150, 65_880_040, 63_801_770, 67_284_150]
const OTHER = [3_702_100, 3_840_220, 3_655_010, 3_480_300, 3_402_660, 3_940_080, 3_980_190, 3_861_270, 3_970_150, 4_088_740, 3_993_060, 3_902_610, 4_206_300]
const VISITS = [2_780, 2_851, 2_744, 2_633, 2_571, 2_903, 2_925, 2_846, 2_902, 2_977, 2_901, 2_846, 2_904]
const INSURER_OCT = 68_604_120
const SEL = 12
const LY = 0

// 쉬는 날: 금액·건수 모두 0, 두 표시 거짓
function restDay(date: string): RevenueDayRow {
  return {
    date,
    visits: 0,
    newPatients: 0,
    returnVisits: 0,
    total: 0,
    insurer: 0,
    noncovered: 0,
    copay: 0,
    otherTotal: 0,
    cash: 0,
    card: 0,
    transfer: 0,
    receivableIn: 0,
    unconfirmed: false,
    splitUnconfirmed: false,
  }
}

// 그날 금액을 셀 수 없는 날: 금액 아홉 칸 null
function uncheckedDay(date: string, visits: number | null = 0): RevenueDayRow {
  return {
    ...restDay(date),
    visits,
    total: null,
    insurer: null,
    noncovered: null,
    copay: null,
    otherTotal: null,
    cash: null,
    card: null,
    transfer: null,
    receivableIn: null,
    unconfirmed: true,
  }
}

// 나눔만 셀 수 없는 날: 나눔 네 칸 null, total은 남음
function noSplitDay(date: string, total = 5_000_000, visits: number | null = 0): RevenueDayRow {
  return { ...restDay(date), visits, total, cash: total, insurer: null, noncovered: null, copay: null, otherTotal: null, splitUnconfirmed: true }
}

// 한 달 줄: 1일에 금액·건수가 다 있고 나머지는 쉬는 날(하루 평균의 나눗수는 그 달 날 수)
function monthRows(index: number): RevenueDayRow[] {
  const month = MONTHS[index]!
  const covered = TOTAL[index]! - NONCOV[index]! - OTHER[index]!
  const insurer = index === SEL ? INSURER_OCT : Math.floor(covered * 0.75)
  return eachDay(monthRange(month)).map((date, i) =>
    i > 0
      ? restDay(date)
      : {
          ...restDay(date),
          visits: VISITS[index]!,
          total: TOTAL[index]!,
          insurer,
          copay: covered - insurer,
          noncovered: NONCOV[index]!,
          otherTotal: OTHER[index]!,
          cash: TOTAL[index]!,
        },
  )
}

const ALL_ROWS = MONTHS.flatMap((_, index) => monthRows(index))

// 줄을 날짜로 갈아 끼운다
function withDays(rows: RevenueDayRow[], changes: RevenueDayRow[]): RevenueDayRow[] {
  const byDate = new Map(changes.map((row) => [row.date, row]))
  return rows.map((row) => byDate.get(row.date) ?? row)
}

const code = (code: string, name: string, count: number, amount: number | null, month = MONTH): RevenueCodeRow & { month: string } => ({ month, code, name, count, amount })
const CODES = [
  code('도수', '도수치료', 1_245, 49_812_000),
  code('ESWT1', '체외충격파 1부위', 300, 11_204_500),
  code('ESWT2', '체외충격파 2부위', 240, 5_000_000),
  code('CARM1', 'C-arm 영상 유도 주사', 410, 13_508_200),
  code('SONO1', '초음파 유도', 981, 7_806_900),
  code('CRYO', '냉동치료', 320, 2_604_000),
  code('AA154', '재진 진찰료', 5_000, 64_115_730),
]
const GROUPS: RxGroup[] = [
  { id: 'g1', name: '도수치료', codes: ['도수'], sortOrder: 0 },
  { id: 'g2', name: '체외충격파', codes: ['ESWT1', 'ESWT2'], sortOrder: 1 },
  { id: 'g3', name: 'C-arm 주사', codes: ['CARM1'], sortOrder: 2 },
  { id: 'g4', name: '초음파', codes: ['SONO1'], sortOrder: 3 },
  { id: 'g5', name: '냉동치료', codes: ['CRYO'], sortOrder: 4 },
]

function view(over: Partial<RevenueViewInput> = {}): RevenueView {
  return buildRevenueView({
    days: ALL_ROWS,
    codes: CODES,
    groups: GROUPS,
    fetchedAt: FETCHED_AT,
    month: MONTH,
    today: TODAY,
    bridge: 'ready',
    sync: { state: 'idle' },
    ...over,
  })
}

function blocks(over: Partial<RevenueViewInput> = {}): RevenueBlocks {
  const built = view(over)
  if (built.state !== 'ready') throw new Error(`ready가 아니에요: ${built.state}`)
  return built.blocks
}

function kpi(list: Kpi[], name: string): Kpi {
  const found = list.find((item) => item.name === name)
  if (!found) throw new Error(`칸이 없어요: ${name}`)
  return found
}

const noticeText = (notice: { lead: string; rest: string } | null) => (notice ? `${notice.lead}${notice.rest}` : null)
const tableRow = (rows: string[][], month: string) => rows.find((row) => row[0] === month)

describe('AC-008.1 매출 추이 덩어리는 시안 글자 그대로다', () => {
  const { trend } = blocks()

  it('AC-008.1 머리와 고른 달 매출·하루 평균(총액 ÷ 날 수, 만 원 아래 버림)', () => {
    expect(trend.title).toBe('매출 추이')
    expect(trend.sub).toBe('매출 = 총진료비 · 지난달 · 작년 같은 때와 견줘요')
    expect(kpi(trend.kpis, '10월 매출')).toMatchObject({ value: '1억 6,248만 원', sub: '하루 평균 524만 원' })
  })

  it('AC-008.1 AC-008.4 지난달·작년 같은 달보다: 소수 첫째 자리 버림, 화살표 방향과 "늘어남" 글자', () => {
    expect(kpi(trend.kpis, '9월보다')).toMatchObject({ value: '+4.0%', tone: 'up', srText: '늘어남', sub: '9월 1억 5,610만 원' })
    expect(kpi(trend.kpis, '작년 10월보다')).toMatchObject({ value: '+9.6%', tone: 'up', srText: '늘어남', sub: '2025년 10월 1억 4,820만 원' })
  })

  it('AC-008.4 줄었으면 빼기는 U+2212이고 "줄어듦"이다', () => {
    const days = withDays(ALL_ROWS, [{ ...monthRows(SEL)[0]!, total: 150_000_000, noncovered: 54_803_800 }])
    expect(kpi(blocks({ days }).trend.kpis, '9월보다')).toMatchObject({ value: '−3.9%', tone: 'down', srText: '줄어듦' })
  })

  it('AC-008.4 버려서 0이 되면 "변화 없음"이고 화살표가 없다', () => {
    const days = withDays(ALL_ROWS, [{ ...monthRows(SEL)[0]!, total: 156_104_531, noncovered: 60_908_331 }])
    expect(kpi(blocks({ days }).trend.kpis, '9월보다')).toMatchObject({ value: '변화 없음', tone: 'flat' })
  })

  it('AC-008.1 막대는 만 원 단위 글자, 13달, 고른 달·작년 같은 달·다른 달 구분, 화면 읽기 표는 원 단위', () => {
    const chart = trend.chart!
    expect(chart.title).toBe('달마다 매출 · 최근 13달')
    expect(chart.legend.map((item) => item.label)).toEqual(['고른 달', '작년 같은 달', '다른 달'])
    expect(chart.axis.unit).toBe('(만 원)')
    expect(chart.columns).toHaveLength(13)
    expect(chart.columns[SEL]).toMatchObject({ month: MONTH, label: '10월', kind: 'selected', bar: { height: 81.24, value: '16,248' } })
    expect(chart.columns[LY]).toMatchObject({ month: '2025-10', kind: 'last-year', year: '2025년' })
    expect(chart.columns[1]).toMatchObject({ kind: 'other', year: '' })
    expect(chart.columns[3]).toMatchObject({ label: '1월', year: '2026년' })
    expect(chart.table.caption).toBe('달마다 매출 (원)')
    expect(chart.table.head).toEqual(['달', '매출'])
    expect(tableRow(chart.table.rows, MONTH)).toEqual([MONTH, '162,480,350원'])
  })
})

describe('AC-008.1 달 고르기 줄', () => {
  it('AC-008.1 고른 달과 기간 글자', () => {
    const built = view()
    if (built.state !== 'ready') throw new Error(built.state)
    expect(built.period).toEqual({ label: '2026년 10월', note: '10월 1일 – 31일 · 수납한 날 기준' })
  })

  it('AC-008.1 끝나지 않은 달은 어제까지이고 막대에 일부 기간 표시가 붙는다', () => {
    const days = [...ALL_ROWS, { ...restDay('2026-11-03'), visits: 10, total: 1_000_000, noncovered: 1_000_000 }]
    const built = view({ days, today: '2026-11-15', month: '2026-11' })
    if (built.state !== 'ready') throw new Error(built.state)
    expect(built.period.note).toBe('11월 1일 – 14일 · 수납한 날 기준')
    expect(built.blocks.trend.chart!.columns[12]).toMatchObject({ month: '2026-11', partial: true, kind: 'selected' })
    expect(built.blocks.trend.chart!.columns[11]).toMatchObject({ month: '2026-10', partial: false })
  })
})

describe('AC-008.1 급여·비급여·기타 덩어리는 셋으로 나눈다', () => {
  const { split } = blocks()

  it('AC-008.1 머리 글자와 표(56.0%·41.4%·2.5% 버림, 합계 = 매출)', () => {
    expect(split.title).toBe('급여·비급여·기타')
    expect(split.sub).toBe('10월 비급여 몫 41.4% · 기타 몫 2.5%')
    expect(split.notice).toBeNull()
    expect(split.head).toEqual(['나눔', '10월', '몫', '9월보다'])
    expect(split.rows.map((row) => [row.name, row.kind, row.amount, row.share, row.delta.text])).toEqual([
      ['급여', 'main', '9,098만 원', '56.0%', '+2.9%'],
      ['공단부담', 'sub', '6,860만 원', '42.2%', '–'],
      ['본인부담', 'sub', '2,238만 원', '13.7%', '–'],
      ['비급여', 'main', '6,728만 원', '41.4%', '+5.4%'],
      ['기타', 'main', '420만 원', '2.5%', '+7.7%'],
      ['합계 · 매출', 'sum', '1억 6,248만 원', '100%', '+4.0%'],
    ])
    expect(split.rows[0]!.delta).toMatchObject({ dir: 'up', srText: '늘어남' })
  })

  it('AC-008.1 안내 글은 시안 글자 그대로다', () => {
    expect(split.note).toBe(
      '매출은 총진료비예요. 급여(요양비용총액)는 공단이 내는 몫과 환자가 내는 몫(본인부담)을 더한 금액, 비급여는 환자가 모두 내는 금액, 기타는 100/100 미만 항목과 전액 본인부담 금액이에요. 셋을 더하면 매출이에요.',
    )
  })

  it('AC-008.1 13달 세 겹 쌓은 막대: 아래부터 급여·비급여·기타, 범례는 시안 순서, 표는 원 단위', () => {
    const chart = split.chart!
    expect(chart.title).toBe('달마다 급여·비급여·기타')
    expect(chart.legend.map((item) => item.label)).toEqual(['기타', '비급여', '급여'])
    expect(chart.columns).toHaveLength(13)
    expect(chart.columns[SEL]!.segments).toEqual([
      { key: 'covered', height: 45.49 },
      { key: 'noncovered', height: 33.64 },
      { key: 'other', height: 2.1 },
    ])
    expect(chart.table.caption).toBe('달마다 급여·비급여·기타 (원)')
    expect(chart.table.head).toEqual(['달', '급여', '비급여', '기타'])
    expect(tableRow(chart.table.rows, MONTH)).toEqual([MONTH, '90,989,900원', '67,284,150원', '4,206,300원'])
  })
})

describe('AC-008.1 치료별 매출 덩어리', () => {
  it('AC-008.1 저장된 묶음: 금액·몫·건수, 그 밖 처방은 맨 뒤, 폭은 그 밖 아닌 최대 대비', () => {
    const { treatments } = blocks()
    if (treatments.kind !== 'rows') throw new Error(treatments.kind)
    expect(treatments.title).toBe('치료별 매출')
    expect(treatments.sub).toBe('10월 · 처방한 날 기준 · 내가 만든 묶음')
    expect(treatments.chip).toBeNull()
    expect(treatments.editLabel).toBe('묶음 고치기')
    expect(treatments.editDisabled).toBe(false)
    expect(treatments.rows.map((row) => [row.name, row.amount, row.share, row.detail, row.width, row.rest])).toEqual([
      ['도수치료', '4,981만 원', '32.3%', '1,245건', 100, false],
      ['체외충격파', '1,620만 원', '10.5%', '540건', 32.53, false],
      ['C-arm 주사', '1,350만 원', '8.7%', '410건', 27.11, false],
      ['초음파', '780만 원', '5.0%', '981건', 15.67, false],
      ['냉동치료', '260만 원', '1.6%', '320건', 5.22, false],
      ['그 밖 처방', '6,411만 원', '41.6%', '진찰료·약·검사 등', 100, true],
    ])
    expect(treatments.note).toBe(
      "처방 금액(단가 × 수량 × 일수)으로 세요. 환불·할인이 빠지지 않아 위 매출 합계와 조금 달라요. 어느 묶음에도 넣지 않은 처방은 '그 밖 처방'으로 세요.",
    )
  })

  it('AC-008.1 고른 달의 코드만 센다', () => {
    const { treatments } = blocks({ codes: [...CODES, code('도수', '도수치료', 9, 999_999_999, '2026-09')] })
    if (treatments.kind !== 'rows') throw new Error(treatments.kind)
    expect(treatments.rows[0]).toMatchObject({ name: '도수치료', amount: '4,981만 원', detail: '1,245건' })
  })

  it('AC-008.1 저장된 묶음이 없으면 제안 묶음으로 세고 "제안 묶음 · 아직 저장 안 함"을 보인다', () => {
    const { treatments } = blocks({ groups: [] })
    if (treatments.kind !== 'rows') throw new Error(treatments.kind)
    expect(treatments.chip).toBe('제안 묶음 · 아직 저장 안 함')
    expect(treatments.sub).toBe('10월 · 처방한 날 기준')
    expect(treatments.rows.map((row) => row.name)).toEqual(['도수치료', '체외충격파', 'C-arm 주사', '초음파', '냉동치료', '그 밖 처방'])
  })

  it("AC-008.1 groups가 'load-failed'면 안내와 [다시 불러오기]뿐이고 제안 묶음·제안 칩이 없다", () => {
    const { treatments } = blocks({ groups: 'load-failed' })
    if (treatments.kind !== 'load-failed') throw new Error(treatments.kind)
    expect(treatments.heading).toBe('치료 묶음을 불러오지 못했어요')
    expect(treatments.heading).toBe(ERRORS['E-REVENUE-GROUP-LOAD-FAILED'].what)
    expect(treatments.retry).toBe('다시 불러오기')
    expect(treatments.code).toBe('E-REVENUE-GROUP-LOAD-FAILED')
    expect(treatments.editDisabled).toBe(true)
    expect(treatments.sub).toBe('10월 · 처방한 날 기준')
    expect(treatments.body).toBe('인터넷 연결을 확인하고 다시 불러와 주세요. 묶음 없이 제안으로 바꿔 보이지 않아요.')
    const text = JSON.stringify(treatments)
    expect(text).not.toContain('제안 묶음')
    expect(text).not.toContain('도수치료')
    expect(text).not.toContain('그 밖 처방')
  })

  it('AC-008.4 고른 달에 코드가 없으면 빈 막대 없이 "자료 없음"이다', () => {
    const { treatments } = blocks({ codes: [] })
    expect(treatments).toMatchObject({ kind: 'none', text: '자료 없음' })
    expect(JSON.stringify(treatments)).not.toContain('NaN')
  })

  it('AC-008.4 금액을 모르는 코드뿐인 묶음은 0원이 아니라 "–"이고 표시가 붙는다', () => {
    const { treatments } = blocks({ codes: [code('도수', '도수치료', 3, null), code('CRYO', '냉동치료', 4, 1_000_000)] })
    if (treatments.kind !== 'rows') throw new Error(treatments.kind)
    expect(treatments.rows.find((row) => row.name === '도수치료')).toMatchObject({ amount: '–', share: '–', detail: '3건', missing: true })
  })
})

describe('AC-008.1 건당 진료비 덩어리', () => {
  const { perVisit } = blocks()

  it('AC-008.1 칸 넷은 시안 글자 그대로다(55,950원·2,904건, 원 아래 버림)', () => {
    expect(perVisit.title).toBe('건당 진료비')
    expect(perVisit.sub).toBe('접수 한 건 기준 · 접수취소는 세지 않아요')
    expect(perVisit.kpis.map((item) => [item.name, item.value, item.sub])).toEqual([
      ['10월 건당 진료비', '55,950원', '매출 ÷ 접수 2,904건'],
      ['9월보다', '+2.0%', '9월 54,850원'],
      ['작년 10월보다', '+4.9%', '2025년 10월 53,310원'],
      ['10월 접수 건수', '2,904건', '9월 2,846건'],
    ])
  })

  it('AC-008.1 막대는 천 원 단위이고 표에는 건당 진료비와 접수 건수가 있다', () => {
    const chart = perVisit.chart!
    expect(chart.title).toBe('달마다 건당 진료비 · 최근 13달')
    expect(chart.axis.unit).toBe('(천 원)')
    expect(chart.axis.ticks.map((tick) => tick.label)).toEqual(['0', '20', '40', '60', '80'])
    expect(chart.columns[SEL]).toMatchObject({ kind: 'selected', bar: { height: 69.93, value: '55' } })
    expect(chart.table.caption).toBe('달마다 건당 진료비 (원)')
    expect(chart.table.head).toEqual(['달', '건당 진료비', '접수 건수'])
    expect(tableRow(chart.table.rows, MONTH)).toEqual([MONTH, '55,950원', '2,904건'])
  })

  it('AC-008.1 안내 글은 시안 per_visit()의 글자 그대로다', () => {
    expect(perVisit.note).toBe(
      '매출을 그 기간의 접수 건수로 나눠요. 같은 분이 한 달에 다섯 번 오면 다섯 건으로 세요. 통계 탭 보고의 건당진료비와 같은 식이고, 원 아래는 버려요. 확인 필요한 날은 금액을 알 수 없어서 그날 접수 건수도 함께 빼고 나눠요.',
    )
  })

  it('AC-008.1 확인 필요한 날이 있으면 "매출 ÷ 접수 n건"의 n이 접수 건수 칸보다 작다', () => {
    const days = withDays(ALL_ROWS, [uncheckedDay('2026-10-14', 40)])
    const { kpis } = blocks({ days }).perVisit
    expect(kpi(kpis, '10월 건당 진료비').sub).toBe('매출 ÷ 접수 2,904건')
    expect(kpi(kpis, '10월 접수 건수').value).toBe('2,944건')
  })
})

describe('AC-008.1 하루 평균은 확인 필요가 아닌 날 수로 나눈다', () => {
  it('AC-008.1 31일 달에 확인 필요 2일이면 29로 나눈다', () => {
    const days = withDays(ALL_ROWS, [uncheckedDay('2026-10-14'), uncheckedDay('2026-10-27')])
    expect(kpi(blocks({ days }).trend.kpis, '10월 매출').sub).toBe('하루 평균 560만 원')
  })

  it('AC-008.1 AC-008.4 모두 확인 필요면 하루 평균도 매출도 비교도 "–"이고 0원이 없다', () => {
    const october = eachDay(monthRange(MONTH)).map((date) => uncheckedDay(date))
    const { trend } = blocks({ days: withDays(ALL_ROWS, october) })
    expect(kpi(trend.kpis, '10월 매출')).toMatchObject({ value: '–', sub: '하루 평균 –' })
    expect(kpi(trend.kpis, '9월보다')).toMatchObject({ value: '–', sub: '자료 없음' })
    expect(kpi(trend.kpis, '확인 필요한 날').value).toBe('31일')
    expect(trend.chart!.columns[SEL]!.bar).toBeNull()
    expect(tableRow(trend.chart!.table.rows, MONTH)).toEqual([MONTH, '–'])
  })

  // 쉬는 날은 unconfirmed가 아니라서 sum.days에 든다. 그래서 진짜 달(일요일이 있는 달)은 days가 0이 아니다
  const OCTOBER_SUNDAYS = new Set(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'])
  const expectNoKnownTotal = (trend: RevenueBlocks['trend'], name: string, before: string, column: number, month: string) => {
    expect(kpi(trend.kpis, name)).toMatchObject({ value: '–', sub: '하루 평균 –', tone: 'none' })
    expect(kpi(trend.kpis, before)).toMatchObject({ value: '–', sub: '자료 없음', tone: 'none', srText: '' })
    const text = JSON.stringify(trend.kpis)
    expect(text).not.toContain('0원')
    expect(text).not.toContain('100.0%')
    expect(text).not.toContain('줄어듦')
    expect(trend.chart!.columns[column]).toMatchObject({ month, bar: null })
    expect(tableRow(trend.chart!.table.rows, month)).toEqual([month, '–'])
  }

  it('AC-008.1 AC-008.4 일하는 날이 모두 확인 필요이고 일요일만 있는 달은 0원·−100.0%·0 막대가 아니라 "–"다', () => {
    const october = eachDay(monthRange(MONTH)).map((date) => (OCTOBER_SUNDAYS.has(date) ? restDay(date) : uncheckedDay(date)))
    const { trend, split, perVisit } = blocks({ days: withDays(ALL_ROWS, october) })
    expectNoKnownTotal(trend, '10월 매출', '9월보다', SEL, MONTH)
    expect(kpi(trend.kpis, '작년 10월보다')).toMatchObject({ value: '–', sub: '자료 없음' })
    expect(kpi(trend.kpis, '확인 필요한 날').value).toBe('27일')
    // 나눔은 summary.ts가 이미 null로 준다(design.md 7절: 쉬는 날은 나눔이 있는 날로 세어진다)
    expect(split.sub).toBe('자료 없음')
    expect(split.chart).toBeNull()
    expect(kpi(perVisit.kpis, '10월 건당 진료비')).toMatchObject({ value: '–', sub: '자료 없음' })
  })

  it('AC-008.1 AC-008.4 끝나지 않은 달: 1일 쉬는 날·2일 확인 필요·오늘 3일이면 "–"다', () => {
    const days = [...ALL_ROWS, restDay('2026-11-01'), uncheckedDay('2026-11-02')]
    const { trend } = blocks({ days, month: '2026-11', today: '2026-11-03' })
    expectNoKnownTotal(trend, '11월 매출', '10월보다', 12, '2026-11')
    expect(kpi(trend.kpis, '확인 필요한 날')).toMatchObject({ value: '1일', sub: '11월 2일. 그날 금액은 합계에 넣지 않았어요' })
  })

  it('AC-008.4 13달 가운데 지난 달이 그런 달이면 그 달 막대가 없고 표는 "–"이며 비교 칸도 "–"다', () => {
    const september = eachDay(monthRange('2026-09')).map((date) => (date === '2026-09-06' ? restDay(date) : uncheckedDay(date)))
    const { trend } = blocks({ days: withDays(ALL_ROWS, september) })
    expect(trend.chart!.columns[11]).toMatchObject({ month: '2026-09', bar: null })
    expect(tableRow(trend.chart!.table.rows, '2026-09')).toEqual(['2026-09', '–'])
    expect(kpi(trend.kpis, '9월보다')).toMatchObject({ value: '–', sub: '자료 없음' })
    expect(kpi(trend.kpis, '10월 매출').value).toBe('1억 6,248만 원')
  })

  it('AC-008.4 확인 필요한 날이 없는 진짜 0원은 "–"로 바꾸지 않는다', () => {
    const october = monthRows(SEL).map((row, index) => (index === 0 ? { ...restDay(row.date), visits: 5 } : row))
    const { trend } = blocks({ days: withDays(ALL_ROWS, october) })
    expect(kpi(trend.kpis, '10월 매출')).toMatchObject({ value: '0원', sub: '하루 평균 0원' })
    expect(trend.chart!.columns[SEL]!.bar).toMatchObject({ height: 0, value: '0' })
    expect(tableRow(trend.chart!.table.rows, MONTH)).toEqual([MONTH, '0원'])
  })

  it('AC-008.4 확인 필요한 날이 있어도 아는 금액이 있으면 그 합을 보인다', () => {
    const days = withDays(ALL_ROWS, [uncheckedDay('2026-10-14')])
    const { trend } = blocks({ days })
    expect(kpi(trend.kpis, '10월 매출').value).toBe('1억 6,248만 원')
    expect(trend.chart!.columns[SEL]!.bar).toMatchObject({ value: '16,248' })
  })
})

describe('AC-008.2 보기 상태는 여덟 가지 가운데 하나다', () => {
  it('AC-008.2 connect-needed: 연결 안 됨 + 저장된 줄 없음', () => {
    const built = view({ bridge: 'none', days: [], codes: [], fetchedAt: null })
    if (built.state !== 'connect-needed') throw new Error(built.state)
    expect(built.chip).toBe('비트 PC 연결 전')
    expect(built.heading).toBe('비트 PC를 연결하면 매출이 여기에 채워져요')
    expect(built.body).toBe('매출은 비트 PC에서 날짜별 합계 금액을 읽어 와요. 연결은 설정 탭에서 처음 한 번만 하면 돼요.')
    expect(built.action).toBe('비트 PC 연결')
    expect(built.gainsTitle).toBe('연결하면 생기는 것 4가지')
    expect(built.gains.map((gain) => gain.name)).toEqual(['매출 추이', '급여·비급여·기타', '치료별 매출', '건당 진료비'])
    expect(built.gains[3]!.text).toBe('매출을 접수 건수로 나눈 값이에요(다섯 번 오면 다섯 건).')
    expect(built.safe).toBe('환자 이름·차트번호는 가져오지 않아요. 날짜별 합계 금액만 비트 PC에서 읽어 저장해요.')
  })

  it('AC-008.2 fetching: 몇 달 가운데 몇 달인지와 진행 막대(소수 둘째 자리 버림)', () => {
    const built = view({ sync: { state: 'running', done: 4, total: 13, month: '2026-02' } })
    if (built.state !== 'fetching') throw new Error(built.state)
    expect(built.heading).toBe('비트에서 매출을 가져오고 있어요')
    expect(built.body).toBe('처음 한 번은 최근 13달을 읽느라 몇 분 걸려요. 이 창을 닫지 말아 주세요. 다음부터는 새로 생긴 날만 읽어요.')
    expect(built.note).toBe('다 가져오면 그래프 4가지가 한 번에 그려져요.')
    expect(built.progress).toEqual({ done: 4, total: 13, lead: '13달 가운데 ', strong: '4달', rest: '을 가져왔어요', reading: '2026년 2월 읽는 중', width: 30.76 })
  })

  it('AC-008.2 fetching: 총 달 수를 아직 모르면 숫자를 지어내지 않는다', () => {
    const built = view({ sync: { state: 'running' } })
    if (built.state !== 'fetching') throw new Error(built.state)
    expect(built.progress).toBeNull()
  })

  it('AC-008.2 ready: 가져온 시각과 [다시 가져오기], 가져오지 못한 달이 없으면 알림이 없다', () => {
    const built = view()
    if (built.state !== 'ready') throw new Error(built.state)
    expect(built.header).toEqual({ title: '매출', meta: '11월 1일 07:10에 비트에서 가져왔어요', refresh: '다시 가져오기' })
    expect(built.failed).toBeNull()
    expect(built.safe).toBe('환자 이름·차트번호는 가져오지 않아요. 날짜별 합계 금액만 비트 PC에서 읽어 저장해요.')
  })

  it('AC-008.2 ready: 가져오지 못한 달 목록과 "n달을 가져오지 못했어요"', () => {
    const built = view({
      sync: {
        state: 'idle',
        failed: [
          { month: '2025-12', code: 'E-BIT-READ-FAILED' },
          { month: '2025-11', code: 'E-BIT-READ-FAILED' },
        ],
      },
    })
    if (built.state !== 'ready') throw new Error(built.state)
    expect(built.failed).toEqual({
      lead: '2달을 가져오지 못했어요.',
      months: '2025년 11월·12월',
      rest: '나머지 달은 그대로 볼 수 있어요.',
      retry: '다시 가져오기',
      list: ['2025-11', '2025-12'],
    })
  })

  it('AC-008.2 가져오지 못한 달이 해를 넘으면 해를 다시 쓴다', () => {
    const built = view({ sync: { state: 'idle', failed: [{ month: '2026-01', code: 'E-BIT-READ-FAILED' }, { month: '2025-12', code: 'E-BIT-READ-FAILED' }] } })
    if (built.state !== 'ready') throw new Error(built.state)
    expect(built.failed?.months).toBe('2025년 12월·2026년 1월')
  })

  it('AC-008.2 AC-008.4 empty: 고른 달 자료 없음, 칸 넷은 "–"와 "자료 없음"', () => {
    // 이 PC가 읽었고 수납 기록이 없던 달(쉬는 날 줄만 있음). 날 줄이 하나도 없는 옛 달은 AC-3503.3 글이다
    const built = view({ month: '2024-10', days: [...ALL_ROWS, ...eachDay(monthRange('2024-10')).map(restDay)] })
    if (built.state !== 'empty') throw new Error(built.state)
    expect(built.period).toEqual({ label: '2024년 10월', note: '10월 1일 – 31일 · 수납한 날 기준' })
    expect(built.empty.heading).toBe('자료 없음')
    expect(built.empty.kpis.map((item) => [item.name, item.value, item.sub])).toEqual([
      ['10월 매출', '–', '자료 없음'],
      ['9월보다', '–', '자료 없음'],
      ['작년 10월보다', '–', '자료 없음'],
      ['건당 진료비', '–', '자료 없음'],
    ])
    expect(built.empty.note).toBe('이 달에는 비트에 수납 기록이 없어요. 그래프는 자료가 있는 달만 그려요. 숫자를 지어 넣지 않아요.')
  })

  it('AC-008.2 empty: 그 달을 가져오지 못했으면 "기록이 없어요"라고 말하지 않고 알림을 함께 준다', () => {
    const failed = [{ month: '2024-10', code: 'E-BIT-READ-FAILED' }]
    const built = view({ month: '2024-10', sync: { state: 'idle', failed } })
    if (built.state !== 'empty') throw new Error(built.state)
    expect(built.failed?.lead).toBe('1달을 가져오지 못했어요.')
    expect(built.empty.note).toBe('이 달은 가져오지 못했어요. 숫자를 지어 넣지 않아요.')
  })

  it('AC-008.2 helper-old: 통로가 옛 도우미이거나 가져오기가 옛 도우미를 알렸을 때', () => {
    for (const over of [{ bridge: 'helper-old' as const }, { sync: { state: 'idle' as const, helperOld: true } }]) {
      const built = view(over)
      if (built.state !== 'helper-old') throw new Error(built.state)
      expect(built.heading).toBe('매출을 읽으려면 도우미를 새로 깔아야 해요')
      expect(built.body).toBe('지금 이 PC의 도우미는 매출 읽기를 아직 몰라요. 설정 탭에서 새 도우미를 받아 다시 깔면 바로 읽어요.')
      expect(built.action).toBe('설정에서 새 도우미 받기')
      expect(built.code).toBe('E-HELPER-UNKNOWN-COMMAND')
    }
  })

  it('AC-008.2 extension-old', () => {
    const built = view({ sync: { state: 'idle', extensionOld: true } })
    if (built.state !== 'extension-old') throw new Error(built.state)
    expect(built.heading).toBe('매출을 읽으려면 확장 프로그램을 새 버전으로 바꿔야 해요')
    expect(built.body).toBe('지금 이 PC의 크롬 확장 프로그램은 매출 읽기를 아직 몰라요. 설정 탭에서 확장 프로그램 새 버전을 받으면 바로 읽어요. 청구 점검은 지금 그대로 쓸 수 있어요.')
    expect(built.action).toBe('설정에서 확인')
    expect(built.code).toBe('E-BRIDGE-REJECTED')
  })

  it('AC-008.2 saved-only: 연결 안 됨 + 저장된 줄 있음, 마지막 가져온 시각, [다시 가져오기] 없음', () => {
    const built = view({ bridge: 'none' })
    if (built.state !== 'saved-only') throw new Error(built.state)
    expect(built.header).toEqual({ title: '매출', meta: '의원 PC에서 11월 1일 07:10에 가져온 숫자예요', refresh: null })
    expect(built.notice).toEqual({
      lead: '이 PC는 비트와 연결되어 있지 않아요.',
      rest: '의원 PC에서 11월 1일 07:10에 가져온 숫자를 보여 드려요.',
      action: '비트 PC 연결',
    })
    expect(built.blocks?.trend.title).toBe('매출 추이')
    expect(built.empty).toBeNull()
  })

  it('AC-008.2 saved-only: 고른 달에 자료가 없으면 덩어리 대신 자료 없음이다', () => {
    const built = view({ bridge: 'none', month: '2024-10' })
    if (built.state !== 'saved-only') throw new Error(built.state)
    expect(built.blocks).toBeNull()
    expect(built.empty?.heading).toBe('자료 없음')
    expect(built.empty?.note).toBe('그래프는 자료가 있는 달만 그려요. 숫자를 지어 넣지 않아요.')
  })

  it('AC-008.2 error: 멈춘 번호를 준다', () => {
    const built = view({ sync: { state: 'error', code: 'E-BRIDGE-DISCONNECTED' } })
    expect(built).toEqual({ state: 'error', title: '매출', code: 'E-BRIDGE-DISCONNECTED' })
  })

  it('AC-008.2 고르는 차례: 옛 도우미 → 옛 확장 → 가져오는 중 → 오류 → 연결 안 됨 → 자료 없음', () => {
    expect(view({ bridge: 'helper-old', sync: { state: 'running' } }).state).toBe('helper-old')
    expect(view({ sync: { state: 'running', extensionOld: true } }).state).toBe('extension-old')
    expect(view({ sync: { state: 'running', code: 'E-BRIDGE-DISCONNECTED' } }).state).toBe('fetching')
    expect(view({ bridge: 'none', days: [], sync: { state: 'error', code: 'E-BRIDGE-DISCONNECTED' } }).state).toBe('error')
    expect(view({ bridge: 'none', month: '2024-10' }).state).toBe('saved-only')
    expect(view({ days: [] }).state).toBe('empty')
  })
})

describe('AC-008.3 확인 필요한 날', () => {
  it('AC-008.3 있으면 날 수·날짜와 합계에 넣지 않았다는 말', () => {
    const days = withDays(ALL_ROWS, [uncheckedDay('2026-10-14'), uncheckedDay('2026-10-27')])
    expect(kpi(blocks({ days }).trend.kpis, '확인 필요한 날')).toMatchObject({ value: '2일', tone: 'warn', sub: '10월 14일·27일. 그날 금액은 합계에 넣지 않았어요' })
  })

  it('AC-008.3 없으면 "없음"이다', () => {
    expect(kpi(blocks().trend.kpis, '확인 필요한 날')).toMatchObject({ value: '없음', sub: null })
  })

  it('AC-008.3 까닭(환불)과 낮게 보일 수 있다는 말이 없다(치료별 안내의 처방 금액 설명은 다른 말이라 뺀다)', () => {
    const days = withDays(ALL_ROWS, [uncheckedDay('2026-10-14', 40), uncheckedDay('2026-10-27')])
    const { trend, split, treatments, perVisit } = blocks({ days })
    const text = JSON.stringify({ trend, split, perVisit, treatments: { ...treatments, note: '' } })
    expect(text).not.toContain('환불')
    expect(text).not.toContain('낮')
  })

  it('AC-008.3 나눔을 못 한 날은 이 수에 세지 않는다', () => {
    const days = withDays(ALL_ROWS, [noSplitDay('2026-10-05'), uncheckedDay('2026-10-14')])
    expect(kpi(blocks({ days }).trend.kpis, '확인 필요한 날')).toMatchObject({ value: '1일', sub: '10월 14일. 그날 금액은 합계에 넣지 않았어요' })
  })
})

describe('AC-008.4 자료 없는 칸은 "–"와 "자료 없음"이다', () => {
  const nullVisits = (rows: RevenueDayRow[]) => rows.map((row) => ({ ...row, visits: null, newPatients: null, returnVisits: null }))

  it('AC-008.4 AC-005.2 고른 기간의 visits가 모두 null이면 접수 건수 칸은 "0건"이 아니라 "–"이고 건당 진료비도 그렇다', () => {
    const days = withDays(ALL_ROWS, nullVisits(monthRows(SEL)))
    const { kpis } = blocks({ days }).perVisit
    expect(kpi(kpis, '10월 접수 건수')).toMatchObject({ value: '–', sub: '자료 없음' })
    expect(kpi(kpis, '10월 건당 진료비')).toMatchObject({ value: '–', sub: '자료 없음' })
    expect(kpi(kpis, '9월보다')).toMatchObject({ value: '–', sub: '자료 없음' })
  })

  it('AC-008.4 AC-005.6 visits가 모두 0이고 금액만 있으면 접수 건수 "0건"이고 건당 진료비 "–"다', () => {
    const days = withDays(
      ALL_ROWS,
      monthRows(SEL).map((row) => ({ ...row, visits: 0 })),
    )
    const { kpis } = blocks({ days }).perVisit
    expect(kpi(kpis, '10월 접수 건수')).toMatchObject({ value: '0건', sub: '9월 2,846건' })
    expect(kpi(kpis, '10월 건당 진료비')).toMatchObject({ value: '–', sub: '자료 없음' })
  })

  it('AC-008.4 지난달 같은 기간의 visits가 모두 null이면 고른 달 칸은 그대로이고 설명은 "9월 –"다', () => {
    const days = withDays(ALL_ROWS, nullVisits(monthRows(11)))
    expect(kpi(blocks({ days }).perVisit.kpis, '10월 접수 건수')).toMatchObject({ value: '2,904건', sub: '9월 –' })
  })

  it('AC-008.4 AC-005.2 13달 가운데 한 달의 visits가 모두 null이면 화면 읽기 표의 그 달 접수 건수와 건당 진료비는 "–"이고 막대가 없다', () => {
    const days = withDays(ALL_ROWS, nullVisits(monthRows(5)))
    const chart = blocks({ days }).perVisit.chart!
    expect(tableRow(chart.table.rows, MONTHS[5]!)).toEqual([MONTHS[5], '–', '–'])
    expect(chart.columns[5]!.bar).toBeNull()
  })

  it('AC-008.4 건수가 진짜 0인 달의 화면 읽기 표는 "0건"이다', () => {
    const days = withDays(
      ALL_ROWS,
      monthRows(5).map((row) => ({ ...row, visits: 0 })),
    )
    expect(tableRow(blocks({ days }).perVisit.chart!.table.rows, MONTHS[5]!)).toEqual([MONTHS[5], '–', '0건'])
  })

  it('AC-008.4 비교할 달의 자료가 없으면 비교 칸은 "–"와 "자료 없음"이고 지어낸 숫자가 없다', () => {
    const days = ALL_ROWS.filter((row) => row.date.startsWith(MONTH))
    const { trend, split, perVisit } = blocks({ days })
    expect(kpi(trend.kpis, '9월보다')).toMatchObject({ value: '–', sub: '자료 없음', tone: 'none', srText: '' })
    expect(kpi(trend.kpis, '작년 10월보다')).toMatchObject({ value: '–', sub: '자료 없음' })
    expect(kpi(perVisit.kpis, '9월보다')).toMatchObject({ value: '–', sub: '자료 없음' })
    expect(kpi(perVisit.kpis, '10월 접수 건수').sub).toBe('9월 –')
    expect(split.rows.map((row) => row.delta.text)).toEqual(['–', '–', '–', '–', '–', '–'])
  })

  it('AC-008.4 자료 없는 달은 막대가 없고 표에는 "–"다(0이 아님)', () => {
    const days = ALL_ROWS.filter((row) => row.date >= '2026-09-01')
    const { trend, split, perVisit } = blocks({ days })
    const chart = trend.chart!
    expect(chart.columns).toHaveLength(13)
    expect(chart.columns[0]).toMatchObject({ month: '2025-10', label: '10월', bar: null })
    expect(chart.columns[SEL]!.bar).not.toBeNull()
    expect(tableRow(chart.table.rows, '2025-10')).toEqual(['2025-10', '–'])
    expect(split.chart!.columns[0]!.segments).toBeNull()
    expect(tableRow(split.chart!.table.rows, '2025-10')).toEqual(['2025-10', '–', '–', '–'])
    expect(perVisit.chart!.columns[0]!.bar).toBeNull()
  })

  it('AC-008.4 13달 모두 건당 진료비를 낼 수 없으면 건당 진료비 그림이 없다', () => {
    const days = nullVisits(ALL_ROWS)
    expect(blocks({ days }).perVisit.chart).toBeNull()
  })
})

describe('AC-008.5 막대 눈금은 niceScale이다', () => {
  it('AC-008.5 매출 눈금은 13달 total의 최대에서 나온다', () => {
    const { axis } = blocks().trend.chart!
    expect(axis.unit).toBe('(만 원)')
    const scale = niceScale(Math.max(...TOTAL))
    expect(scale.max).toBe(200_000_000)
    expect(axis.ticks).toEqual([
      { label: '0', bottom: 0 },
      { label: '5,000', bottom: 25 },
      { label: '10,000', bottom: 50 },
      { label: '15,000', bottom: 75 },
      { label: '20,000', bottom: 100 },
    ])
  })

  it('AC-008.5 쌓은 막대와 매출 막대는 같은 눈금이고 겹 합이 매출 막대 높이와 같다', () => {
    const { trend, split } = blocks()
    expect(split.chart!.axis).toEqual(trend.chart!.axis)
    trend.chart!.columns.forEach((column, index) => {
      const stacked = split.chart!.columns[index]!.segments!.reduce((sum, segment) => sum + segment.height, 0)
      expect(Math.abs(stacked - column.bar!.height)).toBeLessThan(0.05)
    })
  })

  it('AC-008.1 AC-008.5 막대 %는 0~100이고 소수 둘째 자리까지다(버림)', () => {
    const { trend, split, perVisit } = blocks()
    const heights = [
      ...trend.chart!.columns.map((column) => column.bar!.height),
      ...perVisit.chart!.columns.map((column) => column.bar!.height),
      ...split.chart!.columns.flatMap((column) => column.segments!.map((segment) => segment.height)),
    ]
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(0)
      expect(height).toBeLessThanOrEqual(100)
      expect(Math.round(height * 100) / 100).toBe(height)
    }
    // 8,124.0175 → 81.24, 69.9375 → 69.93(반올림이면 69.94)
    expect(perVisit.chart!.columns[SEL]!.bar!.height).toBe(69.93)
  })
})

describe('AC-008.6 나눔을 못 한 날', () => {
  it('AC-008.6 2일이면 안내 글자와 날짜, 합계 줄 이름 "합계", 몫은 splitTotal 대비, 지난달보다 "–", 매출 칸에는 그날 total이 들어 있다', () => {
    const days = withDays(ALL_ROWS, [noSplitDay('2026-10-05'), noSplitDay('2026-10-19')])
    const { trend, split } = blocks({ days })
    expect(noticeText(split.notice)).toBe('2일(10월 5일·19일)은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.')
    expect(split.rows.map((row) => [row.name, row.amount, row.share, row.delta.text])).toEqual([
      ['급여', '9,098만 원', '56.0%', '–'],
      ['공단부담', '6,860만 원', '42.2%', '–'],
      ['본인부담', '2,238만 원', '13.7%', '–'],
      ['비급여', '6,728만 원', '41.4%', '–'],
      ['기타', '420만 원', '2.5%', '–'],
      ['합계', '1억 6,248만 원', '100%', '–'],
    ])
    expect(kpi(trend.kpis, '10월 매출').value).toBe('1억 7,248만 원')
    expect(kpi(trend.kpis, '9월보다').value).toBe('+10.4%')
    expect(split.note).toBe(
      '매출은 총진료비예요. 급여(요양비용총액)는 공단이 내는 몫과 환자가 내는 몫(본인부담)을 더한 금액, 비급여는 환자가 모두 내는 금액, 기타는 100/100 미만 항목과 전액 본인부담 금액이에요. 이 달은 나눔을 못 한 날이 빠져서 셋을 더해도 매출보다 작아요. 막대도 나눔이 있는 날만 더해요.',
    )
  })

  it('AC-008.6 막대는 세 겹 그대로이고 매출 막대와 같은 눈금이라 그 달은 매출 막대보다 낮다', () => {
    const days = withDays(ALL_ROWS, [noSplitDay('2026-10-05', 30_000_000)])
    const { trend, split } = blocks({ days })
    expect(split.chart!.axis).toEqual(trend.chart!.axis)
    const stacked = split.chart!.columns[SEL]!.segments!
    expect(stacked.map((segment) => segment.key)).toEqual(['covered', 'noncovered', 'other'])
    const stackedHeight = stacked.reduce((sum, segment) => sum + segment.height, 0)
    expect(stackedHeight).toBeLessThan(trend.chart!.columns[SEL]!.bar!.height)
    expect(tableRow(split.chart!.table.rows, MONTH)).toEqual([MONTH, '90,989,900원', '67,284,150원', '4,206,300원'])
  })

  it('AC-008.6 날짜는 달을 앞에 한 번 쓰고 이어진 날을 묶는다', () => {
    const missing = ['01', '02', '03', '05', '06', '07', '08', '09', '10'].map((d) => noSplitDay(`2026-10-${d}`))
    const { split } = blocks({ days: withDays(ALL_ROWS, missing) })
    expect(noticeText(split.notice)).toBe('9일(10월 1일–3일·5일–10일)은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.')
  })

  it('AC-008.6 일요일 0원 줄 하나 + 나머지 모두 나눔을 못 한 달: 표 "–"·"자료 없음"·쌓은 막대 그림 없음·0만 원이나 0÷0 글자 없음·날 수에 일요일 없음', () => {
    const sundays = new Set(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'])
    const october = eachDay(monthRange(MONTH)).map((date) => (sundays.has(date) ? restDay(date) : noSplitDay(date, 6_000_000, 100)))
    const { trend, split, perVisit } = blocks({ days: withDays(ALL_ROWS, october) })
    expect(split.sub).toBe('자료 없음')
    expect(split.chart).toBeNull()
    expect(split.rows.map((row) => [row.name, row.amount, row.share, row.delta.text])).toEqual([
      ['급여', '–', '–', '–'],
      ['공단부담', '–', '–', '–'],
      ['본인부담', '–', '–', '–'],
      ['비급여', '–', '–', '–'],
      ['기타', '–', '–', '–'],
      ['합계', '–', '–', '–'],
    ])
    expect(noticeText(split.notice)).toBe('27일(10월 1일–3일·5일–10일·12일–17일·19일–24일·26일–31일)은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.')
    expect(split.note).toBe('자료 없음. 이 달은 쉬는 날 말고는 모두 나눔을 못 해서 숫자를 지어 넣지 않았어요. 위 매출 추이와 아래 건당 진료비는 그대로 볼 수 있어요.')
    const text = JSON.stringify(split)
    expect(text).not.toContain('0만 원')
    expect(text).not.toContain('0원')
    expect(text).not.toContain('NaN')
    expect(text).not.toContain('Infinity')
    // 매출 합계와 건당 진료비는 그대로다
    expect(kpi(trend.kpis, '10월 매출').value).toBe('1억 6,200만 원')
    expect(kpi(perVisit.kpis, '10월 건당 진료비').value).toBe('60,000원')
  })

  it('AC-008.6 나눔이 없는데 나눔을 못 한 날도 없으면(모두 확인 필요) 안내가 없고 까닭을 지어 말하지 않는다', () => {
    const october = eachDay(monthRange(MONTH)).map((date) => uncheckedDay(date))
    const { split } = blocks({ days: withDays(ALL_ROWS, october) })
    expect(split.notice).toBeNull()
    expect(split.chart).toBeNull()
    expect(split.sub).toBe('자료 없음')
    expect(split.note).toBe('자료 없음. 숫자를 지어 넣지 않았어요.')
  })

  it('AC-008.6 지난달에만 그런 날이 있으면 지난달보다 "–"이고 안내가 없고 합계 줄은 "합계 · 매출"이다', () => {
    const days = withDays(ALL_ROWS, [noSplitDay('2026-09-10')])
    const { trend, split } = blocks({ days })
    expect(split.notice).toBeNull()
    expect(split.rows.map((row) => row.delta.text)).toEqual(['–', '–', '–', '–', '–', '–'])
    expect(split.rows[5]!.name).toBe('합계 · 매출')
    expect(kpi(trend.kpis, '9월보다').value).not.toBe('–')
  })
})

describe('AC-008.7 접수 건수를 확인하지 못한 날', () => {
  it('AC-008.7 1일이면 안내 글자가 건당 진료비 덩어리에 있다', () => {
    const days = withDays(ALL_ROWS, [{ ...restDay('2026-10-14'), visits: null }])
    expect(noticeText(blocks({ days }).perVisit.notice)).toBe('1일(10월 14일)은 접수 건수를 확인하지 못해 건당 진료비에서 빠졌어요. 매출 합계에는 들어 있어요.')
  })

  it('AC-008.7 이어진 날은 묶는다', () => {
    const days = withDays(ALL_ROWS, ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-20'].map((date) => ({ ...restDay(date), visits: null })))
    expect(noticeText(blocks({ days }).perVisit.notice)).toBe('4일(10월 14일–16일·20일)은 접수 건수를 확인하지 못해 건당 진료비에서 빠졌어요. 매출 합계에는 들어 있어요.')
  })

  it('AC-008.7 없으면 안내가 없다', () => {
    expect(blocks().perVisit.notice).toBeNull()
  })

  it('AC-008.7 지난달에만 있으면 안내가 없고 9월보다는 "–"가 아니라 보통 비교다', () => {
    const days = withDays(ALL_ROWS, [{ ...restDay('2026-09-14'), visits: null }])
    const { perVisit } = blocks({ days })
    expect(perVisit.notice).toBeNull()
    expect(kpi(perVisit.kpis, '9월보다')).toMatchObject({ value: '+2.0%', tone: 'up' })
  })

  it('AC-008.7 AC-005.6 그날 금액은 건당 진료비에서 빠지고 매출 합계에는 그대로 있다', () => {
    const days = withDays(ALL_ROWS, [{ ...restDay('2026-10-14'), visits: null, total: 10_000_000, noncovered: 10_000_000, cash: 10_000_000 }])
    const { trend, perVisit } = blocks({ days })
    expect(kpi(trend.kpis, '10월 매출').value).toBe('1억 7,248만 원')
    expect(kpi(perVisit.kpis, '10월 건당 진료비')).toMatchObject({ value: '55,950원', sub: '매출 ÷ 접수 2,904건' })
  })
})

describe('AC-008.1 가짜 자료 밖의 글자', () => {
  it('AC-008.1 가져온 시각이 없으면 글자가 없고 시각을 지어내지 않는다', () => {
    const ready = view({ fetchedAt: null })
    if (ready.state !== 'ready') throw new Error(ready.state)
    expect(ready.header.meta).toBeNull()
    const saved = view({ bridge: 'none', fetchedAt: null })
    if (saved.state !== 'saved-only') throw new Error(saved.state)
    expect(saved.header.meta).toBeNull()
    expect(saved.notice.rest).toBe('의원 PC에서 가져온 숫자를 보여 드려요.')
  })

  it('AC-008.1 받은 자료를 바꾸지 않는다', () => {
    const groups = GROUPS.map((group) => ({ ...group, codes: [...group.codes] }))
    const before = JSON.stringify(groups)
    view({ groups })
    expect(JSON.stringify(groups)).toBe(before)
  })
})

// ── 매출 가져올 기간(spec revenue-load-range TASK-2) ──────────────────
// 이 파일의 오늘 2026-11-01 → 최근 달 2026-10, 최근 13달의 첫 달 2025-10. 옛 달 2020-03 ~ 2021-03은 따로 가져온 줄이다

// 한 달 줄: 1일에 금액·건수가 다 있고 나머지는 쉬는 날
function dataMonth(month: string, total: number, noncovered: number, other: number, visits: number): RevenueDayRow[] {
  const covered = total - noncovered - other
  const insurer = Math.floor(covered * 0.75)
  return eachDay(monthRange(month)).map((date, i) =>
    i > 0 ? restDay(date) : { ...restDay(date), visits, total, insurer, copay: covered - insurer, noncovered, otherTotal: other, cash: total },
  )
}

const OLD_MONTHS = ['2020-03', '2020-04', '2020-05', '2020-06', '2020-07', '2020-08', '2020-09', '2020-10', '2020-11', '2020-12', '2021-01', '2021-02', '2021-03']
const OLD_ROWS = [
  ...dataMonth('2020-03', 150_000_000, 60_000_000, 3_000_000, 2_500),
  ...OLD_MONTHS.slice(1, 11).flatMap((month) => dataMonth(month, 110_000_000, 44_000_000, 2_200_000, 2_200)),
  ...dataMonth('2021-02', 100_000_000, 40_000_000, 2_000_000, 2_500),
  ...dataMonth('2021-03', 120_000_000, 48_000_000, 2_400_000, 2_400),
]
const WITH_OLD = [...OLD_ROWS, ...ALL_ROWS]
const OLD_MONTH = '2021-03'
const NO_RECORD_NOTE = '이 달에는 비트에 수납 기록이 없어요. 그래프는 자료가 있는 달만 그려요. 숫자를 지어 넣지 않아요.'

describe('AC-3503.2 옛날 달의 막대는 고른 달까지 13달이다', () => {
  it('AC-3503.2 고른 달이 2021-03이면 매출 막대와 표는 2020-03 ~ 2021-03이고 제목에 그 기간이 있다', () => {
    const { trend } = blocks({ days: WITH_OLD, month: OLD_MONTH })
    const chart = trend.chart!
    expect(chart.title).toBe('달마다 매출 · 2020년 3월 – 2021년 3월')
    expect(chart.columns.map((column) => column.month)).toEqual(OLD_MONTHS)
    expect(chart.columns[12]).toMatchObject({ month: OLD_MONTH, label: '3월', kind: 'selected' })
    expect(chart.columns[0]).toMatchObject({ month: '2020-03', kind: 'last-year', year: '2020년' })
    expect(chart.columns[10]).toMatchObject({ month: '2021-01', label: '1월', year: '2021년' })
    expect(chart.table.rows.map((row) => row[0])).toEqual(OLD_MONTHS)
    expect(tableRow(chart.table.rows, OLD_MONTH)).toEqual([OLD_MONTH, '120,000,000원'])
  })

  it('AC-3503.2 건당 진료비 막대와 표도 같은 13달이고 제목에 그 기간이 있다', () => {
    const { perVisit, split } = blocks({ days: WITH_OLD, month: OLD_MONTH })
    expect(perVisit.chart!.title).toBe('달마다 건당 진료비 · 2020년 3월 – 2021년 3월')
    expect(perVisit.chart!.columns.map((column) => column.month)).toEqual(OLD_MONTHS)
    expect(perVisit.chart!.table.rows.map((row) => row[0])).toEqual(OLD_MONTHS)
    expect(tableRow(perVisit.chart!.table.rows, OLD_MONTH)).toEqual([OLD_MONTH, '50,000원', '2,400건'])
    expect(split.chart!.columns.map((column) => column.month)).toEqual(OLD_MONTHS)
    expect(split.chart!.table.rows.map((row) => row[0])).toEqual(OLD_MONTHS)
  })

  it('AC-3503.2 고른 달이 최근 13달의 첫 달이면 막대·표·제목은 지금처럼 최근 13달이다', () => {
    const { trend, perVisit } = blocks({ days: WITH_OLD, month: '2025-10' })
    expect(trend.chart!.title).toBe('달마다 매출 · 최근 13달')
    expect(perVisit.chart!.title).toBe('달마다 건당 진료비 · 최근 13달')
    expect(trend.chart!.columns.map((column) => column.month)).toEqual(MONTHS)
    expect(trend.chart!.table.rows.map((row) => row[0])).toEqual(MONTHS)
    expect(trend.chart!.columns[0]).toMatchObject({ month: '2025-10', kind: 'selected' })
  })

  it('AC-3503.2 고른 달이 최근 13달의 첫 달보다 한 달 앞이면 그 달이 끝 달이다', () => {
    const days = [...WITH_OLD, ...dataMonth('2025-09', 140_000_000, 56_000_000, 2_800_000, 2_600)]
    const { trend, perVisit } = blocks({ days, month: '2025-09' })
    expect(trend.chart!.title).toBe('달마다 매출 · 2024년 9월 – 2025년 9월')
    expect(perVisit.chart!.title).toBe('달마다 건당 진료비 · 2024년 9월 – 2025년 9월')
    expect(trend.chart!.columns.at(-1)).toMatchObject({ month: '2025-09', kind: 'selected' })
    expect(trend.chart!.columns[0]).toMatchObject({ month: '2024-09', kind: 'last-year' })
  })
})

describe('AC-3503.4 옛날 달은 지금 규칙 그대로 그 달들의 자료로 그린다', () => {
  const oldCodes = [
    ...CODES,
    code('도수', '도수치료', 400, 16_000_000, OLD_MONTH),
    code('ESWT1', '체외충격파 1부위', 100, 4_000_000, OLD_MONTH),
    code('AA154', '재진 진찰료', 1_000, 10_000_000, OLD_MONTH),
    code('도수', '도수치료', 999, 999_999_999, '2021-02'),
  ]
  const built = blocks({ days: WITH_OLD, codes: oldCodes, month: OLD_MONTH })

  it('AC-3503.4 매출 칸과 지난달·작년 같은 달 비교는 2021-03·2021-02·2020-03 자료다', () => {
    const { kpis } = built.trend
    expect(kpi(kpis, '3월 매출')).toMatchObject({ value: '1억 2,000만 원', sub: '하루 평균 387만 원' })
    expect(kpi(kpis, '2월보다')).toMatchObject({ value: '+20.0%', tone: 'up', sub: '2월 1억 원' })
    expect(kpi(kpis, '작년 3월보다')).toMatchObject({ value: '−20.0%', tone: 'down', sub: '2020년 3월 1억 5,000만 원' })
  })

  it('AC-3503.4 급여 나눔은 그 달 자료이고 지난달과 견준다', () => {
    const { split } = built
    expect(split.sub).toBe('3월 비급여 몫 40.0% · 기타 몫 2.0%')
    expect(split.rows[0]).toMatchObject({ name: '급여', amount: '6,960만 원', delta: { dir: 'up', text: '+20.0%' } })
  })

  it('AC-3503.4 치료별 매출은 그 달의 코드 줄로 센다(다른 달 코드는 넣지 않는다)', () => {
    const { treatments } = built
    if (treatments.kind !== 'rows') throw new Error(treatments.kind)
    expect(treatments.sub).toBe('3월 · 처방한 날 기준 · 내가 만든 묶음')
    expect(treatments.rows.map((row) => [row.name, row.amount, row.detail])).toEqual([
      ['도수치료', '1,600만 원', '400건'],
      ['체외충격파', '400만 원', '100건'],
      ['그 밖 처방', '1,000만 원', '진찰료·약·검사 등'],
    ])
  })

  it('AC-3503.4 건당 진료비와 접수 건수는 그 달 자료이고 지난달·작년 같은 달과 견준다', () => {
    const { kpis } = built.perVisit
    expect(kpi(kpis, '3월 건당 진료비')).toMatchObject({ value: '50,000원', sub: '매출 ÷ 접수 2,400건' })
    expect(kpi(kpis, '2월보다')).toMatchObject({ value: '+25.0%', tone: 'up', sub: '2월 40,000원' })
    expect(kpi(kpis, '작년 3월보다')).toMatchObject({ value: '−16.6%', tone: 'down', sub: '2020년 3월 60,000원' })
    expect(kpi(kpis, '3월 접수 건수')).toMatchObject({ value: '2,400건', sub: '2월 2,500건' })
  })
})

describe('AC-3503.3 아직 가져오지 않은 옛날 달', () => {
  const NOT_FETCHED = "이 달은 아직 비트에서 가져오지 않았어요. 위 '가져올 기간'에서 이 달이 든 기간을 고르고 [비트에서 가져오기]를 누르면 채워져요."

  it('AC-3503.3 연결된 PC에서 날 줄이 하나도 없는 옛 달이면 새 글이고, 제목·숫자 칸은 지금 그대로다', () => {
    const built = view({ days: WITH_OLD, month: '2024-03' })
    if (built.state !== 'empty') throw new Error(built.state)
    expect(built.empty.note).toBe(NOT_FETCHED)
    expect(built.empty.heading).toBe('자료 없음')
    expect(built.empty.kpis.map((item) => [item.name, item.value, item.sub])).toEqual([
      ['3월 매출', '–', '자료 없음'],
      ['2월보다', '–', '자료 없음'],
      ['작년 3월보다', '–', '자료 없음'],
      ['건당 진료비', '–', '자료 없음'],
    ])
    expect(built.failed).toBeNull()
  })

  it('AC-3503.3 최근 13달의 첫 달보다 한 달 앞(2025-09)도 옛 달이다', () => {
    const built = view({ month: '2025-09' })
    if (built.state !== 'empty') throw new Error(built.state)
    expect(built.empty.note).toBe(NOT_FETCHED)
  })

  it('AC-3503.3 읽지 못한 달 목록에 있으면 지금 글이다', () => {
    const failed = [{ month: '2024-03', code: 'E-BIT-READ-FAILED' }]
    const built = view({ days: WITH_OLD, month: '2024-03', sync: { state: 'idle', failed } })
    if (built.state !== 'empty') throw new Error(built.state)
    expect(built.empty.note).toBe('이 달은 가져오지 못했어요. 숫자를 지어 넣지 않아요.')
  })

  it('AC-3503.3 옛 달이라도 날 줄이 있으면(읽었고 수납 기록이 없던 달) 지금 글이다', () => {
    const built = view({ days: [...WITH_OLD, ...eachDay(monthRange('2024-03')).map(restDay)], month: '2024-03' })
    if (built.state !== 'empty') throw new Error(built.state)
    expect(built.empty.note).toBe(NO_RECORD_NOTE)
  })

  it('AC-3503.3 최근 13달 안의 빈 달은 지금 글이다', () => {
    const days = ALL_ROWS.filter((row) => !row.date.startsWith('2026-03'))
    const built = view({ days, month: '2026-03' })
    if (built.state !== 'empty') throw new Error(built.state)
    expect(built.empty.note).toBe(NO_RECORD_NOTE)
  })

  it('AC-3503.3 연결 안 된 PC는 옛 달이라도 지금 글이다', () => {
    const built = view({ days: WITH_OLD, bridge: 'none', month: '2024-03' })
    if (built.state !== 'saved-only') throw new Error(built.state)
    expect(built.empty?.note).toBe('그래프는 자료가 있는 달만 그려요. 숫자를 지어 넣지 않아요.')
  })
})

describe('AC-3502.2 고른 기간을 가져오는 동안의 본문', () => {
  const BODY = '2020년 1월 – 2026년 10월 가운데 아직 안 가져온 69달을 읽어요. 12분쯤 걸려요. 다 끝날 때까지 이 창을 닫지 말아 주세요.'

  it('AC-3502.2 sync.body가 있으면 본문이 그 글이고 진행 줄은 지금 그대로다', () => {
    const built = view({ sync: { state: 'running', done: 12, total: 69, month: '2024-09', body: BODY } })
    if (built.state !== 'fetching') throw new Error(built.state)
    expect(built.body).toBe(BODY)
    expect(built.heading).toBe('비트에서 매출을 가져오고 있어요')
    expect(built.note).toBe('다 가져오면 그래프 4가지가 한 번에 그려져요.')
    expect(built.progress).toMatchObject({ lead: '69달 가운데 ', strong: '12달', rest: '을 가져왔어요', reading: '2024년 9월 읽는 중' })
  })

  it('AC-3502.2 sync.body가 없으면(화면을 열 때의 저절로 가져오기) 지금 글 그대로다', () => {
    const built = view({ sync: { state: 'running', done: 1, total: 13 } })
    if (built.state !== 'fetching') throw new Error(built.state)
    expect(built.body).toBe('처음 한 번은 최근 13달을 읽느라 몇 분 걸려요. 이 창을 닫지 말아 주세요. 다음부터는 새로 생긴 날만 읽어요.')
  })
})

describe('AC-3504.2 제안 묶음은 최근 13달 코드 줄로만 만든다', () => {
  it('AC-3504.2 옛 달에만 있는 코드(ESWT3)는 제안 묶음에 들지 않아 옛 달을 골라도 그 밖 처방으로 센다', () => {
    const codes = [...CODES, code('도수', '도수치료', 400, 16_000_000, OLD_MONTH), code('ESWT3', '체외충격파 3부위', 50, 3_000_000, OLD_MONTH)]
    const { treatments } = blocks({ days: WITH_OLD, codes, groups: [], month: OLD_MONTH })
    if (treatments.kind !== 'rows') throw new Error(treatments.kind)
    expect(treatments.chip).toBe('제안 묶음 · 아직 저장 안 함')
    expect(treatments.rows.map((row) => [row.name, row.amount])).toEqual([
      ['도수치료', '1,600만 원'],
      ['그 밖 처방', '300만 원'],
    ])
  })

  it('AC-3504.2 최근 13달의 코드는 옛 달을 골라도 제안 묶음에 든다', () => {
    const codes = [...CODES, code('ESWT1', '체외충격파 1부위', 30, 1_200_000, OLD_MONTH)]
    const { treatments } = blocks({ days: WITH_OLD, codes, groups: [], month: OLD_MONTH })
    if (treatments.kind !== 'rows') throw new Error(treatments.kind)
    expect(treatments.rows.map((row) => [row.name, row.amount])).toEqual([['체외충격파', '120만 원']])
  })
})
