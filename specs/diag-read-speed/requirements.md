# 요구사항: 비트 읽기 속도 측정 (일회용)

> 기능 ID: `diag-read-speed` · 형식: 요구사항은 `### REQ-801: 제목`, 수용 기준은 `- AC-801.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다. 번호를 800부터 쓰는 것은 다른 명세(ai-report-screen 700번대, bit-dashboard 600번대 등)의 시험 이름과 섞이지 않게 하려는 것이다.
> 이 브랜치(`diag-read-speed`)는 버리는 브랜치다. 합치지 않고, 배포·태그·릴리스하지 않는다. 깃허브에 올리는 것은 사용자 말이 있을 때 부모 세션이 한다.

## 배경 / 목표
- 의원 PC 첫 실제 실행에서 `stats.rows`가 150.075초 뒤 `E-BIT-READ-FAILED`로 끝났다. 도우미 기록은 번호뿐이다. `StatsSql.DataTimeout`이 150초이고 `SqlBitDb.Query`가 SqlException을 번호 하나로 바꾸므로 `VisitRowsSql`이 150초를 넘거나 막혔다는 것은 **추측이고 증명되지 않았다.**
- 의심(검증 안 됨): (a) `FirstVisits`의 `NULLIF(RTRIM(c.OcmChtNum),'')=p.PatientId`가 색인을 못 쓴다, (b) `Orders`에 원본의 코드 거르기가 없어 전체 처방에 DISTINCT·정렬이 돈다, (c) 쿼리가 아니라 잠금 대기나 느린 디스크다. 매출의 `RevenueSql.Patients`와 `StatsSql.PatientsSql`도 같은 `FirstVisits`를 쓴다.
- 이 서버에서는 실제 DB에 닿을 수 없고, 사용자는 의원 PC에 SQL 도구가 없다. 왕복마다 사용자가 의원에서 손으로 받아야 하므로 **한 번 돌려서 최대한 답을 얻어야 한다.**
- 목표: 사용자(개발자 아님)가 의원 PC에서 파일 하나를 두 번 눌러 돌리고, 짧은 글자 보고서를 채팅에 붙여 넣는다.

## 요구사항

### REQ-801: 보고서에 환자 자료가 없다
- AC-801.1: Given 센티널을 흘리는 가짜 DB 두 경우(둘 다 등록 확인은 정상으로 지나고, 측정 세션의 칸만 센티널이다), When 측정을 끝까지 돌리면, Then 보고서와 콘솔 글 어디에도 센티널이 없다. 경우 1은 측정 세션의 모든 문장의 모든 칸이 센티널이다. 경우 2는 숫자 칸은 숫자이고 글자 칸만 센티널인 형식 맞는 줄이라 세 제품 읽기가 끝까지 돈다(진료 줄이 감싸개를 지나 제품 코드로 돌아간다). `dbo`를 읽는 문장(조각·제품)의 센티널은 한글 이름, 숫자 차트번호, 영문·숫자 모양(`KIMTEST`, `A123456`, `HONG GILDONG`)을 모두 쓴다. `sys.*` 문장의 이름 칸 센티널은 한글, 숫자로 시작하는 값, 공백이 든 값이다(그 문장이 `dbo`를 읽지 않는다는 것은 AC-802.2가 증명한다)
- AC-801.2: Given 센티널이 든 글을 예외에 담아 실패하는 세션과 `@hospital` 값, When 측정하면, Then 보고서는 오류를 형 이름·`BitException` 번호·SQL 오류 번호로만 적고, 예외 글·매개변수 값·SQL 글자가 없다
- AC-801.3: Given 보고서 칸 거르기, When 값을 넣으면, Then 숫자 칸은 숫자 형(글자는 숫자처럼 생겨도 아님)만, 이름 칸은 영문 식별자 모양(한글·숫자로 시작·공백 불가)만, 판 칸은 숫자·점만, 에디션 칸은 `Edition`이 든 영문만 통과하고 나머지는 `?`로 적는다. `rows`·`col` 줄의 표·칸 이름은 AC-807.2의 목록에 있는 것만 적고, 색인 이름·색인 칸·대기 이름은 모양 거르기만 한다(요청한 색인 칸이 사라지지 않게)
- AC-801.4: Given 측정 코드(`Precheck.Core/Diag/*`, `Precheck.Windows/Diag*.cs`), When 글자를 살피면, Then `.Message`·`.StackTrace`·`.InnerException`·`.Source`·`.Procedure`·`.Errors`·`.Server`·`.Database`·`.InstallPath`·`MachineName`·`UserName`과 예외 변수의 `.Data`를 쓰지 않고(`System.Data` 이름공간은 제외), 예외 변수를 글자로 만들지 않는다(`e.ToString()`, `+ e`, `{e}`). 예외에서 쓰는 것은 `.Number`·`.Code`·`.SqlNumber`·`.GetType().Name`뿐이다(보고서에 PC·사용자·서버·DB·설치 위치 이름과 예외 글이 들어갈 길이 없다)

### REQ-802: 읽기 전용이다
- AC-802.1: Given `DiagSql.All`의 모든 문장, When T-SQL 해석기(`ScriptDom`, SQL Server 2008 문법)로 읽으면, Then 문법 오류가 없고 각각 SELECT 한 문장이며 `INTO`·임시 표(`#`)·쓰기·실행·`;`·주석이 없다
- AC-802.2: Given 환경 문장(`DiagSql.Environment`), When 해석기로 읽은 표 이름을 보면, Then 모두 `sys.*`이고 `dbo` 표를 읽지 않는다. 조각 문장은 `dbo.OcmInf`·`dbo.OdrInf`·`dbo.DepMst`만 읽고, 답은 건수 숫자뿐이다(SELECT 목록이 COUNT만)
- AC-802.3: Given 허용 목록, When 살피면, Then `DiagSql.All`은 정해 둔 매개변수와 함께만 `ReadOnlyGuard`를 지나고, `Sql.All`·`StatsSql.All`·`RevenueSql.Parameters`는 그대로다. 목록 밖 문장은 세션에 닿기 전에 막히고 실패로 적힌다
- AC-802.4: Given 조각 문장, When 제품 상수와 비교하면, Then `DiagSql`의 CTE 글은 `StatsSql.VisitRowsSql` 앞부분과 공백만 다르고, 바꾼 조인 문장은 조인 조건 한 곳만 다르다
- AC-802.5: Given `Precheck.Windows/DiagBitDb.cs`, When 글자를 살피면, Then `Commit`이 없고, 실행 전 `ReadOnlyGuard.Require`, 접속은 `ReadOnlyConnection.Create`에 `Pooling=false`만 더한 것(세션이 다시 쓰이지 않게), 스냅숏 상태를 뺀 모든 `SqlCommand`는 세션 트랜잭션으로 만들며, 닫을 때 `Rollback`한다

### REQ-803: 크롬이 켜는 일반 시작은 그대로다
- AC-803.1: Given 시작 인자, When `DiagMode.IsRequested`로 보면, Then 인자가 정확히 `--diag-read-speed` 하나이고 표준 입력이 콘솔일 때만 참이다. 크롬 모양(첫 자리 origin, `--parent-window=…`), 대소문자 다름, 둘째 자리, 빈 인자, 입력 파이프는 거짓이고, 인자가 안 맞으면 콘솔 쪽 값을 묻지 않는다
- AC-803.2: Given `Program.cs`, When 글자를 살피면, Then 측정 분기 한 곳이 `Console.SetOut` 앞에 있고, 그 뒤 일반 시작 줄은 그대로다
- AC-803.3: Given `--diag-read-speed`를 `MessageLoop.Run`에 주면, When 돌리면, Then origin 검사로 거절되어(`ExitRejected`) 메시지 통로로 들어가지 않는다. 크롬 등록 틀(`host-manifest.json`)과 도우미 판(`Directory.Build.props` 0.2.0)은 그대로다

### REQ-804: 설치 없이 푼 폴더에서 켠다
- AC-804.1: Given `helper/install/speed-check.cmd`, When 살피면, Then ASCII 글자뿐이다. `speed-check.ps1`이 옆에 없으면(zip 안에서 눌렀을 때) ASCII 안내를 쓰고 `pause` 뒤 끝낸다. ps1이 0이 아니면 멈추고(`if errorlevel 1 exit /b 1`), 아니면 `app\PrecheckHelper.exe --diag-read-speed`를 직접 켜고, exe가 0이 아니면 `pause`한다. `speed-check.ps1`은 UTF-8 BOM이고, 전체를 try·catch로 감싸 `app\`이 없거나 다른 이유로 실패하면 쉬운 말로 알리고 `Read-Host` 뒤 1로 끝나며, 푼 폴더 `app\`의 인터넷 표시만 지운다(`Unblock-File`). 설치 폴더·레지스트리를 건드리는 명령(`Copy-Item`·`Set-ItemProperty`·`New-Item`·`Remove-Item`·`Stop-Process`)이 없다
- AC-804.2: Given `helper.yml`, When 살피면, Then zip 단계의 `helper/install/*` 묶기로 두 파일이 zip에 들어가고 workflow 글자는 이 브랜치에서 바뀌지 않는다
- AC-804.3: Given 보고서 첫 줄, When 쓰면, Then 빌드 커밋이 한 줄에 있다. 커밋은 Actions의 `GITHUB_SHA`를 Core 어셈블리 정보(`DiagCommit`)로 넣은 값이고, 없으면 `unknown`이다
- AC-804.4: Given 보고서 자리, When 고르면, Then 푼 폴더(`app\`의 부모)가 먼저이고 쓸 수 없으면 임시 폴더다. 파일 이름은 `speed-report-yyyyMMdd-HHmmss.txt`뿐이다
- AC-804.5: Given `Precheck.Helper.csproj`, When 이 서버에서 `dotnet build -c Release`로 빌드하면(`buildDotnet`), Then 측정 코드까지 net48로 컴파일된다(윈도우 부분의 실행은 의원 PC에서만 증명된다)

### REQ-805: 진행이 쉬운 말로 보이고 끝나면 메모장이 열린다
- AC-805.1: Given 측정 단계, When 단계가 시작되면, Then 콘솔에 `3/12 읽는 중… (무엇을 읽는지)`가 나온다
- AC-805.2: Given 오래 걸리는 문장, When 30초마다 알리면, Then `아직 읽는 중이에요 (3분째)`처럼 멈추지 않았음이 보인다
- AC-805.3: Given `DiagEntry`, When 글자를 살피면, Then 보고서 경로를 시작할 때와 끝날 때 콘솔에 쓰고(창을 중간에 닫아도 찾을 수 있게) 끝나면 `notepad.exe`로 열고 엔터를 기다린다. 예외 글은 콘솔에도 쓰지 않는다
- AC-805.4: Given 측정 시작 전, When 켜면, Then "진료가 끝난 뒤 켜세요 / 비트가 느려지면 이 창을 닫으세요(지금까지 결과는 남아요) / 대시보드 탭은 닫아 두세요"를 쉬운 말로 보이고 엔터를 눌러야 DB를 읽기 시작한다. 전체 40분·단계 끝·45분 감시·보고서의 `started`는 모두 엔터를 누른 때부터 잰다(낮에 켜 두고 기다려도 한도를 쓰지 않는다)

### REQ-806: 시간과 실패에 끝이 있다
- AC-806.1: Given 모든 자료 문장, When 돌리면, Then 시간 제한은 10분·그 단계 끝까지 남은 시간·전체 남은 시간 중 가장 작은 값이다(제품의 150초·90초·15초를 측정 한도로 올린다). 환경 문장은 30초다. `DiagBitDb`는 줄을 받는 동안에도 시계를 보고 넘으면 `command.Cancel()` 뒤 시간 초과(`-2`)로 적는다(`CommandTimeout`은 호출 한 번의 한도라서)
- AC-806.2: Given 전체 40분이 지남, When 다음 문장을 시작하려 하면, Then 시작하지 않고 남은 단계를 `skip`으로 적은 뒤 `end` 줄을 쓰고 끝난다. 돌던 제품 읽기는 그 자리에서 `stopped`다
- AC-806.3: Given 단계별 끝 시각(조각 25분, `StatsRows.Read` 28분, 남은 문장 30분, `StatsReport` 35분, 매출 40분), When 시각을 넘으면, Then 그 단계의 새 문장을 시작하지 않고 돌던 문장도 그 시각에 끊긴다. 앞 단계가 시간을 다 써도 뒤 단계가 재인다
- AC-806.4: Given 보고서 파일, When 줄을 쓰거나 문장 하나가 끝나면, Then 닫지 않아도 디스크에 그때까지의 결과(제품 읽기의 문장별 합계 포함)가 있다
- AC-806.5: Given 문장 실패·시간 초과·세션 열기 실패, When 생기면, Then SQL 오류 번호(시간 초과는 `-2`)를 적고 다음 항목으로 넘어간다
- AC-806.6: Given 문장이 모두 도는 가장 긴 경우, When 보고서를 세면, Then 80줄 이하이고 줄마다 1500자 이하다
- AC-806.7: Given `DiagEntry`, When 글자를 살피면, Then 45분 감시가 있어 그래도 안 끝나면 보고서에 `end watchdog`을 쓰고 경로를 출력하고 메모장을 연 뒤 끝낸다

### REQ-807: 값싼 것부터 정해 둔 것을 잰다
- AC-807.1: Given 측정 순서, When 돌리면, Then 등록 확인 → 서버·DB 정보 → 표 크기·칸·색인 → 막힘 확인 → 조각 네 개 → `StatsRows.Read` → 남은 문장 → `StatsReport.Read` → `RevenueDays.Read` 차례다. 등록 확인이 막히면 자료 단계는 `skip`이고 환경 단계는 돈다
- AC-807.2: Given 환경 문장, When 읽으면, Then 판·에디션·호환성·스냅숏·격리 수준(실제 값)·권한·CPU·메모리·설정, 표 `OcmInf`·`OdrInf`·`DepMst`·`SeeMst`·`OrpInf`·`OrcInf`의 줄 수와 색인(이름·키 칸·포함 칸), 칸 `OcmChtNum`·`OcmAcpDtm`·`OcmNum`·`OcmDepCod`·`OdrOcmNum`·`DepCod`의 형식이 적힌다. 권한 오류 번호(229·230·262·297·300)면 `권한 없음`, 다른 오류면 `오류 번호`다
- AC-807.3: Given 막힘 확인, When 권한 칸이 VIEW SERVER STATE 있음이면, Then 다른 요청 수·막힌 수·가장 긴 대기를 적고, 없으면 `권한 없음`이다
- AC-807.4: Given 조각 네 개(`PeriodVisits`, `FirstVisits` 그대로, `FirstVisits` 바꾼 조인, `Orders`), When 돌리면, Then 각각 새 세션에서 돌아 시간·건수를 적고, 두 `FirstVisits` 건수가 같은지 건수로만 적는다(`same`·`differ`·`unknown`)
- AC-807.5: Given 제품 읽기 세 개, When 시간 재는 감싸개로 돌리면, Then 제품 코드를 고치지 않고 문장마다 상수 이름 표의 이름으로 횟수·합계·최대·첫 줄까지 시간·줄 수를 적는다. 기간은 대시보드와 같이 오늘 100일 전~오늘, `StatsReport.Read`의 끝날도 실패한 명령과 같이 오늘(일일 두 벌은 오늘·어제, 월말 두 벌은 이번 달·지난달이라 닫힌 날과 달이 함께 잰다), `RevenueDays`는 닫힌 지난달 1일~말일이다
- AC-807.6: Given `StatsRows.Read`가 중간에 멈춤, When 끝나면, Then 시도하지 못한 문장만 각각 새 세션으로 돌려 적되 `FirstVisits`가 없는 `CodeNamesSql`을 먼저 돌린다. 다 돌았으면 더 돌리지 않는다
- AC-807.7: Given 문장 이름 표, When 허용 목록 전체를 보면, Then 모든 문장에 이름이 있고, 표에 없는 문장은 `?`이며 매개변수 값으로 이름을 만들지 않는다
- AC-807.8: Given 조각·제품 읽기 끝, When 같은 세션에서 읽으면, Then 자기 세션(`session_id=@@SPID`)의 CPU·물리 읽기·논리 읽기와 대기 상위 3개(이름·ms)를 그 줄에 붙인다. 이 읽기는 끊긴 문장 바로 뒤에도 단계 끝·전체 끝과 상관없이 30초 한도로 돈다(끊긴 문장의 원인을 가르는 값이라서). 읽지 못하면 `?`이고 측정은 계속된다. (의심 (c)를 가르는 값이다: 사용자가 적은 값 목록을 넓힌 것이라 숫자와 서버가 정한 대기 이름만 싣고, 사용자에게 한 줄 알린다)

## 범위 밖
- 느린 원인을 고치는 것. 제품 문장·시간 제한·웹 앱(`src/`) 변경
- 도우미 판 올리기, 태그·릴리스, 합치기, 배포, 깃허브에 올리기
- 실제 DB·윈도우에서 돌려 보는 것(이 서버에서 못 한다: 의원 PC와 Actions가 증명한다)
