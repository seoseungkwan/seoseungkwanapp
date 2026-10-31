# 설계: 모든 화면 90점 만들기 (UI 90)

## 개요

**무엇이 바뀌나.** 12개 화면을 승인 시안대로 다듬는다. 큰 새 모양은 셋뿐이다: 없는 주소 화면(지금은 Next 영어 기본 화면), 준비 중 화면 새 배치, 휴대폰 [전체 메뉴]. 나머지는 문구(~요·의원·"비트 PC 연결" 하나), 상태 표시(설정 "할 차례", 청구 "연결 먼저"), 빈 자리 줄이기(대시보드 "연결하면 생기는 것 4가지"), 공통 손질(탭 이름·건너뛰기·대비·누름 반응·불러오기)이다.

**어떻게 나누나.** ① 공통 작은 것(규칙 문서·탭 이름·앱 틀 본문·`ds` 반응·대비·청구 규칙 시험·공용 문구와 메일 설정값)을 먼저 차례로 끝낸다. 그 뒤 ② 404·오류 ∥ ③ 설정 ∥ ④ 대시보드·준비 중(+ ③ 청구) ∥ ⑤ 앱 틀 ∥ ⑥ 랜딩·인증을 서로 다른 파일만 고치게 나눠 병렬 작업 공간에서 할 수 있다('병렬 작업'). 끝에 세 폭 사진으로 다시 매겨 화면마다 90점 이상을 확인한다.

**바뀌지 않는 것.** 문지기·middleware·로그인 콜백·DB·RLS·API, 환자 자료 구역, 토큰 값(`globals.css`), 패키지. `lib/`에서는 `errors.ts`(문구)·`auth/idle.ts`(1분 전 알림 자리)·`auth/signup.ts`(칸 이름표 "의원 이름")만 고친다(REQ-423).

## 기준 시안과 문구 원천

시안은 TASK-1이 `docs/mockups/ui-90/entry/`(들어오는 화면)·`docs/mockups/ui-90/app/`(로그인 뒤 화면)으로 그대로 옮긴다. **문구는 시안 소스의 글자 그대로**(HTML 태그·`nw()` 감싸개 빼고)이고, 모양 값은 시안 CSS(`entry/base.css`·`entry/build.mjs`의 `pageCss` 밖 `.ui` 규칙, `app/css_app.css`)를 토큰·`ds`·간격 단계로 옮긴다.

| 화면 | 시안 소스 (`docs/mockups/ui-90/…`) |
|---|---|
| 랜딩 | `entry/screens.mjs` `landingPC`·`landingPhone`·`preview` + 상수 `KICKER`·`HERO_LEAD`·`AI_POINTS`·`AI_ITEMS`·`ORTHO`·`FEATURES`·`PRIV_H2`·`PRIV_RULES`·`STEPS` |
| 로그인 | `entry/screens.mjs` `loginForm`·`loginPC`·`loginPhone` |
| 가입 | `signupBody` |
| 대기·거절 | `pendingBody`·`rejectedBody` |
| 404 | `notFoundOut`(밖)·`notFoundIn`(앱 안) |
| 앱 틀 | `app/gen.py` `header`·`tabs`·`all_panel`·`acct_menu`·`skip_state`·`idle_state`·`browser_titles`, CSS `.allbtn`·`.allp*`·`.ldbar*`·`.skip`·`.idle*` |
| 대시보드 | `dash_body`·`STEPS5`·`FEATS` |
| 준비 중 | `nr_body` |
| 청구 | `claim_body`·`claim_ready_body`·`BUSY` |
| 설정 | `setup_body`·`SDESC` |
| 가입 승인 | `admin_body`·`acct_menu` |
| 오류 | `error_ui` |

- 시안의 "무엇이 달라졌나"(`entry/build.mjs` 섹션 notes, `app/gen.py` `S.append(section(…))`의 목록)는 만드는 분의 점검표다.
- 시안의 단계 밖 값(15px 글자, 22/30 제목, 9·10·14px 간격 등)은 가까운 토큰·간격 단계로 옮긴다('시안과 다른 점' 2).

## 구성 요소 / 인터페이스

```
docs/mockups/ui-90/{entry,app}/        # TASK-1 시안 그대로
docs/UI_GUIDE.md                       # TASK-1 규칙 ('UI_GUIDE 바꿀 곳')
docs/ui-90/scores.md                   # TASK-19 점수 표

src/app/layout.tsx                     # TASK-2 title template
src/app/(app)/currentMe.server.ts      # TASK-2 currentMe = cache(() => guardPage('/dashboard'))
src/app/(app)/layout.tsx               # TASK-2 generateMetadata + currentMe
src/app/**/page.tsx                    # TASK-2 metadata.title (pending은 generateMetadata)
src/components/shell/AppShell.tsx      # TASK-3 건너뛰기 · 흰 바탕 · main#main
src/app/(app)/loading.tsx              # TASK-3
src/components/ui/classes.ts           # TASK-4 단추 반응 · 기다림
src/components/ui/classes.test.ts      # TASK-4 text-faint 금지 · TASK-5 청구 폴더 · TASK-13 불러오기 줄 예외
src/lib/errors.ts                      # TASK-6 문구
src/components/common/adminContact.ts  # TASK-6 adminContactEmail()
src/components/common/NotFoundScreen.tsx · RequestedPath.tsx   # TASK-7
src/app/not-found.tsx · src/app/(app)/not-found.tsx · src/app/(app)/[...rest]/page.tsx  # TASK-7
src/app/error.tsx                      # TASK-8
src/components/claim/setup/{SetupScreen,SetupAlert,StepGuide}.tsx · steps.ts  # TASK-9
src/components/claim/setup/ClaimEntry.tsx                     # TASK-10
src/components/dashboard/{briefing/*,summary/DashboardAnalysis.tsx}  # TASK-11
src/components/common/{NotReadyScreen.tsx,notReadyFeatures.ts}       # TASK-12
src/components/shell/{TabBar.tsx,AllMenu.tsx,LoadBar.tsx,menu.ts,AccountMenu.tsx} · common/Icon.tsx  # TASK-13
src/components/admin/AdminApplications.tsx                    # TASK-14
src/lib/auth/idle.ts · src/components/shell/IdleLogout.tsx    # TASK-15
src/components/auth/*                                         # TASK-16
src/components/landing/base.module.css · rules.test.ts        # TASK-17
src/components/landing/* · src/components/preview/* · charts/StackedBarChart.tsx  # TASK-18
```

### 탭 이름 (TASK-2)
```ts
// src/app/layout.tsx
export const metadata: Metadata = { title: { template: '%s · 병원 업무 도구', default: '병원 업무 도구' } }
// src/app/(app)/currentMe.server.ts — 같은 요청 안에서 레이아웃과 generateMetadata가 한 번만 읽는다
export const currentMe = cache(() => guardPage('/dashboard'))
// src/app/(app)/layout.tsx
export async function generateMetadata(): Promise<Metadata>   // { title: { template: `%s · ${name}`, default: name } }
// 앱 페이지: export const metadata = { title: '대시보드' }   ('청구' · '비트 PC 연결' · '가입 승인')
// 준비 중 10개: 페이지마다 const feature = notReadyFeature('/stats') 하나를 metadata({ title: feature.name })와
//   <NotReadyScreen feature={feature} />가 같이 쓴다 → notReadyFeature( 부르기는 지금처럼 한 번(notReadyPages.test 그대로)
// /pending: generateMetadata — 페이지와 같은 cache 읽기로 상태를 보고 '승인 대기' | '가입 승인 안 됨'
```
- 404·오류의 탭 이름은 TASK-7·8이 정한다(not-found는 `metadata`, Next가 쓰지 않으면 React `<title>`. 오류 화면은 클라이언트라 `<title>`).

### 앱 틀 본문 (TASK-3)
- 뿌리 `div.app-ui`·`main`을 `bg-surface`로. `has-[[data-page-surface]]:bg-surface`를 지운다(바탕 A, 앱 틀 쪽).
- 첫 자식에 건너뛰기 링크 `<a href="#main">본문으로 건너뛰기</a>`: `sr-only` → `focus-visible:not-sr-only` + 시안 `.skip` 자리·모양(토큰으로). `main`에 `id="main"`·`tabIndex={-1}`.
- `(app)/loading.tsx`: 서버 컴포넌트. `<div role="status"><span className="sr-only">화면을 여는 중이에요</span></div>`.

### `ds` 반응 · 기다림 · 대비 (TASK-4)
- 새 키 `ds.button.ghost`: 글자만 단추의 기본 크기(36px·좌우 16px·body 500, 폰 44px). 오류 화면 [로그아웃]이 쓴다.
- 단추 공통(`ds.button.*`): `transition` + `not-disabled:not-aria-disabled:not-aria-busy:active:translate-y-px` + `aria-busy:cursor-progress aria-busy:opacity-60`. `ds.textButton`: `transition`.
- 기다리는 단추는 `disabled`가 아니라 `aria-busy="true"`(막힘 40%와 겹치지 않음)이고, 누름 처리 함수가 기다리는 동안 돌아간다.
- tab-frame 화면 파일이 `ds` 뒤에 붙인 같은 반응 클래스는 그대로 둬도 된다(같은 값). 그 파일을 고치는 TASK가 정리할 수 있다.
- 글자 `text-faint` → `text-muted`: `KpiStat` "–", 날짜 줄 "·", 기능 목차 "준비 중", 분석 "–", 미리보기 지금 아닌 탭. `faint` 토큰과 `bg-faint`는 차트 표시에 남는다(새 토큰 없음).
- `ErrorCard` 오류 번호 줄 `text-muted` → `text-ink-2`(negative-soft 위 4.33:1 → 4.5:1 이상).
- `classes.ts` 머리 주석의 옛 말(대시보드 빈 자리 "이 명세에서 고치지 않음", "대시보드 두 폴더 밖", 패널 묶음 "지금 쓰는 화면이 없다")을 지금 사실로 고친다(tab-frame 남은 일).

### 규칙 시험 (`ui/classes.test.ts`)
- TASK-4: `ruleBreaks`가 글자색 `text-faint`(변형 앞말 포함)를 '대비'로 잡는다.
- TASK-5: `APP_DIRS`에 `src/components/claim`. 청구 파일의 단계 밖 간격(`gap-2.5`·`gap-x-3.5`·`py-3.5`·`pl-4.5`·`mt-0.75`·`mt-18`·`w-130` 등)을 가까운 단계로, 직접 그린 svg·"✓"/"✗"를 `Icon`으로.
- TASK-13: 불러오기 줄 파일 `src/components/shell/LoadBar.tsx` 한 곳에서만 `duration-700`·`ease-out`을 통과시킨다(예외 목록은 파일 하나 × 클래스 둘, 그 파일이 있어야 한다). 다른 곳의 같은 클래스는 그대로 잡는다.

### 공용 문구 · 관리자 메일 (TASK-6)
```ts
// src/components/common/adminContact.ts — 서버·브라우저 둘 다(빌드 때 글자로 들어간다)
const FALLBACK = 'admin@example.com'
export function adminContactEmail(): string   // process.env.NEXT_PUBLIC_ADMIN_CONTACT_EMAIL을 글자 그대로 읽는다
```
- 메일 모양: 앞뒤 빈칸을 뺀 값이 `^[^\s@]+@[^\s@]+\.[^\s@]+$`이고 254자 이하. 아니면 대체 주소. 비밀값이 아니라 `NEXT_PUBLIC_`이어도 된다(CLAUDE.md 보안 규칙은 비밀값만 막는다).
- `errors.ts`: AC-409.1의 네 항목만 바꾼다(번호·나머지 문구 그대로).

### 없는 주소 (TASK-7)
```tsx
NotFoundScreen({ where }: { where: 'outside' | 'app' })   // 서버. 시안 notFoundOut / notFoundIn
RequestedPath()                                            // 'use client' — usePathname(), 글자로만
src/app/not-found.tsx        → <AuthFrame><NotFoundScreen where="outside" /></AuthFrame>, metadata.title
src/app/(app)/not-found.tsx  → <NotFoundScreen where="app" />, metadata.title
src/app/(app)/[...rest]/page.tsx → notFound()   (metadata.title도 둔다)
```
- 뿌리 `not-found.tsx`는 규칙 시험 폴더 밖이라 클래스 없이 `NotFoundScreen`만 놓는다(모양은 `components/common` 안 → 규칙 시험이 본다).

### 오류 화면 (TASK-8)
- `'use client'` 그대로. `AuthFrame` 한 칸 안: React `<title>오류 · 병원 업무 도구</title>` → `negative` 칩 → h1(`errorInfo('E-PAGE-FAILED').what`) → 안내(`.fix`) → 작은 목록(`dl` 또는 `p` 둘: "오류 번호" `E-PAGE-FAILED`, "관리자 메일:" `adminContactEmail()`) → 단추 줄: [다시 시도](`ds.button.primary`, `window.location.reload()`) · [대시보드로](`<a href="/dashboard">`, `ds.button.secondary`, 새로 열기) · [로그아웃](`SignOutButton`, 새 `ds.button.ghost` — 기본 36px 글자만 단추, 시안 `btn-ghost`). 폰은 단추가 `flex-[1_1_160px]`로 접힌다.
- `ErrorCard`를 쓰지 않는다(빨간 상자 없음). `error`·`reset` 인자는 지금처럼 받지 않는다.

### 비트 PC 연결 (TASK-9)

**단계 칩** (`steps.ts`, `StepView.chip`의 글을 이 표로. 칩 모양은 `SetupScreen`):

| 단계 상태 | 칩 | 단계 줄 안 | 위 오류 상자 |
|---|---|---|---|
| `wait` | `neutral` "대기" | 설명만 | – |
| `checking` | `accent` "확인 중" | 설명 | – |
| `ok` | `positive` `Icon check` "완료" | 설명(+ 지금 옆 글) | – |
| `bad` + `install-extension`·`install-helper`·`register`·`retry` | `accent` "할 차례" | 설명 + 안내(순서·단추, `retry`면 what·fix·오류 번호 한 번) | 없음 |
| `bad` + `update-extension`·`update-helper` | `negative` `Icon x` "버전 안 맞음" | 설명만 | 있음 |
| `bad` + `reregister` | `negative` `Icon x` "의원 다름" | 설명만 | 있음 |

- 위 오류 상자(`SetupAlert`)는 진짜 문제 하나(위 표의 '있음') 또는 방금 누른 등록이 실패한 오류(`registerError`)만 그린다. 그 단계의 안내 단추(내려받기·다시 등록)와 [다시 확인]을 상자 안으로 옮긴다(`actions` 자리). 오류 번호는 상자에서만 보인다.
- `install-extension` 안내는 시안 `.howto` 4줄 + 단추 둘. 대기 단계의 "앞 단계를 먼저 해 주세요"류 글을 지운다. 아래 [연결 다시 확인] 줄을 지운다. 확장 없을 때 맨 위에 `accent-soft` 안내(시안 `.st-note`)를 둔다(옛 "집 PC나 휴대폰이라면 [건수만 보기]" 줄 대신).
- `TEXT` 설명 → 시안 `SDESC`. 됨 옆 글 '등록한 병원과 같아요' → '등록한 의원과 같아요'. 안쪽 메뉴 글 '비트 연결' → '비트 PC 연결'.

**'이 PC' 값**

| 줄 | 모름·없음 | 됨 | 문제 |
|---|---|---|---|
| 크롬 확장 프로그램 | "아직 없어요" | `Icon check` "맞아요"(positive) | `Icon x` "버전이 안 맞아요"(negative) |
| 도우미 | "아직 없어요" | `Icon check` "맞아요" | `Icon x` "버전이 안 맞아요" |
| 요양기관기호 | "아직 없어요" | 가린 번호 · 의원 이름(지금 그대로) | `Icon x` "등록한 번호와 달라요" |
| 마지막 확인 | "아직 없어요" | `checkedAtText`(지금 그대로) | – |

- '이렇게 지켜요': "환자 자료는 이 PC 밖으로 나가지 않아요. 우리 사이트에는 건수와 설정만 가요." · "비트는 읽기만 해요. 메모를 넣을 때만 이 PC에 확인 창이 뜨고, 거기서 [확인]을 눌러야 들어가요." · "확장 프로그램과 도우미는 이 비트 PC 한 대에만 설치해요."
- 768px 넘침(시안 점검 9px): 단계 줄 격자의 고정 칸·`auto` 칩이 원인이면 `minmax(0,1fr)`·줄바꿈으로 고친다. 폰은 칩을 이름 아래로(시안 `.is-ph .step-s`).

### 청구 (TASK-10)
| 통로 상태 | 그리는 것 |
|---|---|
| `no-extension` | `ClaimOffline` — 시안 `claim_body` (h1 · 점 목록 둘 · [이 PC를 비트 PC로 연결] · 건수 줄) |
| `busy` | `BusyCard` 그대로. [건수만 보기] → h1 "청구" + "건수만 볼 수 있어요" + 준비 중 칩 + [다시 확인](보조: `retry()` 후 카드로) |
| `ready` | `NotReadyScreen({ feature: CLAIM_READY, action: <Link …>비트 PC 연결 다시 확인</Link>, meanwhile: false })` |
| `connecting` | h1 "청구"만(지금 그대로) |
| 설정으로 보낼 상태 | `router.replace('/claim/setup')` 그대로 |
- `CLAIM_READY`(이름 "청구", title·소개·만들 것 넷)는 `ClaimEntry.tsx` 안에 둔다(`notReadyFeatures.ts`는 탭 10개 몫).

### 대시보드 (TASK-11)
- `features.ts`: `ready: boolean` → `status: 'ready' | 'connect-first' | 'soon'`. 청구 `connect-first`, 설정 `ready`, 나머지 `soon`.
- `FeatureIndex({ connected })`: 상태 글자 — `connect-first`는 연결 전 "연결 먼저"(ink-2 600 + 화살표) · 연결 뒤 "사용 가능", `ready` "사용 가능"(accent + 화살표), `soon` "준비 중"(muted). 옆 글 숫자는 자료에서 센다.
- `ReadyNow`: 연결 전 줄 — 제목·옆 글·[비트 PC 연결부터](`/claim/setup`). 연결 뒤 묶음은 그대로("열려요"만). 고정 id `SIDE_TITLE_ID` → `useId()`(tab-frame 남은 일).
- `DashboardAnalysis`: 연결 전이면 오늘 하루 분석 옆 칩·안내 줄, 기간별 흐름은 `GainList`(시안 `gains` 4개 + 안내) — 빈 그래프 틀·차트 부품을 그리지 않는다. 연결 뒤는 그대로.
- `DashboardHome`: 문구, `data-page-surface` 지움, `const connected = report != null`(tab-frame 남은 일: `undefined`도 연결 전).
- 보조 글 caption → small. 글 덩어리 최대 40em은 대괄호 값 없이 지금 쓰는 폭 단계(`max-w-128`·`max-w-140` 등, 4px 단위)에서 가장 가까운 것으로 준다(규칙 시험이 막는 값 없이).

### 준비 중 (TASK-12)
```ts
export type NotReadyFeature = { path: string; name: string; title: string; intro: string; items: readonly string[] }
export function NotReadyScreen(props: {
  feature: Pick<NotReadyFeature, 'title' | 'intro' | 'items'>
  action?: ReactNode     // 없으면 [대시보드로 돌아가기]
  meanwhile?: boolean    // 기본 true: "그동안 쓸 수 있어요"
}): ReactElement
```
- `title`은 조사(은/는)까지 자료에 통째로 둔다(계산하지 않는다).

### 탭 줄 (TASK-13)
- `menu.ts`: `MenuItem`에 `ready: boolean`.
- `TabBar`(클라이언트): `nav` 안에 탭 띠(1024px 미만 옆으로 밀림) + `AllMenu`(1024px 미만만 보임) + `LoadBar`. 누른 탭 상태 `pendingPath`: 링크를 왼쪽 단추로 그냥 누르고(보조키·가운데 단추 아님) 주소가 지금 경로와 다르면 정하고, `usePathname()`이 바뀌면 지운다. 탭 모양은 `pendingPath ?? 지금 탭`이 지금 탭 모양.
- `AllMenu`: 단추 + 판(`id`, `aria-controls`). 열림 상태·Esc·바깥 누름(`pointerdown` 밖)·링크 누름·경로 바뀜에 닫힘. 판 링크도 `pendingPath`를 정한다.
- `LoadBar`: `aria-hidden` `span`, `absolute inset-x-0 bottom-0 h-0.5 bg-accent origin-left`, 보일 때 `scale-x-80 duration-700 ease-out transition`, 숨을 때 `opacity-0`(150ms). 규칙 예외 파일.
- 포커스 따라 띠 밀기: 탭 링크 `onFocus`에서 지금의 '지금 탭 보이게 띠만 민다' 함수를 같이 쓴다.
- `AccountMenu`: 이메일 `max-w-32 … md:max-w-60`, 로그아웃 아이콘 `Icon name="logout"`. `Icon.tsx`에 `logout`(시안 `ICONS['logout']` 그림), 머리 주석의 그림 출처를 지금 사실로(b2b-redesign·dashboard-home·ui-90 시안, tab-frame 남은 일).

### 가입 승인 (TASK-14)
- `AdminApplications.tsx`의 `INTRO`·`CONFIRM_BODY`·h1·표 머리 글자, h1 위 "관리자" 줄. 화면 안 탭·표·확인 창 동작은 그대로.

### 자동 로그아웃 (TASK-15)
```ts
startIdleLogout(opts: {
  timeoutMs: number; onIdle(): void
  warnMs?: number; onWarn?(): void; onActive?(): void   // 셋 다 없으면 지금과 같다
} & IdleDeps): () => void
```
- `IdleLogout`: `WARN_MS = 60_000`. 상태 `'none' | 'warn' | 'extended'`. `warn`이면 안내를 그리고, `onActive`가 오면 `none`. [계속 쓰기]는 그 자체가 움직임(누름)이라 `onActive`가 오고, 그 단추로 닫혔을 때만 `extended` 3초.
- 지금은 아무것도 그리지 않는 컴포넌트였다 → 안내 그릴 자리만 더한다(시계·채널·로그아웃 길은 그대로).

### 인증 화면 (TASK-16)
- `AuthFrame`: 로고를 `<a href="/" aria-label="처음 화면으로 가기">`로 감싼다(두 모양).
- `LoginCard`·`LoginAside`·`SignupForm`·`PendingCard` 문구는 시안 그대로. 기다리는 단추는 `aria-busy` + 글자 바꿈("구글로 넘어가는 중…"·"보내는 중…"·"확인 중…").
- 승인 대기 [상태 다시 확인]: `useTransition`으로 `router.refresh()`를 감싸 기다리는 동안 "확인 중…", 끝나고 아직 대기면 결과 줄. 시각 글자 `checkedLabel(now: Date): string`(한국 시각 "오후 2:31", 같은 파일 또는 `components/auth` 안 순수 함수).
- 거절 연락처 줄: `adminContactEmail()` + [주소 복사](로그인 화면 [주소 복사]와 같은 결과 문구 방식).

### 랜딩 반응 (TASK-17)
- `base.module.css` `.btn`: `transition: background-color 150ms, border-color 150ms, color 150ms, opacity 150ms, transform 150ms`, `.btn:active:not(:disabled) { transform: translateY(1px) }`, 올림 색. 메뉴 링크(`SiteHeader.module.css`)·로고 링크: `transition: color 150ms, opacity 150ms`.
- `rules.test.ts`: 장식 금지에서 `transition`을 빼고, 따로 "허용 목록(선택자 × 값)" 시험을 둔다. 나머지 금지는 그대로.

### 랜딩 내용 (TASK-18)
- 섹션 6개 짜임은 그대로(`#top`·`#ai`·`#ortho`·`#features`·`#privacy`·`#how`). `#ai`의 채팅 칸과 `#features`의 급여 패널을 지우고 사전점검 예시 패널을 둔다.
- 미리보기: `sample.ts`에 `PREVIEW_TABS`(= 실제 탭 이름 13개, 시험이 `MENU`와 견준다. 미리보기 소스는 `components/shell`을 불러오지 않는다). 탭 줄 `flex flex-wrap h-9 overflow-clip`(넘치면 줄째 숨음).
- `StackedBarChart`에 `thinLabels?: boolean` — 켜면 홀수 번째 날짜 글자에 `max-md:invisible`. 주지 않으면 지금 그림과 한 글자도 다르지 않다.
- 건너뛰기 링크는 `SiteHeader` 앞(랜딩 CSS 모듈), `<main id="main">`.

### UI_GUIDE 바꿀 곳 (TASK-1)

| 절 | 바뀜 |
|---|---|
| 맨 위 기준 | ui-90 줄: 시안 `docs/mockups/ui-90/{entry,app}/`, 명세 `specs/ui-90/`, "화면마다 90점(10기준 × 10점)" |
| 하지 마라 · 움직임 줄 | 앱·랜딩·인증 조작 요소의 짧은 반응 + 불러오기 줄 하나 밖의 움직임 금지 |
| 토큰 표 `faint` | 쓰는 곳: 지난 기간 눈금·범례 표시만(글자 아님). "글자에는 쓰지 않는다" |
| 대비 | `faint` 글자 예외 문단을 지우고 "글자는 `muted` 이상, 규칙 시험이 `text-faint`를 잡는다", 오류 번호 `ink-2` |
| 차트 | 값 없으면 "–"(`muted`) |
| 미리보기 | 탭 줄 = 실제 탭 13개, 지금 아닌 탭 `muted`, 넘치면 통째로 숨김 |
| 빈 상태 | 꾸밈 예외 둘 삭제. 대시보드 연결 전 "연결하면 생기는 것 4가지", 준비 중 새 배치 + "그동안 쓸 수 있어요" |
| 앱 틀 | 바탕 A(본문 `surface` 한 장, `data-page-surface` 없음), 1024px 미만 [전체 메뉴] 판(AC-303.5 대체), 건너뛰기 링크, 누른 탭 먼저 + 불러오기 줄, 탭 이름 "화면 · 의원 이름", 계정 이메일 768px 이상 240px |
| 대시보드 | "연결하면 바로 쓸 수 있어요" 줄, 청구 "연결 먼저", 상태 글자 색 |
| 인증 화면 | 로고 = 처음 화면 링크, 기다리는 단추 글자, 승인 대기 결과 줄, 거절 관리자 메일, "의원 이름" |
| 관리자 | h1 "가입 승인" + 위 "관리자" 표시, 표 머리 "의원 이름" |
| 오류 카드·확인 창 | 오류 화면 새 짜임(칩 · h1 · 안내 · 번호 · 관리자 메일 · 단추 셋), 없는 주소 화면(밖·앱 안) |
| 칩 표 | `neutral` 준비 중·대기·없는 주소·비트 PC 연결 전 / `accent` 예시 숫자·확인 중·할 차례 / `positive` 완료·쓸 수 있어요·승인됨 / `negative` 버전 안 맞음·의원 다름·승인되지 않음·문제가 생겼어요 / `warning` 그대로 |
| 단추 | 반응이 `ds` 안에 있다(tab-frame 줄의 "다음 명세" 괄호 삭제), 기다림 60%·`progress` 커서, 종류 표에 글자만 기본(`ghost`) |
| 랜딩 짜임 | 쓸 수 있는 값 줄의 "`transition`은 없다" → `.btn`·메뉴·로고 링크 150ms 목록, `#ai`(채팅 칸 없음, 준비 중 칩), `#features`(사전점검 예시 패널, 01~04), 건너뛰기 |
| 휴대폰 | [전체 메뉴], 빠지는 것 목록에서 채팅 칸·급여 패널 삭제, 랜딩 글자 단계 |
| 문구 | ~요 · 의원 · 이름 하나 "비트 PC 연결" · "F/U" 대신 "재방문" · 관리자 메일은 설정값 `NEXT_PUBLIC_ADMIN_CONTACT_EMAIL`(없으면 `admin@example.com`) |
| 움직임 | 랜딩·인증 단추 반응 허용(150ms 목록), 불러오기 줄(700ms 감속, `LoadBar.tsx` 한 곳), 그래프·미리보기는 정지 |
| 아이콘 | 19개(`logout` 더함) |

## 데이터 흐름
- 탭 이름: 요청 → `(app)/layout` `generateMetadata` → `currentMe()`(요청 안 캐시, 레이아웃과 같은 읽기) → 의원 이름 → `%s · 의원 이름`. 새 읽기·쓰기 없음.
- 관리자 메일: 빌드 때 `NEXT_PUBLIC_ADMIN_CONTACT_EMAIL` → 글자 → 오류·거절 화면. 서버로 보내는 것 없음.
- 누른 탭: 클릭 → `pendingPath` → 경로 바뀜 → 지움. 불러오는 동안 본문은 `loading.tsx`.
- 자동 로그아웃: 움직임 없음 29분 → `onWarn` → 안내 → 움직임 → `onActive` / 30분 → 로그아웃(지금 길).
- 화면 자료는 지금과 같다(대시보드는 늘 자료 없음, 청구·설정은 통로 상태).

## 결정과 트레이드오프
- **①에 공통을 모은다.** 바탕 A의 앱 틀 한 줄·`errors.ts`·`adminContact`·규칙 시험의 청구 폴더를 ①에 두면 ②~⑥이 같은 파일을 안 건드린다. ①이 커지는 대신 병렬 갈래가 겹치지 않는다.
- **청구 연결됨 = 준비 중 화면 재사용.** 시안이 "다른 준비 중 화면과 같은 모양"이라 `NotReadyScreen`에 `action`·`meanwhile`을 연다. 그래서 TASK-10은 TASK-12 뒤다.
- **앱 안 404는 `(app)/[...rest]`.** 뿌리 not-found만 두면 로그인한 사람도 앱 틀 없는 화면을 본다. 잡는 페이지가 앱 틀·승인 검사를 같이 받는다. 문지기는 그대로다.
- **기다림은 `aria-busy`.** `disabled`(40%·`not-allowed`)와 다른 모양(60%·`progress`)이 시안이다. 둘을 섞지 않으려고 기다리는 동안은 `disabled`를 쓰지 않는다.
- **`faint` 토큰은 남긴다.** 글자만 `muted`로 바꾸고 규칙 시험으로 막는다. 차트 표시(`bg-faint`)는 그대로라 새 토큰·값 바꿈이 없다.
- **불러오기 줄만 예외.** 700ms는 '짧은 반응'(120~200ms) 밖이지만 시안이 고른 "눌렀는지 보이게"의 핵심이다. 파일 하나로 가둔다. 모션 줄이기면 전역 규칙이 끈다.
- **준비 중 h1은 자료에 통째로.** 받침에 따른 조사 계산을 코드로 두지 않는다(10개뿐, 시험이 글자를 못 박는다).
- **관리자 메일 대체 주소는 `example.com`.** 진짜 주소는 총괄이 정해 환경 변수로 넣는다(코드·커밋에 개인 메일 없음).
- **점수는 다른 리뷰어가.** 만든 쪽이 매기면 후해진다. TASK-19는 사진·시안·측정만 주고 `harness-reviewer`(또는 새 에이전트)가 매긴다.

## 시안과 다른 점
1. 오류 화면 탭 이름은 "오류 · 병원 업무 도구"다(시안 "… · 예시정형외과의원"). 오류 화면은 앱 틀 밖이라 의원 이름을 읽지 않는다.
2. 시안의 단계 밖 값(15px 글자, 22/30 제목, 9·10·14px 간격 등)은 가까운 토큰·간격 단계로 옮긴다.
3. 불러오기 줄 끝: 시안은 100%까지 찬 뒤 늦게 흐려지지만(`delay`), 여기서는 경로가 바뀌면 150ms에 흐려진다(`delay-*` 금지). 모션 줄이기 기기에서는 시안의 '멈춘 줄'처럼 그 자리에 서 있다가 사라진다.
4. `loading.tsx`는 시안에 없다. 화면 읽기 글자 "화면을 여는 중이에요"만 둔다.
5. 자동 로그아웃: 시안의 [안내 다시 보기]는 시안 보기용이라 만들지 않는다. "다시 30분 동안 쓸 수 있어요."는 3초 보인다. PC 자리(오른쪽 아래 24px·폭 360px)는 시안에 없어 정했다.
6. 미리보기 탭: 시안은 스크립트로 넘치는 탭을 숨기지만 미리보기에는 스크립트가 없어 줄바꿈 + 한 줄 높이 자르기로 숨긴다.
7. 청구 다른 창 카드의 [건수만 보기] 뒤 화면은 시안에 없다. 건수가 아직 준비 중이라 h1 "청구" + "건수만 볼 수 있어요" + 준비 중 칩 + [다시 확인]만 둔다(새 문구 없이 시안 글에서 고름).
8. 비트 PC 연결에서 다시 확인으로 풀리는 실패(끊김·연결 안 됨·비트 읽기 실패)와 등록 없음은 빨강이 아니라 "할 차례"다(시안 "빨강은 버전·의원 다름에만"). 방금 누른 등록이 실패한 오류는 위 오류 상자(빨강)다.
9. '이 PC'에서 요양기관기호가 맞을 때 값은 지금처럼 "가린 번호 · 의원 이름", 버전이 안 맞을 때 "버전이 안 맞아요"다(시안은 처음·의원 다름 상태만 그림).
10. 밖 404(로그인 전 모양)는 지금 문지기 길로는 거의 열리지 않는다(로그인 안 한 사람의 없는 주소는 middleware가 `/login`으로). 영어 기본 화면 대신 쓰는 안전망으로 두고, 사진 점수는 앱 안 모양으로 매긴다.
11. 관리자 거절 확인 창 문구는 시안에 없어 말끝만 "~요"로 바꾼다.

## 병렬 작업 (Phase별 파일)

| Phase | TASK | 고치는 곳 | 다른 갈래와 |
|---|---|---|---|
| ① 공통 | 1~6 | `docs/UI_GUIDE.md`·시안, 페이지 metadata(`src/app/**/page.tsx`·레이아웃 둘), `AppShell`, `(app)/loading`, `classes.ts`·`classes.test.ts`, `KpiStat`·대시보드 `faint` 세 곳·미리보기 탭 색·`ErrorCard`, 청구 네 파일(규칙만), `errors.ts`, `adminContact` | **먼저 차례로**(`feat-ui-90`). 뒤 갈래가 모두 이것 위에서 시작 |
| ② 404·오류 | 7·8 | `app/not-found.tsx`, `(app)/not-found.tsx`, `(app)/[...rest]/page.tsx`, `common/NotFoundScreen`·`RequestedPath`, `app/error.tsx`·`error.test.tsx`, `app/notFound.test.tsx` | 겹침 없음 |
| ③-가 설정 | 9 | `claim/setup/{SetupScreen,SetupAlert,StepGuide,steps,links,checkedAt}`·`SetupScreen.test`·`steps.test`, `(app)/claim/setup/page.test` | 겹침 없음 |
| ④ 대시보드·준비 중 (+③-나 청구) | 11·12 → 10 | `dashboard/briefing/*`, `summary/DashboardAnalysis*`, `(app)/dashboard/page.test`, `common/NotReadyScreen*`·`notReadyFeatures*`, `(app)/notReadyPages.test`, `(app)/tabFrame.test` · 그다음 `claim/setup/ClaimEntry`·`(app)/claim/page.test` | 겹침 없음. TASK-10은 TASK-12 새 `NotReadyScreen`을 불러 써서 같은 갈래에서 TASK-12 뒤에 |
| ⑤ 앱 틀 | 13~15 | `shell/{TabBar,AllMenu,LoadBar,menu,AccountMenu,IdleLogout}`·`shell.test`·`IdleLogout.test`, `common/Icon*`, `ui/classes.test.ts`(불러오기 줄 예외), `admin/AdminApplications*`·`admin/applications*`, `(app)/admin/page.test`, `lib/auth/idle*` | 겹침 없음. `classes.test.ts`는 ① 뒤로 ⑤만 고친다(가입 신청 문구에 기대던 고르기는 TASK-4가 문구와 상관없게 바꿔 둔다) |
| ⑥ 랜딩·인증 | 16~18 | `auth/*`, `lib/auth/signup*`, `login`·`(onboarding)` page.test, `landing/*`, `preview/*`, `charts/StackedBarChart*`, `app/page.tsx`·`app/page.test.tsx` | 겹침 없음. `AuthFrame` 로고 링크가 ②의 화면에도 보인다 → ② 시험은 `AuthFrame` 머리를 보지 않는다 |
| 끝 | 19 | `docs/ui-90/scores.md` (+ 90 미만 화면의 그 TASK 파일) | 다 합친 뒤 |

- 서로 불러오기만 하는 공용 파일(`adminContact`·`errors.ts`·`ds`·`Icon` 18개·`MENU` 이름·`notReadyFeature`)은 ①에서 끝나 있거나 바뀌어도 모양이 뒤로 맞는다(`MENU.ready` 더함, `NotReadyFeature.title` 더함).
- TDD 기록 `specs/ui-90/tdd-log.jsonl`은 `.gitattributes`의 `merge=union`으로 줄이 모두 남는다(tab-frame이 넣음).

## 찍을 화면과 점수 매기는 법 (TASK-19)

**찍을 화면**(390×844 · 768×1024 · 1440×900, 모션 줄이기, 가짜 Supabase·세션·확장 신호):

| 화면 | 주소 · 상태 |
|---|---|
| 랜딩 | `/` (위에서 끝까지) |
| 로그인 | `/login` · [구글로 시작하기] 누른 기다림 |
| 가입 | `/signup`(병원 줄 없음) · 오류 칸 |
| 대기·거절 | `/pending` 대기([상태 다시 확인] 뒤 결과 줄) · 거절 |
| 404 | `/dashbord`(앱 안). 밖 모양은 시험 그림으로만 |
| 앱 틀 | `/dashboard` · [전체 메뉴] 연 상태(390·768) · 계정 메뉴 연 상태(1440) · 첫 Tab 건너뛰기 · 1분 전 안내(Playwright `page.clock`으로 29분 앞당김) |
| 대시보드 | `/dashboard` 연결 전 |
| 준비 중 | `/contacts` |
| 청구 | `/claim` 확장 없음 · 연결됨 · 다른 창 |
| 설정 | `/claim/setup` 처음 · 의원 다름 |
| 가입 승인 | `/admin`(관리자) 대기 탭 |
| 오류 | 가짜 Supabase가 병원 줄 읽기에 오류를 돌려줄 때 아무 앱 주소 |

**기준 10개**(칸마다 0~10, 합계 100):
①첫인상(3초 안에 무슨 화면이고 무엇을 누르는지) · ②읽기(글자 크기·줄 길이·위계) · ③일관성(이름·모양·말투가 다른 화면과 같음) · ④폰(390 한 줄·44px·넘침 없음) · ⑤길찾기(지금 위치·다음 할 일·돌아갈 길) · ⑥신뢰(지어낸 숫자 없음·사실·개인정보 약속) · ⑦문구(쉬운 말·~요·의원) · ⑧접근성(제목 구조·이름·키보드·건너뛰기·대비) · ⑨반응(누름·기다림·결과가 보임) · ⑩완성도(잘림·겹침·빈칸·정렬).

- 매기는 쪽: 만든 쪽과 다른 리뷰 에이전트. 주는 것: 세 폭 사진, 같은 폭 시안, AC-422.1 측정 결과, 이 표. 감점마다 무엇 때문인지 한 줄.
- 화면 하나의 점수는 세 폭을 다 본 한 점수다(④는 390 기준). 90 미만이면 AC-422.3대로 고친다. 앱 틀은 시안 기준 90점 경계라 [전체 메뉴]·건너뛰기·불러오기 줄·1분 전 안내를 먼저 확인한다.

## 위험 / 미해결 질문
- **청구 사전점검 갈래와 겹침.** `wt-precheck`(`feat-precheck`)도 `components/claim/**`·`lib/errors.ts`를 고친다. 이 명세의 청구·설정 손질은 화면 글자·클래스뿐이라, 나중에 합치는 쪽이 충돌을 풀어야 한다. 총괄 메모대로 사전점검 화면은 나중에 다시 그릴 수 있다.
- **`cache`와 `generateMetadata`.** React `cache`가 레이아웃과 metadata 사이에서 한 번만 읽게 해 주는지 빌드 결과로 확인한다. 안 되면 읽기가 두 번(같은 내 줄)일 뿐 동작은 같다.
- **not-found의 `metadata`.** Next가 not-found 파일의 `metadata`를 쓰지 않으면 React `<title>`로 바꾼다(AC-410.4 시험은 그린 결과로 본다).
- **랜딩 시험 고치기가 크다.** `top`·`middle`·`bottom`·`rules` 시험 약 3,000줄이 문구·짜임을 못 박고 있다. TASK-18이 가장 크다.
- **예시 메일이 보인다.** 설정값을 넣기 전까지 오류·거절 화면에 `admin@example.com`이 보인다. 진짜 주소는 총괄이 정하고 Vercel 환경 변수에 넣어야 한다(운영 올리기와 함께, 이 명세 밖).
- **랜딩 폰 높이.** 글자를 키우면 390 높이가 늘어난다. 4,220px(5화면) 이하인지 TASK-19에서 잰다.
- **`/favicon.ico`도 잡는 페이지로 간다.** 파비콘이 없고 middleware는 `/favicon.ico`를 건너뛰므로 `(app)/[...rest]`가 그 요청을 받는다. 브라우저가 그 주소를 물을 때마다 앱 틀 guard와 Supabase 읽기(내 줄)가 한 번 더 돈다(로그인 안 했으면 `/login`으로 보냄). 동작은 맞고 비용만 늘어난다. 파비콘은 이번 범위 밖이라 고치지 않고, 파비콘을 넣는 명세에서 정적 아이콘 파일로 풀린다.
- **보고 문장 말투.** 연결 뒤 원장님 보고 문장(`summary/view.ts`)은 "…습니다" 말투로 남는다(지금은 안 보임). "모든 문구 ~요"에 넣을지는 총괄 확인 거리다.
- **앱 틀 90점 경계.** 시안 기준 고친 뒤 예상이 90이다. 다시 매길 때 가장 먼저 떨어질 수 있다.
