# 작업 분할: 신환은 비트 접수 표시로 세기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> C# 시험(.test.cs)은 vitest가 직접 못 돌리므로 Tests 맨 앞에 그것을 부르는 감싸개(`*.dotnet.test.ts`)를 둔다.
> Phase 1의 TASK-1(도우미)·TASK-2(웹)·TASK-4(접수현황)는 겹치는 파일이 없어 동시에 한다.

# Phase 1

## TASK-1: 도우미 — 접수 줄 신환 표시 칸(v5)·매출·보고·수납일지 신환
- REQ: REQ-6201, REQ-6203, REQ-6204
- Files: helper/src/Precheck.Core/Stats/StatsSql.cs, helper/src/Precheck.Core/Stats/StatsRows.cs, helper/src/Precheck.Core/Stats/StatsPayload.cs, helper/src/Precheck.Core/Revenue/RevenueSql.cs, helper/src/Precheck.Core/Sunap/SunapSql.cs, helper/src/Precheck.Core/Sunap/SunapTargets.cs, helper/tests/Precheck.Core.Tests/Stats/*.test.cs, helper/tests/Precheck.Core.Tests/Revenue/*.test.cs, helper/tests/Precheck.Core.Tests/Sunap/*.test.cs, helper/tests/Precheck.Core.Tests/Bit/*.test.cs, helper/tests/stats-rows.dotnet.test.ts, helper/tests/stats-report.dotnet.test.ts, helper/tests/revenue-read.dotnet.test.ts, helper/tests/input-wiring.dotnet.test.ts
- Tests: helper/tests/stats-rows.dotnet.test.ts, helper/tests/revenue-read.dotnet.test.ts, helper/tests/sunap-read.dotnet.test.ts, helper/tests/Precheck.Core.Tests/Stats/StatsRows.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsSql.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueSql.test.cs, helper/tests/Precheck.Core.Tests/Sunap/SunapTargets.test.cs
- TDD: required

## TASK-2: 웹 Worker — v5 답이면 신환 날로 세기
- REQ: REQ-6202
- Files: src/workers/stats/helperData.ts, src/workers/stats/jobs.ts, src/workers/stats/*.test.ts
- Tests: src/workers/stats/helperData.test.ts, src/workers/stats/jobs.test.ts
- TDD: required

## TASK-4: 접수현황 도우미 — 신환 표시로 정보 글
- REQ: REQ-6205
- Files: helper/src/Precheck.Core/Reception/ReceptionSql.cs, helper/src/Precheck.Core/Reception/BoardInput.cs, helper/src/Precheck.Core/Reception/BoardReader.cs, helper/src/Precheck.Core/Reception/BoardBuilder.cs, helper/tests/Precheck.Core.Tests/Reception/*.test.cs
- Tests: helper/tests/reception-board.dotnet.test.ts, helper/tests/Precheck.Core.Tests/Reception/BoardBuilder.test.cs
- TDD: required
- 메모: 접수현황 갈래(feat-reception-other-clinic 또는 묶을 때의 가장 새 접수현황 갈래) 위에서 한다. TASK-1·2와 파일이 겹치지 않아 같은 Phase에서 동시에 한다.

> 판 숫자(0.11.0)는 stats-insights TASK-5가 올린다(한 판으로 묶음, design.md '한 판으로 묶기'). 이 명세의 Phase 1은 stats-insights Phase 1보다 먼저 끝내고 합친다.
