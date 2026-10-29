# 설계: 로그인·가입 승인·관리자·대시보드 틀

> 근거: `requirements.md`, plan.md §2-1·§5·§6, ADR-002·004·006·015. 화면 문구·순서는 `docs/mockups/auth/*.dc.html`, 모양·색은 `docs/mockups/app-redesign/`(시안 A `A.jpg`, 블루 팔레트 `palette-blue.html`)와 `docs/UI_GUIDE.md` '앱 화면'.
> 파일럿(`tonggye-bunseok` `fbb303a`)에 있는 것은 옮기고, 없는 것(관리자 표·승인 함수·관리자 화면·자동 로그아웃)은 새로 만든다.

## 2026-10-29 바뀐 점 (앱 리디자인, 사용자 결정)
- 사용자가 앱 모양을 "AI가 만든 SaaS 템플릿"이라며 거절하고, 시안 A(배치)·블루 팔레트(색)·Tailwind CSS v4(ADR-015)·진료 기록지 폰 배치(블루로)를 승인했다
- TASK-1~12(완료)의 동작·문구는 그대로다. 바뀌는 것:
  - TASK-16(새): Tailwind 설정·토큰·글꼴 변수
  - TASK-17(새): 이미 만든 화면(로그인·가입 신청·승인 대기·오류)을 Tailwind + 블루로 다시 입히고 `*.module.css` 5개를 지운다. 그 화면의 CSS 값 시험은 새 클래스·토큰을 보도록 고쳐 쓴다(지우거나 약하게 하지 않는다)
  - TASK-13·14·15(다시 씀): 왼쪽 메뉴·폰 서랍 → 위쪽 띠 + 가로 밑줄 탭, 대시보드는 빈 자리(제목 + 준비 중 안내), 관리자는 새 모양
  - TASK-18(새): dev-browser로 1440px·390px 화면을 찍어 시안과 비교하고 고친다
- 요구사항: REQ-008을 가로 탭으로 고치고 '준비 중'·한국 시각·폰 탭을 더했다. REQ-009는 "오늘" 제목과 빈 안내 상자 하나(대시보드 내용은 별도 명세). REQ-007에 폰 배치. REQ-013(앱 디자인 규칙)을 새로 둔다
- 할 순서: TASK-12 → 16 → 17 → 13 → 14 → 15 → 18 (`tasks.md`도 이 순서로 적었다)

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
│   ├── ui/classes.ts                   # 앱 공통 모양(단추·입력란·체크 상자·칩·카드·패널·표·초점 고리) Tailwind 클래스 묶음
│   ├── common/ErrorCard.tsx            # 파일럿 이식
│   ├── auth/{LoginCard,SignupForm,PendingCard,SignOutButton,AuthFrame}.tsx
│   ├── shell/{AppShell,TabBar,AccountMenu,KstClock,IdleLogout}.tsx, menu.ts, kstNow.ts
│   ├── dashboard/{DashboardEmpty}.tsx, todayTitle.ts
│   └── admin/{AdminApplications}.tsx, applications.ts
└── types/{db,errors}.ts
supabase/
├── migrations/20261028000000_auth.sql  # 표·RLS·함수 (SQL 편집기에 붙여 넣는다 — 다음 단계)
└── rls.test.ts                         # PGlite로 마이그레이션을 실제로 돌려 권한을 증명
postcss.config.mjs                      # @tailwindcss/postcss 하나 (ADR-015)
```
- 각 컴포넌트 옆에 `*.test.tsx`를 둔다. 앱 화면은 `*.module.css` 없이 Tailwind 클래스만 쓰고, 색·글자·모서리는 `globals.css` `@theme` 토큰이다(ADR-015, UI_GUIDE '앱 화면'). 랜딩만 CSS Modules(ADR-014)

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
export function koreanDateTitle(ymd: string): string          // '2026-10-28' → '2026년 10월 28일 (수)' (dates.ts weekdayOf). 화면 제목은 "오늘" + 이 값

// components/dashboard/DashboardEmpty.tsx (Server Component)
export function DashboardEmpty(props: { title: string }): JSX.Element  // 제목 + 빈 안내 상자 하나 ("대시보드는 준비 중입니다")

// components/shell/menu.ts
export type MenuItem = { label: string; href: '/dashboard' | null }   // null = 아직 없는 화면(준비 중, 링크 아님)
export const MENU: readonly MenuItem[]                        // 대시보드·통계·AI 리포트·매출·재고·급여·일일마감·보고·월간 PDF·설정
export const ADMIN_ITEM: { label: '관리자'; href: '/admin' }

// components/shell/kstNow.ts
export function kstNow(now: Date): string                     // → '2026년 10월 29일 (목) 09:42 (KST)'. dates.ts todayInKorea·weekdayOf, 서버가 UTC여도 한국 시각

// components/shell/AppShell.tsx (Server Component)
export function AppShell(props: { hospitalName: string; email: string; isAdmin: boolean; children: ReactNode }): JSX.Element
// components/shell/TabBar.tsx ('use client': usePathname으로 지금 탭, 처음 그릴 때 지금 탭을 scrollIntoView)
// components/shell/KstClock.tsx ('use client': kstNow(new Date())를 그리고 1분마다 바꿈, 떠나면 타이머 해제)
// components/shell/AccountMenu.tsx ('use client': props { email, hospitalName, isAdmin }, 바깥 누름·Esc로 닫힘)

// components/ui/classes.ts — Tailwind 클래스 문자열만(로직 없음). 화면은 이것을 가져다 쓰고, 모양 시험은 이 값이 요소에 있는지 본다
export const ui: {
  focusRing: string                                           // focus-visible:outline-2 outline-accent outline-offset-2
  button: { primary: string; secondary: string; danger: string; text: string; small: string }
  input: string; readonly: string; checkbox: string; label: string; fieldError: string
  chip: { neutral: string; done: string; progress: string; wait: string; rejected: string }
  card: string; panel: string
  table: { wrap: string; table: string; th: string; td: string; num: string; emptyRow: string }
}
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
- **아직 없는 탭은 링크가 아니고 '준비 중' 툴팁** (2026-10-29): 빈 링크는 혼란스럽다. `<a>` 대신 `<button type="button" aria-disabled="true" aria-describedby="…">`로 두고 눌러도 아무 일이 없다. 모양은 다른 탭과 같고(시안 A), 올림·초점에 '준비 중' 툴팁. 아직 없는 기능의 단추([통계 파일 올리기]·[재고 등록하기])도 `aria-disabled`
- **대시보드 범위 — 빈 자리만** (2026-10-29): 사용자가 대시보드 내용(숫자 카드·패널)은 질문 정리(grill-me)로 따로 정해 새 명세로 만들기로 했다. 이번에는 로그인 뒤 도착할 `/dashboard` 페이지에 제목과 빈 안내 상자 하나만 둔다. 시안 A의 숫자 카드·패널 줄은 이번에 만들지 않는다(목업 `A.jpg`는 톤앤매너 기준으로만 쓴다)
- **Tailwind는 Preflight 없이** (ADR-015): 랜딩 CSS는 브라우저 기본값(`box-sizing: content-box` 등)에 기대고 있어 Preflight를 넣으면 랜딩 모양이 바뀐다. globals.css는 `@layer theme, base, components, utilities;` 뒤 `tailwindcss/theme.css`(layer theme)·`tailwindcss/utilities.css`(layer utilities)만 불러오고, `@layer base`에서 앱 뿌리 `.app-ui` 안에만 작은 초기화(box-sizing border-box, 여백 0, 단추·입력란 글꼴·색 상속, `tabular-nums`, keep-all, 바탕 `canvas`)를 준다. 랜딩 CSS Module은 layer 밖이라 Tailwind보다 늘 이긴다
- **기본 색 지우기**: `@theme`에 `--color-*: initial;` 뒤 토큰만 둔다. `bg-blue-500` 같은 클래스는 아예 만들어지지 않고, `transparent`·`current`는 그대로 쓸 수 있다
- **글꼴 변수 이름**: Tailwind 테마 변수 `--font-sans`와 next/font 변수 이름이 같아 서로 덮는다. layout.tsx의 next/font 변수를 `--font-plex`·`--font-grotesk`로 바꾸고, globals.css의 `:root`에서 `--font-sans: var(--font-plex), system-ui, sans-serif`·`--font-num: var(--font-grotesk), …`로 잇는다. `@theme`의 `--font-sans`도 같은 값. 랜딩 CSS Module의 `var(--font-sans)`·`var(--font-num)`은 그대로 동작한다. Space Grotesk는 랜딩만 쓴다
- **계정 단추에는 이메일**: 시안은 "홍길동 님"이지만 plan.md §6-4가 위쪽 띠에 로그인한 구글 계정을 보이라고 한다 → PC는 이메일을 보인다. 폰은 44px 아이콘 단추이고 이메일은 메뉴 안과 `aria-label`에 있다
- **로고**: 시안의 십자 마크는 자리표시다. 랜딩·인증 화면과 같은 막대 세 개 로고를 26px로 쓴다(서비스 이름·로고는 출시 전 정함, plan.md §10)
- **탭 띠 스크롤과 툴팁**: `overflow-x: auto`인 띠 안에서는 아래로 나가는 툴팁이 잘린다. 1024px 이상은 탭이 한 줄에 다 들어가므로 스크롤 없이(overflow visible) 툴팁을 보이고, 그보다 좁으면 띠 안에서 옆으로 밀고 툴팁은 숨긴다(준비 중은 `aria-describedby` 글로 남는다). 띠 안 스크롤은 얇은 스크롤바로 알리고 그라데이션 흐림은 쓰지 않는다
- **한국 시각**: KstClock이 서버·브라우저 모두 `kstNow(new Date())`를 그리고 1분마다 바꾼다. 분 경계에서 두 값이 다를 수 있어 그 `<time>` 하나만 `suppressHydrationWarning`. 시각이 바뀌는 것은 자동 로그아웃의 '움직임'이 아니다
- **위쪽 띠만 붙어 따라온다**: 승인된 팔레트 화면처럼 위쪽 띠만 sticky이고 탭 띠는 본문과 함께 올라간다
- **모양 시험은 클래스로**: jsdom은 CSS를 계산하지 않는다. 모양 시험은 요소에 정해 둔 클래스(`ui.*`, 토큰 클래스)가 있는지와 임의 색 값이 없는지를 본다. 지운 `*.module.css`를 읽던 시험은 같은 AC ID로 이 방식으로 고쳐 쓴다. 실제 보이는 모양은 TASK-18의 스크린샷으로 본다
- **자동 로그아웃은 브라우저 타이머**: 다른 탭 움직임은 BroadcastChannel로 나눈다(브라우저 저장소 금지 규칙). `signOut()` 기본(전역)이 갱신 토큰을 끊는다
- **문의 이메일**: 목업은 `[이메일 주소]` 빈칸이다. 값을 정할 때까지 빈칸 문구 그대로 둔다
- **화면 시험**: 상호작용이 있는 컴포넌트 시험만 파일 첫 줄 `// @vitest-environment jsdom` + Testing Library를 쓴다. 나머지는 지금처럼 node + `renderToStaticMarkup`
- **DB 시험**: PGlite(WebAssembly Postgres)로 실제 마이그레이션을 돌린다. `auth` 스키마·`auth.uid()`·`auth.jwt()`·`anon`/`authenticated` 역할은 시험 안에서 가짜로 만든다(파일럿 `supabase/rls.test.ts` 방식)

## 앱 화면 모양 (2026-10-29, 값은 UI_GUIDE '앱 화면')

### 앱 틀 (TASK-13)
- `(app)/layout.tsx`: guardPage → `<AppShell hospitalName email isAdmin>` + `<IdleLogout />`
- AppShell 뿌리 `.app-ui`(바탕 `canvas`). 위쪽 띠(sticky, 흰, 64px, 좌우 24px): 로고·`[서비스 이름]`·세로 선·병원 이름 | KstClock·AccountMenu. 그 아래 TabBar, 그 아래 `<main>`(좌우 24px, 위 24px, 아래 28px)
- TabBar: `<nav aria-label="메뉴">`. MENU 순서대로 — href가 있으면 `next/link`(지금이면 `aria-current="page"`), 없으면 준비 중 단추 + 툴팁. 관리자면 세로 선 뒤 [관리자] 링크. 지금 탭 = `accent` 글자 700 + 3px 밑줄
- AccountMenu: 계정 단추 `aria-haspopup="menu"`·`aria-expanded`. 메뉴: 이메일·병원 이름·("관리자 계정" 중립 칩)·[로그아웃](SignOutButton). 떠 있는 층이라 `shadow-float`
- 폰(<768px): 띠 48px(로고·병원 이름·44×44 계정 단추), 탭 46px·띠 안 옆 밀기, 메뉴 항목 44px. 서랍 없음

### 대시보드 (TASK-14)
- h1 "오늘" + 10px + `koreanDateTitle(todayInKorea())` (title 600, 폰 title-sm)
- 제목 아래 빈 안내 상자 하나(ui.card: 흰 바탕, 1px 선, 6px 모서리, 안쪽 여백 24px): "대시보드는 준비 중입니다"(panel 600) + "어떤 숫자와 칸을 둘지는 따로 정한 뒤 만듭니다."(muted). 숫자 카드·패널·단추 없음

### 관리자 (TASK-15)
- 제목·문구는 목업(`docs/mockups/auth/Admin.dc.html`) 그대로. 화면 안 밑줄 탭(대기·승인·거절, 개수 칩, `role="tablist"`, 지금 탭 `aria-selected="true"`) 아래 표(ui.table): 신청일·병원 이름·신청자·이메일·연락처·동작
- 동작 칸: 대기 = [승인](주, small)·[거절](보조, small), 거절 = [되돌리기](보조, small), 승인 = 완료 칩 "승인됨". 표 안 단추는 높이 32px(폰 44px)
- 완료 문구("○○ 신청을 승인했습니다.")는 표 위 한 줄 `role="status"`(table, `ok` 글자 + 체크 아이콘). `E-ADMIN-FAILED`는 같은 자리에 ErrorCard
- 거절 확인 창: `role="dialog"`·`aria-modal="true"`, 처음 초점 [취소], Esc = 취소. 떠 있는 층이라 `shadow-float` + 가림막
- 빈 탭: 표 머리는 두고 칸 전체를 잇는 한 줄(ui.table.emptyRow)에 목업 안내
- 폰: 표 머리를 숨기고 줄을 카드처럼 쌓는다(병원 이름·신청자·이메일·연락처·신청일 / 상태 칩 / 전체 폭 단추)

### 이미 만든 화면 다시 입히기 (TASK-17)
문구·순서·동작·접근성 이름은 그대로 두고 모양만 바꾼다.

| 화면 | 새 모양 |
|---|---|
| AuthFrame | `.app-ui` 뿌리, `canvas` 바탕. 앱과 같은 흰 띠(64px·폰 48px, 로고 + `[서비스 이름]`), headerEnd는 `ml-auto`. 본문은 가운데, 위 64px(폰 24px), 좌우 24px(폰 16px) |
| LoginCard | PC 두 칸(소개 · 카드, 사이 48px), 폰은 쌓임. "SIGN IN"은 caption 600 `muted`(문구 그대로), 제목 title 600, 설명 body `ink-2`, 기능 칩 4개는 범주(중립) 칩. 카드 = ui.card: [구글로 시작하기]는 주 단추 전체 폭(구글 G 마크 색은 그대로), 개인정보 안내는 위 1px 선 + 방패 아이콘(`muted`) + table `ink-2`, 끝 안내 caption `muted`. 인앱 안내는 `canvas` 상자(1px 선, 6px) + 읽기 전용 주소 칸 + [주소 복사] 보조 단추 |
| SignupForm | 단계 표시 01·02·03(끝난 단계 `ok` 체크 아이콘 + `ink-2`, 지금 단계 `ink` 600, 다음 단계 `muted`, 사이 1px 선). 카드 = ui.card. 구글 이메일은 읽기 전용 칸 + 자물쇠 아이콘. 병원 이름·신청자 이름·연락처는 ui.label + ui.input(필수·선택 표시는 caption `muted`), 오류는 `aria-invalid` + 테두리 `danger` + ui.fieldError. 동의는 ui.checkbox. [가입 신청] 주 단추 전체 폭, [다른 계정으로 로그인] 글자 단추 |
| PendingCard | 같은 단계 표시(03이 지금). 상태 그림은 20px 선 아이콘(대기 `ink-2`, 거절 `danger`)이고 색 원 바탕은 없다. 신청 내용은 기록 목록(왼쪽 칸 이름 96px table `muted`, 오른쪽 값 table `ink`, 줄마다 1px 선). [상태 다시 확인] 주 단추, 띠 오른쪽 로그아웃은 글자 단추(자리 그대로) |
| ErrorCard | UI_GUIDE '오류 카드': `danger-soft` 바탕, 경고 아이콘, 무엇이(`danger` 600)·어떻게(`ink-2`)·오류 번호(caption `muted`) |
| error.tsx | `.app-ui` 가운데 한 칸(최대 400px) + 단추 줄(`flex flex-wrap gap-2`, 단추마다 `flex-[1_1_160px]`): [다시 시도] ui.button.primary, [로그아웃] ui.button.secondary |

고쳐 쓰는 모양 시험 (같은 AC ID에 AC-013.2·013.3을 더한다):
- `ErrorCard.test.tsx`(AC-012.2): 카드 뿌리 `bg-danger-soft`·`rounded-card`, 제목 `text-danger`, 번호 줄 `text-muted`, 임의 색 없음
- `error.test.tsx`(AC-003.7): 단추 줄 `flex`·`flex-wrap`·`gap-2`, 두 단추 `flex-[1_1_160px]`, [다시 시도]는 ui.button.primary의 클래스를 모두, [로그아웃]은 ui.button.secondary의 클래스를 모두 가진다
- `login/page.test.tsx`(AC-003.6): 띠 오른쪽 자리는 `ml-auto` 슬롯이고, 로그인 화면에는 없다
- `LoginCard.test.tsx`(AC-003.1): 주 단추 = ui.button.primary, 기능 칩 4개 = ui.chip.neutral(색 칩 없음), 카드 = ui.card, 임의 색 없음
- `SignupForm.test.tsx`(AC-004.2): 단계 색(끝 `text-ok`, 지금 `text-ink`·`font-semibold`, 다음 `text-muted`), 입력란 = ui.input, 체크 상자 = ui.checkbox, 주 단추, 임의 색 없음
- `PendingCard.test.tsx`(AC-005.1·005.3): 단계 색, 대기 아이콘 `text-ink-2`, 거절 아이콘 `text-danger`, 카드 = ui.card, 임의 색 없음
- 새 `ui/classes.test.ts`: AC-013.3(모서리·그림자·강조색 자리·칩 색)·AC-013.4(폰 44px·16px) + AC-013.2 소스 검사(앱 화면 폴더에 `module.css` import·임의 색·기본 색 이름 없음 — `guardrails.test.ts`처럼 파일을 읽어 본다. 나중 TASK의 파일도 자동으로 검사된다)

## 화면 확인 방법 (TASK-16 끝, TASK-18)
- 도구: 이미 설치된 `dev-browser` CLI. 새 패키지·저장소 안 스크립트·스크린샷은 만들지 않는다. 찍기 스크립트·가짜 서버·스크린샷은 세션 scratchpad(저장소 밖)에 두고 커밋하지 않는다
- 새 Supabase가 아직 없으므로(다음 단계) scratchpad에 Node `http`로 만든 가짜 Supabase 하나를 띄운다: `/auth/v1/user`는 가짜 사용자, `/rest/v1/hospitals`·`/rest/v1/admins`·`/rest/v1/rpc/set_hospital_status`는 상황별 가짜 줄(줄 없음·대기·거절·승인·관리자·읽기 실패 500·저장 실패). 앱은 명령 환경 변수(`.env*` 파일 아님) `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<port>`·가짜 anon 값으로 그 서버를 본다
- 세션은 찍기 스크립트가 쿠키를 넣는다(CLAUDE.md 'E2E 로그인은 시험 코드가 세션 쿠키를 넣는다'). 앱 코드에 우회 길·미리보기 경로를 만들지 않는다. 쿠키 이름·모양은 `@supabase/ssr` 0.12.7 소스를 보고 맞춘다. 스크린샷·로그에 가짜라도 토큰 값을 남기지 않는다
- `npm run build && npm run start`(가짜 값) → dev-browser로 1440×900과 390×844 두 폭에서 찍는다
- 찍을 화면: `/login`, `/login?error=1`, 인앱 브라우저 `/login`(사용자 에이전트를 카카오톡으로), `/signup`(빈 칸·칸 오류·`E-SIGNUP-FAILED`), `/pending`(대기·거절), 오류 화면(`E-PAGE-FAILED`), `/dashboard`(일반·관리자, 계정 메뉴 열림, 준비 중 툴팁 — 1440만), `/admin`(대기 줄 있음·빈 탭·거절 확인 창·승인 완료 줄·`E-ADMIN-FAILED`)
- 비교 기준: 앱 틀·대시보드 = `A.jpg`·`palette-blue.html`(블루, 같은 폭으로 열어 나란히), 폰 = 진료 기록지 폰 화면 배치 + 블루, 문구·순서 = `docs/mockups/auth`. 다르면 고치고 다시 찍는다. 의도한 차이(오늘 할 일 패널 없음·빈 상태·이메일 계정 단추·막대 로고)는 그대로 두고 결과 목록에 적는다
- TASK-16 끝: 랜딩 `/`를 Tailwind 넣기 전(현재 HEAD)과 뒤에 두 폭으로 찍어 같은지 본다. 가짜 URL만 주면 로그인 안 한 것으로 보여 랜딩이 열린다

## 위험
- `postcss.config.mjs`를 두면 Next 기본 PostCSS 설정(autoprefixer 등)이 꺼진다. 랜딩 CSS는 `-webkit-backdrop-filter`를 손으로 적어 두었지만, TASK-16에서 빌드된 랜딩 CSS의 `-webkit-` 줄과 스크린샷이 전후로 같은지 확인한다. 다르면 멈추고 사용자에게 묻는다(랜딩 파일은 이 명세 범위 밖)
- 가짜 Supabase로 찍은 화면은 실제 Supabase 동작을 증명하지 않는다 → 다음 단계 E2E
- jsdom 시험은 클래스만 본다. 클래스는 맞는데 보이는 모양이 다른 것은 TASK-18 스크린샷으로만 잡힌다
- 완료 칩(`ok` on `ok-soft`)은 4.49:1로 작은 글자 기준 4.5:1에 조금 못 미친다. 승인된 값 그대로 두고 사용자에게 묻는다
- Supabase 실제 동작(쿠키 이름, `auth.jwt()` 내용)은 PGlite·목으로만 확인한다 → 다음 단계 E2E에서 실제 확인
- 콜백은 `request.url`을 공개 origin으로 믿는다(Vercel·localhost에서는 맞다). 다른 프록시 뒤에 두면 다시 본다
- Next 15 `middleware.ts`가 Edge 런타임이라 `server-only`·Node API를 쓰지 않는다
- 새 dev 패키지(jsdom·Testing Library·PGlite)가 기존 시험 속도·설정에 영향을 줄 수 있다 → TASK-1에서 기존 `npm test`가 그대로 통과하는지 확인
