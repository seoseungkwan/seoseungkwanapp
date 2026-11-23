using System;
using Erp.Core;
using Precheck.Core.Bit;
using Precheck.Windows;

namespace Erp.Helper;

/// <summary>
/// ERP 도우미 비트 설치 찾기(spec erp-bit-anywhere design.md, AC-3801.3). 후보 모으기(등록한 위치 → 환경 파일 Path → 도우미 폴더 →
/// 실행 중인 비트 → 레지스트리 → 드라이브마다 DrBIT50·DrBIT → 프로그램 폴더)는 기존 InstallationLocator.FindCandidates 그대로 쓰고,
/// 고르기만 ERP 규칙 ErpInstallRules.Choose로 한다(설치 폴더 = C:\DrBIT50 조건 없음, 환경 파일 Path·Bin 일치는 그대로).
/// 후보는 필요할 때 하나씩 받는다: 앞 후보가 맞으면 뒤(프로세스·레지스트리 훑기)는 하지 않는다. 기존 InstallationLocator는 고치지 않는다.
/// </summary>
public sealed class ErpInstallationLocator : IBitLocator
{
    private readonly IFileProbe probe = new LocalFileProbe();
    private readonly InstallationLocator candidates;

    /// <param name="appDirectory">도우미 exe 폴더.</param>
    /// <param name="rememberedRoot">등록해 둔 설치 위치. 없으면 null.</param>
    public ErpInstallationLocator(string appDirectory, Func<string?> rememberedRoot)
        => candidates = new InstallationLocator(appDirectory, rememberedRoot, probe);

    public string Find() => ErpInstallRules.Choose(candidates.FindCandidates(), probe, NativeEnvironmentGuard.SystemDrive());
}
