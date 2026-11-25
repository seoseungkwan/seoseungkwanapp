# 작업 분할: ERP 도우미: 비트 설치 위치 상관없이 찾기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> **할 순서** (Phase 3은 2026-11-23 다른 병원 등록 실패 뒤 더함) (사용자 "Phase별로 step, 병렬로 할 수 있는 건 병렬, 검토는 마지막 한 번"):
> - Phase 1 — TASK-1 하나(일꾼 하나)
> - Phase 2 — Step 1: TASK-2(리드, TASK-1을 합친 뒤. 같은 시험 파일 `erp-helper.test.ts`를 고쳐서 차례로) → Step 2: 리드가 마지막 검사(ERP 도우미 시험 전체·확장 시험 전체·`helper-erp` Release net48 빌드·`git diff 6754571c -- helper src extension` 비어 있음) → 도우미 설치 파일 다시 → 마지막 검토 한 번

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

## TASK-2: 설치 시작 파일이 PATH와 상관없이 PowerShell을 부르고 실패하면 창을 열어 두기 (install.cmd)
- REQ: REQ-3802
- AC: AC-3802.1, AC-3802.2, AC-3802.3
- Files: helper-erp/install/install.cmd, helper-erp/tests/erp-helper.test.ts
- Tests: helper-erp/tests/erp-helper.test.ts
- TDD: required
  - 글자 시험 (AC-3802.1·3802.3)
    - 여섯 줄 모양이 design.md 그대로다.
    - 모두 ASCII다. `-EncodedCommand`·`goto`·`:라벨`이 없다.
    - 지금 AC-3611.5 '한 줄' 시험의 기대값은 이 모양으로 바꾼다(까닭: 이 명세).
  - 실행 시험 (윈도우에서만, `process.platform === 'win32'`, 다른 곳에서는 건너뜀 — AC-3802.2·3802.3)
    - 임시 폴더(이름에 한글·괄호·띄어쓰기·`&`)에 `install.cmd`를 둔다.
    - 탐색기에서 두 번 누를 때와 같은 따옴표로 실행한다: `cmd.exe /d /s /c ""<install.cmd 경로>""`(`windowsVerbatimArguments`, `windowsHide`, 입력 '', PATH = `C:\nowhere`). Node는 `.cmd`를 셸 없이 바로 켜지 못한다.
    - 가짜 `install.ps1` `exit 0` → 0·멈춤 없음, `exit 2` → 2·멈춤 없음, `exit 1` → 1·멈춤 있음, 글 틀림(`if ( {`) → 1·멈춤 있음, `exit 5` → 5·멈춤 있음, 없음 → 0·2 아님·멈춤 있음
    - `cmd /v:on`(지연 확장 켬)으로 `x!y (1)&b` 폴더에서 가짜 `exit 2` → 2·멈춤 없음
    - `git diff --quiet 6754571c -- helper-erp/install/uninstall.ps1 helper-erp/install/README.md`가 0으로 끝난다(`install.ps1`은 TASK-4가 REQ-3806으로 고친 뒤 이 목록에서 뺀다)
    - 실제 `install.ps1`은 돌리지 않는다. 멈춤 글은 '계속하려면' 또는 'Press any key'다.
- 차례: Phase 2 Step 1

## TASK-3: 비트 찾기 파일 두 개·환경 파일 자리·서버 이름 규칙 (Erp.Core)
- REQ: REQ-3803, REQ-3804
- AC: AC-3803.1, AC-3803.2, AC-3803.3, AC-3804.1, AC-3804.2
- Files: helper-erp/src/Erp.Core/ErpInstallRules.cs, helper-erp/src/Erp.Core/ErpServerRules.cs, helper-erp/tests/Erp.Core.Tests/ErpInstallRules.test.cs, helper-erp/tests/Erp.Core.Tests/ErpServerRules.test.cs, helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-helper.test.ts
- Tests: helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-helper.test.ts
- TDD: required
  - C# 시험(namespace `Erp.Core.Tests`, 이름 `AC-3803.n …`·`AC-3804.n …`), `erp-core.dotnet.test.ts`에 `expectAc` 감싸개
    - AC-3803.1: 두 DLL만 있는 폴더 고름, `BITUserLogIn.dll` 빠지면 아님, 통계 파일 둘만 있으면 아님, 실행 파일 경로·위로 4단계 고름·5단계는 아님, UNC·네트워크·상대·빈 값 null
    - AC-3803.2: `Choose`가 통계 파일 없는 설치를 고름(환경 파일 맞을 때). 기존 AC-3801 시험 가짜에 `BITUserLogIn.dll`을 더하고, 통계 파일이 빠지면 거절하던 기존 경우는 '골라짐'으로 바꾼다(까닭: 이 명세)
    - AC-3803.3: `D:\DrBIT50` 설치, 환경 파일이 D:에만 있고 D:를 가리킴 → 고름. C: 환경 파일이 C:를 가리키고 D: 파일은 D:를 가리킴 → D: 설치 거절. C: 환경 파일이 있는데 못 읽음(`FakeProbe.File(…)`만, `.Environment` 없음) + D: 파일은 맞음 → 거절(`E-BIT-NOT-FOUND`). 두 곳 다 없음 → 거절. C: 설치는 C: 파일만 봄. 기존 시험 '다른 드라이브에만 환경 파일이 있으면 없는 것과 같다'(D: 설치·D: 파일)는 '골라짐'으로 바꾼다(까닭: 이 명세). 읽는 차례는 design.md대로 '먼저 읽고, 못 읽었을 때 FileExists로 넘어갈지 정함'이다 — 기존 `Pc()` 시험과 `EnvironmentReads` 시험을 약하게 바꾸지 않는다
    - AC-3804.1: 받음 — `.`·이 PC 이름·`192.168.0.10\SQLEXPRESS`(풀지 않음: 풀이 함수가 불리면 실패)·`169.254.1.1`(풀지 않음), `SERVER\SQLEXPRESS`→192.168.0.5, `tcp:SERVER,1433`→10.0.0.2, `bit-db`→127.0.0.1, `fe80::1`·`fd00::1`·`::ffff:192.168.1.2`와 사설 IPv4 섞임, 카드 접두 `2001:db8:1::/64` 안의 `2001:db8:1::5`와 192.168.0.5 섞임, `tcp:fe80::1`(풀지 않음). 막음 — 풀이 결과에 공인 주소 하나 섞임(8.8.8.8), 공인만, 빈 목록, 풀이 예외, `np:SERVER`, 공인 숫자 주소 `8.8.8.8`(풀지 않음), 빈 이름·빈칸 든 이름·256자 이름, `100.64.0.1`, 카드 접두 밖 `2001:db8:2::5`, 카드 접두 길이 32 안의 주소, `tcp:2001:db8:2::5`(풀지 않음), 맨 `fe80::1`(`tcp:` 없음)
    - AC-3804.2: `Require`가 막을 때 `BitException` 번호 `E-BIT-DB-FAILED`, 받을 때 예외 없음
  - `erp-helper.test.ts` 글자 시험: `ErpInstallRules.FindRoot` 몸통 = `BitInstallRules.FindRoot` 몸통, `helper-erp/src` 안에 `BitInstallRules.FindRoot(`를 부르는 곳 없음
- 차례: Phase 3 Step 1 (리드)

## TASK-4: ERP 접속 부품·받은 파일 표시·등록 결과 알림 (Erp.Helper·install.ps1)
- REQ: REQ-3804, REQ-3805, REQ-3806
- AC: AC-3804.3, AC-3805.1, AC-3805.2, AC-3806.1, AC-3806.2, AC-3806.3, AC-3806.4
- Files: helper-erp/src/Erp.Helper/ErpReadOnlyConnection.cs, helper-erp/src/Erp.Helper/ErpVendorPreload.cs, helper-erp/src/Erp.Helper/ErpStage.cs, helper-erp/src/Erp.Helper/ErpInstallationLocator.cs, helper-erp/src/Erp.Helper/ErpBitDb.cs, helper-erp/src/Erp.Helper/Program.cs, helper-erp/install/install.ps1, helper-erp/tests/erp-helper.test.ts
- Tests: helper-erp/tests/erp-helper.test.ts
- TDD: required
  - AC-3804.3 글자 시험: `ErpBitConnector.Open` 몸통, `ErpReadOnlyConnection.Harden` 몸통 = 기존 `ReadOnlyConnection.Harden` 몸통(서버 검사 줄·`FailoverPartner` 줄·단계 줄만 다름), `Create`가 `Environment.MachineName`·`Dns.GetHostAddresses`·`NetworkInterface`, `helper-erp/src`에 `ReadOnlyConnection.Create`·`ReadOnlyConnection.Harden`·`PrivateServer.Require` 없음. 기존 AC-3611.4 '기존 ReadOnlyConnection.Create로 연다' 기대값은 이것으로 바꾼다(까닭: 이 명세)
  - AC-3805.1·3805.2 글자 시험: `ErpVendorPreload.Load` 차례(Prepare → RequiredFiles마다 UnsafeLoadFrom → 예외 바꾸기), `Create`에서 접속 글자 읽기 전에 부름, `UnsafeLoadFrom`은 이 파일에만, `loadFromRemoteSources` 없음
  - AC-3806.1·3806.2: `ErpStage` 상수·자리(Find 첫 줄, Create 첫 줄, 서버 검사 직전, Open 직전·뒤), `Register`의 두 catch에서 기록 뒤 쓰기, 쓰기는 try/catch, 저장·취소 길에는 쓰기 없음, ASCII
  - AC-3806.3: `install.ps1` 글자 — 출력 받기(`2>&1` 없음)·`$launchError`·`-cmatch` 두 줄·네 가지 글·단계 이름 다섯·'오류 번호: '·'이 창을 사진으로 찍어 보내 주세요.'·취소 덧줄·끝 번호 0·1·2 그대로. 기존 AC-3611.5 시험 중 등록 글 기대값은 이것으로 바꾼다(까닭: 이 명세). AC-3802.3 git diff 시험에서 `install.ps1`을 뺀다
  - AC-3806.4: (윈도우만) PowerShell 5.1로 `install.ps1` `Parser.ParseFile` 오류 0
- 차례: Phase 3 Step 2 (TASK-3 뒤, 리드) → 리드 마지막 검사(ERP 도우미·확장 시험 전체, Release net48 빌드, `git diff 6754571c -- helper src extension` 비어 있음) → 설치 파일 다시(`…20261123b`) → 마지막 검토 한 번

## TASK-5: 비트에 병원 범위가 여럿이어도 등록·확인 (Erp.Core·Erp.Helper)
- REQ: REQ-3807
- AC: AC-3807.1, AC-3807.2, AC-3807.3
- Files: helper-erp/src/Erp.Core/ErpHospital.cs, helper-erp/src/Erp.Core/Closing/ClosingCommands.cs, helper-erp/src/Erp.Helper/Program.cs, helper-erp/tests/Erp.Core.Tests/ErpHospital.test.cs, helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-helper.test.ts, helper-erp/tests/erp-closing.dotnet.test.ts
- Tests: helper-erp/tests/erp-core.dotnet.test.ts, helper-erp/tests/erp-helper.test.ts, helper-erp/tests/erp-closing.dotnet.test.ts
- TDD: required
  - AC-3807.1·3807.2: C# 시험(`ErpHospital.test.cs`, 기존 도우미 시험의 가짜 `Rig`·`FakeSession`·`Synthetic`을 씀) — 범위 하나·여럿(등록 범위 포함, 빈 값·NULL 줄 무시)이면 등록·통과, DB 안에 등록 범위가 없으면 막힘, 로그인 계정의 범위가 없거나 둘이면 막힘, 로그인 취소·[취소]·전 등록 프로필 ID·기관기호 확인·설치 위치 다름·등록 없음은 기존과 같음, 막히면 세션 닫힘
  - AC-3807.3: `erp-helper.test.ts`·`erp-core.dotnet.test.ts` 글자 시험 — 부르는 곳, `helper-erp/src`에 옛 부름 없음, `git diff a278577f -- helper src extension` 비어 있음. 옛 자리를 박아 둔 시험(`erp-helper.test.ts` AC-3611.3 `RegisterFlow.Run(`, `erp-core.dotnet.test.ts` AC-3708.1·`erp-closing.dotnet.test.ts` AC-3616.2 `HospitalGate.Open(`)은 기대 글자만 `ErpHospital.Register(`·`ErpHospital.Open(`으로 바꾼다(까닭: AC-3807.3)
- 차례: Phase 4 (리드 혼자, 2026-11-25) → 마지막 검사(ERP 도우미 시험 전체·확장 시험·`helper-erp` Release net48 빌드·`git diff a278577f -- helper src extension` 비어 있음) → 도우미 설치 파일 다시(`…20261125`) → 마지막 검토 한 번
