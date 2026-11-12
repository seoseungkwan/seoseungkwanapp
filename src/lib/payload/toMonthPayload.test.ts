import { describe, expect, it } from 'vitest'
import { aggregate } from '@/lib/analytics/aggregate'
import { buildSummary } from '@/lib/analytics/compare'
import { eachDay } from '@/lib/analytics/dates'
import type { RxGroupDef } from '@/types/analysis'
import type { AnalysisResult } from '@/types/analyze'
import type { ConsumptionRow } from '@/types/consumption'
import type { DateRange } from '@/types/dates'
import type { MonthPayload } from '@/types/payload'
import { toMonthPayload } from './toMonthPayload'
import { validateMonthPayload } from './validate'

const BASE: ConsumptionRow = {
  rxCode: 'D1001',
  rxName: '가짜정 10mg',
  rxType: '약품',
  date: '2026-09-02',
  firstVisit: false,
  outpatient: true,
  patient: 1,
  region: '서울특별시 강남구 역삼동',
}
const row = (over: Partial<ConsumptionRow> = {}): ConsumptionRow => ({ ...BASE, ...over })
const r = (from: string, to: string): DateRange => ({ from, to })
const SEPTEMBER = r('2026-09-01', '2026-09-30')
const TODAY = '2026-10-25'

// Worker(analyzeFiles)와 같은 길: 줄 → 일·주·월 숫자 → 요약
function analyze(
  rows: ConsumptionRow[],
  covered: DateRange[],
  today = TODAY,
  quality: 'valid' | 'incomplete' = 'valid',
  groups: RxGroupDef[] = [],
): AnalysisResult {
  const aggregates = aggregate(rows, groups)
  return {
    quality,
    skippedInvalidRows: quality === 'valid' ? 0 : 1,
    unknownVisitRows: 0,
    aggregates,
    summary: buildSummary({ aggregates, covered, quality, today }),
  }
}

// 9/1~10/24 매일 다른 환자 1명(재진), 오늘 10/25
function septemberToOct24(): AnalysisResult {
  const range = r('2026-09-01', '2026-10-24')
  return analyze(
    eachDay(range).map((date, i) => row({ date, patient: i + 1 })),
    [range],
  )
}

// 두 달, 처방 셋, 동네 둘(각 6명) — 정렬을 볼 수 있게 처방코드는 글자 순서와 다르게 나온다
function twoMonthsMixed(): ConsumptionRow[] {
  const codes = ['C300', 'A100', 'B200']
  const rows: ConsumptionRow[] = []
  for (const [m, date] of ['2026-09-03', '2026-10-05'].entries()) {
    for (let p = 1; p <= 12; p++) {
      const code = codes[(p - 1) % 3]
      rows.push(
        row({
          date,
          patient: m * 100 + p,
          rxCode: code,
          rxName: `가짜 ${code}`,
          firstVisit: p <= 2 ? true : p === 12 ? null : false,
          region: p <= 6 ? '서울특별시 강남구 역삼동' : '부산광역시 해운대구 우동',
        }),
      )
    }
  }
  return rows
}

describe('AC-008.3 집계 품질이 incomplete면 null', () => {
  it('완전한 달이 있어도 묶음이 incomplete면 그 달만 골라 내지 않는다', () => {
    const result = analyze([row()], [SEPTEMBER], TODAY, 'incomplete')
    expect(result.summary.series.month.map((ref) => ref.state)).toEqual(['complete'])
    expect(toMonthPayload(result)).toBeNull()
  })

  it('품질 표시가 없는 결과도 거부한다', () => {
    const result = { ...analyze([row()], [SEPTEMBER]), quality: undefined } as unknown as AnalysisResult
    expect(toMonthPayload(result)).toBeNull()
  })
})

describe('AC-008.1 9/1~10/24 파일(오늘 10/25) → 9월 완전·10월 일부, 2개', () => {
  it('달마다 하나, 달 오름차순', () => {
    const payloads = toMonthPayload(septemberToOct24())
    expect(payloads?.map((p) => [p.month, p.partial])).toEqual([
      ['2026-09', false],
      ['2026-10', true],
    ])
  })

  it('달 숫자는 그 달 칸의 합계 그대로', () => {
    const [september, october] = toMonthPayload(septemberToOct24())!
    expect(september).toEqual({
      schemaVersion: 2,
      quality: 'valid',
      month: '2026-09',
      partial: false,
      totals: { patients: 30, newPatients: 0, returning: 30, unknown: 0 },
      rx: [{ code: 'D1001', name: '가짜정 10mg', type: '약품', patients: 30, newPatients: 0, returning: 30, followup: [30, 0, 0, 0] }],
      groups: [],
      revisit: { cohort: 0, within7: 0, within14: 0, within30: null, after30: null }, // 신환이 없다. 7·14일 창은 10/14까지 덮였고 끝났다. 30일 창(10/30까지)은 10/24까지만 덮여 집계 중이다
      regions: [{ name: '서울특별시 강남구 역삼동', patients: 30 }],
    })
    expect(october.totals).toEqual({ patients: 24, newPatients: 0, returning: 24, unknown: 0 })
  })

  it("'집계 중'(머리 기간이 10/31까지인데 오늘 10/25)인 달도 일부", () => {
    const result = analyze([row({ date: '2026-10-02' })], [r('2026-10-01', '2026-10-31')])
    expect(result.summary.series.month.map((ref) => ref.state)).toEqual(['in-progress'])
    expect(toMonthPayload(result)?.map((p) => p.partial)).toEqual([true])
  })

  it('파일 사이 공백으로 덜 덮인 달은 끝났어도 일부', () => {
    const result = analyze(
      [row({ date: '2026-09-02' }), row({ date: '2026-09-25', patient: 2 })],
      [r('2026-09-01', '2026-09-10'), r('2026-09-20', '2026-09-30')],
    )
    expect(result.summary.series.month.map((ref) => ref.state)).toEqual(['partial'])
    expect(toMonthPayload(result)?.map((p) => p.partial)).toEqual([true])
  })
})

describe('AC-008.1 동네는 5명 이상만', () => {
  // 역삼동 5명 · 삼성동 4명 · 주소 없음 6명
  const people = (from: number, n: number, region: string | null) =>
    Array.from({ length: n }, (_, i) => row({ patient: from + i, region }))
  const rows = [
    ...people(1, 5, '서울특별시 강남구 역삼동'),
    ...people(6, 4, '서울특별시 강남구 삼성동'),
    ...people(10, 6, null),
  ]

  it('5명 미만은 빠지고(합치지 않음) 5명 이상은 남는다', () => {
    const [payload] = toMonthPayload(analyze(rows, [SEPTEMBER]))!
    expect(payload.regions).toEqual([
      { name: '서울특별시 강남구 역삼동', patients: 5 },
      { name: '주소 없음', patients: 6 },
    ])
    expect(payload.totals.patients).toBe(15) // 합계에는 모두 들어 있다
  })

  it('처방별 동네(RxStats.regions)는 넣지 않는다', () => {
    const [payload] = toMonthPayload(analyze(rows, [SEPTEMBER]))!
    expect(payload.rx).toHaveLength(1)
    expect(payload.rx[0]).not.toHaveProperty('regions')
  })
})

describe('AC-008.1 정해진 열쇠만 — 환자 번호·차트번호·파일 이름·날짜별 줄이 없다', () => {
  const sorted = (o: object) => Object.keys(o).sort()

  it('모든 층의 열쇠가 정해진 것뿐이다', () => {
    const payloads = JSON.parse(JSON.stringify(toMonthPayload(analyze(twoMonthsMixed(), [r('2026-09-01', '2026-10-24')]))))
    expect(payloads).toHaveLength(2)
    for (const p of payloads) {
      expect(sorted(p)).toEqual(['groups', 'month', 'partial', 'quality', 'regions', 'revisit', 'rx', 'schemaVersion', 'totals'])
      expect(sorted(p.totals)).toEqual(['newPatients', 'patients', 'returning', 'unknown'])
      expect(p.rx).toHaveLength(3)
      for (const x of p.rx) expect(sorted(x)).toEqual(['code', 'followup', 'name', 'newPatients', 'patients', 'returning', 'type'])
      expect(sorted(p.revisit)).toEqual(['after30', 'cohort', 'within14', 'within30', 'within7'])
      expect(p.regions).toHaveLength(2)
      for (const x of p.regions) expect(sorted(x)).toEqual(['name', 'patients'])
    }
  })

  it('날짜 글자가 없다(일·주 칸, 칸이 덮는 날 범위를 싣지 않는다)', () => {
    expect(JSON.stringify(toMonthPayload(septemberToOct24()))).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('결과에 다른 칸이 붙어 있어도 따라가지 않는다', () => {
    const result = septemberToOct24()
    const extra = { fileName: '가짜환자.xls', chartNo: 'C-0001', patientIds: [1, 2, 3] }
    const tainted = {
      ...result,
      ...extra,
      aggregates: {
        ...result.aggregates,
        month: result.aggregates.month.map((bucket) => ({
          ...bucket,
          ...extra,
          totals: { ...bucket.totals, ...extra },
          rx: bucket.rx.map((x) => ({ ...x, ...extra })),
          regions: bucket.regions.map((x) => ({ ...x, ...extra })),
          groups: bucket.groups.map((x) => ({ ...x, ...extra })),
          revisit: { ...bucket.revisit, ...extra },
        })),
      },
    } as AnalysisResult
    const json = JSON.stringify(toMonthPayload(tainted))
    expect(json).toBe(JSON.stringify(toMonthPayload(result)))
    for (const text of ['가짜환자', 'C-0001', 'fileName', 'chartNo', 'patientIds']) expect(json).not.toContain(text)
  })
})

describe('AC-008.1 같은 결과 → 같은 JSON(정렬 고정)', () => {
  const covered = [r('2026-09-01', '2026-10-24')]

  it('처방은 코드 순, 동네는 이름 순', () => {
    const [september] = toMonthPayload(analyze(twoMonthsMixed(), covered))!
    expect(september.rx.map((x) => x.code)).toEqual(['A100', 'B200', 'C300'])
    expect(september.regions.map((x) => x.name)).toEqual(['부산광역시 해운대구 우동', '서울특별시 강남구 역삼동'])
  })

  it('줄 순서가 달라도 같은 JSON', () => {
    const rows = twoMonthsMixed()
    expect(JSON.stringify(toMonthPayload(analyze([...rows].reverse(), covered)))).toBe(
      JSON.stringify(toMonthPayload(analyze(rows, covered))),
    )
  })

  it('결과 안 순서가 흐트러져 있어도 같은 JSON(달·처방·동네를 다시 정렬한다)', () => {
    const result = analyze(twoMonthsMixed(), covered)
    const shuffled: AnalysisResult = {
      ...result,
      aggregates: {
        ...result.aggregates,
        month: [...result.aggregates.month]
          .reverse()
          .map((bucket) => ({ ...bucket, rx: [...bucket.rx].reverse(), regions: [...bucket.regions].reverse() })),
      },
    }
    expect(JSON.stringify(toMonthPayload(shuffled))).toBe(JSON.stringify(toMonthPayload(result)))
  })

  it('넣은 결과를 바꾸지 않는다', () => {
    const result = analyze(twoMonthsMixed(), covered)
    const before = structuredClone(result)
    const payloads = toMonthPayload(result)!
    payloads[0].rx[0].followup[0] = 999
    payloads[0].totals.patients = 999
    expect(result).toEqual(before)
  })
})

describe('AC-008.1 v2: 처방 재진 · 그룹 · 재방문', () => {
  it('AC-3804.5: 그룹은 id 순으로 환자·신환·재진·F/U만 담는다(이름·코드 목록은 담지 않는다). 신환·재진은 받은(센) 날의 그날 표시로 나눈다', () => {
    // 1번 환자: 9/2 신환 날 MM101, 9/9 재진 날 MM102 / 2번 환자: 9/3 재진 날 MM101
    const rows = [
      row({ patient: 1, date: '2026-09-02', rxCode: 'MM101', firstVisit: true }),
      row({ patient: 1, date: '2026-09-09', rxCode: 'MM102' }),
      row({ patient: 2, date: '2026-09-03', rxCode: 'MM101' }),
    ]
    const groups = [
      { id: 'g-manual', codes: ['MM101', 'MM102'] },
      { id: 'g-a', codes: ['MM102'] },
    ]
    const [september] = toMonthPayload(analyze(rows, [SEPTEMBER], TODAY, 'valid', groups))!
    expect(september.groups).toEqual([
      { id: 'g-a', patients: 1, newPatients: 0, returning: 1, followup: [1, 0, 0, 0] },
      { id: 'g-manual', patients: 2, newPatients: 1, returning: 1, followup: [1, 1, 0, 0] },
    ])
    expect(september.rx.map((x) => [x.code, x.newPatients, x.returning])).toEqual([
      ['MM101', 1, 1],
      ['MM102', 0, 1],
    ])
    expect(validateMonthPayload(JSON.parse(JSON.stringify(september)))).toEqual(september)
  })

  it('그룹의 열쇠는 정해진 것뿐이고, 결과의 그룹에 다른 칸이 붙어 있어도 따라가지 않는다', () => {
    const rows = [row({ patient: 1, rxCode: 'MM101' }), row({ patient: 2, rxCode: 'MM102', date: '2026-09-03' })]
    const result = analyze(rows, [SEPTEMBER], TODAY, 'valid', [{ id: 'g-manual', codes: ['MM101', 'MM102'] }])
    const [september] = toMonthPayload(result)!
    expect(september.groups).toHaveLength(1)
    expect(Object.keys(september.groups[0]).sort()).toEqual(['followup', 'id', 'newPatients', 'patients', 'returning'])
    const extra = { name: '도수치료', codes: ['MM101'], chartNo: 'C-0001', patientIds: [1, 2] }
    const tainted: AnalysisResult = {
      ...result,
      aggregates: {
        ...result.aggregates,
        month: result.aggregates.month.map((bucket) => ({
          ...bucket,
          groups: bucket.groups.map((g) => ({ ...g, ...extra })),
          revisit: { ...bucket.revisit, ...extra },
        })),
      },
    }
    const json = JSON.stringify(toMonthPayload(tainted))
    expect(json).toBe(JSON.stringify(toMonthPayload(result)))
    for (const text of ['도수치료', 'C-0001', 'chartNo', 'patientIds', 'codes']) expect(json).not.toContain(text)
  })

  // 9/2 신환이 9/9(7일째)에 다시 왔다. 9월 칸의 7일 창은 9/1~10/7, 14일 창은 9/1~10/14, 30일 창은 9/1~10/30
  const revisitRows = () => [row({ patient: 1, date: '2026-09-02', firstVisit: true }), row({ patient: 1, date: '2026-09-09' })]

  it.each<[string, DateRange, MonthPayload['revisit']]>([
    ['7·14일 창만 다 덮임', r('2026-09-01', '2026-10-24'), { cohort: 1, within7: 1, within14: 1, within30: null, after30: null }],
    ['14일 창이 덜 덮임', r('2026-09-01', '2026-10-10'), { cohort: 1, within7: 1, within14: null, within30: null, after30: null }],
    ['9월만 덮임(달은 완전, 창은 덜 덮임)', SEPTEMBER, { cohort: 1, within7: null, within14: null, within30: null, after30: null }],
  ])('AC-502.1 재방문: %s → %j', (_, covered, expected) => {
    const [september] = toMonthPayload(analyze(revisitRows(), [covered]))!
    expect(september.partial).toBe(false)
    expect(september.revisit).toEqual(expected)
  })

  it('일부(partial) 달의 재방문은 집계 중', () => {
    const rows = [row({ patient: 1, date: '2026-10-02', firstVisit: true }), row({ patient: 1, date: '2026-10-05' })]
    const [october] = toMonthPayload(analyze(rows, [r('2026-10-01', '2026-10-24')]))!
    expect(october.partial).toBe(true)
    expect(october.revisit).toEqual({ cohort: 1, within7: null, within14: null, within30: null, after30: null })
  })

  // 9/3 신환이 9/25(22일째)에, 9/4 신환이 10/20(46일째)에 다시 왔다. 9/5 신환은 오지 않았다
  const longRevisitRows = () => [
    row({ patient: 1, date: '2026-09-03', firstVisit: true }),
    row({ patient: 1, date: '2026-09-25' }),
    row({ patient: 2, date: '2026-09-04', firstVisit: true }),
    row({ patient: 2, date: '2026-10-20' }),
    row({ patient: 3, date: '2026-09-05', firstVisit: true }),
  ]
  const AFTER_WINDOW = r('2026-09-01', '2026-11-15')

  it('AC-502.1 30일 창이 다 덮이고 끝나면 숫자다. schemaVersion은 2 그대로', () => {
    const september = toMonthPayload(analyze(longRevisitRows(), [AFTER_WINDOW], '2026-11-16'))!.find((p) => p.month === '2026-09')!
    expect(september.revisit).toEqual({ cohort: 3, within7: 0, within14: 0, within30: 1, after30: 1 })
    expect(september.schemaVersion).toBe(2)
  })

  it.each<[string, DateRange, string, boolean]>([
    ['30일 창이 다 덮임', AFTER_WINDOW, '2026-11-16', true],
    ['30일 창이 하루 덜 덮임', r('2026-09-01', '2026-10-29'), '2026-11-16', false],
    ['30일 창의 끝날이 오늘', AFTER_WINDOW, '2026-10-30', false],
    ['30일 창의 끝날이 어제', AFTER_WINDOW, '2026-10-31', true],
  ])("AC-502.1 '집계 중'은 요약의 판정 그대로: %s", (_, covered, today, counted) => {
    const result = analyze(longRevisitRows(), [covered], today)
    const summary = result.summary.series.month.find((ref) => ref.key === '2026-09')!.revisit
    const september = toMonthPayload(result)!.find((p) => p.month === '2026-09')!
    expect(summary.within30 !== null).toBe(counted)
    expect(september.revisit.within30).toBe(summary.within30)
    expect(september.revisit.after30).toBe(summary.after30)
  })
})
