# 작업 분할: 수납일지 건강생활유지비는 미수 아님(0원)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.

## TASK-1: 도우미 미수에서 QCV 빼기·판 0.9.1
- Phase: 1
- AC: AC-5401.1, AC-5401.2, AC-5401.3
- REQ: REQ-5401
- Files: helper/src/Precheck.Core/Sunap/SunapSql.cs, helper/src/Precheck.Core/Sunap/SunapTargets.cs, helper/tests/Precheck.Core.Tests/Sunap/SunapTargets.test.cs, helper/tests/sunap-read.dotnet.test.ts, helper/Directory.Build.props, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, helper/tests/input-wiring.dotnet.test.ts, helper/tests/Precheck.Core.Tests/Revenue/RevenueCommands.test.cs
- Tests: helper/tests/sunap-read.dotnet.test.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, helper/tests/input-wiring.dotnet.test.ts
- TDD: required
