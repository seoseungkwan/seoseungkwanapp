# Step 2: helper-revenue-read

> **TASK-3** 도우미 매출 읽기 · **REQ-003** · AC-003.1 ~ AC-003.8
> Phase 1 `revenue-1-read` · Step 2 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-3 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-003에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-003.1**: 등록 확인 관문(`HospitalGate.Open`)을 지나고, 원본 `HistoryGuard` 한 번, `from`~`to` 날마다 원본 `UnsupportedFinance`·`FinanceMultiplicity`·`ReceivableMultiplicity`·`FinanceNormal`·`FinanceReceivable`·`Patients`와 새 `DistinctPatients`를 돌린다. 원본 문장은 사본과 공백·끝 `;`·`--` 주석 줄만 다르다
- **AC-003.2**: 세 검사 가운데 하나라도 0이 아니면 그날 금액 일곱 칸 `null`·`unconfirmed: true`. 아니면 `total`·`insurer`·`noncovered` = `FinanceNormal`+`FinanceReceivable`의 1·2·3째 칸 합, `cash`·`card`·`transfer` = `FinanceNormal` 4·5·6째, `receivableIn` = `FinanceReceivable` 4+5+6째(원 미만 버림, DB NULL은 0). 음수가 있으면 `unconfirmed: true`
- **AC-003.3**: `Patients` 3~5째 칸이 모두 0이면 `visits` = 1째, `newPatients` = 2째, `returnVisits` = `visits − newPatients`, 아니면 셋 다 `null`. `HistoryGuard` ≠ 0이면 모든 날 `newPatients`·`returnVisits` `null`
- **AC-003.4**: 날마다 `DistinctPatients`(`@from` = 명령의 `from` 0시, `@to` = 그다음 날 0시) → `patientsToDate` = `from`부터 그날까지 서로 다른 환자 수(비트 DB 안의 `COUNT(DISTINCT …)`). 차트번호 없는 내원이 있으면 `null`. 차트번호는 도우미 밖으로 안 나간다
- **AC-003.5**: `RevenueSql.CodeAmounts` 하나로 코드마다 `count`(유효 처방 줄 수)·`amount`(일수 × 수량 × 단가, 원 미만 버림). 값이 빠진 줄이 있는 코드는 `amount: null`. 앞뒤 공백을 뺀 뒤 같아진 코드는 합치고, 모양이 틀린 코드와 금액 순 999번째 뒤 코드는 이름 없는 한 줄 `_REST`로 합친다(코드 때문에 한 달이 실패하지 않는다)
- **AC-003.6**: 읽기 실패·시간 초과·관문 실패면 일부만 보내지 않고 오류 하나
- **AC-003.7**: 답·진단 기록에 차트번호·이름·접수 번호가 없다(가짜 DB의 가짜 차트번호 글자가 어디에도 없음). 답의 칸은 AC-002.2와 같다
- **AC-003.8**: `ReadOnlyGuard`는 매출 문장 9개(원본 7 + `DistinctPatients` + `CodeAmounts`)를 정해 둔 매개변수와 함께만 통과. 문장은 읽기 하나(`SELECT`/`WITH` 시작, `;`·주석·쓰기 낱말 없음). 기존 `Sql` 상수·시험은 그대로

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 2절(원본 표), 4절 전부(파일·모양·`CodeAmounts` 문장·매개변수), 11절(`Sql.cs`·`Program.cs` 겹침)
- `/specs/precheck/design.md` — 9-2절(읽기·일부만 오면 멈춤), 10절(원본 SQL 사본), 14절(C# 나누기)
- `/helper/src/Precheck.Core/Bit/Sql.cs`, `ReadOnlyGuard.cs`, `IBitDb.cs`, `BitCommands.cs`, `BitErrors.cs`, `/helper/src/Precheck.Core/Registration/HospitalGate.cs`, `/helper/src/Precheck.Core/Protocol/*`(`Dispatcher`·`Envelope`), `/helper/src/Precheck.Helper/Program.cs`, `/helper/src/Precheck.Windows/SqlBitDb.cs`(읽기만: 매개변수 종류·트랜잭션)
- `/helper/tests/Precheck.Core.Tests/Bit/ReadOnlyGuard.test.cs`·`Fakes.test.cs`(가짜 DB 만드는 법), `/helper/tests/bit-connect.dotnet.test.ts`(감싸개 예)
- 이전 step에서 만든 파일:
  - `src/lib/bridge/commands.json`의 `revenue.days` (Phase 1 Step 1)
  - `src/types/revenue.ts` (칸 이름·코드 모양·한도)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-3)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `helper/src/Precheck.Core/Revenue/*`
  - `helper/src/Precheck.Core/Bit/Sql.cs`
  - `helper/src/Precheck.Helper/Program.cs`
  - `helper/tests/Precheck.Core.Tests/Revenue/*`
  - `helper/tests/Precheck.Core.Tests/Revenue/original-sql/*`
  - `helper/tests/revenue-read.dotnet.test.ts`
- Tests:
  - `helper/tests/revenue-read.dotnet.test.ts`
  - `helper/tests/bit-connect.dotnet.test.ts`
  - `helper/tests/protocol.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진·환자 수)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 환자 수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 버린다. 합계는 항목 금액의 합 (CLAUDE.md, ADR-008). 비율은 소수 첫째 자리 버림
- **비트는 읽기만**: `ReadOnlyGuard`를 지난 정해 둔 읽기 문장 상수만 매개변수로 돌리고, 되돌리는 트랜잭션 안에서 읽는다(`SqlBitDb`). SQL 글자를 이어 붙이지 않는다. 처리기 맨 처음에 등록 확인 관문(`HospitalGate.Open`)을 지난다 (precheck AC-005.3·005.6)
- **C# 나누기**: 플랫폼과 상관없는 것은 `Precheck.Core`(netstandard2.0)에 두고 이 서버에서 `dotnet test -f net10.0`으로 시험한다. 윈도우 전용 코드는 이 step에서 만들지 않는다
- **도우미 기록**: 표준 출력에는 메시지 틀만, 진단 기록에는 시각·명령 이름·오류 번호만 (precheck AC-001.6)
- **원본은 저장소 밖**: 원본 파일을 저장소에 복사하지 않는다. 커밋하는 것은 옮긴 코드와 SQL 사본(`original-sql/*.sql`)뿐이다
- **겹치는 파일은 더하기만**: `Sql.cs`는 `IsAllowed`·`ParametersOf`가 `RevenueSql.Parameters`도 보게 하는 몇 줄만. `Sql.All`·`Allowed`·기존 상수를 바꾸지 않는다(기존 시험 `ReadOnlyGuard.test.cs`가 `Sql.All` = 원본 4개를 본다). `Program.cs`는 처리기 등록 한 줄과 `HelperServices.Create()`를 변수로 받는 것만

## 작업

### 1. 원본 사본 (`helper/tests/Precheck.Core.Tests/Revenue/original-sql/`)
- 원본 `vendor/drbit_export/OperationalReportSql.cs`(GitHub `seoseungkwan/shared` main `c66488e`, 폴더 `YangjiBareun_사전점검/`)에서 `HistoryGuard`·`UnsupportedFinance`·`FinanceMultiplicity`·`ReceivableMultiplicity`·`FinanceNormal`·`FinanceReceivable`·`Patients` 일곱 문장을 글자 그대로 `*.sql` 파일로 옮긴다(파일 맨 위에 `-- 출처: …` 한 줄)
- 이 서버의 사본(지워질 수 있음): `/tmp/claude-1000/-home-developer/1416718f-f900-49a9-a131-c3bd4c2c706c/scratchpad/yangji/repo/YangjiBareun_사전점검/vendor/drbit_export/OperationalReportSql.cs`. 없으면 저장소 밖 임시 폴더에 `git clone https://github.com/seoseungkwan/shared.git` 후 `c66488e`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)
- `TrendDataSource.cs`의 금액 식(`Amount`·`MissingValues`)도 읽어 `CodeAmounts`가 같은 식인지 확인한다(사본은 만들지 않는다. 새 문장이다)

### 2. `RevenueSql.cs`
- 상수 9개(design.md 4-2). 원본 일곱 개는 사본과 공백·끝 `;`·`--`로 시작하는 줄만 다르다. `DistinctPatients`·`CodeAmounts`는 design.md 4-2 문장
- `Parameters`: 문장마다 그 문장에 나오는 `@이름`만, 종류·길이는 `@day`·`@nextDay` = Char 8, `@from`·`@to` = Char 12, `@hospital` = VarChar 32(원본 `OperationalReportData.Command`)
- `Sql.cs`: `IsAllowed(sql)` = 기존 `Allowed` 또는 `RevenueSql.Parameters`에 있음, `ParametersOf(sql)` = 둘 가운데 있는 쪽. 없으면 지금처럼 `E-BIT-READ-FAILED`

### 3. `RevenueDays.Read(db, scope, from, to)`
- `to < from` 또는 31일 넘음 → `E-HELPER-BAD-MESSAGE`(명령 표가 먼저 막지만 한 번 더)
- 처음에 `HistoryGuard` 한 번(≠ 0이면 모든 날 신환·재진 `null`)
- 날마다(빠진 날 없이): 세 검사 → 0이 아니면 `unconfirmed`(금액 일곱 칸 `null`). 아니면 `FinanceNormal`·`FinanceReceivable` 답의 칸을 `decimal`로 더한 뒤 `decimal.Truncate` → `long`: 1·2·3째 = 두 문장 합(`total`·`insurer`·`noncovered`), `FinanceNormal` 4·5·6째 = `cash`·`card`·`transfer`, `FinanceReceivable` 4+5+6째 = `receivableIn`. 음수면 `unconfirmed`
- 날마다 `Patients` → `visits`·`newPatients`·`returnVisits`(AC-003.3), `DistinctPatients`(`@from` = 명령의 `from`+"0000", `@to` = 그다음 날+"0000") → `patientsToDate`(AC-003.4)
- 그날 쓰는 원본 매개변수: `@day`·`@nextDay`·`@from`(@day+"0000")·`@to`(@nextDay+"0000")·`@hospital`. `DistinctPatients`만 `@from`이 기간 첫날이다
- 마지막에 `CodeAmounts` 한 번(`@from` = from+"0000", `@to` = (to+1일)+"0000"). 금액 버림, `MissingValues` > 0이면 `null`. 코드 줄 정리(design.md 4-2): ① `Trim` 뒤 같은 코드는 합침(건수·금액 더함, 하나라도 `null`이면 `null`) ② 모양이 틀린 코드와 금액 순 999번째 뒤(금액 `null`은 맨 뒤)는 `_REST` 한 줄로 합침 → 늘 1,000개 이하·중복 없음
- 모든 읽기는 `ReadOnlyGuard.Query(db, sql, args, timeout)`로. 시간 제한은 원본 `CommandTimeout=90`과 같게
- 하나라도 실패하면 예외 → 처리기가 오류 하나만 보낸다(AC-003.6). 날짜 형식은 `yyyy-MM-dd`, 문화권 고정(`CultureInfo.InvariantCulture`)

### 4. `RevenueCommands.Register(dispatcher, services)`
- `revenue.days` → `using var hospital = HospitalGate.Open(services)` → `RevenueDays.Read(hospital.Db, hospital.Registration.<범위>, from, to)` → `Envelope.Result(id, { days, codes })`(칸 이름 camelCase, `null` 그대로). 범위 값 이름은 `HospitalRegistration`을 읽고 맞춘다
- `Program.cs`: `var services = HelperServices.Create(); BitCommands.Register(dispatcher, services); RevenueCommands.Register(dispatcher, services);`

### 5. 시험 (`helper/tests/Precheck.Core.Tests/Revenue/*.test.cs`, 가짜 `IBitDb`)
- 사본 비교(AC-003.1), 문장 규칙(읽기 하나·`SELECT`/`WITH` 시작·`;`·`--`·`/*`·쓰기 낱말 없음, 매개변수 표 = 문장 속 `@이름`, AC-003.8), `ReadOnlyGuard.Require`가 매출 문장 + 정해 둔 매개변수만 통과(AC-003.8)
- 가짜 DB가 문장 글자로 답을 고른다: 3일 기간 → 줄 3개, 날마다 문장 7개가 그날 기간으로 불렸는지(AC-003.1), 검사 하나가 1이면 그날만 `unconfirmed`·금액 일곱 칸 `null`, 현금·카드·계좌·미수입금이 맞는 칸에서 오는지, 금액 `12345.67` → `12345`, 음수 → `unconfirmed`(AC-003.2), `Patients` 검사 칸 → 셋 다 `null`, `HistoryGuard` 1 → 신환·재진만 `null`(AC-003.3), 둘째 날 `DistinctPatients`의 `@from`이 첫날, 차트번호 없음 → `patientsToDate null`(AC-003.4), 코드 `MissingValues` → `amount null`, `도수`와 `도수 `(공백) → 한 줄로 합침, 모양 틀린 코드·1,001개 → `_REST` 한 줄과 1,000개 이하, 실패하지 않음(AC-003.5), 둘째 날 읽기 실패 → 결과 없음 + 오류(AC-003.6), 가짜 차트번호 `900001`이 답 JSON·기록에 없음(AC-003.7)
- 처리기: 등록 안 됨 → `E-BIT-NOT-REGISTERED` 오류 답 하나(AC-003.6). 감싸개 `revenue-read.dotnet.test.ts`: `runDotnet('Precheck.Core.Tests.Revenue')`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-003.2 환불이 있는 날은 금액 null …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-003.2 환불이 있는 날은 금액 null, unconfirmed")]`
- 하네스 TDD 기록은 vitest 감싸개(`helper/tests/*.dotnet.test.ts`)로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 이름공간>')`을 부르고 `it` 이름에도 AC ID를 넣는다. 시간 제한은 넉넉히(예: 300초)
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것은 RED가 아니다
- execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
export PATH="$HOME/.dotnet:$PATH"
dotnet test helper/tests/Precheck.Core.Tests -f net10.0 --filter "FullyQualifiedName~Precheck.Core.Tests.Revenue|FullyQualifiedName~Precheck.Core.Tests.Bit|FullyQualifiedName~Precheck.Core.Tests.Protocol"
npx vitest run helper/tests/revenue-read.dotnet.test.ts     # AC-003.1~AC-003.8
npx vitest run helper/tests/bit-connect.dotnet.test.ts helper/tests/protocol.dotnet.test.ts helper/tests/helper-fixups.dotnet.test.ts   # 기존 도우미 시험 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 npm·NuGet 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/revenue-1-read/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 원본 문장의 조건·칸 순서를 "더 낫게" 고치지 마라. 이유: 의원이 이미 쓰는 일일 보고와 같은 숫자가 나와야 한다. 공백·끝 `;`·`--` 주석 줄만 다를 수 있다(AC-003.1)
- 날짜를 묶는 새 SQL(`GROUP BY` 날짜)로 바꾸지 마라. 이유: 원본과 달라져 검증할 수 없다. 느리면 summary에 적고 명세 변경으로 간다(design.md 10절)
- `Sql.All`·`Sql` 기존 상수·`ReadOnlyGuard.test.cs`를 고치지 마라. 이유: 청구 사전점검 시험이 원본 4개를 본다(design.md 11절)
- `Precheck.Windows`(`SqlBitDb.cs` 등)를 고치지 마라. 이유: 매개변수 종류(Char·VarChar)가 이미 맞고, 청구 사전점검과 겹친다
- 계약(design.md 5절) 밖의 칸(미수발생·지역화폐·현금영수증 등)을 답에 넣지 마라. 이유: 읽는 곳을 확인하지 못했고, 정해 둔 칸 밖이면 웹 검사가 거부한다(AC-002.2). 의원 PC 확인 ⑥ 뒤 명세 변경으로 더한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
