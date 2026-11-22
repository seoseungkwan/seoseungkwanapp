// 카카오 지도 JavaScript SDK 가운데 이 앱이 쓰는 것만의 모양(specs/location design.md 13절).
// SDK는 window.kakao.maps에 붙는다. autoload=false라 script를 받은 직후에는 load만 있고, load가 끝나야 나머지가 생긴다
import type { Point } from '@/types/location'

export type KLatLng = { getLat(): number; getLng(): number }
export type KBounds = { extend(p: KLatLng): void }
export type KMap = {
  setCenter(p: KLatLng): void
  setBounds(bounds: KBounds): void
  setMapTypeId(id: number): void
  /** 칸 크기가 바뀐 뒤 다시 잰다 */
  relayout(): void
}
/** 지도 위에 얹는 것(원·다각형·사용자 표시). setMap(null)이면 지도에서 뗀다 */
export type KLayer = { setMap(map: KMap | null): void }
export type KMouseEvent = { latLng: KLatLng }
type KHandler = (e: KMouseEvent) => void

export type KCircleOptions = {
  center: KLatLng
  radius: number
  strokeWeight?: number
  strokeColor?: string
  strokeOpacity?: number
  strokeStyle?: 'solid' | 'dashed'
  fillColor?: string
  fillOpacity?: number
}
export type KPolygonOptions = {
  path: KLatLng[][]
  strokeWeight?: number
  strokeColor?: string
  strokeOpacity?: number
  fillColor?: string
  fillOpacity?: number
}
export type KOverlayOptions = {
  position: KLatLng
  content: HTMLElement
  xAnchor?: number
  yAnchor?: number
  zIndex?: number
  clickable?: boolean
}

export type KakaoMaps = {
  LatLng: new (lat: number, lng: number) => KLatLng
  LatLngBounds: new () => KBounds
  Map: new (container: HTMLElement, options: { center: KLatLng; level: number }) => KMap
  Circle: new (options: KCircleOptions) => KLayer
  Polygon: new (options: KPolygonOptions) => KLayer
  CustomOverlay: new (options: KOverlayOptions) => KLayer
  MapTypeId: { ROADMAP: number; HYBRID: number }
  event: {
    addListener(target: object, type: 'click', handler: KHandler): void
    removeListener(target: object, type: 'click', handler: KHandler): void
  }
  Roadview: new (container: HTMLElement) => { setPanoId(panoId: number, position: KLatLng): void }
  RoadviewClient: new () => {
    getNearestPanoId(position: KLatLng, radiusM: number, done: (panoId: number | null) => void): void
  }
}

export type KakaoWindow = Window & {
  kakao?: { maps?: Partial<KakaoMaps> & { load?: (done: () => void) => void } }
}

export const toLatLng = (maps: KakaoMaps, p: Point): KLatLng => new maps.LatLng(p.lat, p.lng)

/** 카카오 점 → 앱 점(소수 6자리, types/location Point) */
export const fromLatLng = (p: KLatLng): Point => ({ lat: round6(p.getLat()), lng: round6(p.getLng()) })
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/**
 * 앱 색 토큰(globals.css :root의 --이름) 값. 카카오 원·다각형은 색 글자를 받는다 → 토큰을 그 자리에서 읽는다(색 글자를 코드에 두지 않는다).
 * 못 읽으면 undefined — 카카오 기본 색으로 그린다
 */
export function tokenColor(name: `--${string}`): string | undefined {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || undefined
}
