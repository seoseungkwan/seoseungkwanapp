# 작업 분할: 로그인·가입 승인·관리자·대시보드 틀

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 화면 문구·순서 기준: `docs/mockups/auth/*.dc.html`. 모양·색 기준(2026-10-29): `docs/mockups/app-redesign/`(시안 A·블루 팔레트)와 `docs/UI_GUIDE.md` '앱 화면'. 이식 원본: 파일럿 `tonggye-bunseok` `fbb303a`(design.md 머리말).
> **할 순서**: TASK-1~12(완료) → TASK-16 → TASK-17 → TASK-13 → TASK-14 → TASK-15 → TASK-18. 아래도 이 순서로 적었다(번호 순서가 아님). TASK-13~15는 Tailwind 설정(16)과 공통 모양(17)이 있어야 한다.

## TASK-1: 패키지와 시험 설정
- REQ: REQ-001
- Files: package.json, package-lock.json, vitest.config.ts, .env.example
- TDD: exempt — 설정만 한다. `@supabase/ssr` 0.12.7·`@supabase/supabase-js` 2.117.3·`server-only` 0.0.1(파일럿과 같게 고정), dev로 `@electric-sql/pglite` 0.5.9·`jsdom`·`@testing-library/react`·`@testing-library/dom`·`@testing-library/user-event`(파일럿 버전)를 넣는다. vitest `include`에 `supabase/**/*.test.ts`를 더하고, 시험에서 `server-only` import가 터지지 않게 한다. `.env.example`에는 이름만(`NEXT_PUBLIC_SUPABASE_URL=`·`NEXT_PUBLIC_SUPABASE_ANON_KEY=`). 끝 조건: 기존 `npm test`·`npm run lint`·`npm run build`가 그대로 통과하고, `// @vitest-environment jsdom` 빈 시험 하나가 돈다(확인 뒤 지움)

## TASK-2: Supabase 연결
- REQ: REQ-001
- Files: src/lib/supabase/env.ts, src/lib/supabase/browser.ts, src/lib/supabase/server.ts, src/lib/supabase/middleware.ts, src/lib/supabase/env.test.ts, src/lib/supabase/browser.test.ts, src/lib/supabase/server.test.ts, src/lib/supabase/middleware.test.ts
- Tests: src/lib/supabase/env.test.ts, src/lib/supabase/browser.test.ts, src/lib/supabase/server.test.ts, src/lib/supabase/middleware.test.ts
- TDD: required

## TASK-3: DB 표·권한·승인 함수
- REQ: REQ-006
- Files: supabase/migrations/20261028000000_auth.sql, supabase/rls.test.ts, src/types/db.ts
- Tests: supabase/rls.test.ts
- TDD: required

## TASK-4: 경로 문지기 (순수 함수)
- REQ: REQ-002
- Files: src/lib/auth/gate.ts, src/lib/auth/gate.test.ts
- Tests: src/lib/auth/gate.test.ts
- TDD: required

## TASK-5: 오류 문구와 오류 카드
- REQ: REQ-012, REQ-002
- Files: src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts, src/components/common/ErrorCard.tsx, src/components/common/ErrorCard.module.css, src/components/common/ErrorCard.test.tsx, src/app/error.tsx, src/app/error.test.tsx
- Tests: src/lib/errors.test.ts, src/components/common/ErrorCard.test.tsx, src/app/error.test.tsx
- TDD: required

## TASK-6: 서버에서 내 병원 읽기와 페이지 guard
- REQ: REQ-002
- Files: src/lib/auth/hospital.server.ts, src/lib/auth/hospital.server.test.ts, src/lib/auth/guard.server.ts, src/lib/auth/guard.server.test.ts
- Tests: src/lib/auth/hospital.server.test.ts, src/lib/auth/guard.server.test.ts
- TDD: required

## TASK-7: middleware와 로그인 콜백
- REQ: REQ-002, REQ-003
- Files: src/middleware.ts, src/middleware.test.ts, src/app/auth/callback/route.ts, src/app/auth/callback/route.test.ts
- Tests: src/middleware.test.ts, src/app/auth/callback/route.test.ts
- TDD: required

## TASK-8: CSP·보안 헤더
- REQ: REQ-011
- Files: src/lib/csp.ts, src/lib/csp.test.ts, next.config.ts
- Tests: src/lib/csp.test.ts
- TDD: required

## TASK-9: 로그인 화면과 로그아웃 단추
- REQ: REQ-003
- Files: src/lib/auth/inAppBrowser.ts, src/lib/auth/inAppBrowser.test.ts, src/components/auth/AuthFrame.tsx, src/components/auth/AuthFrame.module.css, src/components/auth/LoginCard.tsx, src/components/auth/LoginCard.module.css, src/components/auth/LoginCard.test.tsx, src/components/auth/SignOutButton.tsx, src/components/auth/SignOutButton.test.tsx, src/app/login/page.tsx, src/app/login/page.test.tsx, src/app/error.tsx, src/app/error.test.tsx, src/components/common/ErrorCard.module.css
- Tests: src/lib/auth/inAppBrowser.test.ts, src/components/auth/LoginCard.test.tsx, src/components/auth/SignOutButton.test.tsx, src/app/login/page.test.tsx, src/app/error.test.tsx
- TDD: required

## TASK-10: 가입 신청
- REQ: REQ-004
- Files: src/lib/auth/signup.ts, src/lib/auth/signup.test.ts, src/lib/auth/hospital.ts, src/lib/auth/hospital.test.ts, src/components/auth/SignupForm.tsx, src/components/auth/SignupForm.module.css, src/components/auth/SignupForm.test.tsx, src/app/(onboarding)/signup/page.tsx, src/app/(onboarding)/signup/page.test.tsx
- Tests: src/lib/auth/signup.test.ts, src/lib/auth/hospital.test.ts, src/components/auth/SignupForm.test.tsx, src/app/(onboarding)/signup/page.test.tsx
- TDD: required

## TASK-11: 승인 대기·거절 화면
- REQ: REQ-005
- Files: src/components/auth/PendingCard.tsx, src/components/auth/PendingCard.module.css, src/components/auth/PendingCard.test.tsx, src/app/(onboarding)/pending/page.tsx, src/app/(onboarding)/pending/page.test.tsx
- Tests: src/components/auth/PendingCard.test.tsx, src/app/(onboarding)/pending/page.test.tsx
- TDD: required

## TASK-12: 30분 자동 로그아웃
- REQ: REQ-010
- Files: src/lib/auth/idle.ts, src/lib/auth/idle.test.ts, src/components/shell/IdleLogout.tsx, src/components/shell/IdleLogout.test.tsx
- Tests: src/lib/auth/idle.test.ts, src/components/shell/IdleLogout.test.tsx
- TDD: required

## TASK-16: Tailwind CSS v4 설정과 토큰
- REQ: REQ-013
- Files: package.json, package-lock.json, postcss.config.mjs, vitest.config.ts, src/app/globals.css, src/app/layout.tsx, src/app/theme.test.ts
- Tests: src/app/theme.test.ts
- TDD: required — 개발 패키지 `tailwindcss`·`@tailwindcss/postcss`·`postcss`를 같은 4.x 계열로 `^` 없이 고정해 넣고, `postcss.config.mjs`에는 `@tailwindcss/postcss` 하나만 둔다. globals.css 맨 위에 `@layer theme, base, components, utilities;`·`@import "tailwindcss/theme.css" layer(theme);`·`@import "tailwindcss/utilities.css" layer(utilities);`(Preflight 없음), `@theme`에 UI_GUIDE '앱 화면' 토큰(`--color-*: initial` 뒤 색 13개, `--radius-card`·`--radius-chip`, `--text-*` 11개와 줄 높이, `--shadow-float`, `--font-sans`), `@layer base`에 `.app-ui` 초기화(design.md 'Tailwind는 Preflight 없이'). 기존 랜딩 변수·body·a·모션 줄이기 블록은 그대로 둔다. layout.tsx는 next/font 변수 이름만 `--font-plex`·`--font-grotesk`로 바꾸고 globals.css에서 `--font-sans`·`--font-num`을 잇는다(design.md '글꼴 변수 이름'). vitest.config.ts는 시험이 PostCSS를 돌리다 깨질 때만 고친다. `theme.test.ts`(AC-013.1)는 globals.css·postcss.config.mjs·layout.tsx·package.json을 읽어 토큰 값·Preflight 없음·패키지 고정을 본다. 끝 조건: `npm test`·`npm run lint`·`npm run build`가 통과하고, 랜딩 `/`의 dev-browser 스크린샷(1440·390)과 빌드된 랜딩 CSS의 `-webkit-` 줄이 Tailwind 넣기 전과 같다(design.md '화면 확인 방법'). 다르면 멈추고 사용자에게 묻는다

## TASK-17: 이미 만든 화면을 Tailwind + 블루로 다시 입히기
- REQ: REQ-013, REQ-003, REQ-004, REQ-005, REQ-012
- Files: src/components/ui/classes.ts, src/components/ui/classes.test.ts, src/components/auth/AuthFrame.tsx, src/components/auth/AuthFrame.module.css, src/components/auth/LoginCard.tsx, src/components/auth/LoginCard.module.css, src/components/auth/LoginCard.test.tsx, src/components/auth/SignupForm.tsx, src/components/auth/SignupForm.module.css, src/components/auth/SignupForm.test.tsx, src/components/auth/PendingCard.tsx, src/components/auth/PendingCard.module.css, src/components/auth/PendingCard.test.tsx, src/components/common/ErrorCard.tsx, src/components/common/ErrorCard.module.css, src/components/common/ErrorCard.test.tsx, src/app/error.tsx, src/app/error.test.tsx, src/app/login/page.test.tsx
- Tests: src/components/ui/classes.test.ts, src/components/auth/LoginCard.test.tsx, src/components/auth/SignupForm.test.tsx, src/components/auth/PendingCard.test.tsx, src/components/common/ErrorCard.test.tsx, src/app/error.test.tsx, src/app/login/page.test.tsx
- TDD: required — 먼저 `ui/classes.ts`(UI_GUIDE '앱 화면'의 단추·입력란·체크 상자·칩·카드·패널·표·초점 고리)를 시험(AC-013.2·013.3·013.4)과 함께 만든다. 그다음 화면마다 고쳐 쓴 모양 시험이 실패(RED)하는 것을 본 뒤 다시 입힌다(design.md '이미 만든 화면 다시 입히기'의 표와 시험 목록). CSS 값 시험은 지우거나 약하게 하지 않고 같은 AC ID로 새 클래스·토큰을 보도록 고쳐 쓴다. 문구·순서·동작 시험은 바꾸지 않고 그대로 통과해야 한다. 끝에 `*.module.css` 5개(AuthFrame·LoginCard·SignupForm·PendingCard·ErrorCard)를 지운다. 랜딩 파일은 건드리지 않는다

## TASK-13: 앱 틀 (위쪽 띠·가로 밑줄 탭·폰 옆 밀기·준비 중)
- REQ: REQ-008, REQ-013
- Files: src/components/shell/menu.ts, src/components/shell/kstNow.ts, src/components/shell/kstNow.test.ts, src/components/shell/AppShell.tsx, src/components/shell/TabBar.tsx, src/components/shell/AccountMenu.tsx, src/components/shell/KstClock.tsx, src/components/shell/shell.test.tsx, src/app/(app)/layout.tsx, src/app/(app)/layout.test.tsx
- Tests: src/components/shell/kstNow.test.ts, src/components/shell/shell.test.tsx, src/app/(app)/layout.test.tsx
- TDD: required — 모양은 UI_GUIDE '앱 화면'과 design.md '앱 틀'. 공통 모양은 `ui/classes.ts`를 가져다 쓰기만 한다. CSS Module을 만들지 않는다. 왼쪽 메뉴·폰 서랍(SideMenu·MobileNav)은 만들지 않는다

## TASK-14: 대시보드 빈 자리 (제목 + 준비 중 안내)
- REQ: REQ-009, REQ-013
- Files: src/components/dashboard/todayTitle.ts, src/components/dashboard/todayTitle.test.ts, src/components/dashboard/DashboardEmpty.tsx, src/components/dashboard/DashboardEmpty.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/todayTitle.test.ts, src/components/dashboard/DashboardEmpty.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required — 범위는 design.md '대시보드 범위': 제목과 빈 안내 상자 하나만. 숫자 카드·패널·예시 숫자·데이터 읽기는 만들지 않는다 (대시보드 내용은 별도 명세)

## TASK-15: 관리자 · 가입 신청 목록 (새 모양)
- REQ: REQ-007, REQ-013
- Files: src/lib/auth/admin.ts, src/lib/auth/admin.test.ts, src/components/admin/applications.ts, src/components/admin/applications.test.ts, src/components/admin/AdminApplications.tsx, src/components/admin/AdminApplications.test.tsx, src/app/(app)/admin/page.tsx, src/app/(app)/admin/page.test.tsx
- Tests: src/lib/auth/admin.test.ts, src/components/admin/applications.test.ts, src/components/admin/AdminApplications.test.tsx, src/app/(app)/admin/page.test.tsx
- TDD: required — 모양은 design.md '관리자'와 UI_GUIDE '앱 화면'(화면 안 탭·표·칩·확인 창·폰 쌓기). 공통 모양은 `ui/classes.ts`를 가져다 쓰기만 한다

## TASK-18: 화면 확인 (dev-browser 1440px·390px, 시안과 비교해 고치기)
- REQ: REQ-013, REQ-007, REQ-008, REQ-009
- Files: src/components/ui/classes.ts, src/components/ui/classes.test.ts, src/components/auth/AuthFrame.tsx, src/components/auth/LoginCard.tsx, src/components/auth/LoginCard.test.tsx, src/components/auth/SignupForm.tsx, src/components/auth/SignupForm.test.tsx, src/components/auth/PendingCard.tsx, src/components/auth/PendingCard.test.tsx, src/components/common/ErrorCard.tsx, src/components/common/ErrorCard.test.tsx, src/app/error.tsx, src/app/error.test.tsx, src/components/shell/AppShell.tsx, src/components/shell/TabBar.tsx, src/components/shell/AccountMenu.tsx, src/components/shell/KstClock.tsx, src/components/shell/shell.test.tsx, src/components/dashboard/DashboardEmpty.tsx, src/components/dashboard/DashboardEmpty.test.tsx, src/components/admin/AdminApplications.tsx, src/components/admin/AdminApplications.test.tsx, src/app/globals.css, src/app/theme.test.ts
- Tests: src/components/ui/classes.test.ts, src/components/auth/LoginCard.test.tsx, src/components/auth/SignupForm.test.tsx, src/components/auth/PendingCard.test.tsx, src/components/common/ErrorCard.test.tsx, src/app/error.test.tsx, src/components/shell/shell.test.tsx, src/components/dashboard/DashboardEmpty.test.tsx, src/components/admin/AdminApplications.test.tsx, src/app/theme.test.ts
- TDD: required — 찍기·비교 방법은 design.md '화면 확인 방법'(가짜 Supabase·찍기 스크립트·스크린샷은 저장소 밖 scratchpad, 새 패키지 없음, `@playwright/test` 넣지 않음, 앱 코드에 우회 길 없음). 모든 앱 화면을 1440px·390px로 찍어 시안 A·블루 팔레트·진료 기록지 폰 화면과 비교한다. 다른 점을 고칠 때는 그 모양을 보는 시험을 먼저 고쳐 실패(RED)를 본 뒤 고친다. 의도한 차이는 design.md에 적힌 것만 남긴다. 고칠 것이 없으면 파일을 바꾸지 않는다. 끝에 두 폭 스크린샷을 사용자에게 보인다
