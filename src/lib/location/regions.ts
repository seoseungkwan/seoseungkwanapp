// 지역 찾기·동 몫·코드 만들기(specs/location REQ-7905, design.md 5절). 순수 함수만 둔다
import { EARTH_R, type LatLng } from './coords'

/** [경도, 위도] — 동 경계 파일(SGIS 경계를 줄인 것)의 점 모양 */
export type LngLat = [number, number]

/** 동 경계 파일 `<code5>.json`의 동 하나. rings는 바깥 경계·구멍·떨어진 조각을 모두 담는다(홀짝 규칙으로 안을 가린다) */
export type Dong = {
  code10: string // 행안부 행정동 코드
  name: string
  areaM2: number
  center: LngLat
  rings: LngLat[][] | null
  unmatched?: true
}
export type DongFile = { asOf: string; dongs: Dong[] }

/** 동 경계 `index.json`의 시군구 한 줄. bbox = [서, 남, 동, 북] */
export type DongIndexSgg = { code5: string; name: string; bbox: [number, number, number, number] }
export type DongIndex = { asOf: string; sidos: { code2: string; name: string; sggs: DongIndexSgg[] }[] }

/** 범위 안 동마다 몫(0~1) */
export type DongShare = { code10: string; share: number }

const RAD = Math.PI / 180

/** 범위 원(가운데 c, 반지름 r m)을 감싼 네모와 겹치는 시군구(index 차례 그대로) */
export function sggsTouching(index: DongIndex, c: LatLng, r: number): DongIndexSgg[] {
  const dLat = r / EARTH_R / RAD
  const dLng = dLat / Math.cos(c.lat * RAD)
  const w = c.lng - dLng
  const e = c.lng + dLng
  const s = c.lat - dLat
  const n = c.lat + dLat
  return index.sidos.flatMap((sido) =>
    sido.sggs.filter(({ bbox: [bw, bs, be, bn] }) => w <= be && e >= bw && s <= bn && n >= bs),
  )
}

/** 점이 고리(닫힌 다각형) 안에 있나 — 가로 반직선이 변을 몇 번 지나나 */
function inRing(lng: number, lat: number, ring: LngLat[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 점이 들어 있는 행정동. 경계 밖·경계가 없는 동(rings: null)은 null */
export function dongOf(p: LatLng, dongs: readonly Dong[]): Dong | null {
  for (const dong of dongs) {
    if (!dong.rings) continue
    let inside = false
    for (const ring of dong.rings) if (inRing(p.lng, p.lat, ring)) inside = !inside
    if (inside) return dong
  }
  return null
}

/**
 * 동 몫 = min(1, 그 동 점 수 × 점 하나 넓이 ÷ 동 넓이). 점 하나 넓이 = πr² ÷ 점 수.
 * 점이 하나라도 들어간 동만 동 목록 차례로 내놓는다. 경계 밖 점은 어느 동에도 넣지 않는다
 */
export function dongShares(points: readonly LatLng[], dongs: readonly Dong[], r: number): DongShare[] {
  if (points.length === 0) return []
  const unit = (Math.PI * r * r) / points.length
  const counts = new Map<string, number>()
  for (const p of points) {
    const dong = dongOf(p, dongs)
    if (dong) counts.set(dong.code10, (counts.get(dong.code10) ?? 0) + 1)
  }
  return dongs.flatMap((d) => {
    const n = counts.get(d.code10)
    if (!n) return []
    counts.delete(d.code10) // 같은 코드가 두 번 있어도 한 번만
    return [{ code10: d.code10, share: Math.min(1, (n * unit) / d.areaM2) }]
  })
}

/** 소수 곱셈의 작은 어긋남(0.29 × 100 = 28.999999999999996)을 버림 전에 덮는 폭 */
const FLOAT_SLACK = 1e-9

/** 범위 값 = Σ(동 값 × 몫)을 버린 정수. 값이 없는 동은 빼고 더한다 */
export function rangeValue(shares: readonly DongShare[], values: Readonly<Record<string, number | undefined>>): number {
  let sum = 0
  for (const { code10, share } of shares) {
    const v = values[code10]
    if (typeof v === 'number' && Number.isFinite(v)) sum += v * share
  }
  return Math.floor(sum + FLOAT_SLACK)
}

/** 시군구 5자리 = 행정동·법정동 코드(10자리) 앞 5자리 */
export function sggOf(code10: string): string | null {
  return /^\d{10}$/.test(code10) ? code10.slice(0, 5) : null
}

/** 건축물대장 열쇠(시군구·법정동·번·지·대지 구분)와 PNU(토지이음) */
export type LandCodes = { sigunguCd: string; bjdongCd: string; bun: string; ji: string; platGbCd: '0' | '1'; pnu: string }

const isLotNo = (v: number) => Number.isInteger(v) && v >= 0 && v <= 9999
const pad4 = (v: number) => String(v).padStart(4, '0')

/**
 * 법정동 코드 10자리·본번·부번·산 → 시군구 = 앞 5, 법정동 = 뒤 5, 번 = 본번 4자리(앞 0), 지 = 부번 4자리,
 * 대지 구분 = 산 `1` / 아님 `0`, PNU = 법정동 코드 10 + (산 `2` / 아님 `1`) + 본번 4 + 부번 4(19자리). 모양이 틀리면 null
 */
export function landCodes(lot: { bcode: string; main: number; sub: number; san: boolean }): LandCodes | null {
  if (!/^\d{10}$/.test(lot.bcode) || !isLotNo(lot.main) || !isLotNo(lot.sub)) return null
  const bun = pad4(lot.main)
  const ji = pad4(lot.sub)
  return {
    sigunguCd: lot.bcode.slice(0, 5),
    bjdongCd: lot.bcode.slice(5),
    bun,
    ji,
    platGbCd: lot.san ? '1' : '0',
    pnu: `${lot.bcode}${lot.san ? '2' : '1'}${bun}${ji}`,
  }
}
