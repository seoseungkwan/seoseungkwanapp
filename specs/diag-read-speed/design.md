# 설계: 비트 읽기 속도 측정 (일회용)

## 개요
도우미 exe에 인자 `--diag-read-speed` 분기를 하나 더한다. 분기는 `Program.Main` 맨 앞이라 크롬 시작 길에 아무것도 더하지 않는다. 일은 거의 `Precheck.Core/Diag`(리눅스에서 시험)가 하고, 윈도우 쪽은 얇은 두 파일(`DiagBitDb`·`DiagEntry`)이다.

## 설치 없이 도는가 (코드로 확인)
- 등록: `HelperServices.DataDirectory()`는 `%LOCALAPPDATA%\Seoseungkwan\PrecheckHelper\data`로 exe 위치와 상관없다. `DpapiProtector`는 CurrentUser 범위라 **등록한 같은 윈도우 사용자**로 켜야 풀린다. 이미 설치한 도우미의 등록을 읽기만 한다(깨진 파일 되살리기는 제품 동작 그대로).
- 비트 설치 찾기: `InstallationLocator`의 첫 후보가 등록해 둔 위치다. exe 폴더는 뒤 후보일 뿐이다.
- 비트 DLL: `VendorRuntime`이 `<설치>\EXE`에서 절대 경로로 부른다. exe는 x86, `PrecheckHelper.exe.config`(useLegacyV2)는 zip `app\`에 exe와 같이 있다.
- 인터넷 표시: 탐색기로 푼 파일에 표시가 남을 수 있어 `install.ps1`처럼 `Unblock-File`을 `app\`에 한다. 설치 폴더에는 아무것도 쓰지 않으므로 설치된 0.2.0은 그대로다.
- 결론: 푼 폴더에서 된다. 다만 실제 동작은 의원 PC에서만 증명된다.

## 구성 요소 / 인터페이스
Core `Precheck.Core/Diag/`:
- `DiagSql`: 새 상수와 매개변수 표, `All`·`Environment`·`Pieces`·`IsAllowed`·`TryGetParameters`. `Sql.IsAllowed`·`Sql.ParametersOf`가 이 표도 본다(`Sql.All`은 그대로).
- `DiagLabels.Of(sql)`: 상수 → 이름, 모르면 `?`. `HistoryGuard`·`UnsupportedFinance` 등 `StatsSql`과 `RevenueSql`에 같은 글자로 있는 문장은 한 이름으로 합친다.
- `DiagOutcome`: `Rows`(줄 값 목록. 제품 읽기·환경 줄에 넘기는 값이고 보고서에는 줄 수만 간다)·`TotalMs`·`FirstRowMs`·`SqlNumber`·`ErrorKind`.
- `IDiagSession : IDisposable { DiagOutcome Run(string sql, IReadOnlyDictionary<string, object?> args, TimeSpan timeout); }`, `IDiagConnector { IDiagSession Open(string installPath); }`. SQL 오류는 예외가 아니라 결과로 온다(번호를 잃지 않으려고). 세션 열기 실패는 `DiagOpenFailedException(int? SqlNumber)`로 번호만 넘긴다.
- `DiagBudget(Func<TimeSpan> elapsed)`: `StartBy(단계 끝 시각)`·`CanStart`·`NextLimit()` = min(10분, 단계 끝까지, 전체 끝까지). 넘으면 `DiagStoppedException`. `ShortLimit`(30초)은 환경 문장과 비용·대기 읽기에 쓰고 단계 끝·전체 끝을 보지 않는다(최악에도 약 40.5분이라 45분 감시 안이다). `elapsed`는 엔터를 누른 때부터 잰다.
- `TimingBitDb : IBitDb`: 제품 읽기에 끼우는 감싸개. `ReadOnlyGuard.Require` → `budget.NextLimit()` → `session.Run` → 기록 → 실패면 `BitException(E-BIT-READ-FAILED)`. 제품 코드가 보는 모양은 지금 세션과 같다.
- `DiagStatementTable`: 문장 이름별 합계(횟수·합계·최대·첫 줄·줄 수·오류).
- `DiagFormat`: 칸 거르기와 줄 만들기. 환자 값을 받는 함수가 없다(줄 수·번호·이름 표만 받는다).
- `DiagReport(Stream)`: UTF-8 BOM, `Line`(꼬리를 먼저 확정한 뒤 쓰는 확정 줄)·`Tail`(아직 합산 중인 꼬리 줄, 문장마다 다시 씀). 쓸 때마다 디스크까지 비운다. 잠금을 두어 45분 감시 스레드가 쓰는 `end watchdog`이 본 스레드와 섞이거나 합계를 지우지 않는다.
- `DiagProgress(TextWriter, Func<TimeSpan>, int total)`: `Step`·`Skip`·`Tick`.
- `DiagRunner`: 단계 순서·건너뛰기·실패 뒤 계속.
- `DiagMode.IsRequested(string[] args, Func<bool> inputRedirected)`, `DiagCommit.Value`, `DiagReportPath.Candidates`.

Windows `Precheck.Windows/`:
- `DiagBitDb : IDiagSession`: `SqlBitDb`와 같은 길(`ReadOnlyGuard.Require`, 같은 매개변수 붙이기, 스냅숏이면 Snapshot·아니면 ReadCommitted, Commit 없이 Rollback). 다른 점은 첫 줄까지 시간과 `SqlException.Number`를 결과에 담는 것, 줄을 받는 동안 시계를 보고 넘으면 `command.Cancel()`로 끊는 것, `Pooling=false`로 여는 것이다(세션을 다시 쓰면 비용·대기 값에 앞 문장이 섞인다). 글은 어디에도 싣지 않는다. `SqlBitDb`는 고치지 않는다.
- `DiagEntry.Run(Func<BitServices>)`: 콘솔·시작 안내와 엔터·보고서 파일·시작과 끝의 경로 출력·30초 알림·45분 감시(그래도 안 끝나면 줄 하나 쓰고 경로 출력·메모장 뒤 끝냄)·메모장·엔터 기다리기. 콘솔에 쓰는 코드는 이 파일에만 있다: 도우미 폴더(`Precheck.Helper`)의 "Console로 쓰지 않는다" 시험(AC-001.6)은 그대로 둔다.

시작 파일 `helper/install/speed-check.cmd`·`speed-check.ps1`: `helper.yml`이 `helper/install/*`를 그대로 묶으므로 workflow는 고치지 않는다. 커밋은 Actions가 늘 주는 `GITHUB_SHA`를 `Precheck.Core.csproj`의 `AssemblyMetadata`로 넣는다.

## 데이터 흐름
`speed-check.cmd` → `PrecheckHelper.exe --diag-read-speed` → `DiagEntry` → `DiagRunner`
1. 등록 확인 `HospitalGate.Open`(제품과 같은 관문)으로 범위 값을 얻고 세션을 닫는다. 범위 값은 매개변수로만 쓴다.
2. 환경 단계: 세션 하나, 30초 한도, `sys.*`·서버 속성만.
3. 조각 네 개: 문장마다 새 세션(풀 없음), `COUNT`만 돌려받으므로 환자 값이 DB 밖으로 나오지 않는다. 이어서 같은 세션에서 `session_id=@@SPID`로 비용·대기를 읽는다. 세션이 문장 하나뿐이라 이 값은 그 문장 몫이다.
4. 제품 읽기: 읽기마다 새 세션을 `TimingBitDb`로 감싸 제품 함수를 그대로 부른다. 받은 줄은 제품 함수 안에서만 쓰이고 버려진다. 문장이 끝날 때마다 합계 꼬리를 다시 쓴다.
5. `end` 줄 → 경로 출력 → 메모장.

## 보고서 모양
```
speed-report commit=<커밋> helper=0.2.0 started=2026-11-02T14:03 range_days=100 limit_s=600 ceiling_s=2400
gate ms=120 result=ok
server version=15.0.2000.5 level=RTM edition=Express Edition (64-bit)
db compat=150 snapshot=0 rcsi=0 auto_create=1 auto_update=1 recovery=SIMPLE
session open_ms=80 isolation=2
perm view_server_state=1 sysadmin=1
cpu logical=8 schedulers=4
memory physical_mb=16384 committed_target_mb=1024
config max_server_memory_mb=2147483647 maxdop=0 cost_threshold=5
rows OcmInf=1234567 OdrInf=9876543 ...
col OcmInf.OcmChtNum varchar(8) null=0 coll=Korean_Wansung_CI_AS
idx OcmInf: PK_OcmInf[C,U](OcmNum); IX_A[N](OcmAcpDtm)+(OcmChtNum)
block others=3 blocked=0 max_wait_ms=0
piece PeriodVisits ms=1200 rows=45000 cpu=300 reads=10 lreads=9000 waits=PAGEIOLATCH_SH:800
agree first_visits=same
== StatsRows.Read ==
stmt StatsSql.VisitRowsSql n=1 ms=150000 max=150000 first=149000 rows=0 err=-2
read StatsRows.Read result=E-BIT-READ-FAILED ms=150100 cpu=… reads=… lreads=… waits=…
skip StatsReport.Read reason=time
end ms=2400000 stopped=ceiling
```

## 결정과 트레이드오프
- **`SqlBitDb`를 고치지 않고 `DiagBitDb`를 새로 둔다**: 제품 코드를 건드리지 않는 대신 15줄쯤 겹친다. 같은 길인지는 글자 시험(AC-802.5)이 본다. 일회용이라 겹침을 받아들인다.
- **조각은 `COUNT`로만 답을 받는다**: 환자 값이 프로세스에 들어오지 않는다. 대신 전송·정렬 시간이 빠지지만 실제 제품 문장을 따로 재므로 그 차이도 보인다. `COUNT(FirstDtm)`으로 MIN 계산이 빠지지 않게 한다.
- **단계마다 새 세션**: 시간 초과나 교착 희생으로 트랜잭션이 죽어도 다음 항목이 산다. 스냅숏 트랜잭션을 40분 잡아 두지 않는다. 비용·대기 값이 그 단계 몫이 된다.
- **비용·대기 읽기를 더했다(AC-807.8)**: 요청 목록에 없지만 `sys.dm_exec_sessions`는 자기 세션을 권한 없이 볼 수 있고, CPU·읽기가 적은데 오래 걸리면 대기, 물리 읽기가 많으면 디스크, 논리 읽기가 많으면 쿼리로 가를 수 있다. 값은 숫자와 대기 이름뿐이다. `sys.dm_exec_session_wait_stats`는 2016 이상이라 옛 판이면 `?`다.
- **단계별 끝 시각**: 돌던 문장의 제한도 단계 끝까지로 줄인다. 시작만 막으면 `FirstVisits`가 느릴 때 금액 문장과 매출을 한 번도 못 잰다. 끝까지 빠른 경우에는 영향이 없다.
- **`StatsReport.Read` 끝날은 오늘**: 실패한 명령과 같은 값이고, 이 값 하나로 닫힌 날(어제)·닫힌 달(지난달)도 같이 잰다.
- **꼬리 다시 쓰기**: 줄 수를 80줄 안에 두려면 합계로 적어야 하고, 멈춰도 남아야 하므로 확정 길이까지 자르고 합계만 다시 쓴다.
- **파일 이름에 영어만**: zip·콘솔·cmd에서 한글 파일 이름이 깨질 수 있어 `speed-check.cmd`로 한다.

## 위험 / 미해결 질문
- 진료 중인 DB에 부담을 줄 수 있다. 제품은 문장당 150초에 끊지만 이 도구는 문장당 10분, 전체 약 40분까지 큰 표를 훑고, 스냅숏이 꺼진 DB면 잠금을 쓰는 ReadCommitted로 읽는다. 쓰기는 없지만 비트 접수·처방이 느려질 수 있다. 그래서 시작 안내를 보이고 엔터로 시작하며, 창을 닫으면 바로 멈춘다. 의심 (c)는 진료 시간에 더 잘 드러나지만 기본 안내는 진료 뒤이고, 언제 돌릴지는 사용자가 정한다.
- 앞 항목이 디스크 캐시를 데워 뒤 항목이 빨라 보일 수 있다. 차례가 고정이므로 읽을 때 감안한다(첫 항목이 가장 불리하다).
- 실제 SQL Server·윈도우에서 돌리지 못했다. 문법은 `ScriptDom`으로, 윈도우 부분 컴파일은 net48 빌드로만 본다. `sys.*` 칸 이름이 틀리면 그 항목만 오류 번호(`207`·`208`)로 적히고 계속된다.
- 32비트 프로세스라 제품 읽기 줄이 아주 많으면 메모리가 모자랄 수 있다. 제품과 같은 조건이고, 잡히면 그 항목만 실패로 적는다.
- 한글 콘솔: 코드 페이지가 949면 그대로, 아니면 UTF-8로 바꾼다. 의원 PC에서만 볼 수 있다.
