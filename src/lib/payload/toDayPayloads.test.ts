import { describe, expect, it } from 'vitest'
import { aggregate } from '@/lib/analytics/aggregate'
import { buildSummary } from '@/lib/analytics/compare'
import type { RxGroupDef } from '@/types/analysis'
import type { AnalysisResult } from '@/types/analyze'
import type { ConsumptionRow } from '@/types/consumption'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { toDayPayloads } from './toDayPayloads'

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
const COVERED = r('2026-09-01', '2026-10-24')
const TODAY = '2026-10-25'

// Worker(analyzeFiles)와 같은 길: 줄 → 일·주·월 숫자 → 요약
function analyze(
  rows: ConsumptionRow[],
  covered: DateRange[] = [COVERED],
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

const sorted = (o: object) => Object.keys(o).sort()
const dayOf = (payloads: DayPayload[], day: string) => {
  const found = payloads.find((p) => p.day === day)
  if (found === undefined) throw new Error(`날이 없어요: ${day}`)
  return found
}

// 9/2(수): 처방 둘(코드 순서와 다르게 나온다), 그룹 둘, 신환 1·재진 2·알 수 없음 1. 신환은 9/5에 다시 온다
function mixedDay(): ConsumptionRow[] {
  return [
    row({ patient: 1, rxCode: 'MM101', rxName: '가짜 도수 10분', rxType: '행위', firstVisit: true }),
    row({ patient: 1, rxCode: 'D1001', firstVisit: true }),
    row({ patient: 2, rxCode: 'MM101', rxName: '가짜 도수 10분', rxType: '행위' }),
    row({ patient: 3, rxCode: 'D1001' }),
    row({ patient: 4, rxCode: 'D1001', firstVisit: null }),
    row({ patient: 1, date: '2026-09-05', rxCode: 'D1001' }),
  ]
}
const GROUPS: RxGroupDef[] = [
  { id: 'g-manual', codes: ['MM101', 'MM102'] },
  { id: 'g-drug', codes: ['D1001'] },
]

describe('AC-008.3 집계 품질이 incomplete면 null', () => {
  it('완전한 날이 있어도 묶음이 incomplete면 그 날만 골라 내지 않는다', () => {
    expect(toDayPayloads(analyze(mixedDay(), [COVERED], TODAY, 'incomplete'))).toBeNull()
  })

  it('품질 표시가 없는 결과도 거부한다', () => {
    const result = { ...analyze(mixedDay()), quality: undefined } as unknown as AnalysisResult
    expect(toDayPayloads(result)).toBeNull()
  })
})

describe('AC-008.2 줄이 있는 날마다 하나, 날짜 순', () => {
  it('휴진한 날(줄 없는 날)은 없고, 날짜 오름차순', () => {
    const payloads = toDayPayloads(analyze([row({ date: '2026-09-04' }), row({ date: '2026-09-01' }), row({ date: '2026-09-02' })]))!
    expect(payloads.map((p) => p.day)).toEqual(['2026-09-01', '2026-09-02', '2026-09-04'])
  })

  it('끝나고 덮인 날은 partial false, 오늘·덜 덮인 날은 true', () => {
    const rows = [row({ date: '2026-09-02' }), row({ date: '2026-09-08' }), row({ date: '2026-09-10' })]
    const payloads = toDayPayloads(analyze(rows, [r('2026-09-01', '2026-09-05')], '2026-09-10'))!
    expect(payloads.map((p) => [p.day, p.partial])).toEqual([
      ['2026-09-02', false],
      ['2026-09-08', true], // 덮이지 않음
      ['2026-09-10', true], // 오늘
    ])
  })
})

describe('AC-008.2 담는 것: 합계·처방(코드·이름·유형·환자·신환·재진)·그룹(환자·신환·재진)·재방문 — 동네·F/U 없음', () => {
  it('하루 칸 숫자 그대로', () => {
    const payloads = toDayPayloads(analyze(mixedDay(), [COVERED], TODAY, 'valid', GROUPS))!
    expect(dayOf(payloads, '2026-09-02')).toEqual({
      schemaVersion: 2,
      quality: 'valid',
      day: '2026-09-02',
      partial: false,
      totals: { patients: 4, newPatients: 1, returning: 2, unknown: 1 },
      rx: [
        { code: 'D1001', name: '가짜정 10mg', type: '약품', patients: 3, newPatients: 1, returning: 1 },
        { code: 'MM101', name: '가짜 도수 10분', type: '행위', patients: 2, newPatients: 1, returning: 1 },
      ],
      groups: [
        { id: 'g-drug', patients: 3, newPatients: 1, returning: 1 },
        { id: 'g-manual', patients: 2, newPatients: 1, returning: 1 },
      ],
      revisit: { cohort: 1, within7: 1, within14: 1 },
    })
    expect(dayOf(payloads, '2026-09-05').revisit).toEqual({ cohort: 0, within7: 0, within14: 0 })
  })

  it('모든 층의 열쇠가 정해진 것뿐이다(동네·F/U·칸 범위가 없다)', () => {
    const payloads = JSON.parse(JSON.stringify(toDayPayloads(analyze(mixedDay(), [COVERED], TODAY, 'valid', GROUPS))))
    expect(payloads).toHaveLength(2)
    for (const p of payloads) {
      expect(sorted(p)).toEqual(['day', 'groups', 'partial', 'quality', 'revisit', 'rx', 'schemaVersion', 'totals'])
      expect(sorted(p.totals)).toEqual(['newPatients', 'patients', 'returning', 'unknown'])
      for (const x of p.rx) expect(sorted(x)).toEqual(['code', 'name', 'newPatients', 'patients', 'returning', 'type'])
      for (const x of p.groups) expect(sorted(x)).toEqual(['id', 'newPatients', 'patients', 'returning'])
      expect(sorted(p.revisit)).toEqual(['cohort', 'within14', 'within7'])
    }
  })

  it.each<[string, DateRange, string, DayPayload['revisit']]>([
    ['두 창이 다 덮이고 끝남', COVERED, TODAY, { cohort: 1, within7: 1, within14: 1 }],
    ['14일 창(9/3~9/16)이 덜 덮임', r('2026-09-01', '2026-09-12'), TODAY, { cohort: 1, within7: 1, within14: null }],
    ['7일 창(9/3~9/9)의 끝날이 오늘', COVERED, '2026-09-09', { cohort: 1, within7: null, within14: null }],
  ])('재방문: %s → %j', (_, covered, today, expected) => {
    const payloads = toDayPayloads(analyze(mixedDay(), [covered], today))!
    expect(dayOf(payloads, '2026-09-02').revisit).toEqual(expected)
  })

  it('결과에 다른 칸이 붙어 있어도 따라가지 않는다', () => {
    const result = analyze(mixedDay(), [COVERED], TODAY, 'valid', GROUPS)
    const extra = { fileName: '가짜환자.xls', chartNo: 'C-0001', patientIds: [1, 2, 3] }
    const tainted = {
      ...result,
      ...extra,
      aggregates: {
        ...result.aggregates,
        day: result.aggregates.day.map((bucket) => ({
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
    const json = JSON.stringify(toDayPayloads(tainted))
    expect(json).toBe(JSON.stringify(toDayPayloads(result)))
    for (const text of ['가짜환자', 'C-0001', 'fileName', 'chartNo', 'patientIds', '역삼동']) expect(json).not.toContain(text)
  })
})

describe('AC-008.2 같은 결과 → 같은 JSON(정렬 고정)', () => {
  it('줄 순서가 달라도, 결과 안 순서가 흐트러져 있어도 같은 JSON(날·처방·그룹을 다시 정렬한다)', () => {
    const result = analyze(mixedDay(), [COVERED], TODAY, 'valid', GROUPS)
    const first = JSON.stringify(toDayPayloads(result))
    expect(JSON.stringify(toDayPayloads(analyze([...mixedDay()].reverse(), [COVERED], TODAY, 'valid', GROUPS)))).toBe(first)
    const shuffled: AnalysisResult = {
      ...result,
      aggregates: {
        ...result.aggregates,
        day: [...result.aggregates.day]
          .reverse()
          .map((bucket) => ({ ...bucket, rx: [...bucket.rx].reverse(), groups: [...bucket.groups].reverse() })),
      },
    }
    expect(JSON.stringify(toDayPayloads(shuffled))).toBe(first)
  })

  it('넣은 결과를 바꾸지 않는다', () => {
    const result = analyze(mixedDay(), [COVERED], TODAY, 'valid', GROUPS)
    const before = structuredClone(result)
    const payloads = toDayPayloads(result)!
    payloads[0].rx[0].patients = 999
    payloads[0].groups[0].patients = 999
    payloads[0].revisit.cohort = 999
    expect(result).toEqual(before)
  })
})
