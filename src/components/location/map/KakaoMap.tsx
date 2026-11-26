'use client'

import { useEffect, useRef, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { EARTH_R } from '@/lib/location/coords'
import type { LngLat } from '@/lib/location/regions'
import type { Point } from '@/types/location'
import { fromLatLng, toLatLng, tokenColor, type KEventType, type KLayer, type KMap, type KMouseEvent } from './kakao'
import { MapFallback } from './MapFallback'
import { useKakaoSdk } from './useKakaoSdk'

// 카카오 지도 부품(specs/location REQ-7916 AC-7916.1, design.md 13절). props·콜백만 받는다(읽기·저장·fetch 없음).
// 가운데 · 범위 원 · 표시(후보 파랑·경쟁 의원 주황·한의원 회색·둘레 다른 과 의원 연보라 작은 점·역 검은 네모, 범위 밖은 흐리게) · 동 다각형(점수 칸 색) · 찍기 · [지도]/[하늘 사진].
// 동이 있으면 동 전체에, 없고 범위가 있으면 범위 원에 맞춰 보여 준다. 열쇠가 비면 안내 글, SDK 실패는 E-LOC-MAP(MapFallback).
// 색은 앱 토큰만: 표시는 토큰 클래스, 원·다각형은 그 자리에서 읽은 토큰 값. 표시·동 이름은 글자로만 넣는다(HTML로 읽지 않음)

/** 의원 점은 map/marks.ts clinicMarks가 그날 값 의원과 과목 고르기로 가른다: 경쟁(rival) · 둘레로 보기 한의원(korean) · 그 밖 둘레로 보기(other) */
export type MarkKind = 'candidate' | 'rival' | 'korean' | 'other' | 'station'
/** 지도 표시 하나. label: 후보는 표시 안 글자(A 등), 역은 옆 이름, 의원은 마우스를 올리면 보이는 이름. outside = 범위 밖(흐리게) */
export type MapMark = { id: string; kind: MarkKind; at: Point; label: string; outside?: boolean }
/** 동 다각형 하나(동 경계 파일 모양 그대로 [경도, 위도]). tone = 점수 칸 0~4(연한 → 진한 파랑), text = 마우스를 올리면 이름 아래 뜨는 글(점수 등) */
export type MapArea = {
  id: string
  name: string
  rings: LngLat[][]
  center: LngLat
  tone: 0 | 1 | 2 | 3 | 4
  text?: string
  selected?: boolean
}
export type MapView = 'map' | 'sky'

export type KakaoMapProps = {
  /** 지도 묶음 이름(읽기 도우미) */
  label: string
  center: Point
  /** 범위 원 반지름(m). 없으면 원을 그리지 않는다 */
  radiusM?: number | null
  marks?: readonly MapMark[]
  areas?: readonly MapArea[]
  /** 처음 보기. 하늘 사진 = 길 이름이 얹힌 하늘 사진(카카오 HYBRID) */
  view?: MapView
  /** 높이(px) */
  height?: number
  /** 지도를 찍으면 그 점(소수 6자리). 없으면 찍기를 듣지 않는다 */
  onPick?: (at: Point) => void
  /** 동 다각형을 누르면 그 동 id */
  onArea?: (id: string) => void
}

// 처음 확대 단계(카카오 1 가까움 ~ 14 멂). 범위·동이 없을 때만 그대로 쓴다
const START_LEVEL = 4
const TONE_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const
// 겹치면 위: 후보 → 역 → 경쟁 의원 → 한의원 → 둘레 다른 과 의원(작은 점이 가장 아래, 시안 miniMap 차례)
const Z: Record<MarkKind, number> = { candidate: 5, station: 4, rival: 3, korean: 2, other: 1 }
// Tailwind가 소스 글자에서 찾으므로 클래스는 통째로 적는다.
// 둘레 다른 과 의원 = 연보라 작은 점: 지도 전용 토큰 --map-other(연보라)·--map-other-ring(보라)(옛 예약 색 값 그대로, google-link design.md 10-1)
const DOT: Record<'rival' | 'korean' | 'other', string> = {
  rival: 'block size-2.5 rounded-full border border-surface bg-negative',
  korean: 'block size-2.5 rounded-full border border-surface bg-muted',
  other: 'block size-1.5 rounded-full bg-map-other ring-1 ring-map-other-ring/50',
}
const DIM = ' opacity-40'

function markElement(mark: MapMark): HTMLElement {
  const el = document.createElement('div')
  el.dataset.mark = mark.id
  el.dataset.kind = mark.kind
  el.title = mark.label
  const dim = mark.outside ? DIM : ''
  if (mark.kind === 'candidate') {
    el.className = `flex size-6 items-center justify-center rounded-full border-2 border-surface bg-accent text-caption font-semibold text-surface${dim}`
    el.textContent = mark.label
  } else if (mark.kind === 'station') {
    el.className = `flex items-center gap-1 whitespace-nowrap${dim}`
    const square = document.createElement('span')
    square.dataset.shape = 'square'
    square.className = 'block size-3 border border-surface bg-ink'
    const name = document.createElement('span')
    name.className = 'rounded-control bg-surface px-1 text-caption font-medium text-ink'
    name.textContent = mark.label
    el.append(square, name)
  } else {
    el.className = `${DOT[mark.kind]}${dim}`
  }
  return el
}

// 동 이름·점수 글: 마우스를 올린 동 위에만 뜬다(TASK-89). 마우스 점 위쪽 8px에 떠서 마우스를 가리지 않고, 마우스를 받지 않는다
function areaTip(area: MapArea): HTMLElement {
  const el = document.createElement('div')
  el.dataset.area = area.id
  el.className =
    'pointer-events-none mb-2 flex flex-col items-center whitespace-nowrap rounded-control border border-line bg-surface px-2 py-1 text-caption text-ink shadow-float'
  const name = document.createElement('span')
  name.className = 'font-semibold'
  name.textContent = area.name
  el.append(name)
  if (area.text) {
    const text = document.createElement('span')
    text.className = 'font-medium'
    text.textContent = area.text
    el.append(text)
  }
  return el
}

// 범위 원을 감싼 네모의 남서·북동(위도 1m = 180 / (π·R)도, 경도는 cos(위도)로 나눔)
function circleCorners(c: Point, r: number): [Point, Point] {
  const dLat = (r * 180) / (Math.PI * EARTH_R)
  const dLng = dLat / Math.cos((c.lat * Math.PI) / 180)
  return [
    { lat: c.lat - dLat, lng: c.lng - dLng },
    { lat: c.lat + dLat, lng: c.lng + dLng },
  ]
}

export function KakaoMap({
  label,
  center,
  radiusM = null,
  marks = [],
  areas = [],
  view: startView = 'map',
  height = 360,
  onPick,
  onArea,
}: KakaoMapProps) {
  const sdk = useKakaoSdk()
  const maps = sdk.state === 'ready' ? sdk.maps : null
  const box = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<KMap | null>(null)
  const [broken, setBroken] = useState(false)
  const [view, setView] = useState<MapView>(startView)

  // 지금 props. 아래 그리기는 값이 바뀐 때만(글자 열쇠로) 다시 하고, 그때 여기서 읽는다 — 부르는 쪽이 매번 새 배열·함수를 줘도 다시 그리지 않는다
  const latest = useRef({ center, marks, areas, onPick, onArea })
  useEffect(() => {
    latest.current = { center, marks, areas, onPick, onArea }
  })
  const { lat, lng } = center
  const marksKey = JSON.stringify(marks)
  const fitKey = areas.map((a) => a.id).join('|')
  const areasKey = JSON.stringify(areas.map((a) => [a.id, a.tone, a.selected === true, a.text ?? '', a.name, a.rings.length]))
  const picking = onPick !== undefined
  const areaClicks = onArea !== undefined

  // 지도 하나(개발 StrictMode가 효과를 두 번 돌려도 같은 칸에 또 만들지 않는다)
  useEffect(() => {
    const el = box.current
    if (!maps || !el || map) return
    let made: KMap
    try {
      made = new maps.Map(el, { center: toLatLng(maps, latest.current.center), level: START_LEVEL })
    } catch {
      setBroken(true)
      return
    }
    setMap(made)
  }, [maps, map])

  // 칸 크기가 바뀌면(숨은 탭에서 처음 만든 때 등) 카카오에 다시 재게 한다
  useEffect(() => {
    const el = box.current
    if (!map || !el || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => map.relayout())
    watch.observe(el)
    return () => watch.disconnect()
  }, [map])

  // 보여 줄 곳: 동 전체 → 범위 원 → 가운데
  useEffect(() => {
    if (!map || !maps) return
    const at = { lat, lng }
    const points: Point[] = latest.current.areas.length
      ? latest.current.areas.flatMap((a) => a.rings.flat().map(([x, y]) => ({ lat: y, lng: x })))
      : radiusM
        ? circleCorners(at, radiusM)
        : []
    if (points.length === 0) {
      map.setCenter(toLatLng(maps, at))
      return
    }
    const bounds = new maps.LatLngBounds()
    for (const p of points) bounds.extend(toLatLng(maps, p))
    map.setBounds(bounds)
  }, [map, maps, lat, lng, radiusM, fitKey])

  // 지도 / 하늘 사진
  useEffect(() => {
    if (!map || !maps) return
    map.setMapTypeId(view === 'sky' ? maps.MapTypeId.HYBRID : maps.MapTypeId.ROADMAP)
  }, [map, maps, view])

  // 범위 원
  useEffect(() => {
    if (!map || !maps || !radiusM) return
    const accent = tokenColor('--accent')
    const circle = new maps.Circle({
      center: toLatLng(maps, { lat, lng }),
      radius: radiusM,
      strokeWeight: 2,
      strokeOpacity: 1,
      strokeStyle: 'dashed',
      fillOpacity: 0.07,
      ...(accent ? { strokeColor: accent, fillColor: accent } : {}),
    })
    circle.setMap(map)
    return () => circle.setMap(null)
  }, [map, maps, lat, lng, radiusM])

  // 표시
  useEffect(() => {
    if (!map || !maps) return
    const layers = latest.current.marks.map((mark) => {
      const overlay = new maps.CustomOverlay({
        position: toLatLng(maps, mark.at),
        content: markElement(mark),
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: Z[mark.kind],
      })
      overlay.setMap(map)
      return overlay
    })
    return () => {
      for (const layer of layers) layer.setMap(null)
    }
  }, [map, maps, marksKey])

  // 동 다각형 + 마우스를 올리면 뜨는 이름·점수
  useEffect(() => {
    if (!map || !maps) return
    const layers: KLayer[] = []
    const listens: { target: KLayer; type: KEventType; handler: (e: KMouseEvent) => void }[] = []
    const listen = (target: KLayer, type: KEventType, handler: (e: KMouseEvent) => void) => {
      maps.event.addListener(target, type, handler)
      listens.push({ target, type, handler })
    }
    for (const area of latest.current.areas) {
      const fill = tokenColor(TONE_TOKENS[area.tone])
      const stroke = tokenColor(area.selected ? '--ink' : '--surface')
      const polygon = new maps.Polygon({
        path: area.rings.map((ring) => ring.map(([x, y]) => new maps.LatLng(y, x))),
        strokeWeight: area.selected ? 3 : 1,
        strokeOpacity: 1,
        fillOpacity: 0.75,
        ...(fill ? { fillColor: fill } : {}),
        ...(stroke ? { strokeColor: stroke } : {}),
      })
      polygon.setMap(map)
      layers.push(polygon)
      if (areaClicks) listen(polygon, 'click', () => latest.current.onArea?.(area.id))
      // 이름·점수 글은 늘 띄우지 않는다 — 작은 동이 모이면 글자가 겹쳐 깨져 보인다(사용자 2026-11-23 '글자 없이 올리면 보기', TASK-89)
      const tip = new maps.CustomOverlay({
        position: new maps.LatLng(area.center[1], area.center[0]),
        content: areaTip(area),
        xAnchor: 0.5,
        yAnchor: 1,
        zIndex: 10,
      })
      layers.push(tip)
      listen(polygon, 'mouseover', (e) => {
        tip.setPosition(e.latLng)
        tip.setMap(map)
      })
      listen(polygon, 'mousemove', (e) => tip.setPosition(e.latLng))
      listen(polygon, 'mouseout', () => tip.setMap(null))
    }
    return () => {
      for (const { target, type, handler } of listens) maps.event.removeListener(target, type, handler)
      for (const layer of layers) layer.setMap(null)
    }
  }, [map, maps, areasKey, areaClicks])

  // 찍기
  useEffect(() => {
    if (!map || !maps || !picking) return
    const handler = (e: KMouseEvent) => latest.current.onPick?.(fromLatLng(e.latLng))
    maps.event.addListener(map, 'click', handler)
    return () => maps.event.removeListener(map, 'click', handler)
  }, [map, maps, picking])

  const failed = sdk.state === 'failed' || broken
  const showMap = (sdk.state === 'loading' || sdk.state === 'ready') && !broken
  return (
    <div
      role="group"
      aria-label={label}
      aria-busy={sdk.state === 'loading' || undefined}
      className="relative overflow-clip rounded-control border border-line bg-canvas"
      style={{ height }}
    >
      {showMap ? <div ref={box} className="absolute inset-0 z-0" /> : null}
      {map && !broken ? <ViewSwitch view={view} onChange={setView} /> : null}
      {sdk.state === 'no-key' ? <MapFallback kind="no-key" /> : null}
      {failed ? <MapFallback kind="failed" /> : null}
    </div>
  )
}

const VIEWS: [MapView, string][] = [
  ['map', '지도'],
  ['sky', '하늘 사진'],
]

function ViewSwitch({ view, onChange }: { view: MapView; onChange: (v: MapView) => void }) {
  return (
    <div role="group" aria-label="지도 보기" className="absolute top-2 left-2 z-10 flex rounded-control border border-line-strong bg-surface shadow-float">
      {VIEWS.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={`h-8 cursor-pointer px-3 text-small font-medium first:rounded-l-control last:rounded-r-control ${ds.focusRing} ${
            view === v ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-canvas'
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
