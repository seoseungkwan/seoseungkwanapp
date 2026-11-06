import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createPatientIds, parseBitFile } from '@/lib/parsers/bit'
import type { Aggregates, BucketStats, FollowUp, GroupStats, Grain, PatientDay, RevisitCounts, RxAgain, RxGroupDef, RxStats, Totals } from '@/types/analysis'
import type { ConsumptionRow, ParsedFile, ParseResult } from '@/types/consumption'
import type { DateRange } from '@/types/dates'
import { buildFakeBitTable, toCsvBytes } from '../../../fixtures/make-fake-fixtures'
import { NO_ADDRESS, aggregate } from './aggregate'
import { addDays, diffDays, eachDay, monthOf, monthRange, weekRange, weekStartOf, weekdayOf } from './dates'

const FAKE_DIR = fileURLToPath(new URL('../../../fixtures/fake-bit/', import.meta.url))
const SLOW = { timeout: 30_000 }
const GRAINS: readonly Grain[] = ['day', 'week', 'month']

// 2026-10-19 월 · 20 화 · 21 수 · 25 일 · 26 월
const MON = '2026-10-19'
const TUE = '2026-10-20'
const WED = '2026-10-21'
const SUN = '2026-10-25'
const NEXT_MON = '2026-10-26'

const BASE: ConsumptionRow = {
  rxCode: 'D1001',
  rxName: '가짜정 10mg',
  rxType: '약품',
  date: MON,
  firstVisit: false,
  outpatient: true,
  patient: 1,
  region: '서울특별시 강남구 역삼동',
}
const row = (over: Partial<ConsumptionRow> = {}): ConsumptionRow => ({ ...BASE, ...over })

function bucketOf(agg: Aggregates, grain: Grain, key: string): BucketStats {
  const found = agg[grain].find((b) => b.key === key)
  if (found === undefined) throw new Error(`${grain} 칸이 없어요: ${key}`)
  return found
}

function rxOf(bucket: BucketStats, code: string): RxStats {
  const found = bucket.rx.find((r) => r.code === code)
  if (found === undefined) throw new Error(`${bucket.key} 칸에 처방이 없어요: ${code}`)
  return found
}

const keysOf = (agg: Aggregates, grain: Grain) => agg[grain].map((b) => b.key)
const sum = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0)

function parsedOf(result: ParseResult): ParsedFile {
  if (!result.ok) throw new Error(`실패: ${result.code}`)
  return result.value
}

// ── 느리지만 뻔한 기준: 칸마다 줄을 다시 걸러 Set으로 센다 ─────────────

const KEY_OF: Record<Grain, (date: string) => string> = { day: (date) => date, week: weekStartOf, month: monthOf }
const RANGE_OF: Record<Grain, (key: string) => DateRange> = {
  day: (key) => ({ from: key, to: key }),
  week: weekRange,
  month: monthRange,
}

// 가장 많이 나온 값, 같으면 먼저 나온 값
function mostCommon(values: string[]): string {
  const count = (v: string) => values.filter((x) => x === v).length
  return values.reduce((best, v) => (count(v) > count(best) ? v : best), values[0])
}

// 줄마다 지역별 서로 다른 환자 수, 이름 순
function regionsOf(rows: ConsumptionRow[]): { name: string; patients: number }[] {
  const names = [...new Set(rows.map((r) => r.region ?? NO_ADDRESS))].sort()
  return names.map((name) => ({
    name,
    patients: new Set(rows.filter((r) => (r.region ?? NO_ADDRESS) === name).map((r) => r.patient)).size,
  }))
}

// 같은 환자·같은 날 줄은 처음 한 줄만(처방 하나 또는 그룹 하나 안에서)
function onePerDay(rows: ConsumptionRow[]): ConsumptionRow[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const id = `${r.patient}|${r.date}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function followupOf(cases: ConsumptionRow[], patients: number[]): FollowUp {
  const followup: FollowUp = [0, 0, 0, 0]
  for (const p of patients) {
    const days = cases.filter((r) => r.patient === p).length
    followup[days === 1 ? 0 : days === 2 ? 1 : days <= 5 ? 2 : 3]++
  }
  return followup
}

// 일 칸 totals: 그날 줄에서 서로 다른 환자를 신환 > 재진 > 알 수 없음으로 한 번씩
function dayTotalsOf(inDay: ConsumptionRow[]): Totals {
  const patients = [...new Set(inDay.map((r) => r.patient))]
  const linesOf = (p: number) => inDay.filter((r) => r.patient === p)
  const newPatients = patients.filter((p) => linesOf(p).some((r) => r.firstVisit === true))
  const returning = patients.filter((p) => !newPatients.includes(p) && linesOf(p).some((r) => r.firstVisit === false))
  return {
    patients: patients.length,
    newPatients: newPatients.length,
    returning: returning.length,
    unknown: patients.length - newPatients.length - returning.length,
  }
}

function naiveAggregate(rows: ConsumptionRow[], groups: RxGroupDef[] = []): Aggregates {
  const outpatient = rows.filter((r) => r.outpatient !== false)
  // 재방문: 첫 신환일 = 묶음 전체에서 가장 이른 신환 외래 줄의 날
  const firstNew = new Map<number, string>()
  for (const r of outpatient) {
    const seen = firstNew.get(r.patient)
    if (r.firstVisit === true && (seen === undefined || r.date < seen)) firstNew.set(r.patient, r.date)
  }
  const cameBackWithin = (p: number, days: number) =>
    outpatient.some((r) => r.patient === p && diffDays(firstNew.get(p) ?? '', r.date) >= 1 && diffDays(firstNew.get(p) ?? '', r.date) <= days)
  // N일 안에는 오지 않고 N+1일째 이후에 처음 다시 옴
  const cameBackOnlyAfter = (p: number, days: number) =>
    !cameBackWithin(p, days) && outpatient.some((r) => r.patient === p && diffDays(firstNew.get(p) ?? '', r.date) > days)
  // 같은 처방 재방문(일 칸만): 그날 그 처방을 받은 환자 중 1~30일 전에 그 처방이 없던 환자가 시작.
  // 창 N = 다음 날부터 N일째까지 그 처방을 받은 서로 다른 날
  const rxDays = new Map<string, Set<string>>()
  for (const r of outpatient) {
    const id = `${r.patient}|${r.rxCode}`
    rxDays.set(id, (rxDays.get(id) ?? new Set<string>()).add(r.date))
  }
  const daysIn = (p: number, code: string, day: string, from: number, to: number) =>
    [...(rxDays.get(`${p}|${code}`) ?? [])].filter((date) => diffDays(day, date) >= from && diffDays(day, date) <= to).length
  const againOf = (day: string, inDay: ConsumptionRow[]): RxAgain[] =>
    [...new Set(inDay.map((r) => r.rxCode))].sort().flatMap((code) => {
      const starters = [...new Set(inDay.filter((r) => r.rxCode === code).map((r) => r.patient))].filter((p) => daysIn(p, code, day, -30, -1) === 0)
      if (starters.length === 0) return []
      const windows = (count: (n: number) => number): [number, number, number] => [count(7), count(14), count(30)]
      return [
        {
          code,
          starts: starters.length,
          back: windows((n) => starters.filter((p) => daysIn(p, code, day, 1, n) > 0).length),
          more: windows((n) => sum(starters.map((p) => daysIn(p, code, day, 1, n)))),
        },
      ]
    })
  const result = {} as Aggregates
  for (const grain of GRAINS) {
    const keyOf = KEY_OF[grain]
    const keys = [...new Set(outpatient.map((r) => keyOf(r.date)))].sort()
    result[grain] = keys.map((key) => {
      const inBucket = outpatient.filter((r) => keyOf(r.date) === key)
      const patients = [...new Set(inBucket.map((r) => r.patient))]
      const status = new Map(
        patients.map((p) => {
          const mine = inBucket.filter((r) => r.patient === p)
          const s = mine.some((r) => r.firstVisit === true) ? 'new' : mine.some((r) => r.firstVisit === false) ? 'returning' : 'unknown'
          return [p, s] as const
        }),
      )
      const codes = [...new Set(inBucket.map((r) => r.rxCode))].sort()
      const rx = codes.map((code): RxStats => {
        const cases = onePerDay(inBucket.filter((r) => r.rxCode === code))
        const rxPatients = [...new Set(cases.map((r) => r.patient))]
        return {
          code,
          name: mostCommon(cases.map((r) => r.rxName)),
          type: mostCommon(cases.map((r) => r.rxType)),
          patients: rxPatients.length,
          newPatients: rxPatients.filter((p) => status.get(p) === 'new').length,
          returning: rxPatients.filter((p) => status.get(p) === 'returning').length,
          followup: followupOf(cases, rxPatients),
          regions: regionsOf(inBucket.filter((r) => r.rxCode === code)),
        }
      })
      const groupStats = [...groups]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((group): GroupStats => {
          const cases = onePerDay(inBucket.filter((r) => group.codes.includes(r.rxCode)))
          const groupPatients = [...new Set(cases.map((r) => r.patient))]
          return {
            id: group.id,
            patients: groupPatients.length,
            newPatients: groupPatients.filter((p) => status.get(p) === 'new').length,
            returning: groupPatients.filter((p) => status.get(p) === 'returning').length,
            followup: followupOf(cases, groupPatients),
          }
        })
        .filter((group) => group.patients > 0)
      // 주·달 totals = 그 칸 일 칸 네 칸의 합(AC-501.6). 일 칸은 날이 하나라 그날 값 그대로다
      const dayTotals = [...new Set(inBucket.map((r) => r.date))].map((date) => dayTotalsOf(inBucket.filter((r) => r.date === date)))
      const cohort = [...firstNew].filter(([, date]) => keyOf(date) === key).map(([p]) => p)
      const revisit: RevisitCounts = {
        cohort: cohort.length,
        within7: cohort.filter((p) => cameBackWithin(p, 7)).length,
        within14: cohort.filter((p) => cameBackWithin(p, 14)).length,
        within30: cohort.filter((p) => cameBackWithin(p, 30)).length,
        after30: cohort.filter((p) => cameBackOnlyAfter(p, 30)).length,
      }
      return {
        key,
        range: RANGE_OF[grain](key),
        totals: {
          patients: sum(dayTotals.map((t) => t.patients)),
          newPatients: sum(dayTotals.map((t) => t.newPatients)),
          returning: sum(dayTotals.map((t) => t.returning)),
          unknown: sum(dayTotals.map((t) => t.unknown)),
        },
        rx,
        regions: regionsOf(inBucket),
        groups: groupStats,
        revisit,
        ...(grain === 'day' ? { again: againOf(key, inBucket) } : {}),
      }
    })
  }
  return result
}

// ── 칸 만들기 ─────────────────────────────────────────────

describe('AC-006.1 aggregate — 칸', () => {
  it('줄이 없으면 세 갈래 모두 빈 목록', () => {
    expect(aggregate([])).toEqual({ day: [], week: [], month: [] })
  })

  it('작은 자료의 결과 전체 모양', () => {
    const agg = aggregate([
      row({ patient: 1, date: MON, firstVisit: true }),
      row({ patient: 1, date: MON, firstVisit: true, rxCode: 'AA154', rxName: '초진 진찰료', rxType: '진찰료' }),
      row({ patient: 2, date: TUE, firstVisit: false, region: null }),
    ])
    const yeoksam = [{ name: '서울특별시 강남구 역삼동', patients: 1 }]
    const exam: RxStats = {
      code: 'AA154',
      name: '초진 진찰료',
      type: '진찰료',
      patients: 1,
      newPatients: 1,
      returning: 0,
      followup: [1, 0, 0, 0],
      regions: yeoksam,
    }
    const weekRegions = [
      { name: '서울특별시 강남구 역삼동', patients: 1 },
      { name: '주소 없음', patients: 1 },
    ]
    const week = {
      totals: { patients: 2, newPatients: 1, returning: 1, unknown: 0 },
      rx: [exam, { code: 'D1001', name: '가짜정 10mg', type: '약품', patients: 2, newPatients: 1, returning: 1, followup: [2, 0, 0, 0], regions: weekRegions }],
      regions: weekRegions,
      groups: [],
      revisit: { cohort: 1, within7: 0, within14: 0, within30: 0, after30: 0 }, // 1번 환자는 월요일 신환 뒤로 오지 않았다
    }
    expect(agg).toEqual({
      day: [
        {
          key: MON,
          range: { from: MON, to: MON },
          totals: { patients: 1, newPatients: 1, returning: 0, unknown: 0 },
          rx: [exam, { code: 'D1001', name: '가짜정 10mg', type: '약품', patients: 1, newPatients: 1, returning: 0, followup: [1, 0, 0, 0], regions: yeoksam }],
          regions: [{ name: '서울특별시 강남구 역삼동', patients: 1 }],
          groups: [],
          revisit: { cohort: 1, within7: 0, within14: 0, within30: 0, after30: 0 },
          again: [
            { code: 'AA154', starts: 1, back: [0, 0, 0], more: [0, 0, 0] },
            { code: 'D1001', starts: 1, back: [0, 0, 0], more: [0, 0, 0] },
          ],
        },
        {
          key: TUE,
          range: { from: TUE, to: TUE },
          totals: { patients: 1, newPatients: 0, returning: 1, unknown: 0 },
          rx: [
            {
              code: 'D1001',
              name: '가짜정 10mg',
              type: '약품',
              patients: 1,
              newPatients: 0,
              returning: 1,
              followup: [1, 0, 0, 0],
              regions: [{ name: '주소 없음', patients: 1 }],
            },
          ],
          regions: [{ name: '주소 없음', patients: 1 }],
          groups: [],
          revisit: { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 },
          again: [{ code: 'D1001', starts: 1, back: [0, 0, 0], more: [0, 0, 0] }],
        },
      ],
      week: [{ key: MON, range: { from: MON, to: SUN }, ...week }],
      month: [{ key: '2026-10', range: { from: '2026-10-01', to: '2026-10-31' }, ...week }],
    })
  })

  it('줄이 있는 칸만, key 오름차순(줄 순서와 상관없이)', () => {
    const agg = aggregate([row({ date: NEXT_MON }), row({ date: MON }), row({ date: '2026-10-01' }), row({ date: '2026-08-31' })])
    expect(keysOf(agg, 'day')).toEqual(['2026-08-31', '2026-10-01', MON, NEXT_MON])
    expect(keysOf(agg, 'week')).toEqual(['2026-08-31', '2026-09-28', MON, NEXT_MON])
    expect(keysOf(agg, 'month')).toEqual(['2026-08', '2026-10'])
  })

  it('주 칸 key는 그 주 월요일, 일요일 줄은 앞 월요일 주로(2026-10-25 → 2026-10-19)', () => {
    const agg = aggregate([row({ date: SUN }), row({ date: NEXT_MON, patient: 2 })])
    expect(keysOf(agg, 'week')).toEqual([MON, NEXT_MON])
    expect(bucketOf(agg, 'week', MON).range).toEqual({ from: MON, to: SUN })
    expect(bucketOf(agg, 'week', MON).totals.patients).toBe(1)
    expect(bucketOf(agg, 'week', NEXT_MON).range).toEqual({ from: NEXT_MON, to: '2026-11-01' })
  })

  it('칸이 덮는 날: 일 = 그날, 월 = 1일~말일', () => {
    const agg = aggregate([row({ date: SUN }), row({ date: '2026-02-10' })])
    expect(bucketOf(agg, 'day', SUN).range).toEqual({ from: SUN, to: SUN })
    expect(bucketOf(agg, 'month', '2026-10').range).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(bucketOf(agg, 'month', '2026-02').range).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('달을 넘는 주: 9월 30일(수)·10월 1일(목) → 주 칸 하나, 월 칸 둘', () => {
    const agg = aggregate([row({ date: '2026-09-30' }), row({ date: '2026-10-01' })])
    expect(keysOf(agg, 'week')).toEqual(['2026-09-28'])
    expect(bucketOf(agg, 'week', '2026-09-28').totals.patients).toBe(2) // 일 칸의 합
    expect(keysOf(agg, 'month')).toEqual(['2026-09', '2026-10'])
    expect(bucketOf(agg, 'month', '2026-09').totals.patients).toBe(1)
    expect(bucketOf(agg, 'month', '2026-10').totals.patients).toBe(1)
  })
})

// ── DATA_RULES 4절: 환자 수 ───────────────────────────────

describe('AC-006.1·AC-501.6 환자 수 — 일 칸은 그날 환자, 주·달 totals는 일 칸의 합', () => {
  it('같은 환자 월·화 방문 → 일 칸 각 1명, 주 칸 2명, 월 칸 2명', () => {
    const agg = aggregate([row({ patient: 1, date: MON }), row({ patient: 1, date: TUE })])
    expect(bucketOf(agg, 'day', MON).totals.patients).toBe(1)
    expect(bucketOf(agg, 'day', TUE).totals.patients).toBe(1)
    expect(bucketOf(agg, 'week', MON).totals.patients).toBe(2)
    expect(bucketOf(agg, 'month', '2026-10').totals.patients).toBe(2)
  })

  it('주·달 totals는 일의 합이고 rx[]는 합이 아니다(월 2명 + 화 1명 = totals 3, 처방은 서로 다른 2명)', () => {
    const agg = aggregate([row({ patient: 1, date: MON }), row({ patient: 2, date: MON }), row({ patient: 1, date: TUE })])
    expect(bucketOf(agg, 'day', MON).totals.patients).toBe(2)
    expect(bucketOf(agg, 'day', TUE).totals.patients).toBe(1)
    expect(bucketOf(agg, 'week', MON).totals.patients).toBe(3)
    expect(bucketOf(agg, 'month', '2026-10').totals.patients).toBe(3)
    expect(rxOf(bucketOf(agg, 'week', MON), 'D1001').patients).toBe(2)
    expect(rxOf(bucketOf(agg, 'month', '2026-10'), 'D1001').patients).toBe(2)
  })

  it('처방이 여러 개여도 환자는 한 명', () => {
    const agg = aggregate([row({ rxCode: 'D1001' }), row({ rxCode: 'MM042' }), row({ rxCode: 'AA254' })])
    const day = bucketOf(agg, 'day', MON)
    expect(day.totals.patients).toBe(1)
    expect(day.rx.map((r) => r.patients)).toEqual([1, 1, 1])
  })
})

// ── 같은 줄 중복 ──────────────────────────────────────────

describe('AC-006.1 같은 줄 중복 — 같은 환자·같은 날·같은 처방 여러 줄 = 1건', () => {
  it('3줄 → 1건(F/U 1회)', () => {
    const agg = aggregate([row(), row(), row()])
    for (const grain of GRAINS) {
      const bucket = agg[grain][0]
      expect(bucket.totals.patients).toBe(1)
      expect(rxOf(bucket, 'D1001')).toMatchObject({ patients: 1, followup: [1, 0, 0, 0] })
    }
  })

  it('월 2줄 + 화 1줄 → 주 칸은 서로 다른 날 2번(F/U 2회)', () => {
    const agg = aggregate([row({ date: MON }), row({ date: MON }), row({ date: TUE })])
    expect(rxOf(bucketOf(agg, 'day', MON), 'D1001').followup).toEqual([1, 0, 0, 0])
    expect(rxOf(bucketOf(agg, 'week', MON), 'D1001').followup).toEqual([0, 1, 0, 0])
    expect(rxOf(bucketOf(agg, 'month', '2026-10'), 'D1001').followup).toEqual([0, 1, 0, 0])
  })
})

// ── 신환·재진·알 수 없음 ──────────────────────────────────

describe('AC-006.1 신환 — 칸 안에 신환 줄이 있는 환자 = 신환', () => {
  it('월요일 신환, 수요일 재진 → 월요일 칸 신환, 수요일 칸 재진, 그 주·달 칸은 일 칸의 합(신환 1, 재진 1)', () => {
    const agg = aggregate([row({ date: MON, firstVisit: true }), row({ date: WED, firstVisit: false })])
    expect(bucketOf(agg, 'day', MON).totals).toEqual({ patients: 1, newPatients: 1, returning: 0, unknown: 0 })
    expect(bucketOf(agg, 'day', WED).totals).toEqual({ patients: 1, newPatients: 0, returning: 1, unknown: 0 })
    expect(bucketOf(agg, 'week', MON).totals).toEqual({ patients: 2, newPatients: 1, returning: 1, unknown: 0 })
    expect(bucketOf(agg, 'month', '2026-10').totals).toEqual({ patients: 2, newPatients: 1, returning: 1, unknown: 0 })
  })

  it('신환 줄이 하나라도 있으면 신환, 없고 재진 줄이 있으면 재진(줄 순서와 상관없이)', () => {
    const agg = aggregate([
      row({ patient: 1, rxCode: 'AA254', firstVisit: false }),
      row({ patient: 1, rxCode: 'D1001', firstVisit: null }),
      row({ patient: 1, rxCode: 'MM042', firstVisit: true }),
      row({ patient: 2, rxCode: 'D1001', firstVisit: null }),
      row({ patient: 2, rxCode: 'MM042', firstVisit: false }),
    ])
    expect(bucketOf(agg, 'day', MON).totals).toEqual({ patients: 2, newPatients: 1, returning: 1, unknown: 0 })
  })

  it('초재진 값이 모두 null인 환자 → 알 수 없음, 합 = 환자 수', () => {
    const agg = aggregate([
      row({ patient: 1, date: MON, firstVisit: null }),
      row({ patient: 1, date: TUE, firstVisit: null }),
      row({ patient: 2, date: TUE, firstVisit: false }),
      row({ patient: 3, date: TUE, firstVisit: true }),
    ])
    const week = bucketOf(agg, 'week', MON).totals
    expect(week).toEqual({ patients: 4, newPatients: 1, returning: 1, unknown: 2 }) // 1번 환자는 월·화 하루씩
    expect(week.newPatients + week.returning + week.unknown).toBe(week.patients)
    expect(bucketOf(agg, 'day', MON).totals).toEqual({ patients: 1, newPatients: 0, returning: 0, unknown: 1 })
  })

  it('처방별 신환 = 그 처방을 받은 환자 중 그 칸의 신환', () => {
    const agg = aggregate([
      row({ patient: 1, date: MON, firstVisit: true, rxCode: 'AA154' }),
      row({ patient: 1, date: WED, firstVisit: false, rxCode: 'D1001' }),
      row({ patient: 2, date: WED, firstVisit: false, rxCode: 'D1001' }),
    ])
    expect(rxOf(bucketOf(agg, 'week', MON), 'D1001')).toMatchObject({ patients: 2, newPatients: 1 })
    expect(rxOf(bucketOf(agg, 'day', WED), 'D1001')).toMatchObject({ patients: 2, newPatients: 0 })
    expect(rxOf(bucketOf(agg, 'day', MON), 'AA154')).toMatchObject({ patients: 1, newPatients: 1 })
  })
})

// ── 외래만 ────────────────────────────────────────────────

describe('AC-006.1 외래만 — 입원 줄(outpatient: false)은 뺀다', () => {
  it('입원 줄만 있는 환자 → 어디에도 안 셈, null은 외래로 셈', () => {
    const inpatient = { patient: 1, outpatient: false, firstVisit: true, rxCode: 'J2002', region: '경기도 화성시 봉담읍 와우리' }
    const agg = aggregate([
      row({ ...inpatient, date: MON }),
      row({ ...inpatient, date: TUE }),
      row({ patient: 2, date: MON, outpatient: null }),
    ])
    expect(keysOf(agg, 'day')).toEqual([MON]) // 입원 줄만 있는 화요일은 칸이 없다
    for (const grain of GRAINS) {
      const bucket = agg[grain][0]
      expect(bucket.totals).toEqual({ patients: 1, newPatients: 0, returning: 1, unknown: 0 })
      expect(bucket.rx.map((r) => r.code)).toEqual(['D1001'])
      expect(bucket.regions).toEqual([{ name: '서울특별시 강남구 역삼동', patients: 1 }])
    }
  })

  it('외래·입원 줄이 다 있는 환자는 외래 줄만 센다', () => {
    const agg = aggregate([
      row({ outpatient: false, firstVisit: true, rxCode: 'J2002' }),
      row({ outpatient: true, firstVisit: false, rxCode: 'D1001' }),
    ])
    const day = bucketOf(agg, 'day', MON)
    expect(day.totals).toEqual({ patients: 1, newPatients: 0, returning: 1, unknown: 0 })
    expect(day.rx.map((r) => r.code)).toEqual(['D1001'])
  })

  it('입원 줄만 있으면 칸이 하나도 없다', () => {
    expect(aggregate([row({ outpatient: false })])).toEqual({ day: [], week: [], month: [] })
  })
})

// ── F/U 횟수 ──────────────────────────────────────────────

describe('AC-006.1 F/U — 칸 안에서 그 처방을 받은 서로 다른 날 수', () => {
  const OCTOBER = eachDay({ from: '2026-10-01', to: '2026-10-31' })
  const visits = (patient: number, days: number, rxCode = 'D1001') =>
    OCTOBER.slice(0, days).map((date) => row({ patient, date, rxCode }))

  it('1·2·4·7번 받은 환자 넷 → [1, 1, 1, 1], F/U율 분모 = 4', () => {
    const agg = aggregate([...visits(1, 1), ...visits(2, 2), ...visits(3, 4), ...visits(4, 7), ...visits(1, 3, 'MM042')])
    const rx = rxOf(bucketOf(agg, 'month', '2026-10'), 'D1001')
    expect(rx.followup).toEqual([1, 1, 1, 1])
    expect(rx.patients).toBe(4)
    expect(sum(rx.followup)).toBe(rx.patients)
    expect((rx.followup[1] + rx.followup[2] + rx.followup[3]) / rx.patients).toBe(0.75) // F/U율 = 2회 이상
    expect(rxOf(bucketOf(agg, 'month', '2026-10'), 'MM042').followup).toEqual([0, 0, 1, 0]) // 다른 처방과 섞이지 않음
  })

  it('경계: 3·5일 → 3~5회, 6일 → 6회+', () => {
    const agg = aggregate([...visits(1, 3), ...visits(2, 5), ...visits(3, 6), ...visits(4, 31)])
    expect(rxOf(bucketOf(agg, 'month', '2026-10'), 'D1001').followup).toEqual([0, 0, 2, 2])
  })

  it('날 수는 그 칸 안에서만 센다(칸을 넘어 잇지 않는다)', () => {
    const agg = aggregate(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((date) => row({ date })))
    expect(rxOf(bucketOf(agg, 'month', '2026-09'), 'D1001').followup).toEqual([0, 1, 0, 0])
    expect(rxOf(bucketOf(agg, 'month', '2026-10'), 'D1001').followup).toEqual([0, 1, 0, 0])
    expect(rxOf(bucketOf(agg, 'week', '2026-09-28'), 'D1001').followup).toEqual([0, 0, 1, 0])
    for (const day of agg.day) expect(rxOf(day, 'D1001').followup).toEqual([1, 0, 0, 0])
  })
})

// ── 처방 이름·유형 ────────────────────────────────────────

describe('AC-006.1 처방 이름·유형 — 그 칸에서 가장 많이 나온 것, 같으면 먼저 나온 것', () => {
  it('칸마다 따로 고른다', () => {
    const agg = aggregate([
      row({ patient: 1, date: MON, rxName: '이름가', rxType: '약품' }),
      row({ patient: 2, date: MON, rxName: '이름나', rxType: '주사' }),
      row({ patient: 3, date: TUE, rxName: '이름나', rxType: '주사' }),
    ])
    expect(rxOf(bucketOf(agg, 'day', MON), 'D1001')).toMatchObject({ name: '이름가', type: '약품' }) // 1:1 → 먼저 나온 것
    expect(rxOf(bucketOf(agg, 'day', TUE), 'D1001')).toMatchObject({ name: '이름나', type: '주사' })
    expect(rxOf(bucketOf(agg, 'week', MON), 'D1001')).toMatchObject({ name: '이름나', type: '주사' }) // 2:1
  })

  it('같은 날 중복 줄은 이름도 한 번만 센다', () => {
    const agg = aggregate([
      row({ patient: 1, rxName: '이름가' }),
      row({ patient: 1, rxName: '이름가' }),
      row({ patient: 1, rxName: '이름가' }),
      row({ patient: 2, rxName: '이름나' }),
      row({ patient: 3, rxName: '이름나' }),
    ])
    expect(rxOf(bucketOf(agg, 'day', MON), 'D1001').name).toBe('이름나')
  })
})

// ── 지역 ──────────────────────────────────────────────────

describe('AC-006.1 지역 — 칸마다 지역별 서로 다른 환자 수', () => {
  it("null → '주소 없음', 이름 순", () => {
    expect(NO_ADDRESS).toBe('주소 없음')
    const agg = aggregate([
      row({ patient: 1, region: '서울특별시 서초구 서초동' }),
      row({ patient: 2, region: null }),
      row({ patient: 3, region: '경기도 성남시 분당구 정자동' }),
      row({ patient: 4, region: '서울특별시 서초구 서초동' }),
      row({ patient: 4, region: '서울특별시 서초구 서초동', rxCode: 'MM042' }),
    ])
    expect(bucketOf(agg, 'day', MON).regions).toEqual([
      { name: '경기도 성남시 분당구 정자동', patients: 1 },
      { name: '서울특별시 서초구 서초동', patients: 2 },
      { name: NO_ADDRESS, patients: 1 },
    ])
  })

  it('한 칸에서 두 지역에 나온 환자는 두 곳에 다 센다', () => {
    const agg = aggregate([
      row({ date: MON, region: '서울특별시 강남구 역삼동' }),
      row({ date: TUE, region: '서울특별시 강남구 삼성동' }),
      row({ date: WED, region: '서울특별시 강남구 역삼동' }),
    ])
    expect(bucketOf(agg, 'day', TUE).regions).toEqual([{ name: '서울특별시 강남구 삼성동', patients: 1 }])
    expect(bucketOf(agg, 'week', MON).regions).toEqual([
      { name: '서울특별시 강남구 삼성동', patients: 1 },
      { name: '서울특별시 강남구 역삼동', patients: 1 },
    ])
    expect(bucketOf(agg, 'week', MON).totals.patients).toBe(3) // 일 칸의 합
  })
})

// ── 처방별 지역 ───────────────────────────────────────────

describe('AC-006.1 처방별 지역 — 칸마다 그 처방을 받은 환자의 지역별 수(칸 지역과 같은 규칙)', () => {
  const YEOKSAM = '서울특별시 강남구 역삼동'
  const SAMSEONG = '서울특별시 강남구 삼성동'
  const SEOCHO = '서울특별시 서초구 서초동'
  const JEONGJA = '경기도 성남시 분당구 정자동'

  it('AC-0.1 같은 환자·같은 처방·같은 지역 여러 줄 → 그 지역 1명', () => {
    const agg = aggregate([row({ date: MON }), row({ date: MON }), row({ date: TUE })])
    for (const grain of GRAINS) {
      for (const bucket of agg[grain]) expect(rxOf(bucket, 'D1001').regions).toEqual([{ name: YEOKSAM, patients: 1 }])
    }
  })

  it('AC-0.2 한 처방을 받은 환자들이 지역별로 나뉘어 세진다, 다른 처방의 환자는 섞이지 않는다', () => {
    const agg = aggregate([
      row({ patient: 1, region: SEOCHO }),
      row({ patient: 2, region: SEOCHO }),
      row({ patient: 3, region: JEONGJA }),
      row({ patient: 1, region: SEOCHO, rxCode: 'MM042' }),
      row({ patient: 4, region: YEOKSAM, rxCode: 'MM042' }),
    ])
    const day = bucketOf(agg, 'day', MON)
    expect(rxOf(day, 'D1001').regions).toEqual([
      { name: JEONGJA, patients: 1 },
      { name: SEOCHO, patients: 2 },
    ])
    expect(rxOf(day, 'MM042').regions).toEqual([
      { name: YEOKSAM, patients: 1 },
      { name: SEOCHO, patients: 1 },
    ])
  })

  it("AC-0.3 주소가 null인 줄 → '주소 없음'", () => {
    const agg = aggregate([
      row({ patient: 1, region: null }),
      row({ patient: 1, region: null }),
      row({ patient: 2, region: SEOCHO }),
      row({ patient: 3, region: null, rxCode: 'MM042' }),
    ])
    for (const grain of GRAINS) {
      const bucket = agg[grain][0]
      expect(rxOf(bucket, 'D1001').regions).toEqual([
        { name: SEOCHO, patients: 1 },
        { name: NO_ADDRESS, patients: 1 },
      ])
      expect(rxOf(bucket, 'MM042').regions).toEqual([{ name: NO_ADDRESS, patients: 1 }])
    }
  })

  it('AC-0.4 일·주·월 각각 따로 센다(일을 더하지 않는다, 두 지역에 나온 환자는 두 곳에 다 센다)', () => {
    const agg = aggregate([
      row({ patient: 1, date: MON, region: YEOKSAM }),
      row({ patient: 1, date: TUE, region: SAMSEONG }),
      row({ patient: 2, date: WED, region: YEOKSAM }),
      row({ patient: 1, date: NEXT_MON, region: YEOKSAM }),
      row({ patient: 3, date: NEXT_MON, region: YEOKSAM }),
    ])
    const regionsAt = (grain: Grain, key: string) => rxOf(bucketOf(agg, grain, key), 'D1001').regions
    expect(regionsAt('day', MON)).toEqual([{ name: YEOKSAM, patients: 1 }])
    expect(regionsAt('day', TUE)).toEqual([{ name: SAMSEONG, patients: 1 }])
    expect(regionsAt('day', WED)).toEqual([{ name: YEOKSAM, patients: 1 }])
    expect(regionsAt('day', NEXT_MON)).toEqual([{ name: YEOKSAM, patients: 2 }])
    expect(regionsAt('week', MON)).toEqual([
      { name: SAMSEONG, patients: 1 },
      { name: YEOKSAM, patients: 2 },
    ])
    expect(rxOf(bucketOf(agg, 'week', MON), 'D1001').patients).toBe(2) // 지역 합 3 > 환자 2(칸 지역과 같다)
    expect(regionsAt('week', NEXT_MON)).toEqual([{ name: YEOKSAM, patients: 2 }])
    expect(regionsAt('month', '2026-10')).toEqual([
      { name: SAMSEONG, patients: 1 },
      { name: YEOKSAM, patients: 3 }, // 일 칸을 더한 4가 아니다
    ])
  })

  it('AC-0.5 이름 순(줄 순서와 상관없이)', () => {
    const rows = [
      row({ patient: 1, region: SEOCHO }),
      row({ patient: 2, region: null }),
      row({ patient: 3, region: '부산광역시 해운대구 우동' }),
      row({ patient: 4, region: JEONGJA }),
    ]
    const expected = [JEONGJA, '부산광역시 해운대구 우동', SEOCHO, NO_ADDRESS]
    for (const agg of [aggregate(rows), aggregate([...rows].reverse())]) {
      for (const grain of GRAINS) expect(rxOf(agg[grain][0], 'D1001').regions.map((r) => r.name)).toEqual(expected)
    }
  })
})

// ── 정렬·결과에 없는 것 ───────────────────────────────────

describe('AC-006.1 정렬·결과 모양', () => {
  it('rx는 처방코드 순', () => {
    const agg = aggregate(['MM042', 'AA154', 'D1001', 'B4001'].map((rxCode) => row({ rxCode })))
    expect(bucketOf(agg, 'day', MON).rx.map((r) => r.code)).toEqual(['AA154', 'B4001', 'D1001', 'MM042'])
  })

  it('결과에 환자 번호가 없다(몇 명인지만)', () => {
    const agg = aggregate([row({ patient: 424242 }), row({ patient: 535353, date: TUE })])
    const json = JSON.stringify(agg)
    expect(json).not.toContain('424242')
    expect(json).not.toContain('535353')
    for (const grain of GRAINS) {
      for (const bucket of agg[grain]) {
        const keys = ['groups', 'key', 'range', 'regions', 'revisit', 'rx', 'totals']
        expect(Object.keys(bucket).sort()).toEqual(grain === 'day' ? ['again', ...keys] : keys)
      }
    }
  })
})

// ── 가짜 파일 ─────────────────────────────────────────────

describe('AC-006.1·AC-006.2·AC-006.3·AC-006.4 가짜 파일', () => {
  let parsedCache: ParsedFile | undefined
  const parsed = () =>
    (parsedCache ??= parsedOf(parseBitFile(new Uint8Array(readFileSync(join(FAKE_DIR, 'fake-utf8-bom.csv'))), createPatientIds())))

  it('모든 칸: patients = 신환 + 재진 + 알 수 없음, 처방마다 followup 합 = patients', () => {
    const agg = aggregate(parsed().rows)
    for (const grain of GRAINS) {
      expect(agg[grain].length).toBeGreaterThan(0)
      for (const { totals, rx } of agg[grain]) {
        expect(totals.newPatients + totals.returning + totals.unknown).toBe(totals.patients)
        for (const r of rx) {
          expect(sum(r.followup)).toBe(r.patients)
          expect(r.newPatients).toBeLessThanOrEqual(r.patients)
          expect(r.patients).toBeLessThanOrEqual(totals.patients)
        }
      }
    }
  })

  it('칸 이름·정렬: 일은 2026-09-01~2026-10-24(일요일 없음), 주는 월요일, 월은 두 달', () => {
    const agg = aggregate(parsed().rows)
    const ascending = (xs: string[]) => xs.every((x, i) => i === 0 || xs[i - 1] < x)
    for (const grain of GRAINS) {
      expect(ascending(keysOf(agg, grain))).toBe(true)
      for (const bucket of agg[grain]) {
        expect(ascending(bucket.rx.map((r) => r.code))).toBe(true)
        expect(ascending(bucket.regions.map((r) => r.name))).toBe(true)
      }
    }
    expect(agg.day[0].key).toBe('2026-09-01')
    expect(agg.day.at(-1)?.key).toBe('2026-10-24')
    for (const { key } of agg.day) expect(weekdayOf(key)).not.toBe(7)
    expect(agg.week[0].key).toBe('2026-08-31')
    for (const { key } of agg.week) expect(weekStartOf(key)).toBe(key)
    expect(keysOf(agg, 'month')).toEqual(['2026-09', '2026-10'])
  })

  it('가짜 파일이 입원·알 수 없음·주소 없음·중복 줄을 다 거친다', () => {
    const { rows, inpatientRows, unknownVisitRows } = parsed()
    const agg = aggregate(rows)
    expect(inpatientRows).toBeGreaterThan(0)
    expect(unknownVisitRows).toBeGreaterThan(0)
    expect(agg.month.some((b) => b.totals.unknown > 0)).toBe(true)
    expect(agg.month.some((b) => b.regions.some((r) => r.name === NO_ADDRESS))).toBe(true)
    const cases = new Set(rows.map((r) => `${r.patient}|${r.date}|${r.rxCode}`))
    expect(cases.size).toBeLessThan(rows.length)
  })

  it('느리지만 뻔한 기준 계산과 모든 칸이 같다', SLOW, () => {
    const { rows } = parsed()
    expect(aggregate(rows)).toEqual(naiveAggregate(rows))
  })

  it('그룹을 넣어도 느리지만 뻔한 기준과 모든 칸이 같다(겹치는 그룹·없는 코드 그룹 포함)', SLOW, () => {
    const { rows } = parsed()
    const codes = [...new Set(rows.map((r) => r.rxCode))].sort()
    const groups: RxGroupDef[] = [
      { id: 'g-b', codes: [codes[1], codes[4]] },
      { id: 'g-a', codes: codes.slice(0, 3) },
      { id: 'g-none', codes: ['NOPE0'] },
      { id: 'g-dup', codes: [codes[0], codes[0]] }, // 한 그룹에 같은 코드가 두 번
    ]
    const agg = aggregate(rows, groups)
    expect(agg).toEqual(naiveAggregate(rows, groups))
    expect(agg.month.every((b) => b.groups.every((g) => g.id !== 'g-none'))).toBe(true)
  })

  it('재방문이 실제로 있고, 7일 ≤ 14일 ≤ 집단 ≤ 그 칸 신환', () => {
    const agg = aggregate(parsed().rows)
    expect(agg.day.some((b) => b.revisit.within7 > 0)).toBe(true)
    for (const grain of GRAINS) {
      for (const { totals, revisit, rx } of agg[grain]) {
        expect(revisit.within7).toBeLessThanOrEqual(revisit.within14)
        expect(revisit.within14).toBeLessThanOrEqual(revisit.cohort)
        expect(revisit.cohort).toBeLessThanOrEqual(totals.newPatients)
        for (const r of rx) expect(r.newPatients + r.returning).toBeLessThanOrEqual(r.patients)
      }
    }
  })

  it('줄 순서를 뒤집어도 같은 결과(코드마다 이름·유형이 하나뿐인 자료)', () => {
    const { rows } = parsed()
    expect(aggregate([...rows].reverse())).toEqual(aggregate(rows))
  })

  it('10만 줄을 1초 안에 센다', SLOW, () => {
    const bytes = toCsvBytes(buildFakeBitTable({ rows: 100_000 }), 'utf8-bom')
    const { rows } = parsedOf(parseBitFile(bytes, createPatientIds()))
    expect(rows.length).toBe(100_000)
    const start = performance.now()
    const agg = aggregate(rows)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(keysOf(agg, 'month')).toEqual(['2026-09', '2026-10'])
  })

  it('그룹 셋을 넣어도 10만 줄을 1초 안에 센다', SLOW, () => {
    const bytes = toCsvBytes(buildFakeBitTable({ rows: 100_000 }), 'utf8-bom')
    const { rows } = parsedOf(parseBitFile(bytes, createPatientIds()))
    const codes = [...new Set(rows.map((r) => r.rxCode))].sort()
    const groups: RxGroupDef[] = [
      { id: 'g-a', codes: codes.slice(0, 3) },
      { id: 'g-b', codes: codes.slice(2, 6) },
      { id: 'g-c', codes: [codes[0]] },
    ]
    const start = performance.now()
    const agg = aggregate(rows, groups)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(agg.month.every((b) => b.groups.length === 3)).toBe(true)
  })
})

// ── 처방별 재진 ───────────────────────────────────────────

describe('AC-006.2 처방별 재진 — 그 처방을 받은 환자 중 칸에서 재진인 환자', () => {
  it('신환 + 재진 + 알 수 없음 = 그 처방 환자 수', () => {
    const agg = aggregate([
      row({ patient: 1, firstVisit: true }),
      row({ patient: 2, firstVisit: false }),
      row({ patient: 3, firstVisit: null }),
      row({ patient: 4, firstVisit: false, rxCode: 'AA254' }),
    ])
    const day = bucketOf(agg, 'day', MON)
    expect(rxOf(day, 'D1001')).toMatchObject({ patients: 3, newPatients: 1, returning: 1 })
    expect(rxOf(day, 'AA254')).toMatchObject({ patients: 1, newPatients: 0, returning: 1 })
  })

  it('칸 기준: 월요일 신환이 수요일(재진 줄)에 받은 처방 → 주 칸에서는 신환, 수요일 칸에서는 재진', () => {
    const agg = aggregate([
      row({ patient: 1, date: MON, firstVisit: true, rxCode: 'AA154' }),
      row({ patient: 1, date: WED, firstVisit: false, rxCode: 'MM042' }),
    ])
    expect(rxOf(bucketOf(agg, 'week', MON), 'MM042')).toMatchObject({ patients: 1, newPatients: 1, returning: 0 })
    expect(rxOf(bucketOf(agg, 'day', WED), 'MM042')).toMatchObject({ patients: 1, newPatients: 0, returning: 1 })
  })
})

// ── 처방코드 그룹 ─────────────────────────────────────────

// 도수치료 10·20·30분처럼 묶은 코드
const MANUAL: RxGroupDef = { id: 'g-manual', codes: ['MM101', 'MM102', 'MM103'] }
const groupOf = (bucket: BucketStats, id: string) => bucket.groups.find((g) => g.id === id)

describe('AC-006.3 처방코드 그룹 — 그룹 코드 중 하나라도 받은 환자', () => {
  it('서로 다른 환자 수·신환·재진(코드 둘을 받은 환자도 한 명)', () => {
    const agg = aggregate(
      [
        row({ patient: 1, rxCode: 'MM101', firstVisit: true }),
        row({ patient: 1, rxCode: 'MM102', firstVisit: true }),
        row({ patient: 2, rxCode: 'MM103', firstVisit: false }),
        row({ patient: 3, rxCode: 'D1001', firstVisit: false }),
      ],
      [MANUAL],
    )
    expect(bucketOf(agg, 'day', MON).groups).toEqual([
      { id: 'g-manual', patients: 2, newPatients: 1, returning: 1, followup: [2, 0, 0, 0] },
    ])
  })

  it('F/U = 그룹 코드 중 하나라도 받은 서로 다른 날 수(같은 날 두 코드는 하루)', () => {
    const agg = aggregate(
      [
        row({ patient: 1, date: MON, rxCode: 'MM101' }),
        row({ patient: 1, date: TUE, rxCode: 'MM102' }),
        row({ patient: 1, date: TUE, rxCode: 'MM103' }),
        row({ patient: 1, date: WED, rxCode: 'D1001' }), // 그룹 밖 코드
      ],
      [MANUAL],
    )
    expect(groupOf(bucketOf(agg, 'week', MON), 'g-manual')).toEqual({
      id: 'g-manual',
      patients: 1,
      newPatients: 0,
      returning: 1,
      followup: [0, 1, 0, 0],
    })
    expect(groupOf(bucketOf(agg, 'day', TUE), 'g-manual')?.followup).toEqual([1, 0, 0, 0])
  })

  it('한 코드가 여러 그룹에 있으면 각 그룹에 센다', () => {
    const agg = aggregate(
      [row({ patient: 1, rxCode: 'MM101' }), row({ patient: 2, rxCode: 'MM102' })],
      [
        { id: 'g-10', codes: ['MM101'] },
        { id: 'g-all', codes: ['MM101', 'MM102'] },
      ],
    )
    const day = bucketOf(agg, 'day', MON)
    expect(groupOf(day, 'g-10')?.patients).toBe(1)
    expect(groupOf(day, 'g-all')?.patients).toBe(2)
  })

  it('그 칸에 환자가 없는 그룹은 빠지고, 나머지는 id 순', () => {
    const agg = aggregate(
      [row({ date: MON, rxCode: 'MM101' }), row({ date: TUE, rxCode: 'D1001' })],
      [
        { id: 'g-z', codes: ['D1001'] },
        { id: 'g-a', codes: ['MM101', 'D1001'] },
        { id: 'g-m', codes: ['AA999'] },
      ],
    )
    expect(bucketOf(agg, 'day', MON).groups.map((g) => g.id)).toEqual(['g-a'])
    expect(bucketOf(agg, 'day', TUE).groups.map((g) => g.id)).toEqual(['g-a', 'g-z'])
    expect(bucketOf(agg, 'week', MON).groups.map((g) => g.id)).toEqual(['g-a', 'g-z'])
  })

  it('한 그룹에 같은 코드가 두 번 있어도 하루는 하루(F/U 1회), 결과는 코드 하나일 때와 같다', () => {
    const rows = [row({ patient: 1, date: MON, rxCode: 'MM101' }), row({ patient: 1, date: WED, rxCode: 'MM102' })]
    const twice = aggregate(rows, [{ id: 'g-dup', codes: ['MM101', 'MM101'] }])
    expect(groupOf(bucketOf(twice, 'day', MON), 'g-dup')?.followup).toEqual([1, 0, 0, 0])
    expect(groupOf(bucketOf(twice, 'week', MON), 'g-dup')?.followup).toEqual([1, 0, 0, 0])
    expect(twice).toEqual(aggregate(rows, [{ id: 'g-dup', codes: ['MM101'] }]))
  })

  it('입원 줄은 그룹에도 세지 않는다', () => {
    const agg = aggregate([row({ patient: 1, rxCode: 'MM101' }), row({ patient: 2, rxCode: 'MM101', outpatient: false })], [MANUAL])
    expect(groupOf(bucketOf(agg, 'day', MON), 'g-manual')?.patients).toBe(1)
  })

  it('그룹 정의가 없으면 모든 칸의 그룹은 빈 목록', () => {
    const agg = aggregate([row({ rxCode: 'MM101' })])
    for (const grain of GRAINS) for (const bucket of agg[grain]) expect(bucket.groups).toEqual([])
  })
})

// ── 처방별 추세 묶음(treatment-trend) ─────────────────────

describe('AC-1205.1 묶음 건 — 같은 환자·같은 날·같은 묶음 = 1건', () => {
  it('AC-1205.1: 1번 환자가 같은 날 두 코드, 2번 환자가 한 코드 → 그날 2건. 1번 환자가 다른 날 또 받으면 그날도 1건', () => {
    const agg = aggregate(
      [
        row({ patient: 1, date: MON, rxCode: 'MM101', firstVisit: true }),
        row({ patient: 1, date: MON, rxCode: 'MM102', firstVisit: true }),
        row({ patient: 2, date: MON, rxCode: 'MM102' }),
        row({ patient: 1, date: TUE, rxCode: 'MM101' }),
        row({ patient: 1, date: TUE, rxCode: 'MM102' }),
      ],
      [{ id: 'g-pair', codes: ['MM101', 'MM102'] }],
    )
    expect(groupOf(bucketOf(agg, 'day', MON), 'g-pair')).toEqual({
      id: 'g-pair',
      patients: 2,
      newPatients: 1,
      returning: 1,
      followup: [2, 0, 0, 0],
    })
    expect(groupOf(bucketOf(agg, 'day', TUE), 'g-pair')).toMatchObject({ patients: 1, newPatients: 0, returning: 1 })
  })
})

describe('AC-1205.2 묶음 코드 맞추기는 대소문자를 가리지 않는다', () => {
  it('AC-1205.2: 묶음 코드 eswt1 · 줄 코드 ESWT1 → 같은 코드로 센다', () => {
    const agg = aggregate([row({ patient: 1, rxCode: 'ESWT1' }), row({ patient: 2, rxCode: 'ESWT1' })], [{ id: 'g-eswt', codes: ['eswt1'] }])
    expect(groupOf(bucketOf(agg, 'day', MON), 'g-eswt')?.patients).toBe(2)
  })

  it('AC-1205.2: 묶음 코드 ESWT1 · 줄 코드 eswt1 → 같은 코드로 센다', () => {
    const agg = aggregate([row({ patient: 1, rxCode: 'eswt1' }), row({ patient: 2, rxCode: 'Eswt1' })], [{ id: 'g-eswt', codes: ['ESWT1'] }])
    expect(groupOf(bucketOf(agg, 'day', MON), 'g-eswt')?.patients).toBe(2)
  })

  it('AC-1205.2: 같은 환자·같은 날 eswt1·ESWT1 두 줄 → 묶음은 1건(F/U 하루), 처방 줄 셈은 코드 글자 그대로 둘', () => {
    const agg = aggregate([row({ patient: 1, rxCode: 'eswt1' }), row({ patient: 1, rxCode: 'ESWT1' })], [{ id: 'g-eswt', codes: ['ESWT1'] }])
    const day = bucketOf(agg, 'day', MON)
    expect(groupOf(day, 'g-eswt')).toEqual({ id: 'g-eswt', patients: 1, newPatients: 0, returning: 1, followup: [1, 0, 0, 0] })
    expect(day.rx.map((r) => r.code)).toEqual(['ESWT1', 'eswt1'])
  })

  it('AC-1205.2: 한 묶음에 대소문자만 다른 코드가 둘이어도 결과는 하나일 때와 같다', () => {
    const rows = [row({ patient: 1, date: MON, rxCode: 'ESWT1' }), row({ patient: 1, date: WED, rxCode: 'eswt1' })]
    const both = aggregate(rows, [{ id: 'g-eswt', codes: ['ESWT1', 'eswt1'] }])
    expect(groupOf(bucketOf(both, 'week', MON), 'g-eswt')?.followup).toEqual([0, 1, 0, 0])
    expect(both).toEqual(aggregate(rows, [{ id: 'g-eswt', codes: ['ESWT1'] }]))
  })

  it('AC-1205.2: 가짜 파일 — 소문자로 쓴 묶음은 대문자 묶음과 모든 칸이 같다(대문자 묶음은 위 기준 계산 시험이 못 박는다)', () => {
    const { rows } = parsedOf(parseBitFile(new Uint8Array(readFileSync(join(FAKE_DIR, 'fake-utf8-bom.csv'))), createPatientIds()))
    const codes = [...new Set(rows.map((r) => r.rxCode))].sort()
    const upper: RxGroupDef[] = [
      { id: 'g-a', codes: codes.slice(0, 3) },
      { id: 'g-b', codes: [codes[1], codes[4]] },
    ]
    const lower = upper.map((g) => ({ id: g.id, codes: g.codes.map((code) => code.toLowerCase()) }))
    expect(lower[0].codes).not.toEqual(upper[0].codes) // 글자가 있는 코드라 실제로 소문자가 된다
    const agg = aggregate(rows, lower)
    expect(agg.month.every((b) => b.groups.length === 2)).toBe(true)
    expect(agg).toEqual(aggregate(rows, upper))
  })

  it('AC-1205.2: 묶음을 주지 않으면 대소문자만 다른 줄 코드는 처방 줄에서 따로다(지금과 같음)', () => {
    const agg = aggregate([row({ patient: 1, rxCode: 'eswt1' }), row({ patient: 2, rxCode: 'ESWT1' })])
    const day = bucketOf(agg, 'day', MON)
    expect(day.groups).toEqual([])
    expect(day.rx.map((r) => [r.code, r.patients])).toEqual([
      ['ESWT1', 1],
      ['eswt1', 1],
    ])
  })
})

// ── 신환 재방문 ───────────────────────────────────────────

// 2026-10-01(목) 신환 → 7일째 10-08, 14일째 10-15. 그 주 칸은 2026-09-28(월)
const D0 = '2026-10-01'
const newAt = (date: string, patient = 1) => row({ patient, date, firstVisit: true })
const visitAt = (date: string, patient = 1) => row({ patient, date, firstVisit: false, rxCode: 'MM042' })
const revisitOf = (agg: Aggregates, grain: Grain, key: string): RevisitCounts => bucketOf(agg, grain, key).revisit

describe('AC-006.4 신환 재방문 — 첫 신환일 다음 날부터 N일째까지(양 끝 포함) 외래 줄이 있는 환자', () => {
  it.each([
    [1, { within7: 1, within14: 1, within30: 1, after30: 0 }],
    [7, { within7: 1, within14: 1, within30: 1, after30: 0 }],
    [8, { within7: 0, within14: 1, within30: 1, after30: 0 }],
    [14, { within7: 0, within14: 1, within30: 1, after30: 0 }],
    [15, { within7: 0, within14: 0, within30: 1, after30: 0 }],
  ])('%i일째에 왔다 → %j', (days, expected) => {
    const agg = aggregate([newAt(D0), visitAt(addDays(D0, days))])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, ...expected })
  })

  it('어떤 처방이든, 초재진 값과 상관없이 외래 줄이면 재방문', () => {
    const agg = aggregate([newAt(D0), row({ patient: 1, date: addDays(D0, 3), rxCode: 'ZZ999', firstVisit: null, outpatient: null })])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 })
  })

  it('집단은 첫 신환일이 든 일·주·월 칸에 들어가고, 다시 온 날의 칸에는 없다', () => {
    const agg = aggregate([newAt(D0), visitAt(addDays(D0, 7))])
    expect(revisitOf(agg, 'week', '2026-09-28')).toEqual({ cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 })
    expect(revisitOf(agg, 'month', '2026-10')).toEqual({ cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 })
    expect(revisitOf(agg, 'day', addDays(D0, 7))).toEqual({ cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 })
    expect(revisitOf(agg, 'week', '2026-10-05')).toEqual({ cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 })
  })

  it('재진·알 수 없음 환자는 집단이 아니다', () => {
    const agg = aggregate([visitAt(D0, 1), row({ patient: 2, date: D0, firstVisit: null }), visitAt(addDays(D0, 1), 1)])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 })
  })

  it('여러 환자: 집단·재방문은 몇 명인지', () => {
    const agg = aggregate([newAt(D0, 1), newAt(D0, 2), newAt(D0, 3), visitAt(addDays(D0, 2), 1), visitAt(addDays(D0, 10), 2)])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 3, within7: 1, within14: 2, within30: 2, after30: 0 })
  })
})

describe('AC-006.5 재방문이 아닌 것 · 두 번 찍힌 신환', () => {
  it('첫 신환일과 같은 날의 다른 처방은 재방문이 아니다', () => {
    const agg = aggregate([newAt(D0), visitAt(D0)])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 0 })
  })

  it('입원 줄은 재방문이 아니다', () => {
    const agg = aggregate([newAt(D0), row({ patient: 1, date: addDays(D0, 3), outpatient: false })])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 0 })
  })

  it('입원 줄의 신환 표시로는 첫 신환일을 정하지 않는다', () => {
    const agg = aggregate([row({ patient: 1, date: D0, firstVisit: true, outpatient: false }), newAt(addDays(D0, 2))])
    expect(revisitOf(agg, 'day', addDays(D0, 2))).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 0 })
  })

  it('같은 환자가 다른 날 다시 신환으로 찍히면 그 날은 재방문, 그 날 칸 집단에는 넣지 않는다', () => {
    const again = addDays(D0, 3) // 10-04(일), 같은 주
    const agg = aggregate([newAt(D0), newAt(again)])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 })
    expect(revisitOf(agg, 'day', again)).toEqual({ cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 })
    expect(bucketOf(agg, 'day', again).totals.newPatients).toBe(1) // 칸 합계의 신환은 파일럿 규칙 그대로
    expect(revisitOf(agg, 'week', '2026-09-28')).toEqual({ cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 })
  })

  it('첫 신환일은 줄 순서와 상관없이 가장 이른 날', () => {
    const rows = [newAt(addDays(D0, 20)), visitAt(addDays(D0, 5)), newAt(D0)]
    const agg = aggregate(rows)
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 })
    expect(revisitOf(agg, 'day', addDays(D0, 20)).cohort).toBe(0)
    expect(aggregate([...rows].reverse())).toEqual(agg)
  })
})

// ── 신환 30일 재방문 ──────────────────────────────────────

// D0 = 2026-10-01(목) 신환 → 30일째 10-31(토), 31일째 11-01(일). 그 주 칸은 2026-09-28(월)
const NO_REVISIT: RevisitCounts = { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 }
let fakeCache: ParsedFile | undefined
const fakeRows = () =>
  (fakeCache ??= parsedOf(parseBitFile(new Uint8Array(readFileSync(join(FAKE_DIR, 'fake-utf8-bom.csv'))), createPatientIds()))).rows

describe('AC-501.1 30일 재방문 — 첫 신환일 다음 날부터 30일째까지(양 끝 포함) 외래 줄이 있는 환자', () => {
  it.each([
    [1, 1],
    [15, 1],
    [29, 1],
    [30, 1],
    [31, 0],
  ])('%i일째에 왔다 → within30 %i', (days, within30) => {
    const agg = aggregate([newAt(D0), visitAt(addDays(D0, days))])
    expect(revisitOf(agg, 'day', D0).within30).toBe(within30)
  })

  it('집단의 첫 신환일이 든 일·주·월 칸에 더하고, 다시 온 날의 칸에는 없다', () => {
    const back = addDays(D0, 20) // 10-21(수), 10-19 주
    const agg = aggregate([newAt(D0), visitAt(back)])
    const counted: RevisitCounts = { cohort: 1, within7: 0, within14: 0, within30: 1, after30: 0 }
    expect(revisitOf(agg, 'day', D0)).toEqual(counted)
    expect(revisitOf(agg, 'week', '2026-09-28')).toEqual(counted)
    expect(revisitOf(agg, 'month', '2026-10')).toEqual(counted)
    expect(revisitOf(agg, 'day', back)).toEqual(NO_REVISIT)
    expect(revisitOf(agg, 'week', '2026-10-19')).toEqual(NO_REVISIT)
  })

  it('어떤 처방이든, 초재진 값과 상관없이 외래 줄이면 30일 재방문', () => {
    const agg = aggregate([newAt(D0), row({ patient: 1, date: addDays(D0, 25), rxCode: 'ZZ999', firstVisit: null, outpatient: null })])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 1, after30: 0 })
  })

  it('첫 신환일과 같은 날의 다른 처방·입원 줄은 30일 재방문이 아니다', () => {
    const agg = aggregate([newAt(D0), visitAt(D0), row({ patient: 1, date: addDays(D0, 20), outpatient: false })])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 0 })
  })

  it('같은 환자가 다른 날 다시 신환으로 찍히면 그 날은 30일 재방문, 그 날 칸 집단에는 넣지 않는다', () => {
    const again = addDays(D0, 25) // 10-26
    const agg = aggregate([newAt(D0), newAt(again)])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 1, after30: 0 })
    expect(revisitOf(agg, 'day', again)).toEqual(NO_REVISIT)
    expect(revisitOf(agg, 'month', '2026-10')).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 1, after30: 0 })
  })

  it('재진·알 수 없음 환자는 30일 집단이 아니다', () => {
    const agg = aggregate([visitAt(D0, 1), row({ patient: 2, date: D0, firstVisit: null }), visitAt(addDays(D0, 20), 1)])
    expect(revisitOf(agg, 'day', D0)).toEqual(NO_REVISIT)
  })

  it('여러 환자: 7일 ≤ 14일 ≤ 30일 ≤ 집단', () => {
    const agg = aggregate([
      ...[1, 2, 3, 4].map((p) => newAt(D0, p)),
      visitAt(addDays(D0, 3), 1),
      visitAt(addDays(D0, 10), 2),
      visitAt(addDays(D0, 30), 3), // 4번은 다시 오지 않음
    ])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 4, within7: 1, within14: 2, within30: 3, after30: 0 })
  })

  it('가짜 파일: 30일 재방문이 실제로 있고, 모든 칸에서 7일 ≤ 14일 ≤ 30일 ≤ 집단, 30일 + 30일 넘어 ≤ 집단', SLOW, () => {
    const agg = aggregate(fakeRows())
    expect(agg.day.some((b) => b.revisit.within30 > b.revisit.within14)).toBe(true)
    for (const grain of GRAINS) {
      for (const { revisit } of agg[grain]) {
        expect(revisit.within7).toBeLessThanOrEqual(revisit.within14)
        expect(revisit.within14).toBeLessThanOrEqual(revisit.within30)
        expect(revisit.within30).toBeLessThanOrEqual(revisit.cohort)
        expect(revisit.within30 + revisit.after30).toBeLessThanOrEqual(revisit.cohort)
      }
    }
  })
})

describe('AC-501.2 30일째는 30일 재방문, 31일째는 아니다', () => {
  it('30일째에 다시 온 신환과 31일째에만 다시 온 신환', () => {
    const agg = aggregate([newAt(D0, 1), visitAt(addDays(D0, 30), 1), newAt(D0, 2), visitAt(addDays(D0, 31), 2)])
    for (const [grain, key] of [['day', D0], ['week', '2026-09-28'], ['month', '2026-10']] as const) {
      expect(revisitOf(agg, grain, key)).toEqual({ cohort: 2, within7: 0, within14: 0, within30: 1, after30: 1 })
    }
  })

  it('31일째에만 다시 온 신환 혼자면 30일 재방문은 0', () => {
    const agg = aggregate([newAt(D0), visitAt(addDays(D0, 31))])
    expect(revisitOf(agg, 'day', D0).within30).toBe(0)
  })
})

describe('AC-501.5 30일 넘어 다시 옴(after30) — 30일 안에는 오지 않고 31일째 이후에 처음 다시 온 신환', () => {
  it.each([31, 45, 200])('%i일째에 처음 다시 왔다 → after30', (days) => {
    const agg = aggregate([newAt(D0), visitAt(addDays(D0, days))])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 1 })
  })

  it('30일 안에 다시 온 환자는 31일째 이후에 또 와도 after30에 없다(한 환자는 둘 중 하나에만)', () => {
    const agg = aggregate([newAt(D0), visitAt(addDays(D0, 5)), visitAt(addDays(D0, 40))])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 })
  })

  it('다시 오지 않은 신환·같은 날만 다른 처방·31일째 이후 입원 줄만 있는 신환은 after30이 아니다', () => {
    const agg = aggregate([
      newAt(D0, 1),
      newAt(D0, 2),
      visitAt(D0, 2),
      newAt(D0, 3),
      row({ patient: 3, date: addDays(D0, 40), outpatient: false }),
    ])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 3, within7: 0, within14: 0, within30: 0, after30: 0 })
  })

  it('31일째 이후 다시 신환으로 찍힌 날도 첫 재방문이고, 그 날 칸 집단에는 넣지 않는다', () => {
    const again = addDays(D0, 35) // 11-05(목)
    const agg = aggregate([newAt(D0), newAt(again)])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 1 })
    expect(revisitOf(agg, 'day', again)).toEqual(NO_REVISIT)
    expect(revisitOf(agg, 'month', '2026-11')).toEqual(NO_REVISIT)
  })

  it('일·주·월 칸 모두 첫 신환일 칸에 더한다', () => {
    const agg = aggregate([newAt(D0), visitAt(addDays(D0, 50))])
    const counted: RevisitCounts = { cohort: 1, within7: 0, within14: 0, within30: 0, after30: 1 }
    expect(revisitOf(agg, 'week', '2026-09-28')).toEqual(counted)
    expect(revisitOf(agg, 'month', '2026-10')).toEqual(counted)
  })

  it('여러 환자: within30 + after30 ≤ 집단, 집단 중 나머지는 아직 다시 오지 않음', () => {
    const agg = aggregate([
      ...[1, 2, 3, 4].map((p) => newAt(D0, p)),
      visitAt(addDays(D0, 12), 1),
      visitAt(addDays(D0, 33), 2),
      visitAt(addDays(D0, 60), 3), // 4번은 다시 오지 않음
    ])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 4, within7: 0, within14: 1, within30: 1, after30: 2 })
  })
})

describe('AC-501.4 30일 칸은 더하기만 — 집단·7·14일 숫자는 지금 규칙 그대로', () => {
  it('재방문 칸은 지금 칸(cohort·within7·within14)에 within30·after30만 더한 것이고, 7·14일 숫자는 31일째 이후 줄과 상관없다', SLOW, () => {
    const rows = fakeRows()
    const agg = aggregate(rows)
    const firstNewOf = new Map<number, string>()
    for (const r of rows) {
      const seen = firstNewOf.get(r.patient)
      if (r.outpatient !== false && r.firstVisit === true && (seen === undefined || r.date < seen)) firstNewOf.set(r.patient, r.date)
    }
    // 첫 신환일 15일째 이후 줄을 지워도 집단·7·14일은 같다
    const upTo14 = aggregate(
      rows.filter((r) => {
        const first = firstNewOf.get(r.patient)
        return first === undefined || diffDays(first, r.date) <= 14
      }),
    )
    const old = (revisit: RevisitCounts) => ({ cohort: revisit.cohort, within7: revisit.within7, within14: revisit.within14 })
    for (const grain of GRAINS) {
      for (const bucket of agg[grain]) {
        expect(Object.keys(bucket.revisit).sort()).toEqual(['after30', 'cohort', 'within14', 'within30', 'within7'])
        const cut = upTo14[grain].find((b) => b.key === bucket.key)
        if (cut !== undefined) expect(old(cut.revisit)).toEqual(old(bucket.revisit))
        else expect(bucket.revisit.cohort).toBe(0)
      }
    }
  })
})

// ── 환자 수는 접수 기준 ───────────────────────────────────

const receipt = (over: Partial<PatientDay> = {}): PatientDay => ({ patient: 1, date: MON, receptions: 1, firstVisit: false, ...over })

// 같은 달 안에 서로 다른 다섯 날: 10-05 · 10-12 · 10-19 · 10-20 · 10-21
const FIVE_DAYS = ['2026-10-05', '2026-10-12', MON, TUE, WED]

// 줄에서 접수 줄을 만든다(환자·날마다 한 줄, 처방이 있는 날은 접수도 있다)
function receiptsOf(rows: readonly ConsumptionRow[]): PatientDay[] {
  const byId = new Map<string, PatientDay>()
  for (const r of rows) {
    if (r.outpatient === false) continue
    const id = `${r.patient}|${r.date}`
    const seen = byId.get(id)
    if (seen === undefined) byId.set(id, { patient: r.patient, date: r.date, receptions: 1, firstVisit: r.firstVisit === true })
    else if (r.firstVisit === true) seen.firstVisit = true
  }
  return [...byId.values()]
}

// 칸에 든 일 칸 totals의 합
function daysSum(agg: Aggregates, bucket: BucketStats): Totals {
  const days = agg.day.filter((d) => d.key >= bucket.range.from && d.key <= bucket.range.to).map((d) => d.totals)
  return {
    patients: sum(days.map((t) => t.patients)),
    newPatients: sum(days.map((t) => t.newPatients)),
    returning: sum(days.map((t) => t.returning)),
    unknown: sum(days.map((t) => t.unknown)),
  }
}

describe('AC-501.6 도우미 길 — 일 칸 totals는 접수 줄대로', () => {
  it('AC-501.6 하루에 접수 둘(receptions 2)이고 그날이 첫 내원 → 환자 2, 신환 1, 재진 1', () => {
    const agg = aggregate([row({ firstVisit: true })], [], [receipt({ receptions: 2, firstVisit: true })])
    for (const grain of GRAINS) expect(agg[grain][0].totals).toEqual({ patients: 2, newPatients: 1, returning: 1, unknown: 0 })
  })

  it('AC-501.6 일 칸: patients = receptions 합, newPatients = firstVisit이 참인 줄 수, returning = 나머지, unknown = 0', () => {
    const agg = aggregate(
      [row({ patient: 1, firstVisit: null }), row({ patient: 2, firstVisit: null }), row({ patient: 3, firstVisit: null })],
      [],
      [
        receipt({ patient: 1, receptions: 2, firstVisit: true }),
        receipt({ patient: 2, receptions: 1, firstVisit: true }),
        receipt({ patient: 3, receptions: 3, firstVisit: false }),
      ],
    )
    expect(bucketOf(agg, 'day', MON).totals).toEqual({ patients: 6, newPatients: 2, returning: 4, unknown: 0 })
  })

  it('AC-501.6 처방 없는 접수만 있는 날 → 일 칸 rx: [], totals는 접수대로이고 주·달 칸도 있으며 그 합에 든다', () => {
    const NOV = '2026-11-03' // 줄이 없는 주·달
    const agg = aggregate(
      [row({ patient: 1, date: MON })],
      [{ id: 'g-a', codes: ['D1001'] }],
      [
        receipt({ patient: 1, date: MON }),
        receipt({ patient: 2, date: TUE, receptions: 2 }),
        receipt({ patient: 3, date: NOV, firstVisit: true }),
      ],
    )
    expect(keysOf(agg, 'day')).toEqual([MON, TUE, NOV])
    expect(bucketOf(agg, 'day', TUE)).toEqual({
      key: TUE,
      range: { from: TUE, to: TUE },
      totals: { patients: 2, newPatients: 0, returning: 2, unknown: 0 },
      rx: [],
      regions: [],
      groups: [],
      revisit: NO_REVISIT,
      again: [],
    })
    expect(bucketOf(agg, 'week', MON).totals).toEqual({ patients: 3, newPatients: 0, returning: 3, unknown: 0 })
    expect(bucketOf(agg, 'month', '2026-10').totals).toEqual({ patients: 3, newPatients: 0, returning: 3, unknown: 0 })
    const novWeek = bucketOf(agg, 'week', '2026-11-02')
    expect(novWeek.range).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(novWeek).toMatchObject({ totals: { patients: 1, newPatients: 1, returning: 0, unknown: 0 }, rx: [], regions: [], groups: [] })
    const novMonth = bucketOf(agg, 'month', '2026-11')
    expect(novMonth.range).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(novMonth).toMatchObject({ totals: { patients: 1, newPatients: 1, returning: 0, unknown: 0 }, rx: [], regions: [], groups: [] })
  })

  it('AC-501.6 처방 없이 다시 온 신환 → 재방문에 든다(접수 줄이 없으면 안 든다)', () => {
    const rows = [newAt(D0)]
    const first = receipt({ date: D0, firstVisit: true })
    expect(revisitOf(aggregate(rows), 'day', D0)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 0 })
    const back = (days: number) => revisitOf(aggregate(rows, [], [first, receipt({ date: addDays(D0, days) })]), 'day', D0)
    expect(back(7)).toEqual({ cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 })
    expect(back(30)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 1, after30: 0 })
    expect(back(31)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 1 })
  })

  it('AC-501.6 첫 내원일과 같은 날의 접수는 재방문이 아니다', () => {
    const agg = aggregate([newAt(D0)], [], [receipt({ date: D0, receptions: 2, firstVisit: true })])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 0 })
  })

  it('AC-501.6 처방 없이 첫 내원한 환자 → 그 칸 집단에 든다(일·주·월 모두)', () => {
    const agg = aggregate([], [], [receipt({ date: D0, firstVisit: true }), receipt({ date: addDays(D0, 3) })])
    for (const [grain, key] of [['day', D0], ['week', '2026-09-28'], ['month', '2026-10']] as const) {
      expect(revisitOf(agg, grain, key)).toEqual({ cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 })
      expect(bucketOf(agg, grain, key).rx).toEqual([])
    }
    expect(bucketOf(agg, 'day', D0).totals).toEqual({ patients: 1, newPatients: 1, returning: 0, unknown: 0 })
    expect(revisitOf(agg, 'day', addDays(D0, 3)).cohort).toBe(0)
  })

  it('AC-501.6 첫 신환일은 접수 줄과 줄을 함께 보아 가장 이른 날(접수 줄 순서와 상관없이)', () => {
    const later = addDays(D0, 5)
    const agg = aggregate([newAt(later)], [], [receipt({ date: later, firstVisit: true }), receipt({ date: D0, firstVisit: true })])
    expect(revisitOf(agg, 'day', D0)).toEqual({ cohort: 1, within7: 1, within14: 1, within30: 1, after30: 0 })
    expect(revisitOf(agg, 'day', later).cohort).toBe(0)
  })

  it('AC-501.6 접수 줄이 빈 목록이고 줄도 없으면 칸이 없다', () => {
    expect(aggregate([], [], [])).toEqual({ day: [], week: [], month: [] })
  })

  it('AC-501.6 접수 줄 순서를 뒤집어도 같은 결과', () => {
    const rows = fakeRows()
    const receipts = receiptsOf(rows)
    expect(aggregate(rows, [], [...receipts].reverse())).toEqual(aggregate(rows, [], receipts))
  })
})

describe('AC-501.6 두 길 모두 — 주·달 totals는 일 칸 네 칸의 합, rx[]는 서로 다른 환자 수', () => {
  it('AC-501.6 도우미 길: 한 달에 같은 사람이 다섯 번(접수 줄) → 달 totals.patients 5, 달 rx[].patients 1', () => {
    const agg = aggregate(
      FIVE_DAYS.map((date) => row({ date })),
      [],
      FIVE_DAYS.map((date) => receipt({ date })),
    )
    const month = bucketOf(agg, 'month', '2026-10')
    expect(month.totals).toEqual({ patients: 5, newPatients: 0, returning: 5, unknown: 0 })
    expect(rxOf(month, 'D1001').patients).toBe(1)
    expect(bucketOf(agg, 'week', MON).totals.patients).toBe(3)
    expect(rxOf(bucketOf(agg, 'week', MON), 'D1001').patients).toBe(1)
  })

  it('AC-501.6 도우미 길: 처방은 하루뿐이고 접수가 하루 둘 + 사흘이어도 달 totals.patients 5, 달 rx[].patients 1', () => {
    const agg = aggregate(
      [row({ date: MON })],
      [],
      [receipt({ date: MON, receptions: 2 }), receipt({ date: TUE }), receipt({ date: WED }), receipt({ date: SUN })],
    )
    const month = bucketOf(agg, 'month', '2026-10')
    expect(month.totals.patients).toBe(5)
    expect(rxOf(month, 'D1001').patients).toBe(1)
  })

  it('AC-501.6 파일 길: 한 달에 같은 사람이 서로 다른 다섯 날 → 달 totals.patients 5, 달 rx[].patients 1', () => {
    const agg = aggregate(FIVE_DAYS.map((date) => row({ date })))
    const month = bucketOf(agg, 'month', '2026-10')
    expect(month.totals).toEqual({ patients: 5, newPatients: 0, returning: 5, unknown: 0 })
    expect(rxOf(month, 'D1001').patients).toBe(1)
  })

  it('AC-501.6 파일 길: 달을 넘는 주는 주 칸이 두 달의 일을 더하고, 달 칸은 제 달의 일만 더한다', () => {
    const agg = aggregate([row({ date: '2026-09-30', firstVisit: true }), row({ date: '2026-10-01', firstVisit: null })])
    expect(bucketOf(agg, 'week', '2026-09-28').totals).toEqual({ patients: 2, newPatients: 1, returning: 0, unknown: 1 })
    expect(bucketOf(agg, 'month', '2026-09').totals).toEqual({ patients: 1, newPatients: 1, returning: 0, unknown: 0 })
    expect(bucketOf(agg, 'month', '2026-10').totals).toEqual({ patients: 1, newPatients: 0, returning: 0, unknown: 1 })
  })

  it('AC-501.6 가짜 파일: 두 길 모두 모든 주·달 칸의 totals가 일 칸의 합이고, 합이 환자 수이며, 집단 ≤ 칸 신환이다', SLOW, () => {
    const rows = fakeRows()
    const extra = receipt({ patient: 1_000_000, date: '2026-09-02', receptions: 2, firstVisit: true }) // 처방 없는 접수
    for (const agg of [aggregate(rows), aggregate(rows, [], [...receiptsOf(rows), extra])]) {
      for (const grain of ['week', 'month'] as const) {
        expect(agg[grain].length).toBeGreaterThan(0)
        for (const bucket of agg[grain]) expect(bucket.totals).toEqual(daysSum(agg, bucket))
      }
      for (const grain of GRAINS) {
        for (const { totals, revisit } of agg[grain]) {
          expect(totals.newPatients + totals.returning + totals.unknown).toBe(totals.patients)
          expect(revisit.cohort).toBeLessThanOrEqual(totals.newPatients)
        }
      }
    }
  })
})

describe('AC-501.6 rx[]·groups[]·동네는 두 길이 같다 — 접수 줄은 칸의 visit에 쓰지 않는다', () => {
  const groupsFrom = (codes: string[]): RxGroupDef[] => [
    { id: 'g-a', codes: codes.slice(0, 3) },
    { id: 'g-b', codes: codes.slice(2, 6) },
  ]
  const partsOf = (buckets: BucketStats[]) => buckets.map(({ key, range, rx, groups, regions }) => ({ key, range, rx, groups, regions }))

  it('AC-501.6 같은 줄에 셋째 인자를 주어도 rx[]·groups[]·동네가 인자 없을 때와 같다', SLOW, () => {
    const rows = fakeRows()
    const groups = groupsFrom([...new Set(rows.map((r) => r.rxCode))].sort())
    const without = aggregate(rows, groups)
    // 접수 건수를 늘리고 초재진 표시를 뒤집어도 칸의 처방 숫자는 그대로여야 한다
    const receipts = receiptsOf(rows).map((r) => ({ ...r, receptions: 2, firstVisit: !r.firstVisit }))
    const withReceipts = aggregate(rows, groups, receipts)
    for (const grain of GRAINS) expect(partsOf(withReceipts[grain])).toEqual(partsOf(without[grain]))
  })

  it('AC-501.6 처방 없는 접수를 더해도 그 처방 칸의 신환·재진은 줄 표시 그대로다', () => {
    const rows = [row({ patient: 1, date: MON, firstVisit: false })]
    const agg = aggregate(
      rows,
      [{ id: 'g-a', codes: ['D1001'] }],
      [receipt({ patient: 1, date: MON, firstVisit: true }), receipt({ patient: 1, date: TUE, firstVisit: true })],
    )
    for (const bucket of [bucketOf(agg, 'day', MON), bucketOf(agg, 'week', MON), bucketOf(agg, 'month', '2026-10')]) {
      expect(rxOf(bucket, 'D1001')).toMatchObject({ patients: 1, newPatients: 0, returning: 1 })
      expect(bucket.groups).toEqual([{ id: 'g-a', patients: 1, newPatients: 0, returning: 1, followup: [1, 0, 0, 0] }])
    }
  })
})

describe('AC-501.6 파일 길 — 셋째 인자가 없으면 일 칸은 지금 그대로', () => {
  it('AC-501.6 셋째 인자가 없으면 일 칸이 지금 기대값 그대로다(줄 표시로 센 그날 환자)', () => {
    const agg = aggregate([
      row({ patient: 1, firstVisit: true }),
      row({ patient: 1, firstVisit: false, rxCode: 'MM042' }),
      row({ patient: 2, firstVisit: false }),
      row({ patient: 3, firstVisit: null }),
      row({ patient: 4, firstVisit: true, outpatient: false }),
    ])
    expect(bucketOf(agg, 'day', MON).totals).toEqual({ patients: 3, newPatients: 1, returning: 1, unknown: 1 })
  })

  it('AC-501.6 셋째 인자가 undefined면 인자 없을 때와 같다', SLOW, () => {
    const rows = fakeRows()
    expect(aggregate(rows, [], undefined)).toEqual(aggregate(rows))
  })

  it('AC-501.6 가짜 파일: 셋째 인자가 없으면 일 칸 totals는 그날 줄로 따로 센 것과 같다', SLOW, () => {
    const rows = fakeRows()
    const outpatient = rows.filter((r) => r.outpatient !== false)
    for (const { key, totals } of aggregate(rows).day) expect(totals).toEqual(dayTotalsOf(outpatient.filter((r) => r.date === key)))
  })
})

// ── 같은 처방 재방문 ──────────────────────────────────────

// F0 = 2026-08-03(월). 처방 코드·이름은 지어낸 값이다
const F0 = '2026-08-03'
const ESWT = 'XS707'
const rxAt = (offset: number, over: Partial<ConsumptionRow> = {}) =>
  row({ date: addDays(F0, offset), rxCode: ESWT, rxName: '가짜 충격파 7', rxType: '처치', ...over })
const againAt = (agg: Aggregates, offset: number): RxAgain[] | undefined => bucketOf(agg, 'day', addDays(F0, offset)).again
const startOnly = (code: string, starts = 1): RxAgain => ({ code, starts, back: [0, 0, 0], more: [0, 0, 0] })

// 일 칸에서 again을 뺀 결과(이 기능 전 모양)
function withoutAgain(agg: Aggregates): Aggregates {
  const strip = (buckets: BucketStats[]) =>
    buckets.map((bucket) => {
      const rest = { ...bucket }
      delete rest.again
      return rest
    })
  return { day: strip(agg.day), week: strip(agg.week), month: strip(agg.month) }
}

describe('AC-1301.1 시작 — 앞 30일 동안 같은 처방을 받지 않은 날', () => {
  it('AC-1301.1 d0·d0+3·d0+6·d0+8·d0+70 → d0와 d0+70만 시작, 사이 날 칸에는 시작이 없다', () => {
    const agg = aggregate([0, 3, 6, 8, 70].map((offset) => rxAt(offset)))
    expect(againAt(agg, 0)).toEqual([{ code: ESWT, starts: 1, back: [1, 1, 1], more: [2, 3, 3] }])
    expect(againAt(agg, 70)).toEqual([startOnly(ESWT)])
    for (const offset of [3, 6, 8]) expect(againAt(agg, offset)).toEqual([])
  })

  it('AC-1301.1 30일째에 다시 받으면 시작이 아니고, 31일째에 처음 다시 받으면 그날도 시작이다', () => {
    const at30 = aggregate([rxAt(0), rxAt(30)])
    expect(againAt(at30, 0)).toEqual([{ code: ESWT, starts: 1, back: [0, 0, 1], more: [0, 0, 1] }])
    expect(againAt(at30, 30)).toEqual([])
    const at31 = aggregate([rxAt(0), rxAt(31)])
    expect(againAt(at31, 0)).toEqual([startOnly(ESWT)])
    expect(againAt(at31, 31)).toEqual([startOnly(ESWT)])
  })

  it('AC-1301.1 바로 앞 받은 날로 본다: 30일 안쪽으로 이어 받으면 첫 날 뒤로는 시작이 없다(0·25·50·75일째)', () => {
    const agg = aggregate([0, 25, 50, 75].map((offset) => rxAt(offset)))
    expect(againAt(agg, 0)).toEqual([{ code: ESWT, starts: 1, back: [0, 0, 1], more: [0, 0, 1] }])
    for (const offset of [25, 50, 75]) expect(againAt(agg, offset)).toEqual([])
  })
})

describe('AC-1301.2 창 — 다음 날부터 N일째까지(양 끝 포함), 시작한 날은 들지 않는다', () => {
  it.each([
    [1, [1, 1, 1]],
    [7, [1, 1, 1]],
    [8, [0, 1, 1]],
    [14, [0, 1, 1]],
    [15, [0, 0, 1]],
    [30, [0, 0, 1]],
  ])('AC-1301.2 %i일째에 또 받음 → back·more %j', (days, inWindow) => {
    const agg = aggregate([rxAt(0), rxAt(days)])
    expect(againAt(agg, 0)).toEqual([{ code: ESWT, starts: 1, back: inWindow, more: inWindow }])
  })

  it('AC-1301.2 날마다 받으면 more = 창 날 수 [7, 14, 30], back은 [1, 1, 1]', () => {
    const agg = aggregate(eachDay({ from: F0, to: addDays(F0, 30) }).map((date) => row({ date, rxCode: ESWT })))
    expect(againAt(agg, 0)).toEqual([{ code: ESWT, starts: 1, back: [1, 1, 1], more: [7, 14, 30] }])
  })
})

describe('AC-1301.3 같은 날 두 번은 하루', () => {
  it('AC-1301.3 같은 환자·같은 날·같은 처방 줄이 둘 → 시작 1, 창 안이면 more에 1', () => {
    const agg = aggregate([rxAt(0), rxAt(0), rxAt(2), rxAt(2)])
    expect(againAt(agg, 0)).toEqual([{ code: ESWT, starts: 1, back: [1, 1, 1], more: [1, 1, 1] }])
    expect(againAt(agg, 2)).toEqual([])
  })

  it('AC-1301.3 다른 환자 둘이 같은 날 시작하면 starts 2', () => {
    const agg = aggregate([rxAt(0, { patient: 1 }), rxAt(0, { patient: 2 }), rxAt(5, { patient: 2 })])
    expect(againAt(agg, 0)).toEqual([{ code: ESWT, starts: 2, back: [1, 1, 1], more: [1, 1, 1] }])
    expect(againAt(agg, 5)).toEqual([])
  })
})

describe('AC-1301.4 같은 처방 = 처방 코드가 글자 그대로 같음', () => {
  it('AC-1301.4 다음 날 다른 코드를 받으면 A는 다시 받은 것이 아니고 B는 그날이 시작이다', () => {
    const agg = aggregate([rxAt(0, { rxCode: 'XM020' }), rxAt(1, { rxCode: 'XM030' })])
    expect(againAt(agg, 0)).toEqual([startOnly('XM020')])
    expect(againAt(agg, 1)).toEqual([startOnly('XM030')])
  })

  it('AC-1301.4 대소문자만 다른 코드도 다른 처방이다(합치는 일은 화면이 한다)', () => {
    const agg = aggregate([rxAt(0, { rxCode: 'XS707' }), rxAt(2, { rxCode: 'xs707' })])
    expect(againAt(agg, 0)).toEqual([startOnly('XS707')])
    expect(againAt(agg, 2)).toEqual([startOnly('xs707')])
  })
})

describe('AC-1301.5 외래만 — 입원 줄은 빼고 outpatient null은 외래로 본다', () => {
  it('AC-1301.5 입원 줄은 시작·창 어디에도 들지 않고 null 줄은 외래로 든다', () => {
    const agg = aggregate([
      rxAt(0, { patient: 1 }),
      rxAt(2, { patient: 1, outpatient: false }), // 창 안 입원 줄 → 다시 받은 것이 아니다
      rxAt(0, { patient: 2, outpatient: null }),
      rxAt(3, { patient: 2, outpatient: null }), // null 줄 → 다시 받음
      rxAt(-5, { patient: 3, outpatient: false }), // 앞 입원 줄 → d0는 그래도 시작
      rxAt(0, { patient: 3 }),
    ])
    expect(keysOf(agg, 'day')).toEqual([F0, addDays(F0, 3)]) // 입원 줄만 있는 날은 칸이 없다
    expect(againAt(agg, 0)).toEqual([{ code: ESWT, starts: 3, back: [1, 1, 1], more: [1, 1, 1] }])
    expect(againAt(agg, 3)).toEqual([])
  })
})

describe('AC-1301.6 결과 모양 — 일 칸에만 again', () => {
  it('AC-1301.6 일 칸마다 again(그날 시작이 있는 처방만, 코드 글자 순), 시작이 없는 날은 빈 목록, 주·달 칸에는 열쇠가 없다', () => {
    const agg = aggregate([
      rxAt(0, { rxCode: 'ZZ900' }),
      rxAt(0, { rxCode: 'Ab100' }),
      rxAt(0, { rxCode: 'AB100' }),
      rxAt(2, { rxCode: 'ZZ900' }),
      rxAt(9, { rxCode: 'AB100', patient: 2 }), // 다른 환자 → 그 환자의 시작
    ])
    expect(againAt(agg, 0)).toEqual([startOnly('AB100'), startOnly('Ab100'), { code: 'ZZ900', starts: 1, back: [1, 1, 1], more: [1, 1, 1] }])
    expect(againAt(agg, 2)).toEqual([])
    expect(againAt(agg, 9)).toEqual([startOnly('AB100')])
    for (const bucket of agg.day) expect(Array.isArray(bucket.again)).toBe(true)
    for (const bucket of [...agg.week, ...agg.month]) expect('again' in bucket).toBe(false)
  })

  it('AC-1301.6 결과에 환자 번호·날짜 목록이 없다(again 줄은 code·starts·back·more뿐)', () => {
    const agg = aggregate([rxAt(0, { patient: 424242 }), rxAt(4, { patient: 424242 }), rxAt(1, { patient: 535353 }), rxAt(40, { patient: 535353 })])
    const json = JSON.stringify(agg)
    expect(json).not.toContain('424242')
    expect(json).not.toContain('535353')
    const lines = agg.day.flatMap((bucket) => bucket.again ?? [])
    expect(lines.length).toBe(3)
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual(['back', 'code', 'more', 'starts'])
      expect(JSON.stringify(line)).not.toMatch(/\d{4}-\d{2}-\d{2}/)
      for (const n of [line.starts, ...line.back, ...line.more]) expect(Number.isInteger(n)).toBe(true)
      expect(line.back).toHaveLength(3)
      expect(line.more).toHaveLength(3)
    }
  })

  it('AC-1301.6 가짜 파일: again은 느리지만 뻔한 기준과 같고, again을 빼면 이 기능 전 칸과 같다', SLOW, () => {
    const rows = fakeRows()
    const agg = aggregate(rows)
    const naive = naiveAggregate(rows)
    expect(agg.day.map((bucket) => bucket.again)).toEqual(naive.day.map((bucket) => bucket.again))
    expect(withoutAgain(agg)).toEqual(withoutAgain(naive))
    // 빈 비교로 통과하지 않게: 시작도 다시 받음도 실제로 있고 숫자 관계가 맞다
    const lines = agg.day.flatMap((bucket) => bucket.again ?? [])
    expect(lines.some((line) => line.back[0] > 0)).toBe(true)
    expect(lines.some((line) => line.more[2] > line.back[2])).toBe(true)
    for (const { starts, back, more } of lines) {
      expect(starts).toBeGreaterThan(0)
      for (let k = 0; k < 3; k++) {
        expect(back[k]).toBeLessThanOrEqual(starts)
        expect(back[k]).toBeLessThanOrEqual(more[k])
        if (k > 0) expect(back[k - 1] <= back[k] && more[k - 1] <= more[k]).toBe(true)
      }
    }
  })
})

describe('AC-1301.7 도우미 길 — 같은 처방 재방문은 진료 줄만 본다', () => {
  it('AC-1301.7 접수 줄은 들지 않는다(접수만 있는 날도 again은 빈 목록)', () => {
    const agg = aggregate([rxAt(0)], [], [receipt({ date: F0, firstVisit: true }), receipt({ date: addDays(F0, 3) })])
    expect(againAt(agg, 0)).toEqual([startOnly(ESWT)])
    expect(againAt(agg, 3)).toEqual([])
  })

  it('AC-1301.7 가짜 파일: 접수 줄을 넣어도 again은 파일 길과 같다', SLOW, () => {
    const rows = fakeRows()
    const againByDay = (agg: Aggregates) => Object.fromEntries(agg.day.map((bucket) => [bucket.key, bucket.again]))
    expect(againByDay(aggregate(rows, [], receiptsOf(rows)))).toEqual(againByDay(aggregate(rows)))
  })
})

describe('AC-1301.8 자료 끝 무렵·자료 첫 30일', () => {
  it('AC-1301.8 자료 끝 무렵 시작은 창 안에 있는 줄만 센 그대로다(아직 셀 수 없음은 저장 모양에서 정한다)', () => {
    const agg = aggregate([
      rxAt(0, { patient: 1 }),
      rxAt(5, { patient: 1 }),
      rxAt(3, { patient: 2 }),
      rxAt(5, { patient: 2 }),
      rxAt(5, { patient: 3 }), // 자료 끝날 시작
    ])
    expect(againAt(agg, 3)).toEqual([{ code: ESWT, starts: 1, back: [1, 1, 1], more: [1, 1, 1] }])
    expect(againAt(agg, 5)).toEqual([startOnly(ESWT)])
  })

  it('AC-1301.8 자료 첫 날 앞의 기록은 모르므로 첫 30일 안 날도 앞 줄이 없으면 시작이다', () => {
    const agg = aggregate([rxAt(0, { patient: 1 }), rxAt(10, { patient: 1 }), rxAt(10, { patient: 2 })])
    expect(againAt(agg, 0)).toEqual([{ code: ESWT, starts: 1, back: [0, 1, 1], more: [0, 1, 1] }])
    expect(againAt(agg, 10)).toEqual([startOnly(ESWT)])
  })
})
