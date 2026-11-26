'use client'

import { useEffect, useMemo, useState } from 'react'
import { useViewing } from '@/components/shell/viewing'
import { browserGcalOffStore, type GcalOff, type GcalOffInfo, type GcalOffStore } from './gcalOff'

// 휴가 화면이 쓰는 구글 캘린더 연결 읽기(spec google-link REQ-8537). 이은 병원이면 { info, store }, 아니면 null.
// 잇지 않음·읽는 중·읽기 실패·Supabase 설정 없음·관리자가 다른 의원을 보는 중이면 null — 화면은 지금 글·동작 그대로다(AC-8537.3).
// 화면을 열 때 한 번 읽는다(같은 값을 다시 준다). 자료는 React 상태에만 둔다

export function useGcalOff(make: () => GcalOffStore | null = browserGcalOffStore): GcalOff | null {
  const viewing = useViewing() !== null
  const [store] = useState(() => (viewing ? null : make()))
  const [info, setInfo] = useState<GcalOffInfo | null>(null)

  useEffect(() => {
    if (store === null) return
    let current = true
    store.loadInfo().then(
      (read) => {
        if (current) setInfo(read)
      },
      () => {
        if (current) setInfo(null)
      },
    )
    return () => {
      current = false
    }
  }, [store])

  return useMemo(() => (store !== null && info !== null ? { info, store } : null), [store, info])
}
