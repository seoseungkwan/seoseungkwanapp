'use client'

import { useEffect, useState } from 'react'
import type { KakaoMaps, KakaoWindow } from './kakao'

// 카카오 지도 SDK 불러오기(specs/location REQ-7916 AC-7916.1, design.md 13절, ADR-044).
// 지도를 그리는 부품이 처음 쓸 때 한 번만 <script src=…sdk.js?appkey=…&autoload=false>를 넣고 kakao.maps.load를 기다린다.
// 열쇠가 비면 넣지 않는다. 받기 실패·지도 본체가 끝내 안 옴(CSP에 막힘 등)은 failed → 부품이 E-LOC-MAP을 그린다.
// 같은 페이지 안 여러 부품(지도·하늘 사진·로드뷰)은 같은 약속(promise)을 나눠 쓴다. 실패한 script는 지워 다음에 다시 부를 수 있게 한다

export const SDK_TIMEOUT_MS = 15_000
const SDK_BASE = 'https://dapi.kakao.com/v2/maps/sdk.js'

export const sdkUrl = (key: string) => `${SDK_BASE}?appkey=${encodeURIComponent(key)}&autoload=false`

/**
 * 지도 JavaScript 키(사이트 잠금된 공개 키, 비밀값 아님 — ADR-044). 빌드 때 글자로 들어간다:
 * Next는 process.env.NEXT_PUBLIC_KAKAO_MAP_KEY를 통째로 적은 곳만 바꿔 넣으므로 이 모양 그대로 둔다
 */
const mapKey = () => (process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? '').trim()

export type KakaoSdk = { state: 'no-key' } | { state: 'loading' } | { state: 'ready'; maps: KakaoMaps } | { state: 'failed' }

// 지금 페이지에 넣은 SDK script와 그 약속. script가 문서에서 빠지면(실패·시험 정리) 새로 부른다
let pending: { script: HTMLScriptElement; promise: Promise<KakaoMaps> } | null = null

function readyMaps(): KakaoMaps | null {
  const maps = (window as KakaoWindow).kakao?.maps
  return maps && typeof maps.Map === 'function' && typeof maps.LatLng === 'function' ? (maps as KakaoMaps) : null
}

function loadKakaoSdk(key: string): Promise<KakaoMaps> {
  if (pending?.script.isConnected) return pending.promise
  // 개발 새로 고침(HMR)처럼 이 파일만 다시 읽힌 때: SDK는 이미 문서에 있다
  const already = readyMaps()
  if (already) return Promise.resolve(already)

  const script = document.createElement('script')
  script.src = sdkUrl(key)
  script.async = true
  const promise = new Promise<KakaoMaps>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(fail, SDK_TIMEOUT_MS)
    function fail() {
      if (settled) return
      settled = true
      clearTimeout(timer)
      script.remove()
      if (pending?.script === script) pending = null
      reject(new Error('E-LOC-MAP'))
    }
    function done() {
      const maps = readyMaps()
      if (!maps) return fail()
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(maps)
    }
    script.addEventListener(
      'load',
      () => {
        const load = (window as KakaoWindow).kakao?.maps?.load
        if (typeof load !== 'function') return fail()
        load(done)
      },
      { once: true },
    )
    script.addEventListener('error', fail, { once: true })
  })
  pending = { script, promise }
  document.head.appendChild(script)
  return promise
}

export function useKakaoSdk(): KakaoSdk {
  const key = mapKey()
  const [sdk, setSdk] = useState<KakaoSdk>(key ? { state: 'loading' } : { state: 'no-key' })
  useEffect(() => {
    if (!key) {
      setSdk({ state: 'no-key' })
      return
    }
    let live = true
    setSdk({ state: 'loading' })
    loadKakaoSdk(key).then(
      (maps) => {
        if (live) setSdk({ state: 'ready', maps })
      },
      () => {
        if (live) setSdk({ state: 'failed' })
      },
    )
    return () => {
      live = false
    }
  }, [key])
  return sdk
}
