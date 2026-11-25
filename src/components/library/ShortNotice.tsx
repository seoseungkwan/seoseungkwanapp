'use client'

import { useCallback, useEffect, useState } from 'react'

// 짧은 알림(spec library '화면 글자' — 다시 읽었어요. · 올리기를 멈췄어요. 아무것도 올라가지 않았어요. · {이름} 파일을 지웠어요., 시안 .toast).
// 아래 가운데에 2.6초(시안 값) 떴다 사라진다. 새 알림은 앞 알림을 바꾸고 시간을 새로 센다. 올린 뒤 초록 상자는 이것이 아니다(LibraryScreen)

export const NOTICE_MS = 2600

export type Notice = { text: string; n: number }

/** 화면이 쥐는 알림 상태: say(글)로 띄우고 NOTICE_MS 뒤 저절로 지운다 */
export function useShortNotice() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const say = useCallback((text: string) => setNotice((prev) => ({ text, n: (prev?.n ?? 0) + 1 })), [])
  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])
  return { notice, say }
}

export function ShortNotice({ notice }: { notice: Notice | null }) {
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
