import { describe, expect, it } from 'vitest'
import { aggregate } from '@/lib/analytics/aggregate'
import { buildSummary } from '@/lib/analytics/compare'
import type { RxGroupDef } from '@/types/analysis'
import type { AnalysisResult } from '@/types/analyze'
import type { ConsumptionRow } from '@/types/consumption'
import type { DayPayload } from '@/types/payload'
import { fillGroupCounts } from './groupCounts'
import { toDayPayloads } from './toDayPayloads'
import { validateDayPayload } from './validate'

// 모두 지어낸 값이다(가짜 코드·가짜 환자 번호)
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
const TODAY = '2026-10-25'

// 묶음 열쇠(groupKey) 모양의 id. 글자 차례: DOSU < ESWT < CARM
const ESWT: RxGroupDef = { id: 't2538e307d10103cb', codes: ['ESWT1', 'ESWT7'] }
const DOSU: RxGroupDef = { id: 't0c99afbb8431612f', codes: ['MM302'] }
const CARM: RxGroupDef = { id: 't2f4ba094dcd40dcf', codes: ['CARM1'] }
const DEFS = [ESWT, CARM, DOSU] // 일부러 글자 차례가 아니다
const IDS = DEFS.map((g) => g.id)

const zero = (id: string) => ({ id, patients: 0, newPatients: 0, returning: 0 })

// Worker·파일 길과 같은 셈: 줄 → aggregate(묶음) → 요약 → 저장할 일 줄
function dayPayloads(rows: ConsumptionRow[], groups: RxGroupDef[] = DEFS): DayPayload[] {
  const aggregates = aggregate(rows, groups)
  const result: AnalysisResult = {
    quality: 'valid',
    skippedInvalidRows: 0,
    unknownVisitRows: 0,
    aggregates,
    summary: buildSummary({ aggregates, covered: [{ from: '2026-09-01', to: '2026-10-24' }], quality: 'valid', today: TODAY }),
  }
  const days = toDayPayloads(result)
  if (days === null) throw new Error('저장할 일 줄이 없어요')
  return days
}

// 9/2: 1번 환자 ESWT1·ESWT7(신환), 2번 환자 eswt1(재진) · 9/3: 3번 환자 도수 · 9/4: 묶음 밖 처방만
const ROWS = [
  row({ patient: 1, rxCode: 'ESWT1', firstVisit: true }),
  row({ patient: 1, rxCode: 'ESWT7', firstVisit: true }),
  row({ patient: 2, rxCode: 'eswt1' }),
  row({ patient: 3, date: '2026-09-03', rxCode: 'MM302' }),
  row({ patient: 4, date: '2026-09-04', rxCode: 'D1001' }),
]

describe('AC-1205.3 fillGroupCounts — 받은 묶음 id마다 모든 날에 한 줄(0건 날도)', () => {
  it('AC-1205.3: 모든 날 줄의 groups에 받은 id마다 한 줄, 그날 아무도 안 받았으면 0줄, id 글자 차례', () => {
    const filled = fillGroupCounts(dayPayloads(ROWS), IDS)
    expect(filled.map((d) => d.day)).toEqual(['2026-09-02', '2026-09-03', '2026-09-04'])
    expect(filled.map((d) => d.groups)).toEqual([
      [zero(DOSU.id), { id: ESWT.id, patients: 2, newPatients: 1, returning: 1 }, zero(CARM.id)],
      [{ id: DOSU.id, patients: 1, newPatients: 0, returning: 1 }, zero(ESWT.id), zero(CARM.id)],
      [zero(DOSU.id), zero(ESWT.id), zero(CARM.id)],
    ])
  })

  it('AC-1205.3: 센 줄의 값과 묶음 밖 칸(totals·rx·revisit·partial)은 aggregate가 준 그대로다', () => {
    const days = dayPayloads(ROWS)
    const filled = fillGroupCounts(days, IDS)
    filled.forEach((day, i) => {
      const { groups, ...rest } = day
      const { groups: before, ...restBefore } = days[i]
      expect(rest).toEqual(restBefore)
      for (const counted of before) expect(groups).toContainEqual(counted)
    })
  })

  it('AC-1205.3: 받지 않은 id 줄은 없다(받은 id가 없으면 빈 목록)', () => {
    const days = dayPayloads(ROWS)
    expect(fillGroupCounts(days, [DOSU.id]).map((d) => d.groups)).toEqual([
      [zero(DOSU.id)],
      [{ id: DOSU.id, patients: 1, newPatients: 0, returning: 1 }],
      [zero(DOSU.id)],
    ])
    for (const day of fillGroupCounts(days, [])) expect(day.groups).toEqual([])
  })

  it('AC-1205.3: 같은 id를 두 번 받아도 한 줄', () => {
    const [first] = fillGroupCounts(dayPayloads(ROWS), [ESWT.id, ESWT.id])
    expect(first.groups).toEqual([{ id: ESWT.id, patients: 2, newPatients: 1, returning: 1 }])
  })

  it('AC-1205.3: 넣은 값은 바꾸지 않고 새 객체를 돌려준다', () => {
    const days = dayPayloads(ROWS)
    const ids = [...IDS]
    const before = structuredClone(days)
    const filled = fillGroupCounts(days, ids)
    expect(days).toEqual(before)
    expect(ids).toEqual(IDS)
    expect(filled).not.toBe(days)
    filled.forEach((day, i) => {
      expect(day).not.toBe(days[i])
      expect(day.groups).not.toBe(days[i].groups)
      day.groups.forEach((g) => expect(days[i].groups).not.toContain(g))
    })
    expect(fillGroupCounts([], IDS)).toEqual([])
  })

  it('AC-1205.3: 결과는 모두 validateDayPayload를 지나고 검사한 값과 같다', () => {
    const filled = fillGroupCounts(dayPayloads(ROWS), IDS)
    expect(filled.length).toBeGreaterThan(0)
    for (const day of filled) expect(validateDayPayload(day)).toEqual(day)
  })
})

describe('AC-1205.8 묶음 칸 크기 — 묶음 50개(칸마다 네 자리 숫자)', () => {
  it('AC-1205.8: 묶음 칸 때문에 늘어나는 JSON.stringify 길이는 4,500자 이하', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `tabcdef${String(i).padStart(10, '0')}`) // t + 16진수 16자리
    const day: DayPayload = {
      schemaVersion: 2,
      quality: 'valid',
      day: '2026-09-02',
      partial: false,
      totals: { patients: 9999, newPatients: 4000, returning: 5999, unknown: 0 },
      rx: [],
      groups: ids.map((id) => ({ id, patients: 9999, newPatients: 4000, returning: 5999 })),
      revisit: { cohort: 1000, within7: 1000, within14: 1000, within30: 1000, after30: 0 },
    }
    const [filled] = fillGroupCounts([day], ids)
    expect(filled.groups).toHaveLength(50)
    expect(validateDayPayload(filled)).toEqual(filled)
    const grown = JSON.stringify(filled).length - JSON.stringify({ ...filled, groups: [] }).length
    expect(grown).toBeGreaterThan(0)
    expect(grown).toBeLessThanOrEqual(4500)
  })
})

describe('AC-4402.4·AC-4409.2 fillGroupCounts는 first90·once 열쇠를 지킨다', () => {
  // 손으로 만든 v4 날 줄(지어낸 숫자)
  const v4Day = (): DayPayload => ({
    schemaVersion: 2,
    quality: 'valid',
    day: '2026-09-02',
    partial: false,
    totals: { patients: 5, newPatients: 2, first90: 1, returning: 2, unknown: 0 },
    rx: [{ code: 'ESWT1', name: '가짜 충격파', type: '행위', patients: 3, newPatients: 2, returning: 1, once: 1 }],
    groups: [{ id: ESWT.id, patients: 3, newPatients: 2, returning: 1 }],
    revisit: { cohort: 2, within7: null, within14: null, within30: null, after30: null },
  })

  it('AC-4402.4·AC-4409.2: 묶음 칸만 채우고 totals.first90·rx[].once는 그대로 둔다', () => {
    const [filled] = fillGroupCounts([v4Day()], IDS)
    expect(filled.totals).toEqual(v4Day().totals)
    expect(filled.rx).toEqual(v4Day().rx)
    expect(validateDayPayload(filled)).toEqual(filled)
  })

  it('AC-4402.4·AC-4409.2: 열쇠가 없는 날 줄에는 채운 뒤에도 없다', () => {
    const day = v4Day()
    const old: DayPayload = { ...day, totals: { patients: 5, newPatients: 2, returning: 3, unknown: 0 }, rx: [{ ...day.rx[0] }] }
    delete old.rx[0].once
    const [filled] = fillGroupCounts([old], IDS)
    expect('first90' in filled.totals).toBe(false)
    expect('once' in filled.rx[0]).toBe(false)
  })
})
