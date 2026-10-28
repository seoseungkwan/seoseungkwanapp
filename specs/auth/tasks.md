# 작업 분할: 로그인·가입 승인·관리자·대시보드 틀

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 화면 값·문구 기준: `docs/mockups/auth/*.dc.html`, 색·글자 규칙: `docs/UI_GUIDE.md`. 이식 원본: 파일럿 `tonggye-bunseok` `fbb303a`(design.md 머리말).

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
- Files: src/lib/auth/inAppBrowser.ts, src/lib/auth/inAppBrowser.test.ts, src/components/auth/AuthFrame.tsx, src/components/auth/AuthFrame.module.css, src/components/auth/LoginCard.tsx, src/components/auth/LoginCard.module.css, src/components/auth/LoginCard.test.tsx, src/components/auth/SignOutButton.tsx, src/components/auth/SignOutButton.test.tsx, src/app/login/page.tsx, src/app/login/page.test.tsx
- Tests: src/lib/auth/inAppBrowser.test.ts, src/components/auth/LoginCard.test.tsx, src/components/auth/SignOutButton.test.tsx, src/app/login/page.test.tsx
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

## TASK-13: 앱 틀 (메뉴·위쪽 띠·폰 서랍)
- REQ: REQ-008
- Files: src/components/shell/menu.ts, src/components/shell/AppShell.tsx, src/components/shell/AppShell.module.css, src/components/shell/SideMenu.tsx, src/components/shell/SideMenu.module.css, src/components/shell/AccountMenu.tsx, src/components/shell/AccountMenu.module.css, src/components/shell/MobileNav.tsx, src/components/shell/MobileNav.module.css, src/components/shell/shell.test.tsx, src/app/(app)/layout.tsx, src/app/(app)/layout.test.tsx
- Tests: src/components/shell/shell.test.tsx, src/app/(app)/layout.test.tsx
- TDD: required

## TASK-14: 대시보드 첫 화면
- REQ: REQ-009
- Files: src/components/dashboard/todayTitle.ts, src/components/dashboard/todayTitle.test.ts, src/components/dashboard/DashboardEmpty.tsx, src/components/dashboard/DashboardEmpty.module.css, src/components/dashboard/DashboardEmpty.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/todayTitle.test.ts, src/components/dashboard/DashboardEmpty.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required

## TASK-15: 관리자 · 가입 신청 목록
- REQ: REQ-007
- Files: src/lib/auth/admin.ts, src/lib/auth/admin.test.ts, src/components/admin/applications.ts, src/components/admin/applications.test.ts, src/components/admin/AdminApplications.tsx, src/components/admin/AdminApplications.module.css, src/components/admin/AdminApplications.test.tsx, src/app/(app)/admin/page.tsx, src/app/(app)/admin/page.test.tsx
- Tests: src/lib/auth/admin.test.ts, src/components/admin/applications.test.ts, src/components/admin/AdminApplications.test.tsx, src/app/(app)/admin/page.test.tsx
- TDD: required
