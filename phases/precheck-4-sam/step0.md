# Step 0: sam-read

> **TASK-20** 심평원 청구 파일 읽기 (도우미) · **REQ-020** · AC-020.1 ~ AC-020.4
> Phase 4 `precheck-4-sam` · Step 0 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-20 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-020에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-020.1**: 가짜 폴더 `<청구월>\<전송폴더>\<청구번호>.GHP|.CAR`에서 `sam.latest`는 원본 `latest_sam_files`처럼 머리 80바이트 `(\d{10})([HC]\d{3})(\d{8})`로 청구번호·서식·기관기호를 읽고 종류(H010 건강보험·H011 의료급여·CAR 자동차보험)마다 수정 시각이 가장 늦은 파일을 고른다. 32MB 넘는 파일은 뺀다
- **AC-020.2**: 머리의 기관기호가 등록 기관기호와 다르면 그 파일은 읽지 않는다. 기관기호가 등록돼 있지 않으면 하나도 읽지 않는다(`E-BIT-NOT-REGISTERED`)
- **AC-020.3**: 고른 파일을 `{version: 1, files: [{kind, name, month, modified, size, data(base64)}]}`로 조각으로 보낸다. 파일이 없으면 `E-SAM-NOT-FOUND`
- **AC-020.4**: 폴더 밖을 가리키는 이름(`..`·링크)은 따라가지 않는다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-020
- `/specs/precheck/design.md` — 2절 표(SAM 읽기 원본), 4-3절(`sam.latest`), 9-5절(SAM: 늘 등록 기관기호로 거른다)
- `/specs/precheck/tasks.md` — TASK-20 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `helper/src/Precheck.Core/Protocol/*`(Chunker), `helper/src/Precheck.Helper/Commands/*`(등록 확인 관문), `helper/src/Precheck.Core/Registration/*` (Phase 1)
  - `src/lib/bridge/commands.json` (`sam.latest` args는 `{}`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `medicore/sam_files.py` (`latest_sam_files(root, institution_code)` 35줄, `SAM_BACKUP`, 폴더 `backup\(청구월)\(전송 폴더)\(청구번호).GHP|.CAR`)
  - `tests/test_sam_files.py` (옮길 사례)

## 수정 범위 (tasks.md TASK-20)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Sam/*`
  - `helper/src/Precheck.Helper/Commands/*`
  - `helper/tests/Precheck.Core.Tests/Sam/*`
  - `.gitignore`
- Tests:
  - `helper/tests/sam.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다(크롬 한도 1MB). 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다 (design.md 4절, AC-001.5)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·FlaUI·DPAPI·WinForms 창·레지스트리)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. NuGet 판은 정확한 버전으로 고정한다(범위·`*` 없음). 비트 DLL은 함께 싣지 않고 의원 PC의 `C:\DrBIT50\EXE`에서 불러온다 (ADR-016, design.md 14절)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 환자 자료·메모·차트번호·이름·전화를 어디에도(기록·예외 메시지·창 제목) 쓰지 않는다 (AC-001.6)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)

## 작업

### 1. `.gitignore` 먼저
- 실제 청구 파일을 막는 줄: `*.[gG][hH][pP]`, `*.[cC][aA][rR]`(대소문자 무시). 시험은 임시 폴더에 가짜 파일을 만들고 저장소에 두지 않는다

### 2. Core (`Precheck.Core/Sam/SamFiles.cs`)
```csharp
public sealed class SamFile { public string Kind; public string Name; public string Month; public DateTime Modified; public long Size; public byte[] Data; }
public static class SamFiles {
  public const long MaxBytes = 32L * 1024 * 1024;
  public static IReadOnlyList<SamFile> Latest(string root, string registeredInstitution);   // 원본 latest_sam_files + 늘 기관기호로 거름
  public static string ToJson(IReadOnlyList<SamFile> files);   // {version:1, files:[{kind,name,month,modified,size,data(base64)}]}
}
```
- 원본 줄을 옮긴다: `root/*/*/*` 모양만, 머리 80바이트 정규식, 종류마다 수정 시각이 가장 늦은 것, 32MB 넘으면 뺌
- 원본과 다른 점(design.md 9-5): 원본은 기관기호가 없으면 거르지 않았다. 우리는 **늘** 등록 기관기호로 거르고, 등록이 없으면 하나도 읽지 않는다(`E-BIT-NOT-REGISTERED`)
- `..`·심볼릭 링크·윈도우 재분석 지점(정션)은 따라가지 않는다. 고른 경로가 `root` 안인지 정규화해 다시 확인한다
- 루트는 `C:\HIRA\DDMD\sam\in\backup`(상수 한 곳). 시험은 임시 폴더를 넘긴다

### 3. 명령 `sam.latest`
- 등록 확인(관문) → `Latest` → 없으면 `error E-SAM-NOT-FOUND` → 있으면 JSON → `Chunker.Split`(base64라 크다 — 조각 수가 많아도 메시지마다 1MB 이하)

### 4. 시험 (Core, 임시 폴더에 가짜 파일)
- 종류마다 최신 고르기·32MB 넘는 파일 빼기(AC-020.1), 다른 기관기호 파일 빠짐·등록 없음 → `E-BIT-NOT-REGISTERED`(AC-020.2), JSON 모양·없음 → `E-SAM-NOT-FOUND`(AC-020.3), `..`·링크 안 따라감(AC-020.4, 리눅스 심볼릭 링크로)
- 가짜 파일 머리는 가짜 청구번호·기관기호(`99999999` 등). 원본 `test_sam_files.py` 사례를 옮긴다
- 감싸개 `sam.dotnet.test.ts`: `runDotnet('Precheck.Core.Tests.Sam')`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-20 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-20 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(예: `helper/tests/Precheck.Core.Tests/Protocol/Framing.test.cs`, 하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-001.1 길이 0이면 E-HELPER-BAD-MESSAGE")]`
- 하네스 TDD 기록은 vitest 감싸개 `helper/tests/sam.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 클래스나 이름공간>')`을 부르고, `it` 이름에도 AC ID를 넣는다. 감싸개 시험 시간 제한은 넉넉히(예: 300초) 준다
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Sam"
npx vitest run helper/tests/sam.dotnet.test.ts               # AC-020.1~AC-020.4
git check-ignore -q x.GHP && git check-ignore -q y.car         # 실제 청구 파일이 커밋되지 않음
python3 ~/.claude/harness/bin/tdd-run TASK-20 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-020.1 ~ AC-020.4이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-4-sam/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 기관기호가 다른 파일이나 등록 전 파일을 읽지 마라. 이유: 다른 병원 청구 자료(환자 정보)를 읽게 된다(AC-020.2)
- 실제 `.GHP`·`.CAR` 파일을 `fixtures/`나 시험 폴더에 두지 마라. 이유: 실제 청구 파일에는 환자 정보가 있다. 시험은 임시 폴더의 가짜 파일만
- `root` 밖 경로·링크를 따라가지 마라. 이유: 다른 폴더의 파일을 읽어 웹으로 보낼 수 있다(AC-020.4)
- 파일 이름·청구번호를 진단 기록에 쓰지 마라. 이유: 기록은 시각·명령 이름·오류 번호만(AC-001.6)
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 Phase 도우미 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
