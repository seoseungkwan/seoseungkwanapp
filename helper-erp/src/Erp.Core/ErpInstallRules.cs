using System;
using System.Collections.Generic;
using Precheck.Core.Bit;

namespace Erp.Core;

/// <summary>
/// ERP 도우미 비트 설치 고르기(spec erp-bit-anywhere design.md, AC-3801.1·AC-3801.2). 기존 BitInstallRules.Choose와 같은 모양이고,
/// 마지막 조건 '설치 폴더 = C:\DrBIT50'(BitInstallRules.SupportedRoot)만 없다. 드라이브 글자·폴더 이름은 보지 않고
/// 비트 자기 환경 파일(윈도우 드라이브의 DrBIT50\Environment\DrBIT50Environment.ini)이 가리키는 로컬 설치만 고른다.
/// 설치 폴더 찾기(필요한 파일 셋·위로 4단계·UNC·상대·네트워크 드라이브 거절)와 환경 파일 위치는 기존 부품을 그대로 부른다.
/// 기존 BitInstallRules(청구 도우미)는 고치지 않는다.
/// </summary>
public static class ErpInstallRules
{
    /// <summary>
    /// 환경 파일(BitInstallRules.EnvironmentFile(systemDrive))의 Path = root, Bin = root\EXE(대소문자·끝 구분자 무시). 드라이브·폴더 이름은 보지 않는다.
    /// 환경 파일이 없거나(읽지 못하거나) Path·Bin이 로컬 경로 모양이 아니면 false.
    /// </summary>
    public static bool MatchesEnvironment(string root, IFileProbe probe, string systemDrive)
    {
        if (probe == null) throw new ArgumentNullException(nameof(probe));
        if (!WinPath.TryNormalize(root, out var selected)) return false;
        var environment = probe.ReadEnvironment(BitInstallRules.EnvironmentFile(systemDrive));
        if (environment == null) return false;
        if (!WinPath.TryNormalize(environment.Path, out var configuredRoot) || !WinPath.TryNormalize(environment.Bin, out var configuredBin)) return false;
        return WinPath.Same(selected, configuredRoot) && WinPath.Same(configuredBin, WinPath.Combine(selected, "EXE"));
    }

    /// <summary>
    /// 후보를 차례로 보고 BitInstallRules.FindRoot로 설치 폴더를 찾아, 환경 파일과 맞는 첫 설치 폴더를 고른다.
    /// 못 찾은 후보·이미 본 설치 폴더는 건너뛴다. 끝까지 없으면 BitException(E-BIT-NOT-FOUND).
    /// </summary>
    public static string Choose(IEnumerable<string?> candidates, IFileProbe probe, string systemDrive = @"C:\")
    {
        if (candidates == null) throw new ArgumentNullException(nameof(candidates));
        if (probe == null) throw new ArgumentNullException(nameof(probe));
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var candidate in candidates)
        {
            var root = BitInstallRules.FindRoot(candidate, probe);
            if (root == null || !seen.Add(root)) continue;
            if (MatchesEnvironment(root, probe, systemDrive)) return root;
        }
        throw new BitException(BitErrors.NotFound);
    }
}
