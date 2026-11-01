# 설계: 로그인 세션 보안 강화

## 개요
- 공용 PC에서 앱을 떠난 뒤 다음 사람이 그 세션으로 들어오는 길을 막는다. 지금 30분 자동 로그아웃은 앱 화면이 열려 있을 때만 도는 브라우저 시계라서, 탭이나 브라우저를 닫으면 400일짜리 세션 쿠키가 남는다(`docs/security/oauth-review-2026-11-01.md` W1)
- 방법: **움직임 쿠키** `app-active`(값 `1`, Max-Age 1860초)를 둔다. 서버(middleware)와 화면(`IdleLogout`)이 사용자가 움직일 때마다 다시 쓰고, 31분 동안 아무도 쓰지 않으면 **브라우저가 스스로 지운다**. middleware는 "로그인했는데 움직임 쿠키가 없다"를 보면 그 브라우저의 세션을 끊는다. 서버는 시각을 비교하지 않고 쿠키가 있는지만 본다 → PC 시계가 틀려도 상관없다
- 덧붙여 로그아웃이 실패하거나 멈춰도 쿠키를 직접 지우고 다른 탭도 함께 내보낸다(W4·W7). 가입·대기 화면에도 자동 로그아웃을 붙인다(W6). 구글 계정 선택을 늘 묻고(W2), 세션 쿠키에 Secure·콜백에 캐시 금지를 더한다(W5 중 쿠키·W8)

## 구성 요소 / 인터페이스

### `src/lib/auth/activity.ts` (새 파일, 순수 — DOM·네트워크 없음)
```ts
export const ACTIVE_COOKIE = 'app-active'
export const ACTIVE_MAX_AGE_SEC = 1860 // 30분 자동 로그아웃(IdleLogout) + 쓰기 간격 60초
export const ACTIVE_WRITE_EVERY_MS = 60_000
export type ActiveCookieOptions = { path: '/'; sameSite: 'lax'; httpOnly: false; maxAge: number; secure: boolean }
export function activeCookieOptions(secure: boolean): ActiveCookieOptions // NextResponse.cookies.set용
export function activeCookieString(secure: boolean): string // 'app-active=1; Max-Age=1860; Path=/; SameSite=Lax' (+ '; Secure')
export function expireCookieString(name: string, secure: boolean): string // '<name>=; Max-Age=0; Path=/; SameSite=Lax' (+ '; Secure')
export function isSessionCookie(name: string): boolean // /^sb-[a-z0-9]+-auth-token(\.\d+)?$/ — 코드 검증값 쿠키는 아니다
export function cookieNames(documentCookie: string): string[] // 'a=1; b=2' → ['a', 'b']
export function shouldWrite(lastWriteMs: number | null, nowMs: number): boolean // null이거나 60초 이상 지났으면 true
```

### `src/lib/supabase/middleware.ts` `updateSession(request)` (바꿈, 돌려주는 모양 그대로)
```ts
const secure = request.nextUrl.protocol === 'https:'
createServerClient(url, anonKey, { cookieOptions: { secure }, cookies: { …지금 그대로 } })
const { data } = await supabase.auth.getUser() // createServerClient와 getUser() 사이에 다른 코드를 두지 않는다(공식 안내)
const userId = data.user?.id ?? null
if (userId === null) return { response, userId }
if (request.nextUrl.pathname === '/auth/callback') return { response, userId } // 콜백이 새 세션과 움직임 쿠키를 만든다
if (!request.cookies.has(ACTIVE_COOKIE)) {
  try { await supabase.auth.signOut({ scope: 'local' }) } catch {} // 이 브라우저 세션만 서버에서 폐기. 오류 내용은 남기지 않는다
  // response는 setAll이 바꿔 끼웠을 수 있다 → signOut 뒤의 response에 지우기를 싣는다
  for (const { name } of request.cookies.getAll()) if (isSessionCookie(name)) response.cookies.set(name, '', { path: '/', maxAge: 0 })
  response.headers.set('Cache-Control', 'private, no-store')
  return { response, userId: null }
}
response.cookies.set(ACTIVE_COOKIE, '1', activeCookieOptions(secure))
return { response, userId }
```
- `src/middleware.ts`는 바꾸지 않는다. 지금도 리디렉트를 새로 만들 때 `response`의 쿠키와 캐시 금지 헤더를 옮긴다(`src/middleware.ts:15-20`) → `userId: null`이면 gate가 보호 경로를 `/login`으로 보내고 지우기가 함께 간다. AC-401.6은 이것을 시험으로 못박는다
- `signOut`이 실패해 요청 쪽에 쿠키가 남아도, 보호 경로는 `null`을 받으면 `/login`으로 간다(`src/lib/auth/gate.ts:21-22`) → 그 요청에서 앱 화면이 그려지지 않는다

### `src/lib/supabase/server.ts` `supabaseServer(options?)` (바꿈)
```ts
export async function supabaseServer({ secure = false }: { secure?: boolean } = {}): Promise<SupabaseClient>
// createServerClient(url, anonKey, { cookieOptions: { secure }, cookies: { …지금 그대로 } })
```
- 쿠키를 쓰는 곳은 로그인 콜백뿐이다(Server Component는 못 쓴다). `readMe()`는 지금처럼 인자 없이 부른다

### `src/app/auth/callback/route.ts` `GET` (바꿈)
- `secure = request.nextUrl.protocol === 'https:'` → `supabaseServer({ secure })`
- 성공: `/dashboard` 리디렉트에 `app-active`(`activeCookieOptions(secure)`)와 `Cache-Control: private, no-store`
- 실패: `/login?error=1` 리디렉트에 `Cache-Control: private, no-store`만. 그 밖은 지금 그대로(돌아갈 주소 쿼리를 읽지 않음, 오류 내용을 남기지 않음)

### `src/lib/supabase/browser.ts` `supabaseBrowser()` (바꿈)
- `createBrowserClient(url, anonKey, { cookieOptions: { secure: isHttps() } })`, `isHttps = () => typeof window !== 'undefined' && window.location.protocol === 'https:'`

### `src/lib/auth/leave.ts` (새 파일, 브라우저에서만 부른다)
```ts
export const SIGNOUT_CHANNEL = 'auth-signout'
export const SIGNOUT_MESSAGE = 'signout'
export const SIGNOUT_WAIT_MS = 5_000
export async function signOutAndLeave(): Promise<void>
// 1. await Promise.race([supabaseBrowser().auth.signOut() (던짐은 삼킴), SIGNOUT_WAIT_MS 타이머]) — 기본 global. 돌려준 오류도 보지 않는다
// 2. cookieNames(document.cookie)에서 isSessionCookie(name) 또는 ACTIVE_COOKIE인 것을 document.cookie = expireCookieString(name, secure)로 지운다
// 3. BroadcastChannel이 있으면 new BroadcastChannel(SIGNOUT_CHANNEL)로 SIGNOUT_MESSAGE를 보내고 닫는다(try로 감싼다)
// 4. window.location.assign('/login')
```
- `SignOutButton.tsx`·`IdleLogout.tsx`에 있던 같은 이름의 함수 둘을 이것 하나로 바꾼다. 지금 두 컴포넌트 시험이 보던 "signOut이 끝난 뒤에야 /login" 순서 시험은 `leave.test.ts`로 옮긴다(AC-403.1). 두 컴포넌트 시험은 `leave.ts`를 가짜로 바꿔 '부른다'만 본다

### `src/lib/auth/idle.ts` `startIdleLogout(opts)` (바꿈)
- `opts.onActive?: () => void`를 더한다. **이 탭의** 움직임(`local()`)이 받아들여졌을 때만 부른다. 다른 탭 소식(channel)·잠자기 뒤 로그아웃·멈춘 뒤에는 부르지 않는다. 나머지 동작은 그대로

### `src/components/shell/IdleLogout.tsx` (바꿈)
- `onActive`: `shouldWrite(lastWrite, Date.now())`면 `document.cookie = activeCookieString(location.protocol === 'https:')`, `lastWrite = now`
- `onIdle`: `signOutAndLeave()`
- 두 번째 채널 `new BroadcastChannel(SIGNOUT_CHANNEL)`: `SIGNOUT_MESSAGE`를 받으면 `window.location.assign('/login')`(signOut은 다시 부르지 않는다 — 보낸 탭이 했다). 떠날 때 닫는다

### `src/app/(onboarding)/layout.tsx` (새 파일)
```tsx
export default function OnboardingLayout({ children }: { children: ReactNode }) // <><IdleLogout />{children}</>
```
- `/signup`·`/pending`이 이 묶음에 있다. 둘 다 그리기 전에 guard가 로그인을 본다(로그인 안 했으면 화면을 그리지 않는다)

### `src/components/auth/LoginCard.tsx` (바꿈)
- `signInWithOAuth`의 `options`에 `queryParams: { prompt: 'select_account' }`. 화면 모양은 바뀌지 않는다

### E2E: `e2e/lib/session.ts`·`e2e/support.ts` (바꿈)
```ts
// session.ts — 지금처럼 앱 코드(src/)를 import하지 않는다(auth-live AC-003.1 시험이 막는다). 값을 직접 둔다
const ACTIVE_COOKIE = 'app-active'
const ACTIVE_MAX_AGE_SEC = 1860
export function activeBrowserCookie(host: string, nowSec: number): BrowserCookie
// { name: 'app-active', value: '1', domain: host, path: '/', httpOnly: false, secure: false, sameSite: 'Lax', expires: nowSec + 1860 }
export function signInCookies(cookies: CookieToSet[], host: string, nowSec: number): BrowserCookie[]
// [...toBrowserCookies(cookies, host, nowSec), activeBrowserCookie(host, nowSec)]
```
- `session.test.ts`(시험 파일은 `src/`를 불러도 된다)가 `src/lib/auth/activity`의 `ACTIVE_COOKIE`·`ACTIVE_MAX_AGE_SEC`와 값이 같은지 본다 → 앱 값이 바뀌면 시험이 알린다(AC-406.1)
- `support.ts` `signIn`: `context.addCookies(signInCookies(cookies, APP_HOST, now))`
- `e2e/lib/session.test.ts`의 auth-live AC-003.5 시험이 쓰는 `new URL('../../src', import.meta.url).pathname`은 윈도우에서 `C:\C:\…`가 되어 시험 파일 전체가 돌지 않는다 → `fileURLToPath(...)`로 바꾼다(시험 뜻은 그대로)

## 데이터 흐름
```
로그인: [구글로 시작하기](계정 선택 늘 묻기) → Google → Supabase → /auth/callback
        → middleware: 콜백 경로라 움직임 검사 건너뜀 → route: 세션 쿠키 + app-active(31분) + no-store → /dashboard
앱 쓰는 중: 화면을 누르거나 키를 침 → IdleLogout가 60초에 한 번까지 app-active를 31분으로 다시 씀
            페이지를 옮김 → middleware가 app-active를 31분으로 다시 씀
31분 동안 아무도 쓰지 않음(탭·브라우저를 닫음, 자리 비움, PC 잠자기) → 브라우저가 app-active를 지움
다음 사람이 연다 → middleware: 로그인은 있는데 app-active가 없음 → signOut(local)로 서버에서 그 세션 폐기
                  + 세션 쿠키 지우기 + no-store → 보호 경로면 /login
화면이 열린 채 30분 → IdleLogout → signOutAndLeave(): signOut(최대 5초) → 쿠키 직접 지우기 → 다른 탭에 'signout' → /login
```

## 결정과 트레이드오프
- **ADR-023 (새): 움직임 쿠키로 서버가 오래 비운 세션을 끊는다.** 고른 길(사용자 "개선해줘", 점검 보고서 추천 (가))
  - 고려했지만 안 쓴 것:
    - (나) Supabase 유료 세션 제한: 무료 플랜이 목표(plan.md §5)
    - 서버가 시각을 쿠키에 적고 비교: PC 시계와 서버 시계가 다르면 틀린다. 브라우저 Max-Age는 브라우저 시계 하나로 세고 지운다
    - 세션 쿠키 maxAge 없애기(브라우저를 닫으면 사라지는 쿠키): 라이브러리가 `cookieOptions.maxAge`를 덮어써 세 곳의 `setAll`을 손봐야 하고, 크롬 '이전 세션 이어서 열기'가 되살리며, 탭만 닫은 경우는 막지 못한다
  - ADR-004와의 관계: middleware가 Supabase에 세션 폐기(`signOut`)를 요청하는 것은 세션 작업이라 ADR-004의 인증 예외(세션과 내 줄만 다룸) 안이다. DB 줄은 읽지도 쓰지도 않는다 → ADR-023에 이 한 줄을 적는다
  - 트레이드오프: 로그인한 사람의 요청마다 `Set-Cookie: app-active`가 붙는다(응답 캐시를 막는 쪽이라 안전하다). 31분 넘게 비운 뒤에는 다시 로그인해야 한다(지금 30분 자동 로그아웃과 같은 뜻)
  - 한계: 개발자 도구로 쿠키를 직접 넣으면 피할 수 있다. 막으려면 서명 비밀값이 필요한데 서버 비밀값을 늘리지 않는다(CLAUDE.md 보안 규칙). '다음 사람이 그냥 여는 것'을 막는 장치다
- **Max-Age 1860초 = 30분 + 60초**: 화면은 60초에 한 번까지만 쓰므로, 마지막으로 쓴 뒤 최대 60초 동안 움직였을 수 있다. 1분을 더해 화면의 30분 자동 로그아웃보다 서버가 먼저 끊지 않게 한다
- **콜백 경로는 검사하지 않는다**: 콜백 요청에 옛 세션이 남아 있으면 middleware의 `signOut`이 세션과 함께 코드 검증값까지 지워(auth-js `_removeSession`) 코드 교환이 실패한다. 콜백은 어차피 새 세션으로 바꾼다
- **middleware의 signOut은 `local`**: 오래 비운 이 브라우저의 세션만 서버에서 폐기한다. 사용자의 다른 기기(폰)는 그대로 둔다. [로그아웃] 단추는 지금처럼 global이다
- **로그아웃은 결과와 상관없이 쿠키를 직접 지운다**: `signOut`이 성공하면 이미 지워져 있어 아무 일도 없다. 실패(인터넷이 끊긴 채 갱신 실패 등, auth-js 4082·5122줄)하면 이것이 흔적을 지운다. 서버의 refresh token은 남을 수 있지만 그 PC에는 더 이상 없다
- **signOut은 5초까지만 기다린다**: 응답 없이 끝나지 않으면(와이파이가 반쯤 끊김 등) 단추를 눌러도 화면이 그대로 남는다. 5초 뒤 쿠키를 지우고 나간다
- **다른 탭 알림은 따로 채널**: 지금 `idle-logout` 채널은 '움직였다'만 나르고, 받으면 무엇이든 움직임으로 센다 → 섞지 않는다
- **Secure는 요청 주소로 정한다**: 운영(Vercel)은 https라 붙고, 개발 `localhost`·E2E `http://127.0.0.1:3100`은 http라 붙지 않는다(붙이면 E2E 쿠키가 버려질 수 있다)
- **HSTS·nonce CSP는 이번에 하지 않는다**: plan.md §6-1(부딪히면 이기는 문서)과 CLAUDE.md 보안 규칙이 "CSP·보안 헤더는 파일럿 그대로"라고 정했다. 바꾸려면 사용자 결정이 먼저다 → 완료 보고에서 묻는다
- **W2는 계정 선택 화면만**: 크롬에 구글 계정이 로그인돼 있으면 선택 화면에서 그 계정을 다시 누를 수는 있다. 막으려면 로그아웃 뒤 구글 로그아웃 안내(화면 변경, 목업 승인 먼저)나 사람마다 크롬 프로필 나누기(운영 규칙)가 필요하다 → 범위 밖, 완료 보고에 적는다
- 문서: ADR-023을 더하고, ARCHITECTURE.md 보안 줄(30분 자동 로그아웃)에 움직임 쿠키를 한 줄, CLAUDE.md 보안 규칙에 "`app-active`가 없으면 middleware가 로그인을 끊는다 — E2E도 이 쿠키를 넣는다(ADR-023)" 한 줄, 점검 보고서에 고친 항목 표시

## 위험 / 미해결 질문
- **E2E 시험 파일이 아직 없다**: 어느 브랜치에도 `e2e/**/*.spec.ts`가 없다(auth-live Phase 2 TASK-7~9가 아직 안 됨). 그래서 지금 `npm run e2e`는 시험이 없어 실패한다. 나중에 그 시험들이 `support.ts`의 `signIn`으로 로그인할 때 움직임 쿠키가 없으면 모두 로그인 화면으로 간다 → 이번에 `signInCookies` 단위 시험(AC-406.2)으로 못박는다. 실제 Supabase로 끝까지 보는 확인은 auth-live Phase 2 때 한다
- **이 PC(윈도우)에서 원래 실패하던 시험 40개**: 폴더 구분 기호(`\`)·.NET SDK 없음·파일 권한·속도 측정 때문이다(작업 시작 때 전체 실행으로 기록). 이번 작업은 그 목록에 새 실패를 더하지 않는 것으로 확인한다. `npm run build`·`npm run lint`는 통과해야 한다
- **Vercel 정적 페이지**: 로그인한 사람이 랜딩(`/`)을 열면 middleware가 `Set-Cookie`를 붙인다. 지금도 세션을 새로 고칠 때 같은 일이 있다. 배포 뒤 확인에서 랜딩·로그인이 그대로 되는지 본다
- **배포 뒤 손 확인(사용자)**: ① 로그인 → 크롬을 닫음 → 32분 뒤 다시 열면 /login ② 로그인 → 다른 탭에서 [로그아웃] → 첫 탭이 /login ③ [구글로 시작하기]에서 계정 선택 화면이 뜸
- 승인 기록: 이 PC에는 하네스 훅이 설치되어 있지 않다. 사용자가 `SDD-AUTO-ON`을 켰으므로 `harness-reviewer` 명세 검토 PASS 뒤 자동 승인으로 기록한다(CLAUDE.md 개발 프로세스, 2026-10-30 사용자 결정. 기록 모양은 `specs/tab-frame/approval.json`의 auto-approve와 같게)
