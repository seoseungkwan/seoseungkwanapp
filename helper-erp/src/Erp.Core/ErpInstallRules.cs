using System;
using System.Collections.Generic;
using System.Linq;
using Precheck.Core.Bit;

namespace Erp.Core;

/// <summary>
/// ERP 도우미 비트 설치 고르기(spec erp-bit-anywhere design.md, AC-3801.1·AC-3801.2·AC-3803.1~3). 기존 BitInstallRules.Choose와 같은 모양이고,
/// 마지막 조건 '설치 폴더 = C:\DrBIT50'(BitInstallRules.SupportedRoot)이 없다. 드라이브 글자·폴더 이름은 보지 않고
/// 비트 자기 환경 파일(윈도우 드라이브의 DrBIT50\Environment\DrBIT50Environment.ini, 그 파일이 없을 때만 설치 폴더 드라이브의 것)이 가리키는 로컬 설치만 고른다.
/// 설치 폴더 찾기(FindRoot)는 기존 BitInstallRules.FindRoot와 같은 몸통이고 필요한 파일만 ERP가 부르는 DLL 둘이다(통계 프로그램 파일은 보지 않는다).
/// 기존 BitInstallRules(청구 도우미)는 고치지 않는다.
/// </summary>
public static class ErpInstallRules
{
    /// <summary>설치 폴더에 모두 있어야 하는 파일: ERP 도우미가 불러오는 비트 DLL 둘(접속 정보·비트 로그인 창). AC-3803.1</summary>
    public static readonly IReadOnlyList<string> RequiredFiles = new[] { @"EXE\BITDataBaseCommon.dll", @"EXE\BITUserLogIn.dll" };

    /// <summary>후보 폴더에서 위로 올라가 볼 단계 수(기존과 같다). FindRoot 몸통을 기존과 글자 그대로 두려고 같은 이름으로 둔다.</summary>
    private const int AncestorLimit = BitInstallRules.AncestorLimit;

    /// <summary>
    /// 기존 BitInstallRules.FindRoot와 같은 몸통(AC-3803.1): 후보(폴더·실행 파일 경로)에서 RequiredFiles가 모두 있는 설치 폴더를 찾는다.
    /// 로컬 드라이브 경로가 아니거나·네트워크 드라이브거나·없는 폴더거나·4단계 위까지 없으면 null. 기존 규칙이 바뀌면 같이 고친다(erp-helper.test.ts가 글자로 견준다).
    /// </summary>
    public static string? FindRoot(string? candidate, IFileProbe probe)
    {
        if (probe == null) throw new ArgumentNullException(nameof(probe));
        if (!WinPath.TryNormalize(candidate, out var path)) return null;
        if (probe.IsNetworkDrive(WinPath.DriveRoot(path))) return null;

        string? current = path;
        if (probe.FileExists(path)) current = WinPath.Parent(path);
        if (current == null || !probe.DirectoryExists(current)) return null;

        for (var level = 0; level <= AncestorLimit && current != null; level++)
        {
            var folder = current;
            if (RequiredFiles.All(file => probe.FileExists(WinPath.Combine(folder, file)))) return folder;
            current = WinPath.Parent(folder);
        }
        return null;
    }

    /// <summary>
    /// 환경 파일의 Path = root, Bin = root\EXE(대소문자·끝 구분자 무시). 드라이브·폴더 이름은 보지 않는다.
    /// 환경 파일은 윈도우 드라이브의 것을 먼저 읽는다. 읽지 못했을 때 그 파일이 아예 없고(FileExists false) 설치 폴더가 다른 드라이브면
    /// 설치 폴더 드라이브의 환경 파일을 읽는다(AC-3803.3). 있는데 못 읽으면 넘어가지 않는다. 끝내 없거나 Path·Bin이 로컬 경로 모양이 아니면 false.
    /// </summary>
    public static bool MatchesEnvironment(string root, IFileProbe probe, string systemDrive)
    {
        if (probe == null) throw new ArgumentNullException(nameof(probe));
        if (!WinPath.TryNormalize(root, out var selected)) return false;
        var windowsFile = BitInstallRules.EnvironmentFile(systemDrive);
        var environment = probe.ReadEnvironment(windowsFile);
        if (environment == null && !probe.FileExists(windowsFile))
        {
            var installDrive = WinPath.DriveRoot(selected);
            if (!WinPath.Same(installDrive, WinPath.DriveRoot(windowsFile))) environment = probe.ReadEnvironment(BitInstallRules.EnvironmentFile(installDrive));
        }
        if (environment == null) return false;
        if (!WinPath.TryNormalize(environment.Path, out var configuredRoot) || !WinPath.TryNormalize(environment.Bin, out var configuredBin)) return false;
        return WinPath.Same(selected, configuredRoot) && WinPath.Same(configuredBin, WinPath.Combine(selected, "EXE"));
    }

    /// <summary>
    /// 후보를 차례로 보고 FindRoot(ERP 파일 목록)로 설치 폴더를 찾아, 환경 파일과 맞는 첫 설치 폴더를 고른다.
    /// 못 찾은 후보·이미 본 설치 폴더는 건너뛴다. 끝까지 없으면 BitException(E-BIT-NOT-FOUND).
    /// </summary>
    public static string Choose(IEnumerable<string?> candidates, IFileProbe probe, string systemDrive = @"C:\")
    {
        if (candidates == null) throw new ArgumentNullException(nameof(candidates));
        if (probe == null) throw new ArgumentNullException(nameof(probe));
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var candidate in candidates)
        {
            var root = FindRoot(candidate, probe);
            if (root == null || !seen.Add(root)) continue;
            if (MatchesEnvironment(root, probe, systemDrive)) return root;
        }
        throw new BitException(BitErrors.NotFound);
    }
}
