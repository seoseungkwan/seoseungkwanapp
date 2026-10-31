# Step 3: bit-input

> **TASK-17** 비트 자동 입력 (FlaUI · PC 확인 창) · **REQ-017** · AC-017.1 ~ AC-017.10
> Phase 3 `precheck-3-memo` · Step 3 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-17 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-017에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-017.1**: `bit.input {items: [{visitKey, chart, name, date, memo}]}` → 등록 병원 확인 → 비트 화면 지문 확인 → 묶음 검사(500명 이하, 차트번호 `^[0-9]{1,20}$`, 이름 1~100자, 날짜 모양, 메모 1~32,000자, 같은 진료 두 번 없음). 하나라도 틀리면 아무것도 입력하지 않고 오류
- **AC-017.2**: 검사를 통과한 묶음은 입력 전에 도우미가 묶음에서 직접 만든 글("10/27~10/29, 32명 입력할까요?"와 등록한 기관기호, 뒤 4자리 가림)의 PC 확인 창. [확인]을 눌러야 시작, [취소]·창 닫기·5분 지남이면 하나도 입력하지 않고 `cancelled`
- **AC-017.3**: 사람 하나는 원본 `UChartAutomation`·`autoOne` 순서: 내원내역에서 차트번호로 열기 → 이름·차트번호·내원일 검사 → 바로 앞에서 비트 메모 다시 읽기(같으면 완료, 다르면 건너뜀 '이미 있음', 덮어쓰지 않음) → 쓰기 → 다시 읽어 같은지 → 저장 → 다시 읽어 같은지
- **AC-017.4**: 비트 화면 지문(`BITDoctorOrder.exe` 프로세스 규칙, '외래진료실' 창의 `txtChtNum`·`lbPatName`·`txtBilCmt`·`btnBilCmtModify`, '내원내역' 창의 `cbSch`·`txtSch`·`btnSch`·`ctgMain`이 정확히 하나씩)이 하나라도 없거나 여럿이면 입력을 시작하지 않거나 그 사람에서 멈추고 `E-BIT-UI-CHANGED`와 칸 ID 목록. 짐작해서 누르지 않는다
- **AC-017.5**: 저장 안 한 처방 창(원본 '저장되지않은처방')·원본 fatal 문구·3번 잇따른 실패·진행 창 [멈추기]면 그 자리에서 멈추고(멈추기는 지금 사람까지) 남은 사람을 '확인 필요: 미처리'. 저장 안 한 처방 창은 누르지 않는다(`E-BIT-UNSAVED-RX`)
- **AC-017.6**: 사람마다 결과는 완료(입력·이미 입력됨)·확인 필요(다시 읽은 값 다름·저장 확인 못함·미처리)·건너뜀(이유: 이미 있음·내원일 없음·환자 불일치·검색 결과 여러 줄 등 원본 문구) 셋 중 하나. 진행은 `progress {done, total}` 숫자만, 결과는 조각으로
- **AC-017.7**: 입력 기록(`Journal`, 작업 저장 안)에 쓰기 전·확인 뒤 `writing`·`done`·`skipped`·`check`. 도중에 멈춘 묶음을 다시 열어 같은 진료를 입력하면 비트 메모와 비교해 우리 글과 같으면 완료, 비었으면 입력, 다르면 건너뜀(이미 있음)
- **AC-017.8**: 원본 `SecurityTests`의 입력 보호 사례(승인한 메모 줄바꿈·공백 그대로, 쓰기 직전 바뀐 메모 거절, 환자 바뀜 거절, 거절이면 절대 안 씀, 가짜 화면에만 씀)를 가짜 `IChartUi`로 돌리면 원본과 같은 결과
- **AC-017.9**: `bit.input` 중에 표준 입력이 닫히면(웹 창이 닫혀 확장이 30분 뒤 연결을 닫음·로그아웃 뒤·크롬 종료 등) 지금 사람을 안전한 자리까지만 한다: 쓰기 전이면 시작하지 않고, 시작했으면 쓰기 → 다시 읽기 → 저장 → 다시 읽기까지 마친다. 남은 사람은 '확인 필요: 미처리'로 `Journal`과 결과를 작업 저장에 남기고 끝난다. 확인 창이 떠 있던 중이면 [취소]와 같다. 반쯤 쓴 메모를 남기지 않는다
- **AC-017.10**: 이름 있는 뮤텍스 `Local\SeoseungkwanPrecheckHelper.Work`를 잡은 동안에만 `bit.input`(확인 창부터 결과 기록까지)·`store.save`를 한다. 다른 도우미 프로세스가 잡고 있으면 `bit.input`은 바로, `store.save`는 5초 기다린 뒤 `E-BRIDGE-BUSY`로 답하고 아무것도 쓰거나 입력하지 않는다. 놓지 않고 끝난 뮤텍스(abandoned)는 잡은 것으로 보고 이어서 하기(AC-017.7)를 따른다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-017
- `/specs/precheck/design.md` — 9-4절(자동 입력 전체), 4-3절(`bit.input`: progress … chunk … end, 확인 창), 15절(묶음 고리를 도우미로·덮어쓰기 없음·500명·5분), 16절(자동 입력 위험)
- `/specs/precheck/tasks.md` — TASK-17 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `helper/src/Precheck.Windows/ConfirmWindow.cs`, `helper/src/Precheck.Helper/Commands/*`(등록 확인 관문) (Phase 1 Step 4)
  - `helper/src/Precheck.Core/Store/*`(`WorkStore`, `journal`) (Step 1)
  - `helper/src/Precheck.Core/Claim/MemoCompare.cs` (Step 2)
  - `helper/src/Precheck.Core/Protocol/*` (`Envelope.Progress`, `Chunker`)
  - `src/lib/bridge/commands.json` (`bit.input` args. `{payload}` 안쪽 모양)
  - `extension/src/background.ts` (Phase 1: 웹이 끊겨도 `bit.input`은 30분까지 둔다. 그동안 새 웹 연결은 `E-BRIDGE-BUSY`, AC-003.9)
  - `helper/src/Precheck.Helper/Program.cs` (Phase 1: 표준 입력 고리)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `vendor/secure_bridge/LegacyAutomation/UChartAutomation.cs` (FlaUI: 창·칸 찾기, `EM_REPLACESEL`·`ValuePattern`, '저장되지않은처방', fatal 문구)
  - `vendor/secure_bridge/LegacyAutomation/UChartCurrent.cs`·`OpenRequest.cs`·`OpenResult.cs`·`ApplyRequest.cs`·`ApplyResult.cs`
  - `vendor/secure_bridge/NativeTarget.cs` (`BITDoctorOrder.exe` 프로세스 규칙)
  - `vendor/secure_bridge/MemoApproval.cs`, `vendor/secure_bridge/SecurityTests.cs` (옮길 보호 사례)
  - `assets/mx999_v22.html`의 `autoOne` (사람 하나 고리·건너뜀 문구), `medicore/secure_bridge.py` `validate_request`(85줄, 묶음 검사 규칙)
  - `tools/claim_batch_result.py`·`claim_input_lifecycle.py`, `tests/test_claim_batch_result.py`·`test_claim_input_lifecycle.py` (결과 분류·이어서 하기)

## 승인된 목업 (도우미 창)

- PC 확인 창·진행 창 모양은 목업 화면 5 '도우미 PC 확인 창'(창 제목 '청구메모 도우미', "비트에 청구메모를 입력할까요?", 기간 · N명, 등록한 기관기호(뒤 4자리 가림. 병원 이름 없음 — 도우미는 병원 이름을 갖지 않으므로 목업의 병원 이름 자리는 비워 둔다), 빼는 환자 수, 주의, [확인]·[취소] / 진행 N/M명, [멈추기])을 따른다
- 목업: https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (화면 5, `id="v-confirm"`). 이 서버 사본: `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html`. 사본이 없으면 `read_artifact`(slug `499cp2Sodph7jYJ4gX4exj`)
- 목업 숫자·병원 이름·기관기호는 예시다

## 수정 범위 (tasks.md TASK-17)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Input/*`
  - `helper/src/Precheck.Core/Store/*`
  - `helper/src/Precheck.Windows/Precheck.Windows.csproj`
  - `helper/src/Precheck.Windows/NativeTarget.cs`
  - `helper/src/Precheck.Windows/UChartAutomation.cs`
  - `helper/src/Precheck.Windows/ConfirmWindow.cs`
  - `helper/src/Precheck.Windows/ProgressWindow.cs`
  - `helper/src/Precheck.Helper/Commands/*`
  - `helper/src/Precheck.Helper/Program.cs`
  - `helper/tests/Precheck.Core.Tests/Input/*`
  - `helper/tests/Precheck.Windows.Tests/Input/*`
- Tests:
  - `helper/tests/input.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **PC 확인 창**: 비트에 쓰는 일(`bit.input`)과 처음 등록(`bit.register`)은 도우미가 띄우는 윈도우 창에서 사람이 [확인]을 눌러야만 시작한다. 창의 글은 도우미가 묶음·비트에서 직접 만든다(웹이 보낸 글을 보이지 않는다). [취소]·창 닫기·5분 지남이면 아무것도 하지 않는다 (ADR-016, design.md 9-1·9-4)
- **비트는 읽기만**: `Sql.cs`에 정해 둔 SELECT 상수만 매개변수로 돌리고, 끝내지 않는(되돌리는) 트랜잭션 안에서 읽는다(원본 `ReadOnlyConnection` 그대로). SQL 글자를 이어 붙이지 않는다. 읽기·입력 명령 전에는 늘 등록 병원(기관기호·범위·설치 위치·서버·DB 이름)을 다시 확인한다 (AC-005.3·005.6)
- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다(크롬 한도 1MB). 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다 (design.md 4절, AC-001.5)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·FlaUI·DPAPI·WinForms 창·레지스트리)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. NuGet 판은 정확한 버전으로 고정한다(범위·`*` 없음). 비트 DLL은 함께 싣지 않고 의원 PC의 `C:\DrBIT50\EXE`에서 불러온다 (ADR-016, design.md 14절)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 환자 자료·메모·차트번호·이름·전화를 어디에도(기록·예외 메시지·창 제목) 쓰지 않는다 (AC-001.6)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)

## 작업

### 1. Core (`Precheck.Core/Input/*`, 리눅스에서 시험)
```csharp
public interface IChartUi {                       // 비트 화면 흉내 가능한 경계. Windows가 FlaUI로 구현
  FingerprintResult CheckFingerprint();           // 칸 ID마다 찾은 수
  OpenResult OpenByChart(string chart, string date);   // 내원내역에서 열기: 이름·차트번호·내원일 돌려줌, 여러 줄·없음 구분
  string? ReadMemo();  void WriteMemo(string text);  bool ClickSave();
  bool HasUnsavedRxDialog();  string? FatalText();
}
public static class UiFingerprint { public static readonly string[] Outpatient = { "txtChtNum", "lbPatName", "txtBilCmt", "btnBilCmtModify" }; public static readonly string[] Visits = { "cbSch", "txtSch", "btnSch", "ctgMain" }; }
public static class BatchCheck { public static void Validate(IReadOnlyList<InputItem> items); }  // 원본 validate_request 규칙 + AC-017.1
public static class InputPrompt { public static string Build(IReadOnlyList<InputItem> items, Registration reg, int excluded); } // "10/27~10/29, 32명 입력할까요?" + 등록한 기관기호(뒤 4자리 가림). 병원 이름 없음
public sealed class InputRunner {                 // 원본 autoOne 고리를 도우미로
  public InputRunner(IChartUi ui, IConfirm confirm, IProgress progress, Journal journal, Func<bool> stopRequested);
  public InputOutcome Run(IReadOnlyList<InputItem> items);   // cancelled | finished | stopped(code)
}
public static class MemoApproval { /* 원본 그대로: 승인한 글과 쓰기 직전 글 비교, 줄바꿈·공백 보존 */ }
public sealed class Journal { /* WorkStore의 journal 칸: visitKey → writing|done|skipped|check */ }
public sealed class HostSignal { public void MarkStdinClosed(); public bool StdinClosed { get; } }   // Program.cs의 읽기 스레드가 세운다
public sealed class WorkLock : IDisposable {      // 이름 있는 뮤텍스 Local\SeoseungkwanPrecheckHelper.Work
  public static WorkLock? TryAcquire(TimeSpan wait);   // 못 잡으면 null → E-BRIDGE-BUSY. abandoned면 잡은 것으로 본다
}
```
- 순서(AC-017.1~017.3): 등록 확인(관문) → `CheckFingerprint`(하나라도 0개나 2개 이상이면 `E-BIT-UI-CHANGED` + 칸 ID 목록) → `BatchCheck` → `InputPrompt`로 만든 글로 확인 창(5분) → 사람마다: 열기 → 이름·차트번호·내원일 검사 → 메모 다시 읽기(같음 → 완료 '이미 입력됨', 다른 글 → 건너뜀 '이미 있음') → `journal=writing` → 쓰기 → 다시 읽어 같은지 → 저장 → 다시 읽어 같은지 → `journal=done` 또는 `check`
- 멈춤(AC-017.5): 저장 안 한 처방 창(누르지 않음, `E-BIT-UNSAVED-RX`) · fatal 문구 · 3번 잇따른 실패(`E-INPUT-STOPPED`) · [멈추기](지금 사람까지) → 남은 사람은 '확인 필요: 미처리'
- 결과(AC-017.6): 사람마다 `{visitKey, result: '완료'|'확인 필요'|'건너뜀', reason}` — 이유 글은 원본 문구. 진행은 `progress {done, total}`만, 결과는 끝에 JSON 하나 → `Chunker.Split`
- 이어서 하기(AC-017.7): `journal`에 `writing`이나 미처리로 남은 진료는 다시 열 때 비트 메모와 비교: 우리 글과 같음 → 완료, 비었음 → 입력, 다름 → 건너뜀(이미 있음)
- 표준 입력 닫힘(AC-017.9): `stopRequested`는 [멈추기] 또는 `HostSignal.StdinClosed`다. 사람 하나의 안전한 자리는 '쓰기 전'과 '저장 뒤 다시 읽기까지'다. 쓰기 전에 신호가 섰으면 쓰지 않고, 쓰기를 시작했으면 그 사람의 쓰기 → 다시 읽기 → 저장 → 다시 읽기를 마친 뒤 멈춘다. 남은 사람은 '확인 필요: 미처리', `Journal`과 결과를 저장하고 처리기를 끝낸다(보낼 곳이 닫혔으니 보내기 실패는 무시). 확인 창이 떠 있으면 닫고 `cancelled`
- 한 번에 하나(AC-017.10): `bit.input`은 `WorkLock.TryAcquire(TimeSpan.Zero)`를 확인 창 전에 잡고 결과 기록 뒤에 놓는다. 못 잡으면 확인 창도 띄우지 않고 `E-BRIDGE-BUSY`

### 2. Windows (net48)
- `Precheck.Windows.csproj`: `FlaUI.Core`·`FlaUI.UIA3` **4.0.0**(정확한 버전, 원본과 같은 판)
- `NativeTarget.cs`: 원본 그대로 `BITDoctorOrder.exe` 찾기 규칙
- `UChartAutomation.cs`: `IChartUi` 구현. 원본 코드를 옮긴다. 쓰기는 `EM_REPLACESEL`, 안 되면 `ValuePattern`
- `ConfirmWindow.cs`(Phase 1 것): 입력 확인 글을 받을 수 있게 손본다(목업 화면 5 모양). `ProgressWindow.cs`: 진행 N/M명과 [멈추기]
- 확인 창은 맨 위, 작업 표시줄 이름 '청구메모 도우미'

### 3. 명령 (`Commands/*`)
- `bit.input`: args 검사(명령 표 + `BatchCheck`) → `WorkLock` → `InputRunner.Run` → 진행·결과 보내기 → `journal` 저장(`WorkStore`). 웹 연결만 끊기면 확장이 도우미 연결을 30분까지 두므로 끝까지 하고 결과는 작업 저장에 남는다(다시 열면 보임). 표준 입력이 닫히면 AC-017.9
- `store.save`(TASK-15 처리기): 저장 전에 `WorkLock.TryAcquire(5초)`. 못 잡으면 `E-BRIDGE-BUSY`로 답하고 쓰지 않는다(AC-017.10)
- `Program.cs`: 표준 입력을 따로 읽는 스레드를 두고, 메시지는 차례 줄에 넣어 지금처럼 하나씩 처리한다. 표준 입력이 닫히면 `HostSignal.MarkStdinClosed()`를 부르고, 처리 중인 명령이 끝나면 끝난다(AC-001.1은 그대로)

### 4. 시험
- Core(`Input/*.test.cs`): 가짜 `IChartUi`·가짜 확인 창으로 AC-017.1~017.7 전부, 원본 `SecurityTests.cs` 입력 보호 사례(AC-017.8) — 확인 창 [취소]면 `WriteMemo`가 한 번도 불리지 않음, 지문 칸이 둘이면 시작 안 함, 3번 실패면 멈춤, 진행 메시지에 숫자만. 표준 입력 닫힘 신호를 쓰기 전에 세우면 `WriteMemo`가 안 불리고, 쓰기 중에 세우면 그 사람의 저장·다시 읽기까지 마친 뒤 남은 사람이 '미처리'로 `Journal`에 남는다. 확인 창 중이면 `cancelled`(AC-017.9). 다른 스레드가 같은 이름 뮤텍스를 쥔 동안 `bit.input` → 바로 `E-BRIDGE-BUSY`(확인 창 안 뜸), `store.save` → 5초 뒤 `E-BRIDGE-BUSY`(파일 안 바뀜), 쥔 스레드가 놓지 않고 끝나면(abandoned) 잡힘(AC-017.10)
- Windows(`Precheck.Windows.Tests/Input/*`): Actions에서. 가짜 WinForms 창(같은 칸 이름)에만 쓰는 시험. 실제 비트는 의원 PC
- 감싸개 `input.dotnet.test.ts`: `runDotnet('Precheck.Core.Tests.Input')`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-17 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-17 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(예: `helper/tests/Precheck.Core.Tests/Protocol/Framing.test.cs`, 하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-001.1 길이 0이면 E-HELPER-BAD-MESSAGE")]`
- 하네스 TDD 기록은 vitest 감싸개 `helper/tests/input.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 클래스나 이름공간>')`을 부르고, `it` 이름에도 AC ID를 넣는다. 감싸개 시험 시간 제한은 넉넉히(예: 300초) 준다
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Input"
npx vitest run helper/tests/input.dotnet.test.ts             # AC-017.1~AC-017.8
npx vitest run helper/tests/store.dotnet.test.ts helper/tests/memo-compare.dotnet.test.ts helper/tests/bit-connect.dotnet.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-17 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
# Precheck.Windows.Tests/Input·FlaUI net48 빌드는 push 뒤 Actions에서 → summary에 [Actions 확인 남음]
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-017.1 ~ AC-017.10이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-3-memo/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 확인 창 [확인] 전에 비트 화면에 무엇이든 쓰거나 누르지 마라. 이유: 사람이 PC에서 확인해야만 입력된다(AC-017.2, ADR-016)
- 확인 창 글에 웹이 보낸 글(안내문·병원 이름 등)을 쓰지 마라(도우미는 병원 이름을 갖지 않는다). 이유: 도우미가 묶음과 등록 정보에서 직접 만든다. 웹이 잘못되어도 속지 않게(AC-017.2)
- 비트에 다른 메모가 있으면 덮어쓰지 마라. 이유: 덮어쓰기는 범위 밖이다(requirements '범위 밖'). 늘 '건너뜀: 이미 있음'
- 칸을 못 찾을 때 비슷한 칸·좌표·순서로 짐작해 누르지 마라. 이유: 비트가 바뀌면 다른 환자·다른 칸에 쓸 수 있다. 바로 멈추고 `E-BIT-UI-CHANGED`(AC-017.4)
- 저장 안 한 처방 창의 단추를 누르지 마라. 이유: 진료 중인 처방이 사라지거나 저장될 수 있다(AC-017.5)
- 진행 메시지·진단 기록에 이름·차트번호·메모를 넣지 마라. 이유: 진행은 숫자만, 결과는 조각으로(AC-017.6, AC-001.6)
- 기존 테스트를 깨뜨리지 마라. 이유: 등록·저장·비교 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- 의원 PC 시험(Phase 3): 먼저 시험용 환자 한 명으로 입력해 본다 → 그다음 실제 하루치(docs/precheck/plan.md §6·§7)
- FlaUI 4.0.0 net48 빌드가 Actions에서 안 되면 메인 세션이 사용자에게 알린다(런타임을 바꾸는 큰 결정, design.md 16절)

## 구현 메모 (명세 2차 리뷰 참고 사항)
- AC-017.10에서 다른 프로세스가 잠금을 쥐고 있을 때 `E-BRIDGE-BUSY`를 쓴다. 화면은 이때 연결 상태를 바꾸지 않고 오류 카드만 보인다
