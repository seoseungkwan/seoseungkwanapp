# Step 5: helper-fixups

> **TASK-33** 도우미 마무리 · 병원 이름 빼기 · 32비트 빌드 · 읽기 전용 확인 · **REQ-005** · AC-005.8 ~ AC-005.12 (+ 바뀐 AC-005.5·AC-005.7)
> Phase 1 `precheck-1-helper` · Step 5 — TASK-5(Step 4) 뒤·TASK-6(Step 6) 앞. `docs/precheck/plan.md` §6에는 없는 후속 step이다(tasks.md 머리말의 예외)
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-33 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 왜 이 step이 있나

TASK-5를 만들며 찾은 빈틈 둘과 리뷰에서 나온 것 셋이다.

- **G1 빌드**: `Precheck.Helper.csproj`가 `Precheck.Windows`를 참조하지 않아 지금 `Precheck.Helper`가 빌드되지 않는다(`Commands/HelperServices.cs`의 `using Precheck.Windows`). 그리고 비트 DLL이 32비트라(원본 `tools/build_stats.ps1`의 `/platform:x86`) exe를 x86으로 만들어야 한다. AnyCPU net48 exe는 64비트 윈도우에서 64비트로 돌아 그 DLL을 불러오지 못한다
- **G2 병원 이름** (사용자 결정 2026-10-30 "사이트 이름 쓰기"): 비트에서 병원 이름을 읽는 원본 SQL이 없다(양지바른은 자기 프로필 파일에서 가져왔다). 지금 `RegisterFlow.cs`는 범위 값(`DepHspNum`)을 병원 이름 자리에 넣고 있다. 도우미는 병원 이름을 저장하지도 돌려주지도 않는다. 설치 화면(TASK-6, Step 6)이 사이트가 가진 병원 이름을 쓴다
- **리뷰에서 나온 것**: `SqlBitDb.cs` 읽기 전용 글자 시험, `registration.dat`의 깨진 파일 규칙을 design.md 9-3에 맞춤, 의원 PC 확인 목록에 `BITDataBaseCommon` 추상 클래스

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-005에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-005.8**: `Precheck.Helper.csproj`에 `<ProjectReference Include="../Precheck.Windows/Precheck.Windows.csproj" />`와 `<PlatformTarget>x86</PlatformTarget>`이 있고 `<Platform>`·`<Platforms>`는 없다. 이 서버에서 `dotnet build helper/src/Precheck.Helper/Precheck.Helper.csproj -c Release`가 통과해 `helper/src/Precheck.Helper/bin/Release/net48/`(helper.yml이 읽는 자리 그대로)에 `PrecheckHelper.exe`·`Precheck.Windows.dll`·`Precheck.Core.dll`이 생기고, exe의 CLR 머리 Flags에 `32BITREQUIRED`가 켜져 있다
- **AC-005.9**: 병원 이름이 도우미 어디에도 없다. `registration.dat` JSON 칸은 `version`·`profileId`·`institutionCode`·`scope`·`installPath`·`server`·`database`뿐, `bit.check` result 칸은 `steps`·`registered`·`institutionCode`(`registered: true`일 때만)뿐. 확인 창 글은 비트에서 읽은 등록 값(기관기호 뒤 4자리 가림·범위·설치 위치·서버·DB 이름)만, 다시 등록이면 전 값과 새 값을 함께. 범위 값 등을 이름 자리에 넣지 않는다
- **AC-005.10**: 웹 통로는 `bit.check` 답에 `hospitalName` 칸이 있으면(값이 무엇이든) `E-BRIDGE-BAD-REPLY`. `ResultOf<'bit.check'>`는 `{steps, registered, institutionCode?}`
- **AC-005.11**: `SqlBitDb.cs` 글자에 `Commit` 부름이 없고, `new SqlCommand(`는 모두 세션 트랜잭션을 인자로 받아 만든다. 예외는 트랜잭션을 열기 전 격리 수준만 보는 `Sql.SnapshotStateSql` 한 곳(원본 그대로)이고, 그것도 `ReadOnlyGuard.Require`를 먼저 지난다
- **AC-005.12**: `registration.dat`가 없으면 등록 없음(`E-BIT-NOT-REGISTERED`). 깨졌으면(머리·크기·풀기·JSON·칸) `.bak`이 맞을 때 깨진 파일은 지우지 않고 이름을 바꿔 두고 `.bak`으로 `registration.dat`를 되살려 그 값을 쓴다. `.bak`도 없거나 깨졌으면 `E-STORE-BROKEN`: `bit.check`는 `registered: false`·`registration` 단계(앞 단계가 통과했으면) `code: 'E-STORE-BROKEN'`, 읽기·입력 명령은 그 번호로 하지 않는다. 이때 `bit.register`는 처음 등록처럼(전 값 없이, 새 프로필 ID) 새로 등록할 수 있고, [확인]으로 저장할 때 깨진 `registration.dat`·`.bak`은 지우지 않고 먼저 이름을 바꿔 둔 뒤 새 파일을 쓴다
- **바뀐 AC-005.5·AC-005.7**: 등록 파일에 병원 이름을 저장하지 않고, `bit.check`는 등록됐으면 기관기호만 함께 준다. 이 문장과 AC-005.12에 맞게 앞 TASK 시험의 기대값을 고친다(시험을 약하게 하지 말고 새 모양으로 바꾼다):
  - 병원 이름(AC-005.5·005.7·005.9): `RegisterFlow.test.cs` 55줄 `saved.HospitalName`, `BitCheck.test.cs` 39·56·88·101~109줄, `RegistrationFile.test.cs` 25·31·39·43줄(`name: "가상의원"`·`read.HospitalName`), `RegisterPrompt.test.cs` 23·26·38·39·43·44줄(`name:`과 `"가상의원 · 기관기호 …"`), `Fakes.test.cs` 34줄(`Synthetic.Registration`의 `name` 인자), `Precheck.Windows.Tests/Connect/DpapiProtector.test.cs` 16줄(7개 인자 `new HospitalRegistration("SYNTHETIC", …)` → 이름 없는 6개, 고치지 않으면 컴파일이 깨진다), TASK-4 `client.test.ts`의 `CHECK.hospitalName`과 `hospitalName` 틀린 답 줄
  - 깨진 등록 파일(AC-005.12): `RegistrationFile.test.cs` 89줄 `Synthetic.Registration(name: "")`(이름 칸이 없어지므로 뺀다. 다른 칸 검사는 그대로), 116~117줄(깨진 `registration.dat` + 맞는 `.bak`이 지금은 `Assert.Null` → `.bak` 값(`Synthetic.Institution`)을 되살려 돌려주고 깨진 파일은 이름이 바뀌어 남음), `DpapiProtector.test.cs` 52줄(다른 entropy로 풀리지 않고 `.bak`이 없음 → `Assert.Null` 대신 `E-STORE-BROKEN`)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-016·020
- `/specs/precheck/requirements.md` — REQ-005 (AC-005.5·005.7 바뀐 문장, AC-005.8~005.12)
- `/specs/precheck/design.md` — 4-3절(`bit.check` 답), 9-1절(병원 이름은 도우미가 갖지 않는다), 9-3절(깨진 파일·`registration.dat`), 12절(x86 빌드), 16절(비트 접속 DLL 위험)
- `/specs/precheck/tasks.md` — TASK-33 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `helper/src/Precheck.Core/Registration/*` (Step 4: `HospitalRegistration`·`RegistrationFile`·`RegistrationStore`·`RegisterPrompt`·`RegisterFlow`·`HospitalGate`)
  - `helper/src/Precheck.Core/Bit/BitCheck.cs`·`BitErrors.cs`·`BitServices.cs` (Step 4)
  - `helper/src/Precheck.Windows/SqlBitDb.cs`·`ReadOnlyConnection.cs`·`ConfirmWindow.cs` (Step 4)
  - `helper/src/Precheck.Helper/Precheck.Helper.csproj`·`Commands/HelperServices.cs`·`Commands/RequireHospital.cs` (Step 0·4)
  - `helper/tests/runDotnet.ts`, `helper/tests/bit-connect.dotnet.test.ts`, `helper/tests/build.test.ts` (Step 0·1·4)
  - `.github/workflows/helper.yml` (Step 1: zip 단계가 `helper/src/Precheck.Helper/bin/Release/net48`을 읽는다)
  - `src/types/bridge.ts`, `src/lib/bridge/protocol.ts`(`isBitCheck`), `src/lib/bridge/client.test.ts` (Step 3)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b`
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`. 없으면 step4.md '원본'의 받는 법을 따른다
- 이 step에서 볼 원본: `tools/build_stats.ps1`(`/platform:x86`), `vendor/drbit_export/ReadOnlyConnection.cs`(`Provider : BITDataBaseCommon`로 물려받아 씀), `vendor/drbit_export/HospitalSecurity.cs`(병원 이름을 읽는 SQL이 없음)

## 수정 범위 (tasks.md TASK-33)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Helper/Precheck.Helper.csproj`
  - `helper/src/Precheck.Core/Registration/*`
  - `helper/src/Precheck.Core/Bit/BitCheck.cs`
  - `helper/src/Precheck.Core/Bit/BitErrors.cs`
  - `helper/tests/Precheck.Core.Tests/Registration/*`
  - `helper/tests/Precheck.Core.Tests/Bit/*`
  - `helper/tests/Precheck.Windows.Tests/Connect/DpapiProtector.test.cs`
  - `helper/tests/runDotnet.ts`
  - `helper/tests/helper-fixups.dotnet.test.ts`
  - `helper/tests/bit-connect.dotnet.test.ts`
  - `src/types/bridge.ts`
  - `src/lib/bridge/protocol.ts`
  - `src/lib/bridge/client.test.ts`
- Tests:
  - `helper/tests/helper-fixups.dotnet.test.ts`
  - `helper/tests/bit-connect.dotnet.test.ts`
  - `src/lib/bridge/client.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **비트는 읽기만**: `Sql.cs`에 정해 둔 SELECT 상수만 매개변수로 돌리고, 끝내지 않는(되돌리는) 트랜잭션 안에서 읽는다. 이 step은 `SqlBitDb.cs`를 고치지 않고 글자 시험으로 증명만 한다 (AC-005.3·005.11)
- **PC 확인 창**: 글은 도우미가 비트에서 읽은 값으로만 만든다. 웹이 보낸 글이나 지어낸 값(범위 값을 이름이라고 쓰기 등)을 보이지 않는다. 기관기호는 뒤 4자리를 가린다 (AC-005.5·005.9)
- **C# 나누기**: 규칙(등록 파일 모양·깨진 파일 규칙·확인 창 글·`bit.check` 답)은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. NuGet 판은 정확한 버전으로 고정한다. 비트 DLL은 함께 싣지 않는다 (ADR-016, design.md 14절)
- **도우미 기록**: 표준 출력에는 메시지 틀만, 진단 기록에는 시각·명령 이름·오류 번호만. 기관기호·범위·경로를 기록·예외 메시지·창 제목에 넣지 않는다 (AC-001.6)
- **환자 자료 구역**: `src/lib/bridge/**`는 환자 자료 구역 울타리 안이다. `protocol.ts`를 고칠 때 새 import·네트워크·console을 더하지 않는다 (ADR-020, `src/guardrails.test.ts`)
- **가짜 자료만**: 시험의 병원 값은 지어낸 것(기관기호 `12345678` 등)만 쓴다. 실제 기관기호·병원 이름을 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. 빌드 (AC-005.8)
- `Precheck.Helper.csproj`: `<ProjectReference Include="../Precheck.Windows/Precheck.Windows.csproj" />`를 더하고, PropertyGroup에 `<PlatformTarget>x86</PlatformTarget>`을 더한다. `Platform`·`Platforms`·`OutputPath`는 쓰지 않는다(쓰면 출력이 `bin/x86/...`로 옮겨 helper.yml의 zip 단계와 어긋난다)
- 이 서버에서 그 csproj를 Release로 빌드해 본다. `Precheck.Windows`(net48, 참조 어셈블리)는 리눅스에서도 빌드된다

### 2. 병원 이름 빼기 (AC-005.9, 바뀐 AC-005.5·005.7)
- `HospitalRegistration`에서 `HospitalName`을 없앤다(생성자·`IsValid` 포함). `RegisterFlow.cs` 43~50줄의 `hospitalName: scope`를 지운다
- `RegistrationFile`: JSON에 `hospitalName`을 쓰지 않는다. 읽을 때 칸 목록은 AC-005.9 그대로다(아직 배포한 적이 없어 모양 번호는 그대로 둬도 된다)
- `RegisterPrompt`: 값 줄의 첫 줄을 `기관기호 1234****`로(병원 이름 없음). 범위·설치 위치·DB 줄과 다시 등록의 전·새 값은 그대로
- `BitCheckResult`: `hospitalName` 칸을 없앤다. 답 칸은 `steps`·`registered`·`institutionCode?`
- 웹: `src/types/bridge.ts`의 `ResultMap['bit.check']`에서 `hospitalName?`을 지우고, `protocol.ts` `isBitCheck`는 `hospitalName`을 선택 칸에서 빼서 있으면 모르는 칸으로 거절한다. 쓰지 않게 된 `isHospitalName`·`isPlainChar`는 지운다

### 3. 깨진 등록 파일 (AC-005.12, design.md 9-3)
- `BitErrors`에 `StoreBroken = "E-STORE-BROKEN"`을 더한다(design.md 4-5에 있는 번호. 새 번호를 만들지 않는다)
- `RegistrationStore.Load()`: 파일 없음 → `null`(등록 없음). 있는데 `RegistrationFile.Read`가 못 풀면 → `.bak`을 같은 검사로 읽어 되면 깨진 파일 이름을 바꿔 두고(예: `registration.dat.broken-<UTC 시각>`, 지우지 않음) `.bak` 내용을 임시 파일 → 바꿔치기로 `registration.dat`에 되살려 쓰고 그 값을 돌려준다(`.bak`을 임시 파일로 복사한 뒤 `File.Replace(임시, registration.dat, 깨진 파일 새 이름)` 한 번이면 되살리기와 이름 바꾸기가 같이 되고, 중간에 실패해도 `registration.dat`가 사라지지 않는다). `.bak`도 없거나 깨졌으면 `BitException(E-STORE-BROKEN)`. 읽기·쓰기 실패(잠김·권한)는 지금처럼 `E-STORE-FAILED`
- `BitCheck`는 이미 `Store.Load()`의 `HelperException`을 `registration` 단계 번호로 쓴다. `registered: false`가 되는지 시험으로 본다. `HospitalGate`·`RequireHospital`은 그 번호로 명령을 멈춘다
- `RegisterFlow`: 전 등록을 읽다가 `E-STORE-BROKEN`이면 전 값 없음으로 보고(처음 등록 글, 새 `ProfileId`) 계속한다. [확인] 뒤 저장할 때는 깨진 `registration.dat`와 깨진 `.bak`을 먼저 이름을 바꿔 두고(예: `.broken-<UTC 시각>` 붙임, 지우지 않음) 새 `registration.dat`를 쓴다. 그냥 바꿔치기하면 깨진 파일이 새 `.bak`이 되고 전 `.bak`은 덮여 사라진다. `.bak`을 따로 둘 방법은 `RegistrationStore`에 둔다(예: 깨진 상태에서 부르는 저장 함수)

### 4. 시험
- Core(리눅스, `*.test.cs`, xUnit `DisplayName`에 AC ID):
  - `Registration/RegistrationFile.test.cs`: JSON 칸 목록에 `hospitalName`이 없음(가짜 `IProtector`로 풀어 칸 이름을 본다, AC-005.9)
  - `Registration/RegisterPrompt.test.cs`: 처음·다시 등록 글에 이름 줄이 없고 첫 값 줄이 `기관기호 1234****`, 범위 값이 이름처럼 따로 앞에 나오지 않음(AC-005.9)
  - `Registration/RegisterFlow.test.cs`: 저장한 등록에 이름 칸이 없음(55줄을 바꿈), 깨진 전 등록이면 처음 등록 글·새 프로필 ID(AC-005.12)
  - `Registration/RegistrationStore.test.cs`(새 파일, 임시 폴더): 없음 → `null`, 깨짐 + 맞는 `.bak` → 되살림·깨진 파일 이름 바뀜·같은 값, 깨짐 + `.bak` 없음/깨짐 → `E-STORE-BROKEN`, 그 상태에서 새로 등록 → 깨진 두 파일이 이름 바뀌어 남고 새 `registration.dat`만 읽힘(AC-005.12)
  - `Registration/RegistrationFile.test.cs` 89·116~117줄, 위 'AC' 절의 목록대로
- Windows(`Precheck.Windows.Tests/Connect/DpapiProtector.test.cs`, Actions에서만 돈다): 16줄 생성자, 52줄을 `E-STORE-BROKEN` 기대로(AC-005.12). 이 서버에서는 컴파일만 확인한다(아래 AC 커맨드)
  - `Bit/BitCheck.test.cs`: 답 칸이 `steps`·`registered`·`institutionCode`(39·56·88·101~109줄을 바꿈, AC-005.9), 깨진 등록 → `registered: false`·`registration` 단계 `E-STORE-BROKEN`(AC-005.12)
- 감싸개 `helper/tests/helper-fixups.dotnet.test.ts`(vitest, `it` 이름에 AC ID):
  - AC-005.8: csproj 글자 검사 + `dotnet build … -c Release`(잠금 안에서, `runDotnet.ts`에 빌드 함수를 더해 같은 잠금을 쓴다) + 출력 파일 셋 + exe PE를 읽어 CLR 머리(데이터 디렉터리 14번) Flags `0x2`(`32BITREQUIRED`) 확인
  - AC-005.9·AC-005.12: `runDotnet('Precheck.Core.Tests.Registration')`·`runDotnet('Precheck.Core.Tests.Bit')`의 출력에서 그 AC ID 시험이 돌았고 실패가 없는지(`bit-connect.dotnet.test.ts`와 같은 방식)
  - AC-005.11: `SqlBitDb.cs`를 읽어 주석(`//`·`///`)을 뺀 글자에 `Commit\s*\(`가 없고(지금 주석에는 'Commit 없음' 글자가 있다), `new SqlCommand(`마다 세 번째 인자가 `transaction`이거나 그 SQL이 `Sql.SnapshotStateSql`이며 그 앞에 `ReadOnlyGuard.Require(Sql.SnapshotStateSql`이 있는지
- `bit-connect.dotnet.test.ts`: AC-005.5·005.7 `it` 이름의 "병원 이름"을 바뀐 문장에 맞춘다(검사는 그대로)
- `src/lib/bridge/client.test.ts`: `CHECK`에서 `hospitalName`을 빼고, `hospitalName` 칸이 있는 답(`'가짜정형외과의원'`·`''` 등)은 `E-BRIDGE-BAD-REPLY`인 시험을 `AC-005.10` 이름으로 둔다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-005.10 bit.check 답에 hospitalName이 있으면 E-BRIDGE-BAD-REPLY', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-33 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-33 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다. xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-005.12 깨진 registration.dat + 맞는 .bak이면 되살린다")]`
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 감싸개 시험 시간 제한은 넉넉히(예: 300초) 준다. 빌드와 `dotnet test`는 같은 잠금 안에서 하나씩 돈다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet build helper/src/Precheck.Helper/Precheck.Helper.csproj -c Release
dotnet build helper/tests/Precheck.Windows.Tests/Precheck.Windows.Tests.csproj -c Release   # 윈도우 시험 컴파일만(돌리기는 Actions)
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Bit|FullyQualifiedName~Precheck.Core.Tests.Registration"
npx vitest run helper/tests/helper-fixups.dotnet.test.ts helper/tests/bit-connect.dotnet.test.ts src/lib/bridge/client.test.ts   # AC-005.5·005.7·005.8~005.12
npx vitest run helper/tests/protocol.dotnet.test.ts helper/tests/build.test.ts src/guardrails.test.ts   # 앞 step 시험 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-33 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
# 윈도우 시험(Precheck.Windows.Tests)과 x86 exe zip은 push 뒤 Actions helper 일에서 돈다 → summary에 [Actions 확인 남음]
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-005.8 ~ AC-005.12가 이 TASK의 시험과 이어져 보여야 한다

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
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정(`bit.check` 답 모양, 화면의 병원 이름은 사이트 값)을 한 줄에 담는다

## 금지사항

- 병원 이름을 지어내거나(범위 값·기관기호·경로를 이름 자리에) 새 SQL로 읽으려 하지 마라. 이유: 원본에 병원 이름 SQL이 없고, 사용자가 "사이트 이름 쓰기"로 정했다. `Sql.cs` 밖 SQL은 돌리지 않는다(AC-005.3·005.9)
- `<Platform>`·`<Platforms>`·`OutputPath`로 x86을 정하지 마라. 이유: 출력이 `bin/Release/net48`을 벗어나 helper.yml의 zip이 exe를 못 찾는다(AC-005.8)
- `SqlBitDb.cs`를 고쳐 시험을 맞추지 마라. 이유: 이 파일은 수정 범위 밖이다. 글자 시험이 실패하면 `blocked`로 멈추고 어느 줄인지 적는다(AC-005.11)
- 깨진 등록 파일을 지우지 마라. 이유: 무엇이 깨졌는지 나중에 볼 수 있게 이름만 바꿔 둔다(design.md 9-3, AC-015.3과 같은 규칙)
- design.md 4-5에 없는 오류 번호를 만들지 마라. 이유: 오류 문구는 `lib/errors.ts` 한 곳이고 번호 목록은 명세가 정한다
- 기관기호·범위·경로를 진단 기록·예외 메시지에 넣지 마라. 이유: 기록은 시각·명령 이름·오류 번호만(AC-001.6)
- 기존 테스트를 깨뜨리지 마라. 이유: Step 0~4 시험(protocol·build·extension·bridge·bit-connect)이 계속 통과해야 한다. 고치는 것은 바뀐 AC-005.5·005.7(병원 이름)과 AC-005.12(깨진 등록 파일)에 맞추는 줄뿐이다('AC' 절의 줄 목록). AC-005.12에 맞춰 `Assert.Null`을 '되살린 값'·`E-STORE-BROKEN` 기대로 바꾸는 것은 허용된다(새 규칙을 더 세게 보는 것이지 시험을 약하게 하는 것이 아니다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- 의원 PC 시험(Phase 1 목록에 더함, 메인 세션이 Phase 끝에 정리): 도우미 exe가 32비트로 도는지(작업 관리자 '플랫폼'), 연결 확인의 DB 읽기 단계가 `E-BIT-DB-FAILED`면 비트 `BITDataBaseCommon`이 추상(abstract) 클래스라 리플렉션으로 만들지 못한 것인지 먼저 본다(design.md 16절), 확인 창에 병원 이름 없이 가린 기관기호·범위가 보이는지
- 다음 step(Step 6 `setup-screen`, TASK-6)은 화면의 병원 이름을 사이트 값(`me.hospital.name`)으로 보인다
