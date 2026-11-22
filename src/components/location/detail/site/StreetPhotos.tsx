'use client'

import { SourceLine } from '@/components/location/common/SourceLine'
import { KakaoMap, type MapMark } from '@/components/location/map/KakaoMap'
import { Roadview } from '@/components/location/map/Roadview'
import type { Point, SourceId, YesNo } from '@/types/location'
import { Picks, Section, type HeadProp, type HowProp } from './parts'

// 후보 자세히 › 거리 사진(specs/location AC-7909.5, 시안 ?s=candidate 'photo' 묶음).
// 왼쪽 로드뷰(그 점 50m 안 가장 가까운 거리 사진, map/Roadview) · 오른쪽 하늘 사진(map/KakaoMap 하늘 사진 보기, 후보 표시) · 출처 줄 · 간판 보임 고르기.
// 카카오 것(사진·지도)은 열 때마다 새로 받고 저장하지 않는다(ADR-044). 저장하는 것은 사용자가 고른 간판 보임뿐 — 콜백(onSign)으로 넘긴다

export type StreetPhotosProps = HeadProp & HowProp & {
  /** 후보 점(사용자가 고른 점) */
  at: Point
  /** 하늘 사진의 후보 표시 안 글자(시안 'A' 등) */
  markLabel?: string
  /** 저장된 간판 보임(location_candidates.sign_visible), 안 골랐으면 null */
  sign: YesNo | null
  /** 다른 값을 고르면 그 값(보여요 yes · 가려요 no · 모르겠어요 unknown) */
  onSign: (v: YesNo) => void
  onOpenSource?: (id: SourceId) => void
}

const SIGN_OPTIONS = [
  ['yes', '보여요'],
  ['no', '가려요'],
  ['unknown', '모르겠어요'],
] as const

const PHOTO_HEIGHT = 240
const CAPTION = 'mt-1 text-caption text-muted'

export function StreetPhotos({ at, markLabel = '', sign, onSign, onOpenSource, head, howCtx, howOpen, onHow }: StreetPhotosProps) {
  const marks: MapMark[] = [{ id: 'candidate', kind: 'candidate', at, label: markLabel }]
  return (
    <Section id="photo" title="거리 사진" aside="가지 않고 둘레를 봐요" head={head} howCtx={howCtx} howOpen={howOpen} onHow={onHow}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-4">
        <div className="min-w-0">
          <Roadview at={at} label="로드뷰" height={PHOTO_HEIGHT} />
          <p className={CAPTION}>마우스로 끌어 둘레를 돌려 봐요</p>
        </div>
        <div className="min-w-0">
          <KakaoMap label="하늘 사진" center={at} marks={marks} view="sky" height={PHOTO_HEIGHT} />
          <p className={CAPTION}>건물 모양·주차장 들어가는 길·둘레 건물</p>
        </div>
      </div>
      <SourceLine src="kakao-map" onOpen={onOpenSource} />
      <Picks label="길에서 간판 자리가 보이나요?" hint="로드뷰나 보러 가서 직접 골라요" group="간판 보임" options={SIGN_OPTIONS} value={sign} onPick={onSign} />
    </Section>
  )
}
