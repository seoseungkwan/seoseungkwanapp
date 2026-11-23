# 요구사항: ERP 도우미: 비트 설치 위치 상관없이 찾기

> 기능 ID: `erp-bit-anywhere` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.

## 배경 / 목표
- 2026-11-23 사용자: "erp마감일지 이거 경로때문에 안되는경우도있나" → 답(비트가 `C:\DrBIT50`이 아닌 곳에 깔린 PC는 '이 PC에서 비트를 찾지 못했어요') → 사용자 "경로상관없이 쓸 수 있게하고싶어".
- 지금 ERP 도우미(`helper-erp/`, 0.3.0)는 비트 찾기를 기존 `Precheck.Core`의 `BitInstallRules.Choose`로 한다. 그 규칙의 마지막 조건 '설치 폴더 = `C:\DrBIT50`'(원본 프로그램에서 옮겨 온 지원 위치) 때문에, 비트 자기 환경 파일이 가리키는 설치가 다른 드라이브·다른 폴더 이름이면 거절한다.
- 이 PC 확인(2026-11-23, 읽기만): ERP 도우미가 불러오는 비트 DLL은 `BITDataBaseCommon.dll` 하나(접속 정보)다. 그 DLL에도, 환경 파일을 읽는 `BITEnvironment.dll`에도 `C:\DrBIT50` 글자는 없다. `BITEnvironment.dll`은 드라이브 뒤에 `\DrBIT50\Environment\DrBIT50Environment.ini`를 붙여 환경 파일을 읽는다. 그래서 비트 환경 파일이 그 설치를 가리키면, 비트 DLL이 읽는 설정과 도우미가 고른 설치가 서로 맞는다.
- 목표: ERP 도우미는 로컬 드라이브라면 어느 폴더에 깔린 비트든 찾는다. 단 비트 자기 환경 파일과 맞아야 한다. 청구 도우미(`helper/`)와 웹앱은 그대로 둔다(사용자: ERP 일은 웹앱과 별개).

## 요구사항

### REQ-3801: ERP 도우미는 비트 환경 파일이 가리키는 로컬 설치를 위치·폴더 이름과 상관없이 고른다
- AC-3801.1: Given 가짜 설치 후보와 가짜 파일 모양, When ERP 도우미 규칙(`ErpInstallRules.Choose`)으로 비트를 찾으면, Then 아래 두 조건을 모두 지키는 첫 후보의 설치 폴더를 고른다.
  - 로컬 드라이브의 설치 폴더에 ERP 도우미가 쓰는 파일(REQ-3803)이 모두 있다. 후보 폴더(또는 실행 파일의 폴더)에서 위로 4단계까지 찾는 법은 지금 `BitInstallRules.FindRoot`와 같다(파일 목록만 REQ-3803).
  - 윈도우 드라이브의 환경 파일(`<윈도우 드라이브>\DrBIT50\Environment\DrBIT50Environment.ini`)의 `Path`가 그 폴더이고 `Bin`이 그 폴더`\EXE`다. 대소문자와 끝 `\`는 가리지 않는다. (윈도우 드라이브에 환경 파일이 없을 때 설치 폴더 드라이브의 파일 보기는 AC-3803.3)
  - 드라이브 글자와 폴더 이름은 따지지 않는다. 다음은 모두 고른다: `C:\DrBIT50`(지금처럼), `D:\DrBIT50`, `C:\DrBIT`, `E:\병원 프로그램\DrBIT50`(한글·띄어쓰기).
- AC-3801.2: Given 같은 규칙, Then 다음 후보는 고르지 않고 다음 후보를 본다. 맞는 후보가 하나도 없으면 지금과 같은 오류 `E-BIT-NOT-FOUND`(`BitException`)다.
  - 네트워크 드라이브, UNC(`\\서버\공유\DrBIT50`), 상대 경로, 빈 값
  - 필요한 파일이 하나라도 없는 폴더
  - 환경 파일이 없거나 읽지 못하는 경우(설치 폴더 드라이브의 환경 파일 보기는 AC-3803.3)
  - 환경 파일 `Path`가 그 폴더와 다른 경우, 또는 `Bin`이 그 폴더`\EXE`가 아닌 경우
  - 같은 설치 폴더가 후보에 여러 번 나오면 한 번만 본다
- AC-3801.3: Given `helper-erp/src/Erp.Helper/ErpServices.cs`, Then `ErpServices.Create`의 설치 찾기는 ERP 부품 `ErpInstallationLocator`다.
  - 이 부품은 기존 `InstallationLocator`(같은 인자 = 도우미 exe 폴더·등록한 설치 위치)의 후보 `FindCandidates()`를 그대로 차례대로 받아, `ErpInstallRules.Choose`(윈도우 드라이브 = `NativeEnvironmentGuard.SystemDrive()`, 파일 모양 = `LocalFileProbe`)로 고른다.
  - 나머지 부품(등록 파일 `RegistrationStore`·`ErpBitConnector`·`VendorLogin`·`ConfirmWindow`)은 지금 그대로다.
  - 기존 `InstallationLocator.Find`·`BitInstallRules.Choose`는 ERP 도우미 코드에서 부르지 않는다.
- AC-3801.4: Given 이 기능의 바뀐 곳, Then 청구 도우미 쪽은 한 글자도 바뀌지 않는다(`git diff <기준> -- helper src extension` 비어 있음).
  - 기준 = 갈래가 시작한 커밋 `6754571c`
  - 이 범위에는 `helper/`의 `Precheck.Core`·`Precheck.Windows`가 들어간다.
  - ERP 도우미 판 번호(0.3.0)·`helper-erp/commands.json`·확장(`extension-erp/`)도 그대로다. 화면·오류 글은 새로 없다(시안 없음).

### REQ-3802: 설치 시작 파일(`install.cmd`)이 PATH와 상관없이 PowerShell을 부르고, 실패하면 창을 열어 둔다
배경: 2026-11-23 사용자 "도우미 설치가 경로 때문에 설치가 안 됐었어" · "창 나오고 경로를 그냥 못 찾았다 했다" · "압축 풀었어 이번엔 다른 경우야" · 질문 답 "install.cmd 누르자마자" · "다른 병원 PC". 그 PC의 실제 창 글자는 보지 못했다.
- 2026-11-23 이 PC 시험:
  - 지금 한 줄 `install.cmd`는 폴더 이름(한글·띄어쓰기·괄호·대괄호·`&`·`%`·`'`·`;`·`^`·`!`·226자 경로)과 상관없이 옆의 `install.ps1`을 잘 부른다.
  - 지금 줄은 `powershell`을 PATH(윈도우가 프로그램을 찾는 경로 목록)에서 찾는다. PATH가 망가진 PC에서는 누르자마자 '…을(를) 찾을 수 없습니다'류 오류가 나고 창이 바로 닫힌다.
  - 옆에 `install.ps1`이 없을 때도(압축 파일 안에서 바로 누름, 또는 백신이 `.ps1`을 지움) PowerShell이 "-File 매개 변수에 대한 '…install.ps1' 인수가 없습니다 … 경로 …"(영어 판 `… to the -File parameter does not exist`)를 내고 창이 바로 닫힌다.
  - 전체 경로 `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`로 부르면 PATH를 `C:\nowhere`로 망가뜨려도 `install.ps1`의 끝 번호가 그대로 나왔다.
  - 한글 안내를 `-EncodedCommand`로 띄우는 방식은 압축 임시 폴더(`…\Temp1_….zip\…`)에서 PowerShell이 멈춰 버렸다(백신 검사로 짐작). 백신이 의심하는 모양이라 쓰지 않는다.
- AC-3802.1: Given `install.cmd`, When 실행하면, Then PowerShell을 PATH가 아닌 전체 경로로 부른다: `"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"`. 그 끝 번호를 그대로 낸다.
- AC-3802.2: Given PowerShell 끝 번호, Then 0(설치·등록 끝)·2(등록 오류)면 더 기다리지 않는다. 온전한 `install.ps1`에서는 이 둘이 스스로 '엔터를 누르면 이 창이 닫힙니다'로 기다린 뒤에만 나온다(파일이 비었거나 줄 경계에서 잘리면 0으로 바로 닫힐 수 있다 — `install.ps1`을 고치지 않는 한 막을 수 없다). 그 밖의 번호(1 포함)면 윈도우 `pause`로 키를 누를 때까지 창을 열어 둔다. 이런 경우가 그 밖의 번호다.
  - `install.ps1`이 옆에 없음
  - `install.ps1` 글이 틀림(파일이 깨짐)
  - `install.ps1` 밖으로 오류가 나옴
  - 병원 PC 보안 설정이 스크립트 실행을 막음
  - PowerShell을 켜지 못함
  - 그래서 그때 나온 오류 글이 창에 남아 사진으로 찍을 수 있다. 끝 번호는 PowerShell(또는 명령 창)이 낸 것 그대로다.
  - 1도 멈추는 까닭(2026-11-23 마지막 검토가 확인): 윈도우 PowerShell 5.1 `-File`은 글이 틀린 스크립트·밖으로 나온 오류에 1을 낸다. 이것은 `install.ps1`이 취소·설치 실패에 내는 1과 구별되지 않는다(`install.ps1`은 고치지 않는다). 그래서 1이면 멈춘다. 등록 취소·설치 실패 때 키를 한 번 더 눌러야 하는 것이 그 값이다.
- AC-3802.3: Given `helper-erp/install/install.cmd` 파일, Then 다음을 지킨다.
  - 글자는 모두 ASCII다. `-EncodedCommand`, `goto`·`call :라벨`(LF 줄 끝에서 라벨 찾기가 틀릴 수 있다)은 쓰지 않는다.
  - 경로는 늘 따옴표 안에서만 쓴다.
  - 지연 확장을 끈다(`setlocal DisableDelayedExpansion`). 레지스트리로 지연 확장이 켜진 PC에서도 폴더 이름의 `!`가 바뀌지 않게 하려는 것이다.
  - 설치 파일 목록(`install.cmd`·`install.ps1`·`host-manifest.json`·`uninstall.ps1`·`README.md`)은 그대로다. `uninstall.ps1`·`README.md`·기존 `helper/install/*`도 그대로다(`git diff --quiet 6754571c`). `install.ps1`은 REQ-3806이 정한 등록 결과 알림만 바뀐다.
  - 윈도우에서 도는 시험은 다음을 본다(임시 폴더 이름에 한글·괄호·띄어쓰기·`&`, 입력 없음, PATH = `C:\nowhere`).
    - 가짜 `install.ps1`이 `exit 0`이면 끝 번호 0, `exit 2`면 끝 번호 2이고, 둘 다 멈춤 글이 없다.
    - `exit 1`이면 끝 번호 1이고 멈춤 글이 있다.
    - 글이 틀린 `install.ps1`(`if ( {`)이면 끝 번호 1이고 멈춤 글이 있다.
    - `exit 5`면 끝 번호 5이고 멈춤 글이 있다.
    - `install.ps1`이 없으면 끝 번호가 0·2가 아니고 멈춤 글이 있다.
    - 지연 확장을 켠 명령 창(`cmd /v:on`)에서 이름에 `!`가 든 폴더(`x!y (1)&b`)라도 가짜 `exit 2`가 돌아 끝 번호 2이고 멈춤 글이 없다.

### REQ-3803: ERP 도우미는 자기가 불러오는 비트 DLL 두 개만 있으면 설치 폴더로 본다
배경: 2026-11-23 다른 병원 PC에서 설치는 됐는데 '등록하지 못했어요'가 비트 로그인 창보다 먼저 나왔다(사진). 등록 차례는 비트 찾기 → 접속 정보 읽기·서버 검사·DB 열기 → 비트 로그인 창이다. 사용자 "셋다라고 생각하고 수정해" — 그 앞에서 막힐 수 있는 세 가지(비트 찾기·자료 서버 주소·윈도우 보안)를 모두 고친다. 이 REQ는 비트 찾기다.
- 기존 필요한 파일 셋 중 `ini\BITSTATISTICS.Xml`·`EXE\BITStatistics.exe`는 비트 '통계' 프로그램 파일이다. ERP 도우미는 이 둘을 쓰지 않는다. ERP 도우미가 불러오는 비트 DLL은 `EXE\BITDataBaseCommon.dll`(접속 정보)과 `EXE\BITUserLogIn.dll`(비트 로그인 창) 둘이다(+ 그 DLL이 같은 폴더에서 부르는 것). 통계 프로그램이 없는 병원은 지금 `E-BIT-NOT-FOUND`다.
- AC-3803.1: Given 가짜 파일 모양, When `ErpInstallRules.FindRoot(candidate, probe)`, Then 기존 `BitInstallRules.FindRoot`와 같은 길로 찾되 필요한 파일은 `ErpInstallRules.RequiredFiles` = `EXE\BITDataBaseCommon.dll`·`EXE\BITUserLogIn.dll` 둘이다.
  - 경로 모양이 아님(빈 값·상대 경로·UNC)·네트워크 드라이브·없는 폴더면 null. 실행 파일 경로면 그 폴더부터. 위로 `BitInstallRules.AncestorLimit`(4)단계까지.
  - 두 DLL만 있고 통계 파일 둘이 없는 폴더도 고른다. 둘 중 하나라도 없으면 그 폴더가 아니다.
- AC-3803.2: Given `ErpInstallRules.Choose`, Then 후보마다 `ErpInstallRules.FindRoot`를 쓴다(`BitInstallRules.FindRoot`는 ERP 도우미 코드에서 부르지 않는다). 환경 파일 `Path`·`Bin` 일치(AC-3801.1)·같은 폴더 한 번·없으면 `E-BIT-NOT-FOUND`는 그대로다.
- AC-3803.3: Given 환경 파일 찾기(`ErpInstallRules.MatchesEnvironment`), Then 윈도우 드라이브의 환경 파일을 먼저 본다. 그 파일이 **없을 때만**(`probe.FileExists`가 false), 설치 폴더 드라이브가 윈도우 드라이브와 다르면 `<설치 폴더 드라이브>\DrBIT50\Environment\DrBIT50Environment.ini`를 본다. 윈도우 드라이브 파일이 있는데 읽지 못하면(`ReadEnvironment` null) 다른 드라이브로 넘어가지 않고 거절한다. `Path`·`Bin` 일치 조건은 같다.
  - 까닭: 비트 DLL이 윈도우 드라이브와 자기 드라이브 중 어느 쪽 환경 파일을 읽는지 확인하지 못했다(비트 DLL 글자를 더 읽지 않는다). 윈도우 드라이브에 환경 파일이 있으면 늘 그것이 이긴다. 그래서 두 파일이 서로 다른 설치를 가리킬 때 엉뚱한 쪽을 고르지 않는다. 윈도우 드라이브에 없는데 비트가 그쪽을 읽는 PC라면, 비트 DLL이 설정을 못 읽어 접속에서 멈추거나 비트 기본값으로 붙을 수 있다. 그때도 엉뚱한 병원으로 등록되지 않게 막는 것은 비트 로그인·PC 확인 창(사람이 병원을 확인)·등록 병원 검사(기존)다.
  - 거절 예: 윈도우 드라이브 환경 파일이 다른 설치를 가리킴(설치 폴더 드라이브 파일은 보지 않는다), 윈도우 드라이브 파일이 있는데 읽지 못함, 두 곳 다 없음.

### REQ-3804: 비트 자료 서버를 컴퓨터 이름으로 적은 병원도, 그 이름이 병원 안 주소일 때만 붙는다
- 기존 서버 검사(`PrivateServer.IsAllowed`)는 `.`·`(local)`·`localhost`·이 PC 이름·사설 IPv4 숫자 주소(10·172.16~31·192.168·127)만 받는다. 비트 자료 서버를 다른 컴퓨터 이름(예: `SERVER\SQLEXPRESS`)으로 적은 병원은 병원 안 컴퓨터인데도 `E-BIT-DB-FAILED`다.
- 사용자 결정(2026-11-23, "둘다 막아야지"): 병원 밖 인터넷 주소의 자료 서버와 네트워크로 연결된 비트는 계속 막는다.
- AC-3804.1: Given 비트 접속 글자의 서버 값, 가짜 이름 풀이(이름 → 주소 목록), 이 PC 네트워크 카드의 IPv6 주소·접두 길이 목록, When `ErpServerRules.IsAllowed(server, machineName, resolve, localNetworks)`, Then 아래와 같다.
  - 기존 `PrivateServer.IsAllowed`가 받는 값이면 이름을 풀지 않고 받는다.
  - `tcp:`로 시작하지 않는데 `:`가 든 값(`np:`·`lpc:`·`admin:`·맨 IPv6 숫자 주소)은 막는다(`PrivateServer`와 같다). `tcp:`로 시작하면 떼고 다음 줄로 간다. 그래서 `tcp:` 뒤 IPv6 숫자 주소는 '병원 안 주소'인지로 본다.
  - 서버 이름 부분(`tcp:`를 뗀 뒤 `\` 인스턴스·`,` 포트 앞)이 숫자 주소면 풀지 않고 '병원 안 주소'인지만 본다.
  - 이름이 비었거나 255자를 넘거나 빈칸·제어 글자가 들면 막는다.
  - 그 밖의 이름은 `resolve(이름)`으로 푼다. 풀이가 실패(예외)하거나 주소가 하나도 없으면 막는다. 나온 주소가 **모두** 병원 안 주소일 때만 받는다. 하나라도 밖 주소면 막는다.
  - 병원 안 주소(`ErpServerRules.IsInside`):
    - IPv4 10/8·172.16/12·192.168/16·127/8·169.254/16(링크 로컬)
    - IPv6 `::1`·`fe80::/10`(링크 로컬)·`fc00::/7`(고유 로컬), 위 IPv4를 담은 IPv6(`::ffff:a.b.c.d`)
    - 그 밖의 IPv6는 이 PC 네트워크 카드 IPv6 주소의 접두(길이 48~128) 안에 들 때만. IPv4·IPv6를 함께 쓰는 병원망에서는 이름 풀이가 병원 안 컴퓨터의 인터넷 IPv6 주소도 함께 주는데, 그 주소가 이 PC와 같은 망이면 병원 안이다. 접두 길이가 48보다 짧은 카드 주소는 넓어서 보지 않는다.
    - 공인 IPv4(같은 망이어도)·`100.64/10`·문서용 등 그 밖은 밖 주소다.
- AC-3804.2: Given 같은 규칙, When `ErpServerRules.Require(server, machineName, resolve, localNetworks)`, Then 막는 값이면 `BitException(E-BIT-DB-FAILED)`이고 받는 값이면 아무 일도 없다.
- AC-3804.3: Given `helper-erp/src/Erp.Helper`, Then ERP 도우미 비트 접속은 ERP 부품 `ErpReadOnlyConnection`으로 연다.
  - `ErpBitConnector.Open`은 `ErpReadOnlyConnection.Create(installPath)`로 굳힌 접속 정보를 받아 `ErpBitDb.Open`으로 연다.
  - `ErpReadOnlyConnection.Create`는 먼저 비트 DLL을 불러 둔다(REQ-3805). 그다음 기존과 같은 길로 비트 접속 글자를 읽는다(`VendorRuntime.Load(설치 폴더, ReadOnlyConnection.VendorAssembly)` → `ReadOnlyConnection.VendorType` → `ReadOnlyConnection.VendorConnectionString(형)`, 비트 예외 글은 버리고 `E-BIT-DB-FAILED`).
  - 굳히기 `ErpReadOnlyConnection.Harden`은 기존 `ReadOnlyConnection.Harden`과 같은 차례다(접속 10초·이름 `Seoseungkwan PrecheckHelper`·비밀번호 안 남김·DB 이름 빈 값 거절·대상 = 설치 폴더·서버 값·DB). 다른 것은 세 가지다.
    - 서버 검사 줄이 `ErpServerRules.Require(options.DataSource, machineName, resolve, localNetworks)`다. 실제로는 `resolve = Dns.GetHostAddresses`, `machineName = Environment.MachineName`, `localNetworks` = 켜진 네트워크 카드의 IPv6 주소·접두 길이.
    - `FailoverPartner`(예비 서버)가 비어 있지 않으면 `E-BIT-DB-FAILED`다. 기존 검사는 `DataSource`만 보아 예비 서버로 밖에 붙는 틈이 있었다.
    - 서버 검사 직전에 단계 `SERVER`를 적는다(AC-3806.1).
  - 접속 글자의 서버 값은 바꾸지 않는다(비트와 같은 이름으로 붙는다). 그래서 등록 파일의 서버 값과 병원 검사도 그대로다.
  - `helper-erp/src` 안에 `ReadOnlyConnection.Create`·`ReadOnlyConnection.Harden`·`PrivateServer.Require`를 부르는 곳이 없다.

### REQ-3805: 윈도우 '인터넷에서 받은 파일' 표시가 붙은 비트 DLL도 불러온다 (그 두 DLL만)
- 비트 DLL은 `Assembly.LoadFrom`으로 불러온다(기존 `VendorRuntime.Load`). .NET Framework 4.8은 '인터넷에서 받은 파일' 표시(Zone.Identifier)가 붙은 DLL을 `LoadFrom`하면 거절한다. 비트를 받은 zip을 풀어 깐 병원은 비트 파일에 이 표시가 남아 있을 수 있다. 비트는 자기 DLL을 이 방식으로 부르지 않아 잘 돈다. ERP 도우미만 `E-BIT-DB-FAILED`로 멈춘다.
- 2026-11-23 이 PC 시험(버리는 net48 프로그램, 도우미 exe와 DLL은 다른 폴더):
  - 표시(ZoneId=3)를 붙인 DLL → `LoadFrom`이 `FileLoadException 0x80131515`.
  - 같은 경로를 `Assembly.UnsafeLoadFrom`으로 먼저 불러 두면 → 뒤의 `LoadFrom`이 그것을 돌려주고, 같은 폴더의 표시 붙은 의존 DLL까지 불러온다.
  - 설정 `<loadFromRemoteSources enabled="true" />`도 풀어 주지만 프로세스 전체 스위치라 네트워크 위치 DLL을 막는 .NET 기본 거절까지 푼다(검토 2026-11-23). 그래서 쓰지 않는다.
- 비트 폴더의 파일은 고치지 않는다(표시를 지우지 않는다).
- AC-3805.1: Given `ErpVendorPreload.Load(installRoot)`(`Erp.Helper`), Then 아래 차례다.
  - `VendorRuntime.Prepare(installRoot)`(기존: 비트 폴더 EXE에서 찾게 하기)
  - `ErpInstallRules.RequiredFiles` 각각을 `Assembly.UnsafeLoadFrom(Path.Combine(installRoot, 파일))`로 불러 둔다.
  - `BitException`이 아닌 예외는 글을 버리고 `BitException(E-BIT-DB-FAILED)`다.
  - `ErpReadOnlyConnection.Create`가 접속 글자를 읽기 전에 부른다. 설치 폴더는 `ErpInstallRules.Choose`가 고른 로컬 폴더뿐이다(UNC·네트워크 드라이브는 이미 거절).
- AC-3805.2: Given `helper-erp/src`, Then `UnsafeLoadFrom`은 `ErpVendorPreload.cs`에만 있고, `loadFromRemoteSources`는 어디에도 없다. `Erp.Helper.csproj`의 실행 설정(`StartupAppConfigXml`)은 그대로다.

### REQ-3806: 등록이 안 되면 설치 창에 까닭·멈춘 단계·오류 번호를 보인다
- 지금은 어떤 까닭이든 '등록하지 못했어요. 비트가 깔린 PC인지 확인하고 다시 실행하세요.' 한 줄이라, 사진으로 까닭을 알 수 없다. `E-BIT-DB-FAILED` 하나에도 DLL 불러오기·서버 주소·비트 판 차이·연결 실패가 다 들어 있다.
- AC-3806.1: Given ERP 부품, Then 등록 차례에서 지금 어느 단계인지 `ErpStage`(`Erp.Helper`, 프로세스 하나에 값 하나)에 적는다.
  - `FIND`: `ErpInstallationLocator.Find` 시작
  - `LOAD`: `ErpReadOnlyConnection.Create` 시작(DLL 불러오기·접속 글자 읽기)
  - `SERVER`: 서버 검사 직전
  - `CONNECT`: `ErpBitDb.Open` 직전
  - `LOGIN`: DB를 연 뒤(다음은 비트 로그인 창·병원 확인)
  - 단계 이름은 ASCII 대문자다. 기록 파일·크롬 응답에는 넣지 않는다.
- AC-3806.2: Given 등록 모드(`--register`), When 등록이 오류로 끝나면, Then 표준 출력에 오류 번호 한 줄(`E-…`)과 단계 한 줄(`STEP-<단계>`, 단계가 없으면 이 줄 없음)을 ASCII로 쓰고 2로 끝난다.
  - `HelperException`이면 그 번호, 그 밖의 예외면 `E-BRIDGE-DISCONNECTED`(기록 파일과 같은 번호)다.
  - 쓰기가 실패해도(예외) 무시하고 2로 끝난다.
  - 저장(0)·취소(1)면 아무것도 쓰지 않는다. 등록 모드는 인자가 정확히 `--register` 하나일 때뿐이고 크롬은 첫 인자로 주소를 넘기므로, 크롬이 켠 도우미의 표준 출력(메시지 통로)에는 지금처럼 메시지 틀만 나간다.
- AC-3806.3: Given `install.ps1`, When 등록 끝 번호가 0·1이 아니면, Then 빨강 '등록하지 못했어요.' 다음에 아래를 보인다. 설치 창의 끝 번호(0·1·2)는 그대로다.
  - 도우미 출력에서 `-cmatch '^E-[A-Z0-9-]+$'`인 마지막 줄을 오류 번호, `-cmatch '^STEP-[A-Z]+$'`인 마지막 줄을 단계로 쓴다. 도우미 부르기에 `2>&1`을 붙이지 않는다.
  - `E-BIT-NOT-FOUND` → '이 PC에서 비트를 찾지 못했어요. 이 PC에서 비트가 켜지는지 확인하세요. 다른 컴퓨터에 깔린 비트를 네트워크로 여는 PC는 안전 때문에 쓸 수 없어요.'
  - `E-BIT-DB-FAILED` → '비트 자료(DB)에 연결하지 못했어요. 이 PC에서 비트가 켜지는지, 자료 서버 컴퓨터가 켜져 있는지 확인하세요. 병원 밖 인터넷 주소의 자료 서버는 안전 때문에 쓸 수 없어요.'
  - 다른 오류 번호 → '비트를 확인하다가 문제가 생겼어요.'
  - 도우미를 켜지 못함(실행 예외) → '도우미 프로그램을 켜지 못했어요. 백신이나 윈도우 보안(스마트 앱 컨트롤 등)이 막았을 수 있어요.' 다음 줄에 '윈도우가 알린 내용: '과 예외 글.
  - 오류 번호 없이 끝남 → '도우미가 오류 번호 없이 끝났어요(끝 번호 N). 백신이 도우미를 멈췄을 수 있어요.'
  - 단계가 있으면 '멈춘 단계: <이름> (<STEP>)'. 이름: `FIND` 비트 찾기, `LOAD` 비트 파일 불러오기, `SERVER` 자료 서버 주소 확인, `CONNECT` 자료 서버 연결, `LOGIN` 비트 로그인·병원 확인, 그 밖 = STEP 글자 그대로.
  - 오류 번호가 있으면 '오류 번호: E-…'. 끝에 늘 '이 창을 사진으로 찍어 보내 주세요.'
  - 저장(0) 글은 그대로다. 취소(1)는 지금 글 다음에 한 줄 '직접 취소하지 않았는데 이 글이 나왔다면 이 창을 사진으로 찍어 보내 주세요.'를 더한다(비트 로그인이 거절해도 취소로 끝난다 — 아래 위험).
- AC-3806.4: (윈도우) `install.ps1`은 PowerShell 5.1 글 검사(`Parser.ParseFile`)에서 오류가 없다. 실제 설치는 시험에서 돌리지 않는다.

## 범위 밖
- 청구 도우미(`helper/`)와 웹앱(`src/`)의 비트 찾기. 이쪽은 `C:\DrBIT50`만 그대로다.
- 네트워크 드라이브·다른 컴퓨터에 깔린 비트. 다른 컴퓨터의 프로그램 파일을 불러 실행하는 일이라 계속 막는다.
- 병원 밖 인터넷 주소의 비트 자료 서버(이름이 밖 주소로 풀리는 것 포함). 사용자 결정으로 계속 막는다.
- 백신·스마트 앱 컨트롤이 도우미를 막는 것 자체. 도우미 서명(돈 드는 일)은 사용자가 말할 때만. 이번에는 창에 까닭만 보인다(REQ-3806).
- ERPbit(비트 엑셀 받기, 따로 프로그램)의 설치 위치 규칙
- 비트 환경 파일이 없는 PC에서 찾기. 비트가 이 파일로 자기 위치를 읽으므로, 없으면 비트도 제대로 돌지 않는 것으로 본다.
- 윈도우 계정마다 따로 설치하는 방식(`%LOCALAPPDATA%`·`HKCU`)과 ERP 주소(`https://erp.minesolution.com/*`)
