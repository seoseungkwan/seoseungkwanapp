# 작업 분할: 비트 읽기 속도: 첫 내원 연결 조건 한 가지 바꾸기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.

## TASK-1: 첫 내원 연결 조건 글 바꾸기
- REQ: REQ-1001
- Files: helper/src/Precheck.Core/Stats/StatsSql.cs, helper/src/Precheck.Core/Revenue/RevenueSql.cs, helper/tests/Precheck.Core.Tests/Stats/StatsSql.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueSql.test.cs, helper/tests/Precheck.Core.Tests/BitReadSpeed/BitReadSpeedSql.test.cs, helper/tests/bit-read-speed.dotnet.test.ts, helper/tests/stats-rows.dotnet.test.ts, helper/tests/stats-report.dotnet.test.ts, helper/tests/revenue-read.dotnet.test.ts
- Tests: helper/tests/bit-read-speed.dotnet.test.ts
- TDD: required
