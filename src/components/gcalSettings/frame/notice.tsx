'use client'

import { useCallback, useEffect, useState } from 'react'

// 설정 › 구글 캘린더 짧은 알림(시안 .toast — 아래 가운데에 잠깐 떴다 사라진다). 새 알림은 앞 알림을 바꾸고 시간을 새로 센다.
// 글은 부르는 화면이 notes-calendar 글 그대로 준다. 오류는 알림이 아니라 오류 카드(ErrorCard)다

export const GCAL_NOTICE_MS = 3600 // 시안 toast 시간

export type GcalNoticeState = { text: string; n: number }

/** 화면이 쥐는 알림 상태: say(글)로 띄우고 GCAL_NOTICE_MS 뒤 저절로 지운다 */
export function useGcalNotice() {
  const [notice, setNotice] = useState<GcalNoticeState | null>(null)
  const say = useCallback((text: string) => setNotice((prev) => ({ text, n: (prev?.n ?? 0) + 1 })), [])
  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), GCAL_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])
  return { notice, say }
}

export function GcalNotice({ notice }: { notice: GcalNoticeState | null }) {
  if (notice === null) return null
  return (
    <div
      key={notice.n}
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-60 w-max max-w-[calc(100%-32px)] -translate-x-1/2 rounded-float bg-ink px-4 py-2.5 text-small text-surface shadow-float"
    >
      {notice.text}
    </div>
  )
}
