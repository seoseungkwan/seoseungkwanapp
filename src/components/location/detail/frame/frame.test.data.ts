import { pyeongToM2 } from '@/lib/location/area'
import type { Candidate, Got, Listing, Rival, SggAvg, Snapshot, SnapshotValue } from '@/types/location'

// 후보 자세히 틀 시험용 가짜 후보·그날 값·매물(지어낸 이름만). 오늘 = 2026-11-22(시안과 같음).
// 그날 값은 저장된 모양 그대로(lib/location/snapshot.ts checkSnapshot이 받는 모양): 칸 24개, 기준 날짜는 모두 'YYYY-MM-DD',
// 의원은 새 모양(찾은 과목 depts · 심평원 좌표 at · 30m 안 주소 · 경쟁 과목이던 의원만 detail)

export const TODAY = '2026-11-22'
export const CAND_ID = '11111111-1111-4111-8111-111111111111'
export const OTHER_ID = '22222222-2222-4222-8222-222222222222'

export const ok = <T>(v: T, src: string, asOf: string): Got<T> => ({ ok: true, v, src, asOf })

const WEEKDAY: [number, number] = [540, 1110] // 9:00~18:30
const SATURDAY: [number, number] = [540, 780] // 9:00~13:00

/** 의원 하나(새 모양). 30m 안이면 같은 건물로 본다 */
export function makeRival(over: Partial<Rival> & Pick<Rival, 'name' | 'depts' | 'distM'>): Rival {
  return { at: { lat: 37.5, lng: 127.0 }, sameBuilding: over.distM <= 30, address: '', doctors: 1, openedYear: 2015, ...over }
}

// 처음 과목 설정(경쟁 = 정형외과·신경외과·마취통증·재활)으로 모은 값: 경쟁 과목이던 둘은 detail이 있고, 한의원(둘레로 보기)은 없다
export const RIVALS: Rival[] = [
  makeRival({
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
  makeRival({
    name: '예시하늘통증의학과',
    depts: ['pain'],
    distM: 400,
    openedYear: 2025,
    detail: { therapists: 2, mri: false, ct: false, week: null, priced: true, eswt: 70000, manual: null },
  }),
  makeRival({ name: '예시다온한의원', depts: ['korean'], distM: 10, address: '예시구 가람로 1', openedYear: 2024 }),
]

/** 점수 풀이 견줄 값(후보 시군구 전체, 지어낸 값) */
export const SGG_AVG: SggAvg = {
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
}

export const BANDS = [1000, 1500, 2000, 2500, 3000, 3000, 2500, 2000, 1500, 700, 300] // 합 20,000 · 60세 이상 7,000(35%)
export const TREND = [
  { ym: '2022-10', total: 19000 },
  { ym: '2023-10', total: 19300 },
  { ym: '2024-10', total: 19600 },
  { ym: '2025-10', total: 19800 },
  { ym: '2026-10', total: 20000 },
]

export const BUILDING: SnapshotValue<'building'> = {
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

export function makeSnapshot(over: Partial<Snapshot> = {}): Snapshot {
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
      '2026-09-01',
    ),
    income: ok({ sggName: '예시구', won: 45_000_000, year: 2024, sidoName: '예시도', sidoWon: 48_000_000 }, 'income', '2024-12-31'),
    aptPrice: ok({ perM2: 8_000_000, deals: 30 }, 'apt-trade', '2026-11-15'),
    bizPrice: ok({ perM2: 6_000_000, deals: 5 }, 'biz-trade', '2026-11-15'),
    apts: ok(
      [
        { name: '예시가람아파트', households: 1200, builtYear: 2005, bdongName: '가람동' },
        { name: '예시하늘아파트', households: 800, builtYear: 2015, bdongName: '하늘동' },
      ],
      'apt-list',
      '2026-11-15',
    ),
    presale: ok([{ name: '예시새솔아파트', households: 500, moveIn: '2027-06' }], 'presale', '2026-11-15'),
    seniors: ok(12, 'senior', '2026-11-15'),
    gyms: ok(8, 'gym', '2026-11-15'),
    schools: ok(4, 'school', '2026-11-15'),
    accidents: ok({ spots: 2, cases: 14 }, 'accident', '2025-12-31'),
    industry: ok({ sggName: '예시구', employees: 5000, parks: 1, quarter: '2025-2' }, 'industry', '2025-06-01'),
    pharmacies: ok(1, 'stores', '2026-09-30'),
    rivals: ok(RIVALS, 'hosp-list', '2026-11-15'),
    place: ok({ sido: '11', sidoName: '서울특별시', sgg: '11110', sggName: '예시구', dong: '1111051500', dongName: '가람동' }, 'dongs', '2026-10-31'),
    sggAvg: ok(SGG_AVG, 'pop-age', '2026-10-31'),
    history: ok([{ kind: 'close', name: '예시새솔정형외과의원', dept: '정형외과', on: '2025-03-10', distM: 5 }], 'clinic-license', '2026-11-13'),
    station: ok({ name: '예시가람역', line: '2호선', distM: 450, at: { lat: 37.501, lng: 127.004 } }, 'rail-stations', '2026-06-30'),
    bus: ok(6, 'bus-stops', '2026-06-30'),
    market: ok({ name: '예시가람시장', distM: 600 }, 'market', '2026-11-15'),
    building: ok(BUILDING, 'building', '2026-11-15'),
    stores: ok([{ floor: '1', count: 3 }], 'stores', '2026-09-30'),
    welfare: ok(
      { sggName: '예시구', ym: '2025-12', medical: 9000, basic: 12000, nearPoor: 4000, population: 400000, basis: null },
      'welfare',
      '2025-12-01',
    ),
    ...over,
  }
}

export function makeCandidate(over: Partial<Candidate> = {}): Candidate {
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

export function makeListing(over: Partial<Listing> = {}): Listing {
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
export const OTHER_LISTING = makeListing({
  id: '44444444-4444-4444-8444-444444444444',
  candidateId: null,
  title: '예시타워 2층',
  areaM2: pyeongToM2(30),
  rent: 2_400_000,
  deposit: 50_000_000,
  premium: 30_000_000,
})
