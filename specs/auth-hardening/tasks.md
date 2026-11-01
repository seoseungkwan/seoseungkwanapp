# 작업 분할: 로그인 세션 보안 강화

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 화면 모양은 바꾸지 않는다(새 글자·단추 없음). 화면을 바꿔야 하면 멈추고 목업부터 한다.
> **할 순서**: TASK-1 → 2 → … → 14(번호 순). 끝에 `npm run lint`·`npm run build`·`npm test`(이 PC에서 원래 실패하던 40개 밖의 새 실패 없음)

## TASK-1: 움직임 쿠키·세션 쿠키 도우미 (순수)
- REQ: REQ-001, REQ-003, REQ-005
- Files: src/lib/auth/activity.ts, src/lib/auth/activity.test.ts
- Tests: src/lib/auth/activity.test.ts
- TDD: required — design.md '`src/lib/auth/activity.ts`'의 상수·함수. `activeCookieOptions`·`activeCookieString`(AC-001.1·001.8, Secure 있음/없음 AC-005.2·005.3), `expireCookieString`(AC-003.1), `isSessionCookie`(`sb-abcd-auth-token`·`.0`·`.1`은 참, `…-code-verifier`·`app-active`·`sb-abcd-auth-tokenx`는 거짓, AC-001.2), `cookieNames`(빈 문자열·공백·`=` 없는 조각), `shouldWrite`(null·59초·60초, AC-001.8)

## TASK-2: middleware 세션 새로 고침 — 움직임 검사·Secure
- REQ: REQ-001, REQ-005
- Files: src/lib/supabase/middleware.ts, src/lib/supabase/middleware.test.ts
- Tests: src/lib/supabase/middleware.test.ts
- TDD: required — 가짜 `createServerClient`(지금 시험 방식)에 `signOut`을 더한다. AC-001.1(쿠키 있음 → userId·`app-active` 다시 씀, 옵션), AC-001.2(쿠키 없음 → `signOut({ scope: 'local' })` 한 번·세션 쿠키 `.0`·`.1`까지 Max-Age 0·코드 검증값 쿠키는 그대로·`Cache-Control: private, no-store`·null), AC-001.3(signOut 오류·던짐에도 지움·null, console 호출 없음), AC-001.4(로그인 안 함 → 쓰지도 지우지도 않음·signOut 안 부름), AC-001.5(`/auth/callback`은 쿠키 없어도 그대로), AC-005.2(`https://` 요청이면 `cookieOptions.secure` true와 `app-active` Secure, `http://`면 false). 기존 AC-001.3 시험(getUser만 믿음 등)은 그대로 통과해야 한다

## TASK-3: middleware 리디렉트가 지우기를 옮기는지 못박기
- REQ: REQ-001
- Files: src/middleware.test.ts
- Tests: src/middleware.test.ts
- TDD: exempt — `src/middleware.ts`는 바꾸지 않는다(design.md). 지금 코드가 이미 응답 쿠키·캐시 헤더를 리디렉트로 옮기므로 RED가 나올 수 없다. 대신 AC-001.6 시험(가짜 `updateSession`이 세션 쿠키 지우기 + no-store를 담은 응답과 null을 돌려줌 → 307 `/login`, 지우기 쿠키 Max-Age 0과 Cache-Control이 실림)을 더해 앞으로 누가 middleware를 바꿔도 깨지면 알게 한다

## TASK-4: 서버 Supabase 클라이언트의 Secure 인자
- REQ: REQ-005
- Files: src/lib/supabase/server.ts, src/lib/supabase/server.test.ts
- Tests: src/lib/supabase/server.test.ts
- TDD: required — `supabaseServer({ secure: true })` → `createServerClient`의 `cookieOptions.secure` true, 인자 없음 → false(AC-005.2). 기존 시험(쿠키 getAll·setAll, Server Component에서 쓰기 실패를 삼킴)은 그대로

## TASK-5: 로그인 콜백 — 움직임 쿠키·캐시 금지·Secure
- REQ: REQ-001, REQ-005
- Files: src/app/auth/callback/route.ts, src/app/auth/callback/route.test.ts
- Tests: src/app/auth/callback/route.test.ts
- TDD: required — AC-001.7(성공 → `/dashboard` 응답에 `app-active=1`·Max-Age 1860·Path `/`·SameSite Lax, 실패 3가지(code 없음·교환 오류·던짐) → 쓰지 않음), AC-005.4(성공·실패 모두 `Cache-Control: private, no-store`), AC-005.2(`https://` 콜백 → `supabaseServer({ secure: true })`·`app-active` Secure, `http://` → false). 기존 시험(고정 경로, 돌아갈 주소 쿼리 무시, 로그 없음)은 그대로

## TASK-6: 브라우저 Supabase 클라이언트의 Secure
- REQ: REQ-005
- Files: src/lib/supabase/browser.ts, src/lib/supabase/browser.test.ts
- Tests: src/lib/supabase/browser.test.ts
- TDD: required — `location.protocol`을 `https:`·`http:`로 바꿔 끼워 `createBrowserClient(url, key, { cookieOptions: { secure } })`를 본다(AC-005.3). 기존 AC-001.2 시험의 호출 인자 기대값을 셋째 인자를 넣어 고친다

## TASK-7: 로그아웃 한 곳(`signOutAndLeave`)과 [로그아웃] 단추
- REQ: REQ-003, REQ-005
- Files: src/lib/auth/leave.ts, src/lib/auth/leave.test.ts, src/components/auth/SignOutButton.tsx, src/components/auth/SignOutButton.test.tsx
- Tests: src/lib/auth/leave.test.ts, src/components/auth/SignOutButton.test.tsx
- TDD: required — jsdom. `signOut`이 성공·오류(`{ error }`)·던짐 셋 다: 세션 쿠키(조각 포함)와 `app-active`를 지우고(`document.cookie`에서 사라짐) 다른 쿠키는 남기고 `/login`으로 감(AC-003.1), 화면에 오류 내용 없음. `auth-signout` 채널에 `signout`을 보냄, BroadcastChannel이 없어도 로그아웃됨(AC-003.2). https면 지우기에 Secure(AC-005.3 — 문자열을 돌려주는 `expireCookieString` 호출로 확인). `SignOutButton`은 눌렀을 때 `signOutAndLeave`를 부름(AC-003.4)

## TASK-8: 자동 로그아웃 시계에 '이 탭이 움직임' 알림
- REQ: REQ-001
- Files: src/lib/auth/idle.ts, src/lib/auth/idle.test.ts
- Tests: src/lib/auth/idle.test.ts
- TDD: required — `onActive`가 이 탭의 누름·키·스크롤·보이기 바뀜에 불리고, 다른 탭 소식·잠자기 뒤 로그아웃·멈춘 뒤에는 불리지 않음(AC-001.8). `onActive`를 안 넘겨도 지금 시험이 그대로 통과

## TASK-9: `IdleLogout` — 움직임 쿠키 쓰기·같은 로그아웃·다른 탭 로그아웃 받기
- REQ: REQ-001, REQ-003
- Files: src/components/shell/IdleLogout.tsx, src/components/shell/IdleLogout.test.tsx
- Tests: src/components/shell/IdleLogout.test.tsx
- TDD: required — 가짜 시계·가짜 BroadcastChannel(지금 시험 방식). 움직이면 `document.cookie`에 `app-active`가 생김, 60초 안 두 번째 움직임은 다시 쓰지 않음(쿠키를 지워 두고 확인), 다른 탭 움직임 소식으로는 쓰지 않음(AC-001.8). 30분 뒤 `signOutAndLeave`(leave.ts를 가짜로) 한 번(AC-003.4). `auth-signout` 채널의 `signout` → signOut을 부르지 않고 `/login`(AC-003.3), 다른 글자는 무시. 떠나면 두 채널을 닫음

## TASK-10: 가입·대기 화면 묶음에 자동 로그아웃
- REQ: REQ-002
- Files: src/app/(onboarding)/layout.tsx, src/app/(onboarding)/layout.test.tsx
- Tests: src/app/(onboarding)/layout.test.tsx
- TDD: required — `IdleLogout`을 표시만 그리는 가짜로 바꿔 끼우고, 레이아웃이 그것을 한 번 + children을 그대로 그리는지(AC-002.1)

## TASK-11: 구글 계정 선택 늘 묻기
- REQ: REQ-004
- Files: src/components/auth/LoginCard.tsx, src/components/auth/LoginCard.test.tsx
- Tests: src/components/auth/LoginCard.test.tsx
- TDD: required — AC-004.1 시험을 더하고, 기존 AC-003.1 시험(`signInWithOAuth` 인자 정확히 같음)의 기대값에 `queryParams`를 넣는다. 화면 글자·모양 시험은 그대로

## TASK-12: HSTS 헤더
- REQ: REQ-005
- Files: next.config.ts, src/lib/csp.test.ts
- Tests: src/lib/csp.test.ts
- TDD: required — `next.config headers()` 시험에 AC-005.1(모든 경로에 `Strict-Transport-Security: max-age=63072000`, 기존 네 헤더 그대로)

## TASK-13: E2E 시험 로그인에 움직임 쿠키
- REQ: REQ-006
- Files: e2e/lib/session.ts, e2e/lib/session.test.ts, e2e/support.ts
- Tests: e2e/lib/session.test.ts
- TDD: required — 먼저 `session.test.ts` AC-003.5의 `src` 경로를 `fileURLToPath`로 고친다(윈도우에서 시험 파일이 돌게, 뜻은 그대로 — 고친 뒤 기존 시험이 모두 통과하는지 먼저 본다). 그다음 AC-006.1 시험(RED) → `activeBrowserCookie`. `support.ts` `signIn`이 그것을 함께 넣는다(AC-006.2 — 실제 확인은 사용자가 VPS에서 `npm run e2e`)

## TASK-14: 문서 — ADR-023·ARCHITECTURE·CLAUDE.md·점검 보고서
- REQ: REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006
- Files: docs/ADR.md, docs/ARCHITECTURE.md, CLAUDE.md, docs/security/oauth-review-2026-11-01.md
- TDD: exempt — 문서만 고친다. ADR-023(design.md '결정과 트레이드오프'의 움직임 쿠키), ARCHITECTURE.md 96줄 '30분 자동 로그아웃'에 움직임 쿠키 한 줄, CLAUDE.md 보안 규칙에 한 줄("`app-active`가 없으면 middleware가 로그인을 끊는다 — E2E도 이 쿠키를 넣는다, ADR-023"), 점검 보고서 W1·W2·W4~W8에 '고침(auth-hardening)'·남은 일(W2 구글 로그아웃 안내, W3 nonce CSP) 표시. 다른 규칙 문장은 바꾸지 않는다
