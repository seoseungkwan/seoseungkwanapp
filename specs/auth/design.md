# 설계: 로그인·가입 승인·관리자·대시보드 틀

> 근거: `requirements.md`, plan.md §2-1·§5·§6, ADR-002·004·006. 화면 값·문구는 `docs/mockups/auth/*.dc.html`.
> 파일럿(`tonggye-bunseok` `fbb303a`)에 있는 것은 옮기고, 없는 것(관리자 표·승인 함수·관리자 화면·자동 로그아웃)은 새로 만든다.

## 구성 요소와 파일

```
src/
├── middleware.ts                       # 세션 갱신 + 로그인 여부만 (병원 상태는 'unknown')
├── app/
│   ├── auth/callback/route.ts          # 코드 교환 → /dashboard, 실패 → /login?error=1
│   ├── login/page.tsx                  # LoginCard
│   ├── (onboarding)/signup/page.tsx    # guardPage('/signup') → SignupForm
│   ├── (onboarding)/pending/page.tsx   # guardPage('/pending') → PendingCard
│   ├── (app)/layout.tsx                # guardPage(path) → AppShell + IdleLogout
│   ├── (app)/dashboard/page.tsx        # 첫 화면(빈 상태)
│   ├── (app)/admin/page.tsx            # 관리자만 → AdminApplications
│   └── error.tsx                       # E-PAGE-FAILED 카드
├── lib/
│   ├── supabase/{env,browser,server,middleware}.ts   # 파일럿 이식
│   ├── auth/gate.ts                    # 경로 결정 순수 함수
│   ├── auth/hospital.server.ts         # 내 사용자·병원 줄·관리자 여부 읽기(서버)
│   ├── auth/guard.server.ts            # guardPage(path)
│   ├── auth/signup.ts                  # validateSignup (순수)
│   ├── auth/hospital.ts                # 가입 신청 넣기(브라우저)
│   ├── auth/admin.ts                   # 신청 목록·상태 바꾸기(브라우저)
│   ├── auth/inAppBrowser.ts            # 인앱 브라우저 판정 (파일럿 이식)
│   ├── auth/idle.ts                    # startIdleLogout (순수 + 주입)
│   ├── csp.ts                          # buildCsp (파일럿 + media-src)
│   └── errors.ts                       # 인증 오류 번호 추가
├── components/
│   ├── common/ErrorCard.tsx            # 파일럿 이식
│   ├── auth/{LoginCard,SignupForm,PendingCard,SignOutButton,AuthFrame}.tsx
│   ├── shell/{AppShell,SideMenu,AccountMenu,MobileNav,IdleLogout}.tsx, menu.ts
│   ├── dashboard/{DashboardEmpty}.tsx, todayTitle.ts
│   └── admin/{AdminApplications}.tsx, applications.ts
└── types/{db,errors}.ts
supabase/
├── migrations/20261028000000_auth.sql  # 표·RLS·함수 (SQL 편집기에 붙여 넣는다 — 다음 단계)
└── rls.test.ts                         # PGlite로 마이그레이션을 실제로 돌려 권한을 증명
```
- 각 컴포넌트 옆에 `*.module.css`와 `*.test.tsx`를 둔다. 색·글꼴은 `globals.css` 변수(ADR-014)

## 서버 코드 예외 (사용자 결정 2026-10-28)
- 서버에서 도는 것: `middleware.ts`, `auth/callback/route.ts`, `lib/supabase/server.ts`·`middleware.ts`, `lib/auth/*.server.ts`, 그리고 이들을 부르는 Server Component(페이지·레이아웃)
- 이 코드는 세션 쿠키와 `hospitals`의 내 줄·`admins`의 내 줄만 읽는다. 쓰기는 하지 않는다(가입 신청·승인은 브라우저 → RLS·DB 함수). 환자·통계 데이터는 읽지 않는다
- `*.server.ts`·`server.ts`는 첫 줄 `import 'server-only'`
- ADR-004·CLAUDE.md·ARCHITECTURE.md를 이 예외에 맞게 한 줄씩 고친다(명세와 함께 커밋)

## 인터페이스 (시그니처 수준)

```ts
// lib/auth/gate.ts
export type HospitalState = 'none' | 'pending' | 'approved' | 'rejected' | 'unknown'
export type GateInput = { path: string; signedIn: boolean; hospital: HospitalState; isAdmin: boolean }
export function isPublicPath(path: string): boolean          // '/', '/login', '/auth/callback'
export function decideRoute(input: GateInput): string | null  // null = 그대로 연다, 문자열 = 보낼 고정 경로
// 'unknown'(middleware)일 때: 로그인 안 함 → 공개 밖이면 '/login'. 로그인 함 + '/login' → '/dashboard'. 그 밖은 null(페이지 guard가 정함)

// lib/auth/hospital.server.ts
export type Hospital = { id: string; name: string; applicantName: string; phone: string | null; email: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string }
export type Me = { email: string; hospital: Hospital | null; isAdmin: boolean }
export class NotSignedInError extends Error {}
export class HospitalReadError extends Error {}               // 읽기 실패 → error.tsx (돌림 고리 방지)
export function readMe(): Promise<Me>

// lib/auth/guard.server.ts
export function guardPage(path: string): Promise<Me>          // decideRoute가 경로를 주면 redirect(), 아니면 Me

// lib/auth/signup.ts
export type SignupInput = { name: string; applicantName: string; phone: string; agreed: boolean }
export type SignupValue = { name: string; applicant_name: string; phone: string | null }
export function validateSignup(i: SignupInput): { ok: true; value: SignupValue } | { ok: false; errors: Partial<Record<keyof SignupInput, string>> }

// lib/auth/hospital.ts (브라우저)
export class SignupError extends Error {}
export function submitSignup(v: SignupValue): Promise<void>   // 23505 = 성공

// lib/auth/admin.ts (브라우저)
export type Application = Hospital
export function listApplications(): Promise<Application[]>   // created_at 내림차순
export function setHospitalStatus(id: string, status: 'approved' | 'rejected' | 'pending'): Promise<void>  // rpc('set_hospital_status')

// components/admin/applications.ts (순수)
export type Tab = 'pending' | 'approved' | 'rejected'
export function countByTab(rows: Application[]): Record<Tab, number>
export function rowsOf(rows: Application[], tab: Tab): Application[]
export function withStatus(rows: Application[], id: string, status: Tab): Application[]
export function doneMessage(name: string, status: Tab): string  // "○○ 신청을 승인했습니다." 등 (목업 문구)

// lib/auth/idle.ts
export type IdleDeps = { target: EventTarget; doc: Document; channel?: { postMessage(m: unknown): void; onmessage: ((e: unknown) => void) | null; close(): void } }
export function startIdleLogout(opts: { timeoutMs: number; onIdle: () => void } & IdleDeps): () => void  // 돌려받은 함수 = 정리

// lib/csp.ts
export function buildCsp(isDev: boolean, supabaseUrl: string): string

// components/dashboard/todayTitle.ts
export function koreanDateTitle(ymd: string): string          // '2026-10-28' → '2026년 10월 28일 (수)' (dates.ts weekdayOf)
```

## DB (supabase/migrations/20261028000000_auth.sql)
```sql
hospitals(
  id uuid pk default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 50 and name = btrim(name)),
  applicant_name text not null check (char_length(applicant_name) between 1 and 30 and applicant_name = btrim(applicant_name)),
  phone text check (phone ~ '^[0-9]{9,11}$'),
  email text not null default (auth.jwt() ->> 'email'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  agreed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
)
admins(user_id uuid pk references auth.users on delete cascade, created_at timestamptz default now())
```
- `revoke all on hospitals, admins from anon, authenticated` → `grant select on hospitals to authenticated`, `grant insert (name, applicant_name, phone) on hospitals to authenticated`, `grant select on admins to authenticated`. update·delete 권한은 주지 않는다
- RLS 정책: hospitals 읽기 = `owner_id = (select auth.uid())` 또는 `exists(select 1 from public.admins a where a.user_id = (select auth.uid()))`. hospitals 넣기 = `owner_id = (select auth.uid()) and status = 'pending'`. admins 읽기 = `user_id = (select auth.uid())`
- `set_hospital_status(p_hospital_id uuid, p_status text) returns void` — `security definer`, `set search_path = ''`. 관리자가 아니면 `42501` 오류. 허용 바꿈만 `update … where id = … and (현재 상태 조건)`, 바뀐 줄이 없으면 오류. `reviewed_at = now()`. `revoke all … from public, anon` → `grant execute … to authenticated`
- 처음 설정(다음 단계, SQL 편집기): 운영자가 한 번 로그인·가입 신청 → `insert into admins` + 자기 병원 `status = 'approved'`. 마이그레이션 파일 끝에 주석으로 적는다(값 없이)
- 이메일은 DB 기본값이 토큰에서 넣는다 → 브라우저가 다른 이메일을 넣을 수 없다(열 권한 없음)

## 데이터 흐름
```
/login → [구글로 시작하기] → Google → /auth/callback(코드 교환) → /dashboard
  middleware: 로그인 안 했으면 /login. 로그인 함 → 통과
  (app)/layout guardPage: 병원 줄 없음 → /signup · pending/rejected → /pending · approved → 화면
/signup → validateSignup → submitSignup(insert, RLS) → /pending
/pending → [상태 다시 확인] router.refresh() → guard가 approved면 /dashboard
/admin → listApplications(RLS: 관리자는 전체) → [승인]/[거절 확인]/[되돌리기] → rpc → withStatus + doneMessage
앱 화면 → IdleLogout(30분) → signOut → location.assign('/login')
```

## 결정과 트레이드오프
- **문지기 두 겹(파일럿 그대로)**: middleware는 로그인 여부만, 병원 상태는 페이지 guard가 그리기 전에 본다. middleware에서 DB를 읽지 않아 정적 파일·랜딩이 빠르다. 대가: `/login`에서 로그인한 사람은 `/dashboard`를 거쳐 한 번 더 돌 수 있다
- **이메일은 DB가 넣는다**: 관리자 화면이 `auth.users`를 읽을 수 없어 `hospitals.email`에 둔다. 토큰 값을 DB 기본값으로 넣고 열 권한을 주지 않아 위조를 막는다
- **승인은 함수 하나**: 사용자에게 update 권한을 주지 않으므로 자기 상태를 바꿀 길이 없다. 관리자도 함수가 허용한 바꿈만 할 수 있다
- **오류 화면에 [로그아웃]** (사용자 결정 2026-10-28, 목업 https://claude.ai/artifact/QMvbZSMCGjJHeXJh9jEKbk 의 A): 내 병원 줄 읽기가 계속 실패하면 `/login`도 `/dashboard`로 돌아와 빠져나갈 길이 없다. `SignOutButton`을 [다시 시도] 옆에 둔다 (AC-003.7, TASK-9)
- **아직 없는 메뉴·버튼은 누를 수 없게**: 목업은 `href="#"`이지만 실제 앱에서 빈 링크는 혼란스럽다. 같은 모양에 `aria-disabled`만 단다
- **대시보드는 빈 화면만**: 통계 저장(`months`·`days`)이 아직 없어서, 승인된 목업의 '첫 화면(파일 없음)' 상태만 만든다. 예시 숫자 화면은 통계 기능 때 만든다
- **자동 로그아웃은 브라우저 타이머**: 다른 탭 움직임은 BroadcastChannel로 나눈다(브라우저 저장소 금지 규칙). `signOut()` 기본(전역)이 갱신 토큰을 끊는다
- **문의 이메일**: 목업은 `[이메일 주소]` 빈칸이다. 값을 정할 때까지 빈칸 문구 그대로 둔다
- **화면 시험**: 상호작용이 있는 컴포넌트 시험만 파일 첫 줄 `// @vitest-environment jsdom` + Testing Library를 쓴다. 나머지는 지금처럼 node + `renderToStaticMarkup`
- **DB 시험**: PGlite(WebAssembly Postgres)로 실제 마이그레이션을 돌린다. `auth` 스키마·`auth.uid()`·`auth.jwt()`·`anon`/`authenticated` 역할은 시험 안에서 가짜로 만든다(파일럿 `supabase/rls.test.ts` 방식)

## 위험
- Supabase 실제 동작(쿠키 이름, `auth.jwt()` 내용)은 PGlite·목으로만 확인한다 → 다음 단계 E2E에서 실제 확인
- 콜백은 `request.url`을 공개 origin으로 믿는다(Vercel·localhost에서는 맞다). 다른 프록시 뒤에 두면 다시 본다
- Next 15 `middleware.ts`가 Edge 런타임이라 `server-only`·Node API를 쓰지 않는다
- 새 dev 패키지(jsdom·Testing Library·PGlite)가 기존 시험 속도·설정에 영향을 줄 수 있다 → TASK-1에서 기존 `npm test`가 그대로 통과하는지 확인
