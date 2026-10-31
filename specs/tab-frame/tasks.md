# 작업 분할: 탭 13개 틀과 대시보드 첫 화면 (1안 오늘 브리핑)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 값과 동작: requirements.md · design.md. 모양: 시안 `docs/mockups/dashboard-home/index.html` + 메모 `docs/mockups/dashboard-home/notes.md` + `docs/UI_GUIDE.md`.
>
> **시작 조건**
> - 명세 승인(`/sdd approve tab-frame` 또는 자동 승인). 시안은 총괄이 1안 최종본으로 골랐다(2026-10-31) — 화면 TASK를 시작할 수 있다.
>
> **모든 TASK 공통**
> - REQ-308을 지킨다: 로그인·문지기·middleware·콜백·DB·API·`lib/`·`types/`·`classes.ts`·`globals.css`·`globals.test.ts`·`theme.test.ts`·`package.json`, 기존 화면(`/claim`·`/claim/setup`·`/admin`)·미리보기·랜딩의 파일을 고치지 않는다. 차트 부품은 TASK-3의 두 파일(과 그 시험)만 고친다. 아무것도 지우지 않는다(`DashboardEmpty.tsx`·`todayTitle.ts`도 남긴다).
> - 시험부터 쓰고 RED를 본다(`python3 ~/.claude/harness/bin/tdd-run TASK-n --expect red`). 새 시험 이름에 이 명세의 AC ID(AC-301.1 등)를 넣는다.
> - 옛 시험은 그 TASK의 "고치는 옛 시험"에 적힌 것만 지우거나 이름·기대를 고친다. 파일 맨 위 그리기 준비(import·상수·도우미)를 바꾸는 일도 그 목록의 한 항목이다. 목록 밖 시험을 고쳐야 할 것 같으면 멈추고 보고한다.
> - 새 색·글꼴·토큰·`ds` 키를 만들지 않는다. 토큰 클래스와 `ds`만 쓴다. 움직임은 UI_GUIDE '짧은 반응 허용'(TASK-1)만: `transition`(150ms 기본)·`duration-200`(폰 아래 단추만)·`active:translate-y-px`·`group-hover:translate-x-0.5`·`starting:`·`group-open:rotate-180`. `overflow-hidden` 클래스를 쓰지 않는다(`src/app/theme.test.ts`). 주석에 색 값(#xxxxxx)을 쓰지 않는다(`src/comments.test.ts`).
> - 화면 문구는 메모 §4·§5·§6 그대로다. 숫자 자료는 지어내지 않는다(가짜 자료는 시험 파일 안에서만).
> - 끝 조건: `npm test`·`npm run lint`(경고 0)·`npm run build` 통과(`python3 ~/.claude/harness/bin/verify`).
>
> **할 순서**
> - Phase 1: TASK-1 → TASK-2 → TASK-3 → TASK-4 (차례로, `feat-tab-frame`에서). 병렬 갈래가 함께 쓰는 문서·규칙 시험·차트 부품·아이콘을 먼저 끝낸다.
> - Phase 2: **병렬 묶음 A — TASK-5(갈래 가) ∥ TASK-6(갈래 나) ∥ TASK-7(갈래 다) ∥ TASK-8(갈래 라)**. 넷을 동시에, 워크트리 하나씩에서 한다.
> - Phase 3: TASK-9(통합) → TASK-10(세 폭 확인·전체 검사·초안 검토 요청). 넷을 합친 `feat-tab-frame`에서 차례로 한다.
> - Phase 1·2 끝에 오케스트레이터가 `verify`를 돌리고, Phase 2 끝에는 바뀐 화면을 390·1440에서 찍어 총괄에게 보인다(TASK가 아님. 찍는 법은 TASK-10과 같다).
>
> **병렬 묶음 A 하는 법 (오케스트레이터)**
> 1. TASK-4까지 `feat-tab-frame`에 커밋한다(명세·승인 기록·`.harness/active`=`tab-frame`·`.gitattributes`·시안·UI_GUIDE·규칙 시험·차트 부품·아이콘 포함).
> 2. 그 커밋에서 워크트리를 만든다. 예: `git worktree add ../wt-tab-frame-a -b tab-frame-a` (b·c·d도 같게). 갈래마다 `node_modules`를 준비한다(`npm ci`).
> 3. 각 워크트리에서 `python3 ~/.claude/harness/bin/sdd status tab-frame`이 "승인됨"인지 본다. 브랜치 이름이 `feat-tab-frame`이 아니어도 `.harness/active`로 이 명세가 활성이다.
> 4. 갈래마다 자기 TASK 하나만 하고 자기 브랜치에 커밋한다. 다른 갈래의 파일은 읽기만 한다.
> 5. 넷이 끝나면 `feat-tab-frame`에 하나씩 합친다(`git merge --no-ff tab-frame-a` …). `specs/tab-frame/tdd-log.jsonl`은 `merge=union`이라 줄이 모두 남는다. 다른 파일은 겹치지 않아 충돌이 없어야 한다. 충돌이 나면 멈추고 보고한다.
> 6. 합친 뒤 `verify`가 통과하면 워크트리를 정리하고 Phase 3으로 간다.
>
> **갈래별 파일 (겹치는 파일 없음)**
>
> | 갈래 | TASK | 고치는 파일 | 새 파일 |
> |---|---|---|---|
> | 가 | TASK-5 | `components/shell/{menu.ts,TabBar.tsx,AccountMenu.tsx,AppShell.tsx,shell.test.tsx}` · `app/(app)/layout.test.tsx` | 없음 |
> | 나 | TASK-6 | 없음 | `components/common/{notReadyFeatures.ts,notReadyFeatures.test.ts,NotReadyScreen.tsx,NotReadyScreen.test.tsx}` · `app/(app)/<주소 10개>/page.tsx` · `app/(app)/notReadyPages.test.tsx` |
> | 다 | TASK-7 | `app/(app)/dashboard/{page.tsx,page.test.tsx}` | `components/dashboard/briefing/*`(목차 자료·날짜 줄·짜임·폰 아래 단추·시험) |
> | 라 | TASK-8 | 없음 | `components/dashboard/summary/*`(자료 읽는 자리·계산·분석 화면·보고 문장·시험) |
>
> - 서로 불러오지 않는다: 다는 `components/shell/*`·`dashboard/summary/*`·`common/notReadyFeatures.ts`·`components/claim/**`를, 나는 `components/shell/*`·`components/dashboard/**`를, 라는 `components/shell/*`·`dashboard/briefing/*`·`common/notReadyFeatures.ts`를, 가는 `components/dashboard/**`·`common/notReadyFeatures.ts`를 불러오지 않는다. 함께 읽는 것은 바뀌지 않는 파일(`lib/auth/gate.ts`·`lib/analytics/*`·`types/*`·`components/charts/*`·`components/ui/classes.ts`·`components/common/Icon.tsx`)뿐이다(차트 부품·아이콘은 Phase 1에서 끝났다).
> - 다와 가는 글자 하나로만 맞물린다: 다의 대시보드 뿌리 `data-page-surface` ↔ 가의 `main` 클래스 `has-[[data-page-surface]]:bg-surface`. 둘 다 이 글자를 시험으로 못 박고, 통합 TASK가 함께 본다(AC-307.8).

## Phase 1 — 공용 준비 (차례로)

## TASK-1: 준비 — 합치기 설정·계획 문서·시안과 메모 옮기기·UI_GUIDE 짧은 반응
- REQ: REQ-310, REQ-313
- Files: .gitattributes, docs/tab-frame/plan.md, docs/mockups/dashboard-home/index.html, docs/mockups/dashboard-home/notes.md, docs/UI_GUIDE.md
- TDD: exempt — 저장소 설정 한 줄과 문서·시안 파일만 다룬다. 앱 코드가 없다.
  - **`.gitattributes`(새 파일)**: 첫 줄에 이유 주석(병렬 워크트리 브랜치의 TDD 기록을 줄 단위로 모두 남기려고), 다음 줄 `specs/*/tdd-log.jsonl merge=union`. 다른 규칙은 넣지 않는다.
    - 확인: `git check-attr merge specs/tab-frame/tdd-log.jsonl` → `merge: union` (AC-310.1).
  - **시안·메모 옮기기(AC-310.3)**: 총괄이 고른 최종본 `/tmp/claude-1000/-home-developer/a36718af-5abd-4346-8a36-45bb13932488/scratchpad/mockup-dashboard-v3/index.html`·`notes.md`를 `docs/mockups/dashboard-home/index.html`·`notes.md`로 그대로 복사한다(`cmp`로 둘 다 같은지 확인). 작업 공간 파일이 없으면 멈추고 오케스트레이터에게 묻는다.
  - **`docs/tab-frame/plan.md`**: 맨 위 안내를 "2026-10-31 바뀜 — 기준은 `specs/tab-frame`"으로 바꾸고 아래를 고친다(AC-310.2).
    - §1: '대시보드 탭은 없다' → 대시보드가 첫 화면이자 첫 탭. 탭 순서 13개(대시보드 · 통계 · 청구 · 고시·공지 · 환자 · 매출 · AI 리포트 · 서식 · 직원 · 업무일지 · 재고 · 주소록 · 설정). '로그인하면 통계' → 로그인하면 대시보드. 아직 없는 기능은 각자 주소(`/stats` 등)의 '준비 중' 화면. 급여·일일마감·보고·월간 PDF는 직원·업무일지·AI 리포트로 들어간다.
    - 대시보드: 1안 오늘 브리핑 — 날짜 줄 + 큰 문장 + [비트 PC 연결 시작] + 연결 순서 5단계 → 지금 바로 쓸 수 있어요(사전점검) → 오늘 하루 분석(숫자 4칸) → 기간별 흐름(최근 7·30·90일, 그래프 넷) → 기능 목차(12개). 지금은 자료 없음(빈 상태 문구만, 지어낸 숫자 없음). 연결한 뒤에는 큰 문장 자리에 원장님 보고 문장 + [복사], 연결 순서 자리에 사전점검.
    - 설정 탭은 지금 비트 PC 연결(`/claim/setup`)로 간다. 관리자는 계정 메뉴 [가입 승인].
    - 시안 줄: 기준 시안 `docs/mockups/dashboard-home/index.html`, 만드는 분을 위한 메모 `docs/mockups/dashboard-home/notes.md`. 옛 시안 `docs/mockups/tab-frame/`은 탭 안 내용 참고로만 남는다(탭 줄·첫 화면은 새 시안이 이긴다).
    - 바뀐 줄마다 무엇이 바뀌었는지 "(2026-10-31 바뀜: 옛 값)"으로 남긴다. §2 탭마다 넣을 것 표는 그대로 두고 대시보드 줄만 더한다.
  - **`docs/UI_GUIDE.md` 짧은 반응(AC-313.1)**: 메모 §8의 글을 그대로 넣는다.
    - '하지 마라' 표의 움직임 줄을 메모의 새 줄로 바꾼다.
    - '움직임' 절 전체를 메모의 `## 움직임` 글(짧은 반응 허용 소절 포함)로 바꾼다.
    - '공통 모양 › 단추' 절 끝에 메모의 반응 한 줄을 더하고, 같은 줄 끝에 "(지금은 tab-frame 화면 — 탭·계정 메뉴·대시보드 — 만 화면 파일에서 `ds` 뒤에 붙인다. `ds` 자체에 넣는 것은 다음 명세)"를 붙인다(design.md '짧은 반응은 이 명세의 화면 파일 안에서만').
    - '차트' 절의 "움직이지 않는다"와 랜딩 절은 그대로 둔다. 다른 절은 TASK-9가 고친다.
    - 맨 위 기준 줄 아래에 "움직임 규칙은 2026-10-31 사용자 결정으로 '짧은 반응 허용'(tab-frame)" 한 줄을 더한다.

## TASK-2: 앱 화면 규칙 시험 — 짧은 반응 규칙과 새 대시보드 파일 범위
- REQ: REQ-313
- Files: src/components/ui/classes.test.ts
- Tests: src/components/ui/classes.test.ts
- TDD: required
  - 병렬 갈래 넷이 모두 받는 규칙이라 묶음 전에 한다(design.md '규칙 시험').
  - 새 시험(AC ID 이름):
    - AC-313.2: '짧은 반응 밖의 움직임 클래스 %s를 잡는다' — `transition-all` · `transition-colors` · `transition-transform` · `duration-150` · `duration-300` · `delay-75` · `ease-in-out` · `ease-[cubic-bezier(0,0,1,1)]` · `motion-safe:animate-pulse` · `hover:transition-all`. '짧은 반응 클래스 %s는 통과한다' — `transition` · `duration-200` · `active:translate-y-px` · `not-disabled:active:translate-y-px` · `group-hover:translate-x-0.5` · `starting:opacity-0` · `starting:-translate-y-1` · `group-open:rotate-180` · `translate-y-full`. 지금 `ds` 키·검사 목록 파일이 새 규칙을 지킨다(지금 있는 `it.each(DS_KEYS)`·검사 목록 시험이 그대로 본다).
    - AC-313.3: 검사 목록에 `src/components/dashboard/todayTitle.ts`와 `src/app/(app)/dashboard/page.tsx`가 들고 `src/components/dashboard/DashboardEmpty.tsx`만 빠진다. 대시보드 두 폴더에 새로 생기는 시험 밖 `.ts`·`.tsx`(예: 시험 안에서 이름만 만든 `src/components/dashboard/briefing/X.tsx`)도 빠지지 않는다는 것을 빠짐 판정 함수로 본다.
    - AC-313.4: 차트·랜딩·전역 규칙 시험은 이 TASK에서 고치지 않는다(끝 조건으로 본다).
  - **고치는 옛 시험 — `ui/classes.test.ts`**
    - 그리기 준비: `ruleBreaks`에 움직임 규칙(design.md '규칙 시험' 짧은 반응)을 더한다. `DASHBOARD_DIRS`·`inDashboard`와 그 주석 → 빠지는 대시보드 파일을 `src/components/dashboard/DashboardEmpty.tsx` 하나로 좁힌다(이름도 그 뜻으로, 예: `OLD_DASHBOARD_FILE`·`isOldDashboard`). `RULE_TARGETS`·`ruleFiles`·`KEPT_UI` 주석의 "대시보드 두 폴더"를 "옛 빈 자리 한 파일"로.
    - 'AC-221.1: ui. 참조와 ui 불러오기는 시험 파일 밖 src/에서 classes.ts와 대시보드 두 폴더에만 있다' → 이름·기대를 "classes.ts와 DashboardEmpty.tsx에만"으로, 이름에 AC-313.3을 더한다.
    - 'AC-221.1: 대시보드 두 폴더 밖의 앱 화면·차트·미리보기는 classes에서 ds만 불러온다' → "DashboardEmpty.tsx 밖의 …"로.
    - 'AC-221.2: AC-204.6 검사 파일은 앱 화면 폴더 전체(+ charts·preview, error.tsx)이고 대시보드 두 폴더만 빠진다' → "… 옛 빈 자리 DashboardEmpty.tsx만 빠진다"로, 이름에 AC-313.3을 더하고 기대 목록에 `src/components/dashboard/todayTitle.ts`·`src/app/(app)/dashboard/page.tsx`를 더한다. 끝의 "AC-013.2는 대시보드 두 폴더도 계속 본다" 주석과 기대는 "DashboardEmpty.tsx도"로.
    - 위 셋 밖의 시험은 그대로 통과해야 한다(`AC-204.6: 규칙이 잘못된 예 …`·`… 맞는 예 …` 목록도 그대로).
  - 끝 조건 더: `src/components/charts/rules.test.ts`·`src/components/landing/rules.test.ts`·`src/app/globals.test.ts`·`src/app/theme.test.ts`·`src/app/fonts.test.ts`·`src/components/dashboard/DashboardEmpty.test.tsx`가 고치지 않은 채 통과한다.

## TASK-3: 차트 부품 — `KpiStat` 빈 값 글자 · `StackedBarChart` 촘촘한 막대
- REQ: REQ-314
- Files: src/components/charts/KpiStat.tsx, src/components/charts/KpiStat.test.tsx, src/components/charts/StackedBarChart.tsx, src/components/charts/StackedBarChart.test.tsx
- Tests: src/components/charts/KpiStat.test.tsx, src/components/charts/StackedBarChart.test.tsx
- TDD: required
  - 갈래 라가 쓰는 옵션이라 묶음 전에 한다(design.md '차트 부품'). 두 파일만 고친다. 주지 않으면 지금 그림과 한 글자도 같다.
  - `KpiStat`: `emptyText?: string`(값 `null`일 때 "–" 아래 글, 기본 "자료 없음").
  - `StackedBarChart`: `dense?: boolean`(막대 위 합계·상태 글자를 그리지 않는다. 화면 읽기 표는 그대로).
  - 새 시험(AC ID 이름): AC-314.1(`emptyText`를 준 빈 값 · 주지 않은 빈 값 "자료 없음" · 값이 있으면 `emptyText`가 보이지 않음), AC-314.2(`dense`면 막대 위 글자 없음 · 표에는 모든 칸의 값·합계·상태 · 빈 `label` 칸은 아래 글자 빈칸 · `dense` 없으면 지금 그림과 같은 마크업).
  - 고치는 옛 시험이 없다.
  - 끝 조건 더(AC-314.3): `src/components/charts/rules.test.ts`·다른 차트 시험·`src/components/preview/**` 시험이 고치지 않은 채 통과하고, `git diff --name-only`의 `src/components/charts/`가 위 네 파일뿐이다.

## TASK-4: 아이콘 둘 — `copy`·`userCheck`
- REQ: REQ-315
- Files: src/components/common/Icon.tsx, src/components/common/Icon.test.tsx
- Tests: src/components/common/Icon.test.tsx
- TDD: required
  - 갈래 가(계정 메뉴)와 라(복사)가 쓰므로 묶음 전에 한다. `ICON_NAMES` 끝에 두 이름, 그림은 design.md '아이콘'(시안 그대로).
  - 새 시험(AC ID 이름): AC-315.1(두 이름의 그림이 `docs/mockups/dashboard-home/index.html`의 [복사]·[가입 승인] svg 안쪽 그림과 같다 · 속성 규칙 · 크기 12·14·16).
  - **고치는 옛 시험 — `Icon.test.tsx`**
    - 그리기 준비: 새 두 이름과 시안에서 읽은 그림(`docs/mockups/dashboard-home/index.html`)을 더한다. 지금 `NAMES`(16개, b2b 시안과 견주는 목록)는 그대로 둔다.
    - 'AC-204.6: 이름은 16개(shield·…·stop)뿐이다' → 이름에 AC-315.1을 더하고 기대를 "16개 + copy·userCheck = 18개"로.
    - 나머지(16개 그림·속성·크기·className·서버에서 그림)는 그대로 통과해야 한다(AC-315.2).
  - 끝 조건 더: `src/components/ui/classes.test.ts`(Icon.tsx가 규칙 검사 목록에 든다)가 고치지 않은 채 통과한다.

## Phase 2 — 병렬 묶음 A (TASK-5 · TASK-6 · TASK-7 · TASK-8 동시에)

## TASK-5: 갈래 가 — 탭 목록 13개 · 탭 줄 · 계정 메뉴 [가입 승인] · 본문 흰 바탕
- REQ: REQ-302, REQ-303, REQ-304
- Files: src/components/shell/menu.ts, src/components/shell/TabBar.tsx, src/components/shell/AccountMenu.tsx, src/components/shell/AppShell.tsx, src/components/shell/shell.test.tsx, src/app/(app)/layout.test.tsx
- Tests: src/components/shell/shell.test.tsx, src/app/(app)/layout.test.tsx
- TDD: required
  - **병렬 묶음 A · 갈래 가.** 위 파일만 고친다.
  - `menu.ts`: design.md '탭 목록'의 타입·표대로 `MENU` 13개(`label`·`path`·`href`). `ADMIN_ITEM`을 지우고 `ADMIN_LINK`(`가입 승인`·`/admin`)를 둔다. `currentMenuLabel`은 `path`·`owns` 중 가장 길게 맞는 것. 설정 `href`가 null이어야 하는 이유(SetupScreen의 [청구·연락])를 주석에 적는다.
  - `TabBar.tsx`: props 없음. 13개 모두 `next/link`(줄의 바로 아래 자식). `NotReadyTab`·툴팁·`tabNotReady`·관리자 구분선을 지운다. 탭 모양에 `transition`만 더하고, 옆 밀기·지금 탭 보이게 옮기기는 그대로.
  - `AccountMenu.tsx`: 관리자면 메뉴 첫 항목 [가입 승인](`userCheck` 16 + 글자, `role="menuitem"`, `/admin`, 같은 `itemClass`, 누르면 닫힘). ↓·↑ 이동(돈다). 열 때 첫 항목에 초점. 반응은 design.md '계정 메뉴'(단추 올림·열림 `canvas`, 항목 누름 1px, 층은 나타날 때만 `starting:` 150ms).
  - `AppShell.tsx`: `<TabBar />`. `isAdmin`은 `AccountMenu`에만 넘긴다. `main`에 `has-[[data-page-surface]]:bg-surface`. 다른 줄은 그대로.
  - 새 시험(AC ID 이름): AC-302.1~302.4(`MENU` 이름·순서·`path` 표·`href`·`currentMenuLabel` 경우들), AC-303.1~303.6(303.3에 `transition` 있음·`animate-` 없음, 303.6은 `data-page-surface` 자식이 있는 본문을 그려 `main` 클래스를 본다), AC-304.1~304.4(304.1 아이콘 svg가 `Icon name="userCheck"`와 같음, 304.4 `starting:opacity-0`·`starting:-translate-y-1`·`transition` 클래스와 닫으면 층이 바로 없어짐), `ADMIN_LINK` 값.
  - **고치는 옛 시험 — `shell.test.tsx`**
    - 그리기 준비: `LABELS`·`READY`·`NOT_READY` 상수를 새 13개로, `ADMIN_ITEM` import를 `ADMIN_LINK`로, `tipOfTab` 도우미 지우기, 모든 `<TabBar isAdmin …/>`를 `<TabBar />`로.
    - menu: 'AC-008.1·AC-006.4: 시안 A 순서에 청구(매출 뒤) — 대시보드·청구만 화면이 있고 나머지는 아직 없다(href null)' → AC-302.1·AC-302.3 시험으로 바꾼다. 'AC-006.4: 지금 탭 — /claim과 /claim/*은 청구, 설치·연결 확인(/claim/setup)은 목업처럼 설정 자리' → 기대는 그대로 두고 이름에 AC-302.4를 더하고 새 주소 경우를 더한다. 'AC-008.2: 관리자 탭은 /admin' → 지운다.
    - TabBar: 'AC-008.1·AC-006.4: nav "메뉴" 안에 시안 A 순서대로, 대시보드·청구만 링크이고 …' → AC-303.1. 'AC-008.1: 아직 없는 화면은 링크가 아니라 누를 수 없는 단추다' → 지운다. 'AC-008.2: 관리자면 설정 뒤 세로 구분선(읽지 않음) 다음에 [관리자] /admin 링크'와 'AC-008.2: 관리자가 아니면 구분선과 [관리자]가 없다' → AC-303.4 하나로. 'AC-006.4·AC-034.1: /claim/setup에서는 목업처럼 [설정] 자리가 지금 탭이다 — …' → AC-303.2([설정]은 `/claim/setup` 링크이고 지금 탭, 툴팁 없음). 'AC-008.1·AC-008.2: /admin에서는 [관리자]가 지금 탭이고 대시보드는 아니다' → AC-303.2(`/admin`에서 지금 탭 없음).
    - TabBar 툴팁 여섯 개 → 지운다: 'AC-008.5: 준비 중 탭은 aria-describedby로 …', 'AC-008.5·AC-218.2: 툴팁은 평소 숨고 …', 'AC-008.5: 툴팁은 Esc로 닫히고 …', 'AC-008.5: 마우스를 툴팁 위로 옮겨도 …', 'AC-008.5·AC-218.2: 툴팁은 탭 띠 아래 페이지 제목을 덮지 않는다 …', 'AC-008.5: 준비 중 탭을 눌러도 주소가 바뀌지 않는다'.
    - 'AC-008.5·AC-218.2: 준비 중 탭은 다른 탭과 같은 크기·글자이고 색만 faint(올림에도 그대로)' → AC-303.3(같은 기본 모양, `faint` 없음, `transition`).
    - 'AC-218.2: 탭 모양 — 44px·좌우 12px·body 500 ink-2 …' → 기대 그대로, 보는 링크만 [관리자]에서 지금 탭이 아닌 [통계]로(그리기 준비).
    - 'AC-218.2: 탭 줄 — nav 첫 자식 줄 하나에 1280 폭·좌우 24px(폰 16px), 첫 탭은 …' → 기대 그대로, 마지막 줄 `tab('통계').parentElement?.parentElement`를 `tab('통계').parentElement`로(이제 [통계]도 링크라 준비 중 탭 덩이가 없다). 감싸개 주석의 "(또는 준비 중 탭 덩이)"를 뺀다.
    - 'AC-218.2: 관리자 구분선은 가운데 16px 세로선, 좌우 8px' → 지운다.
    - 'AC-008.7: 1024px 미만에서는 띠 안에서 옆으로 밀린다(얇은 스크롤바, 줄바꿈 없음), 그 이상은 넘침을 보인다(툴팁)' → 기대 그대로, 이름에서 "(툴팁)"을 뺀다.
    - 'AC-008.7: 처음 그릴 때 지금 탭이 보이게 탭 띠만 옆으로 민다 …'와 'AC-008.7: 탭이 한 줄에 다 들어가면(넘치지 않으면) 아무것도 밀지 않는다' → 기대 그대로(590·0), 지금 탭 경로만 `/admin`에서 `/contacts`로(이제 `/admin`에는 지금 탭이 없어 시험이 아무것도 보지 않게 된다).
    - AppShell: 'AC-008.2: 관리자면 탭 줄에 [관리자]' → AC-303.4·AC-304.1(관리자여도 탭 줄에 없고, 계정 메뉴를 열면 [가입 승인]).
  - **고치는 옛 시험 — `(app)/layout.test.tsx`**: 'AC-008.2: 관리자면 탭 줄에 [관리자], 아니면 없다' → AC-303.4(관리자·아닌 사람 모두 탭 줄에 [관리자] 없음).
  - 목록 밖 옛 시험(탭 크기·지금 탭 밑줄·폭 고정·서랍 없음·계정 메뉴 열고 닫기·[로그아웃]·한국 시각·AppShell 짜임·본문 안쪽 감싸개)은 그대로 통과해야 한다.
  - 끝 조건 더: `src/components/claim/setup/SetupScreen.test.tsx`(설정 [청구·연락] 준비 중)와 `src/components/ui/classes.test.ts`·`src/comments.test.ts`가 고치지 않은 채 통과한다.

## TASK-6: 갈래 나 — 준비 중 화면·기능별 문구·기능 주소 10개
- REQ: REQ-305
- Files: src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/components/common/NotReadyScreen.tsx, src/components/common/NotReadyScreen.test.tsx, src/app/(app)/stats/page.tsx, src/app/(app)/notices/page.tsx, src/app/(app)/patients/page.tsx, src/app/(app)/revenue/page.tsx, src/app/(app)/ai-report/page.tsx, src/app/(app)/forms/page.tsx, src/app/(app)/staff/page.tsx, src/app/(app)/worklog/page.tsx, src/app/(app)/inventory/page.tsx, src/app/(app)/contacts/page.tsx, src/app/(app)/notReadyPages.test.tsx
- Tests: src/components/common/notReadyFeatures.test.ts, src/components/common/NotReadyScreen.test.tsx, src/app/(app)/notReadyPages.test.tsx
- TDD: required
  - **병렬 묶음 A · 갈래 나.** 새 파일만 만든다. 고치는 옛 시험이 없다.
  - `notReadyFeatures.ts`: design.md '준비 중 화면'의 타입과 문구 표.
  - `NotReadyScreen.tsx`: 시안 화면 5와 메모 §3 '준비 중 화면'. 서버 컴포넌트, 자료 읽기 없음. 돌아가기 링크는 `ds.button.secondary` 뒤에 `transition not-disabled:active:translate-y-px`.
  - 페이지 10개: design.md의 한 줄 페이지(`notReadyFeature('<주소>')`).
  - `notReadyFeatures.test.ts`: AC-305.4. `NotReadyScreen.test.tsx`: AC-305.1~305.3(`nestedBoxes`, 소스 검사, `overflow-hidden` 없음, 꾸밈 선 `aria-hidden`, 폭별 클래스). `notReadyPages.test.tsx`: AC-305.5(페이지마다 `renderToStaticMarkup(<Page />)`이 `<NotReadyScreen feature={notReadyFeature(주소)} />`와 같고 h1이 표 이름), AC-305.6(`decideRoute` 네 상태, 파일이 `src/app/(app)/` 아래).
  - 끝 조건 더: `src/components/ui/classes.test.ts`(새 파일이 저절로 규칙 검사에 든다)·`src/app/fonts.test.ts`·`src/app/theme.test.ts`가 고치지 않은 채 통과한다.

## TASK-7: 갈래 다 — 대시보드 브리핑 · 지금 바로 쓸 수 있어요 · 기능 목차
- REQ: REQ-306, REQ-316
- Files: src/components/dashboard/briefing/*, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/briefing/features.test.ts, src/components/dashboard/briefing/dateLine.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/briefing/StickyConnect.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required
  - **병렬 묶음 A · 갈래 다.** `components/dashboard/briefing/` 안 새 파일과 대시보드 페이지만 고친다. `components/shell/*`·`dashboard/summary/*`·`common/notReadyFeatures.ts`·`components/claim/**`를 불러오지 않는다. `DashboardEmpty.tsx`·`DashboardEmpty.test.tsx`·`todayTitle.ts`·`todayTitle.test.ts`는 고치지 않는다.
  - `features.ts`: `DashboardFeature`·`DASHBOARD_FEATURES` 12개(requirements AC-316.3 표 = 메모 §6 그대로).
  - `dateLine.ts`: `dateLine(today)`(design.md '대시보드 짜임').
  - `DashboardHome.tsx`(서버): design.md '대시보드 짜임'의 props·차례·폭별 칸·섹션 나눔·반응. 연결 전(`report` null) 모양과 연결 뒤(`report` 있음) 모양. 안쪽 부품은 이 폴더 안 파일로 나눠도 된다.
  - `StickyConnect.tsx`(`'use client'`): 폰 아래 단추(IntersectionObserver, 없으면 숨김).
  - `dashboard/page.tsx`: `<DashboardHome today={todayInKorea()} report={null} />`. `force-dynamic` 줄은 그대로. 분석·보고 문장은 끼우지 않는다(TASK-9 몫).
  - 새 시험(AC ID 이름, jsdom은 `// @vitest-environment jsdom`):
    - `dateLine.test.ts`: AC-306.1(보통 날 · 달 마지막 날 · 2월 28일/29일 · 연말).
    - `features.test.ts`: AC-316.3(12개 이름·설명·주소·상태, 설명에 줄바꿈·숫자 없음, 사용 가능 둘).
    - `DashboardHome.test.tsx`: AC-306.1~306.3·306.5~306.8, AC-316.1·316.2·316.4(연결 전과 연결 뒤를 둘 다 그린다. 연결 뒤 `report`·`analysis`는 시험 안 가짜 노드로 자리만 본다. h1 수, 링크 주소, 문구 그대로, 폭별 클래스, `data-page-surface`, 반응 클래스, `nestedBoxes`, 소스 import 검사, 숫자 글자 허용 목록).
    - `StickyConnect.test.tsx`: AC-306.4(가짜 IntersectionObserver로 밖 → 보임 · 안 → 숨김, 숨김의 `aria-hidden`·`invisible`·`tabIndex=-1`, IntersectionObserver 없음 → 숨김, 언마운트 때 `disconnect`, `md:hidden`·`duration-200`).
  - **고치는 옛 시험 — `(app)/dashboard/page.test.tsx`**
    - 그리기 준비: `DashboardEmpty` import를 `DashboardHome`(`@/components/dashboard/briefing/DashboardHome`)으로, `h1Text` 도우미를 날짜 줄 글자를 읽는 도우미로.
    - 'AC-009.1: 제목은 "오늘" + 지금의 한국 날짜 — "오늘 2026년 10월 29일 (목)"' → AC-306.1(날짜 줄 "10월 29일 목요일", 2027-01-01 → "1월 1일 금요일").
    - 'AC-009.1: 한국 자정 경계 — 서버 시간대가 UTC여도 한국 날짜(todayInKorea)다' → 기대를 날짜 줄 글자로("10월 29일 목요일" / "10월 28일 수요일"), 이름을 AC-306.1로.
    - 'AC-009.1: 날짜는 요청 때 계산한다 — 빌드 때 그린 날짜로 굳지 않는다(force-dynamic)' → 기대 그대로, 이름을 AC-306.1로.
    - 'AC-009.2: 화면은 빈 자리(제목 + 안내 상자 하나) 그대로다 — 다른 칸을 더하지 않는다' → AC-306.2(화면 = `<DashboardHome today="2026-10-29" report={null} />`).
    - 'AC-009.2: 앱 틀을 한 번 더 그리지 않는다 — …'와 'AC-009.2: 숫자·자료를 읽지 않는다 — …' → 기대 그대로, 이름의 AC-009.2를 AC-306.8로 바꾼다.
  - 끝 조건 더: `src/components/ui/classes.test.ts`(새 파일이 저절로 규칙 검사에 든다)·`src/app/fonts.test.ts`·`src/app/theme.test.ts`·`DashboardEmpty.test.tsx`·`todayTitle.test.ts`가 고치지 않은 채 통과한다.

## TASK-8: 갈래 라 — 오늘 하루 분석 · 기간별 흐름 · 원장님 보고 문장 · 자료 읽는 자리
- REQ: REQ-311, REQ-312, REQ-317
- Files: src/components/dashboard/summary/*
- Tests: src/components/dashboard/summary/source.test.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/ReportBlock.test.tsx
- TDD: required
  - **병렬 묶음 A · 갈래 라.** `summary/` 폴더 안 새 파일만 만든다. 고치는 옛 시험이 없다. `components/shell/*`·`dashboard/briefing/*`·`common/notReadyFeatures.ts`를 불러오지 않는다.
  - `source.ts`: `SummarySource`·`dashboardSummarySource()`(지금은 늘 `{ kind: 'none' }`)·`isConnected()`. `DayPayload`는 `@/types/payload`에서 불러오기만 한다.
  - `view.ts`: design.md '오늘 하루 분석 · 기간별 흐름 · 보고 문장'의 순수 함수. 날짜는 `@/lib/analytics/dates`, 증감은 `compareNumbers`(`@/lib/analytics/compare`), 숫자 글자는 `@/components/charts/format`.
  - `DashboardAnalysis.tsx`·`ReportBlock.tsx`: `'use client'`. 차트 부품(`KpiStat`·`StackedBarChart`·`RankedBars`·`ChartLegend`)을 고치지 않고 부른다. 차트 부품을 더 고쳐야 할 것 같으면 멈추고 보고한다.
  - 시험(가짜 `DayPayload`는 시험 파일 안에서만: 오늘 덜 끝남/끝남/없음, 7일 전 있음/없음/덜 끝남, 빠진 날, 재방문 `null`, 처방 이름이 바뀐 코드, 90일 넘는 날):
    - `source.test.ts`: AC-312.1~312.3(늘 none, `isConnected`의 none·빈 `days`·`days` 있음, 소스 import·`schemaVersion:` 검사).
    - `view.test.ts`: AC-311.2(오늘 숫자·넷째 칸 세 경우·요일 이름), AC-311.3·311.4(`periodRange` 7·30·90 글자, 끝 날짜 어제, `tickLabels` 7·30·90의 날짜), AC-311.5·311.6(칸·`label` 고르기·`partial`·재방문 셈·평균 버림·처방 합과 이름·빠진 날 0 없음), AC-317.1(`reportSentence` 덜 끝남·끝남·비교 많음/적음/같음·첫 문장 나누기·이름 없음).
    - `DashboardAnalysis.test.tsx`(jsdom): AC-311.1·311.2·311.3(단추 누르기·기간 글자·그래프 다시 그림·숫자 줄 그대로·연결 전에도 눌림)·311.4·311.5(부품 props)·311.7(폭별 클래스)·311.8(소스 검사·`nestedBoxes`·`overflow-hidden` 없음·반응 클래스), 연결 전 날짜 눈금(기간마다 바뀜), 연결 전 화면 글자에서 고정 글자(날짜 눈금 포함)를 빼면 숫자 없음.
    - `ReportBlock.test.tsx`(jsdom): AC-317.1~317.4(`navigator.clipboard` 가짜 성공·실패·없음, 2초 뒤 되돌림은 가짜 시계, 막힘 단추·툴팁, 최소 폭).
  - 끝 조건 더: `src/components/charts/**` 시험·`src/components/ui/classes.test.ts`(이 폴더 파일이 저절로 규칙 검사에 든다)·`src/app/fonts.test.ts`·`src/app/theme.test.ts`·`src/guardrails.test.ts`가 고치지 않은 채 통과하고, `git diff --name-only`에 `src/components/charts/`가 없다.

## Phase 3 — 합친 뒤 (차례로)

## TASK-9: 통합 — 대시보드 조립, 탭·목차·화면 맞춤, 첫 화면 시험, UI_GUIDE
- REQ: REQ-301, REQ-307, REQ-308
- Files: src/app/(app)/tabFrame.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx, docs/UI_GUIDE.md, docs/ARCHITECTURE.md, src/components/shell/menu.ts, src/components/dashboard/briefing/features.ts, src/components/common/notReadyFeatures.ts, src/app/(app)/stats/page.tsx, src/app/(app)/notices/page.tsx, src/app/(app)/patients/page.tsx, src/app/(app)/revenue/page.tsx, src/app/(app)/ai-report/page.tsx, src/app/(app)/forms/page.tsx, src/app/(app)/staff/page.tsx, src/app/(app)/worklog/page.tsx, src/app/(app)/inventory/page.tsx, src/app/(app)/contacts/page.tsx
- Tests: src/app/(app)/tabFrame.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required
  - 갈래 가·나·다·라를 `feat-tab-frame`에 합치고 `verify`가 통과한 뒤에 한다.
  - **조립(AC-307.5·307.6)**: `dashboard/page.tsx`를 design.md '대시보드 페이지 조립'대로 바꾼다(`isConnected` → `ReportBlock`, `DashboardAnalysis`). 시험이 먼저다: `page.test.tsx`에 AC-307.5(지금 자리: 차례 · h1 하나 · 연결 전 빈 상태 · 고정 글자 밖 숫자 없음)와 AC-307.6(`vi.mock`으로 `dashboardSummarySource`만 가짜 자료: 연결 뒤 차례 · 보고 문장 h1 · 사전점검 두 링크 · 연결 전 부품 없음 · 가짜 숫자)을 더해 RED를 본다.
    - 고치는 옛 시험 — `page.test.tsx`: TASK-7이 쓴 'AC-306.2: …(화면 = `<DashboardHome today=… report={null} />`)' 같음 시험 → 기대를 `<DashboardHome today=… report={null} analysis={<DashboardAnalysis today=… source={{ kind: 'none' }} />} />`로. 나머지는 그대로.
  - `tabFrame.test.tsx`(새 파일, 합친 코드를 가로질러 본다):
    - AC-301.1: 콜백 `GET`(Supabase는 `route.test.ts`처럼 가짜로) → `/dashboard`, `next`·`redirect`·`returnTo`를 줘도 `/dashboard`.
    - AC-301.2: `decideRoute` 승인(관리자 포함)의 `/login`·`/signup`·`/pending` → `/dashboard`, `hospital: 'unknown'`의 `/login` → `/dashboard`.
    - AC-301.3: 승인된 사람의 `/dashboard` → `null`. `dashboard/page.tsx`와 `components/dashboard/**`(시험 밖) 소스에 보내기 코드가 없다.
    - AC-307.1: `DASHBOARD_FEATURES`의 이름·순서 = `MENU`에서 대시보드를 뺀 이름, 칸 `href` = 같은 이름 탭의 `path`.
    - AC-307.2: `MENU`의 `path`마다 `src/app/(app)<path>/page.tsx`가 있다.
    - AC-307.3: `ready: false` 칸의 페이지는 같은 이름의 `notReadyFeature`로 그린 `NotReadyScreen`과 같고, `ready: true` 칸(`/claim`·`/claim/setup`)의 페이지 소스는 `NotReadyScreen`을 불러오지 않는다.
    - AC-307.4: `NOT_READY_FEATURES` · `ready: false` 칸 · `MENU`의 `href: null`(설정 제외) 탭의 이름·주소·순서가 같다.
    - AC-307.7: 브리핑 연결 순서 이름 다섯 = `setupSteps(…)`(`components/claim/setup/steps.ts`)가 주는 `title` 다섯(순서 그대로). 기능 수 글 둘의 숫자 = `DASHBOARD_FEATURES.length`(12)·`ready` 수(2).
    - AC-307.8: `AppShell`에 대시보드 페이지를 그리면 본문 안에 `data-page-surface`가 있고 `main`에 `has-[[data-page-surface]]:bg-surface`가 있다. 준비 중 페이지를 그리면 `data-page-surface`가 없다.
    - AC-308.3: `/admin`은 관리자가 아니면 `/dashboard`, 관리자면 `null`. `admin/page.tsx` 소스가 `guardPage('/admin')`을 부른다.
  - 맞춤 시험이 처음부터 통과하면(갈래가 맞게 만듦) 그 부분은 구현 파일을 고치지 않는다. 어긋나면 `--expect red`를 기록한 뒤 위 Files 안에서 자료(이름·주소·순서·`ready`·문구)만 맞춘다. 그보다 큰 고침(브리핑·분석 화면 파일)이 필요하면 멈추고 보고한다.
  - `docs/UI_GUIDE.md` '앱 틀'·'대시보드'·'빈 상태'와 관련 줄을 이 명세대로 고친다(맨 위 기준 줄에 "탭·대시보드·준비 중 화면은 tab-frame이 대체, 기준 시안 `docs/mockups/dashboard-home/`" 한 줄).
    - 탭 순서 13개와 주소, 지금 탭 판단(`/claim/setup` → 설정). 탭 상태 표에서 '준비 중'·'지금 화면이 속한 준비 중 탭' 줄을 빼고 "모든 탭은 링크, 준비 중 탭도 기본 모양"을 적는다. 관리자 탭·구분선 줄을 빼고 계정 메뉴 [가입 승인](관리자만, `userCheck`, ↓↑)을 적는다.
    - '대시보드': 1안 오늘 브리핑의 짜임(브리핑 · 지금 바로 쓸 수 있어요 · 오늘 하루 분석 · 기간별 흐름 · 기능 목차, 연결 전/연결 뒤, 본문 흰 바탕), 값은 `docs/mockups/dashboard-home/notes.md`를 가리킨다.
    - '빈 상태': 준비 중 화면(h1 이름·패널 하나·칩·문구·만들 것·[대시보드로 돌아가기])과 꾸밈 예외(준비 중 화면의 글자 없는 1px 선, 대시보드 빈 그래프 틀, `aria-hidden`), 대시보드 빈 상태 문구는 메모 §4.
    - 토큰 표 `faint`의 '준비 중 탭' 쓰임과 대비 절의 준비 중 탭 예외 문장을 빼고 기능 목차 "준비 중" 상태 글자 쓰임을 적는다(design.md '준비 중 탭도 보통 탭 모양'). '막힘' 줄의 대시보드·준비 중 탭 문장과 '패널' 절의 "대시보드에서 아직 쓰지 않는다" 문장을 고친다. `overflow-hidden` 대신 `overflow-clip`을 쓰는 까닭을 한 줄 적는다. '아이콘·로고'의 16개를 18개(`copy`·`userCheck`)로.
  - `docs/ARCHITECTURE.md`: `app/(app)/<기능 주소>/page.tsx`는 준비 중 화면(`components/common/NotReadyScreen` + `notReadyFeatures`)이고 기능 명세가 진짜 화면으로 바꿀 때 `menu.ts`·`dashboard/briefing/features.ts`·`notReadyFeatures.ts`를 같이 고친다는 한 줄. `components/dashboard/briefing/`(브리핑·목차)과 `components/dashboard/summary/`(분석·보고 문장, 자료 읽는 자리는 `source.ts` 하나, 지금은 자료 없음)를 한 줄씩.

## TASK-10: 세 폭 화면 확인 · 전체 검사 · 초안 검토 요청
- REQ: REQ-309, REQ-308
- Files: src/components/shell/TabBar.tsx, src/components/shell/AccountMenu.tsx, src/components/shell/AppShell.tsx, src/components/common/NotReadyScreen.tsx, src/components/dashboard/briefing/*.tsx, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/ReportBlock.tsx
- TDD: exempt — 화면 측정과 마무리 검사 작업이라 먼저 쓸 실패 시험이 없다. 새 로직 없이 클래스 값만 맞춘다.
  - **서버.** 저장소를 scratchpad로 `git archive`해 `next dev -H 127.0.0.1`로 띄운다. Supabase는 가짜(`docs/mockups/b2b-redesign/tools/stub.mjs`), 열쇠는 가짜 값, 세션 쿠키는 `tools/shoot.mjs`처럼 시험 스크립트가 넣는다(관리자·아닌 사람 둘). 앱 코드에 시험용 길을 만들지 않는다.
  - **찍기.** `@playwright/test` 크로미움, 모션 줄이기, `trace` 끔. `/dashboard`(위와 아래로 내린 상태)·`/contacts`·`/stats`·`/claim/setup`·`/admin`(계정 메뉴 연 상태 포함)을 390×844·768×1024·1440×900에서 찍고 시안 화면 1·2·4·5와 나란히 둔다.
  - **측정(AC-309.1).** 가로 넘침, 1440 탭 줄 `scrollWidth`·`clientWidth`, 기능 목차 열 수(같은 `offsetTop`인 칸 개수), 숫자 칸 값 "–"과 그래프 막대·세로 눈금 숫자 없음(날짜 눈금은 AC-311.4대로 있음), h1 수, 본문 바탕색(`getComputedStyle(main).backgroundColor`가 `/dashboard`에서 `surface`, `/contacts`에서 `canvas`), 390 폰 아래 단추(맨 위 숨김 · 내린 뒤 보임), 지금 탭(`aria-current`). 1024×768에서도 탭 줄 넘침을 한 번 잰다(design.md 위험).
  - **고치기(AC-309.2).** 어긋난 곳은 위 Files 안에서 클래스만 고치고 `verify`를 다시 돌린다. 시험 기대를 바꿔야 하는 고침이면 멈추고 보고한다.
  - **클래스 밖 결함.** 화면 확인이나 리뷰(`harness-reviewer`·`cr-review`)에서 클래스만으로 못 고치는 동작·계산 결함(예: `summary/view.ts`·`briefing/*.ts`의 셈, 시험 기대가 틀림)이 나오면 이 TASK에서 고치지 않는다. 멈추고 보고해, 그 파일과 시험을 Files로 가진 고침 TASK를 명세에 더한 뒤(명세 고침 → 다시 승인) TDD로 고친다.
  - **범위 확인(AC-308.1·AC-308.2).** `git diff --name-only 7754001 -- supabase src/lib src/app/api src/app/auth src/middleware.ts src/types src/workers e2e extension helper 'src/app/(app)/layout.tsx' 'src/app/(app)/admin' 'src/app/(app)/claim' src/components/claim src/components/admin src/components/auth src/components/preview src/components/landing src/components/dashboard/DashboardEmpty.tsx src/components/dashboard/DashboardEmpty.test.tsx src/components/dashboard/todayTitle.ts src/components/dashboard/todayTitle.test.ts src/components/ui/classes.ts src/app/globals.css src/app/globals.test.ts src/app/theme.test.ts package.json package-lock.json eslint.config.mjs next.config.ts vercel.json`이 비어 있고, `git diff --name-only 7754001 -- src/components/charts`가 TASK-3의 네 파일뿐이며, AC-308.2의 시험 파일 목록도 `git diff --name-only 7754001`에 없다.
  - **정리(AC-309.3).** 서버·가짜 Supabase·브라우저를 멈추고 `ss -ltnp`로 본다. 사진·스크립트는 scratchpad에만 둔다.
  - **전체 검사와 검토(AC-308.4).** 차례로: `python3 ~/.claude/harness/bin/verify`(전체 `npm test`·lint 경고 0·build) → `harness-reviewer`로 `feat-tab-frame` 전체 바뀐 곳 리뷰(PASS까지 고치고 다시) → 커밋 → `python3 ~/.claude/harness/bin/cr-review --base main`(백그라운드, 종료 코드 0이어야 함. 2면 고친 뒤 verify → 리뷰 → 커밋 → 다시) → `git push -u origin feat-tab-frame` → `gh pr create --draft --base main`(본문: 무엇이 바뀌었나·사진·남은 질문, 끝에 저장소 규칙의 표시 줄).
  - **끝 조건.** 세 폭 사진과 초안 검토 요청 주소를 총괄에게 보인다. **합치기는 총괄이 말한 뒤에만** 한다(초안 해제·합치기·운영 사이트 올리기는 하지 않는다).
