# 작업 분할: 병원 정보 한 곳 + 다른 병원 청구메모

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나. **같은 Phase의 TASK끼리 파일이 겹치지 않는다.** 앞 Phase가 합쳐진 뒤 다음 Phase.
> MVP 모드: 중간 검토 없이 마지막에 전체 검사·검토 한 번. Phase 끝마다 그 Phase 시험 파일만 돌린다.
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | DB: `clinic_profiles`·로고 바구니·`input_mode` 칸·`my_desk()` 이름 + RLS 시험 + ADR-033 |
> | 1 | TASK-2 | 저장 층·공용: 병원 정보 읽기/저장·로고, 표시 도우미, 공용 훅, 청구 설정 시작·입력 방식, 오류 문구 |
> | 1 | TASK-3 | 점검: 약 역할을 성분으로(고정 코드 빼기) |
> | 1 | TASK-4 | 도우미 0.12.0: 뒤에 붙이기·견주기·3,000바이트 |
> | 1 | TASK-5 | 메모 엔진: 중립 기본 문구·차트 줄임말·연골주사 이름·역할·기본값 상수 |
> | 2 | TASK-6 | 처음 질문 순수 함수(보기·답 넣기·붙인 메모 읽기·보기 메모) |
> | 2 | TASK-7 | 설정 '병원 정보' 칸 + 헤더 이름(guard) |
> | 2 | TASK-8 | 예약이 병원 정보를 씀 |
> | 2 | TASK-9 | 서식 로고·안내문 색 |
> | 2 | TASK-10 | 문자 문구 채우기 |
> | 2 | TASK-11 | 통계·대시보드·AI(진료시간·휴진일·호칭) |
> | 2 | TASK-12 | 청구 Worker 잇기(역할·연골주사 이름·붙이기 항목) |
> | 3 | TASK-13 | 청구 화면(입력 방식 기억·[뒤에 붙이기]·잠금 링크) |
> | 3 | TASK-14 | 설정 병원 문구 화면(잠금 풀기·역할·차트 줄임말·숨은 칸) |
> | 3 | TASK-15 | 처음 질문 화면·주소·붙여 넣기 울타리 |
>
> - **기준 갈래**: `feat-clinic-profile`(운영 c94e9f72에서). 시안 없음(사용자 2026-11-18 "시안 없이 바로") — 다 만든 뒤 화면 확인 도구로 사진을 찍어 보인다.
> - **잇는 곳**: Phase 2·3은 TASK-2의 `ClinicProfile` 형·`useClinicProfile`·표시 도우미(`lib/clinic/format.ts`), TASK-5의 `neutralPhrases`·`chartWords`·`MemoTables.roles/cartilageNames`, TASK-3의 `drugRoles`·`runRules` 넷째 값, TASK-4의 `appends`·`APPEND_HELPER`를 design.md 이름 그대로 쓴다.
> - **도우미 C# 시험**은 TASK-4 하나만 돌린다(같은 Phase에 dotnet을 돌리는 일꾼이 없다). `PATH="$HOME/.dotnet:$PATH"`.
> - **사용자 단계**: 배포 전 ① `supabase/migrations/20261119000000_clinic_profile.sql`을 Supabase SQL Editor에 붙여 넣기 ② 도우미 0.12.0 정식 판(태그) ③ 웹 배포("배포해") ④ 우리 의원: 설정 → 병원 정보에서 로고 올리기·진료시간 확인. Claude는 실제 Supabase에 붙지 않는다.

## TASK-1: DB — 병원 정보·로고 바구니·입력 방식 칸
- Phase: 1
- AC: AC-6601.1, AC-6601.2, AC-6601.3, AC-6601.4, AC-6601.5, AC-6601.6, AC-6601.7, AC-6610.1
- REQ: REQ-6601, REQ-6610
- Files: supabase/migrations/20261119000000_clinic_profile.sql, supabase/clinicProfile.rls.test.ts, supabase/precheck.rls.test.ts, supabase/desk.rls.test.ts, docs/ADR.md, docs/ARCHITECTURE.md, plan.md, CLAUDE.md
- Tests: supabase/clinicProfile.rls.test.ts, supabase/precheck.rls.test.ts, supabase/desk.rls.test.ts
- TDD: required — design.md 1절·12절(SQL 칸)·17절. 시험은 `desk.rls.test.ts`처럼 PGlite에서 진짜 migration을 차례로(… calendar → desk_accounts → 이 파일) 돌린다. 원장 A·B, A 데스크, 대기·거절·병원 없는 사용자로 칸 권한·정책·제약·옮기기(예약 줄 그대로, 이미 줄 있으면 건드리지 않음)·rev 오름·바구니 정책(이름이 logo_path와 같을 때만 넣기)·두 번 실행·`my_desk()` 이름·`my_hospital_id()`·`calendar_bump()` 글자 그대로·`input_mode` 칸 권한(원장 update만, 값 제약)을 본다. `precheck.rls.test.ts`는 칸 권한 목록을 새 칸까지로. `docs/ADR.md` 끝에 ADR-033(design.md 17절 글), `CLAUDE.md`는 서버 코드 줄 한 곳, `plan.md`·`docs/ARCHITECTURE.md`는 DB 표 목록에 `clinic_profiles`·Storage `clinic-logos` 한 줄씩. **실제 Supabase에 붙여 넣지 않는다**

## TASK-2: 저장 층·공용 — 병원 정보, 청구 설정 시작·입력 방식, 오류 문구
- Phase: 1
- AC: AC-6602.4, AC-6602.7, AC-6603.2, AC-6605.1, AC-6607.2, AC-6607.4, AC-6610.1, AC-6610.2, AC-6614.8
- REQ: REQ-6602, REQ-6605, REQ-6607, REQ-6610, REQ-6614
- Files: src/types/clinicProfile.ts, src/lib/storage/clinicProfile.ts, src/lib/storage/clinicProfile.test.ts, src/lib/clinic/format.ts, src/lib/clinic/format.test.ts, src/components/clinic/useClinicProfile.ts, src/components/clinic/useClinicProfile.test.ts, src/lib/storage/claimSettings.ts, src/lib/storage/claimSettings.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/components/claim/memo/MemoPanel.test.tsx, src/components/settings/HospitalPhrases.test.tsx, src/components/settings/DxLinks.test.tsx
- Tests: src/lib/storage/clinicProfile.test.ts, src/lib/clinic/format.test.ts, src/components/clinic/useClinicProfile.test.ts, src/lib/storage/claimSettings.test.ts, src/lib/errors.test.ts, src/components/claim/memo/MemoPanel.test.tsx, src/components/settings/HospitalPhrases.test.tsx, src/components/settings/DxLinks.test.tsx
- TDD: required — design.md 2절(형·`checkProfile`·`loadClinicProfile`·`saveClinicProfile`·로고 올리기/받기·`normalizeLogo`·`useClinicProfile`·`phoneText`·`hoursText`·`calendarRange`), 9절(`startHospitalSettings`), 12절(`readInputMode`·`saveInputMode`), 오류 번호 `E-CLINIC-READ-FAILED`·`E-CLINIC-SAVE-FAILED`·`E-CLINIC-LOGO-FAILED`·`E-FIRST-RUN-SAVE-FAILED`와 `E-MEMO-NO-SETTINGS` 새 글(AC-6607.4). 세 화면 시험 파일은 바뀐 잠금 글을 보는 줄만 고친다(화면 코드는 고치지 않는다). supabase는 흉내 client로 시험한다

## TASK-3: 점검 — 약 역할을 성분으로
- Phase: 1
- AC: AC-6608.1, AC-6608.2, AC-6608.3, AC-6608.4
- REQ: REQ-6608
- Files: src/lib/precheck/drugRoles.ts, src/lib/precheck/drugRoles.test.ts, src/lib/precheck/rules/run.ts, src/lib/precheck/rules/compile.ts, src/lib/precheck/rules/roles.test.ts, src/lib/precheck/rules/engine.test.ts, src/lib/precheck/rules/coverage.test.ts
- Tests: src/lib/precheck/drugRoles.test.ts, src/lib/precheck/rules/roles.test.ts, src/lib/precheck/rules/engine.test.ts, src/lib/precheck/rules/coverage.test.ts, src/lib/precheck/rules/golden.test.ts
- TDD: required — design.md 10절. `runRules(month, tables, settings, roles = new Map())`로 넷째 값을 받아 지금 부르는 곳(`jobs.ts`)이 그대로 돈다(잇기는 TASK-12). `STEROID`·`LIDO_CODES`·`DEFAULT_DRUG_NAMES`·`clinic_codes` 더하기를 지운다. `roles.test.ts`는 가짜 달로 다른 병원(A15가 리도카인 아님, X7 히알루론산) AC-6608.3과 우리 의원 다섯 코드·보험코드(AC-6608.4: 고치기 전 결과를 먼저 시험에 적어 두고 같음을 본다). `golden.test.ts`는 고치지 않고 통과해야 한다

## TASK-4: 도우미 0.12.0 — 뒤에 붙이기
- Phase: 1
- AC: AC-6611.2, AC-6611.3, AC-6611.4, AC-6611.5
- REQ: REQ-6611
- Files: src/lib/bridge/commands.json, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts, src/lib/precheck/memoCompare.ts, src/lib/precheck/memoCompare.test.ts, src/lib/precheck/bitBytes.ts, src/lib/precheck/bitBytes.test.ts, helper/Directory.Build.props, helper/src/Precheck.Core/Input/InputCommands.cs, helper/src/Precheck.Core/Input/BatchCheck.cs, helper/src/Precheck.Core/Input/InputRunner.cs, helper/src/Precheck.Core/Input/InputPrompt.cs, helper/src/Precheck.Core/Input/MemoMatcher.cs, helper/src/Precheck.Core/Input/BitBytes.cs, helper/src/Precheck.Core/Claim/MemoCompare.cs, helper/tests/Precheck.Core.Tests/Input/InputCommands.test.cs, helper/tests/Precheck.Core.Tests/Input/BatchCheck.test.cs, helper/tests/Precheck.Core.Tests/Input/InputRunner.test.cs, helper/tests/Precheck.Core.Tests/Input/InputPrompt.test.cs, helper/tests/Precheck.Core.Tests/Claim/MemoCompare.test.cs, helper/tests/Precheck.Core.Tests/Claim/memo-compare-cases.test.json, helper/tests/input.dotnet.test.ts, helper/tests/input-replace.dotnet.test.ts, helper/tests/memo-compare.dotnet.test.ts
- Tests: src/lib/precheck/memoCompare.test.ts, src/lib/precheck/bitBytes.test.ts, src/lib/bridge/handshake.test.ts, helper/tests/input.dotnet.test.ts, helper/tests/input-replace.dotnet.test.ts, helper/tests/memo-compare.dotnet.test.ts
- TDD: required — design.md 13절. `appends`는 `replaces`와 함께 오면 거절, '묻지 않기'로 붙이지 않음, 붙이기 전 다시 읽어 같을 때만, `SaveOriginal`·`SaveAndConfirm(합친 글)`, 되살리기, 3,000바이트(ASCII 1·나머지 2, 웹 `bitBytes.ts`와 C# `BitBytes.cs`가 같은 사례), 묻는 창 줄. 판 0.12.0(`Directory.Build.props`·`LATEST_HELPER`·`APPEND_HELPER`, `MIN_HELPER` 그대로). C# 시험은 감싸개 `*.dotnet.test.ts`로 부르고 net10으로 돌린다

## TASK-5: 메모 엔진 — 중립 기본 문구·차트 줄임말·연골주사 이름
- Phase: 1
- AC: AC-6607.3, AC-6609.1, AC-6609.2, AC-6609.3, AC-6612.2, AC-6612.3
- REQ: REQ-6607, REQ-6609, REQ-6612
- Files: src/lib/precheck/memo/engine.ts, src/lib/precheck/memo/phrases.ts, src/lib/precheck/memo/types.ts, src/lib/precheck/memo/index.ts, src/lib/precheck/memo/engineDefaults.ts, src/lib/precheck/memo/phrases.test.ts, src/lib/precheck/memo/clinicMemo.test.ts
- Tests: src/lib/precheck/memo/phrases.test.ts, src/lib/precheck/memo/clinicMemo.test.ts, src/lib/precheck/memo/golden.test.ts, src/lib/precheck/memo/fullText.test.ts
- TDD: required — design.md 9절(`neutralPhrases`), 10절 메모(`MemoTables.roles?: ReadonlyMap<string, 'steroid' | 'localAnesthetic' | 'cartilage' | 'none'>`, `isCartilageDrug` 차례 — 형은 이 파일 안에 글자로 적어 TASK-3 파일을 부르지 않는다), 11절(`MemoTables.cartilageNames?: string[]`, 안쪽 표시 '아라간'을 차트 사전 줄로, 약 이름 차례 → '연골주사약'), 14절(`Phrases.chartWords` 검사·사전 줄), 15절(`engineDefaults.ts`로 값 그대로 옮김). `golden.test.ts`·`fullText.test.ts`는 고치지 않고 통과해야 한다(AC-6609.3·AC-6612.3)

## TASK-6: 처음 질문 순수 함수
- Phase: 2
- AC: AC-6614.3, AC-6614.7, AC-6614.9
- REQ: REQ-6614
- Files: src/lib/precheck/memo/onboarding/sampleVisits.ts, src/lib/precheck/memo/onboarding/answers.ts, src/lib/precheck/memo/onboarding/presets.ts, src/lib/precheck/memo/onboarding/readMemo.ts, src/lib/precheck/memo/onboarding/preview.ts, src/lib/precheck/memo/onboarding/answers.test.ts, src/lib/precheck/memo/onboarding/presets.test.ts, src/lib/precheck/memo/onboarding/readMemo.test.ts
- Tests: src/lib/precheck/memo/onboarding/answers.test.ts, src/lib/precheck/memo/onboarding/presets.test.ts, src/lib/precheck/memo/onboarding/readMemo.test.ts
- TDD: required — design.md 16절 순수 함수. `presets.test.ts`가 보기 4개 × 가짜 진료 3건을 진짜 엔진으로 만들어 AC-6614.9 모양을 보고, 나온 글을 시험 안 기대 글로 적어 둔다(보기 글을 정하는 시험). `applyAnswers`를 두 번 해도 토큰이 겹치지 않음, `answersOf(applyAnswers(x, a)) = a`, 다른 칸 그대로(AC-6614.7). `readMemo`는 섞임·못 찾음, 결과에 메모 글이 없음

## TASK-7: 설정 '병원 정보' 칸 + 헤더 이름
- Phase: 2
- AC: AC-6602.1, AC-6602.2, AC-6602.3, AC-6602.4, AC-6602.5, AC-6602.6, AC-6602.7, AC-6602.8, AC-6606.5
- REQ: REQ-6602, REQ-6606
- Files: src/components/settings/ClinicProfileCard.tsx, src/components/settings/ClinicProfileCard.test.tsx, src/components/settings/SettingsPage.tsx, src/app/(app)/settings/page.test.tsx, src/lib/auth/hospital.server.ts, src/lib/auth/hospital.server.test.ts
- Tests: src/components/settings/ClinicProfileCard.test.tsx, src/app/(app)/settings/page.test.tsx, src/lib/auth/hospital.server.test.ts
- TDD: required — design.md 3절·4절. 칸 차례·기본값·요일 검사·휴진일·직원(30명·표시 겹침·20색)·로고(줄이기·크기·빼기·바꾸기)·저장 실패/읽기 실패·데스크에게 없음. `readMe`는 원장이면 `display_name` 한 칸만 읽고 실패·없음이면 가입 이름(쓰지 않음)

## TASK-8: 예약이 병원 정보를 씀
- Phase: 2
- AC: AC-6603.1, AC-6603.2, AC-6603.3, AC-6603.4, AC-6603.5
- REQ: REQ-6603
- Files: src/lib/calendar/clinic.ts, src/lib/calendar/clinic.test.ts, src/types/calendar.ts, src/components/calendar/useCalendarData.ts, src/components/calendar/useCalendarData.test.ts, src/components/calendar/CalendarScreen.tsx, src/components/calendar/CalendarScreen.test.tsx, src/components/calendar/rows/TimeGrid.tsx, src/components/calendar/rows/TimeGrid.test.tsx, src/components/calendar/MonthGrid.tsx, src/components/calendar/MonthGrid.test.tsx, src/components/calendar/rows/PhoneWeekList.tsx, src/components/calendar/rows/PhoneWeekList.test.tsx, src/components/calendar/CalendarSettings.tsx, src/components/calendar/CalendarSettings.test.tsx, src/lib/storage/calendar.ts, src/lib/storage/calendar.test.ts, src/components/stats/useStatsCalendar.ts, src/components/stats/useStatsCalendar.test.ts
- Tests: src/lib/calendar/clinic.test.ts, src/components/calendar/useCalendarData.test.ts, src/components/calendar/CalendarScreen.test.tsx, src/components/calendar/rows/TimeGrid.test.tsx, src/components/calendar/MonthGrid.test.tsx, src/components/calendar/rows/PhoneWeekList.test.tsx, src/components/calendar/CalendarSettings.test.tsx, src/lib/storage/calendar.test.ts, src/components/stats/useStatsCalendar.test.ts
- TDD: required — design.md 5절. `mergeClinic`은 `lib/calendar`(환자 자료 구역)라 형만 받는 순수 함수다. 병원 정보는 `useCalendarData`가 `loadClinicProfile`로 읽는다(실패·없음이면 예약 설정 값). `rows`는 받은 `days`·`closedDates`만 그린다

## TASK-9: 서식 로고·환자 안내문 색
- Phase: 2
- AC: AC-6604.1, AC-6604.2, AC-6604.3, AC-6604.4, AC-6604.5, AC-6604.6
- REQ: REQ-6604
- Files: src/lib/forms/logoColors.ts, src/lib/forms/logoColors.test.ts, src/lib/forms/layout.ts, src/lib/forms/layout.test.ts, src/lib/forms/guideLayout.ts, src/lib/forms/guideLayout.test.ts, src/lib/forms/png.ts, src/lib/forms/png.test.ts, src/lib/forms/guide.ts, src/lib/forms/guide.test.ts, src/components/forms/guideColors.ts, src/components/forms/guidePictures.tsx, src/components/forms/Poster.tsx, src/components/forms/Poster.test.tsx, src/components/forms/GuidePoster.tsx, src/components/forms/GuidePoster.test.tsx, src/components/forms/GuideEditor.tsx, src/components/forms/GuideWorkspace.tsx, src/components/forms/GuideWorkspace.test.tsx, src/components/forms/guideState.ts, src/components/forms/guideState.test.ts, src/components/forms/FormsScreen.tsx, src/components/forms/FormsScreen.test.tsx, src/components/forms/PreviewPanel.tsx
- Tests: src/lib/forms/logoColors.test.ts, src/lib/forms/layout.test.ts, src/lib/forms/guideLayout.test.ts, src/lib/forms/png.test.ts, src/lib/forms/guide.test.ts, src/components/forms/Poster.test.tsx, src/components/forms/GuidePoster.test.tsx, src/components/forms/GuideWorkspace.test.tsx, src/components/forms/guideState.test.ts, src/components/forms/FormsScreen.test.tsx, src/lib/forms/assets.test.ts, src/lib/forms/themes.test.ts
- TDD: required — design.md 6절. `public/poster/logo.png`는 지우지 않는다(`assets.test.ts` 그대로 통과). 색 글자(#…)는 `components/forms/guideColors.ts`와 계산 결과에만(`themes.test.ts` 울타리 그대로 통과). 옛 안내문(colors 없음)도 읽힘

## TASK-10: 문자 문구 채우기
- Phase: 2
- AC: AC-6605.1, AC-6605.2
- REQ: REQ-6605
- Files: src/lib/patientMessages/fill.ts, src/lib/patientMessages/fill.test.ts, src/components/patients/MessagesTool.tsx, src/components/patients/MessagesTool.test.tsx, src/components/patients/FollowupTool.tsx, src/components/patients/FollowupTool.test.tsx, src/components/patients/RecallTool.tsx, src/components/patients/RecallTool.test.tsx, src/components/patients/ReservationTool.tsx, src/components/patients/ReservationTool.test.tsx, src/components/patients/PatientsScreen.tsx, src/components/patients/PatientsScreen.test.tsx
- Tests: src/lib/patientMessages/fill.test.ts, src/components/patients/MessagesTool.test.tsx, src/components/patients/FollowupTool.test.tsx, src/components/patients/RecallTool.test.tsx, src/components/patients/ReservationTool.test.tsx, src/components/patients/PatientsScreen.test.tsx
- TDD: required — design.md 7절. `DEFAULT_TEMPLATES`·저장된 문구 글은 그대로, 미리보기·복사 때만 바꾼다. `components/patients/rows`는 고치지 않는다

## TASK-11: 통계·대시보드·AI가 병원 정보를 씀
- Phase: 2
- AC: AC-6606.1, AC-6606.2, AC-6606.3, AC-6606.4
- REQ: REQ-6606
- Files: src/lib/analytics/visitHours.ts, src/lib/analytics/visitHours.test.ts, src/lib/analytics/holidayEffect.ts, src/lib/analytics/holidayEffect.test.ts, src/components/stats/sections/VisitHoursSection.tsx, src/components/stats/sections/VisitHoursSection.test.tsx, src/components/stats/sections/HolidaySection.tsx, src/components/stats/sections/HolidaySection.test.tsx, src/components/stats/sections/ReportSection.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/revenueView.ts, src/components/stats/revenueView.test.ts, src/components/dashboard/summary/DailySection.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/ai/AiBrief.tsx, src/components/dashboard/ai/AiBrief.test.tsx, src/components/ai-report/ReportBody.tsx, src/components/ai-report/ReportBody.test.tsx, src/lib/ai/prompt.ts, src/lib/ai/prompt.test.ts, src/app/api/ai/store.ts, src/app/api/ai/store.test.ts, src/app/api/ai/generate.ts, src/app/api/ai/generate.test.ts
- Tests: src/lib/analytics/visitHours.test.ts, src/lib/analytics/holidayEffect.test.ts, src/components/stats/sections/VisitHoursSection.test.tsx, src/components/stats/sections/HolidaySection.test.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/revenueView.test.ts, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/ai/AiBrief.test.tsx, src/components/ai-report/ReportBody.test.tsx, src/lib/ai/prompt.test.ts, src/app/api/ai/store.test.ts, src/app/api/ai/generate.test.ts
- TDD: required — design.md 8절. `lib/analytics`는 형·값만 받는다(병원 정보는 화면 부품이 `useClinicProfile`로 읽어 넘김). Worker·저장 모양·`validate.ts`·`lib/ai/input.ts`·`output.ts` 이름표는 그대로. AI 호칭은 서버가 RLS 세션으로 읽고 세 가지 밖이면 '원장님', `PROMPT_VERSION` 하나 올림

## TASK-12: 청구 Worker 잇기
- Phase: 2
- AC: AC-6608.2, AC-6608.3, AC-6609.1, AC-6611.2
- REQ: REQ-6608, REQ-6609, REQ-6611
- Files: src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/types/precheck.ts
- Tests: src/workers/precheck/jobs.test.ts
- TDD: required — design.md 10절(`drugRoles(month.catalog, tables.drugInfo, phrases.CODEMAP)`를 `runRules` 넷째 값과 `memoViews`의 `tables.roles`로), 11절(`tables.cartilageNames` = 처방 목록에서 역할 cartilage인 줄 이름), 13절(승인 값 'append' → 항목 `appends` = 화면에서 본 비트 메모, `replaces`와 함께 보내지 않음)

## TASK-13: 청구 화면 — 입력 방식 기억·뒤에 붙이기·잠금 링크
- Phase: 3
- AC: AC-6607.4, AC-6610.1, AC-6610.2, AC-6611.1
- REQ: REQ-6607, REQ-6610, REQ-6611
- Files: src/components/claim/ClaimScreen.tsx, src/components/claim/ClaimScreen.test.tsx, src/components/claim/memo/MemoPanel.tsx, src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/memo/InputMode.tsx, src/components/claim/memo/InputMode.test.tsx, src/components/claim/rows/MemoDetail.tsx, src/components/claim/rows/MemoDetail.test.tsx, src/components/claim/rows/leftGroups.ts
- Tests: src/components/claim/ClaimScreen.test.tsx, src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/memo/InputMode.test.tsx, src/components/claim/rows/MemoDetail.test.tsx
- TDD: required — design.md 9절(잠금 칸 [설정으로 가기]), 12절(ClaimScreen이 읽고 저장, `defaultSelection(visible, savedMode?)`), 13절([뒤에 붙이기]·'메모 뒤에 붙임'·`APPEND_HELPER` 미만이면 감춤). `components/claim/rows`는 네트워크·저장소를 쓰지 않는다

## TASK-14: 설정 병원 문구 화면 — 잠금 풀기·역할·차트 줄임말·숨은 칸
- Phase: 3
- AC: AC-6607.1, AC-6607.2, AC-6608.5, AC-6612.1, AC-6613.1, AC-6613.2, AC-6613.3
- REQ: REQ-6607, REQ-6608, REQ-6612, REQ-6613
- Files: src/components/settings/HospitalPhrases.tsx, src/components/settings/HospitalPhrases.test.tsx, src/components/settings/DxLinks.tsx, src/components/settings/DxLinks.test.tsx, src/components/settings/phrases/CodesTab.tsx, src/components/settings/phrases/CodesTab.test.tsx, src/components/settings/phrases/WordsTab.tsx, src/components/settings/phrases/WordsTab.test.tsx, src/components/settings/phrases/ReasonTab.tsx, src/components/settings/phrases/ReasonTab.test.tsx, src/components/settings/phrases/ProcTab.tsx, src/components/settings/phrases/ProcTab.test.tsx, src/components/settings/phrases/saveDiffRows.ts, src/components/settings/phrases/saveDiffRows.test.ts
- Tests: src/components/settings/HospitalPhrases.test.tsx, src/components/settings/DxLinks.test.tsx, src/components/settings/phrases/CodesTab.test.tsx, src/components/settings/phrases/WordsTab.test.tsx, src/components/settings/phrases/ReasonTab.test.tsx, src/components/settings/phrases/ProcTab.test.tsx, src/components/settings/phrases/saveDiffRows.test.ts
- TDD: required — design.md 9절(잠금 칸 두 단추, [처음 질문 하기]·[처음 질문 다시 하기]는 `/settings/first-run` 링크), 10절 설정(역할 고르기), 14절(WordsTab), 15절(숨은 칸, 흐린 기본 글은 `engineDefaults.ts`). 옛 AC-018.18 시험은 새 동작으로 고치고 이름에 AC-6607.x를 더한다

## TASK-15: 처음 질문 화면
- Phase: 3
- AC: AC-6614.1, AC-6614.2, AC-6614.4, AC-6614.5, AC-6614.6, AC-6614.8
- REQ: REQ-6614
- Files: src/app/(app)/settings/first-run/page.tsx, src/app/(app)/settings/first-run/page.test.tsx, src/components/settings/firstRun/FirstRunScreen.tsx, src/components/settings/firstRun/FirstRunScreen.test.tsx, src/components/settings/firstRun/QuestionPage.tsx, src/components/settings/firstRun/ExampleAside.tsx, src/components/settings/firstRun/ConfirmPage.tsx, src/components/settings/firstRun/paste/PasteBox.tsx, src/components/settings/firstRun/paste/PasteBox.test.tsx, eslint.config.mjs, src/guardrails.test.ts
- Tests: src/app/(app)/settings/first-run/page.test.tsx, src/components/settings/firstRun/FirstRunScreen.test.tsx, src/components/settings/firstRun/paste/PasteBox.test.tsx, src/guardrails.test.ts
- TDD: required — design.md 16절 화면. 울타리는 **더하기만** 한다(`firstRun/paste`에 네트워크·저장소·console·supabase 금지, guardrails 시험이 증명). 붙인 글이 요청·저장소·console로 가지 않음을 시험으로 본다. 저장은 TASK-2·5·6 함수 그대로
