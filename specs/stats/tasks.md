# 작업 분할: 통계 탭 (비트 PC 자료 읽기 · 저장 · 통계 화면)

> 형식: `## TASK-n: 제목` 아래에 `- Step:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. TASK 번호 = REQ 번호 − 500이다. 이 순서대로 한다. 한 TASK = 한 step(`phases/stats-<n>-<slug>/stepM.md`).
> 승인은 이 명세 하나로 한 번 받는다. Phase가 끝날 때마다 `verify`·쉬운 말 보고(화면 Phase는 PC·휴대폰 화면 캡처). 합치기(merge)·운영 배포·도우미 릴리스 태그(`helper-v*`)·실제 Supabase에 SQL 붙이기는 사용자가 그때마다 말할 때만 한다.
> 화면 TASK(13~16)는 TASK-12의 목업을 사용자가 승인한 뒤에만 시작한다(CLAUDE.md). 화면은 b2b 공통 모양 `ds`와 토큰만 쓴다.
> 도우미 C# 시험 파일 이름은 `*.test.cs`이고, 하네스 TDD 기록은 vitest 감싸개 `helper/tests/*.dotnet.test.ts`(`runDotnet('<시험 이름공간>')`)로 남긴다(청구와 같은 방식).
> 원본(양지바른)은 저장소 밖 `YANGJI_SRC`(`seoseungkwan/shared@2a1069b`의 `YangjiBareun_사전점검/`)로만 받는다. 원본 파일은 커밋하지 않고, 옮긴 코드·SQL 문장 사본·골든 결과만 커밋한다.

## Phase 1 · 계산 더하기와 자료 길 (`phases/stats-1-data`)

## TASK-1: 신환 30일 재방문 세기
- Step: Phase 1 · Step 0 · `revisit-30`
- AC: AC-501.1~AC-501.5
- REQ: REQ-501
- Files: src/lib/analytics/aggregate.ts, src/lib/analytics/aggregate.test.ts, src/lib/analytics/compare.ts, src/lib/analytics/compare.test.ts, src/types/analysis.ts, src/workers/analyzeFiles.test.ts
- Tests: src/lib/analytics/aggregate.test.ts, src/lib/analytics/compare.test.ts, src/workers/analyzeFiles.test.ts
- TDD: required
- `analyzeFiles.test.ts`는 기대값에 `within30`·`rate30`이 필요할 때만 그 칸을 더한다

## TASK-2: 저장 모양에 30일 재방문 더하기
- Step: Phase 1 · Step 1 · `payload-revisit30`
- AC: AC-502.1~AC-502.3
- REQ: REQ-502
- Files: src/types/payload.ts, src/lib/payload/toMonthPayload.ts, src/lib/payload/toDayPayloads.ts, src/lib/payload/validate.ts, src/lib/payload/toMonthPayload.test.ts, src/lib/payload/toDayPayloads.test.ts, src/lib/payload/validate.test.ts
- Tests: src/lib/payload/validate.test.ts, src/lib/payload/toMonthPayload.test.ts, src/lib/payload/toDayPayloads.test.ts
- TDD: required
- `within30`·`after30`은 타입·검사에서 선택 칸이다. 그래서 payload 밖 시험(history·대시보드·`feat-ai-report`의 가짜 달 자료)은 한 글자도 고치지 않고 통과해야 한다(AC-502.3, cross-branch C6). 대시보드 소스 파일은 고치지 않는다(30일 줄은 TASK-16)

## TASK-3: 도우미 통계 줄 읽기 (`stats.rows`)
- Step: Phase 1 · Step 2 · `helper-stats-rows`
- AC: AC-503.1~AC-503.4
- REQ: REQ-503
- Files: helper/src/Precheck.Core/Stats/*, helper/src/Precheck.Core/Bit/Sql.cs, helper/src/Precheck.Helper/Program.cs, helper/tests/Precheck.Core.Tests/Stats/*, helper/tests/Precheck.Core.Tests/Stats/original-sql/*, helper/tests/stats-rows.dotnet.test.ts
- Tests: helper/tests/stats-rows.dotnet.test.ts
- TDD: required
- `Sql.cs`는 `IsAllowed`·`ParametersOf`가 `StatsSql`도 보게 하는 두 줄만 고친다. `Sql.All`·청구 SQL 상수·`ReadOnlyGuard.cs`·`SqlBitDb.cs`·`Commands/*`는 고치지 않는다
- 의원 PC 시험은 화면이 생기는 Phase 4 끝에 함께 한다(새 도우미 zip이 필요하다. 도우미 빌드는 지금 Actions 그대로)

## TASK-4: 도우미 보고 숫자 읽기
- Step: Phase 1 · Step 3 · `helper-stats-report`
- AC: AC-504.1~AC-504.4
- REQ: REQ-504
- Files: helper/src/Precheck.Core/Stats/*, helper/tests/Precheck.Core.Tests/Stats/*, helper/tests/Precheck.Core.Tests/Stats/original-sql/*, helper/tests/stats-report.dotnet.test.ts
- Tests: helper/tests/stats-report.dotnet.test.ts
- TDD: required

## TASK-5: 통계 Worker (도우미 자료 → 저장 모양)
- Step: Phase 1 · Step 4 · `stats-worker`
- AC: AC-505.1~AC-505.7
- REQ: REQ-505
- Files: src/workers/stats.worker.ts, src/workers/stats/assemble.ts, src/workers/stats/assemble.test.ts, src/workers/stats/helperData.ts, src/workers/stats/helperData.test.ts, src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts, src/workers/statsClient.ts, src/workers/statsClient.test.ts, src/types/stats.ts, src/types/clinicReport.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/workers/stats/assemble.test.ts, src/workers/stats/helperData.test.ts, src/workers/stats/jobs.test.ts, src/workers/statsClient.test.ts, src/lib/errors.test.ts
- TDD: required
- `src/types/clinicReport.ts`는 보고 숫자 모양(`ClinicReportNumbers`)만 이 TASK에서 만든다. 글 만들기는 TASK-10. `src/types/report.ts`·`ReportNumbers`·`src/lib/report/*`는 `feat-ai-report` 몫이라 쓰지 않는다(C6)
- 오류 번호 `E-STATS-HISTORY`·`E-STATS-TOO-BIG`을 `types/errors.ts`·`lib/errors.ts` 끝에 더한다
- TASK-5는 이미 커밋되었다. 2026-11-01에 바뀐 AC-505.2(금액 6칸 음수 가능)는 이 TASK의 지금 Files 안(`helperData.ts`·`helperData.test.ts`)에서 뒤따라 고친다

## Phase 2 · 저장과 처방 추세 (`phases/stats-2-save`)

## TASK-6: 통계 숫자 저장 표 (DB)
- Step: Phase 2 · Step 0 · `stats-tables`
- AC: AC-506.1~AC-506.5
- REQ: REQ-506
- Files: supabase/migrations/20261101000200_stats.sql, supabase/stats-rls.test.ts, src/types/db.ts, docs/ARCHITECTURE.md
- Tests: supabase/stats-rls.test.ts
- TDD: required
- DB 바꿈 TASK다. 시험은 PGlite에서만 돈다. **실제 Supabase에 붙이는 일은 이 TASK가 하지 않는다** — Phase 2가 끝날 때 사용자에게 SQL 편집기 순서를 채팅으로 드리고 허락을 받는다
- `docs/ARCHITECTURE.md`는 DB 표의 통계 줄(`months`·`days` → `stats_months`·`stats_days`·`stats_coverage`, 칸·트리거)과 '데이터 흐름'의 통계 줄만 고친다
- `my_hospital_id()`는 cross-branch C1 글자 그대로다. 다른 브랜치가 먼저 만든 경우를 시험한다

## TASK-7: 통계 숫자 저장·읽기
- Step: Phase 2 · Step 1 · `stats-storage`
- AC: AC-507.1~AC-507.3
- REQ: REQ-507
- Files: src/lib/storage/stats.ts, src/lib/storage/stats.test.ts, eslint.config.mjs, src/guardrails.test.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/storage/stats.test.ts, src/guardrails.test.ts, src/lib/errors.test.ts
- TDD: required
- 오류 번호 `E-STATS-SAVE-FAILED`·`E-STATS-READ-FAILED`를 더한다(앞말 `E-STATS-`, cross-branch C3). 시험은 가짜 Supabase 클라이언트로(실제 Supabase에 붙지 않는다)

## TASK-8: 처방 추세
- Step: Phase 2 · Step 2 · `rx-trend`
- AC: AC-508.1~AC-508.5
- REQ: REQ-508
- Files: src/lib/analytics/rxTrend.ts, src/lib/analytics/rxTrend.test.ts, src/types/analysis.ts
- Tests: src/lib/analytics/rxTrend.test.ts
- TDD: required

## Phase 3 · 숫자와 글, 화면 목업 (`phases/stats-3-numbers`)

## TASK-9: 처방별 신환·재진 (골든 + Worker `split` 일)
- Step: Phase 3 · Step 0 · `rx-visit-split`
- AC: AC-509.1~AC-509.4
- REQ: REQ-509
- Files: src/lib/analytics/rxVisitSplit.ts, src/lib/analytics/rxVisitSplit.test.ts, scripts/stats/golden/rx_visit_split.py, fixtures/stats/golden/rx-visit-split-*.json, src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts, src/workers/stats.worker.ts, src/workers/statsClient.ts, src/workers/statsClient.test.ts, src/types/stats.ts
- Tests: src/lib/analytics/rxVisitSplit.test.ts, src/workers/stats/jobs.test.ts, src/workers/statsClient.test.ts
- TDD: required
- Worker 쪽은 `split` 일을 붙이는 것만 한다(TASK-5의 `load`는 고치지 않는다)

## TASK-10: 원장님 보고 문장 (골든)
- Step: Phase 3 · Step 1 · `report-text`
- AC: AC-510.1~AC-510.4
- REQ: REQ-510
- Files: src/lib/clinicReport/reportText.ts, src/lib/clinicReport/reportText.test.ts, src/types/clinicReport.ts, scripts/stats/golden/reports.py, fixtures/stats/golden/report-*.json
- Tests: src/lib/clinicReport/reportText.test.ts
- TDD: required

## TASK-11: 통계 화면 숫자
- Step: Phase 3 · Step 2 · `stats-view`
- AC: AC-511.1~AC-511.8
- REQ: REQ-511
- Files: src/components/stats/view.ts, src/components/stats/view.test.ts
- Tests: src/components/stats/view.test.ts
- TDD: required

## TASK-12: 통계 화면 클릭 목업 (사용자 승인)
- Step: Phase 3 · Step 3 · `stats-mockup`
- AC: AC-512.1~AC-512.2
- REQ: REQ-512
- Files: docs/mockups/stats/index.html, docs/mockups/stats/notes.md, docs/mockups/stats/gen.py, docs/mockups/stats/app.js
- TDD: exempt — 클릭 목업(눌러 볼 수 있는 시안, CLAUDE.md)과 메모만 만든다. 앱 코드가 없다
- 끝 조건: 온라인 시안 링크를 사용자에게 드리고 승인을 받는다. 승인 전에는 step을 `blocked`(사유: 목업 승인 대기)로 둔다. 승인 뒤 고칠 곳이 나오면 시안을 고치고 다시 묻는다. 승인본이 이 명세의 화면 AC와 다르면(차례·문구) AC-513.1의 '목업이 이긴다'를 따르고, 동작이 다르면 명세를 고쳐 다시 승인받는다
- 2026-11-01 목업 변경(30일 caption, '일부 기간' 표시, "비교할 수 없음")은 사용자 OK가 있어야 TASK-13~16을 시작한다. TASK-11까지는 이 OK를 기다리지 않는다

## Phase 4 · 화면 (`phases/stats-4-screen`)

## TASK-13: 통계 그래프 섹션
- Step: Phase 4 · Step 0 · `stats-sections`
- AC: AC-513.1~AC-513.11
- REQ: REQ-513
- Files: src/components/stats/sections/*, src/components/ui/classes.test.ts, src/components/charts/StackedBarChart.tsx, src/components/charts/StackedBarChart.test.tsx
- Tests: src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/sections/PatientTrendSection.test.tsx, src/components/stats/sections/RevisitSection.test.tsx, src/components/stats/sections/RxTrendSection.test.tsx, src/components/stats/sections/RxSplitSection.test.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/sections/WeekdaySection.test.tsx, src/components/stats/sections/DetailToggle.test.tsx, src/components/stats/sections/CopyButton.test.tsx, src/components/ui/classes.test.ts, src/components/charts/StackedBarChart.test.tsx
- TDD: required
- `classes.test.ts`는 `APP_DIRS`에 `'src/components/stats'` 한 줄만 더한다
- `StackedBarChart`는 선택 값 `comparison` 하나만 더한다(AC-513.2). 지금 시험은 고치지 않는다

## TASK-14: 통계 화면 (자료 고르기 · 기간 · 저장 · 휴대폰)
- Step: Phase 4 · Step 1 · `stats-screen`
- AC: AC-514.1~AC-514.10
- REQ: REQ-514
- Files: src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx, src/components/stats/SourcePicker.tsx, src/components/stats/SourcePicker.test.tsx, src/components/stats/useStatsData.ts, src/components/stats/useStatsData.test.ts, src/components/stats/useStatsWorker.ts, src/components/stats/useStatsWorker.test.ts
- Tests: src/components/stats/StatsScreen.test.tsx, src/components/stats/SourcePicker.test.tsx, src/components/stats/useStatsData.test.ts, src/components/stats/useStatsWorker.test.ts
- TDD: required
- 시험은 jsdom, 가짜 Worker·가짜 통로(`chrome.runtime`)·가짜 저장(`lib/storage/stats` mock — `readCoverage` 포함). `useBridge`(`components/claim/useBridge.ts`)는 불러 쓰기만 한다

## TASK-15: 통계 탭을 진짜 화면으로
- Step: Phase 4 · Step 2 · `stats-tab`
- AC: AC-515.1~AC-515.5
- REQ: REQ-515
- Files: src/app/(app)/stats/page.tsx, src/app/(app)/stats/page.test.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx
- Tests: src/app/(app)/stats/page.test.tsx, src/components/shell/shell.test.tsx, src/components/dashboard/briefing/features.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/common/notReadyFeatures.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx
- TDD: required
- 옛 시험은 통계 줄(href·ready·status·준비 중 목록·목차 옆 글)만 고친다. 개수는 숫자로 못 박지 않고 목록에서 센다(cross-branch C5). `titles.test.tsx`는 `/stats` 탭 이름 시험이 준비 중 자료를 가정할 때만 고친다

## TASK-16: 대시보드가 저장된 통계 숫자를 읽음
- Step: Phase 4 · Step 3 · `dashboard-source`
- AC: AC-516.1~AC-516.4
- REQ: REQ-516
- Files: src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/summary/source.ts, src/components/dashboard/summary/source.test.ts, src/components/dashboard/summary/view.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/summary/source.test.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx
- TDD: required
- `components/dashboard/briefing/*`는 고치지 않는다(AC-516.3)

## TASK-17: 개인정보 E2E (실제 Supabase)
- Step: Phase 4 · Step 4 · `stats-e2e`
- AC: AC-517.1~AC-517.3
- REQ: REQ-517
- Files: e2e/stats-privacy.spec.ts
- Tests: e2e/stats-privacy.spec.ts
- TDD: exempt — 시험만 더한다. 대상 코드(저장·화면·대시보드 읽기)는 TASK-7·14·16에서 단위 시험을 통과했으므로 구현할 것이 없어 RED 단계가 없다. 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다(커밋하지 않음, auth-live TASK-7~9와 같은 방식). 기다림: 사용자가 TASK-6 SQL을 실제 Supabase에 붙임 + 시험 계정(`.env.local`). 확인: `npm run e2e`
- Phase 4 끝(메인 세션): `verify` → PC·휴대폰 화면 캡처 → 쉬운 말 보고 → 의원 PC 시험 목록(새 도우미 zip 설치, [비트에서 불러오기], 지난달 숫자를 양지바른·비트 통계와 비교, 보고 문장을 양지바른 일일보고와 비교, 800일 불러오기 시간)
