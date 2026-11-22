import { describe, expect, it } from 'vitest'
import { distM, from5174, samplePoints, type LatLng } from './coords'

// 좌표 바꾸기·거리·표본 점(specs/location REQ-7905, design.md 5절)
// 기준점 다섯: 저장소 밖에서 따로 짠 계산(크뤼거 급수 횡메르카토르 역산 + PROJ towgs84 7변수, 수치 적분·왕복으로 맞춤 확인)으로
// design.md 5절 EPSG:5174 정의 그대로 한 번 구해 숫자만 적었다(proj4는 넣지 않음)
const REFERENCE: { place: string; x: number; y: number; want: LatLng }[] = [
  { place: '서울', x: 198000, y: 451600, want: { lat: 37.56668114, lng: 126.97815021 } },
  { place: '부산', x: 389000, y: 186000, want: { lat: 35.15542569, lng: 129.0749405 } },
  { place: '광주', x: 186400, y: 184000, want: { lat: 35.15505291, lng: 126.85154911 } },
  { place: '강릉', x: 367100, y: 472000, want: { lat: 37.73525020, lng: 128.89637462 } },
  { place: '제주', x: 156350, y: -700, want: { lat: 33.48922183, lng: 126.53113688 } },
]

// 시험 안에서만 쓰는 정확한 거리(버리지 않음): 하버사인 그대로
const R = 6_371_008.8
const exactM = (a: LatLng, b: LatLng) => {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const decimals = (v: number) => (String(v).split('.')[1] ?? '').length

describe('AC-7905.1 from5174', () => {
  for (const p of REFERENCE) {
    it(`AC-7905.1: EPSG:5174 기준점(${p.place})을 WGS84로 바꾸면 5m 안으로 맞는다`, () => {
      const got = from5174(p.x, p.y)
      expect(got).not.toBeNull()
      expect(exactM(got!, p.want)).toBeLessThan(5)
    })
  }

  it('AC-7905.1: 바꾼 점은 소수 6자리까지다', () => {
    const got = from5174(198000, 451600)!
    expect(decimals(got.lat)).toBeLessThanOrEqual(6)
    expect(decimals(got.lng)).toBeLessThanOrEqual(6)
  })

  it('AC-7905.1: 숫자가 아니거나 한국 범위(위도 33~39·경도 124~132) 밖이면 null이다', () => {
    expect(from5174(Number.NaN, 451600)).toBeNull()
    expect(from5174(198000, Number.POSITIVE_INFINITY)).toBeNull()
    expect(from5174(5_000_000, 451600)).toBeNull()
    expect(from5174(198000, 1_200_000)).toBeNull()
  })
})

describe('AC-7905.1 distM', () => {
  it('AC-7905.1: 거리는 하버사인(지구 반지름 6,371,008.8m) m를 버린 정수다', () => {
    // 적도에서 경도 1도 = 6,371,008.8 × π/180 = 111,195.08m → 111,195
    expect(distM({ lat: 0, lng: 127 }, { lat: 0, lng: 128 })).toBe(111195)
    // 경선 위 위도 0.5도 = 55,597.54m → 버림 55,597(반올림이면 55,598)
    expect(distM({ lat: 37, lng: 127 }, { lat: 37.5, lng: 127 })).toBe(55597)
    const a = { lat: 37.5665, lng: 126.978 }
    const b = { lat: 37.4979, lng: 127.0276 }
    expect(distM(a, b)).toBe(Math.floor(exactM(a, b)))
    expect(Number.isInteger(distM(a, b))).toBe(true)
  })

  it('AC-7905.1: 같은 점은 0이고 앞뒤를 바꿔도 같다', () => {
    const a = { lat: 37.5665, lng: 126.978 }
    const b = { lat: 35.1796, lng: 129.0756 }
    expect(distM(a, a)).toBe(0)
    expect(distM(a, b)).toBe(distM(b, a))
  })
})

describe('AC-7905.2 samplePoints', () => {
  const c = { lat: 37.51, lng: 127.0175 }

  it('AC-7905.2: 범위 ≤ 500m는 19개, ≤ 1,500m는 37개, 그 위는 61개다', () => {
    expect(samplePoints(c, 300)).toHaveLength(19)
    expect(samplePoints(c, 500)).toHaveLength(19)
    expect(samplePoints(c, 501)).toHaveLength(37)
    expect(samplePoints(c, 1000)).toHaveLength(37)
    expect(samplePoints(c, 1500)).toHaveLength(37)
    expect(samplePoints(c, 1501)).toHaveLength(61)
    expect(samplePoints(c, 3000)).toHaveLength(61)
  })

  it('AC-7905.2: 첫 점은 가운데이고 모든 점이 원 안에 있으며 소수 6자리까지다', () => {
    for (const r of [300, 1000, 3000]) {
      const pts = samplePoints(c, r)
      expect(pts[0]).toEqual(c)
      for (const p of pts) {
        expect(distM(c, p)).toBeLessThan(r)
        expect(decimals(p.lat)).toBeLessThanOrEqual(6)
        expect(decimals(p.lng)).toBeLessThanOrEqual(6)
      }
    }
  })

  // 고리 점 수 6·12·18·24, 고리 반지름 = r × √((앞 점 수 + 고리 점 수 ÷ 2) ÷ 전체 점 수) — 점마다 넓이가 같게
  const RINGS = [6, 12, 18, 24]
  for (const [r, total] of [
    [500, 19],
    [1000, 37],
    [3000, 61],
  ] as const) {
    it(`AC-7905.2: 범위 ${r}m 고리는 넓이가 같게 나눈 반지름에 고르게 놓인다`, () => {
      const pts = samplePoints(c, r)
      const byDist = pts.map((p) => ({ p, d: exactM(c, p) })).sort((x, y) => x.d - y.d)
      expect(byDist[0].d).toBeLessThan(0.1)
      let before = 1
      for (const n of RINGS) {
        if (before >= total) break
        const ring = byDist.slice(before, before + n)
        const want = r * Math.sqrt((before + n / 2) / total)
        for (const { d } of ring) expect(Math.abs(d - want)).toBeLessThan(2)
        // 고르게: 같은 고리에서 가장 가까운 이웃까지 = 2ρ·sin(π/n)
        const gap = 2 * want * Math.sin(Math.PI / n)
        for (const { p } of ring) {
          const nearest = Math.min(...ring.filter((o) => o.p !== p).map((o) => exactM(p, o.p)))
          expect(Math.abs(nearest - gap)).toBeLessThan(2)
        }
        before += n
      }
      expect(before).toBe(total)
    })
  }
})
