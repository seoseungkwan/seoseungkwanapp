# Step 1: contact-store

> **TASK-9** 도우미 — 연락 표시 · 정기 주사 기록 저장 (contact.dat) · **REQ-606** · AC-606.1 ~ AC-606.5
> Phase 3 `patients-3-helper`(도우미 (비트 표 칸 고르기 · contact.dat)) · Step 1 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-9 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-606에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-606.1**: `store.save {payload: {contact}}` → 등록 확인 → DPAPI로 `contact.dat`(머리 `PRECHECK-STORE-1`, 임시 → 바꿔치기, `.bak` 하나)에 프로필 ID와 함께 → `{saved: true}`
- **AC-606.2**: `store.load {contact: true}` → `contact`를 chunk…end. 없거나 다른 프로필이면 `{}`
- **AC-606.3**: 깨진 파일: `.bak`이 맞으면 그것, 아니면 `E-STORE-BROKEN`(깨진 파일은 이름만 바꿔 남김). 쓰기 실패 `E-STORE-FAILED`
- **AC-606.4**: `months`·`drafts`·`done`·`journal`·`settings` 칸 → `E-HELPER-BAD-MESSAGE`. `contact` 32MB 넘음도 거절
- **AC-606.5**: 작업 뮤텍스 `Local\SeoseungkwanPrecheckHelper.Work`를 5초 안에 못 잡으면 `store.save`는 `E-BRIDGE-BUSY`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-606
- `/specs/patients/design.md` — '도우미 저장 `contact.dat`', '`contact` 안쪽 모양', 'precheck가 나중에 할 일'
- `/specs/patients/tasks.md` — TASK-9
- `/specs/precheck/design.md` 9-3(작업 저장 규칙)·9-4의 '한 번에 하나'(뮤텍스) — 읽기만
- `/src/lib/bridge/commands.json`의 `store.load`·`store.save`(칸 모양)
- 도우미 파일: `helper/src/Precheck.Core/Store/IProtector.cs`, `helper/src/Precheck.Windows/DpapiProtector.cs`, `helper/src/Precheck.Core/Registration/RegistrationStore.cs`·`RegistrationFile.cs`(DPAPI 파일 쓰기·`.bak`·깨진 파일 이름 바꾸기 방식 — 그대로 따른다), `HospitalGate.cs`, `Protocol/Dispatcher.cs`(`store.save`만 `result`로 답할 수 있다), `Chunker.cs`
- 이전 step에서 만든 파일: `helper/src/Precheck.Core/Contact/ContactCommands.cs`, `helper/src/Precheck.Helper/Commands/ContactHelperServices.cs`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-9)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Contact/ContactStore.cs`
  - `helper/src/Precheck.Core/Contact/IWorkLock.cs`
  - `helper/src/Precheck.Core/Contact/NamedWorkLock.cs`
  - `helper/src/Precheck.Core/Contact/ContactCommands.cs`
  - `helper/src/Precheck.Helper/Commands/ContactHelperServices.cs`
  - `helper/src/Precheck.Helper/Program.cs`
  - `helper/tests/Precheck.Core.Tests/Contact/*`
- Tests:
  - `helper/tests/contact-store.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **비트는 읽기만**: 비트 표는 precheck TASK-8의 비트 통계 화면 읽기 부품으로만 읽는다. 새 SQL을 만들지 않고 `Sql.cs`를 고치지 않는다. 읽기·저장 명령 전에는 늘 등록 병원을 다시 확인한다(`RequireHospital`·`HospitalGate`)
- **1MB 나눠 보내기**: 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다(`Chunker.Send`). 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·DPAPI·창)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. 새 NuGet 패키지를 넣지 않는다 (ADR-016)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 이름·전화·차트번호·증상 글을 기록·예외 메시지·창 제목 어디에도 쓰지 않는다
- **명령 표는 그대로**: `src/lib/bridge/commands.json`을 고치지 않는다(확장도 같은 표로 검사한다. 바꾸면 확장을 다시 올려야 한다)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험·골든은 `fixtures/patients/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`, 내원번호 `V`+숫자). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)
- **PC 저장은 암호화만**: `contact.dat`는 `IProtector`(윈도우는 DPAPI CurrentUser)로 암호화한 바이트만 쓴다. 평문 임시 파일을 남기지 않는다. 저장 폴더는 `HelperServices.DataDirectory()`(프로그램 폴더 밖) (ADR-020)

## 작업

### 1. Core
```csharp
// ContactStore.cs
public sealed class ContactStore
{
    public const int MaxContactBytes = 32 * 1024 * 1024;
    public ContactStore(string directory, IProtector protector);
    public string Load(string profileId);                 // contact JSON 글자. 파일 없음·다른 프로필 → "{}". 깨짐 → .bak → 아니면 BitException/HelperException(E-STORE-BROKEN)
    public void Save(string profileId, string contactJson); // 객체 JSON인지·크기 검사 → { "profileId", "contact" } → 머리 + Protect → 임시 파일 → File.Replace(.bak) (없으면 Move)
}
// IWorkLock.cs · NamedWorkLock.cs
public interface IWorkLock { IDisposable? TryEnter(TimeSpan wait); }   // 못 잡으면 null
public sealed class NamedWorkLock : IWorkLock { public const string Name = @"Local\SeoseungkwanPrecheckHelper.Work"; }   // System.Threading.Mutex, abandoned는 잡은 것으로
// ContactCommands.cs 에 더함
public static void RegisterStore(Dispatcher dispatcher, BitServices services, ContactStore store, IWorkLock workLock);
```
- 파일 이름 `contact.dat`. 쓰기·`.bak`·깨진 파일 이름 바꾸기는 `RegistrationFile`·`RegistrationStore`가 하는 방식과 같게 한다(새 방식을 만들지 않는다)
- `store.load`: `args`에 `contact: true`만 있어야 한다. 다른 칸(`months`·`settings`)이 있으면 `E-HELPER-BAD-MESSAGE`. 등록 확인(`HospitalGate`) → `Load(registration.ProfileId)` → `Chunker.Send`
- `store.save`: payload 칸이 `contact` 하나여야 한다. 등록 확인 → 뮤텍스 5초 → `Save` → `sink.Result({ saved: true })`
- 진단 기록에는 명령 이름·오류 번호만

### 2. 연결
- `ContactHelperServices.cs`: `ContactStore(HelperServices.DataDirectory(), new DpapiProtector())`와 `NamedWorkLock`을 만든다
- `Program.cs`: `ContactCommands.RegisterStore(…)` 한 줄. 주석: "청구 작업 저장(precheck TASK-15)이 생기면 그 처리기가 contact 칸을 ContactStore에 맡기고 이 줄을 지운다"

### 3. 시험 (`helper/tests/Precheck.Core.Tests/Contact/Store/*.test.cs`, 이름공간 `Precheck.Core.Tests.Contact.Store`)
- 가짜 `IProtector`(뒤집기 같은 되돌릴 수 있는 바꾸기)·임시 폴더: 왕복(AC-606.1·606.2), 다른 프로필 → `{}`, 깨진 파일 → `.bak`, 둘 다 깨짐 → `E-STORE-BROKEN`이고 깨진 파일이 이름만 바뀌어 남음(AC-606.3), 쓰기 막힌 폴더 → `E-STORE-FAILED`, `months`·`settings` 칸 → `E-HELPER-BAD-MESSAGE`, 32MB + 1 → 거절(AC-606.4), 가짜 잠금이 null → `E-BRIDGE-BUSY`(AC-606.5), 저장 파일 바이트에 평문 JSON 글자가 없다
- 감싸개 `helper/tests/contact-store.dotnet.test.ts`: `runDotnet('Precheck.Core.Tests.Contact.Store')`

## TDD 순서

1. 시험을 먼저 쓴다. C# 시험 파일 이름은 `*.test.cs`다(하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-605.2 32일이면 E-HELPER-BAD-MESSAGE")]`
2. 하네스 TDD 기록은 vitest 감싸개 `helper/tests/contact-store.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('Precheck.Core.Tests.Contact.Store')`를 부르고, `it` 이름에도 AC ID를 넣는다(예: `helper/tests/bit-connect.dotnet.test.ts`처럼 AC마다 그 AC ID가 붙은 C# 시험이 돌았고 실패가 없는지 본다). 시간 제한은 넉넉히(300초)
3. RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
4. `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect red` → 구현 → `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green` → 정리 뒤 다시 green
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Contact|FullyQualifiedName~Precheck.Core.Tests.Registration|FullyQualifiedName~Precheck.Core.Tests.Protocol"
npx vitest run helper/tests/contact-store.dotnet.test.ts     # AC-606.1~AC-606.5
npx vitest run helper/tests/contact-read.dotnet.test.ts helper/tests/protocol.dotnet.test.ts helper/tests/bit-connect.dotnet.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-606.1 ~ AC-606.5가 이 TASK의 시험과 이어져 보여야 한다

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

- `contact`를 평문으로 쓰거나 임시 평문 파일을 남기지 마라. 이유: 환자 이름·전화가 PC에 그대로 남는다(ADR-020)
- `helper/src/Precheck.Core/Store/*`에 파일을 만들지 마라. 이유: 그 폴더는 precheck TASK-15 몫이다. 이 step의 저장 부품은 `Contact/`에 둔다
- 청구 작업 저장 칸(`months`·`drafts`·`done`·`journal`·`settings`)을 받아 처리하지 마라. 이유: precheck TASK-15가 만든다(AC-606.4)
- 깨진 파일을 지우지 마라. 이유: 이름만 바꿔 남긴다(precheck design.md 9-3과 같다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
