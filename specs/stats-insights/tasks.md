# 작업 분할: 통계 더 보기

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> Phase 1의 다섯 TASK는 파일이 겹치지 않는다(일꾼 2~3명씩). Phase 2·3·4는 차례로. 검토는 마지막 한 번.
> 2026-11-18 한 판으로 묶음: 같은 갈래의 new-mark Phase 1(helper Stats·helperData·jobs를 만짐)을 먼저 끝내고 합친 뒤 이 명세 Phase 1을 시작한다. TASK-5는 이미 v5인 답에 `extra.pays`를 더한다.

## TASK-1: 이번 달 목표 (표·저장·셈·칸)
- Phase: 1
- AC: AC-6102.1, AC-6102.2, AC-6102.3, AC-6102.4, AC-6102.5
- REQ: REQ-6102
- Files: supabase/migrations/20261118000000_stats_goals.sql, supabase/stats-goals.rls.test.ts, src/types/goals.ts, src/lib/storage/goals.ts, src/lib/storage/goals.test.ts, src/lib/analytics/goalPace.ts, src/lib/analytics/goalPace.test.ts, src/components/stats/useStatsGoals.ts, src/components/stats/useStatsGoals.test.ts, src/components/stats/sections/GoalSection.tsx, src/components/stats/sections/GoalSection.test.tsx, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: supabase/stats-goals.rls.test.ts, src/lib/storage/goals.test.ts, src/lib/analytics/goalPace.test.ts, src/components/stats/useStatsGoals.test.ts, src/components/stats/sections/GoalSection.test.tsx
- TDD: required

## TASK-2: 평소와 다른 것 · 휴일에 따라 (넓은 하루 읽기)
- Phase: 1
- AC: AC-6101.1, AC-6101.2, AC-6101.3, AC-6101.4, AC-6101.5, AC-6107.1, AC-6107.2, AC-6107.3
- REQ: REQ-6101, REQ-6107
- Files: src/lib/analytics/alerts.ts, src/lib/analytics/alerts.test.ts, src/lib/analytics/holidays.ts, src/lib/analytics/holidays.test.ts, src/lib/analytics/holidayEffect.ts, src/lib/analytics/holidayEffect.test.ts, src/components/stats/useWideDays.ts, src/components/stats/useWideDays.test.ts, src/components/stats/sections/AlertsSection.tsx, src/components/stats/sections/AlertsSection.test.tsx, src/components/stats/sections/HolidaySection.tsx, src/components/stats/sections/HolidaySection.test.tsx
- Tests: src/lib/analytics/alerts.test.ts, src/lib/analytics/holidays.test.ts, src/lib/analytics/holidayEffect.test.ts, src/components/stats/useWideDays.test.ts, src/components/stats/sections/AlertsSection.test.tsx, src/components/stats/sections/HolidaySection.test.tsx
- TDD: required

## TASK-3: 시행자별 다시 예약·12달 흐름 · 예약 빈자리
- Phase: 1
- AC: AC-6104.1, AC-6104.2, AC-6104.3, AC-6105.1, AC-6105.2, AC-6105.3
- REQ: REQ-6104, REQ-6105
- Files: src/types/calendar.ts, src/lib/storage/calendar.ts, src/lib/storage/calendar.test.ts, src/lib/calendar/rebook.ts, src/lib/calendar/rebook.test.ts, src/lib/calendar/occupancy.ts, src/lib/calendar/occupancy.test.ts, src/components/stats/useStatsCalendar.ts, src/components/stats/useStatsCalendar.test.ts, src/components/stats/sections/CalendarSection.tsx, src/components/stats/sections/CalendarSection.test.tsx, src/components/stats/sections/OccupancySection.tsx, src/components/stats/sections/OccupancySection.test.tsx
- Tests: src/lib/storage/calendar.test.ts, src/lib/calendar/rebook.test.ts, src/lib/calendar/occupancy.test.ts, src/components/stats/useStatsCalendar.test.ts, src/components/stats/sections/CalendarSection.test.tsx, src/components/stats/sections/OccupancySection.test.tsx
- TDD: required

## TASK-4: 몇 번까지 받나 (Worker 셈 · 처방 칸 탭)
- Phase: 1
- AC: AC-6103.1, AC-6103.2, AC-6103.3, AC-6103.4, AC-6103.5
- REQ: REQ-6103
- Files: src/lib/analytics/dropoff.ts, src/lib/analytics/dropoff.test.ts, src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts, src/types/stats.ts, src/components/stats/sections/DropoffSection.tsx, src/components/stats/sections/DropoffSection.test.tsx, src/components/stats/sections/RxSection.tsx, src/components/stats/sections/RxSection.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/lib/analytics/dropoff.test.ts, src/workers/stats/jobs.test.ts, src/components/stats/sections/DropoffSection.test.tsx, src/components/stats/sections/RxSection.test.tsx
- TDD: required

## TASK-5: 도우미 0.11.0 — 환자·날 금액 줄 (stats.rows v5)
- Phase: 1
- AC: AC-6106.1
- REQ: REQ-6106
- Files: helper/Directory.Build.props, helper/src/Precheck.Core/Stats/**, helper/tests/Precheck.Core.Tests/Stats/**, helper/tests/Precheck.Core.Tests/HelperStatsSpeed/**, helper/tests/stats-rows.dotnet.test.ts, helper/tests/helper-stats-speed.dotnet.test.ts, helper/tests/build.test.ts, helper/README.md, src/lib/bridge/versions.ts, src/lib/bridge/*.test.ts, helper/tests/input-wiring.dotnet.test.ts, helper/tests/Precheck.Core.Tests/Calendar/CalendarTargets.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueCommands.test.cs, helper/tests/Precheck.Core.Tests/Sunap/SunapTargets.test.cs
- Tests: helper/tests/stats-rows.dotnet.test.ts, src/lib/bridge/handshake.test.ts
- TDD: required

## TASK-6: 신환 1명당 매출 (Worker 읽기·셈 · 매출 칸 탭)
- Phase: 2
- AC: AC-6106.2, AC-6106.3, AC-6106.4, AC-6106.5
- REQ: REQ-6106
- Files: src/workers/stats/helperData.ts, src/workers/stats/helperData.test.ts, src/lib/analytics/patientValue.ts, src/lib/analytics/patientValue.test.ts, src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts, src/types/stats.ts, src/components/stats/sections/PatientValueSection.tsx, src/components/stats/sections/PatientValueSection.test.tsx, src/components/stats/sections/RevenueSection.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx, docs/ADR.md
- Tests: src/workers/stats/helperData.test.ts, src/lib/analytics/patientValue.test.ts, src/workers/stats/jobs.test.ts, src/components/stats/sections/PatientValueSection.test.tsx, src/components/stats/sections/RevenueSection.test.tsx
- TDD: required

## TASK-7: 요약·진료 운영 칸에 끼우기 (알림·목표·휴일)
- Phase: 3
- AC: AC-6101.5, AC-6102.4, AC-6102.5, AC-6107.3
- REQ: REQ-6101, REQ-6102, REQ-6107
- Files: src/components/stats/sections/StatsSections.tsx, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx, docs/UI_GUIDE.md
- Tests: src/components/stats/StatsScreen.test.tsx
- TDD: required

## TASK-8: 월간 보고서 인쇄
- Phase: 4
- AC: AC-6108.1, AC-6108.2, AC-6108.3
- REQ: REQ-6108
- Files: src/components/stats/report/**, src/components/stats/sections/ReportSection.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx, src/app/globals.css
- Tests: src/components/stats/report/reportData.test.ts, src/components/stats/report/MonthlyReport.test.tsx, src/components/stats/sections/ReportSection.test.tsx
- TDD: required
