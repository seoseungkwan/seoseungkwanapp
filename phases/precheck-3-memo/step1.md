# Step 1: helper-store

> **TASK-15** 도우미 작업 저장 (DPAPI) · **REQ-015** · AC-015.1 ~ AC-015.7
> Phase 3 `precheck-3-memo` · Step 1 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-15 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-015에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-015.1**: `store.save {month, drafts, done, contact?}`는 `data\work-YYYY-MM.dat`(연락은 `contact.dat`)에 머리 `PRECHECK-STORE-1\n` + 암호화(DPAPI `CurrentUser`, 고정 entropy)로 쓴다. 임시 파일에 쓴 뒤 바꿔치기하고 `.bak` 하나를 둔다
- **AC-015.2**: `store.load {months}` → 그 달들의 저장 내용을 조각으로. 파일이 없으면 빈 내용
- **AC-015.3**: 깨진 파일(머리 다름·풀기 실패·JSON 깨짐)이면 `.bak`이 맞으면 그것을 쓰고, 아니면 `E-STORE-BROKEN`. 깨진 파일은 지우지 않고 이름을 바꿔 둔다
- **AC-015.4**: 저장 내용의 병원(등록 프로필 ID)이 등록 병원과 다르면 읽지도 덮어쓰지도 않고 `E-BIT-HOSPITAL-MISMATCH`
- **AC-015.5**: 도우미가 `store.save`를 처리할 때 13개월보다 오래된 `work-*.dat`를 지운다
- **AC-015.6**: 가짜 암호화 `IProtector`로 저장 뒤 다시 읽으면 같은 내용. 평문 파일이 디스크에 남지 않는다(임시 파일도 암호화한 뒤 쓴다)
- **AC-015.7**: `store.save {settings}`(서버에서 받은 설정 사본, 환자 정보 아님)는 `settings.dat`에 같은 방식으로 두고 `store.load {settings: true}`로 돌려준다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-015
- `/specs/precheck/design.md` — 9-3절(작업 저장), 4-3절(`store.load`·`store.save`), 9-4절(입력 기록 `Journal`은 작업 저장 안), 15절(설정 사본·13개월 보관)
- `/specs/precheck/tasks.md` — TASK-15 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `helper/src/Precheck.Core/Store/IProtector.cs`, `helper/src/Precheck.Windows/DpapiProtector.cs`, `helper/src/Precheck.Core/Registration/*`(`ProfileId`, 등록 파일 틀) (Phase 1 Step 4)
  - `helper/src/Precheck.Core/Protocol/*`(Chunker·Dispatcher), `helper/src/Precheck.Helper/Commands/*`(등록 확인 관문) (Phase 1)
  - `src/lib/bridge/commands.json` (`store.load`·`store.save` args. `store.save`는 `{payload}` 안쪽 모양)
  - `src/components/claim/*` (Phase 2 Step 6: 웹이 `store.load`·`store.save {settings}`를 어떻게 부르는지)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - 원본 작업 저장은 다른 방식(양지바른 앱 저장소)이라 옮기지 않는다. 이어서 하기 생각만 참고: `medicore/workspace_state.py`, `tests/test_workspace_state.py`, `tools/claim_input_lifecycle.py`

## 수정 범위 (tasks.md TASK-15)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Store/*`
  - `helper/src/Precheck.Windows/DpapiProtector.cs`
  - `helper/src/Precheck.Helper/Commands/*`
  - `helper/tests/Precheck.Core.Tests/Store/*`
  - `helper/tests/Precheck.Windows.Tests/Store/*`
- Tests:
  - `helper/tests/store.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다(크롬 한도 1MB). 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다 (design.md 4절, AC-001.5)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·FlaUI·DPAPI·WinForms 창·레지스트리)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. NuGet 판은 정확한 버전으로 고정한다(범위·`*` 없음). 비트 DLL은 함께 싣지 않고 의원 PC의 `C:\DrBIT50\EXE`에서 불러온다 (ADR-016, design.md 14절)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 환자 자료·메모·차트번호·이름·전화를 어디에도(기록·예외 메시지·창 제목) 쓰지 않는다 (AC-001.6)
- **브라우저 저장소 안 씀**: 고친 메모·완료 표시·입력 기록·연락 표시·설정 사본은 도우미 작업 저장(`store.save`)에만 둔다. `localStorage`·`sessionStorage`·`indexedDB`에 두지 않는다 (ADR-020)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)

## 작업

### 1. Core (`Precheck.Core/Store/*`, 시그니처)
```csharp
public interface IStoreFolder { string Path { get; } }   // 시험은 임시 폴더
public sealed class WorkStore {
  public WorkStore(IStoreFolder folder, IProtector protector, Registration current, Func<DateTime> today);
  public void SaveMonth(string month, JsonElement drafts, JsonElement done, JsonElement? journal);  // work-YYYY-MM.dat
  public void SaveContact(JsonElement contact);                                                   // contact.dat
  public void SaveSettings(JsonElement settings);                                                 // settings.dat
  public string Load(IReadOnlyList<string> months, bool settings, bool contact);                   // JSON 글자(조각으로 보낼 것)
  public void Prune();                                                                            // 13개월 지난 work-*.dat 지움
}
```
- 파일 틀: `PRECHECK-STORE-1\n` + `IProtector.Protect(JSON 바이트)`. JSON 안에 `profileId`(등록 병원)를 넣고, 읽을 때 지금 등록과 다르면 `E-BIT-HOSPITAL-MISMATCH`(읽지도 덮어쓰지도 않음)
- 쓰기: 암호화한 바이트를 임시 파일에 → `File.Replace(tmp, target, target + ".bak")`(처음이면 `Move`). 임시 파일에도 평문을 쓰지 않는다
- 깨짐: 머리 다름·풀기 실패·JSON 깨짐 → `.bak`을 같은 방식으로 읽어 맞으면 그것을 쓴다. 아니면 깨진 파일 이름을 `*.broken-<시각>`으로 바꾸고 `E-STORE-BROKEN`
- `Prune`: 오늘 기준 13개월보다 오래된 `work-YYYY-MM.dat`(와 `.bak`)만 지운다. `store.save` 처리 때 부른다
- 입력 기록(`journal`, TASK-17이 쓴다)도 같은 달 파일 안에 둔다(design.md 9-4)

### 2. 명령 (`Precheck.Helper/Commands/*`)
- `store.save`: 등록 확인 → args 안쪽 모양 검사(`month` 모양, `drafts`·`done`·`journal`·`contact`·`settings`는 object) → 저장 → `Prune` → `result {saved: true}`. 웹이 보내는 `args`는 `{payload: 글자}`이고, 명령 표 검사(TASK-1)가 `payload`를 풀어 처리기에는 안쪽 값을 넘긴다(AC-001.2)
- `store.load`: 등록 확인 → `Load` → `Chunker.Split`(환자 자료 명령이라 늘 조각). 파일이 없으면 빈 내용
- 저장 폴더: `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data\`(설치·업데이트가 지우지 않는 곳)

### 3. Windows
- `DpapiProtector`: Phase 1 것을 쓰고, 고정 entropy를 상수 한 곳에 둔다. 필요하면 손본다
- `Precheck.Windows.Tests/Store/*`: 실제 DPAPI 왕복, 다른 entropy로는 못 푼다(Actions에서)

### 4. 시험 (Core, 가짜 `IProtector`)
- 저장 → 읽기 같음, 디스크에 평문 글자('가상환자01')가 어느 파일에도 없음(AC-015.6), 파일 없음 → 빈 내용(AC-015.2), 깨진 파일 → `.bak` 사용·`.bak`도 깨짐 → `E-STORE-BROKEN` + 이름 바뀐 파일 남음(AC-015.3), 다른 `profileId` → `E-BIT-HOSPITAL-MISMATCH`이고 파일이 그대로(AC-015.4), 13개월 지난 파일만 지움(AC-015.5), `settings.dat` 왕복(AC-015.7), `.bak` 하나(AC-015.1)
- 감싸개 `store.dotnet.test.ts`: `runDotnet('Precheck.Core.Tests.Store')`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(예: `helper/tests/Precheck.Core.Tests/Protocol/Framing.test.cs`, 하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-001.1 길이 0이면 E-HELPER-BAD-MESSAGE")]`
- 하네스 TDD 기록은 vitest 감싸개 `helper/tests/store.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 클래스나 이름공간>')`을 부르고, `it` 이름에도 AC ID를 넣는다. 감싸개 시험 시간 제한은 넉넉히(예: 300초) 준다
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Store"
npx vitest run helper/tests/store.dotnet.test.ts             # AC-015.1~AC-015.7
npx vitest run helper/tests/protocol.dotnet.test.ts helper/tests/bit-connect.dotnet.test.ts helper/tests/claim-read.dotnet.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
# Precheck.Windows.Tests/Store는 push 뒤 Actions에서 → summary에 [Actions 확인 남음]
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-015.1 ~ AC-015.7이 이 TASK의 시험과 이어져 보여야 한다

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

- 평문 JSON을 임시 파일이든 `.bak`이든 디스크에 쓰지 마라. 이유: PC를 다른 사람이 써도 고친 메모(환자 진료 내용)가 보이면 안 된다(AC-015.6)
- 깨진 저장 파일을 지우지 마라. 이유: 되살릴 수 있는 마지막 자료다. 이름을 바꿔 둔다(AC-015.3)
- 병원이 다른 저장 파일을 덮어쓰지 마라. 이유: 다른 병원(다른 등록) 자료를 지우게 된다(AC-015.4)
- 저장 내용·경로의 달 이름 외 값을 진단 기록에 쓰지 마라. 이유: 기록은 시각·명령 이름·오류 번호만(AC-001.6)
- 기존 테스트를 깨뜨리지 마라. 이유: Phase 1·2 도우미 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 구현 메모 (명세 2차 리뷰 참고 사항)
- `store.save`는 파일 전체를 덮어쓰지 않는다. 보낸 칸만 합치고, `journal`과 입력 결과는 도우미가 가진다. 입력 중에 고친 메모 저장이 입력이 끝난 뒤에 돌아도 입력 기록을 지우지 않게 한다. 시험으로 증명한다
- 기관기호가 다른 병원으로 다시 등록한 뒤 남은 예전 작업 파일 때문에 `store.load`가 계속 `E-BIT-HOSPITAL-MISMATCH`로 멈추지 않게 한다. 그 파일은 '다른 병원 작업'으로 따로 두고 건너뛴다
