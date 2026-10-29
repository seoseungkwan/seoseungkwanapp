# 작업 분할: 실제 Supabase·구글 로그인·E2E·Vercel 연결

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 앱 코드(`src/`의 화면·인증·middleware·콜백)는 고치지 않는다(design.md '기존 코드 확인'). E2E가 앱 버그를 찾으면 멈추고, 고칠 TASK를 이 명세에 더해 다시 승인받는다.
> 바깥 콘솔 일(S1~S13)은 TASK가 아니다 — design.md '사용자 단계'. 각 TASK에 기다리는 단계를 적었다.
> **할 순서**: Phase 1(TASK-1~6) → 사용자 단계 S1~S6 → Phase 2(TASK-7~9) → Phase 3(TASK-10 → S7~S13).

## Phase 1 — E2E 틀 (바깥 연결 없음, 기다리는 사용자 단계 없음)

## TASK-1: 문서 — ADR-017·ADR-013·CLAUDE.md·ARCHITECTURE.md
- REQ: REQ-001, REQ-009
- Files: docs/ADR.md, CLAUDE.md, docs/ARCHITECTURE.md
- TDD: exempt — 문서만 고친다. ADR-017(E2E는 `@playwright/test` 1.64.1, 실제 Supabase + 시험 계정 4개, 쿠키 넣기 로그인, trace·영상·스크린샷 끔, 상태를 바꾸는 승인은 E2E에서 하지 않음, 구글 로그인은 폰 손 확인, 화면 스크린샷은 그대로 dev-browser — design.md '결정과 트레이드오프'의 ADR-017)를 더하고, ADR-015 끝에 "E2E는 ADR-017이 바꿈" 한 줄, ADR-013에 배포 방법 한 줄(CLI 배포만·깃 자동 배포 끔·배포마다 사용자 OK·icn1). 번호는 17이다(16은 `wt-ai-report`의 pptxgenjs). CLAUDE.md는 기술 스택의 "E2E 도구: 미정 — 파일럿 이식 때 정함"을 `@playwright/test`(`npm run e2e`, `npm test`와 따로, ADR-017)로, 명령어 목록에 `npm run e2e`·`npm run e2e:env`를 한 줄씩. ARCHITECTURE.md 디렉토리 구조에 `e2e/`·`supabase/*.sql` 한 줄. 다른 규칙 문장은 바꾸지 않는다

## TASK-2: E2E 값 읽기·시작 전 검사 (순수)
- REQ: REQ-002
- Files: e2e/lib/env.ts, e2e/lib/env.test.ts, vitest.config.ts, .env.example
- Tests: e2e/lib/env.test.ts
- TDD: required — `readE2eEnv`·`authSettingsProblems`·`checkSupabase`(fetch 주입)·`startProblemMessage`(design.md '인터페이스'). 시험은 문제 목록·메시지에 넣은 값이 한 글자도 없는지도 본다(AC-002.2). `checkSupabase`의 가짜 응답은 Supabase `/auth/v1/settings` 모양으로(실제 칸 이름은 S1 뒤 실제 응답으로 한 번 더 맞춘다 — 그때 고치면 이 시험부터 고친다). vitest.config.ts는 `include`에 `e2e/**/*.test.ts` 하나만 더한다(`*.spec.ts`는 넣지 않는다). `.env.example`에 이름 10개를 값 없이(AC-002.5)

## TASK-3: Playwright 설치·설정·`npm run e2e`
- REQ: REQ-001, REQ-002
- Files: package.json, package-lock.json, playwright.config.ts, e2e/config.ts, e2e/config.test.ts, e2e/preflight.ts, .gitignore
- Tests: e2e/config.test.ts
- TDD: required — 먼저 `e2e/config.test.ts`(AC-001.1~001.5: `e2eConfig` 값, `package.json`의 고정 판·`test`·`e2e` 스크립트, `vitest.config.ts`의 include가 `.spec.ts`를 잡지 않음, `.gitignore`의 산출물 폴더)를 쓰고 RED를 본다. 그다음 `npm install -D --save-exact @playwright/test@1.64.1`, `e2e/config.ts`(값만, type import), `playwright.config.ts`(`.env.local`을 `process.loadEnvFile`로 읽고 없으면 넘어감 + `defineConfig(e2eConfig)`), `e2e/preflight.ts`(TASK-2 함수를 이어 붙인 얇은 실행 파일), `.gitignore`에 `test-results/`·`playwright-report/`·`blob-report/`. 크로미움은 `~/.cache/ms-playwright`의 1248을 쓰고 없을 때만 `npx playwright install chromium`. 끝 조건: `npm test`·`npm run lint`·`npm run build` 통과, `npm test`가 시험 계정 없이 끝남, `.env.local` 없이 `npm run e2e`가 빌드 전에 "E2E를 시작하지 못했어요"로 0이 아닌 코드로 멈춤(AC-002.4)

## TASK-4: 세션 쿠키 도우미와 Playwright 접착
- REQ: REQ-003
- Files: e2e/lib/session.ts, e2e/lib/session.test.ts, e2e/support.ts
- Tests: e2e/lib/session.test.ts
- TDD: required — `passwordSession`은 가짜 `fetch`(Supabase 토큰 응답 모양)를 주입해 실제 `@supabase/ssr` 0.12.7이 만드는 쿠키 이름·`base64-` 값·긴 세션의 `.0`·`.1` 조각을 본다(AC-003.1). `toBrowserCookies`(AC-003.2), 실패 메시지에 이메일·비밀번호·토큰 없음(AC-003.3), `accountProblem`(AC-003.4), `src/` 전체에 `signInWithPassword`·`E2E_`가 없음(AC-003.5, 파일을 읽어 본다). `e2e/support.ts`는 design.md '인터페이스'의 support.ts대로 worker 범위 fixture(역할별 한 번 로그인·상태 확인·쿠키 넣기·`forget`·끝에 `signOut({ scope: 'local' })`)이고 단위 시험 없이 TASK-7~9가 쓰면서 확인된다

## TASK-5: `.env.local` 넣기 도우미 (`npm run e2e:env`)
- REQ: REQ-005
- Files: e2e/lib/envFile.ts, e2e/lib/envFile.test.ts, e2e/setup-env.ts, package.json
- Tests: e2e/lib/envFile.test.ts
- TDD: required — `upsertEnvText`(같은 이름 줄만 바꿈·끝에 더함·주석·순서 그대로, AC-005.1), `checkEnvValue`·다시 묻기(AC-005.3), `valueSummary`·출력에 값 없음(AC-005.2), `runEnvSetup`을 주입한 `ask`·`read`·`write`·`print`로 시험(빈 답 = 그대로, 끝에 `readE2eEnv` 문제 목록·종료 코드, AC-005.4). `e2e/setup-env.ts`는 진짜 입력(되울림 끔)·파일(mode 0o600)을 이어 붙인 얇은 실행 파일. `package.json`에는 `e2e:env` 스크립트 한 줄만 더한다. Claude는 이 도우미를 실행하지 않는다(사용자 단계 S5)

## TASK-6: 시험 계정·처음 관리자 SQL
- REQ: REQ-004
- Files: supabase/e2e-accounts.sql, supabase/first-admin.sql, supabase/setup-sql.test.ts
- Tests: supabase/setup-sql.test.ts
- TDD: required — PGlite에서 실제 마이그레이션 → SQL 파일을 그대로 읽어 돌린다(design.md '시험 계정'). 시험: 계정 4개 상태(AC-004.1), 두 번 돌려도 같음·E2E 아닌 줄 그대로·어지럽힌 상태(거절됨·신청 전 줄 생김·관리자 줄 더함)를 되돌림(AC-004.2), 계정 없음·둘·이메일 확인 안 됨이면 오류 + 아무 줄도 안 바뀜(AC-004.3), 운영자 구글 계정 하나일 때만 관리자 + 승인, 둘·없음·병원 줄 없음이면 오류(AC-004.4), 마지막 결과 표에 이메일 없음·파일에 이메일 주소 모양 없음(AC-004.5). 마이그레이션 파일과 `supabase/rls.test.ts`는 고치지 않는다. Phase 1 끝에 Claude가 이 두 SQL과 마이그레이션을 넣은 안내 페이지(S1~S6)를 만든다

## Phase 2 — 실제 Supabase + E2E (사용자 단계 S1~S6 뒤)

## TASK-7: E2E 문지기·화면 흐름
- REQ: REQ-006
- Files: e2e/auth-flow.spec.ts
- Tests: e2e/auth-flow.spec.ts
- TDD: exempt — 시험만 더한다. 대상 코드(문지기·화면·로그아웃·CSP·콜백)는 `auth` 명세에서 이미 만들어 단위 시험을 통과했으므로 구현할 것이 없어 RED 단계가 없다. 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다(커밋하지 않음). 기다림: S1~S6. 시나리오·값 비교 규칙은 design.md 'E2E 시나리오'. 상태를 바꾸는 단추는 누르지 않는다(AC-006.6). 로그아웃 뒤 `accounts.forget('approved')`. 확인: `npm run e2e`

## TASK-8: E2E 보내는 요청·저장된 값
- REQ: REQ-007
- Files: e2e/requests.spec.ts
- Tests: e2e/requests.spec.ts
- TDD: exempt — TASK-7과 같은 이유(시험만, 대상 코드는 이미 있음). 일부러 틀린 기대값으로 실패를 한 번 본다. 기다림: S1~S6. 가입 요청은 `route.abort()`로 끊고 잡힌 횟수 1·시험 뒤 신청 전 계정 병원 줄 0을 본다(AC-007.2). 가는 곳은 origin만 모은다(AC-007.3). 확인: `npm run e2e`

## TASK-9: E2E 실제 DB 권한
- REQ: REQ-008
- Files: e2e/rls-live.spec.ts
- Tests: e2e/rls-live.spec.ts
- TDD: exempt — TASK-7과 같은 이유(시험만, 대상은 이미 적용한 마이그레이션). 일부러 틀린 기대값으로 실패를 한 번 본다. 기다림: S1~S6. supabase-js만, 브라우저 없음. `set_hospital_status`는 무작위 uuid로만 부른다(AC-008.3). 관리자 목록은 'E2E '로 시작하는 줄만 센다(AC-008.5). 끝 조건(Phase 2): `npm run e2e`를 SQL 다시 돌리지 않고 두 번 연달아 통과

## Phase 3 — Vercel 배포 + 폰 확인

## TASK-10: Vercel 설정 파일
- REQ: REQ-009
- Files: vercel.json, .vercelignore, src/vercel-config.test.ts
- Tests: src/vercel-config.test.ts
- TDD: required — 먼저 `src/vercel-config.test.ts`(AC-009.1: framework·regions·`git.deploymentEnabled`, AC-009.2: `.vercelignore` 줄 목록과 `!.env` 되살리기 없음)를 쓰고 RED를 본다. 파일럿 `vercel.json`·`.vercelignore`를 옮기고 design.md '결정과 트레이드오프'의 'Vercel은 CLI 배포만' 줄을 더한다. 기다리는 사용자 단계 없음. 이 TASK 커밋 뒤 S8(프로젝트 만들기) → S9(Supabase URL 설정) → S10(환경 변수) → 사용자 OK → S11(운영 배포) → S12(Claude 확인) → S13(폰 확인 목록). S7(구글 OAuth)은 S11 전 아무 때나
