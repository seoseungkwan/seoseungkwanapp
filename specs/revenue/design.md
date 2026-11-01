# 설계: 매출 탭

> 시안 `docs/mockups/revenue/index.html`(만드는 코드 `gen.py`, 숫자는 모두 예시)은 **2026-11-01 사용자 승인**("이대로 만들기")이다.
> 따르는 문서: `CLAUDE.md` · `plan.md` §2-4·§4·§5 · `docs/ARCHITECTURE.md` · ADR-004·008·016·020·021 · `docs/tab-frame/plan.md` · `docs/UI_GUIDE.md` · `specs/precheck/design.md`(도우미·통로·표 규칙)

## 1. 개요
- 도우미에 숫자 명령 `revenue.days {from, to}` 하나를 더한다. 도우미는 비트 DB 안에서 날마다 금액을 **더한 값**, 내원·신환·재진·환자 **수**, 기간의 처방 코드별 합계만 돌려준다. 환자 줄은 비트 DB 밖으로 나오지 않는다
- 이 명령은 업무일지 탭도 쓴다(하루 숫자 자동 채우기). 두 번째 읽기 명령을 만들지 않는다. 계약은 5절이다
- 웹은 그 답을 모양 검사(정해 둔 칸·정수만) 뒤 Supabase 표 둘(`sales_days`·`sales_codes`)에 저장하고, 화면은 늘 저장된 숫자로 그린다. 그래서 폰·연결 안 된 PC도 의원 PC가 마지막으로 가져온 숫자를 본다
- 계산(급여·비급여 나눔, 기간 합, 지난달·작년 비교, 13달, 환자 1인당 평균, 치료 묶음)은 브라우저의 순수 함수(`src/lib/revenue/*`)다. 서버 코드는 늘지 않는다(ADR-004)
- Phase: 1 = 도우미 읽기·명령 표(통로 연결)·버전 올리기 · 2 = 표·계산·저장 · 3 = 화면·준비 중 빼기·E2E. 첫 step은 의원 PC 확인표다(2절의 '확인 못 한 것'). 확인표의 '먼저 할 것'은 앱 없이 비트 화면만 보고, '매출 탭에서 볼 것'은 Phase 3 뒤에 한다

### Worker를 쓰지 않는 까닭 (Claude 판단)
- 사용자 요청 메모는 "도우미 읽기 + Worker 연결"이었다. 그러나 이 명령의 답에는 환자 줄이 아예 없다(날짜·정수 금액·건수·처방 코드뿐). 환자 자료 명령(`patient: true`, 조각 → Worker)이 아니라 숫자 명령(`patient: false`)이다
- 같은 길이 이미 있다: `claim.dates`(날짜별 진료·메모 건수)도 숫자 명령으로 화면에 바로 온다(`specs/precheck/design.md` 4-3). 도우미가 DB에서 더하고 세므로 Worker로 보내는 것보다 PC 밖으로 나갈 수 있는 것이 더 적다
- 환자 수(1인당 평균의 분모)도 도우미가 비트 DB 안에서 `COUNT(DISTINCT 차트번호)`로 센다. 차트번호 목록은 도우미 밖으로 나오지 않는다
- 통로 코드(`lib/bridge`, 환자 자료 구역)의 답 검사(AC-002.2·002.3)가 칸 이름까지 정확히 막는다. 차트번호·이름 같은 칸이 섞이면 화면에 닿기 전에 거부한다

## 2. 원본에서 확인한 것 · 확인 못 한 것
원본: GitHub `seoseungkwan/shared` main(`c66488e`, 2026-10-30) `YangjiBareun_사전점검/vendor/drbit_export/`. 이 서버의 사본(지워질 수 있음): `/tmp/claude-1000/-home-developer/1416718f-f900-49a9-a131-c3bd4c2c706c/scratchpad/yangji/repo/YangjiBareun_사전점검/`. 원본 파일은 저장소에 넣지 않는다(SQL 사본만, precheck design.md 10절과 같음)

| 무엇 | 원본 | 확인한 것 |
|---|---|---|
| 하루 금액 | `OperationalReportSql.FinanceNormal`·`FinanceReceivable` | 수납 표 `dbo.OrpInf`(회계일 `OrpAccDte`, 마지막 수납 차수 `OrpRcpSeq`)의 `SUM(OrpTotAmt)`·`SUM(OrpCorAmt)`·`SUM(OrpNonAmt)`와 결제 `dbo.OrcInf`. `FinanceNormal` 넷째~여섯째 = 정상수납 현금·카드·계좌(`RCV − TFC`의 `OrcNewAmt`·`OrcCrdAmt`·`OrcChkAmt`), `FinanceReceivable` 넷째~여섯째 = 미수입금(`COR`) 현금·카드·계좌. 원본 `AccumulateFinance`: 첫째 = 총진료비, 둘째 = 공단부담(조합청구액, `InsurerAmount`), 셋째 = 비급여. 원본 메모: "금액은 외래환자경영통계의 회계일 기준 정상수납·미수입금 조건으로 집계", "현금영수증 발급 기록·미수발생은 입금액에 중복 반영하지 않습니다" |
| 금액을 세면 안 되는 날 | `UnsupportedFinance`·`FinanceMultiplicity`·`ReceivableMultiplicity` → `SetFinanceUnconfirmed` | 환불(`OrcPatTyp='R'`, `TFC`·`TPR`), 변경수납, 예치금(`dbo.IrcInf`), 수납 연결 중복이 있으면 금액을 0으로 두고 '확인 필요'. 환자 수·치료는 그대로 |
| 내원·신환·재진 | `OperationalReportSql.HistoryGuard`·`Patients` | 첫째 칸 = 취소·제외를 뺀 외래 내원 건수, 둘째 = 신환(그 병원 첫 내원이 기간 안), 재진 = 내원 − 신환. 셋째~다섯째 칸이 0이 아니면 원본은 멈춘다. `HistoryGuard`가 0이 아니면 신환을 정할 수 없다 |
| 서로 다른 환자 수 | `Patients`의 `PeriodVisits` 조건 | 원본에 칸이 없다 → 같은 조건으로 `COUNT(DISTINCT 차트번호)`만 내는 새 문장 `DistinctPatients` |
| 치료 묶음 | `OperationalReportSql.Treatments` | `도수`·`CARM1`·`SONO1`·`CRYO`·`ESWT`가 든 코드 → manual·carm·sono·cryo·eswt (건수만, 금액 없음) |
| 처방 금액 | `TrendDataSource` | `SUM(OdrDay × (OdrOutLab='S' ? OdrQty : OdrDtrQty) × OdrPrc)`, 조건 `OdrDelFlg='N' AND OdrCanYon='N' AND OdrOspTyp='I' AND OdrOutCod<>'99'` + 병원 범위. 원본 메모: "수납·환불 대장을 반영한 순수납액은 아닙니다" |

**확인 못 한 것 → TASK-1 의원 PC 확인표** (Claude는 의원 PC와 총괄 계정의 저장된 줄을 볼 수 없다. 총괄이 화면을 보고 적는다)
1. `OrpTotAmt`(총진료비)에 비급여가 들어 있는가. 기본값은 "들어 있다"(급여 = 총진료비 − 비급여, 본인부담 = 급여 − 공단부담)이고, 총괄이 비트 외래환자경영통계 화면에서 하루 숫자로 확인한다(확인표 '먼저 할 것' ①, 코드 없이 5분). '아니오'면 AC-005.1을 고치는 명세 변경을 TASK-5 전에 한다
2. 본인부담 칸: 원본은 `OrpInsOwn`·`OrpTotOwn`을 읽어 두기만 하고 쓰지 않는다. 이 명세는 이 칸을 읽지 않고 1번 식으로 계산한다
3. **미수발생·지역화폐**: 원본 코드에 읽는 곳이 없다. 확인표 '먼저 할 것' ③에서 비트 화면의 칸을 찾고, 명세 변경으로 계약(5절)에 칸을 더한다. 이번 계약에는 넣지 않는다(늘 `null`인 칸을 두지 않는다)
4. 치료 코드 다섯 가지가 이 의원 비트 코드와 같은가('먼저 할 것' ②). 금액·환자 수가 비트와 같은가, 처음 읽는 시간, '확인 필요' 날이 얼마나 자주 나오는가는 Phase 3 뒤 매출 탭에서 본다('매출 탭에서 볼 것' ①~④). 수납 나눔·신환·재진 맞추기는 이 기능에서 그리지 않으므로 업무일지 4단계 확인표가 한다

## 3. 자료 길
```
[의원 PC] 매출 탭 열기 → useBridge(ready) → planFetch(오늘, 저장된 날)
   → 달마다 bridge.call('revenue.days', {from: 그달 1일, to})  ── 확장(검사만) ── 도우미
          도우미: HospitalGate.Open → HistoryGuard → 날마다 원본 문장 6개 + DistinctPatients → CodeAmounts → {days, codes}
   ← lib/bridge checkResult(정해 둔 칸·정수만, 아니면 E-BRIDGE-BAD-REPLY)
   → lib/storage/revenue.saveMonth → Supabase sales_days(upsert) · sales_codes(그 달 지우고 넣기), RLS
   → loadRevenue(13달) → lib/revenue(summary·treatments) → components/revenue/view → 화면
[폰·연결 안 된 PC] loadRevenue → 같은 계산 → 화면(가져오기 없음)
[업무일지 탭] sales_days에서 그날 줄을 읽거나, 비트 PC에서 bridge.call('revenue.days', {from: d, to: d}) (5-4)
```
- 서버로 가는 것: 날짜·건수·정수 금액·확인 필요 여부, 달·처방 코드·건수·금액. 서버 경로·AI로는 보내지 않는다(범위 밖)

## 4. 도우미 (C#, `helper/`)
### 4-1. 파일
- `helper/src/Precheck.Core/Revenue/RevenueSql.cs` — 문장 상수 9개와 매개변수 표 `Parameters`(문장 → `SqlParam[]`)
- `helper/src/Precheck.Core/Revenue/RevenueDays.cs` — 읽기·더하기
- `helper/src/Precheck.Core/Revenue/RevenueCommands.cs` — `revenue.days` 처리기 등록
- `helper/src/Precheck.Core/Bit/Sql.cs` — **더하기만**: `IsAllowed`·`ParametersOf`가 `RevenueSql.Parameters`도 본다. `Sql.All`·`Allowed`·기존 상수는 그대로(기존 시험 `ReadOnlyGuard.test.cs`가 `Sql.All` = 원본 4개를 확인하므로 건드리지 않는다)
- `helper/src/Precheck.Helper/Program.cs` — `HelperServices.Create()`를 변수로 받아 `BitCommands.Register`와 `RevenueCommands.Register`에 같이 넘긴다(두세 줄)
- 시험: `helper/tests/Precheck.Core.Tests/Revenue/*.test.cs`, 원본 사본 `helper/tests/Precheck.Core.Tests/Revenue/original-sql/*.sql`(7개), 감싸개 `helper/tests/revenue-read.dotnet.test.ts`

### 4-2. 모양
```csharp
namespace Precheck.Core.Revenue;
public static class RevenueSql {
  // 원본 그대로 7개
  public const string HistoryGuard, UnsupportedFinance, FinanceMultiplicity, ReceivableMultiplicity, FinanceNormal, FinanceReceivable, Patients;
  // 새 문장 2개
  public const string DistinctPatients, CodeAmounts;
  public static IReadOnlyDictionary<string, SqlParam[]> Parameters { get; }   // 문장마다 그 문장에 실제로 있는 @이름만
}
public sealed class RevenueDay {
  public string Date;
  public long? Visits, NewPatients, ReturnVisits, PatientsToDate;
  public long? Total, Insurer, Noncovered, Cash, Card, Transfer, ReceivableIn;
  public bool Unconfirmed;
}
public sealed class RevenueCode { public string Code; public long Count; public long? Amount; }
public sealed class RevenueResult { public IReadOnlyList<RevenueDay> Days; public IReadOnlyList<RevenueCode> Codes; }
public static class RevenueDays {
  public const int MaxDays = 31; public const int MaxCodes = 1000;
  public static RevenueResult Read(IBitDb db, string hospitalScope, DateTime from, DateTime to);   // 모든 읽기는 ReadOnlyGuard.Query로
}
public static class RevenueCommands {
  public const string Name = "revenue.days";
  public static void Register(Dispatcher dispatcher, BitServices services);   // HospitalGate.Open → Read → Envelope.Result
}
```
- 매개변수: 하루 = `@day`(yyyyMMdd)·`@nextDay`(다음 날)·`@from`(@day+"0000")·`@to`(@nextDay+"0000")·`@hospital`(등록 범위). `DistinctPatients`는 `@from` = **명령의 `from`**+"0000"(그날이 아님), `@to` = 그날 다음 날+"0000". `CodeAmounts`는 `@from` = from+"0000", `@to` = (to+1일)+"0000". 종류·길이는 원본 `OperationalReportData.Command` 그대로(Char 8 · Char 12 · VarChar 32). 원본의 `@daily`(Bit)는 쓰는 문장이 없어 넣지 않는다. `HistoryGuard`는 매개변수가 없다
- 원본 문장 글자: 원본 사본과 비교할 때 공백·끝 `;`·`--`로 시작하는 줄만 다를 수 있다. `Sql.cs` 시험 규칙(`;`·`--`·`/*` 없음, 쓰기 낱말 없음)을 매출 문장에도 같은 시험으로 건다. 원본 다섯 문장이 `WITH`로 시작하므로 매출 시험은 `SELECT` 또는 `WITH`로 시작하는 것을 받는다
- 금액: 원본 `decimal`을 원 미만 버림으로 `long`(`decimal.Truncate`). DB `NULL`은 0(원본 `Amount()`와 같음)
- `DistinctPatients`(새 문장, 원본 `Patients`의 `PeriodVisits` 조건 그대로):
```sql
SELECT COUNT(DISTINCT NULLIF(RTRIM(c.OcmChtNum),'')) AS Patients,
       SUM(CASE WHEN NULLIF(RTRIM(c.OcmChtNum),'') IS NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END) AS MissingCharts
FROM dbo.OcmInf c
WHERE c.OcmAcpDtm >= @from AND c.OcmAcpDtm < @to AND c.OcmPatTyp = 'O'
  AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon <> 'O'
  AND EXISTS (SELECT 1 FROM dbo.DepMst d WHERE d.DepCod = c.OcmDepCod AND d.DepHspNum = @hospital
              AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
```
  (`MissingCharts`가 0이 아니면 `patientsToDate`는 `null`)
- `CodeAmounts`(새 문장, 원본 `TrendDataSource` 금액 식을 코드별로 묶음):
```sql
SELECT RTRIM(o.OdrCod) AS Code, COUNT_BIG(*) AS Lines,
       CAST(SUM(CAST(o.OdrDay AS decimal(10,0)) * CASE WHEN o.OdrOutLab = 'S' THEN o.OdrQty ELSE o.OdrDtrQty END * o.OdrPrc) AS decimal(28,5)) AS Amount,
       SUM(CASE WHEN o.OdrDay IS NULL OR o.OdrPrc IS NULL OR (CASE WHEN o.OdrOutLab = 'S' THEN o.OdrQty ELSE o.OdrDtrQty END) IS NULL
                THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END) AS MissingValues
FROM dbo.OdrInf o
WHERE o.OdrDtm >= @from AND o.OdrDtm < @to AND RTRIM(o.OdrCod) <> ''
  AND o.OdrDelFlg = 'N' AND o.OdrCanYon = 'N' AND o.OdrOspTyp = 'I' AND o.OdrOutCod <> '99'
  AND EXISTS (SELECT 1 FROM dbo.DepMst d WHERE d.DepCod = o.OdrDepCod AND d.DepHspNum = @hospital
              AND o.OdrDtm BETWEEN d.DepAdpDte + '0000' AND d.DepExpDte + '2359')
  AND EXISTS (SELECT 1 FROM dbo.OcmInf c WHERE c.OcmNum = o.OdrOcmNum AND c.OcmPatTyp = 'O'
              AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB') AND c.OcmRsuYon <> 'O')
GROUP BY RTRIM(o.OdrCod)
```
  (내원 상태 목록은 원본 `LaCodes`·월간 `Treatments`와 같다. `MissingValues`가 0이 아니면 그 코드의 `amount`는 `null`)
- 코드 줄 정리(C#, 한 달이 코드 때문에 실패하지 않게): ① 앞뒤 공백을 뺀 뒤 같은 코드가 된 줄은 하나로 합친다(건수·금액 더함, 금액 하나라도 `null`이면 `null`) ② AC-002.2 글자 모양이 아닌 코드와 금액 순 999번째 뒤 코드(금액 `null`은 맨 뒤)는 이름 없는 한 줄 `_REST`로 합친다(같은 합치기 규칙) → 코드는 늘 1,000개 이하·중복 없음·모양 맞음
- 기간이 31일을 넘거나 `to < from`이면 명령 표가 먼저 막고(`maxDays`), `Read`도 한 번 더 막는다(`E-HELPER-BAD-MESSAGE`)
- 오류: 관문 오류(`E-BIT-NOT-REGISTERED`·`E-BIT-HOSPITAL-MISMATCH`·`E-BIT-DB-FAILED`)는 그대로, 읽기 실패·시간 초과는 `E-BIT-READ-FAILED`. 일부만 보내지 않는다. 코드 모양·개수로는 실패하지 않는다(위 코드 줄 정리)

## 5. 계약: 명령 `revenue.days` (매출·업무일지가 같이 쓴다)
### 5-1. 부르기
- 이름 `revenue.days`, 숫자 명령(`patient: false`, 답은 `result` 하나, 조각 없음, PC 확인 창 없음)
- `args`: `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`, 두 날 모두 포함, `from ≤ to`, 31일 이하(`maxDays: 31`)
- 화면은 `useBridge()`(Worker 없이)의 `call('revenue.days', {from, to})`로 부른다. 옛 도우미는 `E-HELPER-UNKNOWN-COMMAND`
- 옛 확장(이 명령이 없는 `commands.json`으로 빌드된 확장)은 모르는 명령을 `E-BRIDGE-REJECTED`로 막는다(`extension/src/relay.ts` `checkRequest`). `hello`는 지나가고 `MIN_EXTENSION`도 그대로라, 통로가 `ready`인데 이 명령만 `E-BRIDGE-REJECTED`면 화면은 '확장 새 버전' 상태(`extension-old`)를 보인다(일반 오류 카드의 [다시 확인]으로 보내지 않는다)
- worklog 갈래는 이 명령이 main에 들어간 뒤(worklog 4단계)에만 이 계약에 기대어 만든다(갈래 규칙 C4)

### 5-2. 답 `{ days: RevenueDayRow[], codes: RevenueCodeRow[] }`
- `days`: `from`부터 `to`까지 **하루도 빠짐없이** 날마다 한 줄(진료 없는 날도 0으로 한 줄). 숫자는 모두 0 이상 정수, 금액 단위는 **원**(원 미만 버림)

| 칸 | 뜻 | 하루 기준 | 원본 | `null`일 때 |
|---|---|---|---|---|
| `date` | 날짜 `YYYY-MM-DD` | — | — | — |
| `visits` | 외래 내원 건수(취소·제외 뺌, 같은 환자 추가 접수 포함) | 접수일(`OcmAcpDtm`) | `Patients` 1 | 내원 기록에 차트번호 없음·중복 |
| `newPatients` | 신환 수(그 병원 첫 내원이 그날) | 접수일 | `Patients` 2 | 위와 같음, 또는 `HistoryGuard`(옛 자료 따로 있음) |
| `returnVisits` | 재진 = `visits − newPatients` | 접수일 | 원본 식 | 위와 같음 |
| `patientsToDate` | `from`부터 그날까지 다녀간 서로 다른 환자 수(한 명은 한 번) | 접수일 | `DistinctPatients` | 차트번호 없는 내원이 있음 |
| `total` | 총진료비 | 회계일(`OrpAccDte`) | `FinanceNormal`+`FinanceReceivable` 1 | `unconfirmed` |
| `insurer` | 조합청구액(공단부담) | 회계일 | 둘의 2 | `unconfirmed` |
| `noncovered` | 비급여 | 회계일 | 둘의 3 | `unconfirmed` |
| `cash` | 현금 수납(정상수납, 환불 뺌) | 회계일 | `FinanceNormal` 4 | `unconfirmed` |
| `card` | 카드 수납(정상수납) | 회계일 | `FinanceNormal` 5 | `unconfirmed` |
| `transfer` | 계좌이체 수납(정상수납, 원본 `OrcChkAmt`) | 회계일 | `FinanceNormal` 6 | `unconfirmed` |
| `receivableIn` | 미수입금(지난 미수를 그날 받은 돈, 현금+카드+계좌) | 회계일 | `FinanceReceivable` 4+5+6 | `unconfirmed` |
| `unconfirmed` | 환불·변경수납·예치금·수납 연결 중복이 있어 금액을 세지 않은 날 | 회계일 | 세 검사 | — (늘 참·거짓) |

- 그날 받은 돈(입금액) = `cash + card + transfer + receivableIn`. 미수발생·지역화폐는 이번 계약에 없다(2절 3)
- `codes`: 기간 전체의 처방 코드별 `{ code, count, amount }`. `count` = 유효 처방 줄 수, `amount` = 처방 금액(일수 × 수량 × 단가, 원 미만 버림, **처방일 기준**, 수납액 아님), 값 빠짐이면 `null`. `code`는 `^[0-9A-Za-z가-힣_.\-]{1,30}$`, 1,000개 이하·중복 없음. 예약 코드 `_REST` = 모양이 맞지 않거나 1,000개를 넘쳐 합친 나머지(이름 없는 '그 밖')
- 웹의 검사(`isRevenueDays`)가 칸 이름·종류·짝(`unconfirmed`와 금액 일곱 칸)·날짜 이어짐을 정확히 본다(AC-002.2). 칸을 더하거나 바꾸면 이 표·`src/types/revenue.ts`·검사·도우미·`sales_days`를 함께 바꾸는 명세 변경이다

### 5-3. 파일
- `src/lib/bridge/commands.json`: `"revenue.days": { "patient": false, "maxDays": 31, "args": { "from": { "type": "date" }, "to": { "type": "date" } } }`. `protocol`은 1 그대로
- `src/types/revenue.ts`(새 파일): `RevenueDayRow`·`RevenueCodeRow`·`RevenueDaysResult`, 코드 모양·한도 상수
- `src/types/bridge.ts`: `SmallCommand`에 `'revenue.days'`, `ArgsMap`·`ResultMap`에 한 줄씩
- `src/lib/bridge/revenueResult.ts`(새 파일): `isRevenueDays(data: unknown): data is RevenueDaysResult`(AC-002.2·002.3)
- `src/lib/bridge/protocol.ts`: `checkResult`에 `case 'revenue.days': return isRevenueDays(data)` 한 줄과 import 한 줄
- `helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs`: 명령 목록 시험의 `notPatient`에 `"revenue.days"` 한 줄을 더한다(다른 갈래도 같은 목록에 더하므로 시험 이름의 숫자는 고치지 않는다)
- 확장(`extension/`)은 코드가 바뀌지 않지만 `commands.json`을 빌드 때 품으므로 **확장을 새로 빌드해 웹스토어에 다시 올려야** 새 명령이 지나간다(14절)

### 5-4. 업무일지가 쓰는 법
- 저장된 숫자: `sales_days`(6절)에서 `day = 그날`인 내 병원 줄을 읽는다(RLS). 매출 탭이 의원 PC에서 한 번 가져온 날만 있다
- 바로 읽기: 비트 PC에서 `call('revenue.days', {from: d, to: d})`. 이때 `patientsToDate`는 그날 하루의 환자 수다
- `unconfirmed`인 날은 금액 일곱 칸이 `null`이다 → 업무일지는 그날 금액을 직접 입력받는다. `null`인 건수 칸도 같다
- 업무일지가 `sales_days`에 쓰고 싶으면 `lib/storage/revenue.ts`의 `saveMonth`(그 달 1일부터)를 쓴다. 하루만 따로 쓰는 길은 만들지 않는다(`patientsToDate`가 1일부터 센 값이어야 해서)

## 6. DB 표 (`supabase/migrations/20261101000400_revenue.sql`, TASK-4)
```sql
-- precheck 8-1과 같은 정의(이 파일이 먼저 들어가도 되게 create or replace)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

create function public.sales_touch_fetched_at() returns trigger language plpgsql set search_path = ''
  as $$ begin new.fetched_at := now(); return new; end $$;

create table public.sales_days (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  day date not null check (day >= date '2000-01-01'),
  visits integer check (visits between 0 and 100000),
  new_patients integer check (new_patients between 0 and 100000),
  return_visits integer check (return_visits between 0 and 100000),
  patients_to_date integer check (patients_to_date between 0 and 1000000),
  total bigint check (total >= 0),
  insurer bigint check (insurer >= 0),
  noncovered bigint check (noncovered >= 0),
  cash bigint check (cash >= 0),
  card bigint check (card >= 0),
  transfer bigint check (transfer >= 0),
  receivable_in bigint check (receivable_in >= 0),
  unconfirmed boolean not null,
  fetched_at timestamptz not null default now(),
  primary key (hospital_id, day),
  check ((unconfirmed and num_nulls(total, insurer, noncovered, cash, card, transfer, receivable_in) = 7)
      or (not unconfirmed and num_nonnulls(total, insurer, noncovered, cash, card, transfer, receivable_in) = 7)));
create table public.sales_codes (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  month date not null check (extract(day from month) = 1 and month >= date '2000-01-01'),
  code text not null check (code ~ '^[0-9A-Za-z가-힣_.-]{1,30}$'),
  count integer not null check (count between 0 and 10000000),
  amount bigint check (amount >= 0),
  fetched_at timestamptz not null default now(),
  primary key (hospital_id, month, code));
create trigger sales_days_fetched_at before update on public.sales_days for each row execute function public.sales_touch_fetched_at();
```
- 권한: 두 표 `enable row level security` → `revoke all … from anon, authenticated` → `grant select` 두 표 · `sales_days`에 `insert`·`update`(칸 단위: `day`~`unconfirmed` 열세 칸. upsert가 충돌 칸도 SET하므로 `day` 포함)·`delete` · `sales_codes`에 `insert`(`month`·`code`·`count`·`amount`)·`delete`. `delete`는 E2E가 시험 계정 줄을 지우는 데 쓴다(service role 키가 없다). `hospital_id`·`fetched_at`은 칸 권한이 없어 기본값·트리거로만 채워진다. `sales_touch_fetched_at()`은 `public`·`anon`·`authenticated`에서 실행 권한을 거둔다(트리거만 부른다)
- 정책: 읽기·넣기·고치기(·지우기) 모두 `hospital_id = (select public.my_hospital_id())`(using·with check). 승인 안 된 병원은 `my_hospital_id()`가 `null`이라 아무 줄도 못 본다
- 시험: `supabase/revenue.rls.test.ts`(PGlite, `rls.test.ts`의 Supabase 흉내 그대로 + auth migration 먼저). 다른 갈래가 같은 `my_hospital_id()`를 먼저 만든 상태에서도 이 migration이 그대로 되는지 본다(C1)
- **실제 Supabase에 붙여 넣는 것은 그때 사용자 OK를 받는다.** 운영자가 SQL 편집기에 붙여 넣는다(auth와 같은 방식). TASK-4가 끝나면 쉬운 말 안내만 하고 붙여 넣지 않는다. E2E(TASK-11)는 붙여 넣은 뒤에만 돈다

## 7. 계산 (`src/lib/revenue/*`, 순수 함수, 네트워크·저장소·React 없음)
```ts
// summary.ts (TASK-5)
export type DaySplit = { covered: number; insurer: number; selfPay: number; noncovered: number; total: number } | null   // null = 확인 필요
export function splitDay(row: RevenueDayRow): DaySplit
export type PeriodSum = { total; covered; insurer; selfPay; noncovered; visits: number; patients: number | null; uncheckedDays: string[]; days: number } | null
export function sumPeriod(rows: RevenueDayRow[], range: DateRange): PeriodSum   // patients = 1일 시작 기간이면 마지막 날 patientsToDate
export function periodsFor(month: string, today: string): { current: DateRange; lastMonth: DateRange; lastYear: DateRange }
export function firstMonth(today: string): string                       // 어제가 속한 달
export function compare(now: number | null, before: number | null): { dir: 'up' | 'down' | 'same'; rate: number } | null  // rate는 % 소수 첫째 자리 버림
export function monthSeries(rows: RevenueDayRow[], lastMonth: string, today: string): MonthPoint[]  // 13개, 오래된 달부터
export function perPatient(sum: PeriodSum): { value: number; lowered: boolean } | null
// treatments.ts (TASK-6)
export const TREATMENT_GROUPS: readonly { key: 'manual' | 'eswt' | 'carm' | 'sono' | 'cryo'; name: string; match: (code: string) => boolean }[]
export function groupTreatments(codes: RevenueCodeRow[]): { key: string; name: string; amount: number; count: number; missing: boolean; rest: boolean }[]
// sync.ts (TASK-7)
export function planFetch(today: string, savedDays: ReadonlySet<string>): DateRange[]
export type SyncResult = { stopped: string | null; failed: { month: string; code: string }[]; helperOld: boolean; extensionOld: boolean }
export function syncRevenue(deps: { call: (args: { from: string; to: string }) => Promise<RevenueDaysResult>; store: RevenueStore; today: string;
  months?: string[]; onProgress?: (p: { done: number; total: number; month: string }) => void }): Promise<SyncResult>
```
- 환자 1인당 평균의 기간은 늘 그 달 1일부터다(고른 기간·지난달 같은 기간·작년 같은 때·13달 모두 1일 시작). 그래서 `patientsToDate` 한 칸으로 어느 기간이든 환자 수를 안다
- 날짜는 `lib/analytics/dates.ts`(`todayInKorea`·`addDays`·`addMonths`·`monthOf`·`monthRange`·`eachDay`)만 쓴다
- 금액은 원 정수를 더하기만 한다. 나눗셈(1인당)은 `Math.floor`, 비율은 소수 첫째 자리 버림(`components/charts/format.ts`와 같은 규칙, 아주 작은 값을 더한 뒤 자름)
- `sync.ts`의 `call`은 화면이 `bridge.call('revenue.days', …)`를 감싸 넘긴다. `store`는 `lib/storage/revenue.ts`의 `saveMonth`(시험에서는 가짜)
- 달 하나의 실패: `E-BIT-READ-FAILED`·`E-BRIDGE-BAD-REPLY`·`E-REVENUE-SAVE-FAILED`는 그 달만 `failed`에 넣고 다음 달로 간다. 그 밖의 번호(통로 끊김·도우미 없음·등록 안 됨·병원 다름 등)는 `stopped`에 넣고 멈춘다. `E-HELPER-UNKNOWN-COMMAND` → `helperOld`, `E-BRIDGE-REJECTED` → `extensionOld`(둘 다 멈춤). 최근 달부터 가져오므로 오래된 달이 실패해도 최근 숫자는 먼저 들어온다

## 8. 저장 (`src/lib/storage/revenue.ts`, TASK-7)
```ts
export type RevenueStore = { saveMonth(month: string, result: RevenueDaysResult): Promise<void> }   // 실패하면 E-REVENUE-SAVE-FAILED를 던진다
export function createRevenueStore(client: SupabaseClient): RevenueStore & {
  loadRevenue(fromMonth: string, toMonth: string): Promise<{ days: RevenueDayRow[]; codes: (RevenueCodeRow & { month: string })[]; fetchedAt: string | null }>
}
```
- `saveMonth`: 답의 첫 날이 그 달 1일인지 본다(아니면 `E-REVENUE-SAVE-FAILED`) → ① `sales_codes`에서 그 달 줄 지우기 ② 새 코드 줄 넣기(`month`·`code`·`count`·`amount`) ③ **마지막에** `sales_days` upsert(`onConflict: 'hospital_id,day'`, 칸 열세 개만, camelCase → snake_case). 하나라도 실패하면 `E-REVENUE-SAVE-FAILED`. 코드 쪽이 실패하면 날 줄이 저장되지 않아 `planFetch`가 그 달을 다시 가져온다(묶음 처리 없이 단순하게, Claude 판단)
- `E-REVENUE-SAVE-FAILED`(plan.md §8의 저장 실패 번호를 기능 이름으로, 갈래 규칙 C3)를 `src/lib/errors.ts`·`src/types/errors.ts`에 더한다: 무엇이 "매출 숫자를 저장하지 못했어요" · 어떻게 "인터넷 연결을 확인하고 [다시 저장]을 눌러 주세요"

## 9. 화면 (`src/components/revenue/*`, TASK-8~10)
- `view.ts`(TASK-8, 순수): `buildRevenueView({ days, codes, fetchedAt, month, today, bridge: 'ready' | 'none' | 'helper-old', sync })` → 상태(AC-008.2)와 네 덩어리 글자·막대 %. `money.ts`: `formatManWon(n)`("1억 6,248만 원", 만 원 아래 버림)·`formatWon(n)`("86,795원")
- 환자 1인당 평균 덩어리(승인 시안): KPI 넷 = 고른 달 1인당 평균("매출 ÷ 환자 n명") · 지난달보다 · 작년 같은 달보다 · 고른 달 환자 수("내원은 n번") + 13달 막대 + 안내 "같은 환자가 한 달에 여러 번 와도 한 명으로 세요 … 확인 필요한 날이 있으면 … 조금 낮게 보일 수 있어요"
- `RevenueScreen.tsx`(`'use client'`, TASK-9): `useBridge()`(`components/claim/useBridge`, Worker 없이) → 상태 `ready`면 `syncRevenue` → `loadRevenue` → `buildRevenueView`. 달 고르기 상태만 화면에 둔다
- 그림 부품(TASK-9): `MonthBars.tsx`(13달 막대: 고른 달 `accent`, 작년 같은 달 `bg-faint`, 다른 달 `chart-2`, 쌓은 막대는 급여 `chart-3`·비급여 `accent`), `TreatmentBars.tsx`(순위 막대: 금액·몫·건수, '그 밖' `line-strong`), 덩어리 네 개와 상태 화면. `components/charts/*`는 고치지 않고 맞는 것(`KpiStat`·`ChartLegend`·`niceScale`·`format`)만 불러 쓴다
- `src/app/(app)/revenue/page.tsx`(TASK-10): 준비 중 화면 → `<RevenueScreen />`. 같은 TASK에서 준비 중 목록·탭 자료·문서 줄을 고친다(ARCHITECTURE.md '기능 명세가 진짜 화면으로 바꿀 때')
- 처음 고르는 달: 어제가 속한 달(1일에는 지난달). 달 고르기는 최근 13달 안에서만 움직인다(그 밖은 저장된 숫자가 없다)
- 가져오기: 연결된 PC에서 열 때 한 번 저절로(빠진 달만, 최근 달부터). 제목 줄의 [다시 가져오기]는 고른 달만 다시 읽는다. 가져오지 못한 달이 있으면 알림 줄 "n달을 가져오지 못했어요"와 그 줄의 [다시 가져오기](가져오지 못한 달들만). 가져오는 동안 진행 줄(정적인 막대, 움직임 없음)
- 상태 `extension-old`: `helper-old`와 같은 모양, 문구 "매출을 읽으려면 확장 프로그램을 새 버전으로 바꿔야 해요" + [설정에서 확인](`/claim/setup`). 승인 시안에 같은 모양으로 더했다(2026-11-01 명세 검토)
- 부품 이름: `RevenueTrend.tsx`·`RevenueSplit.tsx`·`RevenueTreatments.tsx`·`RevenuePerPatient.tsx`·`MonthBars.tsx`·`TreatmentBars.tsx`·`RevenueStates.tsx`
- 매출 탭은 수납 나눔(현금·카드·계좌·미수입금)·신환·재진을 그리지 않는다(업무일지 몫)

## 10. 결정과 트레이드오프
- **날마다 원본 문장을 그대로 돌린다**(하루 7문장): 원본이 의원에서 이미 쓰는 하루 보고와 같은 숫자가 나온다. 하루씩 묶는 새 SQL(`GROUP BY` 날짜)은 빠르지만 원본과 달라져 검증이 어렵다. 처음 13달은 약 2,800문장이라 몇 분 걸릴 수 있다 → 한 달씩 저장해 이어 가기, 다음부터는 빠진 날만. 너무 느리면(Phase 3 뒤 확인표 '매출 탭에서 볼 것' ③) 그때 명세를 바꾼다
- **환자 1인당 = 환자 한 명마다**(2026-11-01 사용자): 서로 다른 환자 수는 날마다 더할 수 없어서 `patientsToDate`(그 달 1일부터 그날까지 누적)로 받는다. 화면의 기간은 모두 1일에 시작하므로 이 한 칸으로 충분하다. 차트번호는 비트 DB 안에서만 센다
- **처방 금액은 처방한 날 기준, 매출은 회계일 기준, 환자 수는 접수일 기준**: 치료별 금액 합이 매출 합과 다르다. 화면에 한 줄로 알린다(시안)
- **확인 필요한 날은 금액을 빼고 날짜만 알린다**(원본과 같음, 사용자 결정). 1인당 평균은 분모(환자 수)에 그날 환자가 들어 있어 조금 낮을 수 있어 `lowered`로 알린다
- **치료 묶음은 코드 표 하나**(`treatments.ts`, 사용자 결정 = 원본 다섯 가지). 저장은 코드별이라 묶음을 바꿔도 다시 읽지 않아도 된다
- **표 두 개, `hospital_id`는 DB가 채운다**: 같은 효과면 코드 대신 DB 제약(plan.md §0). `my_hospital_id()`는 precheck와 같은 정의라 어느 쪽이 먼저 들어가도 된다
- **업무일지와 한 계약**: 수납 나눔·신환·재진은 같은 날 같은 문장에서 이미 나오는 값이라 덧붙이는 비용이 거의 없다(`Patients`·`FinanceNormal`·`FinanceReceivable`의 남은 칸). 두 번째 읽기를 두면 숫자가 서로 어긋날 수 있다

## 11. 다른 작업과 겹치는 파일
> 갈래 규칙(worklog · stats · patients · revenue, 모두 main `95cfa53`에서 나옴, precheck·ai-report와 아무 순서로 합쳐진다) C1~C9를 따른다. 합칠 곳은 줄을 더하기만 해서 기계적으로 합쳐지게 한다.

| 파일 | 이 명세가 하는 일 | 같은 파일을 고치는 갈래 · 합치는 법 |
|---|---|---|
| `supabase/migrations/20261101000400_revenue.sql` + `public.my_hospital_id()` | 새 파일(C2 이름). `my_hospital_id()`는 C1 글자 그대로 `create or replace`(TASK-4) | worklog `…000100`·`…000110`, stats `…000200`, patients `…000300`가 같은 함수를 같은 글자로 만든다. precheck TASK-12는 나중에 `create or replace`로 바꾼다. 함수가 이미 있어도 되는지 시험한다(AC-004.4). 트리거 함수는 기능 이름 `sales_touch_fetched_at()`이라 `touch_updated_at()`과 겹치지 않는다. 백업 목록은 아래 `src/lib/backup/tables.ts` 줄 |
| `src/lib/errors.ts` · `src/types/errors.ts` · `src/lib/errors.test.ts` | `E-REVENUE-SAVE-FAILED` 한 항목 더함(TASK-7, C3) | worklog·stats·patients도 자기 이름 번호(`E-WORKLOG-*` 등)를 더한다 → 같은 번호는 없고 줄만 겹친다 |
| `eslint.config.mjs` · `src/guardrails.test.ts` | 건드리지 않는다. `lib/revenue`·`lib/storage/revenue.ts`는 집계만 다뤄 환자 자료 구역이 아니다. `lib/bridge/revenueResult.ts`는 이미 있는 `lib/bridge` 울타리 안에 든다 | stats·patients·precheck가 울타리를 더할 수 있다 → 이 갈래는 합칠 것이 없다 |
| `docs/ARCHITECTURE.md` · `docs/UI_GUIDE.md` | 매출 줄만 고친다(TASK-10: 준비 중 목록에서 매출, `components/revenue/`·`lib/revenue/`·`lib/storage/`·DB 표 `sales_days`·`sales_codes`·데이터 흐름 '[매출]' 줄). 숫자("준비 중 n개")를 새로 적지 않는다(C5) | 네 갈래 모두 자기 탭 줄을 고친다 → 줄 단위로 합친다 |
| `docs/ADR.md` | 건드리지 않는다(새 결정은 이 design.md 10절에 둔다) | 다른 갈래가 ADR을 더할 수 있다 → 합칠 것이 없다 |
| `src/components/common/notReadyFeatures.ts` · `src/components/shell/menu.ts` · `src/components/dashboard/briefing/features.ts`와 시험들(`notReadyPages.test.tsx`·`tabFrame.test.tsx`·`shell.test.tsx`·`features.test.ts`·`notReadyFeatures.test.ts`·`titles.test.tsx`) | 매출 항목만 바꾼다(TASK-10). 시험은 탭 수를 고정 숫자로 적지 않고 목록에서 센다(C5) | 네 갈래 모두 자기 탭 줄을 고친다 → 줄 단위로 합친다 |
| `helper/src/Precheck.Core/Bit/Sql.cs` | `IsAllowed`·`ParametersOf`가 `RevenueSql.Parameters`도 보게 하는 몇 줄(TASK-3, 더하기만). `Sql.All`·기존 상수는 그대로 | stats(`StatsSql`)·patients(자기 SQL 클래스)도 같은 두 함수에 한 줄씩 더한다(C4) → 각 갈래가 자기 클래스만 본다. 같은 원본 문장이 두 클래스에 있어도 사전이 달라 충돌하지 않는다. precheck Phase 2·5·6은 `Sql.Allowed`에 상수를 더한다 |
| `helper/src/Precheck.Helper/Program.cs` | 처리기 등록 한 줄 + `HelperServices.Create()`를 변수로(TASK-3) | stats·patients·precheck도 처리기 등록 줄을 더한다 → 등록 줄끼리 합친다 |
| `src/lib/bridge/commands.json` | 명령 `revenue.days` 하나 더함(TASK-2) | stats·patients(새 명령이 있으면)·precheck → 명령 줄끼리 합친다 |
| `src/types/bridge.ts` · `src/lib/bridge/protocol.ts` | 유니온·표·`checkResult` case에 한 줄씩(TASK-2) | 위와 같다 |
| `helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs` | 명령 목록에 `"revenue.days"` 한 줄(TASK-2) | 명령을 더하는 갈래마다 같은 목록에 한 줄 → 목록 줄끼리 합친다(시험 이름의 숫자는 고치지 않는다) |
| `src/types/revenue.ts` · `sales_days` | 계약(5절)과 표(6절) | worklog 4단계가 `revenue.days`가 main에 들어간 뒤 읽어 쓴다(C4의 유일한 예외). 칸을 바꾸면 두 명세를 같이 고친다 |
| `src/components/claim/useBridge.ts` | 불러 쓰기만(고치지 않음) | precheck |
| `helper/Directory.Build.props` · `src/lib/bridge/versions.ts`(`LATEST_HELPER`) · `src/lib/bridge/handshake.test.ts` · `extension/manifest.json` | 다음 판으로 올림(TASK-12, 같은 커밋) | 도우미·확장을 바꾸는 갈래(stats·patients·precheck)도 판을 올린다 → 합칠 때 가장 높은 판 하나로 맞추고 `LATEST_HELPER` = `Version`을 다시 확인한다 |
| `plan.md` §2-4 | 매출 읽는 길을 '도우미 읽기'로 고친 줄(TASK-10) | 다른 갈래가 자기 절을 고칠 수 있다 → 줄 단위로 합친다 |
| `src/lib/backup/tables.ts` · 그 시험 | 그 파일이 있으면 `sales_days`·`sales_codes`를 더한다(TASK-10). 없으면 ARCHITECTURE.md에 메모 | precheck TASK-32가 만든다 → 나중에 합쳐지는 쪽이 매출 표 둘을 목록에 넣는다 |
| `e2e/revenue.spec.ts` · `e2e/lib/revenueFakeBridge.ts` | 새 파일(기능 이름, C6) | 다른 갈래의 E2E와 이름이 겹치지 않는다 |

## 12. 사용자 결정 (2026-11-01, 다시 묻지 않는다)
1. **1인당 평균 진료비** — 환자 한 명마다(매출 ÷ 서로 다른 환자 수, 같은 환자 여러 번은 한 명). 환자 수는 도우미가 비트 DB 안에서 센다
2. **치료 묶음** — 원본 일일 보고와 같은 다섯 가지(도수치료·체외충격파·C-arm 주사·초음파·냉동치료) + 그 밖 처방
3. **환불·예치금이 있는 날** — 그날 금액을 합계에서 빼고 "확인 필요한 날 n일"과 날짜만 알림. Phase 3 뒤 확인표 '매출 탭에서 볼 것' ④에서 이런 날이 아주 많으면 직접 입력 칸을 다시 의논한다
4. **업무일지와 같은 읽기** — `revenue.days`가 수납 나눔·신환·재진도 돌려준다(5절)

## 13. 위험 / 미해결
- **총진료비에 비급여가 들어 있는지**(2절 1) — 확인표 '먼저 할 것' ① 답 전에는 TASK-5를 시작하지 않는다
- **미수발생·지역화폐**(2절 3) — 읽는 곳을 모른다. 업무일지는 그때까지 직접 입력
- **처음 읽는 시간** — 13달 약 2,800문장. Phase 3 뒤 매출 탭에서 재 본다(확인표 '매출 탭에서 볼 것' ③). 너무 길면 그때 하루씩 묶는 SQL로 바꾸는 명세 변경을 한다(결정 시점: Phase 3 의원 PC 확인 뒤)
- **옛 확장·옛 도우미**: 새 명령을 모르는 확장은 `E-BRIDGE-REJECTED`, 도우미는 `E-HELPER-UNKNOWN-COMMAND`를 준다 → 매출 탭만 '새 버전' 상태, 청구는 그대로 쓴다(TASK-12는 `MIN_*`을 올리지 않는다)
- **'확인 필요' 날이 많으면** 매출 합계가 크게 모자라 보이고 업무일지 직접 입력이 늘어난다 → Phase 3 뒤 확인표 '매출 탭에서 볼 것' ④ 다음에 12절 3을 다시 의논
- **확장 다시 올리기·도우미 다시 깔기**: 명령 표가 바뀌어 TASK-12가 판을 올린다(`helper/Directory.Build.props`·`LATEST_HELPER`·`extension/manifest.json`). 새 확장은 웹스토어에 다시 올리고 새 도우미 zip은 `helper-v*` 릴리스로 낸다 — 합치기·배포·릴리스 태그·웹스토어 올리기는 사용자가 그때마다 말할 때만 한다. 확장을 웹스토어에 처음 올리기 전에 Phase 1이 합쳐지면 한 번에 끝난다
- **Actions 비용**: `helper/**`·`commands.json`이 바뀐 push는 윈도우 빌드(`helper.yml`)를 돌린다(Actions 분)
- **SQL 문장 시험 규칙**: 기존 `Sql.All` 시험은 `SELECT`로 시작하는 것만 받는다. 매출 문장은 `Sql.All`에 넣지 않고 따로 같은 규칙(+`WITH`)으로 시험한다(4-1)

## 14. 사용자 할 일 (그때 쉬운 말로 안내)
- 확인표 '먼저 할 것' ①~③(비트 화면만, 5~10분): Phase 2 둘째 step(TASK-5) 전
- Phase 1 뒤: 합치기·배포·도우미 릴리스·웹스토어 올리기를 그때 지시 → 의원 PC에 새 도우미 깔기·확장 새 버전
- TASK-4 뒤: 실제 Supabase SQL 편집기에 migration 붙여 넣기 OK
- Phase 3 뒤: 의원 PC 매출 탭에서 확인표 '매출 탭에서 볼 것' ①~④
