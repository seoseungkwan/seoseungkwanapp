# 설계: ERP 마감일지 비트 값 채우기

> 일꾼끼리의 경계는 2절(명령 모양)과 3절(설정 모양)·4절(칸 표)이다. 이 세 절은 승인 뒤 고치지 않는다.

## 1. 흐름
- 채우기: ERP `/h/closing` 화면 [비트 값 채우기](`content.ts`) → `chrome.runtime.sendMessage` → 서비스 워커(`background.ts`) → `chrome.runtime.connectNative('com.seoseungkwan.erp_helper')` → ERP 도우미(`SeoseungkwanErpHelper.exe`, 호출 origin = 새 확장) `closing.day` → 숫자 답 → `cells.ts`가 4절 표로 칸 계획 → `fill.ts`가 넣음 → `panel.ts` 안내
- 설정: 확장 설정 화면(`options.html`·`options.ts`) → 서비스 워커 → `closing.codes` → 찾기·고르기 → `chrome.storage.local` `erpClosing`
- 등록: 설치 파일 → `SeoseungkwanErpHelper.exe --register` → 비트 로그인 창 → PC 확인 창 → ERP 등록 파일(3-4)
- 기존 도우미(`com.seoseungkwan.precheck`, `helper/`)와 웹(`src/`)은 이 기능과 상관없이 운영(1a721ef) 그대로 돈다
- 환자 줄·차트번호는 도우미 밖으로 나가지 않는다. ERP 화면에는 숫자만 들어가고 저장은 사용자가 누른다

## 2. 명령 모양 (ERP 명령 표 `helper-erp/commands.json`, ERP 도우미에 실림. 확장 시험도 읽는다)
```json
{
  "protocol": 1, "hostName": "com.seoseungkwan.erp_helper", "origin": "https://erp.minesolution.com",
  "extensionId": "lkancaiekmoieooheifdimahhkejfmjc", "extensionKey": "<extension-erp/manifest.json key 그대로>",
  "commands": {
    "closing.codes": { "patient": false, "args": {} },
    "closing.day": { "patient": false, "args": {
      "date": { "type": "date" },
      "groups": { "type": "array", "min": 0, "max": 19, "items": { "type": "object", "fields": {
        "key": { "type": "enum", "values": ["carm","sono","arthro","manual","eswt","pt","etc1","etc2","etc3","etc4",
                 "manualConsult","lipus","nail","ct","surgery","eswtStd","eswtRadial","injection","ptVisit"] },
        "codes": { "type": "array", "min": 1, "max": 20,
                   "items": { "type": "string", "min": 1, "max": 20, "pattern": "^\\S(?: ?\\S)*$" } },
        "amountPrefixes": { "type": "array", "optional": true, "min": 0, "max": 5,
                   "items": { "type": "string", "min": 1, "max": 10, "pattern": "^\\S{1,10}$" } },
        "amountCodes": { "type": "array", "optional": true, "min": 0, "max": 20,
                   "items": { "type": "string", "min": 1, "max": 20, "pattern": "^\\S(?: ?\\S)*$" } } } } } } }
  }
}
```
- 맨 위 열쇠 여섯 개는 기존 `src/lib/bridge/commands.json`과 같은 모양이라 기존 `CommandTable.Parse`가 그대로 읽는다(기존 표를 고치지 않음). `commands` 안 두 명령은 지금 `erp` 구역에 있는 것을 그대로 옮긴다
- `amountPrefixes`·`amountCodes`(매출 규칙, TASK-15)는 확장이 carm·sono에만 보낸다(둘 다 비면 안 보냄). 새 확장은 새 ERP 도우미와 같이 깐다(옛 도우미는 모르는 칸이라 E-HELPER-BAD-MESSAGE)
- 코드 꼴(TASK-15, '2번빼고 고쳐' 12번): codes·amountCodes 항목은 `^\S(?: ?\S)*$` 1~20자다 — 앞뒤 공백 없음, 가운데는 빈칸 하나씩. 비트에는 가운데 빈칸 코드가 있다('PROLO C'·'HYALU MINI', 이 의원 최근 1년 410개 가운데 2개. 빈칸 두 칸·탭·앞 공백·21자 넘는 코드는 0개, 가장 긴 코드 10자). 앞글자(amountPrefixes)는 그대로 `^\S{1,10}$`. 도우미 `ClosingDay.CheckGroups`도 같은 꼴만 받는다(지금은 가운데 공백을 막는다). 견주기는 `NormalCode`(앞뒤 공백 뗌·대문자) 그대로다
- 코드가 SQL에 닿는 길(지금 그대로, 바꾸지 않는다): 주사 묶음(injection) 코드만 `InjectionFirstSql`의 @c0~@c19(VarChar 20) 매개변수 값으로 가고, `ErpReadGuard`가 매개변수 이름·글자 길이를 DB 전에 본다. 다른 묶음 코드·매출 규칙 앞글자·더 셀 코드는 `DayCodesSql` 줄을 받은 뒤 C#에서 견준다. 어떤 코드·글자도 SQL 글에 이어 붙이지 않으므로 가운데 빈칸·작은따옴표가 있어도 문장은 바뀌지 않는다
- 오류 번호(TASK-16): `closing.day` date가 도우미 PC 오늘보다 뒤면 E-CLOSING-FUTURE-DATE(새 번호, DB에 닿기 전). 두 명령의 답 모양(아래)은 이 묶음에서 바뀌지 않는다(`closing.codes`는 읽는 문장만 바뀜, 3-2)
- 묶음 key(차례 그대로, 설정 이름 · 쓰는 칸): carm 씨암 · sono SONO · arthro 관절조영 · manual 도수 · eswt 충격파 · pt 물리치료 · etc1~etc4 기타1~4(치료별 건수·치료별 매출) / manualConsult 도수상담 · lipus 리푸스 · nail 손발톱케어 · ct CT · surgery 수술(진료·치료현황만) / eswtStd ESWT Standard · eswtRadial ESWT Radial · injection 주사(운영 지표) / ptVisit 물리치료내원(환자현황)
- 답(`{ v, id, type: 'result', data }`의 data, TS 모양. C# 모델 칸 이름도 같다):
```ts
type Three = { new: number; first90: number; return: number }
type ClosingCodes = { codes: { code: string; name: string | null; visits: number }[]; kinds: { kind: string; name: string | null }[] }
type ClosingDay = {
  date: string                                   // 'YYYY-MM-DD'
  patients: { new: number; first90: number; return: number; ptVisit: number | null; noExamFee: number; total: number }
  groups: ({ key: GroupKey; patients: number; total: number; unpaidVisits: number } & Three)[]   // args 차례
  ages: ({ band: '0' | '10' | '20' | '30' | '40' | '50' | '60' | '70' | '80' | '90' } & Three)[] // 늘 10줄
  money: Record<'total' | 'insurer' | 'receivableIn' | 'unpaidNew' | 'noncovered' | 'discount' | 'disabledFund'
              | 'received' | 'card' | 'cash' | 'transfer' | 'refund', number | null>
  inpatientVisits: number
  reservations: { kinds: { kind: string; total: number; visited: number; changed: number; canceled: number }[]; patients: number }
  injection: { firstTime: number | null; newPatients: number; newLines: number } | null
  overlap: { visits: number; carm: number; sono: number } | null   // TASK-15, 3-3
  warnings: { moneyUnconfirmed: boolean; splitUnconfirmed: boolean; unpaidVisits: number; unknownAge: number; noHistory: boolean }
}
```

## 3. ERP 도우미 (`helper-erp/`)
> TASK-2(기존 도우미에 새 확장 허용)·TASK-3·6(기존 도우미 안의 Closing)으로 만든 것은 TASK-11이 옮기고 되돌린다. 문장·계산 내용(3-2·3-3)은 그대로다.

### 3-1 틀 (TASK-11)
| 자리 | 내용 |
|---|---|
| `helper-erp/Directory.Build.props` | Version **0.1.0**(ERP 도우미 판은 여기 한 곳. TASK-16에서 0.2.0, 기본값 (파)), Product 'Seoseungkwan ERP Helper', 나머지 설정은 `helper/Directory.Build.props`와 같게 |
| `helper-erp/ErpHelper.sln` | 아래 세 프로젝트 + 참조하는 `../helper/src/Precheck.Core`·`Precheck.Windows` |
| `helper-erp/src/Erp.Core/` | netstandard2.0. 참조 Precheck.Core. `../../commands.json`을 `erp-commands.json`으로 싣고 `ErpCommandTable.Load()` = `CommandTable.Parse(실린 바이트)`. `ErpReadGuard`, `Closing/*`(namespace `Erp.Core.Closing`) |
| `helper-erp/src/Erp.Helper/` | net48 Exe, AssemblyName `SeoseungkwanErpHelper`. 참조 Erp.Core·Precheck.Core·Precheck.Windows. `Program.cs`·`ErpServices.cs`·`ErpBitDb.cs`·`ErpLog.cs` (TASK-12) |
| `helper-erp/tests/Erp.Core.Tests/` | net10.0;net48. 지금 `helper/tests/Precheck.Core.Tests/Closing/*`를 옮긴 것 + `ErpReadGuard`·명령 표 시험 |
| `helper-erp/tests/*.dotnet.test.ts`·`runDotnet.ts` | 기존 감싸개와 같은 방식(같은 잠금 파일 `precheck-dotnet.lock`으로 하나씩), 부르는 프로젝트만 ERP 시험 |

- `ErpReadGuard`(Erp.Core): `IsAllowed(sql)` = `ClosingSql.Parameters`에 있거나 `Sql.IsAllowed(sql)`. `ParametersOf(sql)` = ClosingSql 표 → 아니면 `Sql.ParametersOf`. `Require(sql, args)`·`Query(db, sql, args, timeout)`는 기존 `ReadOnlyGuard`와 같은 검사(이름 모두·그 밖 없음·글자 길이·int). Closing 읽기는 모두 `ErpReadGuard.Query`. 기존 계산(`RevenueDays.Read`·`HospitalCheck`)은 기존 `ReadOnlyGuard`로 읽고, `ErpBitDb`에서 `ErpReadGuard`를 한 번 더 지난다
- 기존 `CommandTable`·`OriginGuard`·`Dispatcher`·`MessageLoop`는 1a721ef 그대로 쓴다: ERP 표의 `extensionId`가 새 확장이므로 `OriginGuard`는 새 확장만 받고, 표에 없는 명령은 기존 `Validate`가 E-HELPER-UNKNOWN-COMMAND로 막는다

### 3-2 새 문장 (TASK-3 → TASK-11이 `Erp.Core/Closing/ClosingSql.cs`로 옮김, `Parameters` 표. 허용은 `ErpReadGuard`가 이 표를 본다)
- 진료 조건(모든 문장 같음): 외래(`OcmPatTyp='O'`)·접수취소 아님(`OcmRsuYon<>'O'`)·`OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')`·병원 범위(DepMst, `RevenueSql`과 같음). 처방 조건: `OdrDelFlg='N' AND OdrCanYon='N' AND OdrOutCod<>'99'`
- `DayVisitsSql`(@day·@from·@to·@hospital): 진료마다 [진료번호, 그날 번호 `DENSE_RANK() OVER (ORDER BY RTRIM(OcmChtNum))`, `RTRIM(OcmDgsNfs)`, 만 나이(`PbsBirDte`가 8자리 날짜면 `(CONVERT(int,@day) − CONVERT(int,PbsBirDte)) / 10000`, 아니면 NULL), 마지막 정상 수납 줄(`OrpRcpStt<>'C'`인 줄 가운데 `MAX(OrpRcpSeq)`, 미수입금 줄 'C'는 진료비 칸이 늘 0이라 뺀다) `OrpTotAmt` 또는 NULL — 수납 끝남(unpaidVisits)에만 쓴다]
- `DayCodesSql`(@from·@to·@hospital): [진료번호, `UPPER(RTRIM(OdrCod))`, 줄 수, 금액]. 금액 = 원내(`OdrOspTyp='I'`) 줄의 `OdrDay × (OdrOutLab='S'면 OdrQty, 아니면 OdrDtrQty) × OdrPrc` 합(`RevenueSql.CodeAmounts`와 같은 식, 값이 빠진 줄은 0, TASK-14)
- `InjectionFirstSql`(@from·@to·@hospital·@c0~@c19, 빈 자리는 첫 코드로 채움): 그날 그 코드를 받은 환자 가운데 @from 전 진료에 그 코드가 없는 환자 수 하나
- `MoneyExtraSql`(@day·@nextDay·@hospital, 수납일 기준): [COO 현금 합, 할인 줄(DOD·DOE·DET·DNI·DN1·DN3·DN5) 현금 합, `OrpRcvBil` 합, TPR 현금+카드+계좌 합] (`notes/bit-codes.md` B절, 비트 수납집계 화면과 같은 칸)
- `InpatientSql`(@from·@to·@hospital): 외래가 아닌 접수 수
- `ReservationKindsSql`·`ReservationPatientsSql`(@from·@to = `RsvDtm` 그날, @hospital = 이어진 접수의 범위): 메모 번호(`RTRIM(RsvRefMem)`, 'Memo1' 꼴은 C#에서 바꿔 합친다 — 3-3)마다 [모두, 내원(`RsvSts='OS'`이고 이어진 접수가 진료 끝남), 바꿈(`RsvLog`에 그 예약 기록 있음), 취소(`RsvSts='OC'`)] / 그날 예약 환자 수(`COUNT(DISTINCT 차트번호)`) 하나
- `MemoKindsSql`(매개변수 없음): DtlMst `RESERVMEMO`의 [번호('Memo'+번호 꼴이면 번호만), 이름]
- `CodeListSql`(TASK-16, '2번빼고 고쳐' 16번. @from·@to Char(12) = 어제까지 365일 반열린 기간 0시, @first·@last Char(8) = 그 기간 첫날·마지막 날, @hospital VarChar(32)): `closing.codes` 코드 목록을 문장 하나로 [코드, 진료 수, 이름]. 진료·처방 조건은 `Sql.TrendCte`의 V·R과 같고(코드는 `UPPER(LTRIM(RTRIM(OdrCod)))`), 이름은 그 1년에 쓴 코드의 비트 코드표(SeeMst) 줄만 읽어 `StatsSql.CodeNamesSql`과 같은 차례의 첫 줄을 고른다(지금은 코드표 392,102줄을 모두 받아 410개 이름만 써서 18.5초). 이 PC 2026-11-10 밤(진료 뒤) 같은 꼴로 시험: 410개 · 이름 없음 2 · 진료 197,019 · 약 1.8초(접속 빼고). 받은 뒤는 전처럼 C#이 `NormalCode`로 합치고 진료 수 차례·2,000개·이름 지우기를 한다. `Sql.TrendTotalsSql`·`StatsSql.CodeNamesSql`은 `closing.codes`에서 더 쓰지 않는다(기존 관문 문장이라 `ErpReadGuard` 허용은 그대로)
```sql
WITH V AS (
 SELECT c.OcmNum FROM dbo.OcmInf c
 WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O' AND c.OcmRsuYon<>'O'
   AND c.OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')
   AND EXISTS(SELECT 1 FROM dbo.DepMst d WHERE d.DepCod=c.OcmDepCod AND d.DepHspNum=@hospital
               AND LEFT(c.OcmAcpDtm,8) BETWEEN d.DepAdpDte AND d.DepExpDte)
), R AS (
 SELECT DISTINCT o.OdrOcmNum VisitId,UPPER(LTRIM(RTRIM(o.OdrCod))) RxCode FROM dbo.OdrInf o JOIN V ON V.OcmNum=o.OdrOcmNum
 WHERE o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99' AND RTRIM(ISNULL(o.OdrCod,''))<>''
), T AS (SELECT RxCode,COUNT_BIG(*) Visits FROM R GROUP BY RxCode),
N AS (
 SELECT UPPER(LTRIM(RTRIM(s.SeeOdrCod))) Code,s.SeeKorNam Name,
  ROW_NUMBER() OVER (PARTITION BY UPPER(LTRIM(RTRIM(s.SeeOdrCod))) ORDER BY s.SeeOdrCod,
   CASE WHEN @last BETWEEN s.SeeAdpDte AND s.SeeExpDte THEN 0 ELSE 1 END,s.SeeAdpDte DESC,s.SeeExpDte DESC,s.SeeKorNam,s.SeeMdcTyp,s.SeeElcCod) Pick
 FROM dbo.SeeMst s
 WHERE s.SeeOdrCod<>'' AND s.SeeAdpDte<=@last AND s.SeeExpDte>=@first
   AND UPPER(LTRIM(RTRIM(s.SeeOdrCod))) IN (SELECT RxCode FROM T)
)
SELECT T.RxCode,T.Visits,N.Name FROM T LEFT JOIN N ON N.Code=T.RxCode AND N.Pick=1
```

### 3-3 계산 (TASK-3, `ClosingDay.Read(db, scope, date, groups)` · `ClosingCodes.Read(db, scope, today)`)
- 금액: `RevenueDays.Read(db, scope, d, d).Days[0]`을 그대로 쓰고(unconfirmed·splitUnconfirmed인 날은 빠진 칸을 `RevenueSql.FinanceNormal`·`FinanceReceivable` 줄을 확정 검사 없이 그대로 더해 채우고 경고 표시), 그 위에 `RevenueSql.FinanceReceivable`의 미수입금 현금·카드·계좌(4~6번째 칸)를 더 읽어 cash·card·transfer에 더한다. 원 미만은 칸마다 버린다. received = cash + card + transfer
- 사람(그날 번호): 진찰구분은 1 → 3 → 그 밖(0 아님) → 0 차례로 앞선 하나, 만 나이는 첫 진료 값, 코드 집합, 진료 목록. 환자현황·3분류·연령은 requirements 이미 정한 것 3·4 그대로
- 묶음: 코드 집합이 묶음 코드와 겹치는 사람 → patients·3분류, total = 그날 진료의 묶음 코드 줄 금액(`DayCodesSql` 금액) 합, 묶음마다 원 미만 버림(TASK-14. 전에는 그 사람들 진료 총진료비 합), unpaidVisits = 그 사람들 진료 가운데 총진료비 NULL 수. `warnings.unpaidVisits` = 그날 모든 진료 가운데 NULL 수
- 매출 규칙(TASK-15): 묶음에 `amountPrefixes`·`amountCodes`가 하나라도 있으면 total = 묶음 코드가 있는 **진료** 안의 `DayCodesSql` 줄 가운데 코드가 앞글자(대문자) 하나로 시작하고 그 바로 다음 글자가 숫자 0~9이거나(LA → LA358 맞음, LAYLA·'LA' 하나만 안 맞음, 기본값 (자)) `amountCodes`에 든 줄의 금액 합(한 줄 한 번, 묶음 코드 줄도 규칙에 맞을 때만, 원 미만 버림). 새 문장·매개변수 없이 C#에서 견주므로 설정 글자가 SQL에 들어가지 않는다. patients·3분류는 그대로
- 겹침(TASK-15): carm·sono 둘 다 규칙이 있으면 `overlap` = 두 묶음 코드가 함께 있는 진료의 { visits(진료 수), carm·sono(그 진료들만의 각 규칙 금액, 원 미만 버림) }, 아니면 null. groups total에는 그 진료가 들어 있다(= 둘 다 넣은 값)
- 주사: newPatients = 신환 가운데 injection 묶음 사람, newLines = 그들의 injection 코드 줄 수 합, firstTime = `InjectionFirstSql`(`RevenueSql.HistoryGuard` ≠ 0이면 부르지 않고 null)
- 예약 메모 번호(TASK-16, 11번): `ReadReservations`는 `ReservationKindsSql` 줄의 번호에 `closing.codes` kinds와 같은 규칙(`ClosingCodes.MemoKind`: 앞뒤 공백 뗌, 'Memo'+숫자면 숫자만, 대소문자 무시 — 지금 `ClosingCodes.Kinds`의 `MemoNumber`를 함께 씀)을 쓰고, 같은 번호가 된 줄은 네 수를 더해 한 줄로 한다(번호 글자 차례). 이 의원은 2026-01 전 예약 메모가 'Memo1' 꼴(2025-12 'Memo1' 218건 · '1' 7건)이고 그 뒤에도 몇 줄(06-25·07-23 1건씩) 있다. 확장 `cells.ts`는 글자가 같은 번호만 더하므로 도우미에서 맞춘다. 문장은 바꾸지 않는다
- 시간 제한: closing.day 문장은 `RevenueDays`와 같은 90초(이 PC 보통 2초). closing.codes는 `ClosingSql.CodesTimeout` 50초(`CodeListSql`)·`Sql.MetaTimeout` 15초(`MemoKindsSql`)라(TASK-16, 기본값 (하)) 접속 10초 + 등록 확인 2문장(`HospitalCheck`, 15초씩) + 50 + 15 = 105초로 확장의 120초(`REPLY_TIMEOUT_MS`·`READ_TIMEOUT_MS`)보다 짧다 — 확장이 끊은 뒤에도 도우미가 DB를 오래 읽는 일이 없다. 시간이 넘으면 지금 읽기 실패와 같은 오류 번호(5-2 글)

### 3-4 잇기·실행 프로그램 (TASK-6 → TASK-11이 옮김, 실행 프로그램은 TASK-12)
- `Erp.Core/Closing/ClosingCommands.Register(dispatcher, services)`: 두 처리기. 처음에 `HospitalGate.Open(services)`(revenue.days와 같음. closing.day는 그 전에 날짜가 `services.Today().Date`보다 뒤면 `HelperException(ClosingCommands.FutureDate = 'E-CLOSING-FUTURE-DATE')` — TASK-16, DB·등록 확인 없이), groups를 풀어(같은 key 두 번 → E-HELPER-BAD-MESSAGE, 매출 규칙 두 칸은 대문자로) 읽고 `Envelope.Result` 하나
- `Erp.Helper/Program.cs`: 인자가 정확히 [`--register`]면 등록 모드 — `RegisterFlow.Run(ErpServices.Create())` → 저장 0 · 취소 1 · 예외 2를 돌려주고 끝(기록엔 'register'와 오류 번호만). 그 밖에는 기존 `Precheck.Helper/Program.cs`와 같은 차례(표준 출력·오류 버림 → `ErpCommandTable.Load()` → `new Dispatcher(table, log.Write)` → `ClosingCommands.Register` → 표준 입력 펌프 → `MessageLoop.Run(args, …)`), hello·다른 명령은 붙이지 않는다
- `ErpServices.Create()`: `new BitServices(new InstallationLocator(BaseDirectory, 등록한 설치 위치), new ErpBitConnector(), new VendorLogin(), new ConfirmWindow(), new RegistrationStore(DataDirectory(), new DpapiProtector()))`. `DataDirectory()` = `%LOCALAPPDATA%\Seoseungkwan\ErpHelper\data`
- `ErpBitConnector : IBitConnector` → `ErpBitDb.Open(ReadOnlyConnection.Create(installPath))`. `ErpBitDb : IBitSession`은 기존 `SqlBitDb`와 몸통이 같고(스냅숏 확인 → 트랜잭션 → 되돌림, 매개변수 종류·길이) 관문·매개변수 표만 `ErpReadGuard`다
- `ErpLog`: `%LOCALAPPDATA%\Seoseungkwan\ErpHelper\logs`에 기존 `DiagnosticLog`와 같은 한 줄 모양(시각·명령 이름·오류 번호)

### 3-5 설치·만들기 (TASK-12)
- `helper-erp/install/host-manifest.json`: `{ name: 'com.seoseungkwan.erp_helper', description: 'ERP 마감일지 도우미', path: '__HELPER_EXE__', type: 'stdio', allowed_origins: ['chrome-extension://lkancaiekmoieooheifdimahhkejfmjc/'] }`
- `install.cmd`·`install.ps1`: 기존 `helper/install`과 같은 차례, 이름·폴더·열쇠만 ERP(`ErpHelper\app`, HKCU `…\NativeMessagingHosts\com.seoseungkwan.erp_helper`). 끝에 `SeoseungkwanErpHelper.exe --register`를 기다리고 종료 번호로 안내: 0 '이 PC를 등록했어요.' · 1 '등록을 취소했어요. 다시 하려면 install.cmd를 다시 실행하세요.' · 2 '등록하지 못했어요. 비트가 깔린 PC인지 확인하고 다시 실행하세요.'
- `uninstall.ps1`: ERP 열쇠와 `ErpHelper` 폴더만 지운다
- `.github/workflows/helper-erp.yml`: 기존 `helper.yml`과 같은 차례(windows, Release 만들기, 압축 `seoseungkwan-erp-helper-<판>.zip` = exe·dll·install 파일), `erp-helper-v*` 태그에서만 판을 낸다. 이 PC 확인(TASK-10)은 판 없이 이 PC에서 만든 Release 폴더로 `install.ps1`을 돌린다

## 4. 새 확장 `extension-erp/`
| 파일 | 하는 일 | TASK |
|---|---|---|
| `manifest.json` | MV3, 'ERP 마감일지 채우기' 0.1.0, permissions [nativeMessaging, storage], background `background.js`(module), content_scripts [{ matches [`https://erp.minesolution.com/*`], js [`content.js`] }], web_accessible_resources [{ resources [`main.js`·`cells.js`·`fill.js`·`panel.js`·`settings.js`·`types.js`·`errors.js`(TASK-17)], matches 같은 하나 }], options_page `options.html`, key. 판은 TASK-17에서 0.2.0(기본값 (파)) | 1 · 17 |
| `src/types.ts` | 2절 답 모양·`GROUP_KEYS`(2절 차례)·`RSV_ROWS`·`HOST_NAME`(= `com.seoseungkwan.erp_helper`, TASK-13)·`Settings`·설정 이름 | 1 |
| `src/settings.ts` | `DEFAULTS`, `load()`/`save()`, `toGroups(settings)`(코드 있는 항목만 GROUP_KEYS 차례), `search(codes, text)` | 5 |
| `options.html`·`src/options.ts` | 설정 화면(목업대로) | 5 · 21 |
| `src/cells.ts` | `planCells(answer, settings) → Planned[]`(아래 표) | 4 |
| `src/fill.ts` | `findInput(doc, where)`, `putValue(input, text)`, `fillAll(doc, plan) → { filled, missing: string[], unpicked, unknown, held }`(TASK-17에서 아래 '채우기 흐름' 모양으로) | 4 · 14 · 17 · 21 |
| `src/errors.ts` | 오류 번호 → 무엇이·어떻게 글(5-2 표 한 곳), `explain(code)` | 17 |
| `src/josa.ts` | 이름 뒤 조사 고르기 `josa(word, pair)`(5-3 받침 규칙). 글자만 두고 다른 파일을 불러오지 않는다. 지금은 설정 화면만 쓴다(내용 스크립트가 불러오지 않아 manifest 그대로) | 21 |
| `src/background.ts` | 통로(요청마다 연결 하나, 120초) | 7 |
| `src/content.ts`(일반 스크립트, `import(chrome.runtime.getURL('main.js'))`만) · `src/main.ts` · `src/panel.ts` | 단추·날짜 읽기·부르기·채우기·안내 | 7 · 21 |

- 설정 모양: `{ v: 1, picks: Partial<Record<GroupKey, string[]>>, etcNames: Record<'etc1'|'etc2'|'etc3'|'etc4', string>, reservations: Partial<Record<RsvRow, string[]>>, amounts: Record<'carm'|'sono', { prefixes: string[]; codes: string[] }>, overlap?: 'carm' | 'sono' | 'both', defaultsSeen?: number }`(`defaultsSeen`은 TASK-18. 타입은 선택 칸이라 다른 TASK 시험의 설정 본보기를 고치지 않아도 되고, `normalize`가 늘 채운다 — 저장값에 없으면 1). `RsvRow` = injection 주사 · followup 경과 · manual 도수 · eswt 충격파 · clinic 진료예약 · etc 기타(수액,드레싱등). 설정 화면 차례 = GROUP_KEYS 차례 → 예약 6줄
- `amounts`·`overlap`(TASK-15): `normalize`는 저장값에 `amounts`가 없으면(직원이 이미 저장한 설정) 두 묶음 모두 `{ prefixes: ['LA'], codes: [] }`로 채우고, 앞글자는 앞뒤 공백을 떼고 대문자로 5개까지, 코드는 20개까지 둔다. 코드 꼴 `CODE`(고른 코드·더 셀 코드·예약 메모 번호)는 앞뒤 공백을 떼고 가운데 이어진 빈칸을 하나로 줄인 뒤 `^\S(?: ?\S)*$` 1~20자다(지금 `^\S{1,20}$`는 'PROLO C'를 [저장] 때 조용히 지운다, AC-3607.7). `toGroups`는 carm·sono에 둘 중 하나라도 있으면 `amountPrefixes`·`amountCodes`를 붙인다. `overlap`은 ERP 화면이 `saveOverlap(choice)`로 그 칸만 바꿔 쓰고, 설정 화면 [저장]은 저장된 `overlap`을 그대로 둔다(같은 `erpClosing` 한 열쇠)
- 설정 화면 매출 규칙 줄(TASK-15, 씨암·SONO 줄 똑같이, 고른 코드 줄 아래): 제목 '매출로 셀 코드' · 안내 '{이름} 코드가 있는 진료에서 아래 코드의 금액만 치료별 매출 {이름}에 넣어요. 앞글자는 바로 뒤가 숫자인 코드만 세요(예: LA → LA358·LA272는 세고 LAYLA는 안 세요).' · '이 글자 뒤에 숫자' 조각 `{앞글자}+숫자`와 [×](aria '{앞글자} 빼기') + 글자 칸(placeholder '예: LA', aria '{이름} 앞글자 더하기') + [더하기] · '더 셀 코드' 조각(코드 조각과 같음) + 찾기(placeholder는 코드 찾기와 같음, aria '{이름} 더 셀 코드 찾기') · 둘 다 비면 '비어 있으면 위 코드 줄 금액만 넣어요.'
- `Planned = { where: { j: 1, box, row } | { j: 2, card, row, col } | { j: 2, field }, value: string | null, why?: 'unpicked' | 'unknown' | 'held' }`. 기타 줄의 row는 그 기타 이름(이름이 비면 unpicked)
- 보류(TASK-14, 기본값 (아)): `cells.ts`의 `HELD_SALES: GroupKey[] = ['carm', 'sono']` 한 곳. 이 묶음의 치료별 매출 칸은 코드를 골랐으면 `why: 'held'`(값 없음), 안 골랐으면 지금처럼 unpicked. `fillAll`은 held를 넣지도 못 찾은 칸에 적지도 않고 `held`에 센다. TASK-15에서 `HELD_SALES = []`로 비운다
- 겹친 진료 선택(TASK-15): `planCells(answer, settings, choice?)`. 치료별 매출 씨암 = carm.total, SONO = sono.total이고 choice가 'carm'이면 SONO에서 overlap.sono를, 'sono'면 씨암에서 overlap.carm을 뺀다('both'나 overlap null·visits 0이면 그대로). `main.ts`: 답의 overlap.visits > 0이면 채우기 전에 `panel`이 묻고(5절), 누른 단추로 날짜 확인(AC-3609.3) → `saveOverlap` → 채우기
- 칸 표 (구역 > 줄 ← 값, 고르지 않은 묶음은 unpicked, null은 unknown):
  - 1 환자현황 > 신환·90일초진·재진·물리치료내원·진찰료 산정안함·합계 ← patients.new·first90·return·ptVisit·noExamFee·total
  - 1 진료 · 치료현황 > 씨암·SONO·도수상담·도수치료·충격파(체충)·관절조영술·리푸스·손발톱케어·CT·수술 ← groups[carm·sono·manualConsult·manual·eswt·arthro·lipus·nail·ct·surgery].patients
  - 1 외래 수입 > 외래 총매출·청구액(-)·미수입금(+)·미수발생(-)·비급여·감액·장애인기금(-)·진료수납액·카드수납액(-)·현금수납액(-)·계좌이체액(-)·현불/환불(-) ← money.total·insurer·receivableIn·unpaidNew·noncovered·discount·disabledFund·received·card·cash·transfer·refund
  - 1 입원수입 > 청구·비급여·본인부담금·수납액 ← '0'(inpatientVisits가 0일 때만, 아니면 unknown)
  - 2 예약 > 주사·경과·도수·충격파·진료예약·기타(수액,드레싱등) × 총갯수·내원·변경·취소 ← 그 줄에 고른 메모 번호들의 total·visited·changed·canceled 합 / 실예약환자수(첫 열) ← reservations.patients
  - 2 치료별 신환/90일초진/재진 건수 > 씨암(주사)·SONO(주사)·관절조영·도수·충격파·{기타 이름} × 신환·90일초진·재진 ← groups[carm·sono·arthro·manual·eswt·etc1~4]
  - 2 연령별 신환/90일초진/재진 > 10대미만·10대·…·90대 × 신환·90일초진·재진 ← ages['0'…'90']
  - 2 운영 지표 낱칸 > 도수 총금액·충격파 총금액 ← groups[manual·eswt].total · ESWT Standard·ESWT Radial ← groups[eswtStd·eswtRadial].patients · 주사1회환자·신환주사환자·신환주사건수 ← injection.firstTime·newPatients·newLines
  - 2 치료별 매출 > 씨암·SONO·관절조영·도수·충격파·물리치료·{기타 이름} × 금액(원) ← groups[carm·sono·arthro·manual·eswt·pt·etc1~4].total(`HELD_SALES` 묶음은 held)
- 넣는 법: 내용 스크립트 세계에서도 DOM 값은 같다. `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, text)` → `new Event('input', { bubbles: true })`. 금액칸은 '' → input → 숫자 → input → `blur()`(조사 6절). 이 방법이 React 값으로 남는지는 TASK-10에서 실측하고, 안 되면 `fill.ts`만 `execCommand('insertText')`로 바꾼다
- 날짜 읽기: 글자 '마감 일자' label과 같은 줄의 `input.datepicker-input`(aria-label '연도 선택' 아닌 것) 값, 없으면 'YYYY-MM-DD (오늘)' 글자. 화면 안 이동은 0.5초마다 주소를 보거나 `MutationObserver`로 안다
- 서비스 워커는 `sender.id === chrome.runtime.id`이고 cmd가 둘 중 하나일 때만 받는다. 연결이 '없음'·'거절'(ERP 도우미가 안 깔림)로 끊기면 E-HELPER-MISSING로 답한다
- 확장 시험(`manifest.test.ts` 등)이 보던 `src/lib/bridge/commands.json`의 `erp` 구역 대신 `helper-erp/commands.json`을 본다(TASK-13)
- 빌드: `npm run ext-erp:build` → `extension-erp/dist/`(tsc + manifest·options.html 복사). 설치는 기존처럼 압축 파일을 풀어 '압축해제된 확장 프로그램 로드'. 개인키는 두지 않는다(공개키 `key`만으로 ID가 정해진다)
- 채우기 흐름(TASK-17, `main.ts`, 1·7·14번): 누름 → 마감 일자(없음 → errDate) → 오늘(브라우저 지역 날짜 'YYYY-MM-DD')보다 뒤면 future(도우미 안 부름) → 설정(없음 → first) → 읽는 중 → `closing.day` → 오류면 err(`errors.ts`) → 날짜 바뀜이면 dateChanged → `patients.total` 0이면 zeroVisits에서 멈춤([그래도 채우기]면 날짜를 다시 보고 이어 감, [안내 닫기]면 끝) → 겹친 진료 묻기(TASK-15) → `planCells` → `survey` → 채울 칸이 모두 잠김이면 readOnly → 이미 적힌 칸이 있으면 ask(5-1) → 누를 때 날짜 다시 확인 → `fillAll(doc, plan, mode)` → 되돌릴 기억·지난 결과를 그 화면 기억(`startPage` 안 변수)에 두고 done. [되돌리기]는 날짜가 채울 때와 같을 때만 `undoAll` → undone(아니면 undoDateChanged), 되돌린 뒤·다음 채우기·`leave()` 때 기억을 지운다. [지난 결과]는 마지막 done 보기를 다시 그린다(칸은 안 건드림). 어느 것도 `chrome.storage`에 쓰지 않는다
- `fill.ts`(TASK-17):
  - `type Skip = 'notFound' | 'therapist' | 'locked'`, `locate(doc, where) → { input } | { skip }`. therapist = 줄은 찾았는데 그 칸에 입력칸이 없고 줄 첫 칸에 '치료사별 입력' 글이 있음(글자 견줄 때 '치료사별 입력' 표시도 '자동'처럼 뗀다), locked = disabled·readOnly·`fieldset[disabled]` 안(지금 `locked`), 그 밖은 notFound(둘 이상 맞음 포함)
  - `survey(doc, plan) → Promise<{ written: Where[]; fillable: number; locked: number }>`: 값을 넣을 칸(why 없음·value 있음)만 본다. 업무일지 1은 `fillAll`과 같이 탭을 잠깐 바꿨다 돌아온다. written = 쉼표·빈칸을 뺀 지금 글자가 빈 칸('' · '-' · 숫자 값 0)이 아니고 넣을 값과 다른 칸(기본값 (차)). 'empty' 모드는 빈 칸(0 포함)·같은 값 칸만 넣는다
  - `fillAll(doc, plan, mode: 'all' | 'empty' = 'all') → Promise<FillResult>`, `FillResult = { filled: number; kept: number; skipped: { where: Where; skip: Skip }[]; unpicked: Where[]; noName: Where[]; unknown: number; held: number; undo: UndoEntry[] }`, `UndoEntry = { input: HTMLInputElement; before: string; after: string; where: Where }`. 'empty'면 적힌 칸(written과 같은 판단)은 넣지 않고 kept에 센다. undo에는 실제로 값을 넣은 칸, 넣기 전 글자(before), 넣은 값(after, 쉼표 없는 글자 — TASK-21), 칸 자리(where, 다시 찾기용)를 넣은 차례로(그 화면 기억만)
  - `undoAll(doc, undo) → Promise<{ restored: number; gone: number; edited: number }>`: 넣은 차례의 거꾸로 본다(한 값을 두 칸이 보이는 도수·충격파 총금액도 처음 값으로). 기억한 칸이 아직 문서에 붙어 있으면 그 칸, 떨어졌으면(ERP가 칸을 새로 그림 — 업무일지 2 탭에서 채우면 업무일지 1 칸이 새로 그려진다, 조사 2절) 같은 자리(where)를 `locate`로 다시 찾는다(업무일지 1이 안 보이면 탭을 잠깐 바꿨다 돌아옴). 다시 찾지 못하면 gone. 찾은 칸의 지금 글자가 after와 다르면(쉼표·빈칸을 빼고 숫자 값으로 견줌, ''·'-'는 0으로 봄) 채운 뒤 손으로 고친 칸이라 그대로 두고 edited에 센다(TASK-21, 직원이 고친 값을 지우지 않으려고). 아니면 `putValue(input, before)`로 돌리고(빈 글자면 빈 칸) restored. `shortPlace(where)`는 5-1 짧은 줄 이름
- `cells.ts`(TASK-17): 기타 줄에 코드를 골랐는데 ERP 줄 이름이 비면 `why: 'noName'`(row = '기타N'. 지금은 unpicked로 조용히 빠짐). `export const ETC_CLASH_ROWS: readonly string[]` = 업무일지 2 치료별 건수·치료별 매출의 고정 줄 이름(씨암(주사)·SONO(주사)·관절조영·도수·충격파·씨암·SONO·물리치료, 지금 `COUNT_ROWS`·`SALES_ROWS`에서). 기타 이름이 이 이름이면 그 고정 줄에 기타 값이 들어간다(15번) → TASK-18이 [저장]에서 막는다
- `background.ts`(TASK-17, 3번): `onDisconnect`에서 `chrome.runtime.lastError?.message`를 읽어 'not found'·'forbidden'(대소문자 무시)이 있으면 E-HELPER-MISSING, 아니면 E-HELPER-STOPPED(크롬 글 'Native host has exited.' 등, 글 없음 포함). `connectNative`가 던지면 지금처럼 E-HELPER-MISSING. 120초는 그대로
- `panel.ts`(TASK-17): 새 보기 future·zeroVisits·readOnly·ask·undone·undoDateChanged, done 보기 차례는 5-1, 오류 보기는 하나(`{ kind: 'err', code }` → `errors.ts` 글. 지금 errHelper·errNotRegistered·errBit·errTimeout 넷을 합침). 단추 옆 [지난 결과](btn-2, 지난 결과가 있고 안내가 닫혀 있을 때만, 읽는 중엔 막힘). 안내가 열려 있을 때 문서 `keydown` Escape로 닫는다(`preventDefault`·`stopPropagation` 하지 않음)
- `errors.ts`(TASK-17, 새 파일): `ERRORS: Readonly<Record<string, { what: string; how: string }>>`(5-2 표), `explain(code: unknown) → { code: string; what: string; how: string }`(오류 번호 모양이 아니면 E-BRIDGE-BAD-REPLY, 표에 없으면 '그 밖'). 글자만 두고 다른 파일을 불러오지 않는다(내용 스크립트·설정 화면이 같이 씀)
- `settings.ts`(TASK-18, 3·5·15번): `DEFAULTS_VERSION = 2`, `defaults().defaultsSeen = 2`, `normalize`는 `defaultsSeen`을 1 이상 정수로(없거나 틀리면 1), `save`는 `defaultsSeen = DEFAULTS_VERSION`으로 쓴다. `newDefaultCodes(saved) → { key, codes }[]`(defaultsSeen < 2일 때만, 처음 값 코드 가운데 그 항목에 없는 것), `resetCodes(settings) → Settings`(`picks`·`amounts`만 처음 값), `unusedCodes(settings, saved, list) → { key, code }[]`(기본값 (타)), `conflicts(settings) → Conflict[]`(5-3 막는 글 셋의 재료, 고정 줄 이름은 `cells.js`의 `ETC_CLASH_ROWS`)
- `options.ts`·`options.html`(TASK-18, 3·5·6·15번): 받는 중 줄, `beforeunload`(dirty일 때만 `preventDefault()`·`returnValue = ''`), 저장 실패 글(상태 줄), [저장] 차례 = 겹침 검사(막음) → 처방 없는 코드 묻기 → 쓰기, [처음 값으로] 묻기, 새 처음 코드 줄(맨 위 알림), 묻는 글은 저장 바 바로 위 알림 상자(목업대로), 코드 목록 오류 줄은 `errors.ts` 글
- 마지막 검토·화면 확인 고침(TASK-21, 2026-11-11):
  - `josa.ts`: `type JosaPair = '은/는' | '이/가' | '으로/로'`, `josa(word, pair) → string`(조사만 돌려줌). 규칙은 5-3. `options.ts` 겹침 막는 글 두 줄이 쓴다
  - `fill.ts`: 위 `UndoEntry.after`·`undoAll`의 edited. 같은 값 판단(`sameValue`)은 `isWritten`(기본값 (차))과 같은 견주기를 함께 쓴다
  - `main.ts`: [되돌리기] 뒤 undone 보기에 `undoAll`의 edited를 넘긴다(`{ kind: 'undone', restored, gone, edited }`)
  - `panel.ts`: 겹친 진료 묻기에도 다른 두 묻기처럼 [안내 닫기] 단추(`closeButton`, 누르면 null·안내 닫힘). undone 보기에 edited 줄(5-1). 안내 모양: `.panel`은 `max-height`(창 높이에서 단추 자리를 뺀 값)·`overflow-y: auto`이고 스크롤 막대는 `.panel::-webkit-scrollbar`로 늘 보이게 그린다(`scrollbar-width`·`scrollbar-color`는 쓰지 않음 — 쓰면 크롬이 이 그림을 무시한다). 단추 줄 `.acts`는 `position: sticky; bottom: 0`, 흰 바탕·위 줄로 안내 아래에 붙어 스크롤해도 보인다. 안내 글은 `word-break: keep-all; overflow-wrap: anywhere`(한글 낱말 가운데서 줄을 바꾸지 않고, 한 줄보다 긴 코드만 끊음)
  - `options.ts`·`options.html`: 상태 줄은 막는 글이 열려 있으면 '저장했어요.'를 보이지 않는다(비움, 바꾼 것이 있으면 '바꾼 것을 아직 저장하지 않았어요.'). 저장 실패면 실패 글(지금 그대로). 새 처음 코드 줄의 항목 이름은 기타 줄이면 화면의 그 줄 ERP 줄 이름(빈칸 하나로 줄이고 앞뒤 공백 뗌), 비었으면 '기타N'. `body`에 `word-break: keep-all; overflow-wrap: anywhere`

## 5. 화면 글 (결과 안내 `panel.ts` · 오류 `errors.ts` · 설정 화면 `options.ts`)

아래 첫 묶음은 결과 안내의 경고 줄(해당할 때만)이고, 5-1~5-3은 2026-11-10 22시 '2번빼고 고쳐'로 더한 글이다. 승인된 목업이 이긴다.
- 겹친 진료 묻기(TASK-15, 채우기 전): '씨암·SONO 코드가 함께 있는 진료가 {N}건 있어요(씨암 쪽 {A}원 · SONO 쪽 {B}원). 어디에 넣을까요?' + [씨암에 넣기] [SONO에 넣기] [둘 다 넣기] [안내 닫기](TASK-21). 지난번 고른 단추는 글 끝에 ' (지난번)'이 붙고 먼저 포커스를 받는다(처음엔 없음). [안내 닫기]면 아무 칸도 바꾸지 않는다. 채운 뒤 줄: '함께 있는 진료 {N}건은 {씨암에 | SONO에 | 씨암·SONO 둘 다에} 넣었어요.'
- held > 0(TASK-14): '{보류 묶음 이름을 ·로 이음} 치료별 매출은 채우지 않았어요. 직접 넣어 주세요.' — 지금 '씨암·SONO 치료별 매출은 채우지 않았어요. 직접 넣어 주세요.'(이름은 `GROUP_NAMES`, 고르지 않은 칸 줄 바로 아래)
- moneyUnconfirmed: '환불·변경수납 등이 있는 날이에요. 외래 수입 8칸(총매출·청구액·비급여·미수입금·진료수납액·카드·현금·계좌)은 비트 수납 줄을 그대로 더한 값이라 다를 수 있어요. 확인해 주세요.' · splitUnconfirmed: '청구액·비급여는 비트에서 딱 나눠지지 않아 그대로 더한 값이에요. 확인해 주세요.'
- unpaidVisits N: '수납이 끝나지 않은 진료 N건이 있어요.'(TASK-14) · refund > 0: '환불 {금액}원이 있어요. 금액을 확인해 주세요.'
- unknownAge N: '생년월일이 없는 환자 N명은 연령별 표에 넣지 않았어요.' · noHistory: '예전 자료가 따로 있어 주사1회환자는 채우지 않았어요.' · inpatientVisits > 0: '입원 접수가 있어 입원수입 칸은 채우지 않았어요.'
- 늘 끝에: '확인한 뒤 업무일지 1 [전체 저장]과 업무일지 2 [일일 상세 저장]을 눌러 주세요.'

### 5-1 채우기 전·뒤 안내 (TASK-17. 숫자는 쉼표, `{}`는 채움. 굵은 줄 → 보통 줄 → 작은 줄 차례)
- 오늘보다 뒤(future): '마감 일자({날짜})가 오늘보다 뒤예요.' · '날짜를 확인해 주세요.' · '아무 칸도 바꾸지 않았어요.' (도우미 E-CLOSING-FUTURE-DATE도 같은 글)
- 진료 0건(zeroVisits, 멈춤): '{날짜}에는 비트 진료가 한 건도 없어요.' · '마감 일자가 맞는지 확인해 주세요. 맞으면 [그래도 채우기]로 채울 수 있어요(쉬는 날 예약 칸 등).' · '아직 아무 칸도 바꾸지 않았어요.' · [그래도 채우기] [안내 닫기](먼저 포커스). [그래도 채우기]를 누르면 겹친 진료 묻기·이미 적힌 칸 묻기를 거쳐 채운다
- 읽기 전용(readOnly): '이 화면은 읽기 전용이라 채울 수 없어요(본사 열람 등).' · '아무 칸도 바꾸지 않았어요.'
- 이미 적힌 칸 묻기(ask, 비었거나 0인 칸은 N에 세지 않음): '이미 적힌 칸 {N}개가 비트 값으로 바뀌어요.' · '바뀌는 칸: {짧은 줄 이름을 ' · '로 잇고 10줄까지, 넘으면 ' 외 {K}줄'}' · '[빈 칸만]을 누르면 적힌 칸은 그대로 두고 빈 칸만 채워요.' · [바꾸기] [빈 칸만](먼저 포커스) [안내 닫기]
- 채운 뒤(done), 위에서 아래:
  1. '비트와 맞춰 볼 숫자'(작은 제목) · '외래 총매출 {money.total}원' · '진료수납액 {money.received}원' · '환자 합계 {patients.total}명'(값이 null이면 '—') · '비트 화면의 같은 숫자와 먼저 견주어 보세요.'
  2. '{날짜} 비트 값으로 {N}칸을 채웠어요. 저장은 하지 않았어요.'
  3. ([빈 칸만]일 때) '이미 적힌 {K}칸은 그대로 두었어요.'
  4. 겹친 진료 줄(TASK-15, 위)
  5. 넣지 않은 칸 묶음(있는 것만, 이 차례로. 묶음마다 제목 '{이름} {N}칸' · 짧은 줄 이름 · 할 일):
     - '화면에서 찾지 못한 칸' · 'ERP 화면에서 찾지 못해 그대로 둔 칸이에요. 직접 넣어 주세요.'
     - '치료사별 입력 줄' · '치료사별로 넣는 줄이라 그대로 두었어요. 치료사별 칸에 직접 넣어 주세요.'
     - '읽기 전용 칸' · '잠긴 칸이라 그대로 두었어요.'
     - 'ERP 줄 이름이 빈 기타 줄' · '설정 화면에서 그 기타 줄의 ERP 줄 이름을 업무일지 2 줄 이름과 똑같이 넣어 주세요.'
     - '고르지 않아 건너뛴 칸' · '설정에서 코드를 고르지 않은 항목이라 그대로 두었어요.'
  6. 보류 줄(보류 묶음이 있을 때) · 경고 줄(위) · 끝 줄 '확인한 뒤 업무일지 1 [전체 저장]과 업무일지 2 [일일 상세 저장]을 눌러 주세요.'
  7. [되돌리기] [설정 열기](안내가 창보다 길어도 안내 아래에 붙어 늘 보임 — 4절 `panel.ts` TASK-21)
- 짧은 줄 이름: '{묶음} {줄}'. 묶음 = 업무일지 1 구역 이름('진료 · 치료현황'만 '치료현황') · 업무일지 2 '예약'·'치료별 건수'·'연령별'·'치료별 매출', 운영 지표 낱칸은 칸 이름만. 열 이름은 쓰지 않고 같은 줄은 한 번(예: '예약 경과' · '치료별 매출 기타2' · '외래 수입 감액' · 'ESWT Standard')
- 되돌린 뒤(undone): '되돌렸어요. {N}칸을 채우기 전 값으로 돌렸어요. 저장은 하지 않았어요.' + (edited > 0일 때, TASK-21) '채운 뒤 손으로 고친 {K}칸은 그대로 두었어요.' + (gone > 0일 때) '화면이 바뀌어 {K}칸은 되돌리지 못했어요.'
- 날짜가 바뀐 뒤 [되돌리기](undoDateChanged): '마감 일자가 바뀌어 되돌리지 않았어요.' · '아무 칸도 바꾸지 않았어요.'
- 단추 옆 [지난 결과]: 마지막 채운 안내를 다시 연다. 열린 안내는 Esc로 닫힌다

### 5-2 오류 표 (`errors.ts`, TASK-17. ERP 화면: 굵은 '무엇이' · '어떻게' · 작은 줄 '아무 칸도 바꾸지 않았어요. (번호 {번호})'. 설정 화면은 5-3)
| 번호 | 무엇이 | 어떻게 |
|---|---|---|
| E-HELPER-MISSING | ERP 도우미가 이 PC에 없어요. | ERP 도우미를 설치해 주세요. 받은 zip을 풀고 install.cmd를 두 번 누르면 돼요. |
| E-HELPER-STOPPED | ERP 도우미가 읽는 도중 멈췄어요. | 잠시 뒤 다시 해 주세요. 계속되면 ERP 도우미 설치 파일(install.cmd)을 다시 실행해 주세요. |
| E-HELPER-TIMEOUT | 도우미가 답하지 않아요(120초). | 잠시 뒤 다시 해 주세요. |
| E-HELPER-BAD-MESSAGE · E-HELPER-UNKNOWN-COMMAND | ERP 도우미가 예전 판이에요. | 새 판을 설치해 주세요. 확장과 ERP 도우미는 꼭 같이 바꿔요. |
| E-BIT-NOT-REGISTERED | 이 PC가 아직 등록되지 않았어요. | ERP 도우미 설치 파일을 다시 실행해 주세요(비트 로그인 → PC 확인 창 [확인]). |
| E-BIT-HOSPITAL-MISMATCH | 이 PC의 비트가 등록할 때와 달라요(병원·설치 위치·서버). | 우리 병원 비트가 맞으면 ERP 도우미 설치 파일을 다시 실행해 다시 등록해 주세요. |
| E-BIT-NOT-FOUND | 이 PC에서 비트를 찾지 못했어요. | 비트가 깔린 PC에서 써 주세요. 비트를 옮겼으면 ERP 도우미 설치 파일을 다시 실행해 주세요. |
| E-BIT-DB-FAILED | 비트 자료(DB)에 연결하지 못했어요. | 비트를 켜서 로그인되는지 먼저 확인한 뒤 다시 해 주세요. |
| E-BIT-READ-FAILED | 비트 자료를 읽지 못했어요. | 잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요. |
| E-STORE-FAILED | 이 PC의 ERP 도우미 등록 파일을 읽지 못했어요. | 크롬을 모두 닫았다가 다시 연 뒤 다시 해 주세요. 계속되면 ERP 도우미 설치 파일을 다시 실행해 주세요. |
| E-STORE-BROKEN | 이 PC의 ERP 도우미 등록 파일이 깨졌어요. | ERP 도우미 설치 파일을 다시 실행해 다시 등록해 주세요. |
| E-CLOSING-FUTURE-DATE | 마감 일자가 오늘보다 뒤예요. | 날짜를 확인해 주세요. |
| E-BRIDGE-DISCONNECTED | 확장이 새로 읽혀 이 화면과 끊겼어요. | 이 화면을 새로고침(F5)한 뒤 다시 해 주세요. |
| E-BRIDGE-REJECTED | 확장이 이 요청을 받지 않았어요. | 이 화면을 새로고침(F5)한 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요. |
| E-BRIDGE-BAD-REPLY | 도우미 답의 모양이 맞지 않아 쓰지 않았어요. | 확장과 ERP 도우미를 같은 새 판으로 바꿔 주세요. 계속되면 이 번호를 알려 주세요. |
| (그 밖) | 비트에서 읽지 못했어요. | 잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요. |

### 5-3 설정 화면 글 (TASK-18)
- 받는 중: '코드 목록을 받는 중이에요(30초쯤).'
- 코드 목록 오류(AC-3607.4): 굵게 '도우미에서 코드 목록을 받지 못했어요 ({번호})' · '{무엇이} {어떻게}'(5-2) · '고른 코드는 그대로 두고 저장할 수 있어요. 고친 뒤 이 화면을 새로고침(F5)하면 목록을 다시 받아요.'(지금의 '도우미를 켠 뒤 …'는 지운다 — 도우미는 사람이 켜는 것이 아니라 크롬이 부를 때 스스로 뜬다)
- 저장 실패: '저장하지 못했어요. 이 화면을 닫지 말고 [저장]을 다시 눌러 주세요.'(상태 줄, 주의 색)
- 처방 없는 코드 묻기: '최근 1년에 처방이 없는 코드 {N}개 — 맞나요?' · '{항목 이름} {코드}'를 ' · '로 · '다른 의원 코드거나 잘못 고른 코드면 그 칸은 매일 0이 돼요.' · [그대로 저장] [돌아가기]
- [처음 값으로] 묻기: '고른 코드와 씨암·SONO 매출 규칙을 처음 값으로 바꿀까요?' · '예약 메모 번호와 기타 줄 이름은 그대로 둬요. 바꾼 뒤 [저장]을 눌러야 저장돼요.' · [바꾸기] [그만두기]
- 새 처음 코드: '새 처음 코드가 있어요: {항목 이름} {코드·코드} · …' · '[더하기]를 누르면 화면에 더해요. [저장]을 눌러야 저장돼요.' · [더하기]. 기타 줄의 항목 이름은 화면의 그 줄 ERP 줄 이름이고 비었으면 '기타{n}'이다(TASK-21. 예: '새 처음 코드가 있어요: 물리치료 MM085·MM080·MM020 · 크라이오 CRYO3')
- 겹침 막기(겹친 것마다 한 줄 + 끝에 '저장하지 않았어요.'):
  - '기타{n} 줄 이름 ‘{이름}’{은/는} 업무일지 2에 이미 있는 줄 이름이에요. 다른 이름을 넣어 주세요.'
  - '기타{n}·기타{m} 줄 이름이 ‘{이름}’{으로/로} 같아요. 서로 다르게 넣어 주세요.'
  - '예약 메모 {번호}번이 {줄 이름}·{줄 이름} 줄에 함께 있어요. 한 줄에만 두세요.'
  - 조사 규칙(TASK-21, `josa.ts`): 이름 마지막 글자가 한글(가~힣)이면 받침으로 고른다 — '은/는'·'이/가'는 받침이 있으면 '은'·'이', 없으면 '는'·'가'. '으로/로'는 받침이 있으면 '으로', 없거나 받침이 ㄹ이면 '로'. 마지막 글자가 한글이 아니면(영문·숫자·괄호 등, 빈 이름 포함) '은(는)'·'이(가)'·'(으)로'. 예: '기타2 줄 이름 ‘도수’는 업무일지 2에 이미 있는 줄 이름이에요.' · '‘물리치료’는' · '‘씨암’은' · '‘sono’은(는)' · '‘씨암(주사)’은(는)' · '기타2·기타3 줄 이름이 ‘핫팩’으로 같아요.' · '‘크라이오’로' · '‘수술’로' · '‘CRYO3’(으)로'
- 상태 줄(TASK-21): 막는 글이 열려 있으면 '✓ 저장했어요.'를 보이지 않는다(비움, 바꾼 것이 있으면 '바꾼 것을 아직 저장하지 않았어요.'). 저장 실패 때는 실패 글만. 둘 다 '저장했어요.'와 함께 보이지 않는다
- '치료별 건수 · 매출' 안내(AC-3615.8): '그날 고른 코드 가운데 하나라도 받은 환자 수를 건수로, 그날 고른 코드 처방 줄의 금액 합을 매출로 채워요. 씨암 · SONO 매출은 그 줄의 '매출로 셀 코드'로 세요.'
- 닫을 때 묻기: 크롬 기본 창(글은 크롬 것, 우리 글 없음)

## 위험
- ERP 화면은 공개 화면 파일로만 조사했다. 판이 바뀌면 칸을 못 찾는다 → 그 칸만 '못 찾은 칸'으로 보이고 멈추지 않는다. 금액칸 넣기·날짜 읽기는 TASK-10 실측 전까지 추정이다
- 환불(TPR)은 비트에 한 번도 없어 부호를 모른다 → 양수로 넣는다(음수면 부호를 뗀다). 장애인기금·감액의 줄 고르기는 TASK-9 실측으로 비트 수납집계 화면과 맞춘다
- 새 확장은 ERP 도우미가 있어야 한다. 의원 PC용 판은 GitHub에서 만들어 깔아야 하므로 사용자가 말할 때 한다
- `ErpBitDb`는 기존 `SqlBitDb`와 몸통이 같은 약 100줄이다(기존 부품을 고치지 않으려고). 기존 것의 읽기 규칙이 바뀌면 같이 고쳐야 한다 → `ErpBitDb` 시험이 같은 규칙(되돌림·Commit 없음·관문 먼저)을 글자로 본다
- '이미 적힌 칸'은 비었거나 0인 칸을 빼고 센다(Claude가 정함). 그래서 직원이 손으로 0을 적은 칸은 묻지 않고 비트 값으로 바뀐다([되돌리기]로는 돌릴 수 있음). ERP가 빈 날 칸을 ''·'0' 말고 다른 글자로 보이면 매번 묻게 된다 → TASK-20에서 본다
- [되돌리기]는 채울 때 기억한 input 요소에 쓰고, ERP가 칸을 새로 그렸으면(업무일지 2 탭에서 채우면 업무일지 1 칸이 새로 그려진다) 같은 자리를 다시 찾아 쓴다. 다시 찾지 못한 칸만 '화면이 바뀌어 … 되돌리지 못했어요'로 센다. 채운 뒤 손으로 고친 칸(지금 글자 ≠ 넣은 값)은 그대로 둔다(TASK-21). ERP가 넣은 값을 쉼표 말고 다른 꼴로 보이면 손으로 고친 칸으로 보여 되돌리지 않게 된다 → TASK-20에서 본다. 마감 일자가 바뀌었으면 아예 쓰지 않는다
- 도우미 '없음'과 '도중 멈춤'은 크롬 `lastError` 영어 글로만 나눈다. 크롬 판이 글을 바꾸면 'not found'·'forbidden'이 아닌 것은 모두 '도중 멈춤'이 되는데, 그 글에도 설치 파일 다시 실행이 들어 있다
- `CodeListSql`은 새 문장이라 다른 의원 DB(코드표가 더 큰 곳)에서 더 느릴 수 있다 → 50초에 끊고 오류 글. 이 PC는 약 2초
- ERP 도우미는 기존 `Precheck.Core`를 참조하므로 기존 부품이 바뀌면 ERP 도우미도 다시 만들어야 같아진다(판 번호는 따로)
