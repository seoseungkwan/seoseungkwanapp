# 설계: 매출 탭

> 시안 `docs/mockups/revenue/index.html`(만드는 코드 `gen.py`, 숫자는 모두 예시)은 **2026-11-01 사용자 승인**("이대로 만들기")이다. 승인과 OK 기록은 `docs/mockups/revenue/README.md`에 둔다.
> 시안 3절 **'치료 묶음 고치기'와 묶음 50개 한도도 2026-11-01 사용자 승인**("묶음 화면 좋아요", "적당해 50개면")이다. TASK-14를 막는 것이 없다.
> **승인 뒤 바뀐 곳도 모두 OK**(2026-11-01): 시안 1절의 '급여·비급여·기타' 덩어리와 '확인 필요한 날' 글자(명세 변경으로 다시 그림), 나눔을 못 한 날 안내("시안은 좋아"), '건당 진료비' 덩어리("건당 진료비 좋아요", 시안 판 1793536897-b683). TASK-8·TASK-9는 README의 이 두 줄을 확인하고 시작한다.
> **명세 변경 2026-11-01(사용자)**: 매출 = 총진료비, 급여·비급여 보기는 급여·비급여·기타 셋. 식은 비트 외래환자경영통계 화면(사용자 캡처)으로 확인했다(2절). 계약(5절)에 `copay`·`otherTotal`을 더했다. 기존 칸 이름은 그대로다. 업무일지 명세 후속은 11절.
> **명세 변경 2026-11-01(사용자 "나눔만 비워")**: 나눔이 맞지 않아도 그날 전체를 비우지 않는다. 금액 맞춤 검사나 나눔 네 칸의 음수에 걸린 날은 `splitUnconfirmed`(네 칸만 `null`)이고, `unconfirmed`(아홉 칸 `null`)는 세 검사와 남는 다섯 칸의 음수에만 쓴다(5-2, 10절). 도우미 0.2.0을 아직 내지 않아 판은 더 올리지 않는다.
> **명세 변경 2026-11-01(사용자 "건당 진료비 하나로")**: 환자 1인당 평균 진료비를 없애고 **건당 진료비** = 매출 ÷ 접수 건수로 바꾼다(식과 버림은 통계 탭 보고와 같다). 없앤 것: `patientsToDate`·`DistinctPatients`·`patients_to_date`·`perPatient`·`lowered`. 날 칸 16 → 15, `sales_days` 18칸 → 17칸(보내는 칸 16 → 15), 문장 11 → 10, 하루 문장 9 → 8(걸린 날 3~5 → 2~4). 짝 맞추기는 7절, 접수취소가 빠지는지는 2절 5와 13절. 바뀐 AC: 001.2·001.3·002.2·003.1·003.4(같은 번호에 새 뜻)·003.8·004.1·005.2·005.5·005.6·007.2·008.1·008.3·008.4·008.6·010.1·010.3, 새 008.7. 도우미 0.2.0을 아직 내지 않아(`helper-v*` 태그는 `helper-v0.1.1`까지) 판을 더 올리지 않고 호환 길도 만들지 않는다. migration은 실제 Supabase에 붙인 적이 없어 파일을 그대로 고치고 `alter`를 쓰지 않는다. 업무일지 쪽은 11절.
> 따르는 문서: `CLAUDE.md` · `plan.md` §2-4·§4·§5 · `docs/ARCHITECTURE.md` · ADR-004·008·016·020·021 · `docs/tab-frame/plan.md` · `docs/UI_GUIDE.md` · `specs/precheck/design.md`(도우미·통로·표 규칙)

## 1. 개요
- 도우미에 숫자 명령 `revenue.days {from, to}` 하나를 더한다. 도우미는 비트 DB 안에서 날마다 금액을 **더한 값**, 내원·신환·재진 **수**, 기간의 처방 코드별 합계만 돌려준다. 환자 줄은 비트 DB 밖으로 나오지 않는다
- 이 명령은 업무일지 탭도 쓴다(하루 숫자 자동 채우기). 두 번째 읽기 명령을 만들지 않는다. 계약은 5절이다
- 웹은 그 답을 모양 검사(정해 둔 칸·정수만) 뒤 Supabase 표 둘(`sales_days`·`sales_codes`)에 저장하고, 화면은 늘 저장된 숫자로 그린다. 그래서 폰·연결 안 된 PC도 의원 PC가 마지막으로 가져온 숫자를 본다
- 치료 묶음은 총괄이 만든다: 묶음 이름 + 처방 코드 목록을 서버 표 `rx_groups`에 두고(환자 자료 없음), 매출 탭의 [묶음 고치기] 화면에서 짓고·고르고·옮기고·지운다. 묶음이 없으면 원본 일일 보고의 다섯 가지를 제안으로 보인다. 통계 탭도 합친 뒤 같은 표를 쓸 수 있게 이름을 일반적으로 둔다
- 계산(급여·비급여·기타 나눔, 기간 합, 지난달·작년 비교, 13달, 건당 진료비, 치료 묶음)은 브라우저의 순수 함수(`src/lib/revenue/*`)다. 서버 코드는 늘지 않는다(ADR-004)
- Phase: 1 = 도우미 읽기·명령 표(통로 연결)·버전 올리기 · 2 = 표·계산·저장 · 3 = 화면·준비 중 빼기·E2E. 첫 step은 의원 PC 확인표다(2절의 '확인 못 한 것'). 확인표의 '먼저 할 것'은 앱 없이 비트 화면만 보고, '매출 탭에서 볼 것'은 Phase 3 뒤에 한다

### Worker를 쓰지 않는 까닭 (Claude 판단)
- 사용자 요청 메모는 "도우미 읽기 + Worker 연결"이었다. 그러나 이 명령의 답에는 환자 줄이 아예 없다(날짜·정수 금액·건수·처방 코드뿐). 환자 자료 명령(`patient: true`, 조각 → Worker)이 아니라 숫자 명령(`patient: false`)이다
- 같은 길이 이미 있다: `claim.dates`(날짜별 진료·메모 건수)도 숫자 명령으로 화면에 바로 온다(`specs/precheck/design.md` 4-3). 도우미가 DB에서 더하고 세므로 Worker로 보내는 것보다 PC 밖으로 나갈 수 있는 것이 더 적다
- 통로 코드(`lib/bridge`, 환자 자료 구역)의 답 검사(AC-002.2·002.3)가 칸 이름까지 정확히 막는다. 차트번호·이름 같은 칸이 섞이면 화면에 닿기 전에 거부한다

## 2. 원본에서 확인한 것 · 확인 못 한 것
원본: GitHub `seoseungkwan/shared` main(`c66488e`, 2026-10-30) `YangjiBareun_사전점검/vendor/drbit_export/`. 이 서버의 사본(지워질 수 있음): `/tmp/claude-1000/-home-developer/1416718f-f900-49a9-a131-c3bd4c2c706c/scratchpad/yangji/repo/YangjiBareun_사전점검/`. 원본 파일은 저장소에 넣지 않는다(SQL 사본만, precheck design.md 10절과 같음)

| 무엇 | 원본 | 확인한 것 |
|---|---|---|
| 요양비용총액·급여 본인부담 | `FinanceNormal`의 `NativeRows`(`p.OrpInsAmt`·`p.OrpInsOwn` 고름, 더하지 않음) | 2절 2. 원본은 이 칸을 쓰지 않는다 |
| 하루 금액 | `OperationalReportSql.FinanceNormal`·`FinanceReceivable` | 수납 표 `dbo.OrpInf`(회계일 `OrpAccDte`, 마지막 수납 차수 `OrpRcpSeq`)의 `SUM(OrpTotAmt)`·`SUM(OrpCorAmt)`·`SUM(OrpNonAmt)`와 결제 `dbo.OrcInf`. `FinanceNormal` 넷째~여섯째 = 정상수납 현금·카드·계좌(`RCV − TFC`의 `OrcNewAmt`·`OrcCrdAmt`·`OrcChkAmt`), `FinanceReceivable` 넷째~여섯째 = 미수입금(`COR`) 현금·카드·계좌. 원본 `AccumulateFinance`: 첫째 = 총진료비, 둘째 = 공단부담(조합청구액, `InsurerAmount`), 셋째 = 비급여. 원본 메모: "금액은 외래환자경영통계의 회계일 기준 정상수납·미수입금 조건으로 집계", "현금영수증 발급 기록·미수발생은 입금액에 중복 반영하지 않습니다" |
| 금액을 세면 안 되는 날 | `UnsupportedFinance`·`FinanceMultiplicity`·`ReceivableMultiplicity` → `SetFinanceUnconfirmed` | 환불(`OrcPatTyp='R'`, `TFC`·`TPR`), 변경수납, 예치금(`dbo.IrcInf`), 수납 연결 중복이 있으면 금액을 0으로 두고 '확인 필요'. 내원 건수·치료는 그대로 |
| 내원·신환·재진 | `OperationalReportSql.HistoryGuard`·`Patients` | 첫째 칸 = `PeriodVisits` 줄 수(외래 접수 건수. 조건은 AC-003.4, 접수취소가 빠지는지는 아래 5), 둘째 = 신환(그 병원 첫 내원이 기간 안), 재진 = 내원 − 신환. 셋째~다섯째 칸이 0이 아니면 원본은 멈춘다. `HistoryGuard`가 0이 아니면 신환을 정할 수 없다 |
| 치료 묶음(제안) | `OperationalReportSql.Treatments` | `도수`·`CARM1`·`SONO1`·`CRYO`·`ESWT`가 든 코드 → manual·carm·sono·cryo·eswt (건수만, 금액 없음). 이 규칙은 처음 보이는 **제안** 묶음에만 쓴다. 실제 묶음은 총괄이 만든다 |
| 처방 이름 | `TrendDataSource`의 처방 목록 읽기 | `dbo.SeeMst`(`SeeOdrCod`·`SeeKorNam`·`SeeAdpDte`·`SeeExpDte`) |
| 처방 금액 | `TrendDataSource` | `SUM(OdrDay × (OdrOutLab='S' ? OdrQty : OdrDtrQty) × OdrPrc)`, 조건 `OdrDelFlg='N' AND OdrCanYon='N' AND OdrOspTyp='I' AND OdrOutCod<>'99'` + 병원 범위. 원본 메모: "수납·환불 대장을 반영한 순수납액은 아닙니다" |

**확인 못 한 것 → TASK-1 의원 PC 확인표** (Claude는 의원 PC와 총괄 계정의 저장된 줄을 볼 수 없다. 총괄이 화면을 보고 적는다)
1. **총진료비의 짜임(확인함, 2026-11-01)**: 확인표 '먼저 할 것' ① = 아니오(총진료비 ≠ 공단 + 본인 + 비급여). 사용자가 보낸 비트 외래환자경영통계 화면(숫자 맞춰 봄)의 식: **총진료비 = 요양비용총액 + 비급여 + 100/100미만총액 + 전액본인부담**, **요양비용총액 = 조합청구액(공단) + 급여본인부담금**, 수납액 = 현금 + 카드 + 계좌 + 미수입금. 그래서 매출 = 총진료비, 급여 = 요양비용총액, 기타 = 100/100미만총액 + 전액본인부담(사용자 결정)
2. **요양비용총액·급여 본인부담 읽기**: 원본 `FinanceNormal`의 `NativeRows`가 `OrpInsAmt`·`OrpInsOwn`을 고르지만 더하지 않는다. 이름과 자리로 보아 요양비용총액·급여본인부담금으로 보고(확인 못 함), 같은 수납 줄에서 더한다(새 문장 `FinanceNormalExtra`·`FinanceReceivableExtra`). **100/100미만총액·전액본인부담 칸은 원본 SQL에 없다** → `otherTotal`(기타)은 총진료비에서 급여(`insurer + copay`)와 비급여를 뺀 나머지로 낸다(4-2). 남는 금액으로 셈하므로 **총액 가운데 `insurer + copay`·`noncovered`에 잡히지 않은 금액은 무엇이든 아무 표시 없이 기타로 들어간다**(매출 `total`은 그대로다). 예: `insurer` 300,000 + `copay` 150,000 = `OrpInsAmt` 450,000, `noncovered` 400,000, `total` 1,000,000인데 진짜 기타가 100,000이고 다른 금액 50,000이 총액에 섞여 있으면 `otherTotal`은 150,000이고 어떤 검사에도 걸리지 않는다. 검사 둘이 잡는 것은 다른 일이다: ① `insurer + copay = 요양비용총액`이 아니면 그날 나눔만 비운다(`splitUnconfirmed`, 두 칸의 뜻이 틀린 경우) ② 나눔 네 칸 가운데 음수면 나눔만 비우고, `total`·`cash`·`card`·`transfer`·`receivableIn` 가운데 음수면 '확인 필요'(`unconfirmed`). 웹의 합 검사(AC-005.1)는 도우미가 만든 줄에서 걸리지 않는다(`otherTotal`이 나머지라서). **기타가 맞는지 보는 것은 Phase 3 뒤 확인표 '매출 탭에서 볼 것' ⑤뿐이다**: 급여·비급여·기타가 비트 화면과 같은지 확인 필요한 날도 나눔을 못 한 날도 없는 달로, 만 원 자리까지 같음/다름으로 본다. 다르면 칸을 찾는 명세 변경을 한다(저장된 날을 다시 읽는 일을 포함, AC-007.1). **⑤의 한계**: 만 원 아래 차이는 보지 못하고, 본 달에 없던 금액은 말해 주지 못한다. **화면에 보이는 건강생활유지비(아래 3)가 이 식에 들어가는지도 확인하지 못했다**(지어 정하지 않는다). ⑤의 건강생활유지비 줄이 '아니오'(본 달에 0원)이면 ⑤는 건강생활유지비에 대해 아무것도 말해 주지 못한다. '예'여도 금액이 만 원보다 작으면 드러나지 않는다
3. **미수발생·지역화폐**: 외래환자경영통계 화면에 **미수발생은 보인다**(건강생활유지비·100/100미만본인부담금·100/100미만청구액도 보인다). **지역화폐는 화면에 없다**. 미수발생을 읽는 칸은 원본 코드에 없으므로 칸이 확인될 때까지 계약(5절)에 넣지 않는다(늘 `null`인 칸을 두지 않는다). 확인표 '먼저 할 것' ③은 그대로 둔다
4. 치료 코드 다섯 가지가 이 의원 비트 코드와 같은가('먼저 할 것' ②, 처음 보이는 제안 묶음에만 쓰여 만드는 일을 막지 않는다, 14절). 금액·접수 건수가 비트와 같은가, 처음 읽는 시간, '확인 필요' 날과 접수 건수를 확인하지 못한 날이 얼마나 자주 나오는가는 Phase 3 뒤 매출 탭에서 본다('매출 탭에서 볼 것' ①~④). 수납 나눔·신환·재진 맞추기는 이 기능에서 그리지 않으므로 업무일지 4단계 확인표가 한다
5. **접수취소가 접수 건수에서 빠지는가(확인 못 함)**: `visits`는 원본 `Patients`의 `PeriodVisits` 줄 수이고, 조건은 `OcmPatTyp='O'`·`OcmComStt IN ('WN','HN','TN','PN')`·`OcmRsuYon<>'O'`이다. **이 저장소 어디에도 이 상태 코드들의 뜻이 적혀 있지 않다.** 같은 문장의 입원 쪽 줄이 `VC`·`CN`·`CR`을 거부하지만 그 뜻도 적혀 있지 않다. 시험은 세 조건이 문장 글자에 있고 이 셋이 허용 목록에 없다는 것만 본다(AC-003.4). 그 시험은 접수취소가 빠진다는 증명이 아니다. 증명은 확인표 '매출 탭에서 볼 것' ②다: (나) 비트 통계 화면의 접수(내원) 건수와 매출 탭의 접수 건수가 같고, (다) 접수취소가 있던 하루의 그 화면 건수와 접수 목록에서 취소를 뺀 줄 수가 같을 때만 접수취소가 빠진 것으로 본다. 비트의 숫자는 그 숫자 자체가 접수취소를 뺀 것일 때만 증명이 되므로 둘 다 본다. 하나라도 '다름'이면 증명이 안 된 것이고, 원인을 좁힌 뒤 명세 변경을 정한다. 비트 화면이 다른 상태 목록이나 다른 날 기준(접수일과 회계일)을 쓰는 것이 원인일 수 있다(금액 문장은 `('PN','TN','OE','VN','OB')`, `PeriodVisits`는 `('WN','HN','TN','PN')`). 통계 갈래의 `Visits` 문장(`helper/src/Precheck.Core/Stats/StatsSql.cs` 24줄, wt-stats)이 같은 조건이라 두 탭의 건수가 서로 맞고, 그래서 통계 탭 숫자와 견주는 것은 증명이 되지 않는다

## 3. 자료 길
```
[의원 PC] 매출 탭 열기 → useBridge(ready) → planFetch(오늘, 저장된 날)
   → 달마다 bridge.call('revenue.days', {from: 그달 1일, to})  ── 확장(검사만) ── 도우미
          도우미: HospitalGate.Open → HistoryGuard → 날마다 원본 문장 6개 + FinanceNormalExtra·FinanceReceivableExtra(세 검사를 지난 날 모두 8개, 걸린 날 2~4개) → CodeAmounts → {days, codes}
   ← lib/bridge checkResult(정해 둔 칸·정수만, 아니면 E-BRIDGE-BAD-REPLY)
   → lib/storage/revenue.saveMonth → Supabase sales_days(upsert) · sales_codes(그 달 지우고 넣기), RLS
   → loadRevenue(13달) → lib/revenue(summary·treatments) → components/revenue/view → 화면
[폰·연결 안 된 PC] loadRevenue → 같은 계산 → 화면(가져오기 없음)
[업무일지 탭] sales_days에서 그날 줄을 읽거나, 비트 PC에서 bridge.call('revenue.days', {from: d, to: d}) (5-4)
```
- 서버로 가는 것: 날짜·건수·정수 금액·확인 필요·나눔 못 함 여부, 달·처방 코드·건수·금액. 서버 경로·AI로는 보내지 않는다(범위 밖)

## 4. 도우미 (C#, `helper/`)
### 4-1. 파일
- `helper/src/Precheck.Core/Revenue/RevenueSql.cs` — 문장 상수 10개와 매개변수 표 `Parameters`(문장 → `SqlParam[]`)
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
  // 새 문장 3개
  public const string CodeAmounts, FinanceNormalExtra, FinanceReceivableExtra;
  public static IReadOnlyDictionary<string, SqlParam[]> Parameters { get; }   // 문장마다 그 문장에 실제로 있는 @이름만
}
public sealed class RevenueDay {
  public string Date;
  public long? Visits, NewPatients, ReturnVisits;
  public long? Total, Insurer, Noncovered, Copay, OtherTotal, Cash, Card, Transfer, ReceivableIn;
  public bool Unconfirmed, SplitUnconfirmed;
}
public sealed class RevenueCode { public string Code; public string Name; public long Count; public long? Amount; }   // Name은 없으면 null(AC-002.2)
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
- 매개변수: 하루 = `@day`(yyyyMMdd)·`@nextDay`(다음 날)·`@from`(@day+"0000")·`@to`(@nextDay+"0000")·`@hospital`(등록 범위). `CodeAmounts`는 `@from` = from+"0000", `@to` = (to+1일)+"0000". 종류·길이는 원본 `OperationalReportData.Command` 그대로(Char 8 · Char 12 · VarChar 32). 원본의 `@daily`(Bit)는 쓰는 문장이 없어 넣지 않는다. `HistoryGuard`는 매개변수가 없다
- 원본 문장 글자: 원본 사본과 비교할 때 공백·끝 `;`·`--`로 시작하는 줄만 다를 수 있다. `Sql.cs` 시험 규칙(`;`·`--`·`/*` 없음, 쓰기 낱말 없음)을 매출 문장에도 같은 시험으로 건다. 원본 다섯 문장이 `WITH`로 시작하므로 매출 시험은 `SELECT` 또는 `WITH`로 시작하는 것을 받는다
- 금액: 원본 `decimal`을 원 미만 버림으로 `long`(`decimal.Truncate`). DB `NULL`은 0(원본 `Amount()`와 같음)
- `FinanceNormalExtra`·`FinanceReceivableExtra`(새 문장, 2026-11-01): 원본 `FinanceNormal`·`FinanceReceivable`과 같은 줄을 고르고 마지막 줄만 `SELECT SUM(OrpInsAmt),SUM(OrpInsOwn) FROM NativeRows`로 바꾼다. `FinanceReceivableExtra`는 `NativeRows`의 칸 목록에 `p.OrpInsAmt,p.OrpInsOwn`을 더한다(`FinanceNormal`의 `NativeRows`에는 이미 있다). 매개변수는 원본과 같다(`@day`·`@nextDay`·`@hospital`). 세 검사를 지난 날에만 돌린다(원본이 `FinanceNormal`·`FinanceReceivable`을 돌리는 조건과 같다)
- 하루 계산(2026-11-01): 요양비용총액 = 두 Extra 답 첫째 칸 합, `copay` = 둘째 칸 합(원 미만 버림). **`insurer + copay = 요양비용총액` 비교는 원 미만을 버리기 전 `decimal` 값으로 한다**(1000.5 + 499.5와 1500은 같다. 버린 뒤 1000 + 499로 비교하면 거짓으로 나눔이 빈다). 어긋나면 `splitUnconfirmed`(나눔 네 칸 `insurer`·`noncovered`·`copay`·`otherTotal`만 `null`, `total`·`cash`·`card`·`transfer`·`receivableIn`은 그대로). `otherTotal`은 버린 뒤의 정수로 `total` − (`insurer` + `copay`) − `noncovered`다(요양비용총액을 빼면 위 예에서 급여 + 비급여 + 기타가 `total`보다 1 작아져 웹의 `splitDay`가 거짓으로 나눔을 못 한 날을 낸다). 음수는 버린 뒤의 칸으로 본다: `total`·`cash`·`card`·`transfer`·`receivableIn` 가운데 있으면 `unconfirmed`(금액 아홉 칸 `null`, 이쪽을 먼저 본다), 나눔 네 칸 가운데 있으면 `splitUnconfirmed`. 두 표시는 함께 참이 되지 않는다. `insurer + copay`와 요양비용총액이 어긋나면 나눔이 비지만, 총액에 섞였을 뿐 이 칸들과 상관없는 금액은 아무 표시 없이 기타로 들어간다(`total`은 그대로). 그것을 잡는 것은 의원 PC 확인표 ⑤뿐이다. 건강생활유지비가 이 식에 들어가는지는 **확인 못 함**이고 지어 정하지 않는다. 본 달에 건강생활유지비가 0원이면 ⑤도 그것에 대해 아무것도 말해 주지 못한다(2절 2)
- `CodeAmounts`(새 문장, 원본 `TrendDataSource` 금액 식을 코드별로 묶고, 처방 목록 `SeeMst`에서 이름을 붙임):
```sql
WITH Codes AS (
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
  GROUP BY RTRIM(o.OdrCod))
SELECT c.Code, c.Lines, c.Amount, c.MissingValues,
       (SELECT TOP 1 RTRIM(s.SeeKorNam) FROM dbo.SeeMst s WHERE RTRIM(s.SeeOdrCod) = c.Code ORDER BY s.SeeAdpDte DESC) AS Name
FROM Codes c
```
  (내원 상태 목록은 원본 `LaCodes`·월간 `Treatments`와 같다. `MissingValues`가 0이 아니면 그 코드의 `amount`는 `null`. `Name`은 앞뒤 공백을 빼고 줄바꿈·제어 문자를 빈칸 하나로 바꾼 뒤 100자까지, 비면 `null`. 처방 이름은 처방 목록의 글자라 환자 자료가 아니다)
- 코드 줄 정리(C#, 한 달이 코드 때문에 실패하지 않게): ① 앞뒤 공백을 뺀 뒤 같은 코드가 된 줄은 하나로 합친다(건수·금액 더함, 금액 하나라도 `null`이면 `null`) ② AC-002.2 글자 모양이 아닌 코드와 금액 순 999번째 뒤 코드(금액 `null`은 맨 뒤)는 이름 없는 한 줄 `_REST`로 합친다(같은 합치기 규칙) → 코드는 늘 1,000개 이하·중복 없음·모양 맞음
- 기간이 31일을 넘거나 `to < from`이면 명령 표가 먼저 막고(`maxDays`), `Read`도 한 번 더 막는다(`E-HELPER-BAD-MESSAGE`). `to`가 `9999-12-31`이면 명령 표는 지나지만 다음 날을 셀 수 없으므로 `Read`가 첫머리에서 같은 번호로 막는다(도우미가 멈추지 않게)
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
| `visits` | 외래 접수 건수(`Patients`의 `PeriodVisits` 줄 수, 같은 환자 추가 접수 포함. 조건은 AC-003.4, 접수취소가 빠지는지는 2절 5) | 접수일(`OcmAcpDtm`) | `Patients` 1 | 내원 기록에 차트번호 없음·중복 |
| `newPatients` | 신환 수(그 병원 첫 내원이 그날) | 접수일 | `Patients` 2 | 위와 같음, 또는 `HistoryGuard`(옛 자료 따로 있음) |
| `returnVisits` | 재진 = `visits − newPatients` | 접수일 | 원본 식 | 위와 같음 |
| `total` | 총진료비 | 회계일(`OrpAccDte`) | `FinanceNormal`+`FinanceReceivable` 1 | `unconfirmed` |
| `insurer` | 조합청구액(공단부담) | 회계일 | 둘의 2 | `unconfirmed`·`splitUnconfirmed` |
| `noncovered` | 비급여 | 회계일 | 둘의 3 | `unconfirmed`·`splitUnconfirmed` |
| `copay` | 급여 본인부담금(요양비용총액 = `insurer + copay`) (2026-11-01 더함) | 회계일 | `FinanceNormalExtra`+`FinanceReceivableExtra` 2(`OrpInsOwn` 합) | `unconfirmed`·`splitUnconfirmed` |
| `otherTotal` | 기타 = 100/100미만총액 + 전액본인부담 = `total` − (`insurer` + `copay`) − `noncovered`, 나머지라서 총액에 섞인 다른 금액도 여기에 든다(2절 2) (2026-11-01 더함) | 회계일 | 위 칸들로 계산(위 두 문장 1 `OrpInsAmt` 합은 금액 맞춤 검사에만 쓴다) | `unconfirmed`·`splitUnconfirmed` |
| `cash` | 현금 수납(정상수납, 환불 뺌) | 회계일 | `FinanceNormal` 4 | `unconfirmed` |
| `card` | 카드 수납(정상수납) | 회계일 | `FinanceNormal` 5 | `unconfirmed` |
| `transfer` | 계좌이체 수납(정상수납, 원본 `OrcChkAmt`) | 회계일 | `FinanceNormal` 6 | `unconfirmed` |
| `receivableIn` | 미수입금(지난 미수를 그날 받은 돈, 현금+카드+계좌) | 회계일 | `FinanceReceivable` 4+5+6 | `unconfirmed` |
| `unconfirmed` | 그날 금액을 셀 수 없음, 아홉 칸 모두 `null`: ① 환불·변경수납·예치금·수납 연결 중복(세 검사) ② `total`·`cash`·`card`·`transfer`·`receivableIn` 가운데 음수. 까닭은 답에 없다 | 회계일 | 세 검사 · 계산한 칸 | — (늘 참·거짓) |
| `splitUnconfirmed` | 나눔만 셀 수 없음, `insurer`·`noncovered`·`copay`·`otherTotal`만 `null`이고 `total`·`cash`·`card`·`transfer`·`receivableIn`은 있음: ① `insurer + copay ≠ 요양비용총액`(금액 맞춤 검사) ② 그 네 칸 가운데 음수. `unconfirmed`와 함께 참이 되지 않는다. 까닭은 답에 없다 (2026-11-01 더함, "나눔만 비워") | 회계일 | `FinanceNormalExtra`+`FinanceReceivableExtra` · 계산한 칸 | — (늘 참·거짓) |

- 매출 = `total`(총진료비) = `insurer + copay`(급여) + `noncovered` + `otherTotal`(나눔이 있는 날). 그날 받은 돈(입금액) = `cash + card + transfer + receivableIn`. `splitUnconfirmed`인 날에도 `total`과 입금액은 있다(매출 탭은 수납 나눔을 그리지 않고, 입금액은 업무일지가 쓴다). 미수발생·지역화폐는 이번 계약에 없다(2절 3)
- `codes`: 기간 전체의 처방 코드별 `{ code, name, count, amount }`. `name` = 비트 처방 목록의 이름(1~100자, 없으면 `null`, `_REST`는 `null`). `count` = 유효 처방 줄 수, `amount` = 처방 금액(일수 × 수량 × 단가, 원 미만 버림, **처방일 기준**, 수납액 아님), 값 빠짐이면 `null`. `code`는 `^[0-9A-Za-z가-힣_.\-]{1,30}$`, 1,000개 이하·중복 없음. 예약 코드 `_REST` = 모양이 맞지 않거나 1,000개를 넘쳐 합친 나머지(이름 없는 '그 밖')
- 웹의 검사(`isRevenueDays`)가 칸 이름·종류·짝(`unconfirmed`와 금액 아홉 칸, `splitUnconfirmed`와 나눔 네 칸, 둘이 함께 참이 아님)·날짜 이어짐을 정확히 본다(AC-002.2). 칸을 더하거나 바꾸면 이 표·`src/types/revenue.ts`·검사·도우미·`sales_days`를 함께 바꾸는 명세 변경이다
- **금액 맞춤 검사가 두 탭에 미치는 일(2026-11-01, "나눔만 비워")**: 이 검사나 나눔 네 칸의 음수에 걸린 날은 그 네 칸만 `null`이다. `total`·`cash`·`card`·`transfer`·`receivableIn`은 원본 프로그램의 문장에서 오고 확인하지 못한 가정(`OrpInsAmt` = 요양비용총액, 2절 2)에 기대지 않으므로 남는다. 업무일지 자동 채우기는 이런 날에도 총진료비와 받은 돈을 받고 공단 칸(`insurer`)만 빈다. **가정이 틀리면 매출 탭의 나눔이 날마다 비고 업무일지의 공단 칸도 같이 비지만, 나머지(매출 합계·추이·건당 진료비, 업무일지의 총진료비·수납·건수)는 그대로 돈다.** 이것을 잡아내는 것이 Phase 3 뒤 의원 PC 확인표 '매출 탭에서 볼 것' ⑤다(본 달이 '없음'으로 나온다, 13절). 이 검사를 지났다고 기타가 맞는 것은 아니다: 총액에 섞인 다른 금액은 아무 표시 없이 기타로 들어간다(2절 2)

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
- 바로 읽기: 비트 PC에서 `call('revenue.days', {from: d, to: d})`
- `unconfirmed`인 날은 금액 아홉 칸이 `null`이다(세 검사나 남는 다섯 칸의 음수, 5-2) → 업무일지는 그날 금액을 직접 입력받는다. `splitUnconfirmed`인 날은 업무일지가 쓰는 칸 가운데 `insurer`(공단)만 `null`이다 → 그 칸만 직접 입력받는다. `null`인 건수 칸도 같다
- 업무일지가 `sales_days`에 쓰고 싶으면 `lib/storage/revenue.ts`의 `saveMonth`(그 달 1일부터)를 쓴다. 하루만 따로 쓰는 길은 만들지 않는다(`saveMonth`가 그 달 코드 줄을 지우고 새로 넣으므로 `sales_codes` 합계가 그 달 전체여야 해서)

## 6. DB 표 (`supabase/migrations/20261101000400_revenue.sql`, TASK-4)
```sql
-- precheck 8-1과 같은 정의(이 파일이 먼저 들어가도 되게 create or replace)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

create function public.sales_touch_fetched_at() returns trigger language plpgsql set search_path = ''
  as $$ begin new.fetched_at := now(); return new; end $$;
revoke all on function public.sales_touch_fetched_at() from public, anon, authenticated;   -- 트리거만 부른다

create table public.sales_days (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  day date not null check (day >= date '2000-01-01'),
  visits integer check (visits between 0 and 100000),
  new_patients integer check (new_patients between 0 and 100000),
  return_visits integer check (return_visits between 0 and 100000),
  total bigint check (total >= 0),
  insurer bigint check (insurer >= 0),
  noncovered bigint check (noncovered >= 0),
  copay bigint check (copay >= 0),
  other_total bigint check (other_total >= 0),
  cash bigint check (cash >= 0),
  card bigint check (card >= 0),
  transfer bigint check (transfer >= 0),
  receivable_in bigint check (receivable_in >= 0),
  unconfirmed boolean not null,
  split_unconfirmed boolean not null,
  fetched_at timestamptz not null default now(),
  primary key (hospital_id, day),
  check ((unconfirmed and not split_unconfirmed and num_nulls(total, insurer, noncovered, copay, other_total, cash, card, transfer, receivable_in) = 9)
      or (split_unconfirmed and not unconfirmed and num_nulls(insurer, noncovered, copay, other_total) = 4 and num_nonnulls(total, cash, card, transfer, receivable_in) = 5)
      or (not unconfirmed and not split_unconfirmed and num_nonnulls(total, insurer, noncovered, copay, other_total, cash, card, transfer, receivable_in) = 9)));
create table public.sales_codes (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  month date not null check (extract(day from month) = 1 and month >= date '2000-01-01'),
  code text not null check (code ~ '^[0-9A-Za-z가-힣_.-]{1,30}$'),
  name text check (char_length(name) between 1 and 100),
  count integer not null check (count between 0 and 10000000),
  amount bigint check (amount >= 0),
  fetched_at timestamptz not null default now(),
  primary key (hospital_id, month, code));
create trigger sales_days_fetched_at before update on public.sales_days for each row execute function public.sales_touch_fetched_at();

-- 치료 묶음(총괄이 만든다). 이름이 일반적인 까닭: 통계 탭도 합친 뒤 같은 표를 쓴다(plan.md §5의 rx_groups)
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
-- 위 줄은 C1 글자 그대로 두고 권한만 따로 거둔다. 트리거는 이 권한 없이도 돈다
revoke all on function public.touch_updated_at() from public, anon, authenticated;
create function public.rx_group_codes_ok(codes text[]) returns boolean language sql immutable set search_path = ''
  as $$ select cardinality(codes) <= 1000 and coalesce(bool_and(c is not null and c ~ '^[0-9A-Za-z가-힣_.-]{1,30}$' and c <> '_REST'), true) from unnest(codes) c $$;
  -- bool_and는 null을 건너뛰므로 c is not null을 같이 본다(null 칸 거부)
-- CHECK는 넣는 사람 권한으로 도니 authenticated에게는 남긴다. anon만 /rest/v1/rpc/로 못 부르게 막는다
revoke all on function public.rx_group_codes_ok(text[]) from public, anon;
grant execute on function public.rx_group_codes_ok(text[]) to authenticated;
create table public.rx_groups (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30 and name = btrim(name)
                             and name !~ '[[:cntrl:]]' and name !~ '[0-9]{6,}'),   -- 가벼운 울타리: 제어 문자·주민번호/전화/차트번호 모양 막기
  codes text[] not null default '{}' check (public.rx_group_codes_ok(codes)),
  sort_order integer not null default 0 check (sort_order between 0 and 999),
  updated_at timestamptz not null default now(),
  unique (hospital_id, name) deferrable initially deferred);   -- 이름 맞바꾸기를 한 트랜잭션 안에서 허용(끝에 검사)
create trigger rx_groups_updated_at before update on public.rx_groups for each row execute function public.touch_updated_at();

-- 묶음 목록 한꺼번에 저장(호출한 사람 권한, RLS 그대로, 한 트랜잭션이라 도중 실패면 아무것도 안 바뀜)
create function public.save_rx_groups(groups jsonb) returns setof public.rx_groups language plpgsql security invoker set search_path = ''
as $$
declare g jsonb; keep uuid[] := '{}'; gid uuid;
begin
  if groups is null or jsonb_typeof(groups) <> 'array' or jsonb_array_length(groups) > 50 then raise exception 'bad groups'; end if;   -- jsonb_typeof(null)은 null이라 따로 본다
  for g in select * from jsonb_array_elements(groups) loop
    -- codes가 빠지면 array(...)가 조용히 '{}'가 되어 CHECK를 지나고 손으로 만든 코드가 날아간다. 이름·순서가 빠질 때처럼 거부한다
    if jsonb_typeof(g->'codes') is distinct from 'array' then raise exception 'bad groups'; end if;
    gid := nullif(g->>'id', '')::uuid;
    if gid is null then   -- 새 묶음은 넣기만(이름으로 다른 줄을 고르지 않는다, 줄은 id로만 고른다)
      insert into public.rx_groups (name, codes, sort_order)
        values (g->>'name', array(select jsonb_array_elements_text(g->'codes')), (g->>'sort_order')::int) returning id into gid;
    else
      update public.rx_groups set name = g->>'name', codes = array(select jsonb_array_elements_text(g->'codes')), sort_order = (g->>'sort_order')::int
        where id = gid;
      if not found then raise exception 'not my group'; end if;   -- 남의 병원 id(RLS로 안 보임)
    end if;
    keep := keep || gid;
  end loop;
  delete from public.rx_groups r where r.hospital_id = public.my_hospital_id() and not (r.id = any(keep));
  return query select * from public.rx_groups r where r.hospital_id = public.my_hospital_id() order by r.sort_order;
end $$;
revoke all on function public.save_rx_groups(jsonb) from public, anon;
grant execute on function public.save_rx_groups(jsonb) to authenticated;
```
- 권한: 세 표 `enable row level security` → `revoke all … from anon, authenticated` → `grant select` 두 표 · `sales_days`에 `insert`·`update`(칸 단위: `day`~`split_unconfirmed` 열다섯 칸. upsert가 충돌 칸도 SET하므로 `day` 포함)·`delete` · `sales_codes`에 `insert`(`month`·`code`·`name`·`count`·`amount`)·`delete` · `rx_groups`에 `select`·`insert`·`update`(칸 단위: `name`·`codes`·`sort_order`)·`delete` · `save_rx_groups(jsonb)` 실행은 `authenticated`만. `delete`는 E2E가 시험 계정 줄을 지우는 데 쓴다(service role 키가 없다). `id`·`hospital_id`·`fetched_at`·`updated_at`은 칸 권한이 없어 기본값·트리거로만 채워진다. `touch_updated_at()`의 `create or replace` 줄은 갈래 규칙 C1 글자 그대로(정의자 권한 없음)이고 권한은 그다음 줄에서 따로 거둔다. 함수 실행 권한: 트리거 함수 `sales_touch_fetched_at()`·`touch_updated_at()`은 `public`·`anon`·`authenticated`에서 모두 거둔다(트리거는 이 권한 없이도 돈다). `rx_group_codes_ok()`는 CHECK가 부르는 순수 함수이고 CHECK는 넣는 사람 권한으로 돌므로, `public`·`anon`에서만 거두고 `authenticated`에 실행 권한을 준다(`anon`이 `/rest/v1/rpc/`로 부르지 못하게)
- 정책: 읽기·넣기·고치기(·지우기) 모두 `hospital_id = (select public.my_hospital_id())`(using·with check). 승인 안 된 병원은 `my_hospital_id()`가 `null`이라 아무 줄도 못 본다
- `save_rx_groups`는 저장을 한 트랜잭션으로 묶으려는 것뿐이다(서버 경로가 아니라 DB 함수, `set_hospital_status`와 같은 길). 호출한 사람 권한이라 RLS·칸 권한이 그대로 걸린다. 묶음마다 `codes`가 배열이 아니면(키가 없거나 JSON `null`이어도) `bad groups`로 거부한다: 그대로 두면 `array(...)`가 조용히 `{}`가 되어 CHECK를 지나고 손으로 만든 코드가 날아간다
- 시험: `supabase/revenue.rls.test.ts`(PGlite, `rls.test.ts`의 Supabase 흉내 그대로 + auth migration 먼저). 함수 실행 권한: `my_hospital_id`·`rx_group_codes_ok`는 `authenticated`만, 트리거 함수 둘은 아무도 없음. `rx_groups`: `codes` 안 `null` 칸 거부, 이름에 제어 문자·숫자 6개 이상 이어짐 거부, `save_rx_groups` — `null`·배열 아님·51개 거부, `codes`가 빠지거나 JSON `null`인 묶음은 고칠 때도 넣을 때도 거부되고 표 그대로, 다섯 개 가운데 하나가 제약에 걸리면 표 그대로, 이름 맞바꾸기와 'A 지우고 새 A 넣기'는 순서와 상관없이 됨, 남긴 묶음과 같은 이름의 새 묶음은 오류이고 표 그대로, 남의 `id`는 오류이고 남의 줄 그대로. 이름 울타리 경계: 숫자 5개 이어짐은 되고 6개는 거부. 다른 갈래가 같은 `my_hospital_id()`·`touch_updated_at()`을 먼저 만든 상태에서도 이 migration이 그대로 되는지 본다(C1). `rx_groups`: 내 줄만 읽기·넣기·고치기·지우기, 이름 겹침·31자·앞뒤 공백·`_REST`·1,001개 코드·모양 틀린 코드 거부, `updated_at` 바뀜
- **실제 Supabase에 붙여 넣는 것은 그때 사용자 OK를 받는다.** 운영자가 SQL 편집기에 붙여 넣는다(auth와 같은 방식). TASK-4가 끝나면 쉬운 말 안내만 하고 붙여 넣지 않는다. E2E(TASK-11)는 붙여 넣은 뒤에만 돈다

## 7. 계산 (`src/lib/revenue/*`, 순수 함수, 네트워크·저장소·React 없음)
```ts
// summary.ts (TASK-5)
export type DaySplit = { covered: number; insurer: number; selfPay: number; noncovered: number; other: number; total: number } | null   // covered = insurer + copay, selfPay = copay, other = otherTotal, null = 나눔 없음(unconfirmed·splitUnconfirmed, 또는 covered + noncovered + other ≠ total·음수)
export function splitDay(row: RevenueDayRow): DaySplit
export type PeriodSum = { total; covered; insurer; selfPay; noncovered; other; splitTotal; visits: number | null; perVisitTotal: number; perVisitCount: number; uncheckedDays: string[]; noSplitDays: string[]; noVisitDays: string[]; days: number } | null   // total = unconfirmed 아닌 날 전부, covered~splitTotal = 나눔이 있는 날만(그 날들의 total 합이 0이면 null), visits = 아는 접수 건수 전부(null인 날만 건너뜀, unconfirmed인 날도 든다, 아는 날이 하나도 없으면 null), perVisitTotal·perVisitCount = 짝이 맞는 날(unconfirmed 아니고 visits가 null 아닌 날)의 total 합·visits 합, uncheckedDays = unconfirmed인 날만, noVisitDays = unconfirmed 아니고 visits가 null인 날, days = unconfirmed 아닌 날 수(쉬는 날·나눔을 못 한 날 포함, 하루 평균 = total ÷ days)
export function sumPeriod(rows: RevenueDayRow[], range: DateRange): PeriodSum
export function periodsFor(month: string, today: string): { current: DateRange; lastMonth: DateRange; lastYear: DateRange }
export function firstMonth(today: string): string                       // 어제가 속한 달
export function compare(now: number | null, before: number | null): { dir: 'up' | 'down' | 'same'; rate: number } | null  // rate는 % 소수 첫째 자리 버림
export type MonthPoint = { month: string; partial: boolean; total: number | null; covered: number | null; noncovered: number | null; other: number | null; visits: number | null; perVisit: number | null }   // 자료 없는 달은 숫자 칸이 모두 null
export function monthSeries(rows: RevenueDayRow[], lastMonth: string, today: string): MonthPoint[]  // 13개, 오래된 달부터
export function perVisit(sum: PeriodSum): number | null   // sum이 null이거나 perVisitCount가 0이면 null, 아니면 Math.floor(perVisitTotal ÷ perVisitCount)
// src/types/rxGroups.ts (TASK-6, 이름이 일반적: 통계도 쓴다)
export type RxGroup = { id: string | null; name: string; codes: string[]; sortOrder: number }   // id null = 아직 저장 안 함
// treatments.ts (TASK-6)
export const SUGGESTED_GROUPS: readonly { name: string; match: (code: string) => boolean }[]   // 원본 다섯 규칙, 제안에만
export function suggestGroups(knownCodes: string[]): (RxGroup & { suggested: true })[]
export function groupTreatments(codes: RevenueCodeRow[], groups: RxGroup[]): { name: string; amount: number; count: number; missing: boolean; rest: boolean }[]
export type GroupEditError = 'empty' | 'tooLong' | 'duplicate' | 'badChars' | 'digits' | 'tooMany'   // badChars = 제어 문자, digits = 숫자 6개 이상 이어짐(DB CHECK와 같은 규칙)
export function addGroup(groups: RxGroup[], name: string): RxGroup[] | GroupEditError
export function renameGroup(groups: RxGroup[], index: number, name: string): RxGroup[] | GroupEditError
export function deleteGroup(groups: RxGroup[], index: number): RxGroup[]
export function moveCode(groups: RxGroup[], code: string, toIndex: number | null): RxGroup[]
// sync.ts (TASK-7)
export function planFetch(today: string, savedDays: ReadonlySet<string>): DateRange[]
export type SyncResult = { stopped: string | null; failed: { month: string; code: string }[]; helperOld: boolean; extensionOld: boolean }
type SyncCommon = { call: (args: { from: string; to: string }) => Promise<RevenueDaysResult>; store: RevenueStore; today: string;
  onProgress?: (p: { done: number; total: number; month: string }) => void }
export type SyncDeps = SyncCommon & ({ months: string[]; savedDays?: ReadonlySet<string> } | { months?: undefined; savedDays: ReadonlySet<string> })   // months가 없으면 savedDays가 꼭 있다
export function syncRevenue(deps: SyncDeps): Promise<SyncResult>
```
- 나눔을 못 한 날(`splitUnconfirmed`, 또는 합 검사에 걸린 줄): `total`은 매출·추이·건당 진료비에 들어가고(건당 진료비는 그날 `visits`를 알 때) `covered`~`other`·`splitTotal`에서만 빠진다(`noSplitDays`). `splitTotal`이 `total`보다 작아도 맞춰 고치지 않는다(AC-005.2). 쉬는 날은 아홉 칸이 0이고 두 표시가 거짓이라 나눔이 있는 날로 세어진다. 그래서 나눔 칸이 `null`이 되는 조건은 '그런 날이 없다'가 아니라 '그 날들의 `total` 합이 0'이다(날마다 비는 달에도 일요일이 있어 0원·0÷0·빈 막대가 되지 않게)
- 건당 진료비의 짝 맞추기(AC-005.6): 짝이 맞는 날 = `unconfirmed`가 아니고 `visits`가 `null`이 아닌 날. `perVisit` = 그 날들의 `total` 합 ÷ `visits` 합(원 미만 버림). `visits`가 `null`이고 `total`을 아는 날은 금액과 건수를 함께 빼고 `noVisitDays`에 넣는다(금액은 `sumPeriod`의 `total`에 그대로 있다). **금액만 남기면 분모가 모자라 건당 진료비가 아무 표시 없이 부풀기 때문이다.** `unconfirmed`인 날도 같은 식으로 둘 다 빠지므로, 그 때문에 낮아 보이는 일이 없고 그 경고도 없다. `visits`가 0이고 금액이 있는 날(쉬는 날의 미수입금 등)은 분자에 남는다(통계 탭 식과 같다). `splitUnconfirmed`인 날은 `total`과 `visits`를 알므로 보통 날이다
- 화면 칸 넷의 출처: 고른 달 건당 진료비 = `perVisit`, 설명 '매출 ÷ 접수 n건'의 n = `perVisitCount`, 지난달보다·작년 같은 달보다 = `perVisit`끼리 `compare`, 접수 건수 칸과 설명 '9월 n건' = `visits`. 두 건수가 다른 것은 `unconfirmed`인 날의 접수 건수 때문뿐이고(`noVisitDays`는 어느 쪽에도 안 든다), 시안의 안내 글이 그것을 설명한다
- 날짜는 `lib/analytics/dates.ts`(`todayInKorea`·`addDays`·`addMonths`·`monthOf`·`monthRange`·`eachDay`)만 쓴다
- 금액은 원 정수를 더하기만 한다. 나눗셈(건당 진료비)은 `Math.floor`, 비율은 소수 첫째 자리 버림(`components/charts/format.ts`와 같은 규칙, 아주 작은 값을 더한 뒤 자름)
- `sync.ts`의 `call`은 화면이 `bridge.call('revenue.days', …)`를 감싸 넘긴다. `store`는 `lib/storage/revenue.ts`의 `saveMonth`(시험에서는 가짜)
- 읽을 달: `months`를 주면([다시 가져오기]·[다시 저장]) 그 달들만 읽고 `savedDays`는 쓰지 않는다. 아직 올 날이 없는 달은 부르지 않는다(끝이 시작보다 앞인 기간은 도우미가 `E-HELPER-BAD-MESSAGE`로 막아 가져오기 전체가 멈춘다). `months`가 없으면 `savedDays`로 `planFetch`한다. 그래서 화면은 저절로 가져오기 전에 `loadRevenue`로 저장된 날을 먼저 읽어 넘긴다. 그 읽기가 실패하면 빠진 달을 셀 수 없으므로 13달을 다시 읽지 않고 오류를 보인다
- 달 하나의 실패: `E-BIT-READ-FAILED`·`E-BRIDGE-BAD-REPLY`·`E-REVENUE-SAVE-FAILED`는 그 달만 `failed`에 넣고 다음 달로 간다. 그 밖의 번호(통로 끊김·도우미 없음·등록 안 됨·병원 다름 등)는 `stopped`에 넣고 멈춘다. 번호가 없거나 모양이 틀린 오류는 `E-PAGE-FAILED`로 보아 `stopped`에 넣는다(오류 글은 화면·기록에 넘기지 않는다). `E-HELPER-UNKNOWN-COMMAND` → `helperOld`, `E-BRIDGE-REJECTED` → `extensionOld`(둘 다 멈춤). 최근 달부터 가져오므로 오래된 달이 실패해도 최근 숫자는 먼저 들어온다

## 8. 저장 (`src/lib/storage/revenue.ts`, TASK-7)
```ts
export type RevenueStore = { saveMonth(month: string, result: RevenueDaysResult): Promise<void> }   // 실패하면 E-REVENUE-SAVE-FAILED를 던진다
export function createRevenueStore(client: SupabaseClient): RevenueStore & {
  loadRevenue(fromMonth: string, toMonth: string): Promise<{ days: RevenueDayRow[]; codes: (RevenueCodeRow & { month: string })[]; fetchedAt: string | null }>
}
```
- `saveMonth`: 답의 첫 날이 그 달 1일인지 본다(아니면 `E-REVENUE-SAVE-FAILED`, 그 달 코드 줄을 지우고 새로 넣으므로 `sales_codes` 합계가 그 달 전체여야 해서) → ① `sales_codes`에서 그 달 줄 지우기 ② 새 코드 줄 넣기(`month`·`code`·`name`·`count`·`amount`) ③ **마지막에** `sales_days` upsert(`onConflict: 'hospital_id,day'`, 칸 열다섯 개만, camelCase → snake_case). 코드 줄이 없으면 ②를 건너뛴다. 하나라도 실패하면 `E-REVENUE-SAVE-FAILED`(`RevenueStoreError`, Supabase 오류 내용은 버리고 번호만 던진다). 처음 저장하는 달은 코드 쪽이 실패하면 날 줄이 저장되지 않아 `planFetch`가 그 달을 다시 가져온다(묶음 처리 없이 단순하게, Claude 판단). 이미 저장된 달을 다시 읽을 때는 날 줄이 남아 저절로 고쳐지지 않는다(13절)
- `loadRevenue`: 날 줄과 코드 줄을 1,000줄씩 빈 쪽이 올 때까지 읽는다(서버가 한 번에 주는 줄 수는 정할 수 없고 13달이면 넘친다). `fetchedAt`은 날 줄의 가장 늦은 `fetched_at`이다. 읽기 실패에는 따로 정한 번호가 없어 화면을 열지 못한 것과 같은 `E-PAGE-FAILED`를 던진다. 빈 목록을 돌려주지 않는다
- `E-REVENUE-SAVE-FAILED`(plan.md §8의 저장 실패 번호를 기능 이름으로, 갈래 규칙 C3)를 `src/lib/errors.ts`·`src/types/errors.ts`에 더한다: 무엇이 "매출 숫자를 저장하지 못했어요" · 어떻게 "인터넷 연결을 확인하고 [다시 저장]을 눌러 주세요"

### 8-2. 묶음 저장 (`src/lib/storage/rxGroups.ts`, TASK-13)
```ts
export function createRxGroupStore(client: SupabaseClient): {
  listGroups(): Promise<RxGroup[]>            // sort_order 순. 읽기 실패면 E-REVENUE-GROUP-LOAD-FAILED를 던진다(빈 목록을 돌려주지 않는다)
  saveGroups(after: RxGroup[]): Promise<RxGroup[]>   // rpc('save_rx_groups') 한 번. 실패하면 E-REVENUE-GROUP-SAVE-FAILED(표는 그대로)
}
```
- 보내는 칸은 늘 `id`·`name`·`codes`·`sort_order`뿐. 아직 저장 안 한 묶음은 `id: null`로 보내고 `save_rx_groups`가 새 줄로 넣는다. 오류·예외·줄 목록이 아닌 답은 모두 번호 하나(`RxGroupStoreError`)로 바꾼다(읽기 실패를 빈 목록으로 돌려주면 화면이 제안 묶음으로 잘못 바꾼다). 한꺼번에 저장하므로 도중 실패가 반쪽 저장을 남기지 않고, 실패 뒤 같은 목록으로 [다시 저장]하면 처음 저장과 같은 결과다(실패한 호출은 아무것도 바꾸지 않았으므로). 줄은 `id`로만 고르고, 새 묶음은 넣기만 한다. 이름이 일반적인 까닭은 통계 탭이 합친 뒤 다시 쓰게 하려는 것이다(11절)
- `E-REVENUE-GROUP-SAVE-FAILED`: 무엇이 "치료 묶음을 저장하지 못했어요" · 어떻게 "인터넷 연결과 이름이 겹치지 않는지 보고 [다시 저장]을 눌러 주세요"
- `E-REVENUE-GROUP-LOAD-FAILED`: 무엇이 "치료 묶음을 불러오지 못했어요" · 어떻게 "[다시 불러오기]를 눌러 주세요"

## 9. 화면 (`src/components/revenue/*`, TASK-8~10·14)
- `view.ts`(TASK-8, 순수): `buildRevenueView({ days, codes, fetchedAt, month, today, bridge: 'ready' | 'none' | 'helper-old', sync })` → 상태(AC-008.2)와 네 덩어리 글자·막대 %. `money.ts`: `formatManWon(n)`("1억 6,248만 원", 만 원 아래 버림)·`formatWon(n)`("55,950원")
- 급여·비급여·기타 덩어리는 **셋**으로 나눈다(2026-11-01 사용자): 급여(요양비용총액 = 공단부담 + 본인부담) · 비급여 · 기타(100/100미만총액 + 전액본인부담). 표는 급여(아래에 공단부담·본인부담) · 비급여 · 기타 · 합계(= 매출 = 총진료비), 13달 쌓은 막대는 세 겹(급여 `chart-3` · 비급여 `accent` · 기타 `line-strong`). **나눔을 못 한 날이 있으면**(AC-008.6) 표·막대·몫은 나눔이 있는 날만 더하고(몫은 `splitTotal` 대비), 까닭 없는 안내 "n일(날짜)은 나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요"를 덩어리 머리 아래에 보인다. 합계 줄 이름은 '합계', '지난달보다'는 "–"다. 막대는 세 겹 그대로이고 매출 막대와 같은 눈금(13달 `total`의 최대)이라 그 달은 매출 막대보다 낮다(바로 위 매출 추이에 진짜 매출이 있다). 고른 달의 `splitTotal`이 `null`이면 표는 "–"·"자료 없음"이고 13달 쌓은 막대 그림 전체를 그리지 않는다. 날짜를 보이는 까닭은 확인표 '본 달'이 손으로 더할 때 그 날을 빼야 해서고, 이어진 날은 묶는다("10월 1일–3일·5일–10일"). 이 덩어리와 '확인 필요한 날' 글자는 승인 뒤 바뀌었고 OK를 받았다(`docs/mockups/revenue/README.md`)
- 건당 진료비 덩어리(시안 `gen.py`의 `per_visit()`, 2026-11-01 OK "건당 진료비 좋아요"): 칸 넷 = '10월 건당 진료비'("매출 ÷ 접수 n건") · '9월보다' · '작년 10월보다' · '10월 접수 건수'("9월 n건", 달 이름은 고른 달) + 13달 막대(화면 읽기 표의 접수 건수는 `visits`) + 안내 글(매출 ÷ 접수 건수, 같은 분이 다섯 번 오면 다섯 건, 통계 탭 보고와 같은 식, 확인 필요한 날은 금액과 건수를 함께 뺌). `noVisitDays`가 있으면 안내 "n일(날짜)은 접수 건수를 확인하지 못해 건당 진료비에서 빠졌어요. 매출 합계에는 들어 있어요"를 더한다(AC-008.7, 날짜는 AC-008.6과 같은 묶음). `PeriodSum.visits`가 `null`이면(접수 건수를 아는 날이 없음) 접수 건수 칸은 "0건"이 아니라 "–"·"자료 없음"이고, 설명의 지난달 건수와 13달 화면 읽기 표의 접수 건수도 "–"다. `perVisit`이 `null`이면 건당 진료비 칸도 "–"·"자료 없음"이다(AC-008.4). 비교 달에 `noVisitDays`가 있어도 '9월보다'·'작년 10월보다'는 그대로 비교한다: 달마다 자기 날끼리 짝을 맞춘 숫자라서 "–" 규칙을 더하지 않는다(나눔을 비교하지 않는 AC-008.6과 다르다). 비교 달에는 안내가 없고 고른 기간에만 보인다(AC-008.7)
- `RevenueScreen.tsx`(`'use client'`, TASK-9): `useBridge()`(`components/claim/useBridge`, Worker 없이) → 상태 `ready`면 `syncRevenue` → `loadRevenue` → `buildRevenueView`. 달 고르기 상태만 화면에 둔다
- 그림 부품(TASK-9): `MonthBars.tsx`(13달 막대: 고른 달 `accent`, 작년 같은 달 `bg-faint`, 다른 달 `chart-2`, 쌓은 막대는 세 겹으로 급여 `chart-3`·비급여 `accent`·기타 `line-strong`), `TreatmentBars.tsx`(순위 막대: 금액·몫·건수, '그 밖' `line-strong`), 덩어리 네 개와 상태 화면. `components/charts/*`는 고치지 않고 맞는 것(`KpiStat`·`ChartLegend`·`niceScale`·`format`)만 불러 쓴다
- `src/app/(app)/revenue/page.tsx`(TASK-10): 준비 중 화면 → `<RevenueScreen />`. 같은 TASK에서 준비 중 목록·탭 자료·문서 줄을 고친다(ARCHITECTURE.md '기능 명세가 진짜 화면으로 바꿀 때')
- 처음 고르는 달: 어제가 속한 달(1일에는 지난달). 달 고르기는 최근 13달 안에서만 움직인다(그 밖은 저장된 숫자가 없다)
- 가져오기: 연결된 PC에서 열 때 한 번 저절로(빠진 달만, 최근 달부터). 제목 줄의 [다시 가져오기]는 고른 달만 다시 읽는다. 가져오지 못한 달이 있으면 알림 줄 "n달을 가져오지 못했어요"와 그 줄의 [다시 가져오기](가져오지 못한 달들만). 가져오는 동안 진행 줄(정적인 막대, 움직임 없음)
- 상태 `extension-old`: `helper-old`와 같은 모양, 문구 "매출을 읽으려면 확장 프로그램을 새 버전으로 바꿔야 해요" + [설정에서 확인](`/claim/setup`). 승인 시안에 같은 모양으로 더했다(2026-11-01 명세 검토)
- 치료별 매출은 저장된 묶음(`listGroups`)으로 센다. 읽기가 실패하면 제안으로 바꾸지 않고 "치료 묶음을 불러오지 못했어요" + [다시 불러오기], [묶음 고치기]는 누를 수 없다. 읽기가 성공했는데 저장된 묶음이 없으면 `suggestGroups(아는 코드)`로 세고 "제안 묶음 · 아직 저장 안 함"을 보인다. 머리에 [묶음 고치기]
- 묶음 고치기(TASK-14, 시안 3절 2026-11-01 승인, 편집 중인지는 `RevenueScreen`의 화면 상태이고 `view.ts`의 보기 상태가 아니다): `src/components/revenue/groups/GroupEditor.tsx`(`'use client'`). 묶음마다 이름 칸·처방 수·[묶음 지우기](확인 창)·처방 줄(코드·이름·고른 달 금액·옮길 묶음 고르기), 오른쪽(폰은 아래) '그 밖 처방' 목록과 찾기 칸, [새 묶음]·[취소]·[저장]. 처방 목록 = 저장된 `sales_codes` 최근 13달의 코드(가장 늦은 이름), `_REST` 빼고. 고치기는 `treatments.ts`의 순수 함수로, 저장은 `saveGroups`로. 폰·연결 안 된 PC에서도 된다
- 부품 이름: `RevenueTrend.tsx`·`RevenueSplit.tsx`·`RevenueTreatments.tsx`·`RevenuePerVisit.tsx`·`MonthBars.tsx`·`TreatmentBars.tsx`·`RevenueStates.tsx`
- 매출 탭은 수납 나눔(현금·카드·계좌·미수입금)·신환·재진을 그리지 않는다(업무일지 몫)
- 다른 창이 통로를 쓸 때의 카드(AC-009.6): `E-BRIDGE-BUSY` 글자는 `/claim` 화면과 같이 쓰고 `lib/errors.ts` 한 곳에만 둔다. 이 명세에는 글자를 적지 않는다. 사용자 OK(2026-11-02)는 `docs/mockups/revenue/README.md`에 적는다(TASK-15)

## 10. 결정과 트레이드오프
- **날마다 원본 문장을 그대로 돌린다**(세 검사를 지난 날 8문장 = 원본 6 + Extra 둘, 걸린 날 2~4문장): 원본이 의원에서 이미 쓰는 하루 보고와 같은 숫자가 나온다. 하루씩 묶는 새 SQL(`GROUP BY` 날짜)은 빠르지만 원본과 달라져 검증이 어렵다. 처음 13달은 약 3,190문장(8문장 × 약 396일 + 달마다 `HistoryGuard`·`CodeAmounts` 2문장 × 13달, 모두 세 검사를 지난 날일 때)이라 몇 분 걸릴 수 있다 → 한 달씩 저장해 이어 가기, 다음부터는 빠진 날만. 너무 느리면(Phase 3 뒤 확인표 '매출 탭에서 볼 것' ③) 그때 명세를 바꾼다
- **건당 진료비 = 매출 ÷ 접수 건수**(2026-11-01 사용자 "건당 진료비 하나로"): 통계 탭 보고의 건당진료비와 같은 식이라 견줄 숫자가 있는 기간에는 맞는다(통계 탭은 금액 확인이 필요한 기간에는 숫자를 내지 않는다). 접수 건수는 날마다 더할 수 있어 새 문장이 필요 없다. 금액과 건수 가운데 하나를 모르는 날은 둘 다 뺀다(7절)
- **처방 금액은 처방한 날 기준, 매출은 회계일 기준, 접수 건수는 접수일 기준**: 치료별 금액 합이 매출 합과 다르다. 화면에 한 줄로 알린다(시안). 건당 진료비도 분자와 분모의 기준 날이 달라, 접수가 없는 날에 돈만 들어올 수 있다(분자에 남긴다, 통계 탭과 같다). 금액과 접수 건수는 상태 목록도 다르다(통계 탭 식과 같다)
- **확인 필요한 날은 금액을 빼고 날짜만 알린다**(원본과 같음, 사용자 결정). 건당 진료비는 그날 금액과 접수 건수를 함께 빼므로 그 때문에 낮아지지 않는다(7절)
- **치료 묶음은 총괄이 만든다**(2026-11-01 사용자). 묶음은 `rx_groups`(이름·코드 목록)이고 매출 숫자는 코드별로 저장하므로, 묶음을 바꿔도 비트에서 다시 읽지 않고 바로 다시 센다. 한 처방은 한 묶음에만 든다(매출을 두 번 세지 않게). plan.md §7은 통계용으로 한 코드가 여러 그룹에 들어가도 된다고 했으므로, 표는 막지 않고(코드 배열) 매출 계산이 '순서상 첫 묶음'으로 한 번만 센다. 원본 다섯 규칙은 처음 제안에만 쓴다
- **표 두 개, `hospital_id`는 DB가 채운다**: 같은 효과면 코드 대신 DB 제약(plan.md §0). `my_hospital_id()`는 precheck와 같은 정의라 어느 쪽이 먼저 들어가도 된다
- **매출 = 총진료비, 급여·비급여·기타 셋**(2026-11-01 사용자): 셋을 더하면 매출이다(나눔을 못 한 날이 있는 기간은 그만큼 작다, AC-008.6). 기타의 두 부분(100/100미만총액·전액본인부담)은 읽는 칸을 몰라 한 칸(`otherTotal`)으로 두고, 화면과 같은지는 Phase 3 뒤 확인표 ⑤로 본다
- **나눔만 비운다**(2026-11-01 사용자 "나눔만 비워"): 금액 맞춤 검사는 확인하지 못한 `OrpInsAmt` 가정에 기대는데, `total`과 받은 돈은 그 가정과 상관없는 원본 문장에서 온다. 가정이 틀렸다고 이 값들까지 지우지 않는다. 대신 급여·비급여·기타 덩어리의 합이 매출보다 작을 수 있다. 빠진 금액을 어느 칸에 넣으면 지어낸 숫자가 되므로 안내로 알린다(AC-008.6)
- **업무일지와 한 계약**: 수납 나눔·신환·재진은 같은 날 같은 문장에서 이미 나오는 값이라 덧붙이는 비용이 거의 없다(`Patients`·`FinanceNormal`·`FinanceReceivable`의 남은 칸). 두 번째 읽기를 두면 숫자가 서로 어긋날 수 있다

## 11. 다른 작업과 겹치는 파일
> 갈래 규칙(worklog · stats · patients · revenue, 모두 main `95cfa53`에서 나옴, precheck·ai-report와 아무 순서로 합쳐진다) C1~C9를 따른다. 합칠 곳은 줄을 더하기만 해서 기계적으로 합쳐지게 한다.

| 파일 | 이 명세가 하는 일 | 같은 파일을 고치는 갈래 · 합치는 법 |
|---|---|---|
| `supabase/migrations/20261101000400_revenue.sql` + `public.my_hospital_id()` | 새 파일(C2 이름). `my_hospital_id()`는 C1 글자 그대로 `create or replace`(TASK-4) | worklog `…000100`·`…000110`, stats `…000200`, patients `…000300`가 같은 함수를 같은 글자로 만든다. precheck TASK-12는 나중에 `create or replace`로 바꾼다. 함수가 이미 있어도 되는지 시험한다(AC-004.4). 트리거 함수는 기능 이름 `sales_touch_fetched_at()`이라 `touch_updated_at()`과 겹치지 않는다. 백업 목록은 아래 `src/lib/backup/tables.ts` 줄 |
| `src/lib/errors.ts` · `src/types/errors.ts` · `src/lib/errors.test.ts` | `E-REVENUE-SAVE-FAILED`(TASK-7)·`E-REVENUE-GROUP-SAVE-FAILED`·`E-REVENUE-GROUP-LOAD-FAILED`(TASK-13) 세 항목 더함(C3) | worklog·stats·patients도 자기 이름 번호(`E-WORKLOG-*` 등)를 더한다 → 같은 번호는 없고 줄만 겹친다 |
| `eslint.config.mjs` · `src/guardrails.test.ts` | 건드리지 않는다. `lib/revenue`·`lib/storage/revenue.ts`는 집계만 다뤄 환자 자료 구역이 아니다. `lib/bridge/revenueResult.ts`는 이미 있는 `lib/bridge` 울타리 안에 든다 | stats·patients·precheck가 울타리를 더할 수 있다 → 이 갈래는 합칠 것이 없다 |
| `docs/ARCHITECTURE.md` · `docs/UI_GUIDE.md` | 매출 줄만 고친다(TASK-10: 준비 중 목록에서 매출, `components/revenue/`·`lib/revenue/`·`lib/storage/`·DB 표 `sales_days`·`sales_codes`·데이터 흐름 '[매출]' 줄). 숫자("준비 중 n개")를 새로 적지 않는다(C5) | 네 갈래 모두 자기 탭 줄을 고친다 → 줄 단위로 합친다 |
| `docs/ADR.md` | 건드리지 않는다(새 결정은 이 design.md 10절에 둔다) | 다른 갈래가 ADR을 더할 수 있다 → 합칠 것이 없다 |
| `src/components/common/notReadyFeatures.ts` · `src/components/shell/menu.ts` · `src/components/dashboard/briefing/features.ts`와 시험들(`notReadyPages.test.tsx`·`tabFrame.test.tsx`·`shell.test.tsx`·`features.test.ts`·`notReadyFeatures.test.ts`·`titles.test.tsx`·`DashboardHome.test.tsx`·`(app)/dashboard/page.test.tsx`) | 매출 항목만 바꾼다(TASK-10). 시험은 탭 수를 고정 숫자로 적지 않고 목록에서 센다(C5). 대시보드 시험 둘의 기능 수 글과 상태별 수도 `DASHBOARD_FEATURES`에서 센다 | 네 갈래 모두 자기 탭 줄을 고친다 → 줄 단위로 합친다 |
| `helper/src/Precheck.Core/Bit/Sql.cs` | `IsAllowed`·`ParametersOf`가 `RevenueSql.Parameters`도 보게 하는 몇 줄(TASK-3, 더하기만). `Sql.All`·기존 상수는 그대로 | stats(`StatsSql`)·patients(자기 SQL 클래스)도 같은 두 함수에 한 줄씩 더한다(C4) → 각 갈래가 자기 클래스만 본다. 같은 원본 문장이 두 클래스에 있어도 사전이 달라 충돌하지 않는다. precheck Phase 2·5·6은 `Sql.Allowed`에 상수를 더한다 |
| `helper/src/Precheck.Helper/Program.cs` | 처리기 등록 한 줄 + `HelperServices.Create()`를 변수로(TASK-3) | stats·patients·precheck도 처리기 등록 줄을 더한다 → 등록 줄끼리 합친다 |
| `src/lib/bridge/commands.json` | 명령 `revenue.days` 하나 더함(TASK-2) | stats·patients(새 명령이 있으면)·precheck → 명령 줄끼리 합친다 |
| `src/types/bridge.ts` · `src/lib/bridge/protocol.ts` | 유니온·표·`checkResult` case에 한 줄씩(TASK-2) | 위와 같다 |
| `helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs` | 명령 목록에 `"revenue.days"` 한 줄(TASK-2) | 명령을 더하는 갈래마다 같은 목록에 한 줄 → 목록 줄끼리 합친다(시험 이름의 숫자는 고치지 않는다) |
| `rx_groups` 표 · `src/types/rxGroups.ts` · `src/lib/storage/rxGroups.ts` · `public.touch_updated_at()` | 이 갈래가 만든다(TASK-4·6·13). `touch_updated_at()`은 C1 글자 그대로 | stats 명세는 `rx_groups`를 범위 밖으로 두었다(stats-core `RxGroupDef.id`가 나중에 `rx_groups.id`를 쓴다고 적혀 있음) → 합친 뒤 통계 탭이 이 표·타입·저장소를 그대로 쓴다. 다른 갈래가 `touch_updated_at()`을 같은 글자로 만들어도 된다. 통계가 즐겨찾기·여러 묶음 겹침을 원하면 그때 칸을 더하는 migration을 쓴다 |
| `src/types/revenue.ts` · `sales_days` | 계약(5절)과 표(6절) | worklog 4단계가 `revenue.days`가 main에 들어간 뒤 읽어 쓴다(C4의 유일한 예외). 칸을 바꾸면 두 명세를 같이 고친다 |
| `src/components/claim/useBridge.ts` | 불러 쓰기만(고치지 않음) | precheck |
| `helper/Directory.Build.props` · `src/lib/bridge/versions.ts`(`LATEST_HELPER`) · `src/lib/bridge/handshake.test.ts` · `extension/manifest.json` | 다음 판으로 올림(TASK-12, 같은 커밋) | 도우미·확장을 바꾸는 갈래(stats·patients·precheck)도 판을 올린다 → 합칠 때 가장 높은 판 하나로 맞추고 `LATEST_HELPER` = `Version`을 다시 확인한다 |
| `plan.md` §2-4 | 매출 읽는 길을 '도우미 읽기'로 고친 줄(TASK-10) | 다른 갈래가 자기 절을 고칠 수 있다 → 줄 단위로 합친다 |
| `src/lib/backup/tables.ts` · 그 시험 | 그 파일이 있으면 `sales_days`·`sales_codes`·`rx_groups`를 더한다(TASK-10, `rx_groups`는 총괄이 손으로 만든 유일한 자료라 꼭). 없으면 ARCHITECTURE.md에 메모 | precheck TASK-32가 만든다 → 나중에 합쳐지는 쪽이 표 셋을 목록에 넣는다 |
| `e2e/revenue.spec.ts` · `e2e/lib/revenueFakeBridge.ts` | 새 파일(기능 이름, C6) | 다른 갈래의 E2E와 이름이 겹치지 않는다 |

**후속(이 갈래에서 고치지 않는다)**: 업무일지 명세(feat-worklog, 그쪽 창에서 고치는 중)가 맞춰야 할 사실: ① 금액 칸은 아홉이다. 일곱이 아니다(`copay`·`otherTotal`은 업무일지가 쓰지 않는다) ② 날 칸에 `splitUnconfirmed`가 더해졌다(이 칸도 쓰지 않아도 되지만, 답 검사는 칸이 정확해야 통과한다) ③ `unconfirmed`인 날은 아홉 칸 모두 `null`이라 그날 금액을 직접 적는다. 까닭은 계약에 없으므로 '환불·예치금이 있어'라고 말할 수 없다(음수로도 걸린다) ④ `splitUnconfirmed`인 날은 `total`·`cash`·`card`·`transfer`·`receivableIn`이 있고, 업무일지 칸 가운데 공단(`insurer`)만 빈다 ⑤ `OrpInsAmt` 가정이 틀리면 공단 칸이 날마다 비지만 나머지는 그대로 돈다(5-2) ⑥ 환불이 없어도 공단 칸이 빌 수 있으므로 '환불 없는 날'을 기준으로 한 확인 사례는 그대로 맞지 않는다 ⑦ (2026-11-01 "건당 진료비 하나로") 날 칸에서 `patientsToDate`가 빠져 열다섯 칸이 된다. 업무일지는 이 칸을 쓰지 않으므로(그쪽 명세가 쓰지 않는 칸으로 적었다) 영향이 없고, 같이 쓰는 계약에서 칸 하나가 합칠 때 빠질 뿐이다. 칸 맞춤 표(`total`·`insurer`·`cash`·`card`·`transfer`·`receivableIn`)의 이름은 그대로다. 업무일지 갈래가 이 계약에 기대기 전에(갈래 규칙 C4) 그쪽 명세를 고친다.

## 12. 사용자 결정 (2026-11-01, 다시 묻지 않는다)
1. **건당 진료비** — 매출 ÷ 접수 건수("건당 진료비 하나로"). 같은 분이 다섯 번 오면 다섯 건("한달내 같은사람이 5명 오면 5번온걸로 카운트"), 접수취소는 세지 않는다("접수취소는 카운트하지말고", 증명은 2절 5). 통계 탭 보고와 같은 식, 원 미만 버림
2. **치료 묶음** — 총괄이 직접 만든다("처방묶는건 내가 골라서 묶게해"): 이름 짓기·처방 고르기·이름 바꾸기·지우기·옮기기, 묶음 없는 처방은 '그 밖 처방'. 처음에는 원본 일일 보고의 다섯 가지(도수치료·체외충격파·C-arm 주사·초음파·냉동치료)를 고칠 수 있는 제안으로. 묶음 고치기 화면은 시안 3절 그대로 만든다(2026-11-01 OK "묶음 화면 좋아요", 묶음 50개 "적당해 50개면")
3. **환불·예치금이 있는 날** — 그날 금액을 합계에서 빼고 "확인 필요한 날 n일"과 날짜만 알림. 까닭은 보이지 않는다(AC-008.3). 금액 맞춤 검사에 걸린 날은 여기 들어가지 않는다(아래 6). Phase 3 뒤 확인표 '매출 탭에서 볼 것' ④에서 이런 날이 아주 많으면 직접 입력 칸을 다시 의논한다
4. **업무일지와 같은 읽기** — `revenue.days`가 수납 나눔·신환·재진도 돌려준다(5절)
5. **매출 = 총진료비, 급여·비급여 보기는 급여·비급여·기타 셋**(2026-11-01) — 기타 = 100/100미만총액 + 전액본인부담. 계약에 `copay`·`otherTotal`을 더했다. 업무일지가 쓰는 기존 칸 이름은 그대로다
6. **나눔만 비운다**(2026-11-01, "나눔만 비워") — 금액 맞춤 검사나 나눔 네 칸의 음수에 걸린 날은 그 네 칸만 비운다(`splitUnconfirmed`). 매출 합계·추이·건당 진료비·입금액에는 그날이 들어가고, 급여·비급여·기타 덩어리에서만 빠지며 안내로 알린다. 업무일지에서는 공단 칸만 빈다

## 13. 위험 / 미해결
- **요양비용총액·급여 본인부담 칸의 뜻**(2절 2) — `OrpInsAmt`·`OrpInsOwn`이 그 뜻이 아니면 `insurer + copay ≠ 요양비용총액` 검사로 **매출 탭의 나눔이 날마다 비고 업무일지의 공단 칸도 같이 빈다. 나머지(매출 합계·추이·건당 진료비, 업무일지의 총진료비·수납)는 그대로 돈다**(5-2). 반대로 총액에 섞인 다른 금액은 아무 표시 없이 기타로 들어가 매출 합계만 보아서는 모른다(2절 2). 건강생활유지비가 이 식에 들어가는지도 확인 못 했다. 이것들을 보는 것은 Phase 3 뒤 확인표 ⑤뿐이고 한계가 있다(만 원 아래, 건강생활유지비가 0원인 달, 2절 2). 결정 시점: Phase 3 의원 PC 확인 뒤(다르면 칸을 찾는 명세 변경. 저장된 날은 다시 읽히지 않으므로 그 변경에 13달 모두 다시 읽기를 넣는다, AC-007.1). 확인표 ① 답은 받았다(아니오, 2026-11-01)
- **접수취소가 접수 건수에서 빠지는가**(2절 5) — 사용자 결정은 "접수취소는 카운트하지말고"인데, 문장의 상태 코드 뜻이 이 저장소 어디에도 적혀 있지 않아 글자 시험(AC-003.4)은 증명이 아니다. 보는 것은 Phase 3 뒤 확인표 '매출 탭에서 볼 것' ②뿐이고, (나)·(다)가 모두 '같음'일 때만 빠진 것으로 본다. 하나라도 '다름'이면 증명이 안 된 것이다. 비트 화면이 다른 상태 목록이나 다른 날 기준(접수일과 회계일)을 쓰는 것이 원인일 수 있으므로(금액 문장은 `('PN','TN','OE','VN','OB')`, `PeriodVisits`는 `('WN','HN','TN','PN')`) Claude가 어느 칸을 볼지 말로 알려 주며 원인을 좁힌 뒤 명세 변경을 정한다. 명세를 바꾸게 되면 저장된 날은 다시 읽히지 않으므로 그 변경에 13달 모두 다시 읽기를 넣고(AC-007.1), 통계 갈래의 `Visits`도 같은 조건이라 같이 본다. 접수취소가 세어지는 것으로 밝혀지면 화면 글자 '접수취소는 세지 않아요'(`docs/mockups/revenue/gen.py` `per_visit`)도 바꿔야 한다. 결정 시점: Phase 3 의원 PC 확인 뒤
- **접수 건수를 확인하지 못한 날이 많으면** — 차트번호 없는 접수가 하루에 하나만 있어도 그날 `visits`가 `null`이라(AC-003.3) 금액과 건수가 건당 진료비에서 빠지고 접수 건수 칸도 그만큼 작아진다. 얼마나 흔한지는 확인표 ④로 본다. 결정 시점: Phase 3 의원 PC 확인 뒤
- **미수발생·지역화폐**(2절 3) — 읽는 곳을 모른다. 업무일지는 그때까지 직접 입력
- **처음 읽는 시간** — 13달 약 3,190문장(10절). Phase 3 뒤 매출 탭에서 재 본다(확인표 '매출 탭에서 볼 것' ③). 너무 길면 그때 하루씩 묶는 SQL로 바꾸는 명세 변경을 한다(결정 시점: Phase 3 의원 PC 확인 뒤)
- **옛 확장·옛 도우미**: 새 명령을 모르는 확장은 `E-BRIDGE-REJECTED`, 도우미는 `E-HELPER-UNKNOWN-COMMAND`를 준다 → 매출 탭만 '새 버전' 상태, 청구는 그대로 쓴다(TASK-12는 `MIN_*`을 올리지 않는다)
- **'확인 필요' 날이 많으면** 매출 합계가 크게 모자라 보이고 업무일지 직접 입력이 늘어난다 → Phase 3 뒤 확인표 '매출 탭에서 볼 것' ④ 다음에 12절 3을 다시 의논
- **확장 다시 올리기·도우미 다시 깔기**: 명령 표가 바뀌어 TASK-12가 판을 올린다(`helper/Directory.Build.props`·`LATEST_HELPER`·`extension/manifest.json`). 새 확장은 웹스토어에 다시 올리고 새 도우미 zip은 `helper-v*` 릴리스로 낸다 — 합치기·배포·릴리스 태그·웹스토어 올리기는 사용자가 그때마다 말할 때만 한다. 확장을 웹스토어에 처음 올리기 전에 Phase 1이 합쳐지면 한 번에 끝난다
- **Actions 비용**: `helper/**`·`commands.json`이 바뀐 push는 윈도우 빌드(`helper.yml`)를 돌린다(Actions 분)
- **SQL 문장 시험 규칙**: 기존 `Sql.All` 시험은 `SELECT`로 시작하는 것만 받는다. 매출 문장은 `Sql.All`에 넣지 않고 따로 같은 규칙(+`WITH`)으로 시험한다(4-1)
- **저장된 달을 다시 읽다가 코드 저장이 실패하면** — `saveMonth`는 코드 줄을 지운 뒤 새로 넣고 날 줄은 마지막에 쓴다(8절). 이미 저장된 달을 다시 읽다가 지운 뒤에 코드 저장이 실패하면 날 줄은 남고 코드 줄은 비어 있으며, `planFetch`는 그 달을 다 저장된 달로 보아 저절로 가져오기가 고치지 않는다. 그 자리의 [다시 저장]이나 [다시 가져오기]로 그 달을 다시 읽어야 고쳐진다. 동작은 그대로 둔다
- **768px 미만에서 끊기면** — [비트 PC 연결] 링크가 든 알림 줄이 폰 폭에서 숨으므로(`SavedNotice`, 시안의 폰에 없다) 저장된 숫자가 있는 화면에서 통로가 끊긴 뒤 돌아오는 길은 탭을 옮겼다 오거나 새로 고침하는 것이다(AC-009.7). 저장된 줄이 없으면 연결 필요 화면에 링크가 보인다
- **`bit.input` 중에 창이 닫히면** — 확장은 그 입력이 끝날 때까지 길어도 30분 도우미를 붙잡는다(`extension/src/background.ts` `webGone`, `INPUT_KEEP_MS`). 그동안은 창을 닫았어도 남은 창에서 계속 `busy`(`E-BRIDGE-BUSY`)를 본다. 지금은 `bit.input`을 보내는 화면이 없다

## 14. 사용자 할 일 (그때 쉬운 말로 안내)
- 시안: 승인 뒤 바뀐 '급여·비급여·기타' 덩어리·'확인 필요한 날' 글자와 '건당 진료비' 덩어리는 모두 OK를 받았다(2026-11-01, `docs/mockups/revenue/README.md`). 더 할 일이 없다
- 확인표 '먼저 할 것' ①은 답을 받았다(아니오, 2026-11-01). TASK-5를 막는 것은 ①뿐이라 이제 막는 것이 없다. ②·③(비트 화면만, 5~10분)은 의원 PC에서 시간 될 때 적고 어떤 TASK도 막지 않는다: ②는 처음 보이는 제안 묶음에만 쓰이고 편집 화면에서 고칠 수 있다(AC-006.3). ③은 나중에 업무일지 자동 채우기에만 쓰인다(그때까지 직접 입력)
- Phase 1 뒤: 합치기·배포·도우미 릴리스·웹스토어 올리기를 그때 지시 → 의원 PC에 새 도우미 깔기·확장 새 버전
- TASK-4 뒤: 실제 Supabase SQL 편집기에 migration 붙여 넣기 OK
- Phase 3 뒤: 의원 PC 매출 탭에서 확인표 '매출 탭에서 볼 것' ①~⑤(② = 접수취소가 있던 달의 접수 건수가 비트 통계 화면의 접수(내원) 건수와 같음/다름, 접수취소가 있던 하루의 그 화면 건수가 접수 목록에서 취소를 뺀 줄 수와 같음/다름, ⑤ = 급여·비급여·기타가 외래환자경영통계와 같음/다름, ①·⑤는 확인 필요한 날도 나눔을 못 한 날도 없는 달로 만 원 자리까지)
