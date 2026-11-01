# Step 1: contact-read

> **TASK-9** 도우미 — contact.targets (비트 83·47 표 칸 고르기) · **REQ-605** · AC-605.1 ~ AC-605.4
> Phase 3 `patients-3-helper`(도우미 (비트 표 칸 고르기 · contact.dat)) · Step 1 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-9 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-605에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-605.1**: `{kind, from, to}`(31일 이하·오늘 이하) → 등록 확인 → 83 표 다섯 칸 + 47 표(F/U: 차트번호 + 전화 칸 / 정기 주사: 처방코드·차트번호·처방일자 + 전화 칸, 같은 줄 한 번)만 `{v:1, kind, from, to, chart, rx}`로 chunk…end. 전화 칸 = 원본 `phoneColumn`
- **AC-605.2**: 31일 넘음·from > to·오늘 뒤 → `E-HELPER-BAD-MESSAGE`(명령 표 1,100일 안이어도)
- **AC-605.3**: 한 표 300,000줄 넘음 → `E-BIT-READ-FAILED`(자르지 않음), 필수 칸 없음 → `E-BIT-EXPORT-FAILED`, 읽기 실패·시간 초과 → `E-BIT-READ-FAILED`. `end` 없이 `error`만
- **AC-605.4**: 진단 기록·예외 메시지에 시각·명령 이름·오류 번호만(이름·전화·차트번호·증상 없음)

## 시작 전 확인 (선행 작업)

이 step은 청구 사전점검 precheck TASK-8(비트 통계 화면 표 읽기)이 main에 합쳐진 뒤에만 한다. 먼저 메인 세션이 main을 이 브랜치에 합친다(`git fetch origin && git merge origin/main`, 이 step 안에서는 하지 않는다). 그 뒤 아래가 모두 있어야 한다:

```bash
ls helper/src/Precheck.Core/Bit/GridReader.cs helper/src/Precheck.Core/Bit/GridRows.cs helper/src/Precheck.Windows/VendorGridExport.cs
grep -n '"83"' helper/src/Precheck.Core/Bit/GridRows.cs
```
- 하나라도 없으면 아무것도 고치지 말고 `blocked`(사유: "precheck TASK-8(비트 표 읽기)이 main에 없음 — 합쳐진 뒤 다시")로 멈춘다
- 있으면 그 파일들과 시험(`helper/tests/Precheck.Core.Tests/Bit/GridReader.test.cs`·`GridRows.test.cs`)을 먼저 읽고, 표 하나를 기간으로 읽는 함수·표 모양(머리 줄·줄)·시간 제한·오류 번호를 확인한다. 이 step은 그것을 **부르기만** 한다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-605
- `/specs/patients/design.md` — 'main에 있는 것 · 없는 것', '도우미 `contact.targets` 답 모양', '결정과 트레이드오프'(명령 표를 바꾸지 않는다), '다른 작업과 겹치는 파일'
- `/specs/patients/tasks.md` — TASK-9
- `/specs/precheck/design.md` 4절(메시지 약속)·9-2(읽기 규칙) — 읽기만
- `/src/lib/bridge/commands.json`의 `contact.targets`(`kind` enum·`from`·`to`·`maxDays` 1100, `patient: true`)
- 도우미 Phase 1 파일: `helper/src/Precheck.Core/Protocol/Dispatcher.cs`·`Chunker.cs`·`Errors.cs`, `helper/src/Precheck.Core/Bit/BitCommands.cs`(명령 등록 방식)·`BitErrors.cs`, `helper/src/Precheck.Core/Registration/HospitalGate.cs`, `helper/src/Precheck.Helper/Program.cs`·`Commands/HelperServices.cs`·`Commands/RequireHospital.cs`, `helper/tests/runDotnet.ts`·`bit-connect.dotnet.test.ts`
- precheck TASK-8 파일(아래 '시작 전 확인')
- `fixtures/patients/golden/phone-columns.json`(TASK-2, 전화 칸 이름 판정 원본 결과)
- 이전 step에서 만든 파일: `helper/src/Precheck.Core/Contact/ContactCommands.cs`(`RegisterStore` — 같은 파일에 `RegisterTargets`를 더한다)·`ContactStore.cs`, `helper/src/Precheck.Helper/Commands/ContactHelperServices.cs`, `Program.cs`의 `services` 변수

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(precheck에서 GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`)의 자료는 모두 가짜다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/revisit_schedule.html`의 `phoneColumn`(1588)·`headerFor`(1611)·`prepareRx`(1693) — 칸 고르기 규칙(C#으로 옮긴다)
  - `vendor/drbit_export/NativeMappings.cs`의 `Key="83"`·`Key="47"` 정의 — 어느 통계 화면인지 확인만(읽기는 precheck 부품이 한다)

## 수정 범위 (tasks.md TASK-9)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Contact/ContactColumns.cs`
  - `helper/src/Precheck.Core/Contact/ContactTargets.cs`
  - `helper/src/Precheck.Core/Contact/IContactGrids.cs`
  - `helper/src/Precheck.Core/Contact/ContactCommands.cs`
  - `helper/src/Precheck.Windows/ContactGrids.cs`
  - `helper/src/Precheck.Helper/Commands/ContactHelperServices.cs`
  - `helper/src/Precheck.Helper/Program.cs`
  - `helper/tests/Precheck.Core.Tests/Contact/*`
  - `helper/tests/Precheck.Windows.Tests/Contact/*`
- Tests:
  - `helper/tests/contact-read.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **비트는 읽기만**: 비트 표는 precheck TASK-8의 비트 통계 화면 읽기 부품으로만 읽는다. 새 SQL을 만들지 않고 `Sql.cs`를 고치지 않는다. 읽기·저장 명령 전에는 늘 등록 병원을 다시 확인한다(`RequireHospital`·`HospitalGate`)
- **1MB 나눠 보내기**: 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다(`Chunker.Send`). 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·DPAPI·창)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. 새 NuGet 패키지를 넣지 않는다 (ADR-016)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 이름·전화·차트번호·증상 글을 기록·예외 메시지·창 제목 어디에도 쓰지 않는다
- **명령 표는 그대로**: `src/lib/bridge/commands.json`을 고치지 않는다(확장도 같은 표로 검사한다. 바꾸면 확장을 다시 올려야 한다)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험·골든은 `fixtures/patients/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`, 내원번호 `V`+숫자). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. Core (`helper/src/Precheck.Core/Contact/`)
```csharp
// IContactGrids.cs — 표 하나를 기간으로 읽는다. 윈도우는 precheck TASK-8 부품, 시험은 가짜
public interface IContactGrids
{
    // 머리 줄(칸 이름) + 줄(표시 글자). 실패·시간 초과는 BitException(E-BIT-READ-FAILED), 표를 못 읽으면 E-BIT-EXPORT-FAILED
    ContactGrid Read(string key /* "83" | "47" */, DateTime from, DateTime to);
}
public sealed class ContactGrid { public IReadOnlyList<string> Header { get; } public IReadOnlyList<IReadOnlyList<string>> Rows { get; } }

// ContactColumns.cs — 원본 칸 고르기
public static class ContactColumns
{
    public static bool IsPhoneColumn(string header);                     // 원본 phoneColumn 정규식 그대로(공백 지움, fax·팩스 아님)
    public static List<string[]> Chart(ContactGrid grid);                // precheck GridRows.From("83", …)의 다섯 칸, 첫 줄 = 칸 이름
    public static List<string[]> Rx(string kind, ContactGrid grid);      // followup: 차트번호 + 전화 칸 / injection: 처방코드·차트번호·처방일자 + 전화 칸. 같은 줄은 한 번(처음 순서)
}
// ContactTargets.cs
public static class ContactTargets
{
    public const int MaxPieceDays = 31;
    public const int MaxRows = 300_000;                                 // 원본 TreatmentUsage.MaximumRows
    public static string Build(string kind, DateTime from, DateTime to, DateTime today, IContactGrids grids);   // design.md 답 모양 JSON
}
// ContactCommands.cs
public static class ContactCommands
{
    public static void RegisterTargets(Dispatcher dispatcher, BitServices services, Func<VerifiedHospital, IContactGrids> grids);
}
```
- 칸 찾기는 원본 `headerFor`와 같다: 머리 글자에서 공백을 지우고 찾는 이름을 품은 칸. 같은 이름을 품은 칸이 둘 이상이면 `E-BIT-EXPORT-FAILED`. 83은 precheck `GridRows`가 정한 칸을 그대로 쓴다(새로 정하지 않는다)
- 기간: `(to - from).Days + 1 ≤ 31`, `from ≤ to`, `to ≤ today` 아니면 `E-HELPER-BAD-MESSAGE`. `kind`는 명령 표가 이미 검사한다
- 줄 수: 83·47 각각 읽은 줄이 `MaxRows`를 넘으면 `E-BIT-READ-FAILED`(자르지 않는다)
- 처리기: `HospitalGate.Open(services)`(등록 확인) → `Build` → `Chunker.Send(sink, id, json)`. 예외는 오류 번호만 `error`로. 다 만든 뒤에 나눈다
- `IsPhoneColumn` 시험은 `fixtures/patients/golden/phone-columns.json`을 읽어 원본 결과와 모두 같은지 본다(저장소 뿌리는 시험 실행 폴더에서 위로 올라가며 `fixtures/`를 찾는다)

### 2. 윈도우·연결 (얇게)
- `helper/src/Precheck.Windows/ContactGrids.cs`: `IContactGrids`를 precheck TASK-8의 `VendorGridExport`(표 열쇠 "83"·"47"로 기간 표 읽기) + `GridReader`로 구현한다. 시간 제한·STA 스레드·비트 DLL 불러오기는 그 부품이 하는 대로 따른다
- `helper/src/Precheck.Helper/Commands/ContactHelperServices.cs`: `Func<VerifiedHospital, IContactGrids>`를 만든다(`HelperServices.cs`는 고치지 않는다)
- `Program.cs`: 앞 step(TASK-8)이 만든 `services` 변수와 `ContactCommands.RegisterStore` 줄 옆에 `ContactCommands.RegisterTargets(dispatcher, services, ContactHelperServices.Grids)` 한 줄만 더한다(precheck가 다른 등록 줄을 더했으면 그 옆에)

### 3. 시험 (`helper/tests/Precheck.Core.Tests/Contact/Read/*.test.cs`, 이름공간 `Precheck.Core.Tests.Contact.Read`)
- 가짜 `IContactGrids`(83·47 가짜 표, 주민번호·주소·금액 칸 섞음): 남기는 칸만(AC-605.1), 전화 칸 원본 판정(AC-605.1), 같은 줄 한 번, F/U에 처방 칸 없음, 32일·거꾸로·내일 → `E-HELPER-BAD-MESSAGE`(AC-605.2), 300,001줄 → `E-BIT-READ-FAILED`이고 조각 없음, 칸 없음·중복 → `E-BIT-EXPORT-FAILED`, 읽기 예외 → `error`만(AC-605.3), 가짜 기록기에 남은 글에 이름·전화·차트번호가 없음(AC-605.4)
- 처리기 시험은 Phase 1의 가짜 `ReplySink`·가짜 `BitServices`로 등록 확인 → chunk…end 순서를 본다
- 감싸개 `helper/tests/contact-read.dotnet.test.ts`: `runDotnet('Precheck.Core.Tests.Contact.Read')`, AC마다 그 AC ID가 붙은 C# 시험이 돌았고 실패가 없는지
- 윈도우 시험(`helper/tests/Precheck.Windows.Tests/Contact/`)은 `ContactGrids`가 precheck 부품을 올바른 열쇠로 부르는지만(가짜 부품). Actions 윈도우에서 돈다

## TDD 순서

1. 시험을 먼저 쓴다. C# 시험 파일 이름은 `*.test.cs`다(하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-605.2 32일이면 E-HELPER-BAD-MESSAGE")]`
2. 하네스 TDD 기록은 vitest 감싸개 `helper/tests/contact-read.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('Precheck.Core.Tests.Contact.Read')`를 부르고, `it` 이름에도 AC ID를 넣는다(예: `helper/tests/bit-connect.dotnet.test.ts`처럼 AC마다 그 AC ID가 붙은 C# 시험이 돌았고 실패가 없는지 본다). 시간 제한은 넉넉히(300초)
3. RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
4. `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect red` → 구현 → `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green` → 정리 뒤 다시 green
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Contact.Read|FullyQualifiedName~Precheck.Core.Tests.Bit|FullyQualifiedName~Precheck.Core.Tests.Protocol"
npx vitest run helper/tests/contact-read.dotnet.test.ts      # AC-605.1~AC-605.4
npx vitest run helper/tests/contact-store.dotnet.test.ts helper/tests/protocol.dotnet.test.ts helper/tests/bit-connect.dotnet.test.ts   # 앞 도우미 시험 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-605.1 ~ AC-605.4가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/patients-3-helper/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 저장소·승인 목업·선행 작업 없음 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- precheck TASK-8 파일(`GridReader`·`GridRows`·`VendorGridExport`·`Sql.cs`·`SqlBitDb.cs`)을 고치지 마라. 이유: 청구 사전점검의 원본 비교 시험이 깨지고 두 브랜치가 부딪힌다. 모자라면 `blocked`로 멈추고 무엇이 모자란지 적는다
- 한도를 넘는 표를 잘라서 보내지 마라. 이유: 일부만 보내면 연락해야 할 환자가 빠진다(AC-605.3)
- 원본이 읽지 않는 칸(주소·주민번호·금액 등)을 보내지 마라. 이유: 필요한 것만 읽는다(CLAUDE.md)
- `commands.json`에 칸(예: 약제코드)이나 명령을 더하지 마라. 이유: 확장을 다시 올려야 한다(design.md)
- 전화번호·이름을 진단 기록·예외 메시지에 넣지 마라. 이유: 기록은 시각·명령 이름·오류 번호만(AC-605.4)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
