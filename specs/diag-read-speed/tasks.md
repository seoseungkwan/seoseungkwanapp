# 작업 분할: 비트 읽기 속도 측정 (일회용)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 도우미 C# 시험 파일 이름은 `*.test.cs`, 하네스 TDD 기록은 `helper/tests/*.dotnet.test.ts` 감싸개로 남긴다(precheck·revenue와 같음). 가짜 자료만 쓴다.

## TASK-1: 측정 문장과 허용 목록
- REQ: REQ-802, REQ-807
- Files: helper/src/Precheck.Core/Diag/DiagSql.cs, helper/src/Precheck.Core/Diag/DiagLabels.cs, helper/src/Precheck.Core/Bit/Sql.cs, helper/tests/Precheck.Core.Tests/Precheck.Core.Tests.csproj, helper/tests/Precheck.Core.Tests/Diag/DiagSql.test.cs, helper/tests/diag-sql.dotnet.test.ts
- Tests: helper/tests/diag-sql.dotnet.test.ts
- TDD: required

## TASK-2: 보고서 쓰기·칸 거르기·진행 표시
- REQ: REQ-801, REQ-804, REQ-805, REQ-806
- Files: helper/src/Precheck.Core/Diag/DiagReport.cs, helper/src/Precheck.Core/Diag/DiagFormat.cs, helper/src/Precheck.Core/Diag/DiagProgress.cs, helper/src/Precheck.Core/Diag/DiagCommit.cs, helper/src/Precheck.Core/Diag/DiagReportPath.cs, helper/src/Precheck.Core/Precheck.Core.csproj, helper/tests/Precheck.Core.Tests/Diag/DiagReport.test.cs, helper/tests/diag-report.dotnet.test.ts
- Tests: helper/tests/diag-report.dotnet.test.ts
- TDD: required

## TASK-3: 측정 순서·시간 한도·제품 읽기 감싸개
- REQ: REQ-801, REQ-802, REQ-806, REQ-807
- Files: helper/src/Precheck.Core/Diag/DiagRunner.cs, helper/src/Precheck.Core/Diag/DiagBudget.cs, helper/src/Precheck.Core/Diag/IDiagSession.cs, helper/src/Precheck.Core/Diag/TimingBitDb.cs, helper/src/Precheck.Core/Diag/DiagStatementTable.cs, helper/tests/Precheck.Core.Tests/Diag/DiagRunner.test.cs, helper/tests/diag-runner.dotnet.test.ts
- Tests: helper/tests/diag-runner.dotnet.test.ts
- TDD: required

## TASK-4: 켜는 길(인자 분기·윈도우 부분·시작 파일)
- REQ: REQ-801, REQ-802, REQ-803, REQ-804, REQ-805, REQ-806
- Files: helper/src/Precheck.Core/Diag/DiagMode.cs, helper/src/Precheck.Helper/Program.cs, helper/src/Precheck.Windows/DiagBitDb.cs, helper/src/Precheck.Windows/DiagEntry.cs, helper/install/speed-check.cmd, helper/install/speed-check.ps1, helper/tests/Precheck.Core.Tests/Diag/DiagStart.test.cs, helper/tests/diag-start.dotnet.test.ts
- Tests: helper/tests/diag-start.dotnet.test.ts
- TDD: required
- 메모: `DiagBitDb`의 시계·Cancel(AC-806.1)과 `DiagEntry`의 45분 감시(AC-806.7)는 이 TASK에서 글자로 시험한다. 윈도우 부분 컴파일은 감싸개가 `buildDotnet`으로 본다(AC-804.5).
