import { describe, expect, expectTypeOf, it } from 'vitest'
import { isErrorCode } from '@/lib/errors'
import { validateMonthPayload, validateMonthSections } from '@/lib/payload/validate'
import type { AiErrorCode, MetricKind, ReportInput, ReportMetric } from '@/types/aiReport'
import type { ErrorCode } from '@/types/errors'
import type { MonthPayload, MonthSections } from '@/types/payload'
import { basisLine } from './basis'
import { TOP_INSURANCE, TOP_REGIONS, TOP_RX, buildReportInput, reportFingerprint, type ValidReportMonths } from './input'

// 시험 자료는 여기서 손으로 만든 가짜 숫자다(처방코드는 FAKE-…). 쓰기 전에 validateMonthPayload를 통과하는지 본다

type Rx = MonthPayload['rx'][number]
type Group = MonthPayload['groups'][number]
type Region = MonthPayload['regions'][number]

const rx = (code: string, name: string, patients: number, newPatients = 0, returning = 0): Rx => ({
  code,
  name,
  type: '가짜',
  patients,
  newPatients,
  returning,
  followup: [patients, 0, 0, 0],
})

const group = (id: string, patients: number, newPatients: number, returning: number): Group => ({
  id,
  patients,
  newPatients,
  returning,
  followup: [patients, 0, 0, 0],
})

const region = (name: string, patients: number): Region => ({ name, patients })

function month(fields: Partial<MonthPayload> & Pick<MonthPayload, 'month'>): MonthPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    partial: false,
    totals: { patients: 0, newPatients: 0, returning: 0, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: 0, within14: 0 },
    regions: [],
    ...fields,
  }
}

// 검사를 통과한 것만 쓴다(buildReportInput은 검사를 통과한 자료를 받는다)
function valid(payload: MonthPayload): MonthPayload {
  const checked = validateMonthPayload(payload)
  if (checked === null) throw new Error(`시험 자료가 검사를 통과하지 못함: ${payload.month}`)
  return checked
}

// 고른 달(진행 중): 7일 재방문 집계 중, 처방·동네는 일부러 환자 수 순이 아닌 차례로 둔다
const selected = (): MonthPayload =>
  valid(
    month({
      month: '2026-10',
      partial: true,
      totals: { patients: 120, newPatients: 30, returning: 85, unknown: 5 },
      rx: [rx('FAKE-A01', '가짜 처방 가', 20, 5, 15), rx('FAKE-B02', '가짜 처방 나', 50, 10, 40), rx('FAKE-C03', '가짜 처방 다', 20, 0, 20)],
      groups: [group('g-alpha', 40, 8, 30), group('g-beta', 10, 2, 8)],
      revisit: { cohort: 20, within7: null, within14: null },
      regions: [region('가동', 30), region('나동', 30), region('다동', 40)],
    }),
  )

// 지난달: FAKE-B02·나동이 없다(→ 0). g-beta도 없다(묶음은 → null). g-gamma는 이 달에만 있고 이름이 없다(지표가 아니다). FAKE-Z99는 고른 달에 없다(지표가 아니다)
const prev = (): MonthPayload =>
  valid(
    month({
      month: '2026-09',
      totals: { patients: 110, newPatients: 25, returning: 80, unknown: 5 },
      rx: [rx('FAKE-A01', '옛 이름', 18, 3, 15), rx('FAKE-C03', '가짜 처방 다', 15), rx('FAKE-Z99', '가짜 처방 끝', 60)],
      groups: [group('g-alpha', 35, 7, 25), group('g-gamma', 6, 1, 5)],
      revisit: { cohort: 20, within7: 8, within14: 11 },
      regions: [region('가동', 25), region('다동', 35)],
    }),
  )

// 작년 같은 달: FAKE-B02·가동·다동이 없다(→ 0). g-alpha·g-gamma도 없다(묶음은 → null). 재방문 집단이 0명
const lastYear = (): MonthPayload =>
  valid(
    month({
      month: '2025-10',
      totals: { patients: 100, newPatients: 20, returning: 75, unknown: 5 },
      rx: [rx('FAKE-A01', '가짜 처방 가', 12), rx('FAKE-C03', '가짜 처방 다', 9)],
      groups: [group('g-beta', 9, 1, 8)],
      revisit: { cohort: 0, within7: 0, within14: 0 },
      regions: [region('나동', 22)],
    }),
  )

const GROUP_NAMES: Record<string, string> = { 'g-alpha': '도수치료', 'g-beta': '물리치료' }

const allMonths = (): ValidReportMonths => ({
  selected: selected(),
  prev: prev(),
  lastYear: lastYear(),
  groupNames: { ...GROUP_NAMES },
})

const count = (id: string, label: string, s: number | null, p: number | null, l: number | null): ReportMetric => ({
  id,
  label,
  kind: 'count',
  values: { selected: s, prev: p, lastYear: l },
})

const visits = (id: string, label: string, s: number | null, p: number | null, l: number | null): ReportMetric => ({
  id,
  label,
  kind: 'visits',
  values: { selected: s, prev: p, lastYear: l },
})

const rate = (id: string, label: string, s: number | null, p: number | null, l: number | null): ReportMetric => ({
  id,
  label,
  kind: 'rate',
  values: { selected: s, prev: p, lastYear: l },
})

const metricOf = (input: ReportInput, id: string): ReportMetric => {
  const found = input.metrics.find((m) => m.id === id)
  if (found === undefined) throw new Error(`지표가 없음: ${id}`)
  return found
}

const ids = (input: ReportInput) => input.metrics.map((m) => m.id)

describe('REQ-505 타입', () => {
  it('AiErrorCode는 TASK-2가 더한 ErrorCode 넷과 같다(errorInfo에 바로 넣을 수 있다)', () => {
    expectTypeOf<AiErrorCode>().toExtend<ErrorCode>()
    expectTypeOf<AiErrorCode>().toEqualTypeOf<'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED' | 'E-AI-NO-DATA'>()
    const codes: AiErrorCode[] = ['E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED', 'E-AI-NO-DATA']
    expect(codes.every(isErrorCode)).toBe(true)
  })
})

describe('AC-505.1 buildReportInput: 고른 달·비교 달·지표마다 세 달 값', () => {
  it('AC-505.1·AC-2004.1·AC-2003.2 세 달이 다 있으면 달·partial·비교 달·자료 여부와 지표마다 ID·이름·세 달 값이 있다', () => {
    const input = buildReportInput(allMonths())
    expect(input).toEqual({
      month: '2026-10',
      partial: true,
      prevMonth: '2026-09',
      lastYearMonth: '2025-10',
      hasPrev: true,
      hasLastYear: true,
      metrics: [
        visits('total.patients', '접수 건수', 120, 110, 100),
        count('total.newPatients', '신환', 30, 25, 20),
        visits('total.returning', '재진', 85, 80, 75),
        rate('revisit.within7', '신환 7일 재방문율', null, 8 / 20, null),
        rate('revisit.within14', '신환 14일 재방문율', null, 11 / 20, null),
        count('group:g-alpha.patients', "처방 그룹 '도수치료' 환자", 40, 35, null),
        count('group:g-alpha.newPatients', "처방 그룹 '도수치료' 신환", 8, 7, null),
        count('group:g-alpha.returning', "처방 그룹 '도수치료' 재진", 30, 25, null),
        count('group:g-beta.patients', "처방 그룹 '물리치료' 환자", 10, null, 9),
        count('group:g-beta.newPatients', "처방 그룹 '물리치료' 신환", 2, null, 1),
        count('group:g-beta.returning', "처방 그룹 '물리치료' 재진", 8, null, 8),
        count('rx:FAKE-B02', "처방 '가짜 처방 나' 환자", 50, 0, 0),
        count('rx:FAKE-A01', "처방 '가짜 처방 가' 환자", 20, 18, 12),
        count('rx:FAKE-C03', "처방 '가짜 처방 다' 환자", 20, 15, 9),
        count('region:다동', "동네 '다동' 환자", 40, 35, 0),
        count('region:가동', "동네 '가동' 환자", 30, 25, 0),
        count('region:나동', "동네 '나동' 환자", 30, 0, 22),
      ],
    })
  })

  it('AC-505.1·AC-2003.2 지난달 자료가 없으면 hasPrev false, 지난달 칸은 모두 null. 작년 같은 달에 없는 처방·동네는 0, 묶음은 null', () => {
    const input = buildReportInput({ ...allMonths(), prev: null })
    expect(input.prevMonth).toBe('2026-09')
    expect(input.hasPrev).toBe(false)
    expect(input.hasLastYear).toBe(true)
    for (const metric of input.metrics) expect(metric.values.prev, metric.id).toBeNull()
    expect(metricOf(input, 'rx:FAKE-B02').values).toEqual({ selected: 50, prev: null, lastYear: 0 })
    expect(metricOf(input, 'group:g-alpha.patients').values).toEqual({ selected: 40, prev: null, lastYear: null })
    expect(metricOf(input, 'region:가동').values).toEqual({ selected: 30, prev: null, lastYear: 0 })
    expect(metricOf(input, 'total.patients').values).toEqual({ selected: 120, prev: null, lastYear: 100 })
    // 지난달에만 있던 그룹은 이제 어느 달에도 없다
    expect(ids(input).some((id) => id.startsWith('group:g-gamma.'))).toBe(false)
  })

  it('AC-505.1 작년 같은 달 자료가 없으면 hasLastYear false, 그 칸은 모두 null. 비교 달은 해가 바뀌어도 맞다', () => {
    const january = valid(month({ month: '2026-01', totals: { patients: 9, newPatients: 2, returning: 7, unknown: 0 } }))
    const input = buildReportInput({ selected: january, prev: null, lastYear: null, groupNames: {} })
    expect(input).toMatchObject({
      month: '2026-01',
      partial: false,
      prevMonth: '2025-12',
      lastYearMonth: '2025-01',
      hasPrev: false,
      hasLastYear: false,
    })
    for (const metric of input.metrics) {
      expect(metric.values.prev, metric.id).toBeNull()
      expect(metric.values.lastYear, metric.id).toBeNull()
    }
  })

  it('AC-505.1 비교 달에만 있는 처방은 지표가 아니고, 처방 이름은 고른 달 것을 쓴다', () => {
    const input = buildReportInput(allMonths())
    expect(ids(input)).not.toContain('rx:FAKE-Z99')
    expect(metricOf(input, 'rx:FAKE-A01').label).toBe("처방 '가짜 처방 가' 환자")
  })
})

describe('AC-505.2 지표 목록과 순서', () => {
  it('AC-505.2 ID는 전체·재방문율·그룹(id 순, 환자·신환·재진)·처방(환자 수 큰 순)·동네(환자 수 큰 순) 차례다', () => {
    expect(ids(buildReportInput(allMonths()))).toEqual([
      'total.patients',
      'total.newPatients',
      'total.returning',
      'revisit.within7',
      'revisit.within14',
      'group:g-alpha.patients',
      'group:g-alpha.newPatients',
      'group:g-alpha.returning',
      'group:g-beta.patients',
      'group:g-beta.newPatients',
      'group:g-beta.returning',
      'rx:FAKE-B02',
      'rx:FAKE-A01',
      'rx:FAKE-C03',
      'region:다동',
      'region:가동',
      'region:나동',
    ])
  })

  it('AC-505.2 처방 31개·동네 21개를 넣으면 상위 30개·20개만, 같은 환자 수는 코드·이름 순', () => {
    expect(TOP_RX).toBe(30)
    expect(TOP_REGIONS).toBe(20)
    const two = (n: number) => String(n).padStart(2, '0')
    // FAKE-R31 100명, FAKE-R05 50명, 나머지 29개는 10명씩 → 10명짜리는 코드 순으로 28개만(FAKE-R30이 빠진다)
    const rxList = Array.from({ length: 31 }, (_, i) => {
      const n = i + 1
      return rx(`FAKE-R${two(n)}`, `가짜 처방 ${two(n)}`, n === 31 ? 100 : n === 5 ? 50 : 10)
    })
    // 동네21 30명, 동네07 20명, 나머지 19개는 5명씩 → 5명짜리는 이름 순으로 18개만(동네20이 빠진다)
    const regionList = Array.from({ length: 21 }, (_, i) => {
      const n = i + 1
      return region(`동네${two(n)}`, n === 21 ? 30 : n === 7 ? 20 : 5)
    })
    const big = valid(month({ month: '2026-10', rx: rxList, regions: regionList }))
    const input = buildReportInput({ selected: big, prev: null, lastYear: null, groupNames: {} })

    const rxIds = ids(input).filter((id) => id.startsWith('rx:'))
    const tiedRx = Array.from({ length: 29 }, (_, i) => i + 1).filter((n) => n !== 5)
    expect(rxIds).toEqual(['rx:FAKE-R31', 'rx:FAKE-R05', ...tiedRx.map((n) => `rx:FAKE-R${two(n)}`)])
    expect(rxIds).toHaveLength(TOP_RX)

    const regionIds = ids(input).filter((id) => id.startsWith('region:'))
    const tiedRegions = Array.from({ length: 19 }, (_, i) => i + 1).filter((n) => n !== 7)
    expect(regionIds).toEqual(['region:동네21', 'region:동네07', ...tiedRegions.map((n) => `region:동네${two(n)}`)])
    expect(regionIds).toHaveLength(TOP_REGIONS)
  })

  it('AC-505.2 같은 환자 수는 글자 코드 순(대문자가 소문자보다 앞) — 실행 환경 말 순서(localeCompare)가 아니다', () => {
    const mixed = valid(
      month({
        month: '2026-10',
        rx: [rx('FAKE-a1', '가짜 소문자', 7), rx('FAKE-Z1', '가짜 대문자', 7)],
        groups: [group('g-b', 1, 0, 0), group('G-a', 1, 0, 0)],
        regions: [region('b동', 6), region('B동', 6)],
      }),
    )
    const input = buildReportInput({ selected: mixed, prev: null, lastYear: null, groupNames: { 'g-b': '가짜 묶음 비', 'G-a': '가짜 묶음 에이' } })
    expect(ids(input).filter((id) => id.startsWith('rx:'))).toEqual(['rx:FAKE-Z1', 'rx:FAKE-a1'])
    expect(ids(input).filter((id) => id.endsWith('.patients') && id.startsWith('group:'))).toEqual([
      'group:G-a.patients',
      'group:g-b.patients',
    ])
    expect(ids(input).filter((id) => id.startsWith('region:'))).toEqual(['region:B동', 'region:b동'])
  })

  it('AC-505.2 자료 안 배열 차례가 달라도 지표 순서와 값은 같다', () => {
    const months = allMonths()
    const shuffled = (m: MonthPayload): MonthPayload => ({
      ...m,
      rx: [...m.rx].reverse(),
      groups: [...m.groups].reverse(),
      regions: [...m.regions].reverse(),
    })
    const reordered: ValidReportMonths = {
      selected: shuffled(months.selected),
      prev: months.prev === null ? null : shuffled(months.prev),
      lastYear: months.lastYear === null ? null : shuffled(months.lastYear),
      groupNames: months.groupNames,
    }
    expect(buildReportInput(reordered)).toEqual(buildReportInput(months))
  })
})

describe('AC-505.3 재방문율: 집계 중이거나 집단이 0명이면 null', () => {
  it('AC-505.3 within7이 집계 중(null)이면 7일·14일 재방문율은 null', () => {
    const input = buildReportInput(allMonths())
    expect(metricOf(input, 'revisit.within7').values.selected).toBeNull()
    expect(metricOf(input, 'revisit.within14').values.selected).toBeNull()
  })

  it('AC-505.3 cohort가 0이면 그 달 재방문율은 null(0으로 나누지 않는다)', () => {
    const input = buildReportInput(allMonths())
    expect(metricOf(input, 'revisit.within7').values.lastYear).toBeNull()
    expect(metricOf(input, 'revisit.within14').values.lastYear).toBeNull()
  })

  it('AC-505.3 within14만 집계 중이면 7일은 비율, 14일은 null. 비율은 within / cohort', () => {
    const half = valid(
      month({
        month: '2026-10',
        totals: { patients: 10, newPatients: 10, returning: 0, unknown: 0 },
        revisit: { cohort: 8, within7: 2, within14: null },
      }),
    )
    const input = buildReportInput({ selected: half, prev: null, lastYear: null, groupNames: {} })
    expect(metricOf(input, 'revisit.within7')).toEqual(rate('revisit.within7', '신환 7일 재방문율', 0.25, null, null))
    expect(metricOf(input, 'revisit.within14')).toEqual(rate('revisit.within14', '신환 14일 재방문율', null, null, null))
  })
})

// stats-load-range REQ-3306: 나눠 읽기의 옛 조각은 after30을 null로 저장한다. AI 입력은 after30을 읽지 않아 지어낸 숫자가 없다
describe('AC-3306.3 AI 입력은 after30을 쓰지 않는다', () => {
  type After30 = (n: number) => number | null
  // 세 달 모두 within7·14·30이 숫자다. after30만 숫자(n) 또는 null
  const monthsWith = (after30: After30): ValidReportMonths => ({
    selected: valid({ ...selected(), revisit: { cohort: 20, within7: 6, within14: 9, within30: 12, after30: after30(3) } }),
    prev: valid({ ...prev(), revisit: { cohort: 20, within7: 8, within14: 11, within30: 14, after30: after30(2) } }),
    lastYear: valid({ ...lastYear(), revisit: { cohort: 10, within7: 2, within14: 4, within30: 5, after30: after30(1) } }),
    groupNames: { ...GROUP_NAMES },
  })
  const counted = () => buildReportInput(monthsWith((n) => n))
  const unknown = () => buildReportInput(monthsWith(() => null))

  it('AC-3306.3 세 달 줄의 after30이 null이든 숫자든 입력(지표 ID·이름·세 달 값·차례)과 지문이 같다', async () => {
    expect(unknown()).toEqual(counted())
    expect(ids(unknown())).toEqual(ids(counted()))
    expect(await reportFingerprint(unknown())).toBe(await reportFingerprint(counted()))
  })

  it("AC-3306.3 after30이나 '30일 넘어'를 뜻하는 지표가 없고, 재방문 지표는 7·14일 둘뿐이다", () => {
    const input = unknown()
    expect(ids(input).filter((id) => id.includes('after30'))).toEqual([])
    expect(input.metrics.filter((m) => m.label.includes('30일 넘어'))).toEqual([])
    expect(ids(input).filter((id) => id.startsWith('revisit.'))).toEqual(['revisit.within7', 'revisit.within14'])
    expect(metricOf(input, 'revisit.within7')).toEqual(rate('revisit.within7', '신환 7일 재방문율', 0.3, 0.4, 0.2))
  })
})

describe('AC-505.4 reportFingerprint', () => {
  const HEX64 = /^[0-9a-f]{64}$/

  it('AC-505.4 같은 자료로 두 번 만든 입력의 지문은 같은 소문자 16진수 64자', async () => {
    const a = await reportFingerprint(buildReportInput(allMonths()))
    const b = await reportFingerprint(buildReportInput(allMonths()))
    expect(a).toMatch(HEX64)
    expect(b).toBe(a)
  })

  it('AC-505.4 숫자 하나만 바꾸면 지문이 달라진다', async () => {
    const before = await reportFingerprint(buildReportInput(allMonths()))
    const changed = allMonths()
    const lastMonth = changed.prev
    if (lastMonth === null) throw new Error('지난달 시험 자료가 없음')
    changed.prev = valid({
      ...lastMonth,
      rx: lastMonth.rx.map((r) => (r.code === 'FAKE-A01' ? rx('FAKE-A01', r.name, 19, 3, 15) : r)),
    })
    const after = await reportFingerprint(buildReportInput(changed))
    expect(after).toMatch(HEX64)
    expect(after).not.toBe(before)
  })

  it('AC-505.4 지문은 JSON.stringify(입력)의 UTF-8 SHA-256이다(정해 둔 값)', async () => {
    const known: ReportInput = {
      month: '2026-10',
      partial: false,
      prevMonth: '2026-09',
      lastYearMonth: '2025-10',
      hasPrev: true,
      hasLastYear: false,
      metrics: [count('total.newPatients', '신환', 524, 486, null)],
    }
    expect(await reportFingerprint(known)).toBe('b0f0486560139abda51ceb163f38aed081d7677aa582faabd30f75203fda21ec')
  })

  it('AC-505.4 입력 열쇠 순서는 늘 같다(지문이 JSON.stringify 순서를 본다). 지시문 판·모델 이름은 없다', () => {
    const input = buildReportInput(allMonths())
    expect(Object.keys(input)).toEqual(['month', 'partial', 'prevMonth', 'lastYearMonth', 'hasPrev', 'hasLastYear', 'metrics'])
    for (const metric of input.metrics) {
      expect(Object.keys(metric), metric.id).toEqual(['id', 'label', 'kind', 'values'])
      expect(Object.keys(metric.values), metric.id).toEqual(['selected', 'prev', 'lastYear'])
    }
  })
})

// 묶음은 지금 묶음(groupNames)만 쓴다(spec ai-report-stats REQ-2003). 처방을 바꾸기 전 열쇠·지운 묶음은 지표가 아니다
describe('AC-2003.1 groupNames에 없는 열쇠는 지표가 아니다', () => {
  it('AC-2003.1 groupNames에 없는 묶음(지난달에만 있는 g-gamma)은 지표가 없고 "이름 없는 그룹" 지표도 없다. 다른 묶음은 그대로다', () => {
    const input = buildReportInput(allMonths())
    expect(ids(input).some((id) => id.startsWith('group:g-gamma.'))).toBe(false)
    expect(input.metrics.some((m) => m.label.includes('이름 없는 그룹'))).toBe(false)
    expect(metricOf(input, 'group:g-alpha.patients').label).toBe("처방 그룹 '도수치료' 환자")
    expect(metricOf(input, 'group:g-beta.patients').label).toBe("처방 그룹 '물리치료' 환자")
  })

  it('AC-2003.1 묶음 처방을 바꾸기 전 열쇠는 세 달 어디에 있어도 지표가 아니다(지금 열쇠만 남는다)', () => {
    const OLD = 't00000000000000aa'
    const NOW = 't00000000000000bb'
    const sel = valid(month({ month: '2026-10', groups: [group(NOW, 12, 2, 10), group(OLD, 3, 1, 2)] }))
    const before = valid(month({ month: '2026-09', groups: [group(OLD, 9, 1, 8)] }))
    const input = buildReportInput({ selected: sel, prev: before, lastYear: null, groupNames: { [NOW]: '도수치료' } })
    expect(ids(input).filter((id) => id.startsWith('group:'))).toEqual([
      `group:${NOW}.patients`,
      `group:${NOW}.newPatients`,
      `group:${NOW}.returning`,
    ])
  })

  it('AC-2003.1 열쇠가 객체 기본 열쇠 이름(constructor·toString)이거나 이름이 빈 글자면 지표가 아니다', () => {
    const odd = valid(
      month({ month: '2026-10', groups: [group('constructor', 3, 1, 2), group('toString', 1, 0, 1), group('g-empty', 2, 0, 2), group('g-ok', 4, 1, 3)] }),
    )
    const input = buildReportInput({ selected: odd, prev: null, lastYear: null, groupNames: { 'g-empty': '', 'g-ok': '주사' } })
    expect(ids(input).filter((id) => id.startsWith('group:'))).toEqual(['group:g-ok.patients', 'group:g-ok.newPatients', 'group:g-ok.returning'])
  })
})

describe('AC-2003.2 지금 열쇠가 어떤 달 줄에 없으면 그 달은 null("자료 없음")', () => {
  const KEY = 'g-alpha'
  const names = { [KEY]: '도수치료' }
  const withKey = (m: string) => valid(month({ month: m, groups: [group(KEY, 7, 2, 5)] }))
  const without = (m: string) => valid(month({ month: m, groups: [group('g-other', 1, 0, 1)] }))

  it('AC-2003.2 지난달 줄에 열쇠가 없으면 지난달 값은 0이 아니라 null이고 근거 줄은 "9월 자료 없음"', () => {
    const input = buildReportInput({ selected: withKey('2026-10'), prev: without('2026-09'), lastYear: withKey('2025-10'), groupNames: names })
    expect(input.hasPrev).toBe(true)
    expect(metricOf(input, `group:${KEY}.patients`).values).toEqual({ selected: 7, prev: null, lastYear: 7 })
    expect(metricOf(input, `group:${KEY}.newPatients`).values).toEqual({ selected: 2, prev: null, lastYear: 2 })
    expect(metricOf(input, `group:${KEY}.returning`).values).toEqual({ selected: 5, prev: null, lastYear: 5 })
    expect(basisLine(metricOf(input, `group:${KEY}.patients`), input)).toBe(
      "근거 · 처방 그룹 '도수치료' 환자 9월 자료 없음 → 10월 7명 · 작년 10월 7명",
    )
  })

  it('AC-2003.2 작년 같은 달 줄에 열쇠가 없으면 작년 값은 null이고 근거 줄은 "작년 10월 자료 없음"', () => {
    const input = buildReportInput({ selected: withKey('2026-10'), prev: withKey('2026-09'), lastYear: without('2025-10'), groupNames: names })
    expect(input.hasLastYear).toBe(true)
    expect(metricOf(input, `group:${KEY}.patients`).values).toEqual({ selected: 7, prev: 7, lastYear: null })
    expect(basisLine(metricOf(input, `group:${KEY}.patients`), input)).toBe(
      "근거 · 처방 그룹 '도수치료' 환자 9월 7명 → 10월 7명 · 작년 10월 자료 없음",
    )
  })

  it('AC-2003.2 고른 달 줄에 열쇠가 없고 비교 달에만 있으면 고른 달 값은 null이고 근거 줄은 "10월 자료 없음"', () => {
    const input = buildReportInput({ selected: without('2026-10'), prev: withKey('2026-09'), lastYear: null, groupNames: names })
    expect(metricOf(input, `group:${KEY}.patients`).values).toEqual({ selected: null, prev: 7, lastYear: null })
    expect(basisLine(metricOf(input, `group:${KEY}.patients`), input)).toBe(
      "근거 · 처방 그룹 '도수치료' 환자 9월 7명 → 10월 자료 없음 · 작년 10월 자료 없음",
    )
  })
})

describe('AC-2003.3 지금 열쇠가 세 달 어디에도 없으면 그 묶음 지표는 없다', () => {
  it('AC-2003.3 groupNames에 있어도 세 달 줄 어디에도 없는 열쇠는 지표가 없다', () => {
    const input = buildReportInput({ ...allMonths(), groupNames: { ...GROUP_NAMES, 'g-nowhere': '체외충격파' } })
    expect(ids(input).some((id) => id.startsWith('group:g-nowhere.'))).toBe(false)
    expect(ids(input).filter((id) => id.startsWith('group:'))).toHaveLength(6)
  })
})

describe('AC-2003.4 처방·동네는 지금 규칙 그대로', () => {
  it('AC-2003.4 자료가 있는 달에 그 처방·동네가 없으면 0, 달이 없으면 null', () => {
    const input = buildReportInput({ ...allMonths(), lastYear: null })
    expect(metricOf(input, 'rx:FAKE-B02').values).toEqual({ selected: 50, prev: 0, lastYear: null })
    expect(metricOf(input, 'region:나동').values).toEqual({ selected: 30, prev: 0, lastYear: null })
    expect(metricOf(input, 'rx:FAKE-A01').values).toEqual({ selected: 20, prev: 18, lastYear: null })
  })
})

describe('AC-2004.1 접수 건수·재진은 visits, 신환은 count', () => {
  it("AC-2004.1 total.patients는 '접수 건수', total.returning은 '재진'이고 둘 다 visits. total.newPatients는 '신환'·count", () => {
    const input = buildReportInput(allMonths())
    expect(metricOf(input, 'total.patients')).toEqual(visits('total.patients', '접수 건수', 120, 110, 100))
    expect(metricOf(input, 'total.returning')).toEqual(visits('total.returning', '재진', 85, 80, 75))
    expect(metricOf(input, 'total.newPatients')).toEqual(count('total.newPatients', '신환', 30, 25, 20))
  })

  it('AC-2004.1 묶음·처방·동네는 count, 재방문율은 rate 그대로이고 visits는 total.patients·total.returning 둘뿐이다', () => {
    const input = buildReportInput(allMonths())
    expect(input.metrics.filter((m) => m.kind === 'visits').map((m) => m.id)).toEqual(['total.patients', 'total.returning'])
    for (const m of input.metrics) {
      if (m.id.startsWith('group:') || m.id.startsWith('rx:') || m.id.startsWith('region:')) expect(m.kind, m.id).toBe('count')
      if (m.id.startsWith('revisit.')) expect(m.kind, m.id).toBe('rate')
    }
  })
})

describe('AC-505.6 처방 이름이 빈 글자이거나 빈칸뿐이면 지표 이름에 코드를 쓴다', () => {
  // 고른 달: FAKE-A01은 이름이 있고, FAKE-X09는 이름만 바꿔 넣는다(검사는 빈 이름·빈칸뿐인 이름을 허용한다)
  const withRxName = (name: string): MonthPayload =>
    valid(month({ month: '2026-10', rx: [rx('FAKE-A01', '가짜 처방 가', 20), rx('FAKE-X09', name, 9)] }))

  const only = (selectedMonth: MonthPayload, prevMonth: MonthPayload | null = null): ValidReportMonths => ({
    selected: selectedMonth,
    prev: prevMonth,
    lastYear: null,
    groupNames: {},
  })

  it('AC-505.6 고른 달 처방 이름이 빈 글자면 지표 이름에 코드를 쓴다', () => {
    const input = buildReportInput(only(withRxName('')))
    expect(metricOf(input, 'rx:FAKE-X09')).toEqual(count('rx:FAKE-X09', "처방 'FAKE-X09' 환자", 9, null, null))
    expect(metricOf(input, 'rx:FAKE-A01').label).toBe("처방 '가짜 처방 가' 환자")
  })

  it('AC-505.6 이름이 빈칸뿐이어도 코드를 쓰고, 이름만 빈 글자·빈칸뿐으로 다른 두 자료의 입력과 지문이 같다', async () => {
    const blank = buildReportInput(only(withRxName('   ')))
    const empty = buildReportInput(only(withRxName('')))
    expect(metricOf(blank, 'rx:FAKE-X09').label).toBe("처방 'FAKE-X09' 환자")
    expect(blank).toEqual(empty)
    expect(await reportFingerprint(blank)).toBe(await reportFingerprint(empty))
  })

  it('AC-505.6 이름이 있는 처방은 그대로(앞뒤 빈칸도 자르지 않는다). 고른 달 이름이 비면 지난달에 이름이 있어도 코드를 쓴다', () => {
    const selectedMonth = valid(
      month({
        month: '2026-10',
        rx: [rx('FAKE-A01', '가짜 처방 가', 20), rx('FAKE-X09', '', 9), rx('FAKE-S07', ' 가짜 처방 사 ', 5)],
      }),
    )
    const prevMonth = valid(month({ month: '2026-09', rx: [rx('FAKE-X09', '가짜 옛 이름', 4)] }))
    const input = buildReportInput(only(selectedMonth, prevMonth))
    expect(input.metrics.filter((m) => m.id.startsWith('rx:'))).toEqual([
      count('rx:FAKE-A01', "처방 '가짜 처방 가' 환자", 20, 0, null),
      count('rx:FAKE-X09', "처방 'FAKE-X09' 환자", 9, 4, null),
      count('rx:FAKE-S07', "처방 ' 가짜 처방 사 ' 환자", 5, 0, null),
    ])
  })

  it('AC-505.6 고른 달 이름이 비면 작년 같은 달에 이름이 있어도 코드를 쓴다', () => {
    const lastYearMonth = valid(month({ month: '2025-10', rx: [rx('FAKE-X09', '가짜 작년 이름', 3)] }))
    const input = buildReportInput({ ...only(withRxName('')), lastYear: lastYearMonth })
    expect(metricOf(input, 'rx:FAKE-X09')).toEqual(count('rx:FAKE-X09', "처방 'FAKE-X09' 환자", 9, null, 3))
  })

  it('AC-505.6 이름이 전각 빈칸과 탭뿐이어도 코드를 쓴다', () => {
    const input = buildReportInput(only(withRxName('\u3000\t')))
    expect(metricOf(input, 'rx:FAKE-X09').label).toBe("처방 'FAKE-X09' 환자")
  })
})

// ── 통계 비트 세 칸 지표 (spec stats-bit-ai REQ-2904) ──
// 시험 자료는 손으로 만든 가짜 숫자다(원장님 이름도 가짜). 쓰기 전에 validateMonthSections를 통과하는지 본다

type PeopleRow = { name: string; people: number }
type SectionsFields = {
  month: string
  partial?: boolean
  age: number[]
  insurance?: PeopleRow[]
  town?: PeopleRow[]
  openDays: number[]
  weekdays: number[]
  hours: number[]
  doctors?: MonthSections['doctors']
}

const AGE_NAMES = ['10세 미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80세 이상', '생년월일 없음']
const WEEKDAY_IDS = [1, 2, 3, 4, 5, 6, 7].map((day) => `weekday:${day}`)
const HOUR_IDS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((hour) => `hour:${hour}`)
const sumOf = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

function sections(fields: SectionsFields): MonthSections {
  const value: MonthSections = {
    v: 1,
    month: fields.month,
    partial: fields.partial ?? false,
    mix: {
      people: sumOf(fields.age),
      age: AGE_NAMES.map((name, i) => ({ name, people: fields.age[i] })),
      insurance: fields.insurance ?? [],
      town: fields.town ?? [],
    },
    hours: { openDays: fields.openDays, weekdays: fields.weekdays, hours: fields.hours, unknown: 2 },
    doctors: fields.doctors ?? [],
  }
  const checked = validateMonthSections(value)
  if (checked === null) throw new Error(`시험 세 칸 자료가 검사를 통과하지 못함: ${fields.month}`)
  return checked
}

// 고른 달: 보험·동네는 일부러 명 큰 차례가 아니게 둔다. 일요일은 문을 안 열었다(→ null). 화·수는 문 연 날이 셋이라 나누어떨어지지 않는다. 문 연 날 합 23
const SELECTED_SECTIONS: SectionsFields = {
  month: '2026-10',
  partial: true,
  age: [2, 3, 5, 10, 20, 25, 15, 10, 5, 5],
  insurance: [
    { name: '의료급여 1종', people: 10 },
    { name: '건강보험', people: 80 },
  ],
  town: [
    { name: '매탄1동', people: 12 },
    { name: '원천동', people: 30 },
  ],
  openDays: [4, 3, 3, 4, 5, 4, 0],
  weekdays: [40, 25, 29, 20, 50, 16, 0],
  hours: [0, 30, 40, 20, 10, 0, 20, 30, 20, 10, 0, 0, 0],
  doctors: [
    { name: '김가상', patients: 60, newPatients: 10, amount: 12345000 },
    { name: '이가상', patients: 50, newPatients: 8, amount: 9800000 },
  ],
}

// 지난달: '의료급여 1종'·'매탄1동' 줄이 없다(5명 미만이거나 없음 → null). '이가상' 줄이 없다(→ 0). '영통동'은 이 달에만 있다(지표가 아니다). 문 연 날 합 24
const PREV_SECTIONS: SectionsFields = {
  month: '2026-09',
  age: [1, 2, 4, 9, 18, 22, 14, 9, 4, 7],
  insurance: [{ name: '건강보험', people: 75 }],
  town: [
    { name: '원천동', people: 25 },
    { name: '영통동', people: 10 },
  ],
  openDays: [4, 4, 4, 4, 4, 4, 0],
  weekdays: [30, 30, 30, 30, 30, 10, 0],
  hours: [0, 20, 30, 20, 10, 0, 20, 30, 20, 10, 0, 0, 0],
  doctors: [{ name: '김가상', patients: 55, newPatients: 9, amount: 11000000 }],
}

// 작년 같은 달은 달 줄(payload)은 있어도 세 칸이 없다(이 기능 전에 저장했거나 파일로 불러온 달 → null)
const withSections = (over: Partial<NonNullable<ValidReportMonths['sections']>> = {}): ValidReportMonths => ({
  ...allMonths(),
  sections: { selected: sections(SELECTED_SECTIONS), prev: sections(PREV_SECTIONS), lastYear: null, ...over },
})

// 세 칸 지표 = 지금 지표(sections 없이 만든 것) 뒤에 더한 것
const sectionMetrics = (input: ReportInput): ReportMetric[] => input.metrics.slice(buildReportInput(allMonths()).metrics.length)

const won = (id: string, label: string, s: number | null, p: number | null, l: number | null): ReportMetric => ({
  id,
  label,
  kind: 'won',
  values: { selected: s, prev: p, lastYear: l },
})

const average = (id: string, label: string, s: number | null, p: number | null, l: number | null): ReportMetric => ({
  id,
  label,
  kind: 'average',
  values: { selected: s, prev: p, lastYear: l },
})

describe('AC-2904.1 고른 달에 세 칸이 없으면 지표와 지문이 이 기능 전과 같다', () => {
  it('AC-2904.1 sections 칸이 없으면 세 칸 지표(age·insurance·town·weekday·hour·doctor)가 하나도 없다', () => {
    const added = ids(buildReportInput(allMonths())).filter((id) => /^(age|insurance|town|weekday|hour|doctor):/.test(id))
    expect(added).toEqual([])
  })

  it('AC-2904.1 고른 달 sections가 null이면 비교 달에 세 칸이 있어도 입력 글자와 지문이 sections 없이 만든 것과 같다', async () => {
    const before = buildReportInput(allMonths())
    const input = buildReportInput(withSections({ selected: null }))
    expect(JSON.stringify(input)).toBe(JSON.stringify(before))
    expect(await reportFingerprint(input)).toBe(await reportFingerprint(before))
  })
})

describe('AC-2904.2 고른 달에 세 칸이 있으면 지금 지표 뒤에 차례대로 더한다', () => {
  it('AC-2904.2 지금 지표는 그대로 앞에 있고, 그 뒤가 연령대 열·보험(명 큰 차례)·동네(명 큰 차례)·요일 일곱·시간 열셋·원장님(고른 달 차례, 실환자·신환·매출) 차례다', () => {
    const before = buildReportInput(allMonths())
    const input = buildReportInput(withSections())
    expect({ ...input, metrics: input.metrics.slice(0, before.metrics.length) }).toEqual(before)
    expect(sectionMetrics(input).map((m) => m.id)).toEqual([
      ...AGE_NAMES.map((name) => `age:${name}`),
      'insurance:건강보험',
      'insurance:의료급여 1종',
      'town:원천동',
      'town:매탄1동',
      ...WEEKDAY_IDS,
      ...HOUR_IDS,
      'doctor:김가상.patients',
      'doctor:김가상.newPatients',
      'doctor:김가상.amount',
      'doctor:이가상.patients',
      'doctor:이가상.newPatients',
      'doctor:이가상.amount',
    ])
  })

  it('AC-2904.2·AC-2904.3·AC-2904.4 지표마다 이름·kind·세 달 값이 맞다(작년 같은 달은 세 칸이 없어 모두 null)', () => {
    expect(sectionMetrics(buildReportInput(withSections()))).toEqual([
      count('age:10세 미만', "연령대 '10세 미만' 환자", 2, 1, null),
      count('age:10대', "연령대 '10대' 환자", 3, 2, null),
      count('age:20대', "연령대 '20대' 환자", 5, 4, null),
      count('age:30대', "연령대 '30대' 환자", 10, 9, null),
      count('age:40대', "연령대 '40대' 환자", 20, 18, null),
      count('age:50대', "연령대 '50대' 환자", 25, 22, null),
      count('age:60대', "연령대 '60대' 환자", 15, 14, null),
      count('age:70대', "연령대 '70대' 환자", 10, 9, null),
      count('age:80세 이상', "연령대 '80세 이상' 환자", 5, 4, null),
      count('age:생년월일 없음', "연령대 '생년월일 없음' 환자", 5, 7, null),
      count('insurance:건강보험', "보험 '건강보험' 환자", 80, 75, null),
      count('insurance:의료급여 1종', "보험 '의료급여 1종' 환자", 10, null, null),
      count('town:원천동', "동네 '원천동' 환자", 30, 25, null),
      count('town:매탄1동', "동네 '매탄1동' 환자", 12, null, null),
      // 요일 = 그 요일 접수 합 ÷ 그 요일 문 연 날 수(25÷3 = 8.333… → 8.3, 29÷3 = 9.666… → 9.7). 일요일은 문 연 날이 없어 null
      average('weekday:1', "요일 '월' 하루 평균 접수", 10, 7.5, null),
      average('weekday:2', "요일 '화' 하루 평균 접수", 8.3, 7.5, null),
      average('weekday:3', "요일 '수' 하루 평균 접수", 9.7, 7.5, null),
      average('weekday:4', "요일 '목' 하루 평균 접수", 5, 7.5, null),
      average('weekday:5', "요일 '금' 하루 평균 접수", 10, 7.5, null),
      average('weekday:6', "요일 '토' 하루 평균 접수", 4, 2.5, null),
      average('weekday:7', "요일 '일' 하루 평균 접수", null, null, null),
      // 시간 = 그 시 접수 합 ÷ 일곱 요일 문 연 날 수의 합(고른 달 23, 지난달 24). 30÷23 = 1.304… → 1.3, 10÷24 = 0.416… → 0.4, 30÷24 = 1.25 → 1.3
      average('hour:8', "'오전 8시' 하루 평균 접수", 0, 0, null),
      average('hour:9', "'오전 9시' 하루 평균 접수", 1.3, 0.8, null),
      average('hour:10', "'오전 10시' 하루 평균 접수", 1.7, 1.3, null),
      average('hour:11', "'오전 11시' 하루 평균 접수", 0.9, 0.8, null),
      average('hour:12', "'낮 12시' 하루 평균 접수", 0.4, 0.4, null),
      average('hour:13', "'오후 1시' 하루 평균 접수", 0, 0, null),
      average('hour:14', "'오후 2시' 하루 평균 접수", 0.9, 0.8, null),
      average('hour:15', "'오후 3시' 하루 평균 접수", 1.3, 1.3, null),
      average('hour:16', "'오후 4시' 하루 평균 접수", 0.9, 0.8, null),
      average('hour:17', "'오후 5시' 하루 평균 접수", 0.4, 0.4, null),
      average('hour:18', "'오후 6시' 하루 평균 접수", 0, 0, null),
      average('hour:19', "'오후 7시' 하루 평균 접수", 0, 0, null),
      average('hour:20', "'오후 8시' 하루 평균 접수", 0, 0, null),
      count('doctor:김가상.patients', "원장님 '김가상' 실환자", 60, 55, null),
      count('doctor:김가상.newPatients', "원장님 '김가상' 신환", 10, 9, null),
      won('doctor:김가상.amount', "원장님 '김가상' 매출", 12345000, 11000000, null),
      count('doctor:이가상.patients', "원장님 '이가상' 실환자", 50, 0, null),
      count('doctor:이가상.newPatients', "원장님 '이가상' 신환", 8, 0, null),
      won('doctor:이가상.amount', "원장님 '이가상' 매출", 9800000, 0, null),
    ])
  })

  it('AC-2904.2 보험은 고른 달 명 큰 차례 상위 TOP_INSURANCE(10)줄이고 같은 명이면 이름 글자 차례, 동네는 고른 달 줄 모두(명 큰 차례)', () => {
    expect(TOP_INSURANCE).toBe(10)
    const insurance = [
      ['보험 하', 5],
      ['보험 타', 12],
      ['보험 가', 20],
      ['보험 차', 12],
      ['보험 나', 19],
      ['보험 다', 18],
      ['보험 자', 12],
      ['보험 라', 17],
      ['보험 마', 16],
      ['보험 바', 15],
      ['보험 사', 14],
      ['보험 아', 13],
    ].map(([name, people]) => ({ name: String(name), people: Number(people) }))
    const town = ['가동', '나동', '다동', '라동', '마동', '바동', '사동', '아동', '자동', '차동'].map((name, i) => ({ name, people: 5 + i }))
    const input = buildReportInput(withSections({ selected: sections({ ...SELECTED_SECTIONS, insurance, town }) }))
    const idsOf = (head: string) => ids(input).filter((id) => id.startsWith(head))
    expect(idsOf('insurance:')).toEqual(['가', '나', '다', '라', '마', '바', '사', '아', '자', '차'].map((name) => `insurance:보험 ${name}`))
    expect(idsOf('town:')).toEqual(['차동', '자동', '아동', '사동', '바동', '마동', '라동', '다동', '나동', '가동'].map((name) => `town:${name}`))
  })

  it('AC-2904.2 보험·동네 줄 차례가 달라도 지표 차례와 지문이 같다', async () => {
    const reversed = sections({ ...SELECTED_SECTIONS, insurance: [...(SELECTED_SECTIONS.insurance ?? [])].reverse(), town: [...(SELECTED_SECTIONS.town ?? [])].reverse() })
    const a = buildReportInput(withSections())
    const b = buildReportInput(withSections({ selected: reversed }))
    expect(b).toEqual(a)
    expect(await reportFingerprint(b)).toBe(await reportFingerprint(a))
  })

  it('AC-2904.2 고른 달 원장님 줄이 없으면(한 분만 진료) 원장님 지표가 없고 다른 세 칸 지표는 그대로다', () => {
    const input = buildReportInput(withSections({ selected: sections({ ...SELECTED_SECTIONS, doctors: [] }) }))
    expect(ids(input).filter((id) => id.startsWith('doctor:'))).toEqual([])
    expect(ids(input).filter((id) => id.startsWith('hour:'))).toEqual(HOUR_IDS)
  })

  it('AC-2904.2 입력 열쇠 차례는 지금과 같다(지문이 JSON.stringify 차례를 본다)', () => {
    const input = buildReportInput(withSections())
    expect(Object.keys(input)).toEqual(['month', 'partial', 'prevMonth', 'lastYearMonth', 'hasPrev', 'hasLastYear', 'metrics'])
    for (const metric of input.metrics) {
      expect(Object.keys(metric), metric.id).toEqual(['id', 'label', 'kind', 'values'])
      expect(Object.keys(metric.values), metric.id).toEqual(['selected', 'prev', 'lastYear'])
    }
  })
})

describe('AC-2904.3 비교 달 값', () => {
  it('AC-2904.3 비교 달에 세 칸이 없으면(null) 그 달 값은 연령대·보험·동네·요일·시간·원장님 모두 null이다', () => {
    const added = sectionMetrics(buildReportInput(withSections({ prev: null })))
    expect(added.length).toBeGreaterThan(0)
    for (const metric of added) {
      expect(metric.values.prev, metric.id).toBeNull()
      expect(metric.values.lastYear, metric.id).toBeNull()
    }
  })

  it('AC-2904.3 세 칸이 있는 비교 달에 그 보험·동네 줄이 없으면 0이 아니라 null, 그 원장님 줄이 없으면 0이다', () => {
    const input = buildReportInput(withSections())
    expect(metricOf(input, 'insurance:의료급여 1종').values.prev).toBeNull()
    expect(metricOf(input, 'town:매탄1동').values.prev).toBeNull()
    for (const field of ['patients', 'newPatients', 'amount']) expect(metricOf(input, `doctor:이가상.${field}`).values.prev).toBe(0)
  })

  it('AC-2904.3 비교 달 원장님 줄이 하나도 없으면(그 달 한 분만 진료) 원장님 지표는 0이 아니라 null이다', () => {
    const input = buildReportInput(withSections({ prev: sections({ ...PREV_SECTIONS, doctors: [] }) }))
    for (const name of ['김가상', '이가상']) {
      for (const field of ['patients', 'newPatients', 'amount']) expect(metricOf(input, `doctor:${name}.${field}`).values.prev).toBeNull()
    }
    // 원장님 밖 지표는 그대로 그 달 값이다
    expect(metricOf(input, 'insurance:건강보험').values.prev).toBe(75)
  })

  it('AC-2904.3 연령대는 늘 그 달 값이다(0명 줄은 null이 아니라 0)', () => {
    const input = buildReportInput(withSections({ prev: sections({ ...PREV_SECTIONS, age: [0, 3, 4, 9, 18, 22, 14, 9, 4, 7] }) }))
    expect(metricOf(input, 'age:10세 미만').values).toEqual({ selected: 2, prev: 0, lastYear: null })
  })

  it('AC-2904.3 작년 같은 달에 세 칸이 있으면 지난달과 같은 규칙으로 그 달 값을 쓴다', () => {
    const input = buildReportInput(withSections({ prev: null, lastYear: sections({ ...PREV_SECTIONS, month: '2025-10' }) }))
    expect(metricOf(input, 'age:40대').values).toEqual({ selected: 20, prev: null, lastYear: 18 })
    expect(metricOf(input, 'insurance:의료급여 1종').values).toEqual({ selected: 10, prev: null, lastYear: null })
    expect(metricOf(input, 'doctor:이가상.amount').values).toEqual({ selected: 9800000, prev: null, lastYear: 0 })
    expect(metricOf(input, 'weekday:6').values).toEqual({ selected: 4, prev: null, lastYear: 2.5 })
  })
})

describe('AC-2904.4 하루 평균 접수', () => {
  it('AC-2904.4 요일 = 그 요일 접수 합 ÷ 그 요일 문 연 날 수이고 소수 둘째 자리에서 반올림해 첫째 자리까지 남긴다(25÷3 → 8.3, 29÷3 → 9.7)', () => {
    const input = buildReportInput(withSections())
    expect(metricOf(input, 'weekday:2').values.selected).toBe(8.3)
    expect(metricOf(input, 'weekday:3').values.selected).toBe(9.7)
  })

  it('AC-2904.4 시간 = 그 시 접수 합 ÷ 일곱 요일 문 연 날 수의 합(40÷23 = 1.739… → 1.7, 30÷24 = 1.25 → 1.3)', () => {
    expect(metricOf(buildReportInput(withSections()), 'hour:10').values).toEqual({ selected: 1.7, prev: 1.3, lastYear: null })
  })

  it('AC-2904.4·AC-2905.1 AI에게 주는 평균과 근거 줄 글자는 진짜 평균을 한 번만 반올림한 값이다(6÷11 = 0.545… → 0.5건, 2÷3 = 0.666… → 0.7)', () => {
    const odd = sections({ ...SELECTED_SECTIONS, openDays: [3, 2, 2, 2, 2, 0, 0], weekdays: [2, 1, 1, 1, 1, 0, 0], hours: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
    const input = buildReportInput(withSections({ selected: odd, prev: null }))
    expect(metricOf(input, 'hour:8').values.selected).toBe(0.5)
    expect(metricOf(input, 'weekday:1').values.selected).toBe(0.7)
    expect(basisLine(metricOf(input, 'hour:8'), input)).toBe("근거 · '오전 8시' 하루 평균 접수 9월 자료 없음 → 10월 0.5건 · 작년 10월 자료 없음")
  })

  it('AC-2904.4 나누는 수가 0이면 null이다(문을 안 연 요일, 문 연 날이 하나도 없는 달의 요일·시간)', () => {
    const closed = sections({ ...PREV_SECTIONS, openDays: [0, 0, 0, 0, 0, 0, 0], weekdays: [0, 0, 0, 0, 0, 0, 0], hours: Array(13).fill(0), doctors: [] })
    const input = buildReportInput(withSections({ prev: closed }))
    for (const id of [...WEEKDAY_IDS, ...HOUR_IDS]) expect(metricOf(input, id).values.prev, id).toBeNull()
    expect(metricOf(input, 'weekday:7').values.selected).toBeNull()
    // 연령대·보험은 문 연 날과 상관없이 그 달 값이다
    expect(metricOf(input, 'age:40대').values.prev).toBe(18)
  })
})

describe('AC-2904.5 지표 종류', () => {
  it('AC-2904.5 MetricKind는 count·visits·rate에 won·average가 더해진 다섯이고, 세 칸 입력은 다섯을 모두 쓴다', () => {
    expectTypeOf<MetricKind>().toEqualTypeOf<'count' | 'visits' | 'rate' | 'won' | 'average'>()
    const kinds = new Set(buildReportInput(withSections()).metrics.map((m) => m.kind))
    expect([...kinds].sort()).toEqual(['average', 'count', 'rate', 'visits', 'won'])
  })

  it('AC-2904.5 매출은 won, 하루 평균은 average, 연령대·보험·동네·원장님 실환자·신환은 count다', () => {
    const input = buildReportInput(withSections())
    const kindOf = (id: string) => metricOf(input, id).kind
    expect(kindOf('doctor:김가상.amount')).toBe('won')
    expect(kindOf('weekday:1')).toBe('average')
    expect(kindOf('hour:9')).toBe('average')
    for (const id of ['age:40대', 'insurance:건강보험', 'town:원천동', 'doctor:김가상.patients', 'doctor:김가상.newPatients']) expect(kindOf(id), id).toBe('count')
  })
})
