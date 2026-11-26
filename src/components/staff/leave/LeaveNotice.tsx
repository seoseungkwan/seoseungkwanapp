'use client'

import { useCallback, useEffect, useState } from 'react'

// 휴가 화면 짧은 알림(spec google-link AC-8537.2 '휴가를 넣었어요. …', 시안 .toast — 아래 가운데에 잠깐 떴다 사라진다).
// 휴가 넣기 칸을 닫아도 남도록 화면(LeaveScreen)이 쥔다. 새 알림은 앞 알림을 바꾸고 시간을 새로 센다

export const LEAVE_NOTICE_MS = 3600 // 시안 toast 시간

export type LeaveNoticeState = { text: string; n: number }

/** 화면이 쥐는 알림 상태: say(글)로 띄우고 LEAVE_NOTICE_MS 뒤 저절로 지운다 */
export function useLeaveNotice() {
  const [notice, setNotice] = useState<LeaveNoticeState | null>(null)
  const say = useCallback((text: string) => setNotice((prev) => ({ text, n: (prev?.n ?? 0) + 1 })), [])
  useEffect(() => {
    if (notice === null) return
    const timer = setTimeout(() => setNotice(null), LEAVE_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])
  return { notice, say }
}

export function LeaveNotice({ notice }: { notice: LeaveNoticeState | null }) {
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
