# 요구사항: 실제 Supabase·구글 로그인·E2E·Vercel 연결

> 기능 ID: `auth-live` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.

## 배경 / 목표
- `auth` 명세(머지됨, main `50c8fe5`)가 로그인·가입 신청·승인 대기·관리자·앱 틀을 만들었지만, 실제 Supabase 프로젝트·구글 OAuth·마이그레이션 넣기·실제 로그인 E2E는 "범위 밖"으로 미뤘다(specs/auth/requirements.md '범위 밖'). 이번에 그것을 한다
- 사용자 결정(2026-10-29)
  - 새 Supabase 프로젝트(서울, 무료 플랜, plan.md §5). 사용자가 폰으로 대시보드에서 만들고, Claude는 claude.ai 안내 페이지(복사 단추)로 돕는다. 긴 SQL은 터미널에서 복사하면 망가지므로 안내 페이지에 둔다. 마이그레이션 `supabase/migrations/20261028000000_auth.sql`은 고치지 않고 SQL 편집기에 그대로 넣는다
  - 구글 OAuth는 새로 만든다(plan.md §5). 동의 화면을 게시해 어떤 구글 계정이든 로그인할 수 있게 한다. client secret은 사용자가 Supabase에 직접 넣고 Claude는 보지 않는다
  - E2E 도구는 `@playwright/test`(dev 패키지, 버전 고정). ADR-015·`specs/auth/design.md`의 "`@playwright/test`는 넣지 않는다"를 E2E에 한해 바꾼다 → 새 ADR-017 (ADR-016은 `wt-ai-report` 작업이 pptxgenjs로 쓴다)
  - Vercel 배포를 이번에 넣는다(폰에서 실제 구글 로그인을 확인하려고). 기존 Hobby 계정에 새 프로젝트 `seoseungkwanapp`(주소 예상 https://seoseungkwanapp.vercel.app — 이름이 이미 있으면 Vercel이 정한 주소), 함수 지역 icn1, 운영 환경 변수는 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY` 둘뿐. 운영 배포는 할 때마다 사용자가 그 자리에서 OK 한다(자동 배포 없음)
- 규칙 근거: CLAUDE.md 보안 규칙 — 앱 코드에 시험용 로그인·우회 없음, E2E 로그인은 시험 코드가 세션 쿠키를 넣음, 시험 계정은 `.env.local`에만, service role 키 없음, 시험 산출물에 쿠키·토큰 없음(`trace: 'off'`), 보내는 요청과 저장된 값을 E2E로 확인
- 구글 로그인 자체는 자동 시험이 안 된다(구글이 자동 브라우저를 막는다) → 사용자가 폰으로 운영 주소에서 손으로 확인한다. 확인 목록은 `design.md` '폰 확인 목록'(남은 일 "긴 이메일 줄바꿈 다시 보기" 포함)
- 바깥 콘솔(Supabase·Google·Vercel) 단계는 TASK가 아니다. 순서와 누가 하는지는 `design.md` '사용자 단계'
- 기존 앱 코드는 바꾸지 않는다. 실제 프로젝트·Vercel에서 그대로 도는지 확인한 근거는 `design.md` '기존 코드 확인'

## 요구사항

### REQ-001: E2E 실행 틀 (Playwright 설정)
- AC-001.1: Given `npm test`(Vitest, verify 관문), When 돌리면, Then `e2e/**/*.spec.ts`는 찾지 않고 네트워크·시험 계정 없이 끝난다. `e2e/` 아래에서는 순수 도우미 단위 시험 `e2e/**/*.test.ts`만 Vitest가 돈다
- AC-001.2: Given `npm run e2e`, When 돌리면, Then 시작 전 검사(REQ-002) → `next build` → Playwright 순서로 돌고, Playwright가 `next start -H 127.0.0.1 -p 3100`을 띄워(0.0.0.0·다른 주소 금지) baseURL `http://127.0.0.1:3100`으로 `e2e/**/*.spec.ts`만 돌린 뒤 서버를 끈다. 이미 떠 있는 서버를 다시 쓰지 않는다
- AC-001.3: Given Playwright 설정, When 읽으면, Then `trace: 'off'`·`video: 'off'`·`screenshot: 'off'`이고 HAR 기록이 없으며, 보고는 글자(`list`)만이다(HTML·blob 보고서 없음). `workers: 1`·`fullyParallel: false`·`forbidOnly: true`·`retries: 0`이다
- AC-001.4: Given `.gitignore`, When 보면, Then Playwright 산출물 폴더 `test-results/`·`playwright-report/`·`blob-report/`가 커밋되지 않는다
- AC-001.5: Given `package.json`, When 보면, Then `@playwright/test`가 devDependencies에 `^` 없이 `1.64.1`로 고정이고, `test` 스크립트는 `vitest run` 그대로이며 `e2e` 스크립트가 따로 있다

### REQ-002: E2E 값과 시작 전 검사
- AC-002.1: Given 환경 값, When `readE2eEnv(env)`를 부르면, Then `NEXT_PUBLIC_SUPABASE_URL`(https `<ref>.supabase.co` origin)·`NEXT_PUBLIC_SUPABASE_ANON_KEY`와 역할 4개(관리자·승인됨·승인 대기·신청 전)의 `E2E_<ADMIN|APPROVED|PENDING|NEW>_EMAIL`·`E2E_<…>_PASSWORD`를 묶어 돌려준다
- AC-002.2: Given 값이 비었거나 규칙에 어긋남, When `readE2eEnv`를 부르면, Then 문제마다 이름과 무엇이 틀렸는지만 적은 목록을 돌려주고 값은 한 글자도 담지 않는다. 규칙: 이메일 앞부분(@ 앞)에 역할 표시(`e2e-admin`·`e2e-approved`·`e2e-pending`·`e2e-new`)가 있다, 이메일 4개가 서로 다르다, 비밀번호는 16자 이상이다, 신청 전 계정 이메일은 40자 이상이다(긴 이메일 줄바꿈 확인용)
- AC-002.3: Given Supabase 공개 설정(`/auth/v1/settings` 응답), When `authSettingsProblems`를 부르면, Then 이메일 로그인이 꺼짐, 이메일 확인(Confirm email)이 꺼짐(자동 확인), 익명 로그인이 켜짐, 새 가입이 꺼짐(구글 새 사용자가 못 들어옴), 응답 모양이 다름 중 해당하는 것을 문제로 돌려준다
- AC-002.4: Given 값 문제·Supabase 응답 없음(멈춤·주소 틀림)·설정 문제 중 하나라도 있음, When `npm run e2e`를 돌리면, Then 빌드와 시험을 하나도 돌리지 않고 0이 아닌 종료 코드로 끝나며 "E2E를 시작하지 못했어요"와 문제 목록·고치는 법(`npm run e2e:env`, Supabase 다시 켜기, 설정 이름)을 보인다. '건너뜀(skip)'으로 통과처럼 끝나지 않는다
- AC-002.5: Given `.env.example`, When 보면, Then 위 10개 이름이 값 없이 있고 service role·비밀 열쇠 이름은 없다

### REQ-003: 시험 코드 로그인 (세션 쿠키 넣기)
- AC-003.1: Given 역할 하나, When `passwordSession`을 부르면, Then 앱과 같은 `@supabase/ssr` `createServerClient`로 `signInWithPassword`를 부르고, 라이브러리가 쓰려던 쿠키(이름 `sb-<ref>-auth-token`, 길면 `.0`·`.1`… 조각, 값은 `base64-`로 시작)를 모아 돌려준다. 앱 코드나 앱 경로를 부르지 않는다
- AC-003.2: Given 모은 쿠키, When `toBrowserCookies(cookies, '127.0.0.1', now)`를 부르면, Then 빈 값(지우기 표시)은 버리고 각 쿠키를 domain `127.0.0.1`·path·httpOnly·secure·sameSite(없으면 `Lax`)·expires(`maxAge`면 now + maxAge초, 없으면 -1)로 옮긴다
- AC-003.3: Given 로그인 실패, When `passwordSession`이 던지면, Then 메시지에는 역할 이름·HTTP 상태·오류 코드만 있고 이메일·비밀번호·토큰은 없다
- AC-003.4: Given 시험 계정의 병원·관리자 상태, When `accountProblem(role, state)`를 부르면, Then 기대(관리자 = approved + admins에 있음, 승인됨 = approved + 관리자 아님, 승인 대기 = pending + 관리자 아님, 신청 전 = 병원 줄 없음 + 관리자 아님)와 다를 때 역할 이름과 "`supabase/e2e-accounts.sql`을 다시 실행" 안내를 돌려준다
- AC-003.5: Given 앱 코드(`src/` 아래 모든 파일), When 읽으면, Then `signInWithPassword`·`E2E_`·시험용 로그인 경로가 없다(로그인은 구글 OAuth뿐)

### REQ-004: 시험 계정·처음 관리자 SQL
- AC-004.1: Given 대시보드에서 만든 이메일 계정 4개, When `supabase/e2e-accounts.sql`을 SQL 편집기(운영자 권한)에서 실행하면, Then 이메일 앞부분의 역할 표시로 계정을 찾아 관리자·승인됨 계정은 `approved` 병원 줄('E2E 관리자 의원'·'E2E 승인 의원'), 승인 대기 계정은 `pending` 줄('E2E 대기 의원', `reviewed_at` 없음), 신청 전 계정은 병원 줄 없음, `admins`에는 E2E 계정 중 관리자 계정만 있게 만든다
- AC-004.2: Given 이미 실행한 뒤(또는 E2E가 상태를 어지럽힌 뒤), When 다시 실행하면, Then 결과가 처음과 같다(되돌리기 도구로 쓴다). E2E 계정이 아닌 사용자의 줄은 건드리지 않는다
- AC-004.3: Given 어떤 역할의 계정이 없음·한 표시에 계정 2개 이상·이메일 확인 안 됨(Auto Confirm 안 함), When 실행하면, Then 아무 줄도 바꾸지 않고 역할 이름과 고치는 법을 담은 오류로 멈춘다
- AC-004.4: Given `supabase/first-admin.sql`, When 운영자가 구글로 처음 로그인·가입 신청한 뒤 실행하면, Then 구글로 들어온 E2E 아닌 계정이 정확히 하나이고 병원 줄이 있을 때만 그 계정을 `admins`에 넣고 그 병원을 `approved`(`reviewed_at` 기록)로 바꾼다. 그 밖이면 아무것도 바꾸지 않고 오류로 멈춘다. 두 번 실행해도 결과가 같다
- AC-004.5: Given 두 SQL 파일, When 끝까지 실행하면, Then 마지막 결과 표에 역할·병원 상태·관리자 여부만 보이고(이메일 없음), 파일 안에는 이메일 주소·비밀번호·열쇠가 없다

### REQ-005: `.env.local` 넣기 도우미
- AC-005.1: Given `npm run e2e:env`, When 실행하면, Then REQ-002의 10개 이름을 차례로 묻고(입력한 글자는 화면에 보이지 않음), `.env.local`에서 같은 이름 줄만 바꾸거나 끝에 더하고 다른 줄·주석·순서는 그대로 둔다. 빈 답이면 그 이름은 그대로 둔다
- AC-005.2: Given 값을 넣은 뒤, When 결과를 보이면, Then 이름마다 "넣음/그대로"와 글자 수·역할 표시 여부만 보이고 값은 출력하지 않는다. 파일 권한은 600이다
- AC-005.3: Given 작은따옴표·줄바꿈·앞뒤 공백이 든 값, When 넣으려 하면, Then 그 이름은 저장하지 않고 다시 묻는다. 저장하는 줄은 `NAME='값'` 꼴이다
- AC-005.4: Given 다 넣은 뒤, When 도우미가 끝나면, Then `readE2eEnv`로 검사해 남은 문제 목록(이름만)을 보이고, 문제가 있으면 0이 아닌 종료 코드로 끝난다

### REQ-006: 실제 Supabase에서 문지기·화면 흐름 (E2E)
- AC-006.1: Given 로그인 안 한 새 브라우저, When `/dashboard`·`/admin`·`/signup`·`/pending`을 열면, Then 같은 origin `/login`으로 가고 [구글로 시작하기]가 보인다. `/`는 랜딩이 그대로 열린다
- AC-006.2: Given 신청 전 계정, When `/dashboard`를 열면, Then `/signup` 가입 신청 화면이 열리고 구글 계정 칸에 그 계정 이메일이 보인다
- AC-006.3: Given 신청 전 계정과 폰 폭(390×844), When `/signup`을 보면, Then 40자 넘는 이메일이 칸 안에서 줄을 바꿔 다 보이고(잘림·가로 넘침 없음) 페이지에 가로 스크롤이 없다
- AC-006.4: Given 승인 대기 계정, When `/dashboard`·`/signup`을 열면, Then `/pending`으로 가고 "신청을 확인하고 있습니다"·병원 이름 'E2E 대기 의원'·[상태 다시 확인]이 보인다
- AC-006.5: Given 승인된(관리자 아닌) 계정, When `/login`·`/dashboard`를 열면, Then `/dashboard`가 열리고 앱 틀(이름 "메뉴"인 탭 줄, 병원 이름 'E2E 승인 의원', 로그인 이메일이 든 계정 단추)이 보이며 [관리자] 탭은 없다. `/admin`을 열면 `/dashboard`로 간다
- AC-006.6: Given 관리자 계정, When `/admin`을 열면, Then 가입 신청 목록이 열리고 대기 탭에 'E2E 대기 의원' 줄이 있다. 그 줄의 [거절] → 확인 창 → [취소]를 누르면 창이 닫히고 줄은 대기 탭에 그대로다. 상태를 바꾸는 단추([승인]·확인 창의 [거절]·[되돌리기])는 누르지 않는다
- AC-006.7: Given 승인된 계정으로 연 앱 화면, When 계정 메뉴의 [로그아웃]을 누르면, Then `/login`으로 가고 브라우저에 `sb-<ref>-auth-token` 쿠키(조각 포함)가 없으며, 그 뒤 `/dashboard`를 열면 `/login`으로 간다
- AC-006.8: Given `/login` 응답(운영 빌드), When 헤더를 보면, Then CSP `connect-src`는 `'self'`와 실제 Supabase origin 둘뿐이고(와일드카드·`ws:` 없음) `X-Content-Type-Options`·`Referrer-Policy`·`X-Frame-Options`가 있다
- AC-006.9: Given `/auth/callback?next=https://example.com`(code 없음), When 열면, Then 같은 origin `/login?error=1`로 가 `E-AUTH-CALLBACK`을 보이고 example.com으로 가는 요청은 0개다

### REQ-007: 보내는 요청·저장된 값 (E2E)
- AC-007.1: Given 신청 전 계정, When `/signup`에 가짜 값(병원 이름·신청자 이름·연락처 `010-0000-0000`)을 넣고 [가입 신청]을 누르면, Then 브라우저가 보내려는 `POST <Supabase>/rest/v1/hospitals`가 정확히 하나이고, 본문 JSON의 칸은 `name`·`applicant_name`·`phone` 셋뿐이며(`owner_id`·`email`·`status`·`id`·날짜 없음) 값은 넣은 값(연락처는 숫자만 `01000000000`)이다
- AC-007.2: Given AC-007.1의 요청, When 시험이 그 요청을 Supabase로 보내지 않고 끊으면(`route.abort`), Then 화면은 넣은 값을 그대로 두고 `E-SIGNUP-FAILED` 카드를 보인다. 시험이 끝난 뒤 신청 전 계정의 병원 줄은 0개다(남는 상태 없음)
- AC-007.3: Given 로그인 안 함·승인됨·관리자·신청 전 계정으로 앱을 돌아다니는 동안(`/login`·`/dashboard`·`/admin`·`/signup`), When 브라우저가 낸 모든 요청을 모으면, Then 가는 곳은 앱 origin(`http://127.0.0.1:3100`)과 실제 Supabase origin 둘뿐이다(다른 origin 0개)
- AC-007.4: Given 승인 대기 계정, When 자기 병원 줄을 `select('*')`로 읽으면, Then 칸 이름은 `id`·`owner_id`·`name`·`applicant_name`·`phone`·`email`·`status`·`agreed_at`·`reviewed_at`·`created_at` 열 개뿐이고(실제 DB 표에 다른 칸이 없다) `owner_id`는 그 계정 uid, `email`은 그 계정 이메일이다

### REQ-008: 실제 DB 권한 (E2E, supabase-js)
- AC-008.1: Given 공개 열쇠만(로그인 안 함), When `hospitals`·`admins`를 읽거나 `set_hospital_status`를 부르면, Then 모두 오류로 거부된다
- AC-008.2: Given 승인 대기 계정, When `hospitals`·`admins`를 읽으면, Then `hospitals`는 자기 줄 하나(`owner_id` = 자기 uid)만, `admins`는 0줄이다
- AC-008.3: Given 승인된(관리자 아닌) 계정, When `set_hospital_status(무작위 uuid, 'approved')`를 부르면, Then 42501 오류다. 자기 줄의 `status`를 고치려 하면 권한 오류이고 자기 줄은 `approved` 그대로다
- AC-008.4: Given 신청 전 계정, When `status`(또는 `email`·`owner_id`)를 넣어 가입 신청 줄을 넣으려 하면, Then 권한 오류이고 그 계정 병원 줄은 0개 그대로다
- AC-008.5: Given 관리자 계정, When `hospitals`를 읽으면, Then 'E2E '로 시작하는 병원 줄 3개(관리자·승인·대기)가 모두 보인다(다른 줄은 세거나 출력하지 않는다). `admins`를 읽으면 자기 줄 하나뿐이다

### REQ-009: Vercel 배포 설정
- AC-009.1: Given `vercel.json`, When 읽으면, Then `framework`는 `nextjs`, `regions`는 `["icn1"]`, `git.deploymentEnabled`는 `false`다(깃에 올려도 저절로 배포되지 않는다)
- AC-009.2: Given `.vercelignore`, When 읽으면, Then `.env*`(모든 env 파일)·`test-results/`·`playwright-report/`·`blob-report/`·`e2e/`·`playwright.config.ts`·`.vercel/`·`.harness/`·`.claude/`·`specs/`·`phases/`·`scripts/`·`plan*.md`와 실제 EMR 파일 모양(`*.csv`·`*.xls`·`*.xlsx`, 가짜 파일 폴더만 예외)이 올라가지 않는다. `.env`를 되살리는 줄(`!.env…`)은 없다

## 범위 밖
- 파일럿(`tonggye-bunseok`) Vercel·Supabase 내리기 → 새 사이트 확인 뒤 사용자 결정(plan.md §9)
- 개발용 Supabase 분리(plan.md §10). E2E는 운영 DB의 가짜 병원 시험 계정을 쓴다(ADR-005)
- Vercel Pro·자기 도메인·Supabase 사용자 지정 도메인(구글 동의 화면에 `<ref>.supabase.co`가 보인다), Preview 배포, 깃 연결 자동 배포
- 구글 로그인 자동 시험(구글이 막는다) → 폰 확인. 구글 앱 검증·로고(민감 범위가 없어 필요 없음)
- 실제 DB에서 승인·거절·되돌리기가 성공하는 E2E(상태가 남는다) → `supabase/rls.test.ts` AC-006.5·006.6(PGlite)·관리자 화면 시험·폰 확인이 맡는다. 거절 상태 화면 E2E도 없다(PendingCard 시험이 맡는다)
- 30분 자동 로그아웃 E2E(`idle`·`IdleLogout` 단위 시험이 맡는다)
- 환자 자료가 요청에 섞이지 않는지 보는 E2E → 통계 화면이 생길 때 그 명세에서 파일럿 `e2e/support/requests.ts` 방식으로
- 사용자 지정 SMTP·비밀번호 재설정·이메일 로그인 화면(앱에는 구글 로그인뿐)
- CI(GitHub Actions)에서 E2E 돌리기, Supabase CLI로 마이그레이션 자동 넣기
- 대시보드 내용, 직원·원장 계정과 역할(plan.md §10)
- 서비스 이름·로고(plan.md §10). 구글 동의 화면 앱 이름은 임시 이름
