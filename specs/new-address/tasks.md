# 작업: 새 주소 n-medi.vercel.app (new-address)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> C# 시험은 감싸개(`*.dotnet.test.ts`)로 부른다.

## TASK-1: 확장 0.4.0·명령 표 새 주소
- Phase: 1
- AC: AC-6401.1, AC-6401.2, AC-6402.1
- REQ: REQ-6401, REQ-6402
- Files: src/lib/bridge/commands.json, extension/manifest.json, extension/src/relay.ts, extension/src/relay.test.ts, extension/src/manifest.test.ts, extension/src/background.test.ts, helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs, helper/tests/protocol.dotnet.test.ts
- Tests: extension/src/relay.test.ts, extension/src/manifest.test.ts, helper/tests/protocol.dotnet.test.ts
- TDD: required
