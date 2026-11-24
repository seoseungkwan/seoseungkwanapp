'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { stopAdminView } from '@/lib/auth/adminView'
import { startIdleLogout } from '@/lib/auth/idle'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { dropViewKey, readViewKey } from '@/lib/supabase/viewKey'

const IDLE_MS = 30 * 60 * 1000
const WARN_MS = 60_000 // 로그아웃 1분 전에 안내한다(ui-90 REQ-418)
const EXTENDED_MS = 3000 // [계속 쓰기] 뒤 "다시 30분…" 글이 보이는 시간
const CHANNEL_NAME = 'idle-logout' // 같은 브라우저의 탭끼리 '움직였다'만 나눈다(AC-010.2)
// [계속 쓰기]를 누른 움직임인지 보는 이벤트. 시계와 같은 창·capture에 먼저 붙여, 시계의 onActive보다 먼저 불린다
const PRESS_EVENTS = ['pointerdown', 'keydown'] as const
const LISTEN = { capture: true, passive: true }

// 안내 자리: 화면 아래에 붙는 떠 있는 층. 폰은 좌우·아래 12px, 768px 이상은 오른쪽 아래 24px·폭 360px.
// 위쪽 띠(z-10)·확인 창(z-30)보다 위 — 곧 로그아웃한다는 글은 가려지지 않는다.
// 앱 틀(.app-ui) 밖 형제라 자기 뿌리에 app-ui를 준다: 없으면 문단 기본 여백(1em)이 남고 단추가 브라우저 기본 글꼴로 그려진다(가늘어 보임)
const NOTICE = `app-ui ${ds.layer} fixed right-3 bottom-3 left-3 z-40 p-4 md:right-6 md:bottom-6 md:left-auto md:w-90`

type Notice = 'none' | 'warn' | 'extended'

// SignOutButton과 같은 길: 보는 중이면 보기를 끝내고(stopAdminView 한 번, 실패해도) 보기 쿠키를 지우고(admin-view AC-8006.5)
// 끊기를 기다리고, 실패해도 /login을 새로 연다(메모리의 화면 상태까지 사라진다)
async function signOutAndLeave() {
  if (readViewKey(document.cookie) !== null) await stopAdminView().catch(() => {})
  dropViewKey()
  try {
    await supabaseBrowser().auth.signOut()
  } catch {
    // 끊기가 실패해도(인터넷·열쇠 없음) /login으로 간다. 오류 내용은 보이지 않는다
  }
  window.location.assign('/login')
}

// 앱 화면에 하나 둔다. 29분 동안 움직임이 없으면 1분 전 안내를 그리고(초점은 옮기지 않는다), 30분이면 로그아웃한다.
// 떠나면(unmount) 시계·이벤트·채널을 모두 푼다(AC-010.3·AC-418.4). 브라우저 저장소는 쓰지 않는다
export function IdleLogout() {
  const [notice, setNotice] = useState<Notice>('none')
  const continueRef = useRef<HTMLButtonElement>(null)
  const pressedContinue = useRef(false)

  useEffect(() => {
    // BroadcastChannel이 없는 오래된 브라우저는 이 탭의 움직임만 센다
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : undefined
    const markPress = (e: Event) => {
      pressedContinue.current = e.target instanceof Node && continueRef.current?.contains(e.target) === true
    }
    for (const type of PRESS_EVENTS) window.addEventListener(type, markPress, LISTEN)
    const stop = startIdleLogout({
      timeoutMs: IDLE_MS,
      warnMs: WARN_MS,
      onWarn: () => setNotice('warn'),
      // 안내 뒤 첫 움직임. [계속 쓰기]로 닫혔을 때만 "다시 30분…" 글을 보인다
      onActive: () => {
        setNotice(pressedContinue.current ? 'extended' : 'none')
        pressedContinue.current = false
      },
      onIdle: () => void signOutAndLeave(),
      target: window,
      doc: document,
      channel,
    })
    return () => {
      stop()
      for (const type of PRESS_EVENTS) window.removeEventListener(type, markPress, LISTEN)
    }
  }, [])

  useEffect(() => {
    if (notice !== 'extended') return
    const timer = setTimeout(() => setNotice('none'), EXTENDED_MS)
    return () => clearTimeout(timer)
  }, [notice])

  return (
    <>
      {notice === 'warn' && (
        <div role="alert" className={NOTICE}>
          <p className="flex items-center gap-2 text-subtitle font-semibold text-ink">
            <Icon name="clock" className="shrink-0 text-warning" />
            1분 뒤 자동으로 로그아웃돼요
          </p>
          <p className="mt-1 text-small text-ink-2">30분 동안 아무것도 누르지 않았어요. 환자 정보를 지키려고 곧 로그아웃해요.</p>
          <button
            ref={continueRef}
            type="button"
            // 보통은 누름 시작(pointerdown·keydown)이 이미 시계를 다시 세게 해 이 단추가 사라진다.
            // click만 오는 경우(화면 읽기 프로그램)는 이 단추의 누름으로 쳐 같은 길로 보낸다
            onClick={(e) => e.currentTarget.dispatchEvent(new Event('pointerdown', { bubbles: true }))}
            className={`${ds.button.primary} mt-3 max-md:w-full`}
          >
            계속 쓰기
          </button>
        </div>
      )}
      {/* 결과 글 자리는 처음부터 있어 화면 읽기가 바뀐 글을 읽어 준다. 비어 있으면 화면에 안 보인다 */}
      <p role="status" className={`${NOTICE} text-small text-ink-2 empty:sr-only`}>
        {notice === 'extended' && '다시 30분 동안 쓸 수 있어요.'}
      </p>
    </>
  )
}
