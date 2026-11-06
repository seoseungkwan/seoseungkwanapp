import { describe, expect, expectTypeOf, it } from 'vitest'
import { isErrorCode } from '@/lib/errors'
import { validateMonthPayload } from '@/lib/payload/validate'
import type { AiErrorCode, ReportInput, ReportMetric } from '@/types/aiReport'
import type { ErrorCode } from '@/types/errors'
import type { MonthPayload } from '@/types/payload'
import { basisLine } from './basis'
import { TOP_REGIONS, TOP_RX, buildReportInput, reportFingerprint, type ValidReportMonths } from './input'

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
