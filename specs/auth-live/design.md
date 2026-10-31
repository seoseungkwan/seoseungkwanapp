# 설계: 실제 Supabase·구글 로그인·E2E·Vercel 연결

> 근거: `requirements.md`, plan.md §5·§6·§9·§10, ADR-002·004·005·006·013·015, CLAUDE.md 보안 규칙, `specs/auth/design.md`.
> 이식 원본: 파일럿 `seoseungkwan/tonggye-bunseok` main의 `playwright.config.ts`·`e2e/support/auth.ts`·`e2e/auth.spec.ts`·`vercel.json`·`.vercelignore`·`src/vercel-config.test.ts` (ADR-002). 파일럿과 다른 점: 127.0.0.1에만 띄움, 시험 계정 4개, 스크린샷 끔, 시작 전 검사, 깃 자동 배포 끔.

## 개요
- 코드 쪽은 E2E 틀(Playwright 설정·시작 전 검사·세션 쿠키 도우미·`.env.local` 도우미)과 시험 계정 SQL, E2E 시험 세 파일, Vercel 설정 파일이다. 앱 코드(`src/`의 화면·인증)는 바꾸지 않는다('기존 코드 확인')
- 바깥 콘솔 일은 '사용자 단계' 순서대로 사용자(폰)와 Claude(터미널)가 나눠 한다. Claude는 claude.ai 안내 페이지(저장소 밖)에 바로가기·복사 단추·SQL을 모아 둔다
- E2E는 실제 Supabase에 붙는다. 로그인은 시험 코드가 Node에서 비밀번호로 하고, `@supabase/ssr`가 만든 세션 쿠키를 그대로 브라우저에 넣는다(앱에는 이메일 로그인 길이 없다). 상태를 바꾸는 동작은 E2E에서 끝까지 하지 않아 몇 번을 돌려도 같다
- 구글 로그인은 사람이 폰으로 운영 주소에서 확인한다('폰 확인 목록')

## 구성 요소와 파일

```
e2e/
├── config.ts             # Playwright 설정 값만(@playwright/test는 type import만) → Vitest가 시험한다
├── config.test.ts        # AC-001.x: 설정·package.json·vitest include·.gitignore
├── preflight.ts          # npm run e2e 첫 단계: .env.local 읽기 → 값·Supabase·설정 검사 → 문제면 멈춤
├── support.ts            # Playwright 접착: worker 범위 fixture `accounts`(역할별 세션 캐시·쿠키 넣기·끝에 세션 끊기)
├── setup-env.ts          # npm run e2e:env: 입력 숨김 질문 → .env.local
├── auth-flow.spec.ts     # REQ-006 문지기·화면 흐름
├── requests.spec.ts      # REQ-007 보내는 요청·저장된 값
├── rls-live.spec.ts      # REQ-008 실제 DB 권한
└── lib/
    ├── env.ts / env.test.ts         # readE2eEnv·authSettingsProblems·checkSupabase·startProblemMessage (순수 + 주입)
    ├── session.ts / session.test.ts # passwordSession·toBrowserCookies·authCookiePattern·accountProblem
    └── envFile.ts / envFile.test.ts # upsertEnvText·valueSummary·runEnvSetup (순수 + 주입)
playwright.config.ts      # .env.local 읽기(process.loadEnvFile, 없으면 넘어감) + defineConfig(e2eConfig)
supabase/
├── e2e-accounts.sql      # 시험 계정 4개의 병원 줄·관리자 줄 맞추기(되풀이 가능, 되돌리기 도구)
├── first-admin.sql       # 운영자 구글 계정을 관리자로 + 자기 병원 승인(한 번)
└── setup-sql.test.ts     # 두 SQL을 PGlite에서 실제로 돌려 본다
vercel.json · .vercelignore · src/vercel-config.test.ts
```
- 이름 규칙: Playwright 시험은 `*.spec.ts`, Vitest 단위 시험은 `*.test.ts`. Vitest `include`에 `e2e/**/*.test.ts`만 더하고, Playwright `testMatch`는 `.spec.ts`만(Playwright 기본값은 `.test.ts`도 잡으므로 꼭 정한다)
- `package.json` 스크립트: `"e2e": "tsx e2e/preflight.ts && next build && playwright test"`, `"e2e:env": "tsx e2e/setup-env.ts"`. `test`는 `vitest run` 그대로

## 인터페이스 (시그니처 수준)

```ts
// e2e/lib/env.ts (순수 + fetch 주입)
export type Role = 'admin' | 'approved' | 'pending' | 'new'
export const ROLES: readonly Role[]                                   // 관리자·승인됨·승인 대기·신청 전
export const ROLE_TAG: Record<Role, string>                           // 'e2e-admin'·'e2e-approved'·'e2e-pending'·'e2e-new'
export const E2E_ENV_NAMES: readonly string[]                         // NEXT_PUBLIC_SUPABASE_URL·…_ANON_KEY + E2E_<ADMIN|APPROVED|PENDING|NEW>_<EMAIL|PASSWORD>
export type Account = { email: string; password: string }
export type E2eEnv = { supabaseUrl: string; anonKey: string; accounts: Record<Role, Account> }
export function readE2eEnv(env: Record<string, string | undefined>): { ok: true; value: E2eEnv } | { ok: false; problems: string[] }
// URL은 src/lib/supabase/env.ts의 supabaseOrigin()을 다시 쓰고, https + '.supabase.co'만 받는다(E2E는 실제 프로젝트에만)
export function authSettingsProblems(settings: unknown): string[]    // /auth/v1/settings 응답 검사(AC-002.3)
export function checkSupabase(env: E2eEnv, fetchFn: typeof fetch): Promise<string[]>  // GET <url>/auth/v1/settings, apikey 헤더. 응답 없음·상태 코드·설정 문제
export function startProblemMessage(problems: string[]): string      // "E2E를 시작하지 못했어요" + 문제 목록 + 고치는 법

// e2e/config.ts
export const APP_HOST = '127.0.0.1'
export const APP_PORT = 3100
export const APP_ORIGIN = 'http://127.0.0.1:3100'
export const e2eConfig: PlaywrightTestConfig
// testDir 'e2e', testMatch /\.spec\.ts$/, outputDir 'test-results', reporter [['list']], workers 1, fullyParallel false,
// forbidOnly true, retries 0, use { baseURL: APP_ORIGIN, trace 'off', video 'off', screenshot 'off', viewport 1366×768 },
// projects [{ name 'chromium', use { browserName 'chromium' } }] (devices 값은 런타임 import라 쓰지 않는다),
// webServer { command 'npx next start -H 127.0.0.1 -p 3100', url APP_ORIGIN + '/login', reuseExistingServer false, timeout 120초 }

// e2e/lib/session.ts
export type CookieToSet = { name: string; value: string; options: CookieOptions }   // @supabase/ssr setAll이 주는 것
export type BrowserCookie = { name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None'; expires: number }
export function authCookiePattern(supabaseUrl: string): RegExp        // ^sb-<ref>-auth-token(\.\d+)?$
export function toBrowserCookies(cookies: CookieToSet[], host: string, nowSec: number): BrowserCookie[]
export function passwordSession(input: { env: E2eEnv; role: Role; fetch?: typeof fetch }): Promise<{ client: SupabaseClient; userId: string; cookies: CookieToSet[] }>
// createServerClient(url, key, { cookies: { getAll: () => [], setAll: 모으기 }, global: { fetch } }) → signInWithPassword
export type AccountState = { hospitalStatus: 'pending' | 'approved' | 'rejected' | null; isAdmin: boolean }
export const EXPECTED_STATE: Record<Role, AccountState>
export function accountProblem(role: Role, actual: AccountState): string | null

// e2e/support.ts (Playwright 접착 — 단위 시험 없음, E2E가 쓰면서 확인된다)
export const test   // base.extend의 worker 범위 fixture `accounts`
//   accounts.signIn(context, role)  처음이면 passwordSession + 자기 병원·관리자 줄 읽어 accountProblem → 문제면 던짐. 캐시한 쿠키를 toBrowserCookies(…, APP_HOST)로 context에 넣는다
//   accounts.client(role)           같은 세션의 supabase-js 클라이언트(RLS 확인용)
//   accounts.userId(role)           비교용(출력 금지)
//   accounts.email(role)            비교용(출력 금지)
//   accounts.forget(role)           앱 [로그아웃](전역)으로 끊긴 세션을 캐시에서 버린다
//   accounts.anon()                 공개 열쇠만 쓴 클라이언트
//   worker 끝: 캐시한 세션마다 signOut({ scope: 'local' }) — 실패해도 조용히(값 출력 없음)
// fixture 함수의 두 번째 인자 이름은 `use` 대신 `provide`(react-hooks 린트가 `use`를 훅으로 오해한다)
export { expect }

// e2e/lib/envFile.ts (순수 + 주입)
export function upsertEnvText(text: string, updates: Record<string, string>): string   // 같은 이름 줄만 NAME='값'으로 바꾸고 없으면 끝에 더한다
export function checkEnvValue(value: string): 'ok' | 'quote' | 'newline' | 'space'
export function valueSummary(name: string, value: string | null): string             // "E2E_NEW_EMAIL: 넣음 (44자, e2e-new 표시 있음)" / "그대로"
export type EnvSetupDeps = { ask(name: string): Promise<string>; read(): string | null; write(text: string): void; print(line: string): void }
export function runEnvSetup(deps: EnvSetupDeps): Promise<number>                      // 종료 코드. 끝에 readE2eEnv 문제 목록
// e2e/setup-env.ts: readline 입력 숨김(되울림 끔), .env.local 읽기·쓰기(mode 0o600), console.log → process.exitCode
```

## 시험 계정 (4개)

| 역할 | 이메일 앞부분 표시 | DB 상태 (`e2e-accounts.sql`) | 쓰는 곳 |
|---|---|---|---|
| 관리자 | `e2e-admin` | 'E2E 관리자 의원' approved + `admins` | `/admin` 목록, 관리자 RLS |
| 승인됨 | `e2e-approved` | 'E2E 승인 의원' approved | 대시보드·앱 틀·`/admin` 막힘·로그아웃·비관리자 RLS |
| 승인 대기 | `e2e-pending` | 'E2E 대기 의원' pending | `/pending`, 내 줄만 읽기, 저장된 칸 |
| 신청 전 | `e2e-new` (40자 이상) | 병원 줄 없음 | `/signup`·긴 이메일·가입 요청 모양·넣기 거부 |

- 사용자가 Supabase 대시보드 Authentication → Users → Add user(Create new user, Auto Confirm User 체크)로 만든다. 예: 본인 Gmail 앞부분 + `+e2e-admin@gmail.com`(받을 수 있는 주소. 자동 확인이라 메일은 가지 않는다). 비밀번호는 16자 이상, 영문·숫자 권장(따옴표·`$`·`#`은 피한다)
- 이메일·비밀번호는 `.env.local`에만. SQL은 이메일 대신 앞부분 표시로 계정을 찾는다 → SQL 파일에 이메일이 없고, 안내 페이지에서 값을 바꿔 끼울 것도 없다
- 이메일 표시 규칙은 `readE2eEnv`(env)와 `e2e-accounts.sql`(DB)이 같은 글자를 본다 → 둘이 어긋나면 시작 전 검사가 잡는다
- 관리자 시험 계정에 대해서는 '사용자 결정' 1

### `supabase/e2e-accounts.sql`
- 바꾸는 일은 모두 DO 블록 하나 안에서 한다(오류가 나면 아무것도 안 바뀐다). 끝의 `select`는 읽기만(역할·병원 상태·관리자 여부, 이메일 없음)
- 역할마다 `auth.users`에서 `split_part(email, '@', 1) like '%<표시>%'`이고 `raw_app_meta_data ->> 'provider' = 'email'`인 계정을 센다. 1개가 아니거나 `email_confirmed_at`이 비면 `raise exception`(역할 이름 + "Authentication → Users에서 만들기·Auto Confirm")
- 관리자·승인됨·승인 대기: `insert … on conflict (owner_id) do update`로 이름·신청자·연락처(null)·이메일(`auth.users`의 값)·상태·`reviewed_at`(승인은 now(), 대기는 null)을 맞춘다. 신청 전: 그 계정 병원 줄 `delete`. `admins`: 관리자 계정 `on conflict do nothing`, 다른 E2E 계정은 `delete`
- 운영자 권한(SQL 편집기)이라 RLS를 건너뛴다. E2E 계정이 아닌 줄은 `where`가 닿지 않는다

### `supabase/first-admin.sql`
- 구글로 들어온 계정(`raw_app_meta_data -> 'providers' ? 'google'`) 가운데 이메일 앞부분에 `e2e-`가 없는 것이 정확히 하나여야 한다(운영자 본인). 아니면 오류("구글 계정이 n개 — Claude에게 알려 주세요")
- 그 계정의 병원 줄이 없으면 오류("먼저 사이트에서 가입 신청을 해 주세요")
- `admins`에 넣기(`on conflict do nothing`) + 병원 `status = 'approved'`, `reviewed_at`은 이미 승인이면 그대로, 아니면 now(). 끝의 `select`는 역할·상태·관리자 여부만
- 이메일을 손으로 넣지 않는다(폰에서 이메일을 치다 틀릴 일이 없다). 마이그레이션 끝 주석의 방법(이메일 넣기)을 대신한다. 마이그레이션 파일은 고치지 않는다

### `supabase/setup-sql.test.ts` (PGlite)
- `supabase/rls.test.ts`처럼 Supabase가 미리 갖춘 것을 흉내 내되, `auth.users`에 `raw_app_meta_data jsonb`·`email_confirmed_at timestamptz`를 더한 자기 흉내를 쓴다(`rls.test.ts`는 건드리지 않는다). 마이그레이션 → SQL 파일 순으로 실제 파일을 읽어 돌린다
- 이메일 주소 모양(`…@….…`) 검사는 정규식으로 파일 글자를 본다(`split_part(email, '@', 1)`의 `'@'`는 주소가 아니다)

## E2E 시나리오

| 파일 | AC | 계정 | 바꾸는 상태 |
|---|---|---|---|
| `auth-flow.spec.ts` | AC-006.1~006.9 | 없음·신청 전·대기·승인됨·관리자 | 없음(로그아웃은 승인 계정 세션만 끊음) |
| `requests.spec.ts` | AC-007.1~007.4 | 신청 전·대기·승인됨·관리자 | 없음(가입 요청은 끊는다) |
| `rls-live.spec.ts` | AC-008.1~008.5 | 없음·대기·승인됨·신청 전·관리자 | 없음(모두 거부되는 호출이거나 읽기) |

- 로그인: `accounts.signIn(context, role)` → 페이지를 열기 전에 쿠키를 넣는다. 역할마다 한 번 로그인해 실행 내내 다시 쓴다. Supabase `/auth/v1/token` 제한은 IP마다 5분에 150번, 한 번에 30번(Supabase 문서 'Rate limits') → 한 실행에 로그인 5~6번이라 두 번 연달아 돌려도 넉넉하다
- 로그아웃 시험(AC-006.7)은 승인 계정으로 한다. 앱 [로그아웃]은 `signOut()` 전역이라 그 계정의 세션을 모두 끊는다 → 시험 끝에 `accounts.forget('approved')`, 뒤 시험이 다시 로그인한다. `workers: 1`이라 다른 시험과 겹치지 않는다
- 가입 요청 모양(AC-007.1·007.2): `page.route('**/rest/v1/hospitals*')`에서 POST만 잡아 본문을 기록하고 `route.abort()`. 잡힌 횟수가 정확히 1인지 본다(0이면 요청이 빠져나갔을 수 있다 → 실패). 끝에 신청 전 계정 클라이언트로 내 병원 줄 수가 0인지 본다. 0이 아니면 "e2e-accounts.sql 다시 실행" 안내로 실패
- 가는 곳 검사(AC-007.3): `context.on('request')`로 모든 요청의 origin을 모아 앱 origin·Supabase origin 밖이 0개인지 본다. 주소 전체는 출력하지 않고 origin만
- 긴 이메일(AC-006.3): 390×844 context에서 `/signup`의 구글 계정 칸(읽기 전용 상자)을 찾아 `scrollWidth <= clientWidth`, 상자 오른쪽 끝 ≤ 화면 폭, `document.documentElement.scrollWidth <= innerWidth`를 본다. 스크린샷은 찍지 않는다
- RLS(REQ-008): supabase-js만 쓴다(브라우저 없음). `set_hospital_status`는 무작위 uuid로 부른다 → 관리자 확인이 먼저라 42501이고, 혹시 함수가 고장 나도 바꿀 줄이 없다. 상태 고치기·넣기 시도는 열 권한이 없어 거부된다(시험이 실패하면 고장이고, 상태는 e2e-accounts.sql로 되돌린다)
- 실패 메시지에 값이 찍히지 않게: 이메일·uid·토큰은 `toEqual`·`toContain`의 기대값으로 넘기지 않는다. `expect(a === b, '계정 단추에 로그인 이메일이 없다').toBe(true)`처럼 참/거짓 + 이름만 든 메시지. 시험 이름·`console`에 값 없음. 관리자 목록은 'E2E '로 시작하는 줄만 본다
- 실행마다 바뀌는 것: 시험 계정의 로그인 기록(`last_sign_in_at`)과 Supabase 감사 기록뿐. 만든 세션은 끝에 끊어 `auth.sessions`가 쌓이지 않는다

## 사용자 단계 (바깥 콘솔 — TASK 아님)

순서대로 한다. 누가: 사용자(폰) / Claude(VPS 터미널). Claude는 Phase 1 끝에 안내 페이지(claude.ai, 저장소 밖)를 만든다: 단계마다 Supabase·Google 대시보드 바로가기(폰에서는 메뉴보다 바로가기가 낫다), SQL 복사 단추(마이그레이션·`e2e-accounts.sql`·`first-admin.sql`, 저장소 파일 그대로), 확인할 것.

| 단계 | 누가 | 할 일 | 끝나면 |
|---|---|---|---|
| S1 | 사용자 | Supabase 새 프로젝트: 지역 Northeast Asia (Seoul), 무료 플랜. DB 비밀번호는 폰 비밀번호 관리자에만. Data API는 켜 둔 기본값(public). 프로젝트 주소(ref)는 비밀이 아니라 채팅에 알려 주면 바로가기를 맞춘다 | — |
| S2 | 사용자 | SQL 편집기에 안내 페이지의 마이그레이션 SQL을 붙여 실행 | 표 2개·함수 1개 |
| S3 | 사용자 | Authentication → Sign In / Providers: Email 켬 + Confirm email 켬, "Allow new users to sign up" 켬, Anonymous 끔(대개 기본값 그대로) | S5 뒤 시작 전 검사가 확인 |
| S4 | 사용자 | Authentication → Users → Add user ×4('시험 계정' 표 규칙, Auto Confirm 체크) | — |
| S5 | 사용자 | Claude 창이 아닌 따로 연 터미널에서 `npm run e2e:env`(프로젝트 주소, Settings → API Keys의 publishable 열쇠 `sb_publishable_…`(없으면 legacy anon), 이메일 4·비밀번호 4). Claude 창의 `!`로는 입력을 받을 수 없다 | `.env.local` |
| S6 | 사용자 | SQL 편집기에 `e2e-accounts.sql` 실행 | 결과 표 4줄 |
| — | Claude | Phase 2(TASK-7~9) 시작. `npm run e2e` | — |
| S7 | 사용자 | 구글 OAuth: Google Cloud 새 프로젝트 → Google Auth Platform: Branding(앱 이름 `seoseungkwanapp`, 지원 이메일), Audience(External → 앱 게시 In production), Clients → Web application, 승인된 리디렉션 URI `https://<ref>.supabase.co/auth/v1/callback`. Client ID·secret을 Supabase Sign In / Providers → Google에 붙여 켬. secret은 채팅에 붙이지 않는다 | — |
| S8 | Claude | Vercel 프로젝트 만들기(TASK-10 커밋 뒤): `npx vercel@64.1.0 whoami`로 로그인 확인(파일럿 때 로그인해 둠. 만료면 `npx vercel@64.1.0 login` 기기 로그인 → 사용자가 폰에서 승인). `npx vercel@64.1.0 link`로 새 프로젝트 `seoseungkwanapp`(깃 저장소 연결을 물으면 아니요, 환경 변수 받기를 물으면 아니요). 그 뒤 `.env.local`에 더해진 `VERCEL_OIDC_TOKEN` 줄을 출력 없이 지우고, `.gitignore`가 바뀌었으면 되돌린다. 운영 주소를 Vercel이 알려 준 값으로 확정(예상 https://seoseungkwanapp.vercel.app, 이름이 이미 있으면 다른 주소) | 운영 주소 |
| S9 | 사용자 | Supabase Authentication → URL Configuration: Site URL = 운영 주소, Redirect URLs = `<운영 주소>/auth/callback`·`http://localhost:3000/auth/callback` | — |
| S10 | Claude | `npx vercel@64.1.0 env add <이름> production` ×2(`NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`). 값은 `.env.local`에서 파이프로 넘겨 화면에 나오지 않게. `vercel env ls production`으로 이름이 둘뿐인지 확인. Preview·Development에는 넣지 않는다. `vercel env pull`은 쓰지 않는다(`.env.local`을 덮어써 E2E 값이 사라진다) | — |
| S11 | 사용자 OK → Claude | 사용자가 그 자리에서 "배포해"라고 하면 `npx vercel@64.1.0 deploy --prod`. 다시 배포할 때마다 같은 OK | 운영 배포 |
| S12 | Claude | 운영 주소 확인(읽기만, curl): `/login` 200 + CSP `connect-src`에 Supabase origin + 보안 헤더 3개, `/dashboard` → `/login`, `/auth/callback?next=https://example.com` → 같은 origin `/login?error=1`. dev-browser로 운영 `/login` 1440·390 스크린샷 | — |
| S13 | 사용자 | '폰 확인 목록' | — |

- 기다리는 것: TASK-1~6·TASK-10은 아무것도 기다리지 않는다. TASK-7~9의 E2E 실행은 S1~S6 뒤. S8은 TASK-10 커밋 뒤, S9는 S8(주소 확정) 뒤, S11은 S7·S9·S10 뒤
- 무료 플랜은 켜 둔 무료 프로젝트 수에 한도(2개)가 있다. 파일럿 하나 + 새 것 하나면 된다. 한도에 걸려 S1이 막히면 사용자에게 묻는다(파일럿 내리기는 범위 밖)

## 폰 확인 목록 (S13, 운영 주소에서)
1. 폰 크롬(또는 삼성 인터넷)으로 운영 주소 `/`를 연다 → 랜딩
2. [구글로 시작하기] → 구글 계정 고르기 → 동의 화면(앱 이름 확인) → 돌아와 `/signup`, 구글 계정 칸에 내 이메일
3. 긴 이메일 줄바꿈: 내 이메일이 칸 안에서 다 보이고 가로로 밀리지 않는다(E2E AC-006.3이 40자 넘는 주소로 이미 확인 — 실제 폰에서 한 번 더)
4. 병원 이름·신청자 이름·(연락처)·동의 → [가입 신청] → `/pending` "신청을 확인하고 있습니다"
5. 안내 페이지의 `first-admin.sql`을 SQL 편집기에서 실행 → 결과 1줄(운영자·approved·관리자)
6. `/pending`에서 [상태 다시 확인] → `/dashboard`, 위쪽 띠에 병원 이름·내 이메일, 탭 줄 끝에 [관리자]
7. [관리자] → 승인 탭에 내 병원과 내 구글 이메일(DB가 로그인 토큰에서 넣은 값), 대기 탭에 'E2E 대기 의원'. E2E 줄의 [승인]·[거절]은 누르지 않는다(눌렀으면 `e2e-accounts.sql`을 다시 실행)
8. 계정 단추 → [로그아웃] → `/login`
9. 다시 [구글로 시작하기] → 가입 신청 없이 바로 `/dashboard`
10. (선택) 카카오톡에서 운영 주소를 열면 "크롬·엣지에서 열어 주세요" 안내
11. (선택) 다른 구글 계정이 있으면 그 계정으로 가입 신청 → 내 계정 `/admin`에서 [승인] → 그 계정 `/dashboard`. 실제 DB에서 화면으로 승인하는 유일한 확인이다(그 계정은 승인된 채 남는다)
- 결과는 사용자가 채팅에 "n번 안 됨"처럼 알려 주면 Claude가 고칠 일을 정한다. 앱 코드를 고쳐야 하면 이 명세에 TASK를 더해 다시 승인받는다

## 기존 코드 확인 (바꿀 것 없음)

| 본 것 | 근거 | 결론 |
|---|---|---|
| 콜백·middleware가 돌려보낼 주소를 `new URL(to, request.url)`로 만든다 | `src/app/auth/callback/route.ts:14,19`, `src/middleware.ts:15`. Next 15.5를 직접 띄우면 `request.url`은 Host 헤더가 아니라 띄운 주소(`-H`·`-p`)로 만든다: `node_modules/next/dist/server/lib/router-utils/resolve-routes.js:105` | E2E는 `-H 127.0.0.1`과 baseURL 호스트를 같게 둔다(다르면 돌려보낸 곳에 쿠키가 따라가지 않는다). Vercel에서는 들어온 주소이고, 파일럿이 같은 콜백으로 운영에서 구글 로그인을 했다 |
| `supabaseEnv()` https 규칙 | `src/lib/supabase/env.ts:19` | 실제 주소는 https라 통과 |
| 열쇠 모양 | `src/lib/supabase/env.ts:25-31`은 비었는지만 본다 | 새 publishable 열쇠(`sb_publishable_…`)도 그대로 받는다. Supabase 문서(API keys)가 supabase-js에 anon 대신 넣으라고 하고, 파일럿도 publishable 열쇠로 돌았다. 이름 `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 그대로 |
| CSP `connect-src` | `next.config.ts:13`, `src/lib/csp.ts:18` — 빌드 때 `NEXT_PUBLIC_SUPABASE_URL`로 만든다 | Vercel 환경 변수를 첫 배포 전에 넣는다(S10 → S11). E2E AC-006.8이 실제 값으로 본다 |
| 세션 쿠키 모양 | `@supabase/ssr` 0.12.7: 조각 크기 3180(`dist/main/utils/chunker.js:8`), 기본 path `/`·`lax`·httpOnly 아님·400일(`dist/main/utils/constants.js`), 값 `base64-`(`dist/main/createServerClient.js:20` base64url) | 도우미는 라이브러리가 만든 쿠키를 옮기기만 한다(손으로 흉내 내지 않는다). AC-003.1 시험이 이 모양을 지켜봐 판을 올려 바뀌면 알린다 |
| 로그인 단추 `redirectTo` | `src/components/auth/LoginCard.tsx:46` = 지금 origin + `/auth/callback` | Supabase Redirect URLs에 운영 주소의 이 경로를 정확히 넣는다(S9) |

## 데이터 흐름
```
npm run e2e
  preflight: .env.local → readE2eEnv → GET <supabase>/auth/v1/settings → authSettingsProblems
             문제 있으면 "E2E를 시작하지 못했어요" + 목록, 종료 코드 1 (빌드·시험 없음)
  next build (.env.local의 NEXT_PUBLIC 값으로 CSP·클라이언트)
  playwright test → webServer: next start -H 127.0.0.1 -p 3100
    시험마다: accounts.signIn(context, role)
      (역할 처음) Node: createServerClient → signInWithPassword → setAll로 쿠키 모으기 → 내 병원·관리자 줄 읽기 → accountProblem
      context.addCookies(toBrowserCookies(쿠키, '127.0.0.1'))
    브라우저 → 127.0.0.1:3100 (middleware getUser → Supabase) / 브라우저 → Supabase(REST·Auth)
    worker 끝: 세션마다 signOut({ scope: 'local' })
  서버 끄기
운영: 폰 → https://<운영 주소> → [구글로 시작하기] → Google → <ref>.supabase.co/auth/v1/callback → <운영 주소>/auth/callback → /dashboard
```

## 결정과 트레이드오프
- **ADR-017 (새)**: E2E는 `@playwright/test` 1.64.1(2026-10-14 판, 파일럿과 같은 줄)로, 실제 Supabase + 시험 계정 4개로 한다. ADR-015의 "`@playwright/test`는 넣지 않는다"는 E2E에 한해 바꾸고, 화면 스크린샷 확인은 그대로 dev-browser다. 번호: ADR-016은 `wt-ai-report` 작업 나무(feat-ai-report)가 pptxgenjs로 이미 썼다 → 17. 이 작업이 먼저 합쳐지면 ADR.md에 16이 잠시 빈다(그 작업이 합쳐지면 채워진다). ADR-013(Vercel)에 배포 방법 한 줄(CLI 배포만, 깃 자동 배포 끔, 배포마다 사용자 OK, icn1)을 더한다. CLAUDE.md 기술 스택의 "E2E 도구: 미정" 줄과 명령어 목록(`npm run e2e`·`npm run e2e:env`)을 고친다
- **E2E는 verify 관문 밖**: 실제 네트워크·시험 계정이 있어야 돈다. `npm test`(verify)는 지금처럼 바깥 연결 없이 돈다. Claude가 Phase 끝에 `npm run e2e`를 돌려 결과를 보고·커밋 메시지에 적는다
- **시작 전 검사는 건너뛰기가 아니라 멈춤**: 값이 없을 때 시험을 skip하면 Playwright가 "0 failed"로 끝나 통과처럼 보인다. 그래서 빌드 전에 `preflight`가 0이 아닌 코드로 멈춘다. `npx playwright test`로 바로 돌리면 preflight를 건너뛰지만, 각 시험이 `support`에서 같은 `readE2eEnv` 검사로 실패한다(skip 아님). 시험이 하나도 없으면 Playwright 기본이 실패다(`--pass-with-no-tests`를 쓰지 않는다)
- **Supabase 설정을 E2E가 매번 본다**: `/auth/v1/settings`는 공개 열쇠로 읽는 공개 설정이다(관리자 권한 없이). 칸 이름(`external.email`·`external.anonymous_users`·`mailer_autoconfirm`·`disable_signup` 등)은 구현 때 실제 응답으로 확인하고, 시험의 가짜 응답도 그 모양으로 만든다. 모양이 다르면 "설정을 읽지 못했어요"로 멈춘다
- **이메일 로그인을 켜 둔다 — 누구나 API로 이메일 가입을 시도할 수 있다. 그래도 지키는 이유**:
  - 비밀번호 시험 계정 때문에 Email 제공자를 켜야 한다. "Allow new users to sign up"을 끄면 구글로 처음 오는 사용자도 막혀(모든 제공자의 새 사용자) 끌 수 없다
  - Confirm email을 켜 둔다. Supabase 기본 메일은 프로젝트 팀원 주소에만 보내고 다른 주소는 "Email address not authorized"로 거부한다(Supabase 문서 'Custom SMTP', 한 시간 2통) → 낯선 사람은 확인 메일을 받지 못해 로그인할 수 없다. 시험 계정은 대시보드 Auto Confirm이라 메일이 필요 없다
  - 설령 로그인해도 구글 사용자와 똑같은 일반 사용자다: 자기 병원 대기 신청 한 줄만 넣을 수 있고(열 권한·RLS), 관리자가 승인하기 전에는 `/pending`에 갇히며, 남의 줄·관리자 줄을 읽지 못한다(`supabase/rls.test.ts`, E2E REQ-008). 신청은 관리자 목록에 보여 거절하면 된다
  - 시작 전 검사가 이 설정(이메일 확인 켬·익명 끔·새 가입 켬)을 실행마다 본다(AC-002.3)
  - 고려했지만 안 쓴 것: Before User Created 훅(이메일 가입을 DB 함수로 거부) — 문서가 대시보드 'Add user'에도 도는지·무료 플랜에서 되는지 말하지 않아, 시험 계정 만들기가 막힐 수 있다. 나중에 사용자 지정 SMTP를 넣으면 '확인 메일 못 받음' 한 겹이 사라지므로 그때 다시 본다
- **service role 없음**: 시험 계정은 사용자가 대시보드에서 만들고, 상태는 SQL 편집기의 SQL로 맞춘다. E2E는 공개 열쇠 + 비밀번호 로그인만 쓴다 → E2E가 할 수 있는 일은 그 계정이 RLS로 할 수 있는 일뿐이다
- **로그인 쿠키는 라이브러리가 만든 것을 옮긴다(파일럿 방식)**: `createServerClient`의 `setAll`이 주는 쿠키를 모아 이름·값·옵션 그대로 넣는다. 쿠키 이름·조각·인코딩을 손으로 흉내 내지 않아 앱(`@supabase/ssr` 같은 판)과 늘 같다. 앱 코드에는 아무 길도 더하지 않는다(AC-003.5)
- **상태를 바꾸는 동작은 E2E에서 끝까지 하지 않는다**: 승인·거절·되돌리기 성공은 실제 DB에서 돌리지 않는다(`reviewed_at`·상태가 남아 다음 실행이 달라진다). 대신 `supabase/rls.test.ts` AC-006.5·006.6(PGlite)과 `AdminApplications` 시험, 폰 확인(운영자 승인 SQL, 선택 11번)이 맡는다. E2E는 [거절] → [취소]처럼 되돌아오는 길만 누른다. 가입 신청은 요청 모양만 보고 끊는다
- **되돌리기 도구 = 준비 SQL**: 무엇이 어긋나도(시험 실패·누가 E2E 줄을 눌렀음) `e2e-accounts.sql`을 다시 돌리면 처음 상태다. 시험 계정 상태가 다르면 `support`가 시험 전에 역할 이름과 이 안내로 멈춘다
- **시험 산출물에 세션·화면 내용을 남기지 않는다**: `trace: 'off'`(요청 헤더·쿠키가 담긴다), `video: 'off'`, HAR 없음, `screenshot: 'off'`. 스크린샷은 실패 때만 찍는 것도 하지 않는다: 쿠키는 사진에 없지만 관리자 화면에는 운영자 본인 병원 줄의 이메일·연락처가 보여 실패 사진에 개인정보가 남는다. 실패는 글자 메시지로 본다. 보고는 `list`만(HTML 보고서는 첨부를 모은다). Playwright가 실패 때 `test-results/`에 화면 글자 요약(error-context)을 남길 수 있다 → 그 폴더는 커밋·배포하지 않고(`.gitignore`·`.vercelignore`), 실행마다 Playwright가 비운다
- **127.0.0.1:3100 고정**: `next start -H 127.0.0.1`(VPS 바깥에서 닿지 않게, 0.0.0.0 금지). 포트가 쓰이고 있으면 `reuseExistingServer: false`라 다른 서버를 시험하지 않고 실패한다. 운영 빌드로 띄워 CSP까지 실제와 같게 본다
- **Next 서버 프로세스에도 E2E 값이 들어간다**: Next가 `.env.local`을 통째로 읽는다. `NEXT_PUBLIC_`가 아니라 브라우저 번들에는 들어가지 않고, 앱 코드는 그 이름을 읽지 않는다(AC-003.5). Vercel에는 `.vercelignore`로 `.env*`가 올라가지 않는다
- **`.env.local` 도우미**: 사용자는 폰 터미널에서 일한다. nano로 10줄을 치면 값이 화면·스크롤에 남고 틀리기 쉽다. 도우미는 입력을 숨기고 이름·글자 수·표시 여부만 보인다. 값은 `NAME='값'`으로 쓴다(`$`·`#`이 Node `process.loadEnvFile`에서 그대로 읽히게), 작은따옴표·줄바꿈은 받지 않는다. Claude는 실행하지 않는다(입력을 받을 수 없고, 값을 볼 일이 없게)
- **Vercel은 CLI 배포만**: 깃 연결을 하지 않고 `vercel.json` `git.deploymentEnabled: false`로 한 번 더 막는다 → 깃에 올리거나 머지해도 저절로 배포되지 않는다. 배포는 사용자 OK마다 Claude가 `deploy --prod`. CLI 배포는 내 폴더 파일을 올리므로 `.vercelignore`가 `.env.local`(E2E 비밀번호)을 막는 것이 핵심이다(AC-009.2). `e2e/`를 빼면 `playwright.config.ts`의 import가 깨져 Vercel 빌드의 타입 검사가 실패하므로 둘을 함께 뺀다. `framework: nextjs`는 파일럿에서 프로젝트가 'Other'로 저장된 일이 있어 못박는다. 함수 지역 icn1(Supabase 서울 옆). Vercel CLI는 `npx vercel@64.1.0`(2026-10-14 판, 파일럿 때 쓰고 이 VPS에 로그인돼 있음)
- **Phase 끝 화면 확인**: 이 기능은 화면을 바꾸지 않는다. 로그인 뒤 화면 스크린샷은 시험 계정 이메일·병원 줄이 찍혀 찍지 않는다. Phase 3 끝에 운영 `/login`만 dev-browser로 찍는다(S12). 그 밖은 E2E 결과(시험 이름과 통과/실패)로 보고한다

## Phase (사용자 작업 방식: Phase 끝에 자동 시험 + 짧은 보고)
- **Phase 1 — E2E 틀 (바깥 연결 없음)**: TASK-1 → 2 → 3 → 4 → 5 → 6. 끝: verify(lint·build·test), `npm run e2e`가 값이 없어 "E2E를 시작하지 못했어요"로 멈추는지(AC-002.4 실제 모습) 확인, 안내 페이지(S1~S6) 만들어 보이기
- **Phase 2 — 실제 Supabase + E2E**: S1~S6 뒤 TASK-7 → 8 → 9. 끝: verify + `npm run e2e`를 SQL 다시 돌리지 않고 두 번 연달아 통과(되풀이 가능 확인)
- **Phase 3 — Vercel 배포 + 폰 확인**: TASK-10 → S7~S13. 끝: S12 결과·스크린샷 + 폰 확인 결과로 보고, draft PR

## 위험
- E2E가 운영 DB에서 돈다(개발 DB 분리 없음, ADR-005·plan.md §10). 시험 계정 4개(관리자 하나)가 운영 DB에 산다 → '사용자 결정' 1. 관리자 시험 계정 비밀번호가 새면 가입 신청 목록(병원 이름·신청자·이메일·연락처)을 보고 승인할 수 있다 → 16자 이상, `.env.local`(VPS, 권한 600)에만
- 무료 프로젝트는 1주 안 쓰면 일시정지된다 → 시작 전 검사가 "Supabase가 응답하지 않아요 — 대시보드에서 다시 켜 주세요"로 알린다
- `/auth/v1/settings` 칸 이름이 바뀌면 시작 전 검사가 멈춘다 → 메시지가 그 이유를 말한다. 구현 때 실제 응답으로 칸 이름을 확인한다
- `@supabase/ssr`를 올리면 쿠키 모양이 바뀔 수 있다 → AC-003.1 시험이 알린다
- 하네스 훅: `e2e/*.spec.ts`를 고치면 `tdd-post` 훅이 `npx vitest run <파일>`로 돌려 '시험 없음(ERROR)'을 기록한다. Vitest 대상이 아니라 정상이다. E2E 결과는 `npm run e2e` 출력으로 본다
- 리디렉트 허용 목록에 없는 주소(배포마다 생기는 `seoseungkwanapp-<글자>.vercel.app` 같은 주소)에서 로그인하면 Supabase가 Site URL로 보내 로그인이 끝나지 않는다 → 운영 주소로만 연다(폰 확인 목록)
- 구글 동의 화면에 "<ref>.supabase.co(으)로 이동"이 보인다. 사용자 지정 도메인은 유료라 범위 밖
- Playwright 1.64.1의 크로미움(1248)은 이미 `~/.cache/ms-playwright`에 있다. 없으면 `npx playwright install chromium`(저장소 밖에 받는다)
- 시험 실패 메시지(Playwright 위치 설명)에 화면 글자가 섞일 수 있다 → 관리자 목록 확인은 'E2E ' 줄로 좁히고, Phase 2는 운영자 계정이 생기기 전(S13 전)에 끝낸다
- VPS 같은 다른 프록시 뒤에서 직접 띄우게 되면 `request.url`이 공개 주소가 아니다 → 그때 콜백을 다시 본다(지금은 Vercel·127.0.0.1뿐)

## 사용자 결정 (2026-10-29)
1. **관리자 시험 계정을 운영 DB에 둔다**(사용자 "둔다"). 관리자 화면·관리자 권한을 실제 DB에서 자동으로 본다. 비밀번호 16자 이상, `.env.local`(VPS, 권한 600)에만
2. **구글 동의 화면 앱 이름은 `seoseungkwanapp`**(사용자 선택, 나중에 바꿀 수 있다)
3. Supabase 프로젝트 만들기(S1): 지역 Northeast Asia (Seoul), Data API 켬, "Automatically expose new tables" 끔(마이그레이션이 revoke 뒤 필요한 권한만 grant), "Enable automatic RLS" 켬(모든 표 RLS 규칙과 같은 방향의 안전장치)
