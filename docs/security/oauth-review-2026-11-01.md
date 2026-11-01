# 구글 로그인(OAuth) 보안 점검 — 2026-11-01

점검 기준: `.claude/skills/oauth-security/SKILL.md`(14개 항목)
대상: 구글 OAuth + Supabase 로그인(`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.117.3), 공용 PC 사용 가정
범위: 코드 읽기만 했다. 앱 코드는 고치지 않았다. Supabase·구글 관리 화면 설정은 보지 못했다(4장)

## 1. 근거로 삼은 자료
- worldmetrics.org "OAuth 서비스 Top 10"(2026). 보안 지침서가 아니라 업체 순위 글이다. 업체를 평가할 때 쓴 기준은 PKCE, 리디렉트 주소 검증, scope 경계, 토큰 수명·폐기·조회, 서명 키 교체, 동의 화면, 출시 전 독립 점검이다
- 그 글에 없는 항목(state·CSRF, 토큰 저장, HTTPS, 만료, refresh token 회전)은 OAuth 2.0 보안 모범사례(RFC 9700)에서 가져왔다
- 라이브러리 동작은 고정된 판의 원본을 unpkg에서 받아 확인했다. 아래 '근거'에 파일·줄을 적었다

## 2. 약점 (심각한 순서)

### 높음
**W1. 브라우저를 닫아도 로그인이 약 400일 유지된다. 서버는 비활동 시간을 보지 않는다**
- 위치: `src/lib/supabase/browser.ts:12`, `src/lib/supabase/server.ts:15`, `src/lib/supabase/middleware.ts:13`, `src/app/(app)/layout.tsx:22`
- 장면: 총괄이 로그아웃하지 않고 크롬을 닫는다. 다음 사람이 사이트를 열면 middleware가 토큰을 새로 고쳐 총괄의 대시보드로 들어간다. 30분 자동 로그아웃은 앱 화면이 열려 있을 때만 도는 브라우저 시계다
- 근거: `@supabase/ssr@0.12.7` `dist/main/utils/constants.js`의 `DEFAULT_COOKIE_OPTIONS`(maxAge 400일, httpOnly false). `dist/main/cookies.js` 230·470줄은 `cookieOptions`를 합친 뒤 `maxAge`를 기본값으로 다시 덮어쓴다 → 옵션 한 줄로는 못 고친다
- 고치는 법(사용자 결정 필요, 6장 Q2):
  - (가) 무료: '마지막 활동 시각' 쿠키를 두고, middleware가 30분이 지났으면 로그아웃으로 본다. 세 `setAll`에서 maxAge를 빼 브라우저를 닫으면 사라지는 쿠키로 바꾸는 것도 함께 검토한다. 크롬 '이전 세션 이어서 열기'는 이런 쿠키도 되살리므로 서버 쪽 판정이 핵심이다
  - (나) 유료: Supabase 세션 시간 제한·비활동 제한(Pro 요금제로 안다, 확인 안 됨)
  - (다) 그대로 두고 운영 규칙으로 막는다

**W2. 앱에서 로그아웃해도 크롬에는 구글 계정 로그인이 남는다**
- 위치: `src/components/auth/LoginCard.tsx:45-47`(`queryParams` 없음)
- 장면: 다음 사람이 [구글로 시작하기]를 누르면 크롬에 남은 총괄(관리자) 구글 계정으로 바로 들어갈 수 있다
- 근거: `queryParams`는 구글까지 그대로 전달된다(auth-js 원본). 구글이 묻지 않고 바로 넘기는지는 구글의 동작이라 확인 안 됨
- 고치는 법: `queryParams: { prompt: 'select_account' }`로 계정 선택 화면을 늘 띄운다. 로그아웃 뒤 "구글에서도 로그아웃하세요" 안내를 보인다. 운영 규칙으로 사람마다 크롬 프로필을 나눈다

### 중간
**W3. 로그인 열쇠를 화면 스크립트가 읽을 수 있고, CSP가 인라인 스크립트를 허용한다**
- 위치: `src/lib/csp.ts:11`(`script-src 'self' 'unsafe-inline'`)
- 장면: HTML이 끼어드는 버그가 하나라도 생기면 인라인 스크립트가 refresh token 쿠키를 읽어 페이지 이동으로 빼낼 수 있다 → 다른 PC에서 계정을 쓴다. 지금 그런 구멍은 찾지 못했다(이번 범위의 파일만 봤다)
- 근거: 쿠키 httpOnly false(`constants.js`)
- 고치는 법: nonce 방식 CSP + `'strict-dynamic'`으로 `'unsafe-inline'`을 뺀다. 대신 모든 페이지가 요청마다 그려진다(정적 페이지가 사라진다)

**W4. 드물게 로그아웃이 조용히 실패해 열쇠가 남는다**
- 위치: `src/components/auth/SignOutButton.tsx:9`, `src/components/shell/IdleLogout.tsx:13`(돌려받은 `error`를 보지 않는다)
- 장면: PC가 1시간 넘게 잠잔다(access token 만료) → 와이파이가 붙기 전에 깨어난다 → 첫 움직임에 자동 로그아웃이 돈다 → 토큰 갱신이 실패한다. 이때 `signOut`은 세션을 지우지 않고 오류만 돌려준다. 인터넷이 붙은 뒤 누구든 사이트를 열면 로그인된 채다
- 근거: `@supabase/auth-js@2.117.3` `src/GoTrueClient.ts`
  - 5122줄: 갱신이 인터넷 오류(재시도 가능한 오류)로 실패하면 저장된 세션을 지우지 않는다
  - 3081·3109줄: `__loadSession`이 그 오류를 그대로 돌려준다
  - 4082줄 `_signOut`: 세션 읽기 오류면 `_removeSession()` 전에 돌아간다
  - 서버 로그아웃 호출 자체가 실패할 때는 이 브라우저의 세션을 지운다(그 경우는 안전)
- 고치는 법: `error`가 오면 `sb-<ref>-auth-token*` 쿠키를 직접 지우고 /login으로 간다. `signOut` 실패 시험을 더한다

### 낮음
- **W5.** 세션 쿠키에 `secure` 표시가 없다(`@supabase/ssr` 원본에 `secure` 기본값 없음). HSTS도 `next.config.ts:6-17`에 직접 넣지 않았다. Vercel이 HSTS를 붙여 주는지는 확인 안 됨. 고치는 법: `cookieOptions: { secure: true }`(이 값은 덮어쓰지 않는다), `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- **W6.** `/signup`·`/pending`에 자동 로그아웃이 없다(`IdleLogout`은 `src/app/(app)/layout.tsx:22`에만 있다). 신청자 이름·연락처가 화면에 남는다
- **W7.** 한 탭에서 로그아웃해도 다른 탭은 이미 그린 화면을 계속 보인다. 탭 사이 채널(`src/lib/auth/idle.ts:14`)은 '움직였다'만 나른다. 고치는 법: 'signout' 소식도 나른다
- **W8.** 로그인 콜백의 리디렉트(`src/app/auth/callback/route.ts:14·19`)가 세션 쿠키를 내보내면서 `Cache-Control: no-store`를 붙이지 않는다. `server.ts:15`의 `setAll`이 라이브러리가 주는 헤더 인자를 버린다

## 3. 받아들인 위험 (사용자 결정, 다시 볼지 6장 Q4)
- 비밀번호만으로 들어가는 관리자 시험 계정이 운영 DB에 있다 — `specs/auth-live/design.md:248`(사용자 결정 1, 2026-10-29)
- 시험 계정 때문에 이메일 로그인이 켜져 있다 — `specs/auth-live/design.md:213`. 사용자 지정 SMTP를 넣으면 '확인 메일을 못 받음' 방어가 사라지니 그때 다시 본다

## 4. 사용자가 관리 화면에서 확인할 것
| 어디 | 무엇 |
|---|---|
| Supabase → Authentication → URL Configuration | Site URL = 운영 주소. Redirect URLs에 `*`·`**`가 없고 `https://<운영 주소>/auth/callback`만 정확히. 개발이 끝나면 `http://localhost:3000/auth/callback`을 뺀다(`specs/auth-live/design.md:158`) |
| Supabase → Authentication → Sessions | refresh token 회전 켬, 재사용 간격 10초. 시간 제한·비활동 제한이 무료 플랜에 있는지 |
| Supabase → Project Settings → JWT | 열쇠 유효 시간 3600초 이하. 서명 키 방식(비대칭 / 옛 HS256) |
| 구글 계정 → 보안 | 운영자 계정 2단계 인증 켬(`plan.md` §6-4) |
| Google Cloud → OAuth 동의 화면 | 앱 이름이 맞는지, 요청 범위가 openid·email·profile뿐인지, 승인된 리디렉트 URI가 `https://<ref>.supabase.co/auth/v1/callback` 하나인지 |

## 5. 이미 잘 된 것
- PKCE가 켜져 있고(`@supabase/ssr` 기본), 코드 교환에 검증값이 필요하다 → 로그인 위조(CSRF)를 막는다
- 로그인은 `signInWithOAuth`만 쓰고 scope를 더하지 않는다
- 콜백·문지기는 고정 경로로만 보낸다. `next`·`returnTo`를 읽지 않는다(열린 리디렉트 없음)
- 서버는 `getUser()`로 확인한다. 서버에서 `getSession()`을 믿지 않는다
- middleware가 새로 고친 쿠키와 캐시 금지 헤더를 리디렉트 응답에 옮긴다
- 로그아웃은 global(모든 기기)이고, 페이지를 새로 열어 메모리의 화면 상태까지 지운다
- CSP: `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`, `connect-src` 와일드카드 없음. `Referrer-Policy: no-referrer`로 주소의 `?code`가 새지 않는다
- RLS: 권한을 모두 회수한 뒤 칸 단위로 준다. 상태 바꾸기 함수는 `security definer` + `search_path = ''`

## 6. 정할 것 (사용자 인터뷰)
- **Q1.** 그 PC를 여러 사람이 같은 윈도우 계정·같은 크롬으로 쓰나? → 그렇다면 W2가 가장 급하다
- **Q2.** W1을 (가) 무료 서버 판정 / (나) Supabase 유료 / (다) 운영 규칙 중 무엇으로 막나? 추천은 (가)
- **Q3.** W3의 nonce CSP를 지금 하나, 화면을 다 만든 뒤에 하나?
- **Q4.** 3장의 받아들인 위험(비밀번호 관리자 시험 계정)을 그대로 둘까?

고치는 일은 프로젝트 규칙대로 `/sdd` 명세(`specs/<기능ID>/`) → 승인 → 시험 먼저(`/tdd`) 순서로 한다.

## 부록: 점검 방법
같은 점검을 스킬 없이 한 번, 스킬을 넣고 한 번 돌려 비교했다. 스킬 없이는 라이브러리 동작을 기억에 기대어 말했다("서버 로그아웃이 실패하면 세션이 남는다" — 이 판에서는 틀림). 대시보드 설정과 받아들인 위험도 빠졌다. 스킬을 넣자 모든 주장에 원본 줄을 근거로 들었고, 4장·3장을 따로 냈다. 두 번째 점검에서 새로 나온 W5·W7은 스킬 점검표에 더했다.
