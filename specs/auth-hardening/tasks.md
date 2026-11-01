# 작업 분할: 로그인 세션 보안 강화

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 화면 모양은 바꾸지 않는다(새 글자·단추 없음). 화면을 바꿔야 하면 멈추고 목업부터 한다.
> 고치는 시험 파일에 옛 명세의 시험(auth·auth-live 번호)이 있다. 그 시험들은 이름·뜻을 바꾸지 않고, 새 시험은 AC-40x 번호로 더한다.
> **예외 규칙(로그아웃을 `signOutAndLeave` 한 곳으로 모으기 때문)** — `SignOutButton.test.tsx`·`IdleLogout.test.tsx`의 옛 시험에서:
> - `signOut`·`location.assign`을 보는 곳은 모두(불렸음·불리지 않았음·몇 번 불렸음을 보는 곳, 불리기를 기다리는 곳 모두) 가짜 `signOutAndLeave`를 보도록 바꾼다
> - `IdleLogout.test.tsx`에서 채널 수를 세거나 `channels[0]`처럼 순서로 채널을 고르는 곳은 이름(`idle-logout`)으로 찾도록 바꾼다(`auth-signout` 채널이 하나 더 생긴다)
> - 시험 번호와 뜻은 그대로 두고, 이름 속 'signOut()' 말만 'signOutAndLeave()'로 맞춘다. 지금 해당하는 곳: `IdleLogout.test.tsx` 56·75·83·94·109·126·137·149줄의 시험, `SignOutButton.test.tsx` 29·44·52·61·79줄의 시험
> - 그대로 두는 옛 시험: `SignOutButton.test.tsx` 70줄(type="button" 단추와 className)
> - signOut 기다림·던짐·오류·순서·5초는 `leave.test.ts`(AC-403.1·403.5)가 본다
> **할 순서**: TASK-1 → 2 → … → 13(번호 순). 끝에 `npm run lint`·`npm run build`·`npm test`(이 PC에서 원래 실패하던 40개 밖의 새 실패 없음)

## TASK-1: 움직임 쿠키·세션 쿠키 도우미 (순수)
- REQ: REQ-401, REQ-403, REQ-405
- Files: src/lib/auth/activity.ts, src/lib/auth/activity.test.ts
- Tests: src/lib/auth/activity.test.ts
- TDD: required — design.md '`src/lib/auth/activity.ts`'의 상수·함수. `activeCookieOptions`·`activeCookieString`(AC-401.1·401.8, Secure 있음/없음 AC-405.1·405.2), `expireCookieString`(AC-403.1, Secure AC-405.2), `isSessionCookie`(`sb-abcd-auth-token`·`.0`·`.1`은 참, `…-code-verifier`·`app-active`·`sb-abcd-auth-tokenx`는 거짓, AC-401.2), `cookieNames`(빈 문자열·공백·`=` 없는 조각), `shouldWrite`(null·59초·60초, AC-401.8)

## TASK-2: middleware 세션 새로 고침 — 움직임 검사·Secure
- REQ: REQ-401, REQ-405
- Files: src/lib/supabase/middleware.ts, src/lib/supabase/middleware.test.ts
- Tests: src/lib/supabase/middleware.test.ts
- TDD: required — 가짜 `createServerClient`(지금 시험 방식)에 `signOut`을 더한다. AC-401.1(쿠키 있음 → userId·`app-active` 다시 씀, 옵션), AC-401.2(쿠키 없음 → `signOut({ scope: 'local' })` 한 번·세션 쿠키 `.0`·`.1`까지 Max-Age 0·코드 검증값·`app-active`·다른 쿠키는 직접 지우지 않음·`Cache-Control: private, no-store`·null), AC-401.3(signOut 오류·던짐에도 지움·null, console 호출 없음), AC-401.4(로그인 안 함 → 쓰지도 지우지도 않음·signOut 안 부름), AC-401.5(`/auth/callback`은 쿠키 없어도 그대로), AC-405.1(`https://` 요청이면 `cookieOptions.secure` true와 `app-active` Secure, `http://`면 false). 기존 옛 시험(auth AC-001.3 — getUser만 믿음 등)은 그대로 통과해야 한다

## TASK-3: middleware 리디렉트가 지우기를 옮기는지 못박기
- REQ: REQ-401
- Files: src/middleware.test.ts
- Tests: src/middleware.test.ts
- TDD: exempt — `src/middleware.ts`는 바꾸지 않는다(design.md). 지금 코드가 이미 응답 쿠키·캐시 헤더를 리디렉트로 옮기므로 RED가 나올 수 없다. 대신 AC-401.6 시험(가짜 `updateSession`이 세션 쿠키 지우기 + no-store를 담은 응답과 null을 돌려줌 → 307 `/login`, 지우기 쿠키 Max-Age 0과 Cache-Control이 실림)을 더해 앞으로 누가 middleware를 바꿔도 깨지면 알게 한다

## TASK-4: 서버 Supabase 클라이언트의 Secure 인자
- REQ: REQ-405
- Files: src/lib/supabase/server.ts, src/lib/supabase/server.test.ts
- Tests: src/lib/supabase/server.test.ts
- TDD: required — `supabaseServer({ secure: true })` → `createServerClient`의 `cookieOptions.secure` true, 인자 없음 → false(AC-405.1). 기존 옛 시험(쿠키 getAll·setAll, Server Component에서 쓰기 실패를 삼킴)은 그대로

## TASK-5: 로그인 콜백 — 움직임 쿠키·캐시 금지·Secure
- REQ: REQ-401, REQ-405
- Files: src/app/auth/callback/route.ts, src/app/auth/callback/route.test.ts
- Tests: src/app/auth/callback/route.test.ts
- TDD: required — AC-401.7(성공 → `/dashboard` 응답에 `app-active=1`·Max-Age 1860·Path `/`·SameSite Lax, 실패 3가지(code 없음·교환 오류·던짐) → 쓰지 않음), AC-405.3(성공·실패 모두 `Cache-Control: private, no-store`), AC-405.1(`https://` 콜백 → `supabaseServer({ secure: true })`·`app-active` Secure, `http://` → false). 기존 옛 시험(고정 경로, 돌아갈 주소 쿼리 무시, 로그 없음)은 그대로

## TASK-6: 브라우저 Supabase 클라이언트의 Secure
- REQ: REQ-405
- Files: src/lib/supabase/browser.ts, src/lib/supabase/browser.test.ts
- Tests: src/lib/supabase/browser.test.ts
- TDD: required — `location.protocol`을 `https:`·`http:`로 바꿔 끼워 `createBrowserClient(url, key, { cookieOptions: { secure } })`를 본다(AC-405.2). 기존 옛 시험(auth AC-001.2)의 호출 인자 기대값에 셋째 인자를 넣는다

## TASK-7: 로그아웃 한 곳(`signOutAndLeave`)과 [로그아웃] 단추
- REQ: REQ-403, REQ-405
- Files: src/lib/auth/leave.ts, src/lib/auth/leave.test.ts, src/components/auth/SignOutButton.tsx, src/components/auth/SignOutButton.test.tsx
- Tests: src/lib/auth/leave.test.ts, src/components/auth/SignOutButton.test.tsx
- TDD: required — jsdom, `supabaseBrowser`는 가짜. AC-403.1: `signOut`이 성공·오류(`{ error }`)·던짐 셋 다 세션 쿠키(조각 포함)와 `app-active`가 `document.cookie`에서 사라지고 다른 쿠키는 남고 `/login`으로 감, 화면에 오류 내용 없음, `signOut`이 끝나기 전에는 쿠키를 지우지도 이동하지도 않음(두 컴포넌트 시험이 보던 순서를 여기서 본다). `isLeaving()`은 부르기 전 거짓, 부른 뒤 참(`leaving`은 모듈 하나에 하나라 `browser.test.ts`처럼 시험마다 `vi.resetModules()` 뒤 새로 불러온다). 나가는 중에 다시 부르면 `signOut`을 더 부르지 않음. AC-403.2: `auth-signout` 채널에 `signout`을 보내고 닫음, BroadcastChannel이 없어도 로그아웃됨. AC-403.5: `signOut`이 끝나지 않으면 가짜 시계 5초 뒤 지우기·알림·이동, 5초 전에는 아무것도 안 함, signOut이 먼저 끝나면 남은 타이머가 없음. AC-405.2: `location.protocol`이 `https:`면 지우기 글자에 `; Secure`, `http:`면 없음(`document.cookie` 쓰기를 엿봐서 확인). `SignOutButton.test.tsx`(이 TASK는 이 시험 파일만 고친다): `leave.ts`를 가짜로 바꿔 눌렀을 때 `signOutAndLeave`를 한 번 부름(AC-403.4), 옛 로그아웃 시험 5곳(29·44·52·61·79줄)은 머리말의 예외 규칙대로 바꿈

## TASK-8: 자동 로그아웃 시계에 '이 탭이 움직임' 알림
- REQ: REQ-401
- Files: src/lib/auth/idle.ts, src/lib/auth/idle.test.ts
- Tests: src/lib/auth/idle.test.ts
- TDD: required — `onActive`가 이 탭의 누름·키·스크롤·보이기 바뀜에 불리고, 다른 탭 소식·잠자기 뒤 로그아웃·멈춘 뒤에는 불리지 않음(AC-401.8). `onActive`를 안 넘겨도 지금 시험이 그대로 통과

## TASK-9: `IdleLogout` — 움직임 쿠키 쓰기·같은 로그아웃·다른 탭 로그아웃 받기
- REQ: REQ-401, REQ-403, REQ-405
- Files: src/components/shell/IdleLogout.tsx, src/components/shell/IdleLogout.test.tsx
- Tests: src/components/shell/IdleLogout.test.tsx
- TDD: required — 가짜 시계·가짜 BroadcastChannel(지금 시험 방식), `leave.ts`(`signOutAndLeave`·`isLeaving`)는 가짜. 옛 자동 로그아웃 시험은 머리말의 예외대로 바꾼다. AC-401.8: 움직이면 `document.cookie`에 `app-active`가 생김, 60초 안 두 번째 움직임은 다시 쓰지 않음(쿠키를 지워 두고 확인), 60초 뒤에는 다시 씀, 다른 탭 움직임 소식으로는 쓰지 않음. AC-405.2: 가짜 `location.protocol`이 `https:`면 쓴 글자에 `; Secure`, `http:`면 없음(`document.cookie` 쓰기를 엿봐서 확인). AC-403.4: 30분 뒤 `signOutAndLeave`를 한 번 부름. AC-403.3: `auth-signout` 채널의 `signout` → signOut을 부르지 않고 `/login`, 다른 글자는 무시, `isLeaving()`이 참이면 무시. 떠나면 두 채널을 닫음

## TASK-10: 가입·대기 화면 묶음에 자동 로그아웃
- REQ: REQ-402
- Files: src/app/(onboarding)/layout.tsx, src/app/(onboarding)/layout.test.tsx
- Tests: src/app/(onboarding)/layout.test.tsx
- TDD: required — `IdleLogout`을 표시만 그리는 가짜로 바꿔 끼우고, 레이아웃이 그것을 한 번 + children을 그대로 그리는지(AC-402.1)

## TASK-11: 구글 계정 선택 늘 묻기
- REQ: REQ-404
- Files: src/components/auth/LoginCard.tsx, src/components/auth/LoginCard.test.tsx
- Tests: src/components/auth/LoginCard.test.tsx
- TDD: required — AC-404.1 시험을 더하고, 기존 옛 시험(auth AC-003.1 — `signInWithOAuth` 인자 정확히 같음)의 기대값에 `queryParams`를 넣는다. 화면 글자·모양 시험은 그대로

## TASK-12: E2E 시험 로그인에 움직임 쿠키
- REQ: REQ-406
- Files: e2e/lib/session.ts, e2e/lib/session.test.ts, e2e/support.ts
- Tests: e2e/lib/session.test.ts
- TDD: required — 먼저 `session.test.ts`의 auth-live AC-003.5 시험이 쓰는 `src` 경로를 `fileURLToPath`로 고친다(윈도우에서 시험 파일이 돌게, 뜻은 그대로 — 고친 뒤 이 파일의 기존 시험이 모두 통과하는지 먼저 본다). 그다음 AC-406.1 시험(모양, 그리고 `src/lib/auth/activity`의 `ACTIVE_COOKIE`·`ACTIVE_MAX_AGE_SEC`와 같은 값) → RED → `activeBrowserCookie`. AC-406.2 시험(`signInCookies` = `toBrowserCookies` 결과 전부 + 움직임 쿠키 하나, 그리고 `support.ts` 글자를 읽어 `signInCookies(`를 부르고 `toBrowserCookies(`를 직접 부르지 않음) → RED → `signInCookies`·`support.ts`. 기존 auth-live AC-003.1 시험(session.ts는 `src/`를 import하지 않음)은 그대로 통과해야 한다. `support.ts` `signIn`은 `signInCookies`를 넣는다

## TASK-13: 문서 — ADR-023·ARCHITECTURE·CLAUDE.md·점검 보고서
- REQ: REQ-401, REQ-402, REQ-403, REQ-404, REQ-405, REQ-406
- Files: docs/ADR.md, docs/ARCHITECTURE.md, CLAUDE.md, docs/security/oauth-review-2026-11-01.md
- TDD: exempt — 문서만 고친다. ADR-023(design.md '결정과 트레이드오프'의 움직임 쿠키, ADR-004와의 관계 한 줄 포함), ARCHITECTURE.md 96줄 '30분 자동 로그아웃'에 움직임 쿠키 한 줄, CLAUDE.md 보안 규칙에 한 줄("`app-active`가 없으면 middleware가 로그인을 끊는다 — E2E도 이 쿠키를 넣는다, ADR-023"), 점검 보고서 W1·W2·W4·W5(쿠키)·W6·W7·W8에 '고침(auth-hardening)'과 남은 일(W2 구글 로그아웃 안내, W3 nonce CSP, W5 HSTS — plan.md §6-1 사용자 결정 필요) 표시. 다른 규칙 문장은 바꾸지 않는다
