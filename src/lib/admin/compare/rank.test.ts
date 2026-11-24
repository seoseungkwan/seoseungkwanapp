import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatRate } from '@/components/charts/format'
import { sumClosed } from '@/components/stats/sections/SunapSection'
import { sunapPct } from '@/components/stats/sunapView'
import { groupKey } from '@/components/stats/treatmentView'
import { pickRange } from '@/components/stats/periodPick'
import { revisitRates } from '@/components/stats/view'
import { AGE_BANDS, NO_BIRTH } from '@/lib/analytics/patientMix'
import { rateSummary } from '@/lib/calendar/counts'
import { sumPeriod } from '@/lib/revenue/summary'
import { COMPARE_KINDS, type CompareRaw } from './load'
import { hasMonthNumbers, monthSalesDays, REPRESENTATIVE, representative, type CompareRow, type Representative } from './rank'
import { salesRow } from './sales'

// 의원 비교 대표 숫자(spec admin-view REQ-8014 AC-8014.4, design.md '대표 숫자 표'·'의원 비교 달 10년' 끝 줄).
// raw는 admin_rows 종류별 jsonb 줄(load.ts CompareRaw)이고 숫자·이름·묶음은 모두 지어낸 것이다. 고른 달 = 2026년 10월(줄에는 지난달 9월도 섞인다)

const OCT = '2026-10'
const ROOT = process.cwd()

const empty = (): CompareRaw => Object.fromEntries(COMPARE_KINDS.map((kind) => [kind, []])) as unknown as CompareRaw

// stats_days 날 줄(validateDayPayload를 지나는 모양)
type DayOpts = { newPatients?: number; cohort?: number; within30?: number | null; sunap?: Record<string, number> }
function statsDay(day: string, { newPatients = 6, cohort = 0, within30 = null, sunap }: DayOpts = {}) {
  const payload: Record<string, unknown> = {
    schemaVersion: 2,
    quality: 'valid',
    day,
    partial: false,
    totals: { patients: newPatients + 20, newPatients, returning: 20, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort, within7: 0, within14: 0, within30, after30: null },
  }
  if (sunap) payload.sunap = sunap
  return { day, partial: false, source: 'bit', payload, updated_at: '2026-11-01T01:00:00+00:00' }
}

// Block 전환 아홉 칸(내원 = 초진 + 90일초진 + 재진, Block = 구분별 Block 합)
const sunapRates = (firstN: number, firstBlock: number) => ({
  visits: firstN + 10,
  first_n: firstN,
  d90_n: 0,
  ret_n: 10,
  block_n: firstBlock + 2,
  pt_n: 5,
  first_block: firstBlock,
  d90_block: 0,
  ret_block: 2,
})

// sales_days 줄(lib/storage/revenue.ts SAVED_DAY_SELECT 칸)
function salesDay(day: string, total: number, split: { insurer: number; copay: number; noncovered: number; other: number } | null, visits = 100) {
  return {
    day,
    visits,
    new_patients: 10,
    return_visits: visits - 10,
    total,
    insurer: split?.insurer ?? null,
    noncovered: split?.noncovered ?? null,
    copay: split?.copay ?? null,
    other_total: split?.other ?? null,
    cash: 0,
    card: total,
    transfer: 0,
    receivable_in: 0,
    unconfirmed: false,
    split_unconfirmed: split === null,
    rough_total: null,
    day_codes: true,
  }
}

const closedDay = (day: string, firstN: number, rsvFirst: number) => ({
  work_date: day,
  closed_at: `${day}T10:00:00+00:00`,
  late: false,
  visits: 50,
  first_n: firstN,
  d90_n: 3,
  ret_n: 40,
  block_n: 0,
  pt_n: 0,
  rsv_first: rsvFirst,
  rsv_d90: 1,
  first_block: 0,
  d90_block: 0,
  ret_block: 0,
})

const appt = (day: string, status: string, n: number) => ({
  day,
  staff_id: `s${n}`,
  staff_name: `가짜 치료사 ${n}`,
  kind_id: 'k1',
  kind_name: '물리치료',
  status,
  auto: null,
  orig_day: null,
})

// 연령대 열 줄(AGE_BANDS 아홉 + 생년월일 없음), people = 합
function mixSections(month: string, people: Record<string, number>) {
  const age = [...AGE_BANDS, NO_BIRTH].map((name) => ({ name, people: people[name] ?? 0 }))
  return {
    v: 1,
    month,
    partial: false,
    mix: { people: age.reduce((total, row) => total + row.people, 0), age, insurance: [], town: [] },
    hours: { openDays: [4, 4, 5, 5, 5, 4, 0], weekdays: [10, 10, 10, 10, 10, 10, 0], hours: [0, 10, 10, 10, 10, 0, 10, 10, 0, 0, 0, 0, 0], unknown: 0 },
    doctors: [],
  }
}

const GROUP_A = { id: 'ga', name: '물리치료 묶음', codes: ['MM001'], out_codes: null, cond: null, sort_order: 0 }
const GROUP_B = { id: 'gb', name: '도수치료', codes: ['MX111', 'MX112'], out_codes: [], cond: [], sort_order: 1 }
const KEY_A = groupKey(['MM001'])
const KEY_B = groupKey(['MX111', 'MX112'])

// atLeast[0] = n, once = atLeast[0] − atLeast[1]
const dropLine = (group: string, n: number, atLeast: number[], average: number, drop: number) => ({
  group,
  n,
  atLeast,
  ten: 0,
  once: atLeast[0]! - atLeast[1]!,
  average,
  drop,
})

// 10월 자료 하나: 각 대표 숫자를 손으로 셀 수 있게 지었다
function octoberRaw(): CompareRaw {
  const raw = empty()
  raw.sales_days = [
    salesDay('2026-09-30', 9_000_000, { insurer: 5_000_000, copay: 1_000_000, noncovered: 3_000_000, other: 0 }), // 지난달: 비율·목표에 안 듦
    salesDay('2026-10-01', 60_000_000, { insurer: 36_160_000, copay: 5_000_000, noncovered: 18_840_000, other: 0 }),
    salesDay('2026-10-02', 42_000_000, null), // 나눔 없음: 총진료비엔 들고 비급여 비율 분모엔 안 듦
  ]
  raw.stats_days = [
    statsDay('2026-09-29', { cohort: 9, within30: 9 }), // 지난달: 신환 재방문율에 안 듦
    statsDay('2026-10-01', { cohort: 3, within30: 1, sunap: sunapRates(8, 3) }),
    statsDay('2026-10-02', { cohort: 2, within30: 1, sunap: sunapRates(4, 1) }),
    statsDay('2026-10-30', { cohort: 4, within30: null }), // 30일이 안 지나 빠짐
  ]
  raw.sunap_days = [closedDay('2026-09-30', 20, 20), closedDay('2026-10-01', 10, 4), closedDay('2026-10-02', 5, 1)]
  raw.calendar_counts = [appt('2026-09-30', 'came', 1), appt('2026-10-05', 'came', 1), appt('2026-10-06', 'cancel', 2), appt('2026-10-07', 'auto', 3)]
  raw.stats_months = [
    { month: '2026-09', partial: false, rx: [], groups: [], dropoff: null, sections: mixSections('2026-09', { '70대': 900 }) },
    {
      month: OCT,
      partial: false,
      rx: [],
      groups: [],
      // 저장된 average·drop은 쓰지 않는다 — 수(n·atLeast)에서 새로 센다
      dropoff: { asOf: '2026-11-20', lines: [dropLine(KEY_B, 20, [20, 15, 15, 10, 5, 1], 9.9, 1), dropLine(KEY_A, 50, [50, 30, 20, 10, 5, 2], 1.2, 5)] },
      sections: mixSections(OCT, { '40대': 150, '50대': 241, '60대': 200, [NO_BIRTH]: 409 }),
    },
  ]
  raw.stats_rx_groups = [GROUP_B, GROUP_A].map((group) => ({ ...group })) // 읽은 차례가 sort_order와 달라도 sort_order로 고른다
  raw.stats_goals = [{ month: OCT, visits: null, new_patients: null, revenue: 100_000_000 }]
  return raw
}

const text = (rep: Representative) => Object.fromEntries(Object.entries(rep).map(([key, value]) => [key, value.text]))

describe('AC-8014.4 representative — 대표 숫자 여덟(시안 차례)', () => {
  it('AC-8014.4: 칸은 시안의 여덟, 시안 차례(건당 진료비 없음)', () => {
    expect(REPRESENTATIVE.map((column) => column.label)).toEqual([
      '비급여 비율',
      '신환 재방문율 (30일)',
      '신환 예약률',
      'Block 전환율',
      '예약 수',
      '가장 많은 나이대',
      '목표 달성률',
      '3번 이상 받은 비율',
    ])
    expect(REPRESENTATIVE.map((column) => column.label)).not.toContain('건당 진료비')
    expect(Object.keys(representative(empty(), OCT))).toEqual(REPRESENTATIVE.map((column) => column.key))
  })

  it('AC-8014.4: 고른 달 자료로 여덟을 만들고 글은 시안 모양(31.4%·50대 · 24.1%·3건)', () => {
    expect(text(representative(octoberRaw(), OCT))).toEqual({
      nonpay: '31.4%',
      revisit30: '40.0%',
      rsvFirst: '33.3%',
      block: '33.3%',
      appts: '3건',
      age: '50대 · 24.1%',
      goal: '102.0%',
      three: '40.0%',
    })
  })

  it('AC-8014.4: 값(줄 세우기)은 % 숫자 그대로(버리지 않음)이고 예약 수는 건수', () => {
    const rep = representative(octoberRaw(), OCT)
    expect(rep.nonpay.value).toBeCloseTo(31.4, 9)
    expect(rep.rsvFirst.value).toBeCloseTo((5 / 15) * 100, 9)
    expect(rep.block.value).toBeCloseTo((4 / 12) * 100, 9)
    expect(rep.appts.value).toBe(3)
    expect(rep.age.value).toBeCloseTo(24.1, 9)
    expect(rep.goal.value).toBeCloseTo(102, 9)
    expect(rep.three.value).toBeCloseTo(40, 9)
  })

  it('AC-8014.4: 비급여 비율 = 통계 탭 sumPeriod의 나눔 맞는 날 비급여 ÷ 총액(그달만)', () => {
    const raw = octoberRaw()
    const sum = sumPeriod(monthSalesDays(raw, OCT), { from: '2026-10-01', to: '2026-10-31' })!
    expect(representative(raw, OCT).nonpay.text).toBe(`${formatRate(sum.noncovered! / sum.splitTotal!)}%`)
  })

  it('AC-8014.4: 신환 재방문율 (30일) = 통계 탭 revisitRates의 30일 줄(그달을 고른 통계 탭과 같은 기간, 끝난 신환만)', () => {
    const raw = octoberRaw()
    const days = raw.stats_days.map((row) => row.payload) as never
    const rates = revisitRates({ days, covered: [], range: pickRange('2026-11-01', { kind: 'month', unit: 'day', month: OCT }, false) })
    expect(rates.d30.kind).toBe('rate')
    expect(representative(raw, OCT).revisit30.text).toBe(`${formatRate(rates.d30.kind === 'rate' ? rates.d30.value : 0)}%`)
  })

  it('AC-8014.4: 신환 예약률 = 그달 마감한 날 sumClosed, 글은 sunapView의 sunapPct', () => {
    const sums = sumClosed([
      { day: '2026-10-01', late: false, totals: { first_n: 10, rsv_first: 4, d90_n: 3, rsv_d90: 1 } },
      { day: '2026-10-02', late: false, totals: { first_n: 5, rsv_first: 1, d90_n: 3, rsv_d90: 1 } },
    ])
    expect(representative(octoberRaw(), OCT).rsvFirst.text).toBe(sunapPct(sums.rsvFirst, sums.first))
  })

  it('AC-8014.4: Block 전환율 = 그달 날 줄 sunap을 더한 first_block ÷ first_n(sunapPct 모양)', () => {
    expect(representative(octoberRaw(), OCT).block.text).toBe(sunapPct(3 + 1, 8 + 4))
  })

  it('AC-8014.4: 예약 수 = 그달 calendar_counts의 rateSummary total(취소 포함, 지난달 뺌)', () => {
    const raw = octoberRaw()
    const october = raw.calendar_counts.slice(1).map((row) => ({
      staffId: row.staff_id as string,
      staffName: row.staff_name as string,
      kindId: row.kind_id as string,
      kindName: row.kind_name as string,
      status: row.status as 'came',
      auto: null,
      origDay: null,
    }))
    expect(representative(raw, OCT).appts.value).toBe(rateSummary(october).total)
  })

  it('AC-8014.4: 가장 많은 나이대 = 그달 sections.mix.age 가운데 가장 많은 나이대(생년월일 없음은 나이대가 아님) ÷ mix.people', () => {
    const raw = octoberRaw()
    const rep = representative(raw, OCT)
    expect(rep.age.text).toBe('50대 · 24.1%')
  })

  it('AC-8014.4: 가장 많은 나이대 — 같으면 통계 탭 차례로 앞', () => {
    const raw = octoberRaw()
    raw.stats_months[1]!.sections = mixSections(OCT, { '30대': 300, '60대': 300, '40대': 100 })
    expect(representative(raw, OCT).age.text).toBe('30대 · 42.8%')
  })

  it('AC-8014.4: 목표 달성률 = 그달 총진료비(salesRow) × 100 ÷ 그달 매출 목표, 소수 첫째 자리 버림(goalPace 아님)', () => {
    const raw = octoberRaw()
    const total = salesRow(monthSalesDays(raw, OCT))!.total!
    expect(total).toBe(102_000_000)
    expect(representative(raw, OCT).goal.text).toBe('102.0%')
    const source = readFileSync(join(ROOT, 'src/lib/admin/compare/rank.ts'), 'utf8')
    expect(source).not.toMatch(/goalPace/)
  })

  it('AC-8014.4: 3번 이상 받은 비율 = 그 의원 처방 묶음(sort_order) 차례 첫 묶음 줄의 atLeast[2] ÷ n — 저장된 average·drop을 쓰지 않는다', () => {
    const raw = octoberRaw()
    expect(representative(raw, OCT).three.text).toBe('40.0%') // 첫 묶음 = 물리치료 묶음(sort 0): 20 ÷ 50
    // average·drop을 바꿔도 같다
    const months = raw.stats_months[1]!
    const dropoff = months.dropoff as { lines: Record<string, unknown>[] }
    dropoff.lines = dropoff.lines.map((line) => ({ ...line, average: 4.4, drop: 2 }))
    expect(representative(raw, OCT).three.text).toBe('40.0%')
  })

  it('AC-8014.4: 3번 이상 — 첫 묶음 줄이 없으면 다음 묶음, 지금 묶음에 없는 열쇠만 있으면 –', () => {
    const raw = octoberRaw()
    const months = raw.stats_months[1]!
    months.dropoff = { asOf: '2026-11-20', lines: [dropLine(KEY_B, 20, [20, 15, 15, 10, 5, 1], 9.9, 1)] }
    expect(representative(raw, OCT).three.text).toBe('75.0%')
    months.dropoff = { asOf: '2026-11-20', lines: [dropLine(groupKey(['ZZ999']), 20, [20, 15, 15, 10, 5, 1], 9.9, 1)] }
    expect(representative(raw, OCT).three).toEqual({ value: null, text: null })
  })

  it('AC-8014.4: 자료가 없으면 여덟 모두 null(화면 –)', () => {
    const rep = representative(empty(), OCT)
    for (const column of REPRESENTATIVE) expect(rep[column.key], column.label).toEqual({ value: null, text: null })
  })

  it('AC-8014.4: 합계 저장 전 달(날 줄 sunap·달 줄 dropoff 없음)은 Block 전환율·3번 이상만 –', () => {
    const raw = octoberRaw()
    raw.stats_days = raw.stats_days.map((row) => {
      const payload = { ...(row.payload as Record<string, unknown>) }
      delete payload.sunap
      return { ...row, payload }
    })
    raw.stats_months = raw.stats_months.map((row) => ({ ...row, dropoff: null }))
    const rep = representative(raw, OCT)
    expect(rep.block).toEqual({ value: null, text: null })
    expect(rep.three).toEqual({ value: null, text: null })
    expect(rep.nonpay.text).toBe('31.4%')
    expect(rep.revisit30.text).toBe('40.0%')
  })

  it('AC-8014.4: 그달 줄이 지난달에만 있으면 –(지난달 숫자를 쓰지 않는다)', () => {
    const raw = octoberRaw()
    const rep = representative(raw, '2026-09')
    expect(rep.three).toEqual({ value: null, text: null }) // 9월 dropoff 없음
    expect(rep.age.text).toBe('70대 · 100.0%')
    expect(rep.goal).toEqual({ value: null, text: null }) // 9월 목표 없음
  })

  it('AC-8014.4: 분모가 0이거나 나눔 맞는 날·마감한 날·목표·sections가 없으면 그 칸만 –', () => {
    const raw = octoberRaw()
    raw.sales_days = [salesDay('2026-10-01', 50_000_000, null)]
    raw.sunap_days = [closedDay('2026-10-01', 0, 0)]
    raw.stats_goals = [{ month: OCT, visits: 3000, new_patients: null, revenue: null }]
    raw.stats_months = raw.stats_months.map((row) => ({ ...row, sections: null }))
    raw.calendar_counts = []
    const rep = representative(raw, OCT)
    expect(rep.nonpay.text).toBeNull()
    expect(rep.rsvFirst.text).toBeNull()
    expect(rep.goal.text).toBeNull()
    expect(rep.age.text).toBeNull()
    expect(rep.appts.text).toBeNull()
    expect(rep.revisit30.text).toBe('40.0%')
  })

  it('AC-8014.4: 모양이 틀린 줄은 지금 줄 검사처럼 버린다(날 줄 검사·출처·날짜)', () => {
    const raw = octoberRaw()
    raw.stats_days = [
      { ...statsDay('2026-10-01', { cohort: 3, within30: 3 }), source: 'other' },
      { ...statsDay('2026-10-02', { cohort: 3, within30: 3 }), day: '2026-10-03' },
      { ...statsDay('2026-10-04', { cohort: 3, within30: 3 }), payload: { schemaVersion: 1 } },
    ]
    raw.sales_days = [{ ...salesDay('2026-10-01', 60_000_000, null), total: '6천만' }]
    const rep = representative(raw, OCT)
    expect(rep.revisit30.text).toBeNull()
    expect(monthSalesDays(raw, OCT)).toEqual([])
  })

  it('AC-8014.4: sunapPct는 src/components/stats/sunapView.ts에서 가져온다(SunapSection에서 가져오지 않음)', () => {
    const source = readFileSync(join(ROOT, 'src/lib/admin/compare/rank.ts'), 'utf8')
    expect(source).toMatch(/import \{[^}]*\bsunapPct\b[^}]*\} from '@\/components\/stats\/sunapView'/)
    const fromSection = source.match(/import \{([^}]*)\} from '@\/components\/stats\/sections\/SunapSection'/)
    expect(fromSection?.[1] ?? '').not.toMatch(/sunapPct/)
  })
})

describe('AC-8014.4 monthSalesDays — sales_days 줄 → 매출 날 줄(그달만)', () => {
  it('AC-8014.4: 칸 이름을 매출 날 줄 모양으로 바꾸고 그달 날만 남긴다', () => {
    const got = monthSalesDays(octoberRaw(), OCT)
    expect(got.map((row) => row.date)).toEqual(['2026-10-01', '2026-10-02'])
    expect(got[0]).toMatchObject({ visits: 100, newPatients: 10, returnVisits: 90, total: 60_000_000, noncovered: 18_840_000, otherTotal: 0, unconfirmed: false, splitUnconfirmed: false, roughTotal: null })
  })
})

describe('AC-8023.3 hasMonthNumbers — 그달 숫자가 있는 의원인지', () => {
  const base: CompareRow = { id: 'h1', name: '가나 정형외과의원', own: false, region: '서울', sales: null, pay: null, rep: null }
  it('AC-8023.3: 매출 줄이나 대표 숫자 하나라도 있으면 참, 급여만 있으면 거짓', () => {
    expect(hasMonthNumbers(base)).toBe(false)
    expect(hasMonthNumbers({ ...base, rep: representative(empty(), OCT) })).toBe(false)
    expect(hasMonthNumbers({ ...base, pay: { none: false, jobs: {} as never, partTime: 1 } })).toBe(false)
    expect(hasMonthNumbers({ ...base, rep: representative(octoberRaw(), OCT) })).toBe(true)
    expect(hasMonthNumbers({ ...base, sales: { total: 1, visits: 1, newPatients: 0, returnVisits: 1, dayAvg: 1, days: 1 } })).toBe(true)
  })
})
