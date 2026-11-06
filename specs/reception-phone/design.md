# 설계: 접수 현황 폰 화면

## 개요
- 총괄 PC에 늘 켜 두는 새 프로그램 `PrecheckReception.exe`가 의원 와이파이(사설 주소)에 작은 웹 서버를 연다(문 47200). 직원 휴대폰은 `http://{총괄 PC 주소}:47200/`을 열고, 화면은 5초마다(간격은 PC 한 곳 `ReceptionTiming`, 3절) `/api/board`를 읽는다.
- 비트는 지금 도우미와 같은 길로 읽는다: 등록 확인(`HospitalGate`) → 읽기 전용 접속 → 되돌리는 트랜잭션 → 허용 목록의 SELECT 상수(`ReadOnlyGuard`). 비트에 쓰는 길은 없다. 엑스레이 'X-ray 완료' 표시만 그 PC의 암호화 파일에 둔다.
- 웹사이트(Vercel·Supabase)·크롬 확장·`lib/bridge`·`commands.json`은 이 기능과 상관없다. 환자 자료는 그 PC → 같은 의원 와이파이의 휴대폰까지만 가고, 휴대폰에는 남기지 않는다(ADR-027).
- 모르는 값은 먼저 **의원 PC 확인 명령**(`--reception-check`)으로 찾고, 답은 `ReceptionMap` 한 곳에 채운다. 그 전에도 아는 칸만으로 서버·화면을 끝까지 만들어 시험한다.
- 계산·규칙은 거의 모두 `Precheck.Core`(netstandard2.0)에 두어 이 서버(리눅스)에서 `dotnet test`로 시험한다. 윈도우 부분(새 exe·확인 명령 입구·DB 세션·설치 스크립트)은 얇게 두고 의원 PC에서 확인한다.
- 휴대폰 화면은 빌드 단계 없는 순수 JS 모듈(`reception/www/`)이고, Core가 파일을 품어(EmbeddedResource) 그대로 내준다. 시험은 vitest + jsdom.

## 구성 요소 / 인터페이스

### 1. 의원 PC 확인 명령 (`Precheck.Core/Reception/Check/`, Phase 1)
```csharp
public static class CheckMode { public static bool IsRequested(string[] args, bool stdinIsConsole); } // 정확히 "--reception-check" 하나 + 콘솔
public interface ICheckConsole { void Write(string line); string? ReadLine(); }              // 콘솔(윈도우) / 가짜(시험)
public interface ICheckSession : IDisposable {                                            // 윈도우 CheckBitDb / 가짜
    IReadOnlyList<IReadOnlyList<object?>> Query(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout); }
public sealed class CheckRunner {
    public CheckRunner(ICheckConsole console, Func<ICheckSession> open, Func<VendorUser?> login,
                       Func<VendorUser, DateTime, IReadOnlyList<IReadOnlyList<string>>> readScreen83, CheckReport report, Func<DateTime> now);
    public void Run(); }
public static class CheckSql { /* 상수: 상태 짝, INFORMATION_SCHEMA 칸, 내원에 붙은 표, 처방 있는 접수 수 */
    public static bool IsAllowed(string sql); public static IReadOnlyList<SqlParam> ParametersOf(string sql); }
public static class ProbeSql {    // 틀 세 가지. 이름은 같은 실행의 INFORMATION_SCHEMA 답에 있는 것만
    public static string VisitLinked(string table, string visitColumn, string textColumn);   // 그날 내원의 (내원번호, 글자)
    public static string ChartLinked(string table, string chartColumn, string textColumn);   // 그날 환자의 (차트번호, 글자)
    public static string Sample(string table, string column);                                 // 모양 보기용 300줄
    public static bool IsProbe(string sql); }                                                 // 만든 글을 다시 풀어 틀·이름 모양 확인
public static class ProbeMatch { public static ProbeScore Score(IReadOnlyDictionary<string, string> screen, IEnumerable<(string key, string text)> rows); }
public static class ColumnShape { public static ShapeLine Of(IEnumerable<object?> values); }
public sealed class CheckReport { /* 줄마다 바로 디스크에 쓰기. 적는 값은 숫자·정해 둔 영문 이름·답 번호만 */ }
```
- 단계: ① 안내 + 엔터 ② 등록 확인 세션 ③ 상태 짝(AC-1401.2) ④ 칸 목록(AC-1401.3) ⑤ 비트 로그인 → 화면 83 하루 → 증상 찾기·이름 찾기(AC-1401.4·5) ⑥ 접수 메모 글 받기(AC-1401.6) ⑦ 모양(AC-1401.7) ⑧ 빠르기(AC-1401.8, `ReceptionSql`의 모든 문장 + 등록 확인 한 번) ⑨ 끝: 경로 출력 + 메모장.
- 견주기(`ProbeMatch`): 앞뒤 공백·줄바꿈(CRLF/LF)·연속 공백을 한 칸으로 줄인 뒤 똑같음, 한쪽이 다른 쪽을 품음(네 글자 이상), 내원 하나에 줄 여러 개면 순서대로 이은 글도 견준다. 결과는 숫자만.
- 보고서 거르기: 칸·표 이름은 `^[A-Za-z][A-Za-z0-9_]{0,63}$`만, 숫자는 숫자 형만, 상태 코드는 `^[A-Z0-9]{1,4}$`만, 모양 단계의 값 목록은 AC-1401.7 조건일 때만 적고 나머지는 `?`. 예외는 `GetType().Name`·`BitException.Code`·`SqlException.Number`만 쓴다(`.Message` 금지, diag-read-speed와 같은 규칙).
- 확인 모드 세션 `Precheck.Windows/CheckBitDb.cs`: `ReadOnlyConnection.Create` + 되돌리는 트랜잭션, 실행 전 `CheckSql.IsAllowed || ProbeSql.IsProbe || Sql.IsAllowed`. 도우미의 `SqlBitDb`·`Sql.IsAllowed`는 찍기 틀을 받지 않는다(AC-1401.9).
- 화면 83은 지금의 `VendorGridExport`·`GridRows.From("83", …)`을 그대로 쓴다. 비트 로그인은 `VendorLogin`(지금의 비트 로그인 창). 확인 명령에서만 뜬다.
- 확인 로그인 창 고침(TASK-32, 의원 PC 1회차: 4/7에서 로그인 창이 보이지 않고 콘솔에 비트 log4net 오류만 나옴): 띄우기 전에 묻고(AC-1401.14), `Precheck.Windows/CheckLoginWindow.cs`가 로그인을 자기 STA 배경 스레드에서 돌리며 이 프로세스의 보이는 최상위 창(콘솔 창 뺌)을 찾아 새 창마다 한 번 가운데·맨 위로 둔다. 기다림 규칙은 Core `Reception/Check/LoginWait.cs`(주입한 시계·쉼): 창 없음 60초 → `LoginWindowMissingException`, 전체 5분 → `LoginTooLongException`(AC-1401.15). 입구는 확인 모드 시작 때 `Console.SetError(TextWriter.Null)`로 비트 DLL의 표준 오류 글을 버린다(AC-1401.16). 도우미의 등록·통계 로그인(`VendorLogin`·`Sta`)은 바꾸지 않는다.
- 의원 PC 1회차 뒤 확인 고침(TASK-33): 이 의원 비트는 아이디·비밀번호가 없어 4/8 로그인은 `1`일 때만 띄우고 기본(엔터)은 건너뛴다(AC-1401.14). 증상 칸은 화면 83 대신 SQL로 찾는다: 6/8 `symptomSearch`에서 사람이 지난 진료의 증상 글 조각을 치면, 후보 칸마다 `ProbeSql.TextCount(schema, 표, 내원번호 칸, 글자 칸)` 한 문장으로 지난 14일 외래 접수(`TodayScope`, @from = 오늘-14일, @to = 내일)에 붙은 줄을 DB 안에서 센다: `COUNT_BIG(*)`, 빈 글 아닌 줄, 공백·CR·LF·탭을 뺀 칸 값에 `CHARINDEX(@text, …)>0`인 줄, 빈 글 아닌 줄의 `MIN/MAX(LEN)`. 칸 값은 `CAST(… AS nvarchar(max))`로 읽어 text·ntext도 센다. `@text`는 VarChar(200)이고 친 글은 공백을 모두 뺀 앞 100글자다. 틀은 `ProbeSql.IsTextCount`(만든 글을 다시 풀어 이름 모양 확인)·`ProbeSql.TextCountParameters`로 확인 모드 세션(`CheckBitDb`)만 받는다. 친 글은 그 단계의 지역 변수로만 들고 세기 뒤 버린다(AC-1401.17).
- 입구: `Program.cs`의 `Console.SetOut(TextWriter.Null)` **앞**에 `CheckMode.IsRequested`면 `ReceptionCheckEntry.Run()` 분기 한 곳. 그 밖의 시작 줄은 그대로다. `reception-check.cmd`(ASCII)·`reception-check.ps1`(UTF-8 BOM)은 diag-read-speed의 `speed-check.*`와 같은 모양: 푼 폴더 확인, `app\`만 `Unblock-File`, exe를 직접 켠다. 설치 폴더·레지스트리를 건드리지 않는다.
- 이 명령은 릴리스가 아니다: 버전·태그 없이 브랜치 빌드(Actions zip)를 푼 폴더에서 돌린다. 그래서 `bit-read-speed`를 기다리지 않는다. 깃허브에 올리기는 사용자 OK 뒤 부모 세션이 한다.

### 2. 한 곳: `ReceptionMap` (`Precheck.Core/Reception/ReceptionMap.cs`)
```csharp
public enum Lane { Wait, Hold, Pay, Done, Hidden }
public static class ReceptionMap {
    public static IReadOnlyDictionary<string, Lane> Statuses { get; }      // 상태 코드 → 칸. 채우기 전 비어 있음
    public static IReadOnlyCollection<string> HiddenRsu { get; }           // 숨기는 OcmRsuYon 값
    public static ColumnPlan? Columns { get; }                             // 이름·생년·성별·메모·수납 시각·증상 칸. 채우기 전 null
    public static IReadOnlyCollection<Lane> Unconfirmed { get; }           // 확인 답이 아직 없는 칸(비어 있어도 문제 아님)
    public static IReadOnlyList<string> Validate(IReadOnlyDictionary<string, Lane> statuses, IReadOnlyCollection<Lane> unconfirmed); } // AC-1410.2 문제 목록
```
- `BoardBuilder`는 지도를 인자로 받아 시험은 가짜 지도를 쓴다. 이 저장소의 진짜 지도는 Phase 5에서 확인 보고서(`docs/reception/check-result.md`, 메인 창이 사용자 붙여 넣기로 만든다)대로 채운다.
- 이미 아는 완료 코드(`HN PN TN VN OE WN OB`, 원본 RxHistory·ClaimDates 조건)는 지난 내원을 셀 때 쓴다. 오늘 줄을 칸에 나누는 일에는 확인 답만 쓴다(완료 코드 일부가 '수납대기'일 수 있다: `StatsSql`의 재무 문장은 `HN`·`WN`을 빼고 센다).
- 표는 확인 답이 있는 코드만 담고, 답이 없는 칸은 `Unconfirmed`에 둔다. 다음 확인(TASK-34)이 더 답하면 이 파일에서 다시 채운다.

### 3. 비트 읽기 (`Precheck.Core/Reception/ReceptionSql.cs`, `BoardReader.cs`, `BoardCache.cs`)
| 상수 | 매개변수 | 칸 | 뜻 |
|---|---|---|---|
| `TodayVisits` | `@from Char(12)`, `@to Char(12)`, `@hospital VarChar(32)` | VisitId, PatientId, AcceptedAt(원값), Status, Rsu | 오늘 외래 접수 전부(상태로 거르지 않음) |
| `TodayRx` | 같음 | VisitId, RxCode | 오늘 접수의 처방(`HistoryCodeSql`의 처방 조건) |
| `PriorVisits` | 같음 | TodayVisitId, EarlierCount, LastVisitId, LastDay | 오늘 접수마다 앞선 완료 내원 수와 가장 최근 것(`ROW_NUMBER()`, `c.OcmChtNum=t.OcmChtNum`) |
| `PriorRx` | 같음 | LastVisitId, RxCode | 가장 최근 지난 내원의 처방 |
| `RxNames` | 없음 | Code, Name, AdpDte | 처방 이름표. 코드마다 적용일이 가장 늦은 이름(`RevenueSql`과 같음). 하루 한 번 |
| `HistoryCount` | `@chart VarChar(14)`, `@before VarChar(20)`, `@hospital` | Count, FirstDay | 이 접수보다 앞선 완료 내원 수·첫날 |
| `HistoryPage` | `@chart`, `@before`, `@hospital`, `@first Int`, `@last Int` | VisitId, VisitDay, RxCode | 최근 순 `ROW_NUMBER()` 창 + 처방(LEFT JOIN) |
| (Phase 5) `TodayPeople`·`TodayMemos`·`TodayPaid`·`VisitSymptoms` | 확인 뒤 | | `ReceptionMap.Columns`의 칸 |
- 모두 `Sql.IsAllowed`·`Sql.ParametersOf`에 더한다(지금의 Revenue·Stats처럼 `ReceptionSql.Parameters` 표를 `Sql`이 묻는다). 완료 내원 조건은 `HistoryVisitsCte`의 `OcmPatTyp='O' AND OcmRsuYon<>'O' AND OcmComStt IN (…)` + 병원 범위 그대로.
- `@before`는 그 접수의 `OcmAcpDtm` 원값을 그대로 넘긴다(길이를 짐작하지 않는다). 시각 글은 앞 12글자(`yyyyMMddHHmm`)로 만든다.
- `BoardReader.Read(IBitDb db, DateTime now) : BoardInput`: 위 문장을 차례로 돌려 줄 모양(`VisitRow`, `RxItem`)으로 바꾼다. 문장마다 시간 제한 8초.
- 간격 한 곳 `ReceptionTiming.cs`(AC-1403.9, TASK-31): `PollSeconds = 5`(화면이 저절로 다시 읽는 간격, `/api/board` 답의 `every`), `CacheSeconds = 4`(묶음). 사용자 결정 2026-11-05(10초 → 5초). 의원 PC 확인(AC-1403.10) 뒤 3초로 낮추면 `CacheSeconds`는 2로 한다(늘 간격보다 작게). 3배 쉼·실패 뒤 10초·`fresh` 2초는 그대로다.
- `VisitRow`는 처음(TASK-12)부터 `Name`·`BirthDate`(또는 주민번호 앞 7글자)·`Sex`·`Memo`·`PaidAt` 칸을 빈 값(`null`) 허용으로 갖는다. 지금은 비어 있고, Phase 5(TASK-29)는 `BoardReader`에서 그 칸을 채우기만 한다(`BoardBuilder`는 고치지 않는다). TASK-11은 이 칸에 값이 있을 때와 없을 때를 모두 시험한다.
- `BoardCache`: `Get(DateTime now, bool fresh = false) : BoardResult`(`ok + board` 또는 `unavailable`).
  - 마지막 성공이 묶음 시간(`ReceptionTiming.CacheSeconds` = 4초) 안이면 그것(AC-1403.2), 한 번에 하나만 읽고 나머지는 그 결과를 기다린다(최대 9초).
  - 걸린 시간 `d`가 3초를 넘으면 `min(3d, 60초)` 동안 다시 읽지 않는다(AC-1403.4). 실패 뒤 10초 동안 다시 읽지 않고 `unavailable`(AC-1403.5).
  - 요청이 와야만 읽는다(타이머 없음, AC-1403.3). 시계·읽기는 주입해 시험한다.
  - `fresh`(새로 고침 단추, AC-1403.8): 묶음 시간만 건너뛴다. 읽는 중이면 함께 기다리고, 마지막 읽기가 끝난 지 2초 안이면 그것을 주며, 3배 쉼·실패 뒤 10초는 그대로다. 라우터는 `/api/board?fresh=1`만 `fresh`로 넘기고 다른 질의 글은 404다.
  - 날이 바뀌면 `VisitKeys`와 이름표를 새로 만든다(AC-1403.6).

### 4. 자료 만들기 (`BoardBuilder.cs`, `VisitKeys.cs`)
```csharp
public sealed class VisitKeys { public string KeyOf(string day, string visitId); public VisitRef? Find(string day, string key); }  // 16자리 소문자 16진수, RandomNumberGenerator
public static class BoardBuilder { public static Board Build(BoardInput input, IReadOnlyDictionary<string, Lane> map, ISet<string> hiddenRsu,
                                                            IReadOnlyDictionary<string, string> marks, VisitKeys keys, DateTime now); }
```
휴대폰이 받는 `GET /api/board` (200):
```json
{ "state": "ok", "at": "13:42:10", "every": 5,
  "counts": { "queue": 5, "wait": 3, "hold": 2, "pay": 2, "done": 2 },
  "lists": { "queue": [Row], "wait": [Row], "hold": [Row], "pay": [Row], "done": [Row] } }
Row = { "k": "3f9a…(16)", "lane": "wait|hold|pay|done", "pos": 1 | null, "laneLabel": "진료대기",
        "chart": "10234", "name": "김영희" | "", "info": "54세 · 여 · 재진", "time": "10:42 접수",
        "waited": "18분째 대기", "long": false, "memo": "" , "rxLabel": "오늘|지난번|처방",
        "rx": "체외충격파(ESWT7) · 도수치료 20분(DS20)", "xray": null | { "at": "10:55" | null } }
```
- `every` = `ReceptionTiming.PollSeconds`(초). 볼 수 없을 때 503 `{ "state": "unavailable" }`. 글 규칙은 AC-1402.3~1402.6. `pos`는 진료 순서에만, `xray`는 진료보류에만 있다.
- 글은 서버(C#)가 만들고 화면은 그대로 그린다. 계산이 한 곳이고 C# 시험으로 거의 다 증명된다.
- 기다린 분은 **모든 칸에서 접수 시각부터** 센다. 비트에 상태가 바뀐 시각 칸이 있는지 모르기 때문이다(확인 결과에 있으면 다시 정한다). 시안의 "보류 22분째"·"수납 6분째" 글 모양은 그대로다.

### 5. 상세 (`HistoryReader.cs`, `HistoryBuilder.cs`)
`GET /api/visit/{k}/history?from=N` (200):
```json
{ "visits": [ { "date": "10월 29일", "ago": "7일 전", "sym": "…" | "", "rx": [ { "name": "체외충격파", "code": "ESWT7" } ] } ],
  "next": 5 | null, "more": 31, "first": "2024년 3월 12일", "total": 37, "todaySym": "" }
```
- 한 번에 주는 수: `from=0`이면 5번, 그 뒤는 20번(`HistoryChunk.First = 5`, `HistoryChunk.Next = 20`). 첫 5는 승인 시안, 20은 37번 온 환자도 두 번 누르면 끝나고 답 하나가 작게 유지되는 값이다.
- `total` = 앞선 완료 내원 수 + 1(오늘 접수), `first` = 가장 이른 완료 내원일(없으면 오늘). `more` = 아직 안 준 앞선 내원 수.
- 상세는 그 환자 한 명만, 열 때·[더 보기] 때만 읽는다. 결과는 서버에 쌓지 않는다.
- 오늘 카드의 상태·오늘 처방은 화면이 가진 `/api/board` 줄로 그리고(저절로 읽을 때마다 바뀜), 오늘 증상(`todaySym`)은 상세를 열 때 읽은 값이다.

### 6. 엑스레이 'X-ray 완료' 표시 (`XrayMarks.cs`)
```csharp
public sealed class XrayMarks { public XrayMarks(IStoreFolder folder, IProtector protector, Func<DateTime> now);
    public IReadOnlyDictionary<string, string> Today();  public void Set(string visitId, bool on); }   // 값 = "HH:MM"
```
- 파일 `data\reception-marks.dat` = `{ "day": "yyyyMMdd", "marks": { "<내원번호>": "HH:MM" } }`를 `IProtector`(윈도우 DPAPI CurrentUser)로 감싼 것. 임시 파일 → 바꾸기로 쓰고, 쓰기는 잠금 하나로 한 번에 하나(AC-1405.6). 날이 다르면 읽을 때 비운다(AC-1405.3).
- `POST /api/xray` 몸 `{ "k": "<16자리>", "on": true }` → 204. 그 열쇠가 오늘 진료보류 줄일 때만(AC-1405.5). 화면은 204 뒤 바로 `/api/board`를 다시 읽는다.
- 내원번호로 묶으므로 새 접수에는 표시가 없다. 같은 내원이 보류 → 대기로 갔다가 다시 보류가 되면 표시가 남아 있다.

### 7. 작은 웹 서버 (`Precheck.Core/Reception/Http/`)
```csharp
public static class HttpRequestReader { public static HttpRequest? Read(Stream s, TimeSpan timeout); }  // 요청 줄 1KB, 머리 8KB, 몸 256B
public static class ClientGuard { public static bool IsPrivateClient(IPAddress a); public static bool HostOk(string? host, IPAddress client, IReadOnlyList<IPAddress> mine, int port);
                                  public static bool WriteOk(HttpRequest r); }
public sealed class ReceptionRouter { public HttpResponse Handle(HttpRequest r, IPAddress client); }
public sealed class ReceptionServer : IDisposable { public void Start(IPAddress bind, int port); }    // TcpListener, 연결마다 작업 하나, 32개 제한
public sealed class StaticFiles { public StaticFiles(IStaticSource source); public HttpResponse? Get(string path); }
public static class ReceptionPorts { public const int Http = 47200; }
```
- `TcpListener`(System.Net.Sockets)로 직접 받는다. 응답마다 `Connection: close`(keep-alive 없음). 보안 머리는 AC-1406.6, 화면 파일은 `Content-Type`을 확장자 표로 정한다.
- 이 PC의 사설 IPv4 목록은 `LanAddresses`(8절)의 `LanAddressWatch`가 30초마다 새로 본다(TASK-24가 만들고 TASK-26의 `ReceptionServices`가 라우터·`ClientGuard`에 넘긴다). `Host` 검사로 다른 사이트의 DNS 바꿔치기를, `Origin` + `X-Reception` + JSON 검사로 다른 사이트의 쓰기를 막는다(그런 요청은 사전 확인 `OPTIONS`가 필요한데 405로 답한다).
- 화면 파일: Core csproj가 `reception/www/**`를 `reception/…` 이름으로 품는다. 윈도우 빌드의 `%(RecursiveDir)`은 `\`라서 `StaticFiles`가 `\` → `/`로 맞춘다. 요청 경로를 디스크 경로로 쓰지 않는다.
- 기록 `ReceptionLog`: `logs\reception-yyyy-MM-dd.log`에 시각·오류 번호·건수만(`LogLine` 모양). 주소·경로·예외 글을 남기지 않는다.
- 시험: 루프백(127.0.0.1, 빈 문)에 진짜 소켓을 열어 끝까지 본다(이 서버에서 돈다).

### 8. 이 PC 주소·주소 보내기 화면 (`LanAddresses.cs`, `LinkPage.cs`, Phase 4)
- `LanAddresses.Pick(IEnumerable<NicInfo>)`: 켜져 있고 기본 게이트웨이가 있는 어댑터의 사설 IPv4만, 순서 고정. 윈도우에서는 `NetworkInterface`로 채운다(같은 API가 리눅스에도 있어 걸러내기만 시험한다).
- `LanAddressWatch(Func<IEnumerable<NicInfo>> read, Func<DateTime> clock)` → `Current() : IReadOnlyList<IPAddress>`: 마지막으로 본 지 30초가 지났으면 `read`를 다시 불러 `Pick`한다(요청 때만, 타이머 없음, 여러 작업이 동시에 불러도 안전). 주입한 시계로 시험한다.
- QR 그림은 만들지 않는다(사용자 결정 2026-11-05: 휴대폰 첫 열기는 카카오톡 링크로만). 그래서 새 NuGet 꾸러미도 없다.
- `/link`(주소 보내기 화면)는 이 PC 자신(루프백)만. 따로 시안 없이 승인 시안 v12의 상표 모양으로 그린다(사용자가 맡김, 2026-11-05). CSP(AC-1406.6)가 인라인 스타일·스크립트를 막으므로 `LinkPage` HTML에는 `<style>`·`style=`·인라인 `<script>`(몸이 있는 것)·`on…=`이 없고, `/theme.css`(토큰 한 곳)·새 화면 파일 `/link.css`(`reception/www/link.css`, `var()`만, 색 글자 없음)를 `<link>`로, `/link.js`(`reception/www/link.js`, 복사 단추만)를 `<script src>` 하나로 부른다. 글:
  - 머리: 로고(`/logo-wordmark.png`) + 제목 "접수 현황 주소 보내기"
  - 주소마다 카드 하나: 큰 글자의 전체 주소 링크 `<a href="http://{주소}:47200/">http://{주소}:47200</a>`(카카오톡이 누르는 링크로 바꾸게 `http://`부터 문 번호까지 다 쓴다) + [주소 복사] 단추(`button type="button"`, 44px 이상, `data-url`에 주소). 누르면 `navigator.clipboard.writeText`(이 PC의 `127.0.0.1`은 안전한 곳이라 된다) → 단추 글 "복사했어요" 2초. 안 되면 주소 글을 골라 두고(`Selection`) "주소를 골라 두었어요. Ctrl+C를 눌러 복사해 주세요"
  - 순서 안내: "1. 직원 단톡방에 붙여 넣어 보내요" · "2. 직원은 병원 와이파이에서 주소를 눌러요" · "3. 카톡 안에서 열리면 오른쪽 위 메뉴 → '다른 브라우저로 열기'" · "4. 홈 화면에 추가해요"
  - 안내: "이 주소는 병원 와이파이에서만 열려요. 밖에서는 열리지 않아 환자 정보가 보이지 않아요"
  - 사설 주소가 없으면 주소 카드 없이 "이 PC가 의원 와이파이에 연결되어 있지 않아요" + "와이파이에 연결한 뒤 이 창을 다시 열어 주세요"

### 9. 늘 켜 두는 프로그램 (`helper/src/Precheck.Reception/`, Phase 4)
- `Precheck.Reception.csproj`: `OutputType WinExe`(콘솔 창 없음), `net48`, `PlatformTarget x86`(비트 DLL이 32비트), `AssemblyName PrecheckReception`, 도우미와 같은 `StartupAppConfigXml`(옛 런타임 정책). Core·Windows를 참조한다. `Precheck.sln`에 더한다.
- `Program.Main(args)`: 뮤텍스 `Local\Seoseungkwan.PrecheckReception` → 이미 있으면 (`--link`이면 브라우저로 `/link`만 열고) 끝 → `ReceptionServices.Create()`(도우미의 `HelperServices`와 같은 부품·같은 `data\` 폴더) → `ReceptionServer.Start(IPAddress.Any, 47200)` → (`--link`이면 브라우저 열기) → 끝날 때까지 기다림. 문이 쓰이고 있으면 `E-RECEPTION-PORT-BUSY`를 기록하고 끝(AC-1411.5).
- 켜지는 때: `install.ps1`이 `HKCU\…\Run`에 `"…\PrecheckReception.exe"`를 쓴다(관리자 권한 없음). 바탕 화면 "접수 현황 주소" 바로 가기 = `PrecheckReception.exe --link`.
- 비트 프로그램 로그인 여부는 보지 않는다. DB가 답하면 나오고 아니면 휴대폰은 연결 끊김 화면이다(시안 글 "비트에 아직 로그인하지 않았어요"와 같은 상황을 덮는다).

### 10. 휴대폰 화면 (`reception/www/`, Phase 3)
| 파일 | 하는 일 |
|---|---|
| `index.html` | 머리·`theme.css`·`style.css`·`app.js`(module), `manifest.webmanifest`, `apple-touch-icon` |
| `theme.css` | 색·글꼴·둥글기 토큰(`:root`) 한 곳. 승인된 의원 상표 시안 값 |
| `style.css` | 모양. `var(--…)`만 쓴다. 폰 한 줄 흐름 + `(min-width: 1000px) and (orientation: landscape)` 두 칸 |
| `dom.js` | `el(tag, attrs, children)`: 글은 `textContent`만 |
| `api.js` | `getBoard({ fresh })`·`getHistory(k, from)`·`setXray(k, on)`: 같은 주소, 5초 `AbortController`, 답 모양 검사 |
| `board.js` | 목록(머리·[새로 고침] 단추·진료 순서·칸 넷·줄) 그리기. 단추는 `reading` 값으로 "새로 고침"/"읽는 중…"(`disabled`) |
| `detail.js` | 상세(오늘 카드·지난 진료·더 보기·끝 줄) 그리기 |
| `offline.js` | 지우기 + 연결 끊김 화면 |
| `poll.js` | `every`초 고리(답의 값, 처음 연결 전에는 기본 5. 응답 뒤 다음 예약, 주입한 시계), `refreshNow()`(AC-1407.10: 도는 읽기가 있으면 그 뒤 `fresh` 한 번, 끝나면 `every`초 다시 예약), `pause()`·`resume()`(AC-1407.11) |
| `alert.js` | 새 열쇠 찾기 + 떨기/삐 소리 + 첫 누름에 오디오 열기 |
| `xray.js` | [X-ray 완료]·[표시 취소] |
| `layout.js` | 폰/태블릿 판정(`matchMedia`), 고른 환자(태블릿은 처음에 고른 칸의 첫 줄, 승인 태블릿 시안) |
| `app.js` | 잇기: 해시 길(`#/v/{k}`), 고리, 알림, 모양 바뀜, 새로 고침 단추, 숨김·다시 보임(`visibilitychange`·`pagehide`) |
| `logo-mark.png`·`logo-wordmark.png` | 시안 폴더의 로고 사본 |
| `link.css`·`link.js` | `/link` 주소 보내기 화면(8절) 모양(`var()`만)과 [주소 복사] 단추 (TASK-25) |
| `fonts/title.woff2`·`fonts/OFL.txt` | 제목 글자만 담은 글꼴(아래 결정) |
- 상태(`board`, 고른 칸, 고른 환자, 앞 열쇠 모음, 마지막 연결 시각)는 메모리에만 둔다. 끊기면 `offline.js`가 DOM과 상태의 환자 값을 모두 비우고 "마지막 연결 HH:MM"만 남긴다(AC-1407.4). 화면이 숨겨져도 같은 지우기를 하고 고리를 멈추며, 나가 있던 요청은 끊거나 답을 버리고 예약도 없앤다(읽기마다 세대 번호를 두고, 숨김 뒤 도착한 옛 세대 답은 버린다). 다시 보이면(`visible`·`pageshow`) "불러오는 중이에요"(환자 자료 없음)에서 바로 읽는다(AC-1407.11). 문서 제목은 늘 "접수 현황"(AC-1407.5).
- [새로 고침] 단추(AC-1407.10)는 승인 시안 v12 뒤 사용자가 더한 것(2026-11-05)이다. 머리의 연결됨 표시 바로 옆, 같은 높이의 테두리 단추(↻ + "새로 고침", 노랑 채움 아님 — 노랑은 고른 칸 표시에만)로 둔다. "불러오는 중이에요" 화면(AC-1407.11, 숨김 뒤 다시 보일 때 잠깐)도 시안에 없다. 연결 끊김 시안의 머리·로고와 같은 모양에 글 한 줄만 둔다. 둘 다 Phase 3 끝 화면 캡처로 사용자에게 보인다.
- 홈 화면에 추가: 매니페스트 + `apple-touch-icon`. 서비스 워커는 없다(http에서는 쓸 수 없고, 쓰면 환자 화면이 휴대폰에 남는다).

### 11. 설치·내보내기 (Phase 4)
- `install.ps1`: 돌던 `PrecheckHelper`·`PrecheckReception`(이 로그인 것만) 끄기 → 파일 덮어쓰기 → 크롬 등록(그대로) → 시작 항목 → 바탕 화면 바로 가기(`WScript.Shell` .lnk) → `PrecheckReception.exe` 켜기. `uninstall.ps1`은 시작 항목·바로 가기 지우고 끈다.
- `helper.yml` zip 단계: `helper/src/Precheck.Reception/bin/Release/net48/PrecheckReception.exe`·`.exe.config`를 `app\`에 더 복사한다. `helper/install/*` 복사로 `reception-check.*`도 들어간다. 시험·빌드·태그 줄은 그대로다.
- `README.md`: AC-1412.4의 쉬운 안내.
- 따로 설치(TASK-35, 사용자 결정 2026-11-06): 의원은 공식 도우미 0.4.0 릴리스를 그대로 쓰고, 접수 현황은 `precheck-reception-<Version>.zip`으로 따로 깐다. 0.4.0 `install.ps1`은 `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\`에 `Precheck.Core.dll` 등을 덮어쓰고(접수 현황은 끄지 않는다) `uninstall.ps1`은 `data\` 말고 다 지우므로, 접수 현황은 자기 폴더 `%LOCALAPPDATA%\Seoseungkwan\PrecheckReception\`에 exe·config·DLL 한 벌을 둔다. 등록 파일(`registration.dat`)·엑스레이 표시(`reception-marks.dat`)는 `PrecheckHelper\data\`, 기록은 `PrecheckHelper\logs\`의 고정 경로로 찾으므로(`ReceptionServices`) 코드는 그대로다.
- `install-reception.cmd` → `install-reception.ps1`(관리자 권한 없음): 도우미 `PrecheckHelper.exe`나 `data\registration.dat`이 없으면 "도우미를 먼저 설치하고 병원 등록을 마치세요" 모양의 한 줄을 쓰고 멈춘다. 있으면 이 로그인의 `PrecheckReception`만 끄기 → 자기 폴더에 덮어쓰기 → 시작 항목(같은 이름 `Seoseungkwan.PrecheckReception`) → 바탕 화면 "접수 현황 주소"(`--link`) → 켜기. 도우미는 끄지도·덮어쓰지도·크롬 등록하지도 않는다. `uninstall-reception.cmd` → `uninstall-reception.ps1`: 끄기 → 시작 항목·바로 가기 지우기 → 자기 폴더만 지우기. `.cmd`는 ASCII 한 줄, `.ps1`은 UTF-8 BOM.
- `helper.yml` zip 단계가 `Precheck.Reception/bin/Release/net48`의 exe·config·DLL(`app\`)과 위 네 파일로 `precheck-reception-<Version>.zip`을 더 만들고 artifact `precheck-reception`으로 올린다. 도우미 zip·`install.ps1`은 그대로 둔다. 도우미 판은 올리지 않는다(AC-1412.3).

## 증상 원천
- 증상 글은 지금 비트 화면 83(전산자료 추출통계, 종류 '증상')을 비트 화면 DLL로 띄워 읽는다(`VendorGridExport`, `GridRows` 칸 내원번호·차트번호·환자명·증상·기록날짜). 느리고(기간 전체·모든 환자), 윈도우 전용이며, 비트 로그인 창이 필요하다. 상세는 환자 한 명의 모든 내원을 그때그때 원한다.
- **먼저 SQL 원천을 찾는다**: 확인 명령의 증상 찾기(AC-1401.4)가 화면 83 글과 같은 내원번호에서 똑같은 칸을 찾으면 그 칸을 내원번호로 읽는 상수(`VisitSymptoms`)를 쓴다(Phase 5 TASK-30). 내원 하나에 줄이 여러 개인 칸이면 확인 결과의 이음 순서를 따른다.
- 찾은 원천(3회차): EmrInf의 EmrShtTyp='S' 줄(코드 칸은 빔). 빈 글 아닌 EmrShtVal 줄을 순서 칸 차례로 읽어 공백 하나로 잇는다(SQL Server 2008 R2라 잇기는 도우미가 한다).
- **SQL 원천이 없을 때만 화면 83 길**: `PrecheckReception`이 켜질 때 비트 로그인 창을 한 번 띄우고, 화면 83을 달 단위로 읽어 그 PC의 암호화 파일(`contact.dat`처럼, ADR-020 보충과 같은 규칙)에 쌓는다. 상세는 쌓인 달의 증상만 보인다. 증상 글이 PC에 쌓이고 로그인 창이 생기므로 이 길은 **명세를 바꿔 다시 승인받은 뒤** 만든다(AC-1410.4). 이 명세는 그 길을 만들지 않는다.
- 어느 길이든 증상이 없는 내원은 아무것도 더 보이지 않는다.

## 데이터 흐름
```
[휴대폰] 5초마다 GET /api/board ──┐            [총괄 PC: PrecheckReception.exe]
                                   ├→ ClientGuard(사설 주소·Host) → Router → BoardCache(4초·한 번만)
[다른 휴대폰]  ────────────────────┘                    └→ HospitalGate → ReadOnlyGuard → 비트 SELECT(되돌림)
                                                         └→ BoardBuilder(ReceptionMap·XrayMarks·VisitKeys) → JSON
[휴대폰] 줄 누름 → GET /api/visit/{k}/history?from=0 → VisitKeys → HistoryReader(그 환자만) → JSON
[휴대폰] [X-ray 완료] → POST /api/xray → XrayMarks(data\reception-marks.dat, DPAPI) → 204 → 다시 GET /api/board
[총괄 PC] 바탕 화면 "접수 현황 주소" → PrecheckReception --link → 브라우저 127.0.0.1:47200/link (주소 링크 + [주소 복사]) → 직원 단톡방
웹사이트·Supabase·Claude API: 아무것도 가지 않는다
```

## 결정과 트레이드오프
- **문은 `TcpListener` + 작은 HTTP 읽기(직접 만듦).** `HttpListener`는 의원 와이파이 주소로 받으려면 관리자 권한의 URL 예약(`netsh http add urlacl`)이 필요하다. Kestrel은 .NET Framework 4.8에서 쓸 수 없다(옛 판은 꾸러미가 많다). `TcpListener`는 관리자 권한 없이 열리고 Core라서 리눅스에서 진짜 소켓으로 시험한다. 대가: HTTP를 아주 좁게(GET·POST 하나, 머리 몇 개) 직접 읽는다 — 길이·시간 제한으로 막는다. 처음 열 때 윈도우 방화벽 창이 한 번 뜬다(사용자 단계).
- **문 번호 47200 하나로 고정.** 휴대폰 홈 화면 주소가 바뀌지 않게, 흔히 쓰는 문(80·8080·3000·5000·8765)을 피하고 윈도우가 나가는 연결에 쓰는 범위(49152~)보다 아래로 골랐다. 쓰이고 있으면 바꾸지 않고 멈춘다.
- **늘 켜 두는 프로그램은 따로 된 창 없는 exe.** 지금 도우미는 콘솔 exe라 로그인 때 켜면 검은 창이 남는다. 도우미를 창 없는 exe로 바꾸면 크롬 통로·확인 명령(콘솔)이 흔들린다. 그래서 같은 Core·Windows를 쓰는 `PrecheckReception.exe`를 더한다. 확인 명령은 콘솔이 필요해 도우미 exe(`--reception-check`)에 둔다.
- **켜는 법은 사용자 레지스트리 시작 항목(HKCU Run).** 관리자 권한이 없고(지금 설치 규칙), 등록 파일이 DPAPI CurrentUser라 그 사용자로 돌아야 한다. 작업 스케줄러 로그온 트리거는 관리자 권한이 필요하다. 대가: 그 사용자가 로그인해야 켜진다(사용자 결정 "PC가 켜지고 로그인하면"과 맞다). 꺼져도 바로 가기가 다시 켠다.
- **잠금 없음, HTTP (사용자 결정).** 직원 와이파이에 들어온 기기면 누구나 본다. 인증서가 없어 HTTPS는 휴대폰마다 경고가 떠서 쓰지 않는다. 같은 와이파이에서 엿볼 수 있는 위험이 남는다(ADR-027). 줄이는 것: 사설 주소만, `Host`·`Origin` 검사, 휴대폰에 남기지 않음(`no-store`·저장소 금지·끊기면 지움), 서버 기록에 환자 글 없음.
- **글은 서버가 만든다.** 화면 JS는 그리기·고리·알림만. 규칙이 C# 한 곳이라 시험이 쉽고 휴대폰 시계가 틀려도 기다린 분이 맞다(서버 시각 `at` 기준).
- **비트 읽기는 요청이 올 때만, 4초 묶음.** 휴대폰이 몇 대든 5초에 한 번쯤만 비트를 읽고, 아무도 안 보면 읽지 않는다. 오래 걸리면 저절로 덜 읽는다. 그동안 화면 "기준" 시각은 진짜 읽은 시각이다.
- **상세 쪽수 5 → 20.** 첫 화면은 승인 시안 그대로 5번, 더 보기는 20번씩.
- **끝남 칸은 접수 늦은 순.** 사용자 말 "모든 칸 접수 시각 순"과 승인 시안의 "오늘 끝난 환자 · 최근 순"(지금 글은 "수납완료 환자 · 최근 순", 09:12 다음 09:05)을 함께 따른 해석이다. 다른 칸은 빠른 순.
- **오래 기다림(주황)은 진료대기·진료보류만.** 진료를 기다리는 사람의 표시다. 수납대기는 이미 진료를 받아 1시간이 넘는 일이 흔하다.
- **기다린 분은 접수 시각부터.** 상태가 바뀐 시각을 비트에서 읽을 수 있는지 모른다.
- **알림 소리는 첫 누름으로 연다, 새 글 없음.** 아이폰은 사용자가 누른 뒤에만 소리를 낼 수 있고, 안드로이드 크롬도 누르기 전에는 떨기를 막는다. 직원은 칸·줄을 누르므로 안내 글 없이 첫 누름에 연다. 안내 글이 필요하면 시안부터 다시 한다.
- **글꼴: 본문은 기기 글꼴, 제목만 품은 글꼴.** 의원 와이파이에 인터넷이 없을 수 있어 바깥 글꼴을 받지 않는다. 한국어 본문 글꼴을 통째로 품으면 수 MB라 기기 글꼴(`Noto Sans KR`(안드로이드)·`Apple SD Gothic Neo`(아이폰)·`Malgun Gothic`(PC))을 쓴다. 굵은 제목 글꼴은 상표 시안(2026-11-05)이 쓴 **Black Han Sans**(구글 글꼴, SIL OFL)다. 시안은 머리 "접수 현황"과 상세·태블릿의 환자 이름에 이 글꼴을 쓰고, 이름은 글자가 정해져 있지 않다. 그래서 완성형 한글 2,350자(KS X 1001)와 영문·숫자만 남긴 woff2 하나(목표 600KB 이하)를 품고, `font-family: var(--font-title), var(--font-body)`로 없는 글자는 본문 글꼴로 떨어지게 한다. 의원 와이파이 안이라 화면을 열 때 한 번 받는 600KB는 문제가 안 된다. 줄이는 일은 TASK-16에서 fontTools로 한 번 하고 결과와 OFL.txt만 커밋한다. 승인 시안의 글꼴이 바뀌어 OFL이 아니면 기기 글꼴 800 굵기로 대신한다.
- **색·글꼴은 `theme.css` 한 곳.** 앱의 `globals.css` 토큰(파랑)은 쓰지 않는다(사용자: 의원 상표). 상태 색은 강조색 라임 노랑과 겹치지 않게 시안 값을 쓴다. 다른 파일에 색 글자가 없음을 시험이 본다.
- **화면은 빌드 없는 JS.** 확장처럼 TS → 빌드를 두면 윈도우 빌드에 npm 단계를 더해야 한다. JS 모듈 몇 개라 그대로 품고, 루트 `tsconfig.json`에서는 `reception`을 뺀다(`extension`·`helper`처럼). 시험은 TS로 쓴다.
- **태블릿 두 칸은 같은 파일로.** 폭이 넓고 가로일 때 CSS가 두 칸을 만들고, JS는 줄을 눌렀을 때 화면을 옮길지(폰) 오른쪽에 그릴지(태블릿)만 다르다.
- **버전·릴리스 없음.** 이 명세의 TASK는 도우미 버전, `versions.ts`, `commands.json`을 바꾸지 않는다(AC-1412.3).

## 의원 PC에서만 확인하는 것
- AC-1401.13 확인 명령이 진짜 비트에서 돌고 보고서가 나온다
- AC-1408.5 갤럭시 떨기·아이폰 소리(무음 스위치 포함)
- AC-1410.5 휴대폰 화면과 비트 접수 화면이 같다
- AC-1411.6 방화벽 창·네트워크 "개인"·직원 와이파이에서 총괄 PC가 보이는지(공유기의 '기기끼리 막기'가 켜져 있으면 안 된다)
- AC-1411.7 껐다 켜고 로그인 → 휴대폰 아이콘만 눌러 열림
- 이 서버에서는 글자·구성만 보고 실제 동작은 의원 PC에서 보는 것: AC-1411.1~1411.3(뮤텍스·시작 항목·바로 가기), AC-1412.1(설치), AC-1412.5(빌드는 여기서, 실행은 PC), AC-1405.4의 DPAPI(여기서는 가짜 암호화), AC-1407.9(홈 화면 추가)
- 비트 부담: 확인 보고서의 빠르기(AC-1401.8)로 본다. 5초마다(뒤에 3초 검토) 오늘 접수만 읽는 문장이 1초 안팎이어야 하고, 접수 PC의 비트가 느려지지 않아야 한다(AC-1403.10)

## 사용자 단계 (쉬운 말, README와 같은 글)
1. 공유기 관리 화면에서 총괄 PC의 주소를 고정한다(‘DHCP 예약’ 또는 ‘고정 IP 할당’). 바뀌면 휴대폰 홈 화면 아이콘이 안 열린다.
2. 처음 켤 때 "Windows 보안 경고" 창이 뜨면 "개인 네트워크"에 체크하고 [허용]을 누른다.
3. 총괄 PC 바탕 화면 "접수 현황 주소"를 눌러 [주소 복사] → 직원 단톡방에 붙여 넣어 보낸다 → 직원은 병원 와이파이에서 주소를 누르고, 카톡 안에서 열리면 오른쪽 위 메뉴 → '다른 브라우저로 열기' → 홈 화면에 추가한다(아이폰: 공유 → 홈 화면에 추가, 갤럭시: 메뉴 → 홈 화면에 추가).
4. 화면을 열면 아무 곳이나 한 번 누른다(아이폰 소리를 켜는 일).

## 릴리스 조건
- 새 도우미(이 기능의 `PrecheckReception.exe` 포함)는 `bit-read-speed`가 main에 들어간 뒤에만 낸다(사용자 결정 2026-11-05). 그때 부모 세션이 사용자 말로 버전 번호를 정하고(`bit-read-speed`가 먼저 쓰면 그다음 번호) `Directory.Build.props`·`versions.ts`를 올리고 `helper-v*` 태그를 단다.
- 확인 명령(Phase 1)은 릴리스가 아니어서 이 조건과 상관없이 브랜치 빌드로 의원 PC에서 돌릴 수 있다.

## 위험 / 미해결 질문
- 상태 코드·칸 이름·증상 원천은 확인 보고서가 와야 정해진다. 그 전에는 목록이 비어 있다(지어낸 값 없음). 보고서가 애매하면 메인 창이 사용자에게 한 번 더 묻는다.
- 비트가 오늘 처방을 언제 `OdrInf`에 쓰는지 모른다(진료 중 저장 전에는 없을 수 있다). 확인 보고서의 상태별 '처방 있는 접수 수'로 본다.
- 수납 시각 칸이 없으면 끝남 줄은 "수납완료"만 보인다.
- 옛 자료 DB(`DRBITPACK_OLD`·`V_OcmInf`)가 있으면 아주 옛날 내원이 상세에 안 나오고 "모두 N번"이 적게 나온다. 확인 보고서에 나오면 사용자와 다시 정한다.
- 처방 순서는 코드 순이다(비트의 처방 순서 칸을 모른다). 시안 순서와 다를 수 있다.
- 아이폰 무음 스위치를 켜면 Web Audio 소리가 안 날 수 있다(AC-1408.5에서 확인. 안 나면 `<audio>` 길을 시안과 함께 다시 정한다).
- PC가 꺼진 채로 홈 화면 아이콘을 누르면 휴대폰 기본 오류 화면이 나온다(서비스 워커가 없어서). 우리 연결 끊김 화면은 열린 화면이 끊겼을 때만 보인다.
- 같은 와이파이의 다른 기기가 엿볼 수 있다(HTTP, 잠금 없음). 사용자가 고른 위험이다(ADR-027). 직원 와이파이 비밀번호를 손님에게 알리지 않는다는 안내를 README에 둔다.
- `CLAUDE.md`의 CRITICAL "환자 개인정보는 의원 PC 밖으로 나가지 않는다" 아래에 이 예외(같은 의원 직원 와이파이의 폰·태블릿, 저장 없음, 끊기면 지움)를 사용자 결정으로 한 줄 더했다(f1153f4). ADR-027과 `docs/ARCHITECTURE.md`에도 적는다.
- 의원 상표 시안 v12·태블릿 시안은 승인됐다(2026-11-05 "굿"). 주소 보내기 화면(QR 없음)은 시안 없이 8절의 글과 상표 모양으로 만들고(사용자가 맡김), 화면 캡처를 사용자에게 보여 고칠 곳이 있으면 고친다.
