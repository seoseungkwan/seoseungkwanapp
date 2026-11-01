# Step 2: helper-stats-rows

> **TASK-3** 도우미 통계 줄 읽기 (`stats.rows`) · **REQ-503** · AC-503.1 ~ AC-503.5
> Phase 1 · 계산 더하기와 자료 길 `stats-1-data` · Step 2 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-3 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 옮겨 옴: precheck REQ-027 (precheck 027.1·027.3·027.4) — 사전점검 명세의 같은 몫은 그 명세가 다음에 뺀다. 이 step은 `specs/stats`만 따른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-503(도우미 통계 줄 읽기 (`stats.rows`))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-503.1**: Given 등록한 병원과 기간 `{from, to}`(함께 세어 800일 이하, 명령 표 그대로), When 도우미가 `stats.rows`를 처리하면, Then 먼저 등록 확인(Core `HospitalGate.Open` — 도우미 `RequireHospital`이 감싸는 같은 관문)을 하고, 원본 `RxVisitSplit`의 외래 내원 조건으로 읽은 진료 줄 `[차트번호, 진료일, 처방코드, 첫 내원일]`(처방 코드 거르기 없음), 기간 합계(내원·실환자·신환·차트번호 없는 내원·중복 내원·첫 내원을 못 찾은 환자, 원본 `SummarySql`), 날짜별 합계(내원·실환자·신환, 원본 `DaysSql`), 환자·날마다 한 줄인 접수 줄 `patientDays` `[차트번호, 진료일, 접수 건수, 첫 내원일|null]`(`PatientDaysSql`, AC-503.5), 진료 줄에 나온 처방코드의 이름(원본 `TrendDataSource` 처방 목록 SQL)을 JSON 하나(`v` 2)로 만든 뒤 `chunk … end`로 보낸다. 이름·전화·주민번호·주소 칸은 읽지도 보내지도 않는다. 처방코드가 비었거나(NULL·공백뿐) 40자를 넘는 진료 줄은 읽으면서 건너뛴다(원본 `RxVisitSplit`이 코드 형식이 틀린 줄을 건너뛰는 것과 같다). 접수 줄·날짜별 합계·기간 합계는 처방 표를 읽지 않으므로 숫자가 바뀌지 않는다. 시험: 빈 글자·NULL·공백뿐·41자 코드의 줄은 답의 `rows`에 없고 40자 코드의 줄은 있다. 시험: 41자 코드가 처방 목록에 있어도 답의 `codes`에 없다. 시험: 그 줄의 환자·날은 `patientDays`에 그대로 있고 `summary`·`days`는 그대로다
- **AC-503.2**: Given `StatsSql`의 SQL 상수, When 원본 사본(`helper/tests/Precheck.Core.Tests/Stats/original-sql/*.sql`)과 견주면, Then 공백만 다르다. 진료 줄 SQL 하나만 원본 `RowsSql`에서 처방 코드 거르기 한 덩어리(`AND (UPPER(RTRIM(o.OdrCod)) IN (@c0, …, @c99) OR (@eswt=1 AND …))`)를 뺀 것이고, 시험은 사본에서 그 덩어리를 뺀 글과 견준다. `PatientDaysSql`은 원본에 없는 새 문장이라 사본 대조는 그 `Visits` 부분에만 한다(AC-503.5). 모두 매개변수를 받는 SELECT이고 `ReadOnlyGuard`를 지난다. 지금 `Sql.All`(청구 SQL 목록)은 그대로다
- **AC-503.3**: Given 과거 이관 자료가 따로 있음(원본 `HistoryGuard`가 1), 진료 줄이나 접수 줄(`patientDays`)이 700,000줄을 넘음, SQL 하나라도 실패, When `stats.rows`를 처리하면, Then 반쪽 자료를 보내지 않고 각각 `error` `E-STATS-HISTORY` · `E-STATS-TOO-BIG` · `E-BIT-READ-FAILED`만 보낸다. 등록 확인에 걸리면 지금 번호(`E-BIT-NOT-REGISTERED`·`E-BIT-HOSPITAL-MISMATCH`)다
- **AC-503.4**: Given 도우미 진단 기록, When `stats.rows`를 처리하면, Then 시각·명령 이름·오류 번호만 남고 차트번호·처방코드·숫자는 남지 않는다
- **AC-503.5**: Given `StatsSql.PatientDaysSql`, When 보면, Then 다른 문장과 같은 `Visits` 글(`PeriodVisits`·`Patients`·`FirstVisits`) 뒤에 `SELECT v.PatientId,v.VisitDay,COUNT_BIG(*) Visits,LEFT(f.FirstDtm,8) FirstDay FROM PeriodVisits v LEFT JOIN FirstVisits f ON f.PatientId=v.PatientId WHERE v.PatientId IS NOT NULL GROUP BY v.PatientId,v.VisitDay,f.FirstDtm ORDER BY v.PatientId,v.VisitDay`이고, 처방 표 `OdrInf`를 잇지 않으며, 매개변수를 받는 SELECT로 `ReadOnlyGuard`를 지나고, `VisitRowsSql` 바로 다음에 돈다. `stats.rows` 답의 `v`는 2이고 `patientDays`는 `days` 바로 뒤에 있다. 시험: 문장에 `OdrInf`가 없다. 시험: 앞부분이 원본 사본의 `Visits` 부분과 공백만 다르다. 시험: 읽는 차례가 `VisitRowsSql` 바로 다음이다. 시험: 700,001줄 → `E-STATS-TOO-BIG`이고 반쪽 자료가 없다. 시험: JSON의 `v`가 2이고 열쇠 차례에서 `patientDays`가 `days` 바로 뒤다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-503
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-3·4 표와 '도우미 → Worker JSON', '결정과 트레이드오프', '다른 작업과 겹치는 파일'
- `/specs/stats/tasks.md` — TASK-3 (수정 범위·메모)
- `/docs/ADR.md` — ADR-016·020·021
- `/specs/precheck/design.md` — 4절(메시지 약속)·9-2절(읽기·일부만 오면 멈춘다) — 읽기만
- `/helper/src/Precheck.Core/Bit/IBitDb.cs`·`Sql.cs`·`ReadOnlyGuard.cs`·`BitCommands.cs`·`BitServices.cs`·`BitErrors.cs`
- `/helper/src/Precheck.Core/Registration/HospitalGate.cs`, `/helper/src/Precheck.Helper/Commands/RequireHospital.cs`·`HelperServices.cs`, `/helper/src/Precheck.Helper/Program.cs`, `/helper/src/Precheck.Helper/DiagnosticLog.cs`
- `/helper/src/Precheck.Core/Protocol/Chunker.cs`·`Dispatcher.cs`·`CommandTable.cs`·`Envelope.cs`
- `/helper/tests/Precheck.Core.Tests/Bit/Fakes.test.cs`·`ReadOnlyGuard.test.cs`, `/helper/tests/runDotnet.ts`, `/helper/tests/bit-connect.dotnet.test.ts`
- `/src/lib/bridge/commands.json` (`stats.rows {from, to}`, `patient: true`, `maxDays` 800)

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 커밋 `2a1069b`, 폴더 `YangjiBareun_사전점검/`
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다. 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `vendor/drbit_export/RxVisitSplit.cs` (`Visits`·`SummarySql`·`DaysSql`·`RowsSql`, `Run`의 매개변수: `@from`·`@to` Char(12) `yyyyMMdd0000`(끝은 다음 날 0시), `@hospital` VarChar(32), `MaximumRows`)
  - `vendor/drbit_export/TrendDataSource.cs` (`LoadCodes`의 처방 목록 SQL, 선택 코드 없는 꼴 `codeFilter = ""`, 날짜 매개변수 `AddDateRanges`)
  - `vendor/drbit_export/OperationalReportSql.cs` (`HistoryGuard`)

## 수정 범위 (tasks.md TASK-3)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Stats/*`
  - `helper/src/Precheck.Core/Bit/Sql.cs`
  - `helper/src/Precheck.Helper/Program.cs`
  - `helper/tests/Precheck.Core.Tests/Stats/*`
  - `helper/tests/Precheck.Core.Tests/Stats/original-sql/*`
  - `helper/tests/stats-rows.dotnet.test.ts`
- Tests:
  - `helper/tests/stats-rows.dotnet.test.ts`
- TDD: required
- 메모: `Sql.cs`는 `IsAllowed`·`ParametersOf`가 `StatsSql`도 보게 하는 두 줄만 고친다. `Sql.All`·청구 SQL 상수·`ReadOnlyGuard.cs`·`SqlBitDb.cs`·`Commands/*`는 고치지 않는다
- 메모: 의원 PC 시험은 화면이 생기는 Phase 4 끝에 함께 한다(새 도우미 zip이 필요하다. 도우미 빌드는 지금 Actions 그대로)

## 꼭 지킬 규칙 (CRITICAL)

- **비트는 읽기만**: `StatsSql`(과 지금 `Sql.cs`)에 정해 둔 SELECT 상수만 매개변수로 돌리고, 지금 `IBitDb`(윈도우 `SqlBitDb`: 되돌리는 트랜잭션)로만 읽는다. SQL 글자를 이어 붙이거나 고치지 않는다. 읽기 전에는 늘 Core의 `HospitalGate.Open(services)`(도우미 `RequireHospital`이 감싸는 같은 관문 — `RequireHospital`은 `Precheck.Helper` 안이라 Core에서 못 부른다)로 등록 병원을 다시 확인하고, 돌려받은 세션으로만 읽는다 (precheck 005.3·005.6, `Commands/RequireHospital.cs` 주석)
- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다. 환자 자료 명령(`stats.rows`, 명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`이고 지금 `Chunker.Send(sink, id, json)`(안에서 `Chunker.Split`으로 나눔)을 쓴다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`만 보내고 반쪽 자료를 보내지 않는다 (청구 design.md 4절·9-2)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용 파일(`Precheck.Windows/*`)은 고치지 않는다. 새 NuGet 패키지를 넣지 않는다 (ADR-016)
- **도우미 기록**: 표준 출력에는 메시지 틀만 쓴다. 진단 기록에는 시각·명령 이름·오류 번호만 남긴다. 차트번호·처방코드·숫자·SQL 글을 기록·예외 메시지 어디에도 쓰지 않는다 (precheck 001.6, AC-503.4)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 통째를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 원본 SQL 문장 사본(`original-sql/*.sql`), 골든 결과뿐이다 (specs/stats/tasks.md 머리말)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. SQL (`helper/src/Precheck.Core/Stats/StatsSql.cs`)
- 원본 문장을 그대로 옮긴 상수와 매개변수 표(design.md 표): `VisitRowsSql`(원본 `Visits + RowsSql`에서 `AND (UPPER(RTRIM(o.OdrCod)) IN (@c0, …, @c99) OR (@eswt=1 AND …))` 한 덩어리만 뺌, 그래서 `@c0…@c99`·`@eswt` 매개변수가 없다), `VisitSummarySql`, `VisitDaysSql`, `CodeNamesSql`, `HistoryGuardSql`
- `public static bool IsAllowed(string? sql)`, `public static IReadOnlyList<SqlParam> ParametersOf(string sql)`, `public static IReadOnlyCollection<string> All`
- 원본 사본: `helper/tests/Precheck.Core.Tests/Stats/original-sql/rx-visit-split-visits-rows.sql`·`…-summary.sql`·`…-days.sql`·`trend-code-names.sql`·`report-history-guard.sql`(원본 문장만)

### 2. 관문 (`helper/src/Precheck.Core/Bit/Sql.cs`, 두 줄)
```cs
public static bool IsAllowed(string? sql) => sql != null && (Allowed.ContainsKey(sql) || Stats.StatsSql.IsAllowed(sql));
// ParametersOf: Allowed에 없으면 StatsSql.ParametersOf(sql) (거기도 없으면 지금처럼 BitException(ReadFailed))
```
- `Sql.All`·청구 상수·`ReadOnlyGuard.cs`·`SqlBitDb.cs`는 고치지 않는다(그래서 청구 `ReadOnlyGuard.test.cs`의 사본 대조가 그대로 통과한다)

### 3. 읽기 (`Stats/StatsRows.cs`, `Stats/StatsErrors.cs`, `Stats/StatsPayload.cs`)
```cs
public static class StatsErrors { public const string History = "E-STATS-HISTORY"; public const string TooBig = "E-STATS-TOO-BIG"; }
public static class StatsRows { public const int MaxRows = 700_000; public static StatsRowsResult Read(IBitDb db, string hospitalScope, string from, string to); }
public static class StatsPayload { public static string Build(string from, string to, StatsRowsResult rows, StatsReportResult? report); }
```
- 순서: `HistoryGuardSql`(1이면 `BitException(StatsErrors.History)`) → `VisitRowsSql`(줄 수 > `MaxRows`면 `BitException(StatsErrors.TooBig)`) → `VisitSummarySql` → `VisitDaysSql` → `CodeNamesSql`(코드마다 원본 정렬의 첫 이름, 진료 줄에 나온 코드만 남김)
- 매개변수: `@from` = from `yyyyMMdd` + "0000", `@to` = (to + 1일) `yyyyMMdd` + "0000"(원본 `To`는 끝 다음 날), `@hospital` = 등록 범위(`VerifiedHospital`이 준 값). 처방 목록 SQL의 `@priorFrom`·`@priorTo`는 `@from`·`@to`와 같은 날짜(Char(8))
- 시간 제한: 자료 SQL 150초, `HistoryGuard` 15초(`Sql.MetaTimeout`)
- JSON(`StatsPayload.Build`, `System.Text.Json`, 정해 둔 열쇠만): design.md '도우미 → Worker JSON'. 이 step에서 `report`는 `{ "daily": [], "monthly": [] }`이다(TASK-4가 채운다). 날짜는 원본 글자 `yyyyMMdd` 그대로, 첫 내원일이 없으면 null

### 4. 명령 (`Stats/StatsCommands.cs`, `Program.cs` 한 줄)
```cs
public static class StatsCommands { public const string RowsName = "stats.rows"; public static void Register(Dispatcher dispatcher, BitServices services); }
```
- 처리기: args `{from, to}`(명령 표가 이미 검사) → `using var hospital = HospitalGate.Open(services)`(Helper의 `RequireHospital.Open`이 감싸는 같은 관문, Core에서 부를 수 있는 쪽) → `StatsRows.Read(hospital.Db, hospital.Registration.Scope, …)` → `StatsPayload.Build` → `Chunker.Send(sink, request.Id, json)` → `chunk…end`. 예외는 그 번호로 `error`만
- `Program.cs`: 지금 `BitCommands.Register(dispatcher, HelperServices.Create());` 다음 줄에 `StatsCommands.Register(dispatcher, HelperServices.Create());` 한 줄만 더한다. 지금 `services` 변수가 없다 — 지금 줄을 고치지 않는다(합치기 자리를 가장 작게, cross-branch C4). `HelperServices.Create()`는 만들기만 하고 비트를 건드리지 않아 두 번 불러도 된다

### 5. 시험 (`helper/tests/Precheck.Core.Tests/Stats/*.test.cs`, 감싸개 `helper/tests/stats-rows.dotnet.test.ts`)
- AC-503.2: 상수마다 사본과 공백만 다름(청구 `ReadOnlyGuard.test.cs`의 비교 방식), 진료 줄 SQL = 사본에서 그 덩어리를 뺀 글, `ReadOnlyGuard.Require(sql, args)`가 통과, `Sql.All`에 통계 SQL이 없음
- AC-503.1: 가짜 `IBitDb`(줄을 순서로 돌려주는 가짜, `Bit/Fakes.test.cs` 본보기)로 JSON 열쇠·배열 모양·코드 이름 거르기·날짜 매개변수, 등록 안 됨 → `E-BIT-NOT-REGISTERED`
- AC-503.3: `HistoryGuard` 1 → `error` `E-STATS-HISTORY`만, 줄 700,001 → `E-STATS-TOO-BIG`만, 셋째 SQL에서 예외 → `E-BIT-READ-FAILED`만(어느 경우도 `chunk` 없음)
- AC-503.4: 기록에 가짜 차트번호·코드·숫자 글자가 없음

## 2026-11-01 접수 기준 변경 (뒤따라 고치기)

> 사용자 결정(`specs/stats/requirements.md` 배경 '환자 수의 뜻'·'파일 길'). 이 TASK는 이미 커밋되었고 이 변경으로 다시 연다. 차례는 `specs/stats/tasks.md` 머리말 '2026-11-01 다시 여는 차례'를 따른다(TASK-1·7과 동시에 해도 되고, 답 모양은 이 명세가 정하므로 TASK-5가 이 TASK를 기다리지 않는다). 동시에 도는 동안 이 TASK는 `tdd-run`만 돌린다. `npm test`·`build`·`verify`와 `index.json` 고치기는 넷이 끝난 뒤 코디네이터가 한다. 그래서 이번에는 아래 'Acceptance Criteria'의 `npm run lint && npm test && npm run build`·`verify`와 '검증 절차'의 `index.json` 고치기를 하지 않는다. 이 절이 이 파일의 다른 곳과 다르면 이 절이 먼저다. 원본 SQL 문장을 고치지 않는다는 규칙은 그대로다(새 문장은 더하기다).

### 새 AC
- **AC-503.5**: Given `StatsSql.PatientDaysSql`, When 보면, Then 다른 문장과 같은 `Visits` 글(`PeriodVisits`·`Patients`·`FirstVisits`) 뒤에 `SELECT v.PatientId,v.VisitDay,COUNT_BIG(*) Visits,LEFT(f.FirstDtm,8) FirstDay FROM PeriodVisits v LEFT JOIN FirstVisits f ON f.PatientId=v.PatientId WHERE v.PatientId IS NOT NULL GROUP BY v.PatientId,v.VisitDay,f.FirstDtm ORDER BY v.PatientId,v.VisitDay`이고, 처방 표 `OdrInf`를 잇지 않으며, 매개변수를 받는 SELECT로 `ReadOnlyGuard`를 지나고, `VisitRowsSql` 바로 다음에 돈다. `stats.rows` 답의 `v`는 2이고 `patientDays`는 `days` 바로 뒤에 있다. 시험: 문장에 `OdrInf`가 없다. 시험: 앞부분이 원본 사본의 `Visits` 부분과 공백만 다르다. 시험: 읽는 차례가 `VisitRowsSql` 바로 다음이다. 시험: 700,001줄 → `E-STATS-TOO-BIG`이고 반쪽 자료가 없다. 시험: JSON의 `v`가 2이고 열쇠 차례에서 `patientDays`가 `days` 바로 뒤다

AC-503.1·503.2·503.3은 위 AC 목록대로 바뀌었다(답의 `v` 2와 `patientDays`, 사본 대조는 새 문장의 `Visits` 부분에만, 접수 줄도 700,000줄 한도).

### 고칠 것
- `Stats/StatsSql.cs`: `Visits` 상수 뒤에 AC-503.5의 SELECT를 이은 `PatientDaysSql`을 더하고 매개변수 표(`VisitParams`)와 `All`에 넣는다. `Visits` 글을 고치지 않는다. `Bit/Sql.cs` 두 줄·`Sql.All`은 더 고치지 않는다
- `Stats/StatsRows.cs`: `VisitRowsSql` 바로 다음에 `PatientDaysSql`을 돌린다(시간 제한 150초). 줄 수가 `MaxRows`를 넘으면 `BitException(StatsErrors.TooBig)`이다. 첫 내원일이 빈 글자면 null이다. `StatsRowsResult`에 접수 줄 목록을 더한다
- `Stats/StatsPayload.cs`: `Version` = 2, `days` 바로 뒤에 `patientDays` `[차트번호, 진료일, 접수 건수, 첫 내원일|null]`. 머리 주석도 고친다
- 차트번호는 `rows`처럼 진단 기록·예외 글에 쓰지 않는다(AC-503.4)

### 시험
- `StatsSql.test.cs`: AC-503.5(문장에 `OdrInf` 없음, 앞부분이 사본 `rx-visit-split-visits-rows.sql`의 `Visits` 부분과 공백만 다름, `ReadOnlyGuard.Require` 통과, 매개변수 표 `@from`·`@to` Char(12)·`@hospital` VarChar(32))
- `StatsRows.test.cs`: 가짜 DB에 새 문장의 답을 더하고 AC-503.5(읽는 차례가 `VisitRowsSql` 바로 다음, 700,001줄 → `E-STATS-TOO-BIG`만, JSON 열쇠 차례 `v`·`from`·`to`·`summary`·`days`·`patientDays`·`codes`·`rows`·`report`, `v` 2)를 본다. 첫 내원일 null과 처방 없는 접수 줄도 본다. 읽는 차례·열쇠·`v`를 못 박은 지금 시험은 이 이유로만 고친다
- `helper/tests/stats-rows.dotnet.test.ts`: `it('AC-503.5 …', () => { expectAc('AC-503.5') })`를 더한다. 감싸개는 `Passed AC-503.5` 글자로 찾으므로 C# 시험 이름은 `AC-503.5 `로 시작한다. 이 `it`이 없으면 C# 시험이 돌아도 AC-503.5가 TDD 기록과 이어지지 않는다

### 일회용 확인 (커밋하지 않는다)
새 문장은 원본에 없어 가짜 `IBitDb`로는 SQL 자체를 돌려 볼 수 없다. 원본의 sqlite 시험 틀(원본 폴더의 `tests/test_rx_visit_split_sql.py`, 위 '원본' 절의 사본 또는 `YANGJI_SRC`)을 저장소 밖 임시 폴더에 일회용으로 복사해 새 문장을 가짜 자료에 한 번 돌린다:
- 두 번 접수: 같은 환자·같은 날 내원 번호가 다른 접수 둘 → 한 줄, 건수 2
- 취소된 접수: 같은 날 정상 접수 하나와 취소 접수 하나(원본 시험 84번째 줄처럼 `status="CN"`) → 건수 1. 취소 접수만 있는 환자는 줄이 없다
- 첫 접수 취소: 앞날 취소 접수, 뒷날 정상 접수 → 뒷날 한 줄, 첫 내원일 = 뒷날
- 처방 없는 접수: `order` 없는 접수 → 줄이 있다
- 앞날 입원, 뒷날 외래 → 뒷날 한 줄, 첫 내원일 = 앞날
- 차트번호 없는 접수 → 줄 없음

이 복사본은 커밋하지 않는다. 여섯 경우의 결과를 step `summary`와 메인 세션 보고에 적는다. 기대와 다르면 고치지 말고 `blocked`로 멈추고 어떻게 달랐는지 적는다.

## 2026-11-01 빈 코드 줄 건너뛰기 (뒤따라 고치기)

> 메인 세션 판단으로 AC-503.1에 적었다. 까닭은 `specs/stats/design.md` '처방코드가 비었거나 40자를 넘는 진료 줄'. 이 TASK는 이미 커밋되었고 이 변경으로 다시 연다. 이 절이 이 파일의 다른 곳과 다르면 이 절이 먼저다. `tdd-run`만 돌린다. `npm test`·`build`·`verify`와 `index.json` 고치기는 코디네이터가 한다.

### 고칠 것 (`helper/src/Precheck.Core/Stats/StatsRows.cs`)
- 진료 줄을 옮기는 고리에서 처방코드가 null이거나 공백뿐이거나 40자를 넘으면 그 줄을 건너뛴다. 40은 Worker `MAX_CODE`(`src/workers/stats/helperData.ts`)와 같고 줄 수 한도 검사는 지금 자리 그대로다. 코드 목록(`codes`)은 남은 줄에서 만든다(41자 코드가 `codes`에 남으면 Worker에서 같은 실패로 끝난다)
- 고치지 않는다: `StatsSql.cs`의 SQL(AC-503.2 사본 대조 그대로), 답 모양(`v` 2, 칸), `StatsPayload.cs`, Worker

### 시험 (`helper/tests/Precheck.Core.Tests/Stats/`, 이름에 `AC-503.1`)
- AC-503.1의 새 '시험' 셋을 가짜 `IBitDb`로 쓴다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-503.3 진료 줄이 700,000줄을 넘으면 E-STATS-TOO-BIG만 보낸다")]`
- 하네스 TDD 기록은 vitest 감싸개 `helper/tests/stats-rows.dotnet.test.ts`로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('Precheck.Core.Tests.Stats', { timeoutMs: 280_000 })`를 부르고(본보기: `helper/tests/bit-connect.dotnet.test.ts`), AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다. `it` 이름에도 AC ID를 넣는다
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version`이 되는지 먼저 본다. dotnet이 없어서 실패한 것(`E-NO-DOTNET`)은 RED가 아니다
- 이 step을 execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Stats|FullyQualifiedName~Precheck.Core.Tests.Bit|FullyQualifiedName~Precheck.Core.Tests.Protocol|FullyQualifiedName~Precheck.Core.Tests.Registration"
npx vitest run helper/tests/stats-rows.dotnet.test.ts helper/tests/bit-connect.dotnet.test.ts helper/tests/protocol.dotnet.test.ts helper/tests/helper-fixups.dotnet.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-503.1 ~ AC-503.5이 이 TASK의 시험과 이어져 보여야 한다

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

- 원본 SQL 문장을 고치지 마라(진료 줄 SQL의 정한 한 덩어리 빼기 밖). 이유: 공백만 달라야 한다(AC-503.2)
- `Sql.All`에 통계 SQL을 넣거나 청구 SQL·`ReadOnlyGuard.cs`·`SqlBitDb.cs`·`Commands/*`·`Precheck.Windows/*`를 고치지 마라. 이유: 청구 브랜치가 같은 파일을 고친다. 겹침은 `Sql.cs` 두 줄·`Program.cs` 한 줄뿐이어야 한다
- 이름·전화·주민번호·주소 칸을 읽거나 JSON에 넣지 마라. 이유: 필요한 것만 읽는다(plan.md §4)
- `commands.json`·확장(`extension/`)을 고치지 마라. 이유: `stats.rows`는 이미 명령 표에 있다. 바꾸면 확장을 다시 올려야 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
