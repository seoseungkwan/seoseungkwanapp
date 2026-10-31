# Step 0: followup-read

> **TASK-23** F/U · 정기 주사 대상 읽기 (도우미) · **REQ-023** · AC-023.1 ~ AC-023.3
> Phase 5 `precheck-5-contact` · Step 0 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-23 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-023에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-023.1**: 기간(F/U는 최근 120일, 정기 주사는 36개월 이하)으로 `contact.targets` → 원본 F/U·정기 주사 계산이 읽는 칸(증상 83 표의 내원일·차트번호·이름·증상 글·처방 코드, 전화번호)만 읽어 조각으로. 전화번호를 읽는 곳은 원본 `revisit_source_boot.js`·`revisit_source_parts.py`가 쓰는 자리와 같다
- **AC-023.2**: 줄 수가 원본 한도(50,000줄)를 넘으면 원본처럼 자르지 않고 `E-BIT-READ-FAILED`로 멈춘다(일부만 보내지 않는다)
- **AC-023.3**: 읽기 실패·시간 초과면 `end` 없이 `error`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-023
- `/specs/precheck/design.md` — 2절 표(F/U 목록·정기 주사 명단 원본), 4-3절(`contact.targets`), 9-2절(읽기·일부만 오면 멈춤), 16절(정기 주사 36개월 읽기 시간)
- `/specs/precheck/tasks.md` — TASK-23 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `helper/src/Precheck.Core/Bit/*`(`GridRows`·`Sql`·`IBitDb`), `helper/src/Precheck.Windows/VendorGridExport.cs`·`SqlBitDb.cs` (Phase 2 Step 1)
  - `helper/src/Precheck.Helper/Commands/*`(등록 확인 관문), `helper/src/Precheck.Core/Protocol/*` (Phase 1)
  - `src/lib/bridge/commands.json` (`contact.targets {kind, from, to}`, 표의 최대 1,100일)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `tools/revisit_source_boot.js` (`NEW_MEDICORE_RECALL`, 정기 주사 명단이 읽는 칸·전화번호 자리)
  - `tools/revisit_source_parts.py` (F/U 적어 둔 날짜, 전화번호 자리)
  - `assets/revisit_schedule.html` (`parseFU` 등이 읽는 칸)
  - `vendor/drbit_export/TreatmentUsage.cs` (`MaximumDays = 1100`, 36개월 읽기 참고)
  - `tests/test_revisit_source.py`, `tests/test_revisit_import_html.py`

## 수정 범위 (tasks.md TASK-23)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Contact/*`
  - `helper/src/Precheck.Core/Bit/*`
  - `helper/src/Precheck.Windows/VendorGridExport.cs`
  - `helper/src/Precheck.Windows/SqlBitDb.cs`
  - `helper/src/Precheck.Helper/Commands/*`
  - `helper/tests/Precheck.Core.Tests/Contact/*`
- Tests:
  - `helper/tests/contact-read.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **비트는 읽기만**: `Sql.cs`에 정해 둔 SELECT 상수만 매개변수로 돌리고, 끝내지 않는(되돌리는) 트랜잭션 안에서 읽는다(원본 `ReadOnlyConnection` 그대로). SQL 글자를 이어 붙이지 않는다. 읽기·입력 명령 전에는 늘 등록 병원(기관기호·범위·설치 위치·서버·DB 이름)을 다시 확인한다 (AC-005.3·005.6)
- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다(크롬 한도 1MB). 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다 (design.md 4절, AC-001.5)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·FlaUI·DPAPI·WinForms 창·레지스트리)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. NuGet 판은 정확한 버전으로 고정한다(범위·`*` 없음). 비트 DLL은 함께 싣지 않고 의원 PC의 `C:\DrBIT50\EXE`에서 불러온다 (ADR-016, design.md 14절)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 환자 자료·메모·차트번호·이름·전화를 어디에도(기록·예외 메시지·창 제목) 쓰지 않는다 (AC-001.6)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)

## 작업

### 1. 시작 전에 원본 확인 (tasks.md TASK-23 메모)
- 전화번호를 어디서 읽는지 원본 `revisit_source_boot.js`·`revisit_source_parts.py`로 먼저 확인한다. 원본이 비트 DB에서 따로 읽으면 그 SQL을 `Sql.cs`에 그대로 옮기고(원본 사본을 `original-sql/`에 두고 비교), 증상 83 표에서 읽으면 `GridRows`의 칸으로 읽는다. 무엇으로 정했는지 summary에 적는다

### 2. Core (`Precheck.Core/Contact/*`)
```csharp
public static class ContactTargets {
  public const int MaxRows = 50_000;                          // 원본 한도
  public static string Build(string kind, DateTime from, DateTime to, IBitDb db, IGridSource grid);  // JSON. 넘으면 BitException("E-BIT-READ-FAILED")
}
```
- `kind`별 기간: `followup` 최근 120일 이하, `injection` 36개월 이하(명령 표는 1,100일까지 받고 여기서 한 번 더 막는다 → `E-HELPER-BAD-MESSAGE`)
- 남기는 칸: 내원일·차트번호·이름·증상 글·처방 코드·전화번호. 그 밖의 칸은 버린다
- 50,000줄을 넘으면 원본처럼 자르지 않고 멈춘다(AC-023.2). 실패·시간 초과는 `end` 없이 `error`(AC-023.3)
- 36개월 읽기 시간(design.md 16절): 너무 길면 달마다 나눠 읽는다. 나눈 조각 하나라도 실패하면 전체를 멈춘다(규칙은 같다). 다 모은 뒤 `Chunker.Split`

### 3. 명령 `contact.targets`
- 등록 확인 → `Build` → `Chunker.Split`

### 4. 시험 (Core, 가짜 `IBitDb`·가짜 표)
- 남기는 칸만(AC-023.1), 50,001줄 → `E-BIT-READ-FAILED`이고 조각 없음(AC-023.2), 실패 → `error`만(AC-023.3), `kind`별 기간 막기
- 가짜 전화는 `010-0000-NNNN`
- 감싸개 `contact-read.dotnet.test.ts`: `runDotnet('Precheck.Core.Tests.Contact')`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-23 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-23 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(예: `helper/tests/Precheck.Core.Tests/Protocol/Framing.test.cs`, 하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-001.1 길이 0이면 E-HELPER-BAD-MESSAGE")]`
- 하네스 TDD 기록은 vitest 감싸개 `helper/tests/contact-read.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 클래스나 이름공간>')`을 부르고, `it` 이름에도 AC ID를 넣는다. 감싸개 시험 시간 제한은 넉넉히(예: 300초) 준다
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Contact|FullyQualifiedName~Precheck.Core.Tests.Bit"
npx vitest run helper/tests/contact-read.dotnet.test.ts      # AC-023.1~AC-023.3
npx vitest run helper/tests/claim-read.dotnet.test.ts        # Bit 공용 코드를 바꿔도 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-23 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-023.1 ~ AC-023.3이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-5-contact/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 한도를 넘는 명단을 잘라서 보내지 마라. 이유: 일부만 보내면 연락해야 할 환자가 빠진다(AC-023.2)
- 원본이 읽지 않는 칸(주소·주민번호 등)을 읽거나 보내지 마라. 이유: 필요한 것만 읽는다(CLAUDE.md, AC-023.1)
- 전화번호·이름을 진단 기록·예외 메시지에 넣지 마라. 이유: 기록은 시각·명령 이름·오류 번호만(AC-001.6)
- `Sql.cs`의 기존 상수와 `GridRows`의 기존 칸 규칙을 바꾸지 마라. 이유: Phase 2·3의 원본 비교 시험이 깨진다. 더하기만 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 도우미 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
