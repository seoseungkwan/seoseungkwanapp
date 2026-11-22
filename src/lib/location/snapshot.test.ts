import { describe, expect, it } from 'vitest'
import type { Got, Rival, Snapshot, SnapshotKey } from '@/types/location'
import * as snapshotModule from './snapshot'
import { SNAPSHOT_KEYS, SNAPSHOT_MAX_BYTES, checkSnapshot, fitSnapshot, mergeSnapshot, snapshotBytes, welfareRate } from './snapshot'

// 그날 값 검사·크기 줄이기·덮기(specs/location TASK-25·58, design.md 6절, REQ-7908·7922). 이름은 지어낸 것만 쓴다

const ok = <T>(v: T, src: string, asOf = '2026-11-22'): Got<T> => ({ ok: true, v, src, asOf })

const WEEK: NonNullable<NonNullable<Rival['detail']>['week']> = [[540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 780], null, null]
const DETAIL: NonNullable<Rival['detail']> = { therapists: 3, mri: true, ct: false, week: WEEK, priced: true, eswt: 50_000, manual: null }

/** 경쟁 과목 의원(detail 있음) */
function rival(i: number, over: Partial<Rival> = {}): Rival {
  return {
    name: `가람정형외과의원${i}`,
    depts: ['ortho'],
    at: { lat: 37.5 + i / 1e6, lng: 127.0 },
    distM: 10 + i,
    sameBuilding: false,
    address: '',
    doctors: 2,
    openedYear: 2024,
    detail: DETAIL,
    ...over,
  }
}
/** 둘레로 보기 의원(detail 없음) */
function plain(i: number, over: Partial<Rival> = {}): Rival {
  const { detail: _drop, ...rest } = rival(i, { name: `다솜내과의원${i}`, depts: ['im'], ...over })
  void _drop
  return rest
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
    rivals: ok([rival(1, { sameBuilding: true, address: '가람도 나래시 다솜구 다솜대로 7, 2층' }), plain(2, { name: '다솜한의원', depts: ['korean'] })], 'hosp-list'),
    place: ok({ sido: '41', sidoName: '가람도', sgg: '41111', sggName: '나래시 다솜구', dong: '4111151000', dongName: '다솜1동' }, 'dongs', '2026-07-01'),
    sggAvg: ok(
      {
        sggName: '나래시 다솜구',
        areaM2: 12_345_678.9,
        total: 300_000,
        bands: [30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 20_000, 10_000],
        trendPct: -1.5,
        accidents: 12,
        schools: 40,
        seniors: 120,
        gyms: null,
        stationM: 800,
        stops: 6,
      },
      'pop-age',
      '2025-12-31',
    ),
    history: ok([{ kind: 'close', name: '닫은의원', dept: '내과', on: '2024-01-10', distM: 20 }], 'clinic-license'),
    station: ok({ name: '가람역', line: '1호선', distM: 450, at: { lat: 37.496, lng: 127.0 } }, 'rail-stations', '2026-06-01'),
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
    welfare: ok({ sggName: '나래시 다솜구', ym: '2025-12', medical: 300, basic: 500, nearPoor: 200, population: 13_337, basis: null }, 'welfare', '2025-12-31'),
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const valueOf = <K extends SnapshotKey>(s: Snapshot, key: K) => {
  const got = s[key]
  if (!got.ok) throw new Error(`${key} 칸이 실패예요`)
  return got.v as Extract<Snapshot[K], { ok: true }>['v']
}

describe('AC-7922.4 그날 값 모양 검사(checkSnapshot)', () => {
  it('AC-7922.4: 칸 24개는 design.md 6절 차례 그대로다(place·sggAvg는 의원 다음)', () => {
    expect(SNAPSHOT_KEYS).toEqual([
      'people', 'trend', 'flow', 'income', 'aptPrice', 'bizPrice', 'apts', 'presale', 'seniors', 'gyms', 'schools',
      'accidents', 'industry', 'pharmacies', 'rivals', 'place', 'sggAvg', 'history', 'station', 'bus', 'market', 'building', 'stores', 'welfare',
    ])
  })

  it('AC-7922.4: 맞는 그날 값은 그대로 받고(의원 at·detail, place, sggAvg, 역 at, 의료급여 basis), 실패 칸(지난 값 prev 포함)도 받는다', () => {
    const s = sample()
    expect(checkSnapshot(clone(s))).toEqual(s)
    const failed = { ...s, flow: { ok: false, why: 'outside', src: 'flow-volume' }, rivals: { ok: false, why: 'failed', src: 'hosp-list', prev: { v: [rival(1)], asOf: '2026-10-01' } } }
    expect(checkSnapshot(clone(failed))).toEqual(failed)
    // 동 밖이면 동은 null, 옛 구 묶음이면 basis 글
    const t = {
      ...s,
      place: ok({ ...valueOf(s, 'place'), dong: null, dongName: null }, 'dongs'),
      welfare: ok({ ...valueOf(s, 'welfare'), basis: '옛 중구·동구', population: null }, 'welfare'),
      sggAvg: ok({ ...valueOf(s, 'sggAvg'), trendPct: null, accidents: null, schools: null, seniors: null, stationM: null, stops: null }, 'pop-age'),
      rivals: ok([rival(1, { detail: { ...DETAIL, week: null, priced: false, eswt: null, manual: null, therapists: null, mri: null, ct: null } })], 'hosp-list'),
    }
    expect(checkSnapshot(clone(t))).toEqual(t)
  })

  it('AC-7922.4: 모양이 틀리면 null — 판 번호·빠진 칸·더한 칸·까닭·안쪽 값 모양(새 칸 포함)', () => {
    const s = sample()
    const rivals = (r: unknown) => ({ ...s, rivals: ok([r], 'hosp-list') })
    const { at: _at, ...noAt } = rival(1)
    void _at
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
      (() => {
        const t: Record<string, unknown> = clone(s)
        delete t.place
        return t
      })(),
      (() => {
        const t: Record<string, unknown> = clone(s)
        delete t.sggAvg
        return t
      })(),
      { ...s, kakao: ok([], 'kakao-local') },
      { ...s, people: { ok: true, v: valueOf(s, 'people'), src: 'pop-age' } },
      { ...s, people: { ok: false, why: 'oops', src: 'pop-age' } },
      { ...s, people: { ok: false, why: 'failed' } },
      { ...s, people: ok({ total: 1, bands: [1, 2, 3], households: 1, unmatched: 0 }, 'pop-age') },
      // 의원 새 모양: 옛 kind 칸 · 점 없음 · 점 모양 · 모르는 과목 · 과목 없음 · 상세 더한 칸·빠진 칸 · 요일 칸 수
      rivals({ ...rival(1), kind: 'ortho' }),
      rivals(noAt),
      rivals({ ...rival(1), at: { lat: '37.5', lng: 127 } }),
      rivals({ ...rival(1), at: { lat: 37.5, lng: 127, road: '가람로 1' } }),
      rivals({ ...rival(1), depts: ['big'] }),
      rivals({ ...rival(1), depts: [] }),
      rivals({ ...rival(1), ykiho: 'Y1' }),
      rivals({ ...rival(1), detail: { ...DETAIL, ykiho: 'Y1' } }),
      rivals({ ...rival(1), detail: (() => { const { priced: _p, ...rest } = DETAIL; void _p; return rest })() }),
      rivals({ ...rival(1), detail: { ...DETAIL, week: [[540, 1080]] } }),
      rivals({ ...rival(1), detail: null }),
      { ...s, place: ok({ ...valueOf(s, 'place'), dong: '123' }, 'dongs') },
      { ...s, place: ok({ ...valueOf(s, 'place'), at: { lat: 37.5, lng: 127 } }, 'dongs') },
      { ...s, sggAvg: ok({ ...valueOf(s, 'sggAvg'), bands: [1, 2] }, 'pop-age') },
      { ...s, sggAvg: ok((() => { const { trendPct: _t, ...rest } = valueOf(s, 'sggAvg'); void _t; return rest })(), 'pop-age') },
      { ...s, station: ok({ name: '가람역', line: '1호선', distM: 450 }, 'rail-stations') },
      { ...s, welfare: ok((() => { const { basis: _b, ...rest } = valueOf(s, 'welfare'); void _b; return rest })(), 'welfare') },
      { ...s, building: ok({ ...valueOf(s, 'building'), floors: [{ pk: 'P1', label: '1', usage: '의원', m2: 1 }] }, 'building') },
      { ...s, history: ok([{ kind: 'moved', name: 'x', dept: '', on: '2024-01-10', distM: 1 }], 'clinic-license') },
      { ...s, bus: ok(1.5, 'bus-stops') },
      { ...s, apts: { ok: false, why: 'failed', src: 'apt-list', prev: { v: 'x', asOf: '2026-10-01' } } },
    ]
    for (const [i, raw] of bad.entries()) expect(checkSnapshot(raw), String(i)).toBeNull()
  })
})

// 가장 큰 그날 값(design.md 6절 목록 한도를 모두 채우고 이름·주소를 길게): 흐름 60 + 60 · 아파트 60 · 입주 30 · 의원 200(경쟁 60) · 개폐업 60
function biggest(): Snapshot {
  const s = sample()
  const long = (head: string, i: number) => `${head}${'가나다라마바사아자차'.repeat(2)}${i}`
  const rivals = Array.from({ length: 200 }, (_, i) =>
    i % 10 < 3 ? rival(i, { name: long('정형외과의원', i), sameBuilding: i < 5, address: i < 5 ? long('가람도 나래시 다솜구 다솜대로 ', i) : '' }) : plain(i, { name: long('내과의원', i) }),
  )
  return {
    ...s,
    trend: ok(['2022-10', '2023-10', '2024-10', '2025-10', '2026-10'].map((ym) => ({ ym, total: 123_456 })), 'pop-age'),
    flow: ok(
      {
        ym: '2026-09',
        stations: Array.from({ length: 60 }, (_, i) => ({ name: long('역', i), line: long('호선', i), distM: 100 + i, perDay: 99_999 })),
        stops: Array.from({ length: 60 }, (_, i) => ({ name: long('정류장', i), distM: 100 + i, perDay: 9_999 })),
        total: 9_999_999,
        unmatched: 12,
      },
      'flow-volume',
    ),
    apts: ok(Array.from({ length: 60 }, (_, i) => ({ name: long('아파트', i), households: 1234, builtYear: 2001, bdongName: long('동', i) })), 'apt-list'),
    presale: ok(Array.from({ length: 30 }, (_, i) => ({ name: long('새아파트', i), households: 1234, moveIn: '2028-01' })), 'presale'),
    rivals: ok(rivals, 'hosp-list'),
    history: ok(Array.from({ length: 60 }, (_, i) => ({ kind: 'open' as const, name: long('새의원', i), dept: long('정형외과', i), on: '2025-01-01', distM: 100 + i })), 'clinic-license'),
    building: ok({ ...valueOf(s, 'building'), floors: Array.from({ length: 40 }, (_, i) => ({ label: String(i + 1), usage: long('근린생활시설', i), m2: 123.45 })) }, 'building'),
    stores: ok(Array.from({ length: 40 }, (_, i) => ({ floor: String(i + 1), count: 12 })), 'stores'),
  }
}

describe('AC-7922.4 크기 재기·줄이기(fitSnapshot, 65,536바이트)', () => {
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
    const many = Array.from({ length: 2000 }, (_, i) => plain(i))
    const big: Snapshot = { ...s, rivals: ok(many, 'hosp-list') }
    const before = clone(big)
    expect(snapshotBytes(big)).toBeGreaterThan(SNAPSHOT_MAX_BYTES)

    const fitted = fitSnapshot(big)
    expect(snapshotBytes(fitted)).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES)
    expect(big).toEqual(before) // 받은 값을 고치지 않는다
    const kept = valueOf(fitted, 'rivals')
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(many.length)
    expect(kept).toEqual(many.slice(0, kept.length)) // 앞(가까운 차례)은 남고 뒤가 빠진다
    // 작은 다른 칸은 그대로
    expect(fitted.people).toEqual(s.people)
    expect(fitted.building).toEqual(s.building)
    expect(checkSnapshot(fitted)).not.toBeNull()
  })

  it('AC-7922.4: 의원 목록은 detail이 없는 먼 의원부터 줄이고 경쟁 과목 의원(detail 있음)은 남긴다', () => {
    const s = sample()
    const many = Array.from({ length: 2000 }, (_, i) => (i % 50 === 0 ? rival(i) : plain(i)))
    const fitted = fitSnapshot({ ...s, rivals: ok(many, 'hosp-list') })
    expect(snapshotBytes(fitted)).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES)
    const kept = valueOf(fitted, 'rivals')
    expect(kept.filter((x) => x.detail)).toEqual(many.filter((x) => x.detail)) // 경쟁 40곳은 먼 곳까지 다 남음
    const plainKept = kept.filter((x) => !x.detail)
    expect(plainKept.length).toBeGreaterThan(0)
    expect(plainKept).toEqual(many.filter((x) => !x.detail).slice(0, plainKept.length)) // 가까운 차례만 남음
    const plainNames = new Set(plainKept.map((x) => x.name))
    expect(kept).toEqual(many.filter((x) => x.detail || plainNames.has(x.name))) // 차례는 그대로(가까운 차례)
  })

  it('AC-7922.4: 가장 큰 그날 값도(지난 값까지 붙어도) 65,536바이트 안에 들고, 경쟁 과목 의원은 다 남는다', () => {
    const top = biggest()
    const fitted = fitSnapshot(top)
    expect(snapshotBytes(fitted)).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES)
    expect(checkSnapshot(clone(fitted))).not.toBeNull()
    expect(valueOf(fitted, 'rivals').filter((x) => x.detail).length).toBe(60)

    // 모든 칸이 실패하고 지난 값(가장 큰 값)만 남은 그날 값
    const prevOnly = { ...top } as Record<SnapshotKey, Got<unknown>>
    for (const key of SNAPSHOT_KEYS) {
      const got = top[key] as Got<unknown>
      if (got.ok) prevOnly[key] = { ok: false, why: 'failed', src: got.src, prev: { v: got.v, asOf: got.asOf } }
    }
    const merged = mergeSnapshot({ ...top, ...prevOnly } as Snapshot, top)
    const fittedPrev = fitSnapshot(merged)
    expect(snapshotBytes(fittedPrev)).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES)
    expect(checkSnapshot(clone(fittedPrev))).not.toBeNull()
  })

  it('AC-7922.4: 경쟁 과목 의원만으로 넘쳐도(지난 값을 빼고 마지막에 먼 경쟁 의원부터) 65,536바이트 안에 든다', () => {
    const s = sample()
    const many = Array.from({ length: 400 }, (_, i) => rival(i, { name: `정형외과의원${'가나다라마바사'.repeat(4)}${i}` }))
    const fitted = fitSnapshot({ ...s, rivals: ok(many, 'hosp-list'), apts: { ok: false, why: 'failed', src: 'apt-list', prev: { v: [{ name: '다솜마을', households: 1, builtYear: null, bdongName: '다솜동' }], asOf: '2026-10-01' } } })
    expect(snapshotBytes(fitted)).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES)
    const kept = valueOf(fitted, 'rivals')
    expect(kept.length).toBeGreaterThan(0)
    expect(kept).toEqual(many.slice(0, kept.length))
    expect(fitted.apts).toEqual({ ok: false, why: 'failed', src: 'apt-list' }) // 지난 값을 먼저 뺀다
  })

  it('AC-7908.3: 지난 값(prev)의 목록도 줄인다', () => {
    const s = sample()
    const many = Array.from({ length: 2000 }, (_, i) => plain(i))
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

  it('AC-7908.3: 새로 실패한 칸은 전 값을 prev(값·기준 날짜)로 둔다(새 칸 place·sggAvg 포함)', () => {
    const old = sample()
    const next: Snapshot = {
      ...sample(),
      seniors: { ok: false, why: 'failed', src: 'senior' },
      flow: { ok: false, why: 'no-key', src: 'flow-volume' },
      sggAvg: { ok: false, why: 'failed', src: 'pop-age' },
    }
    const merged = mergeSnapshot(next, old)
    expect(merged.seniors).toEqual({ ok: false, why: 'failed', src: 'senior', prev: { v: 12, asOf: '2026-11-22' } })
    expect(merged.flow).toEqual({ ok: false, why: 'no-key', src: 'flow-volume', prev: { v: valueOf(old, 'flow'), asOf: '2026-10-31' } })
    expect(merged.sggAvg).toEqual({ ok: false, why: 'failed', src: 'pop-age', prev: { v: valueOf(old, 'sggAvg'), asOf: '2025-12-31' } })
    expect(checkSnapshot(clone(merged))).toEqual(merged)
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

describe('AC-7918.2·AC-7909.3 검토 고침 칸 — 소득 시·도 평균 · 개폐업 업태 · 의원 목록 잘림', () => {
  it('AC-7918.2: 소득 칸은 시·도 이름·평균(sidoName·sidoWon, 없으면 null)을 받고, 두 칸이 없는 옛 값도 받는다', () => {
    const s = sample()
    const income = valueOf(s, 'income')
    const withSido = { ...s, income: ok({ ...income, sidoName: '가람도', sidoWon: 40_000_000 }, 'income', '2024-12-31') }
    expect(checkSnapshot(clone(withSido))).toEqual(withSido)
    const nulls = { ...s, income: ok({ ...income, sidoName: null, sidoWon: null }, 'income', '2024-12-31') }
    expect(checkSnapshot(clone(nulls))).toEqual(nulls)
    expect(checkSnapshot(clone(s))).toEqual(s) // 옛 값(두 칸 없음)
    for (const bad of [{ sidoWon: '40000000' }, { sidoWon: -1 }, { sidoWon: 1.5 }, { sidoName: 3 }, { sidoAvg: 1 }]) {
      expect(checkSnapshot(clone({ ...s, income: ok({ ...income, sidoName: '가람도', sidoWon: 1, ...bad }, 'income') })), JSON.stringify(bad)).toBeNull()
    }
  })

  it('AC-7909.3: 3년 개폐업 줄은 업태 글(type)을 받고, type이 없는 옛 줄도 받는다 — 글자가 아니면 틀린 모양', () => {
    const s = sample()
    const row = { kind: 'open' as const, name: '가람미소의원', dept: '', type: '치과의원', on: '2025-05-01', distM: 100 }
    const t = { ...s, history: ok([row, ...valueOf(s, 'history')], 'clinic-license') }
    expect(checkSnapshot(clone(t))).toEqual(t)
    expect(checkSnapshot(clone({ ...s, history: ok([{ ...row, type: 7 }], 'clinic-license') }))).toBeNull()
  })

  it('AC-7909.3: 의원 목록만 capped: true를 받는다(값·지난 값) — 다른 칸의 capped·capped: false는 틀린 모양', () => {
    const s = sample()
    const capped = { ...s, rivals: { ...s.rivals, capped: true } }
    expect(checkSnapshot(clone(capped))).toEqual(capped)
    const prevCapped = { ...s, rivals: { ok: false, why: 'failed', src: 'hosp-list', prev: { v: [rival(1)], asOf: '2026-10-01', capped: true } } }
    expect(checkSnapshot(clone(prevCapped))).toEqual(prevCapped)
    expect(checkSnapshot(clone({ ...s, rivals: { ...s.rivals, capped: false } }))).toBeNull()
    expect(checkSnapshot(clone({ ...s, apts: { ...s.apts, capped: true } }))).toBeNull()
  })

  it('AC-7909.3: 새로 실패한 의원 목록은 잘린 전 값의 capped를 지난 값(prev)에 이어 둔다', () => {
    const old = { ...sample(), rivals: { ...sample().rivals, capped: true as const } }
    const merged = mergeSnapshot({ ...sample(), rivals: { ok: false, why: 'failed', src: 'hosp-list' } }, old)
    expect(merged.rivals).toEqual({ ok: false, why: 'failed', src: 'hosp-list', prev: { v: valueOf(old, 'rivals'), asOf: '2026-11-22', capped: true } })
    const again = mergeSnapshot({ ...sample(), rivals: { ok: false, why: 'no-key', src: 'hosp-list' } }, merged)
    expect(again.rivals).toEqual({ ok: false, why: 'no-key', src: 'hosp-list', prev: { v: valueOf(old, 'rivals'), asOf: '2026-11-22', capped: true } })
    // 잘리지 않은 전 값은 capped 없이
    const plainMerged = mergeSnapshot({ ...sample(), rivals: { ok: false, why: 'failed', src: 'hosp-list' } }, sample())
    expect(plainMerged.rivals).toEqual({ ok: false, why: 'failed', src: 'hosp-list', prev: { v: valueOf(sample(), 'rivals'), asOf: '2026-11-22' } })
    expect(checkSnapshot(clone(merged))).toEqual(merged)
  })

  it('AC-7909.3: fitSnapshot이 의원 목록을 줄이면 capped: true를 남기고(지난 값도), 다른 목록만 줄이면 의원 목록은 그대로다', () => {
    const s = sample()
    const many = Array.from({ length: 2000 }, (_, i) => plain(i))
    const fitted = fitSnapshot({ ...s, rivals: ok(many, 'hosp-list') })
    expect(fitted.rivals).toMatchObject({ ok: true, capped: true })
    expect(checkSnapshot(clone(fitted))).toEqual(fitted)

    const prevFitted = fitSnapshot({ ...s, rivals: { ok: false, why: 'failed', src: 'hosp-list', prev: { v: many, asOf: '2026-10-01' } } })
    expect(prevFitted.rivals).toMatchObject({ ok: false, prev: { asOf: '2026-10-01', capped: true } })

    const apts = Array.from({ length: 2000 }, (_, i) => ({ name: `다솜마을${i}단지`, households: 100, builtYear: 2001, bdongName: '다솜동' }))
    const other = fitSnapshot({ ...s, apts: ok(apts, 'apt-list') })
    expect(valueOf(other, 'apts').length).toBeLessThan(apts.length)
    expect(other.rivals).toEqual(s.rivals)
  })

  it('AC-7909.3: placeAddr — 그날 값 place의 시도·시군구 → 인허가 주소 앞부분, 둘이 같으면(세종) 하나, 모양 밖이면 null', () => {
    expect(snapshotModule.placeAddr({ sidoName: '가람도', sggName: '나래시 다솜구' })).toBe('가람도 나래시 다솜구')
    expect(snapshotModule.placeAddr({ sidoName: '세종특별자치시', sggName: '세종특별자치시' })).toBe('세종특별자치시')
    expect(snapshotModule.placeAddr({ sidoName: ' 가람도 ', sggName: ' 나래시  다솜구 ' })).toBe('가람도 나래시 다솜구')
    expect(snapshotModule.placeAddr({ sidoName: '가람도', sggName: '' })).toBeNull()
    expect(snapshotModule.placeAddr({ sidoName: 'Seoul', sggName: '가람구' })).toBeNull()
    expect(snapshotModule.placeAddr({ sidoName: '가'.repeat(30), sggName: '나'.repeat(30) })).toBeNull()
  })
})

describe('AC-7909.7 의료급여 비율(welfareRate — 화면·점수가 부르는 한 곳)', () => {
  it('AC-7909.7: 의료급여·차상위 비율은 (기초 의료급여 + 차상위 3종) ÷ 인구 × 100, 소수 첫째 자리 버림', () => {
    expect(welfareRate({ medical: 300, nearPoor: 200, population: 13_337 })).toBe(3.7) // 3.7489…
    expect(welfareRate({ medical: 1, nearPoor: 0, population: 3 })).toBe(33.3)
    expect(welfareRate({ medical: 29, nearPoor: 0, population: 1000 })).toBe(2.9) // 2.9 × 10 = 28.999…를 버리지 않게
    expect(welfareRate({ medical: 300, nearPoor: 200, population: null })).toBeNull()
    expect(welfareRate({ medical: 300, nearPoor: 200, population: 0 })).toBeNull()
  })

  it('AC-7909.7: 점수 값 꺼내기(snapshotFacts)는 여기 없다 — facts.ts scoreFactsOf 한 곳이 센다(TASK-59)', () => {
    expect('snapshotFacts' in snapshotModule).toBe(false)
  })
})

// 칸 이름 목록이 Snapshot 타입과 어긋나면 tsc가 잡게 한다
const _keys: readonly SnapshotKey[] = SNAPSHOT_KEYS
void _keys
