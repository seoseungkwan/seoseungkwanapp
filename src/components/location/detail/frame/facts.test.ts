import { describe, expect, it } from 'vitest'
import { pickFlags } from '@/lib/location/flags'
import type { Got, Snapshot } from '@/types/location'
import { candidateListing, flagInputOf, rivalCount, scoreFactsOf, shownAsOf, shownValue, sourceAsOf } from './facts'
import { BANDS, BUILDING, CAND_ID, OTHER_ID, OTHER_LISTING, RIVALS, TODAY, TREND, makeCandidate, makeListing, makeSnapshot } from './frame.test.data'

// 후보 줄·그날 값·매물 → 점수 값(ScoreFacts)·위험 신호 입력(FlagInput). 순수 함수라 화면 없이 본다

const LISTING = makeListing()
const LISTINGS = [LISTING, OTHER_LISTING]

describe('AC-7911.1: 후보 점수 값(scoreFactsOf)', () => {
  it('AC-7911.1: 그날 값·후보 줄·후보 매물·지금 의원 값에서 점수 세부 값을 모두 채운다', () => {
    const facts = scoreFactsOf({ candidate: makeCandidate(), listings: LISTINGS, homeEswt: 50000, today: TODAY })
    expect(facts).toEqual({
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
      rivals: 2, // 한의원 뺌
      newRivals: 1, // 2025년에 연 통증의학과(3년 안)
      gapCells: 26, // 월~금 아침·저녁 18~19·19~20·밤 4칸씩 + 토 9~13시 밖 6칸
      rivalEswt: 60000, // (50,000 + 70,000) ÷ 2, 한의원 뺌
      homeEswt: 50000,
      stationM: 450,
      stops: 6,
      flow: 15000,
      floorLabel: '3층',
      elevators: 1,
      parking: 20,
      buildingAge: 18, // 2008-05-20 사용승인 → 2026-11-22
      pharmacies: 1,
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
    const facts = scoreFactsOf({ candidate: makeCandidate({ snapshot }), listings: LISTINGS, homeEswt: null, today: TODAY })
    expect(facts.stops).toBe(9)
    expect(facts.stationM).toBeNull()
    expect(facts.flow).toBeNull()
    expect(facts.homeEswt).toBeNull()
  })

  it('AC-7911.2: 그날 값이 없으면 공공 자료 칸은 모두 값 없음이고, 고른 값·매물 값만 남는다', () => {
    const facts = scoreFactsOf({ candidate: makeCandidate({ snapshot: null }), listings: LISTINGS, homeEswt: 50000, today: TODAY })
    expect(facts.people).toBeNull()
    expect(facts.rivals).toBeNull()
    expect(facts.gapCells).toBeNull()
    expect(facts.rivalEswt).toBeNull()
    expect(facts.welfareRate).toBeNull()
    expect(facts.buildingAge).toBeNull()
    expect(facts.areaM2).toBe(Math.PI * 1000 * 1000)
    expect(facts.sign).toBe('yes')
    expect(facts.floorLabel).toBe('3층')
    expect(facts.rentPerPy).toBe(100000)
  })

  it('AC-7911.1: 범위 안 경쟁 의원이 없으면 빈틈은 월~토 모든 칸(7 × 6 = 42)이고, 진료 시간을 아는 의원이 하나도 없으면 값 없음이다', () => {
    const none = makeSnapshot({ rivals: { ok: true, v: [], src: 'hosp-list', asOf: '2026-11-15' } })
    expect(scoreFactsOf({ candidate: makeCandidate({ snapshot: none }), listings: [], homeEswt: null, today: TODAY }).gapCells).toBe(42)
    const noHours = makeSnapshot({ rivals: { ok: true, v: [RIVALS[1]!], src: 'hosp-list', asOf: '2026-11-15' } })
    expect(scoreFactsOf({ candidate: makeCandidate({ snapshot: noHours }), listings: [], homeEswt: null, today: TODAY }).gapCells).toBeNull()
  })

  it('AC-7911.1: 의료급여 비율은 인구가 없거나 0이면 값 없음이다', () => {
    const welfare = (population: number | null): Snapshot['welfare'] => ({
      ok: true,
      v: { sggName: '예시구', ym: '2025-12', medical: 10, basic: 10, nearPoor: 10, population },
      src: 'welfare',
      asOf: '2025-12',
    })
    const rate = (population: number | null) =>
      scoreFactsOf({ candidate: makeCandidate({ snapshot: makeSnapshot({ welfare: welfare(population) }) }), listings: [], homeEswt: null, today: TODAY })
        .welfareRate
    expect(rate(null)).toBeNull()
    expect(rate(0)).toBeNull()
    expect(rate(1000)).toBe(2)
  })

  it('AC-7911.1: 매물이 없으면 비용 값은 없고, 넓이 없는 매물은 평당 월세가 없다', () => {
    const empty = scoreFactsOf({ candidate: makeCandidate(), listings: [], homeEswt: null, today: TODAY })
    expect([empty.rentPerPy, empty.deposit, empty.premium]).toEqual([null, null, null])
    expect(empty.savedRentsPerPy).toEqual([])
    const noArea = scoreFactsOf({ candidate: makeCandidate(), listings: [makeListing({ areaM2: null })], homeEswt: null, today: TODAY })
    expect(noArea.rentPerPy).toBeNull()
    expect(noArea.deposit).toBe(100_000_000)
  })
})

describe('AC-7909.1: 후보 매물·경쟁 의원 수', () => {
  it('AC-7909.1: 후보 매물은 그 후보에 이어진 매물 가운데 마지막으로 고친 것이다', () => {
    const older = makeListing({ id: 'a', updatedAt: '2026-11-10T00:00:00.000Z' })
    const newer = makeListing({ id: 'b', updatedAt: '2026-11-20T00:00:00.000Z' })
    const others = makeListing({ id: 'c', candidateId: OTHER_ID, updatedAt: '2026-11-21T00:00:00.000Z' })
    expect(candidateListing(CAND_ID, [older, newer, others, OTHER_LISTING])?.id).toBe('b')
    expect(candidateListing(CAND_ID, [OTHER_LISTING])).toBeNull()
  })

  it('AC-7909.1: 경쟁 의원 수는 범위 안 정형외과·통증·재활만(한의원 뺌), 못 받았으면 null', () => {
    expect(rivalCount(makeCandidate())).toBe(2)
    expect(rivalCount(makeCandidate({ snapshot: makeSnapshot({ rivals: { ok: false, why: 'failed', src: 'hosp-list' } }) }))).toBeNull()
    expect(rivalCount(makeCandidate({ snapshot: null }))).toBeNull()
  })

  it('AC-7909.1: 그날 값 한 칸의 보이는 값과 기준 날짜(받은 값 → 지난 값 → 없음)', () => {
    const okGot: Got<number> = { ok: true, v: 3, src: 'bus-stops', asOf: '2026-11-15' }
    const prevGot: Got<number> = { ok: false, why: 'failed', src: 'bus-stops', prev: { v: 2, asOf: '2026-10-01' } }
    const noneGot: Got<number> = { ok: false, why: 'no-key', src: 'bus-stops' }
    expect([shownValue(okGot), shownValue(prevGot), shownValue(noneGot), shownValue(undefined)]).toEqual([3, 2, null, null])
    expect([shownAsOf(okGot), shownAsOf(prevGot), shownAsOf(noneGot)]).toEqual(['2026-11-15', '2026-10-01', null])
  })
})

describe('AC-7911.3: 위험 신호 입력(flagInputOf)', () => {
  const titles = (candidate = makeCandidate(), listings = LISTINGS) => pickFlags(flagInputOf({ candidate, listings, today: TODAY })).map((f) => f.title)

  it('AC-7911.3: 후보 값에서 design.md 9절 차례대로 맞는 것만 — 위반 건축물 안 고름 → 같은 건물 정형외과 → 이 자리 폐업', () => {
    expect(titles()).toEqual(['위반 건축물인지', '30m 안에 정형외과가 있어요', '이 자리(3층)에서 2025년 3월에 의원이 문을 닫았어요'])
  })

  it('AC-7911.3: 후보 매물·저장한 매물·층·범위·고른 위반 건축물 값을 넘긴다', () => {
    const input = flagInputOf({ candidate: makeCandidate({ violation: 'yes' }), listings: LISTINGS, today: TODAY })
    expect(input.today).toBe(TODAY)
    expect(input.radiusM).toBe(1000)
    expect(input.violation).toBe('yes')
    expect(input.floorLabel).toBe('3층')
    expect(input.listing).toMatchObject({ areaM2: LISTING.areaM2, rent: LISTING.rent, premium: LISTING.premium })
    expect(input.listings).toHaveLength(2)
    expect(input.station).toEqual({ name: '예시가람역', line: '2호선', distM: 450 })
    expect(input.bus).toBe(6)
  })

  it('AC-7911.3: 매물 월세가 평균보다 30% 넘게 비싸고 새 건물에 권리금이 있으면 두 신호가 더 뜬다', () => {
    const snapshot = makeSnapshot({
      building: { ok: true, v: { ...BUILDING, approvedOn: '2025-01-10' }, src: 'building', asOf: '2026-11-15' },
      history: { ok: true, v: [], src: 'clinic-license', asOf: '2026-11-13' },
    })
    const listing = makeListing({ rent: 7_800_000, premium: 50_000_000 })
    expect(titles(makeCandidate({ snapshot, violation: 'no' }), [listing, OTHER_LISTING])).toEqual([
      '30m 안에 정형외과가 있어요',
      '월세가 저장한 매물 평균보다 30% 비싸요',
      '새 건물인데 권리금 5,000만 원을 달라고 해요',
    ])
  })

  it('AC-7911.3: 출처 줄 기준 날짜는 그 출처 id 칸의 날짜(지난 값이면 지난 날짜), 없으면 null', () => {
    const snapshot = makeSnapshot({ history: { ok: false, why: 'failed', src: 'clinic-license', prev: { v: [], asOf: '2026-10-02' } } })
    expect(sourceAsOf(snapshot, 'hosp-list')).toBe('2026-11-15')
    expect(sourceAsOf(snapshot, 'clinic-license')).toBe('2026-10-02')
    expect(sourceAsOf(snapshot, 'user')).toBeNull()
    expect(sourceAsOf(null, 'hosp-list')).toBeNull()
  })

  it('AC-7911.3: 그날 값이 없으면 위반 건축물 신호만 고른다', () => {
    expect(titles(makeCandidate({ snapshot: null }), [])).toEqual(['위반 건축물인지'])
  })
})
