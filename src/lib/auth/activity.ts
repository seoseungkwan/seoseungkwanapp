// 움직임 쿠키(app-active)와 Supabase 세션 쿠키를 다루는 순수 도우미(ADR-023). DOM·네트워크를 쓰지 않는다.
// 움직임 쿠키는 사용자가 움직일 때마다 31분으로 다시 쓰고, 아무도 안 쓰면 브라우저가 스스로 지운다.
// middleware는 "로그인했는데 이 쿠키가 없다"를 보면 로그인을 끊는다 → 서버는 시각을 비교하지 않는다(PC 시계와 상관없다)

export const ACTIVE_COOKIE = 'app-active'
// 30분 자동 로그아웃(IdleLogout) + 화면의 쓰기 간격 60초. 서버가 화면보다 먼저 끊지 않게 1분을 더한다
export const ACTIVE_MAX_AGE_SEC = 1860
export const ACTIVE_WRITE_EVERY_MS = 60_000

export type ActiveCookieOptions = { path: '/'; sameSite: 'lax'; httpOnly: false; maxAge: number; secure: boolean }

// NextResponse.cookies.set용(middleware·로그인 콜백). 화면이 document.cookie로 다시 써야 하니 httpOnly가 아니다
export function activeCookieOptions(secure: boolean): ActiveCookieOptions {
  return { path: '/', sameSite: 'lax', httpOnly: false, maxAge: ACTIVE_MAX_AGE_SEC, secure }
}

const withSecure = (cookie: string, secure: boolean) => (secure ? `${cookie}; Secure` : cookie)

// 화면(IdleLogout)이 document.cookie에 쓰는 글자
export function activeCookieString(secure: boolean): string {
  return withSecure(`${ACTIVE_COOKIE}=1; Max-Age=${ACTIVE_MAX_AGE_SEC}; Path=/; SameSite=Lax`, secure)
}

// document.cookie로 쿠키 하나를 지우는 글자(로그아웃)
export function expireCookieString(name: string, secure: boolean): string {
  return withSecure(`${name}=; Max-Age=0; Path=/; SameSite=Lax`, secure)
}

// supabase-js 기본 저장 이름 sb-<ref>-auth-token과 길면 나누는 조각 .0·.1…
// 코드 검증값(…-auth-token-code-verifier)은 아니다 — 로그인 콜백의 코드 교환에 쓴다
const SESSION_COOKIE = /^sb-[a-z0-9]+-auth-token(\.\d+)?$/

export function isSessionCookie(name: string): boolean {
  return SESSION_COOKIE.test(name)
}

// 'a=1; b=2' → ['a', 'b']. 값 안의 '='와 빈 조각도 다룬다
export function cookieNames(documentCookie: string): string[] {
  return documentCookie
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter((name) => name !== '')
}

// 화면은 60초에 한 번까지만 쓴다
export function shouldWrite(lastWriteMs: number | null, nowMs: number): boolean {
  return lastWriteMs === null || nowMs - lastWriteMs >= ACTIVE_WRITE_EVERY_MS
}
