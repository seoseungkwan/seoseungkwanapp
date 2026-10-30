# Step 1: bit-claim-read

> **TASK-8** 한 달 자료 · 12개월 이력 읽기 (도우미) · **REQ-008** · AC-008.1 ~ AC-008.5
> Phase 2 `precheck-2-rules` · Step 1 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-8 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-008에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-008.1**: 기간(시작·끝 날을 함께 세어 35일 이하, 달을 넘겨도 됨)으로 `claim.month` → 증상(83)·상병(83D)·소모(47) 표 줄과 12개월 이력(기간 시작 365일 전부터 기간 끝까지. 400일 이하라 원본 `RxHistory.MaximumDays` 안)·상병 추세·처방 목록을 하나의 JSON으로 만들어 조각으로 보낸다. 칸은 원본 `build`·`parseRx`·`claim_import.py`가 읽는 칸만 남긴다
- **AC-008.2**: 이력·이미 있는 메모·상병 추세 SQL은 `Sql.cs`와 원본(`RxHistory.VisitSql`·`CodeSql`, `ClaimMemoHistory.RowsSql`, `RxDiagnosisTrend`)이 공백만 다르다. 이력 줄 모양은 원본처럼 `{v, p, d, c[], m}`
- **AC-008.3**: 비트 통계 화면 표(가짜 표 값)를 `GridRows`로 바꾸면 원본 `NativeMappings`의 키(83·83D·47)별 칸 이름으로 줄을 만들고, 필요한 칸이 없으면 `E-BIT-EXPORT-FAILED`로 그 명령 전체를 멈춘다
- **AC-008.4**: 표 하나라도 읽기 실패·시간 초과(원본 값: 메타 15초, 자료 120~150초)면 `end` 없이 `error`(`E-BIT-READ-FAILED` 또는 `E-BIT-EXPORT-FAILED`). 반쪽 자료를 보내지 않는다
- **AC-008.5**: `claim.dates` → 날짜별 외래 진료 수와 비트 메모가 있는 진료 수를 `result {days: [{date, visits, memoInBit}]}` 숫자만. 진료 0건인 날은 뺀다. 세는 조건은 원본 방문 조건(`OcmPatTyp='O'`·`OcmRsuYon<>'O'`·병원 범위)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-008
- `/specs/precheck/design.md` — 2절 표(한 달 자료·12개월 이력·이미 있는 메모·상병 추세·처방 목록 원본), 4-3절(`claim.month`·`claim.dates`), 9-2절(읽기), 10절(SQL 비교), 16절(통계 화면 DLL 위험)
- `/specs/precheck/tasks.md` — TASK-8 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `helper/src/Precheck.Core/Protocol/Chunker.cs`·`Dispatcher.cs` (Phase 1 Step 0)
  - `helper/src/Precheck.Core/Bit/*` (`Sql`·`ReadOnlyGuard`·`IBitDb`·`HospitalCheck`), `helper/src/Precheck.Windows/SqlBitDb.cs`, `helper/src/Precheck.Helper/Commands/*`(등록 확인 관문) (Phase 1 Step 4)
  - `helper/tests/Precheck.Core.Tests/Bit/original-sql/*` (Phase 1 Step 4)
  - `src/lib/bridge/commands.json` (`claim.month`·`claim.dates` args)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `vendor/drbit_export/NativeReportAdapter.cs`·`NativeMappings.cs`·`Handoff.cs`·`HandoffTests.cs` (비트 통계 화면 DLL `BITSSElectricData.dll`·`BITSDepOdrPatList.dll`을 불러 표 읽기, 키 83·83D·47)
  - `vendor/drbit_export/RxHistory.cs` (`VisitSql`·`CodeSql`, `MaximumDays = 400`)
  - `vendor/drbit_export/ClaimMemoHistory.cs` (`RowsSql`, 방문 조건)
  - `vendor/drbit_export/RxDiagnosisTrend.cs`, `PrescriptionCatalog.cs`, `LaCatalog.cs`
  - `medicore/claim_import.py`, `assets/mx999_v22.html`의 `build`·`parseRx`·`loadHistory` (어느 칸을 읽는지)

## 수정 범위 (tasks.md TASK-8)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Bit/*`
  - `helper/src/Precheck.Core/Claim/*`
  - `helper/src/Precheck.Windows/VendorGridExport.cs`
  - `helper/src/Precheck.Windows/SqlBitDb.cs`
  - `helper/src/Precheck.Helper/Commands/*`
  - `helper/tests/Precheck.Core.Tests/Bit/*`
  - `helper/tests/Precheck.Core.Tests/Claim/*`
  - `helper/tests/Precheck.Windows.Tests/Claim/*`
- Tests:
  - `helper/tests/claim-read.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **비트는 읽기만**: `Sql.cs`에 정해 둔 SELECT 상수만 매개변수로 돌리고, 끝내지 않는(되돌리는) 트랜잭션 안에서 읽는다(원본 `ReadOnlyConnection` 그대로). SQL 글자를 이어 붙이지 않는다. 읽기·입력 명령 전에는 늘 등록 병원(기관기호·범위·설치 위치·서버·DB 이름)을 다시 확인한다 (AC-005.3·005.6)
- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다(크롬 한도 1MB). 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다 (design.md 4절, AC-001.5)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·FlaUI·DPAPI·WinForms 창·레지스트리)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. NuGet 판은 정확한 버전으로 고정한다(범위·`*` 없음). 비트 DLL은 함께 싣지 않고 의원 PC의 `C:\DrBIT50\EXE`에서 불러온다 (ADR-016, design.md 14절)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 환자 자료·메모·차트번호·이름·전화를 어디에도(기록·예외 메시지·창 제목) 쓰지 않는다 (AC-001.6)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)

## 작업

### 1. SQL 상수 (`Core/Bit/Sql.cs`)
- 원본에서 그대로 옮긴다: `RxHistory.VisitSql`·`CodeSql`, `RxDiagnosisTrend`의 SQL, `PrescriptionCatalog`·`LaCatalog`의 SQL, 그리고 `ClaimMemoHistory.RowsSql`(AC-008.2가 함께 비교한다. 이 명령 `claim.memos`는 TASK-16이 만든다)
- `claim.dates`의 세기 SQL은 원본 방문 조건(`OcmPatTyp='O'`, `OcmRsuYon<>'O'`, 병원 범위)을 그대로 쓴 새 SELECT다. 날짜별 진료 수와 `OcmBilCmt`가 비지 않은 진료 수만 센다
- 원본 SQL 사본을 `helper/tests/Precheck.Core.Tests/Bit/original-sql/*.sql`에 두고 공백만 다른지 비교(AC-008.2)

### 2. 표 줄 (`Core/Bit/GridRows.cs`)
```csharp
public static class GridRows {
  // key: "83" | "83D" | "47". 칸 이름은 비트 화면 것 그대로, 원본 NativeMappings 기준
  public static IReadOnlyList<IReadOnlyDictionary<string, string>> From(string key, IReadOnlyList<string> columns, IReadOnlyList<IReadOnlyList<string>> rows);
  // 필요한 칸이 없으면 BitException("E-BIT-EXPORT-FAILED"). 원본 build·parseRx·claim_import.py가 읽지 않는 칸은 버린다
}
```

### 3. 한 달 자료 모양 (`Core/Claim/ClaimMonthPayload.cs`)
- `claim.month {from, to}` 처리 순서: 등록 병원 확인 → 83·83D·47 표 읽기(`VendorGridExport`) → 이력(`from - 365일` ~ `to`. 명령 표가 `claim.month` 기간을 35일 이하로 막아 이 범위는 늘 400일 이하, 원본 `RxHistory.MaximumDays` 안이다. 나눠 읽지 않는다. 처리기도 400일을 넘으면 `E-HELPER-BAD-MESSAGE`로 한 번 더 막는다) → 상병 추세 → 처방 목록 → **모두 성공하면** JSON 하나 → `Chunker.Split`
- JSON 머리에 선언 값을 넣는다: `{ "version": 1, "period": {from, to}, "historyRange": {from, to}, "counts": {"s83": n, "s83d": n, "s47": n, "history": n}, … }`. TASK-9 Worker가 받은 줄 수와 비교한다(AC-009.4)
- 하나라도 실패·시간 초과(메타 15초, 자료 120~150초, 원본 값)면 `error` 하나만 보낸다(`end` 없음)

### 4. 날짜별 수 (`Core/Claim/ClaimDates.cs`)
- `claim.dates {from, to}` → `result {days: [{date, visits, memoInBit}]}`. 진료 0건인 날은 빼고, 숫자만

### 5. Windows
- `VendorGridExport.cs`: 원본 `NativeReportAdapter`처럼 비트 통계 화면을 숨겨서 열고 날짜를 넣어 표(칸 이름 + 줄)를 읽어 `GridRows`에 넘긴다. 비트 DLL은 `C:\DrBIT50\EXE`에서
- `SqlBitDb.cs`: 시간 제한 값을 명령마다 받게 한다

### 6. 시험
- Core(`Bit/*`·`Claim/*`): 원본 SQL 비교, 가짜 칸 표 → 줄(필요 칸 빠지면 `E-BIT-EXPORT-FAILED`), 가짜 `IBitDb`·가짜 표 읽기로 `claim.month` 전체 → 조각을 이으면 JSON 하나·`counts` 맞음, 표 하나 실패 → `error`만·`end` 없음, `claim.dates` 0건 날 빠짐
- Windows(`Precheck.Windows.Tests/Claim/*`): Actions에서. 실제 비트 화면은 의원 PC
- 가짜 줄의 이름·차트번호는 '가상환자NN'·`9`로 시작하는 6자리

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(예: `helper/tests/Precheck.Core.Tests/Protocol/Framing.test.cs`, 하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-001.1 길이 0이면 E-HELPER-BAD-MESSAGE")]`
- 하네스 TDD 기록은 vitest 감싸개 `helper/tests/claim-read.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 클래스나 이름공간>')`을 부르고, `it` 이름에도 AC ID를 넣는다. 감싸개 시험 시간 제한은 넉넉히(예: 300초) 준다
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Bit|FullyQualifiedName~Precheck.Core.Tests.Claim"
npx vitest run helper/tests/claim-read.dotnet.test.ts        # AC-008.1~AC-008.5
npx vitest run helper/tests/bit-connect.dotnet.test.ts helper/tests/protocol.dotnet.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
# Precheck.Windows.Tests/Claim은 push 뒤 Actions에서 → summary에 [Actions 확인 남음]
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-008.1 ~ AC-008.5이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-2-rules/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 표를 읽는 도중에 조각을 보내기 시작하지 마라. 이유: 뒤 표가 실패하면 반쪽 자료가 이미 나간다. 다 모은 뒤 나눈다(AC-008.4)
- 원본 SQL을 '더 낫게' 고치지 마라(조건·칸·정렬 포함). 이유: 원본과 공백만 달라야 한다(AC-008.2). 결과가 양지바른과 같아야 의원 PC 비교가 된다
- 필요 없는 칸(주민번호·주소 전체·보험 번호 등)을 JSON에 남기지 마라. 이유: 원본이 읽는 칸만 남긴다(AC-008.1). 필요한 것만 읽는다(CLAUDE.md)
- 등록 병원 확인을 건너뛰는 길을 만들지 마라. 이유: 다른 병원 DB를 읽으면 안 된다(AC-005.6)
- 기존 테스트를 깨뜨리지 마라. 이유: Phase 1의 dotnet 감싸개 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
