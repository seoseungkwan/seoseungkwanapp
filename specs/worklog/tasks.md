# 작업 분할: 업무일지

> 형식: `## TASK-n: 제목` 아래에 `- Step:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다. TASK 번호 = REQ 번호 = Phase·Step 순서다.
> Phase 다섯: `worklog-1-data`(TASK-1~5) → `worklog-2-screen`(TASK-6~10) → `worklog-3-finish`(TASK-11~13) → `worklog-4-bitfill`(TASK-14~17, 비트에서 채우기) → `worklog-5-bitcheck`(TASK-18~19, 실제 Supabase·의원 PC 확인). Phase 4는 매출 갈래의 `revenue.days`가 main에 들어온 뒤에만 시작한다(기다림 조건은 TASK-14·17 같은 글자). **Phase 4는 사용자가 `20261101000110_worklog_bit_fields.sql`을 실제 Supabase에 붙여 넣기 전에는 main에 합치거나 배포하지 않는다**(TASK-16 뒤 읽기·쓰기가 모두 `bit_fields`를 쓴다). 붙여 넣은 뒤 TASK-18로 실제 Supabase를 확인한다 — **TASK-18 통과 전에는 4단계를 합치거나 배포하지 않는다**. 그 뒤 사용자 지시로 배포한 뒤 TASK-19로 의원 PC에서 칸을 견준다.
> 화면 TASK(8·9·10·11·12)는 승인된 시안 `docs/mockups/worklog/index.html`과 design.md '목업과 다른 점'을 따른다.
> **실제 Supabase에 migration을 붙여 넣는 일은 사용자 OK가 필요하다**(TASK-4는 파일과 PGlite 시험만). TASK-13(E2E)은 그 뒤에만 돈다.
> **2026-11-01 명세 변경(사용자 grill 결정, requirements.md 배경)**: 이미 만든 것을 고쳐 다시 만든다. TASK-2(커밋 16ef2ce)·TASK-4(커밋 c5c4c12)는 **기존 파일을 고친다. 시험을 먼저 바꿔 RED를 확인한다**. migration은 실제 Supabase에 아직 안 붙였으므로 같은 파일을 고친다(새 migration을 더하지 않는다). TASK-1·3·5는 커밋 안 된 작업이 작업 폴더에 있다(옛 결정을 담았으니 고치거나 지운다, 되돌리는 git 명령은 쓰지 않는다). 순서: TASK-1 → 2 → 3 → 4 → 5.
> **화면 시안 승인됨**: TASK-8의 글자 칸·항목 이름 고치기·"합계에서 빠졌어요"·빨간 막힌 칸 시안 `docs/mockups/worklog/text-cells.html`을 사용자가 2026-11-01 승인했다(design.md 3절). 글씨는 원본과 똑같이

## TASK-1: 결정과 규칙 문서
- Step: Phase 1 · Step 0 · `docs`
- AC: AC-001.1~AC-001.3
- REQ: REQ-001
- Files: docs/ADR.md, docs/ARCHITECTURE.md, docs/UI_GUIDE.md, plan.md
- Tests: 없음(문서)
- TDD: exempt — 문서만 고친다. **작업 폴더의 커밋 안 된 문서 변경은 옛 결정(업무사항 이 PC 저장)을 담고 있으니 고친다.** ADR 끝에 업무일지 ADR 하나(번호 = 그때 마지막 번호 + 1, design.md 18절): 결정 다섯(업무사항 서버 저장과 남는 위험, CLAUDE.md CRITICAL '서버·Claude API에는 집계 숫자만 간다'의 업무일지 예외 · 자동 저장 · 양식 칸 엑셀 서식 예외 · 숫자 칸 글자 저장 · 바뀐 칸만 저장)과 이유·트레이드오프. ARCHITECTURE는 디렉토리 줄 셋, DB 표 `daily_reports` 줄을 `worklog_days`로, 데이터 흐름 [업무일지] 한 줄. 상태 관리 예외 줄은 지운다. UI_GUIDE는 '업무일지 양식(엑셀 예외)' 절(design.md 11-1·12·13절 요약, 휴대폰은 업무사항도 보임)과 '하지 마라' 표 세 줄(두 번째 글꼴·700 굵기·토큰 밖 색)에 꼬리표, '상자 안 상자' 예외 한 줄(종이 안 엑셀 칸 선). plan.md는 §5 폴더 핸들 줄의 옛 꼬리표를 지우고, 금액 줄에 "(예외: 업무일지 숫자 칸은 친 글자를 저장한다. 합계는 원 단위 정수, 사용자 결정 2026-11-01 · ADR-0NN)" 꼬리표 한 줄만. 다른 문장은 바꾸지 않는다. CLAUDE.md 자체는 고치지 않는다

## TASK-2: 합계·칸 글자·날짜 규칙
- Step: Phase 1 · Step 1 · `calc-format`
- AC: AC-002.1~AC-002.4, AC-002.6~AC-002.10
- REQ: REQ-002
- Files: src/types/worklog.ts, src/lib/worklog/calc.ts, src/lib/worklog/calc.test.ts, src/lib/worklog/days.ts, src/lib/worklog/days.test.ts, src/lib/worklog/notes.ts, src/lib/worklog/notes.test.ts
- Tests: src/lib/worklog/calc.test.ts, src/lib/worklog/days.test.ts, src/lib/worklog/notes.test.ts
- TDD: required — **이미 커밋됨(16ef2ce): 기존 파일을 고친다. 시험을 먼저 바꿔 RED를 확인한다.** 순수 함수만(design.md 5·6절). 칸은 모두 글자가 되고(`WorklogDay`), 항목 이름 12칸·`memo`가 더해진다. `calc`는 읽은 숫자(`WorklogNumbers`)로 합계만 내고 `parseCount`·`parseWon`은 지운다(읽기는 TASK-3). `notes`는 막는 모양을 넓힌다. 엑셀 10월 숫자 같은 실제 값 대신 둥근 가짜 숫자를 쓴다. 날짜는 `lib/analytics/dates.ts`만 쓴다

## TASK-3: 칸 글자 읽기
- Step: Phase 1 · Step 2 · `cell-text`
- AC: AC-003.6~AC-003.15
- REQ: REQ-003
- Files: src/lib/worklog/cellText.ts, src/lib/worklog/cellText.test.ts, src/lib/worklog/memoStore.ts, src/lib/worklog/memoStore.test.ts
- Tests: src/lib/worklog/cellText.test.ts
- TDD: required — 새 파일 `cellText.ts`(design.md 7절): 글자 → 숫자·없음·합계 제외, 화면 글자, 저장할 글자. `memoStore.ts`·`memoStore.test.ts`(커밋 안 된 옛 작업)는 **지운다**(업무사항은 서버로 간다). TASK-2의 옛 숫자 읽기 시험 뜻은 여기로 옮긴다. '12,000 별도'·'2건 12,000'·'별도 보고' 표를 시험으로 둔다

## TASK-4: 서버 표 `worklog_days`
- Step: Phase 1 · Step 3 · `db-table`
- AC: AC-004.1~AC-004.9
- REQ: REQ-004
- Files: supabase/migrations/20261101000100_worklog.sql, supabase/worklog.rls.test.ts
- Tests: supabase/worklog.rls.test.ts
- TDD: required — **이미 커밋됨(c5c4c12): 같은 파일을 고친다(실제 Supabase에 아직 안 붙였다). 시험을 먼저 바꿔 RED를 확인한다.** 숫자 칸 14개를 글자 칸으로, `memo`·항목 이름 12칸을 더한다(design.md 8절). 바뀐 칸만 보낸 upsert가 다른 칸을 남기는지 시험한다(AC-004.9). PGlite에 `supabase/rls.test.ts`와 같은 Supabase 흉내 → auth migration → 이 migration. 공용 함수 `my_hospital_id()`는 cross-branch C1 글자 그대로(`create or replace`)이고, 이미 있을 때도 도는지 시험한다(AC-004.8). 저장 시각 칸·방아쇠는 뺀다(사용자 결정 5). 기존 auth migration과 `supabase/rls.test.ts`는 고치지 않는다. **실제 Supabase에 붙여 넣지 않는다**(사용자 OK 필요, Phase 2 끝에 안내)

## TASK-5: 하루 읽기·저장
- Step: Phase 1 · Step 4 · `day-storage`
- AC: AC-005.1~AC-005.5
- REQ: REQ-005
- Files: src/lib/storage/worklogDays.ts, src/lib/storage/worklogDays.test.ts
- Tests: src/lib/storage/worklogDays.test.ts
- TDD: required — **작업 폴더에 커밋 안 된 옛 파일이 있다: 고친다. 시험을 먼저 바꿔 RED를 확인한다.** 가짜 Supabase 클라이언트(`from().select().eq('work_date').maybeSingle()`·`from().upsert()` 흉내). 저장은 바뀐 칸만 받는다: 보내는 칸 = `work_date` + 받은 칸(막힌 칸 뺌), 바뀐 칸이 없으면 네트워크 없음. `hospital_id`는 보내지도 거르지도 않는다(DB 기본값·RLS)로 시험한다(design.md 9절). 실제 Supabase에 붙지 않는다

## TASK-6: 자동 저장 제어
- Step: Phase 2 · Step 0 · `autosave`
- AC: AC-006.1~AC-006.13
- REQ: REQ-006
- Files: src/lib/worklog/autosave.ts, src/lib/worklog/autosave.test.ts
- Tests: src/lib/worklog/autosave.test.ts
- TDD: required — `vi.useFakeTimers()`와 가짜 `save`로 시험한다(design.md 10절). 서버에 있다고 아는 값과 최신 값을 비교해 차이만 보낸다: 되돌려 같아진 칸은 안 보냄, 저장 중 또 바뀌면 남은 차이만, 재시도도 차이만, 막힌 칸만 빼고 저장 + `blocked`. `serverDay`로 다시 읽은 값을 합친다. React·supabase를 쓰지 않는다

## TASK-7: 엑셀 서식 예외 규칙
- Step: Phase 2 · Step 1 · `sheet-style`
- AC: AC-007.1~AC-007.4
- REQ: REQ-007
- Files: src/app/globals.css, src/app/theme.test.ts, src/app/fonts.test.ts, src/components/ui/classes.test.ts, src/components/worklog/sheet.module.css, src/components/worklog/sheet.style.test.ts
- Tests: src/app/theme.test.ts, src/app/fonts.test.ts, src/components/ui/classes.test.ts, src/components/worklog/sheet.style.test.ts
- TDD: required — 먼저 규칙 시험에 예외 한 파일·토큰 넷을 기대하는 시험을 더해 RED를 본다(아직 토큰·파일이 없다). 그다음 `:root` 토큰 넷과 `sheet.module.css`(시안의 `.paper`·`.sheet` 화면 규칙 그대로, 인쇄 부분은 TASK-11, 막힌 칸·합계 제외 표시 클래스는 TASK-8)를 만든다. `sheet.style.test.ts`는 빨강 둘(`--negative`·`--negative-soft`)도 허용 색으로 둔다. 기존 규칙 시험의 다른 기대값은 바꾸지 않는다(design.md 12절)

## TASK-8: 엑셀 양식 칸
- Step: Phase 2 · Step 2 · `sheet`
- AC: AC-008.1~AC-008.11
- REQ: REQ-008
- Files: src/components/worklog/WorklogSheet.tsx, src/components/worklog/WorklogSheet.test.tsx, src/components/worklog/sheet.module.css, docs/mockups/worklog/text-cells.html
- Tests: src/components/worklog/WorklogSheet.test.tsx
- TDD: required — 시안 승인됨(design.md 3절, `docs/mockups/worklog/text-cells.html`). 글씨는 원본과 똑같이. jsdom + Testing Library. 그리기만 하고 값은 props로 받는다(design.md 11-1절). 합친 칸 46개는 design.md 2절 표와 시험이 견준다

## TASK-9: 날짜 줄·저장 상태
- Step: Phase 2 · Step 3 · `toolbar`
- AC: AC-009.1~AC-009.4
- REQ: REQ-009
- Files: src/components/worklog/WorklogToolbar.tsx, src/components/worklog/WorklogToolbar.test.tsx, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/components/worklog/WorklogToolbar.test.tsx, src/lib/errors.test.ts
- TDD: required — 오류 번호 셋은 `lib/errors.ts`·`types/errors.ts` 끝에 더하기만 한다(사전점검 갈래와 겹침, design.md 18절). 문구는 design.md 11-2절 표 그대로. 상태 글·막힌 칸 날짜 글자는 양식 밖 일반 규칙(`ds`·토큰)이다

## TASK-10: 업무일지 화면
- Step: Phase 2 · Step 4 · `screen`
- AC: AC-010.1~AC-010.17
- REQ: REQ-010
- Files: src/components/worklog/WorklogToolbar.tsx, src/components/worklog/WorklogToolbar.test.tsx, src/components/worklog/WorklogScreen.tsx, src/components/worklog/WorklogScreen.test.tsx, src/components/worklog/useWorklogDay.ts, src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/worklogSession.ts, src/components/worklog/worklogSession.test.ts
- Tests: src/components/worklog/WorklogToolbar.test.tsx, src/components/worklog/WorklogScreen.test.tsx, src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/worklogSession.test.ts
- TDD: required — `lib/storage/worklogDays`·`lib/supabase/browser`는 `vi.mock`, 시간은 가짜 타이머, `matchMedia`(터치 기기 `(hover: none) and (pointer: coarse)`)는 시험이 만든다(design.md 11-3절). 자동 저장 제어는 화면 밖 `worklogSession.ts`에 한 벌 — 화면이 내려가면 `flush()`만 하고 저장은 이어진다("앱 안 이동 = 바로 저장" 시험). 다시 읽기(돌아올 때·다시 보일 때·60초)와 저장 안 된 칸·초점 칸 빼고 반영, 실패는 조용히 넘김을 시험한다. 로그아웃(`SIGNED_OUT`)이면 떠나기 확인을 떼고 화면 값을 지운다. 페이지에는 아직 붙이지 않는다(TASK-12). 캡처용 임시 페이지를 만들지 않는다 — Phase 2 끝 화면 확인은 시험 그림(그린 마크업)으로 하고, 실제 화면 캡처는 TASK-12 뒤에 한다

## TASK-11: 인쇄
- Step: Phase 3 · Step 0 · `print`
- AC: AC-011.1~AC-011.3
- REQ: REQ-011
- Files: src/components/worklog/sheet.module.css, src/components/worklog/sheet.print.test.ts, src/components/worklog/WorklogToolbar.tsx, src/components/worklog/WorklogToolbar.test.tsx, src/components/shell/AppShell.tsx, src/components/shell/shell.test.tsx, src/app/globals.css
- Tests: src/components/worklog/sheet.print.test.ts, src/components/worklog/WorklogToolbar.test.tsx, src/components/shell/shell.test.tsx
- TDD: required — 인쇄 CSS 글자와 줄 높이 합을 시험이 읽어 본다(design.md 13절). `.flag`·`.blocked` 인쇄 규칙도 본다. `globals.css`는 Next가 CSS Module 안 `@page`를 거부할 때만 `@page` 한 블록을 더한다. AppShell은 `print:` 클래스 세 곳만 더한다

## TASK-12: 탭 연결
- Step: Phase 3 · Step 1 · `tab-hookup`
- AC: AC-012.1~AC-012.5
- REQ: REQ-012
- Files: src/app/(app)/worklog/page.tsx, src/app/(app)/worklog/page.test.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/components/dashboard/briefing/FeatureIndex.tsx, docs/ARCHITECTURE.md, docs/UI_GUIDE.md, phases/worklog-2-screen/index.json, phases/worklog-3-finish/index.json
- Tests: src/app/(app)/worklog/page.test.tsx, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.test.ts, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required — tab-frame design.md '다음 명세가 탭을 채울 때' 그대로 네 곳을 같은 TASK에서 바꾼다(design.md 14절). 대시보드 기능 목차의 개수(`FeatureIndex.tsx`가 목록에서 셈)는 코드 그대로이고, `DashboardHome.test.tsx`와 `dashboard/page.test.tsx`의 손 숫자(`INDEX_SIDE`·준비 중·사용 가능 개수)를 목록에서 세는 기대로 바꾼다(AC-012.5, C5). 같은 TASK에서 문서의 '(예정)'·'화면이 아직 없는 10개'·예시 숫자와 `FeatureIndex.tsx` 주석을 바꾸고, `phases/worklog-2-screen`·`phases/worklog-3-finish`의 `index.json`에 끝난 단계를 적는다(design.md 14절). 실제 DB에 표가 들어가기 전이라 표·흐름 줄의 '(예정)'은 TASK-13까지 둔다. '지금 바로 쓸 수 있어요'(`ReadyNow.tsx`)는 그대로. 끝나면 dev-browser로 `/worklog` 1440·390 캡처(실제 Supabase에 표가 없으면 불러오기 실패 카드가 보이는 것이 맞다)

## TASK-13: 실제 Supabase 확인 E2E
- Step: Phase 3 · Step 2 · `e2e`
- AC: AC-013.1~AC-013.5
- REQ: REQ-013
- Files: e2e/worklog.spec.ts, docs/ARCHITECTURE.md
- Tests: e2e/worklog.spec.ts
- TDD: exempt — **사용자 결정(2026-11-01): 시험 계정 값을 넣는 자동 시험은 미루고, 사이트에 올린 뒤 사용자가 손으로 확인한다.** 표는 실제 저장소에 들어갔다(같은 날 사용자가 Success 확인). `e2e/worklog.spec.ts`는 시험 계정 값이 들어올 때 쓰고, 그 전에는 만들지 않는다. 지금 할 일은 `docs/ARCHITECTURE.md`의 '(예정)' 두 곳 빼기와 아래 손 확인 목록을 검토 요청 글에 적기다. 손 확인: 병원 계정으로 지난 날짜 2020-01-02에 가짜 값만 적는다. ① 숫자·'가상 200,000 별도'·'2건 30,000'과 항목 이름·비고·업무사항을 적고 저장 → 새로 고침 → 날짜를 다시 고르면 값이 그대로이고 합계가 맞으며 '2건 30,000' 칸에만 "합계에서 빠졌어요" ② 다른 PC에서 같은 날을 열면 같은 값 ③ 두 PC가 같은 날 다른 칸을 고치면 날짜를 옮겼다 돌아왔을 때 둘 다 보임 ④ 전화번호 모양은 빨간 칸이 되고 새로 고치면 그 글이 없으며 함께 고친 칸은 저장됨 ⑤ A4 한 장으로 인쇄 ⑥ 끝나면 칸을 모두 비운다(지우기 권한이 없어 빈 칸으로 저장). 자동 시험을 쓸 때: 시험을 더하고, 표가 실제 DB에 들어갔으므로 `docs/ARCHITECTURE.md`의 업무일지 흐름 줄·`worklog_days` 표 줄 '(예정)'을 뺀다(design.md 15절). 대상 코드는 TASK-2~12가 단위 시험으로 이미 만들었으므로 RED 단계가 없다. 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다(커밋하지 않음). **기다림: 사용자가 TASK-4 migration을 실제 Supabase에 붙여 넣은 뒤**(그 전에는 `blocked`). 시험 날짜 2020-01-02(새로 고친 뒤 다시 고름). 새 브라우저(다른 PC 흉내)에서 숫자·글자 칸·항목 이름·업무사항이 모두 같게 보인다. 두 브라우저가 다른 칸을 고치면 둘 다 남는다. **막는 모양을 적은 칸의 값은 모든 요청의 주소·본문과 다시 읽은 줄에 없다**(업무사항의 보통 글은 서버에 있는 것이 맞다. 옛 '표식이 서버에 없다' 검사는 없앴다). PDF 쪽 수는 `/\/Type\s*\/Page(?!s)/`, 끝에 시험 코드로 칸을 비운다(design.md 15절, C7). 요청 머리(headers)·쿠키·`apikey` 값은 모으지 않는다(주소에서도 `apikey`·`access_token` 같은 query는 지우고 본다). 걸린 것은 값 대신 **이름만** 담는다(예: `hits = ['업무사항-전화']` → `expect(hits).toEqual([])`, cross-branch C11). 확인: `npm run e2e`

## TASK-14: 비트 숫자 맞추기 규칙
- Step: Phase 4 · Step 0 · `bit-contract`
- AC: AC-014.1~AC-014.8
- REQ: REQ-014
- Files: src/lib/worklog/bitFill.ts, src/lib/worklog/bitFill.test.ts
- Tests: src/lib/worklog/bitFill.test.ts
- TDD: required — **기다림(Phase 4 공통)**: `origin/main`의 `src/lib/bridge/commands.json`에 `"revenue.days"`가 있고 그 main이 이 브랜치에 합쳐져 있다. 아니면 `blocked`(사유: "매출 갈래 revenue.days가 main에 들어와 이 브랜치에 합쳐져야 함"). 있으면 `src/types/revenue.ts`의 `RevenueDayRow`를 `import type`으로 쓰는 순수 함수(design.md 20-2·20-3절, 칸 맞춤은 20-2절 표 그대로, 칸 위치로 채우고 항목 이름은 보지 않는다). 비트 값은 숫자 글자로 저장하고, 손으로 적은 칸은 `readCell`로 읽어 견준다(숫자 없음·합계 제외는 '다름'). 통계 갈래 길(`readDays`·`DayPayload`·`stats.rows`)은 쓰지 않는다. 시험에 "`unconfirmed`인 날도 신환·재진은 채우고 금액 칸은 비운다"를 넣는다

## TASK-15: 비트 칸 표시 저장
- Step: Phase 4 · Step 1 · `bit-column`
- AC: AC-015.1~AC-015.2
- REQ: REQ-015
- Files: supabase/migrations/20261101000110_worklog_bit_fields.sql, supabase/worklog.rls.test.ts
- Tests: supabase/worklog.rls.test.ts
- TDD: required — 새 migration 하나(design.md 20-4절). PGlite 시험은 auth → TASK-4 → 이 파일 차례로 실행한다. TASK-4 migration 파일은 고치지 않는다. **실제 Supabase에 붙여 넣지 않는다**(사용자 OK). 이 파일을 붙여 넣기 전에는 Phase 4를 합치거나 배포하지 않는다(머리말 관문)

## TASK-16: 비트 칸 읽기·저장
- Step: Phase 4 · Step 2 · `bit-storage`
- AC: AC-016.1~AC-016.2
- REQ: REQ-016
- Files: src/lib/storage/worklogDays.ts, src/lib/storage/worklogDays.test.ts, src/types/worklog.ts, src/components/worklog/WorklogScreen.tsx, src/components/worklog/useWorklogDay.ts, src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/WorklogScreen.test.tsx
- Tests: src/lib/storage/worklogDays.test.ts, src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/WorklogScreen.test.tsx
- TDD: required — 읽기·저장에 `bitFields`를 더한다(design.md 20-4절). `saveWorklogDay(client, ymd, changes, bitFields?)`: **`bitFields`를 안 주면 `bit_fields` 칸을 보내지 않는다**(`[]`을 보내지 않는다, AC-016.2). TASK-5 시험의 "보내는 칸 = `work_date` + 받은 칸"은 그대로이고, `bitFields`를 주면 `bit_fields`가 더해진다. 바뀐 칸이 없어도 `bitFields`를 주면 그것만 보낸다. `loadWorklogDay`가 `{ day, bitFields } | null`을 돌려주게 바뀌므로 그것을 받는 화면 쪽(`WorklogScreen.tsx`의 `load`, `useWorklogDay`)도 이 TASK에서 같이 맞춘다(빌드가 깨지지 않게, 비트 표시·채우기는 TASK-17). `WorklogScreen.test.tsx`는 mock이 돌려주는 모양만 `{ day, bitFields: [] }`로 바꾸고 기대값은 그대로. 이 TASK부터 읽기 칸에 `bit_fields`가 들어가므로 0110 migration을 붙여 넣기 전에는 합치거나 배포하지 않는다(머리말 관문)

## TASK-17: 화면에서 비트로 채우기
- Step: Phase 4 · Step 3 · `bit-screen`
- AC: AC-017.1~AC-017.8
- REQ: REQ-017
- Files: src/components/worklog/useBitFill.ts, src/components/worklog/useBitFill.test.tsx, src/components/worklog/WorklogScreen.tsx, src/components/worklog/WorklogScreen.test.tsx, src/components/worklog/useWorklogDay.ts, src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/WorklogSheet.tsx, src/components/worklog/WorklogSheet.test.tsx, src/components/worklog/sheet.module.css, src/components/worklog/BitNotice.tsx, src/components/worklog/BitNotice.test.tsx, src/lib/worklog/autosave.ts, src/lib/worklog/autosave.test.ts, src/components/worklog/worklogSession.ts, src/components/worklog/worklogSession.test.ts, docs/mockups/worklog/bitfill.html
- Tests: src/components/worklog/useBitFill.test.tsx, src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/WorklogScreen.test.tsx, src/components/worklog/WorklogSheet.test.tsx, src/components/worklog/BitNotice.test.tsx, src/lib/worklog/autosave.test.ts, src/components/worklog/worklogSession.test.ts
- TDD: required — **기다림(Phase 4 공통)**: `origin/main`의 `src/lib/bridge/commands.json`에 `"revenue.days"`가 있고 그 main이 이 브랜치에 합쳐져 있다. 아니면 `blocked`(사유: "매출 갈래 revenue.days가 main에 들어와 이 브랜치에 합쳐져야 함"). **먼저 시안**: 비트 표시·'다름' 목록·안내 한 줄을 `docs/mockups/worklog/bitfill.html`(예시 숫자)로 만들어 사용자 OK를 받는다. OK 전에는 `blocked`(CLAUDE.md 화면 규칙). 자동 저장 길이 `bitFields`를 나르고 **바뀌었을 때만 보낸다**: `change(ymd, day, bitFields?)`·`serverDay(…, bitFields?)` → `{ day, bitFields? }`·`pendingDay(ymd)` → `{ day, bitFields? } | null`·`worklogSession`의 `save`(design.md 20-4절). 비트 합치기는 그날 `ready` 뒤에만(AC-017.8, design.md 20-1절) — 비트를 읽지 않는 화면·앱 안 이동 뒤 저장이 표시를 지우지 않는지 시험한다(AC-017.7). `useBridge`·`revenue.days`는 `vi.mock`. 화면에 오는 값이 숫자뿐인지, 비트 때문에 나가는 저장에 채운 칸·비트 칸 목록 말고 다른 칸(업무사항·항목 이름)이 없는지 시험한다(design.md 20-1·20-5절)

## TASK-18: 실제 Supabase 비트 칸 확인
- Step: Phase 5 · Step 0 · `bit-e2e`
- AC: AC-018.1~AC-018.2
- REQ: REQ-018
- Files: e2e/worklog-bit.spec.ts
- Tests: e2e/worklog-bit.spec.ts
- TDD: exempt — 시험만 더한다(대상 코드는 TASK-15~17). 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌린다(커밋하지 않음). **기다림: 사용자가 `20261101000110_worklog_bit_fields.sql`을 실제 Supabase에 붙여 넣은 뒤**(그 전에는 `blocked`). 비트 PC가 없는 시험 기계라 `revenue.days`는 부르지 않는다: `accounts.client('approved')`(RLS 아래)로 시험 날짜(2020-01-02) 줄에 `bit_fields`를 넣음 → 화면에서 비트 표시가 보이는지 → 비트 칸 밖 칸(예: 지출 현금)을 고쳐 "저장했어요" → 다시 읽어 `bit_fields`가 그대로인지(AC-017.7을 실제 DB로), 요청 머리(headers)·쿠키·`apikey` 값은 모으지 않는다(주소에서도 `apikey`·`access_token` 같은 query는 지우고 본다). 걸린 것은 값 대신 **이름만** 담는다(예: `hits = ['업무사항-전화']` → `expect(hits).toEqual([])`, cross-branch C11), 막는 모양을 적은 칸의 값이 모든 요청의 주소·본문과 다시 읽은 줄에 없는지(C7). 끝에 빈 값·빈 표시로 되돌린다. 확인: `npm run e2e`

## TASK-19: 의원 PC 확인
- Step: Phase 5 · Step 1 · `clinic-check`
- AC: AC-019.1~AC-019.2
- REQ: REQ-019
- Files: docs/worklog/bit-check.md
- Tests: 없음(사용자 확인)
- TDD: exempt — 코드 없이 총괄이 의원 PC에서 업무일지 화면(비트가 채운 칸)·지난 엑셀·비트 '외래환자경영통계'를 견준다(design.md 20-6절). 매출 갈래가 넘긴 확인(수납 나눔 현금·카드·계좌·미수입금, 날짜별 신환·재진)도 여기서 한다 — 그 칸은 업무일지 화면에만 그려진다. **기다림: Phase 4가 사용자 지시로 배포된 뒤**(확장·도우미는 운영 주소 하나와만 말한다). Claude는 확인표를 만들어 쉬운 말로 안내하고 답을 기다린다(`blocked`). 숫자는 적지 않는다. 결과가 20-2절과 다르면 명세를 고쳐 다시 승인받고, 매출 쪽 문제는 매출 갈래에 알린다
