# 작업 분할: 도우미 통계 읽기 속도 — 첫 내원 잇기 한 번만 계산 (도우미 0.5.1)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 차례: TASK-1 → TASK-2(파일이 겹치지 않음) → 전체 검사 → 이 PC 실측(design.md) → 마지막 검토 한 번. 깃허브 올리기·판 만들기는 사용자가 말할 때만.

## TASK-1: 세 문장의 첫 내원 잇기를 해시 잇기로
- REQ: REQ-3401
- AC: AC-3401.1, AC-3401.2, AC-3401.3, AC-3401.4
- Files: helper/src/Precheck.Core/Stats/StatsSql.cs, helper/tests/Precheck.Core.Tests/HelperStatsSpeed/HelperStatsSpeedSql.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsSql.test.cs, helper/tests/helper-stats-speed.dotnet.test.ts, src/components/dashboard/live/visitBasis.test.ts
- Tests: helper/tests/helper-stats-speed.dotnet.test.ts, src/components/dashboard/live/visitBasis.test.ts
- TDD: required

## TASK-2: 도우미 판 0.5.1
- REQ: REQ-3402
- AC: AC-3402.1, AC-3402.2
- Files: helper/Directory.Build.props, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, helper/tests/input-wiring.dotnet.test.ts
- Tests: src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, helper/tests/input-wiring.dotnet.test.ts
- TDD: required
