'use client'

import { useEffect, useState } from 'react'
import { badgeLabel, badgeText } from '@/lib/notices/view'
import { NOTICES_CHANGED, unreadCount } from '@/lib/storage/notices'

// 탭 띠 '고시·공지' 옆 안 읽은 관련 글 수 (specs/notices REQ-7423 AC-7423.3, 기본값 10, design 10절 '탭 숫자', 시안 .badge).
// 수는 lib/storage/notices의 unreadCount(RLS, 꼭 볼 글 포함)로만 읽는다. 열 때 한 번, 창에 notices:changed(읽음·낱말이 바뀜)가 올 때와
// 창이 다시 보일 때마다 다시 읽고, 늦게 온 앞 읽기의 답은 버린다. 0·실패·읽는 중이면 아무것도 그리지 않는다.
// 보이는 숫자(100 이상은 99+)는 화면 읽기에서 숨기고, 화면 읽기에는 실제 수 글을 따로 준다.
// TabBar가 원장 탭 띠에만 놓는다 — 데스크 탭 띠에는 이 부품이 없어 읽지도 그리지도 않는다

// 시안 .badge: 18px 높이·최소 18px 폭·좌우 5px 안팎, 둥근 accent 바탕에 흰 글자 600, 가운데. 이름과는 6px 띄운다(시안 .tab gap)
const DOT =
  'ml-1.5 inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-accent px-1.25 text-caption leading-4.5 font-semibold text-surface tabular-nums'

export function NoticeBadge() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    let seq = 0
    const read = () => {
      const mine = ++seq
      unreadCount()
        .catch(() => 'failed' as const)
        .then((n) => {
          if (alive && mine === seq) setCount(n === 'failed' ? null : n)
        })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') read()
    }
    read()
    window.addEventListener(NOTICES_CHANGED, read)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.removeEventListener(NOTICES_CHANGED, read)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const text = count === null ? null : badgeText(count)
  if (count === null || text === null) return null
  return (
    <>
      <span aria-hidden="true" className={DOT}>
        {text}
      </span>
      <span className="sr-only">{badgeLabel(count)}</span>
    </>
  )
}
