import { describe, expect, it } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import { toUisDayPayload } from '@/lib/payload/uisarang'
import type { ReportInput, ReportMetric } from '@/types/aiReport'
import type { UisRxRow } from '@/types/uisarang'
import { reportFingerprint } from './input'
import { UIS_TOP_RX, buildUisReportInput, validateUisReportMonths, type UisReportRaw } from './uisInput'

// 의사랑 AI 경영 리포트 입력(specs/uisarang-upload REQ-8816, design.md §10-5). 순수 함수만 시험한다 — DB·Claude에 붙지 않는다.
// 숫자·처방 코드·이름은 이 파일 안에서 지어낸 것이다(실제 의사랑 엑셀을 쓰지 않는다). 고른 달 2026-10 · 오늘 2026-11-27

const MONTH = '2026-10'
const PREV = '2026-09'
const LAST_YEAR = '2025-10'
const TODAY = '2026-11-27'

const AGE_NAMES = ['10세 미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80세 이상', '생년월일 없음']

// ── 줄 만들기(서버가 DB에서 읽은 날 모양 그대로: 칸 이름은 DB 칸) ──
const dayRow = (day: string, patients: number, newPatients: number) => ({ day, payload: toUisDayPayload({ day, patients, newPatients }) })
const covRow = (from: string, to: string) => ({ from_day: from, to_day: to })
const salesRow = (day: string, total: number | null, rough: number | null = null) => ({ day, total, rough_total: rough })
const rxRow = (from: string, to: string, rows: UisRxRow[], updated = '2026-11-01T00:00:00.000Z') => ({
  from_day: from,
  to_day: to,
  payload: { v: 1, rows, total: null },
  updated_at: updated,
})
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
const ageRow = (day: string, bands: number[], newBands: number[]) => ({
  from_day: day,
  to_day: day,
  payload: { v: 1, patients: sum(bands), newPatients: sum(newBands), bands, newBands },
  updated_at: '2026-11-01T00:00:00.000Z',
})
const rx = (code: string, name: string, qty: number, amount: number): UisRxRow => ({ code, name, qty, amount })

// 묶음(store.ts groupDefsOf가 만드는 모양): 숫자가 든 이름 'ESWT 1부위' · 넣는 처방 둘 · 빼는 처방이 있는 묶음
const ESWT = groupKey(['ESWT 1부위'])
const MANUAL = groupKey(['MT01', 'mt02'])
const SHOT = groupKey(['carm'], { out: ['FAKE-X'] })
const GROUPS: UisReportRaw['groups'] = [
  { key: ESWT, name: 'ESWT 1부위', codes: ['ESWT 1부위'], out: [], cond: [] },
  { key: MANUAL, name: '도수치료', codes: ['MT01', 'mt02'], out: [], cond: [] },
  { key: SHOT, name: '근육주사', codes: ['carm'], out: ['FAKE-X'], cond: [] },
]

// 10월: 다 덮임(1~31일) · 진료한 날 셋(1·2·5일, 나머지는 휴진) · 한 달 처방 줄 · 날마다 나이대
const OCT_DAYS = [dayRow('2026-10-01', 50, 5), dayRow('2026-10-02', 40, 4), dayRow('2026-10-05', 30, 3)]
const OCT_SALES = [salesRow('2026-10-01', 1_000_000), salesRow('2026-10-02', null, 800_000), salesRow('2026-10-05', 600_000)]
const OCT_RX = rxRow('2026-10-01', '2026-10-31', [
  rx('ESWT 1부위', '체외충격파 1부위', 12.5, 600_000),
  rx('MT01', '도수 가', 30, 1_500_000),
  rx('carm', '근육주사 가', 7.25, 70_000),
  rx('mt02', '도수 나', 4, 200_000),
])
const OCT_AGES = [
  ageRow('2026-10-01', [0, 1, 2, 3, 10, 10, 14, 8, 2, 0], [0, 0, 1, 0, 1, 1, 1, 1, 0, 0]),
  ageRow('2026-10-02', [0, 0, 2, 3, 8, 10, 10, 5, 2, 0], [0, 0, 0, 1, 1, 1, 1, 0, 0, 0]),
  ageRow('2026-10-05', [0, 0, 1, 2, 5, 8, 8, 4, 2, 0], [0, 0, 0, 0, 1, 1, 1, 0, 0, 0]),
]
// 9월: 다 덮임 · 진료한 날 둘 · 한 달 처방 줄(MT01·ESWT만)
const SEP_DAYS = [dayRow('2026-09-01', 45, 6), dayRow('2026-09-02', 35, 2)]
const SEP_SALES = [salesRow('2026-09-01', 900_000), salesRow('2026-09-02', 700_000)]
const SEP_RX = rxRow('2026-09-01', '2026-09-30', [rx('ESWT 1부위', '체외충격파 1부위', 10, 480_000), rx('MT01', '도수 가', 28, 1_400_000)])
const SEP_AGES = [
  ageRow('2026-09-01', [0, 0, 2, 3, 10, 10, 12, 6, 2, 0], [0, 0, 1, 1, 1, 1, 1, 1, 0, 0]),
  ageRow('2026-09-02', [0, 0, 1, 2, 8, 8, 10, 4, 2, 0], [0, 0, 0, 0, 1, 1, 0, 0, 0, 0]),
]

function baseRaw(): UisReportRaw {
  return {
    days: [...OCT_DAYS, ...SEP_DAYS],
    coverage: [covRow('2026-10-01', '2026-10-31'), covRow('2026-09-01', '2026-09-30')],
    sales: [...OCT_SALES, ...SEP_SALES],
    rx: [OCT_RX, SEP_RX],
    age: [...OCT_AGES, ...SEP_AGES],
    groups: GROUPS.map((g) => ({ ...g, codes: [...g.codes], out: [...g.out], cond: [...g.cond] })),
  }
}

const build = (raw: UisReportRaw, month = MONTH, today = TODAY): ReportInput | null => {
  const valid = validateUisReportMonths(raw, month, today)
  return valid === null ? null : buildUisReportInput(valid)
}
const built = (raw: UisReportRaw, month = MONTH, today = TODAY): ReportInput => {
  const input = build(raw, month, today)
  if (input === null) throw new Error('입력이 없다')
  return input
}
const metricOf = (input: ReportInput, id: string): ReportMetric => {
  const found = input.metrics.find((m) => m.id === id)
  if (found === undefined) throw new Error(`지표 없음: ${id}`)
  return found
}
const valuesOf = (input: ReportInput, id: string) => metricOf(input, id).values
const m = (id: string, label: string, kind: ReportMetric['kind'], selected: number | null, prev: number | null, lastYear: number | null = null): ReportMetric => ({
  id,
  label,
  kind,
  values: { selected, prev, lastYear },
})

const OCT_AGE_SUMS = [0, 1, 5, 8, 23, 28, 32, 17, 6, 0]
const SEP_AGE_SUMS = [0, 0, 3, 5, 18, 18, 22, 10, 4, 0]

describe('AC-8816.2: 지표 차례 · id · label · kind', () => {
  it('AC-8816.2: 다 덮인 10월·9월(작년 같은 달 없음) → 접수 건수·신환·재진·총진료비 · 묶음마다 처방량·총액 · 총액 큰 처방 · 나이대 열 줄 · 끝에 source', () => {
    expect(built(baseRaw())).toEqual({
      month: MONTH,
      partial: false,
      prevMonth: PREV,
      lastYearMonth: LAST_YEAR,
      hasPrev: true,
      hasLastYear: false,
      metrics: [
        m('total.patients', '접수 건수', 'visits', 120, 80),
        m('total.newPatients', '신환', 'count', 12, 8),
        m('total.returning', '재진', 'visits', 108, 72),
        m('sales.total', '총진료비', 'won', 2_400_000, 1_600_000),
        m(`group:${ESWT}.qty`, "처방 그룹 'ESWT 1부위' 처방량", 'qty', 12.5, 10),
        m(`group:${ESWT}.amount`, "처방 그룹 'ESWT 1부위' 총액", 'won', 600_000, 480_000),
        m(`group:${MANUAL}.qty`, "처방 그룹 '도수치료' 처방량", 'qty', 34, 28),
        m(`group:${MANUAL}.amount`, "처방 그룹 '도수치료' 총액", 'won', 1_700_000, 1_400_000),
        m(`group:${SHOT}.qty`, "처방 그룹 '근육주사' 처방량", 'qty', 7.25, 0),
        m(`group:${SHOT}.amount`, "처방 그룹 '근육주사' 총액", 'won', 70_000, 0),
        m('rx:MT01.qty', "처방 '도수 가' 처방량", 'qty', 30, 28),
        m('rx:MT01.amount', "처방 '도수 가' 총액", 'won', 1_500_000, 1_400_000),
        m('rx:ESWT 1부위.qty', "처방 '체외충격파 1부위' 처방량", 'qty', 12.5, 10),
        m('rx:ESWT 1부위.amount', "처방 '체외충격파 1부위' 총액", 'won', 600_000, 480_000),
        m('rx:mt02.qty', "처방 '도수 나' 처방량", 'qty', 4, 0),
        m('rx:mt02.amount', "처방 '도수 나' 총액", 'won', 200_000, 0),
        m('rx:carm.qty', "처방 '근육주사 가' 처방량", 'qty', 7.25, 0),
        m('rx:carm.amount', "처방 '근육주사 가' 총액", 'won', 70_000, 0),
        ...AGE_NAMES.map((name, i) => m(`agevisit:${name}`, `연령대 '${name}' 내원 건수`, 'visits', OCT_AGE_SUMS[i], SEP_AGE_SUMS[i])),
      ],
      source: 'uisarang',
    })
  })

  it("AC-8816.2: 입력 열쇠 차례는 지금 모양 그대로이고 맨 끝에 source: 'uisarang'이 붙는다", () => {
    const input = built(baseRaw())
    expect(Object.keys(input)).toEqual(['month', 'partial', 'prevMonth', 'lastYearMonth', 'hasPrev', 'hasLastYear', 'metrics', 'source'])
    expect(input.source).toBe('uisarang')
    for (const metric of input.metrics) expect(Object.keys(metric)).toEqual(['id', 'label', 'kind', 'values'])
  })

  it('AC-8816.2: 신환 재방문율·처방별 환자 수·동네·보험·원장님별·시간대별·요일·비트 연령대(환자) 지표가 없다', () => {
    const ids = built(baseRaw()).metrics.map((metric) => metric.id)
    for (const id of ids) {
      expect(id).not.toMatch(/^(revisit\.|region:|insurance:|town:|doctor:|hour:|weekday:|age:)/)
      expect(id).not.toMatch(/^(group|rx):.*\.(patients|newPatients|returning)$/)
    }
    expect(built(baseRaw()).metrics.map((metric) => metric.label).join('|')).not.toMatch(/환자'|재방문|하루 평균|원장님/)
  })

  it(`AC-8816.2: 처방은 고른 달 총액 큰 ${UIS_TOP_RX}개(같은 총액은 코드 차례)만 · 처방량 다음 총액`, () => {
    expect(UIS_TOP_RX).toBe(20)
    const rows = Array.from({ length: 25 }, (_, i) => rx(`FAKE-${String(i).padStart(2, '0')}`, `가짜 처방 ${i}`, 1, i < 2 ? 500 : 1000 + i))
    const raw = { ...baseRaw(), rx: [rxRow('2026-10-01', '2026-10-31', rows)] }
    const ids = built(raw)
      .metrics.filter((metric) => metric.id.startsWith('rx:'))
      .map((metric) => metric.id)
    // 1024~1002(23개) 가운데 큰 20개 → FAKE-24…FAKE-05, 500인 FAKE-00·01과 1002~1004(FAKE-02~04)는 빠진다
    const expected = Array.from({ length: 20 }, (_, i) => `FAKE-${String(24 - i).padStart(2, '0')}`).flatMap((code) => [`rx:${code}.qty`, `rx:${code}.amount`])
    expect(ids).toEqual(expected)
  })

  it('AC-8816.2: 같은 총액은 코드 글자 차례 · 이름이 빈칸뿐이면 코드를 이름으로 쓴다', () => {
    const raw = { ...baseRaw(), rx: [rxRow('2026-10-01', '2026-10-31', [rx('FAKE-A', '가짜 가', 1, 100), rx('FAKE-B', '   ', 2, 100)])] }
    const rxMetrics = built(raw).metrics.filter((metric) => metric.id.startsWith('rx:'))
    expect(rxMetrics.map((metric) => [metric.id, metric.label])).toEqual([
      ['rx:FAKE-A.qty', "처방 '가짜 가' 처방량"],
      ['rx:FAKE-A.amount', "처방 '가짜 가' 총액"],
      ['rx:FAKE-B.qty', "처방 'FAKE-B' 처방량"],
      ['rx:FAKE-B.amount', "처방 'FAKE-B' 총액"],
    ])
  })

  it('AC-8816.2: 묶음이 없으면 묶음 지표가 없고, 받은 묶음 차례 그대로다', () => {
    const none = built({ ...baseRaw(), groups: [] })
    expect(none.metrics.some((metric) => metric.id.startsWith('group:'))).toBe(false)
    const reversed = built({ ...baseRaw(), groups: [...GROUPS].reverse() })
    expect(reversed.metrics.filter((metric) => metric.id.startsWith('group:')).map((metric) => metric.id)).toEqual([
      `group:${SHOT}.qty`,
      `group:${SHOT}.amount`,
      `group:${MANUAL}.qty`,
      `group:${MANUAL}.amount`,
      `group:${ESWT}.qty`,
      `group:${ESWT}.amount`,
    ])
  })
})

describe('AC-8816.3: 값과 null 규칙', () => {
  it('AC-8816.3: 처방은 한 주·하루 줄로 덮여도 더한다(겹치지 않게 tileRx)', () => {
    // 10월 1일(목)~4일(일)은 하루 줄, 5일(월)~11일(일)은 한 주 줄 · 12일 뒤는 휴진(덮었고 진료 없음)
    const raw = {
      ...baseRaw(),
      rx: [
        rxRow('2026-10-01', '2026-10-01', [rx('MT01', '도수 가', 10, 500_000)]),
        rxRow('2026-10-02', '2026-10-02', [rx('MT01', '도수 가', 8, 400_000), rx('carm', '근육주사 가', 1.125, 10_000)]),
        rxRow('2026-10-05', '2026-10-11', [rx('MT01', '도수 가', 12, 600_000)]),
        SEP_RX,
      ],
    }
    const input = built(raw)
    expect(valuesOf(input, 'rx:MT01.qty')).toEqual({ selected: 30, prev: 28, lastYear: null })
    expect(valuesOf(input, 'rx:MT01.amount')).toEqual({ selected: 1_500_000, prev: 1_400_000, lastYear: null })
    expect(valuesOf(input, 'rx:carm.qty')).toEqual({ selected: 1.125, prev: 0, lastYear: null })
    expect(valuesOf(input, `group:${MANUAL}.qty`)).toEqual({ selected: 30, prev: 28, lastYear: null })
  })

  it('AC-8816.3: 진료한 날 하나라도 처방 줄이 없으면(tileRx 모자람) 그 달 처방·묶음 지표는 null · 고른 달이면 처방 지표 줄이 없다', () => {
    const raw = { ...baseRaw(), rx: [rxRow('2026-10-01', '2026-10-01', [rx('MT01', '도수 가', 10, 500_000)]), SEP_RX] }
    const input = built(raw)
    expect(input.metrics.some((metric) => metric.id.startsWith('rx:'))).toBe(false)
    expect(valuesOf(input, `group:${MANUAL}.qty`)).toEqual({ selected: null, prev: 28, lastYear: null })
    expect(valuesOf(input, `group:${MANUAL}.amount`)).toEqual({ selected: null, prev: 1_400_000, lastYear: null })
    // 다른 지표는 그대로
    expect(valuesOf(input, 'total.patients')).toEqual({ selected: 120, prev: 80, lastYear: null })
  })

  it('AC-8816.3: 비교 달 처방이 모자라면 그 달 처방·묶음 값만 null', () => {
    const raw = { ...baseRaw(), rx: [OCT_RX] }
    const input = built(raw)
    expect(input.hasPrev).toBe(true)
    expect(valuesOf(input, 'rx:MT01.qty')).toEqual({ selected: 30, prev: null, lastYear: null })
    expect(valuesOf(input, `group:${ESWT}.amount`)).toEqual({ selected: 600_000, prev: null, lastYear: null })
    expect(valuesOf(input, 'total.patients')).toEqual({ selected: 120, prev: 80, lastYear: null })
  })

  it('AC-8816.3: 진료한 날 가운데 나이대 줄이 없는 날이 있으면 그 달 나이대 열 줄 모두 null', () => {
    const raw = { ...baseRaw(), age: [OCT_AGES[0], OCT_AGES[1], ...SEP_AGES] }
    const input = built(raw)
    for (const name of AGE_NAMES) expect(valuesOf(input, `agevisit:${name}`).selected).toBeNull()
    expect(valuesOf(input, 'agevisit:40대').prev).toBe(18)
  })

  it('AC-8816.3: 총진료비는 그 달 매출 줄의 그날 매출(total, 없으면 rough_total) 합 · 매출 줄이 없으면 null · 둘 다 null인 날은 건너뜀', () => {
    expect(valuesOf(built(baseRaw()), 'sales.total')).toEqual({ selected: 2_400_000, prev: 1_600_000, lastYear: null })
    const noOct = built({ ...baseRaw(), sales: SEP_SALES })
    expect(valuesOf(noOct, 'sales.total')).toEqual({ selected: null, prev: 1_600_000, lastYear: null })
    const unknownDay = built({ ...baseRaw(), sales: [...OCT_SALES, salesRow('2026-10-06', null, null), ...SEP_SALES] })
    expect(valuesOf(unknownDay, 'sales.total').selected).toBe(2_400_000)
    const allUnknown = built({ ...baseRaw(), sales: [salesRow('2026-10-01', null, null), ...SEP_SALES] })
    expect(valuesOf(allUnknown, 'sales.total').selected).toBeNull()
  })

  it('AC-8816.3: 재진 = 접수 건수 − 신환 · 처방이 없는 묶음 코드는 0', () => {
    const input = built(baseRaw())
    expect(valuesOf(input, 'total.returning')).toEqual({ selected: 108, prev: 72, lastYear: null })
    expect(valuesOf(input, `group:${SHOT}.qty`).prev).toBe(0)
  })
})

describe('AC-8816.4: partial · 비교 달 · E-AI-NO-DATA', () => {
  it('AC-8816.4: 고른 달에 의사랑 날 줄이 없으면 null(E-AI-NO-DATA) — 비교 달 줄만 있어도', () => {
    expect(build({ ...baseRaw(), days: SEP_DAYS })).toBeNull()
    expect(build({ days: [], coverage: [], sales: [], rx: [], age: [], groups: [] })).toBeNull()
  })

  it('AC-8816.4: 이번 달은 partial · 처방은 1일~어제만 덮으면 값(오늘·오늘 뒤 줄은 쓰지 않음)', () => {
    const today = '2026-11-04'
    const raw: UisReportRaw = {
      days: [dayRow('2026-11-02', 20, 2), dayRow('2026-11-03', 22, 1), dayRow('2026-11-04', 9, 0), ...OCT_DAYS],
      coverage: [covRow('2026-11-01', '2026-11-04'), covRow('2026-10-01', '2026-10-31')],
      sales: [salesRow('2026-11-02', 300_000), salesRow('2026-11-03', 310_000)],
      rx: [
        rxRow('2026-11-02', '2026-11-02', [rx('MT01', '도수 가', 3, 150_000)]),
        rxRow('2026-11-03', '2026-11-03', [rx('MT01', '도수 가', 2, 100_000)]),
        rxRow('2026-11-04', '2026-11-04', [rx('MT01', '도수 가', 100, 5_000_000)]),
        OCT_RX,
      ],
      age: [],
      groups: GROUPS,
    }
    const input = built(raw, '2026-11', today)
    expect(input.partial).toBe(true)
    expect(input.month).toBe('2026-11')
    expect(input.hasPrev).toBe(true)
    expect(valuesOf(input, 'total.patients')).toEqual({ selected: 51, prev: 120, lastYear: null })
    expect(valuesOf(input, 'rx:MT01.qty')).toEqual({ selected: 5, prev: 30, lastYear: null })
    expect(valuesOf(input, 'rx:MT01.amount')).toEqual({ selected: 250_000, prev: 1_500_000, lastYear: null })
    expect(valuesOf(input, 'sales.total').selected).toBe(610_000)
  })

  it('AC-8816.4: 지난 달이어도 덮이지 않은 날이 있으면 고른 달은 partial', () => {
    const input = built({ ...baseRaw(), coverage: [covRow('2026-10-01', '2026-10-30'), covRow('2026-09-01', '2026-09-30')] })
    expect(input.partial).toBe(true)
    expect(input.hasPrev).toBe(true)
  })

  it('AC-8816.4: 비교 달은 다 덮인 달만 견준다 — 덮이지 않은 날이 있으면 hasPrev 거짓·그 달 값 모두 null', () => {
    const input = built({ ...baseRaw(), coverage: [covRow('2026-10-01', '2026-10-31'), covRow('2026-09-02', '2026-09-30')] })
    expect(input.hasPrev).toBe(false)
    expect(input.partial).toBe(false)
    for (const metric of input.metrics) expect(metric.values.prev, metric.id).toBeNull()
  })

  it('AC-8816.4: 작년 같은 달이 다 덮였으면 hasLastYear 참이고 값이 들어간다(해가 바뀌는 1월도 달 셈은 addMonths)', () => {
    const raw = {
      ...baseRaw(),
      days: [...OCT_DAYS, ...SEP_DAYS, dayRow('2025-10-02', 33, 3)],
      coverage: [...baseRaw().coverage, covRow('2025-09-20', '2025-11-10')],
      sales: [...OCT_SALES, ...SEP_SALES, salesRow('2025-10-02', 500_000)],
    }
    const input = built(raw)
    expect(input.hasLastYear).toBe(true)
    expect(valuesOf(input, 'total.patients')).toEqual({ selected: 120, prev: 80, lastYear: 33 })
    expect(valuesOf(input, 'sales.total').lastYear).toBe(500_000)
    // 작년 10월 처방 줄이 없어 처방 값은 null
    expect(valuesOf(input, 'rx:MT01.qty').lastYear).toBeNull()
    const january = built({ ...raw, days: [dayRow('2027-01-04', 10, 1)], coverage: [covRow('2027-01-01', '2027-01-31')] }, '2027-01', '2027-03-01')
    expect([january.prevMonth, january.lastYearMonth]).toEqual(['2026-12', '2026-01'])
    expect([january.hasPrev, january.hasLastYear]).toEqual([false, false])
  })

  it('AC-8816.4: 같은 입력이면 같은 지문 — 줄 차례가 바뀌어도 같다', async () => {
    const a = built(baseRaw())
    const b = built(baseRaw())
    const shuffled = baseRaw()
    const reversedRaw: UisReportRaw = {
      ...shuffled,
      days: [...shuffled.days].reverse(),
      coverage: [...shuffled.coverage].reverse(),
      sales: [...shuffled.sales].reverse(),
      rx: [...shuffled.rx].reverse(),
      age: [...shuffled.age].reverse(),
    }
    const c = built(reversedRaw)
    expect(await reportFingerprint(a)).toBe(await reportFingerprint(b))
    expect(await reportFingerprint(c)).toBe(await reportFingerprint(a))
    expect(await reportFingerprint(built({ ...baseRaw(), sales: SEP_SALES }))).not.toBe(await reportFingerprint(a))
  })
})

describe('AC-8816.9: 서버가 읽은 의사랑 줄 검사', () => {
  it('AC-8816.9: 고른 달 날 줄 하나가 validateDayPayload를 못 지나면 그 달 날 숫자 없음 → null(E-AI-NO-DATA)', () => {
    const broken = { day: '2026-10-03', payload: { ...toUisDayPayload({ day: '2026-10-03', patients: 5, newPatients: 1 }), totals: 'x' } }
    expect(build({ ...baseRaw(), days: [...OCT_DAYS, broken, ...SEP_DAYS] })).toBeNull()
  })

  it('AC-8816.9: payload.day가 줄 day와 다르면 어긴 줄이다', () => {
    const moved = { day: '2026-10-03', payload: toUisDayPayload({ day: '2026-10-04', patients: 5, newPatients: 1 }) }
    expect(build({ ...baseRaw(), days: [...OCT_DAYS, moved] })).toBeNull()
  })

  it('AC-8816.9: 같은 날 줄이 둘이면 어긴 것으로 본다(더해 두 번 세지 않는다)', () => {
    expect(build({ ...baseRaw(), days: [...OCT_DAYS, dayRow('2026-10-01', 50, 5), ...SEP_DAYS] })).toBeNull()
  })

  it('AC-8816.9: 비교 달 날 줄이 어기면 그 달만 없는 달(hasPrev 거짓)', () => {
    const broken = { day: '2026-09-03', payload: null }
    const input = built({ ...baseRaw(), days: [...OCT_DAYS, ...SEP_DAYS, broken] })
    expect(input.hasPrev).toBe(false)
    expect(valuesOf(input, 'total.patients')).toEqual({ selected: 120, prev: null, lastYear: null })
  })

  it.each([
    ['날짜 모양이 아닌 day', { day: '2026-10-1', payload: null }],
    ['글자가 아닌 day', { day: 20261001, payload: null }],
    ['세 달 밖 day', dayRow('2026-08-31', 5, 1)],
    ['객체가 아닌 줄', null],
  ])('AC-8816.9: 어느 달 줄인지 모를 날 줄(%s)이 있으면 세 달 모두 날 숫자 없음 → null', (_name, row) => {
    expect(build({ ...baseRaw(), days: [...OCT_DAYS, ...SEP_DAYS, row] })).toBeNull()
  })

  it.each([
    ['음수 total', salesRow('2026-10-07', -1)],
    ['소수 total', salesRow('2026-10-07', 1.5)],
    ['글자 total', { day: '2026-10-07', total: '100', rough_total: null }],
    ['음수 rough_total', salesRow('2026-10-07', null, -5)],
    ['칸이 없음', { day: '2026-10-07', total: 100 }],
    ['같은 날 두 줄', salesRow('2026-10-01', 5)],
  ])('AC-8816.9: 고른 달 매출 줄 하나가 어기면(%s) 그 달 총진료비만 null', (_name, row) => {
    const input = built({ ...baseRaw(), sales: [...OCT_SALES, row, ...SEP_SALES] })
    expect(valuesOf(input, 'sales.total')).toEqual({ selected: null, prev: 1_600_000, lastYear: null })
    expect(valuesOf(input, 'total.patients').selected).toBe(120)
  })

  it('AC-8816.9: 어느 달 줄인지 모를 매출 줄이 있으면 세 달 모두 총진료비 null(다른 지표는 그대로)', () => {
    const input = built({ ...baseRaw(), sales: [...OCT_SALES, ...SEP_SALES, { day: 'x', total: 1, rough_total: null }] })
    expect(valuesOf(input, 'sales.total')).toEqual({ selected: null, prev: null, lastYear: null })
    expect(input.hasPrev).toBe(true)
  })

  it('AC-8816.9: 어긴 덮은 기간 줄은 버린다 → 덮이지 않은 날이 생겨 partial', () => {
    const input = built({
      ...baseRaw(),
      coverage: [covRow('2026-10-01', '2026-10-20'), covRow('2026-10-31', '2026-10-21'), { from_day: '2026-10-21', to_day: 31 }, covRow('2026-09-01', '2026-09-30')],
    })
    expect(input.partial).toBe(true)
  })

  it('AC-8816.9: 어긴 처방 줄(모양 · 기간 모양 · 날짜)은 버린다 → 모자라면 처방 null', () => {
    const bad = [
      { ...OCT_RX, payload: { v: 1, rows: [{ code: 'MT01', name: '도수 가', qty: 1, amount: 1.5 }], total: null } },
      { ...OCT_RX, from_day: '2026-10-02' }, // 2일~31일은 하루·한 주·한 달 모양이 아님
      { ...OCT_RX, to_day: '2026-10-32' },
      { ...OCT_RX, updated_at: null },
    ]
    for (const row of bad) {
      const input = built({ ...baseRaw(), rx: [row, SEP_RX] })
      expect(input.metrics.some((metric) => metric.id.startsWith('rx:')), JSON.stringify(row).slice(0, 60)).toBe(false)
      expect(valuesOf(input, `group:${MANUAL}.qty`).selected).toBeNull()
      expect(valuesOf(input, `group:${MANUAL}.qty`).prev).toBe(28)
    }
  })

  it('AC-8816.9: 어긴 나이대 줄(합이 안 맞음 · 하루가 아님)은 버린다 → 빠진 날이 생겨 나이대 null', () => {
    const wrongSum = { ...OCT_AGES[2], payload: { ...OCT_AGES[2].payload, patients: 31 } }
    const notDay = { ...OCT_AGES[2], to_day: '2026-10-06' }
    for (const row of [wrongSum, notDay]) {
      const input = built({ ...baseRaw(), age: [OCT_AGES[0], OCT_AGES[1], row, ...SEP_AGES] })
      expect(valuesOf(input, 'agevisit:60대')).toEqual({ selected: null, prev: 22, lastYear: null })
    }
  })

  it('AC-8816.9: 읽은 값 객체를 그대로 넘기지 않는다 — 입력을 만든 뒤 받은 줄을 고쳐도 입력이 바뀌지 않는다', () => {
    const raw = baseRaw()
    const valid = validateUisReportMonths(raw, MONTH, TODAY)
    if (valid === null) throw new Error('검사를 지나야 한다')
    ;(raw.days[0] as { payload: { totals: { patients: number } } }).payload.totals.patients = 999
    ;(raw.rx[0] as { payload: { rows: UisRxRow[] } }).payload.rows[0].qty = 999
    expect(valuesOf(buildUisReportInput(valid), 'total.patients').selected).toBe(120)
    expect(valuesOf(buildUisReportInput(valid), 'rx:ESWT 1부위.qty').selected).toBe(12.5)
  })
})
