import { describe, expect, it } from 'vitest'
import { aggregate } from '@/lib/analytics/aggregate'
import { buildSummary } from '@/lib/analytics/compare'
import { bucketState } from '@/lib/analytics/coverage'
import { addDays } from '@/lib/analytics/dates'
import type { RxGroupDef } from '@/types/analysis'
import type { AnalysisResult } from '@/types/analyze'
import type { ConsumptionRow } from '@/types/consumption'
import type { DateRange } from '@/types/dates'
import { AGAIN_WINDOWS, type DayPayload } from '@/types/payload'
import { toDayPayloads } from './toDayPayloads'
import { validateDayPayload } from './validate'

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
  it('하루 칸 숫자 그대로(AC-1302.2: 같은 처방 재방문 again도)', () => {
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
      revisit: { cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 },
      // D1001: 환자 1·3·4가 시작, 환자 1이 3일째(9/5)에 또 받음. MM101: 환자 1·2가 시작, 다시 받지 않음
      again: {
        ready: [true, true, true],
        rx: [
          { code: 'D1001', starts: 3, back: [1, 1, 1], more: [1, 1, 1] },
          { code: 'MM101', starts: 2, back: [0, 0, 0], more: [0, 0, 0] },
        ],
      },
    })
    expect(dayOf(payloads, '2026-09-05').revisit).toEqual({ cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 })
    // 9/5의 D1001은 앞 30일 안(9/2)에 받아 시작이 아니다
    expect(dayOf(payloads, '2026-09-05').again).toEqual({ ready: [true, true, true], rx: [] })
  })

  it('모든 층의 열쇠가 정해진 것뿐이다(동네·F/U·칸 범위가 없다, AC-1302.2: again은 ready·rx, 그 줄은 back·code·more·starts)', () => {
    const payloads = JSON.parse(JSON.stringify(toDayPayloads(analyze(mixedDay(), [COVERED], TODAY, 'valid', GROUPS))))
    expect(payloads).toHaveLength(2)
    for (const p of payloads) {
      expect(sorted(p)).toEqual(['again', 'day', 'groups', 'partial', 'quality', 'revisit', 'rx', 'schemaVersion', 'totals'])
      expect(sorted(p.totals)).toEqual(['newPatients', 'patients', 'returning', 'unknown'])
      for (const x of p.rx) expect(sorted(x)).toEqual(['code', 'name', 'newPatients', 'patients', 'returning', 'type'])
      for (const x of p.groups) expect(sorted(x)).toEqual(['id', 'newPatients', 'patients', 'returning'])
      expect(sorted(p.revisit)).toEqual(['after30', 'cohort', 'within14', 'within30', 'within7'])
      expect(sorted(p.again)).toEqual(['ready', 'rx'])
      for (const x of p.again.rx) expect(sorted(x)).toEqual(['back', 'code', 'more', 'starts'])
    }
    expect(payloads.flatMap((p: DayPayload) => p.again?.rx ?? [])).toHaveLength(2) // 줄 열쇠를 실제로 봤다
  })

  it.each<[string, DateRange, string, DayPayload['revisit']]>([
    ['세 창이 다 덮이고 끝남', COVERED, TODAY, { cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 }],
    ['30일 창(9/3~10/2)이 덜 덮임', r('2026-09-01', '2026-10-01'), TODAY, { cohort: 1, within7: 1, within14: 1, within30: null, after30: null }],
    ['30일 창의 끝날이 오늘', COVERED, '2026-10-02', { cohort: 1, within7: 1, within14: 1, within30: null, after30: null }],
    ['14일 창(9/3~9/16)이 덜 덮임', r('2026-09-01', '2026-09-12'), TODAY, { cohort: 1, within7: 1, within14: null, within30: null, after30: null }],
    ['7일 창(9/3~9/9)의 끝날이 오늘', COVERED, '2026-09-09', { cohort: 1, within7: null, within14: null, within30: null, after30: null }],
  ])('AC-502.1 재방문: %s → %j', (_, covered, today, expected) => {
    const payloads = toDayPayloads(analyze(mixedDay(), [covered], today))!
    expect(dayOf(payloads, '2026-09-02').revisit).toEqual(expected)
  })

  it('AC-502.1 31일째 이후에 처음 다시 온 신환은 after30이다. schemaVersion은 2 그대로', () => {
    const rows = [row({ patient: 1, firstVisit: true }), row({ patient: 1, date: '2026-10-10' })]
    const payload = dayOf(toDayPayloads(analyze(rows))!, '2026-09-02')
    expect(payload.revisit).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 1 })
    expect(payload.schemaVersion).toBe(2)
  })

  it.each<[string, DateRange, string]>([
    ['다 덮임', COVERED, TODAY],
    ['30일 창이 덜 덮임', r('2026-09-01', '2026-10-01'), TODAY],
    ['14일 창이 덜 덮임', r('2026-09-01', '2026-09-12'), TODAY],
    ['7일 창의 끝날이 오늘', COVERED, '2026-09-09'],
  ])("AC-502.1 '집계 중'은 요약의 판정 그대로: %s", (_, covered, today) => {
    const result = analyze(mixedDay(), [covered], today)
    const summary = result.summary.series.day.find((ref) => ref.key === '2026-09-02')!.revisit
    const { revisit } = dayOf(toDayPayloads(result)!, '2026-09-02')
    expect([revisit.within7, revisit.within14, revisit.within30, revisit.after30]).toEqual([summary.within7, summary.within14, summary.within30, summary.after30])
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

// ── 같은 처방 재방문(again, fu-rate REQ-1302) ──
// mixedDay의 9/2: D1001은 환자 1·3·4가 시작하고 환자 1이 3일째(9/5)에 또 받는다. MM101은 환자 1·2가 시작하고 다시 받지 않는다
const againOn = (payloads: DayPayload[], day: string) => {
  const { again } = dayOf(payloads, day)
  if (again === undefined) throw new Error(`again이 없어요: ${day}`)
  return again
}
const countsFor = (ready: readonly boolean[], value: number) => ready.map((r) => (r ? value : null))
const NONE = [null, null, null]

// [이름, 덮은 기간, 오늘, 9/2의 ready]. 9/2 + 7일 = 9/9, + 14일 = 9/16, + 30일 = 10/2
const READY_CASES: Array<[string, DateRange, string, [boolean, boolean, boolean]]> = [
  ['세 창 모두 덮이고 끝남', COVERED, TODAY, [true, true, true]],
  ['그날 + 29일(10/1)까지만 덮임', r('2026-09-01', '2026-10-01'), TODAY, [true, true, false]],
  ['그날 + 30일(10/2)이 오늘', COVERED, '2026-10-02', [true, true, false]],
  ['그날 + 14일(9/16)까지 덮이고 끝남', r('2026-09-01', '2026-09-16'), '2026-09-17', [true, true, false]],
  ['그날 + 14일(9/16)까지 덮였지만 그날이 오늘', r('2026-09-01', '2026-09-16'), '2026-09-16', [true, false, false]],
  ['그날 + 13일(9/15)까지만 덮임', r('2026-09-01', '2026-09-15'), TODAY, [true, false, false]],
  ['그날 + 7일(9/9)이 오늘', COVERED, '2026-09-09', [false, false, false]],
  ['그날 + 6일(9/8)까지만 덮임', r('2026-09-01', '2026-09-08'), TODAY, [false, false, false]],
]

describe('REQ-1302 날 숫자에 같은 처방 재방문(again)을 담는다', () => {
  it.each(READY_CASES)('AC-1302.1·AC-1302.2: %s → ready는 표대로, ready가 false인 창의 back·more는 null', (_, covered, today, ready) => {
    const again = againOn(toDayPayloads(analyze(mixedDay(), [covered], today))!, '2026-09-02')
    expect(again).toEqual({
      ready,
      rx: [
        { code: 'D1001', starts: 3, back: countsFor(ready, 1), more: countsFor(ready, 1) },
        { code: 'MM101', starts: 2, back: countsFor(ready, 0), more: countsFor(ready, 0) },
      ],
    })
  })

  it.each(READY_CASES)('AC-1302.1 ready는 신환 재방문 within7·14·30이 숫자가 되는 규칙과 같다: %s', (_, covered, today) => {
    const payload = dayOf(toDayPayloads(analyze(mixedDay(), [covered], today))!, '2026-09-02')
    const { within7, within14, within30 } = payload.revisit
    expect(payload.again?.ready).toEqual([within7 !== null, within14 !== null, within30 !== null])
  })

  it('AC-1302.1 날마다 ready[k] = bucketState({ 그날, 그날 + N일 }, 요약의 덮은 기간, 요약의 오늘)가 complete인가(덮은 기간 사이 공백 포함)', () => {
    const days = ['2026-09-01', '2026-09-10', '2026-09-20', '2026-10-01', '2026-10-10']
    const result = analyze(
      days.map((date) => row({ date })),
      [r('2026-09-01', '2026-09-25'), r('2026-09-28', '2026-10-20')],
      '2026-10-15',
    )
    const payloads = toDayPayloads(result)!
    expect(payloads.map((p) => [p.day, p.again?.ready])).toEqual([
      ['2026-09-01', [true, true, false]], // + 30일(10/1)은 공백(9/26·9/27)을 지난다
      ['2026-09-10', [true, true, false]],
      ['2026-09-20', [false, false, false]], // + 7일(9/27)이 공백
      ['2026-10-01', [true, false, false]], // + 14일(10/15)이 오늘
      ['2026-10-10', [false, false, false]], // + 7일(10/17)이 오늘 뒤
    ])
    for (const p of payloads) {
      const complete = AGAIN_WINDOWS.map(
        (n) => bucketState({ from: p.day, to: addDays(p.day, n) }, result.summary.covered, result.summary.today) === 'complete',
      )
      expect(p.again?.ready).toEqual(complete)
    }
  })

  it('AC-1302.1 오늘(집계 중)인 날은 ready가 모두 false이고 숫자는 모두 null', () => {
    const payload = dayOf(toDayPayloads(analyze([row({ date: TODAY })]))!, TODAY)
    expect(payload.partial).toBe(true)
    expect(payload.again).toEqual({ ready: [false, false, false], rx: [{ code: 'D1001', starts: 1, back: NONE, more: NONE }] })
  })

  it('AC-1302.1 partial인 날은 창이 덮였어도 ready가 모두 false다(요약에 그날 칸이 없음 → 검사 AC-1303.2와 어긋나지 않는다)', () => {
    const result = analyze(mixedDay())
    const noRef: AnalysisResult = {
      ...result,
      summary: { ...result.summary, series: { ...result.summary.series, day: result.summary.series.day.filter((ref) => ref.key !== '2026-09-02') } },
    }
    const payload = dayOf(toDayPayloads(noRef)!, '2026-09-02')
    expect(payload.partial).toBe(true)
    expect(payload.again).toEqual({
      ready: [false, false, false],
      rx: [
        { code: 'D1001', starts: 3, back: NONE, more: NONE },
        { code: 'MM101', starts: 2, back: NONE, more: NONE },
      ],
    })
    expect(validateDayPayload(payload)).toEqual(payload)
  })

  it.each(READY_CASES)('AC-1302.1·AC-1302.2 만든 날 줄은 모두 저장 검사(validateDayPayload)를 지난다: %s', (_, covered, today) => {
    const payloads = toDayPayloads(analyze(mixedDay(), [covered], today, 'valid', GROUPS))!
    for (const p of payloads) expect(validateDayPayload(p)).toEqual(p)
  })

  it('AC-1302.2 again 줄은 코드 글자 순이다(결과 안 순서가 흐트러져 있어도)', () => {
    const result = analyze(mixedDay())
    const shuffled: AnalysisResult = {
      ...result,
      aggregates: {
        ...result.aggregates,
        day: result.aggregates.day.map((bucket) => ({ ...bucket, again: bucket.again && [...bucket.again].reverse() })),
      },
    }
    expect(againOn(toDayPayloads(shuffled)!, '2026-09-02').rx.map((x) => x.code)).toEqual(['D1001', 'MM101'])
    expect(JSON.stringify(toDayPayloads(shuffled))).toBe(JSON.stringify(toDayPayloads(result)))
  })

  it('AC-1302.2 again 줄에 다른 칸이 붙어 있어도 따라가지 않는다(환자 번호·날짜 목록이 없다)', () => {
    const result = analyze(mixedDay())
    const extra = { patientIds: [1, 3, 4], visitDays: ['2026-09-05'], chartNo: 'C-0001' }
    const tainted = {
      ...result,
      aggregates: {
        ...result.aggregates,
        day: result.aggregates.day.map((bucket) => ({ ...bucket, again: bucket.again?.map((x) => ({ ...x, ...extra })) })),
      },
    } as AnalysisResult
    const json = JSON.stringify(toDayPayloads(tainted))
    expect(json).toBe(JSON.stringify(toDayPayloads(result)))
    for (const text of ['patientIds', 'visitDays', 'chartNo', 'C-0001']) expect(json).not.toContain(text)
  })

  it('AC-1302.2 칸에 again 열쇠가 없으면 rx는 빈 목록이고 ready는 그대로 낸다', () => {
    const result = analyze(mixedDay())
    const withoutAgain: AnalysisResult = {
      ...result,
      aggregates: {
        ...result.aggregates,
        day: result.aggregates.day.map((bucket) => {
          const copy = { ...bucket }
          delete copy.again
          return copy
        }),
      },
    }
    expect(againOn(toDayPayloads(withoutAgain)!, '2026-09-02')).toEqual({ ready: [true, true, true], rx: [] })
  })

  it('AC-1302.2 넣은 결과를 바꾸지 않는다(again 숫자 배열도 새로 만든다)', () => {
    const result = analyze(mixedDay())
    const before = structuredClone(result)
    const again = againOn(toDayPayloads(result)!, '2026-09-02')
    again.ready[0] = false
    again.rx[0].starts = 999
    again.rx[0].back[0] = 999
    again.rx[0].more[2] = 999
    expect(result).toEqual(before)
    expect(againOn(toDayPayloads(result)!, '2026-09-02').rx[0]).toEqual({ code: 'D1001', starts: 3, back: [1, 1, 1], more: [1, 1, 1] })
  })

  it('AC-1302.5 집계 품질이 incomplete면 시작이 있는 날이 있어도 지금처럼 null', () => {
    const result = analyze(mixedDay(), [COVERED], TODAY, 'incomplete')
    expect(result.aggregates.day.some((bucket) => (bucket.again ?? []).length > 0)).toBe(true)
    expect(toDayPayloads(result)).toBeNull()
  })
})
