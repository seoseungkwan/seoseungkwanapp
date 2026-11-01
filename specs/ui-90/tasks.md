# 작업 분할: 모든 화면 90점 만들기 (UI 90)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 값과 동작: requirements.md · design.md. 모양·문구: 시안 `docs/mockups/ui-90/{entry,app}/`(design.md '기준 시안과 문구 원천') + `docs/UI_GUIDE.md`.
> 제목 앞 [①]~[⑥]·[끝]은 Phase다. Files의 `*rest*`는 `[...rest]` 폴더를 가리킨다(fnmatch에서 `[`가 묶음 기호라서).
>
> **시작 조건**
> - 명세 승인(`/sdd approve ui-90` 또는 자동 승인). 시안 둘은 총괄이 승인했다(2026-11-01) — 화면 TASK를 시작할 수 있다.
> - `.harness/active`가 아직 `tab-frame`이다. 브랜치 `feat-ui-90`에서는 브랜치 이름으로 이 명세가 활성이고, 다른 이름의 병렬 작업 공간에서는 `python3 ~/.claude/harness/bin/sdd use ui-90`으로 정한다.
>
> **모든 TASK 공통**
> - REQ-423을 지킨다: 문지기·middleware·콜백·DB·API·환자 자료 구역·`types/`·`globals.css`·`e2e/`·`.env.example`·`package.json`을 고치지 않는다. `lib/`은 TASK-6의 `errors.ts`·TASK-15의 `auth/idle.ts`·TASK-16의 `auth/signup.ts`(와 그 시험)만.
> - 시험부터 쓰고 RED를 본다(`python3 ~/.claude/harness/bin/tdd-run TASK-n --expect red`). 새 시험 이름에 이 명세의 AC ID를 넣는다.
> - 옛 시험: 그 TASK의 Files 안 시험에서 이 명세가 바꾼 문구·모양을 기대하는 것만 고친다. 기대를 바꾸면 이름에 새 AC ID를 더하고, 지우면 이유를 커밋 메시지에 적는다. Files 밖 시험이 깨지면 멈추고 보고한다.
> - 새 색·글꼴·토큰·npm 패키지를 만들지 않는다. 대괄호 임의 값·단계 밖 간격·`overflow-hidden`·주석의 색 값(#xxxxxx)을 쓰지 않는다. 움직임은 UI_GUIDE '움직임'(TASK-1이 바꾼 것)만.
> - 문구는 시안 소스 글자 그대로다. 숫자 자료를 지어내지 않는다(가짜 자료는 시험 파일 안에서만). 진짜 메일 주소를 어디에도 적지 않는다.
> - 끝 조건: `npm test`·`npm run lint`(경고 0)·`npm run build` 통과(`python3 ~/.claude/harness/bin/verify`). 화면 TASK는 끝나면 그 화면을 390·1440에서 찍어 총괄에게 쉬운 말로 보인다(TASK가 아님, 찍는 법은 TASK-19와 같다).
>
> **할 순서**
> - Phase ①: TASK-1 → 2 → 3 → 4 → 5 → 6 (차례로, `feat-ui-90`에서). 끝에 `verify`.
> - Phase ②~⑥: 갈래 다섯을 병렬 작업 공간 하나씩에서 동시에 할 수 있다(design.md '병렬 작업'). 갈래 안은 차례로.
>   - ② TASK-7 → 8 · ③-가 TASK-9 · ④ TASK-11 → 12 → 10(③-나, 새 `NotReadyScreen`을 써서 TASK-12 뒤) · ⑤ TASK-13 → 14 → 15 · ⑥ TASK-16 → 17 → 18
>   - 하는 법: ① 끝 커밋에서 `git worktree add ../wt-ui-90-<갈래> -b ui-90-<갈래>`, 갈래마다 `npm ci`, `sdd use ui-90`, `sdd status ui-90`이 "승인됨"인지 확인. 자기 TASK만 하고 자기 브랜치에 커밋. 끝나면 `feat-ui-90`에 `git merge --no-ff`로 하나씩 합친다. 충돌이 나면 멈추고 보고한다.
> - Phase 끝: TASK-19(다 합친 `feat-ui-90`에서).

## Phase ① — 공통 작은 것 (차례로)

## TASK-1: [①] 시안 옮기기와 UI_GUIDE 규칙 바꾸기
- REQ: REQ-401
- Files: docs/mockups/ui-90/entry/*, docs/mockups/ui-90/app/*, docs/UI_GUIDE.md
- TDD: exempt — 시안 파일 복사와 문서 글만 다룬다. 앱 코드가 없다.
  - `cp -a /home/developer/backups/ui-90/mockup-entry/. docs/mockups/ui-90/entry/`, `mockup-app/.` → `docs/mockups/ui-90/app/`. 확인: `diff -r` 출력 없음(AC-401.1). 원본 폴더가 없으면 멈추고 묻는다.
  - UI_GUIDE를 design.md 'UI_GUIDE 바꿀 곳' 표대로 고친다(AC-401.2). 옛 기준을 대체한다는 줄(requirements.md '이 명세가 대체하는 옛 기준')을 맨 위 기준 줄 아래에 더한다.
  - 확인: AC-401.3의 옛 글자를 `grep -n`으로 찾아 없음.

## TASK-2: [①] 화면마다 브라우저 탭 이름
- REQ: REQ-402
- Files: src/app/layout.tsx, src/app/page.tsx, src/app/login/page.tsx, src/app/(onboarding)/signup/page.tsx, src/app/(onboarding)/pending/page.tsx, src/app/(onboarding)/pending/page.test.tsx, src/app/(app)/layout.tsx, src/app/(app)/layout.test.tsx, src/app/(app)/currentMe.server.ts, src/app/(app)/*/page.tsx, src/app/titles.test.tsx, src/app/login/page.test.tsx
- Tests: src/app/titles.test.tsx, src/app/(app)/layout.test.tsx, src/app/(onboarding)/pending/page.test.tsx, src/app/login/page.test.tsx
- TDD: required
  - 새 시험 `titles.test.tsx`: AC-402.1(뿌리 template) · AC-402.2(입구 넷, `/pending` 두 상태는 guard 흉내) · AC-402.4(앱 페이지 14개 이름, 서로 다름). AC-402.3은 `layout.test.tsx`에서 `generateMetadata`와 레이아웃이 `currentMe`를 같이 쓰는지(guard 흉내 부른 경로 `'/dashboard'`).
  - 페이지 파일에는 `metadata` 한 줄(또는 `generateMetadata`)만 더한다. 그리는 내용은 바꾸지 않는다. 예외는 `/pending` 하나: design.md대로 페이지와 `generateMetadata`가 계정 읽기 한 번을 같이 쓰도록 `pendingMe = cache(() => guardPage('/pending'))` 줄과, 그것을 거쳐 읽는 본문(작은 도우미 함수 포함)을 둔다.
  - b2b-redesign AC-213.3(`src/app/login/page.test.tsx`)은 로그인·가입·대기 페이지 파일의 import 줄과 본문 글을 그대로 비교한다. 이 시험의 기대 글에 새 제목 줄(`metadata`/`generateMetadata`)과 그에 필요한 import(`Metadata` 타입, `cache`)만 더한다. 대기(PENDING) 파일만은 위 `pendingMe` cache 줄과 그것을 거쳐 읽는 본문도 기대 글에 넣는다 — 이때도 `guardPage('/pending')`, 대기 아닐 때의 `throw`, `dynamic`, AuthFrame `headerEnd`·`PendingCard` JSX는 그대로이고, 비교는 지금처럼 글자 그대로(exact)다. 그리는 내용과 AuthFrame props 검사는 그대로 둔다.
  - 준비 중 10개는 `const feature = notReadyFeature('<주소>')` 하나를 `metadata`와 화면이 같이 쓴다 — `notReadyPages.test.tsx`의 "부르기 한 번" 시험을 고치지 않고 통과한다.

## TASK-3: [①] 앱 틀 본문 — 건너뛰기 · 흰 바탕 · 불러오는 동안
- REQ: REQ-403, REQ-404, REQ-405
- Files: src/components/shell/AppShell.tsx, src/components/shell/shell.test.tsx, src/app/(app)/loading.tsx, src/app/(app)/loading.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/(app)/layout.test.tsx
- Tests: src/components/shell/shell.test.tsx, src/app/(app)/loading.test.tsx, src/app/(app)/tabFrame.test.tsx
- TDD: required
  - 새 시험: AC-403.1(첫 조작 요소·모양·`main#main`) · AC-404.1(뿌리·본문 `bg-surface`, 옛 클래스 없음, 감싸개 그대로) · AC-405.1(`loading.tsx`).
  - 고치는 옛 시험: `shell.test.tsx` AC-303.6(흰 바탕은 표시가 있을 때만) → AC-404.1로. `tabFrame.test.tsx` AC-307.8(대시보드만 흰 바탕) → 모든 페이지 흰 바탕(이름에 AC-404.1).
  - 대시보드의 `data-page-surface` 표시는 TASK-11이 지운다(그 전까지 남아도 아무 일을 하지 않는다).

## TASK-4: [①] 짧은 반응·기다림을 `ds`에, 글자 대비
- REQ: REQ-406, REQ-407
- Files: src/components/ui/classes.ts, src/components/ui/classes.test.ts, src/components/charts/KpiStat.tsx, src/components/charts/KpiStat.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/FeatureIndex.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/briefing/StickyConnect.test.tsx, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/preview/DashboardPreview.tsx, src/components/preview/DashboardPreview.test.tsx, src/components/common/ErrorCard.tsx, src/components/common/ErrorCard.test.tsx
- Tests: src/components/ui/classes.test.ts, src/components/charts/KpiStat.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/preview/DashboardPreview.test.tsx, src/components/common/ErrorCard.test.tsx
- TDD: required
  - 새 시험: AC-406.1·406.2(모든 `ds.button` 키·`textButton`의 반응·기다림 클래스, 새 `ds.button.ghost`, AC-313.2 규칙 그대로 통과) · AC-407.1(`text-faint`·`hover:text-faint`를 잡고 `bg-faint`는 통과, 검사 파일 전체에 없음) · AC-407.2(다섯 자리 `text-muted`) · AC-407.3(`ErrorCard` 번호 줄 `ink-2`).
  - 고치는 옛 시험: 위 다섯 자리의 `faint` 기대(`KpiStat` AC-205.3, `DashboardHome` AC-306.1·316.4, 분석의 "–", 미리보기 탭), 대시보드 움직임 클래스 허용 목록(`ds`에서 온 새 변형 클래스), `ErrorCard` 번호 색.
  - `classes.ts` 머리 주석의 옛 말을 지금 사실로 고친다(design.md 'ds 반응', tab-frame 남은 일).
  - 새 `ds.button.ghost`는 ② TASK-8 전까지 쓰는 화면이 없다 → `classes.test.ts`의 '쓰는 화면이 없어도 되는 키' 목록(AC-221.1, `NEXT_DASHBOARD_KEYS`)에 더한다(목록에 있어도 쓰면 실패하지 않는다).
  - 병렬 갈래가 안 겹치게: `classes.test.ts` AC-204.7 가입 신청 시험의 고르기를 문구와 상관없게 바꾼다(칸은 이름 끝으로 — `getAllByRole('textbox', { name: /이름\s*필수$/ })`가 의원·신청자 두 칸, 동의는 `getByRole('checkbox')`, 틀린 칸은 `aria-invalid="true"` 요소를 기다림. 칸 순서 전체에 기대지 않아 TASK-16이 읽기 전용 이메일 칸을 글자로 바꿔도 된다). "병원 이름 필수"·"병원 이름을 적어 주세요."·`/동의합니다/`에 기대지 않는다 — TASK-16이 그 문구를 바꿔도 이 파일(⑤만 고침)이 깨지지 않는다.

## TASK-5: [①] 청구 폴더를 앱 화면 규칙 시험에
- REQ: REQ-408
- Files: src/components/ui/classes.test.ts, src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupAlert.tsx, src/components/claim/setup/StepGuide.tsx, src/components/claim/setup/ClaimEntry.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/app/(app)/claim/page.test.tsx, src/app/(app)/claim/setup/page.test.tsx
- Tests: src/components/ui/classes.test.ts, src/components/claim/setup/SetupScreen.test.tsx, src/app/(app)/claim/page.test.tsx
- TDD: required
  - 새 시험: AC-408.1(`APP_DIRS`에 청구 폴더, 청구 소스가 검사 목록에 있고 규칙을 지킴) · AC-408.2(청구 소스에 `<svg`·"✓"·"✗" 없음).
  - 청구 네 파일은 규칙 위반만 고친다(간격을 가까운 단계로, svg → `Icon stop`, ✓/✗ → `Icon check`/`x`). 문구·짜임은 TASK-9·10이 바꾼다.
  - 고치는 옛 시험: 바뀐 클래스·아이콘을 못 박은 기대만.

## TASK-6: [①] 공용 오류 문구와 관리자 메일 설정값
- REQ: REQ-409
- Files: src/lib/errors.ts, src/lib/errors.test.ts, src/components/common/adminContact.ts, src/components/common/adminContact.test.ts, src/components/claim/setup/SetupScreen.test.tsx, src/app/error.test.tsx
- Tests: src/lib/errors.test.ts, src/components/common/adminContact.test.ts
- TDD: required
  - 새 시험: AC-409.1(네 항목 글자, 모든 what·fix에 "병원"·"설치·연결 확인"·"니다." 없음) · AC-409.2(값 있음·빈칸 둘레·없음·빈 글·메일 모양 아님·255자 → 대체, `vi.stubEnv`) · AC-409.3(시험 밖 `src/` 메일 모양 글자는 대체 주소 하나).
  - 고치는 옛 시험: 바뀐 네 문구를 글자로 못 박은 기대만(`errors.test`·`SetupScreen.test`·`error.test`).

## Phase ② — 없는 주소 · 오류

## TASK-7: [②] 없는 주소 화면 (404)
- REQ: REQ-410
- Files: src/app/not-found.tsx, src/app/(app)/not-found.tsx, src/app/(app)/*rest*/page.tsx, src/components/common/NotFoundScreen.tsx, src/components/common/NotFoundScreen.test.tsx, src/components/common/RequestedPath.tsx, src/app/notFound.test.tsx
- Tests: src/components/common/NotFoundScreen.test.tsx, src/app/notFound.test.tsx
- TDD: required
  - `NotFoundScreen.test`: AC-410.1(앱 안 모양) · AC-410.2(밖 모양, Supabase·guard·`fetch` 없음) · AC-410.3(`usePathname` 흉내: 쿼리·해시 없음, 꺾쇠 글자도 글자로, `break-all`).
  - `notFound.test`: `(app)/[...rest]/page.tsx`가 `notFound()`를 부름 · 두 not-found 파일이 각 모양을 그림 · AC-410.4(탭 이름) · AC-410.5(기존 주소 페이지 파일이 모두 있음. 문지기·middleware가 그대로인 것은 `gate.test.ts`·`middleware.test.ts`가 고치지 않고 통과하는 것과 TASK-19의 AC-423.1로 본다).
  - 시험은 `AuthFrame` 머리(로고)를 보지 않는다(⑥ TASK-16이 로고를 링크로 바꾼다).

## TASK-8: [②] 오류 화면
- REQ: REQ-411
- Files: src/app/error.tsx, src/app/error.test.tsx
- Tests: src/app/error.test.tsx
- TDD: required
  - 새 시험: AC-411.1(차례·칩·h1·안내·번호·메일·단추 셋, 빨간 상자 없음, h1 하나) · AC-411.2(오류 내용 없음, 보내기 없음) · AC-411.3(`<title>`) · AC-411.4(`vi.stubEnv`로 메일 두 경우).
  - 고치는 옛 시험: b2b AC-217.2(오류 카드 + 단추 둘)와 AC-002.8·003.7 가운데 짜임을 못 박은 기대. [다시 시도]·[로그아웃] 동작 시험은 그대로. `AuthFrame` 머리는 보지 않는다.

## Phase ③ — 청구 · 설정

## TASK-9: [③] 설정 — 비트 PC 연결
- REQ: REQ-412
- Files: src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupAlert.tsx, src/components/claim/setup/StepGuide.tsx, src/components/claim/setup/steps.ts, src/components/claim/setup/steps.test.ts, src/components/claim/setup/links.ts, src/components/claim/setup/checkedAt.ts, src/components/claim/setup/SetupScreen.test.tsx, src/app/(app)/claim/setup/page.test.tsx
- Tests: src/components/claim/setup/steps.test.ts, src/components/claim/setup/SetupScreen.test.tsx, src/app/(app)/claim/setup/page.test.tsx
- TDD: required
  - `steps.test`(새): AC-412.2 칩 표 전부(상태 × 안내 종류 → 칩 글·색·아이콘), 진짜 문제 판정, 설명 = 시안 `SDESC`.
  - `SetupScreen.test`: AC-412.1(처음 상태, 빨강 없음) · AC-412.3(의원 다름·도우미 버전 상자) · AC-412.4(주 단추·[다시 확인]·번호 개수, 아래 줄 없음 — 상태 여러 개를 돌며) · AC-412.5(글자) · AC-412.6(폰 클래스) · AC-412.7(동작 시험 그대로).
  - 고치는 옛 시험: precheck AC-006.x 가운데 첫 상태 빨강·위 오류 상자 자리·[연결 다시 확인]·"앞 단계"·옛 문구("설치·연결 확인"·"[비트 연결]"·"병원")를 못 박은 기대. 768px 넘침은 클래스로 고치고 TASK-19에서 잰다.

## TASK-10: [③] 청구 (TASK-12 뒤)
- REQ: REQ-413, REQ-404
- Files: src/components/claim/setup/ClaimEntry.tsx, src/app/(app)/claim/page.test.tsx
- Tests: src/app/(app)/claim/page.test.tsx
- TDD: required
  - 새 시험: AC-413.1(확장 없음·휴대폰 모양, 상자 없음, h1 하나) · AC-413.2(연결됨 = 새 `NotReadyScreen` + `action`, "그동안" 없음) · AC-413.3(다른 창 카드 그대로, [건수만 보기] 뒤 모양, [다시 확인]이 다시 붙기를 부름, 설정으로 보내기 그대로).
  - 고치는 옛 시험: precheck AC-006.5(밖에서 보는 건수 자리)와 AC-006.2 가운데 "청구 점검 화면은 준비 중입니다" 기대.

## Phase ④ — 대시보드 연결 전 · 준비 중 · 바탕 A

## TASK-11: [④] 대시보드 — 연결 전
- REQ: REQ-414, REQ-404
- Files: src/components/dashboard/briefing/*, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/briefing/features.test.ts, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx
- TDD: required
  - 새 시험: AC-414.1~414.7, AC-404.2(시험 밖 `src/components/**`·`src/app/**`에 `data-page-surface` 없음). 연결 뒤 모양은 시험 안 가짜 자료로 "그대로"를 본다.
  - 고치는 옛 시험: tab-frame AC-306.2(h1)·306.6(`data-page-surface`)·306.8(숫자 글자)·307.5·307.7(기능 수 2 → 1 + 1)·311.x 가운데 연결 전 빈 그래프 틀·316.1·316.3·316.4(청구 상태·"준비 중" 색).
  - tab-frame 남은 일: `DashboardHome`의 `report !== null` → `report != null`, `ReadyNow`의 `SIDE_TITLE_ID` → `useId()`.

## TASK-12: [④] 준비 중 화면 새 배치
- REQ: REQ-415, REQ-404
- Files: src/components/common/NotReadyScreen.tsx, src/components/common/NotReadyScreen.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/common/NotReadyScreen.test.tsx, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx
- TDD: required
  - 새 시험: AC-415.1(`title` 10개) · AC-415.2(짜임·칸·링크 둘) · AC-415.3(상자·꾸밈 선·고정 높이 없음, 서버 컴포넌트) · AC-415.4(`action`·`meanwhile`) · AC-415.5(페이지 10개 h1).
  - 고치는 옛 시험: tab-frame AC-305.1·305.2(패널·"준비 중인 기능입니다"·꾸밈 선·420px·60px)·305.5(h1 = 이름)·307.3(같은 화면 견주기의 기대 글자).

## Phase ⑤ — 앱 틀

## TASK-13: [⑤] 탭 줄 — 폰 [전체 메뉴] · 누른 탭 먼저 · 불러오기 줄 · 768
- REQ: REQ-416, REQ-405, REQ-417
- Files: src/components/shell/TabBar.tsx, src/components/shell/AllMenu.tsx, src/components/shell/LoadBar.tsx, src/components/shell/menu.ts, src/components/shell/AccountMenu.tsx, src/components/shell/shell.test.tsx, src/components/common/Icon.tsx, src/components/common/Icon.test.tsx, src/components/ui/classes.test.ts
- Tests: src/components/shell/shell.test.tsx, src/components/common/Icon.test.tsx, src/components/ui/classes.test.ts
- TDD: required
  - 새 시험: AC-416.1~416.7 · AC-417.2 계정 메뉴 쪽([가입 승인]에 숫자·칩 없음) · AC-405.2(누른 탭 먼저, 보조키 누름은 아님, 경로 바뀌면 지움) · AC-405.3(불러오기 줄 보임·숨음 클래스, 규칙 예외가 `LoadBar.tsx` 한 곳 × 두 클래스뿐이고 다른 파일의 같은 클래스는 잡음).
  - 고치는 옛 시험: tab-frame AC-303.5(서랍·메뉴 단추 없음 → [전체 메뉴]가 있음, 띠 밀기 기대는 띠 요소로 옮김), AC-303.1(탭 줄 안 `button` 없음 → 탭 띠 안 `button` 없음), 계정 단추 이메일 폭, `ICON_NAMES` 18 → 19.
  - tab-frame 남은 일: `Icon.tsx` 머리 주석(그림 출처)을 지금 사실로.

## TASK-14: [⑤] 가입 승인 이름·말투
- REQ: REQ-417
- Files: src/components/admin/AdminApplications.tsx, src/components/admin/AdminApplications.test.tsx, src/components/admin/applications.ts, src/components/admin/applications.test.ts, src/app/(app)/admin/page.test.tsx
- Tests: src/components/admin/AdminApplications.test.tsx, src/components/admin/applications.test.ts, src/app/(app)/admin/page.test.tsx
- TDD: required
  - 새 시험: AC-417.1(글자·"관리자" 줄·표 머리·확인 창·빈 탭 안내·알림 글) · AC-417.2 가운데 화면 안 탭 개수 그대로(계정 메뉴 쪽 "숫자·칩 없음"은 TASK-13의 `shell.test`).
  - 고치는 옛 시험: b2b AC-220.x 가운데 h1 "가입 신청"·"병원 이름"·"습니다" 기대. 승인·거절·되돌리기 동작 시험은 그대로.

## TASK-15: [⑤] 자동 로그아웃 1분 전 안내
- REQ: REQ-418
- Files: src/lib/auth/idle.ts, src/lib/auth/idle.test.ts, src/components/shell/IdleLogout.tsx, src/components/shell/IdleLogout.test.tsx
- Tests: src/lib/auth/idle.test.ts, src/components/shell/IdleLogout.test.tsx
- TDD: required
  - `idle.test`(가짜 시계): AC-418.1(29분 `onWarn` 한 번, 움직임 → `onActive` 한 번 + 다시 셈, 다른 탭 소식도, 30분 `onIdle`, `warnMs` 없으면 옛 시험 그대로).
  - `IdleLogout.test`: AC-418.2(안내 짜임·자리 클래스·초점 안 옮김) · AC-418.3([계속 쓰기] → 사라짐 + 3초 글, 30분 → `/login`) · AC-418.4(떠나면 정리, 저장소 없음).

## Phase ⑥ — 랜딩 · 입구 화면

## TASK-16: [⑥] 로그인 · 가입 · 승인 대기 · 거절
- REQ: REQ-419
- Files: src/components/auth/*, src/lib/auth/signup.ts, src/lib/auth/signup.test.ts, src/app/login/page.test.tsx, src/app/(onboarding)/signup/page.test.tsx, src/app/(onboarding)/pending/page.test.tsx
- Tests: src/lib/auth/signup.test.ts, src/components/auth/AuthFrame.test.tsx, src/components/auth/LoginCard.test.tsx, src/components/auth/SignupForm.test.tsx, src/components/auth/PendingCard.test.tsx, src/app/login/page.test.tsx, src/app/(onboarding)/signup/page.test.tsx, src/app/(onboarding)/pending/page.test.tsx
- TDD: required
  - 새 시험: AC-419.1(로고 링크, 두 모양) · AC-419.2(로그인 글자·기다림·두 번 안 부름) · AC-419.3(가입 글자·보내는 중·두 번 안 보냄, `signup.ts` 칸 이름표 "의원 이름" — 검사 규칙·길이·전화 규칙은 그대로) · AC-419.4(대기 글자·4줄·확인 중 → 결과 줄, `checkedLabel` 오전·오후·자정·정오) · AC-419.5(거절 글자·메일·[주소 복사] 성공·실패) · AC-419.6(네 화면 금지 글자, 동작 시험 그대로).
  - 고치는 옛 시험: b2b AC-213~216 가운데 문구("습니다"·"병원 이름")·신청일 줄·`disabled`로 막던 기대, auth AC-005.x 가운데 문구.

## TASK-17: [⑥] 랜딩 누름 반응 규칙
- REQ: REQ-420
- Files: src/components/landing/base.module.css, src/components/landing/SiteHeader.module.css, src/components/landing/rules.test.ts
- Tests: src/components/landing/rules.test.ts
- TDD: required
  - 새 시험: AC-420.1(값) · AC-420.2(허용 목록 통과, `animation`·`@keyframes`·`transition: all`·`transition: color .3s`·`transition-delay`·다른 선택자의 `transition` 잡음) · AC-420.3(랜딩 TSX에 `'use client'`·타이머 없음).
  - 고치는 옛 시험: AC-212.1 '장식' 예시 가운데 `transition` 두 줄 → 허용 목록 시험으로 옮김(이름에 AC-420.2). tab-frame AC-313.4 "랜딩 규칙 시험 고치지 않음"은 이 TASK가 대체한다.

## TASK-18: [⑥] 랜딩을 실제 앱에 맞추기
- REQ: REQ-421
- Files: src/components/landing/*, src/components/preview/*, src/components/charts/StackedBarChart.tsx, src/components/charts/StackedBarChart.test.tsx, src/app/page.tsx, src/app/page.test.tsx
- Tests: src/components/landing/top.test.tsx, src/components/landing/middle.test.tsx, src/components/landing/bottom.test.tsx, src/components/landing/rules.test.ts, src/components/preview/DashboardPreview.test.tsx, src/components/preview/sample.test.ts, src/components/charts/StackedBarChart.test.tsx, src/app/page.test.tsx
- TDD: required
  - 새 시험: AC-421.1~421.9. 미리보기 탭은 `sample.test`에서 `PREVIEW_TABS`와 `MENU` 이름을 견준다. `StackedBarChart`는 `thinLabels` 켬·끔(끔은 지금 그림과 같음).
  - 고치는 옛 시험: b2b·landing-v2 랜딩 시험(AC-207~212) 가운데 문구·`#ai` 채팅 칸·`#features` 급여 패널·기능 번호·미리보기 탭 6개·폰 글자 크기 기대, `rules.test.ts`의 `AiSection`·`FeaturesSection` 모듈 시험(새 클래스로).
  - 건너뛰기 링크는 `src/app/page.tsx`의 뿌리 감싸개 안 `SiteHeader` 앞, `<main id="main">`도 그 파일이다. `page.test.tsx`의 header·main·footer 차례 시험(AC-105.1)은 맨 앞 건너뛰기 링크를 넣은 차례로 고친다.
  - 바닥글은 그대로 둔다(범위 밖).

## Phase 끝 — 다시 매기기

## TASK-19: [끝] 세 폭 측정과 점수 표
- REQ: REQ-422, REQ-423
- Files: docs/ui-90/scores.md, src/components/landing/*, src/components/auth/*, src/components/shell/*, src/components/dashboard/**, src/components/common/*, src/components/claim/setup/*, src/components/admin/*, src/components/preview/*, src/app/error.tsx, src/app/error.test.tsx, src/app/not-found.tsx, src/app/(app)/not-found.tsx, src/app/(app)/**/page.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/(onboarding)/**/page.test.tsx, src/app/notFound.test.tsx, src/app/login/page.test.tsx
- TDD: exempt — 측정·점수 문서다. 90 미만 화면을 고칠 때는 그 화면 TASK의 파일 안에서 시안 범위의 클래스·문구만 바꾸고, 바뀐 기대를 그 화면 시험에 함께 고친 뒤 `verify`로 본다.
  - 측정(AC-422.1): design.md '찍을 화면' 표를 scratchpad의 Playwright 스크립트로 세 폭에서 찍고 잰다(가로 스크롤·`document.title`·첫 Tab·글자 대비·44px·본문 바탕·탭 한 줄/[전체 메뉴]·랜딩 390 높이). 1분 전 안내는 `page.clock`으로 앞당긴다. 오류 화면은 가짜 Supabase가 병원 줄 읽기에 오류를 돌려주게 한다.
  - 점수(AC-422.2): 사진·같은 폭 시안·측정 결과·design.md '점수 매기는 법'만 주고 `harness-reviewer`(또는 새 에이전트)에게 매기게 한다. `docs/ui-90/scores.md`: 화면 12줄 × 기준 10칸 + 합계, 칸마다 한 줄 근거, 측정 결과 표, 찍은 날짜·커밋.
  - 90 미만(AC-422.3): 고치고 다시 찍고 다시 매긴다. 두 번 뒤에도 90 미만이면 멈추고 총괄에게 쉬운 말로 알린다.
  - 범위(AC-423.1~423.3): `git diff --name-only ec58679 -- <경로>`로 그대로 둔 경로를 확인하고 결과를 `scores.md` 끝에 적는다. 정리(AC-422.4): `ss -ltnp`로 서버·브라우저가 멈춘 것을 본다.
