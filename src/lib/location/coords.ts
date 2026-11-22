// 좌표 바꾸기·거리·표본 점(specs/location REQ-7905, design.md 5절). 순수 함수만 둔다(새 패키지 없음)

/** 위도·경도(WGS84, 도) */
export type LatLng = { lat: number; lng: number }

const RAD = Math.PI / 180
/** 거리·표본 점·범위 네모에 쓰는 지구 반지름(m, 평균 반지름) */
export const EARTH_R = 6_371_008.8

/** 소수 6자리(약 0.1m)로 자른다 — 바깥 자료 몸통의 점 모양과 같게 */
const round6 = (v: number) => Math.round(v * 1e6) / 1e6

// EPSG:5174 = +proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel
//             +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43
const BESSEL_A = 6_377_397.155
const BESSEL_E2 = (() => {
  const f = 1 / 299.1528128
  return 2 * f - f * f
})()
const LAT0 = 38 * RAD
const LON0 = 127.0028902777778 * RAD
const K0 = 1
const X0 = 200_000
const Y0 = 500_000
const WGS_A = 6_378_137
const WGS_E2 = (() => {
  const f = 1 / 298.257223563
  return 2 * f - f * f
})()
// towgs84 7변수(PROJ는 위치 벡터 방식): 이동 m, 회전 초, 크기 ppm
const SEC = RAD / 3600
const DX = -115.8
const DY = 474.99
const DZ = 674.11
const RX = 1.16 * SEC
const RY = -2.31 * SEC
const RZ = -1.63 * SEC
const SCALE = 1 + 6.43e-6

/** 자오선 호 길이(적도에서 위도 φ까지, Bessel) */
function meridianArc(phi: number): number {
  const e2 = BESSEL_E2
  const e4 = e2 * e2
  const e6 = e4 * e2
  return (
    BESSEL_A *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi))
  )
}
const M0 = meridianArc(LAT0)

/** 횡메르카토르 역산(Snyder, Bessel): 평면 m → Bessel 위도·경도(라디안) */
function inverseTm(x: number, y: number): { phi: number; lam: number } {
  const e2 = BESSEL_E2
  const ep2 = e2 / (1 - e2)
  const m = M0 + (y - Y0) / K0
  const mu = m / (BESSEL_A * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256))
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const sin1 = Math.sin(phi1)
  const cos1 = Math.cos(phi1)
  const tan1 = Math.tan(phi1)
  const c1 = ep2 * cos1 * cos1
  const t1 = tan1 * tan1
  const w = 1 - e2 * sin1 * sin1
  const n1 = BESSEL_A / Math.sqrt(w)
  const r1 = (BESSEL_A * (1 - e2)) / (w * Math.sqrt(w))
  const d = (x - X0) / (n1 * K0)
  const phi =
    phi1 -
    ((n1 * tan1) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720)
  const lam =
    LON0 +
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) /
      cos1
  return { phi, lam }
}

/** 타원체 위 위도·경도(높이 0) → 지심 좌표 */
function toGeocentric(phi: number, lam: number, a: number, e2: number): [number, number, number] {
  const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
  return [n * Math.cos(phi) * Math.cos(lam), n * Math.cos(phi) * Math.sin(lam), n * (1 - e2) * Math.sin(phi)]
}

/** 지심 좌표 → 타원체 위도·경도(라디안, 되풀이) */
function fromGeocentric(x: number, y: number, z: number, a: number, e2: number): { phi: number; lam: number } {
  const lam = Math.atan2(y, x)
  const p = Math.hypot(x, y)
  let phi = Math.atan2(z, p * (1 - e2))
  for (let i = 0; i < 10; i++) {
    const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
    const h = p / Math.cos(phi) - n
    const next = Math.atan2(z, p * (1 - (e2 * n) / (n + h)))
    const done = Math.abs(next - phi) < 1e-14
    phi = next
    if (done) break
  }
  return { phi, lam }
}

/**
 * EPSG:5174(x 동쪽 m, y 북쪽 m) → WGS84 위도·경도(소수 6자리).
 * 횡메르카토르 역산(Bessel) → 지심 좌표 7변수 변환 → WGS84. 숫자가 아니거나 한국 범위(위도 33~39·경도 124~132) 밖이면 null
 */
export function from5174(x: number, y: number): LatLng | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const bessel = inverseTm(x, y)
  const [bx, by, bz] = toGeocentric(bessel.phi, bessel.lam, BESSEL_A, BESSEL_E2)
  const wx = DX + SCALE * (bx - RZ * by + RY * bz)
  const wy = DY + SCALE * (RZ * bx + by - RX * bz)
  const wz = DZ + SCALE * (-RY * bx + RX * by + bz)
  const wgs = fromGeocentric(wx, wy, wz, WGS_A, WGS_E2)
  const lat = round6(wgs.phi / RAD)
  const lng = round6(wgs.lam / RAD)
  if (!(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132)) return null
  return { lat, lng }
}

/** 두 점 사이 거리(m): 하버사인, 지구 반지름 6,371,008.8m, 버림 */
export function distM(a: LatLng, b: LatLng): number {
  const h =
    Math.sin(((b.lat - a.lat) * RAD) / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(((b.lng - a.lng) * RAD) / 2) ** 2
  return Math.floor(2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h))))
}

/** 고리마다 점 수: 가운데 1개 + 6·12(19개), +18(37개), +24(61개) */
const RINGS = [6, 12, 18, 24]

/** 범위 r(m)에 놓을 표본 점 수: r ≤ 500 → 19, ≤ 1,500 → 37, 그 위 → 61 */
export function sampleCount(r: number): 19 | 37 | 61 {
  return r <= 500 ? 19 : r <= 1500 ? 37 : 61
}

/**
 * 표본 점: 가운데 점 + 고리(6·12·18·24개). 점마다 넓이(πr² ÷ 점 수)가 같게, 고리 반지름은
 * r × √((앞 고리까지 점 수 + 이 고리 점 수 ÷ 2) ÷ 전체 점 수). 차례는 가운데 → 안쪽 고리부터, 고리 안은 북쪽에서 시계 방향
 */
export function samplePoints(c: LatLng, r: number): LatLng[] {
  const total = sampleCount(r)
  const out: LatLng[] = [{ lat: round6(c.lat), lng: round6(c.lng) }]
  const mPerLng = EARTH_R * Math.cos(c.lat * RAD) * RAD
  const mPerLat = EARTH_R * RAD
  let before = 1
  for (const n of RINGS) {
    if (before >= total) break
    const rho = r * Math.sqrt((before + n / 2) / total)
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n
      out.push({
        lat: round6(c.lat + (rho * Math.cos(angle)) / mPerLat),
        lng: round6(c.lng + (rho * Math.sin(angle)) / mPerLng),
      })
    }
    before += n
  }
  return out
}
