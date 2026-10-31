# Step 0: helper-stats-read

> **TASK-27** 통계 자료 읽기 (도우미 · Worker 연결) · **REQ-027** · AC-027.1 ~ AC-027.4
> Phase 6 `precheck-6-stats` · Step 0 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-27 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-027에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-027.1**: 기간으로 `stats.rows` → 비트 '환자별 소모 통계'(47) 표 줄을 지금 파일 파서가 읽는 칸(처방코드·처방명칭·유형·처방일자·차트번호·초재진구분·외래/입원·주소)만으로, 처방 추세 사실(원본 `TrendDataSource`: 코드·날짜·차트번호·건수·소모량·금액·신환 여부)과 일 운영 숫자(원본 `OperationalReportData`: 날짜별 집계와 환불·변경수납·예치금 여부)를 조각으로
- **AC-027.2**: 같은 가짜 자료를 파일과 도우미 줄 두 길로 넣어 Worker가 `ConsumptionRow`로 바꿔 지금 `aggregate`에 넣으면 두 결과가 같다(파일 올리기는 그대로 둔다)
- **AC-027.3**: 추세·운영 SQL은 `Sql.cs`와 원본이 공백만 다르다
- **AC-027.4**: 표·SQL 하나라도 실패하면 `stats.rows`는 반쪽 자료를 보내지 않고 `error`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-027
- `/specs/precheck/design.md` — 2절 표(처방 추세·일일 보고 원본), 4-3절(`stats.rows`), 9-2절(읽기·일부만 오면 멈춤), 15절(통계 금액·소모량은 도우미 자료에만)
- `/specs/precheck/tasks.md` — TASK-27 (수정 범위·메모)
- `/src/lib/parsers/bit/columnMap.ts`, `/src/lib/parsers/bit/parseBit.ts`, `/src/types/consumption.ts` (`ConsumptionRow`: 지금 파일 파서가 읽는 칸)
- `/src/lib/analytics/aggregate.ts`, `/src/workers/analyzeFiles.ts` (지금 통계 계산 길)
- `/fixtures/make-fake-fixtures.ts`, `/fixtures/fake-bit/` (지금 가짜 비트 파일)
- 이전 step에서 만든 파일:
  - `helper/src/Precheck.Core/Bit/*`(`GridRows` 47, `Sql`, `IBitDb`), `helper/src/Precheck.Windows/VendorGridExport.cs`·`SqlBitDb.cs` (Phase 2 Step 1)
  - `helper/src/Precheck.Helper/Commands/*`(등록 확인 관문), `Protocol/Chunker` (Phase 1)
  - `src/workers/precheck/jobs.ts`·`assemble.ts`, `src/types/precheck.ts` (Phase 2~5)
  - `src/lib/bridge/commands.json` (`stats.rows {from, to}`, 800일 이하)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `vendor/drbit_export/TrendDataSource.cs` (추세 사실 SQL, `@to`·`@priorTo` 매개변수)
  - `vendor/drbit_export/TrendContracts.cs` (`TrendRequest`: `From`·`To`·`Bucket`·`Comparison`·`PatientScope`·`Codes`)
  - `vendor/drbit_export/OperationalReportData.cs`(`SetFinanceUnconfirmed`)·`OperationalReportSql.cs`
  - `vendor/drbit_export/NativeMappings.cs` (47 표 칸)
  - `tests/test_trend_patient_sql.py`·`test_trend_visit_sql.py`·`tools/test_report_payment_sql.py`

## 수정 범위 (tasks.md TASK-27)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Stats/*`
  - `helper/src/Precheck.Core/Bit/*`
  - `helper/src/Precheck.Windows/VendorGridExport.cs`
  - `helper/src/Precheck.Windows/SqlBitDb.cs`
  - `helper/src/Precheck.Helper/Commands/*`
  - `helper/tests/Precheck.Core.Tests/Stats/*`
  - `src/workers/precheck/statsRows.ts`
  - `src/workers/precheck/statsRows.test.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/types/precheck.ts`
- Tests:
  - `helper/tests/stats-read.dotnet.test.ts`
  - `src/workers/precheck/statsRows.test.ts`
  - `src/workers/precheck/jobs.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **비트는 읽기만**: `Sql.cs`에 정해 둔 SELECT 상수만 매개변수로 돌리고, 끝내지 않는(되돌리는) 트랜잭션 안에서 읽는다(원본 `ReadOnlyConnection` 그대로). SQL 글자를 이어 붙이지 않는다. 읽기·입력 명령 전에는 늘 등록 병원(기관기호·범위·설치 위치·서버·DB 이름)을 다시 확인한다 (AC-005.3·005.6)
- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다(크롬 한도 1MB). 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다 (design.md 4절, AC-001.5)
- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용(비트 DLL·FlaUI·DPAPI·WinForms 창·레지스트리)은 `Precheck.Windows`(net48)에 얇게 두고 Actions 윈도우와 의원 PC에서 확인한다. NuGet 판은 정확한 버전으로 고정한다(범위·`*` 없음). 비트 DLL은 함께 싣지 않고 의원 PC의 `C:\DrBIT50\EXE`에서 불러온다 (ADR-016, design.md 14절)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 환자 자료·메모·차트번호·이름·전화를 어디에도(기록·예외 메시지·창 제목) 쓰지 않는다 (AC-001.6)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 항목마다 버린다. 합계는 항목 금액의 합 (CLAUDE.md, ADR-008)

## 작업

### 1. 도우미 (`Precheck.Core/Stats/*`, `Sql.cs`에 더함)
- `Sql.cs`: 원본 `TrendDataSource`·`OperationalReportSql`의 SQL을 그대로 더하고 원본 사본(`original-sql/`)과 공백만 다른지 비교(AC-027.3)
- `StatsPayload.Build(from, to, db, grid)`: 47 표 줄(지금 파일 파서가 읽는 8칸만) + 추세 사실(코드·날짜·차트번호·건수·소모량·금액·신환 여부) + 일 운영 숫자(날짜별 집계, 환불·변경수납·예치금 여부) → JSON 하나. 하나라도 실패하면 `error`(AC-027.4)
- 추세 비교 기간: 웹이 비교 기간까지 합친 범위(최대 800일)를 `{from, to}`로 보낸다. 원본이 `@priorTo`처럼 따로 읽는 값이 있으면 같은 범위 안에서 원본 SQL 그대로 쓴다. 정한 것을 summary에
- 명령 `stats.rows`: 등록 확인 → `Build` → `Chunker.Split`

### 2. Worker (`src/workers/precheck/statsRows.ts`)
```ts
export function toConsumptionRows(stats: StatsPayload, ids: PatientIds): ConsumptionRow[]   // 지금 파서 결과와 같은 모양
export function toTrendFacts(stats: StatsPayload): TrendFact[]                             // TASK-28이 쓴다
export function toOperationalDays(stats: StatsPayload): OperationalDay[]                   // TASK-30이 쓴다(집계 숫자만)
```
- 차트번호는 지금 파서처럼 메모리 안 번호(`PatientIds`)로 바꾼다. 차트번호 글자를 Worker 밖으로 내지 않는다(ARCHITECTURE '데이터 흐름')
- `jobs.ts`: `stats(statsJson)` → `aggregate`(지금 함수 그대로) 결과 + 추세 사실·운영 숫자. 파일 올리기 길(`analyzeFiles`)은 고치지 않는다
- 금액은 원 단위 정수로 받는다(원본 `decimal`이면 원 미만 버림 — 원본 값이 정수인지 확인해 summary에)

### 3. 시험
- C#(`Stats/*`): SQL 원본 비교, 가짜 `IBitDb`·가짜 47 표로 JSON 모양(8칸만), 하나 실패 → `error`만
- 감싸개 `stats-read.dotnet.test.ts`: `runDotnet('Precheck.Core.Tests.Stats')`
- `statsRows.test.ts`(AC-027.2): 지금 가짜 비트 파일(`fixtures/fake-bit/`)과 같은 내용을 도우미 JSON 모양으로 만들어 → `toConsumptionRows` → `aggregate` 결과가 파일 길(`parseBit` → `aggregate`)과 깊은 비교로 같다
- `jobs.test.ts`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-27 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-27 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(예: `helper/tests/Precheck.Core.Tests/Protocol/Framing.test.cs`, 하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-001.1 길이 0이면 E-HELPER-BAD-MESSAGE")]`
- 하네스 TDD 기록은 vitest 감싸개 `helper/tests/stats-read.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 클래스나 이름공간>')`을 부르고, `it` 이름에도 AC ID를 넣는다. 감싸개 시험 시간 제한은 넉넉히(예: 300초) 준다
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Stats|FullyQualifiedName~Precheck.Core.Tests.Bit"
npx vitest run helper/tests/stats-read.dotnet.test.ts src/workers/precheck/statsRows.test.ts src/workers/precheck/jobs.test.ts
npx vitest run src/workers/analyzeFiles.test.ts src/lib/analytics/aggregate.test.ts   # 지금 통계 길 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-27 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-027.1 ~ AC-027.4이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-6-stats/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 지금 파일 파서·`aggregate`·`analyzeFiles`를 고치지 마라. 이유: 파일 올리기는 예비로 그대로 둔다(사용자). 수정 범위 밖이기도 하다
- 47 표에서 지금 파서가 읽지 않는 칸을 보내지 마라. 이유: 필요한 것만 읽는다(AC-027.1)
- 차트번호 글자를 통계 결과·화면·서버로 내보내지 마라. 이유: 통계는 메모리 안 번호로만 센다(ARCHITECTURE '데이터 흐름')
- 원본 SQL을 고치지 마라. 이유: 공백만 달라야 한다(AC-027.3)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 시험과 앞 도우미 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
