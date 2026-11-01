# Step 3: helper-stats-report

> **TASK-4** 도우미 보고 숫자 읽기 · **REQ-504** · AC-504.1 ~ AC-504.4
> Phase 1 · 계산 더하기와 자료 길 `stats-1-data` · Step 3 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-4 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 옮겨 옴: precheck REQ-027 (precheck 027.1의 일 운영 숫자) · precheck REQ-030 (precheck 030.2의 '확인 필요' 판정) — 사전점검 명세의 같은 몫은 그 명세가 다음에 뺀다. 이 step은 `specs/stats`만 따른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-504(도우미 보고 숫자 읽기 (일일·월말 운영 숫자))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-504.1**: Given `stats.rows`의 `to`, When 처리하면, Then 같은 JSON의 `report`에 원본 `OperationalReportData.Load` 순서대로 원본 `OperationalReportSql`(`HistoryGuard`·`UnsupportedFinance`·`Patients`·`Treatments`·`LaCodes`·`FinanceNormal`·`FinanceReceivable`·`FinanceMultiplicity`·`ReceivableMultiplicity`)을 돌린 숫자 네 벌이 있다: 일일 `to`·`to − 1일`, 월말 `to`가 든 달(1일 ~ `to`)·그 앞 달. 한 벌의 칸은 기간·총환·신환·재진·총진료비·조합청구액·비급여·현금·카드·계좌이체·치료 다섯(도수·충격파·씨암블락·쏘노·크라이오)·LA 코드 건수·금액 확인 필요 여부와 사유·원본 안내 글뿐이다
- **AC-504.2**: Given 환불·변경수납·예치금 자료가 있는 기간(원본 `UnsupportedFinance` > 0)이나 금액 연결 중복, When 그 벌을 만들면, Then 원본 `SetFinanceUnconfirmed`처럼 '금액 확인 필요'(사유 포함)이고 총환·신환·치료·LA 숫자는 그대로다
- **AC-504.3**: Given 원본 `Load`가 '보고를 확정할 수 없음'으로 멈추는 값(내원 누락·중복, 치료 연결 못 함, 재진이 음수), When 그 벌을 만들면, Then 그 벌만 `{ ok: false, reason }`(원본 이유 이름 그대로)이고 다른 벌과 진료 줄은 그대로 보낸다. SQL 실행 실패는 REQ-503(반쪽 자료 없음)대로 전체 `error`다
- **AC-504.4**: Given 보고 SQL 상수, When 원본 사본과 견주면, Then 공백만 다르다. `@daily`는 원본 `Bit` 대신 `Char(1)` '1'·'0'으로 넘긴다(관문·`SqlBitDb`를 고치지 않으려고). 금액은 원 단위 정수로 보낸다(원 미만은 0 쪽으로 버린다. 음수도 같다: -129,629.535 → -129,629). 음수 금액은 원본처럼 그대로 보낸다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-504
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-3·4 표와 '도우미 → Worker JSON'의 `report`, '결정과 트레이드오프'(`@daily` Char(1))
- `/specs/stats/tasks.md` — TASK-4 (수정 범위·메모)
- `/helper/src/Precheck.Core/Stats/*` (TASK-3)
- `/helper/src/Precheck.Core/Bit/IBitDb.cs`·`Sql.cs`·`ReadOnlyGuard.cs`
- `/helper/tests/Precheck.Core.Tests/Stats/*` (TASK-3 시험·가짜 DB)
- 이전 step에서 만든 파일: TASK-3 (`StatsSql`·`StatsRows`·`StatsPayload`·`StatsCommands`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 커밋 `2a1069b`, 폴더 `YangjiBareun_사전점검/`
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다. 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `vendor/drbit_export/OperationalReportData.cs` (`Load`의 순서·`Fail` 이유·`SetFinanceUnconfirmed`·`Command`의 매개변수: `@day`·`@nextDay` Char(8), `@from`·`@to` Char(12), `@hospital` VarChar(32), `@daily` Bit)
  - `vendor/drbit_export/OperationalReportSql.cs` (모든 상수)
  - `medicore/reports.py` `validate_report`(칸 목록·`TREATMENTS`·LA 코드 모양)

## 수정 범위 (tasks.md TASK-4)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Stats/*`
  - `helper/tests/Precheck.Core.Tests/Stats/*`
  - `helper/tests/Precheck.Core.Tests/Stats/original-sql/*`
  - `helper/tests/stats-report.dotnet.test.ts`
- Tests:
  - `helper/tests/stats-report.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **비트는 읽기만**: `StatsSql`(과 지금 `Sql.cs`)에 정해 둔 SELECT 상수만 매개변수로 돌리고, 지금 `IBitDb`(윈도우 `SqlBitDb`: 되돌리는 트랜잭션)로만 읽는다. SQL 글자를 이어 붙이거나 고치지 않는다. 읽기 전에는 늘 Core의 `HospitalGate.Open(services)`(도우미 `RequireHospital`이 감싸는 같은 관문 — `RequireHospital`은 `Precheck.Helper` 안이라 Core에서 못 부른다)로 등록 병원을 다시 확인하고, 돌려받은 세션으로만 읽는다 (precheck 005.3·005.6, `Commands/RequireHospital.cs` 주석)
- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다. 환자 자료 명령(`stats.rows`, 명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`이고 지금 `Chunker.Send(sink, id, json)`(안에서 `Chunker.Split`으로 나눔)을 쓴다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`만 보내고 반쪽 자료를 보내지 않는다 (청구 design.md 4절·9-2)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용 파일(`Precheck.Windows/*`)은 고치지 않는다. 새 NuGet 패키지를 넣지 않는다 (ADR-016)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 차트번호·처방코드·숫자·SQL 글을 기록·예외 메시지 어디에도 쓰지 않는다 (precheck 001.6, AC-503.4)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 항목마다 버린다. 합계는 항목 금액의 합 (CLAUDE.md, plan.md §5)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 통째를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 원본 SQL 문장 사본(`original-sql/*.sql`), 골든 결과뿐이다 (specs/stats/tasks.md 머리말)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. SQL (`StatsSql.cs`에 더함)
- `UnsupportedFinanceSql`·`PatientsSql`·`TreatmentsSql`·`LaCodesSql`·`FinanceNormalSql`·`FinanceReceivableSql`·`FinanceMultiplicitySql`·`ReceivableMultiplicitySql`를 원본 그대로(`HistoryGuardSql`은 TASK-3에 있다). 원본 사본 `original-sql/report-*.sql`
- `@daily`는 `SqlParam("@daily", SqlParamKind.Char, 1)`, 값 '1'(일일)·'0'(월말)

### 2. 읽기 (`Stats/StatsReport.cs`)
```cs
public static class StatsReport { public static StatsReportResult Read(IBitDb db, string hospitalScope, string to); }
// 네 벌: daily(to), daily(to − 1일), monthly(to가 든 달: 1일 ~ to 다음 날 0시), monthly(그 앞 달 전체)
```
- 한 벌마다 원본 `OperationalReportData.Load`의 순서·판정을 줄 그대로 옮긴다(`VerifyIdentity`는 빼고 — 등록 확인은 `HospitalGate`가 이미 했다). 원본 `Fail(reason, …)` 자리는 그 벌만 `{ ok: false, period, reason }`(AC-504.3), 원본 `SetFinanceUnconfirmed` 자리는 `financeUnconfirmed: true` + 원본 사유 글(AC-504.2)
- 금액은 원본 decimal → 원 미만 버림(`Math.Truncate`) → `long`(AC-504.4). `Math.Floor`는 음수를 0에서 멀어지게 해서(-0.5 → -1) 쓰지 않는다. 음수 금액은 원본처럼 그대로 보낸다. 건수는 `long`
- SQL 실행 예외는 그 벌이 아니라 명령 전체 `error`(AC-503.3과 같은 규칙)

### 3. JSON (`StatsPayload.Build`)
- `report: { daily: [two], monthly: [two] }`, 한 벌의 열쇠는 design.md 그대로(camelCase). `notes`는 원본 결과의 안내 글

### 4. 시험 (감싸개 `helper/tests/stats-report.dotnet.test.ts`)
- AC-504.4: 사본과 공백만 다름, `@daily` Char(1)이 관문을 지남, 음수 금액은 0 쪽으로 버리고 그대로 보냄(-129,629.535 → -129,629, -0.5 → 0)
- AC-504.1: 가짜 DB로 일일·월말 네 벌의 기간 매개변수와 칸 목록
- AC-504.2: `UnsupportedFinance` > 0 → 확인 필요 + 다른 숫자 그대로, 연결 중복(원본 Multiplicity 판정) → 확인 필요
- AC-504.3: 원본 `Fail` 사례(내원 누락·중복, 치료 연결 못 함, 재진 음수) → 그 벌만 `ok: false`, 다른 벌·진료 줄은 그대로. 원 미만 금액(예: 129,629.535) → 129,629

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-503.3 진료 줄이 700,000줄을 넘으면 E-STATS-TOO-BIG만 보낸다")]`
- 하네스 TDD 기록은 vitest 감싸개 `helper/tests/stats-report.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('Precheck.Core.Tests.Stats', { timeoutMs: 280_000 })`를 부르고(본보기: `helper/tests/bit-connect.dotnet.test.ts`), AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다. `it` 이름에도 AC ID를 넣는다
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version`이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Stats|FullyQualifiedName~Precheck.Core.Tests.Bit"
npx vitest run helper/tests/stats-report.dotnet.test.ts helper/tests/stats-rows.dotnet.test.ts helper/tests/bit-connect.dotnet.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-504.1 ~ AC-504.4이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-1-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 금액을 반올림하지 마라(`Math.Round`·`ToString("N0")` 등). 이유: 원 미만은 버린다(CLAUDE.md)
- 보고 벌 하나의 값 판정 실패로 명령 전체를 `error`로 만들지 마라. 이유: 통계 줄은 보고와 따로 쓸 수 있다(AC-504.3). 반대로 SQL 실행 예외는 전체 `error`다
- 원본 판정을 '맞춰' 고치지 마라(환불 날 금액 계산 등). 이유: 원본처럼 '확인 필요'로 둔다. 틀린 금액이 보고되면 안 된다
- `Sql.cs`·`Program.cs`·`Precheck.Windows/*`를 고치지 마라. 이유: 이 step의 수정 범위가 아니다(관문은 TASK-3이 열었다)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
