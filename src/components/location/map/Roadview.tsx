'use client'

import { useEffect, useRef, useState } from 'react'
import type { Point } from '@/types/location'
import { toLatLng, type KakaoMaps } from './kakao'
import { MapFallback } from './MapFallback'
import { useKakaoSdk } from './useKakaoSdk'

// 로드뷰(거리 사진) 부품(specs/location REQ-7916 AC-7916.1·AC-7909.5, design.md 13절). props만 받는다(읽기·저장 없음).
// 그 점 50m 안 가장 가까운 거리 사진(RoadviewClient.getNearestPanoId)을 띄우고, 없으면 그 자리에 없음 글이다.
// 카카오에서 받은 것(사진 번호)은 어디에도 두지 않는다(ADR-045)

export const NO_ROADVIEW = '이 자리 50m 안에는 거리 사진이 없어요'
const PANO_RADIUS_M = 50

type Found = 'asking' | 'yes' | 'none' | 'broken'

export function Roadview({ at, label = '거리 사진', height = 240 }: { at: Point; label?: string; height?: number }) {
  const sdk = useKakaoSdk()
  const maps = sdk.state === 'ready' ? sdk.maps : null
  const box = useRef<HTMLDivElement>(null)
  const viewer = useRef<InstanceType<KakaoMaps['Roadview']> | null>(null)
  const [found, setFound] = useState<Found>('asking')

  useEffect(() => {
    const el = box.current
    if (!maps || !el) return
    let live = true
    setFound('asking')
    try {
      const position = toLatLng(maps, { lat: at.lat, lng: at.lng })
      new maps.RoadviewClient().getNearestPanoId(position, PANO_RADIUS_M, (panoId) => {
        if (!live) return
        if (typeof panoId !== 'number') {
          setFound('none')
          return
        }
        try {
          viewer.current ??= new maps.Roadview(el)
          viewer.current.setPanoId(panoId, position)
          setFound('yes')
        } catch {
          setFound('broken')
        }
      })
    } catch {
      setFound('broken')
    }
    return () => {
      live = false
    }
  }, [maps, at.lat, at.lng])

  const failed = sdk.state === 'failed' || found === 'broken'
  const busy = sdk.state === 'loading' || (sdk.state === 'ready' && found === 'asking')
  return (
    <div
      role="group"
      aria-label={label}
      aria-busy={busy || undefined}
      className="relative overflow-clip rounded-control border border-line bg-canvas"
      style={{ height }}
    >
      {/* 사진 칸은 늘 펼쳐 둔다(숨기면 카카오 뷰어 크기가 0이 된다). 없음 글은 그 위에 덮는다 */}
      {sdk.state === 'loading' || sdk.state === 'ready' ? <div ref={box} className="absolute inset-0 z-0" /> : null}
      {found === 'none' && !failed ? (
        <p className="absolute inset-0 z-10 flex items-center justify-center bg-line p-4 text-center text-small text-ink-2">
          {NO_ROADVIEW}
        </p>
      ) : null}
      {sdk.state === 'no-key' ? <MapFallback kind="no-key" /> : null}
      {failed ? (
        <div className="absolute inset-0 z-10">
          <MapFallback kind="failed" />
        </div>
      ) : null}
    </div>
  )
}
