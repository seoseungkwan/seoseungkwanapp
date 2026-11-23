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

## 데이터 흐름
```
확장 명령 / 설치 때 --register
  → BitServices(locator = ErpInstallationLocator)
  → InstallationLocator.FindCandidates()  (기존, 후보만)
  → ErpInstallRules.Choose  (FindRoot 기존 + 환경 파일 Path·Bin 일치, C:\ 조건 없음)
  → 고른 설치 폴더 → ReadOnlyConnection.Create(설치 폴더)  (기존: 그 폴더\EXE의 BITDataBaseCommon.dll로 접속 정보, 사설 서버 검사, 10초)
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
  - 다른 위치 PC에서 접속이 안 되면 `E-BIT-DB-FAILED`로 멈춘다. 잘못된 DB를 읽는 길은 기존 사설 서버 검사와 등록 병원 검사가 막는다.
