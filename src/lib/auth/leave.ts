import { supabaseBrowser } from '@/lib/supabase/browser'
import { ACTIVE_COOKIE, cookieNames, expireCookieString, isSessionCookie } from './activity'

// 로그아웃 한 곳 — [로그아웃] 단추(SignOutButton)와 30분 자동 로그아웃(IdleLogout)이 함께 쓴다. 브라우저에서만 부른다.
// signOut이 실패하거나 멈춰도 그 PC에 세션 흔적을 남기지 않고, 같은 브라우저의 다른 탭도 함께 내보낸다

export const SIGNOUT_CHANNEL = 'auth-signout' // '움직였다'를 나르는 idle-logout 채널과 섞지 않는다
export const SIGNOUT_MESSAGE = 'signout'
export const SIGNOUT_WAIT_MS = 5_000 // 응답 없이 끝나지 않으면(와이파이가 반쯤 끊김 등) 더 기다리지 않는다

let leaving = false

// 이 탭이 signOutAndLeave()로 signOut을 기다리는 중인가. 그동안 온 다른 탭의 signout 소식은 IdleLogout이 이것으로 무시한다
export function isLeaving(): boolean {
  return leaving
}

export async function signOutAndLeave(): Promise<void> {
  // signOut을 기다리는 동안 단추를 두 번 눌러도 signOut은 한 번
  if (leaving) return
  leaving = true

  // 1. 기본(global) 로그아웃 → 갱신 토큰까지 끊는다. 돌려준 오류도 보지 않고, 던져도 삼킨다(오류 내용은 보이지 않는다)
  let timer: ReturnType<typeof setTimeout> | undefined
  const signedOut = (async () => {
    try {
      await supabaseBrowser().auth.signOut()
    } catch {
      // 인터넷 끊김·열쇠 없음. 아래에서 쿠키를 직접 지운다
    }
  })()
  const waited = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SIGNOUT_WAIT_MS)
  })
  await Promise.race([signedOut, waited])
  clearTimeout(timer) // signOut이 먼저 끝났으면 남은 타이머를 지운다

  // 2. 결과와 상관없이 세션 쿠키(조각 포함)와 움직임 쿠키를 직접 지운다. 다른 쿠키(코드 검증값 등)는 남긴다
  const secure = window.location.protocol === 'https:'
  for (const name of cookieNames(document.cookie)) {
    if (isSessionCookie(name) || name === ACTIVE_COOKIE) document.cookie = expireCookieString(name, secure)
  }

  // 3. 같은 브라우저의 다른 탭에 알린다. BroadcastChannel이 없거나 막혀도 로그아웃은 된다
  if (typeof BroadcastChannel === 'function') {
    try {
      const channel = new BroadcastChannel(SIGNOUT_CHANNEL)
      channel.postMessage(SIGNOUT_MESSAGE)
      channel.close()
    } catch {
      // 알림 없이 이 탭만 나간다
    }
  }

  // 4. /login을 새로 연다 → 메모리에 있던 화면 상태까지 사라진다
  window.location.assign('/login')
  // 보낸 뒤 '나가는 중'을 푼다 — 뒤로 가기로 되살아난 화면(bfcache)에서도 다시 로그아웃할 수 있게
  leaving = false
}
