# 요구사항: 로그인 세션 보안 강화

> 기능 ID: `auth-hardening` · 형식: 요구사항은 `### REQ-401: 제목`, 수용 기준은 `- AC-401.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.
> 번호는 401부터 쓴다(auth·auth-live·landing·stats-core·precheck는 001대, landing-v2는 101대, b2b-redesign은 201대, tab-frame은 301대). 고치는 시험 파일에 옛 명세의 AC-001.x·AC-003.x 시험 이름이 이미 있어 겹치지 않게 한다

## 배경 / 목표
- `docs/security/oauth-review-2026-11-01.md`(점검 기준 `.claude/skills/oauth-security/SKILL.md`)가 찾은 약점 W1·W2·W4·W5(쿠키 Secure)·W6·W7·W8을 고친다. 이 앱은 공용 PC에서 쓴다 → 앱에서 손을 뗀 뒤 다음 사람이 그 세션으로 들어오지 못하게 하는 것이 목표다
- 근거가 된 라이브러리 동작(원본에서 확인함)
  - `@supabase/ssr` 0.12.7: 세션 쿠키 maxAge 400일, httpOnly false(`dist/main/utils/constants.js`). `cookieOptions.maxAge`를 줘도 400일로 덮어쓴다(`dist/main/cookies.js` 230·470줄). `secure`는 덮어쓰지 않는다
  - `@supabase/auth-js` 2.117.3: 토큰 갱신이 인터넷 오류로 실패하면 세션을 지우지 않고(`src/GoTrueClient.ts` 5122줄), `signOut`은 그 오류를 받으면 세션을 지우기 전에 돌아간다(4082줄). 세션을 지울 때(`_removeSession`, 5265줄)는 코드 검증값도 지운다
- 사용자: "개선해줘"(2026-11-01), 이 저장소에서 `SDD-AUTO-ON`(2026-11-01). 고르는 길이 있던 것은 점검 보고서의 추천대로 정했다 **(Claude 판단)**
  - W1(브라우저를 닫아도 400일 로그인)은 무료 방식: 브라우저가 스스로 지우는 31분짜리 '움직임 쿠키'를 두고, 그것이 없으면 서버가 로그인을 끊는다(design.md '결정과 트레이드오프')
  - W2는 구글 계정 선택 화면만 늘 띄운다. 로그아웃 뒤 "구글에서도 로그아웃하세요" 안내는 화면이 바뀌므로 목업 승인 뒤 따로 한다
  - W3(nonce CSP)·W5의 HSTS 헤더는 plan.md §6-1("CSP·보안 헤더는 파일럿 그대로")을 바꾸는 일이라 이번에 하지 않고 사용자에게 묻는다(범위 밖)
- 규칙 근거: CLAUDE.md 보안 규칙(리디렉트는 고정 경로만, 오류 내용은 보이지 않음, 앱 코드에 시험용 우회 없음, E2E 로그인은 시험 코드가 쿠키를 넣음), plan.md §6-4(공용 PC 30분 자동 로그아웃)

## 요구사항

### REQ-401: 움직임 쿠키가 없으면 서버가 로그인을 끊는다 (W1)
- AC-401.1: Given 로그인한 요청에 움직임 쿠키 `app-active`가 있음, When `updateSession(request)`를 부르면, Then 확인한 사용자 id를 돌려주고 응답에 `app-active=1`을 Max-Age 1860초(31분)·Path `/`·SameSite Lax·httpOnly 아님으로 다시 쓴다
- AC-401.2: Given 로그인했는데 `app-active`가 없음(31분 넘게 움직임 없음, 또는 쿠키가 지워짐), When `updateSession`을 부르면, Then `signOut({ scope: 'local' })`을 한 번 부르고, 요청에 있던 세션 쿠키(`sb-<ref>-auth-token`과 조각 `.0`·`.1`…)를 응답에서 Max-Age 0으로 지우며, `Cache-Control: private, no-store`를 붙이고, 사용자 id 대신 `null`을 돌려준다. 직접 지우는 것은 세션 쿠키뿐이다(`…-auth-token-code-verifier`·`app-active`·그 밖의 쿠키는 건드리지 않는다)
- AC-401.3: Given AC-401.2 상황에서 `signOut`이 오류를 돌려주거나 던짐, When `updateSession`을 부르면, Then 그래도 세션 쿠키를 지우고 `null`을 돌려준다. 오류 내용은 로그·응답에 남기지 않는다
- AC-401.4: Given 로그인하지 않은 요청, When `updateSession`을 부르면, Then `app-active`를 쓰지도 지우지도 않고 `signOut`을 부르지 않는다
- AC-401.5: Given 경로가 `/auth/callback`, When `updateSession`을 부르면, Then `app-active`가 없어도 로그인을 끊지 않는다(콜백이 새 세션과 `app-active`를 만든다)
- AC-401.6: Given `updateSession`이 세션 쿠키 지우기·캐시 금지 헤더를 담은 응답과 `null`을 돌려줌, When middleware가 보호 경로(`/dashboard` 등)를 받으면, Then 307로 `/login`에 보내고 그 응답에 지우기 쿠키(Max-Age 0)와 `Cache-Control`이 그대로 실린다
- AC-401.7: Given 구글에서 돌아와 코드 교환이 성공함, When `GET /auth/callback`을 부르면, Then `/dashboard`로 보내는 응답에 `app-active=1`(AC-401.1과 같은 옵션)을 쓴다. 실패(code 없음·교환 오류·던짐)하면 쓰지 않는다
- AC-401.8: Given 로그인한 화면에서 사용자가 움직임(누름·키·스크롤·화면 보이기 바뀜), When `IdleLogout`이 그것을 받으면, Then `document.cookie`로 `app-active=1; Max-Age=1860; Path=/; SameSite=Lax`를 쓴다. 60초 안에 다시 움직이면 다시 쓰지 않는다. 다른 탭의 움직임 소식으로는 쓰지 않는다(그 탭이 쓴다)

### REQ-402: 로그인한 모든 화면에 자동 로그아웃 (W6)
- AC-402.1: Given `/signup`·`/pending`(가입 신청·승인 대기) 묶음 `(onboarding)`, When 레이아웃을 그리면, Then `IdleLogout`이 한 번 들어 있고 children을 그대로 그린다

### REQ-403: 로그아웃은 실패해도 흔적을 남기지 않고 다른 탭도 함께 나간다 (W4·W7)
- AC-403.1: Given [로그아웃]이나 자동 로그아웃, When `signOutAndLeave()`를 부르면, Then `signOut()`(기본 global)을 한 번 부르고 그것이 끝난 뒤에, 결과가 성공·오류·던짐 어느 것이든 `document.cookie`에 있는 세션 쿠키(`sb-<ref>-auth-token`, 조각)와 `app-active`를 Max-Age 0으로 지우고 `/login`을 새로 연다. 다른 쿠키는 남긴다. 오류 내용은 보이지 않는다. `signOut`이 끝나기 전에는(5초까지 — 아래 5초 기준) 지우지도 이동하지도 않는다. `signOut`을 기다리는 동안 다시 부르면 아무것도 하지 않는다(두 번 눌러도 `signOut` 한 번). `/login`으로 보낸 뒤에는 '나가는 중'을 푼다(뒤로 가기로 되살아난 화면·한 문서에서 여러 번 부르는 시험에서도 다시 로그아웃할 수 있게)
- AC-403.2: Given `signOutAndLeave()`, When 부르면, Then `/login`으로 가기 전에 같은 브라우저의 다른 탭에 `signout` 소식을 보낸다(BroadcastChannel `auth-signout`). BroadcastChannel이 없는 브라우저에서도 로그아웃은 된다
- AC-403.3: Given 로그인한 화면(`IdleLogout`이 있는 탭), When 다른 탭에서 `signout` 소식을 받으면, Then `signOut`을 다시 부르지 않고 `/login`을 새로 연다. 다른 글자의 소식은 무시한다. 이 탭이 `signOutAndLeave()`로 `signOut`을 기다리는 중이면 무시한다(그 탭은 스스로 `/login`으로 간다). 보낸 탭 자신도 같은 이름의 다른 채널 객체로 소식을 받을 수 있는데, 그때는 `/login`으로 한 번 더 가는 것뿐이라 막지 않는다
- AC-403.4: Given `SignOutButton`과 `IdleLogout`, When 로그아웃하면, Then 둘 다 같은 `signOutAndLeave()`를 쓴다
- AC-403.5: Given `signOut()`이 5초 안에 끝나지 않음(인터넷이 반쯤 끊김 등), When `signOutAndLeave()`를 부르면, Then 5초 뒤 기다리지 않고 쿠키 지우기·다른 탭 알림·`/login` 이동을 한다

### REQ-404: 구글 계정 선택을 늘 묻는다 (W2)
- AC-404.1: Given 로그인 화면, When [구글로 시작하기]를 누르면, Then `signInWithOAuth({ provider: 'google', options: { redirectTo: <현재 origin>/auth/callback, queryParams: { prompt: 'select_account' } } })`를 부른다

### REQ-405: 쿠키 Secure·콜백 캐시 금지 (W5 중 쿠키·W8)
- AC-405.1: Given https 요청, When middleware(`updateSession`)·로그인 콜백이 Supabase 서버 클라이언트를 만들면, Then `cookieOptions.secure`가 `true`이고 응답에 쓰는 `app-active`도 Secure다. http(개발 `localhost`, E2E `127.0.0.1`)면 둘 다 아니다
- AC-405.2: Given 브라우저가 https로 연 페이지, When `supabaseBrowser()`가 클라이언트를 만들면, Then `cookieOptions.secure`가 `true`다. http면 `false`다. `IdleLogout`이 `document.cookie`로 쓰는 `app-active`와 `signOutAndLeave()`의 지우기도 https면 `; Secure`가 붙고 http면 붙지 않는다
- AC-405.3: Given 로그인 콜백, When 성공(`/dashboard`)이든 실패(`/login?error=1`)든 응답하면, Then `Cache-Control: private, no-store`가 붙는다

### REQ-406: E2E 시험 로그인도 움직임 쿠키를 넣는다
- AC-406.1: Given 시험 코드 로그인, When `activeBrowserCookie(host, nowSec)`를 부르면, Then `{ name: 'app-active', value: '1', domain: host, path: '/', httpOnly: false, secure: false, sameSite: 'Lax', expires: nowSec + 1860 }`을 돌려주고, 그 이름·초는 앱(`src/lib/auth/activity.ts`)의 `ACTIVE_COOKIE`·`ACTIVE_MAX_AGE_SEC`와 같다. `session.ts`는 지금처럼 앱 코드(`src/`)를 import하지 않는다(auth-live 명세의 'session.ts는 앱 코드를 부르지 않는다' 기준)
- AC-406.2: Given 시험 코드가 모은 세션 쿠키, When `signInCookies(cookies, host, nowSec)`를 부르면, Then `toBrowserCookies(cookies, host, nowSec)`의 쿠키 전부 + `activeBrowserCookie(host, nowSec)` 하나를 돌려준다. `e2e/support.ts`의 `signIn`은 이 함수의 결과를 넣는다(`support.ts`가 `signInCookies(`를 부르고 `toBrowserCookies(`를 직접 부르지 않는다). 앱 코드에는 시험용 길을 더하지 않는다

## 범위 밖
- W3 nonce 방식 CSP(`'unsafe-inline'` 빼기)·W5의 HSTS 헤더 — plan.md §6-1·CLAUDE.md 보안 규칙("CSP·보안 헤더는 파일럿 그대로")을 바꾸는 일이다. 사용자 결정 뒤 따로 한다
- 로그아웃 뒤 "구글에서도 로그아웃하세요" 안내 화면 — 화면이 바뀐다(클릭 목업 승인 먼저, plan.md §3·§9)
- Supabase 유료 세션 시간 제한·비활동 제한
- 세션 쿠키 자체의 400일 maxAge 없애기 — 움직임 쿠키가 같은 일을 하고, 라이브러리가 덮어써 세 곳의 `setAll`을 손봐야 한다(design.md '결정과 트레이드오프')
- Playwright 시험 파일(`e2e/**/*.spec.ts`) 만들기 — 아직 어느 브랜치에도 없다(auth-live Phase 2 TASK-7~9의 일). 이번에는 그것들이 쓸 로그인 쿠키만 맞춘다
- 받아들인 위험(운영 DB의 비밀번호 관리자 시험 계정, 이메일 로그인 켬) — 그대로(`specs/auth-live/design.md` 사용자 결정 1)
- Supabase·구글 관리 화면 설정 확인 — 사용자 단계(점검 보고서 4장)
- 움직임 쿠키 위조(개발자 도구로 직접 넣기) — 공용 PC의 '다음 사람'을 막는 장치이고 서명 비밀값은 두지 않는다(CLAUDE.md: 비밀값 최소)
