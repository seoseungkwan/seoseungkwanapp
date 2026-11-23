# 작업 분할: ERP 도우미: 비트 설치 위치 상관없이 찾기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> **할 순서** (사용자 "Phase별로 step, 병렬로 할 수 있는 건 병렬, 검토는 마지막 한 번"):
> - Phase 1 — TASK-1 하나(일꾼 하나)
> - Phase 2 — 리드가 마지막 검사(ERP 도우미 시험 전체·확장 시험 전체·`helper-erp` Release net48 빌드·`git diff 6754571c -- helper src extension` 비어 있음) → 도우미 설치 파일 다시 → 마지막 검토 한 번

## TASK-1: ERP 도우미 비트 찾기를 위치와 상관없이
- REQ: REQ-3801
- AC: AC-3801.1, AC-3801.2, AC-3801.3, AC-3801.4
- Files: helper-erp/src/Erp.Core/ErpInstallRules.cs, helper-erp/src/Erp.Helper/ErpInstallationLocator.cs, helper-erp/src/Erp.Helper/ErpServices.cs, helper-erp/tests/Erp.Core.Tests/ErpInstallRules.test.cs, helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-helper.test.ts
- Tests: helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-helper.test.ts
- TDD: required
  - AC-3801.1·3801.2: C# 시험 `ErpInstallRulesTests`(namespace `Erp.Core.Tests`, 기존 필터 `Erp.Core.Tests.Erp`에 들어감)
    - 가짜 파일 모양은 기존 `Precheck.Core.Tests.Bit`의 가짜를 쓴다.
    - 고르는 예: `C:\DrBIT50`·`D:\DrBIT50`·`C:\DrBIT`·`E:\병원 프로그램\DrBIT50`, 실행 파일 경로 후보, 대소문자·끝 `\` 다름
    - 거절 예: UNC·네트워크 드라이브·상대 경로·빈 값·파일 하나 빠짐·환경 파일 없음·`Path` 다름·`Bin` 다름
    - 앞 후보가 거절되면 다음 후보, 같은 root는 한 번, 없으면 `E-BIT-NOT-FOUND`
    - 시험 이름은 `AC-3801.1 …`·`AC-3801.2 …`로 시작한다.
    - `erp-core.dotnet.test.ts`에 `expectAc('AC-3801.1')`·`expectAc('AC-3801.2')` 감싸개 `it`을 더한다.
  - AC-3801.3: `erp-helper.test.ts` 글자 시험
    - `ErpServices.Create` 줄이 `new ErpInstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store))`다. 기존 AC-3611.3 시험의 그 한 줄 기대값도 이것으로 바꾼다(까닭: 이 명세).
    - `ErpInstallationLocator`는 `IBitLocator`이고, `Find`가 `ErpInstallRules.Choose(candidates.FindCandidates(), probe, NativeEnvironmentGuard.SystemDrive())`다.
    - `helper-erp/src` 안에 `InstallationLocator(...).Find`·`BitInstallRules.Choose`를 부르는 곳이 없다.
  - AC-3801.4: `erp-helper.test.ts`
    - `git diff --quiet 6754571c -- helper src extension`가 0으로 끝난다(`node:child_process`).
    - `helper-erp/Directory.Build.props`의 판이 `0.3.0`이다.
    - 기존 `BitInstallRules.SupportedRoot`가 그대로 `C:\DrBIT50`이다(글자).
- 차례: Phase 1
