# Step 4: bit-connect

> **TASK-5** 비트 찾기 · 읽기 전용 접속 · 기관기호 · **REQ-005** · AC-005.1 ~ AC-005.7
> Phase 1 `precheck-1-helper` · Step 4 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-5 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-005에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-005.1**: 가짜 설치 후보(앱 폴더·레지스트리 값·기본 폴더)와 가짜 파일 모양으로 원본 `InstallationLocator`·`NativeEnvironmentGuard`와 같은 규칙으로 고른다: UNC·상대 경로 거절, `ini\BITSTATISTICS.Xml`·`EXE\BITDataBaseCommon.dll`·`EXE\BITStatistics.exe`가 모두 있는 곳, 환경 파일의 `Path`·`Bin`과 일치, 지원 위치 `C:\DrBIT50`. 못 찾으면 `E-BIT-NOT-FOUND`
- **AC-005.2**: DB 서버 이름은 원본 `CheckPrivateServer`처럼 `.`·`(local)`·`localhost`·이 PC 이름·사설 IPv4(`tcp:` 앞붙임 허용)만, 그 밖은 `E-BIT-DB-FAILED`. 접속은 `ConnectTimeout=10`
- **AC-005.3**: 도우미가 돌리는 SQL은 `ReadOnlyGuard`를 거쳐 `Sql.cs`에 정해 둔 상수만 매개변수와 함께, 끝내지 않는(되돌리는) 트랜잭션 안에서 읽는다(원본 그대로). 정해 둔 것 밖의 SQL 글자는 돌리지 않는다
- **AC-005.4**: 원본 `ValidateScope`·`ValidateInstitutionNumbers`처럼 범위가 정확히 하나이고 모든 기관기호가 8자리 숫자이며 등록한 것과 같을 때만 통과(원본 시험 사례를 옮긴다)
- **AC-005.5**: 처음 등록(`bit.register`): 비트 로그인 → PC 확인 창 [확인] → 병원 이름·기관기호·범위·설치 위치·서버·DB 이름을 `registration.dat`(DPAPI)에 저장하고 `{registered: true}`. [취소]·창 닫기면 저장하지 않는다. 확인 창 글은 도우미가 비트에서 읽은 값으로만 만든다
- **AC-005.6**: 등록된 도우미는 읽기·입력 명령 전에 원본 `VerifyCurrentInstitution`처럼 오늘 날짜로 기관기호·범위를 다시 확인한다. 등록이 없으면 `E-BIT-NOT-REGISTERED`, 다르면 `E-BIT-HOSPITAL-MISMATCH`로 그 명령을 하지 않는다
- **AC-005.7**: `bit.check`: 단계별 결과 `steps`(비트 찾기·DB 읽기·등록 확인)를 `{name, ok, code?}`로, 등록됐으면 병원 이름과 기관기호도. 실패한 단계 뒤는 `ok: false`·`code: 'E-…'`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-005
- `/specs/precheck/design.md` — 2절 표(비트 설치 찾기·접속·기관기호 원본), 3절(`Bit/`·`Registration/`·`Precheck.Windows`), 9-1절(처음 등록과 매번 확인), 9-3절(등록 파일 위치·암호화), 16절(비트 DLL 위험)
- `/specs/precheck/tasks.md` — TASK-5 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `helper/src/Precheck.Core/Protocol/*`, `helper/src/Precheck.Helper/Program.cs` (Step 0: Dispatcher·처리기 등록)
  - `helper/tests/runDotnet.ts` (Step 0)
  - `.github/workflows/helper.yml` (Step 1·2: 여기 Windows 시험이 더해져 Actions에서 돈다)
  - `src/lib/bridge/commands.json` (`bit.check`·`bit.register` args)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `vendor/drbit_export/InstallationLocator.cs` (`FindCandidates`·`NormalizeAndValidate`)
  - `vendor/drbit_export/NativeEnvironmentGuard.cs` (`Validate`)
  - `vendor/drbit_export/ReadOnlyConnection.cs` (비트 DLL 접속 정보, 되돌리는 트랜잭션)
  - `vendor/drbit_export/HospitalSecurity.cs` (`CheckPrivateServer`·`ValidateScope`·`VerifyInstitutionNumber`·`ValidateInstitutionNumbers`·`VerifyCurrentInstitution` 139줄)
  - `vendor/drbit_export/HospitalSecurityTests.cs` (옮길 시험 사례)
  - `vendor/drbit_export/HospitalIdentity.cs` (`BITUserLogIn` `bitDisplayDialog` 비트 로그인 창)

## 승인된 목업 (도우미 창)

- 확인 창 모양은 목업 화면 5 '도우미 PC 확인 창'의 윈도우 창을 따른다(글만 등록용). 기관기호는 확인 창에서도 뒤 4자리를 가린다(design.md 9-1 "기관기호 1234****")
- 목업: https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (화면 5, `id="v-confirm"`). 이 서버 사본: `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html`. 사본이 없으면 `read_artifact`(slug `499cp2Sodph7jYJ4gX4exj`)
- 목업 숫자·병원 이름·기관기호는 예시다

## 수정 범위 (tasks.md TASK-5)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Bit/*`
  - `helper/src/Precheck.Core/Registration/*`
  - `helper/src/Precheck.Core/Store/IProtector.cs`
  - `helper/src/Precheck.Windows/Precheck.Windows.csproj`
  - `helper/src/Precheck.Windows/InstallationLocator.cs`
  - `helper/src/Precheck.Windows/NativeEnvironmentGuard.cs`
  - `helper/src/Precheck.Windows/ReadOnlyConnection.cs`
  - `helper/src/Precheck.Windows/VendorLogin.cs`
  - `helper/src/Precheck.Windows/SqlBitDb.cs`
  - `helper/src/Precheck.Windows/DpapiProtector.cs`
  - `helper/src/Precheck.Windows/ConfirmWindow.cs`
  - `helper/src/Precheck.Helper/Commands/*`
  - `helper/src/Precheck.Helper/Program.cs`
  - `helper/Precheck.sln`
  - `helper/tests/Precheck.Core.Tests/Bit/*`
  - `helper/tests/Precheck.Core.Tests/Registration/*`
  - `helper/tests/Precheck.Windows.Tests/Precheck.Windows.Tests.csproj`
  - `helper/tests/Precheck.Windows.Tests/Connect/*`
- Tests:
  - `helper/tests/bit-connect.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **비트는 읽기만**: `Sql.cs`에 정해 둔 SELECT 상수만 매개변수로 돌리고, 끝내지 않는(되돌리는) 트랜잭션 안에서 읽는다(원본 `ReadOnlyConnection` 그대로). SQL 글자를 이어 붙이지 않는다. 읽기·입력 명령 전에는 늘 등록 병원(기관기호·범위·설치 위치·서버·DB 이름)을 다시 확인한다 (AC-005.3·005.6)
- **PC 확인 창**: 비트에 쓰는 일(`bit.input`)과 처음 등록(`bit.register`)은 도우미가 띄우는 윈도우 창에서 사람이 [확인]을 눌러야만 시작한다. 창의 글은 도우미가 묶음·비트에서 직접 만든다(웹이 보낸 글을 보이지 않는다). [취소]·창 닫기·5분 지남이면 아무것도 하지 않는다 (ADR-016, design.md 9-1·9-4)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·FlaUI·DPAPI·WinForms 창·레지스트리)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. NuGet 판은 정확한 버전으로 고정한다(범위·`*` 없음). 비트 DLL은 함께 싣지 않고 의원 PC의 `C:\DrBIT50\EXE`에서 불러온다 (ADR-016, design.md 14절)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 환자 자료·메모·차트번호·이름·전화를 어디에도(기록·예외 메시지·창 제목) 쓰지 않는다 (AC-001.6)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)

## 작업

### 1. 나누기 원칙
- **규칙은 Core, 모으기는 Windows.** 후보 고르기·서버 이름 검사·범위·기관기호 검사·SQL 허용 목록·등록 파일 모양·확인 창 글 만들기는 `Precheck.Core`(리눅스 시험). 레지스트리·파일·비트 DLL·SqlConnection·DPAPI·WinForms는 `Precheck.Windows`에서 값을 모아 Core에 넘기기만 한다

### 2. Core (시그니처)
```csharp
namespace Precheck.Core.Bit {
  public interface IFileProbe { bool Exists(string path); string? ReadEnvValue(string file, string key); }
  public static class BitInstallRules {   // 원본 InstallationLocator + NativeEnvironmentGuard 규칙
    public static string Choose(IEnumerable<string> candidates, IFileProbe probe); // 못 찾으면 BitException("E-BIT-NOT-FOUND")
  }
  public static class PrivateServer { public static bool IsAllowed(string server, string machineName); } // 원본 CheckPrivateServer
  public static class Sql { public const string InstitutionSql = "…"; /* 원본 상수 그대로. 뒤 TASK가 더한다 */ }
  public static class ReadOnlyGuard { public static void Require(string sql); } // Sql 상수가 아니면 던진다
  public interface IBitDb { IReadOnlyList<IReadOnlyDictionary<string, object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout); }
  public static class HospitalCheck {   // 원본 ValidateScope · VerifyInstitutionNumber · ValidateInstitutionNumbers · VerifyCurrentInstitution
    public static void ValidateScope(...); public static void ValidateInstitutionNumbers(...);
    public static void VerifyCurrent(IBitDb db, Registration reg, DateTime today); // E-BIT-NOT-REGISTERED / E-BIT-HOSPITAL-MISMATCH
  }
}
namespace Precheck.Core.Registration {
  public sealed class Registration { HospitalName; InstitutionCode; Scope; InstallPath; Server; Database; ProfileId; }
  public static class RegistrationFile { byte[] Write(Registration r, IProtector p); Registration? Read(byte[] data, IProtector p); }
  public static class RegisterPrompt { public static string Build(Registration r); } // "이 병원으로 등록할까요? ○○의원 · 기관기호 1234****"
}
namespace Precheck.Core.Store { public interface IProtector { byte[] Protect(byte[] plain); byte[] Unprotect(byte[] cipher); } }
```
- 등록 파일도 머리 `PRECHECK-STORE-1\n` + 암호화로 쓴다(TASK-15 작업 저장과 같은 틀). `ProfileId`는 등록할 때 만든 무작위 값(TASK-15가 저장 파일의 병원 확인에 쓴다)
- SQL 문장은 원본에서 그대로 옮긴다. 원본 SQL 사본을 `helper/tests/Precheck.Core.Tests/Bit/original-sql/*.sql`에 두고 공백만 다른지 비교하는 시험을 둔다(design.md 10절)

### 3. Windows (net48, 얇게)
- `Precheck.Windows.csproj`(net48, 참조 어셈블리, WinForms). `Precheck.sln`에 이 프로젝트와 `Precheck.Windows.Tests`(net48, xUnit)를 더한다
- `InstallationLocator`: 후보(앱 폴더·레지스트리·`C:\DrBIT50`)를 모아 `BitInstallRules.Choose`. `NativeEnvironmentGuard`: 원본처럼 환경 파일 검사
- `ReadOnlyConnection`·`SqlBitDb`: 원본처럼 비트 DLL(`C:\DrBIT50\EXE\BITDataBaseCommon.dll`)에서 접속 정보를 얻고, `PrivateServer.IsAllowed` 뒤 `ConnectTimeout=10`으로 연다. 쿼리는 `ReadOnlyGuard.Require` → 매개변수 → 되돌리는 트랜잭션
- `VendorLogin`: 원본 `BITUserLogIn` `bitDisplayDialog`로 비트 로그인 창을 띄워 그 사용자의 병원 범위를 얻는다
- `DpapiProtector`: `ProtectedData.Protect(…, 고정 entropy, DataProtectionScope.CurrentUser)`
- `ConfirmWindow`: [확인]·[취소]가 있는 맨 위 WinForms 창. `Show(string text, TimeSpan timeout) → bool`. 5분 지나면 `false`. TASK-17이 입력 확인에도 쓴다

### 4. 명령 (`Precheck.Helper/Commands/`)
- `bit.check`: 단계 `find`(비트 찾기) → `db`(DB 읽기) → `registration`(등록 확인) 순서. 실패한 단계 뒤는 모두 `ok: false`와 그 번호. 등록됐으면 `hospitalName`·`institutionCode`(웹 화면이 뒤 4자리를 가린다)
- `bit.register`: 비트 로그인 → `ValidateScope` → `VerifyInstitutionNumber`(8자리) → `RegisterPrompt.Build`로 만든 글로 `ConfirmWindow` → [확인]일 때만 `registration.dat` 저장 → `{registered: true}`. [취소]·닫기·시간 지남 → `{registered: false}`, 저장 안 함
- 등록 확인 관문: 뒤 TASK의 모든 읽기·입력 명령이 처음에 부를 함수 하나(예: `Commands/RequireHospital.cs`)를 지금 만든다(AC-005.6)
- 저장 폴더는 `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data\`

### 5. 시험
- Core(`Bit/*.test.cs`·`Registration/*.test.cs`, 리눅스): 가짜 후보·가짜 파일(`IFileProbe`), 서버 이름 표, 원본 `HospitalSecurityTests.cs` 사례, `ReadOnlyGuard` 거절, 등록 파일 왕복(가짜 `IProtector`), 확인 창 글이 등록 값으로만 만들어짐·기관기호 가림, `bit.check` 단계 채우기(가짜 `IBitDb`)
- Windows(`Precheck.Windows.Tests/Connect/*.test.cs`): Actions 윈도우에서만 돈다. DPAPI 왕복, 가짜 폴더로 `InstallationLocator`. 실제 비트가 필요한 것은 의원 PC 시험으로 남긴다
- 감싸개 `bit-connect.dotnet.test.ts`: `runDotnet('Precheck.Core.Tests.Bit')`·`runDotnet('Precheck.Core.Tests.Registration')`, AC ID를 `it` 이름에

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(예: `helper/tests/Precheck.Core.Tests/Protocol/Framing.test.cs`, 하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-001.1 길이 0이면 E-HELPER-BAD-MESSAGE")]`
- 하네스 TDD 기록은 vitest 감싸개 `helper/tests/bit-connect.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 클래스나 이름공간>')`을 부르고, `it` 이름에도 AC ID를 넣는다. 감싸개 시험 시간 제한은 넉넉히(예: 300초) 준다
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Bit|FullyQualifiedName~Precheck.Core.Tests.Registration"
npx vitest run helper/tests/bit-connect.dotnet.test.ts        # AC-005.1~AC-005.7
npx vitest run helper/tests/protocol.dotnet.test.ts helper/tests/build.test.ts   # 앞 step 시험 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
# 윈도우 시험(Precheck.Windows.Tests)은 push 뒤 Actions helper 일에서 돈다 → summary에 [Actions 확인 남음]
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-005.1 ~ AC-005.7이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-1-helper/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `INSERT`·`UPDATE`·`DELETE`·`EXEC`나 `Sql.cs` 밖 SQL 글자를 돌리지 마라. 이유: 비트 DB는 읽기만 한다. 실수로도 진료 자료를 바꿀 길을 만들지 않는다(AC-005.3)
- SQL에 값을 글자로 이어 붙이지 마라. 이유: 매개변수만 쓴다. 이어 붙이면 SQL 주입 길이 생기고 허용 목록 검사가 무의미해진다
- 확인 창 글을 웹이 보낸 값으로 만들지 마라. 이유: 웹이 잘못되거나 누가 시켜도 사람이 PC에서 직접 본 비트 값으로 판단해야 한다(AC-005.5)
- 기관기호·병원 이름·차트번호를 진단 기록·예외 메시지에 넣지 마라. 이유: 기록은 시각·명령 이름·오류 번호만(AC-001.6)
- 비트 DLL을 저장소나 zip에 넣지 마라. 이유: 비트 회사 파일이다. 의원 PC의 설치 폴더에서 불러온다(design.md 14절)
- 기존 테스트를 깨뜨리지 마라. 이유: Step 0~3 시험(protocol·build·extension·bridge)이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- 의원 PC 시험(Phase 1, 메인 세션이 Phase 끝에 정리): 설치 → 연결 확인 → 비트 읽기 → 기관기호 확인
