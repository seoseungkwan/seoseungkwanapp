# 요구사항: 로그인 세션 보안 강화

> 기능 ID: `auth-hardening` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.

## 배경 / 목표
- `docs/security/oauth-review-2026-11-01.md`(점검 기준 `.claude/skills/oauth-security/SKILL.md`)가 찾은 약점 W1·W2·W4~W8을 고친다. 이 앱은 공용 PC에서 쓴다 → 앱에서 손을 뗀 뒤 다음 사람이 그 세션으로 들어오지 못하게 하는 것이 목표다
- 근거가 된 라이브러리 동작(원본에서 확인함)
  - `@supabase/ssr` 0.12.7: 세션 쿠키 maxAge 400일, httpOnly false(`dist/main/utils/constants.js`). `cookieOptions.maxAge`를 줘도 400일로 덮어쓴다(`dist/main/cookies.js` 230·470줄). `secure`는 덮어쓰지 않는다
  - `@supabase/auth-js` 2.117.3: 토큰 갱신이 인터넷 오류로 실패하면 세션을 지우지 않고(`src/GoTrueClient.ts` 5122줄), `signOut`은 그 오류를 받으면 세션을 지우기 전에 돌아간다(4082줄)
- 사용자: "개선해줘"(2026-11-01). 고르는 길이 있던 것은 점검 보고서의 추천대로 정했다 **(Claude 판단, 승인 때 바꿀 수 있다)**
  - W1(브라우저를 닫아도 400일 로그인)은 무료 방식: 브라우저가 스스로 지우는 31분짜리 '움직임 쿠키'를 두고, 그것이 없으면 서버가 로그인을 끊는다(design.md '결정과 트레이드오프')
  - W2는 구글 계정 선택 화면만 늘 띄운다. 로그아웃 뒤 "구글에서도 로그아웃하세요" 안내는 화면이 바뀌므로 목업 승인 뒤 따로 한다
  - W3(nonce CSP)은 모든 페이지 그리기 방식이 바뀌어 따로 명세로 한다
- 규칙 근거: CLAUDE.md 보안 규칙(리디렉트는 고정 경로만, 오류 내용은 보이지 않음, 앱 코드에 시험용 우회 없음, E2E 로그인은 시험 코드가 쿠키를 넣음), plan.md §6-4(공용 PC 30분 자동 로그아웃)

## 요구사항

### REQ-001: 움직임 쿠키가 없으면 서버가 로그인을 끊는다 (W1)
- AC-001.1: Given 로그인한 요청에 움직임 쿠키 `app-active`가 있음, When `updateSession(request)`를 부르면, Then 확인한 사용자 id를 돌려주고 응답에 `app-active=1`을 Max-Age 1860초(31분)·Path `/`·SameSite Lax·httpOnly 아님으로 다시 쓴다
- AC-001.2: Given 로그인했는데 `app-active`가 없음(31분 넘게 움직임 없음, 또는 쿠키가 지워짐), When `updateSession`을 부르면, Then `signOut({ scope: 'local' })`을 한 번 부르고, 요청에 있던 세션 쿠키(`sb-<ref>-auth-token`과 조각 `.0`·`.1`…)를 응답에서 Max-Age 0으로 지우며, 캐시 금지 헤더(`Cache-Control: private, no-store`)를 붙이고, 사용자 id 대신 `null`을 돌려준다. 코드 검증값 쿠키(`…-auth-token-code-verifier`)는 지우지 않는다
- AC-001.3: Given AC-001.2 상황에서 `signOut`이 오류를 돌려주거나 던짐, When `updateSession`을 부르면, Then 그래도 세션 쿠키를 지우고 `null`을 돌려준다. 오류 내용은 로그·응답에 남기지 않는다
- AC-001.4: Given 로그인하지 않은 요청, When `updateSession`을 부르면, Then `app-active`를 쓰지도 지우지도 않고 `signOut`을 부르지 않는다
- AC-001.5: Given 경로가 `/auth/callback`, When `updateSession`을 부르면, Then `app-active`가 없어도 로그인을 끊지 않는다(콜백이 새 세션과 `app-active`를 만든다)
- AC-001.6: Given `updateSession`이 `null`을 돌려줌, When middleware가 보호 경로(`/dashboard` 등)를 받으면, Then 307로 `/login`에 보내고 그 응답에 세션 쿠키 지우기와 캐시 금지 헤더가 실린다
- AC-001.7: Given 구글에서 돌아와 코드 교환이 성공함, When `GET /auth/callback`을 부르면, Then `/dashboard`로 보내는 응답에 `app-active=1`(AC-001.1과 같은 옵션)을 쓴다. 실패하면 쓰지 않는다
- AC-001.8: Given 로그인한 화면에서 사용자가 움직임(누름·키·스크롤·화면 보이기 바뀜), When `IdleLogout`이 그것을 받으면, Then `document.cookie`로 `app-active=1; Max-Age=1860; Path=/; SameSite=Lax`를 쓴다. 60초 안에 다시 움직이면 다시 쓰지 않는다. 다른 탭의 움직임 소식으로는 쓰지 않는다(그 탭이 쓴다)

### REQ-002: 로그인한 모든 화면에 자동 로그아웃 (W6)
- AC-002.1: Given `/signup`·`/pending`(가입 신청·승인 대기), When 그리면, Then `IdleLogout`이 한 번 들어 있다(30분 자동 로그아웃과 움직임 쿠키 쓰기가 앱 화면과 같다)

### REQ-003: 로그아웃은 실패해도 흔적을 남기지 않고 다른 탭도 함께 나간다 (W4·W7)
- AC-003.1: Given [로그아웃]이나 자동 로그아웃, When `signOutAndLeave()`를 부르면, Then `signOut()`(기본 global)을 한 번 부르고, 그 결과가 성공·오류·던짐 어느 것이든 `document.cookie`에 있는 세션 쿠키(`sb-<ref>-auth-token`, 조각)와 `app-active`를 Max-Age 0으로 지운 뒤 `/login`을 새로 연다. 오류 내용은 보이지 않는다
- AC-003.2: Given `signOutAndLeave()`, When 부르면, Then `/login`으로 가기 전에 같은 브라우저의 다른 탭에 `signout` 소식을 보낸다(BroadcastChannel `auth-signout`). BroadcastChannel이 없는 브라우저에서도 로그아웃은 된다
- AC-003.3: Given 로그인한 화면(`IdleLogout`이 있는 탭), When 다른 탭에서 `signout` 소식을 받으면, Then `signOut`을 다시 부르지 않고 `/login`을 새로 연다
- AC-003.4: Given `SignOutButton`과 `IdleLogout`, When 로그아웃하면, Then 둘 다 같은 `signOutAndLeave()`를 쓴다

### REQ-004: 구글 계정 선택을 늘 묻는다 (W2)
- AC-004.1: Given 로그인 화면, When [구글로 시작하기]를 누르면, Then `signInWithOAuth({ provider: 'google', options: { redirectTo: <현재 origin>/auth/callback, queryParams: { prompt: 'select_account' } } })`를 부른다

### REQ-005: 전송 보안 (W5·W8)
- AC-005.1: Given `next.config.ts`의 `headers()`, When 모든 경로의 헤더를 보면, Then `Strict-Transport-Security: max-age=63072000`이 있다(기존 CSP·nosniff·Referrer-Policy·X-Frame-Options는 그대로)
- AC-005.2: Given https 요청, When middleware(`updateSession`)·로그인 콜백이 Supabase 서버 클라이언트를 만들면, Then `cookieOptions.secure`가 `true`다. http(개발 `localhost`, E2E `127.0.0.1`)면 `false`다. `app-active`도 같은 규칙으로 Secure를 붙인다
- AC-005.3: Given 브라우저가 https로 연 페이지, When `supabaseBrowser()`가 클라이언트를 만들면, Then `cookieOptions.secure`가 `true`다. http면 `false`다. `document.cookie`로 쓰는 `app-active`·지우기도 https면 `Secure`를 붙인다
- AC-005.4: Given 로그인 콜백, When 성공(`/dashboard`)이든 실패(`/login?error=1`)든 응답하면, Then `Cache-Control: private, no-store`가 붙는다

### REQ-006: E2E 시험 로그인도 움직임 쿠키를 넣는다
- AC-006.1: Given 시험 코드 로그인, When `activeBrowserCookie(host, nowSec)`를 부르면, Then `{ name: 'app-active', value: '1', domain: host, path: '/', httpOnly: false, secure: false, sameSite: 'Lax', expires: nowSec + 1860 }`을 돌려준다
- AC-006.2: Given `e2e/support.ts`의 `signIn`, When 쿠키를 넣으면, Then 세션 쿠키와 함께 `activeBrowserCookie`를 넣는다(넣지 않으면 REQ-001 때문에 모든 E2E가 로그인 화면으로 간다). 앱 코드에는 시험용 길을 더하지 않는다

## 범위 밖
- W3 nonce 방식 CSP(`'unsafe-inline'` 빼기) — 모든 페이지가 요청마다 그려지게 바뀐다. 다음 명세
- 로그아웃 뒤 "구글에서도 로그아웃하세요" 안내 화면 — 화면이 바뀐다(클릭 목업 승인 먼저, plan.md §3·§9)
- Supabase 유료 세션 시간 제한·비활동 제한
- 세션 쿠키 자체의 400일 maxAge 없애기 — 움직임 쿠키가 같은 일을 하고, 라이브러리가 덮어써 세 곳의 `setAll`을 손봐야 한다(design.md '결정과 트레이드오프')
- 받아들인 위험(운영 DB의 비밀번호 관리자 시험 계정, 이메일 로그인 켬) — 그대로(`specs/auth-live/design.md` 사용자 결정 1)
- Supabase·구글 관리 화면 설정 확인 — 사용자 단계(점검 보고서 4장)
- 움직임 쿠키 위조(개발자 도구로 직접 넣기) — 공용 PC의 '다음 사람'을 막는 장치이고 서명 비밀값은 두지 않는다(CLAUDE.md: 비밀값 최소)
