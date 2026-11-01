'use client'

import { useEffect } from 'react'
import { activeCookieString, shouldWrite } from '@/lib/auth/activity'
import { startIdleLogout } from '@/lib/auth/idle'
import { isLeaving, SIGNOUT_CHANNEL, SIGNOUT_MESSAGE, signOutAndLeave } from '@/lib/auth/leave'

const IDLE_MS = 30 * 60 * 1000
const CHANNEL_NAME = 'idle-logout' // 같은 브라우저의 탭끼리 '움직였다'만 나눈다(AC-010.2)

// 앱 화면에 하나 둔다. 아무것도 그리지 않고, 떠나면(unmount) 시계·이벤트·두 채널을 모두 푼다(AC-010.3·AC-403.3)
export function IdleLogout() {
  useEffect(() => {
    // BroadcastChannel이 없는 오래된 브라우저는 이 탭의 움직임만 센다
    const hasChannel = typeof BroadcastChannel === 'function'
    const channel = hasChannel ? new BroadcastChannel(CHANNEL_NAME) : undefined

    // 다른 탭이 로그아웃했다는 소식(AC-403.3). signOut은 보낸 탭이 했다 → /login만 새로 연다.
    // 이 탭이 signOut을 기다리는 중이면(isLeaving) 다른 탭의 소식은 무시한다 — 이 탭은 스스로 /login으로 간다
    const signoutChannel = hasChannel ? new BroadcastChannel(SIGNOUT_CHANNEL) : undefined
    if (signoutChannel) {
      signoutChannel.onmessage = (e: MessageEvent) => {
        if (e.data === SIGNOUT_MESSAGE && !isLeaving()) window.location.assign('/login')
      }
    }

    // 이 탭에서 움직이면 움직임 쿠키를 31분으로 다시 쓴다. 60초에 한 번까지만(AC-401.8). https면 Secure(AC-405.2)
    let lastWrite: number | null = null
    const stop = startIdleLogout({
      timeoutMs: IDLE_MS,
      onIdle: () => void signOutAndLeave(),
      onActive: () => {
        const now = Date.now()
        if (!shouldWrite(lastWrite, now)) return
        document.cookie = activeCookieString(window.location.protocol === 'https:')
        lastWrite = now
      },
      target: window,
      doc: document,
      channel,
    })

    return () => {
      stop()
      if (signoutChannel) {
        signoutChannel.onmessage = null
        signoutChannel.close()
      }
    }
  }, [])
  return null
}
