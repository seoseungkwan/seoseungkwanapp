# 작업 분할: 신환은 비트 접수 표시로 세기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> Phase 1의 TASK-1(도우미)·TASK-2(웹)는 겹치는 파일이 없어 동시에 한다. Phase 2는 둘을 합친 뒤.

# Phase 1

## TASK-1: 도우미 — 접수 줄 신환 표시 칸(v5)·매출·보고·수납일지 신환
- REQ: REQ-001, REQ-003, REQ-004
- Files: helper/src/Precheck.Core/Stats/StatsSql.cs, helper/src/Precheck.Core/Stats/StatsRows.cs, helper/src/Precheck.Core/Stats/StatsPayload.cs, helper/src/Precheck.Core/Revenue/RevenueSql.cs, helper/src/Precheck.Core/Sunap/SunapSql.cs, helper/src/Precheck.Core/Sunap/SunapTargets.cs, helper/tests/Precheck.Core.Tests/Stats/*.test.cs, helper/tests/Precheck.Core.Tests/Revenue/*.test.cs, helper/tests/Precheck.Core.Tests/Sunap/*.test.cs, helper/tests/Precheck.Core.Tests/Bit/*.test.cs, helper/tests/stats-rows.dotnet.test.ts, helper/tests/stats-report.dotnet.test.ts, helper/tests/revenue-read.dotnet.test.ts, helper/tests/input-wiring.dotnet.test.ts
- Tests: helper/tests/Precheck.Core.Tests/Stats/StatsRows.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsSql.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueSql.test.cs, helper/tests/Precheck.Core.Tests/Sunap/SunapTargets.test.cs
- TDD: required

## TASK-2: 웹 Worker — v5 답이면 신환 날로 세기
- REQ: REQ-002
- Files: src/workers/stats/helperData.ts, src/workers/stats/jobs.ts, src/workers/stats/*.test.ts
- Tests: src/workers/stats/helperData.test.ts, src/workers/stats/jobs.test.ts
- TDD: required

# Phase 2

## TASK-3: 도우미 판 0.11.0
- REQ: REQ-001
- Files: helper/Directory.Build.props, helper/tests/Precheck.Core.Tests/Revenue/RevenueCommands.test.cs, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts
- Tests: helper/tests/Precheck.Core.Tests/Revenue/RevenueCommands.test.cs, src/lib/bridge/handshake.test.ts
- TDD: exempt (판 숫자만 올리는 설정. 판을 못 박은 지금 시험 두 곳의 숫자만 같이 바꾼다)
