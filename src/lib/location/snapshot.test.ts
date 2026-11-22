import { describe, expect, it } from 'vitest'
import type { Got, Rival, Snapshot, SnapshotKey } from '@/types/location'
import {
  SNAPSHOT_KEYS,
  SNAPSHOT_MAX_BYTES,
  checkSnapshot,
  fitSnapshot,
  mergeSnapshot,
  snapshotBytes,
  snapshotFacts,
  welfareRate,
} from './snapshot'

// 그날 값 검사·크기 줄이기·덮기(specs/location TASK-25, design.md 6절, REQ-7908). 이름은 지어낸 것만 쓴다

const ok = <T>(v: T, src: string, asOf = '2026-11-22'): Got<T> => ({ ok: true, v, src, asOf })

const WEEK: NonNullable<Rival['week']> = [[540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 780], null, null]

function rival(i: number, over: Partial<Rival> = {}): Rival {
  return {
    name: `가람정형외과의원${i}`,
    kind: 'ortho',
    doctors: 2,
    therapists: 3,
    mri: true,
    ct: false,
    openedYear: 2024,
    distM: 10 + i,
    sameBuilding: false,
    week: WEEK,
    eswt: 50_000,
    ...over,
  }
}

function sample(): Snapshot {
  return {
    v: 1,
    at: '2026-11-22T03:00:00.000Z',
    radiusM: 1000,
    people: ok({ total: 30_000, bands: [3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 2000, 1000], households: 12_000, unmatched: 0 }, 'pop-age', '2026-10-31'),
    trend: ok([{ ym: '2022-10', total: 28_000 }, { ym: '2026-10', total: 30_000 }], 'pop-age', '2026-10-31'),
    flow: ok(
      {
        ym: '2026-10',
        stations: [{ name: '가람역', line: '1호선', distM: 450, perDay: 6000 }],
        stops: [{ name: '다솜정류장', distM: 200, perDay: 300 }],
        total: 6300,
        unmatched: 1,
      },
      'flow-volume',
      '2026-10-31',
    ),
    income: ok({ sggName: '나래시 다솜구', won: 42_000_000, year: 2024 }, 'income', '2025-12-31'),
    aptPrice: ok({ perM2: 7_500_000, deals: 12 }, 'apt-trade'),
    bizPrice: ok({ perM2: 5_000_000, deals: 2 }, 'biz-trade'),
    apts: ok([{ name: '다솜마을1단지', households: 1000, builtYear: 2010, bdongName: '다솜동' }], 'apt-list'),
    presale: ok([{ name: '다솜 새아파트', households: 800, moveIn: '2027-03' }], 'presale'),
    seniors: ok(12, 'senior'),
    gyms: ok(3, 'gym'),
    schools: ok(4, 'school'),
    accidents: ok({ spots: 2, cases: 8 }, 'accident'),
    industry: ok({ sggName: '나래시 다솜구', employees: 12_000, parks: 3, quarter: '2026-2' }, 'industry', '2026-06-30'),
    pharmacies: ok(1, 'stores'),
    rivals: ok([rival(1, { sameBuilding: true }), rival(2, { kind: 'korean', mri: null, ct: null, therapists: null, eswt: null, week: null })], 'hosp-list'),
    history: ok([{ kind: 'close', name: '닫은의원', dept: '내과', on: '2024-01-10', distM: 20 }], 'clinic-license'),
    station: ok({ name: '가람역', line: '1호선', distM: 450 }, 'rail-stations', '2026-06-01'),
    bus: ok(7, 'bus-stops', '2026-06-01'),
    market: ok({ name: '다솜시장', distM: 700 }, 'market'),
    building: ok(
      {
        usage: '제1종근린생활시설',
        structure: '철근콘크리트구조',
        above: 5,
        below: 1,
        totalM2: 1200.5,
        approvedOn: '2015-06-30',
        elevators: 1,
        parking: 10,
        floors: [{ label: '지1', usage: '주차장', m2: 300 }, { label: '1', usage: '의원', m2: 250.25 }],
      },
      'building',
    ),
    stores: ok([{ floor: '1', count: 2 }, { floor: '층 모름', count: 1 }], 'stores'),
    welfare: ok({ sggName: '나래시 다솜구', ym: '2025-12', medical: 300, basic: 500, nearPoor: 200, population: 13_337 }, 'welfare', '2025-12-31'),
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

describe('AC-7908.2 그날 값 모양 검사(checkSnapshot)', () => {
  it('AC-7908.2: 칸 22개는 design.md 6절 차례 그대로다', () => {
    expect(SNAPSHOT_KEYS).toEqual([
      'people', 'trend', 'flow', 'income', 'aptPrice', 'bizPrice', 'apts', 'presale', 'seniors', 'gyms', 'schools',
      'accidents', 'industry', 'pharmacies', 'rivals', 'history', 'station', 'bus', 'market', 'building', 'stores', 'welfare',
    ])
  })

  it('AC-7908.2: 맞는 그날 값은 그대로 받고, 실패 칸(지난 값 prev 포함)도 받는다', () => {
    const s = sample()
    expect(checkSnapshot(clone(s))).toEqual(s)
    const failed = { ...s, flow: { ok: false, why: 'outside', src: 'flow-volume' }, rivals: { ok: false, why: 'failed', src: 'hosp-list', prev: { v: [rival(1)], asOf: '2026-10-01' } } }
    expect(checkSnapshot(clone(failed))).toEqual(failed)
  })

  it('AC-7908.2: 모양이 틀리면 null — 판 번호·빠진 칸·더한 칸·까닭·안쪽 값 모양', () => {
    const s = sample()
    const bad: unknown[] = [
      null,
      [],
      'x',
      { ...s, v: 2 },
      { ...s, radiusM: -1 },
      (() => {
        const t: Record<string, unknown> = clone(s)
        delete t.welfare
        return t
      })(),
      { ...s, kakao: ok([], 'kakao-local') },
      { ...s, people: { ok: true, v: s.people.ok ? s.people.v : null, src: 'pop-age' } },
      { ...s, people: { ok: false, why: 'oops', src: 'pop-age' } },
      { ...s, people: { ok: false, why: 'failed' } },
      { ...s, people: ok({ total: 1, bands: [1, 2, 3], households: 1, unmatched: 0 }, 'pop-age') },
      { ...s, rivals: ok([{ ...rival(1), address: '가람도 나래시 다솜구 가람로 1' }], 'hosp-list') },
      { ...s, rivals: ok([{ ...rival(1), kind: 'big' }], 'hosp-list') },
      { ...s, rivals: ok([{ ...rival(1), week: [[540, 1080]] }], 'hosp-list') },
      { ...s, building: ok({ ...(s.building.ok ? s.building.v : {}), floors: [{ pk: 'P1', label: '1', usage: '의원', m2: 1 }] }, 'building') },
      { ...s, history: ok([{ kind: 'moved', name: 'x', dept: '', on: '2024-01-10', distM: 1 }], 'clinic-license') },
      { ...s, bus: ok(1.5, 'bus-stops') },
      { ...s, apts: { ok: false, why: 'failed', src: 'apt-list', prev: { v: 'x', asOf: '2026-10-01' } } },
    ]
    for (const raw of bad) expect(checkSnapshot(raw)).toBeNull()
  })
})

describe('AC-7908.2 크기 재기·줄이기(fitSnapshot, 65,536바이트)', () => {
  it('AC-7908.2: 크기는 표가 재는 jsonb 글자(콜론·쉼표 뒤 빈칸, UTF-8 바이트)로 잰다', () => {
    expect(snapshotBytes({ a: 1, b: [1, 2] })).toBe('{"a": 1, "b": [1, 2]}'.length)
    expect(snapshotBytes({ n: '가' })).toBe(12) // '{"n": "' 7 + '가' 3 + '"}' 2
    expect(SNAPSHOT_MAX_BYTES).toBe(65_536)
  })

  it('AC-7908.2: 작은 그날 값은 그대로 돌려준다', () => {
    const s = sample()
    expect(fitSnapshot(s)).toEqual(s)
  })

  it('AC-7908.2: 넘치면 목록을 뒤에서부터 줄여 65,536바이트 안에 넣고, 받은 값은 고치지 않는다', () => {
    const s = sample()
    const many = Array.from({ length: 2000 }, (_, i) => rival(i))
    const big: Snapshot = { ...s, rivals: ok(many, 'hosp-list') }
    const before = clone(big)
    expect(snapshotBytes(big)).toBeGreaterThan(SNAPSHOT_MAX_BYTES)

    const fitted = fitSnapshot(big)
    expect(snapshotBytes(fitted)).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES)
    expect(big).toEqual(before) // 받은 값을 고치지 않는다
    const kept = fitted.rivals.ok ? fitted.rivals.v : []
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(many.length)
    expect(kept).toEqual(many.slice(0, kept.length)) // 앞(가까운 차례)은 남고 뒤가 빠진다
    // 작은 다른 칸은 그대로
    expect(fitted.people).toEqual(s.people)
    expect(fitted.building).toEqual(s.building)
    expect(checkSnapshot(fitted)).not.toBeNull()
  })

  it('AC-7908.2: 지난 값(prev)의 목록도 줄인다', () => {
    const s = sample()
    const many = Array.from({ length: 2000 }, (_, i) => rival(i))
    const big: Snapshot = { ...s, rivals: { ok: false, why: 'failed', src: 'hosp-list', prev: { v: many, asOf: '2026-10-01' } } }
    const fitted = fitSnapshot(big)
    expect(snapshotBytes(fitted)).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES)
    const r = fitted.rivals
    expect(r.ok).toBe(false)
    const prev = !r.ok ? r.prev : undefined
    expect(prev?.asOf).toBe('2026-10-01')
    expect(prev?.v).toEqual(many.slice(0, prev?.v.length))
  })
})

describe('AC-7908.3 다시 받은 값으로 덮기(mergeSnapshot)', () => {
  it('AC-7908.3: 새로 받은 칸은 새 값·새 기준 날짜로 덮는다', () => {
    const old = sample()
    const next: Snapshot = { ...sample(), at: '2026-12-01T00:00:00.000Z', radiusM: 500, seniors: ok(20, 'senior', '2026-12-01') }
    const merged = mergeSnapshot(next, old)
    expect(merged.at).toBe('2026-12-01T00:00:00.000Z')
    expect(merged.radiusM).toBe(500)
    expect(merged.seniors).toEqual(ok(20, 'senior', '2026-12-01'))
  })

  it('AC-7908.3: 새로 실패한 칸은 전 값을 prev(값·기준 날짜)로 둔다', () => {
    const old = sample()
    const next: Snapshot = { ...sample(), seniors: { ok: false, why: 'failed', src: 'senior' }, flow: { ok: false, why: 'no-key', src: 'flow-volume' } }
    const merged = mergeSnapshot(next, old)
    expect(merged.seniors).toEqual({ ok: false, why: 'failed', src: 'senior', prev: { v: 12, asOf: '2026-11-22' } })
    expect(merged.flow).toEqual({ ok: false, why: 'no-key', src: 'flow-volume', prev: { v: old.flow.ok ? old.flow.v : null, asOf: '2026-10-31' } })
  })

  it('AC-7908.3: 전에도 실패였으면 그 전 값(prev)을 이어 두고, 전 값이 없으면 prev도 없다', () => {
    const first = sample()
    const second = mergeSnapshot({ ...sample(), gyms: { ok: false, why: 'failed', src: 'gym' } }, first)
    const third = mergeSnapshot({ ...sample(), gyms: { ok: false, why: 'not-applied', src: 'gym' } }, second)
    expect(third.gyms).toEqual({ ok: false, why: 'not-applied', src: 'gym', prev: { v: 3, asOf: '2026-11-22' } })

    const lonely = mergeSnapshot({ ...sample(), gyms: { ok: false, why: 'failed', src: 'gym' } }, null)
    expect(lonely.gyms).toEqual({ ok: false, why: 'failed', src: 'gym' })
    const noOld = mergeSnapshot({ ...sample(), gyms: { ok: false, why: 'failed', src: 'gym' } }, { ...first, gyms: { ok: false, why: 'failed', src: 'gym' } })
    expect(noOld.gyms).toEqual({ ok: false, why: 'failed', src: 'gym' })
  })

  it('AC-7908.3: 받은 두 값은 고치지 않는다', () => {
    const old = sample()
    const next: Snapshot = { ...sample(), seniors: { ok: false, why: 'failed', src: 'senior' } }
    const [o, n] = [clone(old), clone(next)]
    mergeSnapshot(next, old)
    expect(old).toEqual(o)
    expect(next).toEqual(n)
  })
})

describe('AC-7908.2 그날 값 → 점수 값(snapshotFacts · 의료급여 비율)', () => {
  it('AC-7908.2: 의료급여·차상위 비율은 (기초 의료급여 + 차상위 3종) ÷ 인구 × 100, 소수 첫째 자리 버림', () => {
    expect(welfareRate({ medical: 300, nearPoor: 200, population: 13_337 })).toBe(3.7) // 3.7489…
    expect(welfareRate({ medical: 1, nearPoor: 0, population: 3 })).toBe(33.3)
    expect(welfareRate({ medical: 29, nearPoor: 0, population: 1000 })).toBe(2.9) // 2.9 × 10 = 28.999…를 버리지 않게
    expect(welfareRate({ medical: 300, nearPoor: 200, population: null })).toBeNull()
    expect(welfareRate({ medical: 300, nearPoor: 200, population: 0 })).toBeNull()
  })

  it('AC-7908.2: 그날 값에서 점수 세부 값을 꺼낸다(학교·산업단지 고용·30m 안 약국 포함)', () => {
    const facts = snapshotFacts(sample(), '2026-11-22')
    expect(facts.areaM2).toBeCloseTo(Math.PI * 1000 * 1000, 6)
    expect(facts.people).toEqual({ total: 30_000, bands: [3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 2000, 1000], households: 12_000 })
    expect(facts.apartments).toBe(1000)
    expect(facts.presale).toBe(800)
    expect(facts.trend).toEqual([{ ym: '2022-10', total: 28_000 }, { ym: '2026-10', total: 30_000 }])
    expect(facts.accidentSpots).toBe(2)
    expect(facts.industryEmployees).toBe(12_000)
    expect(facts.schools).toBe(4)
    expect(facts.seniorCenters).toBe(12)
    expect(facts.gyms).toBe(3)
    expect(facts.welfareRate).toBe(3.7)
    expect(facts.rivals).toBe(1) // 한의원 뺌
    expect(facts.newRivals).toBe(1) // 2024년에 문 엶(3년 안)
    expect(facts.gapCells).toBe(26) // 경쟁 의원 하나(한의원 뺌): 월~금 오전·점심·오후 3칸 + 토 오전 1칸 = 연 칸 16, 월~토 42칸 − 16
    expect(facts.rivalEswt).toBe(50_000)
    expect(facts.stationM).toBe(450)
    expect(facts.stops).toBe(7)
    expect(facts.flow).toBe(6300)
    expect(facts.elevators).toBe(1)
    expect(facts.parking).toBe(10)
    expect(facts.buildingAge).toBe(11)
    expect(facts.pharmacies).toBe(1)
  })

  it('AC-7908.2: 못 받은 칸은 지난 값(prev)으로, 그것도 없으면 null이다', () => {
    const s = sample()
    const facts = snapshotFacts(
      { ...s, bus: { ok: false, why: 'failed', src: 'bus-stops', prev: { v: 3, asOf: '2026-10-01' } }, schools: { ok: false, why: 'no-key', src: 'school' } },
      '2026-11-22',
    )
    expect(facts.stops).toBe(3)
    expect(facts.schools).toBeNull()
  })
})

// 칸 이름 목록이 Snapshot 타입과 어긋나면 tsc가 잡게 한다
const _keys: readonly SnapshotKey[] = SNAPSHOT_KEYS
void _keys
