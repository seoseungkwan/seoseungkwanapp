import { describe, expect, it } from 'vitest'
import type { Candidate, DeptRule, Got, Listing, Rival, Snapshot, SnapshotValue } from '@/types/location'
import { pyeongToM2 } from './area'
import { DEFAULT_DEPT_RULE } from './depts'
import { candidateListing, flagInputOf, rivalCount, scoreFactsOf, shownAsOf, shownValue, sourceAsOf } from './facts'
import { DEFAULT_SCORE_RULE, scoreItems } from './score'
import { welfareRate } from './snapshot'

// 후보 줄·그날 값·매물·과목 고르기 → 점수 값(ScoreFacts)·위험 신호 입력(FlagInput). 화면·견주기·보고서가 같이 쓰는 셈 한 곳(design.md 2·6·8·18절).
// 옛 components/location/detail/frame/facts.test.ts의 기댓값을 새 의원 모양(depts·detail)으로 옮겨 같은 값을 본다. 지어낸 이름만

const TODAY = '2026-11-22'
const CAND_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

const ok = <T,>(v: T, src: string, asOf: string): Got<T> => ({ ok: true, v, src, asOf })
const rule = (rival: DeptRule['rival'], hide: DeptRule['hide'] = []): DeptRule => ({ v: 1, rival, hide })

const WEEKDAY: [number, number] = [540, 1110] // 9:00~18:30
const SATURDAY: [number, number] = [540, 780] // 9:00~13:00
const AT = { lat: 37.5, lng: 127.0 }

function rival(over: Partial<Rival> & Pick<Rival, 'name' | 'depts' | 'distM'>): Rival {
  return { at: AT, sameBuilding: over.distM <= 30, address: '', doctors: 1, openedYear: 2015, ...over }
}

// 경쟁 과목(처음 설정)이던 둘은 detail이 있고, 한의원은 둘레로 보기라 detail이 없다
const RIVALS: Rival[] = [
  rival({
    name: '예시가람정형외과',
    depts: ['ortho'],
    distM: 20,
    address: '예시구 가람로 1',
    doctors: 2,
    openedYear: 2019,
    detail: {
      therapists: null,
      mri: true,
      ct: false,
      week: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, SATURDAY, null, null],
      priced: true,
      eswt: 50000,
      manual: null,
    },
  }),
  rival({
    name: '예시하늘통증의학과',
    depts: ['pain'],
    distM: 400,
    openedYear: 2025,
    detail: { therapists: 2, mri: false, ct: false, week: null, priced: true, eswt: 70000, manual: 80000 },
  }),
  rival({ name: '예시다온한의원', depts: ['korean'], distM: 10, address: '예시구 가람로 1', openedYear: 2024 }),
]

const BANDS = [1000, 1500, 2000, 2500, 3000, 3000, 2500, 2000, 1500, 700, 300] // 합 20,000 · 60세 이상 7,000(35%)
const TREND = [
  { ym: '2022-10', total: 19000 },
  { ym: '2023-10', total: 19300 },
  { ym: '2024-10', total: 19600 },
  { ym: '2025-10', total: 19800 },
  { ym: '2026-10', total: 20000 },
]

const BUILDING: SnapshotValue<'building'> = {
  usage: '제1종 근린생활시설',
  structure: '철근콘크리트구조',
  above: 5,
  below: 1,
  totalM2: 1200,
  approvedOn: '2008-05-20',
  elevators: 1,
  parking: 20,
  floors: [{ label: '3', usage: '제1종 근린생활시설', m2: 240 }],
}

function makeSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    v: 1,
    at: '2026-11-15T01:00:00.000Z',
    radiusM: 1000,
    people: ok({ total: 20000, bands: BANDS, households: 9000, unmatched: 0 }, 'pop-age', '2026-10-31'),
    trend: ok(TREND, 'pop-age', '2026-10-31'),
    flow: ok(
      {
        ym: '2026-09',
        stations: [{ name: '예시가람역', line: '2호선', distM: 450, perDay: 12000 }],
        stops: [{ name: '예시가람시장 정류장', distM: 100, perDay: 3000 }],
        total: 15000,
        unmatched: 0,
      },
      'flow-volume',
      '2026-09',
    ),
    income: ok({ sggName: '예시구', won: 45_000_000, year: 2024 }, 'income', '2024'),
    aptPrice: ok({ perM2: 8_000_000, deals: 30 }, 'apt-trade', '2026-11-15'),
    bizPrice: ok({ perM2: 6_000_000, deals: 5 }, 'biz-trade', '2026-11-15'),
    apts: ok(
      [
        { name: '예시가람아파트', households: 1200, builtYear: 2005, bdongName: '가람동' },
        { name: '예시하늘아파트', households: 800, builtYear: 2015, bdongName: '하늘동' },
      ],
      'apt-info',
      '2026-11-15',
    ),
    presale: ok([{ name: '예시새솔아파트', households: 500, moveIn: '2027-06' }], 'presale', '2026-11-15'),
    seniors: ok(12, 'senior', '2026-11-15'),
    gyms: ok(8, 'gym', '2026-11-15'),
    schools: ok(4, 'school', '2026-11-15'),
    accidents: ok({ spots: 2, cases: 14 }, 'accident', '2025'),
    industry: ok({ sggName: '예시구', employees: 5000, parks: 1, quarter: '2025-2' }, 'industry', '2025-06'),
    pharmacies: ok(1, 'stores', '2026-09-30'),
    rivals: ok(RIVALS, 'hosp-list', '2026-11-15'),
    place: ok({ sido: '11', sidoName: '서울특별시', sgg: '11110', sggName: '예시구', dong: '1111051500', dongName: '가람동' }, 'dongs', '2026-10-31'),
    sggAvg: ok(
      {
        sggName: '예시구',
        areaM2: 24_600_000,
        total: 380000,
        bands: [30000, 32000, 40000, 45000, 50000, 55000, 45000, 35000, 28000, 15000, 5000],
        trendPct: 1.4,
        accidents: 14,
        schools: 52,
        seniors: 168,
        gyms: 142,
        stationM: 620,
        stops: 5,
      },
      'pop-age',
      '2026-10-31',
    ),
    history: ok([{ kind: 'close', name: '예시새솔정형외과의원', dept: '정형외과', on: '2025-03-10', distM: 5 }], 'clinic-license', '2026-11-13'),
    station: ok({ name: '예시가람역', line: '2호선', distM: 450, at: { lat: 37.501, lng: 127.004 } }, 'rail-stations', '2026-06-30'),
    bus: ok(6, 'bus-stops', '2026-06-30'),
    market: ok({ name: '예시가람시장', distM: 600 }, 'market', '2026-11-15'),
    building: ok(BUILDING, 'building', '2026-11-15'),
    stores: ok([{ floor: '1', count: 3 }], 'stores', '2026-09-30'),
    welfare: ok(
      { sggName: '예시구', ym: '2025-12', medical: 9000, basic: 12000, nearPoor: 4000, population: 400000, basis: null },
      'welfare',
      '2025-12',
    ),
    ...over,
  }
}

function makeCandidate(over: Partial<Candidate> = {}): Candidate {
  const snapshot = over.snapshot === undefined ? makeSnapshot() : over.snapshot
  return {
    id: CAND_ID,
    name: '예시빌딩 3층',
    addressNote: '예시구 가람동 123-4',
    lat: 37.5,
    lng: 127.0,
    radiusM: 1000,
    status: 'watching',
    floorLabel: '3층',
    areaM2: pyeongToM2(52),
    signVisible: 'yes',
    violation: null,
    costs: {},
    terms: {},
    checks: {},
    openOn: null,
    tasksDone: [],
    snapshot,
    snapshotAt: snapshot ? snapshot.at : null,
    watchCheckedOn: null,
    createdAt: '2026-11-15T00:30:00.000Z',
    updatedAt: '2026-11-15T01:00:00.000Z',
    ...over,
  }
}

function makeListing(over: Partial<Listing> = {}): Listing {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    candidateId: CAND_ID,
    title: '예시빌딩 3층',
    url: '',
    areaM2: pyeongToM2(52),
    floorLabel: '3층',
    deposit: 100_000_000,
    rent: 5_200_000,
    premium: 0,
    mgmt: 780_000,
    brokerId: null,
    brokerNote: '',
    memo: '',
    lat: null,
    lng: null,
    createdAt: '2026-11-14T00:00:00.000Z',
    updatedAt: '2026-11-14T00:00:00.000Z',
    ...over,
  }
}

/** 후보와 이어지지 않은 저장 매물(30평 · 월세 240만 원 = 평당 8만 원) */
const OTHER_LISTING = makeListing({
  id: '44444444-4444-4444-8444-444444444444',
  candidateId: null,
  title: '예시타워 2층',
  areaM2: pyeongToM2(30),
  rent: 2_400_000,
  deposit: 50_000_000,
  premium: 30_000_000,
})
const LISTING = makeListing()
const LISTINGS = [LISTING, OTHER_LISTING]

const withRivals = (rows: Rival[]) => makeCandidate({ snapshot: makeSnapshot({ rivals: ok(rows, 'hosp-list', '2026-11-15') }) })
const factsOf = (candidate: Candidate, deptRule: DeptRule = DEFAULT_DEPT_RULE, listings: readonly Listing[] = LISTINGS) =>
  scoreFactsOf({ candidate, listings, homeEswt: 50000, today: TODAY, deptRule })

describe('AC-7911.1: 후보 점수 값(scoreFactsOf) — 옛 화면 셈 그대로', () => {
  it('AC-7911.1: 그날 값·후보 줄·후보 매물·지금 의원 값·처음 과목 설정에서 점수 세부 값을 모두 채운다', () => {
    expect(factsOf(makeCandidate())).toEqual({
      areaM2: Math.PI * 1000 * 1000,
      people: { total: 20000, bands: BANDS, households: 9000 },
      apartments: 2000,
      presale: 500,
      trend: TREND,
      accidentSpots: 2,
      industryEmployees: 5000,
      schools: 4,
      seniorCenters: 12,
      gyms: 8,
      welfareRate: 3.2, // (9,000 + 4,000) ÷ 400,000 × 100 = 3.25 → 소수 첫째 자리 버림
      rivals: 2, // 정형외과·통증(한의원은 둘레로 보기)
      newRivals: 1, // 2025년에 연 통증의학과(> 올해 − 3)
      gapCells: 26, // 월~금 아침·저녁 18~19·19~20·밤 4칸씩 + 토 9~13시 밖 6칸
      rivalEswt: 60000, // (50,000 + 70,000) ÷ 2
      homeEswt: 50000,
      stationM: 450,
      stops: 6,
      flow: 15000,
      floorLabel: '3층',
      elevators: 1,
      parking: 20,
      buildingAge: 18, // 2008-05-20 사용승인 → 2026-11-22
      pharmacies: 1,
      clinicsNear: 2, // 30m 안 정형외과(20m)·한의원(10m)
      sign: 'yes',
      violation: null,
      rentPerPy: 100000, // 520만 원 ÷ 52평
      deposit: 100_000_000,
      premium: 0,
      savedRentsPerPy: [100000, 80000],
    })
  })

  it('AC-7911.1: 받다가 실패한 칸은 지난 값(prev)을 쓰고, 지난 값도 없으면 값 없음(null)이다', () => {
    const snapshot = makeSnapshot({
      bus: { ok: false, why: 'failed', src: 'bus-stops', prev: { v: 9, asOf: '2026-10-01' } },
      station: { ok: false, why: 'failed', src: 'rail-stations' },
      flow: { ok: false, why: 'outside', src: 'flow-volume' },
    })
    const facts = scoreFactsOf({ candidate: makeCandidate({ snapshot }), listings: LISTINGS, homeEswt: null, today: TODAY, deptRule: DEFAULT_DEPT_RULE })
    expect(facts.stops).toBe(9)
    expect(facts.stationM).toBeNull()
    expect(facts.flow).toBeNull()
    expect(facts.homeEswt).toBeNull()
  })

  it('AC-7911.1: 그날 값이 없으면 공공 자료 칸은 모두 값 없음이고, 고른 값·매물 값만 남는다', () => {
    const facts = factsOf(makeCandidate({ snapshot: null }))
    expect(facts.people).toBeNull()
    expect(facts.rivals).toBeNull()
    expect(facts.gapCells).toBeNull()
    expect(facts.rivalEswt).toBeNull()
    expect(facts.clinicsNear).toBeNull()
    expect(facts.welfareRate).toBeNull()
    expect(facts.buildingAge).toBeNull()
    expect(facts.areaM2).toBe(Math.PI * 1000 * 1000)
    expect(facts.sign).toBe('yes')
    expect(facts.floorLabel).toBe('3층')
    expect(facts.rentPerPy).toBe(100000)
  })

  it('AC-7911.1: 범위 안 경쟁 의원이 0곳이면 빈틈은 월~토 모든 칸(7 × 6 = 42)이고, 진료 시간을 아는 경쟁 의원이 하나도 없으면 값 없음이다', () => {
    expect(factsOf(withRivals([])).gapCells).toBe(42)
    // 한의원만 있으면(둘레로 보기) 경쟁 의원 0곳
    const onlyKorean = factsOf(withRivals([RIVALS[2]!]))
    expect([onlyKorean.rivals, onlyKorean.newRivals, onlyKorean.gapCells, onlyKorean.rivalEswt]).toEqual([0, 0, 42, null])
    expect(factsOf(withRivals([RIVALS[1]!])).gapCells).toBeNull()
  })

  it('AC-7911.1: 새로 연 곳은 개설 연도 > 올해 − 3(2026년이면 2024년부터)이고, 범위 밖 의원은 세지 않는다', () => {
    const rows = [
      rival({ name: '예시세움정형외과', depts: ['ortho'], distM: 300, openedYear: 2023 }),
      rival({ name: '예시바다정형외과', depts: ['ortho'], distM: 500, openedYear: 2024 }),
      rival({ name: '예시먼정형외과', depts: ['ortho'], distM: 1001, openedYear: 2026 }),
    ]
    const facts = factsOf(withRivals(rows))
    expect(facts.rivals).toBe(2)
    expect(facts.newRivals).toBe(1)
  })

  it('AC-7911.1: 의료급여 비율은 snapshot.ts welfareRate 그대로 — 인구가 없거나 0이면 값 없음이다', () => {
    const welfare = (population: number | null): Snapshot['welfare'] =>
      ok({ sggName: '예시구', ym: '2025-12', medical: 10, basic: 10, nearPoor: 10, population, basis: null }, 'welfare', '2025-12')
    const rate = (population: number | null) => factsOf(makeCandidate({ snapshot: makeSnapshot({ welfare: welfare(population) }) }), DEFAULT_DEPT_RULE, []).welfareRate
    expect(rate(null)).toBeNull()
    expect(rate(0)).toBeNull()
    expect(rate(1000)).toBe(2)
    expect(rate(400_000)).toBe(welfareRate({ medical: 10, nearPoor: 10, population: 400_000 }))
  })

  it('AC-7911.1: 매물이 없으면 비용 값은 없고, 넓이 없는 매물은 평당 월세가 없다', () => {
    const empty = factsOf(makeCandidate(), DEFAULT_DEPT_RULE, [])
    expect([empty.rentPerPy, empty.deposit, empty.premium]).toEqual([null, null, null])
    expect(empty.savedRentsPerPy).toEqual([])
    const noArea = factsOf(makeCandidate(), DEFAULT_DEPT_RULE, [makeListing({ areaM2: null })])
    expect(noArea.rentPerPy).toBeNull()
    expect(noArea.deposit).toBe(100_000_000)
  })

  it('AC-7911.1: 후보 매물은 그 후보에 이어진 매물 가운데 마지막으로 고친 것이다', () => {
    const older = makeListing({ id: 'a', updatedAt: '2026-11-10T00:00:00.000Z' })
    const newer = makeListing({ id: 'b', updatedAt: '2026-11-20T00:00:00.000Z' })
    const others = makeListing({ id: 'c', candidateId: OTHER_ID, updatedAt: '2026-11-21T00:00:00.000Z' })
    expect(candidateListing(CAND_ID, [older, newer, others, OTHER_LISTING])?.id).toBe('b')
    expect(candidateListing(CAND_ID, [OTHER_LISTING])).toBeNull()
  })

  it('AC-7911.1: 그날 값 한 칸의 보이는 값과 기준 날짜(받은 값 → 지난 값 → 없음)', () => {
    const okGot: Got<number> = { ok: true, v: 3, src: 'bus-stops', asOf: '2026-11-15' }
    const prevGot: Got<number> = { ok: false, why: 'failed', src: 'bus-stops', prev: { v: 2, asOf: '2026-10-01' } }
    const noneGot: Got<number> = { ok: false, why: 'no-key', src: 'bus-stops' }
    expect([shownValue(okGot), shownValue(prevGot), shownValue(noneGot), shownValue(undefined)]).toEqual([3, 2, null, null])
    expect([shownAsOf(okGot), shownAsOf(prevGot), shownAsOf(noneGot), shownAsOf(null)]).toEqual(['2026-11-15', '2026-10-01', null, null])
  })

  it('AC-7911.1: 출처 줄 기준 날짜는 그 출처 id 칸의 날짜(지난 값이면 지난 날짜), 없으면 null', () => {
    const snapshot = makeSnapshot({ history: { ok: false, why: 'failed', src: 'clinic-license', prev: { v: [], asOf: '2026-10-02' } } })
    expect(sourceAsOf(snapshot, 'hosp-list')).toBe('2026-11-15')
    expect(sourceAsOf(snapshot, 'clinic-license')).toBe('2026-10-02')
    expect(sourceAsOf(snapshot, 'dongs')).toBe('2026-10-31')
    expect(sourceAsOf(snapshot, 'user')).toBeNull()
    expect(sourceAsOf(null, 'hosp-list')).toBeNull()
  })
})

describe('AC-7921.2: 과목 고르기를 바꾸면 다시 부르지 않고 그날 값으로 다시 센다', () => {
  it('AC-7921.2: 경쟁 = 대표 과목이 경쟁 과목인 의원 — 설정만 바꿔 경쟁 수·새로 연 곳·빈틈·진료비가 바뀐다', () => {
    const c = makeCandidate()
    const pick = (deptRule: DeptRule) => {
      const f = factsOf(c, deptRule)
      return [f.rivals, f.newRivals, f.gapCells, f.rivalEswt]
    }
    expect(pick(rule(['ortho']))).toEqual([1, 0, 26, 50000])
    expect(pick(rule(['pain']))).toEqual([1, 1, null, 70000]) // 통증의학과는 진료 시간 자료가 없다
    // 한의원을 새로 경쟁에 넣으면 수·새로 연 곳에는 들고, 그날 값에 detail이 없어 빈틈·진료비에는 안 든다
    expect(pick(rule(['ortho', 'pain', 'korean']))).toEqual([3, 2, 26, 60000])
  })

  it('AC-7921.2: 대표 과목은 depts.ts deptOf — 이름에 든 과목이 먼저, 그 과목이 안 보기면 찾은 과목 가운데 경쟁 과목', () => {
    const named = rival({ name: '예시바른내과의원', depts: ['im', 'ortho'], distM: 300, openedYear: 2026 })
    const c = withRivals([...RIVALS, named])
    expect(factsOf(c).rivals).toBe(2) // 대표 과목 내과 = 둘레로 보기
    expect(factsOf(c, rule(['ortho', 'ns', 'pain', 'rehab'], ['im'])).rivals).toBe(3) // 내과를 안 보면 정형외과로 센다
    expect(rivalCount(c, DEFAULT_DEPT_RULE)).toBe(2)
    expect(rivalCount(c, rule(['im']))).toBe(1)
  })

  it('AC-7921.2: 진료비는 비급여를 받은 경쟁 의원만(priced false는 뺀다)', () => {
    const unpriced = rival({
      name: '예시누리정형외과',
      depts: ['ortho'],
      distM: 600,
      detail: { therapists: null, mri: null, ct: null, week: null, priced: false, eswt: null, manual: null },
    })
    expect(factsOf(withRivals([...RIVALS, unpriced])).rivalEswt).toBe(60000)
    expect(factsOf(withRivals([unpriced])).rivalEswt).toBeNull()
  })

  it('AC-7921.2: 경쟁 의원 수는 범위 안 대표 과목이 경쟁인 의원 수이고, 못 받았으면 null', () => {
    expect(rivalCount(makeCandidate(), DEFAULT_DEPT_RULE)).toBe(2)
    expect(rivalCount(makeCandidate({ snapshot: makeSnapshot({ rivals: { ok: false, why: 'failed', src: 'hosp-list' } }) }), DEFAULT_DEPT_RULE)).toBeNull()
    expect(rivalCount(makeCandidate({ snapshot: null }), DEFAULT_DEPT_RULE)).toBeNull()
  })

  it('AC-7921.2: 위험 신호 입력에 그날 값 의원 모두와 지금 과목 설정을 넘긴다(대표 과목은 flags.ts가 센다)', () => {
    const deptRule = rule(['ortho'], ['dental'])
    const input = flagInputOf({ candidate: makeCandidate({ violation: 'yes' }), listings: LISTINGS, today: TODAY, deptRule })
    expect(input).toMatchObject({ deptRule, today: TODAY, radiusM: 1000, violation: 'yes', floorLabel: '3층', bus: 6 })
    expect(input.rivals).toEqual(RIVALS)
    expect(input.history).toEqual([{ kind: 'close', name: '예시새솔정형외과의원', dept: '정형외과', on: '2025-03-10', distM: 5 }])
    expect(input.building).toEqual(BUILDING)
    expect(input.people).toEqual({ total: 20000, bands: BANDS, households: 9000, unmatched: 0 })
    expect(input.station).toMatchObject({ name: '예시가람역', line: '2호선', distM: 450 })
    expect(input.listing).toEqual({ areaM2: LISTING.areaM2, rent: LISTING.rent, premium: LISTING.premium })
    expect(input.listings).toEqual([
      { areaM2: LISTING.areaM2, rent: LISTING.rent },
      { areaM2: OTHER_LISTING.areaM2, rent: OTHER_LISTING.rent },
    ])
  })

  it('AC-7921.2: 그날 값이 없으면 위험 신호 입력의 그날 값 칸은 모두 null이다', () => {
    const input = flagInputOf({ candidate: makeCandidate({ snapshot: null }), listings: [], today: TODAY, deptRule: DEFAULT_DEPT_RULE })
    expect([input.rivals, input.history, input.building, input.people, input.station, input.bus]).toEqual([null, null, null, null, null, null])
    expect(input.listing).toBeNull()
    expect(input.listings).toEqual([])
  })
})

describe('AC-7921.7: 같은 건물·옆 건물 의원 수 · 경쟁 과목 0개', () => {
  it('AC-7921.7: clinicsNear = 후보 30m 안 의원(경쟁 포함, 안 보기 뺌), 의원 목록을 못 받았으면 null', () => {
    const edge = [
      rival({ name: '예시모퉁이치과의원', depts: ['dental'], distM: 30 }),
      rival({ name: '예시건너내과의원', depts: ['im'], distM: 31 }),
    ]
    expect(factsOf(withRivals([...RIVALS, ...edge])).clinicsNear).toBe(3) // 정형외과 20m · 한의원 10m · 치과 30m
    expect(factsOf(withRivals([...RIVALS, ...edge]), rule(['ortho'], ['korean', 'dental'])).clinicsNear).toBe(1)
    expect(factsOf(makeCandidate({ snapshot: makeSnapshot({ rivals: { ok: false, why: 'failed', src: 'hosp-list' } }) })).clinicsNear).toBeNull()
  })

  it('AC-7921.7: 경쟁 과목이 0개면 경쟁 칸이 모두 값 없음이라 점수의 경쟁 항목이 빠지고, 30m 안 의원 수는 그대로 센다', () => {
    const none = rule([])
    const facts = factsOf(makeCandidate(), none)
    expect([facts.rivals, facts.newRivals, facts.gapCells, facts.rivalEswt]).toEqual([null, null, null, null])
    expect(facts.homeEswt).toBe(50000)
    expect(facts.clinicsNear).toBe(2)
    expect(rivalCount(makeCandidate(), none)).toBeNull()
    const score = scoreItems(facts, DEFAULT_SCORE_RULE)
    expect(score.groups.find((g) => g.id === 'rivals')?.score).toBeNull()
    expect(score.used).toBe(4)
    expect(score.total).not.toBeNull()
  })
})
