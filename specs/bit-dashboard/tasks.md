# 작업 분할: 비트 연결하면 대시보드 숫자 자동 채움

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 원본 소스는 저장소 밖에서 읽기만 한다. 실제 환자 자료는 쓰지 않는다. 시험은 가짜 자료만 쓴다.

## TASK-1: 도우미 SQL 상수와 오류 번호
- REQ: REQ-001
- Files: helper/src/Precheck.Core/Stats/StatsSql.cs, helper/src/Precheck.Core/Bit/Sql.cs, helper/src/Precheck.Core/Bit/BitErrors.cs, helper/tests/Precheck.Core.Tests/Bit/original-sql/*, helper/tests/Precheck.Core.Tests/Bit/ReadOnlyGuard.test.cs, helper/tests/Precheck.Core.Tests/Precheck.Core.Tests.csproj, helper/tests/Precheck.Core.Tests/Stats/*, helper/tests/stats-read.dotnet.test.ts
- Tests: helper/tests/stats-read.dotnet.test.ts
- TDD: required

## TASK-2: 도우미 통계 답 만들기
- REQ: REQ-001
- Files: helper/src/Precheck.Core/Stats/StatsPayload.cs, helper/tests/Precheck.Core.Tests/Stats/*, helper/tests/stats-read.dotnet.test.ts
- Tests: helper/tests/stats-read.dotnet.test.ts
- TDD: required

## TASK-3: `stats.rows` 명령과 도우미 0.2.0
- REQ: REQ-001, REQ-005
- Files: helper/src/Precheck.Core/Stats/StatsCommands.cs, helper/src/Precheck.Helper/Program.cs, helper/Directory.Build.props, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts, helper/tests/Precheck.Core.Tests/Stats/*, helper/tests/stats-read.dotnet.test.ts, helper/tests/build.test.ts
- Tests: helper/tests/stats-read.dotnet.test.ts, src/lib/bridge/handshake.test.ts
- TDD: required

## TASK-4: 웹 오류 문구
- REQ: REQ-001, REQ-003, REQ-005
- Files: src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/errors.test.ts
- TDD: required

## TASK-5: Worker 계산
- REQ: REQ-002
- Files: src/workers/bitStats/assemble.ts, src/workers/bitStats/assemble.test.ts, src/workers/bitStats/toDays.ts, src/workers/bitStats/toDays.test.ts, src/workers/bitStats/handler.ts, src/workers/bitStats/handler.test.ts, src/workers/bitStats.worker.ts
- Tests: src/workers/bitStats/assemble.test.ts, src/workers/bitStats/toDays.test.ts, src/workers/bitStats/handler.test.ts
- TDD: required

## TASK-6: 비트 읽기 한 번 (`readBitDays`)
- REQ: REQ-003
- Files: src/components/dashboard/live/readBitDays.ts, src/components/dashboard/live/readBitDays.test.ts
- Tests: src/components/dashboard/live/readBitDays.test.ts
- TDD: required

## TASK-7: 대시보드 화면
- REQ: REQ-003, REQ-004
- Files: src/components/dashboard/live/DashboardLive.tsx, src/components/dashboard/live/DashboardLive.test.tsx, src/components/dashboard/live/ReadStatus.tsx, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/briefing/StickyConnect.tsx, src/components/dashboard/briefing/StickyConnect.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/live/DashboardLive.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/briefing/StickyConnect.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required

## TASK-8: 연결 끝나면 대시보드로
- REQ: REQ-004, REQ-005
- Files: src/app/(app)/claim/setup/page.tsx, src/app/(app)/claim/setup/page.test.tsx, src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/components/claim/setup/ReturnWhenReady.tsx, src/components/claim/setup/SetupAlert.tsx, src/components/claim/setup/StepGuide.tsx
- Tests: src/app/(app)/claim/setup/page.test.tsx, src/components/claim/setup/SetupScreen.test.tsx
- TDD: required

## TASK-9: 날짜 고르기
- REQ: REQ-006
- Files: src/components/dashboard/live/DateControl.tsx, src/components/dashboard/live/DateControl.test.tsx, src/components/dashboard/live/DashboardLive.tsx, src/components/dashboard/live/DashboardLive.test.tsx, src/components/dashboard/live/ReadStatus.tsx, src/components/dashboard/summary/view.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/ReportBlock.tsx, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx
- Tests: src/components/dashboard/live/DateControl.test.tsx, src/components/dashboard/live/DashboardLive.test.tsx, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx
- TDD: required
