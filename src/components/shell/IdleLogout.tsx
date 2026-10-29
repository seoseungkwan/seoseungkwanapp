'use client'

import { useEffect } from 'react'
import { startIdleLogout } from '@/lib/auth/idle'
import { supabaseBrowser } from '@/lib/supabase/browser'

const IDLE_MS = 30 * 60 * 1000
const CHANNEL_NAME = 'idle-logout' // 같은 브라우저의 탭끼리 '움직였다'만 나눈다(AC-010.2)

// SignOutButton과 같은 길: 끊기를 기다리고, 실패해도 /login을 새로 연다(메모리의 화면 상태까지 사라진다)
async function signOutAndLeave() {
  try {
    await supabaseBrowser().auth.signOut()
  } catch {
    // 끊기가 실패해도(인터넷·열쇠 없음) /login으로 간다. 오류 내용은 보이지 않는다
  }
  window.location.assign('/login')
}

// 앱 화면에 하나 둔다. 아무것도 그리지 않고, 떠나면(unmount) 시계·이벤트·채널을 모두 푼다(AC-010.3)
export function IdleLogout() {
  useEffect(() => {
    // BroadcastChannel이 없는 오래된 브라우저는 이 탭의 움직임만 센다
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : undefined
    return startIdleLogout({
      timeoutMs: IDLE_MS,
      onIdle: () => void signOutAndLeave(),
      target: window,
      doc: document,
      channel,
    })
  }, [])
  return null
}
