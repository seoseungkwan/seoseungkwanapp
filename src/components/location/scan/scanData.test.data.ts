// 동네 훑기 시험 자료(지어낸 시군구·동 이름만). 시험 파일이 같이 쓴다 — 이 파일은 시험으로 잡히지 않는다(.test.data.ts)
import type { Dong, DongIndex, LngLat } from '@/lib/location/regions'
import type { ScoreFacts } from '@/types/location'
import type { ScanData, ScanDong, ScanPartState } from './ScanView'

export const INDEX: DongIndex = {
  asOf: '2026-06-30',
  sidos: [
    {
      code2: '11',
      name: '서울특별시',
      sggs: [
        { code5: '11999', name: '예시구', bbox: [127.0, 37.5, 127.015, 37.505] },
        { code5: '11998', name: '예시2구', bbox: [127.02, 37.5, 127.03, 37.51] },
      ],
    },
    { code2: '41', name: '경기도', sggs: [{ code5: '41999', name: '예시시', bbox: [127.1, 37.3, 127.2, 37.4] }] },
  ],
}

const square = (lng: number, lat: number, d = 0.005): LngLat[][] => [
  [
    [lng, lat],
    [lng + d, lat],
    [lng + d, lat + d],
    [lng, lat + d],
    [lng, lat],
  ],
]

export const GARAM = '1199951000'
export const HANEUL = '1199952000'
export const CHAMI = '1199953000'

// 동 경계 파일(지도·가운데 점)
export const DONGS: Dong[] = [
  { code10: GARAM, name: '가람동', areaM2: 1_000_000, center: [127.0025, 37.5025], rings: square(127.0, 37.5) },
  { code10: HANEUL, name: '하늘동', areaM2: 2_000_000, center: [127.0075, 37.5025], rings: square(127.005, 37.5) },
  { code10: CHAMI, name: '차미동', areaM2: 1_500_000, center: [127.0125, 37.5025], rings: square(127.01, 37.5), unmatched: true },
]

// 처음 설정으로 손으로 셈(design.md 8절):
//   가람동 = 사는 사람·수요 96 · 경쟁 76 · 교통·흐름 99 → 38 + 25 + 26 = 89점(만점 40·33·26)
//   하늘동 = 35 · 21 · 10 → 14 + 7 + 2 = 23점
//   차미동(못 이은 동) = 48 · 99 · 60 → 19 + 33 + 16 = 68점
export const GARAM_FACTS: ScoreFacts = {
  areaM2: 1_000_000,
  people: { total: 10_000, bands: [0, 0, 0, 0, 2000, 2000, 2000, 2000, 1000, 500, 500], households: 20_000 },
  trend: [
    { ym: '2022-10', total: 10_000 },
    { ym: '2026-10', total: 10_500 },
  ],
  accidentSpots: 3,
  industryEmployees: 20_000,
  schools: 5,
  seniorCenters: 20,
  gyms: 10,
  rivals: 0,
  newRivals: 0,
  stationM: 200,
  stops: 10,
}

export const HANEUL_FACTS: ScoreFacts = {
  areaM2: 2_000_000,
  people: { total: 8000, bands: [1000, 1000, 1000, 1000, 1000, 1000, 500, 500, 500, 250, 250], households: 3000 },
  trend: null,
  accidentSpots: 0,
  industryEmployees: 20_000,
  schools: 1,
  seniorCenters: 3,
  gyms: 0,
  rivals: 4,
  newRivals: 2,
  stationM: 1400,
  stops: 2,
}

export const CHAMI_FACTS: ScoreFacts = {
  areaM2: 1_500_000,
  people: null,
  trend: null,
  accidentSpots: 1,
  industryEmployees: 20_000,
  schools: 2,
  seniorCenters: 5,
  gyms: 1,
  rivals: 0,
  newRivals: 0,
  stationM: 700,
  stops: 6,
}

export const AT = '2026-11-22T01:40:00.000Z' // 한국 시각 10:40

const okPart = (src: string, asOf: string): ScanPartState => ({ ok: true, src, asOf })

export const PARTS: Record<string, ScanPartState> = {
  people: okPart('pop-age', '2026-10-31'),
  trend: okPart('pop-age', '2026-10-31'),
  accidents: okPart('accident', '2025-09-25'),
  schools: okPart('school', '2026-03-01'),
  seniors: okPart('senior', '2026-05-01'),
  gyms: okPart('gym', '2026-11-20'),
  industry: okPart('industry', '2025-06-30'),
  rivals: okPart('hosp-list', '2026-11-22'),
  station: okPart('rail-stations', '2024-12-31'),
  bus: okPart('bus-stops', '2026-11-09'),
}

export const SCAN_DONGS: ScanDong[] = [
  { code10: GARAM, name: '가람동', unmatched: false, facts: GARAM_FACTS },
  { code10: HANEUL, name: '하늘동', unmatched: false, facts: HANEUL_FACTS },
  { code10: CHAMI, name: '차미동', unmatched: true, facts: CHAMI_FACTS },
]

export function scanData(over: Partial<ScanData> = {}): ScanData {
  return { at: AT, sgg: '11999', sggName: '예시구', sidoName: '서울특별시', dongs: SCAN_DONGS, parts: PARTS, ...over }
}

/** 역·정류장 자료를 못 받은 훑기(교통·흐름 '값 없음') */
export function noTransit(): ScanData {
  return scanData({
    dongs: SCAN_DONGS.map((d) => ({ ...d, facts: { ...d.facts, stationM: null, stops: null } })),
    parts: {
      ...PARTS,
      station: { ok: false, src: 'rail-stations', why: 'failed' },
      bus: { ok: false, src: 'bus-stops', why: 'outside' },
    },
  })
}
