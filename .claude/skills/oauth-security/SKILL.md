---
name: oauth-security
description: 구글 OAuth·Supabase 로그인, 로그인 콜백, 세션 쿠키, 로그아웃·자동 로그아웃, 리디렉트 허용 목록, 관리자 계정, CSP·보안 헤더를 만들거나 고치거나 보안 점검할 때 사용한다. "OAuth 보안", "로그인 보안 점검", "세션이 안 끊겨요", "공용 PC" 같은 요청에도 쓴다.
---

# OAuth 로그인 보안 점검

## 개요
근거는 두 가지다. 하나는 worldmetrics.org의 "OAuth 서비스 Top 10"(2026) 글이 업체를 평가할 때 쓴 기준이다: PKCE, 리디렉트 주소 검증, scope 경계, 토큰 수명·폐기·조회(introspection), 서명 키 교체, 동의 화면, 출시 전 독립 점검. 다른 하나는 그 글에 없는 표준 항목이다: state, 토큰 저장, HTTPS, CSRF, 만료, refresh token 회전(OAuth 2.0 보안 모범사례 RFC 9700).

**핵심:** 이 앱에서 OAuth 흐름 자체는 Supabase가 맡는다. 실제 위험은 **로그인한 뒤 세션이 어디에, 얼마나 오래, 누구 손에 남는가**다. 이 앱은 공용 PC에서 쓴다.

## 점검 규칙
1. 라이브러리 기본 동작을 기억에 기대어 단정하지 않는다. `package.json`에 고정된 판의 원본(`node_modules/` 또는 `https://unpkg.com/<패키지>@<판>/<경로>`)에서 확인하고, 근거로 파일·줄을 적는다. 확인하지 못했으면 "확인 안 됨"이라고 쓴다.
2. 대시보드에만 있는 설정(표에서 **D**로 표시)은 코드만 보고 통과로 판정하지 않는다. 사용자가 확인할 목록에 무엇을 어디서 볼지 적어 따로 낸다.
3. 위협 모델은 공용 PC다. 앱에서 로그아웃한 뒤에도 브라우저에 남는 것(앱 쿠키, 크롬에 로그인된 구글 계정)을 본다.
4. 권한이 높은 계정(관리자, 운영 DB의 시험 관리자 계정)은 로그인 강도를 따로 본다. 사용자가 결정해 기록해 둔 위험(`specs/*/design.md`의 '사용자 결정')은 "받아들인 위험"으로 적고, 약점과 섞지 않는다.

## 체크리스트
| # | 항목 | 볼 곳 | 통과 기준 |
|---|---|---|---|
| 1 | PKCE | `src/lib/supabase/browser.ts`, `@supabase/ssr` 원본 | `flowType`을 바꾸지 않음(기본 pkce). 콜백은 `exchangeCodeForSession` |
| 2 | state·로그인 CSRF | `src/components/auth/LoginCard.tsx` | OAuth 주소를 손으로 만들지 않고 `signInWithOAuth`만 씀 |
| 3 | 리디렉트 정확 일치·열린 리디렉트 | `src/app/auth/callback/route.ts`, `src/lib/auth/gate.ts`, **D** Supabase → URL Configuration | 고정 경로로만 보냄. `next`·`returnTo`를 읽지 않음. 허용 목록에 `*`·`**`가 없음. 운영이 끝나면 localhost를 뺌 |
| 4 | scope 최소 | `signInWithOAuth`의 `options` | `scopes`를 더하지 않음. `provider_token`을 저장하지 않음 |
| 5 | 토큰 저장 | `cookieOptions`, `src/lib/csp.ts` | 쿠키 `httpOnly`를 원본으로 확인. 스크립트가 읽을 수 있으면 CSP `script-src`에 `'unsafe-inline'`이 있는지 봄(nonce 방식이 목표) |
| 6 | 세션 수명 | 세 `setAll`(browser·server·middleware), `IdleLogout`을 붙인 레이아웃 | 브라우저를 닫았다 다시 열면 로그인이 풀리는지, 서버 쪽에 비활동 판정이 있는지, 로그인한 모든 화면(`/signup`·`/pending` 포함)에 자동 로그아웃이 있는지. `@supabase/ssr` 0.12.7은 `cookieOptions.maxAge`를 400일로 덮어쓴다(`cookies.js` 230·470줄) → 옵션이 아니라 `setAll`에서 고쳐야 한다 |
| 7 | 로그아웃·폐기 | `SignOutButton.tsx`, `IdleLogout.tsx`, auth-js `_signOut` 원본 | scope 기본값 global. 서버 호출이 실패할 때, 그리고 토큰 갱신이 실패할 때 이 브라우저의 세션이 지워지는지 원본으로 확인. 한 탭에서 로그아웃하면 다른 탭도 로그아웃되는지 |
| 8 | 공용 PC의 구글 세션 | `LoginCard.tsx` `queryParams` | `prompt: 'select_account'`. 앱에서 로그아웃한 뒤 구글 로그아웃 안내 |
| 9 | 서버의 사용자 확인 | `src/middleware.ts`, `*.server.ts` | `getUser()`(또는 `getClaims()`)를 씀. 서버에서 `getSession()`을 믿지 않음 |
| 10 | 캐시 | 콜백 응답, middleware 응답 | 세션 쿠키를 내보내는 응답에 `Cache-Control: private, no-store` |
| 11 | 토큰 수명·회전·서명 키 | **D** Supabase → Authentication 설정 | refresh token 회전 켬, 재사용 간격 기본값(10초), JWT 만료 3600초 이하, JWT 서명 키 방식 확인 |
| 12 | 관리자 로그인 강도 | `admins` 표, `.env.example` 시험 계정, **D** 구글 계정 | 관리자는 2단계 인증을 씀. 비밀번호만으로 들어가는 관리자 계정이 운영 DB에 있으면 보고 |
| 13 | HTTPS·보안 헤더 | `next.config.ts`, `cookieOptions` | HSTS를 명시. 세션 쿠키에 `secure`. `frame-ancestors 'none'`. `Referrer-Policy: no-referrer`(주소의 `?code`가 새지 않게) |
| 14 | 동의 화면 | **D** Google Cloud → OAuth 동의 화면 | 앱 이름과 요청 scope가 실제와 같음 |

## 보고 형식
1. **약점** (심각한 순서): 파일:줄 · 실제로 벌어지는 장면 · 고치는 법 · 근거(원본 줄, 또는 "확인 안 됨")
2. **사용자가 대시보드에서 확인할 것**: **D** 항목마다 어느 화면의 어떤 칸을 볼지
3. **받아들인 위험**: 기록된 사용자 결정과 그 위치
4. **이미 잘 된 것**: 짧게

## 흔한 실수
| 실수 | 바로잡기 |
|---|---|
| "OAuth 흐름이 표준이니 안전하다" | 흐름은 Supabase가 맡는다. 세션 수명과 공용 PC를 본다 |
| 라이브러리 동작을 단정함(예: "signOut이 실패하면 세션이 남는다") | 판마다 다르다. 고정된 판의 원본 줄을 근거로 든다 |
| 대시보드 설정을 "점검 안 함"으로 끝냄 | **D** 항목마다 어디서 무엇을 볼지 적는다 |
| Vercel 미리보기 주소 때문에 허용 목록에 와일드카드를 넣음 | 운영 주소만 정확히 넣는다 |
| 사용자가 이미 결정한 위험을 약점으로 다시 올림 | "받아들인 위험"으로 따로 적는다 |
