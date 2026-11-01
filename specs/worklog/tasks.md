# 작업 분할: 업무일지

> 형식: `## TASK-n: 제목` 아래에 `- Step:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다. TASK 번호 = REQ 번호 = Phase·Step 순서다.
> Phase 넷: `worklog-1-data`(TASK-1~5) → `worklog-2-screen`(TASK-6~10) → `worklog-3-finish`(TASK-11~13) → `worklog-4-bitfill`(TASK-14~18, 비트에서 채우기). Phase 4는 매출 갈래의 `revenue.days`(업무일지 칸 포함)가 main에 들어온 뒤에만 시작한다(TASK-14가 확인하고 없으면 `blocked`). Phase가 끝날 때마다 `verify`·쉬운 말 보고, 화면이 생긴 뒤(TASK-12 뒤)에는 화면 캡처(dev-browser, 1440·390)도. 합치기·운영 배포는 사용자가 말할 때만 한다.
> 화면 TASK(8·9·10·11·12)는 승인된 시안 `docs/mockups/worklog/index.html`과 design.md '목업과 다른 점'을 따른다.
> **실제 Supabase에 migration을 붙여 넣는 일은 사용자 OK가 필요하다**(TASK-4는 파일과 PGlite 시험만). TASK-13(E2E)은 그 뒤에만 돈다.

## TASK-1: 결정과 규칙 문서
- Step: Phase 1 · Step 0 · `docs`
- AC: AC-001.1~AC-001.3
- REQ: REQ-001
- Files: docs/ADR.md, docs/ARCHITECTURE.md, docs/UI_GUIDE.md, plan.md
- Tests: 없음(문서)
- TDD: exempt — 문서만 고친다. ADR 끝에 업무일지 ADR 하나(번호 = 그때 마지막 번호 + 1, design.md 18절): 결정 셋(업무사항 이 PC localStorage만 · 자동 저장 · 양식 칸 엑셀 서식 예외)과 이유·트레이드오프. ARCHITECTURE는 디렉토리 줄 셋, DB 표 `daily_reports` 줄을 `worklog_days`로, 데이터 흐름 [업무일지] 한 줄, 상태 관리 예외 한 줄. UI_GUIDE는 '업무일지 양식(엑셀 예외)' 절(design.md 11-1·12·13절 요약)과 '하지 마라' 표 세 줄(두 번째 글꼴·700 굵기·토큰 밖 색)에 꼬리표, '상자 안 상자' 예외 한 줄(종이 안 엑셀 칸 선). plan.md는 §5 '브라우저 저장소에는 폴더 핸들만'에 "(예외: 업무일지 업무사항, ADR-0NN)" 꼬리표 한 줄만. 다른 문장은 바꾸지 않는다

## TASK-2: 합계·칸 글자·날짜 규칙
- Step: Phase 1 · Step 1 · `calc-format`
- AC: AC-002.1~AC-002.10
- REQ: REQ-002
- Files: src/types/worklog.ts, src/lib/worklog/calc.ts, src/lib/worklog/calc.test.ts, src/lib/worklog/days.ts, src/lib/worklog/days.test.ts, src/lib/worklog/notes.ts, src/lib/worklog/notes.test.ts
- Tests: src/lib/worklog/calc.test.ts, src/lib/worklog/days.test.ts, src/lib/worklog/notes.test.ts
- TDD: required — 순수 함수만(design.md 5·6절). 엑셀 10월 숫자 같은 실제 값 대신 둥근 가짜 숫자를 쓴다. 날짜는 `lib/analytics/dates.ts`만 쓴다

## TASK-3: 업무사항 이 PC 저장소
- Step: Phase 1 · Step 2 · `memo-store`
- AC: AC-003.1~AC-003.5
- REQ: REQ-003
- Files: src/lib/worklog/memoStore.ts, src/lib/worklog/memoStore.test.ts
- Tests: src/lib/worklog/memoStore.test.ts
- TDD: required — 가짜 `Storage`를 넣어 시험한다(design.md 7절). AC-003.5는 시험이 소스 글자를 읽어 본다

## TASK-4: 서버 표 `worklog_days`
- Step: Phase 1 · Step 3 · `db-table`
- AC: AC-004.1~AC-004.7
- REQ: REQ-004
- Files: supabase/migrations/20261101000100_worklog.sql, supabase/worklog.rls.test.ts
- Tests: supabase/worklog.rls.test.ts
- TDD: required — PGlite에 `supabase/rls.test.ts`와 같은 Supabase 흉내 → auth migration → 이 migration(design.md 8절). 공용 함수 `my_hospital_id()`·`touch_updated_at()`는 cross-branch C1 글자 그대로(`create or replace`)이고, 그 둘이 이미 있을 때도 도는지 시험한다(AC-004.8). 기존 auth migration과 `supabase/rls.test.ts`는 고치지 않는다. **실제 Supabase에 붙여 넣지 않는다**(사용자 OK 필요, Phase 2 끝에 안내)

## TASK-5: 하루 읽기·저장
- Step: Phase 1 · Step 4 · `day-storage`
- AC: AC-005.1~AC-005.4
- REQ: REQ-005
- Files: src/lib/storage/worklogDays.ts, src/lib/storage/worklogDays.test.ts
- Tests: src/lib/storage/worklogDays.test.ts
- TDD: required — 가짜 Supabase 클라이언트(`from().select().eq('work_date').maybeSingle()`·`from().upsert()` 흉내). `hospital_id`는 보내지도 거르지도 않는다(DB 기본값·RLS)로 시험한다(design.md 9절). 실제 Supabase에 붙지 않는다

## TASK-6: 자동 저장 제어
- Step: Phase 2 · Step 0 · `autosave`
- AC: AC-006.1~AC-006.10
- REQ: REQ-006
- Files: src/lib/worklog/autosave.ts, src/lib/worklog/autosave.test.ts
- Tests: src/lib/worklog/autosave.test.ts
- TDD: required — `vi.useFakeTimers()`와 가짜 `save`로 시험한다(design.md 10절). React·supabase를 쓰지 않는다

## TASK-7: 엑셀 서식 예외 규칙
- Step: Phase 2 · Step 1 · `sheet-style`
- AC: AC-007.1~AC-007.4
- REQ: REQ-007
- Files: src/app/globals.css, src/app/theme.test.ts, src/app/fonts.test.ts, src/components/ui/classes.test.ts, src/components/worklog/sheet.module.css, src/components/worklog/sheet.style.test.ts
- Tests: src/app/theme.test.ts, src/app/fonts.test.ts, src/components/ui/classes.test.ts, src/components/worklog/sheet.style.test.ts
- TDD: required — 먼저 규칙 시험에 예외 한 파일·토큰 넷을 기대하는 시험을 더해 RED를 본다(아직 토큰·파일이 없다). 그다음 `:root` 토큰 넷과 `sheet.module.css`(시안의 `.paper`·`.sheet` 화면 규칙 그대로, 인쇄 부분은 TASK-11)를 만든다. 기존 규칙 시험의 다른 기대값은 바꾸지 않는다(design.md 12절)

## TASK-8: 엑셀 양식 칸
- Step: Phase 2 · Step 2 · `sheet`
- AC: AC-008.1~AC-008.8
- REQ: REQ-008
- Files: src/components/worklog/WorklogSheet.tsx, src/components/worklog/WorklogSheet.test.tsx, src/components/worklog/sheet.module.css
- Tests: src/components/worklog/WorklogSheet.test.tsx
- TDD: required — jsdom + Testing Library. 그리기만 하고 값은 props로 받는다(design.md 11-1절). 합친 칸 46개는 design.md 2절 표와 시험이 견준다

## TASK-9: 날짜 줄·저장 상태
- Step: Phase 2 · Step 3 · `toolbar`
- AC: AC-009.1~AC-009.4
- REQ: REQ-009
- Files: src/components/worklog/WorklogToolbar.tsx, src/components/worklog/WorklogToolbar.test.tsx, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/components/worklog/WorklogToolbar.test.tsx, src/lib/errors.test.ts
- TDD: required — 오류 번호 넷은 `lib/errors.ts`·`types/errors.ts` 끝에 더하기만 한다(사전점검 갈래와 겹침, design.md 18절). 문구는 design.md 11-2절 표 그대로

## TASK-10: 업무일지 화면
- Step: Phase 2 · Step 4 · `screen`
- AC: AC-010.1~AC-010.12
- REQ: REQ-010
- Files: src/components/worklog/WorklogScreen.tsx, src/components/worklog/WorklogScreen.test.tsx, src/components/worklog/useWorklogDay.ts, src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/worklogSession.ts, src/components/worklog/worklogSession.test.ts
- Tests: src/components/worklog/WorklogScreen.test.tsx, src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/worklogSession.test.ts
- TDD: required — `lib/storage/worklogDays`·`lib/worklog/memoStore`·`lib/supabase/browser`는 `vi.mock`, 시간은 가짜 타이머, `matchMedia`(터치 기기 `(hover: none) and (pointer: coarse)`)는 시험이 만든다(design.md 11-3절). 자동 저장 제어는 화면 밖 `worklogSession.ts`에 한 벌 — 화면이 내려가면 `flush()`만 하고 저장은 이어진다("앱 안 이동 = 바로 저장" 시험). 로그아웃(`SIGNED_OUT`)이면 떠나기 확인을 떼고 화면 값을 지운다. 페이지에는 아직 붙이지 않는다(TASK-12). 캡처용 임시 페이지를 만들지 않는다 — Phase 2 끝 화면 확인은 시험 그림(그린 마크업)으로 하고, 실제 화면 캡처는 TASK-12 뒤에 한다

## TASK-11: 인쇄
- Step: Phase 3 · Step 0 · `print`
- AC: AC-011.1~AC-011.3
- REQ: REQ-011
- Files: src/components/worklog/sheet.module.css, src/components/worklog/sheet.print.test.ts, src/components/worklog/WorklogToolbar.tsx, src/components/worklog/WorklogToolbar.test.tsx, src/components/shell/AppShell.tsx, src/components/shell/shell.test.tsx, src/app/globals.css
- Tests: src/components/worklog/sheet.print.test.ts, src/components/worklog/WorklogToolbar.test.tsx, src/components/shell/shell.test.tsx
- TDD: required — 인쇄 CSS 글자와 줄 높이 합을 시험이 읽어 본다(design.md 13절). `globals.css`는 Next가 CSS Module 안 `@page`를 거부할 때만 `@page` 한 블록을 더한다. AppShell은 `print:` 클래스 세 곳만 더한다

## TASK-12: 탭 연결
- Step: Phase 3 · Step 1 · `tab-hookup`
- AC: AC-012.1~AC-012.5
- REQ: REQ-012
- Files: src/app/(app)/worklog/page.tsx, src/app/(app)/worklog/page.test.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx
- Tests: src/app/(app)/worklog/page.test.tsx, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.test.ts, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx
- TDD: required — tab-frame design.md '다음 명세가 탭을 채울 때' 그대로 네 곳을 같은 TASK에서 바꾼다(design.md 14절). 대시보드 기능 목차의 개수(`FeatureIndex.tsx`가 목록에서 셈)는 코드 그대로이고, `DashboardHome.test.tsx`의 손 숫자(`INDEX_SIDE`·준비 중·사용 가능 개수)를 목록에서 세는 기대로 바꾼다(AC-012.5, C5). '지금 바로 쓸 수 있어요'(`ReadyNow.tsx`)는 그대로. 끝나면 dev-browser로 `/worklog` 1440·390 캡처(실제 Supabase에 표가 없으면 불러오기 실패 카드가 보이는 것이 맞다)

## TASK-13: 실제 Supabase 확인 E2E
- Step: Phase 3 · Step 2 · `e2e`
- AC: AC-013.1~AC-013.4
- REQ: REQ-013
- Files: e2e/worklog.spec.ts
- Tests: e2e/worklog.spec.ts
- TDD: exempt — 시험만 더한다. 대상 코드는 TASK-2~12가 단위 시험으로 이미 만들었으므로 RED 단계가 없다. 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다(커밋하지 않음). **기다림: 사용자가 TASK-4 migration을 실제 Supabase에 붙여 넣은 뒤**(그 전에는 `blocked`). 시험 날짜 2020-01-02(새로 고친 뒤 다시 고름), **모든 요청의 주소·본문**과 다시 읽은 줄에 가짜 표식·이름·차트번호·전화·주민번호가 없음, PDF 쪽 수는 `/\/Type\s*\/Page(?!s)/`, 끝에 빈 값 저장(design.md 15절, C7). 확인: `npm run e2e`

## TASK-14: 비트 숫자 맞추기 규칙
- Step: Phase 4 · Step 0 · `bit-contract`
- AC: AC-014.1~AC-014.7
- REQ: REQ-014
- Files: src/lib/worklog/bitFill.ts, src/lib/worklog/bitFill.test.ts
- Tests: src/lib/worklog/bitFill.test.ts
- TDD: required — **먼저 확인**: `origin/main`에 `revenue.days`(`src/lib/bridge/commands.json`)와 그 답 타입(`src/types/revenue.ts`)이 있고 이 브랜치에 합쳐져 있는가, 통계의 날짜별 저장 숫자 읽기(`readDays`)가 있는가. 없으면 `blocked`(사유: 매출·통계 갈래 합치기 기다림). 있으면 그 타입을 불러 쓰는 순수 함수(design.md 20-2·20-3절). 매출 답에 현금·카드·계좌·미수 칸이 없으면 그 칸은 `BIT_FILL_KEYS`에서 빠지고 summary에 적는다

## TASK-15: 의원 PC 확인
- Step: Phase 4 · Step 1 · `clinic-check`
- AC: AC-015.1~AC-015.2
- REQ: REQ-015
- Files: docs/worklog/bit-check.md
- Tests: 없음(사용자 확인)
- TDD: exempt — 코드 없이 총괄이 비트 화면과 지난 엑셀을 견준다(design.md 20-6절). Claude는 확인표를 만들어 쉬운 말로 안내하고 답을 기다린다(`blocked`). 숫자는 적지 않는다. 결과가 기본 표와 다르면 TASK-16 전에 명세를 고쳐 다시 승인받는다

## TASK-16: 비트 칸 표시 저장
- Step: Phase 4 · Step 2 · `bit-column`
- AC: AC-016.1~AC-016.2
- REQ: REQ-016
- Files: supabase/migrations/20261101000110_worklog_bit_fields.sql, supabase/worklog.rls.test.ts
- Tests: supabase/worklog.rls.test.ts
- TDD: required — 새 migration 하나(design.md 20-4절). PGlite 시험은 auth → TASK-4 → 이 파일 차례로 실행한다. TASK-4 migration 파일은 고치지 않는다. **실제 Supabase에 붙여 넣지 않는다**(사용자 OK)

## TASK-17: 비트 칸 읽기·저장
- Step: Phase 4 · Step 3 · `bit-storage`
- AC: AC-017.1
- REQ: REQ-017
- Files: src/lib/storage/worklogDays.ts, src/lib/storage/worklogDays.test.ts, src/types/worklog.ts
- Tests: src/lib/storage/worklogDays.test.ts
- TDD: required — 읽기·저장에 `bitFields`를 더한다(design.md 20-4절). TASK-5 시험의 "보내는 칸 20개"(`work_date` + 19) 기대는 21개(`bit_fields` 더함)로 바뀐다. 업무사항이 없다는 시험은 그대로

## TASK-18: 화면에서 비트로 채우기
- Step: Phase 4 · Step 4 · `bit-screen`
- AC: AC-018.1~AC-018.6
- REQ: REQ-018
- Files: src/components/worklog/useBitFill.ts, src/components/worklog/useBitFill.test.tsx, src/components/worklog/WorklogScreen.tsx, src/components/worklog/WorklogScreen.test.tsx, src/components/worklog/useWorklogDay.ts, src/components/worklog/WorklogSheet.tsx, src/components/worklog/WorklogSheet.test.tsx, src/components/worklog/sheet.module.css, src/components/worklog/BitNotice.tsx, src/components/worklog/BitNotice.test.tsx, docs/mockups/worklog/bitfill.html
- Tests: src/components/worklog/useBitFill.test.tsx, src/components/worklog/WorklogScreen.test.tsx, src/components/worklog/WorklogSheet.test.tsx, src/components/worklog/BitNotice.test.tsx
- TDD: required — **먼저 시안**: 비트 표시·'다름' 목록·안내 한 줄을 `docs/mockups/worklog/bitfill.html`(예시 숫자)로 만들어 사용자 OK를 받는다. OK 전에는 `blocked`(CLAUDE.md 화면 규칙). `useBridge`·매출 명령·통계 읽기는 `vi.mock`. 화면에 오는 값이 숫자뿐인지, 저장 호출에 업무사항·환자 글자가 없는지 시험한다(design.md 20-1·20-5절)
