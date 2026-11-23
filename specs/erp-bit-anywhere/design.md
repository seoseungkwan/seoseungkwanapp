# 설계: ERP 도우미: 비트 설치 위치 상관없이 찾기

## 개요
- 지금 ERP 도우미는 `ErpServices.Create`에서 기존 `InstallationLocator`를 그대로 쓴다. 이 부품의 `Find()`는 `BitInstallRules.Choose`로 고르고, 그 마지막 조건이 '설치 폴더 = `C:\DrBIT50`'이다(`helper/src/Precheck.Core/Bit/BitInstallRules.cs` `MatchesEnvironment`).
- 이렇게 바꾼다.
  - ERP 도우미 쪽에 ERP 전용 고르기 규칙 `ErpInstallRules`를 둔다(`Erp.Core`, netstandard2.0, 이 서버에서 시험).
  - ERP 전용 찾기 부품 `ErpInstallationLocator`를 둔다(`Erp.Helper`, net48).
  - 후보 모으기(등록한 위치 → 환경 파일 `Path` → 도우미 폴더 → 실행 중인 비트 → 레지스트리 → 드라이브마다 `DrBIT50`·`DrBIT` → 프로그램 폴더)는 기존 `InstallationLocator.FindCandidates()`를 그대로 쓴다. 두 번째 후보가 환경 파일 `Path`라서, 비트가 어디에 깔려 있든 그 자리가 후보로 들어온다.
- 기존 `helper/`(`Precheck.Core`·`Precheck.Windows`)는 고치지 않는다. 청구 도우미는 지금처럼 `C:\DrBIT50`만 고른다.

## 구성 요소 / 인터페이스
- `helper-erp/src/Erp.Core/ErpInstallRules.cs` (새 파일, `namespace Erp.Core;`)
  ```csharp
  public static class ErpInstallRules
  {
      /// 환경 파일(BitInstallRules.EnvironmentFile(systemDrive))의 Path = root, Bin = root\EXE (WinPath.Same). 드라이브·폴더 이름은 보지 않는다.
      /// 환경 파일이 없거나(probe.ReadEnvironment == null) Path·Bin이 경로 모양이 아니면 false.
      public static bool MatchesEnvironment(string root, IFileProbe probe, string systemDrive);

      /// 후보를 차례로: root = BitInstallRules.FindRoot(candidate, probe)(UNC·상대·네트워크 드라이브 거절, 필요한 파일 셋, 위로 4단계 — 기존 그대로).
      /// null이거나 이미 본 root면 건너뛰고, MatchesEnvironment면 그 root. 끝까지 없으면 throw new BitException(BitErrors.NotFound).
      public static string Choose(IEnumerable<string?> candidates, IFileProbe probe, string systemDrive = @"C:\");
  }
  ```
  - 기존 `BitInstallRules.MatchesEnvironment`에서 마지막 `WinPath.Same(selected, SupportedRoot)` 한 줄만 뺀 것과 같다. 기존 `Choose`와 같은 모양(빈 인자 검사 `ArgumentNullException`, 본 root는 `OrdinalIgnoreCase`로 한 번만)이다.
  - 쓰는 기존 공개 부품: `BitInstallRules.FindRoot`·`BitInstallRules.EnvironmentFile`·`WinPath.TryNormalize/Same/Combine`·`IFileProbe`·`BitException`·`BitErrors.NotFound`. 기존 코드를 복사해 두 벌로 만들지 않는다.
- `helper-erp/src/Erp.Helper/ErpInstallationLocator.cs` (새 파일, `namespace Erp.Helper;`)
  ```csharp
  public sealed class ErpInstallationLocator : IBitLocator
  {
      private readonly IFileProbe probe = new LocalFileProbe();
      private readonly InstallationLocator candidates;
      public ErpInstallationLocator(string appDirectory, Func<string?> rememberedRoot)
          => candidates = new InstallationLocator(appDirectory, rememberedRoot, probe);
      public string Find() => ErpInstallRules.Choose(candidates.FindCandidates(), probe, NativeEnvironmentGuard.SystemDrive());
  }
  ```
  - 후보는 필요할 때 하나씩 받는다(`FindCandidates`는 `yield`). 앞 후보가 맞으면 뒤(프로세스·레지스트리 훑기)는 하지 않는다. 기존과 같다.
- `helper-erp/src/Erp.Helper/ErpServices.cs`: `Create`의 한 줄만 바뀐다.
  - `var locator = new InstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store));`
  - → `var locator = new ErpInstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store));`
  - 나머지는 그대로다. 주석에 'spec erp-bit-anywhere AC-3801.3'을 더한다.

- `helper-erp/install/install.cmd` (REQ-3802, 한 줄 → 여섯 줄, ASCII만)
  ```bat
  @echo off
  setlocal DisableDelayedExpansion
  "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
  set ERP_SETUP_CODE=%errorlevel%
  if not "%ERP_SETUP_CODE%"=="0" if not "%ERP_SETUP_CODE%"=="2" pause
  exit /b %ERP_SETUP_CODE%
  ```
  - 32비트 명령 창에서는 `System32`가 `SysWOW64`로 바뀌어 보이지만, 그곳에도 같은 PowerShell 5.1이 있다.
  - PowerShell 끝 번호는 바로 다음 줄에서 `ERP_SETUP_CODE`에 담는다. 그 뒤 `if`·`pause`가 `errorlevel`을 바꿔도 마지막 `exit /b`는 PowerShell 번호를 그대로 낸다. 2026-11-23 시험에서 끝에 `exit /b` 없이 `if`로 끝내니 끝 번호가 늘 0이었다.
  - 한 줄 `if … if … pause` 모양이라 `goto`·라벨·괄호 묶음이 없다.
  - 0·2만 멈추지 않는다. 1은 `install.ps1`의 취소·설치 실패와 PowerShell 자체 실패(글 틀림·밖으로 나온 오류·보안 설정이 막음)가 같은 번호라서 멈춘다(마지막 검토, 2026-11-23).
  - 압축 파일 안에서 누르면 윈도우가 `install.cmd` 하나만 임시 폴더(`%TEMP%\Temp1_<zip 이름>\…`)에 꺼낸다. 그래서 옆에 `install.ps1`이 없다. 그때는 PowerShell 오류 글과 '계속하려면 아무 키나 누르십시오'가 남는다. 원래 zip을 찾아 대신 풀어 주는 길은 믿을 수 없어 두지 않는다.
  - 2026-11-23 시험 결과(폴더 `한글 폴더 (1)&b`, PATH = `C:\nowhere`, 입력 없음):

    | `install.ps1` | 끝 번호 | 멈춤 |
    |---|---|---|
    | `exit 0` | 0 | 없음 |
    | `exit 2` | 2 | 없음 |
    | `exit 5` | 5 | 멈춤 |
    | PowerShell 경로 틀림 | 123 | 멈춤 |

## 다른 병원 등록 실패 고침 (REQ-3803~3806, 2026-11-23)
- 등록 차례(기존 `RegisterFlow.Run`): ① 비트 찾기(`Locator.Find`) → ② 접속 글자 읽기·서버 검사·DB 열기(`Connector.Open`) → ③ 비트 로그인 창(`VendorLogin`). 다른 병원 사진은 ③ 전에 '등록하지 못했어요'였으니 ① 또는 ②다. 막힐 수 있는 자리와 고침:

  | 자리 | 지금 | 고침 |
  |---|---|---|
  | ① 필요한 파일 | 통계 프로그램 파일 둘도 요구 → 통계 없는 병원 `E-BIT-NOT-FOUND` | ERP가 부르는 DLL 둘만(REQ-3803) |
  | ① 환경 파일 | 윈도우 드라이브만 봄 | 없을 때만 설치 폴더 드라이브도(AC-3803.3) |
  | ② DLL 불러오기 | '받은 파일' 표시 붙은 비트 DLL → `LoadFrom` 거절 → `E-BIT-DB-FAILED` | 그 두 DLL만 `UnsafeLoadFrom`으로 먼저(REQ-3805) |
  | ② 서버 검사 | 컴퓨터 이름 서버 → `E-BIT-DB-FAILED` | 이름이 병원 안 주소로만 풀리면 받음(REQ-3804) |
  | 도우미 실행·그 밖 | 까닭 없이 '등록하지 못했어요' | 창에 까닭·단계·오류 번호(REQ-3806) |

- `helper-erp/src/Erp.Core/ErpInstallRules.cs` (고침)
  ```csharp
  public static readonly IReadOnlyList<string> RequiredFiles = new[] { @"EXE\BITDataBaseCommon.dll", @"EXE\BITUserLogIn.dll" };
  private const int AncestorLimit = BitInstallRules.AncestorLimit;   // 몸통 글자를 기존과 같게
  /// BitInstallRules.FindRoot와 같은 몸통(TryNormalize → IsNetworkDrive → 파일이면 부모 → DirectoryExists → AncestorLimit까지 위로), 파일 목록만 이 형의 RequiredFiles.
  public static string? FindRoot(string? candidate, IFileProbe probe);
  // MatchesEnvironment: win = EnvironmentFile(systemDrive);
  //   environment = probe.ReadEnvironment(win) ?? (probe.FileExists(win) || 설치 폴더 드라이브 = 윈도우 드라이브 ? null : probe.ReadEnvironment(EnvironmentFile(설치 폴더 드라이브)))
  //   (먼저 읽는다: 시험 가짜 FakeProbe.Environment는 파일을 FileExists에 올리지 않는다. 실제 디스크에서는 FileExists 먼저와 같다)
  // Choose: BitInstallRules.FindRoot → FindRoot 한 곳만 바뀜
  ```
  - 기존 `FindRoot`를 부를 수 없어(파일 목록이 안에 박혀 있다) 몸통을 ERP 쪽에 한 벌 둔다. 시험이 두 몸통을 글자로 견준다 — 기존 규칙이 바뀌면 같이 고친다.
  - 시험 가짜 `FakeProbe`(`helper/tests`, 고치지 않음)의 `Install()`은 옛 파일 셋을 더하므로 ERP 시험이 `EXE\BITUserLogIn.dll`을 `.File(…)`로 더한다. 기존 '통계 파일 빠지면 거절' 시험은 '골라짐'으로 바뀐다.
- `helper-erp/src/Erp.Core/ErpServerRules.cs` (새 파일)
  ```csharp
  public readonly struct ErpLocalNetwork { public ErpLocalNetwork(IPAddress address, int prefixLength); public IPAddress Address { get; } public int PrefixLength { get; } }
  public static class ErpServerRules
  {
      public static bool IsAllowed(string? server, string machineName, Func<string, IReadOnlyList<IPAddress>> resolve, IReadOnlyList<ErpLocalNetwork> localNetworks);
      public static void Require(string? server, string machineName, Func<string, IReadOnlyList<IPAddress>> resolve, IReadOnlyList<ErpLocalNetwork> localNetworks); // 막으면 BitException(BitErrors.DbFailed)
      public static bool IsInside(IPAddress address, IReadOnlyList<ErpLocalNetwork> localNetworks);
  }
  ```
  - 서버 값 나누기(`tcp:` 떼기 → `\`·`,` 앞)는 `PrivateServer.IsAllowed`와 같은 식이다. 풀이 예외는 모두 '막음'이다(예외 글은 버림).
  - 이름으로 붙을 때 SqlClient가 같은 이름을 한 번 더 푼다. 검사와 접속 사이에 DNS 답이 바뀌는 틈은 남는다. 비트 자신도 같은 이름 풀이를 믿고 붙으므로 받아들인다. 숫자 주소로 바꿔 붙이면 SQL Express(TCP 꺼짐)·암호화 인증서 이름 검사가 깨질 수 있어 이름 그대로 붙는다.
- `helper-erp/src/Erp.Helper/ErpVendorPreload.cs` (새 파일)
  ```csharp
  public static class ErpVendorPreload
  {
      public static void Load(string installRoot); // VendorRuntime.Prepare → RequiredFiles마다 Assembly.UnsafeLoadFrom, 그 밖 예외 → BitException(DbFailed)
  }
  ```
  - 그래서 `BITUserLogIn.dll`도 `Create`에서(모든 ERP 명령의 DB 열기 때, 로그인 창 STA 스레드보다 먼저) 불러온다. 불러오기만 하고 로그인 코드는 부르지 않는다. 얼어 있는 `VendorLogin` 전에 ERP가 끼어들 자리는 `Create`뿐이라 받아들인다.
  - 기존 `VendorRuntime.Load`(`LoadFrom`)와 `VendorLogin`은 그대로 쓴다. 같은 경로를 먼저 `UnsafeLoadFrom`으로 불러 두면 뒤의 `LoadFrom`이 그 어셈블리를 돌려준다(2026-11-23 시험). 같은 폴더 의존 DLL은 불러온 DLL 자리에서 찾는다.
  - 다른 길(`VendorRuntime.Resolve`의 `LoadFrom`, 비트 DLL 안의 불러오기)은 .NET 기본 거절이 그대로다. 그 길로 가는 표시 붙은 파일이 있으면 지금처럼 `E-BIT-DB-FAILED`다.
- `helper-erp/src/Erp.Helper/ErpReadOnlyConnection.cs` (새 파일)
  ```csharp
  public static class ErpReadOnlyConnection
  {
      public static ReadOnlyConnectionInfo Create(string installRoot); // ErpStage LOAD → ErpVendorPreload.Load → VendorConnectionString → Harden(…, Environment.MachineName, Dns.GetHostAddresses, 켜진 카드 IPv6 목록)
      public static ReadOnlyConnectionInfo Harden(string sourceConnectionString, string installRoot, string machineName,
          Func<string, IReadOnlyList<IPAddress>> resolve, IReadOnlyList<ErpLocalNetwork> localNetworks); // ErpStage SERVER는 서버 검사 직전
      private static string VendorConnectionString(string installRoot); // 기존 private 몸통과 같음
  }
  ```
  - 켜진 카드 목록: `NetworkInterface.GetAllNetworkInterfaces()` 중 `OperationalStatus.Up`의 `UnicastAddresses`에서 IPv6만, `PrefixLength`와 함께. 읽기 실패면 빈 목록.
  - `ErpBitDb.cs`의 `ErpBitConnector.Open`: `var info = ErpReadOnlyConnection.Create(installPath); ErpStage.Set(ErpStage.Connect); var session = ErpBitDb.Open(info); ErpStage.Set(ErpStage.Login); return session;` (`ErpBitDb` 몸통은 그대로 — 기존 `SqlBitDb`와 글자 견주기 시험이 있다)
- `helper-erp/src/Erp.Helper/ErpStage.cs` (새 파일): 상수 `Find`·`Load`·`Server`·`Connect`·`Login`(값 `"FIND"`…), `Set(string)`, `Current`(`volatile`, 처음 null).
- `ErpInstallationLocator.Find` 첫 줄 `ErpStage.Set(ErpStage.Find);`
- `Program.cs` `Register`: 두 `catch`에서 기록 뒤 `WriteRegisterError(code)` — `Console.OpenStandardOutput()`에 ASCII `code + "\r\n"`(+ `ErpStage.Current`가 있으면 `"STEP-" + 단계 + "\r\n"`), `try { … } catch (Exception) { }`. `Main` 첫 줄의 `Console.SetOut(TextWriter.Null)`은 그대로(다른 글은 계속 안 나감).
- `install.ps1` 5번 부분:
  ```powershell
  $registerOutput = @(); $launchError = $null
  try { $registerOutput = @(& $exePath '--register'); $registerCode = $LASTEXITCODE }
  catch { $registerCode = 2; $launchError = $_.Exception.Message }
  $lines = @($registerOutput | ForEach-Object { "$_".Trim() })
  $errorNumber = @($lines | Where-Object { $_ -cmatch '^E-[A-Z0-9-]+$' }) | Select-Object -Last 1
  $stepName = @($lines | Where-Object { $_ -cmatch '^STEP-[A-Z]+$' }) | Select-Object -Last 1
  ```
  - `default` 가지에서 AC-3806.3 글을 고른다. 끝 번호 계산(`$exitCode`)은 그대로다.

## 위험 (REQ-3803~3806)
- 비트 로그인 창은 기존 `VendorLogin`이 프로그램 이름 `BITStatistics`로 띄운다. 통계 프로그램이 없는 병원(REQ-3803으로 새로 들어옴)에서 비트가 이 이름을 거절하면 로그인이 '취소'처럼 끝나 '등록을 취소했어요'가 나온다. 비트 DLL을 읽지 않고는 확인할 수 없다. 그래서 취소 글에 '직접 취소하지 않았는데…' 한 줄을 더해 사진으로 알 수 있게 한다.
- 서버 이름 검사와 실제 접속 사이 DNS 틈(위). 표시 붙은 파일이 `Resolve` 길로만 갈 때는 여전히 `E-BIT-DB-FAILED`(위).
- 다른 병원 PC에서 아직 해 보지 못했다. 이번 판 창에 단계·오류 번호가 나오므로 다음 사진으로 남은 까닭을 가린다.
- `UnsafeLoadFrom` 효과는 글자 시험으로만 지킨다(표시 붙은 가짜 DLL로 도는 윈도우 빌드 시험은 두지 않았다 — 2026-11-23 손 시험 기록이 근거).

## 데이터 흐름
```
확장 명령 / 설치 때 --register
  → BitServices(locator = ErpInstallationLocator)
  → InstallationLocator.FindCandidates()  (기존, 후보만)
  → ErpInstallRules.Choose  (FindRoot 기존 + 환경 파일 Path·Bin 일치, C:\ 조건 없음)
  → 고른 설치 폴더 → ErpReadOnlyConnection.Create(설치 폴더)  (그 폴더\EXE의 DLL 둘을 먼저 불러 둠 → BITDataBaseCommon.dll로 접속 정보 → 병원 안 서버 검사(이름은 풀어 봄)·예비 서버 거절, 10초)
  → 등록과 같은 병원·설치·서버인지 기존 검사(E-BIT-HOSPITAL-MISMATCH)
```

## 결정과 트레이드오프
- **환경 파일 일치는 남긴다.** 비트 DLL이 읽는 설정(환경 파일)과 도우미가 불러오는 설치가 같아야, 다른 설치의 DLL로 엉뚱한 설정을 읽는 일이 없다. 비트를 옮긴 PC에서 환경 파일이 새 자리를 가리키면 찾는다.
- **네트워크 드라이브·UNC는 계속 막는다.** 다른 컴퓨터의 DLL을 불러 실행하게 되어서다. .NET Framework 4.8은 네트워크 위치의 어셈블리를 `LoadFrom`하면 기본으로 거절하기도 한다. 기존 `FindRoot` 그대로 쓴다.
- **청구 도우미는 그대로 둔다.** 사용자 규칙(ERP 일은 웹앱과 별개)에 따르고, 청구 도우미 새 판도 만들지 않는다. 그래서 같은 PC에서도 청구 도우미는 `C:\DrBIT50`만 찾을 수 있다(범위 밖).
- **판 번호 0.3.0은 그대로다.** 아직 정식 판이 아니어서 지금까지처럼 설치 파일 이름 끝 글자(날짜·순번)로 구별한다. `install.ps1`은 판과 상관없이 덮어쓴다.
- **등록은 다시 하지 않아도 된다.** 이미 `C:\DrBIT50`으로 등록된 PC는 같은 자리를 고르므로 그대로다. 이번 판이 처음 등록하는 다른 위치 PC는 설치 때 등록한다.

## 위험 / 미해결 질문
- 실제로 `C:\DrBIT50`이 아닌 곳에 깔린 비트로는 해 보지 못했다. 이 PC 비트는 `C:\DrBIT50`이다.
  - 확인한 것: 접속 DLL `BITDataBaseCommon.dll`과 `BITEnvironment.dll`에 `C:\DrBIT50` 글자가 없고, 환경 파일은 드라이브 + `\DrBIT50\Environment\…`로 읽는다(2026-11-23, 글자만 훑음).
  - 다른 위치 PC에서 접속이 안 되면 `E-BIT-DB-FAILED`로 멈춘다. 잘못된 DB를 읽는 길은 병원 안 서버 검사(REQ-3804)와 등록 병원 검사가 막는다.
