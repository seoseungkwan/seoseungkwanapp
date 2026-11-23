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
  - 로컬 드라이브의 설치 폴더에 필요한 파일 셋(`ini\BITSTATISTICS.Xml`·`EXE\BITDataBaseCommon.dll`·`EXE\BITStatistics.exe`)이 모두 있다. 후보 폴더(또는 실행 파일의 폴더)에서 위로 4단계까지 찾는 법은 지금 `BitInstallRules.FindRoot` 그대로다.
  - 윈도우 드라이브의 환경 파일(`<윈도우 드라이브>\DrBIT50\Environment\DrBIT50Environment.ini`)의 `Path`가 그 폴더이고 `Bin`이 그 폴더`\EXE`다. 대소문자와 끝 `\`는 가리지 않는다.
  - 드라이브 글자와 폴더 이름은 따지지 않는다. 다음은 모두 고른다: `C:\DrBIT50`(지금처럼), `D:\DrBIT50`, `C:\DrBIT`, `E:\병원 프로그램\DrBIT50`(한글·띄어쓰기).
- AC-3801.2: Given 같은 규칙, Then 다음 후보는 고르지 않고 다음 후보를 본다. 맞는 후보가 하나도 없으면 지금과 같은 오류 `E-BIT-NOT-FOUND`(`BitException`)다.
  - 네트워크 드라이브, UNC(`\\서버\공유\DrBIT50`), 상대 경로, 빈 값
  - 필요한 파일이 하나라도 없는 폴더
  - 환경 파일이 없거나 읽지 못하는 경우
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
- AC-3802.2: Given PowerShell 끝 번호, Then 0·1·2면(`install.ps1`이 스스로 '엔터를 누르면 이 창이 닫힙니다'로 기다린 뒤) 더 기다리지 않는다. 그 밖의 번호면 윈도우 `pause`로 키를 누를 때까지 창을 열어 둔다. 이런 경우가 그 밖의 번호다.
  - `install.ps1`이 옆에 없음
  - `install.ps1` 글이 틀림
  - PowerShell을 켜지 못함
  - 그래서 그때 나온 오류 글이 창에 남아 사진으로 찍을 수 있다. 끝 번호는 PowerShell(또는 명령 창)이 낸 것 그대로다.
- AC-3802.3: Given `helper-erp/install/install.cmd` 파일, Then 다음을 지킨다.
  - 글자는 모두 ASCII다. `-EncodedCommand`, `goto`·`call :라벨`(LF 줄 끝에서 라벨 찾기가 틀릴 수 있다)은 쓰지 않는다.
  - 경로는 늘 따옴표 안에서만 쓴다.
  - 설치 파일 목록(`install.cmd`·`install.ps1`·`host-manifest.json`·`uninstall.ps1`·`README.md`)과 `install.ps1`·`uninstall.ps1`·`README.md`·기존 `helper/install/*`은 그대로다.
  - 윈도우에서 도는 시험은 다음을 본다(임시 폴더 이름에 한글·괄호·띄어쓰기·`&`, 입력 없음, PATH = `C:\nowhere`).
    - 가짜 `install.ps1`이 `exit 2`면 끝 번호 2이고 멈춤 글이 없다.
    - `exit 5`면 끝 번호 5이고 멈춤 글이 있다.
    - `install.ps1`이 없으면 끝 번호가 0·1·2가 아니고 멈춤 글이 있다.

## 범위 밖
- 청구 도우미(`helper/`)와 웹앱(`src/`)의 비트 찾기. 이쪽은 `C:\DrBIT50`만 그대로다.
- 네트워크 드라이브·다른 컴퓨터에 깔린 비트. 다른 컴퓨터의 프로그램 파일을 불러 실행하는 일이라 계속 막는다.
- ERPbit(비트 엑셀 받기, 따로 프로그램)의 설치 위치 규칙
- 비트 환경 파일이 없는 PC에서 찾기. 비트가 이 파일로 자기 위치를 읽으므로, 없으면 비트도 제대로 돌지 않는 것으로 본다.
- 윈도우 계정마다 따로 설치하는 방식(`%LOCALAPPDATA%`·`HKCU`)과 ERP 주소(`https://erp.minesolution.com/*`)
